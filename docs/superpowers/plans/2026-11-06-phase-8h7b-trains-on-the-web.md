# Phase 8H-7B: Ended Trains on the Map's History: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Part F of `docs/superpowers/specs/2026-11-04-history-on-show-design.md`, its web half: the map's Activity layer in History (By month) lists the month's ended trains; choosing one draws its route as a still line and shows its card, the very card of the ended post (8H-7A). Legacy trains get their line and "N stops on the old bot's record (no times)". An ended train's post links to it ("Route on the map").

- **Task 1, the domain:** `trainShownOnWeb` (`TRAIN_WEB_MIN_RIDERS = 3`: listed only when at least 3 members came, `here + done`, live and legacy alike; Matt, 2026-11-05); `raidsAlong` counts only raids recorded by the train's end, so the web's card equals the post's; `trainCardText` takes the region words (`<#id>` on the post, `#name` on the web); the legacy words.
- **Task 2, the reads:** a month's trains along `(serverId, kind, createdAt)` (month in `settings.timezone`), `trainCardRows`' listing, the twin and shared cases.
- **Task 3, the routes:** `GET /s/<guild>/api/history/trains?month=` and `…/trains/<historyId>`: the viewer's gates for every region asked first; barred by the record's region, every known stop region, and a legacy stop's gym's regions now; a legacy train with no region left out; one identical 404 for every refusal; the 50 cap after the gate; its own limiter; ETag, `private, no-cache`.
- **Task 4, the map:** History's Trains part ("Trains in June 2019 (12)"), the list, the chosen train's card, the still line (`trainLegs` through an adapter, `trainAhead` opacity, first and last stops marked, the fit padded by the panel); Play, month, mode and layer changes clear or keep the chosen train as `web.md` says; the stale list busy; one live status note; focus and scroll kept.
- **Task 5, the address:** `?train=<historyId>` opens History at the train's month with it chosen (`fromAddress` survives the heat answer); `localPath` accepts exactly that query on the map's path; the login links carry it.
- **Task 6, the post's link:** the ending write returns the record's id; the ended train's last showing gains "Route on the map" where the web and Discord's login are set up and the train meets the minimum; a redone closing keeps it.
- **Task 7, docs.**

**Tech stack:** TypeScript 6.0, discord.js 14, Kysely, MySQL 8.4, Leaflet, Vitest.

**Brief:** `.superpowers/sdd/8h-7-train-card/brief-7b.md` (its review G1–G11 and Matt's rulings at its end). Reviews: `review7b-a.md`, `review7b-b.md`, `review7b-r.md` there.

**Every diff in this plan was run before the plan was written.** They come from the throwaway branch `proto-8h7b`, one commit per task, rebased onto main-dev `38645ac7`. Every commit passed both typechecks and its own tests. On the tip, the full check (12,475), the build's typecheck and the web build, and the database suite (740) pass.

**Reviews (Opus):**
- **The brief** (G1–G11): records keyed by their own id (legacy has no party id); one riders rule (legacy attendees carry statuses); legacy stops are the route as far as it got; the deep link's pieces (Matt: keep it); barred regions for legacy; the web card equal to the post's; one renderer; the panel on a phone; the line; splits; tests.
- **The prototype in two halves.** Server (A1–A6, Minor): legacy stops gated by their gym's regions; a timing oracle closed by asking every gate first; list words from the card; tests. Client (B1–B10): a late train answer drawn after a change; focus and scroll lost on every redraw; the line fitted under the panel, the panel unbounded; retries, Play's end, superseded answers, announcements, the line's look, tests, docs.
- **The re-review** (R1 Important: the address's train dropped when the heat answered first; R2–R5 Minor: Play stopped by a press, one live note, the chosen button's shift, the stale list).

**Conventions:** `CLAUDE.md`, `docs/architecture/web.md`, `history.md`, `parties-and-posts.md`, `testing.md`. Work in `var/wt-8h7b` on `trains-web`; never commit in the main checkout.

## Tasks

The task briefs, each with its prototype commit and full diff, are `.superpowers/sdd/8h-7-train-card/7b/task-<n>-brief.md`:

| Task | Prototype commit | Title |
|---|---|---|
| 1 | `023493fd` | Trains on the web: who may be shown, the card's raids and region words (8H-7B, 1) |
| 2 | `dd7845c9` | Trains on the web: a month's trains and their rows, read back (8H-7B, 2) |
| 3 | `eedd0a07` | Trains on the web: the month's list and a train's route and card (8H-7B, 3) |
| 4 | `e6f821dd` | Trains on the web: History's Trains part, the still line and the card (8H-7B, 4) |
| 5 | `68c1626a` | Trains on the web: the map's address of an ended train (8H-7B, 5) |
| 6 | `acf2d446` | Trains on the web: "Route on the map" on an ended train's post (8H-7B, 6) |
| 7 | `014cd39c` | Docs of 8H-7B: ended trains on the map's History |

After task 7, `git diff 014cd39c HEAD -- src test scripts docs/architecture` is empty. Then run `npm run check`, `npm run build` and `npm run test:db`, one at a time, judging each by its exit status.

## Staging

On the Air's dev stack after `./pine update` (no migration, no deploy; `npm run web:build` is part of the image). Production's legacy history is in the dev database.

1. On the map (`dev.profpine.com`), Activity on, History, By month: a month with a train three members came to shows "Trains in <month> (N)"; choosing it draws the still line (brighter than a live train's done legs, first stop filled, last a ring, fitted beside the panel) and its card (the post's words, regions as `#name`). Choosing it again clears it.
2. A month with only trains of one or two riders lists nothing for them; a legacy month (2019) lists a legacy train with "N stops on the old bot's record (no times)" and its line.
3. Play hides the part and clears the train; stopping Play by a press on the map brings it back; moving the slider marks the old list busy until the new month comes.
4. An ended train of three riders (Googer, Tester, and a third account or a +1? the rule counts members: three members needed) has "Route on the map" on its post; following it, logged out, logs in and opens History at that month with the train chosen.
5. Phone width and both themes: the panel scrolls within its bound, the map stays usable.
