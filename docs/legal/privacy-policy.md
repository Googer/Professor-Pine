# Professor Pine: Privacy Policy

_Last updated: November 10, 2026_

Professor Pine ("Pine") is a Discord app that helps a community organize Pokémon GO raids, max battles, raid trains and meetups, with a web map beside it. This policy covers the Pine application run by its owner, Googer, and the web site that belongs to it. Pine is open source, and other people run their own copies; a copy run by somebody else keeps its own data and is that person's responsibility.

## In short

- Pine keeps what it needs to do what you ask of it: your Discord id, the name you show, what you sign up for, what you ask to be told about, and the settings you choose.
- Pine does not sell your data, show ads, or use analytics or tracking.
- Pine does not read your messages. It reads a message only when you mention it, write to it directly, post in a channel that is set aside for it, or when a member points it at a message from the Apps menu.
- Your name is off the long-term statistics unless you switch that on.
- Some things stay until you remove them or ask for them to be removed. Leaving a server does not remove them, because Pine cannot see who leaves.

## What Pine keeps about you

**Who you are on Discord.** Your Discord user id, and the name and team you show in the server when you use Pine. Pine has no access to your e-mail address, password, friends or other servers.

**What you tell Pine about yourself.** If you set them: your friend code, your in-game name, your Pokebattler id, and your settings (which pings and direct messages you want, whether your name goes on your reports, and the like). These are kept once for you, not per server.

**What you ask to be told about.** The Pokémon, raid tiers, research rewards, Team GO Rocket targets and gyms you want notices for, per server.

**What you take part in.** While a raid, max battle, train or meetup is on, Pine keeps who signed up, with name, team, status and extra players, and shows it in the post. When it ends, the live record is deleted and a history record is kept for statistics. That record holds what happened (teams, counts, times) but **not who you are, unless you switched on "history" in `/settings`**. The same goes for the leaderboards: you are named there only if you switched them on. Switching history off again takes your id out of every record of that server.

**What you report.** Field research, Team GO Rocket and wild spawn reports carry your name while they are shown, and are deleted when they end (at midnight, or after about half an hour for a grunt or a spawn). Long-term counts of such reports carry your id only with history switched on, and never the exact place.

**Screenshots.** When Pine reads a screenshot, it keeps the whole picture for a day, or until a day after its raid ends. If the reading was refused or doubtful, or somebody gave feedback on it, a copy is kept for up to 30 days so that the reader can be improved. The picture is the whole image you posted, including anything else that was on your screen. It can be seen by you, by the member who had Pine read it if that was somebody else, by the server's staff, and by Pine's owner.

**Reports to moderators and meetup reviews.** If you report a message or a party to the moderators, Pine keeps your report and, for a message, a copy of that message (its author, its text and the names of its attachments). If you ask for a meetup that needs approval, appeal a block, or are blocked from making meetups, Pine keeps that record with the names of those involved. These records are for the server's moderators and have no time limit.

**Who did what.** For 30 days Pine keeps a log, for the server's staff, of who made, changed or ended a party. This includes who made a report that is shown as anonymous: "anonymous" hides your name from other members, not from staff.

**The web site.** Logging in with Discord tells Pine your Discord id and the name you show, and nothing else; Pine asks Discord for the smallest permission there is (`identify`) and does not keep the access token. A login is remembered for 30 days in a cookie (`pine_session`). A second, short-lived cookie is used only during the login itself. There are no other cookies. Your browser's local storage holds your map preferences and unsaved edits; they never leave your browser. Pine does not store your IP address; it holds it in memory for about a minute to limit how fast one address can ask.

**If you used the earlier Pine.** The records of raids organized with the earlier version of the bot were brought along without member ids. Your id is attached to your own old raids only if you choose "Add my old-bot history" in `/settings`, and is taken off again when you switch history off.

## When Pine reads messages

Pine does not receive the text of messages in a server. It reads a message only when:

- the message mentions Pine (for example a raid screenshot posted with a mention);
- you write to Pine in a direct message;
- the message is posted in a region's board, a channel set aside for Pine, where it reads screenshots and then removes the message;
- a member chooses "Report to moderators" or "Read screenshot" on the message in the Apps menu. Another member can do this with a message you posted; Discord then hands Pine that one message.

## What other people can see

- **Everyone who can see a post** sees who signed up, with name, team and status. Posts stay on Discord after a party ends, as any Discord message does.
- **Members of servers you share with Pine** can look up your friend code and find you by your in-game name, if you set them.
- **Staff of the server** can see your settings and what you asked to be told about, the 30-day log, kept screenshots, and the moderation and meetup records.
- **Everyone** sees the leaderboards and anything you post with a "Share" button. You are on a leaderboard only if you switched that on.
- **Visitors of the web map who are not logged in** see regions and gyms only. Nothing about members.

## Direct messages

Pine sends you a direct message when something you asked to be told about is reported, and you can stop each kind from the message itself or in `/settings`. It also tells you when a party you signed up for changes its time or place, and about the outcome of your own meetup requests, appeals and screenshots; these cannot be switched off, because they are about something you are part of.

## Who else receives data

Pine runs on its owner's own computer. A few other services are involved:

- **Discord**, through which you use Pine.
- **Cloudflare**, which carries the web site's traffic and so sees visitors' IP addresses.
- **Map and picture hosts.** Your browser loads map tiles (Stadia Maps, OpenStreetMap) and game pictures (Leek Duck, GitHub) directly from their hosts, which see your IP address as any web site does.
- **Google Maps** and **OpenStreetMap's search** receive the places Pine looks up: the coordinates of gyms, or a place name typed into `/find-region`. Nothing about who asked.
- **Pokebattler** receives your Pokebattler id when you ask `/counters` to use your own Pokémon, and only then.
- **GitHub.** `/request` files a public request for a gym; your name, your server's name and what you wrote go with it, as the command says.

Pine does not share your data with anybody else, and never for advertising.

## How long things are kept

| What | How long |
|---|---|
| Live parties and reports | Until they end |
| History and counts without your id | Indefinitely |
| Your id in the history and on the boards | While you have them switched on |
| Wants, gym targets, saved routes, friend code, in-game name, settings | Until you remove them |
| Kept screenshots | 1 day; up to 30 days when kept for review |
| The staff's log of who did what | 30 days |
| Reports to moderators, meetup requests, blocks and appeals | No time limit |
| Web logins | 30 days after last use, or until you log out |
| Backups of the database | 90 days |
| Server logs (which can hold Discord ids, never message text) | A few days to weeks, until they roll over |

When Pine is removed from a server, that server's wants, targets, saved routes and live parties are deleted.

## Your choices

- **See your data:** `/settings` shows what Pine has for you and lets you change it.
- **Stop notices:** `/unwant`, `/unwant-all`, `/untarget-all`, or the buttons on a direct message.
- **Remove what you set:** `/friend-code remove`, `/nickname remove`, an empty Pokebattler id in `/settings`.
- **Take your name off the statistics:** switch history and boards off in `/settings`.
- **Keep your name off your reports:** "Name on reports and trains" in `/settings`.
- **Log out of the web site:** the menu on the map.

**Leaving a server does not delete anything**, because Pine cannot see who leaves. And some things you cannot remove yourself: your basic row with your Discord id, the reports you made to moderators, and your meetup records.

**Having your data removed.** Ask (the end of this page says how), and Pine's owner removes your data in every server at once. That takes away your settings, friend code and in-game name, everything you asked to be told about, your saved routes, your web logins, the screenshots Pine kept from you, and your id everywhere in the history and on the boards, together with the names and descriptions of the trains and meetups you made. On the reports you made to moderators, and on your finished meetup requests, appeals and questions, who you are is removed; what you wrote stays as the moderators' record, without your name or id.

What stays: a block from making meetups and the moderators' records about you, which are kept for the safety of others; anything of yours the moderators have not decided yet, until they have; the staff's 30-day log; and what is going on right now, which ends by itself. Pine does not edit messages on Discord that name you. Backups made before the removal age out within 90 days.

## Children

Pine is for people who may use Discord under Discord's own rules for age. Pine does not ask for or keep anybody's age.

## Changes and contact

This policy may change; the date at the top says when it last did.

For a question or a request about your data, message Pine's owner, Googer, on Discord, or ask the moderators of your server to pass it on. Please do not put personal details in a public GitHub issue.
