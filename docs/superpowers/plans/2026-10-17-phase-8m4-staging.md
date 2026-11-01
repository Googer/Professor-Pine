# Phase 8M-4 staging checklist: reporting and changing raids on the live map

Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the map in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`. The web settings of 8M-1's staging stay (`"web": { "port": 8080, "publicUrl": "http://localhost:8080" }`). Two accounts: **Googer** (Claude, a moderator) and **Tester** (Matt, a member without a staff role).

## Before

1. No migration and no command change in this plan (the commands' options, names and help are as they were): no deploy. `npm run build` (it runs `npm run web:build`): a new `dist/web/assets/map-<hash>.js`.
2. A gym of West that lies in West alone (the Library, say), and, if the test server's outlines have one, a gym that lies in two regions (else skip step 7). Googer's and Tester's `/settings`: Tester's raid privacy set to anonymous for step 6, Googer's left as it is.
3. Somebody wants T5 raids (`/want` on Discord with a second account, or Googer's own `/want tier:t5` if the notifier tells the reporter too; note which) for step 5.

## Reporting

4. Logged out, and logged in as a member while Discord cannot be reached (not staged, below): no "Report raid" in a gym's popup.
5. Googer logs in with `/maps` and clicks a gym of West: its popup has "Report raid". Click it: the form takes the popup's place and stays while a boss is picked and a time typed (the popup is fitted to it, not drawn anew): "Raid" with "Pick the boss or the egg", the current bosses grouped under their tiers ("Level 5 raid", …) in the order `/raid` lists them, then "Eggs"; "Hatches in" with "minutes, or a time like 6:15pm"; Report and Cancel. Pick "Level 5 raid egg", type `20`, Report: the notice says "Reported: T5 egg at <gym>."; the form closes, the gym gets the raid's marker within a moment and its popup opens, showing "Hatches at …" twenty minutes ahead. On Discord: the post in West's forum names Googer as the reporter, Googer is signed up by their automatic status, the region's summary lists the raid, and whoever wants T5 raids got the DM (step 3).
6. Tester (anonymous by their settings) reports a boss from the list ("Ends in" once a boss is picked) with a clock time (`3:40pm`, within the raid's length): the post names no reporter (as `/raid` from an anonymous member), the map's answer "Reported: <boss> (T5) at <gym>.".
7. The gym that lies in two regions: its form has "Region" with "Pick the region" and both regions by name; Report without one picked: "This gym lies in several regions: pick the one to report the raid in.", the form kept; with East picked the post goes to East's forum. If one of the two regions has no forum: with it picked the raid goes to the other, and the answer ends "It was posted in #<other region>."
8. Report again at Googer's gym of step 5 (Tester): "There is already a raid at <gym>. You have been marked as interested." (or Tester's automatic status), the raid's popup opens, the post lists Tester. No second post. The raid's popup (the marker on the gym) also has "Report raid" after its raids: its form opens there and stays; an elite raid reported there is a second raid at the gym, listed in the same popup.
9. Refusals in `/raid`'s words, as text: a time the egg cannot have (`5pm` an hour on): "\"5pm\" cannot be the time the egg hatches: it must be between <time> and <time>." with clock times in the server's zone (no `<t:…>`), shown under the form and in the notice, the form kept; Report with nothing picked: "Pick the boss or the egg first." (the page's own); a typed nonsense boss through the network panel's "Edit and resend" (`"boss": "zzzz"`): "I do not know a raid boss or tier called \"zzzz\". …" with the backticks taken out.
10. `/raid`'s limit is one: report on the map and with `/raid` on Discord until 20 reports in 15 minutes between them (a scratch script against the dev server, or resends of a report at gyms without raids): the 21st is refused on whichever side, "You can use /raid again in 15 minutes." (429 with `Retry-After` on the map, privately on Discord). End the raids made meanwhile.

## Changing

11. Googer (signed up for the raid of step 5): its popup has "Change…" under the buttons; Tester, not signed up for a raid Googer reported alone, does not see it there until they Join (then it appears with the next refresh). Googer clicks Change…: the raid's section becomes the form (Hatches in / Ends in with Set each, Boss with Set, Moves only once the raid has a boss whose moves are known, Done).
12. Hatches in `30`, Set: the notice says "Done. It hatches at … and ends at …." in clock times; the form closes, the list is asked for at once and the popup shows the new times; the post says "**Googer** (@Googer) set the hatch time: …" in its line. Ends in a clock time: the same with "set the end time".
13. Boss: pick a T5 boss, Set: "The boss is now <boss> (T5)."; the post's picture becomes the boss's after it hatches, its line "set the boss". Then Change… again: Moves now lists the boss's fast and charged moves; pick one fast move, Set: "The moves are now <fast> / ????." and the post shows it; pick both: both.
14. Refusals: Ends in `9pm` (outside the raid): the command's words with clock times, the form kept; Hatches in `cancel`: "A raid keeps its times once it has them. Give the right time instead."; Moves with neither picked: "Pick the fast move, the charged move, or both." (the page's own).
15. Staff: Googer changes a raid Tester reported and Googer is not signed up for: Change… is there (a moderator), and Set goes through. Tester, not signed up, resends a change of Googer's raid from the network panel: 403 "Only members signed up for this raid, and moderators, can change it here."; nothing changes on the post, and the request is not counted.
16. Each command's own limit: eleven Sets of the hatch time within a minute (resends): the eleventh is "You can use /hatch again in 1 minute."; a Boss Set right after it goes through (a window of its own); `/hatch` on Discord in that minute is refused with the same words.
17. A raid that ends while its change form is open (`/delete` on Discord): Set answers "This raid is over." and the marker goes with the next refresh (after Done or closing the popup).
18. While a form is open the map does not redraw under it (step 5 with somebody joining the raid on Discord meanwhile: the form stays; the counts change once it closes). Then, with a form open in a raid's popup and a poll that changed the list meanwhile (somebody joins on Discord, wait 20 s): close the popup with its ×; it does not open again, and the counts change. Again, and this time click another marker instead: only that marker's popup is open, the first does not come back. One form at a time: with a form open, "Change…" in the side panel and "Report raid" elsewhere in the popup are greyed out and do nothing; they are back once the form closes (Cancel, Done, or its popup closed).
19. A forum Tester is kept out of (an overwrite for Tester that denies View Channel on East's forum): Tester's report at a gym of East answers 403 and makes nothing; a change of a raid there (resend) 403, and so are its moves (`/api/raids/<id>/moves` in the address bar); a report at the gym of step 7 with West picked while its raid stands in East 403, and Tester is not signed up for that raid. Remove the overwrite afterwards.
20. The bot's log: one info line "a raid was reported on the map" per report (`user`, `guild`, `gym`, `outcome`) and "a raid was changed on the map" per change (`user`, `guild`, `party`, `change`, `outcome`); no name, no typed text.

## Not staged

- Read-only while Discord cannot be reached (no "Report raid", no "Change…", writes 503): covered by the route tests, as in 8M-3.
- Spawns from the map (spec 3.8): plan 8M-4S, after plan 8D.

## Afterwards

21. End the raids made for the test; put Tester's privacy back; remove the `/want` of step 3 and any overwrite of step 19.

## Left open (to the follow-ups if not settled here)

- Who may change a raid on the map: the commands let anybody in the post change it; the map asks a sign-up or staff (spec 3.6). Whether a member who only sees the raid on the map (not signed up) should be able to correct an obviously wrong time.
- `/raid` has the hole the map's report closes: at a gym that lies in two regions, a report in the region whose forum the member may see joins the raid already standing in the other region's forum, from which they are kept out. Left for a follow-up (the map refuses it, 403).
- The size of the forms on a phone.
