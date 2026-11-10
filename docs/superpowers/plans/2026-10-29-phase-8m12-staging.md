# Phase 8M-12 staging checklist: Find on the map

Every step needs Matt's go-ahead. Matt starts the bot and the tunnel. Claude drives the map in its own tab as Googer on the desktop; Matt's hand is needed on his phone and where a step says so.

- **Accounts:** Googer (the owner, staff) and Tester (a member with the map's role). Tester reports on Discord where a step says so; Googer finds on the map.
- **Brief:** `.superpowers/sdd/2026-10-29-phase-8m12-find/design.md`.
- **Design:** `docs/superpowers/specs/2026-10-28-find-design.md` (finding S23, follow-ups "From the staging run of the web polish").
- **Conventions:** `docs/architecture/web.md` ("Find on the map (plan 8M-12)"), `docs/architecture/stop-reports.md` ("What Find finds a report by").
- **Devices:** a desktop browser at 1280 pixels, light and dark; Matt's phone (steps 14 to 17).
- **Writes:** the reports and parties of the steps are made on Discord in a region of the test server and taken back (or left to end) afterwards; nothing else is changed. No migration, no setting, no command change: no deploy.

## Before

0. **The page built, the bot started after it.** Run `npm run web:build`, then start (or restart) the bot: it reads `dist/web/assets.json` once at startup, and `/api/stop-reports` now carries `words` and `unconfirmed`.
1. **What is reported.** As Tester, in one region of the test server, on Discord:
   - `/research report` of a task of several encounters with its reward told (as "Catch 10 Grass-type Pokémon · Skiddo" where today's list has it; else any task of several encounters, one reward picked) at stop A;
   - `/research report` of the same task's "one of" at stop B, another stop;
   - `/research report` of a task typed in full without a reward ("I can't find my task" on the map, or `task:` typed on Discord) at stop C;
   - `/rocket report` of a grunt type of two lineups with "not sure which" (the Water-type grunt where today's lineups give it two) at stop D, and of a grunt type of one lineup (Dragon-type, or any other) at stop E;
   - `/raid` of a boss at a gym (a Level 1 or 3 will do).
   Note the stops' names and the boss.

## The box and its results (desktop)

2. **The box.** As Googer, the header's box says "Find a place or report". Type one letter: nothing changes (the list as it was, the map as it was).
3. **Research found, confirmed first.** Type the encounter's name (`skiddo`): after a moment the list pane shows "Found · n", the group "Reports at stops" with stop A's row (the stop's name, "Catch 10 Grass-type Pokémon · Skiddo", the distance, until when) first, then stop B's row marked "not confirmed: one of 6 encounters" in the warning's color. The map does not move or thin while typing.
4. **By the task's words.** Type a word of the task's text as its beginning (`grass`, then `catch 10 gr`): both rows again; a word in another case or with accents (`SKIDDO`, `pokemon`) finds the same.
5. **Reward not reported.** Type a word of stop C's typed task: its row says "reward not reported".
6. **Team GO Rocket.** Type `water`: stop D's row, "Water-type grunt", marked "not confirmed: one of 2 lineups". Type a Pokémon of the dragon grunt's lineup (`deino`): stop E's row, unmarked. Type `rocket`: every grunt and hideout of the day.
7. **Going on.** Type the raid's boss: the group "Going on" with the gym's name over "Level 1 raid against …". Type a word of a train's or meetup's name where one stands on the test server: its row there.
8. **A stop by name.** Type the name of a PokéStop of the region (not one with a report): the group "Places" shows it ("PokéStop"), ten of a kind at most; a gym's name shows the gym ("Gym"), a Power Spot's ("Power Spot"). A misspelt word of a name (one letter wrong) still finds it; a word no name has finds nothing of it. While the places are asked for, "Finding places…" stands under "Places" for a moment. A word of three letters is read only as typed or as a beginning (`art` does not find a "Park").
9. **Nothing.** Type `zzqx`: "Nothing found for ‘zzqx’."
10. **A pick.** With the Field research layer turned off (its toggle), find `skiddo` and click stop A's row: the layer turns on, the map flies to stop A and its popup opens with the report. Find `water` and press Enter: the first row is picked (the Rocket layer on, stop D's popup). Find a stop by name and click it: the map at the stop, its own popup ("Report research here", "Report Rocket here"), the PokéStops layer as it was. Find stop A by its name: the popup of its reports opens, as a tap on its marker opens it (BR-2). Find a gym by name and click it, the Gyms layer off: its popup opens, the layer stays off; find the gym of the raid by name: the raid's popup (or the list of what shares its place). Find a Power Spot with a max battle by name (where one stands): the battle's popup.
11. **A filter lifted.** Filter Field research to another reward (its group's "Filter…"), find `skiddo` and click stop A's row: the filter is lifted (the group's heading without it), the popup opens.
12. **Clearing.** Sort the list by Soonest, scroll it down, find anything, then clear the box with its ×: the list as it was, Soonest and the scroll where they were, the filters as they were.
13a. **While a gym is to be clicked (BR-1, N1).** Find `skiddo` first, then start a new train and press its route's editing (route mode): every gym is drawn to be tapped (the search left in the box thins nothing). Type a gym's name in the box: from its first letter the gym dots thin to the matches as "Find a gym" does (M1), no "Found" list (the pane shows the route editor), Enter fits the map to the gyms. Leave route mode: the box is emptied (the text typed was a gym filter, M2), the dots as the Gyms layer says, no "Found" list and, on the phone, no list opened. Find `skiddo` again, enter route mode without typing and leave it: "Found" for `skiddo` is back. The same with a new meetup's place picked on the map ("New meetup", pick the place), and with research's form open ("Report research here", the form in the pane).
13. **Light and dark.** Switch the device to dark: the rows, the mark and the places' rings readable.

## The phone (Matt)

14. **The box on the phone.** On the phone, as Googer (or Matt's own account), tap "Find": the box opens over the map, "Find a place or report".
15. **The list opens for the results.** Type `skiddo`: the list opens under the box with "Found · n", the rows readable, the box not covering the first row.
16. **A pick on the phone.** Tap stop A's row: the map shows with the stop's card, the box hidden. Wait a few seconds: the list does not open again over the map. Tap "List": the results, with "×" ("Back to the list") at the end of "Found · n"; tap it: the list as it was, the box empty (BR-3). Type `skiddo` again and pick, then tap "Find": the box comes back with `skiddo` and the list of its results; clear the box (×): the list as it was; tap "Map".
17. **Closing.** Type something, then close the box with "Find": the box empties and the list closes again (where Find opened it).

## Visitors

18. **Logged out.** In a private window, logged out: the box says "Find a gym"; typing a gym's name thins the gym dots to the matches (the Gyms layer off or on), Enter fits the map to them; no list of results.
19. **Tester without the map's role (optional).** Where the test server can take the map's role from Tester for a minute (`settings.web.memberRole`): "Find a gym", as in step 18. Give the role back.

## After

20. Take back the reports of step 1 (Take back on the map or `/research remove`, `/rocket remove`), or leave them to end; end the raid.
