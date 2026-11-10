# Phase 8H-7A: The Train Card on the Ended Post: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Part F of `docs/superpowers/specs/2026-11-04-history-on-show-design.md`, its Discord half: when a train ends, its post's last showing gets a card, "How the train went": about how many stops in how long, the regions crossed, riders and the most aboard at once, and the raids and max battles recorded along the way. Matt (2026-11-05) split Part F: the web (a month's trains, a still route line, legacy trains) is plan 8H-7B.

- **Task 1, the record:** migration 041 adds `PartyHistory.peakRiders` (`smallint unsigned null`) and `PartyHistoryStop.regionIds` (json, null when not known). `historyOfParty` counts the most members aboard at once from the steps (aboard from their first Here until they leave, go Done, go back to Interested or split off; a split train's members on Coming at its settlement are aboard). The service hands each stop's regions in from `stopRegionsInGuild`.
- **Task 2, the card in the domain:** `src/domain/history/train-card.ts`: `stopWindows` (clipped to `endedAt`; an open last stop ends at the first of the train's end time or the last rider's departure after its arrival, else `endedAt`; every stop capped at 30 minutes, Matt; stops under a minute not counted), `raidTime`, `raidsAlong` (`countsAsActivity`, live records, by gym or Power Spot and overlapping time), `trainCard`. The repository's `raidsAlong` read (the 040 index, ±2 days) and `trainCardRows` (for 8H-7B), with the in-memory twin and shared cases.
- **Task 3, the record handed back:** the ending write returns the record it committed (`Saved = false | { recorded }`): none when the record went to `historyFailed` or the party was written again alone; a deadlock's re-run gives its own.
- **Task 4, the post:** `src/render/train-card.ts` through `fittedLayout`; `closePost` makes the card only for a last showing, the raids read capped at `RAIDS_ALONG_WAIT_MS` (3 s; a failure logs, the card shows without raids); `undoneClosings` keep the record and the card, a redo reads the raids once more if they failed.
- **Task 5, docs.**

**Tech stack:** TypeScript 6.0, discord.js 14, Kysely, MySQL 8.4, Vitest.

**Brief:** `.superpowers/sdd/8h-7-train-card/brief-7a.md` (and `brief.md`: the code read, the brief review F-B1..F-B15). Reviews: `review-a.md`, `review-b.md`, `review-r.md` there.

**Every diff in this plan was run before the plan was written.** They come from the throwaway branch `proto-8h7a`, one commit per task, rebased onto main-dev `d98f2c20` (docs only since its base). Every commit passed both typechecks and its own tests. On the tip, the full check (12,408), the database suite (736), the build's typecheck and the web build pass.

**Reviews (Opus):**
- **The brief** (F-B1..F-B15): the ending write did not hand back its record; redone closings would drop the card; a route laid early starts at `startTime`; the last stop's open window ran a day; raids recorded only (Matt), one domain rule; riders from the record's counts; most at once in members; regions stored per stop (Matt); the split into 7A and 7B (Matt).
- **The prototype in two halves.** Data (A1–A6): the time ignored the cap (now the sum of capped stops); a train past its end time lost its last stop; most at once counted only who pressed Here again after each move (now aboard from the first Here); the read's bound; tests; an empty regions line. Surfaces (B1–B8): one Important, the tier words ("Level 5 raid" as the posts say); an unbounded read before the archive; a needless read; the raids line outside the text budget; the redo; wording; docs; tests.
- **The re-review** (R1–R5, Minor): a split train's riders on Coming; "at most N" left out when it equals the riders; the timer's test; one warning, not two; a redo reads again once.

**Conventions:** `CLAUDE.md`, `docs/architecture/history.md`, `parties-and-posts.md`, `trains.md`, `testing.md`. Work in `var/wt-8h7a` on `train-card`; never commit in the main checkout.

## Tasks

The task briefs, each with its prototype commit and full diff, are `.superpowers/sdd/8h-7-train-card/task-<n>-brief.md`:

| Task | Prototype commit | Title |
|---|---|---|
| 1 | `8f8ce503` | A train's record keeps its most riders at once and its stops' regions (8H-7A, task 1) |
| 2 | `55333e37` | The card of an ended train, and the raids along its way (8H-7A, task 2) |
| 3 | `352be227` | The ending write gives back the record it committed (8H-7A, task 3) |
| 4 | `ee1ffb2b` | An ended train's post shows its card (8H-7A, task 4) |
| 5 | `a897adfb` | Docs of the train card on the ended post (8H-7A, task 5) |

After task 5, `git diff a897adfb HEAD -- src test scripts docs/architecture` is empty. Then run `npm run check`, `npm run build` and `npm run test:db`, one at a time, judging each by its exit status.

## Staging

On the Air's dev stack after `./pine update` (migration 041). No new command, so no deploy.

1. Googer makes a train with four stops in two regions; Tester joins. Googer moves it (Tester presses Here at the first stop), with a raid reported and closed at the second stop's gym while the train is there. Googer `/delete`s the train (archive).
2. The ended post shows "How the train went": about 3 or 4 stops in the minutes it took, "Through" the two regions in order, "2 riders" (and "at most" only if it differs), "Recorded along the way: 1 Level N raid", the approximate note last. Nothing is edited after the archive.
3. A train ended with no move ("It never left.") and one whose route was laid but never moved.
4. Phone width: the card reads well in the Discord app.
