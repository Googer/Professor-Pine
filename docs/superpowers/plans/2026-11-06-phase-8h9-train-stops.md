# Phase 8H-9: A Train's Stops Count as Raids: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Matt, 2026-11-06: a train's stops are raids that never had a party of their own, so they count wherever the history counts raids: the heatmap's buckets, the region tally, the raids per day and big days (plan 8H-8). A gym stop is a raid, a Power Spot stop a max battle; a stop takes the train's boss only where its kind matches the train's (a gym stop of a raid train, a Power Spot stop of a Dynamax or Gigantamax train).

- **Task 1, the rule:** `countedParties(record, train?)` (`src/domain/history/counted-parties.ts`), the one function that turns a record into the parties it counts as: a raid or max battle as itself, a train whose ending is `completed`, `unknown` or `cutover` (`trainStopsCount`) one party per stop the card counts as made (a loop each time; a legacy train with no times every stop, at its start), at the stop's place and arrival, once, in the train's region if the stop lay in it, else its first. A stop where the train joined a raid that has its own record (`joinedStops`, the card's own matcher by place and time) adds nothing.
- **Task 2, the adding:** the batch reads its trains' stops, attendees and raids along; it ends before a live train that ended less than an hour ago (`TRAIN_SETTLE_MS`), so a raid joined at its last stop is recorded before the train is counted.
- **Task 3, words and docs:** "Each stop a train made counts as a raid, or as a max battle at a Power Spot." under "Raids by day" and the tally, in `/help stats regions`; the Activity layer's hint; `history.md`, `operations.md` (run `./pine rebuild-activity` once after the deploy), `web.md`, the follow-ups' "From Phase 8H-9".

**Brief:** `.superpowers/sdd/8h-9-train-stops/brief.md`; review T1–T7 and the controller's calls (in the follow-ups for Matt).

**Every diff in this plan was run before the plan was written** (throwaway branch `proto-8h9`, one commit per task on main-dev `8780ee5c`; each commit passed the typecheck, prettier, eslint and its tests).

**Conventions:** `CLAUDE.md`, `docs/architecture/history.md`, `trains.md`, `testing.md`. Work in `var/wt-8h9` on `train-stops`; never commit in the main checkout.

## Tasks

The task briefs, each with its prototype commit and full diff, are `.superpowers/sdd/8h-9-train-stops/tasks/task-<n>-brief.md`:

| Task | Prototype commit | Title |
|---|---|---|
| 1 | `d4670e25` | 8H-9 T1: a train's stops count as raids, one domain function |
| 2 | `51e9a42c` | 8H-9 T2: the adding counts a train's stops in the buckets and days |
| 3 | `5441e277` | 8H-9 T3: say that a train's stops count as raids, and the docs |

After task 3, `git diff 5441e277 HEAD -- src test scripts docs/architecture` is empty. Then run `npm run check`, `npm run build` and `npm run test:db`, one at a time, judging each by its exit status.

## Staging

On the Air's dev stack after `./pine update`, then `./pine rebuild-activity` once. No migration, no deploy.

1. The rebuild's line names both marks; the history page's raids by day and tally now include the dev history's trains' stops (compare a day with a train before and after).
2. A train run on the test server with three stops, one at a reported raid: after an hour and an upkeep, the heatmap and the day gain two raids at the other two gyms, none more at the raid's.
3. A Dynamax train with a Power Spot stop and a gym stop: the spot counts as a max battle of the train's boss, the gym as a raid without one.
4. A train nobody came to (let it expire): nothing counts.
5. The history page's sentence under "Raids by day" and the tally; the layer's hint.
