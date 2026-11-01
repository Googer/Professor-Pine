# Staging checklist: 8M-14, the web's top page

Design: `docs/superpowers/specs/2026-10-29-web-top-page-design.md`. Plan: `2026-10-29-phase-8m14-web-top-page.md`.

The dev instance at `https://dev.example.com` serves the test server (its invite in `settings.web.invites`) and the dev bot's second server, the second development server (<second server id>, no region). Googer (the owner, in both servers) drives the built-in browser, Tester (in the test server only, to be checked in step 0) Claude in Chrome. Nothing here needs a deploy.

## Before

0. Check that Tester is not a member of the second development server (Discord's member list of that server, or `GET /guilds/<second server id>/members/<Tester's id>` answering 404 through the bot's token). If Tester is in it, these steps need another account that is not.
1. Give the second server a map: `node --env-file=.env var/stage/second-server-region.mjs --apply` (a copy of Oakland's outline as a region of the second development server, on a made-up channel id). Matt makes an invite of the second development server (never expiring is fine) and adds it to `var/stage/settings.json` under `web.invites` beside the test server's.
2. `npm run web:build`, then Matt restarts the bot with the stage settings.

## Logged out

3. A private window opens `https://dev.example.com/`: the heading "Professor Pine", "Professor Pine organizes Pokémon GO raids, raid trains and meetups on Discord.", "Professor Pine's maps are kept per Discord server. Log in with Discord to see the maps of your servers.", the button "Log in with Discord", "Or use /maps in your server on Discord." The page's source names neither server. Light and dark both readable (switch the system's theme).
4. Response headers of `/`: `Cache-Control: no-store`; the CSP as on the map's pages.
5. "Log in with Discord", then Cancel on Discord's consent page: back on `/` with "Logging in with Discord failed; try again."; the address bar shows `/` without `?login=failed`; a reload no longer shows the line.
6. `/auth/login?next=//evil.example` and `/auth/login?next=https://evil.example`: after the login, back on Pine (`/` or a map), never elsewhere.

## Logged in

7. Googer logs in from `/`: "Logged in as Googer", Log out, and under "Your servers" both servers by name, each a link to its map; no redirect. Both links open their maps (the second server's shows the copied outline).
8. Tester logs in from `/`: the test server under "Your servers"; under "Servers you can join" the second development server with "Join on Discord" opening its invite in a new tab, and "Once you have joined, reload this page; Discord can take a minute to tell Pine." Do not join.
9. Log out as Tester on that page: back on the login page of step 3; the test server's map asks for the login again.
10. Tester logs in again; Matt restarts the bot; once it is up, Tester presses Log out on the page loaded before the restart: logged out (the login page), or carried to the map and able to log out there; never an error that repeats on every press.
11. A phone (Matt), Tester's page of step 8: the account line, both lists and the button fit the screen; the server names wrap rather than run off the card.
12. The Theme choice: on the map (logged in), the account menu's Theme set to Dark on a light system; open `/`: the top page is dark too. Set it back to Device.

## One server again

13. `node --env-file=.env var/stage/second-server-region.mjs --undo`, then a restart: Googer and Tester logging in at `/` go straight to the test server's map (one server of theirs, nothing to join with a map).

## Rate limit

14. 31 loads of `/` within a minute from one address (`for i in $(seq 31); do curl -s -o /dev/null -w '%{http_code} ' https://dev.example.com/; done`): the 31st answers 429 with `Cache-Control: no-store`. A minute later: 200 again.

## Cleanup

15. The staging region is gone (step 13). Leave the second server's invite in `web.invites` or take it out (Matt's choice; without a region it is never offered).
