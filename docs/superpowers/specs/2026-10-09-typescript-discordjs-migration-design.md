# Professor Pine: TypeScript + modern discord.js migration — design

Date: 2026-10-09
Status: Draft for review
Audience: the agents who will write per-phase implementation plans, and the maintainers reviewing them.

## 1. Goal and constraints

Rewrite Professor Pine, a live Pokémon GO raid-coordination Discord bot, from JavaScript on discord.js v12 + a forked discord.js-commando into TypeScript on current discord.js (v14), carrying over most functionality while adopting Discord features that did not exist when it was written.

Decided with the maintainer:

| Topic | Decision |
|---|---|
| Deployment | Bot is live. The new bot takes over the **same MySQL database** in a planned, single cutover. All schema changes are additive until after cutover so the old bot remains a rollback option. **New installs on an empty schema are also supported.** |
| Strategy | Fresh TypeScript codebase in `src/` on a long-lived branch; legacy JS stays as reference until the cutover phase deletes it. No incremental in-place conversion, no side-by-side bots. |
| Runtime | Node 24 (current LTS). |
| Stack | discord.js v14 with a thin in-house interaction router (no Sapphire); Kysely on mysql2; pino; Luxon; MiniSearch; Vitest; zod for config. |
| Invocation | Slash commands, autocomplete, buttons, select menus and modals only. **No prefix (`!`) commands**, no shim. |
| Party UI | Reactions on bot messages become **buttons**. |
| Party space | Each region gets a **forum channel** beside its existing text channel (same category). Every raid/train/meetup is a **forum post**. Ended posts are **archived and locked**, not deleted. |
| Cross-region joiners | Someone joining from a mirror channel who cannot see the region gets a member overwrite on that **region's forum**, revoked when no longer needed. |
| OCR | Screenshot raid reporting is ported **in the core migration** (must work at cutover). |
| Dropped | Silph Road (`silph-card`, `register-silph`, `User.silph`), `howmany`, GO Stadium link, the second "notify" bot token and its worker thread, Commando built-ins (`groups`, `enable`, `disable`, `reload`, `load`, `unload`, `ping`, `unknown-command`). |
| Kept, fixed | `/counters` (Pokebattler), `/request` (GitHub issue via fine-grained token), `/rank` (now links to pvpivs.com). |
| Role gating | The custom `require-role`/`add-role` system is replaced by Discord's native per-command permissions (Server Settings → Integrations), plus `default_member_permissions` on admin commands. |
| Game data | As much as possible is derived from the downloaded game master and text files. `data/pokemon.json`, `types.json` and `weather.json` are retired; magic numbers become explicit types (section 6.6). |
| Raid bosses | The current boss list maintains itself from a live feed (pokemon-go-api, sourced from Leek Duck), with moderator overrides as an exception path (section 6.7). |
| Shadow raids | Supported: shadow is a raid attribute with its own tag, autocomplete entries and notification targets. Max Battles are out of scope. |
| Privileged intents | Pine requires **none**. Message Content and Server Members are optional, each unlocking one feature behind a config flag (section 3.1). Core functionality never depends on Discord approving an intent. |

Success criteria:

1. Every retained command and reaction flow has a slash/component equivalent with the same domain behaviour (statuses, groups, counts, timers, notifications).
2. Cutover on the live servers completes with no data loss in MySQL; active trains and meetups survive; rollback to the old bot remains possible until legacy tables are dropped.
3. The codebase type-checks under `strict`, has automated tests for domain logic, rendering, repositories and handlers, and contains no legacy JS after phase 8.

## 2. Current system (summary)

Reference for planners; file paths are in the legacy tree.

- **Entry:** `index.js` builds a Commando client (intents incl. privileged `GUILD_PRESENCES`; partials MESSAGE/CHANNEL/REACTION), registers 117 commands in groups `admin, basic-raid, raid-crud, region, train, meetup, roles, notifications, friends, silph, commands, util`, some conditionally on `settings.features.*` or private settings.
- **Permissions:** per-command `dispatcher.addInhibitor` checks: management (roles named `admin`/`moderator` or owner), bot management (+ `bot developer`), bot channels by name (`the-bot-lab`, `mod-bot-only`), region channels (has `Region` row), party channels by type, PvP category; plus the global role-authorization inhibitor (`app/role-authorization.js`).
- **Parties:** `app/party.js` (abstract) with `app/raid.js`, `app/train.js`, `app/meetup.js`; `app/party-manager.js` owns the registry, the single `messageReactionAdd` listener, the 60 s cleanup interval, channel ordering, and node-persist storage (`parties/active`, `parties/complete`). Each party is a text channel created in the region channel's category, copying its overwrites; a region announcement and a pinned in-channel status message both carry the reactions.
- **Reactions:** interested 🤔, join 🏃, here ✅, done 🎉, ⬆️/⬇️ count, remote 📡 (not on elite raids), leave 👋, group 🇦–🇪 on party messages; ⬅/➡ pagination on `!iam`. The handler calls `command.run()` with fake args and always removes the user's reaction. Other reactions are 👍/👎/🤔 acknowledgements on user messages.
- **Mirrors:** `app/ex-gym-channel.js` (`#potential-ex-gym-raids`, for EX-tagged gyms) and `app/remote-raid-channel.js` (`#remote-raids`, non-elite) post tracked, reactable copies of the status.
- **Notifications:** `app/notify.js` listens to client events (`raidCreated`, `raidPokemonSet`, `raidGymSet`, `trainCreated`, `spawnReported`) and DMs matching users via a worker thread (`app/send-message-worker.js`) running a second client on `discordNotifyToken`.
- **OCR:** `app/process-image.js` starts five tesseract.js workers on require, listens to all messages, OCRs image attachments in region channels and creates raids.
- **Data:** knex + mysql migrations `app/db/*.js` (27, latest `20221014-pokemon-elite`) run automatically; a second raw mysql pool in `app/dbhelper.js` for spatial SQL. Tables: `Guild, Role, Alias, AutoAssignRole, User, PokemonNotification, GymNotification, Pokemon, AutosetPokemon, Region (POLYGON bounds), Gym, GymMeta, SavedRoutes, CommandRoleAuthorization, CommandRoles`.
- **Search:** lunr indexes (`app/search.js` and subclasses) for gyms (per-region `local` + `neighboring`, plus `master`), Pokémon, moves, statuses, privacy options; rebuilt by `app/update.js` intervals.
- **External:** PokeMiners game master/texts (`app/pogo-data.js`), Google geocoding/places/static maps (`@google/maps`), Nominatim (`app/map.js`), Pokebattler (`commands/util/counters.js`), GitHub issues with password auth (`commands/raids/submit-request.js`, broken), Silph Road (dead).
- **Config:** `data/settings.json` (global durations, timings, emoji, feature flags, channel/category names, help group order, blacklist words); `data/private-settings.json` (tokens, owner, image base URL, GitHub credentials, Google key, region map link, DB).
- **Tests:** none.

Legacy bugs that the port must not reproduce:

- `shout` inhibitor checks the command name `new`, so `shout` has no channel check.
- Role-authorization DM check is always true.
- Several gym/region admin commands are not guild-only but use `message.member`/`message.guild`.
- `validParty` is sometimes passed a bare type instead of an array.
- `counters` reads `pokebattler_id` but writes `pokebattlerId`.
- `findgym` and `keywords` argument types keep per-request state on shared instances.
- OCR's attachment filter (`url.search(...)` truthy for -1) processes every attachment.
- lru-cache TTL passed under `options`, so the game-master cache never expires.
- `dbhelper.query` defined twice; errors thrown in callbacks never reject.
- Hatch transitions that happen while the bot is down are skipped on restart.
- `messageDeleteListener` is bound to `message`, not `messageDelete`.
- Train/meetup `toJSON` omits `lastPossibleTime`, so they only auto-delete after an end time is set.
- `node-fetch` and `common-tags` are used but not declared.

## 3. Architecture

```
src/
  index.ts              bootstrap: config → logger → db (migrate) → services → client → router → login
  config/               zod-validated loader for settings.json and environment variables
  discord/
    client.ts           Client factory and intents
    router.ts           dispatch for ChatInput, Autocomplete, Button, StringSelect, Modal
    guards.ts           preconditions: inGuild, inParty(types), inRegion, isManagement, isBotManagement, inPvpContext
    custom-id.ts        encode/decode component custom IDs
    deploy.ts           CLI: register slash commands (per guild for staging, global for production)
  commands/<group>/     one file per slash command: { data, guards, execute, autocomplete? }
  components/           button/select/modal handlers
  domain/               pure logic; no discord.js imports
    party/              Party, Raid, Train, Meetup models and state transitions
    time/               time-argument parsing and clamping (port of types/time.js)
    search/             MiniSearch-backed gym, Pokémon, move, status, privacy search
    pogo/               game master fetch/parse, Pokémon and move catalogue
    pvp/                rank and CP maths
    counters/           Pokebattler client and option parsing
  services/
    party-service.ts    create/update/archive parties; owns forum posts, tags, mirrors, region link lines
    render/             renderPartyPost, renderSummary, notification renderers (pure)
    scheduler.ts        the periodic tick
    summary-service.ts  per-forum "Active raids" pinned post
    access-service.ts   forum member overwrites for cross-region joiners
    notify-service.ts, dm-sender.ts
    region-service.ts, gym-service.ts, geocode.ts, static-maps.ts, image-cache.ts
    ocr/
  db/
    kysely.ts, types.ts (generated), repositories/, migrations/
  events.ts             typed EventEmitter replacing client.emit custom events
  log.ts                pino instance
```

Rules:

- **Domain is independent of Discord.** Commands and components call service methods; they never mutate party state directly. Buttons and slash commands share one code path (replaces reaction-calls-`command.run()`).
- **Rendering is pure:** `renderPartyPost(party, context) → { content, embeds, components }`, snapshot-tested.
- **No side effects on import.** Nothing starts timers, workers or listeners when its module loads; `index.ts` wires everything, so tests construct services with fakes.
- **Typed events** in `events.ts`: `raidCreated`, `raidPokemonSet`, `raidGymSet`, `raidMovesetSet`, `raidRegionChanged`, `trainCreated`, `trainMoved`, `meetupDescriptionSet`, `spawnReported`, `partyJoined`, `gymsReindexed`, `regionsUpdated`.

### 3.1 Discord client

- **Required intents (none privileged):** `Guilds`, `GuildMessages` (message events in party posts, used for deletion-warning activity; content is not needed), `DirectMessages`.
- **Optional privileged intents**, requested only when the matching flag is on:

  | Flag | Intent | Feature | Fallback when off |
  |---|---|---|---|
  | `ocr.passive` | `MessageContent` | OCR on screenshots dropped in region text channels | `/raid screenshot:<attachment>`; an image in a message that @mentions the bot is still delivered and processed |
  | `autoAssignRole` | `GuildMembers` | `guildMemberAdd` auto-role (`/admin self-roles auto-assign`) | Admins use Discord Server Onboarding default roles |

- Privileged intents are a portal toggle for bots in fewer than 100 servers; Discord review applies only at 100+ servers. Each Pine operator runs their own application, so enabling them is normally just the toggle.
- At startup the bot logs in with the intents implied by the flags. If Discord rejects the login for a disallowed intent (close code 4014), it logs which flag needs the portal toggle, drops that intent, disables the feature and logs in again.
- Nothing else may assume member caching or message content: the invoking member comes with each interaction, and other members are fetched individually by ID over REST (allowed without `GuildMembers`), with a short-lived cache.
- `GuildPresences` and `GuildMessageReactions` are dropped.
- No partials required except `Channel` for DMs.
- Future option, outside this migration: Discord Server Onboarding could also replace `/iam` self-roles.
- `deploy.ts` registers commands from the same `data` builders the router uses, so definitions cannot drift.

### 3.2 Router and guards

- Slash commands keyed by name (and subcommand group/subcommand). Components keyed by the custom-ID prefix.
- Custom-ID format: `<kind>:<id>:<action>[:<arg>]`, at most 100 characters, e.g. `p:7f3c…:join`, `p:7f3c…:group:B`, `dm:stop:pokemon:150`. Decoding is centralised in `custom-id.ts` with tests.
- Guards return either pass or a `UserError` message. `isManagement` keeps today's rule (roles named `admin`/`moderator`, or owner); `isBotManagement` adds `bot developer`.
- The bot-channel restriction is **removed** for commands whose replies are ephemeral (personal settings, notifications, friend codes, `/iam`). It stays where the output is public and noisy (e.g. gym admin commands keep "bot channel or region channel").

## 4. Interaction design

### 4.1 Party post controls

Starter message of each forum post, and every mirror message, carry the same components:

- Row 1 (buttons): Interested · Join · Here · Done · Leave
- Row 2 (buttons): −1 · +1 · Remote/Local toggle (toggle omitted on elite raids)
- Row 3 (string select, only when the party has more than one group): choose group A–E
- Row 4 (trains only; buttons): Next · Previous · Skip · Finish (conductor-only when a conductor is set)

Clicking:

1. Calls the matching `PartyService` method.
2. Replies ephemerally to the clicker (e.g. "You're coming with +2 in group B").
3. Schedules a re-render of the post and mirrors.
4. Posts a short public line in the post ("Alice joined (+2)"), preserving the activity feed and bumping forum sort order.
5. Emits `partyJoined` for the access service when relevant.

Counts keep today's semantics: +1 when not yet interested first marks interested; −1 never drops below 1.

"Have you completed this raid?" becomes a message in the post mentioning present attendees with **Yes** / **Not yet** buttons. Attendees stay `COMPLETE_PENDING` and auto-complete after `raidCompleteTimeout`, as today; because state is in the custom ID and the Party row, it survives restarts.

**As built (Phase 2D-1, 2026-10-11)**, where it differs from 4.1 above and from the rows `join … remote` and `group, new, label` of 4.2:

- Row 3 is a button per group (`Group A (3)`, `B: park side (4)`), not a string select: a select keeps showing each member their last choice, also one that was refused. No control depends on the time; Done on an egg is refused when pressed.
- Custom ids are `party:<party id>:<action>[:<arg>]`; the party is found by that id, so mirrors (plan 2E) can carry the same controls.
- A click is answered privately with how the member stands (`You are coming with 2 more, in group B.`) and said in the post in one line that pings nobody; lines are gathered (the first at once, then at most every two seconds, one line per member in a batch). Nothing is emitted yet for the access service (`partyJoined` comes with plan 2E).
- `count` is the whole head count, the member included (1 to 1 + `maximumAdditionalAttendees`); there is no `+N` form. Join with several groups does not ask: the member lands in the newest group and the group buttons move them.
- A member who is done cannot change count, remote or group; they come back with Join or Here.
- The completion question pings the members asked whose settings allow mentions; its message is deleted once nobody is left to answer. The timeout after which no answer counts as yes is the scheduler's (plan 2D-2).
- Team emoji and the order by team and name are back without a privileged intent: the display name and the team role are read from each interaction and stored with the attendee.
- Members are named by that stored display name (Matt, 2026-10-12, after the staging run): a mention in a message that pings nobody reads "@unknown-user" in a client that has not loaded the member. A sentence in a post names a member as the name in bold with the mention after it; the embed (the trainer lists, who reported or made the party, the conductor) shows the name alone; a member without a stored name is a mention. The name of the member who made a party is kept with the party, so it is known also when they are not signed up.
- Controls are throttled per member (30 a minute), as is each of these commands.

### 4.2 Command mapping

Gym, Pokémon, moveset, saved-route and role options use **autocomplete**.

| Legacy (aliases omitted) | New | Notes |
|---|---|---|
| join, maybe, here, not-here, leave, done, local, remote | `/join [count] [group]`, `/maybe [count] [group]`, `/here [count] [group]`, `/not-here`, `/leave`, `/done`, `/local [count] [group]`, `/remote [count] [group]` | In a party post. Same as the buttons, plus count/group options. |
| meet, cancel-meet | `/meet time`, `/cancel-meet` | DMs same-group attendees via `DmSender`. |
| group, new, label | `/group join letter`, `/group new`, `/group label text` | Raids and trains. |
| status | `/status` | In a post: re-posts the status at the bottom of the post. In a region text channel: ephemeral list of active parties (same data as the summary post). |
| where | `/where` | Maps link plus attached static map image. |
| shout | `/shout message` | Party posts only (fixes legacy bug); keeps 3 per 180 s per user throttle. |
| delete | `/delete` | Management: archive and lock after 15 s. Others: modal for the reason, pings `@admin`/`@moderator` in the post. |
| raid | `/raid boss gym [time] [screenshot]` | See 4.3. Throttle 20 per 900 s per user. |
| hatch, left, duration, boss, gym, moveset | `/hatch time`, `/end time`, `/duration minutes`, `/boss pokemon`, `/gym gym`, `/moveset quick charge` | Moveset options autocomplete from the current boss's moves. |
| auto, privacy | `/settings auto-status`, `/settings privacy` | Ephemeral, any channel. |
| request | `/request reason` | GitHub issue via `GITHUB_TOKEN`; throttle 3 per 1800 s. |
| train, name, route*, conductor, not-conductor, next, previous, skip, train-finished, save-route, use-route | `/train name`, `/name`, `/route show\|add gym\|remove stop\|move from to\|clear\|save name\|load route`, `/conductor set\|clear`, `/next`, `/previous`, `/skip`, `/finish` | `route remove`/`move` take stop numbers with autocomplete listing the route; `route load` autocompletes saved routes. `route clear` keeps bot-management guard. |
| meetup, info | `/meetup name`, `/info` | `/info` opens a modal (paragraph input). |
| iam, iamnot | `/iam [role]`, `/iamnot [role]` | No argument → ephemeral multi-select of self-assignable roles (paged with buttons if more than 25). |
| want, unwant, wants, unwant-all, target, untarget, targets, untarget-all | same names | Ephemeral, any channel. `/want target type`, where `target` autocompletes **any** Pokémon in the game master (no whitelist; current raid bosses ranked first), raid tiers (including shadow tiers) and the perfect/zero IV spawn targets; `/target [gym]` defaults to the current raid's gym, confirmation via buttons. |
| mentions, mentions-groups, mentions-shouts, mentions-train-stops, boss-set-notification, new-train-notification | `/settings mentions\|mentions-groups\|mentions-shouts\|mentions-train-stops\|boss-set\|new-train enabled` | Ephemeral. |
| register-friend-code, friend-code, register-nickname, find-nickname | `/friend-code register code`, `/friend-code show member`, `/nickname register name`, `/nickname find name` | |
| spawn, wild | `/spawn pokemon details` | `pokemon` autocompletes **any** Pokémon (no whitelist; the legacy "rare" tier-7 list is no longer needed). Region text channel; unown handling as today (the bot pins its own unown announcement). Throttle 15 per 900 s. Legacy auto-pinning of *user* messages that mention @unown is kept only if phase 4 confirms mention data arrives without Message Content; otherwise it is dropped. |
| rank (great/ultra/master/little, -evo) | `/rank league pokemon atk def sta [evolutions]` | Local maths; pvpivs.com deep link (see 6.3). PvP category or DM. |
| counters | `/counters [boss] [tier] [level] [weather] [friendship] [flags]` | Defaults from the current raid when run in a post. Works in DMs. |
| boss-tier, find, maps, help | `/boss-tier pokemon`, `/find-region location`, `/maps`, `/help [command]` | `/find-region` and `/maps` registered only when their settings exist. |
| asar, rsar, lsar, aar | `/admin self-roles add\|remove\|list\|auto-assign` | `add` uses a modal for name, aliases and description. |
| raid-boss, raid-bosses, populate-raid-bosses, auto-set, mark-shiny, mark-not-shiny, rare, add-pokemon-nickname | `/admin boss list\|add\|hide\|clear-override\|autoset\|shiny\|nickname\|sync` | Bosses come from the live feed (6.7); these commands manage overrides. `list` shows feed and override sources and the last sync time; `sync` refreshes now. `populate` is dropped (it seeded from `pokemon.json`), and so is `rare`: `/want` and `/spawn` accept any Pokémon. |
| view-member-settings, save-party | `/admin member-settings member`, `/admin save-party` | |
| create-gym, edit-gym, delete-gym, find-gym, gym-detail, geocode, gym-places, gym-queue, import-gyms, export-tsvs | `/gym create\|edit\|delete\|find\|detail\|geocode\|places\|queue\|import\|export` | `create`/`edit` use modals (one field group per modal; at most 5 inputs each); delete confirms with buttons. Nearby-duplicate warning kept. |
| import, setbounds, bounds, clear-image-cache | `/region import kml`, `/region set-bounds kml`, `/region bounds`, `/region clear-image-cache` | KML via attachment option. |
| require-role, add-role, remove-role, show-role-authorization(s) | removed | Native command permissions; see 5.4 for the export script. |
| silph-card, register-silph, howmany | removed | |
| (new) | `/admin setup-forums`, `/admin cleanup-legacy` | Cutover tooling (section 5.5). |

All admin commands set `default_member_permissions` (Manage Server for `/admin`, `/gym`, `/region`) and also apply the `isBotManagement` guard.

Responses: validation and guard failures are ephemeral; the 👍/👎 reactions on user messages are gone, and so is `Utility.cleanConversation` (slash invocations leave no user message to clean up).

`/help` is generated from the command definitions: an ephemeral overview grouped by category (ordered by `settings.helpGroups`), and `/help command` for details. Each command module exports `help: { details, examples }` alongside its builder.

### 4.3 `/raid` and fuzzy gym lookup

Autocomplete is computed per keystroke, so the number of gyms is not limited by Discord:

- The autocomplete handler runs the gym search on the partial input, scoped to the channel's region and its neighbours (as `local` + `neighboring` today), falling back to the master index outside region channels. It returns up to 25 choices within Discord's 3-second window.
- Choice name: `Gym name · nickname · region` (truncated to 100 characters). Choice value: `g:<gymId>`.
- On submit, a `g:<id>` value is used directly. Any other value is free text: run the best-match search exactly as the legacy `gym` type does; if the top results are too close to call, reply with an ephemeral select menu of the top matches.
- If the gym lies in an adjacent region, ask with ephemeral Confirm / Cancel buttons (replaces the Commando yes/no collector).
- A gym that already has an active raid is rejected with a link to the existing post (legacy behaviour; the reporter's auto-status is applied to the existing raid).
- `time` is optional free text parsed by the ported time parser (hatch vs. end inferred as today). If omitted, the post shows "Set time" buttons that open a modal.
- `boss` autocomplete lists the current raid bosses and eggs from the live boss list (section 6.7), current bosses first: "Yveltal (T5)", "Shadow Landorus (Shadow T5)", "Tier 5 egg", "Shadow T5 egg", "Mega egg", …. Free text falls back to fuzzy search over all Pokémon, as the `raidpokemon` type does today, so an unlisted boss can still be reported.

## 5. Party lifecycle on forums

**As built (Phase 1C, 2026-10-10)**, the search this section relies on:

- Gyms: one lenient MiniSearch index over all gyms in memory (`ctx.gyms`), not a copy of the legacy search. A search returns matches of the text as typed first (a word may be the beginning of a longer one), then matches that needed a misspelling corrected (`corrected`), and only when no gym has every word, gyms with some of them (`allWords: false`, a guess). From a region channel the region's own gyms come before gyms just outside it (inside the outline enlarged by half), and gyms further away are not found; from any other channel all gyms are searched.
- Pokémon: `ctx.pokemon.exact(text)` gives the one entry a text names outright; `search(text)` gives a list, best first, with a second and more forgiving try when the first finds nothing. Tiers, eggs, shadow and boss CP are not Pokémon search terms; they come from the boss list.
- Status words, privacy words and moves use a small strict matcher, because a wrong guess there acts.
- Which gyms lie in which region is worked out in memory and agrees with MySQL's `ST_Contains` (pinned by a database test).
- Dependencies (6.8): `minisearch` and `fastest-levenshtein` were added. `@mapbox/polyline` was replaced by a small encoder, and `@turf/turf` is not needed until Phase 5 or 6. Pokémon icons are not cached here: Phase 2 takes their address from the raid boss feed.
- Static maps (6.3): `ImageCache` names a picture by a hash of the request without the API key, so a moved gym or redrawn region gets a new picture by itself.

### 5.1 Layout

- Each region keeps its text channel (chat, screenshot drops, `/spawn`, `/status` list). A sibling **forum** `<region>-raids` in the same category, inheriting the category's permissions, holds the posts. `Region.forumChannelId` links them.
- One post per party. Title set at creation (`Mewtwo · Big Fountain`, `Egg T5 · Big Fountain`, `Train · <name>`, `Meetup · <name>`) and changed only when the boss or gym changes (thread renames share the 2-per-10-minutes limit; changes are coalesced and the latest wins).
- Forum tags show state: `Egg`, `Hatched`, `Ended`, `T1`, `T3`, `T5`, `Mega`, `Elite`, `EX`, `Shadow`, `Train`, `Meetup` (at most 5 applied per post). `/admin setup-forums` creates any missing tags.
- The forum's one allowed pinned post is **Active raids**: parties sorted by end time with links, maintained by `SummaryService`.
- When a party is created, a one-line link is posted in the region text channel ("New T5 raid at Big Fountain → post"). It is deleted when the party ends.

**As built (Phase 2C, 2026-10-11)**, where it differs from 5.1 above and from 4.3:

- The post's title names the egg or the raid as well as the boss and the gym (`T5 egg · Big Fountain`, `T5 raid · …`, `Yveltal · …`), so it also changes when an egg without a boss hatches; renames are limited to two in ten minutes by the bot itself and the newest title is applied later.
- Mega legendary and super mega raids carry the `Mega` tag. Tags are moderated: members cannot apply them.
- Times are Discord timestamps; attendees are mentions in sign-up order (team emoji come with plan 2D); a list that does not fit is cut with a count.
- `/raid`: a typed boss that is not on the current list needs its tier first; the "Set time" buttons and the screenshot option come later (2D, Phase 7).
- Rate limits (section 7) are left to discord.js except one: a long wait on `PATCH /channels/:id` (the rename limit) is rejected and retried by the bot, because discord.js would hold every later change of that post behind it.
- Boss pictures come from the boss feed's own address, stored with the boss.

### 5.2 Create, update, end

- `PartyService.create` (used by `/raid`, OCR, `/train`, `/meetup`):
  1. Resolve the region from the gym's location (raids) or the invoking channel (trains, meetups).
  2. Take a per-gym lock (as today) to prevent duplicate raids.
  3. Insert the `Party` row.
  4. Create the forum post whose starter message is `renderPartyPost`.
  5. Apply tags, post the region link line, emit `raidCreated`/`trainCreated`.
  6. Mirrors subscribe to the event and post their copies (EX: gym tagged/confirmed EX and raid not EX; remote: non-elite), recording message IDs on the party.
- Every state change persists the row, then schedules a render. Renders are coalesced per party (at most one edit every ~2 s) and update the starter message, mirrors and tags. Summary updates are coalesced per forum the same way.
- Gym change to a different region (`/gym`): move by creating a new post in the new region's forum with the current state, archiving the old one with a "moved to → post" line, and emitting `raidRegionChanged`.
- **End:** when the scheduler reaches the deletion time, the post is **archived and locked**, the `Ended` tag applied, mirror messages and the region link line deleted, and the row marked `ended`. `/admin save-party` sets `saved = true`, which exempts the party from automatic ending. Optional setting `archiveRetentionDays` (default `null` = keep forever) lets a sweep delete archived posts older than N days.

### 5.3 Scheduler

A single tick every `cleanupInterval` (60 s) keeps the legacy rules:

- Refresh at hatch and at day rollover; switch tags `Egg` → `Hatched`.
- For each group's start time: after it passes, set the start-clear time (+`startClearTime`); after that, clear it and send the completion prompt for present attendees.
- When end time (or last possible time) + `deletionGraceTime` passes, set the deletion time (+10 min raids, +60 min trains and meetups; from settings) and post a warning in the post. Activity in the post re-posts the warning at most every 5th message, as today.
- At the deletion time, end the party (5.2).

On startup the scheduler runs a catch-up tick immediately, applying every transition whose time has passed while the bot was down. Trains and meetups persist `lastPossibleTime`, fixing the legacy bug.

**As built (Phase 2D-2, 2026-10-11)**, where it differs from 5.2 and 5.3 above and from the rows `meet, cancel-meet` and `hatch … moveset` of 4.2:

- The scheduler is `PartyScheduler` over the pure `partyTick`: effects are done at most once (the party is stored first), the ending repeats until it is stored and is decided again inside the store, so a corrected time that arrives at that moment wins. At start it waits for the connection to Discord and, up to fifteen seconds, for the raid events; its first tick shows every post anew.
- Ending: the party leaves the store first; then the link line, open questions and the warning are deleted, the post is shown once more without its controls, and it is archived and locked. A sweep at start and hourly archives open posts of ended parties (and only those). The `Ended` tag is applied when the raid ends by the clock, some fifteen minutes before the archiving.
- The warning is one message, said again at the bottom after every fifth message of others in the post (the earlier one is deleted); a corrected time takes it away.
- The raid command for another gym is `/location gym` (`/gym` is the gym administration); a gym of another region is refused until plan 2E. Anybody in the post may correct a raid; each change is said in the post with the member's name. A change that would make two raids of one kind block one gym is refused.
- A meeting time follows corrected raid times (it moves with the hatch time it was set to, or is cancelled when it no longer fits) and is announced in the post, pinging the group's members who allow it; DMs come with Phase 4. The clock does not ask the group of an egg.
- "Set time" is one button on a post without times; its form asks an egg when it hatches and a hatched raid when it ends.
- A member who pressed Done by mistake takes the question back by going back; private answers to a burst of clicks are one answer at the start and one at the end.
- A boss with only one fast or one charged move has it set.

**As built (Phase 2E-1, 2026-10-11)**, where it differs from 5.2 above and from the rows `status`, `where`, `shout`, `delete` and `save-party` of 4.2:

- Mirrors are copies of the post's message with the post's own buttons and a line that links to the post, in the channels named by `settings.channels` (`remote-raids`: every raid but an elite one; `ex-gym-raids`: a raid, not itself EX, at a tagged or confirmed EX gym), where the bot may post. They are made by the first render of a raid, not by an event; a raid that is over by the clock loses them at once; the copies in these shared channels are edited at most every ten seconds per raid. `mirrorMessages` has a third kind, `status`: the copy `/status` puts at the bottom of the post.
- The link line in the region's channel follows the post's title.
- `/status` in a region channel, and `/where`, answer privately. `/shout` lists only the members it pings.
- `/delete` from staff (admins, moderators, the owner) closes the raid at once: the post says who closed it and is archived and locked. From anybody else it opens a form; the reason is put into the post, one request per member and raid, and the admin and moderator roles are pinged once per raid.
- `/admin save-party` has an option `keep`; `keep:False` gives the post back to the clock. A kept post says so.
- A command may decide per use whether it is acknowledged first; the `group` options autocomplete the groups a raid has.
- Access for members of other regions (5.4) and moving a raid to another region came with plan 2E-2: see below and after 5.4.

**As built (Phase 2E-2, 2026-10-11)**, where it differs from "Gym change to a different region" in 5.2:

- A raid that moves to a gym of another region of the same server becomes a new party with a new id and a post in that region's forum; the old party ends through the usual end (its post says where the raid went, pings those who are signed up and allow it, and is archived and locked; link line and copies go). Members, groups, meeting times, times, boss, moves and `saved` are carried over; open completion questions and the archive warning are not (who was asked is present again; the clock warns anew in the new post). No event is emitted: access follows from the party store (5.4), notifications come with Phase 4.
- The new party is stored and gets its post before the old one ends, so a failure leaves the raid where it was; a raid that ended meanwhile is not revived.
- The command is `/location` (not `/gym`); it asks before such a move, which has no limit of its own. A gym in no region of the server that has a forum is refused.

**As built (Phase 3A, 2026-10-11)**, meetups; where it differs from the row `meetup, info` and the rows of the shared commands in 4.2, and from 5.1 to 5.3:

- Phase 3 is two plans: 3A (party kinds and meetups) and 3B (trains). A party is a raid or a meetup; a meetup has one start for the whole party (`/meet`, `/cancel-meet`) and an end (`/end time`, `time:none` removes it), a name (`/name`) and information (`/info`, a form with one paragraph field of at most 1,000 characters, shown in the embed's description).
- A meetup has one group and no completion: `/group` is refused, Done means leave, its post has the buttons Interested, Join, Here, Leave, −1, +1 and the remote toggle. Its maker is signed up as interested and always named.
- Times typed for a meetup are not read as the legacy bot read them: never into the past, on the day of the start or end while that day has not passed, an hour from 1 to 6 without am or pm as the afternoon for a start, an end on the next day only within twelve hours of the start. A bare number is an hour; minutes need `in`.
- `lastPossibleTime` of a meetup is its end; without one, a day after its start; without either, a day after it was made or its last time was removed. The post of a meetup without a time says when it will be archived, and the first warning of a meetup without an end pings its maker. The warning comes `trainOrMeetupDeletionWarningTime` before the archiving.
- `/meetup name` works wherever a region is known and is refused in a party's post; the post is titled `Meetup · <name>`, the link line is "New meetup: #post", the region's list has a section for meetups. No copies in the remote and EX channels; nothing is emitted for notifications yet (Phase 4).
- A new start is announced in the post, pinging who is signed up and allows it, once per burst of changes; `/meet` in a meetup is limited to 3 per 180 seconds.

**As built (Phase 3B, 2026-10-12)**, raid trains; where it differs from row 4 of 4.1, the row `train …` of 4.2, and from 5.1 to 5.3:

- A train is `/train name` (not a subcommand `name`); `/name` renames it. It has groups like a raid, one start for the whole party like a meetup, no completion (Done means leave) and no Done or "Set time" button. Its times, fallback day and archiving are a meetup's; the first warning of a train without an end time pings its conductor, or its maker when there is none.
- Row 4 of the post is not four movement buttons but one grey button "Move train…" (Matt, 2026-10-11): it answers privately with a panel that shows where the train is and what comes next, with Next · Previous · Skip · Finish (the impossible ones disabled). A press updates the panel; each button carries the stop it was drawn at and, for Next and Skip, the stop it leads to, so a press on a stale panel moves nothing.
- The route is a list of gyms, none twice, at most 50; the current stop follows its gym through every edit (the legacy bot never adjusted its index). `/route remove stop` and `/route move from to` take stop numbers (`to` is the position afterwards); a gym of another region of the server is added without a question, a gym of no region of the server is refused. Editing is for who is signed up and for staff; `/route clear` for bot management and the conductor. An edit that changes where the train is (the current stop removed, a stop added to a finished route, a loaded route) is a movement and needs the right to move; the first stop of an empty route is not.
- The conductor is stored by member id and must be signed up; anybody signed up may take over, the conductor and staff may clear, and leaving in any way frees the role. With a conductor only they and staff move the train; staff always may.
- Next from the last stop finishes the route; Skip needs a stop after the next; all moves are refused on an empty route. A move to a gym puts Here back to Coming (count, group and remote kept); finishing does not, and it ends nothing. The announcement is one message with pings for who allows `mentions` and `mentionsTrainStops`, gathered for five seconds and worded by where the train then is; earlier announcements stay in the post.
- `/boss` in a train names the Pokémon it is after (any the game master knows, a typed tier ignored, `none` clears): picture, weaknesses and catch CP in the post. `/where` gives the current stop.
- Saved routes stay in the legacy table `SavedRoutes` (per member and region): the same name replaces, at most 25, `/route load` leaves out gyms that are gone and starts at the first stop, and `/route forget route` is new.
- The post is titled `Train · <name>`, the link line is "New train: #post", the region's list has a section for trains. No copies in the remote and EX channels.

**As built (Phase 3C, 2026-10-12)**, two things Matt asked for after 3B:

- A train has a copy of its message (5.2) in the text channel of every other region of its server that a gym of its route lies in (mirror kind `region`, one copy per channel): the post's embed and buttons without "Move train…", under a line that says it stops in this region. Signing up there lets a member of another region into the forum (5.4). The copies follow the route and are deleted when the train ends; a region channel where the bot may not post embeds gets none.
- A copy in a shared channel (also a raid's in the remote and EX channels) whose edit or send failed is tried again ten minutes later without a change of the party.
- A train remembers the gym it was at when a move finished its route (`train.finishedFrom`): Previous from the end leads back there, leaving who is Here as Here, and to the last stop when nothing is remembered. The panel's Previous button carries where it leads.

**As built (Phase 4A, 2026-10-12)**, what a member sets for themself; where it differs from the rows `auto, privacy`, `want …`, `mentions …` and `register-friend-code …` of 4.2 and from 6.6:

- `/settings` has `show` beside the eight switches; `/friend-code` and `/nickname` each have `remove`. `/friend-code show` and `/nickname find` answer only about members of the server they are used in, and `find` names every such member with that name.
- A want is per member and server, and there is no limit on their number. Beside a species (every form), a tier and the two IV targets it can be for one form of a Pokémon (`PokemonNotification.form`, a catalogue key) or for its shadow raids only (`shadow`); megas and shadow wants are raids only. Both columns are new and additive; existing rows mean what they meant.
- `/want target [type]`: `target` autocompletes tiers, IV targets, current bosses and any Pokémon, with "X (every form)" beside the forms of a species that has several; typed text acts only when it names something in full and is otherwise refused with suggestions.
- `/target` asks no confirmation: a picked choice or a clear hit acts, an unclear text offers a menu. Without a gym, in a raid's or a train's post, it takes that gym.
- The answers already promise the DMs; sending them is plan 4B. The auto-assigned role of the phase table is not built (Matt, 2026-10-12), and `/spawn` will be `/wild`.

**As built (Phase 4B, 2026-10-13)**, delivery; where it differs from 6.4 and from the rows `meet` and `spawn` of 4.2:

- `DmSender` is a queue pulled by a timer: one send started every 100 ms at most, five on their way at most, three priorities (meeting times and boss-set; spawns; raid wants, gym targets, new trains), no retry of its own, an expiry per message, a pause of a minute when Discord refuses to open more DM channels. Its numbers are logged per burst.
- `NotifyService` is called explicitly by the party services with whoever acted (`PartyNotifier`), not through typed events. It remembers per party what it told whom: a member gets one DM per event, only for reasons not yet told, and never for what they did themselves. Recipients are asked for in batches through the gateway's request for members by user id (REST as the fallback); production has no privileged intents.
- An EX raid is announced like any other. A boss-set member is told every boss that differs from the last one they were told. New-train is per server (table `NewTrainNotification`).
- The button is one per reason, `dm:<server>:stop:<what>`, and removes that want or gym target or switches the setting off.
- The meeting-time DM also goes for a cancelled time and for the start of a meetup or train, gathered for a few seconds, and is sent also where notifications are switched off.
- The spawn report is `/wild pokemon [details] [iv]`; its message in the region channel is deleted after 30 minutes. Unown is an ordinary species: its report is also posted in the sightings channel where there is one; no role is assigned or pinged, nothing is pinned, and holders of the old role are given an Unown want once (table `UnownWantGift`).
- Every Pokémon has a picture: the list of the game's icon files is downloaded with the game data (`settings.gameData.iconsUrl`); the feed's picture of a current boss wins.

**As built (Phase 4C, 2026-10-13)**, self-assigned roles; where it differs from the rows `iam` and `asar` of 4.2:

- `/iam role` and `/iamnot role` by name or alias; `/iam` alone shows menus, one per group of roles (a pick-one group with "None", any other as a multi-select with the member's roles ticked), split into ranges and pages where a server has many.
- A row of the legacy `Role` table carries the id of its Discord role (new column), so a renamed role keeps working; groups are a new table. The auto-assigned role is not built.
- `/admin self-roles add|remove|list|group|ungroup`. A role cannot be listed, or given, when it is `@everyone`, managed, at or above the bot's highest role, or adds a permission of moderation to what `@everyone` has; staff can list only what they could give by hand.
- The bot writes one role per request and never a member's role list, re-checks every step when it is sent, and tells the member exactly what was given, taken, refused and not tried.

**As built (Phase 5A, 2026-10-13)**, gym administration; where it differs from row 204 of 4.2:

- `/gym add location name`, `edit gym` (one pre-filled form: name, nickname, description, notice, keywords), `move gym location`, `elite gym eligible`, `delete gym`, `show gym` (the spec's `find` and `detail`), `refresh gym` (the spec's `geocode` and `places`), `export` (one TSV: name, longitude, latitude); `/admin clear-image-cache`. `import` and `queue` are not built. Shown by Discord to members with Manage Server, checked by the bot's own staff rule, tied to no channel, answered privately; its autocomplete is guarded the same way.
- A location is coordinates or a maps link, above all the link Pokémon GO shares for a gym. `add` asks before it stores (Add, Add with details…, Cancel; "Add anyway" beside another gym); `move` is never refused for a raid or a train at the gym and asks first for more than 500 metres; `delete` is refused while a raid is active there, asks with what goes with the gym, and removes it from saved routes, gym targets and the routes of active trains.
- No server's staff administer a gym or a place that lies only in another server's regions.
- EX gyms are elite raid gyms everywhere a reader sees them; the channel setting is `channels['elite-gym-raids']`. The stored names are unchanged.
- Google is called with `fetch` (Geocoding API, Places API (New)); no client library. Without a key gyms are saved without address and places.

### 5.4 Access for cross-region joiners

When a member joins (any status) via a mirror and lacks View Channel on the region forum, `AccessService` adds a member overwrite (View Channel, Send Messages in Threads, Read Message History) on that forum and records it in `PartyAccessGrant`. The grant is removed when the member leaves or completes and has no other active party in that region, and by a daily sweep. Overwrites on the forum never touch the region text channel.

**As built (Phase 2E-2, 2026-10-11)**, where it differs from 5.4 above:

- Not only joining through a mirror: `AccessService` listens to the party store, so anybody who comes to take part in a party of a forum they cannot see is let in (a button on a copy, `/raid` used in another region's channel, a raid that moved). "Takes part" is signed up in any status, also done: a guest keeps the forum in sight until they leave or the raid ends or moves (Matt, 2026-10-11; 5.4 above had Done take the access back).
- A member is not let in when the forum has a permission overwrite for them in particular, or one that denies the view to a role they hold: somebody keeps them out on purpose. A member whose role may not write in the forum is let in to read only.
- The record is written before the overwrite is made. Only an overwrite that is still exactly what the bot made is removed; one a moderator changed since is left, and the record dropped.
- The sweep runs at start and hourly with the forums' upkeep, not daily; besides taking back what nothing calls for, it lets a member in again whose record has no overwrite. A forum that refuses the bot (no Manage Permissions, or as many overwrites as Discord allows) is left alone for ten minutes.
- `PartyAccessGrant` has the primary key (`forumChannelId`, `memberId`); `guildId` is the row of the server, whose removal takes the grants along.

### 5.5 Persistence

New `Party` table (planners may refine column types):

| Column | Purpose |
|---|---|
| `id` char(36) PK | UUID; used in custom IDs |
| `guildId` FK → Guild | |
| `type` enum(raid, train, meetup) | |
| `regionId` FK → Region | |
| `forumPostId`, `regionLinkMessageId` | Discord IDs |
| `mirrorMessages` JSON | `[{channelId, messageId, kind}]` |
| `gymId` nullable FK → Gym | raids |
| `createdById` | Discord user ID |
| `hatchTime`, `endTime`, `lastPossibleTime`, `deletionTime` | epoch ms, nullable |
| `saved` bool | replaces `deletionTime = -1` |
| `status` enum(active, ended) | |
| `state` JSON | attendees `{memberId: {number, status, group, remote}}`, groups `[{id, label, startTime, startClearTime}]`, boss, moveset, route, conductor, description, name, pending completion prompts |
| `createdAt`, `updatedAt` | |

Index on `(status, deletionTime)` for the scheduler and `(gymId, status)` for duplicate checks. Ended rows replace node-persist `parties/complete` as history. Writes happen on every change; startup loads all `active` rows.

**As built (Phase 2B, 2026-10-11)**, where it differs from the table above:

- `type` and `status` are `varchar(16)`, snowflake columns `varchar(30)`, times `bigint` epoch milliseconds; there is also `forumChannelId`. `regionId` and `gymId` are set to null when the legacy bot deletes the region or gym. `Region.forumChannelId` has a unique key: one forum per region.
- `state` is a versioned document (`v: 1`): `anonymous`, the attendees as a list in the order they signed up (`id`, `number`, `status`, `group`, `remote`, `pendingUntil`), the groups, the default group, and for a raid its tier, boss reference (`{ key }` or `{ name }`), `reportedHatched`, moves, a hand-set duration and the stage the post last showed. Conductor, route, description and name come with Phase 3. Version 2 (plan 2D-1) added an attendee's `name` and `team` and the party's `prompts` (`completion`: ids of the completion questions still open, at most ten; `warning`: the archive warning); a version 1 document is read as one without them. Version 3 (plan 2D-2) added an attendee's `askedBy` and made each completion question a record of its message and the members it asked; a version 2 document is read with questions that asked nobody in particular.
- Version 4 (plan 3A) added the parts `timed` (`name`, `startTime`) and `meetup` (`description`) beside `raid`; a document must have exactly the parts that fit its row's `type`. A row of type `train` is not read until plan 3B.
- Version 5 (plan 3B) added the part `train` (`route`, `stop`, `conductorId`, `boss`); a row of type `train` has `timed` and `train`.
- Version 6 (plan 3C) added `train.finishedFrom` (a gym of the route, only on a finished route); version 5 is read as a train that remembers none. The kinds of `mirrorMessages` (a column of its own, not versioned) gained `region`.
- Version 7 (2026-10-12) added `makerName`, the display name of the member who made the party as the bot last saw it; a document of version 6 is read without one.
- Raid durations are not only the configured ones: a standard raid hatching during a Raid Hour or Raid Day lasts as `settings.raidEvents.hatchedDuration` says; the events come from a feed (`settings.raidEvents.url`) with a weekly Raid Hour as the fallback.
- The scheduler of 5.3 is the pure function `partyTick`; the store that holds the active parties is `PartyStore`.

## 6. Data, configuration, services

### 6.1 Database

- Kysely on mysql2. Kysely's own migration table (`kysely_migration`) tracks the new bot's migrations. Migrations run at startup (single process) and via `npm run migrate`.
- The first Kysely migration is the **baseline**. It inspects the target schema:

  | Schema contains | Baseline does |
  |---|---|
  | `knex_migrations` including `20221014-pokemon-elite.js` | nothing (legacy takeover) |
  | no tables at all | creates the legacy schema (new install) |
  | `knex_migrations` without that row | fails: the legacy bot must finish its migrations first |
  | other tables but no `knex_migrations` | fails: not a Pine database, never touched |

  The new-install DDL is generated from the legacy knex migrations themselves (the same run that produces the test fixture), so new and taken-over databases have identical schemas; a test compares them.
- New migrations: `Region.forumChannelId`, `Region.summaryMessageId`, `Party`, `PartyAccessGrant` (`memberId`, `forumChannelId`, `guildId`, `createdAt`), `RaidBoss` and `RaidBossOverride` (6.7). Phase 8 (after a successful cutover) drops `User.silph`, `CommandRoleAuthorization`, `CommandRoles`; until then they stay so the old bot can run.
- Spatial queries (`ST_CONTAINS`, `ST_PolygonFromText`, `ST_AsText`, `POINT`) live in `RegionRepository` using Kysely's `sql` template. The raw `dbhelper.js` pool is not ported.
- `kysely-codegen` generates `db/types.ts` from the schema; output committed.
- Guild rows are kept in sync on `guildCreate`/`guildDelete` as today.

### 6.2 Configuration

- `data/settings.json` keeps its shape minus `commandPrefix`, `reactionCommands`, `groupReactions`, `features.reactionCommands`; gains `timezone` (IANA zone used by time parsing, which previously relied on the server's local zone), `archiveRetentionDays`, and the optional-intent flags `ocr.passive` and `autoAssignRole` (both default `false`; section 3.1). Validated with zod at startup; invalid config aborts with a clear message.
- Secrets move to environment variables (`.env` for development, not committed): `DISCORD_TOKEN`, `DISCORD_APP_ID`, `OWNER_ID`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_SCHEMA`, `GOOGLE_API_KEY` (optional), `GITHUB_TOKEN` and `GITHUB_REPO` (optional; `/request` disabled without them), `POKEMON_IMAGE_BASE`, `REGION_MAP_LINK` (optional).
- Special channels (`bot-lab`, `mod-bot-lab`, `unown`, `ex-gym-raids`, `remote-raids`, `pvp`, `bot-updates`) and the PvP category are still resolved by name per guild.
- `data/text.json` stays as the user-facing string table.

### 6.3 External services

| Service | Plan |
|---|---|
| PokeMiners game master and English texts | native `fetch`; TTL cache that actually expires; parsing ported with fixture tests (keep the workaround for non-string forms) |
| Google geocoding / Places | `@googlemaps/google-maps-services-js` |
| Google Static Maps | always downloaded through `ImageCache` and attached as files; the API key never appears in Discord content |
| Nominatim | `https://nominatim.openstreetmap.org/search?q=…&format=json` with a descriptive User-Agent, respecting its usage policy |
| Pokebattler | ported; fix the Pokebox ID column bug; failures produce a clear "service unavailable" reply |
| GitHub issues | REST `POST /repos/{GITHUB_REPO}/issues` with a fine-grained token scoped to Issues: write |
| pvpivs.com | `/rank` reply links `https://pvpivs.com/?mon=<name>&cp=<500\|1500\|2500\|10000>&IVs=<a>_<d>_<s>` (parameters taken from the site's own share links; verify during phase 6) |
| Gym data import | raw GitHub URLs as today; branch configurable instead of assuming `master` |

### 6.4 Notifications and DMs

- `NotifyService` subscribes to typed events and keeps today's matching: Pokémon number or negative tier with type raid/spawn/both, favourite gyms, boss-set for egg→boss, new-train opt-in, spawn reports. Recipients must be able to view the region forum; the reporter is excluded.
- `DmSender`: an in-process queue on the main client with concurrency ~5. Logs queue depth and event-to-delivery latency. Error 50007 (cannot DM user) is logged at debug and skipped. Interaction replies do not count against the global rate limit, so DM bursts do not delay party controls. If measured latency proves unacceptable, a second-token sender can implement the same interface (in-process, no worker thread); not built now.
- Each DM includes a link to the post and a **Stop these** button (`dm:stop:<kind>:<key>`) that removes the matching notification.
- `/shout`, new-group and train-movement mentions are @mentions inside the post, filtered by each user's mention settings.

### 6.5 OCR

- Triggers:
  - `/raid screenshot:<attachment>` — always available, no privileged intent.
  - An image attachment (checked by content type) in a message that @mentions the bot in a region text channel — always available, since mentions of the bot are exempt from the Message Content restriction.
  - Any image attachment in a region text channel — only with `ocr.passive` (Message Content intent).
- tesseract.js v5; the same five recognisers (phone time, time remaining, tier, gym name with eng+grc, Pokémon) in a pool created lazily on first use. Trained data stays in `lang-data/`; generated dictionaries go to a cache directory (`var/ocr/`). Debug image dump is off by default (`ocr.debug` setting).
- jimp 1.x for the pixel probes (egg vs. ongoing classification) and cropping.
- Progress: the bot replies "Reading screenshot…" and edits that reply with the result; the source message is deleted on success as today.
- Creation goes through `PartyService.create`, including adjacent-region confirmation.
- Tests run the pipeline on a set of real screenshots kept as fixtures, which **the maintainer will provide** (eggs, hatched bosses, several phone layouts, failure cases).

### 6.6 Game data

Goal: Pine's knowledge of Pokémon comes from the game master, not hand-maintained JSON.

- **Source:** the PokeMiners game master and English text file (6.3). The parsed result is cached to `var/game-data-cache.json`, so startup still works when the download fails. It is refreshed daily, and on `/admin boss sync`.
- **Derived from the game master:**
  - dex number, template ID and forms;
  - English display names (from the text file), including mega, regional and costume forms;
  - types, base stats, fast and charged moves, evolution family;
  - mega and shadow eligibility;
  - the type-effectiveness matrix (replaces `types.json`) and weather boosts (replaces `weather.json`);
  - CP multipliers for `/rank`.
- **Derived names replacing `pokemon.json` fields:**
  - Pokebattler names (`pbName`) are game-master template IDs, e.g. `VENUSAUR_MEGA`.
  - OCR names (`gsName`) are upper-cased display names.
  - Phase 1 runs a parity test against the legacy `pokemon.json`. Any entry where the derived name differs goes into a small explicit exception table in code, with a comment saying why.
- **Kept as curated data:** search nicknames. The ~150 nicknames in `pokemon.json` move once into a committed TS module. Admin-added nicknames stay in `Pokemon.nickname`.
- **Retired:** `data/pokemon.json`, `data/types.json`, `data/weather.json`. `data/counters.json` (Pokebattler option names and aliases, not game data) becomes typed constants in `domain/counters/`. `data/text.json` stays.
- **No magic numbers:**
  - Raid tiers are an enum: `T1`, `T3`, `T5`, `Mega`, `MegaLegendary`, `SuperMega` (added 2026-10-10: tier 7 in the game), `Elite`, `EX`, each with a `shadow` flag where applicable.
  - Pokémon notifications and spawns accept any species in the game master. The legacy column stores a dex number, so a notification matches every form of that species.
  - Notification targets are a union: a Pokémon, a raid tier (shadow or not), or an IV spawn target (`perfect`, `zero`).
  - A codec maps these to and from the legacy integers in `PokemonNotification.pokemon` (dex number, negative tier, `-6`, `-8`). Existing rows keep working and the old bot can still read them. Shadow tiers need new integers outside the legacy range; phase 1 picks them and documents them in the codec.

### 6.7 Raid boss list

Goal: the current raid bosses stay correct without moderator work.

- **Feed (as built in Phase 2C-2, 2026-10-11; it replaced pokemon-go-api's `raidboss.json`, which only repackaged Leek Duck and the game master):** ScrapedDuck's `raids.min.json` (`https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.min.json`), which is Leek Duck's raid boss page as data. An entry has a display name, the page's heading as its tier (`5-Star Raids`, `Mega Raids`), a shiny flag and the address of the boss's picture; shadow raids are a `Shadow ` prefix of the name.
  - Identity: the picture's file name follows the game's asset naming (`pm645.fINCARNATE.icon.png`: Pokédex number and form), which gives the game-master ids; the display name is the second witness. A boss gets a catalogue entry only when the two do not contradict each other; otherwise it is listed by the feed's name without stats. A boss the game master does not know yet keeps the picture's ids, so nothing changes for it when the game master catches up.
  - Headings map to the tier enum in one table in code (the star tiers, Mega, Mega Legendary, Primal, Super Mega, Elite, EX, Ultra Beast; the spellings of the rarer ones are guesses until Leek Duck shows them). An unknown heading is logged once and its bosses are left out.
- **Sync:**
  - Every `raidBosses.refreshMinutes` (default 60), using conditional requests (ETag / Last-Modified).
  - The result replaces the stored feed list in a new `RaidBoss` table: template ID, form, tier, shadow, shiny, English name, first seen, last seen, active.
  - **Safety:** a response that fails validation or contains no bosses is rejected, and the last good list stays. If no sync has succeeded for `raidBosses.staleAfterHours` (default 48), Pine posts one warning to the mod bot channel.
  - Feed entries not yet in the cached game master (a brand-new Pokémon) are kept, using the feed's name.
- **Overrides:** a new `RaidBossOverride` table (template ID, tier, shadow, action `add` / `hide` / `autoset`, optional expiry, creator). Moderators use these for EX raids, early leaks, or feed mistakes. The effective list is the feed list plus `add`, minus `hide`. Expiring overrides let a temporary fix lapse once the feed catches up.
- **Auto-set:** when a tier (including shadow tiers) has exactly one effective boss, eggs of that tier hatch as that boss automatically, as `AutosetPokemon` did. An `autoset` override takes precedence.
- **Shiny:** comes from the feed. `/admin boss shiny` is an override.
- **Legacy tables:** `Pokemon.tier`/`exclusive`/`mega`/`elite`/`shiny` and `AutosetPokemon` hold stale, hand-set data, so the new bot does not read them. They stay untouched for rollback. `Pokemon.nickname` is still read (6.6).
- **Announcements:** when `raidBosses.announceChanges` is on, changes are posted to the `bot-updates` channel ("Raid bosses updated: +Yveltal (T5), −Zekrom (T5)").
- **Settings:** a new `raidBosses` block with `url`, `refreshMinutes`, `staleAfterHours` and `announceChanges`.
- **As built (Phase 1B-2, 2026-10-10)**, where it differs from the text above:
  - Overrides have a fourth action, `shiny` (the `/admin boss shiny` override). `autoset` also makes the Pokémon a boss of its tier, and `hide` beats `add` and `autoset`.
  - There is no `RaidBossSource` interface: with one source, the seam is the pure parser `parseRaidBossFeed` plus `RaidBossService.readFeed`.
  - The feed's level keys include `legendary_mega`, `ultra_beast` (tier 5), `primal` (mega legendary) and `super_mega` (the new `SuperMega` level). Only the levels Pine knows are validated; an unknown key is logged and its bosses left out.
  - After a failed sync the next three attempts come 5 minutes apart, then at the normal interval. Validators (ETag, Last-Modified) are kept in memory only.
  - A species with a named default form is known by that form (`landorus_incarnate`; there is no `landorus` entry): 25 species, with aliases for the bare species id, costumes and appearance-only forms.
  - Posting changes and the stale warning to Discord, and the `/admin boss` commands, are Phase 5; this phase raises the events and logs them.

### 6.8 Dependencies

Remove: `discord.js-commando`, `request`, `request-promise`, `moment`, `lunr`, `string-similarity`, `node-persist`, `node-cleanup`, `node-worker-threads-pool`, `async`, `erlpack`, `zucc`, `polygon-offset`, `cheerio`, `uuid`, `diacritics`, `xmldom`, `@google/maps`, `loglevel`, `loglevel-prefix-persist`, `knex`, `mysql`, `husky`/`lint-staged` (unless configured in phase 0).
Upgrade or replace: `discord.js` 14, `mysql2` + `kysely`, `luxon`, `minisearch`, `fastest-levenshtein`, `@xmldom/xmldom` + `@tmcw/togeojson`, `@turf/turf` 7, `tesseract.js` 5, `jimp` 1, `@mapbox/polyline`, `he`, `async-lock` (or a small in-house keyed mutex), `pino`, `zod`.

Switching lunr to MiniSearch changes fuzzy ranking; search tests (phase 1) pin down expected results for a representative gym and Pokémon set.

## 7. Error handling

- The router wraps every handler. `UserError` → ephemeral reply with its message. Anything else → ephemeral "Something went wrong (ref `abc123`)", logged with the reference, the interaction and the stack.
- Handlers that may exceed ~2 s defer first (`/raid`, OCR, `/counters`, imports, `/find-region`).
- Discord "Unknown Message"/"Unknown Channel"/"Unknown Thread" during renders prune the reference instead of failing; if the forum post itself is gone, the party is ended.
- Rate limits are left to discord.js's REST queue; render and summary coalescing keep edit volume low.
- `unhandledRejection` and `uncaughtException` are logged; the latter exits so a supervisor restarts the bot.
- Graceful shutdown on SIGTERM/SIGINT: stop the scheduler, flush pending renders, drain `DmSender` (≤10 s), destroy the client, close the DB pool.

## 8. Testing

- **Unit (Vitest):** time parsing, party state transitions, scheduler decisions (given a clock), search ranking, game-master parsing, PvP maths, counters option parsing, custom-ID encoding, OCR classification and text post-processing on fixture images. Where behaviour must match the legacy bot, expected values are generated by running the legacy JS functions once and committing the results.
- **Snapshot:** `renderPartyPost` (each party type, egg/hatched/ended, groups, mirrors), `renderSummary`, notification DMs, help output.
- **Repository:** against MySQL 8 in Docker (Testcontainers), loaded with a committed dump of the schema the legacy knex migrations produce, then Kysely migrations applied — exercising the baseline (takeover and new install) and spatial queries.
- **Handler:** fake interaction objects through the router, asserting guard behaviour, replies and service calls.
- **Staging:** a test guild and test bot token; each phase's plan ends with a manual checklist run there.

## 9. Phases

Each phase gets its own implementation plan. Phases 3–7 can proceed in parallel after phase 2.

| # | Phase | Scope | Depends on | Done when |
|---|---|---|---|---|
| 0 | Foundation | Node 24, TypeScript (ES2022, NodeNext, strict), ESLint flat config + Prettier, Vitest, zod config, pino, Kysely + baseline migration (legacy takeover and new install) + codegen, client with flag-driven optional intents and 4014 fallback, router, guards, custom IDs, deploy script, `/help` skeleton, Testcontainers setup | — | Bot logs in on staging with no privileged intents, responds to `/help`, CI runs lint + type-check + tests |
| 1 | Domain ports | game data from the game master with `pokemon.json` parity test and the retirement of `pokemon.json`/`types.json`/`weather.json` (6.6), tier enum and notification-target codec, raid boss feed, sync, `RaidBoss`/`RaidBossOverride` tables (6.7), search (gym/Pokémon/move/status/privacy), time parsing, Region/Gym/User/Pokemon repositories, image cache, static maps | 0 | Domain tests green, including legacy-parity cases; the boss list syncs from the live feed |
| 2 | Raids on forums | Party model + table, `PartyService`, renderer, `/admin setup-forums`, tags, summary, scheduler, buttons and group select, completion prompt, party and raid slash commands (4.2 party/raid rows), mirrors, `AccessService`, `/admin save-party` | 1 | Full raid lifecycle works on staging from `/raid` to archive, surviving a restart mid-raid |
| 3 | Trains and meetups | train/meetup models, routes, conductor controls, saved routes, `/info` modal | 2 | Train and meetup lifecycles work on staging |
| 4 | Notifications and members | `DmSender`, `NotifyService`, want/target commands, `/settings`, friend codes, nicknames, `/iam`/`/iamnot`, auto-assign role behind `autoAssignRole`, `/spawn`, unown handling (incl. verifying whether mention data arrives without Message Content) | 2 | Notifications delivered on staging; latency logged |
| 5 | Admin | `/gym` (modals), `/region` (KML), `/admin boss` (overrides, list, sync; boss-change announcements), `/admin self-roles`, `/admin member-settings`, role-authorization export script | 1 (2 for anything touching parties) | Admin flows work on staging against a copy of production data |
| 6 | Utilities | `/rank`, `/counters`, `/find-region`, `/maps`, `/boss-tier`, `/request` | 1 | Each command verified on staging |
| 7 | OCR | screenshot pipeline: `/raid screenshot`, @mention trigger, passive trigger behind `ocr.passive` | 2 | Fixture suite green; live screenshots create raids on staging via all three triggers |
| 8 | Cutover | see 9.1 | all | Production runs on the new bot; legacy JS removed |
| 9 | Container packaging | see 9.2 | 0–7 (can run alongside 8) | A new install comes up with one `docker compose up`; the image can also run against an existing external database |

### 9.1 Cutover (phase 8)

1. `npm run cutover:check` against a production DB copy: verifies migration state, lists regions needing forums, checks bot permissions in each guild (Manage Channels, Manage Threads, Manage Roles for overwrites), reports which optional intents are configured and whether the portal grants them, and prints the current command role-authorization settings for admins to recreate as native permissions.
2. Rehearse the full cutover on staging with a production DB copy.
3. In a quiet hour: stop the old bot, back up the database.
4. Start the new bot (migrations run), run `/admin setup-forums` in each guild.
5. Import legacy parties from `parties/active`: raids are not imported (they end within the hour; their channels are left unmanaged); active trains and meetups are recreated as forum posts with attendees, groups, route, conductor and times. Each imported party's old channel gets a final "moved to → post" message.
6. Admins recreate command restrictions in Server Settings → Integrations.
7. When moderators are satisfied, `/admin cleanup-legacy` deletes the old party channels.
8. Rollback until step 9: stop the new bot, start the old one; new tables and forums are ignored by it.
9. After a stable period, a final migration drops `User.silph`, `CommandRoleAuthorization`, `CommandRoles`, and the legacy JS tree, `parties/` handling and unused assets are removed from the repo.

### 9.2 Container packaging (phase 9)

Goal: deploying Pine needs only Docker.

- **Image** (`Dockerfile`): multi-stage on `node:24-slim`. The build stage runs `npm ci` and `npm run build`; the runtime stage has production dependencies, `dist/`, `data/` defaults, `lang-data/` (OCR trained data) and `assets/`. Runs as a non-root user, `NODE_ENV=production`, entry `node --enable-source-maps dist/index.js`. Migrations already run at startup, so no separate step.
- **Configuration:** secrets via environment (`env_file: .env`); `data/settings.json` overridable by a bind mount or `SETTINGS_PATH`.
- **State:** a volume for `var/` (image cache, OCR dictionaries and debug output). Nothing else on disk needs persisting, since party state lives in MySQL.
- **One-off commands** run in the same image against compiled output, e.g. `docker compose run --rm pine node dist/discord/deploy-cli.js --global` and `node dist/db/migrate-cli.js`.
- **`compose.yaml`:** services `pine` and `mysql` (`mysql:8.0`, same major version as tests; named volume for data; `utf8mb4` defaults; healthcheck). `pine` waits for `mysql` to be healthy. Because the baseline migration creates the schema on an empty database, a fresh `docker compose up` is a complete new install.
- **Existing databases:** a compose profile (or override file) runs `pine` alone against an external MySQL, for operators taking over a legacy database.
- **Health:** the container exits non-zero on fatal errors so `restart: unless-stopped` recovers it. SIGTERM from `docker stop` triggers the graceful shutdown in section 7, so the stop grace period must cover it (≥15 s).
- **Docs and CI:** the README gains a "Run with Docker" section. CI builds the image, and a smoke job starts the compose stack with a dummy token and checks that migrations ran on the bundled MySQL. A disallowed or invalid token is fine for this check, because migrations run before login.
- **Publishing** the image to a registry is out of scope unless the maintainer asks for it.

## 10. Later work (separate sub-projects, after cutover)

- **Easier onboarding for new servers.** Today a region needs a hand-made KML polygon (`/region import`, `/region set-bounds`) and a gym list. A future sub-project will make this approachable with outside tools, e.g. drawing regions on a web map and exporting them, or a guided setup flow, and will get its own spec.
- **Max Battles** (Dynamax/Gigantamax). They happen at Power Spots, which are temporary and separate from gyms, so they need a model of short-lived locations (reporting a spot, expiry, search over spots rather than the permanent gym index) before they can reuse the party machinery. Keep `Party.gymId` nullable and location handling behind `PartyService` so a later location kind can plug in. Own spec when picked up.
- **Discord Server Onboarding** as a replacement for `/iam` self-roles and the auto-assign role (section 3.1).

## 11. Open items

- OCR fixture screenshots (maintainer).
- Staging guild and test bot token (maintainer).
- Confirm the production host can run Node 24 and Docker is available for repository tests in CI (or tests run against a local MySQL).
