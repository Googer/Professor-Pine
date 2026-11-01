# The region's board takes commands (plan 8R-9F): design

Status: agreed with Matt and reviewed, 2026-10-27 (R1–R3 as recommended); ready for a prototype. Comes from the staging run of 8R-9 and 8X-J (follow-ups, "From the staging run of 8R-9 and 8X-J"). Builds on `2026-10-25-region-board-design.md` (8R-9). Open questions for Matt at the end.

## Why

Matt (2026-10-26): members should report where they see what is already reported, in the board post "Today and coming up". Discord's lock takes away the message box, and slash commands with it, for anyone without Manage Posts. So the board stays unlocked, and Pine keeps it tidy by deleting what members write there.

## What members see

- The board post is no longer locked. A member can use any command in it, as in a party's post; `/research` and `/rocket` find the region through the forum (`regionChannelOf` already does).
- A message a member writes in the board is deleted by Pine at once. The member gets a short DM saying the board keeps only the bot's lists and pointing them to the region's channel (once a day per member; question Q2).
- A screenshot posted in the board (with a mention, or passively where `ocr.passive` is on) is downloaded, its message deleted, then read; what it made or joined is said by a plain DM, and where the reader was unsure the DM points to `/raid screenshot:` or `/max screenshot:` (R1). The board shows the raid or max battle in its lists anyway.
- A command whose answer is public (a spawn report of `/wild`, any other answer posted to the channel) puts it in the region's text channel, never in the board (the prototype lists every such command).

## What changes for the bot

1. **The lock goes.** `createSummary`, `takeOverSummary` and the draw stop locking; a board that stands locked is unlocked at its next draw (B4's check becomes "pinned and not locked"). `/admin setup-forums` drops its lock words (W3) and says instead whether it may delete members' messages there.
2. **Deleting members' messages.** `MessageCreate` (the `GuildMessages` intent: author and channel come without Message Content) for a message in a recorded board post whose author is not this bot: deleted (Manage Messages in the forum). A failed delete is logged once per board. At start and in the catch-up on reconnect, the board's recent messages are read and members' messages deleted (a stopped bot leaves none for long). Moderators' messages: question Q1.
3. **Order.** B5's "only the bot writes" no longer holds for the moment between a member's message and its delete; the stops' order rule (a message sent anew re-sends those after it) stays as it is.
4. **Screenshots in the board.** `mention.ts` ignores every thread today (`message.inThread`); a recorded board post is let through, read as a message of the region's channel, then deleted; the answer by DM (Q3).
5. **Permissions.** The forum's needs gain Manage Messages; `cutover-check`, `permissions.ts`, the guides.
6. **The stops' message cap.** `MAX_POST_MESSAGES` from 3 to 10 (Matt: a sanity limit; a busy day spills instead of cutting, so a hideout is never what is lost). The tests built around three messages (13 in `stop-post.test.ts` and `stop-posts.test.ts`) take data that fills ten.
7. **M1:** Coming up names a party's kind once ("Meetup · Board staging meetup", not "Meetup · Meetup · …").
8. **M2:** the report that finds a deleted board keeps its line: the line waits for the remade board's message instead of letting its claim go.

## Left as they are

The board's layout and the text-channel lines, the summary's day split and midnight redraw, grunt messages, party posts.

## Review (fresh Opus reviewer, 2026-10-27): findings and the defaults taken

- **B1 (Blocker), the screenshot answer:** `DmSender.send` queues and never tells what became of a DM, so "a reply only when DMs are closed" has nothing to trigger on; and the mention flow's questions (which gym, Yes/No for another region) are replies with controls that need a message. Question R1.
- **B2:** read-then-delete would leave the picture in the board for minutes (images are read one at a time): download every image first (within `MAX_SCREENSHOT_BYTES`), delete the message, read from the bytes; the DM names pictures not read. The wrapper gives the region channel as `channelId` for the reading, the thread for reacting and deleting.
- **B3:** the board cleanup runs before `MessageCreate`'s bot filter (other apps' and webhooks' messages go too); system messages are skipped (a title change cannot be deleted); a message already gone (10008) counts as deleted.
- **B4, a moderator's lock:** question R2. Slowmode on the board (`rate_limit_per_user`, e.g. 6 hours) cuts how often a member can write there at all; slash commands and the bot are not limited by it (checked at staging). *Plan 8R-9H (Matt, 2026-10-27): the slowmode is 45 seconds, a value not in Discord's menu, so still a mark no moderator sets by hand; six hours held a member answered by DM and moderators without Bypass Slowmode. A board with exactly six hours is moved to 45 seconds at its next draw, its lock kept.*
- **B5, permissions:** writing in an unlocked board needs Send Messages in Threads, not Manage Threads; the checks split into writing, pin (Manage Threads) and cleaning (Manage Messages). `permissions.ts`' board words, `FORUM_NEEDS`, setup-forums' lock words follow. Question R3.
- **B6, the catch-up:** at most 100 messages after the bot's last message in the board; REST messages carry no member, so Q1's check fetches each author once (`fetchGuildMember(…, true)`); `bulkDelete` for 2–100 messages under 14 days. The once-a-day DM memory is a `BoundedMap` (a restart may repeat one DM: accepted).
- **B7:** a member's message reopens an archived board, unpinned (Discord); after a delete in the board Pine asks the pin check (`summaryChanged(region, true)`).
- **B8, M1 is wider:** trains too ("Train · Train · …", "Train passing through · Train · …"): the kind word is left out where the post's title carries it; tests use real titles.
- **B9, M2's mechanism:** the line waits until the next draw of that channel or the day's end (one retry after the board is drawn), and lets go where the region has no board.
- **B10, a cap of 10:** a re-send of messages i..n is up to 9 deletes and 9 sends (about 15–20 s inside the channel's lock; lines and DM links wait); accepted. Tests check the order over ten messages by the fake's send log.
- **B11, public answers:** no command answers publicly in the channel of use (`/wild` already sends to the region channel); only the screenshot trigger's replies and its 🤔/✅ reactions, covered by B1 and B2. Moderators' kept messages stay above any re-sent stops (B5 accepts it; `stop-reports.md` says so).

## Questions from the review

- **R1 (B1), answered as recommended:** answer a board screenshot only by plain DMs, never asking in the board: what it made or joined, and where it was unsure (a gym or Power Spot not clear, a gym in another region) a DM pointing to `/raid screenshot:` or `/max screenshot:`, which ask privately. Without a reply for closed DMs (that member sees the raid or battle on the board, or nothing). Recommendation: yes.
- **R2 (B4), answered as recommended:** unlock the board once (at creation, takeover, the first draw of a board 8R-9 locked, and `/admin setup-forums`) and leave a moderator's later lock alone (setup-forums says it is locked), plus slowmode; or unlock at every draw. Recommendation: once, with slowmode 6 hours. *Plan 8R-9H: 45 s, Matt 2026-10-27 (see B4).*
- **R3 (B5), answered as recommended:** Manage Messages in the forum: a warning in `cutover-check` (the board works, members' messages just stay) or a failure. Recommendation: a warning.

## Questions for Matt

- **Q1 (answered, Matt 2026-10-27): kept.** A message by a member with Manage Messages in the forum stays; they delete it themselves.
- **Q2 (answered, Matt 2026-10-27): once a day per member** (through `DmSender`; the day in the server's zone).
- **Q3 (answered, Matt 2026-10-27): a DM;** a short reply in the board, deleted after a minute, only for a member whose DMs are closed.
