# Phase 8X-3 staging checklist: the max battle (draft)

Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Accounts: Googer (owner, staff) and Tester (a member); a third and fourth account where a step says so (lobbies of 4). Look at the steps marked **phone** on Android and on an iPhone. The design is `docs/superpowers/specs/2026-10-20-max-battles-design.md`; the conventions are `docs/architecture/parties-and-posts.md` ("Max battles"), `moderation.md` ("Max battles at a pin"), `meetup-safety.md`, `notifications-and-dms.md`, `history.md`, `utilities.md`.

## Before

1. **The shared dev database.** This build writes parties at **state version 13**; an older bot cannot read those rows. Check `var/stage/TEST-SERVER-STATE.md`, note that 8X-3 is being staged, and end every party made here (`/delete`, or let them expire) before an older bot starts on the dev database again. **Migration 025** (`PartyHistory.wayspotId`) runs at the bot's start: additive; note in the state file that the dev database is then at 025.
2. Matt deploys the commands (`/max` is new; `/boss`, `/end`, `/meet`, `/where`, `/group`, `/status` and others changed): `set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global`. 8X-1's, 8X-1B's and 8X-2's checklists can run in the same session (8X-2's steps 4 and 5 were rewritten: max battles are always on).
3. Max battles are on without any `maxBattles` block in the stage settings. The dev database's Power Spots are Pittsburgh's from the Wayfarer import (8W staging): check that the test region has some (`/places` or the map's Wayspots).
4. `/admin setup-forums` in the test server: each forum gets the `Max battle` tag; a forum with no room for every tag (Discord allows 20) is named with the tags it lacks.

## Reporting

5. **phone** As Tester, `/max boss:` autocomplete: the week's featured boss first (this week's Max Monday boss), then 5★ down to 1★, Gigantamax last, each choice with its tier ("Machamp · Dynamax 2★"). Typing a boss on no list asks `tier:` ("Which tier? Add `tier:`"). `spot:` offers the region's Power Spots first.
6. `/max boss:<1★ boss> spot:<a Power Spot>` on an ordinary weekday morning: the post's heading `### Dynamax <boss> (1★)`, its picture, "Until 9:00 PM", types and weaknesses; Where `**<spot>** (Power Spot) · <address> · [Map]` with the Wayfarer picture; one group `0/4 coming`; buttons as a raid's but no Set time and no Screenshot feedback, Remote kept. The thread title `Dynamax <boss> (1★) · <spot>`, the `Max battle` tag, the region channel's link line "New max battle: <#post>", the summary's **Max battles** section after the raids.
7. **The default end by the day** (the clock as reported): a Dynamax battle on an ordinary day ends at 21:00; on a Max Monday (06:00–21:00) at the next full hour; during the 2026-10-24 Max Battle Day (14:00–17:00) at the next :00 or :30; reported before 14:00 on 10-24 at 14:00; a Gigantamax battle (Machamp, from `/admin boss add tier:Gigantamax`, or typed) at the next full hour. A report after 21:00 is refused ("Max battles are over for today…"); one before 06:00 ends at 21:00 (or the next rotation counted from 06:00).
8. **phone** **Ending soon:** a report less than 5 minutes before its default end opens the dialog: "Until the next rotation, <time>" first and picked (Android: selected at opening; iPhone: whether Submit works without a tap), then "Until <end> (in n minutes)". OK reports with the chosen end, Cancel makes nothing. At 20:56 (no later rotation): the plain "Report it anyway?". With `end:` typed: no dialog.
9. **One per spot:** a second report at the same spot with the same boss joins the battle ("There is already a max battle against it…", signed up); another boss is refused with the post named and the `/boss` hint; Gigantamax where a Dynamax battle stands is refused without the `/boss` hint. In the post `/boss <another Dynamax boss>` changes the boss and tier; `/boss` to a Gigantamax boss is refused.
10. **A maps link:** within 50 m of a known Power Spot it becomes that spot; elsewhere a pin, "📍 Unlisted power spot" with its Map. The moderators' channel gets a notice in blue: the battle, reported by Tester (named even if anonymous), the pin with its Map, Delete and Go to post. Googer's Delete opens `/delete`'s dialog and closes the battle; the notice then says "Closed by **Googer**" and loses Delete. Another pin battle left to end: the notice turns grey, "This max battle has ended.". Tester's press of Delete is refused. The bot's log line of a pin report names reporter and server.
11. **Blocked at a pin:** Googer blocks Tester from meetups (meetup safety); Tester's `/max` at a new pin is refused (uncounted, no Appeal button); at a known Power Spot it works; at the pin of an existing battle it joins.

## In the post

12. Four accounts Join: all in A (`4/4 coming`); a fifth (or a +1) opens B silently (no line, no ping); B's heading `1/4 coming`. Group… moves a member; a member over the size shows `5/4 · over the lobby size…`.
13. **Meet…** offers the 5-minute times of the next hour, up to the end, and "No meeting time" when one is set; `/meet 20` sets a group's time; every member of that group gets the meeting DM naming "the max battle at <spot>". `/cancel-meet` works.
14. `/end` moves the end earlier and later (within the day, not past 21:00); later at a spot whose time another battle would take is refused. `/where` names the spot as the post does (rename a Wayspot in the database first if convenient); `/request` and `/target` in the post say "A max battle is at a Power Spot, not a gym…".
15. Done completes (not leave); the completion question as for a raid; the post shows "Ended" past its end; the clock warns and archives by the raid rule.
16. `/report` and "Report to moderators" on the post reach the moderators' channel ("Reported max battle", Where the spot); `/delete` by staff has its own wording.
17. **phone** The post with five groups on a phone (the worst case).

## The summary post

17a. **A new summary post (from 8B-1 step 9):** restart the bot first (or make this the first post since the start). Delete the pinned "Active raids" post of a test forum by hand (or run `/admin setup-forums` for a forum that has none), then report a max battle there with `/max`. A v2 "Active raids" post appears and is pinned, the battle under "Max battles". The log says once which way forum posts are made, "forum posts are made as they are" (direct) or "Discord refused a components-v2 first message of a forum post" (made with "Setting up this post…" and edited at once); either way no post that still says "Setting up this post…" is left in the forum. (Since 92e3aa87 a summary record that points at a gone post takes over the bot's open "Active raids" post in the forum instead of making a second one: delete that post by hand to see a new one made.)
17b. **A long list (from 8B-1 step 11):** many raids and max battles in one region (or the test of the 4,000 characters, if the test server cannot have that many): the list is cut short with "…and N more" (the max battles under "Max battles" after the raids), and Discord takes the post.

## Wants and DMs

18. Tester `/want` a species that is a current max boss and ticks its **Dynamax** box in the dialog (since plan 8R-1 a want of the species in raids no longer covers max battles; tick **Gigantamax** too for the Gigantamax step); Googer reports it: Tester's DM "A Dynamax <boss> (n★) battle at <spot>", its small print "You won't be told about more Dynamax <boss> battles for an hour."; a second report of the same boss within the hour sends nothing; a Gigantamax battle of the same species still does. A tier want never fires for a max battle.

## History

19. After a battle ends: in `pine-dev-mysql`, `PartyHistory` has a row of `kind` `max`, `tier` `D1`…`G`, the boss columns, `shiny` true/false, `wayspotId` the spot's Wayfarer id (null for a pin).

## Over the following days

20. **2026-10-24, the Lake Trio Max Battle Day (14:00–17:00):** ask Matt whether Dynamax battles were up at Power Spots before 14:00 (a battle reported that morning ends at 14:00 by default: design Q9's Q-B, provisional). After 17:00: are the trio still listed by Pokebattler (8X-2's step 11), and still offered by `/max` (dropped once the event ended while the event is still known; a restart brings them back: decide then whether to keep the ended events).
21. **2026-11-14/15, Wild Area 2026: Global:** during its hours `/max` lists the Gigantamax bosses first; a Gigantamax battle's default end is the next full hour. GO Fest's ScrapedDuck type is a guess (`pokemon-go-fest`): check when it appears.

## After

22. End every party made here; update `var/stage/TEST-SERVER-STATE.md` (state version 13, migration 025); record the results in the follow-ups file ("From the staging run of 8X-3").
