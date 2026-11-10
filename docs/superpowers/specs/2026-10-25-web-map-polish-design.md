# The web map's polish: layers, the list, reporting, posts as popups: design

Status: approved by Matt 2026-10-25 (builder-checked, his rulings taken). From the interview of 2026-10-25; mockups v1 seen and liked ("looks quite good for now"). Builds on `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md` and `docs/architecture/web.md`. Mockups: `var/mockups/web-polish/index.html` (git-ignored; frames A to F).

## Why

The map works but cannot be read. On a first visit Matt could not tell how to read what was reported or how to report; the side pane ("Meetups and other parties") shows only meetups and what the map cannot place, with no filter in sight; every gym is drawn at once. Meanwhile about twenty page features were built on the server and deferred to "the map's UX pass" (follow-ups: 8X-5, 8R-3, 8R-4L, 8R-5, 8R-6, 8X-F, 8X-G, 8S-4) and have never been driven by a real page. Pine is a Discord bot first, so the web should feel like Discord.

## Who and what for (Matt)

Members open the map to, in this order:
1. **report** something (a raid, research, a Rocket hideout, a max battle…);
2. **glance at what is on**, mostly raids active or about to hatch;
3. see **meetups** nearby (weak on the web: the talk is on Discord).

Admins also **edit regions**, on desktop only.

## Goals

### The page's frame
- **Follows the device's light or dark** on every web page (map, editor, `/userscript`, login pages), map tiles included (a dark street style in dark mode).
- **Discord's look:** its greys and blurple, its button styles (blurple primary, grey secondary, green and red as the post uses them), cards with the colored side bar of a components-v2 container, the system font (Discord's own is not free). The same icons as the posts: the application emoji (status buttons, types, weather, teams), boss and egg pictures, served by Pine's web server.
- **Zoom:** opens fairly close in; never zooms out past the zoom that shows all of the instance's regions; panning stops a little beyond them. Start view: your location if shared, else where you last left it (browser storage), else the region of the channel `/maps` was used in (`/maps` passes it), else the whole instance.
- **Your location:** a "Show where I am" button asks the browser on press (never on load), shows a blue dot and centers on it; granted once, it is shown on later visits without asking. Used for distances and for nearest-first everywhere. (Only on https: profpine.com, not plain-http test addresses.)

### Layers
- Everything drawn is a **layer the member toggles**: Raids and max battles, Trains, Meetups, Field research, Team GO Rocket, Wild spawns, Gyms, PokéStops, Power Spots, Region outlines. Toggles, not "show only this" (Matt).
- **Desktop:** a row of labelled toggles along the top. **Phone:** a "Layers · n" button opening a bottom sheet with every layer, its name and a switch (eight labelled toggles do not fit a 375-pixel row; Matt agreed).
- **Defaults:** what is happening on (raids and max, trains, meetups, research, Rocket, outlines); background places off (gyms, PokéStops, Power Spots), wild spawns off. The choice is remembered per browser. PokéStops and Power Spots are drawn only from street-level zoom; Gyms cluster below it.
- **Clustering:** background places (gyms, stops, spots) cluster into count bubbles when zoomed out; live things (raids, max battles, trains, meetups, reports) never cluster.

### Markers
- **Plain circles centered on the place** (Matt, 2026-10-25: easier to read a location from than the pin-shaped or fancy icons of other maps): a picture inside a circle, never a pin whose point is the place.
- **Several things at one place** (a train's stop at a gym with a raid, two reports at a stop): turning a layer off removes the overlap (Matt: this settles the train-versus-raid tap of the 8S-4 staging); with both on, a tap opens one popup listing each (the official map shows one card per thing at a gym), never a tap that depends on hitting a ring's line.
- **A raid or max battle:** the boss picture (the egg of its tier before it hatches) in a ring of its tier's color, a time badge under it (time left, or "hatches 2:40"), and a green count of those going (coming and here, +1s counted). One in its last few minutes is dimmed.
- A gym with a raid shows the raid; its popup offers the raid, not "Report raid" (reporting a raid where one stands opens the existing one already: `reportClosesForm`).
- A train: its route as a line, its current stop as a ring (as today); a meetup at its place.

### The list
- **Desktop:** the side pane on the right. **Phone:** a "List" button that swaps the map for the list.
- It holds **everything the enabled layers show, across the whole instance**, grouped by kind (raids and max battles, trains, meetups, research, Rocket, spawns).
- **Sort** is the member's choice, remembered per browser: **Nearest** (default; from your location, else the map's center), **Soonest** (ending soonest for raids and reports, starting soonest for trains and meetups), **Most going**.
- Each line: picture, name, place, distance, time, how many are going; a nearly expired one dimmed.
- Tapping a line flies the map to it and opens it; hovering a line on desktop highlights its marker.

### A party's popup is its post
- A party's popup (desktop) or card (phone: a summary with the main buttons, swiped up for the whole) **can do everything its Discord post can, except chat** (Matt). It is **drawn from the same post layout the post renderer builds** (see "After the builder check"), so map and post cannot drift. The map adds only its own line: distance, Directions, Open on Discord.
- Not on the map: **starting a new group** (it needs a word with the others): "Start a new group on Discord →". Choosing or moving between existing groups is on the map.
- **Trains:** moving, Manage…, Split… and the route for the conductors and staff, as on Discord; others see the route and stops. The route editor adds a stop by a tap on a gym or Power Spot and orders stops by dragging in the stop list.
- Server routes the map lacks today: Group… (choose or move group), Meet… (meeting time), +1s, Manage…, Split…, staff's delete, Report to moderators. Every control of a post gets a route, or a deliberate "on Discord" link.

### Reporting
- One always-visible **Report** button (floating on a phone, in the top row on desktop).
- **Step 1, what:** Raid, Max battle, Field research, Team GO Rocket, Wild spawn, Train, Meetup. Icons: the game's own where there is one (Campfire may have a meetup icon); a train needs Pine's own.
- **Step 2, where:** only the fitting places are drawn and highlighted (gyms for a raid, Power Spots for a max battle, PokéStops for research and Rocket; any point for a spawn or a meetup at a pin), with the nearest listed beside them.
- **Step 3:** the same form as the slash command (`/raid`, `/max`, `/research`, `/rocket`, `/wild`, `/train`, `/meetup`), prefilled with the place: its pick lists, its questions (the ending-soon question, research versions and asks, the hideout replacing question), "Same task at more stops…".
- Tapping a place directly still works and skips steps 1 and 2.

### The deferred page features (each belongs to a goal above)
- 8X-5: Power Spots layer from zoom 15, "Report max battle here", the ending-soon 422 as a question, max battles drawn at their spot with a raid-like popup, Remote, train kinds in the start form and the panel.
- 8R-3, 8R-4L, 8R-5, 8R-6: the reports-at-stops layer (research by reward picture, hideouts, grunts with a countdown, several reports at one stop on one marker), their popups and take-back (with `madeAt`), reporting research and Rocket, filters by reward or catch and by grunt type or leader, the research versions picker and asks, square pictures for catches and rewards.
- 8X-F, 8X-G, 8X-1B: popup parity with the post, groups in letter order, Group…'s read-only mode.
- 8S-4: the train ring's tap target on a phone.

### Admins
- An **Edit regions** toggle on the same map for admins, desktop only: it turns the zoom and pan limits off, hides the live layers and shows the editor's tools; off returns to the live map. `/region edit`'s link opens the map with the editor on. The editor's own behavior (save, preview, slivers) is unchanged; its color words follow the theme.

## After the builder check (2026-10-25)

### Matt's rulings
- **Names:** the popup names attendees and the reporter or maker as the post does, to the members who may see the post (`PartyViewers`); `web.md`'s "nobody is named" goes. The map is an extension of Discord, never a contradiction of it.
- **Who may change a raid:** Discord's rule (anyone in the post may set hatch, end, boss), not 8M-4's "signed up or staff".
- **Screenshot feedback** stays on Discord. The popup says the raid was reported from a screenshot, with the post's disclaimer where Pine had trouble reading it (shown when the post shows its button).
- **The train's Route and the completion question** are on the map.
- **Tiles** (seen on `var/mockups/web-polish/tiles.html`, 2026-10-25): **Stadia Maps' Alidade Smooth and Alidade Smooth Dark** (free plan, non-commercial, about 200,000 credits a month, refused past it, never billed). No key (Claude, 2026-10-25, from Stadia's docs: a website is let in by its domain, registered in Stadia's dashboard, and `localhost` needs nothing; a key in the page would be readable by anyone): Matt makes the account and registers profpine.com before staging; `settings.web.tiles` gains `'stadia'`, the default. When Stadia refuses (an unregistered address such as a quick tunnel, or past the month's credits), **OpenStreetMap** (darkened by a page filter in dark mode; Matt: "not awful"). Google stays a choice (`settings.web.tiles`). CARTO (terms cap) and Esri's Dark Gray (no tiles past zoom 16) left out.

### Changed by the check (Claude)
- **The popup is built from the post's layout, not its Discord text.** The server sends each party's `PostLayout` blocks (heading, times, boss lines, Where, sign-ups, controls; trainer lists tagged) as data in `/api/parties`, built by the same code that builds the post, cached per party version; the page draws them as node trees (never HTML from data, `web.md`). Times go as epoch values and are shown in the reader's own zone, as Discord does; emoji go as named pictures; the post's accent goes as a named color of `theme.css`. The member's own part (your status, your group, the buttons that depend on you) stays the map's own, as today.
- **Pictures:** a picture route for the application's icons (type, weather, team, the buttons), since the posts point at Discord's CDN; Wayfarer gym pictures through Pine's image cache or their hosts added to the CSP (builder's call, stated).
- **The routes:** every post control that opens a Discord dialog (Group…, Meet…, Move…, Manage…, Split…, Set time…, Route) gets a web form over the dialog's code path, with the full guard chain of `web.md`; wild spawns get a GET route. This makes 8M-8 two or three plans.

### Settled by Claude (Matt to check)
- An explicit `/maps` wins over "where you last left it"; `/maps` stores its region with its login link.
- "Instance" in this design reads as the server: the page and its data are per server.
- Train in Report: step 2 is a tap inside a region's outline, or a region picker.
- Desktop row: the live layers as labelled toggles, the background layers (Gyms, PokéStops, Power Spots, Wild spawns, Region outlines) under "More"; the "Find a gym" box stays, beside Report.
- Distances in miles and feet.
- Pine's own grid clustering (Leaflet.markercluster's last release is from 2020).
- The editor's script loads when its toggle is pressed; `/s/<guild>/regions/edit` redirects to the map with the editor on.
- Geolocation also works on `http://localhost`.

## Non-goals

- Chat on the web (Matt and Claude, 2026-10-26): reading a channel's messages needs the Message Content intent, a privileged one that an instance past 10,000 users must ask Discord for, and mirroring chat onto a website is a use Discord is unlikely to grant; posting from the web could only be done by the bot (or a webhook wearing the member's name), outside the blocks, mutes, reports and AutoMod members rely on; and members' talk would reach pages they did not sign up for. Each popup's "Open on Discord" is the way to talk.
- Live wild spawns from outside Pine (PoGO Alerts' kind; Matt).
- A phone layout for the region editor.
- New party features: the map does what the post does, no more.

## Anti-goals

- A map that differs from the Discord post in what a party is or what can be done to it.
- Hiding what is on: a list or filter whose rule a member cannot see.
- Asking for location unasked.

## Constraints

- `src/web/client/` and its tsconfig; esbuild bundle; Leaflet stays (clustering by a maintained Leaflet plugin, latest stable, or Pine's own grid clustering: builder's call, stated).
- The CSP of `web.md`: tile hosts and image hosts listed; the dark tile style's host added.
- Every new web route follows `web.md` (members only, CSRF, rate limits, `PartyViewers`).
- American spelling; components-v2 rules hold for what the popup mirrors.
- `theme.css` stays the one place for colors; light and dark as two sets of its named values.

## Proposed split into plans (Claude)

1. **8M-7 the frame:** theme (light/dark, Discord look), zoom and start view, location, layers (toggles, phone sheet, defaults, clustering), raid markers, the list with sort.
2. **8M-8 posts as popups** (two or three plans): the post layout as data and its drawing on the page, the phone card, the routes the map lacks (Group…, Meet…, +1s, Manage…, Split…, delete, report), groups in letter order.
3. **8M-9 reporting and the stops:** the Report flow, Power Spots and max battles, the reports-at-stops layer and its forms, the research pickers. A form's pick lists and defaults that an event's boundary changes (a research period, the max battle's default end, an event's tasks) are checked again when the form is sent, by the same code as on Discord, and a choice a boundary made invalid is refused with Discord's words ("The task list just changed: pick the task again."); the form then asks for its lists again. No timed refresh of an open form (Matt, 2026-10-25: the easy version). The map's data already refreshes every 20 seconds while the page is shown.
4. **8M-10 the editor toggle.**

Order: 8M-7 first (everything sits on it). 8M-9 after the region board plan and with 8R-8's tasks-first order (both move links and lists the stops part shows).

## Decided by Claude (Matt to check)

- The defaults of the layers and which layers there are; Region outlines as a layer.
- Dimming a nearly expired raid ("last few minutes": 5).
- Sort choices Nearest, Soonest, Most going.
- Hover highlighting on desktop.
- The phone card swiped up for the whole post.
- Train and Meetup in the Report menu.
- The start view's order (the tiles: Matt chose Stadia, above).
- Popups drawn from the post's own message.
- The split into four plans.

## Left to the builder

The clustering library, the component structure of the page, how the components-v2 translation maps each component, the exact breakpoints, the icons' sources and licenses (checked before use).
