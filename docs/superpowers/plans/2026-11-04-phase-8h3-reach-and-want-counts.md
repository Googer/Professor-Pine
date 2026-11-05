# Phase 8H-3: Reach and Want Counts: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the rest of Part A of the history design, from the cutover on. It records how many members each piece of news was sent to (reach), and a daily count of wants per target. Parts D and E (boards of things, `/stats`) need both, and every day not recorded is lost.

- **Task 1, migration 037:**
  - `PartyHistory.reached`, `StopReport.reach` and `StopReportHistory.reach`;
  - the table `WantCountDay` (`serverId`, `day`, `target`, `count`; no member);
  - `PINE_TABLES` gains it. Migration 036's column test leaves out later columns.
- **Task 2, reach in the notifier:** `NotifyService.deliver` hands a `ReachRecorder` the members it queued, after each batch of 99.
  - **Distinct members:** a member counts once per party while the notifier remembers it, across a move too. They count once per research or Rocket news across its region channels.
  - **News only:** raids reported or changed or moved, max battles, new trains, research and Rocket. Meeting-time and start-time DMs to attendees never count, and neither do spawns.
  - **Failures:** a failure is logged as `{ err, of, members }` and never stops a DM.
- **Task 3, reach recorded** (`ReachRecords`, `src/services/reach.ts`):
  - **Parties:** a `PartyHistoryStep` of kind `reach`, inserted only while the `Party` row exists. It is summed over the lineage into `PartyHistory.reached` by `historyOfParty`; legacy imports are 0.
  - **Research and Rocket:** `reach = reach + n` on the report's version (`id`, `madeAt`), never changing `madeAt`. Research counts go to the news' first report. The count is copied into `StopReportHistory.reach`.
- **Task 4, want counts:**
  - **Keys:** `src/domain/notify/want-keys.ts` gives one key per want of every kind: Pokémon (`pokemon:25@raid`), tier, IV, the target-want tokens, `gym:<id>` and `trains`. It adds `species:<dex>`, counting each member once over all their wants of that species, for the most-wanted board.
  - **The count:** `WantCountService` counts the day before each local midnight it waited for, and also the day before now when a timer fires late. At start it catches up the day before.
  - **The write:** each server's day is written in one transaction, and a day already counted for a server is skipped.
  - **Shutdown:** it waits for a count that is running.
- **Task 5, docs:** `history.md`, `notifications-and-dms.md`, `testing.md`.

**Tech stack:** TypeScript 6.0, Node 26, discord.js 14, Kysely, Vitest. No new dependency. Migration 037 (additive). No command option changed, so no deploy is needed.

**Spec:** `docs/superpowers/specs/2026-11-04-history-on-show-design.md` (Part A's "Want counts" and "Reach (Q3)", Part D's "Boards of things"; approved by Matt 2026-11-04), and the brief `.superpowers/sdd/8h-3-reach-and-want-counts/brief.md` (git-ignored). Matt approved the brief on 2026-11-04 and wants every kind of want counted, to keep later uses open.

**Every diff in this plan was run before the plan was written.** They were made on the throwaway branch `proto-8h3`, one commit per task, on main-dev `4647148b`. Each commit typechecks and passes its tests. On the tip, the full check (12,008), the build and the database suite (673) pass.

**Reviews:**

- **The prototype:**
  - **Prototyper's correction:** summing each run's DM count would count a member twice when they are told again for a new reason, so reach counts distinct members.
  - **Opus review, P1–P7:** P1 was Important: want keys alone could not give a "most wanted species" board, so `species:<dex>` was added. The six Minor ones were:
    - a day written only in part;
    - shutdown not waiting for a count;
    - a run cut short by the party's end losing its count, now handed over per batch;
    - research over two channels left untested;
    - the day taken from the wall clock;
    - a log's context.
  - All were fixed in fix round 1.
- **The fix round:** the re-review found it ready, with R1 Minor: a timer late past a second midnight lost a day. Fixed in round 2. Both rounds are folded into the five commits.

**Conventions:** read `CLAUDE.md` and `docs/architecture/history.md`, `notifications-and-dms.md`, `stop-reports.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck and its own test files. The full check, the build and the database suite run once on the tip. Work in `var/wt-8h3` on `reach-and-want-counts`; never commit in the main checkout.

## Review Focus

- Reach: each member counted once per party or news; time DMs and spawns never; a count that arrives after the record is lost, never a failed record (tasks 2 and 3).
- Want counts: every kind, distinct members, `species:` across tables, no member stored; the day named right at midnight, late and at start; all or nothing per server (task 4).

## Tasks

The task briefs, each with its prototype commit and full diff, are `.superpowers/sdd/8h-3-reach-and-want-counts/task-<n>-brief.md`:

| Task | Prototype commit | Title |
|---|---|---|
| 1 | `3fee0ce5` | 8H-3 task 1: migration 037 and its types |
| 2 | `32e3ee54` | 8H-3 task 2: reach in the notifier |
| 3 | `c8f16aa1` | 8H-3 task 3: reach recorded |
| 4 | `c397655c` | 8H-3 task 4: want counts |
| 5 | `e3c17037` | 8H-3 task 5: the docs |

After task 5, `git diff <prototype tip> HEAD -- src test` is empty. Then run, one at a time, judging each by its exit status:
- `npm run check`;
- `npm run build`;
- `npm run test:db`.

## Staging

Nothing here shows on Discord or the web, so it has no staging of its own. The check is made on the Air's dev stack after the next update:
1. `./pine migrate` reaches 037.
2. A raid reported for a boss two testers want: the party's record after it ends has `reached` 2 (one tester reporting: 1).
3. A research report a tester wants: after the hourly sweep, its `StopReportHistory` row has `reach` 1.
4. The morning after a midnight with the bot up, `WantCountDay` has the day's rows, with `species:<dex>` beside each tester's wants; a restart that day adds nothing.
