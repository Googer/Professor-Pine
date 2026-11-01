# Setting up Pine's web pages

Pine can serve a live map of each server's regions and gyms, to everybody, with a login for members (plan 8M-1), and a region editor for each server's staff (plan 8M-2; the parties on the map follow). It is off until `settings.web` is set. Pine itself serves plain HTTP on this machine; how people reach it from outside (a tunnel or a reverse proxy, with its certificate) is set up beside it.

## 1. The settings

In `data/settings.json`:

```json
"web": {
  "port": 8080,
  "host": "127.0.0.1",
  "publicUrl": "https://map.example.org",
  "trustProxy": true,
  "tiles": "stadia"
}
```

- `port`: where Pine listens. A port that is taken is logged at the start and the bot runs on without its pages.
- `host`: `127.0.0.1` (the default) when the tunnel or proxy runs on the same machine; `0.0.0.0` inside a container that the tunnel reaches over the compose network (do not publish the port to the host then).
- `publicUrl`: the address members open, with nothing after the host. It must be `https://`; only `http://localhost`, `http://127.0.0.1` or `http://[::1]` may be plain http (for trying it on your own machine: the login cookie can then not be `Secure`).
- `trustProxy`: `true` behind a tunnel or proxy, so that the rate limits count the visitor's address and not the tunnel's. Pine reads it from `X-Forwarded-For` (the last address there that no proxy on this machine or a private network added), and believes that header only from this machine or a private network. `CF-Connecting-IP` is not read: Cloudflare adds the visitor to `X-Forwarded-For` as well. Check that your tunnel sends `X-Forwarded-For` (Tailscale Funnel especially; see step 3): without it every visitor counts as the tunnel, and they share one limit.
- `tiles`: `stadia` (the default: Stadia Maps' Alidade Smooth, light or dark as the visitor's device is; register your domain with Stadia first, section 4), `osm` (OpenStreetMap's standard tiles alone, darkened by the page in dark) or `google` (Google's roadmap, satellite and hybrid beside Stadia's; needs the browser key of section 4).
- `memberRole` (optional, not in the example above; `"memberRole": "Verified"`): the name of a role a member must have to see and press the server's parties on the map, for a server whose members are verified before they take part (`Verified`). It is matched as Pine's other role settings are: trimmed, whatever its letter case. A member without it (an administrator excepted) sees what a visitor who is not logged in sees: the regions and gyms, no parties, and the header says they are not a member of the server; a press is refused. Leave it out (or blank) and every member of the server counts. The region editor is not affected: it is for staff. One setting serves every server the bot is in: a server without a role of that name shows its parties to its administrators only.
- `invites` (optional, not in the example above): an invite for somebody who follows a link to the map, logs in with Discord and is not in the server. It is one entry per server, its id to an invite you made in Discord (Server Settings, Invites, or Invite People; choose a link that does not expire, and the channel newcomers land in), `https://discord.gg/<code>` or `https://discord.com/invite/<code>`; a vanity address works too:

  ```json
  "invites": { "412345678901234567": "https://discord.gg/pokemongo-pgh" }
  ```

  Such a visitor sees "Join the server on Discord" under "You are not a member of this server.", which opens the invite in a new tab; after joining, reloading the map makes them a member within a minute, without a new login. Nobody else sees it: not a visitor who has not logged in (they may be a member), not a member without the `memberRole`, not while Discord cannot be reached. Anything other than such an address stops the bot at the start with a message that says what it must look like; a blank value, or a server not listed, shows no invite. Pine does not make or check the invite and needs no permission for it: a paused or deleted invite fails on Discord's side as it would anywhere.

The map says distances (its list of what is on) in the units of the top-level setting `distanceUnits`, as Discord does: `imperial` (the default) or `metric`.

Build the page once: `npm run build` (or `npm run web:build` alone) writes it to `dist/web/assets/`. Without it the map's address says it has not been built.

## 2. "Log in with Discord"

Members can always log in with the button `/maps` gives them (it works once, within five minutes). For a "Log in with Discord" button on the page as well:

1. In the Discord developer portal, open the application, **OAuth2**, and add the redirect `<publicUrl>/auth/callback` (for example `https://map.example.org/auth/callback`). Once per application (the dev application and production each have their own).
2. Copy the **Client Secret** from the same page into `.env` as `DISCORD_CLIENT_SECRET`. It is a secret: never in `data/`, never in the repository. Pine asks Discord only for the member's identity (the scope `identify`).

Without the secret the start says so in the log, and the page tells members to use `/maps`.

## 3. The way in from outside

Pine does not open ports or talk to your router. Pick one:

- **Cloudflare Tunnel** (recommended; free; no open ports, the home address stays hidden, the certificate is Cloudflare's). Needs a domain whose DNS is at Cloudflare. In the Cloudflare dashboard (Zero Trust, Networks, Tunnels) create a tunnel, add a public hostname such as `map.example.org` pointing to the service `http://127.0.0.1:8080` (in Docker: `http://pine:8080`), and run `cloudflared tunnel run --token <token>` as a service of its own (in the Docker stack: `COMPOSE_PROFILES=tunnel` and `CLOUDFLARE_TUNNEL_TOKEN` in the env file start its `cloudflared`, with `web.host` `0.0.0.0` in `pine-settings.json`; `.env.example`). The token goes in the environment of `cloudflared`, never in a file of the repository. Set `trustProxy: true`.
- **Tailscale Funnel**: no domain needed; the address is a `*.ts.net` name. `tailscale funnel 8080` on the machine; `publicUrl` is the `https://<machine>.<tailnet>.ts.net` address it prints. Set `trustProxy: true`.
- **Caddy with a port forward**: needs a public IPv4 address and opens port 443 on your router to this machine. A `Caddyfile` of `map.example.org { reverse_proxy 127.0.0.1:8080 }` gets and renews the certificate by itself. Set `trustProxy: true`.

Whichever you pick, check once that it sends the visitor's address. Pine logs no addresses, so ask for `<publicUrl>/auth/login` 21 times within a minute from one place, then once from another network (a phone without Wi-Fi). If the second is refused too ("Too many requests"), the tunnel sends no `X-Forwarded-For` and every visitor shares one limit.

With Cloudflare, the browser's console may show that a script from `static.cloudflareinsights.com` (`beacon.min.js`) violates the Content Security Policy. That is Cloudflare Web Analytics, whose automatic setup is on for the domain and adds its script to every page. Pine's Content Security Policy blocks it on purpose, and nothing on the page breaks. To stop it, open Web analytics in the Cloudflare dashboard's account home (under Analytics & Logs, or Observability → Analytics), choose Manage site for the domain and set Automatic setup to Disable. The change can take a few minutes to reach every server.

## 4. Map tiles

The map shows Stadia Maps' Alidade Smooth (light) and Alidade Smooth Dark (dark) by default, with no key: for a website Stadia checks the page's domain, so a key in the page would add nothing (anybody can read a page's key). Pine sends its origin with each tile request (its `Referrer-Policy` is `strict-origin-when-cross-origin`).

1. Make a free account at Stadia Maps (the free plan is for non-commercial use: about 200,000 credits a month, refused past it, never billed).
2. In its dashboard add a property with your domain (the host of `publicUrl`, for example `map.example.org`). `localhost` works without anything, for trying it on your own machine.

When Stadia refuses its tiles (three failed in a row, or the first two of a visit: a domain it does not know, such as a quick tunnel's address, or the month's credits spent), the page switches to OpenStreetMap's tiles for the rest of the visit, darkened in dark mode. With `"tiles": "osm"` Stadia is never asked.

### Google's tiles (optional)

For Google's roadmap, satellite and hybrid as well, beside Stadia's:

1. In the Google Cloud console, enable the **Map Tiles API** in a project with billing.
2. Create an API key for browsers, separate from `GOOGLE_API_KEY` (which is the server's and never reaches a page). Restrict it to the **Map Tiles API** only, and to **HTTP referrers** `<publicUrl>/*` (for example `https://map.example.org/*`).
3. Put it in `.env` as `GOOGLE_MAPS_BROWSER_KEY` and set `"tiles": "google"`. Without the key the start warns and the page shows Stadia Maps' tiles only.

The price (Google's pricing page, checked 2026-10-16; check again before enabling): Map Tiles API 2D tiles are free up to 100,000 a month, then US$0.60 per 1,000. A visitor who pans around a city loads a few hundred tiles; the page asks Google only while a Google layer is chosen (Stadia's are shown first). Set a budget alert in the Cloud console.

## 5. Check it

Start the bot and look for `web server listening` in its log. Open `<publicUrl>/s/<server id>/map`: the regions and gyms of that server are shown to everybody. `/maps` in the server gives the map's address and the login button.

The region editor is `<publicUrl>/s/<server id>/regions/edit`; `/region edit` gives its address and a login button to staff (admins, moderators and bot developers who may manage the server, as for `/region`). On the web the editor asks for Manage Server itself: a server that lets a role use `/region` through its Integrations overrides (Server Settings, Integrations) must also give that role Manage Server for the editor. After an update that adds `/region edit`, register the commands again (`./pine deploy-commands`). Its page needs nothing more to set up: it is built with the map (`npm run build`).

## 6. Handing out the Wayspot export tool (the owner's instance only)

The Pine Wayspot export tool, which makes the export `/gym import` reads, is kept in a private repository and handed out by one Pine instance, the owner's (`OWNER_ID`), to the admins of other instances it approved. Every other instance needs nothing of this section: its `/gym import` help names where to ask, `settings.wayspotTool` (default `https://profpine.com/userscript`), and its own `/userscript` answers "Not available on this Pine.".

1. The tool's files go in the folder `PINE_TOOL_DIR` of `.env` (blank: `./wayspot-tool` beside `compose.yaml`, which `./pine` makes when it is missing): `pine-wayspot-export.user.js` (the private repository's serve build) and `CHANGELOG.md`. The stack mounts it read-only; the bot runs as the image's user `node`, so the folder must be readable and searchable by others and its files readable by others (`chmod a+rx` the folder, `a+r` the files; `./pine` makes a missing folder so, and refuses to start or restart the bot otherwise). On a checkout run without Docker the folder is `wayspot-tool/` in the bot's working folder.
2. The private repository's `npm run deploy` puts both files there (its `deploy.json` names the folder, local or `<user>@<host>:<folder>` over ssh) and refuses a version that the folder already holds with other content. Nothing needs restarting: the next request reads the new file.
3. The tool is offered while `settings.web` is on, `DISCORD_CLIENT_SECRET` is set (the page needs "Log in with Discord") and the file reads (a complete `==UserScript==` header with `@version` and the serve build's placeholders). Otherwise every address under `/userscript` answers 404 and the page says only "Not available on this Pine.".
4. `<publicUrl>/userscript`: an admin logs in with Discord and asks, saying which community they run Pine for. Each new request (and a request asked again after a refusal) reaches the owner as a DM with **Approve** and **Refuse**, while at most 20 requests wait; the page lists every request for the owner as well, with Approve, Refuse, Revoke (a second press) and Approve again. On the page the owner's actions need a login of the last 12 hours (log in again when it asks); the DM's buttons need nothing more.
5. An approved admin sees their install link (a key of their own), the version and the changelog's three newest entries, and can make a new link (the old one stops; the copy installed from it keeps running but gets no more updates). Tampermonkey updates the tool from the link. The owner's own link is made by **Make my link**.
6. Check it: `<publicUrl>/userscript` shows the login, and after it the owner's list. Keys never appear in the logs; a fetch is logged with the row's number.
