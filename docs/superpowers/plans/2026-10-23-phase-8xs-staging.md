# Phase 8X-S staging checklist: max battle screenshots (draft)

Every step needs Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab.

- **Accounts:** Googer (owner, staff) and Tester (a member).
- **Plan:** 8X-S; design `docs/superpowers/specs/2026-10-22-max-battle-screenshots-design.md`.
- **Conventions:** `docs/architecture/screenshots.md` (the max path, "On Discord"), `moderation.md` (the missing Power Spot note), `parties-and-posts.md` (party state 15).
- **Screenshots:** Matt's real max screens in `var/ocr/matt-2026-10-22-max` (`IMG_0147.png`, `IMG_0153.png`, `IMG_0157.png`) and `var/ocr/matt-2026-10-22b` (`1000038137.jpg`, `1000038139.jpg`, `1000038140.jpg`, `1000038141.jpg`, `1000038145.jpg`, `1000038146.jpg`, `image0-member.jpg`, an old Gigantamax screen without a countdown). They stay off the repository: copies for the steps go in the git-ignored `var/stage/8xs/`, and no step or note names their Power Spots.

## Before

1. **The commands changed** (`/max` gains `screenshot:`, `boss:` and `spot:` become optional where screenshots are read; `/read-screenshot`'s description). Matt deploys them with the stage settings:

   ```
   set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global
   ```

2. **Settings:** `ocr.enabled` on; `ocr.passive` on for the passive steps (with the Message Content intent on for the dev application); `settings.channels.moderation` named, and the moderators' channel there.
3. **The Power Spots:** the test server holds Pittsburgh's Wayfarer import. For each screenshot, find the region its Power Spot lies in: `/max spot:` with the start of the name in a region channel, or `/find-region`. Note it in `var/stage/8xs/` only. A screenshot whose Power Spot lies in no region of the test server is kept for step 18 (the unknown spot): Pine knows only the Power Spots of its regions.
4. **The moment of a screenshot.** The clock on the screens is a 12-hour clock: Pine takes it as the last such time before the upload, within an hour and a half, and otherwise guesses the moment from the upload (the post then says the time is a guess until `/end`). For a moment Pine is sure of, a copy is named as Android names screenshots, `Screenshot_<yyyymmdd>-<hhmmss>.jpg`, with the staging day's date and the clock on the screen in 24 hours (`1000038140.jpg`'s 3:24 becomes `Screenshot_<day>-152400.jpg`), and posted after that time. A name more than two minutes off the clock is contested and not sure.
5. **The countdowns** of all these screens are the all-day kind (they run to about 05:00): every end is 21:00, capped. A countdown that ends at a rotation needs an event's screenshot (step 13).

## /raid and /read-screenshot

6. **`/raid screenshot:` with `IMG_0153.png`:** "That is a max battle: use `/max screenshot:`, or post it with a mention." Nothing reported. Again with `boss:` and `gym:` typed: the same refusal (the wrong picture).
   - The answer's "Something is wrong…" offers Power Spot, Time, Tier, Boss.
7. **`/read-screenshot` with `IMG_0153.png`:** the Power Spot as read and as matched, the clock and countdown with "ends at 21:00", "2 heads, Dynamax → Dynamax 2★", the boss; "With a screenshot like this, I report the max battle as above." Nothing reported.
   - "Something is wrong…": Power Spot, Time, Tier, Boss; Submit with Power Spot ticked: "Thank you".
   - `image0-member.jpg`: no countdown, the end "(as `/max` would end it)", Gigantamax; small print "I could not read the countdown, so the battle ends as `/max` would end it."

## /max screenshot:

8. **Read alone.** In the region channel of its Power Spot, `/max screenshot:` with the dated copy of `1000038140.jpg` (step 4), after its time.
   - Reported: "Reported: Dynamax Sneasel (2★) at <spot>, until 21:00. Its post is …", with "Screenshot feedback".
   - The post shows no guessed time. Screenshot feedback shows the max reading.
   - The same in another region's channel: first end the battle the first bullet made with Googer's `/delete` in its post (a spot holds one battle at a time: with it still there, "Report it there" would only join it). Then: "<spot> is in <#region>, not in this region. Report the max battle there?", Report it there reports a new battle there.
9. **Typed values win.** It needs a Power Spot with no battle: first end any battle at the Power Spot of `1000038139.jpg` (step 8's, if it is the same spot) with Googer's `/delete` in its post. Then `/max screenshot:` with `1000038139.jpg` and `boss:` another listed boss, `end:20`: the battle has the typed boss and ends in 20 minutes, the screenshot on its post, with no guessed time. (With a battle of another boss there, a typed boss or spot is refused "There is already a max battle against …", review S-2, and the use is not counted.)
10. **Unreadable with typed values.** `/max screenshot:` with an ordinary photo and `boss:` and `spot:` typed, at a Power Spot with no battle (end step 9's first with `/delete`, or type another spot): "I could not read the screenshot, so I used what you typed." and the report. Without them: "This does not look like the screen of a max battle, so I made nothing of it."
11. **A raid's screen:** `/max screenshot:` with a raid screenshot of `matt-2026-10-22b` (`1000038138.jpg`): "That is a raid: use `/raid screenshot:`, or post it with a mention.", also with `boss:` and `spot:` typed.
12. **Without a screenshot:** `/max` with neither boss nor spot: "Give the boss and the spot of the max battle (or attach a screenshot of it)." The use is not counted. `/max` as before with both: unchanged, the ending-soon dialog included.

## A battle already at the spot

13. **The same boss.** Googer reports the screenshot's boss at its spot with `/max`. Tester posts the dated copy of a screenshot of that boss there with a mention:
    - joined by Tester's automatic status, the reply names the post;
    - the end stays 21:00 (an all-day countdown never moves it).
    - Optional, on a max event's day (the Max Battle Day of 2026-10-24, 14:00–17:00): a fresh screenshot whose countdown ends at the rotation, posted at a battle of its boss whose end is earlier, moves the end later and says "Its end is now …, from your screenshot." Not earlier.
14. **Another boss, newer.** Googer reports another Dynamax boss at the spot of `1000038140.jpg` with `/max`, at a time T. A copy of `1000038140.jpg` with the status bar cropped off (no clock: the file's name is the moment) named `Screenshot_<day>-<T plus one minute>.jpg`, posted by Tester with a mention after that:
    - the boss changes to Dynamax Sneasel (2★), the end to the screenshot's; the post says "Boss changed to **Dynamax Sneasel (2★)** from a screenshot by Tester, until 21:00."; Googer stays signed up;
    - a member with a want of Sneasel gets the DM `/boss` would send.
    - **Older:** the battle is Sneasel's now, and step 4's dated copy is a Sneasel screen (it would join). Googer first sets another Dynamax boss with `/boss` in the post (the battle has that boss since now). Then Tester posts the dated copy of step 4 (its moment before now) with a mention: refused "There is already a max battle against … at <spot>: <post>. `/boss` there changes its boss."
    - **Typed beside it (review S-2):** with the battle still of that other boss, Tester's `/max screenshot:` with a fresh dated copy of `1000038140.jpg` (named after the `/boss` of the bullet above, so newer and sure) and `spot:` the spot typed: refused with the same words, the boss unchanged, and the use not counted (as `/max`'s refusal; review F-1). The same with `boss:Sneasel` typed instead: refused too. The same copy with nothing typed: the boss changes to Sneasel.
    - **The other kind:** `/max` refuses a battle at a spot that has one, so Googer first ends the Dynamax battle with `/delete` in its post, then reports a Gigantamax boss at the spot (`tier:G`); a Dynamax screenshot there is refused, the post named, without the `/boss` hint, even when newer.

## Mentions and passive reading

15. **A mention, clear spot of the channel's region:** a dated copy of `1000038141.jpg` with @Pine and nothing else: reported unasked, the message deleted; with text beside it, marked ✅.
16. **A mention, another region's spot:** the menu "Which Power Spot is it?" with the spot, its region named under it; picking it reports there.
17. **A spot cut short:** a copy of `IMG_0157.png` with the end of the Power Spot's name painted over (in `var/stage/8xs/`) so that what is left is the start of at least two Power Spots of the channel's region (one of the region is clear, `power-spot-match.ts`; "PITTSBURGH'S" in #squirrelbreeze was, 2026-10-25): the menu of the spots it may be, the channel's region's first; the pick is reported and kept in the record (`pickedSpotId`).
18. **An unknown spot.** The screenshot of step 3 whose Power Spot lies in no region of the test server (`<shot>` below), its name read surely (`/read-screenshot` shows it). Only if none of the screenshots has such a spot, as a fallback: in the dev database (`pine-dev-mysql`), set the row of the Power Spot of `IMG_0147.png` in the table `Wayspot` (its id is the Wayfarer id of `/max spot:`'s choice) to `kind = 'gone'` for the step, restart the bot, and restore it afterwards (`kind = 'powerspot'`, restart).
    - A mention with `<shot>`: "I do not know a Power Spot called "<name>" here: use `/max spot:`. I have let the staff know Pine may be missing this Power Spot."; the moderators' channel gets "A screenshot in #<channel> showed the Power Spot "<name>", which Pine does not know. A new Wayspot export may be due (`/gym import`)."
    - The same again, and `/max screenshot:` with it: the refusal still says the staff know; no second note.
    - Passive: only "<@Tester> I could not tell which Power Spot this is: use `/max screenshot:`."; no note.
    - **No countdown (review S-1):** a max event's announcement picture whose large line reads "GIGANTAMAX <species>" (Niantic's or Leek Duck's, saved to `var/stage/8xs/`; `/read-screenshot` shows it read as a max screen with no countdown and a Power Spot it does not know). With a mention: "I do not know a Power Spot called "<name>" here: use `/max spot:`." without the line about the staff; the moderators' channel gets nothing. With `/max screenshot:`: the same, no note.
19. **Passive, its own region:** a dated copy of a screenshot whose Power Spot has no battle, posted without a mention in its region's channel: reported silently.
20. **Passive, another region:** with a battle of the boss there, joined unasked: the reply pings Tester and names the post. With none, "<@Tester> <spot> is in <#region>. Report it there?" with Yes and No only Tester can answer; Yes reports it there, No or nothing makes nothing.
21. **Passive, silent:** a screenshot of no boss Pine can tell, or an older screenshot at another boss's battle: no reply.
    - **No countdown (review S-1):** the announcement picture of step 18 posted without a mention: no reply, no ✅, nothing reported or kept, no note. The same for `image0-member.jpg` (no countdown) in its Power Spot's region channel: nothing at all, though with a mention it is reported (its end as `/max` would end it).

## After the last battle

22. **After 21:00:** `1000038146.jpg` named `Screenshot_<day>-211200.jpg` (its clock, 9:12 pm), posted after 21:12 with a mention and with `/max screenshot:`: "Max battles are over for today: they can be fought from 06:00 to 21:00." Passive: silent.

## Feedback and review

23. **Feedback:** the Screenshot feedback of step 8's answer, Something is wrong… with Power Spot and Boss ticked: "Thank you". The record has `use: 'max'`, the max report and the feedback.
24. **`npm run ocr:review -- var/ocr/review`** (a copy of the dev bot's review folder): the first line counts "raid screenshots and other pictures", and a "Max battles:" part counts the max screenshots apart, with Power Spot and Boss said wrong.

## After

25. Note the results in the follow-ups file, under "From the staging run of 8X-S".
