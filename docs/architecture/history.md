# The party history

Every party that ends is kept in relational tables beside the live `Party` table (plan 8H; spec `2026-10-16-cutover-docker-history-design.md`, 4.3), and since plan 8H-2 every report at a stop that ends ("Reports at stops" below): what it was, where and when, how it ended and how many took part, in a form that plain SQL counts and groups. The legacy bot's parties are imported once from its files. Members are named only with their opt-in. Read before changing the history, its recording, the opt-in or the import, or before writing a statistic over it.

## The tables (migrations 018, 020, 025 and 026)

- `PartyHistory`: one row per ended party. `source` is `live` (with `partyId`, the `Party.id`, unique) or `legacy` (with `legacyKey`, `<channel>:<creation ms>`, unique). `kind` is `raid`, `train`, `meetup` or `max` (a max battle, plan 8X-3). Where: `serverId` (the server's snowflake), `regionId`, `gymId`, `legacyGymId` (the legacy file's gym, kept also when the gym list no longer has it). None of them carries a foreign key: the history outlives a server's `Guild` row (a kick and a new invite neither delete it nor split it; Matt, 2026-10-16), and a region or gym deleted later stays named by its id. What: `name` and `description` (trains and meetups), `tier` (`T1` to `T5`, `Mega`, `MegaLegendary`, `SuperMega`, `Elite`, and the legacy `T2`, `T4`, `EX`; a max battle's `D1` to `D5` or `G`; null where not known), `shadow`, `mega`, `elite`, `ex`, `shiny` (null: not known), the boss as the catalogue knows it (`bossKey`, `bossDex`, `bossSpecies`, `bossForm`; a mega's form is `<SPECIES>_<MEGA…>`) or, where it does not, by the name it was given (`bossName`), `fastMove`, `chargedMove`. When (epoch ms): `createdAt`, `hatchTime`, `startTime` (trains and meetups), `endTime`, `endedAt` (null for the legacy parties of the cutover). How it ended: `ending` (below). Who: `createdById`, `conductorId`, only with that member's opt-in, else null; `anonymous` (the reporter asked not to be named in the post). Counts, so that the common questions need no join: `attendees` (members who signed up, also those who left), `interested`, `joined`, `here`, `done` (members by the furthest status they reached), the same with their +1s (`interestedHeads` …), `extras` (all +1s), `remote`, `departed` (left before the end, not by a split); `routeStops` (a train's route at the end); `trainKind` (migration 026, below); `splitFromId` (migration 020, below).
- `PartyHistoryAttendee`: a row per member who signed up, in the order they did (`seq`): `memberId` only with their opt-in, else null (the row still counts); `status` at the end (null: they left before it), `furthest` (`interested`, `joined`, `here`, `done`; asked whether they completed it counts as `here`), `groupId`, `extras`, `remote`, `team`, and the times the bot saw (`signedUpAt`, `joinedAt`: first coming or further, `hereAt`, `doneAt`, `leftAt`; null in the legacy history); `splitOff` (migration 020: 1 for a member who left with a group split off the train, 0 otherwise).
- `PartyHistoryGroup`: a row per group: `label`, `meetingTime` (the last one set, also after the clock cleared it; the steps of a group's meeting time name it by its letter and when it was opened, `B:<stamp>`, plan 8X-1B, since a group nobody is in goes and a later one may take its letter: a pruned B's time is never a new B's; a step of before the stamps names the letter alone and counts for that letter), `members` and `heads` at the end.
- `PartyHistoryStop`: a row per stop a train made, in order (`seq`; a loop makes a gym's stop twice): `gymId` (null where the gym list no longer has it, with `legacyGymId`; null for a Power Spot), `wayspotId` (migration 026, plan 8X-4: the Wayfarer id of a Power Spot the train stopped at, null for a gym), `arrivedAt`, `leftAt` (null where not known: the first stop is reached at the train's start when it was laid earlier; a legacy train's stops have no times).
- `HistoryOptIn`: a row per member and server (by snowflake, no foreign key) who opted in.
- `PartyHistoryStep`: what happens to an active party that its model does not keep (a member's status, a member who left, a member who went with a group split off a train (`split`), where a train is (`stop`: its place, the gym or null at the end; `spot`, plan 8X-4: at a Power Spot, `subject` the bare Wayfarer id, `value` null, so that a spot is no end of the route), a group's meeting time, the raid it went on from after a move), read into the party's record when it ends and then deleted; it goes with its `Party` row. It holds the ids of everybody in an active party, as the party's own row does, until the party ends.
- Migration 020 (plan 8T): `PartyHistory.splitFromId`, in the record of a train that was split off another, that train's `partyId` (`char(36)`, null otherwise, no foreign key: a link only, each train is recorded on its own; Matt, 2026-10-17), with an index (`partyhistory_splitfromid_index`: the trains split off a train); `PartyHistoryAttendee.splitOff` (`tinyint(1) not null default 0`, written from `HistoryAttendee.splitOff`), so that SQL tells a member who went with a group from one who left. Each is added only when it is missing. `kind` of a step is `varchar(8)` since 018 and takes `split` as it is.
- Migration 025 (plan 8X-3): `PartyHistory.wayspotId` (`varchar(40)`, null), the Wayfarer id of a max battle's Power Spot, null for one at a pin (an "Unlisted power spot") and for every other party; no foreign key (a Wayspot an import deletes stays named by its id). Migration 026 (plan 8X-4) adds `PartyHistoryStop.wayspotId` the same way (`varchar(40)`, null, no foreign key, added only when missing), and `PartyHistory.trainKind` (`varchar(10)`, null, added only when missing): what a train went to, `raid`, `dynamax` or `gigantamax` (`HistoryRecord.trainKind`, `TrainParty.train.kind`; a legacy train is `raid`), null means the party is no train: 026 sets the trains recorded before it to `raid` (they all were), touching nothing else. A max battle has no `gymId`, its boss in the boss columns as a raid's, `shiny` as its post says it when it ends (`listedMaxBoss`: the max boss list's boss of its tier by catalogue entry or reported name; null where the list has none, final review X3-F4), and it took place (`completed`) when somebody completed it, as a raid. Added only when it is missing.
- `EndedPartyPost`: the post and forum of a party whose `Party` row was deleted once its record was written, for what still reads them (below): no member, no party id. Its rows are kept for good, as the ended `Party` rows were before: the post can be reopened by a late message any time.
- Text a member wrote (a train's or meetup's name, a meetup's description, a group's label) is kept with every member it names written `@member` (`withoutMembers`, `src/domain/history/party-history.ts`; mentions and bare ids of 17 to 20 digits, an emoji's tag stays), live and legacy alike.
- `createdById` of a raid whose reporter asked not to be named in the post (`anonymous`) is kept all the same when the reporter opted in to the history: a statistic shown to others later must honour `anonymous`.
- What else reads the history: `HistoryRepository.raidsByRegion(since)` (plan 8W-6) counts each region's raids and max battles (`kind` `raid` or `max`, by `regionId`, `createdAt` from `since`), the rank of a region in the line that waits for Google (`gyms-and-regions.md`); live and legacy records alike.

How a party ended (`ending`): `completed` whenever it took place (somebody completed the raid, or was at the train or meetup), however it was closed; otherwise `expired` (the clock), `cancelled` (`/delete`, its region removed, its post deleted by hand), `cutover` (a legacy party still going on at the cutover), `unknown` (nobody said: a legacy raid nobody completed, whose files do not say whether it ran out or was deleted; a party the sweep recorded, which runs at start and hourly).

## Recording live parties

- `PartyStore` asks `PartyHistory` (`src/services/party-history.ts`) for a note of every write (`noteOf`, pure: `partySteps` and `historyOfParty` in `src/domain/history/party-history.ts`), which the storage writes with the party. Steps alone (every click) follow the party's write in one insert of their own, no transaction (`round-trips.db.test.ts` counts it); a late step of a party that has ended is dropped. A write that ends the party writes its record in the same transaction, behind a savepoint, reading the opt-ins under a shared lock (an opt-out under way finishes first). A record that fails is rolled back alone and the end stands; a deadlock (on the party's row or in the record) runs the whole transaction again (`retryOnDeadlock`, `DEADLOCK_TRIES`); when one persists, or another failure took the whole transaction with it, the party's write is run again alone. `PartyRepository` (over the pool, never a caller's transaction) hands the note to `historyFailed` once the party's write has committed: `PartyHistory.failed` tries it again after 1, 10 and 60 minutes (and once at shutdown), then gives up with an error in the log.
- Once the record is written, in the same transaction, the party's `Party` row is deleted (Matt, 2026-10-16): it holds its maker's and every member's id. What still reads ended parties is the hourly `sweepPosts` (`endedPosts`: the posts of ended parties, to archive one a late message reopened) and the forums parties named (`partyForums`: `/region list`, `/admin setup-forums`); both read `EndedPartyPost` beside the rows of parties not yet recorded. Nothing else reads an ended row: the post's controls find a party in the store's memory, the copies and the post's last showing use the party in memory, access grants follow the store, and the repository has no other reader of ended rows. So once a party is recorded, no id of a member who did not opt in is left in the party and history tables (`history-recording.db.test.ts` checks every one). A member's grant to another region's forum (`PartyAccessGrant`) names the party too, but it is taken back when the party ends, and it is about access, not about what the member did.
- With the forums' upkeep (`PartyScheduler`, at start after the login, and hourly), `PartyHistory.sweep` records every ended party whose row is still there (its record failed every try, the bot stopped first, or it ended before the history existed, with steps or without) as `unknown`, then deletes its row: a record that gave up keeps member ids for an hour at most, not until a restart. A party with no post (it never was one) is dropped; a row that cannot be read is logged and left, as the store leaves one; a raid that moved is left to the party it goes on as; a party whose note waits for its next try (`failed`), as its own or as the `from` step of the raid that went on from it, is left to that try, which knows how it ended. It reads the rows first and logs how many it is about to record (nothing when there are none), then how far it got every 1,000 (the first start on a database with many old ended rows records them all, in the background). It asks the scheduler's stop before each party (`sweep({ isStopped })`) and ends there, so a shutdown does not wait for it. `partyId` is unique: a party is never recorded twice.
- A record takes along only parties it went on from that have ended, locked first, and never walks past one that has not: a move that failed (the old raid stayed) leaves the old raid to its own record. Raids that moved before migration 018 have no `from` step: the old and the new party are each recorded, so such a raid counts twice.
- A change that ends a party says why with `ended` in its result (`PartyEnd`): the scheduler `clock`; `PartyService.end` `cancelled` unless told otherwise; a deleted post `cancelled`; a raid that moved to another region `moved`; a party that never had its post `failed`, which is dropped. A change that says nothing is recorded as `unknown`. A raid that moved goes on as a new party whose first step (`from`) names the old one (and the old one's end writes it again): the new party's record takes the old one's steps and row along (one record, with the times from before the move; `createdAt` stays), and nothing records the old one by itself.
- Members, the maker and the conductor are named as their opt-ins are when the record is written.
- A train a group was split off (plan 8T) is recorded on its own, and so is the train the group became (`splitFromId` names the old one). A write that adds a split to `train.splitOff` notes who left in it as `split`, not `left` (`partySteps`): they are attendees of the old train up to the split (`leftAt` the split, `status` null, `splitOff` 1) and not `departed`. The new train is stored with its post before the old train loses the group, and is `pending` until the one write of both trains (`PartyStore.updateBoth`: the old train's loss of the group and the new train's carry-over in one transaction, each with its note; `train.splitFrom.pending`, `trains.md`): `partySteps` notes nothing of it while it is pending, and the write that settles it as if the train were new then. So its history starts at the split and holds nobody who never was on it (a member who left the group while the new post was made): its members sign up then (`joinedAt`, `hereAt` then for who is coming or here), its first stop is where it was split (reached at its start when split before it), and its record's `createdAt` is its first step, the split (the `Party` row's `createdAt` is when it was made, the time its post took before). A pending train that ends, or is taken back, is dropped (`drop`), as one that failed. A member who rode both counts in both.
- Tests: `partyServiceWith()` records into `MemoryHistory` (`history`: `records`, `steps`, `posts`, `optIn(guildRow, member)`, `failing`; it shares the memory storage's rows and deletes them as the repository does) through `recorder` (`flush()` runs the tries that wait; over the database its tries go to `kept.historyStorage`; `sweep()` reads the storage's rows, and those in `storage.unreadable` as unreadable; the scheduler's upkeep runs it; `historySweepProgressEvery` sets its progress lines); `history-recording.db.test.ts` pins the repository; a `PartyRepository` in a test that expects no failure takes `HISTORY_MUST_NOT_FAIL`.

## Reports at stops (migration 036, plan 8H-2)

Design `docs/superpowers/specs/2026-11-04-history-on-show-design.md`, Part A: every version of a field research or Team GO Rocket report (`stop-reports.md`) that ends is kept, from the cutover on, for the boards and a member's own stats of later parts. Nothing reads it yet but the tests (`StopReportStorage.historyOf`).

- **On the live row** (`StopReport`, fixed when the report is made): `cell`, the S2 cell of level 14 of its stop (`reportCell`, `REPORT_CELL_LEVEL`, `src/domain/stops/report-history.ts`, a token of `@pine/wayspot-core/s2`: about 600 m across, Q1; level 15 was turned down as a block or two); `regionIds`, the `Region.id`s whose outlines held the stop (JSON; `StopReportServiceOptions.guilds` and `.regions`: the server's row, then `regionsAtPoint` over the `RegionDirectory`, as `RocketService.channelsAt`, the notifier and the map find a stop's regions, one per channel; asked before the save, outside its transaction). `[]` and null are kept apart: `[]` is a stop in no region (or a server without a row), null is unknown (a lookup that failed, logged as `could not find the regions of a stop`, or a row of before 036), and a board by region must count neither as a region of its own; `confirmedBy`, the other members who met this very version with a report of their own (JSON, each once, never its reporter: `confirmedWith`). All three are null on a row of before 036. The row is swept within the day, so these ids live no longer than its `reporterId`.
- **`StopReportHistory`**: a row per version that ended: `reportId` and `reportMadeAt` (the live row's id and `madeAt`: a version, review L1; a grunt refined in place keeps its id, so its versions are two records), `serverId`, `kind`, `periodKey`, `subjectKey`, `detail` (the live row's JSON with every text in it through `withoutMembers`, `detailWithoutMembers`: any JSON is walked, so a row this version cannot read is kept too), `cell`, `regionIds`, `madeAt`, `endsAt`, `endedAt`, `reporterId` (only with the reporter's opt-in to that server's history, read when the record is written, else null), `confirmations` (how many members `confirmedBy` held, with a narrowing member counted once more where they were not there yet), `ending` (`varchar(20)`). No stop key, name, address, picture or point, and no reporter's name. No foreign key: the records outlive the server's row, as the party history does. Indexes: `(serverId, reporterId)` for the opt-out, `(serverId, endedAt)` for the boards, `(reportId, reportMadeAt)` for `restore` and `endedAs`. A cell is to be shown only in counts of the whole server, with the heatmap's minimum of three, never per member (the design's rule 1).
- **Endings** (`ReportEnding`), decided by the domain (`src/domain/stops/report-history.ts`, review H1), never by the repository:

  | Ending | When |
  |---|---|
  | `stood` | the sweep forgot it at its end; and any row whose `endsAt` had passed when another report took its row (review H3), `endedAt` its own `endsAt` (`endingOfRow`) |
  | `narrowed` | a reward replaced its "one of" (`decideResearch`'s `narrow`) |
  | `refined` | a grunt refined in place: the version before the refine, `endedAt` the refine's written `madeAt` (review H15) |
  | `corrected` | `correct` of the reporter's own report (review H2) |
  | `contradicted` | `correct` of a report the member ticked in "Replace field research?" (review H2) |
  | `churned` | Rocket's `report` over what stood (grunt over grunt, hideout over anything), and any other row still standing that a save takes (a grunt of yesterday past midnight, fix A2) |
  | `withdrawn` | taken back by its own reporter, whoever asked (`takeBackEnding`, review H8) |
  | `staff` | taken back by staff, somebody else's |
  | `unposted` | Pine's undo of a grunt posted nowhere (`RocketService`, `takeBack` as `unposted`), the grunt a hideout put back replaces (`restore`), a grunt `overtaken` while its messages went out where another report replaced it (`StopReportService.overtaken`: its record goes from `churned` to `unposted` by its version, `endedAs(id, madeAt, ending, from)`; review H4, 8H2-2; one taken back keeps `withdrawn` or `staff`, a version `refined` in place stays `refined`), and the version before the refine of a grunt posted nowhere and refined meanwhile (`StopReportService.refinedUnseen`, from `refined`, 8H2-1: nobody saw it) |
  | `unreadable` | a row this version cannot read (a kind it does not know, or a detail of another shape), of any kind, that a save took (`endingOfRow` with `readable` false, 8H2-5): it counts toward nothing. The sweep records such a row as it ended, `stood` |

  `researchFate` and `rocketFate` map a decision, with the standing report's reporter and the new one's, to `{ ending, confirms }`: `again` and `less` (research) and `already` (Rocket) by another member confirm the standing version (`keep`); `narrow` by another confirms the row it narrows (its record counts them). Nothing is written to the live row on a `keep` but `confirmedBy`: its `madeAt`, the version, stays. A refine's new version starts with none (`confirmedBy` null).
- **Where it is written** (`StopReportRepository`; its twin `MemoryStopReports` keeps `places`, `confirmedBy` and `records` beside the rows):
  - `saveUnless(report, decide, { standingAt, place, restoring })`: `decide` answers a `StandingVerdict` or a `StandingDecision` (`verdict`, `ending`, `confirms`); every row the save takes away is recorded in its transaction, behind the savepoint `stop_report_history`, at `savedAt` (the written `madeAt`, or `standingAt` where later: a hideout put back keeps its old `madeAt`). A record that fails is rolled back to the savepoint alone and logged (`could not record stop reports that ended; their records are lost`), and the report is saved all the same (review H11). Where the rollback to the savepoint fails too (the failure took the transaction with it; P1, as `PartyRepository` meets it), the failure itself is thrown: a deadlock runs the whole save again (`retryOnDeadlock`), any other failure runs the save once more without records, which are logged as lost (`could not record stop reports that ended; saved without their records`).
  - `restoring` (a hideout put back, review H4): that version's record is deleted in the save's transaction, not behind the savepoint (P3): where that fails the save fails, and `RocketService`'s `undo` takes the grunt back as `unposted` instead, so a hideout never counts twice. In `undoRefined` (a grunt posted nowhere and refined meanwhile) a failed restore takes nothing back: the refine's own turn takes its version back as `unposted`, and the version before it ends `unposted` (`refinedUnseen`, 8H2-1). The hideout's new row takes the record's `cell` and `regionIds` (P4; the stop's cell and unknown regions where no record is kept), and starts with no confirmations: who confirmed it before it was replaced are not carried over (restore is rare).
  - `remove(id, serverId, why, madeAt?)` (`Removal`: `by`, `as` (`TakeBackBy`: `member`, `staff`, `unposted`), `at`): the ending read from the locked row (`takeBackEnding`), behind the same savepoint, a failure met as `saveUnless` meets it. `StopReportService.takeBack(serverId, refs, by, as)` takes the place of the old `staff` flag: a `member` takes back their own only, `staff` and `unposted` any.
  - `removeEnded(before)` (the hourly sweep): in transactions of `SWEEP_BATCH` (500) rows at `read committed` (P6: no gap is locked), the ended rows taken in the order they ended (`endsAt`, then `id`, along `stopreport_ends_index`) and locked, the opt-ins of their reporters read under a shared lock, the records inserted, the rows deleted. No savepoint (review H10): a batch whose records fail is logged at error level (`could not record a batch of ended stop reports; trying them one by one`) and run again row by row, each row in a transaction of its own, so that a row whose record fails keeps only itself back for the next sweep (`could not record an ended stop report; it is kept for the next sweep`, P7). After `ONE_BY_ONE_FAILURES` (5) failures in a row the pass gives up: the rest of the batch is kept back unread and the sweep ends there, with one line a sweep (`gave up recording ended stop reports one by one; the rest are kept for the next sweep`, with how many it kept back; R2, 8H2-3), so a failure that hits every row costs a few lines an hour. A row whose record still fails `KEPT_UNRECORDED_MS` (a week) after its end is deleted without it (8H2-4), logged at error level with its id and kind and no member (`deleted an ended stop report without its record, which failed for a week`): its report is lost to the history, but no member's id stays in the live table for good. It reads in TypeScript rather than `insert … select`, since the detail goes through `withoutMembers`.
  - **The lock order, and the opt-out:** every record reads the opt-ins of its reporters from `HistoryOptIn` under a shared lock, after the `StopReport` rows it records are locked, as a party's record does; `HistoryRepository.optOut` deletes the member's opt-in row first, then takes their id out of the records. So an opt-out under way finishes first and the record finds no opt-in, or the opt-out waits for the record and then takes the id out of it; a record never keeps the id of a member who opted out. No test races the two (it would wait on real time): the order is this paragraph's. An opt-in is not retroactive: a report ended before it keeps no id; one standing when the member opts in is recorded with it, as a party under way is.
- Rehearsal mode writes the history to its database copy like everything else.

## Reach and want counts (migration 037, plan 8H-3)

Design `2026-11-04-history-on-show-design.md`, Part A's "Reach (Q3)" and "Want counts", for Part D's boards of things and Part E's "your reports reached 37 members". Nothing reads either yet but the tests.

- **Reach** is "sent to N members": DMs of the notifier's news put in line, not delivered (`notifications-and-dms.md`, "Reach": counted in `NotifyService.deliver`, handed to `ReachRecords`, `src/services/reach.ts`). Only news: a raid's report, its other boss or tier, its other gym or move, a max battle's report or other boss, a new train, field research, Team GO Rocket; never the times to meet at (they tell who is in already) and never a spawn (nothing of it is kept). Reach is news to members not in the party already (Matt, review 8H3-2): an attendee of any status on the party as its announcement sees it (a boss-set member told what their egg hatched into, a member signed up who also wants the boss) gets their DM and is not counted.
  - **A party:** each batch of a run of its news (99 members) that reached anyone writes a step `reach` (`subject` the event, `reported`, `boss`, `gym`; `value` the members it counted; `HistoryStorage.addReach`, one insert from the party's `Party` row, so a party recorded meanwhile writes nothing and is said at debug). Its record sums the `reach` steps of its lineage into `PartyHistory.reached` (`int unsigned`, default 0; `historyOfParty`, in the domain, never in SQL), so a raid that moved counts what its news reached before and after the move. A member counts once per party while the notifier remembers the party (a move shares that memory): after a restart a member told again of the same party counts again, so `reached` can count a member twice across a restart.
  - **A report at a stop:** `StopReport.reach` (`int unsigned`, default 0) is added to in place (`StopReportStorage.addReach(id, madeAt, n)`: `reach = reach + n` where the id and `madeAt` match, that version only; `madeAt` stays, so the version is the same; a version replaced or swept meanwhile takes nothing), and copied into `StopReportHistory.reach` with its record, as its confirmations are. Field research counts for the news' first report (`news.reports[0]`, review H16), each member once over the news' region channels (a report at several stops is one DM per region channel); Team GO Rocket for the version reported: a grunt refined in place starts its new version at 0 and counts its own news there, the version before it keeps what it had. A hideout put back (`restore`) starts at 0 as its confirmations do.
  - **0** means none, or not recorded: every record of before 8H-3, and every legacy record (the legacy bot counted nothing).
- **`WantCountDay`**: a row per server (snowflake), local day (`day`, `char(10)`, `yyyy-mm-dd` in `settings.timezone`) and thing wanted (`target`, `varchar(120)`), with how many members wanted it (`count`); primary key `(serverId, day, target)`, no member ever, no foreign key (the counts outlive the server's row, as the history does).
  - **The keys**, one domain path (`src/domain/notify/want-keys.ts`), of every kind of want Pine has: a Pokémon, a tier or IVs (`PokemonNotification`) by its want token (`pokemon:<dex>[:<form>]` with its scope after `@`, `pokemon:<dex>:[<form>]:shadow`, `tier:<level>[:shadow]`, `iv:perfect|zero`; a member's rows read as `/wants` reads them, `readWants`: legacy duplicates one want in every scope any of them has); a `TargetWant` by its token as it is (research, Dynamax and Gigantamax, Team GO Rocket); a gym target `gym:<id>`; new trains `trains`. Costumed is never part of a key; a row that cannot be read is no want. Beside these, each species is counted once more as `species:<dex>`: the members with any want of a Pokémon of that Pokédex number (a Pokémon want of any form, scope or shadow, a research encounter, Dynamax, Gigantamax; never Mega Energy, a tier or a Rocket target), each once, across `PokemonNotification` and `TargetWant` (`countWants`, `speciesKeyOf`; review P1). It is the source of the board of the most wanted: a sum of a species' keys would count a member who wants it in several ways once for each, and the counts keep no member to tell them apart.
  - **Who is counted:** the members the notifier could act on, by its rule of who wants (Matt, review 8H3-1): a `PokemonNotification`, `TargetWant` or `GymNotification` row counts for the snowflake of its `User` row, joined as the notifier's reads (`wanting`, `targeting`) join it, and a row whose `User` has none counts for nobody; new trains by the snowflake they hold. The counts still include members who left the server: Pine has no `GuildMembers` intent and cannot tell from the tables. So the boards read the counts as wants on file, not as active members.
  - **When** (`WantCountService`, `src/services/want-counts.ts`): a second after each local midnight (`everyLocalMidnight`, which tells the run the midnight it was set for), the wants as they stand then, under the day before that midnight; a timer that fires late, past another midnight (the machine asleep), counts the day before the midnight it waited for and the day before now, both with the wants as they stand when it fires, and a day further between is lost (review R1); and at start, under the day before, for every server that has no counts of that day (`dayBefore`; a bot down over midnight loses the hours it was down, not the day). A server's day is written once, in one transaction (all of its rows or none, review P2: a day written in part would count as counted): a second count of it skips the servers counted already, and its write is an upsert that changes nothing. Shutdown waits a second for a count under way (`want counts`, before the database closes). Each server that has wants; one without has no rows. A count that fails is logged at warn (`could not count the wants of a day; that day is lost`); the next midnight counts the next day, and a start the day before it, so a failed day is lost unless the bot starts again before the next midnight.
- Rehearsal mode writes both to its database copy like everything else.

## The opt-in

- `/settings history enabled:True|False` (`ctx.historyOptIns`, `HistoryRepository`), per server like new trains (Matt, 2026-10-16): the history of a server is that server's, and the opt-in is kept by the server's snowflake. On: the member's id is kept with what they do in that server's parties, and with their reports at stops (plan 8H-2), from then on. Off: it is taken out of every party of that server already kept (attendee, maker, conductor; counted from three lookups by index) and every record of their reports at stops there (by the index of server and reporter), in the same transaction; the rows stay and count without it, and the answer says from how many records (`the 3 records of raids, max battles, trains, meetups and reports at stops`). `/settings show` and `/admin member-settings` show it. The help says what is kept: every member's id while a party is going on or a report stands (as they need), only opted-in ids once it ended; that reports at stops are kept by area and region, never the stop.
- The opt-in rows hang on no `User` row, so they are written without `withMemberLocked`, as `NewTrainNotification` rows are: an opt-in and an opt-out of one member at once end as whichever committed last.
- The legacy history never has a member id: everyone starts from zero, and it serves counts only.

## The legacy import

- `npm run history:import -- <folder> [--server <id>]` or `./pine import-history <folder> [--server <id>]` (the folder mounted read-only into a one-off container of the bot's image after `migrate-cli`; the bot is not started): `importStep` in `src/ops/history-import.ts` (exit 0; 1 refused or failed, said why; 2 used wrongly) over `src/ops/legacy-parties.ts` (the folder, file by file) and `legacyRecord` / `legacyBossResolver` (`src/domain/history/legacy-party.ts`). The folder is checked before the game data is loaded; a database without the history tables is refused. It reads `complete/` (a file per gym, the list of the raids that ended there) before `active/` (a party each; imported as ended `cutover` when it has a maker, a creation time and an attendee): a party the legacy bot had written to both is the ended one. Two passes: the first learns the region channels the files name and, of a party stored twice, the copy deleted last (the one taken); the second writes batches of 1,000 records, one transaction each, keyed by `legacyKey`: running it again writes nothing twice, and a run stopped half-way is finished by the next. A batch the database refuses is written record by record, and what it still refuses is counted ("not written", exit 1) and left for a later run. It prints counts only: files (and why one could not be read: `not JSON`, `not a record`, `cannot be read (EACCES)`), parties read, imported, already there, twice in the files, not written, skipped per reason, without their region (and of those, put in the fallback server), at a gym no longer in the gym list, bosses kept by their name.
- Region by the party's region channel (`sourceChannelId`); server (a snowflake) by the region, else `--server` (which must be a known server), else the one server of all the regions the files named that are regions now; otherwise skipped (`no-server`). Gym by id where the gym list still has it, and only on a database taken over from the legacy bot (`knex_migrations` there): another database's ids are not the files'. Boss by number and form, else the name members search for, the legacy name, the number; else kept as given. No boss for an egg and for the legacy placeholders (`pokemon`, `egg`, `mega`, `elite`). A mention or a bare id (17 to 20 digits) in a name, a description or a label is written `@member` (an emoji's tag stays). A train's stops are its route up to its current stop once it started (past its start time at the import, or moved on); a skip cannot be told from a stop made.
- What the files hold, 2018 to 2026 (138 shapes of raid): the tier as a number (1 to 5; 6 a mega legendary; `????` and 7 are no tier) or only `backupTier`; mega, elite and EX by the raid's flags; `endTime` the text `unset`; numbers as text (a boss's number, a head count); attendees without a group, raids without a groups list; a group's meeting time as `startTime` or `start_time`; a raid stored twice (counted, the copy deleted last imported). Trains keep their route and current stop (`currentGym`, past the end when finished), no times.

## The questions as SQL

Each question as a query: `history-queries.db.test.ts` reads every block below by its name and checks its answer on a small history, so a change here is a change there. Run the setup first, in the same session: the server (by its snowflake, in the tables' collation, or MySQL refuses to compare it with the column) and its time zone (the stack's MySQL has the zone tables; another server may need `mysql_tzinfo_to_sql`). Times are turned into the server's local time from epoch milliseconds as `convert_tz('1970-01-01' + interval <ms> div 1000 second, '+00:00', @zone)`, which does not depend on the session's time zone.

```sql setup
set @guild = '<server id>' collate utf8mb4_0900_ai_ci, @zone = 'America/New_York'
```

The most active members (only those who opted in have an id): parties they were at, and raids they completed.

```sql most-active-members
select a.memberId, count(*) as parties, sum(h.kind = 'raid' and a.furthest = 'done') as completed
from PartyHistoryAttendee a
join PartyHistory h on h.id = a.historyId
where h.serverId = @guild and a.memberId is not null and a.furthest in ('here', 'done')
group by a.memberId
order by parties desc, a.memberId
limit 20
```

Raids per gym (the name is the gym list's, HTML-encoded as the legacy bot stores it; a gym deleted since has none).

```sql raids-per-gym
select h.gymId, g.name, count(*) as raids
from PartyHistory h
left join Gym g on g.id = h.gymId
where h.serverId = @guild and h.kind = 'raid' and h.gymId is not null
group by h.gymId, g.name
order by raids desc, h.gymId
limit 20
```

Raids per region (by its channel: the region's name is its channel's on Discord).

```sql raids-per-region
select h.regionId, r.channelId, count(*) as raids
from PartyHistory h
left join Region r on r.id = h.regionId
where h.serverId = @guild and h.kind = 'raid' and h.regionId is not null
group by h.regionId, r.channelId
order by raids desc, h.regionId
```

Raids per boss (the catalogue's key, or the name a boss the catalogue does not know was given).

```sql raids-per-boss
select coalesce(h.bossKey, h.bossName) as boss, count(*) as raids
from PartyHistory h
where h.serverId = @guild and h.kind = 'raid' and coalesce(h.bossKey, h.bossName) is not null
group by boss
order by raids desc, boss
```

Raids per tier.

```sql raids-per-tier
select h.tier, count(*) as raids
from PartyHistory h
where h.serverId = @guild and h.kind = 'raid' and h.tier is not null
group by h.tier
order by raids desc, h.tier
```

Which bosses drew the largest groups: who came (here or done) with their +1s, on average and at most.

```sql largest-groups
select coalesce(h.bossKey, h.bossName) as boss, count(*) as raids,
       round(avg(h.hereHeads + h.doneHeads), 1) as averageCame,
       max(h.hereHeads + h.doneHeads) as mostCame
from PartyHistory h
where h.serverId = @guild and h.kind = 'raid' and coalesce(h.bossKey, h.bossName) is not null
group by boss
order by averageCame desc, boss
```

Raids by hour of the day, local time: of the hatch, or of the report where there is no hatch time.

```sql raids-by-hour
select hour(t.local) as hour, count(*) as raids
from (select convert_tz('1970-01-01' + interval coalesce(h.hatchTime, h.createdAt) div 1000 second,
                        '+00:00', @zone) as local
      from PartyHistory h
      where h.serverId = @guild and h.kind = 'raid') t
group by hour
order by hour
```

Raids by day of the week.

```sql raids-by-weekday
select dayname(min(t.local)) as weekday, count(*) as raids
from (select convert_tz('1970-01-01' + interval coalesce(h.hatchTime, h.createdAt) div 1000 second,
                        '+00:00', @zone) as local
      from PartyHistory h
      where h.serverId = @guild and h.kind = 'raid') t
group by weekday(t.local)
order by weekday(t.local)
```

Raids by month.

```sql raids-by-month
select date_format(t.local, '%Y-%m') as month, count(*) as raids
from (select convert_tz('1970-01-01' + interval h.createdAt div 1000 second, '+00:00', @zone)
               as local
      from PartyHistory h
      where h.serverId = @guild and h.kind = 'raid') t
group by month
order by month
```

Raids by season (meteorological: winter is December to February).

```sql raids-by-season
select case when month(t.local) in (12, 1, 2) then 'winter'
            when month(t.local) in (3, 4, 5) then 'spring'
            when month(t.local) in (6, 7, 8) then 'summer'
            else 'autumn' end as season,
       count(*) as raids
from (select convert_tz('1970-01-01' + interval h.createdAt div 1000 second, '+00:00', @zone)
               as local
      from PartyHistory h
      where h.serverId = @guild and h.kind = 'raid') t
group by season
order by field(season, 'winter', 'spring', 'summer', 'autumn')
```

How fast groups filled: minutes from the report until the third member said they were coming (live raids only: the legacy history has no times). Change `nth = 3` for another count.

```sql how-fast-groups-filled
select count(*) as raids, round(avg(t.minutes), 1) as averageMinutes
from (select (a.joinedAt - h.createdAt) / 60000 as minutes,
             row_number() over (partition by h.id order by a.joinedAt, a.seq) as nth
      from PartyHistory h
      join PartyHistoryAttendee a on a.historyId = h.id
      where h.serverId = @guild and h.kind = 'raid' and a.joinedAt is not null) t
where t.nth = 3
```

Who was interested or said they were coming but never came, in raids that took place.

```sql signed-up-never-came
select a.furthest, count(*) as members
from PartyHistoryAttendee a
join PartyHistory h on h.id = a.historyId
where h.serverId = @guild and h.kind = 'raid' and h.ending = 'completed'
  and a.furthest in ('interested', 'joined')
group by a.furthest
order by field(a.furthest, 'interested', 'joined')
```

Trains by length: stops on the route, stops made (at Power Spots too, plan 8X-4), the gyms among them, and minutes from the first arrival to the last departure.

```sql trains-by-length
select h.name, h.routeStops, count(s.seq) as stopsMade, count(distinct s.gymId) as gyms,
       round((max(s.leftAt) - min(s.arrivedAt)) / 60000) as minutes
from PartyHistory h
left join PartyHistoryStop s on s.historyId = h.id
where h.serverId = @guild and h.kind = 'train'
group by h.id, h.name, h.routeStops
order by stopsMade desc, h.id
```

The busiest gyms, for hot spots on the map: raids there and train stops made there, with where the gym is (a train's stop at a Power Spot is at no gym, and left out).

```sql busiest-gyms
select g.id as gymId, g.name, g.lat, g.lon, count(*) as visits
from (select h.gymId from PartyHistory h
      where h.serverId = @guild and h.kind = 'raid' and h.gymId is not null
      union all
      select s.gymId from PartyHistoryStop s
      join PartyHistory h on h.id = s.historyId
      where h.serverId = @guild and s.gymId is not null) v
join Gym g on g.id = v.gymId
group by g.id, g.name, g.lat, g.lon
order by visits desc, g.id
limit 50
```
