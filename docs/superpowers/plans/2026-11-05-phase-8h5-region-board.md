# Phase 8H-5: The Region Board: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Part C of the history design. It counts raids and max battles per region, this month, this year or all time, legacy included. On Discord it is `/stats regions`, a private answer with a Share button. On the web it starts the history page `/s/<guild>/history`, which Parts D, E and G will add to.

- **Task 1, the domain and the read:**
  - `regionBoard` ranks the regions, with one "No longer a region" line and the totals.
  - The periods and their words, and `keptOut`: a region whose forum is barred or hidden from the member is left out.
  - `ActivityReader.regionSums` sums by region over a month range, with its twin and cases.
- **Task 2, `/stats regions [period:]`:** a `commandGroup` `stats` whose answer is one private v2 container: regions named by channel, a line budget, and three period buttons. A slow press is deferred (`readOrDeferPress` and `inTime` in `late-reply.ts`). `RegionBoards` goes into `AppContext`.
- **Task 3, Share:** the board is computed again and posted in the channel by the bot, with "Shared by" in `memberByName`.
  - **Who sees what:** a region is kept only if every role that can view the channel can view its forum (`shareKeeps` in `src/ops/permissions.ts`, with a property test that the role check is complete). A region in the channel's own forum is kept, and up to 10 members named on the channel are fetched.
  - **Refusals, in words:** when the bot may not post (`mayShare`), and when the channel is unknown to the cache. Both give the use back.
  - **Throttle:** 3 per 10 minutes.
- **Task 4, the route** `GET /s/<guild>/api/stats/regions?period=`: shaped like `/api/activity`, with membership asked before any read. The heatmap's route also leaves out hidden regions now (Matt's R-B).
- **Task 5, the page:** `/s/<guild>/history` is a server-rendered shell with its own bundle (no Leaflet; `page-frame.ts` is split out of `common.ts`). It has the period tabs, the table, a login link, both themes and phone width. The map's account menu gains "History".
- **Task 6, docs:** `history.md`, `web.md`, `discord-framework.md` (the Share convention) and `testing.md`.

**Tech stack:** TypeScript 6.0, Node 26, discord.js 14, Kysely, Vitest. No migration and no new dependency. A new slash command, so staging needs a global deploy (Matt's).

**Spec:** `docs/superpowers/specs/2026-11-04-history-on-show-design.md`, Part C and Part G's history page; the brief is `.superpowers/sdd/8h-5-region-board/brief.md`. Matt's rulings of 2026-11-05:
- a private answer with Share;
- the history page starts here;
- one "No longer a region" line;
- Share keeps a region only if everyone who can view the channel can view it (R-A);
- hidden regions are left out of a member's own board, the page and the heatmap (R-B).

The controller decided that anonymous raids count on the board (P8). Still open with Matt: the party layer still shows live parties of a hidden region (`history.md` says so).

**Every diff in this plan was run before the plan was written.** They come from the throwaway branch `proto-8h5`, one commit per task, on main-dev `91377414`. Every commit passes both typechecks and its own tests. On the tip, the full check (12,140), the build and the database suite (692) pass.

**Reviews:**
- **The prototype** (Opus, P1–P11). The one Important finding was P1: the @everyone filter emptied a share on a role-gated server, and Matt ruled R-A and R-B. Fixed in round 1.
- **The re-review** (R1–R7, Minor):
  - the role check proved complete;
  - a share in the region's own channel keeps that region, and member fetches were added;
  - an unknown share channel is refused;
  - one `keptOut`;
  - the per-commit checks;
  - the press race moved to `late-reply.ts`.
  Fixed in round 2.

**Conventions:** `CLAUDE.md`, `docs/architecture/discord-framework.md`, `web.md`, `history.md`, `testing.md`.

**Inside the plan:** each commit needs only the typecheck and its own test files; the full suites run once on the tip. Work in `var/wt-8h5` on `region-board`; never commit in the main checkout.

## Review Focus

- **Privacy:**
  - a public post never shows counts that readers of the channel can't see;
  - a member's board, the page and the heatmap leave out barred and hidden regions;
  - membership is asked before any read on the web.
- **One path:** Discord and the web share `RegionBoards`, `regionBoard` and `keptOut`.
- **Share:** only its owner can press it; the throttle; the refusals; `givesBack`; components v2; mentions off.

## Tasks

The task briefs, each with its prototype commit and full diff, are `.superpowers/sdd/8h-5-region-board/task-<n>-brief.md`:

| Task | Prototype commit | Title |
|---|---|---|
| 1 | `3c03d26c` | 8H-5 task 1: the domain function and the reader's sum |
| 2 | `214a85f7` | 8H-5 task 2: /stats regions |
| 3 | `6bba3b8f` | 8H-5 task 3: Share |
| 4 | `dd7587fc` | 8H-5 task 4: the route |
| 5 | `639bf8e8` | 8H-5 task 5: the history page |
| 6 | `3f326762` | 8H-5 task 6: the docs |

After task 6, `git diff <prototype tip> HEAD -- src test` is empty. Then run `npm run check`, `npm run build` and `npm run test:db`, one at a time, judging each by its exit status.

## Staging

On the Air's dev stack (`./pine update`, then Matt's global deploy with the stage settings), with production's legacy history in the dev database:

1. `/stats regions` answers privately with this month's board, regions named by channel, and "No longer a region" and the total. The period buttons switch it in place.
2. **Share** in a region channel posts the board with "Shared by Googer" and no ping. In a private region's channel (staff only) the shared board keeps that region. In #general it leaves out the private regions, and the private answer says so first.
3. Share a fourth time within ten minutes: refused in words.
4. `/s/<guild>/history`: the tabs, the table and both themes; at phone width, with no sideways scroll. "History" is in the map's account menu. Logged out, it shows the login link and comes back to the page after login.
5. **Tester**, with a region forum hidden from them: that region is off their board, the page and the heatmap, and still on Googer's.
