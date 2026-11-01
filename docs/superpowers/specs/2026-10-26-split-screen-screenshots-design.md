# Split-screen screenshots (plan 7P): design

Status: approved 2026-10-26, after a fresh review (eleven findings, folded in below) and Matt's answers (at the end). Next: the prototype (`var/proto-7p`), its review, the plan. Phase 7 (the screenshot reader); worked on in the worktree `.claude/worktrees/ocr-fixes`.

## Why

Matt sends screenshots of Android's split screen: Pokémon GO in both halves, or GO beside the map or another app. The reader reads the whole picture as one screen, with no layout (`raid-screen.ts`), so it takes the elements of a report from wherever it finds them. On 13 samples (`var/ocr/matt-2026-10-26-split/`, run log `var/ocr/matt-2026-10-26-split.run.log`):

| File | Arrangement | Halves | Read today |
|---|---|---|---|
| 180 | top / bottom | map / max (Cultural District) | right: the max and its Power Spot (no countdown) |
| 184 | top / bottom | max (Bracken House) / max (North Shore Health Mart) | the top one only; the second not seen |
| 190, 194 | top / bottom | max (SMI Aware) / raid (Palkia) | **mixed**: the max with the raid's countdown |
| 191, 193 | top / bottom | raid / max | **mixed**: the max with the raid's countdown |
| 192 | top / bottom | raid (large) / max (small) | right: the raid |
| 195 | top / bottom | max (small) / raid | **mixed**: the raid at the "gym" "Dynamax Sableye" |
| 181 | side by side | map / max | nothing |
| 182, 183 | side by side | max / max (183: Cultural District, Arts Landing) | names of both halves run together ("Sableye mamax Sable eye") |
| 196 | side by side | max / raid | the max's name only; no raid |
| 197 | side by side | raid / max | nothing |

A mixed reading is the harm: a max battle posted with the wrong end, a raid at a made-up gym, from one honest screenshot. A side-by-side picture is read at `READ_WIDTH` (720 pixels) across its whole width, so each half's text is a third of its usual size and is lost.

Matt (2026-10-26): when a picture shows two reports, report both if Pine can tell the halves apart ("an efficient way of reporting two simultaneously"); refuse it if it cannot tell, rather than mix them. A foldable's split is expected to show no divider bar (Matt looked it up), and the split can be moved (three places for a top/bottom split). None of this is a priority, and no change may make a single screen read worse.

## The rule that keeps single screens as they are

The whole picture is read first, as today. Panes are only ever an alternative to that reading: a cut is kept only when every pane it makes reads as exactly one screen (a raid's or a max battle's) or as no screen, with at least one screen among them; otherwise the whole reading stands, and the guard of section 4 decides whether it may be used. A single screen that the pane finder cuts by mistake therefore reads as it does today, by construction, not only on the baselines.

## What changes

### 1. Anchors: what shows a screen (pure)

One function, `screenAnchors(lines)` (`src/domain/ocr/panes.ts`), finds the text that marks a GO screen and where it is: a max battle's title (`Dynamax`, `Gigantamax`, `Eternamax` anywhere in a line, so a line merged across two panes still counts each), a raid's CP line, a countdown, "PRIVATE GROUP", the BATTLE button's words, a gym's title row. Sections 2 and 4 both use it, so the cut and the guard cannot disagree about what a screen is.

### 2. Panes: finding the halves (the reading process)

First the picture's flat margins are trimmed at its edges (black letterboxing of a tablet or of a split's pane), so proportions and pane-relative rules (`PICTURE_EDGE`, `countdownPlace`, the purple) see the screen, not the margin.

**Android's divider.** `findPanes` (pure) looks at a small greyscale copy for a band of rows (top/bottom) or of columns (side by side) that is: dark (about 30 of 255 or less: Matt's samples show grey 20), thin (at most 3% of the side: 26 pixels on the samples), flat across its length but for a centered handle (up to about 25% of the band's length: the samples' is 17.5%), changed from the rows on both sides of it, and between 15% and 85% of the side (never touching an edge). GO's own flat floor and a night sky are not dark-and-thin-and-different-from-both-sides; and section "The rule" catches what slips through. Each pane is then trimmed of its own margins.

**No divider (a foldable, the usual case there).** The whole reading's anchors (section 1) are grouped into two screens when the same kind of anchor appears twice, side by side at about one height or one above the other; the cut is the middle of the widest band of rows or columns that no line's box crosses between the groups. A cut through merged lines has no empty band: no cut. Every text cut is checked by reading its panes again (section "The rule").

**Reading width.** A picture that is wider than tall or near square (height under about 1.4 times its width, after trimming) is read whole at twice `READ_WIDTH`, so a side-by-side split's text has its usual size; a portrait phone's picture is read as today. A landscape tablet's single screen, pillarboxed, is portrait again once its margins are trimmed, and is read as today.

### 3. Each pane read as a screenshot of its own

Each pane is cropped and read by `readScreen` as if it were the whole screenshot (its lines, the heads, the purple), but for the status bar: only the top (or left) pane has the clock, so the whole picture's status lines are read once and handed to every pane in the picture's pixels, with the status band in the picture's pixels; a pane that does not touch the picture's top gets no status-bar fallback (a countdown at a pane's top must never be taken for the clock). The status bar of a landscape picture is scaled by its height, not its width, so it is read at 2× as a phone's is.

A pane with no screen (the map, a chat) is left out when another pane has one; a picture with no screen in any pane is refused as no raid screen, once.

### 4. Two screens that cannot be told apart: refused

`twoScreens(anchors)` says whether a reading shows two screens: the same anchor kind twice apart (two titles, two "PRIVATE GROUP", two BATTLE buttons), a max title with a countdown far from it (a max battle's time chip sits beside its title; the raid's countdown in 190 sits half a screen away), a max title together with a raid's CP. Acceptance test: with `findPanes` switched off, it fires on all 9 samples that show GO in both panes, and on none of the single-screen samples of `var/ocr/matt-*` and the research set. A reading with two screens and no accepted cut is refused, raid and max alike: `two-screens`, "This looks like two screens in one picture, and I could not tell them apart. Send each screen on its own." Read passively it is silent; a mention's use is given back (the reader's failure, not the member's). Beside `/raid screenshot:` or `/max screenshot:` with typed values, it is treated as a screenshot that could not be read: what was typed is reported alone, with the note, as today.

### 5. Kept: one record per pane

Each pane is a kept screenshot of its own, with its own id (the id's pattern, `screenshot.id` in party state, `shot:<id>`, `party:<id>:shot` and feedback all unchanged): its own record with `pane: { index, of, box }` (index 1 the top or left one), and its own file, a hard link of the first pane's file (a copy where the file system refuses links). The store's count and removal already go by link count, so a pair costs its bytes once, and one pane's record going never deletes the other's file. A pane left alone by `/raid` or `/max` (the other kind) is not kept.

The kept file is the whole picture: the bot never decodes an image, so it cannot crop, and the clock is in one pane only. So the other app in a split (a chat, perhaps) is kept as long as the screenshot is (Q2).

### 6. On Discord

- **A mention and passive reading.** The panes are known only after the read; the throttle's use is taken before it. So the first pane uses the image's use; a second pane takes a use of its own after the read (its own time), and when the member has none left it is said so and nothing of that pane is kept. Before any pane's question is sent, the message's count of expected reports grows by the extra pane, so the message is not deleted or marked ✅ while a pane's question waits. Each pane has its own question (gym menu, Power Spot menu, another region's Yes/No) and its own line in the one reply; "n of m" counts panes. `MAX_IMAGES_PER_MESSAGE` still counts pictures.
- **`/raid screenshot:` and `/max screenshot:`** make one report: the pane of the command's kind. With one such pane, that one, with what was typed; a pane of the other kind is named in the answer ("The max battle beside it was not reported: post the screenshot with a mention to report both."). With two panes of the command's kind: refused with the pointer of Q1 (below).
- **`/read-screenshot`** shows each pane's reading, one container a pane, named by place ("Top", "Left"; the thumbnail is the whole picture), within components v2's limits (4,000 characters, 40 components). A party's "Screenshot feedback" shows its own pane.

### 7. Time

The no-divider path can read a picture up to three times (whole, then two panes), twice at double width. The prototype measures the worst sample against `ocr.timeoutSeconds` (60 by default) and the `startBy` warning; if it does not fit, a pane is read at normal width.

### 8. Measuring

The 13 samples are labelled per pane: a label's key is the file name with `#1` or `#2`. `ocr:check` prints one line per pane. Before anything is committed: every labelled folder under `var/ocr/matt-*` and the research samples against their baselines (the skill's step 4), unchanged; the split folder's new baseline; and the same 13 with `findPanes` switched off (the foldable's path: abutting crops of the samples, no paint, so the divider cannot be found). Foldable support is claimed only after a real foldable's sample; until then the guard is what protects it.

## What it does not do

- No more than two panes (a picture-in-picture window, a tablet's free windows).
- No change to the reading of a single screen.
- No new setting.

## Matt's answers (2026-10-26)

- **Q1.** `/raid screenshot:` (or `/max screenshot:`) with two raids (two max battles) in the picture is refused with a pointer: to the mention, and, where `ocr.passive` is on, to posting it in the region's channel as it is ("This screenshot shows two raids: post it in the channel with a mention of me to report both." / "…: post it in the channel to report both."). Matt would have expected both to work, but the command is one report at a time, and the pointer is fine.
- **Q2.** The kept file is the whole picture, the other app included; the guide says so. Matt: a member who shares a whole screen with something private on the other half has shared it.

## Order of the work (for the plan)

Each task builds and passes by itself.

1. `screenAnchors`, `twoScreens`, `findPanes` and the margin trim, pure, with drawn tests (the samples' measures as numbers: a grey-20 band of 26 rows with a 17.5% handle; a flat floor that is not a divider).
2. The reading process: the whole reading, the cut, the panes read and accepted or not, the status lines handed down, the reading width; the protocol, `OcrService` and the fake worker `test/support/ocr-worker.ts` in the same task; `ocr:check` per pane and the labels' `#n`.
3. The service: `ScreenshotService.readPanes` (a list of outcomes, one per pane; a record and a linked file per pane) beside `read`, which stays as an adapter (one pane, or `two-screens` for several) so the callers build unchanged; the `two-screens` refusal for raids and max battles.
4. The mention and passive reading over `readPanes`: the second pane's use, the batch count, the questions and the reply.
5. `/raid screenshot:`, `/max screenshot:`, `/read-screenshot` and the feedback per pane; `read` removed once nothing calls it.
6. `docs/architecture/screenshots.md`, the guide's line on what is kept (Q2), the measurement, the staging checklist.
