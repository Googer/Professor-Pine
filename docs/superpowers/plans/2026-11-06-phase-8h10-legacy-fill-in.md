# Phase 8H-10: Filling in a Member's Legacy History (Part H): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Part H and Q6 of `docs/superpowers/specs/2026-11-04-history-on-show-design.md`: a member with the history on can add their legacy parties (made or joined with the old bot) to their history, self-serve from `/settings`, run in the background one member at a time; an opt-out takes the ids out again.

- **Task 1, the member index:** `history:import` reads each attendee's legacy id beside the very `seq` it writes (`LegacyRead.attendeeIds`, `reporterId`: a string snowflake `createdById` only, never `originallyCreatedBy`), checks records already stored against the file (count, `furthest`, `extras`, `groupId`), and writes `<LEGACY_INDEX_DIR>/<server>/<member>.json` per server, swapped in whole, only when every party was written and every file read; counts only on the output. A legacy raid whose `createdById` is negative is imported anonymous.
- **Task 2, the queue:** migration 043 `LegacyFillIn`; a request by `insert … select` from `HistoryOptIn`, a failed one restarted by a press; the opt-out deletes it.
- **Task 3, the worker:** `LegacyFillInService`: the oldest waiting request, claimed with a 10-minute lease, batches of 500 entries, each locking the opt-in (shared) and the request (same `requestedAt`), writing only empty places of that server's legacy records whose facts match; `filled` in the batch's transaction; a stop releases the claim; a missing server folder fails after a day; the bot warns once when it cannot read the index.
- **Task 4, `/settings`:** "Add my old-bot history" (and **Try again** after a failure) in a section of its own (39 of 40 components); the member's and staff's lines; the sentence when history turns on (also through the boards); `/help settings` by the installation; `/stats me` counts the filled-in parties (no change to `MemberStats`).
- **Task 5, the stack and docs:** `LEGACY_INDEX_DIR` (blank = no fill-in, never starting with `~`), mounted read-only into the bot and read-write for `./pine import-history` (run as the operator); the tutorial's line; `history.md`, `members-and-roles.md`, `operations.md`, the guides, the cutover runbook and announcement, CLAUDE.md's import line, the follow-ups.

**Brief:** `.superpowers/sdd/8h-10-legacy-fill-in/brief.md` (review H1–H17 and rulings), `round1.md` (A1–A8, B1–B14).

**Every diff in this plan was run before the plan was written** (throwaway branch `proto-8h10`, one commit per task, rebased onto main-dev `9ee0f551`; each commit passed the typecheck and its tests).

**Conventions:** `CLAUDE.md`, `docs/architecture/history.md`, `members-and-roles.md`, `operations.md`, `testing.md`. Work in `var/wt-8h10` on `legacy-fill-in`; never commit in the main checkout.

## Tasks

The task briefs, each with its prototype commit and full diff, are `.superpowers/sdd/8h-10-legacy-fill-in/tasks/task-<n>-brief.md`:

| Task | Prototype commit | Title |
|---|---|---|
| 1 | `b523d260` | 8H-10 T1: the member index, written by the history import |
| 2 | `8738e7f9` | 8H-10 T2: the queue of legacy fill-ins (migration 043) |
| 3 | `713dcc97` | 8H-10 T3: the fill-in, one member at a time in the background |
| 4 | `4cbd4dcf` | 8H-10 T4: Add my old-bot history in /settings |
| 5 | `1cad2ef8` | 8H-10 T5: the member index in the stack, and the docs |

After task 5, `git diff 1cad2ef8 HEAD -- src test scripts docs/architecture` is empty. Then run `npm run check`, `npm run build` and `npm run test:db`, one at a time, judging each by its exit status.

## Staging

On the Air: set `LEGACY_INDEX_DIR` in `var/dev/.env` to a full path (a folder beside the legacy copy), `./pine update` (migration 043), then `./pine import-history <legacy parties folder> --server 348106758385958915` (writes the index; the records are there already). Googer and Tester.

1. The import's report: `Member index: … members of server …`; the folder readable by the bot (no warning at start).
2. `/settings` as Googer: the section "Add my old-bot history" (if Googer is in the legacy files); press it: "Asked: it takes a few minutes."; within a minute "Your Discord id is now on N parties of the old bot."; `/stats me` years back to 2018.
3. Tester (not in the legacy files, or history off): no section.
4. History off for Googer (a member with records: the dialog's count includes the legacy records); on again: offered again.
5. `/admin member-settings` on Googer: "Old-bot history: added (on N parties)".
6. `/help settings` with the index set: the button's sentence.
