# Phase 8R-6 staging checklist: pictures at the stops (draft)

Every step needs Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab.

- **Accounts:** Googer (owner, staff) and Tester (a member).
- **Plan:** `2026-10-24-phase-8r6-stop-pictures.md`.
- **Design:** `docs/superpowers/specs/2026-10-23-stop-pictures-design.md` and its mockups.
- **Conventions:** `docs/architecture/stop-reports.md`, "Pictures at the stops (plan 8R-6)".

The tasks and lineups are Leek Duck's on the day. The steps need:
- a task with two or more encounters;
- a task with an item reward;
- a water grunt, whose two lineups differ;
- a leader.

Note the ones used.

## Before

1. **No migration, and no command option change:** only help texts and autocomplete values change, so no deploy is needed for this plan.
   - The pictures are served by the bot's web server at its public address (`settings.web.publicUrl`, the tunnel).
   - Without the tunnel, every picture names the feed's own address, cropped as before (step 15).
   - The pictures are kept in `var/pictures/`. Note whether the folder is empty at the start.

## The post "Today's Stops"

2. **The name.** The post's heading reads "Today's Stops", and so does a second message's "continued" line. The summary post links "Today's Stops".
3. **A picture per reward line.** Tester reports a task's Pokémon reward at one stop, and Googer reports another Pokémon reward of the same task at another stop.
   - The block shows the task's text as a line, then each version with its own thumbnail beside it.
   - Every picture is square and uncropped. Larvitar keeps its head and feet.
   - The thumbnails' address is `<publicUrl>/pictures/<key>.png?v=…`.
4. **"One of".** Report "one of" a task's encounters at a third stop. Its line carries the game's encounter picture (the Poké Ball with a question mark), padded.
5. **Items.** Report a task with an item reward (Rare Candy). Its line carries the item's picture, padded.
6. **Hideouts.**
   - Report Cliff (or the leader of the day) at a stop: the post's hideout shows the leader's portrait, and the text says what can be caught.
   - Report Giovanni if a lineup has him: his portrait.
   - Report a decoy: its catch (Bellsprout), or the encounter picture when its lineup has more than one catch.

## Direct messages

7. **Research.** Tester wants one of a "one of" task's encounters.
   - Googer reports "one of": Tester's DM has the encounter picture.
   - Googer then narrows it to Tester's Pokémon: the confirmation DM has that Pokémon.
   - A reward reported directly gives a DM with that reward's picture.
8. **The reason line.** Tester wants Rare Candy (research). Report it: the DM's reason reads "Rare Candy · Research" (no longer "Rare Candy (research)").
9. **Rocket.** Tester wants the water grunts and Cliff.
   - A water grunt "not sure which": the encounter picture.
   - A lineup with one possible catch, if there is one today: that Pokémon.
   - Cliff: his portrait.

## The grunt message

10. **One picture.** Report a grunt.
    - Its message in the region channel has one thumbnail beside the heading, by the rule above, and no gallery.
    - "Catch one of …" is in the text.
    - The stop's Wayfarer photo stays beside "Where".
11. **Narrowing in place.** Report the water grunt "not sure which", then one of its lineups at the same stop.
    - The message is edited and takes the lineup's picture.
    - The DMs already sent stay as they were.
    - The answer says "Changed in #…" (no longer "Posted in").

## The small fixes

12. **The answer's words.** A research report's answer, and a hideout's, say `In the post "Today's Stops" of #…`, with no "pinned". This includes #squirrelbreeze, if the bot is again kept from pinning there.
13. **Search.**
    - `/want` with `rocket` typed lists "Team GO Rocket" before Rowlet.
    - `/want` with `dark` typed lists Darkrai, then the Dark-type grunt.
    - `/research report task:` with `one of` typed lists the "one of" choices.
14. **"Already reported" is given back.** Googer reports a task at a stop where it is already reported, three times. Each answer is "Already reported".
    - Googer can still make 10 new reports in the half hour.
    - The help of `/research report` and `/rocket report` says that up to 10 answers of "Already reported" in that time do not count.
    - On the map's POST (with curl and a session), an "already" answer is not counted either.

## Serving

15. **Without a public address**, optional (other stage settings, `web.publicUrl` local, then a restart): the pictures name the feeds' own addresses, cropped as before, and nothing is fetched into `var/pictures/`.
16. **A restart** with the tunnel: the bot reads `var/pictures/` back, and the post's pictures keep their addresses. The log shows no new fetches for pictures kept within 7 days.
17. **The map.** `GET /api/stop-reports` gives a hideout's picture as the portrait's square from `/pictures/…`. The map's page shows it, if the page is reachable.

## A research period that changes mid-day (made-up events feed)

Follow-ups, "From the staging run of 8R-1 to 8R-5", "Not staged: a research period that changes mid-day". Before these steps:
- Claude writes a staging tool in `var/stage/` that copies ScrapedDuck's `events.json` and adds an invented event flagged `hasFieldResearchTasks`.
- It is served on 127.0.0.1, and the stage settings' `raidEvents.url` points at it. Restart the bot so the feed is read.

18. **An intra-day window** (the invented event starts about 10 minutes ahead and lasts 30 minutes). The day's research is reported at some stops before it starts.
    - At the start, the post is drawn anew: the event's line, then the reports made under the window with pictures, then the hideouts, then "Back at <time>, after <event>" with the day's tasks and stops as text, without pictures.
    - The summary reads "… · 13 tasks back at <time>" (with the real counts).
    - `/research report` during the window reports into the window.
19. **The window ends.** The post is drawn anew at the end: the window's reports are gone, and the day's research is back as the normal post, with pictures.
20. **A big event's daily hours,** optional: the invented event is of a big event type, over two days with hours that end before midnight. Step 18 holds within its hours on each day.
21. **A rotation:** an invented event that crosses midnight, started now. At its start the day's reports go for good, and the post shows the event's period with its "until" in the answers.
22. **After:** point `raidEvents.url` back at ScrapedDuck, restart, and delete the invented events' rows from the dev database (the bot keeps the research events it has seen).

## Not staged here

- **A busy day** (pictures dropped step by step before any task is cut) needs dozens of tasks reported. The unit tests cover it (`stop-post.test.ts`, the reviewer's cases).
- **A picture that is gone** (Leek Duck answering 404) cannot be made on purpose against the real CDN. The unit tests cover it.
