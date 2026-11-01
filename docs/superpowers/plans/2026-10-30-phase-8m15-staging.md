# Staging checklist: 8M-15, the small web plan before the cutover

Every step needs Matt's go-ahead. Matt starts the bot and the tunnel. Claude drives Discord and the map in its own tab as Googer on the desktop; Matt's hand is needed on his phone, with Tester, and where a step says so.

- **Accounts:** Googer (the owner, staff) and Tester (a member with the map's role).
- **Design:** `docs/superpowers/specs/2026-10-30-small-web-plan-design.md`. Plan: `2026-10-30-phase-8m15-small-web-plan.md`.
- **Conventions:** `docs/architecture/web.md`, `trains.md`, `utilities.md`.
- **Devices:** a desktop browser at 1280 pixels; Matt's phone (steps 7 to 10, and a landscape look in step 10).
- **Writes:** the parties of the steps are made in a region of the test server and ended afterwards. No migration, no setting, no command change: no deploy.

## Before

0. **The page built, the bot started after it.** `npm run web:build`, then Matt starts (or restarts) the bot.
1. **What stands.** In one region: a gym with a raid on it and a train stopping there; a meetup at a PokéStop; a meetup at a pin; a finish train of at least five stops with its conductor at the second; a loop train of at least four stops; a turn-back train of five stops with its conductor at the third; a train of at least ten stops, for step 6.

## The place list

2. **At the place, then nearby.** At a zoom where the raid and something else are close on the screen, tap the raid's marker. The list is headed with the gym's name; the raid and the train stopping there come first, then the label "Also nearby" over the rest. The word "Here" is not a heading any more.
3. **Everything at the place.** Zoom in until only that gym's things are in the list: no "Also nearby" label.
4. **A pin and a tap between things.** Tap the pin meetup where it has neighbors: the heading is "Nearby", with no label. Tap the PokéStop meetup where it has neighbors: the heading is the stop's name, and the meetup is first. A Power Spot's and a PokéStop's own dots still open their own popups. A finished train's entry is under "Also nearby" or "Nearby", never first under a place.

## A train's stop badges

5. **The numbers, only for the selected train.** At zoom 15 and up, with nothing open: no numbers on any train; lines, arrowheads and rings as before. Open the finish train's popup: 1 on the next stop, then 2, 3 …, each at the upper left corner of its stop's marker, above everything; the current stop and done stops have none; no other train shows numbers. Close it: the numbers go. Open another train: only its numbers show. Open a raid while a train is open: the numbers go. The loop train: numbered up to the stop before the current one. The turn-back train: the stops ahead are 1, 2; the stops behind have higher numbers with gaps (Matt: "we'll see in staging"). Zoom to 14 with a train open: the numbers go; back to 15: they come back. Wait for a poll (20 s) with a train open: the numbers stay. On the phone: the same with the card.
6. **The popup's Route list.** Open Route in a train's popup on the map: "(next)" beside the next stop and "(in 2 stops)" and so on beside the others, the same numbers as on the map; "(the train is here)" as before. On the train of ten or more stops the numbers "10." and up are whole, also in a popup that scrolls. On Discord the post's "Next:" line and `/route` have no such words.
7. **Taps and crowded stops.** With a train open, downtown at zoom 15 and 16: a tap on a number opens what is under it (a raid, a gym), not the train; on a stop with no dot or marker showing (Gyms off) it counts as a tap on the map, which closes the popup and the numbers go, by design; numbers are readable where stops are close (Matt's look). Arrowheads sit mid-leg as before 8M-15. A train's line and ring open its popup, also on a tap a few pixels off the line (Matt: an invisible tap area of about 20 px, below the dots and markers), and with several things close by the place list offers it. A tap on the map well away from the line does what it did.
8. **Report's pick.** Report › a kind with places to pick, with a train on the map: the places that do not fit are dimmed, the ones that fit are ringed, the train's line and arrowheads are dimmed. Cancel: all back.

## The × on a phone

9. **The first line beside the ×.** On Matt's phone, in desktop mode too: a raid's popup with its picture, a train's popup, the place list, a Power Spot's popup, a PokéStop's popup, a report form, and Group… in a raid's popup. The first line shares a row with the ×, no text or control runs under it, and the × still closes with one tap. Group…'s own frame and the × touch at the corner: Matt's look ("we'll look").
10. **A popup that scrolls.** The phone in landscape, or a tablet, on a long train's popup: the post starts below the ×, and scrolling it passes nothing under the ×. On a desktop with a mouse: the small × and no empty row, as before.

## The short pages

11. **Cards alike.** On the desktop: the top page logged in with links only, the top page with a join list, the login page and a one-line answer (a login link that is used up): the cards are the same width. On a narrow window: 16 px on each side.

## Discord

12. **The listing.** The events forum's pinned "Events" after a draw (restart or next feed read): no line says "Campfire"; the foot says "Official meetups by Community Ambassadors are on Campfire", linked, when any listed event has the hint.
13. **The posts.** An event of a day or more has no "Official meetups, if any: Campfire"; an event shorter than a day with the hint keeps it. Only what changed is edited: after the restart each open post is edited once, and the next feed read edits none (the bot's log and the posts' edited marks).
14. **`/help meetup`.** The Campfire sentence is a paragraph of its own.

## Cleanup

15. End the step's parties (`/delete`, Archive post), and leave the test server as it was.
