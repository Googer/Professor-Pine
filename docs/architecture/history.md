# The party history

Every party that ends is kept in relational tables beside the live `Party` table (plan 8H; spec `2026-10-16-cutover-docker-history-design.md`, 4.3): what it was, where and when, how it ended and how many took part, in a form that plain SQL counts and groups. The legacy bot's parties are imported once from its files. Members are named only with their opt-in. Read before changing the history, its recording, the opt-in or the import, or before writing a statistic over it.

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

## The opt-in

- `/settings history enabled:True|False` (`ctx.historyOptIns`, `HistoryRepository`), per server like new trains (Matt, 2026-10-16): the history of a server is that server's, and the opt-in is kept by the server's snowflake. On: the member's id is kept with what they do in that server's parties from then on. Off: it is taken out of every party of that server already kept (attendee, maker, conductor; counted from three lookups by index), the rows stay and count without it, and the answer says from how many. `/settings show` and `/admin member-settings` show it. The help says what is kept: every member's id while a party is going on (as the party itself needs), only opted-in ids once it ended.
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
