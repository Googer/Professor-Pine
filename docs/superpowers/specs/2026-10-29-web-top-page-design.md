# The web's top page leads to the map (design, 2026-10-29)

## Why

Somebody who opens Pine's bare address (`https://profpine.com/`) today gets one sentence, "Professor Pine's map is at an address of each server: use /maps there." (`src/web/server.ts`, the route `/`), and no way on: the map lives at `/s/<server id>/map`, which only a shared link or `/maps` gives. Matt (2026-10-29): somebody who finds Pine at its top address must be able to reach the real map from it.

## What Matt decided (2026-10-29)

- **Logged out: always the login page.** Whatever the number of servers, a visitor who has not logged in gets one short page offering "Log in with Discord": no redirect, nothing that differs between an instance of one server and of several. Matt (2026-10-29): only after authenticating with Discord, which is also less easily attacked (a stranger's requests stay on one static page; Cloudflare's tunnel in front gives some protection besides). This replaces the first idea of redirecting everybody on a one-server instance.
- **Logged in: your servers, else an invite.** After the login, the servers with a map that the visitor is a member of, each linking to its map (exactly one: straight to it); for a server they are not in, the invite its admin chose (`settings.web.invites`) where there is one, so that they can join.
- **No public list of servers.** Which communities use an instance is never shown to somebody who has not logged in. A logged-in visitor sees the servers they are in, and the servers whose admins gave an invite (an invite set in the settings is the admin's consent to be found; a server without one stays unnamed).

## Behavior

`GET /` (and HEAD) answers by these rules, in order:

1. **The servers with a map** are the servers the bot is in (the client's cache, as `guildRoutes` asks) that have at least one region with an outline (what `/s/<guild>/api/geo` would draw). A server without a region shows an empty map, so it is not a place to send anybody. *(Claude's call.)*
2. **None:** the short page as today, worded for an instance that serves nobody yet: "Professor Pine has no map here yet." *(Claude's call.)*
3. **Not logged in** (any number of servers, also one): a short page (`answers.ts`'s look, `pages.css` and `theme.css`, light and dark): the heading "Professor Pine" and the line "Professor Pine organizes Pokémon GO raids, raid trains and meetups on Discord." first (whole-branch review BR-1, F6; on the page without the client secret too), then "Professor Pine's maps are kept per Discord server. Log in with Discord to see the maps of your servers." with the button "Log in with Discord" leading to `/auth/login?next=/`, and the line "Or use /maps in your server on Discord." Without `DISCORD_CLIENT_SECRET` (no login with Discord on this instance) only the last sentence, as a full sentence: "Use /maps in your server on Discord to open its map."
   After a failed or declined login (`/auth/callback` returns to `/?login=failed`) this page also says "Logging in with Discord failed; try again." *(review 3)*
4. **Logged in** (by Discord or by a `/maps` link, which starts a session on an instance without the secret too, review 8): the servers with a map that the visitor is a member of, asked of the **unwrapped** member directory (`deps.members.find(guild, user)`, not `guildRoutes`' `mapMembers`, review 5: a member without `settings.web.memberRole` still counts here, and the map's header tells them what they lack), all servers at once (in parallel), fresh as every membership question is (spec 2.5). By name (the server's name as the bot sees it, shown in `<bdi>` and escaped, so that a name with direction marks cannot turn the line round, review 9), sorted with `localeCompare` at base sensitivity, each a link to `/s/<id>/map`. Under them, "Servers you can join": each server with a map that the visitor is not in and that has an invite in `settings.web.invites`, by name, with "Join on Discord" to its invite (the address as the settings give it, `INVITE_ADDRESS`, opened in a new tab with `noopener`, as the map's invite is). Every logged-in page names the visitor and offers Log out, as the map's header does (review 9).
   - **Exactly one server of theirs, none to join, and every lookup answered:** redirect (302, not cached) to its map.
   - **None of theirs, every lookup answered:** "You are not in any Discord server that uses this instance." (with the servers to join under it, where any), so that somebody logged in with the wrong account can Log out and log in with another, or join.
   - **Some lookup failed** (Discord could not say for a server): no redirect; the list of those found (perhaps empty) and "Discord did not answer for every server; reload to try again." *(review 4)*
5. The page names no server to anybody who is not logged in; to a logged-in visitor, only servers they are a member of and servers whose admins gave an invite. The count of servers is never said, and a logged-out visitor cannot tell one server from several.

**Log out on these pages (review 1).** `POST /auth/logout` needs the CSRF header, which a plain form cannot send, and the short pages run no script. So the logged-in pages load a small script of the bundle under a name without a hash, `/assets/top.js` (built as `page.css` is, `scripts/web/build.ts`), which reuses `logOut` (`src/web/client/logout.ts`) with the token from the page's `data-csrf` and reloads `/` afterwards. The CSP is unchanged (scripts from Pine). Without a build the button does nothing; the page says nothing of it (as the plain look without `page.css`). *(Claude's call: the CSRF rules stay; "log in with another account" cannot work, since Discord skips its consent page and logs the same account in again.)*

## Constraints

- **Redirects** go only to `/s/<snowflake>/map` (`localPath`'s rules) or to `/auth/login?next=/`. `localPath` (`src/web/local-path.ts`) accepts `/` exactly, as it does `/userscript` (today a return to `/` happens only by the callback's fallback; review 2), with tests, and `web.md` says so. An open redirect is a finding.
- **Which servers have a map** comes from one injected function `serversWithMap(): Promise<{ id: string; name: string }[]>` beside `servers.has` in `WebDeps` (a promise: the database's ids are read asynchronously): the servers the bot is in and can read (`guild.available`) with a region that has an outline, a region counted even when its channel is gone (as `geoView` draws it); the outlined regions' server rows mapped to snowflakes by the cached `guilds.snowflakeOf`, so that a load of `/` costs no query per server without a row (prototype review 6); never by building the geo JSON (review 6).
- **Membership lookups** wait at most 5 seconds each; one that does not answer by then counts as not answered (the partial-failure line). *(Prototype review 3.)*
- **CSP stays as it is:** no inline script, no inline style. The list is server-rendered HTML; names are escaped (`escapeHtml`), never HTML built from data. No server icons: Discord's CDN is not in `img-src`, and adding it is not worth it for this page. *(Claude's call.)*
- **Rate limit:** `/` gets a limit of its own per client address (`limitedPerAddress`), 30 a minute, counted for every answer of `/` (also the plain redirect: harmless), since a logged-in load asks the member directory once per server. *(Claude's call; the directory keeps answers a minute.)*
- **Caching:** every answer of `/` is `Cache-Control: no-store`, set before the limiter, so that a 302 and a 429 carry it alike (review 10).
- **Look:** the list, the button and Log out get their classes in `pages.css` (light and dark from `theme.css`); without a build the page is plain, as the short pages are (review 9).
- The login flow, sessions and CSRF are unchanged; `/auth/callback` already returns to `next`.
- Words follow the project's text rules (American spelling, no bare mentions). Nothing reaches Discord; no migration, no setting, no command change.

## Left to the builder

- Where the list of servers with a map comes from (a small method on the region directory or the guild cache, injected through `WebDeps` beside `servers.has`), and how the page is built (a new helper beside `shortPage` in `answers.ts`, or a page module of its own).
- The tests: a pure function deciding the answer of `/` from (servers with a map, login state, memberships) is the natural seam, with `inject` tests for the redirect, both pages, the escaping of a server's name and the `no-store` header.
- `web.md`'s "Addresses" and "Logging in" sections updated; a staging checklist (one server: the dev instance with only the test server's regions; several: the second server given a region, or a test of its own).
