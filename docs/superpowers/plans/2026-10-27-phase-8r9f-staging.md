# Phase 8R-9F staging checklist: the region's board takes commands (draft)

Since plan 8R-9H (2026-10-27) Pine's mark on the board is a slowmode of 45 seconds, not 6 hours; the steps below say 45 seconds, and step 33 checks that the old 6 hours is moved.

**The next run** (after the run of 2026-10-27, follow-ups "From the staging run of 8R-9F and 8R-9G"): the steps left are 17, the second half of 21 (the network cut), 26, 29, 32 and 33. West's board is open with the old 6 hours on the test server, so the new build's start draw moves it to 45 seconds and it stays open: the open half of step 33, seen at the start (the post's settings say "Slowmode: 45s"; the log has no `could not move the board’s slowmode to its mark`). Steps 3, 5 and 6 describe the first run. **Run 2026-10-27 (with 8B-L):** 33 passes open and locked, and a remade board gets 45 s (29's 8R-9H part); West's board was at 5 s at the start, so the start's move was not seen. **Run 2026-10-28:** 32, 29, 26, 17 and the second half of 21 pass: every step has run. For 17 the bot cannot make a webhook: Googer makes one in the forum's Integrations and posts with it outside Discord's page. For 21 the laptop's network is cut while Tester writes from a phone on mobile data. Results: follow-ups, "From the staging run of 8R-9H and 8B-L".

Every step needs Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab.

- **Accounts:** Googer (owner, staff) and Tester (a member, without Manage Messages). Tester is the only member account: the steps that have Tester write more than once in the board need the short slowmode of step 10 (review W1).
- **Plan:** `2026-10-27-phase-8r9f-region-board-commands.md`.
- **Design:** `docs/superpowers/specs/2026-10-27-region-board-commands-design.md` (its review B1–B11, Matt's Q1–Q3 and the answers R1–R3).
- **Conventions:** `docs/architecture/parties-and-posts.md`, "The region's board" and "What members write in the board"; `docs/architecture/stop-reports.md`, "Today’s Stops" on the region's board; `docs/architecture/screenshots.md`, "In the board".

The steps use two regions of the test server, called West and East below (note which). On the first run West's board is the one 8R-9's staging left (locked, without slowmode); on the next run it is open with the old 6 hours (above). Note the tasks, times and messages used.

## Before

1. **The commands.** `/research` and `/rocket` changed their help only, and `/admin setup-forums` its words and help (not its description): no deploy is needed. If one is made anyway:

   ```
   set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global
   ```

2. **The database.** No migration. Check `var/stage/TEST-SERVER-STATE.md` and note that 8R-9F is being staged.
3. **What the switch meets.** Before the new build starts, note that West's and East's boards are locked (Discord's "This post is locked" line), with no slowmode (the post's settings), as 8R-9 left them (first run; on the next run note West's board open with 6 hours instead).
4. **Permissions.** The bot's role has Manage Messages in the server (or in the regions' forums); note where it comes from (step 30 takes it away).
5. **East's own slowmode** (review F2). Before the new build starts, Googer sets East's locked board's own slowmode to 60 seconds by hand (the post's settings, "Slowmode"). A forum's default post slowmode applies only to posts made after it, and East's board dates from 8R-9, so the post's own setting stands in for it. (First run only: on the next run East's board is left as it is.)

## Opened once (R2)

6. Start the new build. The first draw of West's summary (a report there, or the midnight or catch-up redraw) unlocks West's board and gives it a slowmode of 45 seconds (the post's settings: "Slowmode: 45s", a value Discord's menu does not offer); it stays pinned. (On the next run the board is open with the old 6 hours: the start's draw moves it to 45 seconds and leaves it open, as above.)
7. `/admin setup-forums` as Googer: East's board, locked with its 60 seconds, is opened all the same and given 45 seconds (60 seconds is no mark of Pine's); each region's line says its forum is ready and nothing about the board. (A moderator who locks a board and also clears its slowmode has it opened again at the next draw: accepted; a moderator keeps the slowmode to keep it locked.)
8. **A moderator's lock stays.** Googer locks West's board by hand. A report in West draws the stops (and edits the summary): the board stays locked, and the stops are drawn as before (the bot has Manage Posts). `/admin setup-forums`: West's line says `the board is locked, so members cannot use commands in it (a moderator locked it; unlock it to let them)`. Googer unlocks it again; nothing more is said.
9. **A new board.** Googer deletes East's board post. The next report in East makes it anew: pinned, unlocked, slowmode 45 seconds; the stops are drawn in it.
10. **A short slowmode for the staging** (review W1). With 45 seconds Tester could write in the board once in 45 seconds, and a deleted message does not give the cooldown back, so the steps below would wait after each message. Googer sets West's board's own slowmode to 5 seconds (the post's settings). Check: a report in West draws the stops and edits the summary, and the board keeps its 5 seconds (Pine leaves an open board with another slowmode alone, `openOnce`). Step 32 puts the 45 seconds back and checks them.

## Commands in the board

11. **Slash commands.** Tester, in West's board: `/research report` of a task at a West stop, `/rocket report` of a leader, `/status`, `/help`. Each answers privately as in the region's channel; the board shows the task and the hideout in "Today’s Stops" within a few seconds. `/research` and `/rocket` find the region through the forum.
12. **Slowmode does not hold commands or the bot** (B4): Tester uses three commands in a row in the board, within the 5 seconds: none is held. The bot's stops messages are sent and edited as before. (Discord holding a member's second message, and commands during a member's own cooldown, are checked with the 45 seconds in step 32.)
13. **Public answers** (B11): no command used in the board posts anything there; `/wild` from the board posts its spawn report in West's text channel.

## What members write in the board

14. **Deleted at once** (B3): Tester writes "hello" in West's board. It is gone within a second or two. Tester gets a DM: `I deleted your message in #…: the board keeps only my lists of what is on. Chat in #west, or report with a command such as /raid, /research or /rocket, there or in the board.`
15. **Once a day** (Q2): Tester writes again, after the 5 seconds: deleted, no second DM the same day. A DM again after midnight (with steps of the next day, optional).
16. **A moderator's message stays** (Q1): Googer writes a message in West's board: it stays. A report that sends a stops message anew (the post growing a message) sends it below Googer's: Googer's message stays above the re-sent stops (B5, accepted).
17. **Another application.** A webhook or another bot of the test server (if one is at hand) writes in the board: deleted, no DM (B3).
18. **Discord's own messages.** Googer renames West's board post (the post's settings, its title): Discord writes its own "changed the post title" message in the board. It is left alone; nothing in the log about it. Googer renames the post back to `Today and coming up`.
19. **Reactions** (plan 8R-9G): Tester adds a reaction to the summary, one to a message of "Today’s Stops", and one to a message in a raid post's chat in West's forum. Pine has no reaction intent, so all three stay for now. Googer reports a raid in West (the summary changes) and a research task (the stops' message changes): the reactions on the summary and on the stops' message are gone after those edits. Tester reacts to the summary again; Matt restarts the bot: after the start's sweep the reaction is gone. The reaction in the raid post's chat stays throughout. (Without Manage Messages in the forum the reactions stay, and the log says `could not remove the reactions on a message in the board` at most twice per board: once from the edits, once from the sweep.)
20. **The pin check** (B7): Googer archives West's board; Tester writes in it (which opens it, unpinned). The message is deleted, the board stays open, and it is pinned again within a few seconds.
21. **A stopped bot** (B6): stop the bot. Tester writes two messages in West's board, 5 seconds apart. Start the bot: both are deleted at start (one bulk delete in the log's REST, if visible), Tester gets one DM. Then cut the network for a minute (as in 8X-H's staging) while Tester writes a message: it is deleted once the gateway is back. A short cut usually ends in a gateway resume, which replays the `MESSAGE_CREATE`, and the keeper deletes it as it comes; after a real disconnect the catch-up's `boards` job deletes it (the log's `caught up` line). Note from the log which path did it.

## Screenshots in the board (R1, B2)

22. **With a mention.** Tester posts a raid screenshot of a West gym in West's board with a mention of the bot. The message is gone within a second or two (before the reading: watch it go while the bot still reads); no 🤔 or ✅ and no reply in the board. The raid's post is made in West's forum and listed on the board; Tester gets one DM: `From your screenshot in #… (the board keeps only my lists, so I took your message out of it):` and `- Reported the raid at …: #post.` Googer (Manage Messages) posts one too: the message stays, and the DM opens `From your screenshot in #… (I left your message in the board):` (Q1, review F1). With Manage Messages denied in the forum (step 30), Tester's screenshot stays and the DM's opening says nothing about the board.
23. **Unsure.** A screenshot of a gym with a twin name (or a cut-off name), and one of a gym in East: nothing is reported, nothing asked in the board; the DM points to `/raid screenshot:` (`I could not tell which gym this is: …` and `… is in #east: report it with /raid screenshot:, which asks you whether to report it there.`). A screenshot of a clear West gym whose tier cannot be told (if one is at hand): `I could not tell the tier of this raid: report it with /raid screenshot: and choose the boss or the egg in boss:.` (review W4). A max battle's screenshot of a Power Spot not clear: the DM points to `/max screenshot:`.
24. **Two pictures, one not a screenshot.** A message of a raid screenshot and a photo: the DM has two lines, `- 1: Reported …` and `- 2: This does not look like the screen of a raid, …`.
25. **Passive.** With `ocr.passive` on: a screenshot in the board without a mention is read the same way; with it off, the message is deleted as any member's (step 14's DM).
26. **Closed DMs.** Tester blocks the bot (the server's "direct messages from members" setting does not stop an app's DMs) and posts a screenshot of a West gym a screenshot: the raid is made and listed on the board; no reply anywhere (R1, accepted); the log says `a member takes no direct messages`. Tester unblocks the bot after.

## "Today’s Stops": ten messages, M1, M2

27. **Ten messages** (Matt's sanity limit): report enough tasks at enough West stops (`var/stage/seed-8r9.mjs`, `spread-8r9.mjs`, dev database only) that the post grows past three messages: it spills into a fourth and more, in order below the summary, and a Giovanni or leader reported last is shown (not cut). A re-send (a message turned from components to plain text, or deleted by hand) sends every message after it anew, in order (up to nine deletes and nine sends: note how long it takes).
28. **Coming up says a kind once** (M1): a meetup tomorrow is listed as `#Meetup · … · <date> · 1 trainer` with no "Meetup ·" before it; a raid train tomorrow likewise; a Max Battle Train tomorrow reads `Max Battle Train · <name> · <date> · …` (`Max Battle` before its post, "Train" once, review F9); a raid train of East passing through West tomorrow is `Passing through · …`.
29. **A line waits for its board** (M2): Googer deletes West's board post. Tester reports a task new today in West at once: no line yet; the board is made anew (with 45 seconds of slowmode: Googer sets it to 5 seconds again for the steps below), the stops drawn in it, and the line follows, linking the new board's message. A second report of the same task meanwhile adds no second line.

## Permissions

30. **Manage Messages taken** (R3): deny the bot Manage Messages in West's forum. Tester writes in the board: the message stays; the log says `could not delete a message in the board` once. `/admin setup-forums`: West's line ends `I may not delete what members write in the board (give me Manage Messages there)`. `cutover-check` (only when Matt asks: it reads Discord's REST API with the token): West's region line warns `the bot could use Manage Messages in the forum #west-board`. Give it back: the next message is deleted, and the log is quiet.
31. **Writing without Manage Posts** (B5): take Manage Threads (Manage Posts) from the bot in West's forum only. The stops are drawn in the open board as before; Googer sets its slowmode to 45 seconds (Pine's mark: a locked board with the 5 seconds of step 29 is no mark, and the next draw would open it again) and locks it: nothing more is drawn (`the bot may not write in the board post` once). Unlock and give the permission back.

## The 45 seconds (B4, review W1, plan 8R-9H)

32. Googer sets West's board's slowmode back to exactly 45 seconds (Pine's mark; on a server staged before 8R-9H West's board had the old 6 hours, which the first draw of step 6 moved to 45 seconds). Tester writes a message in the board: it is deleted. Tester writes another at once: Discord holds it (its own 45-second countdown in the message box). During that countdown, after the first message was deleted, Tester uses `/status` and `/research report` in the board: both are answered, as B4 depends on.
33. **The old mark moved** (plan 8R-9H). Googer sets West's board's slowmode to exactly 6 hours (the menu's "6h"), the board open. A report in West (a draw): the board has 45 seconds and stays open. Googer sets it to 6 hours again and locks it. Another report in West: the board has 45 seconds and stays locked; `/admin setup-forums` says West's board is locked by a moderator. Googer unlocks it.

## After

34. Delete the test messages left, end every party made here, put the permissions back (and every board's slowmode as the bot set it: 45 seconds), and note in `var/stage/TEST-SERVER-STATE.md` what was staged.
35. Note the results in the follow-ups file, under "From the staging run of 8R-9F".
