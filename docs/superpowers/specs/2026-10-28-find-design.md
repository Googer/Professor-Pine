# Find on the web map (S23): design

Status: approved by Matt, 2026-10-28 ("Looks good"; build it after 8M-11C without a /compact between).

## Why

At the staging of the web polish (2026-10-28, finding S23) Matt asked for "Find a gym" to search almost anything. Asked what he would reach for it for, he named first the coveted research of the day, which members hunt across the whole map:

- an event's rare task (the Cosmog task of the August event, the "win 3 raids" task with a costumed Pikachu this Halloween);
- good tasks of the standing pool (Spinda's "5 great curveball throws in a row", a confirmed Skiddo);
- rare Team GO Rocket grunts, the leaders and Giovanni.

Places by name are handy but come second. Raid bosses, trains and meetups may be searched too, where Find acts much as a filter on the list.

`/want` already pushes research and Rocket reports to the members who asked (DMs). Find is the pull side: anyone, at that moment, without a want set up.

## Goals

- One box, "Find a place or report", finds what is reported at stops today, the parties going on, and places by name, across the whole server.
- The results show in the list pane as a filter of it, grouped by kind and sorted by distance; a pick flies the map there and opens its popup (the card on a phone).
- A reward reported without being confirmed shows, marked as not confirmed.
- Light on the browser and on Pine (Matt's first concern): no new database query per keystroke, nothing heavier than what the page already holds or Pine already indexes.

## Non-goals

- No new notifications, no saved searches. Wants stay on Discord (`/want`).
- No search of regions (named in S23's first note, dropped in the later sketch and in this conversation).
- No search of what has ended (ended parties, yesterday's reports, the history).
- No chat or free text of members beyond what the post or report already shows.

## The box

- "Find a gym" in the header becomes "Find a place or report", in the same place (on a phone, behind the same search button of the one header row).
- It searches from two letters, after a short pause (about 250 ms), ignoring case and accents, every typed word matching as typed or as the start of a word ("curve" finds "curveball"). The words are read by Pine's search text rules (`src/domain/search/text.ts`: `foldText`, `searchTokens`), the same Discord uses.
- An answer for text no longer in the box is dropped.
- Clearing the box (× or emptying it) brings the list back as it was: its sort, filters and scroll.
- **The map stays as it is while typing (Matt, 2026-10-28).** Today's "Find a gym" hides the gym dots that do not match as one types (`shownGyms` in `gym-dots.ts`); for members Find does not: no layer thins, the results are in the list only, and the map moves only at a pick. Enter picks the first result.
- **Who gets Find:** members with the map's role. A visitor logged out or without the role has no list pane (`loggedOutPane`) and none of what Find searches beyond gyms (reports, parties and the stop lists are members only): they keep today's "Find a gym" exactly as it is, thinning the gym dots.
- A member while the page is read-only (Discord cannot say who is a member) keeps "Find a gym" too, although their list pane shows the last lists: Find's places route asks whether they are a member and answers 503 then (the controller's ruling at the branch review, 2026-10-29, BR-6).

## The results: the list pane as a filter

While the box holds a search, the list pane shows the results instead of its usual contents (on a phone the list's sheet opens). Three groups, in this order, each sorted by distance (from the member's location when the map has it, otherwise from the map's center):

1. **Reports at stops.**
   - Field research by its reward (a Pokémon's name, its form or costume, an item) or by its task's words.
   - Team GO Rocket by a grunt's type or the Pokémon of its lineup, the leaders by name, Giovanni, decoys.
   - Confirmed first, then unconfirmed. Unconfirmed is a research report whose reward is "one of" several (8R-5) or not given; its row says so: "not confirmed: one of 6 encounters" (or "reward not reported"). A Rocket report that names a type but not which of its two lineups (8R-4L, "not sure which") is unconfirmed in the same way.
2. **Going on.** Raids and max battles by boss, wild spawns by their Pokémon, trains by name and by their stops, meetups by their title and place: what the list already holds, matched in the page.
3. **Places.** Gyms, PokéStops and Power Spots by name, at most 10 of each kind, ranked by the match (a rare word above a common one, words as typed above a misspelling) and then by distance.

Each row: the stop's or place's name, the distance (through `distanceWords`), and the line that matched (the task and its reward, the lineup, the boss, the train). A group with nothing is left out; nothing at all reads "Nothing found for ‘<text>’."

The search ignores the layer toggles and the view: a stop holding the Cosmog task shows with the Research layer off or the stop off screen. A pick turns its layer on, flies there and opens the popup.

## Where each group is searched (Matt's concern: speed)

- **Reports at stops:** matched in the page. `/api/stop-reports` already gives the page every report of the server the member may see now (`PartyViewers`), and a day holds a few hundred at most. But the view today lacks some of what a match needs (the builder check, 2026-10-28): `mapReward` drops `costumed`, and a grunt reported as "not sure which" looks like a type with a single lineup. So the server adds to each report in that view:
  - its **search words**: the task, every reward's name with its form and costume, the lineup's Pokémon, the leader's name, Giovanni, a decoy;
  - whether it is **unconfirmed**: a research report whose reward is "one of" several or not given; a grunt type with two lineups reported "not sure which" (only such types can be unconfirmed).

  Both come from one pure function in `src/domain/` over the stored report (the `StopReport` the services hold), so a future Discord search would find the same; the page only compares the typed words with the words it was given.
- **Research waiting under an event's window** (the day's tasks shown as "Back at …", only counted in the view) is not found: it cannot be done while the window lasts, and Find shows what the map shows now.
- **Going on:** in the page, over the parties and spawns it already holds.
- **Gyms:** in the page, over every gym it holds (the public `/api/geo`).
- **PokéStops and Power Spots:** a new members-only server route over the indexes Pine already keeps in memory for Discord's searches (`PlaceFinder`'s `WayspotIndex` per kind, MiniSearch; `/research stop:`, `/wild near:`), limited to the server's regions as those searches are, so the map and Discord find the same place. No database query per keystroke. At most 10 of each kind returned. Its rate limit is its own, about 120 requests a minute per address, so typing never empties the group (the pick lists' 30 a minute is for forms that ask once). The page asks only when the text changes after the pause.

## Left to the builder

- The route's name and shape, the names of new functions and files.
- The exact row layout within the list's existing rows and the theme's named values.
- Whether gyms move to the server's `GymIndex` for the same ranking as stops (one path argues for it; the page's own gym search is cheap). Say which, and why.

## Decided (Matt and Claude, 2026-10-28)

- Matt: the coveted research and rare Rocket are what members will search most; places come second; parties may be searched, as a filter.
- Matt: results as a list sorted by distance; a pick zooms to it. Results in the list pane, as its filter.
- Matt: unconfirmed rewards shown, clearly marked (a big encounter pool makes them unlikely).
- Matt: the map stays as it is while typing; only the list filters.
- Claude's calls (Matt may object): confirmed before unconfirmed; layers and view ignored, a pick turns its layer on; distance from the member's location, else the map's center; wild spawns in "Going on"; visitors who are not members keep today's "Find a gym"; research waiting under an event's window not found; the places route's own rate limit.
- A builder check (2026-10-28) read the draft against the code; its points are answered above.

## Testing and staging

- The pure matching rule of reports unit-tested with real task and reward names (Cosmog, the costumed Pikachu, Spinda's curveball task, Skiddo in a big encounter pool, a dragon grunt, Giovanni).
- The page's filter, grouping, sort and clear through its DOM tests; the route in the web routes' tests; no test waits on real time (the pause through fake timers).
- A staging checklist with two accounts on a desktop and Matt's phone: research reported confirmed and unconfirmed, a Rocket report, a raid, a stop by name.
