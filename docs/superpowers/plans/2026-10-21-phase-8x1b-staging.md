# Phase 8X-1B staging checklist: one layout of buttons, Group… and Meet… (draft)

Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Accounts: Googer (owner, staff) and Tester (a member); a third account where a step says so. Look at the steps marked **phone** on Android and on an iPhone. The design is `docs/superpowers/specs/2026-10-20-join-group-meet-buttons-design.md` (mockup linked there); the conventions are `docs/architecture/parties-and-posts.md`, `trains.md` and `discord-framework.md`.

## Before

1. **The shared dev database.** This build writes parties at **state version 12**; a bot of an older build (typescript-migration before the merge, the wayfarer session's) cannot read those rows and leaves their posts dead. Check `var/stage/TEST-SERVER-STATE.md`, note there that 8X-1B is being staged, and end every party made in this staging (`/delete` or let them expire) before an older bot starts on the dev database again.
2. No command definition changes in 8X-1B, but 8X-1's are not deployed yet: Matt deploys first (`set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global`). 8X-1's own checklist (`2026-10-20-phase-8x1-staging.md`, rewritten for pruning) can run in the same session.
3. The Meet… icon `pinemeet` is not uploaded: Meet… shows ⏰ (uploading the game's Select Time icon from PokeMiners is a separate step with Matt's go-ahead).
4. A post drawn before the update keeps its old layout until its next change; its old letter Join still joins its letter, and answers "This raid has no such group." once that letter is gone.

## One group

5. **phone** As Tester, report a raid with times in a quiet region (raid R). Rows: 1 Interested, Join, Here, Done, Leave (icons only); 2 Meet… (⏰), −1, +1, Remote (icons only); 3 Group… (disabled), Screenshot feedback if shown. The status lines start with their button's icon; "Nobody yet" before anybody signs up; the heading without a letter, `N trainers · meeting at …` once a time is set; the hint "No meeting time yet: ⏰ sets one." Desktop and both phones: how the three rows wrap.
6. A raid reported without times (raid T): row 2 has no Meet…; row 3 reads Group…, Set time. Set time still sets the times; the post then shows Meet… in row 2.
7. Tester Join in raid R: Group… becomes enabled. Tester presses Group… as the only member: refused privately, "You are the only one here…"; `/group new` by Tester alone is refused the same way (X1B-3). Later, with groups A and B: a member alone in plain B who runs `/group new` or Group… → new is refused: "You are alone in group B already: a new group would change nothing."
8. Googer Join; Googer Group…: one way, a label line "Label for a new group (optional)"; Submit with a label opens B with that label; the post's line about the new group pings those who allow it.

## Several groups

9. **phone** A third account (or Tester after Leave) presses Interested, then Join, then Here, each first time as a newcomer: "Which group?" opens, the newest group first. **Android:** the first choice is selected when the dialog opens. **iPhone:** whether Submit works without a tap (whether the `default` mark is honoured; decision 9). A signed-up member's Interested, Join, Here: no dialog, the status changes in their own group. Done and Leave never ask. +1 and Remote by a newcomer place them silently in the newest group.
10. Stale dialogs: Tester opens Join's "Which group?" in raid R; Googer empties group B (so it is pruned); Tester submits B: "Group B has changed since: press Join again." The same when B was reopened under its letter meanwhile, and for Group…'s move.
11. A "Change group" dialog opened by Tester, then Tester presses Leave, then submits: "You are no longer signed up: press Group… again." (X1B-4).

## Pruning

12. The last member leaving group C: C vanishes from the post without a line; the others keep their letters. A labelled empty group stays; an empty group with a meeting time stays. When the default group goes, a newcomer's +1 lands in the newest group left.

## Meet…

13. **phone** On an egg with a known hatch: Meet…'s menu opens on Android and iPhone; "At hatch (…) · in-game RSVP" is first and chosen; the RSVP marks every 15 minutes; 5-minute times for an hour; no past times. Submit sets the time, tells the group and pings those who allow it; "No meeting time" then appears in the list.
14. A time set with `/meet` off the grid shows in Meet…'s list as the group's time. A meeting time at the hatch follows a `/hatch` correction. A Meet… dialog left open across such a change: "That time is no longer offered: press ⏰ again." (the `pinemeet` icon once uploaded)
15. Refusals at the press: not signed up; the raid over ("There is no time left to meet before this raid ends."). The budget is shared with `/meet` (three a minute): "You can use /meet again in …".
16. With several groups the hint names the groups without a time: "Group B has no meeting time yet: ⏰ sets your group's."
17. **Wednesday (Matt):** the in-game RSVP times of other raid lengths (one rule assumed: the hatch, then every 15 minutes).

## Copies, trains, meetups, the map

18. An elite raid and a region copy: no Remote on the elite raid; copies show Group…, Meet… and the hint; Meet… pressed in a copy works.
19. **phone** A train: row 3 Group…, Move train…, Split group…, Whole route (how the four labels wrap on a phone); a region copy keeps Group… and Whole route only.
20. The split picker (conductor in A, groups A, B, C): the largest group other than the conductor's first, the conductor's own last; **Android:** which choice is selected when it opens. A split of a group while a Group… dialog naming it is open: that Submit is refused.
21. A meetup: rows 1 and 2 only; no Group…, Meet…, Set time or Done.
22. The web map: a newcomer to a party of several groups sees "Which group?" before the buttons and Join lands in the chosen group; a signed-up member sees no menu; read-only mode shows none.

## Worst case and history

23. A raid of five groups with times, a screenshot and labels: Discord accepts the post (at most 32 of 40 components) and it reads on a phone. An ended raid's last showing has no rows but keeps its lines.
24. End a raid in which a group was pruned and another had a meeting time: the record shows the right group meeting times (`/settings history` opted in).

## After

25. End every party made here (step 1); update `var/stage/TEST-SERVER-STATE.md`; record the results in the follow-ups file ("From the staging run of 8X-1B").
