# Announcement drafts (plan 8L-2)

Two drafts for Matt to post by hand; nothing here is posted by the bot or by an agent. Each text to post is the content of its fenced block, as Discord markdown.

## 1. Pittsburgh's #bot-updates post

The text and how to post it are a page of their own since 2026-11-10, for whoever posts it (Matt: Airalyn may post it, and reword it): [`docs/announcements/pittsburgh-pine-2.md`](../../announcements/pittsburgh-pine-2.md). Rewritten on 2026-11-09, the night after the cutover, for Pine as it runs in Pittsburgh then (5,400 gyms, the boards, `#pogo-events`, the live map, `/request` on, the remote raid channel off); the Read screenshot sentence came with 2.0.1. Posted when Matt says.

## 2. The official Professor Pine Discord post (for admins of other instances)

Matt posts it now that version 2.0.2 is released (`master` and the tag `v2.0.2`, 2026-11-10, the same night as `v2.0.0` and `v2.0.1`, which were never announced; the `legacy` branch has been on GitHub since the first push), in the style of that server's earlier release posts: titled by version, a list of changes, the upgrade requirements as notes after it. `package.json` says `2.0.2`, as the title does. `@Pine Admins` is that server's role: retype it in the message box so that it pings. Three messages, one right after the other, as the larger releases there were: the list of changes alone is over Discord's 2,000 characters, so it goes in two.

```md
**v2.0.2 Released**

Pine has been rewritten from the ground up:

- TypeScript on current discord.js; every command is a slash command, with options Discord explains as you type (`/help` lists them all)
- One forum post per raid, max battle, train and meetup, in a forum beside each region's channel, instead of a channel per raid
- Buttons on the post instead of reactions, with the legacy reaction icons, in three rows at the bottom, the same for one group and several: Interested, Join, Here, Done, Leave; Meet… (the game's Select Time icon), −1, +1, Remote; Group… (and Set time… while a raid has no times). A newcomer to a post of several groups is asked which group in a dialog; Group… moves a member or opens a group with a label; Meet… sets the group's meeting time from a list with the in-game RSVP times. Legacy `!group`, `!new` and `!meet` are Group…, Meet… and `/group`, `/meet`; a group nobody is in goes by itself
- Raid screenshots read with `/raid`, a mention of the bot, or Apps › Read screenshot on a message
- Max battles (`/max`) at power spots, with lobbies of 4 (Dynamax) and 100 (Gigantamax) that Join fills, the bosses from Pokebattler with the event's boss first, and DMs by the Dynamax and Gigantamax boxes of `/want`
- Trains of max battles (Max Battle Train, Gigantamax Train) with stops at power spots, a Gigantamax Train's groups filled up to its lobby, and a train planned ahead with its start (`/train start:`)
```

The list goes on in the second message, right after it:

```md
- Field research: `/research report` at up to five PokéStops, a pinned "Today at the stops" post per region, DMs for wanted rewards; `/pokestop` for sponsored stops
- Team GO Rocket: `/rocket report` posts a grunt for half an hour and puts leaders, Giovanni and decoys in the pinned post; `/want` a grunt type, a leader or Giovanni, and the Shadow box covers Rocket catches
- `/counters` for a max battle: the team of three Pokebattler suggests for your role (two attackers and a charger, balanced, all attackers, shielder or healer), with a few others that would do
- Members report a raid, max battle, train, meetup or single message to your moderators privately (`/report`, or Apps › Report to moderators on a message); `/delete` is for staff and asks whether to archive the post or delete it
- Gyms imported from Wayfarer (`/gym import`), regions from KML (`/region import`)
- A history of every ended raid, max battle, train and meetup for statistics; members are named in it only if they opt in (`/settings history`)
- Optional web map of your regions and gyms
- Terms of Service and a Privacy Policy that say what the code keeps (`docs/legal/`), and `/admin forget` for the owner to remove a member's data on request
- Runs as a Docker stack with nightly verified backups, a watchdog, and `./pine update`
- Your existing database, regions, gyms and member settings are taken over as they are
- Rewritten by Matt with Claude, an AI that wrote a great deal of code and never once asked for a coffee break
```

The third message, right after it:

```md
IMPORTANT NOTE: once the servers of a bot reach 10,000 users, Discord reviews whether it may keep its privileged intents (Server Members, Presence, Message Content). An application that did not apply loses them on the date given in Discord's e-mail to its owner, and from then on the legacy bot's login is refused. Pine 2 needs **no** privileged intents.

Pine 2 needs Docker and git on the host instead of Node and MySQL. The move, step by step (settings converter, database restore, readiness check, forums, cleanup of the old raid channels; those of trains, meetups and saved parties stay): <https://github.com/Googer/Professor-Pine/blob/master/docs/guides/migrating-a-legacy-instance.md>
New instances: <https://github.com/Googer/Professor-Pine/blob/master/docs/guides/new-instance.md>

@Pine Admins Please check your e-mail from Discord for your date, and move before it. Not ready in time? The `legacy` branch runs the old bot without Server Members and Presence: notifications then reach only members the bot has seen since it started, there is no auto role, and commands need a mention of the bot itself (not its role) instead of `!` (`@Professor Pine join`). The guide says how to switch. The legacy bot gets no further updates.

Questions? Ask here.
```
