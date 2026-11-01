# Phase 8R-1 staging checklist: stops of Pine's own and field research (draft)

Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Accounts: Googer (owner, staff) and Tester (a member). The conventions are `docs/architecture/stop-reports.md` and `notifications-and-dms.md` (wants). The task list is Leek Duck's page as it is on the day: pick tasks from what `/research report` offers.

## Before

1. This build includes max battles through 8X-5 (migration 026) and 8R-1's migration **027**: run `npm run migrate` (or let the bot migrate at start) on the dev database, which must be at 026 first. Matt deploys the commands (`/pokestop` and `/research` new; `/want` loses `type`): `set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global`.
2. Give the bot's role **Pin Messages** in two region channels (East and West, say) and not in a third, to see both sides. `cutover-check` (only with Matt's go-ahead: it reads Discord) warns about the third.
3. The log at start has the task list read from Leek Duck (or taken from the database) and no "the events feed has no research flags" warning.

## Stops of Pine's own

4. Googer, `/pokestop add name:Test Sponsored Stop at:<coordinates in East, away from any stop>`: added; `/wild near:` and `/meetup` find it by name; a stop search in `/research report` offers it.
5. `/pokestop add` with coordinates within 30 m of an imported stop: "Add anyway?" names the stop near; Cancel adds nothing, Add adds it. Coordinates outside every region of the server: refused.
6a. Seed the sponsored stops on the dev database (database only, no Discord): `npm run stops:seed -- ../../../var/sponsored-export/sponsored-stops.csv --server <TEST_GUILD_ID>` (a dry run: each row added or skipped and why; the paths from the main checkout differ), then with `--apply`; a second run adds nothing; restart the bot and find one of them in `/research report`'s stop search. Test server regions that are not Pittsburgh's skip most rows as outside every region.
6. `/pokestop edit` (name, address, `address:-` clears it) and `/pokestop remove`: the search follows at once. Tester does not see `/pokestop` in `/help`.

## Research reports

7. Tester, `/research report task:<a listed task> stop:<an East stop>`: the private answer names the stop and "until midnight", offers "Same task at more stops…" and Take back. In East's channel a post "Today at the stops" appears, pinned, Discord's "pinned a message" notice deleted.
8. The same with `stop2:` … `stop5:` (five stops, one in West): East's and West's posts each show their stops; the answer names all five.
9. "Same task at more stops…": the menu lists up to 25 stops within 2 km without this task; picking three adds them; the post updates within a few seconds. Counted against the throttle (10 in 30 minutes, settings).
10. Googer reports another task at one of Tester's stops: the post moves the stop to the new task; Tester's old answer's Take back now says the report "was replaced by a newer one"; the new report stands.
11. `/research remove stop:` by Tester on Googer's report: refused (not theirs); by Googer: taken back.
12. A typed task not on the list (`task:Spin 3 stops` typed in full) with `reward:Rare Candy`: shown in the post through plain text; another member wanting Rare Candy is DMed (step 16).
13. In the channel without Pin Messages: the post is sent unpinned; the log says so once.
14. A day with many reports (or a test server with small limits): a second message of the post; "…and N more stops" under a full task.

## The want dialog

15. Tester, `/want target:Dratini`: a dialog "Dratini: what for?" with only the boxes that can happen (Raids, Spawns, Research, Shadow; Dynamax only if Dratini can Dynamax). Tick Research and Shadow; Submit. `/want target:Dratini` again: those boxes **pre-ticked on Android and on iPhone** (the design's staging step); untick everything: the want is removed. The dialog opens without "That took me too long" (three seconds).
16. Tester, `/want target:Rare Candy` (an item of the task list) and a Mega Energy: written at once, no dialog. `/wants` lists each target once with its boxes. Googer reports a task with that reward: Tester gets one DM naming the stops, "one of N" where drawn, until when, and a link to the pinned message holding the task; Googer (the reporter) gets none.
17. Googer adds two more stops of the same task: Tester's second DM names only the new stops. Reporting the same task at the same stop again sends nothing.
18. `/want target:<a max battle boss>`: Dynamax (or Gigantamax) box shown; ticked, a `/max` report of that boss DMs Tester; a species want without the box does not (8X-3 staging step 18 now ticks the box).
19. `/want target:T5`: Raids / Shadow raids. `/want target:` perfect IVs: no dialog. `/unwant`, `/unwant-all` and a DM's Stop button take the new boxes off.
20. `/settings show` counts the targets of both kinds.

## Periods and the day's end

21. Before midnight: the post stands; after midnight (or a restart the next day) it is unpinned and deleted, and a report of the new day makes a new one.
22. On 2026-11-09 (Into the Wild): reports before 10:00 end at 10:00; from 10:00 the post shows the event's tasks, renewed at each midnight; after 20:00 on 11-13 the day's research. Check whether Leek Duck's research page lists the event's tasks while it runs (design 4.1's open item).
23. On 2026-11-21 (Pawniard Community Day, 14:00–17:00): the day's reports wait under "The day's research comes back at 17:00"; at 17:00 they come back unchanged.

## Rehearsal mode

24. With rehearsal mode on: `/research report` answers without naming a pinned post; no post is made; DMs go only to the allowlist and carry no link.

## After

25. Record the results in the follow-ups file ("From the staging run of 8R-1").
