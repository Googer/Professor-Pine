# Phase 19C-2: The Setup State: Implementation Plan

**Goal:** the second of plan C's sub-plans in the 2.1 design (`docs/superpowers/specs/2026-11-12-multi-server-instance-design.md`, "Joining, the setup state, leaving"; Matt, 2026-11-12: "Go for it all"). A server that just added Pine is in setup until its staff finish: members are told Pine is not set up there yet, those who may set it up are pointed to `/admin setup`, and nothing posts, sends, sweeps or looks up for it. `/admin setup` is a checklist around the settings panel; Pine leaves setup by itself once the required items are done (time zone, bot lab, moderators' bot lab, one region). An installation upgraded to 2.1 and a new install's servers adopted at its first start are set up already and never see the setup state.

- **Task 1, a server in setup answers only what its setup needs:** in setup = the settings row has no `setUpAt`, or the server has no row yet and its fill writes it in setup (`ServerSettings.inSetup`); the router's gate (commands, message commands, autocomplete, controls, dialogs) lets through `/help`, `/admin setup`, `/admin settings`, `/admin setup-forums`, `/region import` and `/region edit` and their controls (`worksInSetup`); the web answers as a server Pine is not in, but for the region editor. Who may set a server up is one rule, `mayManageServer` (the server's owner, Manage Server, or bot management; `requireServerAdmin`); every other `/admin` and `/region` part is bot staff's by default (`staffParts`), and a region's removal stays bot staff's on Discord and the web (`mayRemoveRegions`).
- **Task 2, nothing posts, sends or sweeps for a server in setup:** the places 19C-1 guards for a left server ask "quiet" (left or in setup: `QuietServers`, `ofQuietServer`), messages to the bot are not read, the screenshot reader answers it is not set up, its posts take no turn in the paced redraws.
- **Task 3, the setup checklist, and leaving setup once its required items are done:** `/admin setup` (a private components-v2 checklist: each item done or not, with a button to the panel section or command that sets it; the required marked), `ServerSetup` checks after every change whatever made it, `markSetUp` sets `setUpAt` once inside the server's turn, and the bot lab is told; `/admin setup-forums` in setup makes the forums and draws their posts once the server is set up. `/help` lists to each member only the commands and parts whose guards admit them (`Guard.admits`).
- **Task 4, an open instance starts a server from the code's defaults:** a joining server's fill on an open instance takes the code's defaults, not the file's server keys, and no time zone until its staff choose one; `/operator servers allow` of a present waiting server begins its fill once; the setup hook (`serverSetUpWork`) draws what waited and lets Google's line serve the server (`servesRow`: admitted and not quiet).
- **Task 5, docs of the setup state.**

**Tech stack:** TypeScript 6.0, discord.js 14.28.1, Kysely, MySQL 9.7, Vitest.

**Brief:** `.superpowers/sdd/19c-onboarding/brief-19c2.md` (with `split.md` and `survey.md`); fix rounds `19c2-fix-round-1.md` to `19c2-fix-round-3.md` there; ledger `progress.md`.

**How it was built.** Prototyped on `proto-19c2` from 19C-1's prototype, with a ruling: `/admin setup` and `/admin settings` (and the region paths a first region needs) accept the server's owner and members with Manage Server, since a new community's staff may lack the role names. An Opus review (3 Important: messages to the bot read past the gate, set up decided by the table being empty, the ruling across the region paths; 8 Minor), folded (fix round 1); a re-review (1 Important: the web editor let a Manage Server member remove a region `/region remove` refused them; 3 Minor) and the controller's rulings on the round's questions (`setup-forums` for those who set a server up, its answer true in setup, `/help` by the guards), folded with two rebases onto 19C-1 as merged (round 2); a re-review (3 Minor), folded (round 3); a test of the full check (a unit named by hand in the checklist) folded into task 3 before the merge. The reviewed commits are the plan's commits (no transcription).

| Task | Commit | Title |
|---|---|---|
| 1 | `038132bdc` | 19C-2 1: a server in setup answers only what its setup needs |
| 2 | `20e40a46a` | 19C-2 2: nothing posts, sends or sweeps for a server in setup |
| 3 | `ac420e18b` | 19C-2 3: the setup checklist, and leaving setup once its required items are done |
| 4 | `48a429fb9` | 19C-2 4: an open instance starts a server from the code's defaults |
| 5 | `823c038e8` | 19C-2 5: docs of the setup state |

On the tip: `npm run check`, `npm run build`, `npm run test:db`, one at a time, each judged by its exit status.

## What staff and members will notice

Nothing on Pittsburgh's instance but `/admin setup` (it shows every item done) and `/help`, which lists to each member only what they may use. Owners and Manage Server members without a staff role may use `/admin setup`, `/admin settings`, `/admin setup-forums`, `/region import` and `/region edit`, and the region editor; removing a region stays with admins, moderators and bot developers.

A new server on another instance: members get "Pine is not set up in this server yet."; those who may set it up are pointed to `/admin setup`; once the time zone, the bot lab, the moderators' bot lab and one region are set, the bot lab is told "Pine is set up in this server." and everything starts.

## Staging

With all of phase 19 (Matt, 2026-11-13), on the Air's dev stack after `./pine update`:

1. The test server: `/admin setup` lists every required item done; nothing else changed.
2. A second server allowed with `/operator servers allow` and added: a member's `/raid` answers "not set up"; the owner (without a staff role) opens `/admin setup`, sets the zone and the two labs in the panel, makes a region with `/region import`: the bot lab is told it is set up, and `/raid` works.
3. A Manage Server member without a role: `/region remove` and the editor's removal are refused; `/help` lists only the setup commands.
