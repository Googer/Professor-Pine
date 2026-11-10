# Phase 8X-5 staging checklist: max battles on the live map, the server side (draft)

Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord and the map in its own tab. Accounts: Googer (owner, staff) and Tester (a member). The design is `docs/superpowers/specs/2026-10-20-max-battles-design.md`, section 7; the conventions are `docs/architecture/web.md` ("Max battles on the map (plan 8X-5)"). **The page has no max battle feature yet** (the plan is the server side only): the steps call the routes from the browser's console on the map page (`https://<public url>/s/<guild>/map`), logged in, so the session cookie and the origin are the page's. The page's part is staged with its own plan after the map's staging decides the page.

In the console, once per page:

```js
const guild = location.pathname.split('/')[2];
const { csrf } = await (await fetch(`/s/${guild}/api/me`)).json();
const get = (path) => fetch(`/s/${guild}/api/${path}`).then(async (r) => [r.status, await r.json()]);
const post = (path, body) =>
  fetch(`/s/${guild}/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pine-csrf': csrf },
    body: JSON.stringify(body ?? {}),
  }).then(async (r) => [r.status, await r.json()]);
```

## Before

1. **The shared dev database.** No migration and no party state change in 8X-5; it builds on 8X-4 (state 14, migration 026) and 8X-3 (max battles): stage it after or with those. Check `var/stage/TEST-SERVER-STATE.md` and note that 8X-5 is being staged. No command changes: no deploy needed beyond 8X-3's and 8X-4's.
2. Between 06:00 and 21:00 (max battles are refused after the last battle time), with a max boss list loaded (`/admin boss` shows the max tiers).

## The data

3. `await get('powerspots?south=40.43&west=-80.02&north=40.46&east=-79.98')` (a box over the test region's park): 200, `spots` of `[id, lat, lon, title]`, nearest the middle first, `more` false; a box over nowhere: an empty list. A malformed box (`south` above `north`): 400. `get('stops?…')` with the same box still lists PokéStops only.
4. `await get('max-options')`: 200, the current max bosses in `/max`'s order (a featured boss first, Gigantamax last, or first in a big event's hours), each with `value`, `name`, `level` (`D2`), `tier` (`Dynamax 2★`) and a picture the page may load; the tier choices. Logged out (a private window): 401.
5. Report a max battle with `/max` in Discord; then `await get('parties')`: `maxes` holds it with its tier, boss, spot (title, location), end, the post's link, attendance with Done; `raids`, `trains`, `meetups` as before. The map page itself draws nothing new and nothing broken (look at a raid's popup: the same three buttons).

## Reporting from the map

6. `await post('maxes', { spot: '<a Power Spot id from step 3>', boss: '<a value from step 4>' })` as Tester: 200 with `text` and `max`; the post appears in the spot's region's forum as `/max` makes it, the end at the next rotation as `/max`'s; the log line "a max battle was reported on the map" names the spot, not a text.
7. The same body again as Googer: 409, it joins the battle (as `/max`'s second report does). Another boss at the same spot: 409 `taken`, the text names the post and says "Open its post and use /boss there to change its boss."; the same by a member kept out of that forum: 409 with the words but no `max` in the answer.
8. **A point:** `post('maxes', { lat, lon, boss })` within 50 m of a known Power Spot: the battle is at that spot. A point far from any spot: a pin battle, "Unlisted power spot", and the moderators' channel gets the pin battle notice. A point outside every region: 422 "That pin is not in a region of this server. Give a place in the regions here." (`PIN_NOT_HERE`, as `/max` says it; "That place is not in a region of this server. Pick a power spot on the map.", `MAP_NOT_HERE`, is only for a spot whose region outline moved off it meanwhile; checklist set right in plan 8X-F).
9. **Blocked at a pin:** with Tester blocked (8S-1's block), a new pin battle: 403 with `needs: 'listed-spot'`; joining an existing pin battle there: allowed (if that battle ends before the report is stored, the report is refused as blocked, never a new pin battle).
10. **A boss on no list:** a typed boss name the game master knows but no list names, without `tier`: 422 "Which tier? Pick the tier of this boss." with `needs: 'tier'`; with `tier: 'D3'`: reported. A name the game master does not know: 422 "I know no Pokémon called "…". Pick a boss from the list." with `needs: 'boss'`.
11. **Ending soon:** at a spot during a short max event, less than five minutes before a rotation: 422 with `soon.choices` (each with its `end`), counted nothing; sending the report again with `soon: { value, end }` of a choice reports it with that end, counted once; a `soon` with an `end` that has passed: "That battle has ended meanwhile: nothing was reported."; `soon` with a typed `end`: 400. (If no event is on, skip this step; the tests cover it.)
12. **The throttle:** twenty reports in fifteen minutes (`/max`'s throttle; the map's and Discord's count together), the twenty-first: 429. Refusals (taken, blocked, the tier asked, ending soon) count nothing.

## Remote and train kinds

13. `await post('parties/<a raid id>/remote')` as Tester, signed up: 200, the post shows Tester as remote; again: off. The same on a max battle, a meetup and a train (every post that has Remote); on an elite raid that refuses Remote: refused in the post's words. `get('parties')`: each party's attendance has `remote: { offered, on }`.
14. **A train's kind:** `post('trains', { region: <region id>, name: 'Map Wild Area', kind: 'gigantamax' })` (`region` is the region's row id, a number, as `get('geo')` lists it in `regions`, not its channel id; plan 8X-F): the post `### Gigantamax Train: Map Wild Area` with the `Max battle` tag. `get('parties')`: its `trainKind` `gigantamax`, `trainKindWords`, `may.kind` true for Googer while it has no route (`panel` null).
15. `post('trains/<id>/move/kind', { kind: 'dynamax' })` as its maker: "This train is a Max Battle Train now.", the post's heading and tags change, its log line; as Tester (not its maker, no rights): 403, uncounted. The log line "a train's kind was set on the map".
16. Add a Power Spot stop from the console (`post('trains/<id>/route', { drawn: [], add: { stop: 'w<spot id>' } })` or the body `web.md` gives): the route lists it as `<title> (Power Spot)`.

## After

17. End every party made here; note in `var/stage/TEST-SERVER-STATE.md` what was staged.
