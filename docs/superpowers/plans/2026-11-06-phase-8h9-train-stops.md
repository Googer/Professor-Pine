# Phase 8H-9: A Train's Stops Count as Raids: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Matt, 2026-11-06: a train's stops are raids that never had a party of their own, so they count wherever the history counts raids: the heatmap's buckets, the region tally, the raids per day and big days (plan 8H-8). A gym stop is a raid, a Power Spot stop a max battle; a stop takes the train's boss only where its kind matches the train's (a gym stop of a raid train, a Power Spot stop of a Dynamax or Gigantamax train).

- **Task 1, the rule:** `countedParties(record, rows, durations)` (`src/domain/history/counted-parties.ts`; `countedParties(record, train?)` before the fix waves), the one function that turns a record into the parties it counts as: a raid or max battle as itself, a train whose ending is `completed`, `unknown` or `cutover` (`trainStopsCount`) one party per stop the card counts as made (a loop each time; a legacy train with no times every stop, at its start), at the stop's place and arrival, once, in the train's region if the stop lay in it, else its first. A stop and a raid the train joined there (the card's own matcher by place and time) count once: since W1 of the fix wave, the stop adds nothing only where the raid's record came first (a lower id, `joinedStops`); where the train's came first, the raid's record adds nothing (`joinedRaid`; the pairing rule, `laterOfPair`).
- **Task 2, the adding:** the batch reads its trains' stops, attendees and raids along. (Before the branch review it ended before a live train that ended less than an hour ago, `TRAIN_SETTLE_MS`; the fix wave's W1 replaced that hold with the pairing rule: a stop and the raid the train joined there count once, by whichever record has the lower id, `laterOfPair`; the batch also reads the trains around its raids, `trainsAroundQuery`. Nothing waits.)
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
2. A train run on the test server with three stops, one at a reported raid that ended before the train: after the next upkeep, the heatmap and the day gain two raids at the other two gyms, none more at the raid's.
3. A Dynamax train with a Power Spot stop and a gym stop: the spot counts as a max battle of the train's boss, the gym as a raid without one.
4. A Dynamax train stopping at a reported max battle whose timer runs past the train's end (the spot's 21:00): once the train and then the max battle ended and an upkeep ran after each, the battle counts once (as the train's stop), and `./pine rebuild-activity` gives the same.
5. A train nobody came to (let it expire): nothing counts.
6. The history page's sentence under "Raids by day" and the tally; the layer's hint.
