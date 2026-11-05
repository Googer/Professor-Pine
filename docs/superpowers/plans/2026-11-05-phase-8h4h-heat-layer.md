# Phase 8H-4H: The Heat Layer: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the map's Activity layer (plan 8H-4) is drawn as a heat glow instead of circles, as Matt chose on 2026-11-05 after a demo on the dev copy of production's history. Its counts move into the gym and Power Spot popups and a desktop cluster tooltip, and invisible tappable circles appear at street zoom when the place's own layer is off. Client only: no server change, migration or dependency.

- **Task 1, simpleheat:** simpleheat (BSD-2, © 2015 Vladimir Agafonkin) becomes our own typed module, `src/web/client/simpleheat.ts`, with its license kept. It has no colors of its own and asks for its canvas with `willReadFrequently`.
- **Task 2, the glow:**
  - **The layer:** `HeatLayer` (`heat-layer.ts`) is an `L.Layer` on one map-sized canvas, `aria-hidden`, in its own pane under the circles.
  - **Zooming:** it follows pinch, `flyTo` and animated zooms through the pure `zoomTransform`, and draws in its canvas's own pixels.
  - **The pure part** is `heat.ts`: Leaflet.heat's grid, with its BSD-2 notice, and the look per zoom (the demo's up to 15, larger at street level).
  - **Colors:** the gradient tokens `--heat-1..5` come from both themes.
  - **Play** redraws in place, and turning the layer off clears it.
- **Task 3, counts:**
  - **Popups:** a gym's and a Power Spot's popup get an "Activity: …" line while the layer is on.
  - **Clusters:** a cluster's hover reads "6 gyms · ≈ 140 parties in this area" (the gyms under a raid's marker are counted too).
  - **Screen readers:** a cluster's `aria-label` replaces its `title` (the editor's clusters too) and is renamed when the counts change.
  - **Raids:** raid and battle popups get no line (Matt).
- **Task 4, tappable circles:** invisible circles are drawn from zoom 16 only for places whose own layer is off. They are kept by place across zooms and answers, follow the view plus a margin, re-read their words on reopening, and give way while a place is being picked. A meetup's place, the Report button's step 2, research's stops and route mode all count as picking.
- **Task 5, docs:** `web.md`.

**Tech stack:** TypeScript 6.0 (the client's tsconfig), Leaflet 1.9, Vitest. `npm run web:build` builds the page.

**Brief:** `.superpowers/sdd/8h-4h-heat-layer/brief.md`; Matt's decisions are in `.superpowers/sdd/8h-4h-heat-layer/decisions.md` and the follow-ups.

**Every diff in this plan was run before the plan was written.** They come from the throwaway branch `proto-8h4h`, one commit per task, rebased onto main-dev `457ee1cb` (one conflict in `web.md`: main-dev's route line kept). Every commit passed both typechecks and its own tests. On the tip, the full check (12,191), the build and the database suite (692) pass.

**Reviews:**
- **The prototype** (Opus, P1–P11). P1 was Important: the glow ignored pinch and `flyTo` zooms. The Minor ones:
  - drawing mid-drag;
  - circles closing their popup on zoom;
  - circles taking a pick in Report step 2;
  - a stale glow after turning the layer off;
  - two tooltips on a cluster;
  - gyms under a raid missing from a cluster's sum;
  - `willReadFrequently`;
  - Leaflet.heat's notice;
  - the region-view look;
  - tests.
- **The re-review** (R1–R5): R1 and R2 were Important: a meetup's place picking didn't refresh the circles, and a circle's popup froze its words. The Minor ones were `aria-label`s following the counts, the cost of the hover sums, and comments. Fixed in round 2.

**Conventions:** `CLAUDE.md`, `docs/architecture/web.md`, `testing.md`.

**Inside the plan:** each commit needs both typechecks and its own test files; the full suites run once on the tip. Work in `var/wt-8h4h` on `heat-layer`; never commit in the main checkout.

## Review Focus

- **The Leaflet layer's life:** adding, removing, zooming (pinch, `flyTo`, animated), dragging, resizing, and no leaked listeners or frames.
- **Colors and the page:** only tokens are used, and the CSP has no inline style.
- **Counts and pins:** counts are reachable by tap on a phone, and picking a place is never caught by a circle.

## Tasks

The task briefs, each with its prototype commit and full diff, are `.superpowers/sdd/8h-4h-heat-layer/task-<n>-brief.md`:

| Task | Prototype commit | Title |
|---|---|---|
| 1 | `ca19c084` | 8H-4H task 1: simpleheat as our module |
| 2 | `5863bf15` | 8H-4H task 2: the glow in place of the circles |
| 3 | `73001b47` | 8H-4H task 3: counts in the popups and on the clusters |
| 4 | `cd2e61f1` | 8H-4H task 4: invisible circles at street zoom only |
| 5 | `458e96de` | 8H-4H task 5: docs |

After task 5, `git diff <prototype tip> HEAD -- src test docs/architecture` is empty. Then run `npm run check`, `npm run build` and `npm run test:db`, one at a time, judging each by its exit status.

## Staging

On the Air's dev stack after `./pine update`, with production's history in the dev database. Compare with the demo artifact `https://claude.ai/artifact/V4ibU6TGi62KJfRqDXdJpk`.

1. **The glow at each zoom:** check the region view (zoom 11–12), the neighborhood (13–15) and the street (16–17) against the demo, in Expected now, the presets and History. Play steps without a blink.
2. **Pinch on a phone, and Find's `flyTo`:** the glow follows without freezing or jumping.
3. **Popups:** a gym's popup has the "Activity:" line; a Power Spot's too at street zoom. A raid's popup has none.
4. **Clusters:** on desktop, the hover shows "N gyms · ≈ M parties in this area", with no second native tooltip.
5. **Gyms off, at street zoom:** tapping the glow opens a circle's count. Then pick a meetup's place and the Report button's step 2: the pick lands and no count opens.
6. **Both themes, and phone width.**
