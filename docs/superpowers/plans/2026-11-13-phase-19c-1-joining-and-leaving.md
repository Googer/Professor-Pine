# Phase 19C-1: Joining and Leaving: Implementation Plan

**Goal:** the first of plan C's sub-plans in the 2.1 design (`docs/superpowers/specs/2026-11-12-multi-server-instance-design.md`, "The rule", "Operators", "Joining, the setup state, leaving"; Matt, 2026-11-12: "Go for it all"). Who may have this Pine is decided by the instance: a server not allowed is told once, in its system channel where Pine may write there, that this Pine is private and how to run one's own, and Pine leaves, whether it was added while Pine ran or while it was down. A server that removes Pine is marked left and kept: nothing is posted, sent, swept or looked up for it, nothing is deleted yet (the deletion after 30 days is plan 19C-3), and added back it picks up where it was. Instance operators see the servers and allow, remove or block them with `/operator servers`.

- **Task 1, the record of each server and the rule of who may join:** `ServerRecord` (migration 061: `serverId` key, `recordedAt`, `allowedAt`/`allowedBy`, `blockedAt`/`blockedBy`, `leftAt`, each read by a key; filled from every `Guild` row when the table is made, so every server present at the upgrade is allowed by being recorded); the pure rule `mayHave` (`src/domain/operators/admission.ts`): allowed when not blocked and the instance is `"open"`, or lists the server in `servers`, or recorded it, or an instance operator allowed it. An unset `servers` now means closed to new servers. `isTrustedServer` is an allowed server on an instance that is not open. `ServerStandings` keeps the record in memory.
- **Task 2, who is in, checked on joining and once every shard is ready:** `ServerAdmission` checks a joining server before its fill, and every present server once every shard is ready (the union of each shard's last start, never the cache); a server not allowed is told and left; a recorded server no shard names is marked left. A new install adopts the servers present at its first start (`ServerAdoption`): on a public bot (read by REST before the login) only those owned by the owner or an operator; the owner is told by DM of what was adopted, or of servers that wait for their word.
- **Task 3, a server that removes Pine is marked left, and nothing is done for it:** the `Guild` row is no longer deleted; `leftAt` is set, and cleared when the server is present again. For a left server the scheduler, the notifier, copies, summaries, the events forum, the boss announcer, stop posts and lines, `ServerNotices`, the board sweep and the web stop; its queued DMs are dropped (`DmSender.dropServer`), its posts take no turn in the paced redraws, and its rows in Google's lines are held out of the line's range and count for no share until it comes back (ranked anew from its raids then). Its live parties are kept as they are. `ServerStandings.whenLeftChanged` tells `followLeaving` of every leave and return.
- **Task 4, `/operator servers`:** `list` (name, members, set up or not, left or blocked, the last party's time; pages), `allow`, `remove`, `block`, `unblock`; the instance tier; another operator's change told to the owner (`tellOwnerOfServerChange`); `/operator forget`'s look counts a member's allowances and blocks.
- **Task 5, docs of joining and leaving.**

**Tech stack:** TypeScript 6.0, discord.js 14.28.1, Kysely, MySQL 9.7, Vitest.

**Brief:** `.superpowers/sdd/19c-onboarding/brief-19c1.md` (with `split.md` and `survey.md`); fix rounds `19c1-fix-round-1.md` to `19c1-fix-round-5.md` there; ledger `progress.md`.

**How it was built.** Prototyped on `proto-19c1` from main-dev c5dbd47b7 (19B-4). An Opus review (5 Important: a new install's adoption made safe on a public bot, presence decided live, no expiry DMs for a left server, operator ids in forget's look, a list over Discord's limit; 5 Minor), folded (fix round 1); a re-review (11 Minor, folded in round 2). Rebased onto 19B-5 (main-dev 7211e74fe, with 19B-3), and a review of the meeting of the three (1 Important: Google's line and shares still served a left server, whose rows the kept `Guild` row no longer cascades away; 3 Minor), folded (round 3); a re-review (1 Important: the left server's rows stayed in the range the line's index read walks; 3 Minor), folded (round 4); a re-review (1 Important: a server allowed again without leaving or returning kept its rows held until the next day; 2 Minor), folded (round 5). The reviewed commits are the plan's commits (no transcription).

| Task | Commit | Title |
|---|---|---|
| 1 | `5c46c64f6` | 19C-1 1: the record of each server and the rule of who may join |
| 2 | `5e04272f7` | 19C-1 2: who is in, checked on joining and once every shard is ready |
| 3 | `75882813d` | 19C-1 3: a server that removes Pine is marked left, and nothing is done for it |
| 4 | `380d0d24d` | 19C-1 4: operator servers, to see, allow, remove and block servers |
| 5 | `5f598b0ec` | 19C-1 5: docs of joining and leaving |

On the tip: `npm run check`, `npm run build`, `npm run test:db`, one at a time, each judged by its exit status.

## What staff and members will notice

On Pittsburgh's instance nothing but the new command: every server present at the update is recorded and stays allowed.

- `/operator servers list|allow|remove|block|unblock` (instance operators).
- A server added to a closed instance gets one post in its system channel and Pine leaves it.
- A server that removes Pine and adds it back within 30 days finds its regions, settings and history as they were.
- **The meaning of an unset `servers` changed:** closed to new servers (only the recorded and the allowed). An instance that relied on "unset = any server" sets `"open"`.

## Staging

With all of phase 19 (Matt, 2026-11-13), on the Air's dev stack after `./pine update` (migration 061):

1. `/operator servers list` shows the test server, recorded.
2. Add the dev bot to a second server not allowed: one post in its system channel, Pine leaves; the log names its id.
3. `/operator servers allow server:<id>`, add it again: it stays.
4. Remove Pine from that server: `ServerRecord.leftAt` set, its `Guild` row kept, nothing posted; add it back: `leftAt` cleared, its regions as before.
5. `/operator servers block` and `unblock`.
