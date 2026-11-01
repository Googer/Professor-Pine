# Phase 8M-7: The Web Map's Frame: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the first of the web polish plans (8M-7 to 8M-10, design approved 2026-10-25): the frame everything else sits on.

- **Task 1, the look:** every web page in Discord's look, light and dark by the device, from two sets of the same named values in `theme.css`; Leaflet's popups, tooltips and controls themed; a popup with the colored side bar of a components-v2 container.
- **Task 2, the tiles:** `settings.web.tiles` gains `'stadia'`, the default: Stadia Maps' Alidade Smooth and Smooth Dark, no key (Stadia checks the page's domain), OpenStreetMap for the rest of the visit when Stadia refuses.
- **Task 3, the view:** zoom and pan limits from the server's regions; the start view (your location if granted, the region `/maps` named, where you left it, the whole server); "Show where I am".
- **Task 4, the layers:** a registry of layers with defaults (Raids, Trains, Meetups, Region outlines and, until 8M-9, Gyms on), toggles on desktop, a "Layers" sheet on a phone, gyms clustered by Pine's own grid below zoom 16, stops and Power Spots from zoom 16.
- **Task 5, the raid markers:** a circle on the gym with the boss or egg in its tier's ring, a time badge and a going count, dimmed in its last five minutes, smaller when zoomed out (Matt, 2026-10-25), never grouped; one list for several things at one place.
- **Task 6, the list:** the side pane (on a phone, behind List) of every live thing in the layers shown, sorted Nearest, Soonest or Most going.
- **Task 7, distances:** `settings.distanceUnits`, `'imperial' | 'metric'` (default imperial), one wording `distanceWords` for the map and for Discord (Matt, 2026-10-25), with a guard test against hand-worded units.

**Tech stack:** TypeScript 6.0, Node 24, Leaflet, esbuild and Vitest. No new dependency, no migration, no command option changed (no deploy needed). Two settings: `settings.web.tiles` gains `'stadia'` (now the default), `settings.distanceUnits` is new.

**Spec:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` (approved 2026-10-25), and the brief `.superpowers/sdd/2026-10-25-phase-8m7-web-frame/design.md` (git-ignored) with Matt's rulings in its `fix-list.md` ("Ruled by Matt": the units setting, the smaller raid markers when zoomed out).

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto-8m7` (tip `4a57096e`), one commit per task, on `web-polish` 083b4482 (the two later commits of `web-polish` change only the spec, which no diff touches). Each commit typechecks and passes its tests; on the tip the full check passes (9,727 tests), the build passes and the database suite passes (597 tests).

**Reviews:**

- **The prototype:** an Opus reviewer (findings 1–16), fix round 1, with Matt's two rulings.
- **The fix round:** an Opus re-review (R1–R6: the list's expanded part not refreshed, hand-worded meters on Discord, the labels pane, the small marker's picture, the page's imports, a leftover helper), fix round 2. Folded into the seven commits.

**Conventions:** read `CLAUDE.md` and `docs/architecture/web.md`, `gyms-and-regions.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck and its own test files. The full check, the build and the database suite run once on the tip. Work in `../Professor-Pine-web` on `web-polish`; never commit in the main checkout.

## Review Focus

- A device that switches between light and dark with the page open: the map and the editor redraw in the new scheme (task 1, `theme.test`).
- An address Stadia does not know (a quick tunnel): the first refused tiles switch to OpenStreetMap, never a blank map (task 2, `layers.test`).
- A browser that refused the location: the page opens on the region or the whole server and never asks unprompted (task 3, `view.test`, `your-location.test`).
- Several raids at one gym, or a raid next to a train's ring: one tap lists each (task 5, `shared-place.test`).
- A server set to metric: every distance on the map and on Discord in meters and kilometers (task 7, `distance-words.test`, `text-distances.test`).

---

## Tasks

### Task 1: 8M-7 task 1: the web pages in Discord's look, light and dark

Prototype commit: `cdd3ccba46a402c52b7e3be3eff8e80cf6878e1f`

theme.css holds two sets of the same named values, light in :root and dark under
prefers-color-scheme, in Discord's greys, blurple, green and red. The map, the
region editor, /userscript and the short pages (built as assets/page.css) load it
and follow the device; every page's head says color-scheme light dark. Leaflet's
popups, tooltips and controls take the theme; a popup has the colored side bar of
a components-v2 container; a press is colored as the post's button. theme.ts reads
the values again when the scheme changes (ThemeWatch) and the map and the editor
draw anew.

**Files:**

```
 docs/architecture/testing.md   |   2 +-
 docs/architecture/web.md       |   4 +-
 scripts/web/build.ts           |  21 +++++++++-
 src/web/answers.ts             |  19 ++++++++-
 src/web/client/common.ts       |  18 ++++++++-
 src/web/client/editor.css      |  19 +++++++--
 src/web/client/editor.ts       |   7 +++-
 src/web/client/main.ts         |  13 +++++--
 src/web/client/map.css         | 342 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----------------------------------
 src/web/client/pages.css       |  55 ++++++++++++++++++++++++++
 src/web/client/parties.test.ts |  24 ++++++++++++
 src/web/client/parties.ts      |  15 +++++++-
 src/web/client/party-layer.ts  |   7 +++-
 src/web/client/theme.css       | 179 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------------
 src/web/client/theme.test.ts   |  53 ++++++++++++++++++++++++-
 src/web/client/theme.ts        |  82 +++++++++++++++++++++++++++++++++++----
 src/web/client/userscript.css  |  43 ++++++++++++++-------
 src/web/editor-page.test.ts    |   2 +
 src/web/page-theme.test.ts     |  27 ++++++++++++-
 src/web/page.test.ts           |  31 +++++++++++++++
 src/web/page.ts                |   6 ++-
 src/web/tool-page.test.ts      |   4 +-
 src/web/tool-page.ts           |   3 +-
 23 files changed, 827 insertions(+), 149 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/parties.test.ts src/web/client/theme.test.ts src/web/editor-page.test.ts src/web/page-theme.test.ts src/web/page.test.ts src/web/tool-page.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff cdd3ccba46a402c52b7e3be3eff8e80cf6878e1f -- src test scripts data docs/architecture docs/guides docs/web-setup.md docs/superpowers/plans/phase-0-follow-ups.md CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-7 task 1: the web pages in Discord's look, light and dark`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index e88f63e9ebb329e97f1b77dcb8d8e384e6814c0c..cd3c3f4c1174b60de9758b695c3ad1a6f538afd1 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -88,7 +88,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Max battles on the map (plan 8X-5): `maxReportingWith(safety, rows)` (`test/support/max-reporting.ts`) gives the services of `reportsWith` (without the moderators' channel unless `safety` names it), the max bosses of the recorded feed, the recorded max and big events, the kept Power Spot `SPOT_ROW` at `TEST_SPOT` (and `rows`), and a context over them whose place search is built (`ctx`); fake `Date` to `MAX_THURSDAY` (an ordinary Thursday, 14:00) first, and set the web server's `clock.now` to it (move both together to pass time). `maxWebWith(ctx, { channelName })` gives the web server what `/max` reads and calls; pass it as `maxes` beside `partyWebWith(made, …)`, whose `maxLook` shows a max battle as its post does (`reportedMax` for one made through the service). Without it every use of the max deps throws. A block at a pin: `made.storage.addBlock`; the moderators' notice: `made.reports.flush()`, then `made.gateway.messagesIn(MOD_CHANNEL)`; a spot in two regions: East's outline reaching into West (`made.regions.rows`), as for spawns.
 - Reports at stops on the map (plan 8R-3): `stopReportingWith(rows)` (`test/support/stop-reporting.ts`) gives the party services of `partyServiceWith` (`made`: its fake gateway holds the forums, who is barred, and the grunts' messages), the kept stops of `STOP_ROWS` (PokéStops 1 and 2 in West, 3 in East, a Power Spot) or `rows` (`wayspots`, the directory: `setPineStops` for stops of Pine's own), and a context with `StopReportService` over `MemoryStopReports` (`store`), `GruntMessageService` (`grunts`, over `gruntStore`; its timers never run) and `RocketService`; fake `Date` to `STOP_NOON` and set the web server's `clock.now` to it. `stopWebWith(ctx, { channelName, posts, grunts })` gives the web server what `/research` and `/rocket` read and call; pass it as `stops` beside `partyWebWith(made.made, …)` (whose `forums` the shared `PartyViewers` asks); `posts` is a `linkOf` of the test's (none by default), `grunts` the context's `grunts` for the grunts' links. Without it every use of the stops' deps throws. A command's window is filled under `researchWindow(settings)` or `rocketWindow(settings)` with `researchThrottle` / `rocketThrottle` (the varied keys the router counts them under), a take-back's under `RESEARCH_REMOVE` / `ROCKET_REMOVE` with `MEMBER_WRITE_THROTTLE`. A hideout reported between the route's look and the report: `vi.spyOn(made.ctx.stopReports, 'rocketAt').mockResolvedValueOnce(undefined)` (`stop-report-post.test.ts`).
 - Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode, the Move panel) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events, the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the right click on a raid's picture or dot runs the real Leaflet in `party-layer-contextmenu.isolated.test.ts` (plan 8W-3): globals stubbed in `vi.hoisted` with just enough of a browser for Leaflet to load (no DOM library), a map made of `L.Map.prototype` with its container, a pane, the marker's element made its target by `addInteractiveTarget`, the pointer's place given by stubbing the map's conversions, and `_fireDOMEvent` as Leaflet calls it; a marker that listens is the control that shows the test can fail. The rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
-- The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a colour written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define; `theme.test.ts` reads a theme through a fake reader (`readTheme`). It lives outside `src/web/client/` because the client's type check has no Node.
+- The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a color written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define, and checks that its light and dark sets name the same values and that every page's stylesheet imports it (plan 8M-7); `theme.test.ts` reads a theme through a fake reader (`readTheme`) and a change of scheme through a fake `matchMedia` (`ThemeWatch`). It lives outside `src/web/client/` because the client's type check has no Node.
 - `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
 
 ## Operations
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index b4aeb06d1cae622ff6ca48da0851eee8b45e4126..60b9d6a09921a402d4f4d62e6e813971139c656b 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -132,8 +132,8 @@ The tool that makes the Wayspot export is private (`wayfarer.md`); the owner's i
 
 ## Restyling the page
 
-- Every colour of the map and the region editor, and the sizes a restyle would touch (the font and its size, the corners' radius, the widths of the map's side panel and the editor's panel), is a custom property in one block, `:root` of `src/web/client/theme.css` (plan 8M-6). `map.css` imports it and `editor.css` imports `map.css`, so both pages have it; their rules use `var(--…)` and write no colour themselves. The colours Leaflet draws from TypeScript (region outlines, gym dots, a raid's dot, a train's line, a meetup's ring, the PokéStops while a place is picked, and everything the region editor draws: its regions in turn, `--region-1` to `--region-8`, places, overlaps, gaps, fixes) are read from the same properties once, at the page's first drawing (`theme()`, `src/web/client/theme.ts`, which names each property in `DRAWN_COLOURS` and `REGION_PALETTE`; the stylesheet loads before the deferred script; a property it lacks draws grey). A raid's ring and route mode's numbers share `--raid` and `--train` with what Leaflet draws.
-- To try a change: edit a value in `theme.css`, run `npm run web:build`, and reload the page (the bundle's names change with its content). A new colour is a new property in `theme.css`, used through `var(--…)`, or named in `theme.ts` for what Leaflet draws. `page-theme.test.ts` refuses a colour written anywhere else in `src/web/client/` and its folders: in a stylesheet but `theme.css`, a hex value, a colour function (`rgb(`, `rgba(`, `hsl(`, `hsla(`, `oklch(`, `color-mix(`) or one of the usual named colours (`white`, `red`, … ; `transparent`, `inherit`, `currentColor` and `none` are allowed) anywhere in a value; in the pages' TypeScript, a hex value or a colour function anywhere in a string or a template (read with the TypeScript parser, comments aside), or a string that is a named colour (a sentence may name a colour: "shown in red"), but for `MISSING_COLOUR` of `theme.ts`, the grey of a property the stylesheet lacks. It also refuses a property used or drawn that `theme.css` does not define. The CSP is unchanged: the properties are in the bundled stylesheet, never inline.
+- Every color of every page Pine serves, and the sizes a restyle would touch (the font and its size, the corners' radius, a card's radius and side bar, the widths of the map's side pane and the editor's panel), is a custom property of `src/web/client/theme.css` (plan 8M-6), in two sets of the same names (plan 8M-7): light in `:root`, dark in `@media (prefers-color-scheme: dark) { :root { … } }`, so that each page follows the device's light or dark (no switch on the page). The look is Discord's: its grays (dark: the page `#313338`, panels and cards `#2b2d31`, `#1e1f22` beneath; light: white, `#f2f3f5`, `#e3e5e8`), blurple `--primary` buttons, grey `--secondary` ones, `--success` green `#248046` and `--danger` red `#da373c` as the posts' buttons use them (a press on the map is colored as the post's: Join primary, Here success, Leave danger, the rest secondary; `PRESS_STYLES`, `parties.ts`), cards with the colored side bar of a components-v2 container (a popup's side bar is the color of what it shows: `--raid`, `--train`, `--meetup`, `--gym`; Leaflet's popups, tooltips, controls and attribution restyled to the theme in `map.css`), and the system font (Discord's own is not free). `map.css` imports it and `editor.css` imports `map.css`; `userscript.css` (`/userscript`) and `pages.css` (the short pages of `answers.ts`: a failure, `/`, a login link's page, the login a page needs; built as `assets/page.css`, a name without a hash, since those pages are answered where the manifest is not at hand, `SHORT_PAGE_STYLE`; without a build they are plain) import it too; their rules use `var(--…)` and write no color themselves. The header's controls never wrap their words; the member's name is one button whose small menu holds Log out (`showAccount`, `.account-menu`, closed on Escape and a click outside it), and narrower than 768 pixels the map's title is "Pine" (fix round 1). Every page's head says `<meta name="color-scheme" content="light dark">` (`COLOR_SCHEME_META`), so the browser's own parts follow. The colors Leaflet draws from TypeScript (region outlines, gym dots, a raid's dot, a train's line, a meetup's ring, the PokéStops while a place is picked, and everything the region editor draws: its regions in turn, `--region-1` to `--region-8`, places, overlaps, gaps, fixes) are read from the same properties at the page's first drawing and again when the device changes between light and dark (`theme()`, `src/web/client/theme.ts`, which names each property in `DRAWN_COLOURS` and `REGION_PALETTE`; `ThemeWatch` over `matchMedia('(prefers-color-scheme: dark)')`, `onThemeChange`; the stylesheet loads before the deferred script; a property it lacks draws grey): the map sets its outlines' and gyms' style anew and draws its parties anew (under a form being filled in, once it closes), the region editor draws its regions anew (its places keep their colors in both sets; only what was near black, `--fix-line` and `--preview`, turns light in dark). A raid's ring and route mode's numbers share `--raid` and `--train` with what Leaflet draws.
+- To try a change: edit a value in `theme.css`, run `npm run web:build`, and reload the page (the bundle's names change with its content). A new colour is a new property in `theme.css`, used through `var(--…)`, or named in `theme.ts` for what Leaflet draws. `page-theme.test.ts` checks that the light and dark sets name the same values and that every page's stylesheet imports `theme.css`, and refuses a colour written anywhere else in `src/web/client/` and its folders: in a stylesheet but `theme.css`, a hex value, a colour function (`rgb(`, `rgba(`, `hsl(`, `hsla(`, `oklch(`, `color-mix(`) or one of the usual named colours (`white`, `red`, … ; `transparent`, `inherit`, `currentColor` and `none` are allowed) anywhere in a value; in the pages' TypeScript, a hex value or a colour function anywhere in a string or a template (read with the TypeScript parser, comments aside), or a string that is a named colour (a sentence may name a colour: "shown in red"), but for `MISSING_COLOUR` of `theme.ts`, the grey of a property the stylesheet lacks. It also refuses a property used or drawn that `theme.css` does not define. The CSP is unchanged: the properties are in the bundled stylesheet, never inline.
 
 ## Adding a route
 
diff --git a/scripts/web/build.ts b/scripts/web/build.ts
index c050f9bb66490b0ad9042440de1ee37b20372ecb..e8949ec1a38e91ab127706ef1579e197af4820eb 100644
--- a/scripts/web/build.ts
+++ b/scripts/web/build.ts
@@ -10,7 +10,8 @@ import { build } from 'esbuild';
  * Wayspot export tool (plan 8W-P: `assets/userscript-<hash>.js` and `.css`), each an IIFE for
  * ES2022, minified, with Leaflet's pictures, every file named by a hash of its content so that
  * the server can let browsers keep them for good; `dist/web/assets.json` names each page's
- * script and style and the worker. The folder is emptied first, so no old file stays; the rest
+ * script and style and the worker. The short pages' stylesheet (plan 8M-7) is `assets/page.css`,
+ * a name without a hash, which the server names without the manifest. The folder is emptied first, so no old file stays; the rest
  * of `dist/web/` is the compiled server code of `src/web/` and is left alone.
  */
 
@@ -54,7 +55,23 @@ const result = await build({
   logLevel: 'warning',
 });
 
-const outputs = Object.keys(result.metafile.outputs).map((file) => path.basename(file));
+// The short pages' stylesheet (plan 8M-7: `pages.css` with `theme.css`), under a name of its own
+// without a hash: those pages are answered where the manifest is not at hand (`answers.ts`).
+const pages = await build({
+  entryPoints: [{ in: path.join(client, 'pages.css'), out: 'page' }],
+  outdir: assets,
+  entryNames: '[name]',
+  bundle: true,
+  minify: true,
+  charset: 'utf8',
+  metafile: true,
+  logLevel: 'warning',
+});
+
+const outputs = [
+  ...Object.keys(result.metafile.outputs),
+  ...Object.keys(pages.metafile.outputs),
+].map((file) => path.basename(file));
 const named = (pattern: RegExp): string => {
   const found = outputs.find((file) => pattern.test(file));
   if (found === undefined) throw new Error(`the build made no ${pattern}: ${outputs.join(', ')}`);
diff --git a/src/web/answers.ts b/src/web/answers.ts
index 481767329e15c307e7ce2b05a9cdf6e3da697612..7d90a6445b231a18d3a8333b43eb18cdde3d1d2f 100644
--- a/src/web/answers.ts
+++ b/src/web/answers.ts
@@ -28,12 +28,29 @@ export function escapeHtml(text: string): string {
     .replace(/'/g, '&#39;');
 }
 
+/**
+ * Says that a page is drawn light or dark as the device is (plan 8M-7): the browser's own parts
+ * (fields, scroll bars) follow, and the page's stylesheet takes the dark set of `theme.css`.
+ */
+export const COLOR_SCHEME_META = '<meta name="color-scheme" content="light dark">';
+
+/**
+ * The stylesheet of the short pages (plan 8M-7): `pages.css` with `theme.css`, built under a
+ * name of its own without a hash (`scripts/web/build.ts`), since these pages are answered where
+ * the bundle's manifest is not at hand; asked again at each load (`no-cache`). Without a build
+ * the page is plain, as before.
+ */
+export const SHORT_PAGE_STYLE = '/assets/page.css';
+
 /** A short page of one sentence, and what follows it (HTML of ours). */
 function page(sentence: string, more = ''): string {
   return (
     '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
     '<meta name="viewport" content="width=device-width, initial-scale=1">' +
-    `<title>Professor Pine</title></head><body><p>${escapeHtml(sentence)}</p>${more}</body></html>`
+    COLOR_SCHEME_META +
+    `<link rel="stylesheet" href="${SHORT_PAGE_STYLE}">` +
+    '<title>Professor Pine</title></head>' +
+    `<body class="short"><main><p>${escapeHtml(sentence)}</p>${more}</main></body></html>`
   );
 }
 
diff --git a/src/web/client/common.ts b/src/web/client/common.ts
index 7304eff05dd0282dfa0e626b5e8ad178afb6d84b..83cfea37f76428f6b69df1b64693ab43012f8cfe 100644
--- a/src/web/client/common.ts
+++ b/src/web/client/common.ts
@@ -176,7 +176,23 @@ export async function showAccount(
         say(LOGOUT_FAILED);
       });
     });
-    account.append(name, logout);
+    // One button with the member's name, whose small menu holds Log out (fix round 1): one row of
+    // the header on a phone. It closes on Escape and on a click outside it.
+    const menu = document.createElement('details');
+    menu.className = 'account-menu';
+    const summary = document.createElement('summary');
+    summary.append(name);
+    const items = document.createElement('div');
+    items.className = 'menu';
+    items.append(logout);
+    menu.append(summary, items);
+    document.addEventListener('keydown', (event) => {
+      if (event.key === 'Escape') menu.open = false;
+    });
+    document.addEventListener('click', (event) => {
+      if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
+    });
+    account.append(menu);
   }
   for (const text of header.lines) {
     const line = document.createElement('span');
diff --git a/src/web/client/editor.css b/src/web/client/editor.css
index 83de111296f6f9928bbb8d4111ac046f9f1f0aae..b2af562237e31a4aa21a1ad770dc867258a67d67 100644
--- a/src/web/client/editor.css
+++ b/src/web/client/editor.css
@@ -7,16 +7,23 @@
   gap: 6px;
 }
 
-#tools button {
-  color: var(--text);
+#tools button,
+#panel button {
+  color: var(--secondary-text);
   background: var(--tool-bg);
   border: 0;
   border-radius: var(--radius);
   padding: 4px 10px;
   font: inherit;
+  font-weight: 500;
   cursor: pointer;
 }
 
+#tools button:hover,
+#panel button:hover {
+  background: var(--secondary-hover);
+}
+
 #tools button:disabled {
   opacity: 0.5;
   cursor: default;
@@ -33,7 +40,8 @@
   max-width: 45vw;
   overflow-y: auto;
   padding: 8px 12px;
-  border-left: 1px solid var(--panel-border);
+  border-left: 1px solid var(--line);
+  background: var(--panel-bg);
   font-size: 14px;
 }
 
@@ -61,6 +69,11 @@
   display: block;
   width: 100%;
   margin: 4px 0;
+  padding: 4px 8px;
+  border: 1px solid var(--field-border);
+  border-radius: var(--radius);
+  background: var(--field-bg);
+  color: var(--text);
   font: inherit;
   box-sizing: border-box;
 }
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index a644b36f4d8f6dcd7131c7fe0e7c251b93639a0b..d606cf1a4652b2d4a7e07c4979d93fddf8b06dd6 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -72,7 +72,7 @@ import { tileLayers } from './layers.js';
 import { loginNotice, type Me } from './notice.js';
 import { regionLabel, renderNode } from './popup.js';
 import { browserStorage, readStaged, writeStaged } from './staged-storage.js';
-import { theme, type Theme } from './theme.js';
+import { onThemeChange, theme, type Theme } from './theme.js';
 
 /**
  * The region editor (spec 4, plan 8M-2), bundled by `scripts/web/build.ts` beside the map:
@@ -281,6 +281,11 @@ class Editor {
 
   start(): void {
     const { map, data } = this;
+    // The device changed between light and dark (plan 8M-7): the regions drawn anew in the new
+    // set (the places keep their colors in both: `theme.css`).
+    onThemeChange(() => {
+      this.redraw();
+    });
     const others = L.layerGroup(
       data.others.map((other) =>
         // Not editable, but snapped to: shared borders meet.
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index dbb2e8db962b5db1032b858e5e56bec39b0531e7..dbd5b805bede347cebf85045f4153608ce53eaae 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -7,7 +7,7 @@ import { loginNotice } from './notice.js';
 import { GYM_DOT, gymClicks, showParties } from './party-layer.js';
 import { gymPopup, regionLabel, renderNode, type MapGym } from './popup.js';
 import { heldContent } from './raid-forms.js';
-import { theme } from './theme.js';
+import { onThemeChange, theme } from './theme.js';
 
 /**
  * The map page (spec 3.1), bundled by `scripts/web/build.ts`: Leaflet with the tiles of
@@ -48,15 +48,15 @@ async function showGeo(
   const view = await getJson<GeoView>(`/s/${guild}/api/geo`);
   const names = new Map(view.regions.map((region) => [region.id, region.name]));
   const regions = L.featureGroup();
-  for (const region of view.regions) {
+  const outlines = view.regions.map((region) =>
     L.polygon(region.outline, { color: theme().colours.region, weight: 2, fillOpacity: 0.05 })
       .bindTooltip(renderNode(regionLabel(region.name), document), {
         permanent: true,
         direction: 'center',
         className: 'region-label',
       })
-      .addTo(regions);
-  }
+      .addTo(regions),
+  );
   regions.addTo(map);
   const dots = view.gyms.map((gym: MapGym) => ({
     gym,
@@ -80,6 +80,11 @@ async function showGeo(
     gymClicks(dot, () => gymExtras.clicked(gym));
   }
   const gyms = L.featureGroup(dots.map(({ dot }) => dot)).addTo(map);
+  // The device changed between light and dark (plan 8M-7): what Leaflet drew takes the new set.
+  onThemeChange(({ colours }) => {
+    for (const outline of outlines) outline.setStyle({ color: colours.region });
+    for (const { dot } of dots) dot.setStyle({ color: colours.gym });
+  });
   const all = regions.getBounds().isValid() ? regions.getBounds() : gyms.getBounds();
   if (all.isValid()) map.fitBounds(all);
   else say('This server has no regions yet.');
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 88c35fe68fb8caf23aa1a76170ff7dda0eb5b780..8774efdf0731ded61a94c6c7c70190236a21bb3a 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1,6 +1,11 @@
 @import 'leaflet/dist/leaflet.css';
 @import './theme.css';
 
+/*
+ * The live map (and, through `editor.css`, the region editor) in Discord's look (plan 8M-7):
+ * every color a named value of `theme.css`, light or dark as the device is.
+ */
+
 html,
 body {
   height: 100%;
@@ -13,32 +18,40 @@ body {
   font-family: var(--font);
   font-size: var(--font-size);
   color: var(--text);
+  background: var(--page-bg);
 }
 
 [hidden] {
   display: none !important;
 }
 
+a {
+  color: var(--link);
+}
+
 #header {
   display: flex;
   flex-wrap: wrap;
   align-items: center;
-  gap: 8px 16px;
+  gap: 8px 12px;
   padding: 8px 12px;
-  background: var(--header-bg);
-  color: var(--header-text);
+  background: var(--panel-bg);
+  color: var(--text);
+  border-bottom: 1px solid var(--line);
 }
 
 #header .title {
-  font-weight: 600;
+  font-weight: 700;
 }
 
 #filter {
   flex: 1 1 180px;
-  max-width: 320px;
-  padding: 4px 8px;
+  max-width: 280px;
+  padding: 6px 10px;
   border: 1px solid var(--field-border);
   border-radius: var(--radius);
+  background: var(--field-bg);
+  color: var(--text);
   font: inherit;
 }
 
@@ -52,19 +65,81 @@ body {
 
 #account a,
 #account button {
-  color: var(--login-text);
-  background: var(--login-bg);
+  color: var(--secondary-text);
+  background: var(--secondary);
   border: 0;
   border-radius: var(--radius);
-  padding: 4px 10px;
+  padding: 6px 12px;
   font: inherit;
+  font-weight: 500;
   text-decoration: none;
   cursor: pointer;
 }
 
+#account a.login {
+  color: var(--on-color);
+  background: var(--primary);
+}
+
+#account a.login:hover {
+  background: var(--primary-hover);
+}
+
+#account button:hover {
+  background: var(--secondary-hover);
+}
+
 #account .line {
   font-size: 13px;
-  opacity: 0.9;
+  color: var(--muted);
+}
+
+/* The header's controls never wrap their words (fix round 1). */
+#header button,
+#header a,
+#header summary {
+  white-space: nowrap;
+}
+
+/* The member's name as one button, whose small menu holds Log out (fix round 1). */
+.account-menu {
+  position: relative;
+}
+
+.account-menu summary {
+  padding: 6px 12px;
+  border-radius: var(--radius);
+  background: var(--secondary);
+  color: var(--secondary-text);
+  font-weight: 500;
+  cursor: pointer;
+  list-style: none;
+}
+
+.account-menu summary::-webkit-details-marker {
+  display: none;
+}
+
+.account-menu summary::after {
+  content: ' ▾';
+}
+
+.account-menu .menu {
+  position: absolute;
+  z-index: 1100;
+  top: calc(100% + 6px);
+  right: 0;
+  padding: 8px;
+  border-radius: var(--card-radius);
+  background: var(--card-bg);
+  box-shadow: 0 8px 24px var(--shadow);
+}
+
+/* Narrower than 768 pixels the title is "Pine" (fix round 1). */
+@media (max-width: 767px) {
+  #header .title-first {
+    display: none;
+  }
 }
 
 #notice,
@@ -90,7 +165,7 @@ body {
   width: var(--panel-width);
   overflow-y: auto;
   padding: 8px 12px;
-  border-left: 1px solid var(--panel-border);
+  border-left: 1px solid var(--line);
   background: var(--panel-bg);
 }
 
@@ -108,10 +183,171 @@ body {
     width: auto;
     max-height: 40vh;
     border-left: 0;
-    border-top: 1px solid var(--panel-border);
+    border-top: 1px solid var(--line);
   }
 }
 
+/* Leaflet's own parts, in the theme's colors. */
+.leaflet-container {
+  background: var(--map-bg);
+  font: inherit;
+}
+
+.leaflet-container a {
+  color: var(--link);
+}
+
+.leaflet-bar a,
+.leaflet-bar a:hover {
+  background: var(--panel-bg);
+  color: var(--text);
+  border-bottom-color: var(--line);
+}
+
+.leaflet-bar a:hover {
+  background: var(--deep-bg);
+}
+
+.leaflet-touch .leaflet-bar,
+.leaflet-bar {
+  border-color: var(--line);
+  box-shadow: 0 2px 6px var(--shadow);
+}
+
+.leaflet-control-layers,
+.leaflet-control-layers-expanded {
+  background: var(--panel-bg);
+  color: var(--text);
+}
+
+.leaflet-control-attribution,
+.leaflet-container .leaflet-control-attribution {
+  background: var(--label-bg);
+  color: var(--muted);
+}
+
+.leaflet-popup-content-wrapper {
+  background: var(--card-bg);
+  color: var(--text);
+  border-radius: var(--card-radius);
+  border-left: var(--card-bar) solid var(--accent);
+  box-shadow: 0 8px 24px var(--shadow);
+}
+
+.leaflet-popup-tip {
+  background: var(--card-bg);
+  box-shadow: 0 3px 14px var(--shadow);
+}
+
+.leaflet-container a.leaflet-popup-close-button {
+  color: var(--muted);
+}
+
+/* The side bar of a card, as a components-v2 container's: the color of what it shows. */
+.leaflet-popup-content-wrapper:has(.party-popup.raid),
+.leaflet-popup-content-wrapper:has(.party-popup.raids) {
+  border-left-color: var(--raid);
+}
+
+.leaflet-popup-content-wrapper:has(.party-popup.train) {
+  border-left-color: var(--train);
+}
+
+.leaflet-popup-content-wrapper:has(.party-popup.meetup) {
+  border-left-color: var(--meetup);
+}
+
+.leaflet-popup-content-wrapper:has(.gym-popup) {
+  border-left-color: var(--gym);
+}
+
+.leaflet-tooltip {
+  background: var(--card-bg);
+  color: var(--text);
+  border-color: var(--line);
+  box-shadow: 0 1px 3px var(--shadow);
+}
+
+.leaflet-tooltip-top::before {
+  border-top-color: var(--card-bg);
+}
+
+.leaflet-tooltip-bottom::before {
+  border-bottom-color: var(--card-bg);
+}
+
+.leaflet-tooltip-left::before {
+  border-left-color: var(--card-bg);
+}
+
+.leaflet-tooltip-right::before {
+  border-right-color: var(--card-bg);
+}
+
+/* Discord's buttons: gray secondary by default, blurple primary, green success, red danger. */
+.press,
+.report-raid,
+.report-spawn,
+.new-train,
+.new-meetup,
+.meetup-here {
+  padding: 4px 12px;
+  border: 0;
+  border-radius: var(--radius);
+  background: var(--secondary);
+  color: var(--secondary-text);
+  font: inherit;
+  font-size: 14px;
+  font-weight: 500;
+  cursor: pointer;
+}
+
+.press:hover,
+.report-raid:hover,
+.report-spawn:hover,
+.new-train:hover,
+.new-meetup:hover,
+.meetup-here:hover {
+  background: var(--secondary-hover);
+}
+
+.press.primary {
+  background: var(--primary);
+  color: var(--on-color);
+}
+
+.press.primary:hover {
+  background: var(--primary-hover);
+}
+
+.press.success {
+  background: var(--success);
+  color: var(--on-color);
+}
+
+.press.success:hover {
+  background: var(--success-hover);
+}
+
+.press.danger {
+  background: var(--danger);
+  color: var(--on-color);
+}
+
+.press.danger:hover {
+  background: var(--danger-hover);
+}
+
+.press:disabled,
+.report-raid:disabled,
+.report-spawn:disabled,
+.new-train:disabled,
+.new-meetup:disabled,
+.meetup-here:disabled {
+  opacity: 0.5;
+  cursor: default;
+}
+
 .party-list {
   margin: 0;
   padding: 0;
@@ -120,12 +356,12 @@ body {
 
 .party-list > li {
   padding: 8px 0;
-  border-bottom: 1px solid var(--divider);
+  border-bottom: 1px solid var(--line);
 }
 
 .party-popup .name {
   display: block;
-  font-size: 15px;
+  font-size: 16px;
 }
 
 .party-popup .tier {
@@ -135,7 +371,7 @@ body {
 .party-popup.raids > .raid + .raid {
   margin-top: 8px;
   padding-top: 8px;
-  border-top: 1px solid var(--divider);
+  border-top: 1px solid var(--line);
 }
 
 .party-popup .countdown {
@@ -156,32 +392,30 @@ body {
 .party-popup .presses {
   display: flex;
   flex-wrap: wrap;
-  gap: 4px;
-  margin-top: 6px;
-}
-
-.party-popup .press {
-  padding: 3px 10px;
-  border: 1px solid var(--button-border);
-  border-radius: var(--radius);
-  background: var(--button-bg);
-  font: inherit;
-  cursor: pointer;
-}
-
-.party-popup .press:disabled {
-  opacity: 0.5;
-  cursor: default;
+  gap: 6px;
+  margin-top: 8px;
 }
 
 .party-popup .post-link {
   display: inline-block;
-  margin-top: 6px;
+  margin-top: 8px;
+}
+
+.party-popup select,
+.raid-form input,
+.raid-form select,
+.raid-form textarea {
+  padding: 4px 8px;
+  border: 1px solid var(--field-border);
+  border-radius: var(--radius);
+  background: var(--field-bg);
+  color: var(--text);
+  font: inherit;
 }
 
 .raid-icon {
   border-radius: 50%;
-  background: var(--raid-icon-bg);
+  background: var(--marker-bg);
   box-shadow: 0 0 0 2px var(--raid);
 }
 
@@ -199,7 +433,7 @@ body {
 
 .gym-popup .name {
   display: block;
-  font-size: 15px;
+  font-size: 16px;
 }
 
 .gym-popup .nickname,
@@ -234,12 +468,6 @@ body {
 .raid-form .press,
 .party-popup .change-raid {
   margin-top: 6px;
-  padding: 3px 10px;
-  border: 1px solid var(--button-border);
-  border-radius: var(--radius);
-  background: var(--button-bg);
-  font: inherit;
-  cursor: pointer;
 }
 
 .raid-form {
@@ -265,8 +493,6 @@ body {
 .raid-form select {
   flex: 1 1 120px;
   max-width: 100%;
-  padding: 3px 6px;
-  font: inherit;
 }
 
 .raid-form .form-buttons {
@@ -274,11 +500,6 @@ body {
   gap: 6px;
 }
 
-.raid-form .press:disabled {
-  opacity: 0.5;
-  cursor: default;
-}
-
 .raid-form .form-answer {
   color: var(--form-answer);
 }
@@ -291,18 +512,6 @@ body {
 .new-train,
 .train-actions .press {
   margin-top: 6px;
-  padding: 3px 10px;
-  border: 1px solid var(--button-border);
-  border-radius: var(--radius);
-  background: var(--button-bg);
-  font: inherit;
-  cursor: pointer;
-}
-
-.new-train:disabled,
-.train-actions .press:disabled {
-  opacity: 0.5;
-  cursor: default;
 }
 
 .train-actions {
@@ -371,19 +580,6 @@ body {
 .meetup-actions .press {
   margin-top: 6px;
   margin-left: 4px;
-  padding: 3px 10px;
-  border: 1px solid var(--button-border);
-  border-radius: var(--radius);
-  background: var(--button-bg);
-  font: inherit;
-  cursor: pointer;
-}
-
-.new-meetup:disabled,
-.meetup-here:disabled,
-.meetup-actions .press:disabled {
-  opacity: 0.5;
-  cursor: default;
 }
 
 .meetup-here {
@@ -393,8 +589,6 @@ body {
 .raid-form textarea {
   flex: 1 1 100%;
   max-width: 100%;
-  padding: 3px 6px;
-  font: inherit;
   resize: vertical;
 }
 
diff --git a/src/web/client/pages.css b/src/web/client/pages.css
new file mode 100644
index 0000000000000000000000000000000000000000..0a5eccb5ab7ffc24cdc9c5dba8283c06a7afc9ca
--- /dev/null
+++ b/src/web/client/pages.css
@@ -0,0 +1,55 @@
+@import './theme.css';
+
+/*
+ * The short pages Pine answers without a script (plan 8M-7): a failure, `/`, a login link's page
+ * with its button, the login a page needs (`answers.ts`). Built as `assets/page.css`, a name
+ * without a hash, since they are answered where the bundle's manifest is not at hand.
+ */
+
+body.short {
+  margin: 0;
+  min-height: 100vh;
+  display: flex;
+  align-items: flex-start;
+  justify-content: center;
+  background: var(--page-bg);
+  color: var(--text);
+  font-family: var(--font);
+  font-size: var(--font-size);
+}
+
+body.short main {
+  max-width: 480px;
+  margin: 48px 16px;
+  padding: 16px 20px;
+  background: var(--card-bg);
+  border-left: var(--card-bar) solid var(--accent);
+  border-radius: var(--card-radius);
+}
+
+body.short p {
+  margin: 0 0 12px;
+}
+
+body.short p:last-child {
+  margin-bottom: 0;
+}
+
+body.short a {
+  color: var(--link);
+}
+
+body.short button {
+  padding: 8px 16px;
+  border: 0;
+  border-radius: var(--radius);
+  background: var(--primary);
+  color: var(--on-color);
+  font: inherit;
+  font-weight: 500;
+  cursor: pointer;
+}
+
+body.short button:hover {
+  background: var(--primary-hover);
+}
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index 05867e54e8f450af079731b44db42db55eeed5b5..9eb3d734d4ed2774050d66392bcf2438f95feac6 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -120,6 +120,30 @@ describe('pressLabel', () => {
       ].map((press) => pressLabel(press as never)),
     ).toEqual(['Interested', 'Join', 'Join B', 'Here', 'Done', 'Leave']);
   });
+
+  it("colors each button as the post's (plan 8M-7): Join blurple, Here green, Leave red", () => {
+    const popup = raidPopup(
+      raid({
+        attendance: attendance({
+          actions: [
+            { action: 'interested' },
+            { action: 'join' },
+            { action: 'here' },
+            { action: 'done' },
+            { action: 'leave' },
+          ],
+        }),
+      }),
+      context,
+    );
+    expect(tagged(popup, 'button').map((button) => button.className)).toEqual([
+      'press secondary',
+      'press primary',
+      'press success',
+      'press secondary',
+      'press danger',
+    ]);
+  });
 });
 
 describe('raidPopup', () => {
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index f9d92e5ec750529e77bc17800b482f5273f9df1e..8ac8fb763733c807b9a80701ae4f9fc4466c00de 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -58,6 +58,19 @@ export function pressLabel(press: MapPress): string {
   return press.group === undefined ? label : `${label} ${press.group}`;
 }
 
+/**
+ * The style of each button as the post's own (`party-controls.ts`, plan 8M-7): Join primary
+ * (blurple), Here success (green), Leave danger (red), the others secondary (grey); a class of
+ * `map.css`.
+ */
+const PRESS_STYLES: Readonly<Record<MapPress['action'], string>> = {
+  interested: 'secondary',
+  join: 'primary',
+  here: 'success',
+  done: 'secondary',
+  leave: 'danger',
+};
+
 const STATUS_WORDS: Readonly<Record<MapStatus, string>> = {
   interested: 'Interested',
   coming: 'Coming',
@@ -118,7 +131,7 @@ function attendanceNodes(partyId: string, attendance: MapAttendance): PageNode[]
               ...groupPick(attendance),
               ...attendance.actions.map((press): PageNode => ({
                 tag: 'button',
-                className: 'press',
+                className: `press ${PRESS_STYLES[press.action]}`,
                 text: pressLabel(press),
                 attributes: {
                   type: 'button',
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index aad8065c124fce179e3350249e1e53d83e579afd..9a9f6154cd47a6fa22b1771d5c286df82845be34 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -33,7 +33,7 @@ import {
   trainActions,
 } from './train-forms.js';
 import { trainUi } from './train-ui.js';
-import { theme } from './theme.js';
+import { onThemeChange, theme } from './theme.js';
 
 /**
  * The parties on the live map for a member (plan 8M-3, spec 3.2 to 3.4): one marker per gym
@@ -695,6 +695,11 @@ export function showParties(
   document.addEventListener('visibilitychange', () => {
     poller.visibilityChanged();
   });
+  // The device changed between light and dark (plan 8M-7): the parties drawn anew in the new
+  // colors (not under a form being filled in: once it closes, as for a new list).
+  onThemeChange(() => {
+    if (view) hold.shown(view);
+  });
   window.setInterval(() => {
     const now = Date.now();
     for (const element of document.querySelectorAll<HTMLElement>('[data-until]')) {
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index b3fecfac915621536135ada8f320d2e6cf5e35e2..a19f3f2b71489070c7d93b4e8d5c3945eea8cd49 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -1,41 +1,68 @@
 /*
- * The look of the map and the region editor as named values (plan 8M-6): every colour of the
- * pages, and the sizes a restyle would touch. `map.css` and `editor.css` use them; the colours
- * Leaflet draws (outlines, dots, lines, rings) are read from here by `theme.ts`. Change a value
- * here and run `npm run web:build` (web.md, "Restyling the page").
+ * The look of every page Pine serves as named values (plans 8M-6, 8M-7): every color, and the
+ * sizes a restyle would touch, in two sets of the same names: light in `:root`, dark in the
+ * media query below, so that each page follows the device's light or dark. The look is
+ * Discord's: its grays, blurple primary buttons, gray secondary ones, green and red as the posts
+ * use them, cards with the colored side bar of a components-v2 container. `map.css`, `editor.css`,
+ * `userscript.css` and `pages.css` use them; the colors Leaflet draws (outlines, dots, lines,
+ * rings) are read from here by `theme.ts`, again when the scheme changes. Change a value here
+ * and run `npm run web:build` (web.md, "Restyling the page").
  */
 :root {
   /* Type and shape. */
-  --font: system-ui, sans-serif;
+  --font: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
   --font-size: 15px;
   --radius: 4px;
-  /* The map's side panel (parties, forms) and the region editor's panel. */
-  --panel-width: 300px;
+  --card-radius: 8px;
+  --card-bar: 4px;
+  /* The map's side pane (the list, forms) and the region editor's panel. */
+  --panel-width: 340px;
   --editor-panel-width: 360px;
 
-  /* The page. */
-  --text: #1f2328;
-  --text-soft: #444;
-  --muted: #555;
-  --header-bg: #1f3d2b;
-  --header-text: #fff;
-  --field-border: #8aa;
-  --login-bg: #5865f2;
-  --login-text: #fff;
-  --notice-bg: #fff4cc;
-  --notice-border: #e0c060;
-  --panel-bg: #fafbfc;
-  --panel-border: #ccd;
-  --divider: #e3e6ea;
-  --button-bg: #fff;
-  --button-border: #8a94a6;
-  --form-answer: #8a3b00;
+  /* Discord's surfaces, light. */
+  --page-bg: #ffffff;
+  --panel-bg: #f2f3f5;
+  --deep-bg: #e3e5e8;
+  --card-bg: #f2f3f5;
+  --map-bg: #e3e5e8;
+  --line: #e1e2e4;
+  --text: #313338;
+  --text-soft: #4e5058;
+  --muted: #5c5e66;
+  --link: #006ce7;
+  --shadow: rgba(0, 0, 0, 0.2);
+  --scrim: rgba(0, 0, 0, 0.4);
+
+  /* Discord's buttons and fields. */
+  --primary: #5865f2;
+  --primary-hover: #4752c4;
+  --secondary: #d7d9dc;
+  --secondary-hover: #c4c9ce;
+  --secondary-text: #313338;
+  --success: #248046;
+  --success-hover: #1a6334;
+  --danger: #da373c;
+  --danger-hover: #a12828;
+  --on-color: #ffffff;
+  --field-bg: #ffffff;
+  --field-border: #c4c9ce;
+  --focus: #00a8fc;
+  --chip-on-bg: #e0e3ff;
+
+  /* The line under the header for the moment's news, and an answer under a form. */
+  --notice-bg: #fef3d6;
+  --notice-border: #f0b232;
+  --form-answer: #a12828;
+
+  /* What the map shows over its tiles. */
   --label-bg: rgba(255, 255, 255, 0.85);
   --region-label: #203060;
-  --raid-icon-bg: rgba(255, 255, 255, 0.85);
-  --stop-number-bg: #fff;
+  --marker-bg: #ffffff;
+  --stop-number-bg: #ffffff;
   --stop-number-text: #6b2a00;
-  --stop-number-here-text: #fff;
+  --stop-number-here-text: #ffffff;
+  /* The side bar of a card, by what it is. */
+  --accent: #5865f2;
 
   /* What the map draws (`theme.ts`); the raid's ring and route mode's numbers share them. */
   --gym: #2d7a3a;
@@ -46,12 +73,12 @@
   --stop: #2980b9;
 
   /* The region editor's panel. */
-  --tool-bg: #e8efe9;
+  --tool-bg: #e3e5e8;
   --warning: #8a5a00;
   --fresh-piece: #b00020;
-  --dialog-bg: #f7faf7;
+  --dialog-bg: #f2f3f5;
   --cannot-fix: #6b6b6b;
-  --fix-chosen-bg: #eef3ee;
+  --fix-chosen-bg: #e3e5e8;
   --fix-line: #111111;
   --fix-corner-bg: #ffffff;
 
@@ -76,3 +103,95 @@
   --theirs: #1565c0;
   --preview: #111111;
 }
+
+@media (prefers-color-scheme: dark) {
+  :root {
+    /* Type and shape. */
+    --font: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
+    --font-size: 15px;
+    --radius: 4px;
+    --card-radius: 8px;
+    --card-bar: 4px;
+    --panel-width: 340px;
+    --editor-panel-width: 360px;
+
+    /* Discord's surfaces, dark. */
+    --page-bg: #313338;
+    --panel-bg: #2b2d31;
+    --deep-bg: #1e1f22;
+    --card-bg: #2b2d31;
+    --map-bg: #1e1f22;
+    --line: #3f4147;
+    --text: #dbdee1;
+    --text-soft: #b5bac1;
+    --muted: #949ba4;
+    --link: #00a8fc;
+    --shadow: rgba(0, 0, 0, 0.5);
+    --scrim: rgba(0, 0, 0, 0.6);
+
+    /* Discord's buttons and fields. */
+    --primary: #5865f2;
+    --primary-hover: #4752c4;
+    --secondary: #4e5058;
+    --secondary-hover: #6d6f78;
+    --secondary-text: #ffffff;
+    --success: #248046;
+    --success-hover: #1a6334;
+    --danger: #da373c;
+    --danger-hover: #a12828;
+    --on-color: #ffffff;
+    --field-bg: #1e1f22;
+    --field-border: #1e1f22;
+    --focus: #00a8fc;
+    --chip-on-bg: #3c4270;
+
+    --notice-bg: #3d3523;
+    --notice-border: #f0b232;
+    --form-answer: #fa777c;
+
+    --label-bg: rgba(43, 45, 49, 0.85);
+    --region-label: #c9cdfb;
+    --marker-bg: #2b2d31;
+    --stop-number-bg: #2b2d31;
+    --stop-number-text: #ffb37a;
+    --stop-number-here-text: #ffffff;
+    --accent: #5865f2;
+
+    --gym: #3ba55c;
+    --region: #8891f2;
+    --raid: #ed4245;
+    --train: #e67e22;
+    --meetup: #b065d0;
+    --stop: #5b9cf6;
+
+    --tool-bg: #4e5058;
+    --warning: #f0b232;
+    --fresh-piece: #fa777c;
+    --dialog-bg: #2b2d31;
+    --cannot-fix: #949ba4;
+    --fix-chosen-bg: #3f4147;
+    --fix-line: #f2f3f5;
+    --fix-corner-bg: #2b2d31;
+
+    /* The editor's drawing keeps its colors in dark; only what was near black turns light. */
+    --region-1: #3060c0;
+    --region-2: #2d7a3a;
+    --region-3: #a05a00;
+    --region-4: #7a3ab0;
+    --region-5: #00838f;
+    --region-6: #9e2a5e;
+    --region-7: #5d6d00;
+    --region-8: #c0392b;
+    --others: #8a8a8a;
+    --broken: #d00000;
+    --editor-gym: #2d7a3a;
+    --editor-stop: #1e88e5;
+    --power-spot: #8e24aa;
+    --wayfarer-gym: #6d4c41;
+    --outside: #ff8f00;
+    --overlap: #e53935;
+    --gap: #6a1b9a;
+    --theirs: #1565c0;
+    --preview: #f2f3f5;
+  }
+}
diff --git a/src/web/client/theme.test.ts b/src/web/client/theme.test.ts
index 73c35e682da9024a2e92012ec02ae8f474997f4d..dc23cc0753c925fdab765cf685d6c1299a6a8081 100644
--- a/src/web/client/theme.test.ts
+++ b/src/web/client/theme.test.ts
@@ -1,5 +1,56 @@
 import { describe, expect, it } from 'vitest';
-import { DRAWN_COLOURS, MISSING_COLOUR, readTheme, REGION_PALETTE } from './theme.js';
+import {
+  DRAWN_COLOURS,
+  MISSING_COLOUR,
+  readTheme,
+  REGION_PALETTE,
+  ThemeWatch,
+  type SchemeQuery,
+} from './theme.js';
+
+/** A `matchMedia('(prefers-color-scheme: dark)')` of the test's, whose scheme it changes. */
+function fakeScheme(dark: boolean): SchemeQuery & { change(dark: boolean): void } {
+  const listeners: Array<() => void> = [];
+  return {
+    matches: dark,
+    addEventListener: (_type, listener) => {
+      listeners.push(listener);
+    },
+    change(next) {
+      this.matches = next;
+      for (const listener of listeners) listener();
+    },
+  };
+}
+
+describe('ThemeWatch (plan 8M-7)', () => {
+  it('reads the theme once, and again when the device changes between light and dark', () => {
+    const scheme = fakeScheme(false);
+    let reads = 0;
+    const watch = new ThemeWatch((property) => {
+      reads += 1;
+      return property === '--gym' ? (scheme.matches ? '#3ba55c' : '#2d7a3a') : '#123456';
+    }, scheme);
+    expect(watch.theme().colours.gym).toBe('#2d7a3a');
+    const once = reads;
+    expect(watch.theme().colours.gym).toBe('#2d7a3a');
+    expect(reads).toBe(once);
+    expect(watch.dark()).toBe(false);
+
+    const told: string[] = [];
+    watch.onChange((theme) => told.push(theme.colours.gym));
+    scheme.change(true);
+    expect(told).toEqual(['#3ba55c']);
+    expect(watch.theme().colours.gym).toBe('#3ba55c');
+    expect(watch.dark()).toBe(true);
+  });
+
+  it('is light and never changes where the browser cannot say its scheme', () => {
+    const watch = new ThemeWatch(() => '#123456', undefined);
+    expect(watch.dark()).toBe(false);
+    expect(watch.theme().colours.raid).toBe('#123456');
+  });
+});
 
 describe('readTheme', () => {
   it("reads each drawn colour and the editor's palette from their custom properties", () => {
diff --git a/src/web/client/theme.ts b/src/web/client/theme.ts
index 04a2df8e351aa140e0e98a55b37a01d11539e718..d3d0e304c2aeec141e7fe265191b81c0d5445036 100644
--- a/src/web/client/theme.ts
+++ b/src/web/client/theme.ts
@@ -2,8 +2,10 @@
  * The colours the pages draw with Leaflet (plan 8M-6): outlines, dots, lines and rings, which no
  * stylesheet reaches. Their values are custom properties of `theme.css`, beside every other
  * colour and the sizes a restyle would touch, so that the look is changed in one file; the page
- * reads them once, at its first drawing (`theme()`), the stylesheet having loaded before the
- * script. No colour is written anywhere else in the pages' code (`page-theme.test.ts`).
+ * reads them at its first drawing (`theme()`), the stylesheet having loaded before the script,
+ * and again when the device changes between light and dark (plan 8M-7: `theme.css` has a set of
+ * values for each; `onThemeChange`). No colour is written anywhere else in the pages' code
+ * (`page-theme.test.ts`).
  */
 
 /** Each colour drawn from TypeScript, by the custom property of `theme.css` that holds it. */
@@ -72,12 +74,76 @@ export function readTheme(read: (property: string) => string): Theme {
   return { colours, palette: REGION_PALETTE.map(value) };
 }
 
-let current: Theme | undefined;
+/**
+ * What the page asks of the browser's `matchMedia('(prefers-color-scheme: dark)')`: whether the
+ * device is dark now, and a listener for when it changes.
+ */
+export interface SchemeQuery {
+  matches: boolean;
+  addEventListener(type: 'change', listener: () => void): void;
+}
 
-/** The page's theme, read from `:root` at the first call. */
-export function theme(): Theme {
-  current ??= readTheme((property) =>
-    getComputedStyle(document.documentElement).getPropertyValue(property),
+/**
+ * The theme of a page that follows the device's light or dark (plan 8M-7): read once, and read
+ * again when the scheme changes (`theme.css` holds a set of values for each), after which every
+ * listener is told, so that what Leaflet drew is drawn in the new colors. Without a query (a
+ * browser that cannot say) the page is light and stays so.
+ */
+export class ThemeWatch {
+  private current: Theme | undefined;
+  private readonly listeners: Array<(theme: Theme) => void> = [];
+
+  constructor(
+    private readonly read: (property: string) => string,
+    private readonly query: SchemeQuery | undefined,
+  ) {
+    query?.addEventListener('change', () => {
+      this.current = undefined;
+      const next = this.theme();
+      for (const listener of this.listeners) listener(next);
+    });
+  }
+
+  theme(): Theme {
+    this.current ??= readTheme(this.read);
+    return this.current;
+  }
+
+  /** Whether the device is dark now. */
+  dark(): boolean {
+    return this.query?.matches ?? false;
+  }
+
+  /** Tells `listener` the new theme after each change of the scheme. */
+  onChange(listener: (theme: Theme) => void): void {
+    this.listeners.push(listener);
+  }
+}
+
+let watch: ThemeWatch | undefined;
+
+/** The page's own watch, made at the first call. */
+function pageWatch(): ThemeWatch {
+  watch ??= new ThemeWatch(
+    (property) => getComputedStyle(document.documentElement).getPropertyValue(property),
+    typeof window.matchMedia === 'function'
+      ? window.matchMedia('(prefers-color-scheme: dark)')
+      : undefined,
   );
-  return current;
+  return watch;
+}
+
+/** The page's theme, read from `:root` at the first call and again after a change of scheme. */
+export function theme(): Theme {
+  return pageWatch().theme();
+}
+
+/** Whether the device is dark now. */
+export function darkScheme(): boolean {
+  return pageWatch().dark();
+}
+
+/** Calls `listener` after each change between light and dark, the theme read anew. */
+export function onThemeChange(listener: (theme: Theme) => void): void {
+  pageWatch().onChange(listener);
 }
diff --git a/src/web/client/userscript.css b/src/web/client/userscript.css
index 2a1b88f776dcd73053bc1a7a5a7a2cf06293c6e1..622a806fb388efb22beea5655a4d8674a6d256b9 100644
--- a/src/web/client/userscript.css
+++ b/src/web/client/userscript.css
@@ -1,12 +1,17 @@
 @import './theme.css';
 
-/* The page of the Wayspot export tool (`/userscript`, plan 8W-P): the map's header and colours. */
+/* The page of the Wayspot export tool (`/userscript`, plan 8W-P): the map's header and look. */
 
 body {
   margin: 0;
   font-family: var(--font);
   font-size: var(--font-size);
   color: var(--text);
+  background: var(--page-bg);
+}
+
+a {
+  color: var(--link);
 }
 
 [hidden] {
@@ -19,12 +24,13 @@ body {
   align-items: center;
   gap: 8px 16px;
   padding: 8px 12px;
-  background: var(--header-bg);
-  color: var(--header-text);
+  background: var(--panel-bg);
+  color: var(--text);
+  border-bottom: 1px solid var(--line);
 }
 
 #header .title {
-  font-weight: 600;
+  font-weight: 700;
 }
 
 #account {
@@ -63,21 +69,28 @@ h3 {
 button,
 a.install {
   display: inline-block;
-  padding: 4px 10px;
-  border: 1px solid var(--button-border);
+  padding: 6px 12px;
+  border: 0;
   border-radius: var(--radius);
-  background: var(--button-bg);
-  color: var(--text);
+  background: var(--secondary);
+  color: var(--secondary-text);
   font: inherit;
+  font-weight: 500;
   text-decoration: none;
   cursor: pointer;
 }
 
-#account button,
+button:hover {
+  background: var(--secondary-hover);
+}
+
 a.install {
-  border: 0;
-  background: var(--login-bg);
-  color: var(--login-text);
+  background: var(--primary);
+  color: var(--on-color);
+}
+
+a.install:hover {
+  background: var(--primary-hover);
 }
 
 .ask {
@@ -94,9 +107,11 @@ a.install {
 #community {
   flex: 1 1 280px;
   max-width: 480px;
-  padding: 4px 8px;
+  padding: 6px 10px;
   border: 1px solid var(--field-border);
   border-radius: var(--radius);
+  background: var(--field-bg);
+  color: var(--text);
   font: inherit;
 }
 
@@ -122,7 +137,7 @@ table.requests {
 table.requests th,
 table.requests td {
   padding: 4px 6px;
-  border-bottom: 1px solid var(--divider);
+  border-bottom: 1px solid var(--line);
   text-align: left;
   vertical-align: top;
 }
diff --git a/src/web/editor-page.test.ts b/src/web/editor-page.test.ts
index 6dcfc8ce57f31cfc6e4dd253cdd185949e48b402..d29da21a6ec6950ffb1eef7fef86d9227741ba7f 100644
--- a/src/web/editor-page.test.ts
+++ b/src/web/editor-page.test.ts
@@ -37,6 +37,8 @@ describe('the region editor page', () => {
     expect(page.headers['cache-control']).toBe('no-cache');
     expect(page.body).toContain('<script src="/assets/editor-QRSTUVWX.js" defer></script>');
     expect(page.body).toContain('<link rel="stylesheet" href="/assets/editor-YZABCDEF.css">');
+    // It follows the device's light or dark (plan 8M-7).
+    expect(page.body).toContain('<meta name="color-scheme" content="light dark">');
     expect(page.body).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
     expect(page.body).not.toMatch(/<style|\sstyle=|\son\w+=/i);
     expect(bodyData(page.body)).toEqual({
diff --git a/src/web/page-theme.test.ts b/src/web/page-theme.test.ts
index 265a0235873ed6af62576d899521c8868ccddc07..4a344abde04909e2c666b673f1482d349bb38661 100644
--- a/src/web/page-theme.test.ts
+++ b/src/web/page-theme.test.ts
@@ -154,7 +154,9 @@ describe("the pages' look", () => {
 
   it('writes colours in the stylesheets only as custom properties of theme.css', () => {
     const sheets = files.filter((file) => file.endsWith('.css') && file !== 'theme.css');
-    expect(sheets).toEqual(expect.arrayContaining(['map.css', 'editor.css']));
+    expect(sheets).toEqual(
+      expect.arrayContaining(['map.css', 'editor.css', 'userscript.css', 'pages.css']),
+    );
     for (const file of sheets) {
       const written = declarations(read(file)).filter(([, , value]) =>
         COLOUR.test(withoutProperties(value)),
@@ -172,6 +174,29 @@ describe("the pages' look", () => {
     expect(read('editor.css')).toMatch(/@import '\.\/map\.css';/u);
   });
 
+  it('names the same values in its light set and its dark set (plan 8M-7)', () => {
+    const css = withoutComments(read('theme.css'));
+    const dark = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^{}]*)\}\s*\}/u.exec(
+      css,
+    );
+    expect(dark, 'a dark set in @media (prefers-color-scheme: dark)').not.toBeNull();
+    const light = /^\s*:root\s*\{([^{}]*)\}/u.exec(css);
+    expect(light, 'the light set first, in :root').not.toBeNull();
+    const names = (block: string): string[] =>
+      declarations(`:root {${block}}`)
+        .map(([, property]) => property)
+        .sort();
+    const lightNames = names(light?.[1] ?? '');
+    expect(lightNames.length).toBeGreaterThan(40);
+    expect(names(dark?.[1] ?? '')).toEqual(lightNames);
+  });
+
+  it('is loaded by the stylesheet of every page Pine serves (plan 8M-7)', () => {
+    for (const sheet of ['map.css', 'userscript.css', 'pages.css']) {
+      expect(read(sheet), sheet).toMatch(/@import '\.\/theme\.css';/u);
+    }
+  });
+
   it('defines every property the pages use or draw with', () => {
     const defined = new Set(declarations(read('theme.css')).map(([, property]) => property));
     const used = new Set([
diff --git a/src/web/page.test.ts b/src/web/page.test.ts
index 3bf4631a9c5dfb1d8675868c790f6d57c4b5fd16..3f1128ae9f1b1f97bf6e8c2caffab1fa30e9be7f 100644
--- a/src/web/page.test.ts
+++ b/src/web/page.test.ts
@@ -66,6 +66,10 @@ describe('the map page', () => {
     expect(page.body).toContain('<link rel="stylesheet" href="/assets/map-IJKLMNOP.css">');
     expect(page.body).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
     expect(page.body).not.toMatch(/<style|\sstyle=|\son\w+=/i);
+    // The title, "Pine" alone narrower than 768 pixels (fix round 1).
+    expect(page.body).toContain(
+      '<span class="title"><span class="title-first">Professor </span>Pine</span>',
+    );
     expect(bodyData(page.body)).toEqual({
       'data-guild': FAKE_GUILD_ID,
       'data-tiles': 'osm',
@@ -128,6 +132,33 @@ describe('the map page', () => {
   });
 });
 
+describe("every page's look (plan 8M-7)", () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  /** Says that a page follows the device's light or dark, through a stylesheet with theme.css. */
+  const followsTheScheme = (html: string, style: string, url: string): void => {
+    expect(html, url).toContain('<meta name="color-scheme" content="light dark">');
+    expect(html, url).toContain(`<link rel="stylesheet" href="/assets/${style}">`);
+  };
+
+  it('follows the device on the map, the editor, the short pages and the login pages', async () => {
+    web = webServerWith({ assets: builtAssets() });
+    followsTheScheme((await web.app.inject({ url: MAP })).body, 'map-IJKLMNOP.css', MAP);
+    for (const url of [
+      '/',
+      `/s/${FAKE_GUILD_ID}/regions/edit`,
+      `/auth/link/${FAKE_GUILD_ID}/some-token`,
+      '/s/412345678901234999/map',
+    ]) {
+      followsTheScheme((await web.app.inject({ url })).body, 'page.css', url);
+    }
+  });
+});
+
 describe('the files of the bundle', () => {
   let web: TestWeb | undefined;
   afterEach(async () => {
diff --git a/src/web/page.ts b/src/web/page.ts
index 39cafd546494a647e8d8c185f3bc3dec3e5bdd33..17c5e696ae4f7dd0b760f11cc717b1d39d18e009 100644
--- a/src/web/page.ts
+++ b/src/web/page.ts
@@ -1,6 +1,6 @@
 import { readFile } from 'node:fs/promises';
 import path from 'node:path';
-import { escapeHtml } from './answers.js';
+import { COLOR_SCHEME_META, escapeHtml } from './answers.js';
 
 /** Where `npm run web:build` leaves the bundle, from the bot's working folder. */
 export const WEB_DIST = 'dist/web';
@@ -98,6 +98,7 @@ function head(title: string, assets: PageAssets): string[] {
     '<head>',
     '<meta charset="utf-8">',
     '<meta name="viewport" content="width=device-width, initial-scale=1">',
+    COLOR_SCHEME_META,
     `<title>${escapeHtml(title)}</title>`,
     `<link rel="stylesheet" href="/assets/${escapeHtml(assets.style)}">`,
     `<script src="/assets/${escapeHtml(assets.script)}" defer></script>`,
@@ -117,7 +118,8 @@ export function mapPage(data: MapPageData, assets: AssetManifest): string {
   return [
     ...head('Professor Pine: map', assets.map),
     `<body ${bodyAttributes(data)}>`,
-    '<header id="header"><span class="title">Professor Pine</span>',
+    // Narrower than 768 pixels the title is "Pine" (`map.css`, fix round 1).
+    '<header id="header"><span class="title"><span class="title-first">Professor </span>Pine</span>',
     '<input id="filter" type="search" placeholder="Find a gym" aria-label="Find a gym">',
     '<span id="account"></span></header>',
     '<p id="notice" hidden></p><p id="read-only" role="status" hidden></p>',
diff --git a/src/web/tool-page.test.ts b/src/web/tool-page.test.ts
index 6ef3c93955ece066d9ee20780bb769d7142282ae..6e6ffd5b3bb915ab8c024c7815152145827da74c 100644
--- a/src/web/tool-page.test.ts
+++ b/src/web/tool-page.test.ts
@@ -59,7 +59,7 @@ describe('the page /userscript', () => {
       const answer = await web.app.inject({ url: PAGE, headers: { cookie } });
       expect(answer.statusCode).toBe(404);
       expect(answer.headers['cache-control']).toBe('no-store');
-      expect(answer.body).toContain('<p>Not available on this Pine.</p></body>');
+      expect(answer.body).toContain('<p>Not available on this Pine.</p></main></body>');
       expect(answer.body).not.toMatch(/Wayspot|tool|Log in/i);
       await web.app.close();
     }
@@ -98,6 +98,8 @@ describe('the page /userscript', () => {
     expect(answer.body).toContain(`<body data-csrf="${token}">`);
     expect(answer.body).toContain('<script src="/assets/userscript-OPQRSTUV.js" defer></script>');
     expect(answer.body).toContain('<link rel="stylesheet" href="/assets/userscript-WXYZABCD.css">');
+    // It follows the device's light or dark (plan 8M-7).
+    expect(answer.body).toContain('<meta name="color-scheme" content="light dark">');
     expect(answer.body).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>|\sstyle=|\son[a-z]+=/);
   });
 
diff --git a/src/web/tool-page.ts b/src/web/tool-page.ts
index 3aefdfd39cc792827117123fa9f7984945a07127..36ac7d0fb7a2810ed187570f8e61e25d381ccd38 100644
--- a/src/web/tool-page.ts
+++ b/src/web/tool-page.ts
@@ -7,7 +7,7 @@ import {
 } from '../domain/script-access/access.js';
 import type { ChangelogEntry, ToolUrls } from '../domain/script-access/tool-file.js';
 import { plainNoLinks, unplain } from '../render/text.js';
-import { escapeHtml } from './answers.js';
+import { COLOR_SCHEME_META, escapeHtml } from './answers.js';
 import type { PageAssets } from './page.js';
 
 /** The page's words that the routes answer with too. */
@@ -279,6 +279,7 @@ function head(assets: PageAssets): string[] {
     '<head>',
     '<meta charset="utf-8">',
     '<meta name="viewport" content="width=device-width, initial-scale=1">',
+    COLOR_SCHEME_META,
     '<title>Professor Pine: Wayspot export tool</title>',
     `<link rel="stylesheet" href="/assets/${escapeHtml(assets.style)}">`,
     `<script src="/assets/${escapeHtml(assets.script)}" defer></script>`,
````

### Task 2: 8M-7 task 2: Stadia Maps' tiles, light and dark, OpenStreetMap to fall back to

Prototype commit: `9f4024ce49abe5ce12cb6ba6f95b36fc6b8c2343`

settings.web.tiles gains 'stadia', the new default: Stadia Maps' Alidade Smooth
or Alidade Smooth Dark by the device's scheme, with no key (Stadia checks the
page's domain). At Stadia's first refused tile the page shows OpenStreetMap's
for the rest of the visit, darkened by a filter in dark; 'osm' is OpenStreetMap
alone, 'google' Google's beside Stadia's (Stadia's without the browser key). The
CSP lets in tiles.stadiamaps.com unless the tiles are OpenStreetMap's alone.

**Files:**

```
 docs/architecture/web.md      |   8 ++++----
 docs/web-setup.md             |  21 +++++++++++++++------
 src/config/settings.test.ts   |   7 ++++++-
 src/config/settings.ts        |   8 +++++---
 src/config/warnings.test.ts   |   8 ++++++--
 src/config/warnings.ts        |   4 ++--
 src/web/client/common.ts      | 112 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++----------------
 src/web/client/editor.ts      |   9 ++-------
 src/web/client/layers.test.ts | 137 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------------
 src/web/client/layers.ts      | 142 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--------------
 src/web/client/main.ts        |   9 ++-------
 src/web/client/map.css        |   8 ++++++++
 src/web/editor-routes.ts      |   7 ++++---
 src/web/guild-routes.ts       |   7 ++++---
 src/web/headers.test.ts       |  25 +++++++++++++++++++++----
 src/web/headers.ts            |  38 ++++++++++++++++++++++++++++++--------
 src/web/page.test.ts          |  17 ++++++++++++++++-
 src/web/page.ts               |   5 +++--
 src/web/server.ts             |   4 ++--
 19 files changed, 476 insertions(+), 100 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/config/settings.test.ts src/config/warnings.test.ts src/web/client/layers.test.ts src/web/headers.test.ts src/web/page.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 9f4024ce49abe5ce12cb6ba6f95b36fc6b8c2343 -- src test scripts data docs/architecture docs/guides docs/web-setup.md docs/superpowers/plans/phase-0-follow-ups.md CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-7 task 2: Stadia Maps' tiles, light and dark, OpenStreetMap to fall back to`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 60b9d6a09921a402d4f4d62e6e813971139c656b..fc990ff80c85f21602146413b27a00c7dbcfb092 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -4,15 +4,15 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 ## Settings, secrets, start and stop
 
-- Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (`osm` default, or `google`), `memberRole` (a role's name; blank or absent is unset: see "Who sees what"). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
-- Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows OpenStreetMap). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
+- Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (plan 8M-7: `stadia`, the default, Stadia Maps' Alidade Smooth with OpenStreetMap's to fall back to; `osm`, OpenStreetMap's alone; or `google`, Google's beside Stadia's; no key for Stadia: it checks the page's domain, `localhost` passes; `docs/web-setup.md`), `memberRole` (a role's name; blank or absent is unset: see "Who sees what"). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
+- Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows Stadia's, `shownTiles`, `src/web/headers.ts`). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
 - `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, its trains `TrainWebDeps`, its meetups `MeetupWebDeps`, its max battles `MaxWebDeps`, its reports at stops `StopWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
 - Fastify's own logger is off. Every request is logged at debug by `method`, its route pattern (`/auth/link/:guild/:token`, never the address it was asked with, which may carry a token or code), `status` and `ms`. Never log a token, cookie, OAuth code, CSRF token, secret or the query string of `/auth/*`; a failure is logged as `{ err }` with the route.
 - Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/` (401 "Log in first.", 403, 404, 413, 429, 503 "Not available just now."), a short page otherwise, never a stack or what went wrong; 500s are logged. Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's preview and save, 2 MB: `SAVE_BODY_LIMIT`) sets its own `bodyLimit`.
 
 ## Headers and the Content Security Policy
 
-- Every answer carries `securityHeaders` (`src/web/headers.ts`, pure, tested): the CSP (`default-src 'none'`; scripts, styles and fonts from Pine alone, no inline script or style; pictures from Pine, `data:`, `https://tile.openstreetmap.org`, `https://tile.googleapis.com` with Google's tiles, and the picture hosts of posts (`pictureOrigins`: the origins of `POKEMON_ICON_BASE`, `MEGA_PORTRAIT_BASE`, the stops' `ENCOUNTER_PICTURE` (plan 8R-6; the megas' host) and `publicUrl`, whose `/eggs/` serves the eggs and `/pictures/` the stops' square pictures, never typed by hand); connections to Pine and, with Google's tiles, the Map Tiles API; `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`), `nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: strict-origin-when-cross-origin` (Google checks a browser key's referrer by Pine's origin). Leaflet sets `style` attributes from its script, which `style-src` does not govern; a page that needs an inline style or script is a design error.
+- Every answer carries `securityHeaders` (`src/web/headers.ts`, pure, tested): the CSP (`default-src 'none'`; scripts, styles and fonts from Pine alone, no inline script or style; pictures from Pine, `data:`, `https://tiles.stadiamaps.com` unless the tiles are OpenStreetMap's alone (plan 8M-7), `https://tile.openstreetmap.org` (always: the fallback), `https://tile.googleapis.com` with Google's tiles, and the picture hosts of posts (`pictureOrigins`: the origins of `POKEMON_ICON_BASE`, `MEGA_PORTRAIT_BASE`, the stops' `ENCOUNTER_PICTURE` (plan 8R-6; the megas' host) and `publicUrl`, whose `/eggs/` serves the eggs and `/pictures/` the stops' square pictures, never typed by hand); connections to Pine and, with Google's tiles, the Map Tiles API; `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`), `nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: strict-origin-when-cross-origin` (Google checks a browser key's referrer by Pine's origin, and Stadia the page's domain by it). Leaflet sets `style` attributes from its script, which `style-src` does not govern; a page that needs an inline style or script is a design error.
 
 ## Addresses
 
@@ -37,7 +37,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - `GET /s/<guild>/api/geo` is public: `geoView` (`src/domain/web/geo-view.ts`, pure; its types in `geo-data.ts`, which has no imports so the page can take them) gives the server's regions with an outline (named by their channels as the bot sees them, by their number where it sees none) and the gyms that lie in them (regions, address line, description, notice; places to six decimals; no elite raid gym mark, which Matt took out of everything members see, 2026-10-17: `isEliteGym` and the data stay). Gyms in no region of any server are left out. `GeoCache` (`src/web/geo-cache.ts`) keeps each server's JSON with a strong ETag (the SHA-256 of the JSON, cut) and builds it anew when `GymDirectory.generation` or `RegionDirectory.generation` changed (every load, gym re-read or forget) or a region's channel was renamed; an `If-None-Match` that names it is answered 304 (`etagMatches`: a list of tags compared weakly, `W/` ignored, or `*`), `Cache-Control: no-cache`.
 - The page `/s/<guild>/map` is a static template (`mapPage`, `src/web/page.ts`) that loads the bundle's script and style; what the page needs is in escaped `data-` attributes of `<body>` (`data-guild`, `data-tiles`, `data-google-key` only with Google's tiles, `data-login` `discord | links`). Without a built bundle it answers 503 saying `npm run web:build`.
 - The pages' code is `src/web/client/` with its own `tsconfig.json` (the DOM; the root config excludes the folder), bundled by `scripts/web/build.ts` (`npm run web:build`, also run by `npm run build`) with esbuild: IIFEs for ES2022, minified, into `dist/web/assets/` with hashed names: the map (`map-<hash>.js`, `map-<hash>.css` with Leaflet's CSS, Leaflet's pictures), the region editor (`editor-<hash>.js` with Geoman, `editor-<hash>.css` with Geoman's CSS, and its worker `editor-worker-<hash>.js`); `dist/web/assets.json` names each page's script and style and the worker (`AssetManifest`: `map`, `editor`; read at start by `readAssets`, which takes a manifest of an older build as none). What both pages share (the tiles with Google's layers, the header and its login, reading JSON) is `src/web/client/common.ts`. The rest of `dist/web/` is the compiled server code; the build empties only `assets/`. `/assets/` (`@fastify/static`) serves that one flat folder: no index, no listing, plain file names only; a hashed name `public, max-age=31536000, immutable`, anything else `no-cache`.
-- The page: Leaflet; OpenStreetMap's tiles with their attribution; with Google's tiles a layer switch (roadmap, satellite, hybrid: a session per layer from `createSession`, 2D tiles, the attribution of what is in view from `viewport` after the map rests, shown with "Google Maps"; `src/web/client/layers.ts`). Regions as outlines with their names from zoom 12; gyms as dots, all in one colour; a popup per gym built as a tree of nodes and rendered with `textContent` only (`gymPopup`, `renderNode`): never HTML from data. Leaflet treats string content as HTML (tooltips, popups, attributions, the layer switch's names): data goes to it as nodes (`renderNode`; a region's label is `regionLabel`), and the only strings it is given are constants of ours and the escaped copyright of `googleAttribution`. The filter box hides gyms whose name and nickname lack a word typed (`gymFilter`: no case, accents or apostrophes) and fits the map to the matches on Enter. The header: "Log in with Discord" (only with the secret) or "Use /maps in Discord to log in.", or the member's name, Log out (a POST with the CSRF token; `logOut`, `src/web/client/logout.ts`: on a 403, the token of a page loaded before a restart, it asks `/api/me` again and tries once more, a session gone by then counting as logged out; only a 2xx is logged out, so a second refusal, any other status or a broken connection says "Log out failed; try again.") and why they see only the public map (`headerLines`, `src/web/client/notice.ts`: Discord away; for `missingRole` "You can look around the map. To join or report here, you need the Verified role in this server."; else "You are not a member of this server."). `?login=failed|expired` is said once and taken out of the address.
+- The page: Leaflet; the tiles of `data-tiles` (`addTiles`, `src/web/client/common.ts`, over `tileLayers`, `src/web/client/layers.ts`, plan 8M-7): Stadia's Alidade Smooth in light and Alidade Smooth Dark in dark (`https://tiles.stadiamaps.com/tiles/alidade_smooth{_dark}/{z}/{x}/{y}{r}.png`, credited "© Stadia Maps © OpenMapTiles © OpenStreetMap contributors" with links, `STADIA_ATTRIBUTION`), drawn anew in the other style when the device changes between light and dark; once Stadia refuses its tiles (three failed in a row with none loaded between, or the first two of the visit: a 401 on a domain it does not know, a 429 past the month's credits; the page cannot tell which, and a tile that loads starts the run again) OpenStreetMap's for the rest of the visit, once (`StadiaFallback`), drawn to zoom 20 with its own pictures enlarged past 19 (`maxNativeZoom`); the credit is the page's own, of the base shown alone (`BaseAttribution`: OpenStreetMap's replaces Stadia's at the switch, none while a Google layer is chosen); OpenStreetMap's alone for `osm`; OpenStreetMap's in dark are darkened by the class `tiles-darkened` on the map's container (a filter of `map.css` on the tile pane: invert, hue turned half round, a little less brightness, contrast and saturation; only while OpenStreetMap's base is shown, never on Google's); with Google's tiles a layer switch (the base first, then roadmap, satellite, hybrid: a session per layer from `createSession`, 2D tiles, the attribution of what is in view from `viewport` after the map rests, shown with "Google Maps"; `src/web/client/layers.ts`). Regions as outlines with their names from zoom 12; gyms as dots, all in one color; a popup per gym built as a tree of nodes and rendered with `textContent` only (`gymPopup`, `renderNode`): never HTML from data. Leaflet treats string content as HTML (tooltips, popups, attributions, the layer switch's names): data goes to it as nodes (`renderNode`; a region's label is `regionLabel`), and the only strings it is given are constants of ours and the escaped copyright of `googleAttribution`. The filter box hides gyms whose name and nickname lack a word typed (`gymFilter`: no case, accents or apostrophes) and fits the map to the matches on Enter. The header: "Log in with Discord" (only with the secret) or "Use /maps in Discord to log in.", or the member's name, Log out (a POST with the CSRF token; `logOut`, `src/web/client/logout.ts`: on a 403, the token of a page loaded before a restart, it asks `/api/me` again and tries once more, a session gone by then counting as logged out; only a 2xx is logged out, so a second refusal, any other status or a broken connection says "Log out failed; try again.") and why they see only the public map (`headerLines`, `src/web/client/notice.ts`: Discord away; for `missingRole` "You can look around the map. To join or report here, you need the Verified role in this server."; else "You are not a member of this server."). `?login=failed|expired` is said once and taken out of the address.
 
 ## The parties on the map (plan 8M-3)
 
diff --git a/docs/web-setup.md b/docs/web-setup.md
index 8e4399495eddcd3fd9062b80a5ac4a5bf3a5ec85..3bcc83592f4ae3d282ff6114ce140ac118420da2 100644
--- a/docs/web-setup.md
+++ b/docs/web-setup.md
@@ -12,7 +12,7 @@ In `data/settings.json`:
   "host": "127.0.0.1",
   "publicUrl": "https://map.example.org",
   "trustProxy": true,
-  "tiles": "osm"
+  "tiles": "stadia"
 }
 ```
 
@@ -20,7 +20,7 @@ In `data/settings.json`:
 - `host`: `127.0.0.1` (the default) when the tunnel or proxy runs on the same machine; `0.0.0.0` inside a container that the tunnel reaches over the compose network (do not publish the port to the host then).
 - `publicUrl`: the address members open, with nothing after the host. It must be `https://`; only `http://localhost`, `http://127.0.0.1` or `http://[::1]` may be plain http (for trying it on your own machine: the login cookie can then not be `Secure`).
 - `trustProxy`: `true` behind a tunnel or proxy, so that the rate limits count the visitor's address and not the tunnel's. Pine reads it from `X-Forwarded-For` (the last address there that no proxy on this machine or a private network added), and believes that header only from this machine or a private network. `CF-Connecting-IP` is not read: Cloudflare adds the visitor to `X-Forwarded-For` as well. Check that your tunnel sends `X-Forwarded-For` (Tailscale Funnel especially; see step 3): without it every visitor counts as the tunnel, and they share one limit.
-- `tiles`: `osm` (OpenStreetMap, the default) or `google` (Google's roadmap, satellite and hybrid beside OpenStreetMap; needs the browser key of step 4).
+- `tiles`: `stadia` (the default: Stadia Maps' Alidade Smooth, light or dark as the visitor's device is; register your domain with Stadia first, section 4), `osm` (OpenStreetMap's standard tiles alone, darkened by the page in dark) or `google` (Google's roadmap, satellite and hybrid beside Stadia's; needs the browser key of section 4).
 - `memberRole` (optional, not in the example above; `"memberRole": "Verified"`): the name of a role a member must have to see and press the server's parties on the map, for a server whose members are verified before they take part (`Verified`). It is matched as Pine's other role settings are: trimmed, whatever its letter case. A member without it (an administrator excepted) sees what a visitor who is not logged in sees: the regions and gyms, no parties, and the header says they are not a member of the server; a press is refused. Leave it out (or blank) and every member of the server counts. The region editor is not affected: it is for staff. One setting serves every server the bot is in: a server without a role of that name shows its parties to its administrators only.
 
 Build the page once: `npm run build` (or `npm run web:build` alone) writes it to `dist/web/assets/`. Without it the map's address says it has not been built.
@@ -44,15 +44,24 @@ Pine does not open ports or talk to your router. Pick one:
 
 Whichever you pick, check once that it sends the visitor's address. Pine logs no addresses, so ask for `<publicUrl>/auth/login` 21 times within a minute from one place, then once from another network (a phone without Wi-Fi). If the second is refused too ("Too many requests"), the tunnel sends no `X-Forwarded-For` and every visitor shares one limit.
 
-## 4. Google's tiles (optional)
+## 4. Map tiles
 
-OpenStreetMap's tiles need nothing. For Google's roadmap, satellite and hybrid as well:
+The map shows Stadia Maps' Alidade Smooth (light) and Alidade Smooth Dark (dark) by default, with no key: for a website Stadia checks the page's domain, so a key in the page would add nothing (anybody can read a page's key). Pine sends its origin with each tile request (its `Referrer-Policy` is `strict-origin-when-cross-origin`).
+
+1. Make a free account at Stadia Maps (the free plan is for non-commercial use: about 200,000 credits a month, refused past it, never billed).
+2. In its dashboard add a property with your domain (the host of `publicUrl`, for example `map.example.org`). `localhost` works without anything, for trying it on your own machine.
+
+When Stadia refuses its tiles (three failed in a row, or the first two of a visit: a domain it does not know, such as a quick tunnel's address, or the month's credits spent), the page switches to OpenStreetMap's tiles for the rest of the visit, darkened in dark mode. With `"tiles": "osm"` Stadia is never asked.
+
+### Google's tiles (optional)
+
+For Google's roadmap, satellite and hybrid as well, beside Stadia's:
 
 1. In the Google Cloud console, enable the **Map Tiles API** in a project with billing.
 2. Create an API key for browsers, separate from `GOOGLE_API_KEY` (which is the server's and never reaches a page). Restrict it to the **Map Tiles API** only, and to **HTTP referrers** `<publicUrl>/*` (for example `https://map.example.org/*`).
-3. Put it in `.env` as `GOOGLE_MAPS_BROWSER_KEY` and set `"tiles": "google"`. Without the key the start warns and the page shows OpenStreetMap only.
+3. Put it in `.env` as `GOOGLE_MAPS_BROWSER_KEY` and set `"tiles": "google"`. Without the key the start warns and the page shows Stadia Maps' tiles only.
 
-The price (Google's pricing page, checked 2026-10-16; check again before enabling): Map Tiles API 2D tiles are free up to 100,000 a month, then US$0.60 per 1,000. A visitor who pans around a city loads a few hundred tiles; the page asks Google only while a Google layer is chosen (OpenStreetMap is shown first). Set a budget alert in the Cloud console.
+The price (Google's pricing page, checked 2026-10-16; check again before enabling): Map Tiles API 2D tiles are free up to 100,000 a month, then US$0.60 per 1,000. A visitor who pans around a city loads a few hundred tiles; the page asks Google only while a Google layer is chosen (Stadia's are shown first). Set a budget alert in the Cloud console.
 
 ## 5. Check it
 
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index 2d944ff8990cd18cea3a6d159fed8b89652d20fe..43b361865594ccb3738270c30c86f01c48c0d913 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -155,8 +155,13 @@ describe('loadSettings', () => {
       host: '127.0.0.1',
       publicUrl: 'https://map.example.test',
       trustProxy: false,
-      tiles: 'osm',
+      // Stadia Maps' tiles by default (plan 8M-7), OpenStreetMap's when Stadia refuses.
+      tiles: 'stadia',
     });
+    const osm = writeSettings((s) => {
+      s.web = { port: 8080, publicUrl: 'https://map.example.test', tiles: 'osm' };
+    });
+    expect(loadSettings(osm).web?.tiles).toBe('osm');
     const all = writeSettings((s) => {
       s.web = {
         port: 3000,
diff --git a/src/config/settings.ts b/src/config/settings.ts
index 65ec3e16695323c00c369b6ec909dc22c63d72f4..720bb5363ee77e48bfa5572466e2131cf3a3deee 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -261,8 +261,10 @@ export const settingsSchema = z.strictObject({
    * off unless set. Pine serves plain HTTP on `host`:`port`; how the outside reaches it (a
    * tunnel, a proxy) is the operator's, and `publicUrl` is the address every link points at.
    * With `trustProxy` the client's address is read from the forwarding headers, but only from a
-   * peer on this machine or a private network. `tiles` picks the map pictures: OpenStreetMap's,
-   * or Google's beside them (needs `GOOGLE_MAPS_BROWSER_KEY`). With `memberRole` (a role's
+   * peer on this machine or a private network. `tiles` picks the map pictures (plan 8M-7): Stadia's
+   * Alidade Smooth, light or dark (the default; no key: Stadia checks the page's domain), falling
+   * back to OpenStreetMap's when Stadia refuses; OpenStreetMap's alone;
+   * or Google's beside Stadia's (needs `GOOGLE_MAPS_BROWSER_KEY`). With `memberRole` (a role's
    * name, compared as Pine's other role settings are: trimmed, whatever its letter case) only a
    * member who has that role, or an administrator, sees and presses a server's parties on the
    * map; any other member is treated as somebody who is not logged in (regions and gyms only).
@@ -274,7 +276,7 @@ export const settingsSchema = z.strictObject({
       host: z.string().trim().min(1).default('127.0.0.1'),
       publicUrl,
       trustProxy: z.boolean().default(false),
-      tiles: z.enum(['osm', 'google']).default('osm'),
+      tiles: z.enum(['stadia', 'osm', 'google']).default('stadia'),
       memberRole: z.preprocess(
         (value) => (typeof value === 'string' ? value.trim() || undefined : value),
         z.string().optional(),
diff --git a/src/config/warnings.test.ts b/src/config/warnings.test.ts
index eaab9e6a038a3b8899fb339af23ca25f584e6516..ccaf2017797ce6fd2421fd5d72353d334b48be61 100644
--- a/src/config/warnings.test.ts
+++ b/src/config/warnings.test.ts
@@ -126,7 +126,7 @@ describe('configWarnings', () => {
     expect(configWarnings({}, { regionMapLink: undefined })).toEqual([]);
   });
 
-  it('warns of Google tiles without the browser key: OpenStreetMap is shown', () => {
+  it("warns of Google tiles without the browser key: Stadia Maps' are shown", () => {
     const web = {
       port: 8080,
       host: '127.0.0.1',
@@ -138,7 +138,7 @@ describe('configWarnings', () => {
     const [warning, ...more] = configWarnings(raw, { regionMapLink: undefined, web });
     expect(more).toEqual([]);
     expect(warning).toMatch(/GOOGLE_MAPS_BROWSER_KEY/);
-    expect(warning).toMatch(/OpenStreetMap/);
+    expect(warning).toMatch(/Stadia Maps/);
     expect(
       configWarnings(
         { ...raw, GOOGLE_MAPS_BROWSER_KEY: 'browser-key' },
@@ -148,6 +148,10 @@ describe('configWarnings', () => {
     expect(
       configWarnings(raw, { regionMapLink: undefined, web: { ...web, tiles: 'osm' } }),
     ).toEqual([]);
+    // Stadia's tiles need no key (Stadia checks the page's domain).
+    expect(
+      configWarnings(raw, { regionMapLink: undefined, web: { ...web, tiles: 'stadia' } }),
+    ).toEqual([]);
   });
 
   it('says that the web pages stay off in rehearsal mode', () => {
diff --git a/src/config/warnings.ts b/src/config/warnings.ts
index 7bf1685c33695a7e9b2a456df0d0a32c781eca8b..2df7b6515bbfc20c614650ef6f15e4227384b8ee 100644
--- a/src/config/warnings.ts
+++ b/src/config/warnings.ts
@@ -11,7 +11,7 @@ import type { Settings } from './settings.js';
  * screenshots as `ocr.reviewPerDay` a day for `ocr.reviewDays` (about 2 MB each) would exceed
  * `ocr.keepMegabytes`. The web pages: without `DISCORD_CLIENT_SECRET` nobody can log in with
  * Discord (the login links of `/maps` still work), and Google's tiles without
- * `GOOGLE_MAPS_BROWSER_KEY` are OpenStreetMap's; in rehearsal mode they are not served at all.
+ * `GOOGLE_MAPS_BROWSER_KEY` are Stadia Maps' (plan 8M-7); in rehearsal mode they are not served at all.
  */
 export function configWarnings(
   raw: Record<string, string | undefined>,
@@ -73,7 +73,7 @@ export function configWarnings(
   if (settings.web?.tiles === 'google' && !set('GOOGLE_MAPS_BROWSER_KEY')) {
     warnings.push(
       "settings.web.tiles is 'google' but GOOGLE_MAPS_BROWSER_KEY is not set: the map shows " +
-        'OpenStreetMap only',
+        "Stadia Maps' tiles only",
     );
   }
   return warnings;
diff --git a/src/web/client/common.ts b/src/web/client/common.ts
index 83cfea37f76428f6b69df1b64693ab43012f8cfe..19837cdef1e82264c048068458ffdb5c4242743f 100644
--- a/src/web/client/common.ts
+++ b/src/web/client/common.ts
@@ -4,11 +4,18 @@ import {
   googleTileUrl,
   sessionRequest,
   sessionUrl,
+  BaseAttribution,
+  StadiaFallback,
+  tileLayers,
   viewportUrl,
+  type Scheme,
   type TileLayerSpec,
+  type TileSetting,
+  type XyzSpec,
 } from './layers.js';
 import { LOGOUT_FAILED, logOut } from './logout.js';
 import { headerLines, type Me, type WebPage } from './notice.js';
+import { darkScheme, onThemeChange } from './theme.js';
 
 /**
  * What the map page and the region editor share (plans 8M-1, 8M-2): the elements of the page,
@@ -105,22 +112,95 @@ function googleLayer(
   return group;
 }
 
-/** The tiles of the specs, the first shown, with a switch where there are several. */
-export function addTiles(
-  map: L.Map,
-  specs: readonly TileLayerSpec[],
-  key: string | undefined,
-): void {
-  const layers: Record<string, L.Layer> = {};
-  for (const spec of specs) {
-    layers[spec.name] =
-      spec.kind === 'osm'
-        ? L.tileLayer(spec.url, { attribution: spec.attribution, maxZoom: spec.maxZoom })
-        : googleLayer(map, spec, key ?? '');
-  }
-  const [first] = specs;
-  if (first) layers[first.name]?.addTo(map);
-  if (specs.length > 1) L.control.layers(layers, undefined, { position: 'topright' }).addTo(map);
+/** A plain layer of tiles. */
+/** A plain layer of tiles; its credit is the page's own (`BaseAttribution`). */
+const xyzLayer = (spec: XyzSpec): L.TileLayer =>
+  L.tileLayer(spec.url, {
+    maxZoom: spec.maxZoom,
+    ...(spec.maxNativeZoom === undefined ? {} : { maxNativeZoom: spec.maxNativeZoom }),
+  });
+
+/** The tiles a page's `data-tiles` names. */
+export function tileSetting(value: string | undefined): TileSetting {
+  return value === 'google' || value === 'osm' ? value : 'stadia';
+}
+
+/**
+ * The tiles of the setting (`tileLayers`), the base shown first, with a switch where Google's are
+ * offered too (plan 8M-7): the base follows the device's light or dark (`onThemeChange`), and
+ * once Stadia refuses its tiles it is OpenStreetMap's for the rest of the visit (`StadiaFallback`),
+ * the credit following the base shown (`BaseAttribution`).
+ * While OpenStreetMap's base is shown in dark, the map's container has `tiles-darkened`, whose
+ * filter in `map.css` darkens the tile pane (never Google's).
+ */
+export function addTiles(map: L.Map, setting: TileSetting, key: string | undefined): void {
+  const fallback = new StadiaFallback(setting);
+  const credit = new BaseAttribution(map.attributionControl);
+  const scheme = (): Scheme => (darkScheme() ? 'dark' : 'light');
+  const baseSpec = (): XyzSpec => {
+    const [base] = tileLayers(setting, key, scheme(), fallback.refused);
+    if (base?.kind !== 'xyz') throw new Error('the base tiles are plain tiles');
+    return base;
+  };
+  let spec = baseSpec();
+  let base = xyzLayer(spec);
+  const googles = tileLayers(setting, key, scheme()).filter(
+    (one): one is Extract<TileLayerSpec, { kind: 'google' }> => one.kind === 'google',
+  );
+  const order = [spec.name, ...googles.map((one) => one.name)];
+  const control =
+    googles.length === 0
+      ? undefined
+      : L.control.layers(
+          Object.fromEntries(googles.map((one) => [one.name, googleLayer(map, one, key ?? '')])),
+          undefined,
+          {
+            position: 'topright',
+            sortLayers: true,
+            // The base first, then Google's in their order, whatever was swapped in since.
+            sortFunction: (_a, _b, nameA, nameB) =>
+              (order.indexOf(nameA) + 1 || order.length + 1) -
+              (order.indexOf(nameB) + 1 || order.length + 1),
+          },
+        );
+  const darkened = (): void => {
+    map.getContainer().classList.toggle('tiles-darkened', spec.darkFilter && map.hasLayer(base));
+    credit.show(map.hasLayer(base) ? spec : undefined);
+  };
+  /** The base drawn anew in the scheme's style, or OpenStreetMap's once Stadia refused. */
+  const swap = (): void => {
+    const next = baseSpec();
+    if (next.url === spec.url) {
+      spec = next;
+      darkened();
+      return;
+    }
+    const shown = map.hasLayer(base);
+    control?.removeLayer(base);
+    map.removeLayer(base);
+    base.off('tileerror tileload');
+    spec = next;
+    order[0] = spec.name;
+    base = watched(xyzLayer(spec));
+    control?.addBaseLayer(base, spec.name);
+    if (shown) base.addTo(map);
+    darkened();
+  };
+  const watched = (layer: L.TileLayer): L.TileLayer =>
+    layer
+      .on('tileload', () => {
+        fallback.tileLoaded();
+      })
+      .on('tileerror', () => {
+        if (fallback.tileFailed()) swap();
+      });
+  base = watched(base);
+  control?.addBaseLayer(base, spec.name);
+  base.addTo(map);
+  control?.addTo(map);
+  map.on('baselayerchange', darkened);
+  onThemeChange(swap);
+  darkened();
 }
 
 /** Who is asking (`/api/me`); logged out when that cannot be read. */
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index d606cf1a4652b2d4a7e07c4979d93fddf8b06dd6..9fc892b75cf31e9596caade0c79ff0eea1ff43f0 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -26,7 +26,7 @@ import { MAX_NEW_CATEGORY, MAX_NEW_CHANNEL_NAME } from '../../domain/regions/sav
 import { splitOutline, type Split } from '../../domain/regions/split.js';
 import { normalisedOutline, roundSix } from '../../domain/regions/version.js';
 import type { EditorData, Point, Worded } from '../../domain/web/editor-data.js';
-import { addTiles, byId, getJson, say, showAccount, whoIsAsking } from './common.js';
+import { addTiles, byId, getJson, say, showAccount, tileSetting, whoIsAsking } from './common.js';
 import type {
   CoverageAnswer,
   CoverageRegion,
@@ -68,7 +68,6 @@ import {
   type PlaceCounts,
   type ReadAnswer,
 } from './editor-view.js';
-import { tileLayers } from './layers.js';
 import { loginNotice, type Me } from './notice.js';
 import { regionLabel, renderNode } from './popup.js';
 import { browserStorage, readStaged, writeStaged } from './staged-storage.js';
@@ -1550,11 +1549,7 @@ async function start(): Promise<void> {
   const dataset = document.body.dataset;
   const guild = dataset.guild ?? '';
   const map = L.map(byId('map'), { center: [40.44, -79.99], zoom: 11, preferCanvas: true });
-  addTiles(
-    map,
-    tileLayers(dataset.tiles === 'google' ? 'google' : 'osm', dataset.googleKey),
-    dataset.googleKey,
-  );
+  addTiles(map, tileSetting(dataset.tiles), dataset.googleKey);
   const notice = loginNotice(location.search);
   if (notice) {
     say(notice.text);
diff --git a/src/web/client/layers.test.ts b/src/web/client/layers.test.ts
index ec8659e93a937397635c028682248e014208b408..07f22a56ab32b54d3125d3e7372b8d1688e19af2 100644
--- a/src/web/client/layers.test.ts
+++ b/src/web/client/layers.test.ts
@@ -4,38 +4,145 @@ import {
   googleTileUrl,
   OSM_ATTRIBUTION,
   sessionRequest,
+  STADIA_ATTRIBUTION,
+  BaseAttribution,
+  StadiaFallback,
   tileLayers,
   viewportUrl,
 } from './layers.js';
 
-describe('tileLayers', () => {
-  it("is OpenStreetMap's alone unless Google's tiles are set and have a key", () => {
-    expect(tileLayers('osm', undefined)).toEqual([
-      {
-        kind: 'osm',
-        name: 'OpenStreetMap',
-        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
-        attribution: OSM_ATTRIBUTION,
-        maxZoom: 19,
-      },
+const OSM = {
+  kind: 'xyz',
+  provider: 'osm',
+  name: 'OpenStreetMap',
+  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
+  attribution: OSM_ATTRIBUTION,
+  // Drawn up to Stadia's 20, its own pictures enlarged past 19.
+  maxNativeZoom: 19,
+  maxZoom: 20,
+};
+
+const stadia = (style: string) => ({
+  kind: 'xyz',
+  provider: 'stadia',
+  name: 'Stadia Maps',
+  url: `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}{r}.png`,
+  attribution: STADIA_ATTRIBUTION,
+  maxZoom: 20,
+  darkFilter: false,
+});
+
+describe('tileLayers (plan 8M-7)', () => {
+  it("is Stadia Maps' Alidade Smooth by the device's scheme, light or dark", () => {
+    expect(tileLayers('stadia', undefined, 'light')).toEqual([stadia('alidade_smooth')]);
+    expect(tileLayers('stadia', undefined, 'dark')).toEqual([stadia('alidade_smooth_dark')]);
+    // A key for Google changes nothing unless Google's tiles are set.
+    expect(tileLayers('stadia', 'key', 'light')).toHaveLength(1);
+  });
+
+  it("is OpenStreetMap's alone for 'osm', darkened by the page's filter in dark", () => {
+    expect(tileLayers('osm', undefined, 'light')).toEqual([{ ...OSM, darkFilter: false }]);
+    expect(tileLayers('osm', 'key', 'dark')).toEqual([{ ...OSM, darkFilter: true }]);
+  });
+
+  it("offers Google's roadmap, satellite and hybrid beside Stadia's, only with a key", () => {
+    expect(tileLayers('google', 'key', 'dark').map((layer) => layer.name)).toEqual([
+      'Stadia Maps',
+      'Google roadmap',
+      'Google satellite',
+      'Google hybrid',
     ]);
-    expect(tileLayers('osm', 'key')).toHaveLength(1);
-    expect(tileLayers('google', undefined)).toHaveLength(1);
+    expect(tileLayers('google', undefined, 'light')).toEqual([stadia('alidade_smooth')]);
   });
 
-  it("offers Google's roadmap, satellite and hybrid beside OpenStreetMap", () => {
-    expect(tileLayers('google', 'key').map((layer) => layer.name)).toEqual([
+  it("is OpenStreetMap's in place of Stadia's once Stadia refused, Google's kept", () => {
+    expect(tileLayers('stadia', undefined, 'dark', true)).toEqual([{ ...OSM, darkFilter: true }]);
+    expect(tileLayers('stadia', undefined, 'light', true)).toEqual([{ ...OSM, darkFilter: false }]);
+    expect(tileLayers('google', 'key', 'light', true).map((layer) => layer.name)).toEqual([
       'OpenStreetMap',
       'Google roadmap',
       'Google satellite',
       'Google hybrid',
     ]);
   });
+
+  it("credits Stadia Maps, OpenMapTiles and OpenStreetMap's contributors, with links", () => {
+    expect(STADIA_ATTRIBUTION).toBe(
+      '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> ' +
+        '&copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ' +
+        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
+    );
+  });
+});
+
+describe('StadiaFallback (plan 8M-7)', () => {
+  it('switches after three failed tiles in a row, once for the visit', () => {
+    const fallback = new StadiaFallback('stadia');
+    fallback.tileLoaded();
+    expect(fallback.tileFailed()).toBe(false);
+    expect(fallback.tileFailed()).toBe(false);
+    expect(fallback.refused).toBe(false);
+    expect(fallback.tileFailed()).toBe(true);
+    expect(fallback.refused).toBe(true);
+    // Every later error (OpenStreetMap's, or Stadia's still on their way) is no switch.
+    expect(fallback.tileFailed()).toBe(false);
+    expect(fallback.tileFailed()).toBe(false);
+    expect(fallback.tileFailed()).toBe(false);
+  });
+
+  it('starts the run again at a tile that loads: a hiccup is no refusal', () => {
+    const fallback = new StadiaFallback('stadia');
+    fallback.tileLoaded();
+    expect(fallback.tileFailed()).toBe(false);
+    expect(fallback.tileFailed()).toBe(false);
+    fallback.tileLoaded();
+    expect(fallback.tileFailed()).toBe(false);
+    expect(fallback.tileFailed()).toBe(false);
+    expect(fallback.refused).toBe(false);
+  });
+
+  it('switches at once when the first two tiles of the visit both fail', () => {
+    const fallback = new StadiaFallback('stadia');
+    expect(fallback.tileFailed()).toBe(false);
+    expect(fallback.tileFailed()).toBe(true);
+    expect(fallback.refused).toBe(true);
+  });
+
+  it("never switches where Stadia's tiles are not shown", () => {
+    const fallback = new StadiaFallback('osm');
+    for (let i = 0; i < 5; i += 1) expect(fallback.tileFailed()).toBe(false);
+    expect(fallback.refused).toBe(false);
+  });
+});
+
+describe('BaseAttribution (plan 8M-7)', () => {
+  it("credits the base shown alone: OpenStreetMap's in place of Stadia's after the switch", () => {
+    const shown: string[] = [];
+    const control = {
+      addAttribution: (text: string) => {
+        shown.push(text);
+      },
+      removeAttribution: (text: string) => {
+        shown.splice(shown.indexOf(text), 1);
+      },
+    };
+    const credit = new BaseAttribution(control);
+    const [stadiaBase] = tileLayers('stadia', undefined, 'light');
+    const [osmBase] = tileLayers('stadia', undefined, 'light', true);
+    if (stadiaBase?.kind !== 'xyz' || osmBase?.kind !== 'xyz') throw new Error('no base');
+    credit.show(stadiaBase);
+    expect(shown).toEqual([STADIA_ATTRIBUTION]);
+    credit.show(osmBase);
+    expect(shown).toEqual([OSM_ATTRIBUTION]);
+    // A Google layer chosen in the switch: the base is not shown, nor credited.
+    credit.show(undefined);
+    expect(shown).toEqual([]);
+  });
 });
 
 describe("Google's tiles", () => {
   it('ask for a session of the map type, in English for the US, the hybrid with roads', () => {
-    const [, roadmap, satellite, hybrid] = tileLayers('google', 'key');
+    const [, roadmap, satellite, hybrid] = tileLayers('google', 'key', 'light');
     if (roadmap?.kind !== 'google' || satellite?.kind !== 'google' || hybrid?.kind !== 'google') {
       throw new Error('no Google layers');
     }
diff --git a/src/web/client/layers.ts b/src/web/client/layers.ts
index 3b089ed1208e0878c6fe5458ada4ae20e3c21525..89a1a17a8418003956d644d7c3eac54e3a99c463 100644
--- a/src/web/client/layers.ts
+++ b/src/web/client/layers.ts
@@ -1,17 +1,48 @@
 /**
- * The tiles the map offers (spec 2.3): OpenStreetMap's standard tiles, and with
- * `tiles: 'google'` and a browser key Google's roadmap, satellite and hybrid through the Map
- * Tiles API (a session per layer, then 2D tiles; never the raw `mt*.google.com` addresses).
+ * The tiles the map offers (spec 2.3, plan 8M-7): by `settings.web.tiles`, Stadia Maps' Alidade
+ * Smooth in the device's light or dark (no key: Stadia checks the page's domain, and `localhost`
+ * works without one), falling back to OpenStreetMap's standard tiles for the rest of the visit
+ * once Stadia refuses a tile (`StadiaFallback`); OpenStreetMap's alone; or with `tiles: 'google'`
+ * and a browser key Google's roadmap, satellite and hybrid beside Stadia's, through the Map Tiles
+ * API (a session per layer, then 2D tiles; never the raw `mt*.google.com` addresses).
+ * OpenStreetMap's tiles have no dark style: in dark they are darkened by a filter of the page
+ * (`darkFilter`, `map.css`).
  */
 
 /** OpenStreetMap's attribution as its tile policy asks (HTML of ours, for Leaflet). */
 export const OSM_ATTRIBUTION =
   '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
 
+/** Stadia Maps' attribution as its terms ask (HTML of ours, for Leaflet). */
+export const STADIA_ATTRIBUTION =
+  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> ' +
+  '&copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ' +
+  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
+
 const MAP_TILES = 'https://tile.googleapis.com';
 
+/** The tiles a page is told to show (`data-tiles`, `shownTiles` of the server). */
+export type TileSetting = 'stadia' | 'osm' | 'google';
+
+/** The device's scheme. */
+export type Scheme = 'light' | 'dark';
+
+/** A layer of plain tiles by a template of Leaflet's: Stadia's or OpenStreetMap's. */
+export interface XyzSpec {
+  kind: 'xyz';
+  provider: 'stadia' | 'osm';
+  name: string;
+  url: string;
+  attribution: string;
+  maxZoom: number;
+  /** The zoom past which its own pictures are enlarged (OpenStreetMap's stop at 19). */
+  maxNativeZoom?: number;
+  /** Darkened by the page's filter: OpenStreetMap's tiles in dark. */
+  darkFilter: boolean;
+}
+
 export type TileLayerSpec =
-  | { kind: 'osm'; name: string; url: string; attribution: string; maxZoom: number }
+  | XyzSpec
   | {
       kind: 'google';
       name: string;
@@ -21,27 +52,110 @@ export type TileLayerSpec =
       maxZoom: number;
     };
 
-/** The layers of the layer switch, OpenStreetMap's first (the one shown at first). */
-export function tileLayers(
-  tiles: 'osm' | 'google',
-  googleKey: string | undefined,
-): TileLayerSpec[] {
-  const osm: TileLayerSpec = {
-    kind: 'osm',
+/** OpenStreetMap's standard tiles, filtered in dark. */
+function osmTiles(scheme: Scheme): XyzSpec {
+  return {
+    kind: 'xyz',
+    provider: 'osm',
     name: 'OpenStreetMap',
     url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
     attribution: OSM_ATTRIBUTION,
-    maxZoom: 19,
+    // Its pictures stop at 19; enlarged past it, so the map reaches Stadia's 20 either way.
+    maxNativeZoom: 19,
+    maxZoom: 20,
+    darkFilter: scheme === 'dark',
+  };
+}
+
+/** Stadia's Alidade Smooth, or Alidade Smooth Dark; `{r}` is `@2x` on a sharp screen. */
+function stadiaTiles(scheme: Scheme): XyzSpec {
+  const style = scheme === 'dark' ? 'alidade_smooth_dark' : 'alidade_smooth';
+  return {
+    kind: 'xyz',
+    provider: 'stadia',
+    name: 'Stadia Maps',
+    url: `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}{r}.png`,
+    attribution: STADIA_ATTRIBUTION,
+    maxZoom: 20,
+    darkFilter: false,
   };
-  if (tiles !== 'google' || googleKey === undefined || googleKey === '') return [osm];
+}
+
+/**
+ * The layers of the layer switch, the base first (the one shown at first): Stadia's in the
+ * scheme's style, or OpenStreetMap's once Stadia refused (`stadiaRefused`) or for `'osm'`; with
+ * `'google'` and a key, Google's three after it.
+ */
+export function tileLayers(
+  tiles: TileSetting,
+  googleKey: string | undefined,
+  scheme: Scheme,
+  stadiaRefused = false,
+): TileLayerSpec[] {
+  const base = tiles === 'osm' || stadiaRefused ? osmTiles(scheme) : stadiaTiles(scheme);
+  if (tiles !== 'google' || googleKey === undefined || googleKey === '') return [base];
   return [
-    osm,
+    base,
     { kind: 'google', name: 'Google roadmap', mapType: 'roadmap', roads: false, maxZoom: 20 },
     { kind: 'google', name: 'Google satellite', mapType: 'satellite', roads: false, maxZoom: 20 },
     { kind: 'google', name: 'Google hybrid', mapType: 'satellite', roads: true, maxZoom: 20 },
   ];
 }
 
+/**
+ * Whether Stadia refused (plan 8M-7): a 401 on a domain Stadia does not know (a quick tunnel's),
+ * a 429 past the month's credits; the page cannot see which, only that tiles fail. Three failed
+ * tiles in a row with none loaded between, or the first two tiles of the visit both failed, switch
+ * the base layer to OpenStreetMap's for the rest of the visit, once; a tile that loads starts the
+ * run again, so a hiccup of the network is no refusal. Nothing switches where Stadia's tiles are
+ * not shown.
+ */
+export class StadiaFallback {
+  refused = false;
+  private failedInRow = 0;
+  private loadedAny = false;
+
+  constructor(private readonly tiles: TileSetting) {}
+
+  /** A tile of the base layer loaded. */
+  tileLoaded(): void {
+    this.loadedAny = true;
+    this.failedInRow = 0;
+  }
+
+  /** A tile of the base layer failed: true when this is the switch. */
+  tileFailed(): boolean {
+    if (this.tiles === 'osm' || this.refused) return false;
+    this.failedInRow += 1;
+    if (this.failedInRow < 3 && (this.loadedAny || this.failedInRow < 2)) return false;
+    this.refused = true;
+    return true;
+  }
+}
+
+/** What `BaseAttribution` needs of Leaflet's attribution control. */
+export interface AttributionControl {
+  addAttribution(text: string): void;
+  removeAttribution(text: string): void;
+}
+
+/**
+ * The credit of the base tiles, kept by the page itself (the layers carry none): the base shown,
+ * alone, so that OpenStreetMap's replaces Stadia's at the switch and none stays behind; none
+ * while a Google layer is chosen (Google's own is `googleAttribution`).
+ */
+export class BaseAttribution {
+  private shown: string | undefined;
+
+  constructor(private readonly control: AttributionControl | undefined) {}
+
+  show(spec: XyzSpec | undefined): void {
+    if (this.shown !== undefined) this.control?.removeAttribution(this.shown);
+    this.shown = spec?.attribution;
+    if (this.shown !== undefined) this.control?.addAttribution(this.shown);
+  }
+}
+
 /** The body of `createSession` for a Google layer. */
 export function sessionRequest(spec: Extract<TileLayerSpec, { kind: 'google' }>): {
   mapType: string;
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index dbd5b805bede347cebf85045f4153608ce53eaae..bacac11a16eac8303d2dfb4c5c64b67732e08cb0 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -1,8 +1,7 @@
 import * as L from 'leaflet';
 import type { GeoView } from '../../domain/web/geo-data.js';
-import { addTiles, byId, getJson, say, showAccount } from './common.js';
+import { addTiles, byId, getJson, say, showAccount, tileSetting } from './common.js';
 import { gymFilter } from './filter.js';
-import { tileLayers } from './layers.js';
 import { loginNotice } from './notice.js';
 import { GYM_DOT, gymClicks, showParties } from './party-layer.js';
 import { gymPopup, regionLabel, renderNode, type MapGym } from './popup.js';
@@ -121,11 +120,7 @@ function start(): void {
   const data = document.body.dataset;
   const guild = data.guild ?? '';
   const map = L.map(byId('map'), { center: [40.44, -79.99], zoom: 11 });
-  addTiles(
-    map,
-    tileLayers(data.tiles === 'google' ? 'google' : 'osm', data.googleKey),
-    data.googleKey,
-  );
+  addTiles(map, tileSetting(data.tiles), data.googleKey);
   const notice = loginNotice(location.search);
   if (notice) {
     say(notice.text);
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 8774efdf0731ded61a94c6c7c70190236a21bb3a..803d98a29e4c9ff27f4d50e55b4ba7cd64f1c631 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -197,6 +197,14 @@ a {
   color: var(--link);
 }
 
+/*
+ * OpenStreetMap's tiles in dark (plan 8M-7): they have no dark style, so the page darkens them
+ * (`addTiles` sets the class only while they are the base shown in dark; Stadia's have their own).
+ */
+.tiles-darkened .leaflet-tile-pane {
+  filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9) saturate(0.6);
+}
+
 .leaflet-bar a,
 .leaflet-bar a:hover {
   background: var(--panel-bg);
diff --git a/src/web/editor-routes.ts b/src/web/editor-routes.ts
index e87a4d94e8c99b6b767878a57eb8e8b04848390b..cfd433939014ce398e3b25c8b6a45daba5b99c23 100644
--- a/src/web/editor-routes.ts
+++ b/src/web/editor-routes.ts
@@ -16,6 +16,7 @@ import {
 } from './editor-save.js';
 import { etagMatches } from './geo-cache.js';
 import type { GuildRequest } from './guild-routes.js';
+import { shownTiles } from './headers.js';
 import { editorPage } from './page.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { RegionStaffSource, StaffAnswer } from './region-staff.js';
@@ -199,13 +200,13 @@ export function editorRoutes(scope: FastifyInstance, deps: WebDeps): void {
           .code(503)
           .send(shortPage('The region editor has not been built yet: run npm run web:build.'));
       }
-      const google = deps.settings.tiles === 'google' && deps.googleKey !== undefined;
+      const tiles = shownTiles(deps.settings.tiles, deps.googleKey);
       return reply.send(
         editorPage(
           {
             guildId: guild,
-            tiles: google ? 'google' : 'osm',
-            googleKey: google ? deps.googleKey : undefined,
+            tiles,
+            googleKey: tiles === 'google' ? deps.googleKey : undefined,
             login: deps.oauth ? 'discord' : 'links',
           },
           manifest,
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index 40e3de76c97b51d74b5c84192662b623f2c29976..e9234817e212b031be6133a9fb39da8b87bdef44 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -6,6 +6,7 @@ import { etagMatches } from './geo-cache.js';
 import { countsOnTheMap, mapMembers } from './map-members.js';
 import { maxRoutes } from './max-routes.js';
 import { meetupRoutes } from './meetup-routes.js';
+import { shownTiles } from './headers.js';
 import { mapPage } from './page.js';
 import { partyRoutes } from './party-routes.js';
 import { PartyViewers } from './party-viewers.js';
@@ -48,13 +49,13 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
         .code(503)
         .send(shortPage('The map has not been built yet: run npm run web:build.'));
     }
-    const google = deps.settings.tiles === 'google' && deps.googleKey !== undefined;
+    const tiles = shownTiles(deps.settings.tiles, deps.googleKey);
     return reply.send(
       mapPage(
         {
           guildId: request.params.guild,
-          tiles: google ? 'google' : 'osm',
-          googleKey: google ? deps.googleKey : undefined,
+          tiles,
+          googleKey: tiles === 'google' ? deps.googleKey : undefined,
           login: deps.oauth ? 'discord' : 'links',
         },
         manifest,
diff --git a/src/web/headers.test.ts b/src/web/headers.test.ts
index 5ee8b38d4a8e6e82181e0fb1fdec7cdc1266bdc1..b5c0b91b0d5719d5652d4a5b750ad535b74c26a2 100644
--- a/src/web/headers.test.ts
+++ b/src/web/headers.test.ts
@@ -19,7 +19,7 @@ describe('contentSecurityPolicy', () => {
   const pictures = ['https://cdn.leekduck.com', 'https://raw.githubusercontent.com'];
 
   it('lets in scripts and styles from Pine alone, and frames nothing', () => {
-    const policy = directives(contentSecurityPolicy({ google: false, pictureOrigins: pictures }));
+    const policy = directives(contentSecurityPolicy({ tiles: 'osm', pictureOrigins: pictures }));
     expect(policy.get('default-src')).toEqual(["'none'"]);
     expect(policy.get('script-src')).toEqual(["'self'"]);
     expect(policy.get('style-src')).toEqual(["'self'"]);
@@ -31,18 +31,35 @@ describe('contentSecurityPolicy', () => {
   });
 
   it("shows OpenStreetMap's tiles and the posts' pictures, and Google's only with Google", () => {
-    const osm = directives(contentSecurityPolicy({ google: false, pictureOrigins: pictures }));
+    const osm = directives(contentSecurityPolicy({ tiles: 'osm', pictureOrigins: pictures }));
     expect(osm.get('img-src')).toEqual([
       "'self'",
       'data:',
       'https://tile.openstreetmap.org',
       ...pictures,
     ]);
-    const google = directives(contentSecurityPolicy({ google: true, pictureOrigins: pictures }));
+    const google = directives(contentSecurityPolicy({ tiles: 'google', pictureOrigins: pictures }));
     expect(google.get('img-src')).toContain('https://tile.googleapis.com');
     expect(google.get('img-src')).toContain('https://tile.openstreetmap.org');
     expect(google.get('connect-src')).toEqual(["'self'", 'https://tile.googleapis.com']);
   });
+
+  it("shows Stadia Maps' tiles for 'stadia' and beside Google's, never for 'osm' (plan 8M-7)", () => {
+    const stadia = directives(contentSecurityPolicy({ tiles: 'stadia', pictureOrigins: pictures }));
+    // OpenStreetMap stays: the page falls back to it when Stadia refuses.
+    expect(stadia.get('img-src')).toEqual([
+      "'self'",
+      'data:',
+      'https://tiles.stadiamaps.com',
+      'https://tile.openstreetmap.org',
+      ...pictures,
+    ]);
+    expect(stadia.get('connect-src')).toEqual(["'self'"]);
+    const google = directives(contentSecurityPolicy({ tiles: 'google', pictureOrigins: pictures }));
+    expect(google.get('img-src')).toContain('https://tiles.stadiamaps.com');
+    const osm = directives(contentSecurityPolicy({ tiles: 'osm', pictureOrigins: pictures }));
+    expect(osm.get('img-src')).not.toContain('https://tiles.stadiamaps.com');
+  });
 });
 
 describe('pictureOrigins', () => {
@@ -63,7 +80,7 @@ describe('pictureOrigins', () => {
 
 describe('securityHeaders', () => {
   it('refuses sniffing and frames, and sends only the origin to other sites', () => {
-    const headers = securityHeaders({ google: false, pictureOrigins: [] });
+    const headers = securityHeaders({ tiles: 'osm', pictureOrigins: [] });
     expect(headers['x-content-type-options']).toBe('nosniff');
     expect(headers['x-frame-options']).toBe('DENY');
     expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
diff --git a/src/web/headers.ts b/src/web/headers.ts
index d678e9ddb565f5313e5574b49cf97971f67f542f..afedc0ea2ee4ab2a3558acefb54300b82e1e571e 100644
--- a/src/web/headers.ts
+++ b/src/web/headers.ts
@@ -5,10 +5,26 @@ import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
 export const OSM_TILES = 'https://tile.openstreetmap.org';
 /** Google's Map Tiles API: its sessions, its 2D tiles and its attribution. */
 export const GOOGLE_TILES = 'https://tile.googleapis.com';
+/** Stadia Maps' raster tiles (plan 8M-7): Alidade Smooth, light and dark. */
+export const STADIA_TILES = 'https://tiles.stadiamaps.com';
+
+/** The tiles a page shows (`settings.web.tiles`, plan 8M-7). */
+export type TileSetting = 'stadia' | 'osm' | 'google';
+
+/**
+ * The tiles the pages show by the setting: Google's only with the browser key, Stadia's in their
+ * place without it (Stadia needs no key: it checks the page's domain).
+ */
+export function shownTiles(setting: TileSetting, googleKey: string | undefined): TileSetting {
+  return setting === 'google' && googleKey === undefined ? 'stadia' : setting;
+}
 
 export interface PolicyOptions {
-  /** Whether the page shows Google's tiles (`tiles: 'google'` with a browser key). */
-  google: boolean;
+  /**
+   * The tiles the page shows (`shownTiles`): Stadia's with OpenStreetMap's to fall back to,
+   * OpenStreetMap's alone, or Google's beside Stadia's.
+   */
+  tiles: TileSetting;
   /** The origins of the pictures posts show (`pictureOrigins`). */
   pictureOrigins: readonly string[];
 }
@@ -33,13 +49,19 @@ export function pictureOrigins(publicUrl: string): string[] {
 
 /**
  * The Content Security Policy of every answer (spec 2.2): scripts, styles and fonts from Pine
- * alone, no inline script; pictures from Pine, the tile hosts and the posts' picture hosts;
- * connections to Pine and, with Google's tiles, the Map Tiles API; no frames, no `<base>`,
- * forms only to Pine. Leaflet sets `style` attributes from its script, which `style-src` does
- * not govern (it covers style elements and attributes in the markup).
+ * alone, no inline script; pictures from Pine, the tile hosts and the posts' picture hosts
+ * (Stadia's unless the tiles are OpenStreetMap's alone, plan 8M-7; OpenStreetMap's always, the
+ * fallback); connections to Pine and, with Google's tiles, the Map Tiles API; no frames, no
+ * `<base>`, forms only to Pine. Leaflet sets `style` attributes from its script, which
+ * `style-src` does not govern (it covers style elements and attributes in the markup).
  */
-export function contentSecurityPolicy({ google, pictureOrigins }: PolicyOptions): string {
-  const tiles = google ? [OSM_TILES, GOOGLE_TILES] : [OSM_TILES];
+export function contentSecurityPolicy({ tiles: shown, pictureOrigins }: PolicyOptions): string {
+  const google = shown === 'google';
+  const tiles = [
+    ...(shown === 'osm' ? [] : [STADIA_TILES]),
+    OSM_TILES,
+    ...(google ? [GOOGLE_TILES] : []),
+  ];
   return [
     "default-src 'none'",
     "script-src 'self'",
diff --git a/src/web/page.test.ts b/src/web/page.test.ts
index 3f1128ae9f1b1f97bf6e8c2caffab1fa30e9be7f..8a592de6d056f67d9e20c2d15643e59ea299064c 100644
--- a/src/web/page.test.ts
+++ b/src/web/page.test.ts
@@ -103,12 +103,27 @@ describe('the map page', () => {
 
     web = webServerWith({ assets: builtAssets(), web: { tiles: 'google' } });
     const without = await web.app.inject({ url: MAP });
+    // Without the key: Stadia Maps' tiles alone (plan 8M-7), as with the default.
     expect(bodyData(without.body)).toEqual({
       'data-guild': FAKE_GUILD_ID,
-      'data-tiles': 'osm',
+      'data-tiles': 'stadia',
       'data-login': 'discord',
     });
     expect(without.headers['content-security-policy']).not.toContain('googleapis');
+    expect(without.headers['content-security-policy']).toContain('https://tiles.stadiamaps.com');
+  });
+
+  it("gives the page Stadia Maps' tiles, which need no key, and OpenStreetMap's alone for 'osm'", async () => {
+    web = webServerWith({ assets: builtAssets(), web: { tiles: 'stadia' } });
+    const page = await web.app.inject({ url: MAP });
+    expect(bodyData(page.body)['data-tiles']).toBe('stadia');
+    expect(page.headers['content-security-policy']).toContain('https://tiles.stadiamaps.com');
+    await web.app.close();
+
+    web = webServerWith({ assets: builtAssets(), web: { tiles: 'osm' } });
+    const osm = await web.app.inject({ url: MAP });
+    expect(bodyData(osm.body)['data-tiles']).toBe('osm');
+    expect(osm.headers['content-security-policy']).not.toContain('stadiamaps');
   });
 
   it('offers no login with Discord without the client secret', async () => {
diff --git a/src/web/page.ts b/src/web/page.ts
index 17c5e696ae4f7dd0b760f11cc717b1d39d18e009..d2d964ad88d8032d64b7b465b9283d4a7180f4e1 100644
--- a/src/web/page.ts
+++ b/src/web/page.ts
@@ -1,6 +1,7 @@
 import { readFile } from 'node:fs/promises';
 import path from 'node:path';
 import { COLOR_SCHEME_META, escapeHtml } from './answers.js';
+import type { TileSetting } from './headers.js';
 
 /** Where `npm run web:build` leaves the bundle, from the bot's working folder. */
 export const WEB_DIST = 'dist/web';
@@ -69,8 +70,8 @@ export async function readAssets(root = WEB_DIST): Promise<WebAssets> {
 /** What the map page is told: in `data-` attributes of `<body>`, escaped. */
 export interface MapPageData {
   guildId: string;
-  /** The tiles the page offers: Google's only with a browser key. */
-  tiles: 'osm' | 'google';
+  /** The tiles the page offers (`shownTiles`): Google's only with a browser key. */
+  tiles: TileSetting;
   /** The browser key, only with Google's tiles. */
   googleKey?: string;
   /** How a member logs in: with Discord, or only through the links of `/maps`. */
diff --git a/src/web/server.ts b/src/web/server.ts
index fe7cb0424167ad2335e7920c78e3e570661c9e1f..d92d044f9ba0aefbed2110206e4636cbc7077c88 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -16,7 +16,7 @@ import type { OAuthGateway } from './discord-oauth.js';
 import type { EditorDeps } from './editor-routes.js';
 import type { GeoCache } from './geo-cache.js';
 import { guildRoutes } from './guild-routes.js';
-import { securityHeaders } from './headers.js';
+import { securityHeaders, shownTiles } from './headers.js';
 import type { LoginLinks } from './login-links.js';
 import type { MaxWebDeps } from './max-routes.js';
 import type { MeetupWebDeps } from './meetup-routes.js';
@@ -98,7 +98,7 @@ export function buildWebServer(deps: WebDeps): FastifyInstance {
     return503OnClosing: true,
   });
   const headers = securityHeaders({
-    google: settings.tiles === 'google' && deps.googleKey !== undefined,
+    tiles: shownTiles(settings.tiles, deps.googleKey),
     pictureOrigins: deps.pictureOrigins,
   });
 
````

### Task 3: 8M-7 task 3: the map's zoom and start view, your location, distances

Prototype commit: `c63ee9c1a39dd594be73f58901b52e43a13415bb`

The map never zooms out past the zoom that fits all of the server's regions and
stops panning a quarter of their size beyond them. It opens at your location
when the browser granted it already, else on the region /maps named (/maps in a
region's channel puts ?region=<id> in its address and login link), else where
you last left it (kept per server in the browser), else on the whole server.
"Show where I am" asks the browser only when pressed, draws a blue dot with its
accuracy and keeps it current. Distances are said in miles and feet.

**Files:**

```
 docs/architecture/web.md             |  12 ++++++++-
 src/commands/util/maps.test.ts       |  25 +++++++++++++++++++
 src/commands/util/maps.ts            |  11 +++++++--
 src/render/distance-words.ts         |  15 +++++++++++
 src/web/auth-routes.ts               |   5 +++-
 src/web/client/distance.test.ts      |  21 ++++++++++++++++
 src/web/client/distance.ts           |  19 ++++++++++++++
 src/web/client/main.ts               |  19 +++++++++-----
 src/web/client/map.css               |  20 +++++++++++++++
 src/web/client/theme.css             |   4 +++
 src/web/client/theme.ts              |   3 +++
 src/web/client/view-ui.ts            |  96 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/view.test.ts          | 184 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/view.ts               | 211 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/you-ui.ts             | 155 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/your-location.test.ts |  35 ++++++++++++++++++++++++++
 src/web/client/your-location.ts      |  37 ++++++++++++++++++++++++++++
 src/web/login-links.test.ts          |  14 +++++++++++
 src/web/login-links.ts               |  22 ++++++++++++++---
 src/web/login.test.ts                |  10 ++++++++
 20 files changed, 905 insertions(+), 13 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/util/maps.test.ts src/web/client/distance.test.ts src/web/client/view.test.ts src/web/client/your-location.test.ts src/web/login-links.test.ts src/web/login.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c63ee9c1a39dd594be73f58901b52e43a13415bb -- src test scripts data docs/architecture docs/guides docs/web-setup.md docs/superpowers/plans/phase-0-follow-ups.md CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-7 task 3: the map's zoom and start view, your location, distances`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index fc990ff80c85f21602146413b27a00c7dbcfb092..4daefcbfea6c550fbdc08f8eb77f0f062050de3e 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -29,7 +29,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 ## Logging in
 
 - With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
-- With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page without script (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, so that a link preview or a prefetch cannot spend the link. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped), because one click on somebody else's link logs you in as them, and the page is where you see whose it is. An unknown, used or expired link, or one of another server, shows plain "Continue" and nothing else (its POST lands on `?login=expired`). `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The answers of `/maps` and `/region edit` say so under the button: "The button logs you in as well. It works once, within five minutes; do not share it: it logs in whoever opens it as you. Use /maps again for another." (Matt, 2026-10-18). The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
+- With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page without script (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, so that a link preview or a prefetch cannot spend the link. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped), because one click on somebody else's link logs you in as them, and the page is where you see whose it is. An unknown, used or expired link, or one of another server, shows plain "Continue" and nothing else (its POST lands on `?login=expired`). `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, with `?region=<id>` for a link of `/maps` used in a region's channel, plan 8M-7, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The answers of `/maps` and `/region edit` say so under the button: "The button logs you in as well. It works once, within five minutes; do not share it: it logs in whoever opens it as you. Use /maps again for another." (Matt, 2026-10-18). The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
 - Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute, `/s/*/api/powerspots` 60 a minute, `/s/*/api/max-options` 30 a minute, the reports of max battles 30 a minute (`MAX_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stop-reports` 30 a minute (`STOP_REPORTS_PER_MINUTE`), `/s/*/api/research-options` and `/s/*/api/rocket-options` 30 a minute each, the reports at stops and their taking back 30 a minute together (`STOP_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`), a press of the Manage train panel in the window of the post's controls (as the post's panel counts; its kind menu too, plan 8X-5), a report of a max battle in `/max`'s (`MAX_COMMAND`, `MAX_THROTTLE`), a research report in `/research report`'s and a Rocket report in `/rocket report`'s (`researchWindow`, `rocketWindow`: their limits come from the settings, so the window is the varied one, `{ command, varies: true }`), a taking back in `/research remove`'s or `/rocket remove`'s by the report's kind (`MEMBER_WRITE_THROTTLE`), the Remote switch of a party in the window of the post's controls (as its Remote button counts), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words); the work after it runs in `countedOnTheMap`, which gives the use back on an unexpected error or a `UserError` with `givesBack`, as the router does (a refusal stays counted; a write whose service answers a refusal with `givesBack`, a new train or meetup, gives it back itself with `givenBackOnTheMap`).
 
 ## The public map
@@ -39,6 +39,16 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - The pages' code is `src/web/client/` with its own `tsconfig.json` (the DOM; the root config excludes the folder), bundled by `scripts/web/build.ts` (`npm run web:build`, also run by `npm run build`) with esbuild: IIFEs for ES2022, minified, into `dist/web/assets/` with hashed names: the map (`map-<hash>.js`, `map-<hash>.css` with Leaflet's CSS, Leaflet's pictures), the region editor (`editor-<hash>.js` with Geoman, `editor-<hash>.css` with Geoman's CSS, and its worker `editor-worker-<hash>.js`); `dist/web/assets.json` names each page's script and style and the worker (`AssetManifest`: `map`, `editor`; read at start by `readAssets`, which takes a manifest of an older build as none). What both pages share (the tiles with Google's layers, the header and its login, reading JSON) is `src/web/client/common.ts`. The rest of `dist/web/` is the compiled server code; the build empties only `assets/`. `/assets/` (`@fastify/static`) serves that one flat folder: no index, no listing, plain file names only; a hashed name `public, max-age=31536000, immutable`, anything else `no-cache`.
 - The page: Leaflet; the tiles of `data-tiles` (`addTiles`, `src/web/client/common.ts`, over `tileLayers`, `src/web/client/layers.ts`, plan 8M-7): Stadia's Alidade Smooth in light and Alidade Smooth Dark in dark (`https://tiles.stadiamaps.com/tiles/alidade_smooth{_dark}/{z}/{x}/{y}{r}.png`, credited "© Stadia Maps © OpenMapTiles © OpenStreetMap contributors" with links, `STADIA_ATTRIBUTION`), drawn anew in the other style when the device changes between light and dark; once Stadia refuses its tiles (three failed in a row with none loaded between, or the first two of the visit: a 401 on a domain it does not know, a 429 past the month's credits; the page cannot tell which, and a tile that loads starts the run again) OpenStreetMap's for the rest of the visit, once (`StadiaFallback`), drawn to zoom 20 with its own pictures enlarged past 19 (`maxNativeZoom`); the credit is the page's own, of the base shown alone (`BaseAttribution`: OpenStreetMap's replaces Stadia's at the switch, none while a Google layer is chosen); OpenStreetMap's alone for `osm`; OpenStreetMap's in dark are darkened by the class `tiles-darkened` on the map's container (a filter of `map.css` on the tile pane: invert, hue turned half round, a little less brightness, contrast and saturation; only while OpenStreetMap's base is shown, never on Google's); with Google's tiles a layer switch (the base first, then roadmap, satellite, hybrid: a session per layer from `createSession`, 2D tiles, the attribution of what is in view from `viewport` after the map rests, shown with "Google Maps"; `src/web/client/layers.ts`). Regions as outlines with their names from zoom 12; gyms as dots, all in one color; a popup per gym built as a tree of nodes and rendered with `textContent` only (`gymPopup`, `renderNode`): never HTML from data. Leaflet treats string content as HTML (tooltips, popups, attributions, the layer switch's names): data goes to it as nodes (`renderNode`; a region's label is `regionLabel`), and the only strings it is given are constants of ours and the escaped copyright of `googleAttribution`. The filter box hides gyms whose name and nickname lack a word typed (`gymFilter`: no case, accents or apostrophes) and fits the map to the matches on Enter. The header: "Log in with Discord" (only with the secret) or "Use /maps in Discord to log in.", or the member's name, Log out (a POST with the CSRF token; `logOut`, `src/web/client/logout.ts`: on a 403, the token of a page loaded before a restart, it asks `/api/me` again and tries once more, a session gone by then counting as logged out; only a 2xx is logged out, so a second refusal, any other status or a broken connection says "Log out failed; try again.") and why they see only the public map (`headerLines`, `src/web/client/notice.ts`: Discord away; for `missingRole` "You can look around the map. To join or report here, you need the Verified role in this server."; else "You are not a member of this server."). `?login=failed|expired` is said once and taken out of the address.
 
+## The map's frame (plan 8M-7)
+
+Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's frame", "Layers", "Markers", "The list"). The look and the tiles are under "Restyling the page" and "The public map".
+
+- **Zoom and panning** (`view.ts`, pure; Leaflet's side `view-ui.ts`, `placeTheMap`): the map never zooms out past the zoom that fits all of the server's regions in its size (`zoomLimits`: `fitZoom` of `regionsBox`, Web Mercator as Leaflet's `getBoundsZoom` without padding, worked out again on `resize`), and panning stops a quarter of the regions' size beyond them each way (`paddedBox(…, PAN_MARGIN)`, Leaflet's `maxBounds` with `maxBoundsViscosity` 0.8, `BOUNDS_VISCOSITY`). A server without regions has no limits.
+- **The start view** (`startView`, the first rule that applies): (1) your location, at street level (`STREET_ZOOM`, 15), when the browser granted it already (`alreadyGranted`, `your-location.ts`: `navigator.permissions.query({ name: 'geolocation' })` is `granted`; the page never asks on load), applied when its first fix comes unless the member moved the map meanwhile (`MemberMoves`: any `movestart` or `zoomstart` after the start view is set, a tap on a line of the list that flies the map among them); (2) the region `/maps` named (`?region=<id>`, `regionOf`), at street level at the middle of its box; it wins over (3) where the member last left the map of this server, at its own zoom (`readLastView` / `writeLastView`: `localStorage` `pine-map-view:<guild>`, written at each `moveend`, read and written in try/catch, `browserStorage`); (4) the whole server (`fitBounds` of its regions, else of its gyms, else "This server has no regions yet."). A location or last view beyond the regions and their margin is passed over. `?region=` is taken out of the address once read (as `?login=`), so that a reload opens where the member left the map.
+- **`/maps` names its region:** used in a region's channel or its forum (`regionChannelOf`), `/maps` puts the region's id in the map's address it shows (`/s/<guild>/map?region=<id>`) and in its login link (`LoginLinks.issue(…, 'map', region)`, `LinkHolder.region`); the link's POST redirects to `/s/<guild>/map?region=<id>` (an id of ours, never of the request); an expired link lands on the whole map (`?login=expired`).
+- **Your location** (`you-ui.ts`, `showWhereYouAre`; words in `your-location.ts`): "Show where I am", a round button with a crosshair (SVG of ours, `currentColor`) at the bottom right, asks the browser only when pressed (`watchPosition`, high accuracy), draws a blue dot (`--you`, edged `--you-edge`, drawn colors of `theme.ts`) with a circle of its accuracy, centers the map on it at street level or closer, and keeps it current while the page is open; pressed again it centers on the dot. Refused or unavailable: one line under the header (`locationRefusal`: "Your browser did not share your location.", "Your location is not available just now.", or "This browser cannot share your location with this page." where there is no geolocation or the page is not a secure context; browsers count `http://localhost` as one), nothing else. `onMove` tells the list each new fix.
+- **Distances** (`distance.ts`): `metersBetween`, which is `metresBetween` of `@pine/wayspot-core/distance` itself (the function the place search and Wayfarer matching measure with: one source for every fact, Matt 2026-10-25), and `distanceWords` (`src/render/distance-words.ts`, import-free, so that Discord's side can share it once Matt rules on one rule for both: the map says miles and feet, Discord meters and kilometers): under a tenth of a mile in feet, rounded to 10 (`60 ft`), else miles to one decimal (`1.3 mi`).
+
 ## The parties on the map (plan 8M-3)
 
 - **Who sees what** (spec 2.5; `PartyViewers`, `src/web/party-viewers.ts`, decided per request, never from the session): a member of the server (`members.find`, kept a minute by the directory) sees every active party of it except those in a forum `PartyGateway.memberAccess` says they are `barred` from (an overwrite somebody set to keep them out); a forum hidden from @everyone and allowed to a role is not `barred` for a member without that role, so its parties show and Join opens the forum to them, as signing up on a copy does (spec 2.5: the map crosses region roles). A server whose members must earn a role first (a verification role, `Verified`) names it in `settings.web.memberRole` (Matt, 2026-10-17: "unverified members can browse the map in read-only, same as someone that hasn't logged in"): a member without a role of that name (compared as Pine's other role settings: trimmed, whatever its letter case), unless an administrator, is treated as a visitor who is not logged in: `/api/me` says `member: false`, `/api/parties` 403 (the page shows regions and gyms only), a press 403 (`countsOnTheMap`, `src/web/map-members.ts`). It is decided where membership is: the directory's answer, kept a minute (`mapMembers` over `members.find`, given to `/api/me` and the parties by `guildRoutes`; `ServerMember.standing`: the roles by name and Administrator, `memberStanding`), and for a press also the member fetched fresh (`ActingAnswer.standing`). Unset (the default) every member counts; the region editor does not ask it (staff only). what Discord said of a member and a forum is used for a minute (`BARRED_FRESH_MS`, a `BoundedMap` of 10,000), so a page that asks every 20 s does not have every forum looked at each time. While Discord cannot be asked: a member it confirmed within 30 minutes (`MEMBER_SEEN_MS`) gets the list read-only, by what it said last of each forum (a forum it said nothing of lately is hidden); once Discord failed in a request (the member or any forum), nothing more is asked of it in that request, the forums left go by what it said lately (or are hidden), and one warning is logged; anybody else 503 "Discord cannot be reached just now, so I cannot tell whether you are a member." Not logged in 401, not a member 403.
diff --git a/src/commands/util/maps.test.ts b/src/commands/util/maps.test.ts
index 905d474cfb4fc97e517d325b59c3c5507db36735..e6c58a865f9a0c848742d92bfcaef8948cc4ae40 100644
--- a/src/commands/util/maps.test.ts
+++ b/src/commands/util/maps.test.ts
@@ -8,6 +8,7 @@ import {
   sent,
 } from '../../../test/support/fake-interactions.js';
 import { buttonsOf, textOf } from '../../../test/support/messages.js';
+import { WEST_CHANNEL } from '../../../test/support/gyms.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { TEST_WEB } from '../../../test/support/web.js';
 import type { Settings } from '../../config/settings.js';
@@ -84,6 +85,30 @@ describe('/maps', () => {
     });
   });
 
+  it('opens the map on the region of the channel it was used in (plan 8M-7)', async () => {
+    const { ctx, run } = setup({ web: TEST_WEB });
+    const region = ctx.regions.byChannel(WEST_CHANNEL)?.id;
+    expect(region).toBeDefined();
+    const message = asV2(answered(await run({ channelId: WEST_CHANNEL })));
+    expect(textOf(message)).toContain(
+      `https://map.example.test/s/${FAKE_GUILD_ID}/map?region=${region}`,
+    );
+    const url = new URL(buttonsOf(message)[0]?.url ?? '');
+    const token = url.pathname.split('/').at(-1) ?? '';
+    expect(ctx.loginLinks.redeem(token, Date.now())).toMatchObject({ page: 'map', region });
+    // Anywhere else in the server: the whole map, no region named.
+    const elsewhere = asV2(answered(await run()));
+    expect(textOf(elsewhere)).toContain(`https://map.example.test/s/${FAKE_GUILD_ID}/map`);
+    expect(textOf(elsewhere)).not.toContain('?region=');
+    const plain = new URL(buttonsOf(elsewhere)[0]?.url ?? '');
+    expect(ctx.loginLinks.peek(plain.pathname.split('/').at(-1) ?? '', Date.now())).toEqual({
+      guildId: FAKE_GUILD_ID,
+      userId: ASH,
+      userName: 'Ash',
+      page: 'map',
+    });
+  });
+
   it("names the link's member by their username when they have no display name", async () => {
     const { ctx, run } = setup({ web: TEST_WEB });
     const url = new URL(buttonsOf(asV2(answered(await run({ globalName: null }))))[0]?.url ?? '');
diff --git a/src/commands/util/maps.ts b/src/commands/util/maps.ts
index 208bf4a5eb1272b5b0d4a06054193e0906fc5cdf..9ad518ad20070925359c2d7cd10965aebd16ed4b 100644
--- a/src/commands/util/maps.ts
+++ b/src/commands/util/maps.ts
@@ -1,5 +1,6 @@
 import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
 import type { SimpleCommand } from '../../discord/command.js';
+import { regionChannelOf } from '../../discord/guards.js';
 import { answer, v2Answer } from '../../discord/late-reply.js';
 import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
 import { actionRow, LIST_COLOUR, linkButton, textMessage } from '../../render/v2.js';
@@ -7,7 +8,8 @@ import { actionRow, LIST_COLOUR, linkButton, textMessage } from '../../render/v2
 /**
  * `/maps` (the legacy `!maps`), for the member alone. With the web pages (`settings.web`, plan
  * 8M-1): the address of the server's map and a button that opens it logged in (a login link of
- * five minutes, once; issuing one is a write, hence `MEMBER_WRITE_THROTTLE`); in a DM, which
+ * five minutes, once; issuing one is a write, hence `MEMBER_WRITE_THROTTLE`), on the region of
+ * the channel it was used in (plan 8M-7: `?region=<id>` in the address and the link); in a DM, which
  * names no server, the map of all regions where `settings.regionMapLink` is set, else where to
  * ask. Without them: the address of the map of all regions, anywhere. Offered where either is
  * set; also in a DM with the bot and the post of a party: the legacy bot sent it by DM to keep
@@ -38,13 +40,18 @@ export const maps: SimpleCommand = {
       // One login serves every server: the session is named as the account is, not as the
       // member is named in this server (as logging in with Discord names it).
       const { user } = interaction;
+      // Used in a region's channel (or its forum), the map opens on that region (plan 8M-7).
+      const channel = regionChannelOf(interaction, ctx);
+      const region = channel === undefined ? undefined : ctx.regions.byChannel(channel)?.id;
       const token = ctx.loginLinks.issue(
         guild,
         user.id,
         user.globalName ?? user.username,
         Date.now(),
+        'map',
+        region,
       );
-      const map = `${web.publicUrl}/s/${guild}/map`;
+      const map = `${web.publicUrl}/s/${guild}/map${region === undefined ? '' : `?region=${region}`}`;
       await answer(
         interaction,
         v2Answer(
diff --git a/src/render/distance-words.ts b/src/render/distance-words.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f808e999f0328273e1cc0c0bd94847ef6202e116
--- /dev/null
+++ b/src/render/distance-words.ts
@@ -0,0 +1,15 @@
+/**
+ * A distance in words (plan 8M-7), for the live map's list today and, once Matt rules on one rule
+ * for both sides (the map says miles and feet, Discord says meters and kilometers), for Discord's
+ * too: kept here, with no import, so that the page's bundle and the renderer can share it.
+ */
+
+const METERS_PER_MILE = 1609.344;
+const FEET_PER_METER = 3.280_839_9;
+
+/** Under a tenth of a mile in feet, to ten (`60 ft`); else miles to one decimal (`1.3 mi`). */
+export function distanceWords(meters: number): string {
+  const miles = meters / METERS_PER_MILE;
+  if (miles < 0.1) return `${Math.round((meters * FEET_PER_METER) / 10) * 10} ft`;
+  return `${miles.toFixed(1)} mi`;
+}
diff --git a/src/web/auth-routes.ts b/src/web/auth-routes.ts
index 2c9f6d16d932129312196a899261b114ce5d4115..b6ea2533a44160fd045f14c67eca2391343102c3 100644
--- a/src/web/auth-routes.ts
+++ b/src/web/auth-routes.ts
@@ -163,7 +163,10 @@ export function authRoutes(app: FastifyInstance, deps: WebDeps): void {
       }
       await sessions.start(request, reply, { id: holder.userId, name: holder.userName });
       log.info({ user: holder.userId, guild }, 'logged in to the web pages with a link');
-      return reply.redirect(`/s/${guild}/${holder.page}`, 303);
+      // The map on the region of the channel /maps was used in (plan 8M-7): a number of ours.
+      const region =
+        holder.page === 'map' && holder.region !== undefined ? `?region=${holder.region}` : '';
+      return reply.redirect(`/s/${guild}/${holder.page}${region}`, 303);
     };
   app.post('/auth/link/:guild/:token', useLink('map'));
   app.post('/auth/link/:guild/:token/edit', useLink('regions/edit'));
diff --git a/src/web/client/distance.test.ts b/src/web/client/distance.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..14923d9357a3543619abb26f17b7a99741231682
--- /dev/null
+++ b/src/web/client/distance.test.ts
@@ -0,0 +1,21 @@
+import { describe, expect, it } from 'vitest';
+import { metresBetween } from '@pine/wayspot-core/distance';
+import { distanceWords, metersBetween } from './distance.js';
+
+describe('distances (plan 8M-7)', () => {
+  it('measures along the earth as the rest of Pine does, by the one shared function', () => {
+    // One source for every fact (Matt, 2026-10-25): no second haversine in the page.
+    expect(metersBetween).toBe(metresBetween);
+    expect(metersBetween({ lat: 40, lon: -80 }, { lat: 40.001, lon: -80 })).toBeCloseTo(111.2, 0);
+    expect(metersBetween({ lat: 40, lon: -80 }, { lat: 40, lon: -80 })).toBe(0);
+  });
+
+  it('says under a tenth of a mile in feet, to ten, and more in miles, to one decimal', () => {
+    expect(distanceWords(0)).toBe('0 ft');
+    expect(distanceWords(18.3)).toBe('60 ft');
+    expect(distanceWords(160)).toBe('520 ft');
+    expect(distanceWords(161)).toBe('0.1 mi');
+    expect(distanceWords(1609.344 * 1.26)).toBe('1.3 mi');
+    expect(distanceWords(1609.344 * 12)).toBe('12.0 mi');
+  });
+});
diff --git a/src/web/client/distance.ts b/src/web/client/distance.ts
new file mode 100644
index 0000000000000000000000000000000000000000..04fb387ead431af96abd2a96be6dc81ce45fc546
--- /dev/null
+++ b/src/web/client/distance.ts
@@ -0,0 +1,19 @@
+import { metresBetween } from '@pine/wayspot-core/distance';
+import { distanceWords } from '../../render/distance-words.js';
+
+/**
+ * Distances on the live map (plan 8M-7), for the list and the plans after it: measured by the
+ * one function the rest of Pine measures with (`metresBetween` of `@pine/wayspot-core`: the
+ * place search, Wayfarer matching), said in miles and feet (Matt: the members are American).
+ */
+
+export interface Place {
+  lat: number;
+  lon: number;
+}
+
+/** How far apart two places are, in meters: the shared function itself, never a copy. */
+export const metersBetween: (a: Place, b: Place) => number = metresBetween;
+
+/** A distance in words: `distanceWords` of `src/render/`, shared once both sides take one rule. */
+export { distanceWords };
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index bacac11a16eac8303d2dfb4c5c64b67732e08cb0..2912d236038d57ae0f0f5acfcaed289dc5ee94d5 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -7,6 +7,8 @@ import { GYM_DOT, gymClicks, showParties } from './party-layer.js';
 import { gymPopup, regionLabel, renderNode, type MapGym } from './popup.js';
 import { heldContent } from './raid-forms.js';
 import { onThemeChange, theme } from './theme.js';
+import { BOUNDS_VISCOSITY, placeTheMap } from './view-ui.js';
+import { showWhereYouAre, type You } from './you-ui.js';
 
 /**
  * The map page (spec 3.1), bundled by `scripts/web/build.ts`: Leaflet with the tiles of
@@ -39,6 +41,7 @@ const gymExtras: {
 async function showGeo(
   map: L.Map,
   guild: string,
+  you: You,
 ): Promise<{
   gyms: Map<number, MapGym>;
   names: Map<number, string>;
@@ -84,9 +87,8 @@ async function showGeo(
     for (const outline of outlines) outline.setStyle({ color: colours.region });
     for (const { dot } of dots) dot.setStyle({ color: colours.gym });
   });
-  const all = regions.getBounds().isValid() ? regions.getBounds() : gyms.getBounds();
-  if (all.isValid()) map.fitBounds(all);
-  else say('This server has no regions yet.');
+  // Where the map starts, and how far it may go (plan 8M-7).
+  placeTheMap(map, guild, view.regions, gyms.getBounds(), you, say);
 
   const labels = (): void => {
     map.getContainer().classList.toggle('labels-hidden', map.getZoom() < LABEL_ZOOM);
@@ -119,7 +121,7 @@ async function showGeo(
 function start(): void {
   const data = document.body.dataset;
   const guild = data.guild ?? '';
-  const map = L.map(byId('map'), { center: [40.44, -79.99], zoom: 11 });
+  const map = L.map(byId('map'), { maxBoundsViscosity: BOUNDS_VISCOSITY });
   addTiles(map, tileSetting(data.tiles), data.googleKey);
   const notice = loginNotice(location.search);
   if (notice) {
@@ -127,7 +129,8 @@ function start(): void {
     history.replaceState(null, '', `${location.pathname}${notice.search}${location.hash}`);
   }
   const account = showAccount(guild, data.login === 'discord' ? 'discord' : 'links', 'map');
-  showGeo(map, guild)
+  const you = showWhereYouAre(map, say);
+  showGeo(map, guild, you)
     .then(async ({ gyms, names, regions }) => {
       // The parties of the server for a member who is logged in (plan 8M-3); while Discord
       // cannot be reached the server says whether it still knows them as a member. A member
@@ -141,7 +144,11 @@ function start(): void {
       gymExtras.of = (gym) => raids.gymControls(gym);
       gymExtras.clicked = (gym) => raids.gymClicked(gym);
     })
-    .catch(() => say('The map could not be loaded. Try again in a moment.'));
+    .catch(() => {
+      // Leaflet draws nothing until the map has a view.
+      if (!map.getZoom()) map.setView([40.44, -79.99], 11);
+      say('The map could not be loaded. Try again in a moment.');
+    });
 }
 
 start();
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 803d98a29e4c9ff27f4d50e55b4ba7cd64f1c631..8225a2190874a521e4e024fb6456a7aada2930dd 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -234,6 +234,26 @@ a {
   color: var(--muted);
 }
 
+/* "Show where I am" (plan 8M-7): a round button with a crosshair. */
+.locate-control .locate {
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  width: 40px;
+  height: 40px;
+  padding: 0;
+  border: 0;
+  border-radius: 50%;
+  background: var(--panel-bg);
+  color: var(--text);
+  box-shadow: 0 2px 6px var(--shadow);
+  cursor: pointer;
+}
+
+.locate-control .locate:hover {
+  background: var(--deep-bg);
+}
+
 .leaflet-popup-content-wrapper {
   background: var(--card-bg);
   color: var(--text);
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index a19f3f2b71489070c7d93b4e8d5c3945eea8cd49..fbbc8d4620ec3e53f8dab131cdf3ed7c15f8d069 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -71,6 +71,8 @@
   --train: #d35400;
   --meetup: #8e44ad;
   --stop: #2980b9;
+  --you: #1a73e8;
+  --you-edge: #ffffff;
 
   /* The region editor's panel. */
   --tool-bg: #e3e5e8;
@@ -163,6 +165,8 @@
     --train: #e67e22;
     --meetup: #b065d0;
     --stop: #5b9cf6;
+    --you: #4c8bf5;
+    --you-edge: #ffffff;
 
     --tool-bg: #4e5058;
     --warning: #f0b232;
diff --git a/src/web/client/theme.ts b/src/web/client/theme.ts
index d3d0e304c2aeec141e7fe265191b81c0d5445036..fdd65c1fa35115447751bc9d58456f39142a2e11 100644
--- a/src/web/client/theme.ts
+++ b/src/web/client/theme.ts
@@ -22,6 +22,9 @@ export const DRAWN_COLOURS = {
   meetup: '--meetup',
   /** The PokéStops shown while a meetup's place is picked. */
   stop: '--stop',
+  /** Your location (plan 8M-7): the blue dot and its accuracy, and the dot's edge. */
+  you: '--you',
+  youEdge: '--you-edge',
   /** The region editor: other servers' outlines. */
   others: '--others',
   /** The region editor: an outline that cannot be saved. */
diff --git a/src/web/client/view-ui.ts b/src/web/client/view-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..796a111739c19614c06e1356837e71f2adb6774c
--- /dev/null
+++ b/src/web/client/view-ui.ts
@@ -0,0 +1,96 @@
+import * as L from 'leaflet';
+import type { GeoView } from '../../domain/web/geo-data.js';
+import {
+  readLastView,
+  regionOf,
+  startView,
+  MemberMoves,
+  writeLastView,
+  zoomLimits,
+  type Box,
+  type StartFacts,
+  type StartView,
+  type ViewStorage,
+} from './view.js';
+import type { You } from './you-ui.js';
+
+/**
+ * Leaflet's side of the map's view (plan 8M-7, `view.ts`): the zoom and pan limits of the
+ * server's regions (again when the map is resized), the start view, the last view kept as the
+ * map rests, and your location as the first rule once the browser, having granted it before,
+ * gives it (unless the member moved the map meanwhile).
+ */
+
+/** How strongly the map resists being panned past its bounds (Leaflet: 0 none, 1 a wall). */
+export const BOUNDS_VISCOSITY = 0.8;
+
+const bounds = (box: Box): L.LatLngBounds =>
+  L.latLngBounds([box.south, box.west], [box.north, box.east]);
+
+/** The browser's `localStorage`, or none where reading it throws (some private modes). */
+export function browserStorage(): ViewStorage | undefined {
+  try {
+    return window.localStorage;
+  } catch {
+    return undefined;
+  }
+}
+
+/**
+ * Puts the map where it starts and keeps it within the server's regions. `gymsBox`: where the
+ * whole server is when it has gyms but no region yet.
+ */
+export function placeTheMap(
+  map: L.Map,
+  guild: string,
+  regions: GeoView['regions'],
+  gymsBox: L.LatLngBounds | undefined,
+  you: You,
+  say: (text: string) => void,
+): void {
+  const storage = browserStorage();
+  const limit = (): void => {
+    const size = map.getSize();
+    const limits = zoomLimits(regions, { width: size.x, height: size.y });
+    if (!limits) return;
+    map.setMinZoom(limits.minZoom);
+    map.setMaxBounds(bounds(limits.maxBounds));
+  };
+  limit();
+  map.on('resize', limit);
+
+  const facts: StartFacts = {
+    region: regionOf(location.search),
+    last: readLastView(storage, guild),
+    regions,
+  };
+  // `/maps`' region is used once: a reload opens where the member left the map.
+  if (facts.region !== undefined) {
+    const query = new URLSearchParams(location.search);
+    query.delete('region');
+    const rest = query.toString();
+    history.replaceState(null, '', `${location.pathname}${rest === '' ? '' : `?${rest}`}`);
+  }
+  const apply = (view: StartView): void => {
+    if (view.kind === 'point') map.setView([view.center.lat, view.center.lon], view.zoom);
+    else if (view.kind === 'fit') map.fitBounds(bounds(view.box));
+    else if (gymsBox?.isValid()) map.fitBounds(gymsBox);
+    else {
+      map.setView([40.44, -79.99], 11);
+      say('This server has no regions yet.');
+    }
+  };
+  const moves = new MemberMoves();
+  map.on('movestart zoomstart', () => {
+    moves.seen();
+  });
+  apply(startView(facts));
+  moves.begin();
+  map.on('moveend', () => {
+    const center = map.getCenter();
+    writeLastView(storage, guild, { lat: center.lat, lon: center.lng, zoom: map.getZoom() });
+  });
+  void you.startIfGranted().then((located) => {
+    if (located && !moves.moved) apply(startView({ ...facts, located }));
+  });
+}
diff --git a/src/web/client/view.test.ts b/src/web/client/view.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..416b6039773c91f849182f4a3a19984c00ed020e
--- /dev/null
+++ b/src/web/client/view.test.ts
@@ -0,0 +1,184 @@
+import { describe, expect, it } from 'vitest';
+import type { GeoView } from '../../domain/web/geo-data.js';
+import {
+  fitZoom,
+  MemberMoves,
+  paddedBox,
+  readLastView,
+  regionOf,
+  regionsBox,
+  startView,
+  STREET_ZOOM,
+  writeLastView,
+  zoomLimits,
+  type ViewStorage,
+} from './view.js';
+
+/** Two regions side by side: West 40.0–40.1 N, 80.2–80.1 W; East 40.0–40.2 N, 80.1–79.9 W. */
+const REGIONS: GeoView['regions'] = [
+  {
+    id: 1,
+    name: 'west',
+    outline: [
+      [40, -80.2],
+      [40.1, -80.2],
+      [40.1, -80.1],
+      [40, -80.1],
+      [40, -80.2],
+    ],
+  },
+  {
+    id: 2,
+    name: 'east',
+    outline: [
+      [40, -80.1],
+      [40.2, -80.1],
+      [40.2, -79.9],
+      [40, -79.9],
+      [40, -80.1],
+    ],
+  },
+];
+
+const ALL = { south: 40, west: -80.2, north: 40.2, east: -79.9 };
+
+/** A storage of the test's, which may refuse as a browser's does (private mode, full). */
+function storage(refuses = false): ViewStorage & { items: Map<string, string> } {
+  const items = new Map<string, string>();
+  return {
+    items,
+    getItem: (key) => {
+      if (refuses) throw new Error('SecurityError');
+      return items.get(key) ?? null;
+    },
+    setItem: (key, value) => {
+      if (refuses) throw new Error('QuotaExceededError');
+      items.set(key, value);
+    },
+  };
+}
+
+describe("the server's box and its limits (plan 8M-7)", () => {
+  it('is the box of every region, grown by a quarter of its size each way', () => {
+    expect(regionsBox(REGIONS)).toEqual(ALL);
+    expect(regionsBox([])).toBeUndefined();
+    const grown = paddedBox(ALL, 0.25);
+    expect(grown.south).toBeCloseTo(39.95, 9);
+    expect(grown.north).toBeCloseTo(40.25, 9);
+    expect(grown.west).toBeCloseTo(-80.275, 9);
+    expect(grown.east).toBeCloseTo(-79.825, 9);
+  });
+
+  it('fits a box at the greatest whole zoom at which it shows whole', () => {
+    // A 1,024th of the world's width in 256 pixels: zoom 10, by its width.
+    expect(fitZoom({ south: 0, north: 0.0001, west: 0, east: 360 / 1024 }, 256, 256)).toBe(10);
+    // Half as many pixels: one zoom less.
+    expect(fitZoom({ south: 0, north: 0.0001, west: 0, east: 360 / 1024 }, 128, 256)).toBe(9);
+    // A tall box is fitted by its height.
+    expect(fitZoom({ south: -10, north: 10, west: 0, east: 0.0001 }, 1_000, 256)).toBe(
+      Math.floor(fitZoom({ south: -10, north: 10, west: 0, east: 0.0001 }, 1_000, 256)),
+    );
+    expect(fitZoom({ south: -10, north: 10, west: 0, east: 0.0001 }, 1_000, 256)).toBeLessThan(
+      fitZoom({ south: -10, north: 10, west: 0, east: 0.0001 }, 1_000, 512),
+    );
+  });
+
+  it('never lets the map out past the zoom of all regions, nor far beyond them', () => {
+    const limits = zoomLimits(REGIONS, { width: 800, height: 600 });
+    expect(limits?.minZoom).toBe(fitZoom(ALL, 800, 600));
+    expect(limits?.minZoom).toBe(11);
+    expect(limits?.maxBounds).toEqual(paddedBox(ALL, 0.25));
+    // A server without regions has no limits.
+    expect(zoomLimits([], { width: 800, height: 600 })).toBeUndefined();
+  });
+});
+
+describe('the start view (plan 8M-7)', () => {
+  const here = { lat: 40.05, lon: -80.15 };
+
+  it('is where you are, at street level, when the browser shares it already', () => {
+    expect(
+      startView({
+        located: here,
+        region: 2,
+        last: { lat: 40.1, lon: -80, zoom: 13 },
+        regions: REGIONS,
+      }),
+    ).toEqual({ kind: 'point', center: here, zoom: STREET_ZOOM });
+  });
+
+  it("is the region /maps named next, at street level at its box's middle", () => {
+    expect(
+      startView({ region: 2, last: { lat: 40.1, lon: -80, zoom: 13 }, regions: REGIONS }),
+    ).toEqual({ kind: 'point', center: { lat: 40.1, lon: -80 }, zoom: STREET_ZOOM });
+  });
+
+  it('is where you last left the map next, at its own zoom', () => {
+    const last = { lat: 40.12, lon: -80.01, zoom: 13 };
+    expect(startView({ region: 99, last, regions: REGIONS })).toEqual({
+      kind: 'point',
+      center: { lat: 40.12, lon: -80.01 },
+      zoom: 13,
+    });
+  });
+
+  it('is the whole server last, and skips a place far beyond its regions', () => {
+    const far = { lat: 51.5, lon: -0.12 };
+    expect(startView({ located: far, last: { ...far, zoom: 15 }, regions: REGIONS })).toEqual({
+      kind: 'fit',
+      box: ALL,
+    });
+    expect(startView({ regions: [] })).toEqual({ kind: 'none' });
+    // Without regions any place will do: nothing limits the map.
+    expect(startView({ located: far, regions: [] })).toEqual({
+      kind: 'point',
+      center: far,
+      zoom: STREET_ZOOM,
+    });
+  });
+
+  it('reads the region /maps named from the address', () => {
+    expect(regionOf('?region=12')).toBe(12);
+    expect(regionOf('?login=expired&region=3')).toBe(3);
+    expect(regionOf('')).toBeUndefined();
+    expect(regionOf('?region=x')).toBeUndefined();
+    expect(regionOf('?region=-1')).toBeUndefined();
+  });
+});
+
+describe('the last view (plan 8M-7)', () => {
+  it('is kept per server in the browser, and read back', () => {
+    const kept = storage();
+    writeLastView(kept, '412345678901234567', { lat: 40.1, lon: -80, zoom: 14 });
+    expect(readLastView(kept, '412345678901234567')).toEqual({ lat: 40.1, lon: -80, zoom: 14 });
+    expect(readLastView(kept, '412345678901234999')).toBeUndefined();
+  });
+
+  it('is none where the browser keeps nothing or kept something else', () => {
+    const refusing = storage(true);
+    expect(() => {
+      writeLastView(refusing, '1', { lat: 1, lon: 2, zoom: 3 });
+    }).not.toThrow();
+    expect(readLastView(refusing, '1')).toBeUndefined();
+    const odd = storage();
+    odd.items.set('pine-map-view:1', '{"lat":"x"}');
+    expect(readLastView(odd, '1')).toBeUndefined();
+    odd.items.set('pine-map-view:1', 'not json');
+    expect(readLastView(odd, '1')).toBeUndefined();
+    expect(readLastView(undefined, '1')).toBeUndefined();
+  });
+});
+
+describe('whether the member moved the map (plan 8M-7)', () => {
+  it('counts any move or zoom once the start view is set, not the start view itself', () => {
+    const moves = new MemberMoves();
+    // The start view's own move.
+    moves.seen();
+    expect(moves.moved).toBe(false);
+    moves.begin();
+    expect(moves.moved).toBe(false);
+    // A drag, a zoom, a tap on a line of the list that flies the map: the location waits.
+    moves.seen();
+    expect(moves.moved).toBe(true);
+  });
+});
diff --git a/src/web/client/view.ts b/src/web/client/view.ts
new file mode 100644
index 0000000000000000000000000000000000000000..69f5b100ed0d1786af5124131309e43baa4bf6be
--- /dev/null
+++ b/src/web/client/view.ts
@@ -0,0 +1,211 @@
+import type { GeoView } from '../../domain/web/geo-data.js';
+
+/**
+ * Where the map opens and how far it may go (plan 8M-7), as pure functions of what the page
+ * knows: the server's regions, your location when the browser shares it already, the region
+ * `/maps` named (`?region=<id>`), and where you last left the map (kept per server in the
+ * browser). The map never zooms out past the zoom that shows every region of the server, and
+ * panning stops a quarter of their size beyond them; a server without regions has no limits.
+ */
+
+/** A box of the map, in degrees. */
+export interface Box {
+  south: number;
+  west: number;
+  north: number;
+  east: number;
+}
+
+export interface LatLon {
+  lat: number;
+  lon: number;
+}
+
+/** Where the map was left: its middle and zoom. */
+export interface LastView extends LatLon {
+  zoom: number;
+}
+
+/** The zoom the map opens at on a place: street level. */
+export const STREET_ZOOM = 15;
+/** How far beyond the regions panning goes, as a share of their size each way. */
+export const PAN_MARGIN = 0.25;
+/** The size of a tile, in pixels. */
+const TILE = 256;
+
+/** The box of every region's outline; undefined for none. */
+export function regionsBox(regions: GeoView['regions']): Box | undefined {
+  const points = regions.flatMap((region) => region.outline);
+  if (points.length === 0) return undefined;
+  const lats = points.map(([lat]) => lat);
+  const lons = points.map(([, lon]) => lon);
+  return {
+    south: Math.min(...lats),
+    west: Math.min(...lons),
+    north: Math.max(...lats),
+    east: Math.max(...lons),
+  };
+}
+
+/** A box grown by `share` of its height and width each way. */
+export function paddedBox(box: Box, share: number): Box {
+  const height = (box.north - box.south) * share;
+  const width = (box.east - box.west) * share;
+  return {
+    south: box.south - height,
+    west: box.west - width,
+    north: box.north + height,
+    east: box.east + width,
+  };
+}
+
+/** Whether a place lies in a box. */
+export function inBox(box: Box, place: LatLon): boolean {
+  return (
+    place.lat >= box.south &&
+    place.lat <= box.north &&
+    place.lon >= box.west &&
+    place.lon <= box.east
+  );
+}
+
+/** The middle of a box. */
+export function middleOf(box: Box): LatLon {
+  return { lat: (box.south + box.north) / 2, lon: (box.west + box.east) / 2 };
+}
+
+/** Where a latitude lies down the world's square of Web Mercator, from 0 (north) to 1. */
+function mercatorY(lat: number): number {
+  const sin = Math.sin((lat * Math.PI) / 180);
+  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
+}
+
+/**
+ * The greatest whole zoom at which a box shows whole in `width` by `height` pixels (Web
+ * Mercator, tiles of 256 pixels), as Leaflet's `getBoundsZoom` without padding.
+ */
+export function fitZoom(box: Box, width: number, height: number): number {
+  const across = (box.east - box.west) / 360;
+  const down = mercatorY(box.south) - mercatorY(box.north);
+  const byWidth = across > 0 ? Math.log2(width / (TILE * across)) : Infinity;
+  const byHeight = down > 0 ? Math.log2(height / (TILE * down)) : Infinity;
+  const zoom = Math.floor(Math.min(byWidth, byHeight));
+  return Number.isFinite(zoom) ? Math.max(0, zoom) : 0;
+}
+
+/**
+ * How far the map may go for a server: never out past the zoom that fits all its regions in the
+ * map's size (worked out again when the map is resized), never panned more than a quarter of
+ * their size beyond them. Undefined for a server without regions: no limits.
+ */
+export function zoomLimits(
+  regions: GeoView['regions'],
+  size: { width: number; height: number },
+): { minZoom: number; maxBounds: Box } | undefined {
+  const box = regionsBox(regions);
+  if (!box) return undefined;
+  return { minZoom: fitZoom(box, size.width, size.height), maxBounds: paddedBox(box, PAN_MARGIN) };
+}
+
+/** What the page knows as it opens. */
+export interface StartFacts {
+  /** Your location, when the browser had granted it already (never asked for on load). */
+  located?: LatLon;
+  /** The region `/maps` named (`?region=<id>`). */
+  region?: number;
+  /** Where you last left the map of this server. */
+  last?: LastView;
+  regions: GeoView['regions'];
+}
+
+export type StartView =
+  { kind: 'point'; center: LatLon; zoom: number } | { kind: 'fit'; box: Box } | { kind: 'none' };
+
+/**
+ * Where the map opens, the first that applies: (1) your location, at street level; (2) the region
+ * `/maps` named, at street level at the middle of its box (an explicit `/maps` wins over the
+ * last view); (3) where you last left it, at its own zoom; (4) the whole server. A location or
+ * last view beyond the regions and their margin (where panning cannot go) is passed over.
+ */
+export function startView(facts: StartFacts): StartView {
+  const all = regionsBox(facts.regions);
+  const reachable = (place: LatLon): boolean =>
+    all === undefined || inBox(paddedBox(all, PAN_MARGIN), place);
+  if (facts.located && reachable(facts.located)) {
+    return { kind: 'point', center: facts.located, zoom: STREET_ZOOM };
+  }
+  const named = facts.regions.find((region) => region.id === facts.region);
+  const box = named ? regionsBox([named]) : undefined;
+  if (box) return { kind: 'point', center: middleOf(box), zoom: STREET_ZOOM };
+  if (facts.last && reachable(facts.last)) {
+    const { lat, lon, zoom } = facts.last;
+    return { kind: 'point', center: { lat, lon }, zoom };
+  }
+  return all ? { kind: 'fit', box: all } : { kind: 'none' };
+}
+
+/**
+ * Whether the member moved the map since it was placed (plan 8M-7): any move or zoom once the
+ * start view is set (`begin`) counts, a drag, the zoom buttons, a tap on a line of the list that
+ * flies the map; then a location that comes late does not take the map away.
+ */
+export class MemberMoves {
+  moved = false;
+  private started = false;
+
+  /** The start view is set: what moves the map from now on is the member's. */
+  begin(): void {
+    this.started = true;
+  }
+
+  /** The map started to move or zoom. */
+  seen(): void {
+    if (this.started) this.moved = true;
+  }
+}
+
+/** The region `/maps` named in the page's address (`?region=<id>`), if any. */
+export function regionOf(search: string): number | undefined {
+  const value = new URLSearchParams(search).get('region') ?? '';
+  return /^\d{1,10}$/u.test(value) ? Number(value) : undefined;
+}
+
+/** What the page needs of the browser's `localStorage`, which may refuse (private mode, full). */
+export interface ViewStorage {
+  getItem(key: string): string | null;
+  setItem(key: string, value: string): void;
+}
+
+const viewKey = (guild: string): string => `pine-map-view:${guild}`;
+
+const isNumber = (value: unknown): value is number =>
+  typeof value === 'number' && Number.isFinite(value);
+
+/** Where the map of a server was last left in this browser; none when nothing (good) is kept. */
+export function readLastView(
+  storage: ViewStorage | undefined,
+  guild: string,
+): LastView | undefined {
+  try {
+    const kept = JSON.parse(storage?.getItem(viewKey(guild)) ?? 'null') as Partial<LastView> | null;
+    if (!kept || !isNumber(kept.lat) || !isNumber(kept.lon) || !isNumber(kept.zoom)) {
+      return undefined;
+    }
+    return { lat: kept.lat, lon: kept.lon, zoom: kept.zoom };
+  } catch {
+    return undefined;
+  }
+}
+
+/** Keeps where the map of a server is left; a browser that keeps nothing is left alone. */
+export function writeLastView(
+  storage: ViewStorage | undefined,
+  guild: string,
+  view: LastView,
+): void {
+  try {
+    storage?.setItem(viewKey(guild), JSON.stringify(view));
+  } catch {
+    // Private mode or a full storage: the next visit opens on the server's own start.
+  }
+}
diff --git a/src/web/client/you-ui.ts b/src/web/client/you-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..afb099751017deee5bf72f51db80f37657606351
--- /dev/null
+++ b/src/web/client/you-ui.ts
@@ -0,0 +1,155 @@
+import * as L from 'leaflet';
+import { onThemeChange, theme } from './theme.js';
+import type { LatLon } from './view.js';
+import { STREET_ZOOM } from './view.js';
+import { alreadyGranted, locationRefusal, type PermissionsLike } from './your-location.js';
+
+/**
+ * "Show where I am" on the live map (plan 8M-7): a button with a crosshair (bottom right, under
+ * the zoom buttons' side) that asks the browser for the location only when pressed, then draws a
+ * blue dot with a circle of its accuracy, centers the map on it and keeps it current
+ * (`watchPosition`) while the page is open. Once the browser granted it, later visits show it
+ * without asking (`startIfGranted`, which never asks). Refused or unavailable: one line under the
+ * header (`say`), nothing else. Browsers share a location with https pages and with
+ * `http://localhost`.
+ */
+
+const SVG = 'http://www.w3.org/2000/svg';
+
+/** The crosshair, as SVG of ours drawn in the button's own color (`currentColor`). */
+function crosshair(): SVGSVGElement {
+  const svg = document.createElementNS(SVG, 'svg');
+  svg.setAttribute('viewBox', '0 0 24 24');
+  svg.setAttribute('width', '20');
+  svg.setAttribute('height', '20');
+  svg.setAttribute('aria-hidden', 'true');
+  const add = (tag: string, attributes: Record<string, string>): void => {
+    const shape = document.createElementNS(SVG, tag);
+    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
+    shape.setAttribute('fill', 'none');
+    shape.setAttribute('stroke', 'currentColor');
+    shape.setAttribute('stroke-width', '2');
+    svg.append(shape);
+  };
+  add('circle', { cx: '12', cy: '12', r: '7' });
+  add('circle', { cx: '12', cy: '12', r: '2' });
+  for (const d of ['M12 1v4', 'M12 19v4', 'M1 12h4', 'M19 12h4']) add('path', { d });
+  return svg;
+}
+
+/** What the rest of the page asks of your location. */
+export interface You {
+  /** Where you are, once the browser said. */
+  located(): LatLon | undefined;
+  /** Starts showing it without asking, where the browser granted it already; the first fix. */
+  startIfGranted(): Promise<LatLon | undefined>;
+  /** Tells `listener` each new fix (the list's distances follow). */
+  onMove(listener: (place: LatLon) => void): void;
+}
+
+export function showWhereYouAre(map: L.Map, say: (text: string) => void): You {
+  let place: LatLon | undefined;
+  let watching: number | undefined;
+  /** The press that asked: the map is centered on the fix that answers it. */
+  let centerNext = false;
+  let firstFix: ((place: LatLon | undefined) => void) | undefined;
+  const listeners: Array<(place: LatLon) => void> = [];
+  const accuracy = L.circle([0, 0], {
+    radius: 1,
+    weight: 1,
+    fillOpacity: 0.12,
+    interactive: false,
+  });
+  const dot = L.circleMarker([0, 0], {
+    radius: 7,
+    weight: 3,
+    fillOpacity: 1,
+    interactive: false,
+  });
+  const paint = (): void => {
+    const { you, youEdge } = theme().colours;
+    accuracy.setStyle({ color: you, fillColor: you });
+    dot.setStyle({ color: youEdge, fillColor: you });
+  };
+  paint();
+  onThemeChange(paint);
+
+  const fixed = (position: GeolocationPosition): void => {
+    place = { lat: position.coords.latitude, lon: position.coords.longitude };
+    const at = L.latLng(place.lat, place.lon);
+    accuracy.setLatLng(at).setRadius(position.coords.accuracy);
+    dot.setLatLng(at);
+    if (!map.hasLayer(dot)) {
+      accuracy.addTo(map);
+      dot.addTo(map);
+    }
+    if (centerNext) {
+      centerNext = false;
+      map.setView(at, Math.max(map.getZoom(), STREET_ZOOM));
+    }
+    firstFix?.(place);
+    firstFix = undefined;
+    for (const listener of listeners) listener(place);
+  };
+  const failed = (error: GeolocationPositionError): void => {
+    centerNext = false;
+    firstFix?.(undefined);
+    firstFix = undefined;
+    say(locationRefusal(error.code));
+    if (error.code === 1 && watching !== undefined) {
+      navigator.geolocation.clearWatch(watching);
+      watching = undefined;
+    }
+  };
+  const watch = (): boolean => {
+    if (!('geolocation' in navigator) || !window.isSecureContext) {
+      say(locationRefusal('unsupported'));
+      return false;
+    }
+    watching ??= navigator.geolocation.watchPosition(fixed, failed, {
+      enableHighAccuracy: true,
+      maximumAge: 30_000,
+      timeout: 30_000,
+    });
+    return true;
+  };
+
+  const button = document.createElement('button');
+  button.type = 'button';
+  button.className = 'locate';
+  button.title = 'Show where I am';
+  button.setAttribute('aria-label', 'Show where I am');
+  button.append(crosshair());
+  L.DomEvent.disableClickPropagation(button);
+  button.addEventListener('click', () => {
+    if (place) {
+      map.setView([place.lat, place.lon], Math.max(map.getZoom(), STREET_ZOOM));
+      return;
+    }
+    centerNext = true;
+    if (!watch()) centerNext = false;
+  });
+  const control = new L.Control({ position: 'bottomright' });
+  control.onAdd = () => {
+    const box = document.createElement('div');
+    box.className = 'leaflet-control locate-control';
+    box.append(button);
+    return box;
+  };
+  control.addTo(map);
+
+  return {
+    located: () => place,
+    async startIfGranted() {
+      const permissions = (navigator as { permissions?: PermissionsLike }).permissions;
+      if (!(await alreadyGranted(permissions))) return undefined;
+      return new Promise((resolve) => {
+        firstFix = resolve;
+        if (!watch()) resolve(undefined);
+      });
+    },
+    onMove(listener) {
+      listeners.push(listener);
+    },
+  };
+}
diff --git a/src/web/client/your-location.test.ts b/src/web/client/your-location.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e8ed121d63c77cb61870c3672fde78e9fd4b7634
--- /dev/null
+++ b/src/web/client/your-location.test.ts
@@ -0,0 +1,35 @@
+import { describe, expect, it } from 'vitest';
+import { alreadyGranted, LOCATION_DENIED, locationRefusal } from './your-location.js';
+
+describe('your location (plan 8M-7)', () => {
+  it('is shown on load only where the browser granted it already, never asked for', async () => {
+    const asked: string[] = [];
+    const permissions = (state: string) => ({
+      query: (descriptor: { name: string }) => {
+        asked.push(descriptor.name);
+        return Promise.resolve({ state });
+      },
+    });
+    expect(await alreadyGranted(permissions('granted'))).toBe(true);
+    expect(await alreadyGranted(permissions('prompt'))).toBe(false);
+    expect(await alreadyGranted(permissions('denied'))).toBe(false);
+    expect(asked).toEqual(['geolocation', 'geolocation', 'geolocation']);
+    // A browser that cannot say: as if not granted.
+    expect(await alreadyGranted(undefined)).toBe(false);
+    expect(
+      await alreadyGranted({
+        query: () => Promise.reject(new TypeError('geolocation is not a permission here')),
+      }),
+    ).toBe(false);
+  });
+
+  it('says in one line why it is not shown', () => {
+    expect(locationRefusal(1)).toBe(LOCATION_DENIED);
+    expect(LOCATION_DENIED).toBe('Your browser did not share your location.');
+    expect(locationRefusal(2)).toBe('Your location is not available just now.');
+    expect(locationRefusal(3)).toBe('Your location is not available just now.');
+    expect(locationRefusal('unsupported')).toBe(
+      'This browser cannot share your location with this page.',
+    );
+  });
+});
diff --git a/src/web/client/your-location.ts b/src/web/client/your-location.ts
new file mode 100644
index 0000000000000000000000000000000000000000..07fcd8c7b4c8115aac1922a3ca63c531c156dacf
--- /dev/null
+++ b/src/web/client/your-location.ts
@@ -0,0 +1,37 @@
+/**
+ * Your location on the live map (plan 8M-7), the parts that need no Leaflet: whether the browser
+ * granted it already (asked of `navigator.permissions`, which never asks the member: the page
+ * never asks for the location on load), and the one line said when it is refused or unavailable.
+ * The button "Show where I am", the blue dot and `watchPosition` are `you-ui.ts`.
+ */
+
+/** What the page needs of `navigator.permissions`. */
+export interface PermissionsLike {
+  query(descriptor: { name: 'geolocation' }): Promise<{ state: string }>;
+}
+
+/**
+ * Whether the browser granted this page the location already, so that it is shown without
+ * asking; false where it cannot say.
+ */
+export async function alreadyGranted(permissions: PermissionsLike | undefined): Promise<boolean> {
+  if (!permissions) return false;
+  try {
+    return (await permissions.query({ name: 'geolocation' })).state === 'granted';
+  } catch {
+    return false;
+  }
+}
+
+/** Said when the member refused to share the location. */
+export const LOCATION_DENIED = 'Your browser did not share your location.';
+
+/**
+ * Why the location is not shown, in one line: refused (`GeolocationPositionError` code 1),
+ * unavailable or too slow (2, 3), or a browser or page that cannot share it (no geolocation, or
+ * plain http on another machine than this one).
+ */
+export function locationRefusal(code: number | 'unsupported'): string {
+  if (code === 'unsupported') return 'This browser cannot share your location with this page.';
+  return code === 1 ? LOCATION_DENIED : 'Your location is not available just now.';
+}
diff --git a/src/web/login-links.test.ts b/src/web/login-links.test.ts
index 3dfacc0a1e4c5318962b33899abedbcce03fa0ec..8444c77b3d1f1e8789341f8fcf943e2b7cd83c7d 100644
--- a/src/web/login-links.test.ts
+++ b/src/web/login-links.test.ts
@@ -26,6 +26,20 @@ describe('LoginLinks', () => {
     expect(links.redeem(token, 1_000)?.page).toBe('regions/edit');
   });
 
+  it('keeps the region of the channel /maps was used in, for the map to open on (plan 8M-7)', () => {
+    const links = new LoginLinks();
+    const token = links.issue(GUILD, ASH, 'Ash', 0, 'map', 12);
+    expect(links.peek(token, 1_000)).toEqual({
+      guildId: GUILD,
+      userId: ASH,
+      userName: 'Ash',
+      page: 'map',
+      region: 12,
+    });
+    expect(links.redeem(token, 1_000)?.region).toBe(12);
+    expect(links.peek(links.issue(GUILD, ASH, 'Ash', 0), 1_000)).not.toHaveProperty('region');
+  });
+
   it('says whom a link logs in without using it up', () => {
     const links = new LoginLinks();
     const token = links.issue(GUILD, ASH, 'Ash', 0);
diff --git a/src/web/login-links.ts b/src/web/login-links.ts
index 69ee6f9d94e907db4ad12ed2ff9d69a855f84910..1069eaa4cadc8de93a9778845e5ec38d0a42f231 100644
--- a/src/web/login-links.ts
+++ b/src/web/login-links.ts
@@ -15,6 +15,17 @@ export interface LinkHolder {
   userId: string;
   userName: string;
   page: LinkPage;
+  /**
+   * The region of the channel `/maps` was used in (plan 8M-7): the map opens on it
+   * (`?region=<id>`). Absent elsewhere and for the region editor.
+   */
+  region?: number;
+}
+
+/** Whom a link logs in, as kept, without its expiry. */
+function holderOf(link: LinkHolder): LinkHolder {
+  const { guildId, userId, userName, page, region } = link;
+  return { guildId, userId, userName, page, ...(region === undefined ? {} : { region }) };
 }
 
 /**
@@ -30,13 +41,17 @@ export class LoginLinks {
     this.links = new BoundedMap(max);
   }
 
-  /** A new link's token for a member of a server, issued at `now`, opening `page`. */
+  /**
+   * A new link's token for a member of a server, issued at `now`, opening `page` (the map on
+   * `region`, when `/maps` was used in a region's channel).
+   */
   issue(
     guildId: string,
     userId: string,
     userName: string,
     now: number,
     page: LinkPage = 'map',
+    region?: number,
   ): string {
     this.links.dropWhile((link) => link.expiresAt <= now);
     const token = randomToken();
@@ -45,6 +60,7 @@ export class LoginLinks {
       userId,
       userName,
       page,
+      ...(region === undefined ? {} : { region }),
       expiresAt: now + LINK_MS,
     });
     return token;
@@ -57,7 +73,7 @@ export class LoginLinks {
   peek(token: string, now: number): LinkHolder | undefined {
     const link = this.links.get(sessionHash(token));
     if (!link || link.expiresAt <= now) return undefined;
-    return { guildId: link.guildId, userId: link.userId, userName: link.userName, page: link.page };
+    return holderOf(link);
   }
 
   /** Whom a link logs in; undefined for one that is unknown, used or expired. Used up by this. */
@@ -67,6 +83,6 @@ export class LoginLinks {
     if (!link) return undefined;
     this.links.delete(hash);
     if (link.expiresAt <= now) return undefined;
-    return { guildId: link.guildId, userId: link.userId, userName: link.userName, page: link.page };
+    return holderOf(link);
   }
 }
diff --git a/src/web/login.test.ts b/src/web/login.test.ts
index e0714e6d2a0a252a069392773174b7b45be72544..d67d64218d915f354f704dd18a648f15fa867541 100644
--- a/src/web/login.test.ts
+++ b/src/web/login.test.ts
@@ -326,6 +326,16 @@ describe('login links', () => {
     expect(opened.headers.location).toBe(MAP);
   });
 
+  it('of /maps in a region open the map on that region, and the whole map once expired', async () => {
+    web = webServerWith({ members: new FakeMemberDirectory().add(ASH, 'Ash') });
+    const token = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now, 'map', 7);
+    const url = `/auth/link/${FAKE_GUILD_ID}/${token}`;
+    const first = await pressContinue(web, url);
+    expect(first.statusCode).toBe(303);
+    expect(first.headers.location).toBe(`${MAP}?region=7`);
+    expect((await pressContinue(web, url)).headers.location).toBe(`${MAP}?login=expired`);
+  });
+
   it('of a server the bot is not in are not found', async () => {
     web = webServerWith();
     const token = web.loginLinks.issue('412345678901234999', ASH, 'Ash', web.clock.now);
````

### Task 4: 8M-7 task 4: the map's layers, gyms clustered, stops and Power Spots in view

Prototype commit: `5d1e0beedb4fd6fd7dfb1e9c67ce66b63e8a02e8`

Everything drawn is a layer of a registry the page's parts register with: Raids,
Trains, Meetups and Region outlines on, Wild spawns, Gyms, PokéStops and Power
Spots off, the choice kept per browser. The desktop header has the live layers as
toggles and the others under "More"; a phone gets "Layers · n" and a bottom sheet
of switches. Gyms are drawn at every zoom and clustered below 16 by Pine's own
grid; PokéStops and Power Spots come from /api/stops and /api/powerspots from
zoom 16 for members, with "more than shown" in one quiet line. Wild spawns wait
for a route that lists them.

**Files:**

```
 docs/architecture/web.md                     |   4 ++-
 docs/superpowers/plans/phase-0-follow-ups.md |   4 +++
 src/web/client/cluster.test.ts               |  98 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/cluster.ts                    | 107 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/gym-dots.test.ts              |  87 ++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/gym-dots.ts                   |  80 ++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/gyms-ui.ts                    | 170 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/layer-registry.test.ts        | 187 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/layer-registry.ts             | 160 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/layers-ui.ts                  | 225 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/main.ts                       | 150 +++++++++++++++++++++++++++++++++++++++++++++++++++++----------------------------------------
 src/web/client/map.css                       | 237 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/party-layer.isolated.test.ts  |   3 ++
 src/web/client/party-layer.ts                |  51 ++++++++++++++++++++++++++++----
 src/web/client/places-ui.ts                  | 156 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/theme.css                     |   5 ++++
 src/web/page.test.ts                         |   2 ++
 src/web/page.ts                              |   1 +
 18 files changed, 1656 insertions(+), 71 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/cluster.test.ts src/web/client/gym-dots.test.ts src/web/client/layer-registry.test.ts src/web/client/party-layer.isolated.test.ts src/web/page.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 5d1e0beedb4fd6fd7dfb1e9c67ce66b63e8a02e8 -- src test scripts data docs/architecture docs/guides docs/web-setup.md docs/superpowers/plans/phase-0-follow-ups.md CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-7 task 4: the map's layers, gyms clustered, stops and Power Spots in view`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 4daefcbfea6c550fbdc08f8eb77f0f062050de3e..f839f92db24c8f545425e60f64c30d3f5e056a25 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -37,7 +37,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - `GET /s/<guild>/api/geo` is public: `geoView` (`src/domain/web/geo-view.ts`, pure; its types in `geo-data.ts`, which has no imports so the page can take them) gives the server's regions with an outline (named by their channels as the bot sees them, by their number where it sees none) and the gyms that lie in them (regions, address line, description, notice; places to six decimals; no elite raid gym mark, which Matt took out of everything members see, 2026-10-17: `isEliteGym` and the data stay). Gyms in no region of any server are left out. `GeoCache` (`src/web/geo-cache.ts`) keeps each server's JSON with a strong ETag (the SHA-256 of the JSON, cut) and builds it anew when `GymDirectory.generation` or `RegionDirectory.generation` changed (every load, gym re-read or forget) or a region's channel was renamed; an `If-None-Match` that names it is answered 304 (`etagMatches`: a list of tags compared weakly, `W/` ignored, or `*`), `Cache-Control: no-cache`.
 - The page `/s/<guild>/map` is a static template (`mapPage`, `src/web/page.ts`) that loads the bundle's script and style; what the page needs is in escaped `data-` attributes of `<body>` (`data-guild`, `data-tiles`, `data-google-key` only with Google's tiles, `data-login` `discord | links`). Without a built bundle it answers 503 saying `npm run web:build`.
 - The pages' code is `src/web/client/` with its own `tsconfig.json` (the DOM; the root config excludes the folder), bundled by `scripts/web/build.ts` (`npm run web:build`, also run by `npm run build`) with esbuild: IIFEs for ES2022, minified, into `dist/web/assets/` with hashed names: the map (`map-<hash>.js`, `map-<hash>.css` with Leaflet's CSS, Leaflet's pictures), the region editor (`editor-<hash>.js` with Geoman, `editor-<hash>.css` with Geoman's CSS, and its worker `editor-worker-<hash>.js`); `dist/web/assets.json` names each page's script and style and the worker (`AssetManifest`: `map`, `editor`; read at start by `readAssets`, which takes a manifest of an older build as none). What both pages share (the tiles with Google's layers, the header and its login, reading JSON) is `src/web/client/common.ts`. The rest of `dist/web/` is the compiled server code; the build empties only `assets/`. `/assets/` (`@fastify/static`) serves that one flat folder: no index, no listing, plain file names only; a hashed name `public, max-age=31536000, immutable`, anything else `no-cache`.
-- The page: Leaflet; the tiles of `data-tiles` (`addTiles`, `src/web/client/common.ts`, over `tileLayers`, `src/web/client/layers.ts`, plan 8M-7): Stadia's Alidade Smooth in light and Alidade Smooth Dark in dark (`https://tiles.stadiamaps.com/tiles/alidade_smooth{_dark}/{z}/{x}/{y}{r}.png`, credited "© Stadia Maps © OpenMapTiles © OpenStreetMap contributors" with links, `STADIA_ATTRIBUTION`), drawn anew in the other style when the device changes between light and dark; once Stadia refuses its tiles (three failed in a row with none loaded between, or the first two of the visit: a 401 on a domain it does not know, a 429 past the month's credits; the page cannot tell which, and a tile that loads starts the run again) OpenStreetMap's for the rest of the visit, once (`StadiaFallback`), drawn to zoom 20 with its own pictures enlarged past 19 (`maxNativeZoom`); the credit is the page's own, of the base shown alone (`BaseAttribution`: OpenStreetMap's replaces Stadia's at the switch, none while a Google layer is chosen); OpenStreetMap's alone for `osm`; OpenStreetMap's in dark are darkened by the class `tiles-darkened` on the map's container (a filter of `map.css` on the tile pane: invert, hue turned half round, a little less brightness, contrast and saturation; only while OpenStreetMap's base is shown, never on Google's); with Google's tiles a layer switch (the base first, then roadmap, satellite, hybrid: a session per layer from `createSession`, 2D tiles, the attribution of what is in view from `viewport` after the map rests, shown with "Google Maps"; `src/web/client/layers.ts`). Regions as outlines with their names from zoom 12; gyms as dots, all in one color; a popup per gym built as a tree of nodes and rendered with `textContent` only (`gymPopup`, `renderNode`): never HTML from data. Leaflet treats string content as HTML (tooltips, popups, attributions, the layer switch's names): data goes to it as nodes (`renderNode`; a region's label is `regionLabel`), and the only strings it is given are constants of ours and the escaped copyright of `googleAttribution`. The filter box hides gyms whose name and nickname lack a word typed (`gymFilter`: no case, accents or apostrophes) and fits the map to the matches on Enter. The header: "Log in with Discord" (only with the secret) or "Use /maps in Discord to log in.", or the member's name, Log out (a POST with the CSRF token; `logOut`, `src/web/client/logout.ts`: on a 403, the token of a page loaded before a restart, it asks `/api/me` again and tries once more, a session gone by then counting as logged out; only a 2xx is logged out, so a second refusal, any other status or a broken connection says "Log out failed; try again.") and why they see only the public map (`headerLines`, `src/web/client/notice.ts`: Discord away; for `missingRole` "You can look around the map. To join or report here, you need the Verified role in this server."; else "You are not a member of this server."). `?login=failed|expired` is said once and taken out of the address.
+- The page: Leaflet; the tiles of `data-tiles` (`addTiles`, `src/web/client/common.ts`, over `tileLayers`, `src/web/client/layers.ts`, plan 8M-7): Stadia's Alidade Smooth in light and Alidade Smooth Dark in dark (`https://tiles.stadiamaps.com/tiles/alidade_smooth{_dark}/{z}/{x}/{y}{r}.png`, credited "© Stadia Maps © OpenMapTiles © OpenStreetMap contributors" with links, `STADIA_ATTRIBUTION`), drawn anew in the other style when the device changes between light and dark; once Stadia refuses its tiles (three failed in a row with none loaded between, or the first two of the visit: a 401 on a domain it does not know, a 429 past the month's credits; the page cannot tell which, and a tile that loads starts the run again) OpenStreetMap's for the rest of the visit, once (`StadiaFallback`), drawn to zoom 20 with its own pictures enlarged past 19 (`maxNativeZoom`); the credit is the page's own, of the base shown alone (`BaseAttribution`: OpenStreetMap's replaces Stadia's at the switch, none while a Google layer is chosen); OpenStreetMap's alone for `osm`; OpenStreetMap's in dark are darkened by the class `tiles-darkened` on the map's container (a filter of `map.css` on the tile pane: invert, hue turned half round, a little less brightness, contrast and saturation; only while OpenStreetMap's base is shown, never on Google's); with Google's tiles a layer switch (the base first, then roadmap, satellite, hybrid: a session per layer from `createSession`, 2D tiles, the attribution of what is in view from `viewport` after the map rests, shown with "Google Maps"; `src/web/client/layers.ts`). Regions as outlines with their names below zoom 15 only, where they help to find a region (`regionLabelsShown`, `LABELS_BELOW`, fix round 1; from zoom 12 on before); gyms as dots, all in one color; a popup per gym built as a tree of nodes and rendered with `textContent` only (`gymPopup`, `renderNode`): never HTML from data. Leaflet treats string content as HTML (tooltips, popups, attributions, the layer switch's names): data goes to it as nodes (`renderNode`; a region's label is `regionLabel`), and the only strings it is given are constants of ours and the escaped copyright of `googleAttribution`. The filter box hides gyms whose name and nickname lack a word typed (`gymFilter`: no case, accents or apostrophes) and fits the map to the matches on Enter. The header: "Log in with Discord" (only with the secret) or "Use /maps in Discord to log in.", or the member's name, Log out (a POST with the CSRF token; `logOut`, `src/web/client/logout.ts`: on a 403, the token of a page loaded before a restart, it asks `/api/me` again and tries once more, a session gone by then counting as logged out; only a 2xx is logged out, so a second refusal, any other status or a broken connection says "Log out failed; try again.") and why they see only the public map (`headerLines`, `src/web/client/notice.ts`: Discord away; for `missingRole` "You can look around the map. To join or report here, you need the Verified role in this server."; else "You are not a member of this server."). `?login=failed|expired` is said once and taken out of the address.
 
 ## The map's frame (plan 8M-7)
 
@@ -47,6 +47,8 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **The start view** (`startView`, the first rule that applies): (1) your location, at street level (`STREET_ZOOM`, 15), when the browser granted it already (`alreadyGranted`, `your-location.ts`: `navigator.permissions.query({ name: 'geolocation' })` is `granted`; the page never asks on load), applied when its first fix comes unless the member moved the map meanwhile (`MemberMoves`: any `movestart` or `zoomstart` after the start view is set, a tap on a line of the list that flies the map among them); (2) the region `/maps` named (`?region=<id>`, `regionOf`), at street level at the middle of its box; it wins over (3) where the member last left the map of this server, at its own zoom (`readLastView` / `writeLastView`: `localStorage` `pine-map-view:<guild>`, written at each `moveend`, read and written in try/catch, `browserStorage`); (4) the whole server (`fitBounds` of its regions, else of its gyms, else "This server has no regions yet."). A location or last view beyond the regions and their margin is passed over. `?region=` is taken out of the address once read (as `?login=`), so that a reload opens where the member left the map.
 - **`/maps` names its region:** used in a region's channel or its forum (`regionChannelOf`), `/maps` puts the region's id in the map's address it shows (`/s/<guild>/map?region=<id>`) and in its login link (`LoginLinks.issue(…, 'map', region)`, `LinkHolder.region`); the link's POST redirects to `/s/<guild>/map?region=<id>` (an id of ours, never of the request); an expired link lands on the whole map (`?login=expired`).
 - **Your location** (`you-ui.ts`, `showWhereYouAre`; words in `your-location.ts`): "Show where I am", a round button with a crosshair (SVG of ours, `currentColor`) at the bottom right, asks the browser only when pressed (`watchPosition`, high accuracy), draws a blue dot (`--you`, edged `--you-edge`, drawn colors of `theme.ts`) with a circle of its accuracy, centers the map on it at street level or closer, and keeps it current while the page is open; pressed again it centers on the dot. Refused or unavailable: one line under the header (`locationRefusal`: "Your browser did not share your location.", "Your location is not available just now.", or "This browser cannot share your location with this page." where there is no geolocation or the page is not a secure context; browsers count `http://localhost` as one), nothing else. `onMove` tells the list each new fix.
+- **Layers** (`layer-registry.ts`, `LayerRegistry`): everything drawn is a layer the member toggles, registered with a name, whether it is on by default, live (a toggle of its own on the desktop) or background (under "More"), a line about it, members only (`membersOnly`) or waiting for data (`waits`), and how many of its things are in view (`setCount`, which the parts that draw it keep current at each `moveend` and draw). One call adds a layer (`register`; field research and Team GO Rocket come so with 8M-9). The layers of `MAP_LAYERS`: Raids, Trains, Meetups (live, on), Wild spawns (off; it waits for data: no route lists spawns yet, so it is not offered until something calls `setOffered('spawns', true)`), Gyms (on until plan 8M-9's Report button exists: "Report raid" is in a gym's popup and reporting is a member's first job; 8M-9 turns it off, the controller's ruling of fix round 1), PokéStops, Power Spots (off), Region outlines (on). The choice is kept per browser, one for every server (`localStorage` `pine-map-layers`, `{ id: boolean }`, read and written in try/catch; a value that is no boolean is ignored, a layer the browser kept nothing of takes its default). The controls (`layers-ui.ts`): on the desktop a row in the header (`<nav id="layers">` of the template) with the live layers as labelled toggles (`aria-pressed`, a dot of the layer's color) and the background ones as checkboxes under "More" (a `<details>`); narrower than 768 pixels (`map.css`) a "Layers · n" button (`layersButtonLabel`, n the offered layers on) that opens a bottom sheet listing every offered layer with its line, how many are in view ("4 in view", `inViewWords`) and a switch (a checkbox `role="switch"`), Done and a tap on the scrim closing it; the sheet is a modal dialog for the keyboard (`SheetFocus`: `aria-modal`, the focus moved to its first switch, Escape closes it, the focus given back to the button), each switch named by its layer (`switchLabel`, `aria-label`), and "More" closes on Escape and on a click outside it (`moreCloses`). Logged out (or not a member), PokéStops and Power Spots are not offered (`offered(spec, member)`); the controls are drawn anew once `/api/me` answers (`refresh`).
+- **What each layer draws:** the parties' popups and markers as before (`party-layer.ts`), now in a group per layer (`raids`, `trains`, `meetups`) put on and taken off the map by the registry; the regions' outlines with their labels (`main.ts`; the labels on a pane of their own, `region-labels`, at 350 under the overlay pane of the outlines and of the gyms', stops' and spots' circles and under every marker (round 2), taking no clicks, in 12 px type, so that a name never covers a raid or a gym); the gyms (`gyms-ui.ts`, `showGymDots`) at every zoom, by Pine's grid clustering below zoom 16 (`cluster.ts`, `clustersAt`, `CLUSTER_BELOW`: the places of one 60-pixel cell of a grid fixed on the world are one cluster, drawn as a circle with its count at the middle of its places, `.cluster`, `--cluster`; a tap zooms in on it, at least two zooms and at most to 16; Leaflet.markercluster's last release is from 2020); what is drawn is worked out for the view and half its size round it (`wantedDots`, `DOTS_MARGIN`; keyed `gym:<id>` and `cluster:<cell>:<its gyms>`) and only the difference added or taken off at each move, list or change (`dotsDiff`): the gym whose popup is open is never taken off nor clustered while it is open (fix round 1); which gyms are drawn is `shownGyms` (`gym-dots.ts`): every gym while the Gyms layer is on, or while a gym is to be clicked (route mode, a meetup's place picked: `MapRaids.forced`, the gyms drawn anew after each draw of the parties), and while "Find a gym" holds a word those it matches whatever the layer (Enter fits the map to them and opens the one gym's popup once the map rests); the PokéStops and Power Spots of the view (`places-ui.ts`, `showPlaces`) for a member from zoom 16 (`placesWanted`, `PLACES_FROM`) through `/api/stops` and `/api/powerspots`, asked at once when wanted and again 300 ms after the map rests (`PlacesInView` over `StopLoads`: only the last question's answer shown, nothing after they are no longer wanted), small dots of `--stop` and `--power-spot` with the name in a popup, and "more than shown" in one quiet line at the bottom left of the map ("Zoom in to see every PokéStop here.", `MORE_THAN_SHOWN`, `quietLine`). Live things never cluster.
 - **Distances** (`distance.ts`): `metersBetween`, which is `metresBetween` of `@pine/wayspot-core/distance` itself (the function the place search and Wayfarer matching measure with: one source for every fact, Matt 2026-10-25), and `distanceWords` (`src/render/distance-words.ts`, import-free, so that Discord's side can share it once Matt rules on one rule for both: the map says miles and feet, Discord meters and kilometers): under a tenth of a mile in feet, rounded to 10 (`60 ft`), else miles to one decimal (`1.3 mi`).
 
 ## The parties on the map (plan 8M-3)
diff --git a/docs/superpowers/plans/phase-0-follow-ups.md b/docs/superpowers/plans/phase-0-follow-ups.md
index 4aa3866508e0e2fab6b67b8a08f3bbf97529572f..dafaaa922ecff4c025e8b9a1b19b6608552e4f8f 100644
--- a/docs/superpowers/plans/phase-0-follow-ups.md
+++ b/docs/superpowers/plans/phase-0-follow-ups.md
@@ -2418,3 +2418,7 @@ Built as a small fix on `event-tasks-first` (brief `.superpowers/sdd/event-tasks
 - **Watch:** a heading Leek Duck renames or adds (a new standing category) would read as an event's and lead every list: the log line shows it the first time.
 
 - **The web polish designed and approved (2026-10-25):** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` (interview, mockups v1 and the tile comparison in the git-ignored `var/mockups/web-polish/`, builder check, Matt's rulings: names shown to those who may see the post, Discord's rule for changing a raid, screenshot feedback on Discord only, Stadia Alidade Smooth and Smooth Dark with OpenStreetMap as the fallback). Plans: 8M-7 the frame, 8M-8 posts as popups (two or three plans), 8M-9 reporting and the stops (after the board plan), 8M-10 the editor toggle. Worked on in `../Professor-Pine-web`, branch `web-polish`.
+
+## From the 8M-7 prototype (the web map's frame, 2026-10-25)
+
+- 8M-9 turns the Gyms layer's default off (`MAP_LAYERS`, `layer-registry.ts`): it is on only until 8M-9's Report button exists, since "Report raid" lives in a gym's popup (the controller's ruling, fix round 1).
diff --git a/src/web/client/cluster.test.ts b/src/web/client/cluster.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ceac6a3c5ac5df41aeecf83789c30df415e752cc
--- /dev/null
+++ b/src/web/client/cluster.test.ts
@@ -0,0 +1,98 @@
+import { describe, expect, it } from 'vitest';
+import { CLUSTER_BELOW, clustersAt, PlacesInView, placesWanted, PLACES_FROM } from './cluster.js';
+import { StopLoads } from './meetup-forms.js';
+
+/** Gyms of Oakland, Pittsburgh: two a street apart, one across the river. */
+const NEAR_A = { id: 1, lat: 40.4443, lon: -79.9532 };
+const NEAR_B = { id: 2, lat: 40.4446, lon: -79.9529 };
+const FAR = { id: 3, lat: 40.4304, lon: -79.9228 };
+
+describe("Pine's grid clustering (plan 8M-7)", () => {
+  it('puts the places of one cell of the grid into one cluster with its count, below zoom 16', () => {
+    const clusters = clustersAt([NEAR_A, NEAR_B, FAR], 12);
+    expect(clusters.map((cluster) => cluster.points.map((point) => point.id))).toEqual([
+      [1, 2],
+      [3],
+    ]);
+    const [both] = clusters;
+    // Drawn at the middle of its places.
+    expect(both?.lat).toBeCloseTo((NEAR_A.lat + NEAR_B.lat) / 2, 9);
+    expect(both?.lon).toBeCloseTo((NEAR_A.lon + NEAR_B.lon) / 2, 9);
+  });
+
+  it('parts places as the map zooms in, and never clusters from zoom 16', () => {
+    expect(clustersAt([NEAR_A, NEAR_B, FAR], 9)).toHaveLength(1);
+    expect(clustersAt([NEAR_A, NEAR_B, FAR], 15).map((c) => c.points.length)).toEqual([2, 1]);
+    expect(clustersAt([NEAR_A, NEAR_B, FAR], 16).map((c) => c.points.length)).toEqual([1, 1, 1]);
+    expect(CLUSTER_BELOW).toBe(16);
+    expect(clustersAt([NEAR_A, { ...NEAR_A, id: 9 }], 16)).toHaveLength(2);
+    expect(clustersAt([], 10)).toEqual([]);
+  });
+
+  it('keeps its cells fixed on the world, so a cluster does not change as the map pans', () => {
+    const once = clustersAt([NEAR_A, NEAR_B, FAR], 13);
+    const again = clustersAt([FAR, NEAR_B, NEAR_A], 13);
+    const ids = (clusters: typeof once) =>
+      clusters.map((cluster) => cluster.points.map((point) => point.id).sort()).sort();
+    expect(ids(again)).toEqual(ids(once));
+  });
+});
+
+describe('the PokéStops and Power Spots in view (plan 8M-7)', () => {
+  it('are wanted from zoom 16, when their layer is on, for a member', () => {
+    expect(PLACES_FROM).toBe(16);
+    expect(placesWanted(true, 16, true)).toBe(true);
+    expect(placesWanted(true, 15, true)).toBe(false);
+    expect(placesWanted(false, 17, true)).toBe(false);
+    expect(placesWanted(true, 17, false)).toBe(false);
+  });
+
+  it('are asked for only while wanted: at once, after the map rests, and no more after', async () => {
+    const timers: Array<() => void> = [];
+    let asked = 0;
+    let cleared = 0;
+    const shown: number[] = [];
+    const loads = new StopLoads({
+      load: () => {
+        asked += 1;
+        return Promise.resolve({ stops: [['s1', 40.44, -79.95, 'Fountain']], more: false });
+      },
+      show: (view) => shown.push(view.stops.length),
+      more: () => undefined,
+      failed: () => undefined,
+      delayMs: 300,
+      setTimer: (run) => {
+        timers.push(run);
+        return () => {
+          timers.splice(timers.indexOf(run), 1);
+        };
+      },
+    });
+    const places = new PlacesInView({
+      loads,
+      clear: () => {
+        cleared += 1;
+      },
+    });
+    // Zoomed out or off: nothing asked.
+    places.changed(false);
+    expect(asked).toBe(0);
+    // Wanted: asked at once.
+    places.changed(true);
+    await loads.idle();
+    expect(asked).toBe(1);
+    // The map moved twice: asked once, after it rested.
+    places.changed(true, true);
+    places.changed(true, true);
+    expect(timers).toHaveLength(1);
+    timers.shift()?.();
+    await loads.idle();
+    expect(asked).toBe(2);
+    // Zoomed out again: cleared, and an answer on its way is not shown.
+    places.changed(true, true);
+    places.changed(false);
+    expect(cleared).toBe(1);
+    expect(timers).toHaveLength(0);
+    expect(shown).toEqual([1, 1]);
+  });
+});
diff --git a/src/web/client/cluster.ts b/src/web/client/cluster.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ccb514f4982b6bfc5b07010e415a101ac5dff4f2
--- /dev/null
+++ b/src/web/client/cluster.ts
@@ -0,0 +1,107 @@
+/**
+ * Pine's own grid clustering of the map's background places (plan 8M-7; Leaflet.markercluster's
+ * last release is from 2020): below street level the places that fall in one cell of a grid
+ * fixed on the world (so that a cluster does not change as the map pans) are one cluster, drawn
+ * as a circle with its count at the middle of its places; a tap zooms in on it. Live things
+ * (raids, trains, meetups) never cluster. And when the PokéStops and Power Spots of the view are
+ * asked for: from street level, while their layer is on, for a member (`PlacesInView`).
+ */
+
+/** From this zoom places are drawn one by one. */
+export const CLUSTER_BELOW = 16;
+/** The PokéStops and Power Spots are drawn from this zoom. */
+export const PLACES_FROM = 16;
+/** A cell of the grid, in pixels of the map. */
+export const CELL_PIXELS = 60;
+const TILE = 256;
+
+export interface Cluster<P> {
+  /** Its cell of the grid at the zoom (`x:y`); none from `CLUSTER_BELOW`, where none are made. */
+  cell?: string;
+  points: P[];
+  /** The middle of its places. */
+  lat: number;
+  lon: number;
+}
+
+/** Where a place is on the world's square at a zoom, in pixels (Web Mercator). */
+function pixelOf(place: { lat: number; lon: number }, zoom: number): { x: number; y: number } {
+  const size = TILE * 2 ** zoom;
+  const sin = Math.sin((place.lat * Math.PI) / 180);
+  return {
+    x: ((place.lon + 180) / 360) * size,
+    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
+  };
+}
+
+/**
+ * The clusters of places at a zoom, in the order their first place comes; from `CLUSTER_BELOW`
+ * each place is a cluster of its own.
+ */
+export function clustersAt<P extends { lat: number; lon: number }>(
+  points: readonly P[],
+  zoom: number,
+  cell = CELL_PIXELS,
+): Cluster<P>[] {
+  if (zoom >= CLUSTER_BELOW)
+    return points.map((point) => ({ points: [point], ...middle([point]) }));
+  const cells = new Map<string, P[]>();
+  for (const point of points) {
+    const { x, y } = pixelOf(point, zoom);
+    const key = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
+    const there = cells.get(key);
+    if (there) there.push(point);
+    else cells.set(key, [point]);
+  }
+  return [...cells].map(([cell, group]) => ({ cell, points: group, ...middle(group) }));
+}
+
+function middle(points: readonly { lat: number; lon: number }[]): { lat: number; lon: number } {
+  const sum = points.reduce(
+    (total, point) => ({ lat: total.lat + point.lat, lon: total.lon + point.lon }),
+    {
+      lat: 0,
+      lon: 0,
+    },
+  );
+  return { lat: sum.lat / points.length, lon: sum.lon / points.length };
+}
+
+/** Whether the PokéStops or Power Spots of the view are wanted. */
+export function placesWanted(on: boolean, zoom: number, member: boolean): boolean {
+  return on && member && zoom >= PLACES_FROM;
+}
+
+/** What `PlacesInView` drives: the loads of `StopLoads`, and taking the places off the map. */
+export interface PlacesInViewDeps {
+  loads: { now(): void; moved(): void; stop(): void };
+  clear(): void;
+}
+
+/**
+ * The PokéStops or Power Spots of the view (`/api/stops`, `/api/powerspots`): asked for at once
+ * when they become wanted, again once the map has rested after it moved (the loads' debounce),
+ * and taken off the map, nothing more asked or shown, once they are not.
+ */
+export class PlacesInView {
+  private active = false;
+
+  constructor(private readonly deps: PlacesInViewDeps) {}
+
+  /** The layer, the zoom or the view changed; `moved`: the map moved (a pan or a zoom). */
+  changed(wanted: boolean, moved = false): void {
+    if (!wanted) {
+      if (!this.active) return;
+      this.active = false;
+      this.deps.loads.stop();
+      this.deps.clear();
+      return;
+    }
+    if (!this.active) {
+      this.active = true;
+      this.deps.loads.now();
+      return;
+    }
+    if (moved) this.deps.loads.moved();
+  }
+}
diff --git a/src/web/client/gym-dots.test.ts b/src/web/client/gym-dots.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b78ff1eda5149881b728542121b5eaebac076639
--- /dev/null
+++ b/src/web/client/gym-dots.test.ts
@@ -0,0 +1,87 @@
+import { describe, expect, it } from 'vitest';
+import { dotsDiff, shownGyms, wantedDots } from './gym-dots.js';
+import type { MapGym } from './popup.js';
+
+const gym = (id: number, name: string): MapGym => ({
+  id,
+  name,
+  nickname: null,
+  lat: 40.44,
+  lon: -79.95 + id / 1000,
+  regionIds: [1],
+  address: null,
+  description: null,
+  notice: null,
+});
+
+const GYMS = [gym(1, 'Carnegie Library'), gym(2, 'Schenley Fountain'), gym(3, 'Library Steps')];
+const ids = (gyms: readonly MapGym[]) => gyms.map((one) => one.id);
+
+describe('the gyms the map draws (plan 8M-7)', () => {
+  it('are every gym while the layer is on, and none while it is off', () => {
+    expect(ids(shownGyms(GYMS, { on: true, filter: '', forced: false }))).toEqual([1, 2, 3]);
+    expect(ids(shownGyms(GYMS, { on: false, filter: '', forced: false }))).toEqual([]);
+  });
+
+  it('are those "Find a gym" matches while it holds a word, the layer on or off', () => {
+    expect(ids(shownGyms(GYMS, { on: false, filter: 'library', forced: false }))).toEqual([1, 3]);
+    expect(ids(shownGyms(GYMS, { on: true, filter: 'fountain', forced: false }))).toEqual([2]);
+  });
+
+  it('are every gym while a gym is to be clicked (route mode, a meetup place picked)', () => {
+    expect(ids(shownGyms(GYMS, { on: false, filter: '', forced: true }))).toEqual([1, 2, 3]);
+  });
+});
+
+/** A view of Oakland at street level and the gyms around it. */
+const at = (id: number, lat: number, lon: number): MapGym => ({
+  ...gym(id, 'Gym ' + id),
+  lat,
+  lon,
+});
+const VIEW = { south: 40.44, west: -79.96, north: 40.45, east: -79.94 };
+
+describe('the dots and clusters drawn (plan 8M-7, fix round 1)', () => {
+  it('are those of the view and a margin round it, the rest left out', () => {
+    const inView = at(1, 40.445, -79.95);
+    const inMargin = at(2, 40.452, -79.95);
+    const far = at(3, 40.6, -79.95);
+    const wanted = wantedDots([inView, inMargin, far], 16, VIEW, undefined);
+    expect([...wanted.keys()].sort()).toEqual(['gym:1', 'gym:2']);
+  });
+
+  it('clusters below street level, each cluster keyed by its cell and its places', () => {
+    const a = at(1, 40.445, -79.95);
+    const b = at(2, 40.4451, -79.9501);
+    const wanted = wantedDots([a, b], 12, VIEW, undefined);
+    const [key] = [...wanted.keys()];
+    expect(wanted.size).toBe(1);
+    expect(key).toMatch(/^cluster:/u);
+    const item = wanted.get(key ?? '');
+    expect(item?.kind === 'cluster' ? item.points.map((one) => one.id) : []).toEqual([1, 2]);
+    // Another place in the same cell is another cluster: drawn anew.
+    const more = wantedDots([a, b, at(3, 40.4452, -79.9502)], 12, VIEW, undefined);
+    expect([...more.keys()]).not.toContain(key);
+  });
+
+  it('keeps the gym whose popup is open on its own, out of clusters and out of view', () => {
+    const a = at(1, 40.445, -79.95);
+    const b = at(2, 40.4451, -79.9501);
+    const wanted = wantedDots([a, b], 12, VIEW, 2);
+    // Gym 2 is open: on its own; gym 1, alone in its cell then, a dot.
+    expect([...wanted.keys()].sort()).toEqual(['gym:1', 'gym:2']);
+    const away = wantedDots([at(9, 40.7, -79.95)], 16, VIEW, 9);
+    expect([...away.keys()]).toEqual(['gym:9']);
+  });
+
+  it('adds and takes off only the difference, never the open gym', () => {
+    const wanted = new Map([
+      ['gym:1', null],
+      ['gym:3', null],
+    ]);
+    expect(dotsDiff(['gym:1', 'gym:2', 'gym:5'], wanted, 'gym:5')).toEqual({
+      add: ['gym:3'],
+      remove: ['gym:2'],
+    });
+  });
+});
diff --git a/src/web/client/gym-dots.ts b/src/web/client/gym-dots.ts
new file mode 100644
index 0000000000000000000000000000000000000000..602d978c0490952b141c6c23e7f76c154b148f80
--- /dev/null
+++ b/src/web/client/gym-dots.ts
@@ -0,0 +1,80 @@
+import { clustersAt } from './cluster.js';
+import { gymFilter } from './filter.js';
+import type { MapGym } from './popup.js';
+import { inBox, paddedBox, type Box } from './view.js';
+
+/** How far beyond the view the dots are drawn, as a share of its size each way. */
+export const DOTS_MARGIN = 0.5;
+
+/** A thing the gyms' layer draws: a gym's dot, or a cluster with its count. */
+export type WantedDot<G> =
+  { kind: 'dot'; gym: G } | { kind: 'cluster'; points: G[]; lat: number; lon: number };
+
+/**
+ * What the gyms' layer draws for a view (plan 8M-7, fix round 1): the gyms of the view and a
+ * margin round it (`DOTS_MARGIN`), clustered below street level (`clustersAt`), by key: `gym:<id>`
+ * for a dot, `cluster:<cell>:<its places>` for a cluster, so that a cluster whose places change is
+ * another. The gym whose popup is open (`open`) is always drawn on its own, out of every cluster,
+ * wherever it is, so that its popup is never taken away.
+ */
+export function wantedDots<G extends { id: number; lat: number; lon: number }>(
+  gyms: readonly G[],
+  zoom: number,
+  view: Box,
+  open: number | undefined,
+): Map<string, WantedDot<G>> {
+  const box = paddedBox(view, DOTS_MARGIN);
+  const wanted = new Map<string, WantedDot<G>>();
+  const near = gyms.filter((gym) => gym.id !== open && inBox(box, gym));
+  for (const cluster of clustersAt(near, zoom)) {
+    const [first] = cluster.points;
+    if (!first) continue;
+    if (cluster.points.length === 1) wanted.set(`gym:${first.id}`, { kind: 'dot', gym: first });
+    else {
+      const ids = cluster.points.map((point) => point.id).join(',');
+      wanted.set(`cluster:${cluster.cell ?? ''}:${ids}`, {
+        kind: 'cluster',
+        points: cluster.points,
+        lat: cluster.lat,
+        lon: cluster.lon,
+      });
+    }
+  }
+  const opened = gyms.find((gym) => gym.id === open);
+  if (opened) wanted.set(`gym:${opened.id}`, { kind: 'dot', gym: opened });
+  return wanted;
+}
+
+/** What to add and take off to go from the keys drawn to those wanted; never the open one. */
+export function dotsDiff(
+  drawn: Iterable<string>,
+  wanted: ReadonlyMap<string, unknown>,
+  open: string | undefined,
+): { add: string[]; remove: string[] } {
+  const had = new Set(drawn);
+  return {
+    add: [...wanted.keys()].filter((key) => !had.has(key)),
+    remove: [...had].filter((key) => !wanted.has(key) && key !== open),
+  };
+}
+
+/** What decides which gyms the map draws. */
+export interface GymsShown {
+  /** The Gyms layer is on. */
+  on: boolean;
+  /** What "Find a gym" holds. */
+  filter: string;
+  /** A gym is to be clicked: route mode, or a meetup's place being picked. */
+  forced: boolean;
+}
+
+/**
+ * The gyms the map draws (plan 8M-7): every gym while the Gyms layer is on or a gym is to be
+ * clicked (route mode, a meetup's place picked: the map must offer them whatever the layer), and
+ * while "Find a gym" holds a word those it matches, the layer on or off (finding a gym shows it);
+ * none otherwise.
+ */
+export function shownGyms(gyms: readonly MapGym[], shown: GymsShown): MapGym[] {
+  if (shown.filter.trim() !== '') return gyms.filter(gymFilter(shown.filter));
+  return shown.on || shown.forced ? [...gyms] : [];
+}
diff --git a/src/web/client/gyms-ui.ts b/src/web/client/gyms-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5300780c69d100e624dd31be0aa1b2b901569184
--- /dev/null
+++ b/src/web/client/gyms-ui.ts
@@ -0,0 +1,170 @@
+import * as L from 'leaflet';
+import { CLUSTER_BELOW } from './cluster.js';
+import { dotsDiff, shownGyms, wantedDots } from './gym-dots.js';
+import type { LayerRegistry } from './layer-registry.js';
+import { GYM_DOT, gymClicks } from './party-layer.js';
+import { gymPopup, renderNode, type MapGym } from './popup.js';
+import { heldContent } from './raid-forms.js';
+import { onThemeChange, theme } from './theme.js';
+
+/**
+ * The gyms on the live map (plan 8M-7): the Gyms layer, drawn at every zoom and clustered below
+ * street level by Pine's grid (`clustersAt`: a circle with its count, a tap zooms in on it); each
+ * gym a dot whose popup is the gym's (`gymPopup`) with what the parties add (`extras`: "Report
+ * raid" and the rest), opened by our own click handler (`gymClicks`: in route mode a click adds
+ * the gym as a stop). Off by default; while "Find a gym" holds a word its matches are drawn
+ * whatever the layer, and while a gym is to be clicked (route mode, a meetup's place picked) every
+ * gym (`shownGyms`). The registry is told how many gyms are in view.
+ */
+export interface GymDots {
+  /** Draws the gyms anew (the zoom, the layer, the filter or the parties changed). */
+  refresh(): void;
+  /** The dot of a gym, made on first use. */
+  dot(gym: MapGym): L.CircleMarker;
+}
+
+export interface GymDotsDeps {
+  map: L.Map;
+  gyms: readonly MapGym[];
+  names: ReadonlyMap<number, string>;
+  registry: LayerRegistry;
+  filter: HTMLInputElement;
+  /** What a gym's popup shows beyond the gym: "Report raid" and the rest, for a member. */
+  extras(gym: MapGym): HTMLElement[];
+  /** A form is open in the popup that is open: its content is held. */
+  editing(): boolean;
+  /** A gym clicked: true when route mode or a place picked took it (no popup). */
+  clicked(gym: MapGym): boolean;
+  /** A gym is to be clicked: every gym is drawn. */
+  forced(): boolean;
+}
+
+/** How far a tap on a cluster zooms in at least. */
+const CLUSTER_STEP = 2;
+
+export function showGymDots(deps: GymDotsDeps): GymDots {
+  const { map, registry } = deps;
+  const group = L.layerGroup().addTo(map);
+  const dots = new Map<number, L.CircleMarker>();
+  /** What is drawn, by its key (`wantedDots`). */
+  const drawn = new Map<string, L.Layer>();
+  /** The gym whose popup is open. */
+  let open: number | undefined;
+
+  const dot = (gym: MapGym): L.CircleMarker => {
+    const made = dots.get(gym.id);
+    if (made) return made;
+    const marker = L.circleMarker([gym.lat, gym.lon], {
+      ...GYM_DOT,
+      color: theme().colours.gym,
+      fillOpacity: 0.8,
+    }).bindPopup(
+      heldContent(
+        () => {
+          const popup = renderNode(gymPopup(gym, deps.names), document);
+          popup.append(...deps.extras(gym));
+          return popup;
+        },
+        () => deps.editing(),
+      ),
+    );
+    // In route mode a click (or Enter) adds the gym as a stop: its popup is not opened.
+    gymClicks(marker, () => deps.clicked(gym));
+    // The open gym is never taken away nor clustered (`wantedDots`); once closed, drawn as wanted.
+    marker.on('popupopen', () => {
+      open = gym.id;
+    });
+    marker.on('popupclose', () => {
+      if (open === gym.id) open = undefined;
+      window.setTimeout(refresh, 0);
+    });
+    dots.set(gym.id, marker);
+    return marker;
+  };
+
+  const bubble = (points: readonly MapGym[], lat: number, lon: number): L.Marker => {
+    // The count as text of an element of ours: Leaflet sets a string as HTML.
+    const label = document.createElement('span');
+    label.textContent = String(points.length);
+    const marker = L.marker([lat, lon], {
+      icon: L.divIcon({ html: label, className: 'cluster', iconSize: [34, 34] }),
+      keyboard: true,
+      title: `${points.length} gyms`,
+    });
+    marker.on('click', () => {
+      const box = L.latLngBounds(points.map((point) => [point.lat, point.lon]));
+      const zoom = Math.min(
+        Math.max(map.getBoundsZoom(box, false, L.point(40, 40)), map.getZoom() + CLUSTER_STEP),
+        CLUSTER_BELOW,
+      );
+      map.setView(box.getCenter(), zoom);
+    });
+    return marker;
+  };
+
+  /**
+   * Draws what is wanted for the view and a margin (`wantedDots`), adding and taking off only the
+   * difference (`dotsDiff`): a pan or a new list of parties does not draw every gym anew, and the
+   * dot whose popup is open is never taken off (fix round 1).
+   */
+  const refresh = (): void => {
+    const shown = shownGyms(deps.gyms, {
+      on: registry.isOn('gyms'),
+      filter: deps.filter.value,
+      forced: deps.forced(),
+    });
+    const bounds = map.getBounds();
+    const view = {
+      south: bounds.getSouth(),
+      west: bounds.getWest(),
+      north: bounds.getNorth(),
+      east: bounds.getEast(),
+    };
+    const wanted = wantedDots(shown, map.getZoom(), view, open);
+    const { add, remove } = dotsDiff(
+      drawn.keys(),
+      wanted,
+      open === undefined ? undefined : `gym:${open}`,
+    );
+    for (const key of remove) {
+      const layer = drawn.get(key);
+      if (layer) group.removeLayer(layer);
+      drawn.delete(key);
+    }
+    for (const key of add) {
+      const item = wanted.get(key);
+      if (!item) continue;
+      const layer = item.kind === 'dot' ? dot(item.gym) : bubble(item.points, item.lat, item.lon);
+      layer.addTo(group);
+      drawn.set(key, layer);
+    }
+    registry.setCount('gyms', shown.filter((gym) => bounds.contains([gym.lat, gym.lon])).length);
+  };
+
+  map.on('moveend', refresh);
+  registry.onChange((id) => {
+    if (id === 'gyms') refresh();
+  });
+  onThemeChange(({ colours }) => {
+    for (const marker of dots.values()) marker.setStyle({ color: colours.gym });
+  });
+
+  deps.filter.addEventListener('input', refresh);
+  deps.filter.addEventListener('keydown', (event) => {
+    if (event.key !== 'Enter') return;
+    const matches = shownGyms(deps.gyms, { on: false, filter: deps.filter.value, forced: false });
+    if (matches.length === 0) return;
+    map.fitBounds(L.latLngBounds(matches.map((gym) => [gym.lat, gym.lon])), {
+      maxZoom: 17,
+      padding: [40, 40],
+    });
+    const [only] = matches;
+    if (matches.length === 1 && only) {
+      // Once the map rests at the gym, where its dot is drawn on its own.
+      map.once('moveend', () => {
+        if (group.hasLayer(dot(only))) dot(only).openPopup();
+      });
+    }
+  });
+  return { refresh, dot };
+}
diff --git a/src/web/client/layer-registry.test.ts b/src/web/client/layer-registry.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..10e0b09a912c467332f4fb41c7a971127855a07c
--- /dev/null
+++ b/src/web/client/layer-registry.test.ts
@@ -0,0 +1,187 @@
+import { describe, expect, it } from 'vitest';
+import {
+  LayerRegistry,
+  LAYERS_KEY,
+  MAP_LAYERS,
+  regionLabelsShown,
+  type LayerSpec,
+} from './layer-registry.js';
+import {
+  inViewWords,
+  layersButtonLabel,
+  moreCloses,
+  SheetFocus,
+  switchLabel,
+} from './layers-ui.js';
+import type { ViewStorage } from './view.js';
+
+/** A browser's storage of the test's, which may refuse (private mode, full). */
+function storage(refuses = false): ViewStorage & { items: Map<string, string> } {
+  const items = new Map<string, string>();
+  return {
+    items,
+    getItem: (key) => {
+      if (refuses) throw new Error('SecurityError');
+      return items.get(key) ?? null;
+    },
+    setItem: (key, value) => {
+      if (refuses) throw new Error('QuotaExceededError');
+      items.set(key, value);
+    },
+  };
+}
+
+/** The registry with the map's layers, as the page registers them. */
+function mapRegistry(kept: ViewStorage | undefined): LayerRegistry {
+  const registry = new LayerRegistry(kept);
+  for (const layer of MAP_LAYERS) registry.register(layer);
+  return registry;
+}
+
+describe('the layers of the map (plan 8M-7)', () => {
+  it('are on by default for what happens now and the gyms, off for the other places and spawns', () => {
+    const registry = mapRegistry(storage());
+    expect(registry.layers().map((layer) => [layer.id, registry.isOn(layer.id)])).toEqual([
+      ['raids', true],
+      ['trains', true],
+      ['meetups', true],
+      ['spawns', false],
+      // On until plan 8M-9's Report button (fix round 1): Report raid is in a gym's popup.
+      ['gyms', true],
+      ['stops', false],
+      ['spots', false],
+      ['outlines', true],
+    ]);
+    // The desktop row: the live ones as toggles, the background ones under "More".
+    expect(
+      registry
+        .layers()
+        .filter((layer) => layer.kind === 'live')
+        .map((l) => l.name),
+    ).toEqual(['Raids', 'Trains', 'Meetups']);
+    expect(
+      registry
+        .layers()
+        .filter((layer) => layer.kind === 'background')
+        .map((l) => l.name),
+    ).toEqual(['Wild spawns', 'Gyms', 'PokéStops', 'Power Spots', 'Region outlines']);
+  });
+
+  it('keeps the choice in the browser, and reads it back on the next visit', () => {
+    const kept = storage();
+    const first = mapRegistry(kept);
+    const told: string[] = [];
+    first.onChange((id, on) => told.push(`${id} ${on}`));
+    first.set('stops', true);
+    first.set('raids', false);
+    first.set('raids', false);
+    expect(told).toEqual(['stops true', 'raids false']);
+    expect(JSON.parse(kept.items.get(LAYERS_KEY) ?? '{}')).toEqual({ stops: true, raids: false });
+    const next = mapRegistry(kept);
+    expect(next.isOn('stops')).toBe(true);
+    expect(next.isOn('raids')).toBe(false);
+    expect(next.isOn('trains')).toBe(true);
+  });
+
+  it('works on with the defaults where the browser keeps nothing or something else', () => {
+    const refusing = mapRegistry(storage(true));
+    expect(refusing.isOn('raids')).toBe(true);
+    expect(() => {
+      refusing.set('stops', true);
+    }).not.toThrow();
+    expect(refusing.isOn('stops')).toBe(true);
+    const odd = storage();
+    odd.items.set(LAYERS_KEY, '{"gyms":"yes","raids":false}');
+    const read = mapRegistry(odd);
+    expect(read.isOn('gyms')).toBe(true);
+    expect(read.isOn('raids')).toBe(false);
+    odd.items.set(LAYERS_KEY, 'not json');
+    expect(mapRegistry(odd).isOn('raids')).toBe(true);
+    expect(mapRegistry(undefined).isOn('outlines')).toBe(true);
+  });
+
+  it('offers the PokéStops and Power Spots to members only, and counts the layers on', () => {
+    const registry = mapRegistry(storage());
+    const offered = (member: boolean) =>
+      registry
+        .layers()
+        .filter((layer) => registry.offered(layer, member))
+        .map((layer) => layer.id);
+    expect(offered(false)).not.toContain('stops');
+    expect(offered(false)).not.toContain('spots');
+    expect(offered(true)).toEqual(expect.arrayContaining(['stops', 'spots']));
+    // Wild spawns wait for their data (no route lists spawns yet).
+    expect(offered(true)).not.toContain('spawns');
+    registry.setOffered('spawns', true);
+    expect(offered(true)).toContain('spawns');
+    registry.set('stops', true);
+    expect(registry.countOn(true)).toBe(6);
+    // The stops are not offered to a visitor: not counted, though kept on.
+    expect(registry.countOn(false)).toBe(5);
+  });
+
+  it("words the phone's button and its sheet's counts", () => {
+    expect(layersButtonLabel(5)).toBe('Layers · 5');
+    expect(inViewWords(4)).toBe('4 in view');
+    expect(inViewWords(undefined)).toBe('');
+  });
+
+  it('adds a layer in one call, and counts what each shows in view', () => {
+    const registry = mapRegistry(storage());
+    const research: LayerSpec = { id: 'research', name: 'Field research', on: true, kind: 'live' };
+    registry.register(research);
+    expect(registry.layers().map((layer) => layer.id)).toContain('research');
+    expect(registry.isOn('research')).toBe(true);
+    const counts: string[] = [];
+    registry.onCount((id, count) => counts.push(`${id} ${count}`));
+    registry.setCount('raids', 3);
+    registry.setCount('raids', 3);
+    registry.setCount('research', 0);
+    expect(registry.count('raids')).toBe(3);
+    expect(counts).toEqual(['raids 3', 'research 0']);
+  });
+});
+
+describe('the layer controls for keyboards and screen readers (plan 8M-7, fix round 1)', () => {
+  it('names each switch by its layer', () => {
+    expect(switchLabel({ id: 'gyms', name: 'Gyms', on: true, kind: 'background' })).toBe('Gyms');
+  });
+
+  it('moves the focus into the sheet, closes it on Escape and gives the focus back', () => {
+    const focused: string[] = [];
+    const element = (name: string) => ({
+      focus: () => {
+        focused.push(name);
+      },
+    });
+    const sheet = { hidden: true };
+    const control = new SheetFocus(sheet, () => element('first switch'));
+    control.open(element('Layers button'));
+    expect(sheet.hidden).toBe(false);
+    expect(focused).toEqual(['first switch']);
+    expect(control.key('Tab')).toBe(false);
+    expect(sheet.hidden).toBe(false);
+    expect(control.key('Escape')).toBe(true);
+    expect(sheet.hidden).toBe(true);
+    expect(focused).toEqual(['first switch', 'Layers button']);
+    // Closed already: Escape is somebody else's.
+    expect(control.key('Escape')).toBe(false);
+  });
+
+  it('closes "More" on Escape and on a click outside it, not on one inside', () => {
+    expect(moreCloses({ key: 'Escape' })).toBe(true);
+    expect(moreCloses({ clickInside: false })).toBe(true);
+    expect(moreCloses({ clickInside: true })).toBe(false);
+    expect(moreCloses({ key: 'Enter' })).toBe(false);
+  });
+});
+
+describe("the regions' names (fix round 1)", () => {
+  it('are shown only zoomed out, below street level, where they help to find a region', () => {
+    expect(regionLabelsShown(10)).toBe(true);
+    expect(regionLabelsShown(14)).toBe(true);
+    // At street level they would sit under the markers.
+    expect(regionLabelsShown(15)).toBe(false);
+    expect(regionLabelsShown(18)).toBe(false);
+  });
+});
diff --git a/src/web/client/layer-registry.ts b/src/web/client/layer-registry.ts
new file mode 100644
index 0000000000000000000000000000000000000000..eee210607fe4a757d466e5d4191c4ecca95f8f93
--- /dev/null
+++ b/src/web/client/layer-registry.ts
@@ -0,0 +1,160 @@
+import type { ViewStorage } from './view.js';
+
+/**
+ * The layers of the live map (plan 8M-7): everything drawn is a layer the member toggles, with a
+ * name, whether it is on by default, whether it is live (what happens now: a toggle of its own in
+ * the desktop row) or background (under "More"), and how many of its things are in view (the
+ * phone's sheet says it). The page's parts register with the registry (one call adds a layer:
+ * field research and Team GO Rocket come so with plan 8M-9) and follow it; the member's choice is
+ * kept per browser (`localStorage`, read and written in try/catch).
+ */
+
+export interface LayerSpec {
+  id: string;
+  name: string;
+  /** On by default. */
+  on: boolean;
+  /** Live: a toggle of its own on the desktop; background: under "More". */
+  kind: 'live' | 'background';
+  /** A line under its name in the phone's sheet. */
+  hint?: string;
+  /** Offered only to a member (its data is a member's): logged out it is not offered. */
+  membersOnly?: boolean;
+  /** Offered only once something gives it data (`setOffered`). */
+  waits?: boolean;
+}
+
+/** The map's layers in the order the row and the sheet show them. */
+export const MAP_LAYERS: readonly LayerSpec[] = [
+  { id: 'raids', name: 'Raids', on: true, kind: 'live', hint: 'Bosses and eggs' },
+  { id: 'trains', name: 'Trains', on: true, kind: 'live' },
+  { id: 'meetups', name: 'Meetups', on: true, kind: 'live' },
+  { id: 'spawns', name: 'Wild spawns', on: false, kind: 'background', waits: true },
+  // On until plan 8M-9's Report button exists: "Report raid" is in a gym's popup, and reporting
+  // is a member's first job (fix round 1; 8M-9 turns it off).
+  { id: 'gyms', name: 'Gyms', on: true, kind: 'background', hint: 'Grouped when zoomed out' },
+  {
+    id: 'stops',
+    name: 'PokéStops',
+    on: false,
+    kind: 'background',
+    hint: 'Shown from street level',
+    membersOnly: true,
+  },
+  {
+    id: 'spots',
+    name: 'Power Spots',
+    on: false,
+    kind: 'background',
+    hint: 'Shown from street level',
+    membersOnly: true,
+  },
+  { id: 'outlines', name: 'Region outlines', on: true, kind: 'background' },
+];
+
+/** The regions' names are shown below this zoom (fix round 1). */
+export const LABELS_BELOW = 15;
+
+/**
+ * Whether the regions' names are shown (the layer Region outlines, with their labels): only zoomed
+ * out, below street level, where they help to find a region; closer they would sit under the
+ * markers (the controller's ruling, fix round 1).
+ */
+export function regionLabelsShown(zoom: number): boolean {
+  return zoom < LABELS_BELOW;
+}
+
+/** Where the choice is kept in the browser: one choice for every server. */
+export const LAYERS_KEY = 'pine-map-layers';
+
+export class LayerRegistry {
+  private readonly specs: LayerSpec[] = [];
+  private readonly state = new Map<string, boolean>();
+  private readonly kept: Record<string, boolean>;
+  private readonly counts = new Map<string, number>();
+  private readonly given = new Set<string>();
+  private readonly changeListeners: Array<(id: string, on: boolean) => void> = [];
+  private readonly countListeners: Array<(id: string, count: number) => void> = [];
+
+  constructor(private readonly storage: ViewStorage | undefined) {
+    this.kept = readKept(storage);
+  }
+
+  /** Adds a layer: on by what the browser kept, else by its default. */
+  register(spec: LayerSpec): void {
+    this.specs.push(spec);
+    const kept = this.kept[spec.id];
+    this.state.set(spec.id, typeof kept === 'boolean' ? kept : spec.on);
+  }
+
+  layers(): readonly LayerSpec[] {
+    return this.specs;
+  }
+
+  isOn(id: string): boolean {
+    return this.state.get(id) ?? false;
+  }
+
+  /** The member turned a layer on or off: kept, and told. */
+  set(id: string, on: boolean): void {
+    if (!this.state.has(id) || this.state.get(id) === on) return;
+    this.state.set(id, on);
+    this.kept[id] = on;
+    try {
+      this.storage?.setItem(LAYERS_KEY, JSON.stringify(this.kept));
+    } catch {
+      // Private mode or a full storage: the choice holds for this visit.
+    }
+    for (const listener of this.changeListeners) listener(id, on);
+  }
+
+  onChange(listener: (id: string, on: boolean) => void): void {
+    this.changeListeners.push(listener);
+  }
+
+  /** Whether a layer is offered: one of members only to a member, one that waits once given. */
+  offered(spec: LayerSpec, member: boolean): boolean {
+    return (!spec.membersOnly || member) && (!spec.waits || this.given.has(spec.id));
+  }
+
+  /** Something gives a waiting layer its data (or no longer does). */
+  setOffered(id: string, offered: boolean): void {
+    if (offered) this.given.add(id);
+    else this.given.delete(id);
+  }
+
+  /** How many offered layers are on: the phone's "Layers · n". */
+  countOn(member: boolean): number {
+    return this.specs.filter((spec) => this.offered(spec, member) && this.isOn(spec.id)).length;
+  }
+
+  /** How many of a layer's things are in view. */
+  setCount(id: string, count: number): void {
+    if (this.counts.get(id) === count) return;
+    this.counts.set(id, count);
+    for (const listener of this.countListeners) listener(id, count);
+  }
+
+  count(id: string): number | undefined {
+    return this.counts.get(id);
+  }
+
+  onCount(listener: (id: string, count: number) => void): void {
+    this.countListeners.push(listener);
+  }
+}
+
+/** The choice kept in the browser: the layers named with a yes or no; nothing else. */
+function readKept(storage: ViewStorage | undefined): Record<string, boolean> {
+  try {
+    const read = JSON.parse(storage?.getItem(LAYERS_KEY) ?? '{}') as unknown;
+    if (typeof read !== 'object' || read === null || Array.isArray(read)) return {};
+    return Object.fromEntries(
+      Object.entries(read).filter(
+        (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
+      ),
+    );
+  } catch {
+    return {};
+  }
+}
diff --git a/src/web/client/layers-ui.ts b/src/web/client/layers-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a5708af04809a60a14e94103bb9aaa056aa56580
--- /dev/null
+++ b/src/web/client/layers-ui.ts
@@ -0,0 +1,225 @@
+import type { LayerRegistry, LayerSpec } from './layer-registry.js';
+
+/**
+ * The layer controls of the live map (plan 8M-7), over the registry: on the desktop a row in the
+ * header with the live layers as labelled toggles and the background ones under "More"; on a
+ * phone (narrower than 768 pixels, `map.css`) a "Layers · n" button (n the layers on) that opens
+ * a bottom sheet listing every layer with a switch, a line about it and how many of its things
+ * are in view. Both follow the registry, so a toggle anywhere shows everywhere. A layer of members
+ * only (PokéStops, Power Spots) is offered once `/api/me` says the visitor is one (`refresh`).
+ */
+export interface LayerControls {
+  /** Draws the controls anew: who asks, or which layers are offered, changed. */
+  refresh(member: boolean): void;
+}
+
+/** "Layers · 3". */
+export function layersButtonLabel(on: number): string {
+  return `Layers · ${on}`;
+}
+
+/** "4 in view", or nothing before the layer said. */
+export function inViewWords(count: number | undefined): string {
+  return count === undefined ? '' : `${count} in view`;
+}
+
+/** A layer's switch is named by its layer, for a screen reader (fix round 1). */
+export function switchLabel(spec: LayerSpec): string {
+  return spec.name;
+}
+
+/** Whether the desktop's "More" closes: on Escape, and on a click outside it. */
+export function moreCloses(event: { key?: string; clickInside?: boolean }): boolean {
+  if (event.key !== undefined) return event.key === 'Escape';
+  return event.clickInside === false;
+}
+
+/** What `SheetFocus` needs of an element: to take the focus. */
+interface Focusable {
+  focus(): void;
+}
+
+/**
+ * The phone's sheet of layers as a dialog for the keyboard (fix round 1): opening it moves the
+ * focus into it (its first switch), Escape closes it, and closing gives the focus back to what
+ * opened it (the "Layers · n" button).
+ */
+export class SheetFocus {
+  private opener: Focusable | undefined;
+
+  constructor(
+    private readonly sheet: { hidden: boolean | string },
+    private readonly first: () => Focusable | null,
+  ) {}
+
+  open(opener: Focusable): void {
+    this.opener = opener;
+    this.sheet.hidden = false;
+    this.first()?.focus();
+  }
+
+  close(): void {
+    if (this.sheet.hidden === true) return;
+    this.sheet.hidden = true;
+    this.opener?.focus();
+    this.opener = undefined;
+  }
+
+  /** A key pressed anywhere: true when it was the sheet's (Escape while it is open). */
+  key(key: string): boolean {
+    if (key !== 'Escape' || this.sheet.hidden === true) return false;
+    this.close();
+    return true;
+  }
+}
+
+export function showLayerControls(registry: LayerRegistry, nav: HTMLElement): LayerControls {
+  let member = false;
+  const sheet = document.createElement('div');
+  sheet.className = 'sheet-wrap';
+  sheet.hidden = true;
+  document.body.append(sheet);
+
+  const toggle = (id: string, on: boolean): void => {
+    registry.set(id, on);
+  };
+
+  const chip = (spec: LayerSpec): HTMLButtonElement => {
+    const button = document.createElement('button');
+    button.type = 'button';
+    button.className = 'chip';
+    button.dataset.layer = spec.id;
+    const dot = document.createElement('span');
+    dot.className = 'dot';
+    const name = document.createElement('span');
+    name.textContent = spec.name;
+    button.append(dot, name);
+    button.addEventListener('click', () => {
+      toggle(spec.id, !registry.isOn(spec.id));
+    });
+    return button;
+  };
+
+  const checkbox = (spec: LayerSpec, role?: 'switch'): HTMLInputElement => {
+    const input = document.createElement('input');
+    input.type = 'checkbox';
+    input.dataset.layer = spec.id;
+    if (role) input.setAttribute('role', role);
+    // Named by its layer, for a screen reader (not only on or off).
+    input.setAttribute('aria-label', switchLabel(spec));
+    input.addEventListener('change', () => {
+      toggle(spec.id, input.checked);
+    });
+    return input;
+  };
+
+  const sync = (): void => {
+    for (const element of document.querySelectorAll<HTMLElement>('[data-layer]')) {
+      const id = element.dataset.layer ?? '';
+      const on = registry.isOn(id);
+      if (element instanceof HTMLInputElement) element.checked = on;
+      else element.setAttribute('aria-pressed', String(on));
+    }
+    for (const button of nav.querySelectorAll<HTMLElement>('.layers-button')) {
+      button.textContent = layersButtonLabel(registry.countOn(member));
+    }
+  };
+
+  const counted = (): void => {
+    for (const line of sheet.querySelectorAll<HTMLElement>('[data-count]')) {
+      line.textContent = inViewWords(registry.count(line.dataset.count ?? ''));
+    }
+  };
+
+  const draw = (): void => {
+    const offered = registry.layers().filter((spec) => registry.offered(spec, member));
+    const chips = document.createElement('span');
+    chips.className = 'chips';
+    chips.append(...offered.filter((spec) => spec.kind === 'live').map(chip));
+    const more = document.createElement('details');
+    more.className = 'more';
+    const summary = document.createElement('summary');
+    summary.textContent = 'More';
+    const menu = document.createElement('div');
+    menu.className = 'menu';
+    for (const spec of offered.filter((one) => one.kind === 'background')) {
+      const label = document.createElement('label');
+      const name = document.createElement('span');
+      name.textContent = spec.name;
+      label.append(checkbox(spec), name);
+      menu.append(label);
+    }
+    more.append(summary, menu);
+    const phone = document.createElement('button');
+    phone.type = 'button';
+    phone.className = 'layers-button';
+    phone.setAttribute('aria-haspopup', 'dialog');
+    phone.addEventListener('click', () => {
+      focus.open(phone);
+    });
+    nav.replaceChildren(chips, more, phone);
+
+    const scrim = document.createElement('div');
+    scrim.className = 'scrim';
+    scrim.addEventListener('click', () => {
+      focus.close();
+    });
+    const panel = document.createElement('div');
+    panel.className = 'sheet';
+    panel.setAttribute('role', 'dialog');
+    panel.setAttribute('aria-label', 'Layers');
+    panel.setAttribute('aria-modal', 'true');
+    const heading = document.createElement('h2');
+    heading.textContent = 'Layers';
+    panel.append(heading);
+    for (const spec of offered) {
+      const row = document.createElement('label');
+      row.className = 'sheet-row';
+      row.dataset.kind = spec.id;
+      const words = document.createElement('span');
+      words.className = 'words';
+      const name = document.createElement('span');
+      name.className = 'name';
+      name.textContent = spec.name;
+      const small = document.createElement('small');
+      small.textContent = spec.hint ?? '';
+      const count = document.createElement('small');
+      count.dataset.count = spec.id;
+      words.append(name, ...(spec.hint ? [small] : []), count);
+      row.append(words, checkbox(spec, 'switch'));
+      panel.append(row);
+    }
+    const done = document.createElement('button');
+    done.type = 'button';
+    done.className = 'press primary sheet-done';
+    done.textContent = 'Done';
+    done.addEventListener('click', () => {
+      focus.close();
+    });
+    panel.append(done);
+    sheet.replaceChildren(scrim, panel);
+    sync();
+    counted();
+  };
+
+  const focus = new SheetFocus(sheet, () => sheet.querySelector<HTMLElement>('input, button'));
+  document.addEventListener('keydown', (event) => {
+    if (focus.key(event.key)) return;
+    const more = nav.querySelector('details');
+    if (more?.open && moreCloses({ key: event.key })) more.open = false;
+  });
+  document.addEventListener('click', (event) => {
+    const more = nav.querySelector('details');
+    const inside = event.target instanceof Node && more?.contains(event.target) === true;
+    if (more?.open && moreCloses({ clickInside: inside })) more.open = false;
+  });
+  registry.onChange(sync);
+  registry.onCount(counted);
+  draw();
+  return {
+    refresh(next) {
+      member = next;
+      draw();
+    },
+  };
+}
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 2912d236038d57ae0f0f5acfcaed289dc5ee94d5..f40ba1456c63f772e4e9d6231a42eb5b5ffedb8b 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -1,121 +1,132 @@
 import * as L from 'leaflet';
 import type { GeoView } from '../../domain/web/geo-data.js';
 import { addTiles, byId, getJson, say, showAccount, tileSetting } from './common.js';
-import { gymFilter } from './filter.js';
+import { showGymDots, type GymDots } from './gyms-ui.js';
+import { LayerRegistry, MAP_LAYERS, regionLabelsShown } from './layer-registry.js';
+import { showLayerControls } from './layers-ui.js';
 import { loginNotice } from './notice.js';
-import { GYM_DOT, gymClicks, showParties } from './party-layer.js';
-import { gymPopup, regionLabel, renderNode, type MapGym } from './popup.js';
-import { heldContent } from './raid-forms.js';
+import { showParties } from './party-layer.js';
+import { quietLine, showPlaces } from './places-ui.js';
+import { regionLabel, renderNode, type MapGym } from './popup.js';
 import { onThemeChange, theme } from './theme.js';
-import { BOUNDS_VISCOSITY, placeTheMap } from './view-ui.js';
+import { BOUNDS_VISCOSITY, browserStorage, placeTheMap } from './view-ui.js';
 import { showWhereYouAre, type You } from './you-ui.js';
 
 /**
  * The map page (spec 3.1), bundled by `scripts/web/build.ts`: Leaflet with the tiles of
  * `layers.ts`, the server's regions labelled with their channels, its gyms as dots with a popup
- * each, a filter box, and the header with the login;
- * for a member, the server's parties (`party-layer.ts`, plan 8M-3).
+ * each (clustered when zoomed out), a filter box, and the header with the login and the layers
+ * (plan 8M-7: everything drawn is a layer of `LayerRegistry` the member toggles);
+ * for a member, the server's parties (`party-layer.ts`, plan 8M-3) and the PokéStops and Power
+ * Spots of the view from street level (`places-ui.ts`).
  * Everything from data is set as text (`renderNode`, `textContent`): Leaflet sets string
  * content of tooltips, popups and attributions as HTML, so data goes to it as nodes.
  */
 
-/** From this zoom on the regions' names are shown. */
-const LABEL_ZOOM = 12;
+/**
+ * The pane of the regions' names: under the overlay pane (400) of the outlines and of the gyms',
+ * stops' and spots' circles, and under the markers (600): a name never covers a place (round 2).
+ */
+const LABELS_PANE = 'region-labels';
+const LABELS_PANE_Z = 350;
 
 /**
  * What a gym's popup shows beyond the gym itself, once the page knows who is asking: "Report raid"
  * (plan 8M-4) and "Report spawn here" (plan 8M-4S) for a member, and whether a form is open (the
  * popup's content is held then: `heldContent`), and in route mode a click that adds the gym as
- * a stop instead of opening its popup (plan 8M-5). Nothing until then.
+ * a stop instead of opening its popup (plan 8M-5); whether every gym must be drawn (route mode,
+ * a place picked: plan 8M-7). Nothing until then.
  */
 const gymExtras: {
   of: (gym: MapGym) => HTMLElement[];
   editing: () => boolean;
   clicked: (gym: MapGym) => boolean;
-} = { of: () => [], editing: () => false, clicked: () => false };
+  forced: () => boolean;
+} = { of: () => [], editing: () => false, clicked: () => false, forced: () => false };
 
 /**
- * Shows the regions and gyms; gives the gyms by id, where the parties are put, the regions'
- * names by id, and the regions with their outlines (where a point of the map lies).
+ * Shows the regions (the layer Region outlines) and the gyms (the layer Gyms); gives the gyms by
+ * id, where the parties are put, the regions' names by id, the regions with their outlines
+ * (where a point of the map lies), and the gyms' layer.
  */
 async function showGeo(
   map: L.Map,
   guild: string,
   you: You,
+  registry: LayerRegistry,
 ): Promise<{
   gyms: Map<number, MapGym>;
   names: Map<number, string>;
   regions: GeoView['regions'];
+  dots: GymDots;
 }> {
   const view = await getJson<GeoView>(`/s/${guild}/api/geo`);
   const names = new Map(view.regions.map((region) => [region.id, region.name]));
   const regions = L.featureGroup();
+  // The regions' names on a pane of their own under the markers, taking no clicks: a label never
+  // covers a raid or a gym (fix round 1). Leaflet sets the pane's place by its style from the script.
+  const labelsPane = map.createPane(LABELS_PANE);
+  labelsPane.style.zIndex = String(LABELS_PANE_Z);
+  labelsPane.style.pointerEvents = 'none';
   const outlines = view.regions.map((region) =>
     L.polygon(region.outline, { color: theme().colours.region, weight: 2, fillOpacity: 0.05 })
       .bindTooltip(renderNode(regionLabel(region.name), document), {
         permanent: true,
         direction: 'center',
         className: 'region-label',
+        pane: LABELS_PANE,
       })
       .addTo(regions),
   );
-  regions.addTo(map);
-  const dots = view.gyms.map((gym: MapGym) => ({
-    gym,
-    dot: L.circleMarker([gym.lat, gym.lon], {
-      ...GYM_DOT,
-      color: theme().colours.gym,
-      fillOpacity: 0.8,
-    }).bindPopup(
-      heldContent(
-        () => {
-          const popup = renderNode(gymPopup(gym, names), document);
-          popup.append(...gymExtras.of(gym));
-          return popup;
-        },
-        () => gymExtras.editing(),
-      ),
-    ),
-  }));
-  for (const { gym, dot } of dots) {
-    // In route mode a click (or Enter) adds the gym as a stop: its popup is not opened.
-    gymClicks(dot, () => gymExtras.clicked(gym));
-  }
-  const gyms = L.featureGroup(dots.map(({ dot }) => dot)).addTo(map);
+  // The layer Region outlines, their labels with them.
+  if (registry.isOn('outlines')) regions.addTo(map);
+  registry.onChange((id, on) => {
+    if (id !== 'outlines') return;
+    if (on) regions.addTo(map);
+    else regions.remove();
+  });
+  const outlinesInView = (): void => {
+    const shown = map.getBounds();
+    registry.setCount(
+      'outlines',
+      outlines.filter((outline) => shown.intersects(outline.getBounds())).length,
+    );
+  };
+  map.on('moveend', outlinesInView);
   // The device changed between light and dark (plan 8M-7): what Leaflet drew takes the new set.
   onThemeChange(({ colours }) => {
     for (const outline of outlines) outline.setStyle({ color: colours.region });
-    for (const { dot } of dots) dot.setStyle({ color: colours.gym });
   });
+
+  const dots = showGymDots({
+    map,
+    gyms: view.gyms,
+    names,
+    registry,
+    filter: byId('filter') as HTMLInputElement,
+    extras: (gym) => gymExtras.of(gym),
+    editing: () => gymExtras.editing(),
+    clicked: (gym) => gymExtras.clicked(gym),
+    forced: () => gymExtras.forced(),
+  });
+
   // Where the map starts, and how far it may go (plan 8M-7).
-  placeTheMap(map, guild, view.regions, gyms.getBounds(), you, say);
+  const gymsBox = L.latLngBounds(view.gyms.map((gym) => [gym.lat, gym.lon]));
+  placeTheMap(map, guild, view.regions, gymsBox, you, say);
+  dots.refresh();
+  outlinesInView();
 
   const labels = (): void => {
-    map.getContainer().classList.toggle('labels-hidden', map.getZoom() < LABEL_ZOOM);
+    map.getContainer().classList.toggle('labels-hidden', !regionLabelsShown(map.getZoom()));
   };
   map.on('zoomend', labels);
   labels();
-
-  const filter = byId('filter') as HTMLInputElement;
-  const shown = (): typeof dots => dots.filter(({ gym }) => gymFilter(filter.value)(gym));
-  filter.addEventListener('input', () => {
-    const keep = new Set(shown().map(({ gym }) => gym.id));
-    for (const { gym, dot } of dots) {
-      if (keep.has(gym.id)) gyms.addLayer(dot);
-      else gyms.removeLayer(dot);
-    }
-  });
-  filter.addEventListener('keydown', (event) => {
-    if (event.key !== 'Enter') return;
-    const matches = shown();
-    if (matches.length === 0) return;
-    map.fitBounds(L.latLngBounds(matches.map(({ gym }) => [gym.lat, gym.lon])), {
-      maxZoom: 17,
-      padding: [40, 40],
-    });
-    if (matches.length === 1) matches[0]?.dot.openPopup();
-  });
-  return { gyms: new Map(view.gyms.map((gym) => [gym.id, gym])), names, regions: view.regions };
+  return {
+    gyms: new Map(view.gyms.map((gym) => [gym.id, gym])),
+    names,
+    regions: view.regions,
+    dots,
+  };
 }
 
 function start(): void {
@@ -128,21 +139,32 @@ function start(): void {
     say(notice.text);
     history.replaceState(null, '', `${location.pathname}${notice.search}${location.hash}`);
   }
+  // The layers (plan 8M-7): the member's choice kept per browser.
+  const registry = new LayerRegistry(browserStorage());
+  for (const layer of MAP_LAYERS) registry.register(layer);
+  const controls = showLayerControls(registry, byId('layers'));
+  const quiet = quietLine(map);
   const account = showAccount(guild, data.login === 'discord' ? 'discord' : 'links', 'map');
   const you = showWhereYouAre(map, say);
-  showGeo(map, guild, you)
-    .then(async ({ gyms, names, regions }) => {
+  showGeo(map, guild, you, registry)
+    .then(async ({ gyms, names, regions, dots }) => {
       // The parties of the server for a member who is logged in (plan 8M-3); while Discord
       // cannot be reached the server says whether it still knows them as a member. A member
       // may report raids at gyms (plan 8M-4) and spawns at any point (plan 8M-4S), not while
       // the map is read-only: by `/api/me` at first, then by the list of parties at each draw.
       const me = await account;
-      if (!me.loggedIn || !(me.member || me.readOnly)) return;
+      const member = me.loggedIn && (me.member || me.readOnly);
+      controls.refresh(member);
+      showPlaces(map, guild, registry, quiet, () => member);
+      if (!me.loggedIn || !member) return;
       const mayReport = me.member && !me.readOnly;
-      const raids = showParties(map, guild, me, gyms, names, regions, mayReport);
+      const raids = showParties(map, guild, me, gyms, names, regions, mayReport, registry, () => {
+        dots.refresh();
+      });
       gymExtras.editing = () => raids.editing();
       gymExtras.of = (gym) => raids.gymControls(gym);
       gymExtras.clicked = (gym) => raids.gymClicked(gym);
+      gymExtras.forced = () => raids.forced();
     })
     .catch(() => {
       // Leaflet draws nothing until the map has a view.
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 8225a2190874a521e4e024fb6456a7aada2930dd..78e4d0c96ccc46e00fbbe0cd034343afe045e05e 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -142,6 +142,241 @@ a {
   }
 }
 
+/*
+ * The layers (plan 8M-7): on the desktop a row of toggles in the header, the background layers
+ * under "More"; narrower than 768 pixels a "Layers · n" button and a bottom sheet.
+ */
+#layers {
+  display: flex;
+  flex-wrap: wrap;
+  align-items: center;
+  gap: 6px;
+}
+
+#layers .chips {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 6px;
+}
+
+.chip {
+  display: inline-flex;
+  align-items: center;
+  gap: 6px;
+  padding: 4px 10px;
+  border: 1px solid var(--line);
+  border-radius: 16px;
+  background: var(--deep-bg);
+  color: var(--muted);
+  font: inherit;
+  font-size: 13px;
+  cursor: pointer;
+}
+
+.chip[aria-pressed='true'] {
+  border-color: var(--primary);
+  background: var(--chip-on-bg);
+  color: var(--text);
+}
+
+.chip .dot {
+  width: 9px;
+  height: 9px;
+  border-radius: 50%;
+  background: var(--muted);
+}
+
+.chip[data-layer='raids'] .dot {
+  background: var(--raid);
+}
+
+.chip[data-layer='trains'] .dot {
+  background: var(--train);
+}
+
+.chip[data-layer='meetups'] .dot {
+  background: var(--meetup);
+}
+
+#layers .more {
+  position: relative;
+}
+
+#layers .more summary {
+  padding: 4px 10px;
+  border: 1px solid var(--line);
+  border-radius: 16px;
+  background: var(--deep-bg);
+  color: var(--text);
+  font-size: 13px;
+  cursor: pointer;
+  list-style: none;
+}
+
+#layers .more summary::-webkit-details-marker {
+  display: none;
+}
+
+#layers .more .menu {
+  position: absolute;
+  z-index: 1100;
+  top: calc(100% + 6px);
+  left: 0;
+  display: flex;
+  flex-direction: column;
+  gap: 6px;
+  min-width: 180px;
+  padding: 10px 12px;
+  border-radius: var(--card-radius);
+  background: var(--card-bg);
+  box-shadow: 0 8px 24px var(--shadow);
+}
+
+#layers .more label {
+  display: flex;
+  align-items: center;
+  gap: 8px;
+  white-space: nowrap;
+  cursor: pointer;
+}
+
+.layers-button {
+  display: none;
+  padding: 6px 12px;
+  border: 0;
+  border-radius: 16px;
+  background: var(--secondary);
+  color: var(--secondary-text);
+  font: inherit;
+  font-weight: 600;
+  cursor: pointer;
+}
+
+.sheet-wrap {
+  position: fixed;
+  inset: 0;
+  z-index: 2000;
+}
+
+.sheet-wrap .scrim {
+  position: absolute;
+  inset: 0;
+  background: var(--scrim);
+}
+
+.sheet-wrap .sheet {
+  position: absolute;
+  left: 0;
+  right: 0;
+  bottom: 0;
+  max-height: 80vh;
+  overflow-y: auto;
+  padding: 12px 16px 16px;
+  border-radius: 16px 16px 0 0;
+  background: var(--page-bg);
+  color: var(--text);
+  box-shadow: 0 -4px 18px var(--shadow);
+}
+
+.sheet-wrap h2 {
+  margin: 0 0 6px;
+  font-size: 18px;
+}
+
+.sheet-row {
+  display: flex;
+  align-items: center;
+  gap: 12px;
+  padding: 9px 0;
+  border-bottom: 1px solid var(--line);
+  cursor: pointer;
+}
+
+.sheet-row .words {
+  flex: 1;
+  display: flex;
+  flex-direction: column;
+}
+
+.sheet-row small {
+  color: var(--muted);
+  font-size: 12px;
+}
+
+/* A switch, drawn from the checkbox itself. */
+.sheet-row input[role='switch'] {
+  appearance: none;
+  position: relative;
+  flex: none;
+  width: 40px;
+  height: 24px;
+  margin: 0;
+  border-radius: 12px;
+  background: var(--secondary);
+  cursor: pointer;
+}
+
+.sheet-row input[role='switch']::after {
+  content: '';
+  position: absolute;
+  top: 3px;
+  left: 3px;
+  width: 18px;
+  height: 18px;
+  border-radius: 50%;
+  background: var(--on-color);
+  transition: left 0.15s;
+}
+
+.sheet-row input[role='switch']:checked {
+  background: var(--success);
+}
+
+.sheet-row input[role='switch']:checked::after {
+  left: 19px;
+}
+
+.sheet-done {
+  width: 100%;
+  margin-top: 12px;
+  padding: 8px 12px;
+}
+
+@media (max-width: 767px) {
+  #layers .chips,
+  #layers .more {
+    display: none;
+  }
+
+  .layers-button {
+    display: inline-block;
+  }
+}
+
+/* A cluster of gyms (plan 8M-7): a circle with its count; a tap zooms in on it. */
+.cluster {
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  border: 3px solid var(--cluster-edge);
+  border-radius: 50%;
+  background: var(--cluster);
+  background-clip: padding-box;
+  color: var(--on-color);
+  font-size: 12px;
+  font-weight: 700;
+}
+
+/* The quiet line at the bottom of the map: "Zoom in to see every PokéStop here." */
+.quiet-line {
+  margin: 0 0 4px;
+  padding: 2px 8px;
+  border-radius: var(--radius);
+  background: var(--label-bg);
+  color: var(--muted);
+  font-size: 12px;
+}
+
 #notice,
 #read-only {
   margin: 0;
@@ -448,9 +683,11 @@ a {
 }
 
 .region-label {
+  padding: 1px 5px;
   background: var(--label-bg);
   border: 0;
   box-shadow: none;
+  font-size: 12px;
   font-weight: 600;
   color: var(--region-label);
 }
diff --git a/src/web/client/party-layer.isolated.test.ts b/src/web/client/party-layer.isolated.test.ts
index 73d63d7c548d76f417c3248f6f785b1687b3d203..f81ba1a88e7c7faef6f8d5cfc365a71f4f82710b 100644
--- a/src/web/client/party-layer.isolated.test.ts
+++ b/src/web/client/party-layer.isolated.test.ts
@@ -8,6 +8,7 @@ import {
   showParties,
   trainMarker,
 } from './party-layer.js';
+import { LayerRegistry } from './layer-registry.js';
 
 // Leaflet reads the browser's `window` as it loads: what `gymClicks` uses of it is how an event
 // is stopped, recorded here; what `showParties` uses of it as it starts is a layer group added to
@@ -230,6 +231,8 @@ describe("the map's popups (showParties)", () => {
       new Map(),
       [],
       false,
+      new LayerRegistry(undefined),
+      () => undefined,
     );
     /** Leaflet fires an event on the map. */
     const fire = (type: string, event: unknown) => {
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 9a9f6154cd47a6fa22b1771d5c286df82845be34..4d78e36f746b26a9f2683c2866cd793622255336 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -34,6 +34,7 @@ import {
 } from './train-forms.js';
 import { trainUi } from './train-ui.js';
 import { onThemeChange, theme } from './theme.js';
+import type { LayerRegistry } from './layer-registry.js';
 
 /**
  * The parties on the live map for a member (plan 8M-3, spec 3.2 to 3.4): one marker per gym
@@ -140,6 +141,11 @@ export interface MapRaids {
    * arranged, and true says its popup is not wanted (plan 8M-5).
    */
   gymClicked(gym: MapGym): boolean;
+  /**
+   * A gym is to be clicked (route mode, a meetup's place picked): the map draws every gym,
+   * whatever the Gyms layer (plan 8M-7).
+   */
+  forced(): boolean;
 }
 
 /**
@@ -189,8 +195,37 @@ export function showParties(
   regionNames: ReadonlyMap<number, string>,
   regions: GeoView['regions'],
   mayReport: boolean,
+  registry: LayerRegistry,
+  afterDraw: () => void,
 ): MapRaids {
-  const layer = L.layerGroup().addTo(map);
+  // One group per layer of the registry (plan 8M-7): on the map while the layer is on.
+  const groups = { raids: L.layerGroup(), trains: L.layerGroup(), meetups: L.layerGroup() };
+  for (const [id, group] of Object.entries(groups)) {
+    if (registry.isOn(id)) group.addTo(map);
+  }
+  registry.onChange((id, on) => {
+    const group = (groups as Record<string, L.LayerGroup | undefined>)[id];
+    if (!group) return;
+    if (on) group.addTo(map);
+    else group.remove();
+    counted();
+  });
+  /** How many of each layer's things are in view, for the sheet of the layers. */
+  const counted = (): void => {
+    const view = map.getBounds();
+    for (const [id, group] of Object.entries(groups)) {
+      let count = 0;
+      group.eachLayer((layer) => {
+        if (
+          (layer instanceof L.Marker || layer instanceof L.CircleMarker) &&
+          view.contains(layer.getLatLng())
+        )
+          count += 1;
+      });
+      registry.setCount(id, count);
+    }
+  };
+  map.on('moveend', counted);
   // Leaflet sets the pane's place by its style from the script (no style element).
   map.createPane(RING_PANE).style.zIndex = String(RING_PANE_Z);
   // The rings are SVG whatever the map prefers: a canvas takes a click inside an unfilled circle
@@ -330,7 +365,7 @@ export function showParties(
   const redraw = (next: PartiesView): void => {
     view = next;
     const reopen = showing.key;
-    layer.clearLayers();
+    for (const group of Object.values(groups)) group.clearLayers();
     popups.clear();
     const { atGyms, elsewhere } = raidsAtGyms(next.raids, (id) => gyms.has(id));
     for (const [gymId, raids] of atGyms) {
@@ -346,7 +381,7 @@ export function showParties(
         (marker) =>
           withPopup(marker, `gym:${gymId}`, () => gymRaidsPopup(gymId, raids, context(), extras)),
         () => gymClicked(gym),
-      ).addTo(layer);
+      ).addTo(groups.raids);
     }
     // Trains the map cannot draw (no route yet, or none of its gyms on the map) are listed; the
     // train being routed is left to route mode, which draws its stops as they are edited.
@@ -374,7 +409,7 @@ export function showParties(
         }),
         `meetup:${meetup.id}`,
         () => meetupPopup(meetup, context(), meetupActions(meetup)),
-      ).addTo(layer);
+      ).addTo(groups.meetups);
     }
     for (const train of drawn.trains) {
       // Through its gyms and the power spots its data gives (plan 8X-4).
@@ -394,7 +429,7 @@ export function showParties(
           ),
           `route:${train.id}`,
           popup,
-        ).addTo(layer);
+        ).addTo(groups.trains);
       }
       // A ring around the stop it is at (or its first stop before it starts): a gym's own marker
       // inside it stays a marker to click (plan 8S-4).
@@ -403,7 +438,7 @@ export function showParties(
           trainMarker(ring.at, ring.here, interactive, theme().colours.train, rings),
           `train:${train.id}`,
           popup,
-        ).addTo(layer);
+        ).addTo(groups.trains);
       }
     }
     const items = [
@@ -431,6 +466,9 @@ export function showParties(
     readOnly.hidden = line === undefined;
     // Drawn under a form of the trains' box: the controls that open another form stay off.
     if (hold.editing) formControls(document, false);
+    counted();
+    // The gyms follow: route mode or a place picked shows every gym (plan 8M-7).
+    afterDraw();
     if (reopen !== undefined) popups.get(reopen)?.openPopup();
   };
 
@@ -714,5 +752,6 @@ export function showParties(
         : [],
     editing: () => hold.editing,
     gymClicked: (gym) => gymClicked(gym),
+    forced: () => trainForms.routing() !== undefined || meetupForms.picking(),
   };
 }
diff --git a/src/web/client/places-ui.ts b/src/web/client/places-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0fecf230f6a5824a763ac91107bc61486fd2f1e6
--- /dev/null
+++ b/src/web/client/places-ui.ts
@@ -0,0 +1,156 @@
+import * as L from 'leaflet';
+import type { PowerSpotsView } from '../../domain/web/max-data.js';
+import type { StopsView } from '../../domain/web/meetup-data.js';
+import { PlacesInView, placesWanted } from './cluster.js';
+import { getJson } from './common.js';
+import type { LayerRegistry } from './layer-registry.js';
+import { StopLoads, stopsBox } from './meetup-forms.js';
+import { renderNode } from './popup.js';
+import { onThemeChange, theme, type DrawnColour } from './theme.js';
+
+/**
+ * The PokéStops and Power Spots layers of the live map (plan 8M-7): for a member, from street
+ * level (`PLACES_FROM`), those of the view are asked for through the existing `/api/stops` and
+ * `/api/powerspots` (the box kept to the world, `stopsBox`) at once and again 300 ms after the map
+ * rests (`StopLoads`, only the last question's answer shown), drawn as small dots with their name
+ * in a popup (Power Spots' popups say no more until plan 8M-9); "more than shown" is told in one
+ * quiet line at the bottom of the map. Logged out the layers are not offered.
+ */
+
+/** The quiet line at the bottom of the map: one sentence per layer that has more than it shows. */
+export interface QuietLine {
+  set(id: string, text: string | undefined): void;
+}
+
+/** The words of the quiet line for a layer with more places in view than it shows. */
+export const MORE_THAN_SHOWN: Readonly<Record<'stops' | 'spots', string>> = {
+  stops: 'Zoom in to see every PokéStop here.',
+  spots: 'Zoom in to see every Power Spot here.',
+};
+
+export function quietLine(map: L.Map): QuietLine {
+  const lines = new Map<string, string>();
+  const line = document.createElement('p');
+  line.className = 'quiet-line';
+  line.hidden = true;
+  const control = new L.Control({ position: 'bottomleft' });
+  control.onAdd = () => line;
+  control.addTo(map);
+  return {
+    set(id, text) {
+      if (text === undefined) lines.delete(id);
+      else lines.set(id, text);
+      line.textContent = [...lines.values()].join(' ');
+      line.hidden = lines.size === 0;
+    },
+  };
+}
+
+interface PlacesLayer {
+  id: 'stops' | 'spots';
+  url: (guild: string) => string;
+  colour: DrawnColour;
+  read: (answer: unknown) => StopsView;
+}
+
+const LAYERS: readonly PlacesLayer[] = [
+  {
+    id: 'stops',
+    url: (guild) => `/s/${guild}/api/stops`,
+    colour: 'stop',
+    read: (answer) => answer as StopsView,
+  },
+  {
+    id: 'spots',
+    url: (guild) => `/s/${guild}/api/powerspots`,
+    colour: 'powerSpot',
+    read: (answer) => {
+      const view = answer as PowerSpotsView;
+      return { stops: view.spots, more: view.more };
+    },
+  },
+];
+
+export function showPlaces(
+  map: L.Map,
+  guild: string,
+  registry: LayerRegistry,
+  quiet: QuietLine,
+  member: () => boolean,
+): { refresh(): void } {
+  const checks: Array<() => void> = [];
+  for (const layer of LAYERS) {
+    const group = L.layerGroup().addTo(map);
+    const loads = new StopLoads({
+      load: async () => {
+        const bounds = map.getBounds();
+        const box = stopsBox({
+          south: bounds.getSouth(),
+          west: bounds.getWest(),
+          north: bounds.getNorth(),
+          east: bounds.getEast(),
+        });
+        const query = new URLSearchParams({
+          south: String(box.south),
+          west: String(box.west),
+          north: String(box.north),
+          east: String(box.east),
+        });
+        return layer.read(await getJson<unknown>(`${layer.url(guild)}?${query.toString()}`));
+      },
+      show: (view) => {
+        group.clearLayers();
+        const colour = theme().colours[layer.colour];
+        for (const [, lat, lon, title] of view.stops) {
+          L.circleMarker([lat, lon], { radius: 5, weight: 2, color: colour, fillOpacity: 0.7 })
+            // The name as text of an element of ours: Leaflet sets a string as HTML.
+            .bindPopup(
+              renderNode({ tag: 'strong', className: 'place-name', text: title }, document),
+            )
+            .addTo(group);
+        }
+        registry.setCount(layer.id, view.stops.length);
+      },
+      more: (more) => {
+        quiet.set(layer.id, more ? MORE_THAN_SHOWN[layer.id] : undefined);
+      },
+      failed: () => undefined,
+      delayMs: 300,
+      setTimer: (run, ms) => {
+        const timer = window.setTimeout(run, ms);
+        return () => {
+          window.clearTimeout(timer);
+        };
+      },
+    });
+    const places = new PlacesInView({
+      loads,
+      clear: () => {
+        group.clearLayers();
+        quiet.set(layer.id, undefined);
+        registry.setCount(layer.id, 0);
+      },
+    });
+    const wanted = (): boolean => placesWanted(registry.isOn(layer.id), map.getZoom(), member());
+    map.on('moveend', () => {
+      places.changed(wanted(), true);
+    });
+    registry.onChange((id) => {
+      if (id === layer.id) places.changed(wanted());
+    });
+    onThemeChange((drawn) => {
+      group.eachLayer((marker) => {
+        if (marker instanceof L.CircleMarker)
+          marker.setStyle({ color: drawn.colours[layer.colour] });
+      });
+    });
+    checks.push(() => {
+      places.changed(wanted());
+    });
+  }
+  const refresh = (): void => {
+    for (const check of checks) check();
+  };
+  refresh();
+  return { refresh };
+}
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index fbbc8d4620ec3e53f8dab131cdf3ed7c15f8d069..a81825c9866f4528ee037a58bae1a0d104390220 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -61,6 +61,9 @@
   --stop-number-bg: #ffffff;
   --stop-number-text: #6b2a00;
   --stop-number-here-text: #ffffff;
+  /* A cluster of gyms: its circle and the paler ring round it. */
+  --cluster: rgba(79, 84, 92, 0.9);
+  --cluster-edge: rgba(79, 84, 92, 0.35);
   /* The side bar of a card, by what it is. */
   --accent: #5865f2;
 
@@ -157,6 +160,8 @@
     --stop-number-bg: #2b2d31;
     --stop-number-text: #ffb37a;
     --stop-number-here-text: #ffffff;
+    --cluster: rgba(128, 132, 142, 0.9);
+    --cluster-edge: rgba(128, 132, 142, 0.35);
     --accent: #5865f2;
 
     --gym: #3ba55c;
diff --git a/src/web/page.test.ts b/src/web/page.test.ts
index 8a592de6d056f67d9e20c2d15643e59ea299064c..47b75b5e54b1518f4c7761255418729ff4f4cf6d 100644
--- a/src/web/page.test.ts
+++ b/src/web/page.test.ts
@@ -75,6 +75,8 @@ describe('the map page', () => {
       'data-tiles': 'osm',
       'data-login': 'discord',
     });
+    // The row of the layers (plan 8M-7), which the script fills.
+    expect(page.body).toContain('<nav id="layers" aria-label="Layers"></nav>');
     // The side panel of the meetups (plan 8M-3), hidden until a member's parties are shown.
     expect(page.body).toContain(
       '<div id="content"><main id="map" aria-label="Map"></main>' +
diff --git a/src/web/page.ts b/src/web/page.ts
index d2d964ad88d8032d64b7b465b9283d4a7180f4e1..2d5df18213a597cff2011112712e92131882530c 100644
--- a/src/web/page.ts
+++ b/src/web/page.ts
@@ -121,6 +121,7 @@ export function mapPage(data: MapPageData, assets: AssetManifest): string {
     `<body ${bodyAttributes(data)}>`,
     // Narrower than 768 pixels the title is "Pine" (`map.css`, fix round 1).
     '<header id="header"><span class="title"><span class="title-first">Professor </span>Pine</span>',
+    '<nav id="layers" aria-label="Layers"></nav>',
     '<input id="filter" type="search" placeholder="Find a gym" aria-label="Find a gym">',
     '<span id="account"></span></header>',
     '<p id="notice" hidden></p><p id="read-only" role="status" hidden></p>',
````

### Task 5: 8M-7 task 5: raid markers, and several things at one place

Prototype commit: `8fa7bb5f14d647eaffd91e9392528ec30185a7f2`

A raid is a circle centered on its gym: the boss or egg picture in a ring of its
tier's color, a time badge under it ("12m", "hatches 2:40"), a green count of
those going (+1s counted), dimmed in its last five minutes; badges and dimming
stay current between lists. A gym with a raid shows the raid, not its dot. Where
more than one shown thing sits at one place (the same gym, or within a few
pixels), a tap lists each with picture, name and time, and a choice opens its
own popup; this replaces the tap on a ring's line.

**Files:**

```
 docs/architecture/web.md                                |   6 ++--
 src/domain/party/lobby.test.ts                          |   5 ++-
 src/domain/party/party.ts                               |  22 ++++++++++--
 src/domain/party/raid-stage.test.ts                     |  35 +++++++++++++++++++
 src/domain/party/raid-stage.ts                          |  28 +++++++++++++++
 src/domain/party/raid.ts                                |  15 +++++---
 src/domain/pogo/raid-tier.test.ts                       |  26 ++++++++++++++
 src/domain/pogo/raid-tier.ts                            |  23 ++++++++++++
 src/domain/time/ending-soon.test.ts                     |  14 ++++++++
 src/domain/time/ending-soon.ts                          |  12 +++++++
 src/domain/time/max-end.ts                              |  13 +++----
 src/domain/web/party-data.ts                            |  20 +++++++++++
 src/domain/web/party-view.test.ts                       |  13 +++++++
 src/domain/web/party-view.ts                            |  16 +++++++--
 src/render/raid-post.test.ts                            |   8 +++--
 src/render/raid-post.ts                                 |  18 ++++++++--
 src/web/client/gyms-ui.ts                               |  18 ++++++++--
 src/web/client/main.ts                                  |  23 +++++++++++-
 src/web/client/map.css                                  | 144 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/meetup-forms.test.ts                     |   8 ++++-
 src/web/client/parties.test.ts                          |  14 ++++++++
 src/web/client/parties.ts                               |  14 +++++---
 src/web/client/party-layer-contextmenu.isolated.test.ts |  19 +++++-----
 src/web/client/party-layer.ts                           | 261 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++------------------------
 src/web/client/raid-forms.test.ts                       |   3 ++
 src/web/client/raid-marker.test.ts                      | 186 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/raid-marker.ts                           | 202 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/shared-place.test.ts                     |  85 ++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/shared-place.ts                          |  88 ++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/theme.css                                |  22 ++++++++++++
 src/web/client/theme.test.ts                            |  12 ++++++-
 src/web/client/theme.ts                                 |  27 +++++++++++++-
 src/web/client/train-forms.test.ts                      |   1 +
 src/web/client/train-ui.isolated.test.ts                |   1 +
 src/web/page-imports.test.ts                            |  69 ++++++++++++++++++++++++++++++++++++
 src/web/raid-marker-tiers.test.ts                       |  31 +++++++++++++++++
 36 files changed, 1408 insertions(+), 94 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/party/lobby.test.ts src/domain/party/raid-stage.test.ts src/domain/pogo/raid-tier.test.ts src/domain/time/ending-soon.test.ts src/domain/web/party-view.test.ts src/render/raid-post.test.ts src/web/client/meetup-forms.test.ts src/web/client/parties.test.ts src/web/client/party-layer-contextmenu.isolated.test.ts src/web/client/raid-forms.test.ts src/web/client/raid-marker.test.ts src/web/client/shared-place.test.ts src/web/client/theme.test.ts src/web/client/train-forms.test.ts src/web/client/train-ui.isolated.test.ts src/web/page-imports.test.ts src/web/raid-marker-tiers.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 8fa7bb5f14d647eaffd91e9392528ec30185a7f2 -- src test scripts data docs/architecture docs/guides docs/web-setup.md docs/superpowers/plans/phase-0-follow-ups.md CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-7 task 5: raid markers, and several things at one place`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index f839f92db24c8f545425e60f64c30d3f5e056a25..5d858f6945221830a3c11163a45d3250097d5c81 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -49,15 +49,17 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **Your location** (`you-ui.ts`, `showWhereYouAre`; words in `your-location.ts`): "Show where I am", a round button with a crosshair (SVG of ours, `currentColor`) at the bottom right, asks the browser only when pressed (`watchPosition`, high accuracy), draws a blue dot (`--you`, edged `--you-edge`, drawn colors of `theme.ts`) with a circle of its accuracy, centers the map on it at street level or closer, and keeps it current while the page is open; pressed again it centers on the dot. Refused or unavailable: one line under the header (`locationRefusal`: "Your browser did not share your location.", "Your location is not available just now.", or "This browser cannot share your location with this page." where there is no geolocation or the page is not a secure context; browsers count `http://localhost` as one), nothing else. `onMove` tells the list each new fix.
 - **Layers** (`layer-registry.ts`, `LayerRegistry`): everything drawn is a layer the member toggles, registered with a name, whether it is on by default, live (a toggle of its own on the desktop) or background (under "More"), a line about it, members only (`membersOnly`) or waiting for data (`waits`), and how many of its things are in view (`setCount`, which the parts that draw it keep current at each `moveend` and draw). One call adds a layer (`register`; field research and Team GO Rocket come so with 8M-9). The layers of `MAP_LAYERS`: Raids, Trains, Meetups (live, on), Wild spawns (off; it waits for data: no route lists spawns yet, so it is not offered until something calls `setOffered('spawns', true)`), Gyms (on until plan 8M-9's Report button exists: "Report raid" is in a gym's popup and reporting is a member's first job; 8M-9 turns it off, the controller's ruling of fix round 1), PokéStops, Power Spots (off), Region outlines (on). The choice is kept per browser, one for every server (`localStorage` `pine-map-layers`, `{ id: boolean }`, read and written in try/catch; a value that is no boolean is ignored, a layer the browser kept nothing of takes its default). The controls (`layers-ui.ts`): on the desktop a row in the header (`<nav id="layers">` of the template) with the live layers as labelled toggles (`aria-pressed`, a dot of the layer's color) and the background ones as checkboxes under "More" (a `<details>`); narrower than 768 pixels (`map.css`) a "Layers · n" button (`layersButtonLabel`, n the offered layers on) that opens a bottom sheet listing every offered layer with its line, how many are in view ("4 in view", `inViewWords`) and a switch (a checkbox `role="switch"`), Done and a tap on the scrim closing it; the sheet is a modal dialog for the keyboard (`SheetFocus`: `aria-modal`, the focus moved to its first switch, Escape closes it, the focus given back to the button), each switch named by its layer (`switchLabel`, `aria-label`), and "More" closes on Escape and on a click outside it (`moreCloses`). Logged out (or not a member), PokéStops and Power Spots are not offered (`offered(spec, member)`); the controls are drawn anew once `/api/me` answers (`refresh`).
 - **What each layer draws:** the parties' popups and markers as before (`party-layer.ts`), now in a group per layer (`raids`, `trains`, `meetups`) put on and taken off the map by the registry; the regions' outlines with their labels (`main.ts`; the labels on a pane of their own, `region-labels`, at 350 under the overlay pane of the outlines and of the gyms', stops' and spots' circles and under every marker (round 2), taking no clicks, in 12 px type, so that a name never covers a raid or a gym); the gyms (`gyms-ui.ts`, `showGymDots`) at every zoom, by Pine's grid clustering below zoom 16 (`cluster.ts`, `clustersAt`, `CLUSTER_BELOW`: the places of one 60-pixel cell of a grid fixed on the world are one cluster, drawn as a circle with its count at the middle of its places, `.cluster`, `--cluster`; a tap zooms in on it, at least two zooms and at most to 16; Leaflet.markercluster's last release is from 2020); what is drawn is worked out for the view and half its size round it (`wantedDots`, `DOTS_MARGIN`; keyed `gym:<id>` and `cluster:<cell>:<its gyms>`) and only the difference added or taken off at each move, list or change (`dotsDiff`): the gym whose popup is open is never taken off nor clustered while it is open (fix round 1); which gyms are drawn is `shownGyms` (`gym-dots.ts`): every gym while the Gyms layer is on, or while a gym is to be clicked (route mode, a meetup's place picked: `MapRaids.forced`, the gyms drawn anew after each draw of the parties), and while "Find a gym" holds a word those it matches whatever the layer (Enter fits the map to them and opens the one gym's popup once the map rests); the PokéStops and Power Spots of the view (`places-ui.ts`, `showPlaces`) for a member from zoom 16 (`placesWanted`, `PLACES_FROM`) through `/api/stops` and `/api/powerspots`, asked at once when wanted and again 300 ms after the map rests (`PlacesInView` over `StopLoads`: only the last question's answer shown, nothing after they are no longer wanted), small dots of `--stop` and `--power-spot` with the name in a popup, and "more than shown" in one quiet line at the bottom left of the map ("Zoom in to see every PokéStop here.", `MORE_THAN_SHOWN`, `quietLine`). Live things never cluster.
+- **Raid markers** (`raid-marker.ts`, frame B of the mockups): a circle centered on the gym (`raidMarkerNode`, drawn as an element of ours in a `divIcon`, `raidIcon`, 44 pixels): the post's picture (the boss, or the egg of its tier before it hatches) in a ring of its tier group's color (`MapRaid.tierGroup`, made by the domain's `raidTierGroup` of `src/domain/pogo/raid-tier.ts`: `1`, `3`, `5`, `mega` for Mega, Mega Legendary and Super Mega, `elite`, `shadow` for every shadow raid; `tierColour` names `--tier-<group>`; `raid-marker-tiers.test.ts` holds `theme.css` and `map.css` to every group of `RAID_TIER_GROUPS`), a time badge under it (`badgeFor`: "12m", "1h 05m" while it runs, "hatches 2:40" before the hatch, the posts' time by `clockTime` with AM or PM left out today only, "hatches Wed, Oct 14, 2:00 PM" another day; "egg" or "hatched" where nobody said when, "ended" by `stageAt`), and a green count of those going (`MapAttendance.going`, made by the domain's `goingCount` of `party.ts`: the committed heads of the whole party, coming, here and asked whether done, +1s counted, the lobbies' own rule that `lobbyCount` shares; none at zero). Raids shrink as the map zooms out and are still never grouped (Matt, 2026-10-25; `markerSize`): from zoom 15 the full marker (`--raid-full`, 44 px, with its badge and count), at 14 a smaller circle with the count and no badge (`--raid-middle`, 30 px), at 13 and below a small circle with the boss picture in its ring and no badge or count (`--raid-small`, 20 px); sizes are named values of `theme.css`, read by `theme().sizes` for what Leaflet draws; the tap target is never under 32 pixels (`tapBox`, a clear margin round a small circle), the train's and meetup's rings round a raid scale with its circle (`ringSizes(circle)`), and a zoom into another size draws the parties anew. Nearly over, it is dimmed (`isDimmed`: hatched by the clock, `stageAt` of `src/domain/party/raid-stage.ts`, which `raidStage` reads raids through, and `endsSoon` of `src/domain/time/ending-soon.ts`, the five minutes `/max`'s ending-soon question asks by: one rule). The page keeps badges and dimming current every 15 s from the times on the marker (`data-stage`, `data-hatch`, `data-end`; `markerNow`, by the same rules as at the draw), an egg turning into its time left as it hatches. One source for every fact (Matt, 2026-10-25): what the page shows or decides of a party is computed by the domain code the Discord side uses, sent with the list or imported from a pure module of `src/domain/` that imports nothing (`raid-stage.ts`, `ending-soon.ts`), never a second implementation; only the words are the page's. A gym with a raid shows the raid, not its gym dot, while the Raids layer is on (`hiddenGyms`, `MapRaids.raidGyms`); off, the dot is back. Trains and meetups keep their drawing (rings, a line), restyled; at a gym whose raid circle is drawn, their rings go round it rather than over the boss (`ringSizes`: the train's just outside the 44-pixel circle, radius 26, the meetup's outside the train's, radius 31; the old sizes elsewhere, and again when the Raids layer is off). A gym of several raids is drawn by one lead raid, the first with a picture, else the first (`leadRaid`): picture, ring, badge and count are all that raid's. A raid is named everywhere on the map (its popup, the list, the list of things at one place) in its post's own heading words, `MapRaid.heading` (`raidLook` over the renderer's `headlineParts`: `Level 5 raid against Yveltal`, `Level 5 raid (egg)`, without the shiny mark; the tier's words where the renderer gave none), and its popup reads its stage by the clock (`stageAt`), not the list's `stage`.
+- **Several things at one place** (`shared-place.ts`): when more than one shown thing sits at the same place (the same gym, or within 12 pixels at the current zoom, `sharedPlace`, `SHARED_PIXELS`; a raid marker, a train's ring, a meetup's ring, and a gym's dot tapped where parties share it, `MapRaids.gymTapped`), a tap on any of them opens one popup listing each (`placeListNode`: picture, name, time: the lead raid's `heading` and badge, a train's or meetup's `startWords`), and a choice (`data-open`) opens that thing's own popup as before. A layer turned off takes its things out, and the overlap with them. This replaces the tap on a ring's line of the 8S-4 staging: the rings still take clicks on their line alone, but a tap on what they ring lists them.
 - **Distances** (`distance.ts`): `metersBetween`, which is `metresBetween` of `@pine/wayspot-core/distance` itself (the function the place search and Wayfarer matching measure with: one source for every fact, Matt 2026-10-25), and `distanceWords` (`src/render/distance-words.ts`, import-free, so that Discord's side can share it once Matt rules on one rule for both: the map says miles and feet, Discord meters and kilometers): under a tenth of a mile in feet, rounded to 10 (`60 ft`), else miles to one decimal (`1.3 mi`).
 
 ## The parties on the map (plan 8M-3)
 
 - **Who sees what** (spec 2.5; `PartyViewers`, `src/web/party-viewers.ts`, decided per request, never from the session): a member of the server (`members.find`, kept a minute by the directory) sees every active party of it except those in a forum `PartyGateway.memberAccess` says they are `barred` from (an overwrite somebody set to keep them out); a forum hidden from @everyone and allowed to a role is not `barred` for a member without that role, so its parties show and Join opens the forum to them, as signing up on a copy does (spec 2.5: the map crosses region roles). A server whose members must earn a role first (a verification role, `Verified`) names it in `settings.web.memberRole` (Matt, 2026-10-17: "unverified members can browse the map in read-only, same as someone that hasn't logged in"): a member without a role of that name (compared as Pine's other role settings: trimmed, whatever its letter case), unless an administrator, is treated as a visitor who is not logged in: `/api/me` says `member: false`, `/api/parties` 403 (the page shows regions and gyms only), a press 403 (`countsOnTheMap`, `src/web/map-members.ts`). It is decided where membership is: the directory's answer, kept a minute (`mapMembers` over `members.find`, given to `/api/me` and the parties by `guildRoutes`; `ServerMember.standing`: the roles by name and Administrator, `memberStanding`), and for a press also the member fetched fresh (`ActingAnswer.standing`). Unset (the default) every member counts; the region editor does not ask it (staff only). what Discord said of a member and a forum is used for a minute (`BARRED_FRESH_MS`, a `BoundedMap` of 10,000), so a page that asks every 20 s does not have every forum looked at each time. While Discord cannot be asked: a member it confirmed within 30 minutes (`MEMBER_SEEN_MS`) gets the list read-only, by what it said last of each forum (a forum it said nothing of lately is hidden); once Discord failed in a request (the member or any forum), nothing more is asked of it in that request, the forums left go by what it said lately (or are hidden), and one warning is logged; anybody else 503 "Discord cannot be reached just now, so I cannot tell whether you are a member." Not logged in 401, not a member 403.
-- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups in letter order (plan 8X-G, `inLetterOrder`; newest first before) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; Group… and Meet… are not on the map: follow-ups, the web UX sweep); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Since plan 8X-5 the view has `maxes` beside `raids`, `trains` and `meetups` (below, "Max battles on the map"), and every party's attendance says the member's Remote switch (`remote: { offered, on }`: `on` whether the member takes part remotely, false while not signed up, nobody else's; `offered` where the post has Remote, `remoteAllowed`, every party but an elite raid, never while read-only); Remote is pressed apart from `actions` (`MAP_REMOTE`), which the page draws as buttons. Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
+- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`) and its group (`tierGroup`, `raidTierGroup`, plan 8M-7), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), how many are going (`going`, plan 8M-7: `goingCount`, the lobbies' rule over the whole party), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups in letter order (plan 8X-G, `inLetterOrder`; newest first before) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; Group… and Meet… are not on the map: follow-ups, the web UX sweep); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Since plan 8X-5 the view has `maxes` beside `raids`, `trains` and `meetups` (below, "Max battles on the map"), and every party's attendance says the member's Remote switch (`remote: { offered, on }`: `on` whether the member takes part remotely, false while not signed up, nobody else's; `offered` where the post has Remote, `remoteAllowed`, every party but an elite raid, never while read-only); Remote is pressed apart from `actions` (`MAP_REMOTE`), which the page draws as buttons. Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
 - **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join`, `here` (each with body `{ group }`, the group a newcomer chose in the popup, plan 8X-1B: the dialog's Submit by the group's letter, `joinChosen` through `StatusPress` `chosen`, so a member signed up meanwhile keeps their own group; `joinInto` is left to the letter Join of a post drawn before plan 8X-1B), `leave`, `done`, and `remote` (plan 8X-5, `MAP_REMOTE`, no body: toggles the member's Remote as the post's button does, `AttendanceService.setRemote(…, 'toggle')`, answered in `remoteWords`; a newcomer is signed up as interested and remote, an elite raid refused in the post's words, 422; for every kind whose post has Remote); any other action 404, a body other than an optional group letter with those three 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This has ended.", as `answerClick` says it: only what a raid alone has, `isRaidAction` (Set time, Screenshot feedback), is said to be a raid's, and no press of the map is one of those; Done is a max battle's too, plan 8X-3); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
 - **Rehearsal mode** (8C) leaves the web server off (`servedSettings`); were it on, a press would still go through `AttendanceService` over the wrapped party gateway, as every click does.
-- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; the picture of its first raid that has one as a 36 px icon, `gymPicture`, `raid-icon`; a red dot without one), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), meetups and raids at gyms the map does not show in the side panel `#parties` (in the template, hidden until it has something; such a raid is named by its `place`, with the address line and Directions a gym's popup has, `raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
+- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; since plan 8M-7 the circle of its lead raid, `leadRaid`: "The map's frame" below), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), meetups and raids at gyms the map does not show in the side panel `#parties` (in the template, hidden until it has something; such a raid is named by its `place`, with the address line and Directions a gym's popup has, `raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
 
 ## Raids on the map (plan 8M-4)
 
diff --git a/src/domain/party/lobby.test.ts b/src/domain/party/lobby.test.ts
index 03e0960cdc8be4010b57bd0cfc1ea9701cb27432..383cd09b5786114c092c1e36ff167c32a03a2255 100644
--- a/src/domain/party/lobby.test.ts
+++ b/src/domain/party/lobby.test.ts
@@ -10,7 +10,7 @@ import {
   withAttendees,
 } from '../../../test/support/parties.js';
 import { DEFAULT_LOBBIES, lobbySize, splitLobby } from './lobby.js';
-import { lobbyCount, type Party } from './party.js';
+import { goingCount, lobbyCount, type Party } from './party.js';
 import { PartyStatus } from './status.js';
 
 const { Interested, Coming, Present, CompletePending, Complete } = PartyStatus;
@@ -60,5 +60,8 @@ describe('lobbyCount', () => {
     expect(lobbyCount(party, 'A')).toBe(2 + 3 + 4);
     expect(lobbyCount(party, 'B')).toBe(7);
     expect(lobbyCount(party, 'C')).toBe(0);
+    // Going, on the map (plan 8M-7): the same rule over the whole party.
+    expect(goingCount(party)).toBe(2 + 3 + 4 + 7);
+    expect(goingCount(party)).toBe(lobbyCount(party, 'A') + lobbyCount(party, 'B'));
   });
 });
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index 0fb0d1803867a063dffb2ba301e07e90d1588a36..d407573d26a22f215e78fe8e5db29f720d6790cd 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -836,10 +836,28 @@ export function isCommitted(status: AttendeeStatus): boolean {
  * completed it. `except` is a member left out of the count (the one being placed).
  */
 export function lobbyCount(party: PartyCore, groupId: GroupId, except?: string): number {
+  return committedHeads(
+    party,
+    (attendee, memberId) => memberId !== except && attendee.group === groupId,
+  );
+}
+
+/**
+ * Heads going to a party (plan 8M-7: the map's green count and its list's "Most going"): the
+ * lobbies' own rule (`isCommitted`, +1s counted) over every group.
+ */
+export function goingCount(party: PartyCore): number {
+  return committedHeads(party, () => true);
+}
+
+/** The numbers of the committed members for which `keep` holds. */
+function committedHeads(
+  party: PartyCore,
+  keep: (attendee: Attendee, memberId: string) => boolean,
+): number {
   let total = 0;
   for (const [memberId, attendee] of Object.entries(party.attendees)) {
-    if (memberId === except) continue;
-    if (attendee.group === groupId && isCommitted(attendee.status)) total += attendee.number;
+    if (isCommitted(attendee.status) && keep(attendee, memberId)) total += attendee.number;
   }
   return total;
 }
diff --git a/src/domain/party/raid-stage.test.ts b/src/domain/party/raid-stage.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a1fc312a08293302dfdaf3a36f8f3fede8cbd30d
--- /dev/null
+++ b/src/domain/party/raid-stage.test.ts
@@ -0,0 +1,35 @@
+import { describe, expect, it } from 'vitest';
+import { testRaid } from '../../../test/support/parties.js';
+import { raidStage } from './raid.js';
+import { stageAt } from './raid-stage.js';
+
+const MINUTE = 60_000;
+
+describe('stageAt (plan 8M-7)', () => {
+  it('is egg, hatched or ended by the clock, and raidStage is it', () => {
+    const times = { hatchTime: 100 * MINUTE, endTime: 145 * MINUTE, reportedHatched: false };
+    expect(stageAt(times, 99 * MINUTE)).toBe('egg');
+    expect(stageAt(times, 100 * MINUTE)).toBe('hatched');
+    expect(stageAt(times, 145 * MINUTE)).toBe('ended');
+    // Without times: as it was reported, until the last moment it could be on.
+    const untimed = { hatchTime: null, endTime: null, lastPossibleTime: 50, reportedHatched: true };
+    expect(stageAt(untimed, 49)).toBe('hatched');
+    expect(stageAt({ ...untimed, reportedHatched: false }, 49)).toBe('egg');
+    expect(stageAt(untimed, 50)).toBe('ended');
+    // The Discord side's own reading of a raid goes through it.
+    const raid = testRaid();
+    for (const now of [raid.createdAt, raid.hatchTime ?? 0, (raid.endTime ?? 0) + 1]) {
+      expect(raidStage(raid, now)).toBe(
+        stageAt(
+          {
+            hatchTime: raid.hatchTime,
+            endTime: raid.endTime,
+            lastPossibleTime: raid.lastPossibleTime,
+            reportedHatched: raid.raid.reportedHatched,
+          },
+          now,
+        ),
+      );
+    }
+  });
+});
diff --git a/src/domain/party/raid-stage.ts b/src/domain/party/raid-stage.ts
new file mode 100644
index 0000000000000000000000000000000000000000..051b3442f2f7f31f324bf908a7def4d930110e03
--- /dev/null
+++ b/src/domain/party/raid-stage.ts
@@ -0,0 +1,28 @@
+/**
+ * Egg, hatched or ended, by the clock (no import: the map's page takes it too, plan 8M-7, to keep
+ * a raid's marker current between two lists). `raidStage` of `raid.ts` reads a raid through it.
+ */
+
+/** A raid's stage, as `RaidStage` of `party.ts` spells it. */
+export type RaidStageAt = 'egg' | 'hatched' | 'ended';
+
+/** The times a raid's stage is read from. */
+export interface StageTimes {
+  hatchTime: number | null;
+  endTime: number | null;
+  /** The last moment a raid without an end could still be going on. */
+  lastPossibleTime?: number | null;
+  /** Reported hatched (a boss named), for a raid without a hatch time. */
+  reportedHatched: boolean;
+}
+
+/**
+ * A raid without times is what it was reported as (an egg, or hatched when the report named a
+ * boss) until the last moment it could be going on has passed.
+ */
+export function stageAt(times: StageTimes, now: number): RaidStageAt {
+  const { hatchTime, endTime, lastPossibleTime } = times;
+  if (now >= (endTime ?? lastPossibleTime ?? Infinity)) return 'ended';
+  if (hatchTime === null) return times.reportedHatched ? 'hatched' : 'egg';
+  return now < hatchTime ? 'egg' : 'hatched';
+}
diff --git a/src/domain/party/raid.ts b/src/domain/party/raid.ts
index 2d29744f941fa52d7b0733f8f1d6c0f5a7569137..69135c64ff4a8cd9c30fec77c06d4c33ab614786 100644
--- a/src/domain/party/raid.ts
+++ b/src/domain/party/raid.ts
@@ -1,4 +1,5 @@
 import type { RaidBoss } from '../pogo/raid-bosses.js';
+import { stageAt } from './raid-stage.js';
 import { raidDurationKind, sameRaidTier, type RaidTier } from '../pogo/raid-tier.js';
 import type { RaidKind } from '../time/party-time.js';
 import {
@@ -90,10 +91,16 @@ export function raidKindOf(party: RaidParty): RaidKind {
  * passed. Naming the boss later changes nothing here.
  */
 export function raidStage(party: RaidParty, now: number): RaidStage {
-  const { hatchTime, endTime, lastPossibleTime } = party;
-  if (now >= (endTime ?? lastPossibleTime ?? Infinity)) return 'ended';
-  if (hatchTime === null) return party.raid.reportedHatched ? 'hatched' : 'egg';
-  return now < hatchTime ? 'egg' : 'hatched';
+  // One rule with the map's page (plan 8M-7): `stageAt`.
+  return stageAt(
+    {
+      hatchTime: party.hatchTime,
+      endTime: party.endTime,
+      lastPossibleTime: party.lastPossibleTime,
+      reportedHatched: party.raid.reportedHatched,
+    },
+    now,
+  );
 }
 
 /**
diff --git a/src/domain/pogo/raid-tier.test.ts b/src/domain/pogo/raid-tier.test.ts
index 5d54f028d87840f751cdcc8bd01427c46cd1a071..55c71a784764414b1a1a57d9737944983f1d41d9 100644
--- a/src/domain/pogo/raid-tier.test.ts
+++ b/src/domain/pogo/raid-tier.test.ts
@@ -5,12 +5,38 @@ import {
   bossStamina,
   isRaidLevel,
   raidDurationKind,
+  RAID_TIER_GROUPS,
+  raidTierGroup,
   raidTier,
   raidTierLabel,
   raidWords,
   sameRaidTier,
 } from './raid-tier.js';
 
+describe('raidTierGroup (plan 8M-7)', () => {
+  it('puts every tier in one group: its level, Mega for every mega, Elite, Shadow for every shadow', () => {
+    const groups = RAID_LEVELS.flatMap((level) =>
+      [false, true].flatMap((shadow) => {
+        const tier = raidTier(level, shadow);
+        return tier ? [[raidWords(tier), raidTierGroup(tier)]] : [];
+      }),
+    );
+    expect(Object.fromEntries(groups)).toEqual({
+      'Level 1 raid': '1',
+      'Shadow Level 1 raid': 'shadow',
+      'Level 3 raid': '3',
+      'Shadow Level 3 raid': 'shadow',
+      'Level 5 raid': '5',
+      'Shadow Level 5 raid': 'shadow',
+      'Mega raid': 'mega',
+      'Mega Legendary raid': 'mega',
+      'Super Mega raid': 'mega',
+      'Elite raid': 'elite',
+    });
+    expect(RAID_TIER_GROUPS).toEqual(['1', '3', '5', 'mega', 'elite', 'shadow']);
+  });
+});
+
 describe('raid tiers', () => {
   it('names every level', () => {
     expect(RAID_LEVELS).toEqual(['T1', 'T3', 'T5', 'Mega', 'MegaLegendary', 'SuperMega', 'Elite']);
diff --git a/src/domain/pogo/raid-tier.ts b/src/domain/pogo/raid-tier.ts
index 15e94a6b1edf3d157c52da969fc41558962a492f..2b6b71d260080430250f4774dafff3609d8eb0c5 100644
--- a/src/domain/pogo/raid-tier.ts
+++ b/src/domain/pogo/raid-tier.ts
@@ -95,6 +95,29 @@ export function raidWords(tier: RaidTier): string {
   return `${tier.shadow ? 'Shadow ' : ''}${WORDS[tier.level]} raid`;
 }
 
+/**
+ * The groups of tiers the map tells apart (plan 8M-7: the ring of a raid's marker, a named color
+ * of `theme.css` each): the plain levels 1, 3 and 5, every mega (Mega, Mega Legendary, Super
+ * Mega), elite, and every shadow raid.
+ */
+export const RAID_TIER_GROUPS = ['1', '3', '5', 'mega', 'elite', 'shadow'] as const;
+export type RaidTierGroup = (typeof RAID_TIER_GROUPS)[number];
+
+const TIER_GROUPS: Readonly<Record<RaidLevel, RaidTierGroup>> = {
+  T1: '1',
+  T3: '3',
+  T5: '5',
+  Mega: 'mega',
+  MegaLegendary: 'mega',
+  SuperMega: 'mega',
+  Elite: 'elite',
+};
+
+/** The group of a tier: shadow for any shadow raid, else its level's. */
+export function raidTierGroup(tier: RaidTier): RaidTierGroup {
+  return tier.shadow ? 'shadow' : TIER_GROUPS[tier.level];
+}
+
 /** `T5`, `Shadow T5`, `Mega Legendary`. */
 export function raidTierLabel(tier: RaidTier): string {
   return `${tier.shadow ? 'Shadow ' : ''}${LABELS[tier.level]}`;
diff --git a/src/domain/time/ending-soon.test.ts b/src/domain/time/ending-soon.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..435d4148f3c17bfb9223b904e3878ad77a9f70f3
--- /dev/null
+++ b/src/domain/time/ending-soon.test.ts
@@ -0,0 +1,14 @@
+import { describe, expect, it } from 'vitest';
+import { ENDING_SOON_MINUTES, endsSoon } from './ending-soon.js';
+import * as maxEnd from './max-end.js';
+
+describe('endsSoon (plan 8M-7)', () => {
+  it("is one rule for /max's question and the map's raids in their last minutes", () => {
+    expect(ENDING_SOON_MINUTES).toBe(5);
+    expect(endsSoon(1_000 + 5 * 60_000 - 1, 1_000)).toBe(true);
+    expect(endsSoon(1_000 + 5 * 60_000, 1_000)).toBe(false);
+    // /max reads the very same function and number.
+    expect(maxEnd.endsSoon).toBe(endsSoon);
+    expect(maxEnd.ENDING_SOON_MINUTES).toBe(ENDING_SOON_MINUTES);
+  });
+});
diff --git a/src/domain/time/ending-soon.ts b/src/domain/time/ending-soon.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8294f233272f49ce89aa54958c1fcb966d511d56
--- /dev/null
+++ b/src/domain/time/ending-soon.ts
@@ -0,0 +1,12 @@
+/**
+ * What "nearly over" means, once for every reader (no import: the map's page takes it too). A
+ * party whose end is less than this many minutes away is ending soon: a new max battle is asked
+ * about before `/max` makes it (Matt, 2026-10-21: the ending-soon dialog; `max-end.ts` gives it
+ * on), and a raid in its last minutes is dimmed on the map (plan 8M-7). The one place to change it.
+ */
+export const ENDING_SOON_MINUTES = 5;
+
+/** Whether an end is less than `ENDING_SOON_MINUTES` away. */
+export function endsSoon(end: number, now: number): boolean {
+  return end - now < ENDING_SOON_MINUTES * 60_000;
+}
diff --git a/src/domain/time/max-end.ts b/src/domain/time/max-end.ts
index ca115344470272368289439a19eb4367af1f61b6..c38bef14e06c5845875005bbfb9a89a6ef5520a7 100644
--- a/src/domain/time/max-end.ts
+++ b/src/domain/time/max-end.ts
@@ -9,16 +9,11 @@ import { bigEventAt, maxEventAt, type BigEvent, type MaxEvent } from './max-even
  */
 
 /**
- * A max battle whose end is less than this many minutes away is asked about before `/max` makes
- * it (Matt, 2026-10-21: the ending-soon dialog); joining one at the spot asks nothing. The one
- * place to change it.
+ * A max battle whose end is less than `ENDING_SOON_MINUTES` away is asked about before `/max`
+ * makes it (Matt, 2026-10-21: the ending-soon dialog); joining one at the spot asks nothing. The
+ * rule is `ending-soon.ts`', shared with the map's raids in their last minutes (plan 8M-7).
  */
-export const ENDING_SOON_MINUTES = 5;
-
-/** Whether a new max battle's end is so near that `/max` asks first (`ENDING_SOON_MINUTES`). */
-export function endsSoon(end: number, now: number): boolean {
-  return end - now < ENDING_SOON_MINUTES * 60_000;
-}
+export { ENDING_SOON_MINUTES, endsSoon } from './ending-soon.js';
 
 /** The hours of the day max battles can be fought (`settings.maxBattles`), `HH:MM` in the zone. */
 export interface BattleHours {
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index a282aada3708bbcc6a2093ae4c81ccf99e4d2673..6e38896f4d16ded580b0a526065230aa6fa43ae9 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -41,6 +41,12 @@ export interface GroupCounts {
 export interface MapAttendance {
   /** Every group of the party, in order: one for a party without groups of its own. */
   groups: GroupCounts[];
+  /**
+   * How many are going (plan 8M-7): the committed heads of the whole party, coming, here and asked
+   * whether they are done, +1s counted, by the lobbies' rule (`goingCount` of the domain): the
+   * map's green count and the list's "Most going" read it, never a sum of their own.
+   */
+  going: number;
   /** The member's own status and group; null when they are not signed up. */
   mine: { status: MapStatus; group: string } | null;
   /** The buttons that apply, in the post's order; none while the map is read-only. */
@@ -83,6 +89,9 @@ export interface MapRaidPlace {
   address: string | null;
 }
 
+/** The groups of raid tiers, as `RaidTierGroup` spells them (plan 8M-7). */
+export type MapTierGroup = '1' | '3' | '5' | 'mega' | 'elite' | 'shadow';
+
 export interface MapRaid {
   kind: 'raid';
   id: string;
@@ -92,6 +101,17 @@ export interface MapRaid {
   picture: string | null;
   /** The tier in the posts' words: `Level 5 raid`, `Shadow Level 3 raid`. */
   tier: string;
+  /**
+   * The tier's group (plan 8M-7, `raidTierGroup` of the domain): the ring of its marker, a named
+   * color of `theme.css` each.
+   */
+  tierGroup: MapTierGroup;
+  /**
+   * What it is in its post's own heading words (plan 8M-7, fix round 1, `raidLook` over the
+   * renderer's `headlineParts`): `Level 5 raid against Yveltal`, `Level 5 raid (egg)`. The map's
+   * popup, its list and the list of things at one place name the raid by it.
+   */
+  heading: string;
   /** The boss the post names: what it is against, or what the egg hatches as. */
   boss: string | null;
   /** Egg or hatched, by the clock when the view was made. */
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 72bdc9101298eb756890d84e794baa9ebeb1edf9..a5bcef1d13a760fe9f2098aaec30f6349f499ca7 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -69,6 +69,7 @@ function input(parties: readonly Party[], more: Partial<PartyViewInput> = {}): P
     look: (raid: RaidParty) => ({
       picture: raid.hatchTime !== null && PARTY_NOW < raid.hatchTime ? EGG_PICTURE : BOSS_PICTURE,
       boss: 'Yveltal',
+      heading: 'Level 5 raid (egg)',
     }),
     pictureOrigins: ORIGINS,
     ...more,
@@ -87,6 +88,9 @@ describe('partyView', () => {
         gymId: 1,
         picture: EGG_PICTURE,
         tier: 'Level 5 raid',
+        tierGroup: '5',
+        // The post's own heading words (`raidLook`, plan 8M-7 fix round 1).
+        heading: 'Level 5 raid (egg)',
         boss: 'Yveltal',
         stage: 'egg',
         hatchTime: at('2026-10-13T14:30'),
@@ -96,6 +100,7 @@ describe('partyView', () => {
         mayChange: false,
         attendance: {
           groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
+          going: 0,
           mine: null,
           actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
           remote: { offered: true, on: false },
@@ -124,6 +129,9 @@ describe('partyView', () => {
       { id: 'A', interested: 1, coming: 3, present: 2 },
     ]);
     expect(view.raids[0]?.attendance.mine).toEqual({ status: 'coming', group: 'A' });
+    // Going (plan 8M-7): the committed heads of the whole party, by the lobbies' own rule
+    // (`goingCount`): coming, here and asked, +1s counted; never a sum made in the page.
+    expect(view.raids[0]?.attendance.going).toBe(3 + 1 + 1);
   });
 
   it('gives a raid of several groups the buttons of one, and asks a newcomer which group', () => {
@@ -233,6 +241,7 @@ describe('partyView', () => {
         place: { name: 'Gazebo of the Park', lat: 40.0005, lon: -80.0005, address: '1 Park Lane' },
         attendance: {
           groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
+          going: 0,
           mine: null,
           actions: [
             { action: 'interested' },
@@ -295,6 +304,8 @@ describe('partyView', () => {
     );
     expect(view.raids[0]?.picture).toBeNull();
     const none = partyView(input([egg], { look: () => ({}) }));
+    // A look without a heading (none drawn): the tier in the posts' words.
+    expect(none.raids[0]?.heading).toBe('Level 5 raid');
     expect(none.raids[0]).toMatchObject({ picture: null, boss: null });
   });
 
@@ -352,6 +363,7 @@ describe('partyView', () => {
         link: `https://discord.com/channels/${GUILD}/700000000000000002`,
         attendance: {
           groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
+          going: 0,
           mine: null,
           actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
           remote: { offered: true, on: false },
@@ -372,6 +384,7 @@ describe('partyView', () => {
         link: `https://discord.com/channels/${GUILD}/700000000000000003`,
         attendance: {
           groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
+          going: 0,
           mine: null,
           actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
           remote: { offered: true, on: false },
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index 05e2b648fecb30e2d38456e29a51d820ef4fa0d2..e5976d98a6a9a187e83c7f526343ae7900ef5243 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -15,6 +15,7 @@ import {
   type Party,
   type RaidParty,
   type TrainParty,
+  goingCount,
 } from '../party/party.js';
 import { raidStage } from '../party/raid.js';
 import { PartyStatus } from '../party/status.js';
@@ -31,7 +32,7 @@ import {
   TRAIN_MOVES,
 } from '../party/train.js';
 import { maxBossTitle, maxTierLabel } from '../pogo/max-tier.js';
-import { raidWords } from '../pogo/raid-tier.js';
+import { raidTierGroup, raidWords } from '../pogo/raid-tier.js';
 import type {
   GroupCounts,
   MapAttendance,
@@ -67,6 +68,8 @@ export type * from './party-data.js';
  * renderer).
  */
 export interface RaidLook {
+  /** The post's heading in words (plan 8M-7, fix round 1); the tier's words without one. */
+  heading?: string;
   picture?: string;
   boss?: string;
   place?: MapRaidPlace;
@@ -206,7 +209,14 @@ function attendanceOf(party: Party, input: PartyViewInput, hatched: boolean): Ma
       ];
   const pick = groupPick(party, input);
   const remote = { offered: !input.readOnly && remoteAllowed(party), on: own?.remote ?? false };
-  return { groups, mine, actions, ...(pick === undefined ? {} : { pick }), remote };
+  return {
+    groups,
+    going: goingCount(party),
+    mine,
+    actions,
+    ...(pick === undefined ? {} : { pick }),
+    remote,
+  };
 }
 
 /**
@@ -241,6 +251,8 @@ function raidOf(party: RaidParty, link: string, input: PartyViewInput): MapRaid
     gymId: party.gymId,
     picture: allowedPicture(look.picture, input.pictureOrigins) ?? null,
     tier: raidWords(party.raid.tier),
+    tierGroup: raidTierGroup(party.raid.tier),
+    heading: look.heading ?? raidWords(party.raid.tier),
     boss: look.boss ?? null,
     stage,
     hatchTime: party.hatchTime,
diff --git a/src/render/raid-post.test.ts b/src/render/raid-post.test.ts
index 9d9eba5132bb47b6ca005eb1c14e60596b13be8c..ee2b223770c5f2dda0170ab9766d8c497be1e705 100644
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -469,15 +469,19 @@ describe('renderRaidPost', () => {
     const looked = (party: RaidParty, now = PARTY_NOW) => {
       const shown = view(party, { now, eggPicture: picture });
       expect(raidLook(shown).picture).toBe(thumbnailOf(renderRaidPost(shown).message));
+      // The heading's words as the post's own heading says them (plan 8M-7, fix round 1).
+      expect(textOf(renderRaidPost(shown).message)).toContain(`### ${raidLook(shown).heading}`);
       return raidLook(shown);
     };
     const place = { name: 'The Stacks', lat: 40.05, lon: -80.05, address: LIBRARY_ADDRESS };
-    expect(looked(egg)).toEqual({ picture, place });
-    expect(looked(named)).toEqual({ picture, boss: 'Yveltal', place });
+    const egged = 'Level 5 raid (egg)';
+    expect(looked(egg)).toEqual({ picture, place, heading: egged });
+    expect(looked(named)).toEqual({ picture, boss: 'Yveltal', place, heading: egged });
     expect(looked(named, at('2026-10-13T14:40'))).toEqual({
       picture: expect.stringMatching(/pm717/) as unknown,
       boss: 'Yveltal',
       place,
+      heading: 'Level 5 raid against Yveltal',
     });
   });
 
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index 49abf3ae4bb871116ec357ebe847cbd1faed9d1c..cbacf462653af7629773b872340d0a04570218ca 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -469,12 +469,19 @@ function heading(view: RaidPostView): string {
   return `### ${what}${after}`;
 }
 
-function headlineParts(view: RaidPostView): { what: string; after: string } {
+/**
+ * The heading's parts: what the raid is (the boss's name as `name` makes it: `plain` for Discord,
+ * as it is for the live map's `raidLook`) and what follows (` (egg)`, or the shiny mark).
+ */
+function headlineParts(
+  view: RaidPostView,
+  name: (text: string) => string = plain,
+): { what: string; after: string } {
   const words = raidWords(view.party.raid.tier);
   const { fought } = bosses(view);
   if (fought) {
     return {
-      what: `${words} against ${plain(fought.name)}`,
+      what: `${words} against ${name(fought.name)}`,
       after: fought.shiny ? ` ${view.emoji.shiny}` : '',
     };
   }
@@ -552,6 +559,11 @@ function pictureFileOf(view: RaidPostView): string | undefined {
  * for a gym that is gone.
  */
 export function raidLook(view: RaidPostView): {
+  /**
+   * The post's heading in words (plan 8M-7, fix round 1): `Level 5 raid against Yveltal`,
+   * `Level 5 raid (egg)`; by `headlineParts`, as the post's `### …`, without the shiny mark.
+   */
+  heading: string;
   picture?: string;
   boss?: string;
   place?: { name: string; lat: number; lon: number; address: string | null };
@@ -560,7 +572,9 @@ export function raidLook(view: RaidPostView): {
   const picture = pictureOf(view);
   const boss = (fought ?? expected)?.name;
   const { gym } = view;
+  const { what, after } = headlineParts(view, (text) => text);
   return {
+    heading: `${what}${after === ' (egg)' ? after : ''}`,
     ...(picture === undefined ? {} : { picture }),
     ...(boss === undefined ? {} : { boss }),
     ...(gym === undefined
diff --git a/src/web/client/gyms-ui.ts b/src/web/client/gyms-ui.ts
index 5300780c69d100e624dd31be0aa1b2b901569184..c48115b0cba42e5870d7a19a2ba1c9b9b3af300c 100644
--- a/src/web/client/gyms-ui.ts
+++ b/src/web/client/gyms-ui.ts
@@ -37,6 +37,10 @@ export interface GymDotsDeps {
   clicked(gym: MapGym): boolean;
   /** A gym is to be clicked: every gym is drawn. */
   forced(): boolean;
+  /** The gyms not drawn as dots: a gym with a raid shows the raid (plan 8M-7, `hiddenGyms`). */
+  hidden(): ReadonlySet<number>;
+  /** A gym's dot tapped: the list of the things at its place, or `own`, its own popup. */
+  tapped(gym: MapGym, own: () => void): void;
 }
 
 /** How far a tap on a cluster zooms in at least. */
@@ -69,7 +73,13 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
       ),
     );
     // In route mode a click (or Enter) adds the gym as a stop: its popup is not opened.
-    gymClicks(marker, () => deps.clicked(gym));
+    gymClicks(
+      marker,
+      () => deps.clicked(gym),
+      () => {
+        deps.tapped(gym, () => marker.openPopup());
+      },
+    );
     // The open gym is never taken away nor clustered (`wantedDots`); once closed, drawn as wanted.
     marker.on('popupopen', () => {
       open = gym.id;
@@ -108,11 +118,12 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
    * dot whose popup is open is never taken off (fix round 1).
    */
   const refresh = (): void => {
+    const hidden = deps.hidden();
     const shown = shownGyms(deps.gyms, {
       on: registry.isOn('gyms'),
       filter: deps.filter.value,
       forced: deps.forced(),
-    });
+    }).filter((gym) => !hidden.has(gym.id));
     const bounds = map.getBounds();
     const view = {
       south: bounds.getSouth(),
@@ -143,7 +154,8 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
 
   map.on('moveend', refresh);
   registry.onChange((id) => {
-    if (id === 'gyms') refresh();
+    // A gym with a raid shows its raid while the raids are shown, its dot while they are not.
+    if (id === 'gyms' || id === 'raids') refresh();
   });
   onThemeChange(({ colours }) => {
     for (const marker of dots.values()) marker.setStyle({ color: colours.gym });
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index f40ba1456c63f772e4e9d6231a42eb5b5ffedb8b..62cf05d070801f9a251ee2cc86661a7e9252ca56 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -8,6 +8,7 @@ import { loginNotice } from './notice.js';
 import { showParties } from './party-layer.js';
 import { quietLine, showPlaces } from './places-ui.js';
 import { regionLabel, renderNode, type MapGym } from './popup.js';
+import { hiddenGyms } from './shared-place.js';
 import { onThemeChange, theme } from './theme.js';
 import { BOUNDS_VISCOSITY, browserStorage, placeTheMap } from './view-ui.js';
 import { showWhereYouAre, type You } from './you-ui.js';
@@ -42,7 +43,18 @@ const gymExtras: {
   editing: () => boolean;
   clicked: (gym: MapGym) => boolean;
   forced: () => boolean;
-} = { of: () => [], editing: () => false, clicked: () => false, forced: () => false };
+  raidGyms: () => readonly number[];
+  tapped: (gym: MapGym, own: () => void) => void;
+} = {
+  of: () => [],
+  editing: () => false,
+  clicked: () => false,
+  forced: () => false,
+  raidGyms: () => [],
+  tapped: (_gym, own) => {
+    own();
+  },
+};
 
 /**
  * Shows the regions (the layer Region outlines) and the gyms (the layer Gyms); gives the gyms by
@@ -108,6 +120,10 @@ async function showGeo(
     editing: () => gymExtras.editing(),
     clicked: (gym) => gymExtras.clicked(gym),
     forced: () => gymExtras.forced(),
+    hidden: () => hiddenGyms(gymExtras.raidGyms(), registry.isOn('raids')),
+    tapped: (gym, own) => {
+      gymExtras.tapped(gym, own);
+    },
   });
 
   // Where the map starts, and how far it may go (plan 8M-7).
@@ -165,6 +181,11 @@ function start(): void {
       gymExtras.of = (gym) => raids.gymControls(gym);
       gymExtras.clicked = (gym) => raids.gymClicked(gym);
       gymExtras.forced = () => raids.forced();
+      gymExtras.raidGyms = () => raids.raidGyms();
+      gymExtras.tapped = (gym, own) => {
+        raids.gymTapped(gym, own);
+      };
+      dots.refresh();
     })
     .catch(() => {
       // Leaflet draws nothing until the map has a view.
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 78e4d0c96ccc46e00fbbe0cd034343afe045e05e..c234a235e1957658c3d3af992e15307102aa383c 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -676,10 +676,152 @@ a {
   font: inherit;
 }
 
+/*
+ * A raid's marker (plan 8M-7): the picture in a ring of its tier's color, centered on the gym, a
+ * time badge under it and the green count of those going; dimmed in its last five minutes.
+ */
 .raid-icon {
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  background: none;
+  border: 0;
+}
+
+/* Its sizes by the zoom (Matt, 2026-10-25): full from 15, middle at 14, small below. */
+.raid-marker {
+  position: relative;
+  flex: none;
+  width: var(--raid-full);
+  height: var(--raid-full);
+}
+
+.raid-marker.size-middle {
+  width: var(--raid-middle);
+  height: var(--raid-middle);
+}
+
+.raid-marker.size-small {
+  width: var(--raid-small);
+  height: var(--raid-small);
+}
+
+.raid-marker .ring {
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  box-sizing: border-box;
+  width: 100%;
+  height: 100%;
+  border: 3px solid var(--line);
   border-radius: 50%;
   background: var(--marker-bg);
-  box-shadow: 0 0 0 2px var(--raid);
+  box-shadow: 0 2px 6px var(--shadow);
+  overflow: hidden;
+}
+
+.raid-marker .ring img {
+  width: 82%;
+  height: 82%;
+  pointer-events: none;
+}
+
+.raid-marker .badge {
+  position: absolute;
+  top: 100%;
+  left: 50%;
+  transform: translateX(-50%);
+  padding: 1px 6px;
+  border-radius: 8px;
+  background: var(--marker-bg);
+  color: var(--text);
+  box-shadow: 0 1px 3px var(--shadow);
+  font-size: 11px;
+  font-weight: 600;
+  white-space: nowrap;
+}
+
+.raid-marker .going {
+  position: absolute;
+  top: -8px;
+  right: -8px;
+  min-width: 20px;
+  height: 20px;
+  box-sizing: border-box;
+  padding: 0 5px;
+  border: 2px solid var(--marker-bg);
+  border-radius: 10px;
+  background: var(--going);
+  color: var(--on-color);
+  font-size: 11px;
+  font-weight: 700;
+  line-height: 16px;
+  text-align: center;
+}
+
+.raid-marker.dim {
+  opacity: 0.45;
+}
+
+.raid-marker.tier-1 .ring {
+  border-color: var(--tier-1);
+}
+
+.raid-marker.tier-3 .ring {
+  border-color: var(--tier-3);
+}
+
+.raid-marker.tier-5 .ring {
+  border-color: var(--tier-5);
+}
+
+.raid-marker.tier-mega .ring {
+  border-color: var(--tier-mega);
+}
+
+.raid-marker.tier-elite .ring {
+  border-color: var(--tier-elite);
+}
+
+.raid-marker.tier-shadow .ring {
+  border-color: var(--tier-shadow);
+}
+
+/* The list of the things at one place (plan 8M-7): a choice per thing. */
+.place-list .choices {
+  display: flex;
+  flex-direction: column;
+  gap: 4px;
+  margin-top: 6px;
+}
+
+.place-choice {
+  display: grid;
+  grid-template-columns: 32px 1fr auto;
+  align-items: center;
+  gap: 8px;
+  padding: 4px 8px;
+  border: 0;
+  border-radius: var(--radius);
+  background: var(--deep-bg);
+  color: var(--text);
+  font: inherit;
+  text-align: left;
+  cursor: pointer;
+}
+
+.place-choice:hover {
+  background: var(--secondary-hover);
+}
+
+.place-choice .picture {
+  width: 32px;
+  height: 32px;
+}
+
+.place-choice .when {
+  color: var(--muted);
+  font-size: 13px;
 }
 
 .region-label {
diff --git a/src/web/client/meetup-forms.test.ts b/src/web/client/meetup-forms.test.ts
index 9fb5828e70df9dfa179d62069a86d70e13637096..5462f3a794ea6774c627696f662cae611a9a5ce5 100644
--- a/src/web/client/meetup-forms.test.ts
+++ b/src/web/client/meetup-forms.test.ts
@@ -76,7 +76,13 @@ const MEETUP: MapMeetup = {
   startTime: NOW + 4 * HOUR,
   endTime: null,
   link: 'https://discord.com/channels/1/2',
-  attendance: { groups: [], mine: null, actions: [], remote: { offered: false, on: false } },
+  attendance: {
+    groups: [],
+    going: 0,
+    mine: null,
+    actions: [],
+    remote: { offered: false, on: false },
+  },
   place: { kind: 'gym', words: 'At The Stacks', lat: 40.05, lon: -80.05, gymId: 1 },
   info: 'Bring snacks.',
   panel: { start: true },
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index 9eb3d734d4ed2774050d66392bcf2438f95feac6..03fb4e8e9364b0135bee2ee5901191ac3af71b69 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -30,6 +30,7 @@ const LINK = 'https://discord.com/channels/412345678901234567/700000000000000001
 
 const attendance = (more: Partial<MapAttendance> = {}): MapAttendance => ({
   groups: [{ id: 'A', interested: 1, coming: 3, present: 2 }],
+  going: 5,
   mine: null,
   actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
   remote: { offered: true, on: false },
@@ -42,6 +43,8 @@ const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
   gymId: 1,
   picture: null,
   tier: 'Level 5 raid',
+  tierGroup: '5',
+  heading: 'Level 5 raid (egg)',
   boss: 'Yveltal',
   stage: 'egg',
   hatchTime: NOW + 30 * MINUTE,
@@ -176,6 +179,15 @@ describe('raidPopup', () => {
     ]);
   });
 
+  it("names the raid in its post's own heading words, its stage by the clock (fix round 1)", () => {
+    const heading = 'Level 5 raid against Yveltal';
+    const hatched = raidPopup(raid({ stage: 'egg', hatchTime: NOW - MINUTE, heading }), context);
+    // Hatched since the list was made: its end, no hatch.
+    expect(texts(hatched)).toContain(heading);
+    expect(texts(hatched).join(' ')).toContain('Ends at');
+    expect(texts(hatched).join(' ')).not.toContain('Hatches');
+  });
+
   it('shows a raid at a gym the map does not show by where its post says it is', () => {
     const place = { name: 'Hilltop Shrine', lat: 40.5, lon: -80.25, address: '1 Hill Rd' };
     const popup = raidPopup(raid({ gymId: 77, place }), context);
@@ -199,6 +211,7 @@ describe('raidPopup', () => {
     const popup = raidPopup(
       raid({
         stage: 'hatched',
+        heading: 'Level 5 raid against Yveltal',
         attendance: attendance({
           groups: [
             { id: 'A', interested: 0, coming: 2, present: 0 },
@@ -303,6 +316,7 @@ describe('the raids of a gym', () => {
   const elite = raid({
     id: 'r3',
     tier: 'Elite raid',
+    heading: 'Elite raid (egg)',
     boss: 'Mewtwo',
     picture: 'https://example.test/mewtwo.png',
     hatchTime: NOW + 120 * MINUTE,
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index 8ac8fb763733c807b9a80701ae4f9fc4466c00de..191367191522a8807f659cd3685b6d21ee389d92 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -6,6 +6,7 @@ import type {
   MapStatus,
   MapTrain,
 } from '../../domain/web/party-data.js';
+import { stageAt } from '../../domain/party/raid-stage.js';
 import { clockTime } from '../../domain/web/clock.js';
 import type { Me } from './notice.js';
 import { addressLine, directionsLink, type MapGym, type PageNode } from './popup.js';
@@ -189,11 +190,14 @@ function postLink(link: string): PageNode[] {
  * "Change…" for a member who may change it (plan 8M-4), and the post.
  */
 function raidNodes(raid: MapRaid, context: ShowContext): PageNode[] {
-  const egg = raid.stage === 'egg';
-  const heading =
-    !egg && raid.boss !== null
-      ? `${raid.tier} against ${raid.boss}`
-      : `${raid.tier}${egg ? ' (egg)' : ''}`;
+  // Its stage by the clock, the domain's `stageAt` (the list may be older than its hatch); its
+  // name in its post's own heading words (fix round 1).
+  const egg =
+    stageAt(
+      { hatchTime: raid.hatchTime, endTime: null, reportedHatched: raid.stage !== 'egg' },
+      context.now,
+    ) === 'egg';
+  const { heading } = raid;
   const time = egg ? raid.hatchTime : raid.endTime;
   return [
     div('tier', heading),
diff --git a/src/web/client/party-layer-contextmenu.isolated.test.ts b/src/web/client/party-layer-contextmenu.isolated.test.ts
index 371e8d2ad00724a8fb2169d389f87821fc17864e..469b6bf922ca820be7eb02022771a9ef61fa9442 100644
--- a/src/web/client/party-layer-contextmenu.isolated.test.ts
+++ b/src/web/client/party-layer-contextmenu.isolated.test.ts
@@ -86,11 +86,11 @@ function routingMap() {
  * that one is a closure of `showParties`, which needs the page's document and the side panel, so
  * it cannot run here. Should `withPopup` ever listen for more, this copy must follow it.
  */
-function raidMarker(picture: string | null): L.Marker | L.CircleMarker {
+function raidMarker(): L.Marker {
   return raidsMarker(
     GYM,
-    picture,
-    '#d35400',
+    // The circle of plan 8M-7 is an element of the page's; any icon of its kind routes alike.
+    L.divIcon({ className: 'raid-icon' }),
     (marker) =>
       marker
         .bindPopup('the raids of the gym')
@@ -102,19 +102,16 @@ function raidMarker(picture: string | null): L.Marker | L.CircleMarker {
 
 describe("a right click on a raid's picture or dot (plan 8M-6)", () => {
   it('opens the spawn form where the pointer is, through the map', () => {
-    for (const picture of ['https://map.example.test/eggs/t5.png', null]) {
-      const { opened, rightClick } = routingMap();
-      rightClick(raidMarker(picture));
-      expect(opened).toEqual([POINTER]);
-    }
+    const { opened, rightClick } = routingMap();
+    rightClick(raidMarker());
+    expect(opened).toEqual([POINTER]);
   });
 
   it('would lose it to a raid marker that listened for it, at the gym instead of the pointer', () => {
     const { opened, rightClick } = routingMap();
     const taken: L.LatLng[] = [];
-    const listening = raidMarker('https://map.example.test/eggs/t5.png').on(
-      'contextmenu',
-      (event: L.LeafletMouseEvent) => taken.push(event.latlng),
+    const listening = raidMarker().on('contextmenu', (event: L.LeafletMouseEvent) =>
+      taken.push(event.latlng),
     );
     rightClick(listening);
     expect(opened).toEqual([]);
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 4d78e36f746b26a9f2683c2866cd793622255336..a21873ee51d4f65e1e25db4de219b2f666c64502 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -8,7 +8,7 @@ import type { Me } from './notice.js';
 import {
   countdown,
   trainPlaces,
-  gymPicture,
+  gymOfStop,
   gymRaidsPopup,
   meetupItem,
   meetupPopup,
@@ -35,6 +35,18 @@ import {
 import { trainUi } from './train-ui.js';
 import { onThemeChange, theme } from './theme.js';
 import type { LayerRegistry } from './layer-registry.js';
+import {
+  leadRaid,
+  markerSize,
+  tapBox,
+  type MarkerSize,
+  markerNow,
+  raidBadge,
+  raidMarkerNode,
+  ringSizes,
+  type RingSize,
+} from './raid-marker.js';
+import { placeListNode, sharedPlace, startWords, type PlacedThing } from './shared-place.js';
 
 /**
  * The parties on the live map for a member (plan 8M-3, spec 3.2 to 3.4): one marker per gym
@@ -51,7 +63,6 @@ import type { LayerRegistry } from './layer-registry.js';
 
 const EVERY_MS = 20_000;
 const COUNTDOWN_MS = 15_000;
-const ICON_SIZE = 36;
 /**
  * The pane of the rings of meetups and trains: above Leaflet's markers (600), below its tooltips
  * (650).
@@ -61,12 +72,7 @@ const RING_PANE_Z = 625;
 /** A gym's dot on the map (`main.ts`). */
 export const GYM_DOT = { radius: 6, weight: 2 } as const;
 /** The ring of a meetup at its place. */
-export const MEETUP_RING = { radius: 12, weight: 4 } as const;
-/**
- * The ring of a train at its gym (plan 8S-4): between the gym's dot and a meetup's ring, so that
- * the three at one gym hide none of each other.
- */
-const TRAIN_RING = { radius: 8.5, weight: 3 } as const;
+export const MEETUP_RING = ringSizes(undefined).meetup;
 
 /**
  * Where a train is on the map (plan 8S-4): a ring around the gym of its stop, unfilled, so that a
@@ -82,9 +88,12 @@ export function trainMarker(
   interactive: boolean,
   colour: string,
   renderer: L.Renderer,
+  // Between the gym's dot and a meetup's ring (plan 8S-4), so that the three at one gym hide none
+  // of each other; round a raid's circle where one is drawn at the gym (`ringSizes`, fix round 1).
+  size: RingSize = ringSizes(undefined).train,
 ): L.CircleMarker {
   return L.circleMarker([where.lat, where.lon], {
-    ...TRAIN_RING,
+    ...size,
     renderer,
     color: colour,
     fill: false,
@@ -105,7 +114,11 @@ type Draw = (node: PageNode) => HTMLElement;
  * opens the popup (plan 8M-5). A double click whose clicks route mode took is kept from the map,
  * which would zoom in on it. Call it after `bindPopup`.
  */
-export function gymClicks(layer: L.Layer, routeClick: () => boolean): void {
+export function gymClicks(
+  layer: L.Layer,
+  routeClick: () => boolean,
+  open: () => void = () => layer.openPopup(),
+): void {
   layer.off('click').off('keypress');
   /** Whether route mode took the last click: a double click of it is no zoom. */
   let routed = false;
@@ -113,7 +126,7 @@ export function gymClicks(layer: L.Layer, routeClick: () => boolean): void {
     // As Leaflet's own: the click is the layer's, not the map's.
     L.DomEvent.stop(event);
     routed = routeClick();
-    if (!routed) layer.openPopup();
+    if (!routed) open();
   };
   layer.on('click', clicked);
   layer.on('dblclick', (event: L.LeafletEvent) => {
@@ -146,40 +159,52 @@ export interface MapRaids {
    * whatever the Gyms layer (plan 8M-7).
    */
   forced(): boolean;
+  /** The gyms whose raids are drawn in place of their dot (plan 8M-7). */
+  raidGyms(): readonly number[];
+  /**
+   * A gym's dot tapped (not taken by route mode or a place picked): the list of the things at its
+   * place where parties share it (plan 8M-7), else `own`, its own popup.
+   */
+  gymTapped(gym: MapGym, own: () => void): void;
 }
 
 /**
- * The marker of a gym's raids: the picture of its first raid that has one (`picture`), else a
- * dot of `colour`; its popup bound by `bind` (the layer's `withPopup`), its clicks taken by
- * `gymClicks` (in route mode a gym with raids is a stop to add like any other, its popup not
- * opened; while a meetup's place is picked, it is the place). It listens for no `contextmenu`:
+ * The marker of a gym's raids (plan 8M-7: `icon`, the first raid's circle of `raidMarkerNode`:
+ * its picture in a ring of its tier's color, the time badge, the count going), centered on the
+ * gym; its popup bound by `bind` (the layer's `withPopup`), its clicks taken by `gymClicks` (in
+ * route mode a gym with raids is a stop to add like any other, its popup not opened; while a
+ * meetup's place is picked, it is the place; else `open`, which lists the things at its place
+ * when it shares it). It listens for no `contextmenu`:
  * Leaflet gives a layer a mouse event only when the layer listens for it, so a right click or a
  * long press on a raid's picture or dot reaches the map's own handler, at the pointer, which
  * opens the spawn form there (plan 8M-6; `party-layer-contextmenu.isolated.test.ts`).
  */
 export function raidsMarker(
   gym: { lat: number; lon: number },
-  picture: string | null,
-  colour: string,
-  bind: (marker: L.Marker | L.CircleMarker) => L.Marker | L.CircleMarker,
+  icon: L.DivIcon,
+  bind: (marker: L.Marker) => L.Marker,
   routeClick: () => boolean,
-): L.Marker | L.CircleMarker {
-  const marker =
-    picture === null
-      ? L.circleMarker([gym.lat, gym.lon], { radius: 10, color: colour, fillOpacity: 0.9 })
-      : L.marker([gym.lat, gym.lon], {
-          icon: L.icon({
-            iconUrl: picture,
-            iconSize: [ICON_SIZE, ICON_SIZE],
-            className: 'raid-icon',
-          }),
-          keyboard: true,
-        });
+  open?: () => void,
+): L.Marker {
+  const marker = L.marker([gym.lat, gym.lon], { icon, keyboard: true });
   bind(marker);
-  gymClicks(marker, routeClick);
+  gymClicks(marker, routeClick, open);
   return marker;
 }
 
+/** The icon of a raid's marker: an element of ours (`raidMarkerNode`), never a string. */
+export function raidIcon(element: HTMLElement, circle: number): L.DivIcon {
+  // Never a tap target under 32 pixels: a clear margin round a small circle (`tapBox`).
+  const box = tapBox(circle);
+  return L.divIcon({
+    html: element,
+    className: 'raid-icon',
+    iconSize: [box, box],
+    iconAnchor: [box / 2, box / 2],
+    popupAnchor: [0, -circle / 2],
+  });
+}
+
 /**
  * `mayReport`: a member who may report raids and spawns by what `/api/me` said at the load (not
  * while the map is read-only), who gets "Report raid" and "Report spawn here" also in the popups
@@ -209,6 +234,8 @@ export function showParties(
     if (on) group.addTo(map);
     else group.remove();
     counted();
+    // The rings go round a raid's circle only while raids are shown (`ringSizes`).
+    if (id === 'raids' && view) hold.shown(view);
   });
   /** How many of each layer's things are in view, for the sheet of the layers. */
   const counted = (): void => {
@@ -315,9 +342,14 @@ export function showParties(
   const draw: Draw = (node) => {
     const element = renderNode(node, document);
     element.addEventListener('click', (event) => {
-      const target = event.target;
+      // A button, or what is drawn in it (the list of things at one place: a picture, words).
+      const target = event.target instanceof Element ? event.target.closest('button') : null;
       if (!(target instanceof HTMLButtonElement)) return;
-      if (target.dataset.changeRaid !== undefined) raidForms.changeClicked(target);
+      if (target.dataset.open !== undefined) {
+        const open = choices.get(target.dataset.open);
+        map.closePopup();
+        open?.();
+      } else if (target.dataset.changeRaid !== undefined) raidForms.changeClicked(target);
       else if (target.dataset.report !== undefined) {
         const gym = gyms.get(Number(target.dataset.report));
         if (gym) raidForms.reportClicked(target, gym);
@@ -362,26 +394,101 @@ export function showParties(
     return target;
   };
 
+  /**
+   * The things drawn at a place in the last draw, by the layer that shows them (plan 8M-7): a tap
+   * on one that shares its place with others opens the list of them (`sharedPlace`).
+   */
+  let placed: Array<PlacedThing & { layer: 'raids' | 'trains' | 'meetups' }> = [];
+  /** The gyms whose raids are drawn in place of their dot. */
+  let raidGyms: number[] = [];
+  /** The raids' size drawn last: a zoom into another draws them anew (Matt, 2026-10-25). */
+  let drawnSize: MarkerSize | undefined;
+  map.on('zoomend', () => {
+    if (view && markerSize(map.getZoom()) !== drawnSize) hold.shown(view);
+  });
+  const toPixel = (place: { lat: number; lon: number }) =>
+    map.latLngToContainerPoint([place.lat, place.lon]);
+  const shownThings = () => placed.filter((thing) => registry.isOn(thing.layer));
+  /** The list of the things at one place, a choice opening its own popup (or `own`'s). */
+  const openList = (here: readonly PlacedThing[], own?: { key: string; open: () => void }) => {
+    const [first] = here;
+    if (!first) return;
+    choices.clear();
+    for (const thing of here) {
+      choices.set(thing.key, () => popups.get(thing.key)?.openPopup());
+    }
+    if (own) choices.set(own.key, own.open);
+    L.popup({ className: 'place-list-popup' })
+      .setLatLng([first.lat, first.lon])
+      .setContent(draw(placeListNode(here)))
+      .openOn(map);
+  };
+  /** What a tap on a thing opens: its own popup, or the list of the things at its place. */
+  const openAt = (key: string, layer: L.Layer): void => {
+    const shown = shownThings();
+    const target = shown.find((thing) => thing.key === key);
+    const here = target ? sharedPlace(target, shown, toPixel) : [];
+    if (here.length <= 1) layer.openPopup();
+    else openList(here);
+  };
+  /** A ring's own click: the list where it shares its place (plan 8M-7), else its popup. */
+  const sharedClicks = (layer: L.Layer, key: string): void => {
+    layer.off('click');
+    layer.on('click', (event: L.LeafletEvent) => {
+      L.DomEvent.stop(event);
+      openAt(key, layer);
+    });
+  };
+  /** The choices of the list open: a thing's key and what opens it. */
+  const choices = new Map<string, () => void>();
+
   const redraw = (next: PartiesView): void => {
     view = next;
     const reopen = showing.key;
     for (const group of Object.values(groups)) group.clearLayers();
     popups.clear();
+    placed = [];
+    const now = Date.now();
     const { atGyms, elsewhere } = raidsAtGyms(next.raids, (id) => gyms.has(id));
+    raidGyms = [...atGyms.keys()];
+    /** Whether a raid's circle is drawn at a gym: the rings go round it (fix round 1). */
+    // The size of the raids' circles at this zoom (Matt, 2026-10-25), which the rings round them
+    // follow; none where no raid's circle is drawn at the gym.
+    const size = markerSize(map.getZoom());
+    const { sizes } = theme();
+    const circle =
+      size === 'full' ? sizes.raidFull : size === 'middle' ? sizes.raidMiddle : sizes.raidSmall;
+    const raidAt = (gymId: number | undefined): number | undefined =>
+      gymId !== undefined && registry.isOn('raids') && atGyms.has(gymId) ? circle : undefined;
+    drawnSize = size;
     for (const [gymId, raids] of atGyms) {
       const gym = gyms.get(gymId);
-      if (!gym) continue;
+      // One lead raid draws the marker, every fact of it (fix round 1).
+      const lead = leadRaid(raids);
+      if (!gym || !lead) continue;
       const extras = reportOffered(mayReport, next)
         ? [reportBox(gymId), spawnBox(gymId), meetupHereBox(gymId)]
         : [];
-      raidsMarker(
+      const key = `gym:${gymId}`;
+      const marker: L.Marker = raidsMarker(
         gym,
-        gymPicture(raids),
-        theme().colours.raid,
-        (marker) =>
-          withPopup(marker, `gym:${gymId}`, () => gymRaidsPopup(gymId, raids, context(), extras)),
+        raidIcon(renderNode(raidMarkerNode(lead, now, next.zone, size), document), circle),
+        (made) => withPopup(made, key, () => gymRaidsPopup(gymId, raids, context(), extras)),
         () => gymClicked(gym),
+        () => {
+          openAt(key, marker);
+        },
       ).addTo(groups.raids);
+      placed.push({
+        key,
+        layer: 'raids',
+        gymId,
+        lat: gym.lat,
+        lon: gym.lon,
+        picture: lead.picture,
+        name: lead.heading + (raids.length > 1 ? ` (and ${raids.length - 1} more)` : ''),
+        time: raidBadge(lead, now, next.zone),
+      });
     }
     // Trains the map cannot draw (no route yet, or none of its gyms on the map) are listed; the
     // train being routed is left to route mode, which draws its stops as they are edited.
@@ -398,18 +505,31 @@ export function showParties(
       const { place } = meetup;
       if (!place) continue;
       const gym = place.gymId === null ? undefined : gyms.get(place.gymId);
-      withPopup(
-        L.circleMarker(gym ? [gym.lat, gym.lon] : [place.lat, place.lon], {
-          ...MEETUP_RING,
+      const at = gym ?? place;
+      const key = `meetup:${meetup.id}`;
+      const ring = withPopup(
+        L.circleMarker([at.lat, at.lon], {
+          ...ringSizes(raidAt(gym?.id)).meetup,
           renderer: rings,
           color: theme().colours.meetup,
           fill: false,
           interactive,
           pane: RING_PANE,
         }),
-        `meetup:${meetup.id}`,
+        key,
         () => meetupPopup(meetup, context(), meetupActions(meetup)),
       ).addTo(groups.meetups);
+      sharedClicks(ring, key);
+      placed.push({
+        key,
+        layer: 'meetups',
+        gymId: gym ? gym.id : null,
+        lat: at.lat,
+        lon: at.lon,
+        picture: null,
+        name: meetup.name,
+        time: startWords(meetup.startTime, now, next.zone),
+      });
     }
     for (const train of drawn.trains) {
       // Through its gyms and the power spots its data gives (plan 8X-4).
@@ -434,11 +554,36 @@ export function showParties(
       // A ring around the stop it is at (or its first stop before it starts): a gym's own marker
       // inside it stays a marker to click (plan 8S-4).
       if (ring) {
-        withPopup(
-          trainMarker(ring.at, ring.here, interactive, theme().colours.train, rings),
-          `train:${train.id}`,
+        const key = `train:${train.id}`;
+        const marker = withPopup(
+          trainMarker(
+            ring.at,
+            ring.here,
+            interactive,
+            theme().colours.train,
+            rings,
+            ringSizes(
+              raidAt(
+                gymOfStop(train.stop === null ? train.route[0] : train.route[train.stop]) ??
+                  undefined,
+              ),
+            ).train,
+          ),
+          key,
           popup,
         ).addTo(groups.trains);
+        sharedClicks(marker, key);
+        const stopKey = train.stop === null ? train.route[0] : train.route[train.stop];
+        placed.push({
+          key,
+          layer: 'trains',
+          gymId: gymOfStop(stopKey),
+          lat: ring.at.lat,
+          lon: ring.at.lon,
+          picture: null,
+          name: train.name,
+          time: startWords(train.startTime, now, next.zone),
+        });
       }
     }
     const items = [
@@ -743,6 +888,15 @@ export function showParties(
     for (const element of document.querySelectorAll<HTMLElement>('[data-until]')) {
       element.textContent = countdown(Number(element.dataset.until), now);
     }
+    // The raids' badges and their last minutes (plan 8M-7), between two lists, by the rules they
+    // were drawn by (`markerNow`).
+    const zone = view?.zone ?? 'UTC';
+    for (const marker of document.querySelectorAll<HTMLElement>('.raid-marker[data-stage]')) {
+      const shown = markerNow(marker.dataset, now, zone);
+      const badge = marker.querySelector('.badge');
+      if (badge) badge.textContent = shown.badge;
+      marker.classList.toggle('dim', shown.dimmed);
+    }
   }, COUNTDOWN_MS);
   void poller.start();
   return {
@@ -753,5 +907,20 @@ export function showParties(
     editing: () => hold.editing,
     gymClicked: (gym) => gymClicked(gym),
     forced: () => trainForms.routing() !== undefined || meetupForms.picking(),
+    raidGyms: () => raidGyms,
+    gymTapped: (gym, own) => {
+      const target: PlacedThing = {
+        key: `gym-dot:${gym.id}`,
+        gymId: gym.id,
+        lat: gym.lat,
+        lon: gym.lon,
+        picture: null,
+        name: gym.name,
+        time: 'Gym',
+      };
+      const here = sharedPlace(target, [target, ...shownThings()], toPixel);
+      if (here.length <= 1) own();
+      else openList(here, { key: target.key, open: own });
+    },
   };
 }
diff --git a/src/web/client/raid-forms.test.ts b/src/web/client/raid-forms.test.ts
index 37c5482f8d31465b23f7f883b19f20a7723c449c..f29a3a4e7242a8a980f18b959563b81601e8ebe0 100644
--- a/src/web/client/raid-forms.test.ts
+++ b/src/web/client/raid-forms.test.ts
@@ -66,6 +66,8 @@ const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
   gymId: 4,
   picture: null,
   tier: 'Level 5 raid',
+  tierGroup: '5',
+  heading: 'Level 5 raid',
   boss: null,
   stage: 'egg',
   hatchTime: null,
@@ -75,6 +77,7 @@ const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
   mayChange: true,
   attendance: {
     groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
+    going: 0,
     mine: null,
     actions: [],
     remote: { offered: false, on: false },
diff --git a/src/web/client/raid-marker.test.ts b/src/web/client/raid-marker.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a3590bc3e5e380fd0e48191e2dd82ecc23b57613
--- /dev/null
+++ b/src/web/client/raid-marker.test.ts
@@ -0,0 +1,186 @@
+import { describe, expect, it } from 'vitest';
+import type { MapAttendance, MapRaid } from '../../domain/web/party-data.js';
+import {
+  badgeFor,
+  badgeWords,
+  isDimmed,
+  raidBadge,
+  raidMarkerNode,
+  markerNow,
+  leadRaid,
+  markerSize,
+  ringSizes,
+  tapBox,
+  tierColour,
+} from './raid-marker.js';
+import { ENDING_SOON_MINUTES } from '../../domain/time/ending-soon.js';
+import type { PageNode } from './popup.js';
+
+const ZONE = 'America/New_York';
+/** Tuesday 13 October 2026, 14:00 in New York. */
+const NOW = Date.UTC(2026, 9, 13, 18);
+const MINUTE = 60_000;
+
+const attendance = (groups: MapAttendance['groups'], going = 0): MapAttendance => ({
+  groups,
+  going,
+  mine: null,
+  actions: [],
+  remote: { offered: false, on: false },
+});
+
+const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
+  kind: 'raid',
+  id: 'r1',
+  gymId: 1,
+  picture: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm150.icon.png',
+  tier: 'Level 5 raid',
+  tierGroup: '5',
+  heading: 'Level 5 raid',
+  boss: 'Mewtwo',
+  stage: 'hatched',
+  hatchTime: NOW - 20 * MINUTE,
+  endTime: NOW + 12 * MINUTE,
+  link: 'https://discord.com/channels/1/2',
+  place: null,
+  mayChange: false,
+  attendance: attendance([{ id: 'A', interested: 2, coming: 3, present: 1 }], 4),
+  ...more,
+});
+
+/** Every text of a tree, in order. */
+const texts = (node: PageNode): string[] => [
+  ...(node.text === undefined ? [] : [node.text]),
+  ...(node.children ?? []).flatMap(texts),
+];
+
+describe("a raid's marker (plan 8M-7)", () => {
+  it('says the time left while it runs, and when it hatches before', () => {
+    expect(raidBadge(raid(), NOW, ZONE)).toBe('12m');
+    expect(raidBadge(raid({ endTime: NOW + 65 * MINUTE }), NOW, ZONE)).toBe('1h 05m');
+    expect(raidBadge(raid({ endTime: NOW + 30_000 }), NOW, ZONE)).toBe('1m');
+    expect(raidBadge(raid({ endTime: NOW - MINUTE }), NOW, ZONE)).toBe('ended');
+    const egg = raid({ stage: 'egg', hatchTime: NOW + 40 * MINUTE, endTime: NOW + 85 * MINUTE });
+    expect(raidBadge(egg, NOW, ZONE)).toBe('hatches 2:40');
+    // Hatched by the clock since the list was made: the time left.
+    expect(raidBadge(egg, NOW + 41 * MINUTE, ZONE)).toBe('44m');
+    expect(raidBadge(raid({ stage: 'egg', hatchTime: null }), NOW, ZONE)).toBe('egg');
+    expect(raidBadge(raid({ endTime: null }), NOW, ZONE)).toBe('hatched');
+    expect(badgeWords('end', NOW + 3 * MINUTE, NOW, ZONE)).toBe('3m');
+    expect(badgeWords('hatch', NOW + 3 * MINUTE, NOW, ZONE)).toBe('hatches 2:03');
+    // Not today: the day said, as the posts' times (`clockTime`), AM or PM kept.
+    expect(badgeWords('hatch', NOW + 24 * 60 * MINUTE, NOW, ZONE)).toBe(
+      'hatches Wed, Oct 14, 2:00 PM',
+    );
+  });
+
+  it("shows the going the server counted, and rings by the tier's group", () => {
+    // Never a sum of the page's own (one source for every fact, Matt 2026-10-25).
+    const node = raidMarkerNode(
+      raid({ attendance: attendance([{ id: 'A', interested: 5, coming: 2, present: 0 }], 9) }),
+      NOW,
+      ZONE,
+    );
+    expect(texts(node)).toContain('9');
+    expect(tierColour('shadow')).toBe('--tier-shadow');
+    expect(tierColour('5')).toBe('--tier-5');
+  });
+
+  it('draws a gym of several raids by one lead raid: the first with a picture, else the first', () => {
+    const plain = raid({ id: 'r1', picture: null });
+    const pictured = raid({ id: 'r2', tierGroup: 'elite' });
+    expect(leadRaid([plain, pictured])?.id).toBe('r2');
+    expect(leadRaid([plain, raid({ id: 'r3', picture: null })])?.id).toBe('r1');
+    expect(leadRaid([])).toBeUndefined();
+  });
+
+  it('rings a train and a meetup outside the circle of a raid at their gym, at every size', () => {
+    const alone = ringSizes(undefined);
+    for (const circle of [44, 30, 20]) {
+      const round = ringSizes(circle);
+      // The raid's circle and its ring: the train's ring just outside, the meetup's outside that.
+      expect(round.train.radius - round.train.weight / 2).toBeGreaterThanOrEqual(circle / 2 + 2);
+      expect(round.meetup.radius - round.meetup.weight / 2).toBeGreaterThan(
+        round.train.radius + round.train.weight / 2,
+      );
+    }
+    expect(ringSizes(20).train.radius).toBeLessThan(ringSizes(44).train.radius);
+    expect(alone.train.radius).toBeLessThan(ringSizes(20).train.radius);
+  });
+
+  it('shrinks as the map zooms out, never grouped (Matt, 2026-10-25)', () => {
+    expect([18, 15, 14, 13, 10].map(markerSize)).toEqual([
+      'full',
+      'full',
+      'middle',
+      'small',
+      'small',
+    ]);
+    // At 14 the count but no time badge; at 13 and below the ring alone; dimmed at every size.
+    const middle = raidMarkerNode(raid(), NOW, ZONE, 'middle');
+    expect(middle.className).toBe('raid-marker tier-5 size-middle');
+    expect(texts(middle)).toEqual(['4']);
+    const small = raidMarkerNode(raid({ endTime: NOW + 2 * MINUTE }), NOW, ZONE, 'small');
+    expect(small.className).toBe('raid-marker tier-5 size-small dim');
+    expect(texts(small)).toEqual([]);
+    // The tap target is never under 32 pixels: a clear margin round a small circle.
+    expect(tapBox(20)).toBe(32);
+    expect(tapBox(44)).toBe(44);
+  });
+
+  it('is dimmed in its last five minutes', () => {
+    // "Nearly over" is the domain's one rule (`endsSoon`), the one /max asks by.
+    expect(isDimmed(raid({ endTime: NOW + ENDING_SOON_MINUTES * MINUTE - 1 }), NOW)).toBe(true);
+    expect(isDimmed(raid({ endTime: NOW + ENDING_SOON_MINUTES * MINUTE }), NOW)).toBe(false);
+    expect(isDimmed(raid({ endTime: null }), NOW)).toBe(false);
+    // An egg is never in its last minutes.
+    expect(
+      isDimmed(raid({ stage: 'egg', hatchTime: NOW + 60_000, endTime: NOW + 3 * MINUTE }), NOW),
+    ).toBe(false);
+  });
+
+  it('draws the picture in its ring, the badge under it and the green count', () => {
+    const node = raidMarkerNode(raid(), NOW, ZONE);
+    expect(node.className).toBe('raid-marker tier-5');
+    expect(texts(node)).toEqual(['12m', '4']);
+    expect(node.attributes).toEqual({
+      'data-stage': 'hatched',
+      'data-hatch': String(NOW - 20 * MINUTE),
+      'data-end': String(NOW + 12 * MINUTE),
+    });
+    // The page keeps it current from them, by the rules it was drawn by: an egg turning into its
+    // time left as it hatches, a raid dimmed once it ends soon.
+    expect(
+      markerNow(
+        { stage: 'egg', hatch: String(NOW + MINUTE), end: String(NOW + 46 * MINUTE) },
+        NOW,
+        ZONE,
+      ),
+    ).toEqual({ badge: 'hatches 2:01', dimmed: false });
+    expect(
+      markerNow(
+        { stage: 'egg', hatch: String(NOW + MINUTE), end: String(NOW + 46 * MINUTE) },
+        NOW + 2 * MINUTE,
+        ZONE,
+      ),
+    ).toEqual({ badge: '44m', dimmed: false });
+    expect(markerNow({ stage: 'hatched', end: String(NOW + 4 * MINUTE) }, NOW, ZONE)).toEqual({
+      badge: '4m',
+      dimmed: true,
+    });
+    expect(badgeFor('egg', null, null, NOW, ZONE)).toBe('egg');
+    // Nobody going: no count; its last minutes: dimmed; no picture: an empty ring.
+    const last = raidMarkerNode(
+      raid({
+        picture: null,
+        endTime: NOW + 2 * MINUTE,
+        attendance: attendance([{ id: 'A', interested: 1, coming: 0, present: 0 }]),
+      }),
+      NOW,
+      ZONE,
+    );
+    expect(last.className).toBe('raid-marker tier-5 dim');
+    expect(texts(last)).toEqual(['2m']);
+    expect(JSON.stringify(last)).not.toContain('"img"');
+  });
+});
diff --git a/src/web/client/raid-marker.ts b/src/web/client/raid-marker.ts
new file mode 100644
index 0000000000000000000000000000000000000000..29b6e446d63c97ffb7c447975575bd6a33668dc9
--- /dev/null
+++ b/src/web/client/raid-marker.ts
@@ -0,0 +1,202 @@
+import { stageAt } from '../../domain/party/raid-stage.js';
+import { endsSoon } from '../../domain/time/ending-soon.js';
+import { clockTime } from '../../domain/web/clock.js';
+import type { MapRaid, MapTierGroup } from '../../domain/web/party-data.js';
+import type { PageNode } from './popup.js';
+
+/**
+ * A raid on the live map (plan 8M-7, frame B of the mockups): a circle centered on the gym, the
+ * boss's picture (the egg of its tier before it hatches: the post's picture) in a ring of its
+ * tier's color (a named value of `theme.css` per tier group, `tierColour`), a time badge under it
+ * ("12m" while it runs, "hatches 2:40" before), and a green count of those going when above
+ * zero; in its last minutes it is dimmed. Built as a tree of nodes (`renderNode`), the page
+ * keeping the badge and the dimming current (`data-stage`, `data-hatch`, `data-end`).
+ *
+ * Every fact is the domain's, as the Discord side has it (one source for every fact, Matt
+ * 2026-10-25): the tier's group and the going count come computed with the list
+ * (`raidTierGroup`, `goingCount`, read as `attendance.going`), egg or hatched by the clock is `stageAt` (`raidStage` reads
+ * raids through it), "nearly over" is `endsSoon` (`/max` asks by it). Only the words are the page's.
+ */
+
+const MINUTE = 60_000;
+
+/** The ring's color: the named value of `theme.css` of the tier's group (`raidTierGroup`). */
+export function tierColour(group: MapTierGroup): string {
+  return `--tier-${group}`;
+}
+
+/**
+ * The raid a gym's one marker is drawn by (fix round 1): the first with a picture, else the first;
+ * every fact of the marker (picture, ring, badge, count) is this raid's.
+ */
+export function leadRaid<R extends Pick<MapRaid, 'picture'>>(raids: readonly R[]): R | undefined {
+  return raids.find((raid) => raid.picture !== null) ?? raids[0];
+}
+
+/** A ring's size: its radius and its line, in pixels. */
+export interface RingSize {
+  radius: number;
+  weight: number;
+}
+
+/**
+ * The rings of a train and a meetup at a gym (plans 8S-4, 8M-5M), and, where a raid's circle is
+ * drawn at it (`circle` pixels across, by the zoom: `markerSize`), round that circle rather than
+ * over its boss (fix round 1), scaling with it: the train's just outside it, the meetup's outside
+ * the train's.
+ */
+export function ringSizes(circle: number | undefined): { train: RingSize; meetup: RingSize } {
+  if (circle === undefined) {
+    return { train: { radius: 8.5, weight: 3 }, meetup: { radius: 12, weight: 4 } };
+  }
+  const train = circle / 2 + 4;
+  return { train: { radius: train, weight: 3 }, meetup: { radius: train + 5, weight: 4 } };
+}
+
+/** A raid marker's size by the zoom (Matt, 2026-10-25): it shrinks zoomed out, never grouped. */
+export type MarkerSize = 'full' | 'middle' | 'small';
+
+/** Full from zoom 15 (circle, badge, count), middle at 14 (no badge), small below (ring only). */
+export function markerSize(zoom: number): MarkerSize {
+  if (zoom >= 15) return 'full';
+  return zoom >= 14 ? 'middle' : 'small';
+}
+
+/** The smallest tap target, in pixels. */
+export const MIN_TAP = 32;
+
+/** The tap target round a circle: never under 32 pixels, a clear margin round a small one. */
+export function tapBox(circle: number): number {
+  return Math.max(circle, MIN_TAP);
+}
+
+/**
+ * Whether a raid has hatched by the clock (the list may be older than its hatch): the domain's
+ * `stageAt`; without a hatch time, as the server read it.
+ */
+function hatched(raid: Pick<MapRaid, 'stage' | 'hatchTime'>, now: number): boolean {
+  return (
+    stageAt(
+      { hatchTime: raid.hatchTime, endTime: null, reportedHatched: raid.stage !== 'egg' },
+      now,
+    ) === 'hatched'
+  );
+}
+
+/** Whether a raid is nearly over (`endsSoon`): dimmed. An egg never is. */
+export function isDimmed(
+  raid: Pick<MapRaid, 'stage' | 'hatchTime' | 'endTime'>,
+  now: number,
+): boolean {
+  return hatched(raid, now) && raid.endTime !== null && endsSoon(raid.endTime, now);
+}
+
+/** `2:40` in the posts' zone, the hour and minute alone (a badge has no room for more). */
+function shortClock(at: number, zone: string): string {
+  const parts = new Intl.DateTimeFormat('en-US', {
+    timeZone: zone,
+    hour: 'numeric',
+    minute: '2-digit',
+  }).formatToParts(at);
+  const part = (type: string) => parts.find((one) => one.type === type)?.value ?? '';
+  return `${part('hour')}:${part('minute')}`;
+}
+
+/** A badge's words: the time left (`12m`, `1h 05m`, `ended`), or `hatches 2:40`. */
+export function badgeWords(kind: 'end' | 'hatch', at: number, now: number, zone: string): string {
+  if (kind === 'hatch') {
+    // The posts' time (`clockTime`: the day when it is not today); AM or PM left out today only.
+    const clock = clockTime(at, zone, now);
+    return `hatches ${clock === clockTime(at, zone, at) ? shortClock(at, zone) : clock}`;
+  }
+  const minutes = Math.ceil((at - now) / MINUTE);
+  if (minutes <= 0) return 'ended';
+  if (minutes < 60) return `${minutes}m`;
+  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
+}
+
+/**
+ * The badge of a raid by its times as the marker keeps them (`data-hatch`, `data-end`): an egg
+ * counts toward its hatch, a hatched raid (by the clock) toward its end; `egg` or `hatched` where
+ * nobody said when.
+ */
+export function badgeFor(
+  stage: MapRaid['stage'],
+  hatchTime: number | null,
+  endTime: number | null,
+  now: number,
+  zone: string,
+): string {
+  // Egg, hatched or ended: the domain's reading (`stageAt`); only the words are the page's.
+  const reading = stageAt({ hatchTime, endTime, reportedHatched: stage !== 'egg' }, now);
+  if (reading === 'ended') return 'ended';
+  if (reading === 'egg') {
+    return hatchTime === null ? 'egg' : badgeWords('hatch', hatchTime, now, zone);
+  }
+  return endTime === null ? 'hatched' : badgeWords('end', endTime, now, zone);
+}
+
+/** The badge under a raid's marker. */
+export function raidBadge(raid: MapRaid, now: number, zone: string): string {
+  return badgeFor(raid.stage, raid.hatchTime, raid.endTime, now, zone);
+}
+
+/** The marker of a raid as a tree of nodes. */
+export function raidMarkerNode(
+  raid: MapRaid,
+  now: number,
+  zone: string,
+  size: MarkerSize = 'full',
+): PageNode {
+  const { going } = raid.attendance;
+  const times = {
+    'data-stage': raid.stage,
+    ...(raid.hatchTime === null ? {} : { 'data-hatch': String(raid.hatchTime) }),
+    ...(raid.endTime === null ? {} : { 'data-end': String(raid.endTime) }),
+  };
+  return {
+    tag: 'div',
+    className: `raid-marker tier-${raid.tierGroup}${size === 'full' ? '' : ` size-${size}`}${
+      isDimmed(raid, now) ? ' dim' : ''
+    }`,
+    attributes: times,
+    children: [
+      {
+        tag: 'span',
+        className: 'ring',
+        children:
+          raid.picture === null
+            ? []
+            : [{ tag: 'img', attributes: { src: raid.picture, alt: '', draggable: 'false' } }],
+      },
+      // The badge from zoom 15, the count from 14 (`markerSize`).
+      ...(size === 'full'
+        ? [{ tag: 'span', className: 'badge', text: raidBadge(raid, now, zone) }]
+        : []),
+      ...(going > 0 && size !== 'small'
+        ? [{ tag: 'span', className: 'going', text: String(going) }]
+        : []),
+    ],
+  };
+}
+
+/**
+ * A marker kept current between two lists from the times it carries: its badge's words and
+ * whether it is dimmed, by the same rules as when it was drawn.
+ */
+export function markerNow(
+  times: { stage?: string; hatch?: string; end?: string },
+  now: number,
+  zone: string,
+): { badge: string; dimmed: boolean } {
+  const time = (value: string | undefined) => (value === undefined ? null : Number(value));
+  const raid = {
+    stage: times.stage === 'egg' ? ('egg' as const) : ('hatched' as const),
+    hatchTime: time(times.hatch),
+    endTime: time(times.end),
+  };
+  return {
+    badge: badgeFor(raid.stage, raid.hatchTime, raid.endTime, now, zone),
+    dimmed: isDimmed(raid, now),
+  };
+}
diff --git a/src/web/client/shared-place.test.ts b/src/web/client/shared-place.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..27fc8a549f0455d17d7f0d15944d62b0679687c0
--- /dev/null
+++ b/src/web/client/shared-place.test.ts
@@ -0,0 +1,85 @@
+import { describe, expect, it } from 'vitest';
+import {
+  hiddenGyms,
+  placeListNode,
+  sharedPlace,
+  SHARED_PIXELS,
+  startWords,
+  type PlacedThing,
+} from './shared-place.js';
+import type { PageNode } from './popup.js';
+
+/** A place on a screen of the test's: a degree is 10,000 pixels. */
+const toPixel = (place: { lat: number; lon: number }) => ({
+  x: place.lon * 10_000,
+  y: -place.lat * 10_000,
+});
+
+const thing = (key: string, more: Partial<PlacedThing> = {}): PlacedThing => ({
+  key,
+  gymId: null,
+  lat: 40.44,
+  lon: -79.95,
+  picture: null,
+  name: key,
+  time: 'in 5 min',
+  ...more,
+});
+
+describe('several things at one place (plan 8M-7)', () => {
+  it('are the shown things at the same gym, or within a few pixels at this zoom', () => {
+    const raid = thing('gym:7', { gymId: 7 });
+    const train = thing('train:t1', { gymId: 7, lat: 40.4401 });
+    const meetup = thing('meetup:m1', { lon: -79.95 + 5 / 10_000 });
+    const far = thing('meetup:m2', { lon: -79.95 + (SHARED_PIXELS * 3) / 10_000 });
+    const all = [raid, train, meetup, far];
+    expect(sharedPlace(raid, all, toPixel).map((one) => one.key)).toEqual([
+      'gym:7',
+      'train:t1',
+      'meetup:m1',
+    ]);
+    expect(sharedPlace(far, all, toPixel).map((one) => one.key)).toEqual(['meetup:m2']);
+    // A layer turned off takes its things out: the overlap is gone.
+    expect(sharedPlace(raid, [raid, far], toPixel)).toEqual([raid]);
+  });
+
+  it("list each in one popup, a choice opening that thing's own popup", () => {
+    const node: PageNode = placeListNode([
+      thing('gym:7', {
+        name: 'Schenley Fountain · Level 5 raid',
+        picture: 'https://x.test/a.png',
+        time: '12m',
+      }),
+      thing('train:t1', { name: 'Oakland loop', time: 'started' }),
+    ]);
+    const buttons = (node.children ?? []).flatMap((child) => child.children ?? []);
+    expect(buttons.map((button) => button.attributes?.['data-open'])).toEqual([
+      'gym:7',
+      'train:t1',
+    ]);
+    const words = (one: PageNode): string[] => [
+      ...(one.text === undefined ? [] : [one.text]),
+      ...(one.children ?? []).flatMap(words),
+    ];
+    expect(words(node)).toEqual([
+      'Here',
+      'Schenley Fountain · Level 5 raid',
+      '12m',
+      'Oakland loop',
+      'started',
+    ]);
+    expect(JSON.stringify(node)).toContain('https://x.test/a.png');
+  });
+
+  it('name when a train or meetup starts', () => {
+    const now = Date.UTC(2026, 9, 13, 18);
+    expect(startWords(now + 75 * 60_000, now, 'America/New_York')).toBe('starts 3:15 PM');
+    expect(startWords(now - 60_000, now, 'America/New_York')).toBe('started');
+    expect(startWords(null, now, 'America/New_York')).toBe('no start time');
+  });
+
+  it("hide a gym's dot under its raid while the raids are shown", () => {
+    expect([...hiddenGyms([3, 7], true)]).toEqual([3, 7]);
+    expect([...hiddenGyms([3, 7], false)]).toEqual([]);
+  });
+});
diff --git a/src/web/client/shared-place.ts b/src/web/client/shared-place.ts
new file mode 100644
index 0000000000000000000000000000000000000000..40f436f26ba9f9622d506fe4334ea3f4b6337e87
--- /dev/null
+++ b/src/web/client/shared-place.ts
@@ -0,0 +1,88 @@
+import { clockTime } from '../../domain/web/clock.js';
+import type { PageNode } from './popup.js';
+
+/**
+ * Several things at one place on the live map (plan 8M-7): a train's stop at a gym with a raid,
+ * two parties at one gym, a meetup's pin beside a raid. When more than one shown thing sits at
+ * the same place (the same gym, or within a few pixels at the current zoom), a tap on any of them
+ * opens one popup listing each (picture, name, time), and a choice opens that thing's own popup.
+ * Turning a layer off takes its things out, and the overlap with them. This replaces the tap on a
+ * ring's line of plan 8S-4.
+ */
+
+/** How close on the screen two things are at one place. */
+export const SHARED_PIXELS = 12;
+
+/** A thing the map shows at a place, as the popup that lists them names it. */
+export interface PlacedThing {
+  /** Its popup's key (`gym:<id>`, `train:<id>`, `meetup:<id>`). */
+  key: string;
+  /** The gym it is at, or null. */
+  gymId: number | null;
+  lat: number;
+  lon: number;
+  picture: string | null;
+  name: string;
+  /** Its time in words: time left, the hatch, the start. */
+  time: string;
+}
+
+/**
+ * The shown things at the place of `target` (itself first): those at its gym, and those within
+ * `pixels` of it on the screen (`toPixel` at the current zoom), each once, in the order given.
+ */
+export function sharedPlace<T extends PlacedThing>(
+  target: T,
+  shown: readonly T[],
+  toPixel: (place: { lat: number; lon: number }) => { x: number; y: number },
+  pixels = SHARED_PIXELS,
+): T[] {
+  const at = toPixel(target);
+  const near = shown.filter((thing) => {
+    if (thing.key === target.key) return false;
+    if (target.gymId !== null && thing.gymId === target.gymId) return true;
+    const there = toPixel(thing);
+    return Math.hypot(there.x - at.x, there.y - at.y) <= pixels;
+  });
+  return [target, ...near];
+}
+
+/** The popup that lists the things at one place: a button for each, which opens its own popup. */
+export function placeListNode(things: readonly PlacedThing[]): PageNode {
+  return {
+    tag: 'div',
+    className: 'place-list',
+    children: [
+      { tag: 'strong', className: 'name', text: 'Here' },
+      {
+        tag: 'div',
+        className: 'choices',
+        children: things.map((thing): PageNode => ({
+          tag: 'button',
+          className: 'place-choice',
+          attributes: { type: 'button', 'data-open': thing.key },
+          children: [
+            ...(thing.picture === null
+              ? [{ tag: 'span', className: 'picture none' }]
+              : [
+                  { tag: 'img', className: 'picture', attributes: { src: thing.picture, alt: '' } },
+                ]),
+            { tag: 'span', className: 'what', text: thing.name },
+            { tag: 'span', className: 'when', text: thing.time },
+          ],
+        })),
+      },
+    ],
+  };
+}
+
+/** When a train or meetup starts, in a line: `starts 6:15 PM`, `started`, `no start time`. */
+export function startWords(at: number | null, now: number, zone: string): string {
+  if (at === null) return 'no start time';
+  return at > now ? `starts ${clockTime(at, zone, now)}` : 'started';
+}
+
+/** The gyms whose dot is not drawn: a gym with a raid shows the raid, while raids are shown. */
+export function hiddenGyms(raidGyms: Iterable<number>, raidsShown: boolean): Set<number> {
+  return raidsShown ? new Set(raidGyms) : new Set();
+}
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index a81825c9866f4528ee037a58bae1a0d104390220..ee7cc8d3bbd05d900bfe18d1202f7c3f6946e4b5 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -15,6 +15,10 @@
   --radius: 4px;
   --card-radius: 8px;
   --card-bar: 4px;
+  /* A raid marker's circle by the zoom: full from 15, middle at 14, small below (theme.ts reads them). */
+  --raid-full: 44px;
+  --raid-middle: 30px;
+  --raid-small: 20px;
   /* The map's side pane (the list, forms) and the region editor's panel. */
   --panel-width: 340px;
   --editor-panel-width: 360px;
@@ -74,6 +78,14 @@
   --train: #d35400;
   --meetup: #8e44ad;
   --stop: #2980b9;
+  /* The ring of a raid's marker, by tier group (plan 8M-7), and its count of those going. */
+  --tier-1: #e0609c;
+  --tier-3: #d79b00;
+  --tier-5: #7d3c98;
+  --tier-mega: #16a085;
+  --tier-elite: #b9770e;
+  --tier-shadow: #4a235a;
+  --going: #248046;
   --you: #1a73e8;
   --you-edge: #ffffff;
 
@@ -117,6 +129,9 @@
     --radius: 4px;
     --card-radius: 8px;
     --card-bar: 4px;
+    --raid-full: 44px;
+    --raid-middle: 30px;
+    --raid-small: 20px;
     --panel-width: 340px;
     --editor-panel-width: 360px;
 
@@ -170,6 +185,13 @@
     --train: #e67e22;
     --meetup: #b065d0;
     --stop: #5b9cf6;
+    --tier-1: #f07ab3;
+    --tier-3: #f1c40f;
+    --tier-5: #b06ad0;
+    --tier-mega: #2ecc9a;
+    --tier-elite: #e59e2c;
+    --tier-shadow: #9b59b6;
+    --going: #2d9d55;
     --you: #4c8bf5;
     --you-edge: #ffffff;
 
diff --git a/src/web/client/theme.test.ts b/src/web/client/theme.test.ts
index dc23cc0753c925fdab765cf685d6c1299a6a8081..17e023aa3fae5799e1a200abec0610170965ae4a 100644
--- a/src/web/client/theme.test.ts
+++ b/src/web/client/theme.test.ts
@@ -4,6 +4,7 @@ import {
   MISSING_COLOUR,
   readTheme,
   REGION_PALETTE,
+  DRAWN_SIZES,
   ThemeWatch,
   type SchemeQuery,
 } from './theme.js';
@@ -62,7 +63,9 @@ describe('readTheme', () => {
     expect(theme.colours.raid).toBe('#c0392b');
     expect(theme.colours.train).toBe('value of --train');
     expect(theme.palette).toEqual(REGION_PALETTE.map((property) => `value of ${property}`));
-    expect(asked.sort()).toEqual([...Object.values(DRAWN_COLOURS), ...REGION_PALETTE].sort());
+    expect(asked.sort()).toEqual(
+      [...Object.values(DRAWN_COLOURS), ...REGION_PALETTE, ...Object.values(DRAWN_SIZES)].sort(),
+    );
   });
 
   it('draws a property the stylesheet lacks in grey, so that the shape still shows', () => {
@@ -71,3 +74,10 @@ describe('readTheme', () => {
     expect(theme.colours.overlap).toBe('#123456');
   });
 });
+
+describe('the sizes of a raid marker (Matt, 2026-10-25)', () => {
+  it('are read from theme.css in pixels, the usual ones where it lacks them', () => {
+    const theme = readTheme((property) => (property === '--raid-middle' ? ' 32px ' : ''));
+    expect(theme.sizes).toEqual({ raidFull: 44, raidMiddle: 32, raidSmall: 20 });
+  });
+});
diff --git a/src/web/client/theme.ts b/src/web/client/theme.ts
index fdd65c1fa35115447751bc9d58456f39142a2e11..b027fa855b7b63ae68d48509693eae97e5e41acb 100644
--- a/src/web/client/theme.ts
+++ b/src/web/client/theme.ts
@@ -59,10 +59,29 @@ export const REGION_PALETTE = [
 
 export type DrawnColour = keyof typeof DRAWN_COLOURS;
 
+/**
+ * The sizes the page draws with Leaflet (Matt, 2026-10-25): a raid marker's circle at each size
+ * (full from zoom 15, middle at 14, small below), in pixels, which the rings round it and the tap
+ * target follow; by their custom properties of `theme.css`.
+ */
+export const DRAWN_SIZES = {
+  raidFull: '--raid-full',
+  raidMiddle: '--raid-middle',
+  raidSmall: '--raid-small',
+} as const;
+
+/** What a size the stylesheet lacks gives. */
+const SIZE_DEFAULTS: Readonly<Record<keyof typeof DRAWN_SIZES, number>> = {
+  raidFull: 44,
+  raidMiddle: 30,
+  raidSmall: 20,
+};
+
 export interface Theme {
   colours: Readonly<Record<DrawnColour, string>>;
   /** Never empty. */
   palette: readonly string[];
+  sizes: Readonly<Record<keyof typeof DRAWN_SIZES, number>>;
 }
 
 /** What a property the stylesheet lacks gives: grey, so that what is drawn still shows. */
@@ -74,7 +93,13 @@ export function readTheme(read: (property: string) => string): Theme {
   const colours = Object.fromEntries(
     Object.entries(DRAWN_COLOURS).map(([name, property]) => [name, value(property)]),
   ) as Record<DrawnColour, string>;
-  return { colours, palette: REGION_PALETTE.map(value) };
+  const sizes = Object.fromEntries(
+    Object.entries(DRAWN_SIZES).map(([name, property]) => {
+      const px = Number.parseFloat(read(property));
+      return [name, Number.isFinite(px) ? px : SIZE_DEFAULTS[name as keyof typeof DRAWN_SIZES]];
+    }),
+  ) as Record<keyof typeof DRAWN_SIZES, number>;
+  return { colours, palette: REGION_PALETTE.map(value), sizes };
 }
 
 /**
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index 688824217c8e9cfe29433fe1edd9d568c3c3441d..a2162f919f42e6d26a1a09de9a5dc8d2d7442a2d 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -57,6 +57,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
   link: 'https://discord.com/channels/1/2',
   attendance: {
     groups: [{ id: 'A', interested: 1, coming: 1, present: 0 }],
+    going: 1,
     mine: null,
     actions: [],
     remote: { offered: false, on: false },
diff --git a/src/web/client/train-ui.isolated.test.ts b/src/web/client/train-ui.isolated.test.ts
index a8ce6d5cd52659437c104644f2d09fa8c7b0842e..0b5783697f9c1c48515aeb734570ef61ccfc32e1 100644
--- a/src/web/client/train-ui.isolated.test.ts
+++ b/src/web/client/train-ui.isolated.test.ts
@@ -251,6 +251,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
   link: 'https://discord.com/channels/1/2',
   attendance: {
     groups: [{ id: 'A', interested: 1, coming: 1, present: 0 }],
+    going: 1,
     mine: null,
     actions: [],
     remote: { offered: false, on: false },
diff --git a/src/web/page-imports.test.ts b/src/web/page-imports.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..47a897bcfcf760d1e47e9136eb7eff037c6ddd93
--- /dev/null
+++ b/src/web/page-imports.test.ts
@@ -0,0 +1,69 @@
+import { existsSync, readFileSync } from 'node:fs';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+
+/**
+ * The facts the live map shares with the Discord side (one source for every fact, Matt
+ * 2026-10-25): every module of `src/domain/` and `src/render/` the map's page imports for what
+ * it runs (not only for types) imports nothing at run time itself, so that the page's bundle and
+ * its type check (no Node) take it whole and never a copy. The map's sources are found from its
+ * entry, `main.ts`, by their imports (the region editor's are left out); read as the bundle would.
+ */
+
+const SRC = path.resolve(import.meta.dirname, '..');
+const CLIENT = path.join(SRC, 'web', 'client');
+
+/** The relative imports of a source that are not for types alone, as resolved `.ts` paths. */
+function runtimeImports(file: string): string[] {
+  const text = readFileSync(file, 'utf8');
+  const found: string[] = [];
+  for (const match of text.matchAll(
+    /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gmu,
+  )) {
+    if (match[1]) continue;
+    const target = path.resolve(path.dirname(file), (match[2] ?? '').replace(/\.js$/u, '.ts'));
+    if (existsSync(target)) found.push(target);
+  }
+  return found;
+}
+
+/** The map page's own sources: from `main.ts`, every client module it reaches. */
+function mapSources(): string[] {
+  const seen = new Set<string>();
+  const queue = [path.join(CLIENT, 'main.ts')];
+  while (queue.length > 0) {
+    const file = queue.pop() ?? '';
+    if (seen.has(file)) continue;
+    seen.add(file);
+    for (const target of runtimeImports(file)) {
+      if (target.startsWith(CLIENT + path.sep)) queue.push(target);
+    }
+  }
+  return [...seen];
+}
+
+describe("the shared modules the map's page imports (plan 8M-7)", () => {
+  it("import nothing of Pine's own at run time", () => {
+    const sources = mapSources();
+    expect(sources.length).toBeGreaterThan(10);
+    // The editor's own sources are not the map's.
+    expect(sources.some((file) => file.endsWith(`${path.sep}editor.ts`))).toBe(false);
+    const shared = new Set(
+      sources
+        .flatMap(runtimeImports)
+        .filter((target) =>
+          [path.join(SRC, 'domain'), path.join(SRC, 'render')].some((root) =>
+            target.startsWith(root + path.sep),
+          ),
+        ),
+    );
+    expect([...shared].map((file) => path.relative(SRC, file))).toEqual(
+      expect.arrayContaining([path.join('domain', 'party', 'raid-stage.ts')]),
+    );
+    for (const file of shared) {
+      // Nothing of Pine's own at run time (a package the bundle takes whole, such as
+      // fastest-levenshtein of `search/text.ts`, is no second implementation).
+      expect(runtimeImports(file), path.relative(SRC, file)).toEqual([]);
+    }
+  });
+});
diff --git a/src/web/raid-marker-tiers.test.ts b/src/web/raid-marker-tiers.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..701a863d189a836cc49ca92ad51a5c7c5bc7ebd5
--- /dev/null
+++ b/src/web/raid-marker-tiers.test.ts
@@ -0,0 +1,31 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+import { describe, expect, expectTypeOf, it } from 'vitest';
+import { RAID_TIER_GROUPS, type RaidTierGroup } from '../domain/pogo/raid-tier.js';
+import type { MapTierGroup } from '../domain/web/party-data.js';
+import { tierColour } from './client/raid-marker.js';
+
+/**
+ * The ring of a raid's marker on the map (plan 8M-7) for every group of tiers the domain makes
+ * (`raidTierGroup`, sent with the list): here, outside `src/web/client/`, since the domain's
+ * tier module is beyond the client's type check (no Node).
+ */
+describe("a raid marker's ring", () => {
+  it('is drawn for every tier group in a property theme.css defines, through a class of map.css', () => {
+    const client = path.resolve(import.meta.dirname, 'client');
+    const theme = readFileSync(path.join(client, 'theme.css'), 'utf8');
+    const map = readFileSync(path.join(client, 'map.css'), 'utf8');
+    for (const group of RAID_TIER_GROUPS) {
+      // The page's type of the group names the same ones.
+      const named: MapTierGroup = group;
+      expect(theme, group).toContain(`${tierColour(named)}:`);
+      expect(map, group).toMatch(new RegExp(String.raw`\.raid-marker\.tier-${group}\b`, 'u'));
+    }
+  });
+});
+
+describe("the page's tier groups", () => {
+  it("are the domain's, both ways (fix round 1)", () => {
+    expectTypeOf<MapTierGroup>().toEqualTypeOf<RaidTierGroup>();
+  });
+});
````

### Task 6: 8M-7 task 6: the list of what is on

Prototype commit: `a43254d33161b4bd763ccf15dffe87bfbb6a5032`

The side pane on the right (on a phone, behind a List button that swaps the map
for it) lists every live thing the layers on show across the server: raids,
trains and meetups, grouped by kind with their counts. A line gives picture,
name, place, distance, time and how many are going, dimmed in a raid's last
minutes. Sort by Nearest (your location, else the map's middle), Soonest or Most
going, kept per browser, ties by name, the unplaced last. Tapping a line flies
the map there and opens its popup, or shows the popup under the line for what
the map does not draw; hovering highlights its marker. Forms of the side pane
open over the list; logged out it says how to log in.

**Files:**

```
 docs/architecture/web.md                    |   3 +-
 src/web/client/list-ui.test.ts              | 172 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/list-ui.ts                   | 237 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/main.ts                      |  64 +++++++++++++++++++++++++--
 src/web/client/map.css                      | 260 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/web/client/parties.ts                   |   5 ++-
 src/web/client/party-layer.isolated.test.ts |  10 ++++-
 src/web/client/party-layer.ts               | 151 +++++++++++++++++++++++++++++++++++++++++++++++++++++-----------
 src/web/client/raid-forms.test.ts           |  46 ++++++++++++++++++++
 src/web/client/raid-forms.ts                |  30 ++++++++++++-
 src/web/client/raid-ui.ts                   |   4 +-
 src/web/client/what-is-on.test.ts           | 352 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/what-is-on.ts                | 290 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/page.test.ts                        |  12 +++++-
 src/web/page.ts                             |   6 ++-
 15 files changed, 1598 insertions(+), 44 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/list-ui.test.ts src/web/client/party-layer.isolated.test.ts src/web/client/raid-forms.test.ts src/web/client/what-is-on.test.ts src/web/page.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff a43254d33161b4bd763ccf15dffe87bfbb6a5032 -- src test scripts data docs/architecture docs/guides docs/web-setup.md docs/superpowers/plans/phase-0-follow-ups.md CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-7 task 6: the list of what is on`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 5d858f6945221830a3c11163a45d3250097d5c81..edc45fcf26182e14b96d93962e2553b3fbb16ca8 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -51,6 +51,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **What each layer draws:** the parties' popups and markers as before (`party-layer.ts`), now in a group per layer (`raids`, `trains`, `meetups`) put on and taken off the map by the registry; the regions' outlines with their labels (`main.ts`; the labels on a pane of their own, `region-labels`, at 350 under the overlay pane of the outlines and of the gyms', stops' and spots' circles and under every marker (round 2), taking no clicks, in 12 px type, so that a name never covers a raid or a gym); the gyms (`gyms-ui.ts`, `showGymDots`) at every zoom, by Pine's grid clustering below zoom 16 (`cluster.ts`, `clustersAt`, `CLUSTER_BELOW`: the places of one 60-pixel cell of a grid fixed on the world are one cluster, drawn as a circle with its count at the middle of its places, `.cluster`, `--cluster`; a tap zooms in on it, at least two zooms and at most to 16; Leaflet.markercluster's last release is from 2020); what is drawn is worked out for the view and half its size round it (`wantedDots`, `DOTS_MARGIN`; keyed `gym:<id>` and `cluster:<cell>:<its gyms>`) and only the difference added or taken off at each move, list or change (`dotsDiff`): the gym whose popup is open is never taken off nor clustered while it is open (fix round 1); which gyms are drawn is `shownGyms` (`gym-dots.ts`): every gym while the Gyms layer is on, or while a gym is to be clicked (route mode, a meetup's place picked: `MapRaids.forced`, the gyms drawn anew after each draw of the parties), and while "Find a gym" holds a word those it matches whatever the layer (Enter fits the map to them and opens the one gym's popup once the map rests); the PokéStops and Power Spots of the view (`places-ui.ts`, `showPlaces`) for a member from zoom 16 (`placesWanted`, `PLACES_FROM`) through `/api/stops` and `/api/powerspots`, asked at once when wanted and again 300 ms after the map rests (`PlacesInView` over `StopLoads`: only the last question's answer shown, nothing after they are no longer wanted), small dots of `--stop` and `--power-spot` with the name in a popup, and "more than shown" in one quiet line at the bottom left of the map ("Zoom in to see every PokéStop here.", `MORE_THAN_SHOWN`, `quietLine`). Live things never cluster.
 - **Raid markers** (`raid-marker.ts`, frame B of the mockups): a circle centered on the gym (`raidMarkerNode`, drawn as an element of ours in a `divIcon`, `raidIcon`, 44 pixels): the post's picture (the boss, or the egg of its tier before it hatches) in a ring of its tier group's color (`MapRaid.tierGroup`, made by the domain's `raidTierGroup` of `src/domain/pogo/raid-tier.ts`: `1`, `3`, `5`, `mega` for Mega, Mega Legendary and Super Mega, `elite`, `shadow` for every shadow raid; `tierColour` names `--tier-<group>`; `raid-marker-tiers.test.ts` holds `theme.css` and `map.css` to every group of `RAID_TIER_GROUPS`), a time badge under it (`badgeFor`: "12m", "1h 05m" while it runs, "hatches 2:40" before the hatch, the posts' time by `clockTime` with AM or PM left out today only, "hatches Wed, Oct 14, 2:00 PM" another day; "egg" or "hatched" where nobody said when, "ended" by `stageAt`), and a green count of those going (`MapAttendance.going`, made by the domain's `goingCount` of `party.ts`: the committed heads of the whole party, coming, here and asked whether done, +1s counted, the lobbies' own rule that `lobbyCount` shares; none at zero). Raids shrink as the map zooms out and are still never grouped (Matt, 2026-10-25; `markerSize`): from zoom 15 the full marker (`--raid-full`, 44 px, with its badge and count), at 14 a smaller circle with the count and no badge (`--raid-middle`, 30 px), at 13 and below a small circle with the boss picture in its ring and no badge or count (`--raid-small`, 20 px); sizes are named values of `theme.css`, read by `theme().sizes` for what Leaflet draws; the tap target is never under 32 pixels (`tapBox`, a clear margin round a small circle), the train's and meetup's rings round a raid scale with its circle (`ringSizes(circle)`), and a zoom into another size draws the parties anew. Nearly over, it is dimmed (`isDimmed`: hatched by the clock, `stageAt` of `src/domain/party/raid-stage.ts`, which `raidStage` reads raids through, and `endsSoon` of `src/domain/time/ending-soon.ts`, the five minutes `/max`'s ending-soon question asks by: one rule). The page keeps badges and dimming current every 15 s from the times on the marker (`data-stage`, `data-hatch`, `data-end`; `markerNow`, by the same rules as at the draw), an egg turning into its time left as it hatches. One source for every fact (Matt, 2026-10-25): what the page shows or decides of a party is computed by the domain code the Discord side uses, sent with the list or imported from a pure module of `src/domain/` that imports nothing (`raid-stage.ts`, `ending-soon.ts`), never a second implementation; only the words are the page's. A gym with a raid shows the raid, not its gym dot, while the Raids layer is on (`hiddenGyms`, `MapRaids.raidGyms`); off, the dot is back. Trains and meetups keep their drawing (rings, a line), restyled; at a gym whose raid circle is drawn, their rings go round it rather than over the boss (`ringSizes`: the train's just outside the 44-pixel circle, radius 26, the meetup's outside the train's, radius 31; the old sizes elsewhere, and again when the Raids layer is off). A gym of several raids is drawn by one lead raid, the first with a picture, else the first (`leadRaid`): picture, ring, badge and count are all that raid's. A raid is named everywhere on the map (its popup, the list, the list of things at one place) in its post's own heading words, `MapRaid.heading` (`raidLook` over the renderer's `headlineParts`: `Level 5 raid against Yveltal`, `Level 5 raid (egg)`, without the shiny mark; the tier's words where the renderer gave none), and its popup reads its stage by the clock (`stageAt`), not the list's `stage`.
 - **Several things at one place** (`shared-place.ts`): when more than one shown thing sits at the same place (the same gym, or within 12 pixels at the current zoom, `sharedPlace`, `SHARED_PIXELS`; a raid marker, a train's ring, a meetup's ring, and a gym's dot tapped where parties share it, `MapRaids.gymTapped`), a tap on any of them opens one popup listing each (`placeListNode`: picture, name, time: the lead raid's `heading` and badge, a train's or meetup's `startWords`), and a choice (`data-open`) opens that thing's own popup as before. A layer turned off takes its things out, and the overlap with them. This replaces the tap on a ring's line of the 8S-4 staging: the rings still take clicks on their line alone, but a tap on what they ring lists them.
+- **The list of what is on** (`what-is-on.ts`, pure; drawn by `list-ui.ts`, `WhatIsOn`; plan 8M-7, replacing the side panel "Meetups and other parties"): on the desktop the side pane on the right (`#parties`, "What is on"), under the trains' box; on a phone the header's "List" button (`#list-button`, `body.list-open`) swaps the map for it and back. It holds every live thing the layers on show across the whole server, not only what is in view (`listLines`: raids, trains, meetups; wild spawns once a route lists them), grouped by kind in that order, each group headed with its count (`listGroups`: "Raids · 5"), under "What's on · n". A line (`lineWords`, a button): the picture (a ring of the kind's color without one), the name (`raidName`, a train's or meetup's), the place (a raid's gym, as the map has it or as its post names it; a train's `stopLine`; a meetup's words), the distance (from your location, else the map's middle; none without a place), the time ("30m left", "hatches 2:40 PM", `startWords`), "4 going" (`MapAttendance.going`); dimmed in a raid's last minutes (`isDimmed`). Sort, kept per browser (`localStorage` `pine-map-sort`, try/catch, `readSort` / `writeSort`): Nearest (the default), Soonest (a raid's end, a train's or meetup's start; none last), Most going; ties by name, and what has no point at all last in its group whatever the sort. Tapping a line whose thing the map draws (its layer on) flies the map there (street level or closer) and opens its popup once the map rests (on a phone, back to the map first, `PartyFrame.showMap`); a thing the map does not draw (a train without a route or with none of its stops on the map, a raid at a gym the map does not show, a meetup without a place) shows its popup under its line instead (`detail`: `raidPopup`, `trainPopup` with its actions, `meetupPopup` with Edit…, as the side panel showed them). Hovering a line on the desktop highlights its marker (`highlighted`: a ring round a raid's circle, a thicker line for a ring). A form that opens in the side pane (the start form, route mode, a meetup's form or editor) is shown over the list, which comes back when it closes (`paneShows`). Drawn anew with each list and a change of sort; a move of the map, a change of layers and a new fix of your location (only sorted Nearest, and only once it moved more than 25 m, `fixRedraws`) draw it too, but never while a form holds: then once, when the form lets go (`ListRefresh`, fix round 1). A line shown with its popup under it is kept by its key (`WhatIsOn.kept`): drawn anew for a move, a fix or a change of layers, only its own words change and its popup (a group menu, a field) stays, the focus given back where it was; drawn from a new list (`show`), its popup is drawn anew from it (counts, "You:", buttons), the group chosen in its menu kept while that group is still offered and the focus given to the control of the same kind (round 2); a change form opened in such a line takes the hold with its `alive` (`FormHold.take(…, alive)`), so that the hold lets go whenever the form goes away (`checkGone`, after each drawing of the list and with each new list). Whether a form of the pane's box holds is recomputed as a form takes the hold or lets it go (`FormHoldDeps.changed`, `asideHeld`); on a phone such a form, which needs the map (route mode, a meetup's place picked, any form of the box), shows the map with the pane docked under it, 40% of the screen, whatever "List" says (`body.form-docked`). The phone's header is one row: the title, Layers, List, a "Find" button that opens "Find a gym" over the map (`#search-button`, `body.search-open`; Escape closes it, and closing it empties it, so that no word filters the map unseen) and the account (the member's name, cut to fit, its menu holding Log out), none of them wrapping; what the header says beside the account goes under it. Tried at staging on a phone: List swaps the map for the list and back, a tap on a line returns to the map at the thing, a form of the pane docks under the map. Logged out, the pane says "Log in to see what is on." with "Log in with Discord" (or how to log in with `/maps`); logged in without counting as a member, "Only members of this server see what is on." (`loggedOutPane`).
 - **Distances** (`distance.ts`): `metersBetween`, which is `metresBetween` of `@pine/wayspot-core/distance` itself (the function the place search and Wayfarer matching measure with: one source for every fact, Matt 2026-10-25), and `distanceWords` (`src/render/distance-words.ts`, import-free, so that Discord's side can share it once Matt rules on one rule for both: the map says miles and feet, Discord meters and kilometers): under a tenth of a mile in feet, rounded to 10 (`60 ft`), else miles to one decimal (`1.3 mi`).
 
 ## The parties on the map (plan 8M-3)
@@ -59,7 +60,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`) and its group (`tierGroup`, `raidTierGroup`, plan 8M-7), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), how many are going (`going`, plan 8M-7: `goingCount`, the lobbies' rule over the whole party), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups in letter order (plan 8X-G, `inLetterOrder`; newest first before) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; Group… and Meet… are not on the map: follow-ups, the web UX sweep); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Since plan 8X-5 the view has `maxes` beside `raids`, `trains` and `meetups` (below, "Max battles on the map"), and every party's attendance says the member's Remote switch (`remote: { offered, on }`: `on` whether the member takes part remotely, false while not signed up, nobody else's; `offered` where the post has Remote, `remoteAllowed`, every party but an elite raid, never while read-only); Remote is pressed apart from `actions` (`MAP_REMOTE`), which the page draws as buttons. Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
 - **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join`, `here` (each with body `{ group }`, the group a newcomer chose in the popup, plan 8X-1B: the dialog's Submit by the group's letter, `joinChosen` through `StatusPress` `chosen`, so a member signed up meanwhile keeps their own group; `joinInto` is left to the letter Join of a post drawn before plan 8X-1B), `leave`, `done`, and `remote` (plan 8X-5, `MAP_REMOTE`, no body: toggles the member's Remote as the post's button does, `AttendanceService.setRemote(…, 'toggle')`, answered in `remoteWords`; a newcomer is signed up as interested and remote, an elite raid refused in the post's words, 422; for every kind whose post has Remote); any other action 404, a body other than an optional group letter with those three 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This has ended.", as `answerClick` says it: only what a raid alone has, `isRaidAction` (Set time, Screenshot feedback), is said to be a raid's, and no press of the map is one of those; Done is a max battle's too, plan 8X-3); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
 - **Rehearsal mode** (8C) leaves the web server off (`servedSettings`); were it on, a press would still go through `AttendanceService` over the wrapped party gateway, as every click does.
-- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; since plan 8M-7 the circle of its lead raid, `leadRaid`: "The map's frame" below), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), meetups and raids at gyms the map does not show in the side panel `#parties` (in the template, hidden until it has something; such a raid is named by its `place`, with the address line and Directions a gym's popup has, `raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
+- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; since plan 8M-7 the circle of its lead raid, `leadRaid`: "The map's frame" below), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), and everything in the list of what is on (plan 8M-7, "The map's frame" above), where a raid at a gym the map does not show is named by its `place`, with the address line and Directions a gym's popup has (`raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
 
 ## Raids on the map (plan 8M-4)
 
diff --git a/src/web/client/list-ui.test.ts b/src/web/client/list-ui.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..73befca4a26615470cb1d5c4719e5c133ba73503
--- /dev/null
+++ b/src/web/client/list-ui.test.ts
@@ -0,0 +1,172 @@
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import type { LayerRegistry } from './layer-registry.js';
+import { WhatIsOn } from './list-ui.js';
+import type { ListLine } from './what-is-on.js';
+
+/** Just enough of the DOM for the list: elements in a tree, attributes, values, listeners. */
+class FakeElement {
+  className = '';
+  textContent = '';
+  type = '';
+  value = '';
+  selected = false;
+  hidden = false;
+  parent: FakeElement | undefined;
+  readonly children: FakeElement[] = [];
+  readonly attributes = new Map<string, string>();
+  private readonly listeners = new Map<string, Array<() => void>>();
+
+  constructor(readonly tagName: string) {}
+
+  get firstElementChild(): FakeElement | null {
+    return this.children[0] ?? null;
+  }
+
+  get options(): FakeElement[] {
+    return this.children;
+  }
+
+  append(...nodes: FakeElement[]): void {
+    for (const node of nodes) {
+      node.parent?.children.splice(node.parent.children.indexOf(node), 1);
+      node.parent = this;
+      this.children.push(node);
+    }
+  }
+
+  replaceChildren(...nodes: FakeElement[]): void {
+    for (const child of this.children.splice(0)) child.parent = undefined;
+    this.append(...nodes);
+  }
+
+  replaceChild(next: FakeElement, old: FakeElement): void {
+    const at = this.children.indexOf(old);
+    next.parent?.children.splice(next.parent.children.indexOf(next), 1);
+    this.children[at] = next;
+    next.parent = this;
+    old.parent = undefined;
+  }
+
+  setAttribute(name: string, value: string): void {
+    this.attributes.set(name, value);
+  }
+
+  addEventListener(type: string, listener: () => void): void {
+    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
+  }
+
+  fire(type: string): void {
+    for (const listener of this.listeners.get(type) ?? []) listener();
+  }
+
+  contains(node: FakeElement): boolean {
+    return node === this || this.children.some((child) => child.contains(node));
+  }
+
+  /** `tag[attribute]` only, as the list asks. */
+  querySelector(selector: string): FakeElement | null {
+    const [, tag, attribute] = /^(\w+)\[([\w-]+)\]$/u.exec(selector) ?? [];
+    const find = (node: FakeElement): FakeElement | null => {
+      for (const child of node.children) {
+        if (child.tagName === tag && child.attributes.has(attribute ?? '')) return child;
+        const deeper = find(child);
+        if (deeper) return deeper;
+      }
+      return null;
+    };
+    return find(this);
+  }
+
+  /** Every element of the tree under it with this tag. */
+  all(tag: string): FakeElement[] {
+    return this.children.flatMap((child) => [
+      ...(child.tagName === tag ? [child] : []),
+      ...child.all(tag),
+    ]);
+  }
+
+  words(): string {
+    return [this.textContent, ...this.children.map((child) => child.words())].join(' ');
+  }
+}
+
+const LINE: ListLine = {
+  key: 'train:t2',
+  kind: 'trains',
+  id: 't2',
+  marker: null,
+  name: 'Evening train',
+  place: 'No route yet',
+  point: null,
+  picture: null,
+  going: 2,
+  soonest: null,
+  times: { start: null },
+};
+
+describe('a line of the list shown with its popup (fix round 2)', () => {
+  afterEach(() => {
+    vi.unstubAllGlobals();
+  });
+
+  /** The list over the fake DOM; the line's popup drawn from `party`, as the page has it now. */
+  const listed = () => {
+    vi.stubGlobal('document', {
+      createElement: (tag: string) => new FakeElement(tag),
+      activeElement: null,
+    });
+    vi.stubGlobal('HTMLElement', FakeElement);
+    vi.stubGlobal('HTMLImageElement', class {});
+    const party = { coming: 2, groups: ['A', 'B'] };
+    const section = new FakeElement('section');
+    const list = new WhatIsOn({
+      section: section as unknown as HTMLElement,
+      registry: { isOn: () => true } as unknown as LayerRegistry,
+      storage: undefined,
+      origin: () => undefined,
+      zone: () => 'America/New_York',
+      open: () => false,
+      highlight: () => undefined,
+      detail: () => {
+        const detail = new FakeElement('div');
+        const counts = new FakeElement('div');
+        counts.textContent = `Coming ${party.coming}`;
+        const pick = new FakeElement('select');
+        pick.setAttribute('data-group-pick', '');
+        for (const group of ['', ...party.groups]) {
+          const option = new FakeElement('option');
+          option.value = group;
+          pick.append(option);
+        }
+        detail.append(counts, pick);
+        return detail as unknown as HTMLElement;
+      },
+    });
+    list.show([LINE]);
+    const [button] = section.all('button');
+    button?.fire('click');
+    const pick = () => section.querySelector('select[data-group-pick]');
+    return { section, list, party, pick };
+  };
+
+  it('draws its popup anew from a new list, keeping the group chosen while it is offered', () => {
+    const { section, list, party, pick } = listed();
+    expect(section.words()).toContain('Coming 2');
+    const chosen = pick();
+    if (!chosen) throw new Error('no group menu');
+    chosen.value = 'B';
+    // A move of the map (ListRefresh): the popup stays as it is, the very same element.
+    list.render();
+    expect(pick()).toBe(chosen);
+    // A new list with other attendance: the popup drawn anew, the group chosen kept.
+    party.coming = 5;
+    list.show([LINE]);
+    expect(section.words()).toContain('Coming 5');
+    expect(pick()).not.toBe(chosen);
+    expect(pick()?.value).toBe('B');
+    // The group is no longer offered: the menu's own first choice.
+    party.groups = ['A'];
+    list.show([LINE]);
+    expect(pick()?.value).toBe('');
+  });
+});
diff --git a/src/web/client/list-ui.ts b/src/web/client/list-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5c219200bedc8827547c6889fc4a97c4f9824ecb
--- /dev/null
+++ b/src/web/client/list-ui.ts
@@ -0,0 +1,237 @@
+import type { LayerRegistry } from './layer-registry.js';
+import type { LatLon, ViewStorage } from './view.js';
+import {
+  lineWords,
+  listGroups,
+  readSort,
+  SORTS,
+  writeSort,
+  type ListLine,
+  type ListSort,
+} from './what-is-on.js';
+
+/**
+ * The list of what is on, drawn (plan 8M-7; the pure part is `what-is-on.ts`): on the desktop in
+ * the side pane on the right, under the trains' box; on a phone behind the header's "List"
+ * button, which swaps the map for it. A heading with the count, the sort (kept per browser), the
+ * groups of the layers on, a line per thing (a button: picture, name, place, distance, time, how
+ * many are going). Tapping a line flies the map there and opens its popup (`open`; a thing the
+ * map does not draw opens its popup in the list instead, as the side panel showed it before);
+ * hovering a line on the desktop highlights its marker (`highlight`).
+ */
+export interface WhatIsOnDeps {
+  /** The section of the side pane the list is drawn in. */
+  section: HTMLElement;
+  registry: LayerRegistry;
+  storage: ViewStorage | undefined;
+  /** Where distances are measured from: your location, else the map's middle. */
+  origin(): LatLon | undefined;
+  zone(): string;
+  /** A line tapped: fly there and open it; false where the map does not draw it. */
+  open(line: ListLine): boolean;
+  highlight(line: ListLine, on: boolean): void;
+  /** The popup of a thing the map does not draw, shown under its line. */
+  detail(line: ListLine): HTMLElement | undefined;
+  /** Drawn: a form of a line that went with it lets its claim go (fix round 1). */
+  rendered?(): void;
+}
+
+export class WhatIsOn {
+  private lines: ListLine[] = [];
+  private sort: ListSort;
+  /** The lines whose popup is shown under them (things the map does not draw). */
+  private readonly expanded = new Set<string>();
+
+  /**
+   * The lines shown with their popup under them, by key (fix round 1): drawn anew, only their own
+   * line's words and place change; the popup under it (a group menu, a field, the focus) stays.
+   */
+  private readonly kept = new Map<string, HTMLLIElement>();
+  /** Whether the drawing under way is of a new list (`show`). */
+  private anew = false;
+
+  constructor(private readonly deps: WhatIsOnDeps) {
+    this.sort = readSort(deps.storage);
+  }
+
+  /** The sort chosen. */
+  get sorted(): ListSort {
+    return this.sort;
+  }
+
+  /**
+   * The list of parties changed: a line shown with its popup draws its popup anew from it (its
+   * counts, "You:", its buttons), the group chosen in its menu kept while that group is still
+   * offered, and the focus given back to its control of the same kind (fix round 2).
+   */
+  show(lines: ListLine[]): void {
+    this.lines = lines;
+    this.render(true);
+  }
+
+  /**
+   * Draws the list. `anew`: from a new list of parties (`show`); without it (a move of the map, a
+   * fix of your location, a change of layers: `ListRefresh`), a line's popup stays as it is.
+   */
+  render(anew = false): void {
+    this.anew = anew;
+    const { deps } = this;
+    const now = Date.now();
+    const origin = deps.origin();
+    const groups = listGroups(this.lines, {
+      on: (kind) => deps.registry.isOn(kind),
+      sort: this.sort,
+      origin,
+    });
+    const header = document.createElement('header');
+    const heading = document.createElement('h2');
+    heading.textContent = `What's on · ${groups.reduce((sum, group) => sum + group.lines.length, 0)}`;
+    const sort = document.createElement('select');
+    sort.setAttribute('aria-label', 'Sort');
+    for (const [value, name] of SORTS) {
+      const option = document.createElement('option');
+      option.value = value;
+      option.textContent = name;
+      option.selected = value === this.sort;
+      sort.append(option);
+    }
+    sort.addEventListener('change', () => {
+      this.sort = sort.value as ListSort;
+      writeSort(deps.storage, this.sort);
+      this.render();
+    });
+    header.append(heading, sort);
+    const body: HTMLElement[] = [header];
+    if (groups.length === 0) {
+      const empty = document.createElement('p');
+      empty.className = 'empty';
+      empty.textContent = 'Nothing is on just now.';
+      body.push(empty);
+    }
+    for (const group of groups) {
+      const title = document.createElement('h3');
+      title.textContent = group.heading;
+      const list = document.createElement('ul');
+      list.className = 'list-lines';
+      for (const line of group.lines) list.append(this.item(line, origin, now));
+      body.push(title, list);
+    }
+    // A field of a line's popup keeps the focus where it had it.
+    const focused = document.activeElement;
+    const inside = focused instanceof HTMLElement && deps.section.contains(focused);
+    deps.section.replaceChildren(...body);
+    if (inside && document.activeElement !== focused) {
+      // A popup drawn anew: the control of the same kind in it (its tag and `data-` attributes).
+      const twin = focused.isConnected ? focused : sameControl(deps.section, focused);
+      twin?.focus();
+    }
+    for (const key of [...this.kept.keys()]) {
+      if (!this.expanded.has(key)) this.kept.delete(key);
+    }
+    deps.rendered?.();
+  }
+
+  private item(line: ListLine, origin: LatLon | undefined, now: number): HTMLLIElement {
+    const words = lineWords(line, origin, now, this.deps.zone());
+    const item = document.createElement('li');
+    item.className = words.dimmed ? 'line dim' : 'line';
+    const button = document.createElement('button');
+    button.type = 'button';
+    button.className = 'line-main';
+    const picture = line.picture === null ? document.createElement('span') : new Image();
+    if (picture instanceof HTMLImageElement) {
+      picture.src = line.picture ?? '';
+      picture.alt = '';
+    }
+    picture.className = `picture ${line.kind}`;
+    const middle = document.createElement('span');
+    middle.className = 'words';
+    const name = document.createElement('span');
+    name.className = 'name';
+    name.textContent = words.name;
+    const place = document.createElement('span');
+    place.className = 'place';
+    place.textContent = words.place ?? '';
+    middle.append(name, place);
+    const side = document.createElement('span');
+    side.className = 'side';
+    const distance = document.createElement('strong');
+    distance.textContent = words.distance ?? '';
+    const when = document.createElement('span');
+    when.textContent = [words.time, words.going].filter((part) => part !== '').join(' · ');
+    side.append(distance, when);
+    button.append(picture, middle, side);
+    button.addEventListener('click', () => {
+      if (this.deps.open(line)) return;
+      if (this.expanded.has(line.key)) this.expanded.delete(line.key);
+      else this.expanded.add(line.key);
+      this.render();
+    });
+    button.addEventListener('mouseenter', () => {
+      this.deps.highlight(line, true);
+    });
+    button.addEventListener('mouseleave', () => {
+      this.deps.highlight(line, false);
+    });
+    if (this.expanded.has(line.key)) {
+      const kept = this.kept.get(line.key);
+      if (kept?.firstElementChild && !this.anew) {
+        kept.className = item.className;
+        kept.replaceChild(button, kept.firstElementChild);
+        return kept;
+      }
+      item.append(button);
+      const detail = this.deps.detail(line);
+      if (detail) {
+        // From the popup drawn before: the group chosen, while it is offered.
+        const before = kept?.querySelector<HTMLSelectElement>('select[data-group-pick]');
+        const pick = detail.querySelector<HTMLSelectElement>('select[data-group-pick]');
+        if (before && pick && [...pick.options].some((one) => one.value === before.value)) {
+          pick.value = before.value;
+        }
+        item.append(detail);
+      }
+      this.kept.set(line.key, item);
+      return item;
+    }
+    item.append(button);
+    return item;
+  }
+}
+
+/** The control in `root` of the same tag and `data-` attributes as `control`, if any. */
+function sameControl(root: HTMLElement, control: HTMLElement): HTMLElement | null {
+  const data = control
+    .getAttributeNames()
+    .filter((name) => name.startsWith('data-'))
+    .map((name) => `[${name}="${CSS.escape(control.getAttribute(name) ?? '')}"]`)
+    .join('');
+  return root.querySelector<HTMLElement>(`${control.tagName.toLowerCase()}${data}`);
+}
+
+/** The side pane of somebody who is not a member: how to log in, or that it is for members. */
+export function loggedOutPane(
+  section: HTMLElement,
+  login: 'discord' | 'links' | 'member-only',
+): void {
+  const heading = document.createElement('h2');
+  heading.textContent = "What's on";
+  const line = document.createElement('p');
+  line.textContent =
+    login === 'member-only'
+      ? 'Only members of this server see what is on.'
+      : 'Log in to see what is on.';
+  const parts: HTMLElement[] = [heading, line];
+  if (login === 'discord') {
+    const link = document.createElement('a');
+    link.className = 'press primary login';
+    link.href = `/auth/login?next=${encodeURIComponent(location.pathname)}`;
+    link.textContent = 'Log in with Discord';
+    parts.push(link);
+  } else if (login === 'links') {
+    const how = document.createElement('p');
+    how.textContent = 'Use /maps in Discord to log in.';
+    parts.push(how);
+  }
+  section.replaceChildren(...parts);
+}
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 62cf05d070801f9a251ee2cc86661a7e9252ca56..d6bccd8e4d986024311780aa54534b0b478047bd 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -4,6 +4,7 @@ import { addTiles, byId, getJson, say, showAccount, tileSetting } from './common
 import { showGymDots, type GymDots } from './gyms-ui.js';
 import { LayerRegistry, MAP_LAYERS, regionLabelsShown } from './layer-registry.js';
 import { showLayerControls } from './layers-ui.js';
+import { loggedOutPane } from './list-ui.js';
 import { loginNotice } from './notice.js';
 import { showParties } from './party-layer.js';
 import { quietLine, showPlaces } from './places-ui.js';
@@ -162,6 +163,39 @@ function start(): void {
   const quiet = quietLine(map);
   const account = showAccount(guild, data.login === 'discord' ? 'discord' : 'links', 'map');
   const you = showWhereYouAre(map, say);
+  // On a phone (`map.css`) "List" swaps the map for the list of what is on, and back (plan 8M-7).
+  const listButton = byId('list-button');
+  const showList = (open: boolean): void => {
+    document.body.classList.toggle('list-open', open);
+    listButton.textContent = open ? 'Map' : 'List';
+    listButton.setAttribute('aria-pressed', String(open));
+    if (!open) map.invalidateSize();
+  };
+  listButton.addEventListener('click', () => {
+    showList(!document.body.classList.contains('list-open'));
+  });
+  // On a phone "Find a gym" opens over the map from the search button of the one row (fix round 1).
+  const searchButton = byId('search-button');
+  const filterBox = byId('filter') as HTMLInputElement;
+  const showSearch = (open: boolean): void => {
+    document.body.classList.toggle('search-open', open);
+    searchButton.setAttribute('aria-expanded', String(open));
+    if (open) filterBox.focus();
+    else if (filterBox.value !== '') {
+      // Closed, its words no longer filter the map unseen (round 2).
+      filterBox.value = '';
+      filterBox.dispatchEvent(new Event('input'));
+    }
+  };
+  searchButton.addEventListener('click', () => {
+    showSearch(!document.body.classList.contains('search-open'));
+  });
+  filterBox.addEventListener('keydown', (event) => {
+    if (event.key === 'Escape') {
+      showSearch(false);
+      searchButton.focus();
+    }
+  });
   showGeo(map, guild, you, registry)
     .then(async ({ gyms, names, regions, dots }) => {
       // The parties of the server for a member who is logged in (plan 8M-3); while Discord
@@ -172,10 +206,34 @@ function start(): void {
       const member = me.loggedIn && (me.member || me.readOnly);
       controls.refresh(member);
       showPlaces(map, guild, registry, quiet, () => member);
-      if (!me.loggedIn || !member) return;
+      if (!me.loggedIn || !member) {
+        // The side pane says how to see what is on (plan 8M-7).
+        const pane = byId('parties');
+        const section = document.createElement('section');
+        section.className = 'what-is-on';
+        loggedOutPane(
+          section,
+          me.loggedIn ? 'member-only' : data.login === 'discord' ? 'discord' : 'links',
+        );
+        pane.replaceChildren(section);
+        pane.hidden = false;
+        map.invalidateSize();
+        return;
+      }
       const mayReport = me.member && !me.readOnly;
-      const raids = showParties(map, guild, me, gyms, names, regions, mayReport, registry, () => {
-        dots.refresh();
+      const raids = showParties(map, guild, me, gyms, names, regions, mayReport, {
+        registry,
+        afterDraw: () => {
+          dots.refresh();
+        },
+        located: () => you.located(),
+        onMove: (listener) => {
+          you.onMove(listener);
+        },
+        storage: browserStorage(),
+        showMap: () => {
+          showList(false);
+        },
       });
       gymExtras.editing = () => raids.editing();
       gymExtras.of = (gym) => raids.gymControls(gym);
diff --git a/src/web/client/map.css b/src/web/client/map.css
index c234a235e1957658c3d3af992e15307102aa383c..f7cd3a28fbcaf26fdd2c3152a8c5a0aaae171072 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -409,19 +409,271 @@ a {
   font-size: 16px;
 }
 
-@media (max-width: 700px) {
-  #content {
-    flex-direction: column;
+/*
+ * The list of what is on (plan 8M-7): the side pane on the desktop; on a phone "List" swaps the
+ * map for it (`body.list-open`).
+ */
+.list-button {
+  display: none;
+  padding: 6px 12px;
+  border: 0;
+  border-radius: 16px;
+  background: var(--secondary);
+  color: var(--secondary-text);
+  font: inherit;
+  font-weight: 600;
+  cursor: pointer;
+}
+
+@media (max-width: 767px) {
+  .list-button {
+    display: inline-block;
+  }
+
+  /*
+   * One row (fix round 1): the title, Layers, List, the search button and the account; "Find a
+   * gym" opens over the map from the search button (`body.search-open`).
+   */
+  #header {
+    position: relative;
+    flex-wrap: nowrap;
+  }
+
+  #header {
+    gap: 6px;
+    padding: 8px;
+  }
+
+  /* The member's name, the account menu's button, cut to fit the row. */
+  .account-menu summary {
+    display: block;
+    max-width: 22vw;
+    overflow: hidden;
+    text-overflow: ellipsis;
+  }
+
+  #layers .layers-button,
+  .list-button,
+  #header .search-button,
+  .account-menu summary {
+    padding: 6px 10px;
+  }
+
+  /* What the header says beside the account goes under it, never across the row. */
+  #account {
+    min-width: 0;
+    justify-content: flex-end;
+  }
+
+  #account .line {
+    flex-basis: 100%;
+    font-size: 12px;
+    text-align: right;
+  }
+
+  #header .search-button {
+    display: inline-block;
+  }
+
+  #filter {
+    display: none;
+  }
+
+  body.search-open #filter {
+    position: absolute;
+    z-index: 1100;
+    top: calc(100% + 6px);
+    left: 8px;
+    right: 8px;
+    display: block;
+    max-width: none;
+    box-sizing: border-box;
+    box-shadow: 0 2px 8px var(--shadow);
   }
 
   #parties {
+    display: none;
     width: auto;
-    max-height: 40vh;
+    flex: 1;
     border-left: 0;
+  }
+
+  body.list-open #parties:not([hidden]) {
+    display: block;
+  }
+
+  body.list-open #map {
+    display: none;
+  }
+
+  /*
+   * A form of the side pane that needs the map (route mode, a meetup's place picked, any form of
+   * its box): the map shown with the pane docked under it, whatever "List" says (fix round 1).
+   */
+  body.form-docked #content {
+    flex-direction: column;
+  }
+
+  body.form-docked #map,
+  body.list-open.form-docked #map {
+    display: block;
+  }
+
+  body.form-docked #parties:not([hidden]) {
+    display: block;
+    flex: none;
+    max-height: 40vh;
     border-top: 1px solid var(--line);
   }
 }
 
+.search-button {
+  display: none;
+  padding: 6px 12px;
+  border: 0;
+  border-radius: 16px;
+  background: var(--secondary);
+  color: var(--secondary-text);
+  font: inherit;
+  font-weight: 600;
+  cursor: pointer;
+}
+
+.what-is-on header {
+  display: flex;
+  align-items: center;
+  gap: 8px;
+  margin-bottom: 4px;
+}
+
+.what-is-on h2 {
+  flex: 1;
+  margin: 0;
+  font-size: 16px;
+}
+
+.what-is-on header select {
+  padding: 4px 8px;
+  border: 1px solid var(--field-border);
+  border-radius: var(--radius);
+  background: var(--field-bg);
+  color: var(--text);
+  font: inherit;
+  font-size: 13px;
+}
+
+.what-is-on h3 {
+  margin: 10px 0 2px;
+  color: var(--muted);
+  font-size: 12px;
+  font-weight: 700;
+  letter-spacing: 0.02em;
+  text-transform: uppercase;
+}
+
+.what-is-on .empty {
+  color: var(--muted);
+}
+
+.list-lines {
+  margin: 0;
+  padding: 0;
+  list-style: none;
+}
+
+.list-lines .line-main {
+  display: grid;
+  grid-template-columns: 36px 1fr auto;
+  align-items: center;
+  gap: 10px;
+  width: 100%;
+  padding: 6px 4px;
+  border: 0;
+  border-radius: var(--radius);
+  background: none;
+  color: var(--text);
+  font: inherit;
+  text-align: left;
+  cursor: pointer;
+}
+
+.list-lines .line-main:hover,
+.list-lines .line-main:focus-visible {
+  background: var(--chip-on-bg);
+}
+
+.list-lines .line.dim {
+  opacity: 0.5;
+}
+
+.list-lines .picture {
+  width: 36px;
+  height: 36px;
+  border-radius: 50%;
+}
+
+.list-lines span.picture {
+  box-sizing: border-box;
+  border: 3px solid var(--muted);
+}
+
+.list-lines span.picture.trains {
+  border-color: var(--train);
+}
+
+.list-lines span.picture.meetups {
+  border-color: var(--meetup);
+}
+
+.list-lines span.picture.raids {
+  border-color: var(--raid);
+}
+
+.list-lines .words {
+  display: flex;
+  flex-direction: column;
+  min-width: 0;
+}
+
+.list-lines .name {
+  font-weight: 600;
+}
+
+.list-lines .place,
+.list-lines .side {
+  color: var(--muted);
+  font-size: 12px;
+}
+
+.list-lines .side {
+  display: flex;
+  flex-direction: column;
+  align-items: flex-end;
+  text-align: right;
+}
+
+.list-lines .side strong {
+  color: var(--text);
+  font-size: 13px;
+}
+
+.line-detail {
+  margin: 4px 0 8px;
+  padding: 8px 10px;
+  border-left: var(--card-bar) solid var(--accent);
+  border-radius: var(--card-radius);
+  background: var(--card-bg);
+}
+
+/* A line hovered on the desktop: its marker stands out. */
+.raid-icon.highlighted .ring {
+  box-shadow: 0 0 0 4px var(--primary);
+}
+
+path.highlighted {
+  stroke-width: 7px;
+}
+
 /* Leaflet's own parts, in the theme's colors. */
 .leaflet-container {
   background: var(--map-bg);
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index 191367191522a8807f659cd3685b6d21ee389d92..49fe3453e31214ab846ff0c70da23e3e26e321b2 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -360,7 +360,10 @@ export function trainPlaces(
 }
 
 /** Where a train is on its route: `At stop 2 of 5: Library`, finished, or without a route. */
-function stopLine(train: MapTrain, context: ShowContext): string {
+export function stopLine(
+  train: Pick<MapTrain, 'route' | 'stop' | 'spots'>,
+  context: Pick<ShowContext, 'gym'>,
+): string {
   if (train.route.length === 0) return 'No route yet';
   if (train.stop === null) return 'Route finished';
   const key = train.route[train.stop];
diff --git a/src/web/client/party-layer.isolated.test.ts b/src/web/client/party-layer.isolated.test.ts
index f81ba1a88e7c7faef6f8d5cfc365a71f4f82710b..6244be1625bd1b2366cfdb3c089376eb259ed50c 100644
--- a/src/web/client/party-layer.isolated.test.ts
+++ b/src/web/client/party-layer.isolated.test.ts
@@ -231,8 +231,14 @@ describe("the map's popups (showParties)", () => {
       new Map(),
       [],
       false,
-      new LayerRegistry(undefined),
-      () => undefined,
+      {
+        registry: new LayerRegistry(undefined),
+        afterDraw: () => undefined,
+        located: () => undefined,
+        onMove: () => undefined,
+        storage: undefined,
+        showMap: () => undefined,
+      },
     );
     /** Leaflet fires an event on the map. */
     const fire = (type: string, event: unknown) => {
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index a21873ee51d4f65e1e25db4de219b2f666c64502..2f3e89a938174b3c243db0b04e6333cae78bcec0 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -1,6 +1,6 @@
 import * as L from 'leaflet';
 import type { GeoView } from '../../domain/web/geo-data.js';
-import type { MapTrain, PartiesView } from '../../domain/web/party-data.js';
+import type { PartiesView } from '../../domain/web/party-data.js';
 import { byId, getJson, say } from './common.js';
 import { meetupActions, meetupHereBox } from './meetup-forms.js';
 import { meetupUi } from './meetup-ui.js';
@@ -10,7 +10,6 @@ import {
   trainPlaces,
   gymOfStop,
   gymRaidsPopup,
-  meetupItem,
   meetupPopup,
   Poller,
   pressParty,
@@ -46,6 +45,9 @@ import {
   ringSizes,
   type RingSize,
 } from './raid-marker.js';
+import { WhatIsOn } from './list-ui.js';
+import { STREET_ZOOM, type LatLon, type ViewStorage } from './view.js';
+import { ListRefresh, listLines, paneShows } from './what-is-on.js';
 import { placeListNode, sharedPlace, startWords, type PlacedThing } from './shared-place.js';
 
 /**
@@ -141,6 +143,22 @@ export function gymClicks(
  * What the map page's gym dots need of the parties: "Report raid" and "Report spawn here", and
  * whether a form is open.
  */
+/** What the parties need of the map's frame (plan 8M-7). */
+export interface PartyFrame {
+  /** The layers: a group of markers per layer, and the list follows them. */
+  registry: LayerRegistry;
+  /** Called after each draw: the gyms follow (route mode, a place picked, raids drawn). */
+  afterDraw: () => void;
+  /** Your location, once the browser said; distances are from the map's middle until then. */
+  located: () => LatLon | undefined;
+  /** Tells `listener` each new fix of your location. */
+  onMove: (listener: () => void) => void;
+  /** Where the browser keeps the list's sort. */
+  storage: ViewStorage | undefined;
+  /** On a phone, the list swapped back for the map before a line is flown to. */
+  showMap: () => void;
+}
+
 export interface MapRaids {
   /**
    * "Report raid" and "Report spawn here" for a gym's own popup, when they are offered now
@@ -220,9 +238,9 @@ export function showParties(
   regionNames: ReadonlyMap<number, string>,
   regions: GeoView['regions'],
   mayReport: boolean,
-  registry: LayerRegistry,
-  afterDraw: () => void,
+  frame: PartyFrame,
 ): MapRaids {
+  const { registry, afterDraw } = frame;
   // One group per layer of the registry (plan 8M-7): on the map while the layer is on.
   const groups = { raids: L.layerGroup(), trains: L.layerGroup(), meetups: L.layerGroup() };
   for (const [id, group] of Object.entries(groups)) {
@@ -290,6 +308,12 @@ export function showParties(
     controls: (on) => {
       formControls(document, on);
     },
+    // A form took the hold or let it go (fix round 1): the pane shows the form or the list, and
+    // what waited of the list is drawn.
+    changed: () => {
+      paneShown();
+      listRefresh.released();
+    },
   });
   const popups = new Map<string, L.Layer>();
 
@@ -442,6 +466,91 @@ export function showParties(
   /** The choices of the list open: a thing's key and what opens it. */
   const choices = new Map<string, () => void>();
 
+  // The list of what is on (plan 8M-7), under the trains' box of the side pane.
+  const listSection = document.createElement('section');
+  listSection.className = 'what-is-on';
+  /** The element of a marker or ring, for the highlight of its line. */
+  const elementOf = (key: string | null): Element | undefined => {
+    const layer = key === null ? undefined : popups.get(key);
+    if (layer instanceof L.Marker || layer instanceof L.Path) return layer.getElement();
+    return undefined;
+  };
+  const whatIsOn = new WhatIsOn({
+    section: listSection,
+    rendered: () => {
+      hold.checkGone();
+    },
+    registry,
+    storage: frame.storage,
+    origin: () => {
+      const center = map.getCenter();
+      return frame.located() ?? { lat: center.lat, lon: center.lng };
+    },
+    zone: () => view?.zone ?? 'UTC',
+    open: (line) => {
+      const layer = line.marker === null ? undefined : popups.get(line.marker);
+      if (!layer || !line.point || !registry.isOn(line.kind)) return false;
+      const { marker } = line;
+      frame.showMap();
+      map.once('moveend', () => {
+        // The list may have been drawn anew meanwhile: the popup of its key as it is now.
+        if (marker !== null) popups.get(marker)?.openPopup();
+      });
+      map.flyTo([line.point.lat, line.point.lon], Math.max(map.getZoom(), STREET_ZOOM + 1));
+      return true;
+    },
+    highlight: (line, on) => {
+      elementOf(line.marker)?.classList.toggle('highlighted', on);
+    },
+    detail: (line) => {
+      // As the side panel showed it before (plan 8M-3 to 8M-6): its popup, with its actions.
+      const ctx = context();
+      let node: PageNode | undefined;
+      if (line.kind === 'raids') {
+        const raid = view?.raids.find((one) => one.id === line.id);
+        if (raid) node = raidPopup(raid, ctx);
+      } else if (line.kind === 'trains') {
+        const train = view?.trains.find((one) => one.id === line.id);
+        if (train) node = trainPopup(train, ctx, trainActions(train));
+      } else if (line.kind === 'meetups') {
+        const meetup = view?.meetups.find((one) => one.id === line.id);
+        if (meetup) node = meetupPopup(meetup, ctx, meetupActions(meetup));
+      }
+      if (!node) return undefined;
+      const element = draw(node);
+      element.classList.add('line-detail');
+      return element;
+    },
+  });
+  // Kept current between lists, never under a form (`ListRefresh`, fix round 1).
+  const listRefresh = new ListRefresh({
+    held: () => hold.editing,
+    draw: () => {
+      whatIsOn.render();
+    },
+  });
+  map.on('moveend', () => {
+    listRefresh.moved();
+  });
+  registry.onChange(() => {
+    listRefresh.layers();
+  });
+  frame.onMove(() => {
+    const at = frame.located();
+    if (at) listRefresh.fixed(at, whatIsOn.sorted);
+  });
+  /**
+   * The side pane shows a form of its box over the list (`paneShows`), recomputed as a form takes
+   * the hold or lets it go; on a phone a form that needs the map docks the pane under it (fix
+   * round 1: `body.form-docked`, whatever "List" says).
+   */
+  const paneShown = (): void => {
+    const formOpen = hold.asideHeld || trainForms.inTools() || meetupForms.inTools();
+    listSection.hidden = paneShows({ loggedIn: true, formOpen }) === 'form';
+    document.body.classList.toggle('form-docked', formOpen);
+    map.invalidateSize();
+  };
+
   const redraw = (next: PartiesView): void => {
     view = next;
     const reopen = showing.key;
@@ -449,7 +558,7 @@ export function showParties(
     popups.clear();
     placed = [];
     const now = Date.now();
-    const { atGyms, elsewhere } = raidsAtGyms(next.raids, (id) => gyms.has(id));
+    const { atGyms } = raidsAtGyms(next.raids, (id) => gyms.has(id));
     raidGyms = [...atGyms.keys()];
     /** Whether a raid's circle is drawn at a gym: the rings go round it (fix round 1). */
     // The size of the raids' circles at this zoom (Matt, 2026-10-25), which the rings round them
@@ -490,9 +599,7 @@ export function showParties(
         time: raidBadge(lead, now, next.zone),
       });
     }
-    // Trains the map cannot draw (no route yet, or none of its gyms on the map) are listed; the
-    // train being routed is left to route mode, which draws its stops as they are edited.
-    const unplaced: MapTrain[] = [];
+    // The train being routed is left to route mode, which draws its stops as they are edited.
     // While a train is routed or a meetup's place picked, the trains' and meetups' lines and
     // markers let clicks through to the gyms and the map.
     const drawn = drawnTrains(next.trains, trainForms.routing()?.id);
@@ -535,7 +642,6 @@ export function showParties(
       // Through its gyms and the power spots its data gives (plan 8X-4).
       const { line, ring } = trainPlaces(train, gyms);
       const popup = () => trainPopup(train, context(), trainActions(train));
-      if (line.length === 0) unplaced.push(train);
       if (line.length > 1) {
         withPopup(
           L.polyline(
@@ -586,25 +692,18 @@ export function showParties(
         });
       }
     }
-    const items = [
-      ...next.meetups.map((meetup) => meetupItem(meetup, context(), meetupActions(meetup))),
-      ...unplaced.map((train): PageNode => ({
-        ...trainPopup(train, context(), trainActions(train)),
-        tag: 'li',
-      })),
-      ...elsewhere.map((raid): PageNode => ({ ...raidPopup(raid, context()), tag: 'li' })),
-    ];
     // "New train" (or the form or route editor open in its place) for a member who may; a form
-    // open there stays whatever the list says.
-    const offered = reportOffered(mayReport, next) || trainForms.inTools() || meetupForms.inTools();
+    // open there stays whatever the list says, and is shown over the list (plan 8M-7), which
+    // comes back when it closes.
+    const formOpen = trainForms.inTools() || meetupForms.inTools();
+    const offered = reportOffered(mayReport, next) || formOpen;
     keepTools<ChildNode>(panel, offered ? tools : undefined);
-    if (items.length > 0) {
-      const heading = document.createElement('h2');
-      heading.textContent = 'Meetups and other parties';
-      const list = draw({ tag: 'ul', className: 'party-list', children: items });
-      panel.append(heading, list);
-    }
-    panel.hidden = items.length === 0 && !offered;
+    panel.append(listSection);
+    paneShown();
+    // The list of what is on (plan 8M-7): every party the layers on show, across the server;
+    // trains and raids the map cannot draw, and meetups without a place, keep their line.
+    whatIsOn.show(listLines(next, gyms));
+    panel.hidden = false;
     map.invalidateSize();
     const line = readOnlyLine(next.readOnly);
     readOnly.textContent = line ?? '';
diff --git a/src/web/client/raid-forms.test.ts b/src/web/client/raid-forms.test.ts
index f29a3a4e7242a8a980f18b959563b81601e8ebe0..4d6a0682480205bd52c67c307dfdbde5ac541c37 100644
--- a/src/web/client/raid-forms.test.ts
+++ b/src/web/client/raid-forms.test.ts
@@ -420,6 +420,52 @@ describe('a form open in a popup (FormHold)', () => {
     expect(views()).toEqual(['second']);
     expect(controls).toEqual([false, true]);
   });
+
+  it('lets go the claim of a form outside a popup whenever its form went away (fix round 1)', () => {
+    const { views, hold, controls } = holding();
+    // A change form opened in a line of the list (no popup), whose place a redraw took away.
+    let there = true;
+    const claim = hold.take(false, false, () => there);
+    if (!claim || !hold.ready(claim, true)) throw new Error('the form did not open');
+    hold.shown('a list');
+    expect(views()).toEqual([]);
+    // Still there: nothing let go.
+    hold.checkGone();
+    expect(hold.editing).toBe(true);
+    there = false;
+    hold.checkGone();
+    expect(hold.editing).toBe(false);
+    expect(views()).toEqual(['a list']);
+    expect(controls.at(-1)).toBe(true);
+    // A new list also finds it gone, without a check of its own.
+    let here = true;
+    const again = hold.take(false, false, () => here);
+    if (!again) throw new Error('no claim');
+    here = false;
+    hold.shown('another');
+    expect(hold.editing).toBe(false);
+    expect(views()).toEqual(['a list', 'another']);
+  });
+
+  it("says when a form of the side pane's box holds, and tells each take and letting go (fix round 1)", () => {
+    const told: boolean[] = [];
+    const hold = new FormHold<string>({
+      draw: () => undefined,
+      popup: () => undefined,
+      later: (run) => {
+        run();
+      },
+      controls: () => undefined,
+      changed: () => told.push(hold.asideHeld),
+    });
+    const claim = hold.take(false, true);
+    if (!claim) throw new Error('no claim');
+    expect(hold.asideHeld).toBe(true);
+    hold.release(claim);
+    // The list comes back over the pane once the form closes.
+    expect(hold.asideHeld).toBe(false);
+    expect(told).toEqual([true, false]);
+  });
 });
 
 describe('the form of a change (changeForm)', () => {
diff --git a/src/web/client/raid-forms.ts b/src/web/client/raid-forms.ts
index 6979abe0dd7f5a59fdba27eee69d54d7f3c1db73..c46804ea01301203385c8cd726819cb921d940ff 100644
--- a/src/web/client/raid-forms.ts
+++ b/src/web/client/raid-forms.ts
@@ -404,6 +404,8 @@ export interface FormHoldDeps<V> {
   popup(): { update(): void } | undefined;
   later(run: () => void): void;
   controls(on: boolean): void;
+  /** A form took the hold or let it go (fix round 1: the side pane shows the list or the form). */
+  changed?(): void;
 }
 
 /**
@@ -415,6 +417,11 @@ export interface FormHoldDeps<V> {
 export interface FormClaim {
   readonly inPopup: boolean;
   readonly aside?: boolean;
+  /**
+   * Whether the form is still in the page (fix round 1): a form outside a popup (a change form in a
+   * line of the list) whose place a redraw took away lets its claim go (`checkGone`).
+   */
+  readonly alive?: () => boolean;
 }
 
 /**
@@ -437,6 +444,17 @@ export class FormHold<V> {
     return this.holder !== undefined;
   }
 
+  /** Whether a form of the side pane's box holds (the start form, route mode, a meetup's form). */
+  get asideHeld(): boolean {
+    return this.holder?.aside === true;
+  }
+
+  /** Lets the claim go of a form that went away from the page (its `alive`). */
+  checkGone(): void {
+    const { holder } = this;
+    if (holder?.alive && !holder.alive()) this.release(holder);
+  }
+
   /** A popup's content function, held while a form is open (`heldContent`). */
   content<T>(draw: () => T): () => T {
     return heldContent(draw, () => this.editing);
@@ -447,6 +465,7 @@ export class FormHold<V> {
    * which the redraw keeps, now.
    */
   shown(view: V): void {
+    this.checkGone();
     if (this.editing && this.holder?.aside !== true) this.waiting = { view };
     else this.deps.draw(view);
   }
@@ -455,11 +474,16 @@ export class FormHold<V> {
    * A form is being opened: its claim, or none while another form holds. `aside`: a form of the
    * trains' box (`FormClaim.aside`).
    */
-  take(inPopup: boolean, aside = false): FormClaim | undefined {
+  take(inPopup: boolean, aside = false, alive?: () => boolean): FormClaim | undefined {
     if (this.holder) return undefined;
-    const claim: FormClaim = aside ? { inPopup, aside } : { inPopup };
+    const claim: FormClaim = {
+      inPopup,
+      ...(aside ? { aside } : {}),
+      ...(alive ? { alive } : {}),
+    };
     this.holder = claim;
     this.deps.controls(false);
+    this.deps.changed?.();
     return claim;
   }
 
@@ -491,6 +515,7 @@ export class FormHold<V> {
     if (!this.holds(claim)) return;
     this.holder = undefined;
     this.deps.controls(true);
+    this.deps.changed?.();
     this.deps.popup()?.update();
     this.drawWaiting();
   }
@@ -504,6 +529,7 @@ export class FormHold<V> {
     if (!this.holder?.inPopup) return;
     this.holder = undefined;
     this.deps.controls(true);
+    this.deps.changed?.();
     this.deps.later(() => {
       if (!this.editing) this.drawWaiting();
     });
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index fe8afa1a591834358ece93ffa7374d00716fdb8c..a0497894c58888bcfd8e54f82f484be186254f7a 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -196,7 +196,9 @@ export function raidUi(deps: RaidUiDeps) {
    */
   const openChange = async (section: HTMLElement, raidId: string) => {
     const { hold } = deps;
-    const claim = hold.take(inPopup(section));
+    // Outside a popup (a line of the list), its claim goes with its form (fix round 1).
+    const popup = inPopup(section);
+    const claim = hold.take(popup, false, popup ? undefined : () => section.isConnected);
     if (!claim) return;
     let lists: RaidOptionsView;
     try {
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..935d307fde008d00fb2ce15be71be119560f9253
--- /dev/null
+++ b/src/web/client/what-is-on.test.ts
@@ -0,0 +1,352 @@
+import { describe, expect, it } from 'vitest';
+import type {
+  MapAttendance,
+  MapMeetup,
+  MapRaid,
+  MapTrain,
+  PartiesView,
+} from '../../domain/web/party-data.js';
+import type { MapGym } from './popup.js';
+import {
+  fixRedraws,
+  ListRefresh,
+  listGroups,
+  listLines,
+  lineWords,
+  paneShows,
+  readSort,
+  SORT_KEY,
+  writeSort,
+  type ListLine,
+} from './what-is-on.js';
+import type { ViewStorage } from './view.js';
+
+const ZONE = 'America/New_York';
+/** Tuesday 13 October 2026, 14:00 in New York. */
+const NOW = Date.UTC(2026, 9, 13, 18);
+const MINUTE = 60_000;
+
+const attendance = (coming: number, present = 0): MapAttendance => ({
+  groups: [{ id: 'A', interested: 1, coming, present }],
+  // As the server counts it (`goingCount`); the list reads it, never sums of its own.
+  going: coming + present,
+  mine: null,
+  actions: [],
+  remote: { offered: false, on: false },
+});
+
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
+/** Gyms of the map: the fountain at the map's middle, the library 0.3 miles north. */
+const GYMS = new Map([
+  [1, gym(1, 'Schenley Fountain', 40.44, -79.95)],
+  [2, gym(2, 'Carnegie Library', 40.444, -79.95)],
+  [3, gym(3, 'Hillman Library', 40.442, -79.95)],
+]);
+const CENTER = { lat: 40.44, lon: -79.95 };
+
+const raid = (id: string, gymId: number | null, more: Partial<MapRaid> = {}): MapRaid => ({
+  kind: 'raid',
+  id,
+  gymId,
+  picture: null,
+  tier: 'Level 5 raid',
+  tierGroup: '5',
+  heading: 'Level 5 raid against Mewtwo',
+  boss: 'Mewtwo',
+  stage: 'hatched',
+  hatchTime: NOW - 20 * MINUTE,
+  endTime: NOW + 30 * MINUTE,
+  link: 'https://discord.com/channels/1/2',
+  place: null,
+  mayChange: false,
+  attendance: attendance(2),
+  ...more,
+});
+
+const train = (id: string, more: Partial<MapTrain> = {}): MapTrain => ({
+  kind: 'train',
+  id,
+  name: 'Oakland loop',
+  trainKind: 'raid',
+  trainKindWords: 'Raid Train',
+  startTime: NOW + 60 * MINUTE,
+  route: ['3', '2'],
+  spots: [],
+  stop: 0,
+  link: 'https://discord.com/channels/1/3',
+  attendance: attendance(4, 1),
+  may: { arrange: false, clear: false, load: false, kind: false },
+  panel: null,
+  conductor: { who: null, mayTake: false, mayDrop: false },
+  ...more,
+});
+
+const meetup = (id: string, more: Partial<MapMeetup> = {}): MapMeetup => ({
+  kind: 'meetup',
+  id,
+  name: 'Community Day picnic',
+  startTime: NOW + 26 * 60 * MINUTE,
+  endTime: null,
+  link: 'https://discord.com/channels/1/4',
+  attendance: attendance(7),
+  place: { kind: 'gym', words: 'At Schenley Fountain', lat: 40.44, lon: -79.95, gymId: 1 },
+  info: null,
+  panel: null,
+  ...more,
+});
+
+const view = (more: Partial<PartiesView> = {}): PartiesView => ({
+  zone: ZONE,
+  readOnly: false,
+  raids: [],
+  maxes: [],
+  trains: [],
+  meetups: [],
+  ...more,
+});
+
+const keys = (lines: readonly ListLine[]) => lines.map((line) => line.key);
+const allOn = () => true;
+
+describe('the list of what is on (plan 8M-7)', () => {
+  it('holds every live thing, grouped by kind in order, each group headed with its count', () => {
+    const lines = listLines(
+      view({
+        raids: [raid('r1', 1), raid('r2', 2)],
+        trains: [train('t1')],
+        meetups: [meetup('m1')],
+      }),
+      GYMS,
+    );
+    const groups = listGroups(lines, { on: allOn, sort: 'nearest', origin: CENTER });
+    expect(groups.map((group) => group.heading)).toEqual([
+      'Raids · 2',
+      'Trains · 1',
+      'Meetups · 1',
+    ]);
+    // A layer turned off takes its group out.
+    const noTrains = listGroups(lines, {
+      on: (kind) => kind !== 'trains',
+      sort: 'nearest',
+      origin: CENTER,
+    });
+    expect(noTrains.map((group) => group.kind)).toEqual(['raids', 'meetups']);
+    expect(listGroups([], { on: allOn, sort: 'nearest', origin: CENTER })).toEqual([]);
+  });
+
+  it('sorts Nearest from your location, else the middle of the map, the unplaced last', () => {
+    const lines = listLines(
+      view({
+        raids: [
+          raid('far', 2),
+          raid('nowhere', null),
+          raid('near', 1),
+          raid('middle', 3),
+          // A raid at a gym the map does not show, by where its post says it is.
+          raid('posted', 99, {
+            place: { name: 'Hilltop Shrine', lat: 40.46, lon: -79.95, address: null },
+          }),
+        ],
+      }),
+      GYMS,
+    );
+    const [raids] = listGroups(lines, { on: allOn, sort: 'nearest', origin: CENTER });
+    expect(keys(raids?.lines ?? [])).toEqual([
+      'raid:near',
+      'raid:middle',
+      'raid:far',
+      'raid:posted',
+      'raid:nowhere',
+    ]);
+    // From the library: the library first.
+    const [fromThere] = listGroups(lines, {
+      on: allOn,
+      sort: 'nearest',
+      origin: { lat: 40.444, lon: -79.95 },
+    });
+    expect(keys(fromThere?.lines ?? []).slice(0, 2)).toEqual(['raid:far', 'raid:middle']);
+  });
+
+  it('sorts Soonest by the end of raids and the start of trains and meetups', () => {
+    const lines = listLines(
+      view({
+        raids: [
+          raid('late', 1, { endTime: NOW + 40 * MINUTE }),
+          raid('soon', 2, { endTime: NOW + 5 * MINUTE }),
+        ],
+        trains: [
+          train('t-later', { startTime: NOW + 90 * MINUTE }),
+          train('t-unset', { startTime: null }),
+          train('t-sooner', { startTime: NOW + 10 * MINUTE }),
+        ],
+      }),
+      GYMS,
+    );
+    const [raids, trains] = listGroups(lines, { on: allOn, sort: 'soonest', origin: CENTER });
+    expect(keys(raids?.lines ?? [])).toEqual(['raid:soon', 'raid:late']);
+    expect(keys(trains?.lines ?? [])).toEqual(['train:t-sooner', 'train:t-later', 'train:t-unset']);
+  });
+
+  it('sorts Most going first, ties broken by name', () => {
+    const lines = listLines(
+      view({
+        raids: [
+          raid('few', 1, { attendance: attendance(1) }),
+          raid('many', 2, { attendance: attendance(5, 2) }),
+          raid('b', 3, { heading: 'Level 5 raid against Zapdos', attendance: attendance(3) }),
+          raid('a', 1, { heading: 'Level 5 raid against Articuno', attendance: attendance(3) }),
+        ],
+      }),
+      GYMS,
+    );
+    const [raids] = listGroups(lines, { on: allOn, sort: 'going', origin: CENTER });
+    expect(keys(raids?.lines ?? [])).toEqual(['raid:many', 'raid:a', 'raid:b', 'raid:few']);
+  });
+
+  it('words each line: picture, name, place, distance, time, how many are going', () => {
+    const lines = listLines(
+      view({
+        raids: [
+          raid('r1', 2, { attendance: attendance(3, 1) }),
+          raid('egg', 1, {
+            stage: 'egg',
+            boss: null,
+            heading: 'Level 5 raid (egg)',
+            hatchTime: NOW + 40 * MINUTE,
+            endTime: NOW + 85 * MINUTE,
+            attendance: attendance(0),
+          }),
+          raid('ending', 1, { endTime: NOW + 3 * MINUTE }),
+        ],
+        trains: [train('t1')],
+        meetups: [meetup('m1'), meetup('m2', { place: null, name: 'Walk' })],
+      }),
+      GYMS,
+    );
+    const words = (key: string) => {
+      const line = lines.find((one) => one.key === key);
+      if (!line) throw new Error(key);
+      return lineWords(line, CENTER, NOW, ZONE);
+    };
+    expect(words('raid:r1')).toEqual({
+      // The post's own heading words (fix round 1).
+      name: 'Level 5 raid against Mewtwo',
+      place: 'Carnegie Library',
+      distance: '0.3 mi',
+      time: '30m left',
+      going: '4 going',
+      dimmed: false,
+    });
+    expect(words('raid:egg')).toMatchObject({
+      name: 'Level 5 raid (egg)',
+      place: 'Schenley Fountain',
+      distance: '0 ft',
+      time: 'hatches 2:40 PM',
+      going: '',
+    });
+    expect(words('raid:ending')).toMatchObject({ time: '3m left', dimmed: true });
+    expect(words('train:t1')).toMatchObject({
+      name: 'Oakland loop',
+      place: 'At stop 1 of 2: Hillman Library',
+      distance: '0.1 mi',
+      time: 'starts 3:00 PM',
+      going: '5 going',
+    });
+    expect(words('meetup:m1')).toMatchObject({
+      place: 'At Schenley Fountain',
+      time: 'starts Wed, Oct 14, 4:00 PM',
+      going: '7 going',
+    });
+    // A meetup without a place keeps its line, without a distance.
+    expect(words('meetup:m2')).toMatchObject({ place: null, distance: null });
+  });
+
+  it('shows a form in the side pane over the list, the list again once it closes', () => {
+    expect(paneShows({ loggedIn: true, formOpen: false })).toBe('list');
+    expect(paneShows({ loggedIn: true, formOpen: true })).toBe('form');
+    expect(paneShows({ loggedIn: false, formOpen: false })).toBe('login');
+  });
+
+  it('keeps the sort per browser, Nearest by default and where nothing is kept', () => {
+    const items = new Map<string, string>();
+    const kept: ViewStorage = {
+      getItem: (key) => items.get(key) ?? null,
+      setItem: (key, value) => {
+        items.set(key, value);
+      },
+    };
+    expect(readSort(kept)).toBe('nearest');
+    writeSort(kept, 'going');
+    expect(items.get(SORT_KEY)).toBe('going');
+    expect(readSort(kept)).toBe('going');
+    items.set(SORT_KEY, 'loudest');
+    expect(readSort(kept)).toBe('nearest');
+    const refusing: ViewStorage = {
+      getItem: () => {
+        throw new Error('SecurityError');
+      },
+      setItem: () => {
+        throw new Error('QuotaExceededError');
+      },
+    };
+    expect(readSort(refusing)).toBe('nearest');
+    expect(() => {
+      writeSort(refusing, 'soonest');
+    }).not.toThrow();
+  });
+});
+
+describe('the list kept current (plan 8M-7, fix round 1)', () => {
+  it('is not drawn anew while a form holds, and once when it lets go', () => {
+    let held = true;
+    let drawn = 0;
+    const refresh = new ListRefresh({
+      held: () => held,
+      draw: () => {
+        drawn += 1;
+      },
+    });
+    refresh.moved();
+    refresh.layers();
+    refresh.fixed({ lat: 40.5, lon: -79.9 }, 'nearest');
+    // A form (a line's change form, its group menu, its focus) stays as it is.
+    expect(drawn).toBe(0);
+    held = false;
+    refresh.released();
+    expect(drawn).toBe(1);
+    // Nothing waited: letting go again draws nothing.
+    refresh.released();
+    expect(drawn).toBe(1);
+    refresh.moved();
+    expect(drawn).toBe(2);
+  });
+
+  it('draws for a new fix of your location only past 25 m, and only sorted Nearest', () => {
+    const here = { lat: 40.44, lon: -79.95 };
+    expect(fixRedraws(undefined, here, 'nearest')).toBe(true);
+    expect(fixRedraws(here, { lat: 40.4401, lon: -79.95 }, 'nearest')).toBe(false);
+    expect(fixRedraws(here, { lat: 40.4404, lon: -79.95 }, 'nearest')).toBe(true);
+    expect(fixRedraws(here, { lat: 40.45, lon: -79.95 }, 'soonest')).toBe(false);
+    let drawn = 0;
+    const refresh = new ListRefresh({
+      held: () => false,
+      draw: () => {
+        drawn += 1;
+      },
+    });
+    refresh.fixed(here, 'nearest');
+    refresh.fixed({ lat: 40.4401, lon: -79.95 }, 'nearest');
+    expect(drawn).toBe(1);
+  });
+});
diff --git a/src/web/client/what-is-on.ts b/src/web/client/what-is-on.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fb33384e1d8018fb248ba13846dc213d06b5716f
--- /dev/null
+++ b/src/web/client/what-is-on.ts
@@ -0,0 +1,290 @@
+import { stageAt } from '../../domain/party/raid-stage.js';
+import { clockTime } from '../../domain/web/clock.js';
+import type { PartiesView } from '../../domain/web/party-data.js';
+import { distanceWords, metersBetween } from './distance.js';
+import { stopLine, trainPlaces } from './parties.js';
+import type { MapGym } from './popup.js';
+import { badgeWords, isDimmed } from './raid-marker.js';
+import { startWords } from './shared-place.js';
+import type { LatLon, ViewStorage } from './view.js';
+
+/**
+ * The list of what is on (plan 8M-7): every live thing the enabled layers show, across the whole
+ * server (not only what is in view), grouped by kind in this order (raids, trains, meetups, wild
+ * spawns once a route lists them), each group headed with its count. A line: picture, name,
+ * place, distance, time, how many are going; dimmed in a raid's last minutes. Sorted, by the
+ * member's choice kept per browser: Nearest (from your location, else the map's middle),
+ * Soonest (ending soonest for raids, starting soonest for trains and meetups), Most going; ties
+ * by name, and what the map cannot place (no point at all) last in its group. The pure part;
+ * `list-ui.ts` draws it.
+ */
+
+export type ListKind = 'raids' | 'trains' | 'meetups' | 'spawns';
+
+/** The groups in their order, each with its heading (the registry's layer of the same id). */
+const GROUPS: ReadonlyArray<[ListKind, string]> = [
+  ['raids', 'Raids'],
+  ['trains', 'Trains'],
+  ['meetups', 'Meetups'],
+  ['spawns', 'Wild spawns'],
+];
+
+/** A thing of the list, as the page has it from the list of parties. */
+export interface ListLine {
+  /** `raid:<id>`, `train:<id>`, `meetup:<id>`. */
+  key: string;
+  kind: ListKind;
+  /** The party's id. */
+  id: string;
+  /** Its popup's key on the map (`gym:<id>`, `train:<id>`, `meetup:<id>`): none off the map. */
+  marker: string | null;
+  name: string;
+  place: string | null;
+  /** Where it is, when the page knows; none puts it last in its group. */
+  point: LatLon | null;
+  picture: string | null;
+  going: number;
+  /** What Soonest sorts by: the end of a raid, the start of a train or meetup; none last. */
+  soonest: number | null;
+  /** The times its time is worded from. */
+  times: {
+    stage?: 'egg' | 'hatched';
+    hatch?: number | null;
+    end?: number | null;
+    start?: number | null;
+  };
+}
+
+/** The lines of a list of parties, in its order (the groups and sorting are `listGroups`'). */
+export function listLines(view: PartiesView, gyms: ReadonlyMap<number, MapGym>): ListLine[] {
+  const raids = view.raids.map((raid): ListLine => {
+    const gym = raid.gymId === null ? undefined : gyms.get(raid.gymId);
+    const where = gym ?? raid.place;
+    return {
+      key: `raid:${raid.id}`,
+      kind: 'raids',
+      id: raid.id,
+      marker: gym ? `gym:${gym.id}` : null,
+      // Its post's own heading words (fix round 1).
+      name: raid.heading,
+      place: where?.name ?? null,
+      point: where ? { lat: where.lat, lon: where.lon } : null,
+      picture: raid.picture,
+      going: raid.attendance.going,
+      soonest: raid.endTime,
+      times: { stage: raid.stage, hatch: raid.hatchTime, end: raid.endTime },
+    };
+  });
+  const trains = view.trains.map((train): ListLine => {
+    const { ring } = trainPlaces(train, gyms);
+    const at = (id: number | null) => (id === null ? undefined : gyms.get(id));
+    return {
+      key: `train:${train.id}`,
+      kind: 'trains',
+      id: train.id,
+      marker: ring ? `train:${train.id}` : null,
+      name: train.name,
+      place: stopLine(train, { gym: at }),
+      point: ring ? { lat: ring.at.lat, lon: ring.at.lon } : null,
+      picture: null,
+      going: train.attendance.going,
+      soonest: train.startTime,
+      times: { start: train.startTime },
+    };
+  });
+  const meetups = view.meetups.map((meetup): ListLine => {
+    const { place } = meetup;
+    const gym = place?.gymId == null ? undefined : gyms.get(place.gymId);
+    const where = gym ?? place;
+    return {
+      key: `meetup:${meetup.id}`,
+      kind: 'meetups',
+      id: meetup.id,
+      marker: place ? `meetup:${meetup.id}` : null,
+      name: meetup.name,
+      place: place?.words ?? null,
+      point: where ? { lat: where.lat, lon: where.lon } : null,
+      picture: null,
+      going: meetup.attendance.going,
+      soonest: meetup.startTime,
+      times: { start: meetup.startTime },
+    };
+  });
+  return [...raids, ...trains, ...meetups];
+}
+
+export type ListSort = 'nearest' | 'soonest' | 'going';
+
+/** The sorts offered, in the menu's order, with their names. */
+export const SORTS: ReadonlyArray<[ListSort, string]> = [
+  ['nearest', 'Nearest'],
+  ['soonest', 'Soonest'],
+  ['going', 'Most going'],
+];
+
+export interface ListGroup {
+  kind: ListKind;
+  heading: string;
+  lines: ListLine[];
+}
+
+/** The groups of the list for the layers on, each sorted. */
+export function listGroups(
+  lines: readonly ListLine[],
+  how: { on: (kind: ListKind) => boolean; sort: ListSort; origin: LatLon | undefined },
+): ListGroup[] {
+  const distance = (line: ListLine): number =>
+    line.point && how.origin ? metersBetween(how.origin, line.point) : Infinity;
+  const order = (a: ListLine, b: ListLine): number => {
+    // What the map cannot place goes last in its group, whatever the sort.
+    if ((a.point === null) !== (b.point === null)) return a.point === null ? 1 : -1;
+    const by =
+      how.sort === 'nearest'
+        ? distance(a) - distance(b)
+        : how.sort === 'soonest'
+          ? (a.soonest ?? Infinity) - (b.soonest ?? Infinity)
+          : b.going - a.going;
+    return (Number.isNaN(by) ? 0 : by) || a.name.localeCompare(b.name);
+  };
+  return GROUPS.flatMap(([kind, name]) => {
+    if (!how.on(kind)) return [];
+    const of = lines.filter((line) => line.kind === kind);
+    if (of.length === 0) return [];
+    return [{ kind, heading: `${name} · ${of.length}`, lines: [...of].sort(order) }];
+  });
+}
+
+/** What a line says. */
+export interface LineWords {
+  name: string;
+  place: string | null;
+  distance: string | null;
+  time: string;
+  going: string;
+  dimmed: boolean;
+}
+
+/** A line's words, its distance from `origin` (your location, else the map's middle). */
+export function lineWords(
+  line: ListLine,
+  origin: LatLon | undefined,
+  now: number,
+  zone: string,
+): LineWords {
+  const { stage, hatch = null, end = null, start = null } = line.times;
+  let time: string;
+  let dimmed = false;
+  if (stage === undefined) time = startWords(start, now, zone);
+  else {
+    // Egg or hatched by the clock: the domain's `stageAt`, as the marker reads it.
+    const hatched =
+      stageAt({ hatchTime: hatch, endTime: null, reportedHatched: stage !== 'egg' }, now) ===
+      'hatched';
+    dimmed = isDimmed({ stage, hatchTime: hatch, endTime: end }, now);
+    if (!hatched) time = hatch === null ? 'egg' : `hatches ${clockTime(hatch, zone, now)}`;
+    else if (end === null) time = 'hatched';
+    else {
+      const left = badgeWords('end', end, now, zone);
+      time = left === 'ended' ? left : `${left} left`;
+    }
+  }
+  return {
+    name: line.name,
+    place: line.place,
+    distance: line.point && origin ? distanceWords(metersBetween(origin, line.point)) : null,
+    time,
+    going: line.going > 0 ? `${line.going} going` : '',
+    dimmed,
+  };
+}
+
+/** What the side pane shows: the list, a form open over it, or how to log in. */
+export function paneShows(state: {
+  loggedIn: boolean;
+  formOpen: boolean;
+}): 'list' | 'form' | 'login' {
+  if (state.formOpen) return 'form';
+  return state.loggedIn ? 'list' : 'login';
+}
+
+/** Where the sort is kept in the browser. */
+export const SORT_KEY = 'pine-map-sort';
+
+/** The sort kept in this browser; Nearest by default and where nothing (good) is kept. */
+export function readSort(storage: ViewStorage | undefined): ListSort {
+  try {
+    const kept = storage?.getItem(SORT_KEY);
+    return SORTS.some(([sort]) => sort === kept) ? (kept as ListSort) : 'nearest';
+  } catch {
+    return 'nearest';
+  }
+}
+
+/** Keeps the sort; a browser that keeps nothing is left alone. */
+export function writeSort(storage: ViewStorage | undefined, sort: ListSort): void {
+  try {
+    storage?.setItem(SORT_KEY, sort);
+  } catch {
+    // Private mode or a full storage: the sort holds for this visit.
+  }
+}
+
+/** How far your location must move for the list, sorted Nearest, to be drawn anew. */
+export const FIX_REDRAW_METERS = 25;
+
+/**
+ * Whether a new fix of your location draws the list anew (fix round 1): only sorted Nearest, and
+ * only once it moved more than `FIX_REDRAW_METERS` from where the list was drawn from.
+ */
+export function fixRedraws(drawnFrom: LatLon | undefined, now: LatLon, sort: ListSort): boolean {
+  if (sort !== 'nearest') return false;
+  return drawnFrom === undefined || metersBetween(drawnFrom, now) > FIX_REDRAW_METERS;
+}
+
+/** What `ListRefresh` needs: whether a form holds, and the drawing of the list. */
+export interface ListRefreshDeps {
+  held(): boolean;
+  draw(): void;
+}
+
+/**
+ * When the list is drawn anew between two lists of parties (fix round 1): a move of the map, a
+ * change of layers, a fix of your location (`fixRedraws`) draw it, but never while a form holds
+ * (a line's change form, its group menu, its focus stay as they are); then once, when the form
+ * lets go (`released`).
+ */
+export class ListRefresh {
+  private waiting = false;
+  private drawnFrom: LatLon | undefined;
+
+  constructor(private readonly deps: ListRefreshDeps) {}
+
+  moved(): void {
+    this.draw();
+  }
+
+  layers(): void {
+    this.draw();
+  }
+
+  fixed(at: LatLon, sort: ListSort): void {
+    if (!fixRedraws(this.drawnFrom, at, sort)) return;
+    this.drawnFrom = at;
+    this.draw();
+  }
+
+  /** The form that held let go: what waited is drawn. */
+  released(): void {
+    if (!this.waiting || this.deps.held()) return;
+    this.waiting = false;
+    this.deps.draw();
+  }
+
+  private draw(): void {
+    if (this.deps.held()) {
+      this.waiting = true;
+      return;
+    }
+    this.deps.draw();
+  }
+}
diff --git a/src/web/page.test.ts b/src/web/page.test.ts
index 47b75b5e54b1518f4c7761255418729ff4f4cf6d..fe60001449e119bbe30324c7a1bcc05eab62e629 100644
--- a/src/web/page.test.ts
+++ b/src/web/page.test.ts
@@ -77,10 +77,18 @@ describe('the map page', () => {
     });
     // The row of the layers (plan 8M-7), which the script fills.
     expect(page.body).toContain('<nav id="layers" aria-label="Layers"></nav>');
-    // The side panel of the meetups (plan 8M-3), hidden until a member's parties are shown.
+    // The side pane of what is on (plan 8M-7; the meetups' panel of 8M-3 before), hidden until
+    // the script draws it, and the phone's button that swaps the map for it.
     expect(page.body).toContain(
       '<div id="content"><main id="map" aria-label="Map"></main>' +
-        '<aside id="parties" aria-label="Meetups and other parties" hidden></aside></div>',
+        '<aside id="parties" aria-label="What is on" hidden></aside></div>',
+    );
+    expect(page.body).toContain(
+      '<button id="list-button" class="list-button" type="button" aria-pressed="false">List</button>',
+    );
+    // On a phone "Find a gym" opens from a button of the one row (fix round 1).
+    expect(page.body).toContain(
+      '<button id="search-button" class="search-button" type="button" aria-controls="filter" aria-expanded="false">Find</button>',
     );
     // The read-only line of the parties: a line of its own, so that it never takes the place
     // of what a press answered (#notice).
diff --git a/src/web/page.ts b/src/web/page.ts
index 2d5df18213a597cff2011112712e92131882530c..b22ea735aec95412417f9109a551c75c294837a2 100644
--- a/src/web/page.ts
+++ b/src/web/page.ts
@@ -111,7 +111,7 @@ function head(title: string, assets: PageAssets): string[] {
  * The map page (spec 3.1): a static template that loads the bundle's script and style, with
  * nothing inline (the CSP allows no inline script or style); what the page needs to know is in
  * `data-` attributes of `<body>`, escaped. The script builds everything else; the side panel
- * (`#parties`: the meetups, and raids at gyms the map does not show) only for a member, and
+ * (`#parties`: the list of what is on, plan 8M-7, with the phone's "List" button) for everybody, and
  * the line that the parties are read-only (`#read-only`), apart from the moment's news
  * (`#notice`) so that neither takes the other's place.
  */
@@ -122,11 +122,13 @@ export function mapPage(data: MapPageData, assets: AssetManifest): string {
     // Narrower than 768 pixels the title is "Pine" (`map.css`, fix round 1).
     '<header id="header"><span class="title"><span class="title-first">Professor </span>Pine</span>',
     '<nav id="layers" aria-label="Layers"></nav>',
+    '<button id="list-button" class="list-button" type="button" aria-pressed="false">List</button>',
+    '<button id="search-button" class="search-button" type="button" aria-controls="filter" aria-expanded="false">Find</button>',
     '<input id="filter" type="search" placeholder="Find a gym" aria-label="Find a gym">',
     '<span id="account"></span></header>',
     '<p id="notice" hidden></p><p id="read-only" role="status" hidden></p>',
     '<div id="content"><main id="map" aria-label="Map"></main>' +
-      '<aside id="parties" aria-label="Meetups and other parties" hidden></aside></div>',
+      '<aside id="parties" aria-label="What is on" hidden></aside></div>',
     '<noscript><p>The map needs JavaScript.</p></noscript>',
     '</body>',
     '</html>',
````

### Task 7: 8M-7 task 7: one distance wording by a setting

Prototype commit: `4a57096e5225d12a00b87ce57a582be266329860`

settings.distanceUnits, imperial or metric (default imperial, per instance as the
timezone is), words every distance Pine says, on the web map and on Discord
alike, through one pure function in src/render/distance-words.ts: feet under a
tenth of a mile or miles, meters under a kilometer or kilometers, rounded to
ten. The map's list reads the units from the page's data-distance-units; /gym
move, add, review and import, /pokestop, the gym view and /research's "Same task
at more stops..." take them from the settings.

**Files:**

```
 CLAUDE.md                                   |  1 +
 data/settings.json                          |  1 +
 docs/architecture/web.md                    |  2 +-
 docs/guides/new-instance.md                 |  1 +
 docs/web-setup.md                           |  2 ++
 src/app.ts                                  |  1 +
 src/commands/gyms/add.ts                    |  2 +-
 src/commands/gyms/delete-export.test.ts     |  4 ++--
 src/commands/gyms/edit-move.test.ts         | 20 ++++++++++++++------
 src/commands/gyms/gym.test.ts               | 21 ++++++++++++++++++---
 src/commands/gyms/import.test.ts            |  4 ++--
 src/commands/gyms/import.ts                 | 26 +++++++++++++++++---------
 src/commands/gyms/move.ts                   | 15 +++++++++------
 src/commands/gyms/review.test.ts            |  2 +-
 src/commands/gyms/review.ts                 | 83 +++++++++++++++++++++++++++++++++++++++++++++++------------------------------------
 src/commands/gyms/shared.ts                 | 17 ++++++++++++-----
 src/commands/research/research-input.ts     | 16 ++++++++++------
 src/commands/research/research.test.ts      |  4 ++--
 src/commands/research/research.ts           |  1 +
 src/commands/stops/pokestop.test.ts         | 14 ++++++++++++--
 src/commands/stops/pokestop.ts              | 15 ++++++++-------
 src/components/gym-review.ts                | 12 ++++++++++--
 src/config/settings.test.ts                 | 12 ++++++++++++
 src/config/settings.ts                      |  6 ++++++
 src/render/distance-words.test.ts           | 31 +++++++++++++++++++++++++++++++
 src/render/distance-words.ts                | 30 +++++++++++++++++++++++-------
 src/render/gym-view.test.ts                 | 11 ++++++-----
 src/render/gym-view.ts                      | 10 ++++------
 src/render/research.test.ts                 |  1 +
 src/render/research.ts                      | 10 ++++------
 src/services/gym-admin-service.ts           |  3 ++-
 src/text-distances.test.ts                  | 88 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/distance.test.ts             | 11 +----------
 src/web/client/distance.ts                  |  9 +++++----
 src/web/client/list-ui.test.ts              |  1 +
 src/web/client/list-ui.ts                   |  5 ++++-
 src/web/client/main.ts                      |  2 ++
 src/web/client/party-layer.isolated.test.ts |  1 +
 src/web/client/party-layer.ts               |  4 ++++
 src/web/client/what-is-on.test.ts           |  6 +++++-
 src/web/client/what-is-on.ts                | 10 +++++++---
 src/web/guild-routes.ts                     |  1 +
 src/web/page.test.ts                        |  8 ++++++++
 src/web/page.ts                             |  4 ++++
 src/web/server.ts                           |  3 +++
 test/fixtures/settings.json                 |  1 +
 test/support/web.ts                         |  4 ++++
 47 files changed, 401 insertions(+), 135 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/gyms/delete-export.test.ts src/commands/gyms/edit-move.test.ts src/commands/gyms/gym.test.ts src/commands/gyms/import.test.ts src/commands/gyms/review.test.ts src/commands/research/research.test.ts src/commands/stops/pokestop.test.ts src/config/settings.test.ts src/render/distance-words.test.ts src/render/gym-view.test.ts src/render/research.test.ts src/text-distances.test.ts src/web/client/distance.test.ts src/web/client/list-ui.test.ts src/web/client/party-layer.isolated.test.ts src/web/client/what-is-on.test.ts src/web/page.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 4a57096e5225d12a00b87ce57a582be266329860 -- src test scripts data docs/architecture docs/guides docs/web-setup.md docs/superpowers/plans/phase-0-follow-ups.md CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-7 task 7: one distance wording by a setting`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 50236d37f752ae7784c1b632fce0567f316b425b..ec8d0817c3c7dd77e79be86b67b542643b05522f 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -148,6 +148,7 @@ These are the rules that hold in every area. Each subsystem's own conventions ar
 ### Text
 
 - American spelling in everything Pine says to members and staff, and in new or changed docs (Matt, 2026-10-18): "meters", "center", "color", "canceled", "-ize"; names keep theirs ("Centre Ave"). Code identifiers and the columns of a file format keep theirs (`GYM_COLOUR`, the report's CSV column `metres`).
+- Every distance Pine says to members or staff, on Discord and on the web, goes through `distanceWords(…, settings.distanceUnits)` (`src/render/distance-words.ts`; Matt, 2026-10-25: one unit setting for the map and Discord), never hand-worded units; `src/text-distances.test.ts` refuses them.
 - A member is never named by a bare mention in text that does not ping them (a client that has not loaded the member shows "@unknown-user"): a sentence uses `memberText(member)`, the small print of a post `memberByName(member)`, a list `memberName(member)`, and a line about what a train's maker or an anonymous reporter did `doer(party, member)`. Detail: `parties-and-posts.md`.
 - Text a member or a feed wrote is shown through `plain()` (`src/render/text.ts`); text that reaches other members' DMs or a spawn report, and every member's name, through `plainNoLinks`, which also breaks bare addresses.
 
diff --git a/data/settings.json b/data/settings.json
index 61ae567e0f2f252b873887d26b406562f79378ae..8274baca9ad7d290c6111d8c273a297db2ef88dc 100644
--- a/data/settings.json
+++ b/data/settings.json
@@ -80,6 +80,7 @@
     "sponsored"
   ],
   "timezone": "America/New_York",
+  "distanceUnits": "imperial",
   "archiveRetentionDays": null,
   "ocr": {
     "passive": false,
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index edc45fcf26182e14b96d93962e2553b3fbb16ca8..da4b6373f9646d926befb17f40058bd60db97a55 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -52,7 +52,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **Raid markers** (`raid-marker.ts`, frame B of the mockups): a circle centered on the gym (`raidMarkerNode`, drawn as an element of ours in a `divIcon`, `raidIcon`, 44 pixels): the post's picture (the boss, or the egg of its tier before it hatches) in a ring of its tier group's color (`MapRaid.tierGroup`, made by the domain's `raidTierGroup` of `src/domain/pogo/raid-tier.ts`: `1`, `3`, `5`, `mega` for Mega, Mega Legendary and Super Mega, `elite`, `shadow` for every shadow raid; `tierColour` names `--tier-<group>`; `raid-marker-tiers.test.ts` holds `theme.css` and `map.css` to every group of `RAID_TIER_GROUPS`), a time badge under it (`badgeFor`: "12m", "1h 05m" while it runs, "hatches 2:40" before the hatch, the posts' time by `clockTime` with AM or PM left out today only, "hatches Wed, Oct 14, 2:00 PM" another day; "egg" or "hatched" where nobody said when, "ended" by `stageAt`), and a green count of those going (`MapAttendance.going`, made by the domain's `goingCount` of `party.ts`: the committed heads of the whole party, coming, here and asked whether done, +1s counted, the lobbies' own rule that `lobbyCount` shares; none at zero). Raids shrink as the map zooms out and are still never grouped (Matt, 2026-10-25; `markerSize`): from zoom 15 the full marker (`--raid-full`, 44 px, with its badge and count), at 14 a smaller circle with the count and no badge (`--raid-middle`, 30 px), at 13 and below a small circle with the boss picture in its ring and no badge or count (`--raid-small`, 20 px); sizes are named values of `theme.css`, read by `theme().sizes` for what Leaflet draws; the tap target is never under 32 pixels (`tapBox`, a clear margin round a small circle), the train's and meetup's rings round a raid scale with its circle (`ringSizes(circle)`), and a zoom into another size draws the parties anew. Nearly over, it is dimmed (`isDimmed`: hatched by the clock, `stageAt` of `src/domain/party/raid-stage.ts`, which `raidStage` reads raids through, and `endsSoon` of `src/domain/time/ending-soon.ts`, the five minutes `/max`'s ending-soon question asks by: one rule). The page keeps badges and dimming current every 15 s from the times on the marker (`data-stage`, `data-hatch`, `data-end`; `markerNow`, by the same rules as at the draw), an egg turning into its time left as it hatches. One source for every fact (Matt, 2026-10-25): what the page shows or decides of a party is computed by the domain code the Discord side uses, sent with the list or imported from a pure module of `src/domain/` that imports nothing (`raid-stage.ts`, `ending-soon.ts`), never a second implementation; only the words are the page's. A gym with a raid shows the raid, not its gym dot, while the Raids layer is on (`hiddenGyms`, `MapRaids.raidGyms`); off, the dot is back. Trains and meetups keep their drawing (rings, a line), restyled; at a gym whose raid circle is drawn, their rings go round it rather than over the boss (`ringSizes`: the train's just outside the 44-pixel circle, radius 26, the meetup's outside the train's, radius 31; the old sizes elsewhere, and again when the Raids layer is off). A gym of several raids is drawn by one lead raid, the first with a picture, else the first (`leadRaid`): picture, ring, badge and count are all that raid's. A raid is named everywhere on the map (its popup, the list, the list of things at one place) in its post's own heading words, `MapRaid.heading` (`raidLook` over the renderer's `headlineParts`: `Level 5 raid against Yveltal`, `Level 5 raid (egg)`, without the shiny mark; the tier's words where the renderer gave none), and its popup reads its stage by the clock (`stageAt`), not the list's `stage`.
 - **Several things at one place** (`shared-place.ts`): when more than one shown thing sits at the same place (the same gym, or within 12 pixels at the current zoom, `sharedPlace`, `SHARED_PIXELS`; a raid marker, a train's ring, a meetup's ring, and a gym's dot tapped where parties share it, `MapRaids.gymTapped`), a tap on any of them opens one popup listing each (`placeListNode`: picture, name, time: the lead raid's `heading` and badge, a train's or meetup's `startWords`), and a choice (`data-open`) opens that thing's own popup as before. A layer turned off takes its things out, and the overlap with them. This replaces the tap on a ring's line of the 8S-4 staging: the rings still take clicks on their line alone, but a tap on what they ring lists them.
 - **The list of what is on** (`what-is-on.ts`, pure; drawn by `list-ui.ts`, `WhatIsOn`; plan 8M-7, replacing the side panel "Meetups and other parties"): on the desktop the side pane on the right (`#parties`, "What is on"), under the trains' box; on a phone the header's "List" button (`#list-button`, `body.list-open`) swaps the map for it and back. It holds every live thing the layers on show across the whole server, not only what is in view (`listLines`: raids, trains, meetups; wild spawns once a route lists them), grouped by kind in that order, each group headed with its count (`listGroups`: "Raids · 5"), under "What's on · n". A line (`lineWords`, a button): the picture (a ring of the kind's color without one), the name (`raidName`, a train's or meetup's), the place (a raid's gym, as the map has it or as its post names it; a train's `stopLine`; a meetup's words), the distance (from your location, else the map's middle; none without a place), the time ("30m left", "hatches 2:40 PM", `startWords`), "4 going" (`MapAttendance.going`); dimmed in a raid's last minutes (`isDimmed`). Sort, kept per browser (`localStorage` `pine-map-sort`, try/catch, `readSort` / `writeSort`): Nearest (the default), Soonest (a raid's end, a train's or meetup's start; none last), Most going; ties by name, and what has no point at all last in its group whatever the sort. Tapping a line whose thing the map draws (its layer on) flies the map there (street level or closer) and opens its popup once the map rests (on a phone, back to the map first, `PartyFrame.showMap`); a thing the map does not draw (a train without a route or with none of its stops on the map, a raid at a gym the map does not show, a meetup without a place) shows its popup under its line instead (`detail`: `raidPopup`, `trainPopup` with its actions, `meetupPopup` with Edit…, as the side panel showed them). Hovering a line on the desktop highlights its marker (`highlighted`: a ring round a raid's circle, a thicker line for a ring). A form that opens in the side pane (the start form, route mode, a meetup's form or editor) is shown over the list, which comes back when it closes (`paneShows`). Drawn anew with each list and a change of sort; a move of the map, a change of layers and a new fix of your location (only sorted Nearest, and only once it moved more than 25 m, `fixRedraws`) draw it too, but never while a form holds: then once, when the form lets go (`ListRefresh`, fix round 1). A line shown with its popup under it is kept by its key (`WhatIsOn.kept`): drawn anew for a move, a fix or a change of layers, only its own words change and its popup (a group menu, a field) stays, the focus given back where it was; drawn from a new list (`show`), its popup is drawn anew from it (counts, "You:", buttons), the group chosen in its menu kept while that group is still offered and the focus given to the control of the same kind (round 2); a change form opened in such a line takes the hold with its `alive` (`FormHold.take(…, alive)`), so that the hold lets go whenever the form goes away (`checkGone`, after each drawing of the list and with each new list). Whether a form of the pane's box holds is recomputed as a form takes the hold or lets it go (`FormHoldDeps.changed`, `asideHeld`); on a phone such a form, which needs the map (route mode, a meetup's place picked, any form of the box), shows the map with the pane docked under it, 40% of the screen, whatever "List" says (`body.form-docked`). The phone's header is one row: the title, Layers, List, a "Find" button that opens "Find a gym" over the map (`#search-button`, `body.search-open`; Escape closes it, and closing it empties it, so that no word filters the map unseen) and the account (the member's name, cut to fit, its menu holding Log out), none of them wrapping; what the header says beside the account goes under it. Tried at staging on a phone: List swaps the map for the list and back, a tap on a line returns to the map at the thing, a form of the pane docks under the map. Logged out, the pane says "Log in to see what is on." with "Log in with Discord" (or how to log in with `/maps`); logged in without counting as a member, "Only members of this server see what is on." (`loggedOutPane`).
-- **Distances** (`distance.ts`): `metersBetween`, which is `metresBetween` of `@pine/wayspot-core/distance` itself (the function the place search and Wayfarer matching measure with: one source for every fact, Matt 2026-10-25), and `distanceWords` (`src/render/distance-words.ts`, import-free, so that Discord's side can share it once Matt rules on one rule for both: the map says miles and feet, Discord meters and kilometers): under a tenth of a mile in feet, rounded to 10 (`60 ft`), else miles to one decimal (`1.3 mi`).
+- **Distances** (`distance.ts`): `metersBetween`, which is `metresBetween` of `@pine/wayspot-core/distance` itself (the function the place search and Wayfarer matching measure with: one source for every fact, Matt 2026-10-25), and `distanceWords` (`src/render/distance-words.ts`, import-free), the one wording of a distance on the map and on Discord (Matt, 2026-10-25; task 7), in the units of `settings.distanceUnits` (per instance, as `timezone`): a short distance never rounded to nothing (the controller's ruling): `imperial` (the default) under 100 ft to the foot (`2 ft`), under a tenth of a mile to ten feet (`520 ft`), else miles to one decimal (`1.3 mi`); `metric` under 100 m to the meter (`2 m`, so that staff's lists of gyms within ten meters keep exact meters), under a kilometer to ten (`440 m`; what would round to 1000 m is `1.0 km`), else kilometers to one decimal. The page reads the units from `data-distance-units` of the map page (`MapPageData.distanceUnits`, `WebDeps.distanceUnits`); Discord's words take them from `ctx.config.settings`, through `distanceWords` itself, the one name (round 2): `/gym` move, add, review and import, `/pokestop`, the gym view's nearest gym, `/research`'s "Same task at more stops…" and its pin without a stop, and every threshold they name (`DUPLICATE_METRES`, `PINE_STOP_NEAR_METRES`, `PIN_NEAR_METRES`, `FAR_MOVE_METRES`, `CANDIDATE_METRES`, `DEFAULT_SCAN_MARGIN`), helps included (their `details` functions of the settings). `src/text-distances.test.ts` refuses a unit of distance worded by hand in the string literals of `src/commands`, `src/render` and `src/components`, as `text-spelling.test.ts` refuses British spelling.
 
 ## The parties on the map (plan 8M-3)
 
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index d5f1842e330624aa95a4e9554c6f46bc77b5895e..e4c2709e135d6e674060799c47ef09063814015a 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -114,6 +114,7 @@ cp data/settings.json pine-settings.json
 The settings that matter first:
 
 - `timezone`: yours, as an IANA name (`America/Chicago`, `Europe/London`). Every time members type is read in it. The file comes with `America/New_York`.
+- `distanceUnits`: how Pine says a distance, on Discord and on the web map alike: `imperial` (feet under a tenth of a mile, to the foot under 100 ft, else miles; the default) or `metric` (meters under a kilometer, to the meter under 100 m, else kilometers).
 - `channels`: the names of channels the bot uses in your server: `bot-lab` (where members try commands), `mod-bot-lab` (the moderators'), `unown` (Unown sightings), `elite-gym-raids` and `remote-raids` (copies of elite and remote raids), `pvp`, `bot-updates` (announcements). Make the channels or change the names.
 - Meetup safety (optional, and off until you set it): a meetup at a place that might be private (a pin from a maps link, or a gym or PokéStop whose name sounds like a front yard: a little free library, apartments) is held for a moderator, and posted only when one approves it. Make a text channel that only your staff can see (never the public bot updates channel), and that every staff role can see (each role named `admin` or `moderator`: a moderator who cannot see it gets "You don't have access to this link" from every link of `/places` and the reports), where the bot may view, send messages and embed links, and name it in `channels`, for example `"moderation": "meetup-review"` (the example settings have it blank, which is unset). The requests and the appeals of blocked members go there, with buttons for admins and moderators. Without it every meetup is posted at once, and the bot's log warns of it at every start. To hold more names for a moderator, add `"meetupSafety": { "flaggedWords": ["duplex", "cottage"] }` (whole words, any letter case).
 - `categories.pvp`: the category of your PvP channels: `/rank` and its short forms work only there and in a direct message with the bot.
diff --git a/docs/web-setup.md b/docs/web-setup.md
index 3bcc83592f4ae3d282ff6114ce140ac118420da2..8e9fb55ddd1fd747369a3f2a0d5a6915f9ec8ae4 100644
--- a/docs/web-setup.md
+++ b/docs/web-setup.md
@@ -23,6 +23,8 @@ In `data/settings.json`:
 - `tiles`: `stadia` (the default: Stadia Maps' Alidade Smooth, light or dark as the visitor's device is; register your domain with Stadia first, section 4), `osm` (OpenStreetMap's standard tiles alone, darkened by the page in dark) or `google` (Google's roadmap, satellite and hybrid beside Stadia's; needs the browser key of section 4).
 - `memberRole` (optional, not in the example above; `"memberRole": "Verified"`): the name of a role a member must have to see and press the server's parties on the map, for a server whose members are verified before they take part (`Verified`). It is matched as Pine's other role settings are: trimmed, whatever its letter case. A member without it (an administrator excepted) sees what a visitor who is not logged in sees: the regions and gyms, no parties, and the header says they are not a member of the server; a press is refused. Leave it out (or blank) and every member of the server counts. The region editor is not affected: it is for staff. One setting serves every server the bot is in: a server without a role of that name shows its parties to its administrators only.
 
+The map says distances (its list of what is on) in the units of the top-level setting `distanceUnits`, as Discord does: `imperial` (the default) or `metric`.
+
 Build the page once: `npm run build` (or `npm run web:build` alone) writes it to `dist/web/assets/`. Without it the map's address says it has not been built.
 
 ## 2. "Log in with Discord"
diff --git a/src/app.ts b/src/app.ts
index 52623994d50b3f587f8692ad7ebd3f85a6309787..08cadc39f97646183c984976944d1c24a9b9967a 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1144,6 +1144,7 @@ export async function startApp(
       settings: webSettings,
       pictureOrigins: pictureOrigins(webSettings.publicUrl),
       googleKey: config.env.GOOGLE_MAPS_BROWSER_KEY,
+      distanceUnits: config.settings.distanceUnits,
       servers: { has: (guildId) => client.guilds.cache.has(guildId) },
       members,
       sessions: webSessions,
diff --git a/src/commands/gyms/add.ts b/src/commands/gyms/add.ts
index ad2565981ef2c14d6e19d9341e051846115edd0e..80458b059f39c46361d335411e5b56a01a91ef38 100644
--- a/src/commands/gyms/add.ts
+++ b/src/commands/gyms/add.ts
@@ -85,7 +85,7 @@ function addQuestion(
         `Add **${gymLabel({ name })}** at ${pointLink(point)}?`,
         approximate ? APPROXIMATE : undefined,
         regionsSentence(regions).replace(/^It lies/, 'It would lie'),
-        ...nearLines(near),
+        ...nearLines(near, ctx.config.settings.distanceUnits),
       ]),
     ],
     [
diff --git a/src/commands/gyms/delete-export.test.ts b/src/commands/gyms/delete-export.test.ts
index eac070ce51a1443ad1b4ca889ffefe649a2ec769..69e76d76ccf4f1c6d826ca5f0f02657c4be4d036 100644
--- a/src/commands/gyms/delete-export.test.ts
+++ b/src/commands/gyms/delete-export.test.ts
@@ -426,7 +426,7 @@ describe('/gym: what it says fits one message', () => {
     const name = '*'.repeat(100);
     const add = answerOf(await made.use('add', { location: '40.015, -80.015', name }));
     expect(said(add).length).toBeLessThanOrEqual(LIMITS.content);
-    expect(said(add)).toContain('5 other gyms lie within 10 meters of that place:');
+    expect(said(add)).toContain('5 other gyms lie within 10 m of that place:');
     expect(said(add)).toContain('- …and 2 more');
     expect(said(add)).toMatch(/…and \d+ more\.\n/);
 
@@ -439,7 +439,7 @@ describe('/gym: what it says fits one message', () => {
       /, #13\) from \[40\.015, -80\.015\]\(.+\) to \[40\.01505, -80\.015\]\(.+\)\?$/,
     );
     expect(lines.slice(1)).toEqual([
-      '4 other gyms lie within 10 meters of that place:',
+      '4 other gyms lie within 10 m of that place:',
       expect.stringMatching(/, #14\), 6 m away$/) as string,
       expect.stringMatching(/, #15\), 6 m away$/) as string,
       expect.stringMatching(/, #16\), 6 m away$/) as string,
diff --git a/src/commands/gyms/edit-move.test.ts b/src/commands/gyms/edit-move.test.ts
index 425064495bb8d53a27057bce370160b22f8af951..c930da3c71ed4e8ed5a9e1071f5db30c86c13138 100644
--- a/src/commands/gyms/edit-move.test.ts
+++ b/src/commands/gyms/edit-move.test.ts
@@ -1,6 +1,8 @@
 import { gymStop } from '../../domain/party/stops.js';
 import { MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
+import { TEST_SETTINGS_PATH } from '../../../test/support/test-settings.js';
+import { loadSettings } from '../../config/settings.js';
 import { sent } from '../../../test/support/fake-interactions.js';
 import { STAFF_PLACE, UPDATES_CHANNEL } from '../../../test/support/gym-admin.js';
 import {
@@ -408,7 +410,7 @@ describe('/gym move', () => {
     expect(said(question).split('\n')).toEqual([
       `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.05005, -80.05)}?`,
       'That is 2.8 km from where it is now.',
-      'Another gym lies within 10 meters of that place:',
+      'Another gym lies within 10 m of that place:',
       '- **Pinewood Public Library** (The Stacks, #1), 6 m away',
     ]);
     expect(buttonsOf(question).map(([label]) => label)).toEqual(['Move anyway', 'Cancel']);
@@ -448,7 +450,7 @@ describe('/gym move', () => {
       'A gym was added at that place since I asked, so nothing was moved yet.',
       `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.05, -79.95)}?`,
       'That is 7.2 km from where it is now.',
-      'Another gym lies within 10 meters of that place:',
+      'Another gym lies within 10 m of that place:',
       '- **Newcomer** (#13), 2 m away',
     ]);
     expect(made.gymStore.row(6)?.lat).toBe(40.03);
@@ -504,7 +506,7 @@ describe('/gym move', () => {
       'A gym was added at that place since I asked, so nothing was moved yet.',
       `Move **Pinewood Post Office Gym** (#12) from ${link(40.04, -80.04)} to ${link(40.015, -80.015)}?`,
       'That is 3.5 km from where it is now.',
-      'Another gym lies within 10 meters of that place:',
+      'Another gym lies within 10 m of that place:',
       '- **Maple Leaf Mosaic** (#6), 0 m away',
     ]);
     expect(made.gymStore.row(12)).toMatchObject({ lat: 40.04, lon: -80.04 });
@@ -521,7 +523,7 @@ describe('/gym move', () => {
     ]);
     expect(said(answerOf(moved)).split('\n')).toEqual([
       `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.0302, -80.03)}?`,
-      'Another gym lies within 10 meters of that place:',
+      'Another gym lies within 10 m of that place:',
       '- **Newcomer** (#13), 1 m away',
     ]);
     expect(made.gymStore.row(6)?.lat).toBe(40.03);
@@ -541,7 +543,7 @@ describe('/gym move', () => {
       'A gym was added at that place since I asked, so nothing was moved yet.',
       `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.0302, -80.03)}?`,
       'I read this from where the map was centered, not from a pin: check the link before you go on.',
-      'Another gym lies within 10 meters of that place:',
+      'Another gym lies within 10 m of that place:',
       '- **Newcomer** (#13), 1 m away',
     ]);
   });
@@ -659,7 +661,13 @@ describe('/gym move', () => {
   it('says in its help how to get a location from the game', async () => {
     const { gym } = await import('./index.js');
     const details = gym.subcommands.get('move')?.help?.details;
-    expect(typeof details === 'string' && details).toMatch(
+    const settings = loadSettings(TEST_SETTINGS_PATH);
+    const text = (distanceUnits: 'imperial' | 'metric'): string =>
+      typeof details === 'function' ? details({ ...settings, distanceUnits }) : '';
+    // The far move in the settings' units (round 2).
+    expect(text('metric')).toContain('than 500 m away or right beside another gym.');
+    expect(text('imperial')).toContain('than 0.3 mi away or right beside another gym.');
+    expect(text('metric')).toMatch(
       /^In Pokémon GO open the gym, choose View in map, share the link and paste it here\. Coordinates \(`40\.4406, -79\.9959`\) work too\. /,
     );
     const subcommands = (gym.data.toJSON().options ?? []) as {
diff --git a/src/commands/gyms/gym.test.ts b/src/commands/gyms/gym.test.ts
index f783ec5327f9eccaa4625fa38c6443f96c551491..427f1f9d8138f2ab0d965b9e85b5bf2145775e27 100644
--- a/src/commands/gyms/gym.test.ts
+++ b/src/commands/gyms/gym.test.ts
@@ -448,7 +448,7 @@ describe('/gym add', () => {
       await made.use('add', { location: '40.05005,-80.05', name: 'Library Annex' }),
     );
     expect(said(question).split('\n').slice(2)).toEqual([
-      'Another gym lies within 10 meters of that place:',
+      'Another gym lies within 10 m of that place:',
       '- **Pinewood Public Library** (The Stacks, #1), 6 m away',
     ]);
     expect(buttonsOf(question).map(([label]) => label)).toEqual([
@@ -460,6 +460,21 @@ describe('/gym add', () => {
     expect(made.gymStore.row(13)?.name).toBe('Library Annex');
   });
 
+  it('names the gym nearby in the settings’ units, feet where they are imperial (round 2)', async () => {
+    const made = await gymCommandsWith();
+    const { settings } = made.ctx.config;
+    Object.assign(made.ctx, {
+      config: { ...made.ctx.config, settings: { ...settings, distanceUnits: 'imperial' } },
+    });
+    const question = answerOf(
+      await made.use('add', { location: '40.05005,-80.05', name: 'Library Annex' }),
+    );
+    expect(said(question).split('\n').slice(2)).toEqual([
+      'Another gym lies within 33 ft of that place:',
+      '- **Pinewood Public Library** (The Stacks, #1), 18 ft away',
+    ]);
+  });
+
   it('asks again when a gym was put at that place since the question', async () => {
     const made = await gymCommandsWith();
     const first = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
@@ -473,7 +488,7 @@ describe('/gym add', () => {
       'A gym was added at that place since I asked, so nothing was added yet.',
       `Add **Clock Tower** at ${FREE_LINK}?`,
       `It would lie in <#${WEST_CHANNEL}>.`,
-      'Another gym lies within 10 meters of that place:',
+      'Another gym lies within 10 m of that place:',
       '- **Clock Tower** (#13), 0 m away',
     ]);
     expect(made.gymStore.row(14)).toBeUndefined();
@@ -498,7 +513,7 @@ describe('/gym add', () => {
       'A gym was added at that place since I asked, so nothing was added yet.',
       `Add **Clock Tower** at ${FREE_LINK}?`,
       `It would lie in <#${WEST_CHANNEL}>.`,
-      'Another gym lies within 10 meters of that place:',
+      'Another gym lies within 10 m of that place:',
       '- **Clock Tower** (#13), 0 m away',
     ]);
     expect(made.gymStore.row(14)).toBeUndefined();
diff --git a/src/commands/gyms/import.test.ts b/src/commands/gyms/import.test.ts
index 0a359bbeaf736a9e8a5f9981476ffdbfb737fc22..6cc175d8d503422146408edc712410ca97f5f60c 100644
--- a/src/commands/gyms/import.test.ts
+++ b/src/commands/gyms/import.test.ts
@@ -426,7 +426,7 @@ describe('/gym import: the preview', () => {
     await stop('Far Café', at(bench, 300));
     const { answer } = await importing(made, packed(cityFile(made)));
     expect(linesOf(answer)).toContain(
-      'A PokéStop of Pine’s own lies within 30 meters of a PokéStop of this export: ' +
+      'A PokéStop of Pine’s own lies within 30 m of a PokéStop of this export: ' +
         '**Bench Café** (`pine-1`). Wayfarer may list it now: `/pokestop remove` takes it off.',
     );
   });
@@ -837,7 +837,7 @@ describe('/gym import: the buttons', () => {
     const outcome = sentLast(imported);
     const ask = buttonId(outcome, labelsOf(outcome)[0]!);
     let question = answerOf(await made.press(ask));
-    expect(linesOf(question)[1]).toMatch(/, [\d,]+ m from the nearest region's outline$/);
+    expect(linesOf(question)[1]).toMatch(/, [\d.,]+ k?m from the nearest region's outline$/);
     for (let press = 0; press < 25; press++) question = answerOf(await made.press(ask));
     const deleting = await made.press(buttonId(question, labelsOf(question)[0]!));
     await made.settle();
diff --git a/src/commands/gyms/import.ts b/src/commands/gyms/import.ts
index 30c6cb9c70205d00e6143c4de2d599812bcde399..60444f1cecb23fc00a8ddb1177e3b609d85ed923 100644
--- a/src/commands/gyms/import.ts
+++ b/src/commands/gyms/import.ts
@@ -29,6 +29,7 @@ import {
   type WayspotExport,
   type WayspotFault,
 } from '@pine/wayspot-core/export-file';
+import { DEFAULT_SCAN_MARGIN } from '@pine/wayspot-core/scan-area';
 import { changesWayspots, type WayspotCounts } from '../../domain/wayspots/keep.js';
 import { GYM_COLOUR } from '../../render/gym-view.js';
 import { count, cutMarkdown, fitItems, plain, timestamp, truncate } from '../../render/text.js';
@@ -48,6 +49,7 @@ import type {
   WayfarerOutcome,
   WayfarerPreview,
 } from '../../services/wayfarer-import-service.js';
+import { distanceWords, type DistanceUnits } from '../../render/distance-words.js';
 import { gymWithId } from '../../render/gym-view.js';
 import { actingMember } from '../parties/reply.js';
 import { button, EXPIRED, markAnswered, NOT_YOURS, staffPlace, wasAnswered } from './shared.js';
@@ -480,7 +482,7 @@ const PINE_STOPS_NAMED = 5;
  * The stops of Pine's own of this server that lie near a PokéStop of the export (plan 8R-1):
  * Wayfarer may list them now, and staff take the one of Pine's own off. None: nothing said.
  */
-function pineStopLines(stops: readonly PineStop[]): string[] {
+function pineStopLines(stops: readonly PineStop[], units: DistanceUnits): string[] {
   if (stops.length === 0) return [];
   const named = stops
     .slice(0, PINE_STOPS_NAMED)
@@ -490,7 +492,7 @@ function pineStopLines(stops: readonly PineStop[]): string[] {
   const one = stops.length === 1;
   return [
     `${one ? 'A PokéStop' : `${String(stops.length)} PokéStops`} of Pine’s own ` +
-      `${one ? 'lies' : 'lie'} within ${String(PINE_STOP_NEAR_METRES)} meters of a PokéStop of ` +
+      `${one ? 'lies' : 'lie'} within ${distanceWords(PINE_STOP_NEAR_METRES, units)} of a PokéStop of ` +
       `this export: ${list}. Wayfarer may list ${one ? 'it' : 'them'} now: \`/pokestop remove\` ` +
       `takes ${one ? 'it' : 'one'} off.`,
   ];
@@ -554,7 +556,11 @@ function areaLines(preview: WayfarerPreview, file: WayspotExport): string[] {
 }
 
 /** The sentences that say what an import would do, and what it leaves alone. */
-function previewLines(preview: WayfarerPreview, file: WayspotExport): string[] {
+function previewLines(
+  preview: WayfarerPreview,
+  file: WayspotExport,
+  units: DistanceUnits,
+): string[] {
   const { counts } = preview;
   const lines: string[] = [];
   const wayspots = count(file.wayspots.length, 'Wayspot');
@@ -635,7 +641,7 @@ function previewLines(preview: WayfarerPreview, file: WayspotExport): string[] {
     );
   }
   lines.push(...wayspotLines(preview.wayspots, [KEPT_UNREAD]));
-  lines.push(...pineStopLines(preview.pineStopsNear));
+  lines.push(...pineStopLines(preview.pineStopsNear, units));
   lines.push(...areaLines(preview, file));
   lines.push(
     preview.lastImport === undefined
@@ -671,6 +677,7 @@ export function renderImportPreview(
   preview: WayfarerPreview,
   file: WayspotExport,
   regionNames: ReadonlyMap<string, string>,
+  units: DistanceUnits,
   buttons: APIButtonComponent[] = [],
 ):
   | { content: string }
@@ -682,7 +689,7 @@ export function renderImportPreview(
         'the regions their outlines with `/region import` first.',
     };
   }
-  const lines = previewLines(preview, file);
+  const lines = previewLines(preview, file, units);
   const byRegion =
     preview.byRegion.length === 0
       ? []
@@ -836,7 +843,7 @@ export const importGyms: SubcommandPart = {
       'Wayfarer gyms that no gym is are added, and every gym is listed in the attached report. ' +
       'An import never deletes a gym: what needs a person (which Wayspot a gym is, a gym ' +
       'Wayfarer no longer has) goes to the review queue of `/gym review`. The scan also goes a ' +
-      'little beyond the regions (500 meters unless set otherwise): Wayfarer gyms found ' +
+      `little beyond the regions (${distanceWords(DEFAULT_SCAN_MARGIN, settings.distanceUnits)} unless set otherwise): Wayfarer gyms found ` +
       'there are never added, but the report lists them as `outside`, so you see where an ' +
       'outline should grow. Gyms of this server in no region and beyond the area a finished ' +
       'scan of every region covered are listed as `beyond`: once the import is done, a button ' +
@@ -853,13 +860,14 @@ export const importGyms: SubcommandPart = {
     const file = await attachedExport(interaction, ctx);
     const preview = await ctx.wayfarer.preview(place, file);
     const names = regionNames(interaction, ctx, place);
+    const units = ctx.config.settings.distanceUnits;
     if (preview.regions === 0 || changesNothing(preview)) {
-      await interaction.editReply(renderImportPreview(preview, file, names));
+      await interaction.editReply(renderImportPreview(preview, file, names, units));
       return;
     }
     const token = pendingImports.put(interaction.user.id, { file: forImport(file) });
     await interaction.editReply(
-      renderImportPreview(preview, file, names, [
+      renderImportPreview(preview, file, names, units, [
         button(token, IMPORT_ACTION, 'Import', ButtonStyle.Primary).toJSON(),
         button(token, CANCEL_ACTION, 'Cancel', ButtonStyle.Secondary).toJSON(),
       ]),
@@ -999,7 +1007,7 @@ async function askOutside(
     const gym = ctx.gyms.get(gymId);
     return gym
       ? [
-          `- ${gymWithId(gym)}, ${Math.round(metres).toLocaleString('en-US')} m from the ` +
+          `- ${gymWithId(gym)}, ${distanceWords(metres, ctx.config.settings.distanceUnits)} from the ` +
             "nearest region's outline",
         ]
       : [];
diff --git a/src/commands/gyms/move.ts b/src/commands/gyms/move.ts
index d0f148efc7011f342e68cef68e176c78902d738b..adac6305e28fac78261597522a740e46460a031a 100644
--- a/src/commands/gyms/move.ts
+++ b/src/commands/gyms/move.ts
@@ -13,7 +13,8 @@ import { UserError } from '../../discord/errors.js';
 import { raidOf } from '../../discord/guards.js';
 import { metresBetween } from '@pine/wayspot-core/distance';
 import type { LatLon } from '@pine/wayspot-core/lat-lon';
-import { distanceText, gymWithId } from '../../render/gym-view.js';
+import { distanceWords } from '../../render/distance-words.js';
+import { gymWithId } from '../../render/gym-view.js';
 import { count } from '../../render/text.js';
 import { FAR_MOVE_METRES, type MoveAsked } from '../../services/gym-admin-service.js';
 import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
@@ -75,9 +76,11 @@ function moveQuestion(
       content([
         before,
         `Move ${gymWithId(gym)} from ${pointLink(gym)} to ${pointLink(point)}?`,
-        far ? `That is ${distanceText(metres)} from where it is now.` : undefined,
+        far
+          ? `That is ${distanceWords(metres, ctx.config.settings.distanceUnits)} from where it is now.`
+          : undefined,
         approximate ? APPROXIMATE : undefined,
-        ...nearLines(near),
+        ...nearLines(near, ctx.config.settings.distanceUnits),
         raidOf(interaction, ctx) ? USE_LOCATION : undefined,
       ]),
     ],
@@ -142,7 +145,7 @@ async function moveAnswered(
   await answerGym(
     interaction,
     await gymViewMessage(ctx, staff, gym, [
-      `Moved ${gymWithId(gym)} from ${pointLink(from)} to ${pointLink(point)} (${distanceText(metres)}).`,
+      `Moved ${gymWithId(gym)} from ${pointLink(from)} to ${pointLink(point)} (${distanceWords(metres, ctx.config.settings.distanceUnits)}).`,
       fetchNote(ctx),
       namesakeNote(ctx, gym),
       ...(elsewhere
@@ -194,12 +197,12 @@ export const moveGym: SubcommandPart = {
       .setMaxLength(1_000),
   ),
   help: {
-    details:
+    details: (settings) =>
       `${HOW_TO_LOCATE} The location is read as for ` +
       '`/gym add`. The gym keeps its texts, its raids and its ' +
       'place on train routes; its address and the places around it are fetched again, and ' +
       'the regions it lies in follow its new place. I ask first when the new place is more ' +
-      'than 500 meters away or right beside another gym. This corrects where a gym is: to ' +
+      `than ${distanceWords(FAR_MOVE_METRES, settings.distanceUnits)} away or right beside another gym. This corrects where a gym is: to ` +
       'move a raid to another gym, use `/location` in the raid’s post.',
     examples: ['/gym move gym:Big Fountain location:40.4406, -79.9959'],
   },
diff --git a/src/commands/gyms/review.test.ts b/src/commands/gyms/review.test.ts
index 8fef5110eeb806a5955844cd08557ad37863623d..ed2d5fe378ecbec8eae1b759894834b0e85a9dc2 100644
--- a/src/commands/gyms/review.test.ts
+++ b/src/commands/gyms/review.test.ts
@@ -673,7 +673,7 @@ describe('/gym review: the answers to an item to match', () => {
     const pressed = await made.press(`gymreview:${review}:new:${idOf(4)}`);
     expect(lines(made, pressed).slice(0, 3)).toEqual([
       'Nothing was added.',
-      'Another gym lies within 10 meters of that place:',
+      'Another gym lies within 10 m of that place:',
       '- **Leaf Bench** (#13), 5 m away',
     ]);
     expect(made.directory.all().some((gym) => gym.pogoId === idOf(4))).toBe(false);
diff --git a/src/commands/gyms/review.ts b/src/commands/gyms/review.ts
index 012db73eb396cae1ea974080f0fb8421a3c12665..7ba1ae2e5a59ac1658eba881abfe8d961f613654 100644
--- a/src/commands/gyms/review.ts
+++ b/src/commands/gyms/review.ts
@@ -1,3 +1,4 @@
+import { distanceWords, type DistanceUnits } from '../../render/distance-words.js';
 import {
   ButtonStyle,
   ComponentType,
@@ -17,13 +18,7 @@ import type { ReviewCandidate } from '../../domain/wayspots/review.js';
 import { isWayfarerId } from '@pine/wayspot-core/export-file';
 import { looksSponsored } from '../../domain/wayspots/sponsors.js';
 import type { ReviewCounts } from '../../db/repositories/wayfarer-repository.js';
-import {
-  distanceText,
-  GYM_COLOUR,
-  gymLabel,
-  gymWithId,
-  regionsSentence,
-} from '../../render/gym-view.js';
+import { GYM_COLOUR, gymLabel, gymWithId, regionsSentence } from '../../render/gym-view.js';
 import { gymMapsUrl } from '../../render/raid-post.js';
 import { plain, truncate } from '../../render/text.js';
 import { actionRow, container, separator, textDisplay } from '../../render/v2.js';
@@ -70,8 +65,8 @@ function lineTitle(title: string): string {
  * A button that names a candidate: `<prefix><title> (<distance>)`, the title cut so that the
  * whole fits a label; the distance tells two Wayspots of one title apart.
  */
-function candidateLabel(prefix: string, candidate: ReviewCandidate): string {
-  const tail = ` (${distanceText(candidate.metres)})`;
+function candidateLabel(prefix: string, candidate: ReviewCandidate, units: DistanceUnits): string {
+  const tail = ` (${distanceWords(candidate.metres, units)})`;
   return `${prefix}${truncate(labelTitle(candidate.title), LABEL - prefix.length - tail.length)}${tail}`;
 }
 
@@ -167,14 +162,14 @@ function sharedWords(shown: ReviewShown): string | undefined {
 }
 
 /** What became of the Wayspot of a gym that had one, as a sentence; undefined when nothing did. */
-function ownWayspotLine(shown: ReviewShown): string | undefined {
+function ownWayspotLine(shown: ReviewShown, units: DistanceUnits): string | undefined {
   const own = ownOf(shown);
   const shared = sharedWords(shown);
   if (shared !== undefined) return `It shares ${shared}`;
   if (own && own.kind !== 'gym') return `Its Wayspot is ${KIND_WORDS[own.kind]} now.`;
   if (own) {
     return (
-      `Its Wayfarer id names **${lineTitle(own.title)}**, ${distanceText(own.metres)} away: it ` +
+      `Its Wayfarer id names **${lineTitle(own.title)}**, ${distanceWords(own.metres, units)} away: it ` +
       'was not moved there without asking.'
     );
   }
@@ -185,7 +180,7 @@ function ownWayspotLine(shown: ReviewShown): string | undefined {
 }
 
 /** The question an item asks, in words. */
-function questionLines(shown: ReviewShown): string[] {
+function questionLines(shown: ReviewShown, units: DistanceUnits): string[] {
   const { item, gym } = shown;
   const named = gymWithId(gym);
   const others = item.candidates.length - gymCandidates(item).length;
@@ -198,13 +193,13 @@ function questionLines(shown: ReviewShown): string[] {
       if (far) {
         return [
           `Which Wayspot is ${named}? The Wayspot its Wayfarer id names lies ` +
-            `${distanceText(far.metres)} away: it was not moved there without asking.`,
+            `${distanceWords(far.metres, units)} away: it was not moved there without asking.`,
           ...(others > 0 ? [onlyGyms] : []),
         ];
       }
-      const own = ownWayspotLine(shown);
+      const own = ownWayspotLine(shown, units);
       return [
-        `Which Wayspot is ${named}? None within 100 m is certainly it.`,
+        `Which Wayspot is ${named}? None within ${distanceWords(CANDIDATE_METRES, units)} is certainly it.`,
         ...(own === undefined ? [] : [own]),
         ...(others > 0 ? [onlyGyms] : []),
       ];
@@ -237,8 +232,8 @@ function questionLines(shown: ReviewShown): string[] {
       const sponsored = gym.sponsor !== null && gym.sponsor !== 0;
       return [
         item.candidates.length === 0
-          ? `${named} was never found in Wayfarer, and the scan found no Wayspot within 100 m of it.`
-          : `${named} was never found in Wayfarer, and no Wayfarer gym lies within 100 m of it.`,
+          ? `${named} was never found in Wayfarer, and the scan found no Wayspot within ${distanceWords(CANDIDATE_METRES, units)} of it.`
+          : `${named} was never found in Wayfarer, and no Wayfarer gym lies within ${distanceWords(CANDIDATE_METRES, units)} of it.`,
         ...(sponsored || looksSponsored(gym.name)
           ? ['Its name looks like a sponsored location: those are not in Wayfarer.']
           : []),
@@ -250,26 +245,29 @@ function questionLines(shown: ReviewShown): string[] {
 }
 
 /** A candidate as a line: its title, kind, distance and a link to the map. */
-const candidateLine = (candidate: ReviewCandidate): string =>
+const candidateLine = (candidate: ReviewCandidate, units: DistanceUnits): string =>
   `**${lineTitle(candidate.title)}**, ${KIND_WORDS[candidate.kind]}, ` +
-  `${distanceText(candidate.metres)} away: [map](<${gymMapsUrl(candidate)}>)`;
+  `${distanceWords(candidate.metres, units)} away: [map](<${gymMapsUrl(candidate)}>)`;
 
 /**
  * The candidates of an item as lines, numbered, nearest first; the gym's own Wayspot far away
  * (`farOwnOf`) apart, after them.
  */
-function candidateLines(shown: ReviewShown): string[] {
+function candidateLines(shown: ReviewShown, units: DistanceUnits): string[] {
   const far = farOwnOf(shown);
   const near = shown.item.candidates.filter((candidate) => candidate !== far);
   return [
-    ...(near.length === 0 ? [] : ['Wayspots within 100 m:']),
-    ...near.map((candidate, i) => `${i + 1}. ${candidateLine(candidate)}`),
-    ...(far ? ['The Wayspot its Wayfarer id names:', candidateLine(far)] : []),
+    ...(near.length === 0 ? [] : [`Wayspots within ${distanceWords(CANDIDATE_METRES, units)}:`]),
+    ...near.map((candidate, i) => `${i + 1}. ${candidateLine(candidate, units)}`),
+    ...(far ? ['The Wayspot its Wayfarer id names:', candidateLine(far, units)] : []),
   ];
 }
 
 /** The buttons an item offers, by its question; "Skip for now" always. */
-function reviewButtons(shown: ReviewShown): APIActionRowComponent<APIButtonComponent>[] {
+function reviewButtons(
+  shown: ReviewShown,
+  units: DistanceUnits,
+): APIActionRowComponent<APIButtonComponent>[] {
   const { item } = shown;
   const row = (...buttons: APIButtonComponent[]) => actionRow(buttons);
   const skip = reviewButton(item.id, 'skip', 'Skip for now', ButtonStyle.Secondary);
@@ -285,7 +283,7 @@ function reviewButtons(shown: ReviewShown): APIActionRowComponent<APIButtonCompo
               reviewButton(
                 item.id,
                 'same',
-                candidateLabel('Same as ', candidate),
+                candidateLabel('Same as ', candidate, units),
                 ButtonStyle.Primary,
                 candidate.id,
               ),
@@ -306,7 +304,7 @@ function reviewButtons(shown: ReviewShown): APIActionRowComponent<APIButtonCompo
                   reviewButton(
                     item.id,
                     'new',
-                    candidateLabel('New gym: ', candidate),
+                    candidateLabel('New gym: ', candidate, units),
                     ButtonStyle.Secondary,
                     candidate.id,
                   ),
@@ -347,6 +345,7 @@ const shownText = (lines: readonly string[], limit: number): APIComponentInConta
  */
 export function reviewMessage(
   shown: ReviewShown | ReviewNone | undefined,
+  units: DistanceUnits,
   said: readonly string[] = [],
 ): V2Message {
   const done = said.length === 0 ? [] : [shownText(said, TEXT_PARTS.said), separator()];
@@ -357,19 +356,22 @@ export function reviewMessage(
     };
   }
   const { gym, regions, left, waiting } = shown;
-  const candidates = candidateLines(shown);
+  const candidates = candidateLines(shown, units);
   return {
     v2: true,
     components: [
       container(GYM_COLOUR, [
         ...done,
         shownText(
-          [...questionLines(shown), `${regionsSentence(regions)} Its place: ${pointLink(gym)}.`],
+          [
+            ...questionLines(shown, units),
+            `${regionsSentence(regions)} Its place: ${pointLink(gym)}.`,
+          ],
           TEXT_PARTS.question,
         ),
         ...(candidates.length === 0 ? [] : [shownText(candidates, TEXT_PARTS.candidates)]),
         shownText([leftWords(left, waiting)], TEXT_PARTS.left),
-        ...reviewButtons(shown),
+        ...reviewButtons(shown, units),
       ]),
     ],
   };
@@ -378,9 +380,10 @@ export function reviewMessage(
 /** The message of `reviewMessage` as an interaction sends or edits it, with the v2 flag. */
 export function reviewPayload(
   shown: ReviewShown | ReviewNone | undefined,
+  units: DistanceUnits,
   said: readonly string[] = [],
 ): ReturnType<typeof discordPayload> {
-  return discordPayload(reviewMessage(shown, said));
+  return discordPayload(reviewMessage(shown, units, said));
 }
 
 /**
@@ -430,19 +433,22 @@ function decidedLine(outcome: Extract<ReviewOutcome, { kind: 'decided' }>): stri
 }
 
 /** Why "New gym" added nothing. */
-function notAddedLines(outcome: Extract<ReviewOutcome, { kind: 'not-added' }>): string[] {
+function notAddedLines(
+  outcome: Extract<ReviewOutcome, { kind: 'not-added' }>,
+  units: DistanceUnits,
+): string[] {
   switch (outcome.why) {
     case 'untitled':
       return ['Nothing was added: that Wayspot has no title to name a gym by.'];
     case 'foreign':
       return [foreignPlace('add a gym')];
     case 'near':
-      return ['Nothing was added.', ...nearLines(outcome.near)];
+      return ['Nothing was added.', ...nearLines(outcome.near, units)];
   }
 }
 
 /** What an answer did, as the lines above the next item. */
-export function outcomeLines(outcome: ReviewOutcome): string[] {
+export function outcomeLines(outcome: ReviewOutcome, units: DistanceUnits): string[] {
   switch (outcome.kind) {
     case 'stale':
       return ['That one was already decided.'];
@@ -479,7 +485,7 @@ export function outcomeLines(outcome: ReviewOutcome): string[] {
           : change.titleProblem === 'blank'
             ? ['its name stays: the Wayspot has no title']
             : []),
-        ...(change.move ? [`moved ${distanceText(change.metres)}`] : []),
+        ...(change.move ? [`moved ${distanceWords(change.metres, units)}`] : []),
       ];
       return [
         `${gymWithId(outcome.gym)} is that Wayspot now` +
@@ -498,7 +504,7 @@ export function outcomeLines(outcome: ReviewOutcome): string[] {
           'it is.',
       ];
     case 'not-added':
-      return notAddedLines(outcome);
+      return notAddedLines(outcome, units);
     case 'failed':
       return [
         'I could not write all of that, and the question stays open; the log says what failed.',
@@ -536,6 +542,11 @@ export const reviewGyms: SubcommandPart = {
     if (place.guildId === undefined) {
       throw new UserError('I do not know this server yet. Try again in a moment.');
     }
-    await interaction.editReply(reviewPayload(await ctx.wayfarerReview.next(place.guildId)));
+    await interaction.editReply(
+      reviewPayload(
+        await ctx.wayfarerReview.next(place.guildId),
+        ctx.config.settings.distanceUnits,
+      ),
+    );
   },
 };
diff --git a/src/commands/gyms/shared.ts b/src/commands/gyms/shared.ts
index 5b964b5b63a191198ec93f5f1b8ba9dfefcfe071..4cbea2b3f8d9f27dc4719a1f94abf7db83b9234e 100644
--- a/src/commands/gyms/shared.ts
+++ b/src/commands/gyms/shared.ts
@@ -33,11 +33,16 @@ import {
   type GymTexts,
 } from '../../domain/gyms/gym-text.js';
 import { searchedWords } from '../../domain/search/gym-index.js';
-import { distanceText, GYM_COLOUR, gymWithId, renderGymView } from '../../render/gym-view.js';
+import { distanceWords, type DistanceUnits } from '../../render/distance-words.js';
+import { GYM_COLOUR, gymWithId, renderGymView } from '../../render/gym-view.js';
 import { gymMapsUrl } from '../../render/raid-post.js';
 import { count, LIMITS, plain, truncate } from '../../render/text.js';
 import { actionRow, mapPicture, textMessage } from '../../render/v2.js';
-import type { LocationOutcome, StaffPlace } from '../../services/gym-admin-service.js';
+import {
+  DUPLICATE_METRES,
+  type LocationOutcome,
+  type StaffPlace,
+} from '../../services/gym-admin-service.js';
 import { PendingRequests } from '../../services/pending-requests.js';
 import { mapOrNothing } from '../../services/static-maps.js';
 
@@ -246,15 +251,16 @@ const NEAR_SHOWN = 3;
 /** The gyms within ten metres of a place, as lines of a question; empty when there are none. */
 export function nearLines(
   near: readonly { gym: Pick<Gym, 'id' | 'name' | 'nickname'>; metres: number }[],
+  units: DistanceUnits,
 ): string[] {
   if (near.length === 0) return [];
   const listed = near
     .slice(0, NEAR_SHOWN)
-    .map(({ gym, metres }) => `- ${gymWithId(gym)}, ${distanceText(metres)} away`);
+    .map(({ gym, metres }) => `- ${gymWithId(gym)}, ${distanceWords(metres, units)} away`);
   return [
     near.length === 1
-      ? 'Another gym lies within 10 meters of that place:'
-      : `${count(near.length, 'other gym')} lie within 10 meters of that place:`,
+      ? `Another gym lies within ${distanceWords(DUPLICATE_METRES, units)} of that place:`
+      : `${count(near.length, 'other gym')} lie within ${distanceWords(DUPLICATE_METRES, units)} of that place:`,
     ...listed,
     ...(near.length > NEAR_SHOWN ? [`- …and ${near.length - NEAR_SHOWN} more`] : []),
   ];
@@ -441,6 +447,7 @@ export async function gymViewMessage(
     gym,
     regions: ctx.gymAdmin.regionsOf(gym.id, place.guildId),
     nearest: nearestGym && { gym: nearestGym, metres: metresBetween(gym, nearestGym) },
+    units: ctx.config.settings.distanceUnits,
     targets,
     map: mapPicture(map, 'Map of the gym'),
     above: lines,
diff --git a/src/commands/research/research-input.ts b/src/commands/research/research-input.ts
index 01ae74834bc7434dbc9930c40ddb3f27128c9267..619bcd08d6dd2e49a7adb795f97e9db4af4b5a71 100644
--- a/src/commands/research/research-input.ts
+++ b/src/commands/research/research-input.ts
@@ -6,7 +6,7 @@ import { guildIdOf } from '../../discord/guards.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { variedThrottleKey } from '../../discord/router.js';
 import { tidyLine } from '../../domain/gyms/gym-text.js';
-import type { KnownPlace } from '../../domain/geo/place.js';
+import { PIN_NEAR_METRES, type KnownPlace } from '../../domain/geo/place.js';
 import {
   foldTaskText,
   isItemKey,
@@ -25,6 +25,7 @@ import {
 } from '../../domain/research/versions.js';
 import { typedSubject, type ReportedStop } from '../../domain/stops/report.js';
 import { searchTokens } from '../../domain/search/text.js';
+import { distanceWords, type DistanceUnits } from '../../render/distance-words.js';
 import { plain, truncate } from '../../render/text.js';
 import type { PlaceChoice } from '../../services/place-finder.js';
 import type { ResearchSubject } from '../../services/stop-reports.js';
@@ -57,10 +58,13 @@ export const TASK_LIST_CHANGED = 'The task list just changed: pick the task agai
 export const NOT_A_STOP =
   'Field research is at PokéStops: pick a PokéStop from the list that appears while you type.';
 
-/** Said of a pin without a PokéStop within 50 meters. */
-export const NO_STOP_AT_PIN =
-  'I know no PokéStop within 50 meters of that pin: pick one from the list that appears while ' +
-  'you type.';
+/** Said of a pin without a PokéStop within `PIN_NEAR_METRES`, in the settings' units. */
+export function noStopAtPin(units: DistanceUnits): string {
+  return (
+    `I know no PokéStop within ${distanceWords(PIN_NEAR_METRES, units)} of that pin: pick one ` +
+    'from the list that appears while you type.'
+  );
+}
 
 /** The options that name a stop, the first required. */
 export const STOP_OPTIONS = ['stop', 'stop2', 'stop3', 'stop4', 'stop5'] as const;
@@ -119,7 +123,7 @@ export async function namedStop(
   if (place.kind !== 'pin') return reportedStop(place);
   const row = await ctx.guilds.idFor(guildIdOf(interaction));
   const near = row === undefined ? undefined : ctx.placeFinder.nearestStop(row, place);
-  if (!near) throw new UserError(NO_STOP_AT_PIN);
+  if (!near) throw new UserError(noStopAtPin(ctx.config.settings.distanceUnits));
   return reportedStop(near);
 }
 
diff --git a/src/commands/research/research.test.ts b/src/commands/research/research.test.ts
index 5b9a9d5444247ecb9599eb06a4a2c6587cc6c78c..010cd6b46506ee090f76029f1d808e118b0f410f 100644
--- a/src/commands/research/research.test.ts
+++ b/src/commands/research/research.test.ts
@@ -31,7 +31,7 @@ import { InteractionRouter } from '../../discord/router.js';
 import { Throttles } from '../../discord/throttle.js';
 import { StopReportService } from '../../services/stop-reports.js';
 import {
-  NO_STOP_AT_PIN,
+  noStopAtPin,
   NO_STOPS_HERE,
   NOT_A_STOP,
   PICK_THE_REWARD,
@@ -236,7 +236,7 @@ describe('/research report', () => {
     ).toBe(RESEARCH_FROM_A_REGION);
     expect(await refused({ task: '0123456789abcdef', stop: stop(1) })).toBe(TASK_LIST_CHANGED);
     expect(await refused({ task: DRAGON.key, stop: `powerspot:${wayspotId(5)}` })).toBe(NOT_A_STOP);
-    expect(await refused({ task: DRAGON.key, stop: '40.03, -80.09' })).toBe(NO_STOP_AT_PIN);
+    expect(await refused({ task: DRAGON.key, stop: '40.03, -80.09' })).toBe(noStopAtPin('metric'));
     expect(made.store.rows.size).toBe(0);
     // Nothing counted: the limit is all there.
     // Each a correction of the one before (plan 8R-5: the same task again is reported already).
diff --git a/src/commands/research/research.ts b/src/commands/research/research.ts
index 092548b7678c9dce29f6f32f6d7fdd27708dd03d..6f8bbdc27077eacefdaf6c8c835f7dee34857ba4 100644
--- a/src/commands/research/research.ts
+++ b/src/commands/research/research.ts
@@ -160,6 +160,7 @@ async function answerOf(
   const [first] = outcome.saved;
   return researchAnswer({
     ...view,
+    units: ctx.config.settings.distanceUnits,
     more:
       first === undefined
         ? []
diff --git a/src/commands/stops/pokestop.test.ts b/src/commands/stops/pokestop.test.ts
index 85e9fe341b332d94adda256acb417468f3cbe8ed..19a6b56bcc0374e83b536aafca77247c6f0b5c67 100644
--- a/src/commands/stops/pokestop.test.ts
+++ b/src/commands/stops/pokestop.test.ts
@@ -96,11 +96,21 @@ describe('/pokestop', () => {
     ).toEqual(['pine-1']);
   });
 
-  it('asks before adding a stop within 30 meters of a PokéStop, and adds it on Add anyway', async () => {
+  it('names the PokéStop nearby in the settings’ units, feet where they are imperial (round 2)', async () => {
+    const { use, ctx } = await setup();
+    Object.assign(ctx, {
+      config: { ...ctx.config, settings: { ...ctx.config.settings, distanceUnits: 'imperial' } },
+    });
+    const question = answerOf(await use('add', { name: 'Mural Café', at: '40.0601, -80.0601' }));
+    expect(said(question)).toContain('A PokéStop lies within 98 ft of that place:');
+    expect(said(question)).toContain('**Yellow Mural**, 46 ft away');
+  });
+
+  it('asks before adding a stop within 30 m of a PokéStop, and adds it on Add anyway', async () => {
     const { use, press, stored } = await setup();
     const question = answerOf(await use('add', { name: 'Mural Café', at: '40.0601, -80.0601' }));
     expect(said(question)).toContain('Add the PokéStop **Mural Café**');
-    expect(said(question)).toContain('A PokéStop lies within 30 meters of that place:');
+    expect(said(question)).toContain('A PokéStop lies within 30 m of that place:');
     expect(said(question)).toContain('**Yellow Mural**, 14 m away');
     expect(buttonsOf(question).map(([label]) => label)).toEqual(['Add anyway', 'Cancel']);
     expect(stored.rows.size).toBe(0);
diff --git a/src/commands/stops/pokestop.ts b/src/commands/stops/pokestop.ts
index b502838c6855daa93ea1f4daf1d97d4428bf4de2..bf0fe2350ff58ef3cf5a2d6b7187d27f0894e209 100644
--- a/src/commands/stops/pokestop.ts
+++ b/src/commands/stops/pokestop.ts
@@ -26,7 +26,8 @@ import {
   type PineStopChange,
 } from '../../domain/stops/pine-stop.js';
 import { pineStopKey } from '../../domain/stops/report.js';
-import { distanceText, GYM_COLOUR, regionsSentence } from '../../render/gym-view.js';
+import { distanceWords } from '../../render/distance-words.js';
+import { GYM_COLOUR, regionsSentence } from '../../render/gym-view.js';
 import { count, endSentence, plain, truncate } from '../../render/text.js';
 import { actionRow, textMessage } from '../../render/v2.js';
 import { EXPIRED, NOT_YOURS, PendingRequests } from '../../services/pending-requests.js';
@@ -168,11 +169,11 @@ const addStop: SubcommandPart = {
         .setMaxLength(MAX_PINE_STOP_ADDRESS),
     ),
   help: {
-    details:
+    details: (settings) =>
       'Adds a PokéStop that the Wayfarer export does not have (sponsored stops are missing there) ' +
       'to this server. `at` is the link Pokémon GO shares for the stop, a maps link or ' +
       'coordinates; it must lie in a region of this server. Members then find it wherever a ' +
-      `PokéStop is asked for. Within ${String(PINE_STOP_NEAR_METRES)} meters of another ` +
+      `PokéStop is asked for. Within ${distanceWords(PINE_STOP_NEAR_METRES, settings.distanceUnits)} of another ` +
       'PokéStop I ask before adding it: it may be listed already.',
     examples: ['/pokestop add name:Coffee Corner at:40.4406, -79.9959 address:12 Market Street'],
   },
@@ -206,7 +207,7 @@ const addStop: SubcommandPart = {
       .slice(0, NEAR_SHOWN)
       .map(
         ({ wayspot, metres }) =>
-          `- **${plain(truncate(wayspot.title, 80))}**, ${distanceText(metres)} away`,
+          `- **${plain(truncate(wayspot.title, 80))}**, ${distanceWords(metres, ctx.config.settings.distanceUnits)} away`,
       );
     await answerApart(
       interaction,
@@ -216,9 +217,9 @@ const addStop: SubcommandPart = {
           `Add the PokéStop **${plain(name)}** at ${pointLink(point)}?`,
           [
             near.length === 1
-              ? `A PokéStop lies within ${String(PINE_STOP_NEAR_METRES)} meters of that place:`
-              : `${count(near.length, 'PokéStop')} lie within ${String(PINE_STOP_NEAR_METRES)} ` +
-                'meters of that place:',
+              ? `A PokéStop lies within ${distanceWords(PINE_STOP_NEAR_METRES, ctx.config.settings.distanceUnits)} of that place:`
+              : `${count(near.length, 'PokéStop')} lie within ` +
+                `${distanceWords(PINE_STOP_NEAR_METRES, ctx.config.settings.distanceUnits)} of that place:`,
             ...listed,
             ...(near.length > NEAR_SHOWN ? [`- …and ${near.length - NEAR_SHOWN} more`] : []),
           ].join('\n'),
diff --git a/src/components/gym-review.ts b/src/components/gym-review.ts
index 92fa5f736eb47c31b451a5755eba93363838ff98..db63ba5b6819533c98909c81e2eab85f9ee81cc6 100644
--- a/src/components/gym-review.ts
+++ b/src/components/gym-review.ts
@@ -36,7 +36,9 @@ export const gymReviewControls: ComponentHandler = {
     if (place.guildId === undefined) {
       // The message is components v2, and stays so.
       await interaction.editReply(
-        reviewPayload(undefined, ['I do not know this server yet. Try again in a moment.']),
+        reviewPayload(undefined, ctx.config.settings.distanceUnits, [
+          'I do not know this server yet. Try again in a moment.',
+        ]),
       );
       return;
     }
@@ -56,6 +58,12 @@ export const gymReviewControls: ComponentHandler = {
     const again =
       outcome.kind === 'back' ? await ctx.wayfarerReview.shown(place.guildId, reviewId) : undefined;
     const next = again ?? (await ctx.wayfarerReview.next(place.guildId));
-    await interaction.editReply(reviewPayload(next, outcomeLines(outcome)));
+    await interaction.editReply(
+      reviewPayload(
+        next,
+        ctx.config.settings.distanceUnits,
+        outcomeLines(outcome, ctx.config.settings.distanceUnits),
+      ),
+    );
   },
 };
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index 43b361865594ccb3738270c30c86f01c48c0d913..66ba6a3afaf1067a8224025b2df02d066cdd599d 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -142,6 +142,18 @@ describe('loadSettings', () => {
     }
   });
 
+  it('words distances in imperial units unless the file says metric (task 7)', () => {
+    expect(loadSettings(REPO_SETTINGS).distanceUnits).toBe('imperial');
+    const metric = writeSettings((s) => {
+      s.distanceUnits = 'metric';
+    });
+    expect(loadSettings(metric).distanceUnits).toBe('metric');
+    const wrong = writeSettings((s) => {
+      s.distanceUnits = 'furlongs';
+    });
+    expect(() => loadSettings(wrong)).toThrow(/distanceUnits/);
+  });
+
   it('has no web server unless the file asks for one', () => {
     expect(loadSettings(REPO_SETTINGS).web).toBeUndefined();
   });
diff --git a/src/config/settings.ts b/src/config/settings.ts
index 720bb5363ee77e48bfa5572466e2131cf3a3deee..68b60f9e459e9b160a613890f55fceb3ca560ab5 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -312,6 +312,12 @@ export const settingsSchema = z.strictObject({
   timezone: z
     .string()
     .refine(isTimeZone, { message: 'must be an IANA time zone, e.g. America/New_York' }),
+  /**
+   * The units every distance Pine says is in, on the map and on Discord alike (Matt,
+   * 2026-10-25): `imperial` (feet and miles, the default) or `metric` (meters and kilometers);
+   * `distanceWords` of `src/render/distance-words.ts`.
+   */
+  distanceUnits: z.enum(['imperial', 'metric']).default('imperial'),
   archiveRetentionDays: z.number().int().positive().nullable(),
   /**
    * Reading raid screenshots (Phase 7). The models run in a child process of their own, one
diff --git a/src/render/distance-words.test.ts b/src/render/distance-words.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b3c82f967d72b201ef94734d1af4f2da41ba07ee
--- /dev/null
+++ b/src/render/distance-words.test.ts
@@ -0,0 +1,31 @@
+import { describe, expect, it } from 'vitest';
+import { distanceWords } from './distance-words.js';
+
+/** Feet in meters. */
+const ft = (feet: number) => feet / 3.280_839_9;
+
+describe('distanceWords (task 7: one wording by settings.distanceUnits)', () => {
+  it('says imperial distances to the foot under 100 ft, to ten under a tenth of a mile, else miles', () => {
+    expect(distanceWords(0, 'imperial')).toBe('0 ft');
+    // A short distance is never rounded to nothing.
+    expect(distanceWords(ft(2), 'imperial')).toBe('2 ft');
+    expect(distanceWords(ft(99.4), 'imperial')).toBe('99 ft');
+    expect(distanceWords(ft(104), 'imperial')).toBe('100 ft');
+    expect(distanceWords(160, 'imperial')).toBe('520 ft');
+    expect(distanceWords(161, 'imperial')).toBe('0.1 mi');
+    expect(distanceWords(1609.344 * 12, 'imperial')).toBe('12.0 mi');
+  });
+
+  it('says metric distances to the meter under 100 m, to ten under a kilometer, else kilometers', () => {
+    expect(distanceWords(0, 'metric')).toBe('0 m');
+    expect(distanceWords(2, 'metric')).toBe('2 m');
+    expect(distanceWords(44, 'metric')).toBe('44 m');
+    expect(distanceWords(99.4, 'metric')).toBe('99 m');
+    expect(distanceWords(104, 'metric')).toBe('100 m');
+    expect(distanceWords(994, 'metric')).toBe('990 m');
+    // What would round to 1000 m is said as a kilometer.
+    expect(distanceWords(995, 'metric')).toBe('1.0 km');
+    expect(distanceWords(1_000, 'metric')).toBe('1.0 km');
+    expect(distanceWords(12_345, 'metric')).toBe('12.3 km');
+  });
+});
diff --git a/src/render/distance-words.ts b/src/render/distance-words.ts
index f808e999f0328273e1cc0c0bd94847ef6202e116..e08a0e4051db8c932bd9fb80120fe0f4a1c361a8 100644
--- a/src/render/distance-words.ts
+++ b/src/render/distance-words.ts
@@ -1,15 +1,31 @@
 /**
- * A distance in words (plan 8M-7), for the live map's list today and, once Matt rules on one rule
- * for both sides (the map says miles and feet, Discord says meters and kilometers), for Discord's
- * too: kept here, with no import, so that the page's bundle and the renderer can share it.
+ * A distance in words, one wording for the live map and every Discord text that says a distance
+ * (Matt, 2026-10-25: one setting shared by both, `settings.distanceUnits`, per instance as
+ * `timezone` is). No import, so that the page's bundle takes it as the renderer does.
  */
 
+/** The units distances are said in (`settings.distanceUnits`). */
+export type DistanceUnits = 'imperial' | 'metric';
+
 const METERS_PER_MILE = 1609.344;
 const FEET_PER_METER = 3.280_839_9;
 
-/** Under a tenth of a mile in feet, to ten (`60 ft`); else miles to one decimal (`1.3 mi`). */
-export function distanceWords(meters: number): string {
+/**
+ * A short distance is never rounded to nothing (the controller's ruling): under 100 of the unit
+ * to the whole one. Imperial: under 100 ft to the foot (`2 ft`), under a tenth of a mile to ten
+ * feet (`520 ft`), else miles to one decimal (`1.3 mi`). Metric: under 100 m to the meter
+ * (`2 m`), under a kilometer to ten (`440 m`), else kilometers to one decimal (`1.3 km`); what
+ * would round to 1000 m is said as `1.0 km`.
+ */
+export function distanceWords(meters: number, units: DistanceUnits): string {
+  if (units === 'metric') {
+    const whole = Math.round(meters);
+    if (whole < 100) return `${whole} m`;
+    const tens = Math.round(meters / 10) * 10;
+    return tens < 1_000 ? `${tens} m` : `${(meters / 1_000).toFixed(1)} km`;
+  }
   const miles = meters / METERS_PER_MILE;
-  if (miles < 0.1) return `${Math.round((meters * FEET_PER_METER) / 10) * 10} ft`;
-  return `${miles.toFixed(1)} mi`;
+  if (miles >= 0.1) return `${miles.toFixed(1)} mi`;
+  const feet = meters * FEET_PER_METER;
+  return Math.round(feet) < 100 ? `${Math.round(feet)} ft` : `${Math.round(feet / 10) * 10} ft`;
 }
diff --git a/src/render/gym-view.test.ts b/src/render/gym-view.test.ts
index 96f074e991c81d9fbe370fadf0289c70ab5248b1..50ac26315f1494cd6f87e436c772f0edf0895140 100644
--- a/src/render/gym-view.test.ts
+++ b/src/render/gym-view.test.ts
@@ -3,7 +3,6 @@ import { ButtonStyle, ComponentType } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import { testGyms } from '../../test/support/gyms.js';
 import {
-  distanceText,
   gymAnnouncement,
   gymRemovedLine,
   gymWithId,
@@ -36,6 +35,7 @@ const view = (gym: Partial<ViewedGym> = {}, more: Partial<GymView> = {}): GymVie
   regions: [{ channelId: '100000000000000001' }],
   nearest: { gym: { id: 12, name: 'Pinewood Post Office Gym', nickname: null }, metres: 1_402.4 },
   targets: 3,
+  units: 'metric',
   ...more,
 });
 
@@ -89,10 +89,11 @@ describe('sentences about a gym', () => {
     );
   });
 
-  it('says a distance in metres, and in kilometres from one on', () => {
-    expect(distanceText(4.4)).toBe('4 m');
-    expect(distanceText(999.4)).toBe('999 m');
-    expect(distanceText(1_402.4)).toBe('1.4 km');
+  it("says the nearest gym's distance in the units of the settings (task 7)", () => {
+    const nearest = (units: 'metric' | 'imperial') =>
+      textDisplays(renderGymView(view({}, { units }))).join(' ');
+    expect(nearest('metric')).toContain('(#12), 1.4 km away');
+    expect(nearest('imperial')).toContain('(#12), 0.9 mi away');
   });
 
   it('announces a new gym without its nickname when it has none, and without a ping', () => {
diff --git a/src/render/gym-view.ts b/src/render/gym-view.ts
index 4b660c9b98e2fd27cb208236a1a94c9f9aa86d98..ada04edcf695163786b7c269c688657d6b5cfa1b 100644
--- a/src/render/gym-view.ts
+++ b/src/render/gym-view.ts
@@ -1,4 +1,5 @@
 import type { APIButtonComponent } from 'discord.js';
+import { distanceWords, type DistanceUnits } from './distance-words.js';
 import type { V2Message } from '../discord/party-gateway.js';
 import { addressLine } from '../domain/geo/google.js';
 import { tidyLine } from '../domain/gyms/gym-text.js';
@@ -142,11 +143,6 @@ export function gymRemovedLine(gym: Pick<NamedGym, 'id' | 'name' | 'nickname'>):
   return `${gymWithId(gym)} was removed from the gym list.`;
 }
 
-/** A distance as staff read it: metres up to a kilometre, kilometres with one decimal beyond. */
-export function distanceText(metres: number): string {
-  return metres < 1_000 ? `${Math.round(metres)} m` : `${(metres / 1_000).toFixed(1)} km`;
-}
-
 /** What the full view shows of a gym (`Gym` of the repository has all of it). */
 export interface ViewedGym extends NamedGym {
   description: string | null;
@@ -166,6 +162,8 @@ export interface GymView {
   nearest?: { gym: Pick<NamedGym, 'id' | 'name' | 'nickname'>; metres: number } | undefined;
   /** How many members have it as a gym target; undefined when that could not be read. */
   targets?: number | undefined;
+  /** The units distances are said in (`settings.distanceUnits`, task 7). */
+  units: DistanceUnits;
   /** The map (`mapPicture`); without it, none. */
   map?: MapPicture | undefined;
   /** What an answer says above the view (what a change did); nothing for `/gym show`. */
@@ -249,7 +247,7 @@ export function renderGymView(view: GymView): V2Message {
     // Cut inside `gymWithId`, before escaping: never here, where a cut could lose the `**`.
     `**Nearest gym:** ${
       view.nearest
-        ? `${gymWithId(view.nearest.gym)}, ${distanceText(view.nearest.metres)} away`
+        ? `${gymWithId(view.nearest.gym)}, ${distanceWords(view.nearest.metres, view.units)} away`
         : 'none'
     }`,
     ...(gym.places
diff --git a/src/render/research.test.ts b/src/render/research.test.ts
index 506742cdd56f985915e79f96e88f2b2e577d1f4b..c472d3c5ffcff284ae26fc296dd3801989e961b3 100644
--- a/src/render/research.test.ts
+++ b/src/render/research.test.ts
@@ -36,6 +36,7 @@ function answerView(): ResearchAnswerView {
     id: 3,
   };
   return {
+    units: 'metric',
     saved: [
       { report: report(7, 1), replaced: before },
       { report: report(8, 2), replaced: undefined },
diff --git a/src/render/research.ts b/src/render/research.ts
index e4f746a471eb0cf4574f98f2dde4ca5c8ccf627e..1f23561b1d51566fb33bdf0b4c1f39bafa2d66c1 100644
--- a/src/render/research.ts
+++ b/src/render/research.ts
@@ -1,3 +1,4 @@
+import { distanceWords, type DistanceUnits } from './distance-words.js';
 import {
   ButtonStyle,
   ComponentType,
@@ -173,6 +174,8 @@ export interface ResearchWordsView {
 export interface ResearchAnswerView extends ResearchWordsView {
   /** The stops near the first that have no report of this task in the period (25 at most). */
   more: readonly MoreStop[];
+  /** The units distances are said in (`settings.distanceUnits`, task 7). */
+  units: DistanceUnits;
 }
 
 /** A channel as a caller's answer names it: `<#id>` on Discord, `#west` on the map. */
@@ -181,11 +184,6 @@ export type ChannelNamer = (channelId: string) => string;
 /** A channel as Discord shows it: a mention. */
 export const DISCORD_CHANNEL: ChannelNamer = (channelId) => `<#${channelId}>`;
 
-/** A distance as a choice's description shows it. */
-function distance(metres: number): string {
-  return metres < 1_000 ? `${String(Math.round(metres))} m` : `${(metres / 1_000).toFixed(1)} km`;
-}
-
 /**
  * The words of a research report's answer (plan 8R-3: shared by `/research` and the map): the
  * task and its rewards, each stop (with the task it replaced: "was: Catch 7 Pokémon"; "again"
@@ -263,7 +261,7 @@ export function researchAnswer(view: ResearchAnswerView): V2Message {
         label: truncate(stop.name, 100),
         value: stop.key,
         description: truncate(
-          `${distance(stop.metres)} away${stop.where === undefined ? '' : ` · ${stop.where}`}`,
+          `${distanceWords(stop.metres, view.units)} away${stop.where === undefined ? '' : ` · ${stop.where}`}`,
           100,
         ),
       })),
diff --git a/src/services/gym-admin-service.ts b/src/services/gym-admin-service.ts
index 99e5fc655346b09cca9538c71c7bb09af52e3f6a..d53afa60afb969581e812a64e6f4e45b30ba41b7 100644
--- a/src/services/gym-admin-service.ts
+++ b/src/services/gym-admin-service.ts
@@ -40,7 +40,8 @@ import { gymRegionsInGuild, type RegionProvider } from './region-directory.js';
 import type { TrainService } from './train-service.js';
 
 /** Another gym this near to a place is asked about before a gym is put there. */
-const DUPLICATE_METRES = 10;
+/** Another gym this near a place is named before one is added or moved there. */
+export const DUPLICATE_METRES = 10;
 /** A move of a gym further than this is asked about first: a gym is corrected by metres. */
 export const FAR_MOVE_METRES = 500;
 /**
diff --git a/src/text-distances.test.ts b/src/text-distances.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9be75dcb765b086f66dd420d74691e1865eddb21
--- /dev/null
+++ b/src/text-distances.test.ts
@@ -0,0 +1,88 @@
+import { readdirSync, readFileSync } from 'node:fs';
+import path from 'node:path';
+import ts from 'typescript';
+import { describe, expect, it } from 'vitest';
+
+/**
+ * Every distance Pine says to members or staff goes through `distanceWords(…, settings
+ * .distanceUnits)` (`src/render/distance-words.ts`, Matt 2026-10-25): no unit of distance is
+ * worded by hand in the string and template literals of what speaks (`src/commands`,
+ * `src/render`, `src/components`). Comments and identifiers are no texts.
+ */
+
+const SRC = import.meta.dirname;
+const SPEAKING = ['commands', 'render', 'components'];
+
+/** A unit of distance in words: meters, kilometers (either spelling), or a number with m or km. */
+const UNIT = /\b(?:met(?:er|re)s?|kilomet(?:er|re)s?)\b|\d\s?k?m\b/iu;
+
+/** Texts that are no distance said to anybody, by file (from `src/`) and exact text. */
+const ALLOWED: Record<string, { texts: string[]; why: string }> = {
+  'render/distance-words.ts': { texts: [' m', ' km'], why: 'the one wording itself' },
+  'render/wayfarer-report.ts': {
+    texts: ['gym,name,what,wayspot,title,kind,metres,cell,region'],
+    why: "the columns of the Wayfarer report's CSV file, a file format (CLAUDE.md)",
+  },
+};
+
+const sources = SPEAKING.flatMap((folder) =>
+  readdirSync(path.join(SRC, folder), { recursive: true, withFileTypes: true })
+    .filter((entry) => entry.isFile())
+    .map((entry) =>
+      path.relative(SRC, path.join(entry.parentPath, entry.name)).replace(/\\/gu, '/'),
+    )
+    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts')),
+);
+
+/** The texts of a file's string and template literals, with lines; module paths aside. */
+function texts(file: string): { line: number; text: string }[] {
+  const source = ts.createSourceFile(
+    file,
+    readFileSync(path.join(SRC, file), 'utf8'),
+    ts.ScriptTarget.Latest,
+    true,
+  );
+  const found: { line: number; text: string }[] = [];
+  const visit = (node: ts.Node): void => {
+    if (
+      ts.isStringLiteral(node) ||
+      ts.isNoSubstitutionTemplateLiteral(node) ||
+      ts.isTemplateHead(node) ||
+      ts.isTemplateMiddle(node) ||
+      ts.isTemplateTail(node)
+    ) {
+      const { parent } = node;
+      const modulePath =
+        (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
+        parent.moduleSpecifier === node;
+      if (!modulePath && !ts.isLiteralTypeNode(parent)) {
+        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
+        found.push({ line: line + 1, text: node.text });
+      }
+    }
+    ts.forEachChild(node, visit);
+  };
+  visit(source);
+  return found;
+}
+
+describe('distances in what Pine says (round 2)', () => {
+  it('finds a unit of distance worded by hand, and nothing else', () => {
+    for (const text of ['within 10 m of that place', '500 m away', 'in 2 km', 'metres']) {
+      expect(UNIT.test(text), text).toBe(true);
+    }
+    for (const text of ['Make the meetup', 'in 5 min', 'Moveset', '2 more']) {
+      expect(UNIT.test(text), text).toBe(false);
+    }
+  });
+
+  it('words no unit of distance by hand outside distanceWords', () => {
+    expect(sources.length).toBeGreaterThan(50);
+    const found = sources.flatMap((file) =>
+      texts(file)
+        .filter(({ text }) => UNIT.test(text) && !(ALLOWED[file]?.texts.includes(text) ?? false))
+        .map(({ line, text }) => `${file}:${line} ${text}`),
+    );
+    expect(found).toEqual([]);
+  });
+});
diff --git a/src/web/client/distance.test.ts b/src/web/client/distance.test.ts
index 14923d9357a3543619abb26f17b7a99741231682..713510094109e1945d135399ac1bc7ce9f686c7f 100644
--- a/src/web/client/distance.test.ts
+++ b/src/web/client/distance.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from 'vitest';
 import { metresBetween } from '@pine/wayspot-core/distance';
-import { distanceWords, metersBetween } from './distance.js';
+import { metersBetween } from './distance.js';
 
 describe('distances (plan 8M-7)', () => {
   it('measures along the earth as the rest of Pine does, by the one shared function', () => {
@@ -9,13 +9,4 @@ describe('distances (plan 8M-7)', () => {
     expect(metersBetween({ lat: 40, lon: -80 }, { lat: 40.001, lon: -80 })).toBeCloseTo(111.2, 0);
     expect(metersBetween({ lat: 40, lon: -80 }, { lat: 40, lon: -80 })).toBe(0);
   });
-
-  it('says under a tenth of a mile in feet, to ten, and more in miles, to one decimal', () => {
-    expect(distanceWords(0)).toBe('0 ft');
-    expect(distanceWords(18.3)).toBe('60 ft');
-    expect(distanceWords(160)).toBe('520 ft');
-    expect(distanceWords(161)).toBe('0.1 mi');
-    expect(distanceWords(1609.344 * 1.26)).toBe('1.3 mi');
-    expect(distanceWords(1609.344 * 12)).toBe('12.0 mi');
-  });
 });
diff --git a/src/web/client/distance.ts b/src/web/client/distance.ts
index 04fb387ead431af96abd2a96be6dc81ce45fc546..048f12833607b79889b5c196459fffcc08743eed 100644
--- a/src/web/client/distance.ts
+++ b/src/web/client/distance.ts
@@ -1,10 +1,11 @@
 import { metresBetween } from '@pine/wayspot-core/distance';
-import { distanceWords } from '../../render/distance-words.js';
+import { distanceWords, type DistanceUnits } from '../../render/distance-words.js';
 
 /**
  * Distances on the live map (plan 8M-7), for the list and the plans after it: measured by the
  * one function the rest of Pine measures with (`metresBetween` of `@pine/wayspot-core`: the
- * place search, Wayfarer matching), said in miles and feet (Matt: the members are American).
+ * place search, Wayfarer matching), said by `distanceWords` in the units of
+ * `settings.distanceUnits` (task 7), which the page reads from `data-distance-units`.
  */
 
 export interface Place {
@@ -15,5 +16,5 @@ export interface Place {
 /** How far apart two places are, in meters: the shared function itself, never a copy. */
 export const metersBetween: (a: Place, b: Place) => number = metresBetween;
 
-/** A distance in words: `distanceWords` of `src/render/`, shared once both sides take one rule. */
-export { distanceWords };
+/** A distance in words: `distanceWords` of `src/render/`, the one wording of the map and Discord. */
+export { distanceWords, type DistanceUnits };
diff --git a/src/web/client/list-ui.test.ts b/src/web/client/list-ui.test.ts
index 73befca4a26615470cb1d5c4719e5c133ba73503..1da8bf585f5f78cce5d2e192c15a958f790bb986 100644
--- a/src/web/client/list-ui.test.ts
+++ b/src/web/client/list-ui.test.ts
@@ -125,6 +125,7 @@ describe('a line of the list shown with its popup (fix round 2)', () => {
       storage: undefined,
       origin: () => undefined,
       zone: () => 'America/New_York',
+      units: 'imperial',
       open: () => false,
       highlight: () => undefined,
       detail: () => {
diff --git a/src/web/client/list-ui.ts b/src/web/client/list-ui.ts
index 5c219200bedc8827547c6889fc4a97c4f9824ecb..2a02ac7051df01936f9a4fe737fe1dd589a981f5 100644
--- a/src/web/client/list-ui.ts
+++ b/src/web/client/list-ui.ts
@@ -1,4 +1,5 @@
 import type { LayerRegistry } from './layer-registry.js';
+import type { DistanceUnits } from './distance.js';
 import type { LatLon, ViewStorage } from './view.js';
 import {
   lineWords,
@@ -27,6 +28,8 @@ export interface WhatIsOnDeps {
   /** Where distances are measured from: your location, else the map's middle. */
   origin(): LatLon | undefined;
   zone(): string;
+  /** The units distances are said in (`settings.distanceUnits`, task 7). */
+  units: DistanceUnits;
   /** A line tapped: fly there and open it; false where the map does not draw it. */
   open(line: ListLine): boolean;
   highlight(line: ListLine, on: boolean): void;
@@ -132,7 +135,7 @@ export class WhatIsOn {
   }
 
   private item(line: ListLine, origin: LatLon | undefined, now: number): HTMLLIElement {
-    const words = lineWords(line, origin, now, this.deps.zone());
+    const words = lineWords(line, origin, now, this.deps.zone(), this.deps.units);
     const item = document.createElement('li');
     item.className = words.dimmed ? 'line dim' : 'line';
     const button = document.createElement('button');
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index d6bccd8e4d986024311780aa54534b0b478047bd..1a0528849903028773916edcba10a4881e90087e 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -234,6 +234,8 @@ function start(): void {
         showMap: () => {
           showList(false);
         },
+        // The settings' units (task 7), as Discord says distances.
+        units: data.distanceUnits === 'metric' ? 'metric' : 'imperial',
       });
       gymExtras.editing = () => raids.editing();
       gymExtras.of = (gym) => raids.gymControls(gym);
diff --git a/src/web/client/party-layer.isolated.test.ts b/src/web/client/party-layer.isolated.test.ts
index 6244be1625bd1b2366cfdb3c089376eb259ed50c..ce7db435eba08ddbf341b09f3a48b568e52caae8 100644
--- a/src/web/client/party-layer.isolated.test.ts
+++ b/src/web/client/party-layer.isolated.test.ts
@@ -238,6 +238,7 @@ describe("the map's popups (showParties)", () => {
         onMove: () => undefined,
         storage: undefined,
         showMap: () => undefined,
+        units: 'imperial',
       },
     );
     /** Leaflet fires an event on the map. */
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 2f3e89a938174b3c243db0b04e6333cae78bcec0..c81da37beca230898b88c4fcf6e630400e397be8 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -45,6 +45,7 @@ import {
   ringSizes,
   type RingSize,
 } from './raid-marker.js';
+import type { DistanceUnits } from './distance.js';
 import { WhatIsOn } from './list-ui.js';
 import { STREET_ZOOM, type LatLon, type ViewStorage } from './view.js';
 import { ListRefresh, listLines, paneShows } from './what-is-on.js';
@@ -157,6 +158,8 @@ export interface PartyFrame {
   storage: ViewStorage | undefined;
   /** On a phone, the list swapped back for the map before a line is flown to. */
   showMap: () => void;
+  /** The units distances are said in (`settings.distanceUnits`, task 7). */
+  units: DistanceUnits;
 }
 
 export interface MapRaids {
@@ -480,6 +483,7 @@ export function showParties(
     rendered: () => {
       hold.checkGone();
     },
+    units: frame.units,
     registry,
     storage: frame.storage,
     origin: () => {
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
index 935d307fde008d00fb2ce15be71be119560f9253..7e49f56878ed39433c157563c203d6fdba36aaea 100644
--- a/src/web/client/what-is-on.test.ts
+++ b/src/web/client/what-is-on.test.ts
@@ -237,7 +237,7 @@ describe('the list of what is on (plan 8M-7)', () => {
     const words = (key: string) => {
       const line = lines.find((one) => one.key === key);
       if (!line) throw new Error(key);
-      return lineWords(line, CENTER, NOW, ZONE);
+      return lineWords(line, CENTER, NOW, ZONE, 'imperial');
     };
     expect(words('raid:r1')).toEqual({
       // The post's own heading words (fix round 1).
@@ -268,6 +268,10 @@ describe('the list of what is on (plan 8M-7)', () => {
       time: 'starts Wed, Oct 14, 4:00 PM',
       going: '7 going',
     });
+    // In the units the settings name (task 7): one wording with Discord.
+    const r1 = lines.find((one) => one.key === 'raid:r1');
+    if (!r1) throw new Error('no line');
+    expect(lineWords(r1, CENTER, NOW, ZONE, 'metric').distance).toBe('440 m');
     // A meetup without a place keeps its line, without a distance.
     expect(words('meetup:m2')).toMatchObject({ place: null, distance: null });
   });
diff --git a/src/web/client/what-is-on.ts b/src/web/client/what-is-on.ts
index fb33384e1d8018fb248ba13846dc213d06b5716f..be01652a3761bfb5d757851597ee2125d88892a0 100644
--- a/src/web/client/what-is-on.ts
+++ b/src/web/client/what-is-on.ts
@@ -1,7 +1,7 @@
 import { stageAt } from '../../domain/party/raid-stage.js';
 import { clockTime } from '../../domain/web/clock.js';
 import type { PartiesView } from '../../domain/web/party-data.js';
-import { distanceWords, metersBetween } from './distance.js';
+import { distanceWords, metersBetween, type DistanceUnits } from './distance.js';
 import { stopLine, trainPlaces } from './parties.js';
 import type { MapGym } from './popup.js';
 import { badgeWords, isDimmed } from './raid-marker.js';
@@ -164,12 +164,16 @@ export interface LineWords {
   dimmed: boolean;
 }
 
-/** A line's words, its distance from `origin` (your location, else the map's middle). */
+/**
+ * A line's words, its distance from `origin` (your location, else the map's middle) in the
+ * settings' units (`settings.distanceUnits`, the page's `data-distance-units`; task 7).
+ */
 export function lineWords(
   line: ListLine,
   origin: LatLon | undefined,
   now: number,
   zone: string,
+  units: DistanceUnits,
 ): LineWords {
   const { stage, hatch = null, end = null, start = null } = line.times;
   let time: string;
@@ -191,7 +195,7 @@ export function lineWords(
   return {
     name: line.name,
     place: line.place,
-    distance: line.point && origin ? distanceWords(metersBetween(origin, line.point)) : null,
+    distance: line.point && origin ? distanceWords(metersBetween(origin, line.point), units) : null,
     time,
     going: line.going > 0 ? `${line.going} going` : '',
     dimmed,
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index e9234817e212b031be6133a9fb39da8b87bdef44..91931c49774f2c1a57c3b0cf7cc05e582996edfb 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -57,6 +57,7 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
           tiles,
           googleKey: tiles === 'google' ? deps.googleKey : undefined,
           login: deps.oauth ? 'discord' : 'links',
+          distanceUnits: deps.distanceUnits,
         },
         manifest,
       ),
diff --git a/src/web/page.test.ts b/src/web/page.test.ts
index fe60001449e119bbe30324c7a1bcc05eab62e629..833335fb55e8ebb7854bad3d16e8d868b0050884 100644
--- a/src/web/page.test.ts
+++ b/src/web/page.test.ts
@@ -74,6 +74,7 @@ describe('the map page', () => {
       'data-guild': FAKE_GUILD_ID,
       'data-tiles': 'osm',
       'data-login': 'discord',
+      'data-distance-units': 'imperial',
     });
     // The row of the layers (plan 8M-7), which the script fills.
     expect(page.body).toContain('<nav id="layers" aria-label="Layers"></nav>');
@@ -118,6 +119,7 @@ describe('the map page', () => {
       'data-guild': FAKE_GUILD_ID,
       'data-tiles': 'stadia',
       'data-login': 'discord',
+      'data-distance-units': 'imperial',
     });
     expect(without.headers['content-security-policy']).not.toContain('googleapis');
     expect(without.headers['content-security-policy']).toContain('https://tiles.stadiamaps.com');
@@ -136,6 +138,12 @@ describe('the map page', () => {
     expect(osm.headers['content-security-policy']).not.toContain('stadiamaps');
   });
 
+  it('tells the page the units of distances the settings name (task 7)', async () => {
+    web = webServerWith({ assets: builtAssets(), distanceUnits: 'metric' });
+    const page = await web.app.inject({ url: MAP });
+    expect(bodyData(page.body)['data-distance-units']).toBe('metric');
+  });
+
   it('offers no login with Discord without the client secret', async () => {
     web = webServerWith({ assets: builtAssets(), oauth: undefined });
     const page = await web.app.inject({ url: MAP });
diff --git a/src/web/page.ts b/src/web/page.ts
index b22ea735aec95412417f9109a551c75c294837a2..247c1589d094df5e51ddac21939a25efaec30068 100644
--- a/src/web/page.ts
+++ b/src/web/page.ts
@@ -1,6 +1,7 @@
 import { readFile } from 'node:fs/promises';
 import path from 'node:path';
 import { COLOR_SCHEME_META, escapeHtml } from './answers.js';
+import type { DistanceUnits } from '../render/distance-words.js';
 import type { TileSetting } from './headers.js';
 
 /** Where `npm run web:build` leaves the bundle, from the bot's working folder. */
@@ -76,6 +77,8 @@ export interface MapPageData {
   googleKey?: string;
   /** How a member logs in: with Discord, or only through the links of `/maps`. */
   login: 'discord' | 'links';
+  /** The units the map says distances in (`settings.distanceUnits`, task 7); the map's alone. */
+  distanceUnits?: DistanceUnits;
 }
 
 /** The `data-` attributes of a page's `<body>`, escaped. */
@@ -87,6 +90,7 @@ function bodyAttributes(data: MapPageData, more: readonly string[] = []): string
       ? [`data-google-key="${escapeHtml(data.googleKey)}"`]
       : []),
     `data-login="${data.login}"`,
+    ...(data.distanceUnits === undefined ? [] : [`data-distance-units="${data.distanceUnits}"`]),
     ...more,
   ].join(' ');
 }
diff --git a/src/web/server.ts b/src/web/server.ts
index d92d044f9ba0aefbed2110206e4636cbc7077c88..350417fd9127c97e7ba96331bacb58d15ec6f111 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -28,6 +28,7 @@ import type { SpawnWebDeps } from './spawn-routes.js';
 import type { StopWebDeps } from './stop-routes.js';
 import type { TrainWebDeps } from './train-routes.js';
 import { toolFileRoutes, toolPageRoutes, type ToolWebDeps } from './tool-routes.js';
+import type { DistanceUnits } from '../render/distance-words.js';
 
 /** `settings.web` once it is set. */
 export type WebSettings = NonNullable<Settings['web']>;
@@ -39,6 +40,8 @@ export interface WebDeps {
   pictureOrigins: readonly string[];
   /** `GOOGLE_MAPS_BROWSER_KEY`: Google's tiles are offered only with it and `tiles: 'google'`. */
   googleKey: string | undefined;
+  /** The units distances are said in (`settings.distanceUnits`, task 7): the map's list. */
+  distanceUnits: DistanceUnits;
   /** The servers the bot is in (the client's cache): any other is not found. */
   servers: { has(guildId: string): boolean };
   /** Whether somebody is a member of a server: asked per request, never kept in a session. */
diff --git a/test/fixtures/settings.json b/test/fixtures/settings.json
index 278a31a6a2510248973e0c8dfab45d00309d1e9a..a7cebffae0ab25541c84f059b8cdb573d0087cec 100644
--- a/test/fixtures/settings.json
+++ b/test/fixtures/settings.json
@@ -83,6 +83,7 @@
     "sponsored"
   ],
   "timezone": "America/New_York",
+  "distanceUnits": "metric",
   "archiveRetentionDays": null,
   "ocr": {
     "passive": false,
diff --git a/test/support/web.ts b/test/support/web.ts
index 81397cfa60b631a8946dbece86ec855477876500..791d6da87037cab6118fd913c9f7f896f910b174 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -1,6 +1,7 @@
 import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
 import type { OutgoingHttpHeaders } from 'node:http';
 import { tmpdir } from 'node:os';
+import type { DistanceUnits } from '../../src/render/distance-words.js';
 import path from 'node:path';
 import type { FastifyInstance } from 'fastify';
 import type { Logger } from 'pino';
@@ -496,6 +497,8 @@ export interface WebTestOptions {
   /** Discord's side of a login (a `FakeOAuth` by default); undefined: no client secret. */
   oauth?: OAuthGateway | undefined;
   googleKey?: string;
+  /** `settings.distanceUnits`; imperial by default, as the settings' own. */
+  distanceUnits?: DistanceUnits;
   /** Where the map's view is built from (`geoSourcesWith`); nothing by default. */
   geo?: { sources: GeoSources };
   /** The built bundle (`builtAssets`); by default none was built. */
@@ -684,6 +687,7 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
     settings,
     pictureOrigins: ['https://cdn.leekduck.com'],
     googleKey: options.googleKey,
+    distanceUnits: options.distanceUnits ?? 'imperial',
     servers: options.servers ?? { has: (guildId) => guildId === FAKE_GUILD_ID },
     members: options.members ?? new FakeMemberDirectory(),
     sessions: sessionService,
````

## After the last task

- [ ] `npm run check > var/8m7-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `npm run test:db` (0), one at a time.
- [ ] `git diff 4a57096e5225d12a00b87ce57a582be266329860 HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
