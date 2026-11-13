# Phase 19B-4: Ids Checked Against Their Server; Nicknames and Gym Requests per Server: Implementation Plan

**Goal:** the fourth of plan B's sub-plans in the 2.1 design (`docs/superpowers/specs/2026-11-12-multi-server-instance-design.md`, "The rule", "Gyms, stops and Wayspots per server": nicknames, "Per-server settings": gym requests; Matt, 2026-11-12: "Go for it all"). Whatever names a party or a pending question in a custom id, a dialog or a guard is answered as if it did not exist when it belongs to another server than the one the interaction came from. Pokémon nicknames are a server's own. A gym request goes to the instance's repository only where the instance trusts the server, otherwise to the server's moderators' bot lab.

- **Task 1, parties checked against their server:** one helper, `partyOfServer(interaction, ctx, id)` (in memory, through the complete map of server rows), for every control, dialog and guard that names a party by its custom id: the post's buttons and their dialogs (time, manage, move, split, group, meet, route), the raid, meetup and train Manage…, the max pin, delete and report; a party of another server is answered with the words of one that has ended. A member who is not in a forum's server is barred from it.
- **Task 2, pending questions bound to their server:** a pending question (raid, max, target, gym, region import, Pokéstop, cleanup, meetup form, research and Rocket replacements) belongs to its asker and the server it was asked in; from anywhere else it has expired. The counters answer's options are kept per server, and its dialog is its opener's (no state kept per press).
- **Task 3, Pokémon nicknames per server:** migration 058 makes `PokemonNickname` (server, Pokémon, nickname) and copies the existing nicknames to every server recorded; search is the instance's names with the asking server's nicknames (`ctx.pokemon.of(serverId)`; the instance's alone in a DM), every caller passing its server; `/admin nickname` changes the server's own, on the server staff's guard again.
- **Task 4, gym requests per server:** `/request` is offered in every server; a request goes to the instance's GitHub repository where the instance trusts the server (not open; listed or no list: the operators' rule), otherwise to the server's moderators' bot lab (pinging nobody); a server with neither is told what to set up; refused in rehearsal mode.
- **Task 5, docs:** `discord-framework.md`, `parties-and-posts.md`, `utilities.md`, `notifications-and-dms.md`, `servers.md`, `screenshots.md`, `operations.md`, `testing.md`, `.env.example`.

**Tech stack:** TypeScript 6.0, discord.js 14.28.1, Kysely, MySQL 9.7, Vitest.

**Brief:** `.superpowers/sdd/19b-separation/brief-19b4.md` (with `split.md` and the surveys); fix rounds `19b4-fix-round-1.md`, `19b4-fix-round-2.md` there; ledger `progress.md`.

**How it was built.** Prototyped on `proto-19b4` from main-dev 5e61847ef beside 19B-2 and 19B-3. An Opus review (2 Important: the tests of the server check used a second server without a row, so a check of the wrong kind would have passed; every press of the counters' Change options… kept a copy in a map all servers share; 7 Minor), fixes folded into the task commits after a rebase onto 19B-2 and the index fixes (fix round 1); a re-review (5 Minor), folded (fix round 2). The reviewed commits are the plan's commits (no transcription).

| Task | Commit | Title |
|---|---|---|
| 1 | `3b09698ab` | 19B-4 1: parties named by a custom id are checked against their server |
| 2 | `f646e3c37` | 19B-4 2: pending questions are bound to their server, the counters dialog to its member |
| 3 | `13e477198` | 19B-4 3: Pokémon nicknames are a server's own |
| 4 | `08e47ac6c` | 19B-4 4: gym requests go where a server's go |
| 5 | `40b4fdc6e` | 19B-4 5: docs of ids checked against their server, nicknames and gym requests per server |

On the tip: `npm run check`, `npm run build`, `npm run test:db`, one at a time, each judged by its exit status.

## What staff and members will notice

- **`/request` is offered in every server after the next deploy.** On an instance whose GitHub settings are set, Pittsburgh's requests still become issues there; without them, they are posted in the moderators' bot lab. In rehearsal mode it is refused.
- Pittsburgh's nicknames are copied to its server at the update; `/admin nickname` changes its own. In a direct message (`/counters`, `/rank`), only the instance's names are known, not staff-added nicknames.
- Going back to 2.0: nicknames added under 2.0 are not carried forward when 2.1 runs again.

## Staging

On the Air's dev stack after `./pine update` (migration 058) and a global deploy (Matt's go-ahead).

1. `/admin nickname list`: the dev server's nicknames, as before; add one, `/raid boss:` finds it; in a DM `/counters` does not.
2. `/request gym:`: where GitHub is set, an issue; otherwise a post in the moderators' bot lab.
3. A post's buttons, Manage… and the dialogs work as before in the server.
4. `/counters` answered publicly: another member's Change options… opens their own copy; Submit works for them only.
