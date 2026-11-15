# Phase 19B-3: Wayspots, the Import and Google per Server: Implementation Plan

**Goal:** the third of plan B's sub-plans in the 2.1 design (`docs/superpowers/specs/2026-11-12-multi-server-instance-design.md`, "Gyms, stops and Wayspots per server"; Matt, 2026-11-12: "Go for it all"). Wayspots (stops, Power Spots, the marks of gone ones) belong to servers: a server's import writes only its own, members and staff see only their server's, and another server's is as if it did not exist. Google's answers (addresses, places) are kept by the place and the kind of question, never by a gym's or a Wayspot's id, so two servers with the same place ask Google once and neither can change the other's answer. The lines waiting for Google are kept per server. An installation with one server (Pittsburgh's) behaves as before after the update.

- **Task 1, Wayspots per server: the table and the upgrade's copies:** migration 059 makes `ServerWayspot` (server, Wayfarer id) and copies every Wayspot to the servers whose regions hold it (19B-2's region rule, one path), or, in no region, to the servers whose history or reports used it, else to every server recorded.
- **Task 2, the Wayspots per server, and every reader takes its server:** `ctx.wayspots.of(guildRow)` (a view built lazily, at most 200 kept) and `stored(guildRow, id)` for references; one server's import reloads that server alone (`load(guildId)`); `PlaceFinder` builds one server's search per turn, lazily, bounded; every reader moved; one `placeNow` for meetup safety and `/places`.
- **Task 3, the import and review keep and drop the server's Wayspots alone:** only inside the server's regions grown by the file's margin; a Wayfarer gym that only another server has is this server's Wayspot.
- **Task 4, Google's answers by the place, the lines per server:** `GoogleAnswer` (kind and point rounded to 1e-6°) is the one store of Google's addresses and places, shown within 10 m and counted as asked by a place's own point (`ownAt`, 1 m); a small move carries its own answers; Wayfarer's address is the gym's own column (`GymMeta.wayfarerAddress`), never the shared store's, and a refresh by hand replaces it with Google's; a daily sweep drops answers no gym or Wayspot of any server lies near; the lines per (server, id) (`ServerGymLookup`, `ServerWayspotLookup`), ranked by each server's regions, one question answering every server's copy; nearest gyms (the places' radius) per server; a region outline change re-queues only its server's line.
- **Task 5, docs:** `wayfarer.md`, `gyms-and-regions.md`, `stop-reports.md`, `operations.md`, `web.md`, `testing.md`, `new-instance.md`.

**Tech stack:** TypeScript 6.0, discord.js 14.28.1, Kysely, MySQL 9.7, Vitest.

**Brief:** `.superpowers/sdd/19b-separation/brief-19b3.md` (with `split.md`, the surveys and `handover-19b3-1-3.md`); fix rounds `19b3-fix-round-1.md` to `19b3-fix-round-3.md` there; ledger `progress.md`.

**How it was built.** Prototyped on `proto-19b3` from main-dev 7819f12d0 by two prototypers (tasks 1–3, then 4–5), beside 19B-4 and 19B-5. An Opus review of tasks 1–3 (1 Critical at scale: one server's change rebuilt every server's search in one turn; 4 Important: an import reloaded the whole instance, the Google line looped Wayspots × servers, the import kept a whole file's Wayspots, missing two-server tests; 4 Minor), and of tasks 4–5 (3 Important: an import's move lost a gym's answers, a server's Wayfarer address went into the store every server sees, every save scanned every gym; 7 Minor); every finding folded into its task commit after a rebase onto 19B-4 (fix round 1); a re-review (4 Important: a moved gym could take a neighbor's answers, a refresh could not replace an import's address, an outline change re-queued every server, commit messages; 5 Minor), folded with the sweep (fix round 2); a re-review (ready; 3 Minor), folded (fix round 3). The reviewed commits are the plan's commits (no transcription). Commit 1 is never deployed alone (it fills `ServerWayspot` while its code still writes `Wayspot`).

| Task | Commit | Title |
|---|---|---|
| 1 | `3b742b822` | 19B-3 1: Wayspots per server, the table and the upgrade's copies |
| 2 | `b85b4bf04` | 19B-3 2: the Wayspots per server, and every reader takes its server |
| 3 | `661a4abf5` | 19B-3 3: the import and review keep and drop the server's Wayspots alone |
| 4 | `abc4bb5f2` | 19B-3 4: Google's answers by the point, the lines per server |
| 5 | `e5fa5efb1` | 19B-3 5: the docs of Wayspots and Google per server |

On the tip: `npm run check`, `npm run build`, `npm run test:db`, one at a time, each judged by its exit status.

## What staff and members will notice

- `/gym import` keeps only the Wayspots inside the server's regions and the export's margin (a whole-state file no longer fills the table).
- `/gym refresh` of a gym whose address came from Wayfarer shows Google's address after.
- `/gym google`'s place in the line counts each place once.
- Going back to 2.0 after this update is restoring the backup made before it.

## Staging

With all of phase 19 (Matt, 2026-11-13), on the Air's dev stack after `./pine update` (migration 059):

1. `ServerWayspot` holds the dev server's Wayspots; `/research`, `/rocket`, `/max near:` and the map's stops as before.
2. `GoogleAnswer` holds the dev database's addresses and places; gym posts show their addresses as before.
3. `/gym import` of a scan: Wayspots outside the regions and margin are not kept; `/gym review` as before.
4. `/gym refresh` of a gym: its address is Google's.
