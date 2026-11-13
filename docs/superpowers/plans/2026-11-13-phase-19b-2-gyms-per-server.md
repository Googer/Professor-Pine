# Phase 19B-2: Gyms per Server: Implementation Plan

**Goal:** the second of plan B's five sub-plans in the 2.1 design (`docs/superpowers/specs/2026-11-12-multi-server-instance-design.md`, "Gyms, stops and Wayspots per server"; Matt, 2026-11-12: "Go for it all"). Gyms belong to servers by a link table. A server's staff, members and web pages see, search, pick and change exactly their server's gyms; another server's gym, wherever it lies, is answered as if it did not exist. An installation whose servers share their gyms (Pittsburgh's) behaves as before after the upgrade.

- **Task 1, the link table and the upgrade's links:** migration 056 makes `GymServer` (gym, server row; primary key `(gymId, guildId)`, index by server) and links every gym, once, by the directory's own region rule (`upgradeLinks`): to every server whose regions hold it; a gym in no region to the servers whose history used it, else to every server recorded. The same migration makes `SavedRouteGym` (a saved route's gym stops, indexed by gym) and fills it from the routes' text.
- **Task 2, the directory per server:** `ServerGyms` gives each server a view (`ctx.gyms.of(guildRow)`: get, all, regionsOf, inRegion, search, isRegion) of its linked gyms and its own regions, with its own search index and its own `blacklistWords` (now on `/admin settings`, a blank word in the file or a row dropped); views built from the server's own gyms, at most 200 kept; `stored(id)` for references a party or a row already holds; `regionsIn(guildId, gymId)` without building a view.
- **Task 3, gym administration per server:** a server's staff change exactly their linked gyms, wherever they lie (a gym in no region is no longer everybody's; placing a gym in another server's region is no longer refused); a new gym is linked to its one server; deleting a gym several servers share unlinks it from the deleting server (its targets, saved routes and trains in that server go), the row with its last server; the answer counts the deleting server's rows; saved routes found by `SavedRouteGym`; the removal and a route's save retry a deadlock; `gyms:seed --server`.
- **Task 4, the member side:** `/raid`, `/location`, `/target`, `/find-gym`, `/request`, the screenshot gym question and `PlaceFinder` offer, accept and name only the server's gyms; a raid report always names its server.
- **Task 5, every other reader:** posts, trains, DMs, moderation and the notifier read references with `stored`; member settings, the DM Stop, places, `/bounds`, `/region list`, the web map, editor, activity and history trains, Google's ranks and the import and review read the server's view; checks under a party's lock read the party's server's view.
- **Task 6, docs:** `gyms-and-regions.md`, `wayfarer.md`, `trains.md`, `web.md`, `operations.md` (going back: restore the backup made before the update), `servers.md`, `testing.md`, the guides.

**Tech stack:** TypeScript 6.0, discord.js 14.28.1, Kysely, MySQL 9.7, Vitest.

**Brief:** `.superpowers/sdd/19b-separation/brief-19b2.md` (with `split.md`, the surveys and `handover-19b2-1-4.md`); fix rounds `19b2-fix-round-1.md` to `19b2-fix-round-3.md` there; ledger `progress.md`.

**How it was built.** Prototyped on `proto-19b2` from main-dev 1624f4c9e by two prototypers (tasks 1–4, then 5–6 and the panel's words control), beside 19B-1. An Opus review of tasks 1–4 (1 Important: checks under a party's lock read every server's gyms, so a gym the deleting server unlinked still counted; 8 Minor and a check on production's data before release), and of tasks 5–6 (1 Important: a view cost a scan of every gym, and the daily Google rerank could rebuild views without end above 200 servers; 6 Minor); every finding folded into its task commit after a rebase onto 19B-1 (fix round 1); Matt's rule that every query is served by an index (2026-11-13) moved the saved routes' gym stops into `SavedRouteGym` (fix round 2); a re-review (3 Minor: deadlock retries, a doc line), folded (fix round 3). The reviewed commits are the plan's commits (no transcription).

| Task | Commit | Title |
|---|---|---|
| 1 | `bd6c942e1` | 19B-2 1: the link table of gyms and servers, and the upgrade's links |
| 2 | `8abf5efa6` | 19B-2 2: the gyms per server, with a server's own search |
| 3 | `42b72f072` | 19B-2 3: each server administers exactly its own gyms |
| 4 | `5491c2b87` | 19B-2 4: members find, pick and name only their server's gyms |
| 5 | `508f63ab0` | 19B-2 5: every other reader of gyms takes its server |
| 6 | `3f1578d06` | 19B-2 6: the docs of gyms per server |

On the tip: `npm run check`, `npm run build`, `npm run test:db`, one at a time, each judged by its exit status.

## What staff and members will notice

Pittsburgh's gyms are all linked to its server at the update; nothing changes for its members. These follow from the design:

- `/admin settings` has the words gym search ignores (Text and numbers), a server's own.
- A gym in no region is no longer every server's: `/region list` counts the server's gyms in none of its regions ("N gyms of this server lie in none of its regions.").
- After a move, a gym outside all of the server's regions is said so: "It now lies in no region of this server: raids cannot be reported there."
- Deleting a gym the dev and test servers share removes it from the deleting server only.
- Going back to 2.0 after this update is restoring the backup made before it.

## Before the 2.1 release

- On a copy of production's latest backup (from the Air), run the upgrade's links read-only and count the gyms not linked to Pittsburgh's row: expected 0, or a list for Matt (a gym in no region whose history names only another server).

## Staging

On the Air's dev stack after `./pine update` (migration 056) and a global deploy (Matt's go-ahead).

1. The update: `GymServer` has a row for every gym of the dev database, linked to the test server; `SavedRouteGym` matches the saved routes; `/raid gym:` and `/gym show` work as before.
2. `/admin settings` → Text and numbers → the ignored words: add a word, search a gym with it: ignored.
3. A second test server (if one is at hand): a gym added there is not offered in the first server's `/raid gym:`, `/find-gym`, the map; `#N` of it is refused as "This server has no gym #N.".
4. Delete, in the first server, a gym the two share: it stays in the second; its targets and saved routes of the first server go.
5. `/gym import` of a scan in the first server: the gyms it makes are the first server's.
