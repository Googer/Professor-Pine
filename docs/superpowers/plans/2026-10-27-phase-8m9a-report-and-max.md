# Phase 8M-9A: The Report Button, Max Battles and Power Spots on the Map: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the first of the two 8M-9 plans of the web polish: one always-visible Report button that leads through what, where and the slash command's own form; max battles drawn, listed and reported on the map; the game's icons on the Report menu; the Gyms layer off by default. 8M-9B adds the reports at stops (field research and Team GO Rocket) to the same menu.

- **Task 1:** max battles drawn at their Power Spot or pin as a raid is (one marker for both, `markerFacts`; Dynamax and Gigantamax rings, `--tier-dynamax`, `--tier-gigantamax`), keyed `max:<id>`, their popup and phone card their post (`maxPopup` until it loads), their lines in the list's "Raids and max battles".
- **Task 2:** a Power Spot's popup with "Report max battle here" and the max battle form over `GET /api/max-options` and `POST /api/maxes` (bosses by tier, the ending-soon question, `needs` and `regions`, the lists asked again after a refusal, `submitMax`); a spot with a battle drawn as the battle.
- **Task 3:** the Report button (the desktop header; a Leaflet control and a line in the list on a phone), step 1's menu with the icons (`report-icons.ts`, pinned pogo_assets addresses, Pine's own SVG), `ReportFlow`; the Gyms layer off by default.
- **Task 4:** step 2 per kind (the fitting places ringed and the rest dimmed, the nearest five listed; a pin and "Report here" for an unlisted power spot or a spawn; the raids drawn while a raid's gyms are picked) and the hand-off to step 3 (the gym's or spot's form, the standing raid or battle, the train's region, the meetup's own picking).
- **Task 5:** docs (`web.md`, `MapMax`) and the staging checklist `2026-10-27-phase-8m9a-staging.md`.

**Tech stack:** TypeScript 6.0, Node 24, Leaflet, esbuild, Fastify and Vitest. No new dependency, no server route, no migration, no setting, no command change (no deploy needed); the CSP is unchanged.

**Spec:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` (approved by Matt 2026-10-25: "Reporting", "Markers", "The list", the deferred 8X-5 features) and the brief `.superpowers/sdd/2026-10-27-phase-8m9a-report-and-max/design.md` (git-ignored) with its builder check's rulings A1–A11, `proto-review-1-findings.md` and `progress.md`.

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto-8m9a` (tip `7ce418a0`), one commit per task, on typescript-migration 90a48189. Each commit typechecks and passes its tests; on the tip the full check passes (10,289 tests), the build passes and the database suite passes (611 tests).

**Reviews:**

- **The brief:** an Opus builder check (no `--max` color; how max battles join the raid code; the re-ask has nothing to act on; Power Spots load only from zoom 16; where the button and forms go), ruled A1–A11 by the controller.
- **The prototype:** an Opus review: ready after fixes (2 Important: a double tap in step 2 opened and closed a form, the Report flow untested; 8 Minor); fix round 1 folded in.
- **Fix round 1:** a scoped re-review (5 Minor: a stale fallback popup, the step-2 box losing focus, the wrong field focused, "Zoom in" during the flight, Escape with the layers sheet open); fix round 2 folded in.
- **Fix round 2:** a scoped re-review (1 Minor: the parties not redrawn when the step-3 party opens or closes); fix round 3 folded in, read by the controller.

**Conventions:** read `CLAUDE.md` and `docs/architecture/web.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck (root and `src/web/client`) and its own test files. The full check, the build and the database suite run once on the tip. Work in `../Professor-Pine-web` on `web-polish`; never commit in the main checkout.

## Review Focus

- A form opened from step 3 survives the poll's redraws and the hold's hand-over from step 2.
- Cancel, Back and Escape leave the map as it was: forced places, dimming, the pin, the raids layer, "New train", the focus.
- The max form shows the server's words for every refusal and keeps the member's pick after asking for its lists again.
- A Power Spot with a battle is drawn as the battle, and back as a spot once the battle ends.
- Nothing scrolls sideways at 360 px; the desktop header stays one row from 768 px.

---


### Task 1: 8M-9A task 1: max battles drawn, their popups and their lines

Prototype commit: `0384711152288a699cf640e2a86f5125c02cffbc`

A max battle is drawn at its Power Spot or pin as a raid is: the boss in a
ring of Dynamax's or Gigantamax's color (--tier-dynamax, --tier-gigantamax,
light and dark), the time badge, the green count going, dimmed in its last
five minutes, all by the raids' own marker over markerFacts. It is under the
raids' layer, keyed max:<id> (showsParty, partiesAtKey); its popup and phone
card are its post, its summary (maxPopup) until the post comes. The list
puts max battles in the raids' group, "Raids and max battles", named by
their post's title and sorted Soonest by their end. A train's ring at a
Power Spot with a battle goes round the battle's circle.

**Files:**

```
 src/web/client/layer-registry.ts   |  2 +-
 src/web/client/map.css             |  9 +++++++++
 src/web/client/parties.test.ts     | 83 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/parties.ts          | 46 ++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/party-layer.ts      | 92 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------------------------------
 src/web/client/post-forms.test.ts  |  8 ++++++++
 src/web/client/post-forms.ts       |  5 ++---
 src/web/client/raid-marker.test.ts | 54 +++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/raid-marker.ts      | 91 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++------------------
 src/web/client/theme.css           |  5 +++++
 src/web/client/what-is-on.test.ts  | 58 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/what-is-on.ts       | 30 ++++++++++++++++++++++++------
 src/web/raid-marker-tiers.test.ts  | 17 ++++++++++++++++-
 13 files changed, 437 insertions(+), 63 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/parties.test.ts src/web/client/post-forms.test.ts src/web/client/raid-marker.test.ts src/web/client/what-is-on.test.ts src/web/raid-marker-tiers.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 0384711152288a699cf640e2a86f5125c02cffbc -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m9a-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-9A task 1: max battles drawn, their popups and their lines`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/layer-registry.ts b/src/web/client/layer-registry.ts
index eee210607fe4a757d466e5d4191c4ecca95f8f93..3cf41ef374840246326f532f1c5a3230c5b323f8 100644
--- a/src/web/client/layer-registry.ts
+++ b/src/web/client/layer-registry.ts
@@ -26,7 +26,7 @@ export interface LayerSpec {
 
 /** The map's layers in the order the row and the sheet show them. */
 export const MAP_LAYERS: readonly LayerSpec[] = [
-  { id: 'raids', name: 'Raids', on: true, kind: 'live', hint: 'Bosses and eggs' },
+  { id: 'raids', name: 'Raids', on: true, kind: 'live', hint: 'Bosses, eggs and max battles' },
   { id: 'trains', name: 'Trains', on: true, kind: 'live' },
   { id: 'meetups', name: 'Meetups', on: true, kind: 'live' },
   { id: 'spawns', name: 'Wild spawns', on: false, kind: 'background', waits: true },
diff --git a/src/web/client/map.css b/src/web/client/map.css
index e294a21f676d3a48287c466332e0b49503fff354..f062d454bdba52d4aff45c15c9b63a8feb93d094 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1058,6 +1058,15 @@ path.highlighted {
   border-color: var(--tier-shadow);
 }
 
+/* A max battle's marker (plan 8M-9A): the raids' circle, ringed by Dynamax or Gigantamax. */
+.raid-marker.tier-dynamax .ring {
+  border-color: var(--tier-dynamax);
+}
+
+.raid-marker.tier-gigantamax .ring {
+  border-color: var(--tier-gigantamax);
+}
+
 /* The list of the things at one place (plan 8M-7): a choice per thing. */
 .place-list .choices {
   display: flex;
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index 88bc08415d1ddc653c98a37c472eb4ccaa065cf7..dbbcb0f34fca864b593482a21b643ced54e9da03 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -1,12 +1,21 @@
 import { describe, expect, it } from 'vitest';
-import type { MapAttendance, MapMeetup, MapRaid, MapTrain } from '../../domain/web/party-data.js';
+import type {
+  MapAttendance,
+  MapMax,
+  MapMeetup,
+  MapRaid,
+  MapTrain,
+  PartiesView,
+} from '../../domain/web/party-data.js';
 import {
   clockTime,
   countdown,
   gymPicture,
   gymRaidsPopup,
+  maxPopup,
   meetupItem,
   meetupPopup,
+  partiesAtKey,
   Poller,
   PRESS_FAILED,
   pressLabel,
@@ -151,6 +160,78 @@ describe('pressLabel', () => {
   });
 });
 
+const max = (more: Partial<MapMax> = {}): MapMax => ({
+  kind: 'max',
+  id: 'x1',
+  spotId: 'spot-1',
+  picture: null,
+  level: 'D2',
+  tier: 'Dynamax 2★',
+  boss: 'Machamp',
+  title: 'Dynamax Machamp (2★)',
+  endTime: NOW + 40 * MINUTE,
+  link: LINK,
+  place: { name: 'Lake Gazebo', lat: 40.4406, lon: -79.9, address: '1 Lake Dr' },
+  attendance: attendance({ actions: [{ action: 'join' }, { action: 'done' }] }),
+  postKey: null,
+  ...more,
+});
+
+// Plan 8M-9A (A2): until its post comes, a max battle's popup is the map's own summary.
+describe('maxPopup', () => {
+  it('shows the spot with its way there, the battle, its end with a countdown, counts and buttons', () => {
+    const popup = maxPopup(max(), context);
+    expect(texts(popup)).toEqual([
+      'Lake Gazebo',
+      '1 Lake Dr',
+      'Directions',
+      'Dynamax Machamp (2★)',
+      'Ends at 2:40 PM',
+      'in 40 min',
+      'Interested 1 · Coming 3 · Here 2',
+      'Join',
+      'Done',
+      'Open the post',
+    ]);
+    expect(popup.className).toBe('party-popup max');
+    expect(tagged(popup, 'button').map((button) => button.attributes?.['data-party'])).toEqual([
+      'x1',
+      'x1',
+    ]);
+    // A pin battle: its place's words, no address line.
+    const pin = maxPopup(
+      max({
+        spotId: null,
+        place: { name: 'Unlisted power spot', lat: 40.5, lon: -80, address: null },
+      }),
+      context,
+    );
+    expect(texts(pin).slice(0, 3)).toEqual([
+      'Unlisted power spot',
+      'Directions',
+      'Dynamax Machamp (2★)',
+    ]);
+  });
+});
+
+// Plan 8M-9A (A2): every popup's key names the parties it shows, max battles by `max:<id>`.
+describe('partiesAtKey', () => {
+  it('finds the raids of a gym, a train by its ring or line, a meetup, a max battle', () => {
+    const view: PartiesView = {
+      zone: ZONE,
+      readOnly: false,
+      raids: [raid(), raid({ id: 'r2', gymId: 2 })],
+      maxes: [max(), max({ id: 'x2' })],
+      trains: [],
+      meetups: [],
+    };
+    expect(partiesAtKey(view, 'gym:1').map((party) => party.id)).toEqual(['r1']);
+    expect(partiesAtKey(view, 'max:x2').map((party) => party.id)).toEqual(['x2']);
+    expect(partiesAtKey(view, 'max:x9')).toEqual([]);
+    expect(partiesAtKey(undefined, 'max:x1')).toEqual([]);
+  });
+});
+
 describe('raidPopup', () => {
   it('shows the gym, the raid, its time with a countdown, the counts, and the buttons', () => {
     const popup = raidPopup(raid(), context);
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index e9b025426e1690a458c97758a922110221d48fdd..d8fe36bbf0ad442e6e6b206f22b5b483fa8a46e3 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -1,10 +1,13 @@
 import type {
   MapAttendance,
+  MapMax,
   MapMeetup,
+  MapParty,
   MapPress,
   MapRaid,
   MapStatus,
   MapTrain,
+  PartiesView,
 } from '../../domain/web/party-data.js';
 import { stageAt } from '../../domain/party/raid-stage.js';
 import { clockTime } from '../../domain/web/clock.js';
@@ -250,6 +253,49 @@ export function raidPopup(raid: MapRaid, context: ShowContext): PageNode {
   };
 }
 
+/**
+ * A max battle's popup until its post comes (plan 8M-9A, A2: the map's own summary, as a raid's):
+ * its Power Spot (or "Unlisted power spot") with the way there, what it is in its post's title,
+ * its end with a countdown (a max battle has no egg), who comes, the buttons, and the post.
+ */
+export function maxPopup(max: MapMax, context: ShowContext): PageNode {
+  return {
+    tag: 'div',
+    className: 'party-popup max',
+    children: [
+      { tag: 'strong', className: 'name', text: max.place.name },
+      ...wayTo(max.place),
+      div('tier', max.title),
+      timeLine('time', 'Ends at', max.endTime, context),
+      ...attendanceNodes(max.id, max.attendance),
+      ...postLink(max.link),
+    ],
+  };
+}
+
+/**
+ * The parties a popup's or card's key shows (`gym:<id>`, `train:<id>`, `route:<id>`,
+ * `meetup:<id>`, `max:<id>`), in the list's order: whose posts are asked for ahead as the pointer
+ * comes over it (review 8A-3).
+ */
+export function partiesAtKey(view: PartiesView | undefined, key: string): MapParty[] {
+  if (view === undefined) return [];
+  const [kind, id] = key.split(':');
+  switch (kind) {
+    case 'gym':
+      return view.raids.filter((raid) => String(raid.gymId) === id);
+    case 'max':
+      return view.maxes.filter((one) => one.id === id);
+    case 'train':
+    case 'route':
+      return view.trains.filter((one) => one.id === id);
+    case 'meetup':
+      return view.meetups.filter((one) => one.id === id);
+    default:
+      return [];
+  }
+}
+
 /** How to get to a gym, as its own popup says it: its address line and "Directions". */
 function wayTo(gym: Pick<MapGym, 'lat' | 'lon' | 'address'> | undefined): PageNode[] {
   return gym ? [...addressLine(gym), directionsLink(gym)] : [];
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index b41a727eb5c7df87279779cfcd3ac9284b640fe1..338df2e55b9c43d1f61b904f721700aa7482489d 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -10,7 +10,9 @@ import {
   trainPlaces,
   gymOfStop,
   gymRaidsPopup,
+  maxPopup,
   meetupPopup,
+  partiesAtKey,
   Poller,
   pressParty,
   raidPopup,
@@ -53,13 +55,7 @@ import { WhatIsOn } from './list-ui.js';
 import { STREET_ZOOM, type LatLon, type ViewStorage } from './view.js';
 import { ListRefresh, listLines, paneShows } from './what-is-on.js';
 import { placeListNode, sharedPlace, startWords, type PlacedThing } from './shared-place.js';
-import type {
-  MapMeetup,
-  MapParty,
-  MapRaid,
-  MapTrain,
-  PostView,
-} from '../../domain/web/party-data.js';
+import type { MapParty, MapRaid, PostView } from '../../domain/web/party-data.js';
 import {
   ALL_RAIDS_HERE,
   gymWithRaidBoxes,
@@ -138,6 +134,12 @@ export function trainMarker(
 /** Makes the elements of a node; a click on a button in them presses it. */
 type Draw = (node: PageNode) => HTMLElement;
 
+/**
+ * The layers whose things are drawn at a place, which a tap lists where they share it (plan 8M-7):
+ * max battles are the raids' (plan 8M-9A); reports at stops join with plan 8M-9B.
+ */
+export type PlacedLayer = 'raids' | 'trains' | 'meetups';
+
 /**
  * A raid chosen in the list of a gym's raids (`data-show-raid`; empty: "← All raids here"), in
  * the popup or the phone card that shows it: the choice is kept by gym and the card or popup
@@ -426,7 +428,7 @@ export function showParties(
         shown.options.autoPan = autoPan;
       }
       // A line of the list shown with its popup draws it anew (review 8A-9).
-      for (const kind of ['raid', 'train', 'meetup']) whatIsOn.redrawLine(`${kind}:${id}`);
+      for (const kind of ['raid', 'max', 'train', 'meetup']) whatIsOn.redrawLine(`${kind}:${id}`);
       const onCard = card.key;
       if (onCard !== undefined && showsIt(onCard)) card.refresh(contents.get(onCard));
     },
@@ -470,7 +472,7 @@ export function showParties(
    * yet) the map's own summary as before (`fallback`).
    */
   const partyPopup = (
-    party: MapRaid | MapTrain | MapMeetup,
+    party: MapParty,
     fallback: () => PageNode,
     extras: readonly PageNode[] = [],
   ): PageNode => {
@@ -478,20 +480,9 @@ export function showParties(
     return shown ? postPopup(shown, party, placedFor(party), extras) : fallback();
   };
 
-  /**
-   * The parties a popup's key shows (`gym:<id>`, `train:<id>`, `route:<id>`, `meetup:<id>`), whose
-   * posts are asked for ahead when the pointer comes over it or presses it (review 8A-3).
-   */
-  const partiesOf = (key: string): MapParty[] => {
-    const [kind, id] = key.split(':');
-    if (kind === 'gym') return view?.raids.filter((raid) => String(raid.gymId) === id) ?? [];
-    if (kind === 'train' || kind === 'route')
-      return view?.trains.filter((one) => one.id === id) ?? [];
-    if (kind === 'meetup') return view?.meetups.filter((one) => one.id === id) ?? [];
-    return [];
-  };
+  /** Asks ahead for the posts of the parties a popup's key shows (`partiesAtKey`, review 8A-3). */
   const prefetchKey = (key: string): void => {
-    const shown = partiesOf(key);
+    const shown = partiesAtKey(view, key);
     postViews.prefetch(shown, shown.length);
   };
 
@@ -805,7 +796,7 @@ export function showParties(
    * The things drawn at a place in the last draw, by the layer that shows them (plan 8M-7): a tap
    * on one that shares its place with others opens the list of them (`sharedPlace`).
    */
-  let placed: Array<PlacedThing & { layer: 'raids' | 'trains' | 'meetups' }> = [];
+  let placed: Array<PlacedThing & { layer: PlacedLayer }> = [];
   /** The gyms whose raids are drawn in place of their dot. */
   let raidGyms: number[] = [];
   /** The raids' size drawn last: a zoom into another draws them anew (Matt, 2026-10-25). */
@@ -892,7 +883,11 @@ export function showParties(
       // As the side panel showed it before (plan 8M-3 to 8M-6): its popup, with its actions.
       const ctx = context();
       let node: PageNode | undefined;
-      if (line.kind === 'raids') {
+      if (line.key.startsWith('max:')) {
+        // A max battle's line (plan 8M-9A) in the raids' group: its post, else its summary.
+        const max = view?.maxes.find((one) => one.id === line.id);
+        if (max) node = partyPopup(max, () => maxPopup(max, ctx));
+      } else if (line.kind === 'raids') {
         const raid = view?.raids.find((one) => one.id === line.id);
         if (raid) node = partyPopup(raid, () => raidPopup(raid, ctx));
       } else if (line.kind === 'trains') {
@@ -987,6 +982,45 @@ export function showParties(
         time: raidBadge(lead, now, readerZone()),
       });
     }
+    // Max battles (plan 8M-9A, A2): at their Power Spot or pin, drawn as a raid is (the boss in a
+    // ring of Dynamax's or Gigantamax's color, the time badge, the count), under the raids'
+    // layer; one marker each, keyed `max:<id>`; in route mode a battle at a Power Spot is that
+    // spot to add as a stop (the spot's own dot is not drawn under it).
+    for (const max of next.maxes) {
+      const key = `max:${max.id}`;
+      const marker: L.Marker = raidsMarker(
+        max.place,
+        raidIcon(renderNode(raidMarkerNode(max, now, readerZone(), size), document), circle),
+        max.title,
+        (made) => withPopup(made, key, () => partyPopup(max, () => maxPopup(max, context()))),
+        () =>
+          max.spotId !== null && trainForms.spotClicked({ id: max.spotId, title: max.place.name }),
+        () => {
+          openAt(key, marker);
+        },
+      ).addTo(groups.raids);
+      placed.push({
+        key,
+        layer: 'raids',
+        gymId: null,
+        lat: max.place.lat,
+        lon: max.place.lon,
+        picture: max.picture,
+        name: max.title,
+        time: raidBadge(max, now, readerZone()),
+      });
+    }
+    /** A battle's circle drawn at a stop of a train (a Power Spot, `w<id>`): its ring goes round it. */
+    const battleSpots = new Set(
+      registry.isOn('raids')
+        ? next.maxes.flatMap((max) => (max.spotId === null ? [] : [max.spotId]))
+        : [],
+    );
+    const circleAtStop = (stop: string | undefined): number | undefined => {
+      if (stop?.startsWith('w') === true)
+        return battleSpots.has(stop.slice(1)) ? circle : undefined;
+      return raidAt(gymOfStop(stop) ?? undefined);
+    };
     // The train being routed is left to route mode, which draws its stops as they are edited.
     // While a train is routed or a meetup's place picked, the trains' and meetups' lines and
     // markers let clicks through to the gyms and the map.
@@ -1057,12 +1091,8 @@ export function showParties(
             interactive,
             theme().colours.train,
             rings,
-            ringSizes(
-              raidAt(
-                gymOfStop(train.stop === null ? train.route[0] : train.route[train.stop]) ??
-                  undefined,
-              ),
-            ).train,
+            ringSizes(circleAtStop(train.stop === null ? train.route[0] : train.route[train.stop]))
+              .train,
           ),
           key,
           popup,
@@ -1096,7 +1126,7 @@ export function showParties(
     // asked for ahead, at most `PREFETCH_POSTS` a list (review 8A-3), so that a popup that opens
     // has its post.
     const bounds = map.getBounds();
-    const all: MapParty[] = [...next.raids, ...next.trains, ...next.meetups];
+    const all: MapParty[] = [...next.raids, ...next.maxes, ...next.trains, ...next.meetups];
     const inView = (party: MapParty): boolean => {
       const at = placeOf(party);
       return at !== undefined && bounds.contains([at.lat, at.lon]);
diff --git a/src/web/client/post-forms.test.ts b/src/web/client/post-forms.test.ts
index ace0d0ed3f8d99358fdec3fa16f40eb0b0522d94..308e67ec71889baa54a88fab0ce11b7ba20ce8b7 100644
--- a/src/web/client/post-forms.test.ts
+++ b/src/web/client/post-forms.test.ts
@@ -282,6 +282,14 @@ describe('which popup or card shows a party (review W-6)', () => {
     expect(showsParty('meetup:t1', train)).toBe(false);
     expect(showsParty('meetup:m1', { kind: 'meetup', id: 'm1' })).toBe(true);
   });
+
+  // Plan 8M-9A (A2): a max battle's marker, at a Power Spot or a pin, is its own.
+  it('knows a max battle by its own key, wherever it is', () => {
+    const max = { kind: 'max', id: 'x1' } as const;
+    expect(showsParty('max:x1', max)).toBe(true);
+    expect(showsParty('max:x2', max)).toBe(false);
+    expect(showsParty('gym:x1', max)).toBe(false);
+  });
 });
 
 describe('sendPostForm', () => {
diff --git a/src/web/client/post-forms.ts b/src/web/client/post-forms.ts
index 031c84a4fc4cdfc661019d38cb2e6fa4fb3c9aa1..eeee8e8f101879c7f2a6e022e8f7207701256abd 100644
--- a/src/web/client/post-forms.ts
+++ b/src/web/client/post-forms.ts
@@ -327,7 +327,7 @@ export function formStep(
 /**
  * Whether the popup or card under `key` shows the party (review W-6): a raid's is its gym's
  * (`gym:<id>`), a train's its ring's or its line's (`train:<id>`, `route:<id>`), a meetup's its
- * own (`meetup:<id>`).
+ * own (`meetup:<id>`), a max battle's its own (`max:<id>`, plan 8M-9A), at a Power Spot or a pin.
  */
 export function showsParty(
   key: string,
@@ -341,8 +341,7 @@ export function showsParty(
     case 'meetup':
       return key === `meetup:${party.id}`;
     case 'max':
-      // Not drawn on the map before plan 8M-9.
-      return false;
+      return key === `max:${party.id}`;
   }
 }
 
diff --git a/src/web/client/raid-marker.test.ts b/src/web/client/raid-marker.test.ts
index f2ec9aadd3835de6a8f385d728f7267727c9e65b..26cf1f2e03782a50c8dcbcf4d20f568a057a620e 100644
--- a/src/web/client/raid-marker.test.ts
+++ b/src/web/client/raid-marker.test.ts
@@ -1,9 +1,11 @@
 import { describe, expect, it } from 'vitest';
-import type { MapAttendance, MapRaid } from '../../domain/web/party-data.js';
+import type { MapAttendance, MapMax, MapRaid } from '../../domain/web/party-data.js';
 import {
   badgeFor,
   badgeWords,
   isDimmed,
+  markerFacts,
+  maxRing,
   raidBadge,
   raidMarkerNode,
   markerNow,
@@ -186,3 +188,53 @@ describe("a raid's marker (plan 8M-7)", () => {
     expect(JSON.stringify(last)).not.toContain('"img"');
   });
 });
+
+const max = (more: Partial<MapMax> = {}): MapMax => ({
+  kind: 'max',
+  id: 'x1',
+  spotId: 'spot-1',
+  picture: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm68.icon.png',
+  level: 'D2',
+  tier: 'Dynamax 2★',
+  boss: 'Machamp',
+  title: 'Dynamax Machamp (2★)',
+  endTime: NOW + 40 * MINUTE,
+  link: 'https://discord.com/channels/1/9',
+  place: { name: 'Lake Gazebo', lat: 40.44, lon: -79.95, address: null },
+  attendance: attendance([{ id: 'A', interested: 0, coming: 2, present: 1 }], 3),
+  postKey: null,
+  ...more,
+});
+
+// Plan 8M-9A (A1, A2): a max battle is drawn as a raid is, from the same marker.
+describe("a max battle's marker (plan 8M-9A)", () => {
+  it('rings the boss in the color of Dynamax or Gigantamax, with its time left and count', () => {
+    const node = raidMarkerNode(max(), NOW, ZONE);
+    expect(node.className).toBe('raid-marker tier-dynamax');
+    expect(texts(node)).toEqual(['40m', '3']);
+    // No egg and no hatch: what the page keeps current is its end alone.
+    expect(node.attributes).toEqual({
+      'data-stage': 'hatched',
+      'data-end': String(NOW + 40 * MINUTE),
+    });
+    expect(raidMarkerNode(max({ level: 'G' }), NOW, ZONE).className).toBe(
+      'raid-marker tier-gigantamax',
+    );
+    expect(maxRing('D5')).toBe('dynamax');
+    expect(maxRing('G')).toBe('gigantamax');
+  });
+
+  it('is dimmed in its last five minutes, by the rule raids are', () => {
+    const soon = max({ endTime: NOW + 4 * MINUTE });
+    expect(raidMarkerNode(soon, NOW, ZONE).className).toBe('raid-marker tier-dynamax dim');
+    expect(raidBadge(soon, NOW, ZONE)).toBe('4m');
+    expect(markerFacts(soon)).toEqual({
+      picture: soon.picture,
+      ring: 'dynamax',
+      stage: 'hatched',
+      hatchTime: null,
+      endTime: NOW + 4 * MINUTE,
+      going: 3,
+    });
+  });
+});
diff --git a/src/web/client/raid-marker.ts b/src/web/client/raid-marker.ts
index 01be7340e4be35b532f01711d36704ae011e2388..894e7860e592eaed9cc946d8310f6874ec6957d1 100644
--- a/src/web/client/raid-marker.ts
+++ b/src/web/client/raid-marker.ts
@@ -1,7 +1,7 @@
 import { stageAt } from '../../domain/party/raid-stage.js';
 import { endsSoon } from '../../domain/time/ending-soon.js';
 import { clockTime } from '../../domain/web/clock.js';
-import type { MapRaid, MapTierGroup } from '../../domain/web/party-data.js';
+import type { MapMax, MapMaxTier, MapRaid, MapTierGroup } from '../../domain/web/party-data.js';
 import type { PageNode } from './popup.js';
 
 /**
@@ -10,7 +10,9 @@ import type { PageNode } from './popup.js';
  * tier's color (a named value of `theme.css` per tier group, `tierColour`), a time badge under it
  * ("12m" while it runs, "hatches 2:40" before), and a green count of those going when above
  * zero; in its last minutes it is dimmed. Built as a tree of nodes (`renderNode`), the page
- * keeping the badge and the dimming current (`data-stage`, `data-hatch`, `data-end`).
+ * keeping the badge and the dimming current (`data-stage`, `data-hatch`, `data-end`). A max battle
+ * (plan 8M-9A) is drawn by the same marker at its Power Spot or pin, ringed in Dynamax's or
+ * Gigantamax's color, read by its end alone (`markerFacts`).
  *
  * Every fact is the domain's, as the Discord side has it (one source for every fact, Matt
  * 2026-10-25): the tier's group and the going count come computed with the list
@@ -20,11 +22,59 @@ import type { PageNode } from './popup.js';
 
 const MINUTE = 60_000;
 
-/** The ring's color: the named value of `theme.css` of the tier's group (`raidTierGroup`). */
-export function tierColour(group: MapTierGroup): string {
+/** The ring of a max battle (plan 8M-9A, A1): Dynamax's or Gigantamax's color. */
+export type MaxRing = 'dynamax' | 'gigantamax';
+
+/** The ring of a max battle by its tier (`MapMax.level`): `G` is Gigantamax, the rest Dynamax. */
+export function maxRing(level: MapMaxTier): MaxRing {
+  return level === 'G' ? 'gigantamax' : 'dynamax';
+}
+
+/**
+ * The ring's color: the named value of `theme.css` of the tier's group (`raidTierGroup`), or of a
+ * max battle's (`maxRing`).
+ */
+export function tierColour(group: MapTierGroup | MaxRing): string {
   return `--tier-${group}`;
 }
 
+/**
+ * What a marker is drawn from (plan 8M-9A, A2): its picture, its ring (`tier-<ring>` of
+ * `map.css`), egg or hatched as the list said it, its hatch and end, how many are going. A raid's
+ * are its own; a max battle has no egg and no hatch: `hatched` without a hatch time, so that the
+ * badge, the dimming and `markerNow` read it by its end alone, by the rules a raid is read by.
+ */
+export interface MarkerFacts {
+  picture: string | null;
+  ring: MapTierGroup | MaxRing;
+  stage: MapRaid['stage'];
+  hatchTime: number | null;
+  endTime: number | null;
+  going: number;
+}
+
+/** A raid's or a max battle's marker facts. */
+export function markerFacts(party: MapRaid | MapMax): MarkerFacts {
+  if (party.kind === 'max') {
+    return {
+      picture: party.picture,
+      ring: maxRing(party.level),
+      stage: 'hatched',
+      hatchTime: null,
+      endTime: party.endTime,
+      going: party.attendance.going,
+    };
+  }
+  return {
+    picture: party.picture,
+    ring: party.tierGroup,
+    stage: party.stage,
+    hatchTime: party.hatchTime,
+    endTime: party.endTime,
+    going: party.attendance.going,
+  };
+}
+
 /**
  * The raid a gym's one marker is drawn by (fix round 1): the first with a picture, else the first;
  * every fact of the marker (picture, ring, badge, count) is this raid's.
@@ -136,28 +186,33 @@ export function badgeFor(
   return endTime === null ? 'hatched' : badgeWords('end', endTime, now, zone);
 }
 
-/** The badge under a raid's marker. */
-export function raidBadge(raid: MapRaid, now: number, zone: string): string {
-  return badgeFor(raid.stage, raid.hatchTime, raid.endTime, now, zone);
+/** The badge under a raid's or a max battle's marker. */
+export function raidBadge(party: MapRaid | MapMax, now: number, zone: string): string {
+  const facts = markerFacts(party);
+  return badgeFor(facts.stage, facts.hatchTime, facts.endTime, now, zone);
 }
 
-/** The marker of a raid as a tree of nodes. */
+/**
+ * The marker of a raid or a max battle (plan 8M-9A: one marker for both, by `markerFacts`) as a
+ * tree of nodes.
+ */
 export function raidMarkerNode(
-  raid: MapRaid,
+  party: MapRaid | MapMax,
   now: number,
   zone: string,
   size: MarkerSize = 'full',
 ): PageNode {
-  const { going } = raid.attendance;
+  const facts = markerFacts(party);
+  const { going } = facts;
   const times = {
-    'data-stage': raid.stage,
-    ...(raid.hatchTime === null ? {} : { 'data-hatch': String(raid.hatchTime) }),
-    ...(raid.endTime === null ? {} : { 'data-end': String(raid.endTime) }),
+    'data-stage': facts.stage,
+    ...(facts.hatchTime === null ? {} : { 'data-hatch': String(facts.hatchTime) }),
+    ...(facts.endTime === null ? {} : { 'data-end': String(facts.endTime) }),
   };
   return {
     tag: 'div',
-    className: `raid-marker tier-${raid.tierGroup}${size === 'full' ? '' : ` size-${size}`}${
-      isDimmed(raid, now) ? ' dim' : ''
+    className: `raid-marker tier-${facts.ring}${size === 'full' ? '' : ` size-${size}`}${
+      isDimmed(facts, now) ? ' dim' : ''
     }`,
     attributes: times,
     children: [
@@ -165,13 +220,13 @@ export function raidMarkerNode(
         tag: 'span',
         className: 'ring',
         children:
-          raid.picture === null
+          facts.picture === null
             ? []
-            : [{ tag: 'img', attributes: { src: raid.picture, alt: '', draggable: 'false' } }],
+            : [{ tag: 'img', attributes: { src: facts.picture, alt: '', draggable: 'false' } }],
       },
       // The badge from zoom 15, the count from 14 (`markerSize`).
       ...(size === 'full'
-        ? [{ tag: 'span', className: 'badge', text: raidBadge(raid, now, zone) }]
+        ? [{ tag: 'span', className: 'badge', text: raidBadge(party, now, zone) }]
         : []),
       ...(going > 0 && size !== 'small'
         ? [{ tag: 'span', className: 'going', text: String(going) }]
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index 6588379d2126d13db7bbc5885014bdcca556d15e..7f8a58b5f388ace2088c126235979fbbebef4e66 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -97,6 +97,9 @@
   --tier-mega: #16a085;
   --tier-elite: #b9770e;
   --tier-shadow: #4a235a;
+  /* A max battle's ring (plan 8M-9A): Dynamax and Gigantamax. */
+  --tier-dynamax: #c2185b;
+  --tier-gigantamax: #b71c1c;
   --going: #248046;
   --you: #1a73e8;
   --you-edge: #ffffff;
@@ -210,6 +213,8 @@
     --tier-mega: #2ecc9a;
     --tier-elite: #e59e2c;
     --tier-shadow: #9b59b6;
+    --tier-dynamax: #f06292;
+    --tier-gigantamax: #ef5350;
     --going: #2d9d55;
     --you: #4c8bf5;
     --you-edge: #ffffff;
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
index 01c48eb0866da353e248bdc3d0fd6a8f9b40422f..14611fa315e45a621d257969cb2a5f085f18bab9 100644
--- a/src/web/client/what-is-on.test.ts
+++ b/src/web/client/what-is-on.test.ts
@@ -1,6 +1,7 @@
 import { describe, expect, it } from 'vitest';
 import type {
   MapAttendance,
+  MapMax,
   MapMeetup,
   MapRaid,
   MapTrain,
@@ -113,6 +114,23 @@ const meetup = (id: string, more: Partial<MapMeetup> = {}): MapMeetup => ({
   ...more,
 });
 
+const max = (id: string, more: Partial<MapMax> = {}): MapMax => ({
+  kind: 'max',
+  id,
+  spotId: 'spot-1',
+  picture: null,
+  level: 'D2',
+  tier: 'Dynamax 2★',
+  boss: 'Machamp',
+  title: 'Dynamax Machamp (2★)',
+  endTime: NOW + 40 * MINUTE,
+  link: 'https://discord.com/channels/1/9',
+  place: { name: 'Lake Gazebo', lat: 40.441, lon: -79.95, address: null },
+  attendance: attendance(2, 1),
+  postKey: null,
+  ...more,
+});
+
 const view = (more: Partial<PartiesView> = {}): PartiesView => ({
   zone: ZONE,
   readOnly: false,
@@ -138,7 +156,7 @@ describe('the list of what is on (plan 8M-7)', () => {
     );
     const groups = listGroups(lines, { on: allOn, sort: 'nearest', origin: CENTER });
     expect(groups.map((group) => group.heading)).toEqual([
-      'Raids · 2',
+      'Raids and max battles · 2',
       'Trains · 1',
       'Meetups · 1',
     ]);
@@ -283,6 +301,44 @@ describe('the list of what is on (plan 8M-7)', () => {
     expect(words('meetup:m2')).toMatchObject({ place: null, distance: null });
   });
 
+  // Plan 8M-9A (A2): max battles are lines of the raids' group, by their title and end.
+  it('lists max battles with the raids, by their post title, sorted by their end', () => {
+    const lines = listLines(
+      view({
+        raids: [raid('r1', 1, { endTime: NOW + 30 * MINUTE })],
+        maxes: [
+          max('x1', { endTime: NOW + 50 * MINUTE }),
+          max('x2', {
+            spotId: null,
+            title: 'Gigantamax Machamp',
+            level: 'G',
+            endTime: NOW + 4 * MINUTE,
+            place: { name: 'Unlisted power spot', lat: 40.444, lon: -79.95, address: null },
+          }),
+        ],
+      }),
+      GYMS,
+    );
+    const [raids] = listGroups(lines, { on: allOn, sort: 'soonest', origin: CENTER });
+    expect(raids?.heading).toBe('Raids and max battles · 3');
+    expect(keys(raids?.lines ?? [])).toEqual(['max:x2', 'raid:r1', 'max:x1']);
+    const pin = lines.find((line) => line.key === 'max:x2');
+    expect(pin).toMatchObject({ kind: 'raids', id: 'x2', marker: 'max:x2', going: 3 });
+    if (!pin) throw new Error('no line');
+    expect(lineWords(pin, CENTER, NOW, ZONE, 'imperial')).toEqual({
+      name: 'Gigantamax Machamp',
+      place: 'Unlisted power spot',
+      distance: '0.3 mi',
+      time: '4m left',
+      going: '3 going',
+      dimmed: true,
+    });
+    // The raids' layer off takes them out with the raids.
+    expect(
+      listGroups(lines, { on: (kind) => kind !== 'raids', sort: 'soonest', origin: CENTER }),
+    ).toEqual([]);
+  });
+
   it('shows a form in the side pane over the list, the list again once it closes', () => {
     expect(paneShows({ loggedIn: true, formOpen: false })).toBe('list');
     expect(paneShows({ loggedIn: true, formOpen: true })).toBe('form');
diff --git a/src/web/client/what-is-on.ts b/src/web/client/what-is-on.ts
index be01652a3761bfb5d757851597ee2125d88892a0..74bb5f15c678499047d75b1ce292b3c02de1d634 100644
--- a/src/web/client/what-is-on.ts
+++ b/src/web/client/what-is-on.ts
@@ -21,9 +21,12 @@ import type { LatLon, ViewStorage } from './view.js';
 
 export type ListKind = 'raids' | 'trains' | 'meetups' | 'spawns';
 
-/** The groups in their order, each with its heading (the registry's layer of the same id). */
+/**
+ * The groups in their order, each with its heading (the registry's layer of the same id). Max
+ * battles are in the raids' group and layer (plan 8M-9A).
+ */
 const GROUPS: ReadonlyArray<[ListKind, string]> = [
-  ['raids', 'Raids'],
+  ['raids', 'Raids and max battles'],
   ['trains', 'Trains'],
   ['meetups', 'Meetups'],
   ['spawns', 'Wild spawns'],
@@ -31,12 +34,12 @@ const GROUPS: ReadonlyArray<[ListKind, string]> = [
 
 /** A thing of the list, as the page has it from the list of parties. */
 export interface ListLine {
-  /** `raid:<id>`, `train:<id>`, `meetup:<id>`. */
+  /** `raid:<id>`, `max:<id>`, `train:<id>`, `meetup:<id>`. */
   key: string;
   kind: ListKind;
   /** The party's id. */
   id: string;
-  /** Its popup's key on the map (`gym:<id>`, `train:<id>`, `meetup:<id>`): none off the map. */
+  /** Its popup's key on the map (`gym:<id>`, `max:<id>`, `train:<id>`, `meetup:<id>`): none off the map. */
   marker: string | null;
   name: string;
   place: string | null;
@@ -44,7 +47,7 @@ export interface ListLine {
   point: LatLon | null;
   picture: string | null;
   going: number;
-  /** What Soonest sorts by: the end of a raid, the start of a train or meetup; none last. */
+  /** What Soonest sorts by: the end of a raid or max battle, the start of a train or meetup; none last. */
   soonest: number | null;
   /** The times its time is worded from. */
   times: {
@@ -75,6 +78,21 @@ export function listLines(view: PartiesView, gyms: ReadonlyMap<number, MapGym>):
       times: { stage: raid.stage, hatch: raid.hatchTime, end: raid.endTime },
     };
   });
+  // Max battles (plan 8M-9A, A2): in the raids' group, named by their post's title, at their spot
+  // or pin, Soonest by their end; no egg, so their time reads as a hatched raid's.
+  const maxes = view.maxes.map((max): ListLine => ({
+    key: `max:${max.id}`,
+    kind: 'raids',
+    id: max.id,
+    marker: `max:${max.id}`,
+    name: max.title,
+    place: max.place.name,
+    point: { lat: max.place.lat, lon: max.place.lon },
+    picture: max.picture,
+    going: max.attendance.going,
+    soonest: max.endTime,
+    times: { stage: 'hatched', hatch: null, end: max.endTime },
+  }));
   const trains = view.trains.map((train): ListLine => {
     const { ring } = trainPlaces(train, gyms);
     const at = (id: number | null) => (id === null ? undefined : gyms.get(id));
@@ -110,7 +128,7 @@ export function listLines(view: PartiesView, gyms: ReadonlyMap<number, MapGym>):
       times: { start: meetup.startTime },
     };
   });
-  return [...raids, ...trains, ...meetups];
+  return [...raids, ...maxes, ...trains, ...meetups];
 }
 
 export type ListSort = 'nearest' | 'soonest' | 'going';
diff --git a/src/web/raid-marker-tiers.test.ts b/src/web/raid-marker-tiers.test.ts
index 701a863d189a836cc49ca92ad51a5c7c5bc7ebd5..66006e1f584452d5e185d96393e99865ffc3b728 100644
--- a/src/web/raid-marker-tiers.test.ts
+++ b/src/web/raid-marker-tiers.test.ts
@@ -3,7 +3,7 @@ import path from 'node:path';
 import { describe, expect, expectTypeOf, it } from 'vitest';
 import { RAID_TIER_GROUPS, type RaidTierGroup } from '../domain/pogo/raid-tier.js';
 import type { MapTierGroup } from '../domain/web/party-data.js';
-import { tierColour } from './client/raid-marker.js';
+import { maxRing, tierColour } from './client/raid-marker.js';
 
 /**
  * The ring of a raid's marker on the map (plan 8M-7) for every group of tiers the domain makes
@@ -24,6 +24,21 @@ describe("a raid marker's ring", () => {
   });
 });
 
+// Plan 8M-9A (A1): a max battle's ring is Dynamax's or Gigantamax's, light and dark.
+describe("a max battle marker's ring", () => {
+  it('is drawn for Dynamax and Gigantamax in a property theme.css defines, through a class of map.css', () => {
+    const client = path.resolve(import.meta.dirname, 'client');
+    const theme = readFileSync(path.join(client, 'theme.css'), 'utf8');
+    const map = readFileSync(path.join(client, 'map.css'), 'utf8');
+    for (const level of ['D1', 'G'] as const) {
+      const ring = maxRing(level);
+      // Light in :root and dark under its media query: the name twice.
+      expect(theme.split(`${tierColour(ring)}:`).length - 1, ring).toBe(2);
+      expect(map, ring).toMatch(new RegExp(String.raw`\.raid-marker\.tier-${ring}\b`, 'u'));
+    }
+  });
+});
+
 describe("the page's tier groups", () => {
   it("are the domain's, both ways (fix round 1)", () => {
     expectTypeOf<MapTierGroup>().toEqualTypeOf<RaidTierGroup>();
````

### Task 2: 8M-9A task 2: Power Spot popups and the max battle form

Prototype commit: `1ceff920e967ea30b2f09d3a203c797c0b0608a8`

A Power Spot's popup names the spot and, for a member who may report,
offers "Report max battle here", which opens the max battle form in its
place (max-forms.ts, max-ui.ts) over GET /api/max-options and
POST /api/maxes: the bosses grouped by tier in the list's order, the
featured marked; another boss typed with its tier; the end, optional, with
no default shown; the region where the place lies in several. The
ending-soon 422 is asked in the form in the server's words, its choices as
sent, and the report goes again with the choice (dropped once its end has
passed). Any other refusal asks for the lists again and keeps the boss
picked while they still offer it (A3); an answer without words says its
error. A battle made, joined or there with another boss closes the form and
opens the battle. A spot with a battle drawn is left out of the spots
(unoccupied), drawn again from the last answer as the parties change; the
form can also open at a point in a popup of its own (maxAt, for step 2).

**Files:**

```
 src/web/client/cluster.test.ts   |  26 +++++++-
 src/web/client/cluster.ts        |  22 ++++++-
 src/web/client/main.ts           |  18 +++++-
 src/web/client/map.css           |  46 ++++++++++++++
 src/web/client/max-forms.test.ts | 417 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/max-forms.ts      | 521 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/max-ui.ts         | 278 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/party-layer.ts    |  48 ++++++++++++++-
 src/web/client/places-ui.ts      | 124 ++++++++++++++++++++++++++------------
 src/web/client/raid-ui.ts        |   4 +-
 10 files changed, 1457 insertions(+), 47 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/cluster.test.ts src/web/client/max-forms.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 1ceff920e967ea30b2f09d3a203c797c0b0608a8 -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m9a-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-9A task 2: Power Spot popups and the max battle form`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/cluster.test.ts b/src/web/client/cluster.test.ts
index ceac6a3c5ac5df41aeecf83789c30df415e752cc..75aed20c410cde3a22f5614399a35ffc5675271d 100644
--- a/src/web/client/cluster.test.ts
+++ b/src/web/client/cluster.test.ts
@@ -1,5 +1,12 @@
 import { describe, expect, it } from 'vitest';
-import { CLUSTER_BELOW, clustersAt, PlacesInView, placesWanted, PLACES_FROM } from './cluster.js';
+import {
+  CLUSTER_BELOW,
+  clustersAt,
+  PlacesInView,
+  placesWanted,
+  PLACES_FROM,
+  unoccupied,
+} from './cluster.js';
 import { StopLoads } from './meetup-forms.js';
 
 /** Gyms of Oakland, Pittsburgh: two a street apart, one across the river. */
@@ -47,6 +54,23 @@ describe('the PokéStops and Power Spots in view (plan 8M-7)', () => {
     expect(placesWanted(true, 17, false)).toBe(false);
   });
 
+  // Plan 8M-9A (A4): a report's step 2 draws its places whatever the layer says.
+  it('are wanted while a report picks them, the layer off, from the same zoom', () => {
+    expect(placesWanted(false, 16, true, true)).toBe(true);
+    expect(placesWanted(false, 15, true, true)).toBe(false);
+    expect(placesWanted(false, 17, false, true)).toBe(false);
+  });
+
+  // Plan 8M-9A (A6): one card per thing at a place: a spot with a battle drawn shows the battle.
+  it('leave out the places whose own thing is drawn there', () => {
+    const spots: Array<[string, number, number, string]> = [
+      ['a', 40.44, -79.95, 'Lake Gazebo'],
+      ['b', 40.45, -79.95, 'Fountain'],
+    ];
+    expect(unoccupied(spots, new Set(['a']))).toEqual([spots[1]]);
+    expect(unoccupied(spots, new Set())).toEqual(spots);
+  });
+
   it('are asked for only while wanted: at once, after the map rests, and no more after', async () => {
     const timers: Array<() => void> = [];
     let asked = 0;
diff --git a/src/web/client/cluster.ts b/src/web/client/cluster.ts
index ccb514f4982b6bfc5b07010e415a101ac5dff4f2..35286670a2fa45bb249c6d2cdb09ff98b5f16a5e 100644
--- a/src/web/client/cluster.ts
+++ b/src/web/client/cluster.ts
@@ -68,8 +68,26 @@ function middle(points: readonly { lat: number; lon: number }[]): { lat: number;
 }
 
 /** Whether the PokéStops or Power Spots of the view are wanted. */
-export function placesWanted(on: boolean, zoom: number, member: boolean): boolean {
-  return on && member && zoom >= PLACES_FROM;
+export function placesWanted(
+  on: boolean,
+  zoom: number,
+  member: boolean,
+  /** A report picks these places (plan 8M-9A, A4): drawn whatever the layer, as route mode draws the gyms. */
+  forced = false,
+): boolean {
+  return (on || forced) && member && zoom >= PLACES_FROM;
+}
+
+/**
+ * The places of an answer of `/api/stops` or `/api/powerspots` (`[id, lat, lon, title]`) that are
+ * drawn: not those whose own thing the map draws in their place (plan 8M-9A, A6: a Power Spot with
+ * a battle shows the battle; one card per thing at a place), by id.
+ */
+export function unoccupied<P extends readonly [string, ...unknown[]]>(
+  places: readonly P[],
+  occupied: ReadonlySet<string>,
+): P[] {
+  return places.filter(([id]) => !occupied.has(id));
 }
 
 /** What `PlacesInView` drives: the loads of `StopLoads`, and taking the places off the map. */
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 61f0db5ab1c8054e5c69c02e2b6d3e8ffa7c0877..d0a3d3521ccd9c46f37eb67c6019e7e9be2d1f16 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -7,7 +7,7 @@ import { showLayerControls } from './layers-ui.js';
 import { loggedOutPane } from './list-ui.js';
 import { loginNotice, loginNoticeFor } from './notice.js';
 import { showParties } from './party-layer.js';
-import { quietLine, showPlaces } from './places-ui.js';
+import { quietLine, showPlaces, type PlacesHooks } from './places-ui.js';
 import { regionLabel, renderNode, type MapGym } from './popup.js';
 import { RouteFocus } from './route-focus.js';
 import { hiddenGyms } from './shared-place.js';
@@ -220,7 +220,13 @@ function start(): void {
       const spotTaps: { clicked: (spot: { id: string; title: string }) => boolean } = {
         clicked: () => false,
       };
-      showPlaces(
+      // A Power Spot's popup offers "Report max battle here", and a spot whose battle is drawn
+      // shows the battle (plan 8M-9A), once the parties are drawn.
+      const placesHooks: PlacesHooks = {
+        spotControls: () => [],
+        occupied: () => new Set(),
+      };
+      const places = showPlaces(
         map,
         guild,
         registry,
@@ -228,6 +234,10 @@ function start(): void {
         () => member,
         (spot) => spotTaps.clicked(spot),
         routeFocus,
+        {
+          spotControls: (spot) => placesHooks.spotControls(spot),
+          occupied: (layer) => placesHooks.occupied(layer),
+        },
       );
       if (!me.loggedIn || !member) {
         // The side pane says how to see what is on (plan 8M-7).
@@ -248,6 +258,7 @@ function start(): void {
         registry,
         afterDraw: () => {
           dots.refresh();
+          places.redrawn();
         },
         located: () => you.located(),
         onMove: (listener) => {
@@ -267,6 +278,9 @@ function start(): void {
       gymExtras.of = (gym) => raids.gymControls(gym);
       gymExtras.clicked = (gym) => raids.gymClicked(gym);
       spotTaps.clicked = (spot) => raids.spotClicked(spot);
+      placesHooks.spotControls = (spot) => raids.spotControls(spot);
+      placesHooks.occupied = (layer) => (layer === 'spots' ? raids.battleSpots() : new Set());
+      places.redrawn();
       gymExtras.forced = () => raids.forced();
       gymExtras.raidGyms = () => raids.raidGyms();
       gymExtras.tapped = (gym, own) => {
diff --git a/src/web/client/map.css b/src/web/client/map.css
index f062d454bdba52d4aff45c15c9b63a8feb93d094..d3d8b0b13d2d2ce696d1e43c3a28d1ebcc89219b 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -822,6 +822,7 @@ path.highlighted {
 .press,
 .report-raid,
 .report-spawn,
+.report-max,
 .new-train,
 .new-meetup,
 .meetup-here {
@@ -839,6 +840,7 @@ path.highlighted {
 .press:hover,
 .report-raid:hover,
 .report-spawn:hover,
+.report-max:hover,
 .new-train:hover,
 .new-meetup:hover,
 .meetup-here:hover {
@@ -875,6 +877,7 @@ path.highlighted {
 .press:disabled,
 .report-raid:disabled,
 .report-spawn:disabled,
+.report-max:disabled,
 .new-train:disabled,
 .new-meetup:disabled,
 .meetup-here:disabled {
@@ -1152,6 +1155,7 @@ path.highlighted {
 /* Reporting and changing raids (plan 8M-4), reporting spawns (plan 8M-4S). */
 .report-raid,
 .report-spawn,
+.report-max,
 .raid-form .press,
 .party-popup .change-raid {
   margin-top: 6px;
@@ -1744,3 +1748,45 @@ path.highlighted {
 .party-card.summary .mine-part > :not(.mine, .group-pick, .completion) {
   display: none;
 }
+
+/* A Power Spot's popup and the max battle form (plan 8M-9A): the ending-soon question as a
+   choice of the dialog's look. */
+.place-popup {
+  display: flex;
+  flex-direction: column;
+  gap: 4px;
+}
+
+.max-form .form-choice {
+  display: flex;
+  flex-direction: column;
+  gap: 4px;
+  margin: 0;
+  padding: 0;
+  border: 0;
+}
+
+.max-form .form-choice legend {
+  margin-bottom: 4px;
+  font-weight: 600;
+}
+
+.max-form .choice {
+  display: flex;
+  gap: 8px;
+  align-items: flex-start;
+  padding: 6px 8px;
+  border-radius: var(--radius);
+  background: var(--card-bg);
+  cursor: pointer;
+}
+
+.max-form .choice input {
+  flex: none;
+  min-width: 0;
+  margin-top: 3px;
+}
+
+.max-form [hidden] {
+  display: none;
+}
diff --git a/src/web/client/max-forms.test.ts b/src/web/client/max-forms.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8af5a23a006983d7f1ea9d6bbf4108b98aeb3283
--- /dev/null
+++ b/src/web/client/max-forms.test.ts
@@ -0,0 +1,417 @@
+import { describe, expect, it } from 'vitest';
+import type { MaxOptionsView } from '../../domain/web/max-data.js';
+import type { MapMax } from '../../domain/web/party-data.js';
+import {
+  ANOTHER_BOSS,
+  fieldToFocus,
+  keptPick,
+  maxAnswerOf,
+  maxBody,
+  maxBox,
+  maxForm,
+  maxFormAfter,
+  sendMaxForm,
+  submitMax,
+  type MaxFormState,
+  type MaxValues,
+} from './max-forms.js';
+import type { PageNode } from './popup.js';
+
+const ZONE = 'America/New_York';
+/** Tuesday 13 October 2026, 14:00 in New York. */
+const NOW = Date.UTC(2026, 9, 13, 18);
+const MINUTE = 60_000;
+
+const OPTIONS: MaxOptionsView = {
+  zone: ZONE,
+  bosses: [
+    { value: 'm:D5:zapdos', name: 'Zapdos', level: 'D5', tier: 'Dynamax 5★', featured: true },
+    { value: 'm:D2:machamp', name: 'Machamp', level: 'D2', tier: 'Dynamax 2★', featured: false },
+    { value: 'm:D2:onix', name: 'Onix', level: 'D2', tier: 'Dynamax 2★', featured: false },
+    { value: 'm:G:gengar', name: 'Gengar', level: 'G', tier: 'Gigantamax', featured: false },
+  ],
+  tiers: [
+    { value: 'D1', tier: 'Dynamax 1★' },
+    { value: 'D5', tier: 'Dynamax 5★' },
+    { value: 'G', tier: 'Gigantamax' },
+  ],
+};
+
+const SPOT = { spot: 'spot-1', name: 'Lake Gazebo', lat: 40.44, lon: -79.95 };
+const PIN = { lat: 40.44, lon: -79.95 };
+
+const values = (more: Partial<MaxValues> = {}): MaxValues => ({
+  boss: '',
+  typed: '',
+  tier: '',
+  end: '',
+  region: '',
+  soon: '',
+  ...more,
+});
+
+const state = (more: Partial<MaxFormState> = {}): MaxFormState => ({
+  filled: {},
+  regions: [],
+  ...more,
+});
+
+/** Every text of a tree, in order. */
+const texts = (node: PageNode): string[] => [
+  ...(node.text === undefined ? [] : [node.text]),
+  ...(node.children ?? []).flatMap(texts),
+];
+
+/** The nodes of a tree with this tag. */
+const tagged = (node: PageNode, tag: string): PageNode[] => [
+  ...(node.tag === tag ? [node] : []),
+  ...(node.children ?? []).flatMap((child) => tagged(child, tag)),
+];
+
+const battle = { kind: 'max', id: 'x1' } as unknown as MapMax;
+
+describe('"Report max battle here" (plan 8M-9A)', () => {
+  it("is a button in a Power Spot's popup, naming the spot", () => {
+    const box = maxBox('spot-1');
+    expect(box.className).toBe('max-box');
+    expect(tagged(box, 'button').map((button) => [button.text, button.attributes])).toEqual([
+      ['Report max battle here', { type: 'button', 'data-report-max': 'spot-1' }],
+    ]);
+  });
+});
+
+describe('the max battle form (plan 8M-9A, A9)', () => {
+  it("offers /max's bosses grouped by tier in the list's order, the featured marked", () => {
+    const form = maxForm('Lake Gazebo', OPTIONS, state(), ZONE);
+    expect(texts(form)[0]).toBe('Lake Gazebo');
+    const [boss] = tagged(form, 'select').filter((one) => one.attributes?.name === 'boss');
+    expect(boss?.children?.map((child) => child.attributes?.label ?? child.text)).toEqual([
+      'Pick the boss',
+      'Dynamax 5★',
+      'Dynamax 2★',
+      'Gigantamax',
+      'Not on the list',
+    ]);
+    expect(texts(boss ?? { tag: 'none' })).toEqual([
+      'Pick the boss',
+      'Zapdos (featured)',
+      'Machamp',
+      'Onix',
+      'Gengar',
+      'Another boss (type its name)',
+    ]);
+    // The end is optional, and no default end is shown: the server's.
+    const [end] = tagged(form, 'input').filter((one) => one.attributes?.name === 'end');
+    expect(end?.attributes).not.toHaveProperty('value');
+    // A boss typed is asked for with its tier, in rows shown only for it.
+    const typedRows = tagged(form, 'label').filter((one) => one.attributes?.['data-typed'] === '');
+    expect(typedRows.map((row) => row.attributes)).toEqual([
+      { 'data-typed': '', hidden: '' },
+      { 'data-typed': '', hidden: '' },
+    ]);
+    // No region asked of a place in one.
+    expect(tagged(form, 'select').map((one) => one.attributes?.name)).toEqual(['boss', 'tier']);
+    // In a spot's popup, which names the spot already, it has no heading of its own.
+    expect(texts(maxForm(undefined, OPTIONS, state(), ZONE))[0]).toBe('Boss');
+  });
+
+  it('keeps what was filled in, shows the typed rows for a boss typed, and asks a region of several', () => {
+    const form = maxForm(
+      'Unlisted power spot',
+      OPTIONS,
+      state({
+        filled: { boss: ANOTHER_BOSS, typed: 'Mewtwo', tier: 'D5', end: '20', region: '2' },
+        regions: [
+          { id: 1, name: 'oakland' },
+          { id: 2, name: 'shadyside' },
+        ],
+      }),
+      ZONE,
+    );
+    const typedRows = tagged(form, 'label').filter((one) => one.attributes?.['data-typed'] === '');
+    expect(typedRows.map((row) => row.attributes)).toEqual([
+      { 'data-typed': '' },
+      { 'data-typed': '' },
+    ]);
+    const inputs = Object.fromEntries(
+      tagged(form, 'input').map((one): [string, string | undefined] => [
+        one.attributes?.name ?? '',
+        one.attributes?.value,
+      ]),
+    );
+    expect(inputs).toEqual({ typed: 'Mewtwo', end: '20' });
+    const selected = tagged(form, 'option')
+      .filter((one) => one.attributes?.selected === '')
+      .map((one) => one.attributes?.value);
+    expect(selected).toEqual([ANOTHER_BOSS, 'D5', '2']);
+  });
+
+  it('asks the ending-soon question in the server words, with the zone hint (A9)', () => {
+    const form = maxForm(
+      'Lake Gazebo',
+      OPTIONS,
+      state({
+        soon: {
+          text: 'This max battle ends in 3 minutes. Until when?',
+          choices: [
+            { value: 'next', label: 'Until the next rotation, 3:00 PM', end: NOW + 60 * MINUTE },
+            { value: 'soon', label: 'Until 2:03 PM, as it is', end: NOW + 3 * MINUTE },
+          ],
+        },
+      }),
+      'Europe/London',
+    );
+    expect(texts(form)).toEqual(
+      expect.arrayContaining([
+        'This max battle ends in 3 minutes. Until when?',
+        'Until the next rotation, 3:00 PM',
+        'Until 2:03 PM, as it is',
+      ]),
+    );
+    const radios = tagged(form, 'input').filter((one) => one.attributes?.type === 'radio');
+    expect(radios.map((one) => one.attributes)).toEqual([
+      { type: 'radio', name: 'soon', value: `next:${NOW + 60 * MINUTE}`, checked: '' },
+      { type: 'radio', name: 'soon', value: `soon:${NOW + 3 * MINUTE}` },
+    ]);
+    expect(texts(form).join(' ')).toContain('Clock times are read in the server');
+    // The typed end is not offered beside the question: the choice is the end.
+    expect(tagged(form, 'input').some((one) => one.attributes?.name === 'end')).toBe(false);
+  });
+});
+
+describe("a max battle report's body (POST /api/maxes)", () => {
+  it('sends the spot or the point, the boss picked, the end typed and the region', () => {
+    expect(maxBody(SPOT, values({ boss: 'm:D2:machamp', end: ' 20 ', region: '2' }))).toEqual({
+      body: { spot: 'spot-1', boss: 'm:D2:machamp', end: '20', region: 2 },
+    });
+    expect(maxBody(PIN, values({ boss: 'm:G:gengar' }))).toEqual({
+      body: { lat: 40.44, lon: -79.95, boss: 'm:G:gengar' },
+    });
+  });
+
+  it('sends a boss typed with its tier, and says what is missing first', () => {
+    expect(maxBody(SPOT, values({ boss: ANOTHER_BOSS, typed: ' Mewtwo ', tier: 'D5' }))).toEqual({
+      body: { spot: 'spot-1', boss: 'Mewtwo', tier: 'D5' },
+    });
+    expect(maxBody(SPOT, values({ boss: ANOTHER_BOSS, typed: 'Mewtwo' }))).toEqual({
+      body: { spot: 'spot-1', boss: 'Mewtwo' },
+    });
+    expect(maxBody(SPOT, values())).toEqual({ text: 'Pick the boss first.' });
+    expect(maxBody(SPOT, values({ boss: ANOTHER_BOSS, typed: ' ' }))).toEqual({
+      text: 'Type the boss first.',
+    });
+  });
+
+  // R1-5: the choice checked is sent as it is; whether its end has passed is the server's to say
+  // (the dialog's Submit's words), not the browser clock's.
+  it('sends the ending-soon choice checked with its end and no typed end, whatever the time', () => {
+    const soon = `next:${String(NOW - 60 * MINUTE)}`;
+    expect(maxBody(SPOT, values({ boss: 'm:D2:machamp', end: '5', soon }))).toEqual({
+      body: {
+        spot: 'spot-1',
+        boss: 'm:D2:machamp',
+        soon: { value: 'next', end: NOW - 60 * MINUTE },
+      },
+    });
+  });
+});
+
+describe("a max battle report's answer (A3)", () => {
+  it('reads whether it was done, the battle, what it needs, the regions and the question', () => {
+    expect(maxAnswerOf(undefined)).toEqual({ ok: false });
+    expect(
+      maxAnswerOf({
+        ok: false,
+        text: 'This place lies in several regions: pick the one to report the max battle in.',
+        regions: [{ id: 1, name: 'oakland' }, { id: 'x' }],
+        needs: 'tier',
+        soon: { choices: [{ value: 'next', label: 'Until 3:00 PM', end: 5 }, { value: 'nope' }] },
+        max: battle,
+      }),
+    ).toEqual({
+      ok: false,
+      text: 'This place lies in several regions: pick the one to report the max battle in.',
+      regions: [{ id: 1, name: 'oakland' }],
+      needs: 'tier',
+      soon: { choices: [{ value: 'next', label: 'Until 3:00 PM', end: 5 }] },
+      max: battle,
+    });
+  });
+
+  it('closes on a battle made, joined or there with another boss; asks again for the rest', () => {
+    const filled = values({ boss: 'm:D2:machamp' });
+    expect(maxFormAfter({ ok: true, max: battle }, filled, state())).toEqual({
+      kind: 'close',
+      max: battle,
+    });
+    // Joined, or another boss's battle there: it is opened instead.
+    expect(maxFormAfter({ ok: false, max: battle }, filled, state())).toEqual({
+      kind: 'close',
+      max: battle,
+    });
+    // The question: drawn into the form, what was filled kept.
+    const choices = [{ value: 'next' as const, label: 'Until 3:00 PM', end: NOW }];
+    expect(
+      maxFormAfter({ ok: false, text: 'Ends soon.', soon: { choices } }, filled, state()),
+    ).toEqual({
+      kind: 'redraw',
+      state: { filled, regions: [], soon: { text: 'Ends soon.', choices } },
+    });
+    // Several regions: drawn with them, a region kept only while it is among them.
+    const regions = [
+      { id: 1, name: 'oakland' },
+      { id: 2, name: 'shadyside' },
+    ];
+    expect(
+      maxFormAfter(
+        { ok: false, text: 'Pick the region.', regions },
+        values({ boss: 'm:D2:machamp', region: '7' }),
+        state(),
+      ),
+    ).toEqual({
+      kind: 'redraw',
+      state: { filled: values({ boss: 'm:D2:machamp', region: '' }), regions },
+    });
+    // Any other refusal: the lists asked for again (a boundary may have changed them), the
+    // question gone.
+    expect(
+      maxFormAfter(
+        { ok: false, text: 'That boss is no longer on the list: pick it again.' },
+        filled,
+        state({ soon: { text: 'Ends soon.', choices } }),
+      ),
+    ).toEqual({ kind: 'refetch', state: { filled, regions: [] } });
+  });
+
+  // R1-4: what a refusal needs is acted on, not only said.
+  it('acts on what a refusal needs: the field to fill in, or a Power Spot for a pin', () => {
+    const typed = values({ boss: ANOTHER_BOSS, typed: 'Mewtwo' });
+    expect(maxFormAfter({ ok: false, text: 'Which tier?', needs: 'tier' }, typed, state())).toEqual(
+      { kind: 'refetch', state: { filled: typed, regions: [] }, focus: 'tier' },
+    );
+    expect(
+      maxFormAfter(
+        { ok: false, text: 'Pick a boss from the list.', needs: 'boss' },
+        typed,
+        state(),
+      ),
+    ).toEqual({ kind: 'refetch', state: { filled: typed, regions: [] }, focus: 'boss' });
+    // A member blocked from pins: the form says so, its Report off, a way back to the spots.
+    const picked = values({ boss: 'm:D2:machamp' });
+    const step = maxFormAfter(
+      { ok: false, text: 'Pick a Power Spot on the map.', needs: 'listed-spot' },
+      picked,
+      state(),
+    );
+    expect(step).toEqual({
+      kind: 'redraw',
+      state: { filled: picked, regions: [], pinRefused: true },
+    });
+    if (step.kind !== 'redraw') throw new Error(step.kind);
+    const form = maxForm('Unlisted power spot', OPTIONS, step.state, ZONE);
+    const buttons = tagged(form, 'button').map((button) => [button.text, button.attributes]);
+    expect(buttons).toEqual([
+      ['Report', { type: 'button', 'data-submit': 'max', disabled: '' }],
+      ['Cancel', { type: 'button', 'data-cancel': '' }],
+      ['← Pick a Power Spot', { type: 'button', 'data-pick-spot': '' }],
+    ]);
+  });
+
+  it('keeps the boss picked when the new lists still have it', () => {
+    const picked = values({ boss: 'm:D2:onix', end: '20' });
+    expect(keptPick(OPTIONS, picked)).toEqual(picked);
+    const gone = { ...OPTIONS, bosses: OPTIONS.bosses.filter((boss) => boss.name !== 'Onix') };
+    expect(keptPick(gone, picked)).toEqual(values({ boss: '', end: '20' }));
+    // A boss typed is kept whatever the lists say.
+    const typed = values({ boss: ANOTHER_BOSS, typed: 'Mewtwo' });
+    expect(keptPick(gone, typed)).toEqual(typed);
+  });
+
+  // R2-3: "a boss of the list" for a boss typed points at the name typed, not the menu.
+  it('focuses the field a refusal points at: the tier, the menu, or the name typed', () => {
+    expect(fieldToFocus('tier', values())).toBe('select[name="tier"]');
+    expect(fieldToFocus('boss', values({ boss: 'm:D2:machamp' }))).toBe('select[name="boss"]');
+    expect(fieldToFocus('boss', values({ boss: ANOTHER_BOSS, typed: 'Mewtwoo' }))).toBe(
+      'input[name="typed"]',
+    );
+  });
+
+  // R1-2: the form's Submit as maxUi runs it (`submitMax`), the lists asked for again (A3).
+  it('asks for the lists again after a refusal, keeping the boss while they still offer it', async () => {
+    const sent: unknown[] = [];
+    let asked = 0;
+    const without = { ...OPTIONS, bosses: OPTIONS.bosses.filter((boss) => boss.name !== 'Onix') };
+    const deps = (lists: MaxOptionsView | 'fails') => ({
+      send: (body: unknown) => {
+        sent.push(body);
+        return Promise.resolve({
+          ok: false,
+          text: 'That boss is no longer on the list: pick it again.',
+          csrf: 'token',
+        });
+      },
+      options: () => {
+        asked += 1;
+        return lists === 'fails' ? Promise.reject(new Error('offline')) : Promise.resolve(lists);
+      },
+      holds: () => true,
+    });
+    const onix = values({ boss: 'm:D2:onix', end: '20' });
+    const after = await submitMax(SPOT, onix, OPTIONS, state(), deps(without));
+    expect(sent).toEqual([{ spot: 'spot-1', boss: 'm:D2:onix', end: '20' }]);
+    expect(asked).toBe(1);
+    expect(after).toEqual({
+      kind: 'draw',
+      lists: without,
+      state: { filled: { ...onix, boss: '' }, regions: [] },
+      text: 'That boss is no longer on the list: pick it again.',
+    });
+    // The lists cannot be had: those it has stay, the pick with them.
+    const kept = await submitMax(SPOT, onix, OPTIONS, state(), deps('fails'));
+    expect(kept).toMatchObject({ kind: 'draw', lists: OPTIONS, state: { filled: onix } });
+    // What is missing is said before anything is sent.
+    expect(await submitMax(SPOT, values(), OPTIONS, state(), deps(without))).toEqual({
+      kind: 'missing',
+      text: 'Pick the boss first.',
+    });
+    expect(sent).toHaveLength(2);
+  });
+
+  it('closes on a battle made, and only says the words of a form gone meanwhile', async () => {
+    const made = { ok: true, text: 'Reported.', max: battle, csrf: 'token' };
+    const deps = (holds: boolean) => ({
+      send: () => Promise.resolve(made),
+      options: () => Promise.resolve(OPTIONS),
+      holds: () => holds,
+    });
+    const picked = values({ boss: 'm:D2:machamp' });
+    expect(await submitMax(SPOT, picked, OPTIONS, state(), deps(true))).toEqual({
+      kind: 'close',
+      text: 'Reported.',
+      max: battle,
+    });
+    expect(await submitMax(SPOT, picked, OPTIONS, state(), deps(false))).toEqual({
+      kind: 'gone',
+      text: 'Reported.',
+    });
+  });
+
+  it("says the server's words, or its few words where it has no text (a 403)", async () => {
+    const barred = await sendMaxForm('token', {
+      post: () =>
+        Promise.resolve({
+          status: 403,
+          body: { error: 'You cannot report a max battle here.' },
+        }),
+      me: () =>
+        Promise.resolve({
+          loggedIn: true,
+          name: 'Ash',
+          csrf: 'token',
+          member: true,
+          readOnly: false,
+        }),
+    });
+    expect(barred).toMatchObject({ ok: false, text: 'You cannot report a max battle here.' });
+  });
+});
diff --git a/src/web/client/max-forms.ts b/src/web/client/max-forms.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1fc8225d1859caf27b8e5ebb5d6524e0ca7215bc
--- /dev/null
+++ b/src/web/client/max-forms.ts
@@ -0,0 +1,521 @@
+import type {
+  MaxEndChoice,
+  MaxNeed,
+  MaxOptionsView,
+  MapMaxTier,
+} from '../../domain/web/max-data.js';
+import type { MapMax } from '../../domain/web/party-data.js';
+import { pressParty, type PressSteps, type Pressed } from './parties.js';
+import type { PageNode } from './popup.js';
+import { radioChoice } from './post-forms.js';
+import { zoneHintNodes } from './raid-forms.js';
+import type { PointRegion } from './spawn-forms.js';
+
+/**
+ * Reporting a max battle on the live map (plan 8M-9A; the server side is plan 8X-5's
+ * `POST /s/<guild>/api/maxes`, which runs `/max`'s readers and `reportMaxAs`), the parts that need
+ * no Leaflet: "Report max battle here" in a Power Spot's popup, the form as a tree of nodes over
+ * `/api/max-options` (the bosses grouped by tier in the list's order, the featured marked; a boss
+ * typed that is on no list, with its tier; the end, optional; the region where the place lies in
+ * several), the ending-soon question as the server asks it (its words and choices, sent back with
+ * the report), the body, reading an answer, and what the form does after one. Every rule is the
+ * server's: the page reads `needs`, `regions` and `soon`, never a boss list or an end of its own,
+ * and asks for the lists again after any other refusal (A3: a boundary may have changed them).
+ */
+
+/** As much as `/max` takes of a boss and of an end (its options' lengths). */
+const BOSS_LENGTH = 100;
+const END_LENGTH = 40;
+
+/** The boss menu's choice of a boss on no list: its name typed, with its tier. */
+export const ANOTHER_BOSS = 'another';
+
+/** What a max battle form holds, kept when it is drawn anew. */
+export interface MaxValues {
+  /** A boss's value of the list, or `ANOTHER_BOSS`. */
+  boss: string;
+  /** A boss typed (with `ANOTHER_BOSS`). */
+  typed: string;
+  /** Its tier, for a boss typed (`D1` to `G`), or empty. */
+  tier: string;
+  /** The end as typed (minutes, or a clock time), or empty for the usual end. */
+  end: string;
+  region: string;
+  /** The ending-soon choice: `<value>:<end>`, or empty. */
+  soon: string;
+}
+
+/** The ending-soon question as the server asked it (`MaxAnswer.soon` and its words). */
+export interface SoonQuestion {
+  text: string;
+  choices: MaxEndChoice[];
+}
+
+/** What the form is drawn from: what was filled in, the regions to pick from, the question. */
+export interface MaxFormState {
+  filled: Partial<MaxValues>;
+  regions: PointRegion[];
+  soon?: SoonQuestion;
+  /**
+   * A battle at this point was refused to a member blocked from pins (`needs: 'listed-spot'`,
+   * R1-4): Report is off, and "← Pick a Power Spot" leads back to the spots.
+   */
+  pinRefused?: true;
+}
+
+/** Where a report is: a Power Spot Pine keeps (by its Wayfarer id), or a point of the map. */
+export type MaxWhere = { spot: string; name: string; lat: number; lon: number } | MaxPoint;
+export interface MaxPoint {
+  lat: number;
+  lon: number;
+}
+
+/** "Report max battle here" in the box a click opens the form in (`max-box`), in a spot's popup. */
+export function maxBox(spotId: string): PageNode {
+  return {
+    tag: 'div',
+    className: 'max-box',
+    children: [
+      {
+        tag: 'button',
+        className: 'report-max',
+        text: 'Report max battle here',
+        attributes: { type: 'button', 'data-report-max': spotId },
+      },
+    ],
+  };
+}
+
+const option = (value: string, text: string, selected: boolean): PageNode => ({
+  tag: 'option',
+  text,
+  attributes: { value, ...(selected ? { selected: '' } : {}) },
+});
+
+const labelled = (
+  text: string,
+  children: PageNode[],
+  attributes: Record<string, string> = {},
+): PageNode => ({
+  tag: 'label',
+  className: 'form-row',
+  attributes,
+  children: [{ tag: 'span', text }, ...children],
+});
+
+/**
+ * The boss menu as `/max` offers it: nothing picked at first, the bosses grouped by tier in the
+ * list's order (the featured first, as the list has them, and marked), then a boss on no list.
+ */
+function bossSelect(options: MaxOptionsView, picked: string | undefined): PageNode {
+  const tiers = new Map<string, PageNode[]>();
+  for (const boss of options.bosses) {
+    const group = tiers.get(boss.tier) ?? [];
+    group.push(
+      option(
+        boss.value,
+        boss.featured ? `${boss.name} (featured)` : boss.name,
+        boss.value === picked,
+      ),
+    );
+    tiers.set(boss.tier, group);
+  }
+  return {
+    tag: 'select',
+    attributes: { name: 'boss' },
+    children: [
+      option('', 'Pick the boss', picked === undefined || picked === ''),
+      ...[...tiers].map(([tier, children]): PageNode => ({
+        tag: 'optgroup',
+        attributes: { label: tier },
+        children,
+      })),
+      {
+        tag: 'optgroup',
+        attributes: { label: 'Not on the list' },
+        children: [option(ANOTHER_BOSS, 'Another boss (type its name)', picked === ANOTHER_BOSS)],
+      },
+    ],
+  };
+}
+
+/**
+ * The form of a max battle report at a Power Spot or a point (`name`: "Unlisted power spot" in a
+ * popup of its own; none in a spot's popup, which names the spot already): the boss, a boss typed with its tier (rows shown only for it, `data-typed`), the
+ * end (optional: no default end shown, the server's is `/max`'s), the region where the place lies
+ * in several; and, once the server asked it, the ending-soon question in its words, in place of
+ * the typed end (the choice is the end). Times typed are read in the server's zone
+ * (`zoneHintNodes`), as are the question's labels.
+ */
+export function maxForm(
+  name: string | undefined,
+  options: MaxOptionsView,
+  state: MaxFormState,
+  reader: string = options.zone,
+): PageNode {
+  const { filled, regions, soon } = state;
+  const typed = filled.boss === ANOTHER_BOSS;
+  const typedRow: Record<string, string> = typed
+    ? { 'data-typed': '' }
+    : { 'data-typed': '', hidden: '' };
+  const firstChoice = soon?.choices[0];
+  return {
+    tag: 'div',
+    className: 'raid-form max-form',
+    attributes: { 'data-form': 'max' },
+    children: [
+      ...(name === undefined ? [] : [{ tag: 'strong', className: 'name', text: name }]),
+      labelled('Boss', [bossSelect(options, filled.boss)]),
+      labelled(
+        'Its name',
+        [
+          {
+            tag: 'input',
+            attributes: {
+              name: 'typed',
+              type: 'text',
+              maxlength: String(BOSS_LENGTH),
+              placeholder: 'The boss as the game names it',
+              autocomplete: 'off',
+              ...(filled.typed === undefined ? {} : { value: filled.typed }),
+            },
+          },
+        ],
+        typedRow,
+      ),
+      labelled(
+        'Its tier',
+        [
+          {
+            tag: 'select',
+            attributes: { name: 'tier' },
+            children: [
+              option('', 'Pick its tier', (filled.tier ?? '') === ''),
+              ...options.tiers.map((tier) =>
+                option(tier.value, tier.tier, tier.value === filled.tier),
+              ),
+            ],
+          },
+        ],
+        typedRow,
+      ),
+      ...(soon === undefined
+        ? [
+            labelled('Ends in', [
+              {
+                tag: 'input',
+                attributes: {
+                  name: 'end',
+                  type: 'text',
+                  maxlength: String(END_LENGTH),
+                  placeholder: 'optional: minutes, or a time like 6:15pm',
+                  autocomplete: 'off',
+                  ...(filled.end === undefined || filled.end === '' ? {} : { value: filled.end }),
+                },
+              },
+            ]),
+          ]
+        : [
+            radioChoice(
+              'soon',
+              soon.text,
+              soon.choices.map((choice) => ({
+                value: `${choice.value}:${String(choice.end)}`,
+                label: choice.label,
+              })),
+              filled.soon !== undefined && filled.soon !== ''
+                ? filled.soon
+                : firstChoice && `${firstChoice.value}:${String(firstChoice.end)}`,
+            ),
+          ]),
+      ...zoneHintNodes(options.zone, reader),
+      ...(regions.length > 1
+        ? [
+            labelled('Region', [
+              {
+                tag: 'select',
+                attributes: { name: 'region' },
+                children: [
+                  option('', 'Pick the region', (filled.region ?? '') === ''),
+                  ...regions.map((region) =>
+                    option(String(region.id), region.name, String(region.id) === filled.region),
+                  ),
+                ],
+              },
+            ]),
+          ]
+        : []),
+      {
+        tag: 'div',
+        className: 'form-buttons',
+        children: [
+          {
+            tag: 'button',
+            className: 'press primary',
+            text: 'Report',
+            attributes: {
+              type: 'button',
+              'data-submit': 'max',
+              ...(state.pinRefused ? { disabled: '' } : {}),
+            },
+          },
+          {
+            tag: 'button',
+            className: 'press',
+            text: 'Cancel',
+            attributes: { type: 'button', 'data-cancel': '' },
+          },
+          ...(state.pinRefused
+            ? [
+                {
+                  tag: 'button',
+                  className: 'press',
+                  text: '← Pick a Power Spot',
+                  attributes: { type: 'button', 'data-pick-spot': '' },
+                },
+              ]
+            : []),
+        ],
+      },
+      { tag: 'div', className: 'form-answer', attributes: { hidden: '' } },
+    ],
+  };
+}
+
+const TIERS: readonly string[] = ['D1', 'D2', 'D3', 'D4', 'D5', 'G'] satisfies MapMaxTier[];
+
+/** The ending-soon choice of the form (`<value>:<end>`), or none. */
+function soonOf(picked: string): { value: 'next' | 'soon'; end: number } | undefined {
+  const [value, end] = picked.split(':');
+  const at = Number(end);
+  if ((value !== 'next' && value !== 'soon') || !Number.isInteger(at)) return undefined;
+  return { value, end: at };
+}
+
+/**
+ * The body of a report (`POST /s/<guild>/api/maxes`), or what the member must fill in first: the
+ * spot or the point, the boss (a value of the list, or as typed with its tier when one is picked),
+ * the end typed, the region; with the ending-soon choice checked, its value and end in place of a
+ * typed end, always (R1-5: whether that end has passed is the server's to say, as the dialog's
+ * Submit says it, "That battle has ended meanwhile: nothing was reported.", never the browser
+ * clock's; the form then asks for its lists again).
+ */
+export function maxBody(where: MaxWhere, values: MaxValues): MaxBody {
+  const typed = values.boss === ANOTHER_BOSS;
+  const boss = (typed ? values.typed : values.boss).trim();
+  if (boss === '') return { text: typed ? 'Type the boss first.' : 'Pick the boss first.' };
+  const asked = soonOf(values.soon);
+  const end = values.end.trim();
+  const region = Number(values.region);
+  return {
+    body: {
+      ...('spot' in where ? { spot: where.spot } : { lat: where.lat, lon: where.lon }),
+      boss,
+      ...(typed && TIERS.includes(values.tier) ? { tier: values.tier } : {}),
+      ...(asked === undefined && end !== '' ? { end } : {}),
+      ...(values.region !== '' && Number.isInteger(region) ? { region } : {}),
+      ...(asked === undefined ? {} : { soon: asked }),
+    },
+  };
+}
+
+/** A report's body to send, or what the member must fill in first. */
+export type MaxBody =
+  { body: Record<string, string | number | { value: string; end: number }> } | { text: string };
+
+/** What the page takes of a report's answer (`MaxAnswer`), only what it can read. */
+export interface MaxAnswered {
+  ok: boolean;
+  text?: string;
+  needs?: MaxNeed;
+  max?: MapMax;
+  regions?: PointRegion[];
+  soon?: { choices: MaxEndChoice[] };
+}
+
+const NEEDS: readonly string[] = ['tier', 'listed-spot', 'boss'] satisfies MaxNeed[];
+
+export function maxAnswerOf(body: unknown): MaxAnswered {
+  if (typeof body !== 'object' || body === null) return { ok: false };
+  const { ok, text, needs, max, regions, soon } = body as Record<string, unknown>;
+  const answered: MaxAnswered = { ok: ok === true };
+  if (typeof text === 'string') answered.text = text;
+  if (typeof needs === 'string' && NEEDS.includes(needs)) answered.needs = needs as MaxNeed;
+  if (Array.isArray(regions)) {
+    answered.regions = regions.flatMap((region: unknown): PointRegion[] => {
+      if (typeof region !== 'object' || region === null) return [];
+      const { id, name } = region as { id?: unknown; name?: unknown };
+      return typeof id === 'number' && typeof name === 'string' ? [{ id, name }] : [];
+    });
+  }
+  if (typeof soon === 'object' && soon !== null) {
+    const { choices } = soon as { choices?: unknown };
+    if (Array.isArray(choices)) {
+      answered.soon = {
+        choices: choices.flatMap((choice: unknown): MaxEndChoice[] => {
+          if (typeof choice !== 'object' || choice === null) return [];
+          const { value, label, end } = choice as Record<string, unknown>;
+          return (value === 'next' || value === 'soon') &&
+            typeof label === 'string' &&
+            typeof end === 'number'
+            ? [{ value, label, end }]
+            : [];
+        }),
+      };
+    }
+  }
+  if (typeof max === 'object' && max !== null && (max as { kind?: unknown }).kind === 'max') {
+    answered.max = max as MapMax;
+  }
+  return answered;
+}
+
+/**
+ * What the form does after an answer: closes (made, or a battle there, made by somebody else or
+ * of another boss, which the page opens instead); is drawn again with the question or the
+ * regions the server asks, keeping what was filled in (a region kept only while it is among them);
+ * or, after any other refusal, asks for its lists again (a boundary may have changed them: A3),
+ * the question gone. What a refusal needs is acted on (R1-4): a tier or a boss focuses its field
+ * (`focus`); a Power Spot for a member blocked from pins turns Report off and offers the spots
+ * (`pinRefused`).
+ */
+export function maxFormAfter(
+  answer: MaxAnswered,
+  values: MaxValues,
+  state: MaxFormState,
+):
+  | { kind: 'close'; max?: MapMax }
+  | { kind: 'redraw'; state: MaxFormState }
+  | { kind: 'refetch'; state: MaxFormState; focus?: MaxField } {
+  if (answer.ok || answer.max !== undefined) {
+    return answer.max === undefined ? { kind: 'close' } : { kind: 'close', max: answer.max };
+  }
+  if (answer.needs === 'listed-spot') {
+    return { kind: 'redraw', state: { filled: values, regions: state.regions, pinRefused: true } };
+  }
+  if (answer.soon !== undefined && answer.soon.choices.length > 0) {
+    return {
+      kind: 'redraw',
+      state: {
+        filled: values,
+        regions: state.regions,
+        soon: { text: answer.text ?? '', choices: answer.soon.choices },
+      },
+    };
+  }
+  if (answer.regions !== undefined && answer.regions.length > 0) {
+    const { regions } = answer;
+    const kept = regions.some((region) => String(region.id) === values.region);
+    return {
+      kind: 'redraw',
+      state: { filled: kept ? values : { ...values, region: '' }, regions },
+    };
+  }
+  const refetch = { kind: 'refetch' as const, state: { filled: values, regions: state.regions } };
+  return answer.needs === 'tier' || answer.needs === 'boss'
+    ? { ...refetch, focus: answer.needs }
+    : refetch;
+}
+
+/** A field of the form a refusal points at (R1-4), by its name. */
+export type MaxField = 'tier' | 'boss';
+
+/**
+ * The field of the form a refusal's `MaxField` focuses, by selector: the tier menu; for the boss,
+ * the name typed where the menu says "Another boss" (R2-3), else the boss menu.
+ */
+export function fieldToFocus(field: MaxField, filled: Partial<MaxValues>): string {
+  if (field === 'tier') return 'select[name="tier"]';
+  return filled.boss === ANOTHER_BOSS ? 'input[name="typed"]' : 'select[name="boss"]';
+}
+
+/** What `submitMax` needs: sending, the lists, and whether the form still holds. */
+export interface MaxSubmitDeps {
+  send(body: Record<string, unknown>): Promise<Pressed & MaxAnswered>;
+  options(): Promise<MaxOptionsView>;
+  /** Whether the form is still the one that holds (its popup may have closed meanwhile). */
+  holds(): boolean;
+}
+
+/** What came of a Submit, for the page to do. */
+export type MaxSubmitted =
+  /** Something is missing: said under the form, nothing sent. */
+  | { kind: 'missing'; text: string }
+  /** The form went away meanwhile: only its words are said. */
+  | { kind: 'gone'; text: string }
+  /** Made, joined or another boss's battle there: the form closes, the battle opened. */
+  | { kind: 'close'; text: string; max?: MapMax }
+  /** The form drawn again from these lists and state, the field pointed at focused. */
+  | {
+      kind: 'draw';
+      lists: MaxOptionsView;
+      state: MaxFormState;
+      text: string;
+      focus?: MaxField;
+    };
+
+/**
+ * The max battle form's Submit (R1-2: the part of `maxUi` with no page in it): the body, the
+ * report, and what the answer leads to; after a refusal that is no question and no regions, the
+ * lists asked for again (A3), the boss picked kept while they still offer it (`keptPick`), and
+ * the lists it had where they cannot be had.
+ */
+export async function submitMax(
+  where: MaxWhere,
+  values: MaxValues,
+  lists: MaxOptionsView,
+  state: MaxFormState,
+  deps: MaxSubmitDeps,
+): Promise<MaxSubmitted> {
+  const body = maxBody(where, values);
+  if ('text' in body) return { kind: 'missing', text: body.text };
+  const sent = await deps.send(body.body);
+  if (!deps.holds()) return { kind: 'gone', text: sent.text };
+  const step = maxFormAfter(sent, values, state);
+  if (step.kind === 'close') {
+    return step.max === undefined
+      ? { kind: 'close', text: sent.text }
+      : { kind: 'close', text: sent.text, max: step.max };
+  }
+  if (step.kind === 'redraw') return { kind: 'draw', lists, state: step.state, text: sent.text };
+  let now = lists;
+  try {
+    now = await deps.options();
+  } catch {
+    // The lists it has stay.
+  }
+  return {
+    kind: 'draw',
+    lists: now,
+    state: { ...step.state, filled: keptPick(now, values) },
+    text: sent.text,
+    ...(step.focus === undefined ? {} : { focus: step.focus }),
+  };
+}
+
+/** What was filled in, its boss kept only while the new lists still offer it (a typed one stays). */
+export function keptPick(options: MaxOptionsView, values: MaxValues): MaxValues {
+  if (values.boss === '' || values.boss === ANOTHER_BOSS) return values;
+  return options.bosses.some((boss) => boss.value === values.boss)
+    ? values
+    : { ...values, boss: '' };
+}
+
+/**
+ * Sends a report with the page's CSRF token as a press is sent (`pressParty`: a 403 of a stale
+ * token is tried once more with a new one; an answer without words says its `error`): the words,
+ * the token now, and what the answer says.
+ */
+export async function sendMaxForm(csrf: string, steps: PressSteps): Promise<Pressed & MaxAnswered> {
+  let last: unknown;
+  const pressed = await pressParty(csrf, {
+    post: async (token) => {
+      const answer = await steps.post(token);
+      last = answer.body;
+      return answer;
+    },
+    me: () => steps.me(),
+  });
+  const read = maxAnswerOf(last);
+  return { ...read, ...pressed };
+}
diff --git a/src/web/client/max-ui.ts b/src/web/client/max-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..68a5cce6c068a842b07216930dfdefc7f40f18ac
--- /dev/null
+++ b/src/web/client/max-ui.ts
@@ -0,0 +1,278 @@
+import type { GeoView } from '../../domain/web/geo-data.js';
+import type { MaxOptionsView } from '../../domain/web/max-data.js';
+import type { MapMax } from '../../domain/web/party-data.js';
+import { getJson, say } from './common.js';
+import {
+  ANOTHER_BOSS,
+  fieldToFocus,
+  maxBox,
+  maxForm,
+  sendMaxForm,
+  submitMax,
+  type MaxField,
+  type MaxFormState,
+  type MaxValues,
+  type MaxWhere,
+} from './max-forms.js';
+import type { Me } from './notice.js';
+import { renderNode } from './popup.js';
+import { readerZone } from './post-time.js';
+import { formPlace, type FormClaim, type FormHold } from './raid-forms.js';
+import { fieldsOf, sayUnder } from './raid-ui.js';
+import { regionsAt, spawnPoint } from './spawn-forms.js';
+
+/**
+ * The max battle form of the live map in the page (plan 8M-9A): "Report max battle here" in a
+ * Power Spot's popup opens it in place of its button; a point of the map picked in the Report
+ * button's step 2 opens it in a popup of its own there, an "Unlisted power spot" (`maxAt`). The
+ * pick lists come from `/api/max-options` (the browser revalidates them by their ETag), asked for
+ * again after any refusal but the ending-soon question and the regions (A3). It is held like the
+ * other forms (`FormHold`, one form at a time). A battle made, joined, or there with another boss
+ * closes the form and is opened (`done`).
+ */
+export interface MaxUiDeps {
+  guild: string;
+  /** The page's CSRF token, which a stale one's renewal changes. */
+  csrf: { get(): string; set(token: string): void };
+  /** The server's regions with their outlines, as `/api/geo` gives them. */
+  regions: GeoView['regions'];
+  /** The form that is open, shared with the other forms. */
+  hold: Pick<FormHold<unknown>, 'editing' | 'take' | 'holds' | 'ready' | 'fit' | 'release'>;
+  /** Opens a popup of its own at the point with this content; `close` closes it. */
+  popupAt(point: { lat: number; lon: number }, content: HTMLElement): { close(): void };
+  /** After a report: the list again, and the battle it names opened. */
+  done(max: MapMax | undefined): Promise<void>;
+  /**
+   * "← Pick a Power Spot" of a battle at a point refused to a member blocked from pins (R1-4):
+   * back to the Power Spots to pick one (the Report button's step 2); none: the form only closes.
+   */
+  pickSpot?(): void;
+}
+
+/** A Power Spot as the map has it from `/api/powerspots`. */
+export interface MapSpot {
+  id: string;
+  title: string;
+  lat: number;
+  lon: number;
+}
+
+/** The name of a report's place at a point of the map: what `/max` calls a pin. */
+export const UNLISTED_SPOT = 'Unlisted power spot';
+
+/** What the page says when the pick lists cannot be loaded. */
+const NO_OPTIONS = 'The bosses could not be loaded. Try again in a moment.';
+
+/** What the page says of a point picked while another form is open. */
+const FORM_OPEN = 'Close the form that is open first.';
+
+export function maxUi(deps: MaxUiDeps) {
+  const { guild, hold } = deps;
+  const options = (): Promise<MaxOptionsView> =>
+    getJson<MaxOptionsView>(`/s/${guild}/api/max-options`);
+
+  const send = async (form: HTMLElement, body: Record<string, unknown>) => {
+    const buttons = form.querySelectorAll('button');
+    for (const each of buttons) each.disabled = true;
+    const sent = await sendMaxForm(deps.csrf.get(), {
+      post: async (token) => {
+        const reply = await fetch(`/s/${guild}/api/maxes`, {
+          method: 'POST',
+          credentials: 'same-origin',
+          headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
+          body: JSON.stringify(body),
+        });
+        return {
+          status: reply.status,
+          body: (await reply.json().catch(() => undefined)) as unknown,
+        };
+      },
+      me: () => getJson<Me>(`/s/${guild}/api/me`),
+    });
+    deps.csrf.set(sent.csrf);
+    for (const each of buttons) each.disabled = false;
+    return sent;
+  };
+
+  /** What the form holds, its ending-soon choice the radio checked. */
+  const valuesOf = (form: HTMLElement): MaxValues => {
+    const fields = fieldsOf(form);
+    const soon = form.querySelector<HTMLInputElement>('input[name="soon"]:checked');
+    return {
+      boss: fields.boss ?? '',
+      typed: fields.typed ?? '',
+      tier: fields.tier ?? '',
+      end: fields.end ?? '',
+      region: fields.region ?? '',
+      soon: soon?.value ?? '',
+    };
+  };
+
+  /**
+   * Draws the form into `box` once the lists came, when its claim still holds and the box is
+   * still in the page; `finish` closes it (and lets the hold go).
+   */
+  const openForm = async (
+    box: HTMLElement,
+    where: MaxWhere,
+    name: string | undefined,
+    claim: FormClaim,
+    finish: () => void,
+    /** The Report button's step 3 (R1-3): the form's first field takes the focus. */
+    focusFirst = false,
+  ): Promise<void> => {
+    let lists: MaxOptionsView;
+    try {
+      lists = await options();
+    } catch {
+      say(NO_OPTIONS);
+      if (hold.holds(claim)) finish();
+      return;
+    }
+    if (!hold.ready(claim, box.isConnected)) return;
+    let state: MaxFormState = {
+      filled: {},
+      regions: regionsAt(spawnPoint(where.lat, where.lon), deps.regions),
+    };
+    /** Draws the form anew, the field named taking the focus (`fieldToFocus`). */
+    const draw = (focus?: MaxField): void => {
+      const form = renderNode(maxForm(name, lists, state, readerZone()), document);
+      const boss = form.querySelector<HTMLSelectElement>('select[name="boss"]');
+      // A boss on no list is typed, with its tier: those rows only for it.
+      boss?.addEventListener('change', () => {
+        for (const row of form.querySelectorAll<HTMLElement>('[data-typed]')) {
+          row.hidden = boss.value !== ANOTHER_BOSS;
+        }
+        hold.fit();
+      });
+      form.addEventListener('click', (event) => {
+        clicked(form, event);
+      });
+      box.replaceChildren(form);
+      hold.fit();
+      if (focus !== undefined) {
+        form.querySelector<HTMLElement>(fieldToFocus(focus, state.filled))?.focus();
+      }
+    };
+    const said = (text: string): void => {
+      const shown = box.firstElementChild;
+      if (shown instanceof HTMLElement) sayUnder(shown, text);
+      else say(text);
+    };
+    const clicked = (form: HTMLElement, event: Event): void => {
+      const target = event.target;
+      if (!(target instanceof HTMLButtonElement)) return;
+      if (target.dataset.cancel !== undefined) {
+        finish();
+        return;
+      }
+      // A member blocked from pins (R1-4): back to the Power Spots, the form closed.
+      if (target.dataset.pickSpot !== undefined) {
+        finish();
+        deps.pickSpot?.();
+        return;
+      }
+      if (target.dataset.submit !== 'max') return;
+      const values = valuesOf(form);
+      void submitMax(where, values, lists, state, {
+        send: (body) => send(form, body),
+        options,
+        holds: () => hold.holds(claim),
+      }).then(async (after) => {
+        switch (after.kind) {
+          case 'missing':
+            sayUnder(form, after.text);
+            return;
+          case 'gone':
+            // A form gone with its popup meanwhile: the words, and the list again.
+            say(after.text);
+            await deps.done(undefined);
+            return;
+          case 'close':
+            finish();
+            say(after.text);
+            await deps.done(after.max);
+            return;
+          case 'draw':
+            if (!hold.holds(claim)) return;
+            lists = after.lists;
+            state = after.state;
+            draw(after.focus);
+            // The ending-soon question is its words over its choices: not said again under them.
+            if (state.soon === undefined) said(after.text);
+        }
+      });
+    };
+    draw(focusFirst ? 'boss' : undefined);
+  };
+
+  /** A click on "Report max battle here" (`maxBox`): the form in place of the button. */
+  const maxClicked = (button: HTMLButtonElement, spot: MapSpot, focusFirst = false): void => {
+    const box = button.parentElement;
+    if (!box) return;
+    const claim = hold.take(formPlace(box));
+    if (!claim) return;
+    void openForm(
+      box,
+      { spot: spot.id, name: spot.title, lat: spot.lat, lon: spot.lon },
+      undefined,
+      claim,
+      () => {
+        box.replaceChildren(button);
+        hold.release(claim);
+      },
+      focusFirst,
+    );
+  };
+
+  return {
+    /** "Report max battle here" for a Power Spot's popup; a click opens the form in its place. */
+    maxControl(spot: MapSpot): HTMLElement {
+      const box = renderNode(maxBox(spot.id), document);
+      const button = box.querySelector('button');
+      button?.addEventListener('click', () => {
+        maxClicked(button, spot);
+      });
+      return box;
+    },
+
+    /** A click on "Report max battle here" found in a spot's popup. */
+    maxClicked,
+
+    /**
+     * A point of the map picked for a max battle (the Report button's step 2): the form of an
+     * unlisted power spot in a popup of its own there; the server names the point (the nearest
+     * Power Spot within 50 meters, else a pin), as `/max` takes a maps link.
+     */
+    maxAt(point: { lat: number; lon: number }, focusFirst = false): void {
+      if (hold.editing) {
+        say(FORM_OPEN);
+        return;
+      }
+      const at = spawnPoint(point.lat, point.lon);
+      const box = document.createElement('div');
+      box.className = 'max-box';
+      box.textContent = 'Loading the bosses…';
+      // Opened first: opening it closes any other popup, which must not take the new claim.
+      const popup = deps.popupAt(at, box);
+      const claim = hold.take(true);
+      if (!claim) {
+        popup.close();
+        return;
+      }
+      void openForm(
+        box,
+        at,
+        UNLISTED_SPOT,
+        claim,
+        () => {
+          hold.release(claim);
+          popup.close();
+        },
+        focusFirst,
+      );
+    },
+  };
+}
+
+export type MaxUi = ReturnType<typeof maxUi>;
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 338df2e55b9c43d1f61b904f721700aa7482489d..39b9fdce2aa9d2d76b826a6452dae70df79dc215 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -28,6 +28,7 @@ import { postFormsUi } from './post-forms-ui.js';
 import { showsParty } from './post-forms.js';
 import { spawnPoint } from './spawn-forms.js';
 import { spawnUi } from './spawn-ui.js';
+import { maxUi, type MapSpot } from './max-ui.js';
 import {
   drawnTrains,
   keepTools,
@@ -252,6 +253,13 @@ export interface MapRaids {
    * place where parties share it (plan 8M-7), else `own`, its own popup.
    */
   gymTapped(gym: MapGym, own: () => void): void;
+  /**
+   * What a Power Spot's popup offers (plan 8M-9A): "Report max battle here" while it is offered
+   * now (`reportOffered`); none otherwise.
+   */
+  spotControls(spot: MapSpot): HTMLElement[];
+  /** The Power Spots whose battle is drawn in place of their dot (A6). */
+  battleSpots(): ReadonlySet<string>;
 }
 
 /**
@@ -799,6 +807,8 @@ export function showParties(
   let placed: Array<PlacedThing & { layer: PlacedLayer }> = [];
   /** The gyms whose raids are drawn in place of their dot. */
   let raidGyms: number[] = [];
+  /** The Power Spots whose battle is drawn in place of their dot (plan 8M-9A, A6). */
+  let battleSpots: ReadonlySet<string> = new Set();
   /** The raids' size drawn last: a zoom into another draws them anew (Matt, 2026-10-25). */
   let drawnSize: MarkerSize | undefined;
   map.on('zoomend', () => {
@@ -1010,8 +1020,9 @@ export function showParties(
         time: raidBadge(max, now, readerZone()),
       });
     }
-    /** A battle's circle drawn at a stop of a train (a Power Spot, `w<id>`): its ring goes round it. */
-    const battleSpots = new Set(
+    // The Power Spots whose battle is drawn (the raids' layer on): their own dot is not (A6), and
+    // a train's ring at one goes round the battle's circle.
+    battleSpots = new Set(
       registry.isOn('raids')
         ? next.maxes.flatMap((max) => (max.spotId === null ? [] : [max.spotId]))
         : [],
@@ -1216,6 +1227,37 @@ export function showParties(
       };
     },
   });
+  // Reporting max battles (plan 8M-9A): "Report max battle here" in a Power Spot's popup opens
+  // the form in its place, a point picked in the Report button's step 2 in a popup there; held
+  // like the other forms. After a battle was made or found there, the list at once and its popup.
+  const maxForms = maxUi({
+    guild,
+    csrf: {
+      get: () => csrf,
+      set: (token) => {
+        csrf = token;
+      },
+    },
+    regions,
+    hold,
+    popupAt: (point, content) => {
+      const popup = L.popup().setLatLng([point.lat, point.lon]).setContent(content).openOn(map);
+      return {
+        close: () => {
+          map.closePopup(popup);
+        },
+      };
+    },
+    done: async (max) => {
+      if (max) {
+        map.closePopup();
+        showing.openNext(`max:${max.id}`);
+      }
+      await poller.now();
+      const open = showing.key;
+      if (open !== undefined) popups.get(open)?.openPopup();
+    },
+  });
   map.on('contextmenu', (event) => {
     if (!reportOffered(mayReport, view)) return;
     spawnForms.spawnAt(spawnPoint(event.latlng.lat, event.latlng.lng));
@@ -1457,6 +1499,8 @@ export function showParties(
     spotClicked: (spot) => trainForms.spotClicked(spot),
     forced: () => trainForms.routing() !== undefined || meetupForms.picking(),
     raidGyms: () => raidGyms,
+    spotControls: (spot) => (reportOffered(mayReport, view) ? [maxForms.maxControl(spot)] : []),
+    battleSpots: () => battleSpots,
     gymTapped: (gym, own) => {
       const target: PlacedThing = {
         key: `gym-dot:${gym.id}`,
diff --git a/src/web/client/places-ui.ts b/src/web/client/places-ui.ts
index be17859f31ce7d5beaf1d69c072f8f908ff43f2f..69913c9e2ac3bc6ad331dc8d39b05394e9bafcbc 100644
--- a/src/web/client/places-ui.ts
+++ b/src/web/client/places-ui.ts
@@ -1,7 +1,7 @@
 import * as L from 'leaflet';
 import type { PowerSpotsView } from '../../domain/web/max-data.js';
 import type { StopsView } from '../../domain/web/meetup-data.js';
-import { PlacesInView, placesWanted } from './cluster.js';
+import { PlacesInView, placesWanted, unoccupied } from './cluster.js';
 import { getJson } from './common.js';
 import type { LayerRegistry } from './layer-registry.js';
 import { StopLoads, stopsBox } from './meetup-forms.js';
@@ -15,9 +15,11 @@ import { onThemeChange, theme, type DrawnColour } from './theme.js';
  * level (`PLACES_FROM`), those of the view are asked for through the existing `/api/stops` and
  * `/api/powerspots` (the box kept to the world, `stopsBox`) at once and again 300 ms after the map
  * rests (`StopLoads`, only the last question's answer shown), drawn as small dots with their name
- * in a popup (Power Spots' popups say no more until plan 8M-9); in route mode a Power Spot tapped
- * is the train's next stop instead (plan 8M-8C, R5: `spotTapped`); "more than shown" is told in
- * one quiet line at the bottom of the map. Logged out the layers are not offered.
+ * in a popup; a Power Spot's popup also offers "Report max battle here" (plan 8M-9A,
+ * `PlacesHooks.spotControls`), and a spot with a battle is not drawn: the battle's marker is
+ * (`occupied`, drawn again from the last answer as the parties change); in route mode a Power
+ * Spot tapped is the train's next stop instead (plan 8M-8C, R5: `spotTapped`); "more than shown"
+ * is told in one quiet line at the bottom of the map. Logged out the layers are not offered.
  */
 
 /** The quiet line at the bottom of the map: one sentence per layer that has more than it shows. */
@@ -91,6 +93,24 @@ export function placeClicks(
   gymClicks(marker, routeTap, open);
 }
 
+/**
+ * What the parties add to the places (plan 8M-9A): a Power Spot's controls in its popup ("Report
+ * max battle here", for a member who may report), and the places whose own thing is drawn in their
+ * place (a spot with a battle: the battle's marker, A6), by layer.
+ */
+export interface PlacesHooks {
+  spotControls(spot: { id: string; title: string; lat: number; lon: number }): HTMLElement[];
+  occupied(layer: 'stops' | 'spots'): ReadonlySet<string>;
+}
+
+/** What the places give the page: asked for anew, or drawn again from their last answers. */
+export interface ShownPlaces {
+  /** The layer, the zoom or who asks changed: asked for when wanted, taken off when not. */
+  refresh(): void;
+  /** What the parties draw changed (a battle at a spot): drawn again from the last answers. */
+  redrawn(): void;
+}
+
 export function showPlaces(
   map: L.Map,
   guild: string,
@@ -101,10 +121,62 @@ export function showPlaces(
   spotTapped: (spot: { id: string; title: string }) => boolean = () => false,
   /** Power Spots as Tab stops in route mode only (re-review N1); left out: never. */
   focus?: Pick<RouteFocus, 'watch'>,
-): { refresh(): void } {
+  hooks?: PlacesHooks,
+): ShownPlaces {
   const checks: Array<() => void> = [];
+  const redraws: Array<() => void> = [];
   for (const layer of LAYERS) {
     const group = L.layerGroup().addTo(map);
+    /** The last answer shown, drawn again when what the parties draw changes. */
+    let last: StopsView | undefined;
+    /**
+     * The places of an answer as dots, but those whose own thing the parties draw in their place
+     * (`unoccupied`: a Power Spot with a battle shows the battle, plan 8M-9A).
+     */
+    const draw = (view: StopsView): void => {
+      group.clearLayers();
+      const colour = theme().colours[layer.colour];
+      const shown = unoccupied(view.stops, hooks?.occupied(layer.id) ?? new Set<string>());
+      for (const [id, lat, lon, title] of shown) {
+        const marker = L.circleMarker([lat, lon], {
+          radius: 5,
+          weight: 2,
+          color: colour,
+          fillOpacity: 0.7,
+        });
+        // Its name, as text of an element of ours (Leaflet sets a string as HTML), and for a Power
+        // Spot what the parties offer there ("Report max battle here", plan 8M-9A); opened by our
+        // own handler rather than bound, which would open it before anything of ours.
+        const open = (): void => {
+          const content = renderNode(
+            {
+              tag: 'div',
+              className: 'place-popup',
+              children: [{ tag: 'strong', className: 'place-name', text: title }],
+            },
+            document,
+          );
+          if (layer.id === 'spots')
+            content.append(...(hooks?.spotControls({ id, title, lat, lon }) ?? []));
+          L.popup().setLatLng([lat, lon]).setContent(content).openOn(map);
+        };
+        // A Power Spot tapped (or Enter on it) in route mode is the next stop of the train
+        // (plan 8M-8C, R5; review C10), as a gym is (`placeClicks`): no popup then.
+        if (layer.id === 'spots')
+          placeClicks(marker, title, () => spotTapped({ id, title }), open, focus);
+        else {
+          marker.on('click', (event: L.LeafletMouseEvent) => {
+            L.DomEvent.stopPropagation(event);
+            open();
+          });
+        }
+        marker.addTo(group);
+      }
+      registry.setCount(layer.id, shown.length);
+    };
+    redraws.push(() => {
+      if (last) draw(last);
+    });
     const loads = new StopLoads({
       load: async () => {
         const bounds = map.getBounds();
@@ -123,38 +195,8 @@ export function showPlaces(
         return layer.read(await getJson<unknown>(`${layer.url(guild)}?${query.toString()}`));
       },
       show: (view) => {
-        group.clearLayers();
-        const colour = theme().colours[layer.colour];
-        for (const [id, lat, lon, title] of view.stops) {
-          const marker = L.circleMarker([lat, lon], {
-            radius: 5,
-            weight: 2,
-            color: colour,
-            fillOpacity: 0.7,
-          });
-          // Its name, as text of an element of ours (Leaflet sets a string as HTML); opened by our
-          // own handler rather than bound, which would open it before anything of ours.
-          const open = (): void => {
-            L.popup()
-              .setLatLng([lat, lon])
-              .setContent(
-                renderNode({ tag: 'strong', className: 'place-name', text: title }, document),
-              )
-              .openOn(map);
-          };
-          // A Power Spot tapped (or Enter on it) in route mode is the next stop of the train
-          // (plan 8M-8C, R5; review C10), as a gym is (`placeClicks`): no popup then.
-          if (layer.id === 'spots')
-            placeClicks(marker, title, () => spotTapped({ id, title }), open, focus);
-          else {
-            marker.on('click', (event: L.LeafletMouseEvent) => {
-              L.DomEvent.stopPropagation(event);
-              open();
-            });
-          }
-          marker.addTo(group);
-        }
-        registry.setCount(layer.id, view.stops.length);
+        last = view;
+        draw(view);
       },
       more: (more) => {
         quiet.set(layer.id, more ? MORE_THAN_SHOWN[layer.id] : undefined);
@@ -171,6 +213,7 @@ export function showPlaces(
     const places = new PlacesInView({
       loads,
       clear: () => {
+        last = undefined;
         group.clearLayers();
         quiet.set(layer.id, undefined);
         registry.setCount(layer.id, 0);
@@ -197,5 +240,10 @@ export function showPlaces(
     for (const check of checks) check();
   };
   refresh();
-  return { refresh };
+  return {
+    refresh,
+    redrawn: () => {
+      for (const redraw of redraws) redraw();
+    },
+  };
 }
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index 4551cd01b2d215c60750f54396c2eedc17a5346a..261bbffdb4f4c1723e5a6848cf1c30497cfc4b5e 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -49,7 +49,7 @@ export interface RaidUiDeps {
 /**
  * The controls that open a form ("Report raid", "Change…", "Report spawn here", and of trains
  * "New train", "Edit route", "Move…", "Manage…", "Split…", and of meetups "New meetup", "Meetup
- * here", "Edit…") under `root`, on or off; with them the choices of a gym's raids, which draw the
+ * here", "Edit…", and "Report max battle here") under `root`, on or off; with them the choices of a gym's raids, which draw the
  * popup or phone card anew (review W-3).
  */
 export function formControls(root: ParentNode, on: boolean): void {
@@ -59,7 +59,7 @@ export function formControls(root: ParentNode, on: boolean): void {
       'button[data-manage-train], button[data-split-train], ' +
       'button[data-new-meetup], button[data-meetup-here], button[data-edit-meetup], ' +
       'button[data-regroup], button[data-meet], button[data-close-party], ' +
-      'button[data-report-party]',
+      'button[data-report-party], button[data-report-max]',
   )) {
     button.disabled = !on;
   }
````

### Task 3: 8M-9A task 3: the Report button, its step 1, icons, Gyms off by default

Prototype commit: `d86fba2292571f729ee2546074060373cd7edc8a`

The Report button, for a member who may report: in the header before
"Find a gym" on a wide screen (#report-button, hidden in the template),
over the map at the bottom right above "Show where I am" on a phone, and a
line of its own at the top of the phone's list that shows the map first.
Step 1 is a menu in Discord's look, a sheet on a phone and a small panel
under the button on a wide screen, a dialog for the keyboard (SheetFocus;
Escape and Cancel close it): Raid, Max battle, Wild spawn, Train, Meetup,
a data list (REPORT_KINDS) to which 8M-9B adds two entries. Its icons
(report-icons.ts): the game's raid icon and Poke Ball from pogo_assets at
the commit Pine's other game pictures are pinned to, an origin the page
loads already, and Pine's own drawings for max battles, trains and
meetups, outlined by theme values. A raid, max battle or spawn goes to a
first step 2 in the side pane's box (an aside claim, as route mode) with
the gyms or Power Spots drawn whatever the layers say, a tap opening the
place as before; a train and a meetup open their forms. The Gyms layer is
off by default (a browser that kept it on keeps it on); up to 1024 pixels
the desktop title says "Pine" so that the header stays one row.

**Files:**

```
 src/web/client/layer-registry.test.ts       |  21 +++++---
 src/web/client/layer-registry.ts            |   7 +--
 src/web/client/main.ts                      |  12 ++++-
 src/web/client/map.css                      | 193 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/party-layer.isolated.test.ts |   9 ++++
 src/web/client/party-layer.ts               |  75 +++++++++++++++++++++++----
 src/web/client/places-ui.ts                 |  10 ++--
 src/web/client/report-flow.test.ts          |  52 +++++++++++++++++++
 src/web/client/report-flow.ts               |  69 +++++++++++++++++++++++++
 src/web/client/report-icons.ts              |  60 ++++++++++++++++++++++
 src/web/client/report-menu.test.ts          |  74 +++++++++++++++++++++++++++
 src/web/client/report-menu.ts               | 102 +++++++++++++++++++++++++++++++++++++
 src/web/client/report-ui.isolated.test.ts   | 180 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/report-ui.ts                 | 409 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/theme.css                    |   3 ++
 src/web/page.test.ts                        |   6 +++
 src/web/page.ts                             |   3 ++
 src/web/phone-header.test.ts                |  17 +++++++
 src/web/report-icons.test.ts                |  37 ++++++++++++++
 19 files changed, 1316 insertions(+), 23 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/layer-registry.test.ts src/web/client/party-layer.isolated.test.ts src/web/client/report-flow.test.ts src/web/client/report-menu.test.ts src/web/client/report-ui.isolated.test.ts src/web/page.test.ts src/web/phone-header.test.ts src/web/report-icons.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff d86fba2292571f729ee2546074060373cd7edc8a -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m9a-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-9A task 3: the Report button, its step 1, icons, Gyms off by default`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/layer-registry.test.ts b/src/web/client/layer-registry.test.ts
index 800c0aef109128a8410e1334af88535fd83aa8f4..485518eb4ba5a0cdcd1bebc656030c7285d92d0c 100644
--- a/src/web/client/layer-registry.test.ts
+++ b/src/web/client/layer-registry.test.ts
@@ -39,15 +39,15 @@ function mapRegistry(kept: ViewStorage | undefined): LayerRegistry {
 }
 
 describe('the layers of the map (plan 8M-7)', () => {
-  it('are on by default for what happens now and the gyms, off for the other places and spawns', () => {
+  it('are on by default for what happens now, off for the places and spawns (plan 8M-9A)', () => {
     const registry = mapRegistry(storage());
     expect(registry.layers().map((layer) => [layer.id, registry.isOn(layer.id)])).toEqual([
       ['raids', true],
       ['trains', true],
       ['meetups', true],
       ['spawns', false],
-      // On until plan 8M-9's Report button (fix round 1): Report raid is in a gym's popup.
-      ['gyms', true],
+      // Off since the Report button (plan 8M-9A): its step 2 draws the gyms to pick from.
+      ['gyms', false],
       ['stops', false],
       ['spots', false],
       ['outlines', true],
@@ -83,6 +83,14 @@ describe('the layers of the map (plan 8M-7)', () => {
     expect(next.isOn('trains')).toBe(true);
   });
 
+  // Plan 8M-9A: the Gyms layer's default changed, the choices kept by earlier visits did not.
+  it('keeps the Gyms layer on for a browser that kept it on', () => {
+    const kept = storage();
+    kept.items.set(LAYERS_KEY, '{"gyms":true}');
+    expect(mapRegistry(kept).isOn('gyms')).toBe(true);
+    expect(mapRegistry(storage()).isOn('gyms')).toBe(false);
+  });
+
   it('works on with the defaults where the browser keeps nothing or something else', () => {
     const refusing = mapRegistry(storage(true));
     expect(refusing.isOn('raids')).toBe(true);
@@ -93,7 +101,7 @@ describe('the layers of the map (plan 8M-7)', () => {
     const odd = storage();
     odd.items.set(LAYERS_KEY, '{"gyms":"yes","raids":false}');
     const read = mapRegistry(odd);
-    expect(read.isOn('gyms')).toBe(true);
+    expect(read.isOn('gyms')).toBe(false);
     expect(read.isOn('raids')).toBe(false);
     odd.items.set(LAYERS_KEY, 'not json');
     expect(mapRegistry(odd).isOn('raids')).toBe(true);
@@ -115,9 +123,10 @@ describe('the layers of the map (plan 8M-7)', () => {
     registry.setOffered('spawns', true);
     expect(offered(true)).toContain('spawns');
     registry.set('stops', true);
-    expect(registry.countOn(true)).toBe(6);
+    // Raids, trains, meetups, outlines and the stops: the Gyms layer is off (plan 8M-9A).
+    expect(registry.countOn(true)).toBe(5);
     // The stops are not offered to a visitor: not counted, though kept on.
-    expect(registry.countOn(false)).toBe(5);
+    expect(registry.countOn(false)).toBe(4);
   });
 
   it("words the phone's button and its sheet's counts", () => {
diff --git a/src/web/client/layer-registry.ts b/src/web/client/layer-registry.ts
index 3cf41ef374840246326f532f1c5a3230c5b323f8..c208449c02326cd1cad03cbba8e9bc0d81d76cb1 100644
--- a/src/web/client/layer-registry.ts
+++ b/src/web/client/layer-registry.ts
@@ -30,9 +30,10 @@ export const MAP_LAYERS: readonly LayerSpec[] = [
   { id: 'trains', name: 'Trains', on: true, kind: 'live' },
   { id: 'meetups', name: 'Meetups', on: true, kind: 'live' },
   { id: 'spawns', name: 'Wild spawns', on: false, kind: 'background', waits: true },
-  // On until plan 8M-9's Report button exists: "Report raid" is in a gym's popup, and reporting
-  // is a member's first job (fix round 1; 8M-9 turns it off).
-  { id: 'gyms', name: 'Gyms', on: true, kind: 'background', hint: 'Grouped when zoomed out' },
+  // Off since the Report button (plan 8M-9A): its step 2 draws the gyms to pick from whatever
+  // this says (on until then, fix round 1 of 8M-7: "Report raid" was in a gym's popup alone). A
+  // browser that kept the layer on keeps it on.
+  { id: 'gyms', name: 'Gyms', on: false, kind: 'background', hint: 'Grouped when zoomed out' },
   {
     id: 'stops',
     name: 'PokéStops',
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index d0a3d3521ccd9c46f37eb67c6019e7e9be2d1f16..a593adce0e945f358343c4718fc2ba3f4b4ad538 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -217,7 +217,9 @@ function start(): void {
       const member = me.loggedIn && (me.member || me.readOnly);
       controls.refresh(member);
       // A Power Spot tapped is a stop in route mode (plan 8M-8C, R5), once the parties are drawn.
-      const spotTaps: { clicked: (spot: { id: string; title: string }) => boolean } = {
+      const spotTaps: {
+        clicked: (spot: { id: string; title: string; lat: number; lon: number }) => boolean;
+      } = {
         clicked: () => false,
       };
       // A Power Spot's popup offers "Report max battle here", and a spot whose battle is drawn
@@ -225,6 +227,7 @@ function start(): void {
       const placesHooks: PlacesHooks = {
         spotControls: () => [],
         occupied: () => new Set(),
+        forced: () => false,
       };
       const places = showPlaces(
         map,
@@ -237,6 +240,7 @@ function start(): void {
         {
           spotControls: (spot) => placesHooks.spotControls(spot),
           occupied: (layer) => placesHooks.occupied(layer),
+          forced: (layer) => placesHooks.forced(layer),
         },
       );
       if (!me.loggedIn || !member) {
@@ -270,6 +274,11 @@ function start(): void {
         },
         // The settings' units (task 7), as Discord says distances.
         units: data.distanceUnits === 'metric' ? 'metric' : 'imperial',
+        // The Report button's step 2 (plan 8M-9A): the gyms and places it draws follow.
+        placesChanged: () => {
+          dots.refresh();
+          places.refresh();
+        },
         routeMode: (on) => {
           routeFocus.set(on);
         },
@@ -280,6 +289,7 @@ function start(): void {
       spotTaps.clicked = (spot) => raids.spotClicked(spot);
       placesHooks.spotControls = (spot) => raids.spotControls(spot);
       placesHooks.occupied = (layer) => (layer === 'spots' ? raids.battleSpots() : new Set());
+      placesHooks.forced = (layer) => raids.forcedPlaces(layer);
       places.redrawn();
       gymExtras.forced = () => raids.forced();
       gymExtras.raidGyms = () => raids.raidGyms();
diff --git a/src/web/client/map.css b/src/web/client/map.css
index d3d8b0b13d2d2ce696d1e43c3a28d1ebcc89219b..43824f177771e6a277c115afd69fd1837b308e7e 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -147,6 +147,20 @@ a {
   }
 }
 
+/*
+ * With the Report button in it (plan 8M-9A), the desktop's one row needs the room up to 1024
+ * pixels: the title is "Pine" there too and "Find a gym" starts narrower.
+ */
+@media (min-width: 768px) and (max-width: 1023px) {
+  #header .title-first {
+    display: none;
+  }
+
+  #filter {
+    flex-basis: 120px;
+  }
+}
+
 /*
  * The layers (plan 8M-7): on the desktop a row of toggles in the header, the background layers
  * under "More"; narrower than 768 pixels a "Layers · n" button and a bottom sheet.
@@ -546,6 +560,185 @@ a {
   }
 }
 
+/*
+ * The Report button (plan 8M-9A): in the header on a wide screen; on a phone a round button over
+ * the map at the bottom right, above "Show where I am" (`.report-control`), so that the header
+ * stays one row, and a line of its own at the top of the list while the list is shown.
+ */
+#report-button,
+.report-control .report,
+.report-line {
+  padding: 6px 14px;
+  border: 0;
+  border-radius: var(--radius);
+  background: var(--primary);
+  color: var(--on-color);
+  font: inherit;
+  font-weight: 600;
+  cursor: pointer;
+}
+
+#report-button:hover,
+.report-control .report:hover,
+.report-line:hover {
+  background: var(--primary-hover);
+}
+
+.report-control {
+  display: none;
+}
+
+.report-control .report {
+  height: 40px;
+  padding: 0 16px;
+  border-radius: 20px;
+  box-shadow: 0 2px 6px var(--shadow);
+}
+
+.report-line {
+  display: none;
+  width: 100%;
+  margin-bottom: 8px;
+}
+
+@media (max-width: 767px) {
+  #report-button {
+    display: none;
+  }
+
+  .report-control {
+    display: block;
+  }
+
+  body.list-open .report-line {
+    display: block;
+  }
+}
+
+/* The menu of step 1: a sheet on a phone, a small panel under the button on a wide screen. */
+.report-wrap {
+  position: fixed;
+  inset: 0;
+  z-index: 2000;
+}
+
+.report-wrap .scrim {
+  position: absolute;
+  inset: 0;
+  background: var(--scrim);
+}
+
+.report-menu {
+  position: absolute;
+  top: 52px;
+  width: 260px;
+  padding: 12px;
+  border-radius: var(--card-radius);
+  background: var(--page-bg);
+  color: var(--text);
+  box-shadow: 0 8px 24px var(--shadow);
+}
+
+.report-menu h2 {
+  margin: 0 0 8px;
+  font-size: 16px;
+}
+
+.report-kinds {
+  display: flex;
+  flex-direction: column;
+  gap: 4px;
+}
+
+.report-kind {
+  display: flex;
+  align-items: center;
+  gap: 12px;
+  padding: 8px;
+  border: 0;
+  border-radius: var(--radius);
+  background: var(--card-bg);
+  color: var(--text);
+  font: inherit;
+  font-weight: 600;
+  text-align: left;
+  cursor: pointer;
+}
+
+.report-kind:hover,
+.report-kind:focus-visible {
+  background: var(--secondary-hover);
+}
+
+.report-cancel {
+  width: 100%;
+  margin-top: 8px;
+}
+
+/* The icons, outlined to read on any background (Matt's notes, 2026-10-25). */
+.report-icon {
+  flex: none;
+  width: 28px;
+  height: 28px;
+  object-fit: contain;
+  filter: drop-shadow(0 0 1px var(--icon-outline)) drop-shadow(0 0 1px var(--icon-outline));
+}
+
+.report-icon svg {
+  display: block;
+  width: 100%;
+  height: 100%;
+}
+
+.report-icon.shape-max {
+  color: var(--tier-dynamax);
+}
+
+.report-icon.shape-train {
+  color: var(--train);
+}
+
+.report-icon.shape-meetup {
+  color: var(--meetup);
+}
+
+@media (max-width: 767px) {
+  .report-menu {
+    top: auto;
+    right: 0;
+    bottom: 0;
+    left: 0;
+    width: auto;
+    max-height: 80vh;
+    overflow-y: auto;
+    padding: 12px 16px 16px;
+    border-radius: 16px 16px 0 0;
+  }
+}
+
+/* Step 2: where, in the side pane's box (docked under the map on a phone). */
+.report-pick {
+  display: flex;
+  flex-direction: column;
+  gap: 8px;
+}
+
+.report-pick .report-pick-head {
+  display: flex;
+  align-items: center;
+  gap: 8px;
+  font-weight: 700;
+}
+
+.report-pick .form-buttons {
+  display: flex;
+  gap: 6px;
+}
+
+.report-pick [data-pick-heading]:focus {
+  outline: none;
+}
+
 .search-button {
   display: none;
   padding: 6px 12px;
diff --git a/src/web/client/party-layer.isolated.test.ts b/src/web/client/party-layer.isolated.test.ts
index 4110d6665be027772bf3c4302071778d3d031d1c..f2fedfc2964dc10d986e672fadf913f3b9a6007c 100644
--- a/src/web/client/party-layer.isolated.test.ts
+++ b/src/web/client/party-layer.isolated.test.ts
@@ -26,6 +26,13 @@ vi.mock('leaflet', () => ({
     stop: (event: unknown) => {
       stopped.push(event);
     },
+    disableClickPropagation: () => undefined,
+  },
+  // The Report button's control over the map (plan 8M-9A), added and never drawn here.
+  Control: class {
+    addTo() {
+      return this;
+    }
   },
   layerGroup: () => {
     const group = { addTo: () => group, clearLayers: () => group };
@@ -264,6 +271,8 @@ describe("the map's popups (showParties)", () => {
     vi.stubGlobal('document', {
       createElement: (tag: string) => new PageElement(tag),
       getElementById: (id: string) => new PageElement(id),
+      // Where the Report button's menu waits, hidden (plan 8M-9A).
+      body: new PageElement('body'),
       addEventListener: () => undefined,
       querySelectorAll: () => [],
       visibilityState: 'hidden',
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 39b9fdce2aa9d2d76b826a6452dae70df79dc215..930a8ac4d516061bbd16d40736cdea248eb6eaea 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -29,6 +29,7 @@ import { showsParty } from './post-forms.js';
 import { spawnPoint } from './spawn-forms.js';
 import { spawnUi } from './spawn-ui.js';
 import { maxUi, type MapSpot } from './max-ui.js';
+import { reportUi } from './report-ui.js';
 import {
   drawnTrains,
   keepTools,
@@ -221,6 +222,8 @@ export interface PartyFrame {
   units: DistanceUnits;
   /** Route mode began or ended: the dots to add as stops are Tab stops only meanwhile (N1). */
   routeMode?: (on: boolean) => void;
+  /** The Report button's step 2 began or ended (plan 8M-9A): the gyms and places it draws follow. */
+  placesChanged?: () => void;
 }
 
 export interface MapRaids {
@@ -237,10 +240,11 @@ export interface MapRaids {
    */
   gymClicked(gym: MapGym): boolean;
   /**
-   * A Power Spot of the map's layer tapped: in route mode it is added as the next stop of the
-   * train being arranged, and true says its popup is not wanted (plan 8M-8C, R5).
+   * A Power Spot of the map's layer tapped: in the Report button's step 2 of a max battle it goes on
+   * to step 3, of a spawn its place is the point (plan 8M-9A); in route mode it is added as the next
+   * stop of the train being arranged (plan 8M-8C, R5). True says its popup is not wanted.
    */
-  spotClicked(spot: { id: string; title: string }): boolean;
+  spotClicked(spot: { id: string; title: string; lat: number; lon: number }): boolean;
   /**
    * A gym is to be clicked (route mode, a meetup's place picked): the map draws every gym,
    * whatever the Gyms layer (plan 8M-7).
@@ -260,6 +264,11 @@ export interface MapRaids {
   spotControls(spot: MapSpot): HTMLElement[];
   /** The Power Spots whose battle is drawn in place of their dot (A6). */
   battleSpots(): ReadonlySet<string>;
+  /**
+   * The PokéStops or Power Spots are to be tapped (the Report button's step 2, A4): drawn whatever
+   * their layer says, as `forced` draws the gyms.
+   */
+  forcedPlaces(layer: 'stops' | 'spots'): boolean;
 }
 
 /**
@@ -401,7 +410,7 @@ export function showParties(
    * next stop; true when its popup is not wanted.
    */
   const gymClicked = (gym: MapGym): boolean =>
-    meetupForms.gymClicked(gym) || trainForms.gymClicked(gym);
+    report.gymClicked(gym) || meetupForms.gymClicked(gym) || trainForms.gymClicked(gym);
 
   const context = (): ShowContext => ({
     now: Date.now(),
@@ -945,6 +954,9 @@ export function showParties(
 
   const redraw = (next: PartiesView): void => {
     view = next;
+    // Whether Report is still offered, asked first (R1-9): a step 2 that ends here ends before
+    // anything is drawn, with nothing drawn anew inside this draw.
+    report.refresh();
     const reopen = showing.key;
     for (const group of Object.values(groups)) group.clearLayers();
     popups.clear();
@@ -1004,7 +1016,9 @@ export function showParties(
         max.title,
         (made) => withPopup(made, key, () => partyPopup(max, () => maxPopup(max, context()))),
         () =>
-          max.spotId !== null && trainForms.spotClicked({ id: max.spotId, title: max.place.name }),
+          report.spotClicked(max.place) ||
+          (max.spotId !== null &&
+            trainForms.spotClicked({ id: max.spotId, title: max.place.name })),
         () => {
           openAt(key, marker);
         },
@@ -1125,10 +1139,11 @@ export function showParties(
     // "New train" (or the form or route editor open in its place) for a member who may; a form
     // open there stays whatever the list says, and is shown over the list (plan 8M-7), which
     // comes back when it closes.
-    const formOpen = trainForms.inTools() || meetupForms.inTools();
+    const formOpen = trainForms.inTools() || meetupForms.inTools() || report.inTools();
     const offered = reportOffered(mayReport, next) || formOpen;
     keepTools<ChildNode>(panel, offered ? tools : undefined);
-    panel.append(listSection);
+    // The phone list's own Report line (plan 8M-9A, A7), over the list.
+    panel.append(...(offered ? [report.line] : []), listSection);
     paneShown();
     // The list of what is on (plan 8M-7): every party the layers on show, across the server;
     // trains and raids the map cannot draw, and meetups without a place, keep their line.
@@ -1430,8 +1445,46 @@ export function showParties(
   };
   // A point of the map clicked while a meetup's place is picked: a pin there.
   map.on('click', (event: L.LeafletMouseEvent) => {
-    meetupForms.mapClicked({ lat: event.latlng.lat, lon: event.latlng.lng });
+    const point = { lat: event.latlng.lat, lon: event.latlng.lng };
+    if (!report.mapClicked(point)) meetupForms.mapClicked(point);
+  });
+
+  // The Report button (plan 8M-9A): step 1's menu, step 2 in the side pane's box with the fitting
+  // places drawn (the gyms through `forced`, the Power Spots through `forcedPlaces`), and step 3
+  // the kind's own form, as a tap on its place opens it.
+  const report = reportUi({
+    map,
+    hold,
+    tools,
+    offered: () => reportOffered(mayReport, view),
+    placesChanged: () => {
+      frame.placesChanged?.();
+    },
+    // The parties drawn anew (R1-9: not from inside their own draw).
+    redrawn: () => {
+      if (view) hold.shown(view);
+    },
+    popupOpen: () => showing.popup !== undefined,
+    closePopup: () => {
+      map.closePopup();
+    },
+    closeCard: () => {
+      card.close();
+    },
+    showMap: () => {
+      frame.showMap();
+    },
+    startTrain: () => {
+      trainForms.newTrainClicked();
+    },
+    startMeetup: () => {
+      meetupForms.newMeetupClicked();
+    },
+    spawnAt: (point) => {
+      spawnForms.spawnAt(spawnPoint(point.lat, point.lon));
+    },
   });
+  report.refresh();
 
   const poller = new Poller({
     everyMs: EVERY_MS,
@@ -1496,8 +1549,10 @@ export function showParties(
         : [],
     editing: () => hold.editing,
     gymClicked: (gym) => gymClicked(gym),
-    spotClicked: (spot) => trainForms.spotClicked(spot),
-    forced: () => trainForms.routing() !== undefined || meetupForms.picking(),
+    spotClicked: (spot) => report.spotClicked(spot) || trainForms.spotClicked(spot),
+    forced: () =>
+      trainForms.routing() !== undefined || meetupForms.picking() || report.picks('gyms'),
+    forcedPlaces: (layer) => report.picks(layer),
     raidGyms: () => raidGyms,
     spotControls: (spot) => (reportOffered(mayReport, view) ? [maxForms.maxControl(spot)] : []),
     battleSpots: () => battleSpots,
diff --git a/src/web/client/places-ui.ts b/src/web/client/places-ui.ts
index 69913c9e2ac3bc6ad331dc8d39b05394e9bafcbc..c3f4f27ac1fb29fdcdd6f6863c7418c58c7f67cf 100644
--- a/src/web/client/places-ui.ts
+++ b/src/web/client/places-ui.ts
@@ -101,6 +101,8 @@ export function placeClicks(
 export interface PlacesHooks {
   spotControls(spot: { id: string; title: string; lat: number; lon: number }): HTMLElement[];
   occupied(layer: 'stops' | 'spots'): ReadonlySet<string>;
+  /** The places are to be tapped (the Report button's step 2, A4): drawn whatever the layer says. */
+  forced(layer: 'stops' | 'spots'): boolean;
 }
 
 /** What the places give the page: asked for anew, or drawn again from their last answers. */
@@ -118,7 +120,8 @@ export function showPlaces(
   quiet: QuietLine,
   member: () => boolean,
   /** A Power Spot tapped: true where route mode took it as a stop (plan 8M-8C, R5). */
-  spotTapped: (spot: { id: string; title: string }) => boolean = () => false,
+  spotTapped: (spot: { id: string; title: string; lat: number; lon: number }) => boolean = () =>
+    false,
   /** Power Spots as Tab stops in route mode only (re-review N1); left out: never. */
   focus?: Pick<RouteFocus, 'watch'>,
   hooks?: PlacesHooks,
@@ -163,7 +166,7 @@ export function showPlaces(
         // A Power Spot tapped (or Enter on it) in route mode is the next stop of the train
         // (plan 8M-8C, R5; review C10), as a gym is (`placeClicks`): no popup then.
         if (layer.id === 'spots')
-          placeClicks(marker, title, () => spotTapped({ id, title }), open, focus);
+          placeClicks(marker, title, () => spotTapped({ id, title, lat, lon }), open, focus);
         else {
           marker.on('click', (event: L.LeafletMouseEvent) => {
             L.DomEvent.stopPropagation(event);
@@ -219,7 +222,8 @@ export function showPlaces(
         registry.setCount(layer.id, 0);
       },
     });
-    const wanted = (): boolean => placesWanted(registry.isOn(layer.id), map.getZoom(), member());
+    const wanted = (): boolean =>
+      placesWanted(registry.isOn(layer.id), map.getZoom(), member(), hooks?.forced(layer.id));
     map.on('moveend', () => {
       places.changed(wanted(), true);
     });
diff --git a/src/web/client/report-flow.test.ts b/src/web/client/report-flow.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ddc01fc7e2c2036907cab3959cd17f3034546e0a
--- /dev/null
+++ b/src/web/client/report-flow.test.ts
@@ -0,0 +1,52 @@
+import { describe, expect, it } from 'vitest';
+import type { PageNode } from './popup.js';
+import { pickBox } from './report-flow.js';
+import { REPORT_KINDS } from './report-menu.js';
+
+/** Every text of a tree, in order. */
+const texts = (node: PageNode): string[] => [
+  ...(node.text === undefined ? [] : [node.text]),
+  ...(node.children ?? []).flatMap(texts),
+];
+
+/** The nodes of a tree with this tag. */
+const tagged = (node: PageNode, tag: string): PageNode[] => [
+  ...(node.tag === tag ? [node] : []),
+  ...(node.children ?? []).flatMap((child) => tagged(child, tag)),
+];
+
+const kind = (id: string) => {
+  const found = REPORT_KINDS.find((one) => one.id === id);
+  if (!found) throw new Error(id);
+  return found;
+};
+
+describe("the Report button's step 2 (plan 8M-9A)", () => {
+  it('says what to tap for each kind, with a way back to step 1 and Cancel', () => {
+    const raid = pickBox(kind('raid'));
+    expect(texts(raid)).toEqual([
+      'Report a raid',
+      'Tap a gym on the map to report its raid.',
+      '← Back',
+      'Cancel',
+    ]);
+    // R1-3: its words told as they change; its heading takes the focus as step 2 begins.
+    expect(raid.attributes).toMatchObject({ 'aria-live': 'polite' });
+    expect(tagged(raid, 'span').find((span) => span.text === 'Report a raid')?.attributes).toEqual({
+      tabindex: '-1',
+      'data-pick-heading': '',
+    });
+    expect(tagged(raid, 'button').map((button) => button.attributes)).toEqual([
+      { type: 'button', 'data-report-back': '' },
+      { type: 'button', 'data-cancel': '' },
+    ]);
+    expect(texts(pickBox(kind('max'))).slice(0, 2)).toEqual([
+      'Report a max battle',
+      'Tap a Power Spot on the map.',
+    ]);
+    expect(texts(pickBox(kind('spawn'))).slice(0, 2)).toEqual([
+      'Report a wild spawn',
+      'Tap the map where the Pokémon is.',
+    ]);
+  });
+});
diff --git a/src/web/client/report-flow.ts b/src/web/client/report-flow.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e08ff08a6aecebfcd184c0b58d31c0673487159d
--- /dev/null
+++ b/src/web/client/report-flow.ts
@@ -0,0 +1,69 @@
+import type { PageNode } from './popup.js';
+import { iconNode, type ReportKind, type ReportPick } from './report-menu.js';
+
+/**
+ * The Report button's step 2, where (plan 8M-9A; design "Reporting"): the places that fit drawn on
+ * the map whatever the layers say (gyms for a raid, Power Spots for a max battle, any point for a
+ * spawn), and in the side pane's box (docked under the map on a phone) what to tap, a way back to
+ * step 1 and Cancel. A tap on a place goes to step 3, the kind's own form with the place. Pure;
+ * the page's side is `report-ui.ts`.
+ */
+
+/** What step 2 says to tap, by how the kind's place is picked. */
+const PICK_HINTS: Readonly<Record<Exclude<ReportPick, 'form'>, string>> = {
+  gyms: 'Tap a gym on the map to report its raid.',
+  spots: 'Tap a Power Spot on the map.',
+  stops: 'Tap a PokéStop on the map.',
+  point: 'Tap the map where the Pokémon is.',
+};
+
+/**
+ * Step 2 of a kind: its heading with its icon (a heading that takes the focus as step 2 begins,
+ * and a box whose words are told as they change: R1-3), what to tap, ← Back and Cancel.
+ */
+export function pickBox(kind: ReportKind): PageNode {
+  const hint = kind.pick === 'form' ? '' : PICK_HINTS[kind.pick];
+  return {
+    tag: 'div',
+    className: 'report-pick',
+    attributes: {
+      'data-form': 'report-pick',
+      role: 'group',
+      'aria-label': kind.heading,
+      'aria-live': 'polite',
+    },
+    children: [
+      {
+        tag: 'div',
+        className: 'report-pick-head',
+        children: [
+          iconNode(kind.icon),
+          {
+            tag: 'span',
+            text: kind.heading,
+            attributes: { tabindex: '-1', 'data-pick-heading': '' },
+          },
+        ],
+      },
+      { tag: 'p', className: 'hint', text: hint },
+      {
+        tag: 'div',
+        className: 'form-buttons',
+        children: [
+          {
+            tag: 'button',
+            className: 'press',
+            text: '← Back',
+            attributes: { type: 'button', 'data-report-back': '' },
+          },
+          {
+            tag: 'button',
+            className: 'press',
+            text: 'Cancel',
+            attributes: { type: 'button', 'data-cancel': '' },
+          },
+        ],
+      },
+    ],
+  };
+}
diff --git a/src/web/client/report-icons.ts b/src/web/client/report-icons.ts
new file mode 100644
index 0000000000000000000000000000000000000000..787afc0a630e23cb1476a165ecc9555d232fb8d1
--- /dev/null
+++ b/src/web/client/report-icons.ts
@@ -0,0 +1,60 @@
+/**
+ * The icons of the Report button's menu (plan 8M-9A; Matt's notes of 2026-10-25, follow-ups "From
+ * Phase 8M-7"): the game's own where one fits, outlined to read on any background (a
+ * `drop-shadow` of `theme.css`'s values, `map.css`), else Pine's own drawing. The game's pictures
+ * are PokeMiners' pogo_assets at one pinned commit, on raw.githubusercontent.com, an origin the
+ * page loads pictures from already (`pictureOrigins`: the stops' `ENCOUNTER_PICTURE`), so the
+ * Content Security Policy is unchanged; `report-icons.test.ts` holds every address to that. Pine's
+ * own are paths of a 24-pixel square, drawn in the color of what they stand for (`currentColor`).
+ *
+ * - Raid: the game's raid icon (`Images/Raids/ic_raid_small.png`, the picture the screenshot
+ *   reader's tier heads were matched against).
+ * - Wild spawn: the game's Poké Ball (`Images/Items/pokeball_sprite.png`).
+ * - Max battle: Pine's own burst, until Matt picks the game's Dynamax icon by hand (it is not in
+ *   pogo_assets; the official map's bundle and the Pokémon GO wiki have it, which are never fetched
+ *   by a script): a follow-up.
+ * - Train: Pine's own engine (the game's Routes are something else).
+ * - Meetup: Pine's own two people (the game has no meetup icon; Campfire's is Niantic's app's).
+ *
+ * pogo_assets carries no license of its own: they are the game's files, used as Pine's other game
+ * pictures are (raid eggs, type and weather icons).
+ */
+
+/** pogo_assets at the commit Pine's other game pictures are pinned to (`raid-eggs.ts`). */
+export const POGO_ASSETS =
+  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/';
+
+/** What can be reported from the Report button (8M-9B adds research and Team GO Rocket). */
+export type ReportKindId = 'raid' | 'max' | 'spawn' | 'train' | 'meetup';
+
+/** An icon: a picture by its address, or a drawing of Pine's own (its paths, `currentColor`). */
+export type ReportIcon =
+  { kind: 'picture'; src: string } | { kind: 'shape'; name: string; paths: readonly string[] };
+
+const picture = (path: string): ReportIcon => ({ kind: 'picture', src: `${POGO_ASSETS}${path}` });
+
+export const REPORT_ICONS: Readonly<Record<ReportKindId, ReportIcon>> = {
+  raid: picture('Raids/ic_raid_small.png'),
+  max: {
+    kind: 'shape',
+    name: 'max',
+    paths: ['M12 1l2.6 6.1L21 6l-3.6 5.4L22 16l-6.4-.4L12 23l-3.6-7.4L2 16l4.6-4.6L3 6l6.4 1.1z'],
+  },
+  spawn: picture('Items/pokeball_sprite.png'),
+  train: {
+    kind: 'shape',
+    name: 'train',
+    paths: [
+      'M6 3h12a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM7 6v5h10V6zM8.5 13.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm7 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
+      'M8 19h2l-1.5 3h-2zM14 19h2l1.5 3h-2z',
+    ],
+  },
+  meetup: {
+    kind: 'shape',
+    name: 'meetup',
+    paths: [
+      'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9c0-3.3 3.1-6 7-6s7 2.7 7 6v1H2z',
+      'M17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm1 2c2.5.4 4 2.3 4 4.5V20h-4.3c-.2-2.6-1.2-4.6-2.9-5.9A6.6 6.6 0 0 1 18 13z',
+    ],
+  },
+};
diff --git a/src/web/client/report-menu.test.ts b/src/web/client/report-menu.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b54a8a6a12b9ef042bff46a6d7a2241ccf51f5f9
--- /dev/null
+++ b/src/web/client/report-menu.test.ts
@@ -0,0 +1,74 @@
+import { describe, expect, it } from 'vitest';
+import type { PageNode } from './popup.js';
+import { REPORT_ICONS } from './report-icons.js';
+import { REPORT_KINDS, reportMenuNode } from './report-menu.js';
+
+/** Every text of a tree, in order. */
+const texts = (node: PageNode): string[] => [
+  ...(node.text === undefined ? [] : [node.text]),
+  ...(node.children ?? []).flatMap(texts),
+];
+
+/** The nodes of a tree with this tag. */
+const tagged = (node: PageNode, tag: string): PageNode[] => [
+  ...(node.tag === tag ? [node] : []),
+  ...(node.children ?? []).flatMap((child) => tagged(child, tag)),
+];
+
+describe("the Report button's step 1 (plan 8M-9A)", () => {
+  it('offers, in order, raids, max battles, wild spawns, trains and meetups, each picked its way', () => {
+    expect(REPORT_KINDS.map((kind) => [kind.id, kind.label, kind.pick])).toEqual([
+      ['raid', 'Raid', 'gyms'],
+      ['max', 'Max battle', 'spots'],
+      ['spawn', 'Wild spawn', 'point'],
+      ['train', 'Train', 'form'],
+      ['meetup', 'Meetup', 'form'],
+    ]);
+    for (const kind of REPORT_KINDS) expect(kind.icon).toBe(REPORT_ICONS[kind.id]);
+  });
+
+  // R1-8: each kind's heading in step 2 is written out, not made of its label.
+  it("heads each kind's step 2 in words of its own", () => {
+    expect(REPORT_KINDS.map((kind) => kind.heading)).toEqual([
+      'Report a raid',
+      'Report a max battle',
+      'Report a wild spawn',
+      'Start a train',
+      'Make a meetup',
+    ]);
+  });
+
+  it('is a dialog of a button per kind, with its icon, and Cancel', () => {
+    const menu = reportMenuNode(REPORT_KINDS);
+    expect(menu.attributes).toMatchObject({ role: 'dialog', 'aria-label': 'Report' });
+    expect(texts(menu)).toEqual([
+      'What are you reporting?',
+      'Raid',
+      'Max battle',
+      'Wild spawn',
+      'Train',
+      'Meetup',
+      'Cancel',
+    ]);
+    const buttons = tagged(menu, 'button');
+    expect(buttons.map((button) => button.attributes?.['data-report-kind'])).toEqual([
+      'raid',
+      'max',
+      'spawn',
+      'train',
+      'meetup',
+      undefined,
+    ]);
+    expect(buttons.at(-1)?.attributes).toMatchObject({ 'data-cancel': '' });
+    // The game's pictures as pictures, Pine's own drawn into a place of their own.
+    expect(tagged(menu, 'img').map((img) => img.attributes?.src)).toEqual([
+      REPORT_ICONS.raid.kind === 'picture' ? REPORT_ICONS.raid.src : '',
+      REPORT_ICONS.spawn.kind === 'picture' ? REPORT_ICONS.spawn.src : '',
+    ]);
+    expect(
+      tagged(menu, 'span')
+        .filter((span) => span.attributes?.['data-shape'] !== undefined)
+        .map((span) => span.attributes?.['data-shape']),
+    ).toEqual(['max', 'train', 'meetup']);
+  });
+});
diff --git a/src/web/client/report-menu.ts b/src/web/client/report-menu.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5222fd4080852dbf7d5e82df1accefa1194787cf
--- /dev/null
+++ b/src/web/client/report-menu.ts
@@ -0,0 +1,102 @@
+import type { PageNode } from './popup.js';
+import { REPORT_ICONS, type ReportIcon, type ReportKindId } from './report-icons.js';
+
+/**
+ * The Report button's step 1 (plan 8M-9A; design "Reporting"): what is being reported, as a list
+ * of data (A11: plan 8M-9B adds Field research and Team GO Rocket as two more entries), each with
+ * its label, its icon and how its place is picked in step 2:
+ *
+ * - `gyms`: a gym tapped (a raid);
+ * - `spots`: a Power Spot tapped, or a point for an unlisted power spot (a max battle);
+ * - `stops`: a PokéStop tapped (8M-9B's research and Rocket);
+ * - `point`: any point of the map (a wild spawn);
+ * - `form`: no step 2: the kind's own form, which asks its place itself (a train's region, a
+ *   meetup's place picked by the form's own picking).
+ *
+ * Drawn as a tree of nodes (`renderNode`): a sheet on a phone, a small panel under the button on a
+ * wide screen (`map.css`); Escape and Cancel close it.
+ */
+
+export type ReportPick = 'gyms' | 'spots' | 'stops' | 'point' | 'form';
+
+export interface ReportKind {
+  id: ReportKindId;
+  label: string;
+  /** Its heading in step 2, written out (R1-8): "Report a raid". */
+  heading: string;
+  icon: ReportIcon;
+  pick: ReportPick;
+}
+
+/** The kinds in the menu's order (design "Reporting", step 1). */
+export const REPORT_KINDS: readonly ReportKind[] = [
+  { id: 'raid', label: 'Raid', heading: 'Report a raid', icon: REPORT_ICONS.raid, pick: 'gyms' },
+  {
+    id: 'max',
+    label: 'Max battle',
+    heading: 'Report a max battle',
+    icon: REPORT_ICONS.max,
+    pick: 'spots',
+  },
+  {
+    id: 'spawn',
+    label: 'Wild spawn',
+    heading: 'Report a wild spawn',
+    icon: REPORT_ICONS.spawn,
+    pick: 'point',
+  },
+  { id: 'train', label: 'Train', heading: 'Start a train', icon: REPORT_ICONS.train, pick: 'form' },
+  {
+    id: 'meetup',
+    label: 'Meetup',
+    heading: 'Make a meetup',
+    icon: REPORT_ICONS.meetup,
+    pick: 'form',
+  },
+];
+
+/**
+ * An icon as nodes: the game's picture, or a place for Pine's own drawing (`data-shape`), which
+ * the page draws as SVG (`renderNode` makes HTML elements only).
+ */
+export function iconNode(icon: ReportIcon): PageNode {
+  return icon.kind === 'picture'
+    ? {
+        tag: 'img',
+        className: 'report-icon',
+        attributes: { src: icon.src, alt: '', draggable: 'false' },
+      }
+    : {
+        tag: 'span',
+        className: `report-icon shape-${icon.name}`,
+        attributes: { 'data-shape': icon.name, 'aria-hidden': 'true' },
+      };
+}
+
+/** The menu of step 1: a button per kind with its icon and label, then Cancel. */
+export function reportMenuNode(kinds: readonly ReportKind[]): PageNode {
+  return {
+    tag: 'div',
+    className: 'report-menu',
+    attributes: { role: 'dialog', 'aria-label': 'Report', 'aria-modal': 'true' },
+    children: [
+      { tag: 'h2', text: 'What are you reporting?' },
+      {
+        tag: 'div',
+        className: 'report-kinds',
+        children: kinds.map((kind): PageNode => ({
+          tag: 'button',
+          className: 'report-kind',
+          attributes: { type: 'button', 'data-report-kind': kind.id },
+          children: [iconNode(kind.icon), { tag: 'span', className: 'label', text: kind.label }],
+        })),
+      },
+      {
+        tag: 'button',
+        className: 'press secondary report-cancel',
+        text: 'Cancel',
+        attributes: { type: 'button', 'data-cancel': '' },
+      },
+    ],
+  };
+}
diff --git a/src/web/client/report-ui.isolated.test.ts b/src/web/client/report-ui.isolated.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..18fc889cbc6f415bf6f56b541f796965775a7f4e
--- /dev/null
+++ b/src/web/client/report-ui.isolated.test.ts
@@ -0,0 +1,180 @@
+import { describe, expect, it, vi } from 'vitest';
+import type { PageNode } from './popup.js';
+import { FormHold } from './raid-forms.js';
+import { REPORT_KINDS, type ReportKind } from './report-menu.js';
+import { ReportFlow, type ReportFlowDeps } from './report-ui.js';
+
+// Leaflet reads the browser's `window` as it loads; the Report button's controller uses none of
+// it (only `reportUi`, the page's side, does). Isolated: a mocked module needs a module graph of
+// its own (testing.md).
+vi.mock('leaflet', () => ({}));
+
+/** Every text of a tree, in order. */
+const texts = (node: PageNode | undefined): string[] =>
+  node === undefined
+    ? []
+    : [...(node.text === undefined ? [] : [node.text]), ...(node.children ?? []).flatMap(texts)];
+
+const kind = (id: string): ReportKind => {
+  const found = REPORT_KINDS.find((one) => one.id === id);
+  if (!found) throw new Error(id);
+  return found;
+};
+
+/**
+ * The controller over a real hold and fake deps that write down what they were asked, and, for a
+ * step 3, whether the hold was free at that moment (the form takes its own claim).
+ */
+function started(more: Partial<ReportFlowDeps> = {}) {
+  const calls: string[] = [];
+  let box: PageNode | undefined;
+  let inBox = true;
+  const later: Array<() => void> = [];
+  const hold = new FormHold<string>({
+    draw: () => undefined,
+    popup: () => undefined,
+    later: (run) => {
+      run();
+    },
+    controls: () => undefined,
+  });
+  const free = () => (hold.editing ? 'held' : 'free');
+  const deps: ReportFlowDeps = {
+    hold,
+    say: (text) => calls.push(`say ${text}`),
+    showBox: (node) => {
+      box = node;
+      calls.push(node === undefined ? 'box back' : 'box');
+    },
+    focusBox: () => calls.push('focus box'),
+    focusInBox: () => inBox,
+    focusReport: () => calls.push('focus Report'),
+    placesChanged: () => calls.push('places'),
+    redrawn: () => calls.push('redrawn'),
+    closePopup: () => calls.push('close popup'),
+    openMenu: () => calls.push('menu'),
+    later: (run) => later.push(run),
+    spawnAt: (point) => calls.push(`spawn at ${String(point.lat)} ${free()}`),
+    startTrain: () => calls.push('train'),
+    startMeetup: () => calls.push('meetup'),
+    ...more,
+  };
+  const flow = new ReportFlow(deps);
+  return {
+    flow,
+    hold,
+    calls,
+    box: () => box,
+    leave: () => {
+      inBox = false;
+    },
+    runLater: () => {
+      for (const run of later.splice(0)) run();
+    },
+  };
+}
+
+describe("the Report button's step 2 (plan 8M-9A, R1-2)", () => {
+  it('holds the side pane as route mode does, its heading focused, the places drawn', () => {
+    const { flow, hold, calls, box } = started();
+    flow.choose(kind('spawn'));
+    expect(hold.editing).toBe(true);
+    expect(hold.asideHeld).toBe(true);
+    expect(flow.picks('point')).toBe(true);
+    expect(flow.inTools()).toBe(true);
+    expect(texts(box())[0]).toBe('Report a wild spawn');
+    expect(calls).toEqual(['close popup', 'box', 'places', 'redrawn', 'focus box']);
+  });
+
+  it('gives everything back on Cancel: the hold, the box, the places, the focus on Report', () => {
+    const { flow, hold, calls } = started();
+    flow.choose(kind('spawn'));
+    calls.length = 0;
+    flow.cancel();
+    expect(hold.editing).toBe(false);
+    expect(flow.picks('point')).toBe(false);
+    expect(calls).toEqual(['box back', 'places', 'redrawn', 'focus Report']);
+    // The focus elsewhere meanwhile: left where it is.
+    const other = started();
+    other.flow.choose(kind('spawn'));
+    other.leave();
+    other.calls.length = 0;
+    other.flow.cancel();
+    expect(other.calls).not.toContain('focus Report');
+  });
+
+  it('goes back to step 1 on ← Back', () => {
+    const { flow, hold, calls } = started();
+    flow.choose(kind('spawn'));
+    calls.length = 0;
+    flow.back();
+    expect(hold.editing).toBe(false);
+    expect(calls.at(-1)).toBe('menu');
+  });
+
+  it('closes an open popup on Escape, and only that; Escape again ends step 2', () => {
+    const { flow, calls } = started();
+    flow.choose(kind('spawn'));
+    calls.length = 0;
+    expect(flow.escape(true)).toBe(true);
+    expect(calls).toEqual(['close popup']);
+    expect(flow.picks('point')).toBe(true);
+    expect(flow.escape(false)).toBe(true);
+    expect(flow.picks('point')).toBe(false);
+    // Outside step 2 Escape is not the Report button's.
+    expect(flow.escape(false)).toBe(false);
+  });
+
+  // R2-5: Escape is the open sheet's (the layers'), never step 2's.
+  it('leaves step 2 alone on Escape while another sheet is open', () => {
+    const { flow, calls } = started();
+    flow.choose(kind('spawn'));
+    calls.length = 0;
+    expect(flow.escape(false, true)).toBe(false);
+    expect(flow.escape(true, true)).toBe(false);
+    expect(flow.picks('point')).toBe(true);
+    expect(calls).toEqual([]);
+  });
+
+  // R1-9: the list's draw asks whether Report is still offered; ending then draws nothing anew.
+  it('ends when Report is no longer offered, without drawing the parties inside their draw', () => {
+    const { flow, hold, calls } = started();
+    flow.choose(kind('spawn'));
+    calls.length = 0;
+    flow.refresh(false);
+    expect(hold.editing).toBe(false);
+    expect(calls).toContain('places');
+    expect(calls).not.toContain('redrawn');
+    // Still offered: nothing changes.
+    flow.choose(kind('spawn'));
+    calls.length = 0;
+    flow.refresh(true);
+    expect(calls).toEqual([]);
+  });
+
+  it('says that another form is open, and takes nothing', () => {
+    const { flow, hold, calls } = started();
+    const other = hold.take(true);
+    flow.choose(kind('raid'));
+    expect(calls).toEqual(['say Close the form that is open first.']);
+    expect(hold.holds(other ?? { inPopup: false })).toBe(true);
+  });
+
+  it('lets a tapped gym open as a tap does, step 2 ending once the tap is through', () => {
+    const { flow, hold, runLater } = started();
+    flow.choose(kind('raid'));
+    expect(
+      flow.gymClicked({ lat: 40.44, lon: -79.95 } as Parameters<typeof flow.gymClicked>[0]),
+    ).toBe(false);
+    expect(hold.editing).toBe(true);
+    runLater();
+    expect(hold.editing).toBe(false);
+  });
+
+  it("opens a spawn's form at a point tapped, the hold free first", () => {
+    const { flow, calls } = started();
+    flow.choose(kind('spawn'));
+    expect(flow.mapClicked({ lat: 40.45, lon: -79.95 })).toBe(true);
+    expect(calls.at(-1)).toBe('spawn at 40.45 free');
+  });
+});
diff --git a/src/web/client/report-ui.ts b/src/web/client/report-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a56fca823d41c53c46f7bf6c44b37a069a66bc30
--- /dev/null
+++ b/src/web/client/report-ui.ts
@@ -0,0 +1,409 @@
+import * as L from 'leaflet';
+import { byId, say } from './common.js';
+import { SheetFocus } from './layers-ui.js';
+import { renderNode, type MapGym, type PageNode } from './popup.js';
+import type { FormClaim, FormHold } from './raid-forms.js';
+import { pickBox } from './report-flow.js';
+import { REPORT_ICONS, type ReportIcon, type ReportKindId } from './report-icons.js';
+import { REPORT_KINDS, reportMenuNode, type ReportKind, type ReportPick } from './report-menu.js';
+import { newTrainButton } from './train-forms.js';
+import type { LatLon } from './view.js';
+
+/**
+ * The Report button of the live map in the page (plan 8M-9A; design "Reporting", A7): in the
+ * header on a wide screen (`#report-button`, hidden in the template until a member who may report
+ * is known), over the map at the bottom right on a phone (a Leaflet control above "Show where I
+ * am"), and a line of its own at the top of the phone's list, which shows the map first. Members
+ * only, as the other write controls (`offered`: not logged out, not read-only).
+ *
+ * Step 1 is the menu of what (`reportMenuNode`), a sheet on a phone and a small panel under the
+ * button on a wide screen, a dialog for the keyboard as the layers' sheet is (`SheetFocus`: Escape
+ * and Cancel close it). Steps 2 and 3 are `ReportFlow`'s, a controller over the hold and what the
+ * page gives it (R1-2: tested without a page): step 2 holds the side pane's box as route mode does
+ * (an aside claim of the hold, `take(false, true)`), its heading focused (R1-3), the fitting places
+ * drawn whatever the layers say (`picks`), and a tap on one goes on to step 3, the kind's own form
+ * with the place, the claim let go first so that the form takes its own. A train and a meetup have
+ * no step 2: their forms ask their place.
+ */
+
+/** What the page says of Report while another form is open. */
+const FORM_OPEN = 'Close the form that is open first.';
+
+/** What `ReportFlow` needs of the page. */
+export interface ReportFlowDeps {
+  hold: Pick<FormHold<unknown>, 'take' | 'release' | 'editing'>;
+  say(text: string): void;
+  /** Step 2's box drawn into the side pane's box; none: the box given back to "New train". */
+  showBox(box: PageNode | undefined): void;
+  /** The focus on step 2's heading (R1-3). */
+  focusBox(): void;
+  /** Whether the focus is in step 2's box. */
+  focusInBox(): boolean;
+  /** The focus back on the Report button. */
+  focusReport(): void;
+  /** The gyms and places step 2 draws, drawn or taken away. */
+  placesChanged(): void;
+  /** The parties drawn anew (the rings let taps through while step 2 picks). */
+  redrawn(): void;
+  closePopup(): void;
+  /** Step 1's menu (← Back). */
+  openMenu(): void;
+  /** Runs after the event being handled (a tap a popup opens on). */
+  later(run: () => void): void;
+  /** A spawn's step 3: its form at the point. */
+  spawnAt(point: LatLon): void;
+  /** The kinds without a step 2: the forms that ask their place themselves. */
+  startTrain(): void;
+  startMeetup(): void;
+}
+
+/**
+ * Steps 2 and 3 of the Report button (R1-2): what is picked, its claim of the hold, and what each
+ * tap leads to, over `ReportFlowDeps`.
+ */
+export class ReportFlow {
+  private picking: { kind: ReportKind; claim: FormClaim } | undefined;
+
+  constructor(private readonly deps: ReportFlowDeps) {}
+
+  /** Whether step 2 draws these places now, whatever the layers say. */
+  picks(pick: ReportPick): boolean {
+    return this.picking?.kind.pick === pick;
+  }
+
+  /** Whether the side pane's box holds step 2: the list keeps it. */
+  inTools(): boolean {
+    return this.picking !== undefined;
+  }
+
+  /** A kind chosen in step 1. */
+  choose(kind: ReportKind): void {
+    if (kind.pick === 'form') {
+      if (kind.id === 'train') this.deps.startTrain();
+      else this.deps.startMeetup();
+      return;
+    }
+    this.start(kind);
+  }
+
+  /** Step 2 of a kind: the hold taken, the box drawn and focused, the places drawn. */
+  private start(kind: ReportKind): void {
+    const { deps } = this;
+    const claim = deps.hold.take(false, true);
+    if (!claim) {
+      deps.say(FORM_OPEN);
+      return;
+    }
+    this.picking = { kind, claim };
+    deps.closePopup();
+    deps.showBox(pickBox(kind));
+    deps.placesChanged();
+    deps.redrawn();
+    deps.focusBox();
+  }
+
+  /**
+   * Step 2 ends: its claim let go, the box given back, its places gone, the parties drawn anew
+   * (`redraw`: not from inside their own draw, R1-9), the focus back on Report where it was in the
+   * box (`focus`: not for a step 3, whose form takes it).
+   */
+  private end(how: { redraw?: boolean; focus?: boolean } = {}): void {
+    const open = this.picking;
+    if (!open) return;
+    const { deps } = this;
+    const hadFocus = how.focus === true && deps.focusInBox();
+    this.picking = undefined;
+    deps.showBox(undefined);
+    deps.hold.release(open.claim);
+    deps.placesChanged();
+    if (how.redraw !== false) deps.redrawn();
+    if (hadFocus) deps.focusReport();
+  }
+
+  /** Cancel. */
+  cancel(): void {
+    this.end({ focus: true });
+  }
+
+  /** ← Back: step 1 again. */
+  back(): void {
+    this.end();
+    this.deps.openMenu();
+  }
+
+  /**
+   * Escape while step 2 is on (R1-3): an open popup closes, and only that; else step 2 ends. False
+   * outside step 2, and while another sheet is open (the layers', `sheetOpen`, R2-5): the key is
+   * not the Report button's.
+   */
+  escape(popupOpen: boolean, sheetOpen = false): boolean {
+    if (!this.picking || sheetOpen) return false;
+    if (popupOpen) this.deps.closePopup();
+    else this.cancel();
+    return true;
+  }
+
+  /**
+   * Whether Report is offered now, asked at each draw of the list: step 2 ends where it is not,
+   * without drawing the parties anew inside their own draw (R1-9).
+   */
+  refresh(offered: boolean): void {
+    if (!offered) this.end({ redraw: false, focus: true });
+  }
+
+  /** Step 3 follows a tap that step 2 took: once the tap is through (its popup open, say). */
+  private thenEnd(): void {
+    this.deps.later(() => {
+      this.end();
+    });
+  }
+
+  /**
+   * A gym (its dot or the marker of its raids) tapped: in step 2 of a raid it opens as a tap does
+   * (its "Report raid", or the raid that stands there), step 2 ending after; of a spawn its place
+   * is the point (true: no popup). False otherwise.
+   */
+  gymClicked(gym: MapGym): boolean {
+    const pick = this.picking?.kind.pick;
+    if (pick === 'gyms') {
+      this.thenEnd();
+      return false;
+    }
+    if (pick === 'point') {
+      this.end();
+      this.deps.spawnAt({ lat: gym.lat, lon: gym.lon });
+      return true;
+    }
+    return false;
+  }
+
+  /** A Power Spot (or the battle at one) tapped: as `gymClicked`, for a max battle. */
+  spotClicked(spot: { lat: number; lon: number }): boolean {
+    const pick = this.picking?.kind.pick;
+    if (pick === 'spots') {
+      this.thenEnd();
+      return false;
+    }
+    if (pick === 'point') {
+      this.end();
+      this.deps.spawnAt({ lat: spot.lat, lon: spot.lon });
+      return true;
+    }
+    return false;
+  }
+
+  /** A point of the map tapped: in step 2 of a spawn, its form there (true). */
+  mapClicked(point: LatLon): boolean {
+    if (this.picking?.kind.pick !== 'point') return false;
+    this.end();
+    this.deps.spawnAt(point);
+    return true;
+  }
+}
+
+/** What the page's side of the Report button needs beyond the controller's. */
+export interface ReportUiDeps extends Omit<
+  ReportFlowDeps,
+  'say' | 'showBox' | 'focusBox' | 'focusInBox' | 'focusReport' | 'openMenu' | 'later'
+> {
+  map: L.Map;
+  /** The side pane's box, where step 2 is drawn (the trains' "New train" otherwise). */
+  tools: HTMLElement;
+  /** Whether the member may report now (`reportOffered`). */
+  offered(): boolean;
+  /** Whether a popup is open on the map (Escape closes it alone, R1-3). */
+  popupOpen(): boolean;
+  /** The phone card closes as the menu opens. */
+  closeCard(): void;
+  /** On a phone, the map in place of the list. */
+  showMap(): void;
+}
+
+const SVG = 'http://www.w3.org/2000/svg';
+
+/** Pine's own icon as SVG of ours in the color of what it stands for (`currentColor`). */
+function shapeOf(icon: Extract<ReportIcon, { kind: 'shape' }>): SVGSVGElement {
+  const svg = document.createElementNS(SVG, 'svg');
+  svg.setAttribute('viewBox', '0 0 24 24');
+  svg.setAttribute('aria-hidden', 'true');
+  for (const d of icon.paths) {
+    const path = document.createElementNS(SVG, 'path');
+    path.setAttribute('d', d);
+    path.setAttribute('fill', 'currentColor');
+    path.setAttribute('fill-rule', 'evenodd');
+    svg.append(path);
+  }
+  return svg;
+}
+
+/** Draws Pine's own icons into their places (`data-shape`) under `root`. */
+export function drawShapes(root: ParentNode): void {
+  for (const place of root.querySelectorAll<HTMLElement>('[data-shape]')) {
+    const icon = REPORT_ICONS[place.dataset.shape as ReportKindId] as ReportIcon | undefined;
+    if (icon?.kind === 'shape' && place.childElementCount === 0) place.append(shapeOf(icon));
+  }
+}
+
+/** Whether the page is a phone's (`map.css`'s breakpoint). */
+const onPhone = (): boolean => window.matchMedia('(max-width: 767px)').matches;
+
+export function reportUi(deps: ReportUiDeps) {
+  const { hold, map } = deps;
+
+  const header = byId('report-button') as HTMLButtonElement;
+  const floating = document.createElement('button');
+  floating.type = 'button';
+  floating.className = 'report';
+  floating.textContent = 'Report';
+  floating.setAttribute('aria-haspopup', 'dialog');
+  L.DomEvent.disableClickPropagation(floating);
+  const control = new L.Control({ position: 'bottomright' });
+  control.onAdd = () => {
+    const box = document.createElement('div');
+    box.className = 'leaflet-control report-control';
+    box.append(floating);
+    return box;
+  };
+  control.addTo(map);
+  /** The phone list's own line, which shows the map first. */
+  const line = document.createElement('button');
+  line.type = 'button';
+  line.className = 'report-line';
+  line.textContent = 'Report';
+  /** The Report button shown now: the header's, or the one over the map on a phone. */
+  const reportButton = (): HTMLButtonElement => (onPhone() ? floating : header);
+
+  const wrap = document.createElement('div');
+  wrap.className = 'report-wrap';
+  wrap.hidden = true;
+  document.body.append(wrap);
+  const focus = new SheetFocus(wrap, () => [...wrap.querySelectorAll<HTMLElement>('button')]);
+
+  const flow = new ReportFlow({
+    ...deps,
+    say,
+    showBox: (node) => {
+      if (node === undefined) {
+        deps.tools.replaceChildren(renderNode(newTrainButton(), document));
+        return;
+      }
+      const box = renderNode(node, document);
+      drawShapes(box);
+      box.addEventListener('click', (event) => {
+        const target = event.target instanceof Element ? event.target.closest('button') : null;
+        if (!(target instanceof HTMLButtonElement)) return;
+        if (target.dataset.reportBack !== undefined) flow.back();
+        else if (target.dataset.cancel !== undefined) flow.cancel();
+      });
+      deps.tools.replaceChildren(box);
+    },
+    focusBox: () => {
+      deps.tools.querySelector<HTMLElement>('[data-pick-heading]')?.focus();
+    },
+    focusInBox: () => {
+      const active = document.activeElement;
+      return active === document.body || (active !== null && deps.tools.contains(active));
+    },
+    focusReport: () => {
+      reportButton().focus();
+    },
+    openMenu: () => {
+      openMenu(reportButton());
+    },
+    later: (run) => {
+      window.setTimeout(run, 0);
+    },
+  });
+
+  /** Step 1: the menu, from the button pressed. */
+  const openMenu = (opener: HTMLElement): void => {
+    // A new report starts afresh: step 2 of another ends.
+    flow.cancel();
+    if (hold.editing) {
+      say(FORM_OPEN);
+      return;
+    }
+    deps.closeCard();
+    const scrim = document.createElement('div');
+    scrim.className = 'scrim';
+    scrim.addEventListener('click', () => {
+      focus.close();
+    });
+    const menu = renderNode(reportMenuNode(REPORT_KINDS), document);
+    drawShapes(menu);
+    menu.addEventListener('click', (event) => {
+      const target = event.target instanceof Element ? event.target.closest('button') : null;
+      if (!(target instanceof HTMLButtonElement)) return;
+      const kind = REPORT_KINDS.find((one) => one.id === target.dataset.reportKind);
+      if (kind) {
+        focus.close();
+        flow.choose(kind);
+      } else if (target.dataset.cancel !== undefined) focus.close();
+    });
+    // Under the header's button on a wide screen (a sheet at the bottom on a phone, `map.css`).
+    if (!onPhone()) {
+      const at = header.getBoundingClientRect();
+      menu.style.left = `${String(Math.max(8, Math.min(at.left, window.innerWidth - 276)))}px`;
+    }
+    wrap.replaceChildren(scrim, menu);
+    focus.open(opener);
+  };
+
+  header.addEventListener('click', () => {
+    openMenu(header);
+  });
+  floating.addEventListener('click', () => {
+    openMenu(floating);
+  });
+  line.addEventListener('click', () => {
+    deps.showMap();
+    openMenu(floating);
+  });
+  // Before Leaflet's own Escape (the map's keyboard closes a popup), so that Escape with a popup
+  // open closes the popup alone (R1-3).
+  document.addEventListener(
+    'keydown',
+    (event) => {
+      if (focus.key(event.key, event.shiftKey, document.activeElement)) {
+        event.preventDefault();
+        return;
+      }
+      if (event.key !== 'Escape') return;
+      // In a field, Escape is the field's.
+      const typing = document.activeElement?.closest('input, select, textarea') != null;
+      // Another sheet open (the layers'): the key is its own (R2-5).
+      const sheetOpen = document.querySelector('.sheet-wrap:not([hidden])') !== null;
+      if (!typing && flow.escape(deps.popupOpen(), sheetOpen)) {
+        event.preventDefault();
+        event.stopPropagation();
+      }
+    },
+    true,
+  );
+
+  return {
+    /** The phone list's own Report line, put at the top of the list. */
+    line,
+
+    /**
+     * Shown while the member may report (by `/api/me`, then by each list); step 2 ends where it is
+     * not (R1-9: asked at the start of the list's draw, which draws the parties itself).
+     */
+    refresh(): void {
+      const on = deps.offered();
+      header.hidden = !on;
+      floating.hidden = !on;
+      line.hidden = !on;
+      if (!on) focus.close();
+      flow.refresh(on);
+    },
+
+    picks: (pick: ReportPick) => flow.picks(pick),
+    inTools: () => flow.inTools(),
+    gymClicked: (gym: MapGym) => flow.gymClicked(gym),
+    spotClicked: (spot: { lat: number; lon: number }) => flow.spotClicked(spot),
+    mapClicked: (point: LatLon) => flow.mapClicked(point),
+  };
+}
+
+export type ReportUi = ReturnType<typeof reportUi>;
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index 7f8a58b5f388ace2088c126235979fbbebef4e66..b762ca2e13c6c24f748e20cf703485e9e6db98a5 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -100,6 +100,8 @@
   /* A max battle's ring (plan 8M-9A): Dynamax and Gigantamax. */
   --tier-dynamax: #c2185b;
   --tier-gigantamax: #b71c1c;
+  /* The outline of the Report menu's icons (plan 8M-9A), to read on any background. */
+  --icon-outline: #00000099;
   --going: #248046;
   --you: #1a73e8;
   --you-edge: #ffffff;
@@ -215,6 +217,7 @@
     --tier-shadow: #9b59b6;
     --tier-dynamax: #f06292;
     --tier-gigantamax: #ef5350;
+    --icon-outline: #ffffffb3;
     --going: #2d9d55;
     --you: #4c8bf5;
     --you-edge: #ffffff;
diff --git a/src/web/page.test.ts b/src/web/page.test.ts
index f4e3b9ad4ddad33c86a62c2751f4bb9329e6037f..d8264ea1d24ade656e1c3bbcb65b8e7a7a837b27 100644
--- a/src/web/page.test.ts
+++ b/src/web/page.test.ts
@@ -90,6 +90,12 @@ describe('the map page', () => {
       '<button id="list-button" class="list-button" type="button">List</button>',
     );
     expect(page.body).not.toContain('aria-pressed');
+    // The Report button (plan 8M-9A): before "Find a gym", hidden until the script knows a
+    // member who may report; on a phone it floats over the map instead (map.css).
+    expect(page.body).toContain(
+      '<button id="report-button" class="report-button" type="button" aria-haspopup="dialog" hidden>Report</button>' +
+        '\n<input id="filter"',
+    );
     // On a phone "Find a gym" opens from a button of the one row (fix round 1).
     expect(page.body).toContain(
       '<button id="search-button" class="search-button" type="button" aria-controls="filter" aria-expanded="false">Find</button>',
diff --git a/src/web/page.ts b/src/web/page.ts
index 02bdc903793ea10ccd4d73a28d966fba311fc3b8..aa19a3f011fc948f31b6ee6b7a0057910485fe26 100644
--- a/src/web/page.ts
+++ b/src/web/page.ts
@@ -129,6 +129,9 @@ export function mapPage(data: MapPageData, assets: AssetManifest): string {
     '<nav id="layers" aria-label="Layers"></nav>',
     '<button id="list-button" class="list-button" type="button">List</button>',
     '<button id="search-button" class="search-button" type="button" aria-controls="filter" aria-expanded="false">Find</button>',
+    // The Report button (plan 8M-9A), shown by the script to a member who may report; on a phone
+    // it floats over the map instead (map.css), so that this row stays one row.
+    '<button id="report-button" class="report-button" type="button" aria-haspopup="dialog" hidden>Report</button>',
     '<input id="filter" type="search" placeholder="Find a gym" aria-label="Find a gym">',
     '<span id="account"></span></header>',
     '<p id="notice" hidden></p><p id="read-only" role="status" hidden></p>',
diff --git a/src/web/phone-header.test.ts b/src/web/phone-header.test.ts
index d6e13560ffb7859397ec30a49cff417ec86ada74..ae253772c4d5fce080ed8f49a4b3e26cf2bd2fe6 100644
--- a/src/web/phone-header.test.ts
+++ b/src/web/phone-header.test.ts
@@ -76,3 +76,20 @@ describe("the header's login on a phone (8M-7 review fix 4)", () => {
     );
   });
 });
+
+// Plan 8M-9A (A7): the header's row stays one row on a phone; the Report button floats there.
+describe('the Report button on a wide screen and on a phone', () => {
+  const rules = rulesOf(
+    readFileSync(path.resolve(import.meta.dirname, 'client', 'map.css'), 'utf8'),
+  );
+
+  it('is in the header on a wide screen, over the map on a phone', () => {
+    expect(shown(rules, '#report-button', 'display', true)).toBe('none');
+    expect(shown(rules, '#report-button', 'display', false)).toBeUndefined();
+    expect(shown(rules, '.report-control', 'display', false)).toBe('none');
+    expect(shown(rules, '.report-control', 'display', true)).toBe('block');
+    // The list's own line, on a phone alone, while the list is shown in place of the map.
+    expect(shown(rules, '.report-line', 'display', false)).toBe('none');
+    expect(shown(rules, 'body.list-open .report-line', 'display', true)).toBe('block');
+  });
+});
diff --git a/src/web/report-icons.test.ts b/src/web/report-icons.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a84ac40853ccebb078222080a5a51f727ddfb4aa
--- /dev/null
+++ b/src/web/report-icons.test.ts
@@ -0,0 +1,37 @@
+import { describe, expect, it } from 'vitest';
+import { REPORT_ICONS } from './client/report-icons.js';
+import { pictureOrigins } from './headers.js';
+
+/**
+ * The Report menu's icons (plan 8M-9A, A8): the game's own where they fit, by an address pinned to
+ * one commit of PokeMiners' pogo_assets on a host the page may load pictures from already (no new
+ * origin in the Content Security Policy), else Pine's own drawing. Here, outside
+ * `src/web/client/`, since the policy's origins are the server's.
+ */
+describe("the Report menu's icons", () => {
+  it('are pinned to a commit of pogo_assets on an origin the page may load, or drawn by Pine', () => {
+    const origins = pictureOrigins('https://pine.example');
+    for (const [kind, icon] of Object.entries(REPORT_ICONS)) {
+      if (icon.kind === 'shape') {
+        expect(icon.paths.length, kind).toBeGreaterThan(0);
+        continue;
+      }
+      expect(icon.src, kind).toMatch(
+        /^https:\/\/raw\.githubusercontent\.com\/PokeMiners\/pogo_assets\/[0-9a-f]{40}\/Images\/[^?#]+\.png$/u,
+      );
+      expect(origins, kind).toContain(new URL(icon.src).origin);
+    }
+  });
+
+  it("are the game's raid icon and Poké Ball, and Pine's own max battle, train and meetup", () => {
+    expect(
+      Object.fromEntries(Object.entries(REPORT_ICONS).map(([kind, icon]) => [kind, icon.kind])),
+    ).toEqual({
+      raid: 'picture',
+      max: 'shape',
+      spawn: 'picture',
+      train: 'shape',
+      meetup: 'shape',
+    });
+  });
+});
````

### Task 4: 8M-9A task 4: step 2 per kind and the hand-off to step 3

Prototype commit: `851b36402643fc1c46d4844706988bf0778f6155`

Step 2 of the Report button lists the nearest places with their
distances, from your location, else the map's middle (nearestLines,
distanceWords), the fitting places ringed and the rest dimmed: a raid's
from the gyms the page has; a max battle's from the Power Spots of the
view, the map flown to the reference point at their zoom and the spots'
answer telling the list (A4). A tap on a place or its line goes to step
3 with step 2's claim let go first: a raid's report form opened in the
gym's popup (its dot drawn for it whatever the layer, GymDots.open), or
the raid standing there; a max battle's form in the spot's popup
(ShownPlaces.openSpot), or the battle there, or at a point tapped an
unlisted power spot's form; a spawn's form at the point, also at a gym or
spot tapped. A train skips step 2: its start form with the region
prefilled where one region alone holds the place (regionHolding); a
meetup opens its form with its own place picking already started (A5).
The trains' and meetups' rings let taps through meanwhile.

**Files:**

```
 src/web/client/gyms-ui.ts                 |  22 ++++++++++-
 src/web/client/main.ts                    |  14 ++++++-
 src/web/client/map.css                    |  88 +++++++++++++++++++++++++++++++++++++++++
 src/web/client/meetup-ui.ts               |   7 +++-
 src/web/client/parties.test.ts            |  27 +++++++++++++
 src/web/client/parties.ts                 |  21 ++++++++++
 src/web/client/party-layer.ts             | 153 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------
 src/web/client/places-ui.ts               | 115 +++++++++++++++++++++++++++++++++++++++++------------
 src/web/client/raid-ui.ts                 |  22 ++++++++---
 src/web/client/report-flow.test.ts        |  94 ++++++++++++++++++++++++++++++++++++++++++--
 src/web/client/report-flow.ts             | 155 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++----
 src/web/client/report-ui.isolated.test.ts | 177 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++------
 src/web/client/report-ui.ts               | 325 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--------------------
 src/web/client/spawn-ui.ts                |  20 +++++++---
 src/web/client/train-ui.ts                |  19 ++++++---
 15 files changed, 1130 insertions(+), 129 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/parties.test.ts src/web/client/report-flow.test.ts src/web/client/report-ui.isolated.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 851b36402643fc1c46d4844706988bf0778f6155 -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m9a-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-9A task 4: step 2 per kind and the hand-off to step 3`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/gyms-ui.ts b/src/web/client/gyms-ui.ts
index ad101bf7b4ce69566ce780978d618d3d57b2f8b2..6fcbd6ee6b271ab09bdb917e080477ba8d2ee6b5 100644
--- a/src/web/client/gyms-ui.ts
+++ b/src/web/client/gyms-ui.ts
@@ -14,7 +14,7 @@ import { onThemeChange, theme } from './theme.js';
  * street level by Pine's grid (`clustersAt`: a circle with its count, a tap zooms in on it); each
  * gym a dot whose popup is the gym's (`gymPopup`) with what the parties add (`extras`: "Report
  * raid" and the rest), opened by our own click handler (`gymClicks`: in route mode a click adds
- * the gym as a stop). On by default until plan 8M-9's Report button (`MAP_LAYERS`); while "Find
+ * the gym as a stop). Off by default since the Report button (plan 8M-9A, `MAP_LAYERS`); while "Find
  * a gym" holds a word its matches are drawn whatever the layer, and while a gym is to be clicked
  * (route mode, a meetup's place picked) every gym (`shownGyms`). The registry is told how many gyms are in view.
  */
@@ -23,6 +23,8 @@ export interface GymDots {
   refresh(): void;
   /** The dot of a gym, made on first use. */
   dot(gym: MapGym): L.CircleMarker;
+  /** A gym's own popup opened, its dot drawn for it; the popup's element. */
+  open(gym: MapGym): HTMLElement | undefined;
 }
 
 export interface GymDotsDeps {
@@ -66,6 +68,8 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
       ...GYM_DOT,
       color: theme().colours.gym,
       fillOpacity: 0.8,
+      // Ringed while the Report button's step 2 picks gyms (plan 8M-9A, `map.css`).
+      className: 'gym-dot',
     }).bindPopup(
       heldContent(
         () => {
@@ -184,5 +188,19 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
       });
     }
   });
-  return { refresh, dot };
+  /**
+   * A gym's own popup opened (the Report button's step 3 of a raid, plan 8M-9A), its dot drawn for
+   * it whatever the layer says: the open gym is kept on its own (`wantedDots`) once open.
+   */
+  const openGym = (gym: MapGym): HTMLElement | undefined => {
+    const marker = dot(gym);
+    const key = `gym:${String(gym.id)}`;
+    if (!group.hasLayer(marker)) {
+      marker.addTo(group);
+      drawn.set(key, marker);
+    }
+    marker.openPopup();
+    return marker.getPopup()?.getElement();
+  };
+  return { refresh, dot, open: openGym };
 }
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index a593adce0e945f358343c4718fc2ba3f4b4ad538..3b41a549eeafe1fdda4d220ee323e41bc0ffc31f 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -49,6 +49,8 @@ const gymExtras: {
   clicked: (gym: MapGym) => boolean;
   forced: () => boolean;
   raidGyms: () => readonly number[];
+  /** Whether the raids are drawn (their layer, or a raid's step 2: C1). */
+  raidsShown: () => boolean;
   tapped: (gym: MapGym, own: () => void) => void;
 } = {
   of: () => [],
@@ -56,6 +58,7 @@ const gymExtras: {
   clicked: () => false,
   forced: () => false,
   raidGyms: () => [],
+  raidsShown: () => false,
   tapped: (_gym, own) => {
     own();
   },
@@ -125,7 +128,7 @@ async function showGeo(
     editing: () => gymExtras.editing(),
     clicked: (gym) => gymExtras.clicked(gym),
     forced: () => gymExtras.forced(),
-    hidden: () => hiddenGyms(gymExtras.raidGyms(), registry.isOn('raids')),
+    hidden: () => hiddenGyms(gymExtras.raidGyms(), gymExtras.raidsShown()),
     focus: routeFocus,
     tapped: (gym, own) => {
       gymExtras.tapped(gym, own);
@@ -278,6 +281,14 @@ function start(): void {
         placesChanged: () => {
           dots.refresh();
           places.refresh();
+          // Their targets to tap follow whether step 2 picks them (R1-10).
+          places.redrawn();
+        },
+        // Its step 3 (A6): a gym's or Power Spot's own popup, whatever the layers draw.
+        openGym: (gym) => dots.open(gym),
+        openSpot: (spot) => places.openSpot(spot),
+        onSpots: (listener) => {
+          places.onSpots(listener);
         },
         routeMode: (on) => {
           routeFocus.set(on);
@@ -293,6 +304,7 @@ function start(): void {
       places.redrawn();
       gymExtras.forced = () => raids.forced();
       gymExtras.raidGyms = () => raids.raidGyms();
+      gymExtras.raidsShown = () => raids.raidsShown();
       gymExtras.tapped = (gym, own) => {
         raids.gymTapped(gym, own);
       };
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 43824f177771e6a277c115afd69fd1837b308e7e..f0a0bac22b6dda45dfa501c3437d1039db8926fc 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -735,6 +735,94 @@ a {
   gap: 6px;
 }
 
+.report-pick .hint,
+.report-pick .near-none {
+  margin: 0;
+}
+
+.report-pick .near-label {
+  color: var(--text-soft);
+  font-size: 12px;
+  font-weight: 700;
+  text-transform: uppercase;
+}
+
+.near-places {
+  display: flex;
+  flex-direction: column;
+  gap: 4px;
+}
+
+.near-place {
+  display: flex;
+  justify-content: space-between;
+  gap: 8px;
+  padding: 6px 8px;
+  border: 0;
+  border-radius: var(--radius);
+  background: var(--card-bg);
+  color: var(--text);
+  font: inherit;
+  text-align: left;
+  cursor: pointer;
+}
+
+.near-place:hover,
+.near-place:focus-visible {
+  background: var(--secondary-hover);
+}
+
+.near-place .near-distance {
+  flex: none;
+  color: var(--muted);
+}
+
+/* While step 2 picks: the places that fit ringed, the rest of what is drawn dimmed. */
+.pick-gyms path.gym-dot,
+.pick-spots path.spot-dot,
+.pick-stops path.stop-dot {
+  stroke: var(--primary);
+  stroke-width: 4px;
+}
+
+/* Everything drawn is dimmed but the places that fit (R1-7: the other places' dots too). */
+.report-picking .leaflet-rings-pane,
+.report-picking .leaflet-overlay-pane path,
+.pick-gyms .max-icon,
+.pick-spots .raid-icon:not(.max-icon),
+.pick-spots .cluster {
+  opacity: 0.35;
+}
+
+.pick-gyms .leaflet-overlay-pane path.gym-dot,
+.pick-spots .leaflet-overlay-pane path.spot-dot,
+.pick-stops .leaflet-overlay-pane path.stop-dot {
+  opacity: 1;
+}
+
+/* A place's larger target to tap while it is picked (R1-10): clear, never dimmed or drawn. */
+.report-picking .leaflet-overlay-pane path.place-target {
+  opacity: 0;
+}
+
+/* The pin a tap puts in step 2 (R1-1), and its line in the box. */
+.report-pin {
+  border: 3px solid var(--primary);
+  border-radius: 50%;
+  background: var(--panel-bg);
+  box-shadow: 0 1px 4px var(--shadow);
+}
+
+.report-pick .pin-line {
+  display: flex;
+  align-items: center;
+  justify-content: space-between;
+  gap: 8px;
+  padding: 6px 8px;
+  border-radius: var(--radius);
+  background: var(--card-bg);
+}
+
 .report-pick [data-pick-heading]:focus {
   outline: none;
 }
diff --git a/src/web/client/meetup-ui.ts b/src/web/client/meetup-ui.ts
index 9edaf5510dfa506cd5f60bfd42087fe03303178e..e6137b874112e9f88e84671cb280255241950503 100644
--- a/src/web/client/meetup-ui.ts
+++ b/src/web/client/meetup-ui.ts
@@ -372,8 +372,13 @@ export function meetupUi(deps: MeetupUiDeps) {
 
   return {
     /** A click on "New meetup": its form, without a place yet. */
-    newMeetupClicked(): void {
+    newMeetupClicked(pick = false): void {
       openMaking(undefined);
+      // From the Report button (plan 8M-9A, A5): its place picked at once, by its own picking.
+      if (pick && making) {
+        startPicking();
+        drawMaking();
+      }
     },
 
     /** A click on "Meetup here" in a gym's popup: the form, the gym its place. */
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index dbbcb0f34fca864b593482a21b643ced54e9da03..279732a2776264bf27f7337c9c7c29efba3e2f69 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -16,6 +16,7 @@ import {
   meetupItem,
   meetupPopup,
   partiesAtKey,
+  raidsDrawn,
   Poller,
   PRESS_FAILED,
   pressLabel,
@@ -215,6 +216,32 @@ describe('maxPopup', () => {
 });
 
 // Plan 8M-9A (A2): every popup's key names the parties it shows, max battles by `max:<id>`.
+// R2-1 (with C1): the raids' layer drawn while step 2 picks gyms, or while the party a step 3
+// opened (its key) is the one a popup or the card shows; as the layer says otherwise.
+describe('raidsDrawn', () => {
+  it('draws the raids by their layer, a raid step 2, or the party a step 3 opened while shown', () => {
+    const drawn = (more: Partial<Parameters<typeof raidsDrawn>[0]>) =>
+      raidsDrawn({
+        layerOn: false,
+        picking: false,
+        opened: undefined,
+        opening: false,
+        shown: [],
+        ...more,
+      });
+    expect(drawn({ layerOn: true })).toBe(true);
+    expect(drawn({ picking: true })).toBe(true);
+    expect(drawn({})).toBe(false);
+    expect(drawn({ opened: 'gym:2', shown: [undefined, 'gym:2'] })).toBe(true);
+    // Its popup or card closed, or another shown: the layer says.
+    expect(drawn({ opened: 'gym:2', shown: [undefined, undefined] })).toBe(false);
+    expect(drawn({ opened: 'gym:2', shown: ['max:x1', undefined] })).toBe(false);
+    // R3-1: drawn already while it is being opened, so that the parties are drawn with it.
+    expect(drawn({ opened: 'gym:2', opening: true, shown: [undefined, undefined] })).toBe(true);
+    expect(drawn({ opening: true })).toBe(false);
+  });
+});
+
 describe('partiesAtKey', () => {
   it('finds the raids of a gym, a train by its ring or line, a meetup, a max battle', () => {
     const view: PartiesView = {
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index d8fe36bbf0ad442e6e6b206f22b5b483fa8a46e3..bd8fecadd6afb9336054e225a822b49480149a69 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -273,6 +273,27 @@ export function maxPopup(max: MapMax, context: ShowContext): PageNode {
   };
 }
 
+/**
+ * Whether the raids' layer is drawn (plan 8M-9A): its toggle on; or a raid's step 2 of the Report
+ * button picking gyms (C1), so that the raids standing at them show; or a party a step 3 opened
+ * (`opened`, its key) while a popup or the card shows it (`shown`: their keys), so that it opens
+ * on its own marker (R2-1). The layer's toggle again once that popup or card closes.
+ */
+export function raidsDrawn(state: {
+  layerOn: boolean;
+  picking: boolean;
+  opened: string | undefined;
+  /** It is being opened (R3-1): the parties are drawn with it before its popup opens. */
+  opening: boolean;
+  shown: ReadonlyArray<string | undefined>;
+}): boolean {
+  return (
+    state.layerOn ||
+    state.picking ||
+    (state.opened !== undefined && (state.opening || state.shown.includes(state.opened)))
+  );
+}
+
 /**
  * The parties a popup's or card's key shows (`gym:<id>`, `train:<id>`, `route:<id>`,
  * `meetup:<id>`, `max:<id>`), in the list's order: whose posts are asked for ahead as the pointer
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 930a8ac4d516061bbd16d40736cdea248eb6eaea..23c750b7bd5edc4cbcafcbe0399a4f55c1ba956e 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -13,6 +13,7 @@ import {
   maxPopup,
   meetupPopup,
   partiesAtKey,
+  raidsDrawn,
   Poller,
   pressParty,
   raidPopup,
@@ -224,6 +225,12 @@ export interface PartyFrame {
   routeMode?: (on: boolean) => void;
   /** The Report button's step 2 began or ended (plan 8M-9A): the gyms and places it draws follow. */
   placesChanged?: () => void;
+  /** A gym's own popup opened, its dot drawn for it whatever the layer (step 3 of a raid, A6). */
+  openGym?: (gym: MapGym) => HTMLElement | undefined;
+  /** A Power Spot's popup opened at it (step 3 of a max battle, A6). */
+  openSpot?: (spot: MapSpot) => HTMLElement | undefined;
+  /** Tells `listener` each answer of the Power Spots of the view, or why none came (A4, R1-6). */
+  onSpots?: (listener: (spots: readonly MapSpot[] | 'failed' | 'zoom') => void) => void;
 }
 
 export interface MapRaids {
@@ -269,6 +276,8 @@ export interface MapRaids {
    * their layer says, as `forced` draws the gyms.
    */
   forcedPlaces(layer: 'stops' | 'spots'): boolean;
+  /** Whether the raids are drawn: their layer on, or a raid's step 2 picking gyms (C1). */
+  raidsShown(): boolean;
 }
 
 /**
@@ -299,12 +308,13 @@ export function raidsMarker(
 }
 
 /** The icon of a raid's marker: an element of ours (`raidMarkerNode`), never a string. */
-export function raidIcon(element: HTMLElement, circle: number): L.DivIcon {
+export function raidIcon(element: HTMLElement, circle: number, max = false): L.DivIcon {
   // Never a tap target under 32 pixels: a clear margin round a small circle (`tapBox`).
   const box = tapBox(circle);
   return L.divIcon({
     html: element,
-    className: 'raid-icon',
+    // A max battle's (plan 8M-9A) is told apart for the Report button's step 2 (`map.css`).
+    className: max ? 'raid-icon max-icon' : 'raid-icon',
     iconSize: [box, box],
     iconAnchor: [box / 2, box / 2],
     popupAnchor: [0, -circle / 2],
@@ -334,10 +344,44 @@ export function showParties(
   for (const [id, group] of Object.entries(groups)) {
     if (registry.isOn(id)) group.addTo(map);
   }
-  registry.onChange((id, on) => {
+  /** The party the Report button's step 3 opened (R2-1), by its popup's key, while it shows. */
+  let openedForStep3: string | undefined;
+  /** That party is being opened: the parties drawn with it before its popup opens (R3-1). */
+  let openingStep3 = false;
+  /**
+   * Whether a layer's things are drawn: the layer is on; for the raids also (`raidsDrawn`) while
+   * the Report button's step 2 of a raid picks gyms (C1), and while the party its step 3 opened is
+   * shown in a popup or the card (R2-1); as the layer says once they end.
+   */
+  const layerShown = (id: string): boolean =>
+    id === 'raids'
+      ? raidsDrawn({
+          layerOn: registry.isOn('raids'),
+          picking: report.picks('gyms'),
+          opened: openedForStep3,
+          opening: openingStep3,
+          shown: [showing.key, card.key],
+        })
+      : registry.isOn(id);
+  const raidsShown = (): boolean => layerShown('raids');
+  /**
+   * The party step 3 opened is no longer shown: the raids' layer as its toggle says again; after
+   * Leaflet's handling of the close (or the card's opening in its place on a phone).
+   */
+  const openedClosed = (): void => {
+    if (openedForStep3 === undefined) return;
+    window.setTimeout(() => {
+      const key = openedForStep3;
+      if (key === undefined || showing.key === key || card.key === key) return;
+      openedForStep3 = undefined;
+      // Drawn anew as the Raids toggle draws them (R3-1): spots, gyms and rings as the layer says.
+      if (view) hold.shown(view);
+    }, 0);
+  };
+  registry.onChange((id) => {
     const group = (groups as Record<string, L.LayerGroup | undefined>)[id];
     if (!group) return;
-    if (on) group.addTo(map);
+    if (layerShown(id)) group.addTo(map);
     else group.remove();
     counted();
     // The rings go round a raid's circle only while raids are shown (`ringSizes`).
@@ -802,6 +846,7 @@ export function showParties(
   const card = new PhoneCard(document, {
     onClose: () => {
       hold.cardClosed();
+      openedClosed();
     },
   });
   // A tap on the map closes it, as a popup closes.
@@ -825,7 +870,7 @@ export function showParties(
   });
   const toPixel = (place: { lat: number; lon: number }) =>
     map.latLngToContainerPoint([place.lat, place.lon]);
-  const shownThings = () => placed.filter((thing) => registry.isOn(thing.layer));
+  const shownThings = () => placed.filter((thing) => layerShown(thing.layer));
   /** The list of the things at one place, a choice opening its own popup (or `own`'s). */
   const openList = (here: readonly PlacedThing[], own?: { key: string; open: () => void }) => {
     const [first] = here;
@@ -883,7 +928,7 @@ export function showParties(
     zone: () => readerZone(),
     open: (line) => {
       const layer = line.marker === null ? undefined : popups.get(line.marker);
-      if (!layer || !line.point || !registry.isOn(line.kind)) return false;
+      if (!layer || !line.point || !layerShown(line.kind)) return false;
       const { marker } = line;
       frame.showMap();
       map.once('moveend', () => {
@@ -957,6 +1002,9 @@ export function showParties(
     // Whether Report is still offered, asked first (R1-9): a step 2 that ends here ends before
     // anything is drawn, with nothing drawn anew inside this draw.
     report.refresh();
+    // The raids drawn while a raid's step 2 picks gyms, whatever their layer (C1).
+    if (raidsShown()) groups.raids.addTo(map);
+    else groups.raids.remove();
     const reopen = showing.key;
     for (const group of Object.values(groups)) group.clearLayers();
     popups.clear();
@@ -973,7 +1021,7 @@ export function showParties(
     const circle =
       size === 'full' ? sizes.raidFull : size === 'middle' ? sizes.raidMiddle : sizes.raidSmall;
     const raidAt = (gymId: number | undefined): number | undefined =>
-      gymId !== undefined && registry.isOn('raids') && atGyms.has(gymId) ? circle : undefined;
+      gymId !== undefined && raidsShown() && atGyms.has(gymId) ? circle : undefined;
     drawnSize = size;
     for (const [gymId, raids] of atGyms) {
       const gym = gyms.get(gymId);
@@ -1012,11 +1060,11 @@ export function showParties(
       const key = `max:${max.id}`;
       const marker: L.Marker = raidsMarker(
         max.place,
-        raidIcon(renderNode(raidMarkerNode(max, now, readerZone(), size), document), circle),
+        raidIcon(renderNode(raidMarkerNode(max, now, readerZone(), size), document), circle, true),
         max.title,
         (made) => withPopup(made, key, () => partyPopup(max, () => maxPopup(max, context()))),
         () =>
-          report.spotClicked(max.place) ||
+          report.spotClicked(max.place, true) ||
           (max.spotId !== null &&
             trainForms.spotClicked({ id: max.spotId, title: max.place.name })),
         () => {
@@ -1037,9 +1085,7 @@ export function showParties(
     // The Power Spots whose battle is drawn (the raids' layer on): their own dot is not (A6), and
     // a train's ring at one goes round the battle's circle.
     battleSpots = new Set(
-      registry.isOn('raids')
-        ? next.maxes.flatMap((max) => (max.spotId === null ? [] : [max.spotId]))
-        : [],
+      raidsShown() ? next.maxes.flatMap((max) => (max.spotId === null ? [] : [max.spotId])) : [],
     );
     const circleAtStop = (stop: string | undefined): number | undefined => {
       if (stop?.startsWith('w') === true)
@@ -1050,7 +1096,7 @@ export function showParties(
     // While a train is routed or a meetup's place picked, the trains' and meetups' lines and
     // markers let clicks through to the gyms and the map.
     const drawn = drawnTrains(next.trains, trainForms.routing()?.id);
-    const interactive = drawn.clickable && !meetupForms.picking();
+    const interactive = drawn.clickable && !meetupForms.picking() && !report.inTools();
     // Meetups at their place (plan 8M-5M): at the gym as the map has it now, else the snapshot's
     // point; listed in the side panel too. A ring without a fill, which takes clicks on its line
     // alone: a gym's dot inside it stays a dot to click. On a pane of its own above the markers
@@ -1192,6 +1238,7 @@ export function showParties(
   map.on('popupclose', (event) => {
     showing.closed(event.popup);
     hold.popupClosed();
+    openedClosed();
   });
 
   // Reporting and changing raids (plan 8M-4): after a success the list at once, and the raid's
@@ -1263,6 +1310,10 @@ export function showParties(
         },
       };
     },
+    // "← Pick a Power Spot" of a pin refused (R1-4): the Report button's step 2 of a max battle.
+    pickSpot: () => {
+      report.pickSpots();
+    },
     done: async (max) => {
       if (max) {
         map.closePopup();
@@ -1449,6 +1500,33 @@ export function showParties(
     if (!report.mapClicked(point)) meetupForms.mapClicked(point);
   });
 
+  /**
+   * A party's popup opened by its key for the Report button's step 3, on its own marker (R2-1): the
+   * raids' layer drawn while it shows, its toggle off or not.
+   */
+  const openParty = (key: string): boolean => {
+    if (!popups.has(key)) return false;
+    // Its own marker, its layer drawn while it shows (R2-1): the popup, or on a phone the card,
+    // of every party, with its forms and its redraws. The parties drawn anew with it first (R3-1):
+    // its Power Spot's dot, the gyms with raids and the rings as with the layer on; its popup
+    // from the markers drawn then.
+    openedForStep3 = key;
+    openingStep3 = true;
+    try {
+      if (view) hold.shown(view);
+      const layer = popups.get(key);
+      if (!layer) {
+        openedForStep3 = undefined;
+        return false;
+      }
+      groups.raids.addTo(map);
+      layer.openPopup();
+      return true;
+    } finally {
+      openingStep3 = false;
+    }
+  };
+
   // The Report button (plan 8M-9A): step 1's menu, step 2 in the side pane's box with the fitting
   // places drawn (the gyms through `forced`, the Power Spots through `forcedPlaces`), and step 3
   // the kind's own form, as a tap on its place opens it.
@@ -1460,11 +1538,11 @@ export function showParties(
     placesChanged: () => {
       frame.placesChanged?.();
     },
-    // The parties drawn anew (R1-9: not from inside their own draw).
+    // The parties drawn anew (R1-9: not from inside their own draw): the raids drawn while a raid's
+    // step 2 picks gyms (C1), the trains' and meetups' lines and rings letting taps through.
     redrawn: () => {
       if (view) hold.shown(view);
     },
-    popupOpen: () => showing.popup !== undefined,
     closePopup: () => {
       map.closePopup();
     },
@@ -1474,14 +1552,50 @@ export function showParties(
     showMap: () => {
       frame.showMap();
     },
-    startTrain: () => {
-      trainForms.newTrainClicked();
+    popupOpen: () => showing.popup !== undefined,
+    startTrain: (region) => {
+      trainForms.newTrainClicked(region, true);
     },
     startMeetup: () => {
-      meetupForms.newMeetupClicked();
+      // Its place picked at once by the form's own picking (A5), not a second picker.
+      meetupForms.newMeetupClicked(true);
     },
     spawnAt: (point) => {
-      spawnForms.spawnAt(spawnPoint(point.lat, point.lon));
+      spawnForms.spawnAt(spawnPoint(point.lat, point.lon), true);
+    },
+    regions,
+    gyms,
+    origin: () => {
+      const center = map.getCenter();
+      return frame.located() ?? { lat: center.lat, lon: center.lng };
+    },
+    units: frame.units,
+    openRaid: (gym) => {
+      // The raid that stands at the gym, on its own marker (C1, R2-1: its layer drawn while it
+      // shows, also with the Raids layer off).
+      if (!view?.raids.some((raid) => raid.gymId === gym.id)) return false;
+      return openParty(`gym:${String(gym.id)}`);
+    },
+    toRaidForm: (gym) => {
+      // The gym's popup, drawn now, and its "Report raid" pressed (A6: the form in its place).
+      const button = frame.openGym?.(gym)?.querySelector<HTMLButtonElement>('button[data-report]');
+      if (button) raidForms.reportClicked(button, gym, true);
+    },
+    openBattle: (spotId) => {
+      const max = view?.maxes.find((one) => one.spotId === spotId);
+      return max ? openParty(`max:${max.id}`) : false;
+    },
+    toMaxForm: (spot) => {
+      const button = frame
+        .openSpot?.(spot)
+        ?.querySelector<HTMLButtonElement>('button[data-report-max]');
+      if (button) maxForms.maxClicked(button, spot, true);
+    },
+    maxAt: (point) => {
+      maxForms.maxAt(point, true);
+    },
+    onSpots: (listener) => {
+      frame.onSpots?.(listener);
     },
   });
   report.refresh();
@@ -1553,6 +1667,7 @@ export function showParties(
     forced: () =>
       trainForms.routing() !== undefined || meetupForms.picking() || report.picks('gyms'),
     forcedPlaces: (layer) => report.picks(layer),
+    raidsShown,
     raidGyms: () => raidGyms,
     spotControls: (spot) => (reportOffered(mayReport, view) ? [maxForms.maxControl(spot)] : []),
     battleSpots: () => battleSpots,
diff --git a/src/web/client/places-ui.ts b/src/web/client/places-ui.ts
index c3f4f27ac1fb29fdcdd6f6863c7418c58c7f67cf..cf19b9925d9e507f7195ff7b9b5aea4f74c8321a 100644
--- a/src/web/client/places-ui.ts
+++ b/src/web/client/places-ui.ts
@@ -27,6 +27,12 @@ export interface QuietLine {
   set(id: string, text: string | undefined): void;
 }
 
+/**
+ * The radius, in pixels, of the target a place offers a tap while the Report button's step 2
+ * picks it (R1-10): a clear circle round its small dot.
+ */
+export const PICKED_TARGET = 16;
+
 /** The words of the quiet line for a layer with more places in view than it shows. */
 export const MORE_THAN_SHOWN: Readonly<Record<'stops' | 'spots', string>> = {
   stops: 'Zoom in to see every PokéStop here.',
@@ -105,12 +111,24 @@ export interface PlacesHooks {
   forced(layer: 'stops' | 'spots'): boolean;
 }
 
+/** A PokéStop or Power Spot as the page has it from `/api/stops` and `/api/powerspots`. */
+export interface PlaceSpot {
+  id: string;
+  title: string;
+  lat: number;
+  lon: number;
+}
+
 /** What the places give the page: asked for anew, or drawn again from their last answers. */
 export interface ShownPlaces {
   /** The layer, the zoom or who asks changed: asked for when wanted, taken off when not. */
   refresh(): void;
   /** What the parties draw changed (a battle at a spot): drawn again from the last answers. */
   redrawn(): void;
+  /** A Power Spot's popup opened at it, whether its dot is drawn or not (plan 8M-9A, A6). */
+  openSpot(spot: PlaceSpot): HTMLElement | undefined;
+  /** Tells `listener` each answer of the Power Spots of the view, or why none came (step 2, R1-6). */
+  onSpots(listener: (spots: readonly PlaceSpot[] | 'failed' | 'zoom') => void): void;
 }
 
 export function showPlaces(
@@ -128,6 +146,29 @@ export function showPlaces(
 ): ShownPlaces {
   const checks: Array<() => void> = [];
   const redraws: Array<() => void> = [];
+  const spotListeners: Array<(spots: readonly PlaceSpot[] | 'failed' | 'zoom') => void> = [];
+  /** Tells the listeners of the Power Spots an answer, or why none came (R1-6). */
+  const toldSpots = (answer: readonly PlaceSpot[] | 'failed' | 'zoom'): void => {
+    for (const listener of spotListeners) listener(answer);
+  };
+  /**
+   * A place's popup at it: its name, as text of an element of ours (Leaflet sets a string as
+   * HTML), and for a Power Spot what the parties offer there ("Report max battle here", plan
+   * 8M-9A); its element.
+   */
+  const placePopup = (id: 'stops' | 'spots', place: PlaceSpot): HTMLElement | undefined => {
+    const content = renderNode(
+      {
+        tag: 'div',
+        className: 'place-popup',
+        children: [{ tag: 'strong', className: 'place-name', text: place.title }],
+      },
+      document,
+    );
+    if (id === 'spots') content.append(...(hooks?.spotControls(place) ?? []));
+    const popup = L.popup().setLatLng([place.lat, place.lon]).setContent(content).openOn(map);
+    return popup.getElement();
+  };
   for (const layer of LAYERS) {
     const group = L.layerGroup().addTo(map);
     /** The last answer shown, drawn again when what the parties draw changes. */
@@ -140,40 +181,53 @@ export function showPlaces(
       group.clearLayers();
       const colour = theme().colours[layer.colour];
       const shown = unoccupied(view.stops, hooks?.occupied(layer.id) ?? new Set<string>());
+      // While the Report button's step 2 picks them, each has a larger target to tap (R1-10).
+      const picked = hooks?.forced(layer.id) === true;
       for (const [id, lat, lon, title] of shown) {
         const marker = L.circleMarker([lat, lon], {
           radius: 5,
           weight: 2,
           color: colour,
           fillOpacity: 0.7,
+          // Ringed while the Report button's step 2 picks them (plan 8M-9A, `map.css`).
+          className: layer.id === 'spots' ? 'spot-dot' : 'stop-dot',
         });
-        // Its name, as text of an element of ours (Leaflet sets a string as HTML), and for a Power
-        // Spot what the parties offer there ("Report max battle here", plan 8M-9A); opened by our
-        // own handler rather than bound, which would open it before anything of ours.
+        // Opened by our own handler rather than bound, which would open it before anything of ours.
         const open = (): void => {
-          const content = renderNode(
-            {
-              tag: 'div',
-              className: 'place-popup',
-              children: [{ tag: 'strong', className: 'place-name', text: title }],
-            },
-            document,
-          );
-          if (layer.id === 'spots')
-            content.append(...(hooks?.spotControls({ id, title, lat, lon }) ?? []));
-          L.popup().setLatLng([lat, lon]).setContent(content).openOn(map);
+          placePopup(layer.id, { id, title, lat, lon });
         };
-        // A Power Spot tapped (or Enter on it) in route mode is the next stop of the train
-        // (plan 8M-8C, R5; review C10), as a gym is (`placeClicks`): no popup then.
-        if (layer.id === 'spots')
-          placeClicks(marker, title, () => spotTapped({ id, title, lat, lon }), open, focus);
-        else {
-          marker.on('click', (event: L.LeafletMouseEvent) => {
-            L.DomEvent.stopPropagation(event);
-            open();
-          });
+        const targets = [
+          marker,
+          ...(picked
+            ? [
+                L.circleMarker([lat, lon], {
+                  radius: PICKED_TARGET,
+                  stroke: false,
+                  fillOpacity: 0,
+                  className: 'place-target',
+                }),
+              ]
+            : []),
+        ];
+        for (const target of targets) {
+          // A Power Spot tapped (or Enter on it) in route mode is the next stop of the train
+          // (plan 8M-8C, R5; review C10), as a gym is (`placeClicks`): no popup then.
+          if (layer.id === 'spots') {
+            placeClicks(
+              target,
+              title,
+              () => spotTapped({ id, title, lat, lon }),
+              open,
+              target === marker ? focus : undefined,
+            );
+          } else {
+            target.on('click', (event: L.LeafletMouseEvent) => {
+              L.DomEvent.stopPropagation(event);
+              open();
+            });
+          }
+          target.addTo(group);
         }
-        marker.addTo(group);
       }
       registry.setCount(layer.id, shown.length);
     };
@@ -200,11 +254,17 @@ export function showPlaces(
       show: (view) => {
         last = view;
         draw(view);
+        if (layer.id === 'spots') {
+          const spots = view.stops.map(([id, lat, lon, title]) => ({ id, title, lat, lon }));
+          toldSpots(spots);
+        }
       },
       more: (more) => {
         quiet.set(layer.id, more ? MORE_THAN_SHOWN[layer.id] : undefined);
       },
-      failed: () => undefined,
+      failed: () => {
+        if (layer.id === 'spots') toldSpots('failed');
+      },
       delayMs: 300,
       setTimer: (run, ms) => {
         const timer = window.setTimeout(run, ms);
@@ -220,6 +280,7 @@ export function showPlaces(
         group.clearLayers();
         quiet.set(layer.id, undefined);
         registry.setCount(layer.id, 0);
+        if (layer.id === 'spots') toldSpots('zoom');
       },
     });
     const wanted = (): boolean =>
@@ -249,5 +310,9 @@ export function showPlaces(
     redrawn: () => {
       for (const redraw of redraws) redraw();
     },
+    openSpot: (spot) => placePopup('spots', spot),
+    onSpots: (listener) => {
+      spotListeners.push(listener);
+    },
   };
 }
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index 261bbffdb4f4c1723e5a6848cf1c30497cfc4b5e..93a9718e9a49a70b4767517da38cb7808285636b 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -139,7 +139,13 @@ export function raidUi(deps: RaidUiDeps) {
    * open, and only when the box is still in the page once the lists came (its popup may have
    * closed meanwhile).
    */
-  const openReport = async (box: HTMLElement, gym: MapGym, restore: () => void) => {
+  const openReport = async (
+    box: HTMLElement,
+    gym: MapGym,
+    restore: () => void,
+    /** The Report button's step 3 (plan 8M-9A, R1-3): the boss menu takes the focus. */
+    focusFirst = false,
+  ) => {
     const { hold } = deps;
     const claim = hold.take(formPlace(box));
     if (!claim) return;
@@ -191,6 +197,7 @@ export function raidUi(deps: RaidUiDeps) {
     });
     box.replaceChildren(form);
     hold.fit();
+    if (focusFirst) boss?.focus();
   };
 
   /**
@@ -250,12 +257,17 @@ export function raidUi(deps: RaidUiDeps) {
   };
 
   /** A click on "Report raid" (`reportBox`): the form in place of the button, in its box. */
-  const reportClicked = (button: HTMLButtonElement, gym: MapGym): void => {
+  const reportClicked = (button: HTMLButtonElement, gym: MapGym, focusFirst = false): void => {
     const box = button.parentElement;
     if (!box) return;
-    void openReport(box, gym, () => {
-      box.replaceChildren(button);
-    });
+    void openReport(
+      box,
+      gym,
+      () => {
+        box.replaceChildren(button);
+      },
+      focusFirst,
+    );
   };
 
   return {
diff --git a/src/web/client/report-flow.test.ts b/src/web/client/report-flow.test.ts
index ddc01fc7e2c2036907cab3959cd17f3034546e0a..ad019d2d59b2f96ea453a39bb2ae22d36b6fb321 100644
--- a/src/web/client/report-flow.test.ts
+++ b/src/web/client/report-flow.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from 'vitest';
 import type { PageNode } from './popup.js';
-import { pickBox } from './report-flow.js';
+import { nearestLines, pickBox, pickLive, regionHolding } from './report-flow.js';
 import { REPORT_KINDS } from './report-menu.js';
 
 /** Every text of a tree, in order. */
@@ -30,8 +30,16 @@ describe("the Report button's step 2 (plan 8M-9A)", () => {
       '← Back',
       'Cancel',
     ]);
-    // R1-3: its words told as they change; its heading takes the focus as step 2 begins.
-    expect(raid.attributes).toMatchObject({ 'aria-live': 'polite' });
+    // R1-3, R2-2: the words that change (the pin, the nearest) told from a part of its own that
+    // stays in the page, drawn anew alone (`pickLive`); its heading takes the focus as step 2
+    // begins.
+    expect(raid.attributes).not.toHaveProperty('aria-live');
+    const live = pickLive(kind('raid'), []);
+    expect(live.attributes).toEqual({ 'aria-live': 'polite', 'data-pick-live': '' });
+    expect(texts(live)).toEqual(['Nearest', 'None near here.']);
+    expect(
+      (raid.children ?? []).find((child) => child.attributes?.['data-pick-live'] !== undefined),
+    ).toEqual(pickLive(kind('raid')));
     expect(tagged(raid, 'span').find((span) => span.text === 'Report a raid')?.attributes).toEqual({
       tabindex: '-1',
       'data-pick-heading': '',
@@ -42,11 +50,89 @@ describe("the Report button's step 2 (plan 8M-9A)", () => {
     ]);
     expect(texts(pickBox(kind('max'))).slice(0, 2)).toEqual([
       'Report a max battle',
-      'Tap a Power Spot on the map.',
+      'Tap a Power Spot, or anywhere on the map for an unlisted power spot.',
     ]);
     expect(texts(pickBox(kind('spawn'))).slice(0, 2)).toEqual([
       'Report a wild spawn',
       'Tap the map where the Pokémon is.',
     ]);
   });
+
+  // A4: the nearest few beside the places drawn, from your location, else the map's middle.
+  it('lists the nearest places with their distances, each a button that picks it', () => {
+    const lines = nearestLines(
+      [
+        { id: '3', name: 'Far Fountain', lat: 40.46, lon: -79.95 },
+        { id: '1', name: 'Library', lat: 40.441, lon: -79.95 },
+        { id: '2', name: 'Bridge', lat: 40.444, lon: -79.95 },
+      ],
+      { lat: 40.44, lon: -79.95 },
+      'imperial',
+      2,
+    );
+    expect(lines).toEqual([
+      { id: '1', name: 'Library', distance: '360 ft' },
+      { id: '2', name: 'Bridge', distance: '0.3 mi' },
+    ]);
+    const box = pickBox(kind('raid'), lines);
+    expect(texts(box)).toEqual([
+      'Report a raid',
+      'Tap a gym on the map to report its raid.',
+      'Nearest',
+      'Library',
+      '360 ft',
+      'Bridge',
+      '0.3 mi',
+      '← Back',
+      'Cancel',
+    ]);
+    expect(
+      tagged(box, 'button')
+        .map((button) => button.attributes?.['data-report-near'])
+        .filter((id) => id !== undefined),
+    ).toEqual(['1', '2']);
+    // Still asked for (the Power Spots of the view): said so; none near: said so.
+    expect(texts(pickBox(kind('max'), 'loading'))).toContain('Finding the nearest…');
+    expect(texts(pickBox(kind('max'), []))).toContain('None near here.');
+    // R1-6: Power Spots that cannot be had, or are not drawn at this zoom, said so.
+    expect(texts(pickBox(kind('max'), 'failed'))).toContain(
+      'The Power Spots could not be loaded. Tap the map for an unlisted power spot.',
+    );
+    expect(texts(pickBox(kind('max'), 'zoom'))).toContain(
+      'Zoom in to see the Power Spots near here.',
+    );
+  });
+
+  // R1-1: a point tapped is a pin first; its line in the box opens the form there.
+  it('offers the pin a tap put, by the line "… here · Report here"', () => {
+    const at = { lat: 40.44, lon: -79.95 };
+    const max = pickBox(kind('max'), [], at);
+    expect(texts(max)).toEqual(expect.arrayContaining(['Unlisted power spot here', 'Report here']));
+    expect(
+      tagged(max, 'button').find((button) => button.attributes?.['data-report-pin'] !== undefined)
+        ?.text,
+    ).toBe('Report here');
+    expect(texts(pickBox(kind('spawn'), undefined, at))).toEqual(
+      expect.arrayContaining(['Spawn here', 'Report here']),
+    );
+  });
+
+  // A5: a new train's region, prefilled where one region alone holds the place.
+  it("prefills a train's region when one region alone holds your location or the map's middle", () => {
+    const square = (south: number, west: number, size: number): Array<[number, number]> => [
+      [south, west],
+      [south + size, west],
+      [south + size, west + size],
+      [south, west + size],
+      [south, west],
+    ];
+    const regions = [
+      { id: 1, name: 'oakland', outline: square(40.43, -79.97, 0.02) },
+      { id: 2, name: 'shadyside', outline: square(40.44, -79.96, 0.02) },
+    ];
+    expect(regionHolding({ lat: 40.435, lon: -79.965 }, regions)).toBe(1);
+    // In both: none prefilled; in none: none.
+    expect(regionHolding({ lat: 40.445, lon: -79.955 }, regions)).toBeUndefined();
+    expect(regionHolding({ lat: 41, lon: -79 }, regions)).toBeUndefined();
+  });
 });
diff --git a/src/web/client/report-flow.ts b/src/web/client/report-flow.ts
index e08ff08a6aecebfcd184c0b58d31c0673487159d..1d0d525953bd809d5dc34726ee90f7701d6fbf0a 100644
--- a/src/web/client/report-flow.ts
+++ b/src/web/client/report-flow.ts
@@ -1,27 +1,168 @@
+import type { GeoView } from '../../domain/web/geo-data.js';
+import { distanceWords, metersBetween, type DistanceUnits } from './distance.js';
 import type { PageNode } from './popup.js';
 import { iconNode, type ReportKind, type ReportPick } from './report-menu.js';
+import { regionsAt } from './spawn-forms.js';
+import type { LatLon } from './view.js';
 
 /**
  * The Report button's step 2, where (plan 8M-9A; design "Reporting"): the places that fit drawn on
  * the map whatever the layers say (gyms for a raid, Power Spots for a max battle, any point for a
- * spawn), and in the side pane's box (docked under the map on a phone) what to tap, a way back to
- * step 1 and Cancel. A tap on a place goes to step 3, the kind's own form with the place. Pure;
- * the page's side is `report-ui.ts`.
+ * spawn), and in the side pane's box (docked under the map on a phone) what to tap, the nearest
+ * few with their distances (from your location, else the map's middle: `nearestLines`), a way back
+ * to step 1 and Cancel. A tap on a place or a line goes to step 3, the kind's own form with the
+ * place. A train and a meetup have none: their forms ask their place (a train's region prefilled
+ * where one region alone holds the place, `regionHolding`). Pure; the page's side is
+ * `report-ui.ts`.
  */
 
 /** What step 2 says to tap, by how the kind's place is picked. */
 const PICK_HINTS: Readonly<Record<Exclude<ReportPick, 'form'>, string>> = {
   gyms: 'Tap a gym on the map to report its raid.',
-  spots: 'Tap a Power Spot on the map.',
+  spots: 'Tap a Power Spot, or anywhere on the map for an unlisted power spot.',
   stops: 'Tap a PokéStop on the map.',
   point: 'Tap the map where the Pokémon is.',
 };
 
+/** How many of the nearest places step 2 lists. */
+export const NEAREST_COUNT = 5;
+
+/** A place step 2 may list: a gym, a Power Spot, a PokéStop, by its id. */
+export interface NearPlace {
+  id: string;
+  name: string;
+  lat: number;
+  lon: number;
+}
+
+/** A line of the nearest places: the place's id, its name, how far it is in words. */
+export interface NearLine {
+  id: string;
+  name: string;
+  distance: string;
+}
+
+/**
+ * The `count` places nearest to `origin` (your location, else the map's middle), nearest first,
+ * their distances in the settings' units (`distanceWords`, as every distance Pine says).
+ */
+export function nearestLines(
+  places: readonly NearPlace[],
+  origin: LatLon,
+  units: DistanceUnits,
+  count = NEAREST_COUNT,
+): NearLine[] {
+  return places
+    .map((place) => ({ place, meters: metersBetween(origin, place) }))
+    .sort((a, b) => a.meters - b.meters || a.place.name.localeCompare(b.place.name))
+    .slice(0, count)
+    .map(({ place, meters }) => ({
+      id: place.id,
+      name: place.name,
+      distance: distanceWords(meters, units),
+    }));
+}
+
+/**
+ * The region a new train is prefilled with (A5): the one region whose outline holds the place
+ * (your location, else the map's middle); none where it lies in several or in none.
+ */
+export function regionHolding(place: LatLon, regions: GeoView['regions']): number | undefined {
+  const holding = regionsAt(place, regions);
+  return holding.length === 1 ? holding[0]?.id : undefined;
+}
+
+/**
+ * The nearest places of step 2: their lines, still asked for (`loading`), not to be had
+ * (`failed`), or not drawn at this zoom (`zoom`; R1-6).
+ */
+export type Nearest = readonly NearLine[] | 'loading' | 'failed' | 'zoom';
+
+/** What step 2 says of the Power Spots while it has none to list (R1-6). */
+const NEAREST_WORDS: Readonly<Record<Exclude<Nearest, readonly NearLine[]>, string>> = {
+  loading: 'Finding the nearest…',
+  failed: 'The Power Spots could not be loaded. Tap the map for an unlisted power spot.',
+  zoom: 'Zoom in to see the Power Spots near here.',
+};
+
+/** The nearest places as buttons (`data-report-near`), or what is said while it has none. */
+function nearestPart(nearest: Nearest | undefined): PageNode[] {
+  if (nearest === undefined) return [];
+  const label: PageNode = { tag: 'div', className: 'near-label', text: 'Nearest' };
+  if (typeof nearest === 'string') {
+    return [label, { tag: 'p', className: 'near-none', text: NEAREST_WORDS[nearest] }];
+  }
+  if (nearest.length === 0) {
+    return [label, { tag: 'p', className: 'near-none', text: 'None near here.' }];
+  }
+  return [
+    label,
+    {
+      tag: 'div',
+      className: 'near-places',
+      children: nearest.map((line): PageNode => ({
+        tag: 'button',
+        className: 'near-place',
+        attributes: { type: 'button', 'data-report-near': line.id },
+        children: [
+          { tag: 'span', className: 'near-name', text: line.name },
+          { tag: 'span', className: 'near-distance', text: line.distance },
+        ],
+      })),
+    },
+  ];
+}
+
+/** What a pin of step 2 is called in its line (R1-1). */
+const PIN_WORDS: Readonly<Partial<Record<ReportPick, string>>> = {
+  spots: 'Unlisted power spot here',
+  point: 'Spawn here',
+};
+
+/**
+ * The line of the pin a tap put (R1-1): what it is, and "Report here", which opens the kind's
+ * form there; a second tap moves the pin, so a double tap only zooms the map.
+ */
+function pinPart(kind: ReportKind, pin: LatLon | undefined): PageNode[] {
+  const words = PIN_WORDS[kind.pick];
+  if (pin === undefined || words === undefined) return [];
+  return [
+    {
+      tag: 'div',
+      className: 'pin-line',
+      children: [
+        { tag: 'span', text: words },
+        {
+          tag: 'button',
+          className: 'press primary',
+          text: 'Report here',
+          attributes: { type: 'button', 'data-report-pin': '' },
+        },
+      ],
+    },
+  ];
+}
+
+/**
+ * The part of step 2's box that changes (R2-2): the pin a tap put (R1-1) and the nearest places,
+ * in an element that stays in the page while only its content is drawn anew, told as it changes
+ * (`aria-live`, R1-3).
+ */
+export function pickLive(kind: ReportKind, nearest?: Nearest, pin?: LatLon): PageNode {
+  return {
+    tag: 'div',
+    className: 'pick-live',
+    attributes: { 'aria-live': 'polite', 'data-pick-live': '' },
+    children: [...pinPart(kind, pin), ...nearestPart(nearest)],
+  };
+}
+
 /**
  * Step 2 of a kind: its heading with its icon (a heading that takes the focus as step 2 begins,
- * and a box whose words are told as they change: R1-3), what to tap, ← Back and Cancel.
+ * R1-3), what to tap, the part that changes (`pickLive`: the pin, the nearest places, none for a
+ * spawn's point), ← Back and Cancel.
  */
-export function pickBox(kind: ReportKind): PageNode {
+export function pickBox(kind: ReportKind, nearest?: Nearest, pin?: LatLon): PageNode {
   const hint = kind.pick === 'form' ? '' : PICK_HINTS[kind.pick];
   return {
     tag: 'div',
@@ -30,7 +171,6 @@ export function pickBox(kind: ReportKind): PageNode {
       'data-form': 'report-pick',
       role: 'group',
       'aria-label': kind.heading,
-      'aria-live': 'polite',
     },
     children: [
       {
@@ -46,6 +186,7 @@ export function pickBox(kind: ReportKind): PageNode {
         ],
       },
       { tag: 'p', className: 'hint', text: hint },
+      pickLive(kind, nearest, pin),
       {
         tag: 'div',
         className: 'form-buttons',
diff --git a/src/web/client/report-ui.isolated.test.ts b/src/web/client/report-ui.isolated.test.ts
index 18fc889cbc6f415bf6f56b541f796965775a7f4e..9bf4100322bee71a6bae5e40a51a7f0bd5fac797 100644
--- a/src/web/client/report-ui.isolated.test.ts
+++ b/src/web/client/report-ui.isolated.test.ts
@@ -1,5 +1,6 @@
 import { describe, expect, it, vi } from 'vitest';
-import type { PageNode } from './popup.js';
+import type { GeoView } from '../../domain/web/geo-data.js';
+import type { PageNode, MapGym } from './popup.js';
 import { FormHold } from './raid-forms.js';
 import { REPORT_KINDS, type ReportKind } from './report-menu.js';
 import { ReportFlow, type ReportFlowDeps } from './report-ui.js';
@@ -21,6 +22,37 @@ const kind = (id: string): ReportKind => {
   return found;
 };
 
+const gym = (id: number, name: string, lat: number, lon: number): MapGym => ({
+  id,
+  name,
+  nickname: null,
+  lat,
+  lon,
+  regionIds: [1],
+  address: null,
+  description: null,
+  notice: null,
+});
+
+const GYMS = new Map([
+  [1, gym(1, 'Library', 40.441, -79.95)],
+  [2, gym(2, 'Fountain', 40.444, -79.95)],
+]);
+
+const REGIONS: GeoView['regions'] = [
+  {
+    id: 7,
+    name: 'oakland',
+    outline: [
+      [40.43, -79.97],
+      [40.46, -79.97],
+      [40.46, -79.93],
+      [40.43, -79.93],
+      [40.43, -79.97],
+    ],
+  },
+];
+
 /**
  * The controller over a real hold and fake deps that write down what they were asked, and, for a
  * step 3, whether the hold was free at that moment (the form takes its own claim).
@@ -28,6 +60,9 @@ const kind = (id: string): ReportKind => {
 function started(more: Partial<ReportFlowDeps> = {}) {
   const calls: string[] = [];
   let box: PageNode | undefined;
+  /** The live part of the box drawn anew since the box was drawn (R2-2). */
+  let live: PageNode | undefined;
+  const landings: Array<() => void> = [];
   let inBox = true;
   const later: Array<() => void> = [];
   const hold = new FormHold<string>({
@@ -44,18 +79,44 @@ function started(more: Partial<ReportFlowDeps> = {}) {
     say: (text) => calls.push(`say ${text}`),
     showBox: (node) => {
       box = node;
+      live = undefined;
       calls.push(node === undefined ? 'box back' : 'box');
     },
+    showLive: (node) => {
+      live = node;
+      calls.push('live');
+    },
     focusBox: () => calls.push('focus box'),
     focusInBox: () => inBox,
     focusReport: () => calls.push('focus Report'),
+    mark: (pick) => calls.push(`mark ${pick ?? 'none'}`),
     placesChanged: () => calls.push('places'),
     redrawn: () => calls.push('redrawn'),
     closePopup: () => calls.push('close popup'),
     openMenu: () => calls.push('menu'),
     later: (run) => later.push(run),
+    regions: REGIONS,
+    gyms: GYMS,
+    origin: () => ({ lat: 40.44, lon: -79.95 }),
+    units: 'imperial',
+    flyTo: (at, landed) => {
+      calls.push(`fly ${String(at.lat)}`);
+      landings.push(landed);
+    },
+    showPin: (point) => calls.push(point === undefined ? 'pin off' : `pin ${String(point.lat)}`),
+    openRaid: (one) => {
+      calls.push(`raid? ${one.name} ${free()}`);
+      return one.id === 2;
+    },
+    toRaidForm: (one) => calls.push(`raid form ${one.name} ${free()}`),
+    openBattle: (spot) => {
+      calls.push(`battle? ${spot} ${free()}`);
+      return spot === 'busy';
+    },
+    toMaxForm: (spot) => calls.push(`max form ${spot.title} ${free()}`),
+    maxAt: (point) => calls.push(`max at ${String(point.lat)} ${free()}`),
     spawnAt: (point) => calls.push(`spawn at ${String(point.lat)} ${free()}`),
-    startTrain: () => calls.push('train'),
+    startTrain: (region) => calls.push(`train ${String(region)}`),
     startMeetup: () => calls.push('meetup'),
     ...more,
   };
@@ -65,6 +126,11 @@ function started(more: Partial<ReportFlowDeps> = {}) {
     hold,
     calls,
     box: () => box,
+    /** What the box shows now: its live part as last drawn, else the box as drawn. */
+    shown: () => texts(live ?? box),
+    land: () => {
+      for (const landed of landings.splice(0)) landed();
+    },
     leave: () => {
       inBox = false;
     },
@@ -83,7 +149,7 @@ describe("the Report button's step 2 (plan 8M-9A, R1-2)", () => {
     expect(flow.picks('point')).toBe(true);
     expect(flow.inTools()).toBe(true);
     expect(texts(box())[0]).toBe('Report a wild spawn');
-    expect(calls).toEqual(['close popup', 'box', 'places', 'redrawn', 'focus box']);
+    expect(calls).toEqual(['close popup', 'mark point', 'box', 'places', 'redrawn', 'focus box']);
   });
 
   it('gives everything back on Cancel: the hold, the box, the places, the focus on Report', () => {
@@ -93,7 +159,14 @@ describe("the Report button's step 2 (plan 8M-9A, R1-2)", () => {
     flow.cancel();
     expect(hold.editing).toBe(false);
     expect(flow.picks('point')).toBe(false);
-    expect(calls).toEqual(['box back', 'places', 'redrawn', 'focus Report']);
+    expect(calls).toEqual([
+      'box back',
+      'places',
+      'redrawn',
+      'mark none',
+      'pin off',
+      'focus Report',
+    ]);
     // The focus elsewhere meanwhile: left where it is.
     const other = started();
     other.flow.choose(kind('spawn'));
@@ -159,22 +232,100 @@ describe("the Report button's step 2 (plan 8M-9A, R1-2)", () => {
     expect(calls).toEqual(['say Close the form that is open first.']);
     expect(hold.holds(other ?? { inPopup: false })).toBe(true);
   });
+});
 
-  it('lets a tapped gym open as a tap does, step 2 ending once the tap is through', () => {
-    const { flow, hold, runLater } = started();
+describe("the Report button's step 2 per kind and step 3 (plan 8M-9A, A4 to A6)", () => {
+  it('lists the nearest gyms; a gym picked opens its raid, else its form, the hold free first', () => {
+    const { flow, calls, box } = started();
     flow.choose(kind('raid'));
-    expect(
-      flow.gymClicked({ lat: 40.44, lon: -79.95 } as Parameters<typeof flow.gymClicked>[0]),
-    ).toBe(false);
+    expect(texts(box())).toEqual(
+      expect.arrayContaining(['Nearest', 'Library', '360 ft', 'Fountain', '0.3 mi']),
+    );
+    expect(calls).toContain('mark gyms');
+    calls.length = 0;
+    expect(flow.gymClicked(GYMS.get(1) as MapGym)).toBe(true);
+    expect(calls).toContain('raid? Library free');
+    expect(calls.at(-1)).toBe('raid form Library free');
+    // The raid standing at a gym: opened, no form; from its line in the list too.
+    flow.choose(kind('raid'));
+    calls.length = 0;
+    flow.nearPicked('2');
+    expect(calls.at(-1)).toBe('raid? Fountain free');
+  });
+
+  it('flies to the Power Spots, lists them as they come, and says why when they do not', () => {
+    const { flow, calls, shown, land } = started();
+    flow.choose(kind('max'));
+    expect(calls).toContain('fly 40.44');
+    expect(shown()).toContain('Finding the nearest…');
+    // R2-4: on its way, the map's zoom says nothing yet: the places are not taken off for good.
+    flow.spotsCame('zoom');
+    expect(shown()).toContain('Finding the nearest…');
+    land();
+    flow.spotsCame('failed');
+    expect(shown()).toContain(
+      'The Power Spots could not be loaded. Tap the map for an unlisted power spot.',
+    );
+    flow.spotsCame('zoom');
+    expect(shown()).toContain('Zoom in to see the Power Spots near here.');
+    // R2-2: only the live part of the box is drawn anew, never the box.
+    calls.length = 0;
+    flow.spotsCame([
+      { id: 'busy', title: 'Gazebo', lat: 40.4405, lon: -79.95 },
+      { id: 'quiet', title: 'Bench', lat: 40.442, lon: -79.95 },
+    ]);
+    expect(calls).toEqual(['live']);
+    expect(shown()).toEqual(expect.arrayContaining(['Gazebo', 'Bench']));
+    calls.length = 0;
+    flow.nearPicked('quiet');
+    expect(calls).toEqual([
+      'box back',
+      'places',
+      'redrawn',
+      'mark none',
+      'pin off',
+      'battle? quiet free',
+      'max form Bench free',
+    ]);
+  });
+
+  it("opens a battle's marker as it would, step 2 ending once the tap is through", () => {
+    const { flow, hold, runLater } = started();
+    flow.choose(kind('max'));
+    expect(flow.spotClicked({ lat: 40.44, lon: -79.95 }, true)).toBe(false);
     expect(hold.editing).toBe(true);
     runLater();
     expect(hold.editing).toBe(false);
   });
 
-  it("opens a spawn's form at a point tapped, the hold free first", () => {
-    const { flow, calls } = started();
-    flow.choose(kind('spawn'));
+  // R1-1: a tap puts a pin; the form opens from the box, so a double tap only zooms.
+  it('puts a pin where the map is tapped, and opens the form there from the box', () => {
+    const { flow, calls, shown } = started();
+    flow.choose(kind('max'));
+    calls.length = 0;
     expect(flow.mapClicked({ lat: 40.45, lon: -79.95 })).toBe(true);
-    expect(calls.at(-1)).toBe('spawn at 40.45 free');
+    expect(flow.mapClicked({ lat: 40.451, lon: -79.95 })).toBe(true);
+    expect(calls).toEqual(['pin 40.45', 'live', 'pin 40.451', 'live']);
+    expect(flow.picks('spots')).toBe(true);
+    expect(shown()).toEqual(expect.arrayContaining(['Unlisted power spot here', 'Report here']));
+    calls.length = 0;
+    flow.pinPicked();
+    expect(calls.at(-1)).toBe('max at 40.451 free');
+    expect(calls).toContain('pin off');
+    // A spawn: its pin at a gym or Power Spot tapped as at a point.
+    const spawn = started();
+    spawn.flow.choose(kind('spawn'));
+    expect(spawn.flow.gymClicked(GYMS.get(2) as MapGym)).toBe(true);
+    expect(spawn.shown()).toEqual(expect.arrayContaining(['Spawn here', 'Report here']));
+    spawn.flow.pinPicked();
+    expect(spawn.calls.at(-1)).toBe('spawn at 40.444 free');
+  });
+
+  it('opens a train with its region prefilled and a meetup with its picking, no step 2', () => {
+    const { flow, hold, calls } = started();
+    flow.choose(kind('train'));
+    flow.choose(kind('meetup'));
+    expect(calls).toEqual(['train 7', 'meetup']);
+    expect(hold.editing).toBe(false);
   });
 });
diff --git a/src/web/client/report-ui.ts b/src/web/client/report-ui.ts
index a56fca823d41c53c46f7bf6c44b37a069a66bc30..ab57adab4e97087d40a5b1fbcc41f1d4d7a0f905 100644
--- a/src/web/client/report-ui.ts
+++ b/src/web/client/report-ui.ts
@@ -1,9 +1,21 @@
 import * as L from 'leaflet';
+import type { GeoView } from '../../domain/web/geo-data.js';
+import { PLACES_FROM } from './cluster.js';
 import { byId, say } from './common.js';
+import type { DistanceUnits } from './distance.js';
 import { SheetFocus } from './layers-ui.js';
+import { sameControl } from './list-ui.js';
+import type { MapSpot } from './max-ui.js';
 import { renderNode, type MapGym, type PageNode } from './popup.js';
 import type { FormClaim, FormHold } from './raid-forms.js';
-import { pickBox } from './report-flow.js';
+import {
+  nearestLines,
+  pickBox,
+  pickLive,
+  regionHolding,
+  type NearPlace,
+  type Nearest,
+} from './report-flow.js';
 import { REPORT_ICONS, type ReportIcon, type ReportKindId } from './report-icons.js';
 import { REPORT_KINDS, reportMenuNode, type ReportKind, type ReportPick } from './report-menu.js';
 import { newTrainButton } from './train-forms.js';
@@ -21,9 +33,14 @@ import type { LatLon } from './view.js';
  * and Cancel close it). Steps 2 and 3 are `ReportFlow`'s, a controller over the hold and what the
  * page gives it (R1-2: tested without a page): step 2 holds the side pane's box as route mode does
  * (an aside claim of the hold, `take(false, true)`), its heading focused (R1-3), the fitting places
- * drawn whatever the layers say (`picks`), and a tap on one goes on to step 3, the kind's own form
- * with the place, the claim let go first so that the form takes its own. A train and a meetup have
- * no step 2: their forms ask their place.
+ * drawn whatever the layers say (`picks`) and ringed on the map (`mark`), the nearest few listed
+ * with their distances (a raid's from the gyms the page has; a max battle's from the Power Spots
+ * of the view, the map flown to where you are at their zoom, A4), and a tap on one or on its line
+ * goes on to step 3, the kind's own form with the place, the claim let go first so that the form
+ * takes its own (A6): a raid's report form in the gym's popup, or the raid standing there; a max
+ * battle's form in the spot's popup, or the battle there. A tap on the map while a max battle or
+ * a spawn is picked puts a pin, whose line in the box opens the form there (R1-1: a double tap
+ * only zooms). A train and a meetup have no step 2: their forms ask their place (A5).
  */
 
 /** What the page says of Report while another form is open. */
@@ -35,34 +52,79 @@ export interface ReportFlowDeps {
   say(text: string): void;
   /** Step 2's box drawn into the side pane's box; none: the box given back to "New train". */
   showBox(box: PageNode | undefined): void;
+  /** Step 2's changing part (`pickLive`) drawn anew in the box, the box and its focus kept (R2-2). */
+  showLive(live: PageNode): void;
   /** The focus on step 2's heading (R1-3). */
   focusBox(): void;
   /** Whether the focus is in step 2's box. */
   focusInBox(): boolean;
   /** The focus back on the Report button. */
   focusReport(): void;
+  /** The map's look while step 2 picks (`map.css`: the fitting places ringed, the rest dimmed). */
+  mark(pick: ReportPick | undefined): void;
   /** The gyms and places step 2 draws, drawn or taken away. */
   placesChanged(): void;
-  /** The parties drawn anew (the rings let taps through while step 2 picks). */
+  /** The parties drawn anew (the raids drawn for a raid's step 2, C1; the rings let taps through). */
   redrawn(): void;
   closePopup(): void;
   /** Step 1's menu (← Back). */
   openMenu(): void;
   /** Runs after the event being handled (a tap a popup opens on). */
   later(run: () => void): void;
-  /** A spawn's step 3: its form at the point. */
+  /** The server's regions with their outlines (a train's region prefilled). */
+  regions: GeoView['regions'];
+  /** The gyms of the map, the nearest of which step 2 of a raid lists. */
+  gyms: ReadonlyMap<number, MapGym>;
+  /** Where distances are from: your location once the browser said, else the map's middle. */
+  origin(): LatLon;
+  units: DistanceUnits;
+  /**
+   * The map flown to a place at the zoom the Power Spots are drawn from (A4); `landed` once it is
+   * there (R2-4).
+   */
+  flyTo(place: LatLon, landed: () => void): void;
+  /** The pin of step 2 (R1-1), or none. */
+  showPin(point: LatLon | undefined): void;
+  /**
+   * A raid's step 3 (A5): the raid that stands at the gym opened (true), as the gym's popup offers
+   * it (one raid per gym, plan 8E), where the map draws it; false where none is drawn there.
+   */
+  openRaid(gym: MapGym): boolean;
+  /** A raid's step 3 at a gym without one: its report form in the gym's popup. */
+  toRaidForm(gym: MapGym): void;
+  /** A max battle's step 3 at a Power Spot: the battle there opened (true), where one is drawn. */
+  openBattle(spotId: string): boolean;
+  /** A max battle's step 3 at a Power Spot without one: its form in the spot's popup. */
+  toMaxForm(spot: MapSpot): void;
+  /** A max battle's step 3 at a pin: the form of an unlisted power spot there. */
+  maxAt(point: LatLon): void;
+  /** A spawn's step 3: its form at the pin. */
   spawnAt(point: LatLon): void;
-  /** The kinds without a step 2: the forms that ask their place themselves. */
-  startTrain(): void;
+  /**
+   * The kinds without a step 2 (A5): a new train's form, its region prefilled where one region
+   * alone holds your location or the map's middle (`regionHolding`); a new meetup's form with its
+   * own picking of a place already started.
+   */
+  startTrain(region: number | undefined): void;
   startMeetup(): void;
 }
 
 /**
- * Steps 2 and 3 of the Report button (R1-2): what is picked, its claim of the hold, and what each
- * tap leads to, over `ReportFlowDeps`.
+ * Steps 2 and 3 of the Report button (R1-2): what is picked, its claim of the hold, the nearest
+ * places, the pin, and what each tap leads to, over `ReportFlowDeps`.
  */
 export class ReportFlow {
-  private picking: { kind: ReportKind; claim: FormClaim } | undefined;
+  private picking:
+    | {
+        kind: ReportKind;
+        claim: FormClaim;
+        nearest: Nearest | undefined;
+        places: Map<string, NearPlace>;
+        pin: LatLon | undefined;
+        /** The map on its way to the Power Spots (R2-4): its zoom on the way says nothing. */
+        flying: boolean;
+      }
+    | undefined;
 
   constructor(private readonly deps: ReportFlowDeps) {}
 
@@ -79,8 +141,9 @@ export class ReportFlow {
   /** A kind chosen in step 1. */
   choose(kind: ReportKind): void {
     if (kind.pick === 'form') {
-      if (kind.id === 'train') this.deps.startTrain();
-      else this.deps.startMeetup();
+      if (kind.id === 'train') {
+        this.deps.startTrain(regionHolding(this.deps.origin(), this.deps.regions));
+      } else this.deps.startMeetup();
       return;
     }
     this.start(kind);
@@ -94,18 +157,56 @@ export class ReportFlow {
       deps.say(FORM_OPEN);
       return;
     }
-    this.picking = { kind, claim };
+    const origin = deps.origin();
+    this.picking = {
+      kind,
+      claim,
+      nearest: undefined,
+      places: new Map(),
+      pin: undefined,
+      flying: false,
+    };
     deps.closePopup();
-    deps.showBox(pickBox(kind));
+    if (kind.pick === 'gyms') {
+      // Every gym is known to the page: the nearest of them at once.
+      const gyms = [...deps.gyms.values()].map((gym): NearPlace => ({
+        id: String(gym.id),
+        name: gym.name,
+        lat: gym.lat,
+        lon: gym.lon,
+      }));
+      this.picking.places = new Map(gyms.map((gym) => [gym.id, gym]));
+      this.picking.nearest = nearestLines(gyms, origin, deps.units);
+    } else if (kind.pick === 'spots') {
+      // A4: the map flies to where you are (else stays at its middle) at the zoom the Power Spots
+      // are drawn from, whose answer for that box lists the nearest (`spotsCame`).
+      this.picking.nearest = 'loading';
+      this.picking.flying = true;
+      const flight = this.picking;
+      deps.flyTo(origin, () => {
+        flight.flying = false;
+      });
+    }
+    deps.mark(kind.pick);
+    deps.showBox(pickBox(kind, this.picking.nearest));
     deps.placesChanged();
     deps.redrawn();
     deps.focusBox();
   }
 
   /**
-   * Step 2 ends: its claim let go, the box given back, its places gone, the parties drawn anew
-   * (`redraw`: not from inside their own draw, R1-9), the focus back on Report where it was in the
-   * box (`focus`: not for a step 3, whose form takes it).
+   * Step 2's changing part drawn anew (the nearest came, a pin was put): only it, never the box,
+   * whose controls and focus stay (R2-2).
+   */
+  private draw(): void {
+    const open = this.picking;
+    if (open) this.deps.showLive(pickLive(open.kind, open.nearest, open.pin));
+  }
+
+  /**
+   * Step 2 ends: its claim let go, the box given back, its places and pin gone, the parties drawn
+   * anew (`redraw`: not from inside their own draw, R1-9), the focus back on Report where it was in
+   * the box (`focus`: not for a step 3, whose form takes it).
    */
   private end(how: { redraw?: boolean; focus?: boolean } = {}): void {
     const open = this.picking;
@@ -117,6 +218,8 @@ export class ReportFlow {
     deps.hold.release(open.claim);
     deps.placesChanged();
     if (how.redraw !== false) deps.redrawn();
+    deps.mark(undefined);
+    deps.showPin(undefined);
     if (hadFocus) deps.focusReport();
   }
 
@@ -151,60 +254,146 @@ export class ReportFlow {
     if (!offered) this.end({ redraw: false, focus: true });
   }
 
-  /** Step 3 follows a tap that step 2 took: once the tap is through (its popup open, say). */
-  private thenEnd(): void {
-    this.deps.later(() => {
-      this.end();
-    });
+  /** Step 2 ends for step 3: the claim let go first, so that the form takes its own. */
+  private toStep3(): void {
+    this.end();
+  }
+
+  /** A gym picked in step 2 of a raid (A5): the raid standing there opened, else its form. */
+  private gymPicked(gym: MapGym): void {
+    this.toStep3();
+    if (!this.deps.openRaid(gym)) this.deps.toRaidForm(gym);
+  }
+
+  /** A Power Spot picked in step 2 of a max battle: its battle opened, else its form. */
+  private spotPicked(spot: MapSpot): void {
+    this.toStep3();
+    if (!this.deps.openBattle(spot.id)) this.deps.toMaxForm(spot);
+  }
+
+  /** The pin of step 2 put (R1-1): shown on the map and in the box, which opens the form there. */
+  private pinAt(point: LatLon): void {
+    const open = this.picking;
+    if (!open) return;
+    open.pin = point;
+    this.deps.showPin(point);
+    this.draw();
   }
 
   /**
-   * A gym (its dot or the marker of its raids) tapped: in step 2 of a raid it opens as a tap does
-   * (its "Report raid", or the raid that stands there), step 2 ending after; of a spawn its place
-   * is the point (true: no popup). False otherwise.
+   * A gym (its dot or the marker of its raids) tapped: in step 2 of a raid, step 3 there; of a
+   * spawn, the pin at its place. True: its own popup is not wanted.
    */
   gymClicked(gym: MapGym): boolean {
     const pick = this.picking?.kind.pick;
     if (pick === 'gyms') {
-      this.thenEnd();
-      return false;
+      this.gymPicked(gym);
+      return true;
     }
     if (pick === 'point') {
-      this.end();
-      this.deps.spawnAt({ lat: gym.lat, lon: gym.lon });
+      this.pinAt({ lat: gym.lat, lon: gym.lon });
       return true;
     }
     return false;
   }
 
-  /** A Power Spot (or the battle at one) tapped: as `gymClicked`, for a max battle. */
-  spotClicked(spot: { lat: number; lon: number }): boolean {
+  /**
+   * A Power Spot tapped (or a max battle's marker, `battle`, which opens as it would, step 2
+   * ending once the tap is through): in step 2 of a max battle, step 3 there; of a spawn, the pin
+   * at its place.
+   */
+  spotClicked(
+    spot: { id?: string; title?: string; lat: number; lon: number },
+    battle = false,
+  ): boolean {
     const pick = this.picking?.kind.pick;
     if (pick === 'spots') {
-      this.thenEnd();
-      return false;
+      if (battle || spot.id === undefined) {
+        this.deps.later(() => {
+          this.end();
+        });
+        return false;
+      }
+      this.spotPicked({ id: spot.id, title: spot.title ?? '', lat: spot.lat, lon: spot.lon });
+      return true;
     }
     if (pick === 'point') {
-      this.end();
-      this.deps.spawnAt({ lat: spot.lat, lon: spot.lon });
+      this.pinAt({ lat: spot.lat, lon: spot.lon });
       return true;
     }
     return false;
   }
 
-  /** A point of the map tapped: in step 2 of a spawn, its form there (true). */
+  /** A point of the map tapped: in step 2 of a max battle or a spawn, the pin there (true). */
   mapClicked(point: LatLon): boolean {
-    if (this.picking?.kind.pick !== 'point') return false;
-    this.end();
-    this.deps.spawnAt(point);
+    const pick = this.picking?.kind.pick;
+    if (pick !== 'point' && pick !== 'spots') return false;
+    this.pinAt(point);
     return true;
   }
+
+  /** "Report here" on the pin's line: step 3 there. */
+  pinPicked(): void {
+    const open = this.picking;
+    const pin = open?.pin;
+    if (!open || pin === undefined) return;
+    this.toStep3();
+    if (open.kind.pick === 'spots') this.deps.maxAt(pin);
+    else this.deps.spawnAt(pin);
+  }
+
+  /** A line of the nearest places picked, by its place's id. */
+  nearPicked(id: string): void {
+    const open = this.picking;
+    const place = open?.places.get(id);
+    if (!open || !place) return;
+    if (open.kind.pick === 'gyms') {
+      const gym = this.deps.gyms.get(Number(id));
+      if (gym) this.gymPicked(gym);
+    } else if (open.kind.pick === 'spots') {
+      this.spotPicked({ id: place.id, title: place.name, lat: place.lat, lon: place.lon });
+    }
+  }
+
+  /**
+   * The Power Spots of the view came (A4), could not be had or are not drawn at this zoom (R1-6):
+   * step 2 of a max battle lists the nearest, or says why it has none.
+   */
+  spotsCame(answer: readonly MapSpot[] | 'failed' | 'zoom'): void {
+    const open = this.picking;
+    if (open?.kind.pick !== 'spots') return;
+    if (typeof answer === 'string') {
+      // On its way the map passes zooms the Power Spots are not drawn from (R2-4).
+      if (answer === 'zoom' && open.flying) return;
+      open.nearest = answer;
+    } else {
+      const places = answer.map((spot): NearPlace => ({
+        id: spot.id,
+        name: spot.title,
+        lat: spot.lat,
+        lon: spot.lon,
+      }));
+      open.places = new Map(places.map((place) => [place.id, place]));
+      open.nearest = nearestLines(places, this.deps.origin(), this.deps.units);
+    }
+    this.draw();
+  }
 }
 
 /** What the page's side of the Report button needs beyond the controller's. */
 export interface ReportUiDeps extends Omit<
   ReportFlowDeps,
-  'say' | 'showBox' | 'focusBox' | 'focusInBox' | 'focusReport' | 'openMenu' | 'later'
+  | 'say'
+  | 'showBox'
+  | 'showLive'
+  | 'focusBox'
+  | 'focusInBox'
+  | 'focusReport'
+  | 'mark'
+  | 'openMenu'
+  | 'later'
+  | 'flyTo'
+  | 'showPin'
 > {
   map: L.Map;
   /** The side pane's box, where step 2 is drawn (the trains' "New train" otherwise). */
@@ -217,6 +406,8 @@ export interface ReportUiDeps extends Omit<
   closeCard(): void;
   /** On a phone, the map in place of the list. */
   showMap(): void;
+  /** Tells `listener` each answer of the Power Spots of the view, or why there is none (A4, R1-6). */
+  onSpots(listener: (spots: readonly MapSpot[] | 'failed' | 'zoom') => void): void;
 }
 
 const SVG = 'http://www.w3.org/2000/svg';
@@ -279,6 +470,9 @@ export function reportUi(deps: ReportUiDeps) {
   document.body.append(wrap);
   const focus = new SheetFocus(wrap, () => [...wrap.querySelectorAll<HTMLElement>('button')]);
 
+  /** The pin of step 2 (R1-1): a marker of ours, taking no taps, made at its first use. */
+  let pin: L.Marker | undefined;
+
   const flow = new ReportFlow({
     ...deps,
     say,
@@ -292,11 +486,24 @@ export function reportUi(deps: ReportUiDeps) {
       box.addEventListener('click', (event) => {
         const target = event.target instanceof Element ? event.target.closest('button') : null;
         if (!(target instanceof HTMLButtonElement)) return;
+        const near = target.dataset.reportNear;
         if (target.dataset.reportBack !== undefined) flow.back();
         else if (target.dataset.cancel !== undefined) flow.cancel();
+        else if (target.dataset.reportPin !== undefined) flow.pinPicked();
+        else if (near !== undefined) flow.nearPicked(near);
       });
       deps.tools.replaceChildren(box);
     },
+    showLive: (live) => {
+      // The part that stays in the page, its content drawn anew; the focus on a control in it is
+      // given back to the same control drawn anew (R2-2).
+      const place = deps.tools.querySelector<HTMLElement>('[data-pick-live]');
+      if (!place) return;
+      const active = document.activeElement;
+      const had = active instanceof HTMLElement && place.contains(active) ? active : undefined;
+      place.replaceChildren(...renderNode(live, document).childNodes);
+      if (had) sameControl(place, had)?.focus();
+    },
     focusBox: () => {
       deps.tools.querySelector<HTMLElement>('[data-pick-heading]')?.focus();
     },
@@ -307,12 +514,38 @@ export function reportUi(deps: ReportUiDeps) {
     focusReport: () => {
       reportButton().focus();
     },
+    mark: (pick) => {
+      const container = map.getContainer();
+      container.classList.toggle('report-picking', pick !== undefined);
+      for (const each of ['gyms', 'spots', 'stops', 'point'] as const) {
+        container.classList.toggle(`pick-${each}`, pick === each);
+      }
+    },
     openMenu: () => {
       openMenu(reportButton());
     },
     later: (run) => {
       window.setTimeout(run, 0);
     },
+    flyTo: (place, landed) => {
+      map.once('moveend', landed);
+      map.flyTo([place.lat, place.lon], Math.max(map.getZoom(), PLACES_FROM));
+    },
+    showPin: (point) => {
+      if (point === undefined) {
+        pin?.remove();
+        return;
+      }
+      pin ??= L.marker([0, 0], {
+        icon: L.divIcon({ className: 'report-pin', iconSize: [22, 22] }),
+        interactive: false,
+        keyboard: false,
+      });
+      pin.setLatLng([point.lat, point.lon]).addTo(map);
+    },
+  });
+  deps.onSpots((answer) => {
+    flow.spotsCame(answer);
   });
 
   /** Step 1: the menu, from the button pressed. */
@@ -401,8 +634,16 @@ export function reportUi(deps: ReportUiDeps) {
     picks: (pick: ReportPick) => flow.picks(pick),
     inTools: () => flow.inTools(),
     gymClicked: (gym: MapGym) => flow.gymClicked(gym),
-    spotClicked: (spot: { lat: number; lon: number }) => flow.spotClicked(spot),
+    spotClicked: (
+      spot: { id?: string; title?: string; lat: number; lon: number },
+      battle = false,
+    ) => flow.spotClicked(spot, battle),
     mapClicked: (point: LatLon) => flow.mapClicked(point),
+    /** The Report button's step 2 of a max battle (← Pick a Power Spot of the max form, R1-4). */
+    pickSpots: () => {
+      const max = REPORT_KINDS.find((kind) => kind.id === 'max');
+      if (max) flow.choose(max);
+    },
   };
 }
 
diff --git a/src/web/client/spawn-ui.ts b/src/web/client/spawn-ui.ts
index ca93c0c9926fa71971dfaa882e3b715e7c5b6a45..4a335615c619e58cd9719793be285d8e0cf87eb6 100644
--- a/src/web/client/spawn-ui.ts
+++ b/src/web/client/spawn-ui.ts
@@ -83,6 +83,8 @@ export function spawnUi(deps: SpawnUiDeps) {
     lying: readonly PointRegion[],
     claim: FormClaim,
     finish: () => void,
+    /** The Report button's step 3 (plan 8M-9A, R1-3): the Pokémon's field takes the focus. */
+    focusFirst = false,
   ): Promise<void> => {
     let options: WildOptionsView;
     try {
@@ -147,6 +149,7 @@ export function spawnUi(deps: SpawnUiDeps) {
       });
     };
     draw({});
+    if (focusFirst) box.querySelector<HTMLInputElement>('input[name="pokemon"]')?.focus();
   };
 
   /**
@@ -183,7 +186,7 @@ export function spawnUi(deps: SpawnUiDeps) {
      * A long press or a right click on the map: the form in a popup at that point; a point in no
      * region of the map's outlines is said to be in none, and nothing opens.
      */
-    spawnAt(point: LatLon): void {
+    spawnAt(point: LatLon, focusFirst = false): void {
       if (hold.editing) {
         say(FORM_OPEN);
         return;
@@ -204,10 +207,17 @@ export function spawnUi(deps: SpawnUiDeps) {
         popup.close();
         return;
       }
-      void openForm(box, point, where.regions, claim, () => {
-        hold.release(claim);
-        popup.close();
-      });
+      void openForm(
+        box,
+        point,
+        where.regions,
+        claim,
+        () => {
+          hold.release(claim);
+          popup.close();
+        },
+        focusFirst,
+      );
     },
   };
 }
diff --git a/src/web/client/train-ui.ts b/src/web/client/train-ui.ts
index 73fa28b5a83f48051589f39a3461ac21f7d74896..140180f7a9dbded8dc16a523901fd3a35e7efcda 100644
--- a/src/web/client/train-ui.ts
+++ b/src/web/client/train-ui.ts
@@ -426,7 +426,7 @@ export function trainUi(deps: TrainUiDeps) {
   };
 
   /** The start form in the side panel, in place of "New train". */
-  const openStart = (): void => {
+  const openStart = (prefilled?: number, focusFirst = false): void => {
     const claim = hold.take(false, true);
     if (!claim) {
       say(FORM_OPEN);
@@ -435,7 +435,11 @@ export function trainUi(deps: TrainUiDeps) {
     starting = claim;
     const regions = deps.regions.map((region) => ({ id: region.id, name: region.name }));
     const form = renderNode(
-      startForm(regions, {}, deps.zone ? { zone: deps.zone(), reader: readerZone() } : undefined),
+      startForm(
+        regions,
+        prefilled === undefined ? {} : { region: String(prefilled) },
+        deps.zone ? { zone: deps.zone(), reader: readerZone() } : undefined,
+      ),
       document,
     );
     const close = () => {
@@ -472,6 +476,8 @@ export function trainUi(deps: TrainUiDeps) {
       });
     });
     deps.tools.replaceChildren(form);
+    // From the Report button (plan 8M-9A, R1-3): its first field takes the focus.
+    if (focusFirst) form.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
   };
 
   /**
@@ -489,9 +495,12 @@ export function trainUi(deps: TrainUiDeps) {
   };
 
   return {
-    /** A click on "New train" (`newTrainButton`): the start form in its place. */
-    newTrainClicked(): void {
-      openStart();
+    /**
+     * A click on "New train" (`newTrainButton`): the start form in its place; from the Report
+     * button (plan 8M-9A, A5) with its region prefilled where one region alone holds the place.
+     */
+    newTrainClicked(region?: number, focusFirst = false): void {
+      openStart(region, focusFirst);
     },
 
     /**
````

### Task 5: 8M-9A task 5: docs and the staging checklist

Prototype commit: `7ce418a0c344bb5bf91def186c4c064c8256352e`

web.md: the Gyms layer off since the Report button, max battles under the
raids' layer and in the list's "Raids and max battles", "Max battles on
the map" with the page's part (the marker, the popup and card, a Power
Spot's popup, the form, the ending-soon question, the lists asked again),
and a section of its own for the Report button (its places, step 1, the
icons, step 2 and the hand-off to step 3). MapMax's comment says what the
map does with a battle. The staging checklist
2026-10-27-phase-8m9a-staging.md (step 0: npm run web:build, then the
bot).

**Files:**

```
 docs/architecture/web.md                                | 23 +++++++++++++++++------
 docs/superpowers/plans/2026-10-27-phase-8m9a-staging.md | 53 +++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/web/party-data.ts                            |  4 +++-
 3 files changed, 73 insertions(+), 7 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 7ce418a0c344bb5bf91def186c4c064c8256352e -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m9a-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-9A task 5: docs and the staging checklist`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index ee3e088e8a79b3ba4be1ed779d9c691f66b3c481..5b30bd1503eeac5f35623a410fd2026a2953c1d6 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -1,6 +1,6 @@
 # The web server and the map
 
-The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, starting, arranging and moving trains on the map, making and changing meetups on the map, max battles on the map (the server side, plan 8X-5), reports at stops on the map (the server side, plan 8R-3), the region editor, the Content Security Policy, and the rules for adding a route. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
+The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, starting, arranging and moving trains on the map, making and changing meetups on the map, max battles on the map (the server side, plan 8X-5; the page, plan 8M-9A), the Report button (plan 8M-9A), reports at stops on the map (the server side, plan 8R-3), the region editor, the Content Security Policy, and the rules for adding a route. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
 
 ## Settings, secrets, start and stop
 
@@ -47,11 +47,11 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **The start view** (`startView`, the first rule that applies): (1) your location, at street level (`STREET_ZOOM`, 15), when the browser granted it already (`alreadyGranted`, `your-location.ts`: `navigator.permissions.query({ name: 'geolocation' })` is `granted`; the page never asks on load), applied when its first fix comes unless the member moved the map meanwhile (`MemberMoves`: any `movestart` or `zoomstart` after the start view is set, a tap on a line of the list that flies the map among them); (2) the region `/maps` named (`?region=<id>`, `regionOf`), at street level at the middle of its box; it wins over (3) where the member last left the map of this server, at its own zoom (`readLastView` / `writeLastView`: `localStorage` `pine-map-view:<guild>`, written at each `moveend`, read and written in try/catch, `browserStorage`); (4) the whole server (`fitBounds` of its regions, else of its gyms, else "This server has no regions yet."). A location or last view beyond the regions and their margin is passed over. `?region=` is taken out of the address once read (as `?login=`), so that a reload opens where the member left the map.
 - **`/maps` names its region:** used in a region's channel or its forum (`regionChannelOf`), `/maps` puts the region's id in the map's address it shows (`/s/<guild>/map?region=<id>`) and in its login link (`LoginLinks.issue(…, 'map', region)`, `LinkHolder.region`); the link's POST redirects to `/s/<guild>/map?region=<id>` (an id of ours, never of the request); an expired link lands on the whole map (`?login=expired`).
 - **Your location** (`you-ui.ts`, `showWhereYouAre`; words in `your-location.ts`): "Show where I am", a round button with a crosshair (SVG of ours, `currentColor`) at the bottom right, asks the browser only when pressed (`watchPosition`, high accuracy), draws a blue dot (`--you`, edged `--you-edge`, drawn colors of `theme.ts`) with a circle of its accuracy, centers the map on it at street level or closer, and keeps it current while the page is open; pressed again it centers on the dot. Refused or unavailable: one line under the header (`locationRefusal`: "Your browser did not share your location.", "Your location is not available just now.", or "This browser cannot share your location with this page." where there is no geolocation or the page is not a secure context; browsers count `http://localhost` as one), nothing else. `onMove` tells the list each new fix.
-- **Layers** (`layer-registry.ts`, `LayerRegistry`): everything drawn is a layer the member toggles, registered with a name, whether it is on by default, live (a toggle of its own on the desktop) or background (under "More"), a line about it, members only (`membersOnly`) or waiting for data (`waits`), and how many of its things are in view (`setCount`, which the parts that draw it keep current at each `moveend` and draw). One call adds a layer (`register`; field research and Team GO Rocket come so with 8M-9). The layers of `MAP_LAYERS`: Raids, Trains, Meetups (live, on), Wild spawns (off; it waits for data: no route lists spawns yet, so it is not offered until something calls `setOffered('spawns', true)`), Gyms (on until plan 8M-9's Report button exists: "Report raid" is in a gym's popup and reporting is a member's first job; 8M-9 turns it off, the controller's ruling of fix round 1), PokéStops, Power Spots (off), Region outlines (on). The choice is kept per browser, one for every server (`localStorage` `pine-map-layers`, `{ id: boolean }`, read and written in try/catch; a value that is no boolean is ignored, a layer the browser kept nothing of takes its default). The controls (`layers-ui.ts`): on the desktop a row in the header (`<nav id="layers">` of the template) with the live layers as labelled toggles (`aria-pressed`, a dot of the layer's color) and the background ones as checkboxes under "More" (a `<details>`); narrower than 768 pixels (`map.css`) a "Layers · n" button (`layersButtonLabel`, n the offered layers on) that opens a bottom sheet listing every offered layer with its line, how many are in view ("4 in view", `inViewWords`) and a switch (a checkbox `role="switch"`), Done and a tap on the scrim closing it; the sheet is a modal dialog for the keyboard (`SheetFocus`: `aria-modal`, the focus moved to its first switch, Tab and Shift+Tab kept inside it (from its last control to its first and back, and from outside it in: 8M-7 review fix 9), Escape closes it, the focus given back to the button), each switch named by its layer (`switchLabel`, `aria-label`), and "More" closes on Escape and on a click outside it (`moreCloses`). Logged out (or not a member), PokéStops and Power Spots are not offered (`offered(spec, member)`); the controls are drawn anew once `/api/me` answers (`refresh`).
-- **What each layer draws:** the parties' popups and markers as before (`party-layer.ts`), now in a group per layer (`raids`, `trains`, `meetups`) put on and taken off the map by the registry; the regions' outlines with their labels (`main.ts`; the labels on a pane of their own, `region-labels`, at 350 under the overlay pane of the outlines and of the gyms', stops' and spots' circles and under every marker (round 2), taking no clicks, in 12 px type, so that a name never covers a raid or a gym); the gyms (`gyms-ui.ts`, `showGymDots`) at every zoom, by Pine's grid clustering below zoom 16 (`cluster.ts`, `clustersAt`, `CLUSTER_BELOW`: the places of one 60-pixel cell of a grid fixed on the world are one cluster, drawn as a circle with its count at the middle of its places, `.cluster`, `--cluster`; a tap zooms in on it, at least two zooms and at most to 16; Leaflet.markercluster's last release is from 2020); what is drawn is worked out for the view and half its size round it (`wantedDots`, `DOTS_MARGIN`; keyed `gym:<id>` and `cluster:<cell>:<its gyms>`) and only the difference added or taken off at each move, list or change (`dotsDiff`): the gym whose popup is open is never taken off nor clustered while it is open (fix round 1); which gyms are drawn is `shownGyms` (`gym-dots.ts`): every gym while the Gyms layer is on, or while a gym is to be clicked (route mode, a meetup's place picked: `MapRaids.forced`, the gyms drawn anew after each draw of the parties), and while "Find a gym" holds a word those it matches whatever the layer (Enter fits the map to them and opens the one gym's popup once the map rests); the PokéStops and Power Spots of the view (`places-ui.ts`, `showPlaces`) for a member from zoom 16 (`placesWanted`, `PLACES_FROM`) through `/api/stops` and `/api/powerspots`, asked at once when wanted and again 300 ms after the map rests (`PlacesInView` over `StopLoads`: only the last question's answer shown, nothing after they are no longer wanted), small dots of `--stop` and `--power-spot` with the name in a popup, and "more than shown" in one quiet line at the bottom left of the map ("Zoom in to see every PokéStop here.", `MORE_THAN_SHOWN`, `quietLine`). Live things never cluster.
+- **Layers** (`layer-registry.ts`, `LayerRegistry`): everything drawn is a layer the member toggles, registered with a name, whether it is on by default, live (a toggle of its own on the desktop) or background (under "More"), a line about it, members only (`membersOnly`) or waiting for data (`waits`), and how many of its things are in view (`setCount`, which the parts that draw it keep current at each `moveend` and draw). One call adds a layer (`register`; field research and Team GO Rocket come so with 8M-9B). The layers of `MAP_LAYERS`: Raids (max battles too since plan 8M-9A: the toggle keeps the name "Raids", since "Raids and max battles" broke the desktop's one row at 768 pixels; its line in the phone's sheet says "Bosses, eggs and max battles", and the list's group is "Raids and max battles"), Trains, Meetups (live, on), Wild spawns (off; it waits for data: no route lists spawns yet, so it is not offered until something calls `setOffered('spawns', true)`), Gyms (off since plan 8M-9A: the Report button's step 2 draws the gyms to pick from whatever the layer says; on until then, the controller's ruling of fix round 1 of 8M-7, while "Report raid" was in a gym's popup alone; a browser that kept the layer on keeps it on), PokéStops, Power Spots (off), Region outlines (on). The choice is kept per browser, one for every server (`localStorage` `pine-map-layers`, `{ id: boolean }`, read and written in try/catch; a value that is no boolean is ignored, a layer the browser kept nothing of takes its default). The controls (`layers-ui.ts`): on the desktop a row in the header (`<nav id="layers">` of the template) with the live layers as labelled toggles (`aria-pressed`, a dot of the layer's color) and the background ones as checkboxes under "More" (a `<details>`); narrower than 768 pixels (`map.css`) a "Layers · n" button (`layersButtonLabel`, n the offered layers on) that opens a bottom sheet listing every offered layer with its line, how many are in view ("4 in view", `inViewWords`) and a switch (a checkbox `role="switch"`), Done and a tap on the scrim closing it; the sheet is a modal dialog for the keyboard (`SheetFocus`: `aria-modal`, the focus moved to its first switch, Tab and Shift+Tab kept inside it (from its last control to its first and back, and from outside it in: 8M-7 review fix 9), Escape closes it, the focus given back to the button), each switch named by its layer (`switchLabel`, `aria-label`), and "More" closes on Escape and on a click outside it (`moreCloses`). Logged out (or not a member), PokéStops and Power Spots are not offered (`offered(spec, member)`); the controls are drawn anew once `/api/me` answers (`refresh`).
+- **What each layer draws:** the parties' popups and markers as before (`party-layer.ts`), now in a group per layer (`raids`, `trains`, `meetups`) put on and taken off the map by the registry; the regions' outlines with their labels (`main.ts`; the labels on a pane of their own, `region-labels`, at 350 under the overlay pane of the outlines and of the gyms', stops' and spots' circles and under every marker (round 2), taking no clicks, in 12 px type, so that a name never covers a raid or a gym); the gyms (`gyms-ui.ts`, `showGymDots`) at every zoom, by Pine's grid clustering below zoom 16 (`cluster.ts`, `clustersAt`, `CLUSTER_BELOW`: the places of one 60-pixel cell of a grid fixed on the world are one cluster, drawn as a circle with its count at the middle of its places, `.cluster`, `--cluster`; a tap zooms in on it, at least two zooms and at most to 16; Leaflet.markercluster's last release is from 2020); what is drawn is worked out for the view and half its size round it (`wantedDots`, `DOTS_MARGIN`; keyed `gym:<id>` and `cluster:<cell>:<its gyms>`) and only the difference added or taken off at each move, list or change (`dotsDiff`): the gym whose popup is open is never taken off nor clustered while it is open (fix round 1); which gyms are drawn is `shownGyms` (`gym-dots.ts`): every gym while the Gyms layer is on, or while a gym is to be clicked (route mode, a meetup's place picked, the Report button's step 2 of a raid: `MapRaids.forced`, the gyms drawn anew after each draw of the parties), and while "Find a gym" holds a word those it matches whatever the layer (Enter fits the map to them and opens the one gym's popup once the map rests); the PokéStops and Power Spots of the view (`places-ui.ts`, `showPlaces`) for a member from zoom 16 (`placesWanted`, `PLACES_FROM`) through `/api/stops` and `/api/powerspots`, asked at once when wanted and again 300 ms after the map rests (`PlacesInView` over `StopLoads`: only the last question's answer shown, nothing after they are no longer wanted), small dots of `--stop` and `--power-spot` with the name in a popup (a Power Spot's popup also offers "Report max battle here" since plan 8M-9A, below, "Max battles on the map"; a spot whose battle is drawn is left out, `unoccupied`, drawn again from the last answer as the parties change, `ShownPlaces.redrawn`; while the Report button's step 2 picks them they are drawn whatever the layer, `placesWanted`'s `forced`, `MapRaids.forcedPlaces`), and "more than shown" in one quiet line at the bottom left of the map ("Zoom in to see every PokéStop here.", `MORE_THAN_SHOWN`, `quietLine`). Live things never cluster.
 - **Raid markers** (`raid-marker.ts`, frame B of the mockups): a circle centered on the gym, named for a screen reader by the lead raid's `heading` (the marker's `title`, 8M-7 review fix 9) (`raidMarkerNode`, drawn as an element of ours in a `divIcon`, `raidIcon`, 44 pixels): the post's picture (the boss, or the egg of its tier before it hatches) in a ring of its tier group's color (`MapRaid.tierGroup`, made by the domain's `raidTierGroup` of `src/domain/pogo/raid-tier.ts`: `1`, `3`, `5`, `mega` for Mega, Mega Legendary and Super Mega, `elite`, `shadow` for every shadow raid; `tierColour` names `--tier-<group>`; `raid-marker-tiers.test.ts` holds `theme.css` and `map.css` to every group of `RAID_TIER_GROUPS`), a time badge under it (`badgeFor`: "12m", "1h 05m" while it runs, "hatches 2:40" before the hatch, the posts' time by `clockTime` with AM or PM left out today only, "hatches Wed, Oct 14, 2:00 PM" another day; "egg" or "hatched" where nobody said when, "ended" by `stageAt`), and a green count of those going (`MapAttendance.going`, made by the domain's `goingCount` of `party.ts`: the committed heads of the whole party, coming, here and asked whether done, +1s counted, the lobbies' own rule that `lobbyCount` shares; none at zero). Raids shrink as the map zooms out and are still never grouped (Matt, 2026-10-25; `markerSize`): from zoom 15 the full marker (`--raid-full`, 44 px, with its badge and count), at 14 a smaller circle with the count and no badge (`--raid-middle`, 30 px), at 13 and below a small circle with the boss picture in its ring and no badge or count (`--raid-small`, 20 px); sizes are named values of `theme.css`, read by `theme().sizes` for what Leaflet draws; the tap target is never under 32 pixels (`tapBox`, a clear margin round a small circle), the train's and meetup's rings round a raid scale with its circle (`ringSizes(circle)`), and a zoom into another size draws the parties anew. Nearly over, it is dimmed (`isDimmed`: hatched by the clock, `stageAt` of `src/domain/party/raid-stage.ts`, which `raidStage` reads raids through, and `endsSoon` of `src/domain/time/ending-soon.ts`, the five minutes `/max`'s ending-soon question asks by: one rule). The page keeps badges and dimming current every 15 s from the times on the marker (`data-stage`, `data-hatch`, `data-end`; `markerNow`, by the same rules as at the draw), an egg turning into its time left as it hatches. One source for every fact (Matt, 2026-10-25): what the page shows or decides of a party is computed by the domain code the Discord side uses, sent with the list or imported from a pure module of `src/domain/` that imports nothing (`raid-stage.ts`, `ending-soon.ts`), never a second implementation; only the words are the page's. A gym with a raid shows the raid, not its gym dot, while the Raids layer is on (`hiddenGyms`, `MapRaids.raidGyms`); off, the dot is back. Trains and meetups keep their drawing (rings, a line), restyled; at a gym whose raid circle is drawn, their rings go round it rather than over the boss (`ringSizes`: the train's just outside the 44-pixel circle, radius 26, the meetup's outside the train's, radius 31; the old sizes elsewhere, and again when the Raids layer is off). A gym of several raids is drawn by one lead raid, the first with a picture, else the first (`leadRaid`): picture, ring, badge and count are all that raid's. A raid is named everywhere on the map (its popup, the list, the list of things at one place) in its post's own heading words, `MapRaid.heading` (`raidLook` over the renderer's `headlineParts`: `Level 5 raid against Yveltal`, `Level 5 raid (egg)`, without the shiny mark; the tier's words where the renderer gave none), and its popup reads its stage by the clock (`stageAt`), not the list's `stage`.
 - **Several things at one place** (`shared-place.ts`): when more than one shown thing sits at the same place (the same gym, or within 12 pixels at the current zoom, `sharedPlace`, `SHARED_PIXELS`; a raid marker, a train's ring, a meetup's ring, and a gym's dot tapped where parties share it, `MapRaids.gymTapped`), a tap on any of them opens one popup listing each (`placeListNode`: picture, name, time: the lead raid's `heading` and badge, a train's or meetup's `startWords`), and a choice (`data-open`) opens that thing's own popup as before. A layer turned off takes its things out, and the overlap with them. This replaces the tap on a ring's line of the 8S-4 staging: the rings still take clicks on their line alone, but a tap on what they ring lists them.
-- **The list of what is on** (`what-is-on.ts`, pure; drawn by `list-ui.ts`, `WhatIsOn`; plan 8M-7, replacing the side panel "Meetups and other parties"): on the desktop the side pane on the right (`#parties`, "What is on"), under the trains' box; on a phone the header's "List" button (`#list-button`, `body.list-open`) swaps the map for it and back (its words say what a press shows next, "List" or "Map", with no `aria-pressed` beside them: 8M-7 review fix 9). It holds every live thing the layers on show across the whole server, not only what is in view (`listLines`: raids, trains, meetups; wild spawns once a route lists them), grouped by kind in that order, each group headed with its count (`listGroups`: "Raids · 5"), under "What's on · n". A line (`lineWords`, a button): the picture (a ring of the kind's color without one), the name (`raidName`, a train's or meetup's), the place (a raid's gym, as the map has it or as its post names it; a train's `stopLine`; a meetup's words), the distance (from your location, else the map's middle; none without a place), the time ("30m left", "hatches 2:40 PM", `startWords`), "4 going" (`MapAttendance.going`); dimmed in a raid's last minutes (`isDimmed`). Sort, kept per browser (`localStorage` `pine-map-sort`, try/catch, `readSort` / `writeSort`): Nearest (the default), Soonest (a raid's end, a train's or meetup's start; none last), Most going; ties by name, and what has no point at all last in its group whatever the sort. Tapping a line whose thing the map draws (its layer on) flies the map there (street level or closer) and opens its popup once the map rests (on a phone, back to the map first, `PartyFrame.showMap`); a thing the map does not draw (a train without a route or with none of its stops on the map, a raid at a gym the map does not show, a meetup without a place) shows its popup under its line instead (`detail`: `raidPopup`, `trainPopup` with its actions, `meetupPopup` with Edit…, as the side panel showed them). Hovering a line on the desktop highlights its marker (`highlighted`: a ring round a raid's circle, a thicker line for a ring). A form that opens in the side pane (the start form, route mode, a meetup's form or editor) is shown over the list, which comes back when it closes (`paneShows`). Drawn anew with each list and a change of sort; a move of the map, a change of layers and a new fix of your location (only sorted Nearest, and only once it moved more than 25 m, `fixRedraws`) draw it too, but never while a form holds: then once, when the form lets go (`ListRefresh`, fix round 1). A line shown with its popup under it is kept by its key (`WhatIsOn.kept`): drawn anew for a move, a fix or a change of layers, only its own words change and its popup (a group menu, a field) stays, the focus given back where it was (a control drawn anew is found again by its tag and `data-` attributes, `sameControl`: a line's button by `data-key`, its line's key, the sort by `data-sort`; a control with no `data-` attribute is not looked for, so the focus never jumps to the first line, 8M-7 review fix 2); drawn from a new list (`show`), its popup is drawn anew from it (counts, "You:", buttons), the group chosen in its menu kept while that group is still offered and the focus given to the control of the same kind (round 2); a change form opened in such a line takes the hold with its `alive` (`FormHold.take(…, alive)`), so that the hold lets go whenever the form goes away (`checkGone`, after each drawing of the list and with each new list). Whether a form of the pane's box holds is recomputed as a form takes the hold or lets it go (`FormHoldDeps.changed`, `asideHeld`); on a phone such a form, which needs the map (route mode, a meetup's place picked, any form of the box), shows the map with the pane docked under it, 40% of the screen, whatever "List" says (`body.form-docked`). The phone's header is one row: the title, Layers, List, a "Find" button that opens "Find a gym" over the map (`#search-button`, `body.search-open`; Escape closes it, and closing it empties it, so that no word filters the map unseen) and the account (the member's name, cut to fit, its menu holding Log out; logged out, the login says "Log in" with the buttons' smaller padding, its two wordings spans of which `map.css` shows one, while the pane's own button keeps "Log in with Discord": 8M-7 review fix 4, `src/web/phone-header.test.ts`), none of them wrapping; what the header says beside the account goes under it. Tried at staging on a phone: List swaps the map for the list and back, a tap on a line returns to the map at the thing, a form of the pane docks under the map. Logged out, the pane says "Log in to see what is on." with "Log in with Discord" (or how to log in with `/maps`); logged in without counting as a member, "Only members of this server see what is on." (`loggedOutPane`).
+- **The list of what is on** (`what-is-on.ts`, pure; drawn by `list-ui.ts`, `WhatIsOn`; plan 8M-7, replacing the side panel "Meetups and other parties"): on the desktop the side pane on the right (`#parties`, "What is on"), under the trains' box; on a phone the header's "List" button (`#list-button`, `body.list-open`) swaps the map for it and back (its words say what a press shows next, "List" or "Map", with no `aria-pressed` beside them: 8M-7 review fix 9). It holds every live thing the layers on show across the whole server, not only what is in view (`listLines`: raids and, since plan 8M-9A, max battles in one group, "Raids and max battles", a battle named by its post's `title`, Soonest by its end, its key `max:<id>`; trains, meetups; wild spawns once a route lists them), grouped by kind in that order, each group headed with its count (`listGroups`: "Raids and max battles · 5"), under "What's on · n". A line (`lineWords`, a button): the picture (a ring of the kind's color without one), the name (`raidName`, a train's or meetup's), the place (a raid's gym, as the map has it or as its post names it; a train's `stopLine`; a meetup's words), the distance (from your location, else the map's middle; none without a place), the time ("30m left", "hatches 2:40 PM", `startWords`), "4 going" (`MapAttendance.going`); dimmed in a raid's last minutes (`isDimmed`). Sort, kept per browser (`localStorage` `pine-map-sort`, try/catch, `readSort` / `writeSort`): Nearest (the default), Soonest (a raid's end, a train's or meetup's start; none last), Most going; ties by name, and what has no point at all last in its group whatever the sort. Tapping a line whose thing the map draws (its layer on) flies the map there (street level or closer) and opens its popup once the map rests (on a phone, back to the map first, `PartyFrame.showMap`); a thing the map does not draw (a train without a route or with none of its stops on the map, a raid at a gym the map does not show, a meetup without a place) shows its popup under its line instead (`detail`: `raidPopup`, `trainPopup` with its actions, `meetupPopup` with Edit…, as the side panel showed them). Hovering a line on the desktop highlights its marker (`highlighted`: a ring round a raid's circle, a thicker line for a ring). A form that opens in the side pane (the start form, route mode, a meetup's form or editor) is shown over the list, which comes back when it closes (`paneShows`). Drawn anew with each list and a change of sort; a move of the map, a change of layers and a new fix of your location (only sorted Nearest, and only once it moved more than 25 m, `fixRedraws`) draw it too, but never while a form holds: then once, when the form lets go (`ListRefresh`, fix round 1). A line shown with its popup under it is kept by its key (`WhatIsOn.kept`): drawn anew for a move, a fix or a change of layers, only its own words change and its popup (a group menu, a field) stays, the focus given back where it was (a control drawn anew is found again by its tag and `data-` attributes, `sameControl`: a line's button by `data-key`, its line's key, the sort by `data-sort`; a control with no `data-` attribute is not looked for, so the focus never jumps to the first line, 8M-7 review fix 2); drawn from a new list (`show`), its popup is drawn anew from it (counts, "You:", buttons), the group chosen in its menu kept while that group is still offered and the focus given to the control of the same kind (round 2); a change form opened in such a line takes the hold with its `alive` (`FormHold.take(…, alive)`), so that the hold lets go whenever the form goes away (`checkGone`, after each drawing of the list and with each new list). Whether a form of the pane's box holds is recomputed as a form takes the hold or lets it go (`FormHoldDeps.changed`, `asideHeld`); on a phone such a form, which needs the map (route mode, a meetup's place picked, any form of the box), shows the map with the pane docked under it, 40% of the screen, whatever "List" says (`body.form-docked`). The phone's header is one row: the title, Layers, List, a "Find" button that opens "Find a gym" over the map (`#search-button`, `body.search-open`; Escape closes it, and closing it empties it, so that no word filters the map unseen) and the account (the member's name, cut to fit, its menu holding Log out; logged out, the login says "Log in" with the buttons' smaller padding, its two wordings spans of which `map.css` shows one, while the pane's own button keeps "Log in with Discord": 8M-7 review fix 4, `src/web/phone-header.test.ts`), none of them wrapping; what the header says beside the account goes under it. Tried at staging on a phone: List swaps the map for the list and back, a tap on a line returns to the map at the thing, a form of the pane docks under the map. Logged out, the pane says "Log in to see what is on." with "Log in with Discord" (or how to log in with `/maps`); logged in without counting as a member, "Only members of this server see what is on." (`loggedOutPane`).
 - **Distances** (`distance.ts`): `metersBetween`, which is `metresBetween` of `@pine/wayspot-core/distance` itself (the function the place search and Wayfarer matching measure with: one source for every fact, Matt 2026-10-25), and `distanceWords` (`src/render/distance-words.ts`, import-free), the one wording of a distance on the map and on Discord (Matt, 2026-10-25; task 7), in the units of `settings.distanceUnits` (per instance, as `timezone`): a short distance never rounded to nothing (the controller's ruling): `imperial` (the default) under 100 ft to the foot (`2 ft`), under a tenth of a mile to ten feet (`520 ft`), else miles to one decimal (`1.3 mi`); `metric` under 100 m to the meter (`2 m`, so that staff's lists of gyms within ten meters keep exact meters), under a kilometer to ten (`440 m`; what would round to 1000 m is `1.0 km`), else kilometers to one decimal. The pages read the units from `data-distance-units` of the map page and of the region editor's (`MapPageData.distanceUnits`, `WebDeps.distanceUnits`; the editor's "more than 490 ft apart" of a sliver too wide to fix is `FIX_REACH_METRES` by `distanceWords`, 8M-7 review fix 8); Discord's words take them from `ctx.config.settings`, through `distanceWords` itself, the one name (round 2): `/gym` move, add, review and import, `/pokestop`, the gym view's nearest gym, `/research`'s "Same task at more stops…" and its pin without a stop, and every threshold they name (`DUPLICATE_METRES`, `PINE_STOP_NEAR_METRES`, `PIN_NEAR_METRES`, `FAR_MOVE_METRES`, `CANDIDATE_METRES`, `DEFAULT_SCAN_MARGIN`), helps included (their `details` functions of the settings). `src/text-distances.test.ts` refuses a unit of distance worded by hand in the string literals of `src/commands`, `src/render`, `src/components` and the web pages' `src/web/client` (review fix 8), as `text-spelling.test.ts` refuses British spelling.
 
 ## The parties on the map (plan 8M-3)
@@ -96,7 +96,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("A party's
 
 ## The post's controls as forms (plan 8M-8B)
 
-Brief `.superpowers/sdd/2026-10-26-phase-8m8b-post-controls/design.md` (its "After the builder check" rulings X1 to X10). Every control of a post that opens a dialog on Discord, and the two the post has no button for, is a form of the map over the dialog's code path, with the checks of every write ("Adding a route"). Max battles are served by every route (Meet…, Done, the answer, Delete…, Report…); their drawing on the page is plan 8M-9's (X3).
+Brief `.superpowers/sdd/2026-10-26-phase-8m8b-post-controls/design.md` (its "After the builder check" rulings X1 to X10). Every control of a post that opens a dialog on Discord, and the two the post has no button for, is a form of the map over the dialog's code path, with the checks of every write ("Adding a route"). Max battles are served by every route (Meet…, Done, the answer, Delete…, Report…); the page draws them since plan 8M-9A (X3; below, "Max battles on the map").
 
 - **The routes** (`postControlRoutes`, `src/web/post-control-routes.ts`): the checks in their order: the per-address limit (one limiter per family) and `postGuard` before a POST's body is read; the session and the body (zod, strict); who writes (`actingOnTheMap`); the party as the store has it (`partyFor`: an active party of this server, else 409 "This has ended."); its forum (`barred` 403, unreachable 503); only then the window its dialog counts in. A form that asks the server before it opens (`GET`, `reader`: `memberOrFailure`, then `partyFor`) counts nothing. Logged as a press: "a party was pressed on the map" with `action` `regroup`, `meet`, `close` or `report`, never a text. Answers are `PressAnswer` (`{ ok, text }`, 200 / 422 / 409), a refusal before the work `{ error }`.
 - **Group…** (`POST …/regroup`, `{ group, stamp, signedUp }`): the list carries its choices (`MapAttendance.regroup`, `regroupOnTheMap` of `src/render/group-dialogs.ts` over `groupMenu`, the press's refusals and ways moved out of the Discord handler, and `groupMenuText`, the dialog's title, text and label over the map's ways): the groups to move to or join by letter and stamp, label, size (`groupSize`) and a battle's meeting time as a moment; a new group is not among them ("Start a new group on Discord →" where Discord would offer it, `newGroup`); `{ onlyNewGroup }` where a new group is the only way (review W-1: nothing to submit, Group… shows the post's link; the link's words are `discordLink`'s, carried on every button that sends to Discord as `data-link`, which the page reads, review N-4); or the refusal (`{ refused }`, said under the post's buttons). A refusal of the move closes the form and the list is asked for again (review W-2: its choices came with the list and may be stale; `formStep`). The move: one use in the window of the post's controls, `joinStamped` with `signedUp` (a member who left meanwhile: "You are no longer signed up: press Group… again."), `movedWords` (shared with the dialog's Submit: "Group B has changed since: press Group… again."). The group's line is `groupLine` of the import-free `src/render/group-words.ts`, the dialog's in the server's zone, the page's in the reader's.
@@ -156,7 +156,8 @@ Brief `.superpowers/sdd/2026-10-27-phase-8m8c-train-controls/design.md` (its "Af
 
 ## Max battles on the map (plan 8X-5)
 
-- **Scope** (Matt, 2026-10-22: the page may change after the map's staging, from a CSS polish with layers to choose to more; the technology matters little): the server side alone, what a new page would use unchanged: the data, the routes, the code paths they share with `/max`. The page (`src/web/client/`) has no max battle feature yet: no Power Spot layer, no max battle markers or popups, no report form, no kind menu, no Remote button, no Add to route from a spot; they are left for the UX pass (follow-ups, "From Phase 8X-5"). The page as it is reads `raids`, `trains` and `meetups` and ignores the rest.
+- **Scope** (Matt, 2026-10-22: the page may change after the map's staging, from a CSS polish with layers to choose to more; the technology matters little): plan 8X-5 built the server side alone, what a new page would use unchanged: the data, the routes, the code paths they share with `/max`. The page's part came with the map's polish: the Power Spots layer and Add to route from a spot (plan 8M-7, 8M-8C), Remote and the kind menu (8M-8A to 8M-8C), and the battles drawn, Power Spots' popups and the report form (plan 8M-9A, below, "The page"); no server data or route was added for it.
+- **The page** (plan 8M-9A; brief `.superpowers/sdd/2026-10-27-phase-8m9a-report-and-max/design.md`, its rulings A1 to A11): a battle is drawn at its Power Spot or pin as a raid is, by the raids' own marker (`raidMarkerNode` over `markerFacts`, `src/web/client/raid-marker.ts`: the boss in a ring of `--tier-dynamax` or `--tier-gigantamax` by its `level`, `maxRing`, light and dark; `raid-marker-tiers.test.ts` holds `theme.css` and `map.css` to both; the time badge, the green count, dimmed in its last five minutes: a battle reads as a hatched raid without a hatch time, `stage: 'hatched'`, `hatchTime: null`, so `badgeFor`, `isDimmed` and `markerNow` read it by its end alone), under the raids' layer, keyed `max:<id>` wherever it is (`showsParty`, `partiesAtKey` of `parties.ts`, the list's `marker`); its popup and phone card are its post (`postPopup`, as a raid's: Remote, Done, +1/−1, Group…, Meet…, Delete…, Report… as the post and the list offer them), the map's own summary (`maxPopup`) until the post comes; in the list with the raids (above, "The map's frame"). One card per thing at a place (A6): a Power Spot whose battle is drawn has no dot of its own (`MapRaids.battleSpots`, `PlacesHooks.occupied`), and the battle's marker is that spot in route mode (a tap adds the spot as a stop); a train's ring at such a spot goes round the battle's circle. **A Power Spot's popup** (`places-ui.ts`, `PlacesHooks.spotControls`): its name and, for a member while the map is not read-only (`reportOffered`), "Report max battle here" (`maxBox`, `data-report-max`, off while another form holds, `formControls`). **The form** (`src/web/client/max-forms.ts`, pure; the DOM side `max-ui.ts`, `maxUi`): in the place of that button in the spot's popup, or for a point picked in the Report button's step 2 in a popup of its own there named "Unlisted power spot" (`maxAt`), held as the other forms (`FormHold`); its lists from `GET /api/max-options`: the bosses grouped by tier in the list's order (the featured first, as the list has them, and marked "(featured)"), then "Another boss (type its name)", whose rows, the name and its tier (`tiers`), show only for it (`data-typed`); the end, optional, as `end:` takes it, no default shown (the server's is `/max`'s); the region where the place lies in several of the map's outlines (`regionsAt`), and whenever an answer names regions. The body (`maxBody`): `{ spot }` or `{ lat, lon }`, the boss's value or the name typed with its tier where one is picked, the end, the region. **The ending-soon question** (A9): a 422 with `soon` draws it into the form in the server's words (its text as the choice's legend, each choice's label as sent, in the server's zone, with `zoneHintNodes`' hint), the first choice picked, in the place of the typed end; the report sent again carries the choice checked, `soon: { value, end }`, always (review R1-5: no browser clock in `maxBody`; an end passed meanwhile is the server's to refuse, in the dialog's Submit's words, "That battle has ended meanwhile: nothing was reported.", after which the form asks for its lists again). **After an answer** (`maxFormAfter`): made (200), joined or another boss's battle there (409 with `max`) close the form and open the battle (`done`, `showing.openNext('max:<id>')`); `soon` and `regions` draw the form again, keeping what was filled in; any other refusal asks for the lists again (A3: `/api/max-options` anew, no timed refresh; the boss picked kept while the new lists still offer it, `keptPick`; a boss typed always; the Submit is `submitMax`, the part of the form with no page in it, review R1-2), its `needs` acted on (R1-4: `tier` and `boss` focus their field (the name typed where the menu says "Another boss", R2-3, `fieldToFocus`); `listed-spot`, a pin refused to a member blocked from pins, turns Report off and offers "← Pick a Power Spot", which opens the Report button's step 2 of a max battle, `pickSpot`) and says the server's words, or its `error` where it has none (a 403 barred; `pressParty`). Re-checking at Submit is the server's (`readMaxBoss`, `reportedEnd`, the ending-soon question decided anew: "That boss is no longer on the list: pick it again."); the page words no rule of its own.
 - **One code path with `/max`** (spec 3.5; `src/commands/max/max-report.ts`): `reportMaxAs` (the report as the member: privacy and automatic status from their settings, `PartyService.reportMax`, a new pin battle logged for staff and told to the moderators, `ModerationReports.maxAtPin`), `maxReportWords` and `takenWords` with the caller's `MaxNames` (`ReportNames` plus `ended`, `bossHint`, `pinBlocked`; on the map no post, a region as `#name`), `maxBarred` over `MaxAccess` (the forum a new battle would go to and that of the battle at the spot), `blockedAtPin` (staff passed in: `isMapStaff` on the map; `reportMaxAs` takes `{ mayJoin, staff }` and asks it again through `MaxReport.mayCreateAtPin`, so that a battle at a pin that ends before the report is written leaves no new one by a blocked member, `pin-blocked`); `spotAt` (`max-input.ts`) names a spot without an interaction, and `readSpot` names its pins through it; `endingSoonQuestion` (`src/render/max-dialog.ts`) words the ending-soon question for the dialog and the map, each choice with the end it reports. The web server is given what `/max` reads and calls (`MaxWebDeps.ctx`, `MaxWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
 - **The view:** `PartiesView.maxes`, a list of its own in the order the battles were made: `MapMax` (`party-data.ts`), with `MapRaid`'s names where they mean the same, so that one page component can draw both: `id`, `spotId` (the Wayfarer id as `/api/powerspots` lists it, null for a pin), `picture` (the boss's as the post shows it, only from `pictureOrigins`), `level` (`D1` to `G`), `tier` (`Dynamax 2★`), `boss`, `title` (`Dynamax Machamp (2★)`), `endTime`, `link`, `place` (the spot as Where names it: as it is now while it is the same place, `spotNow`; a pin `Unlisted power spot`, address null; six decimals), `attendance` (Done always offered). None once its end has come (`maxEnded`); nothing of it is changed on the map. How the post shows it comes from the renderer (`maxLook`, `src/render/max-post.ts`, over `PartyService.maxView`), given to the pure view as `PartyViewInput.maxLook` (`PartyWebDeps.maxLook`), as `look` is for raids; every route that draws a party passes it.
 - **The Power Spots of a box** `GET /s/<guild>/api/powerspots?south&west&north&east`: as `/api/stops` (both through `wayspotsInBox`, `src/web/wayspot-box.ts`): members (401, 403, 503), the same box (400 otherwise), the titled Power Spots in a region of the server, the nearest to the box's middle first, at most `MAX_MAP_SPOTS` (300), `more`; `PowerSpotsView` (`src/domain/web/max-data.ts`), `[id, lat, lon, title]`; `private, no-store`; 60 a minute per address.
@@ -164,6 +165,16 @@ Brief `.superpowers/sdd/2026-10-27-phase-8m8c-train-controls/design.md` (its "Af
 - **A report** `POST /s/<guild>/api/maxes`, body `{ spot }` (a Power Spot's Wayfarer id) or `{ lat, lon }` (a point), `region?`, `boss` (a value of the list or typed, up to 100), `tier?` (`D1` to `G`, as `/max`'s `tier:`), `end?` (as `end:` takes it, up to 40), `soon?: { value: 'next' | 'soon', end }` (strict; both a spot and a point, neither, or `soon` with a typed end: 400). Before the body is read: 30 a minute per address (`MAX_WRITES_PER_ADDRESS_MINUTE`) and `postGuard`. Then, in this order, none counted: the session (403) and the body (400); who reports (`actingOnTheMap`); the spot (`spotAt`: a Power Spot by its id, refused `PLACE_GONE` once Pine keeps it no more or it lies in no region of the server; a point, kept to six decimals, in a region of the server, else `PIN_NOT_HERE`, which is the nearest Power Spot within 50 metres, else an unlisted power spot: the map's point is what a pin is, Q7, as `/max` takes a maps link); the regions of the server at its point (`regionsAtPoint`): several without one of them picked 422 `{ ok: false, text: "This place lies in several regions: pick the one to report the max battle in.", regions }` (names as the raids' list names them); `/max`'s readers (`readMaxBoss`, `reportedEnd`: 422 in their words, the last battle time; where `/max` names its option `tier:`, `WHICH_TIER`, the map says "Which tier? Pick the tier of this boss." with `needs: 'tier'`; where it names the list that appears while one types, `UnknownMaxBoss`, the map says "I know no Pokémon called "…". Pick a boss from the list." with `needs: 'boss'`, `mapUnknownBoss`); a `soon` whose end has passed 422 "That battle has ended meanwhile: nothing was reported." (the dialog's Submit's words); another boss at the spot 409 in `takenWords` (the battle there as `max` where the member may see it, its forum always asked of Discord: this comes before `maxBarred`; no post named, the hint of `/boss` in the map's words); a new battle at a pin by a member blocked from meetups 403 in the map's words, "… Pick a Power Spot on the map." (`MAP_PIN_BLOCKED`; `/max`'s `MAX_PIN_BLOCKED` names its list), with `needs: 'listed-spot'` (joining the battle there is allowed, as from `/max`); the forums (`maxBarred`: 403 `{ error: MAX_BARRED }`, Discord unreachable 503); **the ending-soon question** where `/max` opens its dialog (a new battle, no typed end, its end within five minutes), unless `/max`'s window is full (429 as the throttle below answers, nothing counted: `throttledOnTheMap` with `count: false`, as Discord refuses `/max` before its dialog opens): 422 `{ ok: false, text, soon: { choices: [{ value, label, end }] } }` in the dialog's words (until the next rotation first, then until the end about to pass; only the latter, with "Report it anyway?", where no later rotation is left); the report sent again with `soon` takes that end while it is a choice the server offers now (decided anew, no state kept between the two requests), else is asked again with the new choices; a page drops `soon` once that end has passed (a report sent with it is refused as the dialog's Submit refuses it, even where a report without it would pass). Only then `/max`'s throttle in its window (`MAX_COMMAND`, `MAX_THROTTLE`: `/max` counts one use for its dialog and Submit, the map one for the report sent again); then `reportMaxAs` as the member fetched fresh, a battle that came meanwhile in another forum asked about (`mayJoinNoting`: Discord away 503); `no-post` and `ended` give the use back (`givenBackOnTheMap`), and so does `pin-blocked` (the battle at a pin a blocked member would join ended before the report was written: 403 `MAP_PIN_BLOCKED` with `needs: 'listed-spot'`, as the check above). `needs` (`MaxNeed`, `max-data.ts`) is the machine part of a refusal a page acts on: `tier`, `listed-spot`, `boss`; the words are only to be shown. `/max`'s words that name `/max` or its options are said on the map in its own (the namer, `MaxNames`: `ended`, "The max battle there has just ended: report it again.", `MAP_MAX_ENDED`; `bossHint` after another boss's battle, "Open its post and use /boss there to change its boss.", `MAP_BOSS_HINT`; `pinBlocked`, `MAP_PIN_BLOCKED`; and in the route a spot no region's outline holds any more, "… Pick a Power Spot on the map.", `MAP_NOT_HERE`, where `/max` says `NOT_HERE`); `/max`'s stay as they are. The answer (`MaxAnswer`): 200 `created`, 409 `exists` (joined: "You have been marked as interested.") and `taken`, 422 `ended`, `no-region` and `no-forum`, 403 `barred` and `pin-blocked`, 503 `no-post` (none of the member's doing, the use given back); `{ ok, text, max? }` with the battle as the map shows it where the member is not kept out of its forum, and " It was posted in #west." after the words when the region picked has no forum and the battle went to another region of the spot (`regionForSpot`). Logged at info once who reports is known, a refusal too: `{ user, guild, spot | pin, outcome }` (the spot's Wayfarer id, or `pin: true`, once known; the outcome's kind, or `no-spot`, `refused`, `several-regions`, `taken`, `blocked`, `barred`, `unreachable`, `ends-soon`, `throttled`), "a max battle was reported on the map", never a text or the point; a new pin battle is also logged by `reportMaxAs` for staff, with its point, as from `/max`.
 - **Remote** on the map is the parties' press `remote` (above, "The parties on the map"), for every kind whose post has Remote; **the train's kind** is in "Trains on the map".
 
+## The Report button (plan 8M-9A)
+
+Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("Reporting"); brief `.superpowers/sdd/2026-10-27-phase-8m9a-report-and-max/design.md` (rulings A1 to A11). Every report goes through the route its command shares (`/raid`'s, `/max`'s, `/wild`'s, `/train`'s, `/meetup`'s, above); the button only leads to their forms. No route was added: the places to pick come from `/api/geo` and `/api/powerspots`.
+
+- **The button** (`report-ui.ts`, `reportUi`; A7): for a member while the map is not read-only (`reportOffered`, at each list; logged out it is never shown): on a wide screen in the header before "Find a gym" (`#report-button` of the template, hidden until the script shows it); narrower than 768 pixels a round button over the map at the bottom right, a Leaflet control above "Show where I am" (`.report-control`; under the phone card while the card is open, and opening Report closes the card), so that the header stays one row (`phone-header.test.ts`), and a line of its own at the top of the phone's list (`.report-line`, shown only while the list is), which shows the map first. Up to 1024 pixels the desktop's title says "Pine" and "Find a gym" starts narrower, so that the header's row holds the button (`map.css`).
+- **Step 1, what** (`report-menu.ts`, pure: `REPORT_KINDS`, `reportMenuNode`): a dialog of a button per kind in this order, Raid, Max battle, Wild spawn, Train, Meetup, each with its icon and how its place is picked (`pick`: `gyms`, `spots`, `stops` for 8M-9B's research and Team GO Rocket, `point`, or `form` for none), then Cancel; a list of data, so that 8M-9B adds two entries (A11). A bottom sheet on a phone, a small panel under the button on a wide screen; a modal dialog for the keyboard as the layers' sheet is (`SheetFocus`: the focus on its first choice, Tab kept inside it, Escape, Cancel and the scrim closing it, the focus given back). Opened while another form holds it says "Close the form that is open first."; a step 2 open ends.
+- **The icons** (`report-icons.ts`; A8; Matt's notes, follow-ups "From Phase 8M-7"): the game's raid icon (`Images/Raids/ic_raid_small.png`) and Poké Ball (`Images/Items/pokeball_sprite.png`) of PokeMiners' pogo_assets at the commit Pine's other game pictures are pinned to (`POGO_ASSETS`), on raw.githubusercontent.com, an origin the page loads already (`pictureOrigins`): the policy is unchanged (`report-icons.test.ts`); Pine's own drawings for the max battle (the game's Dynamax icon is not in pogo_assets: a follow-up for Matt to pick it by hand), the train and the meetup, paths of a 24-pixel square drawn as SVG of ours (`drawShapes`, `currentColor`: `--tier-dynamax`, `--train`, `--meetup`); every icon outlined to read on any background (`drop-shadow` of `--icon-outline`, light and dark). pogo_assets has no license of its own: they are the game's files, used as Pine's other game pictures are.
+- **Step 2, where** (`report-flow.ts`, pure; A4, A5, A6): in the side pane's box, as route mode (an aside claim of the hold, `take(false, true)`; on a phone the pane docked under the map), the kind's heading and icon, what to tap, the nearest five with their distances from your location, else the map's middle (`nearestLines`, `distanceWords`), "← Back" to step 1 and Cancel (Escape outside a field too). The fitting places are drawn whatever the layers say and ringed in `--primary`, the rest of what is drawn dimmed (`report-picking`, `pick-<pick>` on the map's container, `map.css`; the trains' and meetups' rings let taps through meanwhile): a raid's gyms (`MapRaids.forced`), listed from every gym the page has; a max battle's Power Spots (`MapRaids.forcedPlaces`, `placesWanted`'s `forced`): the map flies to the reference point at `PLACES_FROM` and the answer of `/api/powerspots` for that box lists the nearest (`ShownPlaces.onSpots`); a spawn any point. A tap on a place or on its line goes to step 3, step 2's claim let go first so that the form takes its own: a raid's report form opened in the gym's popup (`GymDots.open`, the dot drawn for it whatever the layer; "Report raid" pressed for the member), or the raid standing there where the map draws it (`openRaid`, by the list: the server's answer covers a raid the page cannot see); a max battle's form in the spot's popup (`ShownPlaces.openSpot`), or the battle there, a tap on a battle's marker opening it as it would; a point tapped while a max battle or a spawn is picked puts a pin there (review R1-1: a marker of ours, `report-pin`), its line in the box, "Unlisted power spot here" or "Spawn here" with "Report here", opening the form there (`maxAt`, `spawnAt`), so that a double tap only zooms and moves the pin; a gym or Power Spot tapped while a spawn is picked puts the pin at its place. A train has no step 2: its start form opens with its region prefilled where one region alone holds your location or the map's middle (`regionHolding`); a meetup's form opens with its own place picking already started (`newMeetupClicked(true)`, not a second picker). Tapping a place directly (a gym's or Power Spot's popup, the right click or long press for a spawn) still skips steps 1 and 2.
+- **Its controller and its details** (prototype review 1): steps 2 and 3 are `ReportFlow` (`report-ui.ts`), a controller over the hold and what the page gives it (`ReportFlowDeps`), tested without a page (`report-ui.isolated.test.ts`: the claim let go before step 3, Cancel, ← Back and Escape giving back the hold, the box, the places, the classes and the focus, Report no longer offered, the battle's marker opened as it would, the pin's order); `reportUi` is the page's side. Each kind's heading is its own (`ReportKind.heading`: "Report a raid", "Start a train"). The focus (R1-3): step 2's heading takes it as step 2 begins (`tabindex="-1"`); what changes in the box, the pin and the nearest places, is a part of its own that stays in the page, `aria-live="polite"`, drawn anew alone with the focus kept on the same control (review R2-2, `pickLive`, `showLive`), back on the Report button when step 2 ends with the focus in it (not for a step 3), the step-3 form's first field (`focusFirst` of the raid, max battle, spawn and start forms); Escape with a popup open closes the popup alone (a capturing listener, before Leaflet's), else ends step 2, but is left to another sheet that is open, the layers' (R2-5). While a raid's step 2 picks gyms the raids are drawn whatever their layer (controller's ruling C1, `MapRaids.raidsShown`), so the raid standing at a gym shows; as before once it ends, and a raid or battle a step 3 opens is opened on its own marker, the raids drawn while its popup or the card shows it, the parties drawn anew as it opens and once it closes (reviews R2-1, R3-1: its Power Spot's dot, the gyms with raids and the rings as the layer has them; `openParty`, `raidsDrawn`). Report no longer offered (read-only) ends step 2 at the start of the list's draw, without a draw inside the draw (R1-9). The Power Spots that cannot be had or are not drawn at this zoom are said in place of "Finding the nearest…" (R1-6: `onSpots` tells `failed` and `zoom`; a zoom passed while the map flies to the reference point says nothing, R2-4). The places that do not fit are dimmed with the rest (R1-7), and those that fit offer a clear target of 16 pixels round their dot while they are picked (R1-10, `PICKED_TARGET`, `place-target`).
+
 ## Reports at stops on the map (plan 8R-3)
 
 - **Scope** (Matt, 2026-10-22, as 8X-5): the server side alone: the data, the routes and the code paths they share with `/research` and `/rocket`. The page (`src/web/client/`) has none of it yet (no layer, popups, Report research / Report Rocket, right-click, filter): left for the UX pass (follow-ups, "From the 8R-3 prototype"). No migration, no command change.
diff --git a/docs/superpowers/plans/2026-10-27-phase-8m9a-staging.md b/docs/superpowers/plans/2026-10-27-phase-8m9a-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..e8e07b4ad6b2818bbe823ec42d480de30cd51e9b
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-27-phase-8m9a-staging.md
@@ -0,0 +1,53 @@
+# Phase 8M-9A staging checklist: the Report button, max battles and Power Spots on the map
+
+Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude drives Discord and the map in its own tab, Matt the phone steps.
+
+- **Accounts:** Googer (owner, staff), Tester (a member).
+- **Brief:** `.superpowers/sdd/2026-10-27-phase-8m9a-report-and-max/design.md` (its last section, "After the builder check", A1 to A11).
+- **Design:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("Reporting", "Markers", "The list").
+- **Conventions:** `docs/architecture/web.md` ("The Report button", "Max battles on the map", "The map's frame").
+- **Devices:** a desktop browser (light and dark, and narrowed to 768 and 1000 pixels), an Android phone and an iPhone if at hand, Discord's in-app browser and the phone's own.
+- **Compare with Discord:** every report beside its command on Discord: the same pick lists, questions, words and answers (`/raid`, `/max`, `/wild`, `/train`, `/meetup`).
+
+## Before
+
+0. **The page built, the bot started after it.** `npm run web:build`, then start (or restart) the bot: the bot serves the map's page from `dist/web/assets/` and reads `dist/web/assets.json` once at startup.
+1. **No migration, no setting, no command change:** no deploy needed. `settings.web.publicUrl` is `https://dev.example.com` and the tunnel `pine-dev` runs. Max battles on (always), Power Spots of West kept (the Wayfarer import).
+2. **Parties:** Googer reports with `/max` a Dynamax battle at a Power Spot of West and a Gigantamax battle at a maps link far from any Power Spot (an unlisted power spot); a raid at a gym of West; Tester signs up for the Dynamax one.
+3. **The Gyms layer's default.** In a browser that never opened the map (a private window): the Gyms layer is off ("More" on a wide screen, the phone's sheet), raids are drawn. In the browser that kept it on before the update: still on.
+
+## Max battles on the map (A1, A2)
+
+4. **Drawn as a raid.** At the Power Spot: the boss's picture in a ring of Dynamax's color, the time badge ("38m"), the green count; the Gigantamax battle at its point in Gigantamax's color. Light and dark. The spot's own dot is not drawn under the battle (Power Spots layer on, zoom 16). Turn the Raids layer off: both battles go, the spot's dot comes back.
+5. **Their last minutes.** A battle with under five minutes left is dimmed, its badge counting down every 15 s without a reload.
+6. **The popup is the post.** Tap the Dynamax battle: its post as on Discord (heading, Where with the Power Spot, the trainers, the buttons), the member's part, the map's line; Join, Here, Done, Remote, +1/−1, Group…, Meet…, Report…, and as Googer Delete…, each doing what the post's button does (compare on Discord). On a phone: the card, its summary, swiped up for the whole post.
+7. **The list.** "Raids and max battles · n": the battles among the raids, named by their post's title ("Dynamax Machamp (2★)"), their place, distance, "38m left", "1 going"; Soonest puts a battle ending first first; hovering a line rings its marker; tapping it flies there and opens it.
+8. **A train at the spot.** A train whose current stop is the Power Spot with the battle: its ring goes round the battle's circle. In route mode, tapping the battle's marker adds the spot as a stop (no popup).
+
+## A Power Spot's popup and the max battle form (A3, A9)
+
+9. **The popup.** Power Spots on, zoom 16, tap a spot without a battle: its name and "Report max battle here"; logged in as a member who is read-only (Discord away for the bot) or logged out: the name alone.
+10. **The form.** "Report max battle here": the bosses grouped by tier in `/max`'s order, the featured one first and marked "(featured)" while an event is on; "Another boss (type its name)" shows the name and its tier; "Ends in" empty (the usual end, as `/max` without `end:`). Compare with `/max`'s choices at the same moment.
+11. **A report.** Pick a boss, Report: "Reported: …" in `/max`'s words (no post named), the form closes and the new battle's popup opens; the post appears on Discord.
+12. **The ending-soon question.** Within five minutes of a rotation (or of the last battle time), report a new battle without an end: the form asks the dialog's question in its words, its choices as `/max`'s dialog offers them ("until the next rotation" first), the zone hint when the browser's zone is not the server's. Pick one, Report: made with that end. Wait past the offered end with the choice still checked, Report again: "That battle has ended meanwhile: nothing was reported.", the form drawn from fresh lists without the question; Report again: asked again with the choices of now (the browser's clock decides nothing, review R1-5).
+13. **Asked again after a refusal (A3).** With the form open, remove its boss from the list (`/admin boss` on Discord), Report: "That boss is no longer on the list: pick it again.", the boss menu drawn from the new list, the boss no longer offered. A boss typed that names no Pokémon: `/max`'s words in the map's (I know no Pokémon called "…". Pick a boss from the list.); a boss typed on no list without its tier: "Which tier? Pick the tier of this boss.".
+14. **Another boss there.** Report a different boss at the spot of the Dynamax battle: the refusal in `takenWords`, the battle there opened.
+15. **Barred.** As a member kept out of West's forum: the report says the server's words ("You cannot report a max battle at this spot: you are kept out of the forum its battle would be in.") under the form, from an answer that has no text but its `error`.
+
+## The Report button (A7, A8)
+
+16. **Where it is.** Wide screen: "Report" in the header before "Find a gym"; at 768 and 1000 pixels the header is still one row (the title says "Pine" up to 1024). Phone (360 and 375 wide): a round "Report" over the map at the bottom right above "Show where I am", nothing scrolls sideways, the header one row; the list ("List") has a "Report" line at its top that shows the map and opens the menu. Logged out: no Report anywhere; read-only: none.
+17. **Step 1.** The menu: "What are you reporting?", Raid, Max battle, Wild spawn, Train, Meetup, each with its icon (the game's raid icon and Poké Ball load, outlined, light and dark; Pine's own burst, engine and two people); a sheet on a phone, a small panel under the button on a wide screen. Keyboard: the focus on Raid, Tab stays inside, Escape closes it and gives the focus back to Report; Cancel and a tap beside it close it. With a form open: "Close the form that is open first.". With the phone card open: Report closes it.
+
+## Step 2 and step 3 (A4, A5, A6)
+
+18. **A raid.** Report → Raid: the side pane (docked under the map on a phone) says "Report a raid", "Tap a gym on the map to report its raid.", the five nearest gyms with their distances (from your location once shared, else the map's middle), ← Back and Cancel; every gym drawn and ringed whatever the Gyms layer, the raids drawn even with the Raids layer off (C1), the battles, other places, rings and lines dimmed; the focus on "Report a raid" (a screen reader reads the box). Tap a gym (or its line): the gym's popup opens with the report form already open, the focus on its boss menu; report it as with `/raid`. A gym with a raid (its marker, or its line): the raid's popup opens instead, also with the Raids layer off. ← Back: the menu again; Cancel or Escape: the gyms and raids go back to what the layers say, the focus back on Report; Escape with a popup open closes the popup alone. Discord away meanwhile (read-only): step 2 ends by itself.
+19. **A max battle.** Report → Max battle: the map flies to where you are (or stays at its middle) at street level, "Finding the nearest…", then the five nearest Power Spots with their distances; the spots drawn and ringed whatever the layer. Tap a spot (or its line): its popup with the form open. Tap the battle's marker (or the line of its spot): the battle opens. Each spot offers a target of 16 pixels round its dot (a thumb on a phone). Zoomed out past street level: "Zoom in to see the Power Spots near here."; the spots refused by the server (devtools, offline): "The Power Spots could not be loaded. …". Tap a point away from any spot: a pin there and "Unlisted power spot here · Report here" in the box; a double tap only zooms; "Report here": a popup at the pin, "Unlisted power spot", with the form, its boss menu focused; report it: as `/max` with a maps link there (a Power Spot within 50 meters named, else an unlisted power spot), the moderators told of a new pin battle as from `/max`. As a member blocked from meetups: refused, Report off, "← Pick a Power Spot" back to step 2 (review R1-4).
+20. **A wild spawn.** Report → Wild spawn: "Tap the map where the Pokémon is."; tap a point: a pin and "Spawn here · Report here", which opens the spawn form there (the Pokémon field focused); tapping a gym or a Power Spot puts the pin at its place; a double tap only zooms.
+21. **A train.** Report → Train: the start form at once, its Name field focused, its Region prefilled with the region you are in (or the map's middle is in); in two regions' overlap or outside every region, "Pick the region".
+22. **A meetup.** Report → Meetup: the new meetup form with its place picking already on ("Click a gym, a PokéStop or a point of the map."); pick a place, make it as before.
+23. **Direct taps still work.** A gym's popup ("Report raid", "Report spawn here", "Meetup here"), a Power Spot's popup ("Report max battle here"), the right click or long press for a spawn: each opens its form without steps 1 and 2.
+
+## After
+
+24. **Follow-ups.** Matt picks the game's Dynamax (and Gigantamax) icon for the Report menu by hand (the official map's bundle or the Pokémon GO wiki, never fetched by a script); 8M-9B adds Field research and Team GO Rocket to the menu.
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 814457ff01c63f3c7e98177cd895ed4e44b6ce1f..ce3d5857a0c06323f2d4cc17b7c45671989bea89 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -445,7 +445,9 @@ export type MapMaxTier = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'G';
  * A max battle (plan 8X-5; design 7), shown as a raid is: its fields have `MapRaid`'s names
  * wherever they mean the same, so that one component of a page can draw both. It is at a power
  * spot (`spotId`, as `/api/powerspots` lists it) or at a pin, an "Unlisted power spot" (`spotId`
- * null). It has no egg and no hatch, and nothing of it is changed on the map.
+ * null). It has no egg and no hatch. The map draws it as a raid (plan 8M-9A), and its post's
+ * controls work on it there as on any party's; its boss and end are changed on Discord alone
+ * (`/boss`, `/end`: no Change… of its own on the map).
  */
 export interface MapMax {
   kind: 'max';
````

## After the last task

- [ ] `npm run check > var/8m9a-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff 7ce418a0c344bb5bf91def186c4c064c8256352e HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
