# Cutover, Docker stack and party history — design

Status: draft for Matt's approval (2026-10-16). Builds on the migration spec (`2026-10-09-typescript-discordjs-migration-design.md`, sections 9.1 and 9.2) and the "Phase 8" and "Phase 9" sections of `docs/superpowers/plans/phase-0-follow-ups.md`; where they disagree, this document wins.

## 1. Intent

Pittsburgh's production application loses its privileged intents about 2026-11-11, and the legacy bot depends on them. This work gets Pittsburgh onto the new bot, on a freshly installed Linux host, in one evening of planned downtime, and leaves behind what every other Pine instance needs to follow: a Docker stack anyone can bring up, tools that convert a legacy installation, and guides.

Pittsburgh's activity is low at the moment (members moved to Campfire); the rewrite is expected to bring them back. Downtime of a few hours is acceptable and members are not warned in advance.

Alongside, Pine starts keeping a **history of every party**, imported from seven years of legacy files and recorded from now on, in a relational form that answers statistics questions with plain SQL.

## 2. Goals, non-goals, anti-goals

Goals:

- A Docker Compose stack that is the whole of Pine on a host that has only Docker and git: bot, MySQL, the Cloudflare tunnel's slot, a watchdog; nightly verified backups.
- One-command restore of a legacy (or Pine) dump into the stack.
- Tools that make a legacy installation's move safe: a readiness check, a settings converter, a rehearsal mode, a two-step cleanup of legacy channels.
- Party history: relational tables, a best-effort import of the legacy `parties/` folder, every ended party recorded, member identity only with the member's opt-in.
- A small patch on the legacy branch so legacy Pine still starts and connects without privileged intents.
- Guides for migrating an existing instance and for a new one; a draft of the after-the-fact announcement.

Non-goals:

- Stats commands, leaderboards, hot spots on the map (later; the history makes them possible).
- Importing legacy parties as live parties (decided 2026-10-15: active legacy parties lapse).
- Rollback machinery. If the cutover fails, fix forward from the backup (the old host is formatted).
- Publishing the image to a registry.

Anti-goals (a failure even if it works):

- Anything members see from a rehearsal: DMs to members not on the allowlist, announcements, slash commands visible to all, a forum open to all.
- Deleting a channel that was not a legacy party's, or deleting without a person confirming the list.
- Storing a member's identity in the history without their opt-in.
- Any legacy code on `main-dev` after the first push.
- A deployment step that needs Node, npm or MySQL tools on the host.

## 3. Constraints and facts

- Same Discord application and token as the legacy bot (already in the server; no re-invite). The bot's role likely has Manage Channels and Manage Roles; Matt checks Manage Threads beforehand. Matt's role "Bot Developer" probably lacks Manage Server: a server admin is on hand for the night (permissions, `/admin setup-forums`, the cleanup).
- Production is Pittsburgh only: one server.
- Production today: Windows host the old host, legacy bot in `<legacy bot folder>`, MySQL 8.0 on the same host, nightly dumps in `<backup folder>\pine-YYYYMMDD.sql`. Windows MySQL lower-cased every table name (`guild`, `gymmeta`, …); MySQL on Linux is case-sensitive.
- The host is formatted and becomes Debian 13 with Docker; Pine is installed there as a fresh clone of the repository.
- The legacy restriction tables `CommandRoleAuthorization` and `CommandRoles` are empty in production: nothing to recreate. Staff commands default to Manage Server.
- Legacy `parties/`: `active/` holds 19 files (3 meetups, 16 trains, all apparently without end; each with `channelId`); `complete/` holds 2,423 files (257 MB, 2019-09 to 2026-05), each a list of many ended raids. Files are key/value records (`{ key, value }`); field sets vary over the years.
- Production `data/settings.json` differs from the new defaults in channel names (`channels.unown` `wild-unown-sightings`, the EX channel `potential-ex-gym-raids` under the legacy key `ex-gym-raids`) and `features.remoteRaidChannel: false`; secrets are in `data/private-settings.json`.
- The Cloudflare tunnel (`cloudflared`) and the web settings (`web.host`, `web.port`, `web.publicUrl`, `web.trustProxy`) come from plans 8M in the Wayfarer session; this work leaves a slot for them and does not build them. Leaning: Pine listens on `0.0.0.0` inside the Compose network, port unpublished; the tunnel token is an environment variable.
- Migration numbers from 014 go to whoever merges first (this checkout or the Wayfarer branch); the other renumbers.
- All CLAUDE.md hard rules hold: nothing pushed until the migration is complete, no contact with Discord without Matt's go-ahead, legacy JS untouched except the patch in 4.6.

## 4. What gets built

### 4.1 The Docker stack (plan 9A)

As spec 9.2, with these decisions:

- **Services:** `mysql` (8.0, named volume, healthcheck), `pine` (the bot), `watchdog` (4.1.3), and a commented slot for `cloudflared` that plan 8M fills.
- **Everything through Docker.** The host needs Docker and git only. Every operator step is a `docker compose …` command, wrapped in a small shell script at the repository root (name the builder's; `./pine <command>` is the working title): `up`, `down`, `logs`, `restore <dump>`, `backup`, `deploy-commands`, `check` (4.2.1), `convert-settings` (4.2.2) and the history import (4.3.4). None needs Node on the host.
- **Settings and secrets:** `.env` beside `compose.yaml`; `data/settings.json` bind-mounted.

#### 4.1.1 Restore

`./pine restore <dump.sql>` loads a dump into the stack's MySQL while `pine` is stopped: start only `mysql`, refuse if the schema is not empty unless told to replace it, load the dump, rename lower-cased legacy tables to the names the bot expects, then start `pine`; its migrator then sees a legacy database and takes it over as it already does (or a current Pine database and migrates it). It prints what it loaded (tables, rows of the main ones). The same code serves the backup verification (4.1.2).

#### 4.1.2 Backups

Nightly dump of the Pine schema to a directory the operator mounts (for Pittsburgh: an NFS share on the Synology on the local network; the details of mounting it are Matt's and go in the guide), named by date, 90 days kept (configurable). Every backup is verified: loaded into a scratch MySQL container next to the live one, checked (it loads, the main tables have rows, the migration table is there), and thrown away. A failed backup or failed verification sends Matt a DM (4.1.3). Where it runs (a scheduler container, a loop in the watchdog, a host timer) is the builder's call, as long as the host needs nothing besides Docker.

#### 4.1.3 Health, watchdog, alerts

- `pine` reports its health on a local endpoint (alive, connected to the gateway, database reachable); the Compose healthcheck uses it.
- `watchdog` is a small service of our own (the same image with another command is fine) that restarts `pine` when it stays unhealthy and DMs the owner.
- `pine` itself: on a fatal error it tries to DM the owner with the error before exiting; on every start after an unclean exit it DMs "restarted after a crash at <time>: <error>, restart n in the last hour".
- DMs go to the bot's owner (`OWNER_ID` or what the settings call it), through the REST API, plain text or a v2 message, not through `DmSender` when the gateway is down.

### 4.2 Cutover tools (plan 8C)

#### 4.2.1 `cutover:check`

Read-only. Runs from Matt's PC (where the new bot is today) against a local copy of the production database, with the production token through the REST API only (no gateway login, so the running legacy bot is not disturbed). Also runnable inside the stack. Reports, as pass / warn / fail lines:

- database: a fully migrated legacy schema the migrator will take over (or a Pine schema), the migrations that will run;
- forums: regions without a forum;
- permissions of the bot's role in the server and in each region channel and category (Manage Channels, Manage Threads, Manage Roles, and what posting in forums needs);
- intents the settings ask for and the application grants (expected: none needed);
- command restrictions in the legacy tables (expected: none);
- the settings: channel names that do not exist in the server, required values missing;
- application emoji uploaded;
- the legacy cleanup's list size (4.2.4), without deleting.

Run at the rehearsal and on the night, before the legacy bot is stopped; it is the last go / no-go.

#### 4.2.2 Settings converter

Reads a legacy `data/settings.json` and `data/private-settings.json`; writes the new `data/settings.json` and the `.env` lines. Keeps every value the new bot reads with its legacy value (channel names, `features.remoteRaidChannel` as the legacy file has it, durations), maps renamed keys (`ex-gym-raids` → `elite-gym-raids` and the like), carries `regionMapLink` from the private settings, drops what the new bot never reads and lists it, and lists the `.env` values the operator must add by hand (the tunnel token, new keys). Matt runs it himself (the private settings hold the token; Claude never reads them). Built for every instance, not only Pittsburgh. The later removal of obsolete settings (follow-ups, "Phase 8, at the end of the migration") stays where it is.

#### 4.2.3 Rehearsal mode

For rehearsals with the production token against a local copy of the production database while the legacy bot is switched off for a short window. A setting (or environment variable) that, while on:

- sends DMs only to an allowlist of member ids (Matt plus whoever he names);
- sends no announcements (boss changes, gyms, new trains, Unown gifts and the like);
- deploys the commands to the one server only, for staff and the allowlist, and a command removes them again at the end of the window;
- keeps the test forum (one region: squirrelbreeze) visible only to staff and the allowlist;
- is shown in the log at start and on the health endpoint, so it is never left on by accident.

#### 4.2.4 Legacy cleanup

`/admin cleanup-legacy`, in two steps: it lists every channel it would delete, with why, and deletes only after a person confirms. What is deleted: the channels of the legacy active parties (from the `parties/active` files' `channelId`), and **orphans**: channels that are legacy party channels by their category, name pattern and the legacy bot's own messages in them, but that no file names (left behind by legacy crashes). Valid legacy active parties go into the history first (4.3). The list step is read-only and is run against Pittsburgh in the rehearsal.

### 4.3 Party history (plan 8H)

#### 4.3.1 The shape

Live parties stay as they are (`Party` row with its JSON `state`). When a party ends, a history record is written to separate relational tables. Suggested (the builder designs the columns):

- a party row: kind (raid, meetup, train), the server, region, gym, boss and form, tier, shiny / mega / elite flags, the times (created, hatch, start, end), how it ended (completed, expired, cancelled, cutover), the creator (only if opted in), counts (interested, joined, here, done, +1s, remote), source (live or legacy import);
- an attendee row per member: the furthest status reached, group, +1s, remote, the times of the changes the bot knows; member id only if that member has opted in, otherwise null (the row still counts);
- a train stop row per stop: gym, order, arrival and departure times;
- a group row where groups matter (label, meeting time, size).

The SQL for the questions in 4.3.3 should be short joins and group-bys, not JSON extraction.

#### 4.3.2 Opt-in

Off by default. A member opts in through `/settings` (or what the builder finds fitting there); from then on their member id is stored in new history rows. Opting out stops it and removes their id from rows already stored (the rows stay, anonymous). Legacy history is always imported without member ids: everyone starts from zero, and legacy data serves aggregates only. The creator of a party and a train's conductor follow the same rule.

#### 4.3.3 Questions it must answer

Most active members (opted in); raids per gym, region, boss, tier; which bosses drew the largest groups; raids by hour of day, weekday, month, season; how fast groups filled (time from creation to n joined); interested or joined who never reached "here"; trains by length and stops; the busiest gyms for the map's hot spots later. The plan includes these as example queries in `docs/architecture/` and tests that they return what the fixtures say.

#### 4.3.4 Legacy import

A command run once per instance on the copied `parties/` folder (`complete/` and the valid parties of `active/`), best effort: imports what it can read, skips what it cannot, reports counts per reason. Idempotent (running it twice imports nothing twice). Gyms and bosses are matched to the database where the file allows; otherwise kept as given (a raw name). Not on the cutover's critical path: the folder is copied off before the format and can be imported after the cutover. Recording of live parties (4.3.1) is in place from the first day of the new bot.

### 4.4 The night (runbook; part of plan 8C, rehearsed)

1. Matt's PC: fresh dump from the old host, restored locally, `cutover:check` green (otherwise stop and fix).
2. Stop the legacy bot. Final dump. Copy off the dump, `<legacy bot folder>` (settings, private settings, `parties/`) to two places (Matt's PC and the Synology): the `parties/` folder holds tens of thousands of historical raids that exist nowhere else, and is kept even after its import.
3. Format the old host, install Debian 13, Docker, git; mount the NFS backup share; clone the repository from the git bundle (section 6).
4. Converter output (`settings.json`, `.env`) in place, secrets added; `./pine restore <final dump>`; `./pine up` (migrations run); `./pine deploy-commands` (global).
5. An admin: bot role permissions confirmed, `/admin setup-forums`, `/admin cleanup-legacy` list checked and confirmed.
6. Sanity checks (a raid, a train, a meetup, a DM, the website through the tunnel if 8M is in), then the final cleanup migration (4.5).
7. The announcement in #bot-updates; the history import whenever convenient.

### 4.5 After the cutover

- Final cleanup migration as soon as the sanity checks pass: drops `User.silph`, `CommandRoleAuthorization`, `CommandRoles` (all unused or empty).
- First push: `main-dev` gets the new bot with no legacy code at all; the legacy code lives on a `legacy` branch (from `main-dev` as it stands, tagged), which also carries the intents patch. The README points to the guides.

### 4.6 Legacy intents patch (plan 8L-1, first)

On the `legacy` branch only (cut from `main-dev`'s current tip; this is Matt's authorization for this one change to legacy code): legacy Pine starts and connects without the privileged intents (Server Members, Presence, Message Content). Features that need them may stop working; the patch lists which. Small; a setting or the intent list itself, the builder decides. Not tested on Discord by Claude without Matt's go-ahead.

Built 2026-10-16: commit 3b13f0c3 on the local branch `legacy` (from `main-dev` f600adc4). The intent list drops Server Members and Presence; guards stop an uncached member from throwing (permission checks in `role.js`, the reacting member in `party-manager.js`, a DM author's server in `helper.js`). What stops: notifications reach only members seen since start, no auto role for new members. Without Message Content (which the portal grants, not the code), commands still work with a mention as the prefix ("@Professor Pine join"): Commando accepts it. Syntax-checked with `node --check`; not run.

### 4.7 Guides and announcement (plan 8L-2, last)

- A guide for migrating an existing legacy instance (for an admin who followed none of this: is my instance affected and when, the stopgap patch, Docker, the converter, restore, forums, cleanup, what members notice), and one for a new instance; the README points to them. Markdown in the repository under `docs/guides/` unless their size argues for a wiki (builder's call).
- A draft of the #bot-updates post: "Professor Pine is back from a long slumber", semi-humorous, in the tone of that channel's earlier posts (reading them needs Matt's go-ahead to open Discord), covering the new look, the website, slash commands, screenshots only with `/raid` or a mention.
- The release announcement in the official Professor Pine Discord (Matt posts it).

## 5. Order

8L-1 (legacy patch) → 9A (Docker stack) → 8C (cutover tools, runbook, rehearsal) → 8H (history) → 8L-2 (guides, announcement) → the rehearsal → the night. Matt expects most of it within days. Each plan follows the project's method (prototype, review, plan, transcription).

## 6. Settled after the builder check (Claude's calls, 2026-10-16, for Matt to confirm)

- **Code on the new host before the first push.** Nothing is pushed before the cutover, so the host cannot clone from GitHub on the night. The repository travels as a `git bundle` (made on Matt's PC, copied with the dump), cloned from the bundle; after the first push the clone's `origin` is pointed at GitHub. The host still needs only Docker and git. `./pine update` (pull and rebuild) is part of 9A.
- **The operator script runs on Linux and in Git Bash on Windows** (the rehearsal runs on Matt's PC in Docker Desktop unless Matt names a Linux box, open question O1). It is POSIX `sh`, free of the Git Bash path and line-ending traps (`.gitattributes` keeps it LF). What only the real host can show (NFS, the nightly schedule over days) is checked on the night and in the first days, and the runbook says so.
- **Legacy `parties/`.** A read-only copy was taken from the old host on 2026-10-16 to `C:\Users\<you>\pine-backups\parties-20261016` (outside the repository: it holds member ids; never committed). Plan 8H builds its parsers and fixtures from it (fixtures made anonymous); 8C calibrates the orphan detection on it.
- **Cleanup and history are independent.** `/admin cleanup-legacy` reads the `active/` files only for channel ids; turning those 19 parties into history is part of 8H's import (`active/` and `complete/` alike), which can run before or after the cleanup. An `active/` party is "valid" for the history when its file parses and it has a creator, a creation time and at least one attendee; it is recorded as ended at the cutover (`cutover`). The operator mounts the legacy folder into the container for both commands (`./pine` takes its path).

### Open questions for Matt (the builder could not settle them)

- **O1. Where does the rehearsal run?** On Matt's PC (Docker Desktop) by default; a spare Linux box or VM would let NFS, the schedule and the watchdog be rehearsed on the real platform.
- **O2. Who sees the commands in the rehearsal?** A bot cannot give command access to single members; Matt's role "Bot Developer" lacks Manage Server, so staff-only commands would hide them from Matt himself. The clean way: a server admin restricts Professor Pine's commands in Server Settings → Integrations to Matt and the moderators for the rehearsal (the legacy bot has no slash commands, so nothing else is affected), and lifts it at the cutover. Needs an admin's step before each rehearsal window.
- **O3. Does the legacy patch go anywhere before the cutover?** Onto the old host now as insurance against a slipped cutover (a deployment and a test on the live bot, with Matt's go-ahead), and/or pushed early on `legacy` for other instances (an exception to the no-push rule)? Default: neither; it ships with the first push.

## 7. Left to the builder

The script's name and commands; how backups are scheduled without host tools; the health endpoint's address and what "connected" means; the watchdog's thresholds; the history tables' exact columns and indexes; how orphans are recognised in detail (from the legacy code and files); the rehearsal setting's name and shape; the guides' location. Each such choice is listed in its plan.
