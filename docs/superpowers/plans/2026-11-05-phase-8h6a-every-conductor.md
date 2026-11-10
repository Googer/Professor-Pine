# Phase 8H-6A: Every Conductor Recorded: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a train's record credits every member who led it, for Part D's "trains conducted" board (plan 8H-6). Until now `PartyHistory.conductorId` held only the conductor at the end, and a conductor who presses Done stops being it, so most trains credited nobody. Matt (2026-11-05): record every conductor from now on, before the cutover, since every train ended without it has lost its credit for good.

- **Task 1, the steps:** `partySteps` notes `conduct` when a write leaves a train with a new conductor and `unlead` when the conductor before it is no longer it (cleared, taken over, left, Done, split off). Both are member steps. Within a write the place step comes first, so a move counts for whoever conducted the train when it was made.
- **Task 2, the record:** migration 039 adds `PartyHistoryAttendee.conducted` (`smallint unsigned not null default 0`): the arrivals at a gym or Power Spot while that member conducted (`ledStops`, `arrival`), back moves and route edits included. Finish and a cleared route are not arrivals, so a take-over followed by either earns nothing (review 8H6A-1, R1). `conductorId` stays the conductor at the end. The repository caps the count at 65,535. The legacy import writes 0.
- **Task 3, docs:** `history.md`, `trains.md`.

Nothing is shown on Discord or the web. The boards (plan 8H-6) credit `conducted >= 1` and collapse a split lineage by `splitFromId`.

**Tech stack:** TypeScript 6.0, Kysely, MySQL 8.4, Vitest.

**Brief:** `.superpowers/sdd/8h-6a-conductors/brief.md` (with the review's rulings).

**Every diff in this plan was run before the plan was written.** They come from the throwaway branch `proto-8h6a`, one commit per task, on main-dev `09c57042`; main-dev has moved only in `gantt-data.js` since. Every commit passed both typechecks and its own tests. On the tip `fd33dad4`, the full check (12,237), the build and the database suite (697) pass.

**Reviews (Opus):**
- **The prototype** (8H6A-1..4):
  - 8H6A-1 was Important: credit for holding the role a moment. Fixed by `unlead` and a count of stops led (the controller's ruling while Matt was away).
  - The Minor ones were an opt-out test that checked nothing, a migration test's name, and docs.
- **The re-review** (R1–R3): R1 was Important: Finish and a cleared route counted as stops. Fixed by counting arrivals only. The Minor ones were wording, and db tests of the cap and of a split.

**Conventions:** `CLAUDE.md`, `docs/architecture/history.md`, `testing.md`. Work in `var/wt-8h6a` on `conductors`; never commit in the main checkout.

## Tasks

The task briefs, each with its prototype commit and full diff, are `.superpowers/sdd/8h-6a-conductors/task-<n>-brief.md`:

| Task | Prototype commit | Title |
|---|---|---|
| 1 | `45480324` | 8H-6A task 1: steps conduct and unlead for every conductorship of a train |
| 2 | `ab1b966d` | 8H-6A task 2: migration 039, the stops each conductor led on their attendee row |
| 3 | `fd33dad4` | 8H-6A task 3: history.md and trains.md tell of what every conductor led |

After task 3, `git diff fd33dad4 HEAD -- src test docs/architecture` is empty. Then run `npm run check`, `npm run build` and `npm run test:db`, one at a time, judging each by its exit status.

## Staging

On the Air's dev stack after `./pine update` (migration 039):

1. Googer makes a train and Tester joins. Googer takes conductor and moves it one stop, then Tester takes it over and moves it two stops and presses Done. Googer finishes the train.
2. In `PartyHistoryAttendee`, Googer's row has `conducted` 1 and Tester's 2 (Tester's id only with `/settings history`). The record's `conductorId` is null.
3. A take-over followed only by Finish leaves that member's `conducted` at 0.
