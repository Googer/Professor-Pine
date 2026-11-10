# Phase 8W-6 staging checklist: the Google line as a priority queue with a monthly budget, a first import's gyms in blocks (draft)

Every step needs Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab and reads the dev database (`pine-dev-mysql`) and the bot's log. Every step that lets the bot ask Google spends real questions of the dev key: the stage settings keep the budget small (step 2), so that the whole run asks at most about a hundred.

- **Accounts:** Googer (owner, staff) and Tester (a member).
- **Plan:** 8W-6; design `docs/superpowers/specs/2026-10-20-google-line-priority-design.md`.
- **Conventions:** `docs/architecture/gyms-and-regions.md` (the line, its budget, its ranks, the gyms set aside, the gyms asked, the Wayspots in it, `/gym google`), `wayfarer.md` (the import in blocks, the Wayspots' places), `history.md` (`raidsByRegion`).
- **Database:** migration 032 (`2026_10_26_032_google_line`) runs on the dev database only once 8W-6 is merged into `typescript-migration` (a migration not merged is never run there).
- **Counts:** the line asks one question every five seconds from the moment the bot starts, so a count read a little after a start may be a few higher than the step says ("or more"); every count of a step is read relative to the counts of the step before it (`select day, kind, questions from GoogleUseDay order by day, kind`).

## Before

1. **The commands changed** (`/gym google` is new). Matt deploys them with the stage settings:

   ```
   set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global
   ```

2. **Settings** (`var/stage/settings.json`): `googleLookupsPerDay` taken out if it is there (step 3 shows why), and a small budget for the run: `"googleLookupsPerMonth": 60`, `"googleLookupsReserve": 10`, `"googleGeocodesPerMonth": 20`. `GOOGLE_API_KEY` set in `.env` (checked with a command that says set or empty, never read). The server's regions are Pittsburgh's 28, with their party history (staged parties and, if imported, the legacy history).
3. **The old setting is refused.** With a copy of the stage settings that still names `googleLookupsPerDay`, the settings alone are read (no bot started):

   ```
   node --conditions=pine-source --import tsx -e "import('./src/config/settings.ts').then((m) => m.loadSettings('var/stage/settings-old.json'))"
   ```

   It fails, naming `googleLookupsPerDay` as an unknown key. A reserve of 60 beside a budget of 60 fails the same way, naming `googleLookupsReserve`.
4. **A backup of the dev database** before anything else: `docker exec -it pine-dev-mysql sh -c 'mysqldump --single-transaction -uroot -p <schema> > /tmp/before.sql'`, then `docker cp pine-dev-mysql:/tmp/before.sql var/stage/8w6/before.sql` (`-p` asks for the password, from Matt: one written after it would show in the process list; the dump is written inside the container, since the terminal that `-it` gives for the prompt would put the prompt and CR LF line ends into a file redirected on the host). Every count this run clears or seeds, and the import steps (23 to 28), come back to this one.

## The month and the budget, with a seeded day table

5. **Migration 032** runs at the start (the log names it): `GymLookup` has `regionRank`, and `WayspotLookup`, `WayspotPlaces`, `GymGoogleAsked` and `GoogleUseDay` exist. `GymLookupDay` keeps its rows. Matt stops the bot again as soon as the log has named the migration: the line starts asking at once.
6. **The Pacific day.** With the bot stopped, clear what was counted this month (the backup of step 4 has it) and seed `GoogleUseDay` for the current Pacific month (the 1st of the month in California, whatever the time in Pittsburgh):

   ```sql
   select day, gyms from GymLookupDay where day >= '<YYYY-MM>-01';   -- noted, then cleared
   delete from GymLookupDay where day >= '<YYYY-MM>-01';
   delete from GoogleUseDay;
   insert into GoogleUseDay (day, kind, questions) values
     ('<YYYY-MM>-01', 'places', 20), ('<YYYY-MM>-01', 'geocode', 5),
     ('<previous month>-28', 'places', 999);
   insert into GymLookupDay (day, gyms) values ('<YYYY-MM>-02', 7);
   ```

   Start the bot. `/gym google` (Googer) says "This month 27 of 60 places searches are used" (or a few more: the line has begun), "the line stops when 10 are left …", "5 of 20 addresses are used" (or a few more), and "The month starts again" with the 1st of next month at midnight Pacific (3:00 in Pittsburgh). The previous month's 999 is not counted; the old `GymLookupDay` row of this month is, as 7 places questions.
7. **The night of the 1st.** Only if the run falls on it: between midnight and 3:00 in Pittsburgh on the 1st it is still the last day of the month in California, and `/gym google` still names that month and its counts; from 3:00 Pittsburgh time the counts start from nothing.
8. **The line stops at the reserve.** With the bot running, `/gym google` again a few minutes later: the places searches climb by one every few seconds from the count of step 6 (log: the line's questions) until 50 of 60 are used, then stop. The log says nothing more of the line; `/gym google`'s counts stand still.
9. **A question by hand uses the reserve.** `/gym refresh gym:<any gym>`: answered as before; `/gym google` shows 51 of 60, and one more address. Ten more refreshes go past 60 (61 of 60): each is answered, and counted (`GoogleUseDay` of today).
10. **A gym added by hand** (`/gym add` at a free place in a region, then `/gym delete` it): it gets its address and places at once, counted; the line itself still asks nothing.
11. **A restart keeps the month.** Matt stops the bot (one Ctrl+C) and starts it again: `/gym google` shows the same counts, and the line does not start again (only the reserve is left).
12. **No busy timer while the month is used up.** Only while the reset is more than 25 days away (before the 6th in a 30-day month, the 7th in a 31-day month): only then does the wait lie beyond what a Node timer holds (24.8 days); later in the month the unit test covers it. With only the reserve left (step 11), watch for ten minutes: the log has nothing of the line, `GoogleUseDay` is unchanged, the bot's process is idle in Task Manager (no core busy), and MySQL's `show global status like 'Questions'` grows only by what other work asks.
13. **Addresses used up, places go on.** With the bot stopped: `update GoogleUseDay set questions = 20 where day = '<YYYY-MM>-01' and kind = 'geocode'` (with today's geocodes, at least 20 this month), and the budget raised to 80 (`googleLookupsPerMonth`). Start the bot: the line asks about gyms that wait for their places alone (`GymLookup.address = 0`; log, `gym` ids), never a geocode (the geocodes of `GoogleUseDay` stand still); the gyms with `address = 1` stay in `GymLookup`. `/gym google` says "20 of 20 addresses are used" (or more, from step 9).

## The order of the line

14. **The ranks.** In the dev database:

    ```sql
    select g.regionRank, count(*) from GymLookup g group by g.regionRank order by 1 desc;
    ```

    The ranks match the regions' raids of the last 90 days (`PartyHistory`, kinds `raid` and `max`), the busiest region at 1; gyms in no region at -1. With no history at all, every region at 1. A rank of -2 is a gym whose question failed, until the next day.
15. **The busiest region first.** The geocodes back as they were (`update GoogleUseDay set questions = 5 where day = '<YYYY-MM>-01' and kind = 'geocode'`), the budget raised by 20 over this month's places count (`googleLookupsPerMonth`, restart): the next gyms asked (log, `gym` ids) lie in the region of the highest rank, whatever their time in the line, until the count reaches the new budget less 10.
16. **Gyms before Wayspots.** `/gym google` names the PokéStops and Power Spots of this server that wait; `select kind, count(*) from WayspotLookup group by kind` has stops and power spots of the server's regions only (none of the Wayspots outside every region; none of kind gym). While gyms wait, no Wayspot is asked (log).
17. **The day's share.** The gyms out of the way for the step, so that Wayspots get turns: with the bot stopped, every gym that waits, and every gym without places (the Wayfarer gyms never asked, which a start would put in the line again), is marked as asked, and the line of gyms emptied (the backup of step 4 has them):

    ```sql
    insert ignore into GymGoogleAsked (gymId, askedAt)
      select g.id, 0 from Gym g left join GymMeta m on m.gymId = g.id where m.places is null;
    insert ignore into GymGoogleAsked (gymId, askedAt) select gymId, 0 from GymLookup;
    delete from GymLookup;
    ```

    Raise the budget to this month's places count plus 70. Today's share is (budget − 10 − places counted before today) ÷ days left in the month, with today; the places counted today already (steps 8 to 15) count against it, and by now the share is usually at or below today's count, so the line would ask none. So, with the bot still stopped, work the share out and set today's places to the share less 10 (`update GoogleUseDay set questions = <share − 10> where day = '<today>' and kind = 'places'`), then start the bot. After the start `GymLookup` is still empty; the line asks PokéStops, then Power Spots, about 10 of them, until today's places count reaches the share, then waits. The log says nothing more today. `WayspotPlaces` has a row per Wayspot asked, with its point and the names.
18. **Found by its businesses.** After a restart (the places are read at once at a start; otherwise within the hour), `/wild near:` with the name of a business of one of those rows (not in the stop's title): the stop is offered, after any stop or gym that has the word in its own name.
19. **A stop of Pine's own waits as a PokéStop.** `/pokestop add` a stop at a free place in a region (Googer): within seconds `select * from WayspotLookup where wayspotId like 'pine-%'` has `pine-<its id>` of kind `stop` (asked at once while today's share allows, then in `WayspotPlaces` under that id). `/pokestop remove` it afterwards: it leaves `WayspotLookup` and `WayspotPlaces` at once.
20. **A moved or changed Wayspot waits again.** In the dev database, move a Wayspot asked about by 50 m (`update Wayspot set lat = lat + 0.00045 where id = '<id>'`) and change another's kind to `powerspot`, then restart: both are in `WayspotLookup` again (the second as `powerspot`); one moved by 2 m is not.
21. **Gone Wayspots lose their places.** Mark a Wayspot asked about `kind = 'gone'`, restart: it leaves `WayspotLookup` and `WayspotPlaces`. Restore it afterwards (`kind` as before).
22. **Staff only.** Tester's slash menu offers no `/gym` (and so no `/gym google`); Tester's `/help` names neither `/gym` nor `/gym google`.

## A first import in blocks

23. **A database before the first import.** Restore the snapshot of the dev database from before the Wayfarer import of 2026-10-18 (`var/stage/TEST-SERVER-STATE.md` names it; `./pine restore` is not used here, the dump is loaded into `pine-dev-mysql` by hand), then start the bot: migrations 031 and 032 run on it too.
24. **The preview** of the Pittsburgh export (the file of the 2026-10-18 scan, `var/stage/`): `/gym import` as before; note the number of gyms it would add (about 2,600 on a takeover, about 5,300 on the test server's gyms).
25. **Import.** Press Import and time it from the press to the outcome:
    - the outcome's counts are the preview's; the log has a line per block (`a block of Wayfarer gyms was added`, with `block` 1 to `blocks`, and its gyms `added`, `held` and `failed`), `a gym was added` per gym, and no `a block of gyms failed`;
    - the gym admin lock is held for seconds, not minutes: `/gym show gym:<any>` used right after the press waits only until the outcome;
    - one summary post in bot updates, as before.
26. **The nearest gyms are right.** In the dev database, for a sample of 20 added gyms, the stored `GymMeta.nearestGym` is the nearest gym by distance (a query of the step's notes in `var/stage/8w6/`), and the gyms whose nearest gym is a new one wait in `GymLookup` for their places.
27. **The line after the import.** `/gym google`: the added gyms wait (those with Wayfarer's address for their places only, `address = 0`), the busiest regions first; the estimate names when this server's gyms will be done at the stage budget (months, at 60 a month) and at the production budget (`googleLookupsPerMonth` 4,500: within weeks).
28. **Back.** Stop the bot and load `var/stage/8w6/before.sql` (step 4) again.

## After

29. Note the results in the follow-ups file, under "From the staging run of 8W-6", and set the stage budget in `var/stage/settings.json` to the small one the dev instance keeps for good: `"googleLookupsPerMonth": 100`, `"googleLookupsReserve": 50`, `"googleGeocodesPerMonth": 50`. Not the defaults: Google counts its free amounts per billing account, not per key, so a dev key that bills to production's account spends production's free amounts.
