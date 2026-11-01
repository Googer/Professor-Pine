# 8W-6: the Google line as a priority queue with a monthly budget, a first import's gyms in blocks

Status: approved by Matt 2026-10-25 (relayed by the cutover session: build it before the cutover), builder-checked, from Matt's rulings of 2026-10-18 (follow-ups, "From the staging run of 8W") and 2026-10-20.

## Why

After Pittsburgh's first Wayfarer import (2026-10-18) the line of gyms waiting for Google held 5,316 gyms; at `googleLookupsPerDay` 100 that is about 53 days, and no PokéStop or power spot is ever asked of Google, so a member who searches a stop by a nearby business name (as gyms can be found) finds nothing. Google's free amounts are monthly (Places Nearby Search Pro 5,000 a month, Geocoding 10,000), so a daily cap wastes most of them. And the import added its 5,294 gyms one at a time, about 60 ms each with their upkeep, holding the gym admin lock (and `/gym`) for about five minutes.

## Goals

1. **One line for gyms and Wayspots.** PokéStops and power spots join the line; their Google places become search names, as a gym's are (weighted as a gym's `places`).
2. **Priority:** kind first (gyms, then PokéStops, then power spots), then the place's region rank, then the time it was queued. (Matt, 2026-10-20: kind before region, since gyms are caught up within weeks.)
3. **Region rank from activity:** a region ranks by its share of its own server's raids over the last 90 days, from the party history (`PartyHistory.regionId`, kind raid; max battles count as raids here, Claude's call), so each server's busiest region stands level with every other server's busiest (Matt, 2026-10-20: within each server, so a quiet server is not starved). A place in several regions takes its best-ranked region. A place in no region of any server is not queued (Wayspots) or ranks last (gyms). On an instance with no history every region ranks the same, and the order is kind, then queued time. No manual setting (Matt: the activity is good enough).
4. **A monthly budget.** `googleLookupsPerMonth` (default 4,500) replaces `googleLookupsPerDay`. The month starts on the 1st at midnight Pacific time (`America/Los_Angeles`, when Google's free amounts reset), whatever `settings.timezone` is. Every places question counts, inside the line or not (a gym an admin adds or moves, `/gym refresh`). A reserve (default 500, `googleLookupsReserve`) is kept for the questions outside the line: the line stops when only the reserve is left; questions outside it may use the reserve, and go on (counted) past the budget, since an admin asked.
5. **Pacing:** gyms may use all of the month that is left above the reserve at once (one every few seconds, as today). PokéStops and power spots are paced evenly: on each day at most (what is left above the reserve) ÷ (days left in the month, today included).
6. **Addresses:** Geocoding is asked only for a gym without an address (the import takes Wayfarer's), always with its places; it is counted apart (`googleGeocodesPerMonth`, default 9,000) and never asked for a Wayspot.
7. **`/gym google`** (staff, private answer): this server's gyms waiting, the PokéStops and power spots in its regions waiting, this month's places questions used of the budget and the reserve, the next reset, and at the current pace when this server's gyms will be done and when everything of this server will be. The line and budget are the instance's (one Google key); the counts are this server's share.
8. **A first import's gyms in blocks.** The import adds its new gyms in blocks of 250, each block one transaction with its upkeep once per block (the directory, the nearest gyms, the line), not per gym. The rest of the import (matches, the review queue, the Wayspots in one transaction, the one summary post in bot updates) is unchanged.

## Non-goals

- No change to what one question asks Google or how its answer is written (a gym's `geodata` and `places`).
- No manual region priority; no per-server budget.
- The import's preview texts (doubled plurals, thousands separators, "(not-xml)") and `/find-gym`'s stray matches are a separate small fix (its own session card), not this plan.
- Nothing about the Wayspot export tool.

## Anti-goals

- Spending past Google's free amounts without an admin asking.
- A restart losing the month's count or the line's order.
- An import that half-adds a block: a block is all or nothing, and a gym that cannot be added (too near another, outside every region) is reported as today without failing its block.

## Constraints

- Database changes additive only: the next migration is 031 (029 and 030 came with max battles and reports at stops). `GymLookup` and `GymLookupDay` stay readable (old rows are taken over); new tables or columns for Wayspots in the line, the monthly counts and the region rank as needed.
- `googleLookupsPerDay` is removed outright (Matt, 2026-10-20: no release has had it); a settings file that still names it is treated as any unknown key is.
- A Wayspot's Google places are kept apart from the Wayfarer import's writes: the import's `lastSeen`-guarded upsert must not clear them, and a Wayspot whose position changes waits in the line again.
- `src/domain/` stays pure; the ranking and pacing arithmetic go there, tested with fake clocks.
- The import's nearest-gym upkeep today scans every gym for each added gym (O(n²) for a city); a block must compute the nearest gyms once for the block. Gyms within one block must still be checked against each other (too near), as the one-by-one path does through the directory.

## Decided by Claude (Matt to check)

- 90 days of raids for the rank; the rank recomputed once a day and at start, not per question.
- Blocks of 250; `googleLookupsReserve` 500; `googleGeocodesPerMonth` 9,000 (the free 10,000 less a margin).
- `/gym google` under `/gym` (the line is the gyms' upkeep); its pace estimate from the budget left and the waiting counts, not from measured speed.
- A Wayspot outside every region of every server is never queued.

## Settled after the builder check (Claude's calls)

- **Geocoding by hand:** a gym added or moved by hand, and `/gym refresh`, still geocode at once (as today); those count against the geocode budget too. Goal 6's "only for a gym without an address" is about the line.
- **The month already begun:** the counts are kept per Pacific day and kind (places, geocode); a month is the sum of its days, and the day rows serve the pacing. The old `GymLookupDay` rows of the current month are read as places questions (one per gym, close enough); later months use the new rows only.
- **A Wayspot's radius:** half the way to the nearest gym, PokéStop or power spot (between 25 and 500 m, as `placesRadius`), so stops in a row each get their own businesses.
- **A Wayspot's places** live in a table of their own keyed by the Wayspot id, with the point they were asked at; the import's upsert is not touched. A Wayspot whose point changed by more than a few meters, or whose kind changed (stop to power spot), is queued again under its new kind. One that became a gym, was found gone or is of kind `gym` leaves the line and its places are dropped (a new Pine gym queues itself).
- **The search** takes a Wayspot's new places at a rebuild of the Wayspot index, at most once an hour while answers arrive (a rebuild takes about half a second for a city), never once per answer; `WayspotIndex` gets a `places` field at weight 0.5.
- **Spacing within a day:** the usual turn every few seconds until the day's share of stops and power spots is used.
- **Geocoding refused or used up:** gyms that wait for an address wait; gyms for places only, then Wayspots, go on.
- **What counts:** a question that reached Google (`denied` and `no-key` do not count; a failure does), as today.
- **Blocks:** the import keeps the gym admin lock across all blocks (the blocks shorten it). A block is one transaction (the gym rows and the nearest-gym writes); the directory and the upkeep are updated after its commit. A block that fails is added again gym by gym, so one bad gym fails alone. Gyms too near each other within a block are found by a check over the block's planned list before the insert.
- **`/gym google`'s estimate:** the instance's line simulated in priority order against this month's remaining budget and the next months' budgets; it reports where this server's last gym and last item fall. Without a Google key it says so.
- **Settings checks:** the reserve below the budget; every budget at least 0.
- **Stops of Pine's own** (`/pokestop`, the sponsored stops of plan 8R-1) join the line as PokéStops, by the same rules.
- **Migration 031:** first merge wins; the other branch renumbers.

## Left to the builder

The schema (one line table with a kind column, or a second table), how the rank is held (a column refreshed daily, or computed in the `next` query), how a block reports per-gym outcomes (savepoints, or a retry one by one after a failed block), and the exact wording of `/gym google`.
