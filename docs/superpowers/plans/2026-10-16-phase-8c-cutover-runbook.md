# Pittsburgh's cutover: the runbook

Matt and a server admin carry this out; an agent never runs it. It follows the cutover design (`docs/superpowers/specs/2026-10-16-cutover-docker-history-design.md`, section 4.4 and the open questions O1 to O3) and uses the tools of plan 8C (`docs/architecture/operations.md`, "Moving a legacy installation"). Two parts: the rehearsal, run once or more before the night, and the night itself. The new host is **the Air**, set up ahead of the night by [A Mac as Pine's host](../../guides/macos-host.md); the old host is not wiped, and the legacy bot stays there as the way back ("Going back", below).

Words used below:

- **the old host**: the Windows host that runs the legacy bot today (`<legacy bot folder>`, MySQL 8.0 with its nightly dumps in `<backup folder>\pine-YYYYMMDD.sql`). It keeps all of this after the night, the bot stopped.
- **the Air**: Matt's M1 MacBook Air (`<host>.local`, account `<account>`) on macOS with OrbStack, the new host. Its stack already runs MySQL and the backups with a placeholder token, which cannot log in.
- **the checkout**: Matt's clone of this repository on his PC, on branch `main-dev`.
- **the copy**: what is copied off the old host: the dump, the legacy `data\settings.json` and `data\private-settings.json`, and the `parties\` folder (its `active\` files name the channels of the parties that had not ended; `complete\` is the history that 8H imports).
- A step that says **contacts Discord** uses the production token: only in the order given here.

## Before anything

- [ ] Matt checks in the server that the bot's role has Manage Channels, Manage Roles, Manage Threads and Manage Messages (the last optional, for tidying the boards, plan 8R-9F; the cutover check lists all it needs, with why).
- [ ] An admin with Manage Server is on hand for the rehearsal's window and for the night (Integrations, `/admin setup-forums`, `/admin cleanup-legacy`).
- [ ] O1 (where the rehearsal runs): the Air, by default, so that the night repeats it; or Matt's PC with Docker Desktop, where the rehearsal of 2026-10-20 is paused at R4. The steps below are written for his PC and work the same on the Air (see Part 1). To move a paused rehearsal, R6 ends it on the PC and R2 starts again on the Air.
- [ ] O3 (the legacy intents patch): by default it ships with the first push and nothing goes to the old host before the night.
- [ ] The Air passes [its guide](../../guides/macos-host.md) up to and including section 7, and has come back by itself from a restart.

## Part 1: the rehearsal

The rehearsal is a second stack beside nothing else of production: its own project name (`pine-rehearsal`, which its env file names: `./pine` never sets it, so that a rehearsal's `down` or `restore --replace` cannot act on another stack), its own files under the git-ignored `var/rehearsal/` of the checkout, its own image (`professor-pine:pine-rehearsal`), no backups. Every `./pine` command of this part runs at the checkout's root (Git Bash on Matt's PC, SSH on the Air) with these two variables set first:

```sh
export PINE_ENV_FILE=var/rehearsal/.env
export PINE_SETTINGS=./var/rehearsal/pine-settings.json
```

On the Air the rehearsal stack stands beside the idle `pine` stack in `~/professor-pine` and shares nothing with it; the paths below become the Air's: the copy in `/Users/<account>/pine-rehearsal/` instead of `C:\Users\<you>\pine-backups\rehearsal\`, and `LEGACY_PARTIES_DIR` that folder's `parties` in full. "Docker Desktop" in R6 reads OrbStack, which also brings a stack left up back after a restart.

### R1. The admin restricts the commands (O2)

A bot cannot give command access to single members. During the rehearsal the commands are registered for the one server only, each as it is (member commands for everybody, the staff commands `/admin`, `/gym`, `/region` with Manage Server as their default permission), and the admin restricts the application as a whole to staff and the testers under Integrations, so members see no Professor Pine command; rehearsal mode itself answers only staff and the allowlist besides. Staging on 2026-10-16 showed that an allow for the application as a whole does **not** beat a command's default permission, while an allow on the command itself does: so Matt, who has no Manage Server, is added to the three staff commands by hand.

- [ ] First, on the test server with the dev application (Matt's go-ahead; nothing of production), with a scratch settings file and never the tracked `data/settings.json`: copy it to `var/stage/rehearsal-settings.json`, add a `rehearsal` block, and run each command below with `SETTINGS_PATH=var/stage/rehearsal-settings.json`. The dev application's global commands show to everybody whatever the server's copies say, so take them away first for this check (register them again afterwards with `--global` from the ordinary staging settings). Deploy with `npm run deploy-commands -- --rehearsal`. Then under Server Settings → Integrations → the application, set "Roles & Members" of the application as a whole: @everyone off, the test account Tester on. Check: Tester is offered `/raid`, and not `/admin` until it is added to `/admin` itself on the same page; a second account outside that list (or Tester after taking it off the list again) is offered no Professor Pine command. End with `npm run deploy-commands -- --clear-guild` (same `SETTINGS_PATH`), give @everyone the application back, and register the global commands again: the test server is as it was.
- [ ] Also on the test server, before R5, a hidden forum made by a bot that is no administrator (production's role may not be one):
  1. In the scratch settings, rehearse one region of the test server that has no forum (`settings.rehearsal.regions`, its channel's name as written). If every region has one, note one region's forum id and clear its forum in the dev database as in step 5 (the old forum stays in Discord, untouched).
  2. Server Settings → Roles → the dev bot's role: take Administrator off, and make sure the role itself gives Manage Channels, Manage Roles, Manage Threads, Manage Messages, View Channel, Send Messages, Send Messages in Threads, Embed Links, Attach Files, Read Message History and Add Reactions (from the role, not through a category: a creation may give only what the bot has in the server).
  3. Start the bot in rehearsal mode (scratch settings as above) and run `/admin setup-forums`: the region's line says "created", "hid it from all but staff and the testers" and "posted and pinned the board" (plan 8R-9F: open to members' commands; "but I may not delete what members write in it" where the forum withholds Manage Messages). A forum that is not made says why ("I could not make this forum hidden from members…").
  4. Check the forum is hidden: a test account without a staff role and outside the allowlist does not see it; the forum's Permissions page shows View Channel denied to @everyone. If the category gives the bot something its role does not, the log may warn "a new hidden forum stays as it was made: Discord refused the bot … there, which only the category gives it": the forum is still hidden; note what it names (a finding for the night).
  5. Undo it: stop the bot; delete the new forum in Discord; clear the region's forum in the dev database (`docker exec -it pine-dev-mysql mysql -u <user> -p <schema> -e "UPDATE Region SET forumChannelId = NULL WHERE channelId = <region channel id>"`, or the noted forum id instead of `NULL` for a region that had one); give the dev bot's role Administrator again.

- [ ] The admin opens Server Settings → Integrations → Professor Pine and, under "Roles & Members" of the application as a whole, takes @everyone off and adds Matt, every member of the allowlist below and the moderators' role. Then, on the same page, the commands `/admin`, `/gym` and `/region` one by one: add Matt to each (he has no Manage Server; the moderators have it). Since 2026-11-09 Matt is a moderator of Pokemon GO Pittsburgh with access to this page: he does this step, R5's `/admin` steps and R6's forum deletion himself, and the per-command adds are not needed (check that the page saves a change first). The legacy bot has no slash commands, so nothing else changes.
- What to check: after R5, Matt sees `/raid` and `/admin` in the server; a member's account (a test account, if there is one) sees no Professor Pine command. If Matt does not see `/raid`, look at the application's list again; if he does not see `/admin`, at the command's own entry; if a member sees any command, end the window (R6) and look at the Integrations page again.

### R2. The copy and the settings

- [ ] On the old host: copy the newest nightly dump (`<backup folder>\pine-YYYYMMDD.sql`), `<legacy bot folder>\data\settings.json`, `<legacy bot folder>\data\private-settings.json` and `<legacy bot folder>\parties\` to Matt's PC, outside the checkout (say `C:\Users\<you>\pine-backups\rehearsal\`): they hold the token and member ids.
- [ ] Settings and `.env` from the legacy files (Matt runs it: it reads the private settings):

  ```sh
  mkdir -p var/rehearsal
  ./pine convert-settings /c/Users/<you>/pine-backups/rehearsal/data --out var/rehearsal
  ```

  It prints what it kept, renamed and dropped, and which values of `.env` are set or empty, never a value. Check the line "New settings at their defaults": the `timezone` (America/New_York) is right for Pittsburgh.
- [ ] `cp .env.example var/rehearsal/.env`, then put the lines of `var/rehearsal/env-from-legacy.txt` into it and fill in by hand: `COMPOSE_PROJECT_NAME=pine-rehearsal` (first of all: it names the stack), `DISCORD_APP_ID` (Developer Portal → the production application → General Information), `DB_ROOT_PASSWORD` (new, anything), `DB_USER` if the legacy one was `root`, `BACKUP_DIR=` blank (no backups in a rehearsal), `LEGACY_PARTIES_DIR=C:/Users/<you>/pine-backups/rehearsal/parties` (in the form Docker Desktop takes, with forward slashes). Leave `COMPOSE_PROFILES` and `CLOUDFLARE_TUNNEL_TOKEN` blank: the web pages and their tunnel stay off during a rehearsal. Check that `OWNER_ID` is Matt's id: the owner's alerts are direct messages that go past the allowlist. Then delete `var/rehearsal/env-from-legacy.txt`.
- [ ] Turn rehearsal mode on in `var/rehearsal/pine-settings.json` (top level):

  ```json
  "rehearsal": {
    "allowlist": ["<Matt's user id>", "<each tester's id>"],
    "regions": ["squirrelbreeze"],
    "staffRoles": ["<the moderators' role name>"]
  }
  ```

  No `web` block in `var/rehearsal/pine-settings.json` (the converter writes none): in rehearsal mode the bot serves no web pages, and its log warns of a `web` block if there is one.

### R3. The database

- [ ] `./pine restore /c/Users/<you>/pine-backups/rehearsal/pine-YYYYMMDD.sql --no-start` (a later rehearsal: add `--replace --no-backup`). It says "Loaded a legacy Professor Pine database", the tables and their rows, and that it renamed the lower-case tables.
- [ ] `./pine migrate`: the takeover runs without logging in. A failure here is a finding for the night: stop and look.

### R4. The go / no-go, with the legacy bot still running (contacts Discord, reading only)

- [ ] `./pine cutover-check --legacy-parties /c/Users/<you>/pine-backups/rehearsal/parties`
- What to check: no `FAIL`. Expected warnings: every region without a forum (the night makes them), perhaps a few channels or roles of the settings that the server lacks (fix the settings or the server). `intents` passes (the settings ask for none). `emoji` warns until R5's upload. `cleanup` counts the legacy channels to delete and the trains, meetups and saved parties that stay (Pittsburgh: 16 trains and 3 meetups, none saved, in the rehearsal's copy of the folder); a `WARN` there lists channels a person judges on the night. On a `FAIL`: the line says what; fix it (the bot's role, a category's overwrites, `DISCORD_APP_ID`) and run the check again.

### R5. The rehearsal's window (contacts Discord; the legacy bot is off for its length)

- [ ] Stop the legacy bot on the old host (as it runs there), and make sure it cannot start again by itself while the new one is logged in (its service set to manual, a scheduled task or a watchdog that restarts it switched off): two bots on one token take each other's gateway sessions.
- [ ] `./pine emoji-upload` (a dry run), then `./pine emoji-upload --apply`: the application gets the game's icons (once; later rehearsals find them).
- [ ] `./pine deploy-commands --rehearsal`: the commands as the server's own, each as it is; R1's restriction under Integrations keeps them from members. (`--global` is refused while rehearsal mode is on.)
- [ ] `./pine up`, then `./pine status`: the bot's line ends with "REHEARSAL MODE IS ON". Matt gets a DM "Professor Pine started: rehearsal mode is on…". The log (`./pine logs pine`) starts with the warning line.
- [ ] The admin runs `/admin setup-forums`: only `squirrelbreeze` gets a forum, "hid it from all but staff and the testers", and the closing line says rehearsal mode. A member's account must not see the forum.
- [ ] Matt, in `#squirrelbreeze`: a raid (`/raid`), a train, a meetup; sign up, change, end. Each post is in the hidden forum; nothing appears in `#squirrelbreeze` itself (no "New raid" link), nor in the remote or elite channels, nor in bot-updates.
- [ ] A DM: Matt sets a want (`/want`), and a second tester of the allowlist reports that boss (the one who reports is never told of their own raid): Matt's DM comes. A want of a member not on the allowlist gets nothing (within a minute the log says "rehearsal: direct messages to members not on the allowlist were dropped", with how many).
- [ ] `/admin cleanup-legacy` (the admin): the list, with "Rehearsal mode: nothing is deleted now" and no Delete button. Check the list against the server: every "To delete" entry is a legacy raid channel or an orphan; no legacy train or meetup is in it (they are under "Not deleted … which stay as plain channels", with name, day made and sign-ups); every other "Not deleted" entry is judged.
- [ ] A screenshot posted with a mention of the bot gets no answer, not even Matt's (the trigger is off in rehearsal mode); `/raid` with a screenshot is answered privately. A command used in a region channel answers privately; `/request` is refused.

### R6. The end of the window

- [ ] `./pine deploy-commands --clear-guild`: the server's commands go (the night registers them globally; both at once would show each command twice). It names each server first and says each removal or failure.
- [ ] The admin deletes the rehearsal's forum (`squirrelbreeze-board`; `-meetups` before plan 8R-9) by hand: the night's database knows nothing of it.
- [ ] `./pine down` (after the removal, which starts the database for its list of servers), then `./pine status`: nothing of the rehearsal runs. (A stack left up would come back with Docker Desktop, `restart: unless-stopped`, and log in with the production token beside the legacy bot.)
- [ ] After the last rehearsal: the rehearsal's volumes hold a copy of production's members: `docker volume ls --filter name=pine-rehearsal`, then `docker volume rm` each of them (`pine-rehearsal_mysql-data` and the others it lists), and delete `C:\Users\<you>\pine-backups\rehearsal\` and `var/rehearsal/`.
- [ ] Start the legacy bot on the old host again, and let it restart itself again as before. The Integrations restriction stays until the night (the legacy bot has no slash commands).
- What failed or surprised goes to the follow-ups ("From the rehearsal").

## Part 2: the night

### N1. The last go / no-go (where the rehearsal ran, the legacy bot still running)

- [ ] On the old host, a fresh dump (the nightly one may be a day old):

  ```bat
  "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u root -p --single-transaction --routines --triggers --events --hex-blob <schema> > <backup folder>\pine-cutover-check.sql
  ```

  (`<schema>` is `db.schema` of the private settings; the dump must end with `-- Dump completed`.)
- [ ] Copy it to the rehearsal's host, `./pine restore <it> --replace --no-backup --no-start` and `./pine cutover-check --legacy-parties <the parties copy>` in the rehearsal stack (the variables of Part 1 set, rehearsal mode left on: the check does not log in). No `FAIL`, or stop the night here.

### N2. Stop the legacy bot; the final copy

- [ ] Stop the legacy bot on the old host, and make sure it cannot start again by itself (its service set to manual, a scheduled task or a watchdog that restarts it switched off): the old host stays up, and two bots on one token take each other's gateway sessions. From here on the server has no bot.
- [ ] The final dump, as in N1, to `<backup folder>\pine-final.sql`.
- [ ] Copy `<backup folder>\pine-final.sql`, `<legacy bot folder>\data\` and `<legacy bot folder>\parties\` to Matt's PC. The originals stay on the old host; the `parties` folder holds seven years of raids that exist nowhere else, and it is kept after its import.


### N3. The Air

- [ ] On the Air: `./pine status` in `~/professor-pine`: MySQL and the backup service run, the last backup is verified, the bot is not running.
- [ ] The copy onto the Air, from Matt's PC, into a folder kept to the account (`ssh <account>@<host>.local "mkdir -p ~/legacy && chmod 700 ~/legacy"`, then `scp -r` of `pine-final.sql`, `data` and `parties` to `<account>@<host>.local:legacy/`).
- [ ] The code, on the Air: `git pull` in `~/professor-pine` (branch `main-dev`, from GitHub).

### N4. Settings, database, start (contacts Discord from `./pine up` on)

- [ ] `./pine down`: the placeholder stack stops; its database is replaced below. Then `./pine convert-settings ~/legacy/data --force` (writes `pine-settings.json` over the placeholder one, and `env-from-legacy.txt`, beside `compose.yaml`; no rehearsal block).
- [ ] In the new `pine-settings.json`, under `channels`: `"moderation": "mod-bot-only"` (Matt, 2026-11-02): the converter leaves it unset, which leaves meetup safety off.
- [ ] `cp .env.example .env` over the placeholder one; put in the lines of `env-from-legacy.txt` and fill in: `DISCORD_APP_ID`, `DB_ROOT_PASSWORD`, `DB_USER` if it was root, `BACKUP_DIR=/Users/<account>/pine-backups`, `LEGACY_PARTIES_DIR=/Users/<account>/legacy/parties`, `LEGACY_INDEX_DIR=/Users/<account>/legacy/legacy-index` (the member index the history import writes, plan 8H-10; `./pine` makes the folder). Then `chmod 600 .env` and `rm env-from-legacy.txt`.
- [ ] The web pages, [the guide's section 9](../../guides/macos-host.md#9-the-tunnel-the-web-pages) and `docs/web-setup.md`: the `web` block in `pine-settings.json`, `COMPOSE_PROFILES=tunnel` and `CLOUDFLARE_TUNNEL_TOKEN` in `.env`. Only the night proves them: the tunnel and the login need a running bot.
- [ ] `./pine restore ~/legacy/pine-final.sql --replace --no-backup --no-start`, then `./pine migrate`. On a failure: the sentence says why; fix forward from the dump (`./pine restore … --replace --no-start` starts again).
- [ ] `./pine backup`: the first verified backup of the real data lands in `~/pine-backups`. On a failure: `./pine status` says the reason.
- [ ] If the busiest regions' gyms should be asked of Google first (plan 8W-6): `./pine import-history ~/legacy/parties` now (N7 says what it prints; it needs no Discord), or at least before the first `/gym import`, then `./pine restart`. The line that waits for Google ranks the regions by their raids of the last 90 days in the party history, read at the start and once a day; without the history every region ranks alike, and the gyms go by the time they were queued until the import is in and read.
- [ ] `./pine up`, then `./pine status`: healthy, connected, the last backup, and no "REHEARSAL MODE" in the line. `./pine logs pine` shows the takeover's migrations, then "connected to Discord".
- [ ] `./pine deploy-commands` (global; the commands can take a while to show).

### N5. The admin

- [ ] Server Settings → Integrations → Professor Pine: lift the rehearsal's restriction (R1): @everyone on again for the application, so that members see the commands. Matt's entries on `/admin`, `/gym` and `/region` may stay (they let him use the staff commands without Manage Server).
- [ ] The bot's role: what the cutover check asked for, if anything is still missing.
- [ ] `/admin setup-forums`: every region gets its forum (`<channel>-board`), its tags and its board, the pinned post "Today and coming up" with "Today’s Stops" below it, open to members' commands (plan 8R-9F). A region that fails says why (most often a category's overwrites: Manage Channels, Manage Threads); one whose forum withholds Manage Messages says the bot may not delete what members write in the board (a warning in `cutover-check` too).
- [ ] **The regions are the dev instance's** (Matt, 2026-11-07: on the dev instance he fixed the slivers and removed many redundant corners, so production takes those outlines, not the legacy ones). Before the window, on the dev instance: `/region export`, keep the KML file. Here: `/region import` with that file, read the preview (every area should name an existing region channel by its name; an area that would make a new channel means a name differs on production: stop and fix the name, never let it create a channel), then apply. Then `/region edit` shows no slivers or gaps to fix (they were fixed on dev); if it lists any, **Fix all slivers…** → **Save** as below.
- [ ] Only if the import above left slivers: `/region edit` → **Fix all slivers…** (take the midline unless a moderator knows better) → **Save**: the outlines are written to the database at once (no KML round trip); the list then holds only what must be drawn by hand. Staged on the test server with Pittsburgh's 28 outlines on 2026-10-18 (71 stretches fixed, no gap left, 2 s for the server's check).
- [ ] `/admin cleanup-legacy`: read the list. "To delete" holds the raid channels of the legacy files and the orphans; "Not deleted" is for a person (delete by hand what should go). The legacy trains, meetups and saved parties are listed apart and stay (Matt, 2026-10-21): delete by hand the dead ones (the list gives each one's name, the day it was made and how many signed up); the rest stay as plain channels for discussion ("Wayfarer Discussion and Planning", the PokéStop submission threads, tourney signups), their old status post unanswered. Then "Delete these n channels" within ten minutes; the answer says what was deleted, what was gone and what failed. More than 400 channels go in runs of 400 ("Delete 400 of these n"): run `/admin cleanup-legacy` again for the rest.

### N6. Sanity checks

- [ ] A raid, a train, a meetup in a region: the post, the link in the region channel, sign-ups, the end.
- [ ] A DM from a want; the Stop button.
- [ ] A screenshot with a mention of the bot.
- [ ] The website through the tunnel, if plan 8M is in.
- [ ] The Wayspot export tool (plan 8W-P; production is the owner's instance): from Matt's checkout of the private repository, `deploy.json`'s target `<account>@<host>.local:/Users/<account>/professor-pine/wayspot-tool` (the folder in full: a `~` is refused), then `npm run deploy`. Then `<publicUrl>/userscript`: the login, and after it the owner's list and **Make my link**; Matt installs from his link (after removing any copy installed before from Pine's own build, `2.0.0-dev`). `docs/web-setup.md`, section 6.
- [ ] Then the final cleanup migration of the design (4.5), once it is built; until then nothing.

### N7. After

- [ ] The announcement in #bot-updates (plan 8L-2's draft).
- [ ] The history import of the legacy parties (plan 8H), if not run in N4, whenever convenient after the night (not on its path; the bot may run meanwhile, and nothing contacts Discord; the line for Google ranks the regions by it from the next day, or at once after `./pine restart`): `./pine import-history ~/legacy/parties`. It runs the migrations, then reads the folder (mounted read-only) and prints counts only, ending with `Parties read: … Imported: … Already there: … In the files twice: … Not written: ….` and a `Skipped:` line; with `LEGACY_INDEX_DIR` set it also writes the member index there (plan 8H-10), one `Member index: n members of server <id> (m entries).` line per server (for Pittsburgh about 6,750 members and 776,000 entries), or `Member index kept as it was: …` where a file could not be read or a party written and the server had an index already (then fix that and run it again before members press "Add my old-bot history"); on the first run the server's index is written all the same, its line ending `(m entries; k parties left out).`: fix that and run it again, which rebuilds it whole. After the report `./pine` checks the index's folders again: then look for the warning `pine: the bot (user 1000 in its container) may not read the member index …` (members are offered no old-bot history until `chmod -R o+rX` on the folder), or run `./pine restart`, which checks them too. For Pittsburgh expect about 253,000 parties, all imported on the first run, `Not written: 0`; a second run says them all "Already there". Exit 0: done. Exit 1: refused or failed, and the sentence says why (the folder, the migrations, no file readable, records not written): fix it and run it again, it writes nothing twice and finishes what was left. Exit 2: the arguments were wrong. `--server <id>` (and a second run) only if the `Skipped:` line counts parties "of no known server" (their region is gone and the server could not be told). The folder is kept afterwards (N2).
- [ ] The sponsored places and the first Wayfarer import (Matt, 2026-10-22; not on the night's path, but close to it, and before any other import; follow-ups, "From the sponsored export and the first import's dry run"). The files are git-ignored in `var/sponsored-export/` on Matt's PC: copy `sponsored-gyms.csv` and `sponsored-stops.csv` to `~/legacy/` on the Air.
  1. `./pine seed-gyms ~/legacy/sponsored-gyms.csv --server <id>`, then again with `--apply`: it marks the 11 sponsored legacy gyms "not in Wayfarer" (legacy ids 1424, 1453, 1454, 1455, 1468, 1472, 1531, 1534, 1483; 3122; 2996), adds the other 14 and marks them too. A `wrong` line, and exit 1, is a row naming the wrong gym: stop and look. Then `./pine restart pine`, so that the bot reads them, and `/gym move` gym 1483 (Starbucks, Washington) to 40.1864379, -80.2281886: the map has it there, 62 m from legacy's place.
  2. `./pine seed-stops ~/legacy/sponsored-stops.csv --server <id>`, then again with `--apply`: the sponsored stops.
  3. A fresh Wayfarer export of every region: what is gone is decided by the scan's date, so not an older file.
  4. `/gym import` it and work through `/gym review`; answer Delete for legacy gyms 3066, 3071 and 3072 (Verizon), which are sponsored stops now, seeded in step 2 (the dry run on 2026-10-22 asked about 150 questions, and added about 2,600 gyms: worth a line in the announcement).
- [ ] The next morning: `./pine status` shows the night's backup (03:30) as verified; `~/pine-backups` has `pine-backup-YYYYMMDD.sql.gz`.
- [ ] Copies off the Air: the Synology pulls `~/pine-backups` nightly ([the guide's section 8](../../guides/macos-host.md#8-backups-off-the-mac)). Until that runs, the only copy of a new backup is on the Air.
- What only the real host shows, and is watched in the first days: the nightly schedule over several days, the stack after a macOS update, the watchdog's alerts (a DM to Matt if the bot is stuck or a backup fails).

### Going back

The takeover ran on a copy, so the old host's database and folders are as the legacy bot left them. Until `/admin cleanup-legacy` deletes the raid channels (N5), going back is whole; after it the legacy bot runs without those channels, which cannot be brought back. It works only while the production application still has its privileged intents (until about 2026-11-11; follow-ups, "Needs Matt").

- [ ] On the Air: `./pine down`, and make sure nothing starts it again (`restart: unless-stopped` holds only for a stack left up).
- [ ] The global commands stay registered until the bot is back; `./pine deploy-commands` has no way to take global ones away, so they answer nothing meanwhile (the legacy bot has no slash commands).
- [ ] On the old host: let the legacy bot start by itself again, as it did before N2, and start it.
- What members did on the new bot in between is not carried back.

### N8. The first push (done 2026-11-01)

- [x] The migration was pushed as one commit on top of the old bot, on `main-dev`; the old bot with its intents patch is the branch `legacy`; the local history is kept in a private backup, on the Synology and Matt's PC.
- [x] The Air's clone: `git remote set-url origin https://github.com/Googer/Professor-Pine.git`, `git fetch origin`, then `git switch -C main-dev origin/main-dev` once, so that `./pine update` pulls from then on.
- [ ] The old host's checkout must never pull `main-dev`: it holds the new bot. Its updates come from `legacy` only.
- [x] The private repository is `Googer/Professor-Pine-Wayfarer-Export`; its `package.json` names Pine's package by a path beside it, so its checkout stays beside a Pine checkout.

## After the move: the tutorial (plan 8M-18)

Once the commands are deployed, `emoji:upload` has run and the bot has restarted since (it reads the emoji at its start), and not before (the legacy tutorial stays right until then): a moderator deletes the old posts of `#raid-bot-tutorial` and runs `/admin tutorial` there. Not in rehearsal mode, which refuses it.

Where the history import (N7) runs after that, with `LEGACY_INDEX_DIR` set: once `./pine import-history` has written the member index, run `/admin tutorial` there again (plan 8H-10). It edits its messages in place, and its line about `/settings` then mentions "Add my old-bot history", which it leaves out while the server has no index.
