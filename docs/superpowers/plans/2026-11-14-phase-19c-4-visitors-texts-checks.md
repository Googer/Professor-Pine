# Phase 19C-4: The Visitors' View, the Texts and the Checks: Implementation Plan

**Goal:** the last of plan C's sub-plans in the 2.1 design (`docs/superpowers/specs/2026-11-12-multi-server-instance-design.md`, goal 10, "The web", "Legal", "Discord's verification and the public switch"; Matt, 2026-11-12: "Go for it all"). On an open instance a server's map is closed to visitors who are not logged in unless its staff open it, and a closed server, one in setup and one being deleted answer the web exactly as a server Pine is not in. `cutover-check` warns where Public Bot and `servers` disagree and counts the bot's servers at any number. The Privacy Policy, the Terms of Service and the guides say what 2.1 does. With 19C-3 and 19C-4 merged, a release may ship again.

- **Task 1, a server's map closed to visitors unless its staff open it:** the server value `publicMap` and one rule, `publicMapOn(values, { open })` (the staff's choice, else closed on an open instance and open on any other; Pittsburgh's servers, which never chose, keep their public view); its switch in `/admin settings` (Keep on / Turn off while on the instance's default; shown only where the instance has web pages); `webServers` (one rule for the web: present, not left, not being deleted, and open to visitors or asked by a session) and `hiddenFrom`, which every address of a server and the login links ask first, after reading the session for every request alike; one "Not found." page for every server address (a `/maps` link lasts five minutes; log in with Discord). Byte-for-byte tests of every address, without and with a made-up cookie, with and without the client secret, against an unknown server.
- **Task 2, `cutover-check` compares Public Bot with `servers`, and pages through the servers:** a `public-bot` line; the servers line pages `/users/@me/guilds` and compares with the servers Pine records (left, deleted, being deleted, refused, new), failing where the bot would keep none of the database's servers.
- **Task 3, the Privacy Policy and the Terms of Service for 2.1:** the operators and the servers' staff and what each sees; what is a server's and what a member's; the setup state; leaving, the 30 days and what is deleted and what stays; a server's share of the operator's services; `DmContact`; the visitors' view.
- **Task 4, the guides and the docs** (`new-instance.md`: the `servers` setting's three meanings, Public Bot, `publicMap`, "A public Pine" in the spec's order; `migrating-a-legacy-instance.md`; `web-setup.md`; `web.md`, `servers.md`, `operations.md`, `testing.md`; the follow-ups: the release hold lifted).

**Tech stack:** TypeScript 6.0, discord.js 14.28.1, Kysely, MySQL 9.7, Vitest.

**Brief:** `.superpowers/sdd/19c-onboarding/brief-19c4.md`; fix rounds `19c4-fix-round-1.md` to `19c4-fix-round-3.md` and the rebase `19c4-rebase.md` there; ledger `progress.md`.

**How it was built.** Prototyped on `proto-19c4` from main-dev a82e5f596 (19C-2), beside 19C-3. An Opus review (3 Important: a known server read the session where an unknown one did not, so timing told them apart; cutover-check wrong of a new install with Public Bot on; the setup case not tested byte for byte; 6 Minor), folded (fix round 1); a re-review (ready; 2 Minor, folded in round 2); rebased onto 19C-3 with where the two meet (a server being deleted hidden through `webServers`, cutover-check's deleted servers, the Privacy Policy checked against the merged deletion); a review of the rebase (2 Important: the region editor showed other servers' outlines the policy denied, a guide still kept a removed server's data for good; 5 Minor), folded (round 3). The reviewed commits are the plan's commits (no transcription).

| Task | Commit | Title |
|---|---|---|
| 1 | `dd267cf1f` | 19C-4 1: a server's map closed to visitors unless its staff open it |
| 2 | `e1f8f8761` | 19C-4 2: cutover-check compares Public Bot with servers, and pages through the servers |
| 3 | `845940ece` | 19C-4 3: the Privacy Policy and the Terms of Service for 2.1 |
| 4 | `1c2f811b4` | 19C-4 4: the guides and the docs of the visitors' view and the checks |

On the tip: `npm run check`, `npm run build`, `npm run test:db`, one at a time, each judged by its exit status.

## What staff and members will notice

On Pittsburgh's instance (servers listed, not open) nothing: its map stays public. `/admin settings` gains "Map for visitors who are not logged in". A link from `/maps` that has expired ends on a page that says so and offers the login. The Privacy Policy and Terms are dated 2026-11-14: **Matt reads them before the next release.**

## Staging

With all of phase 19 (Matt, 2026-11-13), on the Air's dev stack:

1. Logged out, the test server's map opens; `/admin settings` → Turn off: logged out it answers "Not found." as an unknown server id does; logged in as a member it opens.
2. `./pine cutover-check` (Matt's go-ahead): the `public-bot` line agrees with the dev application's Public Bot and `servers`; the servers line names the test servers.
3. Read `docs/legal/privacy-policy.md` and `terms-of-service.md` as published by the instance's page.
