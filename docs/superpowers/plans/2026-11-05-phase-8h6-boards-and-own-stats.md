# Phase 8H-6: Boards and a Member's Own Stats: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parts D and E of `docs/superpowers/specs/2026-11-04-history-on-show-design.md`: boards of members who opted in, ranked by what others confirm, boards of things, and a member's own stats, on Discord (`/stats boards`, `/stats me`, each with Share) and on the web (the history page's Boards section, a "Your Pine" page).

- **Task 1, the switch and who closed a party:** migration 040 adds `LeaderboardOptIn` and `PartyHistory.closedBy` (`staff` or `moderators`). `/settings leaderboard` turning on also turns on the history opt-in (Matt), written race-free. The history opt-out also takes a member off the boards. `/settings show`, `/admin member-settings` and the DM answer show the switch.
- **Task 2, the boards in the domain:** raids reported that others completed, trains led (`conducted >= 1`, a split ride once), meetups hosted that others came to and no staff or moderator closed, and reports at stops that counted. Live records only; anonymous ones count toward no board.
  - **Reputation (Matt):** confirmations of every live report except staff take-backs, minus contradictions, plus 1 per 20 uncontested reports that counted. Below 0, only a member's confirmed reports count. The score is never shown.
  - **Boards of things:** most wanted (`species:` want counts), most sent (catalogue bosses), most reported tasks.
- **Task 3, names:** `MemberNames` names the shown members by asking Discord for every id (the cache misses who left), kept a minute, one request at a time beside the viewers' lookups. A member Discord does not name is left out and the ranks close up (Matt).
- **Task 4, a member's own stats:** counts, completions, rides, busiest region (by channel only), bosses, "sent to", and the member's years.
- **Task 5, `/stats boards`:** periods, the viewer's place privately (or "you would be #N"), and Share.
- **Task 6, `/stats me`:** year autocomplete, and Share. The shared card leaves out anonymous records, and leaves out its busiest region unless every viewer of the channel sees it.
- **Task 7, the routes:** `/api/stats/boards` and `/api/stats/me`.
- **Task 8, the pages:** the history page's Boards section, and "Your Pine" with an SVG month chart beside a hidden table for screen readers.
- **Task 9, docs.**

**Tech stack:** TypeScript 6.0, discord.js 14, Kysely, MySQL 8.4, Leaflet-free web client, Vitest.

**Brief:** `.superpowers/sdd/8h-6-boards-and-stats/brief.md`, with the brief review (B1–B13) and Matt's rulings. Review findings: `review-a.md` and `review-b.md` there.

**Every diff in this plan was run before the plan was written.** They come from the throwaway branch `proto-8h6`, one commit per task, rebased onto main-dev `184e951d` (no conflict). Every commit passed both typechecks and its own tests. On the tip, the full check (12,337), the build and the database suite (724) pass.

**Reviews (Opus):**
- **The brief, by a fresh reviewer (B1–B13).** B1 led to plan 8H-6A (every conductor recorded). The others were folded into the brief.
- **The prototype, in two halves.**
  - Data half (A1–A10). Two Important: a meetup staff closed still counted, which `closedBy` fixes; and names were trusted from a cache that keeps members who left. The Minor ones were reputation to the letter of Matt's ruling, split rides, privacy rules moved into the domain, the request budget, an unknown server, empty years and the race test.
  - Surfaces half (B1–B10). One Important: the chart was unreadable to screen readers. The Minor ones were the viewer's rank, an empty year on the web, duplicate name asks, a 503 on naming failure, narrow widths, tests, wording, the Year label and the autocomplete's cost.
- **The re-reviews.** R-A1–A4: a post deleted by hand counts as staff's closing; the sweep's loss of `closedBy` is documented; split rides in the month chart; one member request in flight at a time. R-B1–B4: the empty year's heading, the table's name, the refusal after an opt-out, and the help on reports at stops.
- **Not done (accepted):** after login, "Your Pine" returns without its `?year=`, since `localPath` refuses queries on the return address (open-redirect hardening).

**Conventions:** `CLAUDE.md`, `docs/architecture/history.md`, `discord-framework.md`, `web.md`, `members-and-roles.md`, `testing.md`. Work in `var/wt-8h6` on `boards`; never commit in the main checkout.

## Tasks

The task briefs, each with its prototype commit and full diff, are `.superpowers/sdd/8h-6-boards-and-stats/task-<n>-brief.md`:

| Task | Prototype commit | Title |
|---|---|---|
| 1 | `06ae3ef3` | 8H-6 task 1: migration 040, the switch of the boards, and who closed a party |
| 2 | `7ff19f04` | 8H-6 task 2: the boards in the domain, and the reads they rank |
| 3 | `f5929c79` | 8H-6 task 3: the names of the members a board shows |
| 4 | `e055d939` | 8H-6 task 4: a member's own stats, in the domain and as reads |
| 5 | `28a31ada` | 8H-6 task 5: /stats boards, with its periods, the viewer's place and Share |
| 6 | `e67cbada` | 8H-6 task 6: /stats me, with year autocomplete and Share |
| 7 | `4161e311` | 8H-6 task 7: the boards and "Your Pine" as routes |
| 8 | `c9d49562` | 8H-6 task 8: the history page's boards, and the "Your Pine" page |
| 9 | `85473c29` | 8H-6 task 9: the docs of the boards, the switch and a member's own stats |

After task 9, `git diff 85473c29 HEAD -- src test scripts docs/architecture` is empty. Then run `npm run check`, `npm run build` and `npm run test:db`, one at a time, judging each by its exit status.

## Staging

On the Air's dev stack after `./pine update` (migrations 039 and 040), with production's legacy history there. Matt first runs the global deploy with the stage settings: `/stats boards`, `/stats me` and `/settings leaderboard` are new.

1. **The switch:** Tester, with the history opt-in off, runs `/settings leaderboard enabled:True`. The answer says the history is on too. `/settings show` shows both switches. `/settings history enabled:False` takes Tester off the boards as well.
2. **Boards:** with Googer and Tester both on the boards, raid, train and meetup records from staging rank as the rulings say. `/stats boards` switches boards and periods in place. A member off the boards sees "you would be #N". Share posts the board in the channel, the throttle refuses a fourth Share in ten minutes (across `/stats regions` too).
3. **Names:** a member who left the test server drops off the boards and the ranks close up.
4. **`/stats me`:** the year autocomplete offers only years with something, and a year with nothing says so. Share posts "Pine of **name**" without the busiest region in a channel some viewers of the region cannot see. Anonymous records are left out of the shared card only.
5. **The web:** the history page's Boards section, and "Your Pine" (chart, year select, the empty year). Check both themes and phone width, and the not-opted-in answer. With a screen reader or the accessibility tree, the month table can be read.
6. **closedBy:** a meetup Tester hosted that Googer came to and staff closed (`/delete`, or the post deleted by hand) is not on the meetups board.
