# Phase 8X-2 staging checklist: max bosses (draft)

Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Account: Googer (owner, staff). The dev bot and database are shared with other sessions: check and update `var/stage/TEST-SERVER-STATE.md` first (this build is 8X-1B's too: its party state version 12 is not readable by an older bot, see the 8X-1B checklist's step 1). No migration. The conventions are `docs/architecture/utilities.md`.

This plan's bosses are seen through `/admin boss` and the logs (and, once 8X-3 is merged, `/max`'s list of bosses; max battles are then always on, step 4).

## The game data, version 6

1. **First start after the merge, before adding `maxBattles`** (the dev cache is version 5): the log shows the game data downloaded again ("game data refreshed"), not "using the saved game data"; `var/game-data-cache.json` says `"version": 6` and has `maxBattles`. Since 8X-3 (max battles always on) this first start also reads Pokebattler once after login: one request, "max bosses updated" (step 4 looks at it). Stop (one Ctrl+C) and start again: the second start uses the cache, no download. **For the runbook:** a version 5 cache plus a failed download refuses to start ("Could not download the game data … no saved copy"); the rehearsal stack's first `./pine update` after this merge needs GitHub reachable.
2. In the live cache's `maxBattles`: are `uxie`, `mesprit`, `azelf` in `dynamax` (the 2026-10-10 game master lacked them)? Are `machamp`, `toxtricity_amped`, `urshifu_rapid_strike` in `gigantamax`? Note both lists' sizes (163 and 21 in the test sample). No "game data warning" about the max lists.

## Commands

3. Deploy the commands again (`/admin boss` gains six tier choices and `sync max:`): `set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global`. `/admin boss add|hide|shiny|list` offer 16 tiers (the raid tiers, then Dynamax 1★ … 5★, Gigantamax); `autoset` offers only the 10 raid tiers.

## Without the `maxBattles` block

4. Max battles are always on (8X-3, Matt, 2026-10-21: the block has its defaults, as `lobbies` has; there is no off switch). With no `maxBattles` in the settings: one request to Pokebattler after login at the default address, `/admin boss list` shows the max section after the raid bosses, `/admin boss add pokemon:Machamp tier:Gigantamax` is taken and `/admin boss sync max:True` reads the feed (or says it is unchanged). The raid list, a raid sync and its announcement in the bot-updates channel are as before.

## The block written out

5. Add `"maxBattles": { "url": "https://fight.pokebattler.com/raids", "refreshMinutes": 5 }` to `var/stage/settings.json` and start at least 5 minutes after step 4's read (a start reads Pokebattler only `refreshMinutes` after the last attempt, step 8, so with the default 6 hours it would make no request; take `refreshMinutes` out again before step 8): one request to Pokebattler after login, no error, "max bosses updated" with about 60 names; note any warning ("the max boss feed names a Pokémon the game data does not know", "max boss feed entries were left out", "has a level Pine does not know"); "max event hours assumed" lists the past Max Monday; the raid boss sync ran too and the raid list is untouched. Does a later `/admin boss sync max:True` get a 304 (the feed's ETag or Last-Modified)?
6. `/admin boss list`: raid bosses first, then "**Max bosses** · the feed was read …"; Dynamax 1★ … 4★ with their bosses; 5★ empty with Uxie, Mesprit and Azelf under Coming before 2026-10-24 (listed from that day); a long list split into follow-ups without a heading cut off from its bosses; `tier:Gigantamax` says the tier has no bosses.
7. Overrides: `add pokemon:Machamp tier:Gigantamax`, `hide pokemon:Sneasel tier:Dynamax 1★`, `shiny pokemon:Machop can-be-shiny:True tier:Dynamax 2★`; `shiny pokemon:Machop can-be-shiny:False` without a tier says "in any raid tier" and leaves the 2★ Machop alone; `add pokemon:Sneasel tier:Gigantamax` warns that the game data does not list it as a Gigantamax boss, and stores it; `remove` offers raid and max overrides with one numbering, and removing one leaves the other family's alone. In `pine-dev-mysql`, `RaidBoss` and `RaidBossOverride`: the max rows have levels D1–G, the raid rows are unchanged.
8. Restart: no new Pokebattler read within 6 hours of the last; the max list and overrides come back; before 10-24 the trio is still under Coming; a raid `/admin boss sync` says the raid feed's own read time (a max read does not mask a stale raid feed).
9. Shutdown (one Ctrl+C) logs nothing past the max boss sync's 5 seconds.

## Over the following days

10. Daily, ScrapedDuck's `events.json`: how long after its Monday the `max-mondays-…` entry stays, and whether its hours go null; restart once in the week and see whether "max event hours assumed" still lists the Monday (the week's featured boss after a restart is kept in memory only: persist the max events only if the feed drops the Monday within the week).
11. After the Max Battle Day (2026-10-24, 14:00–17:00): `/admin boss sync max:True`, then `/admin boss list tier:Dynamax 5★`: does Pokebattler still list the trio (no `endDate` in any max tier)? If they linger, 8X-3 drops an upcoming boss once a featured event naming it has ended, but only while the bot has known that event since before it ended: restart the bot and see whether `/max boss:` offers the trio again (it does if Pokebattler still lists them; then decide whether the max events must be kept across restarts).
12. On the next Gigantamax day: does Pokebattler's `RAID_LEVEL_6_MAX` fill?

## After

13. The `maxBattles` block may stay in the stage settings (it only sets what the defaults are; max battles cannot be switched off since 8X-3); update `var/stage/TEST-SERVER-STATE.md`; record the results in the follow-ups file ("From the staging run of 8X-2").
