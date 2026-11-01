# Phase 8R-9 staging checklist: the region's board (draft)

Every step needs Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab.

- **Accounts:** Googer (owner, staff) and Tester (a member).
- **Plan:** `2026-10-26-phase-8r9-region-board.md`.
- **Design:** `docs/superpowers/specs/2026-10-25-region-board-design.md` (its review B1–B14 and Matt's three answers).
- **Conventions:** `docs/architecture/stop-reports.md`, the section of "Today’s Stops" on the region's board (plan 8R-9); `docs/architecture/parties-and-posts.md`, "The region's board".

The steps use two regions of the test server, called West and East below (note which). Note the tasks, leaders and times used.

## Before

1. **The commands.** `/admin setup-forums`' description changed (it names the board), so deploy the commands first:

   ```
   set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global
   ```

   No other command or option changed.

2. **The database.** Migration 031 is additive (`StopPost.threadId`, `StopPost.leftoverIds`, the table `StopLine`); the bot runs it at start. Check `var/stage/TEST-SERVER-STATE.md` and note that 8R-9 is being staged.
3. **What the switch meets.** Before the new build starts, on the build of `typescript-migration`, make sure the dev server shows what production will have at the cutover, and note it:
   - a pinned "Today’s Stops" in West's text channel today (report a task there on the old build), and if possible a row of an earlier day whose post still stands in a text channel;
   - the regions' forums named `<channel>-meetups`;
   - a "Going on now" summary post in West's forum, with a party in it.

## The first switch

4. Start the new build. `/admin setup-forums` as Googer: each region's line says its forum is ready, "renamed it" for the `-meetups` forums (now `<channel>-board`), and nothing about the board where "Going on now" was taken over. West's summary is renamed "Today and coming up" with its next edit (Discord's rename limit may delay the title), pinned and locked.
5. The old pinned "Today’s Stops" in West's text channel is unpinned and deleted at the first draw of the stops (a new report there, or the start for an earlier day's row); today's post is drawn in West's board, under the summary. Nothing of the old post is left pinned in the channel.

## The board

6. **Locked and titled.** West's board is the forum's pinned post "Today and coming up". Tester cannot write in it (Discord says the post is locked); Googer (a moderator) can.
7. **Today and coming up.**
   - Make a meetup for Saturday (or tomorrow) and a raid today in West. The raid is under its tier; the meetup under **Coming up** with its full date and time, and the head counts "1 raid today · 1 coming up".
   - An elite egg days ahead (if one can be made) is under Coming up too; a max battle is always today.
   - `/status` in West's channel shows the same list, and the stops' line without "(below)".
8. **The midnight redraw** (with the bot running over midnight; can be done with steps 13 and 16): a meetup starting tomorrow morning moves from Coming up to today within a few seconds after midnight. Yesterday's "Today’s Stops" is deleted from the board.

## "Today’s Stops" in the board

9. **The first report of the day** (`/research report` in West): "Today’s Stops" is posted in West's board below the summary. The summary's last line is `[Today’s Stops](<link>) (below): 1 task`, and its link opens the post's first message in the board.
10. **The answers' words:** `/research report` says `In "Today’s Stops" on the board of #west, until midnight.`; `/rocket report` of a leader says the same; a grunt still says `Posted in #west; it goes away …`.
11. **A region without a board** (review W4): in East, delete the board by hand and stop the bot before anything redraws it, or use a region whose forum has no board yet (`cutover-check`'s boards line, step 22). A report at an East stop answers `It stands until midnight.` and names no board; nothing is drawn and no line is said there (the log says `the region has no board post` once). `/admin setup-forums` makes East's board; the next report there draws its stops and names the board.
12. **Order and a second message.**
    - Report enough tasks at West's stops (or one task at many stops) that the post spills into a second message: the second message is below the first, both below the summary.
    - Googer writes a message in the locked board, below the stops. A change that sends a message anew (the post growing into a third message, or a message that changes from plain text to components) sends every message after it anew below, so the stops stay in order; Googer's message then stands between the stops' messages kept and those sent anew: accepted (B5).
    - The summary stays the board's first message throughout.
13. **Links.** A research DM's "Go to post", "Already reported"'s link and a Rocket DM's button open the message of the board that holds the task or hideout. On the map (`/api/stop-reports` from the console, as the 8R-3 checklist does), each report's `link` is `https://discord.com/channels/<server>/<board>/<message>`.

## The lines in the region's channel

14. **One line per task.** The first report of a task in West today: a line in West's channel, `Research: **Task** (Reward) → <link>`, its link opening the board's message that holds it. The same task again at another stop, another version of it, and a narrowing of its "one of": no second line.
15. **One line per leader.** Arlo at a West stop: `Team GO Rocket: **Arlo** at **Stop** → <link>`. Arlo again elsewhere, a grunt and a decoy: no line. Giovanni: a line.
16. **Deleted at midnight** (with step 8): every line of the day is deleted a second after midnight; the first task reported after midnight gets a line again. A restart after the next midnight deletes the lines a stopped bot left, at start.
17. **A task taken back** keeps its line until midnight (Matt's answer).
17b. **A restart in the middle of the day** (after steps 9 and 14): stop the bot (one Ctrl+C) and start it again. The same task reported again gets no second line (its `StopLine` row stands); "Today’s Stops" is edited in place, with no second copy below it; the summary keeps its stops line once the stops are drawn again.

## Moderators and the board

18. **A board deleted by a moderator.** Googer deletes West's board post. The next report in West: the summary is made anew (a new "Today and coming up", pinned and locked), and "Today’s Stops" is drawn in it, every message sent anew; nothing is left of the old one. The lines said afterwards link the new board.
19. **A board unlocked by a moderator.** Googer unlocks West's board. The next draw of the stops (a report) locks it again. Unlock it once more and run `/admin setup-forums`: it is locked again and West's line says nothing more about it.
20. **An archived board.** Googer closes (archives) West's board. A report in West: the board opens, the stops are drawn in it, and it is pinned and locked again.
21. **`/admin setup-forums`' lock words.**
    - With Manage Posts denied to the bot in a region's forum (the forum's own permissions), a new board (delete the old one first): `posted the board (I could not pin or lock it: give me Manage Posts there)`.
    - On a board that stands, unlocked by hand, with Manage Posts still denied: `the board is not locked (I could not lock it: give me Manage Posts there)` (review W3).
    - With Manage Posts given back: `posted, pinned and locked the board` for a new one, and nothing for one that stands and was locked again.

## Notifications and permissions

22. **`cutover-check`** (only when Matt asks: it reads Discord's REST API with the token): with a region that has a forum but no board, a `boards` line warns "boards: 1 of N regions with a forum have no board yet (#east): '/admin setup-forums' makes it"; the region lines no longer ask for Pin Messages in the region channels.
23. **Nobody is notified of the stops.** Tester follows West's board post. A report draws "Today’s Stops" (a new message and an edit): Tester gets no push or desktop notification for the bot's messages (`SuppressNotifications`); the post still shows as unread, as Discord does for any message. A line in West's channel notifies as any message there.
24. **Writing in a locked post.** The bot's role needs Manage Threads (Manage Posts) in the forum to write in its locked board (Discord's 160005).
    - Take Manage Threads from the bot's role in the server and give it only through West's category: the stops are drawn as before.
    - Take it from the category too: nothing is drawn in West's board, the log says `the bot may not write in the board post` once, the summary's stops line goes, and no line is said in West's channel. Give it back: the next report draws the post.

## After

25. End every party made here, put the permissions back, and note in `var/stage/TEST-SERVER-STATE.md` what was staged.
26. Note the results in the follow-ups file, under "From the staging run of 8R-9".
