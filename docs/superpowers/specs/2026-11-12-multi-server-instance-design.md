# One instance for many servers, and sharding (2.1)

Designed with Matt on 2026-11-12, then read by a fresh reviewer for open questions. The follow-up it answers: `phase-0-follow-ups.md`, "For 2.1: a public application and Discord's verification", "One instance for many servers, and sharding". Earlier notes it builds on: the web map's "One instance serves several Discord servers" (`2026-10-15-web-map-region-editor-design.md`, 2.1), the top page's "No public list of servers" (`2026-10-29-web-top-page-design.md`) and "A time zone per server" (follow-ups, Phase 7).

## Why

Pine runs one community per installation today: Pittsburgh's server, on Matt's hardware, with one settings file. Other Pokémon GO communities that already talk on a Discord server of their own hear of Pine by word of mouth from members of a Pine community, or find it by searching for Pokémon GO Discord bots, and want it for themselves. Today each one would have to host Pine.

2.1 makes Pine able to run as one public instance that serves many servers, with a public invite link: a community clicks it and sets Pine up in its first hour (region channels, its region outlines on its own map, the channels of the other features) without asking anybody and without hosting anything. Servers on one instance do not see or change one another's data, and a busy one does not starve the others. Self-hosting stays as it is.

Matt has no hardware for a public instance today and may offer one later. So the work is that Pine can do it, built to run in earnest: everything here is on every instance (one path), and what makes an instance public is its settings (who may join), off by default.

## What Matt decided (2026-11-12)

1. **Who comes:** existing Pokémon GO communities with a Discord server of their own. They set Pine up themselves; nobody approves a server by hand on a public instance.
2. **Every party belongs to one server.** Two servers whose regions cover the same gym each keep their own raid there. A shared party with one list of members across servers is not built (it would show one server's members' names to another and ping them).
3. **Neighbors:** two servers whose staff both agree are neighbors. A raid at a gym inside both servers' regions gets a line in the other server's post: the server, the boss, how many are coming and when, and a link to the post. No names, no pings. Without that consent nothing crosses between servers.
4. **Gyms and stops are per server.** A new community starts from its own Wayfarer import, which gets it most of the way. The curated part (nicknames, notices, descriptions, search words) is what is worth sharing: a server may copy it from a neighbor.
5. **The Wayfarer export tool** stays handed out on request by the owner's instance (`/userscript`, the owner approves). Matt's idea of the operator running the export for a community from its outlines (Pine already has them; nothing has to be sent) is a later plan.
6. **The boss list's overrides and the event windows** stay one set for the instance: they patch gaps in the feeds, which are wrong for everyone. On an open instance only its operators change them. Some of them are local times, read in each server's zone.
7. **Google:** each server gets a share of the operator's monthly budget, weighted by its need (the spots in its regions still without an address) against everyone's, not split evenly.
8. **A server that removes Pine:** its data is kept 30 days, so that a re-invite picks up where it left off, then deleted. The Privacy Policy says so.
9. **Pokémon nicknames are a server's** (after the review): each server's staff add their own; the existing ones are copied to every server at the upgrade.
10. **On an open instance a server's map is closed to visitors who are not logged in** unless its staff open it (after the review); an unknown server and a closed one answer alike. An instance with a list of allowed servers keeps its public view.

## The rule

**A server's staff change only their own server's data; what every server shares is changed only by the instance's operators.** Everything below follows from it.

What is the instance's (one for all, changed by operators or the feeds): the raid and max boss lists and their overrides, the event windows, the game data and catalogue, the feeds (research, Rocket lineups, events), the image cache, the reader's models, Google's answers cached by the place asked about, the application's emoji.

What is a server's: its settings, regions, gyms and their curated text, Wayspots (stops and Power Spots), Pine's own stops, parties, history, boards, members' wants and targets, saved routes, moderation and meetup-safety records, gym requests, the Pokémon nicknames it adds, its share of the budgets.

What is a member's (one row per Discord user, as now): friend code, in-game name, Pokebattler id and the settings that are said to be "kept once for you". Other members find a member's friend code and in-game name only in a server both share.

**Every id that reaches Pine from Discord or the web (a party, a gym, a Wayspot, a region, a custom id's argument, a route's parameter) is checked against the server it came from**, and anything of another server is answered as if it did not exist: on every surface (commands, controls and their custom ids, dialogs, autocomplete, the web's routes) and for every kind of id, gyms and Wayspots too.

### Operators

Operators look after what every server shares. There are two tiers:

- **Instance operators:** `OWNER_ID` and the Discord user ids of a new setting `operators` (none unless set). They alone see and remove servers, keep the block list, and remove a member's data (`/admin forget`, the owner's alone in 2.0, becomes `/operator forget` for both).
- **Shared-data operators:** the instance operators, and, on an instance with a list of allowed servers (below), the bot-management staff of every listed server: a self-hoster lists only servers whose staff they trust. On an open instance only the instance operators. They change the boss list's overrides and sync it, set and end event windows, and clear the image cache. The owner is told by DM of every such change, with who and from which server.

These commands move out of `/admin` into a top-level `/operator`, offered in servers and in DMs with the bot (an operator need not be in the server they run it from), each subcommand guarded by its tier and hidden from `/help` for everybody else; `/admin` keeps what is a server's own.

## Per-server settings

What the settings file holds that is really a server's moves into the database, one row per server, set by that server's staff on Discord in a settings panel of its own (plan A; plan C adds the setup checklist around it):

- the channels by their role (bot lab, moderators' bot lab, Unown, elite gym raids, remote raids, PvP, bot updates, moderators, events forum), the PvP category and the Unown role, stored by id and chosen in a select;
- `features` (EX gym channel, remote raid channel, notifications, roles), and whether to use `autoAssignRole` and passive screenshot reading where the instance allows them (below);
- `timezone`, `distanceUnits`;
- `eventsForum`, `meetupSafety.flaggedWords`, `regionForumSuffix`, `blacklistWords` (the words gym search ignores), `postNewGyms`, `regionMapLink`;
- the web's `memberRole` (one name for the instance now, a server's from 2.1) and `invites` (one entry per server already);
- whether gym requests (`/request`) go to a GitHub repository: on an instance with a list of allowed servers, a listed server may send them to the instance's repository; otherwise they go to the server's moderators' bot lab.

What stays the instance's, in the file: secrets' names, the database, the web server (`port`, `publicUrl`, `tiles`, `trustProxy`), the screenshot reader, the feeds and their intervals, the game data, Google's budgets, `helpGroups` (the order of `/help`'s groups), the durations of raids and battles and the lobby sizes (game facts), `maxBattles.firstBattle` / `lastBattle` and `raidEvents.weeklyRaidHour` (game facts in local time: read in each server's zone), `wildSpawnExceptions`, `rehearsal`, the emoji, `wayspotTool`, and `ocr.passive` and `autoAssignRole` as what the instance allows (they decide the intents Pine logs in with).

**An existing installation upgrades without a step.** At the first start of 2.1, once every shard is ready, the file's server keys are written into the row of every server the bot is in, channel and role names resolved to ids in that server. A name not found there stays unset, and the server's moderators' bot lab (or the log, without one) says which. Every server present at the upgrade counts as set up. From then on the server's values are read from the database through one `ServerSettings` lookup (in memory, refreshed when its staff change one), never from `config.settings`.

The file's server keys stay accepted: on an instance with a list of allowed servers they are the defaults of a server that joins later (a self-hoster's second server); on an open instance they are ignored, and a new server starts from the code's defaults and its setup (no time zone until its staff choose one). `settings:convert` and the guides say so.

**Commands are registered once for everyone.** A command that depends on a server's setting (notifications, roles, `/maps`) is offered everywhere, answers "not set up in this server" with what to set, and is left out of that server's `/help`. A command that depends on the instance (`/find-region`, the screenshot reader, `/region edit` with the web) keeps `enabled(config)`.

**`/report` refuses without a moderators' channel** (a few lines, in plan A): it never posts a report in the open.

### Time zones

Each server has its own zone; every time a member types, every screenshot clock, every date in a post, every "today" and every local midnight is in it. That changes code that has no server in hand:

- **Feeds.** A time a feed gives as local wall-clock time (a rotation's start, Raid Hour 6–7 PM, a research day) is kept as wall-clock time and turned into a moment per server, in its zone, when it is used. A time given as a moment (a global event in UTC) stays one moment.
- **The boss list is a fact per zone.** Which bosses are valid now, the announcement of a change to a server's bot-updates channel, and the re-read of the feeds just after a rotation starts or ends are decided per zone in use, by one domain function (the valid bosses at a moment in a zone) that every surface calls.
- **Event windows** that operators set are entered as local time, applied in each server's zone, or with a zone, as one moment. Windows already stored are moments and stay so.
- **Local midnights** (summaries, the events forum, want counts, stop lines and posts, the boards' daily keep): one timer per zone in use, each serving the servers in that zone.
- **The activity heatmap and day counts** are stored in the server's zone. A server that changes its zone has its activity rebuilt (`activity:rebuild` for that server, derived and safe to run again), started by the change.
- **The web map** gets the zone of the server it shows.

## Gyms, stops and Wayspots per server

Gyms, their curated text (`GymMeta`), Wayspots (stops and Power Spots) and Pine's own stops belong to servers. Every read and write takes the server; gym search keeps one index per server, so a search, an autocomplete or a pick lists only the server's own gyms. Regions of different servers may overlap freely; neither sees the other's.

- **Gyms belong to their servers by a new link table** (gym, server). A gym made from 2.1 on, by `/gym add` or an import, is a new row of one server, also where another server has a gym of the same Wayfarer id. A server's staff may change exactly their server's gyms, wherever they lie; nothing else.
- **The upgrade copies nothing.** Every existing gym is linked to every server whose regions cover it, or, in no region, to the servers whose history used it, and otherwise to every server present. A gym linked to several servers (overlapping regions of one installation's own servers) stays one row they share, with its curated text, as before; no reference to a gym is rewritten.
- **Wayspots** move to a new table keyed by (server, Wayfarer id), since one Wayfarer id may now be a Wayspot of several servers. The upgrade copies each existing Wayspot to the servers whose regions cover it (or that used it). References to a Wayspot already carry their server. The queues of their Google lookups are keyed by (server, id).
- **`/gym import`** reads and writes only the importing server's gyms and Wayspots, inside that server's regions (with the import's usual margin); its checks (matching, the review) look at that server's gyms only.
- **Google's answers** (addresses, places) are cached by the point and the kind of question, never by a gym's or a Wayspot's id, so that two servers with the same place ask Google once and neither can change the other's answer.
- **Pokémon nicknames** are a server's: Pokémon search (and with it wants, targets and the boss options) takes the server and reads the instance's names with that server's nicknames. The existing nicknames are copied to every server present at the upgrade; `/admin nickname` changes the server's own.

**Going back a version from 2.1 is restoring the backup made before the upgrade.** 2.0 does not know the link table and would read every server's gyms as one list. `operations.md` and the release notes say so.

## Neighbors

Two servers become neighbors when the staff of one asks (`/admin neighbors`, naming the other by its id or an invite of it) and the staff of the other accept in their moderators' bot lab; either may end it at any time, and both are told. A server may have one request pending per other server, a declined request may be asked again only after a week, and asking for a server Pine is not in is answered as any other request is.

- **The line in a post.** A raid or max battle at a gym or Power Spot inside both servers' regions shows in each server's post a line for the other's party there: the neighbor's name, the boss or tier, the hatch or start time, how many are coming (by status), and a link to its post. It follows the other post's changes, with redraws gathered as a post's own are, so that a busy neighbor does not exceed Discord's edit limits. No member is named, nobody is pinged, and nothing is shown at a gym only one of them covers.
- **The same gym** is matched by its Wayfarer id; failing one, by its place within a few meters and its name.
- **Copy from a neighbor:** a server's staff may copy the neighbor's nicknames, notices, descriptions and search words onto their own gyms that match the neighbor's. It never overwrites what their own staff set, and can be run again; it is not a live link.

## Joining, the setup state, leaving

**Who may join.** A setting `servers` in the file is either a list of allowed server ids or `"open"`. Unset, an instance is closed to new servers. The servers allowed are the file's list, the servers recorded at the upgrade, and those an instance operator allows (`/operator servers`); the block list (in the database) wins over all of them. A server that is not allowed gets one message in its system channel, if the bot may write there, saying this Pine is private and how to host one's own, and the bot leaves. A self-hosted instance lists its servers; a public instance is `"open"`. The `cutover-check` and the guides say which an instance is and warn where Public Bot and the setting disagree.

**At every ready, not only on Discord's events.** A server can add or remove Pine while it is down, and Discord sends no event for that afterwards. So once every shard is ready, Pine compares the servers it is in with its records: a present server that is not allowed is left as above; a recorded server that is gone (not merely unavailable) is marked left. A server Discord reports unavailable counts as present.

**The setup state.** A server that just added Pine is in setup until its staff finish: only `/admin setup` and `/help` work, members are answered "Pine is not set up in this server yet", and nothing posts, DMs or reports. `/admin setup` is a checklist around the settings panel, every item a step with the channel or value it needs and whether it is done: the time zone and units, the channels, the first region (in the region editor, or `/region import`), the moderators' channel, the events forum, the gyms (with the way to ask for the Wayfarer tool). Pine leaves setup when the required items are done (time zone, bot lab and moderators' bot lab, one region); the rest can follow. A feature whose channel is not set does nothing in the open.

**Instance operators see servers** (`/operator servers`): each server's name, member count, whether it is set up, its last activity and its share of the budgets, never its members. They can allow a server, make Pine leave one, and keep it from coming back.

**Leaving.** When Pine is removed from a server, the server is marked left with the time, and nothing more happens: its parties stop, nothing is posted or sent, and nothing is deleted yet (the removal no longer deletes the server's row and what hangs on it at once). If Pine is added back within 30 days, it picks up where it was (the setup state is skipped when the setup was done). After 30 days everything of that server is deleted: settings, regions, its links to gyms (a gym with no server left is deleted with its curated text), Wayspots, stops, parties, history, boards, wants, targets, routes, moderation and meetup records, gym requests, kept screenshots, and every per-server table that plans A to C add. Members' own rows stay. Backups age out as they do. The Privacy Policy changes from "deleted at once" (wants, targets, routes, live parties) to this.

## Fairness and limits

- **Direct messages.** A DM carries its server (or the instance, for the owner's alerts). The queue takes turns between servers within each priority, so one server's burst waits behind the others' rather than in front of them; when it is full, the oldest of the lowest priority of the server with the most queued goes first. Discord limits how many new DM channels a bot opens, for the whole bot: each server gets a cap on DMs to members Pine has not written to before, per window, so that one server's burst cannot make Discord stop every server's DMs.
- **Screenshots.** The reader's queue takes turns between servers, the queue's size the bound of all waiting together and each server at most a few of them. The space for kept screenshots is shared fairly: when it is full, the server keeping the most gives way first. The kept-for-review limit stays per server.
- **Google.** The monthly budget is shared by need: a server's share of the month is its need (gyms and Wayspots inside its regions still without an address or place) over everyone's, at most half the month and at most a fixed number per server, with a small floor for the lookups its staff make by hand. Instance operators may raise a server's share. The line serves each server up to its share; a server that is out waits for the 1st, and nothing else stops. `/find-region`'s maps keep their own monthly count, shared the same way. The month and the free amounts are Google's (Pacific time).
- **Discord's global limit** (50 requests a second per bot) is shared: Pine's own queues (DMs, post redraws where they are queued) take turns between servers; per-member throttles stay as they are.
- **What Pine keeps in memory** is bounded per server where a server can fill it (the caches of members, the throttles' maps, the board's sightings).

Numbers (shares, caps, floors, queue sizes) are settings of the instance with defaults that suit a self-hosted one; a public instance tunes them from its load, never from the laptop's timings.

## Alerts and logs

The owner's alerts are about the instance (the gateway, the database, the feeds, the budgets) and name servers, never members of a server. What is wrong with one server's setup (a channel gone, a permission missing, meetup safety without a moderators' channel) goes to that server's moderators' bot lab, not to the owner. Logs keep server ids.

## Privileged intents

A public instance runs with none: the Message Content intent (passive screenshot reading) and the Server Members intent (`autoAssignRole`) need Discord's approval beyond 100 servers, and Pine works without them. A self-hosted instance may keep them; the file says whether the instance asks for them, a server whether it uses them.

## Sharding

One gateway connection (a shard) serves at most 2,500 servers, and Discord tells a bot in more how many it needs (`GET /gateway/bot`). Pine runs its shards in one process: `createClient` sets `shards: 'auto'`, and discord.js connects as many as Discord asks.

- **Health:** the heartbeat's gateway probe reads every shard (`gatewayConnected` over `client.ws.shards`). With several, one shard reconnecting is routine: the bot is unhealthy (and the watchdog restarts it) only when a shard has been away longer than a few minutes, or all are. The health line says how many shards are up.
- `GatewayWatch` keeps its time away per shard, and a shard's return catches up only that shard's servers.
- Start-up work per server (`syncGuilds`, meetup safety's warnings, the spawns that stood through a restart) runs on each shard's ready; the checks of who is in (above) run once every shard is ready.
- Several processes (`ShardingManager`) are not built. What would have to change for them is written down for when one machine's process is the limit: everything kept in memory and shared (the party store's one-change-at-a-time, throttles, caches, schedulers, the web server, the DM queue) split by server or moved into the database, and each process seeing only its shards' servers.

## The web

The web map and history page are per server (`/s/<guild>/…`). With per-server gyms and zones they read the server's own; logins, per-member limits and cost limits hold across servers, and the top page still lists no server to a visitor who is not logged in. On an open instance a server's map and its outlines (`/s/<guild>/api/geo` and the pages) are closed to visitors who are not logged in unless the server's staff open them (a setting of the server, off unless set there); a closed server answers exactly as a server Pine is not in. On an instance with a list of allowed servers the setting is on unless a server turns it off, so its public view stays.

## Legal

The Privacy Policy and the Terms of Service cover the instance their operator runs; a public instance run by Matt publishes his (`docs/legal/`), and another operator publishes their own. They gain: the operators and the servers' staff and what each can see, what is a server's and what a member's, leaving and the 30 days, a server's share of the operator's services, and that an operator may remove a server.

## Discord's verification and the public switch

Turned on in this order, by Matt, only when a public instance is wanted: plans A to D merged and staged; the Privacy Policy and Terms updated; `servers: "open"` on that instance; Public Bot on; the install link; Verify App. A self-hosted instance (Pittsburgh's included) keeps Public Bot off and lists its servers.

## Plans

In this order:

1. **A, per-server settings and time zones:** the server settings table, the lookup and the settings panel; the upgrade that fills it (ids resolved after ready, every present server set up); every reader moved from `config.settings` to the server's; commands that refuse per server; `/report` without a moderators' channel refused; a zone per server through the feeds, the boss list, event windows, midnights, the activity store and the web.
2. **B, separation and fairness:** the `servers` and `operators` settings and the two tiers, `/operator`; gyms by link table and Wayspots per server, with the upgrade's links and copies; gym search, Pokémon nicknames and the import per server; Google's answers by point; every id checked against its server; gym requests per server; the DM and screenshot queues by server, the first-contact cap, the kept space; Google's shares; alerts to a server's own staff.
3. **D, sharding in one process:** before C, so that C's checks at ready are written once, per shard.
4. **C, onboarding and leaving:** joining by `servers` (also at ready), the setup state and `/admin setup`'s checklist, `/operator servers` and the block list, leaving and the deletion after 30 days over every per-server table of A and B, the visitors' view of a server's map, the Privacy Policy, the Terms, the guides, `cutover-check`.
5. **E, neighbors:** after B: the consent, the line in a post, copying the curated text.

Later, not planned: the operator running the Wayfarer export for a community from its outlines; several processes.

## Left to the builder

- The shape of the tables (one row of typed columns per server, or a checked JSON document), so long as the settings' schema checks a server's values as it checks the file's.
- How a feed's wall-clock times are kept (beside its moments, or in place of them) and which feeds give which.
- The exact numbers of the shares, caps, floors and per-server queue sizes, as defaults a self-hosted instance does not notice.
