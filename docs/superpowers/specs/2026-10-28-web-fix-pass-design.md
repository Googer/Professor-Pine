# The web map's fix pass (8M-11): design

Status: draft for Matt, 2026-10-28.

## Why

The web polish (8M-7 to 8M-10, 8E, nearby stops first) was staged on 2026-10-28 with two accounts, on a desktop and on Matt's phone. Almost every step passed. The run found 32 points (follow-ups, "From the staging run of the web polish"; detail in the git-ignored `var/stage/results/web-polish-2026-10-28.md`):

- one Important finding;
- small fixes;
- wording;
- three ideas Matt wants now: train direction, the drag line, and the editor's layers;
- icons.

This pass closes them before the design of Find (S23). Matt on the live updating: it "works better than I was imagining"; only the lag after your own press is wrong.

## Goals

- A press on the map shows its own result at once (S1).
- What the map answers is seen where the member is looking (S9, S20, S21), and the notice band no longer stays forever (observation).
- The small fixes and words: S2 to S6, S11, S16 to S19, S22, S25, S26, S28, and the observations on Power Spots and the start log.
- A train's line says where it goes and where it has been, and a loop looks like one (S27). Dragging a stop shows where it will land (S24).
- The gyms' clusters are fewer and smooth (S13).
- The region editor:
  - is for a computer with a mouse (S29);
  - gets clustered layers (S30);
  - says what is unsaved (S31);
  - deletes a shared corner everywhere (S32).
- The Report menu's icons, as Matt chose them on 2026-10-28 (S14): the game's where it has one, Pine's own train otherwise.

## Non-goals

- Find (S23): its own design, next.
- S7 (a train selectable at every stop ahead), S10 (a theme choice), S12 (where max battles are listed): ideas, not in this pass.
- No chat on the web, and no new Discord behavior except where one shared path changes a sentence on both (S21's Meet…).
- The third-account steps stay unrun (Matt has no third account).

## Plans

This is my call; Matt may merge or split them. Three plans, on one branch `web-fix-pass`, each prototyped and reviewed as usual:

- **8M-11A, answers and small fixes:** S1, S9/S20/S21, the notice band, S2 to S6, S11, S16 to S19, S22, S26, S28, the two observations, and the icons (S14).
- **8M-11B, trains and clusters on the map:** S27, S24, S25, S13, and the invite for a visitor who is not a member (Matt, 2026-10-28).
- **8M-11C, the region editor:** S29 to S32.

## 8M-11A: answers and small fixes

### S1: a press waits for its post (Important)

**Today:**

- A press (`POST /api/parties/:party/:action`, `src/web/party-routes.ts`) changes the party and answers `{ ok, text }` at once.
- The change asks `PartyService`'s coalescer to redraw the post:
  - on a quiet party the redraw starts at once, inside the change;
  - in a burst it waits out the 2 s delay.
- The redraw edits Discord. Only then is the layout kept (`keepLayout`) that `layoutOf` serves to the map.
- The page's `poller.now()` right after the press therefore usually still gets the old `postKey`. The press shows on the map only at the next poll, up to 20 s later.

**Design:**

- **A draw ticket.** `PartyService` counts the draws of each party's post it has started.
  - `drawTicket(partyId): number` returns the count. A route takes it **before** it changes the party.
  - `shown(partyId, ticket, maxMs): Promise<void>` resolves when a draw started after that ticket has kept its layout, or after `maxMs`, whichever comes first.
  - A draw that the change started synchronously counts, and so does one still waiting out its delay; `Coalescer.idle` covers neither.
- **`shown` resolves at once when:**
  - the post is not drawn anymore (the party ended, or `forgetPost` ran);
  - the post is still being made;
  - no draw is pending or running for the party.
- A route that knows nothing was written (a refusal, or `written` false) does not wait.
- **The routes that wait:**
  - the press route;
  - every web route that changes a party: Group…, Meet…, the completion answer, Move…, Manage…, Split… (for the original train's post; the new train's post is new, and the list fetches it), the route editor's saves, the raid's Change… (`/api/raids/:party/:change`), the meetup's changes (`/api/meetups/:party/:change`) and the conductor (`/api/trains/:party/conductor/:action`).
- The cap is `PRESS_SHOWN_MS`, 5 seconds (my call: an edit's round trip, plus the 2 s delay in a burst, with room on a loaded host).
- The page is unchanged: it already awaits the press and then polls at once. Its buttons stay disabled while the press waits, as now.
- When the cap passes (Discord slow or rate-limited), the answer goes out anyway, and the next poll catches up as today.
- One render path stays: the map still shows only what Discord shows (`layoutOf`'s rule).

### S9, S20, S21: answers where the member is looking

**Today:**

- A press's answer goes only to the notice band at the top of the page (`say`). On a phone that is behind the docked card, and on a desktop it is far from the popup.
- "Start a new group on Discord →" and a refused button's reason are a line under the buttons. The phone card's summary hides that line (`.party-card.summary .post .on-discord { display: none }`).

**Design:**

- **An answer line in the popup and the card.** Every press writes its answer into a line of the post's own controls (`.press-answer`, `role="status"`), under the buttons that were pressed, in the popup and in the phone card, also in its summary.
  - The line survives the redraw that follows the press. The page keeps the answer by party and puts it back after the redraw, for 10 seconds (as `panelsOpen` keeps open panels).
  - The notice band then only carries what has no party: the report forms' answers, the editor.
- **A refusal shakes.** When the answer is a refusal (`ok: false`), the popup or the card shakes once (a 300 ms horizontal shake), unless the member's device asks for reduced motion (`prefers-reduced-motion`).
- **"Start a new group on Discord" is a note with a button.** When Group… can only start a new group:
  - the form's place shows a note box: "A new group is started on Discord.";
  - the note has a button "Open the post on Discord" (the post's link), and the box replaces the form.
  - The same note box is used for every button whose answer is "do this on Discord".
- **The completion question in an open card** (S21): it is drawn above the buttons, in the answer line's style, not at the card's end. With the card in its summary, the summary shows it (as now) and the card's header gets a dot, so a question is not missed.
- **Meet… after the group changed:**
  - Meet…'s form closes as Group…'s does (`refusalCloses`), with the answer in the answer line.
  - The shared sentence `meetSubmitRefusal` (`src/commands/parties/meet-dialog.ts`) becomes "Group B has changed since: press Meet… again.", the same shape as Group…'s.
  - Discord's dialog says it too: one path, and a dialog on Discord is closed after Submit anyway.

### The notice band

- An answer in the band goes away by itself after 10 seconds (a new answer starts the time again).
- A × on the band hides it at once.
- The band overlays the top of the map instead of pushing the map's controls down.

### Small fixes

- **S2:** the rings' pane goes below Leaflet's markers (`RING_PANE_Z` 590, above the overlay pane's 400). A raid's time badge then draws over a meetup's or a train's ring; the ring keeps taking clicks on its line.
- **S3:** on a coarse pointer, the popup's × is 44 px square, and the popup's content keeps clear of it.
- **S4:** several things at one place are headed with the place's name (the gym's, Power Spot's or stop's); "Here" only when the place has none.
- **S5:** the marker's badge and the list say "Hatched", "Egg" and "Ended", capitalized. The stage values in data stay lowercase.
- **S6, S19, S28: one wording of times on the map.** A new pure module `src/render/duration-words.ts` has two functions, one per kind of time. The change is on the web only; Discord's own sentences are unchanged.
  - **Mirrors of Discord's stamps** (`relativeStamp`): where a post drawn on the map shows a `<t:…:R>` stamp (`post-time.ts`'s `relative`; `page-words.ts` through `relativeTime`), the map words it as Discord's client does:
    - Discord's thresholds: a minute from 45 s, an hour from 45 min, a day from 22 h;
    - the reader's locale, through `Intl.RelativeTimeFormat`;
    - so "in a day", not "in 24 hours" (S6), and "in 29 minutes" exactly where Discord says it.
  - **Durations and countdowns Pine composes** (`durationWords`): time left on a marker's badge, in the list and in the stop popups (`badgeWords`, `countdown`):
    - exact hours and minutes, "17 min" and "1 h 05 min";
    - minutes rounded as Discord rounds them (to the nearest, not up), so the list's "29 min left" and the post's "in 29 minutes" agree (S19).
  - Minutes are never "m": "m" is meters (`distanceWords`) (S28).
  - A guard test, as `src/text-distances.test.ts` does for distances, refuses hand-worded minutes in the web client.
  - The badge on the marker may use a compact form ("30 min" fits; "1 h 05" if space needs it): my call, checked in the prototype.
- **S11:** a focused line of the list whose party ends gives its focus to the sort, not to the page.
  - The cause is not the one in the follow-ups. `keepTools` detaches the list section before `render()` runs, so the focus is lost first.
  - The redraw reads the focused element before it moves anything, and does not detach the list section when it is already in place. A DOM test runs through the redraw itself.
- **S16:** Escape closes every report and change form on the map as Cancel does: raid report and Change…, max, spawn, research, Rocket, meetup, train. One shared helper, as `post-forms-ui.ts` has. Escape closes the form, not the popup under it.
- **S17:** the notice band and the answer line keep line breaks (`white-space: pre-line`). Research answers then read as lines, not " - ".
- **S18:** Add stops… and Same task at more stops… leave out stops that already hold that task in this period, by the rule Discord's `moreStops` uses.
  - That rule moves into a pure domain function both call (one path). For "one of" it matches by the task.
  - The map applies it to the research list it already has.
- **S22:** "What's on" becomes "What's going on" (the list's heading, the logged-out pane, the list's `aria-label`).
- **S26:** in every research form, a picked task stays changeable before Submit.
  - Where the picked task is shown alone (the contradiction question, a task picked from the stop's popup), a "Change task" button brings the list back with the task kept as the selection.
- **Observation, Power Spots:** Report → Max battle lists the five nearest Power Spots, not those that happen to be in view. `/api/powerspots` gets `near=<lat,lon>&count=5`, served by the nearest-stops search Discord uses (`src/domain/search/nearest.ts`). Stops for research and Rocket the same way.
- **Observation, the start log:** "meetup safety is off" is one log line at start, not one per server (the setting is the instance's).

### S14: the icons (Matt, 2026-10-28)

Mockup: git-ignored `var/mockups/train-icons/index.html` (serve the folder with `python -m http.server 8790 --bind 127.0.0.1`).

| Kind | Icon | How |
|---|---|---|
| Raid | the game's raid head (as now) | in dark, no outline (below) |
| Max battle | the game's Dynamax map icon (Pokémon GO wiki, `File:Mp-Icon Dynamax.png`) | a mask tinted `--tier-dynamax`; the file kept in Pine (below) |
| Field research | the game's quest symbol (as now) | |
| Team GO Rocket | the game's R (as now) | |
| Wild spawn | Campfire's one-color Poké Ball (pogo_assets `Images/Campfire/Menu Icons/pokeball.53b7f974309c231f1fe98c2a66de6e91.svg`) | a mask: Poké Ball red (#d32f2f) in light, white in dark (Matt) |
| Train | Pine's own, C3b (below) | a shape in `--train` |
| Meetup | the game's calendar with six dots (pogo_assets `Images/Menu Icons/calendar_icon.png`, Campfire's meetup icon; `pinemeet` is its plus version) | a mask tinted `--meetup` |

- **The train, C3b:**
  - a low, solid two-car high-speed train facing right, its windows cut out, over a line of three stations;
  - Matt: trains face left to right, and the lead car's back top corner is only subtly rounded.
  - Its 48-unit drawing, as `REPORT_ICONS.train` (`fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"` on the `svg`):

    ```svg
    <g transform="translate(0 -4)">
    <path fill-rule="evenodd" fill="currentColor" stroke="none" d="M1 19h8a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H1zM3.5 24h5.5v4H3.5z"/>
    <path d="M12.5 28h3" stroke-width="3"/>
    <path fill-rule="evenodd" fill="currentColor" stroke="none" d="M15 33V20.5a1.5 1.5 0 0 1 1.5-1.5H30c8 0 13.5 4 16.2 8.6a3.8 3.8 0 0 1-3.4 5.4zM19.5 24h8v4h-8zM32.5 22.6c3.5.8 6.6 2.4 8.4 4.4h-8.4z"/>
    <path d="M3 40h42" stroke-width="2.5"/>
    <circle cx="10" cy="40" r="3.2" fill="currentColor" stroke="none"/>
    <circle cx="24" cy="40" r="3.2" fill="currentColor" stroke="none"/>
    <circle cx="38" cy="40" r="3.2" fill="currentColor" stroke="none"/>
    </g>
    ```

  - `ReportIcon`'s `shape` kind takes a whole drawing (elements, its own viewBox) rather than paths alone, so the train keeps its strokes and holes.
- **The Dynamax icon is kept in Pine.** The wiki's file (a WebP, 512 px, white on clear) is converted to `pictures/icons/dynamax.png` (256 px). It is committed with this design. The web server serves it at `/icons/dynamax.png`, as it serves the eggs (`/eggs/`).
  - The page never loads from the wiki, and the Content Security Policy is unchanged (`'self'`).
  - pogo_assets lacks it; it is the game's file, as Pine's other game pictures are.
- **Dark theme, no outline on light pictures.** In dark, the outline `--icon-outline` (a light halo) is dropped for the masks, the train and the white pictures (the raid head). The halo blew them out (Matt).
- **Where they show:** the Report menu, the Report flow's step heading, and the icons' other places today (stop popups and list). The layer chips and the list stay text, as now.
- **The train as Discord emoji:** `pictures/emoji/pinetrain.png` (C3b in `--train`'s dark-theme orange #e67e22, 128 px) is added to `CONTROL_ICON_NAMES`, so `emoji:upload` offers it. It shows in front of a train's name in "Going on now" and the new-train DMs (Matt's answers, below). The upload needs his go-ahead, as always.

## 8M-11B: trains and clusters on the map

### S27: a train's line shows its way

The page gets the train's end mode: `MapTrain.atEnd: MapAtEnd` (`finish`, `loop`, `turn-back`; the effective `endMode`, so a route shorter than two stops is `finish`). A turn-back train's route is stored in its travel order (reversed when it turns), so the route's order is always the way it goes.

- **Done and ahead:** the legs before the train's stop are drawn faint (opacity 0.35), the rest as now. A finished train (`stop` null) is all faint.
- **Arrowheads:**
  - a small arrowhead in the train's color at the middle of each leg ahead, pointing along the travel order;
  - drawn as markers (`divIcon`, an SVG triangle rotated by the leg's bearing in pixels), recomputed on zoom;
  - legs shorter on screen than 40 px get none.
  - No library: Leaflet has no decorator, and none is added.
- **A loop:** a looping train gets its closing leg, from the last stop back to the first, dashed, with its arrowhead.
- **A turn-back train** at its last stop: the arrowheads follow the stored order, so after the turn they point back by themselves. While it is at the end, nothing more is drawn. (Changed by Matt's ruling BR-4, 2026-10-28: at its last stop the leg back is drawn ahead, with its arrowhead; follow-ups, "From Phase 8M-11B".)
- Route mode's dashed editing line is unchanged.

### S24: the drag shows where a stop will land

- While a stop is dragged in the route list, the map shows the dragged stop's two new legs: from the stop it will follow to it, and from it to the stop it will precede. They are dashed in the train's color, on a layer of their own.
  - At either end there is one leg.
- The drag's drop position (`StopDrag`'s `to`) gives the neighbors through a pure helper beside `dropPosition`.
- The highlight of the row under the finger stays in the list. On the map, the line replaces the highlight of a stop.

### S25: a held stop holds the map

- While a stop's handle is held, the map's touch zoom and dragging are off. They come back when the drag ends by any path (`endDrag`).
- They are switched back on only if they were on before.

### S13: fewer, smoother gym clusters

Matt suspected the work rather than the count; the code agrees:

- every `moveend`, every layer change and every party poll re-filters all gyms;
- each cluster's key names all its members, so any change removes and re-adds every cluster.

The design:

- **Profile first:** a Performance recording zoomed out over Pittsburgh's gyms, before and after, in the prototype's notes. The laptop's timings are upper bounds.
- **Clusters keyed by their cell:** a cluster's marker is kept while its cell has members, and its count and position change in place. A poll that changes no gym redraws nothing.
- **Fewer clusters zoomed out:** the cell grows as the map zooms out (60 px at 15, 90 px at 13 to 14, 120 px at 12 and below). The prototype tunes these numbers against the profile and Matt's eye.

### An invite for a visitor who is not a member (Matt, 2026-10-28)

Today somebody who follows a shared link to the map and logs in with Discord, but is not in the server, sees the public map and "You are not a member of this server.", with no way in.

- **The setting:** `settings.web.invites`, a map from a server's id (a snowflake) to an invite address the server's admin chose: `https://discord.gg/<code>` or `https://discord.com/invite/<code>` (a vanity address too). Anything else is refused when the settings load. Blank or absent: no invite for that server, and the page reads as today.
  - Matt chose a setting over Pine making the invite itself: the admin decides whether the server shares one and where newcomers land. Pine needs no new permission and calls Discord for nothing; a paused or deleted invite fails as it would anywhere.
- **Who sees it:** only somebody logged in whom `/api/me` answers as not in the server. A member without `settings.web.memberRole` keeps the role line and no invite; somebody logged out gets no invite (they may be a member who has not logged in).
- **The page:** under "You are not a member of this server.", a button "Join the server on Discord" opening the invite in a new tab (`rel="noopener"`). `/api/me` carries `invite` for that visitor only.
- After joining, a reload makes them a member within the directory's minute; no new login.
- Documented in `docs/web-setup.md` and the admin guides; `settings.example` (or the guide's sample) shows it.

## 8M-11C: the region editor

### S29: a computer with a mouse

- The editor is offered when the screen is at least 1024 px wide **and** the main pointer is a mouse or trackpad: `(min-width: 1024px) and (pointer: fine)`. A touch laptop with a trackpad qualifies; a large tablet does not.
- One function decides it, used by the menu, the address `?edit=regions` and the CSS that hides the menu item. The width constant and the media query stop being two copies.
- The refusal: "Edit regions on a computer with a mouse and a screen 1024 pixels wide or more."

### S30: layers in the editor

- The editor's layer control keeps its toggles (Gyms, Stops, Power Spots, Wayfarer gyms Pine did not take, other servers' regions, overlaps and gaps).
- Gyms, stops and Power Spots are clustered when zoomed out, by the live map's clusterer (`cluster.ts`, pure, bundled into the editor too), redrawn on `moveend`.
- The warning color of places outside every region (`recolour`) applies to the dots drawn. A cluster holding such a place shows the warning color on its ring.

### S31: what is unsaved (Matt agreed: no warning)

- The account menu's item reads "Edit regions · 3 unsaved" when the browser holds staged edits for this server.
  - The count is the regions those edits change, not the undo steps.
  - Staged edits are kept per server and member: the page learns the member's id from `/api/me`, which gets `userId`.
- In the editor, a line under the toolbar: "3 regions have unsaved changes. They wait here until you save or undo them."
- Back to the map leaves without asking, as now. The count in the menu is drawn again when the editor closes.

### S32: deleting a shared corner (Matt: yes)

With "Move shared corners together" on, deleting a corner that other regions of this server share deletes it in all of them, as one undo step (a batch, as a shared move is).

- **Refusal:** if any of those regions would be left with fewer than three corners, nothing is deleted. Geoman's removal is put back, and the editor says: "Not deleted: <region> would have fewer than three corners."
- Another server's outlines are never touched.
- With the option off, a delete changes only its own region, as now.
- The ring rule (closed or open, three distinct corners) is the one `normalisedOutline` uses. A pure `removedCorner(outline, at)` sits beside `movedCorner` in `src/domain/regions/shared-corners.ts`.

## Testing and staging

- Each plan's tests as the project's rules say: pure functions unit-tested, the page's behavior through its DOM tests, and the press wait (S1) by a test that awaits the post's draw, not time.
- A staging checklist per plan, with two accounts on a desktop and Matt's phone. 8M-11C's checklist also runs the 8M-10 steps left unrun that a single staff account can do: Geoman drags, Fix… on a gap, and a save.

## Left to the builder

- Exact sizes, colors and the shake's curve, within the theme's named values (`theme.css`).
- Names of new functions and files, beyond those this design fixes.
- The cluster cell sizes per zoom, tuned against the profile.

## Matt's answers (2026-10-28)

- **The train emoji on Discord:** in front of a train's name in the summary post's "Going on now" and in the new-train DMs; not on the post's buttons, which keep legacy Pine's icons. Until the emoji is uploaded (Matt's go-ahead), those lines read as today, through the plain-emoji fallback the button icons use (8D-H).
- **The plans:** three, 8M-11A, 8M-11B and 8M-11C, as above.
