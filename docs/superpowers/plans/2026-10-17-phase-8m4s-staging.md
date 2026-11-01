# Phase 8M-4S staging checklist: reporting wild Pokémon on the live map

Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the map in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`. The web settings of 8M-1's staging stay (`"web": { "port": 8080, "publicUrl": "http://localhost:8080" }`). Two accounts: **Googer** (Claude, a moderator) and **Tester** (Matt, a member without a staff role). A phone (or the browser's device mode with touch) for the long press.

## Before

1. No migration and no command change in this plan (`/wild`'s options, name and help are as they were): no deploy. `npm run build` (it runs `npm run web:build`): a new `dist/web/assets/map-<hash>.js`.
2. Tester wants Dratini (`/want target:Dratini` on Discord) for step 5. Note a point of West far from every gym, PokéStop and power spot, one a few metres from a PokéStop with a title, and, if the test server's outlines overlap anywhere, a point in two regions (else skip step 8).

## Reporting

3. Logged out, and logged in as somebody who is no member (or without the map's member role): a right click on the map shows the browser's own menu and no form; no "Report spawn here" in a gym's popup.
4. Googer logs in with `/maps`. A right click on the point of West far from every place: a popup opens there with "Loading the Pokémon…", then the form: "Wild Pokémon here", "Pokémon" (type `drat`: the browser offers "Dratini" from the list), "Where it is", "IVs" ("Not checked"), Report and Cancel. The popup stays while typing (it is not drawn anew under the form).
5. Pick Dratini, type `by the bench`, Report: the notice says "Reported: a wild Dratini at your pin. The report is removed in 30 minutes."; the popup closes; nothing on the map changes. On Discord: West's channel has the report, "### Wild Dratini", "Reported by **Googer**", **Where** "by the bench" and "📍 Dropped pin · Map", the Map link opening the point; Tester got the DM ("A wild **Dratini** has been reported in #west by **Googer**."), with the pin in its brief. The report is deleted after 30 minutes.
6. A long press (phone, or device mode) on the point near the PokéStop opens the same form; report a Pokémon typed in lower case (`gastly`) with IVs "Perfect (100%)": "Reported: a wild Gastly with 100% IVs near <stop>. …"; the report says "📍 Near **<stop>** (PokéStop)" and "with 100% IVs".
7. A gym's popup (one without raids, and one whose marker shows raids) has "Report spawn here" (after "Report raid" there): click it, the form takes the button's place and stays; Report: "… near <gym's name as its post names it>." Cancel instead puts the button back.
8. The point in two regions: the form has "Region" with "Pick the region" and both; Report without one picked: "This point lies in several regions: pick the one to report the spawn in.", the form kept; with East picked the report goes to East's channel.
9. A right click outside every region: no form opens; the notice says "That point is not in a region of this server." at once and nothing is posted. (Just inside an outline's edge the form opens and the server decides; a point the server places outside answers "That pin is not in a region of this server. Give a place in the regions here.")
10. Refusals in `/wild`'s words, as text, the form kept: `Mewtwo` "Mewtwo does not appear in the wild." (no asterisks); `Mega Charizard X` "… is a mega: those are met in raids, not in the wild."; `zzzz` "I do not know \"zzzz\" as a Pokémon. …"; the details left blank: "Say where it is first: a street corner, a park, a gym." (the page's own); blanks only, resent from the network panel (`"details": "  "`): "Say in details where the Pokémon is: …" (the backticks taken out). None of these counts against the limit (step 11).
11. `/wild`'s limit is one: five reports in half an hour between the map and `/wild` on Discord; the sixth is refused on whichever side, "You can use /wild again in 30 minutes." (429 with `Retry-After: 1800` on the map, privately on Discord). The reports go away by themselves.
12. One form at a time: with a raid form open in a gym's popup, a right click on the map says "Close the form that is open first." and opens nothing; "Report spawn here" and "Report raid" are greyed out until the form closes. With the spawn form open at a point, a click elsewhere on the map closes its popup and the form with it; a late answer opens nothing.
13. A forum Tester is kept out of (an overwrite for Tester that denies View Channel on West's forum): Tester's report at a point of West answers 403 and posts nothing; at a point of East it goes through. Remove the overwrite; then the same with an overwrite for Tester that denies View Channel on West's text channel: 403 at a point of West, East goes through. Remove it afterwards. (A role's denial on the text channel is not looked at, as for raids.)
14. While Discord cannot be reached, and a report that comes while the bot shuts down (not staged: covered by the route tests): no form, writes 503; a report during the shutdown 503 with `Retry-After: 60` and "I am restarting just now, so the report was not made. Report it again in a minute."
15. The bot's log: one info line "a spawn was reported on the map" per report (`user`, `guild`, `region`, `outcome`), no Pokémon name, typed text or point.

## Afterwards

16. Remove Tester's `/want` of step 2 and any overwrite of step 13 (the forum's and the text channel's); the reports delete themselves.

## Left open (to the follow-ups if not settled here)

- For Matt: spawns have no privacy setting, so the map names the reporter as `/wild` names them (the brief's "per their setting" has no setting to follow; the controller's ruling). Whether a spawn's reporter should be hideable (by `raidPrivacy`, or a setting of its own) is a question for Matt.
- Spawns are not drawn on the map; the map shows no PokéStops or power spots, so only gyms' popups have "Report spawn here".
- The pick list is every Pokémon `/wild` takes (about 1,180 names, 33 KB once per form, revalidated by its ETag); a browser's `datalist` filters by what is typed, without `/wild`'s search order or nicknames (a nickname typed is still read by the server when it names one Pokémon outright).
- The size of the form on a phone, and whether Leaflet's long press works on every phone browser (Safari through its `tapHold`, others through the browser's own `contextmenu`).
