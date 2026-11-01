# Staging checklist: live updates on the map (8M-16)

Every step needs Matt's go-ahead. Matt starts the bot and the tunnel, and restarts them where a step says so. Claude drives the map and Discord in its own tab as Googer; Matt's hand is needed on his phone and with Tester.

- **Accounts:** Googer (the owner, staff) and Tester (a member with the map's role).
- **Design:** `docs/superpowers/specs/2026-10-31-map-live-updates-design.md`.
- **Conventions:** `docs/architecture/web.md`, "Live updates on the map".
- **Devices:** two desktop browser windows side by side at `dev.example.com`; Matt's phone (steps 8 and 12).
- **Writes:** the parties and reports of the steps are made in a region of the test server and ended afterwards. No migration, no setting, no command change: no deploy.
- **What to read in the log:** the bot at debug level for the steps that count Discord's calls (step 13).

## Before

0. **The page built, the bot started after it.** Run `npm run web:build`, then start (or restart) the bot. In each map window, `/s/<guild>/api/live` shows in the browser's network list as one open request of type `eventsource`.

## A change shows at once

1. **A raid.** Googer and Tester each have the map open, the raid's region in view. Tester reports a raid on Discord: it shows on Googer's map in 1 to 2 seconds, without a reload. Googer's network list shows one `/api/parties` after the signal, not a stream of them.
2. **A post's change.** With the raid's popup open on Googer's map, Tester joins on Discord: the popup shows the new count and name in 1 to 2 seconds, not one change behind.
3. **A press from the map.** Tester presses Join on the map: Tester's own map answers at once, as before; Googer's within 1 to 2 seconds.
4. **Reports at stops.** Tester reports a grunt and then research: each shows on Googer's map in 1 to 2 seconds. Tester takes one back: it goes from Googer's map too.
5. **A party's end.** A raid's hatch and end, seen on an open map with no change made by anybody: the marker changes within a second or two of the moment.
6. **A group's choice kept.** On a raid with two groups, Googer picks the second group in the popup's menu. Tester joins, so the popup redraws: the menu still shows the second group, and Join joins it.
7. **What a redraw leaves alone.** A tall popup scrolled down, the phone card, route mode, and a form open: a change arriving does not close, move or reset any of them.

## When the stream cannot work

8. **A phone.** On Matt's phone: lock it and open it again a minute later, and switch apps and back. The map catches up at once on showing, and the stream opens again without any message to the member.
9. **Hidden.** A tab hidden: the `live` request ends. Shown again: it reopens, and a change made while hidden is on the map.
10. **The tunnel restarted, maps open.** Matt stops `cloudflared` for a minute, then starts it. The maps poll meanwhile (a list every 20 seconds at most, once the failing streams are noticed), then go live again. Nothing is shown to the member. No burst of list asks at the moment of the drop: they spread over about 20 seconds.
11. **The bot restarted, maps open.** As step 10, with the bot. The first streams come back after a random wait. The bot's start is not delayed by map traffic.
12. **A quick tunnel.** A `trycloudflare.com` address (the map and its login only). Record whether events arrive: Cloudflare's documents say not, and then the map polls at 20 seconds with no error shown. Either result passes if the map stays current.
13. **A tab left an hour.** One map left open for over an hour on the same stream's renewals: it is still live (a change shows in 1 to 2 seconds), and the stream was renewed about every 30 to 35 minutes without a member seeing it.

## Load

14. **30 open streams.** Thirty streams from a script (a member's cookie, `curl -N`) or tabs, against the caps: 8 per address and 4 per member refuse with 429 beyond them, so this needs several members or a scratch cap in the stage settings' build; record which. A change sent to all: the bot's event loop stays responsive (Discord commands answer as fast as before) and its CPU is looked at.
15. **Numbers for the follow-ups.** From the log at debug level: the Discord member route's round trip and its `X-RateLimit-Limit`, `waiting.size` of the paced lookups after a bot restart with maps open, and the cost of a post's ask. The spread's 20 a second, the soft lifetime for list asks and the stop-report list's cost (follow-ups, "From live updates on the map") are decided from these, not from the laptop's earlier numbers.

## After

16. **Cleanup.** End the parties and reports made in these steps. Note what passed in the follow-ups, "From the staging run of 8M-16".
