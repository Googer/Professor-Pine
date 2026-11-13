# Phase 19B-1: Operators and Alerts: Implementation Plan

**Goal:** the first of plan B's five sub-plans in the 2.1 design (`docs/superpowers/specs/2026-11-12-multi-server-instance-design.md`, "The rule", "Operators", "Alerts and logs"; Matt, 2026-11-12: "Go for it all"). What every server shares (the boss lists' overrides and their sync, the event window, the image cache) is changed only by the instance's operators, through `/operator`, offered in servers and in direct messages; removing a member's data is `/operator forget`, for the instance operators alone. The owner is told of every change of shared data, by whom and from where. Pine's alerts about the instance go to the owner; what is wrong with one server's setup goes to that server's moderators' bot lab. A self-hosted instance (Pittsburgh's) keeps working as before for its staff, with the commands under their new name.

Plan B is cut into five sub-plans, built in this order: 19B-1 operators and alerts; 19B-2 gyms per server; 19B-3 Wayspots, the import and Google's answers per server; 19B-4 ids checked against their server, nicknames and gym requests per server; 19B-5 fairness (DMs, the screenshot reader, Google's shares).

- **Task 1, the settings and the tiers:** `operators` (Discord user ids) and `servers` (a list of server ids, or `"open"`) in the settings file; one pure rule of who is which (`src/domain/operators/tiers.ts`): the instance operators are `OWNER_ID` and `operators`; the shared-data operators are the instance operators and, on an instance not open to every server, a server's bot-management staff in their own server (only the listed servers' where `servers` lists them), never in a direct message; the guards `requireSharedDataOperator` and `requireInstanceOperator`, with their refusals.
- **Task 2, `/operator` and the moves:** a command group offered in servers and direct messages (Manage Server by default in servers), its guard on every use and every autocomplete; `boss` (add, hide, autoset, shiny, remove, sync, list), `event-window` (set, end) and `clear-image-cache` on the shared-data tier, `forget` and its controls on the instance tier, all moved from `/admin` with their behavior; `/admin nickname add|remove` on the shared-data tier until nicknames are a server's (19B-4); `/help` shows `/operator` only to its operators and `forget` only to the instance operators; times typed in a direct message are in the instance's default zone; the legacy role mapping follows.
- **Task 3, the owner told of every shared change:** the overrides and the window (as before), the sync and the image cache (new), and a member's data removed by another operator (never naming the member), with who and from which server, or "a direct message".
- **Task 4, alerts:** the raid-boss feed gone stale is a DM to the owner, no longer a post in every server's moderators' bot lab; `ServerNotices.tell(serverId, key, text)` posts a server's setup problems into its moderators' bot lab (the settings' names not found, meetup safety's moderators' channel gone or not postable, a forum Pine may not post in, the bot updates channel gone or not postable, the events forum gone or refused), at most once per server and key per start, told again at the next occasion when it could not be sent, never to an unavailable server; the screenshot boss-tier note gives the command only where the server's staff may run it, and on an open instance the operators are told instead; the boss syncs' shutdown in one step, the notices flushed with the direct messages.
- **Task 5, docs:** `servers.md` ("The operators", "Notices to a server's staff"), `operations.md`, `notifications-and-dms.md`, `discord-framework.md`, `members-and-roles.md`, `moderation.md`, `utilities.md`, `testing.md`, `meetup-safety.md`, the guides, `.env.example`.

**Tech stack:** TypeScript 6.0, discord.js 14.28.1, Kysely, MySQL 9.7, Vitest.

**Brief:** `.superpowers/sdd/19b-separation/brief-19b1.md` (with `split.md` and the surveys); fix rounds `19b1-fix-round-1.md` to `19b1-fix-round-3.md` there; ledger `progress.md`.

**How it was built.** Prototyped on `proto-19b1` from main-dev 1624f4c9e, one commit per task. An Opus review (2 Important: the shared-data tier did not yet narrow to the listed servers; the screenshot boss-tier note named a command a server's staff could not run on an open instance; 10 Minor), fixes folded into the task commits; a re-review (1 Important: a notice to a lab that was gone counted as sent; 5 Minor), folded again; a last re-review (5 Minor: a real shutdown margin, the fake gateway's availability, no sends Pine may not make, the refusal's words, wrapping), folded again. main-dev had not moved since, so the reviewed commits are the plan's commits as they are (no transcription).

| Task | Commit | Title |
|---|---|---|
| 1 | `97ba45bcf` | 19B-1 1: the operators and servers settings, and the two tiers |
| 2 | `8e749fb60` | 19B-1 2: /operator, with what every server shares moved out of /admin |
| 3 | `8375761b4` | 19B-1 3: the owner told of every change of shared data, and from where |
| 4 | `53f82ddce` | 19B-1 4: alerts, the instance's to the owner and a server's to its staff |
| 5 | `583418594` | 19B-1 5: docs of the operators, /operator and the notices to a server's staff |

On the tip: `npm run check`, `npm run build`, `npm run test:db`, one at a time, each judged by its exit status.

## What staff and members will notice

- The boss list's overrides and sync, the event window, the image cache and `forget` are `/operator …` now, no longer `/admin …`. On Pittsburgh's instance its admins, moderators and bot developers may use `/operator` as they used `/admin` for these (except `forget`, the operators' alone); a server's per-command Integrations allowances for `/admin` do not carry over to `/operator`: staff set them again.
- Discord lists `/operator` in every member's direct-message command picker (it applies no permissions in DMs); anyone but an operator is refused there, and `/help` never shows it to them.
- The owner gets a DM for every boss sync, every image cache cleared, every override and window change made by someone else, every member's data removed by another operator, and the boss feed gone stale (no longer posted in the moderators' bot labs).
- A server's moderators' bot lab is told of its own setup problems once per start: a channel set in its settings that is gone, a forum Pine may not post in, the events forum gone or refused, meetup safety's moderators' channel gone or not postable.
- Shutting down has room again inside Docker's grace period (the two boss syncs stop in one step).

## Staging

On the Air's dev stack after `./pine update` and a global deploy of the commands (Matt's go-ahead; the commands change).

1. As Googer (the owner) in the test server: `/operator boss list`, `boss add` and `remove`, `event-window set` and `end`, `clear-image-cache`; `/admin` no longer has them; `/help` shows `/operator`.
2. As a moderator who is not the owner: `/operator boss add` works in the server; the owner gets the DM naming them and the server. In a DM with the bot the same is refused ("In a direct message only the operators of this Pine can do that.").
3. As Tester (no staff role): `/operator` is refused in the server and in a DM, its autocomplete is empty, `/help` does not show it.
4. With `operators: ["<Tester's id>"]` in `var/dev/pine-settings.json` and a restart: Tester may use `/operator boss list` in a DM; `/operator forget` shows to Tester in `/help`; a removal by Tester DMs the owner without naming the member.
5. Notices: delete the bot updates channel set in the panel (or deny Pine posting there), restart: the moderators' bot lab is told once; give the permission back: no repeat.
6. The stale feed: not reproducible by hand without breaking the feed; check the log and the owner's DM after the next real outage.
