# Phase 8M-8A staging checklist: a party's popup is its post

Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude drives Discord and the map in its own tab, Matt the phone steps.

- **Accounts:** Googer (owner, staff) and Tester (a member).
- **Brief:** `.superpowers/sdd/2026-10-26-phase-8m8a-post-popups/design.md`.
- **Design:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("A party's popup is its post", "After the builder check").
- **Conventions:** `docs/architecture/web.md` ("A party's popup is its post").
- **Devices:** a desktop browser (light and dark), an Android phone and an iPhone if at hand, each through Discord's in-app browser and the phone's own browser.
- **Compare with Discord:** for each kind, the post open on Discord beside the popup: the same lines, names, buttons and colors, in the same order.

## Before

0. **The page built, the bot started after it.** `npm run web:build`, then start (or restart) the bot: the bot serves the map's page from `dist/web/assets/` and reads `dist/web/assets.json` once at startup (2026-10-26: a bot started without it served the page of before 8M-7).
1. **No migration, no command option change:** no deploy needed. `settings.web.publicUrl` is `https://dev.example.com` and the tunnel `pine-dev` runs. The application's emoji are uploaded (`npm run emoji:upload` was run before; nothing new here).
2. **Parties to see:** Googer reports a hatched raid with its boss at a gym with a Wayfarer picture and an egg at another; Tester joins the hatched one with a +1 and Remote. A raid from a screenshot whose time is a guess (an old screenshot through `/raid screenshot:`). A max battle at a Power Spot. A train with five stops at its second, and a group split off it (`Split…` on Discord) so that one post links the other. A meetup at a dropped pin. Two raids at one gym (a standard and an elite one): since plan 8E a gym takes one raid of any kind, so make the pair as raids stored before plan 8E are. On the **dev database only**: report the elite raid (an Elite egg needs its hatch time since review 8E-1) at another gym of the same region, stop the bot, find the two raids' ids and gyms, then move the elite raid to the standard raid's gym (in cmd; the dev container's MySQL user and schema are both `pine`; the password is asked for):

   ```
   docker exec -it pine-dev-mysql mysql -u pine -p pine -e "select id, gymId, json_unquote(json_extract(state, '$.raid.tier.level')) as tier from Party where status = 'active' and type = 'raid'"
   ```

   ```
   docker exec -it pine-dev-mysql mysql -u pine -p pine -e "update Party set gymId = <the standard raid's gymId> where id = '<the elite raid's id>'"
   ```

   Start the bot again. It draws every post anew: the elite raid's post's Where names the standard raid's gym. Its title (`Elite egg · <gym>`) follows when the post is drawn anew; Discord allows two renames in ten minutes, so a title that still names the old gym is renamed at a later redraw (a `/hatch` in the post draws it at once): no finding while the Where is right.
3. **After a restart:** the bot shows every post anew, paced, after the first good read of the application's emoji, whatever it found (also with no emoji uploaded); for the first seconds a popup is the map's own summary (no post yet), then the post. Where that first read failed (Discord away at the start), the posts are shown anew only at the next good read, the hourly upkeep: until then the popups are the map's summaries.

## The post on the map (desktop)

4. **A hatched raid.** Click its marker: the popup is the post: its heading, its times in your own zone ("Ends in 12 minutes, at 2:40 PM"), its weaknesses with the type icons, catch CP with the weather icons, the moves, Where with the gym's picture beside it and the Map link, the trainers by team with the team icons ("Coming (3): Ash +1, Misty"), the remote mark, the meeting hint, the buttons in Discord's colors with their icons, "Reported by Googer". The edge is the raid's green. Compare with the post on Discord.
5. **Names.** Tester's name and Googer's are as the post shows them; a member the bot has no name for reads "unknown member"; nobody's id is anywhere (view the page's source of the post's answer in the browser's network tab).
6. **An egg.** Yellow edge, "Hatches in …", "Hatches as …" when the boss is known, the egg's picture beside the heading.
7. **The screenshot's raid.** The note that the times are a guess with `/hatch` and `/end` in code, and "Reported from a screenshot · feedback on Discord →" in the place of Screenshot feedback; it opens the post on Discord.
8. **A max battle (the JSON only).** Max battles are drawn on the map in 8M-9: open `/s/<guild>/api/parties/<id>/post?k=<its postKey from /api/parties>` in the browser and check the JSON: accent `max`, the heading `Dynamax …`, Types and Weaknesses, the Power Spot under Where with its picture's Pine address.
9. **The train.** Its blue edge, "Where · stop 2 of 5", the small print of the next stops, "Split off from" or "went its own way" linking the other train's post by its title; the third row Group… · Move… · Manage… · Split… · Route.
10. **The meetup.** At its pin, "Meeting Information" as written, "Created by …".
11. **Two raids at one gym.** The popup lists both raids by their headings and times; a choice shows its post with "← All raids here"; back lists them again. Under a gym that shows a raid there is "Report spawn here" and "Meetup here", no "Report raid".
11a. **No jump.** Reload, then open a raid's popup at once: it opens with its post drawn (asked ahead), and does not move or pan when anything of it comes later; hover a line of the list, then click it: the same.
12. **Light and dark.** Switch the device: the post follows, its edge keeps the post's color.
13. **Times tick.** Leave a popup open two minutes: "Ends in 12 minutes" counts down.

## The buttons

14. **Statuses.** As Tester, press Interested, Join (the blurple runner), Here (green) and Leave (red) in the post: each does what the post's button does on Discord, the post on Discord changes, the popup follows within seconds. Done is off on an egg, Leave off for somebody not signed up.
15. **Remote.** Toggles, "You: Coming · remote" under the post, as on Discord.
16. **A newcomer in several groups.** With two groups, as a member not signed up: the "Which group?" menu is in the member's part; Join puts them in the group chosen; Group… goes to that menu.
17. **Set time….** On a raid without times, as Tester signed up (or staff): the change form opens in the popup; as anybody else: "Do this on Discord →" under the buttons, linking the post.
18. **On Discord.** −1, +1, Meet… and Split… show "Do this on Discord →" with the post's link; nothing is sent.
19. **Move… and Manage….** As the train's conductor: Move… opens the moves panel in place of the buttons, Done brings them back; Manage… shows the conductor's buttons ("Be the conductor") and the kind's line on Discord; Route shows the stop list, the train's stop marked. Opened, they stay open when the list comes again (wait 20 s). As Tester, with Googer the conductor: Move… says "Only the conductor or staff can move the train."; wait for the next list with the line open after Googer gives up the role: it says "Sign up for the train to move it." (or nothing, signed up). As the conductor of a train whose route was cleared (`/route clear`) while the post still shows Move…: "The train has no route yet: add a stop first."
19a. **Times in another zone.** With the computer set to another time zone (Pacific, or India), the raid report and change forms, the New train and New meetup forms say "Clock times are read in the server's zone (Eastern)." under their times, and the meetup editor "Starts now: 6:00 PM (Eastern)"; the posts show times in the computer's zone.
20. **Change… and Edit….** A raid's Change… (boss, moves, times) and a meetup's Edit… still work from the member's part.

## Pictures

21. **Emoji.** The status, type, weather and team icons are pictures (`/emoji/<id>.png` in the network tab, not Discord's CDN), a day's cache aside; an emoji the application lacks shows its plain one or `:name:`.
22. **Places.** The gym's and Power Spot's Wayfarer pictures come from `/s/<guild>/pictures/…`, never from Google; the page's CSP refuses nothing (the browser's console is clean).
22a. **Barred.** Bar Tester from West's forum (an overwrite on the forum): Tester's `/api/parties` leaves West's parties out, and the post's address and the gym picture's address of one of them (copied from Googer's network tab) answer 404 for Tester. A split train whose other train is in a forum Tester is barred from names it "another post".

## The map's line

23. **Distance.** With your location shown ("Show where I am"), the line under the post says how far ("0.4 mi"), then Directions (Google Maps' route) and Open on Discord (the post, in the app).

## The phone card

24. **A party on a phone (360–414 px).** Tap a raid: a card docks at the bottom with the post's heading, picture, times and boss, the first row of buttons, "You: …" and the line; nothing else.
25. **The whole post.** Tap "Show the whole post" or swipe the card up: the whole post, scrolling inside the card; swipe down: the summary again; swipe down once more, tap the map, or ×: it closes.
26. **From the list.** List → a line: the map comes back at the party with the same card.
27. **Buttons in the card.** Join and Leave work from the summary; Set time… opens its form in the card. Close the card with the form open (×, a tap on the map): then open another raid and press Report spawn here or Set time…: it opens (nothing stays held), and the map's lists come again.
27a. **The card's manners.** A swipe up does not also toggle back; the marker tapped is above the card, not under it; with a keyboard (an iPad's), Escape in a field outside the card leaves the card open.
28. **Light and dark** on the phone, Discord's in-app browser and the phone's own.

## The list

29. **Focus.** With a keyboard, focus a line of the list, then end its party on Discord (`/delete`): after the next poll the focus is on the list's sort, not lost.
