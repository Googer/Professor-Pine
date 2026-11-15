# Phase 19C-3: A Left Server's Data Deleted After 30 Days: Implementation Plan

**Goal:** the third of plan C's sub-plans in the 2.1 design (`docs/superpowers/specs/2026-11-12-multi-server-instance-design.md`, goal 8 and "Leaving"; Matt, 2026-11-12: "Go for it all"). A server Pine left more than 30 days ago is deleted: everything that is the server's, in every per-server table, its kept screenshots, its links to gyms (a gym no server has left deleted with its curated text), its settings and its `Guild` row. The record of the server (`ServerRecord`: who allowed or blocked it) and members' own rows stay; backups age out as they do. Added back afterwards, the server starts anew, in setup.

- **Task 1, the record of a server's deletion, and the indexes it reads:** migration 062 (`ServerRecord.deletingAt`, `deletedAt`, `filesLeftAt`; indexes by server on `StopPost`, `GruntMessage`, `EndedPartyCopy`); `TABLE_OWNERS` (`src/db/server-tables.ts`) says for every table whose it is (the server's by snowflake or `Guild` row, through another table, a gym's, a member's, the instance's), and a test fails on a table not classified or a server's table without an index leading with the server.
- **Task 2, the deletion of one server's data, table by table in batches:** `ServerDataRepository.delete` (bounded batches by an index leading with the server, every statement safe to repeat, children before parents, gyms by `GymRemoval`'s rule, the `Guild` row last); `ScreenshotStore.forgetServer`.
- **Task 3, the daily sweep of servers left 30 days, and a server added back meanwhile:** `ServerDeletion` (`SERVER_KEPT_MS`, once a day in the scheduler's upkeep); `ServerStandings` serializes a deletion with the server's return (`due`, `deleteIfDue`, `pending`, `settled`); a present server is never deleted; a server added back while its deletion is unfinished is answered "Pine is getting this server ready" until it is done, then starts in setup (`setUpOnRecord`, `deletedSinceLeft`); memory forgotten once the database part is done, files after, retried by the sweep (`filesLeftAt`); the owner told of deletions, and of one that fails three sweeps in a row.
- **Task 4, the list of servers says which were deleted and which are being deleted.**
- **Task 5, docs of the deletion of a server left 30 days.**

**Tech stack:** TypeScript 6.0, discord.js 14.28.1, Kysely, MySQL 9.7, Vitest.

**Brief:** `.superpowers/sdd/19c-onboarding/brief-19c3.md` and `19c3-rebase.md` (with `split.md` and `survey.md`); fix rounds `19c3-fix-round-1.md`, `19c3-fix-round-2.md` there; ledger `progress.md`.

**How it was built.** Prototyped on `proto-19c3` from main-dev 9ce2950ae (19C-1), beside 19C-2; rebased onto 19C-2 with the controller's rulings (a deleted server added back starts in setup; a deletion failing three sweeps in a row reaches the owner; a deleted server's gyms forgotten in one pass). An Opus review (3 Important: one failing deletion at a ready held every returning server, the sweep never checked that a server was present, a return whose deletion failed again was not quiet; 7 Minor), folded (fix round 1); a re-review (1 Important: a present server whose unfinished deletion kept failing was never counted toward the owner's alert; 3 Minor), folded (round 2); a help paragraph over the length limit, found by the full check, split in task 4 before the merge. The reviewed commits are the plan's commits (no transcription).

| Task | Commit | Title |
|---|---|---|
| 1 | `396fdd432` | 19C-3 1: the record of a server's deletion, and the indexes it reads |
| 2 | `90aa3d45b` | 19C-3 2: the deletion of one server's data, table by table in batches |
| 3 | `a13521132` | 19C-3 3: the daily sweep of servers left 30 days, and a server added back meanwhile |
| 4 | `455bd5699` | 19C-3 4: the list of servers says which were deleted and which are being deleted |
| 5 | `5b398a81d` | 19C-3 5: docs of the deletion of a server left 30 days |

On the tip: `npm run check`, `npm run build`, `npm run test:db`, one at a time, each judged by its exit status.

## What staff and members will notice

Nothing on an instance whose servers stay. A server that removes Pine and adds it back within 30 days finds everything as it was; after 30 days its data is gone and it starts in setup. The owner gets a DM when the sweep deletes servers (by id, with the old bot's member index folder to remove by hand where there is one), and one when a deletion fails three days in a row. `/operator servers list` names deleted and being-deleted servers.

## Staging

With all of phase 19 (Matt, 2026-11-13), on the Air's dev stack after `./pine update` (migration 062), with a second test server:

1. Remove Pine from the second server; set its `ServerRecord.leftAt` back 31 days by hand in the dev database; wait for the next upkeep (or restart): its rows are gone from every table, its record stays with `deletedAt`, the owner is told.
2. Add Pine back: it starts in setup, allowed.
3. Repeat with the deletion cut short (stop the bot mid-sweep on a seeded large server) and add it back while the bot is down: members are answered "getting this server ready" until the deletion ends, then setup.
