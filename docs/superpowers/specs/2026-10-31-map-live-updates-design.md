# Live updates on the map: design

Status: approved by Matt, 2026-10-31, after a builder's check against the code. Asked for by Matt on 2026-10-31.

## Why

The map asks for its two lists (`/api/parties`, `/api/stop-reports`) every 20 seconds while visible (`Poller`, `src/web/client/parties.ts`). So a change another member makes shows up to 20 seconds late, and an idle map still makes the server build that member's lists 6 times a minute. Matt wants changes to show almost at once, and they must behave well over the Cloudflare tunnel.

## Goals

- A change to a party or a report at a stop shows on other members' open maps in about 1 to 2 seconds while the server is quiet (a post's edit on Discord, then the page's random wait), and within one signal window plus one spread while it is busy.
- An idle open map asks for almost nothing.
- Everything keeps working, at today's 20 seconds, wherever the live connection does not (a quick tunnel, a proxy that buffers, a network that drops it).

## Not goals

- No party or report data on the stream: it only says that a list changed.
- No chat, presence or "who is looking".
- Nothing about panning: `/api/stops` and `/api/powerspots` stay as they are.
- No WebSockets. The map needs one direction only, and Server-Sent Events are plain HTTP that the session cookie, the CSP (`connect-src 'self'` governs `EventSource`) and Fastify already cover.

## Anti-goals

- The map must not get worse than today when the stream fails. Going back to polling is a normal path, not an error.
- A busy raid must not make every open map hammer the process that holds the Discord gateway.
- The bot's shutdown must not wait on open streams.
- A redraw must not change what a member is about to press.

## What Cloudflare means for this

- **Quick tunnels do not support Server-Sent Events**, by Cloudflare's documentation. A `trycloudflare.com` address gets polling only, carried by the fallback with no setting.
- **The proxy read timeout is 100 seconds** below Enterprise (error 524), so the stream sends something well inside that.
- **Proved on 2026-10-31 on `dev.example.com`** (Cloudflare's documents do not say; a probe answering as this route does, `var/stage/live-probe.mjs`, no bot and no Discord): a named tunnel delivers `text/event-stream` unbuffered (a ping every 2 seconds arrived one at a time, about 20 ms after it was written) and a heartbeat resets that timer (pings every 25 seconds, still open at 150 seconds).
- A tunnel's restart or Cloudflare's maintenance drops connections at any moment: reconnecting is routine.

The design trusts none of this to hold. The page counts itself live only while heartbeats actually reach it, so a buffering proxy, a blocked stream and a silent drop all end at 20-second polling.

## The stream

`GET /s/<guild>/api/live`, members only.

- **Who:** the per-address limit, then the session (401), then membership through the shared `viewers` (`guild-routes.ts`, which carries `memberRole`; `viewers.membership()` as `stop-routes.ts` uses it: 403, 503). Each is a normal HTTP answer before the stream opens. The page opens the stream with the pollers, so logged-out visitors earn no 401s.
- **How it is sent:** `reply.send(passThrough)`, not `reply.hijack()`. Hijack skips `onSend` (the security headers), headers set on the reply, and the cookie writer, so a session renewal landing on the stream would write the row and lose the cookie. Fastify sends headers at the first data, so the first `ping` is written before `send`. Cleanup hangs on the PassThrough's `close`, one path for both ends.
- **Headers:** `content-type: text/event-stream`, `cache-control: no-store, no-transform`, `x-accel-buffering: no`, and the rest as every answer.
- **Events:**
  - `event: changed`, `data: parties 4000` or `data: stop-reports 4000`: the list and the spread in milliseconds (below).
  - `event: ping`, `data: 4000`, the spread alone, at once and then every 25 seconds. A real event rather than an SSE comment, because `EventSource` hides comments from the page.
- **Lifetime:** closed by the server after 30 minutes, with up to 5 minutes of jitter. The page reconnects, and that is what asks the session and membership again, so someone who lost access stops getting signals with no per-connection state.
- **Caps:** 8 open streams per address, 4 per member, in plain `Map`s deleted at zero (a `BoundedMap`'s eviction would lose a live count), plus one overall cap of 2,000. A 429 beyond them. The checks and the registration happen in one turn with no `await` between, and a client already gone (`raw.destroyed`) is not registered.
- **Opening:** `LIVE_PER_MINUTE`, 30 per address. The page never reopens within 20 seconds of opening, so a phone switching apps cannot run this up; it polls meanwhile, as today.
- **What it leaks:** a member barred from a forum learns that "something changed" somewhere in the server, and when. Accepted.

### Where the signals come from

One hub, `LiveSignals` (`src/web/live-signals.ts`). The party listener gives a row number and stop reports give a snowflake, so the route resolves `idFor` at open, as `ownParties` does, and the hub keeps row to snowflake. With no stream open nothing needs signaling.

- **Parties:** `PartyStore.onChange` (synchronous, must not throw: the hub marks and returns). An active party's change is **not** signaled at once: a popup draws the post by `postKey`, and the Discord edit is usually still under way, so a map asking now gets the old post and has to wait a whole window for the new one. It is marked pending; `PartyService.keepLayout` flushes it at once, and a timer of 1.5 seconds flushes it if no draw comes. An ended party signals at once.
- **Posts:** `keepLayout` (the only `shownLayouts.set`, `party-service.ts`) is a new hook. It runs for draws that send nothing new, so it signals only when `postKey(layout)` differs from the kept one, or when flushing a pending change.
- **Reports:** a new listener method on `StopReportService`, `listChanged?(serverId)`, called from `reportResearch`, `reportRocket` (reported and refined in place), `takeBack` and `restore`. Not `changed`: that is not told of grunts and `StopPostService` relies on its meaning. Also after a grunt message's link is stored (`rocket-reports.ts`) and after a draw of "Today's Stops", since the view shows those links.

No domain fact is decided here: a signal only says "ask again", and the fetch goes through the existing routes and `PartyViewers`.

### What is left to other paths

| What changes | Reaches a live map by |
|---|---|
| A raid's hatch or end, a train, meetup or max past its end | the page's own timer (below), at the moment; a store write signals up to 60 s later (`tick.ts`) |
| A report's end, a grunt's minutes | already drawn by the page (`atNextEnd`) |
| Research period, event window, `waiting` | the 2-minute poll |
| A square picture ready, roles and `barred` (kept 60 s), `readOnly` flipping back | the 2-minute poll |
| A party whose row vanished (not announced) | the 2-minute poll; rare |

### Keeping a busy server calm

- **The server sets the pace (Matt, 2026-10-31):** per server and list, one signal per window: the first after a quiet spell at once, later ones merged to the end of the window, which is `Coalescer`'s rule (`src/services/coalescer.ts`), keyed by server and list. Every stream of a server gets the same signals, so this caps each client with no per-client state.
- **The window grows with the crowd, up to today's 20 seconds:** one second per 10 open streams of that server, at least 5 seconds and at most 20. Up to 50 maps: 5 seconds. 200 maps and more: 20 seconds. As averages, that holds asks at about 10 a second per list up to 200 maps, and past that a map asks as often as it does today, so the average load is no worse than today's polling. The peak is another matter, and is what the spread below limits. The lag can be worse than today's at the top end: at 400 maps and more, a merged change can take the 20-second window plus the 20-second spread.
- **The spread grows with the crowd too (2026-10-31, the controller):** the window limits how often signals go out, but after each signal all N maps ask, and a fixed wait of a second would put 200 asks of a list in that second where polling spreads them over 20. So the server sends a spread with every `changed` and every `ping`: `max(1 s, open streams of the process * 50 ms)`, at most 20 seconds, since one process answers every server, whereas the window stays per server. 1 second up to 20 maps, 2.5 at 50, 10 at 200, 20 from 400: a peak of about 20 asks a second per list, up to 400 maps, while one server's signal goes out. That is the lists alone: the posts a list changed are asked for inside the same spread and add to it, by as many posts as changed. Several servers' signals at once add up, and past 400 maps the peak grows with the maps. Why 20 (Claude's call, 2026-10-31, from a measurement): one ask of each list cost about 19 ms of the thread that holds the gateway on a loaded laptop, without the database. Keeping the boss list and the parties' looks brought that to about 8 ms, so 20 a second is about 16% of a thread and 50 about 40%. It stays at 20 because posts add to it, the database is not counted, and real load is not known yet.
- **On the page:** a signal asks after a random wait of up to the spread it came with, so that maps do not ask in the same instant. A signal arriving while one waits keeps the earlier timer: it neither restarts the wait nor adds an ask. A press's own `poller.now()` stays immediate. The posts a signal's list changed are asked for inside the same spread, what a popup or card shows at once (the first list of a visit and a press's list as before).
- **Member look-ups (the review's D2):** a signal makes every map ask, and where the answers have run out each ask would be a forced request of Discord. An answer is kept 60 to 90 seconds, at random per entry, and the fresh fetches of a page's lists, posts and stream wait in a queue (`PacedMembers`): at most 20 a second and one at a time, the next when the last has settled (or after 5 seconds, so that one stuck in a 429's sleep does not stop it), first in first out, one per member. One at a time because discord.js runs one server's member requests one after the other, so a pace of starts alone would only move the backlog into its queue. Presses, `/api/me` and Discord's handlers do not wait in this queue, only behind the one paced request on its way; what they fetch releases whoever waited for the same member. Whether to keep serving a stale answer while one is fetched is Matt's decision, not made here.
- **Limits:** 5 seconds is 12 asks a minute per list per page. `PARTIES_PER_MINUTE` and `STOP_REPORTS_PER_MINUTE` go from 30 to 120, for mobile carriers and venue Wi-Fi: about 8 live pages and 8 polling ones behind one address. `POSTS_PER_MINUTE` goes from 120 to 480, keeping its ratio to the lists; a refused post is asked again at the next draw.

### What an ask of the parties costs (Matt, 2026-10-31)

An ask of `/api/parties` builds every party's view, so a server's quiet parties should cost almost nothing. Measured on the 100 parties of the load test, about nine tenths of an ask was one call: `raidLook` of `PartyService.view`, which works out the whole boss list three times per raid; stringify and hash came to about 5%. So what is kept is that, and not the views themselves:

- **`BossFeedService.bosses`** gives the very same list until the feed or the overrides change or an override runs out (raids only: a max battle's list reads the clock for its rows' days).
- **`PartyService.raidLookOf`**, in a `WeakMap` on the immutable party object: no cap, no timer, no invalidation. A changed party is a new object, and an ended one is freed. What else the look reads is compared at each ask: the stage by the clock, the gym's row, the boss list, whether the eggs are served.
- **The counts of a party** (`countsOf`, `party-view.ts`), by the same key: a big train's attendees are read once per change.
- **Group… for whoever is not signed up**, by the same key: it reads the member only for whether they are signed up, and a member who is has theirs built each time.

Everything that depends on the viewer or the clock stays computed at each ask, as does the serialized JSON: fragments per viewer class would save little more and could show one member's answer to another. The answer stays byte for byte an uncached build's. No fact is decided here: this keeps the output of the one shared path.

## The page

`LiveConnection` (`src/web/client/live.ts`), pure and tested over fake timers and a fake `EventSource`, as `Poller` is.

- **Live means heartbeats arrive.** Live from the first `ping` or `changed`, not live after 60 seconds of nothing. `open` alone does not count: a buffering proxy can send headers and then nothing.
- **Polling by state:** 2 minutes only while live AND the last answer was OK AND the list is not `readOnly`; otherwise 20 seconds, so that a 429, 503 or network failure is not left for 2 minutes.
- **Going not live:** the next ask waits `random * max(spread, 20 s)`, not at once: a restart drops every stream together, and this gives back polling's scatter.
- **`Poller` gains:**
  - `setEvery(ms)`: stores it; if a question is running or the page is not active, nothing more; otherwise cancels the timer and rearms at `max(0, askedAt + ms - now)`, asking at once at 0.
  - `setEveryScattered(ms, scatterMs)`: as much, but rearms at `random * scatterMs`, whatever the last question's age: going not live.
  - `signalled(jitterMs)`: its own timer, cleared by `now()`, checks `active()` (`now()` does not), and does not use `again`.
  - A `stopped` callback, so that a 401 or 403 found by polling closes the stream.
- **Going live asks once**, under the floor, at load, on show and after a reconnect, or a change between the last poll and the stream's open would wait 2 minutes. It waits a random time up to the spread of the `ping`, so that a bot or tunnel restart with every map reconnecting does not ask all at once. It comes the floor's rest plus a random part up to the spread, so that pages that asked in one instant do not come back in one. A page with no spread yet uses 1 second. A signal arriving meanwhile takes this wait's place, or a change would wait out the floor; the signal's ask serves for both.
- **Hidden or under the region editor:** the stream closes and the state drops to not live synchronously, before `activeChanged` reads the interval, in any listener order. On plain HTTP/1.1 this also keeps tabs from filling a browser's six connections per host.
- **Reconnecting:** by the page's timer. Every `onerror` calls `close()`, or the browser's own retry runs beside it. `EventSource` reports no status, so 401 and 403 are seen by the poller, at 20 seconds while not live. 5 seconds, doubling to 5 minutes, with jitter, starting over only after a stream that stayed live (its second ping arrived; otherwise a proxy that passes one ping and then buffers would reset the backoff forever). The first delay is random across its whole 5 seconds or more, not a small jitter on 5 seconds, so that reconnects spread out too. Nothing is shown to the member.
- **A quick tunnel:** never goes live and polls at 20 seconds. It retries about every 2.5 minutes on average, at most every 5, and each try may hold a stream for up to 60 seconds of silence.
- **A party's end:** one page timer at the next hatch or end in the list, plus a random wait up to the latest spread (many maps share one end), then an ask, mirroring `atNextEnd`. Without it those would wait up to 60 seconds against today's 20.
- **Redraws:** a redraw clears every layer and reopens the popup, and it will come up to four times as often. `select[data-group-pick]` returns to its first choice, and Join sends what it shows, so a member's picked group could change under them. The select's value is carried across draws by party. Staging also checks a tall popup's scroll, the phone card, route mode, and the cost on a phone.

## On the server: lifetime

- **A client gone:** the PassThrough's `close` removes the stream. A write refused by backpressure closes it: a slow reader reconnects rather than growing a buffer.
- **Shutdown:** `web.close()` would wait for open streams until `shutdown.ts` times it out at 3 seconds. Streams end in Fastify's `preClose`. The hub then has a `closed` flag, and a request already past the router answers 503, or it would hold the close.
- **Logging:** Fastify's `onResponse` does not fire for a dropped stream, the usual ending, so cleanup logs the same "web request" fields at debug with the duration when the response did not finish. No per-event lines.

## Accepted

- A draw already under way when a party changes flushes the pending change, so a map may read the old post; the next draw's key differs and signals again, up to a window later.
- A server without its row at the stream's open gets no party signals until a reconnect; the 2-minute poll covers it.
- `/api/live` waits in the paced queue with the lists and posts, and the queue has no cap. One fetch runs at a time, so its pace is at most 20 a second and in practice one per round trip (about 8 a second at 120 ms): 800 cold members or more can reach Cloudflare's 100-second timeout, and the page's own limit of 130 seconds covers about 1,000. That ask or stream fails and the page takes its normal fallback, which is polling and its reconnect.
- A soft TTL for list asks (an answer kept past its time while one is fetched) is not built, though Matt finds it acceptable. Refreshing at the entry's lifetime saves no calls, it does not help a restart or the thread, and it earns its place past about 620 maps on one server at a 120 ms round trip. It stays the next step for Discord's calls if staging shows it is needed.

## Testing

- `LiveSignals`: pending and flush, the window and its growth, one server's change not reaching another's streams, listeners never throwing, a fake write returning false. `setTimer` and `random` are deps, as in `Poller`.
- The route, over `inject` with `payloadAsStream: true` (`answer.stream()` yields events as written, `answer.raw.res.destroy()` is the client going, `await app.close()` runs `preClose`): 401, 403, 503, limits and caps, headers, first ping, a signal arriving, cleanup, shutdown, the session cookie on a renewal. Waits through a `Tally`, never real time.
- One real socket, on port 0 at 127.0.0.1 (as `start.test.ts`): `app.close()` resolves with a stream open, and headers arrive before any signal.
- `LiveConnection` and `Poller`: every rule above, by fake timers.
- `testing.md` and `webServerWith` get what they need.

## Order

1. The tunnel's proof: done (above). A quick tunnel was not tried: its documents say no, and the fallback carries it either way; staging tries one.
2. The signals, then the page, then the limits and redraws.
3. **Staging:** two accounts: a raid changed in one shows in the other in 1 to 2 seconds; a grunt and a research report; a tab left an hour; hidden and shown; the tunnel restarted and the bot restarted with maps open; a phone locked and opened; a quick tunnel; 30 open streams against the caps, with the bot's load looked at. Log the member route's round trip, `X-RateLimit-Limit` and `waiting.size`.

## Docs

`docs/architecture/web.md` (limits, the map's data), `testing.md`, and the comments that say "every 20 seconds": `party-routes.ts`, `stop-routes.ts`, `parties.ts`, `party-layer.ts`, `stop-report-layer.ts`.

## Claude's calls, for Matt to object to

1. Server-Sent Events over WebSockets.
2. Doing this before the cutover, because Matt asked for it now, though the cutover does not need it. It adds no migration, and its failure mode is today's polling.
3. Heartbeat 25 seconds, not live after 60, slow poll 2 minutes, stream lifetime 30 minutes.
4. The window: 5 seconds, growing past 50 open maps (one second per 10 streams) up to 20 seconds at 200 maps, so a very busy server gets slower updates rather than a slower bot; its load is never worse than today's, its lag can be, at the top end (the window plus the spread).
5. Limits: lists 30 to 120 a minute, posts 120 to 480, streams 8 per address and 4 per member.
6. No setting to turn it off: the fallback covers a failing stream, and the growing window covers a working one under load. If load surprises us, the way off is a release. This is the call most worth a second look.
7. Pictures, roles, research periods and `readOnly` flipping back can take up to 2 minutes on a live map, against 20 seconds today.

## Sources

- Cloudflare, Quick Tunnels: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
- Cloudflare, error 524: https://1508fbba.preview.developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524
