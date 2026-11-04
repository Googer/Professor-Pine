# Showing Pine's history (design sketch)

Status: draft, 2026-11-04. A brainstorm with Matt in one session. Nothing is built yet; each part below becomes a plan of its own. Part A comes before the cutover (Matt, 2026-11-04); the rest may follow in any order.

Background: what the party history keeps is `docs/architecture/history.md`; reports at stops are `docs/architecture/stop-reports.md`; the web map is `docs/architecture/web.md`.

## What Pine keeps today

- **For good:** every ended party in `PartyHistory` and its tables: raids, max battles, meetups and trains. Each record has:
  - where it was: the gym, the Power Spot's Wayspot, the region;
  - what it was: the boss, tier and flags;
  - when it happened, and how it ended;
  - counts by the furthest status reached;
  - an attendee row per member, with that member's times, team and group;
  - for a train, its stops in order, with times.
  - Member ids are kept only with the opt-in (`/settings history`). The `anonymous` flag of a raid must be honored by anything shown to others.
- **The legacy import:** about 253,000 Pittsburgh parties from 2018 to 2026. They have gyms and bosses, but no members, no attendee times and no train timings.
- **Briefly:** field research and Team GO Rocket reports (`StopReport`) are deleted by the hourly sweep once their period or grunt ends. Spawn reports are given up a day after. No history of either exists.
- **Not at all:** when a want was added or changed, DMs sent, map visits, screenshot reads.

## Rules for every part

1. **Places are counted by parties, never by people.** A heatmap or a count at a gym is of parties. Nothing shown to anyone but the member themselves places a member: no member's gyms, stops or map.
2. **A member's own view shows places only as regions** ("your busiest region"), so that a shared screenshot gives away no home or commute.
3. **Only what other members confirm is ranked.** A self-reported "raids completed" cannot be checked, so it is never on a board. It may be in a member's own private stats.
4. **Names** go through `memberName` / `memberText`, never a bare mention. A member without the opt-in is never named; an `anonymous` raid counts toward no board, only in the reporter's own stats.
5. **Legacy records serve counts only** (no member ids), as `history.md` says.

## Part A: recording reports at stops (before the cutover)

Every report at a stop that ends is kept as a history record, so that Parts D and E have data from the cutover on. Every day not recorded is lost.

- **A new table, `StopReportHistory`** (additive migration): one row per report version that ends. Its columns:
  - `serverId`, `kind` (`research` / `rocket`), `periodKey`;
  - the subject: `subjectKey`, the task's key and text and the rewards as the report kept them, the Rocket key;
  - the S2 cell of level 14 its stop lies in (about 600 m across; Q1), not the stop itself: fine enough for a map of where reports come from, coarse enough not to be a doorstep. Level 15 (about 300 m, a block or two) was turned down as too fine. A cell is shown only in counts of the whole server, with the heatmap's minimum of three, never per member (rule 1). Built with `@pine/wayspot-core`'s S2 module;
  - the `Region.id`s its stop lies in, as `PartyHistory.regionId` keeps them. They are fixed when the report is made: an additive column on `StopReport`, filled from the regions the service works out already (`RocketService.channelsAt`, research's `changed`), copied at the end. A report in two regions counts once in each region's board and once in a member's own total (review H9);
  - `madeAt`, `endsAt`, `endedAt`;
  - `reporterId`, only with the reporter's history opt-in, else null. No name column (review H12);
  - a typed task's text through `withoutMembers`, as the party history keeps member text (review H12);
  - `confirmations`: how many other members met this very version with a report of their own ("Already reported", a "one of" over it, a reward that narrowed it), counted on the `keep` and `narrow` paths under the same lock (review H6; see Q4);
  - `ending` (below).
- **Endings**, decided by the domain, not the repository (review H1): `decide` returns its verdict with the ending, and a pure function maps `decideResearch` / `decideRocket` outcomes to endings.

  | Ending | When | Part D |
  |---|---|---|
  | `stood` | it lasted to its end; also any row whose `endsAt` had passed when another report deleted it (review H3), with `endedAt = endsAt` | counts |
  | `narrowed` | a reward replaced its "one of" | counts, for the first reporter |
  | `refined` | a grunt refined in place: the version as it was before the update, `endedAt` the refine's time; the refined version is a record of its new reporter (review H15) | counts |
  | `corrected` | the reporter replaced their own report (review H2) | neutral |
  | `contradicted` | another member ticked it in "Replace field research?" (review H2) | against |
  | `churned` | Rocket's normal turnover: grunt over grunt, hideout over anything (review H5) | counts as reported |
  | `withdrawn` | the reporter took it back (`gone.reporter.id === by`, review H8) | neutral |
  | `staff` | staff took back somebody else's | against |
  | `unposted` | `RocketService` took back a grunt posted nowhere, or one `overtaken` (review H4) | nothing |

  `takeBack` and `remove` take a reason, since the `staff` flag alone is wrong (review H8). `restore` deletes the history row of the hideout it puts back (rows keep the `StopReport` id), so a hideout is never counted twice (review H4). No `cutover` ending: stop reports are new with Pine, and survive a restart (review H7).
- **Where it is written:**
  - **The sweep:** in one transaction, an `INSERT … SELECT` of the ended rows joined to `HistoryOptIn` (read under a shared lock, as party records read it), then the delete. Copied raw, so an unreadable row is kept too; when the insert fails nothing is deleted, and the next hour tries again (review H10).
  - **`takeBack`, a replacement or a refine in `saveUnless`:** in the same transaction, behind a savepoint. A history row that fails is logged and lost; the member's report stands (review H11).
- **Rehearsal mode:** writes to its database copy like everything else.
- **The opt-in** is extended to these rows, as to the party history. Opting out takes the member's id out of their `StopReportHistory` rows too (an index on `serverId, reporterId`), and the answer's count includes them (review H14).
- **The opt-in starts empty** (review H13): from the cutover, `reporterId` is null for everyone who has not opted in. Counts by region and by task start at once; Parts D and E start empty for each member until they opt in (Q5).
- **Want counts:** a daily count of wants per target (`WantCountDay`, Part D), no member.
- **Reach (Q3):** "sent to N members", counted where the notifier queues DMs. For a party, a `PartyHistoryStep` of kind `reach`, summed into its record (no `Party` write). For research, one DM covers several stops' reports, so the count goes to the news' first report (review H16). Queued, not delivered, so the words are "sent to".

## Part B: the activity heatmap on the web map

A layer of the map, for members only like every other layer but Gyms and Region outlines: where raids happen, by gym and Power Spot.

- **What it weighs:** raids and max battles reported, whatever their ending but `cancelled` and `failed` (review H17): a legacy raid nobody marked complete is `unknown`, so "completed" would empty the legacy years. One pure domain function says what counts, for B, C and G alike.
- **Sparse places** (review H19): a place is drawn only with at least three parties in the mode's window, so a quiet gym at 6 AM on Tuesdays does not trace one person's habit. Places in a forum the member is barred from (`memberAccess`) are left out, as the party layer leaves them out. Gyms and Power Spots are drawn as a heat layer (a Leaflet heat plugin, or circles sized by weight; the plan chooses).
- **Expected now** (the default mode):
  - Matt, 2026-11-04: weekday and time of day both matter.
  - It opens on today's weekday and the hours around now. Presets sit beside it: weekday evenings, weekend afternoons.
  - Older years count less but not nothing: a one-year half-life is the default, so last year counts half, five years back about 3%, and 2019 under 1%.
- **History mode:** a year or month slider back to 2018, with a play button that steps through it.
  - Parties at gyms the gym list no longer has are not drawn: the legacy file names the gym, not its place. The layer says how many it left out.
- **The data:**
  - A summary, `ActivityBucket`, per server, place (gym or Wayspot), local year-month, weekday and hour: raids, max battles, completed, heads.
  - It is derived and can be rebuilt: rebuilt in full by a script, and brought up to date hourly, never in a record's transaction (review H20).
  - A max battle at a pin has no Wayspot and is not drawn; the layer counts it among those left out.
  - The route gives a mode's weights per place, worked out on the server.
  - One domain function computes the weights (`src/domain/`) for every caller.

## Part C: the region board

Raids and max battles that took place, per region, over a chosen period (this month, this year, all time), legacy included. Nobody is named, so it needs no opt-in.

- On the web: a page of server stats (below, "The history page").
- On Discord: `/stats regions`.

## Part D: the contribution board

Members who opted in, ranked by what other members confirm (rule 3; Matt, 2026-11-04):

- raids they reported that others completed: attendees who reached done, not counting the reporter;
- trains they conducted, and meetups they hosted, that others came to;
- field research and Rocket reports that counted (Part A).

Shown as a few separate boards rather than one score. Periods are a month, a year and all time; live records only, since the legacy history has no members. A member appears on it only with a switch of its own, `/settings leaderboard`, off by default and per server (Q2); the history opt-in alone keeps their records but ranks them nowhere. Rule 4's "never named" means: not without this switch.

**Boards of things, not people** (Matt, Q3): the most wanted Pokémon (from the wants as they stand, counts only, no names), the bosses whose raids were sent to the most members, the most reported tasks of an event. Wants keep no history, so a trend of the most wanted needs a daily count per target (an additive table, `WantCountDay`: server, day, target, count; no member), recorded from Part A on.

## Part E: a member's own stats and year in review

- **`/stats me [year:]`:** answered privately (components v2). It shows the member's contribution counts and their own completions (rule 3 allows them here), with their busiest region and the bosses they did most.
  - It also shows reach, if Part A records it: "your reports reached 37 members".
  - A **Share** button posts the same card in the channel, the member named by `memberName`. Nothing is posted unless the member presses it. The card is computed again at the press; only its owner may press it; where the bot may not send there, the answer says so (review H21).
  - Without the opt-in it says how to opt in and what would be counted from then on.
- **On the web:** a "Your Pine" page with the same numbers and a chart per month.
- **The year in review** is the same view for a calendar year in `settings.timezone`. Pine posts nothing about it by itself.

## Part F: the train's summary card

When a train ends, its post (and its record on the web) gets a summary:

- about how many stops, in how long ("About 14 stops in 1 h 40 min"), marked as approximate: a stop can be made in the game without the train being moved in Pine;
- the regions crossed, in order;
- riders: how many came, and the most at once;
- raids along the way: raid records at its stops' gyms while the train was there, by tier. A stop without times (the first, when laid earlier) is left out of this.
- It is drawn from the record as written in the ending transaction, the one path (review H22).
- Its route is drawn as a still line on the map's history view, not replayed (Matt: the data is too noisy for a replay).

Legacy trains get their route only.

## Part G: big days and the history page

- **Big days:** each server's standout local days of each year, ranked by raids far above the days around them (one pure function with a fixed rule, for example a z-score against the 14 days on each side, so that the page and the post agree; review H23), each led by its top boss.
  - Examples Matt names: the legendary raid days of the birds and the beasts, the EX raid waves, the early Raid Hours such as Mewtwo's of 2019-10-08.
  - Labels come from the history's bosses ("a Mewtwo day"), since the events feed does not go back that far.
- **"On this day":** when a big day comes round again, a short post in the events forum, archived after a day: "Six years ago today: 180 Mewtwo raids in one evening." Only the top three days of each year (a setting), never a daily post.
- **The history page** `/s/<guild>/history` (members only):
  - raids per day since 2018, with the big days labeled;
  - each boss's trend (search a boss);
  - the region board (Part C), the contribution boards (Part D), and a link to the heatmap's history mode.
  - Charts are drawn by the page from numbers the server computed.

## Left out, and why

- **Research and Rocket patterns by stop:** in the game a stop's task changes every day and grunts appear anywhere, so a map of them shows where reporters walk, not where tasks are. That is rule 1 and rule 2 broken for little gain. Server-wide counts with no place (the most reported tasks of an event, the leaders reported in a week) fit Part G instead.
- **A "raids completed" board:** honor system, easily gamed (rule 3).
- **A train replay:** noisy data (Part F).
- **Spawn history, wants over time:** not kept; nothing here needs them.

## Order

A first, before the cutover. Then B (the most useful for members), then C, D and E together (one set of counts), then F and G. Each part is a plan of its own, prototyped and reviewed as usual.

## Part H: filling in a member's legacy history (idea, open)

Matt, 2026-11-04: a member who opts in might have their legacy parties filled in with their id. The import keeps no member ids (Matt, 2026-10-16), so this means reading the legacy `parties/` files again for that one member: each legacy record is found by its `legacyKey` and its attendees by `seq` (the import wrote them in the files' order), and the member's id is set where the file names them, as reporter, conductor or attendee. Only for a member who asks, and an opt-out takes it out again as for live rows. The files hold no times, so this fills in counts (parties, bosses, regions, years) and none of the confirmations Part D ranks by. Where the files are kept for this: Q6.

## Answers (Matt, 2026-11-04)

- **Q1. A report's place:** an S2 cell, which Matt suggested at level 14 or 15; level 14 taken (Part A), since level 15 is a block or two.
- **Q2. Boards:** a separate switch, `/settings leaderboard`.
- **Q3. Reach:** recorded; boards of things as well as of people (Part D).
- **Q4. Research that stood:** counts, with its confirmations shown beside it.
- **Q5. Asking to opt in:** one line in the cutover announcement and in the Discord tutorial; no DM.

## Open questions

- **Q6. Where the legacy files live for Part H.** Recommended: a read-only copy of `parties/` on the Air beside the stack, mounted into the bot's container, read only when a member asks. Not a table of every legacy member's id in the database, which would keep the ids of members who never opted in.

A fresh reviewer read the draft (findings H1–H23); the defaults it raised are folded in above, marked by their numbers.
