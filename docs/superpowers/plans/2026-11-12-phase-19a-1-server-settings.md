# Phase 19A-1: A Server’s Settings: Implementation Plan

**Goal:** the first half of plan A of the 2.1 design (`docs/superpowers/specs/2026-11-12-multi-server-instance-design.md`, "Per-server settings"; Matt, 2026-11-12: "Go for it all"). Every value that is a server’s is read through one lookup by the server’s id, never from `config.settings`; the settings file’s server keys are only the defaults a server’s first row starts from; the server’s staff change their values in `/admin settings`; an existing installation (Pittsburgh’s) upgrades with no step and behaves as before. The time zone per server is 19A-2.

- **Task 1, the store and the lookup:** migration 052, `ServerSettings` (one JSON row per server, `setUpAt`, `updatedAt`, `updatedBy`); the zod schema of a server’s values (channels, the PvP category and roles as ids; the moderators’ channel none of the others); `ServerSettings.of(serverId)` from memory, `set` writes first; the pure standing rules (`src/domain/servers/standing.ts`: who the map shows parties to, whether moderators are named) over a small interface.
- **Task 2, the fill:** a server without a row gets one from the file’s keys, names resolved to ids in that server; a name not found is recorded `unmatched` and keeps what it guarded closed (the map to administrators only; meetups that need approval and reports refused), never open; the events forum the bot recorded wins over the name where the file names one; the bot lab is told what could not be matched or matched several channels. At the upgrade (an empty table) a server counts as set up only if it was in its shard’s first READY. Fills finish before a shard’s start work and before the client counts as connected; a joined server is filled before its first interaction; a fill retries and never rejects (`wireServerStart`, `src/discord/server-start.ts`, on 19D’s shards).
- **Task 3, channels, the category and roles by id:** every reader of the file’s channels, categories, roles and the web’s member role moves to the server’s ids; `/admin setup-forums` stores the forum it makes; the legacy cleanup keeps its name exclusions beside the ids.
- **Task 4, the other server keys:** features, the events forum’s numbers, flagged words, the forum suffix, `postNewGyms`, the map link, the distance units (the web page gets its server’s), the invite, passive reading and the auto role where the instance allows them; notifications keep their order while a server’s row id is looked up.
- **Task 5, commands per server:** a command that depends on a server’s value is registered when any server could use it; in a server where it is off members are told "The server’s staff have not turned this on." (staff are told `/admin settings`), and it is left out of that server’s `/help` and autocomplete.
- **Task 6, reports never go into the open:** without a moderators’ channel `/report`, "Report to moderators" and the map’s Report refuse (one domain rule).
- **Task 7, `/admin settings`:** a private components-v2 panel in five sections (Channels, Roles, Features, Text and numbers, Recent changes); selects checked against the server; refusals in the panel’s own words; "Leave unset" for a name not found, which says what it does and asks once more; migration 053, `ServerSettingsAudit` (who changed which key, before and after, one row per key in the same transaction, kept 30 days); Recent changes and `/audit member:` read it; `/admin forget` counts its rows.
- **Task 8, docs:** `docs/architecture/servers.md`, the guides, `web-setup.md`, `operations.md` (going back to 2.0), `testing.md`; `src/server-keys.test.ts` refuses a server key read from the file outside `src/config/`.

**Tech stack:** TypeScript 6.0, discord.js 14.28.1, Kysely, MySQL 9.7, Vitest.

**Brief:** `.superpowers/sdd/19a-1-server-settings/brief.md`, `brief-7-8.md`; fix rounds `fix-round-1.md` to `fix-round-3.md` there; ledger `progress.md`.

**How it was built.** Prototyped on `proto-19a1` from main-dev fd2c6f421, one commit per task. An Opus review of tasks 1–6 (3 Important: a map member role or moderators’ channel not found would have opened the map to everyone or switched meetup safety off; the events forum by name could lose the recorded one; 11 Minor), of 7–8 (2 Important: Recent changes over Discord’s 4,000 characters; markers in a select’s default values; 7 Minor); fixes folded into the task commits; a re-review (1 Important: rebase onto 19D and rebuild the start on its shards; 11 Minor); the commits rebased onto main-dev d2747c157 with those fixes folded in; a re-review (2 Important: a server without a readable row would have had meetup safety off and the map open while its fill retried; “Leave unset” did not say what it does; 3 Minor), fixes folded again; a last re-review (ready; 2 Minor wording findings left as follow-ups). main-dev had not moved since, so the reviewed commits are the plan’s commits as they are (no transcription).

| Task | Commit | Title |
|---|---|---|
| 1 | `17f0bb8e7` | 19A-1 1: a server’s settings, their table and the lookup |
| 2 | `f23321ab7` | 19A-1 2: the fill, rows for servers that have none |
| 3 | `cb0689e9d` | 19A-1 3: channels, the PvP category and roles by the server’s ids |
| 4 | `8d349ba7f` | 19A-1 4: the other server keys from the server’s values |
| 5 | `a76d7e499` | 19A-1 5: commands a server must set up |
| 6 | `ed69abd64` | 19A-1 6: reports never go into the open |
| 7 | `eb98f86ac` | 19A-1 7: the server’s settings panel, and the staff’s log of its changes |
| 8 | `c02bfca23` | 19A-1 8: docs of a server’s settings, and no server key read from the file |

On the tip: `npm run check`, `npm run build`, `npm run test:db`, one at a time, each judged by its exit status.

## What staff and members will notice

Pittsburgh’s values come over as they are; these follow from the design:

- Changing a server key in the settings file no longer changes a server that has its row: staff use `/admin settings`. The file is the default of a new server’s first row.
- `/admin setup-forums` makes an events forum where the file had none, and remembers it by id (a renamed forum keeps being drawn).
- Without a moderators’ channel, a report (on a party’s post, `/report`, the map) is refused instead of going into the open.
- Commands that a server’s features switch off are registered anyway; a member who uses one where it is off is told "The server’s staff have not turned this on.", and it is not in that server’s `/help`.
- Going back to 2.0: it reads the file and ignores the tables; panel changes are not in the file, and a server joined under 2.0 later gets a row that is not set up.

## Staging

On the Air’s dev stack after `./pine update` (migrations 052 and 053) and a global deploy of the commands (`/admin settings`; Matt’s go-ahead).

1. The upgrade: after the start, `ServerSettings` has a row for the test server with `setUpAt` set and the channels, the PvP category and the roles as ids; the log says nothing was unmatched (or the bot lab got one message naming what was not found).
2. A name not found: rename the moderators’ channel in `var/dev/pine-settings.json` to one that does not exist, delete the row (`./pine shell`), restart: the bot lab is told; the panel says "not found: meetups that need approval and reports are refused"; `/report` is refused; "Leave unset" asks once more ("Keep it closed" changes nothing); the second press clears it and says meetup safety is off.
3. `/admin settings` as staff: each section opens; change the Unown channel, a feature, the distance units, a flagged word; the line says what changed; Recent changes lists it with who; `/audit member:` of that staff member lists it.
4. A feature off: as Tester, the notifications command answers "The server’s staff have not turned this on." and `/help` leaves it out; back on, it works.
5. The map: the member role chosen in the panel decides who sees parties; the distance units follow the server.
6. As Tester, `/admin settings` is refused by the guard and is not in `/help`.
