# Max battles: design

Matt and Claude, 2026-10-20 (brainstorm in chat; preliminary plan `docs/superpowers/plans/2026-10-17-max-battles-preliminary.md`). Status: **draft, for a fresh review and then Matt's approval.** Gantt phase 15; plans 8X-1 to 8X-6.

## 1. How max battles are played (what Matt said)

- **Dynamax** (1 to 5 stars): members see one on the in-game map and do it with minimal planning. Today Matt's fallback when nobody comes is spamming remote invites. What he wants from Pine: report it (as a raid is reported) and ping a couple of likely people in the post. A Dynamax battle is up "all day": it appears early in the morning and stays until about midnight, but max battles can only be fought from 06:00 to 21:00 local, so a post may end at 21:00.
- **Events** (from ScrapedDuck's `events.json`): on a **Max Monday** (06:00–21:00, e.g. "Dynamax Sneasel during Max Monday") the featured boss is on almost every Power Spot for an hour at a time, and certainly on every active one from 18:00 to 19:00. A **Max Battle Day** (e.g. "Dynamax Uxie, Mesprit, and Azelf Max Battle Day", Saturday 2026-10-24 14:00–17:00) probably works the same for its three hours, rotating about every 30 minutes.
- **Gigantamax**: only on the days of Gigantamax events, effectively only at large official meetups (up to a couple of hundred people). Battles rotate about every 30 minutes, so a fixed place is hard to plan ahead but easy to change on the fly: these are best run as **trains**. Gigantamax loses design conflicts to Dynamax (as EX raids lose to everything, memory `ex-raids-low-priority`).
- **The boss is always known**: there is no egg; a report names its boss.
- **Trains mix**: a max battle get-together does a convenient raid on the way, so a route may hold gyms and Power Spots. On a Dynamax train lobbies of 4 form on the spot, never as fixed groups.

## 2. Decisions (Matt, 2026-10-20)

1. **Bosses**: Pokebattler's `GET https://fight.pokebattler.com/raids` (one JSON file, about 690 KB, the documented, unofficial API of the new site: "cache aggressively") gives the max tiers `RAID_LEVEL_1_MAX` … `RAID_LEVEL_5_MAX` (Dynamax) and `RAID_LEVEL_6_MAX` (Gigantamax) with each boss, `upcoming` and `startDate`; the `_FUTURE` and `_LEGACY` twins are ignored. During a Max Monday or a Max Battle Day (ScrapedDuck's events, already read for Raid Hours) the featured boss is listed first. Any Pokémon the game master says can Dynamax (or Gigantamax, `BREAD_DOUGH_MODE`) is accepted as typed, so a boss missing from the feed can still be reported. Staff overrides work as for raids. Pokebattler is **not** a second source of raid bosses (on 2026-10-20 it listed 8 regular T1 bosses against ScrapedDuck's 4, and Mega Charizard X and Y beside Mega Dragonite: it seems to keep bosses without an end date); a fallback for raids is a follow-up, not this work.
2. **A lobby cap per kind of battle, a setting**: raids 20, Dynamax 4, Gigantamax 100.
3. **Join fills groups** (max battles and Gigantamax trains only, Q6): a member and their +1s go into a group with room for them all; a new group opens when none has room; never more than five groups (A–E). Once all five are at their cap, Join puts them in the group with the most room left, over its cap ("5/4"), as when a member picks a fuller group themself. **No group menu and no sixth group** (Matt: "drop it once we're full on groups").
4. **A group ping**: `/shout` can ping only one's own group; mainly for the large Gigantamax groups.
5. **Trains**: a train has a kind (raid, Dynamax, Gigantamax) that sets its lobby cap: a raid train 20, a Gigantamax train 100, a Dynamax train none (lobbies form on the spot).
6. **Wants**: a species want also covers that species' Dynamax and Gigantamax battles. **No tier wants for max battles** (Matt: every report names its boss, and the 5-star and Gigantamax lists are a handful each). **Changed by plan 8R-1** (the stop reports design, `2026-10-21-stop-reports-design.md`, section 7 and Matt's answer 9): a max battle is told to who ticked the Dynamax or Gigantamax box of the species (or the form) in `/want`'s dialog, not to a species want in raids; still no tier wants.
7. **Reporting** is a command of its own, `/max`, and **the live map** reports and shows max battles too.
8. **Pinging chosen members**: nothing new; members mention people in the post's thread.

## 3. The max battle (a fourth kind of party)

### 3.1 Model

A max battle is a new party kind, `MaxParty` (`type: 'max'`), beside `RaidParty`, `MeetupParty` and `TrainParty`, not a raid with a flag. Why: almost everything that is raid-only (eggs, hatch, the gym and `raidAt`'s one raid per gym, `/location`, screenshots, the elite copies, `Set time`, moves) does not apply, and every raid guard (`requireRaid`, `isRaid`) then refuses a max battle without a line of new code. What it shares with raids it shares through `PartyCore` (attendance, groups, Remote, the clock, access, history).

**The timed guards must change first** (review 1): `isTimed` is `type !== 'raid'` (`party.ts:368`), so a max battle would pass it and code would read its missing `timed` (`/end`, `/meet`, `setMeetingTime`, the history's `party.timed.name`, which would lose every max battle's record under its savepoint). 8X-3's first task makes `isTimed` explicit (`meetup` or `train`) with a test, and the plan lists every `isTimed`, `!isRaid` and `hasGroups` site with what a max battle does there.

**What a max battle shares with a raid** (review 3): Done means completed (not leave): `completeRaid`, `askGroupWhetherComplete`, `completeUnanswered` and the Done button are generalised to `RaidParty | MaxParty` ("battled" kinds, `isBattle`); the clock gets a `maxTick` (warn and archive by the raid rule, the completion timeouts; no hatch). A group's meeting time (`/meet`, the group's time) is allowed, as for a raid (useful at a Gigantamax spot).

```ts
type MaxTier = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'G';   // Dynamax 1–5 stars, Gigantamax
interface MaxDetails {
  tier: MaxTier;
  boss: RaidBossRef;            // required: there is no egg
  spot: PlaceSnapshot | DroppedPin; // the Power Spot as it was named (kind 'powerspot'), or a pin "Unlisted power spot" (Q7)
}
interface MaxParty extends PartyCore { type: 'max'; gymId: null; hatchTime: null; max: MaxDetails }
```

- `gymId` stays null (that column serves the one-raid-per-gym rule). The spot is a snapshot, as a meetup's place (`placeDocument` already stores `{ kind, id: string, … }`), shown live while the kept Wayspot is the same place (`shownPlace`'s rule).
- **One max battle per Power Spot**: `PartyStore.maxAt(spotId)` (from memory, as `raidAt`), stored only through `addMaxUnlessTaken` under a `KeyedLock<string>` of the spot (which `whenIdle` waits for); it blocks only while `endTime > now` (as `blocksNewRaid`), and `/end` moving an end later takes the spot's lock, as a raid's does its gym's. The map's report uses the same path. A second report at a spot with an active max battle joins it; with another boss it is refused with the existing post named ("There is already a max battle against Sneasel at <spot>: <#post>. `/boss` there changes its boss."). A rotation within an event changes the boss through `/boss`, which is extended to max battles: the tier follows the new boss, and a change between Dynamax and Gigantamax is refused (the lobby cap would jump; report anew). There is no `/location` for max battles: a wrong spot is deleted (`/delete`) and reported again.
- **Times**: no hatch. The default end is the boundary of the battle's rotation, never past the day's last battle time (`settings.maxBattles.lastBattle`, default `21:00` in `settings.timezone`): see **Q9** below, which replaced the first rule (the end at the last battle time unless the report gave an earlier `end:`); a typed `end:` is taken as given. A report after the last battle time is refused ("Max battles are over for today: they can be fought from 06:00 to 21:00."); one before the first battle time (`firstBattle`, 06:00) is accepted, the end 21:00 that day (a battle seen at 05:30 is there at 06:00). The post shows "Ended" as a raid's does once its end has passed. `/end` changes the end as for a raid (within the day, not past the last battle time). The clock warns and archives as for a raid.
- **Remote** is allowed (Matt, 2026-10-20: "100% remotable", with Max Particles and a remote pass). No completion question beyond what a raid's Done does: Done means done, as a raid.
- State document **version 13** (12 is 8X-1B's stamp per group): the part `max` beside `raid`, `timed`, `meetup`, `train`; versions 1–12 read as today.

### 3.2 `/max`

`/max boss: spot: [end:]`

- `boss`: autocomplete of the current max bosses (the featured boss of an event that is on first, then 5 stars down to 1 and Gigantamax last, each choice saying its tier: "Machamp · Dynamax 2★"), and anything the game master knows can Dynamax typed in full. The tier comes from the boss list; a boss typed that is on no list is taken as Dynamax with the tier asked in a second option `tier:` (required only then; refused with the words "Which tier? Add `tier:`" otherwise). Gigantamax bosses are listed separately ("Gigantamax Machamp"), so Machamp the 2-star Dynamax and Gigantamax Machamp are two choices.
- `spot`: the Power Spots of the server (`PlaceFinder`, kind `powerspot` only; the member's region first), a maps link or coordinates resolving to the nearest Power Spot within 50 m, else to a pin, "Unlisted power spot" (Q7; its post says `📍 Unlisted power spot` with its Map; one max battle per pin within 50 m of another active one).
- `end`: optional, a time as `/end` reads it.
- Refusals, guards, throttle and `givesBack` as `/raid`'s; the forum is the spot's region's; a member kept out of that forum is refused as `/raid` refuses (`reportBarred`).

### 3.3 The post

As a raid's post (plan 8D's layout), with:
- Heading: `### Dynamax Machamp (2★)` / `### Gigantamax Machamp`, the picture of the boss (the Gigantamax picture where the game's icons have one, else the species'), "Until 21:00" (or the end given), the boss's types and weaknesses. No moves, no catch CP (follow-up if wanted).
- **Where**: the spot as a meetup's known place: `**<title>** (power spot) · <address> · [Map](…)` with the Wayfarer picture beside it (`placeSection`).
- Groups with the cap: each group's heading line says `3/4` (`5/4 · over the lobby size: somebody could move to another group`); one group shows its count against the cap in its heading too.
- Controls: as a raid's, without Set time and Screenshot feedback; Remote kept.
- The thread title: `Dynamax Machamp (2★) · <spot>`; the forum tag `Max battle`; the region link line `New max battle: <#post>`; the summary post lists max battles in a section of their own after the raids (`Max battles`, by tier).
- The DM brief and the new-max-battle DM as a raid's, the spot in place of the gym.

### 3.4 Wants and DMs

- `pokemonWantFits` matches a max battle's boss as a raid boss without shadow or mega: a species want and a form want fit; a tier want never does. The DM says "A Dynamax Machamp (2★) battle at <spot>".
- Since plan 8R-1 the wants that fit are the Dynamax and Gigantamax boxes of `/want`'s dialog (`TargetWant` `dynamax:` / `gigantamax:`; `maxWantsFiring`), by the battle's kind: see the stop reports design (`2026-10-21-stop-reports-design.md`, section 7, Matt's answer 9). The quiet hour per member, kind and boss is unchanged.
- Gym targets do not apply (a Power Spot is no gym; "spot targets" are a follow-up).

### 3.5 History

A max battle is recorded as any party: `PartyHistory.kind` `max`, `tier` `D2` / `G`, the boss columns, and a new `wayspotId` (migration, below) for the spot.

## 4. Lobbies and groups

- `lobbySize(party, settings)`: a max battle by its tier (`dynamax` 4, `gigantamax` 100), a Gigantamax train 100; none for a raid, a raid train, a Dynamax train and a meetup (Q6). `settings.lobbies` is `{ raid, dynamax, gigantamax }`, each 1 to 100, defaults 20, 4, 100; `raid` replaces the fixed 20 of the "split up" note of raids and trains (Matt, 2026-10-20); that note keeps counting as today, and Join does not use it.
- **Who counts** (Q5): committed members only: Coming, Here and those asked whether they are done, each with their +1s, remote players included; not Interested, not Complete (`lobbyCount`, beside `headCount`).
- **Join's group**, only where the party has a lobby size (`setAttendance` for a member not yet in a group with no group named, and `applyAutoStatus` through the same chooser; a member who goes from Interested to Coming is placed then): the default group (the newest) when it has room for the member and their +1s; else the first group with room, by letter; else a new group (`createGroup`, silently: no line, no ping) while there are fewer than five; else the group with the most room, the first by letter on a tie. A raid, a raid train and a Dynamax train behave exactly as today.
- A member's +1s or a change to Coming that pushes their group over its size leave them there (never split across groups); the group shows over its size.
- `/group join` puts the member where they asked, over the size if so.
- **Superseded in part by 8X-1B** (`2026-10-20-join-group-meet-buttons-design.md`): one Join for every post; with several groups only a member not signed up is asked which group ("Any group with room" first where the party has a lobby size, worded for the case that all five groups are full: then the group with most room); a member signed up moves with Group…; empty groups are pruned. 8X-1B comes before 8X-2.
- A group's heading line shows `3/4 coming · 1 interested` where the party has a lobby size, and `5/4 coming · over the lobby size: somebody could move to another group` over it.

## 5. The group ping

`/shout` gains `group: true` (boolean, default false): the shout pings only the members of the shouter's own group (as `/shout` does now: not the shouter, not Complete, those who allow shout mentions), and says `Group B: <text>`. Refused in a party with one group ("This party has one group: `/shout` without `group` pings everybody."). A message holds about 60 to 70 mentions with a long shout (`withMentions`: 2,000 characters, 100 pings), so a group of 100 is pinged in as many messages as it takes (the text in the first, the rest of the mentions after it; review 11), for `/shout` without `group` too.

## 6. Max battle trains and mixed routes

### 6.1 The train's kind

`TrainDetails.kind: 'raid' | 'dynamax' | 'gigantamax'` (`/train kind:`, default `raid`; changed afterwards in the Move train panel, a menu under the end mode's, for whoever may move the train and staff; Matt, 2026-10-20, Q1. The panel does more than move the train now, so its button may want another name: a follow-up for Matt). It sets the lobby cap (section 4) and the heading: `### Raid Train: <name>` / `### Max Battle Train: <name>` / `### Gigantamax Train: <name>`. `/boss` in a train keeps taking any Pokémon (`trainBoss`).

**Planned ahead** (Matt, 2026-10-21): a Gigantamax get-together (a Wild Area event, say) is planned as a Gigantamax train made days or weeks ahead; `/max` reports only a battle that is up now. `/train` gains an optional `start:` (a time as `/meet` reads it), so a train planned ahead has its time from the start: today a train without any time is archived a day after it was made, and that rule stays for a train with no time. Its route stays empty until the day. Legacy Pine's trains were made ahead too (of the 16 still open, the three with a start were made 10 hours, 14 days and 15 days before it).

### 6.2 A stop is a gym or a Power Spot

```ts
type StopRef = { kind: 'gym'; id: number } | { kind: 'powerspot'; id: string };
```

- `TrainDetails.route: readonly StopRef[]`, `finishedFrom: StopRef | null`; equality by `stopKey(ref)` (`'12'` for a gym, as `placeOf` gives today; `'w<wayfarer id>'` for a spot: no colon, which a custom id's part may not hold, and not `p`, a DM Stop reason's prefix; review 2, 18).
- **Custom ids stay short** (review 2): a Wayfarer id is 35 to 36 characters, so the panel's `party:<uuid>:next:<place>:<target>` would reach 123 of Discord's 100. Controls carry a short handle per stop instead of the key: the gym id for a gym, and for a spot the first 8 characters of a hash of its Wayfarer id (`stopHandle`), checked against the train's route when pressed (the panel decides anew against the train's place already; a handle that matches no stop, or two, is `route-changed`). The map's `place` takes the same handles.
- State document: **the next free version at merge** (13 or 14, after 8X-1B's 12; the later of 8X-3 and 8X-4 rebases its reader on the other's): a route of numbers reads as gyms.
- A Power Spot stop is shown as a gym stop is (Where with its Wayfarer picture and address, the route lists, the panel, the movement announcement), named `<title> (power spot)` where a list could confuse it with a gym.
- `/route add stop:` (renamed from `gym:`? → **open question Q2**) offers gyms and Power Spots together through `PlaceFinder` (kinds `gym`, `powerspot`), each choice marked with its kind; a raid train may add Power Spots as well. The train's kind orders the choices (Matt, 2026-10-20): among hits that match equally well, a Dynamax or Gigantamax train offers Power Spots before gyms, a raid train gyms before Power Spots; a better match always comes first, whatever its kind, so a typed gym name is still found on a max train. The map's route editor shows both alike.
- A Power Spot is a stop of the train's server when it lies in a region of it (`WayspotDirectory.regionsOf`); copies in other regions count its regions as a gym's.
- The route keeps only references. A spot whose Wayspot row is `gone`, or that an import reclassified (a PokéStop now), is shown as `Unknown power spot` and removed as an unknown gym is (`removeUnknownStops`); a train's spot never becomes a stop of another kind.
- **Saved routes**: `SavedRoutes.gyms` keeps comma-separated stops, a spot written as `w<wayfarer id>`; the reader keeps both (today it drops anything not digits). No migration: `gyms` is `text`, and the legacy bot never reads a route the new bot saved (it is gone at the cutover). `removeGym` rewrites a route keeping its spots (and counts them for "left without a stop"); `mentioning`'s `LIKE` then narrows by the parsed stops. `SavedRoute.gyms` becomes `stops: StopRef[]`.
- **History** (review 2): `PartyHistoryStop.wayspotId` (new, nullable) beside `gymId`; a spot's step is a step of kind `spot` whose `subject` is the bare Wayfarer id (36 fits `varchar(36)`) and `value` null; `trainStops` and `stopsByRoute` read `StopRef`s, so a spot is no "end of route".
- Gym wants and targets keep firing for gym stops only.

## 7. The live map (plan 8X-5)

- Power Spots drawn as a layer of their own from zoom 15 (as PokéStops: `GET …/api/powerspots?box`), each with a popup: its name, "Report max battle here" (the `/max` form: boss, optional end) and, for a train's editor, "Add to route".
- Max battles drawn at their spot (the boss's picture in a ring of the max colour), their popup with the post's controls (join, status, Remote), as a raid's.
- Trains: the route line and ring through Power Spot stops; the route editor adds a clicked spot.
- The map's data (`MapMax`, `MapTrain.route` as stop keys) and the routes' bodies (`add: { stop }`) change accordingly.

## 8. `/counters` for max battles (plan 8X-6)

Pokebattler's `GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=2&heal=0&shield=1&…` (no account needed; tried 2026-10-20 with Gigantamax Machamp) gives a suggested team by role (attack, heal, shield) with alternatives. `/counters` in a max battle's post, and `/counters boss: tier:` for a max tier, show it in the counters' message form. A plan of its own; nothing else depends on it.

## 9. Settings

```json
"lobbies": { "raid": 20, "dynamax": 4, "gigantamax": 100 },
"maxBattles": {
  "url": "https://fight.pokebattler.com/raids",
  "refreshMinutes": 360,
  "firstBattle": "06:00",
  "lastBattle": "21:00"
}
```

Max battles are always on (Matt, 2026-10-21: trains and meetups cannot be switched off, and `raidBosses` is a required block): `maxBattles` has these defaults, as `lobbies` has its, so an old settings file, the test settings and the converter's output all have max battles on; there is no off switch.

## 10. Data and migrations

- **One spelling of the tiers** (review 15): `MaxTier` = `D1` … `D5`, `G` in the domain, the state document, `RaidBoss.level` and `PartyHistory.tier`; `BattleKind` = `raid`, `dynamax`, `gigantamax` only for lobbies and train kinds (`battleKindOf(tier)`); words ("Dynamax 2★", "Gigantamax") in one place.
- Max bosses in the `RaidBoss` and `RaidBossOverride` tables with those levels (`level` is `varchar(16)`, the unique key keeps the families apart). The repository is made per family (review 6): every read and write filters by the family's levels: `replaceFeed` (which today deactivates every active row it was not given), `touchActive`, `lastSyncedAt` (so a fresh Pokebattler sync cannot hide a stale ScrapedDuck feed), `listActive`, the overrides. A shiny override without a tier covers raid tiers only. `/admin boss` offers the max tiers.
- **The Pokebattler mapping** (review 7): every catalogue entry has its `pokebattlerId` already (`ARCANINE_HISUIAN_FORM`, `TOXTRICITY_AMPED_FORM`); a Gigantamax id drops `_GIGANTAMAX` and is looked up the same way (`TOXTRICITY_AMPED_GIGANTAMAX` → Amped Toxtricity, `MACHAMP_GIGANTAMAX` → Machamp). An id that matches nothing is a `{ name }` boss, logged, as the raid feed does. A Gigantamax boss is `{ key }` with tier `G`, never an entry of its own; its picture is `pm<dex>.f<FORM>_GIGANTAMAX`, else `pm<dex>.fGIGANTAMAX`, else the species'. 8X-2 commits a fixture of the real `/raids` file (2026-10-20).
- **The featured boss** (review 8): ScrapedDuck's `max-mondays` and `max-battles` events are kept in a list of their own (not `RAID_EVENT_KINDS`, which feeds the raid durations) and their boss read from the name ("Dynamax Sneasel during Max Monday", "Dynamax Uxie, Mesprit, and Azelf Max Battle Day", "Gigantamax … Max Battle Day") through the Pokémon search; a name that does not parse features nothing (tested against a recorded fixture). **A Max Monday's boss is featured all week** (Matt, 2026-10-20: on the Monday nearly every Dynamax battle is it, and it stays the most common all week), from its Monday's start until the next Max Monday starts (7 days at most); a Max Battle Day or Weekend features its bosses during its own hours, before the week's boss. Every hour comes from ScrapedDuck; an event without hours whose id carries a date takes the clock hours of the nearest event of its kind (logged).
- The Dynamax and Gigantamax lists of the game master (`pokemonExtendedSettings.breadOverrides[].breadMode`: `BREAD_MODE`, `BREAD_DOUGH_MODE` and its `_2` variant; found in 8X-2: `BREAD_POKEMON_SCALING_SETTINGS` lists only the 70 species with custom visuals) say what may be typed as a boss off the lists; `/max`'s `tier:` offers `D1` … `D5` and `G` (review 16).
- **Migrations**: `PartyHistory.wayspotId varchar(40) null` (8X-3) and `PartyHistoryStop.wayspotId varchar(40) null` (8X-4), each in the plan that needs it, numbered at merge (025 or later; first merge wins). Additive and guarded.
- No column for the max battle in `Party`: it is found in memory (`maxAt`). `settings.lobbies` and `settings.maxBattles` have their defaults (an old settings file and the converter load unchanged); max battles are always on.
- No copies in the remote or elite channels for max battles (review 19); the `Max battle` forum tag is added by `ensureTags`.

## 11. Plans

| Plan | What | Depends on |
|---|---|---|
| 8X-1 | Lobby caps and Join filling groups (all kinds), `n/cap`, the group ping | — |
| 8X-1B | One layout of buttons for every post, the which-group dialog, Group… and Meet…, empty groups pruned (design `2026-10-20-join-group-meet-buttons-design.md`) | 8X-1 |
| 8X-2 | Max bosses: the Pokebattler feed, the featured boss from events, the game master's Dynamax list, overrides, `/admin boss` | — |
| 8X-3 | The max battle: kind, `/max`, the post, summary, wants and DMs, history, migration | 8X-1, 8X-2 |
| 8X-4 | Train kinds and stops that are gyms or Power Spots: routes, saved routes, copies, history, `/route add` | 8X-1 |
| 8X-5 | The live map: Power Spots, max battles, reporting, routes through spots | 8X-3, 8X-4 |
| 8X-6 | `/counters` for max battles | 8X-2 |

Each with its staging checklist. 8X-3 and 8X-4 touch `src/web/` already as far as the map's data must compile (review 10: 8X-3's `mapParty` leaves max battles out until 8X-5; 8X-4 changes `MapTrain.route` to stop keys and the route bodies to handles), and 8X-5 is the map's own work; all three are coordinated with the web map session (`../Professor-Pine-wayfarer`) before they start.

## 12. Open questions

Settled by the review (Claude's call, Matt may object): `/route add`'s option is renamed `stop` (its description says "a gym or power spot", `/route remove stop:` keeps its stop number); no "not here any more" control (`/end`, `/delete`).

For Matt (the review's questions that change what gets built), with Claude's recommendation:
All decided by Matt, 2026-10-20:
- **Q1** `/train kind:` and a menu in the Move train panel (section 6.1). `/route add stop:` ("rename it to be more generic").
- **Q3** A report at a spot whose max battle has another boss is refused, the post named, `/boss` there.
- **Q5** Only committed members count toward a group's cap: Coming, Here and those asked whether they are done, remote players included; Interested does not. The post makes that plain: a group's line is `3/4 coming · 1 interested` (Here counts as coming there). A group Join opens by itself is not announced and pings nobody.
- **Q6** Join fills groups only for max battles and Gigantamax trains ("max battles are considered more ad hoc and auto-grouping is more acceptable"); raids and raid trains keep today's behaviour exactly, where people choose their group consciously: the 20 is shown nowhere, `/group new` as now. So the counting of Q5 touches no raid.
- **Q7** A Power Spot Pine does not know is accepted as a pin, "Unlisted power spot" (a maps link or coordinates in `spot:`; Matt: "a sign to us we need to re-scrape or add manually"). Staff see them in the log line of the report. The same for gyms is a follow-up. (Matt, 2026-10-21: blocked members refused at a pin; the moderators get a notice of each pin battle.)
- **Q8** A species want gives at most **one DM an hour per member and boss** for max battles, and that DM says so: "You won't be told about more Dynamax Machamp battles for an hour." (so a quiet hour does not look like broken notifications).

Open for 8X-3 (Matt, 2026-10-20 night; settle when 8X-3 is planned):
- **Q9 How long a max battle lasts.** Matt: Gigantamax battles, event days only in practice, do not follow the all-day rule (06:00–21:00) but a short rotation: 30 minutes during a Max Battle Day's three core hours for certain; outside them (the rest of the day) 30 or 60 minutes, not known. A search (2026-10-20) confirmed only the 30-minute rotation in the core hours (the Max Battle Day articles of the Pokémon GO wiki and Pokémon GO Hub, one older guide says 20–30 minutes) and that Max Monday's bosses rotate every hour all day; nothing on the hours outside; Reddit was not reached. The game's timer at a spot counts down to 21:00, so a reporter does not see the rotation (corrected by the design of max battle screenshots, `2026-10-22-max-battle-screenshots-design.md` section 8: it counts down to the rotation's end during events and to the small hours, about 04:59, otherwise; a screenshot's end is its countdown capped at the last battle time). Claude's recommendation: the default end by the event the battle falls in: during a Max Battle Day's hours (8X-2 knows them) 30 minutes from the report, on a Max Monday 60 minutes, a Gigantamax battle outside an event's hours 60 minutes, otherwise 21:00 as above; `end:` and `/end` change it as now; Matt confirms the outside-hours rotation on the next Gigantamax day. **Matt (2026-10-20): the recommendation matches what he believes is right; he seeks confirmation of the outside-hours rotation.** The wiki's list of Max Battle Days (read by Matt, 2026-10-20): most are 14:00–17:00 (one 14:00–19:00, extended by Niantic), but the **Max Battle Weekends** (Dynamax legendaries, and Gigantamax inside larger events) run 06:00–21:00; the 30-minute rotation is stated for Max Battle Days only, and Matt has seen Gigantamax battles active before and after the three core hours. So the rule reads the event's own hours from the feed, never a fixed 14:00–17:00: an event of a few hours 30 minutes, an all-day event (Max Monday, a Max Battle Weekend) 60 minutes, until confirmed. **Matt (2026-10-21): battles rotate on the hour and the half hour, and a reported battle is already on (there is no egg), so the default end is the boundary of the rotation it is in, never a span from the report:** inside a short event (a Max Battle Day of a few hours) the next :00 or :30; inside an all-day event (Max Monday, a Max Battle Weekend), and for a Gigantamax battle in a big event (Wild Area, GO Tour, GO Fest Global) or outside any event, the next full hour; otherwise (a Dynamax battle on an ordinary day) the last battle time, or the start of a max event later that day if sooner (Matt, 2026-10-21, Q-B: reported at 10:00 on a 14:00–17:00 Max Battle Day, until 14:00; to be checked on the lake trio day of 2026-10-24, whether Dynamax battles were up before 14:00); in a big event's hours `/max` lists the Gigantamax bosses first (Matt, 2026-10-21, Q-A); always capped at the last battle time; `end:` and `/end` change it within the day. A report not joining a battle whose end is less than five minutes away is asked about first (a dialog: until the next rotation, first, or until the end about to pass; only "Report it anyway?" where no later rotation is left, also a Dynamax battle at its event's last boundary); a typed `end:` is never asked about.
- **Q10 Meet… for a max battle** (8X-1B left it to 8X-3): no in-game RSVP times exist for max battles (Matt, 2026-10-20). Claude's recommendation: the round 5-minute times of the next hour, up to the battle's end, and "No meeting time" when one is set. **Taken by Matt, 2026-10-20.**

## 13. Follow-ups (not in this work)

Pokebattler as a fallback raid boss source; screenshots of max battles (since plan 8X-S: design `2026-10-22-max-battle-screenshots-design.md`, `docs/architecture/screenshots.md`); spot targets ("tell me about max battles at this spot"); catch CP and moves for max bosses; a group menu and more than five groups.
