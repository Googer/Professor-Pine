# Phase 7P: Split-Screen Screenshots: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a screenshot of two screens (Android's split screen, a foldable's or the iPhone Duo's side by side, GO beside another app) is cut into its panes, each read and reported as a screenshot of its own; a picture of two screens that cannot be told apart is refused `two-screens` (design approved by Matt and reviewed, 2026-10-26).

- **Task 1, the pure rules:** what marks a screen (`screenAnchors`), two screens (`twoScreens`), margins, Android's divider and a foldable's spine (`findDivider`, checked against the text by `crossesCut`), the text's cut and the seam cut, what a pane shows (`paneShows`: a screen, none, unclear) and whether a cut is kept.
- **Task 2, the reading process:** the whole picture read first, then its panes, each at `READ_WIDTH`; the status lines read once and handed to every pane; the reading width chosen by the panes; a budget for the panes within the timeout (`panesWithinMs`, a reading without them `late`); `ocr:check` scores per pane (`#n` labels, `{"none": true}`, `--no-divider`).
- **Task 3, the service:** `ScreenshotService.readPanes`, one outcome, record and id per pane, the second pane's file a hard link; two screens refused `two-screens`, two of the caller's kind kept as refused `several`.
- **Task 4, mentions, passive reading and the region's board:** each pane a report of its own (in the board a DM line per pane, named by its place), the batch count grown by the panes (held ones too), a second pane's own throttle use given back when it is refused.
- **Task 5, the commands:** `/raid screenshot:` and `/max screenshot:` take the pane of their kind and say after their answer what was beside it; `/read-screenshot` and "Screenshot feedback" by pane; one wording for "report both" (`reportBothWords`) that follows passive reading.
- **Task 6, docs:** the area doc's "Split screens", the guide's line on what is kept, the improvements log, the staging checklist.

**Tech stack:** TypeScript 6.0, Node 24, discord.js 14, PaddleOCR in onnxruntime, sharp, Vitest. No new dependency, no migration, no command option changed (no deploy needed).

**Spec:** `docs/superpowers/specs/2026-10-26-split-screen-screenshots-design.md` (Matt's Q1 and Q2), and the brief `.superpowers/sdd/7p-split-screens/prototype-brief.md` (git-ignored) with what changed since: the iPhone Duo (reading width by the panes, its grey spine), status bars per device, the 22b and 21 samples that were splits already, two-part chips never countdowns.

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto/7p` (worktree `var/proto-7p`), one commit per task, on `ocr-fixes` 75cea790 (typescript-migration 8e8877f6 plus the Gantt rows; first built on a39b9875 and rebased, with the region board's screenshots of 8R-9F read pane by pane). Each commit typechecks and passes its tests; on the tip the full check passes (10,262 tests), the build passes and the database suite passes (611 tests).

**Measured on real screenshots (`ocr:check`, the real models):** every labelled folder against its baseline, nothing from right to wrong; `twoScreens` fires on no single screen (0 of 28 research, 0 of 124 in the matt-* single folders; in 22b only on its three splits, which are cut and read). Matt's 13 splits (`var/ocr/matt-2026-10-26-split/`, labelled per pane): all cut by the divider, every pane read as the right kind, countdowns 23/23; with the divider search off 12 cut by the text and `twoScreens` on all 10 with GO in both panes. The fakes (`var/ocr/fake-foldable-2026-10-26/`, 68: Fold with one and two status bars, iPhone Duo letterboxed and full height, Matt's splits with the divider cut out, GO beside a drawn chat about raids or a notes page, tablet-shaped single screens): nothing of another app reaches a GO pane, no single screen cut. Slowest split 8.6 s quiet, nothing late.

**Reviews:**

- **The prototype:** an Opus reviewer (1–11: the note beside a report overwritten by the deferred reply's first followup, a held pane let the message be deleted, the Duo's spine not a divider, the timeout margin, and seven Minor), fix round 1.
- **Fix round 1:** an Opus re-review (R1–R7: a late split fell back to the mixed whole reading, the deadline per pane and on another clock, the divider never checked against the text, tablet shapes, a chat's lone time, the `several` wording), fix round 2.
- **Fix round 2:** an Opus re-review, ready (F1–F3 Minor: the pane prediction floored at 0.8 of the whole, `performance.now`, the max refusal's words), fix round 3.
- **The rebase** onto typescript-migration 8e8877f6 (8E, 8R-9F's board screenshots answered by DM, 8R-9G): an Opus review, ready (upstream's board path kept, the board read pane by pane through the same `readOne` and `readPanes`). All folded into the six commits.

**Conventions:** read `CLAUDE.md` and `docs/architecture/screenshots.md`, `discord-framework.md` and `testing.md`, and the skill `improve-screenshot-reading` (step 4).

**Inside the plan:** each commit needs only the typecheck and its own test files. The full check, the build and the database suite run once on the tip, and the real-model `ocr:check` of the regression set, Matt's 13 and the fakes before the branch is merged (the reader changes). Work in `.claude/worktrees/ocr-fixes` on `ocr-fixes`; never commit in the main checkout.

## Review Focus

- A single screenshot of any folder: read whole, as before 7P; never cut, never refused `two-screens` (tasks 1, 2; `ocr:check`).
- A split under load: the panes' budget predicted once, a late divider or text cut refused, never the mixed whole reading reported (task 2, `screen-reader.test`).
- `/raid screenshot:` with a max battle beside the raid: the raid reported, the note sent after the answer (task 5, the order of sends).
- A member with one use left posts a split: the first pane reported, the message kept, the second pane's reply reaches it (task 4).
- A split posted in the region's board: each pane its own DM line, `two-screens` refused with its use given back, nothing of upstream's board answers lost (task 4, `mention.board.test`).
- GO beside another app: the other pane shows nothing; nothing of its text reaches the GO pane (task 1 `paneShows`, the fakes).

---

## Tasks

### Task 1: 7P task 1: what marks a screen, two screens, margins, the divider and the text's cut

Prototype commit: `19e61e956b9c2f4a6d6a4f506a00d43e41f58969`

The pure part of split screenshots (src/domain/ocr/panes.ts): screenAnchors (a max
battle's title, a raid's CP among the tallest text, an h:mm:ss countdown, PRIVATE GROUP,
the BATTLE button, a gym's title), twoScreens and screensApart (a kind a screen shows
once twice apart, two titles side by side, a max title with a CP or with a countdown far
from it), trimMargins (flat dark margins, loose for a pane), findDivider (Android's dark
band, its black corners in landscape included), textCut and seamCut (where no line
crosses and the picture changes most), paneShows, cutKept and paneSide. A joined row
keeps its pieces as TextLine.parts, so two panes side by side read into one line still
give each pane's anchors.

**Files:**

```
 src/domain/ocr/image.ts           |  15 ++
 src/domain/ocr/panes.test.ts      | 393 +++++++++++++++++++++++++++++++++++
 src/domain/ocr/panes.ts           | 649 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/ocr/text-model.test.ts |  13 ++
 src/domain/ocr/text-model.ts      |   1 +
 src/text-spelling.test.ts         |   4 +
 6 files changed, 1075 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/ocr/panes.test.ts src/domain/ocr/text-model.test.ts src/text-spelling.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 19e61e956b9c2f4a6d6a4f506a00d43e41f58969 -- src test scripts data docs/architecture docs/guides docs/superpowers/ocr-improvements.md docs/superpowers/plans/2026-10-27-phase-7p-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `7P task 1: what marks a screen, two screens, margins, the divider and the text's cut`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/ocr/image.ts b/src/domain/ocr/image.ts
index 5751230c..bb254a50 100644
--- a/src/domain/ocr/image.ts
+++ b/src/domain/ocr/image.ts
@@ -25,6 +25,21 @@ export interface TextLine {
   text: string;
   confidence: number;
   box: Box;
+  /**
+   * The pieces a row was joined from, when more than one (`groupLines`), left to right: each
+   * one's box and how many characters of `text` it gave (a space between two). Two panes side by
+   * side are read into one line per row; the pieces tell them apart (plan 7P).
+   */
+  parts?: { box: Box; length: number }[];
+}
+
+/** The line with its box, and its parts' boxes, moved by `move`. */
+export function movedLine(line: TextLine, move: (box: Box) => Box): TextLine {
+  return {
+    ...line,
+    box: move(line.box),
+    ...(line.parts ? { parts: line.parts.map((part) => ({ ...part, box: move(part.box) })) } : {}),
+  };
 }
 
 export const boxHeight = (box: Box): number => box.y1 - box.y0;
diff --git a/src/domain/ocr/panes.test.ts b/src/domain/ocr/panes.test.ts
new file mode 100644
index 00000000..cb4ddb93
--- /dev/null
+++ b/src/domain/ocr/panes.test.ts
@@ -0,0 +1,393 @@
+import { describe, expect, it } from 'vitest';
+import type { GreyImage, TextLine } from './image.js';
+import {
+  crossesCut,
+  cutKept,
+  findDivider,
+  paneShows,
+  panesOf,
+  paneSide,
+  screenAnchors,
+  seamCut,
+  textCut,
+  trimMargins,
+  twoScreens,
+} from './panes.js';
+
+const line = (text: string, x0: number, y0: number, x1: number, y1: number): TextLine => ({
+  text,
+  confidence: 0.95,
+  box: { x0, y0, x1, y1 },
+});
+
+/**
+ * A made-up picture: a texture that changes along both sides (what a game screen looks like to
+ * these rules), then `paint` draws over it.
+ */
+function picture(
+  width: number,
+  height: number,
+  paint: (x: number, y: number) => number | undefined = () => undefined,
+): GreyImage {
+  const data = new Float32Array(width * height);
+  for (let y = 0; y < height; y++) {
+    for (let x = 0; x < width; x++) {
+      data[y * width + x] = paint(x, y) ?? 60 + ((x * 7 + y * 13) % 140);
+    }
+  }
+  return { width, height, data };
+}
+
+/** Matt's samples scaled to the small copy: 1080 × 2448 at 800 high. */
+const W = 353;
+const H = 800;
+const WHOLE = { x0: 0, y0: 0, x1: W, y1: H };
+
+/**
+ * Android's divider as on the samples: grey 20, 26 of 2448 rows (9 here) at `middle`, with a
+ * handle of 17.5% of its length in its middle.
+ */
+function divider(middle: number) {
+  const from = Math.round(H * middle) - 4;
+  return (x: number, y: number) => {
+    if (y < from || y >= from + 9) return undefined;
+    const handle = Math.abs(x - W / 2) < (W * 0.175) / 2 && y >= from + 3 && y < from + 6;
+    return handle ? 220 : 20;
+  };
+}
+
+describe('findDivider', () => {
+  it('finds Android’s divider between a top and a bottom pane, at each of its places', () => {
+    for (const middle of [0.28, 0.5, 0.72]) {
+      const cut = findDivider(picture(W, H, divider(middle)), WHOLE);
+      expect(cut?.axis).toBe('rows');
+      expect(((cut?.from ?? 0) + (cut?.to ?? 0)) / 2 / H).toBeCloseTo(middle, 1);
+    }
+  });
+
+  it('finds the dark gap of a landscape split, the panes’ black corners included', () => {
+    // 2448 × 1080 at 800 wide: black from 1141 to 1307 with the grey band in its middle.
+    const grey = picture(800, 353, (x) =>
+      x >= 373 && x < 427 ? (x >= 396 && x < 404 ? 20 : 0) : undefined,
+    );
+    expect(findDivider(grey, { x0: 0, y0: 0, x1: 800, y1: 353 })).toEqual({
+      axis: 'columns',
+      from: 373,
+      to: 427,
+    });
+  });
+
+  it('finds a foldable’s spine of any one grey between two panes side by side', () => {
+    // A Duo of 2007 × 2853 at 800 high: a spine of 12 columns (3 here) of grey 60, the panes
+    // filling the height.
+    const spine = picture(563, 800, (x) => (x >= 280 && x < 283 ? 60 : undefined));
+    expect(findDivider(spine, { x0: 0, y0: 0, x1: 563, y1: 800 })).toEqual({
+      axis: 'columns',
+      from: 280,
+      to: 283,
+    });
+  });
+
+  it('finds the spine beside a dark app as grey as it, by the picture on its other side', () => {
+    // A chat's dark background and text (grey 40 to 79) right of a grey-60 spine; GO left of it.
+    const besideChat = picture(563, 800, (x, y) =>
+      x >= 280 && x < 283 ? 60 : x >= 283 ? 40 + ((x * 3 + y * 5) % 40) : undefined,
+    );
+    expect(findDivider(besideChat, { x0: 0, y0: 0, x1: 563, y1: 800 })).toEqual({
+      axis: 'columns',
+      from: 280,
+      to: 283,
+    });
+  });
+
+  it('takes no flat floor, night sky or edge for a divider', () => {
+    // A dark floor a fifth of the screen high: not thin.
+    const floor = picture(W, H, (_x, y) => (y >= 500 && y < 660 ? 25 : undefined));
+    // A thin dark band with dark above it: no picture on both sides.
+    const sky = picture(W, H, (_x, y) => (y < 400 ? 10 + (y % 3) : y < 409 ? 20 : undefined));
+    // A thin dark band near the bottom edge (the navigation bar's).
+    const edge = picture(W, H, (_x, y) => (y >= 760 && y < 769 ? 20 : undefined));
+    // A band that is light outside the handle's place.
+    const light = picture(W, H, (x, y) => (y >= 396 && y < 405 ? (x < 50 ? 200 : 20) : undefined));
+    for (const grey of [floor, sky, edge, light]) expect(findDivider(grey, WHOLE)).toBeNull();
+  });
+});
+
+describe('trimMargins', () => {
+  it('trims black bars of a letterboxed screen, and nothing of a screen without them', () => {
+    const boxed = picture(W, H, (_x, y) => (y < 80 || y >= 720 ? 0 : undefined));
+    expect(trimMargins(boxed)).toEqual({ x0: 0, y0: 80, x1: W, y1: 720 });
+    expect(trimMargins(picture(W, H))).toEqual(WHOLE);
+  });
+
+  it('keeps a margin thinner than 3% of its side (a dark status bar’s top rows)', () => {
+    const thin = picture(W, H, (_x, y) => (y < 12 ? 0 : undefined));
+    expect(trimMargins(thin)).toEqual(WHOLE);
+  });
+
+  it('trims a pane’s pillarbox within its own box', () => {
+    const pillar = picture(W, H, (x, y) => (y >= 400 && (x < 60 || x >= 293) ? 0 : undefined));
+    expect(trimMargins(pillar, { x0: 0, y0: 400, x1: W, y1: H })).toEqual({
+      x0: 60,
+      y0: 400,
+      x1: 293,
+      y1: H,
+    });
+  });
+});
+
+/** A max battle's screen's lines, `dx`, `dy` from the top left. */
+function maxScreen(dx: number, dy: number, title = 'Dynamax Sableye'): TextLine[] {
+  return [
+    line('17:06', dx + 600, dy + 560, dx + 680, dy + 590),
+    line(title, dx + 200, dy + 600, dx + 880, dy + 660),
+    line('SMI AWARE', dx + 420, dy + 690, dx + 660, dy + 715),
+    line('BATTLE', dx + 400, dy + 760, dx + 520, dy + 790),
+    line('PRIVATE GROUP', dx + 420, dy + 880, dx + 660, dy + 905),
+  ];
+}
+
+/** A hatched raid's screen's lines, `dx`, `dy` from the top left. */
+function raidScreen(dx: number, dy: number): TextLine[] {
+  return [
+    line('Historic Garden', dx + 200, dy + 60, dx + 700, dy + 100),
+    line('CP54793', dx + 300, dy + 140, dx + 780, dy + 230),
+    line('Palkia', dx + 400, dy + 240, dx + 680, dy + 300),
+    line('0:31:43', dx + 860, dy + 600, dx + 1000, dy + 640),
+    line('BATTLE using a Remote Raid Pass', dx + 400, dy + 760, dx + 780, dy + 790),
+    line('PRIVATE GROUP', dx + 420, dy + 880, dx + 660, dy + 905),
+    line('0:12:01', dx + 100, dy + 1000, dx + 180, dy + 1030),
+  ];
+}
+
+describe('screenAnchors and twoScreens', () => {
+  it('sees one screen in a raid’s or a max battle’s reading, a nearby raid’s timer too', () => {
+    expect(twoScreens(screenAnchors(raidScreen(0, 0)))).toBe(false);
+    expect(twoScreens(screenAnchors(maxScreen(0, 0)))).toBe(false);
+  });
+
+  it('takes no two-part chip for a countdown (a max battle’s 17:48, a map’s 18:14)', () => {
+    const map = [line('18:14', 100, 100, 180, 130), line('3:09', 400, 900, 460, 930)];
+    expect(screenAnchors(map)).toEqual([]);
+  });
+
+  it('sees two screens one above the other: two titles, or a title and a raid’s CP', () => {
+    expect(twoScreens(screenAnchors([...maxScreen(0, 0), ...maxScreen(0, 1200)]))).toBe(true);
+    expect(twoScreens(screenAnchors([...maxScreen(0, 0), ...raidScreen(0, 1200)]))).toBe(true);
+  });
+
+  it('sees a max battle’s title with a countdown far from it (190: the raid’s, half a screen away)', () => {
+    const lines = [...maxScreen(0, 0).slice(1, 3), line('0:32:25', 700, 1900, 860, 1940)];
+    expect(twoScreens(screenAnchors(lines))).toBe(true);
+  });
+
+  it('counts each title and button of a line read across two panes', () => {
+    const merged = [
+      line('Dynamax Sableye Dynamax Sableye', 100, 600, 1700, 660),
+      line('PRIVATE GROUP PRIVATE GROUP', 300, 880, 1500, 905),
+    ];
+    const anchors = screenAnchors(merged);
+    expect(anchors.filter((a) => a.kind !== 'title').map((a) => a.kind)).toEqual([
+      'max-title',
+      'max-title',
+      'private-group',
+      'private-group',
+    ]);
+    expect(twoScreens(anchors)).toBe(true);
+  });
+});
+
+describe('two gyms’ titles', () => {
+  /** An egg's screen: its title, a countdown and the buttons, `dx` from the left. */
+  const egg = (dx: number, name: string): TextLine[] => [
+    line(name, dx + 200, 130, dx + 800, 190),
+    line('0:02:49', dx + 400, 600, dx + 560, 640),
+    line('PRIVATE GROUP', dx + 420, 880, dx + 660, 905),
+  ];
+
+  it('sees two screens in two titles side by side (two eggs of a foldable, one row read)', () => {
+    const [left, right] = [egg(0, 'Temple Garden'), egg(1000, 'Sixth Church')];
+    const rows = left.map((one, i) => {
+      const other = right[i] ?? one;
+      return {
+        ...one,
+        text: `${one.text} ${other.text}`,
+        box: { ...one.box, x1: other.box.x1 },
+        parts: [
+          { box: one.box, length: one.text.length },
+          { box: other.box, length: other.text.length },
+        ],
+      };
+    });
+    expect(twoScreens(screenAnchors(rows))).toBe(true);
+  });
+
+  it('sees one screen in a name over two lines', () => {
+    const lines = [
+      line('Sixth Presbyterian', 200, 130, 800, 190),
+      line('Church', 200, 200, 420, 260),
+    ];
+    expect(twoScreens(screenAnchors([...lines, ...egg(0, 'x').slice(1)]))).toBe(false);
+  });
+});
+
+describe('textCut', () => {
+  it('cuts two screens side by side where the picture changes, between the screens’ text', () => {
+    // 2 × 1000 wide and 1200 high, the right pane a picture of its own from x 1000 on; the
+    // small copy at a fifth.
+    const lines = [...maxScreen(0, 0), ...raidScreen(1000, 0)];
+    const grey = picture(400, 240, (x, y) => (x >= 200 ? 30 + ((x * 3 + y * 5) % 40) : undefined));
+    const cut = textCut(lines, grey, 0.2, { x0: 0, y0: 0, x1: 400, y1: 240 });
+    expect(cut?.axis).toBe('columns');
+    expect(cut?.from).toBe(200);
+  });
+
+  it('cuts nothing where a line read across both panes leaves no band free', () => {
+    const lines = [
+      ...maxScreen(0, 0).filter((one) => !one.text.startsWith('PRIVATE')),
+      ...raidScreen(1000, 0).filter((one) => !one.text.startsWith('PRIVATE')),
+      line('PRIVATE GROUP PRIVATE GROUP', 0, 880, 2000, 905),
+      line('a caption over the middle of everything', 0, 300, 2000, 1100),
+    ];
+    const grey = picture(400, 240);
+    expect(textCut(lines, grey, 0.2, { x0: 0, y0: 0, x1: 400, y1: 240 })).toBeNull();
+  });
+
+  it('cuts nothing on one screen', () => {
+    expect(
+      textCut(raidScreen(0, 0), picture(200, 240), 0.2, { x0: 0, y0: 0, x1: 200, y1: 240 }),
+    ).toBeNull();
+  });
+});
+
+describe('seamCut', () => {
+  // 2000 × 1200 at a fifth: a map on the left, a screen on the right from x 1000.
+  const meeting = picture(400, 240, (x, y) =>
+    x >= 200 ? 30 + ((x * 3 + y * 5) % 40) : 150 + ((x + y) % 60),
+  );
+  const box = { x0: 0, y0: 0, x1: 400, y1: 240 };
+
+  it('cuts a wide picture where one screen meets something else, no text crossing there', () => {
+    expect(seamCut(raidScreen(1000, 0), meeting, 0.2, box)).toEqual({
+      axis: 'columns',
+      from: 200,
+      to: 200,
+    });
+  });
+
+  it('cuts nothing where text crosses the middle, or where the picture goes on alike', () => {
+    const across = [...raidScreen(1000, 0), line('a line over the middle', 300, 500, 1700, 540)];
+    expect(seamCut(across, meeting, 0.2, box)).toBeNull();
+    expect(seamCut(raidScreen(1000, 0), picture(400, 240), 0.2, box)).toBeNull();
+  });
+});
+
+describe('crossesCut', () => {
+  it('tells a cut that text runs across (one screen with a grey band through its words)', () => {
+    // A cut of columns 99 to 101 at a tenth of the picture's pixels (990 to 1010).
+    const cut = { axis: 'columns' as const, from: 99, to: 101 };
+    const across = [line('Temple Sinai Garden', 700, 200, 1300, 260)];
+    const beside = [line('Temple', 700, 200, 980, 260), line('Garden', 1020, 200, 1300, 260)];
+    // A few pixels past the band are the band's own edges read, not text across it.
+    const touching = [line('Garden', 1006, 200, 1300, 260)];
+    expect(crossesCut(across, cut, 0.1)).toBe(true);
+    expect(crossesCut(beside, cut, 0.1)).toBe(false);
+    expect(crossesCut(touching, cut, 0.1)).toBe(false);
+    // A row joined across two panes is its pieces, each on its own side.
+    const joined = {
+      ...line('BATTLE BATTLE', 300, 700, 1700, 740),
+      parts: [
+        { box: { x0: 300, y0: 700, x1: 500, y1: 740 }, length: 6 },
+        { box: { x0: 1500, y0: 700, x1: 1700, y1: 740 }, length: 6 },
+      ],
+    };
+    expect(crossesCut([joined], cut, 0.1)).toBe(false);
+    // One piece the detector read across the band whose words are two screens' (two titles
+    // that meet at a Duo's spine): it shows the band is between two screens, not through one.
+    const titles = [line('Dynamax Skwovet Dynamax Sneasel', 5, 1785, 1994, 1904)];
+    expect(crossesCut(titles, cut, 0.1)).toBe(false);
+  });
+});
+
+describe('paneSide', () => {
+  it('names panes one above the other top and bottom, side by side left and right', () => {
+    const rows = [
+      { index: 1, box: { x0: 0, y0: 0, x1: 1080, y1: 1212 } },
+      { index: 2, box: { x0: 0, y0: 1236, x1: 1080, y1: 2448 } },
+    ];
+    const columns = [
+      { index: 1, box: { x0: 70, y0: 0, x1: 1141, y1: 1080 } },
+      { index: 2, box: { x0: 1307, y0: 0, x1: 2378, y1: 1080 } },
+    ];
+    expect(rows.map((pane) => paneSide(pane, rows))).toEqual(['top', 'bottom']);
+    expect(columns.map((pane) => paneSide(pane, columns))).toEqual(['left', 'right']);
+    // Panes trimmed of their own margins still stand one above the other.
+    const trimmed = [rows[0], { index: 2, box: { x0: 208, y0: 1300, x1: 872, y1: 2448 } }].filter(
+      (pane) => pane !== undefined,
+    );
+    expect(trimmed.map((pane) => paneSide(pane, trimmed))).toEqual(['top', 'bottom']);
+  });
+});
+
+describe('panes, paneShows and cutKept', () => {
+  it('cuts a box into the panes before and after the cut', () => {
+    expect(
+      panesOf({ x0: 0, y0: 10, x1: 100, y1: 200 }, { axis: 'rows', from: 90, to: 99 }),
+    ).toEqual([
+      { x0: 0, y0: 10, x1: 100, y1: 90 },
+      { x0: 0, y0: 99, x1: 100, y1: 200 },
+    ]);
+  });
+
+  it('keeps a cut whose panes each show one screen or none, one at least a screen', () => {
+    const empty = {
+      cp: null,
+      countdown: null,
+      countdownPlace: null,
+      countdownBox: null,
+      gym: null,
+    };
+    const raid = paneShows({ ...empty, cp: 54793 }, screenAnchors(raidScreen(0, 0)));
+    const max = paneShows({ ...empty, max: {} }, screenAnchors(maxScreen(0, 0)));
+    const map = paneShows(empty, []);
+    // Only the BATTLE button and PRIVATE GROUP: the bottom of a screen cut through.
+    const bottom = paneShows(empty, screenAnchors(raidScreen(0, 0).slice(4, 6)));
+    expect([raid, max, map, bottom]).toEqual(['raid', 'max', 'none', 'unclear']);
+    expect(cutKept([raid, max])).toBe(true);
+    expect(cutKept([map, raid])).toBe(true);
+    expect(cutKept([map, map])).toBe(false);
+    expect(cutKept([raid, bottom])).toBe(false);
+  });
+
+  it('takes an egg by its gym and a countdown alone and centred, never another app’s text', () => {
+    const empty = { cp: null, max: null, gym: 'Old Fountain', countdown: 1800 };
+    const egg = { x0: 400, y0: 600, x1: 560, y1: 640 };
+    const countdown = [{ kind: 'countdown' as const, box: egg }];
+    expect(paneShows({ ...empty, countdownPlace: 'centre', countdownBox: egg }, countdown)).toBe(
+      'raid',
+    );
+    // A countdown alone in its line off the middle (a chat message that is only "0:32:10", a
+    // map's raid timer) is no screen; centered without a gym read it may be an egg read badly:
+    // unclear, so the whole reading stands and no egg is dropped.
+    expect(paneShows({ ...empty, countdownPlace: null, countdownBox: egg }, countdown)).toBe(
+      'none',
+    );
+    expect(
+      paneShows({ ...empty, gym: null, countdownPlace: 'centre', countdownBox: egg }, countdown),
+    ).toBe('unclear');
+    // A chat: "omw, 0:32:10 left on mine" in a line of its own, centred by chance, under the
+    // channel's name, and "CP 54793 is the hundo right?" (no CP alone in its line).
+    const chat = [
+      line('# raids-north-side', 100, 96, 400, 133),
+      line('omw, 0:32:10 left on mine', 100, 425, 980, 458),
+      line('CP 54793 is the hundo right?', 100, 382, 980, 420),
+    ];
+    const sentence = { x0: 100, y0: 425, x1: 980, y1: 458 };
+    expect(
+      paneShows(
+        { ...empty, gym: '# raids-north-side', countdownPlace: 'centre', countdownBox: sentence },
+        screenAnchors(chat),
+      ),
+    ).toBe('none');
+  });
+});
diff --git a/src/domain/ocr/panes.ts b/src/domain/ocr/panes.ts
new file mode 100644
index 00000000..7eb67092
--- /dev/null
+++ b/src/domain/ocr/panes.ts
@@ -0,0 +1,649 @@
+import { boxHeight, type Box, type GreyImage, type TextLine } from './image.js';
+
+/**
+ * Split screens (plan 7P, design `2026-10-26-split-screen-screenshots-design.md`): what marks a
+ * Pokémon GO screen in the text read (`screenAnchors`), whether a reading shows two screens
+ * (`twoScreens`), the flat margins of a picture (`trimMargins`), Android's divider between two
+ * panes (`findDivider`) and a cut found from the text where there is none (`textCut`). Pure: the
+ * reading process gives the pictures as small greyscale copies (values 0 to 255) and the lines in
+ * the picture's pixels.
+ */
+
+/** What marks a GO screen in its text. */
+export type AnchorKind =
+  /** A max battle's title: "Dynamax", "Gigantamax" or "Eternamax" (and the species after it). */
+  | 'max-title'
+  /** A hatched raid's CP, among the tallest text read. */
+  | 'cp'
+  /** A countdown h:mm:ss (two parts, a max battle's chip or a map's timer, are none). */
+  | 'countdown'
+  | 'private-group'
+  /** The BATTLE button's word. */
+  | 'battle'
+  /**
+   * A gym's title: the tallest text near the top. A name runs over two lines, so two titles show
+   * two screens only side by side (`screensApart`).
+   */
+  | 'title';
+
+export interface Anchor {
+  kind: AnchorKind;
+  box: Box;
+}
+
+const MAX_WORD = /dynamax|gigantamax|eternamax/gi;
+/** As `raid-screen.ts` reads the CP: digits after at most three other characters. */
+const CP = /^\D{0,3}?(\d{3,6})$/;
+/** A CP stands among the tallest text: at least this share of the tallest line's height. */
+const CP_TALL = 0.6;
+/** h:mm:ss, a space the reader may put in after a separator (`0: 44:52`). */
+const COUNTDOWN = /\d{1,2}[:.] ?[0-5]\d[:.] ?[0-5]\d/g;
+const COUNTDOWN_ONE = /\d{1,2}[:.] ?[0-5]\d[:.] ?[0-5]\d/;
+/** A gym's title stands in this top share of what was read, among its tallest words. */
+const TITLE_TOP = 0.2;
+const TITLE_TALL = 0.8;
+const LETTERS = /[a-z]{3}/i;
+/** The game writes these in capitals; other text that says "battle" or "group" does not. */
+const PRIVATE_GROUP = /PRIVATE\s*GROUP/g;
+const BATTLE = /BATTLE(?![A-Za-z])/g;
+
+/**
+ * Each place `words` matches in a piece of text, its box from the match to the next match's
+ * start (or the end), each character taken to be as wide as the average: a piece read across
+ * two panes ("PRIVATE GROUP PRIVATE GROUP") gives one anchor per pane.
+ */
+function wordsIn(piece: TextLine, words: RegExp, kind: AnchorKind): Anchor[] {
+  const { box, text } = piece;
+  const perCharacter = (box.x1 - box.x0) / Math.max(1, text.length);
+  const hits = [...text.matchAll(words)];
+  return hits.map((hit, i) => ({
+    kind,
+    box: {
+      ...box,
+      x0: box.x0 + hit.index * perCharacter,
+      x1: box.x0 + (hits[i + 1]?.index ?? text.length) * perCharacter,
+    },
+  }));
+}
+
+/**
+ * The pieces a line was joined from (`TextLine.parts`), each with its own text and box; the
+ * line itself when it is one piece. Two panes side by side are read into one line per row.
+ */
+function piecesOf(line: TextLine): TextLine[] {
+  if (!line.parts) return [line];
+  let start = 0;
+  return line.parts.map((part) => {
+    const text = line.text.slice(start, start + part.length);
+    start += part.length + 1;
+    return { text, confidence: line.confidence, box: part.box };
+  });
+}
+
+/**
+ * The anchors of a reading's lines (the status bar's left out by the caller), piece by piece: a
+ * row read across two panes gives each pane's anchors.
+ */
+export function screenAnchors(lines: readonly TextLine[]): Anchor[] {
+  const pieces = lines.flatMap(piecesOf);
+  const tallest = Math.max(0, ...pieces.map((piece) => boxHeight(piece.box)));
+  const anchors: Anchor[] = [];
+  // Titles: the tallest words in the top fifth of what was read, as `raid-screen.ts` finds a gym.
+  const top = Math.min(...pieces.map((piece) => piece.box.y0));
+  const bottom = Math.max(...pieces.map((piece) => piece.box.y1));
+  const nearTop = pieces.filter(
+    (piece) =>
+      piece.box.y1 < top + (bottom - top) * TITLE_TOP &&
+      LETTERS.test(piece.text) &&
+      !COUNTDOWN_ONE.test(piece.text),
+  );
+  const tallestNearTop = Math.max(0, ...nearTop.map((piece) => boxHeight(piece.box)));
+  for (const piece of nearTop) {
+    if (boxHeight(piece.box) >= tallestNearTop * TITLE_TALL) {
+      anchors.push({ kind: 'title', box: piece.box });
+    }
+  }
+  for (const piece of pieces) {
+    const { box, text } = piece;
+    anchors.push(...wordsIn(piece, MAX_WORD, 'max-title'));
+    const compact = text.replace(/\s+/g, '');
+    if (CP.test(compact) && boxHeight(box) >= tallest * CP_TALL) anchors.push({ kind: 'cp', box });
+    anchors.push(...wordsIn(piece, COUNTDOWN, 'countdown'));
+    anchors.push(...wordsIn(piece, PRIVATE_GROUP, 'private-group'));
+    anchors.push(...wordsIn(piece, BATTLE, 'battle'));
+  }
+  return anchors;
+}
+
+/** Kinds a single screen shows once at most (a raid screen may show a nearby raid's countdown). */
+const ONCE: ReadonlySet<AnchorKind> = new Set(['max-title', 'cp', 'private-group', 'battle']);
+/**
+ * A max battle's time chip stands beside its title: a countdown farther from the title than this
+ * many of the title's heights belongs to another screen.
+ */
+const CHIP_REACH = 3;
+
+/** The space between two boxes: 0 when they touch or overlap. */
+function gapBetween(a: Box, b: Box): number {
+  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
+  const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
+  return Math.hypot(dx, dy);
+}
+
+/**
+ * Two boxes at about one height (their rows overlap) with a gap
+ * between them at least as wide as the taller one is high: two titles of two panes.
+ */
+function sideBySide(a: Box, b: Box): boolean {
+  const rows = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
+  const gap = Math.max(a.x0 - b.x1, b.x0 - a.x1);
+  return rows > 0 && gap >= Math.max(boxHeight(a), boxHeight(b));
+}
+
+/** Whether two boxes share pixels (boxes that only touch do not: two words of one line). */
+function overlap(a: Box, b: Box): boolean {
+  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
+}
+
+/**
+ * Two anchors that cannot be of one screen, or undefined: the same kind twice where a screen
+ * shows it once, apart (not one line read twice); a max battle's title with a raid's CP; a max
+ * battle's title with a countdown far from it.
+ */
+export function screensApart(anchors: readonly Anchor[]): [Anchor, Anchor] | undefined {
+  for (const [i, a] of anchors.entries()) {
+    for (const b of anchors.slice(i + 1)) {
+      if (a.kind === b.kind && ONCE.has(a.kind)) {
+        if (!overlap(a.box, b.box)) return [a, b];
+        continue;
+      }
+      if (a.kind === 'title' && b.kind === 'title') {
+        if (sideBySide(a.box, b.box)) return [a, b];
+        continue;
+      }
+      const title = a.kind === 'max-title' ? a : b.kind === 'max-title' ? b : undefined;
+      const other = title === a ? b : a;
+      if (!title || other === title) continue;
+      if (other.kind === 'cp') return [a, b];
+      if (
+        other.kind === 'countdown' &&
+        gapBetween(title.box, other.box) > CHIP_REACH * boxHeight(title.box)
+      ) {
+        return [a, b];
+      }
+    }
+  }
+  return undefined;
+}
+
+/** Whether a reading's anchors show two screens (`screensApart`). */
+export function twoScreens(anchors: readonly Anchor[]): boolean {
+  return screensApart(anchors) !== undefined;
+}
+
+/** How the panes of a picture lie: one above the other (`rows`) or side by side (`columns`). */
+export type CutAxis = 'rows' | 'columns';
+
+/**
+ * Where a picture is cut: along `axis`, the panes before `from` and from `to` on (the divider's
+ * band between them; a text cut's `from` and `to` are one place).
+ */
+export interface Cut {
+  axis: CutAxis;
+  from: number;
+  to: number;
+}
+
+/**
+ * Text read across a place this far past a cut's band (in the picture's pixels) runs across it;
+ * less is the band's own edge read as a piece's edge.
+ */
+const ACROSS = 8;
+
+/**
+ * Whether a piece of the whole reading's text (`lines`, in the picture's pixels, a joined row by
+ * its pieces) runs across `cut` (in `grey`'s pixels, `scale` of the picture's): then the cut
+ * goes through one screen's words, not between two screens (plan 7P, review R4).
+ */
+export function crossesCut(lines: readonly TextLine[], cut: Cut, scale: number): boolean {
+  const [from, to] = [cut.from / scale, cut.to / scale];
+  return (
+    lines
+      .flatMap(piecesOf)
+      // A piece whose own words show two screens was read across both panes: it is no text of one.
+      .filter((piece) => !twoScreens(screenAnchors([piece])))
+      .some((piece) =>
+        cut.axis === 'rows'
+          ? piece.box.y0 < from - ACROSS && piece.box.y1 > to + ACROSS
+          : piece.box.x0 < from - ACROSS && piece.box.x1 > to + ACROSS,
+      )
+  );
+}
+
+/** The two panes of `box` cut by `cut` (in the same pixels): the top or left one first. */
+export function panesOf(box: Box, cut: Cut): [Box, Box] {
+  return cut.axis === 'rows'
+    ? [
+        { ...box, y1: cut.from },
+        { ...box, y0: cut.to },
+      ]
+    : [
+        { ...box, x1: cut.from },
+        { ...box, x0: cut.to },
+      ];
+}
+
+/** The box in another scale. */
+export function scaleBox(box: Box, by: number): Box {
+  return { x0: box.x0 * by, y0: box.y0 * by, x1: box.x1 * by, y1: box.y1 * by };
+}
+
+/** Darker than this is dark: Android's divider is grey 20 on the samples. */
+const DARK = 30;
+/** A pixel this bright or more is not part of a dark, flat line. */
+const LIGHT = 50;
+/** A flat dark line has at most this share of pixels that are `LIGHT`. */
+const STRAY = 0.02;
+/** A line next to a divider is a picture: at least this share of its pixels are `LIGHT`. */
+const PICTURE = 0.2;
+/**
+ * The middle share of a divider's length that may hold its handle (the samples' is 17.5% of the
+ * band's length; up to about 25% is allowed, with some room).
+ */
+const HANDLE = 0.3;
+/** A divider is at most this share of the side across it (26 of 2448 pixels on the samples). */
+const DIVIDER_MAX = 0.08;
+/** …and lies between these shares of that side, never at an edge. */
+const DIVIDER_FROM = 0.15;
+const DIVIDER_TO = 0.85;
+/** A margin is trimmed only when it is at least this share of its side. */
+const MARGIN_MIN = 0.03;
+
+/** The values of line `i` along `axis` (a row's or a column's), within `box`. */
+function lineValues(grey: GreyImage, axis: CutAxis, i: number, box: Box): Float32Array {
+  if (axis === 'rows') return grey.data.subarray(i * grey.width + box.x0, i * grey.width + box.x1);
+  const values = new Float32Array(box.y1 - box.y0);
+  for (let y = box.y0; y < box.y1; y++) values[y - box.y0] = grey.data[y * grey.width + i] ?? 0;
+  return values;
+}
+
+function lightShare(values: ArrayLike<number>, from = 0, to = values.length): number {
+  let light = 0;
+  for (let k = from; k < to; k++) if ((values[k] ?? 0) >= LIGHT) light++;
+  return to > from ? light / (to - from) : 0;
+}
+
+function mean(values: ArrayLike<number>, from = 0, to = values.length): number {
+  let sum = 0;
+  for (let k = from; k < to; k++) sum += values[k] ?? 0;
+  return to > from ? sum / (to - from) : 0;
+}
+
+/** A line that is dark and flat over its whole length (a margin). */
+function marginLine(values: ArrayLike<number>): boolean {
+  return mean(values) <= DARK && lightShare(values) <= STRAY / 2;
+}
+
+/**
+ * A pane's margin may hold the status bar's text or a floating button of the system (a small GO
+ * pillarboxed in its pane): at least this share of the line is dark.
+ */
+const LOOSE_DARK = 0.75;
+
+/** A line of a pane's margin: mostly dark (`LOOSE_DARK`). */
+function looseMarginLine(values: ArrayLike<number>): boolean {
+  let dark = 0;
+  for (let k = 0; k < values.length; k++) if ((values[k] ?? 0) <= DARK) dark++;
+  return values.length > 0 && dark / values.length >= LOOSE_DARK;
+}
+
+/**
+ * A line that is dark and flat outside its middle (`HANDLE`), where a divider's handle may stand.
+ */
+function dividerLine(values: ArrayLike<number>): boolean {
+  const n = values.length;
+  const a = Math.floor((n * (1 - HANDLE)) / 2);
+  const b = Math.ceil((n * (1 + HANDLE)) / 2);
+  const outside = (fn: (from: number, to: number) => number) =>
+    (fn(0, a) * a + fn(b, n) * (n - b)) / Math.max(1, a + n - b);
+  return (
+    outside((from, to) => mean(values, from, to)) <= DARK &&
+    outside((from, to) => lightShare(values, from, to)) <= STRAY
+  );
+}
+
+/**
+ * The picture's content within `box` (whole by default): its flat dark margins at the edges
+ * trimmed (the black bars of a letterboxed or pillarboxed screen), each only when it is at least
+ * `MARGIN_MIN` of its side, and never all of it. A pane's (`pane`) are mostly dark lines
+ * (`LOOSE_DARK`): the status bar over a small pillarboxed GO, a floating button beside it.
+ */
+export function trimMargins(
+  grey: GreyImage,
+  box: Box = { x0: 0, y0: 0, x1: grey.width, y1: grey.height },
+  pane = false,
+): Box {
+  const out = { ...box };
+  const margin = pane ? looseMarginLine : marginLine;
+  const run = (axis: CutAxis, from: number, step: 1 | -1, limit: number, across: Box) => {
+    let i = from;
+    while (i !== limit && margin(lineValues(grey, axis, i, across))) i += step;
+    return Math.abs(i - from);
+  };
+  const height = box.y1 - box.y0;
+  const top = run('rows', box.y0, 1, box.y1, box);
+  const bottom = run('rows', box.y1 - 1, -1, box.y0 - 1, box);
+  if (top < height && top >= height * MARGIN_MIN) out.y0 += top;
+  if (bottom < height && bottom >= height * MARGIN_MIN) out.y1 -= bottom;
+  if (out.y1 <= out.y0) return { ...box };
+  const width = out.x1 - out.x0;
+  const left = run('columns', out.x0, 1, out.x1, out);
+  const right = run('columns', out.x1 - 1, -1, out.x0 - 1, out);
+  if (left < width && left >= width * MARGIN_MIN) out.x0 += left;
+  if (right < width && right >= width * MARGIN_MIN) out.x1 -= right;
+  return out.x1 > out.x0 ? out : { ...box };
+}
+
+/**
+ * Android's divider between two panes within `box`: a band of rows (top and bottom) or of
+ * columns (side by side) that is dark and flat but for a handle in its middle, thin
+ * (`DIVIDER_MAX`), between `DIVIDER_FROM` and `DIVIDER_TO` of the side, and with a picture on
+ * either side of it (GO's own flat floor or a night sky is not dark-and-thin-and-different). The
+ * band nearest the middle when there are several; null when there is none.
+ */
+export function findDivider(grey: GreyImage, box: Box): Cut | null {
+  let best: { cut: Cut; off: number } | null = null;
+  for (const axis of ['rows', 'columns'] as const) {
+    const [start, end] = axis === 'rows' ? [box.y0, box.y1] : [box.x0, box.x1];
+    const side = end - start;
+    const values = (i: number) => lineValues(grey, axis, i, box);
+    // Android's dark divider (a picture on either side, by its light pixels), and a flat band
+    // of any one grey with a picture on either side (a foldable's spine: the Duo's is grey 60).
+    const kinds: {
+      level: (i: number) => number | undefined;
+      picture: (i: number) => boolean;
+      apart?: (before: number, after: number, level: number) => boolean;
+      widest: number;
+    }[] = [
+      {
+        level: (i: number) => (dividerLine(values(i)) ? 0 : undefined),
+        picture: (i: number) => lightShare(values(i)) >= PICTURE,
+        widest: DIVIDER_MAX,
+      },
+      // Only between panes side by side, thin, and unlike the picture on a side (a game screen's
+      // sky, an app's margin, a chat's background are flat too, and like both their sides).
+      ...(axis === 'columns'
+        ? [
+            {
+              level: (i: number) => uniformLevel(values(i)),
+              picture: (i: number) => uniformLevel(values(i)) === undefined,
+              // Unlike the picture on one side at least: an app beside it may be as dark.
+              apart: (before: number, after: number, level: number) =>
+                Math.max(
+                  Math.abs(medianOf(values(before)) - level),
+                  Math.abs(medianOf(values(after)) - level),
+                ) >= SPINE_APART,
+              widest: SPINE_MAX,
+            },
+          ]
+        : []),
+    ];
+    for (const kind of kinds) {
+      let i = start;
+      while (i < end) {
+        const level = kind.level(i);
+        if (level === undefined) {
+          i++;
+          continue;
+        }
+        let j = i;
+        for (; j < end; j++) {
+          const here = kind.level(j);
+          if (here === undefined || Math.abs(here - level) > FLAT) break;
+        }
+        const thick = j - i;
+        const before = i - 2;
+        const after = j + 1;
+        const fits =
+          thick >= 2 &&
+          thick <= side * kind.widest &&
+          i - start >= side * DIVIDER_FROM &&
+          j - start <= side * DIVIDER_TO &&
+          before >= start &&
+          after < end &&
+          kind.picture(before) &&
+          kind.picture(after) &&
+          (kind.apart?.(before, after, level) ?? true);
+        if (fits) {
+          const off = Math.abs((i + j) / 2 - (start + end) / 2) / side;
+          if (!best || off < best.off) best = { cut: { axis, from: i, to: j }, off };
+        }
+        i = j;
+      }
+    }
+  }
+  return best?.cut ?? null;
+}
+
+/** A flat line's values lie within this of its level (JPEG's noise). */
+const FLAT = 12;
+/** A spine is at most this share of the width (the Duo's: 12 of 2007 pixels). */
+const SPINE_MAX = 0.02;
+/** A spine's grey differs from the median of the lines beside it by at least this much. */
+const SPINE_APART = 20;
+
+function medianOf(values: ArrayLike<number>): number {
+  const sorted = Array.from(values).sort((x, y) => x - y);
+  return sorted[Math.floor(sorted.length / 2)] ?? 0;
+}
+
+/**
+ * The grey of a line that is one flat grey outside its middle (`HANDLE`, where a divider's
+ * handle may stand): all but `STRAY` of its pixels within `FLAT` of their median; undefined
+ * for any other line (a picture's).
+ */
+function uniformLevel(values: ArrayLike<number>): number | undefined {
+  const n = values.length;
+  const a = Math.floor((n * (1 - HANDLE)) / 2);
+  const b = Math.ceil((n * (1 + HANDLE)) / 2);
+  const outside = [...Array.from({ length: a }, (_, k) => values[k] ?? 0)];
+  for (let k = b; k < n; k++) outside.push(values[k] ?? 0);
+  if (outside.length === 0) return undefined;
+  const sorted = [...outside].sort((x, y) => x - y);
+  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
+  const off = outside.filter((value) => Math.abs(value - median) > FLAT).length;
+  return off <= outside.length * STRAY ? median : undefined;
+}
+
+/**
+ * How strongly the picture changes from line `i` to line `i + 1` along `axis` within `box`: the
+ * median difference along the line (two pictures meeting differ along their whole length, a
+ * button's edge only along part of it).
+ */
+function seam(grey: GreyImage, axis: CutAxis, i: number, box: Box): number {
+  const a = lineValues(grey, axis, i, box);
+  const b = lineValues(grey, axis, i + 1, box);
+  const diffs = Array.from(a, (value, k) => Math.abs(value - (b[k] ?? 0))).sort((x, y) => x - y);
+  return diffs[Math.floor(diffs.length / 2)] ?? 0;
+}
+
+/**
+ * A cut found from the text where no divider is (a foldable's panes meet without one): the
+ * anchors (`screenAnchors` of `lines`, in the picture's pixels) split into two groups along an
+ * axis, the first wholly before the second and neither showing two screens; between them, in a
+ * band of the picture that no line's box crosses, the place where the picture changes most
+ * (`seam`, on `grey` at `scale` of the picture's pixels). Null when the anchors show one screen,
+ * or no such band is there (a line read across both panes). The cut is in `grey`'s pixels, as
+ * `findDivider`'s.
+ */
+export function textCut(
+  lines: readonly TextLine[],
+  grey: GreyImage,
+  scale: number,
+  box: Box,
+): Cut | null {
+  const anchors = screenAnchors(lines);
+  if (!twoScreens(anchors)) return null;
+  let best: { cut: Cut; strength: number } | null = null;
+  for (const axis of ['rows', 'columns'] as const) {
+    const lo = (b: Box) => (axis === 'rows' ? b.y0 : b.x0);
+    const hi = (b: Box) => (axis === 'rows' ? b.y1 : b.x1);
+    const sorted = [...anchors].sort((a, b) => lo(a.box) + hi(a.box) - lo(b.box) - hi(b.box));
+    for (let k = 1; k < sorted.length; k++) {
+      const first = sorted.slice(0, k);
+      const second = sorted.slice(k);
+      if (twoScreens(first) || twoScreens(second)) continue;
+      const from = Math.max(...first.map((a) => hi(a.box)));
+      const to = Math.min(...second.map((a) => lo(a.box)));
+      const found = strongestSeam(lines, grey, scale, box, axis, from, to);
+      if (found && (!best || found.strength > best.strength)) best = found;
+    }
+  }
+  return best?.cut ?? null;
+}
+
+/**
+ * Between `from` and `to` (the picture's pixels) along `axis`, the place no piece of text
+ * crosses where the picture changes most (`seam`), as a cut in `grey`'s pixels; null when text
+ * crosses everywhere.
+ */
+function strongestSeam(
+  lines: readonly TextLine[],
+  grey: GreyImage,
+  scale: number,
+  box: Box,
+  axis: CutAxis,
+  from: number,
+  to: number,
+): { cut: Cut; strength: number } | null {
+  if (to <= from) return null;
+  const lo = (b: Box) => (axis === 'rows' ? b.y0 : b.x0);
+  const hi = (b: Box) => (axis === 'rows' ? b.y1 : b.x1);
+  const covered = lines
+    .flatMap((line) => piecesOf(line).map((piece) => piece.box))
+    .map((one) => [lo(one), hi(one)] as const)
+    .filter(([a, b]) => b > from && a < to);
+  const [g0, g1] = axis === 'rows' ? [box.y0, box.y1] : [box.x0, box.x1];
+  let best: { cut: Cut; strength: number } | null = null;
+  for (let i = Math.max(Math.ceil(from * scale), g0); i < Math.min(to * scale, g1 - 1); i++) {
+    const at = (i + 1) / scale;
+    if (covered.some(([a, b]) => a < at && b > at)) continue;
+    const strength = seam(grey, axis, i, box);
+    if (!best || strength > best.strength)
+      best = { cut: { axis, from: i + 1, to: i + 1 }, strength };
+  }
+  return best;
+}
+
+/** Where two pictures side by side may meet: this middle share of the width. */
+const SEAM_FROM = 0.3;
+const SEAM_TO = 0.7;
+/**
+ * Two pictures meeting differ along the whole seam by at least this much (the median grey
+ * difference): a game screen's own columns change by a few levels.
+ */
+const SEAM_MIN = 20;
+
+/**
+ * A cut of a wide picture (`box`, in `grey`'s pixels) that shows one screen beside something
+ * else (a foldable's map beside GO, plan 7P): the strongest seam (`SEAM_MIN`) between columns in
+ * the middle of the picture that no text crosses; null when there is none. Its panes are kept
+ * only when each reads as one screen or none (`cutKept`).
+ */
+export function seamCut(
+  lines: readonly TextLine[],
+  grey: GreyImage,
+  scale: number,
+  box: Box,
+): Cut | null {
+  const width = box.x1 - box.x0;
+  const found = strongestSeam(
+    lines,
+    grey,
+    scale,
+    box,
+    'columns',
+    (box.x0 + width * SEAM_FROM) / scale,
+    (box.x0 + width * SEAM_TO) / scale,
+  );
+  return found && found.strength >= SEAM_MIN ? found.cut : null;
+}
+
+/**
+ * What a pane shows by its reading (`kind` from the screen's text): a raid's or a max battle's
+ * screen, no screen (a map, a chat, notes: no anchor that only a GO screen shows), or something
+ * unclear (a button or a title of GO that makes no screen, or two screens).
+ */
+export type PaneShows = 'raid' | 'max' | 'none' | 'unclear';
+
+/**
+ * Anchors only a GO screen shows. A countdown or a title alone is no screen: a chat says
+ * "0:32:10 left", a map shows a raid's timer, any app has a heading.
+ */
+const SCREEN_ONLY: ReadonlySet<AnchorKind> = new Set([
+  'max-title',
+  'cp',
+  'private-group',
+  'battle',
+]);
+/** Whether the anchors hold one that only a GO screen shows (`SCREEN_ONLY`). */
+export function showsGo(anchors: readonly Anchor[]): boolean {
+  return anchors.some((one) => SCREEN_ONLY.has(one.kind));
+}
+
+/** An egg's countdown stands alone in its line: at most this many of its heights wide. */
+const COUNTDOWN_ALONE = 6;
+
+export function paneShows(
+  text: {
+    max?: unknown;
+    cp: number | null;
+    countdown: number | null;
+    countdownPlace: string | null;
+    countdownBox: Box | null;
+    gym: string | null;
+  },
+  anchors: readonly Anchor[],
+): PaneShows {
+  if (twoScreens(anchors)) return 'unclear';
+  if (text.max) return 'max';
+  // A hatched raid by its CP; an egg by its gym and its countdown, alone in its line and
+  // centered under it (a chat's countdown is in a sentence).
+  const box = text.countdownBox;
+  const alone = box !== null && box.x1 - box.x0 <= COUNTDOWN_ALONE * boxHeight(box);
+  const egg =
+    text.countdown !== null && alone && text.countdownPlace === 'centre' && text.gym !== null;
+  if (text.cp !== null || egg) return 'raid';
+  // A countdown alone in its line and centered that makes no egg (no gym read) may be an egg
+  // read badly: unclear, so the whole reading stands and no egg is dropped unsaid. Off the
+  // middle it is a chat message that is only a time, or a map's raid timer.
+  if (text.countdown !== null && alone && text.countdownPlace === 'centre') return 'unclear';
+  return showsGo(anchors) ? 'unclear' : 'none';
+}
+
+/**
+ * Whether a cut's panes are kept in place of the whole reading: every pane shows one screen or
+ * none, and at least one shows a screen.
+ */
+export function cutKept(shows: readonly PaneShows[]): boolean {
+  return (
+    shows.every((one) => one !== 'unclear') && shows.some((one) => one === 'raid' || one === 'max')
+  );
+}
+
+/** Where a pane stands in its picture, as members name it. */
+export type PaneSide = 'top' | 'bottom' | 'left' | 'right';
+
+/**
+ * The side of `pane` among the panes of its picture: top or bottom when they stand one above the
+ * other (the second starts below the first), else left or right.
+ */
+export function paneSide(
+  pane: { index: number; box: Box },
+  panes: readonly { index: number; box: Box }[],
+): PaneSide {
+  const [first, second] = [...panes].sort((a, b) => a.index - b.index);
+  const rows = !first || !second || second.box.y0 >= first.box.y1 - 2;
+  if (rows) return pane.index === 1 ? 'top' : 'bottom';
+  return pane.index === 1 ? 'left' : 'right';
+}
diff --git a/src/domain/ocr/text-model.test.ts b/src/domain/ocr/text-model.test.ts
index fb6dd563..c41cfcb0 100644
--- a/src/domain/ocr/text-model.test.ts
+++ b/src/domain/ocr/text-model.test.ts
@@ -119,6 +119,19 @@ describe('groupLines', () => {
     expect(lines[1]?.box).toEqual({ x0: 0, y0: 100, x1: 90, y1: 120 });
   });
 
+  it('keeps the pieces of a joined row as its parts (two panes side by side, plan 7P)', () => {
+    const [row, alone] = groupLines([
+      line('BATTLE', 900, 500, 1000, 530),
+      line('BATTLE', 100, 502, 200, 530),
+      line('one', 0, 700, 50, 720),
+    ]);
+    expect(row?.parts).toEqual([
+      { box: { x0: 100, y0: 502, x1: 200, y1: 530 }, length: 6 },
+      { box: { x0: 900, y0: 500, x1: 1000, y1: 530 }, length: 6 },
+    ]);
+    expect(alone?.parts).toBeUndefined();
+  });
+
   it('drops pieces read with little confidence', () => {
     expect(groupLines([line('x', 0, 0, 10, 10, 0.4), line('ok', 0, 50, 10, 60)])).toEqual([
       line('ok', 0, 50, 10, 60),
diff --git a/src/domain/ocr/text-model.ts b/src/domain/ocr/text-model.ts
index 1ed44ebe..0c29dbb9 100644
--- a/src/domain/ocr/text-model.ts
+++ b/src/domain/ocr/text-model.ts
@@ -200,5 +200,6 @@ export function groupLines(pieces: readonly TextLine[]): TextLine[] {
         x1: Math.max(...row.map((p) => p.box.x1)),
         y1: Math.max(...row.map((p) => p.box.y1)),
       },
+      ...(row.length > 1 ? { parts: row.map((p) => ({ box: p.box, length: p.text.length })) } : {}),
     }));
 }
diff --git a/src/text-spelling.test.ts b/src/text-spelling.test.ts
index fad91efc..cfc1d58a 100644
--- a/src/text-spelling.test.ts
+++ b/src/text-spelling.test.ts
@@ -51,6 +51,10 @@ const ALLOWED: Record<string, { texts: string[]; why: string }> = {
     texts: ['centre'],
     why: 'the same stored place, read back',
   },
+  'domain/ocr/panes.ts': {
+    texts: ['centre'],
+    why: "the same stored place, which tells an egg's pane (plan 7P)",
+  },
   'domain/search/gym-lookup.ts': {
     texts: ['neighbouring'],
     why: "the gym search's place of a hit (`GymPlace`), a value of the code, never shown",
````

### Task 2: 7P task 2: the reading process cuts a split screenshot into panes

Prototype commit: `091f9b11ee6e87827e671f8a1ecda23f0d7645b1`

readPicture reads the whole picture as one screen, as ever (its flat margins trimmed; a
picture wider than tall or near square, or cut side by side by a divider into panes
narrower than 60% of it, read at twice READ_WIDTH), then cuts it by Android's divider,
by the text (two screens' anchors), or on a wide picture where one screen meets something
else, and reads each pane as a screenshot of its own at READ_WIDTH. The panes are kept
only when each shows one screen or none, one at least a screen; else the whole reading
stands, with twoScreens saying whether it can be used. The status bar is read once, a
landscape picture's at twice its size, and handed to every pane; a pane that does not
touch the top gets no status band of its own. The protocol, OcrService and the fake
worker carry the panes and the divider switch; ocr:check scores each pane against its
#n label or {"none": true}, prints twoScreens, the slowest picture, and takes
--no-divider.

**Files:**

```
 scripts/ocr/check.ts             | 248 ++++++++++++++++++++++++++++--------------
 src/domain/ocr/raid-screen.ts    |  42 +++++++-
 src/ocr/protocol.ts              |  12 ++-
 src/ocr/screen-reader.test.ts    | 265 ++++++++++++++++++++++++++++++++++++++++++++-
 src/ocr/screen-reader.ts         | 343 ++++++++++++++++++++++++++++++++++++++++++++++++++++++-----
 src/ocr/worker.ts                |   9 +-
 src/services/ocr-service.test.ts |  38 +++++++
 src/services/ocr-service.ts      |  63 +++++++++--
 test/support/ocr-worker.ts       |  76 +++++++++----
 9 files changed, 951 insertions(+), 145 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/ocr/screen-reader.test.ts src/services/ocr-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 091f9b11ee6e87827e671f8a1ecda23f0d7645b1 -- src test scripts data docs/architecture docs/guides docs/superpowers/ocr-improvements.md docs/superpowers/plans/2026-10-27-phase-7p-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `7P task 2: the reading process cuts a split screenshot into panes`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/scripts/ocr/check.ts b/scripts/ocr/check.ts
index 160d0875..ebdf9d81 100644
--- a/scripts/ocr/check.ts
+++ b/scripts/ocr/check.ts
@@ -49,6 +49,9 @@ import {
   type SampleLabel,
 } from '../../src/domain/ocr/screenshot-record.js';
 import { nameSimilarity, screenshotReport } from '../../src/domain/ocr/screenshot-report.js';
+import { paneShows, screenAnchors, type PaneShows } from '../../src/domain/ocr/panes.js';
+import { screenBody, statusBandOf } from '../../src/domain/ocr/raid-screen.js';
+import type { ScreenReading } from '../../src/ocr/screen-reader.js';
 import { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
 import { feedLookup } from '../../src/domain/pogo/feed-lookup.js';
 import { GAME_DATA_VERSION, type GameData } from '../../src/domain/pogo/game-master.js';
@@ -69,6 +72,7 @@ const { values, positionals } = parseArgs({
     'write-baseline': { type: 'string' },
     bosses: { type: 'string' },
     'write-bosses': { type: 'string' },
+    'no-divider': { type: 'boolean' },
   },
 });
 const folder = positionals[0];
@@ -92,10 +96,16 @@ const priority =
 const log = pino({ level: 'warn' }, pino.destination(2));
 
 const labelsFile = values.labels ?? path.join(folder, 'labels.json');
-const labels: Record<string, SampleLabel | MaxLabel> = existsSync(labelsFile)
-  ? (JSON.parse(readFileSync(labelsFile, 'utf8')) as Record<string, SampleLabel | MaxLabel>)
+type Label = SampleLabel | MaxLabel | NoneLabel;
+const labels: Record<string, Label | undefined> = existsSync(labelsFile)
+  ? (JSON.parse(readFileSync(labelsFile, 'utf8')) as Record<string, Label>)
   : {};
 
+/** The answer key of a pane that shows no GO screen (a map, a chat): `<file>#<n>` (plan 7P). */
+interface NoneLabel {
+  none: true;
+}
+
 /** The answer key of a max battle's screen. */
 interface MaxLabel {
   kind: 'max';
@@ -195,108 +205,181 @@ let first = true;
 process.stdout.write(
   `Device ${device}, threads ${threads || 'all'}, priority ${priority}; ${files.length} screenshots.\n\n`,
 );
+/** One screen scored: the whole picture, or a pane of it (plan 7P), under its results key. */
+interface Scored {
+  key: string;
+  reading: ScreenReading;
+  shows: PaneShows;
+  /** What the bot would do with the whole picture: refuse it as two screens. */
+  refused: boolean;
+}
+
+/** What a reading shows, as a pane's is judged (`paneShows` over its anchors). */
+function showsOf(reading: ScreenReading): PaneShows {
+  const body = screenBody(reading.lines, statusBandOf(reading));
+  return paneShows(reading.text, screenAnchors(body));
+}
+
+let slowest = { file: '', ms: 0 };
+let twoWhole = 0;
+const twoFiles: string[] = [];
+const lateFiles: string[] = [];
 for (const file of files) {
   const started = performance.now();
-  const outcome = await ocr.read(readFileSync(path.join(folder, file)));
+  const outcome = await ocr.read(readFileSync(path.join(folder, file)), {
+    ...(values['no-divider'] ? { divider: false } : {}),
+  });
   const took = performance.now() - started;
   if (outcome.kind !== 'read') {
     process.stdout.write(`${file}: ${outcome.kind}\n`);
     continue;
   }
-  const { reading } = outcome;
+  const { reading, panes } = outcome;
   // The first screenshot also starts the process and loads the models: it is not counted.
   if (!first) {
     readMs += reading.ms;
     wallMs += took;
     summed++;
+    if (reading.ms > slowest.ms) slowest = { file, ms: reading.ms };
   }
   first = false;
   peakMb = Math.max(peakMb, reading.peakMb);
+  if (outcome.twoScreens) {
+    twoWhole++;
+    twoFiles.push(file);
+  }
   const record = recordOf(file);
   // A review record's own bosses: the list the bot decided among.
   const bossesHere =
     record?.bosses && catalogue ? bossesOfSnapshot(record.bosses, catalogue) : bosses;
-  // Uploaded now: the time of a sample is not scored, only its clock and countdown as read.
-  const report = screenshotReport(reading, {
-    bosses: bossesHere,
-    pokemon: catalogue?.all ?? [],
-    searchGym: () => [],
-    uploadedAt: Date.now(),
-    zone: settings.timezone,
-    standardIncubate: settings.standardRaidIncubateDuration,
-    standardHatched: settings.standardRaidHatchedDuration,
-    maxHatched: settings.maxRaidHatchedDuration,
-    guessOffsetSeconds: settings.screenshotMessageOffsetTime,
-  });
-  const t = reading.text;
-  const shown = {
-    clock: clockText(t.clock),
-    clockConfidence:
-      t.clock?.confidence === undefined ? null : Number(t.clock.confidence.toFixed(3)),
-    countdown: countdownText(t.countdown),
-    gym: t.gym,
-    stage: report.stage,
-    heads: report.heads,
-    tier: report.tier ? `${report.tier.shadow ? 'Shadow ' : ''}${report.tier.level}` : null,
-    cp: t.cp,
-    bossName: t.bossName,
-    boss: report.boss?.name ?? null,
-    purple: Number((reading.purple * 100).toFixed(2)),
-    max: t.max ? { species: t.max.species, powerSpot: t.max.powerSpot } : null,
-    doubts: report.doubts,
-  };
   const wrongVerdict = record?.feedback?.some((f) => f.verdict === 'wrong') ?? false;
   if (wrongVerdict) disputed.push(file);
-  const wrong: string[] = [];
-  const scored: Record<string, boolean> = {};
-  const check = (element: string, ok: boolean) => {
-    const [good, all] = right.get(element) ?? [0, 0];
-    right.set(element, [good + (ok ? 1 : 0), all + 1]);
-    scored[element] = ok;
-    if (!ok) wrong.push(element);
-  };
-  const bossRight = (name: string | null) =>
-    report.boss !== null &&
-    (report.boss.name.includes(name ?? '') || nameSimilarity(report.boss.name, name ?? '') >= 0.75);
-  const label = labels[file];
-  const member = !label && !wrongVerdict ? record?.label : undefined;
-  if (label && 'kind' in label) {
-    check('clock', shown.clock === label.clock);
-    check('countdown', shown.countdown === label.countdown);
-    check('kind', Boolean(t.max));
-    check('species', nameSimilarity(t.max?.species ?? '', label.species) >= 0.9);
-    check('spot', nameSimilarity(t.max?.powerSpot ?? '', label.powerSpot) >= 0.9);
-    check('heads', report.heads === label.heads);
-  } else if (label) {
-    check('clock', shown.clock === label.clock);
-    check('countdown', shown.countdown === label.countdown);
-    check('gym', nameSimilarity(t.gym ?? '', label.gym ?? '') >= 0.9);
-    check('stage', shown.stage === (label.egg ? 'egg' : 'hatched'));
-    check('heads', report.heads === (label.tier === 'mega' ? 4 : label.tier));
-    check('shadow', (report.tier?.shadow ?? false) === label.shadow);
-    if (!label.egg) {
-      check('cp', t.cp === label.cp);
-      if (bossesHere.length > 0) check('boss', bossRight(label.boss));
+  const paneKeys = Object.keys(labels).filter((key) => key.startsWith(`${file}#`));
+  const refused = !panes && outcome.twoScreens === true;
+  // What is scored: each pane (its own label `#n`, or the picture's label on the first pane that
+  // shows a screen); without panes the whole reading, against the picture's label or each pane's.
+  const scoredUnits: Scored[] = [];
+  if (panes) {
+    const firstScreen = panes.find((pane) => pane.shows === 'raid' || pane.shows === 'max');
+    for (const pane of panes) {
+      const own = `${file}#${pane.index}`;
+      const key = labels[own] || pane !== firstScreen || !labels[file] ? own : file;
+      scoredUnits.push({ key, reading: pane.reading, shows: pane.shows, refused: false });
     }
-  } else if (member) {
-    // What a member said was right: only what the reader decided, by itself.
-    if (member.gym !== undefined) check('gym', nameSimilarity(t.gym ?? '', member.gym) >= 0.9);
-    if (member.egg !== undefined) check('stage', shown.stage === (member.egg ? 'egg' : 'hatched'));
-    if (member.tier !== undefined) {
-      check('heads', report.heads === (member.tier === 'mega' ? 4 : member.tier));
+  } else if (labels[file] || paneKeys.length === 0) {
+    scoredUnits.push({ key: file, reading, shows: showsOf(reading), refused });
+  } else {
+    for (const key of paneKeys) {
+      scoredUnits.push({ key, reading, shows: showsOf(reading), refused });
     }
-    if (member.shadow !== undefined) {
-      check('shadow', (report.tier?.shadow ?? false) === member.shadow);
+  }
+  const how = panes
+    ? `cut by the ${outcome.cut ?? 'divider'} into ${panes.length} panes`
+    : refused
+      ? 'two screens: refused'
+      : '';
+  const late = outcome.late ? '  late: its panes not read for lack of time' : '';
+  if (outcome.late) lateFiles.push(file);
+  process.stdout.write(`${file}  ${reading.ms} ms${how ? `  ${how}` : ''}${late}\n`);
+  // The clocks of the picture's pane labels: a fake's panes may show two (fold-two-*).
+  const labelClocks = paneKeys.flatMap((key) => {
+    const one = labels[key];
+    return one && 'clock' in one ? [one.clock] : [];
+  });
+  for (const unit of scoredUnits) {
+    const t = unit.reading.text;
+    // Uploaded now: the time of a sample is not scored, only its clock and countdown as read.
+    const report = screenshotReport(unit.reading, {
+      bosses: bossesHere,
+      pokemon: catalogue?.all ?? [],
+      searchGym: () => [],
+      uploadedAt: Date.now(),
+      zone: settings.timezone,
+      standardIncubate: settings.standardRaidIncubateDuration,
+      standardHatched: settings.standardRaidHatchedDuration,
+      maxHatched: settings.maxRaidHatchedDuration,
+      guessOffsetSeconds: settings.screenshotMessageOffsetTime,
+    });
+    const shown = {
+      shows: unit.shows,
+      clock: clockText(t.clock),
+      clockConfidence:
+        t.clock?.confidence === undefined ? null : Number(t.clock.confidence.toFixed(3)),
+      countdown: countdownText(t.countdown),
+      gym: t.gym,
+      stage: report.stage,
+      heads: report.heads,
+      tier: report.tier ? `${report.tier.shadow ? 'Shadow ' : ''}${report.tier.level}` : null,
+      cp: t.cp,
+      bossName: t.bossName,
+      boss: report.boss?.name ?? null,
+      purple: Number((unit.reading.purple * 100).toFixed(2)),
+      max: t.max ? { species: t.max.species, powerSpot: t.max.powerSpot } : null,
+      doubts: report.doubts,
+    };
+    const wrong: string[] = [];
+    const scored: Record<string, boolean> = {};
+    // A picture refused as two screens reports nothing: every element of it is wrong.
+    const check = (element: string, ok: boolean) => {
+      const good = ok && !unit.refused;
+      const [count, all] = right.get(element) ?? [0, 0];
+      right.set(element, [count + (good ? 1 : 0), all + 1]);
+      scored[element] = good;
+      if (!good) wrong.push(element);
+    };
+    const bossRight = (name: string | null) =>
+      report.boss !== null &&
+      (report.boss.name.includes(name ?? '') ||
+        nameSimilarity(report.boss.name, name ?? '') >= 0.75);
+    const clockRight = (clock: string | null) =>
+      shown.clock === clock || (labelClocks.length > 1 && labelClocks.includes(shown.clock));
+    const label = labels[unit.key];
+    const member = !label && !wrongVerdict && unit.key === file ? record?.label : undefined;
+    if (label && 'none' in label) {
+      check('none', unit.shows === 'none');
+    } else if (label && 'kind' in label) {
+      check('clock', clockRight(label.clock));
+      check('countdown', shown.countdown === label.countdown);
+      check('kind', Boolean(t.max));
+      check('species', nameSimilarity(t.max?.species ?? '', label.species) >= 0.9);
+      check('spot', nameSimilarity(t.max?.powerSpot ?? '', label.powerSpot) >= 0.9);
+      check('heads', report.heads === label.heads);
+    } else if (label) {
+      check('clock', clockRight(label.clock));
+      check('countdown', shown.countdown === label.countdown);
+      check('gym', nameSimilarity(t.gym ?? '', label.gym ?? '') >= 0.9);
+      check('stage', shown.stage === (label.egg ? 'egg' : 'hatched'));
+      check('heads', report.heads === (label.tier === 'mega' ? 4 : label.tier));
+      check('shadow', (report.tier?.shadow ?? false) === label.shadow);
+      if (!label.egg) {
+        check('cp', t.cp === label.cp);
+        if (bossesHere.length > 0) check('boss', bossRight(label.boss));
+      }
+    } else if (member) {
+      // What a member said was right: only what the reader decided, by itself.
+      if (member.gym !== undefined) check('gym', nameSimilarity(t.gym ?? '', member.gym) >= 0.9);
+      if (member.egg !== undefined) {
+        check('stage', shown.stage === (member.egg ? 'egg' : 'hatched'));
+      }
+      if (member.tier !== undefined) {
+        check('heads', report.heads === (member.tier === 'mega' ? 4 : member.tier));
+      }
+      if (member.shadow !== undefined) {
+        check('shadow', (report.tier?.shadow ?? false) === member.shadow);
+      }
+      if (member.boss !== undefined && bossesHere.length > 0) {
+        check('boss', bossRight(member.boss));
+      }
     }
-    if (member.boss !== undefined && bossesHere.length > 0) check('boss', bossRight(member.boss));
+    if (Object.keys(scored).length > 0) results[unit.key] = scored;
+    const verdict = Object.keys(scored).length
+      ? wrong.length
+        ? `  WRONG: ${wrong.join(', ')}`
+        : '  all right'
+      : '';
+    const name = panes || unit.key !== file ? `  ${unit.key}` : '';
+    process.stdout.write(`${name}${verdict}\n  ${JSON.stringify(shown)}\n`);
   }
-  if (Object.keys(scored).length > 0) results[file] = scored;
-  const verdict = Object.keys(scored).length
-    ? wrong.length
-      ? `  WRONG: ${wrong.join(', ')}`
-      : '  all right'
-    : '';
-  process.stdout.write(`${file}  ${reading.ms} ms${verdict}\n  ${JSON.stringify(shown)}\n`);
 }
 await ocr.close();
 
@@ -315,6 +398,13 @@ if (disputed.length > 0) {
 process.stdout.write(
   `${Math.round(readMs / counted)} ms a screenshot in the reading process (${Math.round(wallMs / counted)} ms with the handing over); its peak memory ${peakMb} MB.\n`,
 );
+if (slowest.file) process.stdout.write(`The slowest: ${slowest.file}, ${slowest.ms} ms.\n`);
+process.stdout.write(
+  `The whole reading shows two screens (twoScreens) on ${twoWhole} of ${files.length}${twoFiles.length ? `: ${twoFiles.join(', ')}` : ''}.\n`,
+);
+process.stdout.write(
+  `Read late, without the panes of a cut: ${lateFiles.length}${lateFiles.length ? ` (${lateFiles.join(', ')})` : ''}.\n`,
+);
 
 if (values.baseline) {
   const before = (JSON.parse(readFileSync(values.baseline, 'utf8')) as { samples: Results })
diff --git a/src/domain/ocr/raid-screen.ts b/src/domain/ocr/raid-screen.ts
index 70bbea58..20c4b908 100644
--- a/src/domain/ocr/raid-screen.ts
+++ b/src/domain/ocr/raid-screen.ts
@@ -145,7 +145,33 @@ function besidePicture(line: TextLine, column: number): TextLine | null {
 
 /** The lines that stand in the status bar of a screen of this height. */
 export function statusLines(lines: readonly TextLine[], height: number): TextLine[] {
-  return lines.filter((l) => l.box.y0 < height * STATUS_BAR && l.box.y1 < height * 0.07);
+  return linesInBand(lines, height * STATUS_BAR, height * STATUS_BOTTOM);
+}
+
+/** A status bar's lines start in its band and end within this share of the screen. */
+const STATUS_BOTTOM = 0.07;
+
+/** The lines that start above `band` and end above `bottom`. */
+function linesInBand(lines: readonly TextLine[], band: number, bottom: number): TextLine[] {
+  return lines.filter((l) => l.box.y0 < band && l.box.y1 < bottom);
+}
+
+/** The lines of a screen but its status bar's (`band` as `ScreenTextOptions.statusBand`). */
+export function screenBody(lines: readonly TextLine[], band: number): TextLine[] {
+  const inStatus = new Set(band > 0 ? linesInBand(lines, band, band * STATUS_REACH) : []);
+  return lines.filter((line) => !inStatus.has(line));
+}
+
+/** How far a status bar's line may end, in its band's heights. */
+const STATUS_REACH = STATUS_BOTTOM / STATUS_BAR;
+
+/**
+ * How far down the status bar reaches on a picture of this size: `STATUS_BAR` of its height. A
+ * landscape picture's bar is thinner still (its GO pane's title starts at 10% of the height on
+ * Matt's splits, so a band of the longer side's 4.5% took it for the status bar).
+ */
+export function statusBandOf(size: { width: number; height: number }): number {
+  return size.height * STATUS_BAR;
 }
 
 /**
@@ -206,6 +232,16 @@ function maxText(body: readonly TextLine[], height: number): MaxText | null {
   return null;
 }
 
+export interface ScreenTextOptions {
+  /**
+   * How far down the status bar reaches, in the lines' pixels (`statusBandOf` the screen by
+   * default): the lines above it are the status bar's, not the screen's. A pane of a split screen
+   * gets the picture's band moved to its own pixels, and 0 when it does not touch the picture's
+   * top (plan 7P: a countdown at a pane's top is never the clock).
+   */
+  statusBand?: number;
+}
+
 /**
  * What the lines of a raid screen say. `lines` were read from the whole screen, `status` from the
  * status bar read again alone and enlarged (its boxes in the screen's pixels): the clock comes
@@ -215,10 +251,12 @@ export function readScreenText(
   lines: readonly TextLine[],
   status: readonly TextLine[],
   size: { width: number; height: number },
+  options: ScreenTextOptions = {},
 ): ScreenText {
   const { width, height } = size;
   const sorted = [...lines].sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0);
-  const inStatus = new Set(statusLines(sorted, height));
+  const band = options.statusBand ?? statusBandOf(size);
+  const inStatus = new Set(band > 0 ? linesInBand(sorted, band, band * STATUS_REACH) : []);
   const body = sorted.filter((l) => !inStatus.has(l));
   const clock = clockIn(status) ?? clockIn([...inStatus]);
 
diff --git a/src/ocr/protocol.ts b/src/ocr/protocol.ts
index 5a92b397..9b5cabb3 100644
--- a/src/ocr/protocol.ts
+++ b/src/ocr/protocol.ts
@@ -1,7 +1,7 @@
 import { readdirSync } from 'node:fs';
 import { constants, setPriority } from 'node:os';
 import type { OcrAssetPaths, OcrDevice } from '../domain/ocr/assets.js';
-import type { ScreenReading } from './screen-reader.js';
+import type { PictureReading } from './screen-reader.js';
 
 /**
  * What the bot and its reading process say to each other (`child_process.fork` with the
@@ -21,6 +21,13 @@ export interface ReadRequest {
   kind: 'read';
   id: number;
   bytes: Uint8Array;
+  /** False: no divider is looked for (`PictureOptions.divider`; `ocr:check --no-divider`). */
+  divider?: boolean;
+  /**
+   * The time (milliseconds) from the request's arrival the panes must be read within
+   * (`PictureOptions.panesWithinMs`), judged by the reading process's own clock.
+   */
+  panesWithinMs?: number;
 }
 
 export type WorkerMessage =
@@ -30,7 +37,8 @@ export type WorkerMessage =
   | { kind: 'received'; id: number }
   /** The models could not be loaded (a missing device, a broken file); the process exits. */
   | { kind: 'start-failed'; reason: string }
-  | { kind: 'read'; id: number; reading: ScreenReading }
+  /** The picture read: the whole of it, and its panes when it was cut (plan 7P). */
+  | ({ kind: 'read'; id: number } & PictureReading)
   /** Not a picture the reader can read. */
   | { kind: 'not-an-image'; id: number }
   /** Anything else that went wrong with this screenshot; the process goes on. */
diff --git a/src/ocr/screen-reader.test.ts b/src/ocr/screen-reader.test.ts
index e21aa6a8..ddfec396 100644
--- a/src/ocr/screen-reader.test.ts
+++ b/src/ocr/screen-reader.test.ts
@@ -2,7 +2,7 @@ import sharp from 'sharp';
 import { describe, expect, it } from 'vitest';
 import type { RgbImage, TextLine } from '../domain/ocr/image.js';
 import { headTemplate } from '../domain/ocr/tier-heads.js';
-import { isScreenshotFormat, NotAnImageError, readScreen } from './screen-reader.js';
+import { isScreenshotFormat, NotAnImageError, readPicture, readScreen } from './screen-reader.js';
 import type { ReadText } from './text-reader.js';
 
 /** A screenshot of one colour, as PNG. */
@@ -95,6 +95,269 @@ describe('readScreen', () => {
     );
   });
 
+  it('reads a picture wider than tall, or near square, at twice the width', async () => {
+    const reader = fakeReader([], []);
+    await readScreen(await screenshot(1800, 2100), reader, TEMPLATE);
+    expect(reader.sizes[0]).toBe('1440x1680');
+  });
+
+  it('reads a tall picture cut side by side by a grey spine at twice the width (a Duo)', async () => {
+    // 1600 × 2272 (1.42, as a Duo's 2007 × 2853): panes of a picture each, a grey-60 spine of
+    // 10 columns between them. Read whole at 1440, not at 720 as an upright phone is.
+    const [width, height] = [1600, 2272];
+    const data = Buffer.alloc(width * height * 3);
+    for (let y = 0; y < height; y++) {
+      for (let x = 0; x < width; x++) {
+        const value = x >= 795 && x < 805 ? 60 : 60 + ((x * 7 + y * 13) % 140);
+        data.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
+      }
+    }
+    const duo = await sharp(data, { raw: { width, height, channels: 3 } })
+      .png()
+      .toBuffer();
+    const reader = fakeReader([], []);
+    await readScreen(duo, reader, TEMPLATE);
+    expect(reader.sizes[0]).toBe('1440x2045');
+  });
+
+  it('cuts a wide picture at a seam only when its text shows something only GO shows', async () => {
+    // Two pictures side by side, 1600 × 1600: no divider, a strong seam in the middle.
+    const [width, height] = [1600, 1600];
+    const data = Buffer.alloc(width * height * 3);
+    for (let y = 0; y < height; y++) {
+      for (let x = 0; x < width; x++) {
+        const value = x < 800 ? 150 + ((x + y) % 60) : 30 + ((x * 3 + y * 5) % 40);
+        data.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
+      }
+    }
+    const wide = await sharp(data, { raw: { width, height, channels: 3 } })
+      .png()
+      .toBuffer();
+    // A chat and a notes page: no anchor only GO shows.
+    const apps = inOrder(
+      [line('Notes', 1000, 100, 1200, 140), line('0:32:10 left', 100, 600, 400, 640)],
+      [],
+    );
+    await readPicture(wide, apps, TEMPLATE);
+    expect(apps.sizes).toHaveLength(2);
+    // GO's BATTLE button on the right: the seam is tried, the panes read.
+    const go = inOrder([line('BATTLE', 1100, 1200, 1300, 1240)], []);
+    await readPicture(wide, go, TEMPLATE);
+    expect(go.sizes).toHaveLength(4);
+  });
+
+  it('tries the seam on a foldable’s tall picture too (a Duo beside a chat, no spine found)', async () => {
+    // 1000 × 1420 (1.42): read whole at 720 as a phone is, yet two pictures side by side.
+    const [width, height] = [1000, 1420];
+    const data = Buffer.alloc(width * height * 3);
+    for (let y = 0; y < height; y++) {
+      for (let x = 0; x < width; x++) {
+        const value = x < 500 ? 150 + ((x + y) % 60) : 30 + ((x * 3 + y * 5) % 40);
+        data.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
+      }
+    }
+    const duo = await sharp(data, { raw: { width, height, channels: 3 } })
+      .png()
+      .toBuffer();
+    const go = inOrder([line('BATTLE', 120, 1000, 300, 1030)], []);
+    await readPicture(duo, go, TEMPLATE);
+    expect(go.sizes[0]).toBe('720x1022');
+    expect(go.sizes).toHaveLength(4);
+  });
+
+  it('reads a landscape picture’s status bar as tall as an upright one’s, at twice its size', async () => {
+    // 2448 × 1080: the bar is 4.5% of the longer side, 110 rows, read at twice the size.
+    const reader = fakeReader([], []);
+    await readScreen(await screenshot(2448, 1080), reader, TEMPLATE);
+    expect(reader.sizes).toEqual(['1440x635', '4896x220']);
+  });
+
+  it('refuses what is not a picture', async () => {
+    await expect(
+      readPicture(new TextEncoder().encode('no'), fakeReader([], []), TEMPLATE),
+    ).rejects.toBeInstanceOf(NotAnImageError);
+  });
+});
+
+/**
+ * A screenshot 400 × 900 split by Android's divider: grey 20 from row 440 to 451, a picture
+ * (two colours) on either side.
+ */
+function splitScreenshot() {
+  const band = {
+    create: { width: 400, height: 11, channels: 3 as const, background: { r: 20, g: 20, b: 20 } },
+  };
+  return sharp({
+    create: { width: 400, height: 900, channels: 3, background: { r: 30, g: 120, b: 60 } },
+  })
+    .composite([
+      {
+        input: {
+          create: { width: 400, height: 449, channels: 3, background: { r: 200, g: 90, b: 160 } },
+        },
+        left: 0,
+        top: 451,
+      },
+      { input: band, left: 0, top: 440 },
+    ])
+    .png()
+    .toBuffer();
+}
+
+/** A reader that answers the calls in order: the whole screen, the status bar, then each pane. */
+function inOrder(...answers: TextLine[][]): ReadText & { sizes: string[] } {
+  const sizes: string[] = [];
+  const read = (image: RgbImage) => {
+    sizes.push(`${image.width}x${image.height}`);
+    return Promise.resolve(answers[sizes.length - 1] ?? []);
+  };
+  return Object.assign(read, { sizes });
+}
+
+/** The whole split read: a max battle's title on top and a raid's CP under it. */
+const WHOLE_SPLIT = [
+  line('Dynamax Machop', 60, 300, 340, 330),
+  line('PRIVATE GROUP', 120, 400, 280, 412),
+  line('CP 12345', 100, 560, 300, 610),
+  line('PRIVATE GROUP', 120, 850, 280, 862),
+];
+const TOP_PANE = [line('Dynamax Machop', 60, 300, 340, 330), line('GAZEBO', 120, 340, 280, 360)];
+/** The bottom pane, in its own pixels: a two-part time at its top (no clock: no status bar). */
+const BOTTOM_PANE = [
+  line('9:58', 20, 2, 80, 16),
+  line('Big Fountain', 120, 30, 330, 50),
+  line('CP 12345', 100, 110, 300, 160),
+  line('0:20:00', 300, 300, 370, 320),
+];
+
+describe('readPicture', () => {
+  it('reads each pane of a split as a screenshot of its own, the clock handed down', async () => {
+    const reader = inOrder(WHOLE_SPLIT, [line('9:41', 20, 4, 90, 30)], TOP_PANE, BOTTOM_PANE);
+    const picture = await readPicture(await splitScreenshot(), reader, TEMPLATE);
+    expect(picture).toMatchObject({ cut: 'divider', twoScreens: true });
+    const [top, bottom] = picture.panes ?? [];
+    // The divider's rows, as the small copy finds them: about 440 to 451.
+    const below = bottom?.box.y0 ?? 0;
+    expect(below).toBeGreaterThanOrEqual(449);
+    expect(below).toBeLessThanOrEqual(452);
+    expect(reader.sizes.slice(2)).toEqual(['400x440', `400x${900 - below}`]);
+    expect(top).toMatchObject({ index: 1, of: 2, shows: 'max', box: { y0: 0, y1: 440 } });
+    expect(bottom).toMatchObject({ index: 2, of: 2, shows: 'raid', box: { y1: 900 } });
+    expect(top?.reading.text.clock).toMatchObject({ hour: 9, minute: 41 });
+    expect(bottom?.reading.text).toMatchObject({ clock: { hour: 9, minute: 41 }, cp: 12345 });
+  });
+
+  /** A reader in order whose clock moves by `ms` while it reads the whole picture. */
+  const timed = (clock: { now: number }, ms: number, ...answers: TextLine[][]) => {
+    const reader = inOrder(...answers);
+    const read: ReadText = (image) => {
+      if (reader.sizes.length === 0) clock.now += ms;
+      return reader(image);
+    };
+    return Object.assign(read, { sizes: reader.sizes });
+  };
+
+  it('refuses as two screens a split whose panes it had no time to read (review R1)', async () => {
+    // The whole reading shows one screen only, yet a divider cut the picture: without its
+    // panes it may be a mix of both, so it is two screens it could not tell apart.
+    const clock = { now: 0 };
+    const one = [line('Dynamax Machop', 60, 300, 340, 330), line('GAZEBO', 120, 340, 280, 360)];
+    const reader = timed(clock, 9_000, one, [], TOP_PANE, BOTTOM_PANE);
+    const picture = await readPicture(await splitScreenshot(), reader, TEMPLATE, {
+      panesWithinMs: 10_000,
+      now: () => clock.now,
+    });
+    expect(picture).toEqual({
+      reading: expect.anything() as unknown,
+      twoScreens: true,
+      late: true,
+    });
+    expect(reader.sizes).toHaveLength(2);
+  });
+
+  it('reads the panes only when they are foreseen to end within the budget (review R2)', async () => {
+    // The whole reading took 3 s of 10: the panes, as many pixels again, would end at about 6.
+    const soon = { now: 0 };
+    const fits = timed(soon, 3_000, WHOLE_SPLIT, [], TOP_PANE, BOTTOM_PANE);
+    const read = await readPicture(await splitScreenshot(), fits, TEMPLATE, {
+      panesWithinMs: 10_000,
+      now: () => soon.now,
+    });
+    expect(read.panes).toHaveLength(2);
+    // It took 6 s of 10: the panes would end past the budget, so none is begun.
+    const slow = { now: 0 };
+    const late = timed(slow, 6_000, WHOLE_SPLIT, [], TOP_PANE, BOTTOM_PANE);
+    const skipped = await readPicture(await splitScreenshot(), late, TEMPLATE, {
+      panesWithinMs: 10_000,
+      now: () => slow.now,
+    });
+    expect(skipped).toMatchObject({ twoScreens: true, late: true });
+    expect(late.sizes).toHaveLength(2);
+  });
+
+  it('foresees the panes as costing at least 0.8 of the whole reading, by its lines', async () => {
+    // A split of two small pillarboxed screens (GO in x 150 to 250 of each pane, a status bar
+    // across the top): the panes have a quarter of the whole reading's pixels, but the
+    // recognizer reads as many lines again. With 5.5 s of the 10 s timeout gone on the whole
+    // reading, they would end past the budget (8.5 s), so none is begun.
+    const [width, height] = [400, 900];
+    const data = Buffer.alloc(width * height * 3);
+    for (let y = 0; y < height; y++) {
+      for (let x = 0; x < width; x++) {
+        const go = x >= 150 && x < 250;
+        const value =
+          y < 30 ? 230 : y >= 440 && y < 451 ? 20 : go ? 60 + ((x * 7 + y * 13) % 140) : 0;
+        data.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
+      }
+    }
+    const split = await sharp(data, { raw: { width, height, channels: 3 } })
+      .png()
+      .toBuffer();
+    const clock = { now: 0 };
+    const reader = timed(clock, 5_500, WHOLE_SPLIT, [], TOP_PANE, BOTTOM_PANE);
+    const picture = await readPicture(split, reader, TEMPLATE, {
+      panesWithinMs: 8_500,
+      now: () => clock.now,
+    });
+    expect(picture).toMatchObject({ late: true, twoScreens: true });
+    expect(reader.sizes).toHaveLength(2);
+  });
+
+  it('cuts no picture at a divider that text runs across (review R4)', async () => {
+    // One screen with a dark band through its words: the band is no divider.
+    const across = [line('Big Fountain Plaza of the Old Town', 20, 430, 380, 460)];
+    const reader = inOrder(across, []);
+    const picture = await readPicture(await splitScreenshot(), reader, TEMPLATE);
+    expect(picture.panes).toBeUndefined();
+    expect(reader.sizes).toHaveLength(2);
+  });
+
+  it('takes no time at the top of a pane under another for the clock', async () => {
+    const reader = inOrder(WHOLE_SPLIT, [], TOP_PANE, BOTTOM_PANE);
+    const picture = await readPicture(await splitScreenshot(), reader, TEMPLATE);
+    expect(picture.panes?.[1]?.reading.text.clock).toBeNull();
+  });
+
+  it('keeps the whole reading when a pane shows something that is no screen', async () => {
+    // The bottom pane shows a button and nothing else of a screen: the cut went wrong.
+    const reader = inOrder(WHOLE_SPLIT, [], TOP_PANE, [line('PRIVATE GROUP', 120, 400, 280, 412)]);
+    const picture = await readPicture(await splitScreenshot(), reader, TEMPLATE);
+    expect(picture).toMatchObject({ twoScreens: true });
+    expect(picture.panes).toBeUndefined();
+  });
+
+  it('looks for no divider when told not to, and finds no cut in the text of one screen', async () => {
+    const one = [line('Big Fountain', 120, 30, 330, 50), line('CP 12345', 100, 110, 300, 160)];
+    const reader = inOrder(one, []);
+    const picture = await readPicture(await splitScreenshot(), reader, TEMPLATE, {
+      divider: false,
+    });
+    expect(picture).toEqual({ reading: expect.anything() as unknown, twoScreens: false });
+    expect(reader.sizes).toHaveLength(2);
+  });
+});
+
+describe('readScreen, what is not an image', () => {
   it('refuses what is not a picture', async () => {
     const bytes = new TextEncoder().encode('not a picture at all');
     await expect(readScreen(bytes, fakeReader([], []), TEMPLATE)).rejects.toBeInstanceOf(
diff --git a/src/ocr/screen-reader.ts b/src/ocr/screen-reader.ts
index 2cd5a5b6..b6881710 100644
--- a/src/ocr/screen-reader.ts
+++ b/src/ocr/screen-reader.ts
@@ -1,6 +1,26 @@
-import sharp from 'sharp';
-import { imageFormat, scaledBox, type TextLine } from '../domain/ocr/image.js';
-import { readScreenText, STATUS_BAR, type ScreenText } from '../domain/ocr/raid-screen.js';
+import sharp, { type Sharp } from 'sharp';
+import { imageFormat, movedLine, scaledBox, type Box, type TextLine } from '../domain/ocr/image.js';
+import {
+  crossesCut,
+  cutKept,
+  findDivider,
+  paneShows,
+  panesOf,
+  screenAnchors,
+  seamCut,
+  showsGo,
+  textCut,
+  trimMargins,
+  twoScreens,
+  type PaneShows,
+} from '../domain/ocr/panes.js';
+import {
+  readScreenText,
+  screenBody,
+  STATUS_BAR,
+  statusBandOf,
+  type ScreenText,
+} from '../domain/ocr/raid-screen.js';
 import { purpleShare } from '../domain/ocr/shadow.js';
 import {
   countHeads,
@@ -16,6 +36,8 @@ import type { ReadText } from './text-reader.js';
  * Everything the reader saw on one screenshot: what it made of the text, the heads, the purple,
  * and the lines themselves (their boxes in the screenshot's pixels), so that a reading can be
  * judged later without the models. Plain data: it crosses from the reading process to the bot.
+ * A pane of a split screen (plan 7P) is read as a screenshot of its own: its `width`, `height`
+ * and boxes are the pane's.
  */
 export interface ScreenReading {
   width: number;
@@ -34,11 +56,77 @@ export interface ScreenReading {
   peakMb: number;
 }
 
+/** One pane of a split screen, read as a screenshot of its own (plan 7P). */
+export interface PaneReading {
+  /** 1 the top or left pane, 2 the bottom or right one. */
+  index: number;
+  of: number;
+  /** Where the pane stands in the picture, in its pixels (its own margins trimmed). */
+  box: Box;
+  /** What the pane shows (`paneShows`): a raid's or a max battle's screen, or none. */
+  shows: PaneShows;
+  reading: ScreenReading;
+}
+
+/**
+ * Everything read of one picture: the whole reading (always, as a single screen's), and the
+ * panes when a cut was kept, by Android's divider or by the text (plan 7P).
+ */
+export interface PictureReading {
+  /** The whole picture read as one screen, its flat margins trimmed. */
+  reading: ScreenReading;
+  /**
+   * The panes, each read as a screenshot of its own, when a cut was kept: every pane shows one
+   * screen or none, and one at least a screen (`cutKept`). Absent otherwise.
+   */
+  panes?: PaneReading[];
+  /** How the kept cut was found. */
+  cut?: 'divider' | 'text';
+  /**
+   * The whole reading shows two screens (`twoScreens`): without kept panes it cannot be used
+   * (`two-screens`).
+   */
+  twoScreens: boolean;
+  /**
+   * A cut was found but its panes were not read for lack of time (`panesWithinMs`): the whole
+   * reading is answered, as two screens when a divider or two screens' text cut it.
+   */
+  late?: true;
+}
+
+export interface PictureOptions {
+  /** False: no divider is looked for (`ocr:check --no-divider`: the foldable's path). */
+  divider?: boolean;
+  /**
+   * The time the panes must be read within, from the start (milliseconds): they are read only
+   * when foreseen to end in it, by what the whole reading took for its pixels (`OcrService`
+   * sets it under its timeout, which ends the reading process).
+   */
+  panesWithinMs?: number;
+  /** The clock the time is judged by; for tests. */
+  now?: () => number;
+}
+
 /** The screen is read this wide: as well as at full size or better, in half the time. */
 export const READ_WIDTH = 720;
 /**
- * The status bar is read again twice as wide as the screen, at most twice this: as the research
- * read it for every phone up to 1080 pixels wide, and never a larger picture than a phone's.
+ * A picture whose height is under this many times its width (wider than tall, or near square:
+ * two panes side by side) is read whole at twice `READ_WIDTH`, so that each pane's text has its
+ * usual size; so is one cut side by side by a divider into panes narrower than `NARROW_PANE` of it.
+ */
+const WIDE = 1.4;
+const NARROW_PANE = 0.6;
+/** The panes are foreseen to cost at least this share of the whole reading's time. */
+const PANES_AT_LEAST = 0.8;
+/**
+ * A picture whose height is under this many times its width is of a foldable's shape (a Duo's
+ * inner screen is 1.42), never an upright phone's (1.75 and more): one screen beside another
+ * app is looked for by the seam between them.
+ */
+const FOLDABLE = 1.6;
+/**
+ * The status bar is read again twice as wide as a phone's screen (the picture's shorter side),
+ * at most twice this: as the research read it for every phone up to 1080 pixels wide.
  */
 const STATUS_WIDTH = 1080;
 /** A screenshot with more pixels than this is refused (a phone's has 2.5 to 4 million). */
@@ -46,6 +134,8 @@ export const MAX_PIXELS = 16_000_000;
 /** Height ÷ width of what is read: phones, folded or not, tablets, the split screens of samples. */
 const MIN_ASPECT = 0.4;
 const MAX_ASPECT = 3;
+/** The small greyscale copy the margins and the divider are looked for in: its longer side. */
+const GREY_SIDE = 800;
 
 /** PNG, JPEG and WebP by their first bytes: nothing else reaches the image library. */
 export function isScreenshotFormat(bytes: Uint8Array): boolean {
@@ -59,16 +149,31 @@ export class NotAnImageError extends Error {
   }
 }
 
-/**
- * Reads a raid screenshot. Throws `NotAnImageError` for anything that is not a PNG, JPEG or WebP
- * of a screen's proportions and at most `MAX_PIXELS`.
- */
+/** The whole picture read as one screen (`readPicture`'s `reading`). */
 export async function readScreen(
   bytes: Uint8Array,
   readText: ReadText,
   template: HeadTemplate,
 ): Promise<ScreenReading> {
+  return (await readPicture(bytes, readText, template)).reading;
+}
+
+/**
+ * Reads a screenshot: the whole picture as one screen, as ever, and when Android's divider or
+ * the text cuts it into two panes, each pane as a screenshot of its own; the panes are kept when
+ * each shows one screen or none (plan 7P, design section "The rule that keeps single screens as
+ * they are"). Throws `NotAnImageError` for anything that is not a PNG, JPEG or WebP of a
+ * screen's proportions and at most `MAX_PIXELS`.
+ */
+export async function readPicture(
+  bytes: Uint8Array,
+  readText: ReadText,
+  template: HeadTemplate,
+  options: PictureOptions = {},
+): Promise<PictureReading> {
   const started = performance.now();
+  const now = options.now ?? (() => performance.now());
+  const begun = now();
   const image = () => sharp(bytes, { limitInputPixels: MAX_PIXELS }).removeAlpha();
   if (!isScreenshotFormat(bytes)) throw new NotAnImageError();
   let width: number;
@@ -84,17 +189,163 @@ export async function readScreen(
   const aspect = height / width;
   if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) throw new NotAnImageError();
 
-  const readWidth = Math.min(width, READ_WIDTH);
-  const readHeight = Math.max(1, Math.round((height * readWidth) / width));
-  const small = await image().resize(readWidth, readHeight, { fit: 'fill' }).raw().toBuffer();
-  const smallImage = { width: readWidth, height: readHeight, data: small };
-  const lines = (await readText(smallImage)).map((line) => ({
-    ...line,
-    box: scaledBox(line.box, width / readWidth, height / readHeight),
-  }));
-
-  const barHeight = Math.max(1, Math.round(height * STATUS_BAR));
-  const scale = (2 * Math.min(width, STATUS_WIDTH)) / width;
+  // The small greyscale copy: the margins, the divider, the seam of a text cut.
+  const scale = Math.min(1, GREY_SIDE / Math.max(width, height));
+  const greyWidth = Math.max(1, Math.round(width * scale));
+  const greyHeight = Math.max(1, Math.round(height * scale));
+  const greyData = await image()
+    .greyscale()
+    .resize(greyWidth, greyHeight, { fit: 'fill' })
+    .raw()
+    .toBuffer();
+  const grey = { width: greyWidth, height: greyHeight, data: Float32Array.from(greyData) };
+  const toPicture = (box: Box): Box => {
+    const sx = width / greyWidth;
+    const sy = height / greyHeight;
+    return {
+      x0: Math.max(0, Math.round(box.x0 * sx)),
+      y0: Math.max(0, Math.round(box.y0 * sy)),
+      x1: Math.min(width, Math.round(box.x1 * sx)),
+      y1: Math.min(height, Math.round(box.y1 * sy)),
+    };
+  };
+  const contentGrey = trimMargins(grey);
+  const content = toPicture(contentGrey);
+  const divider = options.divider === false ? null : findDivider(grey, contentGrey);
+
+  // Read once, after the whole screen (as before 7P), and handed to every pane.
+  let statusRead: Promise<TextLine[]> | undefined;
+  const status = () => (statusRead ??= readStatus(image, width, height, readText));
+  const band = statusBandOf({ width, height });
+  const contentWidth = content.x1 - content.x0;
+  const narrowPanes =
+    divider?.axis === 'columns' &&
+    divider.from - contentGrey.x0 < (contentGrey.x1 - contentGrey.x0) * NARROW_PANE &&
+    contentGrey.x1 - divider.to < (contentGrey.x1 - contentGrey.x0) * NARROW_PANE;
+  const wholeWidth =
+    content.y1 - content.y0 < contentWidth * WIDE || narrowPanes ? 2 * READ_WIDTH : READ_WIDTH;
+  const region = { image, readText, template, status, band, width, height };
+  const wholeFrom = now();
+  const whole = await readRegion(region, content, wholeWidth, true);
+  const wholeMs = now() - wholeFrom;
+  const wholeBody = screenBody(whole.lines, bandIn(band, content));
+  const two = twoScreens(screenAnchors(wholeBody));
+
+  // The cut: the divider's, or the text's (the whole reading's lines in the picture's pixels).
+  let cutBy: PictureReading['cut'];
+  let paneBoxes: [Box, Box] | undefined;
+  const inPicture = wholeBody.map((line) =>
+    movedLine(line, (one) => shifted(one, content.x0, content.y0)),
+  );
+  // A divider that text runs across is a band through one screen's words (review R4).
+  if (divider && !crossesCut(inPicture, divider, greyWidth / width)) {
+    cutBy = 'divider';
+    paneBoxes = panesOf(contentGrey, divider);
+  } else {
+    // Two screens by the text; or, on a picture of a foldable's shape (wider than a phone's,
+    // `FOLDABLE`), one screen beside something else (a map, a chat) where the picture changes.
+    const cut = two
+      ? textCut(inPicture, grey, greyWidth / width, contentGrey)
+      : content.y1 - content.y0 < contentWidth * FOLDABLE && showsGo(screenAnchors(wholeBody))
+        ? seamCut(inPicture, grey, greyWidth / width, contentGrey)
+        : null;
+    if (cut) {
+      cutBy = 'text';
+      paneBoxes = panesOf(contentGrey, cut);
+    }
+  }
+
+  let panes: PaneReading[] | undefined;
+  // Whether a divider or two screens' text cut the picture: without its panes its whole reading
+  // may be a mix of both (review R1). A seam's cut of one screen beside another app may let the
+  // whole reading stand.
+  const cutApart = cutBy === 'divider' || two;
+  let late = false;
+  if (paneBoxes) {
+    const boxes = paneBoxes.map((paneGrey) => ({
+      paneGrey,
+      box: toPicture(trimMargins(grey, paneGrey, true)),
+    }));
+    // Read only when foreseen to end in time, by what the whole reading took for its pixels, at
+    // least `PANES_AT_LEAST` of it (the recognizer's cost goes by the lines, which the panes
+    // read again however small they are): the reading process is ended at its timeout, which no
+    // pane may run into (review R2).
+    const pixels = (box: Box, readWidth: number) => {
+      const w = Math.min(box.x1 - box.x0, readWidth);
+      return (w * ((box.y1 - box.y0) * w)) / Math.max(1, box.x1 - box.x0);
+    };
+    const panePixels = boxes.reduce((sum, { box }) => sum + pixels(box, READ_WIDTH), 0);
+    const share = Math.max(panePixels / Math.max(1, pixels(content, wholeWidth)), PANES_AT_LEAST);
+    const foreseen = now() - begun + wholeMs * share;
+    late = options.panesWithinMs !== undefined && foreseen > options.panesWithinMs;
+    const read: PaneReading[] = [];
+    for (const [i, { paneGrey, box }] of late ? [] : boxes.entries()) {
+      if (box.x1 - box.x0 < 2 || box.y1 - box.y0 < 2) continue;
+      // A pane that does not touch the picture's top has no status bar of its own. Each pane is
+      // read as a phone's screenshot is (`READ_WIDTH`): its text has the size it has on a phone
+      // (read at twice the width, Matt's splits lost three heads and gained nothing).
+      const reading = await readRegion(region, box, READ_WIDTH, paneGrey.y0 === contentGrey.y0);
+      const body = screenBody(
+        reading.lines,
+        paneGrey.y0 === contentGrey.y0 ? bandIn(band, box) : 0,
+      );
+      read.push({
+        index: i + 1,
+        of: paneBoxes.length,
+        box,
+        shows: paneShows(reading.text, screenAnchors(body)),
+        reading,
+      });
+    }
+    if (read.length === paneBoxes.length && cutKept(read.map((pane) => pane.shows))) panes = read;
+  }
+
+  const ms = Math.round(performance.now() - started);
+  const peakMb = Math.round(process.resourceUsage().maxRSS / 1024);
+  const timed = (reading: ScreenReading): ScreenReading => ({ ...reading, ms, peakMb });
+  return {
+    reading: timed(whole),
+    ...(panes
+      ? { panes: panes.map((pane) => ({ ...pane, reading: timed(pane.reading) })), cut: cutBy }
+      : {}),
+    twoScreens: two || (late && cutApart),
+    ...(late ? { late: true as const } : {}),
+  };
+}
+
+/** The status band (`band`, in the picture's pixels) in the pixels of `box`: 0 below its top. */
+function bandIn(band: number, box: Box): number {
+  return Math.max(0, band - box.y0);
+}
+
+interface Region {
+  image: () => Sharp;
+  readText: ReadText;
+  template: HeadTemplate;
+  /** The status bar's lines, read once, in the picture's pixels. */
+  status: () => Promise<TextLine[]>;
+  /** How far down the picture's status bar reaches (`statusBandOf`). */
+  band: number;
+  width: number;
+  height: number;
+}
+
+/**
+ * The picture's status bar read again alone, enlarged: twice as wide as a phone's screen (the
+ * shorter side, so that a landscape picture's is read as large as an upright one's), at most
+ * twice `STATUS_WIDTH`, the strip `STATUS_BAR` of the longer side high (an upright phone's
+ * height: a landscape picture's clock reaches below 4.5% of its height). Its boxes in the
+ * picture's pixels.
+ */
+async function readStatus(
+  image: () => Sharp,
+  width: number,
+  height: number,
+  readText: ReadText,
+): Promise<TextLine[]> {
+  const barHeight = Math.min(height, Math.max(1, Math.round(Math.max(width, height) * STATUS_BAR)));
+  const phone = Math.min(width, height);
+  const scale = (2 * Math.min(phone, STATUS_WIDTH)) / phone;
   const barWidth = Math.round(width * scale);
   const barScaled = Math.max(1, Math.round(barHeight * scale));
   const bar = await image()
@@ -102,11 +353,50 @@ export async function readScreen(
     .resize(barWidth, barScaled, { fit: 'fill' })
     .raw()
     .toBuffer();
-  const status = (await readText({ width: barWidth, height: barScaled, data: bar })).map(
-    (line) => ({ ...line, box: scaledBox(line.box, width / barWidth, barHeight / barScaled) }),
+  return (await readText({ width: barWidth, height: barScaled, data: bar })).map((line) =>
+    movedLine(line, (box) => scaledBox(box, width / barWidth, barHeight / barScaled)),
   );
+}
 
-  const text = readScreenText(lines, status, { width, height });
+/** The box moved by `dx`, `dy`. */
+function shifted(box: Box, dx: number, dy: number): Box {
+  return { x0: box.x0 + dx, y0: box.y0 + dy, x1: box.x1 + dx, y1: box.y1 + dy };
+}
+
+/**
+ * One screen of the picture, `box` in its pixels, read as a screenshot of its own at most
+ * `readWidth` wide: its lines, the text, the heads, the purple, with the picture's status lines
+ * moved into its pixels (the clock is the picture's), and the status band only when it touches
+ * the picture's top (`touchesTop`).
+ */
+async function readRegion(
+  region: Region,
+  box: Box,
+  readWidth: number,
+  touchesTop: boolean,
+): Promise<ScreenReading> {
+  const { image, readText, template } = region;
+  const width = box.x1 - box.x0;
+  const height = box.y1 - box.y0;
+  const whole = width === region.width && height === region.height;
+  const cropped = () =>
+    whole ? image() : image().extract({ left: box.x0, top: box.y0, width, height });
+  const smallWidth = Math.min(width, readWidth);
+  const smallHeight = Math.max(1, Math.round((height * smallWidth) / width));
+  const small = await cropped().resize(smallWidth, smallHeight, { fit: 'fill' }).raw().toBuffer();
+  const smallImage = { width: smallWidth, height: smallHeight, data: small };
+  const lines = (await readText(smallImage)).map((line) =>
+    movedLine(line, (one) => scaledBox(one, width / smallWidth, height / smallHeight)),
+  );
+  const status = (await region.status()).map((line) =>
+    movedLine(line, (one) => shifted(one, -box.x0, -box.y0)),
+  );
+  const text = readScreenText(
+    lines,
+    status,
+    { width, height },
+    { statusBand: touchesTop ? bandIn(region.band, box) : 0 },
+  );
   const band = headBand(text);
   let heads: HeadCount | null = null;
   if (band) {
@@ -114,7 +404,7 @@ export async function readScreen(
     const bottom = Math.min(height, Math.round(band.bottom));
     if (bottom - top > 1) {
       const { data, info } = await image()
-        .extract({ left: 0, top, width, height: bottom - top })
+        .extract({ left: box.x0, top: box.y0 + top, width, height: bottom - top })
         .greyscale()
         .raw()
         .toBuffer({ resolveWithObject: true });
@@ -125,7 +415,6 @@ export async function readScreen(
       );
     }
   }
-
   return {
     width,
     height,
@@ -135,8 +424,8 @@ export async function readScreen(
     purple: purpleShare(smallImage),
     lines,
     status,
-    ms: Math.round(performance.now() - started),
-    peakMb: Math.round(process.resourceUsage().maxRSS / 1024),
+    ms: 0,
+    peakMb: 0,
   };
 }
 
diff --git a/src/ocr/worker.ts b/src/ocr/worker.ts
index 1a1278ba..f36f5d15 100644
--- a/src/ocr/worker.ts
+++ b/src/ocr/worker.ts
@@ -13,7 +13,7 @@ import {
   type WorkerMessage,
   type WorkerStart,
 } from './protocol.js';
-import { loadHeadTemplate, NotAnImageError, readScreen } from './screen-reader.js';
+import { loadHeadTemplate, NotAnImageError, readPicture } from './screen-reader.js';
 import { textReader, type ReadText } from './text-reader.js';
 import type { HeadTemplate } from '../domain/ocr/tier-heads.js';
 
@@ -45,8 +45,11 @@ async function main(): Promise<void> {
     send({ kind: 'received', id: message.id });
     void (async () => {
       try {
-        const reading = await readScreen(message.bytes, readText, template);
-        send({ kind: 'read', id: message.id, reading });
+        const picture = await readPicture(message.bytes, readText, template, {
+          ...(message.divider === false ? { divider: false } : {}),
+          ...(message.panesWithinMs === undefined ? {} : { panesWithinMs: message.panesWithinMs }),
+        });
+        send({ kind: 'read', id: message.id, ...picture });
       } catch (err) {
         send(
           err instanceof NotAnImageError
diff --git a/src/services/ocr-service.test.ts b/src/services/ocr-service.test.ts
index cea24ce2..03d9414a 100644
--- a/src/services/ocr-service.test.ts
+++ b/src/services/ocr-service.test.ts
@@ -135,6 +135,44 @@ describe('OcrService', () => {
     expect(gymOf(await ocr.read(bytes('fine')))).toBe('fine');
   });
 
+  it('hands over the panes of a split screen, and whether the whole shows two screens', async () => {
+    const { ocr } = service();
+    const split = await ocr.read(bytes('split'));
+    expect(split.kind === 'read' && split.panes?.map((pane) => pane.reading.text.gym)).toEqual([
+      'pane 1',
+      'pane 2',
+    ]);
+    expect(split).toMatchObject({ cut: 'divider', twoScreens: true });
+    expect(await ocr.read(bytes('two'))).toMatchObject({ kind: 'read', twoScreens: true });
+    const one = await ocr.read(bytes('one'));
+    expect(one.kind === 'read' && [one.panes, one.twoScreens]).toEqual([undefined, undefined]);
+  });
+
+  it('gives the reading process a budget for the panes, 85% of its time from the request', async () => {
+    const { ocr } = service({ timeoutMs: 8_000 });
+    expect(gymOf(await ocr.read(bytes('budget?')))).toBe('panes within 6800');
+  });
+
+  it('says so in the log when a picture was read without its panes for lack of time', async () => {
+    const { ocr, entries } = service();
+    expect(await ocr.read(bytes('late'))).toMatchObject({
+      kind: 'read',
+      late: true,
+      twoScreens: true,
+    });
+    expect(
+      entries.some(
+        (entry) => entry.msg === 'read a screenshot without its panes, for lack of time',
+      ),
+    ).toBe(true);
+  });
+
+  it('asks the reading process to look for no divider when told so', async () => {
+    const { ocr } = service();
+    expect(gymOf(await ocr.read(bytes('divider?')))).toBe('divider on');
+    expect(gymOf(await ocr.read(bytes('divider?'), { divider: false }))).toBe('divider off');
+  });
+
   it('ends a process that takes too long or dies, and starts a new one for the next screenshot', async () => {
     const { ocr, entries } = service({ timeoutMs: 1_500 });
     const before = pidOf(await ocr.read(bytes('before')));
diff --git a/src/services/ocr-service.ts b/src/services/ocr-service.ts
index 47f95fa0..37678f34 100644
--- a/src/services/ocr-service.ts
+++ b/src/services/ocr-service.ts
@@ -4,10 +4,22 @@ import { fileURLToPath } from 'node:url';
 import { deviceProblem, type OcrAssetPaths, type OcrDevice } from '../domain/ocr/assets.js';
 import type { Logger } from '../log.js';
 import type { ReadRequest, WorkerMessage, WorkerStart } from '../ocr/protocol.js';
-import type { ScreenReading } from '../ocr/screen-reader.js';
+import type { PaneReading, ScreenReading } from '../ocr/screen-reader.js';
 
 export type OcrOutcome =
-  | { kind: 'read'; reading: ScreenReading }
+  | {
+      kind: 'read';
+      /** The whole picture read as one screen. */
+      reading: ScreenReading;
+      /** The panes of a split screen, each read as a screenshot of its own (plan 7P). */
+      panes?: readonly PaneReading[];
+      /** How the panes were found. */
+      cut?: 'divider' | 'text';
+      /** The whole reading shows two screens (`twoScreens`); absent: it does not. */
+      twoScreens?: boolean;
+      /** A cut's panes were not read for lack of time (`PictureReading.late`). */
+      late?: true;
+    }
   /** More screenshots wait than `queue` allows: try again shortly. */
   | { kind: 'busy' }
   /** The reader cannot run: its files could not be had, or its process did not start. */
@@ -31,6 +43,8 @@ export interface ReadOptions {
    * `busy`: its interaction could no longer be answered when the reading was done.
    */
   startBy?: number;
+  /** False: no divider is looked for (`ocr:check --no-divider`, the foldable's path). */
+  divider?: boolean;
 }
 
 /** Reading raid screenshots (Phase 7): one at a time, in a process of its own. */
@@ -76,6 +90,13 @@ export interface OcrServiceOptions {
 
 const here = fileURLToPath(import.meta.url);
 const WORKER = path.join(path.dirname(here), '..', 'ocr', `worker${path.extname(here)}`);
+/**
+ * The share of `timeoutMs` the reading process must foresee a split screenshot's panes to end
+ * within, or it reads none (plan 7P, review R2): it foresees them by what the whole reading
+ * took for its pixels, so a share near the timeout is safe; the rest is room for the handing
+ * over and a misjudged pane.
+ */
+const PANES_WITHIN = 0.85;
 /** A process asked to end is killed outright after this long. */
 const KILL_AFTER_MS = 2_000;
 
@@ -115,6 +136,7 @@ export function workerEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
 interface Job {
   bytes: Uint8Array;
   startBy: number | undefined;
+  divider: boolean;
   resolve: (outcome: OcrOutcome) => void;
 }
 
@@ -178,7 +200,12 @@ export class OcrService implements ScreenshotReader {
           this.options.log.error({ err }, 'a waiting screenshot could not be told so');
         }
       }
-      this.waiting.push({ bytes, startBy: options.startBy, resolve });
+      this.waiting.push({
+        bytes,
+        startBy: options.startBy,
+        divider: options.divider ?? true,
+        resolve,
+      });
       void this.pump();
     });
   }
@@ -206,7 +233,7 @@ export class OcrService implements ScreenshotReader {
     clearTimeout(this.idleTimer);
     let outcome: OcrOutcome;
     try {
-      outcome = await this.readNow(job.bytes);
+      outcome = await this.readNow(job.bytes, job.divider);
     } catch (err) {
       this.options.log.error({ err }, 'the screenshot reader failed');
       outcome = { kind: 'failed' };
@@ -221,7 +248,7 @@ export class OcrService implements ScreenshotReader {
     }
   }
 
-  private async readNow(bytes: Uint8Array, again = false): Promise<OcrOutcome> {
+  private async readNow(bytes: Uint8Array, divider: boolean, again = false): Promise<OcrOutcome> {
     // A process that died while idle may not have said so yet.
     if (this.worker && !this.worker.child.connected) await this.stopWorker();
     const worker = this.worker ?? (await this.startWorker());
@@ -242,7 +269,15 @@ export class OcrService implements ScreenshotReader {
         clearTimeout(timer);
         resolve(message);
       };
-      const request: ReadRequest = { kind: 'read', id, bytes };
+      const request: ReadRequest = {
+        kind: 'read',
+        id,
+        bytes,
+        ...(divider ? {} : { divider }),
+        // A time relative to the request's arrival: the reading process judges it by its own
+        // clock (review R3).
+        panesWithinMs: this.options.timeoutMs * PANES_WITHIN,
+      };
       worker.child.send(request, (err) => {
         if (err) worker.answer?.('unsent');
       });
@@ -254,7 +289,7 @@ export class OcrService implements ScreenshotReader {
       // idle): one more try with a new one. A process that died with the screenshot in its
       // hands is not given it again.
       await this.stopWorker();
-      return this.readNow(bytes, true);
+      return this.readNow(bytes, divider, true);
     }
     if (answer === 'timeout' || answer === 'exited' || answer === 'unsent') {
       if (!this.closed) {
@@ -269,7 +304,19 @@ export class OcrService implements ScreenshotReader {
     switch (answer.kind) {
       case 'read':
         this.options.log.info({ ms, readMs: answer.reading.ms }, 'read a screenshot');
-        return { kind: 'read', reading: answer.reading };
+        if (answer.late) {
+          this.options.log.info(
+            { ms, readMs: answer.reading.ms },
+            'read a screenshot without its panes, for lack of time',
+          );
+        }
+        return {
+          kind: 'read',
+          reading: answer.reading,
+          ...(answer.panes ? { panes: answer.panes, cut: answer.cut ?? 'divider' } : {}),
+          ...(answer.twoScreens ? { twoScreens: true } : {}),
+          ...(answer.late ? { late: true } : {}),
+        };
       case 'not-an-image':
         return { kind: 'not-an-image' };
       case 'failed':
diff --git a/test/support/ocr-worker.ts b/test/support/ocr-worker.ts
index a6d9d323..d8c2b780 100644
--- a/test/support/ocr-worker.ts
+++ b/test/support/ocr-worker.ts
@@ -3,7 +3,10 @@
  * `src/ocr/worker.ts` without models. What it does depends on the screenshot's bytes as text:
  * `hang` never answers, `crash` exits, `not` is not an image, `fail` fails, anything else is read
  * as a reading whose gym is that text (or its length, for more than a kilobyte), whose `width` is
- * this process's id and whose `height` its priority. A start whose detector path is
+ * this process's id and whose `height` its priority; `split` has two panes read (gyms `pane 1`
+ * and `pane 2`), `two` shows two screens without panes (plan 7P), and `divider?` is read with
+ * the gym `divider on` or `divider off` as the request asked, `budget?` with `panes within <n>`
+ * (the request's time for the panes), and `late` as a split read without its panes. A start whose detector path is
  * `cannot-start` fails to start. The text `secret` is answered with the value of the environment
  * variable `PINE_TEST_SECRET` as the gym (`none` when the process does not have it).
  */
@@ -35,31 +38,58 @@ process.on('message', (request: ReadRequest) => {
   if (text === 'crash') process.exit(3);
   if (text === 'not') return send({ kind: 'not-an-image', id: request.id });
   if (text === 'fail') return send({ kind: 'failed', id: request.id, reason: 'broken' });
+  const gym =
+    text === 'secret'
+      ? (process.env.PINE_TEST_SECRET ?? 'none')
+      : text === 'divider?'
+        ? `divider ${request.divider === false ? 'off' : 'on'}`
+        : text === 'budget?'
+          ? `panes within ${String(request.panesWithinMs)}`
+          : text;
   send({
     kind: 'read',
     id: request.id,
-    reading: {
-      width: process.pid,
-      height: getPriority(),
-      text: {
-        clock: null,
-        countdown: null,
-        gym: text === 'secret' ? (process.env.PINE_TEST_SECRET ?? 'none') : text,
-        eliteBadge: false,
-        cp: null,
-        bossName: null,
-        countdownBox: null,
-        countdownPlace: null,
-        cpBox: null,
-      },
-      band: null,
-      heads: null,
-      purple: 0,
-      lines: [],
-      status: [],
-      ms: 1,
-      peakMb: 1,
-    },
+    reading: readingOf(gym),
+    twoScreens: text === 'split' || text === 'two' || text === 'late',
+    ...(text === 'late' ? { late: true } : {}),
+    ...(text === 'split'
+      ? {
+          cut: 'divider' as const,
+          panes: [1, 2].map((index) => ({
+            index,
+            of: 2,
+            box: { x0: 0, y0: (index - 1) * 50, x1: 100, y1: index * 50 },
+            shows: 'raid' as const,
+            reading: readingOf(`pane ${index}`),
+          })),
+        }
+      : {}),
   });
 });
+
+/** A reading whose gym is `gym`, its width this process's id and its height its priority. */
+function readingOf(gym: string) {
+  return {
+    width: process.pid,
+    height: getPriority(),
+    text: {
+      clock: null,
+      countdown: null,
+      gym,
+      eliteBadge: false,
+      cp: null,
+      bossName: null,
+      countdownBox: null,
+      countdownPlace: null,
+      cpBox: null,
+    },
+    band: null,
+    heads: null,
+    purple: 0,
+    lines: [],
+    status: [],
+    ms: 1,
+    peakMb: 1,
+  };
+}
 process.on('disconnect', () => process.exit(0));
````

### Task 3: 7P task 3: ScreenshotService reads, decides and keeps each pane

Prototype commit: `2dc8e19fec0157640b4dab477065bc243fc26618`

readPanes gives an outcome per pane that shows a screen (one screen is one pane; a pane
with no screen is left out), each with its place (index, of, box, side) and a record and
file of its own, the second file a hard link of the first (a copy where links are
refused); a pane of the kind the caller does not report is not kept when one it reports
is beside it, and a further pane is read only when the caller allows it (anotherPane).
Two screens that could not be told apart are refused two-screens, raids and max battles
alike, kept for review but read passively. read stays as the adapter of one screen for
the callers until they take panes.

**Files:**

```
 src/render/screenshot-reading.test.ts   |  26 ++++++
 src/render/screenshot-reading.ts        |  47 +++++++++-
 src/services/screenshot-service.test.ts | 199 ++++++++++++++++++++++++++++++++++------
 src/services/screenshot-service.ts      | 256 ++++++++++++++++++++++++++++++++++++++++++++--------
 src/services/screenshot-store.test.ts   |  25 +++++
 src/services/screenshot-store.ts        |  44 ++++++++-
 test/support/screenshot-service.ts      |  19 ++++
 test/support/screenshots.ts             |  24 +++++
 8 files changed, 563 insertions(+), 77 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/screenshot-reading.test.ts src/services/screenshot-service.test.ts src/services/screenshot-store.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 2dc8e19fec0157640b4dab477065bc243fc26618 -- src test scripts data docs/architecture docs/guides docs/superpowers/ocr-improvements.md docs/superpowers/plans/2026-10-27-phase-7p-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `7P task 3: ScreenshotService reads, decides and keeps each pane`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/render/screenshot-reading.test.ts b/src/render/screenshot-reading.test.ts
index aa05de2e..6bc91995 100644
--- a/src/render/screenshot-reading.test.ts
+++ b/src/render/screenshot-reading.test.ts
@@ -4,11 +4,13 @@ import { accentOf, textDisplays, thumbnailOf } from '../../test/support/messages
 import { expectV2Sendable } from '../../test/support/post-limits.js';
 import {
   doubtWords,
+  maxRefusalWords,
   readingLines,
   refusalWords,
   screenshotMessage,
   shortReading,
   SHOT_COLOUR,
+  TWO_SCREENS,
 } from './screenshot-reading.js';
 
 const NAMES: Record<number, string> = { 7: 'Heinz *Plant*' };
@@ -93,6 +95,30 @@ describe('readingLines', () => {
   });
 });
 
+describe('refusalWords of two screens of one kind (plan 7P)', () => {
+  it('points to the mention, or to posting it as it is where screenshots are read passively', () => {
+    expect(refusalWords('several')).toBe(
+      'This screenshot shows two screens of one kind: post it in the channel with a mention of me to report both.',
+    );
+    expect(refusalWords('several', true)).toBe(
+      'This screenshot shows two screens of one kind: post it in the channel to report both.',
+    );
+  });
+});
+
+describe('maxRefusalWords of split screenshots (plan 7P)', () => {
+  const times = { firstBattle: '6:00', lastBattle: '21:00' };
+  it('says two screens it could not tell apart, and points to reporting two max battles', () => {
+    expect(maxRefusalWords('two-screens', times)).toBe(TWO_SCREENS);
+    expect(maxRefusalWords('several', times)).toBe(
+      'This screenshot shows two max battles: post it in the channel with a mention of me to report both.',
+    );
+    expect(maxRefusalWords('several', times, null, true)).toBe(
+      'This screenshot shows two max battles: post it in the channel to report both.',
+    );
+  });
+});
+
 describe('shortReading', () => {
   it('names the raid, the gym and the time in one line', () => {
     expect(shortReading(report(), gymName)).toBe(
diff --git a/src/render/screenshot-reading.ts b/src/render/screenshot-reading.ts
index 3dca0259..3f32fe07 100644
--- a/src/render/screenshot-reading.ts
+++ b/src/render/screenshot-reading.ts
@@ -159,6 +159,16 @@ interface ShotView {
   picture?: string | undefined;
   /** "All right" and "Something is wrong". */
   buttons?: readonly APIButtonComponent[] | undefined;
+  /**
+   * A pane of a split screenshot (plan 7P): its place ("Top", "Left") heads the reading, and the
+   * message holds `of` panes, each in its share of the room.
+   */
+  pane?: { place: string; of: number };
+}
+
+/** A pane's place in words: "Top", "Bottom", "Left", "Right". */
+export function placeName(side: 'top' | 'bottom' | 'left' | 'right'): string {
+  return `${side.slice(0, 1).toUpperCase()}${side.slice(1)}`;
 }
 
 /** What a message about a raid's screenshot shows (`screenshotMessage`). */
@@ -202,11 +212,13 @@ function shotMessage(
   lines: readonly string[],
   doubtTexts: readonly string[],
 ): V2Message {
-  const read = cutMarkdown(lines.join('\n'), READING_ROOM);
+  const share = view.pane?.of ?? 1;
+  const heading = view.pane ? [`**${view.pane.place}**`] : [];
+  const read = cutMarkdown([...heading, ...lines].join('\n'), Math.floor(READING_ROOM / share));
   const doubts =
     doubtTexts.length === 0
       ? undefined
-      : cutMarkdown(`-# Not sure: ${doubtTexts.join(' ')}`, DOUBTS_ROOM);
+      : cutMarkdown(`-# Not sure: ${doubtTexts.join(' ')}`, Math.floor(DOUBTS_ROOM / share));
   const buttons = view.buttons ?? [];
   return {
     v2: true,
@@ -265,8 +277,13 @@ export function maxRefusalWords(
   reason: string,
   times: BattleTimes,
   read: string | null = null,
+  passive = false,
 ): string {
   switch (reason) {
+    case 'two-screens':
+      return TWO_SCREENS;
+    case 'several':
+      return `This screenshot shows two max battles: ${reportBothWords('it', passive)}.`;
     case 'not-a-max-screen':
       return 'That is a raid: use `/raid screenshot:`, or post it with a mention.';
     case 'over-for-today':
@@ -389,13 +406,35 @@ export function maxReadingLines(
   return lines;
 }
 
-/** Why a screenshot was not made into a raid (`refuse`'s reason). */
-export function refusalWords(reason: string): string {
+/** A picture of two screens that could not be told apart (plan 7P, design section 4). */
+export const TWO_SCREENS =
+  'This looks like two screens in one picture, and I could not tell them apart. Send each screen on its own.';
+
+/**
+ * How a member reports both screens of a split screenshot (plan 7P, Matt's Q1): with a mention
+ * of the bot, or, where screenshots are read passively (`passive`), by posting `what` as it is.
+ * Every pointer of 7P is worded by this.
+ */
+export function reportBothWords(what: string, passive: boolean): string {
+  return passive
+    ? `post ${what} in the channel to report both`
+    : `post ${what} in the channel with a mention of me to report both`;
+}
+
+/**
+ * Why a screenshot was not made into a raid (`refuse`'s reason); `passive`: screenshots are
+ * read passively where it was sent (for `several`'s pointer).
+ */
+export function refusalWords(reason: string, passive = false): string {
   switch (reason) {
     case 'no-gym':
       return 'I could not find the gym of this screenshot among this server’s gyms.';
     case 'raid-over':
       return 'By its countdown this raid has already ended.';
+    case 'two-screens':
+      return TWO_SCREENS;
+    case 'several':
+      return `This screenshot shows two screens of one kind: ${reportBothWords('it', passive)}.`;
     default:
       return 'This does not look like the screen of a raid, so I made nothing of it.';
   }
diff --git a/src/services/screenshot-service.test.ts b/src/services/screenshot-service.test.ts
index fe749ead..445af881 100644
--- a/src/services/screenshot-service.test.ts
+++ b/src/services/screenshot-service.test.ts
@@ -4,8 +4,10 @@ import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
 import { maxReportingWith, MAX_THURSDAY } from '../../test/support/max-reporting.js';
 import { at, TEST_SPOT } from '../../test/support/parties.js';
-import { screenshotsWith } from '../../test/support/screenshot-service.js';
-import { eggReading, maxReading, readingOf } from '../../test/support/screenshots.js';
+import { readOne, screenshotsWith } from '../../test/support/screenshot-service.js';
+import { statSync } from 'node:fs';
+import path from 'node:path';
+import { eggReading, maxReading, readingOf, splitOutcome } from '../../test/support/screenshots.js';
 import { keptRow } from '../../test/support/wayspot-cases.js';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { raidBossCp } from '../domain/pogo/cp.js';
@@ -41,7 +43,7 @@ describe('ScreenshotService', () => {
       'egg.png',
       eggReading('Old Stone Fountain', 5, { hour: 13, minute: 39 }, 600),
     );
-    const outcome = await screenshots.read(source, where());
+    const outcome = await readOne(screenshots, source, where());
     expect(outcome).toMatchObject({
       kind: 'read',
       report: { gym: { gymId: 2, clear: true }, stage: 'egg', tier: { level: 'T5' } },
@@ -62,7 +64,7 @@ describe('ScreenshotService', () => {
       'Screenshot_20261014-133700.png',
       eggReading('Old Stone Fountain', 5, null, 600),
     );
-    const outcome = await screenshots.read(source, where());
+    const outcome = await readOne(screenshots, source, where());
     expect(outcome).toMatchObject({
       report: { takenAt: DateTime.fromISO('2026-10-14T13:37:00', { zone: ZONE }).toMillis() },
       decision: { raid: { timeUncertain: false } },
@@ -73,11 +75,15 @@ describe('ScreenshotService', () => {
     const { screenshots, screenshot, files } = screenshotsWith();
     // Two gyms called Starbucks, outside a region channel (all of the server's gyms).
     const unclear = screenshot('a.png', eggReading('Starbucks', 1, { hour: 13, minute: 39 }));
-    const asked = await screenshots.read(unclear, where({ channelId: null }));
+    const asked = await readOne(screenshots, unclear, where({ channelId: null }));
     expect(asked).toMatchObject({ decision: { kind: 'ask' } });
     if (asked.kind !== 'read' || !asked.id) throw new Error('not kept');
     expect(files('review')).toContain(`${asked.id}.json`);
-    const typed = await screenshots.read(unclear, where({ channelId: null, typed: { gymId: 5 } }));
+    const typed = await readOne(
+      screenshots,
+      unclear,
+      where({ channelId: null, typed: { gymId: 5 } }),
+    );
     expect(typed).toMatchObject({ decision: { kind: 'report', raid: { gymId: 5 } } });
   });
 
@@ -87,7 +93,8 @@ describe('ScreenshotService', () => {
       'Screenshot_20261014-133800.png',
       eggReading('Starbucks', 1, { hour: 13, minute: 39 }),
     );
-    const outcome = await screenshots.read(
+    const outcome = await readOne(
+      screenshots,
       unclear,
       where({ channelId: null, typed: { gymId: 5 } }),
     );
@@ -127,7 +134,7 @@ describe('ScreenshotService', () => {
       },
       { text: '76%', confidence: 0.9, box: { x0: 900, y0: 0, x1: 1000, y1: 20 } },
     ];
-    const outcome = await screenshots.read(screenshot('egg.png', reading), where());
+    const outcome = await readOne(screenshots, screenshot('egg.png', reading), where());
     if (outcome.kind !== 'read' || !outcome.id) throw new Error('not kept');
     const kept = await screenshots.get(outcome.id);
     if (!kept || kept === 'gone') throw new Error('not kept');
@@ -138,7 +145,7 @@ describe('ScreenshotService', () => {
     const { screenshots, screenshot, files } = screenshotsWith();
     const reading = readingOf({ gym: 'A private note' });
     reading.status = [{ text: '13:39', confidence: 0.9, box: { x0: 0, y0: 0, x1: 50, y1: 20 } }];
-    const outcome = await screenshots.read(screenshot('cat.png', reading), where());
+    const outcome = await readOne(screenshots, screenshot('cat.png', reading), where());
     if (outcome.kind !== 'read' || !outcome.id) throw new Error('not kept');
     expect(files('held')).toEqual([`${outcome.id}.json`]);
     const kept = await screenshots.get(outcome.id);
@@ -154,8 +161,8 @@ describe('ScreenshotService', () => {
     const { screenshots, screenshot, reader } = screenshotsWith();
     reader.lateAfter = 1_000;
     const source = screenshot('q.png', eggReading('Old Stone Fountain', 1, null));
-    expect(await screenshots.read(source, where({ startBy: 999 }))).toEqual({ kind: 'busy' });
-    expect(await screenshots.read(source, where({ startBy: 1_001 }))).toMatchObject({
+    expect(await readOne(screenshots, source, where({ startBy: 999 }))).toEqual({ kind: 'busy' });
+    expect(await readOne(screenshots, source, where({ startBy: 1_001 }))).toMatchObject({
       kind: 'read',
     });
   });
@@ -163,7 +170,7 @@ describe('ScreenshotService', () => {
   it('keeps nothing of a passive read it refused: that is a member’s ordinary picture', async () => {
     const { screenshots, screenshot, files } = screenshotsWith();
     const cat = screenshot('cat.jpg', readingOf({ gym: 'Old Stone Fountain' }));
-    const outcome = await screenshots.read(cat, where({ use: 'passive' }));
+    const outcome = await readOne(screenshots, cat, where({ use: 'passive' }));
     expect(outcome).toMatchObject({
       kind: 'read',
       id: undefined,
@@ -175,13 +182,13 @@ describe('ScreenshotService', () => {
   it('answers what kept it from reading: too large, the download, the reader', async () => {
     const { screenshots, screenshot, attachments } = screenshotsWith();
     const large = { ...screenshot('big.png', { kind: 'busy' }), size: MAX_SCREENSHOT_BYTES + 1 };
-    expect(await screenshots.read(large, where())).toEqual({ kind: 'too-large' });
+    expect(await readOne(screenshots, large, where())).toEqual({ kind: 'too-large' });
     expect(attachments.asked).toEqual([]);
-    expect(await screenshots.read(screenshot('busy.png', { kind: 'busy' }), where())).toEqual({
+    expect(await readOne(screenshots, screenshot('busy.png', { kind: 'busy' }), where())).toEqual({
       kind: 'busy',
     });
     attachments.failing = true;
-    expect(await screenshots.read(screenshot('x.png', { kind: 'busy' }), where())).toEqual({
+    expect(await readOne(screenshots, screenshot('x.png', { kind: 'busy' }), where())).toEqual({
       kind: 'download-failed',
     });
     expect(unreadWords({ kind: 'busy' })).toMatch(/Too many screenshots are waiting/);
@@ -191,7 +198,7 @@ describe('ScreenshotService', () => {
     const { screenshots, screenshot, reader, attachments } = screenshotsWith();
     reader.isFull = true;
     const source = screenshot('q.png', eggReading('Old Stone Fountain', 1, null));
-    expect(await screenshots.read(source, where())).toEqual({ kind: 'busy' });
+    expect(await readOne(screenshots, source, where())).toEqual({ kind: 'busy' });
     expect(attachments.asked).toEqual([]);
   });
 
@@ -203,7 +210,7 @@ describe('ScreenshotService', () => {
     expect(attachments.asked).toHaveLength(1);
     expect(reader.reads).toBe(0);
     attachments.failing = true;
-    expect(await screenshots.read(fetched.screenshot, where())).toMatchObject({
+    expect(await readOne(screenshots, fetched.screenshot, where())).toMatchObject({
       kind: 'read',
       report: { gym: { gymId: 2 } },
     });
@@ -221,7 +228,8 @@ describe('ScreenshotService', () => {
     const { screenshots, screenshot, reader } = screenshotsWith();
     reader.ahead = 2;
     const ahead: number[] = [];
-    await screenshots.read(
+    await readOne(
+      screenshots,
       screenshot('q.png', eggReading('Old Stone Fountain', 1, null)),
       where({ onQueued: (n) => ahead.push(n) }),
     );
@@ -251,7 +259,7 @@ describe('ScreenshotService: a max battle’s screen (plan 8X-S)', () => {
   it('reads a max screen the max way, and keeps it with its max report and the max bosses', async () => {
     const made = await maxReportingWith();
     const { screenshots, screenshot, files } = screenshotsWith(made.ctx);
-    const outcome = await screenshots.read(screenshot('max.png', maxReading()), maxWhere());
+    const outcome = await readOne(screenshots, screenshot('max.png', maxReading()), maxWhere());
     expect(outcome).toMatchObject({
       kind: 'read',
       screen: 'max',
@@ -298,9 +306,14 @@ describe('ScreenshotService: a max battle’s screen (plan 8X-S)', () => {
       const made = await maxReportingWith();
       const { seen, watch } = watching();
       const { screenshots, screenshot } = screenshotsWith(made.ctx, undefined, watch);
-      await screenshots.read(screenshot('max.png', maxReading(undefined, {}, {}, 3)), maxWhere());
+      await readOne(
+        screenshots,
+        screenshot('max.png', maxReading(undefined, {}, {}, 3)),
+        maxWhere(),
+      );
       // Refused (a Power Spot it does not know), read passively: it still counts.
-      await screenshots.read(
+      await readOne(
+        screenshots,
         screenshot('max2.png', maxReading('NOWHERE AT ALL', {}, {}, 3)),
         maxWhere({ use: 'passive' }),
       );
@@ -327,7 +340,7 @@ describe('ScreenshotService: a max battle’s screen (plan 8X-S)', () => {
         ],
       ]);
       // Heads that agree with the list say nothing.
-      await screenshots.read(screenshot('max3.png', maxReading()), maxWhere());
+      await readOne(screenshots, screenshot('max3.png', maxReading()), maxWhere());
       expect(seen).toHaveLength(2);
     });
 
@@ -336,7 +349,8 @@ describe('ScreenshotService: a max battle’s screen (plan 8X-S)', () => {
       const made = await maxReportingWith();
       const { seen, watch } = watching();
       const { screenshots, screenshot } = screenshotsWith(made.ctx, undefined, watch);
-      await screenshots.read(
+      await readOne(
+        screenshots,
         screenshot('Screenshot_20261020-135800.png', maxReading(undefined, {}, {}, 3)),
         maxWhere(),
       );
@@ -360,7 +374,7 @@ describe('ScreenshotService: a max battle’s screen (plan 8X-S)', () => {
         },
         { heads: 1 },
       );
-      await screenshots.read(screenshot('raid.png', reading), where());
+      await readOne(screenshots, screenshot('raid.png', reading), where());
       expect(seen).toEqual([
         [
           {
@@ -384,7 +398,8 @@ describe('ScreenshotService: a max battle’s screen (plan 8X-S)', () => {
   it('asks which Power Spot a name cut short may be, and decides again with the one chosen', async () => {
     const made = await maxReportingWith(undefined, [POND]);
     const { screenshots, screenshot } = screenshotsWith(made.ctx);
-    const outcome = await screenshots.read(
+    const outcome = await readOne(
+      screenshots,
       screenshot('max.png', maxReading('GAZEBO OF THE P')),
       maxWhere(),
     );
@@ -401,7 +416,8 @@ describe('ScreenshotService: a max battle’s screen (plan 8X-S)', () => {
   it('knows the Power Spots of the whole server, those of another region not as local', async () => {
     const made = await maxReportingWith();
     const { screenshots, screenshot } = screenshotsWith(made.ctx);
-    const outcome = await screenshots.read(
+    const outcome = await readOne(
+      screenshots,
       screenshot('max.png', maxReading()),
       maxWhere({ channelId: EAST_CHANNEL }),
     );
@@ -414,7 +430,8 @@ describe('ScreenshotService: a max battle’s screen (plan 8X-S)', () => {
   it('finds the boss only among the Pokémon that can Dynamax or Gigantamax', async () => {
     const made = await maxReportingWith();
     const { screenshots, screenshot } = screenshotsWith(made.ctx);
-    const outcome = await screenshots.read(
+    const outcome = await readOne(
+      screenshots,
       screenshot('max.png', maxReading(undefined, { species: 'MEWTWO' })),
       maxWhere(),
     );
@@ -428,7 +445,8 @@ describe('ScreenshotService: a max battle’s screen (plan 8X-S)', () => {
   it('keeps nothing of a passive read of a max screen it refused', async () => {
     const made = await maxReportingWith();
     const { screenshots, screenshot, files } = screenshotsWith(made.ctx);
-    const outcome = await screenshots.read(
+    const outcome = await readOne(
+      screenshots,
       screenshot('max.png', maxReading('NOWHERE IN PARTICULAR')),
       maxWhere({ use: 'passive' }),
     );
@@ -441,6 +459,131 @@ describe('ScreenshotService: a max battle’s screen (plan 8X-S)', () => {
   });
 });
 
+describe('ScreenshotService, split screens (plan 7P)', () => {
+  const splitWhere = (more: Partial<ScreenshotWhere> = {}) =>
+    where({ uploadedAt: MAX_THURSDAY, use: 'mention', ...more });
+  const egg = () => eggReading('Old Stone Fountain', 5, { hour: 13, minute: 58 }, 600);
+
+  it('reads, decides and keeps each pane as a screenshot of its own, its file a link of one', async () => {
+    const made = await maxReportingWith();
+    const { screenshots, screenshot, files, dir } = screenshotsWith(made.ctx);
+    const outcome = await screenshots.readPanes(
+      screenshot('split.png', splitOutcome([maxReading(), egg()])),
+      splitWhere(),
+    );
+    if (outcome.kind !== 'panes') throw new Error(outcome.kind);
+    expect(outcome.held).toBe(0);
+    const [max, raid] = outcome.panes;
+    expect(max).toMatchObject({ screen: 'max', pane: { index: 1, of: 2 } });
+    expect(raid).toMatchObject({ screen: 'raid', pane: { index: 2, of: 2 } });
+    if (!max?.id || !raid?.id) throw new Error('not kept');
+    expect(files('held')).toEqual(
+      [`${max.id}.json`, `${max.id}.png`, `${raid.id}.json`, `${raid.id}.png`].sort(),
+    );
+    // One file's bytes for both panes: the second is a hard link of the first.
+    const first = statSync(path.join(dir, 'held', `${max.id}.png`));
+    expect(first.nlink).toBe(2);
+    expect(statSync(path.join(dir, 'held', `${raid.id}.png`)).ino).toBe(first.ino);
+    const kept = await screenshots.get(raid.id);
+    if (!kept || kept === 'gone') throw new Error('not kept');
+    expect(kept.record.pane).toMatchObject({ index: 2, of: 2 });
+  });
+
+  it('answers one screen for a split’s one pane, and two-screens for two to a caller of one', async () => {
+    const made = await maxReportingWith();
+    const { screenshots, screenshot } = screenshotsWith(made.ctx);
+    const withMap = screenshot('map.png', splitOutcome(['none', maxReading()]));
+    expect(await readOne(screenshots, withMap, splitWhere())).toMatchObject({
+      kind: 'read',
+      screen: 'max',
+      pane: { index: 2, of: 2 },
+    });
+    const two = screenshot('two.png', splitOutcome([maxReading(), egg()]));
+    expect(await readOne(screenshots, two, splitWhere())).toEqual({ kind: 'two-screens' });
+  });
+
+  it('refuses two screens it could not tell apart, kept for review but read passively', async () => {
+    const { screenshots, screenshot, files } = screenshotsWith();
+    const mixed = screenshot('mixed.png', { kind: 'read', reading: egg(), twoScreens: true });
+    expect(await screenshots.readPanes(mixed, splitWhere())).toEqual({ kind: 'two-screens' });
+    const [record] = files('review').filter((name) => name.endsWith('.json'));
+    const kept = await screenshots.get(record?.slice(0, -5) ?? '');
+    expect(kept).toMatchObject({ record: { decision: { kind: 'refuse', reason: 'two-screens' } } });
+    const before = files('held').length;
+    expect(await screenshots.readPanes(mixed, splitWhere({ use: 'passive' }))).toEqual({
+      kind: 'two-screens',
+    });
+    expect(files('held')).toHaveLength(before);
+    expect(unreadWords({ kind: 'two-screens' })).toBe(
+      'This looks like two screens in one picture, and I could not tell them apart. Send each screen on its own.',
+    );
+  });
+
+  it('keeps what was typed beside two screens it could not tell apart', async () => {
+    const made = await maxReportingWith();
+    const { screenshots, screenshot, files } = screenshotsWith(made.ctx);
+    const mixed = screenshot('mixed.png', { kind: 'read', reading: egg(), twoScreens: true });
+    await screenshots.readPanes(mixed, splitWhere({ use: 'raid', typed: { gymId: 5 } }));
+    const maxMixed = screenshot('max-mixed.png', {
+      kind: 'read',
+      reading: maxReading(),
+      twoScreens: true,
+    });
+    await screenshots.readPanes(
+      maxMixed,
+      splitWhere({ use: 'max', maxTyped: () => ({ typed: { end: MAX_THURSDAY + 3_600_000 } }) }),
+    );
+    const records = await Promise.all(
+      files('held')
+        .filter((name) => name.endsWith('.json'))
+        .map((name) => screenshots.get(name.slice(0, -5))),
+    );
+    const kept = records.flatMap((one) => (one && one !== 'gone' ? [one.record] : []));
+    expect(kept.find((record) => record.use === 'raid')?.typed).toEqual({ gymId: 5 });
+    expect(kept.find((record) => record.use === 'max')?.maxTyped).toMatchObject({
+      end: MAX_THURSDAY + 3_600_000,
+    });
+  });
+
+  it('keeps two panes of its caller’s one kind as refused, never as reported', async () => {
+    const { screenshots, screenshot } = screenshotsWith();
+    const outcome = await screenshots.readPanes(
+      screenshot('two.png', splitOutcome([egg(), eggReading('Maple Leaf Mosaic', 3, null, 900)])),
+      splitWhere({ use: 'raid', screen: 'raid' }),
+    );
+    if (outcome.kind !== 'panes') throw new Error(outcome.kind);
+    for (const pane of outcome.panes) {
+      const kept = await screenshots.get(pane.id ?? '');
+      expect(kept).toMatchObject({ record: { decision: { kind: 'refuse', reason: 'several' } } });
+    }
+  });
+
+  it('keeps no pane of the kind its caller does not report', async () => {
+    const made = await maxReportingWith();
+    const { screenshots, screenshot } = screenshotsWith(made.ctx);
+    const outcome = await screenshots.readPanes(
+      screenshot('split.png', splitOutcome([maxReading(), egg()])),
+      splitWhere({ use: 'raid', screen: 'raid' }),
+    );
+    if (outcome.kind !== 'panes') throw new Error(outcome.kind);
+    expect(outcome.panes.map((pane) => [pane.screen, pane.id === undefined])).toEqual([
+      ['max', true],
+      ['raid', false],
+    ]);
+  });
+
+  it('reads a second pane only when it may, and counts the one it may not', async () => {
+    const made = await maxReportingWith();
+    const { screenshots, screenshot, files } = screenshotsWith(made.ctx);
+    const outcome = await screenshots.readPanes(
+      screenshot('split.png', splitOutcome([maxReading(), egg()])),
+      splitWhere({ anotherPane: () => false }),
+    );
+    expect(outcome).toMatchObject({ kind: 'panes', held: 1, panes: [{ screen: 'max' }] });
+    expect(files('held')).toHaveLength(2);
+  });
+});
+
 describe('screenshotsOf', () => {
   it('takes pictures by their content type or, without one, their name; ten at most', () => {
     const file = (name: string, contentType: string | null) => ({
diff --git a/src/services/screenshot-service.ts b/src/services/screenshot-service.ts
index e7ce4408..e27c7814 100644
--- a/src/services/screenshot-service.ts
+++ b/src/services/screenshot-service.ts
@@ -31,13 +31,15 @@ import {
 } from '../domain/ocr/screenshot-record.js';
 import { raidDurationKind, type RaidTier } from '../domain/pogo/raid-tier.js';
 import { raidDurationRules, raidDurationsAt } from '../domain/time/raid-durations.js';
-import type { TextLine } from '../domain/ocr/image.js';
+import type { Box, TextLine } from '../domain/ocr/image.js';
+import { paneSide, type PaneSide } from '../domain/ocr/panes.js';
 import type { ScreenReading } from '../ocr/screen-reader.js';
 import { screenshotReport, type ScreenshotReport } from '../domain/ocr/screenshot-report.js';
+import { TWO_SCREENS } from '../render/screenshot-reading.js';
 import type { AttachmentGateway } from './attachment-gateway.js';
 import { MAX_SCREENSHOT_BYTES, type ScreenshotReader } from './ocr-service.js';
 import { maxReportContext, reportContext } from './screenshot-context.js';
-import type { KeptScreenshot, ScreenshotKeeping } from './screenshot-store.js';
+import type { KeptScreenshot, NewScreenshot, ScreenshotKeeping } from './screenshot-store.js';
 import type { ListTierWatch } from './list-tier-watch.js';
 
 /** The images of one message that are read, in order: as many as Discord allows a message. */
@@ -96,6 +98,26 @@ export interface ScreenshotWhere {
    * interaction could no longer be answered).
    */
   startBy?: number;
+  /**
+   * The kind of screen the caller reports (`/raid` a raid's, `/max` a max battle's): a pane of
+   * the other kind is decided but not kept (plan 7P). Absent: both kinds (a mention).
+   */
+  screen?: 'raid' | 'max';
+  /**
+   * Asked once for every pane after the first that shows a screen (plan 7P), after the read:
+   * whether it may be read (a mention's throttle takes a use of its own for it). False: nothing
+   * of that pane is decided or kept, and `PanesOutcome.held` counts it.
+   */
+  anotherPane?: () => boolean;
+}
+
+/** Where a pane stands in a split screenshot (plan 7P): 1 the top or left one, of how many. */
+export interface PanePlace {
+  index: number;
+  of: number;
+  box: Box;
+  /** Where it stands: the top or bottom one of a split above and below, else left or right. */
+  side: PaneSide;
 }
 
 /**
@@ -123,6 +145,8 @@ export type ScreenshotOutcome =
       screen: 'raid';
       /** The kept screenshot's id; undefined when it was not kept. */
       id: string | undefined;
+      /** The pane of a split screenshot it was read from (plan 7P); absent for one screen. */
+      pane?: PanePlace;
       report: ScreenshotReport;
       decision: ScreenshotDecision;
       /**
@@ -136,6 +160,8 @@ export type ScreenshotOutcome =
       screen: 'max';
       /** The kept screenshot's id; undefined when it was not kept. */
       id: string | undefined;
+      /** The pane of a split screenshot it was read from (plan 7P); absent for one screen. */
+      pane?: PanePlace;
       /** The max report with what was typed put in (`maxTyped`), which was decided. */
       report: MaxScreenshotReport;
       /** The reader's own max report, without what was typed (what it read). */
@@ -154,7 +180,24 @@ export type ScreenshotOutcome =
   | { kind: 'not-an-image' }
   | { kind: 'busy' }
   | { kind: 'unavailable' }
-  | { kind: 'failed' };
+  | { kind: 'failed' }
+  /**
+   * The picture shows two screens that could not be told apart (plan 7P, `twoScreens` without
+   * a kept cut): refused rather than read as one, raids and max battles alike.
+   */
+  | { kind: 'two-screens' };
+
+/** A screenshot read: one screen's outcome, or a pane's. */
+export type ReadOutcome = Extract<ScreenshotOutcome, { kind: 'read' }>;
+
+/**
+ * What came of a screenshot that may show two screens (plan 7P): an outcome per pane that shows
+ * one (a screenshot of one screen is one), top or left first; `held` panes were not read for
+ * want of a use (`ScreenshotWhere.anotherPane`). Or why nothing was read.
+ */
+export type PanesOutcome =
+  | { kind: 'panes'; panes: ReadOutcome[]; held: number }
+  | Exclude<ScreenshotOutcome, { kind: 'read' }>;
 
 /**
  * A screenshot downloaded ahead of its reading (plan 8R-9F, B2: a picture posted in the region's
@@ -172,11 +215,23 @@ export type FetchOutcome =
 
 /** Screenshots on Discord: read, reported on, kept, and what members say of them. */
 export interface Screenshots {
-  /** Reads a screenshot, downloaded now, or ahead by `fetch` (then not again). */
+  /**
+   * One screen's outcome (`readPanes` for a caller of one screen until each takes panes): a
+   * split screenshot's one pane, or `two-screens` when it shows more than one. Downloaded now,
+   * or ahead by `fetch` (then not again).
+   */
   read(
     source: ScreenshotSource | FetchedScreenshot,
     where: ScreenshotWhere,
   ): Promise<ScreenshotOutcome>;
+  /**
+   * A screenshot read: each pane of a split one (plan 7P) decided and kept as a screenshot of
+   * its own; one screen is one pane. Downloaded now, or ahead by `fetch`.
+   */
+  readPanes(
+    source: ScreenshotSource | FetchedScreenshot,
+    where: ScreenshotWhere,
+  ): Promise<PanesOutcome>;
   /** Downloads a screenshot to be read later (plan 8R-9F, B2), within `MAX_SCREENSHOT_BYTES`. */
   fetch(source: ScreenshotSource): Promise<FetchOutcome>;
   /** The kept screenshot; `gone` when its file vanished. */
@@ -246,6 +301,16 @@ export class ScreenshotService implements Screenshots {
     source: ScreenshotSource | FetchedScreenshot,
     where: ScreenshotWhere,
   ): Promise<ScreenshotOutcome> {
+    const outcome = await this.readPanes(source, where);
+    if (outcome.kind !== 'panes') return outcome;
+    const [one, ...more] = outcome.panes;
+    return one && more.length === 0 && outcome.held === 0 ? one : { kind: 'two-screens' };
+  }
+
+  async readPanes(
+    source: ScreenshotSource | FetchedScreenshot,
+    where: ScreenshotWhere,
+  ): Promise<PanesOutcome> {
     const { reader, store, context } = this.options;
     if (source.size > MAX_SCREENSHOT_BYTES) return { kind: 'too-large' };
     // Nothing is downloaded that the reader would turn away.
@@ -263,15 +328,120 @@ export class ScreenshotService implements Screenshots {
       ...(where.startBy === undefined ? {} : { startBy: where.startBy }),
     });
     if (outcome.kind !== 'read') return outcome;
+    if (!outcome.panes && outcome.twoScreens) {
+      // Two screens that could not be told apart (plan 7P): refused, never read as one. Kept
+      // for review as any refusal is, but read passively (a member's ordinary picture).
+      if (where.use !== 'passive') {
+        const read = screenshotReport(
+          outcome.reading,
+          reportContext(context, where, where.uploadedAt, source.name),
+        );
+        // What was typed beside it, kept as a single screen's is.
+        const typed = typeof where.typed === 'function' ? where.typed(read) : where.typed;
+        const maxTyped =
+          where.maxTyped && outcome.reading.text.max
+            ? where.maxTyped(
+                maxScreenshotReport(
+                  outcome.reading,
+                  maxReportContext(context, where, where.uploadedAt, source.name),
+                ),
+              ).typed
+            : undefined;
+        await store.keep(download.bytes, {
+          guildId: where.guildId,
+          use: where.use,
+          senderId: where.senderId,
+          uploadedAt: where.uploadedAt,
+          fileTakenAt: null,
+          timeFrom: read.timeFrom,
+          reading: keptReading(outcome.reading),
+          report: storedReport(read),
+          typed: typed ? storedTyped(typed) : null,
+          ...(maxTyped ? { maxTyped: storedMaxTyped(maxTyped) } : {}),
+          decision: { kind: 'refuse', reason: 'two-screens' },
+          bosses: this.bossSnapshot(),
+        });
+      }
+      return { kind: 'two-screens' };
+    }
+    // A pane with no screen (a map, a chat) is left out; one screenshot is one pane.
+    const all = outcome.panes;
+    const screens = all
+      ? all
+          .filter((pane) => pane.shows === 'raid' || pane.shows === 'max')
+          .map((pane) => ({
+            reading: pane.reading,
+            place: { index: pane.index, of: pane.of, box: pane.box, side: paneSide(pane, all) },
+          }))
+      : [{ reading: outcome.reading, place: undefined }];
+    const panes: ReadOutcome[] = [];
+    let held = 0;
+    let first: string | undefined;
+    // A pane the caller does not report is not kept, when one it reports is beside it.
+    const kindOf = (reading: ScreenReading) => (reading.text.max ? 'max' : 'raid');
+    const callerHas = screens.some((screen) => kindOf(screen.reading) === where.screen);
+    const several = screens.filter((screen) => kindOf(screen.reading) === where.screen).length > 1;
+    for (const [i, screen] of screens.entries()) {
+      if (i > 0 && where.anotherPane && !where.anotherPane()) {
+        held++;
+        continue;
+      }
+      const one = await this.readScreen(download.bytes, screen.reading, screen.place, where, {
+        fileName: source.name,
+        alongside: first,
+        keep: !callerHas || kindOf(screen.reading) === where.screen,
+        several,
+      });
+      first ??= one.id;
+      panes.push(one);
+    }
+    return { kind: 'panes', panes, held };
+  }
+
+  /** The raid bosses of the moment, as a record keeps them. */
+  private bossSnapshot(): { key: string; name: string; tier: RaidTier }[] {
+    return this.options.context.raidBosses
+      .bosses()
+      .map((boss) => ({ key: boss.key, name: boss.name, tier: boss.tier }));
+  }
+
+  /**
+   * One screen of a screenshot (a pane of a split one, plan 7P, at `place`): reported on,
+   * decided and kept (`file.keep`: not a pane of the kind the caller does not report beside one
+   * it does), and another pane's file is a link of the first's (`alongside`).
+   */
+  private async readScreen(
+    bytes: Uint8Array,
+    reading: ScreenReading,
+    place: PanePlace | undefined,
+    where: ScreenshotWhere,
+    file: { fileName: string; alongside: string | undefined; keep: boolean; several: boolean },
+  ): Promise<ReadOutcome> {
+    const { store, context } = this.options;
     const reportFrom = reportContext(
       context,
       { channelId: where.channelId, guildRow: where.guildRow },
       where.uploadedAt,
-      source.name,
+      file.fileName,
     );
-    const read = screenshotReport(outcome.reading, reportFrom);
-    if (outcome.reading.text.max) {
-      return this.readMax(download.bytes, outcome.reading, read, where, source.name);
+    const read = screenshotReport(reading, reportFrom);
+    const keep = (record: NewScreenshot, image?: boolean) =>
+      store.keep(
+        bytes,
+        {
+          ...record,
+          ...(place ? { pane: place } : {}),
+          // Two panes of the caller's one kind: the caller refuses both (Matt's Q1).
+          ...(file.several ? { decision: { kind: 'refuse' as const, reason: 'several' } } : {}),
+        },
+        image,
+        file.alongside,
+      );
+    if (reading.text.max) {
+      const max = await this.readMax(reading, read, where, file.fileName, (record) =>
+        file.keep ? keep(record) : Promise.resolve(undefined),
+      );
+      return place ? { ...max, pane: place } : max;
     }
     // The reader's own reading against the raid boss list (review B1), never what was typed.
     const sighting = raidTierObservation(read, reportFrom);
@@ -303,44 +473,50 @@ export class ScreenshotService implements Screenshots {
     // picture that is no raid screen keeps its record alone.
     const passiveRefusal = where.use === 'passive' && decision.kind === 'refuse';
     const image = !(decision.kind === 'refuse' && decision.reason === 'not-a-raid-screen');
-    const id = passiveRefusal
-      ? undefined
-      : await store.keep(
-          download.bytes,
-          {
-            guildId: where.guildId,
-            use: where.use,
-            senderId: where.senderId,
-            uploadedAt: where.uploadedAt,
-            fileTakenAt: reportFrom.fileTakenAt ?? null,
-            timeFrom: read.timeFrom,
-            reading: keptReading(outcome.reading, image),
-            // The reader's own report: it is judged by what it read, never by what was typed.
-            report: image ? storedReport(read) : withoutText(storedReport(read)),
-            typed: typed ? storedTyped(typed) : null,
-            decision: decision.kind === 'report' ? { kind: 'report' } : storedDecision(decision),
-            bosses: context.raidBosses
-              .bosses()
-              .map((boss) => ({ key: boss.key, name: boss.name, tier: boss.tier })),
-          },
-          image,
-        );
-    return { kind: 'read', screen: 'raid', id, report, decision, withGym };
+    const id =
+      passiveRefusal || !file.keep
+        ? undefined
+        : await keep(
+            {
+              guildId: where.guildId,
+              use: where.use,
+              senderId: where.senderId,
+              uploadedAt: where.uploadedAt,
+              fileTakenAt: reportFrom.fileTakenAt ?? null,
+              timeFrom: read.timeFrom,
+              reading: keptReading(reading, image),
+              // The reader's own report: it is judged by what it read, never by what was typed.
+              report: image ? storedReport(read) : withoutText(storedReport(read)),
+              typed: typed ? storedTyped(typed) : null,
+              decision: decision.kind === 'report' ? { kind: 'report' } : storedDecision(decision),
+              bosses: this.bossSnapshot(),
+            },
+            image,
+          );
+    return {
+      kind: 'read',
+      screen: 'raid',
+      id,
+      report,
+      decision,
+      withGym,
+      ...(place ? { pane: place } : {}),
+    };
   }
 
   /**
    * A max battle's screen (plan 8X-S): the max report (`maxScreenshotReport`) over the server's
-   * Power Spots and the max bosses, decided (`decideMax`) and kept beside the raid report of it
-   * (review R5), picture and text, as a raid's; a passive refusal keeps nothing.
+   * Power Spots and the max bosses, decided (`decideMax`) and kept (`keep`) beside the raid
+   * report of it (review R5), picture and text, as a raid's; a passive refusal keeps nothing.
    */
   private async readMax(
-    bytes: Uint8Array,
     reading: ScreenReading,
     raidRead: ScreenshotReport,
     where: ScreenshotWhere,
     fileName: string,
-  ): Promise<ScreenshotOutcome> {
-    const { store, context } = this.options;
+    keep: (record: NewScreenshot) => Promise<string | undefined>,
+  ): Promise<Extract<ScreenshotOutcome, { kind: 'read'; screen: 'max' }>> {
+    const { context } = this.options;
     const maxFrom = maxReportContext(
       context,
       { channelId: where.channelId, guildRow: where.guildRow },
@@ -383,7 +559,7 @@ export class ScreenshotService implements Screenshots {
     const id =
       where.use === 'passive' && (decision.kind === 'refuse' || read.countdown === null)
         ? undefined
-        : await store.keep(bytes, {
+        : await keep({
             guildId: where.guildId,
             use: where.use,
             senderId: where.senderId,
@@ -397,9 +573,7 @@ export class ScreenshotService implements Screenshots {
             typed: null,
             ...(typed ? { maxTyped: storedMaxTyped(typed) } : {}),
             decision: stored,
-            bosses: context.raidBosses
-              .bosses()
-              .map((boss) => ({ key: boss.key, name: boss.name, tier: boss.tier })),
+            bosses: this.bossSnapshot(),
             maxBosses: maxFrom.bosses.map((boss) => ({
               key: boss.key,
               name: boss.name,
@@ -533,5 +707,7 @@ export function unreadWords(
       return `I cannot read screenshots at the moment. ${instead[0]?.toUpperCase() ?? ''}${instead.slice(1)}.`;
     case 'failed':
       return `Reading that screenshot went wrong. Try again, or ${instead}.`;
+    case 'two-screens':
+      return TWO_SCREENS;
   }
 }
diff --git a/src/services/screenshot-store.test.ts b/src/services/screenshot-store.test.ts
index aaa348a9..a0635e91 100644
--- a/src/services/screenshot-store.test.ts
+++ b/src/services/screenshot-store.test.ts
@@ -449,6 +449,31 @@ describe('ScreenshotStore', () => {
     expect(files('held')).toContain(`${asked}.png`);
   });
 
+  it('keeps another pane of a picture as a link of its file, costing its bytes once (plan 7P)', async () => {
+    const { store, dir } = storeWith(new Set(), { keepMegabytes: 4 });
+    const shot = new Uint8Array(1.5 * MB);
+    shot.set(PNG);
+    const top = await kept(store, screenshot());
+    const bottom = await store.keep(shot, screenshot(), true, top);
+    if (!bottom) throw new Error('not kept');
+    const [a, b] = [top, bottom].map((id) => statSync(path.join(dir, 'held', `${id}.png`)));
+    expect(a?.ino === b?.ino && a?.dev === b?.dev).toBe(true);
+    expect(b?.nlink).toBe(2);
+    // 1.5 MB counted once: two more fit in 4 MB.
+    expect(await store.keep(shot, screenshot())).toBeDefined();
+    expect(await store.keep(shot, screenshot())).toBeDefined();
+  });
+
+  it('copies another pane’s file where it cannot link it', async () => {
+    const noLinks = () => Promise.reject(new Error('no links here'));
+    const { store, dir } = storeWith(new Set(), { link: noLinks });
+    const top = await kept(store, screenshot());
+    const bottom = await store.keep(PNG, screenshot(), true, top);
+    const [a, b] = [top, bottom].map((id) => statSync(path.join(dir, 'held', `${id ?? ''}.png`)));
+    expect(a?.ino === b?.ino).toBe(false);
+    expect(b?.size).toBe(PNG.byteLength);
+  });
+
   it('answers rather than throws when it cannot write, and says so in the log', async () => {
     const { store, dir, entries } = storeWith();
     // A file where the folder should be: nothing can be written under it.
diff --git a/src/services/screenshot-store.ts b/src/services/screenshot-store.ts
index 66bf0fff..fce4cc7c 100644
--- a/src/services/screenshot-store.ts
+++ b/src/services/screenshot-store.ts
@@ -12,7 +12,8 @@ import {
 } from 'node:fs/promises';
 import path from 'node:path';
 import { BoundedMap } from '../bounded-map.js';
-import { imageFormat } from '../domain/ocr/image.js';
+import { imageFormat, type Box } from '../domain/ocr/image.js';
+import type { PaneSide } from '../domain/ocr/panes.js';
 import {
   memberLabel,
   type Feedback,
@@ -97,6 +98,12 @@ export interface ScreenshotRecord {
   feedback: FeedbackRecord[];
   /** The answer key `ocr:check` scores it by, once a member said the reading was right. */
   label?: MemberLabel;
+  /**
+   * The pane of a split screenshot this record is of (plan 7P): 1 the top or left one, of how
+   * many, where in the picture (its pixels). Its file is the whole picture, a hard link of the
+   * first pane's; `reading` is the pane's own. Absent on a screenshot of one screen.
+   */
+  pane?: { index: number; of: number; box: Box; side: PaneSide };
 }
 
 /** What a caller gives to keep a screenshot; the store adds the id, the file and the times. */
@@ -113,8 +120,17 @@ export interface KeptScreenshot {
 
 /** What the rest of the bot asks of the store (`ScreenshotStore`; tests use it over a folder). */
 export interface ScreenshotKeeping {
-  /** `image: false` keeps the record alone. */
-  keep(bytes: Uint8Array, screenshot: NewScreenshot, image?: boolean): Promise<string | undefined>;
+  /**
+   * `image: false` keeps the record alone. `alongside`: the id of a screenshot kept of the same
+   * picture (another pane of it, plan 7P), whose file this one's is a hard link of (a copy where
+   * the file system refuses links).
+   */
+  keep(
+    bytes: Uint8Array,
+    screenshot: NewScreenshot,
+    image?: boolean,
+    alongside?: string,
+  ): Promise<string | undefined>;
   get(id: string): Promise<KeptScreenshot | 'gone' | undefined>;
   /** The screenshot is shown by an active raid's post: kept while that lasts. */
   inUse(id: string): Promise<void>;
@@ -217,6 +233,7 @@ export class ScreenshotStore implements ScreenshotKeeping {
     bytes: Uint8Array,
     screenshot: NewScreenshot,
     image = true,
+    alongside?: string,
   ): Promise<string | undefined> {
     const format = imageFormat(bytes);
     if (!format) return undefined;
@@ -233,12 +250,29 @@ export class ScreenshotStore implements ScreenshotKeeping {
       feedback: [],
     };
     try {
+      // Another pane of the same picture: its file, linked, costs no bytes again.
+      const sibling =
+        record.file && alongside && ID.test(alongside)
+          ? path.join(this.held, `${alongside}.${format}`)
+          : undefined;
+      let linked = false;
+      if (sibling && record.file) {
+        await mkdir(this.held, { recursive: true });
+        linked = await (this.options.link ?? link)(sibling, path.join(this.held, record.file)).then(
+          () => true,
+          () => false,
+        );
+      }
       // The record takes its bytes too: a record kept alone is not free either.
       const recordBytes = Buffer.byteLength(`${JSON.stringify(record, null, 2)}
 `);
-      if (!(await this.room((image ? bytes.byteLength : 0) + recordBytes))) return undefined;
+      const fileBytes = image && !linked ? bytes.byteLength : 0;
+      if (!(await this.room(fileBytes + recordBytes))) {
+        if (linked && record.file) await rm(path.join(this.held, record.file), { force: true });
+        return undefined;
+      }
       await mkdir(this.held, { recursive: true });
-      if (record.file) {
+      if (record.file && !linked) {
         await writeFile(path.join(this.held, record.file), bytes);
         this.grow(bytes.byteLength);
       }
diff --git a/test/support/screenshot-service.ts b/test/support/screenshot-service.ts
index 736718e8..86e2efbf 100644
--- a/test/support/screenshot-service.ts
+++ b/test/support/screenshot-service.ts
@@ -5,9 +5,13 @@ import type { ScreenReading } from '../../src/ocr/screen-reader.js';
 import type { OcrOutcome } from '../../src/services/ocr-service.js';
 import {
   ScreenshotService,
+  type FetchedScreenshot,
   type ScreenshotContext,
   type ScreenshotServiceOptions,
+  type ScreenshotOutcome,
+  type Screenshots,
   type ScreenshotSource,
+  type ScreenshotWhere,
 } from '../../src/services/screenshot-service.js';
 import { ScreenshotStore } from '../../src/services/screenshot-store.js';
 import { FakeAttachments } from './attachments.js';
@@ -15,6 +19,21 @@ import { FakeScreenshotReader } from './screenshots.js';
 import { createTestContext } from './test-context.js';
 import { createTestLogger } from './test-logger.js';
 
+/**
+ * A screenshot of one screen read (`readPanes`), as a test of one screen wants it: its one
+ * pane's outcome, or why nothing was read (`two-screens` when it showed more than one).
+ */
+export async function readOne(
+  screenshots: Pick<Screenshots, 'readPanes'>,
+  source: ScreenshotSource | FetchedScreenshot,
+  where: ScreenshotWhere,
+): Promise<ScreenshotOutcome> {
+  const outcome = await screenshots.readPanes(source, where);
+  if (outcome.kind !== 'panes') return outcome;
+  const [one, ...more] = outcome.panes;
+  return one && more.length === 0 && outcome.held === 0 ? one : { kind: 'two-screens' };
+}
+
 /**
  * Screenshots for a test: the service over fake attachments, the fake reader and a store in a
  * folder of its own under the system's temporary folder. `screenshot(name, answer)` gives an
diff --git a/test/support/screenshots.ts b/test/support/screenshots.ts
index 7c2ab9f5..861c73b3 100644
--- a/test/support/screenshots.ts
+++ b/test/support/screenshots.ts
@@ -99,6 +99,30 @@ export function maxReading(
   );
 }
 
+/**
+ * What the reading process answers for a split screenshot (plan 7P): the whole picture read as
+ * `whole` (a mix of both, or nothing), and its panes, top first, each read as a screenshot of
+ * its own; a pane given as `'none'` shows no screen (a map).
+ */
+export function splitOutcome(
+  panes: readonly (ScreenReading | 'none')[],
+  whole: ScreenReading = readingOf({}),
+): OcrOutcome {
+  return {
+    kind: 'read',
+    reading: whole,
+    twoScreens: true,
+    cut: 'divider',
+    panes: panes.map((pane, i) => ({
+      index: i + 1,
+      of: panes.length,
+      box: { x0: 0, y0: i * 1224, x1: 1080, y1: (i + 1) * 1224 },
+      shows: pane === 'none' ? 'none' : pane.text.max ? 'max' : 'raid',
+      reading: pane === 'none' ? readingOf({}) : pane,
+    })),
+  };
+}
+
 /** The first bytes of a PNG file: what a fake screenshot starts with, so that it is kept. */
 const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
 
````

### Task 4: 7P task 4: a mention and passive reading report each pane of a split

Prototype commit: `c5ede9095bb01b18f57b20672b3a48349694ccc5`

The trigger reads a message's screenshots through readPanes: each pane is a report of its
own (its gym or Power Spot question, its line in the one reply, "n of m" counting
panes), the message's count of expected reports grows by the extra panes before any
question is asked, so it is not deleted or marked while one waits. The first pane uses
the image's use; another takes a use of its own after the read, and with none left it
is not read and the reply says so. Two screens that could not be told apart are said in
the reply and give the use back (the reader's failure); read passively, nothing is said.

**Files:**

```
 src/commands/screenshots/mention.board.test.ts |  73 ++++++++++++++++-
 src/commands/screenshots/mention.test.ts       |  90 ++++++++++++++++++++-
 src/commands/screenshots/mention.ts            | 194 +++++++++++++++++++++++++++++++++++++--------
 3 files changed, 323 insertions(+), 34 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/screenshots/mention.board.test.ts src/commands/screenshots/mention.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c5ede9095bb01b18f57b20672b3a48349694ccc5 -- src test scripts data docs/architecture docs/guides docs/superpowers/ocr-improvements.md docs/superpowers/plans/2026-10-27-phase-7p-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `7P task 4: a mention and passive reading report each pane of a split`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/screenshots/mention.board.test.ts b/src/commands/screenshots/mention.board.test.ts
index 2aec2b4d..609e07c0 100644
--- a/src/commands/screenshots/mention.board.test.ts
+++ b/src/commands/screenshots/mention.board.test.ts
@@ -1,12 +1,18 @@
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
-import { EAST_CHANNEL, testGym, WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { EAST_CHANNEL, testGym, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
 import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-reporting.js';
 import { PARTY_NOW, TEST_SPOT } from '../../../test/support/parties.js';
 import { partyServiceWith } from '../../../test/support/party-service.js';
 import { AUTHOR, OTHER, posted } from '../../../test/support/posted-message.js';
 import { gymsFixture } from '../../../test/support/providers.js';
 import { screenshotsWith } from '../../../test/support/screenshot-service.js';
-import { eggReading, maxReading, readingOf } from '../../../test/support/screenshots.js';
+import {
+  eggReading,
+  maxReading,
+  readingOf,
+  splitOutcome,
+} from '../../../test/support/screenshots.js';
+import { TWO_SCREENS } from '../../render/screenshot-reading.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { keptRow } from '../../../test/support/wayspot-cases.js';
 import type { RecordingDms } from '../../../test/support/dms.js';
@@ -365,4 +371,67 @@ describe('a max battle’s screenshot posted in the region’s board (plan 8R-9F
     expect(made.store.active()).toHaveLength(1);
     expect(dms.to(AUTHOR)[1]?.content).toMatch(/Reported|max battle/);
   });
+
+  describe('a split screenshot in the board (plan 7P)', () => {
+    const fountain = () => eggReading('Maple Leaf Mosaic', 3, CLOCK, 15 * 60);
+    const inBoard = { channelId: BOARD, inThread: true };
+
+    it('reports each pane as a screenshot of its own, a DM line each named by its place', async () => {
+      const made = await setup();
+      const split = made.screenshot('split.png', splitOutcome([egg(), fountain()]));
+      await made.trigger.handle(posted([split], inBoard).message);
+      expect(made.reader.reads).toBe(1);
+      expect(
+        made.store
+          .active()
+          .map((party) => party.gymId)
+          .sort(),
+      ).toEqual([2, 6]);
+      const [dm] = made.said();
+      expect(dm?.split('\n').slice(1)).toEqual([
+        expect.stringMatching(/^- Top: Reported the raid at Old Stone Fountain: <#\d+>\.$/),
+        expect.stringMatching(/^- Bottom: Reported the raid at Maple Leaf Mosaic: <#\d+>\.$/),
+      ]);
+    });
+
+    it('refuses two screens it could not tell apart, reporting nothing, and gives the use back', async () => {
+      const made = await setup();
+      const mixed = made.screenshot('mixed.png', {
+        kind: 'read',
+        reading: egg(),
+        twoScreens: true,
+      });
+      for (let n = 0; n < 21; n++) {
+        await made.trigger.handle(posted([mixed], inBoard).message);
+        expect(made.said().at(-1)?.split('\n')[1]).toBe(`- ${TWO_SCREENS}`);
+      }
+      expect(made.reader.reads).toBe(21);
+      expect(made.store.active()).toEqual([]);
+    });
+
+    it('reads a second pane only with a use of its own, and says when none is left', async () => {
+      const made = await setup();
+      const cat = made.screenshot('cat.png', readingOf({ gym: 'Old Stone Fountain' }));
+      for (let i = 0; i < 19; i++) await made.trigger.handle(posted([cat], inBoard).message);
+      const split = made.screenshot('split.png', splitOutcome([egg(), fountain()]));
+      await made.trigger.handle(posted([split], inBoard).message);
+      expect(made.store.active().map((party) => party.gymId)).toEqual([2]);
+      expect(made.said().at(-1)?.split('\n').slice(1)).toEqual([
+        expect.stringMatching(/^- Top: Reported the raid at Old Stone Fountain/),
+        '- Bottom: You have sent many screenshots just now, so I did not read this screen. Try again in 15 minutes.',
+      ]);
+    });
+
+    it('gives the second pane’s use back when its raid is refused for none of the member’s doing', async () => {
+      const made = await setup();
+      made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+      const split = made.screenshot('split.png', splitOutcome([egg(), fountain()]));
+      // Two uses a picture: eleven would pass the twenty if the uses were not given back.
+      for (let n = 0; n < 11; n++) {
+        await made.trigger.handle(posted([split], inBoard).message);
+        expect(made.said().at(-1)).not.toMatch(/many screenshots/);
+      }
+      expect(made.reader.reads).toBe(11);
+    });
+  });
 });
diff --git a/src/commands/screenshots/mention.test.ts b/src/commands/screenshots/mention.test.ts
index 2146f61e..cf610111 100644
--- a/src/commands/screenshots/mention.test.ts
+++ b/src/commands/screenshots/mention.test.ts
@@ -13,7 +13,8 @@ import { PARTY_NOW } from '../../../test/support/parties.js';
 import { partyServiceWith } from '../../../test/support/party-service.js';
 import { gymsFixture } from '../../../test/support/providers.js';
 import { screenshotsWith } from '../../../test/support/screenshot-service.js';
-import { eggReading, readingOf } from '../../../test/support/screenshots.js';
+import { eggReading, readingOf, splitOutcome } from '../../../test/support/screenshots.js';
+import { TWO_SCREENS } from '../../render/screenshot-reading.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import type { Gym } from '../../db/repositories/gym-repository.js';
 import { InteractionRouter } from '../../discord/router.js';
@@ -844,6 +845,93 @@ describe('screenshots posted with a mention of the bot', () => {
     await trigger.close();
   });
 
+  describe('a split screenshot (plan 7P)', () => {
+    const fountain = () => eggReading('Maple Leaf Mosaic', 3, CLOCK, 15 * 60);
+
+    it('reports each pane’s raid, one image read once, and lets the message go', async () => {
+      const { trigger, image, store, reader } = await setup();
+      const { message, did } = posted([image('split.png', splitOutcome([egg(), fountain()]))]);
+      await trigger.handle(message);
+      expect(reader.reads).toBe(1);
+      expect(
+        store
+          .active()
+          .map((party) => party.gymId)
+          .sort(),
+      ).toEqual([2, 6]);
+      expect(did).toContain('deleted');
+    });
+
+    it('keeps the message while one pane’s question waits, and counts panes in its reply', async () => {
+      const twin = testGym(13, 'Starbucks', 40.021, -80.081);
+      const { trigger, image, store, router } = await setup({ gyms: [twin] });
+      const unclear = eggReading('Starbucks', 1, CLOCK, 10 * 60);
+      const cat = readingOf({ gym: 'Old Stone Fountain' });
+      const { message, did, replies } = posted([
+        image('split.png', splitOutcome([egg(), unclear])),
+        image('cat.png', cat),
+      ]);
+      await trigger.handle(message);
+      expect(store.active()).toHaveLength(1);
+      const [question, reply] = replies;
+      expect(question?.content).toMatch(/Which gym is it\?/);
+      expect(reply?.content).toBe(
+        '1 of 3: This does not look like the screen of a raid, so I made nothing of it.',
+      );
+      const picked = fakeSelect({
+        customId: menuOf(question).custom_id,
+        values: ['5'],
+        userId: AUTHOR,
+      });
+      await router.handle(picked as never);
+      expect(store.active()).toHaveLength(2);
+      // The cat made nothing: the message stays, marked as every report it could make was made.
+      expect(did).not.toContain('deleted');
+    });
+
+    it('refuses two screens it could not tell apart, and gives the use back', async () => {
+      const { trigger, image, reader } = await setup();
+      const mixed = image('mixed.png', { kind: 'read', reading: egg(), twoScreens: true });
+      for (let n = 0; n < 21; n++) {
+        const { message, replies } = posted([mixed]);
+        await trigger.handle(message);
+        expect(replies.at(-1)?.content).toBe(TWO_SCREENS);
+      }
+      expect(reader.reads).toBe(21);
+      await trigger.close();
+    });
+
+    it('reads a second pane only with a use of its own, and says when none is left', async () => {
+      const { trigger, image, store } = await setup();
+      const cat = image('cat.png', readingOf({ gym: 'Old Stone Fountain' }));
+      for (let i = 0; i < 19; i++) await trigger.handle(posted([cat]).message);
+      const late = posted([image('split.png', splitOutcome([egg(), fountain()]))]);
+      await trigger.handle(late.message);
+      expect(store.active().map((party) => party.gymId)).toEqual([2]);
+      expect(late.replies.at(-1)?.content).toBe(
+        'You have sent many screenshots just now, so I did not read the other screen of one of them. Try again in 15 minutes.',
+      );
+      // A screen was left unread: the message stays, unmarked, under the reply that says so.
+      expect(late.did).not.toContain('deleted');
+      expect(late.did).not.toContain(`react ${DONE}`);
+      await trigger.close();
+    });
+
+    it('gives back the second pane’s use when its raid is refused for none of the member’s doing', async () => {
+      const { trigger, image, gateway, reader } = await setup();
+      gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+      const split = image('split.png', splitOutcome([egg(), fountain()]));
+      // Two uses an image: eleven would pass the twenty if the uses were not given back.
+      for (let n = 0; n < 11; n++) {
+        const { message, replies } = posted([split]);
+        await trigger.handle(message);
+        expect(replies.at(-1)?.content).not.toMatch(/many screenshots/);
+      }
+      expect(reader.reads).toBe(11);
+      await trigger.close();
+    });
+  });
+
   it('holds a member to twenty screenshots a quarter of an hour, an image a use', async () => {
     const { trigger, image, reader } = await setup();
     const source = image('cat.png', readingOf({ gym: 'Old Stone Fountain' }));
diff --git a/src/commands/screenshots/mention.ts b/src/commands/screenshots/mention.ts
index d49b66e6..da9250db 100644
--- a/src/commands/screenshots/mention.ts
+++ b/src/commands/screenshots/mention.ts
@@ -24,6 +24,7 @@ import type { SpotTitle } from '../../domain/ocr/power-spot-match.js';
 import type { ScreenshotRaid } from '../../domain/ocr/screenshot-decision.js';
 import { storedReport } from '../../domain/ocr/screenshot-record.js';
 import type { ReportDoubt } from '../../domain/ocr/screenshot-report.js';
+import type { PaneSide } from '../../domain/ocr/panes.js';
 import { maxSpotName } from '../../domain/party/max.js';
 import { raidBossRef } from '../../domain/party/raid.js';
 import { RaidPrivacy } from '../../domain/party/status.js';
@@ -31,6 +32,7 @@ import {
   MAX_SPOT_UNTOLD,
   MAX_TIER_UNKNOWN,
   maxRefusalWords,
+  placeName,
   refusalWords,
   shortMaxReading,
   shortReading,
@@ -43,6 +45,7 @@ import {
   screenshotsOf,
   unreadWords,
   type FetchedScreenshot,
+  type ReadOutcome,
   type ScreenshotOutcome,
   type ScreenshotSource,
 } from '../../services/screenshot-service.js';
@@ -160,9 +163,22 @@ type ImageResult =
   | { kind: 'told'; words: string }
   /** Read passively and left alone (review S-1): nothing is said of it. */
   | { kind: 'ignored' }
-  | { kind: 'stopped'; outcome: Exclude<ScreenshotOutcome, { kind: 'read' }> };
+  | { kind: 'stopped'; outcome: Exclude<ScreenshotOutcome, { kind: 'read' }> }
+  /** Another pane of a split screenshot, not read for want of a use (plan 7P). */
+  | { kind: 'held' };
+
+/** One screen's result, a pane's named by its place ("Top", plan 7P) for the board's DM. */
+type PaneResult = ImageResult & { place?: string };
 
 const refused = (words: string): ImageResult => ({ kind: 'refused', words });
+
+/** The side of a split's other pane. */
+const OTHER_SIDE: Readonly<Record<PaneSide, PaneSide>> = {
+  top: 'bottom',
+  bottom: 'top',
+  left: 'right',
+  right: 'left',
+};
 const told = (words: string): ImageResult => ({ kind: 'told', words });
 
 /** A screenshot read as a max battle's screen. */
@@ -351,6 +367,28 @@ function elsewhereInBoard(place: string, regionChannelId: string, command: strin
   );
 }
 
+/**
+ * What the board's DM says of one screen's result (one the board flow left unsaid, an `asked`,
+ * is one it was unsure of: undefined); `heldUntil` when a pane was not read for want of a use.
+ */
+function boardWords(result: PaneResult, heldUntil: number): string | undefined {
+  switch (result.kind) {
+    case 'stopped':
+      return unreadWords(result.outcome);
+    case 'made':
+      return result.exists ?? 'Reported it.';
+    case 'refused':
+    case 'told':
+      return result.words;
+    case 'ignored':
+      return MAX_NO_COUNTDOWN_IN_BOARD;
+    case 'held':
+      return `You have sent many screenshots just now, so I did not read this screen. Try again in ${waitText(heldUntil)}.`;
+    case 'asked':
+      return undefined;
+  }
+}
+
 /** How long the board's DM waits in line before it is not worth sending. */
 const BOARD_DM_EXPIRES_MS = 60 * 60_000;
 
@@ -434,6 +472,8 @@ export class ScreenshotTrigger {
     // Said also when read passively: what a max battle's screenshot could not place.
     const toldAloud: string[] = [];
     let held = 0;
+    /** Second panes of split screenshots not read for want of a use (plan 7P). */
+    let heldPanes = 0;
     let wait = 0;
     let stopped: Exclude<ScreenshotOutcome, { kind: 'read' }> | undefined;
     let reacted = false;
@@ -468,15 +508,35 @@ export class ScreenshotTrigger {
             this.now(),
             countedAt,
           );
-        const result = await this.readOne(batch, image, guildRow, passive, giveBack);
-        if (result.kind === 'made') {
-          batch.made++;
-          if (result.exists) existing.push(result.exists);
-        } else if (result.kind === 'told' && passive) {
-          if (!toldAloud.includes(result.words)) toldAloud.push(result.words);
-        } else if (result.kind === 'refused' || result.kind === 'told') {
-          refusals.set(result.words, (refusals.get(result.words) ?? 0) + 1);
-        } else if (result.kind === 'stopped') stopped = result.outcome;
+        // Another pane of a split screenshot (plan 7P) takes a use of its own, after the read.
+        const anotherUse = (): (() => void) | undefined => {
+          const at = this.now();
+          const until = this.throttles.use('screenshot', message.authorId, MENTION_THROTTLE, at);
+          if (until !== undefined) {
+            heldPanes++;
+            wait = until;
+            return undefined;
+          }
+          return () =>
+            this.throttles.giveBack(
+              'screenshot',
+              message.authorId,
+              MENTION_THROTTLE,
+              this.now(),
+              at,
+            );
+        };
+        const results = await this.readOne(batch, image, guildRow, passive, giveBack, anotherUse);
+        for (const result of results) {
+          if (result.kind === 'made') {
+            batch.made++;
+            if (result.exists) existing.push(result.exists);
+          } else if (result.kind === 'told' && passive) {
+            if (!toldAloud.includes(result.words)) toldAloud.push(result.words);
+          } else if (result.kind === 'refused' || result.kind === 'told') {
+            refusals.set(result.words, (refusals.get(result.words) ?? 0) + 1);
+          } else if (result.kind === 'stopped') stopped = result.outcome;
+        }
       }
     } finally {
       // After the close nothing more is done to the message.
@@ -486,8 +546,9 @@ export class ScreenshotTrigger {
       const lines: string[] = [];
       if (stopped) lines.push(unreadWords(stopped));
       lines.push(...existing);
+      // "n of m" counts the screens: a split screenshot's panes each (plan 7P).
       for (const [words, count] of refusals) {
-        lines.push(images.length === 1 ? words : `${count} of ${images.length}: ${words}`);
+        lines.push(batch.images === 1 ? words : `${count} of ${batch.images}: ${words}`);
       }
       if (held > 0) {
         const which =
@@ -496,6 +557,12 @@ export class ScreenshotTrigger {
           `You have sent many screenshots just now, so I did not read ${which}. Try again in ${waitText(wait)}.`,
         );
       }
+      if (heldPanes > 0) {
+        const which = heldPanes === 1 ? 'one of them' : `${heldPanes} of them`;
+        lines.push(
+          `You have sent many screenshots just now, so I did not read the other screen of ${which}. Try again in ${waitText(wait)}.`,
+        );
+      }
       if (lines.length > 0) await this.say(message, { content: truncate(lines.join('\n'), 2_000) });
     } else if (existing.length > 0 || toldAloud.length > 0) {
       // Read passively, only a raid or max battle that exists is said (Matt, 2026-10-15), and a
@@ -529,7 +596,9 @@ export class ScreenshotTrigger {
     if (images.length === 0 || posted.guildId === null) return false;
     const guildRow = await ctx.guilds.idFor(posted.guildId);
     if (guildRow === undefined) return false;
-    const said: string[] = [];
+    const said: (string | undefined)[] = [];
+    /** What each pane of a picture made (plan 7P), its place and words. */
+    const paneSaid: { place?: string; words: string | undefined }[][] = [];
     const counted: { index: number; image: ScreenshotSource; countedAt: number }[] = [];
     for (const [index, image] of images.entries()) {
       const countedAt = this.now();
@@ -595,25 +664,41 @@ export class ScreenshotTrigger {
           this.now(),
           countedAt,
         );
-      const result = await this.readOne(batch, image, guildRow, passive, giveBack);
-      if (result.kind === 'stopped') {
-        stopped = result.outcome;
-        said[index] = unreadWords(stopped);
-      } else if (result.kind === 'made') {
-        said[index] = result.exists ?? 'Reported it.';
-      } else if (result.kind === 'refused' || result.kind === 'told') {
-        said[index] = result.words;
-      } else if (result.kind === 'ignored') {
-        said[index] = MAX_NO_COUNTDOWN_IN_BOARD;
-      }
+      // Another pane of a split screenshot (plan 7P) takes a use of its own, as a mention's.
+      let heldUntil = 0;
+      const anotherUse = (): (() => void) | undefined => {
+        const at = this.now();
+        const until = this.throttles.use('screenshot', posted.authorId, MENTION_THROTTLE, at);
+        if (until !== undefined) {
+          heldUntil = until;
+          return undefined;
+        }
+        return () =>
+          this.throttles.giveBack('screenshot', posted.authorId, MENTION_THROTTLE, this.now(), at);
+      };
+      const results = await this.readOne(batch, image, guildRow, passive, giveBack, anotherUse);
+      // Each pane is a report of its own, with a line of its own named by its place.
+      paneSaid[index] = results.map((result) => ({
+        ...(result.place ? { place: result.place } : {}),
+        words: boardWords(result, heldUntil),
+      }));
+      const stop = results.find((result) => result.kind === 'stopped');
+      if (stop?.kind === 'stopped') stopped = stop.outcome;
     }
     // Closed after the delete (review F7): the shutdown leaves the member without the DM, as it
     // leaves every answer on its way; accepted (the board shows what was made).
     if (this.closed) return true;
-    // Every picture has its line (one the board flow left unsaid is one it was unsure of).
-    const lines = images.map((_, index) => {
-      const words = said[index] ?? RAID_UNSURE_IN_BOARD;
-      return images.length === 1 ? `- ${words}` : `- ${String(index + 1)}: ${words}`;
+    // Every picture has its line, every pane of a split one its own (plan 7P); one the board flow
+    // left unsaid is one it was unsure of.
+    const lines = images.flatMap((_, index) => {
+      const panes = paneSaid[index] ?? [{ words: said[index] }];
+      return panes.map(({ place, words = RAID_UNSURE_IN_BOARD }) => {
+        const named =
+          images.length === 1
+            ? (place ?? '')
+            : `${String(index + 1)}${place ? ` (${place.toLowerCase()})` : ''}`;
+        return named === '' ? `- ${words}` : `- ${named}: ${words}`;
+      });
     });
     // The opening says what became of the message (review F1): taken out, left (a moderator's,
     // Q1), or nothing where the delete failed.
@@ -645,21 +730,68 @@ export class ScreenshotTrigger {
     guildRow: number,
     passive: boolean,
     giveBack: () => void,
-  ): Promise<ImageResult> {
+    anotherUse: () => (() => void) | undefined,
+  ): Promise<PaneResult[]> {
     const { ctx } = this.options;
     const { message } = batch;
-    const outcome = await ctx.screenshots.read(image, {
+    // The uses of the panes read, each given back as its own (the first is the image's).
+    const giveBacks = [giveBack];
+    const outcome = await ctx.screenshots.readPanes(image, {
       guildId: message.guildId ?? '',
       guildRow,
       channelId: message.channelId,
       uploadedAt: message.createdAt,
       use: passive ? 'passive' : 'mention',
       senderId: message.authorId,
+      anotherPane: () => {
+        const back = anotherUse();
+        if (back) giveBacks.push(back);
+        return back !== undefined;
+      },
     });
     if (outcome.kind === 'busy' || outcome.kind === 'unavailable' || outcome.kind === 'failed') {
-      return { kind: 'stopped', outcome };
+      return [{ kind: 'stopped', outcome }];
+    }
+    if (outcome.kind === 'two-screens') {
+      // The reader's failure, not the member's (plan 7P): the use is given back.
+      giveBack();
+      return [refused(unreadWords(outcome))];
     }
-    if (outcome.kind !== 'read') return refused(unreadWords(outcome));
+    if (outcome.kind !== 'panes') return [refused(unreadWords(outcome))];
+    // Every pane is a report of its own: the message waits for each before it goes. A pane not
+    // read for want of a use is counted too, so the message stays under the reply that says so.
+    batch.images += outcome.panes.length - 1 + outcome.held;
+    const results: PaneResult[] = [];
+    for (const [i, pane] of outcome.panes.entries()) {
+      const result = await this.readPane(batch, pane, guildRow, passive, giveBacks[i] ?? giveBack);
+      results.push(pane.pane ? { ...result, place: placeName(pane.pane.side) } : result);
+    }
+    // A pane not read: the other of a split's two, by the side of the one read.
+    const [read] = outcome.panes;
+    for (let n = 0; n < outcome.held; n++) {
+      results.push(
+        read?.pane
+          ? { kind: 'held', place: placeName(OTHER_SIDE[read.pane.side]) }
+          : { kind: 'held' },
+      );
+    }
+    return results;
+  }
+
+  /**
+   * One screen read (a screenshot's, or a pane's of a split one): `made` when it made or joined
+   * a raid or a max battle, `asked` when its author was asked which gym or Power Spot, or the
+   * words of why it made nothing.
+   */
+  private async readPane(
+    batch: Batch,
+    outcome: ReadOutcome,
+    guildRow: number,
+    passive: boolean,
+    giveBack: () => void,
+  ): Promise<ImageResult> {
+    const { ctx } = this.options;
+    const { message } = batch;
     if (outcome.screen === 'max') return this.readMax(batch, outcome, guildRow, passive, giveBack);
     const { report, decision, id } = outcome;
     if (decision.kind === 'refuse') return refused(refusalWords(decision.reason));
````

### Task 5: 7P task 5: the commands' screenshots and the feedback by pane

Prototype commit: `8bec9cb448795f43637366ca0aa492607871d7d6`

/raid screenshot: and /max screenshot: take the pane of their kind, with what was typed;
a pane of the other kind beside it is named in a private follow-up ("The max battle
beside it was not reported: post the screenshot with a mention to report both."), and
two of their kind are refused with the pointer of Matt's Q1 (to the mention, or to
posting it where screenshots are read passively). /read-screenshot shows each pane in a
container of its own headed by its place, the whole picture as the thumbnail, the rooms
shared; "Screenshot feedback" shows a pane's own reading under its place. Nothing calls
ScreenshotService.read any more: it is gone, and the tests of one screen read through
readOne.

**Files:**

```
 src/commands/max/max-screenshot.test.ts          |  29 ++++++-
 src/commands/max/max-screenshot.ts               |  18 +++-
 src/commands/raids/raid-screenshot.test.ts       |  61 +++++++++++++-
 src/commands/raids/raid.ts                       |  19 ++++-
 src/commands/screenshots/feedback.ts             |  23 +++--
 src/commands/screenshots/read-screenshot.test.ts |  51 +++++++++++-
 src/commands/screenshots/read-screenshot.ts      | 194 ++++++++++++++++++++++++++++++-------------
 src/services/screenshot-service.ts               |  19 -----
 8 files changed, 329 insertions(+), 85 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/max/max-screenshot.test.ts src/commands/raids/raid-screenshot.test.ts src/commands/screenshots/read-screenshot.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 8bec9cb448795f43637366ca0aa492607871d7d6 -- src test scripts data docs/architecture docs/guides docs/superpowers/ocr-improvements.md docs/superpowers/plans/2026-10-27-phase-7p-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `7P task 5: the commands' screenshots and the feedback by pane`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/max/max-screenshot.test.ts b/src/commands/max/max-screenshot.test.ts
index 96562baf..b35362a9 100644
--- a/src/commands/max/max-screenshot.test.ts
+++ b/src/commands/max/max-screenshot.test.ts
@@ -13,7 +13,12 @@ import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-report
 import { MOD_CHANNEL, type SafetyOptions } from '../../../test/support/meetup-safety-service.js';
 import { asMax, at, BOB, TEST_SPOT } from '../../../test/support/parties.js';
 import { screenshotsWith } from '../../../test/support/screenshot-service.js';
-import { eggReading, maxReading, readingOf } from '../../../test/support/screenshots.js';
+import {
+  eggReading,
+  maxReading,
+  readingOf,
+  splitOutcome,
+} from '../../../test/support/screenshots.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { keptRow } from '../../../test/support/wayspot-cases.js';
 import { enabledCommands } from '../../discord/command.js';
@@ -312,6 +317,28 @@ describe('/max screenshot:', () => {
     );
   });
 
+  it('reports the max battle of a split screenshot, and names the raid beside it (plan 7P)', async () => {
+    const made = await setup();
+    const egg = eggReading('Old Stone Fountain', 5, { hour: 13, minute: 59 }, 20 * 60);
+    const used = await made.run({}, splitOutcome([egg, maxReading()]));
+    expect(asMax(made.store.active()[0])).toMatchObject({ max: { boss: { key: 'machop' } } });
+    expect(sent(used.followUp).content).toBe(
+      'The raid beside it was not reported: post the screenshot in the channel with a mention of me to report both.',
+    );
+    // After the answer, never before it (a first follow-up takes the deferred answer's place).
+    const edited = Math.min(...used.editReply.mock.invocationCallOrder);
+    expect(Math.min(...used.followUp.mock.invocationCallOrder)).toBeGreaterThan(edited);
+  });
+
+  it('refuses two max battles in one picture, pointing to the mention (plan 7P)', async () => {
+    const made = await setup();
+    const used = await made.run({}, splitOutcome([maxReading(), maxReading()]));
+    expect(made.store.active()).toEqual([]);
+    expect(told(used).content).toBe(
+      'This screenshot shows two max battles: post it in the channel with a mention of me to report both.',
+    );
+  });
+
   it('refuses a raid’s screen, also beside a typed boss and spot', async () => {
     const made = await setup();
     const egg = eggReading('Old Stone Fountain', 5, { hour: 13, minute: 59 }, 20 * 60);
diff --git a/src/commands/max/max-screenshot.ts b/src/commands/max/max-screenshot.ts
index c9121df4..2cd872ce 100644
--- a/src/commands/max/max-screenshot.ts
+++ b/src/commands/max/max-screenshot.ts
@@ -41,7 +41,7 @@ import { plain, truncate } from '../../render/text.js';
 import { PendingRequests } from '../../services/pending-requests.js';
 import { unreadWords, type MaxTypedUse } from '../../services/screenshot-service.js';
 import { feedbackRow, showRow } from '../screenshots/feedback.js';
-import { readAttachedOutcome } from '../screenshots/read-screenshot.js';
+import { readAttachedOutcome, sayBeside } from '../screenshots/read-screenshot.js';
 import {
   readMaxBoss,
   readSpot,
@@ -167,6 +167,18 @@ export async function reportMaxFromScreenshot(
   interaction: ChatInputCommandInteraction,
   ctx: AppContext,
   attachment: Attachment,
+): Promise<void> {
+  // A raid beside the max battle of a split screenshot (plan 7P) is named once it is answered.
+  const seen: { beside?: 'raid' | 'max' } = {};
+  await answerMaxScreenshot(interaction, ctx, attachment, seen);
+  if (seen.beside) await sayBeside(interaction, ctx, seen.beside);
+}
+
+async function answerMaxScreenshot(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  attachment: Attachment,
+  seen: { beside?: 'raid' | 'max' },
 ): Promise<void> {
   const now = Date.now();
   const countedAt = whenCounted(interaction) ?? now;
@@ -231,6 +243,10 @@ export async function reportMaxFromScreenshot(
   };
   const outcome = await readAttachedOutcome(interaction, ctx, attachment, {
     use: 'max',
+    screen: 'max',
+    beside: (screen) => {
+      seen.beside = screen;
+    },
     maxTyped: maxTypedOf,
   });
   // Not read, or a picture that is no screen at all, but the boss and the spot were typed: those
diff --git a/src/commands/raids/raid-screenshot.test.ts b/src/commands/raids/raid-screenshot.test.ts
index 44bffa3f..1d93602e 100644
--- a/src/commands/raids/raid-screenshot.test.ts
+++ b/src/commands/raids/raid-screenshot.test.ts
@@ -14,7 +14,12 @@ import { at, MINUTE, PARTY_NOW, testRaid } from '../../../test/support/parties.j
 import { partyServiceWith } from '../../../test/support/party-service.js';
 import { gymsFixture } from '../../../test/support/providers.js';
 import { screenshotsWith } from '../../../test/support/screenshot-service.js';
-import { eggReading, maxReading, readingOf } from '../../../test/support/screenshots.js';
+import {
+  eggReading,
+  maxReading,
+  readingOf,
+  splitOutcome,
+} from '../../../test/support/screenshots.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import type { Gym } from '../../db/repositories/gym-repository.js';
 import { enabledCommands } from '../../discord/command.js';
@@ -30,6 +35,7 @@ import { renderMirror } from '../../render/mirrors.js';
 import { renderRaidPost } from '../../render/raid-post.js';
 import { screenshotControls } from '../screenshots/feedback.js';
 import { raid, raidControls } from './raid.js';
+import { besideWords } from '../screenshots/read-screenshot.js';
 import { reportedBoss } from './raid-input.js';
 import { buttonsOf, customIdsOf } from '../../../test/support/messages.js';
 
@@ -330,6 +336,59 @@ describe('/raid with a screenshot', () => {
     expect(store.active()).toEqual([]);
   });
 
+  describe('a split screenshot (plan 7P)', () => {
+    const egg = () => eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60);
+
+    it('reports the raid of a split, and names the max battle beside it that it did not', async () => {
+      const { report, store } = await setup();
+      const used = await report(splitOutcome([maxReading(), egg()]));
+      expect(store.active()).toMatchObject([{ gymId: 2 }]);
+      expect(sent(used.editReply).content).toMatch(/^Reported: T5 egg at Old Stone Fountain\./);
+      expect(sent(used.followUp).content).toBe(
+        'The max battle beside it was not reported: post the screenshot in the channel with a mention of me to report both.',
+      );
+      // The note follows the answer: a follow-up sent before the deferred answer is edited
+      // would take the answer's place, and the edit would overwrite it.
+      const edited = Math.min(...used.editReply.mock.invocationCallOrder);
+      expect(Math.min(...used.followUp.mock.invocationCallOrder)).toBeGreaterThan(edited);
+    });
+
+    it('points to posting it plainly where screenshots are read passively', () => {
+      const ctx = createTestContext().ctx;
+      const passive = {
+        ...ctx,
+        config: {
+          ...ctx.config,
+          settings: { ...ctx.config.settings, ocr: { ...ctx.config.settings.ocr, passive: true } },
+        },
+        features: { ocrPassive: true, autoAssignRole: false },
+      };
+      expect(besideWords(passive, 'max')).toBe(
+        'The max battle beside it was not reported: post the screenshot in the channel to report both.',
+      );
+    });
+
+    it('refuses two raids in one picture, pointing to the mention', async () => {
+      const { report, store } = await setup();
+      const two = splitOutcome([egg(), eggReading('Maple Leaf Mosaic', 3, CLOCK, 15 * 60)]);
+      const used = await report(two, { boss: 'e:T5:0', gym: 'g:1' });
+      expect(store.active()).toEqual([]);
+      expect(sent(used.followUp).content).toBe(
+        'This screenshot shows two raids: post it in the channel with a mention of me to report both.',
+      );
+    });
+
+    it('reports what was typed beside two screens it could not tell apart', async () => {
+      const { report, store } = await setup();
+      const used = await report(
+        { kind: 'read', reading: egg(), twoScreens: true },
+        { boss: 'e:T5:0', gym: 'g:1' },
+      );
+      expect(store.active()[0]).toMatchObject({ gymId: 1, raid: { screenshot: null } });
+      expect(sent(used.editReply).content).toMatch(/^I could not read the screenshot, so I used/);
+    });
+  });
+
   it('reports what the member typed when the screenshot is no raid screen, and says so', async () => {
     const { report, store } = await setup();
     const used = await report(readingOf({ gym: 'Old Stone Fountain' }), {
diff --git a/src/commands/raids/raid.ts b/src/commands/raids/raid.ts
index ea9eeb81..117a6391 100644
--- a/src/commands/raids/raid.ts
+++ b/src/commands/raids/raid.ts
@@ -31,7 +31,7 @@ import { plain, truncate } from '../../render/text.js';
 import { PendingRequests } from '../../services/pending-requests.js';
 import { feedbackRow, showRow } from '../screenshots/feedback.js';
 import { gymCandidates, gymMenuOptions, gymNamerOf } from '../screenshots/gym-question.js';
-import { readAttachedOutcome } from '../screenshots/read-screenshot.js';
+import { readAttachedOutcome, sayBeside } from '../screenshots/read-screenshot.js';
 import { unreadWords } from '../../services/screenshot-service.js';
 import {
   bossChoices,
@@ -290,6 +290,19 @@ async function reportFromScreenshot(
   ctx: AppContext,
   regionChannelId: string | undefined,
   attachment: Attachment,
+): Promise<void> {
+  // A max battle beside the raid of a split screenshot (plan 7P) is named once the raid is.
+  const seen: { beside?: 'raid' | 'max' } = {};
+  await answerScreenshot(interaction, ctx, regionChannelId, attachment, seen);
+  if (seen.beside) await sayBeside(interaction, ctx, seen.beside);
+}
+
+async function answerScreenshot(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  regionChannelId: string | undefined,
+  attachment: Attachment,
+  seen: { beside?: 'raid' | 'max' },
 ): Promise<void> {
   const typedBoss = interaction.options.getString('boss')?.trim() ?? '';
   const typedGymText = interaction.options.getString('gym')?.trim() ?? '';
@@ -336,6 +349,10 @@ async function reportFromScreenshot(
   };
   const outcome = await readAttachedOutcome(interaction, ctx, attachment, {
     use: 'raid',
+    screen: 'raid',
+    beside: (screen) => {
+      seen.beside = screen;
+    },
     typed: (report) => {
       // No time typed: the screenshot's countdown counts (an Elite egg's too, review 8E-1).
       const time =
diff --git a/src/commands/screenshots/feedback.ts b/src/commands/screenshots/feedback.ts
index e2c3e011..fc97603f 100644
--- a/src/commands/screenshots/feedback.ts
+++ b/src/commands/screenshots/feedback.ts
@@ -30,6 +30,7 @@ import {
   maxRefusalWords,
   maxScreenshotMessage,
   MAX_TIER_UNKNOWN,
+  placeName,
   refusalWords,
   screenshotMessage,
   type BattleTimes,
@@ -158,14 +159,14 @@ export function feedbackForm(
 }
 
 /** What Pine did, or would do, with a screenshot, in one sentence. */
-export function decisionWords(decision: StoredDecision): string {
+export function decisionWords(decision: StoredDecision, passive = false): string {
   switch (decision.kind) {
     case 'report':
       return 'With a screenshot like this, I report the raid as above.';
     case 'ask':
       return 'With a screenshot like this, I ask which gym it is before I report the raid.';
     case 'refuse':
-      return refusalWords(decision.reason);
+      return refusalWords(decision.reason, passive);
   }
 }
 
@@ -177,6 +178,7 @@ export function maxDecisionWords(
   decision: StoredDecision,
   report: StoredMaxReport,
   times: BattleTimes,
+  passive = false,
 ): string {
   switch (decision.kind) {
     case 'report':
@@ -187,7 +189,7 @@ export function maxDecisionWords(
         ? 'With a screenshot like this, I ask which Power Spot it is before I report the battle.'
         : MAX_TIER_UNKNOWN;
     case 'refuse':
-      return maxRefusalWords(decision.reason, times, report.spot.read);
+      return maxRefusalWords(decision.reason, times, report.spot.read, passive);
   }
 }
 
@@ -217,20 +219,31 @@ export async function showScreenshot(
         ? 'Is this what the picture shows?'
         : 'Is this what the screenshot shows?',
     picture: shown === undefined ? undefined : `attachment://${shown}`,
+    // A pane of a split screenshot (plan 7P): its own reading, named by its place; the picture
+    // is the whole screenshot.
+    ...(record.pane ? { pane: { place: placeName(record.pane.side), of: 1 } } : {}),
   };
   // A max battle's screenshot shows its own reading, and its feedback is a max battle's.
   const message = record.max
     ? maxScreenshotMessage({
         ...shot,
         report: record.max,
-        decision: maxDecisionWords(record.decision, record.max, ctx.config.settings.maxBattles),
+        decision: maxDecisionWords(
+          record.decision,
+          record.max,
+          ctx.config.settings.maxBattles,
+          ctx.config.settings.ocr.passive && ctx.features.ocrPassive,
+        ),
         buttons: feedbackButtons(screenshotId, true),
       })
     : screenshotMessage({
         ...shot,
         report: record.report,
         gymName: gymNamerOf(ctx),
-        decision: decisionWords(record.decision),
+        decision: decisionWords(
+          record.decision,
+          ctx.config.settings.ocr.passive && ctx.features.ocrPassive,
+        ),
         buttons: feedbackButtons(screenshotId),
       });
   await interaction.editReply({
diff --git a/src/commands/screenshots/read-screenshot.test.ts b/src/commands/screenshots/read-screenshot.test.ts
index 9cee7904..923037ff 100644
--- a/src/commands/screenshots/read-screenshot.test.ts
+++ b/src/commands/screenshots/read-screenshot.test.ts
@@ -17,7 +17,8 @@ import { buttonsOf, textDisplays, textOf, thumbnailOf } from '../../../test/supp
 import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { WEST_CHANNEL } from '../../../test/support/gyms.js';
 import { screenshotsWith } from '../../../test/support/screenshot-service.js';
-import { eggReading, readingOf } from '../../../test/support/screenshots.js';
+import { eggReading, readingOf, splitOutcome } from '../../../test/support/screenshots.js';
+import { TWO_SCREENS } from '../../render/screenshot-reading.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { InteractionRouter } from '../../discord/router.js';
 import type { ScreenReading } from '../../ocr/screen-reader.js';
@@ -107,6 +108,54 @@ describe('/read-screenshot', () => {
     expect(files('held')).toContain(`${id}.json`);
   });
 
+  it('shows each pane of a split screenshot in a container of its own, named by its place', async () => {
+    const { read } = setup();
+    const egg = (gym: string) => eggReading(gym, 5, { hour: 13, minute: 39 }, 600);
+    const used = await read(
+      'split.png',
+      splitOutcome([egg('Old Stone Fountain'), egg('Maple Leaf Mosaic')]),
+    );
+    const message = asV2(sent(used.editReply));
+    expectV2Sendable(message);
+    expect(message.components).toHaveLength(2);
+    // Each container's reading is headed by its pane's place and holds that pane's gym only.
+    const firsts = message.components.map(
+      (container) => textDisplays({ ...message, components: [container] })[0] ?? '',
+    );
+    expect(firsts[0]).toMatch(/^\*\*Top\*\*\n/u);
+    expect(firsts[0]).toContain('Old Stone Fountain');
+    expect(firsts[0]).not.toContain('Maple Leaf Mosaic');
+    expect(firsts[1]).toMatch(/^\*\*Bottom\*\*\n/u);
+    expect(firsts[1]).toContain('Maple Leaf Mosaic');
+    // Each pane has its own feedback.
+    const ids = buttonsOf(message).map(({ customId }) => customId?.split(':')[1]);
+    expect(new Set(ids).size).toBe(2);
+  });
+
+  it('shows a pane’s own reading on its "Screenshot feedback", named by its place', async () => {
+    const { read, handled } = setup();
+    const egg = (gym: string) => eggReading(gym, 5, { hour: 13, minute: 39 }, 600);
+    const used = await read(
+      'split.png',
+      splitOutcome([egg('Old Stone Fountain'), egg('Maple Leaf Mosaic')]),
+    );
+    const ids = buttonsOf(asV2(sent(used.editReply))).map(
+      ({ customId }) => customId?.split(':')[1],
+    );
+    const shown = await handled(fakeButton({ customId: `shot:${ids.at(-1) ?? ''}:show` }));
+    const reading = textDisplays(asV2(sent(shown.editReply)))[0] ?? '';
+    expect(reading).toMatch(/^\*\*Bottom\*\*\n/u);
+    expect(reading).toContain('Maple Leaf Mosaic');
+    expect(reading).not.toContain('Old Stone Fountain');
+  });
+
+  it('refuses two screens it could not tell apart', async () => {
+    const { read } = setup();
+    const egg = eggReading('Old Stone Fountain', 5, { hour: 13, minute: 39 }, 600);
+    const used = await read('mixed.png', { kind: 'read', reading: egg, twoScreens: true });
+    expect(said(sent(used.followUp))).toBe(TWO_SCREENS);
+  });
+
   it('says why it could not read one, and refuses what is no raid', async () => {
     const { read } = setup();
     const busy = await read('busy.png', { kind: 'busy' });
diff --git a/src/commands/screenshots/read-screenshot.ts b/src/commands/screenshots/read-screenshot.ts
index 1e794a43..0c4758b1 100644
--- a/src/commands/screenshots/read-screenshot.ts
+++ b/src/commands/screenshots/read-screenshot.ts
@@ -1,5 +1,6 @@
-import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
+import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
 import { v2Answer } from '../../discord/late-reply.js';
+import type { V2Message } from '../../discord/party-gateway.js';
 import type { AppContext } from '../../app-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
@@ -7,12 +8,16 @@ import { guildIdOf, regionChannelOf, requireGuild } from '../../discord/guards.j
 import { storedReport } from '../../domain/ocr/screenshot-record.js';
 import {
   maxScreenshotMessage,
+  placeName,
+  reportBothWords,
   screenshotMessage,
   SHOT_COLOUR,
 } from '../../render/screenshot-reading.js';
 import { textMessage } from '../../render/v2.js';
 import {
   unreadWords,
+  type PanesOutcome,
+  type ReadOutcome,
   type ScreenshotOutcome,
   type ScreenshotSource,
   type ScreenshotWhere,
@@ -34,43 +39,98 @@ export function waitingWords(ahead: number): string {
 }
 
 /**
- * Reads a screenshot a command was given, for the member who gave it: the region of the channel
- * (or the server's gyms outside one), the time of the interaction as the upload's, a line in the
- * deferred answer while it waits. Throws a `UserError` for one that could not be read at all.
+ * How the line that says a screenshot waits is sent: as the answer will be, since an answer
+ * that was plain text does not become a components-v2 message (`/raid` answers plain, `/read-
+ * screenshot` v2).
+ */
+export type WaitAs = 'plain' | 'v2';
+
+/**
+ * `readAttached` for a command that reports one kind of screen (`screen`: `/raid` a raid's,
+ * `/max` a max battle's), answering a screenshot that could not be read at all rather than
+ * throwing. Of a split screenshot (plan 7P) the pane of that kind; a pane of the other kind beside
+ * it is told to `beside` (the command names it with `sayBeside` once it has answered); two of
+ * that kind are refused with a pointer to the mention (Matt's Q1). Without a pane of that kind,
+ * the other kind's (which the command refuses).
  */
-export async function readAttached(
+export async function readAttachedOutcome(
   interaction: ChatInputCommandInteraction,
   ctx: AppContext,
   source: ScreenshotSource,
-  more: Pick<ScreenshotWhere, 'use'> & Partial<Pick<ScreenshotWhere, 'typed' | 'maxTyped'>>,
+  more: Pick<ScreenshotWhere, 'use'> &
+    Partial<Pick<ScreenshotWhere, 'typed' | 'maxTyped'>> & {
+      screen: 'raid' | 'max';
+      beside?: (screen: 'raid' | 'max') => void;
+    },
   waitAs: WaitAs = 'plain',
-): Promise<Extract<ScreenshotOutcome, { kind: 'read' }>> {
-  const outcome = await readAttachedOutcome(interaction, ctx, source, more, waitAs);
-  if (outcome.kind !== 'read') throw new UserError(unreadWords(outcome));
-  return outcome;
+): Promise<ScreenshotOutcome> {
+  const { beside: _beside, ...where } = more;
+  const outcome = await readAttachedPanes(interaction, ctx, source, where, waitAs);
+  if (outcome.kind !== 'panes') return outcome;
+  const mine = outcome.panes.filter((pane) => pane.screen === more.screen);
+  const other = outcome.panes.find((pane) => pane.screen !== more.screen);
+  if (mine.length > 1) throw new UserError(severalWords(ctx, more.screen));
+  const [one] = mine;
+  if (!one) return other ?? { kind: 'two-screens' };
+  if (other) more.beside?.(other.screen);
+  return one;
 }
 
 /**
- * How the line that says a screenshot waits is sent: as the answer will be, since an answer
- * that was plain text does not become a components-v2 message (`/raid` answers plain, `/read-
- * screenshot` v2).
+ * Names the pane of the other kind beside the one a command reported (`besideWords`), in a
+ * private follow-up. Only once the command's deferred answer is edited: a first follow-up
+ * would take that answer's place, and the answer's edit would overwrite it.
  */
-export type WaitAs = 'plain' | 'v2';
+export async function sayBeside(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  screen: 'raid' | 'max',
+): Promise<void> {
+  await interaction
+    .followUp({ content: besideWords(ctx, screen), flags: MessageFlags.Ephemeral })
+    .catch((err: unknown) => {
+      ctx.log.warn({ err }, 'could not name the screen beside a screenshot');
+    });
+}
 
-/** `readAttached`, answering a screenshot that could not be read at all rather than throwing. */
-export async function readAttachedOutcome(
+/** A command's refusal of two screens of its kind in one picture (plan 7P, Matt's Q1). */
+export function severalWords(
+  ctx: Pick<AppContext, 'config' | 'features'>,
+  screen: 'raid' | 'max',
+): string {
+  const what = screen === 'raid' ? 'two raids' : 'two max battles';
+  return `This screenshot shows ${what}: ${reportBothWords('it', passiveIn(ctx))}.`;
+}
+
+/** What a command says of the pane of the other kind beside the one it reported (plan 7P). */
+export function besideWords(
+  ctx: Pick<AppContext, 'config' | 'features'>,
+  screen: 'raid' | 'max',
+): string {
+  const what = screen === 'raid' ? 'The raid' : 'The max battle';
+  return `${what} beside it was not reported: ${reportBothWords('the screenshot', passiveIn(ctx))}.`;
+}
+
+/** Whether screenshots are read passively (`reportBothWords`' pointer). */
+export function passiveIn(ctx: Pick<AppContext, 'config' | 'features'>): boolean {
+  return ctx.config.settings.ocr.passive && ctx.features.ocrPassive;
+}
+
+/** A screenshot a command was given, read pane by pane (plan 7P): `readAttached`'s reading. */
+export async function readAttachedPanes(
   interaction: ChatInputCommandInteraction,
   ctx: AppContext,
   source: ScreenshotSource,
-  more: Pick<ScreenshotWhere, 'use'> & Partial<Pick<ScreenshotWhere, 'typed' | 'maxTyped'>>,
+  more: Pick<ScreenshotWhere, 'use'> &
+    Partial<Pick<ScreenshotWhere, 'typed' | 'maxTyped' | 'screen'>>,
   waitAs: WaitAs = 'plain',
-): Promise<ScreenshotOutcome> {
+): Promise<PanesOutcome> {
   const guildId = guildIdOf(interaction);
   const guildRow = await ctx.guilds.idFor(guildId);
   if (guildRow === undefined) throw new UserError('This server is not set up for raids yet.');
   // The line that says it waits is sent before the answer, never after it.
   let waiting: Promise<unknown> = Promise.resolve();
-  const outcome = await ctx.screenshots.read(source, {
+  const outcome = await ctx.screenshots.readPanes(source, {
     guildId,
     guildRow,
     channelId: regionChannelOf(interaction, ctx) ?? null,
@@ -122,57 +182,79 @@ export const readScreenshot: SimpleCommand = {
 
   async execute(interaction, ctx) {
     const attachment = interaction.options.getAttachment('screenshot', true);
-    const outcome = await readAttachedOutcome(
+    const outcome = await readAttachedPanes(
       interaction,
       ctx,
       attachment,
       { use: 'read-screenshot' },
       'v2',
     );
-    if (outcome.kind !== 'read') {
+    if (outcome.kind !== 'panes') {
       // The line that said it waits stands as the answer: it becomes the refusal, in kind (a
       // v2 message does not become plain text again). Without it the refusal goes as usual.
       if (!interaction.replied) throw new UserError(unreadWords(outcome));
       await interaction.editReply(v2Answer(textMessage(SHOT_COLOUR, [unreadWords(outcome)])));
       return;
     }
-    // The member's own upload, beside what was read of it.
+    // The member's own upload, beside what was read of it. A split screenshot (plan 7P) shows
+    // each pane's reading in a container of its own, named by its place, the thumbnail the
+    // whole picture, each in its share of the message's room.
     const picture = attachment.url.startsWith('https://') ? attachment.url : undefined;
-    const question = outcome.id === undefined ? undefined : 'Did I read it right?';
-    if (outcome.screen === 'max') {
-      // A max battle's screenshot (plan 8X-S): its own reading, what a mention or `/max` would do
-      // with it (nobody is told of a Power Spot only shown), and a max battle's feedback.
-      const { decision } = outcome;
-      const stored =
-        decision.kind === 'report'
-          ? { kind: 'report' as const }
-          : decision.kind === 'ask'
-            ? { kind: 'ask' as const, doubts: decision.doubts }
-            : { kind: 'refuse' as const, reason: decision.reason };
-      const message = maxScreenshotMessage({
-        report: outcome.report,
-        decision: maxDecisionWords(stored, outcome.report, ctx.config.settings.maxBattles),
-        question,
-        picture,
-        buttons: outcome.id === undefined ? [] : feedbackButtons(outcome.id, true),
-      });
-      await interaction.editReply(v2Answer(message));
-      return;
-    }
-    const decision =
-      outcome.decision.kind === 'report'
+    const messages = outcome.panes.map((pane) =>
+      paneMessage(ctx, pane, picture, outcome.panes.length),
+    );
+    await interaction.editReply(
+      v2Answer({ v2: true, components: messages.flatMap((message) => message.components) }),
+    );
+  },
+};
+
+/** The answer of `/read-screenshot` for one screen (of `of` in the picture). */
+function paneMessage(
+  ctx: AppContext,
+  outcome: ReadOutcome,
+  picture: string | undefined,
+  of: number,
+): V2Message {
+  const question = outcome.id === undefined ? undefined : 'Did I read it right?';
+  const pane = outcome.pane ? { place: placeName(outcome.pane.side), of } : undefined;
+  if (outcome.screen === 'max') {
+    // A max battle's screenshot (plan 8X-S): its own reading, what a mention or `/max` would do
+    // with it (nobody is told of a Power Spot only shown), and a max battle's feedback.
+    const { decision } = outcome;
+    const stored =
+      decision.kind === 'report'
         ? { kind: 'report' as const }
-        : outcome.decision.kind === 'ask'
-          ? { kind: 'ask' as const, doubts: outcome.decision.doubts }
-          : outcome.decision;
-    const message = screenshotMessage({
-      report: storedReport(outcome.report),
-      gymName: gymNamerOf(ctx),
-      decision: decisionWords(decision),
+        : decision.kind === 'ask'
+          ? { kind: 'ask' as const, doubts: decision.doubts }
+          : { kind: 'refuse' as const, reason: decision.reason };
+    return maxScreenshotMessage({
+      report: outcome.report,
+      decision: maxDecisionWords(
+        stored,
+        outcome.report,
+        ctx.config.settings.maxBattles,
+        passiveIn(ctx),
+      ),
       question,
       picture,
-      buttons: outcome.id === undefined ? [] : feedbackButtons(outcome.id),
+      buttons: outcome.id === undefined ? [] : feedbackButtons(outcome.id, true),
+      ...(pane ? { pane } : {}),
     });
-    await interaction.editReply(v2Answer(message));
-  },
-};
+  }
+  const decision =
+    outcome.decision.kind === 'report'
+      ? { kind: 'report' as const }
+      : outcome.decision.kind === 'ask'
+        ? { kind: 'ask' as const, doubts: outcome.decision.doubts }
+        : outcome.decision;
+  return screenshotMessage({
+    report: storedReport(outcome.report),
+    gymName: gymNamerOf(ctx),
+    decision: decisionWords(decision, passiveIn(ctx)),
+    question,
+    picture,
+    buttons: outcome.id === undefined ? [] : feedbackButtons(outcome.id),
+    ...(pane ? { pane } : {}),
+  });
+}
diff --git a/src/services/screenshot-service.ts b/src/services/screenshot-service.ts
index e27c7814..fb0ea944 100644
--- a/src/services/screenshot-service.ts
+++ b/src/services/screenshot-service.ts
@@ -215,15 +215,6 @@ export type FetchOutcome =
 
 /** Screenshots on Discord: read, reported on, kept, and what members say of them. */
 export interface Screenshots {
-  /**
-   * One screen's outcome (`readPanes` for a caller of one screen until each takes panes): a
-   * split screenshot's one pane, or `two-screens` when it shows more than one. Downloaded now,
-   * or ahead by `fetch` (then not again).
-   */
-  read(
-    source: ScreenshotSource | FetchedScreenshot,
-    where: ScreenshotWhere,
-  ): Promise<ScreenshotOutcome>;
   /**
    * A screenshot read: each pane of a split one (plan 7P) decided and kept as a screenshot of
    * its own; one screen is one pane. Downloaded now, or ahead by `fetch`.
@@ -297,16 +288,6 @@ export class ScreenshotService implements Screenshots {
     return { kind: 'fetched', screenshot: { ...source, bytes: download.bytes } };
   }
 
-  async read(
-    source: ScreenshotSource | FetchedScreenshot,
-    where: ScreenshotWhere,
-  ): Promise<ScreenshotOutcome> {
-    const outcome = await this.readPanes(source, where);
-    if (outcome.kind !== 'panes') return outcome;
-    const [one, ...more] = outcome.panes;
-    return one && more.length === 0 && outcome.held === 0 ? one : { kind: 'two-screens' };
-  }
-
   async readPanes(
     source: ScreenshotSource | FetchedScreenshot,
     where: ScreenshotWhere,
````

### Task 6: 7P task 6: split screens in the area doc, the guide, the log and the staging checklist

Prototype commit: `3647705266b611e0da72bc55b728087fad411fc3`

screenshots.md gets a section "Split screens (plan 7P)": the rule that keeps single
screens as they are, the anchors and twoScreens, the divider, the text's and the seam's
cut, the status bar handed down, readPanes and what is kept, the flows on Discord and how
ocr:check measures panes. The legacy guide says split screenshots are read pane by pane
and that the whole picture is kept, the other app's half too (Matt's Q2); the improvements
log has the scores; the staging checklist is drafted.

**Files:**

```
 docs/architecture/screenshots.md                      | 21 +++++++++++++++++----
 docs/guides/migrating-a-legacy-instance.md            |  2 +-
 docs/superpowers/ocr-improvements.md                  |  7 +++++++
 docs/superpowers/plans/2026-10-27-phase-7p-staging.md | 35 +++++++++++++++++++++++++++++++++++
 4 files changed, 60 insertions(+), 5 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3647705266b611e0da72bc55b728087fad411fc3 -- src test scripts data docs/architecture docs/guides docs/superpowers/ocr-improvements.md docs/superpowers/plans/2026-10-27-phase-7p-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `7P task 6: split screens in the area doc, the guide, the log and the staging checklist`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/screenshots.md b/docs/architecture/screenshots.md
index cf692a63..8f56dd0a 100644
--- a/docs/architecture/screenshots.md
+++ b/docs/architecture/screenshots.md
@@ -6,17 +6,30 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 
 - Screenshots are read through `ScreenshotReader` (`OcrService`, `src/services/ocr-service.ts`): `read(bytes, { onQueued })` never throws and answers `read` (with the `ScreenReading`), `not-an-image`, `failed`, `busy` (beyond `settings.ocr.queue`; `full()` says so beforehand, and `ScreenshotService` asks it before it downloads) or `unavailable`; more than `MAX_SCREENSHOT_BYTES` is no image. It reads in a child process (`src/ocr/worker.ts`, protocol in `src/ocr/protocol.ts`): forked on first use with a minimal environment (`workerEnvironment`: exact names, none of the bot's secrets), lowered priority (every thread on Linux), one screenshot at a time, killed after `ocr.timeoutSeconds`, ended after ten minutes idle; it answers `received` first, and only a process that died before that is given the screenshot again. A start that fails is not tried again for ten minutes; a device the platform lacks (`deviceProblem`) is refused once. `close()` at shutdown leaves no process behind. The bot's own process never decodes an image (it imports `sharp` as a type only). Tests use the fake worker `test/support/ocr-worker.ts`; only `npm run ocr:check` runs the real models.
 - The model files and the game's head icon (`OCR_ASSETS`, `src/domain/ocr/assets.ts`) are downloaded into `var/ocr/` by `OcrAssets` (`src/services/ocr-assets.ts`) and checked by size and SHA-256 before every start of the reading process; a file that differs is downloaded again, a download that still differs is refused. A new model version is a change of that list, measured with `ocr:check` first.
-- What the reader does with an image is pure (`src/domain/ocr/`): `text-model.ts` (detector boxes, CTC decoding, lines; caps `DETECTOR_PIXELS`, `MAX_LINE_WIDTH`), `raid-screen.ts` (the elements found from the text and its boxes, no fixed layout; the clock read again from the status bar; `clockIn`'s rules, a word also ending after a percent sign, an iPhone's location arrow read as a `1` after the minutes left out; a max battle's screen read as `max` (`MaxText`: Dynamax, Gigantamax or Eternamax (Eternatus's label, a Gigantamax battle in all else), the species, the Power Spot's line under it with that line's own confidence `spotConfidence`, the heads looked for just above the boss's line; the raid report makes no raid of it, so it is refused as no raid screen; plan 8X-S gives it a report of its own, below); the badge "Elite raid gym" or an older screen's "EX raid gym"; on a hatched raid the countdown that ends farthest right, not a nearby raid's timer; the CP's digits after at most three other characters, the icon beside it and a faint "CP" being read as `O`, `c`, `ce`; words left of the gym name's column, `PICTURE_EDGE` line heights from the edge, are the gym's picture and left out), `tier-heads.ts` (masked template matching against the game's icon), `shadow.ts` (the purple). Images are PNG, JPEG or WebP by their first bytes, at most `MAX_PIXELS`, of a screen's proportions (`src/ocr/screen-reader.ts`). Nothing the reader saw is logged.
+- What the reader does with an image is pure (`src/domain/ocr/`): `text-model.ts` (detector boxes, CTC decoding, lines; caps `DETECTOR_PIXELS`, `MAX_LINE_WIDTH`), `raid-screen.ts` (the elements found from the text and its boxes, no fixed layout; the clock read again from the status bar; `clockIn`'s rules, a word also ending after a percent sign, an iPhone's location arrow read as a `1` after the minutes left out; a max battle's screen read as `max` (`MaxText`: Dynamax, Gigantamax or Eternamax (Eternatus's label, a Gigantamax battle in all else), the species, the Power Spot's line under it with that line's own confidence `spotConfidence`, the heads looked for just above the boss's line; the raid report makes no raid of it, so it is refused as no raid screen; plan 8X-S gives gives it a report of its own, below); the badge "Elite raid gym" or an older screen's "EX raid gym"; on a hatched raid the countdown that ends farthest right, not a nearby raid's timer; the CP's digits after at most three other characters, the icon beside it and a faint "CP" being read as `O`, `c`, `ce`; words left of the gym name's column, `PICTURE_EDGE` line heights from the edge, are the gym's picture and left out), `tier-heads.ts` (masked template matching against the game's icon), `shadow.ts` (the purple). Images are PNG, JPEG or WebP by their first bytes, at most `MAX_PIXELS`, of a screen's proportions (`src/ocr/screen-reader.ts`). Nothing the reader saw is logged.
 
 ## The report and the decision
 
 - `screenshotReport(reading, reportContext(...))` (`src/domain/ocr/screenshot-report.ts`; the context from `src/services/screenshot-context.ts`: the gym search of the channel limited to the server's gyms, the bosses, the settings) says what raid a screenshot shows: gym (`clear` only as `clearGymHit` would act), egg or hatched, tier, boss (by its CP; the purple decides between shadow and plain; a CP that fits no boss takes the one boss of the heads' tier one digit off when the name read is clearly its; when no listed boss fits a hatched raid, a Pokémon of the game data (`ReportContext.pokemon`) whose raid CP at the heads' tier is the CP read or one digit off and whose name is nearly exactly the name read, clearly no other's, is taken as `/raid t5 azelf` takes it, by the same rule, `bossAtTier` (`utilities.md`; Matt, 2026-10-25: the readers decide as the commands do): off the list it is an `UnlistedRaidBoss` with the doubt `boss-unlisted` ("The boss is on no list of current raid bosses: …"), reported and posted as `/raid` with its tier typed reports it (`screenshotBoss`); listed in another level or as the other shadow kind, or the plain Pokémon in a mega raid, it is no boss), time (a 12-hour clock as the reading just before the upload; otherwise guessed from the upload), and `doubts` (`ReportDoubt`). What is done with it is `decide` (below); its doubts are what the "Screenshot feedback" button shows. The gym's name may run onto a second line read together with other text (the caption of the gym's picture: "AMBASSADOR PROGRAM C 0 murit Outgoing", which the picture's rule cuts away): the line just under the name is kept as read (`ScreenText.gymBelow`), and when no try of `gymOfText` is clear, its words that look like a name's (`NAME_LIKE`: capitalized, or a number) are added and tried again (Matt, 2026-10-24, "Pittsburgh Campsite -" and "Outgoing").
-- Screenshots on Discord go through `ctx.screenshots` (`ScreenshotService`, `src/services/screenshot-service.ts`): `read(source, where)` downloads the attachment (`MAX_SCREENSHOT_BYTES`), reads it, makes the report in the channel's region (the time also from an Android file name, `takenAtFromFileName`), puts in what the member typed (`withTyped`), decides and keeps it. The decision is pure (`decide`, `src/domain/ocr/screenshot-decision.ts`; Matt, 2026-10-14): `refuse` only a screen that is no raid's or a gym this server does not have, `ask` only which gym when the gym is not clear (a menu of every gym a fresh search of the text finds, `gymCandidates`, told apart by `menuDescription`), otherwise `report` unasked with what is known (a hatched raid without a boss is `RaidReport.hatched`; an unknown stage an egg without a time; a countdown too long is left out; a hatched raid over by its countdown is refused `raid-over`, an egg past its hatch reported hatched, ending its tier's length after the hatch (`hatchedMinutes`: `raidDurationsAt` with the raid events), certain when the moment of the screenshot is known (by its file or a clock without `time-guessed` / `time-sources-differ`), with the boss it was read with or the one a hatch gives, refused when that end has passed too; a guessed, stale or contested time is used and said in the post, `raid.screenshot.timeUncertain`, until `/hatch`, `/end` or "Set time" confirm it, `timeConfirmed` (an `/end` or `/hatch` that keeps its time is said in the post as "confirmed the end time" or "confirmed the hatch time", as for a max battle); `/duration` does not). The time of a screenshot is the file name's (`takenAtFromFileName`) unless the clock read disagrees by more than two minutes and was read surely (`CLOCK_SURE`, the confidence of its status-bar line), with the doubt `time-sources-differ` either way. The outcome's `withGym(id)` decides again as if the member had named a gym. A screenshot whose turn in the reader comes thirteen minutes after its interaction is given up as busy (`startBy`; a configuration that could make that happen is warned about at start). What it read is worded by `src/render/screenshot-reading.ts`. `ctx.screenshotReader` is the `OcrService` underneath; `settings.ocr.enabled` switches all of it off.
+- Screenshots on Discord go through `ctx.screenshots` (`ScreenshotService`, `src/services/screenshot-service.ts`): `readPanes(source, where)` downloads the attachment (`MAX_SCREENSHOT_BYTES`), reads it, makes the report in the channel's region (the time also from an Android file name, `takenAtFromFileName`), puts in what the member typed (`withTyped`), decides and keeps it. The decision is pure (`decide`, `src/domain/ocr/screenshot-decision.ts`; Matt, 2026-10-14): `refuse` only a screen that is no raid's or a gym this server does not have, `ask` only which gym when the gym is not clear (a menu of every gym a fresh search of the text finds, `gymCandidates`, told apart by `menuDescription`), otherwise `report` unasked with what is known (a hatched raid without a boss is `RaidReport.hatched`; an unknown stage an egg without a time; a countdown too long is left out; a hatched raid over by its countdown is refused `raid-over`, an egg past its hatch reported hatched, ending its tier's length after the hatch (`hatchedMinutes`: `raidDurationsAt` with the raid events), certain when the moment of the screenshot is known (by its file or a clock without `time-guessed` / `time-sources-differ`), with the boss it was read with or the one a hatch gives, refused when that end has passed too; a guessed, stale or contested time is used and said in the post, `raid.screenshot.timeUncertain`, until `/hatch`, `/end` or "Set time" confirm it, `timeConfirmed` (an `/end` or `/hatch` that keeps its time is said in the post as "confirmed the end time" or "confirmed the hatch time", as for a max battle); `/duration` does not). The time of a screenshot is the file name's (`takenAtFromFileName`) unless the clock read disagrees by more than two minutes and was read surely (`CLOCK_SURE`, the confidence of its status-bar line), with the doubt `time-sources-differ` either way. The outcome's `withGym(id)` decides again as if the member had named a gym. A screenshot whose turn in the reader comes thirteen minutes after its interaction is given up as busy (`startBy`; a configuration that could make that happen is warned about at start). What it read is worded by `src/render/screenshot-reading.ts`. `ctx.screenshotReader` is the `OcrService` underneath; `settings.ocr.enabled` switches all of it off.
 
 - A max battle's screen has a report and a decision of their own, pure (plan 8X-S; design `2026-10-22-max-battle-screenshots-design.md`): `maxScreenshotReport` (`src/domain/ocr/max-report.ts`) over the max boss list, the Pokémon search narrowed to the max bosses `/max` takes (`typedMaxBoss`: listed, also before the game master has it as one, or let battle so by the game) and the species the list has in any form (of every Pokémon on an Eternamax screen: the game data lists Eternatus for no max battle; Matt, 2026-10-25: before, a search of what the game lets battle found Kingler for a cut-short "Kingdr" beside a listed Kingdra) and the server's Power Spots (`SpotTitle`, the channel's region marked `local`): the boss of the list in the form's kind and of the species read, by its dex number, whichever form the list has (a Gigantamax Toxtricity listed as Amped; `listedBoss`: the Eternamax form only on an Eternamax screen, then the heads' tier, then the very entry read) (its tier from the list, a doubt `heads-boss-conflict` when the heads disagree), else a Pokémon `/max` takes off the list in a tier of the screen's kind (`typedMaxBoss`'s `others`) with the tier of its heads (1 to 5 Dynamax stars) or its form (Gigantamax and Eternamax are `G`); the Power Spot by `matchPowerSpot` (`power-spot-match.ts`: letters and digits only, so a lost space or punctuation does not matter; a title equal to the name, or only when none is, titles starting with it (a name cut short, six letters at least); exactly one in the channel's region, else exactly one in the server, is clear; otherwise every match and every title 80% alike (`nameSimilarity`) is a candidate, the region's first; none is unknown) and whether its line was read surely (`SPOT_SURE`, 0.9); the moment as a raid's (`screenshotMoment`, shared with `screenshotReport`, within `MAX_SCREENSHOT_AGE_MS`) and whether it is sure (`sureMoment`: by the file's name or a clock read surely, without `time-sources-differ`); the end, the countdown's at a whole minute (`wholeMinute`: the next one after a clock's moment, which says the minute only, the nearest after a file's; review S-4) capped at the last battle time of the day it was taken (`rotationEnd` when it ends before it: an event's rotation, not the all-day kind that runs to about 05:00), an all-day Dynamax countdown (one that runs past the last battle time) at the start of a max event later that day (`dayBattleEnd`, as `/max`'s default, Q-B: on a Max Battle Day the day's spots show their countdown to about 05:00 in the morning too, and the event's bosses replace them at its start; a countdown to a rotation, an event's battle up early, is kept; Matt, 2026-10-24), or `/max`'s default end without a countdown. `decideMax` (`max-decision.ts`) refuses `not-a-max-screen`, `over-for-today` (taken at or after the last battle, or a capped end past by the upload, Matt's M2), `battle-over`, `before-first` (a countdown ending at or before the first battle), `no-spot` (with the name and whether it was read surely) and `no-boss`; asks which spot (`about: 'spot'`) or, when only it is missing, the tier (`about: 'tier'`); otherwise reports `ScreenshotMax` (spot, boss, tier, end, `takenAt`, `sureMoment`, `rotationEnd`, `capped`: the end is the day's last battle time, `timeUncertain`: no sure moment, so a dated file or a sure clock is exact however old, and never with an end typed beside it, review F-5), with no ending-soon question; a default end (no countdown) passed by the upload is `over-for-today` too. `withSpot(report, spot)` puts in the spot a member chose. A species on the boss list counts though the game master does not have it as a max boss yet (the read name looked up among every Pokémon when the max-able search finds nothing; Matt, 2026-10-24: Pokebattler listed Azelf at 5★ first, and "Azelf" read found no boss).
-- `ScreenshotService.read` tells the kind of screen by the reading (`text.max`): its outcome says `screen: 'raid'` (the raid report and decision, `withGym`) or `screen: 'max'` (the max report and decision, `withSpot(spotId)`: a Wayfarer id the server does not have decides as nothing chosen). A max screen's report is made over `maxReportContext` (`src/services/screenshot-context.ts`): the max bosses, the Pokémon search (`ctx.pokemon.find`, best fit, with the filter the report gives it), the catalogue, the server's Power Spots (`ctx.wayspots.inRegion` of the channel's region first, marked `local`, then of every region of the server), the max and big events, `settings.maxBattles`; it is decided at the upload's time. What a caller expects is the caller's: `/raid screenshot:` refuses a max screen, "That is a max battle: use `/max screenshot:`, or post it with a mention." (`MAX_SCREEN_FOR_RAID`), also beside a typed boss and gym (the wrong picture: no `typedOnly`); the mention and passive reading take either kind ("On Discord"); `/read-screenshot` shows a max reading (below). Just before a screenshot's battle is reported, `reportMaxShotAs` (`src/commands/max/max-shot.ts`) checks its end against the clock again (review R11: the reading may have waited in the queue), `over-for-today` for a `capped` end, else `battle-over`.
+- `ScreenshotService.readPanes` tells the kind of screen of each pane by its reading (`text.max`): its outcome says `screen: 'raid'` (the raid report and decision, `withGym`) or `screen: 'max'` (the max report and decision, `withSpot(spotId)`: a Wayfarer id the server does not have decides as nothing chosen). A max screen's report is made over `maxReportContext` (`src/services/screenshot-context.ts`): the max bosses, the Pokémon search (`ctx.pokemon.find`, best fit, with the filter the report gives it), the catalogue, the server's Power Spots (`ctx.wayspots.inRegion` of the channel's region first, marked `local`, then of every region of the server), the max and big events, `settings.maxBattles`; it is decided at the upload's time. What a caller expects is the caller's: `/raid screenshot:` refuses a max screen, "That is a max battle: use `/max screenshot:`, or post it with a mention." (`MAX_SCREEN_FOR_RAID`), also beside a typed boss and gym (the wrong picture: no `typedOnly`); the mention and passive reading take either kind ("On Discord"); `/read-screenshot` shows a max reading (below). Just before a screenshot's battle is reported, `reportMaxShotAs` (`src/commands/max/max-shot.ts`) checks its end against the clock again (review R11: the reading may have waited in the queue), `over-for-today` for a `capped` end, else `battle-over`.
 - Screenshots that keep disagreeing with the boss list (plan 8X-J, design `2026-10-25-max-boss-tier-fix-design.md` section 2; the reader itself is unchanged: it keeps the list's tier). `ScreenshotService` records an observation of every read, from the reader's own report (never what was typed), the passive ones refused included, at the upload time (review I4), through its `tierWatch` (`ListTierWatch`, `src/services/list-tier-watch.ts`). What a screenshot says against the list is pure (`src/domain/ocr/list-tier-doubt.ts`): `maxTierObservation`, a listed Dynamax boss with heads read and `heads-boss-conflict` (Gigantamax never); `raidTierObservation` (review B1), a hatched raid without a boss whose CP and name at the heads' tier fit a Pokémon (`pokemonByCpAndName`, the very search `unlistedBossOf` makes) that the list has at another tier of the same kind (`bossAtTier`'s `listed-elsewhere`, plain and shadow apart, megas never), never an Elite raid on either side nor `heads-unverified` (6, 7 heads). A screenshot whose moment is known (by its file's name or a clock) and lies more than a day before the upload is no sighting (`momentTooOld`, review J10). An observation is the server, family, boss key, list's tier, heads' tier, member, place (the gym or Power Spot, its id or name as read) and time; `ListTierWatch` keeps a day of them per server in memory (a `BoundedMap`, 500 a server) and asks `listTierDoubt(observations, now)`: a sighting `LIST_TIER_SIGHTINGS` (3) screenshots show in `LIST_TIER_WINDOW_MS` (24 hours), from any members, a member and place counted once (Matt's answer 1). Then the moderators are told (`ModerationReports.listTier`, `moderation.md`) with the boss as the list has it now (none when it no longer has it so: staff fixed it) and, for a boss an add put there, that add's number, both as `familyReport` gives them (review J8); nothing outside a region channel. Members' answers are unchanged.
 
+## Split screens (plan 7P)
+
+Design `docs/superpowers/specs/2026-10-26-split-screen-screenshots-design.md`; Matt's samples `var/ocr/matt-2026-10-26-split/`, the fakes of foldables `var/ocr/fake-foldable-2026-10-26/` (their labels per pane, `<file>#1` top or left, `{"none": true}` a pane of another app).
+
+- **The rule that keeps single screens as they are.** The reading process (`readPicture`, `src/ocr/screen-reader.ts`) reads the whole picture as one screen, as before, and panes are only an alternative to that reading: a cut is kept only when every pane reads as one screen or as none, at least one a screen (`paneShows`, `cutKept`); otherwise the whole reading stands. The whole picture's flat dark margins are trimmed first (`trimMargins`: at least 3% of a side), and it is read at twice `READ_WIDTH` when, trimmed, it is wider than tall or near square (height under 1.4 times the width) or a divider cuts it side by side into panes narrower than 60% of it. Each pane is read as a phone's screenshot, at `READ_WIDTH` (read at twice that, Matt's panes lost three heads and gained nothing).
+- **What marks a screen** (`screenAnchors`, `src/domain/ocr/panes.ts`, pure, piece by piece: a row read across two panes is one `TextLine` whose `parts` keep its pieces): a max battle's title word, a CP among the tallest text, an h:mm:ss countdown (never a two-part chip: a max battle's 17:48, a map's 18:14), PRIVATE GROUP and BATTLE in capitals, a gym's title (the tallest words in the top fifth). `twoScreens` (`screensApart`): a kind a screen shows once (title, CP, PRIVATE GROUP, BATTLE) twice apart, two titles side by side, a max title with a CP, a max title with a countdown more than three of its heights away (its own chip sits beside it). A pane shows a raid by its CP, or an egg by its gym and a countdown alone in its line (at most six of its heights wide) and centered; a max battle by its title; nothing when no anchor only GO shows (`showsGo`, `SCREEN_ONLY`: a chat that says "0:32:10 left", notes); anything else is unclear and keeps the whole reading, a countdown alone in its line and centered that makes no egg too (an egg whose gym was not read: no egg is dropped unsaid); off the middle such a countdown is a chat message that is only a time, or a map's raid timer, and no screen.
+- **The cut.** Android's divider (`findDivider`, on a grey copy 800 pixels on its longer side): a band dark (30 of 255) and flat but for a handle in its middle 30%, at most 8% of the side (the samples' upright band is 26 of 2448 rows; a landscape split's dark gap with the panes' black corners is 167 of 2448 columns), between 15% and 85% of it, with a picture on both sides, and no piece of the whole reading's text across it by more than 8 pixels (`crossesCut`: a band through one screen's words is no divider; a piece whose own words show two screens, two titles read as one across a spine, is no text of one); between panes side by side also a flat band of any one grey, at most 2% of the width, a picture on both sides and 20 levels unlike the one on a side at least (an app beside it may be as dark) (a foldable's spine: the Duo's is grey 60); a picture cut so into panes narrower than 60% of it is read whole at twice the width. Without one: two screens' anchors grouped along an axis, the cut where the picture changes most (`seam`, the median difference across the line) in a band no piece of text crosses (`textCut`); on a picture of a foldable's shape (height under 1.6 times the width) whose text shows one screen and something only GO shows, the strongest such seam in the middle 30–70% of the width, at least 20 levels (`seamCut`: a foldable's GO beside a map, a chat or notes). Each pane is trimmed again, loosely (a line 75% dark: the status bar over a small pillarboxed GO, a floating button).
+- **The status bar** is read once for the picture (a strip 4.5% of the longer side, at twice the shorter side's size, so a landscape picture's is read as an upright one's) and handed to every pane in its pixels: every pane takes the picture's clock, the left one when two show. The band whose lines count as the status bar is 4.5% of the height (of a landscape picture too: its GO pane's title starts at 10%), and a pane that does not touch the picture's top has none (a countdown at its top is never the clock). A pane with no clock is timed as a screenshot without one.
+- **What a caller gets.** `OcrService.read` answers the whole `reading`, the `panes` of a kept cut (`PaneReading`: index, of, box, `shows`, the pane's own `ScreenReading`) with `cut` (`divider` or `text`), and `twoScreens`; `ReadOptions.divider: false` (`ocr:check --no-divider`) looks for no divider, the foldable's path on Matt's splits. The reading process reads a cut's panes only when it foresees them to end within `panesWithinMs` of the request (85% of `ocr.timeoutSeconds`, `PANES_WITHIN`, a time relative to the request so its own clock judges it), by what the whole reading took for its pixels, at least 0.8 of it (`PANES_AT_LEAST`: the recognizer's cost goes by the lines); otherwise it answers the whole reading with `late` (logged, and printed by `ocr:check`), as two screens when a divider or two screens' text cut it (without its panes it may be a mix), as its text says when only a seam cut it. `ScreenshotService.readPanes` gives a `ReadOutcome` per pane that shows a screen (a pane of nothing is left out; one screen is one pane), with its `pane` (`PanePlace`: index, of, box, `side` top, bottom, left or right). Two screens without a kept cut are refused `two-screens` (`TWO_SCREENS`), raids and max battles alike, kept for review with what was typed except read passively; two panes of a caller's one kind are kept refused (`several`).
+- **Kept.** Each pane is a kept screenshot of its own, with its own id and record (`ScreenshotRecord.pane`); its file is the whole picture (the bot never decodes an image, so it cannot crop), the second pane's a hard link of the first's (`ScreenshotKeeping.keep(…, alongside)`; a copy where links are refused), counted once. A pane of the kind a caller does not report (`ScreenshotWhere.screen`) is not kept when one it reports is beside it. The other app of a split is kept as long as the screenshot is (Matt's Q2).
+- **On Discord.** A mention and passive reading report each pane (`ScreenshotTrigger.readOne` over `readPanes`, `readPane` per pane): the first uses the image's use, another takes one of its own after the read (`ScreenshotWhere.anotherPane`; none left: not read, and the reply says "…so I did not read the other screen of one of them…"); the message's count of expected reports grows by the extra panes, read or not, before any question is sent (a pane not read keeps the message under the reply), and "n of m" counts panes; two screens it could not tell apart are said and give the use back, silent passively. `/raid screenshot:` and `/max screenshot:` take the pane of their kind (`readAttachedOutcome` with `screen`), with what was typed; a pane of the other kind beside it is named in a private follow-up once the command has answered (`sayBeside`, `besideWords`, worded as `severalWords` and the `several` refusal are, by `reportBothWords`: a first follow-up after a deferral would take the answer's place); two of their kind are refused with the pointer of Q1 (`severalWords`: to the mention, or where `ocr.passive` is on to posting it as it is); `two-screens` beside typed values reports what was typed, as an unreadable screenshot. `/read-screenshot` shows each pane in a container of its own headed by its place (`ShotView.pane`, `placeName`), the thumbnail the whole picture, the rooms shared; a party's "Screenshot feedback" shows its own pane's reading under its place.
+- **Measuring.** `ocr:check` prints a line per pane, scores `<file>#n` labels and `{"none": true}` (`none`), a picture's label without `#n` against its first pane that shows a screen (or the whole reading without a kept cut), and a picture refused as two screens as wrong in every element; it prints which pictures were cut and how, `twoScreens` per folder and the slowest picture. A fake's two clocks (`fold-two-*`) score either clock right.
+
 ## Keeping screenshots
 
 - Screenshots are kept by `ScreenshotStore` (`src/services/screenshot-store.ts`, `var/ocr/held/` and `var/ocr/review/`): every one read, with a record (`ScreenshotRecord`: the reading with only clock-like or short status-bar lines, the reader's own report and apart from it what the member typed, the decision, the boss list of the moment, where the time came from, the gym picked when asked, feedback; the ids of the sender and of who gave feedback, for staff and development only, never in a commit or a printout) for a day, a raid's while the raid is active and a day after (an active raid's is never deleted); one refused or asked about, one the reader itself had a doubt about (its own report's `doubts`, not what was typed), or one with feedback, is copied to review for `ocr.reviewDays`, at most `ocr.reviewPerDay` of a server a day; the hourly upkeep sweeps both, also stray and unreadable files after a day. A review copy is a hard link where the file system allows one, so a pair counts once. Both folders hold at most `ocr.keepMegabytes` (a start warns when `reviewPerDay` × `reviewDays` × 2 MB exceeds it): over it the oldest held screenshots without an issue (`hasIssue`: not reported unasked, a doubt, or "Something is wrong"; kept in an index built by the sweep, each read again before it goes) make room, then the oldest review copies that free bytes (not one hard-linked to its held screenshot), and when that is not enough the screenshot is read but not kept (a record kept alone counts its own bytes too). A passive read that was refused is not kept, nor a max screen without a countdown read passively; a picture that is no raid screen keeps its record alone, with its lines' boxes and confidences but no text. A max battle's screen is kept as a raid's, picture and text (plan 8X-S, review R5): its record keeps the raid report of it (`not-a-raid-screen`) and the raid bosses as before, and beside them `max` (the max report, `StoredMaxReport`), `maxBosses`, when asked, `pickedSpotId` (`pickedSpot`), and what was typed beside `/max screenshot:` as `maxTyped` (`StoredMaxTyped`: the Power Spot by id and title, the boss with its tier, a tier alone, the end; review S-5), its `decision` made with it, as a raid's `typed` (absent in records before it); a typed boss the screen cannot take fails the use and is kept so (`MaxTypedUse.refused`, review F-3): the screen not telling the tier of a boss on no list as asked about the tier, a boss that cannot battle as the screen shows refused `typed-boss` (`TYPED_BOSS_REFUSED`), both copied to review; such a record is judged by its max report's doubts (`ownDoubts`: `hasIssue` and the review copy) and gets no answer key on "All right". "All right" makes the record's `label` (`memberLabel`: what the reader decided by itself; the gym the member picked, or else one read clearly, by its own name), "Something is wrong" by anybody takes it away.
@@ -24,6 +37,6 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 ## On Discord
 
 - `/max screenshot:` (plan 8X-S; `src/commands/max/max-screenshot.ts`; review R1, R6, R7): `/max` is `forConfig` on `ocr.enabled` as `/raid` (the attachment option last, `boss:` and `spot:` optional with it, both required without it); without a screenshot a guard refuses a missing boss or spot ("Give the boss and the spot of the max battle (or attach a screenshot of it)."), with one it reads nothing before the screenshot but an `end:` that is no time (refused at once); always deferred privately with a screenshot. What was typed is read first (`boss:`, `spot:` by `readSpot`, a pin too, `end:`) and stands in the place of what was read, put in and decided by `ScreenshotService` (`ScreenshotWhere.maxTyped`, a function of the max report; the outcome's `report` has it in, its `read` is the reader's own, which "This is what I read" shows; review S-5) (`withMaxTyped` in `max-decision.ts`: the spot as `withSpot`, the boss as a listed one, the end instead of the countdown, then no clean read of a rotation's end); with `boss:` or `spot:` typed the moment counts as no sure one (`maxShotRequest`), so a battle there of another boss is refused as `/max` refuses it and one of the same boss is joined without its end moved or its time confirmed: only a boss and a Power Spot the screen itself showed change a battle (review S-2, Matt 2026-10-23); a typed boss on no list without `tier:` takes the screen's tier (its heads, or Gigantamax by its form), else `WHICH_TIER`; `tier:` typed without `boss:` is the tier of a boss read that is on no list, when it is of the screen's kind (`MaxTyped.tier`, settling `tier-unknown`; a listed boss keeps the list's, review r4 B1). A screenshot that cannot be read at all, beside a typed boss and spot, reports those as `/max` does with "I could not read the screenshot, so I used what you typed." (no ending-soon question); otherwise `unreadWords(outcome, 'max')` (naming `/max`, review R14). A raid's screen is refused, also beside typed values: "That is a raid: use `/raid screenshot:`, or post it with a mention." (`RAID_SCREEN_FOR_MAX`). A Power Spot not clear is asked with a menu (`max:<token>:spot`, the region's first, another region's named; `maxControls.select`, the record's `pickedSpot`), a clear one of another region read (not typed) confirmed as `/raid` confirms a gym ("<spot> is in <#region>, not in this region. Report the max battle there?", `max:<token>:yes` / `:no`); both wait in a store of their own that `maxControls.carriesOn` reads, so a battle refused for none of the member's doing (no post, the battle there ended twice) gives the use back from them too, and so does a pin typed beside the screenshot by a member blocked from meetups (`pin-blocked`, as `/max`'s guard refuses it uncounted; `maxShotGivesBack`, review r4 B3), and so does a battle there of another boss or kind that refuses it, also what was typed alone beside a screenshot that could not be read (`refusedAtBattle`, `taken`; as `/max`'s guard refuses another boss uncounted; review F-1; a mention's use is not given back for it). A refusal says why (`maxRefusalWords`, a missing Power Spot read surely telling the moderators as a mention does), "Nothing was reported. This is what I read:" and `maxReadingLines`, with the feedback row; a report goes through `reportMaxShot` (the forum bar, the battle there joined, changed or refused) and answers with `maxShotWords`, what the screenshot left unsure (`maxDoubtLines`) and `showRow` (R6: as `/raid` answers); `/max`'s throttle counts it.
-- Three ways to report a raid from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when the boss or the gym is missing and there is no screenshot; a screenshot that cannot be read at all or is no raid screen, beside a typed boss and gym, reports what was typed with a note; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes, given back when its raid's post could not be made, the bot not allowed to make posts in the forum or the post lost while it was made (plan 8S-3; also once its gym question is answered: `PendingShot.giveBack`); a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer, that becomes the answer once answered (no private follow-up: it would point at a deleted question) and goes after two minutes; either way a report that would put the author in a forum somebody keeps them out of is refused first, as `/raid` and the map refuse it (`reportBarred` in `reportShot`, plan 8M-6): `REPORT_BARRED` in the message's reply, or as the question's answer once a gym is picked; when Discord cannot say, it is logged and answered "Discord cannot be reached just now, so nothing was reported. Try again in a moment."; a pick stops the question's own time at once (it then stays as an answer does, `ReplyKeep.answered`, also while the raid is reported); a question answered while Discord cannot say stays, its menu too, with `ASK_AGAIN` below its text and a question's time again (`askAgain`), and its gym can be picked again, unless its time was up meanwhile or somebody deleted it, and it is gone: nothing brings it back, and the author is told privately (plan 8W-3); the report itself asks once more when it would join a raid already at the gym whose forum the first check did not see (`mayJoinNoting`, below `reportBarred`, `parties-and-posts.md`); the posts of raids that exist and what made nothing are said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports and a raid that exists, said in a reply that pings the author; a clear gym of another region (Matt, 2026-10-22, as legacy Pine asked): a raid there is joined unasked as one of this region (a report that may only join, `RaidReport.joinOnly`, decided under the gym's lock: `addRaidUnlessTaken` with `mayAdd: false`, `none-there` for a free gym), and with none there yet, when the gym lies in a region of the server with a forum (else nothing is said), the reply that pings the author asks "<gym> is in <#region>. Report it there?" (`elsewhereQuestion`, written for any place, a Power Spot too) with Yes and No only the author can answer, no dialog; Yes reports it as a gym picked in the mention's question does (`answerShot`: the forum bar, the use given back, the question becoming the answer), not recorded as `picked`; No or no answer makes nothing, and the question goes as the mention's does; a message of nothing but screenshots that all made or joined raids is deleted, one with text is marked ✅). A max battle's screenshot posted with a mention or read passively goes the max way (plan 8X-S; `readMax` in `ScreenshotTrigger.readOne`, which shares the loop, the throttle, the reactions, the replies and `finished` with raids): a clear Power Spot of the message's own region is reported unasked through `reportMaxShot` (`src/commands/max/max-shot.ts`, shared with `/max screenshot:`: the forum bar `maxBarred` first, `unknown-access` while Discord cannot say; then `reportMaxShotAs`: a battle there joined, its boss changed by a newer sure screenshot, or refused, else a new battle; the screenshot kept while its post shows it; no pin, so a member blocked from meetups is not refused; the per-image `screenshot` throttle, not `/max`'s), its words (`maxShotWords`: `/max`'s where it says the same, "Changed the boss of the max battle at <spot> to <boss> from your screenshot, until <end>.", an end moved later "Its end is now <end>, from your screenshot.") in the message's reply unless a new battle was made; a refusal by the decision is said in `maxRefusalWords` (`src/render/screenshot-reading.ts`); a Power Spot not clear, or a clear one of another region, is asked about with a menu of Power Spots (`shot:<token>:spot`, `PendingShot` of kind `spot` with `withSpot`; the region's first, another region's named under it; `chooseShotSpot` → `answerSpot`, the record's `pickedSpot`), as the gym question; a Power Spot it does not know is refused "I do not know a Power Spot called "<name>" here: use `/max spot:`." and, for a name read surely on a screen with a countdown (`missingSpotName` in `max-decision.ts`: an event's picture of a boss has none; review S-1, Matt 2026-10-23), the moderators told (`ModerationReports.missingSpot`, `moderation.md`), which the refusal then says ("I have let the staff know Pine may be missing this Power Spot."). Read passively a max screen without a countdown is left alone, whatever it shows: nothing reported, said or kept (review S-1). Read passively it never asks which Power Spot nor tells the moderators (Matt, 2026-10-22): a Power Spot not clear or unknown gets the reply that pings the author, "I could not tell which Power Spot this is: use `/max screenshot:`." (`told`, said beside the raids that exist); a boss changed or a battle joined is said there too; a clear Power Spot of another region is joined there unasked (`reportMaxShot` with `joinOnly`), or with none there yet asked Yes or No as a gym is (`elsewhereSpot`, `elsewhereQuestion`; only where that region has a forum); every other refusal is silent (review R12). `/read-screenshot` only reads. **In the board** (plan 8R-9F, design `2026-10-27-region-board-commands-design.md` item 4, B1, B2, B11, R1): the trigger reads no thread but a region's recorded board (`ScreenshotTriggerOptions.board`, the `BoardKeeper`'s `regionOfBoard`; any other post is left alone, as before). A message with attachments there goes to `ScreenshotTrigger.handle` before the keeper deletes it (`BoardKeeper.posted`'s `readShots`; `handle` answers true where it took the message): with a mention, or passively where `ocr.passive` is on, with pictures, outside rehearsal mode (anything else is the keeper's, deleted with its daily DM). `readBoard` downloads every picture first, all at once (review F3: ten at most; `ScreenshotService.fetch`, within `MAX_SCREENSHOT_BYTES`; each one use of the member's throttle), then has the message deleted (`BoardTaker.take(region, message, false)`: a moderator's message stays, Q1; no daily DM), then reads the bytes one after the other (`read` takes a `FetchedScreenshot` without downloading again; B2: reading first would leave the picture in the board for minutes) as a message of the region's channel (the wrapper gives `region.channelId` as `channelId`; react, unreact, reply and delete do nothing). Each is decided by the very functions of a mention or a passive read (`readOne`, `readMax`, `Batch.board`): one path for every fact; only the answers differ. Nothing is asked, replied or marked in the board (B11): where a mention would ask which gym or Power Spot, or about a place of another region, the words point to the command that asks privately (`RAID_UNSURE_IN_BOARD`, `MAX_UNSURE_IN_BOARD`, `elsewhereInBoard`: "<gym> is in #region: report it with `/raid screenshot:`, which asks you whether to report it there."; a raid whose gym is clear but whose tier is not, by the decision's doubts as the channel words it, `RAID_TIER_UNSURE_IN_BOARD`, "I could not tell the tier of this raid: report it with `/raid screenshot:` and choose the boss or the egg in `boss:`.", review W4), and a raid or battle made is said too (in the channel only its link line says it). The answer is one plain DM through `DmSender` (R1): its opening by what `take` answered (review F1): "From your screenshot(s) in #board (the board keeps only my lists, so I took your message out of it):" where it was deleted, "(I left your message in the board):" where a moderator wrote it (Q1), nothing about the board where the delete failed; then a line per picture (`- 2: …` where there are several), a picture not read (download, size, the reader busy, the throttle) named, whole lines within the DM's 2,000 characters and the rest counted, `…and N more` (`boardDmText`, review F6); a member whose DMs are closed hears nothing (the board shows what was made), nor does one whose message was taken just before a shutdown (review F7, accepted). A passive max screen without a countdown, left alone in a channel, is answered there (`MAX_NO_COUNTDOWN_IN_BOARD`), as the message is gone. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question and Power Spot question (`spot`); the passive reading's Yes, `yes`, its No the question's `cancel`); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
+- Three ways to report a raid from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when the boss or the gym is missing and there is no screenshot; a screenshot that cannot be read at all or is no raid screen, beside a typed boss and gym, reports what was typed with a note; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes, given back when its raid's post could not be made, the bot not allowed to make posts in the forum or the post lost while it was made (plan 8S-3; also once its gym question is answered: `PendingShot.giveBack`); a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer, that becomes the answer once answered (no private follow-up: it would point at a deleted question) and goes after two minutes; either way a report that would put the author in a forum somebody keeps them out of is refused first, as `/raid` and the map refuse it (`reportBarred` in `reportShot`, plan 8M-6): `REPORT_BARRED` in the message's reply, or as the question's answer once a gym is picked; when Discord cannot say, it is logged and answered "Discord cannot be reached just now, so nothing was reported. Try again in a moment."; a pick stops the question's own time at once (it then stays as an answer does, `ReplyKeep.answered`, also while the raid is reported); a question answered while Discord cannot say stays, its menu too, with `ASK_AGAIN` below its text and a question's time again (`askAgain`), and its gym can be picked again, unless its time was up meanwhile or somebody deleted it, and it is gone: nothing brings it back, and the author is told privately (plan 8W-3); the report itself asks once more when it would join a raid already at the gym whose forum the first check did not see (`mayJoinNoting`, below `reportBarred`, `parties-and-posts.md`); the posts of raids that exist and what made nothing are said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports and a raid that exists, said in a reply that pings the author; a clear gym of another region (Matt, 2026-10-22, as legacy Pine asked): a raid there is joined unasked as one of this region (a report that may only join, `RaidReport.joinOnly`, decided under the gym's lock: `addRaidUnlessTaken` with `mayAdd: false`, `none-there` for a free gym), and with none there yet, when the gym lies in a region of the server with a forum (else nothing is said), the reply that pings the author asks "<gym> is in <#region>. Report it there?" (`elsewhereQuestion`, written for any place, a Power Spot too) with Yes and No only the author can answer, no dialog; Yes reports it as a gym picked in the mention's question does (`answerShot`: the forum bar, the use given back, the question becoming the answer), not recorded as `picked`; No or no answer makes nothing, and the question goes as the mention's does; a message of nothing but screenshots that all made or joined raids is deleted, one with text is marked ✅). A max battle's screenshot posted with a mention or read passively goes the max way (plan 8X-S; `readMax` in `ScreenshotTrigger.readOne`, which shares the loop, the throttle, the reactions, the replies and `finished` with raids): a clear Power Spot of the message's own region is reported unasked through `reportMaxShot` (`src/commands/max/max-shot.ts`, shared with `/max screenshot:`: the forum bar `maxBarred` first, `unknown-access` while Discord cannot say; then `reportMaxShotAs`: a battle there joined, its boss changed by a newer sure screenshot, or refused, else a new battle; the screenshot kept while its post shows it; no pin, so a member blocked from meetups is not refused; the per-image `screenshot` throttle, not `/max`'s), its words (`maxShotWords`: `/max`'s where it says the same, "Changed the boss of the max battle at <spot> to <boss> from your screenshot, until <end>.", an end moved later "Its end is now <end>, from your screenshot.") in the message's reply unless a new battle was made; a refusal by the decision is said in `maxRefusalWords` (`src/render/screenshot-reading.ts`); a Power Spot not clear, or a clear one of another region, is asked about with a menu of Power Spots (`shot:<token>:spot`, `PendingShot` of kind `spot` with `withSpot`; the region's first, another region's named under it; `chooseShotSpot` → `answerSpot`, the record's `pickedSpot`), as the gym question; a Power Spot it does not know is refused "I do not know a Power Spot called "<name>" here: use `/max spot:`." and, for a name read surely on a screen with a countdown (`missingSpotName` in `max-decision.ts`: an event's picture of a boss has none; review S-1, Matt 2026-10-23), the moderators told (`ModerationReports.missingSpot`, `moderation.md`), which the refusal then says ("I have let the staff know Pine may be missing this Power Spot."). Read passively a max screen without a countdown is left alone, whatever it shows: nothing reported, said or kept (review S-1). Read passively it never asks which Power Spot nor tells the moderators (Matt, 2026-10-22): a Power Spot not clear or unknown gets the reply that pings the author, "I could not tell which Power Spot this is: use `/max screenshot:`." (`told`, said beside the raids that exist); a boss changed or a battle joined is said there too; a clear Power Spot of another region is joined there unasked (`reportMaxShot` with `joinOnly`), or with none there yet asked Yes or No as a gym is (`elsewhereSpot`, `elsewhereQuestion`; only where that region has a forum); every other refusal is silent (review R12). `/read-screenshot` only reads. **In the board** (plan 8R-9F, design `2026-10-27-region-board-commands-design.md` item 4, B1, B2, B11, R1): the trigger reads no thread but a region's recorded board (`ScreenshotTriggerOptions.board`, the `BoardKeeper`'s `regionOfBoard`; any other post is left alone, as before). A message with attachments there goes to `ScreenshotTrigger.handle` before the keeper deletes it (`BoardKeeper.posted`'s `readShots`; `handle` answers true where it took the message): with a mention, or passively where `ocr.passive` is on, with pictures, outside rehearsal mode (anything else is the keeper's, deleted with its daily DM). `readBoard` downloads every picture first, all at once (review F3: ten at most; `ScreenshotService.fetch`, within `MAX_SCREENSHOT_BYTES`; each one use of the member's throttle), then has the message deleted (`BoardTaker.take(region, message, false)`: a moderator's message stays, Q1; no daily DM), then reads the bytes one after the other (`readPanes` takes a `FetchedScreenshot` without downloading again; B2: reading first would leave the picture in the board for minutes) as a message of the region's channel (the wrapper gives `region.channelId` as `channelId`; react, unreact, reply and delete do nothing). Each is decided by the very functions of a mention or a passive read (`readOne`, `readMax`, `Batch.board`): one path for every fact; only the answers differ. Nothing is asked, replied or marked in the board (B11): where a mention would ask which gym or Power Spot, or about a place of another region, the words point to the command that asks privately (`RAID_UNSURE_IN_BOARD`, `MAX_UNSURE_IN_BOARD`, `elsewhereInBoard`: "<gym> is in #region: report it with `/raid screenshot:`, which asks you whether to report it there."; a raid whose gym is clear but whose tier is not, by the decision's doubts as the channel words it, `RAID_TIER_UNSURE_IN_BOARD`, "I could not tell the tier of this raid: report it with `/raid screenshot:` and choose the boss or the egg in `boss:`.", review W4), and a raid or battle made is said too (in the channel only its link line says it). The answer is one plain DM through `DmSender` (R1): its opening by what `take` answered (review F1): "From your screenshot(s) in #board (the board keeps only my lists, so I took your message out of it):" where it was deleted, "(I left your message in the board):" where a moderator wrote it (Q1), nothing about the board where the delete failed; then a line per picture (`- 2: …` where there are several), a split screenshot's panes (plan 7P) a line each named by its place (`- Top: …`, `- 2 (bottom): …`), as a mention reads them: each a report of its own, another pane taking a use of its own ("…so I did not read this screen…" without one), given back when refused for none of the member's doing, two screens it could not tell apart refused (`TWO_SCREENS`, the use given back) and never reported as one, a picture not read (download, size, the reader busy, the throttle) named, whole lines within the DM's 2,000 characters and the rest counted, `…and N more` (`boardDmText`, review F6); a member whose DMs are closed hears nothing (the board shows what was made), nor does one whose message was taken just before a shutdown (review F7, accepted). A passive max screen without a countdown, left alone in a channel, is answered there (`MAX_NO_COUNTDOWN_IN_BOARD`), as the message is gone. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question and Power Spot question (`spot`); the passive reading's Yes, `yes`, its No the question's `cancel`); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
 - A max battle's screenshot (plan 8X-S, review R6) is shown by `/read-screenshot` and by its "Screenshot feedback" button (`showScreenshot`, for a record with `max`) through `maxScreenshotMessage`: `maxReadingLines` (the Power Spot as read and as matched, the clock and countdown with the end it gives, the heads and the form with the tier, the boss's name as read and the boss), its doubts in small print (`maxDoubtWords`), and what a mention or `/max` would do (`maxDecisionWords`: report, ask which Power Spot, the tier not told, or the refusal in `maxRefusalWords`; `/read-screenshot` tells no moderator of a Power Spot it only shows). Its "Something is wrong" carries the argument `max` (`shot:<id>:wrong:max`, its form `shot:<id>:form:max`) and offers a max battle's elements (`MAX_FEEDBACK_ELEMENTS`: Power Spot, time, tier, boss; `spot` is in `FEEDBACK_ELEMENTS`); a button without the argument, every one made before, is a raid's (`RAID_FEEDBACK_ELEMENTS`), and a form's Submit keeps only the elements its kind offers. The refusals of `/raid` and `/max` that read a max screen carry the max row (`feedbackRow(id, true)`). `npm run ocr:review` heads the rest "raid screenshots and other pictures" and counts max battles' records apart (`reviewSummary`'s `max`: by use, decision, the max report's own doubts, and each element said wrong by where, `maxWrongAt`, but one typed beside `/max screenshot:`, as a raid's typed elements, `maxTyped`: the spot, the boss with its tier, the tier, the end as the time; review F-4); their members' corrections are listed with the raids'.
 - `/read-screenshot` and "Screenshot feedback" answer with `screenshotMessage` (`src/render/screenshot-reading.ts`, `SHOT_COLOUR`): what was read (`readingLines(…, { doubts: false })`) beside the screenshot as a thumbnail (the member's upload by its https address; the kept file as `attachment://<file>`, sent with the answer), the doubts in small print (`-# Not sure: …`), a line, the decision and the question, "All right" / "Something is wrong" (`feedbackButtons`) inside. The line that says a screenshot waits is sent as its answer will be (`WaitAs`: v2 for `/read-screenshot`, plain for `/raid`, whose answers stay plain text, as do the mention's); when `/read-screenshot` could not read the screenshot after that line, the line becomes the refusal, v2.
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index 4635974e..34636ffb 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -334,7 +334,7 @@ The first only says what it would do, line by line: which rows it would add, and
   | `!mentions`, `!auto`, `!privacy` and the like  | `/settings` (`/settings show` lists them all)           |
   | `!help`                                        | `/help`                                                 |
 
-- **Screenshots** are read when they are posted with a mention of the bot, or attached to `/raid`. The mention must be of the bot itself (picked from the list Discord shows after `@`), not of a role of the same name. A screenshot dropped in a channel without either is not read (that would need Message Content).
+- **Screenshots** are read when they are posted with a mention of the bot, or attached to `/raid`. The mention must be of the bot itself (picked from the list Discord shows after `@`), not of a role of the same name. A screenshot dropped in a channel without either is not read (that would need Message Content). A split-screen screenshot (two apps on one screen) is read pane by pane: two raids or max battles side by side, or one above the other, are reported both; a picture whose two screens cannot be told apart is refused rather than mixed. The bot keeps the whole picture for a while to improve the reader, the other half too, whatever app it shows.
 - **Settings and notifications** keep what members set before: wants, gym targets, mentions, auto-status, privacy, friend codes. They are changed through `/settings`, `/want` and `/target`. `/want` asks in a dialog what a Pokémon is wanted for (Raids, Dynamax, Gigantamax, Spawns, Research, Shadow), ticked as the member's wants are.
 - **Field research** is new: `/research report` names a PokéStop's task (up to five stops at once), "Today’s Stops" in the region's board lists the day's tasks, a task new today gets a short line in the region channel, and members who want a reward get a DM. Sponsored PokéStops, which Wayfarer does not list, are added by staff with `/pokestop add`.
 - **Team GO Rocket** is new too: `/rocket report` names who is at a PokéStop. A grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy grunt goes in "Today’s Stops" on the board until midnight (a leader or Giovanni new today with a line in the region channel). `/want` takes a grunt type (at most one DM an hour for each type), a leader, any leader, Giovanni or the decoy, and the Shadow box of a Pokémon also covers what Team GO Rocket gives.
diff --git a/docs/superpowers/ocr-improvements.md b/docs/superpowers/ocr-improvements.md
index 1d8dee80..340a4531 100644
--- a/docs/superpowers/ocr-improvements.md
+++ b/docs/superpowers/ocr-improvements.md
@@ -119,3 +119,10 @@ Before the first entry the reader was as plan 7A built it and plan 7B put on Dis
 - **Causes:** (11) The species read ("Azelf", right) was looked up only among the game master's Dynamax bosses, which lacked Azelf, though Pokebattler listed it at 5 stars; no boss was found. (12) The gym's name ran onto a second line ("Outgoing") that was read together with the caption of the picture ("AMBASSADOR PROGRAM C 0 murit Outgoing"); the picture's rule cut the line away, and "Pittsburgh Campsite -" fitted several gyms.
 - **Fix:** `max-report.ts`: a species on the boss list counts though the game master does not have it as a max boss. `raid-screen.ts`: the line under the name is kept as read (`gymBelow`); `screenshot-report.ts`: when no try of `gymOfText` is clear, its name-like words (`NAME_LIKE`) are added and tried again.
 - **Scores:** every labelled folder against its baseline: no sample from right to wrong (several from wrong to right since the baselines were written, by earlier fixes); the research samples against the committed baseline unchanged (0 and 0). The two cases are unit tests built from the records' lines.
+
+## 2026-10-27: split screens read pane by pane (plan 7P)
+
+- **Seen:** `var/ocr/matt-2026-10-26-split` (13 of Matt's Android splits, labelled per pane) and `var/ocr/fake-foldable-2026-10-26` (49 fakes of foldables: no divider, a Duo's letterboxed panes, GO beside a map, a chat or notes).
+- **Causes:** the whole picture was read as one screen, so a split's elements came from both halves (a max battle with the raid's countdown, a raid at the "gym" Dynamax Sableye), and a side-by-side split read at 720 pixels lost each half's text.
+- **Fix:** `panes.ts` and `readPicture` (design `2026-10-26-split-screen-screenshots-design.md`; `screenshots.md`, "Split screens"): Android's divider or the text cuts the picture, each pane is read as a screenshot of its own and kept only when each shows one screen or none; two screens that cannot be told apart are refused.
+- **Scores:** (2026-10-27, after the review's fixes) the splits from 0 of 13 pictures read right in both panes to every pane of the 13 read as the right kind of screen (none 3/3, kind 15/15, countdown 23/23, cp and boss 8/8; gym 6/8, heads 20/23, species and spot 14/15); with the divider search off, 10 of 13 cut by the text, the three map splits read whole as before. The 58 fakes: 53 cut (by the divider or a Duo's spine, or by the text), 2 refused as two screens, 3 read whole as before; every pane of another app (map, chat, notes) shows nothing (none 30/33: the 3 are the uncut map splits), nothing of the other app taken into a GO pane. Every labelled folder and the research samples: no sample from right to wrong; `twoScreens` fires on no picture of one screen.
diff --git a/docs/superpowers/plans/2026-10-27-phase-7p-staging.md b/docs/superpowers/plans/2026-10-27-phase-7p-staging.md
new file mode 100644
index 00000000..bbb0b3bb
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-27-phase-7p-staging.md
@@ -0,0 +1,35 @@
+# Phase 7P staging checklist: split-screen screenshots (draft)
+
+Every step needs Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab.
+
+- **Accounts:** Googer (owner, staff) and Tester (a member).
+- **Design:** `docs/superpowers/specs/2026-10-26-split-screen-screenshots-design.md` (Matt's Q1 and Q2).
+- **Conventions:** `docs/architecture/screenshots.md`, "Split screens (plan 7P)".
+- **Pictures:** Matt's splits `var/ocr/matt-2026-10-26-split/` (180–197) and two of the foldable fakes (`var/ocr/fake-foldable-2026-10-26/`, one `fold-one-raid-max`, one `fold-one-raid-chat`). The bosses of 2026-10-26 (Palkia T5, Dynamax Sableye 3★) must be on the test server's lists, or added with `/admin boss add` for the run; the gym "Historic Deutchtown Blumengarten" and the Power Spots "SMI AWARE", "Cultural District Three Rivers Park", "Bracken House", "North Shore Health Mart Pharmacy" in West (or a nickname that matches what the pictures say).
+
+No command or option changed: no deploy. No migration.
+
+## A mention
+
+1. **Two screens, top and bottom.** As Tester, post 190 (max above, raid below) in West with a mention of the bot. Both are reported: a max battle at SMI AWARE and a T5 raid of Palkia at the gym; the message goes once both are made. Each post's "Screenshot feedback" shows its own pane: the max battle's under "Top", the raid's under "Bottom", with the whole picture.
+2. **Side by side.** Post 196 (landscape, max left, raid right) with a mention: both reported, as in step 1 ("Left", "Right").
+3. **One screen beside the map.** Post 181 (map left, max right): only the max battle is reported; nothing is said of the map.
+4. **A question waits.** Post a split whose raid gym is not clear (a nickname removed for the run, or another region's gym) beside a max battle: the max battle is reported, the gym is asked; the message stays until the question is answered, then goes. A refusal in the same message counts panes ("1 of 3: …").
+5. **The throttle.** As Tester with 19 uses spent (post a picture of no raid nineteen times), post 190: the first pane is reported, the reply says "…so I did not read the other screen of one of them. Try again in …".
+6. **Two screens it cannot tell apart.** Post a picture of two screens whose panes run together (a fake with the divider removed and a line across, or a hand-made picture): "This looks like two screens in one picture, and I could not tell them apart. Send each screen on its own." No raid is made; the use is given back (step 5's count does not grow).
+
+## Passive reading (with `ocr.passive` on)
+
+7. Post 190 in West without a mention: both are reported silently, the message goes; post the picture of step 6: nothing is said.
+
+## The commands
+
+8. **`/raid screenshot:`** with 190: the raid is reported; under its answer (both stay), a private follow-up says "The max battle beside it was not reported: post the screenshot with a mention to report both." **`/max screenshot:`** with 190: the max battle is reported; the follow-up names the raid.
+9. **Two of a kind.** `/raid screenshot:` with a split of two raids (the fake `fold-one-raid-raid`): refused, "This screenshot shows two raids: post it in the channel with a mention of me to report both." (with `ocr.passive` on: "…: post it in the channel to report both."). `/max screenshot:` with 184 (two max battles): the same for two max battles.
+10. **Typed beside two screens.** `/raid screenshot:` with step 6's picture and a boss and gym typed: what was typed is reported, with "I could not read the screenshot, so I used what you typed."
+11. **`/read-screenshot`** with 190: two containers, "Top" and "Bottom", each with its own reading, decision and feedback buttons, the thumbnail the whole picture. With 181: one container, "Right". With step 6's picture: the two-screens refusal.
+
+## What is kept
+
+12. In `var/ocr/held/`, step 1's two records have `pane` (index 1 and 2, `side` top and bottom) and their files are one file twice (the same inode: `ls -li`). After "Something is wrong" on one pane, only that pane's record is copied to review.
+13. **The foldable.** Post `fold-one-raid-max` and `fold-one-raid-chat` with a mention: the first reports both; the second reports the raid only, nothing from the chat (no gym, boss, CP or countdown taken from it).
````
