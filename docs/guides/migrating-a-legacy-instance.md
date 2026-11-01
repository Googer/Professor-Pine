# Moving a legacy Professor Pine to the new Pine

This guide is for the admin of a Pine server that still runs the old JavaScript bot (discord.js-commando, `!` commands, a channel per raid). It covers whether your bot is affected by Discord's change to privileged intents and by when, what to do if you cannot move in time, the move itself step by step, and what your members will notice.

The new Pine is a rewrite in TypeScript. It keeps your database, your regions, gyms and member settings, and needs **no privileged intents**. Each raid, max battle, train and meetup gets a post in a forum, with buttons instead of reactions, and members use slash commands. It runs as a Docker stack, so the machine needs Docker and git, and nothing else.

Starting a new Pine server from scratch? See [Starting a new Pine instance](new-instance.md) instead.

## Contents

1. [Am I affected, and when?](#1-am-i-affected-and-when)
2. [Not ready in time: the stopgaps](#2-not-ready-in-time-the-stopgaps)
3. [Before you start](#3-before-you-start)
4. [The move, step by step](#4-the-move-step-by-step)
5. [What your members will notice](#5-what-your-members-will-notice)
6. [After the move](#6-after-the-move)

## 1. Am I affected, and when?

Discord has three **privileged intents**: Server Members, Presence and Message Content. Once the servers an application is in have 10,000 unique users between them, Discord reviews whether the application may keep them. An application that did not apply for review loses them on a date Discord sets for it. Discord tells the application's owner by e-mail, and the e-mail gives the date.

To see where you stand:

- Look for that e-mail from Discord. It went to the owner of the application (or of the team that owns it).
- Open the [Discord Developer Portal](https://discord.com/developers/applications), your bot's application, then the **Bot** page, and read what it says under **Privileged Gateway Intents**. Discord has not documented exactly what an affected application shows there, so trust the e-mail over the page.

Why this matters for the legacy bot: it asks for Server Members and Presence when it logs in, and it reads `!` commands from the text of messages, which needs Message Content. Discord refuses a login that asks for an intent the application does not have, so on that date the legacy bot stops connecting.

If your server is under the threshold, you are not affected yet. Move anyway: the legacy bot is no longer maintained, and every fix and feature from now on goes into the new Pine.

**From now on, update the legacy bot's folder only from the `legacy` branch** (section 2b). The `main-dev` branch now holds the new Pine: a `git pull` of `main-dev` in the legacy bot's folder brings in the rewrite, and the running bot breaks.

## 2. Not ready in time: the stopgaps

### a. Apply to Discord for review

You can ask Discord to let your application keep the intents. You apply from the Developer Portal: Discord's e-mail and its article "What are Privileged Intents?" say how. You explain what the bot uses each intent for. Discord may refuse, and the review takes time, so apply well before your date. The new Pine needs none of these intents, so you only need this to keep the legacy bot running longer.

### b. The legacy bot without the privileged intents

The `legacy` branch of this repository is the old bot with one small patch: it stops asking for Server Members and Presence when it logs in, and it no longer crashes on members it has not seen. With it the legacy bot keeps connecting after your date, but it can do less:

- **Notifications** (wants, gym targets) reach only members the bot has seen since it last started, by their posts or reactions. A bot restart forgets them again.
- **No auto-assigned role** for new members (the bot no longer hears that somebody joined). Discord's own onboarding (Server Settings → Onboarding) can give new members a role instead.
- A raid moved to a region a member cannot see gives access only to members the bot has seen since it started.
- **`!` commands stop working** once Message Content is gone, because the bot cannot read the text of messages any more. Commands still work when they start with a mention of the bot instead of the `!`: `@Professor Pine join` instead of `!join`. Tell your members, and tell them to pick the bot itself from the list Discord shows when they type `@`, not a role of the same name.

To switch to it, in the folder the legacy bot runs from, stop the bot, then:

```bash
git fetch origin
```

```bash
git checkout legacy
```

Then start the bot as you always do. If your clone's `origin` is a fork rather than `Googer/Professor-Pine`, fetch the branch from the original instead:

```bash
git fetch https://github.com/Googer/Professor-Pine.git legacy
```

```bash
git checkout -b legacy FETCH_HEAD
```

The patch touches only `index.js`, `app/helper.js`, `app/party-manager.js` and `app/role.js`. If you changed one of those files yourself, git refuses the checkout and names it: keep a copy of your change, undo it (`git checkout -- <file>`), and switch again. If your copy of the legacy bot is older than the branch, it may need `npm install` as after any update; it also applies the legacy database migrations when it starts, which the move below needs anyway.

The patch was checked for mistakes in its code but has not been run against Discord. Watch the bot's log after you switch.

## 3. Before you start

You need:

- **A machine with Docker (with Compose) and git.** Linux is the usual choice (for example Debian with Docker Engine from [Docker's own instructions](https://docs.docker.com/engine/install/)). Windows works too, with [Docker Desktop](https://docs.docker.com/desktop/) and Git Bash (it comes with [Git for Windows](https://git-scm.com/download/win)): run every command of this guide in Git Bash. The new Pine can run on the same machine as the legacy bot: its MySQL lives in the stack and opens no port, so it does not clash with the MySQL the legacy bot uses.
- **A dump of the legacy database**, made with `mysqldump` (below). The lower-case table names that MySQL on Windows makes (`guild`, `gymmeta`) are fine: the restore renames them.
- **The legacy bot's files:** `data/settings.json`, `data/private-settings.json` and the `parties/` folder (it sits beside `data/` in the legacy bot's folder and holds `active/` and `complete/`). `private-settings.json` holds your bot's token, and `parties/` holds member ids: keep the copies somewhere private, outside the new clone. The final copies are made once the legacy bot is stopped (4.5).
- **An admin of your Discord server for the evening.** The admin commands of the new Pine are offered to members with **Manage Server**, and answered only for members who also have a role named `admin`, `moderator` or `bot developer` (any capitals), or who are the bot's owner (`OWNER_ID`), as the legacy bot did. Setting up the forums may also need changes to the bot's role and to your categories' permissions, so an Administrator is the easiest choice.
- **An evening of downtime.** Plan a few hours with no bot. Whether you warn your members beforehand is your call.
- **The bot's application ID**: Developer Portal → your application → **General Information** → Application ID. The legacy bot never needed it.

The new Pine uses the **same Discord application and token** as the legacy bot. Nobody re-invites anything.

The move has been tried with dumps from MySQL 8.0. A dump from an older MySQL (5.7) or from MariaDB has not been tried: if that is what you run, do the dry run (step 4.2) first.

## 4. The move, step by step

The commands below are run in the new clone's folder (`./pine help` lists them all). Paths such as `~/pine-legacy` are examples; use your own.

**Never start the new bot while the legacy bot is running.** Both would answer and act on your server at once. Only `./pine up` (and `./pine restart`, `./pine update`, and `./pine restore` without `--no-start`) logs the new bot in; every other step below works while the legacy bot is still up.

### 4.1 Get the code

```bash
git clone --branch main-dev https://github.com/Googer/Professor-Pine.git ~/professor-pine
```

```bash
cd ~/professor-pine
```

Copy the legacy bot's `data/` folder to a private place outside the clone, such as `~/pine-legacy/data`, for the settings of 4.3. The final copies of `data/` and of `parties/` (to `~/pine-legacy/parties`) are made in 4.5, once the legacy bot is stopped; the steps below use those paths.

### 4.2 Optional, but recommended: a dry run first

Steps 4.3, 4.4, 4.6 and 4.7 do not log the bot in, so you can do them days before while the legacy bot keeps running. Copy the legacy `parties/` folder to `~/pine-legacy/parties` for it now too, and make a dump now with the `mysqldump` command of 4.5 (its `--single-transaction` lets the legacy bot keep running while it dumps); skip the stop of 4.5. That shows you whether your database loads and what `cutover-check` complains about, and leaves only the short part for the evening. On the evening you then go from 4.5 on: stop the bot, copy the files afresh, make the final dump, and add `--replace` to the restore (it replaces what the dry run loaded).

A full **rehearsal**, in which the new bot really runs for an hour against a copy of your database while members see nothing of it, is also possible: the settings have a rehearsal mode (`rehearsal` in `pine-settings.json`: direct messages only to an allowlist, nothing posted outside hidden test forums, commands registered in your server with `./pine deploy-commands --rehearsal`, kept from members by restricting the application under Server Settings → Integrations, and taken away with `--clear-guild`). It needs a second stack beside the real one and a window in which the legacy bot is off. Pittsburgh's [cutover runbook](../superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md) shows how one server did it, step by step; take it as an example, not as instructions for your server. The tools themselves are described in [operations.md](../architecture/operations.md), "Moving a legacy installation".

### 4.3 Convert the settings

```bash
./pine convert-settings ~/pine-legacy/data
```

It builds the bot's image (the first time takes a few minutes), then reads the legacy `settings.json` and `private-settings.json` and writes two files beside `compose.yaml`:

- `pine-settings.json`: the new bot's settings. Every value the new bot still reads keeps your legacy value (channel names, durations, the feature switches such as `features.remoteRaidChannel`), renamed keys are mapped (`ex-gym-raids` becomes `elite-gym-raids`), and keys nothing reads any more are dropped. The result is checked by the bot's own loader before it is written.
- `env-from-legacy.txt`: the lines of `.env` made from your private settings (the token, the owner, the database, the Google key and so on).

It never overwrites either file unless you add `--force`. It reads your private settings, so run it yourself; it prints only names and "set" or "empty", never a secret.

Read what it prints, especially:

- **"New settings at their defaults"**: settings the legacy bot did not have. The **`timezone`** is among them, and its default is `America/New_York`. Change it in `pine-settings.json` to yours (an IANA name such as `Europe/London` or `America/Chicago`): every time members type is read in it.
- **"Off, because the legacy file lacks them"**: switches the legacy bot read as off. They stay off.
- The **channel names** under `channels` (the bot lab, the moderators' channel, Unown sightings, the elite and remote raid channels, the PvP channel, bot updates) must be the names your server uses. `cutover-check` (4.7) tells you which it cannot find.
- **Meetup safety** is new and off until you add `"moderation": "<channel>"` under `channels`: a staff-only channel (never bot updates), visible to every staff role (each role named `admin` or `moderator`: a moderator who cannot see it cannot open the links of `/places` and the reports), where meetups at a pin, or at a place whose name sounds private, wait for a moderator's approval, and blocked members' appeals arrive. Add it now or after the move; `cutover-check` warns while it is missing. During a rehearsal its posts go through (the testing staff see them); nothing else of the bot is posted there. `"meetupSafety": { "flaggedWords": [...] }` adds words to the names held for a moderator.
- **The events forum** is new and off until you add `"events": "<forum name>"` under `channels` and run `/admin setup-forums` after the move: a forum of the game's events beside your bot-updates channel, with the bot's pinned listing and a post per bigger event (`eventsForum` sets how far the listing reaches, 35 days, and how early a post opens, 14). `cutover-check` warns where the forum is named and missing. A rehearsal leaves it out.

### 4.4 Fill in `.env`

```bash
cp .env.example .env
```

Put the lines of `env-from-legacy.txt` into `.env` in place of the ones there, then fill in what the converter's "Add by hand" list names:

- `DISCORD_APP_ID`: the application ID from section 3.
- `DB_ROOT_PASSWORD`: a new password of your choice for MySQL's root user in the stack (the bot never sees it).
- `DB_USER`, if the legacy bot used `root`: choose another name (the stack creates this user).
- `BACKUP_DIR`: the folder on this machine for the nightly backups (an absolute path, or one relative to `compose.yaml`; a network share mounted there works), such as `/srv/pine-backups` on Linux or `C:/pine-backups` on Windows. Blank switches backups off. The folder needs a marker file, made once, with the stack's name `pine` in it. On Linux:

  ```bash
  sudo mkdir -p /srv/pine-backups
  ```

  ```bash
  sudo chown "$USER" /srv/pine-backups
  ```

  ```bash
  echo pine > /srv/pine-backups/.pine-backups
  ```

  On Windows, in Git Bash:

  ```bash
  mkdir -p C:/pine-backups
  ```

  ```bash
  echo pine > C:/pine-backups/.pine-backups
  ```

  On an NFS share that squashes root, make the marker as the share's owner and set `BACKUP_UID` and `BACKUP_GID` to that owner's ids.

- `LEGACY_PARTIES_DIR`: the legacy `parties/` folder (`~/pine-legacy/parties` written out in full, such as `/home/you/pine-legacy/parties`; on Windows in the form `C:/Users/you/pine-legacy/parties`). `/admin cleanup-legacy` reads it, read only, to find the channels of the legacy raids that had not ended, and to tell the channels of trains, meetups and saved parties, which it leaves. Without it, a channel named like a train or meetup is only listed for you to judge, since it may be one that is still open.

Leave the rest as it is. A value with a `$` in it goes in single quotes (`'pa$$word'`). Then delete `env-from-legacy.txt`, and on Linux keep `.env` to yourself:

```bash
rm env-from-legacy.txt
```

```bash
chmod 600 .env
```

### 4.5 Stop the legacy bot, copy its files, and make the final dump

Stop the legacy bot, and make sure nothing starts it again by itself (a service manager, pm2, a scheduled task). From here on your server has no bot.

Copy its `data/` and `parties/` folders afresh to `~/pine-legacy/data` and `~/pine-legacy/parties`, replacing any earlier copies: `parties/` changed while the bot ran, and `LEGACY_PARTIES_DIR` (4.4), `cutover-check` (4.7) and the history import (4.11) read this copy.

Then dump its database, as MySQL's root user. Name the schema (`db.schema` of the legacy private settings) as the last word, and do not use `--databases` or `--all-databases`: a dump made with those switches to its own database name and does not load into the stack's.

```bash
mysqldump -u root -p --single-transaction --routines --triggers --events --hex-blob <schema> > ~/pine-legacy/pine-final.sql
```

As a user other than root, mysqldump of MySQL 8 may stop with an error about the PROCESS privilege: add `--no-tablespaces`. On Windows, `mysqldump.exe` is in MySQL's `bin` folder (such as `C:\Program Files\MySQL\MySQL Server 8.0\bin`). The last line of a complete dump starts with `-- Dump completed`; the restore refuses one without it.

Keep these final copies (the dump, `data/` and `parties/`) in two places. The `parties/complete/` folder is the only copy of your server's raid history.

### 4.6 Load the database

```bash
./pine restore ~/pine-legacy/pine-final.sql --no-start
```

It checks that the dump is whole, starts the stack's MySQL alone, loads the dump, renames lower-case tables, and says what it loaded: "Loaded a legacy Professor Pine database (the bot's migrator takes it over at the start)", with the rows of the main tables. `--no-start` keeps the bot from starting yet. (After a dry run, add `--replace`: it backs up what is there first.)

If it says the legacy database lacks its last migration, the legacy bot was older than the newest legacy code: switch it to the `legacy` branch (section 2b), start it once (it applies its migrations at the start), stop it, and dump again.

Then take the database over without logging in to Discord:

```bash
./pine migrate
```

### 4.7 The go / no-go

```bash
./pine cutover-check --legacy-parties ~/pine-legacy/parties
```

It reads the database and, with the bot's token, Discord's API (reading only; it does not log the bot in). It prints a `PASS`, `WARN` or `FAIL` line per thing it checked, and ends with "Go: no line failed." or "No go: a line failed.":

- **database**: what the migrator does with your database. A `FAIL` quotes why it would refuse it.
- **application**: `DISCORD_APP_ID` must be the token's application. A `FAIL` names the right one.
- **intents**: the settings ask for none, so this passes.
- **emoji**: warns until you upload the game's icons as the application's emoji (below).
- **servers**, **server …** and the region lines: whether the bot is in the database's server, and the permissions its role lacks in the server, in each region's channel and in the category where its forum will be. A missing required one is a `FAIL` that says what it is for; give the bot's role that permission in Server Settings → Roles (or fix the category's overwrites), and run the check again. In a region's forum the line names the permissions as the forum's settings do: Manage Posts (Manage Threads), without which the bot makes no post with its tags there, Create Posts (Send Messages), Send Messages in Posts. Pin Messages is no longer asked for: "Today’s Stops" is posted in the region's board, the post "Today and coming up" of its forum, where writing takes Send Messages in Posts and pinning Manage Posts (Manage Threads). Manage Messages missing in a forum is a `WARN`: the board works, but what members write there stays instead of being deleted.
- **forums**: every region without a forum warns. That is expected: step 4.9 makes them.
- **names**: channels, a category or a role the settings name that your server does not have. Fix `pine-settings.json` or the server.
- **announcements**: whether the bot may post in the channels it announces in (bot updates, the moderators' channel, Unown sightings, the elite and remote raid channels).
- **moderation**: meetup safety's channel: a warning while `channels.moderation` is not set (the safety is off), when the server has no such text channel, when the bot may not see it, send or embed links there, when everyone can see it (make it staff-only), or when a staff role (a role named `admin` or `moderator`) cannot see it (let every staff role see it).
- **restrictions**: rows of the legacy `!require-role` restrictions. The new bot does not use them; `./pine role-auth-export` lists them as the new commands, and an admin sets the same under Server Settings → Integrations → Professor Pine.
- **roles**: self-assigned roles at or above the bot's highest role, which the bot cannot give. Move the bot's role above them.
- **boards**: the regions that have a forum but no board recorded in the database; `/admin setup-forums` makes it.
- **cleanup**: how many legacy channels `/admin cleanup-legacy` would delete, how many trains, meetups and saved parties stay, and which channels it would leave to a person.

Fix every `FAIL` and run it again. Warnings are for you to judge.

The application's emoji (the game's type, weather and team icons and the icons of the posts' buttons, used in posts) are uploaded once; first a dry run, then the upload:

```bash
./pine emoji-upload
```

```bash
./pine emoji-upload --apply
```

### 4.8 Start the bot and register the commands

A first backup, which also checks the backup folder:

```bash
./pine backup
```

Then start everything (the bot, MySQL, the watchdog and the nightly backups):

```bash
./pine up
```

```bash
./pine status
```

`./pine status` shows the services, the bot's health and the last backup. `./pine logs pine` follows the bot's log: the takeover's migrations, then the connection to Discord.

Register the slash commands with Discord, for every server the bot is in:

```bash
./pine deploy-commands
```

They can take a little while to show up in Discord.

### 4.9 The admin's part, in Discord

1. **The bot's role**: whatever `cutover-check` said it still lacks.
2. **`/admin setup-forums`**: every region gets a forum next to its channel, its board (named after the channel with `-board`, the `regionForumSuffix` setting), with its tags and a pinned post "Today and coming up" (its raids, max battles, trains and meetups of today, then what is coming up on later days, and "Today’s Stops" below it). Members can use commands in it; what they write there is deleted (Manage Messages in the forum) and they are told by DM once a day, a moderator's message stays, reactions on the bot's lists there are removed at the list's next change or the bot's next start (the party posts keep theirs), and it has a slowmode of 45 seconds (a value Discord's menu does not offer, so the bot knows it as its own; a moderator without Bypass Slowmode waits that long between their own messages there; a board the bot opened with six hours before is moved to 45 seconds at its next change, locked or not; so 6 hours cannot be kept on the board, while any other slowmode a moderator sets is kept). An installation that ran the bot before the board (forums ending in `-meetups`, a pinned "Going on now", "Today’s Stops" pinned in the region channels) runs it once after the update: it renames the forums and the post, and the bot moves "Today’s Stops" into it at its next start. A board an earlier build locked is opened once (at its next draw or by this command); a lock a moderator sets later stays, and this command says so. It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again. A region that fails says why (most often the category's permissions).
3. **The regions' borders** (when the web pages are set up, `docs/web-setup.md`): `/region edit` opens the region editor, whose list shows the overlaps and gaps between the regions as the legacy map drew them. **Fix all slivers…** settles the thin ones (it asks only where a gym or stop would change region), and **Save** writes the new outlines straight into the database: no KML export or `/region import` is needed. What is no sliver is listed to be drawn by hand. Members' parties stay where they are.
4. **`/admin cleanup-legacy`**: deletes the channels of the legacy raids. It first only **lists** them: the raid channels the legacy files name, and leftover legacy party channels that no file names (found by their names and the legacy bot's own first message). Channels it is not sure of are listed apart as "Not deleted", for a person to judge. The channels of the trains and meetups that are still open, and of any party saved with `!save-party`, are **not deleted**: many are long-lived discussion channels. They are listed under their own "Not deleted" heading with the party's name, the day it was made and how many signed up; delete by hand the ones that are dead, and the rest stay as plain channels (their old status message stays, and nothing answers it any more). New trains and meetups start with `/train` and `/meetup`. Nothing is deleted until you press "Delete these n channels" (within ten minutes). One run deletes at most 400 channels; run the command again for the rest.

### 4.10 Check that it works

- In a region channel: a raid (`/raid`), then join it with the buttons in its post; a max battle at a Power Spot (`/max`; the Power Spots come from `/gym import` of a Wayfarer export, and without it only a maps link works for `spot:`, as an "Unlisted power spot"); a train (`/train`; `kind:` for a train of Dynamax or Gigantamax battles, whose `/route add stop:` offers the Power Spots first); a meetup (`/meetup`); field research (`/research report`, which "Today’s Stops" in the region's board shows, with a line in the region channel for a task new that day); Team GO Rocket (`/rocket report`: a grunt is a message in the region channel for half an hour, a leader, Giovanni or a decoy goes in "Today’s Stops" in the board).
- A direct message: set a want (`/want`) and have somebody else report that boss.
- A screenshot of a raid posted with a mention of the bot (the bot itself, not a role of the same name).

### 4.11 The legacy history, any time later

```bash
./pine import-history ~/pine-legacy/parties
```

It imports the ended legacy parties into the new party history (without member ids), runs the migrations first, reads the folder without changing it, and prints counts. It does not contact Discord and can run while the bot runs. Run before the bot's first start (or before your first `/gym import`, then `./pine restart`), it also lets the bot ask Google about the busiest regions' gyms first (section 6); later, the bot ranks by it from the next day. It is safe to run again: nothing is imported twice. Add `--server <server id>` (your server's id) and run it again only if its `Skipped:` line counts parties "of no known server" (their region is gone and it could not tell the server). Keep the folder afterwards.

### 4.12 Sponsored stops from a file, once

Wayfarer does not list sponsored PokéStops (a business's stops), so `/research`, `/rocket` and `/wild near:` do not know them until staff add them with `/pokestop add`. If you have a list of them as a CSV file with the columns `id,name,lat,lon,region,basis` (Pittsburgh has one, made beside its Wayfarer export: run this once for Pittsburgh), add them all at once, after `/gym import` of your Wayfarer export:

```bash
./pine seed-stops ~/pine-legacy/sponsored-stops.csv --server <server id>
./pine seed-stops ~/pine-legacy/sponsored-stops.csv --server <server id> --apply
```

The first only says what it would do, line by line: which rows it would add, and which it skips because a stop is within 30 meters (one Wayfarer lists, one of your server's own, or an earlier row of the file) or because the point lies outside every region of your server. The second adds them. Only `name`, `lat` and `lon` make a stop; the other columns are notes. It runs the migrations first, reads the file without changing it, does not contact Discord, and is safe to run again (what it added is a known stop then). The running bot sees the new stops at its next start (`./pine restart pine`). Staff change or remove one later with `/pokestop edit` and `/pokestop remove`.

## 5. What your members will notice

- **A forum post per raid.** Each region keeps its channel, and gets a forum beside it. Every raid, max battle, train and meetup is a post in that forum, with the boss, the times, the groups and everybody signed up. A link to each new post appears in the region's channel.
- **Buttons instead of reactions.** The post lists who is Interested, Coming, Here and Done, each line starting with its icon (Pine's old reaction icons, 🤔 for Interested), under a heading per group. The buttons are three rows at the bottom, the same for one group and several: Interested, Join, Here, Done (raids) and Leave, icons only; Meet… (raids; the game's Select Time icon, ⏰ until your application has it), −1, +1 and Remote, icons only; then Group… (and Set time… while a raid has no times). Pressing one answers only you, and a short line in the post says what you did. In a post of several groups, Interested, Join or Here from somebody not signed up yet first asks which group (a short dialog, the groups in letter order, the newest group marked (on Android the first)). Group… moves you to another group or opens a new one, with an optional label; Meet… sets your group's meeting time from a list of times, the game's in-game RSVP times among them. A group nobody is in goes by itself, unless it has a label or a meeting time.
- **Slash commands instead of `!` commands.** `!` commands get no answer any more. Type `/` and Discord lists the commands with their options; `/help` explains each. The most used ones:

  | Legacy                                         | New                                                     |
  | ---------------------------------------------- | ------------------------------------------------------- |
  | `!raid` (in a region channel)                  | `/raid boss gym time`                                   |
  | `!join`, `!coming`                             | `/join` or `/coming` in the post, or the Join button (with several groups it asks which) |
  | `!maybe`, `!interested`, `!hmm`                | `/interested` or `/hmm`, or the Interested button       |
  | `!here`, `!done`, `!leave`, `!not-here`        | `/here`, `/done`, `/leave`, `/not-here`, or the buttons |
  | `!remote`, `!local`                            | `/remote`, `/local`                                     |
  | `!group`, `!new`                               | Group… on the post, or `/group join`, `/group new`      |
  | `!label`                                       | `/group label`, or the label of Group…'s new group      |
  | `!meet`, `!cancel-meet`                        | Meet… on the post (its icon), or `/meet`, `/cancel-meet` |
  | `!hatch`, `!left`, `!boss`, `!gym` (in a raid) | `/hatch`, `/end`, `/boss`, `/location`                  |
  | `!status`, `!where`, `!shout`                  | `/status`, `/where`, `/shout`                           |
  | `!train`, `!route-add`, `!next`                | `/train`, `/route add`, `/next`                         |
  | `!meetup`, `!info`                             | `/meetup`, `/info`                                      |
  | `!want`, `!unwant`, `!wants`                   | `/want`, `/unwant`, `/wants`                            |
  | `!target`, `!untarget`, `!targets`             | `/target`, `/untarget`, `/targets`                      |
  | `!spawn`, `!wild`                              | `/wild`                                                 |
  | `!iam`, `!iamnot`                              | `/iam`, `/iamnot`                                       |
  | `!rank`, `!great`, `!ultra`, `!master`         | `/rank`, `/great`, `/ultra`, `/master`, `/little`       |
  | `!counters`, `!boss-tier`, `!find`             | `/counters`, `/boss-tier`, `/find-region`               |
  | `!friend-code`, `!register-friend-code`        | `/friend-code show`, `/friend-code register`            |
  | `!register-nickname`, `!find-nickname`         | `/nickname register`, `/nickname find`                  |
  | `!mentions`, `!auto`, `!privacy` and the like  | `/settings` (`/settings show` lists them all)           |
  | `!help`                                        | `/help`                                                 |

- **Screenshots** are read when they are posted with a mention of the bot, or attached to `/raid`. The mention must be of the bot itself (picked from the list Discord shows after `@`), not of a role of the same name. A screenshot dropped in a channel without either is not read (that would need Message Content). A split-screen screenshot (two apps on one screen) is read pane by pane. Posted with a mention, two raids or max battles side by side, or one above the other, are both reported. `/raid screenshot:` and `/max screenshot:` report the screen of their own kind: they refuse two of their kind in one picture and point to the mention, and they name a screen of the other kind beside it, which is not reported. A picture whose two screens cannot be told apart is refused rather than mixed. The bot keeps the whole picture for a while to improve the reader, the other half too, whatever app it shows.
- **Settings and notifications** keep what members set before: wants, gym targets, mentions, auto-status, privacy, friend codes. They are changed through `/settings`, `/want` and `/target`. `/want` asks in a dialog what a Pokémon is wanted for (Raids, Dynamax, Gigantamax, Spawns, Research, Shadow), ticked as the member's wants are.
- **Field research** is new: `/research report` names a PokéStop's task (up to five stops at once), "Today’s Stops" in the region's board lists the day's tasks, a task new today gets a short line in the region channel, and members who want a reward get a DM. Sponsored PokéStops, which Wayfarer does not list, are added by staff with `/pokestop add`.
- **Team GO Rocket** is new too: `/rocket report` names who is at a PokéStop. A grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy grunt goes in "Today’s Stops" on the board until midnight (a leader or Giovanni new today with a line in the region channel). `/want` takes a grunt type (at most one DM an hour for each type), a leader, any leader, Giovanni or the decoy, and the Shadow box of a Pokémon also covers what Team GO Rocket gives.
- **Unown**: members with the `unown` role get a want for Unown the first time they use the bot, instead of the role being pinged.
- **The party history**: the bot keeps a history of ended raids, max battles, trains and meetups for statistics. It keeps a member's Discord id only if they opt in with `/settings history enabled:True`; without it they are counted, anonymously.
- **A map on the web**, if you set up the web pages ([web setup](../web-setup.md)): `/maps` gives members the address and a login button. With `web.invites` set, somebody who opens a shared link to the map, logs in and is not in your server gets "Join the server on Discord" with your invite.
- **Raids that were active at the move are not carried over.** They end with the legacy bot, and `/admin cleanup-legacy` deletes their channels. Members report them again if they are still on. Open trains and meetups are not carried over either, but their channels stay as plain channels for discussion; new ones start with `/train` and `/meetup`.
- Members no longer delete: `/report` (or **Report to moderators** in the Apps menu of a message) tells the moderators privately, in the moderators' channel; `/delete` and `/places` are staff commands offered to members with Manage Messages.
- Staff commands (`/admin`, `/gym`, `/region`) are offered only to members with Manage Server, and the bot answers them only for members who also have a role named `admin`, `moderator` or `bot developer`, or for its owner (`OWNER_ID`). An admin can let another member see a staff command under Server Settings → Integrations → Professor Pine, on that command's own entry: an allowance for the application as a whole does not beat the Manage Server default (tried on a test server in October 2026).

## 6. After the move

- **Backups**: a verified dump every night at 03:30 (`BACKUP_TIME`, in `BACKUP_TZ` or the settings' time zone) into `BACKUP_DIR`, kept 90 days (`BACKUP_KEEP_DAYS`). Each one is loaded into a scratch MySQL and checked before it counts. `./pine backup` makes one now. `./pine status` shows the last one. To load one back: `./pine restore <backup file> --replace`.
- **Updates**: `./pine update` backs up the database, fetches the newest code, rebuilds and restarts what changed. It refuses to run if you changed files of the repository yourself: your own files are `.env` and `pine-settings.json`, which git ignores. After you edit `pine-settings.json`, run `./pine restart`.
- **Google, after the first `/gym import`** (with a `GOOGLE_API_KEY`): the gyms the import added get their nearby places (and an address where Wayfarer gave none) from Google over the following weeks, then the PokéStops and Power Spots of your regions, a share each day. The bot asks at most a monthly budget that stays within Google's free amounts (by default 4,500 places searches, 500 of them kept for gyms you add or move by hand and `/gym refresh`, and 9,000 addresses: `googleLookupsPerMonth`, `googleLookupsReserve`, `googleGeocodesPerMonth`), counted from the 1st at midnight Pacific time, when Google's free amounts reset; the busiest regions go first if the legacy history (4.11) was imported. `/gym google` (staff) shows how many wait, the month's use and when this server's gyms will be done. Google counts the free amounts per billing account, not per key: if another installation's key (a test instance, say) bills to the same account, split the budget between them.
- **Health**: `./pine status` and `./pine logs pine`. The bot's owner (`OWNER_ID`) gets a direct message when the bot crashes and restarts, when it is stuck, or when a backup fails. A watchdog service restarts the bot when it stays stuck or off Discord for several minutes.
- **Keeping a member out of a region**: to keep a member out of a region's forum for good, give them a permission overwrite on that forum that denies View Channel (or deny it to a role they hold); taking away the region's role is not enough. A member overwrite takes the forum out of sync with its category; "Sync permissions" removes the bot's own overwrites, which its hourly sweep puts back where they are still needed.
- The details of the stack (health checks, the watchdog, backups, restore): [operations.md](../architecture/operations.md).
- **Help**: ask in the official Professor Pine Discord, https://discord.com/invite/8FkjJVe.
