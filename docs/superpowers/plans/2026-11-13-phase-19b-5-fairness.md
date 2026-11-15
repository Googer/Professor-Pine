# Phase 19B-5: Fairness Between Servers: Implementation Plan

**Goal:** the last of plan B's sub-plans in the 2.1 design (`docs/superpowers/specs/2026-11-12-multi-server-instance-design.md`, "Fairness and limits"; Matt, 2026-11-12: "Go for it all"). No server's burst starves the others: direct messages, the screenshot reader, the kept screenshots, post redraws, member lookups and Google's monthly budget take turns or are shared between servers, each bounded where it could fill what all share; a self-hosted instance with one server notices nothing.

- **Task 1, direct messages in turns by server, and the first-contact cap:** a `DmJob` carries its server; within each priority the servers take turns, two lines per server (members written to before, and not yet), so a server held at its cap never stops the others or its own known members; the oldest of the lowest priority of the server with most queued goes first when full; each server may open at most `dms.firstContactsPerWindow` new conversations per window (a default one server never reaches), known from `DmContact` (migration 060; removed by `/operator forget`); reads and records of contacts bounded in time.
- **Task 2, the screenshot reader's queue in turns, and the kept space fair:** the reader's queue takes turns between servers (`ocr.queuePerServer`, unset: the whole queue); when the kept space is full the server keeping the most gives way first.
- **Task 3, post redraws in turns, and the caches by server first:** the paced redraw queue and the member lookups take turns between servers; the member caches and the DM channel cache give way from the server holding the most (`ServerBoundedMap`); the board's held picture bytes bounded per server.
- **Task 4, docs of fairness.**
- **Task 5, Google's monthly shares by need:** a server's share of the month is its need (its rows waiting in the lines) over everyone's, capped at its want (what it used plus what waits plus a tenth), at most half the month while others could use the rest, at most `googleServerShareMax`; what servers no longer waiting used is theirs; shares add up to the month exactly; worked out each Pacific day and whenever a server the shares do not know gets a row; the line serves a server up to its share and holds the rest until the 1st; lookups by hand and `/find-region`'s maps have a floor per server (`googleByHandPerServer`, 20) reserved out of the instance's cap; `/operator google share` raises a server's share for the month; counts per server in `GoogleUseServerDay` (060); the owner told when the month is used, a server's staff when its share is (unless it was alone).
- **Task 6, docs of Google's shares.**

**Tech stack:** TypeScript 6.0, discord.js 14.28.1, Kysely, MySQL 9.7, Vitest.

**Brief:** `.superpowers/sdd/19b-separation/brief-19b5.md` (with `split.md` and `survey-queues.md`); fix rounds `19b5-fix-round-1.md` to `19b5-fix-round-4.md` there; ledger `progress.md`.

**How it was built.** Prototyped on `proto-19b5` from main-dev 6009591b3 (tasks 1–4), beside 19B-3 and 19B-4. An Opus review (2 Important: a server held at its first-contact cap stalled the queue for every server, and its own known members behind it; 5 Minor), folded after a rebase onto 19B-4 (fix round 1); a re-review (ready; 3 Minor folded in fix round 2); a rebase onto 19B-3 and task 5 built on its lines per server; a review of task 5 (3 Important: a server with no need of a kind held for it, a month left unused while servers waited, the by-hand number a cap rather than a floor; 7 Minor), folded (fix round 3); a re-review (1 Important: what servers no longer waiting had used was shared out again; 5 Minor), folded (fix round 4). The reviewed commits are the plan's commits (no transcription).

| Task | Commit | Title |
|---|---|---|
| 1 | `9c29ad41d` | 19B-5 1: direct messages in turns by server, and the first-contact cap |
| 2 | `a6cf73865` | 19B-5 2: the screenshot reader's queue in turns, and the kept space fair |
| 3 | `080adba4d` | 19B-5 3: post redraws in turns, and the member caches by server first |
| 4 | `a7c9e7686` | 19B-5 4: docs of fairness between servers |
| 5 | `fc3aa5f1f` | 19B-5 5: Google's monthly shares by need |
| 6 | `77d66f16c` | 19B-5 6: docs of Google's shares between servers |

On the tip: `npm run check`, `npm run build`, `npm run test:db`, one at a time, each judged by its exit status.

## What staff and members will notice

Nothing on a one-server instance (Pittsburgh's), but for these:

- `/gym google` shows the server's share of Google's month and what it used, and its lookups by hand beside the instance's.
- `/operator google share` (instance operators) raises a server's share for the month.
- `/operator forget`'s look lists "the record that Pine has sent them direct messages".

## Staging

With all of phase 19 (Matt, 2026-11-13), on the Air's dev stack after `./pine update` (migration 060):

1. DMs (wants, a train) arrive as before; `DmContact` has a row for each member written to.
2. Two screenshots at once from the test server are read in turn, as before.
3. `/gym google`: the server's share and use; `/operator google share server: extra:` changes it.
