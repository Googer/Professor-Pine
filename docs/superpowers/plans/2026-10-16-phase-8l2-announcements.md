# Announcement drafts (plan 8L-2)

Two drafts for Matt to post by hand; nothing here is posted by the bot or by an agent. Each text to post is the content of its fenced block, as Discord markdown.

## 1. Pittsburgh's #bot-updates post

Rewritten on 2026-11-09, the night after the cutover, for Pine as it runs in Pittsburgh then (5,400 gyms, the boards, `#pogo-events`, the live map, `/request` on, the remote raid channel off). Posted when Matt says. Before posting:

- Two messages, the second right after the first: together they are over Discord's 2,000 characters, each one under it (about 1,890 and 970 with the mentions retyped).
- Retype `#squirrelbreeze-board`, `#pogo-events` and `#feedback-n-at` and pick them from the list, so that they become links; retype `@Professor Pine` and pick the bot itself, not a role of the same name (it shows members the mention that makes the bot read a screenshot).
- Discord shows `__**…**__` as an underlined bold heading, as the tutorial does.

```md
# Professor Pine is back from a long slumber!

Attention Trainers,

Professor Pine dozed off over a stack of raid reports, and woke up to a lab rebuilt around him. The `!` commands are gone: everything is a slash command or a button now. Here is what's new.

__**Every raid has its own post**__
🗂️ Raids are posts in your region's board, right next to its channel (for example #squirrelbreeze-board). The board's pinned post lists them all. No more channel per raid!
📸 Post a screenshot in your regional channel and mention @Professor Pine, or attach it to `/raid`: he reads the gym, the boss and the timer for you.
✍️ Or type `/raid` and pick the boss, the gym and the time from the lists.

__**Buttons instead of reactions**__
Interested, Join, Here, Done and Leave are buttons on the post, with the icons you know. ⬆️ ⬇️ change how many you bring, Remote says you are raiding remotely, Meet… sets your group's time and Group… moves you to another group.

__**Max battles**__
⚔️ `/max` reports a Dynamax or Gigantamax battle at a Power Spot, with a post and buttons just like a raid. `/counters` suggests a team.

__**Trains and meetups**__
🚂 `/train` starts a raid or max battle train with a post of its own. `/route add` lays out its stops, and the conductor moves it along. Trains can be planned days ahead.
🎉 `/meetup` is for trades, lure parties or playing as a group. The moderators may check the place first.

__**More to report**__
📋 `/research` and `/rocket` report field research and Team GO Rocket at PokéStops, gathered in each board's "Today's Stops".
🐾 `/wild` reports a rare spawn.
📅 #pogo-events lists the game's events, with a post for each one coming up.

__**Get notified**__
🎯 `/want` a Pokémon, a raid tier, a research reward or Team GO Rocket, and ⭐ `/target` a gym: Pine sends you a DM when one is reported. `/settings` holds the rest of your pings and DMs.
```

The second message, right after it:

```md
__**The map**__
🗺️ `/maps` opens Pine's live map on the web: every region, gym and PokéStop, and the raids and trains going on now. You can report and join from it too!
Our gym list has nearly doubled: about 5,400 gyms, freshly synced with Wayfarer.

__**Pine's numbers**__
📊 `/stats` shows raids by region, the boards of who did the most, and your own numbers. In `/settings` you can join the boards, and **Add my old-bot history** brings in the raids, trains and meetups you did with the old Pine.

__**Finally**__
Raids that were open during the move are gone, so please report those again. The old train and meetup channels stay for discussion. `/help` explains every command, `/report` tells the moderators privately about a post or a message, and `/request` asks for a fix to a gym that is wrong.

Thanks to Claude, the AI who rebuilt most of Pine with Googer and never once asked for a nap.

Something broken, odd or missing? Tell us in #feedback-n-at.
```

## 2. The official Professor Pine Discord post (for admins of other instances)

Matt posts it now that version 2.0.0 is released (`master` and the tag `v2.0.0`, 2026-11-10; the `legacy` branch has been on GitHub since the first push), in the style of that server's earlier release posts: titled by version, a list of changes, the upgrade requirements as notes after it. `package.json` says `2.0.0`, as the title does. `@Pine Admins` is that server's role: retype it in the message box so that it pings. Three messages, one right after the other, as the larger releases there were: the list of changes alone is over Discord's 2,000 characters, so it goes in two.

```md
**v2.0.0 Released**

Pine has been rewritten from the ground up:

- TypeScript on current discord.js; every command is a slash command, with options Discord explains as you type (`/help` lists them all)
- One forum post per raid, max battle, train and meetup, in a forum beside each region's channel, instead of a channel per raid
- Buttons on the post instead of reactions, with the legacy reaction icons, in three rows at the bottom, the same for one group and several: Interested, Join, Here, Done, Leave; Meet… (the game's Select Time icon), −1, +1, Remote; Group… (and Set time… while a raid has no times). A newcomer to a post of several groups is asked which group in a dialog; Group… moves a member or opens a group with a label; Meet… sets the group's meeting time from a list with the in-game RSVP times. Legacy `!group`, `!new` and `!meet` are Group…, Meet… and `/group`, `/meet`; a group nobody is in goes by itself
- Raid screenshots read with `/raid` or a mention of the bot
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
