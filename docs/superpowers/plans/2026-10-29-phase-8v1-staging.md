# Phase 8V-1 staging checklist: the events forum, with the Campfire links

Every step needs Matt's go-ahead. Matt starts the bot (and the tunnel for the map's steps). Claude drives Discord and the map in its own tab as Googer; Matt's hand is needed on his phone.

- **Accounts:** Googer (the owner, staff) and Tester (a member).
- **Brief:** `.superpowers/sdd/2026-10-29-phase-8v1-events-forum/design.md`.
- **Designs:** `docs/superpowers/specs/2026-10-28-events-forum-design.md`, `docs/superpowers/specs/2026-10-28-campfire-links-design.md`.
- **Conventions:** `docs/architecture/utilities.md` ("The events forum and the Campfire links"), `docs/architecture/web.md` (the list's foot line).
- **Writes:** migration 033 on the dev database (three new tables, additive); a forum `events` made in the test server's category of `bot-updates`, its listing and event posts. Nothing else is changed.
- **Deploy:** none. No command's definition changed: `/help meetup` and `/help admin setup-forums` are read from the code, so the new sentences show without a deploy.
- **Never:** nothing is fetched from Campfire, by the bot or by the staging tools.

## Before

0. **Settings.** In `var/stage/settings.json`, under `channels`, add `"events": "events"`. Leave `eventsForum` out (35 days, 14 days ahead). Run `npm run web:build`, then start the bot: the log says `listed events loaded` (none the first time), then `raid events read`. The migration log names `2026_10_29_033_events_forum`.

## The Campfire links

1. **`/help meetup`** (Tester): the help ends with "Official meetups by Community Ambassadors are on Campfire: https://campfire.scopely.com/discover". The link opens Campfire's map. Nothing else of `/meetup` changed.
2. **The map, desktop** (Googer, logged in, a member): the list "What's going on" ends with "Official meetups: Campfire"; the link opens in a new tab. Logged out (a private window): the pane's "Log in…" ends with the same line.
3. **The map, phone** (Matt): the List view ends with the same line, readable in light and dark, and the header's height is unchanged.

## The forum and its listing (today's real feed)

4. **`/admin setup-forums`** (Googer): after the regions' lines, "Events forum: created #events, closed it to posts by members, posted, pinned and locked the listing." The forum stands in the category of `#bot-updates`. Run it again: "Events forum: #events is ready."
5. **Permissions.** In the forum's settings: Create Posts denied to @everyone, the bot's own overwrite allows Create Posts and Manage Posts. Tester cannot make a post there.
6. **The listing "Events"** is pinned and locked (Tester cannot write in it). It reads `### Events`, the counts ("n now · n this week · n coming up"), the sections Now, This week and Coming up with their counts, each line the event's name linked to Leek Duck, its times as plain local text ("Sat, Nov 21, 2–5 PM"; several days "Nov 9 – Nov 13"), its post where it has one, and "Campfire"; the foot "Events marked Campfire may have official meetups by Community Ambassadors there. Pine only links to it." No Discord timestamps. No GO Pass, season, GO Battle League, Twitch drops, Timed Research or multi-day raid rotation is listed; no City Safari, Pokémon Night Out or city Wild Area or GO Tour.
7. **Posts of today's feed.** Every Community Day, Raid Day, Max Battle Day, Wild Area, GO Tour, GO Fest and other `event` within 14 days has a post titled with its name: the name as a heading, the times, "More on Leek Duck", "Official meetups, if any: Campfire", the event's picture (or none, where Discord cannot load it). No buttons, nobody pinged. Raid Hours, Spotlight Hours and Max Mondays are lines only.
7b. **Members write in a post** (branch review BR-7). Tester replies in one event post: the message is sent. Then, in the forum's permissions, deny Send Messages in Posts to @everyone and run `/admin setup-forums`: its last line ends "@everyone cannot write in its posts (allow Send Messages in Posts there)." Put the permission back.
8. **Unchanged, no edit.** Restart the bot: the first draw after the restart edits the listing once (the bot keeps what it last sent in memory only), and no post is made twice. Wait for the next draw (a read of the feed, or the next hour): no edit of the listing, which reads the same.
9. **The record lost.** In the dev database, set `EventForum.listingPostId` to null; restart: the log says `took over the events listing`; still one listing. Then archive the listing by hand (Discord: Close post), set the column to null again and restart: the archived listing is taken over and opened, pinned again; no second listing.
10. **A moderator's unlock.** As Googer unlock the listing; the next draw (a restart) leaves it unlocked.
11. **cutover-check**, optional and only with Matt's go-ahead (it reads Discord with the token): the line `events: in <server> the events are listed in #events`. With `"events": "nowhere"` in a copy of the settings: `events: <server> has no forum #nowhere: /admin setup-forums makes it`.

## A made-up feed (var/stage/serve-events.mjs)

Point the stage settings' `raidEvents.url` at `http://127.0.0.1:8098/events.min.json`. The made-up feed is ScrapedDuck's current file with the staging items added (branch review BR-8): `var/stage/events-upstream.json` must be today's, or every real coming event would be missing and the read a short one, which drops nothing (BR-1). So copy ScrapedDuck's current `events.min.json` there once (`node var/stage/serve-events.mjs --refetch` does it as it starts; Matt's go-ahead: it reads ScrapedDuck once), keep `serve-events.mjs` running in its own terminal, and write the staging items into `var/stage/fake-events.json` by hand (a list of items: `eventID`, `name`, `eventType`, `link`, `image`, `start`, `end` as local wall-clock times without a zone, `2026-11-03T14:00:00.000`), which the server adds to the real ones at every request. Each step restarts the bot so that the feed is read at once (or wait for the hourly read).

12. **A post opens.** An item `staging-community-day-1`, "Staging Community Day", `community-day`, starting 20 days from now for 3 hours: after the read it is listed under Coming up, without a post. Move its start to 13 days from now: after the read it has its post, linked from its line.
13. **A change.** Change its start by an hour: the post's times are edited, the listing's line too; no new post. Then change its name ("Staging Community Day II"): the post is renamed (its title in the forum's list) and its body says the new name.
14. **A move.** Replace the item's `eventID` by `staging-community-day-1-rescheduled` and its name by "Staging Community Day II (Rescheduled)" (the name of step 13 with the mark, so that it is the same event), a day later: the same post is edited (the new name in its body, the new times), no second post; the log says `a listed event moved to a new id`. In the database the `EventPost` row has the new id.
15. **A drop.** Remove the item: the post says "Leek Duck no longer lists this event." and is archived, not locked (Tester can still write in it, which opens it); the listing's line is gone; the log says `a listed event was dropped before its start`.
16. **An end.** An item `staging-event-end`, "Staging Event", `event`, started an hour ago and ending in 10 minutes: its post is made at once, under Now. Ten minutes later (a second after the end) the listing drops it; the post's auto-archive is one day (Discord's post settings: "Hide After Inactivity: 1 day"), not locked. Three days later, or at once with the post's end set three days back in the dev database (Matt runs the script, read only first, then with `--apply`; the row's `eventId` is `staging-event-end`):

    ```
    set SETTINGS_PATH=var/stage/settings.json&& node --env-file=.env --conditions=pine-source --import tsx var/stage/event-post-end.mts staging-event-end
    set SETTINGS_PATH=var/stage/settings.json&& node --env-file=.env --conditions=pine-source --import tsx var/stage/event-post-end.mts staging-event-end --apply
    ```

    then restart (the first draw runs as the hourly upkeep does) or wait for the hour: the post is archived, unlocked, once; a message of Tester opens it again and it is not archived again by the bot.
17. **A one-off raid event.** An item `staging-raid-event`, "Staging Raid Event", `raid-battles`, six hours tomorrow: listed as a line with Campfire, no post. An item of the same type over three days: not listed.
18. **A post deleted.** Delete a staging event's post by hand, then change that event's times: no new post is made; the line in the listing loses its post link; the log says `an event post is gone; it is not made again`.
19. **The forum deleted.** Delete the forum `events` by hand and restart: the log says `the events forum is gone` once, nothing is posted; `/admin setup-forums` makes it again with a new listing.
20. **Midnight.** Leave the bot running over local midnight: a second after it the listing is drawn anew (This week moves on a day; edited only where it reads differently).
21. **Rehearsal mode**, optional: with the rehearsal settings, `/admin setup-forums` says nothing of the events forum, and the log shows no draw of it.

## After

22. Empty `var/stage/fake-events.json` (the real events stay in the served feed), restart once more while `serve-events.mjs` runs, then point `raidEvents.url` back at ScrapedDuck and restart: the staging events leave the listing (dropped before their start or ended). Keep the forum for the next staging, or delete it and the `EventForum` row.
