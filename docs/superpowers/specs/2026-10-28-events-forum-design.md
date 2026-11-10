# The events forum (design draft)

Status: approved, 2026-10-29 (Matt). A fresh reviewer read the draft (findings R1–R14, folded in below); Matt took the recommendations of A and B at the end.

Matt, 2026-10-28: each server gets one forum of the game's events. It has two parts:
- a pinned listing of every event, which Pine keeps current;
- a post for each bigger event, where members can talk about it.

Events whose kind Campfire makes meetups for carry a hint pointing there.

Background: the idea as agreed is in `var/research/campfire/events-forum-idea.md`, and the Campfire research in `var/research/campfire/notes.md`. The Campfire link and its "never fetch" rule come from `2026-10-28-campfire-links-design.md`.

## Decisions taken in talk

- **One forum per server**, not per region: the events are the same for everyone.
- **One pinned listing post**, edited in place like the region board's "Today and coming up".
- **A post per bigger event**, opened ahead of it and archived after it, for discussion.
- **Weekly short events are lines only.** Raid Hour, Spotlight Hour and Max Monday get no post: members organize Raid Hour with raid trains planned ahead, not by talking in an event post.
- **The data is ScrapedDuck's events feed** (Leek Duck's list), which Pine reads already. Nothing new is fetched, and nothing at all from Campfire.
- **The Campfire hint** reads "Official meetups, if any: Campfire". Pine cannot link an event's own Campfire page, because its id would have to be fetched. Campfire's meetups are tied to its events, one per day of a multi-day event.
- **Later, not in this plan:** show an event's own meetups and trains (Matt: TBD).

## What members see

### The forum

- **The setting:** `settings.channels.events` names the forum: a name, without `#`, blank meaning unset. Unset means no events forum.
  - The check that keeps `moderation` from naming another of the settings' channels is widened to `events` (R13).
  - The setting's name decides; a stored channel id that no longer matches the name is replaced at the next `/admin setup-forums` (R7).
- **Making it:** `/admin setup-forums` makes the forum where it is missing, in the category of the `bot-updates` channel, with that category's permissions plus (R9, R2):
  - Create Posts denied to `@everyone`: members write in Pine's posts but make none;
  - the bot allowed Manage Posts and Manage Threads, which it needs to edit, pin and lock;
  - and it reports what is missing.
- **`cutover-check`** warns about a named forum the server lacks, and about the bot's missing Manage Posts or Send Messages in it.
- **A forum that is gone:** said once per server at warn, and nothing runs for that server until the forum is back.
- **Rehearsal mode:** the service and setup-forums skip the events forum altogether, so the rehearsal gateway never drops and logs its posts at every draw (R8).

### The listing post: "Events"

- **Its message:** title `Events` (`EVENTS_TITLE`). One components-v2 container, pinned and **locked**: members cannot write in it (Matt agreed the listing is for reading). A moderator who unlocks it is not overruled.
- **Keeping it pinned and found (R2):**
  - Pine edits it as the board's summary is edited, reopening it when archived: the bot has Manage Posts.
  - It pins it again after every edit, as `pinAndOpen` does.
  - Its auto-archive is the longest Discord gives.
  - Taking over a listing whose record is lost looks at archived posts as well as active ones, so a second listing is never made beside an archived first. The forum's one pin would refuse it (30047).
- **Sections, in this order:**
  - **Now:** events on now.
  - **This week:** starting within seven days.
  - **Coming up:** starting later, up to `settings.eventsForum.horizonDays` (default 35).
  - Each section lists by start; the head counts them.
- **A line:**
  - the event's name (`plain()`), linked to its Leek Duck page (the feed's `link`, masked with `<…>`);
  - its times as plain text in local time ("Sat, Nov 21, 2–5 PM"; several days "Nov 9 – Nov 13"), never Discord's `<t:…>` stamps (ruling A);
  - its post, where it has one;
  - and `· [Campfire](<https://campfire.scopely.com/discover>)` where its kind gets the hint.

  Example: `**[Pawniard Community Day](<…>)** · Sat, Nov 21, 2–5 PM · <#post> · [Campfire](<…>)`.
- **The hint's words:** once, at the foot after a line: "Events marked Campfire may have official meetups by Community Ambassadors there. Pine only links to it."
- **Size:** within the text budget of a components-v2 message, as the summary does. A section that does not fit ends with "…and N more" and keeps its count.
- **Nothing to list:** "No events listed right now."
- **When it is drawn** (R10, R11):
  - after each read of the feed;
  - at the next start or end among the listed events (one timer, set anew at each draw), so "Now" never goes stale;
  - a second after local midnight;
  - in the hourly upkeep;
  - in the catch-up on reconnect.

  An unchanged message is not edited. The midnight timer of `PartyService.watchMidnight` moves into a shared helper both use, not a copy.

### An event's post

- **When it is made:** for an event of a posted kind (below), `settings.eventsForum.postDaysAhead` days before its start (default 14, Matt 2026-10-29: members plan earlier than 3 days ahead; at most `horizonDays`), or at once when the feed first lists one that starts sooner or is on. One post per event and server; a multi-day event has one post.
- **Title:** the event's name, cut to Discord's 100 characters.
- **Body:** one container:
  - the name as a heading;
  - the times as in the listing;
  - "More on Leek Duck" (the link);
  - the Campfire hint sentence where the kind gets it;
  - the feed's `image` as a media gallery item where the feed gives one. Pine does not check it, so Discord loads it or shows nothing, and Pine fetches nothing (R6).

  No buttons, and it pings nobody.
- **When the event changes:** the post is edited when the event's times or name change.
  - **A new id:** an event the feed lists under a new id with the same name (ignoring a "(Rescheduled)" mark) and type, while the old one is dropped before its start, is the same event moved. Its row and post carry over to the new id, and the post is edited (R12).
  - **Dropped otherwise before its start:** moved or canceled. The post gets "Leek Duck no longer lists this event." and is archived, and the line leaves the listing.
- **After the end (R1):**
  - When the event ends, Pine sets the post's auto-archive to one day, **without locking it** (a new gateway method; `archivePost` locks, and is not used here). Discord archives the post after a day without messages.
  - A member's message reopens it and restarts that day, so no sweep is needed.
  - A post still open three days after the end is archived unlocked by the hourly upkeep, once.
  - Posts are never deleted.
- **A post deleted by a moderator:** its row is marked gone and the post is never made again (R7). The event's line in the listing loses its post link.

## Which events, of which kinds

The rule goes by `eventType`, as `isForEveryone` does. It is decided in one pure module, `src/domain/time/event-listing.ts`, the one path for the listing, the posts and any later reader:

- **One reader of the feed's items (R4).** The listing does not read the feed a second time.
  - The kinds that `parseMaxEventFeed` and `parseBigEventFeed` already read (Max Mondays, Max Battle Days, Wild Area, Tour, Fest) take their times from those parsed events. `maxEventAt` and the listing then agree on a Max Monday's hours.
  - The other kinds come from a shared reader of an item's times (`feedTime`, `isForEveryone`), which those parsers use too.
- **Items without times (R3).** The feed lists events on now or just past with `start` and `end` null. Such an item counts as **not seen** in the merge: it neither replaces a known event's times nor counts as a drop.
  - A known event the feed lists without times keeps its kept times to its end.
  - An item that was never known with times is not listed. The fixture's TCG celebration is one.
- **The listed events are kept** in the database, merged by the max events' rules: kept to the end when dropped after the start, removed when dropped before it. The listing then survives a restart and a feed that fails.
- **`isListed(event)`:** everyone's (`isForEveryone`: no in-person types, no zoned times), with times, and of a kind outside `UNLISTED_KINDS`: `go-pass`, `season`, `go-battle-league`, `twitch-drops`, `research` (long Timed Research). `raid-battles` items are listed only when they last less than a day (a one-off raid event; line only, with the hint); the multi-day boss rotations stay out (ruling B).
- **`isPosted(event)`:** listed, and of `POSTED_KINDS`: `community-day`, `raid-day`, `max-battles`, `wild-area`, `pokemon-go-tour`, `pokemon-go-fest`, `event`, and Hatch Days if Leek Duck types them (neither fixture has `hatch-day`, nor `pokemon-go-fest`; the plan checks the strings against Leek Duck's list, R13). Everything else listed is lines only (`raid-hour`, `pokemon-spotlight-hour`, `max-mondays`, unknown kinds).
- **`hasCampfireHint(event)`:** listed and not in `NO_CAMPFIRE_KINDS` (empty to start). Campfire made events of every listed kind seen on 2026-10-28, and "if any" covers a kind it skips.
- **An unknown new `eventType`:** listed, lines only, with the hint, and logged once at warn, as the research reader's unread types are.

## How it runs

- **The provider:** `RaidEventService` gains `ListedEventProvider.listedEvents()` from its one read.
- **`EventForumService`** (`src/services/event-forum.ts`) draws the listing, makes and edits the posts, and sets their archiving. It goes through `PartyGateway` (new methods: set a post's auto-archive, archive without locking, list archived posts) and is tested with the fake gateway.
- **Storage (the next free migration; migrations land first-merge-wins):**
  - `EventForum`: server id, forum's channel id, listing post's id.
  - `EventPost`: server id, `eventId` varchar(200) as `maxEvents.eventId` (R13), post id, the name and times it was drawn with, `endedAt`, `gone`.
  - `ListedEvent`: the kept events, like `maxEvents`.

  Snowflakes are kept as strings; columns are known to the repositories only.
- **Settings:** `settings.eventsForum` (`horizonDays`, `postDaysAhead`), named apart from `raidEvents` (R13).
- **The Campfire link:** `CAMPFIRE_DISCOVER_URL` of the links design, shared.
- **Text:** American spelling.

## Later (not in this plan)

- **An event's parties:** the meetups and trains planned within its window, in its line or post ("Raid Hour · 6–7 PM · 3 raid trains planned"), from the parties' own data.
- **The web map's list** could show the listed events from the same module.

## Defaults taken (Matt may object)

- **Posts open** 14 days ahead (Matt: further than the first draft's 3).
- **The listing reaches** 35 days ahead.
- **The forum sits** in the category of `bot-updates`.
- **The listing is locked**, and a moderator's unlock stands.
- **Every `event`-type item gets a post**, Minior Showers too: see how it goes.
- **The hint goes by a deny list**, which starts empty.

## Rulings (Matt, 2026-10-29: the recommendations of A and B)

**A. How times are written (R14): plain local-time text (taken).** Events run at local time everywhere: Community Day is 2–5 PM wherever you are. Discord's `<t:…>` stamps show the moment of 2 PM in `settings.timezone`, converted to each reader's zone, which is wrong for a member whose Discord or device is set to another zone (a traveler). Recommended: plain text in local time, "Sat, Nov 21, 2–5 PM", which reads right for everyone, and the relative "in 3 days" left out. The alternative is Discord stamps, as the rest of Pine uses.

**B. One-off raid events typed `raid-battles` (R5): listed when shorter than a day (taken).** The feed types the boss rotations `raid-battles` (multi-day, many per month), and probably one-off raid events too: Campfire's "Eternatus Returns" was likely one. Recommended: list a `raid-battles` item when it lasts less than a day (a one-off raid event), with the hint, line only, and leave the rotations out. The alternative is to leave every `raid-battles` item out.
