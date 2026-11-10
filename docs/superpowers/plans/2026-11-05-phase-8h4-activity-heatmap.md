# Phase 8H-4: The Activity Heatmap: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Part B of the history design. A members-only layer of the web map shows where raids and max battles happen, by gym and Power Spot. Its default mode is "expected now": the weekday and hours around now, with a one-year half-life. History mode goes back to 2018.

- **Task 1, migration 038:**
  - `ActivityBucket`: per server, region, place, local month, weekday and hour, it holds raids, maxes, completed and heads, and no member.
  - `ActivityProgress`: each server's mark.
  - An index `PartyHistory (serverId, id)`.
  - `PINE_TABLES` gains both tables.
- **Task 2, the domain** (`src/domain/history/activity.ts`): one path for every part that counts activity.
  - **What counts:** `countsAsActivity` takes raids and max battles that were not cancelled, live and legacy alike.
  - **Buckets:** `bucketOf` gives a record's local month, weekday and hour. A raid at a gym the list no longer has, a pin, or a time out of range goes to no place.
  - **Weights:** `activityWeights` covers Expected now (the hour before to the hour after, wrapping midnight), Weekday evenings, Weekend afternoons, and History by year or month. It uses the half-life, draws only places with at least 3 parties, and normalizes the weights.
- **Task 3, the buckets kept up:**
  - **Hourly:** a step of the hourly upkeep adds new records by id. It runs at read committed, behind a locked mark row, reading with shared locks, in batches with deadlock retries.
  - **Rebuild:** `npm run activity:rebuild` and `./pine rebuild-activity` rebuild from scratch.
- **Task 4, the route** `GET /s/<guild>/api/activity`:
  - members only, with membership asked before any read, at 180 requests a minute;
  - regions the member is barred from, and deleted regions, are dropped;
  - places gone from the gym list are counted as left out;
  - it sends an ETag, and for Expected now the time to the next hour.
- **Task 5, the layer:** "Activity" draws circles on a canvas (a tap target of at least 32 px). Its panel offers the modes, a month and year slider, and Play, one step a second after each answer. Its text is set as text, with no inline style.
- **Task 6, docs:** `history.md`, `web.md`, `operations.md`, `testing.md`, and the legacy guide.

**Tech stack:** TypeScript 6.0, Node 26, Leaflet 1.9 (no new dependency), Kysely, Vitest. Migration 038 (additive). No command option changed (no deploy). `npm run web:build` builds the page.

**Spec:** `docs/superpowers/specs/2026-11-04-history-on-show-design.md`, Part B (approved by Matt 2026-11-04). The brief is `.superpowers/sdd/8h-4-activity-heatmap/brief.md` (git-ignored). Matt asked for this plan on 2026-11-05 ("go on to 3") and was away while it was built, so the controller took the brief's decisions and the rulings below for him to object to:
- the heads are those who came;
- regions are kept in the buckets for barring;
- deleted regions are dropped (review P7);
- no server cache.

**Every diff in this plan was run before the plan was written.** They were made on the throwaway branch `proto-8h4`, one commit per task, on main-dev `7321a0ac`. On the tip, the full check (12,071), the build and the database suite (691) pass, and the lock test passed 10 runs out of 10.

**Reviews:**

- **The prototype** (Opus, P1–P11):
  - **P1, Important:** Play outran the route's limit and dropped slow answers.
  - **The Minor ones:**
    - two adders could deadlock;
    - the residual gap in the mark is named in the docs;
    - one odd time stalled the adding;
    - a fast client clock reloaded the page every two seconds;
    - the tap target was too small;
    - deleted regions were shown;
    - History was blank after a failed load;
    - screen-reader labels;
    - the docs;
    - two tests.
  - All were fixed in fix round 1.
- **The fix round:** the re-review found it ready. Its one Minor finding, R1 (Expected now never answers 304, because it carries the time to the next hour), was accepted and documented.

**Conventions:** read `CLAUDE.md`, `docs/architecture/web.md`, `history.md`, `operations.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck and its own test files. The full check, the build and the database suite run once on the tip. Work in `var/wt-8h4` on `activity-heatmap`; never commit in the main checkout.

## Review Focus

- Privacy: nothing places a member, the minimum of 3, barred and deleted regions dropped, membership asked before any read (task 4).
- The mark: no record counted twice or lost, apart from the documented residual; incremental adding equals a rebuild (task 3).
- The page: Play's pacing, timers cleared, the CSP (task 5).

## Tasks

The task briefs, each with its prototype commit and full diff, are `.superpowers/sdd/8h-4-activity-heatmap/task-<n>-brief.md`:

| Task | Prototype commit | Title |
|---|---|---|
| 1 | `d779f53d` | 8H-4 task 1: migration 038, the buckets and their progress |
| 2 | `a4dd3cfe` | 8H-4 task 2: what counts, the bucket of a record, the weights |
| 3 | `ed9dd3b7` | 8H-4 task 3: the buckets added hourly, and their rebuild |
| 4 | `e752b5d2` | 8H-4 task 4: the route of the map |
| 5 | `9035b9b1` | 8H-4 task 5: the layer and its panel on the map |
| 6 | `6309c545` | 8H-4 task 6: the docs |

After task 6, `git diff <prototype tip> HEAD -- src test` is empty. Then run, one at a time, judging each by its exit status:
- `npm run check`;
- `npm run build`;
- `npm run test:db`.

## Staging

Run on the Air's dev stack after the next update (`./pine update` runs migration 038 and builds the page). Use Googer, and Tester for barring.

1. **The first upkeep after start** logs the records it added. Then `./pine rebuild-activity` gives the same buckets.
2. **The layer menu:** "Activity" appears for members, and not for a visitor who isn't logged in. Turned on, it opens on Expected now with circles at the busy gyms; a tap shows "N parties at this time of day on <weekday>s, over the years".
3. **The presets:** Weekday evenings and Weekend afternoons redraw.
4. **History:** the slider runs from the first month to the last. Play steps one month a second and stops on a press, and the left-out line shows when there are gyms no longer listed.
5. **Barring:** Tester, barred from a region's forum, sees none of that region's places. Googer sees them.
6. **Phone width:** the panel sits beside the other controls, and the circles are tappable.
7. **Dark theme:** the circles' color.
