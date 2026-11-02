# Staging checklist: the security pass before the cutover (8Z)

Every step needs Matt's go-ahead. Matt starts the bot and restarts the stack where a step says so. Claude drives the map and Discord in its own tab as Googer; Matt's hand is needed with Tester.

- **Accounts:** Googer (the owner, staff), Tester (a member with the map's role), and a moderator: a role named `moderator` on Tester, with and without Manage Messages, where a step says so.
- **Where:** the dev stack on the Air (`~/pine-dev.sh <command>`, `docs/guides/macos-host.md`) and its test server.
- **Writes:** the parties and blocks of the steps are made in a region of the test server, and ended or lifted afterwards. No migration and no command definition changes: no deploy of commands.
- **Settings:** `googleByHandPerMonth` is new, 500 unless set. Set it low on the dev stack (say 20), beside its low budget, before anything else: the two instances share one billing account.

## The Air: the socket proxy (item 9)

The proxy's rules, its linux/amd64 run and a 150-second stop were proved on the laptop's engine on 2026-11-01 with scratch containers (no bot, no secrets); its linux/arm64 image exists. What only a real stack shows:

1. **The update.** `sh ~/pine-dev.sh update`. `sh ~/pine-dev.sh status`: a new service `docker-proxy` runs, and `watchdog` runs, with no `/var/run/docker.sock` among its mounts (`docker inspect <project>-watchdog-1`).
2. **The arm64 image.** `docker image inspect wollomatic/socket-proxy:1 --format '{{.Architecture}}'` on the Air says `arm64`.
3. **The watchdog's user.** `docker exec <project>-watchdog-1 id -u` says `1000`. `sh ~/pine-dev.sh logs watchdog` says `watchdog started` with this stack's project, and no `could not ask Docker about the bot` afterwards.
4. **The socket from the Air's OrbStack.** `docker logs <project>-docker-proxy-1` shows no refusal of the watchdog's asks, and no failure to reach the socket (user 0 with no capabilities, where OrbStack's socket may be owned otherwise than a Linux host's).
5. **What it refuses, on the Air.** From a scratch container on its network: `docker run --rm --network <project>_docker-proxy curlimages/curl -s -o /dev/null -w '%{http_code}\n' -X POST http://docker-proxy:2375/containers/create` says `403`; so does `GET /containers/<project>-mysql-1/json`.
6. **What it told, written.** Make the watchdog tell something (stop the backups' status to the point of a warning, or wait for the backups-off message on the dev stack): `docker exec <project>-watchdog-1 ls -l /watchdog` shows `watchdog-state.json`, owned by `node`; restart the watchdog: the DM does not come twice. It may come once more on the first start, since what it told before stays behind in `/ops`.
7. **A stuck bot restarted, for real.** In a window Matt chooses: make the bot's heartbeat stale, as the staging of 9A did (`docker pause` will not do: a paused bot runs no health check). After `WATCHDOG_UNHEALTHY_MINUTES` the watchdog restarts it through the proxy and DMs the owner `the watchdog restarted it`.
8. **The rehearsal stack's name.** On a stack with another `COMPOSE_PROJECT_NAME`: its proxy's `SP_ALLOW_GET` names that project (`docker inspect … --format '{{.Config.Env}}'`), and its watchdog sees its own bot alone.

## Discord and the map

### Meetups after approval (item 1)

9. **The rule on Discord.** In a meetup made by Tester, Googer without staff (or a third account) uses `/name` and `/info`: refused in plain words. Tester's own work; a moderator's too, without a sign-up. A train's `/name` still works for anybody in the post.
10. **The block.** Block Tester from a request's post, with a meetup of Tester's whose closing is made to fail, or block by hand in the database: Tester's `/name` and `/info` are refused with Appeal…; a form open since before the block is refused at Submit with the text given back; the map's Manage… is refused for the name and the information, and takes the times.
11. **The moderators told.** Tester's meetup at a pin, approved once. Tester renames it and changes its information from Discord, then from the map: a message for each in the moderators' channel, with who, the new text, Go to post and Go to request (both open the right place). Staff's own change is told too. A meetup that needed no approval tells nobody. Names and information with markdown, a link and `@everyone` show as plain text.
12. **The safety off.** With no `channels.moderation`: `/name` and `/info` still follow the rule, nothing is told, and no error is logged.

### Pins in `/wild near:` (item 2)

13. **Blocked.** Tester blocked: `/wild near:` with a maps link is refused, uncounted, naming the way out; `near:` a gym, or none, reports. On the map, Tester's every spawn report is refused with the map's words. Lift the block: all work again. Another member's pin works throughout.

### Role-gated forums (item 3)

14. **The guides' words.** Read `docs/guides/new-instance.md`, section 7, and the legacy guide's "After the move": what they say of a role-gated forum matches what Join does on the test server (`@everyone` denied, a role allowed: Join opens it to a member without the role; a deny on a role they hold: refused).

### Group pings (item 4)

15. **One ping in five minutes.** A raid with several members who allow group mentions. `/group new`: they are pinged. Within five minutes, Group… opens another: its sentence is posted, without mentions, and the group is there. Five minutes after the first ping: pinged again. Another party is not held by it.

### Floods (item 5)

16. **A split in `/train`'s limit.** As a member: split a group off (Split…): done. `/train` once: done. Split… again: refused before the dialog opens, "You can use /train again in …". On the map the form says "You can do that again in …". A refused Submit (the groups changed meanwhile) gives its use back.
17. **Staff too.** As Googer without being the owner, or a moderator: the third split in 15 minutes waits. The help of `/group split` says so.
18. **Five open.** Tester with five open trains and meetups (a pin's meetup waiting for a moderator among them): `/train`, `/meetup`, Split… and the map's forms are refused in one sentence, uncounted. A moderator approving Tester's waiting meetup still works. A moderator is held to no cap.

### Map and login load (item 6)

19. **The writes.** On the map, laying a route at full speed for a minute: past 60 writes the answer under the route mode says "That was a lot of changes in a minute", the mode stays open, and a moment later it works.
20. **The editor.** Logged in as an account that is no member of the server: the region editor's address answers 403, and the bot's debug log shows no member fetch beyond the directory's.
21. **Logging in.** Log in with Discord twice within a second from two browsers: one gets `?login=failed`, and the log says `exchange: busy`; a moment later it works. An address `/auth/callback?code=<200 characters>&state=…` from a started login fails without asking Discord (the log says `bad code`).

### Google by hand (item 7)

22. **The cap.** With `googleByHandPerMonth` at 2 on the dev stack: `/gym refresh` twice: fetched. A third: "I did not ask Google…", with when it starts again, and the gym unchanged. `/gym add` or `/gym move`: done, and the gym waits in the line (`/gym google` counts it). `/gym google` says "2 of 2 lookups by hand are used this month." Put the setting back.
23. **The throttle.** The eleventh `/gym refresh` within ten minutes: "You can use /gym refresh again in …".

### The map's Delete… (item 8)

24. **Manage Messages.** Tester with the role `moderator` and without Manage Messages: no Delete… in a party's post on the map; `POST …/close` by hand is refused. Give Manage Messages: within a minute or two Delete… shows, and works. Googer, the owner, has it whatever the roles.

### The watchdog without Docker (item 9)

25. **The owner told.** On the dev stack, `docker stop <project>-docker-proxy-1`. `sh ~/pine-dev.sh logs watchdog` says `could not ask Docker about the bot` at each look. After `WATCHDOG_ALERT_MINUTES` (15) the owner gets one DM, "The watchdog cannot reach Docker …", and no second one. `docker start <project>-docker-proxy-1`: the log is quiet again. Stop it once more for the alert time: a new DM (at least 15 minutes after the last). Start it.

## Afterwards

26. **Cleanup.** The block lifted, the settings back, the parties ended, the proxy running.
