# Phase 8M-7 staging checklist: the web map's frame

Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude drives Discord and the map in its own tab, Matt the phone steps.

- **Accounts:** Googer (owner, staff) and Tester (a member).
- **Plan:** `2026-10-25-phase-8m7-web-frame.md`.
- **Design:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md`.
- **Conventions:** `docs/architecture/web.md`.
- **Devices:** a desktop browser (light and dark), an Android phone and an iPhone if at hand, each through Discord's in-app browser and the phone's own browser.

## Before

0. **The page built, the bot started after it.** `npm run web:build`, then start (or restart) the bot: the bot serves the map's page from `dist/web/assets/` and reads `dist/web/assets.json` once at startup (2026-10-26: a bot started without it served the page of before 8M-7).
1. **No migration, no command option change:** no deploy needed. The settings:
   - `settings.web.publicUrl` is `https://dev.example.com`, the tunnel `pine-dev` runs, and Stadia Maps has `dev.example.com` (or `profpine.com`) registered.
   - `settings.web.tiles` is left out (the default `'stadia'`).
   - `settings.distanceUnits` is left out (the default `'imperial'`); step 17 sets `'metric'`.
2. **Raids to see:** Googer reports two raids in one region (one hatched, one an egg) and one at a gym about a mile away; Tester joins one, with a +1. A train and a meetup run somewhere in the server.

## Logging in

3. **`/maps` (Tester), phone.** The answer's only link is the button "Open the map (logs you in)"; the map's address is in the small print as code and cannot be tapped.
4. **The button.** Tapped, the page continues by itself ("Logging you in as Tester…") and the map opens logged in, without a second tap. On a slow connection, tap the page's button as well: the map still opens logged in.
5. **Not spent before the tap.** Use `/maps`, wait a few seconds without tapping (Discord and Android may warm the address), then tap: it logs in. (A link spent before the tap lands on "This login link has expired".)
6. **Back.** On the map, press Back: the map shows no "expired" notice while the header names Tester.
7. **A used link.** Tap the same button again after a minute, logged out (or in a private tab): the map with "This login link has expired" at once, no Continue page.
8. **`/region edit` (Googer).** The same: the editor's address only as code; the button opens the editor logged in by itself.
9. **Logged out on a phone (360–414 px wide).** Log out: the header fits on one row with "Log in" and nothing scrolls sideways; the list pane has "Log in with Discord".

## The look

10. **Light and dark.** Switch the device between light and dark with the map open: the page, the popups, the list and the tiles follow without a reload (Stadia's Smooth and Smooth Dark). The region editor and `/userscript` follow too.
11. **The fallback.** Open the map at an address Stadia does not know (a quick tunnel, `cloudflared tunnel --url http://127.0.0.1:8080`): after the first refused tiles the map shows OpenStreetMap's, darkened in dark mode, never a blank map.

## The view

12. **Zoom and pan.** Zoom out as far as it goes: all of the server's regions fit, no further. Pan away: it stops a little beyond them.
13. **The start view.** `/maps` in a region's channel opens on that region. Elsewhere it opens where you last left the map. With the location granted before, it opens on your location.
14. **Show where I am.** Nothing asks for the location on load. Pressed, the browser asks once; a blue dot with its accuracy circle, kept current while you walk.

## Layers

15. **Desktop.** The row shows Raids, Trains, Meetups and Region outlines on, and Gyms on (until 8M-9); "More" holds the rest. Turned off, a layer's markers go; reloaded, the choice is kept.
16. **Phone.** "Layers · n" opens a bottom sheet of switches; n counts the layers on. Tab stays inside the sheet with a keyboard; Escape or the scrim closes it. Zoomed out, gyms are count bubbles; from street level, PokéStops and Power Spots show for members, with a quiet "more than shown" line where there are too many.

## Raid markers

17. **The marker.** A raid is a circle on its gym: the boss (or the egg) in its tier's ring, a time badge ("12m", "hatches 2:40") and a green count of those going (with the +1). In its last five minutes it is dimmed.
18. **By zoom.** Zoomed out one step: smaller, the count without the badge; further out: smaller still, the picture kept, no badge or count; never grouped. Each still opens with a tap.
19. **Several things at one place.** A train's stop at the raid's gym: a tap lists both, and a choice opens its own popup.

## The list

20. **Desktop.** The side pane lists raids, trains and meetups across the server, grouped with counts: picture, name, place, distance, time and going. Sort by Nearest, Soonest, Most going; reloaded, the sort is kept. Hovering a line highlights its marker; clicking flies there and opens its popup. With a keyboard, Enter on the fifth line keeps the focus on the fifth line after the map moves.
21. **Phone.** "List" swaps the map for the list and back; a form opened from a line docks under the map.

## Distances

22. **Imperial.** The list, `/gym move`, `/gym review` and `/research`'s "Same task at more stops…" say feet under a tenth of a mile, then miles.
23. **Metric.** Set `settings.distanceUnits` to `'metric'` and restart: the same places say meters, then kilometers; the region editor's "borders lie more than … apart" too.

## After

24. Note what passed and what did not in the follow-ups file, "From the staging run of 8M-7".
