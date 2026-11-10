# Phase 8R-7: Everyone's Events, a Map Link per Stop: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the eighth plan of reports at stops (Gantt phase 17), from the staging of 8R-6 on 2026-10-24 (follow-ups, "From the staging run of 8R-6"):

- **F1 (Important):** ScrapedDuck's in-person City Safari in Boston (eventType `city-safari`, local times, research flag) was read as everyone's research event and cut Pittsburgh's day research at 10:00. Now one rule, `isForEveryone` (`src/domain/time/event-reach.ts`), decides for every reader of the events feed:
  - an event with times in a zone of their own (`Z`, `+09:00`) is another city's;
  - `city-safari` and `safari-zone` are in-person;
  - a Wild Area, GO Tour or GO Fest counts only as its Global edition (the word `global` in its id or its name).
  - The research reader also reads only an allow list of types (`event`, `community-day`, `research-day`, the three big types; Matt, 2026-10-24), and logs a flagged type off the list once per type.
  - Stored research events of another kind are not used after a restart (`loadResearch`); no row is deleted.
  - Big events now take a Global edition by its name too; event spawns leave out a GO Tour city at local times; max events leave out zoned items.
- **E1 (Matt):** each stop's name is a link to its place on Google Maps, `**[Stop](<…>)** · address`, in "Today's Stops" (every stop line, the plain text too) and in the research and Rocket DMs, which had no map. Coordinates rounded to five decimals (`stopMapsUrl`); the name always made plain without a working address. Raid and max battle DMs keep their Map button; the grunt message keeps its Where line with `[Map]`.

**Tech stack:** TypeScript 6.0, Node 24, discord.js v14, Kysely and Vitest. No new dependency, no migration, no setting, no command change (no deploy needed).

**Spec:** the brief `.superpowers/sdd/8r-7-in-person-events/brief.md` (git-ignored) with its review decisions (R1–R11) and Matt's answers (R2: allow list; R6: the name as the link, also in the DMs).

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto-8r7` (tip `2e02d8db`, tag `proto-8r7-r2`), one commit per task, on `stop-reports` 0d9c5364. Each commit typechecks and passes its tests; on the tip the full check passes (9,595 tests, 1 skipped). No repository or database test changed, so the database suite runs only on the plan's tip.

**Reviews:**

- **The brief:** a fresh Opus reviewer (R1–R11: the stored-row path, the max events reader, the link's cost; R2 and R6 answered by Matt).
- **The prototype:** an Opus reviewer: ready after minor fixes (8R7-1 the post's link text without a working address, 8R7-2 the busy-day test on the real budget constants, 8R7-3 a comment, 8R7-4 a spawn test of a Global edition by id). Folded into the two commits; the fix round's diff read by the controller.

**Conventions:** read `CLAUDE.md` and `docs/architecture/stop-reports.md`, `notifications-and-dms.md`, `utilities.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck and its own test files. The full check, the build and the database suite run once on the tip.

---

## Tasks

### Task 1: 8R-7 task 1: in-person events left out of everyone's events (F1)

Prototype commit: `5165ec17fafd7b46a816866f181e5f51a279e66d`

One rule for the readers of ScrapedDuck's events feed, src/domain/time/event-reach.ts:
isForEveryone leaves out zoned times, the in-person types (city-safari, safari-zone) and a
Wild Area, GO Tour or GO Fest that is no Global edition (the word global in the id or the
name). The research reader reads an allow list of types (Matt's R2) and names a flagged type
off the list once per type in the log; loadResearch uses no stored row of another kind. The
big events take a Global edition by its name too, the spawn events leave out a GO Tour city at
local times, the max events leave out zoned items. A fixture of real items of 2026-10-24 runs
through every reader.

**Files:**

```
 docs/architecture/notifications-and-dms.md       |   2 +-
 docs/architecture/stop-reports.md                |   1 +
 docs/architecture/testing.md                     |   1 +
 docs/architecture/utilities.md                   |   5 +++--
 src/domain/time/big-events.test.ts               |  21 +++++++++++++++++++++
 src/domain/time/event-reach.test.ts              | 126 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/time/event-reach.ts                   |  80 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/time/max-events.test.ts               |  20 ++++++++++++++++++++
 src/domain/time/max-events.ts                    |  31 +++++++++++++++++--------------
 src/domain/time/research-events.test.ts          |  92 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/domain/time/research-events.ts               |  60 ++++++++++++++++++++++++++++++++++++++++++++++++++++++------
 src/domain/time/spawn-events.test.ts             |   8 ++++++++
 src/domain/time/spawn-events.ts                  |  32 ++++++++++----------------------
 src/services/raid-event-service.test.ts          |  49 +++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/raid-event-service.ts               |  36 ++++++++++++++++++++++++++++++++++--
 test/fixtures/scrapedduck-events-2026-10-24.json | 136 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/event-reach.ts                      |  19 +++++++++++++++++++
 17 files changed, 671 insertions(+), 48 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/time/big-events.test.ts src/domain/time/event-reach.test.ts src/domain/time/max-events.test.ts src/domain/time/research-events.test.ts src/domain/time/spawn-events.test.ts src/services/raid-event-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 5165ec17fafd7b46a816866f181e5f51a279e66d -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-7 task 1: in-person events left out of everyone's events (F1)`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index 88660eaee10a3871ced9cfc18f11fa4c96a1ff27..ad029d36da84fae23c84b216c7ab0764ab4d2f3b 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -27,6 +27,6 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 ## Spawn reports
 
 - A spawn report is `ctx.spawns.report(...)` (`SpawnService`), reached by `/wild` and by the live map (plan 8M-4S; `web.md`, "Spawns on the map") through one code path: `readSpawn` (`wild.ts`: the Pokémon and the details, as the command's guard and handler read them) and `reportSpawnAs` (`spawn-report.ts`: the report, the command's words, a report's link and a channel named by the caller's `SpawnNames`); a map report's point is its `near`, a pin (`PlaceFinder.pin`). The report is a components-v2 message in the region's text channel (`spawnMessage`: `### Wild X`, the IVs and the reporter, when it goes away, the picture beside them; `**Where**`; `SPAWN_CAUTION` and the footer in small print; plan 8B-1), classic text where the bot may not post embeds (`spawnTextMessage`, with the legacy warning); a message Discord refuses with Invalid Form Body is sent once more without its picture (the Unown copy too), and the DM says when the report goes away as the report does (`SpawnNews.goneAt`); deleted after `SPAWN_MINUTES`, also posted in the Unown channel where there is one (`sightingMessage`: the same container headed by the sentence that names the region, which stays). Every report that stands is a row of `SpawnReport` (`SpawnReportStorage`; twin `MemorySpawnReports`) until it is deleted, and `sweep()` (with the hourly upkeep of `PartyScheduler`, also at start) deletes what no process deleted at its time and gives a report up a day after it. Every report is told to who wants it; a member may make five in half an hour (`WILD_THROTTLE`; Matt, 2026-10-13). `details` (where it is) is required. What never appears in the wild is refused with a sentence and not offered (`appearsInWild`, `src/domain/pogo/wild.ts`): legendaries, mythicals, ultra beasts, megas and primals, except the species of `settings.wildSpawnExceptions` (default the lake trio; the Galarian birds stay refused while they come only from a Daily Adventure Incense), read once per catalogue by `wildExceptionsOf(ctx)`. Unown is an ordinary species; `UnownWantService.noticed(interaction)` gives a holder of the old role a spawn want once (table `UnownWantGift`).
-- **Costumed spawns** (plan 8R-4, design 5, F11): a report is costumed when an event on at its moment lists that very entry costumed (`costumedSpawn`, `src/domain/time/spawn-events.ts`: the species' entry for a species, the form's for a form; listed plain and costumed both, costumed). The events are the global ones of ScrapedDuck's feed with spawns (`parseSpawnEventFeed`, read by `RaidEventService` with the research flags and kept in memory, `spawnEvents()`, `SpawnEventProvider`; one on now that a read drops is kept while it lasts): a community day's spawns (`extraData.communityday.spawns`) and a spotlight hour's (`extraData.spotlight.list`) from the feed, any other event the feed marks `generic.hasSpawns` from the Spawns section of its Leek Duck page (`parseEventSpawns`, `src/domain/research/leekduck.ts`). Only the types of an allowlist (`SPAWN_EVENT_TYPES`, Matt's R-M5 and Q2): `event`, `community-day`, `pokemon-spotlight-hour`, `pokemon-go-tour`, and the Global Wild Area and Global GO Fest (`wild-area` and `pokemon-go-fest`, `GLOBAL_ONLY`, whose feed name says Global, `GLOBAL_EDITION`: the feed has nothing firmer; a city's has `Z` times too, and the Global one must have none); never a city's Wild Area or GO Fest, a City Safari (location-bound), a season, a type the feed adds later, an event at fixed times of a zone of its own (`Z`: Pokémon Night Out), nor anything without hours or longer than 31 days. A page gives at most 100 Pokémon (B4); Leek Duck's free-text sentences ("you might also encounter X wearing …") are not read (B-D2, a follow-up). `EventSpawnService` (`src/services/event-spawn-service.ts`, `ctx.eventSpawns`, `EventSpawnProvider.sightingsAt(at)`: the listed Pokémon placed by `costumedSighting`) reads an event's page while it is on, again every six hours (`REREAD_MS`), with Pine's User-Agent and `readLimitedText`, only Leek Duck's events pages (`isEventPage`; another address is skipped and said once; never followed to another address, `redirect: 'error'`, and refused where the answer's `url` is no events page, B3), keeping the spawns of the last good read by event in a `BoundedMap`; a page never read gives none. It looks again at the next start of an event, at the latest in an hour (`nextReadIn`); `app.ts` starts it after the first read of the events feed and stops it at shutdown. `SpawnService` asks it at the report's moment (`costumes`; one that throws is logged and the report goes out plain): `SpawnView.costumed` ("### Wild costumed Pikachu", "A wild costumed **Pikachu**" in DMs), `SpawnNews.costumed` for the matchers, and the posted outcome's `costumed` for `/wild`'s and the map's answer ("Reported: a wild costumed Pikachu"). `/want`'s Costumes field shows for a Pokémon an event on lists costumed (`costumesShown`, review R7).
+- **Costumed spawns** (plan 8R-4, design 5, F11): a report is costumed when an event on at its moment lists that very entry costumed (`costumedSpawn`, `src/domain/time/spawn-events.ts`: the species' entry for a species, the form's for a form; listed plain and costumed both, costumed). The events are the global ones of ScrapedDuck's feed with spawns (`parseSpawnEventFeed`, read by `RaidEventService` with the research flags and kept in memory, `spawnEvents()`, `SpawnEventProvider`; one on now that a read drops is kept while it lasts): a community day's spawns (`extraData.communityday.spawns`) and a spotlight hour's (`extraData.spotlight.list`) from the feed, any other event the feed marks `generic.hasSpawns` from the Spawns section of its Leek Duck page (`parseEventSpawns`, `src/domain/research/leekduck.ts`). Only the types of an allowlist (`SPAWN_EVENT_TYPES`, Matt's R-M5 and Q2): `event`, `community-day`, `pokemon-spotlight-hour`, and the Global GO Tour, Wild Area and GO Fest (`pokemon-go-tour`, `wild-area` and `pokemon-go-fest`, everyone's by the readers' one rule, `isForEveryone` of `src/domain/time/event-reach.ts`, `utilities.md`, "Everyone's events": the word `global` in the feed's id or name, the feed has nothing firmer; a city's has `Z` times too, and the Global one must have none; a GO Tour's city edition at local times is out since plan 8R-7, as a Wild Area's and GO Fest's were); never a city's Wild Area, GO Tour or GO Fest, a City Safari (location-bound), a season, a type the feed adds later, an event at fixed times of a zone of its own (`Z`: Pokémon Night Out), nor anything without hours or longer than 31 days. A page gives at most 100 Pokémon (B4); Leek Duck's free-text sentences ("you might also encounter X wearing …") are not read (B-D2, a follow-up). `EventSpawnService` (`src/services/event-spawn-service.ts`, `ctx.eventSpawns`, `EventSpawnProvider.sightingsAt(at)`: the listed Pokémon placed by `costumedSighting`) reads an event's page while it is on, again every six hours (`REREAD_MS`), with Pine's User-Agent and `readLimitedText`, only Leek Duck's events pages (`isEventPage`; another address is skipped and said once; never followed to another address, `redirect: 'error'`, and refused where the answer's `url` is no events page, B3), keeping the spawns of the last good read by event in a `BoundedMap`; a page never read gives none. It looks again at the next start of an event, at the latest in an hour (`nextReadIn`); `app.ts` starts it after the first read of the events feed and stops it at shutdown. `SpawnService` asks it at the report's moment (`costumes`; one that throws is logged and the report goes out plain): `SpawnView.costumed` ("### Wild costumed Pikachu", "A wild costumed **Pikachu**" in DMs), `SpawnNews.costumed` for the matchers, and the posted outcome's `costumed` for `/wild`'s and the map's answer ("Reported: a wild costumed Pikachu"). `/want`'s Costumes field shows for a Pokémon an event on lists costumed (`costumesShown`, review R7).
 - `/wild near:` (plan 8W-2) names a gym, PokéStop or Power Spot of the server's regions: the option's autocomplete is `ctx.placeFinder` (`nearChoices`: `placeLabel` "Fountain Square (PokéStop) · Market Street", the title cut and never where it is; the member's region first), resolved in the command's guard so that a refusal does not count (`namedPlace`, `src/commands/place-option.ts`: a value whose place is gone or of another kind now is `PLACE_GONE` "That place is gone from the list; pick it again.", one outside the regions `NOT_HERE`; typed text only on `clearOf` of the one search, the one hit of every word; resolved once per interaction (plan 8W-3: `resolvedPlaces`, a `WeakMap` by the interaction, so that the command takes what its guard found, one search in all), else "Which place is …?" with five suggestions); `details` stays required. A maps link or coordinates typed there are a pin (plan 8D, Matt, 2026-10-17; the option takes `MAX_PLACE_TEXT` 1,500 characters for long links, and its autocomplete offers nothing for one): `readPin` (`src/domain/geo/pin-input.ts`, pure, over `readLocation`: coordinates, `geo:` with a phone's label, Google Maps with the place's pin before the map's centre and `/place/<name>/` as `linkName`, Apple Maps `ll`, `coordinate`, `q` with coordinates, `sll` only on a map that asks for nothing (a search near a point, `q=coffee&sll=…`, is `no-point`, as Google’s search link), OpenStreetMap `mlat`/`mlon`, `#map=`) and `PlaceFinder.pin` (refused outside the server's regions, `PIN_NOT_HERE`; named by the nearest gym, PokéStop or Power Spot within 50 m); a short link (`maps.app.goo.gl`, `goo.gl/maps`, Apple's `maps.apple/p/…`, OpenStreetMap's `osm.org/go/…`) is refused with `SHORT_LINK` and never followed, a link of a maps site that shows no one place (a search, a Street View, `geo:0,0?q=<address>`) with `NO_POINT`, numbers that are no place with `NO_PLACE_ON_EARTH`; the autocomplete offers nothing for any of them. A pin is named by the nearest of the server's gyms (by its nickname, as its post) and of the kept PokéStops and Power Spots in the server's regions with a title. The option's helpers are `src/commands/place-option.ts` (`namedPlace`, `nearChoices`, `placeLabel`, `placeWords`), shared with `/meetup`. The report carries the place as a snapshot, `SpawnReport.near` (`SpawnPlace`, which is `Place`: never looked up again, the report is short-lived; a pin is `pinLine` without a label, `📍 Near **X** (PokéStop) · [Map](<…>)`, `📍 **<link's name>**` or `📍 Dropped pin`, without a picture): `nearLine` ("Near **<title>** (PokéStop) · <address> · [Map](<…>)": the address a gym's `addressLine`, a Wayspot's `wayspotAddressLine` (`wayfarer-address.ts`: as a gym made of it would show it, never the town, postal code and country Wayfarer repeats), "(no address available)" for none where the place's picture stands beside the line, so that the picture never sits beside a bare name (plan 8W-3: without the picture, in a DM's brief, a report sent again without pictures or the classic text, the address is left out; the moderators' post of a meetup request, `meetup-safety.ts`, words it by its own picture the same way); title and address through `plainNoLinks`) after the details under **Where**, with the place's picture beside them where `wayspotPicture` allows (the Pokémon's beside the head), in the sighting, the text report and the DM's brief alike; a message Discord refuses is sent once more without either picture.
 - Text a member typed that reaches other members' DMs or a spawn report goes through `plainNoLinks` (`src/render/text.ts`), which also breaks bare addresses; a member's name is always shown through it. `plain()` leaves an address alone (a meetup's description may link).
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index d986fa123196b0afb208c8eb77a137356199bc86..3267682978ba5b80d0dbf2c452be2b7b5257d1e2 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -24,6 +24,7 @@ What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/202
 ## Research periods
 
 - The events feed's research flags (`extraData.generic.hasFieldResearchTasks`, `events.json` read where `events.min.json` lacks `extraData`) are kept as `ResearchEvent` rows by `RaidEventService` (`researchEvents()`, `ResearchEventProvider`), a stored event kept 30 days after its end, so a restart or an event dropped from the feed loses no period; one not begun that a read no longer lists (moved or cancelled) is dropped, as the raid events' (`removeNotSeen`); a read whose feed has no research flags at all (neither `events.min.json` nor `events.json`) keeps what is stored as it is, said once in the log. `onResearchChange(listener)` tells of every change (a read, the kept ones loaded): the pinned posts' timer and periods follow.
+- **Only everyone's events** (plan 8R-7, the staging of 8R-6's F1: ScrapedDuck's Boston City Safari, local times and a research flag, cut Pittsburgh's day research at 10:00): `parseResearchEventFeed` reads an allow list of types, `RESEARCH_EVENT_TYPES` (Matt's R2, 2026-10-24: `event`, `community-day`, `research-day`, `pokemon-go-tour`, `wild-area`, `pokemon-go-fest`), and of those only everyone's (`isForEveryone`, `utilities.md`, "Everyone's events": the last three in their Global edition only, nothing at the fixed times of another zone). A City Safari and every other type are left out; a type off the list that the feed flags with research (not an in-person one, which is left out on purpose) is said once per type while the bot runs (`unreadResearchTypes`, `an event type with field research is not read`, with the type and the first such event's id), so a new type is noticed. `loadResearch` takes only the stored rows of such a kind (`isResearchEventKind`, review R1): a row kept before the fix (a dev database) stays stored and unused until `removeEnded` forgets it a month after its end; nothing deletes it. The dev database's `StopReport` rows keyed `event:pokemon-go-city-safari-boston-2026-rescheduled:…` drop out of the post after the fix (their period is no longer on).
 - `src/domain/time/research-periods.ts` (pure): `periodAt(events, at, zone)` gives the period on (`day:<yyyy-mm-dd>` to local midnight; for a multi-day event, a rotation, `event:<id>:<yyyy-mm-dd>` per local day of it: its start and end rotate the tasks for good, and inside it the tasks roll over at each local midnight as on any day (Matt, 2026-10-22: Into the Wild's day 1 runs from 10:00 to midnight, its last day from midnight to 20:00, and the day's research after it is new); `event:<id>:<yyyy-mm-dd>` also for each day of a big event's hours, a window kept to the millisecond; an intra-day event is a window under which the day's reports wait and come back after it, `waiting`); `eventShape`: one local day is a `window`, a big event (`BIG_EVENT_TYPES`) over days whose hours end before midnight is `daily`, any other (crossing midnight included, Matt's answer 6) a `rotation`. `nextPeriodChange` is the next midnight, start or end. Midnight is Luxon's in `settings.timezone`, DST days included.
 
 ## Reports and `/research`
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index ab070f56b46209f6220ef988973e2587d35bd543..5401305f0a0888b2331d27f68bcf3827e55891a4 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -66,6 +66,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - The kept max and big events (plan 8X-F, `utilities.md`): `maxEventCases` (`test/support/max-event-store-cases.ts`, with `feedMaxEvents()` and `feedBigEvents()`, those of the recorded feed) run on `MaxEventRepository` and its twin `MemoryMaxEvents` (`test/support/max-event-store.ts`, `failing` per method).
 - The task list: `readResearchPage()` (Leek Duck's page of 2026-10-21, `test/fixtures/leekduck-research.html`, unchanged: 58 tasks, 299 rewards), `researchTasksOfPage()` (parsed once, frozen), `pageTask(text)` and `researchTasksFixture(tasks?, readAt?, staleAfterHours?)` (`test/support/research.ts`, a `ResearchTaskProvider` with the versions of its tasks, plan 8R-5, `versions(task)` and `byVersion`, `readAt` `null` for a list never read, out of date `staleAfterHours` (6) after `readAt`, `ctx.researchTasks` of `createTestContext()`). Events with spawns (plan 8R-4): `readSpawnEventFeed()` (ScrapedDuck's whole `events.json` of 2026-10-22, `test/fixtures/scrapedduck-events-2026-10-22.json`) and `readEventPage(file)` (Leek Duck's Halloween 2026 Part I and Teddiursa Spotlight Hour pages, cut to the sections read), `test/support/spawn-events.ts`; `createTestContext()` gives `ctx.eventSpawns` with no spawns, and `partyServiceWith([], { spawnCostumes })` a `SpawnService` that asks `spawnCostumes.sightingsAt`. Research events: `raidEventsFixture(zone, { research })`; the events feed fixture `test/fixtures/max-events.json` holds the two research events of November 2026.
 - `createTestContext()` gives `ctx.stopReports` (a `StopReportService` over `MemoryStopReports` and the context's events, rewards hashed with the fixture's catalogue; a test that makes its own passes `rewardHash: fixtureRewardHash`, `test/support/stop-reports.ts`, the option being required), `ctx.stopPostLinks` (no post holds anything: a test of "Already reported" passes its own `linkOf`, plan 8R-5), `ctx.pineStops` (none, over memory and the context's Wayspots), `ctx.targetWants` and `ctx.wantBoxes` (`MemoryWantBoxes` over the context's wants and target wants); `partyServiceWith()` gives `targetWants` to the notifier (`made.targetWants`), and `notifying.researchPosts` a test's own links (`notify-service.research.test.ts`).
+- Everyone's events (plan 8R-7): `readEveryoneFeed()` (`test/support/event-reach.ts`; nine items of ScrapedDuck's feed of 2026-10-24, `test/fixtures/scrapedduck-events-2026-10-24.json`, cut to the fields the readers read, values unchanged: the Boston City Safari, Night Out Los Angeles, Wild Area Mexico City and Global, Into the Wild, Pawniard Community Day, GO Tour Alola's Kaohsiung, Los Angeles and Global) runs through every reader of the events feed in `event-reach.test.ts`.
 - `FakePartyGateway` pins (`pinMessage` / `unpinMessage`): `noPinning` (channels where it is `not-allowed`), `pinLimit`, `pinNotices` (the notices it deleted), `pinnedIn(channelId)`.
 - Team GO Rocket (plan 8R-2): `readRocketFeed()` (ScrapedDuck's `rocketLineups.min.json` of 2026-10-22, `test/fixtures/rocket-lineups.json`, unchanged: 26 lineups, 24 choices), `rocketChoicesOfFeed()` (parsed once, frozen), `feedChoice(key)` and `rocketLineupsFixture(choices?, readAt?, staleAfterHours?)` (`test/support/rocket.ts`, a `RocketLineupProvider`, `readAt` and `staleAfterHours` (24) as the task list's, `ctx.rocketLineups` of `createTestContext()`; `[]` is a list never read). `rocketReport(overrides)` and `MUDKIP` (`stop-report-cases.ts`, a Water-type grunt at stop 1 for half an hour) beside `researchReport`; `rocketLineupCases` (`listedChoice`) and `gruntMessageCases` (`gruntRow`) in `test/support/rocket-store-cases.ts`, twins `MemoryRocketLineups`, `MemoryGruntMessages` (`failing` per method). Two lineups of a grunt type (plan 8R-4L): the fixture's water and untyped grunts have them (`feedChoice('grunt:water').lineups`: Mudkip's, then Magikarp's; `lineupChoice` and `lineupValue` make a choice and its picked value of one); `magikarpLineup(overrides)` and `MAGIKARP` (`stop-report-cases.ts`: the Magikarp lineup by Misty a minute after `REPORT_NOW`), `waterWithLineups()` (`rocket-store-cases.ts`, a short choice with both lineups and their fingerprints); a row of before (a bare list) and unreadable lineups are tested only against the repository, by a raw write (`rocket-repositories.db.test.ts`). A grunt's messages refined in place are edited on the fake gateway (`FakeMessage.edits`); `grunt-messages.test.ts` fails an edit per channel (`failEdit`) and holds a send or an edit (`hold(kind, channel)`, `rocket-reports.test.ts` `holdSend(channel)`: a `HeldCall` of `test/support/held-call.ts`, named by `heldCall(what)`, whose `reached` the test awaits to act while the call is on its way, then `release()`; review R1; `reached` gives up after `TALLY_LIMIT_MS`, naming the call, as `Tally.reached` does, fix round 2, F8), and records each edit's kind as it is asked for (`tried`: that nothing more was asked while an edit is held, after `settle()`, and the kinds a refine tries). The notifier of a restarted process, which remembers nothing it told, is `new NotifyService(made.notifyOptions)` over the same stores and `dms` (`partyServiceWith`; `notify-service.rocket.test.ts`'s `restart()`). A Take back whose id is gone is tested by moving the report's row of `MemoryStopReports` to another id, as a report put back would be (`rocket.test.ts`). `createTestContext()` gives `ctx.rocket` (a `RocketService` over the context's reports that posts no message, as in rehearsal mode); a test of grunts' messages passes its own over a `GruntMessageService` on a `FakePartyGateway` (`rocket.test.ts`, `rocket-reports.test.ts`), with `setTimer` to keep or fire the deletes by hand.
 
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index fd6c00fdd59092ffda19f62c1fc519386f93a881..04c283d7452e9d65df26130e9507137e3ed042b1 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -26,8 +26,9 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 - Max battle tiers are `MaxTier` (`D1` to `D5`, `G`; `src/domain/pogo/max-tier.ts`), the one spelling in the domain, the state document, `RaidBoss.level` and the history; `BattleKind` (`raid`, `dynamax`, `gigantamax`, `battleKindOf(tier)`) is only for lobby sizes and train kinds; their words are there too (`maxTierLabel` "Dynamax 2★", `maxBossTitle` "Dynamax Machamp (2★)", `maxBossChoiceName` "Machamp · Dynamax 2★" / "Gigantamax Machamp").
 - Max bosses come from `ctx.maxBosses` (`bosses()`: the list in effect, D1 to G, then name; `feedBosses()`, the feed as stored), staff's list from `ctx.maxBossAdmin`. Max battles are always on (Matt, 2026-10-21, plan 8X-3: trains, meetups and raid bosses cannot be switched off either): `settings.maxBattles` has a default for every key, and a file without the block has them all. The feed is Pokebattler's `GET /raids` (`settings.maxBattles.url`, `MAX_BOSS_FEED_URL` unless set, read every `refreshMinutes`, 6 hours unless set; about 700 KB): `parseMaxBossFeed` (`src/domain/pogo/max-bosses.ts`) reads `RAID_LEVEL_1_MAX` to `_5_MAX` as `D1` to `D5` and `RAID_LEVEL_6_MAX` as `G`, verified or not (Matt, 2026-10-20), never the `_FUTURE` and `_LEGACY` twins nor the raid tiers (Pokebattler is no raid boss source); a max tier it does not know that has bosses is reported. `maxBossOf` maps an id: the entry of that Pokebattler id, else the entry the id names as a catalogue key or alias (a bare species is the species, or the default form of a species known by one); a Gigantamax id drops `_GIGANTAMAX` and is that Pokémon with the tier `G`, never an entry of its own; a mega is no max boss; an unknown id is a boss by a name made of it, logged once. An upcoming boss is a boss from the start of its `startDate`'s day in `settings.timezone` (Pokebattler gives one instant for an event held at a local hour: the lake trio's 14:00 Max Battle Day is 17:00 in New York), stored as its `firstSeen` (`FeedBoss.startsAt`), so the list leaves it out until then, after a restart too; Pokebattler gives no end in any max tier, so `/max`'s list leaves an upcoming boss out again once an event that named it is over and no event names it now or later (`withoutEndedUpcoming`, plan 8X-3: one the feed first had from that event's day on; a boss of the pool from before stays). It needs the ended event still known: ScrapedDuck drops an event once it has ended; the max events are kept in the database since plan 8X-F (`MaxEvent`, below), an ended one while it started less than eight days ago, so only a restart later than that offers the boss again until Pokebattler drops it (step 11 of the 8X-2 staging, after 2026-10-24, decides whether more is needed). `dynamaxPokemon` is not read. Max boss changes are not announced.
 - What may be typed as a max boss off the lists is the game master's (`GameData.maxBattles`, `catalogue.canDynamax` / `canGigantamax`, `GAME_DATA_VERSION` 6): the modes of `pokemonExtendedSettings.breadOverrides` (`BREAD_MODE`; `BREAD_DOUGH_MODE`, `_2` for Gigantamax), which every such Pokémon has, not `BREAD_POKEMON_SCALING_SETTINGS`, which lists only the 70 species with visuals of their own; a game master with no Pokémon that can Dynamax (the field or mode renamed) is a `game data warning`, not a refused refresh. `typedMaxBoss(entry, bosses, catalogue)` gives a typed Pokémon's listed bosses and the other tiers it may battle in. A Gigantamax boss's picture is `maxBossPicture` (the game's `pm<dex>.f<FORM>_GIGANTAMAX`, else `pm<dex>.fGIGANTAMAX`, else its own). PokeMiners' list of icon files has only 13 `fGIGANTAMAX` icons (no `pm25`: Gigantamax Pikachu shows plain Pikachu, staging of 8X-F, F2); a file name in no list is never guessed, and the plain picture stays until PokeMiners lists the Gigantamax one (Matt, 2026-10-22, plan 8X-G). Dynamax has no look of its own in the game: its battles show the plain picture.
-- The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`). The max events and the big events are kept in the database as last merged (plan 8X-F; the staging of 8X lost the week's boss to a restart after the feed dropped its Monday): table `MaxEvent` of migration 029 (`MaxEventRepository`, twin `MemoryMaxEvents`, shared `maxEventCases`; a `kind` column, `big` for a big event; replaced whole after each read, so what the merge drops, a max event that started eight days ago, a big event once over, one not begun that the read no longer lists, is gone from it too), loaded before the first read (`RaidEventService.loadMax`, in `app.ts` after `loadResearch`; a read made before it stays as read; it logs `max events loaded` with how many max and big events, plan 8X-G, and a read's `raid events read` says them too). The raid events (`merged`) are still kept in memory only: a follow-up; so are the events with spawns of plan 8R-4 (`spawnEvents()`, `mergedSpawns`; `notifications-and-dms.md`, "Spawn reports"). Their hours are always the feed's own; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3, `maxBossOptions`, values `m:<tier>:<key>`): the featured bosses first, then 5 stars down to 1, Gigantamax last; during a big event's hours (`bigEventAt`; Matt, 2026-10-21, Q-A) the Gigantamax bosses first, ahead of the featured Dynamax ones, each part in its order. `/max` reads a boss with `readMaxBoss` (`src/commands/max/max-input.ts`): a choice, or a Pokémon typed in full (`Gigantamax ` or `Dynamax ` before it names the kind), its listed boss first, else the tier `tier:` names (asked for, `WHICH_TIER`), Gigantamax needing none; in `/boss` (whose `tier:` is for max battles only, refused in a raid's or a train's post) the listed boss of the battle's own kind first, and in a Gigantamax battle a Pokémon the game lets battle so, while a Dynamax boss on no list needs `tier:` as with `/max` (plan 8X-F: the battle's stars were taken in silence before; this question and the refusal of `tier:` outside a max battle give the use back, `givesBack`). A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
-- The big events (plan 8X-3; Matt, 2026-10-21): ScrapedDuck's `wild-area`, `pokemon-go-tour` and `pokemon-go-fest` (`BIG_EVENT_TYPES`; the last a guess, not in the feed of 2026-10-20: one line to change) bring Gigantamax battles nearly all day, over a day or two; raids act as usual. `parseBigEventFeed` reads the global editions only (an id with the word `global`, local times; the in-person city editions have UTC times and are out of scope until one comes to a region Pine serves), `RaidEventService.bigEvents()` keeps those of the last good read, and one that has begun and not ended that a later read no longer lists (`mergedBig`, by the feed's id, as `mergedMax`) (`ctx.raidEvents`, which is `RaidEventProvider & MaxEventProvider`), `bigEventAt` is the one on at a time. They feature nothing: their names name no boss.
+- The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`). The max events and the big events are kept in the database as last merged (plan 8X-F; the staging of 8X lost the week's boss to a restart after the feed dropped its Monday): table `MaxEvent` of migration 029 (`MaxEventRepository`, twin `MemoryMaxEvents`, shared `maxEventCases`; a `kind` column, `big` for a big event; replaced whole after each read, so what the merge drops, a max event that started eight days ago, a big event once over, one not begun that the read no longer lists, is gone from it too), loaded before the first read (`RaidEventService.loadMax`, in `app.ts` after `loadResearch`; a read made before it stays as read; it logs `max events loaded` with how many max and big events, plan 8X-G, and a read's `raid events read` says them too). The raid events (`merged`) are still kept in memory only: a follow-up; so are the events with spawns of plan 8R-4 (`spawnEvents()`, `mergedSpawns`; `notifications-and-dms.md`, "Spawn reports"). Their hours are always the feed's own, and an item with a time of a zone of its own (`hasOwnZone`, plan 8R-7: an in-person event's) is left out and lends its hours to none; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3, `maxBossOptions`, values `m:<tier>:<key>`): the featured bosses first, then 5 stars down to 1, Gigantamax last; during a big event's hours (`bigEventAt`; Matt, 2026-10-21, Q-A) the Gigantamax bosses first, ahead of the featured Dynamax ones, each part in its order. `/max` reads a boss with `readMaxBoss` (`src/commands/max/max-input.ts`): a choice, or a Pokémon typed in full (`Gigantamax ` or `Dynamax ` before it names the kind), its listed boss first, else the tier `tier:` names (asked for, `WHICH_TIER`), Gigantamax needing none; in `/boss` (whose `tier:` is for max battles only, refused in a raid's or a train's post) the listed boss of the battle's own kind first, and in a Gigantamax battle a Pokémon the game lets battle so, while a Dynamax boss on no list needs `tier:` as with `/max` (plan 8X-F: the battle's stars were taken in silence before; this question and the refusal of `tier:` outside a max battle give the use back, `givesBack`). A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
+- The big events (plan 8X-3; Matt, 2026-10-21): ScrapedDuck's `wild-area`, `pokemon-go-tour` and `pokemon-go-fest` (`BIG_EVENT_TYPES`; the last a guess, not in the feed of 2026-10-20: one line to change) bring Gigantamax battles nearly all day, over a day or two; raids act as usual. `parseBigEventFeed` reads the global editions only (the word `global` in the id or, since plan 8R-7, in the name, and local times: `isForEveryone` below; the in-person city editions have UTC times and are out of scope until one comes to a region Pine serves), `RaidEventService.bigEvents()` keeps those of the last good read, and one that has begun and not ended that a later read no longer lists (`mergedBig`, by the feed's id, as `mergedMax`) (`ctx.raidEvents`, which is `RaidEventProvider & MaxEventProvider`), `bigEventAt` is the one on at a time. They feature nothing: their names name no boss.
+- **Everyone's events** (plan 8R-7, after the staging of 8R-6 read ScrapedDuck's Boston City Safari, local times and a research flag, as everyone's research event): one rule for the readers of the events feed, `src/domain/time/event-reach.ts` (pure). The feed has no field that says "in-person", so the rule goes by type, zone and edition: `isForEveryone({ eventID, eventType, name, start, end })` is false where either time has a zone of its own (`hasOwnZone`: `Z`, `+09:00`; Pokémon Night Out, a city's Wild Area or GO Tour), for an in-person type (`IN_PERSON_TYPES`: `city-safari`, and `safari-zone` should Leek Duck's older type come back; every edition is in a city, Matt, 2026-10-22), and for a type with city editions (`CITY_OR_GLOBAL_TYPES`: `wild-area`, `pokemon-go-tour`, `pokemon-go-fest`) that is no Global edition (`isGlobalEdition(id, name)`: the word `global` as one of the id's words or in the name, any case); true otherwise. `isForEveryoneKind(eventType, id, name)` is the same without the times, for what is kept without them. The research reader (`parseResearchEventFeed`, `stop-reports.md`), the big events' (`parseBigEventFeed`) and the spawn events' (`parseSpawnEventFeed`, `notifications-and-dms.md`) use it beside their own type lists; the max events' (`parseMaxEventFeed`) leaves out zoned items only (its two types have no city editions); the raid events' (Raid Hour, Raid Day) needs none.
 - How long a max battle lasts (design Q9; Matt, 2026-10-20 and 21): battles rotate on the hour and the half hour, and a report is of a battle in progress, so the default end is the boundary of its rotation (`defaultMaxEnd`, `src/domain/time/max-end.ts`; `maxRotation`): in a short max event (`short`) the next :00 or :30 after the report, in an all-day one the next full hour, and for a Gigantamax battle the next full hour also in a big event and outside any event (`GIGANTAMAX_OUTSIDE_EVENTS`, unconfirmed: the one place to change; `maxRotation` takes another as its second argument, so a test tells a big event from outside), otherwise (a Dynamax battle on an ordinary day) the day's last battle time, or the start of the next max event later that day if sooner (`dayBattleEnd`, Matt, 2026-10-21, Q-B: one rule, to be revisited after the lake trio day of 2026-10-24; `/end` and `end:` still give a later end, and a report under five minutes before the event's start is asked about, the next rotation being the event's first half hour); always capped at `settings.maxBattles.lastBattle`. A report at or after the last battle time is `over`; one before the first battle is taken, its rotation counted from the first battle. `nextRotationEnd` is the end one rotation later (the ending-soon dialog of `/max`), by the rule as things are at the end (review B12: a Dynamax battle at the last boundary of its event has none), undefined at the cap and for a battle that would then last the day.
 - `/admin boss` takes the max tiers after the raid tiers (`BossTier`, `readTier`; not `autoset`, `readRaidTier`): `add`, `hide` and `shiny` with a max tier change the max boss list (a Pokémon the game data does not list as that kind of max boss gets a warning line, not a refusal), `remove` offers the overrides of both (one table numbers them), `list` shows the max bosses after the raid bosses, their upcoming ones under Coming, and `sync max:True` reads the max feed. `/boss-tier` stays raids only.
 - Pokémon nicknames change only through `ctx.nicknames` (`PokemonSearchService`: changes and reloads one at a time; `nicknameProblem` in `src/domain/pogo/nickname-rules.ts` refuses words other commands read, names and nicknames of other Pokémon; removal from every legacy row of the Pokémon; the column stays `, `-joined lower case).
diff --git a/src/domain/time/big-events.test.ts b/src/domain/time/big-events.test.ts
index c2bb528e7328a98b82e8f8cae44ff94e9eb9e305..982f22b1c0dd5648a6bb6b00c9538ea5164fd397 100644
--- a/src/domain/time/big-events.test.ts
+++ b/src/domain/time/big-events.test.ts
@@ -45,6 +45,27 @@ describe('parseBigEventFeed: the events with Gigantamax battles all day (plan 8X
     expect(fest.map((event) => event.name)).toEqual(['Pokémon GO Fest 2027: Global']);
   });
 
+  it('takes a Global edition by its name too, and no city’s at local times (plan 8R-7)', () => {
+    const item = (eventID: string, eventType: string, name: string) => ({
+      eventID,
+      eventType,
+      name,
+      start: '2027-07-10T10:00:00.000',
+      end: '2027-07-11T18:00:00.000',
+    });
+    const read = parseBigEventFeed(
+      [
+        // The word only in the name: read since plan 8R-7, as the spawn reader reads it.
+        item('pokemon-go-fest-2027', 'pokemon-go-fest', 'Pokémon GO Fest 2027: Global'),
+        item('pokemon-go-fest-2027-paris', 'pokemon-go-fest', 'Pokémon GO Fest 2027: Paris'),
+        item('pokemon-go-tour-alola-honolulu', 'pokemon-go-tour', 'GO Tour: Alola - Honolulu'),
+        item('wild-area-sendai-2027', 'wild-area', 'Wild Area 2027: Sendai'),
+      ],
+      MAX_ZONE,
+    );
+    expect(read.map((event) => event.id)).toEqual(['pokemon-go-fest-2027']);
+  });
+
   it('refuses what is no event of these: another kind, no hours, an end before the start', () => {
     const feed = [
       {
diff --git a/src/domain/time/event-reach.test.ts b/src/domain/time/event-reach.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c729389f7efa1ae83dac5b7dc56ad576675b8fef
--- /dev/null
+++ b/src/domain/time/event-reach.test.ts
@@ -0,0 +1,126 @@
+import { describe, expect, it } from 'vitest';
+import { readEveryoneFeed } from '../../../test/support/event-reach.js';
+import { readMaxEventFeed } from '../../../test/support/max-events.js';
+import { MAX_ZONE } from '../../../test/support/max-bosses.js';
+import { readSpawnEventFeed } from '../../../test/support/spawn-events.js';
+import { hasOwnZone, isForEveryone, isForEveryoneKind, isGlobalEdition } from './event-reach.js';
+import { parseBigEventFeed, parseMaxEventFeed } from './max-events.js';
+import { parseResearchEventFeed, unreadResearchTypes } from './research-events.js';
+import { parseSpawnEventFeed } from './spawn-events.js';
+
+const ZONE = 'America/New_York';
+
+const event = (
+  eventType: string,
+  name: string,
+  overrides: { eventID?: string; start?: string | null; end?: string | null } = {},
+) => ({
+  eventID: overrides.eventID ?? 'some-event-2027',
+  eventType,
+  name,
+  start: '2027-03-01T10:00:00.000',
+  end: '2027-03-02T20:00:00.000',
+  ...overrides,
+});
+
+describe('isForEveryone: an event for every member wherever they play (plan 8R-7)', () => {
+  it('tells a time with a zone of its own from a local one', () => {
+    expect(hasOwnZone('2026-10-25T02:30:00.000Z')).toBe(true);
+    expect(hasOwnZone('2027-05-30T01:00:00+09:00')).toBe(true);
+    expect(hasOwnZone('2027-05-30T01:00:00-0500')).toBe(true);
+    expect(hasOwnZone('2026-10-24T10:00:00.000')).toBe(false);
+  });
+
+  it('knows a Global edition by the word in its id or in its name, in any case', () => {
+    expect(isGlobalEdition('pokemon-go-wild-area-2026-global', 'Pokémon GO Wild Area 2026')).toBe(
+      true,
+    );
+    expect(isGlobalEdition('pokemon-go-fest-2027', 'Pokémon GO Fest 2027: Global')).toBe(true);
+    expect(isGlobalEdition('GLOBAL-fest', 'Fest')).toBe(true);
+    // A word inside another is none.
+    expect(isGlobalEdition('globalized-2027', 'Globally yours')).toBe(false);
+    expect(isGlobalEdition('pokemon-go-fest-2027-paris', 'Pokémon GO Fest 2027: Paris')).toBe(
+      false,
+    );
+  });
+
+  it('leaves out an in-person type in every edition, local times and all', () => {
+    expect(isForEveryone(event('city-safari', 'Pokémon GO City Safari: Boston'))).toBe(false);
+    expect(isForEveryone(event('city-safari', 'City Safari: Global'))).toBe(false);
+    expect(isForEveryone(event('safari-zone', 'Safari Zone: Liverpool'))).toBe(false);
+    expect(isForEveryoneKind('city-safari', 'x', 'y')).toBe(false);
+  });
+
+  it('takes a Wild Area, GO Tour or GO Fest only in its Global edition', () => {
+    for (const eventType of ['wild-area', 'pokemon-go-tour', 'pokemon-go-fest']) {
+      expect(isForEveryone(event(eventType, 'Something 2027: Global')), eventType).toBe(true);
+      expect(
+        isForEveryone(event(eventType, 'Something 2027', { eventID: 'something-global-2027' })),
+        eventType,
+      ).toBe(true);
+      expect(isForEveryone(event(eventType, 'Something 2027: Paris')), eventType).toBe(false);
+      expect(isForEveryoneKind(eventType, 'something-2027-paris', 'Paris'), eventType).toBe(false);
+    }
+  });
+
+  it('leaves out any event at the fixed times of another zone, Global or not', () => {
+    const night = event('event', 'Pokémon Night Out 2026 - Los Angeles', {
+      start: '2026-10-25T02:30:00.000Z',
+      end: '2026-10-25T06:59:59.000Z',
+    });
+    expect(isForEveryone(night)).toBe(false);
+    expect(
+      isForEveryone(event('wild-area', 'Wild Area: Global', { end: '2027-03-02T20:00:00Z' })),
+    ).toBe(false);
+    // The kind alone (a stored event's) says nothing of times.
+    expect(isForEveryoneKind('event', night.eventID, night.name)).toBe(true);
+  });
+
+  it('takes every other type at local times, and one without hours as far as the kind goes', () => {
+    expect(isForEveryone(event('event', 'Into the Wild'))).toBe(true);
+    expect(isForEveryone(event('community-day', 'Pawniard Community Day'))).toBe(true);
+    expect(isForEveryone(event('event', 'No hours', { start: null, end: null }))).toBe(true);
+  });
+});
+
+describe('the readers on the feed of 2026-10-24 (plan 8R-7, R11)', () => {
+  const feed = readEveryoneFeed();
+
+  it('gives research only Into the Wild and the Community Day: no City Safari (F1)', () => {
+    expect(parseResearchEventFeed(feed, ZONE).map((one) => one.id)).toEqual([
+      'into-the-wild-2026',
+      'november-communityday2026',
+    ]);
+  });
+
+  it('gives the big events the two Global editions', () => {
+    expect(parseBigEventFeed(feed, MAX_ZONE).map((one) => one.id)).toEqual([
+      'pokemon-go-wild-area-2026-global',
+      'pokemon-go-tour-alola-global-2027',
+    ]);
+  });
+
+  it('gives the spawns Into the Wild, the Global Wild Area and the Community Day, as before', () => {
+    expect(parseSpawnEventFeed(feed, ZONE).map((one) => one.id)).toEqual([
+      'into-the-wild-2026',
+      'pokemon-go-wild-area-2026-global',
+      'november-communityday2026',
+    ]);
+  });
+
+  it('names no research type it does not know: the City Safari is known and left out', () => {
+    expect(unreadResearchTypes(feed)).toEqual([]);
+  });
+
+  it('reads the older recorded feeds as before', () => {
+    expect(parseResearchEventFeed(readMaxEventFeed(), ZONE).map((one) => one.id)).toEqual([
+      'into-the-wild-2026',
+      'november-communityday2026',
+    ]);
+    expect(parseResearchEventFeed(readSpawnEventFeed(), ZONE).map((one) => one.id)).toEqual([
+      'into-the-wild-2026',
+      'november-communityday2026',
+    ]);
+    expect(parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events).toHaveLength(7);
+  });
+});
diff --git a/src/domain/time/event-reach.ts b/src/domain/time/event-reach.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a09d01d5c2235587b679fee6206548477af0726d
--- /dev/null
+++ b/src/domain/time/event-reach.ts
@@ -0,0 +1,80 @@
+/*
+ * Which events of ScrapedDuck's feed are every member's, wherever they play (plan 8R-7, F1), one
+ * rule for the readers of research events, big events, spawn events and max events. The feed has
+ * no field that says "in-person": the rule goes by the type, the times' zone and the edition's
+ * id or name. Pure.
+ */
+
+/**
+ * The types of which every edition is in a city (Matt, 2026-10-22): a City Safari, and the
+ * Safari Zone, Leek Duck's older type for the same thing, should it come back. Never everyone's,
+ * whatever the times or the name say (the staging of 8R-6 read the Boston City Safari, local times
+ * and research flag, as everyone's research event).
+ */
+export const IN_PERSON_TYPES: ReadonlySet<string> = new Set(['city-safari', 'safari-zone']);
+
+/**
+ * The types with city editions and a Global one (Wild Area, GO Tour, GO Fest): only the Global
+ * edition is everyone's (`isGlobalEdition`).
+ */
+export const CITY_OR_GLOBAL_TYPES: ReadonlySet<string> = new Set([
+  'wild-area',
+  'pokemon-go-tour',
+  'pokemon-go-fest',
+]);
+
+/** The word `global` as one of an id's words (`pokemon-go-wild-area-2026-global`). */
+const GLOBAL_ID = /(^|-)global(-|$)/i;
+/** The word `Global` in a name ("Pokémon GO Wild Area 2026: Global"). */
+const GLOBAL_NAME = /\bglobal\b/i;
+/** A time with a zone of its own (`Z`, `+09:00`, `-0500`): an in-person edition's, in a city. */
+const ZONED_TIME = /(Z|[+-]\d{2}:?\d{2})$/i;
+
+/**
+ * Whether an edition is the Global one: the word `global` in its id or in its name, in any case
+ * (the feed has nothing firmer: a city's `extraData` is the same as the Global one's).
+ */
+export function isGlobalEdition(id: string, name: string): boolean {
+  return GLOBAL_ID.test(id) || GLOBAL_NAME.test(name);
+}
+
+/**
+ * Whether a time of the feed carries a zone of its own. The feed gives everyone's events in
+ * local wall-clock time; an event at a fixed moment of a city (Pokémon Night Out, a city's Wild
+ * Area or GO Tour) has UTC times.
+ */
+export function hasOwnZone(time: string): boolean {
+  return ZONED_TIME.test(time);
+}
+
+/**
+ * Whether an event's kind is everyone's, its times aside: never an in-person type
+ * (`IN_PERSON_TYPES`), a Wild Area, GO Tour or GO Fest only in its Global edition; every other
+ * type is. For an event kept without the feed's times (a stored research event: one with zoned
+ * times was never stored).
+ */
+export function isForEveryoneKind(eventType: string, id: string, name: string): boolean {
+  if (IN_PERSON_TYPES.has(eventType)) return false;
+  return !CITY_OR_GLOBAL_TYPES.has(eventType) || isGlobalEdition(id, name);
+}
+
+/** What `isForEveryone` reads of a feed item. */
+export interface EventReach {
+  eventID: string;
+  eventType: string;
+  name: string;
+  start?: string | null | undefined;
+  end?: string | null | undefined;
+}
+
+/**
+ * Whether an event of the feed is everyone's: its kind is (`isForEveryoneKind`) and neither of
+ * its times has a zone of its own. A time the feed leaves out says nothing here (whoever reads
+ * the event decides what an event without hours is).
+ */
+export function isForEveryone(event: EventReach): boolean {
+  const zoned = [event.start, event.end].some(
+    (time) => typeof time === 'string' && hasOwnZone(time),
+  );
+  return !zoned && isForEveryoneKind(event.eventType, event.eventID, event.name);
+}
diff --git a/src/domain/time/max-events.test.ts b/src/domain/time/max-events.test.ts
index 3698e83cdfa1a720e71aa9da91d8e339e2bd8f30..3400fbfb11b72ab6bbc7d2d5088ff625a4fee169 100644
--- a/src/domain/time/max-events.test.ts
+++ b/src/domain/time/max-events.test.ts
@@ -232,6 +232,26 @@ describe('parseMaxEventFeed: what the feed may also hold', () => {
     expect(parsed.events).toEqual([]);
   });
 
+  it('leaves out an event at the fixed times of another zone, and copies no hours of it (8R-7)', () => {
+    const parsed = parseMaxEventFeed(
+      [
+        item({ start: '2026-11-07T06:00:00.000Z', end: '2026-11-08T21:00:00.000Z' }),
+        item({ start: '2026-11-07T06:00:00.000', end: '2026-11-08T21:00:00+09:00' }),
+        item({
+          eventID: 'dynamax-ho-oh-weekend-2026-11-21',
+          name: 'Dynamax Ho-Oh Max Battle Weekend',
+          start: null,
+          end: null,
+        }),
+      ],
+      MAX_ZONE,
+    );
+    expect(parsed.events).toEqual([]);
+    expect(parsed.unhoured).toEqual([
+      { name: 'Dynamax Ho-Oh Max Battle Weekend', date: '2026-11-21' },
+    ]);
+  });
+
   it('refuses a document that is no list of events', () => {
     expect(() => parseMaxEventFeed({ events: [] }, MAX_ZONE)).toThrow(/not a list of events/);
   });
diff --git a/src/domain/time/max-events.ts b/src/domain/time/max-events.ts
index b0b7555d8d9cf1f972e53b831b9b3a3d62255757..023e4ee7e564da4f42cdeca3367e0a9ff837d803 100644
--- a/src/domain/time/max-events.ts
+++ b/src/domain/time/max-events.ts
@@ -1,5 +1,6 @@
 import { DateTime } from 'luxon';
 import { z } from 'zod';
+import { hasOwnZone, isForEveryone } from './event-reach.js';
 import { eventName } from './raid-events.js';
 
 /**
@@ -155,7 +156,9 @@ function assumedHours(
 
 /**
  * Reads the max events of ScrapedDuck's events feed (`events.json`). The feed gives local
- * wall-clock times without a zone, read in `zone`; an event's hours are always the feed's own.
+ * wall-clock times without a zone, read in `zone`; an event's hours are always the feed's own. An
+ * item with a time of a zone of its own (`hasOwnZone`, plan 8R-7: an in-person event's) is left
+ * out, and lends no hours to another.
  * An event without hours whose id carries a date takes the hours of the nearest event of its kind
  * (`assumedHours`); one that cannot is left out and listed in `unhoured`. An event that ends
  * before it starts, or lasts longer than eight days, is left out.
@@ -164,9 +167,13 @@ function assumedHours(
  */
 export function parseMaxEventFeed(json: unknown, zone: string): ParsedMaxEvents {
   if (!Array.isArray(json)) throw new Error('The events feed is not a list of events');
+  // An item at the fixed times of another zone is no event of ours, nor a pattern for hours.
   const items = (json as unknown[]).flatMap((value) => {
     const parsed = feedItem.safeParse(value);
-    return parsed.success ? [parsed.data] : [];
+    if (!parsed.success) return [];
+    const { start, end } = parsed.data;
+    const zoned = [start, end].some((time) => typeof time === 'string' && hasOwnZone(time));
+    return zoned ? [] : [parsed.data];
   });
   const houred = items.flatMap((item) => {
     const hours = hoursOf(item, zone);
@@ -258,7 +265,7 @@ export const BIG_EVENT_TYPES = ['wild-area', 'pokemon-go-tour', 'pokemon-go-fest
 
 /** A big event (`BIG_EVENT_TYPES`) of the global edition. Times are epoch milliseconds. */
 export interface BigEvent {
-  /** The feed's `eventID`, which says `global` for the global edition. */
+  /** The feed's `eventID`, which says `global` for the global edition (or its name does). */
   id: string;
   /** The feed's name. Shown to members: escape it. */
   name: string;
@@ -275,17 +282,14 @@ const bigItem = z.object({
   end: z.string().max(40).nullable().optional(),
 });
 
-/** The id of a global edition: `global` as one of its words. */
-const GLOBAL_ID = /(^|-)global(-|$)/i;
-/** A time with a zone of its own (`Z`, `+09:00`): an in-person edition's, whatever its id says. */
-const ZONED_TIME = /(Z|[+-]\d{2}:?\d{2})$/i;
-
 /**
  * The big events of the events feed (plan 8X-3), the global editions only (Matt, 2026-10-21):
  * the in-person city editions (Sendai, Mexico City, Kaohsiung, Los Angeles) are in another city
- * until one comes to a region Pine serves; the feed gives them UTC times (`Z`) and ids without
- * `global`. A global edition's times are local, read in `zone`. One without hours, or that ends
- * before it starts or lasts longer than eight days, is left out. In order of their start.
+ * until one comes to a region Pine serves; the feed gives them UTC times (`Z`) and ids and names
+ * without `global`. Everyone's by the one rule of the readers (`isForEveryone`, plan 8R-7: the
+ * word `global` in the id or the name, local times). A global edition's times are local, read in
+ * `zone`. One without hours, or that ends before it starts or lasts longer than eight days, is
+ * left out. In order of their start.
  *
  * Throws when the document is not a list of events at all, so that the caller keeps what it had.
  */
@@ -294,10 +298,9 @@ export function parseBigEventFeed(json: unknown, zone: string): BigEvent[] {
   const events: BigEvent[] = [];
   for (const value of json as unknown[]) {
     const parsed = bigItem.safeParse(value);
-    if (!parsed.success) continue;
+    if (!parsed.success || !isForEveryone(parsed.data)) continue;
     const { eventID: id, name, start: from, end: to } = parsed.data;
-    if (!GLOBAL_ID.test(id) || typeof from !== 'string' || typeof to !== 'string') continue;
-    if (ZONED_TIME.test(from) || ZONED_TIME.test(to)) continue;
+    if (typeof from !== 'string' || typeof to !== 'string') continue;
     const start = DateTime.fromISO(from, { zone });
     const end = DateTime.fromISO(to, { zone });
     if (!start.isValid || !end.isValid) continue;
diff --git a/src/domain/time/research-events.test.ts b/src/domain/time/research-events.test.ts
index 26cc2991fbc4203565f24b1f13341d3746a0fa1f..a24a56fb808eaf896a7a01ed768e3521ea70eb11 100644
--- a/src/domain/time/research-events.test.ts
+++ b/src/domain/time/research-events.test.ts
@@ -1,7 +1,11 @@
 import { describe, expect, it } from 'vitest';
 import { readMaxEventFeed } from '../../../test/support/max-events.js';
 import { INTO_THE_WILD, PAWNIARD_DAY } from '../../../test/support/research-store-cases.js';
-import { feedHasResearchFlags, parseResearchEventFeed } from './research-events.js';
+import {
+  feedHasResearchFlags,
+  parseResearchEventFeed,
+  unreadResearchTypes,
+} from './research-events.js';
 
 const ZONE = 'America/New_York';
 
@@ -64,4 +68,90 @@ describe('parseResearchEventFeed', () => {
     expect(parseResearchEventFeed(feed, ZONE)).toEqual([]);
     expect(() => parseResearchEventFeed({ not: 'a list' }, ZONE)).toThrow();
   });
+
+  describe('only events for everyone (plan 8R-7, F1; Matt’s R2)', () => {
+    const flagged = { extraData: { generic: { hasFieldResearchTasks: true } } };
+    const item = (eventType: string, name: string, eventID = name, local = true) => ({
+      eventID,
+      eventType,
+      name,
+      start: local ? '2027-03-01T10:00:00.000' : '2027-03-01T15:00:00.000Z',
+      end: local ? '2027-03-01T17:00:00.000' : '2027-03-01T22:00:00.000Z',
+      ...flagged,
+    });
+    const ids = (feed: unknown[]) => parseResearchEventFeed(feed, ZONE).map((one) => one.id);
+
+    it('leaves out the City Safari as the feed had it on 2026-10-24, local times and all', () => {
+      const safari = {
+        eventID: 'pokemon-go-city-safari-boston-2026-rescheduled',
+        eventType: 'city-safari',
+        name: 'Pokémon GO City Safari: Boston (Rescheduled)',
+        start: '2026-10-24T10:00:00.000',
+        end: '2026-10-25T18:00:00.000',
+        extraData: { generic: { hasSpawns: true, hasFieldResearchTasks: true } },
+      };
+      expect(parseResearchEventFeed([safari], ZONE)).toEqual([]);
+      expect(ids([item('safari-zone', 'Safari Zone: Liverpool')])).toEqual([]);
+    });
+
+    it('leaves out a city’s Wild Area, GO Tour or GO Fest at local times', () => {
+      expect(
+        ids([
+          item('wild-area', 'Wild Area 2027: Sendai'),
+          item('pokemon-go-tour', 'GO Tour: Alola - Los Angeles 2027'),
+          item('pokemon-go-fest', 'Pokémon GO Fest 2027: Paris'),
+        ]),
+      ).toEqual([]);
+    });
+
+    it('reads their Global editions, by the word in the id or in the name', () => {
+      const read = ids([
+        item('wild-area', 'Wild Area 2027: Global'),
+        item('pokemon-go-tour', 'GO Tour: Alola 2027', 'pokemon-go-tour-alola-global-2027'),
+        item('pokemon-go-fest', 'Pokémon GO Fest 2027: Global'),
+      ]);
+      expect(new Set(read)).toEqual(
+        new Set([
+          'Wild Area 2027: Global',
+          'pokemon-go-tour-alola-global-2027',
+          'Pokémon GO Fest 2027: Global',
+        ]),
+      );
+    });
+
+    it('reads the types on the list, and no other', () => {
+      expect(
+        ids([
+          item('event', 'An event'),
+          item('community-day', 'A day'),
+          item('research-day', 'A research day'),
+          item('season', 'A season'),
+          item('go-battle-league', 'A league'),
+          item('brand-new-type', 'Something new'),
+        ]).sort(),
+      ).toEqual(['A day', 'A research day', 'An event']);
+    });
+
+    it('names the types with research it does not read, each once, but no in-person one', () => {
+      expect(
+        unreadResearchTypes([
+          item('brand-new-type', 'Something new', 'new-1'),
+          item('brand-new-type', 'Something new again', 'new-2'),
+          item('season', 'A season', 'season-25'),
+          item('city-safari', 'City Safari: Boston', 'safari'),
+          item('event', 'An event', 'event'),
+          // Without the flag: no research, nothing to say.
+          { ...item('another-type', 'Plain', 'plain'), extraData: {} },
+        ]),
+      ).toEqual([
+        { eventType: 'brand-new-type', id: 'new-1' },
+        { eventType: 'season', id: 'season-25' },
+      ]);
+      expect(unreadResearchTypes({ not: 'a list' })).toEqual([]);
+    });
+
+    it('still leaves out a Global edition at the fixed times of another zone', () => {
+      expect(ids([item('wild-area', 'Wild Area 2027: Global', 'w', false)])).toEqual([]);
+    });
+  });
 });
diff --git a/src/domain/time/research-events.ts b/src/domain/time/research-events.ts
index 5f60e53ddf699b49894fc4bf5d97f6df8ee66103..eb808c8efecef915e317bed9f0d4f15019f8e9f6 100644
--- a/src/domain/time/research-events.ts
+++ b/src/domain/time/research-events.ts
@@ -1,5 +1,6 @@
 import { DateTime } from 'luxon';
 import { z } from 'zod';
+import { IN_PERSON_TYPES, isForEveryone, isForEveryoneKind } from './event-reach.js';
 import { eventName } from './raid-events.js';
 
 /**
@@ -20,8 +21,34 @@ export interface ResearchEvent {
 /** A research event longer than this is none, whatever the feed says (a season is no event). */
 const MAX_RESEARCH_EVENT_MS = 31 * 24 * 60 * 60_000;
 
-/** A time with a zone of its own (`Z`, `+09:00`): an in-person edition's, in another city. */
-const ZONED_TIME = /(Z|[+-]\d{2}:?\d{2})$/i;
+/**
+ * The event types whose field research is everyone's (plan 8R-7; Matt's R2, 2026-10-24): an
+ * allow list, so that a type the feed adds later stays out until it is known (`unreadResearchTypes`
+ * names it for the log). A Wild Area, GO Tour and GO Fest count only in their Global edition
+ * (`isForEveryone`); a City Safari, a season and every other type are out.
+ */
+export const RESEARCH_EVENT_TYPES: ReadonlySet<string> = new Set([
+  'event',
+  'community-day',
+  'research-day',
+  'pokemon-go-tour',
+  'wild-area',
+  'pokemon-go-fest',
+]);
+
+/**
+ * Whether an event of this kind can be a research event, its times aside: its type on the list
+ * and its edition everyone's. For the events kept without their times (`ResearchEvent` rows: one
+ * kept before plan 8R-7 may be a City Safari).
+ */
+export function isResearchEventKind(
+  event: Pick<ResearchEvent, 'id' | 'eventType' | 'name'>,
+): boolean {
+  return (
+    RESEARCH_EVENT_TYPES.has(event.eventType) &&
+    isForEveryoneKind(event.eventType, event.id, event.name)
+  );
+}
 
 const researchItem = z.object({
   eventID: z.string().min(1).max(200),
@@ -51,9 +78,10 @@ export function feedHasResearchFlags(json: unknown): boolean {
 
 /**
  * The events of the feed with field research of their own (design 4.2): those whose
- * `extraData.generic.hasFieldResearchTasks` is true, with an id and hours. The feed gives local
- * wall-clock times, read in `zone`; an in-person city edition (times in UTC, another city) is left
- * out, as the big events' are. One that ends before it starts, or lasts more than a month, is
+ * `extraData.generic.hasFieldResearchTasks` is true, with an id and hours, of a type of
+ * `RESEARCH_EVENT_TYPES` and everyone's (`isForEveryone`, plan 8R-7: no City Safari, no city's
+ * Wild Area, GO Tour or GO Fest, nothing at the fixed times of another zone). The feed gives local
+ * wall-clock times, read in `zone`. One that ends before it starts, or lasts more than a month, is
  * left out. In order of their start.
  *
  * Throws when the document is not a list of events at all, so that the caller keeps what it had.
@@ -65,8 +93,8 @@ export function parseResearchEventFeed(json: unknown, zone: string): ResearchEve
     const parsed = researchItem.safeParse(value);
     if (!parsed.success) continue;
     const { eventID: id, eventType, name, start: from, end: to } = parsed.data;
+    if (!RESEARCH_EVENT_TYPES.has(eventType) || !isForEveryone(parsed.data)) continue;
     if (typeof from !== 'string' || typeof to !== 'string') continue;
-    if (ZONED_TIME.test(from) || ZONED_TIME.test(to)) continue;
     const start = DateTime.fromISO(from, { zone });
     const end = DateTime.fromISO(to, { zone });
     if (!start.isValid || !end.isValid) continue;
@@ -76,3 +104,23 @@ export function parseResearchEventFeed(json: unknown, zone: string): ResearchEve
   }
   return events.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
 }
+
+/**
+ * The types of the feed's events with field research that `parseResearchEventFeed` does not read
+ * because they are not on `RESEARCH_EVENT_TYPES` (an in-person type, `IN_PERSON_TYPES`, is known
+ * and left out on purpose: not named), each once with the first such event's id, in the feed's
+ * order: the log says so, so that a new type is noticed (Matt's R2). None for a document that is
+ * no list.
+ */
+export function unreadResearchTypes(json: unknown): { eventType: string; id: string }[] {
+  if (!Array.isArray(json)) return [];
+  const unread = new Map<string, string>();
+  for (const value of json as unknown[]) {
+    const parsed = researchItem.safeParse(value);
+    if (!parsed.success) continue;
+    const { eventType, eventID } = parsed.data;
+    if (RESEARCH_EVENT_TYPES.has(eventType) || IN_PERSON_TYPES.has(eventType)) continue;
+    if (!unread.has(eventType)) unread.set(eventType, eventID);
+  }
+  return [...unread].map(([eventType, id]) => ({ eventType, id }));
+}
diff --git a/src/domain/time/spawn-events.test.ts b/src/domain/time/spawn-events.test.ts
index 36ebe6d57ceaf2a494baab727c936d3a021f4cbc..6da680c6f7d059fce3f4699cd6a65e5e90c20dac 100644
--- a/src/domain/time/spawn-events.test.ts
+++ b/src/domain/time/spawn-events.test.ts
@@ -91,6 +91,13 @@ describe('parseSpawnEventFeed (plan 8R-4)', () => {
         item('wild-area', 'Wild Area 2027: Global', '2027-03-13T10:00', '2027-03-14T18:00'),
         // A city's Wild Area with local times still stays out: its name says no Global.
         item('wild-area', 'Wild Area 2027: Sendai', '2027-03-20T10:00', '2027-03-21T18:00'),
+        // And since plan 8R-7 a city's GO Tour at local times, as a Wild Area's and GO Fest's.
+        item('pokemon-go-tour', 'Tour: Alola - Honolulu', '2027-02-20T10:00', '2027-02-21T18:00'),
+        // Since plan 8R-7 the Global edition by its id too, its name not saying it.
+        {
+          ...item('wild-area', 'Wild Area 2027', '2027-03-27T10:00', '2027-03-28T18:00'),
+          eventID: 'pokemon-go-wild-area-2027-global',
+        },
         item('max-battles', 'A max battle day', '2027-03-07T14:00', '2027-03-07T17:00'),
         item('research', 'Timed research', '2027-03-01T10:00', '2027-03-08T20:00'),
         item('brand-new-type', 'Something new', '2027-03-01T10:00', '2027-03-02T20:00'),
@@ -103,6 +110,7 @@ describe('parseSpawnEventFeed (plan 8R-4)', () => {
       'An hour',
       'A day',
       'Wild Area 2027: Global',
+      'Wild Area 2027',
     ]);
   });
 
diff --git a/src/domain/time/spawn-events.ts b/src/domain/time/spawn-events.ts
index 3d382164b05a647a6ad4106cf9997316ac7f5aa2..33904116c6ad998f525b67c0017e16ec1d780cfa 100644
--- a/src/domain/time/spawn-events.ts
+++ b/src/domain/time/spawn-events.ts
@@ -1,5 +1,6 @@
 import { DateTime } from 'luxon';
 import { z } from 'zod';
+import { isForEveryone } from './event-reach.js';
 import { eventName } from './raid-events.js';
 
 /*
@@ -32,10 +33,11 @@ export interface SpawnEvent {
 
 /**
  * The event types whose spawns are every member's (Matt's R-M5 and Q2, 2026-10-22): an
- * allowlist, so that a type the feed adds later stays out until it is known. A Wild Area and GO
- * Fest count only in their Global edition (`GLOBAL_ONLY`); city Wild Areas and GO Fests, City
- * Safaris, seasons (their spawns stand for three months: a costume listed there would mark every
- * report until the next season) and every other type are out.
+ * allowlist, so that a type the feed adds later stays out until it is known. A Wild Area, GO
+ * Tour and GO Fest count only in their Global edition (`isForEveryone`, plan 8R-7: the GO Tour
+ * too); city Wild Areas, GO Tours and GO Fests, City Safaris, seasons (their spawns stand for
+ * three months: a costume listed there would mark every report until the next season) and every
+ * other type are out.
  */
 export const SPAWN_EVENT_TYPES: ReadonlySet<string> = new Set([
   'event',
@@ -46,19 +48,6 @@ export const SPAWN_EVENT_TYPES: ReadonlySet<string> = new Set([
   'pokemon-go-fest',
 ]);
 
-/** The types that count only in their Global edition (`GLOBAL_EDITION`, Matt's Q2). */
-const GLOBAL_ONLY: ReadonlySet<string> = new Set(['wild-area', 'pokemon-go-fest']);
-
-/**
- * The Global edition of a Wild Area or GO Fest, told from a city's by the feed's name ("Pokémon
- * GO Wild Area 2026: Global"): the feed has nothing firmer (its `extraData` is the same for both;
- * a city's times carry a `Z`, the Global one's are local, which `ZONED_TIME` checks as well).
- */
-const GLOBAL_EDITION = /\bglobal\b/i;
-
-/** A time with a zone of its own (`Z`, `+09:00`): an in-person event's, in another city. */
-const ZONED_TIME = /(Z|[+-]\d{2}:?\d{2})$/i;
-
 /** The only pages read (F11): Leek Duck's events pages. */
 const EVENT_PAGE = /^https:\/\/leekduck\.com\/events\/[A-Za-z0-9._~-]{1,200}\/?$/;
 
@@ -96,8 +85,9 @@ const spawnItem = z.object({
 /**
  * The events of the feed with spawns (design 5, F11): a community day's and a spotlight hour's
  * from the feed, any other the feed marks `generic.hasSpawns` from its Leek Duck page; only the
- * types of `SPAWN_EVENT_TYPES` (a Wild Area and GO Fest only Global), never an event at a fixed time of another zone (times with a `Z`:
- * Pokémon Night Out), one without hours, one that ends before it starts or lasts over a month.
+ * types of `SPAWN_EVENT_TYPES` and everyone's (`isForEveryone`: a Wild Area, GO Tour and GO Fest
+ * only Global, never an event at a fixed time of another zone, times with a `Z`: Pokémon Night
+ * Out), never one without hours, one that ends before it starts or lasts over a month.
  * An event's `page` is its feed link as it stands: whoever reads it reads only a Leek Duck
  * events page (`isEventPage`). In order of their start.
  *
@@ -110,10 +100,8 @@ export function parseSpawnEventFeed(json: unknown, zone: string): SpawnEvent[] {
     const parsed = spawnItem.safeParse(value);
     if (!parsed.success) continue;
     const { eventID: id, eventType, name, link, start: from, end: to, extraData } = parsed.data;
-    if (!SPAWN_EVENT_TYPES.has(eventType)) continue;
-    if (GLOBAL_ONLY.has(eventType) && !GLOBAL_EDITION.test(name)) continue;
+    if (!SPAWN_EVENT_TYPES.has(eventType) || !isForEveryone(parsed.data)) continue;
     if (typeof from !== 'string' || typeof to !== 'string') continue;
-    if (ZONED_TIME.test(from) || ZONED_TIME.test(to)) continue;
     const start = DateTime.fromISO(from, { zone });
     const end = DateTime.fromISO(to, { zone });
     if (!start.isValid || !end.isValid) continue;
diff --git a/src/services/raid-event-service.test.ts b/src/services/raid-event-service.test.ts
index f1002bcb717daa6b81e7b49c246fd51c69ba79a7..d605aa4e17e73943f677a9a09e988b9633e444ee 100644
--- a/src/services/raid-event-service.test.ts
+++ b/src/services/raid-event-service.test.ts
@@ -739,6 +739,55 @@ describe('RaidEventService', () => {
       expect(events.researchEvents()).toEqual([INTO_THE_WILD, PAWNIARD_DAY]);
     });
 
+    it('uses no stored in-person event, such as a City Safari kept before plan 8R-7 (F1)', async () => {
+      const safari = {
+        id: 'pokemon-go-city-safari-boston-2026-rescheduled',
+        name: 'Pokémon GO City Safari: Boston (Rescheduled)',
+        eventType: 'city-safari',
+        start: at('2026-10-24T10:00'),
+        end: at('2026-10-25T18:00'),
+      };
+      const sendai = {
+        id: 'pokemon-go-wild-area-2027-sendai',
+        name: 'Pokémon GO Wild Area 2027: Sendai',
+        eventType: 'wild-area',
+        start: at('2026-10-24T10:00'),
+        end: at('2026-10-25T18:00'),
+      };
+      const store = new MemoryResearchEvents([safari, sendai, INTO_THE_WILD]);
+      const { events } = service(() => Promise.reject(new Error('down')), {
+        research: store,
+        now: () => at('2026-10-24T12:00'),
+      });
+      await events.loadResearch();
+      expect(events.researchEvents()).toEqual([INTO_THE_WILD]);
+    });
+
+    it('warns of a type with research it does not read, once per type (Matt’s R2)', async () => {
+      const novel = (eventID: string) => ({
+        eventID,
+        eventType: 'brand-new-type',
+        name: 'Something new',
+        start: '2026-11-01T10:00:00.000',
+        end: '2026-11-01T17:00:00.000',
+        extraData: { generic: { hasFieldResearchTasks: true } },
+      });
+      const feed = JSON.stringify([...(readMaxEventFeed() as unknown[]), novel('new-1')]);
+      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, feed)));
+      const { events, entries } = service(fetch, {
+        research: new MemoryResearchEvents(),
+        now: () => at('2026-10-21T22:00'),
+      });
+      await events.refresh();
+      await events.refresh();
+      expect(events.researchEvents()).toEqual([INTO_THE_WILD, PAWNIARD_DAY]);
+      const warned = entries.filter(
+        (entry) => entry.msg === 'an event type with field research is not read',
+      );
+      expect(warned).toHaveLength(1);
+      expect(warned[0]).toMatchObject({ level: 40, eventType: 'brand-new-type', event: 'new-1' });
+    });
+
     it('keeps the raid events of a read whose research events cannot be kept', async () => {
       const store = new MemoryResearchEvents();
       store.failing.set('saveSeen', new Error('database is down'));
diff --git a/src/services/raid-event-service.ts b/src/services/raid-event-service.ts
index 47d9755e8f880359cd66c272a76ffd676146c2a9..344d7e93a35db8eeda1ec792d7da2391673bbfb4 100644
--- a/src/services/raid-event-service.ts
+++ b/src/services/raid-event-service.ts
@@ -9,9 +9,12 @@ import {
 import { parseRaidEventFeed, type RaidEvent } from '../domain/time/raid-events.js';
 import {
   feedHasResearchFlags,
+  isResearchEventKind,
   parseResearchEventFeed,
+  unreadResearchTypes,
   type ResearchEvent,
 } from '../domain/time/research-events.js';
+import { BoundedMap } from '../bounded-map.js';
 import { parseSpawnEventFeed, type SpawnEvent } from '../domain/time/spawn-events.js';
 import type { ResearchEventStorage } from '../db/repositories/research-event-repository.js';
 import type { KeptMaxEvents, MaxEventStorage } from '../db/repositories/max-event-repository.js';
@@ -28,6 +31,8 @@ const RESEARCH_KEPT_MS = 30 * 24 * 60 * MINUTE_MS;
 const REMEMBER_MS = 8 * 24 * 60 * MINUTE_MS;
 /** The longest delay `setTimeout` accepts; anything longer fires immediately. */
 const MAX_TIMER_MS = 2 ** 31 - 1;
+/** How many unread research types the log remembers having named (the feed has some 15 types). */
+const UNREAD_TYPES_TOLD_MAX = 100;
 
 /** One max event by its feed id, whatever the feed renamed or moved; else by kind, name, start. */
 function sameMaxEvent(a: MaxEvent, b: MaxEvent): boolean {
@@ -150,6 +155,8 @@ export class RaidEventService
   private readonly researchListeners: (() => void)[] = [];
   /** Whether the log has said that the feed lacks the research flags (once until they return). */
   private researchFlagsMissingTold = false;
+  /** The event types with research the log has said are not read (`tellOfUnreadTypes`). */
+  private readonly unreadTypesTold = new BoundedMap<string, true>(UNREAD_TYPES_TOLD_MAX);
   private currentMax: readonly MaxEvent[] = [];
   private currentBig: readonly BigEvent[] = [];
   private currentSpawns: readonly SpawnEvent[] = [];
@@ -243,10 +250,16 @@ export class RaidEventService
     }
   }
 
-  /** Takes the research events kept by the last run (no network). */
+  /**
+   * Takes the research events kept by the last run (no network), those of a kind that can be one
+   * only (`isResearchEventKind`, plan 8R-7, review R1): a row kept before the fix may be a City
+   * Safari, which would cut the day's research until it ends. Such a row stays stored, unused,
+   * until `removeEnded` forgets it a month after its end; what a read keeps is read by the same
+   * rule (`parseResearchEventFeed`).
+   */
   async loadResearch(): Promise<void> {
     const kept = await this.options.research?.all();
-    if (kept) this.useResearch(this.withSeen(kept, this.research));
+    if (kept) this.useResearch(this.withSeen(kept.filter(isResearchEventKind), this.research));
   }
 
   /** Makes `events` the research events, and tells the listeners when they differ. */
@@ -437,6 +450,24 @@ export class RaidEventService
     }
   }
 
+  /**
+   * Warns of each event type with field research that the research events leave out
+   * (`unreadResearchTypes`, plan 8R-7; Matt's R2), once per type while the bot runs, so that a type
+   * new to the feed is noticed and can be judged.
+   */
+  private tellOfUnreadTypes(json: unknown): void {
+    for (const { eventType, id } of unreadResearchTypes(json)) {
+      if (this.unreadTypesTold.has(eventType)) continue;
+      this.unreadTypesTold.set(eventType, true);
+      this.safely(() =>
+        this.options.log.warn(
+          { eventType, event: id },
+          'an event type with field research is not read',
+        ),
+      );
+    }
+  }
+
   /**
    * The events with field research of a read (plan 8R-1): kept as seen (`saveSeen`), the kept
    * ones ended a month ago forgotten, one not begun that the read no longer lists dropped (moved
@@ -465,6 +496,7 @@ export class RaidEventService
       // The events with spawns (plan 8R-4) need the same flags; kept before the database's part.
       this.currentSpawns = this.mergedSpawns(parseSpawnEventFeed(flagged, zone));
       const seen = parseResearchEventFeed(flagged, zone);
+      this.tellOfUnreadTypes(flagged);
       const now = (this.options.now ?? Date.now)();
       const listed = new Set(seen.map((event) => event.id));
       await research?.saveSeen(seen, now);
diff --git a/test/fixtures/scrapedduck-events-2026-10-24.json b/test/fixtures/scrapedduck-events-2026-10-24.json
new file mode 100644
index 0000000000000000000000000000000000000000..2c383563f7fa3065b178995cd11266a8395ad41b
--- /dev/null
+++ b/test/fixtures/scrapedduck-events-2026-10-24.json
@@ -0,0 +1,136 @@
+[
+  {
+    "eventID": "pokemon-night-out-los-angeles-2026",
+    "name": "Pokémon Night Out 2026 - Los Angeles",
+    "eventType": "event",
+    "link": "https://leekduck.com/events/pokemon-night-out-los-angeles-2026/",
+    "start": "2026-10-25T02:30:00.000Z",
+    "end": "2026-10-25T06:59:59.000Z",
+    "extraData": {
+      "generic": {
+        "hasSpawns": true,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "pokemon-go-city-safari-boston-2026-rescheduled",
+    "name": "Pokémon GO City Safari: Boston (Rescheduled)",
+    "eventType": "city-safari",
+    "link": "https://leekduck.com/events/pokemon-go-city-safari-boston-2026-rescheduled/",
+    "start": "2026-10-24T10:00:00.000",
+    "end": "2026-10-25T18:00:00.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": true,
+        "hasFieldResearchTasks": true
+      }
+    }
+  },
+  {
+    "eventID": "pokemon-go-wild-area-2026-mexico-city",
+    "name": "Pokémon GO Wild Area 2026: Mexico City",
+    "eventType": "wild-area",
+    "link": "https://leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/",
+    "start": "2026-11-06T16:00:00.000Z",
+    "end": "2026-11-09T00:00:00.000Z",
+    "extraData": {
+      "generic": {
+        "hasSpawns": true,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "into-the-wild-2026",
+    "name": "Into the Wild",
+    "eventType": "event",
+    "link": "https://leekduck.com/events/into-the-wild-2026/",
+    "start": "2026-11-09T10:00:00.000",
+    "end": "2026-11-13T20:00:00.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": true,
+        "hasFieldResearchTasks": true
+      }
+    }
+  },
+  {
+    "eventID": "pokemon-go-wild-area-2026-global",
+    "name": "Pokémon GO Wild Area 2026: Global",
+    "eventType": "wild-area",
+    "link": "https://leekduck.com/events/pokemon-go-wild-area-2026-global/",
+    "start": "2026-11-14T10:00:00.000",
+    "end": "2026-11-15T18:00:00.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": true,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "november-communityday2026",
+    "name": "Pawniard Community Day",
+    "eventType": "community-day",
+    "link": "https://leekduck.com/events/november-communityday2026/",
+    "start": "2026-11-21T14:00:00.000",
+    "end": "2026-11-21T17:00:00.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": true,
+        "hasFieldResearchTasks": true
+      },
+      "communityday": {
+        "spawns": [
+          {
+            "name": "Pawniard",
+            "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_624_00.png"
+          }
+        ]
+      }
+    }
+  },
+  {
+    "eventID": "pokemon-go-tour-alola-kaohsiung-2027",
+    "name": "Pokémon GO Tour: Alola - Kaohsiung 2027",
+    "eventType": "pokemon-go-tour",
+    "link": "https://leekduck.com/events/pokemon-go-tour-alola-kaohsiung-2027/",
+    "start": "2027-02-18T16:00:00.000Z",
+    "end": "2027-02-21T15:59:59.000Z",
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "pokemon-go-tour-alola-los-angeles-2027",
+    "name": "Pokémon GO Tour: Alola - Los Angeles 2027",
+    "eventType": "pokemon-go-tour",
+    "link": "https://leekduck.com/events/pokemon-go-tour-alola-los-angeles-2027/",
+    "start": "2027-02-19T08:00:00.000Z",
+    "end": "2027-02-22T07:59:59.000Z",
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "pokemon-go-tour-alola-global-2027",
+    "name": "Pokémon GO Tour: Alola - Global 2027",
+    "eventType": "pokemon-go-tour",
+    "link": "https://leekduck.com/events/pokemon-go-tour-alola-global-2027/",
+    "start": "2027-02-27T00:00:00.000",
+    "end": "2027-02-28T23:59:59.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
+  }
+]
diff --git a/test/support/event-reach.ts b/test/support/event-reach.ts
new file mode 100644
index 0000000000000000000000000000000000000000..941d02e82881885f0e3d726ca3b31442c96f44e5
--- /dev/null
+++ b/test/support/event-reach.ts
@@ -0,0 +1,19 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+
+const fixtures = path.resolve(import.meta.dirname, '../fixtures');
+
+/**
+ * Nine items of ScrapedDuck's events feed (`events.json`) as fetched on 2026-10-24 (plan 8R-7),
+ * cut to the fields the readers read (`eventID`, `name`, `eventType`, `link`, `start`, `end`,
+ * `extraData.generic` and a community day's `extraData.communityday.spawns`), values unchanged:
+ * Pokémon Night Out 2026 - Los Angeles (`event`, UTC times), City Safari: Boston (Rescheduled)
+ * (`city-safari`, local times, `hasFieldResearchTasks`: the staging's finding F1), Wild Area 2026
+ * Mexico City (UTC) and Global (local), Into the Wild (`event`, research), Pawniard Community Day
+ * (research, its spawns), and GO Tour Alola's Kaohsiung and Los Angeles (UTC) and Global (local).
+ */
+export function readEveryoneFeed(): unknown {
+  return JSON.parse(
+    readFileSync(path.join(fixtures, 'scrapedduck-events-2026-10-24.json'), 'utf8'),
+  );
+}
````

### Task 2: 8R-7 task 2: each stop's name a link to its place (E1)

Prototype commit: `2e02d8dbdf63f9f4dc269ecc95d6823afb68bc34`

Every stop line of the post "Today's Stops" (a task's, a version's, a hideout's, the day's
research under a window; the plain text too) names its stop as a link to Google Maps:
- **[Stop](<maps>)** · address · Reporter (Matt's R6). The research and Rocket DMs name their
stops the same way, their names through plainNoLinks. stopMapsUrl rounds the coordinates to
five decimals; gymMapsUrl and the party posts are unchanged, and so is a grunt's message with
its [Map]. fill counts each line whole with its link: a busy day shows fewer stops a block by
the same rules, and a link is never cut.

**Files:**

```
 docs/architecture/stop-reports.md            |   6 ++---
 src/render/raid-post.ts                      |  18 +++++++++++---
 src/render/research.test.ts                  |  18 ++++++++++++++
 src/render/research.ts                       |  29 ++++++++++++++++-------
 src/render/rocket.test.ts                    |  17 ++++++++++++++
 src/render/rocket.ts                         |  13 ++++++-----
 src/render/stop-post.test.ts                 | 189 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--------------
 src/render/stop-post.ts                      |  23 +++++++++++++-----
 src/services/notify-service.research.test.ts |  31 +++++++++++-------------
 src/services/notify-service.rocket.test.ts   |   6 ++++-
 src/services/stop-posts.test.ts              |  12 ++++++----
 11 files changed, 295 insertions(+), 67 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/research.test.ts src/render/rocket.test.ts src/render/stop-post.test.ts src/services/notify-service.research.test.ts src/services/notify-service.rocket.test.ts src/services/stop-posts.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 2e02d8dbdf63f9f4dc269ecc95d6823afb68bc34 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-7 task 2: each stop's name a link to its place (E1)`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index 3267682978ba5b80d0dbf2c452be2b7b5257d1e2..d61b4c2cbe36857b1305ad5cf97aa762a11c79cd 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -56,14 +56,14 @@ Design `docs/superpowers/specs/2026-10-23-research-rewards-apart-design.md` (its
 ## The pinned post "Today’s Stops"
 
 - `StopPostService` (`src/services/stop-posts.ts`): one post per region channel and local day, made at the first report of the day in the region, pinned (the "pinned a message" notice deleted where the bot may; at Discord's pin limit, or without Pin Messages, it stands unpinned and that is logged once per channel), drawn anew `POST_DELAY_MS` (3 s) after the last change (`Gathered`, coalesced) in one queue per channel (`KeyedLock`), the midnight delete included; reads are done before any Discord call. A change of the reports is drawn only in the regions it touched: `StopReportListener.changed(serverId, stops)` names the stops of the reports made or taken back (a replaced report's too), and only the region channels whose outlines hold one of them are queued; the period changes and the research events draw every post. A message whose payload equals the one last drawn there (a hash per message id, in memory: the first draw after a restart edits) is not edited. An edit that fails is thrown (logged, the post stands, the next change draws it again); a message is deleted and sent anew only when it is gone or changes kind (components v2 to plain text, or back, as `mayPost` changes), and, its kind not known in the first draw after a restart, when Discord refuses its edit for what it holds (`isRefusedBody`); any other failure keeps it there too. A channel with no post in memory reads its kept rows from storage before it draws (a report before `start` has read them, or after that failed, edits the post a restart left; a failed read draws nothing), and `start` keeps what such a draw made, and deletes a post older than its channel's newest (one whose delete failed at its midnight). A timer at `nextPeriodChange` draws every kept post anew (`draw` deletes the post of an ended day and makes today's where reports stand); `start()` does the same for what a restart left (`StopPost` keeps the ids, each message's saved as soon as it is sent, before it is pinned), and sets the timer also when the kept posts cannot be read; a change of the research events (`onResearchChange`) draws the posts anew and sets the timer again (those redraws in a set of their own, which `flush` and `close` wait for and `messageOf` does not: it waits only for its own channel). It is kept, saying "Nothing reported right now.", when every report is taken back. None in rehearsal mode. The region's summary post links it (plan 8X-G, `parties-and-posts.md`): `summaryOf(channelId)` gives the server, the post's first message and how many tasks and hideouts it shows as last drawn (the hideouts as the post counts them, one per leader or decoy whatever its stops, review r0 C2), and under an event's window how many tasks of the day's research wait below it and when they come back (`waiting`, plan 8R-6: the summary says `· 13 tasks back at <t:…:t>`), undefined without a post of today drawn since the start; `changed(channelId)` (`StopPostServiceOptions`, `app.ts`: `PartyService.summaryChanged` of the channel's region) is told after each draw and each delete, so the summary is drawn anew after every draw of the post and edited where the counts changed. Where the post lives, the region's channel or its forum, is open until the 8R staging.
-- `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task, most stops first (plan 8R-5, R9: one block per task, counted as tasks; a task of one version with its rewards beside it, of several a line of each version's rewards before its stops (`reward not said` for a typed task's version without its reward, review R1), the rewards' versions first and "one of" last, a picture per reward line (plan 8R-6, "Pictures at the stops"); the versions as the decision sees them (`grouped` by `StopReportService.versionOf`, review R2: a report of before plan 8R-5 of a task of one reward under that reward's version, R10; "one of" before and now one group), each in the words of its newest report; the task's key and every version placed, so a DM of any version links the block), each with its rewards and up to 15 stops (`- **Stop** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"); within 40 components and `TEXT_BUDGET` a message, spilling into a second and third (`MAX_POST_MESSAGES`), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it); under an intra-day window (or a big event's daily hours) the day's research waiting stays below the window's tasks (plan 8R-6, Matt: `StopPostView.waiting.tasks`, under `### Back at <t:…:t>, after <event>`, in the same blocks without pictures, after the hideouts, so that a busy event day counts it away before any hideout (Matt, 2026-10-24); the line "The day's research comes back at" is gone; it counts in the layout and the busy day as any block, and the placement keeps the window's message for a key both have). Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link; `linkOf(channelId, subjectKey)` (plan 8R-3) gives it as last drawn, else the post's first message, and draws nothing: the map asks on every poll, where `messageOf` would edit the post each time. The day's hideouts (plan 8R-2) go after the research (before the day's research waiting under a window) under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (its picture by the rule beside it, plan 8R-6: a leader's or Giovanni's portrait) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
+- `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task, most stops first (plan 8R-5, R9: one block per task, counted as tasks; a task of one version with its rewards beside it, of several a line of each version's rewards before its stops (`reward not said` for a typed task's version without its reward, review R1), the rewards' versions first and "one of" last, a picture per reward line (plan 8R-6, "Pictures at the stops"); the versions as the decision sees them (`grouped` by `StopReportService.versionOf`, review R2: a report of before plan 8R-5 of a task of one reward under that reward's version, R10; "one of" before and now one group), each in the words of its newest report; the task's key and every version placed, so a DM of any version links the block), each with its rewards and up to 15 stops (`- **[Stop](<maps>)** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"; since plan 8R-7, E1, every stop's name is the link to its place on Google Maps, `stopMapLine`, `src/render/research.ts`: `stopMapsUrl` of `raid-post.ts`, the address `gymMapsUrl` makes with the coordinates rounded to five decimals, in angle brackets so that it unfurls no preview, the name cut to 80 before it is made plain, always without a working address (`plainNoLinks`: a stop named `https://…` would show one address and link another), and its brackets escaped by `linkTextOf`; a task's, a version's, a hideout's and the day's research under a window alike, the plain text too; `fill` counts each line whole with its link, so a link is never cut and a busy day shows fewer stops a block by the same rules, `STOPS_SHOWN` and `MAX_POST_MESSAGES` unchanged; Matt's choice, R6: the party posts' Where keeps its name plain bold with a `[Map]` word, and so does a grunt's message); within 40 components and `TEXT_BUDGET` a message, spilling into a second and third (`MAX_POST_MESSAGES`), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it); under an intra-day window (or a big event's daily hours) the day's research waiting stays below the window's tasks (plan 8R-6, Matt: `StopPostView.waiting.tasks`, under `### Back at <t:…:t>, after <event>`, in the same blocks without pictures, after the hideouts, so that a busy event day counts it away before any hideout (Matt, 2026-10-24); the line "The day's research comes back at" is gone; it counts in the layout and the busy day as any block, and the placement keeps the window's message for a key both have). Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link; `linkOf(channelId, subjectKey)` (plan 8R-3) gives it as last drawn, else the post's first message, and draws nothing: the map asks on every poll, where `messageOf` would edit the post each time. The day's hideouts (plan 8R-2) go after the research (before the day's research waiting under a window) under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (its picture by the rule beside it, plan 8R-6: a leader's or Giovanni's portrait) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
 - `PartyGateway.pinMessage` / `unpinMessage` (`PinOutcome`: `pinned`, `full`, `not-allowed`, `gone`); Pin Messages is optional in `REGION_CHANNEL_NEEDS`, so `cutover-check` warns where it lacks.
 
 ## Wants and DMs
 
 - `/want`'s dialog, `TargetWant` and the matching are in `notifications-and-dms.md` ("Wants and gym targets", "The notifier"). "Grunt (no type)" is typed as `no type`, `no type grunt` or `grunt (no type)`; `none` typed in full is zero IVs, the legacy word (fix F4), and the list of choices offers both for it.
-- A report that is news (`StopReportService`'s `reported`) goes to `NotifyService.researchReported`: who wants a reward of its task (`researchTargets` / `researchWantsFiring`, `src/domain/notify/reasons.ts`: a Pokémon's Research box, the species fitting any form, an item whatever the quantity, a species' Mega Energy) is told at the normal priority (plan 8R-5: a "one of" by any of its encounters, its DM naming the member's reward first; see `notifications-and-dms.md`, "Research by version"), one DM per report and region channel naming that region's stops with their addresses (`researchDmSentence`, `researchDmBrief`: "Field research has been reported in #region by **Name**: **task**.", the rewards, the stops, until when as `periodEndWords` says it; all through `plainNoLinks`), only members who can view the channel, never the reporter, only under `features.notifications`, expiring with the report, with "Go to post" to the message of the pinned post holding the task (`researchPosts`; none in rehearsal mode). A member told of a task at a stop in a period is not told again (`researchTold`, in memory: a restart can repeat one), so a later "Same task at more stops…" names only the new stops. The usual Stop buttons (`target` reasons, `stopArgs` `rp`/`ri`/`re`).
-- A Rocket report that is news goes to `NotifyService.rocketReported` (plan 8R-2, design 7): one DM per region channel holding the stop; a want of its grunt type, its leader or any leader, Giovanni or the decoy (`rocketTargets` / `rocketWantsFiring`, `TargetWant` tokens as `rocketKey` plus `leader:any`; a lineup's report by its type, `typeKeyOf`, plan 8R-4L: wants stay by type, `grunt:water` fires on both lineups and on "not sure which", and a lineup's key is never a want, `isRocketWho`) and a Shadow want of a Pokémon it can give (`rocketShadowFiring`, the `PokemonNotification` shadow row of the species or the very form: the Shadow box means shadow raids and Rocket catches; judged by the report's own catches, so a Shadow Magikarp fires on the lineup that gives it and on "not sure which", not on the other lineup: a Shadow want is how a lineup's catch is wanted). A grunt goes at the spawn priority, at most one DM an hour per member and grunt type (`rocketHeard`, in memory, `MAX_WANT_QUIET_MS`, keyed by the type's key; a grunt's announcement runs in its type's line, `rocket:<server>:<type key>`, so reports of one type made at once keep the hour, fix B1; the small print says so, `gruntHourNote`: "You won't be told about this grunt type again for an hour."; without `TargetWant` the Shadow wants still fire, fix B8), with "Go to report" to its message in that channel. A grunt's reporter, and on a refine in place the reporter of the grunt it changed (`RocketNews.alsoActors`, review R3), are never told of it and have heard of its type for the hour. A refine changes no DM sent already (as with a grunt taken back early, B2): a DM of "not sure which" or of the other lineup can point at a lineup without the catch it named (review R7). A hideout goes at the normal priority, never twice to a member for the same hideout at the same stop in a day (`rocketTold`, in memory), with "Go to post" to the message of the pinned post holding it (`researchPosts.messageOf(channel, rocketKey)`); no link in rehearsal mode. `rocketDmSentence` ("A **Water-type grunt** has been reported in #west by **Rita**.", "an" by the name's first letter, a leader by name), `rocketDmBrief` (what can be caught, the stop with its address line, when it goes or until when it stands). Since plan 8R-4 the Rocket wants are made in one dialog (`/want rocket`, `notifications-and-dms.md`), and a Rocket reason's button is Change… of that dialog.
+- A report that is news (`StopReportService`'s `reported`) goes to `NotifyService.researchReported`: who wants a reward of its task (`researchTargets` / `researchWantsFiring`, `src/domain/notify/reasons.ts`: a Pokémon's Research box, the species fitting any form, an item whatever the quantity, a species' Mega Energy) is told at the normal priority (plan 8R-5: a "one of" by any of its encounters, its DM naming the member's reward first; see `notifications-and-dms.md`, "Research by version"), one DM per report and region channel naming that region's stops with their addresses (`researchDmSentence`, `researchDmBrief`: "Field research has been reported in #region by **Name**: **task**.", the rewards, the stops, each name the link to its place since plan 8R-7 (`stopMapLine`, as in the post; the confirmation's sentence names its stops plain), until when as `periodEndWords` says it; all through `plainNoLinks`, the link's text too), only members who can view the channel, never the reporter, only under `features.notifications`, expiring with the report, with "Go to post" to the message of the pinned post holding the task (`researchPosts`; none in rehearsal mode). A member told of a task at a stop in a period is not told again (`researchTold`, in memory: a restart can repeat one), so a later "Same task at more stops…" names only the new stops. The usual Stop buttons (`target` reasons, `stopArgs` `rp`/`ri`/`re`).
+- A Rocket report that is news goes to `NotifyService.rocketReported` (plan 8R-2, design 7): one DM per region channel holding the stop; a want of its grunt type, its leader or any leader, Giovanni or the decoy (`rocketTargets` / `rocketWantsFiring`, `TargetWant` tokens as `rocketKey` plus `leader:any`; a lineup's report by its type, `typeKeyOf`, plan 8R-4L: wants stay by type, `grunt:water` fires on both lineups and on "not sure which", and a lineup's key is never a want, `isRocketWho`) and a Shadow want of a Pokémon it can give (`rocketShadowFiring`, the `PokemonNotification` shadow row of the species or the very form: the Shadow box means shadow raids and Rocket catches; judged by the report's own catches, so a Shadow Magikarp fires on the lineup that gives it and on "not sure which", not on the other lineup: a Shadow want is how a lineup's catch is wanted). A grunt goes at the spawn priority, at most one DM an hour per member and grunt type (`rocketHeard`, in memory, `MAX_WANT_QUIET_MS`, keyed by the type's key; a grunt's announcement runs in its type's line, `rocket:<server>:<type key>`, so reports of one type made at once keep the hour, fix B1; the small print says so, `gruntHourNote`: "You won't be told about this grunt type again for an hour."; without `TargetWant` the Shadow wants still fire, fix B8), with "Go to report" to its message in that channel. A grunt's reporter, and on a refine in place the reporter of the grunt it changed (`RocketNews.alsoActors`, review R3), are never told of it and have heard of its type for the hour. A refine changes no DM sent already (as with a grunt taken back early, B2): a DM of "not sure which" or of the other lineup can point at a lineup without the catch it named (review R7). A hideout goes at the normal priority, never twice to a member for the same hideout at the same stop in a day (`rocketTold`, in memory), with "Go to post" to the message of the pinned post holding it (`researchPosts.messageOf(channel, rocketKey)`); no link in rehearsal mode. `rocketDmSentence` ("A **Water-type grunt** has been reported in #west by **Rita**.", "an" by the name's first letter, a leader by name), `rocketDmBrief` (what can be caught, the stop with its address line, its name the link to its place since plan 8R-7, `stopMapLine`, when it goes or until when it stands; a grunt's message in the channel keeps its Where with `[Map]`, `rocketStopLine`). Since plan 8R-4 the Rocket wants are made in one dialog (`/want rocket`, `notifications-and-dms.md`), and a Rocket reason's button is Change… of that dialog.
 
 ## Pictures at the stops (plan 8R-6)
 
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index 0f6dabdacc5b421d28517e6877b0d1fb33352d96..49abf3ae4bb871116ec357ebe847cbd1faed9d1c 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -183,6 +183,15 @@ export function gymMapsUrl(gym: { lat: number; lon: number }): string {
   return `https://www.google.com/maps/search/?api=1&query=${gym.lat}%2C${gym.lon}`;
 }
 
+/**
+ * The address of a stop's place in Google Maps (plan 8R-7), as `gymMapsUrl` with the coordinates
+ * rounded to five decimals (about a meter): a stop kept with fifteen digits costs the post's
+ * budget some 20 characters less a line.
+ */
+export function stopMapsUrl(stop: { lat: number; lon: number }): string {
+  return gymMapsUrl({ lat: Number(stop.lat.toFixed(5)), lon: Number(stop.lon.toFixed(5)) });
+}
+
 /**
  * A gym's name, made plain, as the text of a masked link: a bracket in the name would end the
  * text of the link early. One that is escaped already (an odd run of backslashes stands before
@@ -193,9 +202,12 @@ export function linkText(gym: PostGym | undefined): string {
   return linkTextOf(gymName(gym));
 }
 
-/** Any name as the text of a masked link, as `linkText` makes a gym's (a power spot's title). */
-export function linkTextOf(name: string): string {
-  return plain(name).replace(/(\\*)([[\]])/g, (whole, slashes: string, bracket: string) =>
+/**
+ * Any name as the text of a masked link, as `linkText` makes a gym's (a power spot's title);
+ * `made` makes it plain (`plainNoLinks` for a name that reaches other members' DMs, plan 8R-7).
+ */
+export function linkTextOf(name: string, made: (text: string) => string = plain): string {
+  return made(name).replace(/(\\*)([[\]])/g, (whole, slashes: string, bracket: string) =>
     slashes.length % 2 === 1 ? whole : `${slashes}\\${bracket}`,
   );
 }
diff --git a/src/render/research.test.ts b/src/render/research.test.ts
index 556cfb2d2614971b76a471e1c36d44abcd932f73..73ec64706fb44be66b5d8bad53f8b90b6940b737 100644
--- a/src/render/research.test.ts
+++ b/src/render/research.test.ts
@@ -218,6 +218,24 @@ describe('periodEndWords', () => {
   });
 });
 
+describe('the stops of a research DM (plan 8R-7: Matt, "maybe same for the DMs")', () => {
+  it('names each stop as a link to its place, plain and without a working address', () => {
+    const { lines } = researchDmBrief({
+      research: { rewards: [] },
+      stops: [
+        reportedStop(1, { lat: 40.4433123456789, lon: -79.9436123456789 }),
+        reportedStop(2, { name: 'Mural [North] at www.example.test', address: null }),
+      ],
+      until: 'until midnight',
+    });
+    expect(lines).toEqual([
+      '- **[Yellow Mural 1](<https://www.google.com/maps/search/?api=1&query=40.44331%2C-79.94361>)** · Market Street',
+      '- **[Mural \\[North\\] at www.\u200Bexample.test](<https://www.google.com/maps/search/?api=1&query=40.4402%2C-79.99>)**',
+      'Until midnight.',
+    ]);
+  });
+});
+
 describe('the pictures of the research DMs (plan 8R-6)', () => {
   const looked = (source: string) =>
     `https://map.example.test/pictures/${String(source.length)}.png`;
diff --git a/src/render/research.ts b/src/render/research.ts
index 1a7912a79cd1ad485ae7ec431ed5abdd3bee453a..044816cb10457cf9df252a53d1b7d92ade280be0 100644
--- a/src/render/research.ts
+++ b/src/render/research.ts
@@ -18,6 +18,7 @@ import type {
   StopReport,
 } from '../domain/stops/report.js';
 import { cutText } from './party-post.js';
+import { linkTextOf, stopMapsUrl } from './raid-post.js';
 import {
   clockOrDay,
   count,
@@ -70,6 +71,22 @@ export function stopLine(stop: Pick<ReportedStop, 'name' | 'address'>): string {
   return stop.address === null ? name : `${name} · ${plainNoLinks(truncate(stop.address, 80))}`;
 }
 
+/**
+ * A stop as a line of "Today’s Stops" and of the research and Rocket DMs names it (plan 8R-7;
+ * Matt's R6): its name, bold, the link to its place on Google Maps (`stopMapsUrl`, in angle
+ * brackets: no preview), then its address: `**[Yellow Mural](<https://…>)** · Market Street`.
+ * The name is cut before it is made plain, and a bracket in it cannot end the link early
+ * (`linkTextOf`); it is always made plain without a working address (`plainNoLinks`, review
+ * 8R7-1: a stop named `https://…` or `www.…` would show one address and link another, and the
+ * line reaches other members' DMs). The party posts keep the name plain bold (`gymWhere`): this
+ * differs by Matt's choice.
+ */
+export function stopMapLine(stop: Pick<ReportedStop, 'name' | 'address' | 'lat' | 'lon'>): string {
+  const text = linkTextOf(truncate(stop.name, 80), plainNoLinks);
+  const name = `**[${text}](<${stopMapsUrl(stop)}>)**`;
+  return stop.address === null ? name : `${name} · ${plainNoLinks(truncate(stop.address, 80))}`;
+}
+
 /**
  * When a period's reports end, as a sentence ends: `until midnight` for the next local midnight,
  * else the time, with its day when it is not today (`clockOrDay`; review B7): a multi-day
@@ -338,14 +355,15 @@ export function researchConfirmBrief(
 
 /**
  * Field research in brief, for a direct message (`notifyDm`): the rewards ("one of" where one is
- * drawn), a line per stop with its address (ten at most, the rest counted) and until when
+ * drawn), a line per stop, its name the link to its place and its address (`stopMapLine`, plan
+ * 8R-7; ten at most, the rest counted) and until when
  * (`periodEndWords`: the day too when it is not today, review B7), with its picture by the rule
  * (plan 8R-6: a reward's own, the encounter picture for "one of") and the colour of research.
  */
 export function researchDmBrief(
   view: {
     research: Pick<ResearchDetail, 'rewards'>;
-    stops: readonly Pick<ReportedStop, 'name' | 'address'>[];
+    stops: readonly Pick<ReportedStop, 'name' | 'address' | 'lat' | 'lon'>[];
     /** When the reports end, as a sentence ends (`periodEndWords`). */
     until: string;
   },
@@ -353,12 +371,7 @@ export function researchDmBrief(
 ): { accent: number; picture?: string; lines: string[] } {
   const { rewards } = view.research;
   const short = rewards.length === 0 ? '' : plainNoLinks(rewardsInShort(rewards));
-  const stops = view.stops.slice(0, DM_STOPS_SHOWN).map((stop) => {
-    const name = `**${plainNoLinks(truncate(stop.name, 80))}**`;
-    return stop.address === null
-      ? `- ${name}`
-      : `- ${name} · ${plainNoLinks(truncate(stop.address, 80))}`;
-  });
+  const stops = view.stops.slice(0, DM_STOPS_SHOWN).map((stop) => `- ${stopMapLine(stop)}`);
   const more = view.stops.length - DM_STOPS_SHOWN;
   const { until } = view;
   return {
diff --git a/src/render/rocket.test.ts b/src/render/rocket.test.ts
index d69c286a1c26dc2e41624e4d53563e257e9d9d18..59d09745d25ef858d4025da67f064fe30ce0303f 100644
--- a/src/render/rocket.test.ts
+++ b/src/render/rocket.test.ts
@@ -90,6 +90,23 @@ describe('rocketDmBrief (plan 8R-6)', () => {
   const pictureOf = (key: string, catches = feedChoice(key).catches) =>
     rocketDmBrief({ key, catches, stop: reportedStop(1), ends: { goneAt: GONE } }, looked).picture;
 
+  it('names the stop as a link to its place (plan 8R-7), plain and without a working address', () => {
+    const { lines } = rocketDmBrief({
+      key: 'leader:arlo',
+      catches: [],
+      stop: reportedStop(1, {
+        name: 'Mural [North] at www.example.test',
+        lat: 40.4433123456789,
+        lon: -79.9436123456789,
+      }),
+      ends: { until: 'until midnight' },
+    });
+    expect(lines).toEqual([
+      '- **[Mural \\[North\\] at www.\u200Bexample.test](<https://www.google.com/maps/search/?api=1&query=40.44331%2C-79.94361>)** · Market Street',
+      'Until midnight.',
+    ]);
+  });
+
   it('shows the encounter picture while the catch is open, the Pokémon of one, a leader’s portrait', () => {
     const water = feedChoice('grunt:water').catches;
     expect(pictureOf('grunt:water')).toBe(looked(ENCOUNTER_PICTURE));
diff --git a/src/render/rocket.ts b/src/render/rocket.ts
index fd5cc1986ee82cf6b71a89266980fbf80edfce67..58efd6fdb2856896964ee2d27e6d15f0b0e671e5 100644
--- a/src/render/rocket.ts
+++ b/src/render/rocket.ts
@@ -7,7 +7,7 @@ import type { ReportedStop, RocketDetail, RocketReport } from '../domain/stops/r
 import { wayspotPicture } from '../domain/wayspots/picture.js';
 import { cutText } from './party-post.js';
 import { mapMarkdown } from './raid-post.js';
-import { DISCORD_CHANNEL, stopLine, type ChannelNamer } from './research.js';
+import { DISCORD_CHANNEL, stopLine, stopMapLine, type ChannelNamer } from './research.js';
 import {
   memberByName,
   memberName,
@@ -79,7 +79,7 @@ function replacedLabel(replaced: RocketReport, report: RocketReport): string {
     : rocketLabel(replaced.rocket);
 }
 
-/** A stop as a line names it in a public message or a DM: plain, without links, cut. */
+/** A stop as a line names it in a grunt's message (its Where line, beside [Map]): plain, without links, cut. */
 export function rocketStopLine(stop: Pick<ReportedStop, 'name' | 'address'>): string {
   const name = `**${plainNoLinks(truncate(stop.name, 80))}**`;
   return stop.address === null ? name : `${name} · ${plainNoLinks(truncate(stop.address, 80))}`;
@@ -274,8 +274,9 @@ export function rocketDmSentence(view: {
 }
 
 /**
- * Team GO Rocket in brief, for a direct message (`notifyDm`): what can be caught, the stop with
- * its address line, and when the report goes (a grunt) or until when it stands (a hideout), with
+ * Team GO Rocket in brief, for a direct message (`notifyDm`): what can be caught, the stop, its
+ * name the link to its place, with its address line (`stopMapLine`, plan 8R-7), and when the
+ * report goes (a grunt) or until when it stands (a hideout), with
  * its picture by the rule (plan 8R-6, `rocketPicture` of who, `key`: the encounter picture while
  * the catch is open, the Pokémon of one, a leader's or Giovanni's portrait) and Rocket's colour.
  */
@@ -284,7 +285,7 @@ export function rocketDmBrief(
     /** Who it is of (`rocketKey`). */
     key: string;
     catches: readonly RocketCatch[];
-    stop: Pick<ReportedStop, 'name' | 'address'>;
+    stop: Pick<ReportedStop, 'name' | 'address' | 'lat' | 'lon'>;
     /** A grunt: when its report goes; a hideout: until when, as a sentence ends it. */
     ends: { goneAt: number } | { until: string };
   },
@@ -302,7 +303,7 @@ export function rocketDmBrief(
     ...(picture === undefined ? {} : { picture }),
     lines: [
       ...(catches === '' ? [] : [`**Catch** ${catches}`]),
-      `- ${rocketStopLine(view.stop)}`,
+      `- ${stopMapLine(view.stop)}`,
       ends,
     ],
   };
diff --git a/src/render/stop-post.test.ts b/src/render/stop-post.test.ts
index c48dde6763ee16f7be5177ce1e46761ec4a55fb8..981c2b261bcb490c958c736d1daefd2a9d0f0130 100644
--- a/src/render/stop-post.test.ts
+++ b/src/render/stop-post.test.ts
@@ -16,6 +16,8 @@ import { GIOVANNI_PORTRAIT, LEADER_PORTRAITS } from '../domain/rocket/portraits.
 import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
 import { StopPictures } from '../services/stop-pictures.js';
 import {
+  BLOCK_ROOM,
+  CLASSIC_BLOCK_ROOM,
   postPictures,
   stopPostMessages,
   stopPostText,
@@ -25,6 +27,12 @@ import {
 
 const DRAGON = pageTask('Catch a Dragon-type Pokémon');
 
+/** Where `reportedStop(n)` lies on Google Maps (40.44 + n / 10,000, −79.99), as the post links it. */
+const mapOf = (n: number): string =>
+  `https://www.google.com/maps/search/?api=1&query=${String((404_400 + n) / 10_000)}%2C-79.99`;
+/** The name of `reportedStop(n)` in the post (plan 8R-7): bold, the link to its place. */
+const named = (n: number, name = `Stop ${String(n)}`): string => `**[${name}](<${mapOf(n)}>)**`;
+
 /** The dragon task at `n` stops (or `stops`), each by a reporter of its own: one version. */
 function atStops(
   n: number,
@@ -66,7 +74,8 @@ describe('the post "Today’s Stops"', () => {
     const text = textOf(message);
     expect(text).toContain('Stop xxxxxxxxxx');
     expect(text).toContain('- …and 25 more stops');
-    expect(text).not.toContain(' 16** ·');
+    expect(text).toContain(` 15](<${mapOf(15)}>)** · Market Street · **Member 14**`);
+    expect(text).not.toContain(' 16](<');
   });
 
   it('says so when nothing is reported, and names the task beside its picture', () => {
@@ -97,10 +106,10 @@ describe('the post "Today’s Stops"', () => {
       [
         '**Make 3 Great Throws in a row**',
         'Lileep',
-        '- **Stop 1** · **Member 1**',
-        '- **Stop 2** · **Member 2**',
+        `- ${named(1)} · **Member 1**`,
+        `- ${named(2)} · **Member 2**`,
         'one of Lileep, Anorith',
-        '- **Stop 3** · **Member 3**',
+        `- ${named(3)} · **Member 3**`,
       ].join('\n'),
     );
     expect([...layout.placement]).toEqual([
@@ -130,11 +139,11 @@ describe('the post "Today’s Stops"', () => {
     expect(text).toContain(
       [
         'Pikachu',
-        '- **Stop 1** · **Member 1**',
+        `- ${named(1)} · **Member 1**`,
         'Pikachu (costumed)',
-        '- **Stop 2** · **Member 2**',
+        `- ${named(2)} · **Member 2**`,
         'one of Pikachu, Pikachu (costumed)',
-        '- **Stop 3** · **Member 3**',
+        `- ${named(3)} · **Member 3**`,
       ].join('\n'),
     );
   });
@@ -231,6 +240,146 @@ describe('the post "Today’s Stops"', () => {
     expect(lines(classic?.content ?? '').at(-1)).toMatch(/^- …and \d+ more stops?$/);
   });
 
+  describe('each stop’s name a link to its place (plan 8R-7, E1; Matt’s R6)', () => {
+    /** Where these stops lie: 15-digit coordinates, rounded to five decimals in the link. */
+    const FAR = { lat: 40.4433123456789, lon: -79.9436123456789 };
+    const URL = 'https://www.google.com/maps/search/?api=1&query=40.44331%2C-79.94361';
+
+    it('links every stop line to Google Maps, its coordinates rounded to five decimals', () => {
+      const view = {
+        day: 'Saturday, November 21',
+        tasks: [
+          atStops(0, 'dragon', [
+            {
+              stop: reportedStop(1, { name: 'Yellow Mural', ...FAR }),
+              reporter: { id: '200000000000001000', name: 'Misty' },
+            },
+          ]),
+        ],
+        hideouts: [
+          {
+            key: 'leader:arlo',
+            name: 'Arlo',
+            catches: [],
+            stops: [
+              {
+                stop: reportedStop(2, { name: 'Blue Door', address: null, ...FAR }),
+                reporter: { id: '200000000000001001', name: 'Brock' },
+              },
+            ],
+          },
+        ],
+        waiting: {
+          at: Date.UTC(2026, 10, 21, 22),
+          tasks: [
+            atStops(0, 'day', [
+              {
+                stop: reportedStop(3, { name: 'Red Bench', ...FAR }),
+                reporter: { id: '200000000000001002', name: 'Ash' },
+              },
+            ]),
+          ],
+        },
+      };
+      for (const text of [
+        textOf(stopPostMessages(view).messages[0]),
+        stopPostText(view).messages[0]?.content ?? '',
+      ]) {
+        expect(text).toContain(`- **[Yellow Mural](<${URL}>)** · Market Street · **Misty**`);
+        expect(text).toContain(`- **[Blue Door](<${URL}>)** · **Brock**`);
+        expect(text).toContain(`- **[Red Bench](<${URL}>)** · Market Street · **Ash**`);
+      }
+    });
+
+    it('keeps a bracket of a stop’s name from ending the link early', () => {
+      const view = {
+        day: 'Saturday, November 21',
+        tasks: [
+          atStops(0, 'dragon', [
+            {
+              stop: reportedStop(1, { name: 'Mural [North] (Old)', address: null, ...FAR }),
+              reporter: { id: '200000000000001000', name: 'Misty' },
+            },
+          ]),
+        ],
+      };
+      expect(textOf(stopPostMessages(view).messages[0])).toContain(
+        `- **[Mural \\[North\\] (Old)](<${URL}>)** · **Misty**`,
+      );
+    });
+
+    it('shows no address of its own in a stop’s name: the link goes only to the stop’s place (8R7-1)', () => {
+      const view = {
+        day: 'Saturday, November 21',
+        tasks: [
+          atStops(0, 'dragon', [
+            {
+              stop: reportedStop(1, { name: 'https://evil.test/x', address: null, ...FAR }),
+              reporter: { id: '200000000000001000', name: 'Misty' },
+            },
+            {
+              stop: reportedStop(2, { name: 'www.example.test', address: null, ...FAR }),
+              reporter: { id: '200000000000001001', name: 'Brock' },
+            },
+          ]),
+        ],
+      };
+      for (const text of [
+        textOf(stopPostMessages(view).messages[0]),
+        stopPostText(view).messages[0]?.content ?? '',
+      ]) {
+        expect(text).toContain(`- **[https:\u200B//evil.\u200Btest/x](<${URL}>)** · **Misty**`);
+        expect(text).toContain(`- **[www.\u200Bexample.test](<${URL}>)** · **Brock**`);
+      }
+    });
+
+    it('fits a busy day by the old rules: as many whole lines as the room holds, links never cut (R7)', () => {
+      const stops = Array.from({ length: 15 }, (_, i) => ({
+        stop: reportedStop(i + 1, {
+          name: `Stop ${String(i + 10)} ${'n'.repeat(62)}`,
+          address: `${String(1000 + i)} ${'a'.repeat(65)}`,
+          ...FAR,
+        }),
+        reporter: { id: `20000000000000${String(1000 + i)}`, name: `Reporter ${'r'.repeat(21)}` },
+      }));
+      const view = { day: 'Saturday, November 21', tasks: [atStops(0, 'dragon', stops)] };
+      const line = (i: number) =>
+        `- **[${stops[i]!.stop.name}](<${URL}>)** · ${stops[i]!.stop.address!} · ` +
+        `**${stops[i]!.reporter.name}**`;
+      const length = line(0).length;
+      const more = (left: number) => `- …and ${String(left)} more stop${left === 1 ? '' : 's'}`;
+      /** How many lines fit `room` after the head, the line counting the rest kept: `fill`'s rule. */
+      const fitting = (head: string, room: number): number => {
+        let n = 0;
+        while (
+          n < 15 &&
+          head.length + (n + 1) * (1 + length) + (n + 1 < 15 ? 1 + more(14 - n).length : 0) <= room
+        ) {
+          n += 1;
+        }
+        return n;
+      };
+      const [v2, ...spilt] = stopPostMessages(view).messages;
+      const [classic] = stopPostText(view).messages;
+      expect(spilt).toEqual([]);
+      // The room of a block's text, a message's and the plain text's.
+      for (const [text, room] of [
+        [textOf(v2), BLOCK_ROOM],
+        [classic?.content ?? '', CLASSIC_BLOCK_ROOM],
+      ] as const) {
+        const lines = text.split('\n');
+        const head = lines.find((one) => one.startsWith('**Catch a Dragon-type Pokémon**')) ?? '';
+        const shown = fitting(head, room);
+        expect(shown).toBeLessThan(15);
+        const linked = lines.filter((one) => one.startsWith('- **['));
+        expect(linked).toEqual(Array.from({ length: shown }, (_, i) => line(i)));
+        expect(lines).toContain(more(15 - shown));
+      }
+      // The pictures as before: the task's, beside it.
+      expect(JSON.stringify(v2)).toContain(ENCOUNTER_PICTURE);
+    });
+  });
+
   describe('the hideouts of Team GO Rocket (plan 8R-2)', () => {
     const hideout = (key: string, n: number): PostHideout => ({
       key,
@@ -255,10 +404,11 @@ describe('the post "Today’s Stops"', () => {
       expect(research).toBeGreaterThan(0);
       expect(rocket).toBeGreaterThan(research);
       expect(text.slice(rocket)).toContain(
-        '**Giovanni** · catch Zekrom\n- **Hideout stop 1** · **Grunt fan 0**',
+        `**Giovanni** · catch Zekrom\n- ${named(1, 'Hideout stop 1')} · **Grunt fan 0**`,
       );
       expect(text.slice(rocket)).toContain(
-        '**Arlo** · catch Alolan Grimer\n- **Hideout stop 1** · **Grunt fan 0**\n- **Hideout stop 2** · **Grunt fan 1**',
+        `**Arlo** · catch Alolan Grimer\n- ${named(1, 'Hideout stop 1')} · **Grunt fan 0**\n` +
+          `- ${named(2, 'Hideout stop 2')} · **Grunt fan 1**`,
       );
       expect(layout.placement.get('giovanni')).toBe(0);
       expect(layout.placement.get('leader:arlo')).toBe(0);
@@ -304,7 +454,7 @@ describe('the post "Today’s Stops"', () => {
         hideouts: [hideout('leader:sierra', 1)],
       });
       expect(messages[0]?.content).toContain(
-        '### Team GO Rocket hideouts\n**Sierra** · catch Pancham\n- **Hideout stop 1** · **Grunt fan 0**',
+        `### Team GO Rocket hideouts\n**Sierra** · catch Pancham\n- ${named(1, 'Hideout stop 1')} · **Grunt fan 0**`,
       );
       expect(placement.get('leader:sierra')).toBe(0);
     });
@@ -399,14 +549,17 @@ describe('the pictures of the post (plan 8R-6)', () => {
     const pieces = piecesOf(message).slice(1);
     expect(pieces).toEqual([
       { text: '**Task throws**' },
-      { text: 'Lileep\n- **Stop 1** · **Member 1**', picture: LILEEP!.image },
-      { text: 'Rare Candy ×1\n- **Stop 101** · **Member 101**', picture: item('Rare Candy').image },
+      { text: `Lileep\n- ${named(1)} · **Member 1**`, picture: LILEEP!.image },
+      {
+        text: `Rare Candy ×1\n- ${named(101)} · **Member 101**`,
+        picture: item('Rare Candy').image,
+      },
       {
-        text: 'one of Lileep, Anorith\n- **Stop 201** · **Member 201**',
+        text: `one of Lileep, Anorith\n- ${named(201)} · **Member 201**`,
         picture: ENCOUNTER_PICTURE,
       },
       // A line without a picture: text alone.
-      { text: 'reward not said\n- **Stop 301** · **Member 301**' },
+      { text: `reward not said\n- ${named(301)} · **Member 301**` },
     ]);
   });
 
@@ -417,7 +570,7 @@ describe('the pictures of the post (plan 8R-6)', () => {
     }).messages;
     expect(piecesOf(message).slice(1)).toEqual([
       {
-        text: '**Task one** · one of Lileep, Anorith\n- **Stop 1** · **Member 1**\n- **Stop 2** · **Member 2**',
+        text: `**Task one** · one of Lileep, Anorith\n- ${named(1)} · **Member 1**\n- ${named(2)} · **Member 2**`,
         picture: ENCOUNTER_PICTURE,
       },
     ]);
@@ -442,11 +595,11 @@ describe('the pictures of the post (plan 8R-6)', () => {
       '**Task many**',
       [
         'Great Ball ×1',
-        '- **Stop 101** · **Member 101**',
+        `- ${named(101)} · **Member 101**`,
         'Ultra Ball ×1',
-        '- **Stop 201** · **Member 201**',
+        `- ${named(201)} · **Member 201**`,
         'Razz Berry ×1',
-        '- **Stop 301** · **Member 301**',
+        `- ${named(301)} · **Member 301**`,
       ].join('\n'),
     ]);
     expectV2Sendable(message!);
diff --git a/src/render/stop-post.ts b/src/render/stop-post.ts
index a17c31689a1d360b12d664d4114c00a2bb25d27c..efb4af84af947994902d004b54ad250e981bc0c5 100644
--- a/src/render/stop-post.ts
+++ b/src/render/stop-post.ts
@@ -11,7 +11,7 @@ import {
 } from '../domain/stops/pictures.js';
 import type { Reporter, ReportedStop, ResearchDetail } from '../domain/stops/report.js';
 import { cutText, TEXT_BUDGET } from './party-post.js';
-import { RESEARCH_COLOUR, rewardWords, stopLine, taskText } from './research.js';
+import { RESEARCH_COLOUR, rewardWords, stopMapLine, taskText } from './research.js';
 import { catchWords } from './rocket.js';
 import { count, memberByName, plain, timestamp } from './text.js';
 import { container, countComponents, section, separator, textDisplay, thumbnail } from './v2.js';
@@ -153,7 +153,9 @@ interface StopGroup {
 
 /**
  * The stop lines of each group that fit `room` characters after `used` of them: whole lines
- * only, `STOPS_SHOWN` stops at most in all, a group's line only with at least one of its stops
+ * only (each stop's name the link to its place, `stopMapLine`, plan 8R-7: a line is counted with
+ * its link, so a link is never cut), `STOPS_SHOWN` stops at most in all, a group's line only with
+ * at least one of its stops
  * (each line made of parts cut before they are escaped, design 9.7, and never cut itself: review
  * B6), and how many are left over to be counted.
  */
@@ -169,7 +171,7 @@ function fill(
   fill: for (const [at, group] of groups.entries()) {
     for (const [index, { stop, reporter }] of group.stops.entries()) {
       if (shown >= STOPS_SHOWN) break fill;
-      const own = `- ${stopLine(stop)} · ${memberByName(reporter)}`;
+      const own = `- ${stopMapLine(stop)} · ${memberByName(reporter)}`;
       const line = index === 0 && group.line !== undefined ? `${group.line}\n${own}` : own;
       const left = total - shown - 1;
       const tail = left > 0 ? 1 + moreStops(left).length : 0;
@@ -437,7 +439,7 @@ function layoutOf(
       sources.push(source);
       return picture(source);
     };
-    const own = blockParts(block, TEXT_BUDGET - TAIL_ROOM - 200, step, named);
+    const own = blockParts(block, BLOCK_ROOM, step, named);
     const joined = [...parts, separator(), ...own];
     if (fits(joined)) {
       parts = joined;
@@ -469,6 +471,15 @@ export interface PostLayout<T> {
 /** Room kept in every message for the line "…and N more tasks" and its component. */
 const TAIL_ROOM = 80;
 
+/**
+ * The room of one block's text in a components-v2 message: `TEXT_BUDGET` less the tail line's
+ * room and 200 for the head of a message the block may open.
+ */
+export const BLOCK_ROOM = TEXT_BUDGET - TAIL_ROOM - 200;
+
+/** The room of one block's text in the plain text post. */
+export const CLASSIC_BLOCK_ROOM = 1_800;
+
 /** The text of components, as Discord counts it against a message's 4,000 characters. */
 function textOf(parts: readonly object[]): number {
   return parts.reduce((sum: number, part) => {
@@ -499,10 +510,10 @@ export function stopPostText(view: StopPostView): PostLayout<ClassicMessage> {
   for (const block of blocks) {
     const text = cutText(
       block
-        .pieces(1_800)
+        .pieces(CLASSIC_BLOCK_ROOM)
         .map((piece) => piece.text)
         .join('\n'),
-      1_800,
+      CLASSIC_BLOCK_ROOM,
     );
     const joined = `${current}\n\n${text}`;
     if (joined.length <= CLASSIC_TEXT - TAIL_ROOM) {
diff --git a/src/services/notify-service.research.test.ts b/src/services/notify-service.research.test.ts
index 63329822e596eb36e7a29adeff7bdc27750f7536..aeba08ad205442bfbecc9bf9fded09a6fd909a15 100644
--- a/src/services/notify-service.research.test.ts
+++ b/src/services/notify-service.research.test.ts
@@ -38,6 +38,10 @@ const RITA = { id: REPORTER, name: 'Rita' };
 /** Stops in West (40.0–40.1, −80.1–−80.0) and one in East. */
 const west = (n: number): ReportedStop => reportedStop(n, { lat: 40.05 + n / 1_000, lon: -80.05 });
 const east = reportedStop(90, { lat: 40.05, lon: -79.95 });
+/** The line of `west(n)` in a DM: its name the link to its place (plan 8R-7). */
+const westDm = (n: number): string =>
+  `- **[Yellow Mural ${String(n)}](<https://www.google.com/maps/search/?api=1&query=` +
+  `${String((40_050 + n) / 1_000)}%2C-80.05>)** · Market Street`;
 
 /** A task of the page that gives this reward. */
 function taskGiving(fits: (reward: ResearchTask['rewards'][number]) => boolean): ResearchTask {
@@ -127,8 +131,8 @@ describe('NotifyService: field research is reported (plan 8R-1, design 7)', () =
     );
     expect(dmBrief(message)).toEqual([
       '**Rewards** one of Dratini, Bagon, Axew +4',
-      '- **Yellow Mural 1** · Market Street',
-      '- **Yellow Mural 2** · Market Street',
+      westDm(1),
+      westDm(2),
       'Until midnight.',
     ]);
     expect(dmReasons(message)).toEqual(['Dratini · Research']);
@@ -166,8 +170,8 @@ describe('NotifyService: field research is reported (plan 8R-1, design 7)', () =
     const first = await made.report(DRAGON, [west(1)]);
     await made.report(DRAGON, [west(2), west(1)], { id: BOB, name: 'Bob' });
     expect(made.dms.to(ALICE).map((message) => dmBrief(message).slice(1, -1))).toEqual([
-      ['- **Yellow Mural 1** · Market Street'],
-      ['- **Yellow Mural 2** · Market Street'],
+      [westDm(1)],
+      [westDm(2)],
     ]);
     // Taken back and reported again in the period: no news for who was told.
     const id = first.saved[0]?.report.id ?? 0;
@@ -335,10 +339,7 @@ describe('NotifyService: field research is reported (plan 8R-1, design 7)', () =
       await made.reportVersion(GIBLE, [west(3), west(4)], BOB_);
       const last = made.dms.to(ALICE).at(-1);
       expect(dmSentence(last)).toContain('Field research has been reported');
-      expect(dmBrief(last).slice(1, -1)).toEqual([
-        '- **Yellow Mural 3** · Market Street',
-        '- **Yellow Mural 4** · Market Street',
-      ]);
+      expect(dmBrief(last).slice(1, -1)).toEqual([westDm(3), westDm(4)]);
       expect(made.dms.to(ALICE)).toHaveLength(3);
     });
 
@@ -370,13 +371,10 @@ describe('NotifyService: field research is reported (plan 8R-1, design 7)', () =
       release();
       await made.notify.flush();
       const [oneOf, gible] = made.dms.to(ALICE);
-      expect(dmBrief(oneOf).slice(1, -1)).toEqual(['- **Yellow Mural 2** · Market Street']);
+      expect(dmBrief(oneOf).slice(1, -1)).toEqual([westDm(2)]);
       // Not told of the "one of" at Yellow Mural 1: the usual DM.
       expect(dmSentence(gible)).toContain('Field research has been reported');
-      expect(dmBrief(gible).slice(0, -1)).toEqual([
-        '**Rewards** Gible',
-        '- **Yellow Mural 1** · Market Street',
-      ]);
+      expect(dmBrief(gible).slice(0, -1)).toEqual(['**Rewards** Gible', westDm(1)]);
     });
 
     it('leaves a stop taken back before its turn out of the "one of" DM (R6)', async () => {
@@ -402,7 +400,7 @@ describe('NotifyService: field research is reported (plan 8R-1, design 7)', () =
       release();
       await made.notify.flush();
       expect(made.dms.to(ALICE).map((message) => dmBrief(message).slice(1, -1))).toEqual([
-        ['- **Yellow Mural 2** · Market Street'],
+        [westDm(2)],
       ]);
     });
 
@@ -529,10 +527,7 @@ describe('NotifyService: field research is reported (plan 8R-1, design 7)', () =
         expect.stringContaining(`reported in <#${WEST_CHANNEL}>`),
         expect.stringContaining(`reported in <#${EAST_CHANNEL}>`),
       ]);
-      expect(dmBrief(inWest).slice(0, -1)).toEqual([
-        '**Rewards** Gible',
-        '- **Yellow Mural 1** · Market Street',
-      ]);
+      expect(dmBrief(inWest).slice(0, -1)).toEqual(['**Rewards** Gible', westDm(1)]);
     });
   });
 
diff --git a/src/services/notify-service.rocket.test.ts b/src/services/notify-service.rocket.test.ts
index 94c237b8a129a3ab91171c8f83947d497247bfd1..19b5b8262b43e2beef65a79ed11acc5b143803a1 100644
--- a/src/services/notify-service.rocket.test.ts
+++ b/src/services/notify-service.rocket.test.ts
@@ -35,6 +35,10 @@ const RITA = { id: REPORTER, name: 'Rita' };
 /** Stops in West (40.0–40.1, −80.1–−80.0), one in East, one in both (on their border). */
 const west = (n: number): ReportedStop => reportedStop(n, { lat: 40.05 + n / 1_000, lon: -80.05 });
 const east = reportedStop(90, { lat: 40.05, lon: -79.95 });
+/** The line of `west(n)` in a DM: its name the link to its place (plan 8R-7). */
+const westDm = (n: number): string =>
+  `- **[Yellow Mural ${String(n)}](<https://www.google.com/maps/search/?api=1&query=` +
+  `${String((40_050 + n) / 1_000)}%2C-80.05>)** · Market Street`;
 
 const rocketWant = (who: string): TargetWant => ({ kind: 'rocket', who });
 
@@ -112,7 +116,7 @@ describe('NotifyService: Team GO Rocket is reported (plan 8R-2, design 7)', () =
     );
     expect(dmBrief(message)).toEqual([
       '**Catch** one of Mudkip, Tentacool, Krabby, Magikarp, Feebas',
-      '- **Yellow Mural 1** · Market Street',
+      westDm(1),
       `The report goes away <t:${String(Math.floor(outcome.report.endsAt / 1_000))}:R>.`,
     ]);
     expect(dmReasons(message)).toEqual(['Water-type grunt']);
diff --git a/src/services/stop-posts.test.ts b/src/services/stop-posts.test.ts
index f28b6b685a54be51a4d79fd252a36dcffcfb22b9..493bb21df59dab519fe4e8079a5fd01f2f563b53 100644
--- a/src/services/stop-posts.test.ts
+++ b/src/services/stop-posts.test.ts
@@ -31,6 +31,10 @@ const ASH = { id: '200000000000000061', name: 'Ash' };
 /** Stops in West (`reportedStop` lies at 40.44: moved into West here) and one in East. */
 const west = (n: number) => reportedStop(n, { lat: 40.05 + n / 1_000, lon: -80.05 });
 const east = reportedStop(90, { lat: 40.05, lon: -79.95 });
+/** The line of `west(n)` in the post, reported by Ash: its name the link to its place (8R-7). */
+const westLine = (n: number): string =>
+  `- **[Yellow Mural ${String(n)}](<https://www.google.com/maps/search/?api=1&query=` +
+  `${String((40_050 + n) / 1_000)}%2C-80.05>)** · Market Street · **Ash**`;
 
 function postsWith(initial: ResearchEvent[] = [], pictures?: PictureMaker) {
   const clock = { now: at('2026-11-21T10:00') };
@@ -142,7 +146,7 @@ describe('StopPostService', () => {
     expect(made.said()[0]).toContain('## Today’s Stops');
     expect(made.said()[0]).toContain('Saturday, November 21');
     expect(made.said()[0]).toContain(
-      '**Catch a Dragon-type Pokémon** · one of Dratini, Bagon, Axew +4\n- **Yellow Mural 1** · Market Street · **Ash**',
+      `**Catch a Dragon-type Pokémon** · one of Dratini, Bagon, Axew +4\n${westLine(1)}`,
     );
     expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual([first?.id]);
     expect(made.gateway.pinNotices).toBe(1);
@@ -178,7 +182,7 @@ describe('StopPostService', () => {
     await made.reportVersion(throws, version('Beldum'), [west(4)]);
     await made.report(pageTask('Catch 7 Pokémon'), [west(5), west(6), west(7)]);
     await made.posts.flush();
-    const stop = (n: number) => `- **Yellow Mural ${String(n)}** · Market Street · **Ash**`;
+    const stop = westLine;
     // The task of most stops first; its rewards' stops, then those of "one of".
     expect(made.said()[0]).toContain(
       [
@@ -225,7 +229,7 @@ describe('StopPostService', () => {
     await made.reportVersion(great, versionOf(great, 'one of Lileep, Anorith'), [west(4)]);
     await made.reportVersion(great, versionOf(great, 'Lileep'), [west(5)]);
     await made.posts.flush();
-    const stop = (n: number) => `- **Yellow Mural ${String(n)}** · Market Street · **Ash**`;
+    const stop = westLine;
     const [text] = made.said();
     expect(text).toContain(`**Make 2 Excellent Throws** · Dratini\n${stop(1)}\n${stop(2)}`);
     expect(text).toContain(
@@ -294,7 +298,7 @@ describe('StopPostService', () => {
     const arlo = await rocket('leader:arlo', west(2));
     await made.posts.flush();
     expect(made.said()[0]).toContain(
-      '### Team GO Rocket hideouts\n**Arlo** · catch Alolan Grimer\n- **Yellow Mural 2** · Market Street · **Ash**',
+      `### Team GO Rocket hideouts\n**Arlo** · catch Alolan Grimer\n${westLine(2)}`,
     );
     expect(made.said()[0]).not.toContain('Water-type grunt');
     const [post] = made.gateway.messagesIn(WEST_CHANNEL);
````

## After the last task

- [ ] `npm run check > var/8r7-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `npm run test:db` (0), one at a time.
- [ ] `git diff 2e02d8dbdf63f9f4dc269ecc95d6823afb68bc34 HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory.
