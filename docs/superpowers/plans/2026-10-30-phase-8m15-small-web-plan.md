# Phase 8M-15: The Small Web Plan Before the Cutover: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the map's popups read and tap well on a phone, a train's stops ahead read as "how far away" without clutter, the short pages' cards look alike, and the events listing stops repeating "Campfire", before `dev.example.com` goes to two outside testers.

- **Task 1:** the place list, with "Also nearby".
- **Task 2:** the popup's × beside the first line on a coarse pointer.
- **Task 3:** a train's stop badges on its line, counted from the train; "next" / "in N stops" in the popup's Route list.
- **Task 4:** P1, the short pages' cards.
- **Task 5:** V1, Campfire in the listing and posts; V2, `/help meetup`.

**Tech stack:**
- TypeScript 6.0, Node 26, Fastify, Leaflet, esbuild, Vitest.
- No new dependency, no migration, no party state change, no command change (no deploy).

**Spec:** `docs/superpowers/specs/2026-10-30-small-web-plan-design.md` (approved by Matt 2026-10-30). With it: the brief `.superpowers/sdd/2026-10-30-small-web-plan/brief-proto.md` and the rulings in `fix-r1.md`, `fix-r2.md` and `progress.md` there (git-ignored).

**Every diff in this plan was run before the plan was written.**
- They were made on a throwaway branch `proto-8m15` (tip `1837cb7a`), one commit per task, on `web-small-pass` 4ed2be93.
- Each commit typechecks (root and `src/web/client`) and passes its tests.
- On the final tip the full check (11,216 tests), the build and the database suite (623) passed.

**Reviews:**
- **The prototype:** an Opus review found 2 Important (Report's dimming no longer reached the dots once they moved to their own pane; a badge's distance ignored the leg's length, so on downtown legs it landed on or past the stop before) and 4 Minor (the × spacer narrowing whole flex-root popups; an archived event post asked about at every draw; the arrival rule living in the client; stale docs).
- **Fix round 1:** folded in. **The re-review** found three more Minor (a post's forms still narrowed; arrowheads under the leaving stop's marker; squeezed numbers overlapping). **Fix round 2:** folded in, checked by screenshots with real touch emulation (`var/look-8m15/r2-coarse.png`, main checkout).
- **The controller's rulings:** a mid-route turn-back lists the stops behind the train through its current stop, which gives the design's gaps (Q2); numbers never overlap, and a leg that cannot hold them falls back to the left of the stop; a locked but open event post is edited, as a changed event's already is.
- **Matt on the calls (2026-10-30):** the turn-back numbers, the × touching a form's frame and crowded legs to be looked at in staging; no arrowheads on legs too short for them and on a two-stop loop, fine.

**Conventions:** read `CLAUDE.md`, `docs/architecture/web.md`, `trains.md`, `utilities.md` and `testing.md`.

**Inside the plan:**
- Each commit needs only the typecheck (root and client) and its own test files.
- The full check, the build and the database suite run once, on the tip.
- Work in `../Professor-Pine-smallweb` on `web-small-pass`; never commit in the main checkout.

## Review Focus

- A train's number on the map, its "(in N stops)" in the Route list and the post's "Next:" line agree, for every end mode, a train already on its way back and a finished train.
- A dot's tap wins over a badge at the same place, and Report's pick mode still dims what cannot be picked.
- A list's grouping goes by place key, never by distance; a pin or a tap between markers is "Nearby" without the label.
- Every popup kind on a coarse pointer keeps its text and controls clear of the ×; a fine pointer is unchanged.
- An event post is never sent again with an equal message, and a locked or archived post is not reopened outside the hourly draw.

---

### Task 1: 8M-15 task 1: the place list headed with the tapped place, Also nearby

Prototype commit: `b5e19d82896c989e4ec542bc3baec95263be38de`

placeListNode headed by the tapped thing's place name, the things with the same place key
first, then the label "Also nearby" over the rest in today's order; "Nearby" for a tapped thing
without a place key (a pin), without the label. tapGym carries place { key: 'gym:<id>', name }.
MapMeetupPlace gains at: { key, name } | null (gym:<id>, stop:<Wayfarer id or pine-<id>>,
spot:<Wayfarer id>), so a meetup at a PokéStop or Power Spot groups with its place.

**Files:**

```
 docs/architecture/web.md                         |  6 ++--
 src/domain/web/party-data.ts                     |  6 ++++
 src/domain/web/party-view.test.ts                | 29 +++++++++++++++-
 src/domain/web/party-view.ts                     | 18 ++++++++--
 src/web/client/find.test.ts                      |  2 +-
 src/web/client/map.css                           |  7 ++++
 src/web/client/meetup-forms.test.ts              |  9 ++++-
 src/web/client/parties.test.ts                   | 18 ++++++++--
 src/web/client/party-layer-draw.isolated.test.ts | 58 ++++++++++++++++++++++++++++++--
 src/web/client/party-layer.ts                    |  9 ++++-
 src/web/client/shared-place.test.ts              | 80 +++++++++++++++++++++++++++++++++++---------
 src/web/client/shared-place.ts                   | 69 ++++++++++++++++++++++++--------------
 src/web/client/what-is-on.test.ts                |  9 ++++-
 13 files changed, 265 insertions(+), 55 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/web/client/find.test.ts src/web/client/meetup-forms.test.ts src/web/client/parties.test.ts src/web/client/party-layer-draw.isolated.test.ts src/web/client/shared-place.test.ts src/web/client/what-is-on.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff b5e19d82896c989e4ec542bc3baec95263be38de -- src test scripts docs/architecture` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-15 task 1: the place list headed with the tapped place, Also nearby`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 9913c50d..6db45c1f 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -50,7 +50,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **Layers** (`layer-registry.ts`, `LayerRegistry`): everything drawn is a layer the member toggles, registered with a name, whether it is on by default, live (a toggle of its own on the desktop) or background (under "More"), a line about it, members only (`membersOnly`) or waiting for data (`waits`), and how many of its things are in view (`setCount`, which the parts that draw it keep current at each `moveend` and draw). One call adds a layer (`register`; field research and Team GO Rocket came so with 8M-9B). The layers of `MAP_LAYERS`: Raids, and since plan 8M-9B Field research and Team GO Rocket after Meetups (below, "Reports at stops on the map's page"); Raids (max battles too since plan 8M-9A: the toggle keeps the name "Raids", since "Raids and max battles" broke the desktop's one row at 768 pixels; its line in the phone's sheet says "Bosses, eggs and max battles", and the list's group is "Raids and max battles"), Trains, Meetups (live, on), Wild spawns (off; it waits for data: no route lists spawns yet, so it is not offered until something calls `setOffered('spawns', true)`), Gyms (off since plan 8M-9A: the Report button's step 2 draws the gyms to pick from whatever the layer says; on until then, the controller's ruling of fix round 1 of 8M-7, while "Report raid" was in a gym's popup alone; a browser that kept the layer on keeps it on), PokéStops, Power Spots (off), Region outlines (on). The choice is kept per browser, one for every server (`localStorage` `pine-map-layers`, `{ id: boolean }`, read and written in try/catch; a value that is no boolean is ignored, a layer the browser kept nothing of takes its default). The controls (`layers-ui.ts`): on the desktop a row in the header (`<nav id="layers">` of the template) with the live layers as labelled toggles (`aria-pressed`, a dot of the layer's color) and the background ones as checkboxes under "More" (a `<details>`); narrower than 1024 pixels (`map.css`; 768 until plan 8M-9B, B7, provisional: five live toggles, "Research" and "Rocket" short in the row with their names in the sheet and the toggle's title, fit from 1024) a "Layers · n" button (`layersButtonLabel`, n the offered layers on) that opens a bottom sheet listing every offered layer with its line, how many are in view ("4 in view", `inViewWords`) and a switch (a checkbox `role="switch"`), Done and a tap on the scrim closing it; the sheet is a modal dialog for the keyboard (`SheetFocus`: `aria-modal`, the focus moved to its first switch, Tab and Shift+Tab kept inside it (from its last control to its first and back, and from outside it in: 8M-7 review fix 9), Escape closes it, the focus given back to the button), each switch named by its layer (`switchLabel`, `aria-label`), and "More" closes on Escape and on a click outside it (`moreCloses`). Logged out (or not a member), only Gyms and Region outlines are offered (`offered(spec, member)`; plan 8M-13, L1: every other layer, Wild spawns too, is `membersOnly`, since the server gives a visitor nothing but `/api/geo`); the controls are drawn anew once `/api/me` answers (`refresh`).
 - **What each layer draws:** the parties' popups and markers as before (`party-layer.ts`), now in a group per layer (`raids`, `trains`, `meetups`) put on and taken off the map by the registry; the regions' outlines with their labels (`main.ts`; the labels on a pane of their own, `region-labels`, at 350 under the overlay pane of the outlines and of the gyms', stops' and spots' circles and under every marker (round 2), taking no clicks, in 12 px type, so that a name never covers a raid or a gym); the gyms (`gyms-ui.ts`, `showGymDots`) at every zoom, by Pine's grid clustering below zoom 16 (`cluster.ts`, `clustersAt`, `CLUSTER_BELOW`: the places of one cell of a grid fixed on the world are one cluster, the cell 60 pixels from zoom 15, 90 at 13 and 14, 120 at 12 and below (`cellPixels`, plan 8M-11B), drawn as a circle with its count at the middle of its places, `.cluster`, `--cluster`; a tap zooms in on it, at least two zooms and at most to 16; Leaflet.markercluster's last release is from 2020); what is drawn is worked out for the view and half its size round it (`wantedDots`, `DOTS_MARGIN`; keyed `gym:<id>` and `cluster:<zoom>:<cell>`, plan 8M-11B) and only the difference touched at each move, list or change (`planDots`: a cluster whose gyms changed changes its count and place in place, one no longer wanted gives its marker to a new one, the rest is added or taken off): the gym whose popup is open is never taken off nor clustered while it is open (fix round 1); which gyms are drawn is `shownGyms` (`gym-dots.ts`): every gym while the Gyms layer is on, or while a gym is to be clicked (route mode, a meetup's place picked, the Report button's step 2 of a raid: `MapRaids.forced`, the gyms drawn anew after each draw of the parties), and while "Find a gym" holds a word only those it matches, on the same terms: while the layer is on or a gym is to be clicked, none while the Gyms layer is off, shown again when it is turned on while the word stands (plan 8M-13, L2; Enter fits the map to them and opens the one gym's popup once the map rests); the PokéStops and Power Spots of the view (`places-ui.ts`, `showPlaces`) for a member from zoom 16 (`placesWanted`, `PLACES_FROM`) through `/api/stops` and `/api/powerspots`, asked at once when wanted and again 300 ms after the map rests (`PlacesInView` over `StopLoads`: only the last question's answer shown, nothing after they are no longer wanted), small dots of `--stop` and `--power-spot` with the name in a popup (a Power Spot's popup also offers "Report max battle here" since plan 8M-9A, below, "Max battles on the map"; a spot whose battle is drawn is left out, `unoccupied`, drawn again from the last answer as the parties change, `ShownPlaces.redrawn`; while the Report button's step 2 picks them they are drawn whatever the layer, `placesWanted`'s `forced`, `MapRaids.forcedPlaces`), and "more than shown" in one quiet line at the bottom left of the map ("Zoom in to see every PokéStop here.", `MORE_THAN_SHOWN`, `quietLine`). Live things never cluster.
 - **Raid markers** (`raid-marker.ts`, frame B of the mockups): a circle centered on the gym, named for a screen reader by the lead raid's `heading` (the marker's `title`, 8M-7 review fix 9) (`raidMarkerNode`, drawn as an element of ours in a `divIcon`, `raidIcon`, 44 pixels): the post's picture (the boss, or the egg of its tier before it hatches) in a ring of its tier group's color (`MapRaid.tierGroup`, made by the domain's `raidTierGroup` of `src/domain/pogo/raid-tier.ts`: `1`, `3`, `5`, `mega` for Mega, Mega Legendary and Super Mega, `elite`, `shadow` for every shadow raid; `tierColour` names `--tier-<group>`; `raid-marker-tiers.test.ts` holds `theme.css` and `map.css` to every group of `RAID_TIER_GROUPS`), a time badge under it (`badgeFor`: "12 min", "1 h 05" while it runs (`durationWords`' compact form, plan 8M-11A), "hatches 2:40" before the hatch, the posts' time by `clockTime` with AM or PM left out today only, "hatches Wed, Oct 14, 2:00 PM" another day; "Egg" or "Hatched" where nobody said when, "Ended" by `stageAt` (capitalized since plan 8M-11A, S5)), and a green count of those going (`MapAttendance.going`, made by the domain's `goingCount` of `party.ts`: the committed heads of the whole party, coming, here and asked whether done, +1s counted, the lobbies' own rule that `lobbyCount` shares; none at zero). Raids shrink as the map zooms out and are still never grouped (Matt, 2026-10-25; `markerSize`): from zoom 15 the full marker (`--raid-full`, 44 px, with its badge and count), at 14 a smaller circle with the count and no badge (`--raid-middle`, 30 px), at 13 and below a small circle with the boss picture in its ring and no badge or count (`--raid-small`, 20 px); sizes are named values of `theme.css`, read by `theme().sizes` for what Leaflet draws; the tap target is never under 32 pixels (`tapBox`, a clear margin round a small circle), the train's and meetup's rings round a raid scale with its circle (`ringSizes(circle)`), and a zoom into another size draws the parties anew. Nearly over, it is dimmed (`isDimmed`: hatched by the clock, `stageAt` of `src/domain/party/raid-stage.ts`, which `raidStage` reads raids through, and `endsSoon` of `src/domain/time/ending-soon.ts`, the five minutes `/max`'s ending-soon question asks by: one rule). The page keeps badges and dimming current every 15 s from the times on the marker (`data-stage`, `data-hatch`, `data-end`; `markerNow`, by the same rules as at the draw), an egg turning into its time left as it hatches. One source for every fact (Matt, 2026-10-25): what the page shows or decides of a party is computed by the domain code the Discord side uses, sent with the list or imported from a pure module of `src/domain/` that imports nothing (`raid-stage.ts`, `ending-soon.ts`), never a second implementation; only the words are the page's. A gym with a raid shows the raid, not its gym dot, while the Raids layer is on (`hiddenGyms`, `MapRaids.raidGyms`); off, the dot is back. Trains and meetups keep their drawing (rings, a line), restyled; at a gym whose raid circle is drawn, their rings go round it rather than over the boss (`ringSizes`: the train's just outside the 44-pixel circle, radius 26, the meetup's outside the train's, radius 31; the old sizes elsewhere, and again when the Raids layer is off). A gym of several raids is drawn by one lead raid, the first with a picture, else the first (`leadRaid`): picture, ring, badge and count are all that raid's. A raid is named everywhere on the map (its popup, the list, the list of things at one place) in its post's own heading words, `MapRaid.heading` (`raidLook` over the renderer's `headlineParts`: `Level 5 raid against Yveltal`, `Level 5 raid (egg)`, without the shiny mark; the tier's words where the renderer gave none), and its popup reads its stage by the clock (`stageAt`), not the list's `stage`.
-- **Several things at one place** (`shared-place.ts`): when more than one shown thing sits at the same place (the same gym, or within 12 pixels at the current zoom, `sharedPlace`, `SHARED_PIXELS`; a raid marker, a max battle's marker (the raids' layer, plan 8M-9A: at its Power Spot, whose own dot it replaces, or at its pin), a train's ring, a meetup's ring, and a gym's dot tapped where parties share it, `MapRaids.gymTapped`), a tap on any of them opens one popup listing each (`placeListNode`: picture, name, time: the lead raid's `heading` and badge, a battle's `title` and badge, a train's or meetup's `startWords`), and a choice (`data-open`) opens that thing's own popup as before. A layer turned off takes its things out, and the overlap with them. This replaces the tap on a ring's line of the 8S-4 staging: the rings still take clicks on their line alone, but a tap on what they ring lists them.
+- **Several things at one place** (`shared-place.ts`): when more than one shown thing sits at the same place (the same gym, or within 12 pixels at the current zoom, `sharedPlace`, `SHARED_PIXELS`; a raid marker, a max battle's marker (the raids' layer, plan 8M-9A: at its Power Spot, whose own dot it replaces, or at its pin), a train's ring, a meetup's ring, and a gym's dot tapped where parties share it, `MapRaids.gymTapped`), a tap on any of them opens one popup listing each (`placeListNode`: picture, name, time: the lead raid's `heading` and badge, a battle's `title` and badge, a train's or meetup's `startWords`), and a choice (`data-open`) opens that thing's own popup as before. Plan 8M-15 (design 1, Matt 2026-10-29: a near neighbor is easily tapped by mistake on a phone): the list is headed with the name of the tapped place (the first thing's `PlacedThing.place`; a gym's dot tapped carries `gym:<id>` and the gym's name), the things at that place (the same `place.key`, never by distance: its raid or battle, a train whose current stop it is, a meetup at it, the dot's own choice) first, then the small muted label "Also nearby" (`ALSO_NEARBY`, `span.also-nearby`) over the rest in the order given; no label when every thing is at the place; a tapped thing at no named place (a pin: no key) heads it "Nearby" (`NEARBY`) without the label. A meetup at a PokéStop or Power Spot groups by `MapMeetupPlace.at` (below). Which things are listed at all is `sharedPlace`'s as before; the Power Spots' and stops' own popups (`places-ui.ts`) and the attendance word "Here" are unchanged. A layer turned off takes its things out, and the overlap with them. This replaces the tap on a ring's line of the 8S-4 staging: the rings still take clicks on their line alone, but a tap on what they ring lists them.
 - **The list of what is on** (`what-is-on.ts`, pure; drawn by `list-ui.ts`, `WhatIsOn`; plan 8M-7, replacing the side panel "Meetups and other parties"): on the desktop the side pane on the right (`#parties`, "What is on"), under the trains' box; on a phone the header's "List" button (`#list-button`, `body.list-open`) swaps the map for it and back (its words say what a press shows next, "List" or "Map", with no `aria-pressed` beside them: 8M-7 review fix 9). It holds every live thing the layers on show across the whole server, not only what is in view (`listLines`: raids and, since plan 8M-9A, max battles in one group, "Raids and max battles", a battle named by its post's `title`, Soonest by its end, its key `max:<id>`; trains, meetups; wild spawns once a route lists them), grouped by kind in that order, each group headed with its count (`listGroups`: "Raids and max battles · 5"), under "What's going on · n" (`LIST_HEADING`, plan 8M-11A, S22; the logged-out pane and the pane's `aria-label` too). A line (`lineWords`, a button): the picture (a ring of the kind's color without one), the name (`raidName`, a train's or meetup's), the place (a raid's gym, as the map has it or as its post names it; a train's `stopLine`; a meetup's words), the distance (from your location, else the map's middle; none without a place), the time ("30 min left" by `timeLeft` over `durationWords`, plan 8M-11A; "hatches 2:40 PM", `startWords`), "4 going" (`MapAttendance.going`); dimmed in a raid's last minutes (`isDimmed`). Sort, kept per browser (`localStorage` `pine-map-sort`, try/catch, `readSort` / `writeSort`): Nearest (the default), Soonest (a raid's end, a train's or meetup's start; none last), Most going; ties by name, and what has no point at all last in its group whatever the sort. Tapping a line whose thing the map draws (its layer on) flies the map there (street level or closer) and opens its popup once the map rests (on a phone, back to the map first, `PartyFrame.showMap`); a thing the map does not draw (a train without a route or with none of its stops on the map, a raid at a gym the map does not show, a meetup without a place) shows its popup under its line instead (`detail`: `raidPopup`, `trainPopup` with its actions, `meetupPopup` with Edit…, as the side panel showed them). Hovering a line on the desktop highlights its marker (`highlighted`: a ring round a raid's circle, a thicker line for a ring). A form that opens in the side pane (the start form, route mode, a meetup's form or editor) is shown over the list, which comes back when it closes (`paneShows`). Drawn anew with each list and a change of sort; a move of the map, a change of layers and a new fix of your location (only sorted Nearest, and only once it moved more than 25 m, `fixRedraws`) draw it too, but never while a form holds: then once, when the form lets go (`ListRefresh`, fix round 1). A line shown with its popup under it is kept by its key (`WhatIsOn.kept`): drawn anew for a move, a fix or a change of layers, only its own words change and its popup (a group menu, a field) stays, the focus given back where it was (a control drawn anew is found again by its tag and `data-` attributes, `sameControl`: a line's button by `data-key`, its line's key, the sort by `data-sort`; a control with no `data-` attribute is not looked for, so the focus never jumps to the first line, 8M-7 review fix 2); drawn from a new list (`show`), its popup is drawn anew from it (counts, "You:", buttons), the group chosen in its menu kept while that group is still offered and the focus given to the control of the same kind (round 2); a change form opened in such a line takes the hold with its `alive` (`FormHold.take(…, alive)`), so that the hold lets go whenever the form goes away (`checkGone`, after each drawing of the list and with each new list). Whether a form of the pane's box holds is recomputed as a form takes the hold or lets it go (`FormHoldDeps.changed`, `asideHeld`); on a phone such a form, which needs the map (route mode, a meetup's place picked, any form of the box), shows the map with the pane docked under it, 40% of the screen, whatever "List" says (`body.form-docked`). The phone's header is one row: the title, Layers, List, a "Find" button that opens "Find a gym" over the map (`#search-button`, `body.search-open`; Escape closes it, and closing it empties it, so that no word filters the map unseen) and the account (the member's name, cut to fit, its menu holding Log out; logged out, the login says "Log in" with the buttons' smaller padding, its two wordings spans of which `map.css` shows one, while the pane's own button keeps "Log in with Discord": 8M-7 review fix 4, `src/web/phone-header.test.ts`), none of them wrapping; what the header says beside the account goes under it. Tried at staging on a phone: List swaps the map for the list and back, a tap on a line returns to the map at the thing, a form of the pane docks under the map. The list ends with "Official meetups: Campfire" (`officialMeetupsLine`, a node through `renderNode`, the link `CAMPFIRE_DISCOVER_URL` in a new tab with `rel="noopener noreferrer"`; plan 8V-1, the Campfire links design) while the Meetups layer is offered (`LayerRegistry.isOffered`); the logged-out pane (a visitor, or somebody logged in who does not count as a member) shows it always, whatever the layers offer, since Campfire's meetups are public (plan 8M-13, L1: `loggedOutPane(…, true)` in `main.ts`). Pine never fetches anything from Campfire. Logged out, the pane says "Log in to see what is on." with "Log in with Discord" (or how to log in with `/maps`); logged in without counting as a member, "Only members of this server see what is on." (`loggedOutPane`).
 - **Distances** (`distance.ts`): `metersBetween`, which is `metresBetween` of `@pine/wayspot-core/distance` itself (the function the place search and Wayfarer matching measure with: one source for every fact, Matt 2026-10-25), and `distanceWords` (`src/render/distance-words.ts`, import-free), the one wording of a distance on the map and on Discord (Matt, 2026-10-25; task 7), in the units of `settings.distanceUnits` (per instance, as `timezone`): a short distance never rounded to nothing (the controller's ruling): `imperial` (the default) under 100 ft to the foot (`2 ft`), under a tenth of a mile to ten feet (`520 ft`), else miles to one decimal (`1.3 mi`); `metric` under 100 m to the meter (`2 m`, so that staff's lists of gyms within ten meters keep exact meters), under a kilometer to ten (`440 m`; what would round to 1000 m is `1.0 km`), else kilometers to one decimal. The pages read the units from `data-distance-units` of the map page and of the region editor's (`MapPageData.distanceUnits`, `WebDeps.distanceUnits`; the editor's "more than 490 ft apart" of a sliver too wide to fix is `FIX_REACH_METRES` by `distanceWords`, 8M-7 review fix 8); Discord's words take them from `ctx.config.settings`, through `distanceWords` itself, the one name (round 2): `/gym` move, add, review and import, `/pokestop`, the gym view's nearest gym, `/research`'s "Same task at more stops…" and its pin without a stop, and every threshold they name (`DUPLICATE_METRES`, `PINE_STOP_NEAR_METRES`, `PIN_NEAR_METRES`, `FAR_MOVE_METRES`, `CANDIDATE_METRES`, `DEFAULT_SCAN_MARGIN`), helps included (their `details` functions of the settings). `src/text-distances.test.ts` refuses a unit of distance worded by hand in the string literals of `src/commands`, `src/render`, `src/components` and the web pages' `src/web/client` (review fix 8), as `text-spelling.test.ts` refuses British spelling.
 
@@ -145,7 +145,7 @@ Brief `.superpowers/sdd/2026-10-27-phase-8m8c-train-controls/design.md` (its "Af
 ## Meetups on the map (plan 8M-5M)
 
 - **One code path per command** (spec 3.5, 3.7): what `/meetup`'s form does with `MeetupSafety.make`'s outcome is `makeMeetupAs` (`src/commands/meetups/meetup.ts`: the check of the place, the meetup or the moderators' request, each outcome in `/meetup`'s words, the post and a region's channel named by the caller's `ReportNames`); what `/name`, `/meet` and `/cancel-meet` in a timed party, `/end` of one and `/info` do is `renameAs`, `startAs`, `endAs` (`src/commands/parties/timed.ts`, `TimedAnswer`: `ok`, `refused` with the reason, `gone`) and `describeAs` (`src/commands/meetups/info.ts`). The commands reply with them (`replyTimed`) or throw them; the map answers them. The web server is given what those commands read and call (`MeetupWebDeps.ctx`, `MeetupWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
-- **The view:** `MapMeetup` (`party-data.ts`) carries, besides 8M-3's name, times, link and attendance, its `place` (`meetupPlaceOf`, `party-view.ts`: the snapshot it was named as, its kind and point, the gym's id for a gym, and where it is in `words`: a gym or stop `At <title>`, a pin named by a gym or stop near it `Near <title>`, by its link's name `At <name> (a pin)`, else `At a dropped pin`; null for a meetup from before 8D), its `info` (the information as written; the page sets it as text) and `panel` (`meetupPanelOf`: the editor for who may change it on the map, `mayEditMeetup`, its maker or staff by `isMapStaff`; `start` only for a member signed up, as `/meet` has it; null for anybody else and while read-only). The list names nobody; its post does, as on Discord.
+- **The view:** `MapMeetup` (`party-data.ts`) carries, besides 8M-3's name, times, link and attendance, its `place` (`meetupPlaceOf`, `party-view.ts`: the snapshot it was named as, its kind and point, the gym's id for a gym, and where it is in `words`: a gym or stop `At <title>`, a pin named by a gym or stop near it `Near <title>`, by its link's name `At <name> (a pin)`, else `At a dropped pin`; and since plan 8M-15 `at`, the place by the key the map's things at one place have, `gym:<id>`, `stop:<key>` (a Wayfarer id or `pine-<id>`, as the reports at stops key a stop), `spot:<Wayfarer id>`, with its title as named, null for a pin; null for a meetup from before 8D), its `info` (the information as written; the page sets it as text) and `panel` (`meetupPanelOf`: the editor for who may change it on the map, `mayEditMeetup`, its maker or staff by `isMapStaff`; `start` only for a member signed up, as `/meet` has it; null for anybody else and while read-only). The list names nobody; its post does, as on Discord.
 - **Making one** `POST /s/<guild>/api/meetups`, body `{ region, name, place, start, info }` (strict: any region of the server by id; the name up to `/meetup`'s 80 characters, blanks allowed so that they are refused in its words; `place` a gym or a PokéStop as `{ kind, id }` (a gym's number as text, a stop's Wayfarer id) or a pin dropped on the map as `{ lat, lon }`, kept to six decimals; `start` as `/meetup start:` takes it, up to 100; `info` as its form takes it, up to `MAX_MEETUP_DESCRIPTION`). Before the body is read (`onRequest`): 30 a minute per address (`MEETUP_WRITES_PER_ADDRESS_MINUTE`, shared with the changes) and `postGuard`. Then, in this order: the session (403) and the body (400); who makes it (`actingOnTheMap`); the region (of this server, else 404); its forum (none: 422 in `/meetup`'s words, the region named `#name`; `barred` 403; Discord unreachable 503); what `/meetup`'s guards and form refuse, in their order and words, none counted: a bad name (422), a member blocked from making meetups in the server (`MeetupSafety.blocked` with `staff` of the member fetched fresh, asked before the place and the start, as `/meetup` asks it: 403 `MAP_BLOCKED`, "You can't create meetups on this server. To appeal, use /meetup on Discord and press Appeal.", since the map has no Appeal button), the place (a kind that is no gym or PokéStop, a Power Spot among them: 422 `MAP_PLACE_KINDS_ONLY`, "A meetup can be at a gym, a PokéStop or a pin."; a gym or stop gone or of no region of the server: `PLACE_GONE`; a pin outside the regions: `PIN_NOT_HERE`), the start (`typedTimedTime` over `newPartyTimes('meetup', now)`, 422 in its words), the verdict asked with `blocked: false` (`refused`: `NO_MEETUP_HERE`; `review` with a start less than two hours ahead: `MEETUP_TOO_SOON`; `refusalOf`, shared with `/meetup`'s guard), information of nothing but white space (`NO_INFORMATION`); only then `/meetup`'s throttle in its window (`MEETUP_COMMAND`, `MEETUP_THROTTLE`: two a quarter of an hour from Discord and the map together); then `makeMeetupAs` as the member, the request marked as the map's (`RequestAsk.source: 'map'`, below). The place is named exactly as `/meetup near:` names it: a gym or stop through `pickedPlace` (`src/commands/place-option.ts`, the snapshot `namedPlace` makes of a pick: a gym by the name its post shows), a pin through `PlaceFinder.pin` with `MEETUP_PLACE_KINDS` (named by the nearest gym or stop within 50 m, never a Power Spot). The answer (`MeetupAnswer`, `src/domain/web/meetup-data.ts`): 200 `{ ok: true, outcome: 'posted', text: "Your meetup is made. Edit… in its popup changes its name, information and times.", meetup }` (the meetup as the map shows it to the member), 200 `{ ok: true, outcome: 'held', text: MEETUP_HELD }` (nothing posted: the moderators decide, the member is told by DM, never why; 200 rather than 202, since the page reads `outcome` either way), 403 for a block that came meanwhile, 422 `{ ok: false, text }` for every other refusal in `/meetup`'s words (`MeetupSafety.make`'s `power-spot` among them, which the map never sends). Logged at info, one line per request once who makes it is known, a refusal too (plan 8S-3): `{ user, guild, region, outcome }` (the region once it is one of the server's; `makeMeetupAs`'s kind, or what refused it: `no-region`, `no-forum`, `barred`, `unreachable`, `blocked`, `refused` for `/meetup`'s guards and form, `throttled`), "a meetup was made on the map", never a text or the place.
 - **The moderators' post** of a meetup asked for on the map says so: "Asked by **Name** (<@id>) on the map in <#region>" (`MeetupRequestRecord.source`, `map` or null; migration 021 adds `MeetupRequest.source`), before and after a decision, since the post is drawn anew from the row.
 - **The PokéStops of a box** `GET /s/<guild>/api/stops?south&west&north&east` (members, as the pick lists: 401, 403, 503; 60 a minute per address; a box that is none, beyond the world or inverted 400; the page keeps the map's view to the world first, `stopsBox`: latitude to [-90, 90], longitude to [-180, 180]): `StopsView`, the kept stops with a title in a region of this server inside the box, as `[id, lat, lon, title]`, the nearest to the box's middle first, at most `MAX_MAP_STOPS` (300), `more` when the box holds more (the page says to zoom in). Power Spots are never offered here (they are `/api/powerspots`'s, plan 8X-5, for max battles), nor other Wayspots; gyms are on the map already. `private, no-store`. The editor's data (staff only) is the only other Wayspot route, so the map has its own.
@@ -268,7 +268,7 @@ Design `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md`, "8M-11A"; fin
 - **Small fixes:**
   - S2: the rings' pane is at 590.
   - S3: on a coarse pointer the popup's and the card's × are `--tap-size` (44 px) square, and the popup's content starts under the popup's ×.
-  - S4: several things at one place are headed with the place's name where every one of them is at that same place (`PlacedThing.place`, a key and a name: a gym, a Power Spot, a stop, a train's stop by `placeKeyOfStop`; review fix F5), else "Here" (a battle at a pin beside a gym's raid).
+  - S4: several things at one place are headed with the place's name where every one of them is at that same place (`PlacedThing.place`, a key and a name: a gym, a Power Spot, a stop, a train's stop by `placeKeyOfStop`; review fix F5), else "Here" (a battle at a pin beside a gym's raid). Plan 8M-15 heads it with the tapped place and groups by its key ("Several things at one place" above).
   - S5: "Hatched", "Egg", "Ended".
   - S11: `keepTools(panel, wanted)`, above.
   - S16: Escape closes every report and change form as its Cancel does, the popup or card under it left open (`escapeCancels`, `form-escape.ts`): the raid's report and Change…, max, spawn, research, Rocket, the meetup's form and editor, a new train, and the post's forms. Route mode keeps its own Escape, which ends a drag.
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 9591f886..caa431b7 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -442,6 +442,12 @@ export interface MapMeetupPlace {
   lat: number;
   lon: number;
   gymId: number | null;
+  /**
+   * The place it is at by the key the map's things at one place have (plan 8M-15: `gym:<id>`,
+   * `stop:<key>` as the reports at stops key a stop, `spot:<Wayfarer id>`) and its title as it
+   * was named; null for a pin. The list of the things at one place groups by it.
+   */
+  at: { key: string; name: string } | null;
 }
 
 /** The tiers of max battles, as `MaxTier` spells them: Dynamax 1 to 5 stars, Gigantamax. */
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 60cc08a4..544da9c7 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -494,7 +494,14 @@ describe('partyView', () => {
     });
     const [shown] = partyView(input([atGym])).meetups;
     expect(shown).toMatchObject({
-      place: { kind: 'gym', words: 'At Old Stone Fountain', lat: 40.06, lon: -80.06, gymId: 2 },
+      place: {
+        kind: 'gym',
+        words: 'At Old Stone Fountain',
+        lat: 40.06,
+        lon: -80.06,
+        gymId: 2,
+        at: { key: 'gym:2', name: 'Old Stone Fountain' },
+      },
       // As written: the page sets it as text.
       info: 'Bring **snacks** <@1>\nand cups.',
       // Alice made it and is signed up: every change, the start too.
@@ -512,6 +519,7 @@ describe('partyView', () => {
       lat: 40.08,
       lon: -80.08,
       gymId: null,
+      at: null,
     });
     // Not the maker: nothing to change, but for staff, who may not set a start unless signed up.
     expect(atPin?.panel).toBeNull();
@@ -535,6 +543,25 @@ describe('partyView', () => {
       }),
     });
     expect(partyView(input([nearStop])).meetups[0]?.place?.words).toBe('Near Market Fountain');
+    // Plan 8M-15: a PokéStop or Power Spot by the key the map's places have (`stop:<key>`,
+    // `spot:<Wayfarer id>`), so that the list of things at one place groups the meetup with it.
+    const known = (kind: 'stop' | 'powerspot', id: string) =>
+      posted({
+        ...testMeetup({
+          place: { kind, id, title: 'Mural', lat: 40.08, lon: -80.08, address: null, image: null },
+        }),
+      });
+    expect(partyView(input([known('stop', 'abc.16')])).meetups[0]?.place?.at).toEqual({
+      key: 'stop:abc.16',
+      name: 'Mural',
+    });
+    expect(partyView(input([known('stop', 'pine-3')])).meetups[0]?.place?.at?.key).toBe(
+      'stop:pine-3',
+    );
+    expect(partyView(input([known('powerspot', 'def.16')])).meetups[0]?.place?.at).toEqual({
+      key: 'spot:def.16',
+      name: 'Mural',
+    });
   });
 
   it('names nobody: no reporter, maker, attendee or their ids, whatever their privacy', () => {
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index ac128003..a75257ac 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -459,12 +459,26 @@ export function meetupPlaceOf(place: MeetupParty['meetup']['place']): MapMeetupP
         : place.linkName !== null
           ? `At ${place.linkName} (a pin)`
           : 'At a dropped pin';
-    return { kind: 'pin', words, lat: place.lat, lon: place.lon, gymId: null };
+    return { kind: 'pin', words, lat: place.lat, lon: place.lon, gymId: null, at: null };
   }
   const gymId = place.kind === 'gym' && /^\d+$/u.test(place.id) ? Number(place.id) : null;
-  return { kind: place.kind, words: `At ${place.title}`, lat: place.lat, lon: place.lon, gymId };
+  return {
+    kind: place.kind,
+    words: `At ${place.title}`,
+    lat: place.lat,
+    lon: place.lon,
+    gymId,
+    at: { key: `${MEETUP_PLACE_KEYS[place.kind]}:${place.id}`, name: place.title },
+  };
 }
 
+/**
+ * The prefix of a place's key on the map by its kind (plan 8M-15), as the page's things at one
+ * place key theirs: a gym's dot and raids `gym:`, a stop's reports `stop:`, a Power Spot's battle
+ * and a train's stop there `spot:`.
+ */
+const MEETUP_PLACE_KEYS = { gym: 'gym', stop: 'stop', powerspot: 'spot' } as const;
+
 /**
  * The editor of a meetup on the map as the member may use it (plan 8M-5M): its maker and staff
  * (`mayEditMeetup`), the start only signed up (`mayArrange`, as `/meet`); none while read-only.
diff --git a/src/web/client/find.test.ts b/src/web/client/find.test.ts
index 518715a1..135953f8 100644
--- a/src/web/client/find.test.ts
+++ b/src/web/client/find.test.ts
@@ -110,7 +110,7 @@ const meetup = (id: string, name: string, words: string): MapMeetup => ({
   endTime: null,
   link: 'https://discord.com/channels/1/4',
   attendance,
-  place: { kind: 'pin', words, lat: 40.43, lon: -79.95, gymId: null },
+  place: { kind: 'pin', words, lat: 40.43, lon: -79.95, gymId: null, at: null },
   info: null,
   panel: null,
 });
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 9a566b7d..df3358a6 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1811,6 +1811,13 @@ path.highlighted {
   font-size: 13px;
 }
 
+/* "Also nearby" over the things only near the tapped place (plan 8M-15). */
+.place-list .also-nearby {
+  margin-top: 6px;
+  color: var(--muted);
+  font-size: 13px;
+}
+
 .region-label {
   padding: 1px 5px;
   background: var(--label-bg);
diff --git a/src/web/client/meetup-forms.test.ts b/src/web/client/meetup-forms.test.ts
index 77506976..5e4c8be1 100644
--- a/src/web/client/meetup-forms.test.ts
+++ b/src/web/client/meetup-forms.test.ts
@@ -85,7 +85,14 @@ const MEETUP: MapMeetup = {
     remote: { offered: false, on: false },
     count: false,
   },
-  place: { kind: 'gym', words: 'At The Stacks', lat: 40.05, lon: -80.05, gymId: 1 },
+  place: {
+    kind: 'gym',
+    words: 'At The Stacks',
+    lat: 40.05,
+    lon: -80.05,
+    gymId: 1,
+    at: { key: 'gym:1', name: 'The Stacks' },
+  },
   info: 'Bring snacks.',
   panel: { start: true },
 };
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index dd061776..4b37b79f 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -645,7 +645,14 @@ describe('trainPopup and meetupItem', () => {
     // buttons; Directions to its point.
     const placed: MapMeetup = {
       ...meetup,
-      place: { kind: 'gym', words: 'At The Stacks', lat: 40.05, lon: -80.05, gymId: 1 },
+      place: {
+        kind: 'gym',
+        words: 'At The Stacks',
+        lat: 40.05,
+        lon: -80.05,
+        gymId: 1,
+        at: { key: 'gym:1', name: 'The Stacks' },
+      },
       info: 'Bring <b>snacks</b>.\nAnd cups.',
     };
     const extras = [{ tag: 'button', text: 'Edit…' }];
@@ -665,7 +672,14 @@ describe('trainPopup and meetupItem', () => {
     ]);
     const pin: MapMeetup = {
       ...placed,
-      place: { kind: 'pin', words: 'At a dropped pin', lat: 40.08, lon: -80.08, gymId: null },
+      place: {
+        kind: 'pin',
+        words: 'At a dropped pin',
+        lat: 40.08,
+        lon: -80.08,
+        gymId: null,
+        at: null,
+      },
     };
     expect(texts(meetupPopup(pin, context))[1]).toBe('At a dropped pin');
     expect(meetupItem(placed, context).tag).toBe('li');
diff --git a/src/web/client/party-layer-draw.isolated.test.ts b/src/web/client/party-layer-draw.isolated.test.ts
index 45655ada..4eb7aa97 100644
--- a/src/web/client/party-layer-draw.isolated.test.ts
+++ b/src/web/client/party-layer-draw.isolated.test.ts
@@ -1765,7 +1765,7 @@ describe('the reports at stops on the map (plan 8M-9B)', () => {
       link: 'https://discord.com/channels/1/2/7',
       attendance: attendance(),
       postKey: null,
-      place: { kind: 'pin', words: 'At a pin', lat: 40.452, lon: -79.96, gymId: null },
+      place: { kind: 'pin', words: 'At a pin', lat: 40.452, lon: -79.96, gymId: null, at: null },
       info: null,
       panel: null,
     };
@@ -1964,7 +1964,14 @@ describe('the reports at stops on the map (plan 8M-9B)', () => {
       link: 'https://discord.com/channels/1/2/6',
       attendance: attendance(),
       postKey: null,
-      place: { kind: 'stop', words: `At ${at.name}`, lat: at.lat, lon: at.lon, gymId: null },
+      place: {
+        kind: 'stop',
+        words: `At ${at.name}`,
+        lat: at.lat,
+        lon: at.lon,
+        gymId: null,
+        at: { key: `stop:${at.key}`, name: at.name },
+      },
       info: null,
       panel: null,
     };
@@ -1979,11 +1986,58 @@ describe('the reports at stops on the map (plan 8M-9B)', () => {
     expect(
       list?.querySelectorAll('button[data-open]').map((choice) => choice.dataset.open),
     ).toEqual(['stop:stop-5', 'meetup:m1']);
+    // Plan 8M-15: the meetup is at the stop by its key, so the list is headed with the stop's
+    // name and has no "Also nearby".
+    expect(list?.querySelector('strong.name')?.textContent).toBe(at.name);
+    expect(list?.querySelectorAll('span.also-nearby').map((one) => one.textContent)).toEqual([]);
     // Alone at its stop: its own popup.
     markerOf('Yellow Mural 7')?.fire('click', {});
     expect(fake.shown.popupOf).toBe(markerOf('Yellow Mural 7'));
   });
 
+  // Plan 8M-15 (design 1): a gym's dot names its place, so its list is headed with the gym and
+  // its raid and meetup come before what is only near it.
+  it("heads a gym dot's list with the gym, its meetup first, then Also nearby", async () => {
+    const library = GYMS.get(1);
+    if (!library) throw new Error('the test gym');
+    const meetupAt = (id: string, lon: number, gymId: number | null): MapMeetup => ({
+      kind: 'meetup',
+      id,
+      name: id === 'm1' ? 'Picnic' : 'Walk',
+      startTime: null,
+      endTime: null,
+      link: 'https://discord.com/channels/1/2/6',
+      attendance: attendance(),
+      postKey: null,
+      place: {
+        kind: gymId === null ? 'pin' : 'gym',
+        words: 'At it',
+        lat: library.lat,
+        lon,
+        gymId,
+        at: gymId === null ? null : { key: `gym:${String(gymId)}`, name: library.name },
+      },
+      info: null,
+      panel: null,
+    });
+    const { raids } = await started({
+      raids: true,
+      // A pin's walk a pixel off the gym, then the gym's picnic.
+      parties: view({
+        meetups: [meetupAt('m2', library.lon + 1 / 10_000, null), meetupAt('m1', library.lon, 1)],
+      }),
+    });
+    raids.gymTapped(library, () => undefined);
+    const list = fake.placeList.at(-1) as PageElement | undefined;
+    expect(list?.querySelector('strong.name')?.textContent).toBe(library.name);
+    expect(
+      list
+        ?.querySelector('div.choices')
+        ?.childNodes.map((one) => one.dataset.open ?? one.textContent),
+      // The dot's own choice, the gym's raid and its meetup; the pin's walk only near it.
+    ).toEqual(['gym-dot:1', 'gym:1', 'meetup:m1', 'Also nearby', 'meetup:m2']);
+  });
+
   // Review F10: the pick lists asked for as a filter opens, each time (the browser asks again by
   // their ETag), a failed answer not kept for good.
   it("asks for the pick lists each time a layer's filter opens, after a failure too", async () => {
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index fc4e978d..5fa39222 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -1800,7 +1800,12 @@ export function showParties(
         picture: null,
         name: meetup.name,
         time: startWords(meetup.startTime, now, readerZone()),
-        ...(gym ? { place: { key: `gym:${String(gym.id)}`, name: gym.name } } : {}),
+        // At a gym as the map has it now; at a PokéStop or Power Spot by its key (plan 8M-15).
+        ...(gym
+          ? { place: { key: `gym:${String(gym.id)}`, name: gym.name } }
+          : place.at === null
+            ? {}
+            : { place: place.at }),
       });
     }
     trainLines = [];
@@ -2417,6 +2422,8 @@ export function showParties(
       picture: null,
       name: gym.name,
       time: 'Gym',
+      // The list heads with the gym and lists what is at it first (plan 8M-15).
+      place: { key: `gym:${String(gym.id)}`, name: gym.name },
     };
     const here = sharedPlace(target, [target, ...shownThings()], toPixel);
     if (here.length <= 1) own();
diff --git a/src/web/client/shared-place.test.ts b/src/web/client/shared-place.test.ts
index 3d170317..9041f834 100644
--- a/src/web/client/shared-place.test.ts
+++ b/src/web/client/shared-place.test.ts
@@ -62,7 +62,7 @@ describe('several things at one place (plan 8M-7)', () => {
       ...(one.children ?? []).flatMap(words),
     ];
     expect(words(node)).toEqual([
-      'Here',
+      'Nearby',
       'Schenley Fountain · Level 5 raid',
       '12m',
       'Oakland loop',
@@ -71,24 +71,72 @@ describe('several things at one place (plan 8M-7)', () => {
     expect(JSON.stringify(node)).toContain('https://x.test/a.png');
   });
 
-  // Plan 8M-11A (S4): headed with the place's name (the gym's, Power Spot's or stop's).
-  // Review fix F5: only where every thing listed is at that same place (a gym, a stop, a Power
-  // Spot); a pin's beside a gym's is "Here".
-  it("is headed with the place's name where every thing is at it, else Here", () => {
-    const heading = (things: PlacedThing[]) => placeListNode(things).children?.[0]?.text;
-    const fountain = { place: { key: 'gym:7', name: 'Schenley Fountain' } };
-    expect(heading([thing('meetup:m1', fountain), thing('gym:7', fountain)])).toBe(
+  /** The list's lines in order: its heading, then each choice's name or the label between. */
+  const lines = (things: PlacedThing[]): string[] => {
+    const [heading, choices] = placeListNode(things).children ?? [];
+    return [
+      heading?.text ?? '',
+      ...(choices?.children ?? []).map((child) =>
+        child.tag === 'button' ? (child.children?.[1]?.text ?? '') : `[${child.text ?? ''}]`,
+      ),
+    ];
+  };
+  const fountain = { place: { key: 'gym:7', name: 'Schenley Fountain' } };
+
+  // Plan 8M-15 (design 1): headed with the tapped place's name, the things at it first, then
+  // "Also nearby" over the rest in the order given.
+  it("is headed with the tapped place's name, its things first, then Also nearby", () => {
+    expect(
+      lines([
+        thing('gym-dot:7', { ...fountain, name: 'Schenley Fountain' }),
+        thing('meetup:m1', { name: 'Picnic' }),
+        thing('gym:7', { ...fountain, name: 'Level 5 raid' }),
+        thing('max:x1', { name: 'Machamp', place: { key: 'spot:w1', name: 'Mural' } }),
+        thing('train:t1', { ...fountain, name: 'Oakland loop' }),
+      ]),
+    ).toEqual([
+      'Schenley Fountain',
       'Schenley Fountain',
-    );
-    // A max battle at a pin beside the gym's raid.
-    expect(heading([thing('gym:7', fountain), thing('max:x1')])).toBe('Here');
+      'Level 5 raid',
+      'Oakland loop',
+      '[Also nearby]',
+      'Picnic',
+      'Machamp',
+    ]);
+  });
+
+  it('has no Also nearby label when everything listed is at the tapped place', () => {
     expect(
-      heading([
-        thing('gym:7', fountain),
-        thing('train:t1', { place: { key: 'gym:8', name: 'Schenley Fountain' } }),
+      lines([
+        thing('meetup:m1', { ...fountain, name: 'Picnic' }),
+        thing('gym:7', { ...fountain, name: 'Level 5 raid' }),
       ]),
-    ).toBe('Here');
-    expect(heading([thing('meetup:m1'), thing('meetup:m2')])).toBe('Here');
+    ).toEqual(['Schenley Fountain', 'Picnic', 'Level 5 raid']);
+  });
+
+  it("decides by the place's key, never by its name or distance", () => {
+    // Another gym of the same name, at the very same point, is only near it.
+    expect(
+      lines([
+        thing('gym:7', { ...fountain, name: 'Level 5 raid' }),
+        thing('train:t1', {
+          name: 'Oakland loop',
+          place: { key: 'gym:8', name: 'Schenley Fountain' },
+        }),
+      ]),
+    ).toEqual(['Schenley Fountain', 'Level 5 raid', '[Also nearby]', 'Oakland loop']);
+  });
+
+  it('is headed Nearby for a pin tapped, with no label', () => {
+    // A max battle at a pin beside the gym's raid: the pin has no place.
+    expect(
+      lines([thing('max:x1', { name: 'Machamp' }), thing('gym:7', { ...fountain, name: 'Raid' })]),
+    ).toEqual(['Nearby', 'Machamp', 'Raid']);
+    expect(lines([thing('meetup:m1'), thing('meetup:m2')])).toEqual([
+      'Nearby',
+      'meetup:m1',
+      'meetup:m2',
+    ]);
   });
 
   it('name when a train or meetup starts', () => {
diff --git a/src/web/client/shared-place.ts b/src/web/client/shared-place.ts
index d922c012..704e3205 100644
--- a/src/web/client/shared-place.ts
+++ b/src/web/client/shared-place.ts
@@ -27,8 +27,8 @@ export interface PlacedThing {
   time: string;
   /**
    * The place it is at (a gym, a Power Spot, a stop), by a key of its own (`gym:<id>`, `spot:<id>`,
-   * `stop:<key>`) and its name, which heads the list of the things there where all of them are at
-   * it (plan 8M-11A, S4, review fix F5); none for a pin.
+   * `stop:<key>`) and its name, which heads the list of the things there when it is the thing
+   * tapped, those at the same key listed first (plan 8M-15); none for a pin.
    */
   place?: { key: string; name: string };
 }
@@ -61,44 +61,63 @@ export function placeKeyOfStop(stop: string): string {
   return stop.startsWith('w') ? `spot:${stop.slice(1)}` : `gym:${stop}`;
 }
 
+/** The label over the things only near the tapped place on the screen (plan 8M-15). */
+export const ALSO_NEARBY = 'Also nearby';
+
+/** The heading of a list whose tapped thing is at no named place (a pin). */
+export const NEARBY = 'Nearby';
+
 /**
- * The popup that lists the things at one place: headed with the place's name where every one of
- * them is at that same place (review fix F5), else "Here"; a button for each, which opens its own
- * popup.
+ * The popup that lists the things at one place (plan 8M-15, design 1): headed with the name of
+ * the tapped place (the first thing's, `sharedPlace` puts it first); the things at that place
+ * (the same `place.key`, never by distance) first, then under "Also nearby" those only near it
+ * on the screen, each group in the order given. A tapped thing at no named place (a pin) heads
+ * the list "Nearby", without the label. A button for each, which opens its own popup.
  */
 export function placeListNode(things: readonly PlacedThing[]): PageNode {
-  const [first] = things;
-  const place =
-    first?.place !== undefined && things.every((thing) => thing.place?.key === first.place?.key)
-      ? first.place.name
-      : undefined;
+  const tapped = things[0]?.place;
+  const atPlace = (thing: PlacedThing): boolean =>
+    tapped !== undefined && thing.place?.key === tapped.key;
+  const here = tapped === undefined ? [...things] : things.filter(atPlace);
+  const near = tapped === undefined ? [] : things.filter((thing) => !atPlace(thing));
   return {
     tag: 'div',
     className: 'place-list',
     children: [
-      { tag: 'strong', className: 'name', text: place ?? 'Here' },
+      { tag: 'strong', className: 'name', text: tapped?.name ?? NEARBY },
       {
         tag: 'div',
         className: 'choices',
-        children: things.map((thing): PageNode => ({
-          tag: 'button',
-          className: 'place-choice',
-          attributes: { type: 'button', 'data-open': thing.key },
-          children: [
-            ...(thing.picture === null
-              ? [{ tag: 'span', className: 'picture none' }]
-              : [
-                  { tag: 'img', className: 'picture', attributes: { src: thing.picture, alt: '' } },
-                ]),
-            { tag: 'span', className: 'what', text: thing.name },
-            { tag: 'span', className: 'when', text: thing.time },
-          ],
-        })),
+        children: [
+          ...here.map(choiceNode),
+          ...(near.length === 0
+            ? []
+            : [
+                { tag: 'span', className: 'also-nearby', text: ALSO_NEARBY },
+                ...near.map(choiceNode),
+              ]),
+        ],
       },
     ],
   };
 }
 
+/** A thing's button in the list: its picture, name and time. */
+function choiceNode(thing: PlacedThing): PageNode {
+  return {
+    tag: 'button',
+    className: 'place-choice',
+    attributes: { type: 'button', 'data-open': thing.key },
+    children: [
+      ...(thing.picture === null
+        ? [{ tag: 'span', className: 'picture none' }]
+        : [{ tag: 'img', className: 'picture', attributes: { src: thing.picture, alt: '' } }]),
+      { tag: 'span', className: 'what', text: thing.name },
+      { tag: 'span', className: 'when', text: thing.time },
+    ],
+  };
+}
+
 /** When a train or meetup starts, in a line: `starts 6:15 PM`, `started`, `no start time`. */
 export function startWords(at: number | null, now: number, zone: string): string {
   if (at === null) return 'no start time';
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
index 2fe66565..47f625ca 100644
--- a/src/web/client/what-is-on.test.ts
+++ b/src/web/client/what-is-on.test.ts
@@ -120,7 +120,14 @@ const meetup = (id: string, more: Partial<MapMeetup> = {}): MapMeetup => ({
   endTime: null,
   link: 'https://discord.com/channels/1/4',
   attendance: attendance(7),
-  place: { kind: 'gym', words: 'At Schenley Fountain', lat: 40.44, lon: -79.95, gymId: 1 },
+  place: {
+    kind: 'gym',
+    words: 'At Schenley Fountain',
+    lat: 40.44,
+    lon: -79.95,
+    gymId: 1,
+    at: { key: 'gym:1', name: 'Schenley Fountain' },
+  },
   info: null,
   panel: null,
   ...more,
````

### Task 2: 8M-15 task 2: the popup's first line shares a row with the ×

Prototype commit: `f15aae3fabf80f150f4c105c088abc88ba7d3c23`

On a coarse pointer the content's margin-top gives way to one spacer
.leaflet-popup-content::before floated right, so the first line shares the row with the × and a
post's floated picture sits left of it. Popups whose root is a flex box (place-popup, stop-popup,
raid-form) and a post's form inside a party popup reserve the room on their first row instead,
so they keep their full width; the place list's choices clear the spacer. Fine pointers unchanged.

**Files:**

```
 docs/architecture/web.md        |   2 +-
 src/web/client/map.css          |  32 ++++++++++++--
 src/web/popup-close-row.test.ts | 138 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 168 insertions(+), 4 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/popup-close-row.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff f15aae3fabf80f150f4c105c088abc88ba7d3c23 -- src test scripts docs/architecture` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-15 task 2: the popup's first line shares a row with the ×`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 6db45c1f..25563314 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -267,7 +267,7 @@ Design `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md`, "8M-11A"; fin
 - **The notice band:** `#notice` (its text `#notice-text`, its × `#notice-close`) lies over the top of the map in `#content` (`position: absolute`). It keeps line breaks (`white-space: pre-line`, S17; the answer line too), goes away by itself after `NOTICE_MS` (10 s; a new line starts the time again) and at once by its × (`NoticeBand`, `say`, `hideNotice`). A lasting state has no timer (`say(text, { lasting: true })`, review fix F1): the map that could not be loaded, the editor read-only, the browser's storage full or keeping nothing. A timed line over a lasting one gives the lasting one back when its time is over (review fix R2); the × and `hideNotice` forget it.
 - **Small fixes:**
   - S2: the rings' pane is at 590.
-  - S3: on a coarse pointer the popup's and the card's × are `--tap-size` (44 px) square, and the popup's content starts under the popup's ×.
+  - S3: on a coarse pointer the popup's and the card's × are `--tap-size` (44 px) square, and the popup's content starts under the popup's ×. Plan 8M-15 (design 2): no longer under it: the content keeps Leaflet's margins and one spacer, `.leaflet-popup-content::before` floated right (`--tap-size` less Leaflet's 24 px right and 13 px top margins and the wrapper's 1 px), keeps the ×'s square clear in every kind of popup, so its first line (a post's title, the place list's heading, a form's or place's name) shares the row with the ×, a post's floated picture (`.post .beside`) stacks to the spacer's left, and no other control's tap area lies under the ×. The reserve is the first line's only (review R1-3): a box that makes its own formatting context would be narrowed beside a float for its whole height, so the place list's `.choices` clear it (`clear: right`, at their full width below the heading), and a popup whose root is a flex column (`.place-popup`, `.stop-popup`, `.raid-form` of the max and spawn forms), and a post's form (`.post-form`: Group…, Meet…, Report…, Delete…, the completion question, a train's Move…, Manage…, Split…; review N3), which `post-forms-ui.ts` puts in place of everything in the party's popup (`.party-popup > .post-form:first-child`), has no spacer (`:not(:has(…))`) but reserves the same room on its first row (`> :first-child`: `margin-right` and `min-height` the spacer's width and height; a post form's frame passes under the ×, no control does). Looked at in headless Chrome with touch emulation (`(pointer: coarse)` matching) and without. `src/web/popup-close-row.test.ts` reads it from the stylesheets. The phone card's own header is unchanged.
   - S4: several things at one place are headed with the place's name where every one of them is at that same place (`PlacedThing.place`, a key and a name: a gym, a Power Spot, a stop, a train's stop by `placeKeyOfStop`; review fix F5), else "Here" (a battle at a pin beside a gym's raid). Plan 8M-15 heads it with the tapped place and groups by its key ("Several things at one place" above).
   - S5: "Hatched", "Egg", "Ended".
   - S11: `keepTools(panel, wanted)`, above.
diff --git a/src/web/client/map.css b/src/web/client/map.css
index df3358a6..e21b9653 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1319,7 +1319,11 @@ path.highlighted {
 
 /*
  * A finger's × (plan 8M-11A, S3): on a coarse pointer the popup's and the card's × are 44 pixels
- * square, and the popup's content starts under the popup's.
+ * square. Plan 8M-15 (design 2): the popup's first line shares a row with the × instead of
+ * starting under it. One spacer floated right at the top of a popup's content reaches the ×'s
+ * square past Leaflet's margins (13 px above, 24 px right, and the wrapper's 1 px), so no first
+ * line runs under it, and a post's floated picture (`.post .beside`) stacks to its left; a popup
+ * whose root is a flex column reserves that room on its first row instead (review R1-3).
  */
 @media (pointer: coarse) {
   .leaflet-container a.leaflet-popup-close-button {
@@ -1329,8 +1333,30 @@ path.highlighted {
     line-height: var(--tap-size);
   }
 
-  .leaflet-popup-content {
-    margin-top: var(--tap-size);
+  .leaflet-popup-content:not(
+      :has(> :is(.place-popup, .stop-popup, .raid-form), > .party-popup > .post-form:first-child)
+    )::before {
+    content: '';
+    float: right;
+    width: calc(var(--tap-size) - 25px);
+    height: calc(var(--tap-size) - 14px);
+  }
+
+  /* Review R1-3: a popup whose root is a flex column (a Power Spot's or stop's popup, the max
+     and spawn forms) would be narrowed beside the spacer for its whole height; its first row
+     keeps the ×'s square clear instead. So does a post's form (review N3: Group…, Meet…,
+     Report…, Delete…, the completion question, a train's Move…, Manage…, Split…), which
+     `post-forms-ui.ts` puts in place of everything in the party's popup. */
+  .leaflet-popup-content > :is(.place-popup, .stop-popup, .raid-form) > :first-child,
+  .leaflet-popup-content > .party-popup > .post-form:first-child > :first-child {
+    margin-right: calc(var(--tap-size) - 25px);
+    min-height: calc(var(--tap-size) - 14px);
+  }
+
+  /* The place list's choices start below the spacer, at their full width (a flex box beside it
+     would be narrowed for its whole height). */
+  .place-list .choices {
+    clear: right;
   }
 
   .party-card .card-close {
diff --git a/src/web/popup-close-row.test.ts b/src/web/popup-close-row.test.ts
new file mode 100644
index 00000000..00d3fb01
--- /dev/null
+++ b/src/web/popup-close-row.test.ts
@@ -0,0 +1,138 @@
+import { readFileSync } from 'node:fs';
+import { createRequire } from 'node:module';
+import { describe, expect, it } from 'vitest';
+import { blockAt, clientSheet, cssPixels, themeTokens } from '../../test/support/stylesheets.js';
+
+/**
+ * The popup's × in a header row on a coarse pointer (plan 8M-15, design 2): the × keeps its 44
+ * pixels, and instead of pushing every popup's content below it, one spacer floated to the ×'s
+ * side at the top of the content keeps the first line clear of it, so that the first line (a
+ * post's title, the place list's heading, a form's title) shares the row with the ×, and a post's
+ * floated picture sits beside it. Read from Leaflet's stylesheet and the page's, as the browser
+ * reads them.
+ */
+
+/** Leaflet's stylesheet, which `map.css` imports first. */
+const LEAFLET = readFileSync(
+  createRequire(import.meta.url).resolve('leaflet/dist/leaflet.css'),
+  'utf8',
+).replace(/\/\*[\s\S]*?\*\//gu, '');
+
+/** The declarations of the rule of exactly `selector` in `css` (the first such rule), by name. */
+function ruleOf(css: string, selector: string): Map<string, string> | undefined {
+  for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/gu)) {
+    // Its selectors, a comma inside brackets (`:is(a, b)`) kept, white space made single.
+    const selectors = (rule[1] ?? '')
+      .split(/,(?![^(]*\))/u)
+      .map((one) => one.replace(/\s+/gu, ' ').replace(/\(\s/gu, '(').replace(/\s\)/gu, ')').trim());
+    if (!selectors.includes(selector)) continue;
+    return new Map(
+      [...(rule[2] ?? '').matchAll(/([a-z-]+)\s*:\s*([^;]+)/gu)].map((found) => [
+        found[1] ?? '',
+        (found[2] ?? '').trim(),
+      ]),
+    );
+  }
+  return undefined;
+}
+
+/** A length of Leaflet's `margin` shorthand: top, right, bottom, left in pixels. */
+function margins(value: string): { top: number; right: number } {
+  const [top = 0, right = top] = value.split(/\s+/u).map((one) => Number.parseFloat(one));
+  return { top, right };
+}
+
+describe("the popup's × on a coarse pointer (plan 8M-15)", () => {
+  const css = clientSheet('map.css');
+  const coarse = blockAt(css, /@media\s*\(pointer:\s*coarse\)/u);
+  const values = themeTokens();
+  const tap = cssPixels('var(--tap-size)', values);
+
+  it('keeps its 44 pixel tap area', () => {
+    const close = ruleOf(coarse, '.leaflet-container a.leaflet-popup-close-button');
+    expect(cssPixels(close?.get('width') ?? '0', values)).toBe(44);
+    expect(cssPixels(close?.get('height') ?? '0', values)).toBe(44);
+  });
+
+  it('no longer pushes the content below it', () => {
+    expect(ruleOf(coarse, '.leaflet-popup-content')?.get('margin-top')).toBeUndefined();
+  });
+
+  /**
+   * The popups whose root is a flex column (review R1-3): a box that makes its own block
+   * formatting context is narrowed beside a float for its whole height, so they reserve the room
+   * on their first row instead.
+   */
+  const FLEX_ROOTS = ['.place-popup', '.stop-popup', '.raid-form'];
+  const rootsList = FLEX_ROOTS.join(', ');
+  /**
+   * A post's form (Group…, Meet…, Report…, Delete…, the completion question, a train's Move…,
+   * Manage… and Split…; review N3): `post-forms-ui.ts` puts it in place of everything in the
+   * party's popup, as its only child.
+   */
+  const POST_FORM = '.party-popup > .post-form:first-child';
+  /** The spacer's width and height, as the stylesheet gives them. */
+  const spacerSize = () => {
+    const spacer = ruleOf(
+      coarse,
+      `.leaflet-popup-content:not(:has(> :is(${rootsList}), > ${POST_FORM}))::before`,
+    );
+    return {
+      spacer,
+      width: cssPixels(spacer?.get('width') ?? '0', values),
+      height: cssPixels(spacer?.get('height') ?? '0', values),
+    };
+  };
+
+  it('is kept clear by one spacer floated to its side at the top of every popup', () => {
+    const { spacer, width, height } = spacerSize();
+    expect(spacer?.get('content')).toBe("''");
+    // The × is at the top right of the popup (Leaflet's `right: 0`).
+    expect(ruleOf(LEAFLET, '.leaflet-container a.leaflet-popup-close-button')?.get('right')).toBe(
+      '0',
+    );
+    expect(spacer?.get('float')).toBe('right');
+    // With Leaflet's margins of the content and the wrapper's padding, the spacer reaches the
+    // ×'s whole square: no first line runs under it.
+    const leaflet = margins(ruleOf(LEAFLET, '.leaflet-popup-content')?.get('margin') ?? '');
+    const padding = Number.parseFloat(
+      ruleOf(LEAFLET, '.leaflet-popup-content-wrapper')?.get('padding') ?? '0',
+    );
+    expect(padding + leaflet.right + width).toBeGreaterThanOrEqual(tap);
+    expect(padding + leaflet.top + height).toBeGreaterThanOrEqual(tap);
+    // And no more than that: the first line keeps the rest of the row.
+    expect(width).toBeLessThanOrEqual(tap - leaflet.right);
+  });
+
+  // Review R1-3: the reserve is the first line's only.
+  it('reserves the first row of a flex popup, not beside it, as wide and high as the spacer', () => {
+    const { width, height } = spacerSize();
+    expect(width).toBeGreaterThan(0);
+    for (const root of FLEX_ROOTS) {
+      expect(['flex', 'grid'], root).toContain(ruleOf(css, root)?.get('display'));
+    }
+    const first = ruleOf(coarse, `.leaflet-popup-content > :is(${rootsList}) > :first-child`);
+    expect(cssPixels(first?.get('margin-right') ?? '0', values)).toBe(width);
+    expect(cssPixels(first?.get('min-height') ?? '0', values)).toBe(height);
+  });
+
+  // Review N3: a post's form sits inside the party's popup, not at the content's top.
+  it("reserves the first row of a post's form inside the party's popup, as wide and high as the spacer", () => {
+    const { width, height } = spacerSize();
+    expect(width).toBeGreaterThan(0);
+    expect(ruleOf(css, '.post-form')?.get('display')).toBe('flex');
+    const first = ruleOf(coarse, `.leaflet-popup-content > ${POST_FORM} > :first-child`);
+    expect(cssPixels(first?.get('margin-right') ?? '0', values)).toBe(width);
+    expect(cssPixels(first?.get('min-height') ?? '0', values)).toBe(height);
+  });
+
+  it("starts the place list's choices below the spacer, at their full width", () => {
+    expect(ruleOf(coarse, '.place-list .choices')?.get('clear')).toBe('right');
+  });
+
+  it("has a post's floated picture beside the spacer, not under it", () => {
+    // Both float right, the spacer first: the picture stacks to its left.
+    expect(ruleOf(css, '.post .beside')?.get('float')).toBe('right');
+    expect(ruleOf(css, '.post .beside')?.get('clear')).toBeUndefined();
+  });
+});
````

### Task 3: 8M-15 task 3: a train's stop badges on its line, counted from the train

Prototype commit: `001097a5ecf21b3f7cf001ee7ee23844d99ca111`

stopsAhead and arrivalNumbers in src/domain/party/stops-ahead.ts (no imports, so the page can
take them; train.ts uses and re-exports them), routeAhead's first stops from stopsAhead, its words
unchanged. MapTrain.stopsAhead from the server. Each number on the leg arriving at its stop (a
first stop: the leaving leg), at most half the leg away, numbers never overlapping; a leg that
cannot hold them falls back to the left of the stop. Arrowheads off the badges' half and clear of
the leaving stop's marker, from zoom 15. Dots in a pane above the badges (panes.ts), Report's
dimming pointed at it. "(next)" and "(in N stops)" in the popup's Route list.

**Files:**

```
 docs/architecture/trains.md                             |   2 +-
 docs/architecture/web.md                                |   8 +-
 src/domain/party/stops-ahead.test.ts                    |  59 +++++++++++
 src/domain/party/stops-ahead.ts                         |  62 ++++++++++++
 src/domain/party/train.ts                               |  65 ++++++------
 src/domain/web/party-data.ts                            |   8 ++
 src/domain/web/party-view.test.ts                       |   5 +
 src/domain/web/party-view.ts                            |  10 +-
 src/web/client/find.test.ts                             |   1 +
 src/web/client/gyms-ui.isolated.test.ts                 |  12 +++
 src/web/client/gyms-ui.ts                               |   3 +
 src/web/client/main.ts                                  |   9 +-
 src/web/client/map.css                                  |  19 ++--
 src/web/client/panes.ts                                 |  20 ++++
 src/web/client/parties.test.ts                          |   1 +
 src/web/client/party-layer-contextmenu.isolated.test.ts |  10 +-
 src/web/client/party-layer-draw.isolated.test.ts        |  65 ++++++++----
 src/web/client/party-layer.ts                           |  64 ++++++++----
 src/web/client/places-ui.isolated.test.ts               |  10 ++
 src/web/client/places-ui.ts                             |   4 +
 src/web/client/post-draw.test.ts                        |  32 +++++-
 src/web/client/post-draw.ts                             |  14 ++-
 src/web/client/train-forms.test.ts                      |   1 +
 src/web/client/train-line.test.ts                       | 190 ++++++++++++++++++++++++++++--------
 src/web/client/train-line.ts                            | 135 ++++++++++++++++++-------
 src/web/client/train-ui.isolated.test.ts                |   1 +
 src/web/client/what-is-on.test.ts                       |   1 +
 src/web/place-dot-pane.test.ts                          |  56 +++++++++++
 src/web/train-badge-taps.test.ts                        |   7 +-
 29 files changed, 704 insertions(+), 170 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/party/stops-ahead.test.ts src/domain/web/party-view.test.ts src/web/client/find.test.ts src/web/client/gyms-ui.isolated.test.ts src/web/client/parties.test.ts src/web/client/party-layer-contextmenu.isolated.test.ts src/web/client/party-layer-draw.isolated.test.ts src/web/client/places-ui.isolated.test.ts src/web/client/post-draw.test.ts src/web/client/train-forms.test.ts src/web/client/train-line.test.ts src/web/client/train-ui.isolated.test.ts src/web/client/what-is-on.test.ts src/web/place-dot-pane.test.ts src/web/train-badge-taps.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 001097a5ecf21b3f7cf001ee7ee23844d99ca111 -- src test scripts docs/architecture` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-15 task 3: a train's stop badges on its line, counted from the train`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index 839c80ff..5b599931 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -15,7 +15,7 @@ The third kind of party: a route of gyms and Power Spots, a kind (raids, Dynamax
 - What the commands do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs` for `/train`, `addStopAs` … `forgetRouteAs` for `/route`, `moveTrainAs` for the four moves, `setConductorAs`, `clearConductorAs`; `manageTrainAs` is Manage…'s Submit (plan 8M-8C: moved out of `move.ts`, so that the dialog and the map's form share it, with `manageRefusal`, `movedOnWords` and `splitRefusalFor`; the map's panel's `reverseRouteAs`, `setAtEndAs` and `setKindAs` are gone with that panel, and `TrainService.reverse`, `setAtEnd` and `setKind` with them)), answering a `TrainAnswer` in the command's words; the commands throw a refusal as a `UserError`, the live map answers it (plan 8M-5). Move… and Manage… answer in the commands' words too (plan 8X-G). `startTrainAs` makes the train with its start when one is given (the map's form: `TrainRequest.startTime`, `NewTimedParty.startTime`), so that its post and the new-train DM say it from the first; `notSignedUpWords(where)` is the clause `/train` and the map add for a maker not signed up. `setConductorAs` names the conductor it took over from by the caller's `ConductorNamer` (`DISCORD_CONDUCTOR`, `memberText`, on Discord; the map names nobody).
 - A movement is announced in one message that pings the signed-up members who allow `mentions` and `mentionsTrainStops`, never the mover, gathered for five seconds and worded by the gym the train started from and where it is when the message goes ("back" only when every step was Previous; nothing when it is where it started or the route was emptied; "going round again, back to …" or "turning back at …, on to …" when the last step went round the end or turned back and the train is where it took it: `Movement` kinds `round` and `turn`, `PendingMove.lastFrom`). A gym or a Power Spot is a stop only when it lies in a region of the train's server (`reaches`, `stopRegionsInGuild`).
 - What is said once a few seconds after the last change goes through `Gathered` (`src/services/gathered.ts`: `later(key, merge)`, `drop`, `flush`, with `fold(older, newer)` for an entry whose turn comes while another waits behind a slow send): the start of a timed party and a train's movement. The party services share `storedChange` (`src/services/party-change.ts`) for a change decided inside the store.
-- What a train does at the last stop of its route is `train.atEnd` (`TRAIN_AT_END`: `finish`, `loop`, `turn-back`; `TrainAtEnd`, `isTrainAtEnd` in `party.ts`), set by `/train`'s option `at-end` (default `finish`), Manage…'s menu (plan 8X-G; Manage… opens only for who may move the train and staff, so `setAtEnd`'s `mayArrange` matters for a dialog opened earlier and for saved routes; `setAtEnd`: for whoever may arrange the route, `mayArrange`, and staff, since it never moves the train nor un-finishes a route; the same mode is the same object; the line names the doer through `doer`) and a loaded saved route. A route of fewer than two stops finishes in every mode (`endMode`, exported since plan 8M-11B for the live map's `MapTrain.atEnd`, by which the map draws the line's arrowheads and a loop's closing leg). `destinationOf(party, move)` is where a move leaves the train (`route`, `stop`, `turn`, `skipped`): Next at the last stop finishes, goes to stop 0 (`turn: 'round'`) or stores the route reversed and goes to its index 1 (`turn: 'back'`); Skip goes round a loop (`(stop + 2) mod n`, three stops or more) and at the last stop of a turn-back to index 2 of the reversed route (refused at its second to last stop); Previous at stop 0 of a loop goes to the last stop, of the others is refused. A move that goes round or turns back is a movement and never finishes the route, and neither does removing the current last stop of a loop or turn-back train with two stops or more left (`removeStop`: a loop goes to stop 0, a turn-back train has the rest reversed and stands at its index 0); Finish finishes in every mode. `nextStop` and `turnAhead` say what Next does from where the train is. `reverseRoute(party, member, staff, from?, first?)` (`cannotReverse`: a loop at any stop, a route that finishes at its first or last stop; a finished route of either mode only when finished from its last stop, which starts it again there, else `reverse-finished-elsewhere`; never a turn-back or a route of one stop) puts the same gyms in the other order with the train at the same gym: no movement, Here stays Here, the mode stays, said in a line without a ping ("…, and starts again at X" for a restart). Reverse leaves `placeOf` as it was (except the restart of a finished route, which moves it from `end` to the gym), so Manage… (on Discord and on the map) also carries `first`, the gym the route began with (`route-changed` otherwise). The post's line of what lies ahead says the mode on a route of three stops or fewer (`, loops` / `, turns back at the end`, on two stops or more) and marks a stop past the end `(round again)` / `(turning back)`; after a turn or a Reverse the stops are numbered in their stored order. The words of the modes are `src/render/train-words.ts`.
+- What a train does at the last stop of its route is `train.atEnd` (`TRAIN_AT_END`: `finish`, `loop`, `turn-back`; `TrainAtEnd`, `isTrainAtEnd` in `party.ts`), set by `/train`'s option `at-end` (default `finish`), Manage…'s menu (plan 8X-G; Manage… opens only for who may move the train and staff, so `setAtEnd`'s `mayArrange` matters for a dialog opened earlier and for saved routes; `setAtEnd`: for whoever may arrange the route, `mayArrange`, and staff, since it never moves the train nor un-finishes a route; the same mode is the same object; the line names the doer through `doer`) and a loaded saved route. A route of fewer than two stops finishes in every mode (`endMode`, exported since plan 8M-11B for the live map's `MapTrain.atEnd`, by which the map draws the line's arrowheads and a loop's closing leg). `destinationOf(party, move)` is where a move leaves the train (`route`, `stop`, `turn`, `skipped`): Next at the last stop finishes, goes to stop 0 (`turn: 'round'`) or stores the route reversed and goes to its index 1 (`turn: 'back'`); Skip goes round a loop (`(stop + 2) mod n`, three stops or more) and at the last stop of a turn-back to index 2 of the reversed route (refused at its second to last stop); Previous at stop 0 of a loop goes to the last stop, of the others is refused. A move that goes round or turns back is a movement and never finishes the route, and neither does removing the current last stop of a loop or turn-back train with two stops or more left (`removeStop`: a loop goes to stop 0, a turn-back train has the rest reversed and stands at its index 0); Finish finishes in every mode. `nextStop` and `turnAhead` say what Next does from where the train is. `stopsAhead(length, stop, atEnd)` (plan 8M-15, pure, `atEnd` as `endMode` gives it; with `arrivalNumbers`, how many stops away each is, in `stops-ahead.ts`, a module of no import that the live map's page imports too, given on by `train.ts`) is the one list of what lies ahead: the indices of the route as stored now, in the order the train reaches them, until it has reached every stop once more (a train that finishes to its last stop; a loop round to the stop before the current one; a turn-back out to the last stop and back to the first, the current stop listed where it passes it again, since the turn stores the route reversed but the indices stay today's; nothing for a finished route or one of fewer than two stops). `routeAhead` takes its first stops from it, and the live map's `MapTrain.stopsAhead` is it (its badges and the Route list's "next" / "in N stops", `web.md`). `reverseRoute(party, member, staff, from?, first?)` (`cannotReverse`: a loop at any stop, a route that finishes at its first or last stop; a finished route of either mode only when finished from its last stop, which starts it again there, else `reverse-finished-elsewhere`; never a turn-back or a route of one stop) puts the same gyms in the other order with the train at the same gym: no movement, Here stays Here, the mode stays, said in a line without a ping ("…, and starts again at X" for a restart). Reverse leaves `placeOf` as it was (except the restart of a finished route, which moves it from `end` to the gym), so Manage… (on Discord and on the map) also carries `first`, the gym the route began with (`route-changed` otherwise). The post's line of what lies ahead says the mode on a route of three stops or fewer (`, loops` / `, turns back at the end`, on two stops or more) and marks a stop past the end `(round again)` / `(turning back)`; after a turn or a Reverse the stops are numbered in their stored order. The words of the modes are `src/render/train-words.ts`.
 
 ## The post, Move… and Manage…
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 25563314..d27c0a6b 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -48,7 +48,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **`/maps` names its region:** used in a region's channel or its forum (`regionChannelOf`), `/maps` puts the region's id in the map's address it shows (`/s/<guild>/map?region=<id>`) and in its login link (`LoginLinks.issue(…, 'map', region)`, `LinkHolder.region`); the link's POST redirects to `/s/<guild>/map?region=<id>` (an id of ours, never of the request); an expired link lands on the whole map (`?login=expired`).
 - **Your location** (`you-ui.ts`, `showWhereYouAre`; words in `your-location.ts`): "Show where I am", a round button with a crosshair (SVG of ours, `currentColor`) at the bottom right, asks the browser only when pressed (`watchPosition`, high accuracy), draws a blue dot (`--you`, edged `--you-edge`, drawn colors of `theme.ts`) with a circle of its accuracy, centers the map on it at street level or closer, and keeps it current while the page is open; pressed again it centers on the dot. Refused or unavailable: one line under the header (`locationRefusal`: "Your browser did not share your location.", "Your location is not available just now.", or "This browser cannot share your location with this page." where there is no geolocation or the page is not a secure context; browsers count `http://localhost` as one), nothing else. `onMove` tells the list each new fix.
 - **Layers** (`layer-registry.ts`, `LayerRegistry`): everything drawn is a layer the member toggles, registered with a name, whether it is on by default, live (a toggle of its own on the desktop) or background (under "More"), a line about it, members only (`membersOnly`) or waiting for data (`waits`), and how many of its things are in view (`setCount`, which the parts that draw it keep current at each `moveend` and draw). One call adds a layer (`register`; field research and Team GO Rocket came so with 8M-9B). The layers of `MAP_LAYERS`: Raids, and since plan 8M-9B Field research and Team GO Rocket after Meetups (below, "Reports at stops on the map's page"); Raids (max battles too since plan 8M-9A: the toggle keeps the name "Raids", since "Raids and max battles" broke the desktop's one row at 768 pixels; its line in the phone's sheet says "Bosses, eggs and max battles", and the list's group is "Raids and max battles"), Trains, Meetups (live, on), Wild spawns (off; it waits for data: no route lists spawns yet, so it is not offered until something calls `setOffered('spawns', true)`), Gyms (off since plan 8M-9A: the Report button's step 2 draws the gyms to pick from whatever the layer says; on until then, the controller's ruling of fix round 1 of 8M-7, while "Report raid" was in a gym's popup alone; a browser that kept the layer on keeps it on), PokéStops, Power Spots (off), Region outlines (on). The choice is kept per browser, one for every server (`localStorage` `pine-map-layers`, `{ id: boolean }`, read and written in try/catch; a value that is no boolean is ignored, a layer the browser kept nothing of takes its default). The controls (`layers-ui.ts`): on the desktop a row in the header (`<nav id="layers">` of the template) with the live layers as labelled toggles (`aria-pressed`, a dot of the layer's color) and the background ones as checkboxes under "More" (a `<details>`); narrower than 1024 pixels (`map.css`; 768 until plan 8M-9B, B7, provisional: five live toggles, "Research" and "Rocket" short in the row with their names in the sheet and the toggle's title, fit from 1024) a "Layers · n" button (`layersButtonLabel`, n the offered layers on) that opens a bottom sheet listing every offered layer with its line, how many are in view ("4 in view", `inViewWords`) and a switch (a checkbox `role="switch"`), Done and a tap on the scrim closing it; the sheet is a modal dialog for the keyboard (`SheetFocus`: `aria-modal`, the focus moved to its first switch, Tab and Shift+Tab kept inside it (from its last control to its first and back, and from outside it in: 8M-7 review fix 9), Escape closes it, the focus given back to the button), each switch named by its layer (`switchLabel`, `aria-label`), and "More" closes on Escape and on a click outside it (`moreCloses`). Logged out (or not a member), only Gyms and Region outlines are offered (`offered(spec, member)`; plan 8M-13, L1: every other layer, Wild spawns too, is `membersOnly`, since the server gives a visitor nothing but `/api/geo`); the controls are drawn anew once `/api/me` answers (`refresh`).
-- **What each layer draws:** the parties' popups and markers as before (`party-layer.ts`), now in a group per layer (`raids`, `trains`, `meetups`) put on and taken off the map by the registry; the regions' outlines with their labels (`main.ts`; the labels on a pane of their own, `region-labels`, at 350 under the overlay pane of the outlines and of the gyms', stops' and spots' circles and under every marker (round 2), taking no clicks, in 12 px type, so that a name never covers a raid or a gym); the gyms (`gyms-ui.ts`, `showGymDots`) at every zoom, by Pine's grid clustering below zoom 16 (`cluster.ts`, `clustersAt`, `CLUSTER_BELOW`: the places of one cell of a grid fixed on the world are one cluster, the cell 60 pixels from zoom 15, 90 at 13 and 14, 120 at 12 and below (`cellPixels`, plan 8M-11B), drawn as a circle with its count at the middle of its places, `.cluster`, `--cluster`; a tap zooms in on it, at least two zooms and at most to 16; Leaflet.markercluster's last release is from 2020); what is drawn is worked out for the view and half its size round it (`wantedDots`, `DOTS_MARGIN`; keyed `gym:<id>` and `cluster:<zoom>:<cell>`, plan 8M-11B) and only the difference touched at each move, list or change (`planDots`: a cluster whose gyms changed changes its count and place in place, one no longer wanted gives its marker to a new one, the rest is added or taken off): the gym whose popup is open is never taken off nor clustered while it is open (fix round 1); which gyms are drawn is `shownGyms` (`gym-dots.ts`): every gym while the Gyms layer is on, or while a gym is to be clicked (route mode, a meetup's place picked, the Report button's step 2 of a raid: `MapRaids.forced`, the gyms drawn anew after each draw of the parties), and while "Find a gym" holds a word only those it matches, on the same terms: while the layer is on or a gym is to be clicked, none while the Gyms layer is off, shown again when it is turned on while the word stands (plan 8M-13, L2; Enter fits the map to them and opens the one gym's popup once the map rests); the PokéStops and Power Spots of the view (`places-ui.ts`, `showPlaces`) for a member from zoom 16 (`placesWanted`, `PLACES_FROM`) through `/api/stops` and `/api/powerspots`, asked at once when wanted and again 300 ms after the map rests (`PlacesInView` over `StopLoads`: only the last question's answer shown, nothing after they are no longer wanted), small dots of `--stop` and `--power-spot` with the name in a popup (a Power Spot's popup also offers "Report max battle here" since plan 8M-9A, below, "Max battles on the map"; a spot whose battle is drawn is left out, `unoccupied`, drawn again from the last answer as the parties change, `ShownPlaces.redrawn`; while the Report button's step 2 picks them they are drawn whatever the layer, `placesWanted`'s `forced`, `MapRaids.forcedPlaces`), and "more than shown" in one quiet line at the bottom left of the map ("Zoom in to see every PokéStop here.", `MORE_THAN_SHOWN`, `quietLine`). Live things never cluster.
+- **What each layer draws:** the parties' popups and markers as before (`party-layer.ts`), now in a group per layer (`raids`, `trains`, `meetups`) put on and taken off the map by the registry; the regions' outlines with their labels (`main.ts`; the labels on a pane of their own, `region-labels`, at 350 under the overlay pane of the outlines and the trains' lines (400), the trains' stop badges (`train-badges`, 420) and the gyms', stops' and spots' dots (`place-dots`, 430, plan 8M-15; the Report button's step 2 dims and rings them there), and under every marker (round 2), taking no clicks, in 12 px type, so that a name never covers a raid or a gym); the gyms (`gyms-ui.ts`, `showGymDots`) at every zoom, by Pine's grid clustering below zoom 16 (`cluster.ts`, `clustersAt`, `CLUSTER_BELOW`: the places of one cell of a grid fixed on the world are one cluster, the cell 60 pixels from zoom 15, 90 at 13 and 14, 120 at 12 and below (`cellPixels`, plan 8M-11B), drawn as a circle with its count at the middle of its places, `.cluster`, `--cluster`; a tap zooms in on it, at least two zooms and at most to 16; Leaflet.markercluster's last release is from 2020); what is drawn is worked out for the view and half its size round it (`wantedDots`, `DOTS_MARGIN`; keyed `gym:<id>` and `cluster:<zoom>:<cell>`, plan 8M-11B) and only the difference touched at each move, list or change (`planDots`: a cluster whose gyms changed changes its count and place in place, one no longer wanted gives its marker to a new one, the rest is added or taken off): the gym whose popup is open is never taken off nor clustered while it is open (fix round 1); which gyms are drawn is `shownGyms` (`gym-dots.ts`): every gym while the Gyms layer is on, or while a gym is to be clicked (route mode, a meetup's place picked, the Report button's step 2 of a raid: `MapRaids.forced`, the gyms drawn anew after each draw of the parties), and while "Find a gym" holds a word only those it matches, on the same terms: while the layer is on or a gym is to be clicked, none while the Gyms layer is off, shown again when it is turned on while the word stands (plan 8M-13, L2; Enter fits the map to them and opens the one gym's popup once the map rests); the PokéStops and Power Spots of the view (`places-ui.ts`, `showPlaces`) for a member from zoom 16 (`placesWanted`, `PLACES_FROM`) through `/api/stops` and `/api/powerspots`, asked at once when wanted and again 300 ms after the map rests (`PlacesInView` over `StopLoads`: only the last question's answer shown, nothing after they are no longer wanted), small dots of `--stop` and `--power-spot` with the name in a popup (a Power Spot's popup also offers "Report max battle here" since plan 8M-9A, below, "Max battles on the map"; a spot whose battle is drawn is left out, `unoccupied`, drawn again from the last answer as the parties change, `ShownPlaces.redrawn`; while the Report button's step 2 picks them they are drawn whatever the layer, `placesWanted`'s `forced`, `MapRaids.forcedPlaces`), and "more than shown" in one quiet line at the bottom left of the map ("Zoom in to see every PokéStop here.", `MORE_THAN_SHOWN`, `quietLine`). Live things never cluster.
 - **Raid markers** (`raid-marker.ts`, frame B of the mockups): a circle centered on the gym, named for a screen reader by the lead raid's `heading` (the marker's `title`, 8M-7 review fix 9) (`raidMarkerNode`, drawn as an element of ours in a `divIcon`, `raidIcon`, 44 pixels): the post's picture (the boss, or the egg of its tier before it hatches) in a ring of its tier group's color (`MapRaid.tierGroup`, made by the domain's `raidTierGroup` of `src/domain/pogo/raid-tier.ts`: `1`, `3`, `5`, `mega` for Mega, Mega Legendary and Super Mega, `elite`, `shadow` for every shadow raid; `tierColour` names `--tier-<group>`; `raid-marker-tiers.test.ts` holds `theme.css` and `map.css` to every group of `RAID_TIER_GROUPS`), a time badge under it (`badgeFor`: "12 min", "1 h 05" while it runs (`durationWords`' compact form, plan 8M-11A), "hatches 2:40" before the hatch, the posts' time by `clockTime` with AM or PM left out today only, "hatches Wed, Oct 14, 2:00 PM" another day; "Egg" or "Hatched" where nobody said when, "Ended" by `stageAt` (capitalized since plan 8M-11A, S5)), and a green count of those going (`MapAttendance.going`, made by the domain's `goingCount` of `party.ts`: the committed heads of the whole party, coming, here and asked whether done, +1s counted, the lobbies' own rule that `lobbyCount` shares; none at zero). Raids shrink as the map zooms out and are still never grouped (Matt, 2026-10-25; `markerSize`): from zoom 15 the full marker (`--raid-full`, 44 px, with its badge and count), at 14 a smaller circle with the count and no badge (`--raid-middle`, 30 px), at 13 and below a small circle with the boss picture in its ring and no badge or count (`--raid-small`, 20 px); sizes are named values of `theme.css`, read by `theme().sizes` for what Leaflet draws; the tap target is never under 32 pixels (`tapBox`, a clear margin round a small circle), the train's and meetup's rings round a raid scale with its circle (`ringSizes(circle)`), and a zoom into another size draws the parties anew. Nearly over, it is dimmed (`isDimmed`: hatched by the clock, `stageAt` of `src/domain/party/raid-stage.ts`, which `raidStage` reads raids through, and `endsSoon` of `src/domain/time/ending-soon.ts`, the five minutes `/max`'s ending-soon question asks by: one rule). The page keeps badges and dimming current every 15 s from the times on the marker (`data-stage`, `data-hatch`, `data-end`; `markerNow`, by the same rules as at the draw), an egg turning into its time left as it hatches. One source for every fact (Matt, 2026-10-25): what the page shows or decides of a party is computed by the domain code the Discord side uses, sent with the list or imported from a pure module of `src/domain/` that imports nothing (`raid-stage.ts`, `ending-soon.ts`), never a second implementation; only the words are the page's. A gym with a raid shows the raid, not its gym dot, while the Raids layer is on (`hiddenGyms`, `MapRaids.raidGyms`); off, the dot is back. Trains and meetups keep their drawing (rings, a line), restyled; at a gym whose raid circle is drawn, their rings go round it rather than over the boss (`ringSizes`: the train's just outside the 44-pixel circle, radius 26, the meetup's outside the train's, radius 31; the old sizes elsewhere, and again when the Raids layer is off). A gym of several raids is drawn by one lead raid, the first with a picture, else the first (`leadRaid`): picture, ring, badge and count are all that raid's. A raid is named everywhere on the map (its popup, the list, the list of things at one place) in its post's own heading words, `MapRaid.heading` (`raidLook` over the renderer's `headlineParts`: `Level 5 raid against Yveltal`, `Level 5 raid (egg)`, without the shiny mark; the tier's words where the renderer gave none), and its popup reads its stage by the clock (`stageAt`), not the list's `stage`.
 - **Several things at one place** (`shared-place.ts`): when more than one shown thing sits at the same place (the same gym, or within 12 pixels at the current zoom, `sharedPlace`, `SHARED_PIXELS`; a raid marker, a max battle's marker (the raids' layer, plan 8M-9A: at its Power Spot, whose own dot it replaces, or at its pin), a train's ring, a meetup's ring, and a gym's dot tapped where parties share it, `MapRaids.gymTapped`), a tap on any of them opens one popup listing each (`placeListNode`: picture, name, time: the lead raid's `heading` and badge, a battle's `title` and badge, a train's or meetup's `startWords`), and a choice (`data-open`) opens that thing's own popup as before. Plan 8M-15 (design 1, Matt 2026-10-29: a near neighbor is easily tapped by mistake on a phone): the list is headed with the name of the tapped place (the first thing's `PlacedThing.place`; a gym's dot tapped carries `gym:<id>` and the gym's name), the things at that place (the same `place.key`, never by distance: its raid or battle, a train whose current stop it is, a meetup at it, the dot's own choice) first, then the small muted label "Also nearby" (`ALSO_NEARBY`, `span.also-nearby`) over the rest in the order given; no label when every thing is at the place; a tapped thing at no named place (a pin: no key) heads it "Nearby" (`NEARBY`) without the label. A meetup at a PokéStop or Power Spot groups by `MapMeetupPlace.at` (below). Which things are listed at all is `sharedPlace`'s as before; the Power Spots' and stops' own popups (`places-ui.ts`) and the attendance word "Here" are unchanged. A layer turned off takes its things out, and the overlap with them. This replaces the tap on a ring's line of the 8S-4 staging: the rings still take clicks on their line alone, but a tap on what they ring lists them.
 - **The list of what is on** (`what-is-on.ts`, pure; drawn by `list-ui.ts`, `WhatIsOn`; plan 8M-7, replacing the side panel "Meetups and other parties"): on the desktop the side pane on the right (`#parties`, "What is on"), under the trains' box; on a phone the header's "List" button (`#list-button`, `body.list-open`) swaps the map for it and back (its words say what a press shows next, "List" or "Map", with no `aria-pressed` beside them: 8M-7 review fix 9). It holds every live thing the layers on show across the whole server, not only what is in view (`listLines`: raids and, since plan 8M-9A, max battles in one group, "Raids and max battles", a battle named by its post's `title`, Soonest by its end, its key `max:<id>`; trains, meetups; wild spawns once a route lists them), grouped by kind in that order, each group headed with its count (`listGroups`: "Raids and max battles · 5"), under "What's going on · n" (`LIST_HEADING`, plan 8M-11A, S22; the logged-out pane and the pane's `aria-label` too). A line (`lineWords`, a button): the picture (a ring of the kind's color without one), the name (`raidName`, a train's or meetup's), the place (a raid's gym, as the map has it or as its post names it; a train's `stopLine`; a meetup's words), the distance (from your location, else the map's middle; none without a place), the time ("30 min left" by `timeLeft` over `durationWords`, plan 8M-11A; "hatches 2:40 PM", `startWords`), "4 going" (`MapAttendance.going`); dimmed in a raid's last minutes (`isDimmed`). Sort, kept per browser (`localStorage` `pine-map-sort`, try/catch, `readSort` / `writeSort`): Nearest (the default), Soonest (a raid's end, a train's or meetup's start; none last), Most going; ties by name, and what has no point at all last in its group whatever the sort. Tapping a line whose thing the map draws (its layer on) flies the map there (street level or closer) and opens its popup once the map rests (on a phone, back to the map first, `PartyFrame.showMap`); a thing the map does not draw (a train without a route or with none of its stops on the map, a raid at a gym the map does not show, a meetup without a place) shows its popup under its line instead (`detail`: `raidPopup`, `trainPopup` with its actions, `meetupPopup` with Edit…, as the side panel showed them). Hovering a line on the desktop highlights its marker (`highlighted`: a ring round a raid's circle, a thicker line for a ring). A form that opens in the side pane (the start form, route mode, a meetup's form or editor) is shown over the list, which comes back when it closes (`paneShows`). Drawn anew with each list and a change of sort; a move of the map, a change of layers and a new fix of your location (only sorted Nearest, and only once it moved more than 25 m, `fixRedraws`) draw it too, but never while a form holds: then once, when the form lets go (`ListRefresh`, fix round 1). A line shown with its popup under it is kept by its key (`WhatIsOn.kept`): drawn anew for a move, a fix or a change of layers, only its own words change and its popup (a group menu, a field) stays, the focus given back where it was (a control drawn anew is found again by its tag and `data-` attributes, `sameControl`: a line's button by `data-key`, its line's key, the sort by `data-sort`; a control with no `data-` attribute is not looked for, so the focus never jumps to the first line, 8M-7 review fix 2); drawn from a new list (`show`), its popup is drawn anew from it (counts, "You:", buttons), the group chosen in its menu kept while that group is still offered and the focus given to the control of the same kind (round 2); a change form opened in such a line takes the hold with its `alive` (`FormHold.take(…, alive)`), so that the hold lets go whenever the form goes away (`checkGone`, after each drawing of the list and with each new list). Whether a form of the pane's box holds is recomputed as a form takes the hold or lets it go (`FormHoldDeps.changed`, `asideHeld`); on a phone such a form, which needs the map (route mode, a meetup's place picked, any form of the box), shows the map with the pane docked under it, 40% of the screen, whatever "List" says (`body.form-docked`). The phone's header is one row: the title, Layers, List, a "Find" button that opens "Find a gym" over the map (`#search-button`, `body.search-open`; Escape closes it, and closing it empties it, so that no word filters the map unseen) and the account (the member's name, cut to fit, its menu holding Log out; logged out, the login says "Log in" with the buttons' smaller padding, its two wordings spans of which `map.css` shows one, while the pane's own button keeps "Log in with Discord": 8M-7 review fix 4, `src/web/phone-header.test.ts`), none of them wrapping; what the header says beside the account goes under it. Tried at staging on a phone: List swaps the map for the list and back, a tap on a line returns to the map at the thing, a form of the pane docks under the map. The list ends with "Official meetups: Campfire" (`officialMeetupsLine`, a node through `renderNode`, the link `CAMPFIRE_DISCOVER_URL` in a new tab with `rel="noopener noreferrer"`; plan 8V-1, the Campfire links design) while the Meetups layer is offered (`LayerRegistry.isOffered`); the logged-out pane (a visitor, or somebody logged in who does not count as a member) shows it always, whatever the layers offer, since Campfire's meetups are public (plan 8M-13, L1: `loggedOutPane(…, true)` in `main.ts`). Pine never fetches anything from Campfire. Logged out, the pane says "Log in to see what is on." with "Log in with Discord" (or how to log in with `/maps`); logged in without counting as a member, "Only members of this server see what is on." (`loggedOutPane`).
@@ -82,7 +82,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("A party's
   | Meet… | `panel` `meet` | Meet…'s form (plan 8M-8B), which asks the server what it offers (`GET …/meet`) and says its refusal in the line under the buttons; off while read-only |
   | Move… | `panel` `moves` | Move…'s form (plan 8M-8C, R1), the post's dialog as the list carries it (`MapTrain.moves`): where the train is, Next, Previous and Skip in the dialog's words; else why not, as the server decides and words it and sends it with the train (`MapTrain.moveRefusal`: the reason, `moveRefusalOf`: the commands' `mayNotMove`, `not-conductor` or `not-attending`, and `no-route`, `read-only`; review N1; and its text, `refusalOnTheMap`: the words Discord says before Move… and Manage… open, `manageRefusal`'s, "This train has a conductor: only they and the moderators can move it.", "You are not signed up for this train.", without a route `/route add`'s "This train has no route yet. …", while read-only `UNREACHABLE`; plan 8M-8C, review C1), the page only saying it (`whyNot`), never wording a refusal itself |
   | Manage… | `panel` `manage` | Manage…'s form (plan 8M-8C), the post's dialog as the server gives it when it opens (`GET …/manage`), for who may move the train and staff, also on a train without a route (its kind alone), as the server decides it and sends it with the train (`MapTrain.mayManage`, `mayManageOf`: the dialog's own rule, `manageRefusal`'s `mayNotMove`, never while read-only; the page offers Manage… by it alone, in the post and in the train's own summary; branch review B2); else why not, the same words as Move…'s (`MapTrain.moveRefusal`). The conductor's buttons are the member's part, not Manage…'s (R2) |
-  | Route | `panel` `route` | shows the stop list, the train's stop marked, and what lies ahead as the post's small print words it (`MapTrain.ahead`, R3); route mode is the member's part's "Edit route", once (review C8) |
+  | Route | `panel` `route` | shows the stop list, the train's stop marked, each stop ahead with how far away its next arrival is, `(next)`, `(in 3 stops)` (plan 8M-15, Q1: the map's list only, as the badges number them, `arrivalNumbers` over `MapTrain.stopsAhead`; the Discord post, its "Next:" and `/route` unchanged), and what lies ahead as the post's small print words it (`MapTrain.ahead`, R3); route mode is the member's part's "Edit route", once (review C8) |
   | −1, +1 | `press` `less`, `more` | the map's press (plan 8M-8B, `MAP_COUNTS`), off unless `attendance.count` (never while read-only) |
   | Split… | `panel` `split` | Split…'s form (plan 8M-8C), the dialog the member would be shown, as the server gives it when it opens (`GET …/split`), or its refusal in the line under the buttons; off while read-only |
   | Screenshot feedback | `screenshot` | "Reported from a screenshot · feedback on Discord →" in its place, the post's link (Matt's ruling: feedback stays on Discord) |
@@ -135,7 +135,7 @@ Brief `.superpowers/sdd/2026-10-27-phase-8m8c-train-controls/design.md` (its "Af
 ## Trains on the map (plan 8M-5)
 
 - **One code path per command** (spec 3.5, 3.7): what `/train`, the `/route` subcommands, `/next`, `/previous`, `/skip`, `/finish` and `/conductor` do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs`, `addStopAs`, `removeStopAs`, `moveStopAs`, `clearRouteAs`, `saveRouteAs`, `loadRouteAs`, `forgetRouteAs`, `moveTrainAs`, `setConductorAs`, `clearConductorAs`; `TrainAnswer`: `ok`, `refused` with the service's reason, `gone`), in the command's words; the commands throw a refusal as a `UserError` and reply with the text, the map answers them. The map's Move…, Manage… and Split… are the post's dialogs, over their Submits' own functions (`moveTrainAs`, `manageTrainAs`, `splitGroupAs`; plan 8M-8C, below). The web server is given what the commands read and call (`TrainWebDeps.ctx`, `TrainWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
-- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop, what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `moves` (plan 8M-8C, R1: Move… as the post's dialog draws it, `moveForm` of `src/render/train-dialogs.ts` through `movesOnTheMap`, `src/web/train-views.ts`, given to the pure view as `PartyViewInput.trainMoves`: where the train is, `placeOf`; the dialog's text in the map's words; "Where to" and the moves `offeredMoves` makes, each with where it leads, `targetOf`, its label and the line under it; none for who may not move the train, a train without a route, or while read-only, `trainMovesOf`), `ahead` (plan 8M-8C, R3: what lies ahead as the post's small print says it, `aheadText` over `aheadLine`, `PartyViewInput.trainAhead`; the page words no turning or looping of its own), `moveRefusal` (why the member may not move it, with the words of Discord's refusal, `refusalOnTheMap`: Move…'s and Manage…'s line), `mayManage` (whether Manage… opens, `mayManageOf`; branch review B2); `route` the stops' keys and `spots` the Power Spots of the route Pine keeps with their names and places (`PartyViewInput.spotOf`, plan 8X-4), which the line, the ring, route mode's numbers and the popup (`<title> (Power Spot)`, Directions) go through; `trainKind` and `trainKindWords` (plan 8X-5: what it goes to, as `TRAIN_KIND_WORDS` names it, `Max Battle Train`; not `kind`, which says that the party is a train); `atEnd` (plan 8M-11B: what it does at the last stop as the domain applies it, `endMode` of `train.ts`: a route under two stops finishes whatever its mode); and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The kind and the mode are Manage…'s (below, "A train's dialogs as forms"). The route is the version of the route (below). Nothing of it while read-only.
+- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop (and since plan 8M-15 `stopsAhead`, the indices of the route ahead in the order the train reaches them, `stopsAhead` of `train.ts`), what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `moves` (plan 8M-8C, R1: Move… as the post's dialog draws it, `moveForm` of `src/render/train-dialogs.ts` through `movesOnTheMap`, `src/web/train-views.ts`, given to the pure view as `PartyViewInput.trainMoves`: where the train is, `placeOf`; the dialog's text in the map's words; "Where to" and the moves `offeredMoves` makes, each with where it leads, `targetOf`, its label and the line under it; none for who may not move the train, a train without a route, or while read-only, `trainMovesOf`), `ahead` (plan 8M-8C, R3: what lies ahead as the post's small print says it, `aheadText` over `aheadLine`, `PartyViewInput.trainAhead`; the page words no turning or looping of its own), `moveRefusal` (why the member may not move it, with the words of Discord's refusal, `refusalOnTheMap`: Move…'s and Manage…'s line), `mayManage` (whether Manage… opens, `mayManageOf`; branch review B2); `route` the stops' keys and `spots` the Power Spots of the route Pine keeps with their names and places (`PartyViewInput.spotOf`, plan 8X-4), which the line, the ring, route mode's numbers and the popup (`<title> (Power Spot)`, Directions) go through; `trainKind` and `trainKindWords` (plan 8X-5: what it goes to, as `TRAIN_KIND_WORDS` names it, `Max Battle Train`; not `kind`, which says that the party is a train); `atEnd` (plan 8M-11B: what it does at the last stop as the domain applies it, `endMode` of `train.ts`: a route under two stops finishes whatever its mode); and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The kind and the mode are Manage…'s (below, "A train's dialogs as forms"). The route is the version of the route (below). Nothing of it while read-only.
 - **Starting a train** `POST /s/<guild>/api/trains`, body `{ region, name, time?, atEnd?, kind? }` (strict: any region of the server by id, as `/api/geo` lists it; the name up to `/train`'s 80 characters, blanks allowed so that they are refused in its words; the start as `/meet` takes it, up to 40; the mode as `/train`'s `at-end`; the kind as its `kind`, plan 8X-5, a raid train without one). Before the body is read (`onRequest`): 60 a minute per address (`TRAIN_WRITES_PER_ADDRESS_MINUTE`, shared by every write of trains) and `postGuard`. Then the session (403) and the body (400); who starts it (`actingOnTheMap`); the region (of this server, else 404, whatever the id); its forum (none: 422 in `/train`'s words, the region named `#name`, `Region <id>` without a channel; `barred` 403; Discord unreachable 503); what `/train`'s guard and `/meet`'s reader refuse (a blank name 422 "Give a name of 1 to 80 characters."; a time that is none, read by `typedTimedTime` over `newPartyTimes('train', now)`, a party not made yet, 422 in its words); only then `/train`'s throttle in its window; then `startTrainAs` as the member (privacy and automatic status as `/train`), the train made with its start (`TrainRequest.startTime`, `NewTimedParty.startTime`, floored to the minute as `/meet` floors it), so that its post and the DM of who asked to hear of new trains say it from the first. The answer (`TrainAnswer`): 200 `{ ok: true, text: "Your train is made. It starts at 6:15 PM. Tap gyms or Power Spots on the map to add its stops.", train }`, and for a maker who is not signed up (automatic status None) `/train`'s clause after it (`notSignedUpWords`: "You are not signed up for it, as your /settings auto-status is None: sign up in its popup or its post to move the train or to be its conductor."); a region that lost its forum meanwhile 422. Logged `{ user, guild, region, outcome }`, "a train was started on the map".
 - **The route** `POST /s/<guild>/api/trains/<id>/route/<edit>`, edit `add` (`{ drawn, stop }`: the stop by its key, `stopKey`, plan 8X-4: a gym's id or `w<Wayfarer id>`; anything else 400, a stop of no region of the server 404; the route editor adds the gyms clicked; before 8X-4 the body was `{ drawn, gym }` with `drawn` the gyms' ids as numbers, and a page opened before the update keeps its old bundle, whose edits are refused as malformed, 400, and which draws no train line or ring (it looks the stop keys up as gym numbers, so every train is listed as unplaced), until the member reloads it: nothing reloads the page by itself), `remove` (`{ drawn, stop }`), `move` (`{ drawn, from, to }`), `clear` (`{ drawn }`), `save` (`{ drawn, name }`), `load` (`{ drawn, route }`), `forget` (`{ route }`): stops by their numbers from 1, as `/route` takes them; a saved route by the id the list gave it. **The version of the route** is the route itself: every edit but `forget` carries the route it was drawn from (`drawn`, the train's `route` as the page had it), and `TrainService` refuses it inside the store when the route is another by now (`routeDrawn`, reason `route-edited`, "The route changed meanwhile: here it is as it is now.", 409 with the train as it is now; a save is checked against the store's train before it writes); the commands give none, so they work as before. The order: the per-address limit, `postGuard` and an edit the map knows (404) before the body; the session and the body; who edits; an active train of this server as the store has it (anything else, a meetup's id among them, 409 "This train is over.", never read from the database); its forum (`barred` 403, unreachable 503); who may (`mayNotArrange` for add, remove and move, `mayNotClear` for clear, `mayNotLoad` for load: 403 in the command's words, "You are not signed up for this train.", with the train as the member sees it, who has passed its forum's access, so that the page draws the route editor again without the controls the member no longer has); a gym of a region of this server (`reaches`; any other id 404, so nobody learns of other servers' gyms); only then the subcommand's throttle in its window (`route add`, … `CHANGE_THROTTLE`); then its code path. 200 `ok`, 409 for `gone` and a press that no longer fits (`route-edited`, `route-changed`, `train-moved-on`, `conductor-changed`), 422 for any other refusal (`MAX_ROUTE_STOPS`, a gym on the route already, a saved route the member does not have); every answer of who may and of the code path but `gone` carries the train as the member sees it now (the 403 of who may too). The member's saved routes of the train's region `GET /s/<guild>/api/trains/<id>/routes` (members, as the pick lists; an active train of this server, 409 otherwise; its forum, 403, 503; 30 a minute per address): `{ routes: [{ id, name, stops, atEnd }] }`, as `/route load`'s list offers them. Logged `{ user, guild, party, edit, outcome }`, "a train's route was changed on the map", never a name.
 - **Moving** `POST /s/<guild>/api/trains/<id>/move/<press>`, press `next`, `previous`, `skip` (`{ from, target }`): Move…'s Submit (plan 8M-8C, R1), carrying where the form was drawn and where the move picked leads, as the dialog's custom id and choice carry them; the same checks in the same order, who may being `mayNotMove`, and the window of the post's controls (`ACTION_THROTTLE`, `controlThrottleKey(PARTY_KIND)`), as the dialog's Submit counts; then `moveTrainAs` with the surface `post` (the command's words, where the train is now, "I am telling the others."; of a finished route "Move… takes it back to stop 2: …", as the dialog says it), a move drawn where the train no longer is refused in the dialog's words (`movedOnWords`: "The train has moved on since you opened this: " and where it is now, 409 with the train). The old panel's presses `finish`, `reverse`, `at-end` and `kind` (plans 8M-5, 8X-5) answer 404 since plan 8M-8C: Finish, Reverse, the mode and the kind are Manage…'s, as on Discord, and a page of an older bundle gets 404 for them until it is reloaded (`reverseRouteAs`, `setAtEndAs`, `setKindAs`, `MapTrainRights.kind` and the surface `map` are gone). The movement message in the post pings as for any move. Logged "a train was moved on the map". **The conductor** `POST …/conductor/take` and `…/give-up` (body `{ who }`: `none`, `other` or `you`, whose the role was as the page drew the button, `CONDUCTOR_SEEN`): `/conductor set` and `/conductor clear` (`setConductorAs`, `clearConductorAs`); after the checks of every write, a button drawn when the role was another's than it is now 409 "The conductor of this train changed meanwhile: here it is as it is now." with the train (checked by the route against the store's train, not counted, and again inside the store, `conductorDrawn`, reason `conductor-changed`, for a change that was on its way meanwhile: `setConductorAs` and `clearConductorAs` pass `who` to the service), then a sign-up to take the role, the conductor or staff to drop it (403 in their words, with the train), in their windows. A takeover names nobody: "…, in the place of the conductor before." (`setConductorAs` takes a `ConductorNamer`; `/conductor set` passes `DISCORD_CONDUCTOR`, `memberText`). Logged "a train's conductor was changed on the map".
@@ -342,7 +342,7 @@ Design `docs/superpowers/specs/2026-10-28-find-design.md` (approved 2026-10-28;
 Design `docs/superpowers/specs/2026-10-29-pre-cutover-small-pass-design.md`, "Plan 8M-13"; findings T1, A1, A2, I1, L1, L2, O1 of the web fix pass's staging, S7 and S10 of the web polish's.
 
 - **A train's direction (T1):** the arrowheads are 24 pixels. The legs ahead carry a slow flow: one more polyline per train over the points of its legs ahead, weight 2, `interactive: false`, in the train's line group, of classes `train-flow train-flow-line`; a loop's closing leg (Leaflet's `8 8`) takes `train-flow` itself. `map.css` gives `.train-flow` its pattern (`--flow-dash`, `--flow-gap`) and the animation `train-flow` (`--flow-time`, 2.5 s, linear, endless: the offset from 0 to minus one period, so the loop does not jump and the dashes run toward the line's last point), and the flow line its color (`--train-flow`), all under `@media (prefers-reduced-motion: no-preference)`; elsewhere `.train-flow-line` is hidden and the closing leg keeps its still dashes. The train being routed is not drawn by the parties' draw, so it has no flow. Each flowing path starts in step with the clock (fix round 1, R1-3): once Leaflet made it (`add`), `inFlowStep` sets its `animationDelay` through the CSSOM to `flowDelay(Date.now())`, minus the clock's place in the cycle (`FLOW_CYCLE_MS`, 2,500, `--flow-time`'s, held to it by `train-flow.test.ts`; both in `train-flow.ts`, a module without the DOM's types), so the paths a draw of the parties makes anew go on where the old ones were. `src/web/train-flow.test.ts` reads the stylesheets (a period, the media query).
-- **A train picked at any stop ahead (S7):** `stopBadges` (`train-line.ts`, pure) gives a badge per listing after the stop each train is at, numbered by its place in the route from 1 (the current stop keeps the ring; a finished train, and the stops a loop has done, get none; a stop the map cannot place is passed over), the badges of one stop (listed twice, or ahead of several trains) side by side by `slot`. `badgeAnchor(slot, raidFull, badgeSize, tapSize)` sets each number (`.number`, `--badge-size`, 20 px, the train's color, the number white) to the left of its stop, clear of a raid's full marker (`--raid-full`) by `BADGE_GAP` (3), centered on it, further slots further out: their centers 35, 58, 81 … px left of the stop. Each number is laid out in the middle of a box (`--tap-size`, 44 px; fix round 1, R1-4), class `train-badge`, empty to the eye and centered on its number (fix round 2, R2-1). Only the number takes taps (review BR-1 of the small pass): the box's marker is an interactive `L.marker` in the marker pane, above the gyms', PokéStops' and Power Spots' dots, so `map.css` gives the box `pointer-events: none` (`.leaflet-marker-icon.train-badge`, as specific as Leaflet's `.leaflet-marker-icon.leaflet-interactive` and after it) and, while the badge is interactive, the number `auto` with a square `::after` of `--badge-tap-size` (32 px, a raid's `MIN_TAP`) centered on it; a tap there reaches Leaflet's click on the icon by bubbling, a tap on the rest of the box the place under it. That square's right edge lies 19 px left of the stop, clear of a gym's dot (8 px); it overlaps the left edge of a raid's or max battle's marker, which lies above it (`zIndexOffset` `BADGE_Z_OFFSET`, −1000) and keeps those taps. The squares of one stop's neighboring numbers overlap; there Leaflet's order of the markers decides. `party-layer.ts` draws them (`badgeMarker`) in a group of the trains' layer from `BADGE_MIN_ZOOM` (15) up, anew at every draw and every `zoomend` (`drawBadges`, beside `drawArrows`); a tap opens the train's popup (`route:<id>`, else `train:<id>`) where the badge is. They take no click while the trains let clicks through (route mode, a place picked): no `leaflet-interactive`, so the number takes none either. Tests: `train-line.test.ts`, `party-layer-draw.isolated.test.ts`, `party-layer-contextmenu.isolated.test.ts` (a click on the number through the real Leaflet's routing), `src/web/train-badge-taps.test.ts` (which part takes a tap, by Leaflet's and the page's stylesheets' cascade).
+- **A train picked at any stop ahead (S7):** `stopBadges` (`train-line.ts`, pure) gives a badge per stop ahead; since plan 8M-15 (design 3; Matt 2026-10-30, Q2) counted from the train: `MapTrain.stopsAhead` (the server's, `stopsAhead` of `train.ts`: a train that finishes to its end, a loop round to the stop before the current one, a turn-back out to the end and back to the start through its current stop) numbered by `arrivalNumbers` (`src/domain/party/stops-ahead.ts`, beside `stopsAhead`, which the page imports: no import of its own, review R1-5; 1 the next stop; one number per stop, its next arrival, so a turn-back train's numbers have gaps where it passes stops again; none on the current stop, which keeps the ring; every stop counted, also one the map cannot place, which gets no badge; a finished train none). Each badge carries `along`, the stop it arrives from (the last before it the map can place; where there is none, the next one it leaves for), and its `slot` on that leg (the numbers of one stop on one leg: a stop listed twice reached the same way, several trains). `badgeAnchor(slot, raidFull, badgeSize, tapSize, toward)` sets each number (`.number`, `--badge-size`, 20 px, the train's color, the number white) on the line, on the leg toward `along` as the map is zoomed now (`drawBadges` projects both), clear of a raid's full marker (`--raid-full`) by `BADGE_GAP` (3), centered on it, further slots further along: their centers 35, 58, 81 … px from the stop. A number stays on the stop's half of its leg (review R1-2: its center at most half the leg less half a number from the stop, so never on the stop it comes from): numbers never overlap (review N2): where the half does not hold all of a leg's `slots` numbers at their full spacing (23 px), or not even the first fits (a leg under about 90 px, as downtown at zoom 15) all of them lie left of the stop as before 8M-15, as without a leg on the screen. From the badges' zoom the leg's arrowhead keeps off that half and off the leaving stop's marker (`legArrows(…, badgeMarker)`, a raid's full marker; review N1): its center at `max(leg/4, marker/2 + BADGE_GAP + 12)` from the leaving stop, none where that is beyond `leg/2 − 12` or on a leg out and back (a loop of two stops). The badges' markers lie on a pane of their own, `BADGE_PANE` (`train-badges`, z 420: over the lines' overlay pane, 400), under `PLACE_DOT_PANE` (`place-dots`, z 430, made in `main.ts`; both constants in `src/web/client/panes.ts`), where the gyms', Power Spots' and PokéStops' dots and the places' larger targets are drawn, so a place's tap wins over a number on the line by it; the rings (590) and the markers (600) above both. Each number is laid out in the middle of a box (`--tap-size`, 44 px; fix round 1, R1-4), class `train-badge`, empty to the eye and centered on its number (fix round 2, R2-1). Only the number takes taps (review BR-1 of the small pass): the box's marker is an interactive `L.marker` (in the marker pane before plan 8M-15, above the places' dots then), so `map.css` gives the box `pointer-events: none` (`.leaflet-marker-icon.train-badge`, as specific as Leaflet's `.leaflet-marker-icon.leaflet-interactive` and after it) and, while the badge is interactive, the number `auto` with a square `::after` of `--badge-tap-size` (32 px, a raid's `MIN_TAP`) centered on it; a tap there reaches Leaflet's click on the icon by bubbling, a tap on the rest of the box the place under it. That square's near edge lies 19 px from the stop, clear of a gym's dot (8 px); it overlaps the edge of a raid's or max battle's marker, which lies above it (the marker pane over the badges' pane; `BADGE_Z_OFFSET` before plan 8M-15) and keeps those taps. The squares of one stop's neighboring numbers overlap; there Leaflet's order of the markers decides. `party-layer.ts` draws them (`badgeMarker`) in a group of the trains' layer from `BADGE_MIN_ZOOM` (15) up, anew at every draw and every `zoomend` (`drawBadges`, beside `drawArrows`); a tap opens the train's popup (`route:<id>`, else `train:<id>`) where the badge is. They take no click while the trains let clicks through (route mode, a place picked): no `leaflet-interactive`, so the number takes none either. Tests: `train-line.test.ts`, `party-layer-draw.isolated.test.ts`, `party-layer-contextmenu.isolated.test.ts` (a click on the number through the real Leaflet's routing), `src/web/train-badge-taps.test.ts` (which part takes a tap, by Leaflet's and the page's stylesheets' cascade).
 - **Visitors (L1, I1, L2):** a visitor's layers are Gyms and Region outlines alone (above, "Layers"; their "Layers · n" counts fewer; a member's stored choice is untouched). The visitor's side pane keeps Campfire's line whatever the layers offer (`loggedOutPane(…, true)` in `main.ts`; the members' list foot line still follows the Meetups layer). On a phone the not-a-member line and "Join the server on Discord" stack at the left, the button as wide as its words (`#account:has(a.invite) .line` left-aligned, the invite `margin-right: auto` on the row after the line's; `phone-header.test.ts`); the desktop's header is unchanged. `shownGyms` (`gym-dots.ts`): with "Find a gym"'s text, its matches while the Gyms layer is on or the view is forced (route mode, a meetup's place, Add stops…), else none; without text, every gym on the same terms. So Gyms off hides a search's matches, and on again shows them while the text stands; a word typed in "Find a gym" while the layer is off turns it on (fix round 1, Matt's A: `registry.set`, ticked in the layers' menu and kept as the member's choice; not while a gym is to be clicked), so a search always shows its matches; Enter fits the map to the matches drawn. A visitor's Gyms layer is still off by default.
 - **Find's misspellings (O1, Matt's A):** each place of `/api/find-places` carries `guess` (`FoundPlace.guess`, `placeFit`'s `guess`: found only by a misspelling); `mergePlaces` ranks a guess after every other fit, so guesses come last within a kind and the cap of ten drops them first. `foundGroups` (`find.ts`) shows the guesses only when Find found nothing else for the text (no report, no party, no place by its words), and "Places · n" counts what it shows: `rocket` gives the Rocket reports and no Hockey Rinks, `gible` the raid and no Bible places, `ansus hall` still finds Ansys Hall. Discord's lists are unchanged.
 - **Answers without Discord's list marks (A1):** `pageWords` writes the bot's list mark at the start of a line (`- ` or `* `, `LIST_MARK`) as a bullet, `• ` (fix round 1, R1-2: dropped, the items no longer read as a list), before the markdown and `unplain`, each item kept on its own line: a research report of several stops, Split…'s dialog text. A member's own mark arrives escaped (`\- `, `plain()`'s `bulletedList`) and stays as typed. Discord keeps its list. The notice band, the answer line and a form's answer (`.form-answer`) keep line breaks (`white-space: pre-line`; `src/web/answer-look.test.ts`).
diff --git a/src/domain/party/stops-ahead.test.ts b/src/domain/party/stops-ahead.test.ts
new file mode 100644
index 00000000..aa128d09
--- /dev/null
+++ b/src/domain/party/stops-ahead.test.ts
@@ -0,0 +1,59 @@
+import { describe, expect, it } from 'vitest';
+import { arrivalNumbers, stopsAhead } from './stops-ahead.js';
+
+// Plan 8M-15 (design 3): the stops ahead in the order the train reaches them, by their indices of
+// the route as it is stored now, until it has reached every stop of the route once more.
+describe('stopsAhead', () => {
+  it('runs to the end of a route that finishes', () => {
+    expect(stopsAhead(5, 1, 'finish')).toEqual([2, 3, 4]);
+    expect(stopsAhead(5, 4, 'finish')).toEqual([]);
+  });
+
+  it('goes round a loop to the stop before the current one', () => {
+    expect(stopsAhead(5, 2, 'loop')).toEqual([3, 4, 0, 1]);
+    expect(stopsAhead(5, 0, 'loop')).toEqual([1, 2, 3, 4]);
+    expect(stopsAhead(5, 4, 'loop')).toEqual([0, 1, 2, 3]);
+  });
+
+  it('turns back at the end, through the current stop, to the start', () => {
+    // At the first stop: out to the end; the way back reaches nothing new.
+    expect(stopsAhead(5, 0, 'turn-back')).toEqual([1, 2, 3, 4]);
+    // At the last stop: back to the start (the route is stored the other way once it turns).
+    expect(stopsAhead(5, 4, 'turn-back')).toEqual([3, 2, 1, 0]);
+    // Mid-route: out to the end, back through the stop it is at, on to the start.
+    expect(stopsAhead(5, 2, 'turn-back')).toEqual([3, 4, 3, 2, 1, 0]);
+    expect(stopsAhead(2, 0, 'turn-back')).toEqual([1]);
+  });
+
+  it('has nothing ahead of a finished train, a route of one stop or none', () => {
+    expect(stopsAhead(5, 5, 'loop')).toEqual([]);
+    expect(stopsAhead(5, 5, 'turn-back')).toEqual([]);
+    expect(stopsAhead(1, 0, 'finish')).toEqual([]);
+    // A route of one stop finishes in every mode.
+    expect(stopsAhead(1, 0, 'loop')).toEqual([]);
+    expect(stopsAhead(1, 0, 'turn-back')).toEqual([]);
+    expect(stopsAhead(0, 0, 'finish')).toEqual([]);
+  });
+});
+
+// Plan 8M-15 (design 3): one number per stop ahead, its next arrival counted from the train (1 is
+// the next stop), none on the current stop; the map's badges and its Route list count by it
+// (review R1-5: a fact of the domain).
+describe('arrivalNumbers', () => {
+  it('numbers each stop by its next arrival, the current stop and later arrivals left out', () => {
+    // A turn-back train at index 1 of five: 2, 3, 4, then back through 3, 2 and 1 to 0.
+    expect([...arrivalNumbers(stopsAhead(5, 1, 'turn-back'), 1)]).toEqual([
+      [2, 1],
+      [3, 2],
+      [4, 3],
+      [0, 7],
+    ]);
+    // A loop: every other stop once.
+    expect([...arrivalNumbers(stopsAhead(4, 1, 'loop'), 1)]).toEqual([
+      [2, 1],
+      [3, 2],
+      [0, 3],
+    ]);
+    expect([...arrivalNumbers([], null)]).toEqual([]);
+  });
+});
diff --git a/src/domain/party/stops-ahead.ts b/src/domain/party/stops-ahead.ts
new file mode 100644
index 00000000..1e5011be
--- /dev/null
+++ b/src/domain/party/stops-ahead.ts
@@ -0,0 +1,62 @@
+/*
+ * What lies ahead of a train in the order it travels (plan 8M-15, design 3), and how many stops
+ * away each stop is. Beside `train.ts`, which gives both on (`routeAhead` counts from them), in a
+ * module of no import, so that the live map's page takes it too (review R1-5: one path for the
+ * badges, the Route list and the post): `train.ts` and `party.ts` reach the times (Temporal) and
+ * the settings, even as types, which the page has none of.
+ */
+
+/**
+ * What a train does at the end of its route, as `TrainAtEnd` of `party.ts` spells it (not imported:
+ * see above). A mode added there and not here fails the typecheck where `train.ts` passes it in.
+ */
+type AtEnd = 'finish' | 'loop' | 'turn-back';
+
+/**
+ * The stops ahead of a train at index `stop` of a route of `length` stops whose mode at the end
+ * is `atEnd` (as `endMode` gives it), as indices of the route as it is stored now, in the order
+ * the train reaches them, until it has reached every stop of the route once more (plan 8M-15,
+ * design 3): a train that finishes to its last stop; one that loops round to the stop before the
+ * current one; one that turns back out to the last stop, then back (a turn stores the route the
+ * other way, but the indices stay those of now) to the first, passing the current stop on the way
+ * (listed, since the train stops there) unless it is the first. A stop listed twice in the route
+ * is two indices. Nothing for a finished route, a route of one stop or none. The post's "Next:"
+ * (`routeAhead`) and the map's badges and Route list (`MapTrain.stopsAhead`) count from it.
+ */
+export function stopsAhead(length: number, stop: number, atEnd: AtEnd): number[] {
+  if (length < 2 || stop < 0 || stop >= length) return [];
+  const last = length - 1;
+  const span = (from: number, to: number): number[] =>
+    from <= to
+      ? Array.from({ length: to - from + 1 }, (_none, at) => from + at)
+      : Array.from({ length: from - to + 1 }, (_none, at) => from - at);
+  switch (atEnd) {
+    case 'finish':
+      return stop === last ? [] : span(stop + 1, last);
+    case 'loop':
+      return [
+        ...(stop === last ? [] : span(stop + 1, last)),
+        ...(stop === 0 ? [] : span(0, stop - 1)),
+      ];
+    case 'turn-back':
+      if (stop === 0) return span(1, last);
+      if (stop === last) return span(last - 1, 0);
+      return [...span(stop + 1, last), ...span(last - 1, 0)];
+  }
+}
+
+/**
+ * Each stop ahead's number, by its index in the route (plan 8M-15, design 3; Matt 2026-10-30,
+ * Q2): how many stops away its next arrival is (1: the next stop), counted along `stopsAhead`
+ * (`MapTrain.stopsAhead`), every stop there counted, also the current one passed again and one
+ * the map cannot place; none for the current stop (`stop`, null once finished) nor for a later
+ * arrival at a stop already numbered. In the order of the arrivals. The live map's badges and its
+ * Route list's "next" / "in N stops".
+ */
+export function arrivalNumbers(ahead: readonly number[], stop: number | null): Map<number, number> {
+  const numbers = new Map<number, number>();
+  ahead.forEach((index, at) => {
+    if (index !== stop && !numbers.has(index)) numbers.set(index, at + 1);
+  });
+  return numbers;
+}
diff --git a/src/domain/party/train.ts b/src/domain/party/train.ts
index 25ca7ae2..f44c9068 100644
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -34,8 +34,12 @@ import {
   stopsByHandle,
   type StopRef,
 } from './stops.js';
+import { stopsAhead } from './stops-ahead.js';
 import { newTimedParty, settled, tidyName, type NewTimedParty } from './timed.js';
 
+// The stops ahead and their numbers (plan 8M-15) live where the map's page can take them too.
+export { arrivalNumbers, stopsAhead } from './stops-ahead.js';
+
 /**
  * What it takes to make a train: what any timed party takes, and what its maker has set for
  * the parties they start (Matt, 2026-10-13: a train follows privacy and auto-status as a raid
@@ -184,54 +188,51 @@ export function routeAhead(party: TrainParty): RouteAhead {
     return { kind: 'whole', route, current: finished ? undefined : stop, atEnd: mode };
   }
   if (finished) return { kind: 'finished' };
-  const at = (index: number, turn?: TrainTurn): StopAhead => {
-    const ref = route[index];
-    if (ref === undefined) throw new Error(`no stop ${index} on a route of ${length}`);
-    return { number: index + 1, stop: ref, ...(turn === undefined ? {} : { turn }) };
-  };
+  const ahead = stopsAhead(length, stop, mode);
   const last = length - 1;
+  /**
+   * The `count` first stops ahead (`stopsAhead`), each marked where the train got past the end
+   * to reach it: round a loop, or back at the turn.
+   */
+  const first = (count: number): StopAhead[] =>
+    ahead.slice(0, count).map((index, at) => {
+      const ref = route[index];
+      if (ref === undefined) throw new Error(`no stop ${index} on a route of ${length}`);
+      const before = at === 0 ? stop : (ahead[at - 1] ?? stop);
+      const turn: TrainTurn | undefined =
+        index >= before
+          ? undefined
+          : mode === 'loop'
+            ? 'round'
+            : before === last
+              ? 'back'
+              : undefined;
+      return { number: index + 1, stop: ref, ...(turn === undefined ? {} : { turn }) };
+    });
   switch (mode) {
     case 'finish':
       if (stop === last) return { kind: 'last-stop' };
-      if (stop + 2 >= last) {
-        const stops = stop + 2 === last ? [at(stop + 1), at(stop + 2)] : [at(stop + 1)];
-        return { kind: 'next', stops, then: 'last-stop' };
-      }
-      return {
-        kind: 'next',
-        stops: [at(stop + 1), at(stop + 2)],
-        rest: { count: last - stop - 2, toward: 'end' },
-      };
-    case 'loop': {
-      const ahead = [(stop + 1) % length, (stop + 2) % length];
-      return {
-        kind: 'next',
-        stops: ahead.map((index) => at(index, index === 0 ? 'round' : undefined)),
-        rest: { count: length - 3, toward: 'loop' },
-      };
-    }
+      if (ahead.length <= 2) return { kind: 'next', stops: first(2), then: 'last-stop' };
+      return { kind: 'next', stops: first(2), rest: { count: ahead.length - 2, toward: 'end' } };
+    case 'loop':
+      return { kind: 'next', stops: first(2), rest: { count: length - 3, toward: 'loop' } };
     case 'turn-back':
       if (stop === last) {
-        return {
-          kind: 'next',
-          stops: [at(last - 1, 'back'), at(last - 2)],
-          rest: { count: last - 2, toward: 'start' },
-        };
+        return { kind: 'next', stops: first(2), rest: { count: last - 2, toward: 'start' } };
       }
       if (stop === last - 1) {
+        // The second stop ahead is this one, on the way back.
         return {
           kind: 'next',
-          stops: [at(last)],
+          stops: first(1),
           then: 'back-here',
           rest: { count: stop, toward: 'start' },
         };
       }
-      if (stop === last - 2) {
-        return { kind: 'next', stops: [at(stop + 1), at(last)], then: 'turns-back' };
-      }
+      if (stop === last - 2) return { kind: 'next', stops: first(2), then: 'turns-back' };
       return {
         kind: 'next',
-        stops: [at(stop + 1), at(stop + 2)],
+        stops: first(2),
         rest: { count: last - stop - 2, toward: 'turn' },
       };
   }
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index caa431b7..ed5368b6 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -291,6 +291,14 @@ export interface MapTrain {
    * in its travel order, reversed when it turns, so the line's arrows follow `route` as it is.
    */
   atEnd: MapAtEnd;
+  /**
+   * The stops ahead (plan 8M-15, design 3), as indices of `route`, in the order the train reaches
+   * them until it has reached every stop once more (`stopsAhead` of `train.ts`: a loop round to the
+   * stop before the current one, a turn-back out to the end and back to the start, through the
+   * current stop); empty without a route and once finished. The map's badges and its Route list's
+   * "next" / "in N stops" count from it.
+   */
+  stopsAhead: number[];
   /**
    * What lies ahead, as the post's small print says it (plan 8M-8C, R3: `aheadText`, the turning
    * and looping words the server's), for the map's Route; null where the post says nothing.
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 544da9c7..a82713d3 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -427,6 +427,8 @@ describe('partyView', () => {
         spots: [],
         stop: 1,
         atEnd: 'finish',
+        // The stops ahead by their indices, as the domain counts them (plan 8M-15).
+        stopsAhead: [2],
         // What lies ahead is the caller's words (plan 8M-8C): none given here.
         ahead: null,
         link: `https://discord.com/channels/${GUILD}/700000000000000002`,
@@ -474,6 +476,9 @@ describe('partyView', () => {
     ]);
     const finished = { ...train, train: { ...train.train, stop: 3 } };
     expect(partyView(input([finished])).trains[0]?.stop).toBeNull();
+    expect(partyView(input([finished])).trains[0]?.stopsAhead).toEqual([]);
+    const turning = { ...train, train: { ...train.train, atEnd: 'turn-back' as const } };
+    expect(partyView(input([turning])).trains[0]?.stopsAhead).toEqual([2, 1, 0]);
   });
 
   it('shows a meetup at its place, with its information as written, and the editor for its maker and staff', () => {
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index a75257ac..108d6406 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -21,7 +21,14 @@ import {
 import { raidStage } from '../party/raid.js';
 import { PartyStatus } from '../party/status.js';
 import { timedOver } from '../party/timed.js';
-import { endMode, mayNotArrange, mayNotClear, mayNotLoad, mayNotMove } from '../party/train.js';
+import {
+  endMode,
+  mayNotArrange,
+  mayNotClear,
+  mayNotLoad,
+  mayNotMove,
+  stopsAhead,
+} from '../party/train.js';
 import { maxBossTitle, maxTierLabel } from '../pogo/max-tier.js';
 import { raidTierGroup, raidWords } from '../pogo/raid-tier.js';
 import type {
@@ -430,6 +437,7 @@ function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTra
     }),
     stop: stop < route.length ? stop : null,
     atEnd: endMode(party),
+    stopsAhead: stopsAhead(route.length, stop, endMode(party)),
     ahead: input.trainAhead?.(party) ?? null,
     link,
     attendance: attendanceOf(party, input, false),
diff --git a/src/web/client/find.test.ts b/src/web/client/find.test.ts
index 135953f8..4ad47974 100644
--- a/src/web/client/find.test.ts
+++ b/src/web/client/find.test.ts
@@ -91,6 +91,7 @@ const train = (id: string, name: string, route: string[]): MapTrain => ({
   spots: [{ key: 'wabc', name: 'Lake Gazebo', lat: 40.47, lon: -79.95 }],
   stop: 0,
   atEnd: 'finish',
+  stopsAhead: route.slice(1).map((_key, index) => index + 1),
   ahead: null,
   link: 'https://discord.com/channels/1/3',
   attendance,
diff --git a/src/web/client/gyms-ui.isolated.test.ts b/src/web/client/gyms-ui.isolated.test.ts
index 11ef25b7..4210b5a1 100644
--- a/src/web/client/gyms-ui.isolated.test.ts
+++ b/src/web/client/gyms-ui.isolated.test.ts
@@ -1,6 +1,7 @@
 import { afterEach, describe, expect, it, vi } from 'vitest';
 import { showGymDots, type GymDotsDeps } from './gyms-ui.js';
 import type { MapGym } from './popup.js';
+import { PLACE_DOT_PANE } from './train-line.js';
 
 /**
  * The gyms' layer (`showGymDots`, plan 8M-11B, S13) over a Leaflet of fakes that count what the
@@ -229,6 +230,17 @@ function shown(zoom: number, more: { on?: boolean; thins?: () => boolean; typed?
   return { dots, map, hidden, group, changes, type, refreshed, toggle, layer };
 }
 
+// Plan 8M-15: a train's stop badges lie on the line by a stop; the gyms' dots lie above them, so
+// their taps win.
+describe("the gyms' dots", () => {
+  it("are drawn on the pane above the trains' badges", () => {
+    const { group } = shown(17);
+    const dots = [...group.layers].filter((layer) => layer.options.className === 'gym-dot');
+    expect(dots.length).toBeGreaterThan(0);
+    for (const dot of dots) expect(dot.options.pane).toBe(PLACE_DOT_PANE);
+  });
+});
+
 describe("the gyms' clusters (plan 8M-11B, S13)", () => {
   // A guard rather than a change of behavior: the keys of plan 8M-7 were stable too while no gym
   // changed (review R3); it keeps the layer from drawing anything anew at a poll.
diff --git a/src/web/client/gyms-ui.ts b/src/web/client/gyms-ui.ts
index fc5415dd..95b9b43d 100644
--- a/src/web/client/gyms-ui.ts
+++ b/src/web/client/gyms-ui.ts
@@ -8,6 +8,7 @@ import type { RouteFocus } from './route-focus.js';
 import { stopName } from './train-forms.js';
 import { heldContent } from './raid-forms.js';
 import { onThemeChange, theme } from './theme.js';
+import { PLACE_DOT_PANE } from './train-line.js';
 
 /**
  * The gyms on the live map (plan 8M-7): the Gyms layer, drawn at every zoom and clustered below
@@ -73,6 +74,8 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
       fillOpacity: 0.8,
       // Ringed while the Report button's step 2 picks gyms (plan 8M-9A, `map.css`).
       className: 'gym-dot',
+      // Over the trains' stop badges, whose taps they win (plan 8M-15).
+      pane: PLACE_DOT_PANE,
     }).bindPopup(
       heldContent(
         () => {
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 2a2307a4..48df6e69 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -28,6 +28,7 @@ import { regionLabel, renderNode, type MapGym } from './popup.js';
 import { RouteFocus } from './route-focus.js';
 import { hiddenGyms } from './shared-place.js';
 import { onThemeChange, theme } from './theme.js';
+import { PLACE_DOT_PANE, PLACE_DOT_PANE_Z } from './train-line.js';
 import { BOUNDS_VISCOSITY, browserStorage, placeTheMap } from './view-ui.js';
 import { showWhereYouAre, type You } from './you-ui.js';
 
@@ -43,8 +44,9 @@ import { showWhereYouAre, type You } from './you-ui.js';
  */
 
 /**
- * The pane of the regions' names: under the overlay pane (400) of the outlines and of the gyms',
- * stops' and spots' circles, and under the markers (600): a name never covers a place (round 2).
+ * The pane of the regions' names: under the overlay pane (400) of the outlines, the pane of the
+ * gyms', stops' and spots' dots (`PLACE_DOT_PANE`, 430, plan 8M-15) and the markers (600): a name
+ * never covers a place (round 2).
  */
 const LABELS_PANE = 'region-labels';
 const LABELS_PANE_Z = 350;
@@ -331,6 +333,9 @@ function start(): void {
   const data = document.body.dataset;
   const guild = data.guild ?? '';
   const map = L.map(byId('map'), { maxBoundsViscosity: BOUNDS_VISCOSITY });
+  // The gyms', Power Spots' and PokéStops' dots over the trains' stop badges (plan 8M-15), made
+  // before any dot is drawn; Leaflet sets the pane's place by its style from the script.
+  map.createPane(PLACE_DOT_PANE).style.zIndex = String(PLACE_DOT_PANE_Z);
   addTiles(map, tileSetting(data.tiles), data.googleKey);
   // `?login=` taken out of the address at once, said once `/api/me` answers logged out (review
   // fix 5).
diff --git a/src/web/client/map.css b/src/web/client/map.css
index e21b9653..e2d8d8a7 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -966,18 +966,23 @@ body.editing-regions #map {
   stroke-width: 4px;
 }
 
-/* Everything drawn is dimmed but the places that fit (R1-7: the other places' dots too). */
+/*
+ * Everything drawn is dimmed but the places that fit (R1-7: the other places' dots too): the lines
+ * on the overlay pane, the places' dots on their own pane over the trains' badges (plan 8M-15,
+ * `PLACE_DOT_PANE`).
+ */
 .report-picking .leaflet-rings-pane,
 .report-picking .leaflet-overlay-pane path,
+.report-picking .leaflet-place-dots-pane path,
 .pick-gyms .max-icon,
 .pick-spots .raid-icon:not(.max-icon),
 .pick-spots .cluster {
   opacity: 0.35;
 }
 
-.pick-gyms .leaflet-overlay-pane path.gym-dot,
-.pick-spots .leaflet-overlay-pane path.spot-dot,
-.pick-stops .leaflet-overlay-pane path.stop-dot {
+.pick-gyms .leaflet-place-dots-pane path.gym-dot,
+.pick-spots .leaflet-place-dots-pane path.spot-dot,
+.pick-stops .leaflet-place-dots-pane path.stop-dot {
   opacity: 1;
 }
 
@@ -1003,7 +1008,7 @@ body.editing-regions #map {
 }
 
 /* A place's larger target to tap while it is picked (R1-10): clear, never dimmed or drawn. */
-.report-picking .leaflet-overlay-pane path.place-target {
+.report-picking .leaflet-place-dots-pane path.place-target {
   opacity: 0;
 }
 
@@ -2025,8 +2030,8 @@ path.highlighted {
 }
 
 /*
- * A train's stop ahead (plan 8M-13, S7): its number in the route on the train's color, beside the
- * stop (`badgeAnchor`), a tap opening the train's popup.
+ * A train's stop ahead (plan 8M-13, S7): how many stops away it is (plan 8M-15) on the train's
+ * color, on the line by the stop (`badgeAnchor`), a tap opening the train's popup.
  */
 .train-badge {
   /* A box of a finger's size, empty to the eye, the number laid out in its middle (fix round 1,
diff --git a/src/web/client/panes.ts b/src/web/client/panes.ts
new file mode 100644
index 00000000..38da3df8
--- /dev/null
+++ b/src/web/client/panes.ts
@@ -0,0 +1,20 @@
+/*
+ * The map's panes of plan 8M-15, by Leaflet's z-index (its overlay pane of the lines is 400, the
+ * rings' 590, its marker pane 600). No import and no DOM: the stylesheet tests read them too
+ * (`src/web/place-dot-pane.test.ts`), whose type check has no browser.
+ */
+
+/**
+ * The pane of the trains' stop badges: over the overlay pane (400) of the lines, so a number is
+ * drawn on its line, and under the pane of the places' dots (`PLACE_DOT_PANE`), the rings (590)
+ * and the markers (600), so that a gym's, a Power Spot's or a raid's tap wins.
+ */
+export const BADGE_PANE = 'train-badges';
+export const BADGE_PANE_Z = 420;
+
+/**
+ * The pane of the gyms', Power Spots' and PokéStops' dots and their larger targets: over the
+ * badges. Leaflet gives it the class `leaflet-place-dots-pane`, which `map.css` names.
+ */
+export const PLACE_DOT_PANE = 'place-dots';
+export const PLACE_DOT_PANE_Z = 430;
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index 4b37b79f..cc224f3b 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -562,6 +562,7 @@ describe('trainPopup and meetupItem', () => {
       spots: [],
       stop: 1,
       atEnd: 'finish',
+      stopsAhead: [2],
       ahead: null,
       link: LINK,
       attendance: attendance({ actions: [] }),
diff --git a/src/web/client/party-layer-contextmenu.isolated.test.ts b/src/web/client/party-layer-contextmenu.isolated.test.ts
index 19c64c1a..377a74a0 100644
--- a/src/web/client/party-layer-contextmenu.isolated.test.ts
+++ b/src/web/client/party-layer-contextmenu.isolated.test.ts
@@ -170,7 +170,15 @@ describe("a raid marker's name (review fix 9)", () => {
 // `src/web/train-badge-taps.test.ts`); the click on it reaches the badge's marker through the
 // icon Leaflet listens on, as the number's parent.
 describe("a tap on a train badge's number", () => {
-  const BADGE = { trainId: 't1', number: 3, lat: 40.43, lon: -79.93, slot: 0 };
+  const BADGE = {
+    trainId: 't1',
+    number: 3,
+    lat: 40.43,
+    lon: -79.93,
+    along: null,
+    slot: 0,
+    slots: 1,
+  };
   const SIZES = { marker: 44, box: 44, badgeSize: 20 };
 
   /** The badge's marker drawn on the routing map, and its number's element. */
diff --git a/src/web/client/party-layer-draw.isolated.test.ts b/src/web/client/party-layer-draw.isolated.test.ts
index 4eb7aa97..598c623c 100644
--- a/src/web/client/party-layer-draw.isolated.test.ts
+++ b/src/web/client/party-layer-draw.isolated.test.ts
@@ -25,6 +25,7 @@ import {
   caseStop,
   caseView,
 } from './stop-report-cases.js';
+import { BADGE_PANE, BADGE_PANE_Z, PLACE_DOT_PANE_Z } from './train-line.js';
 
 /**
  * `showParties` drawing a list of parties (plan 8M-9A, review B1 and B9) on a map of fakes: just
@@ -1144,6 +1145,7 @@ describe('a battle at a Power Spot and one at a pin on the map', () => {
     spots: [{ key: 'wspot-1', name: 'Lake Gazebo', lat: 40.45, lon: -79.94 }],
     stop,
     atEnd: 'finish',
+    stopsAhead: stop === 0 ? [1] : [],
     ahead: null,
     link: 'https://discord.com/channels/1/2/5',
     attendance: attendance(),
@@ -1259,16 +1261,28 @@ describe('a battle at a Power Spot and one at a pin on the map', () => {
       ],
       stop,
       atEnd: 'loop',
+      // Round the loop to the stop before (plan 8M-15).
+      stopsAhead:
+        stop === null
+          ? []
+          : ([
+              [1, 2],
+              [2, 0],
+              [0, 1],
+            ][stop] ?? []),
     });
 
     it('draws the legs done faint, those ahead as before, each with an arrowhead turned along it', async () => {
       await started({ raids: false, parties: view({ trains: [trainAt('t1', 0)] }) });
       expect(lines()).toEqual([{ points: 2, opacity: 0.8, dashed: false }]);
-      // Library to Lake Gazebo: north-east on the screen.
+      // Library to Lake Gazebo: north-east on the screen. At zoom 16 Lake Gazebo's badge holds
+      // the half by it (review R1-2 of plan 8M-15): the arrowhead on the leaving half, clear of
+      // the Library's marker (N1): 37 pixels along a leg of 100 by 90 on the screen.
       expect(arrows()).toHaveLength(1);
       const at = arrows()[0]?.getLatLng();
-      expect(at?.lat).toBeCloseTo(40.4455, 9);
-      expect(at?.lng).toBeCloseTo(-79.945, 9);
+      const share = 37 / Math.hypot(100, 90);
+      expect(at?.lat).toBeCloseTo(40.441 + 0.009 * share, 9);
+      expect(at?.lng).toBeCloseTo(-79.95 + 0.01 * share, 9);
       await started({ raids: false, parties: view({ trains: [trainAt('t1', 1)] }) });
       expect(lines()).toEqual([{ points: 2, opacity: 0.35, dashed: false }]);
       expect(arrows()).toEqual([]);
@@ -1408,12 +1422,13 @@ describe('a battle at a Power Spot and one at a pin on the map', () => {
 
       it('numbers the stops ahead from zoom 15 up, drawn anew at each zoom', async () => {
         const shown = await started({ raids: false, parties: view({ trains: [loop(1)] }) });
-        // At Lake Gazebo now: the Fountain ahead, the Library done.
-        expect(numbers()).toEqual(['3']);
+        // At Lake Gazebo now: the Fountain next, then round the loop to the Library (plan
+        // 8M-15: counted from the train).
+        expect(numbers()).toEqual(['1', '2']);
         shown.zoomedTo(10_000, 14);
         expect(numbers()).toEqual([]);
         shown.zoomedTo(10_000, 15);
-        expect(numbers()).toEqual(['3']);
+        expect(numbers()).toEqual(['1', '2']);
         expect(badges()[0]?.getLatLng()).toEqual({ lat: 40.43, lng: -79.93 });
         // Fix round 1 (R1-4): a box of a finger's size (`--tap-size`) takes its taps, the
         // number drawn small in its middle.
@@ -1426,24 +1441,34 @@ describe('a battle at a Power Spot and one at a pin on the map', () => {
         expect(icon.html.className).toBe('number');
       });
 
-      // Fix round 2 (R2-1): a badge's box under a raid's or max battle's marker, which keeps the
-      // taps where the two overlap.
-      it("lies under a raid's marker", async () => {
+      // Plan 8M-15: on the line, on the leg the train arrives by, just clear of the stop's
+      // marker; never at a fixed offset to the left.
+      it('sits on the leg arriving at its stop', async () => {
+        await started({ raids: false, parties: view({ trains: [loop(1)] }) });
+        const anchor = (badges()[0]?.options.icon as { options: { iconAnchor: [number, number] } })
+          .options.iconAnchor;
+        // The number's center from the stop, on the screen (y down): toward Lake Gazebo, a
+        // hundredth of a degree west and two north of the Fountain (100 and 200 pixels here).
+        const center = { x: 22 - anchor[0], y: 22 - anchor[1] };
+        expect(Math.hypot(center.x, center.y)).toBeCloseTo(35);
+        expect(center.x * -200 - center.y * -100).toBeCloseTo(0);
+        expect(center.x).toBeLessThan(0);
+        expect(center.y).toBeLessThan(0);
+      });
+
+      // Fix round 2 (R2-1), plan 8M-15: a badge lies under a raid's or max battle's marker, the
+      // rings and the places' dots, which keep the taps where they overlap.
+      it("lies on a pane under the markers and the places' dots", async () => {
         await started({
           raids: true,
           parties: view({ trains: [loop(0)], raids: [raidAt(1)] }),
         });
-        const raidMarker = fake.shown.markers.find(
-          (marker) =>
-            drawnNow(marker) &&
-            (marker.options.icon as { options: { className?: string } } | undefined)?.options
-              .className === 'raid-icon',
-        );
-        expect(raidMarker).toBeDefined();
-        const z = (marker: { options: Record<string, unknown> } | undefined) =>
-          Number(marker?.options.zIndexOffset ?? 0);
         expect(badges().length).toBeGreaterThan(0);
-        for (const badge of badges()) expect(z(badge)).toBeLessThan(z(raidMarker));
+        for (const badge of badges()) expect(badge.options.pane).toBe(BADGE_PANE);
+        // Leaflet's overlay pane (the lines) is 400, its marker pane 600.
+        expect(BADGE_PANE_Z).toBeGreaterThan(400);
+        expect(BADGE_PANE_Z).toBeLessThan(PLACE_DOT_PANE_Z);
+        expect(PLACE_DOT_PANE_Z).toBeLessThan(600);
       });
 
       it("opens the train's popup where it is tapped", async () => {
@@ -1451,7 +1476,7 @@ describe('a battle at a Power Spot and one at a pin on the map', () => {
           raids: false,
           parties: view({ trains: [{ ...loop(0), postKey: 'p1' }] }),
         });
-        expect(numbers()).toEqual(['2', '3']);
+        expect(numbers()).toEqual(['1', '2']);
         badges()[1]?.fire('click', {});
         const open = fake.shown.popupOf;
         expect(open !== undefined && drawnNow(open)).toBe(true);
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 5fa39222..7d4054b6 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -56,7 +56,8 @@ import {
   ARROW_PIXELS,
   arrowElement,
   BADGE_MIN_ZOOM,
-  BADGE_Z_OFFSET,
+  BADGE_PANE,
+  BADGE_PANE_Z,
   badgeAnchor,
   legArrows,
   stopBadges,
@@ -141,8 +142,8 @@ const COUNTDOWN_MS = 15_000;
 export const PREFETCH_POSTS = 20;
 /**
  * The pane of the rings of meetups and trains: below Leaflet's markers (600), so that a raid's time
- * badge is drawn over a ring at its gym, and above its overlay pane (400) of the gyms' dots (plan
- * 8M-11A, S2). A ring takes clicks on its line still: it is unfilled, and a marker covers only its
+ * badge is drawn over a ring at its gym, and above the pane of the gyms' dots (plan 8M-11A, S2; the
+ * dots' own pane, 430, since plan 8M-15). A ring takes clicks on its line still: it is unfilled, and a marker covers only its
  * own circle.
  */
 export const RING_PANE = 'rings';
@@ -444,18 +445,20 @@ export function raidsMarker(
 
 /**
  * The marker of a train's stop badge (plan 8M-13, S7): its number (`.number`) laid out in the
- * middle of a box of `sizes.box` (fix round 1, R1-4), the box centered on the number beside the
- * stop (`badgeAnchor`, fix round 2, R2-1), under the raids' and max battles' markers. Only the
- * number and a margin round it take taps (`map.css`, review BR-1 of the small pass): the rest of
- * the box lets them through to the places under it. A tap on the number reaches the marker
- * through its icon, which Leaflet listens on, and `open`s the train's popup; none while the
- * trains let clicks through (`interactive` false).
+ * middle of a box of `sizes.box` (fix round 1, R1-4), the box centered on the number on the leg
+ * toward `toward` (the screen's vector to the badge's `along`; `badgeAnchor`, plan 8M-15), on the
+ * badges' pane under the places' dots, the rings and the markers. Only the number and a margin
+ * round it take taps (`map.css`, review BR-1 of the small pass): the rest of the box lets them
+ * through to the places under it. A tap on the number reaches the marker through its icon, which
+ * Leaflet listens on, and `open`s the train's popup; none while the trains let clicks through
+ * (`interactive` false).
  */
 export function badgeMarker(
   badge: StopBadge,
   sizes: { marker: number; box: number; badgeSize: number },
   interactive: boolean,
   open: () => void,
+  toward?: { x: number; y: number },
 ): L.Marker {
   const number = document.createElement('span');
   number.className = 'number';
@@ -465,9 +468,16 @@ export function badgeMarker(
       html: number,
       className: 'train-badge',
       iconSize: [sizes.box, sizes.box],
-      iconAnchor: badgeAnchor(badge.slot, sizes.marker, sizes.badgeSize, sizes.box),
+      iconAnchor: badgeAnchor(
+        badge.slot,
+        badge.slots,
+        sizes.marker,
+        sizes.badgeSize,
+        sizes.box,
+        toward,
+      ),
     }),
-    zIndexOffset: BADGE_Z_OFFSET,
+    pane: BADGE_PANE,
     interactive,
     keyboard: false,
   });
@@ -628,6 +638,8 @@ export function showParties(
   map.on('moveend', counted);
   // Leaflet sets the pane's place by its style from the script (no style element).
   map.createPane(RING_PANE).style.zIndex = String(RING_PANE_Z);
+  // The trains' stop badges over their lines, under the places' dots (plan 8M-15, `main.ts`).
+  map.createPane(BADGE_PANE).style.zIndex = String(BADGE_PANE_Z);
   // The rings are SVG whatever the map prefers: a canvas takes a click inside an unfilled circle
   // as the circle's, and the gym's marker inside would get none.
   const rings = L.svg({ pane: RING_PANE });
@@ -1282,8 +1294,9 @@ export function showParties(
   const trainBadges = L.layerGroup();
   /**
    * The badges of the stops ahead, from zoom 15 up (`stopBadges`): each in the train's color
-   * with its number, beside the stop (`badgeAnchor`); a tap opens the train's popup there, as a
-   * tap on its line does. Drawn anew at every draw of the parties and every zoom.
+   * with how many stops away it is, on the leg the train arrives by (`badgeAnchor` toward the
+   * badge's `along` as the map is zoomed now, plan 8M-15); a tap opens the train's popup there,
+   * as a tap on its line does. Drawn anew at every draw of the parties and every zoom.
    */
   const drawBadges = (): void => {
     trainBadges.clearLayers();
@@ -1292,10 +1305,19 @@ export function showParties(
     const { raidFull: marker, tapSize: box, badgeSize } = theme().sizes;
     for (const badge of stopBadges(badgeTrains.trains, gyms)) {
       const at = L.latLng(badge.lat, badge.lon);
-      badgeMarker(badge, { marker, box, badgeSize }, interactive, () => {
-        const id = badge.trainId;
-        (popups.get(`route:${id}`) ?? popups.get(`train:${id}`))?.openPopup(at);
-      }).addTo(trainBadges);
+      const stop = map.latLngToContainerPoint(at);
+      const along = badge.along && map.latLngToContainerPoint([badge.along.lat, badge.along.lon]);
+      const toward = along ? { x: along.x - stop.x, y: along.y - stop.y } : undefined;
+      badgeMarker(
+        badge,
+        { marker, box, badgeSize },
+        interactive,
+        () => {
+          const id = badge.trainId;
+          (popups.get(`route:${id}`) ?? popups.get(`train:${id}`))?.openPopup(at);
+        },
+        toward,
+      ).addTo(trainBadges);
     }
   };
   /** The legs of each train drawn (plan 8M-11B, S27), whose arrowheads follow the zoom. */
@@ -1310,9 +1332,13 @@ export function showParties(
     trainArrows.clearLayers();
     const project = (place: { lat: number; lon: number }) =>
       map.latLngToContainerPoint([place.lat, place.lon]);
-    const colour = theme().colours.train;
+    const { colours, sizes } = theme();
+    const colour = colours.train;
+    // Off the half of a leg that holds a stop's badges and off the leaving stop's marker (a raid's
+    // full one, as the badges reckon), from the badges' zoom (reviews R1-2, N1).
+    const badgeMarker = map.getZoom() >= BADGE_MIN_ZOOM ? sizes.raidFull : undefined;
     for (const legs of trainLines) {
-      for (const arrow of legArrows(legs, project)) {
+      for (const arrow of legArrows(legs, project, badgeMarker)) {
         L.marker([arrow.lat, arrow.lon], {
           icon: L.divIcon({
             html: arrowElement(document, colour, arrow.angle),
diff --git a/src/web/client/places-ui.isolated.test.ts b/src/web/client/places-ui.isolated.test.ts
index d7c5a580..b31bf3c6 100644
--- a/src/web/client/places-ui.isolated.test.ts
+++ b/src/web/client/places-ui.isolated.test.ts
@@ -4,6 +4,7 @@ import { LayerRegistry, LAYERS_KEY, MAP_LAYERS } from './layer-registry.js';
 import { MapActivity } from './parties.js';
 import { placeClicks, showPlaces, type PlaceSpot, type PlacesHooks } from './places-ui.js';
 import { RouteFocus } from './route-focus.js';
+import { BADGE_PANE_Z, PLACE_DOT_PANE, PLACE_DOT_PANE_Z } from './train-line.js';
 
 // Leaflet reads the browser's `window` as it loads: what `placeClicks` uses of it is how an event
 // is stopped, recorded here; what `showPlaces` draws are dots in groups, recorded with their
@@ -345,6 +346,15 @@ describe('the Power Spots and PokéStops of the view (showPlaces)', () => {
     expect(drawn.popups).toBe(0);
   });
 
+  // Plan 8M-15: a train's stop badges lie on the line by a stop; the places' dots lie above them,
+  // so their taps win.
+  it('draws the Power Spots and PokéStops on the pane above the trains’ badges', async () => {
+    const { dotOf } = await shownWith(hooks());
+    expect(dotOf('spot-dot')?.options.pane).toBe(PLACE_DOT_PANE);
+    expect(dotOf('stop-dot')?.options.pane).toBe(PLACE_DOT_PANE);
+    expect(PLACE_DOT_PANE_Z).toBeGreaterThan(BADGE_PANE_Z);
+  });
+
   it("opens the spot's popup where no battle stands", async () => {
     const { dotOf } = await shownWith(hooks());
     dotOf('spot-dot')?.fire('click');
diff --git a/src/web/client/places-ui.ts b/src/web/client/places-ui.ts
index b2711edd..408a666d 100644
--- a/src/web/client/places-ui.ts
+++ b/src/web/client/places-ui.ts
@@ -10,6 +10,7 @@ import { gymClicks } from './party-layer.js';
 import { renderNode } from './popup.js';
 import type { RouteFocus } from './route-focus.js';
 import { onThemeChange, theme, type DrawnColour } from './theme.js';
+import { PLACE_DOT_PANE } from './train-line.js';
 
 /**
  * The PokéStops and Power Spots layers of the live map (plan 8M-7): for a member, from street
@@ -223,6 +224,8 @@ export function showPlaces(
           fillOpacity: 0.7,
           // Ringed while the Report button's step 2 picks them (plan 8M-9A, `map.css`).
           className: layer.id === 'spots' ? 'spot-dot' : 'stop-dot',
+          // Over the trains' stop badges, whose taps they win (plan 8M-15).
+          pane: PLACE_DOT_PANE,
         });
         // Opened by our own handler rather than bound, which would open it before anything of ours;
         // a Power Spot where a battle stands opens the battle (review B1).
@@ -239,6 +242,7 @@ export function showPlaces(
                   stroke: false,
                   fillOpacity: 0,
                   className: 'place-target',
+                  pane: PLACE_DOT_PANE,
                 }),
               ]
             : []),
diff --git a/src/web/client/post-draw.test.ts b/src/web/client/post-draw.test.ts
index 35eaa1db..ee2b9307 100644
--- a/src/web/client/post-draw.test.ts
+++ b/src/web/client/post-draw.test.ts
@@ -611,6 +611,7 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
       spots: [],
       stop: 1,
       atEnd: 'finish',
+      stopsAhead: [2, 3],
       ahead: 'Next: 3. Gym 3 · 4. Gym 4, the last stop',
       link: LINK,
       attendance: attendance({ mine: { status: 'coming', group: 'A' } }),
@@ -684,13 +685,41 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
         all(route)
           .filter((one) => one.tag === 'li')
           .map(seen),
-    ).toEqual(['Gym 1', 'Gym 2 (the train is here)', 'Gym 3', 'Gym 4']);
+      // Plan 8M-15: how far away each stop ahead is, as the map's badges number them.
+    ).toEqual(['Gym 1', 'Gym 2 (the train is here)', 'Gym 3 (next)', 'Gym 4 (in 2 stops)']);
     // What lies ahead as the server words it (R3); route mode is the member's part's Edit route.
     expect(route && seen(route)).toContain('Next: 3. Gym 3 · 4. Gym 4, the last stop');
     expect(route && buttonsOf(route)).toEqual([]);
     expect(buttons.find((one) => one.text === 'Edit route')?.attributes).toMatchObject({
       'data-route-train': 't1',
     });
+    // A turn-back train: each stop its next arrival, out to the end and back to the start; a
+    // finished one says none.
+    const turning = postPopup(
+      view,
+      { ...train, atEnd: 'turn-back', stopsAhead: [2, 3, 2, 1, 0] },
+      { ...context, place: undefined, located: undefined, units: 'imperial' },
+    );
+    expect(
+      all(byClass(turning, 'route')[0] ?? turning)
+        .filter((one) => one.tag === 'li')
+        .map(seen),
+    ).toEqual([
+      'Gym 1 (in 5 stops)',
+      'Gym 2 (the train is here)',
+      'Gym 3 (next)',
+      'Gym 4 (in 2 stops)',
+    ]);
+    const done = postPopup(
+      view,
+      { ...train, stop: null, stopsAhead: [] },
+      { ...context, place: undefined, located: undefined, units: 'imperial' },
+    );
+    expect(
+      all(byClass(done, 'route')[0] ?? done)
+        .filter((one) => one.tag === 'li')
+        .map(seen),
+    ).toEqual(['Gym 1', 'Gym 2', 'Gym 3', 'Gym 4']);
   });
 });
 
@@ -716,6 +745,7 @@ describe('the review’s fixes (8M-8A fix round 1)', () => {
     spots: [],
     stop: 0,
     atEnd: 'finish',
+    stopsAhead: [1],
     ahead: null,
     link: LINK,
     attendance: attendance(),
diff --git a/src/web/client/post-draw.ts b/src/web/client/post-draw.ts
index 2197e8a8..90e6d566 100644
--- a/src/web/client/post-draw.ts
+++ b/src/web/client/post-draw.ts
@@ -15,6 +15,7 @@ import { directionsLink, type PageNode } from './popup.js';
 import { postTime, type TimeShown } from './post-time.js';
 import { spawnBox } from './spawn-forms.js';
 import { answerLine, type PressAnswer } from './press-answer.js';
+import { arrivalNumbers } from '../../domain/party/stops-ahead.js';
 
 /**
  * A party's post drawn on the live map (plan 8M-8A): the post view the server made of the layout
@@ -393,6 +394,12 @@ const button = (text: string, attributes: Record<string, string>): PageNode => (
   attributes: { type: 'button', ...attributes },
 });
 
+/** How far away a stop ahead is in the Route list (plan 8M-15): ` (next)`, ` (in 3 stops)`. */
+function awayWords(number: number | undefined): string {
+  if (number === undefined) return '';
+  return number === 1 ? ' (next)' : ` (in ${String(number)} stops)`;
+}
+
 /**
  * A train's part for the member: whose the conductor role is, Edit route and the conductor's
  * buttons (`/conductor`'s, outside Manage…, which is Discord's dialog: R2), and the stop list
@@ -424,7 +431,10 @@ function trainPart(
       : []),
   ];
   // Route (plan 8M-8C, R3): the stops read-only and what lies ahead as the server words it (the
-  // post's small print); route mode is the Edit route above it, once (review C8).
+  // post's small print); route mode is the Edit route above it, once (review C8). Each stop ahead
+  // says how far away it is, as the map's badges number it (plan 8M-15, Q1: only here, not in
+  // the post on Discord).
+  const away = arrivalNumbers(train.stopsAhead, train.stop);
   const route: PageNode = {
     tag: 'section',
     className: 'route',
@@ -434,7 +444,7 @@ function trainPart(
         tag: 'ol',
         children: train.route.map((key, index) => ({
           tag: 'li',
-          text: `${context.stopName(key)}${index === train.stop ? ' (the train is here)' : ''}`,
+          text: `${context.stopName(key)}${index === train.stop ? ' (the train is here)' : awayWords(away.get(index))}`,
         })),
       },
       ...(train.ahead === null
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index 113d264f..1cb7bbf3 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -60,6 +60,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
   spots: [],
   stop: 1,
   atEnd: 'finish',
+  stopsAhead: [2],
   ahead: null,
   link: 'https://discord.com/channels/1/2',
   attendance: {
diff --git a/src/web/client/train-line.test.ts b/src/web/client/train-line.test.ts
index 10b52f1a..7f3f1f15 100644
--- a/src/web/client/train-line.test.ts
+++ b/src/web/client/train-line.test.ts
@@ -170,6 +170,30 @@ describe('legArrows (plan 8M-11B, S27)', () => {
     expect(two[0]?.lon).toBeCloseTo(-80 + 0.01 * (2 / 3), 9);
     expect(two[1]?.lon).toBeCloseTo(-79.99 - 0.01 * (2 / 3), 9);
   });
+
+  // Review R1-2: from zoom 15 the half of a leg by the stop it arrives at holds that stop's badge.
+  // Review N1 of round 2: and the arrowhead stays clear of the leaving stop's marker.
+  it('keeps the arrowhead on the leaving half of a leg that carries badges, clear of its stop', () => {
+    const legs = trainLegs(train(['1', '2'], 0), GYMS);
+    // A leg of 100 pixels by a dot (no marker to speak of): a quarter of the way along.
+    const [arrow] = legArrows(legs, projection(100), 0);
+    expect(arrow?.lon).toBeCloseTo(-80 + 0.01 / 4, 9);
+    expect(arrow?.angle).toBeCloseTo(0, 6);
+    // By a raid's marker of 44: half of it, the gap and half an arrowhead from the stop, 37.
+    const [clear] = legArrows(legs, projection(100), 44);
+    expect(clear?.lon).toBeCloseTo(-80 + 0.01 * (37 / 100), 9);
+    // A leg of 60 by a marker of 6: 18 from the stop, as far as the leaving half allows.
+    const [short] = legArrows(legs, projection(60), 6);
+    expect(short?.lon).toBeCloseTo(-80 + 0.01 * (18 / 60), 9);
+    // By a marker of 44 it would reach past the leaving half: none.
+    expect(legArrows(legs, projection(60), 44)).toEqual([]);
+    // Without badges (below their zoom) at the middle, as before.
+    expect(legArrows(legs, projection(60))[0]?.lon).toBeCloseTo(-79.995, 9);
+    // Out and back on one line: each half holds a badge, so neither gets an arrowhead.
+    expect(legArrows(trainLegs(train(['1', '2'], 0, 'loop'), GYMS), projection(100), 0)).toEqual(
+      [],
+    );
+  });
 });
 
 // Plan 8M-13 (T1): the arrowheads were hard to see at 16 pixels.
@@ -209,80 +233,164 @@ describe('arrowElement', () => {
   });
 });
 
-// Plan 8M-13 (S7): a train is picked at any stop ahead by a numbered badge beside it.
+// Plan 8M-13 (S7), counted from the train since plan 8M-15: a train is picked at any stop ahead by
+// a numbered badge on its line.
 describe('stopBadges', () => {
-  /** A badge as its train, number, stop (by longitude) and place in the row beside the stop. */
-  const badgesOf = (trains: Array<ReturnType<typeof train> & { id: string }>) =>
+  type Shown = ReturnType<typeof train> & { id: string; stopsAhead: number[] };
+  /** A badge as its train, number, stop and the stop along whose leg it sits (by longitude). */
+  const badgesOf = (trains: Shown[]) =>
     stopBadges(trains, GYMS).map((badge) => ({
       train: badge.trainId,
       number: badge.number,
       at: badge.lon,
+      along: badge.along?.lon ?? null,
       slot: badge.slot,
     }));
+  const shown = (
+    route: string[],
+    stop: number | null,
+    stopsAhead: number[],
+    atEnd: MapAtEnd = 'finish',
+    id = 't',
+  ): Shown => ({ id, ...train(route, stop, atEnd), stopsAhead });
 
-  it('numbers each stop ahead by its place in the route; the current and done stops get none', () => {
-    expect(badgesOf([{ id: 't', ...train(['1', '2', '3', '4'], 1) }])).toEqual([
-      { train: 't', number: 3, at: -79.98, slot: 0 },
-      { train: 't', number: 4, at: -79.97, slot: 0 },
+  it('numbers the stops ahead from the train, each on the leg arriving at it', () => {
+    expect(badgesOf([shown(['1', '2', '3', '4'], 1, [2, 3])])).toEqual([
+      { train: 't', number: 1, at: -79.98, along: -79.99, slot: 0 },
+      { train: 't', number: 2, at: -79.97, along: -79.98, slot: 0 },
     ]);
     // A Power Spot ahead too, by its own place.
-    expect(badgesOf([{ id: 't', ...train(['1', SPOT.key], 0) }])).toEqual([
-      { train: 't', number: 2, at: -79.98, slot: 0 },
+    expect(badgesOf([shown(['1', SPOT.key], 0, [1])])).toEqual([
+      { train: 't', number: 1, at: -79.98, along: -80, slot: 0 },
     ]);
   });
 
-  it('gives none to a finished train, nor to the stops a loop has done', () => {
-    expect(badgesOf([{ id: 't', ...train(['1', '2', '3'], null) }])).toEqual([]);
-    expect(badgesOf([{ id: 't', ...train(['1', '2', '3'], 2, 'loop') }])).toEqual([]);
+  it("gives a turn-back train's stops their next arrival: gaps where it passes stops again", () => {
+    // At gym 2 of 1 to 4: on to 3 and 4, back through 3 and 2, then 1.
+    expect(badgesOf([shown(['1', '2', '3', '4'], 1, [2, 3, 2, 1, 0], 'turn-back')])).toEqual([
+      { train: 't', number: 1, at: -79.98, along: -79.99, slot: 0 },
+      { train: 't', number: 2, at: -79.97, along: -79.98, slot: 0 },
+      // Arriving from gym 2, on the way back.
+      { train: 't', number: 5, at: -80, along: -79.99, slot: 0 },
+    ]);
   });
 
-  it('passes over a stop the map cannot place, keeping the numbers of the route', () => {
-    expect(badgesOf([{ id: 't', ...train(['1', '9', '3'], 0) }])).toEqual([
-      { train: 't', number: 3, at: -79.98, slot: 0 },
+  it('goes round a loop: the first stop on the closing leg from the last', () => {
+    expect(badgesOf([shown(['1', '2', '3'], 2, [0, 1], 'loop')])).toEqual([
+      { train: 't', number: 1, at: -80, along: -79.98, slot: 0 },
+      { train: 't', number: 2, at: -79.99, along: -80, slot: 0 },
     ]);
   });
 
-  it('sets the badges of one stop side by side: a stop listed twice, or ahead of two trains', () => {
-    expect(badgesOf([{ id: 't', ...train(['1', '2', '3', '2'], 0) }])).toEqual([
-      { train: 't', number: 2, at: -79.99, slot: 0 },
-      { train: 't', number: 3, at: -79.98, slot: 0 },
-      { train: 't', number: 4, at: -79.99, slot: 1 },
+  it('gives none to a finished train', () => {
+    expect(badgesOf([shown(['1', '2', '3'], null, [])])).toEqual([]);
+  });
+
+  it('counts a stop the map cannot place, and passes over it for the leg', () => {
+    expect(badgesOf([shown(['1', '9', '3'], 0, [1, 2])])).toEqual([
+      { train: 't', number: 2, at: -79.98, along: -80, slot: 0 },
+    ]);
+    // Where the stop it arrives from cannot be placed at all, the leg it leaves by.
+    expect(badgesOf([shown(['9', '2', '3'], 0, [1, 2])])).toEqual([
+      { train: 't', number: 1, at: -79.99, along: -79.98, slot: 0 },
+      { train: 't', number: 2, at: -79.98, along: -79.99, slot: 0 },
+    ]);
+  });
+
+  it('sets the numbers of one stop on one leg further along it: a stop listed twice, two trains', () => {
+    // Gym 2 listed twice, reached from gym 1 and later from gym 3: each on its own leg.
+    expect(badgesOf([shown(['1', '2', '3', '2'], 0, [1, 2, 3])])).toEqual([
+      { train: 't', number: 1, at: -79.99, along: -80, slot: 0 },
+      { train: 't', number: 2, at: -79.98, along: -79.99, slot: 0 },
+      { train: 't', number: 3, at: -79.99, along: -79.98, slot: 0 },
+    ]);
+    // Listed twice in a row on the same leg's way: side by side.
+    expect(badgesOf([shown(['1', '2', '1', '2'], 0, [1, 2, 3])])).toMatchObject([
+      { number: 1, at: -79.99, slot: 0 },
+      { number: 2, at: -80, slot: 0 },
+      { number: 3, at: -79.99, slot: 1 },
     ]);
     expect(
       badgesOf([
-        { id: 'a', ...train(['1', '3'], 0) },
-        { id: 'b', ...train(['2', '3'], 0) },
+        shown(['1', '3'], 0, [1], 'finish', 'a'),
+        shown(['1', '3'], 0, [1], 'finish', 'b'),
       ]),
     ).toEqual([
-      { train: 'a', number: 2, at: -79.98, slot: 0 },
-      { train: 'b', number: 2, at: -79.98, slot: 1 },
+      { train: 'a', number: 1, at: -79.98, along: -80, slot: 0 },
+      { train: 'b', number: 1, at: -79.98, along: -80, slot: 1 },
     ]);
+    // Each knows how many share its leg, so that a short leg can move them closer (review R1-2).
+    expect(
+      stopBadges(
+        [shown(['1', '3'], 0, [1], 'finish', 'a'), shown(['1', '3'], 0, [1], 'finish', 'b')],
+        GYMS,
+      ).map((badge) => badge.slots),
+    ).toEqual([2, 2]);
+    expect(
+      stopBadges([shown(['1', '2', '3', '4'], 1, [2, 3])], GYMS).map((one) => one.slots),
+    ).toEqual([1, 1]);
   });
 });
 
 describe('badgeAnchor', () => {
-  /** A badge's number (`--badge-size`) and the box round it that takes taps (`--tap-size`). */
+  /** A badge's number (`--badge-size`) and the box round it that lays it out (`--tap-size`). */
   const NUMBER = 20;
   const TAP = 44;
-  /** A badge's box on the screen, from its anchor, and its number's center: the stop at 0, 0. */
-  const box = (slot: number, marker: number) => {
-    const [x, y] = badgeAnchor(slot, marker, NUMBER, TAP);
-    return { left: -x, right: -x + TAP, top: -y, bottom: -y + TAP, center: -x + TAP / 2 };
+  /** A badge's number's center on the screen from its anchor: the stop at 0, 0, y down. */
+  const center = (
+    slot: number,
+    marker: number,
+    toward?: { x: number; y: number },
+    slots = slot + 1,
+  ) => {
+    const [x, y] = badgeAnchor(slot, slots, marker, NUMBER, TAP, toward);
+    return { x: -x + TAP / 2, y: -y + TAP / 2 };
   };
 
-  // Fix round 2 of 8M-13 (R2-1): the numbers where they were before round 1, each in a box of a
-  // finger's size centered on it, clear of a gym's dot.
-  it("keeps each number 35, 58, … pixels left of its stop, clear of a raid's full marker", () => {
-    expect([0, 1, 2].map((slot) => box(slot, 44).center)).toEqual([-35, -58, -81]);
-    // The number itself clear of the marker by the gap.
-    expect(box(0, 44).center + NUMBER / 2).toBe(-22 - BADGE_GAP);
+  it("sits on the leg toward the stop it arrives from, clear of a raid's full marker", () => {
+    // Half the marker, the gap and half the number: 35 pixels along the leg.
+    expect(center(0, 44, { x: -300, y: 0 })).toEqual({ x: -35, y: 0 });
+    expect(center(0, 44, { x: 0, y: -80 * 3 })).toEqual({ x: 0, y: -35 });
+    const slanted = center(0, 44, { x: 60, y: 80 });
+    expect(slanted.x).toBeCloseTo(21);
+    expect(slanted.y).toBeCloseTo(28);
+    expect(center(0, 44, { x: 0, y: 500 }).y - NUMBER / 2).toBe(22 + BADGE_GAP);
+  });
+
+  it('sets the numbers of one leg further along it, never at a fixed offset to the left', () => {
+    expect([0, 1, 2].map((slot) => center(slot, 44, { x: 0, y: 500 }, 3).y)).toEqual([35, 58, 81]);
+    expect(center(1, 44, { x: 200, y: 0 })).toEqual({ x: 58, y: 0 });
+  });
+
+  // Review R1-2: downtown legs of 28 to 55 pixels at zoom 15.
+  // Review R1-2, and N2 of round 2: numbers never overlap.
+  it('keeps the numbers on the near half of their leg, all left of the stop where they do not fit', () => {
+    // A leg of 100: a number's center at most 50 less half a number, 40, from the stop.
+    expect(center(0, 44, { x: 100, y: 0 }, 1)).toEqual({ x: 35, y: 0 });
+    // Two need 35 and 58: on a leg of 100 neither goes on it, both left of the stop.
+    expect([0, 1].map((slot) => center(slot, 44, { x: 100, y: 0 }, 2))).toEqual([
+      { x: -35, y: 0 },
+      { x: -58, y: 0 },
+    ]);
+    // On a leg of 136 (at most 58) they fit, full width apart.
+    expect([0, 1].map((slot) => center(slot, 44, { x: 0, y: -136 }, 2).y)).toEqual([-35, -58]);
+    // Three on it do not: all three left.
+    expect([0, 1, 2].map((slot) => center(slot, 44, { x: 0, y: -136 }, 3).x)).toEqual([
+      -35, -58, -81,
+    ]);
+  });
+
+  it('falls back to the left of the stop where not even one number fits on the leg', () => {
+    // A leg of 55: at most 17.5 from the stop, nearer than the marker allows.
+    expect(center(0, 44, { x: 55, y: 0 }, 1)).toEqual({ x: -35, y: 0 });
+    expect([0, 1].map((slot) => center(slot, 44, { x: 0, y: 28 }, 2))).toEqual([
+      { x: -35, y: 0 },
+      { x: -58, y: 0 },
+    ]);
   });
 
-  it("centers a finger's box on the number, its right edge clear of a gym's dot of 8 pixels", () => {
-    const first = box(0, 44);
-    expect(first.right - first.left).toBe(TAP);
-    expect((first.left + first.right) / 2).toBe(first.center);
-    expect(first.right).toBeLessThan(-4);
-    expect(first.top + first.bottom).toBe(0);
+  it('sits left of the stop when it has no leg on the screen', () => {
+    expect(center(0, 44)).toEqual({ x: -35, y: 0 });
+    expect(center(0, 44, { x: 0, y: 0 })).toEqual({ x: -35, y: 0 });
   });
 });
diff --git a/src/web/client/train-line.ts b/src/web/client/train-line.ts
index dfb5a9e3..28c900b0 100644
--- a/src/web/client/train-line.ts
+++ b/src/web/client/train-line.ts
@@ -1,3 +1,4 @@
+import { arrivalNumbers } from '../../domain/party/stops-ahead.js';
 import type { MapTrain } from '../../domain/web/party-data.js';
 import { stopPlace, type StopPlace } from './parties.js';
 
@@ -84,21 +85,37 @@ export interface LegArrow {
  * pixels, y down), recomputed whenever the zoom changes: one at the middle of each leg ahead at
  * least `ARROW_MIN_PIXELS` long on the screen, turned along it. A leg whose way back is drawn
  * ahead too (a loop of two stops) has its arrowhead two thirds of the way along, so that the two
- * do not meet at the middle.
+ * do not meet at the middle. Where the stops' badges are drawn (`badgeMarker` given, the pixels of
+ * a stop's marker, from `BADGE_MIN_ZOOM`; review R1-2 of plan 8M-15) the arrowhead keeps off the
+ * half by the stop it arrives at, which holds that stop's numbers, and off the marker of the stop
+ * it leaves (review N1): its center a quarter of the way along, or half the marker, `BADGE_GAP`
+ * and half an arrowhead from the leaving stop where that is farther; none where it would then
+ * reach into the other half, nor on a leg out and back.
  */
 export function legArrows(
   legs: readonly TrainLeg[],
   project: (place: StopPlace) => { x: number; y: number },
+  badgeMarker?: number,
 ): LegArrow[] {
+  const badged = badgeMarker !== undefined;
   const ahead = legs.filter((leg) => !leg.done);
   return ahead.flatMap((leg) => {
     const from = project(leg.from);
     const to = project(leg.to);
     const dx = to.x - from.x;
     const dy = to.y - from.y;
-    if (Math.hypot(dx, dy) < ARROW_MIN_PIXELS) return [];
+    const length = Math.hypot(dx, dy);
+    if (length < ARROW_MIN_PIXELS) return [];
     const back = ahead.some((other) => other.from === leg.to && other.to === leg.from);
-    const share = back ? 2 / 3 : 1 / 2;
+    // With the stops' badges (`badged`, review R1-2) the half by the stop a leg arrives at holds
+    // its numbers (`badgeAnchor`): the arrowhead in the middle of the leaving half, whole, or
+    // none; none on a leg out and back, whose both halves hold numbers.
+    if (badged && back) return [];
+    const along = badged
+      ? Math.max(length / 4, badgeMarker / 2 + BADGE_GAP + ARROW_PIXELS / 2)
+      : undefined;
+    if (along !== undefined && along > length / 2 - ARROW_PIXELS / 2) return [];
+    const share = along !== undefined ? along / length : back ? 2 / 3 : 1 / 2;
     return [
       {
         lat: leg.from.lat + (leg.to.lat - leg.from.lat) * share,
@@ -145,66 +162,112 @@ export const BADGE_GAP = 3;
 /** The badges show from this zoom up; below it the ring and the line pick a train, as before. */
 export const BADGE_MIN_ZOOM = 15;
 
-/** A badge of a stop ahead: its train, its number in the route, where, and its place in a row. */
+// The panes of the badges and the places' dots (plan 8M-15), in a module of their own that the
+// stylesheet tests can take (no DOM).
+export { BADGE_PANE, BADGE_PANE_Z, PLACE_DOT_PANE, PLACE_DOT_PANE_Z } from './panes.js';
+
+/**
+ * A badge of a stop ahead: its train, how many stops away it is, where, the place at the other
+ * end of the leg it sits on, and its place along that leg.
+ */
 export interface StopBadge {
   trainId: string;
-  /** Its listing's place in the route, from 1, as `/route` numbers stops. */
+  /** How many stops away its next arrival is, from 1 (`arrivalNumbers`). */
   number: number;
   lat: number;
   lon: number;
-  /** Its place in the row of badges beside the stop, from 0 next to it. */
+  /**
+   * The stop the train arrives from, along whose leg the number is drawn (the last one before it
+   * the map can place); where there is none, the next one it leaves for. Null where the map can
+   * place neither: the number sits left of the stop.
+   */
+  along: StopPlace | null;
+  /** Its place along that leg, from 0 next to the stop: the numbers of one stop on one leg. */
   slot: number;
+  /** How many numbers share that leg by the stop (review R1-2: a short leg moves them closer). */
+  slots: number;
 }
 
 /**
- * The badges of the trains' stops ahead (plan 8M-13, S7): one per listing after the stop each
- * train is at (none for a finished train, nor for the stops a loop has done though its closing
- * leg leads back to them; the current stop keeps the ring), numbered by its place in the route,
- * a stop the map cannot place passed over. The badges of one stop, a stop listed twice or ahead
- * of several trains, are set side by side in the trains' order.
+ * The badges of the trains' stops ahead (plan 8M-13, S7; counted from the train since plan
+ * 8M-15): one per stop of `stopsAhead` the map can place, numbered by its next arrival
+ * (`arrivalNumbers`; none for a finished train nor the current stop, which keeps the ring), drawn
+ * on the leg by which the train arrives there then (`along`). The numbers of one stop on one leg
+ * (a stop listed twice, reached the same way; several trains) are set further along it in the
+ * trains' order.
  */
 export function stopBadges(
-  trains: ReadonlyArray<Pick<MapTrain, 'id' | 'route' | 'stop' | 'spots'>>,
+  trains: ReadonlyArray<Pick<MapTrain, 'id' | 'route' | 'stop' | 'spots' | 'stopsAhead'>>,
   gyms: ReadonlyMap<number, StopPlace>,
 ): StopBadge[] {
   const taken = new Map<string, number>();
-  return trains.flatMap((train) => {
-    const { stop } = train;
+  const placed = trains.flatMap((train) => {
+    const { stop, stopsAhead } = train;
     if (stop === null) return [];
-    return train.route.flatMap((key, index) => {
-      if (index <= stop) return [];
-      const place = stopPlace(train, key, gyms);
-      if (!place) return [];
-      const slot = taken.get(key) ?? 0;
-      taken.set(key, slot + 1);
-      return [{ trainId: train.id, number: index + 1, lat: place.lat, lon: place.lon, slot }];
-    });
+    const placeAt = (index: number | undefined): StopPlace | undefined =>
+      index === undefined ? undefined : stopPlace(train, train.route[index], gyms);
+    /** The way the train goes: its current stop, then each stop ahead. */
+    const way = [stop, ...stopsAhead];
+    const badges: Array<Omit<StopBadge, 'slots'> & { leg: string }> = [];
+    for (const [index, number] of arrivalNumbers(stopsAhead, stop)) {
+      const place = placeAt(index);
+      if (!place) continue;
+      const at = stopsAhead.indexOf(index) + 1;
+      const before = way
+        .slice(0, at)
+        .reverse()
+        .find((one) => placeAt(one) !== undefined);
+      const after = way.slice(at + 1).find((one) => placeAt(one) !== undefined);
+      const from = before ?? after;
+      const along = placeAt(from) ?? null;
+      const leg = `${train.route[index] ?? ''}<${from === undefined ? '' : (train.route[from] ?? '')}`;
+      const slot = taken.get(leg) ?? 0;
+      taken.set(leg, slot + 1);
+      badges.push({ trainId: train.id, number, lat: place.lat, lon: place.lon, along, slot, leg });
+    }
+    return badges;
   });
+  // How many share each leg, once every train's are counted.
+  return placed.map(({ leg, ...badge }) => ({ ...badge, slots: taken.get(leg) ?? 1 }));
 }
 
 /**
  * Where a badge sits by its stop, as Leaflet's `iconAnchor` (the stop's point within the badge's
- * box). Its number (`numberPixels`, `--badge-size`) lies to the left of the stop and centered on
- * it, clear of a marker `markerPixels` wide there (a raid's or a max battle's full marker; a gym's
- * dot is smaller) by `BADGE_GAP`, the numbers of one stop side by side further out: their centers
- * 35, 58, … pixels left of the stop beside a full marker of 44. The box, `boxPixels` square
+ * box). Its number (`numberPixels`, `--badge-size`) lies on the line, along the leg toward
+ * `toward` (the screen's vector from the stop to the badge's `along`, y down; plan 8M-15), clear
+ * of a marker `markerPixels` wide at the stop (a raid's or a max battle's full marker; a gym's dot
+ * is smaller) by `BADGE_GAP`, the `slots` numbers of one leg further along it: their centers 35,
+ * 58, … pixels from the stop beside a full marker of 44. A number stays on the stop's half of the
+ * leg (review R1-2: its center at most half the leg less half a number from the stop, `toward`'s
+ * length being the leg's), so it never reaches the stop it comes from nor the leg's arrowhead
+ * (`legArrows`); numbers never overlap (review N2): where the leg's half does not hold all of
+ * its `slots` numbers at their full spacing, all of them lie to the stop's left as before plan
+ * 8M-15, as they do without a leg on the screen (none, or of no length). The box, `boxPixels` square
  * (`--tap-size`, fix round 1, R1-4), is centered on the number (fix round 2, R2-1) and only lays
  * it out: the number and a square of `--badge-tap-size` (32) round it take the taps, the rest of
- * the box lets them through to the places under it (review BR-1 of the small pass, `map.css`).
- * That square's right edge lies 19 pixels left of the stop beside a full marker, clear of a gym's
- * dot; it overlaps the left edge of a raid's or max battle's marker, which lies above it
- * (`BADGE_Z_OFFSET`), and the squares of neighboring numbers, where the later one takes a tap.
+ * the box lets them through to the places under it (review BR-1 of the small pass, `map.css`),
+ * whose dots lie above the badges in any case (`PLACE_DOT_PANE`).
  */
 export function badgeAnchor(
   slot: number,
+  slots: number,
   markerPixels: number,
   numberPixels: number,
   boxPixels: number,
+  toward?: { x: number; y: number },
 ): [number, number] {
-  const center =
-    markerPixels / 2 + BADGE_GAP + numberPixels / 2 + slot * (numberPixels + BADGE_GAP);
-  return [center + boxPixels / 2, boxPixels / 2];
+  const nearest = markerPixels / 2 + BADGE_GAP + numberPixels / 2;
+  const step = numberPixels + BADGE_GAP;
+  const left = nearest + slot * step;
+  const length = toward === undefined ? 0 : Math.hypot(toward.x, toward.y);
+  const farthest = length / 2 - numberPixels / 2;
+  // Leaflet places the box's top left at the stop less the anchor: the number's center at the
+  // stop plus the distance along the leg.
+  // Numbers never overlap (review N2): all of a leg's at their full spacing, or all left.
+  if (toward === undefined || length === 0 || nearest + (slots - 1) * step > farthest) {
+    return [boxPixels / 2 + left, boxPixels / 2];
+  }
+  const distance = nearest + slot * step;
+  const unit = { x: toward.x / length, y: toward.y / length };
+  return [boxPixels / 2 - unit.x * distance, boxPixels / 2 - unit.y * distance];
 }
-
-/** A badge's marker lies under the raids' and max battles' (Leaflet's `zIndexOffset`, R2-1). */
-export const BADGE_Z_OFFSET = -1000;
diff --git a/src/web/client/train-ui.isolated.test.ts b/src/web/client/train-ui.isolated.test.ts
index a1c190fe..7a9dfe2f 100644
--- a/src/web/client/train-ui.isolated.test.ts
+++ b/src/web/client/train-ui.isolated.test.ts
@@ -264,6 +264,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
   spots: [],
   stop: 1,
   atEnd: 'finish',
+  stopsAhead: [2],
   ahead: null,
   link: 'https://discord.com/channels/1/2',
   attendance: {
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
index 47f625ca..ad711e45 100644
--- a/src/web/client/what-is-on.test.ts
+++ b/src/web/client/what-is-on.test.ts
@@ -100,6 +100,7 @@ const train = (id: string, more: Partial<MapTrain> = {}): MapTrain => ({
   spots: [],
   stop: 0,
   atEnd: 'finish',
+  stopsAhead: [1],
   ahead: null,
   link: 'https://discord.com/channels/1/3',
   attendance: attendance(4, 1),
diff --git a/src/web/place-dot-pane.test.ts b/src/web/place-dot-pane.test.ts
new file mode 100644
index 00000000..c90b70c5
--- /dev/null
+++ b/src/web/place-dot-pane.test.ts
@@ -0,0 +1,56 @@
+import { describe, expect, it } from 'vitest';
+import { clientSheet } from '../../test/support/stylesheets.js';
+import { PLACE_DOT_PANE } from './client/panes.js';
+
+/**
+ * The Report button's step 2 (plan 8M-9A) dims everything drawn but the places that fit. Since
+ * plan 8M-15 the gyms', Power Spots' and PokéStops' dots and their larger targets lie on a pane of
+ * their own (`PLACE_DOT_PANE`, over the trains' stop badges), so the rules that dim them, keep the
+ * fitting ones bright and keep the targets clear must name that pane (review R1-1). Read from the
+ * stylesheet, as the browser reads it.
+ */
+
+/** Leaflet's class of a pane made by `map.createPane(name)`. */
+const paneClass = `.leaflet-${PLACE_DOT_PANE}-pane`;
+
+/** The rules of `map.css`: each one's selectors and its declarations by name. */
+function rules(): Array<{ selectors: string[]; declarations: Map<string, string> }> {
+  return [...clientSheet('map.css').matchAll(/([^{}]*)\{([^{}]*)\}/gu)].map((rule) => ({
+    selectors: (rule[1] ?? '').split(',').map((one) => one.trim()),
+    declarations: new Map(
+      [...(rule[2] ?? '').matchAll(/([a-z-]+)\s*:\s*([^;]+)/gu)].map((found) => [
+        found[1] ?? '',
+        (found[2] ?? '').trim(),
+      ]),
+    ),
+  }));
+}
+
+/** The value of `property` that the rules give `selector`, if one of them names it exactly. */
+const valueFor = (selector: string, property: string): string | undefined =>
+  rules()
+    .find((rule) => rule.selectors.includes(selector))
+    ?.declarations.get(property);
+
+describe("the places' dots while step 2 of Report picks (plan 8M-15, review R1-1)", () => {
+  it('dims the dots on their own pane, and the lines on the overlay pane', () => {
+    expect(valueFor(`.report-picking ${paneClass} path`, 'opacity')).toBe('0.35');
+    expect(valueFor('.report-picking .leaflet-overlay-pane path', 'opacity')).toBe('0.35');
+  });
+
+  it('keeps the dots that fit bright, and the larger targets clear', () => {
+    expect(valueFor(`.pick-gyms ${paneClass} path.gym-dot`, 'opacity')).toBe('1');
+    expect(valueFor(`.pick-spots ${paneClass} path.spot-dot`, 'opacity')).toBe('1');
+    expect(valueFor(`.pick-stops ${paneClass} path.stop-dot`, 'opacity')).toBe('1');
+    expect(valueFor(`.report-picking ${paneClass} path.place-target`, 'opacity')).toBe('0');
+  });
+
+  it('names no dot on the overlay pane any more', () => {
+    const stale = rules()
+      .flatMap((rule) => rule.selectors)
+      .filter((selector) =>
+        /\.leaflet-overlay-pane path\.(gym-dot|spot-dot|stop-dot|place-target)/u.test(selector),
+      );
+    expect(stale).toEqual([]);
+  });
+});
diff --git a/src/web/train-badge-taps.test.ts b/src/web/train-badge-taps.test.ts
index ba818cd8..e1867afd 100644
--- a/src/web/train-badge-taps.test.ts
+++ b/src/web/train-badge-taps.test.ts
@@ -32,7 +32,7 @@ const CHAIN_CLASSES = [
   'number',
   'leaflet-marker-icon',
   'leaflet-interactive',
-  'leaflet-marker-pane',
+  'leaflet-train-badges-pane',
 ];
 
 /** The tags of the badge's parts and of what holds them (a selector needing another skips them). */
@@ -196,7 +196,7 @@ const takesPointer = (rules: readonly Rule[], chain: readonly Part[]): boolean =
 /**
  * What of a badge takes a tap at `(x, y)` pixels from the middle of its box: `number` (the
  * number's circle, or its margin `::after`, whose events are the number's), `box`, or nothing.
- * The box is the marker's icon as Leaflet draws it in the marker pane, `leaflet-interactive`
+ * The box is the marker's icon as Leaflet draws it in the badges' pane, `leaflet-interactive`
  * while the trains take clicks; the number is centered in it (flex), its margin round it.
  */
 function tapOn(x: number, y: number, interactive: boolean): 'number' | 'box' | undefined {
@@ -205,7 +205,8 @@ function tapOn(x: number, y: number, interactive: boolean): 'number' | 'box' | u
   const map: Part[] = [
     { classes: ['leaflet-container'] },
     { classes: ['leaflet-pane', 'leaflet-map-pane'] },
-    { classes: ['leaflet-pane', 'leaflet-marker-pane'] },
+    // The badges' own pane (plan 8M-15, `BADGE_PANE`).
+    { classes: ['leaflet-pane', 'leaflet-train-badges-pane'] },
   ];
   const box = [
     ...map,
````

### Task 4: 8M-15 task 4: every short page's card the full 480 px (P1)

Prototype commit: `17ee85f4452c689bc19a78590aada43287bf188e`

body.short main takes 480 px where the screen allows, the 16 px gutters kept on a narrow screen.

**Files:**

```
 docs/architecture/web.md        |  2 +-
 src/web/client/pages.css        |  3 +++
 src/web/short-page-card.test.ts | 64 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 68 insertions(+), 1 deletion(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/short-page-card.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 17ee85f4452c689bc19a78590aada43287bf188e -- src test scripts docs/architecture` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-15 task 4: every short page's card the full 480 px (P1)`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index d27c0a6b..52928c4a 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -8,7 +8,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows Stadia's, `shownTiles`, `src/web/headers.ts`). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
 - `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in and those with a map (`serversWithMap`, plan 8M-14), the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, its trains `TrainWebDeps`, its meetups `MeetupWebDeps`, its max battles `MaxWebDeps`, its reports at stops `StopWebDeps`, the application emoji's pictures `emoji` (plan 8M-8A), a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
 - Fastify's own logger is off. Every request is logged at debug by `method`, its route pattern (`/auth/link/:guild/:token`, never the address it was asked with, which may carry a token or code), `status` and `ms`. Never log a token, cookie, OAuth code, CSRF token, secret or the query string of `/auth/*`; a failure is logged as `{ err }` with the route.
-- Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/` (401 "Log in first.", 403, 404, 413, 429, 503 "Not available just now."), a short page otherwise, never a stack or what went wrong; 500s are logged. Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's preview and save, 2 MB: `SAVE_BODY_LIMIT`) sets its own `bodyLimit`.
+- Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/` (401 "Log in first.", 403, 404, 413, 429, 503 "Not available just now."), a short page otherwise, never a stack or what went wrong; 500s are logged. Every short page (`body.short`, `pages.css`: the failures, the top page, a login link's page, the answers' pages) is one card, the full 480 px where the screen allows, whatever it holds, narrower only on a narrow screen with its 16 px gutters (plan 8M-15, P1: `flex: 0 1 480px`; `src/web/short-page-card.test.ts`). Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's preview and save, 2 MB: `SAVE_BODY_LIMIT`) sets its own `bodyLimit`.
 
 ## Headers and the Content Security Policy
 
diff --git a/src/web/client/pages.css b/src/web/client/pages.css
index 525aefff..8b6777c3 100644
--- a/src/web/client/pages.css
+++ b/src/web/client/pages.css
@@ -19,7 +19,10 @@ body.short {
   font-size: var(--font-size);
 }
 
+/* P1 (plan 8M-15): every card the full 480 pixels where the screen allows, whatever it holds;
+   narrower only on a narrow screen, the 16 pixel gutters kept. */
 body.short main {
+  flex: 0 1 480px;
   max-width: 480px;
   margin: 48px 16px;
   padding: 16px 20px;
diff --git a/src/web/short-page-card.test.ts b/src/web/short-page-card.test.ts
new file mode 100644
index 00000000..6b3d066c
--- /dev/null
+++ b/src/web/short-page-card.test.ts
@@ -0,0 +1,64 @@
+import { describe, expect, it } from 'vitest';
+import { blockAt, clientSheet, cssPixels, themeTokens } from '../../test/support/stylesheets.js';
+
+/**
+ * P1 (plan 8M-15, design 4): every short page's card (`body.short main`, `pages.css`) is the full
+ * 480 pixels where the screen allows, the 16 pixel gutters kept, narrower only on a narrow screen,
+ * however little it holds: a logged-in top page with links only, a one-line answer. Read from the
+ * stylesheet, laid out as a browser lays out a flex item in a row (`body.short` is a flex row that
+ * centers it).
+ */
+
+/** The declarations of the first rule whose head `head` finds, by name. */
+function declarations(css: string, head: RegExp): Map<string, string> {
+  return new Map(
+    [...blockAt(css, head).matchAll(/([a-z-]+)\s*:\s*([^;]+);/gu)].map((found) => [
+      found[1] ?? '',
+      (found[2] ?? '').trim(),
+    ]),
+  );
+}
+
+/**
+ * The width of the card's content box on a screen `screen` pixels wide, its content as wide as
+ * `content` would be unbroken: a flex item's size from its `flex` (or `width`), capped by its
+ * `max-width`, shrunk to the room left by its margins and padding; its content's width where it
+ * has no size of its own.
+ */
+function cardContent(screen: number, content: number): number {
+  const sheet = clientSheet('pages.css');
+  const values = themeTokens();
+  const body = declarations(sheet, /body\.short\s*\{/u);
+  const card = declarations(sheet, /body\.short main\s*\{/u);
+  expect(body.get('display')).toBe('flex');
+  expect(body.get('flex-direction') ?? 'row').toBe('row');
+  const [, side = '0'] = (card.get('margin') ?? '0').split(/\s+/u);
+  const [, across = '0'] = (card.get('padding') ?? '0').split(/\s+/u);
+  const room = screen - 2 * cssPixels(side, values) - 2 * cssPixels(across, values);
+  const flex = (card.get('flex') ?? '').split(/\s+/u);
+  const basis =
+    flex.length === 3 && flex[2] !== 'auto'
+      ? cssPixels(flex[2] ?? '0', values)
+      : card.has('width') && card.get('width') !== 'auto'
+        ? card.get('width') === '100%'
+          ? room
+          : cssPixels(card.get('width') ?? '0', values)
+        : content;
+  const shrinks = flex.length !== 3 || flex[1] !== '0';
+  const most = card.has('max-width') ? cssPixels(card.get('max-width') ?? '0', values) : Infinity;
+  const sized = Math.min(basis, most);
+  return shrinks ? Math.min(sized, room) : sized;
+}
+
+describe("the short pages' card (plan 8M-15, P1)", () => {
+  it('is the full 480 pixels on a wide screen, however little it holds', () => {
+    expect(cardContent(1280, 200)).toBe(480);
+    expect(cardContent(1280, 900)).toBe(480);
+    expect(cardContent(560, 120)).toBe(480);
+  });
+
+  it('is narrower on a narrow screen, the 16 pixel gutters kept', () => {
+    // 360 less two gutters of 16 and two paddings of 20.
+    expect(cardContent(360, 100)).toBe(288);
+  });
+});
````

### Task 5: 8M-15 task 5: Campfire once in the events listing; /help meetup's paragraph (V1, V2)

Prototype commit: `1837cb7ac0f249ddc615504a4b5e42bf29ffcd81`

The listing marks no line; its foot "Official meetups by Community Ambassadors are on Campfire"
with the link when any listed event has the hint. A post keeps its line only for an event shorter
than a day (hasCampfirePostHint beside hasCampfireHint). drawPost's unchanged branch edits an open
post through editEventPost when its message differs; an archived post is left to the hourly draw,
remembered in postsLeft so it is not asked about again. /help meetup: Campfire a paragraph of its own.

**Files:**

```
 docs/architecture/utilities.md        |   8 ++--
 src/commands/meetups/meetup.test.ts   |  13 ++++--
 src/commands/meetups/meetup.ts        |   2 +-
 src/domain/time/event-listing.test.ts |  19 ++++++++
 src/domain/time/event-listing.ts      |  12 +++++
 src/render/events-forum.test.ts       |  32 ++++++++------
 src/render/events-forum.ts            |  31 ++++++-------
 src/services/event-forum.test.ts      | 130 +++++++++++++++++++++++++++++++++++++++++++++++++++---
 src/services/event-forum.ts           |  33 +++++++++++---
 9 files changed, 232 insertions(+), 48 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/meetups/meetup.test.ts src/domain/time/event-listing.test.ts src/render/events-forum.test.ts src/services/event-forum.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 1837cb7ac0f249ddc615504a4b5e42bf29ffcd81 -- src test scripts docs/architecture` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-15 task 5: Campfire once in the events listing; /help meetup's paragraph (V1, V2)`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index cefab08e..7a5bd252 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -40,12 +40,12 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 
 Designs `docs/superpowers/specs/2026-10-28-events-forum-design.md` and `2026-10-28-campfire-links-design.md` (Matt, 2026-10-28 and 29).
 
-- **Campfire is linked, never fetched.** `CAMPFIRE_DISCOVER_URL` (`src/domain/campfire.ts`, pure: the web page imports it too) is Campfire's map of official meetups by Community Ambassadors; it cannot point at a region, and no setting changes it. `/meetup`'s help ends with it; the web map's list ends with "Official meetups: Campfire" (`web.md`); the events forum marks the events whose kind gets the hint. `src/campfire-links.test.ts` refuses Campfire's GraphQL address and `niantic-social-api` in every source under `src/` and `packages/` (Scopely Explore's terms forbid bots and scraping, and its answers carry members' ids and names).
-- **One rule, one read** (`src/domain/time/event-listing.ts`, pure; R4). The listing is read from the very document `RaidEventService` reads (`readListedEvents(json, zone, { max, big })`, with the max and big events as merged with the kept ones, `currentMax` and `currentBig`: one path, review V10, ruling R5): an item of a max kind (`max-mondays`, `max-battles`) takes its times from the max event of its id, whether or not the item has times (assumed hours too, so `maxEventAt` and the listing agree), a Wild Area, GO Tour or GO Fest from its big event, every other item through `everyonesTimes(item, zone)` (`event-reach.ts`), the one reader of an item's times that `parseMaxEventFeed` and `parseBigEventFeed` use as well: `elsewhere` (not everyone's: `isForEveryone`), `none` (a time left out), `unreadable`, or `times`. An item without times is `untimed`: not seen (R3). `isListed`: everyone's kind, outside `UNLISTED_KINDS` (`go-pass`, `season`, `go-battle-league`, `twitch-drops`, `research`, and since the review's ruling R1 `timed-research`, `special-research`, `limited-research`, `research-breakthrough`, `update`, `location-specific`), a `raid-battles` item only when it lasts something and less than a day (review V9) (a one-off raid event; the boss rotations stay out, ruling B); a kind not known (`isKnownKind`) is listed, lines only, and logged once at warn (`an event type the events forum does not know`). `isPosted`: listed and of `POSTED_KINDS` (`community-day`, `raid-day`, `raid-weekend`, `elite-raids` (ruling R1), `max-battles`, `wild-area`, `pokemon-go-tour`, `pokemon-go-fest`, `event`; Leek Duck's type list has no Hatch Day type, checked 2026-10-29 on ScrapedDuck's wiki: a Hatch Day comes as an `event`). `hasCampfireHint`: listed and not in `NO_CAMPFIRE_KINDS` (empty). `eventTimeWords` says times as plain local text, through `zoned.ts`'s short words (`shortDayWords`, `shortDateWords`, `shortHourWords`, review V8) ("Sat, Nov 21, 2–5 PM"; several days "Nov 9 – Nov 13", an end at midnight the day before's), never Discord's stamps (ruling A). `listingSections` gives Now, This week (starting within seven days by the local calendar), Coming up (within `horizonDays`); `postOpensAt` the opening of a post, `postDaysAhead` days before the start.
+- **Campfire is linked, never fetched.** `CAMPFIRE_DISCOVER_URL` (`src/domain/campfire.ts`, pure: the web page imports it too) is Campfire's map of official meetups by Community Ambassadors; it cannot point at a region, and no setting changes it. `/meetup`'s help ends with it, a paragraph of its own (plan 8M-15, V2); the web map's list ends with "Official meetups: Campfire" (`web.md`); the events forum's listing names it once at its foot, and an event's post only for an event shorter than a day (plan 8M-15, V1, below). `src/campfire-links.test.ts` refuses Campfire's GraphQL address and `niantic-social-api` in every source under `src/` and `packages/` (Scopely Explore's terms forbid bots and scraping, and its answers carry members' ids and names).
+- **One rule, one read** (`src/domain/time/event-listing.ts`, pure; R4). The listing is read from the very document `RaidEventService` reads (`readListedEvents(json, zone, { max, big })`, with the max and big events as merged with the kept ones, `currentMax` and `currentBig`: one path, review V10, ruling R5): an item of a max kind (`max-mondays`, `max-battles`) takes its times from the max event of its id, whether or not the item has times (assumed hours too, so `maxEventAt` and the listing agree), a Wild Area, GO Tour or GO Fest from its big event, every other item through `everyonesTimes(item, zone)` (`event-reach.ts`), the one reader of an item's times that `parseMaxEventFeed` and `parseBigEventFeed` use as well: `elsewhere` (not everyone's: `isForEveryone`), `none` (a time left out), `unreadable`, or `times`. An item without times is `untimed`: not seen (R3). `isListed`: everyone's kind, outside `UNLISTED_KINDS` (`go-pass`, `season`, `go-battle-league`, `twitch-drops`, `research`, and since the review's ruling R1 `timed-research`, `special-research`, `limited-research`, `research-breakthrough`, `update`, `location-specific`), a `raid-battles` item only when it lasts something and less than a day (review V9) (a one-off raid event; the boss rotations stay out, ruling B); a kind not known (`isKnownKind`) is listed, lines only, and logged once at warn (`an event type the events forum does not know`). `isPosted`: listed and of `POSTED_KINDS` (`community-day`, `raid-day`, `raid-weekend`, `elite-raids` (ruling R1), `max-battles`, `wild-area`, `pokemon-go-tour`, `pokemon-go-fest`, `event`; Leek Duck's type list has no Hatch Day type, checked 2026-10-29 on ScrapedDuck's wiki: a Hatch Day comes as an `event`). `hasCampfireHint`: listed and not in `NO_CAMPFIRE_KINDS` (empty); an event's post says it only where `hasCampfirePostHint` (plan 8M-15, V1, Matt 2026-10-30): the hint and shorter than a day, `end - start < ONE_OFF_RAID_MS` (a midnight-to-midnight day, exactly 24 hours, gets none). `eventTimeWords` says times as plain local text, through `zoned.ts`'s short words (`shortDayWords`, `shortDateWords`, `shortHourWords`, review V8) ("Sat, Nov 21, 2–5 PM"; several days "Nov 9 – Nov 13", an end at midnight the day before's), never Discord's stamps (ruling A). `listingSections` gives Now, This week (starting within seven days by the local calendar), Coming up (within `horizonDays`); `postOpensAt` the opening of a post, `postDaysAhead` days before the start.
 - **The kept listing** (`mergeListed`): the read's events in the place of the kept ones of their ids; a kept event the read lists without times kept as it is; one no longer listed kept to its end where it has begun, dropped where it has not, unless the read has a new id of the same name (`sameEventName`: a "(Rescheduled)" mark, spaces and case aside) and type that no kept event had: then it moved, and the new event carries the old ids in `formerIds` (R12). What ended is forgotten. `RaidEventService` is the `ListedEventProvider` (`listedEvents()`, `onListedChange`, told after every good read and after `loadListed`), keeps them in `ListedEvent` (migration 033, `ListedEventRepository`, replaced whole after each read as `MaxEvent`; twin `MemoryListedEvents`), loaded before the first read (`loadListed` in `app.ts`, after `loadMax`), and logs moves and drops at info. `listingKnown()` is true once the kept events were loaded or a read succeeded (review V1), and `droppedIds()` names the events a read dropped before their start, each until that start (in memory only). A short read (`isShortRead`: no listed event at all, or every kept event not yet started dropped; branch review BR-1) drops nothing: it is merged all the same (`mergeRead`, re-review RR-1), so its new events, changed times, moves and ends land, but the events it would drop are kept as untimed ones are; it does not by itself make the listing known; the log says `a short read of the events feed; the listing kept`.
 - **The forum** (`settings.channels.events`, a forum's name, blank unset; the moderators' channel may not be it, R13; `settings.eventsForum` `{ horizonDays: 35, postDaysAhead: 14 }`, the second at most the first): `EventForumService` (`src/services/event-forum.ts`), made in `app.ts` only where the settings name a forum and rehearsal mode is off (R8; `ctx.eventForum`). `/admin setup-forums` calls `setup(guildId)`: the forum of that name where the server has one (the name decides: a forum recorded under another name is replaced, and its listing forgotten, R7), else one made beside `bot-updates` (`createForum`, in its category with its permissions), Create Posts kept to the bot (`reservePosts`) and Manage Posts allowed to it (`letBotManagePosts`), recorded in `EventForum` (`EventForumRepository`; another forum retires the server's live post rows in the same transaction, those marked `gone` kept, review V2, so the new forum gets its own posts), then drawn; the name is compared and made as Discord stores it (`channelNameFor` and `channelKey` of `region-import.ts`, lower case, spaces to hyphens, by setup and `cutover-check` alike; review V7, ruling R4); the answer's last line says what it did and could not (a setup that throws: "Events forum: something went wrong (see the log)."); one setup per server runs at a time, a second waits and finds the forum (branch review BR-6); it says who sees the forum but cannot write in its posts, `@everyone` and the map's member role (`settings.web.memberRole`) where named (`rolesWithoutReplies`, BR-7; a role that cannot see the forum is left out, re-review RR-4: role-gated servers keep @everyone out), and `cutover-check` warns of the same. `cutover-check` warns of a named forum the server lacks and of `EVENTS_FORUM_NEEDS` the bot lacks there.
-- **The listing "Events"** (`EVENTS_TITLE`; `listingMessage`, `src/render/events-forum.ts`): one container, `### Events` and the sections' counts ("1 now · 2 coming up", or "No events listed right now."), each section headed with its count (`**Now · 1**`) and its lines by start, within `TEXT_BUDGET` (`fitLines` of the summary: "…and N more", the count kept), and the hint's foot once where a line carries it. A line (`eventLine`): the name (`plain`, linked to its Leek Duck page, masked with `<…>`), the times, the post, `[Campfire](<…>)`. Made pinned and locked (`lockPost`; a moderator's unlock stands), edited in place (an unchanged one is not: `listingSent`), pinned again after each edit (an archived post opened again comes back unpinned; any failed pin, as another post holding the forum's one pin, 30047, is said once per server and the lock, the record and the draw carry on, review V4), its auto-archive a week; where its record is lost or it is gone, one the bot made in the forum is taken over (the pinned open one, else the oldest open, else the latest archived, `archivedPosts`, R2), else a new one is made.
-- **An event's post** (`eventPostMessage`): the name as a heading, the times, "More on Leek Duck", "Official meetups, if any: Campfire", and the feed's `image` as a gallery (Discord loads it or shows nothing; Pine fetches nothing, R6); no buttons, no pings; titled with the event's name (`eventPostTitle`: 100 code points). One per event and server (`EventPost`), made from `postOpensAt` until the end (at once for one listed later or on now); edited when the name or times change, and renamed when the name does (`renamePost`; the row's name follows only a rename done, a wait Discord names is a timer that draws again, review V3); a row whose event moved follows it (`movePost`, a `gone` row too, review V5) and is edited; one dropped before its start (only an id `droppedIds` names, review V1) says "Leek Duck no longer lists this event." and is archived unlocked (`dropped`; its body without link and picture; never linked from the listing; restored, its body drawn anew, where the feed lists the same id again before its end, the revised ruling R2 of the branch review); a quiet post that archived itself before its event's end is opened again by the hourly draw (`postInfo().archived`, review V6, ruling R3; one a moderator locked is left so, BR-4, and one Discord no longer has is marked `gone`, BR-3); a step of one post that fails (make, edit, rename, reopen, archive, auto-archive) is warned once per post and kind until that step works again (`could not update an event post`; re-review RR-2) and the draw goes on with the next post and the listing (`perPost`, BR-5); a stop cuts a draw under way short between posts, the listing not drawn after it (re-review RR-3); after the end its auto-archive is set to a day (`setAutoArchive`, never locked: a member's message reopens it and restarts the day), and one still open three days after the end is archived unlocked once (`archiveUnlocked`, `archivedAt`). A post a moderator deleted is marked `gone`, never made again, and its link leaves the listing.
+- **The listing "Events"** (`EVENTS_TITLE`; `listingMessage`, `src/render/events-forum.ts`): one container, `### Events` and the sections' counts ("1 now · 2 coming up", or "No events listed right now."), each section headed with its count (`**Now · 1**`) and its lines by start, within `TEXT_BUDGET` (`fitLines` of the summary: "…and N more", the count kept), and the hint's foot once where a line carries it. A line (`eventLine`): the name (`plain`, linked to its Leek Duck page, masked with `<…>`), the times, the post; no line names Campfire (plan 8M-15, V1): the foot (`CAMPFIRE_FOOT`) reads "Official meetups by Community Ambassadors are on Campfire", Campfire linked to `CAMPFIRE_DISCOVER_URL`, shown when any listed event has the hint. Made pinned and locked (`lockPost`; a moderator's unlock stands), edited in place (an unchanged one is not: `listingSent`), pinned again after each edit (an archived post opened again comes back unpinned; any failed pin, as another post holding the forum's one pin, 30047, is said once per server and the lock, the record and the draw carry on, review V4), its auto-archive a week; where its record is lost or it is gone, one the bot made in the forum is taken over (the pinned open one, else the oldest open, else the latest archived, `archivedPosts`, R2), else a new one is made.
+- **An event's post** (`eventPostMessage`): the name as a heading, the times, "More on Leek Duck", "Official meetups, if any: Campfire" for an event shorter than a day (`hasCampfirePostHint`), and the feed's `image` as a gallery (Discord loads it or shows nothing; Pine fetches nothing, R6); no buttons, no pings; titled with the event's name (`eventPostTitle`: 100 code points). One per event and server (`EventPost`), made from `postOpensAt` until the end (at once for one listed later or on now); edited when the name or times change, or, since plan 8M-15, when its message differs from the one last sent though they did not (`editEventPost`, so an open multi-day post loses the Campfire line at the next draw; a restarted process knows nothing it sent, so one edit per open post after a restart; it asks `postInfo` first and leaves an archived post to the hourly draw, a locked one as it is, remembering it with that message (`postsLeft`, review R1-4) so that no other draw asks again until the message changes; a locked post that is open is edited, as a post whose event changed is), and renamed when the name does (`renamePost`; the row's name follows only a rename done, a wait Discord names is a timer that draws again, review V3); a row whose event moved follows it (`movePost`, a `gone` row too, review V5) and is edited; one dropped before its start (only an id `droppedIds` names, review V1) says "Leek Duck no longer lists this event." and is archived unlocked (`dropped`; its body without link and picture; never linked from the listing; restored, its body drawn anew, where the feed lists the same id again before its end, the revised ruling R2 of the branch review); a quiet post that archived itself before its event's end is opened again by the hourly draw (`postInfo().archived`, review V6, ruling R3; one a moderator locked is left so, BR-4, and one Discord no longer has is marked `gone`, BR-3); a step of one post that fails (make, edit, rename, reopen, archive, auto-archive) is warned once per post and kind until that step works again (`could not update an event post`; re-review RR-2) and the draw goes on with the next post and the listing (`perPost`, BR-5); a stop cuts a draw under way short between posts, the listing not drawn after it (re-review RR-3); after the end its auto-archive is set to a day (`setAutoArchive`, never locked: a member's message reopens it and restarts the day), and one still open three days after the end is archived unlocked once (`archiveUnlocked`, `archivedAt`). A post a moderator deleted is marked `gone`, never made again, and its link leaves the listing.
 - **When it draws** (one draw at a time, `request` coalescing): after each read of the feed, at the next start, end or post opening among the listed events, or the next moment one comes within a week or within `horizonDays` (`sectionChangesAt`, by the same local calendar as `listingSections`; branch review BR-9) (one timer set anew each draw, a second after it, R10), a second after local midnight (`everyLocalMidnight`, `src/services/local-midnight.ts`, the timer `PartyService.watchMidnight` uses too, R11), in the scheduler's hourly upkeep (`PartySchedulerOptions.eventForum`) and in the catch-up on reconnect (`events forum`). Until `listingKnown()` nothing is drawn (no post made or dropped, the listing left as it is; `/admin setup-forums` says "The listing is posted once the events feed is read."; review V1). A forum that is gone (`channelKind` is no forum) is said once per server at warn (`the events forum is gone`) and nothing is done there until it is back; a refused pin, lock or archive is said once per server.
 
 ## Pictures and emoji
diff --git a/src/commands/meetups/meetup.test.ts b/src/commands/meetups/meetup.test.ts
index 157725d5..21748bc4 100644
--- a/src/commands/meetups/meetup.test.ts
+++ b/src/commands/meetups/meetup.test.ts
@@ -500,11 +500,16 @@ describe('/meetup', () => {
     );
   });
 
-  // Plan 8V-1 (the Campfire links design, 2): one sentence at the end, a link and no fetch.
-  it('ends its help with where the official meetups are: Campfire', () => {
+  // Plan 8V-1 (the Campfire links design, 2): one sentence at the end, a link and no fetch; a
+  // paragraph of its own since plan 8M-15 (V2).
+  it('ends its help with where the official meetups are: Campfire, a paragraph of its own', () => {
     const details = typeof meetup.help.details === 'string' ? meetup.help.details : '';
-    expect(details).toMatch(
-      / Official meetups by Community Ambassadors are on Campfire: https:\/\/campfire\.scopely\.com\/discover$/u,
+    const paragraphs = details.split('\n\n');
+    expect(paragraphs.at(-1)).toBe(
+      'Official meetups by Community Ambassadors are on Campfire: https://campfire.scopely.com/discover',
+    );
+    expect(paragraphs.at(-2)).toMatch(
+      /^A meetup is archived an hour after it is over: .*its post says when\.$/u,
     );
   });
 
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index a3e9dbaf..abed803d 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -278,7 +278,7 @@ export const meetup: SimpleCommand = {
       'change the information with `/info`, and rename it with `/name`. Members sign up with ' +
       'the buttons, as for a raid.\n\nA meetup is archived an hour after it is over: after its ' +
       'end, or without one a day after its start. One whose start was removed goes a day after ' +
-      'it was made, or after its last time was removed; its post says when. Official meetups ' +
+      'it was made, or after its last time was removed; its post says when.\n\nOfficial meetups ' +
       `by Community Ambassadors are on Campfire: ${CAMPFIRE_DISCOVER_URL}`,
     examples: [
       '/meetup name:Community Day picnic near:Riverside Park start:2pm',
diff --git a/src/domain/time/event-listing.test.ts b/src/domain/time/event-listing.test.ts
index 10b5ef75..d04d8079 100644
--- a/src/domain/time/event-listing.test.ts
+++ b/src/domain/time/event-listing.test.ts
@@ -4,6 +4,7 @@ import { readSpawnEventFeed } from '../../../test/support/spawn-events.js';
 import {
   eventTimeWords,
   hasCampfireHint,
+  hasCampfirePostHint,
   isKnownKind,
   isListed,
   isPosted,
@@ -204,6 +205,24 @@ describe('which events are listed, posted and hinted (plan 8V-1, design "Which e
     expect(hasCampfireHint(event({ eventType: 'city-safari' }))).toBe(false);
   });
 
+  // Plan 8M-15 (V1, Matt 2026-10-30): an event's own post names Campfire only for an event shorter
+  // than a day whose kind has the hint.
+  it("names Campfire in an event's post only for one shorter than a day with the hint", () => {
+    const lasting = (hours: number, eventType = 'community-day') =>
+      event({
+        eventType,
+        start: at('2026-11-21T00:00'),
+        end: at('2026-11-21T00:00') + hours * 3_600_000,
+      });
+    expect(hasCampfirePostHint(lasting(3))).toBe(true);
+    expect(hasCampfirePostHint(lasting(23.99))).toBe(true);
+    // Midnight to midnight, exactly a day: none.
+    expect(hasCampfirePostHint(lasting(24))).toBe(false);
+    expect(hasCampfirePostHint(lasting(5 * 24))).toBe(false);
+    // A kind without the hint, however short.
+    expect(hasCampfirePostHint(lasting(3, 'city-safari'))).toBe(false);
+  });
+
   it('names a kind it does not know, once with the first such event, for the log', () => {
     const json = [
       { eventID: 'showcase-1', name: 'Showcase', eventType: 'pokestop-showcase', start: null },
diff --git a/src/domain/time/event-listing.ts b/src/domain/time/event-listing.ts
index ca90b11b..5cb796c1 100644
--- a/src/domain/time/event-listing.ts
+++ b/src/domain/time/event-listing.ts
@@ -123,6 +123,18 @@ export function hasCampfireHint(event: Pick<ListedEvent, 'eventType' | 'start' |
   return isListed(event) && !NO_CAMPFIRE_KINDS.has(event.eventType);
 }
 
+/**
+ * Whether an event's own post says "Official meetups, if any: Campfire" (plan 8M-15, V1; Matt
+ * 2026-10-30): only for an event shorter than a day (`ONE_OFF_RAID_MS`; a midnight-to-midnight
+ * day, exactly 24 hours, gets none) whose kind has the hint (`hasCampfireHint`). The listing names
+ * Campfire once at its foot instead.
+ */
+export function hasCampfirePostHint(
+  event: Pick<ListedEvent, 'eventType' | 'start' | 'end'>,
+): boolean {
+  return hasCampfireHint(event) && event.end - event.start < ONE_OFF_RAID_MS;
+}
+
 /** An address of the web a member may follow or Discord may load. */
 const webAddress = z
   .string()
diff --git a/src/render/events-forum.test.ts b/src/render/events-forum.test.ts
index 0f0eda94..7765f0b1 100644
--- a/src/render/events-forum.test.ts
+++ b/src/render/events-forum.test.ts
@@ -60,20 +60,17 @@ const sections = (over: Partial<ListingSections> = {}): ListingSections => ({
 });
 
 describe('an event’s line of the listing (plan 8V-1)', () => {
-  it('names it, linked to Leek Duck, with its times, its post and Campfire', () => {
+  // Plan 8M-15 (V1): no line is marked Campfire; the foot says it once.
+  it('names it, linked to Leek Duck, with its times and its post', () => {
     expect(eventLine(day, '800000000000000001', ZONE)).toBe(
       '**[Pawniard Community Day](<https://leekduck.com/events/november-communityday2026/>)** · ' +
-        'Sat, Nov 21, 2–5 PM · <#800000000000000001> · ' +
-        '[Campfire](<https://campfire.scopely.com/discover>)',
+        'Sat, Nov 21, 2–5 PM · <#800000000000000001>',
     );
   });
 
   it('names one without a link or post plainly, its name made safe', () => {
     const odd = listedEvent({ ...wild, name: 'Into the *Wild* [2026](x)' });
-    expect(eventLine(odd, undefined, ZONE)).toBe(
-      `**${plain(odd.name)}** · Nov 9 – Nov 13 · ` +
-        '[Campfire](<https://campfire.scopely.com/discover>)',
-    );
+    expect(eventLine(odd, undefined, ZONE)).toBe(`**${plain(odd.name)}** · Nov 9 – Nov 13`);
     expect(plain(odd.name)).toContain('\\*Wild\\*');
   });
 });
@@ -90,14 +87,24 @@ describe('the listing "Events" (plan 8V-1)', () => {
     expect(shown[1]).toBe(`**Now · 1**\n${eventLine(wild, undefined, ZONE)}`);
     expect(shown[2]).toBe(`**This week · 1**\n${eventLine(hour, undefined, ZONE)}`);
     expect(shown[3]).toBe(`**Coming up · 1**\n${eventLine(day, '800000000000000001', ZONE)}`);
+    // Plan 8M-15 (V1): Campfire once, at the foot, with its link.
     expect(shown[4]).toBe(`-# ${CAMPFIRE_FOOT}`);
     expect(CAMPFIRE_FOOT).toBe(
-      'Events marked Campfire may have official meetups by Community Ambassadors there. Pine ' +
-        'only links to it.',
+      'Official meetups by Community Ambassadors are on ' +
+        '[Campfire](<https://campfire.scopely.com/discover>)',
     );
+    expect(shown.slice(0, 4).join('\n')).not.toContain('Campfire');
     expect(JSON.stringify(message)).not.toMatch(/<t:/u);
   });
 
+  it('has no foot where no listed event has the hint', () => {
+    const safari = listedEvent({ ...day, id: 'safari', eventType: 'city-safari' });
+    const shown = texts(
+      listingMessage(sections({ coming: [safari] }), () => undefined, ZONE).components,
+    );
+    expect(shown.join('\n')).not.toContain('Campfire');
+  });
+
   it('says so when nothing is listed, without the foot', () => {
     expect(texts(listingMessage(sections(), () => undefined, ZONE).components)).toEqual([
       `### Events\n${NO_EVENTS}`,
@@ -142,14 +149,11 @@ describe('an event’s post (plan 8V-1)', () => {
     expect(message.mention).toBeUndefined();
   });
 
+  // Plan 8M-15 (V1): an event of a day or more names no Campfire in its post.
   it('goes without a link or picture the feed lacks, and says when Leek Duck dropped it', () => {
     const bare: ListedEvent = { ...wild, image: null };
     const message = eventPostMessage(bare, ZONE, { dropped: true });
-    expect(texts(message.components)).toEqual([
-      '## Into the Wild\nNov 9 – Nov 13\n' +
-        'Official meetups, if any: [Campfire](<https://campfire.scopely.com/discover>)',
-      DROPPED_WORDS,
-    ]);
+    expect(texts(message.components)).toEqual(['## Into the Wild\nNov 9 – Nov 13', DROPPED_WORDS]);
     expect(DROPPED_WORDS).toBe('Leek Duck no longer lists this event.');
     expect(JSON.stringify(message.components)).not.toMatch(/"type":12[,}]/u);
   });
diff --git a/src/render/events-forum.ts b/src/render/events-forum.ts
index 9dca0ca1..bdd2494b 100644
--- a/src/render/events-forum.ts
+++ b/src/render/events-forum.ts
@@ -3,6 +3,7 @@ import { CAMPFIRE_DISCOVER_URL } from '../domain/campfire.js';
 import {
   eventTimeWords,
   hasCampfireHint,
+  hasCampfirePostHint,
   type ListedEvent,
   type ListingSections,
 } from '../domain/time/event-listing.js';
@@ -27,10 +28,14 @@ export const EVENTS_TITLE = 'Events';
 /** What the listing says when nothing is listed. */
 export const NO_EVENTS = 'No events listed right now.';
 
-/** The foot under the listing where a line is marked Campfire. */
-export const CAMPFIRE_FOOT =
-  'Events marked Campfire may have official meetups by Community Ambassadors there. Pine only ' +
-  'links to it.';
+/** The link to Campfire's map, as the foot and a post show it. */
+const CAMPFIRE_LINK = `[Campfire](<${CAMPFIRE_DISCOVER_URL}>)`;
+
+/**
+ * The foot under the listing where any listed event has the Campfire hint: Campfire named once
+ * there, no line marked (plan 8M-15, V1; Matt 2026-10-30).
+ */
+export const CAMPFIRE_FOOT = `Official meetups by Community Ambassadors are on ${CAMPFIRE_LINK}`;
 
 /** What an event's post says once Leek Duck dropped the event before its start. */
 export const DROPPED_WORDS = 'Leek Duck no longer lists this event.';
@@ -43,9 +48,6 @@ export function eventPostTitle(name: string): string {
   return Array.from(name).slice(0, LIMITS.title).join('').trimEnd();
 }
 
-/** The link to Campfire's map, as a line and a post show it. */
-const CAMPFIRE_LINK = `[Campfire](<${CAMPFIRE_DISCOVER_URL}>)`;
-
 /** The section headings, by the domain's sections. */
 const HEADINGS: Readonly<Record<keyof ListingSections, string>> = {
   now: 'Now',
@@ -68,21 +70,20 @@ function nameOf(event: Pick<ListedEvent, 'name' | 'link'>): string {
 }
 
 /**
- * An event's line: its name (linked to Leek Duck), its times as plain local text, its post where
- * it has one, and `Campfire` where its kind gets the hint.
+ * An event's line: its name (linked to Leek Duck), its times as plain local text, and its post
+ * where it has one. No line names Campfire (plan 8M-15, V1): the foot does, once.
  */
 export function eventLine(event: ListedEvent, postId: string | undefined, zone: string): string {
   return [
     nameOf(event),
     eventTimeWords(event.start, event.end, zone),
     ...(postId === undefined ? [] : [`<#${postId}>`]),
-    ...(hasCampfireHint(event) ? [CAMPFIRE_LINK] : []),
   ].join(' · ');
 }
 
 /**
  * The listing (`EVENTS_TITLE`): a head counting the sections, each section with its count and its
- * lines by start (`listingSections`), the hint's foot once where a line carries it, all within
+ * lines by start (`listingSections`), the hint's foot once where a listed event has it, all within
  * `TEXT_BUDGET` (a section that does not fit ends with "…and N more" and keeps its count, as the
  * region's summary does). `postOf` gives an event's post where it has one.
  */
@@ -115,9 +116,9 @@ export function listingMessage(
 
 /**
  * An event's post: its name as a heading, its times, "More on Leek Duck" where the feed links its
- * page, the Campfire hint where its kind gets it, and the feed's picture (Discord loads it or shows
- * nothing; Pine fetches nothing, R6). With `dropped`, the line that Leek Duck no longer lists it.
- * No buttons, and it pings nobody.
+ * page, the Campfire hint for an event shorter than a day whose kind gets it (`hasCampfirePostHint`,
+ * plan 8M-15), and the feed's picture (Discord loads it or shows nothing; Pine fetches nothing,
+ * R6). With `dropped`, the line that Leek Duck no longer lists it. No buttons, and it pings nobody.
  */
 export function eventPostMessage(
   event: ListedEvent,
@@ -128,7 +129,7 @@ export function eventPostMessage(
     `## ${plain(event.name)}`,
     eventTimeWords(event.start, event.end, zone),
     ...(event.link === null ? [] : [`[More on Leek Duck](<${event.link}>)`]),
-    ...(hasCampfireHint(event) ? [`Official meetups, if any: ${CAMPFIRE_LINK}`] : []),
+    ...(hasCampfirePostHint(event) ? [`Official meetups, if any: ${CAMPFIRE_LINK}`] : []),
   ].join('\n');
   const parts: APIComponentInContainer[] = [
     textDisplay(text),
diff --git a/src/services/event-forum.test.ts b/src/services/event-forum.test.ts
index bb94c436..1e30d105 100644
--- a/src/services/event-forum.test.ts
+++ b/src/services/event-forum.test.ts
@@ -1,4 +1,4 @@
-import { describe, expect, it } from 'vitest';
+import { describe, expect, it, vi } from 'vitest';
 import { FakePartyGateway, missingPermissions } from '../../test/support/fake-gateway.js';
 import { heldCall } from '../../test/support/held-call.js';
 import { MemoryEventForums } from '../../test/support/event-forum-store.js';
@@ -8,6 +8,7 @@ import { loadSettings, type Settings } from '../config/settings.js';
 import type { ListedEvent } from '../domain/time/event-listing.js';
 import type { OutgoingMessage } from '../discord/party-gateway.js';
 import { listedEvent } from '../../test/support/event-forum-store-cases.js';
+import { eventPostMessage } from '../render/events-forum.js';
 import { EventForumService } from './event-forum.js';
 
 const SERVER = '412345678901234567';
@@ -43,7 +44,7 @@ function eventForumWith(
   const clock = { now: options.now ?? at('2026-11-10T12:00') };
   const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
   const { log, entries } = createTestLogger();
-  const service = new EventForumService({
+  const deps: ConstructorParameters<typeof EventForumService>[0] = {
     gateway,
     store,
     events: {
@@ -70,7 +71,10 @@ function eventForumWith(
         timer.cancelled = true;
       };
     },
-  });
+  };
+  const service = new EventForumService(deps);
+  /** The service now: the first, or the one of the last restart. */
+  let current = service;
   /**
    * The feed read anew: the listeners told, and the draw waited for. `dropped`: the ids the read
    * dropped before their start.
@@ -79,9 +83,28 @@ function eventForumWith(
     listed.events = events;
     listed.dropped = new Set(dropped);
     for (const listener of listeners) listener();
-    await service.flush();
+    await current.flush();
+  };
+  /** The process started again (plan 8M-15): a new service over the same store and gateway. */
+  const restarted = (): EventForumService => {
+    current.stop();
+    current = new EventForumService(deps);
+    current.start();
+    return current;
+  };
+  return {
+    service,
+    gateway,
+    store,
+    listed,
+    entries,
+    settings,
+    clock,
+    timers,
+    read,
+    listeners,
+    restarted,
   };
-  return { service, gateway, store, listed, entries, settings, clock, timers, read, listeners };
 }
 
 describe('EventForumService: the forum of /admin setup-forums (plan 8V-1)', () => {
@@ -860,3 +883,100 @@ describe('EventForumService: the branch review’s fixes to the posts (BR-3 to B
     );
   });
 });
+
+// Plan 8M-15 (V1): a post of an event of a day or more no longer names Campfire; one whose event
+// is unchanged loses the line at the next draw, edited once.
+describe('EventForumService: a post brought to its message though its event is unchanged (plan 8M-15)', () => {
+  const drawn = async () => {
+    const made = eventForumWith({ events: [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD] });
+    await made.service.setup(SERVER);
+    made.service.start();
+    await made.service.flush();
+    const postOf = async (eventId: string) => {
+      const row = (await made.store.posts(SERVER)).find((one) => one.eventId === eventId);
+      const post = row && made.gateway.posts.get(row.postId);
+      if (!post) throw new Error(`no post of ${eventId}`);
+      return post;
+    };
+    // As plan 8V-1 drew Into the Wild, a multi-day event: with the Campfire line.
+    const wild = await postOf(INTO_THE_WILD.id);
+    const before = eventPostMessage(
+      { ...INTO_THE_WILD, end: INTO_THE_WILD.start + 3_600_000 },
+      ZONE,
+    );
+    expect(words(before)).toContain('Official meetups, if any');
+    wild.message = before;
+    return { ...made, wild, day: await postOf(COMMUNITY_DAY.id) };
+  };
+
+  it('leaves a post whose message is the one last sent, draw after draw', async () => {
+    const { day, read } = await drawn();
+    const edits = day.edits;
+    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
+    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
+    expect(day.edits).toBe(edits);
+    // A short event keeps the line.
+    expect(words(day.message)).toContain('Official meetups, if any');
+  });
+
+  // Review R1-4: after a restart each post is asked about once, and an archived one is not asked
+  // about again at every draw; only the hourly draw asks again. A locked post that is open is
+  // edited, as a post whose event changed is (`editEventPost` edits whatever the lock).
+  it.each([
+    { state: 'open', archived: false, locked: false, asked: 1, edits: 1, hourly: [1, 0] },
+    { state: 'locked, open', archived: false, locked: true, asked: 1, edits: 1, hourly: [1, 0] },
+    {
+      state: 'archived by itself',
+      archived: true,
+      locked: false,
+      asked: 1,
+      edits: 0,
+      hourly: [1, 1],
+    },
+    {
+      state: 'closed and locked',
+      archived: true,
+      locked: true,
+      asked: 1,
+      edits: 0,
+      hourly: [1, 0],
+    },
+  ])(
+    'asks about a post $state once after a restart, and edits it $edits time(s)',
+    async ({ archived, locked, asked, edits, hourly }) => {
+      const { wild, read, restarted, gateway } = await drawn();
+      Object.assign(wild, { archived, locked });
+      const askedAbout = vi.spyOn(gateway, 'postInfo');
+      const asks = () => askedAbout.mock.calls.filter(([postId]) => postId === wild.id).length;
+      const before = wild.edits;
+      const fresh = restarted();
+      await fresh.flush();
+      // Draws of feed reads: asked once, then remembered.
+      await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
+      await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
+      expect(asks()).toBe(asked);
+      expect(wild.edits - before).toBe(edits);
+      expect(wild).toMatchObject({ archived, locked });
+      expect(words(wild.message).includes('Campfire')).toBe(edits === 0);
+      // The hourly draw asks again; it opens and draws anew only a post that archived itself.
+      const [hourlyAsks, hourlyEdits] = hourly;
+      await fresh.upkeep();
+      expect(asks()).toBe(asked + (hourlyAsks ?? 0));
+      expect(wild.edits - before).toBe(edits + (hourlyEdits ?? 0));
+      // And a draw after it asks nothing more.
+      await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
+      expect(asks()).toBe(asked + (hourlyAsks ?? 0));
+    },
+  );
+
+  it('edits a post once after a restart whose message is the one Discord shows already', async () => {
+    const { day, read, restarted } = await drawn();
+    const before = day.edits;
+    const fresh = restarted();
+    await fresh.flush();
+    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
+    // The restarted process knows nothing it sent: one edit, no more.
+    expect(day.edits).toBe(before + 1);
+    expect(words(day.message)).toContain('Official meetups, if any');
+  });
+});
diff --git a/src/services/event-forum.ts b/src/services/event-forum.ts
index 64052482..8f5826fb 100644
--- a/src/services/event-forum.ts
+++ b/src/services/event-forum.ts
@@ -132,6 +132,12 @@ export class EventForumService {
   private readonly listingSent = new Map<string, { postId: string; text: string }>();
   /** What was last sent to each event post (as JSON): the same is not edited again (W1). */
   private readonly postsSent = new BoundedMap<string, string>(POSTS_SENT_KEPT);
+  /**
+   * The message (as JSON) of each post found archived and left so though it differs from what
+   * was sent (plan 8M-15, review R1-4): not asked about again until the message changes or the
+   * hourly draw.
+   */
+  private readonly postsLeft = new BoundedMap<string, string>(POSTS_SENT_KEPT);
   /** The failures of one post's step, said once each (`perPost`, BR-5). */
   private readonly postFailuresTold = new BoundedMap<string, true>(POSTS_SENT_KEPT);
   /** The setup under way of each server (`setup`, BR-6). */
@@ -559,15 +565,32 @@ export class EventForumService {
     if (row.endedAt === null && event && event.end > now) {
       const named = event.name === row.name;
       if (named && event.start === row.start && event.end === row.end) {
-        if (!reopen) return;
-        stage.kind = 'reopen';
+        const message = eventPostMessage(event, zone);
+        // Its message may differ though its event did not (plan 8M-15, V1: a multi-day event's
+        // post loses the Campfire line): brought to it, once; after a restart, which knows
+        // nothing it sent, once per open post. Otherwise only the hourly draw asks Discord.
+        // A post found archived with this message is not asked about again before the hourly
+        // draw or another message (review R1-4: a draw comes with every read, start and end).
+        const text = JSON.stringify(message);
+        const differs = this.postsSent.get(row.postId) !== text;
+        if (!reopen && (!differs || this.postsLeft.get(row.postId) === text)) return;
+        if (reopen) stage.kind = 'reopen';
         const info = await gateway.postInfo(row.postId);
         // Deleted by hand while nothing changed (BR-3).
         if (!info) return this.postGone(row);
-        // A moderator's close and lock stand (BR-4).
-        if (!info.archived || info.locked) return;
+        // A moderator's close and lock stand (BR-4); a post that archived itself is opened only by
+        // the hourly draw (V6), which draws it anew. A locked post that is open is edited, as one
+        // whose event changed is.
+        if (info.archived && (info.locked || !reopen)) {
+          if (differs) this.postsLeft.set(row.postId, text);
+          return;
+        }
+        this.postsLeft.delete(row.postId);
+        if (!info.archived) {
+          if (differs && !(await this.editEventPost(row, message))) return this.postGone(row);
+          return;
+        }
         // An edit opens an archived post, as everything sent or edited in it does.
-        const message = eventPostMessage(event, zone);
         if (!(await gateway.editPost(row.postId, message))) return this.postGone(row);
         this.postsSent.set(row.postId, JSON.stringify(message));
         return;
````

## After the last task

- [ ] `npm run check > var/smallweb-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff 1837cb7ac0f249ddc615504a4b5e42bf29ffcd81 HEAD -- src test scripts` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: the staging checklist `docs/superpowers/plans/2026-10-30-phase-8m15-staging.md`, follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
