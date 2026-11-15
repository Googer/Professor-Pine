# Phase 19E: Neighbors: Implementation Plan

**Goal:** the last plan of the 2.1 design (`docs/superpowers/specs/2026-11-12-multi-server-instance-design.md`, goal 3 and "Neighbors"; Matt, 2026-11-12: "Go for it all"). Two servers become neighbors when the staff of one asks and the staff of the other accept; either may end it, and both are told. A raid or max battle at a gym or Power Spot inside both servers' regions shows, in each server's post, a line for the other's party there (the neighbor's name, boss or tier, the time, how many by status, a link to its post), following its changes without exceeding Discord's edit limits; no member is named, nobody is pinged. A server's staff may copy a neighbor's curated gym text onto their own matching gyms where theirs is empty.

- **Task 1, the record of neighbors, asking and accepting:** `ServerNeighbor` (migration 063: the pair in a fixed order, who asked and when, the answer, when the other was told, a request taken back); the pure rules (`src/domain/servers/neighbors.ts`: `decideAsk`, `decideAccept`, `neighborRowKept`, `NEIGHBORS_MAX` 10); `ServerNeighbors` (in memory, one write at a time, the moderators' bot labs told after the turn, never awaited inside it); `/admin neighbors ask|list|end` and the request's Accept/Decline. An ask answers the same whatever the other server is, in the same work, so the asker learns nothing of another server; a target is told of a pair's request at most once a week; the asks are throttled per member and per server.
- **Task 2, the same gym or Power Spot in two servers:** `sameGyms` (one row, the Wayfarer id, else 10 m and the same name); `NeighborMatches` per pair, rebuilt by each server's own mark (`GymDirectory.generationOf`, a server's gyms and regions); Power Spots by their Wayfarer id inside both servers' regions.
- **Task 3, the line in a post, following the neighbor's party:** `neighborBlocks` (whole lines, "…and N more"), counts by status through the domain's one rule (`listedStatus`, `headsByStatus`), times in the reading server's zone; `NeighborParties` over `PartyStore`'s index by gym and spot; a change of a neighbor's party redraws the posts that show it through the paced queue in the reading server's turn; a change of the matches redraws the posts at the gyms that gained or lost one; a quiet server (left, in setup, being deleted) shows and is shown nothing.
- **Task 4, copy from a neighbor:** `/admin neighbors copy` (`NeighborCopy`; `GymStorage.fillEmpty` writes only the texts still empty, in one transaction with the gym's row locked).
- **Task 5, docs of neighbors**, the Privacy Policy's "Neighbors" paragraph and a sentence of the Terms.

**Tech stack:** TypeScript 6.0, discord.js 14.28.1, Kysely, MySQL 9.7, Vitest.

**Brief:** `.superpowers/sdd/19e-neighbors/brief-19e.md`; fix rounds `19e-fix-round-1.md`, `19e-fix-round-2.md` there; ledger `progress.md`.

**How it was built.** Prototyped on `proto-19e` from main-dev a82e5f596 (19C-2), beside 19C-3 and 19C-4. An Opus review (3 Important: the labs' posts awaited inside the turn every server shares, so a press could outlive Discord's 3 seconds and the timing hinted at what the answer hides; withdraw-and-ask re-posted without limit; a neighbor's party found by sorting every active party; 7 Minor), folded (fix round 1); a re-review (3 Minor); rebased onto main-dev with 19C-3 and 19C-4, and round 2 folded with where the plans meet (a deleted server's pairs go with it, by either column; the Privacy Policy and Terms). The reviewed commits are the plan's commits (no transcription).

| Task | Commit | Title |
|---|---|---|
| 1 | `74a08a65d` | 19E 1: the record of neighbors, asking and accepting |
| 2 | `719f56267` | 19E 2: the same gym or Power Spot in two servers |
| 3 | `50b1eb62e` | 19E 3: the line in a post, following the neighbor's party |
| 4 | `c3c26eabd` | 19E 4: copy from a neighbor |
| 5 | `4c749eaa3` | 19E 5: docs of neighbors |

On the tip: `npm run check`, `npm run build`, `npm run test:db`, one at a time, each judged by its exit status.

## What staff and members will notice

Nothing until two servers' staff agree. Then their raid and max battle posts at the gyms and Power Spots both cover show a line for the other server's party there. `/admin neighbors` (bot staff) asks, lists, ends and copies. **Matt reads the Privacy Policy's new "Neighbors" paragraph and the Terms' sentence before the next release.**

## Staging

With all of phase 19 (Matt, 2026-11-13), on the Air's dev stack with a second test server (both set up, each with a region over the same gym):

1. `/admin neighbors ask server:<the other's id>` in the first: the second's moderators' bot lab gets the request; Accept there; both labs are told.
2. A raid at the shared gym in each: each post shows the other's line (name, boss, time, counts, link); join the other's: its count follows within a few seconds.
3. `/admin neighbors copy server:` in a server whose gym has no nickname: the neighbor's is copied; set one first: it is kept.
4. `/admin neighbors end`: both labs told; the lines go at the next redraw.
5. Ask a server the bot is not in: the same answer as any ask, and nothing posted anywhere.
