# The small web plan before the cutover (8M-15): design

Status: approved by Matt, 2026-10-30 (Q1 and Q2 as recommended). Branch `web-small-pass`, worktree `../Professor-Pine-smallweb`.

## Why

Matt is about to share `https://dev.example.com` with two outside testers: a senior QA engineer who hunts edge cases, and a member who will use the map and its buttons more than slash commands. This plan clears what the stagings of 2026-10-29 left for "before the cutover". Most of the earlier list (T1, A1, A2, I1, L1, L2, O1, S7, S10) was built in 8M-13; what is left is below. Every item is a decision Matt made in staging (follow-ups, "From the staging run of 8M-14" and "From the staging run of 8V-1 and the small pass", and Matt's decisions of 2026-10-30).

Goals: the map's popups read and tap well on a phone; a train's stops ahead read as "how far away" without clutter; the top page's cards look alike; the events listing stops repeating "Campfire". Non-goals: anything new on the map, a change of what a party post says on Discord, any migration, any command change (no deploy). Small additions to the map's data (`MapTrain`, `MapMeetupPlace`) are allowed where an item needs them. Anti-goals: a popup that differs from the post it shows (8M-8A: a party's popup is its post), a second implementation of a fact the post or Discord already computes (CLAUDE.md, "one path for every fact").

## 1. The list of things at one place (map popups)

Today a tap on a spot with several things on it (a gym with its raid and a train stopping there, plus things close by on the screen) opens a list headed "Here" (`placeListNode`, `src/web/client/shared-place.ts`); the place's name heads it only when every listed thing is at that place. Matt (2026-10-29): useful on a phone, where a near neighbor is easily tapped by mistake.

- Heading: the name of the tapped place (`target.place`, the first entry of `sharedPlace`; a tapped gym dot, `tapGym`, gets `place: { key: 'gym:<id>', name }`, which it lacks today). A pin has no place key (`PlacedThing.place`), so a pin tap is headed "Nearby".
- Under it, first, the things at that place (same `place.key`): the place itself where the list has an entry for it (a gym dot's own choice; no entry is made up), its raid or max battle, a train whose current stop it is, a meetup at it. `MapMeetupPlace` gains the key of a meetup's PokéStop or Power Spot (today only `gymId`), so those group too.
- Then a small label "Also nearby" over the things only near it on the screen, in today's order.
- When nothing listed is at a named place (a tap between markers), the heading is "Nearby" and there is no "Also nearby" label.
- When everything listed is at the tapped place, no "Also nearby" label.
- "At the place" is decided by the place's key, never by distance; which things are in the list at all stays as today (`sharedPlace`, by screen pixels). A thing whose place has no key counts as nearby. Taps on Power Spot and PokéStop dots that open their own popup (`places-ui.ts`) are unchanged.
- Fallback (Matt): if the grouping turns out not to work, the heading becomes "At this spot" instead of "Here". The builder does not choose this alone: it is said in the plan's report if the grouping is dropped.
- `parties.ts`' other "Here" (`present: 'Here'`, the attendance status) is a different word and stays.

## 2. The popup's × in a header row (coarse pointer)

On a coarse pointer (a phone, also a phone in desktop mode) the × is 44 px (`--tap-size`) and the content is pushed below it (`map.css`, `.leaflet-popup-content { margin-top: var(--tap-size) }`, 8M-11A S3), so the × sits alone above everything. Instead the popup's first line (the post's title, item 1's heading, a form's title) shares a row with the ×: the content keeps its top margin as on a fine pointer, and its first line reserves `--tap-size` on its right (or the side the × is on) so that text never runs under the ×. The × keeps its 44 px tap area. Every kind of popup the map opens gets this (party posts, the place list, Power Spot and stop popups, forms in popups): one generic spacer floated right at the top of the content (`.leaflet-popup-content::before`, about `--tap-size` square less Leaflet's margins) rather than a rule per kind, so that a post's floated picture (`.post .beside`) also sits left of the ×. The phone card (a party docked to the bottom) already has a header with its own close and is not changed.

## 3. A train's stop badges on its line, counted from the train

Today (8M-13, S7) each stop ahead gets a numbered badge set off to the left of the stop by a fixed pixel offset (`stopBadges`, `badgeAnchor`, `src/web/client/train-line.ts`), numbered by its place in the route (`index + 1`). Matt: it looks out of place, worst zoomed out; and the number reads best as "how many stops away".

- Each badge is a small number drawn on the route line itself. A raid's or max battle's 44 px marker would hide a centered number, so the number sits on the leg arriving at the stop, just clear of the marker (half the marker plus a gap; a first stop with no arriving leg uses the leaving leg), several numbers of one stop further along that leg; never at a fixed offset to the left. The stop's marker stays above it and its tap wins: gym and Power Spot dots (today `circleMarker`s in the overlay pane, below the badges' marker pane) get a pane above the badges.
- The number counts the stops ahead from the train's current stop: the next stop is 1. Matt (2026-10-30, Q2): each stop shows one number, the train's next arrival there, and the current stop none; so a turn-back train's numbers have gaps (the arrivals on the way back to stops already numbered), which the Route list's "in N stops" explains. Two numbers only where the route lists a stop twice in the same direction, side by side as several trains' badges are today. (A route cannot list a stop twice today, `already-on-route`; Matt wants that allowed later, a design of its own, so the badges handle it already.)
- Which stops are ahead, and in what order, is one new pure function `stopsAhead` in `src/domain/party/train.ts` (the full ordered list of route indices ahead: a loop round to the stop before the current one, a turn-back to the end and back); `routeAhead` (the post's "Next:" line) takes its first stops from it, and the server sends the list in `MapTrain` for `stopBadges`. Every listed stop is counted, also one the map cannot place, so the numbers match the route.
- Shown from zoom 15 only, as today (`BADGE_MIN_ZOOM`); a finished train has none.
- The popup and the post: Matt asked that the train's popup say "next" / "in N stops" beside the stops ahead, so that the map's numbers and the route's words meet. The popup is the post, so this changes the post on Discord too. Matt (2026-10-30, Q1): the words go in the map popup's own Route list (`trainPart`, `post-draw.ts`) beside each stop ahead ("next", "in 2 stops" …); the Discord post, its "Next:" line and `/route` are unchanged.

## 4. P1: the top page's cards alike

A logged-in top page with only links (no join list) draws a narrower card than the other short pages: every short page's card fits its content (`body.short main`, only a `max-width`). Every short page's card takes the full 480 px where the screen allows (the 16 px gutters kept), narrower only on a narrow screen; one-line pages too.

## 5. V1: Campfire in the events listing and posts

Matt (2026-10-30), as Claude recommended:

- The listing ("Events", `src/render/events-forum.ts`) no longer marks lines with "Campfire". Its foot line becomes "Official meetups by Community Ambassadors are on Campfire" with the link (`CAMPFIRE_DISCOVER_URL`), shown when any listed event has the hint (today's `hinted`).
- An event's own post keeps "Official meetups, if any: Campfire" only for an event shorter than a day (end − start < 24 hours) whose kind has the hint (`hasCampfireHint`).
- The post rule sits beside `hasCampfireHint` in `src/domain/time/event-listing.ts` (not in `campfire.ts`, which the web page imports and which must stay free of zod and Temporal); "shorter than a day" is `ONE_OFF_RAID_MS` (24 h; a midnight-to-midnight day event, exactly 24 h, gets no hint). The map list's foot line ("Official meetups: Campfire", `list-ui.ts`) is unchanged.
- The listing is redrawn at the next draw as any change. An event post whose name and times are unchanged is not edited today (`drawPost`, `event-forum.ts`); it now goes through `editEventPost` there too, which skips a message equal to the one last sent, so open multi-day posts lose the line at the next draw (one edit per open post after a restart).

## 6. V2: `/help meetup`'s paragraphs

The Campfire sentence ("Official meetups by Community Ambassadors are on Campfire: …") becomes a paragraph of its own instead of the end of the archive paragraph (`src/commands/meetups/meetup.ts`, `help.details`).

## Constraints

- No migration, no party state change, no command definition change (no deploy).
- American spelling; distances through `distanceWords`; the web page uses no Temporal.
- The staging checklist covers a phone (Matt) and a desktop for items 1–3, the top page for item 4, Discord for 5 and 6.

## Left to the builder

The exact CSS of the header row and the badge on the line; how the tapped place is passed to the list; the label's style (small, muted, as the list's other labels); test names.

## Questions

Builder check 2026-10-30 (a fresh Opus reader); its gaps are settled above as Claude's calls. For Matt:

- **Q1. Where the popup's "next" / "in N stops" goes.** Claude's recommendation: in the map popup's own Route list (`trainPart`, `post-draw.ts`, which mirrors Whole route and already says "(the train is here)"), beside each stop ahead; the Discord post, its "Next: 3. C · 4. D" line and `/route` unchanged.
- **Q2. A turn-back train's stops passed twice.** Claude's recommendation: one number per stop, its next arrival; none on the current stop; two numbers only where the route lists a stop twice in the same direction.

## Amendments after the reviews (2026-10-30)

- §2: popups whose root is a flex box (`place-popup`, `stop-popup`, `raid-form`) and a post's form inside a party popup reserve the room on their first row instead of beside the float, so they keep their full width. A popup that scrolls keeps the top margin below the ×, without the spacer.
- §3: the pure functions are in `src/domain/party/stops-ahead.ts` (`stopsAhead`, `arrivalNumbers`), no imports, re-exported by `train.ts`.
- §3, Matt (2026-10-30, after the whole-branch review; it replaces the placement on the leg above): a train's numbers show only while that train is selected, its popup or phone card open; one train at a time, which also settles which numbers belong to which train. Each number sits at the upper left corner of its stop's marker (a raid's count of who is going has the upper right), in a pane above everything, and takes no taps. From zoom 15. Arrowheads and the places' dots stay as before 8M-15; no pane for the dots. In Report's pick mode the line and arrowheads are dimmed with the rest.
- §1: a train has a place in the list only when the map can place its current stop; a finished train has none. Its name is the place's own, as a raid's.
