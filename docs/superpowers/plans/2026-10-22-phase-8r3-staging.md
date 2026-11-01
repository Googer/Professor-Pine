# Phase 8R-3 staging checklist: reports at stops on the live map, the server side (draft)

Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord and the map in its own tab. Accounts: Googer (owner, staff) and Tester (a member). The design is `docs/superpowers/specs/2026-10-21-stop-reports-design.md`, section 8; the conventions are `docs/architecture/web.md` ("Reports at stops on the map (plan 8R-3)"). **The page has no stop report feature yet** (the plan is the server side only): the steps call the routes from the browser's console on the map page (`https://<public url>/s/<guild>/map`), logged in, so the session cookie and the origin are the page's.

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

1. **Stage after (or with) 8R-1 and 8R-2** (migrations 027 and 028; the commands deployed for them). 8R-3 has no migration and no command change: no deploy of its own. Note in `var/stage/TEST-SERVER-STATE.md` that 8R-3 is being staged.
2. The task list and the lineups read at start (the log), the web server listening.

## The data

3. `await get('research-options')`: 200, every task of Leek Duck's page (more than 25), each with `key`, `text`, `category`, `rewards` (pictures that load); `stale` false, `readAt`; `rewards` of items and Mega Energy. `await get('rocket-options')`: `/rocket`'s choices in its order, `hideout` true for Cliff, Arlo, Sierra, Giovanni and the decoy, Giovanni's `note`. A private window (logged out): 401.
4. `await get('stops?south=…&west=…&north=…&east=…')` over a test region: PokéStops by key, a stop of Pine's own (`/pokestop add`) as `pine-<id>`.
5. Report research with `/research report` and a grunt and Arlo with `/rocket report` in Discord; then `await get('stop-reports')`: `research` (task, rewards, the stop's snapshot, `reporter` as a name, never an id or `**`, `link` to the pinned post's message), `grunts` (catches, `endsAt`, `link` to the grunt's message), `hideouts` (Arlo, the post's link), `mayTakeBack` true for one's own; the second time with `If-None-Match` of the first answer's ETag: 304. **Watch the bot's log during the polls: no edit of the pinned post** (a GET draws nothing).
6. Under an event's window (Community Day, if one is on; else skip, the tests cover it): the day's research is not in `research` but counted in `waiting`, with `event`.

## Who sees what

7. Tester kept out of East's forum (an overwrite): the list leaves out reports at East's stops, a stop in East and a visible region still shows. `/api/stop-reports` as a member without `settings.web.memberRole` (if set): 403.

## Reporting from the map

8. Tester: `await post('research', { task: '<a key from step 3>', stops: ['<a stop key>'] })`: 200 with `text` and the report; the pinned post shows it, a member with a want of its reward gets the DM, as from `/research`. The log line names the stop key, not a text.
9. **Same task at more stops:** `post('research', { sameAs: <its id>, stops: ['<two more keys>'] })`: reported at them with the same task (also a typed task with its reward); `sameAs` of a taken-back report: 409 "That report has ended…", uncounted. `task: 'typed:…'`: 422, nothing stored.
10. **Rocket:** `post('rocket', { who: 'grunt:dragon', stop: '<key>' })`: 200, the grunt's message in the region channel, the DM to a Dragon want; the same again: 409 "Already reported" with the grunt and its link. At Arlo's stop: 422 with the question and `asks.replacing`; sent again with that `replacing`: 200, Arlo gone from the post, the grunt posted.
11. **Taking back:** `post('stop-reports/<id>/remove')` on one's own report: 200 "Took back …", the post redrawn, the grunt's message deleted; on somebody else's as Tester: 403; as Googer: 200; an id of nothing: 409.
12. **Throttles:** reports on the map and `/research report` / `/rocket report` count together (`settings.research.throttle`, `settings.rocket.throttle`): the use over the limit 429 on the map after uses in Discord, and the other way round. Refusals (the hideout question, `TASK_LIST_CHANGED`, a stop of nothing) count nothing.

## After

13. Take back what was reported here; note in `var/stage/TEST-SERVER-STATE.md` what was staged; record the results in the follow-ups ("From the staging run of 8R-3").
