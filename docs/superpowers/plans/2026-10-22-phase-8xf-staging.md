# Phase 8X-F staging checklist: fixes from the 8X staging run (draft)

Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord and the map in its own tab. Accounts: Googer (owner, staff), Tester (a member) and, where a step says so, a third account or a phone. The findings are in the follow-ups, "From the staging run of 8X (max battles, 2026-10-22)"; the plan is `2026-10-22-phase-8xf-staging-fixes.md`. Part one re-checks each finding; part two runs the steps of the 8X checklists the run of 2026-10-22 did not reach.

## Before

1. **The shared dev database.** 8X-F adds **migration 029** (table `MaxEvent`), run at the first start; the dev database is at 028 since the 8X run. Check `var/stage/TEST-SERVER-STATE.md` (who uses the dev bot, what is left in #north-side) and note there that 8X-F is being staged and the database goes to 029. Stage from `typescript-migration` with 8X-F in it; a checkout without migration 029 should not run on the dev database afterwards.
2. **Deploy the commands** (`/boss` gains `tier:`): `set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global`.
3. Between 06:00 and 21:00, with the max boss list loaded (`/admin boss` shows the max tiers).

## Part one: the findings

4. **Typed `/route add` on a max train (finding 1).** On a max train in #north-side, `/route add stop:Allegheny Station` typed and sent without picking from the list: the gym Allegheny Station is added (it fits exactly; the two power spots "Allegheny County Fire Station" and "… Allegheny County Station 295" only contain the words). A text that fits two gyms and two spots alike (a tie) still answers "Several places fit". The mirror on a raid train (8X-4 checklist step 10): a power spot's exact name against several gyms that contain its words adds the spot.
5. **`/max spot:` with nothing typed (finding 2).** In #north-side, `/max` and open the `spot:` list before typing: the region's power spots by name (at most 25). In a channel that is no region's: no choices.
6. **`/boss` with a boss on no list (finding 3).** In a Dynamax battle's post, `/boss pokemon:` a Pokémon on no max list (the 8X run used Machamp in a D2 battle, now overridden as G until 11/21: pick another unlisted one): "Which tier? Add `tier:`." Again with `tier:D3`: the boss and tier change ("… (3★)"). A boss on the list keeps its tier without `tier:`. In a raid's post, `/boss … tier:D1`: refused ("`tier:` is for a max battle whose boss is on no list. Leave it out here."). In a Gigantamax battle, a Pokémon that can Gigantamax is taken as G without asking.
7. **Meet…'s preselected time (finding 4; the reviewers' F-A7).** In a battle with a lobby size: Googer opens Meet…, submits 7:10 PM; Tester changes the group's time with `/meet` to 7:20 PM; Googer presses Meet… again: 7:20 PM is preselected, not 7:10. On the web client and on Android (and iPhone if at hand). The same for the which-group dialog and Group… after a group changed: the choice shown is the current one. A dialog opened before the deploy of 8X-F (if one is still open) still submits.
8. **Max events across a restart (finding 5).** With the bot up after a feed read, `node --env-file=.env var/stage/q.mjs "SELECT kind, eventId, name, startsAt, endsAt, featured FROM MaxEvent"` lists this week's max events (and any big event). Restart the bot: the featured boss of the week (if any) still leads `/max`'s boss list before the next feed read; the log says the events were loaded. A failed read (none to force: skip) is only looked at in the log.
9. **Words (finding 6).**
   - Another `/max` with the same boss at a spot that has a battle: "There is already a max battle against Dynamax <boss> (<n>★) at this spot: <post>." From the map (`POST /api/maxes`, as the 8X-5 checklist's console helpers): "There is already a max battle against … at this spot." and nothing about a post.
   - A place whose name ends in a period (the 8X run's "… Inc."): a report's answer, the DM and the train panel say "Inc." once; so do taking back a research or Rocket report at such a stop (`/research remove`, `/rocket remove`, and the map's remove) and the line in a raid's post when it moves to such a gym.
   - A pin battle's meeting DM and the boss-change DM: "at an unlisted power spot".
   - Over the lobby size: "Over the lobby size: somebody should consider moving to another group."
   - `/want` without `type`: the Dynamax choice has no ", 1 to 5 stars".
10. **Stop buttons last (finding 7).** A want DM (Tester wants a boss, Googer reports a battle of it): the news, the links, "-# You won't be told about more … for an hour" (when said), then "You asked to be told about", the reasons and their Stop buttons last. Stop still stops that want and the DM shows it stopped.
11. **Counters (finding 8).** `/counters` for a max boss whose team has Hydreigon: "Bite" alone, no dangling separator (Pokebattler's `MOVE_NONE`, as recorded).
12. **The 8X-5 checklist (finding 9).** Its steps 8 and 14 read as the map answers (`PIN_NOT_HERE`; `region` is the region's id).

## Part two: the steps the 8X run did not reach

From the follow-ups, "Not run, for the staging after 8X-F", in their own checklists:

13. **8X-1B** (`2026-10-21-phase-8x1b-staging.md`): 9 (Android and iPhone preselection, with step 7 above), 12, 13 (phone), 15, 17–24.
14. **8X-2** (`2026-10-21-phase-8x2-staging.md`): 5, 9.
15. **8X-3** (`2026-10-21-phase-8x3-staging.md`): 16, 17, 17a/b, 19 (the history), and the second report within the hour of step 18.
16. **8X-4** (`2026-10-21-phase-8x4-staging.md`): 5, 7, 8, 10 (the raid train, with step 4 above), 12–24 (with 8B-3's leftovers).
17. **8X-6** (`2026-10-21-phase-8x6-staging.md`): 3–6, 8–10, 9a–e (8B-2's leftovers).
18. **8X-5** (`2026-10-22-phase-8x5-staging.md`): 8 (a far pin from the map), 11, 12.

**Dated, not part of this run:** 2026-10-24 (Lake Trio Max Battle Day: whether Dynamax battles were up before 14:00, Q-B; whether the trio linger in Pokebattler's feed after 17:00, 8X-2 step 11, 8X-3 step 20); 2026-11-14/15 (Wild Area: Gigantamax first, their default ends, 8X-3 step 21; the big event kept across a restart, step 8 above).

## After

19. Record the results in the follow-ups ("From the staging run of 8X-F"), the state left in `var/stage/TEST-SERVER-STATE.md` (migration 029).
