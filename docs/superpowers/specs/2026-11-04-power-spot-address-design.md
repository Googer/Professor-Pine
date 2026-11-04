# A Power Spot's address on the map

Matt, 2026-11-04: the map's place popups open alike (name, address, distance, Directions), but no Power Spot has an address to show. Wayfarer's export gives PokéStops theirs; it gives Power Spots none (none of 15,956 in the laptop's copy, none of 86 near Verona on the Air), and the Google line asks a Wayspot's nearby places, not its address. Matt: look one up when it is needed and there is budget left, within Google's free use. Reviewed 2026-11-04 (questions settled below; Matt chose a cap of 100 a day per member).

## What a member sees

- A Power Spot's popup opens as today: its name, then the address once one is known, distance and Directions, then its controls.
- One whose address is not known yet asks the server for it as the popup opens, whichever way it opens: its dot, Find's results and the list of what is on (`spotHead`), and a spot whose battle's popup opens in its place. One client helper does the asking for all of them. The line is drawn in place when the answer comes, if the popup is still open; nothing is shown while it waits, and nothing at all when no address comes (no budget, the member's day used, Google refused or found none).
- The page keeps the answer in the tuple of its last list (`places-ui.ts`, `last`), so the next popup of that spot has it at once; and `/api/powerspots` gives a kept address as its fifth item, as a PokéStop's.

## One address for every reader (one path)

- A Wayspot's address line comes from one function for every caller: the Wayfarer address (`wayspotAddressLine`) where there is one, else the kept looked-up address of a Power Spot, worded as a gym's (`addressLine` of its parts). The map's lists (`wayspot-box.ts`), Find (`place-finder.ts`), the moderators' report (`moderation-reports.ts`) and a max battle's post (`max-post.ts`) all call it.
- A kept address counts only while the spot is within `WAYSPOT_MOVED_METRES` (10) of where it was asked; farther, it is not shown and the spot may be asked again.

## The server

- `GET /s/<guild>/api/powerspots/<id>/address`, members of the server only (`memberOrFailure`, as `/api/powerspots`), limited per address as the Power Spots' list is. It answers `{ address: string | null }`.
- It asks Google only for a Power Spot of a region of that server (`WayspotDirectory.byId`), not kept where it is, not set aside, while the month's geocodes leave room and the member's day has lookups left (below). One question per spot at a time: a second ask while one is out waits for the same answer.
- A new service keeps the answers (`WayspotAddresses`: repository and memory twin, both running shared cases `wayspotAddressCases`), loaded at start into memory so that the lists stay synchronous, and written through on each answer. Table `WayspotAddress` (migration 035, additive): `wayspotId` (primary key), `lat`, `lon` where it was asked, `geodata` (the geocode's parts as JSON, as a gym's; null for none found), `askedAt`. A spot that became a gym or was forgotten keeps its row, ignored.
- Google found no address: kept as none, not asked again for 30 days. The question failed: not kept, the spot set aside in memory until the next Pacific day, as the line sets aside a gym (`asideGyms`). `denied` and `no-key`: nothing asked, nothing counted. The address is never logged.

## The budget

- Every reverse geocode that reaches Google counts as a `geocode` in `GoogleUse` (a failure too, by the same rule as the gyms' `fetchGeodata`), so gyms, the line and these share one monthly count of Geocoding (`googleGeocodesPerMonth`).
- The rule is pure, in `lineAllowance` (`src/domain/geo/google-line.ts`): a new field says whether a Power Spot's address may be asked, true while the month's geocodes are below `googleGeocodesPerMonth − googleGeocodesReserve`. New setting `googleGeocodesReserve`, default 500, at most `googleGeocodesPerMonth` (the settings refuse more); the last 500 stay for gyms. `/gym google` says the reserve.
- **Per member (Matt, 2026-11-04):** at most 100 new lookups per member per Pacific day, counted as soon as one is on its way (as `takeByHand`). Past it, the route answers null and asks nothing; addresses already kept still show. Kept in memory (a `BoundedMap` by server and member for the day); a restart forgets it, which costs at most one more day's 100.
- The dev instance shares the billing account; its stage settings have 50 geocodes a month, so its reserve is set to 10 there.

## Left out

- Addresses for Power Spots nobody looks at (no batch in the line: 16,000 spots would eat two months of geocodes).
- Looking up from Discord: a max battle's post shows a kept address, but nothing on Discord asks for one.

## Defaults chosen without Matt (to object to)

- The reserve of 500 geocodes for gyms; 30 days before asking again where Google found nothing.
- Nothing shown while waiting, rather than "Looking up the address…".
