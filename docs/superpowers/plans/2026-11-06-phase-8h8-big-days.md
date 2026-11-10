# Phase 8H-8: Big Days and the History Page (Part G): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Part G of `docs/superpowers/specs/2026-11-04-history-on-show-design.md`: each server's big days by one fixed rule (review H23), shown on the history page and recalled by "On this day" posts in the events forum.

- **Task 1, raids per day:** migration 042 `ActivityDay` (`serverId`, `regionId`, local `day`, `boss` from `bossKey` only, `raids`, `maxes`; no member) and `ActivityProgress.lastDayHistoryId`; added by the hourly upkeep beside the buckets under two marks in one transaction, rebuilt with them (`activity:rebuild`); `dayOf` shares `knownActivityTime` with `bucketOf`; one server's failure no longer stops the others.
- **Task 2, big days:** `bigDays` in `src/domain/history/big-days.ts`: a day is big by its raids (median/MAD against the 14 days on each side; a zero day on a busy server unknown) or by one boss (at least three times its own middle, a quarter of the day's raids, a day of at least its usual); ranked by excess over the square root of the usual day; a run of days counted once, across year ends. `HistoryDays` reads one snapshot (`daySeries`), cached per server and left-out regions; the routes `/api/history/days`, `/big-days`, `/bosses`, `/bosses/<key>`, each leaving out the regions that keep the member out.
- **Task 3, the page:** "Raids by day" (a year's bars, big days marked and labeled one per run), "Big days of every year" (three a year), "A boss over the years".
- **Task 4, "On this day":** `eventsForum.onThisDay` (0–10, default 3): from 10:00 local, at the first draw that day, a post of its own in the events forum when an earlier year's top day falls today ("Six years ago today: Rayquaza day, 459 of 808 raids."), kept as an `EventPost` `on-this-day:<day>`, auto-archived after a day; not before the days are complete (a warning from noon); every region counts.
- **Task 5, docs.**

**Tech stack:** TypeScript 6.0, Kysely, MySQL 8.4, Vitest; the history page's bundle.

**Brief:** `.superpowers/sdd/8h-8-big-days/brief.md` (its review G1–G21 and the rulings), the fix rounds `round1.md` and the round-2 message (R1–R6).

**Every diff in this plan was run before the plan was written.** They come from the throwaway branch `proto-8h8`, one commit per task on main-dev `3d2ee0e9`; every commit passed the typecheck, prettier, eslint and its own unit and database tests.

**Reviews (Opus):** the brief (G1–G21); the prototype in two halves, mechanics (A1–A7) and the page and words (B1–B16); the fixes and the boss rule (R1–R6). On Pittsburgh's legacy files (253,533 parties, 2018–2026) the rule finds 66 big days; the follow-ups' "From Phase 8H-8" lists them and what it misses.

**Conventions:** `CLAUDE.md`, `docs/architecture/history.md`, `web.md`, `utilities.md`, `testing.md`. Work in `var/wt-8h8` on `big-days`; never commit in the main checkout.

## Tasks

The task briefs, each with its prototype commit and full diff, are `.superpowers/sdd/8h-8-big-days/tasks/task-<n>-brief.md`:

| Task | Prototype commit | Title |
|---|---|---|
| 1 | `713f0903` | 8H-8 task 1: raids per day, a derived table beside the heatmap's buckets |
| 2 | `7aa69a14` | 8H-8 task 2: big days, the days' reads and the history page's routes |
| 3 | `d3f797c5` | 8H-8 task 3: the history page's raids by day, big days and a boss's trend |
| 4 | `c797039d` | 8H-8 task 4: "On this day" in the events forum |
| 5 | `228f9dc2` | 8H-8 task 5: the docs of raids per day, big days and "On this day" |

After task 5, `git diff 228f9dc2 HEAD -- src test scripts docs/architecture` is empty. Then run `npm run check`, `npm run build` and `npm run test:db`, one at a time, judging each by its exit status.

## Staging

On the Air's dev stack after `./pine update` (migration 042; the first upkeep fills the days, about 15–20 s for the legacy history). No new command: no deploy. Googer.

1. After the first hourly upkeep, the log says how many records went to the buckets and to the days.
2. `/s/<guild>/history`: "Raids by day" for 2019 (the default the newest year): bars, the big days in color, one label per run, Rayquaza's March 16; the year select and `?year=`; the list by date with "·"; the line saying what a big day is.
3. "Big days of every year": three a year at most, newest first.
4. "A boss over the years": pick Mewtwo from the list (also in Firefox: it draws without leaving the field); its months as bars.
5. A phone width: no page scroll, only the top three labeled; dark and light.
6. Logged out: one login line, the other sections hidden.
7. "On this day": set `eventsForum.onThisDay` and a day of the dev history that has a big day in an earlier year (or wait for one); the post at 10:00 in the events forum, its line, auto-archived after a day; restart the bot after 10:00 the same day: no second post.
