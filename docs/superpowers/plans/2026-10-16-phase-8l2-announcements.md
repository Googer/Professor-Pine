# Announcement drafts (plan 8L-2)

Two drafts for Matt to post by hand; nothing here is posted by the bot or by an agent. Each text to post is the content of its fenced block, as Discord markdown.

## 1. Pittsburgh's #bot-updates post

The text and how to post it are a page of their own since 2026-11-10, for whoever posts it (Matt: Airalyn may post it, and reword it): [`docs/announcements/pittsburgh-pine-2.md`](../../announcements/pittsburgh-pine-2.md). Rewritten on 2026-11-09, the night after the cutover, for Pine as it runs in Pittsburgh then (5,400 gyms, the boards, `#pogo-events`, the live map, `/request` on, the remote raid channel off); the Read screenshot sentence came with 2.0.1. Posted when Matt says.

## 2. The official Professor Pine Discord post (for admins of other instances)

**Posted** by Matt, its headline "~~2.0.0~~, ~~2.0.1~~, 2.0.2" (the last-minute fixes before the release, struck through).

Matt posts it now that version 2.0.2 is released (`master` and the tag `v2.0.2`, 2026-11-10, the same night as `v2.0.0` and `v2.0.1`, which were never announced; the `legacy` branch has been on GitHub since the first push), in the style of that server's earlier release posts: titled by version, a list of changes, the upgrade requirements as notes after it. `package.json` said `2.0.2`, as the title does (2.0.3 has a post of its own, section 3). `@Pine Admins` is that server's role: retype it in the message box so that it pings. Three messages, one right after the other, as the larger releases there were: the list of changes alone is over Discord's 2,000 characters, so it runs over all three, and the notes follow it in the third. Checked against the code and brought up to date on 2026-11-10 (the board, Manage…, "Today’s Stops", Pokebattler's four roles, the events forum, `/stats`, the map as it is, `/settings` as one panel, the warning about `git pull`).

```md
**v2.0.2 Released**

Pine has been rewritten from the ground up:

- TypeScript on current discord.js; every command is a slash command, with options Discord explains as you type (`/help` lists them all)
- One forum post per raid, max battle, train and meetup instead of a channel per raid, in a board (a forum) beside each region's channel, whose pinned post lists what is on today and coming up
- Buttons on the post instead of reactions, with the legacy reaction icons: Interested, Join, Here, Done and Leave; Meet… (the group's meeting time, from a list with the in-game RSVP times), ⬇️, ⬆️ and Remote; Group… and Manage…. Legacy `!group`, `!new` and `!meet` are Group…, Meet… and `/group`, `/meet`; a group nobody is in goes by itself
- Screenshots of raids and max battles read with `/raid` and `/max`, a mention of the bot, or Apps › Read screenshot on a message; a split screen is read pane by pane
- The raid boss list keeps itself current, from Leek Duck's
- Max battles (`/max`) at power spots, with lobbies of 4 (Dynamax) and 100 (Gigantamax) that Join fills, the bosses from Pokebattler with the event's boss first, and DMs by the Dynamax and Gigantamax boxes of `/want`
- Trains (`/train`) of raids or max battles, with a route and a conductor, planned days ahead if you like (`start:`); a Gigantamax Train's groups are filled up to its lobby
- Meetups (`/meetup`); if you turn it on, one at a map pin or at a place that sounds private waits for a moderator's approval
```

The list goes on in the second message, right after it:

```md
- Field research: `/research report` at up to five PokéStops, gathered in "Today’s Stops" on the region's board, DMs for wanted rewards; `/pokestop add` for sponsored stops
- Team GO Rocket: `/rocket report` posts a grunt for half an hour and puts leaders, Giovanni and decoys in "Today’s Stops"; `/want` a grunt type, a leader or Giovanni, and the Shadow box covers Rocket catches
- `/counters` for a max battle: the team of three Pokebattler suggests for your role (Attacker, Defensive, Healer or Shielder), with a link to its Lobby
- An events forum (optional): the game's events from Leek Duck, with a post for each bigger one
- Members report a raid, max battle, train, meetup or single message to your moderators privately (`/report`, or Apps › Report to moderators on a message); `/delete` is for staff and asks whether to archive the post or delete it
- Gyms, PokéStops and power spots imported from Wayfarer (`/gym import`; ask for the export tool at <https://profpine.com/userscript>), regions from KML (`/region import`)
- A history of every ended raid, max battle, train and meetup: `/stats` shows raids by region, boards of who did the most and a member's own numbers. Members are named in it only if they opt in (`/settings`), and can then add what they did with the old bot
- Optional web map (`/maps`): your regions, gyms and stops, the raids and trains going on, reporting and joining from it, and a region editor for staff (`/region edit`)
- One `/settings` panel for a member's pings, DMs and privacy; `/admin tutorial` posts a tutorial for your members
```

The third message, right after it:

```md
- Terms of Service and a Privacy Policy that say what the code keeps (`docs/legal/`), and `/admin forget` for the owner to remove a member's data on request
- Runs as a Docker stack with nightly verified backups, a watchdog, DMs to the owner when something is wrong, and `./pine update`
- Your existing database, regions, gyms and member settings are taken over as they are
- Rewritten by Matt with Claude, an AI that wrote a great deal of code and never once asked for a coffee break

IMPORTANT NOTE: once the servers of a bot reach 10,000 users, Discord reviews whether it may keep its privileged intents (Server Members, Presence, Message Content). An application that did not apply loses them on the date given in Discord's e-mail to its owner, and from then on the legacy bot's login is refused. Pine 2 needs **no** privileged intents.

Pine 2 needs Docker and git on the host instead of Node and MySQL. The move, step by step (settings converter, database restore, readiness check, forums, cleanup of the old raid channels; those of trains, meetups and saved parties stay): <https://github.com/Googer/Professor-Pine/blob/master/docs/guides/migrating-a-legacy-instance.md>
New instances: <https://github.com/Googer/Professor-Pine/blob/master/docs/guides/new-instance.md>

**Do not `git pull` in your legacy bot's folder any more:** `master` is Pine 2 now, and the old bot breaks on it. Update it only from the `legacy` branch.

@Pine Admins Please check your e-mail from Discord for your date, and move before it. Not ready in time? The `legacy` branch runs the old bot without Server Members and Presence: notifications then reach only members the bot has seen since it started, there is no auto role, and commands need a mention of the bot itself (not its role) instead of `!` (`@Professor Pine join`). The guide says how to switch. The legacy bot gets no further updates.

Questions? Ask here.
```

## 3. The official post of 2.0.3 (a small bug-fix release)

**Posted** by Matt on 2026-11-11, as below. Released that day (`master`, tag `v2.0.3`; Matt: "an official release announcement as a small bug-fix release"). Fixes of how screenshots are read, from production's screenshots of that day (`docs/superpowers/ocr-improvements.md`, causes 21 to 23). Nothing to do but update: no new commands to deploy, no change to the database or the settings.

```md
**v2.0.3 Released**

A small bug-fix release: screenshots are read better.

- A max battle with less than an hour to go: its countdown (shown as minutes and seconds) is now read, so the battle ends when the game says, not at `/max`'s default end
- A raid whose CP the Pokémon's head partly covers: the CP is read again on its own, so the boss and the tier come out right instead of a wrong tier
- A split screen whose raid shows a long gym name with faint words: no longer taken for two screens and refused

Update with `./pine update`; no new commands to deploy.
```

## 4. The official post of 2.1.0 and 2.1.1

**Not posted yet.** Drafted on 2026-11-15 (Matt: "We can make release notes as well for 2.1.0 and 2.1.1 since I never actually officially announced 2.1.0 either"). One post for both, its headline striking 2.1.0 through as the 2.0.2 post did, in two messages (about 1,620 and 1,040 characters). Checked against the code and the guides on 2026-11-15. `@Pine Admins`: retype it so that it pings.

```md
**~~v2.1.0~~, v2.1.1 Released**

One Pine can now serve many Discord servers, each with its own setup. Nothing changes for a single server's members.

- `/admin settings`: a server's channels, roles, features and distance units, set on Discord. The settings file's values are only a new server's defaults
- A time zone per server, in `/admin settings`: times, the boss list's changes, events and "Today's Stops" follow it
- Gyms, PokéStops, power spots, nicknames and gym requests belong to each server; one server's import never touches another's
- `/admin setup`: a server that adds Pine starts in setup, and lists what its staff must set before raids can be reported there
- `/operator` for what every server shares: the boss list's overrides, the event window, the image cache, and `/operator forget` (was `/admin forget`) to remove a member's data on request. The owner (`OWNER_ID`) and the `operators` of the settings file use it; on a closed instance a server's bot staff may too, in their own server
- The `servers` setting says which servers this Pine serves: unset, closed to new servers; a list of server ids; or `"open"`. A server not served is told so and left
- A server that removes Pine is kept 30 days, then its data is deleted
- Neighbors (`/admin neighbors`): two servers whose staff agree each see the other's party at the same gym or power spot on their posts
- Servers take turns: DMs, the screenshot reader, post updates and Google lookups are shared fairly
- 2.1.1: when a screenshot's CP and name fit two bosses (Black and White Kyurem), Pine posts the raid, then asks whoever sent it which one
```

The second message, right after it:

```md
To update: `./pine update` (it backs up first and migrates the database), then `./pine deploy-commands` for `/operator` and the new parts of `/admin`.

Notes:
- Leave `servers` unset to keep your Pine as it was: the servers it already serves keep working, set up from your settings file at the first start; a server added later starts in setup
- Check that `OWNER_ID` in `.env` is your own Discord user ID: it is who may use `/operator` everywhere and who gets the bot's alerts
- If you allowed or refused `/admin` for some roles in Server Settings › Integrations, set `/operator` the same way: Discord does not carry it over
- The web login now also asks which servers you are in, so the map shows only those of your Pine. The Privacy Policy and Terms in `docs/legal/` changed with it: if you publish your own, update them
- Thinking of offering your Pine to other communities? Read "A public Pine" first: <https://github.com/Googer/Professor-Pine/blob/master/docs/guides/new-instance.md#9-a-public-pine>

@Pine Admins Questions? Ask here.
```
