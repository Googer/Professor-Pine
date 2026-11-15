# Index Fixes of the Queries Added Since 2.0.0: Implementation Plan

**Goal:** Matt, 2026-11-13: every query is served by an index (CLAUDE.md, Data), as the index audit before 2.0.0 (plan 8Z-2, migration 050) made it for the queries up to then. An Opus audit read every query added or changed since (plans 7M, 8G, 19D, 19A-1, 19A-2, 19B-1; migrations 051–055; 19B-2's were checked in its own reviews) and found five findings; this plan fixes them. Matt ruled the one the rule did not settle (the look before `/operator forget` counting what a removal leaves): "Index them".

- **Task 1, indexes that begin with the member (X10, X11):** migration 057 adds 35 indexes, each made only where missing: by the member on the tables a removal and its look read (reasons, meetup requests, appeals, place asks and blocks, the history's switches and reports, new-train notices, Unown gifts, live stop reports and their confirmations, access grants, the settings log), by the staff member on every table the look counts their acts in, and on the JSON the look reads (`PartyAudit`'s conductor ids and `ModerationReport`'s subject ids as functional indexes, `StopReport.confirmedBy` as a multi-valued one). The look's counts read each column through its own index and add them up, a row counted once; `loggedMember.id` is bounded to 30 characters, as the JSON indexes require. Explain tests check every read's key and that none walks a table or an index whole.
- **Task 2, a zone's want count reads only its servers' wants (X12):** since plan 19A-2 the daily count runs once per zone in use; it now asks only for that zone's servers not counted yet, through each table's server-leading key.
- **Task 3, the settings log's reads checked by explain; whole reads said (X13, X14).**

**Tech stack:** TypeScript 6.0, Kysely, MySQL 9.7, Vitest.

**Brief:** `.superpowers/sdd/index-fixes/brief.md`, `brief-x11.md`, the audit `audit.md`, the rounds `fix-round-3.md` there; ledger `.superpowers/sdd/19b-separation/progress.md`.

**How it was built.** Prototyped on `index-fixes` from main-dev 5e61847ef (X10, X12–X14), then X11 on Matt's ruling; an Opus review (ready after fixes: production safety checked against MySQL 9.7 directly: every write path stores values the JSON indexes accept, the five JSON indexes build in place with a shared lock, before the bot logs in; 3 Minor), folded; rebased onto 19B-2 (migration 057 after 056). The reviewed commits are the plan's commits.

| Task | Commit | Title |
|---|---|---|
| 1 | `e2aa4942f` | Index fixes 1: indexes that begin with the member for the removal and its look |
| 2 | `1798c9014` | Index fixes 2: a zone's want count reads only its servers' wants |
| 3 | `527ef6525` | Index fixes 3: the settings log's reads checked by explain, whole reads said |

On the tip: `npm run check`, `npm run build`, `npm run test:db`, one at a time, each judged by its exit status.

## What staff and members will notice

Nothing, but `./pine update` runs migration 057 before the bot logs in: 35 indexes, seconds on Pittsburgh's tables.

## Staging

On the Air's dev stack after `./pine update`: the log shows migration 057 applied; `/operator forget member:` on a test account shows the look as before.
