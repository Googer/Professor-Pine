# Phase 8M-1 staging checklist: the web server and the public map

Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the map pages in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`.

## Before

1. `npm run migrate` on the dev database (migration `2026_10_16_015_web_session`: the table `WebSession`). If `typescript-migration` took 015 first, this one is renumbered at the merge.
2. `npm run build` (it runs `npm run web:build`): `dist/web/assets/` holds `map-<hash>.js`, `map-<hash>.css` and Leaflet's pictures, `dist/web/assets.json` names the first two.
3. In `data/settings.json` of the dev bot: `"web": { "port": 8080, "publicUrl": "http://localhost:8080" }` (plain http on this machine: the cookie is not `Secure`, which the browser accepts for localhost). For the Google part below, `"tiles": "google"`.
4. Matt registers the redirect `http://localhost:8080/auth/callback` under OAuth2 in the developer portal of the dev application, and sets `DISCORD_CLIENT_SECRET` in `.env` (Claude checks only that it is set, with a command that prints no value). For the Google part Matt creates a browser key (Map Tiles API only, referrer `http://localhost:8080/*`) and sets `GOOGLE_MAPS_BROWSER_KEY`.
5. The command definition of `/maps` changed (description; it is now offered where `settings.web` is set): `npm run deploy-commands -- --global` with Matt's go-ahead.

## The server

6. The log of the start says `web server listening` with the port; with the port taken by something else (a second `python -m http.server 8080`), the start logs `the web server could not start` and the bot works on Discord as usual. With the client secret unset, the start warns that there is no "Log in with Discord".
7. `http://localhost:8080/` is a short page; `/s/<another id>/map` and `/nothing` are short "Not found." pages; the response headers carry the CSP, `nosniff`, `DENY` and the referrer policy (the browser's network panel).

## The map, logged out

8. `/s/<test server id>/map`: OpenStreetMap's tiles with "© OpenStreetMap contributors"; the test server's regions with their channel names (shown from zoom 12), its gyms as dots, elite raid gyms in purple. The console shows no CSP violation (Leaflet's styles and pictures load; the layer switch's icon shows).
9. A gym's popup: name, nickname, "Elite raid gym", its regions, address, notice, description; "Directions" opens Google Maps in a new tab with the route to the gym. A gym whose name has `<b>` in it (rename one with `/gym edit` for the test, then back) shows the brackets as text.
10. The filter box: typing hides the other gyms; Enter fits the map to the matches (one match opens its popup).
11. `/s/<id>/api/geo` twice: the second is a 304 (network panel). Rename a region's channel on Discord, or change a gym with `/gym edit`: the next load shows it.
12. The header says "Log in with Discord".

## Logging in

13. "Log in with Discord": Discord's consent page asks for the identity only; after Authorize the map shows the member's name and Log out. With "Cancel" on Discord's page: back on the map with "Login failed."
14. `/maps` in the test server: a private container with the map's address and "Open the map (logs you in)". The button (in a private window, logged out) opens a short page with "Continue as <the account's display name>" and no session yet (no `pine_session` cookie in the browser's storage panel: the plain name on http of this machine; over https it is `__Host-pine_session`); "Continue" logs in as the account's display name, not the server nickname, and the address bar shows `/s/<id>/map` without the token. Logged in already as somebody else, a link's "Continue" replaces that session (the count of `WebSession` rows in the dev database stays the same). The same button again, or after five minutes: "This login link has expired. Ask for a new one with /maps." `/maps` in a DM with the bot: "Use /maps in your server." (or the map of all regions where `regionMapLink` is set).
15. Log out: the header offers the login again; the `WebSession` row is gone (a count in the dev database before and after). Again after a restart of the bot with the map left open (its CSRF token is stale then): Log out still works (a 403, `/api/me`, a second POST in the network panel).
16. A member who is not in the test server (Matt's second account, if any) logs in: "You are not a member of this server."
17. The bot's log at debug shows each request by its route pattern, never a code, a token or a cookie.

## Google's tiles

18. With `tiles: 'google'` and the key: the layer switch offers Google roadmap, satellite and hybrid; each loads (one `createSession` per layer in the network panel, then `2dtiles` requests), and the attribution shows "Google Maps" with Google's copyright of the view, changing after a move. Switching back to OpenStreetMap removes Google's attribution.
19. Whether Google's policies want their logo image rather than the words "Google Maps" (the policies page asks for the logo "whenever possible" and allows the words where space is limited): decide with Matt; the logo would be a picture of Google's own, served by Pine.

## Left open (to the follow-ups if not settled here)

- The page on a phone (the header wraps; the filter box and the popup are usable).
- Cloudflare Tunnel with `trustProxy` is tried with the Docker plan (`map.profpine.com`), not here. Over https the cookies are `__Host-pine_session` (path `/`, Secure, no Domain) and `__Secure-pine_oauth`; check there that the browser keeps both and the login works. There, and for any other tunnel chosen (Tailscale Funnel especially), check that it sends `X-Forwarded-For` (the check at the end of step 3 of `docs/web-setup.md`): without it every visitor counts as the tunnel and they share one rate limit. Pine reads no `CF-Connecting-IP`.
