# The small pass before the cutover (design, 2026-10-29)

The last findings and rulings before the cutover, in two plans on one branch (`small-pass`, worktree `../Professor-Pine-smallpass`), built one after the other:

- **8M-13, the web map:** the staging findings of 2026-10-29 (T1, A1, A2, I1, L1, L2, O1), S7 and S10 (Matt scheduled them before the cutover), and three checklist fixes.
- **8F-1, Discord:** Matt's rulings of 2026-10-29 that change code (8E-1, 8X-S's cut names, 8W-3's stop-only import, catch CP for max bosses), the admin guide's line, and `/help` broken into paragraphs (Matt, 2026-10-29).

Sources: follow-ups "From the staging run of the web fix pass" and "Matt's rulings of 2026-10-29"; the detail of the staging in `var/stage/results/web-fix-pass-2026-10-29.md`.

Nothing here changes a command's definition: no deploy. No migration.

## Plan 8M-13: the web map

### T1, a train's direction is easy to see

Matt: the arrowheads are very small; direction should be visible, perhaps by a subtle animation.

- The arrowheads grow from 16 px (`ARROW_PIXELS`, `src/web/client/train-line.ts`) to 24 px; `ARROW_MIN_PIXELS` stays 40 (already above 24).
- The legs ahead carry a slow flow in the direction of travel: one more polyline per train over the same points as the legs ahead, thinner, `interactive: false`, in the same `line` group (clicks still reach the line), whose dashes move by CSS animation, one cycle in about 2.5 s. Done legs stay still and faint. Route mode's train gets no flow.
- The main map draws with Leaflet's SVG renderer, so the flow is a class on the `<path>` (`className`). Its dash pattern and offset come from that class in `map.css` (`stroke-dasharray: var(--flow-dash)`), not Leaflet's `dashArray`, with values as tokens in `theme.css`; the keyframes move the offset by exactly one dash period, so the loop does not jump.
- The closing leg's own dashed line (`'8 8'`) takes the class itself rather than a second line, so it reads as a dashed line that moves.
- The flow runs only under `@media (prefers-reduced-motion: no-preference)`, as the shake does; with reduced motion the legs are drawn as today and the larger arrowheads carry the direction. Browsers stop it in a hidden tab; one flow path per train keeps the repainting small on a phone.

### A1, research answers without Discord's list marks

A research report of several stops shows in the notice band as lines that start with "- " (`researchWords`, shared with Discord). The web's `pageWords` (`src/web/page-words.ts`), which already turns Discord's markdown into the page's words, also drops a line-start list mark ("- " or "* ") and keeps each item on a line of its own. Only an unescaped mark is dropped, before `unplain`: a member's own "- " arrives escaped (`\- `, `plain()`'s `bulletedList`) and stays. `pageWords` serves only answers (the `*-routes.ts` callers), never posts. The notice band and the answer line keep line breaks (`white-space: pre-line`, where not set already). Discord keeps its list.

### A2, a refusal nudges the phone card

A refusal shakes a popup; the phone card does not move. The cause: `PhoneCard.refresh` replaces the card's body on every draw (`phone-card.ts`), so by the time the server answers, the button that asked and its scope are detached and `shake()`'s `closest('.leaflet-popup, .party-card')` (`press-answer.ts`) finds nothing. The popup survives because Leaflet keeps its element.

The fix: `PhoneCard` owns its motion, `card.nudge()` on the element it keeps: a small upward bounce (about 6 px up and back, `--nudge-distance`, one cycle of `--shake-time`). `answered` calls it when the card shows that party; the dialogs' refusals (`post-forms-ui.ts`) are routed the same way; the popup keeps its shake. Under reduced motion, neither. (At staging: Android's "Remove animations" reads as reduced motion.)

### I1, the invite on a phone

On a phone the not-a-member line and "Join the server on Discord" stack, both left-aligned, the button its own width (not full width), under the line. The desktop header is unchanged.

### L1, a visitor sees only the layers that hold something for them

Logged out (or logged in and not a member), the server gives the page only the gyms and the regions' outlines (`/api/geo`); every other layer is members-only. The layers list then offers only Gyms and Region outlines; Raids, Trains and Meetups become members-only like Research, Rocket, PokéStops and Power Spots (`MAP_LAYERS`, `layer-registry.ts`). The visitor's side pane keeps Campfire's line (plan 8V-1) whatever the layers offer: Campfire's meetups are public, and the line was tied to the Meetups layer only because it was offered (`main.ts`, `loggedOutPane(…, registry.isOffered('meetups', member))` becomes `true`). The members' list foot line is unaffected. A member's stored layer choice is not touched; a visitor's "Layers · n" on the phone counts fewer, as it should.

### L2, Gyms off hides a gym search's matches

With "Find a gym" (visitors, members without the map's role), turning the Gyms layer off hides the matches; turning it on shows the matches again while the text stands (`shownGyms`, `gym-dots.ts`). The rule: with text, the matches when the layer is on or the view is forced (route mode, a meetup's place, Add stops…), else none; without text, every gym when on or forced, else none.

### O1, misspellings no longer crowd Find's places

`rocket` lists Hockey Rinks and Pocket stops, `gible` 26 Bible places, because Find's places take Discord's misspelling rule (two wrong letters at six letters for gyms, one for stops and Power Spots). Matt, 2026-10-29, A: in Find, places found only by a misspelling (`placeFit` `guess`) are shown only when Find found nothing else for the text: no place by its words and no report or party. So `rocket` shows the Rocket reports and no Hockey Rinks, `gible` the raid and no Bible places, and `ansus hall` still finds Ansys Hall. Discord's lists are unchanged (their misspellings sit at the end of 25 choices). The rule lives in the page, where the report and party groups are known (they change at every poll): `FoundPlace` gains `guess: boolean` (`src/domain/web/find-data.ts`, set from `placeFit` in `find-routes.ts`), and the pure `foundGroups` (`client/find.ts`) drops guesses when any other group or any non-guess place has lines; "Places · n" counts what is shown. Guesses sort last within a kind, so the per-kind cap drops nothing else.

### S7, a train is picked at any stop ahead

Today a train is picked by its line or its ring at the current stop. Each stop ahead gets a small badge in the train's color with its number in the route (the current stop keeps the ring), set off to the side of the stop like a raid's time badge (Matt, 2026-10-29, A), so the gym's dot, a raid's marker there and the badge each keep their own click; a click or tap on the badge opens the train's popup, like the line. Done stops get no badge (also a loop's, though the closing leg leads back to them). A stop listed twice in the route gets a badge per listing, side by side. The badges show from zoom 15 up and are redrawn on `zoomend`, as the arrowheads are (below 15, the ring and the line as today), on the trains layer.

### S10, Light, Dark or Device

A choice of Light, Dark or Device (the default, as today) for the map and the region editor, kept in the browser (`localStorage`, key `pine-map-theme`, read and written through the page's `browserStorage` pattern, so a blocked storage leaves Device). Where (Matt, 2026-10-29, C, as YouTube does): the account menu (`showAccount`, `common.ts`) gains "Theme: Light · Dark · Device", the current one marked; a visitor, who has no account menu, gets a small ⋮ button in its place beside "Log in", holding only that choice. The same on a phone, in the editor's header too.

- The page sets `data-theme="light" | "dark"` on `<html>` for a forced choice and nothing for Device. Each dark block (`theme.css`'s tokens, `map.css`'s `.report-icon.mask` rule, `editor.css`'s Geoman invert) applies under `@media (prefers-color-scheme: dark)` to `:root:not([data-theme="light"])` and also to `:root[data-theme="dark"]` without the media query. One source per block: either the web build (`scripts/web/build.ts`) emits the `[data-theme="dark"]` copy from the media block, or hand copies with a test that both are equal; the builder's choice. Not `light-dark()`: `ThemeWatch` reads tokens through `getComputedStyle`, which would hand Leaflet the unresolved `light-dark(…)` text.
- `ThemeWatch.dark()` (`theme.ts`, used for the tiles) becomes "the choice, else the device", and tells the tiles and colors when either changes.
- The choice is applied before the page is drawn, by a tiny classic script in `<head>` (`<script src>`, as the CSP allows only `'self'` and a hash), so the page does not flash the device's scheme first.
- The server's own pages (answers, the login link's Continue) keep the device's scheme.
- The tests that read the dark blocks (`page-theme.test.ts`'s `@media … { :root {` pattern, `report-icons.test.ts`'s parse of `map.css`) follow the new shape.

### Checklist fixes

- `2026-10-28-phase-8m11a-staging.md` step 5: Done is off on an egg on the map, so no refusal is pressed; the step checks the button is off.
- `2026-10-28-phase-8m11c-staging.md` step 25: Fix all asks only about a stretch with a place in it; make the stretch hold a gym or stop to see the box.
- Same checklist, step 27: Chrome's devtools call it "Request conditions" and take a URLPattern, the full address of `/api/geo`, which is read only at page load (reload after blocking).

## Plan 8F-1: Discord

### 8E-1, no timeless Elite egg

A timeless Elite egg stands its whole incubation (about a day) and blocks every other report at its gym. `/raid` refuses one already; two paths still make one.

- **Screenshots** (mentions, passive reading, `/raid screenshot:`, also after a gym pick): `decide` (`screenshot-decision.ts`) refuses when the result is an Elite egg without a time (`tier.level === 'Elite' && !hatched && time === undefined`, checked after the "past" branch). An Elite egg's countdown is never dropped as too long, so this happens when the stage was not read, also when an Elite egg is typed over such a read (`withTyped` sets the stage, not the lost time). New reason `elite-egg-time`: "I could not read when this Elite egg hatches: report it with `/raid` and its hatch time." A typed time counts as today; passive reading stays silent on a refusal, as today.
- **A tier change** (`/boss`, the map's Change…, through `RaidChangeService.setBoss`): refused when the result would be an Elite egg (no boss) without a hatch time, whatever it was before. A new `RaidChangeOutcome` reason; its words (Matt, 2026-10-29, A): "An Elite egg needs its hatch time: once staff delete this egg, report it again with `/raid` and its hatch time." (`/hatch` judges a time by the egg's current tier, so it cannot set an Elite hatch hours ahead on a T5 egg; `/hatch` stays as it is.) `moveBossTier` moves only raids with a boss (`isMovedBoss(null)` is false), so it cannot make an Elite egg: no change, a test pins it.

### 8X-S, a cut Power Spot name that fits spots in other regions

`matchPowerSpot` (`power-spot-match.ts`): when a cut name (the "starts with" path) fits a spot of the channel's region and also spots of other regions, the result is `candidates`, not the local spot: the member gets the existing pick list (local spots first, other regions' with their region's name). A whole name equal to a spot's title stays as today (an equal title wins, also over a local cut name; review A4), and a cut name that fits only local spots too. Passive reading cannot ask, so such a screenshot read passively now reports nothing (`told(MAX_SPOT_UNTOLD)`; in the board `MAX_UNSURE_IN_BOARD`): Matt, 2026-10-29, A: a missed report is safer than a wrong spot; a mention or `/max screenshot:` asks.

### 8W-3, no #bot-updates post for an import that changed no gym

`summarize` and `gymListSummary` post only when a gym was added, renamed, moved or deleted (`anyGymChanges`; a promoted Wayspot is among the added). An import, or the review queue's gathered counts (`postGathered`), that changed only PokéStops or Power Spots posts nothing; the stop-only heading ("The PokéStops and Power Spots changed") goes. A post that has gym changes still gives the stop counts. The import's own answer still gives every count; its sentences that promise the post (`src/commands/gyms/import.ts`, three places) say "when gyms changed".

### Catch CP in a max battle's post

Max battle catches are always level 20 and never weather boosted (checked 2026-10-29: a community analysis on r/TheSilphRoad and Pokémon GO Hub's charts; no source shows a boosted max catch). The max post's boss lines (`bossLines`, `src/render/max-post.ts`) gain `**Catch CP** min–max`, IVs 10/10/10 to 15/15/15 at level 20, after the weakness lines, without weather icons. One function: `maxCatchCp` beside `raidCatchCp` in `src/domain/pogo/cp.ts` (sharing `RAID_FLOOR`, `PERFECT`, `RAID_CATCH_LEVEL`), reached through the catalogue via `caught(entry)` as `raidCatchCp` is. Dynamax and Gigantamax are key sets over ordinary entries, so the entry carries the species' or form's own stats; a boss without an entry shows no boss lines, as now. The post's limits (`fittedLayout`) still hold. No moves (Matt: random from the pool).

### The admin guide's line (2E-2)

`docs/guides/new-instance.md`, "7. Forums", and `docs/guides/migrating-a-legacy-instance.md`, "6. After the move", gain: to keep a member out of a region's forum for good, give them a permission overwrite on that forum (or deny the view to a role they hold); taking away the region's role is not enough. A member overwrite takes the forum out of sync with its category; "Sync permissions" removes Pine's own overwrites, which the hourly sweep puts back where they are still needed.

### `/help` in paragraphs

Every command's `help.details` (71 files under `src/commands/`) is broken into short paragraphs: one idea each, at most three sentences, separated by a blank line (`/help` keeps them: its text is one text display). The words stay as they are, but for what a split needs (a "Or …" sentence that joined two parts starts a paragraph of its own; `DETAILS + SCREENSHOT_DETAILS` and `alsoAs`'s note join with a blank line), and for the few single sentences over the limit (`/region import`, `/rocket report`, `/admin setup-forums`, `/counters`' colon-joined run), cut into two sentences; the plan lists them before and after. A unit test over every command and subcommand (`forConfig` with screenshots on and off, `details` as a function with the test settings, `GroupedCommand.subcommands`) refuses a paragraph over 320 characters. (Measured: 140 texts, none with a paragraph break yet, 65 longer than 320, the longest about 1,750.) Examples of the split, for Matt to judge in the plan:

> Creates a post for the raid in the raid forum of the gym's region. Pick the boss (or the tier, for an egg) and the gym from the lists that appear while you type.
>
> The time is optional, except for an Elite egg, which needs its hatch time: minutes from now (`20`) or a clock time (`6:15pm`). For an egg it is when the egg hatches, for a boss when the raid ends.
>
> If the gym already has a raid, you are shown its post instead.
>
> Or attach a screenshot of the raid instead: I read the gym, the time, the tier and the boss from it, and ask only when I am not sure which gym it is. What you type beside it counts instead of what I read.
>
> The screenshot is kept for a while: others can see it from the post of the raid, and it may be used to improve the reader. A screenshot of a max battle goes to `/max`.

## Outside the plans

- **8W-P (ruling 40):** before the Wayspot export tool's first push, its docs and plans (`../Professor-Pine-Wayspot-Export/docs/plans/`, 12 files) lose the local paths (six "Where it runs" lines) and Matt's name in rulings ("Matt" → "the owner"), at the tip only; the history stays as it is, under googer@pobox.com. A commit in that repository, no push.
- **The staging after this pass:** 8V-1's checklist, then this pass's (the web items by eye on the desktop and Matt's phone; on Discord the timeless Elite egg both ways, the cut name's pick list, a stop-only import, a max battle's catch CP, `/help`).
