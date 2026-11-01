# Reports at stops (field research and Team GO Rocket): design

Matt and Claude, 2026-10-21 (brainstorm in chat). Status: **approved by Matt (2026-10-21)** after a fresh review (§9). Gantt phase 17; plans 8R-1 to 8R-3.

## 1. How they are played (what Matt said)

**Field research.**
- A PokéStop's task is the same for every player for the day; the reward is the same all day too, for every player at that stop: a task Leek Duck lists with several rewards ("Catch 7 Pokémon": Magikarp, Stufful or Wimpod) is in the game several tasks of that text, each with one reward (corrected 2026-10-23, Matt; it was thought to be drawn per player: plan 8R-5, `2026-10-23-research-rewards-apart-design.md`).
- Members report only the good tasks, but often several stops at once: "2 Excellents for Dratini @ Yellow Mural, Paititi Inti, and Little's". During the week-long events one or two tasks are what everybody wants, and wanting them ("ping me for whichever stops have it today") would be popular.
- Today members scroll back through the day's messages to find what was reported.
- **Intra-day events** (every Community Day, for example) have research of their own. For their few hours the event's tasks replace the day's. When the event ends, the day's research comes back for the rest of the day, **with the same task at each stop as before the event**.
- **A multi-day event** with research of its own rotates the tasks when it starts, and again when it ends: what was reported before is gone for good.
- Wrong reports are rare.

**Team GO Rocket.**
- **Grunts** are short-lived (about 30 minutes) and seen by everybody, like a wild spawn. A new grunt at the same stop replaces the old one, even of another type. Turnover is fast during Rocket Takeover events.
- Members chase **a grunt type** for a Pokémon in its pool (the Dragon grunt for shadow Dratini).
- **Leaders** (Cliff, Arlo, Sierra) show only to a member holding a Rocket Radar. When they do, they are at the same stops for everybody and stay all day.
- A radar holder wants either any leader at all (the in-game map shows only the near ones), or **a particular leader**: for the shadow they give (Matt: in a two-to-three-month rotation he cares about one of the three and has no time to check every leader on the map), or for research that needs that leader.
- **Giovanni** is the same, with the Super Rocket Radar. Many stops the in-game map shows as Giovanni are **decoys**, so a report of a stop that really is Giovanni is very helpful.
- Some members **want the decoys** (the decoy grunt's shadow Bellsprout, for a shadow Victreebel in GBL). Decoy stops last all day and are the same for everybody, like Giovanni's.
- A stop with a leader, Giovanni or a decoy has **no ordinary grunts** for the whole day.

The legacy bot has nothing of either: no research, no Rocket.

## 2. Decisions (Matt, 2026-10-21)

1. **One foundation, two features.** A *stop report* is a stop, what is there and until when. Research and Rocket are kinds of it. They share the stop search, the storage, the region's pinned post, the wants and the map.
2. **Research is reported by task**, at up to five stops in one report. **The latest report at a stop replaces the earlier one.**
3. **Research reports post no message of their own.** Each region channel has one pinned **"Today at the stops"** post, edited as reports come and go. DMs to members who want a reward are the only notification.
4. **Research wants go through `/want`**, with a new box **Research** in its dialog (§7). The target is a reward: a Pokémon, an item or Mega Energy. **One DM per report**, naming all its stops.
5. **The task list comes from Leek Duck's research page**, which Pine reads itself. ScrapedDuck's `research.json` keeps only encounter rewards; Leek Duck's page also has items (Rare Candy, Stardust, Golden Razz) and Mega Energy, 299 rewards on 2026-10-21.
6. **Grunts work like `/wild`**: a message in the region channel, deleted after 30 minutes.
7. **Leaders, Giovanni and decoys** go in the pinned post's Rocket section until the day ends.
8. **Rocket wants.** A **shadow** want of a Pokémon (the **Shadow** box of `/want`'s dialog, §7) covers shadow raids **and** Rocket catches. Other Rocket wants have targets of their own. Together they are:
   - a shadow Pokémon, which fires for any reported grunt, leader, Giovanni or decoy whose catchable slot can be it;
   - a grunt type;
   - a named leader, any leader, or Giovanni.

   They fire for every report in the regions the member can see, wherever the member is.
9. **Stops** are the Wayfarer import's. Sponsored stops are missing from Wayfarer, so staff add those by hand.

## 3. Stops

- Reports are made at **stops**: kept Wayspots of kind `stop` (`WayspotDirectory`, `PlaceFinder`'s stop index).
- **Stops of Pine's own** (sponsored ones), default:
  - Staff manage them with `/pokestop add name: at:<coordinates or maps link> [address:]`, `/pokestop edit` and `/pokestop remove` (not `/stop`: trains have stops and DMs have Stop buttons), shaped like `/gym add`.
  - They live in a table of their own, per server (not in `Wayspot`, which belongs to the import and is shared by all servers). An import never touches them.
  - `PlaceFinder` merges them into the stop index, so every stop search finds them. A choice's value is `stop:pine-<id>`.
  - Within 30 m of an imported stop, `/pokestop add` asks "Add anyway?", as `/gym add` asks near a gym.
- A stop counts as in the regions whose outlines hold it. A report shows in each of them (default; overlaps are rare).
- A report keeps a **snapshot** of the stop (name, address, picture, point), as a spawn report keeps its place. A report still shows if the stop is renamed or gone later the same day.

## 4. Field research

### 4.1 The task list

- **Where it comes from:** `settings.research` (`url`, default `https://leekduck.com/research/`; `refreshHours`, default 1; `staleAfterHours`). Each refresh downloads the page and parses it.
- **What a task is:** its text ("Make 2 Excellent Throws"), its category (Leek Duck's headings: Catching, Throwing, Battling, Exploring, Training, Buddy & Friendship, Team GO Rocket, Sponsored), and its rewards. Each reward is an **encounter** (named by the catalogue, with shiny and CP range), an **item** with its quantity, or a **resource** (Mega Energy of a species, with its quantity).
- **Testing:** the parser is tested on a saved copy of the page (a fixture), and on the page's changes when a refresh finds fewer than half the usual tasks (logged as a warning; the last good list is kept).
- **Survives a restart:** the last good list is kept in the database, like the raid bosses, so a start without the network still offers it.
- **A task missing from the list** (the list lags at a rotation) can be typed in full. A free-text task takes an optional `reward:` (a Pokémon or an item from the list's known items), and only a typed reward makes wants fire.
- **Open, for the plan's prototype:** whether Leek Duck's `/research` page shows an event's own tasks while the event runs, or only on the event's page. Watch a live research event: Into the Wild starts 2026-11-09 10:00, Pawniard Community Day is 2026-11-21 14:00–17:00. If the page does not show them, the prototype reads the event's page, linked from ScrapedDuck's `events.json`.

### 4.2 Research periods

Pine already reads ScrapedDuck's `events.min.json` (`settings.raidEvents`). Each event says `extraData.generic.hasFieldResearchTasks`, with a start and end in local time. Of the events with research:

- An **intra-day event** starts and ends on the same local day.
- A **multi-day event** is any other.

A report belongs to the **period** that was on when it was made:

- **The day** (no research event on): reports end at local midnight.
- **An intra-day event's window:** reports end when the event ends. While the window is on, the pinned post shows the event's reports, and the day's reports wait under a line "The day's research comes back at 17:00 (6 stops)". When the event ends, the day's reports **come back unchanged**.
- **A multi-day event's start or end is a rotation.** Every research report made before it ends at that moment. The post starts empty for the new tasks.
- **Inside a multi-day event the tasks still roll over at local midnight** (Matt, 2026-10-22, for Into the Wild, 2026-11-09 10:00 to 11-13 20:00): the day's research until 10:00 on the first day, the event's tasks from 10:00, new ones each midnight, and the day's research, new, after 20:00 on the last day. Each day of the event is a period of its own.

The task list offered in `/research` is the list of the period that is on.

### 4.3 `/research`

`/research task: stop: [stop2:] [stop3:] [stop4:] [stop5:] [reward:]`

- **`task`:** autocomplete of the period's tasks, matched on the task's text and its rewards' names ("dratini" finds "Make 2 Excellent Throws · Dratini"). Each choice gives the rewards in short.
- **`stop`…`stop5`:** stop autocomplete (the member's region first), maps links and coordinates resolving to the nearest stop within 50 m, as `/wild near:` does.
- **The answer** (private) lists the stops reported, notes any **replaced** report ("was: Catch 7 Pokémon"), and has:
  - **"Same task at more stops…"**: a menu of the 25 nearest stops within 2 km of the first one that have no report of this task;
  - **"Take back"**: removes this report.
- **Replacing:** a stop has one research report per period. The latest replaces the earlier one, whoever made it.
- **Taking back:** `/research remove stop:` takes back a report. A member can take back their own; staff can take back any.
- **Limits:** a throttle like `/wild`'s (default 10 reports per 30 minutes; one report with five stops counts as one), guards as `/wild`'s.

## 5. Team GO Rocket

### 5.1 The lineups

ScrapedDuck's `rocketLineups.json` (`settings.rocket`: `url`, `refreshHours`, default 6) gives 26 lineups on 2026-10-21:
- Giovanni;
- Cliff, Arlo and Sierra;
- 18 typed grunts and the untyped male and female grunts;
- the decoy female grunt.

Each lineup has three slots of Pokémon, and the catchable one is marked (`isEncounter`). A grunt type with two lineups (a male and a female water grunt) is **one choice** whose pool is the union of the two. The last good list is kept in the database, as the task list is.

### 5.2 `/rocket`

`/rocket who: stop:`

- **`who`:** the grunt types ("Dragon-type grunt", "Grunt (no type)"), "Decoy grunt", Cliff, Arlo, Sierra and Giovanni, each choice with its catchable Pokémon in short.
- **Giovanni:** the help text says to report him only once the stop is seen to be really him, and to report a decoy as "Decoy grunt".
- **One Rocket report per stop.** A hideout (a leader, Giovanni or a decoy) keeps grunts away from its stop for the whole day (Matt), so a stop has either grunts or a hideout that day.
  - A grunt report replaces the stop's earlier grunt report.
  - A hideout report replaces whatever Rocket report the stop has.
  - **A grunt report at a stop with a hideout report today** asks first: "Arlo was reported here today, and a hideout keeps grunts away all day. Replace Arlo's report with the grunt?" On "Replace", the hideout report ends. On "Cancel", nothing is reported. A wrong grunt report should not quietly wipe out a whole day's hideout.
- **Grunt reports:**
  - A grunt report is a message in the region channel (components-v2, like the spawn report): the grunt type, its possible catches with pictures, the stop with its address line, and the reporter.
  - It is deleted after 30 minutes (`settings.rocket.gruntMinutes`), with rows and a sweep like `SpawnReport`'s.
  - A newer report at the same stop deletes the older message at once.
- **Hideout reports** post no message. They go in the pinned post's Rocket section until local midnight.
- **Taking back:** `/rocket remove stop:`, and **"Take back"** on the answer, with the same rules as research.
- **Limits:** the same throttle as `/research`.

## 6. The pinned post, "Today at the stops"

- **When it exists:** one per region channel and day. It is made at the first report of the day in that region (research or hideout). Pine pins it and deletes Discord's "pinned a message" notice where it may. At midnight it is unpinned and deleted, and a sweep at start catches one left from a day that has ended.
- **Contents:** one components-v2 container.
  - **Research**, grouped by task: the task's text, its rewards with pictures ("one of: Magikarp, Stufful, Wimpod"), then each stop with its address line and its reporter (`memberByName`). During an intra-day event the event's tasks are shown first, with the waiting line of 4.2.
  - **Rocket hideouts:** Giovanni, Cliff, Arlo, Sierra, Decoy grunt, each with its stops.
- **Keeping it current:** edits are coalesced (one edit at most every few seconds per post). A day too full for one message (Discord's limits on text and components) spills into a second message, pinned the same way.
- **Pin permission:** without the permission to pin, the post is still sent unpinned and logged. `cutover-check` checks the pin permission in every region channel.
- **Rehearsal mode:** nothing is posted outside party posts, so no pinned post and no grunt messages. Reports are still kept and DMs go only to the allowlist, as spawn reports do.

## 7. Wants

- **`/want` takes only what is wanted, and a dialog asks what for** (Matt, 2026-10-21). The option `type` goes away.
  - `/want target:` is a Pokémon, a form, a raid tier, perfect or zero IVs, an item, Mega Energy, a grunt type, Cliff, Arlo, Sierra, any leader, or Giovanni (autocomplete; typed text acts only when it is clear, as `readWantText` today).
  - **A Pokémon or a form** opens a dialog, "Dratini: what for?", with one checkbox group:
    - **Raids**;
    - **Dynamax** (max battles, 1 to 5 stars);
    - **Gigantamax**;
    - **Spawns**;
    - **Research** (an encounter reward);
    - **Shadow** (its description: "Shadow raids and Team GO Rocket catches").
  - **Pre-ticked** with what the member wants of that target already, so the same dialog adds and changes a want. Submitting with nothing ticked removes it. `/unwant` stays as the quick way out.
  - **Only boxes that can happen are shown:**
    - Spawns only where `appearsInWild` allows it;
    - Shadow where the game master says the Pokémon can be a shadow, **or** it is in today's Rocket lineups, **or** it is a current shadow raid boss (new shadows of a Takeover are listed before the game master may have them);
    - Dynamax where the game master says the Pokémon can Dynamax (`catalogue.canDynamax`) or it is on the max boss list; Gigantamax likewise (`canGigantamax`, or listed at G);
    - a mega: Raids only.
  - **A raid tier** opens a dialog with **Raids** and **Shadow raids**.
  - **No dialog** where only one answer is possible:
    - grunt types, leaders and Giovanni (Rocket: their catches are shadows);
    - items and Mega Energy (research);
    - perfect or zero IVs (spawns);
    - a Pokémon with only one box to show.
  - **A species and one of its forms are separate targets**, each with its own ticks, as today: a member wanting Alolan Vulpix may not care about Kanto Vulpix.
  - **The dialog opens within Discord's three seconds** after reading the member's wants of that target (the slow-read rule, `readInTime`). A slow read answers "Try again". Staging measures it, and the plan checks the indexes on the member's wants.
  - **`/wants`** lists each target once with its ticks ("Dratini: Raids, Research, Shadow").
- **Shadow** is today's shadow want (`pokemon:<dex>[:<form>]:shadow`), widened to cover shadow raids **and** Rocket catches. One box, not two: shadow raids are mostly legendaries that no grunt has, so a member rarely wants one without the other, and grunt DMs are limited per hour (§9). Legacy Pine has no shadow wants, so no production member's DMs change.
- **Targets of a report**:
  - Research: a **Pokémon** with Research ticked, an **item** ("Rare Candy", "Stardust", "Golden Razz Berry"; the quantity is ignored), or **Mega Energy** of a species.
  - Rocket: a **Pokémon** with Shadow ticked, a **grunt type**, **Cliff**, **Arlo**, **Sierra**, **any leader**, or **Giovanni**.
- **Matching.** A research report fires for a want whose target is among its task's possible rewards. A Rocket report fires for a want of its grunt type or leader, or of a Pokémon in its catchable slot.
- **The DM.** One DM per report: the task or Rocket report, the stops with their address lines, "one of N possible" where the reward is drawn, and a link to the pinned post or the grunt message.
  - It expires when the report ends.
  - It goes only to members who can view the region channel, never to the reporter, and only under `settings.features.notifications`.
  - It has the usual **Stop** buttons.
- **Repeated reports.** A member is not DMed twice for the same task at the same stop in one period, or the same Rocket report at the same stop. A report that replaces another with something different is a new report.
- **Priority:** grunts send at the spawn priority (they are short-lived), at most one an hour per member and grunt type (§9, Matt's answers 3); research and hideouts at the normal one.

## 8. The live map (plan 8R-3)

- **What members see:** logged-in members (`settings.web.memberRole`) see today's reports drawn at their stops: research with the reward's picture, hideouts with the leader's, and grunts for their 30 minutes.
- **The popup** gives the report's lines and the reporter.
- **Reporting from the map:** a stop's popup and a right-click on a stop offer "Report research here" and "Report Rocket here", through the same service and throttle as the commands.
- **Filters:** a filter shows only the reports matching a reward or leader.

## 9. Decided after the review (for the planner)

A fresh review of this draft (2026-10-21) raised these. They do not change what members see; the plans build them as stated.

1. **Wants storage.**
   - A new additive table `TargetWant`: server, member, target kind and key, for the Research, Dynamax and Gigantamax boxes and the Rocket targets that are not Pokémon.
   - **Shadow wants stay in `PokemonNotification`** (its `shadow` want, scope `raid`). Its meaning widens to shadow raids and Rocket catches; the notifier's Rocket matching reads it. Its scope rules (`planSetWant` replaces a scope; `widerScope` knows only `raid` + `spawn`) and the legacy `!wants` stay untouched.
   - Target tokens in `TargetWant`: `research:pokemon:<dex>[:<form>]`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `grunt:<type>`, `leader:<cliff|arlo|sierra|any>`, `giovanni`.
   - **The dialog's boxes map onto these rows.**
     - Raids and Spawns are the `PokemonNotification` row's scope (`raid`, `spawn`, `both`); from now on `raid` means raids only.
     - Shadow is its shadow row.
     - Research, Dynamax and Gigantamax are `TargetWant` rows.

     A submit writes them in one transaction, under `withMemberLocked`. No data migrates: the dialog only shows the rows a member has as ticks.
   - `/wants`, `/unwant`, `/unwant-all`, the DM Stop buttons (`stopArgs`, custom ids ≤ 100 characters) and a `MemoryTargetWants` twin cover them.
2. **Research periods are stored, not recomputed.**
   - **On each report:** its `periodKey` (`day:<date>` or `event:<eventID>`) and its `endsAt` are stored when it is made.
   - **The events feed:** the research events seen in it (id, start, end, `hasFieldResearchTasks`) are kept in a table. A restart, or an event dropped from the feed once it ends, cannot lose a period.
   - **What the post shows** follows from the stored periods.
   - **An intra-day event inside a multi-day one:** when it ends, the multi-day period's reports come back.
   - **An event added to the feed after reports were made** takes effect from when Pine reads it.
   - **The feed's fields:** `parseRaidEventFeed` does not keep `extraData` today, so it is extended. If `events.min.json` lacks `extraData`, `events.json` is read.
3. **A report belongs to one server.** Reports are keyed (server, stop, kind, period), with a unique constraint. A stop inside regions of two servers is reported separately in each.
4. **The question before a grunt replaces a hideout** is a dialog (`src/discord/dialog.ts`, the slow-read rule). The map has its own confirm.
5. **The pinned post:**
   - **One queue per region channel** for making, editing, spilling and deleting it, the midnight delete included.
   - **Storage:** its message ids are kept in a table (channel, day, ids).
   - **At start:** every post of the day is drawn again, and posts of past days are deleted.
6. **Pin permission.**
   - The permission is Discord's own **Pin Messages** (`PinMessages`), added as optional to `REGION_CHANNEL_NEEDS` (`src/ops/permissions.ts`), so `cutover-check` reports it.
   - A channel at Discord's pin limit gets the post unpinned, and that is logged.
   - Where the bot may not embed, the post is plain text, as `spawnTextMessage`.
7. **Components-v2 limits** (40 components, 4,000 characters a message):
   - research first, then hideouts;
   - at most 3 messages, then "…and N more tasks";
   - text cut before escaping (`cutMarkdown`);
   - a DM links to the message that holds its task.
8. **Task keys.**
   - A task's key is a hash of its normalised text, used as the choice's value.
   - A key no longer on the list at submit answers "The task list just changed: pick the task again."
   - A typed text that matches no task's normalised text is free text, capped at 100 characters and shown through `plainNoLinks`.
   - `reward:` takes a Pokémon, an item or Mega Energy.
9. **`/want`'s autocomplete** lists every kind of target (25 choices). The current lineups' catches and today's rewards come first. `readWantText` reads typed items, energies, grunt types and leaders.
10. **Stops of Pine's own** bump the stop index's and the map's generation on every change. They become places for `/wild near:`, `/meetup` (with meetup safety's checks) and pin names. The Wayfarer import's preview names Pine stops within 30 m of imported stops, for staff to remove.
11. **Midnight** is in `settings.timezone`, computed with Luxon (DST days included): one timer per day plus the sweep at start.
12. **Throttles:**
    - `/research` and `/rocket` have separate windows with the same numbers.
    - "Same task at more stops…" counts against `/research`'s window (`carriesOn`).
    - The map's reports share the command's window.
13. **DMs:**
    - More stops added to a task later send a second DM, naming only the new stops.
    - A replaced report does not come back when its replacement is taken back.
14. **Rehearsal mode:** DMs leave out the link to a post that does not exist. Grunt rows are still swept.
15. **Leek Duck's page** is read with a byte cap (as `readLimitedJson`) and Pine's User-Agent. `staleAfterHours` defaults to 6.
16. **The map's layer** has a source of its own that follows reports as they come and go, not `GeoCache`'s generation.

### Matt's answers to the review (2026-10-21)

1. **Rocket wants of a species: the box is Shadow, not Rocket.** A shadow want covers shadow raids and Rocket catches (§7), which interests both the GBL player who wants the shadow and the member who wants any Dratini (a high-IV shadow can be purified into a hundo). Legacy Pine has no shadow support, so the widened meaning changes nobody's DMs.
2. **`/want` asks what for in a dialog of checkboxes** in place of the option `type` (§7; Matt's idea after the review). Pre-ticked boxes on Android and iPhone are a staging step: a new want's boxes should work as expected, but the ticks of an existing want may not show right on one of the phones.
3. **Grunt DMs.** A member gets at most **one DM an hour per grunt type**, kept in memory, as max battles' quiet hour (`MAX_WANT_QUIET_MS`). The DM's small print says so.
4. **The same grunt reported twice.** While a grunt report's message stands (30 minutes), a report of the same type at the same stop is answered "Already reported" with a link, and nothing is posted or sent. After that it is a new report. (A grunt of another type still replaces it, per 5.2.)
5. **Typed tasks** need no moderator check: they are capped at 100 characters, shown through `plainNoLinks`, and staff remove them with `/research remove`.
6. **Events with daily hours over several days** (GO Tour, GO Fest Global: e.g. 10:00–18:00 on two days, one start and one end in the feed). Each day of such an event is an **intra-day event** for its hours: the event's tasks during them, the day's research before and after (Matt's recollection of the game). Pine treats the big events (`BIG_EVENT_TYPES`) this way. Any other research event spanning days (Into the Wild, 10:00 on the first day to 20:00 on the last) is a multi-day event: a rotation at its start and end, and a new period at each midnight in between (Matt, 2026-10-22; 4.2).
7. **`/research` and `/rocket` are offered on every server.** Where no stops are known, they answer "No PokéStops are known here yet; staff can `/gym import` or `/pokestop add`."
8. **The staff command** is `/pokestop`.
9. **Raids, Dynamax and Gigantamax are three boxes** (Matt, 2026-10-21), each shown only where the game has it for that Pokémon.
   - **This changes 8X's rule** (max battles design, decision 6): a species want no longer covers that species' max battles by itself. `maxWantsFiring` reads the Dynamax and Gigantamax boxes instead.
   - **What existing wants mean now:** a raid want means raids only, in production as on the dev database. Legacy Pine has no max battles, so no production member loses a DM.
   - **Dev wants:** the dev database's wants made since 8X-3 cover max battles today and do not after this change. Accepted (test data only).
   - **Where it is built:** in 8R-1, with the dialog.

## 10. Not in this design

- No party history for these reports: they are not parties.
- No anonymous reports. No AR-mapping or special research.
- No per-member location and no "near me". Wants are per server, scoped by the regions the member can see, as today.
- Showcases, Routes and balloons (personal) are out of scope.

## 11. Plans

- **8R-1, stops and research:**
  - stops of Pine's own (`/pokestop`);
  - the stop report storage and service;
  - the task list from Leek Duck and the research periods;
  - `/research`;
  - the pinned post;
  - `/want`'s dialog of checkboxes (in place of `type`), research wants and DMs.
- **8R-2, Rocket:**
  - the lineups;
  - `/rocket`;
  - grunt messages;
  - the pinned post's Rocket section;
  - Rocket wants.
- **8R-3, the map:** the layer, the popups, reporting from the map.

Each is prototyped, reviewed and written as a plan by the usual method. Migrations take the next free numbers at merge time (first merge wins).
