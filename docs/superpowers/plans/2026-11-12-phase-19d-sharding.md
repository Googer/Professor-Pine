# Phase 19D: Sharding in One Process: Implementation Plan

**Goal:** plan D of the 2.1 design (`docs/superpowers/specs/2026-11-12-multi-server-instance-design.md`, "Sharding"; Matt, 2026-11-12: "Go for it all"). Pine connects as many gateway shards as Discord asks for, in one process; the health check, the gateway watch, the catch-up and the start-up work are right with several shards; an instance with one shard behaves as before.

- **Task 1, shards on demand:** `createClient` sets `shards: 'auto'`; what discord.js 14.28.1 does at login (`GET /gateway/bot`, `max_concurrency`, close code 4011, `ShardReady` and `ClientReady`) is written in `operations.md`, "Shards".
- **Task 2, health with several shards:** one pure rule (`gatewayHealth`): connected unless every shard is away, or one has been away past a 3-minute grace (a shard not yet up at the login gets its identify slot on top); "down since" backdated to when the rule tripped; the heartbeat file's `gateway.shards` (`up`, `total`, `late`); the health line says the shards only when there are several. One shard: as before.
- **Task 3, the gateway watch per shard:** time away, acknowledgement and errors per shard; error kinds said once per process; `GatewayBack` carries the shard and why the return is real (`time`, `errors`, `session`); `catchUpOnReturn` asks the whole catch-up at each real return, but with several shards one real only by a new session asks at most once per 10 minutes.
- **Task 4, start-up work per shard:** `ShardReadiness` (each shard's ready with its servers, those Discord said unavailable, and those gone since the shard's last session, from a snapshot taken at the READY packet); `syncGuilds` at every ready, in chunks of 500 (`GuildStore.ensureAll`); servers missed between two shards' readies at the login recorded at `ClientReady`; meetup safety's warnings and the standing spawns at a shard's first ready; the hook `onEveryShardReady` for plan C's checks of who is in.
- **Task 5, docs:** `operations.md` ("Shards", the health rule, the log lines, "Several processes": not built and what would change), `testing.md`, `meetup-safety.md`, the spec's catch-up sentence.

**Tech stack:** TypeScript 6.0, discord.js 14.28.1 (`@discordjs/ws` 1.2.3), Kysely, MySQL 9.7, Vitest.

**Brief:** `.superpowers/sdd/19d-sharding/brief.md`; fix rounds `fix-round-1.md`, `fix-round-2.md` there; ledger `progress.md`.

**How it was built.** Prototyped on `proto-19d` from main-dev fd2c6f421, one commit per task; an Opus review (2 Important: a server added between two shards' readies at the login got no row; the readiness hook would have taken a server that left while its shard was away for present; 4 Minor: unbounded `syncGuilds`, many shards at the login tripping the health check, a catch-up at every routine new session, shard errors said per shard), fixes folded into the task commits, a re-review (1 Important: a server joining between a READY and its ready taken for gone; 2 Minor), fixes folded again. main-dev had not moved, so the reviewed commits are the plan's commits as they are (no transcription): branch `phase-19d`.

| Task | Commit | Title |
|---|---|---|
| 1 | `16bcb5a01` | 19D 1: shards on demand |
| 2 | `d3c090d9f` | 19D 2: health with several shards |
| 3 | `5700dfeb1` | 19D 3: the gateway watch per shard |
| 4 | `04284ec17` | 19D 4: start-up work per shard |
| 5 | `d21436533` | 19D 5: docs of the shards |

On the tip: `npm run check`, `npm run build`, `npm run test:db`, one at a time, each judged by its exit status.

## Staging

On the Air's dev stack after `./pine update` (no deploy, no migration). One shard, as every instance has today; several shards cannot be staged without 2,500 servers.

1. The start: "connected to Discord" with `shards: 1`; the health line as before (`./pine status`); the heartbeat file has `gateway.shards` `{ up: 1, total: 1, late: 0 }`.
2. A network outage of over a minute (Wi-Fi off on the Air, or `docker network disconnect` of the bot's network): "discord shard error" once per kind, then "discord gateway back" with `shard: 0`, `real: 'time'`, and a catch-up in the log; the health line unhealthy only after the usual time.
3. A server added while the bot is down (the test server's second server, if there is one, or skip): its `Guild` row exists after the start.
