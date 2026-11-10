# Phase 8X-1 staging checklist: lobby sizes and the group ping (draft)

Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Accounts: Googer (owner, staff) and Tester (a member). The dev bot is shared with other sessions: check and update `var/stage/TEST-SERVER-STATE.md` first. No migration. **`/shout` gains an option, so the commands are deployed again first** (Matt: `set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global`). The conventions are `docs/architecture/parties-and-posts.md` and `discord-framework.md`.

This checklist is run on a build that has 8X-1B too (plan `2026-10-21-phase-8x1b-buttons.md`): the posts have 8X-1B's layout of buttons, and a group nobody is in goes unless it has a label or a meeting time (pruning), so the steps below keep the groups they need alive.

No party has a lobby size before 8X-3 (max battles) and 8X-4 (Gigantamax trains): Join choosing a group and the `3/4 coming` line are not seen on Discord in this plan (`attendance.lobby.test.ts`, `party-post.lobby.test.ts`, `party-service.lobby.test.ts`). They are staged with 8X-3 and 8X-4.

## Today's parties are unchanged

1. As Tester, report a raid in a quiet region (raid R) and sign up Coming; as Googer, `/coming` in its post, then `/group new` (Googer, still Coming, is in group B now; Tester stays in A, so A is kept). The post, on the desktop and a phone: each group's heading is `**Group A** · 1 trainer` (`N trainers`; no `coming ·` and no `/20`), with its status lines under it (`🏃 Coming (1): Tester`, the line starting with its button's icon, the application's `pinejoin` where it has it, a status nobody is in has no line); no group has buttons of its own (no "Join A", "Join B"). The buttons are three rows at the bottom: row 1 Interested, Join, Here, Done, Leave, icons only; row 2 Meet… (its icon: the application's `pinemeet`, else ⏰; only while the raid has its times), −1, +1, Remote, icons only; row 3 Group…, then Set time (only while the raid has no times, in Meet…'s place) and Screenshot feedback (only for a raid reported from a kept screenshot).

## `lobbies.raid` in the split-up note

2. In `var/stage/settings.json` set `"lobbies": { "raid": 2 }` and restart the bot. In a second raid with one group (raid S), Googer `/coming` and Tester `/coming count:2`: the group shows "More than 2 trainers: a lobby holds 2, so split up." (3 heads). Set it back (remove `lobbies`, or 20) and restart: the note is gone for the same raid (the start draws the posts anew; if it is still there, any sign-up change in raid S redraws it).
3. A settings file without `lobbies` (the stage settings before step 2) loads as before; `"lobbies": { "dynamax": 0 }` is refused at the start with a message naming `lobbies.dynamax` (put it back).

## `/shout group:`

4. `/help shout`: the details mention `group`, and the second example is `/shout message:… group:True`.
5. In raid S (one group), Googer and Tester signed up: `/shout message:test group:True` is refused: "This raid has one group: `/shout` without `group` pings everybody."; nothing is said in the post (the refused use counts against the throttle, three in three minutes, as any refused `/shout` does).
6. Raid R with two groups (step 1). Tester allows shout pings (`/settings`, as Tester). Tester first gives group A a label, so that it stays once Tester leaves it: `/group label text:park side` in the post (A's heading reads `**Group A: park side** · 1 trainer`). Then both in group B: Tester `/group join letter:B` (or Group… and B). A is still there, empty (`**Group A: park side** · 0 trainers`, "Nobody yet"). Googer `/shout message:lobby now group:True`: the post says "**Googer** … to everybody in group B:" with the text quoted, Tester is pinged, and Googer's answer says it pinged 1 trainer.
7. Tester `/group join letter:A` (A is kept by its label); Googer `/shout message:anyone group:True`: "Nobody else is in group B of this raid, so I said nothing.", nothing in the post. `/shout message:anyone` without `group` still pings Tester.
8. A shout of more than about 86 members in several messages, and a shout cut short by the raid ending or moving: not staged by hand (`shout.test.ts`, `party-change.test.ts`).
