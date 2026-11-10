# Phase 7P staging checklist: split-screen screenshots (draft)

Every step needs Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab.

- **Accounts:** Googer (owner, staff) and Tester (a member).
- **Design:** `docs/superpowers/specs/2026-10-26-split-screen-screenshots-design.md` (Matt's Q1 and Q2).
- **Conventions:** `docs/architecture/screenshots.md`, "Split screens (plan 7P)".
- **Pictures:** Matt's splits `var/ocr/matt-2026-10-26-split/` (180–197) and two of the foldable fakes (`var/ocr/fake-foldable-2026-10-26/`, one `fold-one-raid-max`, one `fold-one-raid-chat`). The bosses of 2026-10-26 (Palkia T5, Dynamax Sableye 3★) must be on the test server's lists, or added with `/admin boss add` for the run; the gym "Historic Deutchtown Blumengarten" and the Power Spots "SMI AWARE", "Cultural District Three Rivers Park", "Bracken House", "North Shore Health Mart Pharmacy" in West (or a nickname that matches what the pictures say).

No command or option changed: no deploy. No migration.

## A mention

1. **Two screens, top and bottom.** As Tester, post 190 (max above, raid below) in West with a mention of the bot. Both are reported: a max battle at SMI AWARE and a T5 raid of Palkia at the gym; the message goes once both are made. Each post's "Screenshot feedback" shows its own pane: the max battle's under "Top", the raid's under "Bottom", with the whole picture.
2. **Side by side.** Post 196 (landscape, max left, raid right) with a mention: both reported, as in step 1 ("Left", "Right").
3. **One screen beside the map.** Post 181 (map left, max right): only the max battle is reported; nothing is said of the map.
4. **A question waits.** Post a split whose raid gym is not clear (a nickname removed for the run, or another region's gym) beside a max battle: the max battle is reported, the gym is asked; the message stays until the question is answered, then goes (a canceled question reports nothing for its pane, so the message stays, as before 7P). A refusal in the same message counts panes ("1 of 3: …").
5. **The throttle.** As Tester with 19 uses spent (post a picture of no raid nineteen times), post 190: the first pane is reported, the reply says "…so I did not read the other screen of one of them. Try again in …".
6. **Two screens it cannot tell apart.** Post a picture of two screens whose panes run together (a fake with the divider removed and a line across, or a hand-made picture): "This looks like two screens in one picture, and I could not tell them apart. Send each screen on its own." No raid is made; the use is given back (step 5's count does not grow).

## Passive reading (with `ocr.passive` on)

7. Post 190 in West without a mention, its clock repainted to the time now (`var/stage/7p-clock-now.mjs`; with its own clock, 3:42, the raid is over later that day and refused `raid-over`): the raid is reported silently; the max battle's pane has no countdown, which passive reading leaves alone, so the message stays. Post the picture of step 6: nothing is said.

## The commands

8. **`/raid screenshot:`** with 190: the raid is reported; under its answer (both stay), a private follow-up says "The max battle beside it was not reported: post the screenshot with a mention to report both." **`/max screenshot:`** with 190: the max battle is reported; the follow-up names the raid.
9. **Two of a kind.** `/raid screenshot:` with a split of two raids (the fake `fold-one-raid-raid`): refused, "This screenshot shows two raids: post it in the channel with a mention of me to report both." (with `ocr.passive` on: "…: post it in the channel to report both."). `/max screenshot:` with 184 (two max battles): the same for two max battles.
10. **Typed beside two screens.** `/raid screenshot:` with step 6's picture and a boss and gym typed: what was typed is reported, with "I could not read the screenshot, so I used what you typed."
11. **`/read-screenshot`** with 190: two containers, "Top" and "Bottom", each with its own reading, decision and feedback buttons, the thumbnail the whole picture. With 181: one container, "Right". With step 6's picture: the two-screens refusal.

## What is kept

12. In `var/ocr/held/`, step 1's two records have `pane` (index 1 and 2, `side` top and bottom) and their files are one file twice (the same inode: `ls -li`). After "Something is wrong" on one pane, only that pane's record is copied to review (shown only with a split whose panes have no doubts of their own; 190's time is a guess, so both of its panes go to review at once).
13. **The foldable.** Post `fold-one-raid-max` and `fold-one-raid-chat` with a mention: the first reports both; the second reports the raid only, nothing from the chat (no gym, boss, CP or countdown taken from it).
