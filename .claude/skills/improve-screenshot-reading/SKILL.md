---
name: improve-screenshot-reading
description: Improve Professor Pine's raid screenshot reader from members' feedback. Use when Matt asks to improve the screenshot reader (OCR), hands over a review folder (a copy of production's var/ocr/review/), or asks why screenshots are misread.
---

# Improving the screenshot reader

Pine reads raid screenshots with PaddleOCR models it never retrains: what goes wrong is nearly
always Pine's own code around them (the layout rules of `src/domain/ocr/raid-screen.ts`, the head
count of `tier-heads.ts`, the boss from the CP and the time of `screenshot-report.ts`, the gym
search, a threshold). This is the cycle that fixes such things from what members said. Pine never
changes its own rules: you do, here, and only the check over every sample shows that a change
breaks nothing. Background: `docs/superpowers/specs/2026-10-14-phase-7-ocr-research.md`
("Improving the reader from the feedback").

## Before anything

1. Read `docs/superpowers/ocr-improvements.md`, the log of earlier fixes: a cause that was
   chased before is not chased again.
2. Find the samples. They never enter the repository:
   - the research's 28 labelled samples: `var/ocr-research/` (with `labels.json`);
   - review folders: copies of production's `var/ocr/review/`, which Matt puts under
     `var/ocr/review-<date>/` (or names). Each screenshot `<id>.png|jpg|webp` has a record
     `<id>.json` beside it: everything the reader saw (lines of text with their boxes, the band
     where it looked for heads and the scores, the purple), what the reader made of it by itself
     (`report`), what the member typed beside it (`typed`), what it decided, the boss list of the
     moment (`bosses`), and members' feedback; `label` is the answer key when a member said it
     was right. Records hold the ids of the members who sent the screenshots and gave feedback,
     for staff and development only.

## The cycle

1. **Triage:** `npm run ocr:review -- <review folder>`. Per element, how often members said it
   was wrong and where: the gym's text was read but the search chose another gym (a nickname
   fixes it, no code: tell Matt which, `/gym edit`), or no gym was found or no text read (a
   reading problem); no clock or no countdown; the heads counted; a CP read and no boss decided.
   It also lists gym texts corrected the same way twice (suggested nicknames). Members'
   corrections and their ids are printed only with `--show-text`; read them on this machine,
   never copy them anywhere else.
2. **Pick the largest group of one cause.** Open its screenshots and their records: the lines and
   boxes say why without running the models. Write down the cause before changing anything.
3. **Change one rule or threshold**, with a unit test that draws or describes the case (never a
   member's screenshot as a fixture unless Matt agrees to that one).
4. **Check every sample**, before and after. The research samples against the committed
   baseline: `npm run ocr:check -- var/ocr-research/samples-cropped --labels
   var/ocr-research/labels.json --bosses docs/superpowers/ocr-baseline-bosses.json --baseline
   docs/superpowers/ocr-baseline.json` (the bosses of the samples' days, so the boss is scored
   whatever today's feed lists).
   Each review folder against a baseline of its own, written before the change and kept beside
   the folder, never committed: `npm run ocr:check -- <folder> --write-baseline
   <folder>.before.json` first, then `--baseline <folder>.before.json` after it (a review
   folder's samples are decided among their own records' boss lists, so the comparison holds
   whenever it is run). A threshold is chosen by a sweep over all samples, as in the research.
5. **Judge:** no sample may go from right to wrong (`WORSE` lines, exit status 1) unless you can
   say why the old answer was right by chance, and Matt agrees.
6. **Update** the baseline (the command of step 4 with `--write-baseline
   docs/superpowers/ocr-baseline.json` in place of `--baseline`) and append to `docs/superpowers/ocr-improvements.md`: the date, the failure
   group, its cause, the fix, the scores before and after.
7. Commit the code, its tests, the baseline and the log together. Never commit a screenshot, a
   record from a review folder, or anything a member wrote.

## What may never be committed

Screenshots, review records (`<id>.json`), members' ids, names and corrections (neither in a
commit nor in a printout you pass on), gym texts read off members' screenshots beyond what a test
needs (and then invented ones), production gym rows, a review folder's own baseline. The committed
baseline holds the research samples' file names and right/wrong only.

## When the models are the problem

If the triage ever shows text the model itself cannot read (the lines in the records are wrong
where the screen is clear), say so to Matt: retraining the recogniser on crops of corrected
samples is possible, but a project of its own. A new model version is a change of `OCR_ASSETS`
(`src/domain/ocr/assets.ts`), measured with `ocr:check` over every sample first.
