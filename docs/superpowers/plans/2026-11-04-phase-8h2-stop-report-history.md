# Phase 8H-2: The History of Reports at Stops: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every field research and Team GO Rocket report that ends is kept as a record in `StopReportHistory`, from the cutover on, so that the boards and a member's own stats (Parts D and E of the history design) have data. This is Part A of the design without its reach counts and `WantCountDay`, which are plan 8H-3.

- **Task 1, migration 036:**
  - the table `StopReportHistory`;
  - on `StopReport`, the stop's S2 cell (level 14), its region ids and the members who confirmed it;
  - `PINE_TABLES` gains the new table.
- **Task 2, the endings in the domain:** a pure module, `src/domain/stops/report-history.ts`.
  - It maps `decideResearch` / `decideRocket` outcomes and take-backs to the nine endings.
  - It covers each row a save deletes, confirmations once per member and never the reporter, and the detail through `withoutMembers`.
- **Task 3, the repository:**
  - `saveUnless` records what it deletes in its own transaction, behind a savepoint. When the savepoint is lost, the save runs again without records, or whole on a deadlock.
  - `remove` takes a reason.
  - The hourly sweep records ended rows before deleting them: in batches, at read committed, row by row after a failure, giving up after 5 failures in a row.
  - `restore` forgets the hideout's record, outside the savepoint.
- **Task 4, the service and its callers:**
  - The cell, and the regions from `RegionDirectory` through `regionsAtPoint`, are fixed when a report is made.
  - `takeBack(serverId, refs, by, as)` serves every caller.
  - `RocketService` ends unposted grunts and overtaken ones as `unposted`.
- **Task 5, the opt-out:**
  - It nulls `reporterId` in the member's records of the server and counts them.
  - `/settings history` and its help say reports at stops are kept too.
- **Task 6, docs:** `history.md`, `stop-reports.md`, `testing.md`.

**Tech stack:** TypeScript 6.0, Node 26, discord.js 14, Kysely, Vitest. No new dependency. Migration 036 (additive). No command option changed, so no deploy is needed.

**Spec:** `docs/superpowers/specs/2026-11-04-history-on-show-design.md` (rules and Part A; approved by Matt 2026-11-04), and the brief `.superpowers/sdd/8h-2-stop-report-history/brief.md` (git-ignored). Matt approved the brief's own decisions on 2026-11-04:
- the cell and regions are fixed on the live row;
- confirmers are counted once each;
- the sweep reads in TypeScript, through `withoutMembers`;
- the history keeps no place or name columns.

**Every diff in this plan was run before the plan was written.** They were made on the throwaway branch `proto-8h2`, one commit per task, on main-dev `7c9fe97c`. Each commit typechecks and passes its tests. On the tip, the full check, the build and the database suite pass.

**Reviews:**

- **The prototype:** an Opus reviewer raised P1–P8. The Important ones were P1 (a lost savepoint replaced the error, so a deadlock was not retried and the report failed) and P2 (regions came from a second implementation). The Minor ones were the restore double count, a restored hideout's place, `endedAs` overwriting `refined`, the sweep's locks, one bad row blocking the sweep, and tests. All were fixed in fix round 1. The database suite also found `PINE_TABLES` missing the new table.
- **The fix round:** an Opus re-review found it ready, with R1–R3 Minor (a stale comment, error lines per row, a staff test Discord cannot deliver), fixed in fix round 2. Both rounds are folded into the six commits. The branch was then rebased onto main-dev `7c9fe97c`, and the migration renumbered 036.

**Conventions:** read `CLAUDE.md` and `docs/architecture/history.md`, `stop-reports.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck and its own test files. The full check, the build and the database suite run once on the tip. Work in `var/wt-8h2` on `stop-report-history`; never commit in the main checkout.

## Review Focus

- Each ending of the table in the design, for each path that deletes a report (tasks 2–4).
- Nothing counted twice or lost: the savepoint, the re-run without records, the sweep's batches, restore (task 3).
- Privacy: `reporterId` only with the opt-in, read under a shared lock; the opt-out covers the records; no stop or name columns (tasks 1, 3, 5).

## Tasks

The task briefs, each with its prototype commit and full diff, are `.superpowers/sdd/8h-2-stop-report-history/task-<n>-brief.md`:

| Task | Prototype commit | Title |
|---|---|---|
| 1 | `3af03624` | 8H-2 task 1: migration 036 and its types |
| 2 | `22255106` | 8H-2 task 2: how a report ends, in the domain |
| 3 | `7dd65426` | 8H-2 task 3: the repository records what ends |
| 4 | `9c1a3b99` | 8H-2 task 4: the service fixes places and says how reports end |
| 5 | `0083010c` | 8H-2 task 5: the opt-out takes reports along, and says records |
| 6 | `ce969cb5` | 8H-2 task 6: the docs |

After task 6, `git diff <prototype tip> HEAD -- src test` is empty. Then run, one at a time, judging each by its exit status:
- `npm run check`;
- `npm run build`;
- `npm run test:db`.

## Staging

Nothing here is visible on Discord or the web, so it has no staging of its own. The check is made on the Air's dev stack after the next update:
1. `./pine migrate` reaches 036.
2. A research report taken back, and a grunt left to end, each leave one `StopReportHistory` row after the hourly sweep: `withdrawn` and `stood`.
3. A tester with `/settings history` on shows their id; one without shows null.
