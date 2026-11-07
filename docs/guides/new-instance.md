# Starting a new Pine instance

This guide is for somebody who wants Professor Pine on their own Discord server and has never run it. Pine organises Pokémon GO raids: each raid, max battle, train and meetup is a post in a forum of its region, members sign up with buttons and slash commands, and members get direct messages for the bosses and gyms they want.

Pine runs as a Docker stack (the bot, its MySQL database, a watchdog and nightly backups), so the machine needs Docker and git, and nothing else.

Already running the old JavaScript Pine? Follow [Moving a legacy Professor Pine](migrating-a-legacy-instance.md) instead: it keeps your database.

## Contents

1. [The Discord application](#1-the-discord-application)
2. [The machine](#2-the-machine)
3. [The settings and secrets](#3-the-settings-and-secrets)
4. [Start the bot](#4-start-the-bot)
5. [Regions](#5-regions)
6. [Gyms](#6-gyms)
7. [Forums](#7-forums)
8. [Running it](#8-running-it)

## 1. The Discord application

In the [Discord Developer Portal](https://discord.com/developers/applications):

1. **New Application**, and give it a name (members see it as the bot's name).
2. **General Information**: note the **Application ID**.
3. **Bot**: reset and copy the **token** (it is shown once; it is the bot's password, keep it secret). Leave all three **Privileged Gateway Intents** off: Pine needs none of them. (One optional setting, reading every screenshot posted in a region channel, would need Message Content; see the [README](../../README.md), "Privileged intents". Applications whose servers reach 10,000 users must be reviewed by Discord to keep them, which is why Pine does without.)
4. **Keep the bot private.** On **Installation**, set **Install Link** to **None** and save; then on **Bot**, turn **Public Bot** off (Discord refuses it while the application has an install link). You can still add the bot to your server yourself; nobody else can add it to one of theirs. That matters: the staff of any server the bot is in can change what all its servers share, such as the raid boss list, and gyms and stops.
5. Invite the bot to your server with the scopes **`bot`** and **`applications.commands`** and these permissions for its role (the portal's **OAuth2** page has the URL generator that builds the link). Open the link as the application's owner, with **Manage Server** on your server. If somebody else administers that server, turn **Public Bot** on just long enough for them to open the link, then off again; `./pine cutover-check` warns while it is on.
   - View Channels, Send Messages, Send Messages in Threads, Embed Links, Attach Files, Read Message History
   - Manage Channels (the forums, and the channels `/region import` creates)
   - Manage Roles (self-assigned roles, and who may see a forum)
   - Manage Threads (archiving, locking, renaming and pinning posts, the tags of a post, and pinning and opening the region's board; in a forum's own permissions Discord calls it **Manage Posts**, and without it there the bot makes no post at all and tells the member so)
   - Add Reactions and Use External Emojis (optional)
   - Manage Messages (optional: taking a screenshot away once it became a raid, deleting a message the moderators delete from a report, deleting what members write in the region's board, and removing reactions on the bot's lists in the board; without it in the forums, members' messages and reactions stay in the board and `cutover-check` warns)

   As a number for the link's `permissions=`, that is `292326599760`. `./pine cutover-check` (section 4) checks the bot's role against these.

The bot's role must sit above the roles members may give themselves with `/iam`.

**Staff.** The staff commands (`/admin`, `/gym`, `/region`) are offered to members with **Manage Server**, and the bot answers them only for members who also have a role named `admin`, `moderator` or `bot developer` (any capitals), or who are the bot's owner (`OWNER_ID` below). Give your staff such a role. `/delete` and `/places` are offered to members with **Manage Messages** instead, so that moderators without Manage Server have them; members tell the moderators what is wrong with `/report`, or with **Report to moderators** in the Apps menu of a message, and the reports go to the moderators' channel (`channels.moderation`: hidden from everybody else, and visible to every staff role, Admin and Moderator alike, or the links of `/places` and of the reports do not open for a moderator who cannot see it). You can let another member see a staff command under Server Settings → Integrations → Professor Pine, on that command's own entry (an allowance for the application as a whole does not beat the Manage Server default); they still need one of those roles for the bot to answer.

Note your own Discord user ID too (User Settings → Advanced → Developer Mode, then right-click your name → Copy User ID): it becomes `OWNER_ID`, who counts as an admin everywhere and gets the bot's alerts.

## 2. The machine

Any machine that stays on, with Docker (with Compose) and git:

- **Linux** (for example Debian): Docker Engine and its Compose plugin from [Docker's own instructions](https://docs.docker.com/engine/install/), and git.
- **A Mac kept as a server**: [A Mac as Pine's host](macos-host.md) sets it up, up to the stack's first start.
- **Windows**: [Docker Desktop](https://docs.docker.com/desktop/) and [Git for Windows](https://git-scm.com/download/win); run every command below in Git Bash.

Then the code:

```bash
git clone --branch main-dev https://github.com/Googer/Professor-Pine.git ~/professor-pine
```

```bash
cd ~/professor-pine
```

Every command from here on is `./pine <command>`, run in that folder. `./pine help` lists them.

## 3. The settings and secrets

### `.env`: the secrets

```bash
cp .env.example .env
```

Fill in:

- `DISCORD_TOKEN`, `DISCORD_APP_ID`, `OWNER_ID`: from section 1.
- `DB_USER` (not `root`), `DB_PASSWORD`, `DB_SCHEMA`, `DB_ROOT_PASSWORD`: names and passwords of your choice. The stack creates the database and the user on its first start. A value with a `$` in it goes in single quotes (`'pa$$word'`).
- `GOOGLE_API_KEY` (optional): map pictures (Google Static Maps) and the address and nearby places of each gym (the Geocoding API and Places API (New)). Without it posts have no map picture. Enable all three APIs in the key's Google Cloud project, and if the key has API restrictions, tick all three there too. The second step is easy to miss: Google then answers "requests to this API are blocked", and gyms get no nearby places.
- `BACKUP_DIR`: the folder on this machine for the nightly backups (blank switches them off), such as `/srv/pine-backups` on Linux or `C:/pine-backups` on Windows. It needs a marker file with the stack's name, made once. On Linux:

  ```bash
  sudo mkdir -p /srv/pine-backups
  ```

  ```bash
  sudo chown "$USER" /srv/pine-backups
  ```

  ```bash
  echo pine > /srv/pine-backups/.pine-backups
  ```

  A backup can be read by its owner alone: on Linux, also set `BACKUP_UID` and `BACKUP_GID` in `.env` to your own ids (`id -u` and `id -g`), or the files are root's and `./pine restore` needs `sudo`.

  On Windows, in Git Bash:

  ```bash
  mkdir -p C:/pine-backups
  ```

  ```bash
  echo pine > C:/pine-backups/.pine-backups
  ```

  On an NFS share that squashes root, make the marker as the share's owner and set `BACKUP_UID` and `BACKUP_GID` to that owner's ids.

- Leave `LEGACY_PARTIES_DIR` and `LEGACY_INDEX_DIR` blank: they are for an installation that moved from the old JavaScript Pine. Without them `/settings` offers no "Add my old-bot history".

Each variable is explained in `.env.example` itself. On Linux keep the file to yourself:

```bash
chmod 600 .env
```

### `pine-settings.json`: the settings

```bash
cp data/settings.json pine-settings.json
```

The settings that matter first:

- `timezone`: yours, as an IANA name (`America/Chicago`, `Europe/London`). Every time members type is read in it. The file comes with `America/New_York`.
- `distanceUnits`: how Pine says a distance, on Discord and on the web map alike: `imperial` (feet under a tenth of a mile, to the foot under 100 ft, else miles; the default) or `metric` (meters under a kilometer, to the meter under 100 m, else kilometers).
- `channels`: the names of channels the bot uses in your server: `bot-lab` (where members try commands), `mod-bot-lab` (the moderators'), `unown` (Unown sightings), `elite-gym-raids` and `remote-raids` (copies of elite and remote raids), `pvp`, `bot-updates` (announcements). Make the channels or change the names.
- Meetup safety (optional, and off until you set it): a meetup at a place that might be private (a pin from a maps link, or a gym or PokéStop whose name sounds like a front yard: a little free library, apartments) is held for a moderator, and posted only when one approves it. Make a text channel that only your staff can see (never the public bot updates channel), and that every staff role can see (each role named `admin` or `moderator`: a moderator who cannot see it gets "You don't have access to this link" from every link of `/places` and the reports), where the bot may view, send messages and embed links, and name it in `channels`, for example `"moderation": "meetup-review"` (the example settings have it blank, which is unset). The requests and the appeals of blocked members go there, with buttons for admins and moderators. Without it every meetup is posted at once, and the bot's log warns of it at every start. To hold more names for a moderator, add `"meetupSafety": { "flaggedWords": ["duplex", "cottage"] }` (whole words, any letter case).
- The events forum (optional, and off until you set it): one forum of the game's events per server, with a pinned listing the bot keeps current (events on now, this week and coming up, from Leek Duck's list through ScrapedDuck, with a link to each event's page, and one line at its foot linking to Campfire, where official meetups may be) and a post per bigger event (Community Day, Raid Day, Max Battle Day, Wild Area, GO Tour, GO Fest and Leek Duck's other events), opened 14 days ahead for members to talk in. Name it in `channels`, for example `"events": "events"` (the example settings have it blank, which is unset), and run `/admin setup-forums`: the forum is made in the category of your bot-updates channel, members cannot make posts in it, and the bot needs Manage Posts there (the command gives it where it may, and says what it could not do). `"eventsForum": { "horizonDays": 35, "postDaysAhead": 14, "onThisDay": 3 }` changes how far the listing reaches, how early a post opens, and how many of each earlier year's big days (days with far more raids than the weeks around them, or far more raids of one boss than it had on its other days then) a post "On this day" recalls in the events forum on their date, from 10:00 (0 to 10; 0 turns those posts off; most days post nothing; the history page shows three of every year whatever it says). The bot never reads anything from Campfire.
- `categories.pvp`: the category of your PvP channels: `/rank` and its short forms work only there and in a direct message with the bot.
- `features`: `exGymChannel` and `remoteRaidChannel` (whether raids are copied into those channels), `notifications` (direct messages for wants and gym targets), `roles` (self-assigned roles with `/iam`; section 7 sets them up).
- `wildSpawnExceptions`: the legendary and mythical Pokémon `/wild` accepts as wild spawns, by name. Unless set, Uxie, Mesprit and Azelf, the ones that do spawn. Add one if the game makes it a wild spawn others can catch. An entry admits every form of its species: the Galarian birds (from a Daily Adventure Incense only, to one trainer, so refused for now) cannot be admitted apart from the Kanto ones.
- `roles.unown`: the name of an Unown role the server had before Pine: its holders are given a want for Unown. Leave it as it is if you have none.
- `raidEvents.weeklyRaidHour`: the weekly Raid Hour, in your time zone.

The rest has working defaults (`lobbies`, for example, is how many trainers one lobby of a raid, a Dynamax battle and a Gigantamax battle holds: 20, 4 and 100, as in the game; `raid` only sets when a group of a raid or a train is told to split up, since members choose their own groups there, and Join fills groups by `dynamax` and `gigantamax` only in max battles and Gigantamax trains, the trains still to come). Max battles are always on and need no block: `maxBattles` only changes their defaults (the max bosses are read from Pokebattler's `https://fight.pokebattler.com/raids`, `url`, every 6 hours, `refreshMinutes`; `firstBattle` and `lastBattle` are the hours max battles can be fought, 06:00 and 21:00 unless set). Field research is always on too: `research` only changes its defaults (the task list is read from Leek Duck's `https://leekduck.com/research/`, `url`, every hour, `refreshHours`, and said to be out of date in the log after 6 hours without a good read, `staleAfterHours`; `throttle` is how many reports a member may make in how many minutes, 10 in 30). Team GO Rocket is always on as well: `rocket` only changes its defaults (the lineups are read from ScrapedDuck's `https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/rocketLineups.min.json`, `url`, every 6 hours, `refreshHours`, out of date after 24, `staleAfterHours`; a grunt's message stands 30 minutes, `gruntMinutes`; `throttle`, 10 reports in 30 minutes). With a `GOOGLE_API_KEY`, the gyms, PokéStops and Power Spots wait in a line for Google within a monthly budget that stays within Google's free amounts: `googleLookupsPerMonth` Places searches (4,500 unless set), of which the line leaves `googleLookupsReserve` (500) for gyms you add or move by hand and `/gym refresh`, and `googleGeocodesPerMonth` addresses (9,000), of which the addresses of Power Spots the map looks up as their popups open leave `googleGeocodesReserve` (500, or all of `googleGeocodesPerMonth` where that is less; set, at most `googleGeocodesPerMonth`) for gyms; the month starts on the 1st at midnight Pacific time, when Google's free amounts reset, and `/gym google` shows how far the line is. Lookups by hand have a hard cap of their own, `googleByHandPerMonth` (500), one lookup being an address and a Places search: past it `/gym refresh` asks nothing, and a gym you add or move waits in the line. Google counts the free amounts per billing account, not per key: instances whose keys bill to one account (a test instance beside your real one, say) share them, so split the budget between them (the settings of each together within the free amounts, the test instance set low), or the account pays for what goes past. Each instance counts for itself, in its own database. The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). There, `web.invites` gives each server an invite of yours for somebody who opens the map, logs in and is not in the server yet ("Join the server on Discord"). After an edit while the bot runs, `./pine restart`.

## 4. Start the bot

The game's type, weather and team icons and the icons of the posts' buttons are uploaded once as your application's emoji (they show in posts); first a dry run, then the upload:

```bash
./pine emoji-upload
```

```bash
./pine emoji-upload --apply
```

Start the stack. The first start creates the database:

```bash
./pine up
```

```bash
./pine status
```

`./pine logs pine` follows the bot's log. Then register the slash commands with Discord:

```bash
./pine deploy-commands --global
```

Once your regions are in (section 5), `./pine cutover-check` reads your server through Discord's API and lists the permissions the bot's role lacks, in the server, in each region's channel and in its category, and the channels of the settings your server does not have. (It was made for moving a legacy instance: before you have regions it fails with "the database has no regions", which only means you have none yet.)

## 5. Regions

A region is a text channel of your server with an outline on the map: members report raids in it, and its gyms are the ones inside the outline.

Draw the outlines in a map editor such as [Google My Maps](https://www.google.com/maps/d/): one shape per region, named after its channel ("North Hills" stands for `#north-hills`). Export it as KML ("Export to KML/KMZ", with "Export as KML instead of KMZ" ticked). Then, as staff in your server:

- `/region import file:` with the KML file. It shows what it would do before anything changes; for a shape whose channel does not exist it creates the channel, in the category the shape's description names (or, when that category is full, into `<name> 2`: Discord allows 50 channels in a category, forums included, and the new category gets the permissions of the full one). Every new region gets its forum.
- `/region list` shows every region and what is wrong with any of them; `/region export` gives the outlines back as KML.
- Members see a region's area with `/bounds` in its channel.

## 6. Gyms

- **One at a time:** `/gym add` with the link Pokémon GO shares for the gym (or its coordinates) and its name. `/gym edit`, `/gym move` and `/gym delete` change it later.
- **PokéStops Wayfarer does not list** (sponsored ones): `/pokestop add` with its name and the link Pokémon GO shares for it (or a maps link, or its coordinates); `/pokestop edit` and `/pokestop remove` change it later. Members find it wherever a PokéStop is asked for.
- **All at once, from Wayfarer:** `/gym import` reads an export of the gyms, PokéStops and Power Spots Wayfarer has. The export is made by the Pine Wayfarer export tool: ask for it at https://profpine.com/userscript (your settings' `wayspotTool`, which `/help gym` names). It takes the KML file of `/region export`. Then attach the file it saves to `/gym import`: it shows what it would do first, and what needs a person goes to `/gym review`. `/help gym` has the details, and [wayfarer.md](../architecture/wayfarer.md) the whole design.

## 7. Forums

Once regions and gyms are in, a staff member runs `/admin setup-forums` in your server: every region gets a forum beside its channel, its board (named after the channel with `-board`, the `regionForumSuffix` setting), its tags, and a pinned post "Today and coming up" (its raids, max battles, trains and meetups of today, then what is coming up on later days), under which the bot posts "Today’s Stops" (the day's field research and Team GO Rocket hideouts). Members can use commands in that post (report research or Team GO Rocket where they see what is reported), but it keeps only the bot's lists: what a member writes there is deleted at once (the bot needs Manage Messages in the forum), and the member is told by DM once a day; a screenshot posted there is read first and answered by DM. A member with Manage Messages there (a moderator) keeps their message. Reactions on the bot's lists there are removed too, the next time the bot changes that list or starts (the party posts in the same forum keep their reactions). The post has a slowmode of 45 seconds, a value Discord's menu does not offer, so the bot knows it as its own (it keeps a member from flooding the board; commands and the bot are not held by it, and a moderator without Bypass Slowmode waits 45 seconds between their own messages there). A moderator may give the board another slowmode and the bot keeps it, except exactly 6 hours, which the bot sets back to 45 seconds (it was the bot's own mark before). A moderator may lock it; the bot leaves a lock alone, and `/admin setup-forums` says so. The region's channel gets a short line the first time a task, a leader or Giovanni is reported there in a day, deleted at midnight. It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again; a region that fails says why (most often the category's permissions for the bot).

To keep a member out of a region's forum for good, give them a permission overwrite on that forum that denies View Channel (or deny it to a role they hold); taking away the region's role is not enough. Only those two keep a member out: a forum that merely denies View Channel to `@everyone` and allows it to a role is no gate, since Join in a post, on Discord or on the map, opens the forum to any member who has neither of them. So a forum meant for one role's members needs a role denied too. A member overwrite takes the forum out of sync with its category; "Sync permissions" removes the bot's own overwrites, which its hourly sweep puts back where they are still needed.

**Self-assigned roles** (with `features.roles` on): give the bot's role Manage Roles, and move it above every role members may give themselves (Discord lets a bot hand out only roles below its own). Then add each role with `/admin self-roles add`. To sort them in the menus of `/iam`, make a group with `/admin self-roles group` and put a role in it with `/admin self-roles add role: group:`. `/admin self-roles list` shows them all, with any the bot cannot give and why.

Then try it: `/raid` in a region channel, the buttons in the post, `/max` (a max battle at a Power Spot: the Power Spots come with the Wayfarer import), `/train` (also `kind:Gigantamax Train`, with Power Spots as its stops), `/meetup`, `/research report` (the task of a PokéStop: "Today’s Stops" in the region's board shows it, and a task new that day gets a line in the region's channel), `/rocket report` (a grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy goes in "Today’s Stops" in the board), `/want` and a report of that boss by somebody else. `/help` lists everything.

## 8. Running it

- **Backups**: a verified dump every night at 03:30 (`BACKUP_TIME`) into `BACKUP_DIR`, kept 90 days. `./pine backup` makes one now; `./pine status` shows the last one; `./pine restore <backup file> --replace` loads one back.
- **Updates**: `./pine update` backs up the database, fetches the newest code, rebuilds and restarts what changed.
- **Health**: the owner gets a direct message when the bot crashes, is stuck or a backup fails, and a watchdog restarts a stuck bot. `./pine status` and `./pine logs pine` show the rest.
- The details of the stack: [operations.md](../architecture/operations.md). The section "After the move" of the [legacy guide](migrating-a-legacy-instance.md#6-after-the-move) says the same at more length.
- **Help**: the official Professor Pine Discord, https://discord.com/invite/8FkjJVe.
