# Phase 8M-11A staging checklist: answers and small fixes of the web map

Every step needs Matt's go-ahead. Matt starts the bot and the tunnel. Claude drives Discord and the map in its own tab; Tester is on Matt's phone.

- **Accounts:** Googer (the owner, staff) and Tester (a member, no staff role).
- **Brief:** `.superpowers/sdd/2026-10-28-phase-8m11a-answers-small-fixes/design.md`.
- **Design:** `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md` ("8M-11A: answers and small fixes", "Matt's answers").
- **Conventions:** `docs/architecture/web.md` ("The fix pass: answers and small fixes (plan 8M-11A)").
- **Devices:** a desktop browser, light and dark, at 1280 and 1024 pixels; Matt's phone (a coarse pointer, the phone card).
- **Findings:** each step names the finding it closes (S1 to S28, follow-ups "From the staging run of the web polish").

## Before

0. **The page built, the bot started after it.**
   - Run `npm run web:build`, then start (or restart) the bot.
   - No migration, no setting and no command change, so no deploy.
   - The train emoji is optional: `npm run emoji:upload` (a dry run) lists `pinetrain`, and only `--apply` uploads it. That needs Matt's own go-ahead; step 24 says what shows without it.
1. **Parties to press.** Report a raid at a gym:
   - Googer and Tester both signed up, in two groups (Group… "A new group" on Discord);
   - a meetup at the same gym, for S2 and S4;
   - a train with a route of three stops, Googer conducting.

## A press shows its own result at once (S1)

2. **The popup follows the press.** As Tester on the desktop, open the raid's popup and press Join, then Interested, then Leave.
   - Each time the buttons are off until the answer comes.
   - The post in the popup shows the change as soon as the answer is there, not one change behind.
   - Do it again quickly (a burst): the answer may take up to about 2 s and then shows the change. Nothing waits past 5 s.
3. **The other changes.** Each of these shows its change in the popup when its answer comes:
   - Group… (move to the other group);
   - Meet… (set a time);
   - the raid's Change… (the end time);
   - a meetup's Edit… (its name);
   - the train's Move… (Next), Manage… (Keep, another kind) and its route editor (add a stop);
   - "Be the conductor" as Tester.

   A refusal (step 7's Move… as Tester) answers at once.

## Answers where the member looks (S9, S20, S21, S17)

4. **The answer line.** After each press of step 2, the answer is under the post's buttons in the popup (blue-gray), never in a band at the top. It stays across the next poll (20 s) for 10 s, then goes.
5. **Done is off on an egg.** As Tester, Done on the egg's post on the map is off (it cannot be pressed), so no refusal is pressed here: a refusal and its shake are step 7's. With the device's reduced motion on (Windows: Settings › Accessibility › Visual effects › Animation effects off), step 7's line shows and nothing shakes. (Corrected by plan 8M-13.)
6. **On the phone.** As Tester on the phone, the same presses in the phone card, in its summary too. The answer is under the first row of buttons, visible without opening the whole post. A refusal (step 7's Move…) bounces the card up and back once (plan 8M-13, A2; with reduced motion, also Android's "Remove animations", it stays still).
7. **Move… refused.** As Tester (not the conductor), press the train's Move…: the conductor's sentence in red in the answer line, and the popup shakes. There is no "Do this on Discord" line.
8. **"Start a new group" as a note.** As a member alone in a plain group of a raid of one group, press Group…: in the post's place a box says "A new group is started on Discord.", with the button "Open the post on Discord" (it opens the post in a new tab) and Back (and Escape) putting the post back.
9. **The completion question.** As Tester present at a hatched raid, wait for the completion question.
   - It is drawn in the post above its buttons, in the answer line's look.
   - On the phone with the card in its summary: the question shows, and the card's handle has a red dot.
   - "Yes, done" answers in the answer line.
10. **Meet… after the group changed.** Tester is signed up in a raid of two groups. Nobody else can move Tester, so Tester moves themself between opening Meet… and its Submit.
    - The map: Tester opens Meet… on the desktop map; then, on the phone, presses Group… on the Discord post and moves to the other group; then Submits Meet… on the map. The form closes, and the answer line says "Group A has changed since: press Meet… again." (with Tester's first group's letter).
    - Discord: Tester opens Meet…'s dialog on the phone; then, on the desktop map, moves to the other group with Group…; then Submits the dialog. It says "Group A has changed since: press ⏰ again." (or with the meet icon).
11. **The notice band.**
    - Report a spawn on the map: its answer in the band over the top of the map, which does not push the layers' row or the map down.
    - It goes away by itself after 10 s; a second report starts the 10 s again; × hides it at once.
    - A research report of several stops reads as lines in the band, not with " - " (S17).

## The map's small fixes

12. **S2.** At the gym of the raid and the meetup, zoomed to 15: the raid's time badge is drawn over the meetup's ring. A click on the ring's line still opens the list of things there.
13. **S3.** On the phone, open a plain PokéStop's popup: its × is a large target (44 px), and the content starts under it.
14. **S4.** Tap the gym of the raid and the meetup: the list is headed with the gym's name, not "Here". With a meetup at a pin and nothing named there, it says "Here".
15. **S5.** A raid without times: the badge says "Egg" or "Hatched"; an ended one says "Ended". The list says the same, capitalized.
16. **S11.** In the list on the desktop, Tab to a raid's line and let the raid end (or have Googer `/delete` it). After the next poll, the focus is on the sort, not on the page (Tab goes on from the sort).
17. **S16.** Escape closes each of these as Cancel does, and the popup under it stays open:
    - the raid's report form and Change…;
    - Report → Max battle's form, a spawn's form, the research form and the Rocket form;
    - a new meetup's form and a meetup's Edit…;
    - New train's form;
    - Group…, Meet… and the note box.
18. **S22.** The side pane is headed "What's going on · n". Logged out, the pane says "What's going on" and "Log in to see what is going on.".

## Times (S6, S19, S28)

19. **One wording.**
    - A train starting in about a day: its post on the map says "in a day" where Discord says "in a day", not "in 24 hours".
    - A raid with 29 minutes and some seconds left: the list says "29 min left" (or 30) and the post "in 29 minutes" (or 30), alike.
    - The badge says "17 min" or "1 h 05", and in metric the list says "17 min left" beside "410 m": minutes never "m".

## Research (S18, S26)

20. **S18.** With research reported at two stops (one a "one of"), press "Same task at more stops…" on one of them, then Add stops… in a new report of the same task: the nearest stops listed leave out the stops that hold that task already. On Discord, `/research report` "Same task at more stops…" leaves out the same stops.
21. **S26.** In "Same task at more stops…", press "Change task": the task list, with the report's task and reward picked; pick another and report. In a contradiction question (Tester reports another task at Googer's stop), "Change task" brings the list back with the task kept.

## Nearest places and icons

22. **Nearest Power Spots and stops.** Report → Max battle with the map zoomed so that fewer than five Power Spots are in view: step 2 lists the five nearest of your location (or the map's middle) wherever they are, nearest first. The same for Report → Field research and Team GO Rocket with PokéStops.
23. **S14, the Report menu.** Open Report in light and dark, at 1280 and on the phone:
    - Raid: the game's raid head, not haloed in dark.
    - Max battle: the game's Dynamax icon in Dynamax pink.
    - Field research: the quest symbol, as before.
    - Team GO Rocket: the R, as before.
    - Wild spawn: Campfire's Poké Ball, red in light and white in dark.
    - Train: Pine's train C3b in orange.
    - Meetup: the game's calendar in purple.

    In dark there is no light halo on the masks or the raid head; the train has none in light either. In devtools' network `/icons/dynamax.png` is answered 200, and nothing is loaded from the wiki.
24. **The train emoji (only after an upload Matt allowed).** The board's "Today and coming up" lists each train with the train emoji before its name. A member who asked for new trains gets a DM whose train name starts with it. The post's buttons are as before. Without the upload, both read as before.

## The start

25. **The start log.** With `settings.channels.moderation` unset (a run with the stage settings changed and put back), the bot's log says "meetup safety is off" once, not once per server.

## After

26. **Back to how it was.** End the test parties (or let them end), put back any setting changed for step 25, and give the device's reduced motion back.
