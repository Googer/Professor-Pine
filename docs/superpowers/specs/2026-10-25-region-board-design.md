# The region's board: one locked forum post for what is on: design

Status: agreed with Matt 2026-10-25, reviewed; ready for a prototype. Comes from the open rulings (follow-ups, "Matt's answers to the open rulings (2026-10-25)" and the design talk below them). Mockup shown in the session (the forum `#oakland-board`, its pinned post, and the text channel). Builds on `docs/architecture/parties-and-posts.md` (the summary), `stop-reports.md` (the post "Today’s Stops") and `discord-framework.md`.

## Why

Today a region has two pinned lists in two places: the forum's pinned post "Going on now" (raids, max battles, trains, meetups) and, in the region's text channel, the pinned message(s) "Today’s Stops" (field research and Team GO Rocket hideouts). Matt: all the bot's lists in one place keeps the server tidy; the text channel is for members' chat, spawn reports and grunt messages.

## What members see

### The forum

- The forum is renamed from `<channel>-meetups` to `<channel>-board` (`settings.regionForumSuffix`'s default becomes `-board`). It holds what it holds today: a post per raid, max battle, train and meetup, and the pinned post.
- The pinned post is titled **"Today and coming up"** (was "Going on now"; Matt found "What’s on" a little strange; Claude's proposal, no objection yet). Inside the region's forum the title needs no region name.
- The pinned post is **locked**: only the bot and moderators (Manage Posts) can write in it. Discord shows its own "This post is locked" line. The bot already locks posts (a closed party's, `archivePost`) with the permission it pins with.

### The post's first message: the parties

The summary as today, with one change: it is split by day.

- **Head:** `### Today and coming up`, then the counts: `3 raids · 1 max battle · 1 train today · 2 coming up · 4 tasks · 2 hideouts` (only the kinds there are; the stops' counts as the summary's line has them today).
- **Today:** everything whose time is today in the server's time zone, under today's headings: the raids by tier, max battles, trains, trains passing through, meetups. Raids and max battles are always today. A train or meetup that starts later today is here ("starts in 5 hours"); one that started earlier and still runs is here.
- **Coming up:** what starts on a later day (planned trains, meetups; elite raids if they come back), **one list by start** (Matt: "probably a list"; mockups decide), each line its kind first and the full date and time (Discord's `f` stamp, each reader's own time zone): `Meetup · <post> · Saturday, November 21 at 1:00 PM · 7 trainers`. Coming up is sure of a share of the room (as `SECTION_ROOM`), what does not fit counted.
- **The stops' line** stays last: `Today’s Stops (below): 4 tasks · 2 hideouts`, linking to the first message of the stops in the same post.
- **Midnight:** the summary is drawn anew at midnight, so tomorrow's items move from Coming up to Today (Matt: legacy Pine needed a midnight refresh too). The stop posts' midnight timer (`nextPeriodChange`) can drive it.

### The next messages: "Today’s Stops"

- "Today’s Stops" is posted **in the board post, under the summary**, instead of pinned in the text channel. Its layout is unchanged (`stopPostMessages`: up to three messages, `-# Today’s Stops, continued (n)`, pictures dropped step by step before a task is cut, research first, hideouts last).
- Order needs no slots: in a locked post only the bot writes, so every message it adds lands below the ones before. A day that needs a second message adds it at the bottom; a day that shrinks deletes the extra; at midnight the day's messages are deleted and the next day's first report posts them again below the summary.
- The summary must stay the post's first message: the forum lists the post by it and the pin is the post's. So the stops can never sit above the parties; anything below the summary can be reordered later.
- Nothing is pinned in the text channel any more (the board post is pinned in the forum).

### The text channel: a line per new task and leader

Members keep reporting with `/research` and `/rocket` in the text channel, and chatting there ("anyone seen Arlo today?"). The bot posts a short line there, like a new party's link line, **the first time that day** something new is reported in the region:

- **Each research task** (Matt, 2026-10-25: per task, not per category): `Research: **Catch 25 Pokémon** (Rare Candy) → <link>`.
- **Each leader and Giovanni:** `Team GO Rocket: **Arlo** at <stop> → <link>`.
- The link goes to the board message that holds the task or the hideout (`linkOf`, as the map's links).
- Later reports of the same task or leader that day post nothing. The line is never edited (quiet, as the party lines). At midnight the day's lines are deleted.
- No line for decoy grunts (hideouts of no leader) or for a typed task's narrowing; grunt messages stay as they are (their own message in the text channel, 30 minutes).
- Spawn reports (`/wild`) and grunt messages stay in the text channel unchanged (Matt, 2026-10-25).

## What changes for the bot

- **Where "Today’s Stops" lives:** `StopPostService` posts into the region's board post (the summary's thread, `Region.summaryMessageId`) instead of the region's text channel; no pin. The `StopPost` row keeps its message ids; its `channelId` becomes the thread (or a new column; the plan decides, additive only).
- **Permissions:** the stops need Send Messages in Threads and Embed Links in the forum instead of Pin Messages in the text channel (`REGION_CHANNEL_NEEDS`, `FORUM_NEEDS`, cutover-check, `docs/guides`). Locking needs Manage Threads, which the bot has for pinning.
- **The plain-text fallback** (`stopPostText`, where the bot may not embed): decided by the board post's permissions.
- **The summary post:** made locked (`createSummary`); an existing one is locked when taken over or drawn (`takeOverSummary`, `renderSummary`'s re-pin check), and its title renamed to "Today and coming up" (`LEGACY_SUMMARY_TITLE` gains "Going on now").
- **The first switch on a server:** at start, a pinned "Today’s Stops" of today in a text channel is unpinned and deleted, and the post drawn in the board.
- **The text channel lines:** a record per region and day of the tasks and leaders already announced and their line's message id, so a restart neither repeats a line nor forgets to delete one at midnight (a table or the `StopPost` row; the plan decides, additive only).
- **The forum rename:** `renameForum` already renames a forum whose name is the channel's plus the bot's one-word ending at the next `/admin setup-forums` or `/region import`; hand-chosen names stay. The guides tell admins to run `/admin setup-forums` once.
- **Words:** the answers' "In the post “Today’s Stops” of #oakland" (`research.ts:215`, `rocket.ts:222`) name the board post; `/research` and `/rocket` help; `permissions.ts` texts; the guides; `stop-reports.md` and `parties-and-posts.md`. DMs need no words changed: their "Go to post" button follows `linkOf`.
- **Rehearsal mode:** unchanged (no stop posts there).

## Left as they are

- Party posts, their link lines, the summary's per-kind order inside Today, `…and N more`.
- The stop post's layout, pictures and busy-day rules.
- Grunt messages, spawn reports, DMs.

## Review (fresh Opus reviewer, 2026-10-25): findings and the defaults taken

- **B1 (Blocker), links:** every stop link is built from the region channel's id (`research-report.ts:214`, `stop-routes.ts:175`, `notify-service.ts:993` and `:1147`, the summary's stops line `party-service.ts:3157`). `messageOf` / `linkOf` return `{ channelId, messageId }` (the thread's id) and all five callers use it.
- **B2 (Blocker), a summary replaced or taken over:** `replaceSummary` deletes the whole thread, stops included; `takeOverSummary` may record another post. `StopPost` stays keyed by the region channel and gains a nullable `threadId` (additive); each draw reads the region's current `summaryMessageId`, and where it differs from `threadId` forgets the ids and sends every message anew; no draw while there is no summary; `createSummary` and `takeOverSummary` ask the stop service to redraw the region.
- **B3 (Blocker), archived locked threads:** Discord refuses a send or delete in an archived locked thread (50083); edits do not count as activity. `sendMessage` and `deleteMessage` reopen a thread first, as `editMessage` does.
- **B4:** after any reopen of the board post, its pin and lock are checked apart from whether the text changed.
- **B5, order:** a message sent anew in its slot (gone, or switching between v2 and plain text) would land at the bottom: when message i must be sent anew, messages i to n are deleted and sent again. Moderators can still write in the locked post, between the bot's messages (accepted).
- **B6, permissions in a thread:** `mayPost` in a thread checks Send Messages in Threads, Embed Links and Manage Threads (writing in a locked thread needs it, 160005) on the parent forum; a refusal is logged once. Manage Threads is now needed for the stops too.
- **B7, midnight:** `PartyService` keeps its own timer at local midnight (Luxon, DST-safe) that redraws every region's summary, also in rehearsal mode; the catch-up after an outage redraws the summaries.
- **B8, Today and Coming up by time, not kind:** Today is a party that has started or starts before the next local midnight; everything else is Coming up, every kind (an EX raid days ahead too) and Passing through; a party with no time set is under Today.
- **B9, the text channel lines:** claimed first by a unique row `(serverId, regionChannelId, day, key)`, then sent; the link waits for the draw (`messageOf`). The line names the task's text and its reward as first reported ("one of …" for a "one of"). Research waiting under an event's window (8R-6) counts. No lines in rehearsal mode or where the region has no board post. Names through `plain()`.
- **B11, the first switch:** an old row (no `threadId`) is removed through `remove` (unpin and delete), older days' too; DMs and answers already sent today point at deleted messages (accepted). The pin code goes; Pin Messages leaves `REGION_CHANNEL_NEEDS`.
- **B12:** the old titles are a list ("Active raids", "Going on now"); `takeOverSummary` also looks at the recorded post when it is archived (an archived locked post is not among the open ones), so no second post fails the forum's one pin.
- **B13:** the stop messages are sent with `SuppressNotifications` (a follower of the post is not pinged by each); edits never notify.

## Questions for Matt (from the review), answered 2026-10-25: all three as recommended

- **No board post (B10):** a region without a forum, or whose summary could not be made or locked, would have no "Today’s Stops" at all (today it has them). Recommendation: draw nothing, log once, and let `cutover-check` and `/admin setup-forums` report it; no fallback to the text channel (two code paths).
- **A task taken back (B9):** a task whose only report is taken back keeps its line in the text channel, pointing at a board without it. Recommendation: leave the line (never edited, as party lines).
- **Members kept out of a forum (B13):** a member barred from the region's forum (`memberAccess`) no longer sees the stops, though they see the text channel and its lines. Recommendation: accept.

## Open for the review (answered above)

- Whether Discord lets members react in a locked post (harmless either way).
- Whether a member who "follows" the board post gets notified of each new stop message (the bot posts a few a day; a follower may find it noisy).
- The board post's thread auto-archives after a week without messages; the summary is edited, not sent: check that edits keep a locked thread from archiving, or that the bot unarchives it (it re-pins it today).
