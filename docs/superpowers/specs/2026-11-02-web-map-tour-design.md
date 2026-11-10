# The map's walk-through (plan 8M-17)

Matt, 2026-11-02: "the first time someone visits the map, it gets a walk-through of features, turning layers on / off, how to report something, browse existing reports, etc. And of course make it skippable." Rulings: everything but the thing talked about is dimmed, and the thing is pointed at exactly; the Report step points and explains, no practice report (real forms post to Discord and ping people, and a practice one would fake every form's route).

## What it is

A tour over the real page, in `src/web/client/` only: no route, no migration. Each step dims the page but for one real control (a hole in the dimming, ringed in `--primary`), with a card beside it: a heading, a sentence or two, "2 of 6", Back, Next (Done on the last) and Skip tour.

## Steps

Each step names its targets, the first one visible being used (`getClientRects` non-empty), so that one list serves every width. A step with targets none of which is visible is left out when moving and from the count; this is also how a Report no longer offered drops out.

Member who may report (`me.member && !me.readOnly`):

1. **Welcome.** No hole. What the map is.
2. **Layers.** `#layers .chips` with `#layers .more`, else `.layers-button`. These turn things on and off; try one. More (or the sheet) holds gyms, PokéStops, Power Spots and the outlines; stops and spots show from street level. **The hole lets presses through on this step alone**: the choice is the member's real one, kept as ever. Dimming stays below `.sheet-wrap` (z-index 2000), so the phone's sheet opens over the tour and Done returns to it. An open More grows the hole to hold its menu (`toggle` of the `<details>`).
3. **Reading the map.** The hole on the first `.raid-marker` wholly within `#map`'s box, if any; else no hole. The card always carries a sample marker, the real `raidMarkerNode` of an egg (`/eggs/raid_egg_2_icon.png`, ring of the tier group `5`, a made-up badge and count) saying: the picture is the boss or egg, the ring its tier, under it the time, the green number who is going; rings and lines are meetups and trains; tap for its post and to join. Not pressable.
4. **Browse what is on.** `#parties`, else `#list-button`. Every live thing of the server, by Nearest, Soonest or Most going; a tap flies the map there.
5. **Find.** `#filter`, else `#search-button`. Reports, parties and places by name.
6. **Report.** `#report-button`, else `.report-control`. Press it, say what (raid, max battle, field research, Team GO Rocket, wild spawn, train, meetup), tap where, fill in the form. It posts on Discord as `/raid` does. Not pressable.
7. **Back later.** `#account .account-menu`. "Map tour" is here.

Visitor, or logged in without counting as a member: Welcome (public-map words); Layers (only Gyms and Region outlines: says to turn on Gyms under More); Find (`#filter`/`#search-button`, "Find a gym"); **Log in** (`#account`: logged out, logging in shows raids, trains, meetups and reporting; logged in, the header's own line says what is lacking), which also says where "Map tour" is.

Words differ where the width does ("the sheet", "More"); a target may carry its own text. Press-neutral words ("press", "tap" for the map) throughout. American spelling, no distance units.

## Wording (Matt, 2026-11-02)

Every line very clear and concise. The reader knows Pokémon GO: never explain what a raid, field research, a max battle or the like is. The tour explains this page's controls and how to read its drawings, nothing of the game. The one exception is a raid train, which the game does not have: a very brief line says what it is (a group doing raids gym after gym along a route). Meetups get a line of what they are for: trades, lure parties, playing as a group. A step is a short heading and one or two short sentences.

## When it opens

- **First visit is per browser, one for every server,** like the layers: `localStorage` `pine-map-tour`, `visitor` or `member`, try/catch. Due for a member unless it says `member`; due for anyone else unless it says anything. So a visitor who later logs in as a member gets the member tour once.
- **Marked seen when it opens**, not when it ends: a reload mid-tour does not nag, and the menu brings it back. Written then read back; a browser that cannot keep it does not get it automatically (no tour at every load).
- **Opens by itself only** once the page is settled: for a visitor when `loaded` resolves; for a member at the first `afterDraw` of the parties (Report and the list exist only then), no timer. A list that never draws means no tour on this visit, and it stays due.
- **Not by itself:** while read-only (Discord away: transient, stays due), with the region editor on or asked by address, when the map failed to load, or while a form holds.
- **By hand:** "Map tour" in the account's menu and in the visitor's ⋮ (`showAccount` gets items for both; the ⋮'s name becomes "Menu"); hidden while editing regions. Pressed while a form holds it says "Close the form that is open first." as Report does.
- **Before the first step** (either way): popups and the phone card closed, the phone's list and search closed (`showList(false)`, `showSearch(false)`), so that the controls are there.

## Behavior

- Skip tour, Esc, and Done end it; it leaves everything as it was but the layers the member changed. Focus returns to what had it (menu's summary when by hand; else nothing in particular).
- **Dimming:** four rectangles round the hole (`--tour-scrim`), which also block presses; a ring element over the hole takes presses unless the step lets them through. Placed with `element.style` from the script (CSP: no inline style in HTML; Leaflet does the same). Remeasured at each step, on `resize`, and on More's `toggle`. A target gone mid-step: the hole closes, the card centered.
- **Card:** beside the hole on the side with most room, kept 16 px inside the screen; on a phone (< 768) a bottom sheet, or at the top when the hole is in the bottom half. Never covers the hole unless there is no room at all. `aria-live` not needed: a dialog, `role="dialog"`, `aria-modal`, named by its heading, focus moved to Next at each step.
- **Keyboard:** `SheetFocus`'s Tab handling, over the card's buttons and on the Layers step the target's controls; a capturing `keydown` so that Esc ends the tour alone and not Report or a popup. While the phone's sheet is open the tour takes no keys (the sheet is modal on top).
- `prefers-reduced-motion`: no moving hole; otherwise a short transition.
- Live updates go on drawing beneath it; nothing polls or stops for it.

## Rulings after the design's review (controller, 2026-11-02; these win over the above)

- **What opens it by itself:** a new frame hook fired only for a real list (`next !== noParties`), run after the draw has returned; not `afterDraw`, which also fires for draws without a list. Read-only is the list's `readOnly`, not only `/api/me`'s.
- **A quiet page only:** by itself only with no sheet or Report menu showing, no popup or card, the phone's list closed, `#filter` empty and unfocused, no `<details>` open, no notice showing, and the region editor off (not merely not shown: `off`, and the first list held during editing does not open it). Otherwise it stays due until the next visit. No timer.
- **By hand:** waits for `loaded`; if the map failed to load the press says so instead; a running tour blocks the automatic one, and a press restarts rather than doubles.
- **Audience:** the member's steps for `me.member || me.readOnly`, Report dropping out by visibility, Find's words by the box's actual state. A tour by hand while read-only writes nothing. `keepTourSeen` only moves up (`member` is never overwritten by `visitor`).
- **Visible** means a rect with width and height above 0. Report's phone target is `.report-control .report`. Steps say whether a target is required (left out when absent) or optional (no hole when absent: Welcome, reading the map).
- **Layers hole:** the chips and More, or while More is open More and its menu alone, so that no map is uncovered. The tour closes More as it ends.
- **Remeasuring** resolves the target and its words anew, on `resize`, a `ResizeObserver` on `#header` and `#content`, capturing `scroll`, the map's `move` and `zoomend`, and each real list; on the reading step the marker is chosen anew.
- **Leaving things as they were:** a tour by hand closes the popup, card, phone list and Find and does not bring them back (the browse step needs the sort showing). `showParties` exposes `closeOpen()` for that. "It leaves everything as it was" holds only of what the tour did not have to close.
- **The sample marker** is a `PageNode` of `.raid-marker`'s classes with fixed words and no `data-` times, so that the page's clock does not rewrite it; the real marker is looked for under `#map` only. Its words say the time and count show when zoomed in. The map is never moved for the tour.
- **Card:** a sheet on a phone only while the height allows, else beside the hole (`cardPlace`); `max-height` with its text scrolling, its buttons outside that.
- **Dialog:** no `aria-modal` on the Layers step; the Tab list is built anew from the visible controls; Esc is the tour's own, and it takes no keys while `.sheet-wrap` or `.report-wrap` shows.
- **Stacking:** dimming, ring and card at z-index 1500: over the map's controls, menus and the card (1100), under the sheets (2000).
- **Words:** the Log in step by `data-login` (no button on a server of links alone). More "and more", not a closed list.
- **As built, after the branch's review:** no separate phone sheet: `cardPlace` puts a width-limited card on the side with room, which on a phone is above or below the hole. Margin 12 px. The dimming is `--scrim`. The words for reading the map run past two sentences, since the page cannot show them by itself.
- **A guard:** a test reads the sources and holds every selector of the steps to what `page.ts`, `map.css` or the code that makes it names.

## The region editor's tour (Matt, 2026-11-02)

The same engine, four steps on the editor's real controls: draw and reshape (Geoman's toolbar), regions and problems (the panel), Save (the tools), the way back. Opens the first time the editor is shown in a browser (`pine-editor-tour`), "Editor tour" in the account's menu while the editor is on. The map's tour does not open on a visit that asked for the editor.

## Code

- `tour.ts`, pure, no DOM: the steps as data, `tourAudience(me)`, `tourDue(kept, audience, facts)`, `readTourSeen` / `keepTourSeen` over `KeyValueStorage`, `TourRun` (which step, next, back, count over what is available), `holeBlocks` and `cardPlace` (geometry). `tour.test.ts`.
- `tour-ui.ts`, the page's side, draws it; `main.ts` wires it; `map.css` styles, `theme.css` `--tour-scrim` in both sets. No new dependency.
- There is no DOM in the unit suite: logic stays in `tour.ts`; the page's side is checked in a real browser on a scratch server with stubbed `/api/*` (no Discord), desktop and phone, light and dark, member and visitor.
- `web.md` gets a section; staging checklist in `docs/superpowers/plans/`.
