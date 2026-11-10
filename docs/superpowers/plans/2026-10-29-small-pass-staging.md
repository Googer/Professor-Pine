# Staging checklist: the small pass before the cutover (8M-13, 8F-1) and the 8B leftovers

Every step needs Matt's go-ahead. Matt starts the bot and the tunnel. Claude drives Discord and the map in its own tab as Googer on the desktop; Matt's hand is needed on his phone, with Tester, and where a step says so. Run it after 8V-1's checklist (`2026-10-29-phase-8v1-staging.md`), in the same session.

- **Accounts:** Googer (the owner, staff) and Tester (a member with the map's role).
- **Design:** `docs/superpowers/specs/2026-10-29-pre-cutover-small-pass-design.md`. Plans: `2026-10-29-phase-8m13-web-small-fixes.md`, `2026-10-29-phase-8f1-discord-small-fixes.md`.
- **Conventions:** `docs/architecture/web.md`, `parties-and-posts.md`, `screenshots.md`, `wayfarer.md`, `utilities.md`.
- **Devices:** a desktop browser at 1280 pixels; Matt's phone (steps 10, 11, 15, 16 and 26).
- **Writes:** the parties and reports of the steps are made in a region of the test server and ended afterwards; step 19 imports an export with stops changed (the dev database's Wayspots); step 20 runs the bot without a Google key; step 25 takes Embed Links from the bot in one channel for a moment. No migration, no setting, no command change: no deploy.

## Before

0. **The page built, the bot started after it.** Run `npm run web:build`, then start (or restart) the bot: it reads `dist/web/assets.json` and the head script's hash once at startup.
1. **What stands.** As Tester on Discord, in one region: a train of at least four stops with the conductor at its second stop (`/train`, its route), a raid at one of its stops ahead, a loop train where one stands (Manage… › end mode Loop) for step 3.

## The map (8M-13)

2. **A train's direction (T1).** As Googer on the map at zoom 15–16: the arrowheads on the train's legs are larger (24 px) and the legs ahead carry a slow flow in the direction of travel (about one cycle in 2.5 s); the done legs are faint and still. A click on the line still opens the train's popup. Wait for a poll (20 s): the flow does not jump when the train is drawn anew. With the device's reduced motion on (Windows: Settings › Accessibility › Visual effects › Animation effects off; reload), no flow, the larger arrowheads alone.
3. **A loop's closing leg.** On the loop train, the dashed closing leg moves in the direction of travel.
4. **The stops ahead as badges (S7).** At zoom 15 and up, each stop ahead has a small badge in the train's color with its number in the route, set off to the left of the stop like a raid's time badge; the current stop keeps its ring; done stops have none. Zoom to 14: the badges go (ring and line as before); back to 15: they come back. A tap on a badge opens the train's popup. At the stop with the raid: the raid's marker and the gym each open their own popup, also where they lie close to the badge. A gym, PokéStop or Power Spot just west of a stop with a badge (25–100 m at zoom 16) opens its own popup: only the number takes a tap, not the space around it.
5. **Answers without list marks (A1).** As Tester report research of several stops from the map (a task at two or three stops at once): the answer in the band and the answer line lists the stops as "• …" lines, one per stop, no "- ". Split… of a train (as its conductor, Tester) shows its groups' lines with "• ".
6. **Light, Dark, Device (S10).** As Googer: the account menu has "Theme: Light · Dark · Device", Device marked. Pick Dark on a light device: the page and the tiles turn dark at once. Reload: dark from the first paint (no light flash). Pick Light on a dark device (Windows dark mode on): light, also after a reload. Pick Device: the page follows the device's switch again, without a reload. The region editor ("Edit regions") follows the choice too.
7. **The visitor's ⋮.** In a private window, logged out: a ⋮ button beside "Log in" holds only the Theme choice; Dark works and is kept after a reload. The login link's page and the server's answers keep the device's scheme.
8. **Find: misspellings only when nothing else (O1).** As Googer, Find `rocket` (with Rocket reports standing, step 1 of 8V-1's or a `/rocket report`): the reports, no Hockey Rinks or Pocket stops. Find the raid's boss: the raid, no places by a misspelling. Find a stop's name with one letter wrong (`ansus hall` for Ansys Hall, or any name of the region): it is still found, there being nothing else.
9. **What a visitor sees (L1, L2).** In the private window, logged out: the layers list offers only Gyms and Region outlines; the side pane keeps "Official meetups: Campfire". Gyms is off at first. Type a gym's name in "Find a gym": Gyms turns on (ticked in the layers list) and the matches show. Turn Gyms off: the matches go; on: they come back while the text stands. Reload: Gyms stays on (the visitor's choice kept).
10. **The invite on a phone (I1, Matt).** On the phone, logged in as an account not in the server (or Tester out of it for a minute, where the test server allows): the not-a-member line and "Join the server on Discord" stack at the left, the button as wide as its words.
11. **A refusal nudges the phone card (A2, Matt).** On the phone as Tester (not the conductor), open the train's card and press Move…: the conductor's sentence in red, and the card bounces up and back once. With Android's "Remove animations" on: the sentence, no bounce.

## Discord (8F-1)

12. **A timeless Elite egg refused by a tier change (8E-1).** As Tester, `/raid` a Level 5 egg with a hatch time at a gym with no raid, then `/boss` it to the Elite tier (the egg, no boss) and do it with the map's Change… too: both refused with "An Elite egg needs its hatch time: once staff delete this egg, report it again with `/raid` and its hatch time." The egg stays Level 5. A Level 5 egg reported without a hatch time, then `/boss` to an Elite boss: refused with the same words. A Level 5 egg with a hatch time, `/boss` to an Elite boss: taken. A raid reported hatched without a time (`/raid boss:` a Level 5 boss), then `/boss` to the Elite tier: taken (it is not an egg).
13. **A timeless Elite egg refused from a screenshot.** A screenshot of an Elite egg whose countdown is cut off or covered (a crop of a real one, `var/ocr/` has Elite eggs), sent with a mention: "I could not read when this Elite egg hatches: report it with `/raid` and its hatch time." Passively read (where `settings.ocr.passive` is on): nothing is posted. The same screenshot with the countdown readable is reported as before.
14. **A cut Power Spot name that fits other regions (8X-S).** Find a Power Spot of this region whose name's start also starts a spot's name in another region (`/max spot:` lists them). A max battle screenshot whose name is cut there, with a mention: the pick list, this region's spots first, the others with their region's name. The same screenshot read passively: nothing is reported. A cut name that fits only this region's spots is reported at once; a whole name equal to a spot's title too.
15. **The catch CP in a max battle's post.** `/max` a Dynamax boss (and a Gigantamax one where one is listed): the boss's lines end with "**Catch CP** min–max", no weather icons. The numbers equal a CP calculator's at level 20, IVs 10/10/10 and 15/15/15. On the phone too (Matt): the post reads well. A Dynamax train (`/train kind:` Dynamax) after the same boss shows the same catch CP, without a boosted range.
16. **`/help` in paragraphs, a member.** As Tester: `/help raid`, `/help max`, `/help research`, `/help train`: short paragraphs with a blank line between, nothing run together, no paragraph longer than a few lines on the phone (Matt).
17. **`/help` as staff.** As Googer: `/help region` (its `import`), `/help admin` (`setup-forums`), `/help counters`, `/help rocket`: the reworded sentences (plan 8F-1, task 5) read right; the four short texts that were split (`/done`, `/info`, `/admin boss sync`, `/request`) do not look chopped.
18. **`/help` in a DM, and the Apps menu.** The same for one command in a DM with the bot; `/help` of "Report to moderators" (the Apps menu's command) in two paragraphs.
19. **An import that changed only stops (8W-3, Googer).** `/gym import` an export of the test regions with a PokéStop or Power Spot added or removed and no gym changed (a copy of the last export with one stop's line removed; `var/stage/`): the import's answer gives every count; nothing is posted in #bot-updates. An export with a gym renamed: the post comes, with the stop counts in it. The import's answer says the post comes "when gyms changed".

## The 8B leftovers (from the staging run of 2026-10-16)

The Gantt chart's row "Staging of 8B-1 to 8B-4" is gone (Matt, 2026-10-29); these are the steps of it never run since. Their checklists: `2026-10-15-phase-8b1-staging.md`, `2026-10-15-phase-8b4-staging.md`, `2026-10-15-phase-8b2-staging.md`.

20. **8B-4 step 6, a gym without a map.** Start the bot without a Google key for this step (Matt: the key blank in the stage `.env`'s copy, then restored): `/gym show` and `/find-gym` go out without the gallery and read well.
21. **8B-4 step 7, Edit….** On a `/gym show` view, Edit…: the form of `/gym edit` opens filled; change the notice: the answer is a message of its own with the change above the view.
22. **8B-4 step 9, Move….** On the view, Move…: a form "The new place of the gym"; a point a few meters away moves it at once; a point far away asks as `/gym move` does. Move it back.
23. **8B-4 step 14, `/find-gym` (Tester).** The member's view: heading, "Elite raid gym" where it is one, the regions, the map, description, Notice, Raids now with links to the posts.
24. **8B-4 step 21, `/iam` without a role (Tester).** One container "### Your roles on this server", a line of help, each menu under its group's heading; picking a role gives it.
25. **8B-1 step 7, no Embed Links.** Take Embed Links from the bot's role in one region channel; `/wild` there: the report comes as classic text with the warning (or note what Discord does with a v2 message there). Give the permission back.
26. **The phone looks of 8B-2 and 8B-4 (Matt).** On the phone: `/counters`' answer and its dialog, `/rank` and its buttons, `/help`; `/gym show`, `/bounds`, `/find-region`, `/iam`.

## After

27. End the train, the raid, the max battles and the eggs of the steps; restore the export of step 19 (import the last full export again), the Google key of step 20 and the permission of step 25.
