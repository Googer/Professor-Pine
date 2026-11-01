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
