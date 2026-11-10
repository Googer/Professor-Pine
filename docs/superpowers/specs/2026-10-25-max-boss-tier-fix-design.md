# A max boss at the wrong tier: one override fixes it, screenshots tell the staff: design

Status: agreed with Matt 2026-10-25, reviewed; ready for a prototype. Plan 8X-J. Follows the rule "One path for every fact" (CLAUDE.md, "Domain and parties", Matt 2026-10-25): every path that decides which bosses are valid and at which tier reads one function.

## Why

The staging of 8X-S on 2026-10-25: Matt's three Sneasel max screenshots read 2 heads each and were reported as Dynamax Sneasel (1★), with the doubt `heads-boss-conflict`. The reader was right; Pokebattler's feed (`GET /raids`) lists Sneasel only as `RAID_LEVEL_1_MAX`, while the game has it at 2★. The screenshot reader keeps the list's tier by design (`listedBoss`, `max-report.ts`), so every path said 1★: typed `/max`, the post, `/counters` (a 1★ simulation), the screenshots.

Staff can fix the list today with two overrides: `/admin boss hide pokemon:Sneasel tier:D1` and `/admin boss add pokemon:Sneasel tier:D2`. Two things make that weak:

- **The add alone is a common half-fix.** It leaves Sneasel listed twice (1★ from the feed, 2★ from the add): `/max` offers both, a member may pick 1★, a typed `Sneasel` takes whichever is first. And a `hide` lasts for good by default, so a boss Pokebattler later lists rightly at 1★ stays hidden until someone removes it.
- **Nobody is told.** The disagreement is in each screenshot's record (`heads-boss-conflict`, the review folder) and in members' heads, not in front of the staff.

## 1. An add at a Dynamax tier moves the boss there

- A Dynamax boss has one tier at a time in the game. So an `add` override of a Pokémon at a Dynamax tier (D1–D5) means "it is a boss of this tier", and the feed's rows of the same boss (same key) at the other Dynamax tiers are left out of the list in effect while the add is in force (not expired, and not itself undone by a `hide` of its tier: see "Open for the review").
- **Gigantamax is apart**: a Dynamax and a Gigantamax battle of one species are two bosses. An add at D1–D5 never touches the boss at G, and an add at G touches nothing else.
- **Only the feed's rows go.** Two adds of one Pokémon at two Dynamax tiers stay as they are (staff typed both); a later add does not remove an earlier one.
- **Raids move too** (Matt, 2026-10-25: "a given raid boss has never been in two different tiers at once"): the groups are the plain raid tiers (T1, T3, T5, Elite), the shadow tiers (Shadow T1, T3, T5) and the mega tiers apart (a mega is another form, so never the same key). `RAID_OPS.oneTierAmong` gives `'plain'` or `'shadow'`, undefined for the mega levels.
- **No new override row, no migration.** The rule lives in the one function that makes a family's list in effect, `familyBosses` (`src/domain/pogo/raid-bosses.ts`), through a new optional member of `BossFamilyOps`: `oneTierAmong?(tier): string | undefined`, the group of tiers in which a boss has one tier at a time (`MAX_OPS`: `'dynamax'` for D1–D5, undefined for G; `RAID_OPS`: absent). After the adds are placed and before the hides, a feed boss whose key has an active add at another tier of the same group is removed. So the implied hide lasts exactly as long as the add: 30 days by default (`DEFAULT_DAYS`), `days:0` for good, and `/admin boss remove` of the add brings the feed's tier back.
- **Every path follows from the one list**: `MaxBossProvider` / `ctx.maxBosses` feed typed `/max` and `/boss` (`readMaxBoss`, `typedMaxBoss`), `/max`'s choices (`maxBossChoices`), the screenshot readers (`maxScreenshotReport` through `typedMaxBoss` / `listedBoss`, typescript-migration 85e4249f), the web map's `/api/max-options` and `POST /api/maxes` (`reportMaxAs`), `/counters`, wants and DMs. No path gets code of its own.
- **What staff see:**
  - `/admin boss add pokemon:Sneasel tier:D2` answers as today and adds: "The feed lists it at Dynamax 1★: that one is left out while this lasts."
  - `/admin boss list` shows the add with "moves it from Dynamax 1★" beside its number and expiry (`familyReport`), so the implied hide is visible where the overrides are.
  - The old-override marks (`OLD_REASONS`) gain nothing new: an add whose tier the feed now lists is already marked "the feed lists it now" (Pokebattler fixed its data; the add can go).
  - `/admin boss`'s help and `utilities.md` say it.
- The sync's change (`diffBosses`, `RaidBossAnnouncer`'s `seen`) needs nothing: it diffs two lists in effect, so an add that moves Sneasel shows as Sneasel leaving 1★ and joining 2★.

## 2. Screenshots that keep disagreeing with the list tell the staff

- **What counts**: a screenshot whose report has a listed boss and `heads-boss-conflict`, with heads read (the doubt is raised only then): a max screenshot of a Dynamax boss, or a raid screenshot (Matt's answer 2). One observation is (server, family, boss key, list's tier, heads' tier, member, time). Gigantamax has no heads (no conflict).
- **When the staff are told**: a domain function, `listTierDoubt(observations, now)` in `src/domain/ocr/`, gives the (family, boss, list's tier, heads' tier) that the observations of the last 24 hours show at least 3 times with one heads' tier, from any members (Matt's answer 1). The screenshot flows (`/max screenshot:`, mentions, passive reading) only record the observation and ask the function; no flow decides it.
- **Where**: the moderators' channel near the screenshot's channel, as the missing Power Spot note (`ModerationReports.missingSpot`): a new `ModerationReports.listTier(notice)`, at most once per (server, boss, heads' tier) in 7 days, kept in memory (a restart may tell once more), sent on the side, forgotten when not sent so the next screenshot tries again; no moderators' channel is a log line.
- **The words** (`render/moderation.ts`): "Screenshots show **Dynamax Sneasel** with 2 heads (2★) 3 times since yesterday, but the boss list has it at 1★. If the game has it at 2★: `/admin boss add pokemon:Sneasel tier:D2 days:7` moves it there." The command is built from the boss and the heads' tier, so it can be copied.
- **Quiet once fixed**: after the add, the screenshots match the list (no `heads-boss-conflict`), so nothing more is observed.
- Members see nothing new: their answers keep "The boss I found is of another tier than the heads say." as today.
- Observations are kept in memory (`BoundedMap`, a day's worth per server), never in a record beyond what the screenshot record already holds; member ids are only counted, never written in the note or the log.

## Left as they are

- The reader keeps the list's tier when it disagrees with the heads (one misread head never moves a battle's stars); the list is the authority and staff correct it.
- Raid overrides, `hide`'s default (for good), `autoset`, `shiny`.
- `/boss-tier` (raids only).

## Matt's answers (2026-10-25)

1. **The threshold of the note**: one member is enough when there are enough screenshots (Matt: "open to making it 2 minimum"). Taken: 3 screenshots of one boss with the same heads in 24 hours, from any members (today's three by Matt alone would have told the staff).
2. **Raids too**: yes, though ScrapedDuck's raid list (Leek Duck's page) is reliable enough that it may never matter. A raid observation goes to the same function, per raid tier (shadow apart); its signal is B1's below, not `heads-boss-conflict`. Raids move on an add too, so the raid note names the one `add`, as the max note does.

## Matt's answers to the review (2026-10-25)

3. **The raid signal (B1):** yes. An Elite raid, should they return, is listed as Elite, so its CP is matched at Elite stamina and it is found at its listed tier: the signal is raised only when the boss is not found at its listed tier but its CP and name fit at the heads' tier, so a correctly listed Elite raid never raises it. 6 and 7 heads (`heads-unverified`) still never count.
4. **Running battles (M2):** corrected. When an add moves a boss, the active parties of the server with that boss at a tier it moved from (a max battle, a raid; not ended) move to the add's tier through `PartyStore.update` with one domain function (the battle's tier and everything drawn from it: title, post, `/counters`; a max battle's end is not changed); the post gets a line "Staff moved **Dynamax Sneasel** to 2★." (no ping, no DMs). The add's answer counts them ("2 battles running were moved."). Removing the add, or its expiry, moves nothing back (the feed is usually right again by then; `/boss` fixes one battle).

## Review (fresh Opus reviewer, 2026-10-25): findings and the defaults taken

- **B1 (Blocker), the raid signal:** a raid's boss is found by its CP at the listed tier's stamina, so a boss listed at the wrong tier comes out as no boss (`bossAtTier` refuses a Pokémon "listed in another level"), never `heads-boss-conflict`; and a hatched Elite raid (5 heads read as T5, CP at Elite stamina) raises the conflict on every screenshot. A raid observation is therefore "the CP and name at the heads' tier fit X, but X is listed at another level" (from `unlistedBossOf` / `bossAtTier`), never `heads-boss-conflict`; Elite, EX and `heads-unverified` (6, 7 heads) never count. For Matt (below).
- **I1, coming bosses:** `comingMaxBosses` gives `familyBosses` only hides and shinies, and `/admin boss list`'s Coming reads `feedBosses()`: the moved rows are worked out over the whole feed (begun and upcoming) by one domain function used by `maxBossesAt` and `comingMaxBosses`; Coming reads `coming()`.
- **I2, shiny:** a boss that replaces moved feed rows is shiny when the feed's row or the add says so (`add` stores `shiny: false` when unspecified).
- **I3, the rule stated exactly:** a feed-only slot of key K at a tier of a group is removed when K has an active add at another tier of the group that no active hide cancels, and K has no active add of its own at that slot. Tested both ways (hide beats add moves nothing; staff's own add at the feed's tier stays).
- **I4, one place records:** the observation is recorded in `ScreenshotService` (every read passes it: `readMax`, the raid read), from the reader's own reading (not what was typed), at the upload time, counted once per member and place in the window (the same file posted twice counts once). Refused passive reads count when the reading is surely of a listed boss.
- **I5, one domain result:** `familyReport` gives each add its `moved` tiers; the add's answer, `/admin boss list` and the old-override mark read it. An add is "the feed lists it now" only when the feed lists it at its tier and at no other tier of its group.
- **I6, expiry in notes:** every command a note suggests carries `days:7`; shadow tiers spelled as the choice value (`T3:shadow`).
- **M1:** max changes are not announced (`RaidBossAnnouncer` is raids only) and an override makes no sync diff: §1's sentence on the announcement is wrong, nothing to build.
- **M2, running battles:** a battle already at 1★ stays 1★ (`/boss` fixes one battle). For Matt (proposed: yes).
- **M3:** the note's command names the boss as `/admin boss` reads it (`entry.key`, `ids:` for a boss the game data lacks) and is called a guide, not copy and paste.
- **M4:** the note's once-a-week key is (server, family, boss, list's tier, heads' tier).
- **M5:** the add's answer names an active hide of the same boss at another tier of the group ("Override #N already hides it at Dynamax 1★: it is no longer needed").
- **M6:** "the same kind" of raid is defined with the raid groups (below).
- **M7:** when the list's tier comes from an add (`source: 'override'`), the note suggests `/admin boss remove override:N`, not another add.

## Open for the review (answered above)

- An add at D2 and a `hide` at D2 of the same boss (the hide beats the add): should the add still leave out the feed's D1? Proposed: no; a hidden add moves nothing (the boss is then on no Dynamax tier only if staff hid it at D1 too).
- The featured boss of a max event (`source: 'event'`) and `coming()` bosses: an add's implied hide touches only feed rows, not event rows (Gigantamax only today).
- Whether `familyReport`'s old-override reasons need "the add's tier is the feed's now" spelled for a moved boss (the feed lists it at D2 itself): already "the feed lists it now".
