# Announcement drafts (plan 8L-2)

Two drafts for Matt to post by hand; nothing here is posted by the bot or by an agent. Each text to post is the content of its fenced block, as Discord markdown.

## 1. Pittsburgh's #bot-updates post

Posted after the move (runbook N7). Before posting:

- Keep **one** of the two map lines: the first once the web map is reachable through the tunnel, the second until then. Each line is marked by its first word in brackets; take the bracketed word out.
- Discord turns `#feedback-n-at` into a link only when it is typed and picked from the list: retype it (and the forum's name) in the message box.
- Check that `/request` is offered in the server (it needs `GITHUB_TOKEN` and `GITHUB_REPO` in `.env`); if it is not, take it out of the "Finally" paragraph.
- Retype `@Professor Pine` too, and pick the bot itself from the list, not a role of the same name: the post shows members the mention that makes the bot read a screenshot.
- Two messages, the second right after the first: together they are over Discord's 2,000 characters. Each is under it with one map line kept and its bracketed word out, also once `#feedback-n-at`, `@Professor Pine` and the forum name are retyped as mentions, which Discord counts as sent (a mention is about 21 characters).

```md
# Professor Pine is back from a long slumber!

Attention Trainers,

Professor Pine dozed off over a stack of raid reports a while ago, and woke up to find his whole lab rearranged. He spent the first day looking for his `!` key. Then he got new glasses (again: he reads screenshots better than ever) and got back to work. Here is what changed:

First, **every raid has its own post** in your region's forum, right next to the region's channel (for example #squirrelbreeze-meetups). No more channel per raid.

Next, **buttons instead of reactions**, with the icons you know. With several groups Join asks which; Group… moves you; Meet… sets your group's time.

Then, **slash commands**. Type `/` and Discord shows you the list, with every option explained:

- `/raid` reports a raid or an egg: `/raid boss:Mewtwo gym:Big Fountain time:6:15pm`
- `/max` reports a Dynamax or Gigantamax battle at a power spot: `/max boss:Machamp spot:Gazebo` (or paste a maps link for a power spot Pine does not know)
- `/join`, `/interested`, `/here`, `/done` and `/leave` work in a raid's post
- `/train` and `/meetup` start a post of their own; a train goes to raids, Dynamax or Gigantamax battles (`/train kind:`), from gym to gym or power spot to power spot (`/route add stop:`), and can be planned days ahead (`/train start:`)
- `/want` and `/target` get you DMs for bosses and gyms; `/settings` shows and changes the rest of your settings
- `/wild` reports a wild spawn
```

The second message, right after it:

```md
**Screenshots**: attach one to `/raid`, or post it with a mention of @Professor Pine (the bot itself, not the role), and he reads it for you.

**Raid history**: Pine now keeps statistics of every raid, max battle, train and meetup. Want your name in them? Turn your history on in `/settings`. Otherwise you are counted, anonymously. Once it is on, **Add my old-bot history** in `/settings` will add the raids, trains and meetups you made or joined with the old Pine, as soon as it shows there.

[Map] **A map of our regions and gyms** on the web: `/maps` gives you the link.
[Soon] A map of our regions and gyms on the web is on its way.

Finally, the old `!` commands are gone, and so are the raids that were open during the move: please report those again. The old train and meetup channels stay for discussion; new trains and meetups start with `/train` and `/meetup`. `/help` explains every command, `/report` tells the moderators privately about a raid or a message (Apps › Report to moderators), and `/request` tells us about a gym that is wrong.

Thanks to Claude, the AI who rewrote most of Pine with Matt and never once asked for a nap.

Something broken, odd or missing? Tell us in #feedback-n-at.
```

## 2. The official Professor Pine Discord post (for admins of other instances)

Matt posts it once the new code and the `legacy` branch are on GitHub (the first push), in the style of that server's earlier release posts: titled by version, a list of changes, the upgrade requirements as notes after it. `package.json` says `2.0.0-dev` today: set it to `2.0.0` with the push, or change the title to the version that ships. `@Pine Admins` is that server's role: retype it in the message box so that it pings. Three messages, one right after the other, as the larger releases there were: the list of changes alone is over Discord's 2,000 characters, so it goes in two.

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

Pine 2 needs Docker and git on the host instead of Node and MySQL. The move, step by step (settings converter, database restore, readiness check, forums, cleanup of the old raid channels; those of trains, meetups and saved parties stay): <https://github.com/Googer/Professor-Pine/blob/main-dev/docs/guides/migrating-a-legacy-instance.md>
New instances: <https://github.com/Googer/Professor-Pine/blob/main-dev/docs/guides/new-instance.md>

@Pine Admins Please check your e-mail from Discord for your date, and move before it. Not ready in time? The `legacy` branch runs the old bot without Server Members and Presence: notifications then reach only members the bot has seen since it started, there is no auto role, and commands need a mention of the bot itself (not its role) instead of `!` (`@Professor Pine join`). The guide says how to switch. The legacy bot gets no further updates.

Questions? Ask here.
```
