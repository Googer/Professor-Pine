# Phase 8M-2F: Fix Slivers in the Region Editor: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The region editor fixes the overlaps and gaps that hand-drawn outlines leave between neighbours (spec 4.3 "How Fix works"): a stretch where two borders run within 150 m becomes one shared line (one region's border, or the midline), three regions get one shared corner, "Fix all slivers" takes the midline wherever no gym, stop or power spot changes region and asks about the rest, and the first open lists the pieces worst first.

**Architecture:** Pure `src/domain/regions/` (`fix.ts`, `fix-all.ts`, `lines.ts`) computes stretches, fixes and Fix all; the page's Web Worker runs it and answers the editor; a fix becomes ordinary staged `outline` edits (one undo step), which 8M-2's Save checks and saves like any other. The server is unchanged: 8M-2's version and coverage checks stay the authority.

**Tech Stack:** TypeScript 6.0, Leaflet with Leaflet-Geoman, `polyclip-ts` (all from 8M-2). No new package, no migration, no command change.

**Spec:** `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md` 4.3, approved by Matt 2026-10-15; split off from 8M-2 by the controller (8M-2's ledger). Ledger: `.superpowers/sdd/2026-10-16-phase-8m2f-fix-slivers/progress.md`.

**Where it runs:** in the worktree `C:\Users\<you>\IdeaProjects\Professor-Pine-wayfarer` on branch `wayfarer`, never in the main checkout.

**Every diff in this plan was run before the plan was written**, on the throwaway branch `proto-8m2f` (worktree `var/proto-8m2f`, rebased onto `wayfarer` 2149913a), one commit per task, each typechecked (root and page) with its area's tests green; on the tip the full check, the build and the database suite were green. An Opus review went through the whole prototype; its findings are folded into the commits below.

## Decisions in this plan

Rulings made while Matt was away (2026-10-16; ledger), for Matt to look at:

1. **Fixes are computed in the page** (its Web Worker) as staged edits; the server computes none and checks them as any edit.
2. **The three-region corner is proposed on the midline opposite the point where the two other regions meet**, not "in the middle of the gap" (spec): all 7 of Pittsburgh's three-region gaps are long strips (0.4–3.8 km), where the middle would sit far from where the three meet. A dragged corner must stay near the strip (within a metre of its slivers: "The corner must stay inside the sliver."); that rule does not keep land beyond the slivers from changing region (the lines to the corner, proposed or dragged, can cut across a neighbour's border): every choice draws its outlines dashed and names every place it moves, and those landings are the protection (whole-branch review, R5).
3. **Every gym, stop or power spot whose region a fix changes is named**, also outside the slivers (a midline can cut a place off); Fix all takes the midline silently only when it moves no place, and asks otherwise. Wayfarer gyms Pine did not take count as places.
4. **8M-2's rule for a "new" overlap or gap is unchanged** (90 % inside one piece that existed at load), on the page and the server alike; two old gaps a fix merges count as new and are refused. A rule over the union of old pieces would be a change to both sides at once (follow-up).
5. **No separate corner where three regions overlap:** fixing pair by pair, finding the stretches again each round, leaves no piece.
6. **Stretches are not joined across stretches where two borders coincide:** each part has its own Fix; Fix all takes them all.

Made while prototyping, to look at in staging:

1. **Pittsburgh** (28 outlines from the 2026-10-14 dump, at six decimals): 64 overlaps (4.17 km²) and 32 gaps (0.31 km²) by exact geometry (the spec's 124 and 22 came from a 20 m raster); 96 pieces in 71 stretches, all fixable, all 213 choices valid; Fix all without places 1.1 s, leaving 0 overlaps and 0 gaps (corners 1,040 → 1,380); in the worker a stretch's three choices take 220 ms median, 384 ms at most.
2. **Budget:** one Fix's choices under 1 s and Fix all under 5 s for a city like Pittsburgh; on densely traced outlines (a 10 km sliver between two 4,000-corner borders) a midline 0.05 s and 17 MB, but the three choices about 4 s, all in polyclip's coverage check (the worker keeps the page responsive).
3. Synthetic clicks in a browser give flat outlines in the editor (the cutover session's staging run of 8M-2): Matt draws the hand-drawing steps himself; if real clicks also flatten, it is a bug of 8M-2.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS, never commit in the main checkout. Never read, print or stage `.env`. Read `docs/architecture/web.md` (the region editor) and `testing.md` ("How the suites run") before starting.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment. `src/domain/` stays pure. **Tests never use the network** and use invented outlines only (never Pittsburgh's). A test that uses `vi.mock` is a `*.isolated.test.ts`; a test undoes its own fake timers, stubs and environment changes.
- Nothing from data reaches the page as HTML (texts as nodes).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8m2f`). Apply it exactly (`git apply` of the diff saved outside the repository is fine); the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck (`npm run typecheck`, which covers the page) and its own tests green. The full `npm run check`, `npm run build` and `npm run test:db` after the last task (they wait on the machine-wide suite lock).
- Never `npm install`/`npm ci`.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. **A fix never moves anything unseen:** every place whose region changes is named, for every choice, and the outlines a choice makes are drawn dashed (land beyond the slivers can change region: the landings are the protection); a dragged corner is held near the strip.
2. **A fix offered is always valid:** tidy outlines, no new overlap or gap against the regions as loaded, also after Fix all's rounds (taken back otherwise).
3. **The page never hangs:** every worker request is answered, also on an error; Fix all's answers match their questions.
4. **Densely traced outlines stay within the budget** (no search over every corner per segment; samples capped; the alignment banded).
5. **Undo:** a fix or a whole Fix all is one undo step, and Save checks it as 8M-2 checks any edit.

---

### Task 1: Region editor: the stretches of slivers that Fix takes

Prototype commit: `1b074f1defb72904e33d5ad05e4a9a361bae844b`

Pure `src/domain/regions/fix.ts` and `lines.ts`: each overlap or gap piece split into chains along the region borders it runs on; a two-region sliver, a three-region gap (all three ways of splitting its chains tried, the closest kept), or tangled; too wide unless both sides stay within 150 m; slivers of the same two regions sharing an end form one stretch. `SegmentGrid` keeps the border searches fast on densely traced outlines.

**Files:**

```
 src/domain/regions/fix.test.ts   | 214 +++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/regions/fix.ts        | 361 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/regions/lines.test.ts |  32 +++++++
 src/domain/regions/lines.ts      | 178 +++++++++++++++++++++++++++++++++++++++
 4 files changed, 785 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/regions/fix.test.ts src/domain/regions/lines.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/domain/regions/fix.test.ts src/domain/regions/fix.ts src/domain/regions/lines.test.ts src/domain/regions/lines.ts` and `npx eslint src/domain/regions/fix.test.ts src/domain/regions/fix.ts src/domain/regions/lines.test.ts src/domain/regions/lines.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 1b074f1defb72904e33d5ad05e4a9a361bae844b -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m2f-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Region editor: the stretches of slivers that Fix takes`, the paragraph above as the body and the trailer, staging exactly
  `src/domain/regions/fix.test.ts src/domain/regions/fix.ts src/domain/regions/lines.test.ts src/domain/regions/lines.ts`.

````diff
diff --git a/src/domain/regions/fix.test.ts b/src/domain/regions/fix.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1e146fef63371610fdceb3995fec958decd76058
--- /dev/null
+++ b/src/domain/regions/fix.test.ts
@@ -0,0 +1,214 @@
+import { describe, expect, it } from 'vitest';
+import type { LatLon } from '../geo/lat-lon.js';
+import { coverage, type Outlined } from './coverage.js';
+import { findStretches, type Stretches } from './fix.js';
+
+const p = (lat: number, lon: number): LatLon => ({ lat, lon });
+
+/** A closed outline of the corners given. */
+const ring = (...corners: LatLon[]): LatLon[] => [...corners, { ...corners[0]! }];
+
+/** A closed square of latitudes and longitudes. */
+const square = (south: number, west: number, north: number, east: number): LatLon[] =>
+  ring(p(south, west), p(north, west), p(north, east), p(south, east));
+
+const region = (key: string, outline: LatLon[]): Outlined => ({ key, outline });
+
+/** The stretches of the regions' own overlaps and gaps. */
+function stretchesOf(regions: Outlined[]): Stretches {
+  return findStretches(regions, coverage(regions));
+}
+
+// At 40° north a thousandth of a degree of longitude is about 85 m.
+
+/**
+ * West reaches 85 m into east at both ends of their border, and east's border bows away from
+ * west's in the middle by `bow` thousandths of a degree beyond it: an overlap, a gap, an overlap.
+ */
+function bowed(bow: number): Outlined[] {
+  return [
+    region('west', square(40, -80.1, 40.1, -79.999)),
+    region(
+      'east',
+      ring(
+        p(39.95, -80),
+        p(40.02, -80),
+        p(40.05, -79.999 + bow / 1000),
+        p(40.08, -80),
+        p(40.15, -80),
+        p(40.15, -79.9),
+        p(39.95, -79.9),
+      ),
+    ),
+  ];
+}
+
+describe('the stretches of slivers between neighbours', () => {
+  it('makes a strip where two regions overlap one stretch of the two', () => {
+    const found = stretchesOf([
+      region('west', square(40, -80.1, 40.1, -79.999)),
+      region('east', square(40, -80, 40.1, -79.9)),
+    ]);
+    expect(found.stretches).toHaveLength(1);
+    expect(found.stretches[0]?.sides).toEqual([['west'], ['east']]);
+    expect(found.stretches[0]?.slivers.map((sliver) => sliver.piece)).toEqual([0]);
+    expect(found.pieces).toEqual([{ stretch: found.stretches[0]?.id }]);
+  });
+
+  it('makes the overlaps and the gap along one border one stretch', () => {
+    const regions = bowed(1);
+    const pieces = coverage(regions);
+    expect([pieces.overlaps.length, pieces.gaps.length]).toEqual([2, 1]);
+    const found = findStretches(regions, pieces);
+    expect(found.stretches).toHaveLength(1);
+    const [stretch] = found.stretches;
+    expect(stretch?.sides).toEqual([['west'], ['east']]);
+    expect(stretch?.slivers.map((sliver) => sliver.piece).sort()).toEqual([0, 1, 2]);
+    expect(found.pieces.every((piece) => 'stretch' in piece && piece.stretch === stretch?.id)).toBe(
+      true,
+    );
+  });
+
+  it('fixes no sliver wider than the reach: the overlaps on either side are stretches apart', () => {
+    // The gap is 255 m wide at its widest.
+    const regions = bowed(3);
+    const pieces = coverage(regions);
+    expect([pieces.overlaps.length, pieces.gaps.length]).toEqual([2, 1]);
+    const found = findStretches(regions, pieces);
+    expect(found.pieces[2]).toEqual({ cannot: 'too-wide' });
+    expect(found.stretches).toHaveLength(2);
+    expect(found.stretches.map((stretch) => stretch.slivers.map((sliver) => sliver.piece))).toEqual(
+      [[0], [1]],
+    );
+  });
+
+  it('makes a gap where three regions meet one stretch of the three', () => {
+    // A strip 85 m wide between west and south (which reaches under west), closed by north.
+    const found = stretchesOf([
+      region('west', square(40, -80.1, 40.1, -80.001)),
+      region(
+        'south',
+        ring(
+          p(39.95, -80.1),
+          p(39.95, -79.9),
+          p(40.1, -79.9),
+          p(40.1, -80),
+          p(40, -80),
+          p(40, -80.1),
+        ),
+      ),
+      region('north', square(40.1, -80.1, 40.2, -79.9)),
+    ]);
+    expect(found.stretches).toHaveLength(1);
+    const [stretch] = found.stretches;
+    // Along one side runs south alone; along the other west, then north across the strip's end.
+    expect(stretch?.sides[0]).toEqual(['south']);
+    expect([...(stretch?.sides[1] ?? [])].sort()).toEqual(['north', 'west']);
+    expect(found.pieces).toEqual([{ stretch: stretch?.id }]);
+  });
+
+  it('fixes no gap that more than three regions close', () => {
+    const found = stretchesOf([
+      region('west', square(40, -80.1, 40.1, -80.001)),
+      region('east', square(40, -80, 40.1, -79.9)),
+      region('north', square(40.1, -80.1, 40.2, -79.9)),
+      region('south', square(39.9, -80.1, 40, -79.9)),
+    ]);
+    expect(found.pieces).toEqual([{ cannot: 'tangled' }]);
+    expect(found.stretches).toEqual([]);
+  });
+});
+
+/** A place `x` metres east and `y` metres north of 40° north, 80° west. */
+const metres = (x: number, y: number): LatLon => p(40 + y / 111_195, -80 + x / 85_180);
+
+/**
+ * A gap shaped like a U, 85 m wide and a kilometre deep, round a tongue of `b` 20 m wide: `a`
+ * runs round its outside and over the top of its right arm, `c` closes its left arm with a cut
+ * 300 m long. The cut's ends lie farther apart than those of any other region's part of it.
+ */
+const uShaped = (): Outlined[] => [
+  region(
+    'a',
+    ring(
+      metres(-500, -500),
+      metres(690, -500),
+      metres(690, 1500),
+      metres(105, 1500),
+      metres(105, 1000),
+      metres(190, 1000),
+      metres(190, 0),
+      metres(0, 0),
+      metres(0, 1000),
+      metres(-500, 1000),
+    ),
+  ),
+  region('b', ring(metres(85, 100), metres(105, 100), metres(105, 1500), metres(85, 1500))),
+  region(
+    'c',
+    ring(
+      metres(-500, 1000),
+      metres(0, 1000),
+      metres(85, 700),
+      metres(85, 1500),
+      metres(-500, 1500),
+    ),
+  ),
+];
+
+/** West reaches 85 m into east, whose border touches west's halfway along: two overlaps. */
+const pinched = (): Outlined[] => [
+  region('west', square(40, -80.1, 40.1, -79.999)),
+  region(
+    'east',
+    ring(
+      p(39.9, -80.2),
+      p(39.9, -79.9),
+      p(40.2, -79.9),
+      p(40.2, -80.2),
+      p(40.15, -80.2),
+      p(40.15, -80),
+      p(40.1, -80),
+      p(40.05, -79.999),
+      p(40, -80),
+      p(39.95, -80),
+      p(39.95, -80.2),
+    ),
+  ),
+];
+
+describe('slivers of awkward shapes', () => {
+  it('splits a gap of three regions into the two sides that lie closest together', () => {
+    // Its sides are the outside of the U against the tongue and the cut, not the cut against
+    // all the rest.
+    const found = stretchesOf(uShaped());
+    expect(found.stretches).toHaveLength(1);
+    expect(found.pieces).toEqual([{ stretch: found.stretches[0]?.id }]);
+    expect(found.stretches[0]?.sides.find((side) => side.length === 2)).toContain('c');
+  });
+
+  it('fixes no gap with a region inside it', () => {
+    const island = region('island', square(40.045, -79.99855, 40.055, -79.99845));
+    const found = stretchesOf([...bowed(2), island]);
+    // The two overlaps at the ends can be fixed; the gap with the island in it cannot.
+    expect(found.pieces).toEqual([
+      { stretch: found.stretches[0]?.id },
+      { stretch: found.stretches[1]?.id },
+      { cannot: 'tangled' },
+    ]);
+  });
+
+  it('fixes no overlap of a region that lies wholly inside another', () => {
+    const found = stretchesOf([
+      region('outer', square(40, -80.1, 40.1, -79.9)),
+      region('inner', square(40.04, -80.01, 40.05, -80)),
+    ]);
+    expect(found.pieces).toEqual([{ cannot: 'tangled' }]);
+  });
+
+  it('makes the two slivers on either side of where two regions touch one stretch', () => {
+    const found = stretchesOf(pinched());
+    expect(found.stretches).toHaveLength(1);
+    expect(found.stretches[0]?.slivers).toHaveLength(2);
+  });
+});
diff --git a/src/domain/regions/fix.ts b/src/domain/regions/fix.ts
new file mode 100644
index 0000000000000000000000000000000000000000..db27697426285ca7a960032ba43640afe682398f
--- /dev/null
+++ b/src/domain/regions/fix.ts
@@ -0,0 +1,361 @@
+import { boxOf, grownBox, inBox, type Box } from '../geo/region-membership.js';
+import type { LatLon } from '../geo/lat-lon.js';
+import type { Coverage, Outlined, Piece } from './coverage.js';
+import { between, Flat, SegmentGrid } from './lines.js';
+
+/**
+ * Fix in the region editor (spec 4.3 "How Fix works", plan 8M-2F): where two neighbours'
+ * borders run within `FIX_REACH_METRES` of each other, the overlaps and gaps between them (8M-2's
+ * pieces) are slivers of drawing, and become one shared line. Pure: the page works it out in its
+ * worker, and a fix becomes ordinary staged edits.
+ *
+ * A piece's outer ring runs along the borders of the regions around it, part by part (chains).
+ * An overlap of two regions is bounded by the two; a gap between two by the two, and a gap where
+ * three meet by three. Such a piece is a sliver: it has two sides that meet at its two ends, one
+ * region's border along each side, or along one side one region and along the other two, which
+ * meet somewhere along it. Slivers of the same two regions that meet end to end are one stretch:
+ * one Fix takes them all.
+ */
+
+/** How far apart two borders may run for the slivers between them to be fixed, in metres. */
+export const FIX_REACH_METRES = 150;
+/** How near a border a place must lie to be on it, in metres (polyclip's arithmetic). */
+const ON_BORDER_METRES = 0.01;
+/** How finely a side is sampled when the width of a sliver is measured, in metres. */
+const SAMPLE_METRES = 20;
+
+/** A part of a sliver's side that runs along one region's border, from its start to its end. */
+export interface Chain {
+  key: string;
+  points: LatLon[];
+}
+
+/**
+ * A piece between borders: its index among the pieces (the overlaps, then the gaps), its two
+ * ends, and its two sides, each from the first end to the second as the chains along it (one,
+ * or two that meet where two regions meet along that side).
+ */
+export interface Sliver {
+  piece: number;
+  ends: [LatLon, LatLon];
+  sides: [Chain[], Chain[]];
+}
+
+/**
+ * Slivers fixed together: the regions along each side (one on each, or one and two where three
+ * meet), and the slivers, each with its sides in that order. Its id is unique among the
+ * stretches found at once.
+ */
+export interface Stretch {
+  id: string;
+  sides: [string[], string[]];
+  slivers: Sliver[];
+}
+
+/**
+ * Whether a piece can be fixed: the stretch it is in, or why not. `too-wide`: its sides lie
+ * farther apart than the reach somewhere (shown, not fixed); `tangled`: it is not bounded by two
+ * sides of at most three regions (a gap that more regions close, a piece with holes, borders
+ * that touch along it).
+ */
+export type PieceFix = { stretch: string } | { cannot: 'too-wide' | 'tangled' };
+
+/** The stretches of a server's overlaps and gaps, and what can be done for each piece. */
+export interface Stretches {
+  stretches: Stretch[];
+  /** By the index of a piece: the overlaps, then the gaps, as `coverage` gives them. */
+  pieces: PieceFix[];
+}
+
+/** A side of a sliver as one line, from its first end to its second. */
+export function sideLine(side: readonly Chain[]): LatLon[] {
+  const line: LatLon[] = [];
+  for (const chain of side)
+    line.push(...(line.length === 0 ? chain.points : chain.points.slice(1)));
+  return line;
+}
+
+const reversed = (chain: Chain): Chain => ({ key: chain.key, points: [...chain.points].reverse() });
+
+/** A part of a piece's ring, along the border of `key`. */
+interface Segment {
+  a: LatLon;
+  b: LatLon;
+  keys: string[];
+}
+
+/**
+ * The parts of a ring each along one border. A part along two borders at once (where the two run
+ * together) is split at the middle of the run of such parts between the chains on either side:
+ * each takes its half.
+ */
+function chainsOf(segments: Segment[], flat: Flat): Chain[] | undefined {
+  const n = segments.length;
+  const sure = segments.findIndex((segment) => segment.keys.length === 1);
+  if (sure < 0) return undefined;
+  // Rotated to begin at a part along one border, so that runs of shared parts never wrap.
+  const turned = [...segments.slice(sure), ...segments.slice(0, sure)];
+  const keyed: { a: LatLon; b: LatLon; key: string }[] = [];
+  for (let i = 0; i < n;) {
+    const segment = turned[i]!;
+    if (segment.keys.length === 1) {
+      keyed.push({ a: segment.a, b: segment.b, key: segment.keys[0]! });
+      i++;
+      continue;
+    }
+    let end = i;
+    while (end < n && turned[end]!.keys.length !== 1) end++;
+    const run = turned.slice(i, end);
+    const before = keyed[keyed.length - 1]!.key;
+    const after = end < n ? turned[end]!.keys[0]! : turned[0]!.keys[0]!;
+    if (before === after) {
+      for (const part of run) keyed.push({ a: part.a, b: part.b, key: before });
+    } else {
+      // Split at half its length: the first half goes with the chain before, the rest after.
+      const half = run.reduce((sum, part) => sum + flat.distance(part.a, part.b), 0) / 2;
+      let travelled = 0;
+      for (const part of run) {
+        const length = flat.distance(part.a, part.b);
+        if (travelled + length <= half) keyed.push({ a: part.a, b: part.b, key: before });
+        else if (travelled >= half) keyed.push({ a: part.a, b: part.b, key: after });
+        else {
+          const middle = between(part.a, part.b, (half - travelled) / length);
+          keyed.push({ a: part.a, b: middle, key: before }, { a: middle, b: part.b, key: after });
+        }
+        travelled += length;
+      }
+    }
+    i = end;
+  }
+  const first = keyed.findIndex(
+    (part, i) => part.key !== keyed[(i + keyed.length - 1) % keyed.length]!.key,
+  );
+  if (first < 0) return undefined;
+  const chains: Chain[] = [];
+  for (let k = 0; k < keyed.length; k++) {
+    const part = keyed[(first + k) % keyed.length]!;
+    const last = chains[chains.length - 1];
+    if (last?.key === part.key) last.points.push(part.b);
+    else chains.push({ key: part.key, points: [part.a, part.b] });
+  }
+  return chains;
+}
+
+/**
+ * The regions a piece could be bounded by, with their outlines and boxes, and the sides of the
+ * outline filed in a grid once a piece asks (`gridOf`).
+ */
+interface Around {
+  key: string;
+  outline: readonly LatLon[];
+  box: Box;
+  grid?: SegmentGrid;
+}
+
+/** The cells of an outline's grid: about its sides' length, within these bounds, in metres. */
+const OUTLINE_CELL = { least: 10, most: 2_000 };
+
+/** The sides of a region's outline in a grid (made once, when a piece first asks). */
+function gridOf(one: Around, flat: Flat): SegmentGrid {
+  if (!one.grid) {
+    const sides = Math.max(1, one.outline.length - 1);
+    const cell = Math.min(
+      OUTLINE_CELL.most,
+      Math.max(OUTLINE_CELL.least, flat.length(one.outline) / sides),
+    );
+    one.grid = new SegmentGrid(one.outline, flat, cell);
+  }
+  return one.grid;
+}
+
+/**
+ * How far a place of the line `from` lies from the line `to` at most (its corners and places
+ * every `SAMPLE_METRES`), in metres; `Infinity` when one lies beyond the reach.
+ */
+function strays(from: readonly LatLon[], to: readonly LatLon[], flat: Flat): number {
+  const grid = new SegmentGrid(to, flat, FIX_REACH_METRES / 3);
+  let farthest = 0;
+  for (const point of flat.samples(from, SAMPLE_METRES)) {
+    const distance = grid.distance(point, FIX_REACH_METRES);
+    if (distance === Infinity) return Infinity;
+    if (distance > farthest) farthest = distance;
+  }
+  return farthest;
+}
+
+/**
+ * How far apart a sliver's two sides lie at most, either way, in metres; `Infinity` beyond the
+ * reach (`FIX_REACH_METRES`).
+ */
+function widthOf(sides: Sliver['sides'], flat: Flat): number {
+  const [one, other] = sides.map(sideLine) as [LatLon[], LatLon[]];
+  const there = strays(one, other, flat);
+  return there === Infinity ? Infinity : Math.max(there, strays(other, one, flat));
+}
+
+/** Widths this close are the same, in metres, when the sides of a gap of three are chosen. */
+const SAME_WIDTH_METRES = 1;
+
+/**
+ * A piece as a sliver of two or three regions, with its width (`widthOf`), or undefined when it
+ * is none.
+ */
+function sliverOf(
+  index: number,
+  piece: Piece,
+  around: readonly Around[],
+): { sliver: Sliver; width: number } | undefined {
+  const [outer, ...holes] = piece.rings;
+  if (!outer || holes.length > 0) return undefined;
+  const corners = outer.slice(0, -1);
+  const flat = new Flat(corners[0]?.lat ?? 0);
+  const segments: Segment[] = corners.map((a, i) => {
+    const b = corners[(i + 1) % corners.length]!;
+    const middle = between(a, b, 0.5);
+    const keys = around
+      .filter(
+        (one) =>
+          inBox(one.box, middle) &&
+          gridOf(one, flat).distance(middle, ON_BORDER_METRES) <= ON_BORDER_METRES,
+      )
+      .map((one) => one.key);
+    return { a, b, keys };
+  });
+  if (segments.some((segment) => segment.keys.length === 0)) return undefined;
+  const chains = chainsOf(segments, flat);
+  if (!chains || new Set(chains.map((chain) => chain.key)).size !== chains.length) return undefined;
+  if (chains.length === 2) {
+    const [one, other] = chains as [Chain, Chain];
+    const sides: Sliver['sides'] = [[one], [reversed(other)]];
+    return {
+      sliver: { piece: index, ends: [one.points[0]!, other.points[0]!], sides },
+      width: widthOf(sides, flat),
+    };
+  }
+  if (chains.length !== 3) return undefined;
+  // One chain is one side, the other two (turned round) the other, which meet along it: of the
+  // three ways, the one whose sides lie closest together (a U-shaped gap is not its cut across
+  // one arm against all the rest); among ways as close, the one whose ends lie farthest apart.
+  const reach = (chain: Chain): number =>
+    flat.distance(chain.points[0]!, chain.points[chain.points.length - 1]!);
+  const ways = [0, 1, 2].map((i) => {
+    const single = chains[i]!;
+    const sides: Sliver['sides'] = [
+      [single],
+      [reversed(chains[(i + 2) % 3]!), reversed(chains[(i + 1) % 3]!)],
+    ];
+    const sliver: Sliver = {
+      piece: index,
+      ends: [single.points[0]!, single.points[single.points.length - 1]!],
+      sides,
+    };
+    return { sliver, width: widthOf(sides, flat), reach: reach(single) };
+  });
+  const narrowest = Math.min(...ways.map((way) => way.width));
+  const best = ways
+    .filter((way) => narrowest === Infinity || way.width <= narrowest + SAME_WIDTH_METRES)
+    .reduce((one, other) => (other.reach > one.reach ? other : one));
+  return { sliver: best.sliver, width: best.width };
+}
+
+/** A sliver with its sides in the order of the regions' keys given. */
+function ordered(sliver: Sliver, keys: readonly string[]): Sliver {
+  if (sliver.sides[0][0]?.key === keys[0]) return sliver;
+  return { ...sliver, sides: [sliver.sides[1], sliver.sides[0]] };
+}
+
+/** Whether two places are one, as polyclip computes the same crossing for two pieces. */
+const same = (a: LatLon, b: LatLon): boolean => new Flat(a.lat).distance(a, b) <= ON_BORDER_METRES;
+
+/**
+ * The stretches of the overlaps and gaps found (`coverage` of these regions): each piece that is
+ * a sliver within the reach, with the slivers of the same two regions that meet it end to end;
+ * a gap where three regions meet is a stretch of its own.
+ */
+export function findStretches(regions: readonly Outlined[], found: Coverage): Stretches {
+  const order = new Map(regions.map((region, i) => [region.key, i]));
+  const around: Around[] = regions
+    .filter((region) => region.outline.length >= 4)
+    .map((region) => ({
+      key: region.key,
+      outline: region.outline,
+      box: grownBox(boxOf(region.outline), 1),
+    }));
+  const pieces: { piece: Piece; around: Around[] }[] = [
+    ...found.overlaps.map((piece) => ({
+      piece,
+      around: around.filter((one) => piece.between.includes(one.key)),
+    })),
+    ...found.gaps.map((piece) => ({
+      piece,
+      around: around.filter((one) => {
+        const box = piece.box;
+        return (
+          box.south <= one.box.north &&
+          one.box.south <= box.north &&
+          box.west <= one.box.east &&
+          one.box.west <= box.east
+        );
+      }),
+    })),
+  ];
+  const fixes: PieceFix[] = [];
+  const slivers: Sliver[] = [];
+  pieces.forEach(({ piece, around: near }, index) => {
+    const measured = sliverOf(index, piece, near);
+    if (!measured) {
+      fixes.push({ cannot: 'tangled' });
+    } else if (measured.width > FIX_REACH_METRES) {
+      fixes.push({ cannot: 'too-wide' });
+    } else {
+      fixes.push({ stretch: '' });
+      slivers.push(measured.sliver);
+    }
+  });
+
+  const stretches: Stretch[] = [];
+  const pairs = new Map<string, Sliver[]>();
+  for (const sliver of slivers) {
+    const keys = sliver.sides.flat().map((chain) => chain.key);
+    if (keys.length === 3) {
+      stretches.push({
+        id: `${keys.join('/')}#${sliver.piece}`,
+        sides: [[keys[0]!], [keys[1]!, keys[2]!]],
+        slivers: [sliver],
+      });
+      continue;
+    }
+    const pair = [...keys].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
+    const name = pair.join('/');
+    pairs.set(name, [...(pairs.get(name) ?? []), ordered(sliver, pair)]);
+  }
+  for (const [name, group] of pairs) {
+    // Slivers that meet end to end, and those that meet them, and so on, are one stretch.
+    const taken = group.map(() => false);
+    for (let i = 0; i < group.length; i++) {
+      if (taken[i]) continue;
+      taken[i] = true;
+      const members = [group[i]!];
+      for (let k = 0; k < members.length; k++) {
+        const ends = members[k]!.ends;
+        group.forEach((other, j) => {
+          if (taken[j] || !other.ends.some((end) => ends.some((mine) => same(end, mine)))) return;
+          taken[j] = true;
+          members.push(other);
+        });
+      }
+      members.sort((a, b) => a.piece - b.piece);
+      const keys = name.split('/');
+      stretches.push({
+        id: `${name}#${members[0]!.piece}`,
+        sides: [[keys[0]!], [keys[1]!]],
+        slivers: members,
+      });
+    }
+  }
+  stretches.sort((a, b) => a.slivers[0]!.piece - b.slivers[0]!.piece);
+  for (const stretch of stretches) {
+    for (const sliver of stretch.slivers) fixes[sliver.piece] = { stretch: stretch.id };
+  }
+  return { stretches, pieces: fixes };
+}
diff --git a/src/domain/regions/lines.test.ts b/src/domain/regions/lines.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2e01d69dcb2d00d969d59b0054a55bea9a50cfa9
--- /dev/null
+++ b/src/domain/regions/lines.test.ts
@@ -0,0 +1,32 @@
+import { describe, expect, it } from 'vitest';
+import type { LatLon } from '../geo/lat-lon.js';
+import { Flat, SegmentGrid } from './lines.js';
+
+/** A generator of numbers in [0, 1) from a seed, the same every run. */
+function seeded(seed: number): () => number {
+  let state = seed;
+  return () => {
+    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
+    return state / 2_147_483_648;
+  };
+}
+
+describe('the sides of a line filed in a grid', () => {
+  it('finds the nearest side within the distance asked, as going through every side does', () => {
+    const random = seeded(7);
+    // A line of 400 corners wandering east over about 4 km, a few metres apart up and down.
+    const line: LatLon[] = Array.from({ length: 400 }, (_unused, i) => ({
+      lat: 40 + (random() - 0.5) * 0.0004,
+      lon: -80 + i * 0.0001 + (random() - 0.5) * 0.00005,
+    }));
+    const flat = new Flat(40);
+    const grid = new SegmentGrid(line, flat, 25);
+    for (let k = 0; k < 500; k++) {
+      const point = { lat: 40 + (random() - 0.5) * 0.004, lon: -80.001 + random() * 0.042 };
+      const nearest = flat.nearest(line, point).distance;
+      const found = grid.distance(point, 150);
+      if (nearest <= 150) expect(found).toBeCloseTo(nearest, 9);
+      else expect(found).toBe(Infinity);
+    }
+  });
+});
diff --git a/src/domain/regions/lines.ts b/src/domain/regions/lines.ts
new file mode 100644
index 0000000000000000000000000000000000000000..24640346908c3b160fd3cfae658ea4c2885c1a93
--- /dev/null
+++ b/src/domain/regions/lines.ts
@@ -0,0 +1,178 @@
+import type { LatLon } from '../geo/lat-lon.js';
+
+/**
+ * Lines of places measured flat, in metres (for the region editor's Fix, plan 8M-2F): at the
+ * size of a sliver (a few kilometres long, metres to a few hundred metres wide) the earth is
+ * flat enough, measured at one latitude.
+ */
+
+/** The metres of a degree of latitude on a sphere of the earth's mean radius. */
+const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;
+
+/** Places as flat metres east and north of a latitude's scale. */
+export class Flat {
+  private readonly perLon: number;
+
+  constructor(lat: number) {
+    this.perLon = METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
+  }
+
+  /** How far apart two places are, in metres. */
+  distance(a: LatLon, b: LatLon): number {
+    return Math.hypot((b.lon - a.lon) * this.perLon, (b.lat - a.lat) * METRES_PER_DEGREE);
+  }
+
+  /**
+   * Where on the segment a-b a place is nearest: how far along it (0 at a, 1 at b) and how far
+   * from it, in metres.
+   */
+  onSegment(point: LatLon, a: LatLon, b: LatLon): { t: number; distance: number } {
+    const dx = (b.lon - a.lon) * this.perLon;
+    const dy = (b.lat - a.lat) * METRES_PER_DEGREE;
+    const px = (point.lon - a.lon) * this.perLon;
+    const py = (point.lat - a.lat) * METRES_PER_DEGREE;
+    const length = dx * dx + dy * dy;
+    const t = length === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / length));
+    return { t, distance: Math.hypot(px - t * dx, py - t * dy) };
+  }
+
+  /** How long a line is, in metres. */
+  length(line: readonly LatLon[]): number {
+    let metres = 0;
+    for (let i = 1; i < line.length; i++) metres += this.distance(line[i - 1]!, line[i]!);
+    return metres;
+  }
+
+  /**
+   * Where on a line a place is nearest: how far along the line (metres from its start), the
+   * place there, and how far from it.
+   */
+  nearest(line: readonly LatLon[], point: LatLon): { along: number; at: LatLon; distance: number } {
+    let best = { along: 0, at: line[0] ?? point, distance: Infinity };
+    let travelled = 0;
+    for (let i = 1; i < line.length; i++) {
+      const a = line[i - 1]!;
+      const b = line[i]!;
+      const side = this.distance(a, b);
+      const { t, distance } = this.onSegment(point, a, b);
+      if (distance < best.distance) {
+        best = { along: travelled + t * side, at: between(a, b, t), distance };
+      }
+      travelled += side;
+    }
+    return best;
+  }
+
+  /** The place a distance along a line (metres from its start; its ends beyond it). */
+  at(line: readonly LatLon[], along: number): LatLon {
+    let travelled = 0;
+    for (let i = 1; i < line.length; i++) {
+      const a = line[i - 1]!;
+      const b = line[i]!;
+      const side = this.distance(a, b);
+      if (travelled + side >= along)
+        return between(a, b, side === 0 ? 0 : (along - travelled) / side);
+      travelled += side;
+    }
+    return line[line.length - 1] ?? { lat: 0, lon: 0 };
+  }
+
+  /** The line's corners, and places between them at most `step` metres apart. */
+  samples(line: readonly LatLon[], step: number): LatLon[] {
+    const found: LatLon[] = [];
+    for (let i = 1; i < line.length; i++) {
+      const a = line[i - 1]!;
+      const b = line[i]!;
+      const parts = Math.max(1, Math.ceil(this.distance(a, b) / step));
+      for (let k = 0; k < parts; k++) found.push(between(a, b, k / parts));
+    }
+    const last = line[line.length - 1];
+    if (last) found.push(last);
+    return found;
+  }
+
+  /** A place as metres east of the meridian and north of the equator, at this scale. */
+  metres(point: LatLon): { x: number; y: number } {
+    return { x: point.lon * this.perLon, y: point.lat * METRES_PER_DEGREE };
+  }
+}
+
+/** A line of at most this many corners is searched side by side, without cells. */
+const UNFILED_CORNERS = 64;
+
+/**
+ * The sides of a line (each from a corner to the next) filed in square cells of `cell` metres,
+ * so that the sides near a place are found without going through all of them: a border traced
+ * along a township line has thousands of corners. A short line is not filed.
+ */
+export class SegmentGrid {
+  private readonly cells: Map<number, number[]> | undefined;
+
+  constructor(
+    private readonly line: readonly LatLon[],
+    private readonly flat: Flat,
+    private readonly cell: number,
+  ) {
+    if (line.length <= UNFILED_CORNERS) return;
+    this.cells = new Map();
+    for (let i = 1; i < line.length; i++) {
+      const a = flat.metres(line[i - 1]!);
+      const b = flat.metres(line[i]!);
+      // Filed in the cells of places along it half a cell apart: every place of the side lies
+      // within a quarter of a cell of one of them, so in that one's cell or the next.
+      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell / 2)));
+      const filed = new Set<number>();
+      for (let k = 0; k <= steps; k++) {
+        const cx = Math.floor((a.x + ((b.x - a.x) * k) / steps) / cell);
+        const cy = Math.floor((a.y + ((b.y - a.y) * k) / steps) / cell);
+        filed.add(cellKey(cx, cy));
+      }
+      for (const one of filed) {
+        const sides = this.cells.get(one);
+        if (sides) sides.push(i - 1);
+        else this.cells.set(one, [i - 1]);
+      }
+    }
+  }
+
+  /**
+   * How far a place lies from the nearest side of the line, in metres, when that is at most
+   * `within`; `Infinity` when no side lies that near. The cells are searched in rings round the
+   * place's: a side `d` metres away is filed at most `d / cell + 1` rings out (rounded up), so
+   * once a side is found within `(ring - 1) × cell` none nearer is left.
+   */
+  distance(point: LatLon, within: number): number {
+    if (!this.cells) {
+      const { distance } = this.flat.nearest(this.line, point);
+      return distance <= within ? distance : Infinity;
+    }
+    const { x, y } = this.flat.metres(point);
+    const cx = Math.floor(x / this.cell);
+    const cy = Math.floor(y / this.cell);
+    const rings = Math.ceil(within / this.cell) + 1;
+    let nearest = Infinity;
+    for (let ring = 0; ring <= rings; ring++) {
+      for (let dx = -ring; dx <= ring; dx++) {
+        // The cells of this ring only: its top and bottom rows whole, of the others both ends.
+        const edge = dx === -ring || dx === ring;
+        for (let dy = -ring; dy <= ring; dy += edge || ring === 0 ? 1 : 2 * ring) {
+          for (const i of this.cells.get(cellKey(cx + dx, cy + dy)) ?? []) {
+            const { distance } = this.flat.onSegment(point, this.line[i]!, this.line[i + 1]!);
+            if (distance < nearest) nearest = distance;
+          }
+        }
+      }
+      if (nearest <= (ring - 1) * this.cell) break;
+    }
+    return nearest <= within ? nearest : Infinity;
+  }
+}
+
+/** A cell of a grid as one number (for cells of a metre or more, a row is below 2·10⁷). */
+const cellKey = (cx: number, cy: number): number => cx * 100_000_000 + cy;
+
+/** The place a share `t` of the way from a to b. */
+export const between = (a: LatLon, b: LatLon, t: number): LatLon => ({
+  lat: a.lat + (b.lat - a.lat) * t,
+  lon: a.lon + (b.lon - a.lon) * t,
+});
````

### Task 2: Region editor: one Fix rebuilds the outlines along a shared line

Prototype commit: `6fab081d2aa3027802423b5b55f947ee8ed649d6`

`fixStretch`: a region's border or the midline (each side resampled evenly to at most 1,500 points, paired by dynamic time warping in a band, simplified to 1 m) replaces both regions' chains, whichever way their rings run; folds removed; the three-region corner proposed on the midline opposite the two regions' meeting point, a dragged corner held near the strip (`corner-outside`; land beyond the slivers that a choice moves is named in its landings); refused when an outline would cross itself or have too many corners, or when a new overlap or gap would appear.

**Files:**

```
 src/domain/regions/fix.test.ts   | 257 +++++++++++++++++++++++++++++++++++++++++++++-----
 src/domain/regions/fix.ts        | 401 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/domain/regions/lines.test.ts |  26 ++++++
 src/domain/regions/lines.ts      |  63 +++++++++++++
 4 files changed, 722 insertions(+), 25 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/regions/fix.test.ts src/domain/regions/lines.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/domain/regions/fix.test.ts src/domain/regions/fix.ts src/domain/regions/lines.test.ts src/domain/regions/lines.ts` and `npx eslint src/domain/regions/fix.test.ts src/domain/regions/fix.ts src/domain/regions/lines.test.ts src/domain/regions/lines.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 6fab081d2aa3027802423b5b55f947ee8ed649d6 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m2f-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Region editor: one Fix rebuilds the outlines along a shared line`, the paragraph above as the body and the trailer, staging exactly
  `src/domain/regions/fix.test.ts src/domain/regions/fix.ts src/domain/regions/lines.test.ts src/domain/regions/lines.ts`.

````diff
diff --git a/src/domain/regions/fix.test.ts b/src/domain/regions/fix.test.ts
index 1e146fef63371610fdceb3995fec958decd76058..8225f49dd17931a91cb1a9fd33eb8a8230ac8461 100644
--- a/src/domain/regions/fix.test.ts
+++ b/src/domain/regions/fix.test.ts
@@ -1,7 +1,15 @@
 import { describe, expect, it } from 'vitest';
 import type { LatLon } from '../geo/lat-lon.js';
+import { boxOf } from '../geo/region-membership.js';
 import { coverage, type Outlined } from './coverage.js';
-import { findStretches, type Stretches } from './fix.js';
+import {
+  findStretches,
+  fixStretch,
+  proposedCorner,
+  type FixOutcome,
+  type Stretch,
+  type Stretches,
+} from './fix.js';
 
 const p = (lat: number, lon: number): LatLon => ({ lat, lon });
 
@@ -15,12 +23,41 @@ const square = (south: number, west: number, north: number, east: number): LatLo
 const region = (key: string, outline: LatLon[]): Outlined => ({ key, outline });
 
 /** The stretches of the regions' own overlaps and gaps. */
-function stretchesOf(regions: Outlined[]): Stretches {
+function stretchesOf(regions: readonly Outlined[]): Stretches {
   return findStretches(regions, coverage(regions));
 }
 
+/** The one stretch of the regions' overlaps and gaps. */
+function onlyStretch(regions: readonly Outlined[]): Stretch {
+  const { stretches } = stretchesOf(regions);
+  expect(stretches).toHaveLength(1);
+  return stretches[0]!;
+}
+
+/** The regions with the outlines a fix rebuilt. */
+function fixed(regions: readonly Outlined[], outcome: FixOutcome): Outlined[] {
+  if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
+  const made = new Map(outcome.outlines.map((one) => [one.key, one.outline]));
+  return regions.map((one) => ({ key: one.key, outline: made.get(one.key) ?? one.outline }));
+}
+
+/** How many overlaps and gaps the regions have. */
+function piecesOf(regions: readonly Outlined[]): number {
+  const found = coverage(regions);
+  return found.overlaps.length + found.gaps.length;
+}
+
+const outlineOf = (regions: readonly Outlined[], key: string): readonly LatLon[] =>
+  regions.find((one) => one.key === key)!.outline;
+
 // At 40° north a thousandth of a degree of longitude is about 85 m.
 
+/** West reaches 85 m into east all along their border. */
+const strip = (): Outlined[] => [
+  region('west', square(40, -80.1, 40.1, -79.999)),
+  region('east', square(40, -80, 40.1, -79.9)),
+];
+
 /**
  * West reaches 85 m into east at both ends of their border, and east's border bows away from
  * west's in the middle by `bow` thousandths of a degree beyond it: an overlap, a gap, an overlap.
@@ -43,12 +80,19 @@ function bowed(bow: number): Outlined[] {
   ];
 }
 
+/** A strip 85 m wide between west and south (which reaches under west), closed by north. */
+const junction = (): Outlined[] => [
+  region('west', square(40, -80.1, 40.1, -80.001)),
+  region(
+    'south',
+    ring(p(39.95, -80.1), p(39.95, -79.9), p(40.1, -79.9), p(40.1, -80), p(40, -80), p(40, -80.1)),
+  ),
+  region('north', square(40.1, -80.1, 40.2, -79.9)),
+];
+
 describe('the stretches of slivers between neighbours', () => {
   it('makes a strip where two regions overlap one stretch of the two', () => {
-    const found = stretchesOf([
-      region('west', square(40, -80.1, 40.1, -79.999)),
-      region('east', square(40, -80, 40.1, -79.9)),
-    ]);
+    const found = stretchesOf(strip());
     expect(found.stretches).toHaveLength(1);
     expect(found.stretches[0]?.sides).toEqual([['west'], ['east']]);
     expect(found.stretches[0]?.slivers.map((sliver) => sliver.piece)).toEqual([0]);
@@ -83,22 +127,7 @@ describe('the stretches of slivers between neighbours', () => {
   });
 
   it('makes a gap where three regions meet one stretch of the three', () => {
-    // A strip 85 m wide between west and south (which reaches under west), closed by north.
-    const found = stretchesOf([
-      region('west', square(40, -80.1, 40.1, -80.001)),
-      region(
-        'south',
-        ring(
-          p(39.95, -80.1),
-          p(39.95, -79.9),
-          p(40.1, -79.9),
-          p(40.1, -80),
-          p(40, -80),
-          p(40, -80.1),
-        ),
-      ),
-      region('north', square(40.1, -80.1, 40.2, -79.9)),
-    ]);
+    const found = stretchesOf(junction());
     expect(found.stretches).toHaveLength(1);
     const [stretch] = found.stretches;
     // Along one side runs south alone; along the other west, then north across the strip's end.
@@ -212,3 +241,187 @@ describe('slivers of awkward shapes', () => {
     expect(found.stretches[0]?.slivers).toHaveLength(2);
   });
 });
+
+describe('one fix', () => {
+  it('makes the midline of a strip both regions’ border, and leaves no sliver', () => {
+    const regions = strip();
+    const after = fixed(regions, fixStretch(regions, onlyStretch(regions), 'midline'));
+    expect(piecesOf(after)).toBe(0);
+    expect(boxOf(outlineOf(after, 'west')).east).toBeCloseTo(-79.9995, 6);
+    expect(boxOf(outlineOf(after, 'east')).west).toBeCloseTo(-79.9995, 6);
+  });
+
+  it('gives the other region the border of the region picked', () => {
+    const regions = strip();
+    const stretch = onlyStretch(regions);
+    const westBorder = fixStretch(regions, stretch, 0);
+    expect(westBorder).toMatchObject({ ok: true, outlines: [{ key: 'east' }] });
+    const afterWest = fixed(regions, westBorder);
+    expect(piecesOf(afterWest)).toBe(0);
+    expect(boxOf(outlineOf(afterWest, 'east')).west).toBeCloseTo(-79.999, 6);
+    const afterEast = fixed(regions, fixStretch(regions, stretch, 1));
+    expect(piecesOf(afterEast)).toBe(0);
+    expect(boxOf(outlineOf(afterEast, 'west')).east).toBeCloseTo(-80, 6);
+  });
+
+  it('removes every sliver of a stretch, overlaps and gap alike, with one fix', () => {
+    const regions = bowed(1);
+    const stretch = onlyStretch(regions);
+    for (const choice of ['midline', 0, 1] as const) {
+      expect(piecesOf(fixed(regions, fixStretch(regions, stretch, choice)))).toBe(0);
+    }
+  });
+
+  it('gives three regions one corner where they meet, proposed in the middle of the strip’s end', () => {
+    const regions = junction();
+    const stretch = onlyStretch(regions);
+    const corner = proposedCorner(stretch);
+    expect(corner?.lat).toBeCloseTo(40.1, 3);
+    expect(corner?.lon).toBeCloseTo(-80.0005, 4);
+    const after = fixed(regions, fixStretch(regions, stretch, 'midline'));
+    expect(piecesOf(after)).toBe(0);
+    for (const key of ['west', 'south', 'north']) {
+      expect(outlineOf(after, key)).toContainEqual(corner);
+    }
+  });
+
+  it('takes the corner where it was dragged', () => {
+    const regions = junction();
+    const moved = p(40.09, -80.0003);
+    const after = fixed(
+      regions,
+      fixStretch(regions, onlyStretch(regions), 'midline', { corner: moved }),
+    );
+    expect(piecesOf(after)).toBe(0);
+    for (const key of ['west', 'south', 'north']) {
+      expect(outlineOf(after, key)).toContainEqual(moved);
+    }
+  });
+
+  it('fixes a junction along either side’s borders too', () => {
+    const regions = junction();
+    const stretch = onlyStretch(regions);
+    expect(piecesOf(fixed(regions, fixStretch(regions, stretch, 0)))).toBe(0);
+    expect(piecesOf(fixed(regions, fixStretch(regions, stretch, 1)))).toBe(0);
+  });
+
+  it('refuses a corner dragged out of the sliver, which would move land beyond it', () => {
+    const regions = junction();
+    const stretch = onlyStretch(regions);
+    // Into south, 400 m east of the strip.
+    expect(fixStretch(regions, stretch, 'midline', { corner: p(40.05, -79.995) })).toEqual({
+      ok: false,
+      reason: 'corner-outside',
+    });
+    // Within a metre of the strip's edge is in it.
+    expect(fixStretch(regions, stretch, 'midline', { corner: p(40.05, -80.001005) })).toMatchObject(
+      { ok: true },
+    );
+    // The corner is the midline's: the borders do not take it.
+    expect(fixStretch(regions, stretch, 0, { corner: p(40.05, -79.995) })).toMatchObject({
+      ok: true,
+    });
+  });
+
+  it('refuses an outline of more than 5,000 corners', () => {
+    // West has 5,000 corners, so the bend of the midline takes it over the limit.
+    const far = Array.from({ length: 4_996 }, (_unused, i) => p(40.1 - (i + 1) * 0.00002, -80.1));
+    const regions = [
+      region('west', ring(p(40, -80.1), p(40, -79.999), p(40.1, -79.999), p(40.1, -80.1), ...far)),
+      region(
+        'east',
+        ring(p(40, -80), p(40.05, -80.0003), p(40.1, -80), p(40.1, -79.9), p(40, -79.9)),
+      ),
+    ];
+    expect(fixStretch(regions, onlyStretch(regions), 'midline')).toEqual({
+      ok: false,
+      reason: 'too-many-corners',
+    });
+  });
+
+  it('refuses a stretch whose borders changed since it was found', () => {
+    const regions = strip();
+    const stretch = onlyStretch(regions);
+    const moved = [regions[0]!, region('east', square(40, -80.0002, 40.1, -79.9))];
+    expect(fixStretch(moved, stretch, 'midline')).toEqual({ ok: false, reason: 'stale' });
+  });
+
+  it('refuses a fix that would make a new overlap or gap', () => {
+    // A region drawn inside the gap since: the fix would cover it.
+    const regions = bowed(1);
+    const stretch = onlyStretch(regions);
+    const island = region('island', square(40.045, -79.99855, 40.055, -79.99845));
+    expect(fixStretch([...regions, island], stretch, 'midline')).toEqual({
+      ok: false,
+      reason: 'new-pieces',
+    });
+  });
+});
+
+/** Outlines at six decimals, as the editor keeps them. */
+const sixDecimals = (outline: readonly LatLon[]): LatLon[] =>
+  outline.map(({ lat, lon }) => p(Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6));
+
+/**
+ * West and east along a border that runs 30° east of north for 5 km, west reaching 60 m into
+ * east, the corners at six decimals.
+ */
+function slanted(): Outlined[] {
+  const turn = (Math.PI / 180) * 30;
+  const at = (x: number, y: number): LatLon =>
+    metres(x * Math.cos(turn) + y * Math.sin(turn), y * Math.cos(turn) - x * Math.sin(turn));
+  return [
+    region('west', sixDecimals(ring(at(-3000, 0), at(-3000, 5000), at(30, 5000), at(30, 0)))),
+    region('east', sixDecimals(ring(at(-30, 0), at(-30, 5000), at(3000, 5000), at(3000, 0)))),
+  ];
+}
+
+describe('fixes of awkward shapes', () => {
+  const choices = ['midline', 0, 1] as const;
+
+  it('fixes a U-shaped gap of three regions by its midline or the side of two', () => {
+    const regions = uShaped();
+    const stretch = onlyStretch(regions);
+    expect(stretch.sides).toEqual([['b'], ['c', 'a']]);
+    expect(piecesOf(fixed(regions, fixStretch(regions, stretch, 'midline')))).toBe(0);
+    expect(piecesOf(fixed(regions, fixStretch(regions, stretch, 1)))).toBe(0);
+  });
+
+  it('refuses a choice that would make an outline cross itself', () => {
+    // On b's border, c and a would meet where it comes nearest their meeting place: at the top
+    // of the U's right arm, so that c's new border would cross its own.
+    const regions = uShaped();
+    expect(fixStretch(regions, onlyStretch(regions), 0)).toEqual({
+      ok: false,
+      reason: 'crosses-itself',
+    });
+  });
+
+  it('fixes the slivers on either side of where two regions touch as one', () => {
+    const regions = pinched();
+    const stretch = onlyStretch(regions);
+    for (const choice of choices) {
+      expect(piecesOf(fixed(regions, fixStretch(regions, stretch, choice)))).toBe(0);
+    }
+  });
+
+  it('fixes a strip whichever way the outlines run', () => {
+    const [west, east] = strip() as [Outlined, Outlined];
+    const regions = [west, region('east', [...east.outline].reverse())];
+    const stretch = onlyStretch(regions);
+    expect(stretch.sides).toEqual([['west'], ['east']]);
+    for (const choice of choices) {
+      expect(piecesOf(fixed(regions, fixStretch(regions, stretch, choice)))).toBe(0);
+    }
+  });
+
+  it('fixes a slanted border of outlines at six decimals, and its outlines stay so', () => {
+    const regions = slanted();
+    const stretch = onlyStretch(regions);
+    for (const choice of choices) {
+      const after = fixed(regions, fixStretch(regions, stretch, choice));
+      expect(piecesOf(after)).toBe(0);
+      for (const one of after) expect(one.outline).toEqual(sixDecimals(one.outline));
+    }
+  });
+});
diff --git a/src/domain/regions/fix.ts b/src/domain/regions/fix.ts
index db27697426285ca7a960032ba43640afe682398f..9299a3388123f7fcf2e0435b0efa83ff8c11fb6d 100644
--- a/src/domain/regions/fix.ts
+++ b/src/domain/regions/fix.ts
@@ -1,7 +1,15 @@
-import { boxOf, grownBox, inBox, type Box } from '../geo/region-membership.js';
 import type { LatLon } from '../geo/lat-lon.js';
-import type { Coverage, Outlined, Piece } from './coverage.js';
-import { between, Flat, SegmentGrid } from './lines.js';
+import { tidyOutline } from '../geo/outline.js';
+import { boxOf, grownBox, inBox, ringContains, type Box } from '../geo/region-membership.js';
+import {
+  newProblems,
+  type Coverage,
+  type OverlapCache,
+  type Outlined,
+  type Piece,
+} from './coverage.js';
+import { between, Flat, SegmentGrid, simplified } from './lines.js';
+import { normalisedOutline } from './version.js';
 
 /**
  * Fix in the region editor (spec 4.3 "How Fix works", plan 8M-2F): where two neighbours'
@@ -359,3 +367,390 @@ export function findStretches(regions: readonly Outlined[], found: Coverage): St
   }
   return { stretches, pieces: fixes };
 }
+
+/**
+ * What the shared line of a stretch is: the midline of its two sides, or the border along one
+ * side (0 or 1, as `Stretch.sides`), which the regions along the other side take.
+ */
+export type FixChoice = 'midline' | 0 | 1;
+
+/**
+ * Why a fix is not offered: `stale`, a border of the stretch is no longer where it was found;
+ * `corner-outside`, the corner where three regions meet was dragged out of the sliver;
+ * `crosses-itself` or `too-many-corners`, an outline rebuilt would be refused (`tidyOutline`);
+ * `new-pieces`, the outlines rebuilt would make an overlap or gap that was not there.
+ */
+export type FixRefusal =
+  'stale' | 'corner-outside' | 'crosses-itself' | 'too-many-corners' | 'new-pieces';
+
+/** The outlines a fix rebuilt (only those it changed, tidied), or why there are none. */
+export type FixOutcome = { ok: true; outlines: Outlined[] } | { ok: false; reason: FixRefusal };
+
+/**
+ * How far apart the midline samples the sides, in metres, at most `MAX_SAMPLES` per side (then
+ * farther apart): a side traced with thousands of corners is sampled as evenly as a drawn one.
+ */
+const MIDLINE_STEP = 10;
+const MAX_SAMPLES = 1_500;
+/**
+ * How far from the diagonal the alignment of the samples is looked for: this share of the
+ * samples of the longer side, at least `MIN_BAND` (the sides run from the same end to the same
+ * end, so the pairs stay near it).
+ */
+const BAND_SHARE = 0.1;
+const MIN_BAND = 50;
+/** How far a midline may stray from the midpoints it is drawn through, in metres. */
+const MIDLINE_TOLERANCE = 1;
+
+/** A shared line from one end of a sliver to the other, and where three regions meet on it. */
+interface SharedLine {
+  line: LatLon[];
+  /** The index of the corner in `line` where three regions meet; undefined for two. */
+  corner: number | undefined;
+}
+
+/**
+ * The closest alignment of two lists of places that runs forward along both from their firsts
+ * to their lasts (dynamic time warping), as the pairs of indexes in order; looked for within a
+ * band round the diagonal (`BAND_SHARE`), so that two sides of 1,500 samples take a few
+ * megabytes, not a few hundred.
+ */
+function aligned(a: readonly LatLon[], b: readonly LatLon[], flat: Flat): [number, number][] {
+  const n = a.length;
+  const m = b.length;
+  // Wide enough that each row's band meets the next one's however the lengths differ.
+  const width = Math.max(
+    MIN_BAND,
+    Math.ceil(BAND_SHARE * Math.max(n, m)),
+    Math.ceil((m - 1) / Math.max(1, n - 1)) + 1,
+  );
+  const low = new Int32Array(n);
+  const high = new Int32Array(n);
+  for (let i = 0; i < n; i++) {
+    const centre = n === 1 ? 0 : (i * (m - 1)) / (n - 1);
+    low[i] = Math.max(0, Math.floor(centre - width));
+    high[i] = Math.min(m - 1, Math.ceil(centre + width));
+  }
+  const span = 2 * width + 2;
+  const cost = new Float64Array(n * span);
+  // 0: from both before, 1: from a's before, 2: from b's before.
+  const from = new Uint8Array(n * span);
+  const costAt = (i: number, j: number): number =>
+    j < low[i]! || j > high[i]! ? Infinity : cost[i * span + j - low[i]!]!;
+  for (let i = 0; i < n; i++) {
+    for (let j = low[i]!; j <= high[i]!; j++) {
+      const here = flat.distance(a[i]!, b[j]!);
+      const cell = i * span + j - low[i]!;
+      if (i === 0 && j === 0) {
+        cost[cell] = here;
+        continue;
+      }
+      const both = i > 0 && j > 0 ? costAt(i - 1, j - 1) : Infinity;
+      const aBefore = i > 0 ? costAt(i - 1, j) : Infinity;
+      const bBefore = j > 0 ? costAt(i, j - 1) : Infinity;
+      let best = both;
+      let way = 0;
+      if (aBefore < best) {
+        best = aBefore;
+        way = 1;
+      }
+      if (bBefore < best) {
+        best = bBefore;
+        way = 2;
+      }
+      cost[cell] = here + best;
+      from[cell] = way;
+    }
+  }
+  const path: [number, number][] = [];
+  for (let i = n - 1, j = m - 1; ;) {
+    path.push([i, j]);
+    if (i === 0 && j === 0) break;
+    const way = from[i * span + j - low[i]!];
+    if (way !== 2) i--;
+    if (way !== 1) j--;
+  }
+  return path.reverse();
+}
+
+/**
+ * The midline of two sides that run from the same end to the same end: the sides sampled
+ * evenly, the samples matched (`aligned`), the midpoints of the pairs, simplified. `other` is
+ * given as the chains along it: where two regions meet along it (the end of the first of two),
+ * the midline gets a corner across from it (where three regions meet).
+ */
+function midline(one: LatLon[], other: readonly LatLon[][], flat: Flat): SharedLine {
+  const lengths = other.map((part) => flat.length(part));
+  const total = lengths.reduce((sum, length) => sum + length, 0);
+  const step = Math.max(MIDLINE_STEP, Math.max(flat.length(one), total) / MAX_SAMPLES);
+  const a = flat.resampled(one, step, MAX_SAMPLES);
+  // Each chain sampled on its own, so that where they meet is a sample; MAX_SAMPLES in all.
+  const [first, second] = other as [LatLon[], LatLon[] | undefined];
+  const firstMost = second
+    ? Math.min(MAX_SAMPLES - 1, Math.max(2, Math.floor((MAX_SAMPLES * lengths[0]!) / total)))
+    : MAX_SAMPLES;
+  const b = flat.resampled(first, step, firstMost);
+  const meet = second ? b.length - 1 : undefined;
+  if (second) b.push(...flat.resampled(second, step, MAX_SAMPLES + 1 - b.length).slice(1));
+  const path = aligned(a, b, flat);
+  const middles = path.map(([i, j]) => between(a[i]!, b[j]!, 0.5));
+  middles[0] = one[0]!;
+  middles[middles.length - 1] = one[one.length - 1]!;
+  if (meet === undefined) {
+    return { line: simplified(middles, MIDLINE_TOLERANCE, flat), corner: undefined };
+  }
+  const matched = path.flatMap(([, j], k) => (j === meet ? [k] : []));
+  const at = matched[Math.floor(matched.length / 2)] ?? 0;
+  const before = simplified(middles.slice(0, at + 1), MIDLINE_TOLERANCE, flat);
+  const after = simplified(middles.slice(at), MIDLINE_TOLERANCE, flat);
+  return { line: [...before, ...after.slice(1)], corner: before.length - 1 };
+}
+
+/** A line with a place inserted where it is nearest the line, and the place's index. */
+function withNearest(line: LatLon[], point: LatLon, flat: Flat): SharedLine {
+  const { along, at } = flat.nearest(line, point);
+  let travelled = 0;
+  for (let i = 1; i < line.length; i++) {
+    travelled += flat.distance(line[i - 1]!, line[i]!);
+    if (travelled >= along) {
+      return { line: [...line.slice(0, i), at, ...line.slice(i)], corner: i };
+    }
+  }
+  return { line: [...line, at], corner: line.length };
+}
+
+/** Where the two regions along one side of a sliver meet: the end of the first chain. */
+const meetingOf = (sliver: Sliver): LatLon | undefined => {
+  const [first, second] = sliver.sides[1];
+  return second ? first?.points[first.points.length - 1] : undefined;
+};
+
+/** The shared line of a sliver for a choice. */
+function sharedLine(sliver: Sliver, choice: FixChoice): SharedLine {
+  const flat = new Flat(sliver.ends[0].lat);
+  const one = sideLine(sliver.sides[0]);
+  const other = sideLine(sliver.sides[1]);
+  const meet = meetingOf(sliver);
+  if (choice === 'midline') {
+    return midline(
+      one,
+      sliver.sides[1].map((chain) => chain.points),
+      flat,
+    );
+  }
+  if (choice === 1) {
+    const first = sliver.sides[1][0]!;
+    return { line: other, corner: meet ? first.points.length - 1 : undefined };
+  }
+  return meet ? withNearest(one, meet, flat) : { line: one, corner: undefined };
+}
+
+/**
+ * Where three regions meet in a stretch, as its midline proposes it: the middle of the strip
+ * across from where two of them meet along its side. Undefined for a stretch of two.
+ */
+export function proposedCorner(stretch: Stretch): LatLon | undefined {
+  const [sliver] = stretch.slivers;
+  if (!sliver || !meetingOf(sliver)) return undefined;
+  const { line, corner } = sharedLine(sliver, 'midline');
+  return corner === undefined ? undefined : line[corner];
+}
+
+/** A chain of a region's border to be replaced, by the new line from its start to its end. */
+interface Replacement {
+  key: string;
+  old: LatLon[];
+  fresh: LatLon[];
+}
+
+/** What each region's chains become under a choice (the side kept is left as it is). */
+function replacements(stretch: Stretch, choice: FixChoice, corner?: LatLon): Replacement[] {
+  return stretch.slivers.flatMap((sliver) => {
+    const shared = sharedLine(sliver, choice);
+    const { line } = shared;
+    const k = shared.corner;
+    if (k !== undefined && corner && choice === 'midline') line[k] = corner;
+    return sliver.sides.flatMap((side, index) => {
+      if (index === choice) return [];
+      if (side.length === 1 || k === undefined) {
+        return side.map((chain) => ({ key: chain.key, old: chain.points, fresh: line }));
+      }
+      const [first, second] = side as [Chain, Chain];
+      const meet = first.points[first.points.length - 1]!;
+      return [
+        { key: first.key, old: first.points, fresh: [...line.slice(0, k + 1), meet] },
+        { key: second.key, old: second.points, fresh: [meet, ...line.slice(k)] },
+      ];
+    });
+  });
+}
+
+/**
+ * Where a place lies on a ring's corners (closed by the first): the side's index and how far
+ * along it, `i + t`; a place within `ON_BORDER_METRES` of a corner is at that corner. Undefined
+ * when it is not on the ring.
+ */
+function locate(corners: readonly LatLon[], point: LatLon, flat: Flat): number | undefined {
+  const n = corners.length;
+  let best: { at: number; distance: number } | undefined;
+  for (let i = 0; i < n; i++) {
+    const a = corners[i]!;
+    const b = corners[(i + 1) % n]!;
+    const { t, distance } = flat.onSegment(point, a, b);
+    if (best && distance >= best.distance) continue;
+    const length = flat.distance(a, b);
+    const at =
+      t * length <= ON_BORDER_METRES
+        ? i
+        : (1 - t) * length <= ON_BORDER_METRES
+          ? (i + 1) % n
+          : i + t;
+    best = { at, distance };
+  }
+  return best && best.distance <= ON_BORDER_METRES ? best.at : undefined;
+}
+
+/** How far forward round a ring of `n` corners `b` lies from `a`. */
+const forward = (a: number, b: number, n: number): number => (((b - a) % n) + n) % n;
+const PARAM_EPSILON = 1e-9;
+
+/**
+ * A ring (closed) with the chain of its border from `old`'s first place to its last replaced by
+ * `fresh` (which runs between the same places), whichever way the ring runs along it; undefined
+ * when the chain is not on the ring.
+ */
+function replaced(
+  ring: readonly LatLon[],
+  old: readonly LatLon[],
+  fresh: readonly LatLon[],
+  flat: Flat,
+): LatLon[] | undefined {
+  const corners = ring.slice(0, -1);
+  const n = corners.length;
+  const middle = Math.max(0, Math.floor((old.length - 2) / 2));
+  const start = locate(corners, old[0]!, flat);
+  const end = locate(corners, old[old.length - 1]!, flat);
+  const probe = locate(corners, between(old[middle]!, old[middle + 1]!, 0.5), flat);
+  if (start === undefined || end === undefined || probe === undefined) return undefined;
+  const runs = (from: number, to: number): boolean => {
+    const towards = forward(from, probe, n);
+    return towards > PARAM_EPSILON && towards < forward(from, to, n) - PARAM_EPSILON;
+  };
+  let line: LatLon[];
+  let from: number;
+  let to: number;
+  if (runs(start, end)) [line, from, to] = [[...fresh], start, end];
+  else if (runs(end, start)) [line, from, to] = [[...fresh].reverse(), end, start];
+  else return undefined;
+  // The corners from the line's end round to its start.
+  const span = forward(to, from, n);
+  const kept = corners
+    .map((corner, i) => ({ corner, at: forward(to, i, n) }))
+    .filter(({ at }) => at > PARAM_EPSILON && at < span - PARAM_EPSILON)
+    .sort((x, y) => x.at - y.at)
+    .map(({ corner }) => corner);
+  const made = [...line, ...kept];
+  return [...made, { ...made[0]! }];
+}
+
+/** How far off a straight line a corner may lie and still be a fold of it, in metres. */
+const FOLD_METRES = 0.05;
+
+/**
+ * A ring (closed) without the corners where it runs back along itself: where a region takes a
+ * border that ran along its own for a while (the ends of a strip whose sides run together), the
+ * line goes out along its border and back.
+ */
+function unfolded(ring: readonly LatLon[]): LatLon[] {
+  const corners = ring.slice(0, -1);
+  const flat = new Flat(corners[0]?.lat ?? 0);
+  for (let i = 0; corners.length > 3 && i < corners.length;) {
+    const n = corners.length;
+    const a = corners[(i + n - 1) % n]!;
+    const b = corners[i]!;
+    const c = corners[(i + 1) % n]!;
+    const u = flat.offset(b, a);
+    const v = flat.offset(b, c);
+    const longer = Math.max(Math.hypot(u.x, u.y), Math.hypot(v.x, v.y));
+    // The two sides at b point the same way, and the shorter's end lies on the longer.
+    const folds =
+      u.x * v.x + u.y * v.y > 0 && Math.abs(u.x * v.y - u.y * v.x) / longer <= FOLD_METRES;
+    if (folds) {
+      corners.splice(i, 1);
+      i = Math.max(0, i - 1);
+    } else i++;
+  }
+  return corners.length > 0 ? [...corners, { ...corners[0]! }] : [];
+}
+
+/** How far outside its sliver a corner where three regions meet may be dragged, in metres. */
+const CORNER_SLACK_METRES = 1;
+
+/** Whether a place lies in one of a stretch's slivers, or within `CORNER_SLACK_METRES` of one. */
+function inSlivers(stretch: Stretch, point: LatLon): boolean {
+  const flat = new Flat(point.lat);
+  return stretch.slivers.some((sliver) => {
+    const [one, other] = sliver.sides.map(sideLine) as [LatLon[], LatLon[]];
+    const ring = [...one, ...other.reverse()];
+    return ringContains(ring, point) || flat.nearest(ring, point).distance <= CORNER_SLACK_METRES;
+  });
+}
+
+/**
+ * The outlines a choice for a stretch makes (`corner`: where three regions meet, dragged from
+ * `proposedCorner`, for the midline), tidied; refused when a border is not where the stretch was
+ * found, when the corner lies outside the stretch's slivers (land beyond them would change
+ * region unseen), or when an outline would be refused. Not checked for new overlaps and gaps
+ * (`fixStretch`).
+ */
+export function rebuildStretch(
+  regions: readonly Outlined[],
+  stretch: Stretch,
+  choice: FixChoice,
+  corner?: LatLon,
+): FixOutcome {
+  if (choice === 'midline' && corner && !inSlivers(stretch, corner)) {
+    return { ok: false, reason: 'corner-outside' };
+  }
+  const outlines = new Map(regions.map((one) => [one.key, one.outline]));
+  const touched = new Set<string>();
+  for (const { key, old, fresh } of replacements(stretch, choice, corner)) {
+    const outline = outlines.get(key);
+    const made = outline && replaced(outline, old, fresh, new Flat(old[0]?.lat ?? 0));
+    if (!made) return { ok: false, reason: 'stale' };
+    outlines.set(key, made);
+    touched.add(key);
+  }
+  const rebuilt: Outlined[] = [];
+  for (const key of touched) {
+    const tidy = tidyOutline(unfolded(normalisedOutline(outlines.get(key)!)));
+    if (!tidy.ok) {
+      return {
+        ok: false,
+        reason: tidy.problem.kind === 'too-many' ? 'too-many-corners' : 'crosses-itself',
+      };
+    }
+    rebuilt.push({ key, outline: tidy.ring });
+  }
+  return { ok: true, outlines: rebuilt };
+}
+
+/**
+ * A fix of a stretch (`rebuildStretch`), refused also when its outlines would make an overlap or
+ * a gap that the regions do not have (`newProblems`, as a save is checked).
+ */
+export function fixStretch(
+  regions: readonly Outlined[],
+  stretch: Stretch,
+  choice: FixChoice,
+  options: { corner?: LatLon; cache?: OverlapCache } = {},
+): FixOutcome {
+  const outcome = rebuildStretch(regions, stretch, choice, options.corner);
+  if (!outcome.ok) return outcome;
+  const made = new Map(outcome.outlines.map((one) => [one.key, one.outline]));
+  const after = regions.map((one) => ({ key: one.key, outline: made.get(one.key) ?? one.outline }));
+  const problems = newProblems(regions, after, options.cache);
+  return problems.overlaps.length + problems.gaps.length > 0
+    ? { ok: false, reason: 'new-pieces' }
+    : outcome;
+}
diff --git a/src/domain/regions/lines.test.ts b/src/domain/regions/lines.test.ts
index 2e01d69dcb2d00d969d59b0054a55bea9a50cfa9..d047409841b2256e8ec92def6e11905b15232dce 100644
--- a/src/domain/regions/lines.test.ts
+++ b/src/domain/regions/lines.test.ts
@@ -11,6 +11,32 @@ function seeded(seed: number): () => number {
   };
 }
 
+describe('a line resampled', () => {
+  const flat = new Flat(40);
+  // A border traced along a township line: 4,000 corners over 10 km.
+  const traced: LatLon[] = Array.from({ length: 4_000 }, (_unused, i) => ({
+    lat: 40 + i * 0.0000225,
+    lon: -80 + (i % 2) * 0.00001,
+  }));
+
+  it('takes places evenly along it, at most as many as asked, from its start to its end', () => {
+    const places = flat.resampled(traced, 5, 1_500);
+    expect(places.length).toBeLessThanOrEqual(1_500);
+    expect(places.length).toBeGreaterThan(1_400);
+    expect(places[0]).toEqual(traced[0]);
+    expect(places[places.length - 1]).toEqual(traced[traced.length - 1]);
+    const apart = places.slice(1).map((place, i) => flat.distance(places[i]!, place));
+    expect(Math.max(...apart) - Math.min(...apart)).toBeLessThan(0.5);
+  });
+
+  it('takes places `step` apart on a line short enough', () => {
+    const line = [traced[0]!, { lat: 40.00089, lon: -80 }];
+    const places = flat.resampled(line, 10, 1_500);
+    // 99 m: eleven places.
+    expect(places).toHaveLength(11);
+  });
+});
+
 describe('the sides of a line filed in a grid', () => {
   it('finds the nearest side within the distance asked, as going through every side does', () => {
     const random = seeded(7);
diff --git a/src/domain/regions/lines.ts b/src/domain/regions/lines.ts
index 24640346908c3b160fd3cfae658ea4c2885c1a93..3214788eee8c6243cd1aa8715c05cac6b9185f69 100644
--- a/src/domain/regions/lines.ts
+++ b/src/domain/regions/lines.ts
@@ -17,6 +17,11 @@ export class Flat {
     this.perLon = METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
   }
 
+  /** Where `to` lies from `from`, in metres east and north. */
+  offset(from: LatLon, to: LatLon): { x: number; y: number } {
+    return { x: (to.lon - from.lon) * this.perLon, y: (to.lat - from.lat) * METRES_PER_DEGREE };
+  }
+
   /** How far apart two places are, in metres. */
   distance(a: LatLon, b: LatLon): number {
     return Math.hypot((b.lon - a.lon) * this.perLon, (b.lat - a.lat) * METRES_PER_DEGREE);
@@ -91,6 +96,35 @@ export class Flat {
     return found;
   }
 
+  /**
+   * Places evenly along a line, its corners not among them: `step` metres apart, or farther so
+   * that there are at most `most` (at least 2); the first is its start, the last its end.
+   */
+  resampled(line: readonly LatLon[], step: number, most: number): LatLon[] {
+    const first = line[0];
+    const last = line[line.length - 1];
+    if (!first || !last) return [];
+    const count = Math.max(2, Math.min(most, Math.ceil(this.length(line) / step) + 1));
+    const spacing = this.length(line) / (count - 1);
+    const found: LatLon[] = [first];
+    let i = 1;
+    let travelled = 0;
+    let side = line.length > 1 ? this.distance(first, line[1]!) : 0;
+    for (let k = 1; k < count - 1; k++) {
+      const along = k * spacing;
+      // On the first side whose end is at least that far along.
+      while (i < line.length - 1 && travelled + side < along) {
+        travelled += side;
+        i++;
+        side = this.distance(line[i - 1]!, line[i]!);
+      }
+      const t = side === 0 ? 0 : Math.min(1, (along - travelled) / side);
+      found.push(between(line[i - 1]!, line[i]!, t));
+    }
+    found.push(last);
+    return found;
+  }
+
   /** A place as metres east of the meridian and north of the equator, at this scale. */
   metres(point: LatLon): { x: number; y: number } {
     return { x: point.lon * this.perLon, y: point.lat * METRES_PER_DEGREE };
@@ -171,6 +205,35 @@ export class SegmentGrid {
 /** A cell of a grid as one number (for cells of a metre or more, a row is below 2·10⁷). */
 const cellKey = (cx: number, cy: number): number => cx * 100_000_000 + cy;
 
+/**
+ * A line with fewer corners (Douglas and Peucker): every corner left out lies within `metres` of
+ * the line kept. Its ends are kept.
+ */
+export function simplified(line: readonly LatLon[], metres: number, flat: Flat): LatLon[] {
+  if (line.length <= 2) return [...line];
+  const keep = new Uint8Array(line.length);
+  keep[0] = 1;
+  keep[line.length - 1] = 1;
+  const spans: [number, number][] = [[0, line.length - 1]];
+  for (let span = spans.pop(); span; span = spans.pop()) {
+    const [from, to] = span;
+    let farthest = -1;
+    let at = -1;
+    for (let i = from + 1; i < to; i++) {
+      const { distance } = flat.onSegment(line[i]!, line[from]!, line[to]!);
+      if (distance > farthest) {
+        farthest = distance;
+        at = i;
+      }
+    }
+    if (at >= 0 && farthest > metres) {
+      keep[at] = 1;
+      spans.push([from, at], [at, to]);
+    }
+  }
+  return line.filter((_point, i) => keep[i] === 1);
+}
+
 /** The place a share `t` of the way from a to b. */
 export const between = (a: LatLon, b: LatLon, t: number): LatLon => ({
   lat: a.lat + (b.lat - a.lat) * t,
````

### Task 3: Region editor: Fix all slivers and the worst-first list

Prototype commit: `f672f2ca32f7ff5efa6e05ecacf74e1fbde95afe`

`fix-all.ts`: the midline for every stretch whose fix moves no gym, stop or power spot, in rounds; the others asked about one at a time with every place whose region changes named; at the end, fixes that make a piece new against the regions as loaded are taken back. `pieceOrder`: new pieces first, then (on first open) most places, then area. A seeded test of the guarantee: every choice offered gives tidy outlines, no new piece, and names every place that changes region.

**Files:**

```
 src/domain/regions/fix-all.test.ts | 325 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/regions/fix-all.ts      | 418 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/editor-view.test.ts |  41 ++++++++
 src/web/client/editor-view.ts      |  16 +++
 4 files changed, 800 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/regions/fix-all.test.ts src/web/client/editor-view.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/domain/regions/fix-all.test.ts src/domain/regions/fix-all.ts src/web/client/editor-view.test.ts src/web/client/editor-view.ts` and `npx eslint src/domain/regions/fix-all.test.ts src/domain/regions/fix-all.ts src/web/client/editor-view.test.ts src/web/client/editor-view.ts`.
- [ ] **Step 4: Check the transcription:** `git diff f672f2ca32f7ff5efa6e05ecacf74e1fbde95afe -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m2f-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Region editor: Fix all slivers and the worst-first list`, the paragraph above as the body and the trailer, staging exactly
  `src/domain/regions/fix-all.test.ts src/domain/regions/fix-all.ts src/web/client/editor-view.test.ts src/web/client/editor-view.ts`.

````diff
diff --git a/src/domain/regions/fix-all.test.ts b/src/domain/regions/fix-all.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..325f0ac5d647470707ba6694ab3bd40709f812b5
--- /dev/null
+++ b/src/domain/regions/fix-all.test.ts
@@ -0,0 +1,325 @@
+import { describe, expect, it } from 'vitest';
+import type { LatLon } from '../geo/lat-lon.js';
+import { tidyOutline } from '../geo/outline.js';
+import { ringContains } from '../geo/region-membership.js';
+import { coverage, newPieces, type Outlined } from './coverage.js';
+import {
+  answer,
+  changedOutlines,
+  fixAllFinish,
+  fixAllStart,
+  fixOptions,
+  nextQuestion,
+  type FixAllState,
+  type Place,
+  type Question,
+} from './fix-all.js';
+import { findStretches } from './fix.js';
+
+const p = (lat: number, lon: number): LatLon => ({ lat, lon });
+const ring = (...corners: LatLon[]): LatLon[] => [...corners, { ...corners[0]! }];
+const square = (south: number, west: number, north: number, east: number): LatLon[] =>
+  ring(p(south, west), p(north, west), p(north, east), p(south, east));
+const region = (key: string, outline: LatLon[]): Outlined => ({ key, outline });
+
+/** How many overlaps and gaps the regions have. */
+function piecesOf(regions: readonly Outlined[]): number {
+  const found = coverage(regions);
+  return found.overlaps.length + found.gaps.length;
+}
+
+/**
+ * Two pairs of neighbours, each reaching 85 m into the other along their border (at 40° north a
+ * thousandth of a degree of longitude is about 85 m): north-west and north-east, and further
+ * south south-west and south-east.
+ */
+const twoStrips = (): Outlined[] => [
+  region('nw', square(40, -80.1, 40.1, -79.999)),
+  region('ne', square(40, -80, 40.1, -79.9)),
+  region('sw', square(39.8, -80.1, 39.9, -79.999)),
+  region('se', square(39.8, -80, 39.9, -79.9)),
+];
+
+/** A gym in the southern strip, nearer south-west's border than south-east's. */
+const gymInSouth = { index: 7, lat: 39.85, lon: -79.9993 };
+
+describe('Fix all slivers', () => {
+  it('takes the midline of every stretch with nothing in it, and asks about none', () => {
+    const regions = twoStrips();
+    const state = fixAllStart(regions, []);
+    expect(state.fixed).toBe(2);
+    expect(nextQuestion(state)).toBeUndefined();
+    expect(piecesOf(state.regions)).toBe(0);
+    expect(changedOutlines(regions, state).map((one) => one.key)).toEqual(['nw', 'ne', 'sw', 'se']);
+  });
+
+  it('asks about a stretch with something in it, naming where it ends up under each choice', () => {
+    const state = fixAllStart(twoStrips(), [gymInSouth]);
+    expect(state.fixed).toBe(1);
+    const asked = nextQuestion(state);
+    expect(asked?.question.stretch.sides).toEqual([['sw'], ['se']]);
+    expect(asked?.question.places).toEqual([7]);
+    expect(
+      asked?.question.options.map((option) => [option.choice, option.ok, option.landings]),
+    ).toEqual([
+      // South-west's border kept: south-east gives the strip up.
+      [0, true, [{ place: 7, key: 'sw' }]],
+      [1, true, [{ place: 7, key: 'se' }]],
+      ['midline', true, [{ place: 7, key: 'se' }]],
+    ]);
+  });
+
+  it('applies what was answered, and leaves what was skipped', () => {
+    const regions = twoStrips();
+    const started = fixAllStart(regions, [gymInSouth]);
+    const asked = nextQuestion(started)!;
+    const taken = answer(asked.state, asked.question, 0);
+    expect(piecesOf(taken.regions)).toBe(0);
+    expect(taken.fixed).toBe(2);
+    expect(nextQuestion(taken)).toBeUndefined();
+    // South-west's border was kept: it is not changed.
+    expect(changedOutlines(regions, taken).map((one) => one.key)).toEqual(['nw', 'ne', 'se']);
+
+    const skipped: FixAllState = answer(asked.state, asked.question, 'skip');
+    expect(skipped.skipped).toBe(1);
+    expect(piecesOf(skipped.regions)).toBe(1);
+    expect(changedOutlines(regions, skipped).map((one) => one.key)).toEqual(['nw', 'ne']);
+  });
+
+  it('finds a stretch again whose border an answer before moved', () => {
+    // Three regions overlapping where they meet: each answer moves the others' borders there.
+    const regions = [
+      region('west', square(40, -80.1, 40.1, -79.999)),
+      region('east', square(40, -80, 40.1, -79.9)),
+      region('north', square(40.099, -80.1, 40.2, -79.9)),
+    ];
+    const places = [
+      { index: 0, lat: 40.05, lon: -79.9993 },
+      { index: 1, lat: 40.0995, lon: -80.05 },
+      { index: 2, lat: 40.0995, lon: -79.95 },
+    ];
+    let state = fixAllStart(regions, places);
+    expect(state.pending).toHaveLength(3);
+    for (let asked = nextQuestion(state); asked; asked = nextQuestion(state)) {
+      state = answer(asked.state, asked.question, 'midline');
+    }
+    expect([state.fixed, state.skipped, state.refused]).toEqual([3, 0, 0]);
+    expect(piecesOf(state.regions)).toBe(0);
+  });
+
+  it('fixes where three regions meet', () => {
+    const regions = [
+      region('west', square(40, -80.1, 40.1, -80.001)),
+      region(
+        'south',
+        ring(
+          p(39.95, -80.1),
+          p(39.95, -79.9),
+          p(40.1, -79.9),
+          p(40.1, -80),
+          p(40, -80),
+          p(40, -80.1),
+        ),
+      ),
+      region('north', square(40.1, -80.1, 40.2, -79.9)),
+    ];
+    const state = fixAllStart(regions, []);
+    expect(state.fixed).toBe(1);
+    expect(piecesOf(state.regions)).toBe(0);
+  });
+
+  it('asks about a stretch whose midline moves a place outside its slivers into another region', () => {
+    // A gym in c, 30 m from the gap: the midline gives the bend of c's border to a.
+    const gym = place(3, metres(10, 940));
+    const regions = bentU();
+    const state = fixAllStart(regions, [gym]);
+    expect(state.fixed).toBe(0);
+    const asked = nextQuestion(state);
+    expect(asked?.question.places).toEqual([3]);
+    const midline = asked?.question.options.find((option) => option.choice === 'midline');
+    expect(midline).toMatchObject({ ok: true, landings: [{ place: 3, key: 'a' }] });
+  });
+
+  it('counts a stretch that cannot be fixed once', () => {
+    // West has 5,000 corners: the midlines along its east and north borders would take it over
+    // the limit, round after round.
+    const far = Array.from({ length: 4_996 }, (_unused, i) => p(40.09 - (i + 1) * 0.000018, -80.1));
+    const regions = [
+      region('west', ring(p(40, -80.1), p(40, -79.999), p(40.1, -79.999), p(40.1, -80.1), ...far)),
+      region(
+        'east',
+        ring(
+          p(40, -80),
+          p(40.02, -80.0003),
+          p(40.04, -80),
+          p(40.06, -80.0003),
+          p(40.08, -80),
+          p(40.1, -80),
+          p(40.1, -79.9),
+          p(40, -79.9),
+        ),
+      ),
+      region('north', square(40.0995, -80.1, 40.2, -79.9)),
+    ];
+    const state = fixAllStart(regions, []);
+    expect([state.fixed, state.refused]).toEqual([1, 2]);
+    expect(nextQuestion(state)).toBeUndefined();
+  });
+
+  it('takes back at the end the fixes that made an overlap or gap the regions as loaded lack', () => {
+    const regions = [
+      ...twoStrips(),
+      region('w', square(40.2, -80.1, 40.3, -80)),
+      region('e', square(40.2, -80, 40.3, -79.9)),
+    ];
+    const started = fixAllStart(regions, []);
+    expect(started.fixed).toBe(2);
+    // An answer that would push e into w (as no choice of Fix all should).
+    const pushed = square(40.2, -80.0005, 40.3, -79.9);
+    const question: Question = {
+      stretch: { id: 'w/e#9', sides: [['w'], ['e']], slivers: [] },
+      places: [],
+      options: [{ choice: 0, ok: true, outlines: [region('e', pushed)], landings: [] }],
+    };
+    const answered = answer(started, question, 0);
+    expect(answered.fixed).toBe(3);
+    const done = fixAllFinish(regions, answered, coverage(regions));
+    expect([done.fixed, done.undone]).toEqual([2, 1]);
+    expect(done.regions.find((one) => one.key === 'e')?.outline).toEqual(
+      regions.find((one) => one.key === 'e')?.outline,
+    );
+    expect(piecesOf(done.regions)).toBe(0);
+  });
+});
+
+describe('the choices of a stretch', () => {
+  it('names every place whose region a choice changes, also outside the slivers', () => {
+    // The corner where the three meet dragged to the bottom of the U, under b's tongue: the
+    // midline then cuts the tongue's foot off.
+    const regions = uShaped();
+    const stretch = findStretches(regions, coverage(regions)).stretches[0]!;
+    const inTongue = place(1, metres(88, 150));
+    const elsewhere = place(2, metres(300, 300));
+    const options = fixOptions(regions, stretch, [inTongue, elsewhere], {
+      corner: metres(92, 62),
+    });
+    const midline = options.find((option) => option.choice === 'midline');
+    expect(midline?.ok).toBe(true);
+    expect(midline?.landings.map((landing) => landing.place)).toEqual([1]);
+    expect(midline?.landings[0]?.key).not.toBe('b');
+  });
+
+  it('keeps its promise on generated borders: tidy outlines, nothing new, every move named', () => {
+    for (let seed = 1; seed <= 12; seed++) {
+      const random = seeded(seed);
+      const regions = wavy(random);
+      const loaded = coverage(regions);
+      const places = Array.from({ length: 300 }, (_unused, index) =>
+        place(index, metres(-150 + random() * 300, -50 + random() * 3100)),
+      );
+      const { stretches } = findStretches(regions, loaded);
+      expect(stretches.length).toBeGreaterThan(0);
+      for (const stretch of stretches) {
+        for (const option of fixOptions(regions, stretch, places)) {
+          if (!option.ok) continue;
+          for (const one of option.outlines) expect(tidyOutline(one.outline).ok).toBe(true);
+          const made = new Map(option.outlines.map((one) => [one.key, one.outline]));
+          const after = regions.map((one) =>
+            region(one.key, [...(made.get(one.key) ?? one.outline)]),
+          );
+          const now = coverage(after);
+          expect(newPieces(now.overlaps, loaded.overlaps)).toEqual([]);
+          expect(newPieces(now.gaps, loaded.gaps)).toEqual([]);
+          const named = new Set(option.landings.map((landing) => landing.place));
+          for (const one of places) {
+            const moved = holders(regions, one) !== holders(after, one);
+            expect(named.has(one.index)).toBe(moved);
+          }
+        }
+      }
+    }
+  });
+});
+
+/** A place `x` metres east and `y` metres north of 40° north, 80° west. */
+const metres = (x: number, y: number): LatLon => p(40 + y / 111_195, -80 + x / 85_180);
+
+const place = (index: number, at: LatLon): Place => ({ index, ...at });
+
+/** The keys of the regions that hold a place. */
+const holders = (regions: readonly Outlined[], at: LatLon): string =>
+  regions
+    .filter((one) => ringContains(one.outline, at))
+    .map((one) => one.key)
+    .join(',');
+
+/** A generator of numbers in [0, 1) from a seed, the same every run. */
+function seeded(seed: number): () => number {
+  let state = seed;
+  return () => {
+    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
+    return state / 2_147_483_648;
+  };
+}
+
+/**
+ * West and east along a border 3 km long, each drawn with its own wavy line within 40 m of it,
+ * so that they cross back and forth (overlaps and gaps); the corners at six decimals.
+ */
+function wavy(random: () => number): Outlined[] {
+  const line = (): LatLon[] => {
+    const corners = 15 + Math.floor(random() * 40);
+    const phase = random() * 6;
+    const period = 200 + random() * 500;
+    return Array.from({ length: corners }, (_unused, i) => {
+      const y = (i * 3000) / (corners - 1);
+      return metres(30 * Math.sin(phase + y / period) + 10 * (random() - 0.5), y);
+    });
+  };
+  const six = (outline: LatLon[]): LatLon[] =>
+    outline.map(({ lat, lon }) => p(Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6));
+  return [
+    region('west', six(ring(metres(-2000, 0), ...line(), metres(-2000, 3000)))),
+    region('east', six(ring(metres(2000, 0), metres(2000, 3000), ...line().reverse()))),
+  ];
+}
+
+/**
+ * A gap shaped like a U, 85 m wide and a kilometre deep, round a tongue of `b` 20 m wide: `a`
+ * runs round its outside and over the top of its right arm, `c` closes its left arm with a cut.
+ * `bend`: the cut bends down to this corner on its way.
+ */
+function uShaped(bend: LatLon[] = []): Outlined[] {
+  return [
+    region(
+      'a',
+      ring(
+        metres(-500, -500),
+        metres(690, -500),
+        metres(690, 1500),
+        metres(105, 1500),
+        metres(105, 1000),
+        metres(190, 1000),
+        metres(190, 0),
+        metres(0, 0),
+        metres(0, 1000),
+        metres(-500, 1000),
+      ),
+    ),
+    region('b', ring(metres(85, 100), metres(105, 100), metres(105, 1500), metres(85, 1500))),
+    region(
+      'c',
+      ring(
+        metres(-500, 1000),
+        metres(0, 1000),
+        ...bend,
+        metres(85, 700),
+        metres(85, 1500),
+        metres(-500, 1500),
+      ),
+    ),
+  ];
+}
+
+/** The U whose cut bends down into the left arm: the midline cuts across the bend. */
+const bentU = (): Outlined[] => uShaped([metres(20, 800)]);
diff --git a/src/domain/regions/fix-all.ts b/src/domain/regions/fix-all.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8435c02524729f9b11c0726ce3edc9de06dffec8
--- /dev/null
+++ b/src/domain/regions/fix-all.ts
@@ -0,0 +1,418 @@
+import type { LatLon } from '../geo/lat-lon.js';
+import { boxOf, containment, inBox, ringContains, type Box } from '../geo/region-membership.js';
+import {
+  coverage,
+  inPiece,
+  newPieces,
+  newProblems,
+  type Coverage,
+  type OverlapCache,
+  type Outlined,
+  type Piece,
+} from './coverage.js';
+import {
+  findStretches,
+  fixStretch,
+  rebuildStretch,
+  sideLine,
+  type FixChoice,
+  type FixOutcome,
+  type FixRefusal,
+  type Stretch,
+} from './fix.js';
+
+/**
+ * "Fix all slivers" in the region editor (spec 4.3, plan 8M-2F): the midline for every stretch
+ * whose midline moves no gym, stop or power spot into another region; a stretch where it would is
+ * asked about, one at a time, naming where each place ends up under each choice. At the end,
+ * the fixes that together made an overlap or gap the regions as loaded lack are taken back
+ * (`fixAllFinish`). Pure: the page's worker keeps the state between the questions, and what was
+ * fixed becomes one staged edit.
+ */
+
+/** A place that may change region: an index of the caller's, and where it is. */
+export interface Place {
+  index: number;
+  lat: number;
+  lon: number;
+}
+
+/**
+ * A place whose region a fix changes (in its slivers or not), and where it ends up: a region
+ * the fix changed that holds it after, else any region that does; none when no region does.
+ */
+export interface Landing {
+  place: number;
+  key: string | null;
+}
+
+/** A choice of a question: the outlines it makes and where each place ends up, or why not. */
+export type FixOption =
+  | { choice: FixChoice; ok: true; outlines: Outlined[]; landings: Landing[] }
+  | { choice: FixChoice; ok: false; reason: FixRefusal; landings: Landing[] };
+
+/** A stretch asked about: the places some choice moves, and the choices. */
+export interface Question {
+  stretch: Stretch;
+  places: number[];
+  options: FixOption[];
+}
+
+/**
+ * Fix all between its questions: the regions as fixed so far, the places, the stretches still
+ * to ask about with the places in their slivers or moved by their midline (found on the regions
+ * after the others were fixed), the regions each fix changed (`log`, to take fixes back), and
+ * the numbers of stretches fixed, skipped, refused (no choice could be made: "draw it by
+ * hand") and taken back at the end (`fixAllFinish`).
+ */
+export interface FixAllState {
+  regions: Outlined[];
+  places: Place[];
+  pending: { stretch: Stretch; places: number[] }[];
+  log: string[][];
+  fixed: number;
+  skipped: number;
+  refused: number;
+  undone: number;
+}
+
+/** How many times the stretches are found anew and fixed (a fix can move another's border). */
+const MAX_ROUNDS = 6;
+
+/** The choices in the order they are offered: either border, then the midline. */
+const CHOICES: readonly FixChoice[] = [0, 1, 'midline'];
+
+/** The regions with the outlines a fix rebuilt. */
+function withOutlines(regions: readonly Outlined[], outlines: readonly Outlined[]): Outlined[] {
+  const made = new Map(outlines.map((one) => [one.key, one.outline]));
+  return regions.map((one) => {
+    const outline = made.get(one.key);
+    return outline ? { key: one.key, outline } : one;
+  });
+}
+
+/** The places in a stretch's slivers (`pieces`: the overlaps, then the gaps it was found in). */
+export function placesIn(
+  stretch: Stretch,
+  pieces: readonly Piece[],
+  places: readonly Place[],
+): number[] {
+  return places
+    .filter((place) =>
+      stretch.slivers.some((sliver) => {
+        const piece = pieces[sliver.piece];
+        return piece !== undefined && inPiece(piece, place);
+      }),
+    )
+    .map((place) => place.index);
+}
+
+/**
+ * The box of what changed between two outlines of a region: the corners of either that the other
+ * lacks, with their neighbours along the ring. A place whose side of the border changed lies in
+ * it. Undefined when nothing changed.
+ */
+function changedBox(before: readonly LatLon[], after: readonly LatLon[]): Box | undefined {
+  const cornerKey = ({ lat, lon }: LatLon): string => `${lat} ${lon}`;
+  const changed: LatLon[] = [];
+  const differing = (ring: readonly LatLon[], other: readonly LatLon[]): void => {
+    const kept = new Set(other.map(cornerKey));
+    const n = ring.length;
+    ring.forEach((corner, i) => {
+      if (kept.has(cornerKey(corner))) return;
+      changed.push(corner, ring[(i + n - 1) % n]!, ring[(i + 1) % n]!);
+    });
+  };
+  differing(before, after);
+  differing(after, before);
+  return changed.length > 0 ? boxOf(changed) : undefined;
+}
+
+/**
+ * Every place whose region the outlines rebuilt change (`outlines`, against `regions`), and
+ * where it ends up: only places in the boxes of what changed are tested.
+ */
+function landingsOf(
+  regions: readonly Outlined[],
+  outlines: readonly Outlined[],
+  places: readonly Place[],
+): Landing[] {
+  const before = new Map(regions.map((one) => [one.key, one.outline]));
+  const boxes = outlines.flatMap((one) => {
+    const box = changedBox(before.get(one.key) ?? [], one.outline);
+    return box ? [box] : [];
+  });
+  const tests = outlines.map((one) => ({
+    key: one.key,
+    was: containment(before.get(one.key) ?? []),
+    is: containment(one.outline),
+  }));
+  const landings: Landing[] = [];
+  for (const place of places) {
+    if (!boxes.some((box) => inBox(box, place))) continue;
+    if (tests.every((test) => test.was(place) === test.is(place))) continue;
+    const key =
+      tests.find((test) => test.is(place))?.key ??
+      regions.find(
+        (one) => !tests.some((test) => test.key === one.key) && ringContains(one.outline, place),
+      )?.key ??
+      null;
+    landings.push({ place: place.index, key });
+  }
+  return landings;
+}
+
+/**
+ * Every choice for a stretch (either border, then the midline; `corner`: where three regions
+ * meet, for the midline), each checked (`fixStretch`), with every place among those given whose
+ * region it changes.
+ */
+export function fixOptions(
+  regions: readonly Outlined[],
+  stretch: Stretch,
+  places: readonly Place[],
+  options: { corner?: LatLon; cache?: OverlapCache } = {},
+): FixOption[] {
+  return CHOICES.map((choice): FixOption => {
+    const outcome: FixOutcome = fixStretch(regions, stretch, choice, options);
+    if (!outcome.ok) return { choice, ok: false, reason: outcome.reason, landings: [] };
+    return {
+      choice,
+      ok: true,
+      outlines: outcome.outlines,
+      landings: landingsOf(regions, outcome.outlines, places),
+    };
+  });
+}
+
+/** A stretch with its signature: its regions and its slivers' area, to know it again. */
+const signature = (stretch: Stretch, pieces: readonly Piece[]): string =>
+  `${stretch.sides.flat().join('/')}:${Math.round(
+    stretch.slivers.reduce((sum, sliver) => sum + (pieces[sliver.piece]?.area ?? 0), 0),
+  )}`;
+
+/** The box of a stretch's slivers. */
+const stretchBox = (stretch: Stretch): Box =>
+  boxOf(stretch.slivers.flatMap((sliver) => sliver.sides.flatMap((side) => sideLine(side))));
+
+const boxesMeet = (a: Box, b: Box): boolean =>
+  a.south <= b.north && b.south <= a.north && a.west <= b.east && b.west <= a.east;
+
+/**
+ * Fix all, first part: the midline for every stretch whose midline moves no place into another
+ * region, in rounds (each finds the stretches of the regions as fixed so far, so that a stretch
+ * whose border the one before moved is found again); each round is checked for new overlaps and
+ * gaps as a whole, and fix by fix when it made some. Then the stretches left: those with a place
+ * in their slivers or one their midline moves are to be asked about, the others could not be
+ * fixed (each counted once, however often it was tried).
+ */
+export function fixAllStart(
+  regions: readonly Outlined[],
+  places: readonly Place[],
+  cache?: OverlapCache,
+): FixAllState {
+  let working = [...regions];
+  let fixed = 0;
+  const log: string[][] = [];
+  // Stretches not to try again: refused, or moving a place (asked about at the end).
+  const given = new Set<string>();
+  const quiet = (outlines: readonly Outlined[]): boolean =>
+    landingsOf(working, outlines, places).length === 0;
+  for (let round = 0; round < MAX_ROUNDS; round++) {
+    const found = coverage(working, cache);
+    const pieces = [...found.overlaps, ...found.gaps];
+    const tried = findStretches(working, found).stretches.filter(
+      (stretch) =>
+        !given.has(signature(stretch, pieces)) && placesIn(stretch, pieces, places).length === 0,
+    );
+    if (tried.length === 0) break;
+    const before = working;
+    const madeLog: string[][] = [];
+    for (const stretch of tried) {
+      const outcome = rebuildStretch(working, stretch, 'midline');
+      if (outcome.ok && quiet(outcome.outlines)) {
+        working = withOutlines(working, outcome.outlines);
+        madeLog.push(outcome.outlines.map((one) => one.key));
+      } else if (!outcome.ok && outcome.reason === 'stale') {
+        // Its border was moved by a fix of this round: found again in the next.
+      } else {
+        given.add(signature(stretch, pieces));
+      }
+    }
+    const problems = madeLog.length > 0 ? newProblems(before, working, cache) : undefined;
+    if (problems && problems.overlaps.length + problems.gaps.length > 0) {
+      // Fix by fix, each checked: those that make new pieces are refused.
+      working = before;
+      madeLog.length = 0;
+      for (const stretch of tried) {
+        if (given.has(signature(stretch, pieces))) continue;
+        const outcome = fixStretch(working, stretch, 'midline', { cache });
+        if (outcome.ok && quiet(outcome.outlines)) {
+          working = withOutlines(working, outcome.outlines);
+          madeLog.push(outcome.outlines.map((one) => one.key));
+        } else if (outcome.ok || outcome.reason !== 'stale') {
+          given.add(signature(stretch, pieces));
+        }
+      }
+    }
+    fixed += madeLog.length;
+    log.push(...madeLog);
+    // Nothing moved: what was stale stays so.
+    if (madeLog.length === 0) break;
+  }
+  const found = coverage(working, cache);
+  const pieces = [...found.overlaps, ...found.gaps];
+  const pending: FixAllState['pending'] = [];
+  let refused = 0;
+  for (const stretch of findStretches(working, found).stretches) {
+    const outcome = rebuildStretch(working, stretch, 'midline');
+    const moved = outcome.ok ? landingsOf(working, outcome.outlines, places) : [];
+    const inside = new Set([
+      ...placesIn(stretch, pieces, places),
+      ...moved.map((landing) => landing.place),
+    ]);
+    if (inside.size > 0) pending.push({ stretch, places: [...inside].sort((a, b) => a - b) });
+    else refused++;
+  }
+  return {
+    regions: working,
+    places: [...places],
+    pending,
+    log,
+    fixed,
+    skipped: 0,
+    refused,
+    undone: 0,
+  };
+}
+
+/**
+ * The question of the next stretch still to ask about, its choices worked out on the regions
+ * as fixed so far; a stretch for which no choice can be made is counted as refused and passed.
+ * Undefined when none is left.
+ */
+export function nextQuestion(
+  state: FixAllState,
+  cache?: OverlapCache,
+): { state: FixAllState; question: Question } | undefined {
+  let { pending, refused } = state;
+  let refound = false;
+  while (pending.length > 0) {
+    const [{ stretch, places: inside }, ...rest] = pending as [
+      FixAllState['pending'][number],
+      ...FixAllState['pending'],
+    ];
+    pending = rest;
+    const options = fixOptions(state.regions, stretch, state.places, { cache });
+    if (!refound && options.some((option) => !option.ok && option.reason === 'stale')) {
+      // An answer before moved a border of it: found again on the regions as they are now, by
+      // its regions and where its slivers lie.
+      refound = true;
+      const found = coverage(state.regions, cache);
+      const pieces = [...found.overlaps, ...found.gaps];
+      const keys = stretch.sides.flat().sort().join('/');
+      const box = stretchBox(stretch);
+      const again = findStretches(state.regions, found).stretches.flatMap((one) =>
+        one.sides.flat().sort().join('/') === keys && boxesMeet(stretchBox(one), box)
+          ? [{ stretch: one, places: placesIn(one, pieces, state.places) }]
+          : [],
+      );
+      if (again.length > 0) {
+        pending = [...again, ...pending];
+        continue;
+      }
+    }
+    refound = false;
+    if (options.some((option) => option.ok)) {
+      const named = new Set([
+        ...inside,
+        ...options.flatMap((option) => option.landings.map((landing) => landing.place)),
+      ]);
+      return {
+        state: { ...state, pending, refused },
+        question: { stretch, places: [...named].sort((a, b) => a - b), options },
+      };
+    }
+    refused++;
+  }
+  return undefined;
+}
+
+/** The regions after a question was answered with a choice, or skipped. */
+export function answer(
+  state: FixAllState,
+  question: Question,
+  choice: FixChoice | 'skip',
+): FixAllState {
+  const option = question.options.find((one) => one.choice === choice);
+  if (choice === 'skip' || !option?.ok) return { ...state, skipped: state.skipped + 1 };
+  return {
+    ...state,
+    regions: withOutlines(state.regions, option.outlines),
+    log: [...state.log, option.outlines.map((one) => one.key)],
+    fixed: state.fixed + 1,
+  };
+}
+
+/**
+ * Fix all's end: its fixes were each checked against the regions before them, but a save is
+ * checked against the regions as loaded (`loaded`, their pieces). The pieces of the regions now
+ * that are new against those and against the pieces Fix all started from (`start`: those are
+ * the staged edits', not Fix all's) are looked for; the fixes that changed a region near one
+ * are taken back (the region and every region a fix of it changed get their outlines of the
+ * start again), until none is left.
+ */
+export function fixAllFinish(
+  start: readonly Outlined[],
+  state: FixAllState,
+  loaded: Coverage,
+  cache?: OverlapCache,
+): FixAllState {
+  if (state.log.length === 0) return state;
+  const first = new Map(start.map((one) => [one.key, one.outline]));
+  const began = coverage(start, cache);
+  let { regions, log } = state;
+  let undone = 0;
+  for (;;) {
+    const now = coverage(regions, cache);
+    const made = [
+      ...newPieces(newPieces(now.overlaps, loaded.overlaps), began.overlaps),
+      ...newPieces(newPieces(now.gaps, loaded.gaps), began.gaps),
+    ];
+    if (made.length === 0) break;
+    const back = new Set(
+      regions
+        .filter(
+          (one) =>
+            first.get(one.key) !== one.outline &&
+            made.some((piece) => boxesMeet(piece.box, boxOf(one.outline))),
+        )
+        .map((one) => one.key),
+    );
+    if (back.size === 0) break;
+    // Every fix of a region taken back is taken back whole, with the other regions it changed.
+    let taken: string[][] = [];
+    for (let grew = true; grew;) {
+      grew = false;
+      taken = log.filter((keys) => keys.some((key) => back.has(key)));
+      for (const key of taken.flat()) {
+        if (!back.has(key)) {
+          back.add(key);
+          grew = true;
+        }
+      }
+    }
+    undone += taken.length;
+    log = log.filter((keys) => !keys.some((key) => back.has(key)));
+    regions = regions.map((one) =>
+      back.has(one.key) ? { key: one.key, outline: first.get(one.key) ?? one.outline } : one,
+    );
+  }
+  return { ...state, regions, log, fixed: state.fixed - undone, undone };
+}
+
+/** The outlines Fix all changed, against the regions it started from, in their order. */
+export function changedOutlines(regions: readonly Outlined[], state: FixAllState): Outlined[] {
+  const before = new Map(regions.map((one) => [one.key, one.outline]));
+  return state.regions.filter((one) => before.get(one.key) !== one.outline);
+}
diff --git a/src/web/client/editor-view.test.ts b/src/web/client/editor-view.test.ts
index bda9011cf754cfc43d2137f0027a839dac8db1d7..ebf083f8e995d9803fcc61b53b4d7404d7553f93 100644
--- a/src/web/client/editor-view.test.ts
+++ b/src/web/client/editor-view.test.ts
@@ -19,6 +19,7 @@ import {
   pickerChange,
   pickerShown,
   pieceLine,
+  pieceOrder,
   placeCounts,
   readSaveAnswer,
   reloadFailedLine,
@@ -26,6 +27,7 @@ import {
   saveReadiness,
   splitPartner,
   storageKey,
+  type ListedPiece,
 } from './editor-view.js';
 
 const p = (lat: number, lon: number): LatLon => ({ lat, lon });
@@ -248,6 +250,45 @@ describe('the region editor page', () => {
     ).toBe('Gap of 5 m²');
   });
 
+  it('lists new pieces first, then the largest, or on a first open the worst first', () => {
+    const piece = (
+      name: string,
+      area: number,
+      places: number,
+      fresh = false,
+    ): ListedPiece & { name: string } => ({
+      name,
+      kind: 'gap',
+      area,
+      between: null,
+      fresh,
+      counts: { gym: places, stop: 0, powerspot: 0, wayfarerGym: 0 },
+    });
+    const pieces = [
+      piece('large and empty', 9_000, 0),
+      piece('small with gyms', 100, 3),
+      piece('new', 10, 0, true),
+      piece('middling with a gym', 500, 1),
+      piece('tiny with a gym', 50, 1),
+    ];
+    const names = (worstFirst: boolean): string[] =>
+      [...pieces].sort(pieceOrder(worstFirst)).map((one) => one.name);
+    expect(names(false)).toEqual([
+      'new',
+      'large and empty',
+      'middling with a gym',
+      'small with gyms',
+      'tiny with a gym',
+    ]);
+    expect(names(true)).toEqual([
+      'new',
+      'small with gyms',
+      'middling with a gym',
+      'tiny with a gym',
+      'large and empty',
+    ]);
+  });
+
   it('knows which region a new one was split off', () => {
     const state = record(emptyEdits(), {
       kind: 'split',
diff --git a/src/web/client/editor-view.ts b/src/web/client/editor-view.ts
index 480fc4203c18952326cfc6ce93da5230897d0a2b..4926156dbea6e6b96b17b42a5df3e63fdd792e41 100644
--- a/src/web/client/editor-view.ts
+++ b/src/web/client/editor-view.ts
@@ -343,6 +343,22 @@ export interface ListedPiece {
   counts: PlaceKinds;
 }
 
+/** How many places lie in a piece, of every kind. */
+const placesIn = ({ counts }: ListedPiece): number =>
+  counts.gym + counts.stop + counts.powerspot + counts.wayfarerGym;
+
+/**
+ * The order of the list of overlaps and gaps: new ones first (Save refuses them), then the
+ * largest; on the first open of a server's regions (nothing staged, spec 4.3) the worst first,
+ * those with the most gyms, stops and power spots in them, then the largest.
+ */
+export function pieceOrder(worstFirst: boolean): (a: ListedPiece, b: ListedPiece) => number {
+  return (a, b) =>
+    Number(b.fresh) - Number(a.fresh) ||
+    (worstFirst ? placesIn(b) - placesIn(a) : 0) ||
+    b.area - a.area;
+}
+
 /** "New overlap of 1,234 m², #west and #east: 2 gyms, 1 stop". */
 export function pieceLine(piece: ListedPiece, name: (key: string) => string): string {
   const what = piece.kind === 'overlap' ? 'overlap' : 'gap';
````

### Task 4: Region editor: Fix and Fix all slivers on the page

Prototype commit: `b2bd88b297fb90dcab7589e8d55d01b1c880803b`

The worker answers fix requests (every one, `failed` on an error) and numbered Fix all questions; the editor shows "Fix…" beside each fixable piece (a reason beside the others), the choices dashed on the map with where each place ends up, a draggable corner (Apply waits for the answer to the last drag), and "Fix all slivers…" with its questions; a fix or a whole Fix all is one undo step; worst first when the page opened with nothing staged; texts as nodes.

**Files:**

```
 src/web/client/coverage-check.test.ts | 314 +++++++++++++++++++++++++++++++++++++++++++++++++++++----
 src/web/client/coverage-check.ts      | 405 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++------
 src/web/client/editor-view.test.ts    |  60 +++++++++++
 src/web/client/editor-view.ts         | 113 +++++++++++++++++++++
 src/web/client/editor.css             |  31 ++++++
 src/web/client/editor.ts              | 362 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 6 files changed, 1227 insertions(+), 58 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/coverage-check.test.ts src/web/client/editor-view.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/web/client/coverage-check.test.ts src/web/client/coverage-check.ts src/web/client/editor-view.test.ts src/web/client/editor-view.ts src/web/client/editor.ts` and `npx eslint src/web/client/coverage-check.test.ts src/web/client/coverage-check.ts src/web/client/editor-view.test.ts src/web/client/editor-view.ts src/web/client/editor.ts`.
- [ ] **Step 4: Check the transcription:** `git diff b2bd88b297fb90dcab7589e8d55d01b1c880803b -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m2f-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Region editor: Fix and Fix all slivers on the page`, the paragraph above as the body and the trailer, staging exactly
  `src/web/client/coverage-check.test.ts src/web/client/coverage-check.ts src/web/client/editor-view.test.ts src/web/client/editor-view.ts src/web/client/editor.css src/web/client/editor.ts`.

````diff
diff --git a/src/web/client/coverage-check.test.ts b/src/web/client/coverage-check.test.ts
index 26232edb2eac7b9e7dc9f07319b8dc563996067d..c26172e51e49e15443fbcae41c2ee77f77560c0b 100644
--- a/src/web/client/coverage-check.test.ts
+++ b/src/web/client/coverage-check.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from 'vitest';
 import type { Point } from '../../domain/web/editor-data.js';
-import { CoverageChecker, type CoverageRegion } from './coverage-check.js';
+import { CoverageChecker, type CoverageAnswer, type CoverageRegion } from './coverage-check.js';
 
 function square(south: number, west: number, north: number, east: number): Point[] {
   return [
@@ -18,6 +18,15 @@ const region = (key: string, outline: Point[], version = 'v1'): CoverageRegion =
   outline,
 });
 
+/** The answer of a kind, or a failure. */
+function ofKind<K extends CoverageAnswer['kind']>(
+  answer: CoverageAnswer | undefined,
+  kind: K,
+): Extract<CoverageAnswer, { kind: K }> {
+  if (answer?.kind !== kind) throw new Error(`expected a ${kind} answer`);
+  return answer as Extract<CoverageAnswer, { kind: K }>;
+}
+
 describe('the overlaps and gaps the editor shades', () => {
   const checker = (): CoverageChecker => {
     const made = new CoverageChecker();
@@ -39,36 +48,42 @@ describe('the overlaps and gaps the editor shades', () => {
   };
 
   it('lists those of the regions as loaded, none of them new, with what lies in them', () => {
-    const answer = checker().handle({
-      kind: 'check',
-      seq: 1,
-      regions: [
-        region('r1', square(40, -80.1, 40.1, -79.99)),
-        region('r2', square(40, -80, 40.1, -79.9)),
-      ],
-    });
+    const answer = ofKind(
+      checker().handle({
+        kind: 'check',
+        seq: 1,
+        regions: [
+          region('r1', square(40, -80.1, 40.1, -79.99)),
+          region('r2', square(40, -80, 40.1, -79.9)),
+        ],
+      }),
+      'check',
+    );
     expect(answer).toMatchObject({ seq: 1, failed: false });
-    expect(answer?.pieces).toHaveLength(1);
-    expect(answer?.pieces[0]).toMatchObject({
+    expect(answer.pieces).toHaveLength(1);
+    expect(answer.pieces[0]).toMatchObject({
       kind: 'overlap',
       between: ['r1', 'r2'],
       fresh: false,
       counts: { gym: 1, stop: 2, powerspot: 0, wayfarerGym: 0 },
     });
-    expect(answer?.pieces[0]?.rings[0]?.[0]).toEqual([40, -80]);
+    expect(answer.pieces[0]?.rings[0]?.[0]).toEqual([40, -80]);
   });
 
   it('marks what the staged edits make as new', () => {
-    const answer = checker().handle({
-      kind: 'check',
-      seq: 2,
-      regions: [
-        region('r1', square(40, -80.1, 40.1, -79.98), 'v2'),
-        region('r2', square(40, -80, 40.1, -79.9)),
-      ],
-    });
+    const answer = ofKind(
+      checker().handle({
+        kind: 'check',
+        seq: 2,
+        regions: [
+          region('r1', square(40, -80.1, 40.1, -79.98), 'v2'),
+          region('r2', square(40, -80, 40.1, -79.9)),
+        ],
+      }),
+      'check',
+    );
     expect(
-      answer?.pieces.map((piece) => [piece.kind, piece.fresh, piece.counts.wayfarerGym]),
+      answer.pieces.map((piece) => [piece.kind, piece.fresh, piece.counts.wayfarerGym]),
     ).toEqual([['overlap', true, 1]]);
   });
 
@@ -76,3 +91,260 @@ describe('the overlaps and gaps the editor shades', () => {
     expect(new CoverageChecker().handle({ kind: 'check', seq: 3, regions: [] })).toBeUndefined();
   });
 });
+
+/**
+ * Two pairs of neighbours, each reaching 85 m into the other (at 40° north a thousandth of a
+ * degree of longitude is about 85 m): a gym and a stop in the northern strip, nothing in the
+ * southern one.
+ */
+function twoStrips(made = new CoverageChecker()): CoverageChecker {
+  const regions = [
+    region('nw', square(40, -80.1, 40.1, -79.999)),
+    region('ne', square(40, -80, 40.1, -79.9)),
+    region('sw', square(39.8, -80.1, 39.9, -79.999)),
+    region('se', square(39.8, -80, 39.9, -79.9)),
+  ];
+  made.handle({
+    kind: 'loaded',
+    regions,
+    places: [
+      ['powerspot', 40.05, -80.05],
+      ['gym', 40.05, -79.9993],
+      ['stop', 40.06, -79.9997],
+    ],
+  });
+  made.handle({ kind: 'check', seq: 1, regions });
+  return made;
+}
+
+describe('the fixes the editor offers', () => {
+  it('says of every piece whether and how it can be fixed', () => {
+    const made = new CoverageChecker();
+    const regions = [
+      region('nw', square(40, -80.1, 40.1, -79.999)),
+      region('ne', square(40, -80, 40.1, -79.9)),
+      // South-west reaches into south-east at both ends of their border, and south-east's
+      // border bows 255 m away from it in the middle.
+      region('sw', square(39.5, -80.1, 39.6, -79.999)),
+      region('se', [
+        [39.45, -80],
+        [39.52, -80],
+        [39.55, -79.996],
+        [39.58, -80],
+        [39.65, -80],
+        [39.65, -79.9],
+        [39.45, -79.9],
+        [39.45, -80],
+      ]),
+    ];
+    made.handle({ kind: 'loaded', regions, places: [] });
+    const { pieces } = ofKind(made.handle({ kind: 'check', seq: 1, regions }), 'check');
+    expect(pieces.map((piece) => [piece.kind, piece.fix])).toEqual([
+      ['overlap', { stretch: 'nw/ne#0' }],
+      ['overlap', { stretch: 'sw/se#1' }],
+      ['overlap', { stretch: 'sw/se#2' }],
+      ['gap', { cannot: 'too-wide' }],
+    ]);
+  });
+
+  it('works out each choice of a stretch, with where each place in it ends up', () => {
+    const answer = ofKind(
+      twoStrips().handle({ kind: 'fix-options', seq: 1, stretch: 'nw/ne#0' }),
+      'fix-options',
+    );
+    expect(answer.stretch).toMatchObject({
+      id: 'nw/ne#0',
+      sides: [['nw'], ['ne']],
+      places: [1, 2],
+      corner: null,
+    });
+    expect(answer.options.map((option) => [option.choice, option.ok, option.landings])).toEqual([
+      [
+        0,
+        true,
+        [
+          { place: 1, key: 'nw' },
+          { place: 2, key: 'nw' },
+        ],
+      ],
+      [
+        1,
+        true,
+        [
+          { place: 1, key: 'ne' },
+          { place: 2, key: 'ne' },
+        ],
+      ],
+      [
+        'midline',
+        true,
+        [
+          { place: 1, key: 'ne' },
+          { place: 2, key: 'nw' },
+        ],
+      ],
+    ]);
+    // North-west's border kept: north-east's outline is rebuilt along it.
+    expect(answer.options[0]?.outlines.map((one) => one.key)).toEqual(['ne']);
+  });
+
+  it('says a stretch it no longer knows is gone', () => {
+    expect(twoStrips().handle({ kind: 'fix-options', seq: 1, stretch: 'nw/ne#9' })).toEqual({
+      kind: 'fix-options',
+      seq: 1,
+      stretch: null,
+      options: [],
+      failed: false,
+    });
+  });
+
+  it('names each place a choice moves into another region, also beyond the slivers', () => {
+    const made = new CoverageChecker();
+    const regions = bentU();
+    made.handle({
+      kind: 'loaded',
+      regions,
+      // A gym in c by the bend of its border, a stop far off in a.
+      places: [
+        ['gym', ...metres(10, 940)],
+        ['stop', ...metres(300, 300)],
+      ],
+    });
+    const [piece] = ofKind(made.handle({ kind: 'check', seq: 1, regions }), 'check').pieces;
+    const stretch = piece && 'stretch' in piece.fix ? piece.fix.stretch : '';
+    const answer = ofKind(made.handle({ kind: 'fix-options', seq: 1, stretch }), 'fix-options');
+    expect(answer.stretch?.places).toEqual([0]);
+    // The corner where the three meet is proposed (across the bend, outside the gap) and taken.
+    expect(answer.stretch?.corner).not.toBeNull();
+    expect(answer.options.find((option) => option.choice === 'midline')).toMatchObject({
+      ok: true,
+      landings: [{ place: 0, key: 'a' }],
+    });
+  });
+
+  it('fixes the empty stretches at once, asks about the others, and gives what changed', () => {
+    const made = twoStrips();
+    const first = ofKind(made.handle({ kind: 'fix-all', seq: 1, ask: 1 }), 'fix-all');
+    expect(first).toMatchObject({ ask: 1, fixed: 1, skipped: 0, refused: 0, outlines: [] });
+    expect(first.question).toMatchObject({ number: 1 });
+    expect(first.question?.stretch).toMatchObject({ sides: [['nw'], ['ne']], places: [1, 2] });
+    const done = ofKind(
+      made.handle({ kind: 'fix-all-answer', seq: 1, ask: 2, question: 1, choice: 0 }),
+      'fix-all',
+    );
+    expect(done).toMatchObject({ ask: 2, fixed: 2, undone: 0, question: null, failed: false });
+    expect(done.outlines.map((one) => one.key)).toEqual(['ne', 'sw', 'se']);
+  });
+
+  it('stops when asked, with what was fixed so far', () => {
+    const made = twoStrips();
+    made.handle({ kind: 'fix-all', seq: 1, ask: 1 });
+    const done = ofKind(
+      made.handle({ kind: 'fix-all-answer', seq: 1, ask: 2, question: 1, choice: 'stop' }),
+      'fix-all',
+    );
+    expect(done).toMatchObject({ fixed: 1, question: null });
+    expect(done.outlines.map((one) => one.key)).toEqual(['sw', 'se']);
+  });
+
+  it('ignores an answer to a question it is not asking', () => {
+    const made = twoStrips();
+    made.handle({ kind: 'fix-all', seq: 1, ask: 1 });
+    // A second click on an answer already sent, or one of a Fix all before.
+    expect(
+      made.handle({ kind: 'fix-all-answer', seq: 1, ask: 2, question: 7, choice: 0 }),
+    ).toBeUndefined();
+    const done = ofKind(
+      made.handle({ kind: 'fix-all-answer', seq: 1, ask: 3, question: 1, choice: 'skip' }),
+      'fix-all',
+    );
+    expect(done).toMatchObject({ ask: 3, fixed: 1, skipped: 1, question: null });
+    expect(
+      made.handle({ kind: 'fix-all-answer', seq: 1, ask: 4, question: 1, choice: 0 }),
+    ).toBeUndefined();
+  });
+});
+
+describe('a fix the worker cannot work out', () => {
+  const broken = (): never => {
+    throw new Error('the arithmetic gave up');
+  };
+
+  it('answers the choices of a stretch with a failure', () => {
+    const made = twoStrips(new CoverageChecker({ fixOptions: broken }));
+    expect(made.handle({ kind: 'fix-options', seq: 1, stretch: 'nw/ne#0' })).toEqual({
+      kind: 'fix-options',
+      seq: 1,
+      stretch: null,
+      options: [],
+      failed: true,
+    });
+  });
+
+  it('answers Fix all with a failure, also before anything was checked', () => {
+    const made = twoStrips(new CoverageChecker({ fixAllStart: broken }));
+    expect(made.handle({ kind: 'fix-all', seq: 1, ask: 1 })).toMatchObject({
+      kind: 'fix-all',
+      ask: 1,
+      failed: true,
+      question: null,
+      outlines: [],
+    });
+    expect(new CoverageChecker().handle({ kind: 'fix-all', seq: 1, ask: 2 })).toMatchObject({
+      kind: 'fix-all',
+      ask: 2,
+      failed: true,
+    });
+  });
+
+  it('answers an answer to Fix all with a failure, and stops Fix all', () => {
+    const made = twoStrips(new CoverageChecker({ answer: broken }));
+    made.handle({ kind: 'fix-all', seq: 1, ask: 1 });
+    expect(
+      made.handle({ kind: 'fix-all-answer', seq: 1, ask: 2, question: 1, choice: 0 }),
+    ).toMatchObject({ kind: 'fix-all', ask: 2, failed: true, question: null, outlines: [] });
+    expect(
+      made.handle({ kind: 'fix-all-answer', seq: 1, ask: 3, question: 1, choice: 0 }),
+    ).toBeUndefined();
+  });
+});
+
+/** A place `x` metres east and `y` metres north of 40° north, 80° west. */
+const metres = (x: number, y: number): Point => [40 + y / 111_195, -80 + x / 85_180];
+
+const ring = (...corners: Point[]): Point[] => [...corners, corners[0]!];
+
+/**
+ * A gap shaped like a U, 85 m wide and a kilometre deep, round a tongue of `b`: `a` runs round
+ * its outside and over its right arm, `c` closes its left arm with a cut that bends down into
+ * the arm. The midline of the gap cuts across the bend: land of c goes to a.
+ */
+const bentU = (): CoverageRegion[] => [
+  region(
+    'a',
+    ring(
+      metres(-500, -500),
+      metres(690, -500),
+      metres(690, 1500),
+      metres(105, 1500),
+      metres(105, 1000),
+      metres(190, 1000),
+      metres(190, 0),
+      metres(0, 0),
+      metres(0, 1000),
+      metres(-500, 1000),
+    ),
+  ),
+  region('b', ring(metres(85, 100), metres(105, 100), metres(105, 1500), metres(85, 1500))),
+  region(
+    'c',
+    ring(
+      metres(-500, 1000),
+      metres(0, 1000),
+      metres(20, 800),
+      metres(85, 700),
+      metres(85, 1500),
+      metres(-500, 1500),
+    ),
+  ),
+];
diff --git a/src/web/client/coverage-check.ts b/src/web/client/coverage-check.ts
index 6e427576d809bc481eec105c4c2d0b97c600b31c..7e3659240743d96d2b6b622e6e842d7b8f4e38de 100644
--- a/src/web/client/coverage-check.ts
+++ b/src/web/client/coverage-check.ts
@@ -8,6 +8,28 @@ import {
   type Outlined,
   type Piece,
 } from '../../domain/regions/coverage.js';
+import {
+  answer,
+  changedOutlines,
+  fixAllFinish,
+  fixAllStart,
+  fixOptions,
+  nextQuestion,
+  placesIn,
+  type FixAllState,
+  type FixOption,
+  type Landing,
+  type Place,
+  type Question,
+} from '../../domain/regions/fix-all.js';
+import {
+  findStretches,
+  proposedCorner,
+  type FixChoice,
+  type FixRefusal,
+  type PieceFix,
+  type Stretch,
+} from '../../domain/regions/fix.js';
 import type { Point } from '../../domain/web/editor-data.js';
 import type { ListedPiece, PlaceKinds } from './editor-view.js';
 
@@ -16,7 +38,11 @@ import type { ListedPiece, PlaceKinds } from './editor-view.js';
  * (`editor-worker.ts`): at the size of a city that takes seconds, which the page must not
  * stand still for. The worker is told the regions as loaded and the places to count once
  * (`loaded`), then the staged regions after every edit (`check`); it answers every piece with
- * what lies in it and whether the edits made it (`newPieces` against the loaded ones).
+ * what lies in it, whether the edits made it (`newPieces` against the loaded ones) and whether
+ * it can be fixed (`findStretches`, plan 8M-2F). Fixes are worked out here too, on the regions
+ * of the last check: the choices for one stretch (`fix-options`), and Fix all with its
+ * questions (`fix-all`, then `fix-all-answer` for each). A fix request is always answered, with
+ * `failed` when the work threw, so that the page never waits for nothing.
  */
 
 /** What kind of place lies in a piece: a gym of Pine's, or a kept Wayspot. */
@@ -32,50 +58,210 @@ export interface CoverageRegion {
   outline: Point[];
 }
 
+/**
+ * What the page asks. `places` are numbered in the order given: a fix names them by that
+ * number. `fix-options`: the choices of a stretch of the last check (`corner`, where three
+ * regions meet, when dragged). `fix-all` and `fix-all-answer` carry the page's number of the
+ * request (`ask`), which the answer repeats: the page takes only the answer to its last.
+ * `fix-all-answer`: a choice for Fix all's question of that `question` number, `skip` it, or
+ * `stop` with what was fixed so far; one for another question is ignored.
+ */
 export type CoverageRequest =
   | { kind: 'loaded'; regions: CoverageRegion[]; places: [PlaceKind, number, number][] }
-  | { kind: 'check'; seq: number; regions: CoverageRegion[] };
+  | { kind: 'check'; seq: number; regions: CoverageRegion[] }
+  | { kind: 'fix-options'; seq: number; stretch: string; corner?: Point }
+  | { kind: 'fix-all'; seq: number; ask: number }
+  | {
+      kind: 'fix-all-answer';
+      seq: number;
+      ask: number;
+      question: number;
+      choice: FixChoice | 'skip' | 'stop';
+    };
 
-/** A piece as the page shades and lists it. */
+/** A piece as the page shades and lists it, and whether it can be fixed. */
 export interface ShownPiece extends ListedPiece {
   /** Its outer ring, then its holes. */
   rings: Point[][];
+  fix: PieceFix;
+}
+
+/** An outline a fix rebuilt. */
+export interface ShownOutline {
+  key: string;
+  outline: Point[];
+}
+
+/**
+ * A stretch as the page shows it: its regions along each side, the places in its slivers and
+ * those some choice moves into another region (beyond them too), the box of its slivers
+ * (south-west and north-east), and where three regions meet (null for two, or when it is not
+ * offered to be moved).
+ */
+export interface ShownStretch {
+  id: string;
+  sides: [string[], string[]];
+  places: number[];
+  box: [Point, Point];
+  corner: Point | null;
 }
 
-/** The pieces of one `check`; `failed` when polyclip could not cut the outlines. */
-export interface CoverageAnswer {
-  seq: number;
-  pieces: ShownPiece[];
-  failed: boolean;
+/** A choice of a fix: the outlines it rebuilds and where each place ends up, or why not. */
+export interface ShownOption {
+  choice: FixChoice;
+  ok: boolean;
+  reason: FixRefusal | null;
+  outlines: ShownOutline[];
+  landings: Landing[];
+}
+
+/**
+ * What the worker answers. `check`: the pieces of one check, `failed` when polyclip could not
+ * cut the outlines. `fix-options`: the choices of a stretch, none when the last check has no
+ * such stretch, or `failed`. `fix-all`: how far Fix all is, with its next question (numbered),
+ * or none when it is done (then `outlines`: everything it changed, to be staged as one edit;
+ * `skipped` counts the questions left when it was stopped, `undone` the fixes taken back at
+ * its end), or `failed` (nothing staged).
+ */
+export type CoverageAnswer =
+  | { kind: 'check'; seq: number; pieces: ShownPiece[]; failed: boolean }
+  | {
+      kind: 'fix-options';
+      seq: number;
+      stretch: ShownStretch | null;
+      options: ShownOption[];
+      failed: boolean;
+    }
+  | {
+      kind: 'fix-all';
+      seq: number;
+      ask: number;
+      failed: boolean;
+      fixed: number;
+      skipped: number;
+      refused: number;
+      undone: number;
+      question: { number: number; stretch: ShownStretch; options: ShownOption[] } | null;
+      outlines: ShownOutline[];
+    };
+
+/** The work of a fix, as the worker does it (a test gives one that fails). */
+export interface FixWork {
+  fixOptions: typeof fixOptions;
+  fixAllStart: typeof fixAllStart;
+  nextQuestion: typeof nextQuestion;
+  answer: typeof answer;
+  fixAllFinish: typeof fixAllFinish;
 }
 
 const toPoint = ({ lat, lon }: LatLon): Point => [lat, lon];
+const toLatLon = ([lat, lon]: Point): LatLon => ({ lat, lon });
+
+/** A stretch as the page shows it, boxed by the sides of its slivers. */
+function shownStretch(
+  stretch: Stretch,
+  places: number[],
+  corner: LatLon | undefined,
+): ShownStretch {
+  const corners = stretch.slivers.flatMap((sliver) =>
+    sliver.sides.flat().flatMap((chain) => chain.points),
+  );
+  const lats = corners.map((one) => one.lat);
+  const lons = corners.map((one) => one.lon);
+  return {
+    id: stretch.id,
+    sides: stretch.sides,
+    places,
+    box: [
+      [Math.min(...lats), Math.min(...lons)],
+      [Math.max(...lats), Math.max(...lons)],
+    ],
+    corner: corner ? toPoint(corner) : null,
+  };
+}
+
+const shownOptions = (options: readonly FixOption[]): ShownOption[] =>
+  options.map((option) => ({
+    choice: option.choice,
+    ok: option.ok,
+    reason: option.ok ? null : option.reason,
+    outlines: option.ok
+      ? option.outlines.map(({ key, outline }) => ({ key, outline: outline.map(toPoint) }))
+      : [],
+    landings: option.landings,
+  }));
+
+/** The places in the slivers and those some choice moves, in order. */
+const namedPlaces = (inside: readonly number[], options: readonly FixOption[]): number[] =>
+  [
+    ...new Set([
+      ...inside,
+      ...options.flatMap((option) => option.landings.map((landing) => landing.place)),
+    ]),
+  ].sort((a, b) => a - b);
 
-/** The worker's state: the loaded pieces, the places sorted by latitude, the outlines seen. */
+/** The worker's state: the loaded pieces, the places, the outlines seen, the last check. */
 export class CoverageChecker {
   private loaded: Coverage | undefined;
-  private places: [PlaceKind, number, number][] = [];
+  /** The places in the order the page numbered them. */
+  private places: (Place & { kind: PlaceKind })[] = [];
+  /** The same, sorted by latitude, for counting. */
+  private byLatitude: (Place & { kind: PlaceKind })[] = [];
   private readonly outlines = new Map<string, { version: string; outline: LatLon[] }>();
   private readonly cache = new OverlapCache();
+  private readonly work: FixWork;
+  /** The regions, pieces and stretches of the last check. */
+  private last: { regions: Outlined[]; pieces: Piece[]; stretches: Stretch[] } | undefined;
+  /**
+   * Fix all between its questions: the regions it began with, how far it is, the question
+   * asked and its number.
+   */
+  private fixingAll:
+    | { start: Outlined[]; state: FixAllState; question: Question | undefined; number: number }
+    | undefined;
+  /** How many questions Fix all asked since the worker began: the last one's number. */
+  private asked = 0;
 
-  /** Answers a `check`; nothing for `loaded`, or for a `check` before it. */
+  constructor(work: Partial<FixWork> = {}) {
+    this.work = { fixOptions, fixAllStart, nextQuestion, answer, fixAllFinish, ...work };
+  }
+
+  /** Answers a request; nothing for `loaded`, a check before it, or an answer it ignores. */
   handle(message: CoverageRequest): CoverageAnswer | undefined {
-    if (message.kind === 'loaded') {
-      this.places = [...message.places].sort((a, b) => a[1] - b[1]);
-      try {
-        this.loaded = coverage(this.outlined(message.regions), this.cache);
-      } catch {
-        this.loaded = { overlaps: [], gaps: [] };
-      }
-      return undefined;
+    switch (message.kind) {
+      case 'loaded':
+        this.places = message.places.map(([kind, lat, lon], index) => ({ kind, index, lat, lon }));
+        this.byLatitude = [...this.places].sort((a, b) => a.lat - b.lat);
+        try {
+          this.loaded = coverage(this.outlined(message.regions), this.cache);
+        } catch {
+          this.loaded = { overlaps: [], gaps: [] };
+        }
+        return undefined;
+      case 'check':
+        return this.check(message.seq, message.regions);
+      case 'fix-options':
+        return this.options(message.seq, message.stretch, message.corner);
+      case 'fix-all':
+        return this.fixAll(message.seq, message.ask);
+      case 'fix-all-answer':
+        return this.answerFixAll(message);
     }
+  }
+
+  private check(seq: number, regions: readonly CoverageRegion[]): CoverageAnswer | undefined {
     if (!this.loaded) return undefined;
+    this.fixingAll = undefined;
+    const outlined = this.outlined(regions);
     let now: Coverage;
     try {
-      now = coverage(this.outlined(message.regions), this.cache);
+      now = coverage(outlined, this.cache);
     } catch {
-      return { seq: message.seq, pieces: [], failed: true };
+      this.last = undefined;
+      return { kind: 'check', seq, pieces: [], failed: true };
     }
+    const { stretches, pieces: fixes } = findStretches(outlined, now);
+    this.last = { regions: outlined, pieces: [...now.overlaps, ...now.gaps], stretches };
     const freshOverlaps = new Set(newPieces(now.overlaps, this.loaded.overlaps));
     const freshGaps = new Set(newPieces(now.gaps, this.loaded.gaps));
     const shown = (
@@ -83,6 +269,7 @@ export class CoverageChecker {
       kind: 'overlap' | 'gap',
       between: [string, string] | null,
       fresh: boolean,
+      fix: PieceFix | undefined,
     ): ShownPiece => ({
       kind,
       rings: piece.rings.map((ring) => ring.map(toPoint)),
@@ -90,25 +277,183 @@ export class CoverageChecker {
       between,
       fresh,
       counts: this.countIn(piece),
+      fix: fix ?? { cannot: 'tangled' },
     });
+    const overlaps = now.overlaps.length;
     return {
-      seq: message.seq,
+      kind: 'check',
+      seq,
       failed: false,
       pieces: [
-        ...now.overlaps.map((piece) =>
-          shown(piece, 'overlap', piece.between, freshOverlaps.has(piece)),
+        ...now.overlaps.map((piece, i) =>
+          shown(piece, 'overlap', piece.between, freshOverlaps.has(piece), fixes[i]),
+        ),
+        ...now.gaps.map((piece, i) =>
+          shown(piece, 'gap', null, freshGaps.has(piece), fixes[overlaps + i]),
         ),
-        ...now.gaps.map((piece) => shown(piece, 'gap', null, freshGaps.has(piece))),
       ],
     };
   }
 
+  /**
+   * The choices of a stretch of the last check, with every place each moves; the corner where
+   * three meet as dragged (only a dragged one is held to the sliver), else as proposed.
+   */
+  private options(seq: number, id: string, corner: Point | undefined): CoverageAnswer {
+    const none = (failed: boolean): CoverageAnswer => ({
+      kind: 'fix-options',
+      seq,
+      stretch: null,
+      options: [],
+      failed,
+    });
+    const stretch = this.last?.stretches.find((one) => one.id === id);
+    if (!this.last || !stretch) return none(false);
+    try {
+      const dragged = corner ? toLatLon(corner) : undefined;
+      const options = this.work.fixOptions(this.last.regions, stretch, this.places, {
+        ...(dragged ? { corner: dragged } : {}),
+        cache: this.cache,
+      });
+      const inside = placesIn(stretch, this.last.pieces, this.places);
+      return {
+        kind: 'fix-options',
+        seq,
+        stretch: shownStretch(
+          stretch,
+          namedPlaces(inside, options),
+          dragged ?? proposedCorner(stretch),
+        ),
+        options: shownOptions(options),
+        failed: false,
+      };
+    } catch {
+      return none(true);
+    }
+  }
+
+  /** Fix all on the regions of the last check: the quiet stretches, then the first question. */
+  private fixAll(seq: number, ask: number): CoverageAnswer {
+    this.fixingAll = undefined;
+    if (!this.last) return this.failed(seq, ask);
+    try {
+      const start = this.last.regions;
+      this.fixingAll = {
+        start,
+        state: this.work.fixAllStart(start, this.places, this.cache),
+        question: undefined,
+        number: 0,
+      };
+      return this.nextOfFixAll(seq, ask);
+    } catch {
+      return this.failed(seq, ask);
+    }
+  }
+
+  private answerFixAll(
+    message: Extract<CoverageRequest, { kind: 'fix-all-answer' }>,
+  ): CoverageAnswer | undefined {
+    const { seq, ask, choice } = message;
+    const fixing = this.fixingAll;
+    if (!fixing?.question || fixing.number !== message.question) return undefined;
+    try {
+      if (choice === 'stop') {
+        // The question asked and those still to come are left as they are.
+        const left = fixing.state.pending.length + 1;
+        fixing.state = { ...fixing.state, skipped: fixing.state.skipped + left, pending: [] };
+        return this.ended(seq, ask);
+      }
+      fixing.state = this.work.answer(fixing.state, fixing.question, choice);
+      return this.nextOfFixAll(seq, ask);
+    } catch {
+      return this.failed(seq, ask);
+    }
+  }
+
+  /** Fix all's next question, numbered, or its end. */
+  private nextOfFixAll(seq: number, ask: number): CoverageAnswer {
+    const fixing = this.fixingAll;
+    if (!fixing) return this.failed(seq, ask);
+    const next = this.work.nextQuestion(fixing.state, this.cache);
+    if (!next) return this.ended(seq, ask);
+    this.asked += 1;
+    fixing.state = next.state;
+    fixing.question = next.question;
+    fixing.number = this.asked;
+    const { fixed, skipped, refused, undone } = next.state;
+    return {
+      kind: 'fix-all',
+      seq,
+      ask,
+      failed: false,
+      fixed,
+      skipped,
+      refused,
+      undone,
+      question: {
+        number: this.asked,
+        stretch: shownStretch(next.question.stretch, next.question.places, undefined),
+        options: shownOptions(next.question.options),
+      },
+      outlines: [],
+    };
+  }
+
+  /**
+   * Fix all's end: the fixes that made an overlap or gap the regions as loaded lack taken back
+   * (`fixAllFinish`), then everything it changed.
+   */
+  private ended(seq: number, ask: number): CoverageAnswer {
+    const fixing = this.fixingAll;
+    if (!fixing) return this.failed(seq, ask);
+    this.fixingAll = undefined;
+    const state = this.work.fixAllFinish(
+      fixing.start,
+      fixing.state,
+      this.loaded ?? { overlaps: [], gaps: [] },
+      this.cache,
+    );
+    const { fixed, skipped, refused, undone } = state;
+    return {
+      kind: 'fix-all',
+      seq,
+      ask,
+      failed: false,
+      fixed,
+      skipped,
+      refused,
+      undone,
+      question: null,
+      outlines: changedOutlines(fixing.start, state).map(({ key, outline }) => ({
+        key,
+        outline: outline.map(toPoint),
+      })),
+    };
+  }
+
+  /** Fix all could not be worked out: it is dropped, and nothing is staged. */
+  private failed(seq: number, ask: number): CoverageAnswer {
+    this.fixingAll = undefined;
+    return {
+      kind: 'fix-all',
+      seq,
+      ask,
+      failed: true,
+      fixed: 0,
+      skipped: 0,
+      refused: 0,
+      undone: 0,
+      question: null,
+      outlines: [],
+    };
+  }
+
   /** The regions as outlines, the very same list for an outline whose version it has seen. */
   private outlined(regions: readonly CoverageRegion[]): Outlined[] {
     return regions.map(({ key, version, outline }) => {
       const kept = this.outlines.get(key);
       if (kept?.version === version) return { key, outline: kept.outline };
-      const made = outline.map(([lat, lon]) => ({ lat, lon }));
+      const made = outline.map(toLatLon);
       this.outlines.set(key, { version, outline: made });
       return { key, outline: made };
     });
@@ -117,18 +462,18 @@ export class CoverageChecker {
   /** What lies in a piece, by kind: the places in its band of latitude, tested one by one. */
   private countIn(piece: Piece): PlaceKinds {
     const counts: PlaceKinds = { gym: 0, stop: 0, powerspot: 0, wayfarerGym: 0 };
-    const { places } = this;
+    const places = this.byLatitude;
     let low = 0;
     let high = places.length;
     while (low < high) {
       const middle = (low + high) >> 1;
-      if ((places[middle]?.[1] ?? 0) < piece.box.south) low = middle + 1;
+      if ((places[middle]?.lat ?? 0) < piece.box.south) low = middle + 1;
       else high = middle;
     }
     for (let i = low; i < places.length; i++) {
       const place = places[i];
-      if (!place || place[1] > piece.box.north) break;
-      if (inPiece(piece, { lat: place[1], lon: place[2] })) counts[place[0]] += 1;
+      if (!place || place.lat > piece.box.north) break;
+      if (inPiece(piece, place)) counts[place.kind] += 1;
     }
     return counts;
   }
diff --git a/src/web/client/editor-view.test.ts b/src/web/client/editor-view.test.ts
index ebf083f8e995d9803fcc61b53b4d7404d7553f93..3f4f66d7861829770e5bc39d26e2fa7adceeaf16 100644
--- a/src/web/client/editor-view.test.ts
+++ b/src/web/client/editor-view.test.ts
@@ -8,11 +8,17 @@ import {
   regionKey,
   type Draft,
 } from '../../domain/regions/edits.js';
+import type { FixChoice } from '../../domain/regions/fix.js';
 import type { EditorData, SaveRequest } from '../../domain/web/editor-data.js';
 import {
+  cannotFixWords,
   channelChoices,
+  choiceWords,
   draftLabel,
   exportFileName,
+  fixAllWords,
+  fixPick,
+  landingWords,
   loadedRegions,
   newChannelProblem,
   outlineProblems,
@@ -27,6 +33,7 @@ import {
   saveReadiness,
   splitPartner,
   storageKey,
+  stretchTitle,
   type ListedPiece,
 } from './editor-view.js';
 
@@ -289,6 +296,59 @@ describe('the region editor page', () => {
     ]);
   });
 
+  it('words a fix: the stretch, each choice, where each place ends up, why not', () => {
+    const name = (key: string): string => `#${key}`;
+    expect(stretchTitle([['west'], ['east']], name)).toBe('The slivers between #west and #east');
+    expect(stretchTitle([['south'], ['west', 'north']], name)).toBe(
+      'Where #south, #west and #north meet',
+    );
+    expect(choiceWords(0, [['west'], ['east']], name)).toBe("#west's border");
+    expect(choiceWords(1, [['south'], ['west', 'north']], name)).toBe(
+      'the borders of #west and #north',
+    );
+    expect(choiceWords('midline', [['west'], ['east']], name)).toBe('the midline');
+    // The places are numbered as the page gave them: the gyms, then the Wayspots.
+    expect(landingWords({ place: 1, key: 'east' }, DATA, name)).toBe(
+      'Gym #2 “Bridge” ends up in #east.',
+    );
+    expect(landingWords({ place: 3, key: null }, DATA, name)).toBe(
+      'Stop “Mural” ends up in no region.',
+    );
+    expect(landingWords({ place: 4, key: 'west' }, DATA, name)).toBe(
+      'Power spot “Kiosk” ends up in #west.',
+    );
+    expect(cannotFixWords('too-wide')).toBe(
+      'Its borders lie more than 150 m apart: draw it by hand.',
+    );
+    expect(cannotFixWords('new-pieces')).toBe(
+      'That would make a new overlap or gap: draw it by hand.',
+    );
+    expect(cannotFixWords('corner-outside')).toBe('The corner must stay inside the sliver.');
+    expect(fixAllWords(3, 0, 0)).toBe('Fixed 3 stretches.');
+    expect(fixAllWords(1, 2, 1)).toBe(
+      'Fixed 1 stretch; left 2 as they were; 1 could not be fixed automatically: draw it by hand.',
+    );
+    expect(fixAllWords(0, 0, 0)).toBe('Nothing was fixed.');
+    expect(fixAllWords(2, 0, 0, 1)).toBe(
+      'Fixed 2 stretches; 1 taken back, as it would make a new overlap or gap: draw it by hand.',
+    );
+  });
+
+  it('keeps the midline shown after a drag of its corner, refused or not', () => {
+    const option = (choice: FixChoice, ok: boolean): { choice: FixChoice; ok: boolean } => ({
+      choice,
+      ok,
+    });
+    const refused = [option(0, true), option(1, true), option('midline', false)];
+    // An answer to a drag: the midline stays, with why it cannot be applied.
+    expect(fixPick(refused, 'midline', true)).toBe('midline');
+    // Otherwise a choice that cannot be made gives way: the midline, else the first that can.
+    expect(fixPick(refused, 'midline', false)).toBe(0);
+    expect(fixPick(refused, 1, false)).toBe(1);
+    expect(fixPick([option(0, true), option('midline', true)], undefined, false)).toBe('midline');
+    expect(fixPick([option(0, false)], undefined, false)).toBeUndefined();
+  });
+
   it('knows which region a new one was split off', () => {
     const state = record(emptyEdits(), {
       kind: 'split',
diff --git a/src/web/client/editor-view.ts b/src/web/client/editor-view.ts
index 4926156dbea6e6b96b17b42a5df3e63fdd792e41..b6d91aadb6b66335fbe041e478991cdeca0ef875 100644
--- a/src/web/client/editor-view.ts
+++ b/src/web/client/editor-view.ts
@@ -8,6 +8,8 @@ import {
   type EditState,
   type LoadedRegion,
 } from '../../domain/regions/edits.js';
+import type { Landing } from '../../domain/regions/fix-all.js';
+import type { FixChoice, FixRefusal, PieceFix } from '../../domain/regions/fix.js';
 import { channelKey } from '../../domain/regions/region-import.js';
 import type { EditorData, SaveAnswer } from '../../domain/web/editor-data.js';
 
@@ -376,6 +378,117 @@ export function pieceLine(piece: ListedPiece, name: (key: string) => string): st
   return `${head}${between}${inside.length > 0 ? `: ${inside.join(', ')}` : ''}`;
 }
 
+/** "#a and #b", "#a, #b and #c". */
+function listed(names: readonly string[]): string {
+  if (names.length <= 1) return names.join('');
+  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
+}
+
+/** What a stretch of slivers is called (plan 8M-2F): between two regions, or where three meet. */
+export function stretchTitle(sides: readonly string[][], name: (key: string) => string): string {
+  const keys = sides.flat().map(name);
+  return keys.length === 2 ? `The slivers between ${listed(keys)}` : `Where ${listed(keys)} meet`;
+}
+
+/** A choice of a fix, after "take": a side's border (or borders), or the midline. */
+export function choiceWords(
+  choice: FixChoice,
+  sides: readonly string[][],
+  name: (key: string) => string,
+): string {
+  if (choice === 'midline') return 'the midline';
+  const keys = (sides[choice] ?? []).map(name);
+  return keys.length === 1 ? `${keys[0] ?? ''}'s border` : `the borders of ${listed(keys)}`;
+}
+
+/** What the page calls a place: by its number, the gyms first, then the Wayspots. */
+function placeWords(index: number, data: Pick<EditorData, 'gyms' | 'wayspots'>): string {
+  const gym = data.gyms[index];
+  if (gym) return `Gym #${gym[0]} “${gym[3]}”`;
+  const wayspot = data.wayspots[index - data.gyms.length];
+  if (!wayspot) return 'A place';
+  const [kind, , , title] = wayspot;
+  const what = kind === 'stop' ? 'Stop' : kind === 'powerspot' ? 'Power spot' : 'Wayfarer gym';
+  return `${what} “${title}”`;
+}
+
+/** "Gym #3092 “Library” ends up in #east." */
+export function landingWords(
+  landing: Landing,
+  data: Pick<EditorData, 'gyms' | 'wayspots'>,
+  name: (key: string) => string,
+): string {
+  const where = landing.key === null ? 'no region' : name(landing.key);
+  return `${placeWords(landing.place, data)} ends up in ${where}.`;
+}
+
+/** Why a piece or a choice cannot be fixed, in a sentence. */
+export function cannotFixWords(
+  reason: Extract<PieceFix, { cannot: string }>['cannot'] | FixRefusal,
+): string {
+  switch (reason) {
+    case 'too-wide':
+      return 'Its borders lie more than 150 m apart: draw it by hand.';
+    case 'tangled':
+      return 'It is no sliver between two or three regions: draw it by hand.';
+    case 'stale':
+      return 'Its borders changed meanwhile: try again.';
+    case 'corner-outside':
+      return 'The corner must stay inside the sliver.';
+    case 'crosses-itself':
+      return 'An outline would cross itself: draw it by hand.';
+    case 'too-many-corners':
+      return 'An outline would have more than 5,000 corners: draw it by hand.';
+    case 'new-pieces':
+      return 'That would make a new overlap or gap: draw it by hand.';
+  }
+}
+
+/** What the page says when the worker could not work a fix out. */
+export const FIX_FAILED_WORDS = 'I could not work this fix out: draw it by hand.';
+
+/**
+ * What Fix all did, in a sentence: fixed, skipped, refused, and taken back at its end
+ * (together they would make an overlap or gap the regions as loaded lack).
+ */
+export function fixAllWords(fixed: number, skipped: number, refused: number, undone = 0): string {
+  const parts = [
+    ...(fixed > 0 ? [`Fixed ${count(fixed, 'stretch', 'stretches')}`] : []),
+    ...(skipped > 0 ? [`left ${skipped} as ${skipped === 1 ? 'it was' : 'they were'}`] : []),
+    ...(refused > 0
+      ? [
+          `${refused} could not be fixed automatically: draw ${refused === 1 ? 'it' : 'them'} by hand`,
+        ]
+      : []),
+    ...(undone > 0
+      ? [
+          `${undone} taken back, as ${undone === 1 ? 'it' : 'they'} would make a new overlap or gap: draw ${undone === 1 ? 'it' : 'them'} by hand`,
+        ]
+      : []),
+  ];
+  if (parts.length === 0) return 'Nothing was fixed.';
+  const text = parts.join('; ');
+  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
+}
+
+/**
+ * The choice a fix shows after an answer of the worker: after a drag of the corner where three
+ * regions meet, the midline, refused or not (its refusal is shown under it, and Apply is off);
+ * else the one shown before while it can be made, the midline when it can, or the first that can.
+ */
+export function fixPick(
+  options: readonly { choice: FixChoice; ok: boolean }[],
+  shown: FixChoice | undefined,
+  dragged: boolean,
+): FixChoice | undefined {
+  if (dragged) return 'midline';
+  if (options.some((option) => option.ok && option.choice === shown)) return shown;
+  return (
+    options.find((option) => option.ok && option.choice === 'midline') ??
+    options.find((option) => option.ok)
+  )?.choice;
+}
+
 /** The region a region was split from, or that was split off it, by the last split of either. */
 export function splitPartner(state: EditState, key: string): string | undefined {
   for (const edit of [...state.edits].reverse()) {
diff --git a/src/web/client/editor.css b/src/web/client/editor.css
index 1724362dbd1fa4cd1ac75b68a782eb299bb9b549..f2dfaaa206624278d71d76395a7c1fa9482022e2 100644
--- a/src/web/client/editor.css
+++ b/src/web/client/editor.css
@@ -101,3 +101,34 @@
 #panel .conflict {
   margin: 6px 0;
 }
+
+#panel .piece-list button {
+  font: inherit;
+  font-size: 12px;
+  padding: 0 6px;
+}
+
+#panel .piece-list .cannot-fix {
+  color: #6b6b6b;
+  font-size: 12px;
+}
+
+#panel .fix-option {
+  margin: 4px 0;
+  padding: 2px 6px;
+  border-left: 3px solid transparent;
+}
+
+#panel .fix-option.chosen {
+  border-left-color: #111111;
+  background: #eef3ee;
+}
+
+/* Where three regions meet, dragged on the map before a fix is applied. */
+.fix-corner {
+  background: #ffffff;
+  border: 3px solid #111111;
+  border-radius: 50%;
+  box-sizing: border-box;
+  cursor: move;
+}
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index d63c089cb045b6485840d3bf5e5690180ec37a94..335f67320b722c284021813c01ee0e4c58e0f543 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -12,6 +12,7 @@ import {
   record,
   redo,
   saveRequest,
+  toLatLons,
   undo,
   type Applied,
   type Bases,
@@ -20,28 +21,39 @@ import {
   type EditState,
   type LoadedRegion,
 } from '../../domain/regions/edits.js';
+import type { FixChoice } from '../../domain/regions/fix.js';
 import { MAX_NEW_CATEGORY, MAX_NEW_CHANNEL_NAME } from '../../domain/regions/save-plan.js';
 import { splitOutline, type Split } from '../../domain/regions/split.js';
-import { normalisedOutline } from '../../domain/regions/version.js';
-import type { EditorData, Worded } from '../../domain/web/editor-data.js';
+import { normalisedOutline, roundSix } from '../../domain/regions/version.js';
+import type { EditorData, Point, Worded } from '../../domain/web/editor-data.js';
 import { addTiles, byId, getJson, say, showAccount, whoIsAsking } from './common.js';
 import type {
   CoverageAnswer,
   CoverageRegion,
   CoverageRequest,
   PlaceKind,
+  ShownOption,
+  ShownOutline,
   ShownPiece,
+  ShownStretch,
 } from './coverage-check.js';
 import {
+  cannotFixWords,
   channelChoices,
+  choiceWords,
   count,
   draftLabel,
   exportFileName,
+  FIX_FAILED_WORDS,
+  fixAllWords,
+  fixPick,
+  landingWords,
   loadedRegions,
   outlineProblems,
   pickerChange,
   pickerShown,
   pieceLine,
+  pieceOrder,
   placeCounts,
   readSaveAnswer,
   reloadFailedLine,
@@ -49,6 +61,7 @@ import {
   saveReadiness,
   splitPartner,
   storageKey,
+  stretchTitle,
   type PickerState,
   type PlaceCounts,
   type ReadAnswer,
@@ -88,6 +101,7 @@ const OUTSIDE = '#ff8f00';
 const OVERLAP = '#e53935';
 const GAP = '#6a1b9a';
 const THEIRS = '#1565c0';
+const PREVIEW = '#111111';
 /** How long the editor waits after an edit before the overlaps and gaps are worked out again. */
 const CHECK_DELAY_MS = 400;
 /** How many overlaps and gaps the panel lists; the map shades them all. */
@@ -153,6 +167,23 @@ const sameRing = (a: readonly LatLon[] | null, b: readonly LatLon[]): boolean =>
   a.length === b.length &&
   a.every((p, i) => p.lat === b[i]?.lat && p.lon === b[i]?.lon);
 
+/** A fix's outlines as one staged edit (one step of undo). */
+const fixEdit = (outlines: readonly ShownOutline[], bases: (keys: string[]) => Bases): Edit => ({
+  kind: 'batch',
+  edits: outlines.map(({ key, outline }) => ({
+    kind: 'outline',
+    key,
+    outline: toLatLons(outline),
+    bases: bases([key]),
+  })),
+});
+
+/**
+ * The corner marker's place above other markers: above Geoman's vertex and hint markers (whose
+ * offsets go to 150), so that it is the one a drag takes.
+ */
+const CORNER_Z_OFFSET = 1_000;
+
 /** Shows a preview's or an outcome's sentences and lists in an element, as text. */
 function showWorded(target: HTMLElement, worded: Worded): void {
   for (const line of worded.lines) target.append(element('p', line));
@@ -186,6 +217,32 @@ class Editor {
    * panel is drawn anew, dropped by any other edit, undo, redo or a reload.
    */
   private picker: PickerState | undefined;
+  /**
+   * Whether the list of overlaps and gaps is worst first: the page was opened with nothing
+   * staged for the server (spec 4.3, "the first time … worst first").
+   */
+  private readonly worstFirst: boolean;
+  /**
+   * The Fix of one stretch (plan 8M-2F): its id, the worker's answer once it came, the choice
+   * shown, where three regions meet as dragged, and how many answers are still to come (Apply
+   * waits for the answer to the last drag).
+   */
+  private fixing:
+    | {
+        stretch: string;
+        answer?: Extract<CoverageAnswer, { kind: 'fix-options' }>;
+        picked?: FixChoice;
+        corner?: Point;
+        waiting: number;
+      }
+    | undefined;
+  /** Fix all: waiting for the worker, or its question. */
+  private fixingAll: 'working' | Extract<CoverageAnswer, { kind: 'fix-all' }> | undefined;
+  /** The number of the page's last request of Fix all: only the answer to it is taken. */
+  private fixAsk = 0;
+  /** What a fix would make, dashed, and the corner where three regions meet. */
+  private readonly fixPreview = L.layerGroup();
+  private corner: L.Marker | undefined;
   /** The parts of the panel an answer of the worker changes (`checked`), as last drawn. */
   private readonly checkedParts = {
     reasons: element('div'),
@@ -216,10 +273,14 @@ class Editor {
     this.key = storageKey(data.guild.id, data.userId);
     this.loaded = loadedRegions(data);
     this.state = readStaged(this.storage, this.key);
+    this.worstFirst = this.state.edits.length === 0 && this.state.undone.length === 0;
     this.applied = applyEdits(this.loaded, this.state);
     this.counts = placeCounts(this.applied.drafts, data);
     worker.addEventListener('message', (event: MessageEvent<CoverageAnswer>) => {
-      this.answered(event.data);
+      const answer = event.data;
+      if (answer.kind === 'check') this.answered(answer);
+      else if (answer.kind === 'fix-options') this.fixAnswered(answer);
+      else this.fixAllAnswered(answer);
     });
     // A worker that does not load works nothing out: Save then waits for nothing (the server
     // checks the overlaps and gaps of a save itself).
@@ -278,6 +339,7 @@ class Editor {
     this.removed.addTo(map);
     this.theirs.addTo(map);
     this.shaded.addTo(map);
+    this.fixPreview.addTo(map);
     // The names are constants of ours: Leaflet sets them as HTML.
     L.control
       .layers(
@@ -360,9 +422,15 @@ class Editor {
       if (chosen) void this.loadKml(chosen);
     });
     const ready = this.readiness();
+    const fixable = this.pieces.some((piece) => 'stretch' in piece.fix);
     tools.append(
       button('Undo', () => this.step(undo), readOnly || this.state.edits.length === 0),
       button('Redo', () => this.step(redo), readOnly || this.state.undone.length === 0),
+      button(
+        'Fix all slivers…',
+        () => this.startFixAll(),
+        readOnly || this.checking || !fixable || this.fixingAll !== undefined,
+      ),
       button('Load KML', () => file.click(), readOnly),
       file,
       button('Export KML', () => this.exportKml()),
@@ -399,6 +467,8 @@ class Editor {
 
   /** After every change of the staged edits: kept, counted, coloured, checked, shown. */
   private changed(): void {
+    // A fix shown was worked out on the regions before: it is dropped.
+    this.dropFixes();
     this.applied = applyEdits(this.loaded, this.state);
     const stored = writeStaged(this.storage, this.key, this.state);
     if (stored !== this.stored) {
@@ -639,7 +709,7 @@ class Editor {
     }, CHECK_DELAY_MS);
   }
 
-  private answered(answer: CoverageAnswer): void {
+  private answered(answer: Extract<CoverageAnswer, { kind: 'check' }>): void {
     if (answer.seq !== this.seq) return;
     this.checking = false;
     this.checkFailed = answer.failed;
@@ -685,6 +755,7 @@ class Editor {
     const panel = byId('panel');
     panel.replaceChildren();
     if (this.dialog) panel.append(this.dialog);
+    this.fixSection(panel);
     const { reasons, warning, pieces } = this.checkedParts;
     panel.append(reasons, warning);
     this.conflictSection(panel);
@@ -928,9 +999,7 @@ class Editor {
 
   private pieceList(panel: HTMLElement): void {
     if (this.pieces.length === 0) return;
-    const sorted = [...this.pieces].sort(
-      (a, b) => Number(b.fresh) - Number(a.fresh) || b.area - a.area,
-    );
+    const sorted = [...this.pieces].sort(pieceOrder(this.worstFirst));
     const overlaps = this.pieces.filter((piece) => piece.kind === 'overlap').length;
     panel.append(
       element('h2', `Overlaps (${overlaps}) and gaps (${this.pieces.length - overlaps})`),
@@ -948,6 +1017,14 @@ class Editor {
           maxZoom: 18,
         });
       });
+      const { fix } = piece;
+      if ('cannot' in fix) {
+        item.append(element('div', cannotFixWords(fix.cannot), 'cannot-fix'));
+      } else if (!this.data.readOnly) {
+        const open = button('Fix…', () => this.openFix(fix.stretch));
+        open.addEventListener('click', (event) => event.stopPropagation());
+        item.append(' ', open);
+      }
       list.append(item);
     }
     panel.append(list);
@@ -956,6 +1033,277 @@ class Editor {
     }
   }
 
+  /** Fix of one stretch (plan 8M-2F): its choices, asked of the worker. */
+  private openFix(stretch: string): void {
+    if (this.checking) {
+      say('Wait until the overlaps and gaps are worked out.');
+      return;
+    }
+    this.dropFixes();
+    this.fixing = { stretch, waiting: 1 };
+    this.post({ kind: 'fix-options', seq: this.seq, stretch });
+    this.panel();
+    this.toolbar();
+  }
+
+  private fixAnswered(answer: Extract<CoverageAnswer, { kind: 'fix-options' }>): void {
+    const fixing = this.fixing;
+    if (!fixing || answer.seq !== this.seq) return;
+    fixing.waiting = Math.max(0, fixing.waiting - 1);
+    if (answer.failed) {
+      this.closeFix();
+      say(FIX_FAILED_WORDS);
+      return;
+    }
+    if (!answer.stretch) {
+      this.dropFixes();
+      say('Those slivers changed meanwhile: pick them from the list again.');
+      this.panel();
+      return;
+    }
+    // An answer to a drag before the last: the last one's is coming.
+    if (answer.stretch.id !== fixing.stretch || fixing.waiting > 0) return;
+    const first = fixing.answer === undefined;
+    fixing.answer = answer;
+    fixing.picked = fixPick(answer.options, fixing.picked, fixing.corner !== undefined);
+    if (first) this.fitStretch(answer.stretch);
+    this.drawFix();
+    this.panel();
+  }
+
+  private fitStretch(stretch: ShownStretch): void {
+    this.map.fitBounds(L.latLngBounds(stretch.box), { padding: [40, 40], maxZoom: 18 });
+  }
+
+  /** What the choice shown would make, dashed; the corner where three meet, to drag. */
+  private drawFix(): void {
+    this.fixPreview.clearLayers();
+    this.corner?.remove();
+    this.corner = undefined;
+    const fixing = this.fixing;
+    const option = fixing?.answer?.options.find((one) => one.choice === fixing.picked);
+    if (option) this.previewOutlines(option.outlines);
+    const corner = fixing?.answer?.stretch?.corner;
+    if (!fixing || !corner || fixing.picked !== 'midline') return;
+    const marker = L.marker(corner, {
+      draggable: true,
+      icon: L.divIcon({ className: 'fix-corner', iconSize: [14, 14] }),
+      zIndexOffset: CORNER_Z_OFFSET,
+      pmIgnore: true,
+    });
+    marker.on('dragend', () => {
+      const { lat, lng } = marker.getLatLng();
+      const moved: Point = [roundSix(lat), roundSix(lng)];
+      fixing.corner = moved;
+      // Apply waits for the choices at the new corner.
+      fixing.waiting += 1;
+      this.post({ kind: 'fix-options', seq: this.seq, stretch: fixing.stretch, corner: moved });
+      this.panel();
+    });
+    marker.addTo(this.map);
+    this.corner = marker;
+  }
+
+  private previewOutlines(outlines: readonly ShownOutline[]): void {
+    this.fixPreview.clearLayers();
+    for (const { outline } of outlines) {
+      L.polygon(outline, {
+        color: PREVIEW,
+        weight: 2,
+        dashArray: '6 4',
+        fill: false,
+        pmIgnore: true,
+      }).addTo(this.fixPreview);
+    }
+  }
+
+  /** Any fix shown is dropped: its preview, its corner, its dialog. */
+  private dropFixes(): void {
+    this.fixing = undefined;
+    this.fixingAll = undefined;
+    this.fixPreview.clearLayers();
+    this.corner?.remove();
+    this.corner = undefined;
+  }
+
+  private closeFix(): void {
+    this.dropFixes();
+    this.panel();
+    this.toolbar();
+  }
+
+  /** The section of the panel of a fix or of Fix all. */
+  private fixSection(panel: HTMLElement): void {
+    const name = (key: string): string => this.name(key);
+    if (this.fixingAll !== undefined) {
+      const section = element('section', undefined, 'dialog');
+      section.append(element('h2', 'Fix all slivers'));
+      const step = this.fixingAll;
+      if (step === 'working' || step.question === null) {
+        section.append(element('p', 'Fixing the slivers with nothing in them…'));
+        section.append(button('Cancel', () => this.closeFix()));
+        panel.append(section);
+        return;
+      }
+      const { stretch, options } = step.question;
+      section.append(
+        element('p', `${count(step.fixed, 'stretch', 'stretches')} fixed so far.`),
+        element(
+          'p',
+          `${stretchTitle(stretch.sides, name)}: ${count(stretch.places.length, 'place')} would change region. Which line do the regions take?`,
+        ),
+      );
+      for (const option of options) {
+        const take = button(
+          `Take ${choiceWords(option.choice, stretch.sides, name)}`,
+          () => this.answerFixAll(option.choice),
+          !option.ok,
+        );
+        take.addEventListener('mouseenter', () => this.previewOutlines(option.outlines));
+        section.append(take, this.landings(option, name));
+      }
+      section.append(
+        button('Leave it', () => this.answerFixAll('skip')),
+        button('Stop here', () => this.answerFixAll('stop')),
+        button('Cancel', () => this.closeFix()),
+      );
+      panel.append(section);
+      return;
+    }
+    const fixing = this.fixing;
+    if (!fixing) return;
+    const section = element('section', undefined, 'dialog');
+    const answer = fixing.answer;
+    const stretch = answer?.stretch;
+    if (!answer || !stretch) {
+      section.append(element('p', 'Working out the fixes…'));
+      section.append(button('Cancel', () => this.closeFix()));
+      panel.append(section);
+      return;
+    }
+    section.append(element('h2', stretchTitle(stretch.sides, name)));
+    section.append(element('p', 'The shared line is one of these (dashed on the map):'));
+    for (const option of answer.options) {
+      const row = element(
+        'div',
+        undefined,
+        option.choice === fixing.picked ? 'fix-option chosen' : 'fix-option',
+      );
+      row.append(
+        button(
+          `Take ${choiceWords(option.choice, stretch.sides, name)}`,
+          () => {
+            fixing.picked = option.choice;
+            this.drawFix();
+            this.panel();
+          },
+          !option.ok,
+        ),
+        this.landings(option, name),
+      );
+      section.append(row);
+    }
+    if (stretch.corner && fixing.picked === 'midline') {
+      section.append(
+        element(
+          'p',
+          fixing.waiting > 0
+            ? 'Working out the fix at the corner as dragged…'
+            : 'Drag the round marker to move where the three regions meet, inside the sliver.',
+        ),
+      );
+    }
+    const picked = answer.options.find((option) => option.choice === fixing.picked);
+    section.append(
+      button('Apply', () => this.applyFix(), !picked?.ok || fixing.waiting > 0),
+      button('Cancel', () => this.closeFix()),
+    );
+    panel.append(section);
+  }
+
+  /** Where each place ends up under a choice, or why it cannot be made. */
+  private landings(option: ShownOption, name: (key: string) => string): HTMLElement {
+    if (!option.ok) return element('p', cannotFixWords(option.reason ?? 'stale'), 'warning');
+    const list = element('ul');
+    for (const landing of option.landings) {
+      list.append(element('li', landingWords(landing, this.data, name)));
+    }
+    return list;
+  }
+
+  /** The choice shown, staged as one edit. */
+  private applyFix(): void {
+    const fixing = this.fixing;
+    const option = fixing?.answer?.options.find((one) => one.choice === fixing.picked);
+    if (!option?.ok || fixing?.waiting !== 0) return;
+    this.edit(fixEdit(option.outlines, (keys) => this.bases(keys)));
+    this.redraw();
+    say('Fixed, as one change: Undo takes it back.');
+  }
+
+  /** Fix all slivers (plan 8M-2F): the worker fixes the empty stretches and asks about the rest. */
+  private startFixAll(): void {
+    if (this.checking) {
+      say('Wait until the overlaps and gaps are worked out.');
+      return;
+    }
+    this.dropFixes();
+    this.fixingAll = 'working';
+    this.fixAsk += 1;
+    this.post({ kind: 'fix-all', seq: this.seq, ask: this.fixAsk });
+    this.panel();
+    this.toolbar();
+  }
+
+  /** An answer to Fix all's question shown: sent once (a second click finds none shown). */
+  private answerFixAll(choice: FixChoice | 'skip' | 'stop'): void {
+    const step = this.fixingAll;
+    if (step === undefined || step === 'working' || !step.question) return;
+    this.fixingAll = 'working';
+    this.fixAsk += 1;
+    this.fixPreview.clearLayers();
+    this.post({
+      kind: 'fix-all-answer',
+      seq: this.seq,
+      ask: this.fixAsk,
+      question: step.question.number,
+      choice,
+    });
+    this.panel();
+  }
+
+  private fixAllAnswered(answer: Extract<CoverageAnswer, { kind: 'fix-all' }>): void {
+    // Only the answer to the page's last request of this Fix all.
+    if (this.fixingAll !== 'working' || answer.seq !== this.seq || answer.ask !== this.fixAsk) {
+      return;
+    }
+    if (answer.failed) {
+      this.dropFixes();
+      this.showDialog(FIX_FAILED_WORDS);
+      this.toolbar();
+      return;
+    }
+    if (answer.question) {
+      this.fixingAll = answer;
+      this.fitStretch(answer.question.stretch);
+      const first = fixPick(answer.question.options, undefined, false);
+      const shown = answer.question.options.find((option) => option.choice === first);
+      this.previewOutlines(shown?.outlines ?? []);
+      this.panel();
+      return;
+    }
+    this.dropFixes();
+    const words = fixAllWords(answer.fixed, answer.skipped, answer.refused, answer.undone);
+    if (answer.outlines.length > 0) {
+      this.edit(fixEdit(answer.outlines, (keys) => this.bases(keys)));
+      this.redraw();
+      this.showDialog(`${words} Staged as one change: Undo takes it back.`);
+    } else {
+      this.showDialog(words);
+    }
+    this.toolbar();
+  }
+
   /** A KML file into the staged edits (spec 4.2), as one edit. */
   private async loadKml(file: File): Promise<void> {
     if (file.size > MAX_KML_BYTES) {
````

### Task 5: Region editor: Fix in the docs, and its staging checklist

Prototype commit: `3df263b96d6aad48bedc6ef762d9e2ccb3932e29`

`web.md` (Fix, its budget and measurements, the worst-first order), `gyms-and-regions.md`, `testing.md`; the staging checklist `docs/superpowers/plans/2026-10-16-phase-8m2f-staging.md`.

**Files:**

```
 docs/architecture/gyms-and-regions.md                   |  2 +-
 docs/architecture/testing.md                            |  4 ++--
 docs/architecture/web.md                                |  7 ++++---
 docs/superpowers/plans/2026-10-16-phase-8m2f-staging.md | 47 +++++++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 54 insertions(+), 6 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check docs/architecture/gyms-and-regions.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-16-phase-8m2f-staging.md`.
- [ ] **Step 4: Check the transcription:** `git diff 3df263b96d6aad48bedc6ef762d9e2ccb3932e29 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m2f-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Region editor: Fix in the docs, and its staging checklist`, the paragraph above as the body and the trailer, staging exactly
  `docs/architecture/gyms-and-regions.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-16-phase-8m2f-staging.md`.

````diff
diff --git a/docs/architecture/gyms-and-regions.md b/docs/architecture/gyms-and-regions.md
index faf86280a828ef5fca86fbfd38d455c285d7d7d7..685b0314bc700ecad315e1dff00984973eb6ac48 100644
--- a/docs/architecture/gyms-and-regions.md
+++ b/docs/architecture/gyms-and-regions.md
@@ -34,6 +34,6 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 ## Regions
 
 - Regions are administered through `ctx.regionAdmin` (`RegionAdminService`, `src/services/region-admin-service.ts`): `preview`, `import`, `list`, `exported`, `remove`, under the `AdminLock` (`src/services/admin-lock.ts`) it shares with `GymAdminService`. An import creates channels and categories first (at most `MAX_NEW_CHANNELS` per import), writes every outline in one transaction (`RegionRepository.saveOutlines`), reloads both directories, takes back an orphan forum beside its channel or sets up a forum (`PartyService.setupForums(guildId, only)`), all inside the lock; nothing is written before staff press Import. A removal closes the region (`PartyStore.closeRegion`: an add for it throws `RegionClosedError`, which reports, meetups, trains and moves answer as no region), ends its parties, deletes the row (forum and summary ids from the locked row; `SavedRoutes` go by their foreign key), reloads, and keeps or deletes the forum. Regions are never deleted by themselves. Creating channels and deleting a forum need the staff member's own Manage Channels; audit-log reasons carry their id. `preview` takes the regions removed in the same save (`removing`, the region editor's): `planImport` counts their gyms among those left in no region.
-- The region editor on Pine's web pages (plan 8M-2; `docs/architecture/web.md`, "The region editor") saves through the same service: its save is `planSave` (`src/domain/regions/save-plan.ts`, the areas of an import named by their channels' current names, and the removals), then `preview` and `save` (one run under the lock: the versions checked again inside it, then the import's steps and each removal through the inner `importNow` / `removeNow`, which `import` and `remove` also run under the lock; audit-log reasons `region editor by <id>`), worded by `previewWords(…, 'editor')` / `outcomeWords` (`src/commands/regions/import.ts`, which `renderPreview` and `renderOutcome` also use) and `/region remove`'s `goesWith` / `outcomeLines`, as plain text (`plainWords`). `/region edit` (`src/commands/regions/edit.ts`, only with `settings.web`) gives its address and a login link. The pure parts of the editor are in `src/domain/regions/`: `version.ts` (`regionVersion`), `coverage.ts` (overlaps, gaps, their areas, `newPieces`, `newProblems`), `split.ts` (`splitOutline`), `edits.ts` (the staged edits); the web staff check reuses `isBotManagement`, the logic of `requireBotManagement`.
+- The region editor on Pine's web pages (plan 8M-2; `docs/architecture/web.md`, "The region editor") saves through the same service: its save is `planSave` (`src/domain/regions/save-plan.ts`, the areas of an import named by their channels' current names, and the removals), then `preview` and `save` (one run under the lock: the versions checked again inside it, then the import's steps and each removal through the inner `importNow` / `removeNow`, which `import` and `remove` also run under the lock; audit-log reasons `region editor by <id>`), worded by `previewWords(…, 'editor')` / `outcomeWords` (`src/commands/regions/import.ts`, which `renderPreview` and `renderOutcome` also use) and `/region remove`'s `goesWith` / `outcomeLines`, as plain text (`plainWords`). `/region edit` (`src/commands/regions/edit.ts`, only with `settings.web`) gives its address and a login link. The pure parts of the editor are in `src/domain/regions/`: `version.ts` (`regionVersion`), `coverage.ts` (overlaps, gaps, their areas, `newPieces`, `newProblems`), `split.ts` (`splitOutline`), `edits.ts` (the staged edits), `fix.ts` and `fix-all.ts` (Fix and "Fix all slivers", plan 8M-2F, with `lines.ts`: lines measured flat in metres); the web staff check reuses `isBotManagement`, the logic of `requireBotManagement`.
 - KML is read by pure code: `src/domain/geo/xml.ts` (a linear reader that never throws; DOCTYPE refused), `kml.ts` (`readKml`, `writeKml`, `kmlFiles`; at most `MAX_KML_AREAS` areas and `MAX_KML_CORNERS` corners in a file, descriptions as one line of plain text), `outline.ts` (`tidyOutline`: closed, latitude first, at most 5,000 corners, no self-crossing; checked by a longitude sweep), and `src/domain/regions/region-import.ts` (`planImport`, the channel a name stands for by the legacy rule, near misses, crowded categories). Gyms are tested against an outline's bounding box before the ring. The picture of a region is drawn from a simplified outline when the address would be too long; the stored outline never is.
 - `/bounds` is a members' command (the picture and the gym count of the region of the channel; `boundsMessage`: `### The area of <#channel>`, the count, the map as a gallery). `/find-region` answers with `findRegionMessage` (the sentence, the map, `OSM_ATTRIBUTION` in small print). Every message of `/region` is v2 (plan 8B-4, `REGION_COLOUR`): the preview of `/region import` and its outcome are one container (`### Import regions` and the sentences within `SENTENCES`, a line, **Would be imported** / **Left out** or **Imported** / **Not imported** within `IMPORT_LIST` and `LEFT_OUT_LIST`, `preview.txt` (of the outcome `outcome.txt`, `OUTCOME_FILE`) as a file component and a file of the message (`V2Message.files`) whenever a list or the sentences are cut, every line in it with channels by their names; **Not imported** has the larger room, the buttons inside; `importMessage`); the question and outcome of `/region remove` are `regionQuestion`s; answers go through `answerRegion`, and what the controls say (working, expired, cancelled, a refusal) through `sayRegion`. Forums that party rows name and no region has are `PartyService.orphanForums(guildId)`: named by `/region list` and `/admin setup-forums`, swept by `sweepPosts`. Region tests use `test/support/region-admin.ts` and `region-commands.ts`; the custom-id kind `region` belongs to the questions of `/region`.
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 30f17f58cd365f278dc313353a5beed1f4b38b89..37b5606b404f2480f866de64cae4326d0f92ab79 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -47,8 +47,8 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 ## The web server
 
 - Route tests build the server with `webServerWith(options)` (`test/support/web.ts`) and ask it with Fastify's `inject` (no port, no network); close `app` after each test. It gives `TEST_WEB` (`https://map.example.test`, OpenStreetMap) changed by `web`, the server of the fake interactions as the only one the bot is in (`servers`), nobody a member (`members`: a `FakeMemberDirectory`), a `FakeOAuth` (`knows(code, user)`, `exchanged`, `whoFails`; `oauth: undefined` is no client secret), sessions in memory (`sessions`: `MemoryWebSessions`, `sessionService`) on a clock of the test's (`clock.now`, from `WEB_START`), `loginLinks`, and `loggedIn(userId, name)` for the `cookie` header of a session. `setCookies(answer)` and `cookieOf(answer, name)` read what an answer set. The map's data comes from `geoSourcesWith()` (the invented gyms and regions under real directories, channels named `west` and `east`; pass `{ geo: sources }`), the page's bundle from `builtAssets()` (a folder with hashed names, made in the temp folder and removed when the test that called it is over, through `onTestFinished`: call it inside a test, not in a `beforeAll`; without it the page answers that it is not built). The cookie names follow the public address: `__Host-pine_session` and `__Secure-pine_oauth` under `TEST_WEB`, the plain names under `web: { publicUrl: 'http://localhost:…' }`; `loggedIn` uses `sessionService.cookieName`. The address of a request is `inject`'s `remoteAddress` (behind a proxy: `web: { trustProxy: true }`, a nearby `remoteAddress` and an `x-forwarded-for` header).
-- The region editor (plan 8M-2): who is staff is `FakeRegionStaff` (pass it as `staff`; nobody is staff until `asStaff(userId, mayManageChannels)` or `answer(userId, staffAnswer)`; `asked` records every question, `failing` makes Discord away); its data comes from `editorSourcesWith(wayspotRows)` (the sources of `geoSourcesWith` with kept Wayspots and the channels as `ServerChannel`s: `west`, `east` in `Town`, `south`, a forum; pass `{ editor: sources }`); preview and save run over region administration on fakes, `regionEditingWith()` (`regionAdminWith` as the bot wires it, but the new overlaps and gaps worked out on the test's thread, `inThisThread`; pass `editing`, with a `checker` of the test's own to count or refuse checks; its `regions.rows`, `lock`, `store`, `gateway.auditReasons`, `entries` for the service's log). `SaveCheckWorker` is tested with its real thread through tsx and with `test/support/hanging-thread.ts`, which never answers (its limit by faked `setTimeout`). `posting(userId, name)` gives the headers of a POST of Pine's own page (cookie, `Origin`, CSRF token). `builtAssets()` holds the editor's script, style and worker too.
-- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the worker's `CoverageChecker`, the staged edits in a storage that may throw); Leaflet, Geoman, the worker in a browser and the real tiles are tried at staging.
+- The region editor (plan 8M-2): who is staff is `FakeRegionStaff` (pass it as `staff`; nobody is staff until `asStaff(userId, mayManageChannels)` or `answer(userId, staffAnswer)`; `asked` records every question, `failing` makes Discord away); its data comes from `editorSourcesWith(wayspotRows)` (the sources of `geoSourcesWith` with kept Wayspots and the channels as `ServerChannel`s: `west`, `east` in `Town`, `south`, a forum; pass `{ editor: sources }`); preview and save run over region administration on fakes, `regionEditingWith()` (`regionAdminWith` as the bot wires it, but the new overlaps and gaps worked out on the test's thread, `inThisThread`; pass `editing`, with a `checker` of the test's own to count or refuse checks; its `regions.rows`, `lock`, `store`, `gateway.auditReasons`, `entries` for the service's log). `SaveCheckWorker` is tested with its real thread through tsx and with `test/support/hanging-thread.ts`, which never answers (its limit by faked `setTimeout`). `posting(userId, name)` gives the headers of a POST of Pine's own page (cookie, `Origin`, CSRF token). `builtAssets()` holds the editor's script, style and worker too. Fix and Fix all (plan 8M-2F) are tested on invented outlines at 40° north, where a thousandth of a degree of longitude is about 85 m (`fix.test.ts`, `fix-all.test.ts`, `coverage-check.test.ts`: squares reaching into each other, a border bowing away, a strip closed by a third region, a U-shaped gap round a tongue, borders that touch at a point, a slanted border at six decimals, an outline wound the other way), and on borders generated from a seed (`fix-all.test.ts`, its own little generator: every choice offered gives tidy outlines, nothing new against the regions as loaded, every place that changes region named); the worker's failures by a `CoverageChecker` given work that throws (`new CoverageChecker({ fixOptions: broken })`); a region's real outlines are read only by scratch scripts.
+- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw); Leaflet, Geoman, the worker in a browser and the real tiles are tried at staging.
 
 ## Operations
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 4be7471512c75f928430544cdcd84d7b5f5da2f3..24a9334300dd906da504f6af9b1479e2be69c07b 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -38,15 +38,16 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 and 8M-2; spec `docs/superpow
 - The pages' code is `src/web/client/` with its own `tsconfig.json` (the DOM; the root config excludes the folder), bundled by `scripts/web/build.ts` (`npm run web:build`, also run by `npm run build`) with esbuild: IIFEs for ES2022, minified, into `dist/web/assets/` with hashed names: the map (`map-<hash>.js`, `map-<hash>.css` with Leaflet's CSS, Leaflet's pictures), the region editor (`editor-<hash>.js` with Geoman, `editor-<hash>.css` with Geoman's CSS, and its worker `editor-worker-<hash>.js`); `dist/web/assets.json` names each page's script and style and the worker (`AssetManifest`: `map`, `editor`; read at start by `readAssets`, which takes a manifest of an older build as none). What both pages share (the tiles with Google's layers, the header and its login, reading JSON) is `src/web/client/common.ts`. The rest of `dist/web/` is the compiled server code; the build empties only `assets/`. `/assets/` (`@fastify/static`) serves that one flat folder: no index, no listing, plain file names only; a hashed name `public, max-age=31536000, immutable`, anything else `no-cache`.
 - The page: Leaflet; OpenStreetMap's tiles with their attribution; with Google's tiles a layer switch (roadmap, satellite, hybrid: a session per layer from `createSession`, 2D tiles, the attribution of what is in view from `viewport` after the map rests, shown with "Google Maps"; `src/web/client/layers.ts`). Regions as outlines with their names from zoom 12; gyms as dots, elite raid gyms in their own colour; a popup per gym built as a tree of nodes and rendered with `textContent` only (`gymPopup`, `renderNode`): never HTML from data. Leaflet treats string content as HTML (tooltips, popups, attributions, the layer switch's names): data goes to it as nodes (`renderNode`; a region's label is `regionLabel`), and the only strings it is given are constants of ours and the escaped copyright of `googleAttribution`. The filter box hides gyms whose name and nickname lack a word typed (`gymFilter`: no case, accents or apostrophes) and fits the map to the matches on Enter. The header: "Log in with Discord" (only with the secret) or "Use /maps in Discord to log in.", or the member's name, Log out (a POST with the CSRF token; `logOut`, `src/web/client/logout.ts`: on a 403, the token of a page loaded before a restart, it asks `/api/me` again and tries once more, a session gone by then counting as logged out; a second refusal, any other or a broken connection says "Log out failed; try again.") and why they see only the public map. `?login=failed|expired` is said once and taken out of the address.
 
-## The region editor (plan 8M-2)
+## The region editor (plans 8M-2, 8M-2F)
 
 - **Who:** staff for regions as `/region` admits them, decided per request by `RegionStaffSource.check` (`DiscordRegionStaff`, `src/discord/web-staff.ts`: the member fetched fresh, `fetchGuildMember(…, true)`, then `regionStaffAnswer`, `src/web/region-staff.ts`): an admin, a moderator or a bot developer by role, or the bot's owner (`isBotManagement`, the guard's own check), who also has Manage Server (`/region`'s `default_member_permissions`, which on the web nobody else checks); their own Manage Channels says whether new channels may be made and forums deleted. A server that grants `/region` to a role through its Integrations overrides (Server Settings, Integrations) still needs Manage Server for that role's members on the web: the overrides are not read (Matt, 2026-10-16: Manage Server is kept). `staff`, `not-staff`, `not-member`, `unknown-server` (no `Guild` row yet), or `unreachable` (Discord failed: read-only for staff seen within 30 minutes, 503 for anybody else, nothing written). The session says only who.
 - **The page** `/s/<guild>/regions/edit` (`editorPage`): the template with `data-worker` (the worker's script). Logged out: 401, a page with "Log in with Discord" (when offered, to `/auth/login?next=…`) and "/region edit", saying why the last login did not happen (`?login=failed|expired`); it never sends anybody to Discord by itself, so a failed login cannot loop. Not staff or no member: 403 "Only staff of this server may edit its regions." Discord unreachable: the page, read-only by its data, only for a member Discord said is staff of the server within the last 30 minutes (`StaffSeen`, `src/web/editor-routes.ts`: a `BoundedMap` of `<guild>:<user>` set by every fresh `staff` answer, dropped by any other answer but `unreachable`); anybody else gets 503 "Discord cannot be reached just now, so I cannot tell whether you are staff." (a page; the data as `{ error }`), so that an outage never shows a server's editor data to somebody who is not staff. 20 a minute per address (each load asks Discord).
 - **The data** `GET /s/<guild>/api/regions/edit` (`EditorCache` over `editorView`, `src/domain/web/editor-view.ts`; types in `editor-data.ts`, without imports): the server's regions (id, channel id and name, category, description, outline, `version`), other servers' regions whose boxes meet the box of the server's outlines grown by 2 km (outlines only), the gyms in its regions and those in no region of any server inside that box (`[id, lat, lon, name]`), the kept Wayspots inside it (`[kind, lat, lon, title]`, no addresses or pictures), the text channels that are no region of any server; places at six decimals. The static part is kept per server until the generations of gyms, regions and Wayspots or the server's channels change; who asks (`userId`, `readOnly`, `mayManageChannels`, and the channels, none while read-only) is put in front per request; the ETag covers both; `private, no-cache`; 20 a minute per address (each asks Discord). 401, 403, 503 as the page (read-only while Discord is unreachable only for staff seen lately, as the page).
 - **Versions:** `regionVersion` (`src/domain/regions/version.ts`): base64url of SHA-256 (written out in pure code, so the page has it too) over the outline at six decimals and the region's description, cut to 16. A changed or removed region is sent with the version its first staged edit saw. Wherever an outline enters a draft (drawn, split, of a file: `record`) and wherever the server takes one (`planSave`), it is `normalisedOutline` (six decimals, a corner the rounding repeats dropped), so page and server see the same corners.
 - **Preview and save** `POST /s/<guild>/api/regions/preview` and `…/save` (`src/web/editor-save.ts`): before the body is read (`onRequest`, so a refused request never has its 2 MB parsed): 30 a minute per address, `postGuard` (Origin, session, CSRF token), `REGION_CHECK_THROTTLE` (6 a minute per member by the session's user, `Throttles` key `region edit`); then 2 MB, staff as Discord has them now (503 with its own words while unreachable), `saveRequestSchema` (zod; at most 200 of each kind, the corners of a KML file, names and categories up to 1,000 characters: anything beyond is malformed, 400; a new channel's name over 100 characters or its category over 200 is refused by `planSave` with a line naming the region, 422, and the page's fields have those `maxlength`s, a KML description being cut to 200 by `kmlEdit`). Both check everything again: `planSave` (`src/domain/regions/save-plan.ts`: a changed region named by its channel's current name, so `planImport` finds it; a new region on a text channel by id, or a new channel by a name no channel of the server has by `channelKey`, categories aside ("#south exists: pick it from the list …", or "… exists already: pick another name …"), in the category of its description read as `plainDescription` (empty: a category named after the channel); conflicts by version; outlines `normalisedOutline` and tidied), deleting a forum needs Manage Channels, something to do, and no new overlap or gap (`newProblems`) in what the import will write (`outlinesWritten`: the areas the preview of `RegionAdminService` leaves out are not written, so a removal whose replacement is left out is checked as a removal alone), worked out off the bot's thread: `SaveChecks` over `SaveCheckWorker` (`src/web/save-check.ts`; a `node:worker_threads` thread per check, `save-check-thread.ts`, compiled beside it into `dist/web/`, run through tsx in tests; one at a time, at most three waiting beyond it, any more 503 "Busy checking other saves: try again in a minute."; ended after 10 s or past 256 MB: 422 "Too complex to check: simplify the outlines."; polyclip throwing in the thread (its answer `{ ok: false }`) is logged and does not block; a thread that does not start, fails otherwise or ends without an answer is 503 "I cannot check the outlines just now: try again in a minute."), its verdict kept five minutes by a hash of the request and the versions of the server's regions, so the save of what was just previewed is not checked again. Answers (`SaveAnswer`): 200 `preview` (`/region import`'s words through `previewWords(…, 'editor')`, "Saving would …", and the removals with what goes with each, `goesWith`) or `saved` (`RegionAdminService.save`: one run under the admin lock that first plans the request again against the regions as they are inside the lock and does nothing when one of the save changed meanwhile, 409 `conflicts`; then compares the versions of all the server's regions and which channel is which region (`regionsStamp`) with those the save was planned and checked against, and does nothing when anything differs (another save adding the same channel, two saves that together make a new overlap), 409 `stale` "The regions changed meanwhile: preview again.", on which the page loads the regions and previews again; then the import's steps and each removal, a removal that rejects said as "I could not remove … (the log says what failed)" while the rest goes on; the audit log says `region editor by <id>`; `outcomeWords` and `/region remove`'s `outcomeLines`; areas the plan left out among "Not imported"), 409 `conflicts` (each region as it is now, or null when gone), 422 `refused` (lines). Everything is plain text (`plainWords`: mentions as `#name`, no markdown, and the escapes of `plain` undone: `north_hills`, not `north\_hills`); the page sets it as text. A save is logged by numbers (`regions were saved in the web editor`), never names. The save is stateless: it plans again rather than keeping the preview's plan.
-- **The page's code** (`src/web/client/editor.ts`): Leaflet with `preferCanvas`, Geoman (free) for drawing polygons and rectangles, reshaping and moving, snapping (`snapDistance` 15) to every outline (other servers' outlines are `pmIgnore` with `snapIgnore: false`: snapped to, not editable; places are never snapped to); removal, restore, split (a drawn line, `splitOutline`; the larger part keeps the region; Swap), a new region's channel or new channel with its category, in the side panel. Every change is a staged edit (`src/domain/regions/edits.ts`), applied to the regions as loaded, undone and redone, kept in `localStorage` under `pine-region-edits:<guild>:<user>` (`staged-storage.ts`, never throws; a full storage says "This browser's storage for the page is full: save or discard some changes."), and after a save, full or partial, rebased on the regions as the server has them (`rebaseAfterSave`: what the server has as staged is dropped, the rest keeps the version its first edit saw, so a change by somebody else meanwhile is a conflict). Outline edits of one region within 2 s of each other are one step of undo (a drag); undo goes back 200 steps at most, the oldest edits beyond being one step. A region the server has as it is staged is no conflict (a save whose answer never came). Save sends exactly the body it previewed (`saveBody`) and previews again when the drafts changed since; an answer that fails or cannot be read (`readSaveAnswer`: `unknown`) loads the data again, rebases and says "The outcome is not known: here is what the server has now."; when the data cannot be loaded after an outcome that is shown (saved, conflicts, stale), the outcome is shown all the same with "Reload the page to see the regions as saved." (or "… as they are now.", `reloadFailedLine`) A new channel's name the server has is refused in the panel as the server would (`newChannelProblem`), and a refused name records no edit (`pickerChange`). What is being filled into a new region's channel picker (its list, the name, the category, the refusal: `PickerState`) is kept on the editor while the panel is drawn anew (`pickerShown`) and dropped by any other edit, undo, redo or reload; an answer of the worker redraws only the toolbar, why Save is off and the list of overlaps and gaps, never the selected region's section. Gym counts, places in no region (orange), outlines that cannot be saved (red), why Save is off: `editor-view.ts`. Overlaps and gaps: worked out in a worker (`editor-worker.ts`, `CoverageChecker`, `coverage-check.ts`) after edits rest 400 ms (a worker that fails to load or to cut keeps Save waiting for nothing: the server checks a save itself); shaded, new ones thicker, listed new first then by area (200 at most) with the gyms, stops, power spots and Wayfarer gyms in them. Regions changed by somebody else show dashed in blue with "Take theirs" / "Keep mine". KML in with `readKml` (one edit) and out with `writeKml` (`<server name>-regions.kml`).
-- **Overlaps and gaps** (`src/domain/regions/coverage.ts`, polyclip-ts): pairwise intersections of outlines whose boxes meet (cached per pair of outlines by identity), gaps the holes of the union less what lies in them (`newProblems` cuts the gaps over the outlines whose boxes chain to what changed, `chainedTo`, so a region that closes a ring of regions is seen to close its hole); areas on the sphere (Lambert cylindrical equal-area); a piece thinner than 0.5 m on average (twice its area over its perimeter) is the six-decimal rounding and left out. A piece is new unless 90 % of its area lies inside one piece of its kind of the loaded outlines (so a shrunk overlap, or one split between two regions, is not new). Fix and "Fix all slivers" are plan 8M-2F.
+- **The page's code** (`src/web/client/editor.ts`): Leaflet with `preferCanvas`, Geoman (free) for drawing polygons and rectangles, reshaping and moving, snapping (`snapDistance` 15) to every outline (other servers' outlines are `pmIgnore` with `snapIgnore: false`: snapped to, not editable; places are never snapped to); removal, restore, split (a drawn line, `splitOutline`; the larger part keeps the region; Swap), a new region's channel or new channel with its category, in the side panel. Every change is a staged edit (`src/domain/regions/edits.ts`), applied to the regions as loaded, undone and redone, kept in `localStorage` under `pine-region-edits:<guild>:<user>` (`staged-storage.ts`, never throws; a full storage says "This browser's storage for the page is full: save or discard some changes."), and after a save, full or partial, rebased on the regions as the server has them (`rebaseAfterSave`: what the server has as staged is dropped, the rest keeps the version its first edit saw, so a change by somebody else meanwhile is a conflict). Outline edits of one region within 2 s of each other are one step of undo (a drag); undo goes back 200 steps at most, the oldest edits beyond being one step. A region the server has as it is staged is no conflict (a save whose answer never came). Save sends exactly the body it previewed (`saveBody`) and previews again when the drafts changed since; an answer that fails or cannot be read (`readSaveAnswer`: `unknown`) loads the data again, rebases and says "The outcome is not known: here is what the server has now."; when the data cannot be loaded after an outcome that is shown (saved, conflicts, stale), the outcome is shown all the same with "Reload the page to see the regions as saved." (or "… as they are now.", `reloadFailedLine`) A new channel's name the server has is refused in the panel as the server would (`newChannelProblem`), and a refused name records no edit (`pickerChange`). What is being filled into a new region's channel picker (its list, the name, the category, the refusal: `PickerState`) is kept on the editor while the panel is drawn anew (`pickerShown`) and dropped by any other edit, undo, redo or reload; an answer of the worker redraws only the toolbar, why Save is off and the list of overlaps and gaps, never the selected region's section. Gym counts, places in no region (orange), outlines that cannot be saved (red), why Save is off: `editor-view.ts`. Overlaps and gaps: worked out in a worker (`editor-worker.ts`, `CoverageChecker`, `coverage-check.ts`) after edits rest 400 ms (a worker that fails to load or to cut keeps Save waiting for nothing: the server checks a save itself); shaded, new ones thicker, listed new first then by area (200 at most; `pieceOrder`) with the gyms, stops, power spots and Wayfarer gyms in them, and when the page was opened with nothing staged for the server (spec 4.3, "the first time … worst first"; decided once, at the start) new first, then by the number of places in them, then by area; each with "Fix…" or why it cannot be fixed (below). Regions changed by somebody else show dashed in blue with "Take theirs" / "Keep mine". KML in with `readKml` (one edit) and out with `writeKml` (`<server name>-regions.kml`).
+- **Overlaps and gaps** (`src/domain/regions/coverage.ts`, polyclip-ts): pairwise intersections of outlines whose boxes meet (cached per pair of outlines by identity), gaps the holes of the union less what lies in them (`newProblems` cuts the gaps over the outlines whose boxes chain to what changed, `chainedTo`, so a region that closes a ring of regions is seen to close its hole); areas on the sphere (Lambert cylindrical equal-area); a piece thinner than 0.5 m on average (twice its area over its perimeter) is the six-decimal rounding and left out. A piece is new unless 90 % of its area lies inside one piece of its kind of the loaded outlines (so a shrunk overlap, or one split between two regions, is not new).
+- **Fix and "Fix all slivers"** (plan 8M-2F; spec 4.3 "How Fix works"; pure, `src/domain/regions/fix.ts`, `fix-all.ts`, flat measures in metres in `lines.ts`): worked out only in the page's worker, never on the server; a fix becomes ordinary staged edits (`outline` edits of the regions it changes in one `batch`: one undo step), which Save checks and saves as any other (8M-2's version and coverage checks stay the authority). `findStretches` reads every piece as a sliver: its outer ring split into chains along the borders of the regions around it (a part along two borders at once, where they run together, split at the middle of that run; a border's sides are found through a `SegmentGrid`, square cells searched in rings round a place, so that a border traced with thousands of corners is not gone through for each part), two sides meeting at two ends, one region along each, or one along one side and two along the other (a gap where three meet: of the three ways to split it, the one whose sides lie closest together, so that a U-shaped gap is not its cut across one arm against all the rest; at Pittsburgh such gaps are long strips capped or split by the third). A sliver is fixable when its sides run within `FIX_REACH_METRES` (150 m) of each other all along (their corners and places every 20 m); wider is `too-wide`, anything else (more regions, a region inside another or inside the gap, borders that touch along it) `tangled`, both listed as "… draw it by hand." Slivers of the same two regions that meet end to end (also where two regions touch at a point between two of them) are one stretch; a gap where three meet is a stretch of its own. A fix (`fixStretch`, choice `0`/`1` for a side's border or `midline`) makes the shared line one side (the other side's regions take it) or the midline (both sides resampled evenly, ignoring their corners, every 10 m or farther so that a side has at most 1,500 places, matched by dynamic time warping within a band round the diagonal of a tenth of the longer side and at least 50, the midpoints simplified to 1 m); where three meet, the line gets a corner across from where two meet along a side (`proposedCorner`; with the midline it is a marker to drag, the others put it on that border) and the third border runs to it. A corner dragged out of the stretch's slivers (more than a metre) is `corner-outside` ("The corner must stay inside the sliver."): land beyond them would change region; the proposed corner is not held to it. Each region's chain is replaced in its ring whichever way the ring runs, folds where a taken border ran along the region's own are removed, the outline is tidied (`tidyOutline`); a chain no longer on its border is `stale`, and a fix whose outlines would make a new overlap or gap (`newProblems` against the regions before it) is refused. Each choice (`fixOptions`) names every place whose region it changes, in the slivers or beyond them (tested in the box of what changed, against every region), and where it ends up (`landings`; "Gym #3092 “Library” ends up in #east."). Fix all (`fixAllStart`) takes the midline of every stretch whose midline moves no gym, stop, power spot or Wayfarer gym into another region, in rounds that find the stretches anew (a fix can move another's border), each round checked as a whole and fix by fix when it made something new; the stretches left are asked about (a place in their slivers, or one their midline moves) or counted as refused, each once; `nextQuestion` asks about each, its choices worked out on the regions as answered so far, a stretch an answer before moved found again by its regions and where its slivers lie; `answer` takes a choice or a skip; `fixAllFinish` at the end takes back the fixes that together made an overlap or gap neither the regions as loaded nor those Fix all began from have (each fix is checked against the regions before it, a save against the regions as loaded), with every fix of the regions they changed, and counts them ("… taken back, as it would make a new overlap or gap: draw it by hand"). The worker's requests: `fix-options` (a stretch of the last check, the corner as dragged) and `fix-all` / `fix-all-answer` (a choice, `skip`, or `stop` with what was fixed so far, for the question of its number: an answer to another is ignored); the page numbers its Fix all requests (`ask`) and takes only the answer to its last, and sends each answer once. Every fix request is answered: when the work throws, with `failed` (also Fix all before any check), and the page says "I could not work this fix out: draw it by hand." and closes the dialog. After a drag of the corner the midline stays shown, refused or not, and Apply waits for the answer to the last drag (`fixPick`); the marker is above Geoman's (`zIndexOffset`). Any edit drops a fix shown. The budget: one Fix's choices under a second and Fix all under 5 s for Pittsburgh; a densely traced border, under 2 s and 50 MB a midline. Pittsburgh's 28 outlines (2026-10-14 dump, at six decimals as the editor has them): 96 pieces in 71 stretches, all fixable, every choice valid; the stretches 24 ms after coverage's 190 ms, a stretch's three choices 290 ms median and 625 ms at most in the worker with 20,000 places strewn over the city, Fix all 1.8 s with them (0.9 s without), after which no overlap or gap is left. A 10 km sliver between two borders of 4,000 corners each: coverage 0.6 to 0.8 s, the stretches 0.1 s, a midline 0.07 s and under 20 MB, a choice with its check 0.9 to 1.9 s (polyclip's check), so that the Fix of such a stretch takes about 4 s.
 - **CSP:** unchanged. The worker is a script of Pine's (`worker-src` falls back to `script-src 'self'`). Geoman sets no style element and its CSS is bundled; its toolbar sets constants of its own as HTML; lodash's `Function("return this")` in its bundle is never reached in a browser.
 
 ## Adding a route (8M-3 to 8M-5)
diff --git a/docs/superpowers/plans/2026-10-16-phase-8m2f-staging.md b/docs/superpowers/plans/2026-10-16-phase-8m2f-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..6c552568727446da4d1fd2b0aab9cb78f5f5b72b
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-16-phase-8m2f-staging.md
@@ -0,0 +1,47 @@
+# Phase 8M-2F staging checklist: Fix, "Fix all slivers" and the worst-first list
+
+Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the editor in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`, with the web settings of 8M-1's and 8M-2's staging (`"web": { "port": 8080, "publicUrl": "http://localhost:8080" }`). 8M-2's checklist (`2026-10-16-phase-8m2-staging.md`) comes first or alongside: this one assumes the editor opens and saves.
+
+## Before
+
+1. No migration and no new command in this plan. `npm run build`: `dist/web/assets/` holds a new `editor-<hash>.js` and `editor-worker-<hash>.js`.
+2. A copy of the dev database's `Region` rows (a dump of the table) before anything is saved, to put back afterwards.
+3. Pittsburgh's real regions on the test server, as 8M-2's step 17 put them there (the production dump's rows restored into the dev database with their server pointed at the test server, or `/region import` of their outlines): the 28 outlines of the 2026-10-14 dump, with the gyms and Wayspots of the dump where they can be had, so that gym #3092 lies where it does in production (in regions 44 and 56). Note which channel stands for regions 44, 50, 51 and 56 on the test server.
+
+## The list, worst first
+
+4. Clear the staged edits of the test server (storage panel: remove `pine-region-edits:<guild>:<user>`, or Save or Undo everything), then open the editor: the list of overlaps and gaps begins with those holding the most gyms, stops, power spots and Wayfarer gyms, then the largest; the overlap of #3092 (regions 44 and 56) is near the top. Each piece has "Fix…" beside it, or a grey line saying why it cannot be fixed ("Its borders lie more than 150 m apart: draw it by hand.", "It is no sliver between two or three regions: draw it by hand."). In Node all 96 pieces of the dump were fixable: count the grey lines.
+5. Make any edit, reload: the list is new first, then by area (8M-2's order). Undo it, reload with nothing staged: worst first again.
+6. Time from the page's load to the list (the worker now also finds the stretches: about 25 ms more in Node).
+
+## Fix
+
+7. "Fix…" on the long overlap of regions 50 and 56 (15.9 km): the panel shows "The slivers between #… and #…" with "Take #…'s border", "Take #…'s border", "Take the midline", the midline chosen and drawn dashed on the map; the map fits the strip. Each choice lists every place whose region it changes (in the strip, or beyond it) and where it ends up. Choose each in turn: the dashed line follows. Time from the press to the choices (0.3 s in Node) and whether the page stays responsive meanwhile.
+8. Apply: the strip is gone from the list once the check is back, the two outlines meet along the midline, the gym counts follow, and "Fixed, as one change: Undo takes it back." Undo brings both outlines back at once; Redo.
+9. A gap where three regions meet (in the dump: regions 44, 51 and 56, or 33, 37 and 43): "Where #…, #… and #… meet", a round marker where they meet with the midline; the marker is the one a drag takes, also over Geoman's markers. Drag it within the gap: "Working out the fix at the corner as dragged…" and Apply is off until the choices come back; then the dashed outlines meet at the marker, and places beyond the gap whose region the new lines would change (if any) are listed under the midline. Drag it out of the gap, across a border: the midline stays shown, with "The corner must stay inside the sliver." under it, and Apply is off. Drag it back into the gap, Apply: the three outlines share the corner.
+10. The gym in two regions (#3092, regions 44 and 56): "Fix…" on their overlap lists "Gym #3092 “…” ends up in #…" under each choice, the region of the border taken; take one, Apply: the gym is counted in one region only, and is no longer listed in an overlap.
+11. While a Fix is shown, reshape any region: the Fix is dropped (its dashed lines and marker go). A Fix asked for before the list is back after an edit says "Wait until the overlaps and gaps are worked out."
+
+## Fix all slivers
+
+12. "Fix all slivers…" (in the toolbar; off while the overlaps and gaps are worked out, and with nothing to fix): "Fixing the slivers with nothing in them…", then a question for each stretch whose midline would move a place into another region (one in its slivers, or beyond them): "N stretches fixed so far.", the stretch and "N places would change region. Which line do the regions take?", a button for each choice (hovering one draws it dashed) with where each place ends up, "Leave it", "Stop here", "Cancel". A double click on a choice answers once. Time from the press to the first question (1.8 s in Node with 20,000 places strewn over the city, 0.9 s without), and whether the page stays responsive.
+13. Answer a few, leave one, then "Stop here": "Fixed … stretches; left … as they were. Staged as one change: Undo takes it back." (and "… taken back, as it would make a new overlap or gap: draw it by hand" if the fixes together made one the loaded regions lack). One Undo takes everything back; Redo.
+14. "Cancel" in the middle: nothing is staged; "Fix all slivers…" again starts afresh (no answer of the one cancelled is shown).
+15. Fix all to the end (take the midline or a border for every question): the list of overlaps and gaps holds only what was left and what cannot be fixed; count them. In Node the dump's outlines, with nothing in any sliver, were left with no overlap and no gap; 28 outlines changed, 1,040 corners in all becoming 1,380.
+
+## Save
+
+16. Save… after Fix all: the preview lists 28 changed outlines and the gyms each region gains and loses (none should be in no region that was in one before); "Your changes make …" does not appear (the server's check agrees with the page's). Time the server's check on the real outlines (8M-2's thread, 10 s at most).
+17. Save these changes: the outcome region by region; reload: the list of overlaps and gaps is empty (or holds only what was left); `/region list` and the public map show the new outlines; Export KML and look at them in Google My Maps beside the old export.
+18. 8M-2's step 18 again: beside a densely traced neighbour, reshape a hand-drawn border so that Save is refused for a new sliver; "Fix…" on it: Apply, and Save goes through.
+
+## Afterwards
+
+19. Put back the `Region` rows from step 2 if the test server's regions should be as before.
+
+## Left open (to the follow-ups if not settled here)
+
+- Whether the corner of three regions is proposed where Matt would put it (across from where two meet along the strip's side, not the centroid of the gap; see the plan's decisions; it may lie a little outside the gap, and only a dragged corner is held to it), and whether its marker is easy to drag beside Geoman's own markers.
+- "I could not work this fix out: draw it by hand." (a fix whose work threw in the worker) is not staged: it is tested in Node with work that throws.
+- Whether "Fix all" should count Wayfarer gyms Pine did not take as something in a sliver (it does).
+- How the worst-first order reads with Pittsburgh's places: whether "the first time" (nothing staged) is the right test, or a flag once seen.
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8m2f HEAD -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m2f-staging.md` prints nothing; then `npm run check`, `npm run build` and `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db`, once each and one after the other. The new and changed test files with timers or waits (the worker's fix requests, Fix all) ten times in a row.
2. Whole-branch review (`pine-reviewer`, Opus, high effort); one fix wave if it finds something (`pine-prototyper`, RED first).
3. If `typescript-migration` moved: merge it into `wayfarer`, settle conflicts (likely the follow-ups, `docs/superpowers/gantt-data.js`, `CLAUDE.md`, `src/app.ts`, `package.json` and `package-lock.json`), run the full check and the database suite again. Fast-forward `typescript-migration` to `wayfarer` when the main checkout is clean and the cutover session is not committing (ask it). Never push.
4. `CLAUDE.md` status line, the follow-ups ("From Phase 8M-2F": the rulings and "Made while prototyping" above for Matt, what only staging shows), the Gantt chart (`npm run gantt -- done 8M-2F.<n> <commit>` per task, then `review`), the ledger and memory.

## Staging checklist

The checklist is `docs/superpowers/plans/2026-10-16-phase-8m2f-staging.md` (added by the last task). Each step with Matt's go-ahead, on the test server with the dev application: `npm run build`, Matt starts the bot; the editor with Pittsburgh's real outlines in the dev database; Matt draws by hand (synthetic clicks give flat outlines).
