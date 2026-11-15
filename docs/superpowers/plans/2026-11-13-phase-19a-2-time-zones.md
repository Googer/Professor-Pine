# Phase 19A-2: A Time Zone per Server: Implementation Plan

**Goal:** the second half of plan A of the 2.1 design (`docs/superpowers/specs/2026-11-12-multi-server-instance-design.md`, "Time zones"; Matt, 2026-11-12: "Go for it all"). Each server has its own time zone, which its staff set in `/admin settings`. Every time a member types, every screenshot clock, every date or clock in a post, a DM, a dialog or the web, every "today" and every local midnight is in the zone of the server it belongs to. A feed's local wall-clock time is kept as wall-clock time and becomes a moment per zone when used; a feed's moment stays a moment. An installation whose servers share one zone (Pittsburgh's) behaves exactly as before.

- **Task 1, the server's zone and the panel:** `ServerSettings.zoneOf(serverId)` (the row's zone, else the instance's default), the zones in use (the default plus the zones of the servers the bot is in), `onZoneChange` and `onZonesInUseChange` (a server joining or leaving); `instanceZone(settings)`, the one reader of the file's zone; `zoneNamed` takes only `Area/Location` names and `UTC`, keeps a name as IANA writes it, and refuses abbreviations in the panel's own words; two names of one zone are no change. The panel's time zone line shows the local time there now and has "Change…", a dialog with one field; the change is logged as any other.
- **Task 2, times members type and read:** commands, dialogs, the screenshot reader, posts, summaries, DMs, the panel's hints and `/help`'s examples in the server's zone (`zoneOf(interaction, ctx)`); a party's zone from a complete map of server rows loaded at start (`PartyService.zoneOf`); a DM with no server, `/help` there and `/userscript` in the instance's default; the scheduler's tick gives each party the rules of its zone; a time "in 30" is a moment.
- **Task 3, feed times kept as wall-clock time:** `FeedTime` (`{ at } | { local }`), its moment in a zone (`momentIn`, `timedIn`, `allIn`); every parser keeps the wall-clock text; migration 054 adds nullable `startsLocal`/`endsLocal` (and a research section's `endsLocal`) beside the moments, which hold the default zone's moment so 2.0 still reads sense; a wall-clock column that no longer agrees with its moment (a round trip to 2.0) is ignored on read.
- **Task 4, the boss list per zone:** the rotations in force in a zone (`rotationsIn`, `maxRowsIn`), the feed's lists cached per zone in use and re-read just after the soonest rotation edge; the announcer tells each server of a zone once, and nothing for a zone whose list before a restart is unknown; a page only another zone needs that fails leaves that zone as it was and is retried with the feed's backoff; migration 055 stores Pokebattler's start of an upcoming max boss (`RaidBoss.startsFrom`); every caller passes its server's zone.
- **Task 5, events, event pages, research sections and the event window per zone:** the events feed's lists per zone; the event window staff type is local time in every server's zone; ending it ends it now everywhere it had begun and never erases what already ran; an event page is read once per start.
- **Task 6, local midnights and day keys:** one timer per zone in use (`everyLocalMidnightIn`), following the zones in use; summaries, the events forum's edges and on-this-day post, want counts, stop lines and posts of the stops; day keys are the server's local day; a research report counts for a period only when made inside it; a zone change redraws the server's summaries, posts, events forum and posts of the stops.
- **Task 7, activity and history:** buckets and days in the server's zone; a zone change rebuilds the server's activity in the background (`ActivityZoneRebuild`, stopped at shutdown); `activity:rebuild` reads each server's zone (the default on a database without the table).
- **Task 8, the web:** every route under `/s/<guild>/` reads its server's zone once per answer (`requestZone(request)`); `/userscript` keeps the default.
- **Task 9, docs, and no zone read from the file:** `servers.md` ("A server's zone"), `operations.md`, `testing.md`, `history.md`, `stop-reports.md`, `utilities.md`, the guides; `src/server-keys.test.ts` refuses `settings.timezone` outside `src/config/`, in `scripts/` too.

**Tech stack:** TypeScript 6.0, discord.js 14.28.1, Kysely, MySQL 9.7, Temporal, Vitest.

**Brief:** `.superpowers/sdd/19a-2-time-zones/brief.md` and `survey.md`; hand-overs `handover-*.md`; fix rounds `fix-round-1.md` to `fix-round-3.md` there; ledger `progress.md`.

**How it was built.** Prototyped on `proto-19a2` from main-dev 0b1f88223, one commit per task, by five prototypers in turn (each handing over to the next). Opus reviews of tasks 1–2 (1 Important: a party's server read from a bounded cache could have given it the default zone; abbreviations such as "EST" taken as zones; 5 Minor), of 3–4 (2 Important: a restart would announce every other zone's list as a change; one zone's failing page sank every zone's read; 7 Minor), of 5 (2 Important: ending the event window erased what it had already run in zones east; "in 30" kept as a wall-clock time; 5 Minor) and of 6–8 (8 Minor); every finding folded into its task commit (fix round 1); a re-review (1 Important: two spellings of one zone, `US/Central` beside `America/Chicago`, lost their midnights, boss list and announcements; 5 Minor and three missing tests), folded again (fix round 2); a re-review (6 Minor: the feed's backoff during an outage, a zone's list while its page fails, a page that does not parse, another name of the default zone, research DMs after a change), folded again (fix round 3); a last re-review (ready; 2 Minor left as follow-ups). main-dev had not moved since, so the reviewed commits are the plan's commits as they are (no transcription).

| Task | Commit | Title |
|---|---|---|
| 1 | `019361c75` | 19A-2 1: a server's zone, the zones in use, and the time zone on the panel |
| 2 | `ceabc5b50` | 19A-2 2: times members type and read, in their server's zone |
| 3 | `c482bedd7` | 19A-2 3: feed times kept as wall-clock time |
| 4 | `664c4f520` | 19A-2 4: the boss list per zone |
| 5 | `ffdaaa321` | 19A-2 5: events, event pages, research sections and the event window per zone |
| 6 | `7d7689f27` | 19A-2 6: local midnights and day keys per zone |
| 7 | `c004bba82` | 19A-2 7: activity and history in the server's zone |
| 8 | `dd8271157` | 19A-2 8: the web in the server's zone |
| 9 | `93954685a` | 19A-2 9: docs of the zone per server, and no zone read from the file |

On the tip: `npm run check`, `npm run build`, `npm run test:db`, one at a time, each judged by its exit status. The database suite found migration 049’s test listing every column of `EventWindow`, which 054 adds to; its fix (the test leaves out 054’s columns) is folded into task 3.

## What staff and members will notice

Pittsburgh's zone comes over as it is (its row's zone, else the file's); with one zone nothing changes. These follow from the design:

- `/admin settings` shows the server's time zone with the local time there now, and staff change it with "Change…"; an abbreviation ("EST") is refused with a name to use instead.
- After a change, posts, summaries, the events forum and the posts of the stops are redrawn in the new zone; parties keep their moments; the heatmap fills again in the background.
- On an instance with servers in several zones, each server's boss list, events, Raid Hour, research sections, midnights and "today" are its own.
- `/admin event-window`'s times are local time in every server's zone; ending it ends it now where it had begun.
- Going back to 2.0: it reads the file's zone and the moment columns (the default zone's moments of wall-clock feed times); a feed time 2.0 rewrites is read from its moment again by 2.1.

## Staging

On the Air's dev stack after `./pine update` (migrations 054 and 055) and a global deploy of the commands (Matt's go-ahead).

1. The upgrade: the test server's zone is the file's; posts, summaries and `/raid` times read as before; the boss list and events as before.
2. `/admin settings` → "Change…": `EST` is refused with the abbreviation sentence, `Paris` with "not a time zone I know"; `Europe/Berlin` is taken, the line shows Berlin's time, Recent changes lists it.
3. After the change: the region summaries and an active raid's post show Berlin times; `/raid … time: 18:00` means 18:00 Berlin; the events forum is redrawn; the heatmap rebuilds (log line).
4. The boss list: in the hours between Berlin's and New York's rotation edge, `/raid` offers Berlin's bosses; the announcer tells the test server at Berlin's edge.
5. `/admin event-window` set in Berlin's zone: the owner's DM says local time in every server's zone; ending it ends it now.
6. The web map under `/s/<guild>/`: times and days in Berlin's zone; `/userscript` unchanged.
7. Back to `America/New_York`: everything returns as in step 1.
