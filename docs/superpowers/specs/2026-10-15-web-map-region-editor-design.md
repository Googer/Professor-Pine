# Pine on the web: a live map and a region editor

Date: 2026-10-15. Status: approved by Matt 2026-10-15. Plans: 8M-1, 8M-2, 8M-3, after 8W-1, in the Wayfarer worktree (branch `wayfarer`), before the cutover.

## 1. Why

Staff define regions today by drawing layers in Google My Maps, exporting KML and running `/region import`. That is a skill few staff have, and a round trip for every change. Matt (2026-10-15) wants a simple page where staff draw and maintain regions directly on a map and save them to Pine, with KML export kept for the Wayfarer scan (spec `2026-10-15-wayfarer-wayspot-import-design.md`), and wants the same page to be Pine's live map: a link anyone can open, where members who log in with Discord see the parties of the whole server and join them.

This supersedes the follow-ups' idea of "a small web interface served by Pine itself, where an admin draws region borders" and replaces `settings.regionMapLink` where the web server is on.

What Matt decided:

- Served by the running bot; reachable by others through a shared link. Exposing it to the internet is the operator's choice (a tunnel, a reverse proxy, a port forward); no UPnP.
- **Exposure is none of Pine's business** (Matt, 2026-10-15): Pine serves plain HTTP on `listen`:`port` and knows only `publicUrl`; TLS, the certificate and the way in belong to a separate process. Recommended: **Cloudflare Tunnel** (`cloudflared` as its own service or container; outbound only, no open ports, the home address hidden, a trusted certificate at Cloudflare; free). Pittsburgh's address is `profpine.com` (registered by Matt at Cloudflare, so its DNS is there already), e.g. `https://map.profpine.com`. In Docker the tunnel reaches Pine over the compose network (`listen: 0.0.0.0`, the port not published to the host) or shares its network (`network_mode: service:pine`); the tunnel's token is an environment variable, never a file in the repository. Documented alternatives: Tailscale Funnel (no domain needed, a `*.ts.net` address) and Caddy with a port forward (a public IPv4 needed; opens a port). With `trustProxy`, the forwarded client address (`CF-Connecting-IP` or `X-Forwarded-For`) is read only from a loopback or private peer. Cutover tooling (the Docker plan) owns the compose file and the recipe; 8M-1 owns the settings.
- Login with Discord (OAuth2), and links from the bot that log in by themselves. What a member may do is decided by their roles in the server, as on Discord.
- Leaflet with OpenStreetMap tiles by default; Google's tiles through the official Map Tiles API when a browser key is set.
- The public map shows regions and gyms to everybody, and the parties of the whole server to a logged-in member of it, who may also join them. The map does not follow the regions a member picked on Discord (browsing every region is the point; Matt, 2026-10-15); joining a party whose forum the member cannot see lets them into that forum as signing up on a copy does today.
- Everything in this spec comes before the cutover, after 8W-1.

## 2. Architecture

### 2.1 The server

- One HTTP server in the bot process, in `src/web/`. `src/app.ts` starts it after the connection to Discord and stops it first at shutdown. A port it cannot take is logged; the bot runs on without it.
- Off unless `settings.web` is set:
  - `port`;
  - `listen` (default `127.0.0.1`; `0.0.0.0` in a container);
  - `publicUrl`, the address every link points at. It must be `https://` unless it is localhost: the server refuses to start otherwise, because its cookie is `Secure`;
  - `trustProxy` (default false): read the client's address from `X-Forwarded-For` only when set;
  - `tiles`: `osm` (default) or `google`.
- Secrets in `.env`, never in settings: `DISCORD_CLIENT_SECRET` (OAuth), `GOOGLE_MAPS_BROWSER_KEY` (only for `tiles: google`; a key separate from the server's, restricted by HTTP referrer to `publicUrl` and to the Map Tiles API). Blank is unset.
- Fastify with `@fastify/cookie` and `@fastify/static` (new dependencies; installing them needs Matt's go-ahead at the start of 8M-1).
- One instance serves several Discord servers: every address carries the server, `/s/<guild id>/…`. A server the bot is not in answers 404; a server without regions yet has an empty map and an editor to draw its first ones.

### 2.2 The pages

- TypeScript in `src/web/client/`, bundled by esbuild (added by 8W-1 for its userscript, or by whichever plan comes first) with Leaflet and Leaflet-Geoman (free edition, MIT) to `dist/web/`, served by Pine. No CDN.
- Pure domain code the server already uses runs in the page too where it is the same rule (`outline.ts`, `kml.ts`, the region-membership test): the domain is pure, so it bundles.
- Content Security Policy: scripts and styles from Pine alone, no inline script; images from Pine, the tile hosts, and the picture hosts posts already use (Leek Duck's CDN, the raid-egg address); connections to Pine and, with Google tiles, the Map Tiles API. Frames refused, `nosniff`.

### 2.3 Tiles

- `osm`: OpenStreetMap's standard tiles with their attribution. OSM's tile policy allows light use; the setting exists so that a busier instance can switch.
- `google`: Google's roadmap, satellite and hybrid tiles through the Map Tiles API (a session token, then 2D tiles), in a layer switch beside OSM. Billed per tile beyond a free monthly allowance; the current numbers are checked when 8M-1 is planned and written in the setup guide. The raw `mt*.google.com` tile addresses are never used: they break Google's terms.

### 2.4 Login

Two ways in, both ending in the same session.

1. **Log in with Discord.** OAuth2 authorization code flow with the scope `identify` only. `state` is random, tied to a short-lived cookie, and checked at `/auth/callback`; the code is exchanged with `DISCORD_CLIENT_SECRET` and Pine keeps the member's id (and name, for the page header). The redirect address `<publicUrl>/auth/callback` is registered by Matt under OAuth2 in the developer portal, once per application (dev and production).
2. **A link from the bot.** `/maps` (members) and `/region edit` (staff) answer privately with an address carrying a single-use token: 256 random bits, valid five minutes, tied to the member and the server, kept hashed in memory (a restart only expires the links). Opening it starts a session and redirects to the address without the token. This is the way in on a phone, where the OAuth page opens in a browser that is often not logged in to Discord.

Sessions:

- A random 256-bit id in the cookie `pine_session`: HttpOnly, Secure (unless localhost), SameSite=Lax, path `/`.
- Stored hashed (SHA-256) in a new table `WebSession` (`id` hash, `userId` snowflake, `createdAt`, `lastUsedAt`, `expiresAt`; an additive migration): 30 days from the last use, renewed at most once an hour. Logging out deletes the row; the hourly upkeep deletes expired rows.
- A session says only who the member is. What they may do is asked each time (2.5).

### 2.5 What a member may do

Decided per request from fresh data, never stored in the session:

- Member of the server: `ctx.members.find(guildId, userId)` (kept a minute). Not a member: the page is the anonymous one.
- Staff for regions: what `/region import` admits (its guards, from the member's roles and server permissions); creating channels and deleting a forum also need the member's own Manage Channels (`RegionStaff.mayManageChannels`). Before every staff write the member is fetched fresh (`fetchGuildMember(…, true)`).
- Parties: every active party of the server, whatever forums the member can see. The one exception is a member somebody keeps out of a forum (an overwrite of their own that denies something, or a denial of the view to a role of theirs: `memberAccess` says `barred`): its parties are not listed for them, and joining one is refused, since `AccessService` would not let them in either.
- Discord cannot be reached: the page is read-only and says so; no write goes through on stale roles.

### 2.6 Writes go through the services

The web layer calls what the commands call: the editor's Save `RegionAdminService` (`preview`, `import`, `removalQuestion`, `remove`), Join `AttendanceService`. Locks, checks, Discord's side, the reloads, the lines in posts and forum access follow by themselves. The pages never see the database or Discord.

## 3. The live map

`/s/<guild>/map`. `/maps` gives this address (with a login link) when `settings.web` is set, and `settings.regionMapLink` as today when it is not.

### 3.1 For everybody

- The server's regions, labelled with their channel names, and every gym; elite raid gyms marked (`isEliteGym`).
- A gym's popup: name, nickname, region(s), address line (`addressLine`), notes, and "Directions" (a Google Maps link to its coordinates).
- A filter box over gym names and nicknames, in the page.
- `GET /s/<guild>/api/geo`: regions and gyms of the server, built once, rebuilt when `RegionDirectory` or `GymDirectory` reloads or a gym changes, served with an ETag. Gym text is decoded (`GymRepository` already decodes) and the page writes it as text, never as HTML.

### 3.2 For a logged-in member

`GET /s/<guild>/api/parties`: the active parties of the server (less those of forums the member is barred from, 2.5), with an ETag per member.

- **Raid:** a marker on its gym: the post's picture (`pokemonPicture`, `raidEggPicture`), the tier in the posts' words (`raidWords`), hatch or end time with a countdown, the counts of Interested, Coming and Here (by group when there are several), the member's own status, and a link to the post (`https://discord.com/channels/…`, which opens the app).
- **Train:** its route as a line over its gyms, the current stop marked, its name, start time, and a link to the post.
- **Meetup:** listed in a side panel with its name, start time and link (it has no place of its own).
- Nobody is named: a reporter or maker who asked not to be named is not shown anywhere, and attendees are counts only. The post, one tap away, shows names to whoever may see them. The view is a pure function (`src/domain/web/party-view.ts`, unit-tested for what it leaves out).
- Times in `settings.timezone`, as in the posts.

### 3.3 Joining

- The buttons of the post: Interested, Join, Here, Leave; with several groups "Join A", "Join B"; Done for a hatched raid. `POST /s/<guild>/api/parties/<id>/<action>`.
- The handler builds the acting member as `actingMember` does for a button (fresh display name and team role from the member look-up) and calls `AttendanceService` (`signUp`, `joinInto`, `leave`, `done`). The outcome is shown with the words `answerOutcome` uses; the post says its usual line; `AccessService` lets the member into the forum when they could not see it (and takes the access back when they leave or the party ends), exactly as for a member who signs up on a copy of a post.
- The throttle is `ACTION_THROTTLE`, shared with the post's controls (the same key per member).
- +1/−1, Remote, group meeting times and Set time stay in the post. Raids, trains, meetups and spawns made or changed from the map: 3.5 to 3.8.

### 3.4 Refreshing

The page asks for the party list every 20 seconds while it is visible (an unchanged list is a 304), and at once after the member's own press. Countdowns run in the page. A stream (SSE) can follow if 20 seconds proves slow.

### 3.5 Common rules for what members make and change on the map

Asked for by Matt after the first draft (2026-10-15). Every form is a logged-in member's, acts as that member (built as `actingMember` builds one) and calls the service the command calls, so its refusals, throttle (the command's own key, shared with it), the member's privacy settings, the lines in the post and the DMs follow by themselves; a refusal is shown with the command's words. A region is any region of the server (the map does not follow a member's Discord regions, 2.5); a gym that lies in several asks which. Forms read typed times with the commands' readers (`typedPartyTime`, `typedTimedTime`, `reportedTime`) and offer pick lists where the command has autocomplete.

### 3.6 Raids

- **Report:** a gym's popup has "Report raid": egg tier or boss (`ctx.raidBosses`, in `/raid`'s order), the time ("hatches in" / "ends in" minutes, or typed), and the region when the gym has several. `PartyService.reportRaid` as the member, as `/raid` calls it: "a raid is already there" answers with that raid, `NotifyService.raidReported` tells who wants it, and the member's privacy decides whether the post names them.
- **Change:** a raid's popup lets a signed-up member (and staff) set hatch time, end time, boss and moves, through `RaidChangeService` (`setHatchTime`, `setEndTime`, `setBoss`, `setMoveset`): what `/hatch`, `/end`, `/boss` and `/moveset` do, with their lines and refusals.

### 3.7 Trains and meetups

- **Start a train:** name and start time, as `/train` (the maker signed up by their auto-status, privacy respected), in a region picked on the map.
- **The route on the map:** click a gym to add it as a stop; the stops in a side list, reordered by dragging, removed, cleared; saved routes loaded, saved and forgotten (`SavedRoutes`). All through `TrainService` (`addStop`, `moveStop`, `removeStop`, `clearRoute`, `loadRoute`, `saveRoute`, `forgetRoute`), so `mayArrange`, `mayNotMove`, `MAX_ROUTE_STOPS` and "gyms of the server's regions only" (`reaches`) apply. The route is drawn as a line, the current stop marked.
- **Moving:** Next, Previous, Skip, Finish, and taking or giving up the conductor role: the post's "Move train…" panel on the map (`TrainService.move`, `setConductor`, `clearConductor`), each press carrying the stop it was drawn at, so a press that no longer fits is refused (`train-moved-on`, `route-changed`) and the route is drawn anew. The movement message in the post pings as usual.
- **Meetups:** "New meetup" in the side panel: region, name, start and end time, description, as `/meetup`; its maker and staff edit name, description and times there through `TimedPartyService`.

### 3.8 Spawns

"Report spawn" on a point of the map (a long press or right click): the Pokémon (`appearsInWild` refusals and `settings.wildSpawnExceptions` as in `/wild`), the details (required, as in `/wild`), the region the point lies in (asked when several; a point in none is refused). `SpawnService.report` as the member, with `WILD_THROTTLE`. The point itself is added to the report as a maps link (a new optional `point` of `SpawnReport`, shown in the channel's message and the DM); 8W-2's "near a Wayspot" is not part of this.

## 4. The region editor

`/s/<guild>/regions/edit`, for staff of that server (2.5). `/region edit` gives its address with a login link.

### 4.1 What it shows

- The server's regions as coloured outlines with their channel names and the number of gyms in each.
- Other servers' regions in grey, not selectable (`withinReach`).
- Every gym as a dot; gyms in no region of the server in a warning colour.
- The tile switch (2.3).

### 4.2 What staff can do

- Draw a new region; reshape one (drag, add and remove corners); move one whole; delete one.
- Snapping to the corners and edges of the other outlines, so that shared borders meet. Overlap stays allowed.
- Split a region along a drawn line: one part keeps the region, the other becomes a new one.
- Load a KML file into the staged changes (`readKml`).
- Undo and redo of every staged edit.
- A region's details: its channel (one of the server's text channels that is no region yet, or a new name, created at Save) and its description. These are the fields of a KML Placemark, so `planImport` decides channel and category by the rules of `/region import`.

### 4.2a What the outlines hold (Matt, 2026-10-15)

Drawing on a map that shows only the gyms Pine knows is drawing into the void. The editor shows the Wayspots of the latest import (8W-2 keeps them all: stops, power spots and Wayfarer gyms Pine did not take, also those in the scan's margin outside every region) as layers, and those outside every region in a warning colour, so a staff member sees at once that a stop they meant to include lies outside the border. 8M-2 therefore comes after 8W-2.

### 4.3 Checks while drawing

`tidyOutline` runs in the page: no self-crossing, at most 5,000 corners. An outline that fails is red and keeps Save off until it is fixed. Gym counts follow every drag.

Regions should neither overlap nor leave gaps (Matt, 2026-10-15; Pittsburgh's outlines drawn in Google My Maps break both rules unseen):
- **Overlaps** are shaded and listed. Save refuses a change that makes a new overlap; one that exists already does not block other edits, and has "Fix" (the shared border becomes one line, taken from the region the staff member picks).
- **Gaps** are the areas inside the outer shape of all regions that no region covers; shaded and listed with the gyms, stops and power spots in them. Save refuses a change that makes a new gap; snapping makes borders meet in the first place.
- The first time a server's regions are opened, the editor lists the overlaps and gaps they have, worst first (most Wayspots affected).
- **How Fix works.** A stretch where two neighbours' borders run within about 150 metres of each other becomes one shared line: one region's border, or the midline of the two, taken by the other region reversed; one press removes every sliver of that stretch, overlap and gap alike. Where three regions meet, they get one shared corner (proposed in the middle of the gap, draggable). Borders further apart than that are no slip of drawing: they are shown, not fixed. "Fix all slivers" takes the midline for every stretch with no gym, stop or power spot in its slivers; a stretch with something in it is asked about, naming where each thing ends up ("Gym #3092 ends up in region 56").
- **Pittsburgh as measured** (production dump of 2026-10-14, outlines rasterised at 20 m): 124 overlaps over 2,000 m² and about 1,200 smaller, 4.1 km² in all, mostly long strips 50–130 m wide along shared borders (regions 50/56: 15.9 km long); 22 gaps over 2,000 m² and about 590 smaller, 0.32 km² in all; one gym in two regions (#3092, regions 44 and 56); no gym in a gap; 411 gyms in no region, about 295 of them near the outer edge, where outlines were drawn too tight.

### 4.4 Staging

Nothing is written before Save. Staged changes are kept in the browser's local storage per server and editor, so a reload or a lost connection loses nothing; they are cleared once a save of them succeeded.

### 4.5 Save

1. The page sends the staged changes: areas (name, description, outline) for new and changed regions, region ids to remove each with "keep forum" or "delete forum", and the version (4.6) of every region it changes.
2. The server answers a preview: `RegionAdminService.preview` over the areas plus the removals, as `/region import` shows it (new, changed, unchanged; channels and categories to create; the gyms each region gains and loses; gyms that would lie in no region of the server).
3. Confirm runs `import`, then `remove` for each removal, under the admin lock. The page shows the outcome region by region, worded as `renderOutcome` words it.

### 4.6 Two editors at once

The page loads each region with a version: a hash of its outline and description. The preview and the save refuse a region whose version differs (another editor, or `/region import`, changed it): the page shows both shapes and the staff member picks "take theirs" or "keep mine" (which sends the new version). Nothing is overwritten unseen.

### 4.7 KML export

"Export KML" downloads what the editor shows, staged changes included, through `writeKml`: the same file `/region export` gives for saved regions, and the file the Wayfarer script loads.

## 5. Security

- CSRF: every POST needs the session's CSRF token in a header and an `Origin` equal to `publicUrl`. GETs change nothing.
- Body limits: an editor save 2 MB, anything else 16 KB; JSON validated with zod.
- Rate limits: per client address on `/auth/*`, the login links and the public data; per member on writes (the commands' own throttles). A login link counts against `MEMBER_WRITE_THROTTLE` of `/maps` and `/region edit`.
- Logging: never a token, cookie, OAuth code, CSRF token or secret; never a query string of `/auth/*`. A write is logged as a command is: member, server, what was done, never the texts.
- The server answers only its own routes and the bundle; directory listings off; errors answer a short JSON or page without stack traces.

## 6. When something fails

- The port is taken or `settings.web` is invalid: logged at start; the bot runs without the web server.
- Discord cannot be reached for a look-up: read-only page with a line saying why; writes refused.
- OAuth refused or the state does not match: back to the map with "Login failed"; nothing logged of the code.
- A partial save: the outcome per region, as `/region import` answers it; the staged changes stay in the browser until they are saved.
- A party that ended between the list and a press: answered as the post's button would ("This raid is over.").

## 7. Testing

- Unit tests for the pure parts: tokens and their expiry, the session cookie's attributes, the CSP builder, the party view (what it hides), staged edits to `ImportInput` and back, undo and redo, the version hash.
- Route tests through Fastify's `inject` (no port, no network) over the existing fakes: `FakeMemberDirectory`, `partyServiceWith`, the region-admin support, and a fake OAuth exchange.
- A database test for `WebSession`.
- Leaflet, Geoman, Google's tiles and Discord's real OAuth are tried at staging with the dev application, in the built-in browser.

## 8. Plans

| Plan | What |
|---|---|
| 8M-1 | `settings.web`, the server, sessions (`WebSession`), OAuth and login links, the public map of regions and gyms, `/maps` pointing at it |
| 8M-2 | The region editor and `/region edit` |
| 8M-3 | Parties on the map and joining |
| 8M-4 | Raids and spawns from the map: report and change a raid, report a spawn (3.5, 3.6, 3.8) |
| 8M-5 | Trains and meetups from the map: start a train, its route and movement, saved routes, meetups (3.7) |

All five run in the Wayfarer worktree after 8W-1, one after the other, each merged back into `typescript-migration` at its end.

## 9. Not in it

- Stops and power spots as a layer: once 8W-2 has imported them.
- Renaming a region's channel from the editor (rename the channel on Discord; the editor follows).
- A live stream (SSE) for the party list.
- UPnP or any opening of ports by Pine.
- Scopely's Campfire (`https://campfire.scopely.com/discover`): Matt (2026-10-15) would like it integrated if possible; it seems to list only meetups now. A research spike of its own (what the site offers, its terms, whether an account may read it), in the follow-ups.
