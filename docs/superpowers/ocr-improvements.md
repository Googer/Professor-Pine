# Screenshot reader: the log of improvements

What was changed in the screenshot reader, why, and what it did to the scores. A session that
improves the reader (the skill `.claude/skills/improve-screenshot-reading/SKILL.md`) reads this
first, so that a cause is not chased twice, and appends an entry with every fix.

An entry:

```
## <date>: <the failure group, in a few words>

- **Seen:** how many screenshots, from which review folder, and what `ocr:review` said of them.
- **Cause:** what in Pine's code made them go wrong.
- **Fix:** what was changed (files, the rule or the threshold and its new value).
- **Scores:** per element, before and after, over the research samples and each review folder
  (`ocr:check`); samples that went from right to wrong, if any, and why that was accepted.
```

Before the first entry the reader was as plan 7A built it and plan 7B put on Discord
(`docs/superpowers/ocr-baseline.json` holds its scores over the research samples).

## 2026-10-21: a CP behind an icon, a gym's picture read into its name, a CP digit the boss hides

- **Seen:** no review folder from production yet; 89 screenshots from Matt (his own phones, and
  members' from the Pittsburgh server that legacy Pine never deleted; Android and iPhone, 2019 to
  2026, four split screens), labelled by eye in two git-ignored folders
  (`var/ocr/matt-2026-10-21`, 71, and `…-21b`, 18), each with a boss list of its own bosses (T2
  and T4 bosses of 2019 left out: those tiers are gone).
- **Causes:** (1) The CP was read with the icon beside it or a faint "CP" run into the digits
  (`Ocp16997`, `O 53394`, `c45435`, `ce41758`), which the rule `^(?:CP)?\d+$` refused: no CP, the
  heads looked for in the wrong place, and the screenshot refused as no raid screen (4 of 46
  hatched raids, two of them 2026). (2) Text on the gym's picture (a sign, a plaque) was read
  into the name, or taller than it taken for it: a word or two in capitals before the name, or a
  sign's words in place of its second line (two screenshots; and two research samples). (3) Rayquaza
  hid a digit of its CP (49803 for 49808): no boss fitted.
- **Fix:** `raid-screen.ts`: the CP is the digits after at most three other characters, in a line
  tall enough as before; a line near the top that starts within `PICTURE_EDGE` (3) of its own
  heights from the left edge starts on the picture (names start at 3.3 to 5.5 on all 117
  screenshots, picture text at 1.2 to 2.2), and its leading words left of the name's column
  (where the other name lines start, else that edge) are left out unless they start as a name's
  words do (`NAME_WORD`: a capital and a small letter, or a digit; the light of a hatching egg
  stretched one name's box over the picture). `screenshot-report.ts`: a CP that fits no boss
  takes the one boss of the heads' tier whose CP is one digit off, when the name read is most
  like that boss's by `NAME_MARGIN` (`cp-and-name`).
- **Scores** (before → after): research samples gym 25 → 27 of 28, the rest unchanged (all
  right); first folder CP 41 → 45 of 46, heads 63 → 67 of 71, boss 34 → 39 of 46, gym 69 → 71
  of 71; second folder CP 12 → 13 of 13, heads 17 → 18, boss 8 → 9 of 13. No sample went from
  right to wrong.
- **Left as they are:** the faint heads of 2019 on a bright sky (the boss comes from the CP); a
  nearby gym's egg timer taken for the countdown (one 2019 screenshot); a hatching egg's purple
  light read as shadow; a clock written right after the battery's percentage (`79%自2:28PM`, a
  2024 Samsung) not read.

## 2026-10-21: the EX badge taken for the name, a clock after the battery, another raid's timer

- **Seen:** a third folder of 25 members' screenshots from the Pittsburgh server
  (`var/ocr/matt-2026-10-21c`, mostly Discord's shrunk copies, 2020 to 2024, one elite raid's red
  egg), with the two folders of the entry before.
- **Causes:** (4) The badge "EX RAID GYM" of older screens was not known as a badge, joined the
  name's block and stood in for the name (two screenshots). (5) A clock written right after the
  battery's percentage (`81%11:25AM`, `20%12:32PM`, `79%自2:28PM`) started no word (three). (6)
  On a hatched raid a nearby raid's timer above the countdown was read first (two).
- **Fix:** `raid-screen.ts`: `ELITE` also takes `ex raid`, so the badge is left out of the name
  and an elite raid's red egg of more than an hour at such a gym is elite; a status-bar word also
  ends after a percent sign; on a hatched raid (a CP read) the countdown is the one that ends
  farthest right, else the first as before.
- **Scores** (before → after, against each folder's baseline written with the entry before
  merged): first folder countdown 70 → 71 of 71; second folder clock 17 → 18 of 18; third folder
  clock 22 → 24, countdown 24 → 25, gym 22 → 24 of 25; research samples unchanged (all right but
  one gym text). No sample went from right to wrong.
- **Left as they are:** an iPhone's location arrow read as a digit after the clock (`10:341`);
  bosses that hide the CP or the heads; a name cut by an icon beside it.

## 2026-10-22: max battle screens, the iPhone's location arrow

- **Seen:** eight screenshots of Matt's iPhone 16 Pro Max (`var/ocr/matt-2026-10-22`, five raids;
  `…-22-max`, three max battles), with the folders of the entries before.
- **Causes:** (7) The location arrow beside an iPhone's clock was read as a `1` after the minutes
  (`7:361`, `10:341`), and a clock followed by a digit is refused (two screenshots). (8) A max
  battle's screen was unknown to the reader: no CP, the heads looked for under its countdown
  (they stand small just above the boss's line), so it ended as no raid screen without its
  species, Power Spot or tier being read.
- **Fix:** `raid-screen.ts`: a single `1` right after h:mm is left out; `max` (`MaxText`) from a
  large line "Dynamax …" or "Gigantamax …" and the line under it. `tier-heads.ts`: on a max
  screen the heads are looked for between 1.5 and 0.6 of the boss line's heights above it, a
  head 0.42 of its height. `screenshot-report.ts`: a max screen makes no raid (stage, tier and
  time unknown, `not-a-raid-screen`), as before, until a plan gives it a flow. `ocr:check` scores
  labels of `kind` "max" (clock, countdown, kind, species, spot, heads).
- **Scores:** the three max screens 0 → 3 of 3 in kind, species, Power Spot and heads (clock and
  countdown 3 of 3 before and after); clock 24 to 25 of 25 in the third folder
  (`10:341`) and 4 to 5 of 5 in this one (`7:361`); every other folder and the research samples unchanged. No sample went from right to
  wrong.
- **Left as they are:** the Power Spot's name read without a space (`JUNIPER'SSWING CORNER`):
  the search later is fuzzy; the countdown of a max battle runs to the small hours and is not
  the party's end (for the plan of the flow).

## 2026-10-22: max battle names run together, smaller or over two lines; a misread badge

- **Seen:** `var/ocr/matt-2026-10-22b` (eleven: Matt's Android in split screens, max battles and
  raids; a member's old Gigantamax Snorlax; a mega legendary egg of six heads; a member's iPhone
  screenshot as Discord's 235x512 copy).
- **Causes:** (9) In a split screen's lower half the boss's line was smaller than the rule
  (0.023 of the screen's height) and read without its space (`DynamaxSneasel`); an older screen
  puts "Gigantamax" on a line of its own and the species under it (two screenshots). (10) A tiny
  copy read the badge as `EUTE RAID GYM`, which stood in for the gym's name (one).
- **Fix:** `raid-screen.ts`: `MAX_BOSS` takes the form with or without a space, or alone with the
  species on the next line; `MAX_BOSS_MIN_HEIGHT` 0.025 → 0.018; `ELITE` also takes any badge
  ending in "raid gym".
- **Scores:** this folder 8 elements from wrong to right (kind, species and spot 5 → 7 of 7, heads
  9 → 10 of 11, gym 3 → 4 of 4); every other folder and the research samples unchanged. No sample
  went from right to wrong (two timeouts under the laptop's load in a first run, read right at
  normal priority).
- **Left as they are:** the old Gigantamax screen's timer `16:57` (no hours: not a countdown the
  reader takes); the tiny copy's countdown, not read at 235 pixels wide.

## 2026-10-24: a listed max boss the game master lacks; a gym name's second line read with a caption

- **Seen:** Matt's play on the Lake Trio Max Battle Day with the dev bot (records in the dev bot's review folder, not kept with the samples): every Azelf screen, and a raid at a gym whose picture is the Community Ambassador badge.
- **Causes:** (11) The species read ("Azelf", right) was looked up only among the game master's Dynamax bosses, which lacked Azelf, though Pokebattler listed it at 5 stars; no boss was found. (12) The gym's name ran onto a second line ("Outgoing") that was read together with the caption of the picture ("AMBASSADOR PROGRAM C 0 murit Outgoing"); the picture's rule cut the line away, and "Pittsburgh Campsite -" fitted several gyms.
- **Fix:** `max-report.ts`: a species on the boss list counts though the game master does not have it as a max boss. `raid-screen.ts`: the line under the name is kept as read (`gymBelow`); `screenshot-report.ts`: when no try of `gymOfText` is clear, its name-like words (`NAME_LIKE`) are added and tried again.
- **Scores:** every labelled folder against its baseline: no sample from right to wrong (several from wrong to right since the baselines were written, by earlier fixes); the research samples against the committed baseline unchanged (0 and 0). The two cases are unit tests built from the records' lines.

## 2026-10-27: split screens read pane by pane (plan 7P)

- **Seen:** `var/ocr/matt-2026-10-26-split` (13 of Matt's Android splits, labelled per pane) and `var/ocr/fake-foldable-2026-10-26` (49 fakes of foldables: no divider, a Duo's letterboxed panes, GO beside a map, a chat or notes).
- **Causes:** the whole picture was read as one screen, so a split's elements came from both halves (a max battle with the raid's countdown, a raid at the "gym" Dynamax Sableye), and a side-by-side split read at 720 pixels lost each half's text.
- **Fix:** `panes.ts` and `readPicture` (design `2026-10-26-split-screen-screenshots-design.md`; `screenshots.md`, "Split screens"): Android's divider or the text cuts the picture, each pane is read as a screenshot of its own and kept only when each shows one screen or none; two screens that cannot be told apart are refused.
- **Scores:** (2026-10-27, after the review's fixes) the splits from 0 of 13 pictures read right in both panes to every pane of the 13 read as the right kind of screen (none 3/3, kind 15/15, countdown 23/23, cp and boss 8/8; gym 6/8, heads 20/23, species and spot 14/15); with the divider search off, 10 of 13 cut by the text, the three map splits read whole as before. The 58 fakes: 53 cut (by the divider or a Duo's spine, or by the text), 2 refused as two screens, 3 read whole as before; every pane of another app (map, chat, notes) shows nothing (none 30/33: the 3 are the uncut map splits), nothing of the other app taken into a GO pane. Every labelled folder and the research samples: no sample from right to wrong; `twoScreens` fires on no picture of one screen.

## 2026-10-27: a small GO boxed in its pane read enlarged (plan 7P-G)

- **Seen:** `var/ocr/matt-2026-10-26-split`: the two raid panes of the four where GO is pillarboxed in a short pane (664 of 1080 pixels wide, black left and right): `1000038193.jpg#1` read no gym and 3 heads (5), `1000038194.jpg#2` the gym "Histori htowi"; the two max panes of the same kind (`1000038192.jpg#2`, `1000038195.jpg#1`) read 1 head (3).
- **Causes:** (13) The pane's content box was found (the loose trim of 7P) and read at its own 664 pixels, but such a GO draws its text smaller than a phone's: the gym's name 17 pixels tall, light on GO's light sky. Enlarged alone, 194's name read whole from about 1000 pixels wide, 193's never (1080 "HistoricDeutchtoy", 1328 "Historic", 1440 "HistoricDeutchtown"); enlarged to 1080 with its contrast stretched both read "HistoricDeutchtown Blumengarten".
- **Fix:** `readPicture` (`paneReadSize`, `boxedIn` in `panes.ts`): a pane whose content has margins on both sides and is narrower than `READ_WIDTH` is read enlarged to its pane's width (at most twice `READ_WIDTH`), its contrast stretched (sharp's `normalise`), for the recognizer only; the panes' budget counts the enlarged pixels.
- **Scores:** the four pictures with the real models in a scratch read: both gyms right ("HistoricDeutchtown Blumengarten", similarity 1 to the label), the max panes' heads 1 → 3; `1000038193.jpg#1`'s heads still 3 (they stand on a light sky there and on a darker band in 194: a cause of their own, left as it is). About half a second more per small pane on two threads. The check of every folder (95a856e1): the splits' gym 8/8, heads 22/23, species 15/15, every real folder unchanged, but `fake-foldable-2026-10-26/cut-1000038192.jpg#2` from 3 heads to 1.
- **Second round:** (14) The heads were still counted at the pane's own size: 17 pixels tall, blown up block by block to the template's 24, the two beside Sableye's light eyes scored just under or just over the row's threshold, by a few pixels of the title's box (the band's edges and unit): real 192 read 3 and its fake without the divider 1, before the fix the other way round. Now the heads' band of an enlarged pane is enlarged as its text was, smoothly (`headsScale`): 3 for both over sixteen bands and units tried, and in the scratch read of the four pictures and their fakes (193's raid pane still 3, its own cause).

## 2026-11-05: a full-width short pane lost its heads and its gym (plan 7P-H)

- **Seen:** Matt's two splits posted with a mention on the Air's dev bot, `var/ocr/air-2026-11-05-split` (882 × 2000 copies of 1080 × 2448 originals; the Air's records in `var/ocr/air-2026-11-05`): a Mega Sableye raid at an elite gym over GO's map (Android divider, the raid pane 1080 × 1212) refused `not-a-raid-screen`: heads 0 (score 0.55), the gym "Hollov unBr" on the copy and nothing on the Air; its CP named no boss of the Air's list (no megas), so without the heads' tier no boss was decided either. The same raid full screen read right.
- **Causes:** (15) The heads' band above a hatched raid's CP reached 1.6 units (0.3 of the CP's height) over its top; GO draws a short pane by its height, its heads higher over the CP (their tops 1.9 units over it, 1.25 units tall), so the band cut through them: 0 counted here, 3 of 5 in `matt-2026-10-26-split/1000038193.jpg#1` (the cause 7P-G left open). (16) The gym's name, 26 pixels tall in the pane, 17 as read at `READ_WIDTH`, light on GO's light sky, as in 7P-G's boxed-in GO but in a pane GO fills.
- **Fix:** `tier-heads.ts`: the band reaches `CP_BAND_REACH` = 2.4 units over the CP. `readPicture` (`paneReadSize`): a pane near square or wider (content under `WIDE` = 1.4 times as tall as wide) that is not boxed in is read at its usual size with its contrast stretched (`ReadSize.stretched`; its heads as before). Read at its own width (1080) instead, the gym read whole as well, but Matt's max panes of that shape (180#2, 181#2) lost heads (3 to 0 and 1): their boxes grew with the read size and moved the heads' band.
- **Scores** (scratch reads with the real models, two threads, low priority; the full `ocr:check` is the controller's): the raid pane gym "Hollow Run Bridge", heads 4, CP 23935, "Mega Sableye" (copy enlarged to 1080: "HollowRun Bridge", the search's top hit, heads 4); `1000038193.jpg#1` heads 3 → 5; the rest of `matt-2026-10-26-split`, `matt-2026-10-27-elite-split`, `fake-divider-other-app-2026-10-27`, `fake-foldable-shapes-2026-10-27` and `stage-7p-two`: no element from right to wrong (some Power Spot names lost or found a space, which the match ignores; two misread boss names under a Palkia read otherwise). The band alone over the 34 hatched raids' records of the review folders: every count unchanged, scores equal or higher. The stretch costs a few milliseconds per pane.

## 2026-11-07: a whole picture's review record scored against its first pane (review F1 of 7P)

- **Seen:** a review record kept before 7P, or one the bot read whole because it ran late, has a member's label of the whole picture; when `ocr:check` now cuts its picture, the label applied to no pane and the sample dropped out of the comparison.
- **Fix:** `memberLabelOfUnit` scores such a label against the first pane that shows a screen (`firstScreen`), and `ocr:check` scores it under the picture's key, as a `labels.json` label without `#n`. The reader is unchanged.
- **Scores:** no sample of today's folders is such a record (the one whole-picture label in `var/ocr/review` is not cut); every folder (research, `matt-*`, both `air-2026-11-05*`, `review`) against baselines written from main-dev first: nothing worse, the research samples also against the committed baseline. Three folders, read on a loaded laptop, first had pictures that failed or ran late in the reading process (not touched here); read again, nothing worse. Also checked: `matt-2026-10-26-split/1000038193.jpg#1` reads its 5 heads since 7P-H (cause 15), so that item is closed.

## 2026-11-10: a CP white on a bright white sky (production)

- **Seen:** three screenshots posted with a mention in production on 2026-11-10 (Pittsburgh, a Zamazenta T5 at CP 56867, its digits and name white on a bright white sky, the name half hidden behind the Pokémon; `var/ocr/prod-2026-11-10-cp`, records in `var/ocr/prod-2026-11-10`): one read the CP as `367` (the last three digits, a line apart, far right of "CP") and reported a T5 without its boss; two read no CP at all, so their heads were looked for under the countdown near the bottom of the screen: one counted a single "head" there (score 0.47) and reported a T1, the other none and was refused `not-a-raid-screen` twice.
- **Cause:** (17) GO draws the CP's digits white with a light grey edge; on a bright sky the detector found the "CP" but not the digits, or only some. Read again alone, plain or normalised, digits were still lost: the edge stands out only among the brightest levels. On one screen the boss's blue spikes stand before the 8; by luminance they turn black and join the digits (`569`, `5696`).
- **Fix:** `raid-screen.ts`: `cpRowToReadAgain` (a "CP" alone in the top half whose digits are not one line of three or more beside it) and `withCpReadAgain` (the row read again stands in for the row's lines when its CP has more digits); `screen-reader.ts`: `readCpRow` reads that row alone at 50 pixels a letter, in grey by each pixel's brightest channel from 192 up (`brightestStretched`, `image.ts`).
- **Scores** (scratch reads with the real models, two threads, low priority; the full `ocr:check` is the controller's): CP 0 → 3 of 3 (`56867`; `56967` where the spikes hide the 8; `56867`), heads 5 on all three (the band now above the CP read), the boss over the production list 0 → 3 (two by the CP, one by the CP one digit off and the name "Zan enta", most like Zamazenta's). Of the reads tried (none, normalise, gamma, negate, CLAHE, luminance from 128, 170 or 191 up; the brightest channel from 176 to 208 up; 40 to 56 pixels a letter; 2.8 or 3.2 heights over the foot) this one read the half-hidden CP five digits long most often. The second read costs about 0.1 to 0.5 seconds, only on a screen with a "CP" read alone.

## 2026-11-10: the heads of a hatched raid without a CP looked for near the bottom (production)

- **Seen:** the same three screenshots: where no CP was read, the heads' band fell under the countdown of the hatched raid, near the bottom of the screen (rows 1466 to 1660 of 2436), where one screen counted one "head" at 0.47 (a T1 for a T5, worse than no tier) and the other none.
- **Cause:** (18) `headBand` without a CP took the egg's place of the heads, under the countdown, also for a hatched raid, whose countdown stands at the right over the boss and the ground.
- **Fix:** `tier-heads.ts`: without a CP, the band over where a "CP" read alone (`ScreenText.cpLetters`, `raid-screen.ts`) puts its digits (`CP_DIGITS` = 2.3 of its height tall, their feet on its line: 2.27 on the samples), as over a CP; no band at all under a countdown at the right (`countdownPlace` `right`), so no tier from there.
- **Scores** (scratch, the band by the "CP" alone on the pictures' own pixels, without the CP read again): heads 5 on all three (scores 0.76 to 0.79), where before 1 (wrong) and 0 and, on the first, 5 by its CP misread.

## 2026-11-10: GO's gym-info button read into an iPhone's gym name (production)

- **Seen:** two of the same screenshots (iPhone, 1125 × 2436): the gym read "Christ's Lutheran Church og" and "Christ's Lutheran Church Firepit ogy". The second was still found clearly; the first was asked about.
- **Cause:** (19) GO's round gym-info button at the top right stands beside the name's second line, and the reader joined it into that row: a piece of its own at x 986–1029 (0.877 to 0.915 of the width), 33 to 35 pixels tall, beside the name's piece of 64 to 65 (0.52 of it). No other labelled screen read the button (the Android, older iPhone and 2026 iPhone samples dumped in a scratch read). A rule by the words was ruled out: names GO cut end in a small lowercase word ("Buhl Planetarium and", "Church of the" in the labels).
- **Fix:** `raid-screen.ts`: `withoutInfoButton` drops a line's last piece (`TextLine.parts`) near the top that starts right of `BUTTON_PLACE` = 0.85 of the width and is under `BUTTON_HEIGHT` = 0.7 of the tallest of the line's other pieces, before the name's block is found (and from the line under the name, `gymBelow`).
- **Scores** (scratch reads with the real models, two threads, low priority; the full `ocr:check` is the controller's): "Christ's Lutheran Church" and "Christ's Lutheran Church Firepit", both equal to the labels. The first stays asked about: the search finds two gyms with every word ("Christ's Lutheran Church" and "… Firepit") and takes the one of exactly that name without calling it clear, by design, since the game cuts long names (follow-ups, the staging run of 7B: "Temple Sinai" beside "Temple Sinai Garden"; the production record already searched the text without "og"). The button's word mattered where the name has three words or fewer: `gymOfText` cuts trailing words only from names of four words or more, so a "Heritage Park og" could not be found clearly.

## 2026-11-10: an exact gym name beside a longer one asked about (production)

- **Seen:** the church above, read "Christ's Lutheran Church" once the button was left out, still asked which gym: the search finds it and "Christ's Lutheran Church Firepit" with every word, and took the one of exactly that name without calling it clear ("the game cuts long names", Claude's guess at 7B's staging, not Matt's ruling).
- **Cause:** (20) Matt, 2026-11-10: GO shrinks a long name to fit, so cutting is rare, mostly in a split's small window; ask only when there would not have been room for another word after the last one. On the samples GO cuts by wrapping the rest out of sight: a 2019 Android screen ended "Catahecassa Blackhoof War Chief" at 0.75 of the width and wrapped " of" away; a 2020s iPhone showed one line "Church of the".
- **Fix:** `raid-screen.ts`: `ScreenText.gymRoom`, the characters (at the last name line's average width) left after it up to `NAME_END` = 0.8 of the width; null in a pane (`ScreenTextOptions.pane`, set by `readPicture` for every pane) and without a name. `screenshot-report.ts`: `gymOfText` takes the one gym called exactly the whole text read as clear when every other sure hit begins with that name and has its next word and a space fit in the room (`notCutFrom`; a dash before it counted with it); never on a try without leading or trailing words, nor with the room unknown. Review fix (C1): at first a later try without leading words could clear a shorter gym that is the end of others' names ("United Methodist Church" beside "First United Methodist Church" and its "… Annex"), and a sure hit not beginning with the name did not keep it asked.
- **Scores** (scratch reads with the real models of `prod-2026-11-10-cp`, `matt-2026-10-21`, `-21c`, `-21d`, `-22`): the room after "Christ's Lutheran Church" 12.0 (" Firepit" needs 8: clear), "Temple Sinai" 8.7 to 9.4 (" Garden" needs 7: clear, as labelled); after every name GO cut, too little for its next word: "Catahecassa Blackhoof War Chief" 1.7 to 2.1 (" of" 3), "-War Chief of the" 3.9 (" Shawnee" 8), "Carnegie Library of Pittsburgh - Squirrel" 2.5 to 2.7 (" Hill" 5), "25th Anniversary of the Pittsburgh Vintage" 3.3, "Buhl Planetarium and" 1.1, "House of Prayer For All" and "Fifth Ward World War" 0; "Church of the" 8.3 (its next word, unknown, is longer). At 0.85 the 2019 Catahecassa screens left 3.6 to 4.0, room for " of": hence 0.8.
