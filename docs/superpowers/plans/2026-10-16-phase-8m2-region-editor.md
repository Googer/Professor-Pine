# Phase 8M-2: The Region Editor: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff draw and maintain a server's regions on Pine's own map (`/s/<guild>/regions/edit`) instead of Google My Maps and KML: draw, reshape, drag, split, snap, remove, set a new region's channel; staged in the browser with undo and redo; overlaps and gaps shaded and listed, a new one refused at Save; Save previews and saves through `RegionAdminService` as `/region import` does; two editors at once never overwrite each other unseen; KML in and out. `/region edit` gives the editor's address with a login link.

**Architecture:** Pure `src/domain/regions/` for what decides (versions, coverage with `polyclip-ts`, split, the staged edits, the save plan); the page in `src/web/client/` (a second bundle entry beside the map's, Leaflet with Leaflet-Geoman, the coverage check in a Web Worker); the server in `src/web/` (`regionStaffAnswer` from a fresh member, the editor's data with an ETag, preview and save guarded before the body is read, the server's own coverage check in a `worker_threads` thread with a time and memory limit, `RegionAdminService.save` re-checking versions inside one lock run).

**Tech Stack:** TypeScript 6.0, Fastify 5, Leaflet 1.9, new: `@geoman-io/leaflet-geoman-free` 2.20.2 and `polyclip-ts` 0.16.8 (latest stable, MIT; Geoman itself depends on polyclip-ts). No migration. `/region edit` is a new subcommand: the commands are registered again at staging (`--global` for the dev application).

**Spec:** `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md` section 4 (and 2.5, 2.6, 5, 6, 7), approved by Matt 2026-10-15. Ledger: `.superpowers/sdd/2026-10-16-phase-8m2-region-editor/progress.md`.

**Where it runs:** in the worktree `C:\Users\<you>\IdeaProjects\Professor-Pine-wayfarer` on branch `wayfarer`, never in the main checkout. Its `node_modules` is a directory of its own; the controller installs the two packages before the first task.

**Every diff in this plan was run before the plan was written**, on the throwaway branch `proto-8m2` (worktree `var/proto-8m2`, rebased onto `wayfarer` 7d56ab53), one commit per task, each commit typechecked (root and page) with its area's tests green; on the tip `npm run check` (6,766 tests), `npm run build` (the worker thread `dist/web/save-check-thread.js` among its output) and the database suite were green. An Opus review went through the whole prototype; its findings are folded into the commits below.

## Decisions in this plan

Rulings made while Matt was away (2026-10-16; ledger), for Matt to look at:

1. **Fix and "Fix all slivers" are a plan of their own, 8M-2F**, after this one (spec 4.3 "How Fix works" and the worst-first list). 8M-2 shades and lists overlaps and gaps and refuses new ones at Save; existing ones do not block other edits. Until 8M-2F, a border drawn by hand beside a densely traced neighbour may be refused for slivers (the staging checklist has a step to see how often).
2. **The editor also requires Manage Server**, the permission Discord asks for `/region` by default: a server that grants `/region` to a role through Integrations overrides still needs Manage Server for the editor.
3. **A region's description is read-only for existing regions** (imports never write it; a KML description only names the category of a new channel), so the editor sets channel and category only for new regions.
4. **A new region may not take an existing channel's name** ("#west exists: pick it from the list").
5. **The server's coverage check runs in a worker thread** (one at a time, 10 s, 256 MB: "Too complex to check: simplify the outlines."), the preview's verdict kept 5 minutes by a hash of the request and the versions; preview and save at most 6 a minute per member.
6. **Save re-checks the versions inside one admin-lock run** (`RegionAdminService.save`), so two editors never overwrite each other unseen; a removal that fails is a failed line of the outcome, never a lost outcome.
7. **A save whose answer is lost** (a tunnel timeout during a long first save) reloads and rebases: "The outcome is not known: here is what the server has now."; an own saved draft is never shown as a conflict.
8. **Slivers** under 1 m² or 0.5 m mean width are ignored (outlines travel at six decimals, about 10 cm); an overlap or gap is new unless 90 % of it lies inside one that existed at load.
9. **Login links carry the page they open** (`map` or `regions/edit`), so an expired editor link lands on the editor.

Made while prototyping, to look at in staging:

1. On a synthetic 28-region case with jittery corners the page's full check took about 6 s and each edit about 2.7 s (hence the Web Worker); Pittsburgh's real outlines are the measure.
2. A city's editor data (mostly Wayspots) is likely megabytes; Cloudflare compresses it in front of Pine (no compression in Pine itself).
3. Geoman creates no style element and its CSS icons are `data:` URLs; its one `Function("return this")` (lodash) is never reached in a browser.

## Before the first task (controller)

Install the two packages in the `wayfarer` worktree's own `node_modules` from task 1's prototype commit: `git show 7dcae186:package.json > package.json`, the same for `package-lock.json`, `npm ci`, then `git checkout -- package.json package-lock.json` (task 1 commits them).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS, never commit in the main checkout. Never read, print or stage `.env`. Read `docs/architecture/web.md`, `gyms-and-regions.md` and `testing.md` (with "How the suites run") before starting.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment. `src/domain/` stays pure (`polyclip-ts` is pure). **Tests never use the network.** A test that uses `vi.mock` is a `*.isolated.test.ts`; a test undoes its own fake timers, stubs and environment changes.
- Nothing from data reaches a page as HTML (Leaflet and Geoman take strings as HTML: data goes in as nodes); nothing secret reaches a log.
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8m2`). Apply it exactly (`git apply` of the diff saved outside the repository is fine); the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck (`npm run typecheck`, which covers the page) and its own tests green. The full `npm run check`, `npm run build` and `npm run test:db` after the last task (they wait on the machine-wide suite lock by themselves).
- Never `npm install`/`npm ci` (the controller prepared `node_modules`). Dependencies stay current (CLAUDE.md).
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. **Nothing is overwritten unseen:** two editors, an editor and `/region import`, a removal while a change waits: the later save answers 409 or creates nothing; a lost answer never makes the page claim nothing was saved.
2. **The bot never blocks:** the server's coverage check stays in its thread, within its limits, and a huge or crossing outline is refused, not computed.
3. **Only staff, freshly checked, write; a refused request costs nothing:** no body read and no Discord fetch before the guard, the address limit and the member throttle.
4. **A new region never replaces an existing one,** by channel name or otherwise; channels are created only with Manage Channels.
5. **What the page shows is what is saved:** Save sends exactly the previewed body; outlines rounded the same in the page and on the server; undo, redo and the browser copy survive a reload.

---

### Task 1: Region editor: versions, overlaps and gaps, staged edits

Prototype commit: `7dcae186c67fb592e639a04553565676482d694b`

The packages `@geoman-io/leaflet-geoman-free` and `polyclip-ts`. Pure `src/domain/regions/`: `regionVersion` (SHA-256 of the outline at six decimals and the description, 16 characters); `coverage.ts` (overlaps per pair, gaps as the union's holes, areas by Lambert's equal-area projection, slivers under 1 m² or 0.5 m mean width ignored, a piece new unless 90 % of it lies in one loaded piece, the server's check over the box-chained component of what changed); `split.ts`; `edits.ts` (the staged edits, undo and redo with drags collapsed and a depth of 200, the browser copy, `saveRequest`, `rebaseAfterSave`, KML in and out, an own saved draft no conflict); `normalisedOutline`; `save-plan.ts` (a save request to `/region import` areas and removals, refusing a new channel named like an existing one).

**Files:**

```
 package-lock.json                    | 328 +++++++++++++++++++++++++++++++++++++++++-
 package.json                         |   2 +
 src/domain/regions/coverage.test.ts  | 239 +++++++++++++++++++++++++++++++
 src/domain/regions/coverage.ts       | 335 +++++++++++++++++++++++++++++++++++++++++++
 src/domain/regions/edits.test.ts     | 469 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/regions/edits.ts          | 586 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/regions/save-plan.test.ts | 200 ++++++++++++++++++++++++++
 src/domain/regions/save-plan.ts      | 206 +++++++++++++++++++++++++++
 src/domain/regions/split.test.ts     |  80 +++++++++++
 src/domain/regions/split.ts          | 107 ++++++++++++++
 src/domain/regions/version.test.ts   |  70 +++++++++
 src/domain/regions/version.ts        | 151 ++++++++++++++++++++
 src/domain/web/editor-data.ts        | 112 +++++++++++++++
 13 files changed, 2884 insertions(+), 1 deletion(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/regions/coverage.test.ts src/domain/regions/edits.test.ts src/domain/regions/save-plan.test.ts src/domain/regions/split.test.ts src/domain/regions/version.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/domain/regions/coverage.test.ts src/domain/regions/coverage.ts src/domain/regions/edits.test.ts src/domain/regions/edits.ts src/domain/regions/save-plan.test.ts src/domain/regions/save-plan.ts src/domain/regions/split.test.ts src/domain/regions/split.ts src/domain/regions/version.test.ts src/domain/regions/version.ts src/domain/web/editor-data.ts` and `npx eslint src/domain/regions/coverage.test.ts src/domain/regions/coverage.ts src/domain/regions/edits.test.ts src/domain/regions/edits.ts src/domain/regions/save-plan.test.ts src/domain/regions/save-plan.ts src/domain/regions/split.test.ts src/domain/regions/split.ts src/domain/regions/version.test.ts src/domain/regions/version.ts src/domain/web/editor-data.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 7dcae186c67fb592e639a04553565676482d694b -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m2-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Region editor: versions, overlaps and gaps, staged edits`, the paragraph above as the body and the trailer, staging exactly
  `package-lock.json package.json src/domain/regions/coverage.test.ts src/domain/regions/coverage.ts src/domain/regions/edits.test.ts src/domain/regions/edits.ts src/domain/regions/save-plan.test.ts src/domain/regions/save-plan.ts src/domain/regions/split.test.ts src/domain/regions/split.ts src/domain/regions/version.test.ts src/domain/regions/version.ts src/domain/web/editor-data.ts`.

````diff
diff --git a/package-lock.json b/package-lock.json
index 9e92c24592f0729b18c67f3ea1e62ff658e597de..268600f3f2d79c98d4f6705d0dce12ca0b845ec1 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -11,6 +11,7 @@
       "dependencies": {
         "@fastify/cookie": "^11.1.3",
         "@fastify/static": "^10.1.6",
+        "@geoman-io/leaflet-geoman-free": "^2.20.2",
         "discord.js": "^14.27.0",
         "fastest-levenshtein": "^1.0.16",
         "fastify": "^5.12.7",
@@ -22,6 +23,7 @@
         "mysql2": "^3.24.6",
         "onnxruntime-node": "1.30.0",
         "pino": "^10.4.0",
+        "polyclip-ts": "^0.16.8",
         "sharp": "0.35.5",
         "zod": "^4.6.7"
       },
@@ -1105,6 +1107,26 @@
         "url": "https://github.com/sponsors/isaacs"
       }
     },
+    "node_modules/@geoman-io/leaflet-geoman-free": {
+      "version": "2.20.2",
+      "resolved": "https://registry.npmjs.org/@geoman-io/leaflet-geoman-free/-/leaflet-geoman-free-2.20.2.tgz",
+      "integrity": "sha512-KQpSe0VKyuVCudq/08rMjJW1vvIwFldTwBny2wZ7ABcyyUAP7/eoFo967hCu9yRqAAHb4QOxC6gY5dGqttY68g==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/boolean-contains": "^7.4.0",
+        "@turf/kinks": "^7.4.0",
+        "@turf/line-intersect": "^7.4.0",
+        "@turf/line-split": "^7.4.0",
+        "lodash": "4.18.1",
+        "polyclip-ts": "^0.16.8"
+      },
+      "engines": {
+        "node": ">=20.0.0"
+      },
+      "peerDependencies": {
+        "leaflet": "^1.2.0"
+      }
+    },
     "node_modules/@grpc/grpc-js": {
       "version": "1.14.6",
       "resolved": "https://registry.npmjs.org/@grpc/grpc-js/-/grpc-js-1.14.6.tgz",
@@ -2304,6 +2326,244 @@
         "testcontainers": "^12.2.1"
       }
     },
+    "node_modules/@turf/bbox": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/bbox/-/bbox-7.4.0.tgz",
+      "integrity": "sha512-yOX9lALc2GmjYUIE99+nRj7eZA7eDtx7Ixu/hrgIo+YqHvL1reaPVTC9rQWMHMm0pH0/WHjzk8uOpAHjptrudQ==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/helpers": "7.4.0",
+        "@turf/meta": "7.4.0",
+        "@types/geojson": "^7946.0.10",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
+    "node_modules/@turf/boolean-contains": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/boolean-contains/-/boolean-contains-7.4.0.tgz",
+      "integrity": "sha512-vR8sfdKhSlDy6Jd6UAI2Bt27ZAU287G8lhLieIGfxKCpoUa2V8v3y0I9FH+ZpFen07I33aysHIZ4dMH92hBO3Q==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/bbox": "7.4.0",
+        "@turf/boolean-point-in-polygon": "7.4.0",
+        "@turf/boolean-point-on-line": "7.4.0",
+        "@turf/helpers": "7.4.0",
+        "@turf/invariant": "7.4.0",
+        "@turf/line-split": "7.4.0",
+        "@types/geojson": "^7946.0.10",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
+    "node_modules/@turf/boolean-point-in-polygon": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/boolean-point-in-polygon/-/boolean-point-in-polygon-7.4.0.tgz",
+      "integrity": "sha512-GQrHc6WSDHhf32GB/b9AGyOeC05AQ3nGN7ooWTrlCYefKn7X9/2wG9BNexF47AuyDq5jPdOvITVR26BLFWV+mA==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/helpers": "7.4.0",
+        "@turf/invariant": "7.4.0",
+        "@types/geojson": "^7946.0.10",
+        "point-in-polygon-hao": "^1.1.0",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
+    "node_modules/@turf/boolean-point-on-line": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/boolean-point-on-line/-/boolean-point-on-line-7.4.0.tgz",
+      "integrity": "sha512-5i5UBeZf/LuzgavkIj8L8L5/8SYWItWzQQcE9ymFZr60lV5lM8eFvQDfzAz2R3WQFCrxXExPqNvAVZOKGUyvoA==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/helpers": "7.4.0",
+        "@turf/invariant": "7.4.0",
+        "@types/geojson": "^7946.0.10",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
+    "node_modules/@turf/distance": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/distance/-/distance-7.4.0.tgz",
+      "integrity": "sha512-ODkopQDG1m/U6Mx7OMmShncaCvneomwX3lZY1CDA7x40bhDdTTRYP/n/6LicZVyIO4/oK+aXkov4NOtWYthA2g==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/helpers": "7.4.0",
+        "@turf/invariant": "7.4.0",
+        "@types/geojson": "^7946.0.10",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
+    "node_modules/@turf/geojson-rbush": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/geojson-rbush/-/geojson-rbush-7.4.0.tgz",
+      "integrity": "sha512-o+debVj+6KQ2p0VebH+FgcTig2jUuG6mWMgLYvb34c7cOHoEuY6ICvKRKtHn/XcHa6eyoSk0TvnLEJAfFTQDMg==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/bbox": "7.4.0",
+        "@turf/helpers": "7.4.0",
+        "@turf/meta": "7.4.0",
+        "@types/geojson": "^7946.0.10",
+        "rbush": "^3.0.1",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
+    "node_modules/@turf/helpers": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/helpers/-/helpers-7.4.0.tgz",
+      "integrity": "sha512-7PAwLZqOdRzTI5g9bHvUwlloAXPDH/mlajtryk0tw4ZwGMtmXsAyF4QundsAMfy4u48Fyd3AUqMXY0SMxqJGWg==",
+      "license": "MIT",
+      "dependencies": {
+        "@types/geojson": "^7946.0.10",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
+    "node_modules/@turf/invariant": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/invariant/-/invariant-7.4.0.tgz",
+      "integrity": "sha512-OAsc3qdNx+tRqzWmMNFMnVlWWACIqnYqIejZKvb2oKkKPYJJrURPXZ6OdrGD58ljJMolLoqwIZGSx3VndaEjxg==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/helpers": "7.4.0",
+        "@types/geojson": "^7946.0.10",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
+    "node_modules/@turf/kinks": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/kinks/-/kinks-7.4.0.tgz",
+      "integrity": "sha512-M2deZpJq45WASRru5MmGwDJkVIj+JL/rcS6LLZBQyhSna47pxOQIVDC/tIx6xyFezxXw3lhX9VsoRst3irDdAQ==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/helpers": "7.4.0",
+        "@types/geojson": "^7946.0.10",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
+    "node_modules/@turf/line-intersect": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/line-intersect/-/line-intersect-7.4.0.tgz",
+      "integrity": "sha512-5qNmEJ/0tQEaUUKSt2zIZGIS6eYGn3T7Z32yN6+Py0ANs8ln3dQNWaDyOEMms/qVY7BFvSaO+8iBmD8vlHdNcA==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/helpers": "7.4.0",
+        "@types/geojson": "^7946.0.10",
+        "robust-predicates": "^2.0.4",
+        "tinyqueue": "^2.0.3",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
+    "node_modules/@turf/line-segment": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/line-segment/-/line-segment-7.4.0.tgz",
+      "integrity": "sha512-v4Gnxpj6XqWbl4d/aVZHYwvSFzaTGGBW4eQQ9Ozqcgt+bvignOMdtVogFDHSWKDj9Gr2tbS2jYp57c8OTa+Olw==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/helpers": "7.4.0",
+        "@turf/invariant": "7.4.0",
+        "@turf/meta": "7.4.0",
+        "@types/geojson": "^7946.0.10",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
+    "node_modules/@turf/line-split": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/line-split/-/line-split-7.4.0.tgz",
+      "integrity": "sha512-bAij7u19sFVdYoAp3bQnu/cVzlORxM/W3FM+WeFN/VvGkZ6YiAtcPq/lLP4WwK3WxthTcavED3wbd32iXGpzZw==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/bbox": "7.4.0",
+        "@turf/geojson-rbush": "7.4.0",
+        "@turf/helpers": "7.4.0",
+        "@turf/invariant": "7.4.0",
+        "@turf/line-intersect": "7.4.0",
+        "@turf/line-segment": "7.4.0",
+        "@turf/meta": "7.4.0",
+        "@turf/nearest-point-on-line": "7.4.0",
+        "@turf/truncate": "7.4.0",
+        "@types/geojson": "^7946.0.10",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
+    "node_modules/@turf/meta": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/meta/-/meta-7.4.0.tgz",
+      "integrity": "sha512-3cLUvlEyDuSnMSzrjhaLAEiYR8xhbfWyTVQlrlEw40xL81d4KF4PqUWbjTXKpXZStdYbet2GCurl79KMypNw6g==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/helpers": "7.4.0",
+        "@types/geojson": "^7946.0.10",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
+    "node_modules/@turf/nearest-point-on-line": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/nearest-point-on-line/-/nearest-point-on-line-7.4.0.tgz",
+      "integrity": "sha512-eKTKf/qODIsPankYMZrNfI3LjLaVtQvYV/1hcj9kH/Zr3GfLUszevjhTRDZtMgTFrv8+awW3+MyhmN+PJGuLdQ==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/distance": "7.4.0",
+        "@turf/helpers": "7.4.0",
+        "@turf/invariant": "7.4.0",
+        "@turf/meta": "7.4.0",
+        "@types/geojson": "^7946.0.10",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
+    "node_modules/@turf/truncate": {
+      "version": "7.4.0",
+      "resolved": "https://registry.npmjs.org/@turf/truncate/-/truncate-7.4.0.tgz",
+      "integrity": "sha512-eTXO62l1mD++mKlhUqLNHGcgCQvhxXJGB/EUL1KSzpVIeMYtgcmItAneWdHW+gEpmHfjeDjBuvtbZWA23r7Eig==",
+      "license": "MIT",
+      "dependencies": {
+        "@turf/helpers": "7.4.0",
+        "@turf/meta": "7.4.0",
+        "@types/geojson": "^7946.0.10",
+        "tslib": "^2.8.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/turf"
+      }
+    },
     "node_modules/@types/chai": {
       "version": "5.2.3",
       "resolved": "https://registry.npmjs.org/@types/chai/-/chai-5.2.3.tgz",
@@ -2363,7 +2623,6 @@
       "version": "7946.0.16",
       "resolved": "https://registry.npmjs.org/@types/geojson/-/geojson-7946.0.16.tgz",
       "integrity": "sha512-6C8nqWur3j98U6+lXDfTUWIfgvZU+EumvpHKcYjujKH7woYyLj2sUmff0tRhrqM7BohUw7Pz3ZB1jj2gW9Fvmg==",
-      "dev": true,
       "license": "MIT"
     },
     "node_modules/@types/json-schema": {
@@ -3132,6 +3391,15 @@
         "tweetnacl": "^0.14.3"
       }
     },
+    "node_modules/bignumber.js": {
+      "version": "9.3.1",
+      "resolved": "https://registry.npmjs.org/bignumber.js/-/bignumber.js-9.3.1.tgz",
+      "integrity": "sha512-Ko0uX15oIUS7wJ3Rb30Fs6SkVbLmPBAKdlm7q9+ak9bbIeFf0MwuBsQV6z7+X768/cHsfg+WlysDWJcmthjsjQ==",
+      "license": "MIT",
+      "engines": {
+        "node": "*"
+      }
+    },
     "node_modules/bl": {
       "version": "4.1.0",
       "resolved": "https://registry.npmjs.org/bl/-/bl-4.1.0.tgz",
@@ -6254,6 +6522,31 @@
         "node": ">=4"
       }
     },
+    "node_modules/point-in-polygon-hao": {
+      "version": "1.2.4",
+      "resolved": "https://registry.npmjs.org/point-in-polygon-hao/-/point-in-polygon-hao-1.2.4.tgz",
+      "integrity": "sha512-x2pcvXeqhRHlNRdhLs/tgFapAbSSe86wa/eqmj1G6pWftbEs5aVRJhRGM6FYSUERKu0PjekJzMq0gsI2XyiclQ==",
+      "license": "MIT",
+      "dependencies": {
+        "robust-predicates": "^3.0.2"
+      }
+    },
+    "node_modules/point-in-polygon-hao/node_modules/robust-predicates": {
+      "version": "3.0.3",
+      "resolved": "https://registry.npmjs.org/robust-predicates/-/robust-predicates-3.0.3.tgz",
+      "integrity": "sha512-NS3levdsRIUOmiJ8FZWCP7LG3QpJyrs/TE0Zpf1yvZu8cAJJ6QMW92H1c7kWpdIHo8RvmLxN/o2JXTKHp74lUA==",
+      "license": "Unlicense"
+    },
+    "node_modules/polyclip-ts": {
+      "version": "0.16.8",
+      "resolved": "https://registry.npmjs.org/polyclip-ts/-/polyclip-ts-0.16.8.tgz",
+      "integrity": "sha512-JPtKbDRuPEuAjuTdhR62Gph7Is2BS1Szx69CFOO3g71lpJDFo78k4tFyi+qFOMVPePEzdSKkpGU3NBXPHHjvKQ==",
+      "license": "MIT",
+      "dependencies": {
+        "bignumber.js": "^9.1.0",
+        "splaytree-ts": "^1.0.2"
+      }
+    },
     "node_modules/postcss": {
       "version": "8.5.30",
       "resolved": "https://registry.npmjs.org/postcss/-/postcss-8.5.30.tgz",
@@ -6451,6 +6744,21 @@
       "integrity": "sha512-tYC1Q1hgyRuHgloV/YXs2w15unPVh8qfu/qCTfhTYamaw7fyhumKa2yGpdSo87vY32rIclj+4fWYQXUMs9EHvg==",
       "license": "MIT"
     },
+    "node_modules/quickselect": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/quickselect/-/quickselect-2.0.0.tgz",
+      "integrity": "sha512-RKJ22hX8mHe3Y6wH/N3wCM6BWtjaxIyyUIkpHOvfFnxdI4yD4tBXEBKSbriGujF6jnSVkJrffuo6vxACiSSxIw==",
+      "license": "ISC"
+    },
+    "node_modules/rbush": {
+      "version": "3.0.1",
+      "resolved": "https://registry.npmjs.org/rbush/-/rbush-3.0.1.tgz",
+      "integrity": "sha512-XRaVO0YecOpEuIvbhbpTrZgoiI6xBlz6hnlr6EHhd+0x9ase6EmeN+hdwwUaJvLcsFFQ8iWVF1GAK1yB0BWi0w==",
+      "license": "MIT",
+      "dependencies": {
+        "quickselect": "^2.0.0"
+      }
+    },
     "node_modules/readable-stream": {
       "version": "4.8.0",
       "resolved": "https://registry.npmjs.org/readable-stream/-/readable-stream-4.8.0.tgz",
@@ -6613,6 +6921,12 @@
       "integrity": "sha512-q1b3N5QkRUWUl7iyylaaj3kOpIT0N2i9MqIEQXP73GVsN9cw3fdx8X63cEmWhJGi2PPCF23Ijp7ktmd39rawIA==",
       "license": "MIT"
     },
+    "node_modules/robust-predicates": {
+      "version": "2.0.4",
+      "resolved": "https://registry.npmjs.org/robust-predicates/-/robust-predicates-2.0.4.tgz",
+      "integrity": "sha512-l4NwboJM74Ilm4VKfbAtFeGq7aEjWL+5kVFcmgFA2MrdnQWx9iE/tUGvxY5HyMI7o/WpSIUFLbC5fbeaHgSCYg==",
+      "license": "Unlicense"
+    },
     "node_modules/rolldown": {
       "version": "1.2.14",
       "resolved": "https://registry.npmjs.org/rolldown/-/rolldown-1.2.14.tgz",
@@ -6866,6 +7180,12 @@
         "node": ">=0.10.0"
       }
     },
+    "node_modules/splaytree-ts": {
+      "version": "1.0.2",
+      "resolved": "https://registry.npmjs.org/splaytree-ts/-/splaytree-ts-1.0.2.tgz",
+      "integrity": "sha512-0kGecIZNIReCSiznK3uheYB8sbstLjCZLiwcQwbmLhgHJj2gz6OnSPkVzJQCMnmEz1BQ4gPK59ylhBoEWOhGNA==",
+      "license": "BDS-3-Clause"
+    },
     "node_modules/split-ca": {
       "version": "1.0.1",
       "resolved": "https://registry.npmjs.org/split-ca/-/split-ca-1.0.1.tgz",
@@ -7303,6 +7623,12 @@
         "url": "https://github.com/sponsors/jonschlinkert"
       }
     },
+    "node_modules/tinyqueue": {
+      "version": "2.0.3",
+      "resolved": "https://registry.npmjs.org/tinyqueue/-/tinyqueue-2.0.3.tgz",
+      "integrity": "sha512-ppJZNDuKGgxzkHihX8v9v9G5f+18gzaTfrukGrq6ueg0lmH4nqVnA2IPG0AEH3jKEk2GRJCUhDoqpoiw3PHLBA==",
+      "license": "ISC"
+    },
     "node_modules/tmp": {
       "version": "0.2.7",
       "resolved": "https://registry.npmjs.org/tmp/-/tmp-0.2.7.tgz",
diff --git a/package.json b/package.json
index ee7920740a8b98d1ad46e8acfb5001731e4971ba..ad061646c296b14c43412dd09653695474340e5a 100644
--- a/package.json
+++ b/package.json
@@ -49,6 +49,7 @@
   "dependencies": {
     "@fastify/cookie": "^11.1.3",
     "@fastify/static": "^10.1.6",
+    "@geoman-io/leaflet-geoman-free": "^2.20.2",
     "discord.js": "^14.27.0",
     "fastest-levenshtein": "^1.0.16",
     "fastify": "^5.12.7",
@@ -60,6 +61,7 @@
     "mysql2": "^3.24.6",
     "onnxruntime-node": "1.30.0",
     "pino": "^10.4.0",
+    "polyclip-ts": "^0.16.8",
     "sharp": "0.35.5",
     "zod": "^4.6.7"
   },
diff --git a/src/domain/regions/coverage.test.ts b/src/domain/regions/coverage.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..202f537641103f713d84124fd9bf0ed31b9d98bc
--- /dev/null
+++ b/src/domain/regions/coverage.test.ts
@@ -0,0 +1,239 @@
+import { describe, expect, it } from 'vitest';
+import type { LatLon } from '../geo/lat-lon.js';
+import {
+  coverage,
+  inPiece,
+  MIN_SLIVER_WIDTH,
+  newPieces,
+  newProblems,
+  OverlapCache,
+  ringArea,
+  type Outlined,
+} from './coverage.js';
+
+const p = (lat: number, lon: number): LatLon => ({ lat, lon });
+
+/** A closed square of latitudes and longitudes. */
+function square(south: number, west: number, north: number, east: number): LatLon[] {
+  return [p(south, west), p(north, west), p(north, east), p(south, east), p(south, west)];
+}
+
+const R = 6_371_000;
+const rad = (degrees: number): number => (degrees * Math.PI) / 180;
+/** The area of a box of latitudes and longitudes on the sphere, in m². */
+const boxArea = (south: number, west: number, north: number, east: number): number =>
+  R * R * rad(east - west) * (Math.sin(rad(north)) - Math.sin(rad(south)));
+
+const region = (key: string, outline: LatLon[]): Outlined => ({ key, outline });
+
+describe('the area of an outline', () => {
+  it('is measured on the sphere, in square metres, whichever way it winds', () => {
+    const ring = square(40, -80.1, 40.1, -80);
+    expect(ringArea(ring)).toBeCloseTo(boxArea(40, -80.1, 40.1, -80), -1);
+    expect(ringArea([...ring].reverse())).toBeCloseTo(ringArea(ring), 6);
+    // About 85 km by 111 km at 40° north.
+    expect(ringArea(ring) / 1e6).toBeCloseTo(94.8, 0);
+  });
+});
+
+describe('overlaps and gaps', () => {
+  it('finds none between neighbours that share a border', () => {
+    const found = coverage([
+      region('west', square(40, -80.1, 40.1, -80)),
+      region('east', square(40, -80, 40.1, -79.9)),
+    ]);
+    expect(found).toEqual({ overlaps: [], gaps: [] });
+  });
+
+  it('finds where two squares overlap, with its area', () => {
+    const found = coverage([
+      region('west', square(40, -80.1, 40.1, -79.99)),
+      region('east', square(40, -80, 40.1, -79.9)),
+    ]);
+    expect(found.gaps).toEqual([]);
+    expect(found.overlaps).toHaveLength(1);
+    const [overlap] = found.overlaps;
+    expect(overlap?.between).toEqual(['west', 'east']);
+    expect(overlap?.area).toBeCloseTo(boxArea(40, -80, 40.1, -79.99), -2);
+    expect(inPiece(overlap!, p(40.05, -79.995))).toBe(true);
+    expect(inPiece(overlap!, p(40.05, -80.05))).toBe(false);
+  });
+
+  it('finds the gap three regions leave between them, and nothing outside them', () => {
+    // West and east leave a strip between them; north closes it from above and south.
+    const found = coverage([
+      region('west', square(40, -80.1, 40.1, -80.01)),
+      region('east', square(40, -80, 40.1, -79.9)),
+      region('north', square(40.1, -80.1, 40.2, -79.9)),
+      region('south', square(39.9, -80.1, 40, -79.9)),
+    ]);
+    expect(found.overlaps).toEqual([]);
+    expect(found.gaps).toHaveLength(1);
+    const [gap] = found.gaps;
+    expect(gap?.area).toBeCloseTo(boxArea(40, -80.01, 40.1, -80), -2);
+    expect(inPiece(gap!, p(40.05, -80.005))).toBe(true);
+    expect(inPiece(gap!, p(40.05, -80.05))).toBe(false);
+    // A bay open to the outside is no gap: without south the strip is open.
+    expect(
+      coverage([
+        region('west', square(40, -80.1, 40.1, -80.01)),
+        region('east', square(40, -80, 40.1, -79.9)),
+        region('north', square(40.1, -80.1, 40.2, -79.9)),
+      ]).gaps,
+    ).toEqual([]);
+  });
+
+  it('measures a gap without a region that lies inside it', () => {
+    const frame = [
+      region('west', square(40, -80.1, 40.1, -80.05)),
+      region('east', square(40, -79.95, 40.1, -79.9)),
+      region('north', square(40.1, -80.1, 40.2, -79.9)),
+      region('south', square(39.9, -80.1, 40, -79.9)),
+    ];
+    const island = region('island', square(40.04, -80.01, 40.06, -79.99));
+    const [gap] = coverage([...frame, island]).gaps;
+    expect(gap?.area).toBeCloseTo(
+      boxArea(40, -80.05, 40.1, -79.95) - boxArea(40.04, -80.01, 40.06, -79.99),
+      -2,
+    );
+    expect(inPiece(gap!, p(40.05, -80))).toBe(false);
+    expect(inPiece(gap!, p(40.05, -80.03))).toBe(true);
+  });
+
+  it('leaves out a sliver thinner than half a metre, as six decimals leave along a border', () => {
+    // East's west edge 10 cm into west: an overlap 0.1 m wide and 11 km long.
+    const tenCentimetres = 0.1 / ((R * Math.PI) / 180) / Math.cos(rad(40));
+    const found = coverage([
+      region('west', square(40, -80.1, 40.1, -80)),
+      region('east', square(40, -80 - tenCentimetres, 40.1, -79.9)),
+    ]);
+    expect(found.overlaps).toEqual([]);
+    expect(MIN_SLIVER_WIDTH).toBe(0.5);
+    // A metre wide is a sliver to show.
+    const metre = tenCentimetres * 10;
+    expect(
+      coverage([
+        region('west', square(40, -80.1, 40.1, -80)),
+        region('east', square(40, -80 - metre, 40.1, -79.9)),
+      ]).overlaps,
+    ).toHaveLength(1);
+  });
+
+  it('keeps the overlaps of the outlines it has seen, by the outlines themselves', () => {
+    const cache = new OverlapCache();
+    const west = square(40, -80.1, 40.1, -79.99);
+    const east = square(40, -80, 40.1, -79.9);
+    const first = coverage([region('west', west), region('east', east)], cache);
+    expect(cache.size).toBe(1);
+    const again = coverage([region('w', west), region('e', east)], cache);
+    expect(cache.size).toBe(1);
+    expect(again.overlaps[0]?.between).toEqual(['w', 'e']);
+    expect(again.overlaps[0]?.area).toBe(first.overlaps[0]?.area);
+  });
+});
+
+describe('new overlaps and gaps', () => {
+  const west = square(40, -80.1, 40.1, -79.99);
+  const east = square(40, -80, 40.1, -79.9);
+  const loaded = coverage([region('west', west), region('east', east)]);
+
+  it('are none when an overlap shrank, or the region it was in was split', () => {
+    const shrunk = coverage([
+      region('west', square(40, -80.1, 40.1, -79.995)),
+      region('east', east),
+    ]);
+    expect(newPieces(shrunk.overlaps, loaded.overlaps)).toEqual([]);
+    // West split in two: its northern half overlaps east where west did.
+    const split = coverage([
+      region('west', square(40, -80.1, 40.05, -79.99)),
+      region('new', square(40.05, -80.1, 40.1, -79.99)),
+      region('east', east),
+    ]);
+    expect(split.overlaps).toHaveLength(2);
+    expect(newPieces(split.overlaps, loaded.overlaps)).toEqual([]);
+  });
+
+  it('are an overlap that grew by more than a tenth, or one somewhere else', () => {
+    const grown = coverage([region('west', square(40, -80.1, 40.1, -79.98)), region('east', east)]);
+    expect(newPieces(grown.overlaps, loaded.overlaps)).toHaveLength(1);
+    const elsewhere = coverage([
+      region('west', west),
+      region('east', east),
+      region('north', square(40.09, -80.05, 40.2, -79.95)),
+    ]);
+    const fresh = newPieces(elsewhere.overlaps, loaded.overlaps);
+    expect(fresh.map((piece) => piece.between)).toEqual([
+      ['west', 'north'],
+      ['east', 'north'],
+    ]);
+  });
+
+  it('are found near what changed alone, whatever lies elsewhere', () => {
+    const far = square(41, -80.1, 41.1, -79.99);
+    const farEast = square(41, -80, 41.1, -79.9);
+    const before = [
+      region('r1', west),
+      region('r2', east),
+      region('r3', far),
+      region('r4', farEast),
+    ];
+    // West grows into east, far away from the overlap of r3 and r4 that is there already.
+    const grownWest = square(40, -80.1, 40.1, -79.98);
+    const after = [
+      region('r1', grownWest),
+      region('r2', east),
+      region('r3', far),
+      region('r4', farEast),
+    ];
+    const found = newProblems(before, after);
+    expect(found.overlaps.map((piece) => piece.between)).toEqual([['r1', 'r2']]);
+    expect(found.gaps).toEqual([]);
+    expect(newProblems(before, before)).toEqual({ overlaps: [], gaps: [] });
+    // East removed between west and a region beyond it: a gap where it was.
+    const beyond = square(40, -79.9, 40.1, -79.8);
+    const around = [
+      region('r1', square(40, -80.1, 40.1, -80)),
+      region('r2', east),
+      region('r5', beyond),
+      region('r6', square(40.1, -80.1, 40.2, -79.8)),
+      region('r7', square(39.9, -80.1, 40, -79.8)),
+    ];
+    const removed = around.filter((one) => one.key !== 'r2');
+    expect(newProblems(around, removed).gaps).toHaveLength(1);
+  });
+
+  it('are the hole a region closes in a ring of regions far beyond it', () => {
+    // Five regions around a long hole; the last one closes the ring at its eastern end, far
+    // from the western ones, which only a chain of neighbours reaches.
+    const ring = [
+      region('south', square(40, -80.5, 40.1, -79.9)),
+      region('west', square(40.1, -80.5, 40.2, -80.4)),
+      region('north-west', square(40.2, -80.5, 40.3, -80.2)),
+      region('north-east', square(40.2, -80.2, 40.3, -79.9)),
+    ];
+    const closed = [...ring, region('east', square(40.1, -80, 40.2, -79.9))];
+    const found = newProblems(ring, closed);
+    expect(found.overlaps).toEqual([]);
+    expect(found.gaps).toHaveLength(1);
+    expect(found.gaps[0]?.area).toBeCloseTo(boxArea(40.1, -80.4, 40.2, -80), -3);
+    expect(newProblems(closed, ring).gaps).toEqual([]);
+  });
+
+  it('are a gap where there was none', () => {
+    const before = coverage([
+      region('west', square(40, -80.1, 40.1, -80)),
+      region('east', square(40, -80, 40.1, -79.9)),
+      region('north', square(40.1, -80.1, 40.2, -79.9)),
+      region('south', square(39.9, -80.1, 40, -79.9)),
+    ]);
+    const after = coverage([
+      region('west', square(40, -80.1, 40.1, -80.01)),
+      region('east', square(40, -80, 40.1, -79.9)),
+      region('north', square(40.1, -80.1, 40.2, -79.9)),
+      region('south', square(39.9, -80.1, 40, -79.9)),
+    ]);
+    expect(before.gaps).toEqual([]);
+    expect(newPieces(after.gaps, before.gaps)).toHaveLength(1);
+    expect(newPieces(after.gaps, after.gaps)).toEqual([]);
+  });
+});
diff --git a/src/domain/regions/coverage.ts b/src/domain/regions/coverage.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6adf097a1ddcc580dc5bd4bba6c6cdcc19d3e27d
--- /dev/null
+++ b/src/domain/regions/coverage.ts
@@ -0,0 +1,335 @@
+import { intersection, union, type Geom } from 'polyclip-ts';
+import type { LatLon } from '../geo/lat-lon.js';
+import { boxOf, grownBox, ringContains, type Box } from '../geo/region-membership.js';
+
+/**
+ * Where a server's regions overlap and where they leave gaps (spec 4.3), for the region editor
+ * and the check of its saves. Pure: `polyclip-ts` cuts the outlines as flat latitudes and
+ * longitudes (as everywhere regions are compared with places), and the areas of what it gives
+ * are measured on the sphere.
+ */
+
+/**
+ * How wide a piece must be on average (twice its area over its perimeter) to count. Outlines
+ * travel at six decimals (about 10 cm): a corner snapped onto a neighbour's border comes back a
+ * few centimetres off it, which leaves a sliver along the whole border. Thinner than this is
+ * that rounding, never a slip of drawing (Pittsburgh's slivers are 50 to 130 m wide).
+ */
+export const MIN_SLIVER_WIDTH = 0.5;
+/** A piece smaller than this (in m²) is the noise of the arithmetic. */
+const MIN_AREA = 1;
+/**
+ * How much of a piece must lie inside one of the loaded outlines' pieces of its kind for it to
+ * count as that one (shrunk, moved a little, or split between two regions) rather than new.
+ */
+export const SAME_PIECE_SHARE = 0.9;
+/** How far around what changed `newProblems` looks for the regions it is measured with. */
+const NEIGHBOURHOOD_METRES = 100;
+
+/** The mean radius of the earth, in metres. */
+const EARTH_RADIUS = 6_371_000;
+const RADIANS = Math.PI / 180;
+
+/** An outline of a region by a key of the caller's (a region id, a new region's key). */
+export interface Outlined {
+  key: string;
+  outline: readonly LatLon[];
+}
+
+/**
+ * A piece of the map: its outer ring, then its holes (each closed), its area in m² (holes taken
+ * out) and the box of its outer ring.
+ */
+export interface Piece {
+  rings: LatLon[][];
+  area: number;
+  box: Box;
+}
+
+/** Where two regions overlap, by their keys in the order the regions were given. */
+export interface Overlap extends Piece {
+  between: [string, string];
+}
+
+export interface Coverage {
+  overlaps: Overlap[];
+  /** The areas inside the outer shape of all regions that no region covers. */
+  gaps: Piece[];
+}
+
+type Ring = [number, number][];
+
+/** An outline as polyclip takes it: `[lon, lat]`, closed. */
+function toRing(outline: readonly LatLon[]): Ring {
+  const ring: Ring = outline.map(({ lat, lon }) => [lon, lat]);
+  const first = ring[0];
+  const last = ring[ring.length - 1];
+  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([...first]);
+  return ring;
+}
+
+const toOutline = (ring: Ring): LatLon[] => ring.map(([lon, lat]) => ({ lat, lon }));
+
+/**
+ * The area of a ring in m², whichever way it winds: by the shoelace formula in Lambert's
+ * cylindrical equal-area projection (x the longitude, y the sine of the latitude, both times the
+ * earth's radius), which keeps areas exactly on a sphere of the earth's mean radius. Its sides
+ * are straight in that projection, where the outlines' sides are straight in latitude and
+ * longitude: at the size of a city the difference is far below a square metre per kilometre.
+ */
+export function ringArea(ring: readonly LatLon[]): number {
+  const first = ring[0];
+  if (!first) return 0;
+  // Measured from the first corner, so that a sliver keeps its digits.
+  const x = (corner: LatLon): number => EARTH_RADIUS * (corner.lon - first.lon) * RADIANS;
+  const sinFirst = Math.sin(first.lat * RADIANS);
+  const y = (corner: LatLon): number => EARTH_RADIUS * (Math.sin(corner.lat * RADIANS) - sinFirst);
+  let twice = 0;
+  for (let i = 0; i < ring.length; i++) {
+    const a = ring[i] as LatLon;
+    const b = ring[(i + 1) % ring.length] as LatLon;
+    twice += x(a) * y(b) - x(b) * y(a);
+  }
+  return Math.abs(twice) / 2;
+}
+
+/** The length of a ring's sides in metres, each measured flat at its middle. */
+function ringLength(ring: readonly LatLon[]): number {
+  let metres = 0;
+  for (let i = 1; i < ring.length; i++) {
+    const a = ring[i - 1] as LatLon;
+    const b = ring[i] as LatLon;
+    const across = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * RADIANS);
+    metres += EARTH_RADIUS * RADIANS * Math.hypot(b.lat - a.lat, across);
+  }
+  return metres;
+}
+
+/** Rings as a piece, or nothing when it is too small or too thin to be drawing. */
+function pieceOf(rings: LatLon[][]): Piece[] {
+  const [outer, ...holes] = rings;
+  if (!outer) return [];
+  const area = holes.reduce((left, hole) => left - ringArea(hole), ringArea(outer));
+  const perimeter = rings.reduce((sum, ring) => sum + ringLength(ring), 0);
+  if (area < MIN_AREA || (2 * area) / perimeter < MIN_SLIVER_WIDTH) return [];
+  return [{ rings, area, box: boxOf(outer) }];
+}
+
+/** What polyclip gave, as pieces. */
+const piecesOf = (polygons: readonly Ring[][]): Piece[] =>
+  polygons.flatMap((polygon) => pieceOf(polygon.map(toOutline)));
+
+/** Whether a place lies in a piece: in its outer ring and in none of its holes. */
+export function inPiece(piece: Piece, point: LatLon): boolean {
+  const { box } = piece;
+  if (point.lat < box.south || point.lat > box.north) return false;
+  if (point.lon < box.west || point.lon > box.east) return false;
+  const [outer, ...holes] = piece.rings;
+  return (
+    outer !== undefined &&
+    ringContains(outer, point) &&
+    !holes.some((hole) => ringContains(hole, point))
+  );
+}
+
+const boxesMeet = (a: Box, b: Box): boolean =>
+  a.south <= b.north && b.south <= a.north && a.west <= b.east && b.west <= a.east;
+
+/**
+ * The overlaps of pairs of outlines already cut, by the outlines themselves (their identity):
+ * while one region is drawn, only its own pairs are cut again.
+ */
+export class OverlapCache {
+  private readonly kept = new WeakMap<object, WeakMap<object, Piece[]>>();
+  private count = 0;
+
+  /** How many pairs are kept; for tests. */
+  get size(): number {
+    return this.count;
+  }
+
+  get(a: readonly LatLon[], b: readonly LatLon[]): Piece[] | undefined {
+    return this.kept.get(a)?.get(b);
+  }
+
+  set(a: readonly LatLon[], b: readonly LatLon[], pieces: Piece[]): void {
+    let inner = this.kept.get(a);
+    if (!inner) {
+      inner = new WeakMap();
+      this.kept.set(a, inner);
+    }
+    if (!inner.has(b)) this.count++;
+    inner.set(b, pieces);
+  }
+}
+
+/** The outlines with their rings for polyclip and their boxes. */
+function shapedOf(regions: readonly Outlined[]) {
+  return regions
+    .filter((region) => region.outline.length >= 4)
+    .map((region) => ({ ...region, ring: toRing(region.outline), box: boxOf(region.outline) }));
+}
+
+/** The overlaps of every pair whose boxes meet, cut once per pair of outlines (`cache`). */
+function overlapsOf(shaped: ReturnType<typeof shapedOf>, cache?: OverlapCache): Overlap[] {
+  const overlaps: Overlap[] = [];
+  for (let i = 0; i < shaped.length; i++) {
+    for (let j = i + 1; j < shaped.length; j++) {
+      const a = shaped[i]!;
+      const b = shaped[j]!;
+      if (!boxesMeet(a.box, b.box)) continue;
+      let pieces = cache?.get(a.outline, b.outline);
+      if (!pieces) {
+        pieces = piecesOf(intersection([a.ring], [b.ring]));
+        cache?.set(a.outline, b.outline, pieces);
+      }
+      for (const piece of pieces) overlaps.push({ ...piece, between: [a.key, b.key] });
+    }
+  }
+  return overlaps;
+}
+
+/**
+ * The gaps: the holes of the union of the outlines, less any part of the union that lies inside
+ * a hole (a region drawn inside a gap, whose own holes are gaps of their own). A bay open to the
+ * outside is no hole, so no gap.
+ */
+function gapsOf(shaped: ReturnType<typeof shapedOf>): Piece[] {
+  const [first, ...rest] = shaped.map((region): Geom => [region.ring]);
+  if (!first) return [];
+  const parts = union(first, ...rest).map((polygon) => polygon.map(toOutline));
+  return parts.flatMap((part) =>
+    part.slice(1).flatMap((hole) => {
+      const islands = parts.flatMap((other) => {
+        const [outer] = other;
+        const corner = outer?.[0];
+        return other !== part && outer && corner && ringContains(hole, corner) ? [outer] : [];
+      });
+      return pieceOf([hole, ...islands]);
+    }),
+  );
+}
+
+/**
+ * The overlaps of every pair of outlines (cut only where their boxes meet), and the gaps
+ * (`gapsOf`). Pieces thinner than `MIN_SLIVER_WIDTH` are left out. A piece where three regions
+ * overlap is listed once for each pair. Throws when polyclip cannot cut the outlines.
+ */
+export function coverage(regions: readonly Outlined[], cache?: OverlapCache): Coverage {
+  const shaped = shapedOf(regions);
+  return { overlaps: overlapsOf(shaped, cache), gaps: gapsOf(shaped) };
+}
+
+/** Whether two pieces are the very same: the same rings, or the same area in the same box. */
+function samePiece(a: Piece, b: Piece): boolean {
+  if (a.rings === b.rings) return true;
+  return (
+    Math.abs(a.area - b.area) <= 1e-9 * a.area &&
+    a.box.south === b.box.south &&
+    a.box.north === b.box.north &&
+    a.box.west === b.box.west &&
+    a.box.east === b.box.east
+  );
+}
+
+/**
+ * Of the pieces now, those that are new against the pieces of the loaded outlines (of the same
+ * kind): a piece counts as one that was there when at least `SAME_PIECE_SHARE` of its area lies
+ * inside one loaded piece. So an overlap that shrank, moved a little or was split between two
+ * regions with the region it was in is not new; one that grew by more than a ninth, or one
+ * elsewhere, is.
+ */
+export function newPieces<P extends Piece>(now: readonly P[], loaded: readonly Piece[]): P[] {
+  return now.filter(
+    (piece) =>
+      !loaded.some((before) => {
+        if (!boxesMeet(piece.box, before.box)) return false;
+        if (samePiece(piece, before)) return true;
+        const shared = intersection(
+          piece.rings.map((ring) => toRing(ring)),
+          before.rings.map((ring) => toRing(ring)),
+        ).reduce((sum, polygon) => {
+          const [outer, ...holes] = polygon.map(toOutline);
+          if (!outer) return sum;
+          return sum + holes.reduce((left, hole) => left - ringArea(hole), ringArea(outer));
+        }, 0);
+        return shared >= SAME_PIECE_SHARE * piece.area;
+      }),
+  );
+}
+
+/** Whether two outlines are the same ring: the same list, or the same corners. */
+function sameOutline(a: readonly LatLon[], b: readonly LatLon[]): boolean {
+  return (
+    a === b ||
+    (a.length === b.length &&
+      a.every((point, i) => point.lat === b[i]?.lat && point.lon === b[i]?.lon))
+  );
+}
+
+/**
+ * The outlines chained to these boxes: those whose boxes (grown by `NEIGHBOURHOOD_METRES`)
+ * meet one of them, then those whose boxes meet one of those, and so on. A gap is a hole of the
+ * union, and the ring of regions around a hole is chained this way, however far it reaches.
+ */
+function chainedTo(seeds: readonly Box[], outlines: readonly Outlined[]): Outlined[] {
+  const boxes = outlines.map((one) => grownBox(boxOf(one.outline), NEIGHBOURHOOD_METRES));
+  const taken = outlines.map(() => false);
+  const reached = [...seeds];
+  for (let i = 0; i < reached.length; i++) {
+    const from = reached[i] as Box;
+    boxes.forEach((box, j) => {
+      if (taken[j] || !boxesMeet(from, box)) return;
+      taken[j] = true;
+      reached.push(box);
+    });
+  }
+  return outlines.filter((_one, j) => taken[j]);
+}
+
+/**
+ * The overlaps and gaps a change of the outlines makes (`before` to `after`, by key), as a save
+ * is checked (spec 4.3: Save refuses a new overlap or gap; one that is there already does not
+ * block). Overlaps are cut only near what changed: the outlines whose boxes meet, within
+ * `NEIGHBOURHOOD_METRES`, the boxes of the outlines changed, added or removed (before and
+ * after), on both sides alike; a new overlap can only lie there. Gaps are cut over the outlines
+ * chained to what changed (`chainedTo`), so that a region closing a ring of regions far beyond
+ * it is seen to close the hole. `cache` keeps the overlaps of the pairs that did not change.
+ * Throws when polyclip cannot cut the outlines.
+ */
+export function newProblems(
+  before: readonly Outlined[],
+  after: readonly Outlined[],
+  cache?: OverlapCache,
+): Coverage {
+  const old = new Map(before.map((one) => [one.key, one.outline]));
+  const fresh = new Map(after.map((one) => [one.key, one.outline]));
+  const changed = new Set(
+    [...old.keys(), ...fresh.keys()].filter((key) => {
+      const a = old.get(key);
+      const b = fresh.get(key);
+      return !a || !b || !sameOutline(a, b);
+    }),
+  );
+  if (changed.size === 0) return { overlaps: [], gaps: [] };
+  const dirty = [...changed].flatMap((key) =>
+    [old.get(key), fresh.get(key)].flatMap((outline) =>
+      outline && outline.length > 0 ? [grownBox(boxOf(outline), NEIGHBOURHOOD_METRES)] : [],
+    ),
+  );
+  const near = (one: Outlined): boolean => {
+    const box = boxOf(one.outline);
+    return dirty.some((area) => boxesMeet(area, box));
+  };
+  const touches = (piece: Piece): boolean => dirty.some((area) => boxesMeet(area, piece.box));
+  const overlapsNow = overlapsOf(shapedOf(after.filter(near)), cache).filter(
+    (piece) => changed.has(piece.between[0]) || changed.has(piece.between[1]),
+  );
+  const overlapsThen = overlapsOf(shapedOf(before.filter(near)), cache).filter(touches);
+  const gapsNow = gapsOf(shapedOf(chainedTo(dirty, after))).filter(touches);
+  const gapsThen = gapsOf(shapedOf(chainedTo(dirty, before))).filter(touches);
+  return {
+    overlaps: newPieces(overlapsNow, overlapsThen),
+    gaps: newPieces(gapsNow, gapsThen),
+  };
+}
diff --git a/src/domain/regions/edits.test.ts b/src/domain/regions/edits.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7ab5e30e014460f7a54a145ae8fe74c75f9a7a30
--- /dev/null
+++ b/src/domain/regions/edits.test.ts
@@ -0,0 +1,469 @@
+import { describe, expect, it } from 'vitest';
+import { readKml, writeKml } from '../geo/kml.js';
+import type { LatLon } from '../geo/lat-lon.js';
+import {
+  applyEdits,
+  emptyEdits,
+  exportAreas,
+  kmlEdit,
+  newKey,
+  parseEdits,
+  rebaseAfterSave,
+  record,
+  redo,
+  regionKey,
+  saveRequest,
+  serialiseEdits,
+  undo,
+  type Edit,
+  type EditState,
+  type LoadedRegion,
+} from './edits.js';
+import { regionVersion } from './version.js';
+
+const p = (lat: number, lon: number): LatLon => ({ lat, lon });
+function square(south: number, west: number, north: number, east: number): LatLon[] {
+  return [p(south, west), p(north, west), p(north, east), p(south, east), p(south, west)];
+}
+
+function loaded(
+  id: number,
+  name: string,
+  outline: LatLon[] | null,
+  more: Partial<LoadedRegion> = {},
+): LoadedRegion {
+  const description = more.description ?? null;
+  return {
+    id,
+    channelId: `10000000000000000${id}`,
+    name,
+    category: 'Town',
+    description,
+    outline,
+    version: regionVersion(outline, description),
+    ...more,
+  };
+}
+
+const WEST = square(40, -80.1, 40.1, -80);
+const EAST = square(40, -80, 40.1, -79.9);
+const LOADED = [loaded(1, 'west', WEST), loaded(2, 'east', EAST)];
+const W = regionKey(1);
+const E = regionKey(2);
+const versionOf = (id: number): string => LOADED.find((one) => one.id === id)?.version ?? '';
+
+/** Records the edits one after the other, as the page does. */
+function staged(...edits: Edit[]): EditState {
+  return edits.reduce((state, edit) => record(state, edit), emptyEdits());
+}
+
+describe('staged edits', () => {
+  it('leave the loaded regions as they are until something is done', () => {
+    const drafts = applyEdits(LOADED, emptyEdits()).drafts;
+    expect(drafts.map((draft) => draft.key)).toEqual([W, E]);
+    expect(drafts[0]).toMatchObject({ regionId: 1, outline: WEST, removed: null, base: null });
+    expect(saveRequest(LOADED, drafts)).toEqual({
+      request: { changes: [], additions: [], removals: [] },
+      missingChannel: [],
+    });
+  });
+
+  it('change an outline, add a region, remove one, each remembering what it was loaded as', () => {
+    const moved = square(40, -80.1, 40.1, -80.01);
+    const fresh = square(40.1, -80.1, 40.2, -80);
+    const state = staged(
+      { kind: 'outline', key: W, outline: moved, bases: { [W]: versionOf(1) } },
+      {
+        kind: 'add',
+        key: newKey(0),
+        outline: fresh,
+        channel: { create: 'North Hills' },
+        description: 'Suburbs',
+      },
+      { kind: 'remove', key: E, forum: 'keep', bases: { [E]: versionOf(2) } },
+    );
+    const { drafts } = applyEdits(LOADED, state);
+    expect(drafts.map((draft) => [draft.key, draft.removed])).toEqual([
+      [W, null],
+      [E, 'keep'],
+      [newKey(0), null],
+    ]);
+    const { request } = saveRequest(LOADED, drafts);
+    expect(request.changes).toEqual([
+      {
+        regionId: 1,
+        outline: moved.map(({ lat, lon }) => [lat, lon]),
+        version: versionOf(1),
+      },
+    ]);
+    expect(request.additions).toEqual([
+      {
+        channel: { name: 'North Hills' },
+        description: 'Suburbs',
+        outline: fresh.map(({ lat, lon }) => [lat, lon]),
+      },
+    ]);
+    expect(request.removals).toEqual([{ regionId: 2, forum: 'keep', version: versionOf(2) }]);
+  });
+
+  it('send an outline at six decimals, and none that is only a rounding away', () => {
+    const near = WEST.map(({ lat, lon }) => p(lat + 1e-9, lon));
+    const state = staged({ kind: 'outline', key: W, outline: near, bases: { [W]: versionOf(1) } });
+    expect(saveRequest(LOADED, applyEdits(LOADED, state).drafts).request.changes).toEqual([]);
+    const off = WEST.map(({ lat, lon }, i) =>
+      i === 1 ? p(lat + 0.00123456789, lon) : p(lat, lon),
+    );
+    const sent = saveRequest(
+      LOADED,
+      applyEdits(LOADED, staged({ kind: 'outline', key: W, outline: off, bases: {} })).drafts,
+    ).request.changes[0]?.outline;
+    expect(sent?.[1]).toEqual([40.101235, -80.1]);
+  });
+
+  it('split a region: the part it keeps, a new region of the other, and swap them', () => {
+    const keep = square(40, -80.1, 40.1, -80.03);
+    const other = square(40, -80.03, 40.1, -80);
+    const state = staged({
+      kind: 'split',
+      key: W,
+      keep,
+      newKey: newKey(0),
+      other,
+      bases: { [W]: versionOf(1) },
+    });
+    let { drafts } = applyEdits(LOADED, state);
+    expect(drafts.find((draft) => draft.key === W)?.outline).toEqual(keep);
+    expect(drafts.find((draft) => draft.key === newKey(0))).toMatchObject({
+      regionId: null,
+      channel: null,
+      outline: other,
+    });
+    expect(saveRequest(LOADED, drafts).missingChannel).toEqual([newKey(0)]);
+    drafts = applyEdits(
+      LOADED,
+      record(state, { kind: 'swap', a: W, b: newKey(0), bases: {} }),
+    ).drafts;
+    expect(drafts.find((draft) => draft.key === W)?.outline).toEqual(other);
+    expect(drafts.find((draft) => draft.key === newKey(0))?.outline).toEqual(keep);
+  });
+
+  it('give a new region its channel and category, never a loaded one', () => {
+    const state = staged(
+      { kind: 'add', key: newKey(0), outline: EAST, channel: null, description: null },
+      {
+        kind: 'details',
+        key: newKey(0),
+        channel: { id: '100000000000000005', name: 'south' },
+        description: null,
+      },
+      { kind: 'details', key: W, channel: { create: 'elsewhere' }, description: 'Other' },
+    );
+    const { drafts } = applyEdits(LOADED, state);
+    expect(drafts.find((draft) => draft.key === newKey(0))?.channel).toEqual({
+      id: '100000000000000005',
+      name: 'south',
+    });
+    expect(drafts.find((draft) => draft.key === W)?.channel).toEqual({
+      id: LOADED[0]?.channelId,
+      name: 'west',
+    });
+    expect(saveRequest(LOADED, drafts).request.additions[0]?.channel).toEqual({
+      id: '100000000000000005',
+    });
+  });
+
+  it('take a new region off the list when it is removed, without a removal to send', () => {
+    const state = staged(
+      { kind: 'add', key: newKey(0), outline: EAST, channel: { create: 'x' }, description: null },
+      { kind: 'remove', key: newKey(0), forum: 'keep', bases: {} },
+    );
+    const { drafts } = applyEdits(LOADED, state);
+    expect(saveRequest(LOADED, drafts).request).toEqual({
+      changes: [],
+      additions: [],
+      removals: [],
+    });
+  });
+});
+
+describe('undo and redo', () => {
+  const first: Edit = {
+    kind: 'outline',
+    key: W,
+    outline: square(40, -80.1, 40.1, -80.02),
+    bases: { [W]: versionOf(1) },
+  };
+  const second: Edit = { kind: 'remove', key: E, forum: 'delete', bases: { [E]: versionOf(2) } };
+
+  it('step back and forth over every edit, and a new edit forgets what was undone', () => {
+    let state = staged(first, second);
+    state = undo(state);
+    expect(applyEdits(LOADED, state).drafts.find((draft) => draft.key === E)?.removed).toBeNull();
+    state = undo(state);
+    expect(applyEdits(LOADED, state).drafts.find((draft) => draft.key === W)?.outline).toEqual(
+      WEST,
+    );
+    expect(undo(state)).toBe(state);
+    state = redo(state);
+    expect(applyEdits(LOADED, state).drafts.find((draft) => draft.key === W)?.outline).toEqual(
+      first.outline,
+    );
+    expect(state.undone).toHaveLength(1);
+    state = record(state, { kind: 'remove', key: W, forum: 'keep', bases: {} });
+    expect(state.undone).toEqual([]);
+    expect(redo(state)).toBe(state);
+  });
+
+  it('take the steps of one drag of a region as one, and no more than 200 steps', () => {
+    const reshaped = (east: number): Edit => ({
+      kind: 'outline',
+      key: W,
+      outline: square(40, -80.1, 40.1, east),
+      bases: { [W]: versionOf(1) },
+    });
+    // A drag: one region's outline again and again, each within two seconds of the last.
+    let state = record(emptyEdits(), reshaped(-80.01), { at: 1_000 });
+    state = record(state, reshaped(-80.02), { at: 2_500 });
+    state = record(state, reshaped(-80.03), { at: 4_400 });
+    expect(state.edits).toEqual([reshaped(-80.03)]);
+    // A pause, another region, or an undo between: steps of their own.
+    state = record(state, reshaped(-80.04), { at: 7_000 });
+    expect(state.edits).toHaveLength(2);
+    state = record(state, { kind: 'outline', key: E, outline: EAST, bases: {} }, { at: 7_100 });
+    state = record(state, reshaped(-80.05), { at: 7_200 });
+    expect(state.edits).toHaveLength(4);
+    state = record(undo(state), reshaped(-80.06), { at: 7_300 });
+    expect(state.edits).toHaveLength(4);
+
+    let long = emptyEdits();
+    for (let i = 0; i < 205; i++) {
+      long = record(long, {
+        kind: 'add',
+        key: newKey(i),
+        outline: square(41 + i * 0.01, -80, 41.005 + i * 0.01, -79.99),
+        channel: null,
+        description: null,
+      });
+    }
+    expect(long.edits).toHaveLength(200);
+    expect(applyEdits(LOADED, long).drafts).toHaveLength(207);
+    expect(long.next).toBe(205);
+    // The last step back takes the oldest edits back together.
+    let back = long;
+    for (let i = 0; i < 199; i++) back = undo(back);
+    expect(applyEdits(LOADED, back).drafts).toHaveLength(8);
+    expect(applyEdits(LOADED, undo(back)).drafts).toHaveLength(2);
+  });
+
+  it('keep outlines at six decimals, without a corner the rounding repeats', () => {
+    const near = WEST.map(({ lat, lon }) => p(lat + 1e-9, lon - 1e-9));
+    const repeated = [p(40, -80), p(40.0000001, -80), ...EAST.slice(1)];
+    const state = staged(
+      { kind: 'outline', key: W, outline: near, bases: {} },
+      { kind: 'add', key: newKey(0), outline: repeated, channel: null, description: null },
+    );
+    const { drafts } = applyEdits(LOADED, state);
+    expect(drafts.find((draft) => draft.key === W)?.outline).toEqual(WEST);
+    expect(drafts.find((draft) => draft.key === newKey(0))?.outline).toEqual(EAST);
+  });
+
+  it('undo a loaded file as one edit', () => {
+    const file = kmlEdit(
+      [
+        { name: 'West', description: null, outline: square(40, -80.2, 40.1, -80), holes: false },
+        {
+          name: 'Far Away',
+          description: 'Edge',
+          outline: square(41, -80, 41.1, -79.9),
+          holes: false,
+        },
+      ],
+      LOADED,
+      applyEdits(LOADED, emptyEdits()).drafts,
+      [],
+      emptyEdits(),
+    );
+    const state = record(emptyEdits(), file);
+    expect(applyEdits(LOADED, state).drafts).toHaveLength(3);
+    expect(applyEdits(LOADED, undo(state)).drafts).toHaveLength(2);
+  });
+});
+
+describe('keeping staged edits in the browser', () => {
+  it('reads back what it wrote', () => {
+    const state = undo(
+      staged(
+        { kind: 'outline', key: W, outline: WEST, bases: { [W]: versionOf(1) } },
+        { kind: 'add', key: newKey(0), outline: EAST, channel: null, description: null },
+      ),
+    );
+    expect(parseEdits(serialiseEdits(state))).toEqual(state);
+  });
+
+  it('reads nothing of a text that is not its own', () => {
+    for (const text of [
+      '',
+      'null',
+      '{}',
+      '[]',
+      '{"v":2,"edits":[],"undone":[],"next":0}',
+      '{"v":1,"edits":[{"kind":"explode"}],"undone":[],"next":0}',
+      '{"v":1,"edits":[{"kind":"outline","key":"r1","outline":[{"lat":"x","lon":1}],"bases":{}}],"undone":[],"next":0}',
+      '{"v":1,"edits":[],"undone":[],"next":-1}',
+      'not json',
+    ]) {
+      expect(parseEdits(text), text).toBeUndefined();
+    }
+  });
+});
+
+describe('regions changed by somebody else', () => {
+  it('are told by the version they were loaded as', () => {
+    const state = staged({
+      kind: 'outline',
+      key: W,
+      outline: square(40, -80.1, 40.1, -80.02),
+      bases: { [W]: versionOf(1) },
+    });
+    // Somebody moved west's outline meanwhile, and removed east.
+    const theirs = square(40, -80.1, 40.1, -79.99);
+    const now = [loaded(1, 'west', theirs)];
+    const applied = applyEdits(now, state);
+    expect(applied.conflicts).toEqual([1]);
+    expect(applied.gone).toEqual([]);
+    // Take theirs: the outline as it is now, and no conflict.
+    const taken = record(state, { kind: 'take-theirs', key: W, version: now[0]!.version });
+    const afterTaking = applyEdits(now, taken);
+    expect(afterTaking.conflicts).toEqual([]);
+    expect(afterTaking.drafts[0]?.outline).toEqual(theirs);
+    // Keep mine: the outline staged, sent with the version it has now.
+    const kept = record(state, { kind: 'keep-mine', key: W, version: now[0]!.version });
+    const afterKeeping = applyEdits(now, kept);
+    expect(afterKeeping.conflicts).toEqual([]);
+    expect(saveRequest(now, afterKeeping.drafts).request.changes[0]?.version).toBe(now[0]!.version);
+  });
+
+  it('are none where the server has the very outline staged: it was saved', () => {
+    const moved = square(40, -80.1, 40.1, -80.02);
+    const state = staged(
+      { kind: 'outline', key: W, outline: moved, bases: { [W]: versionOf(1) } },
+      { kind: 'remove', key: E, forum: 'keep', bases: { [E]: versionOf(2) } },
+    );
+    // A save whose answer never came: west was saved; east was changed by somebody else.
+    const now = [loaded(1, 'west', moved), loaded(2, 'east', square(40, -80, 40.1, -79.95))];
+    const applied = applyEdits(now, state);
+    expect(applied.conflicts).toEqual([2]);
+    expect(saveRequest(now, applied.drafts).request.changes).toEqual([]);
+  });
+
+  it('are told when they are gone, until their edits are dropped', () => {
+    const state = staged({ kind: 'remove', key: E, forum: 'keep', bases: { [E]: versionOf(2) } });
+    const now = [LOADED[0]!];
+    expect(applyEdits(now, state).gone).toEqual([2]);
+    const dropped = record(state, { kind: 'take-theirs', key: E, version: '' });
+    expect(applyEdits(now, dropped).gone).toEqual([]);
+  });
+});
+
+describe('after a save', () => {
+  it('keeps staged only what the server does not have yet', () => {
+    const moved = square(40, -80.1, 40.1, -80.01);
+    const state = staged(
+      { kind: 'outline', key: W, outline: moved, bases: { [W]: versionOf(1) } },
+      { kind: 'remove', key: E, forum: 'delete', bases: { [E]: versionOf(2) } },
+      {
+        kind: 'add',
+        key: newKey(0),
+        outline: square(40.1, -80.1, 40.2, -80),
+        channel: { create: 'North' },
+        description: null,
+      },
+      {
+        kind: 'add',
+        key: newKey(1),
+        outline: square(39.9, -80.1, 40, -80),
+        channel: { create: 'South' },
+        description: null,
+      },
+    );
+    const { drafts } = applyEdits(LOADED, state);
+    // West was saved and North created; east could not be removed and South not created.
+    const now = [
+      loaded(1, 'west', moved),
+      loaded(2, 'east', EAST),
+      loaded(7, 'north', square(40.1, -80.1, 40.2, -80)),
+    ];
+    const left = rebaseAfterSave(drafts, now, state);
+    const after = applyEdits(now, left);
+    expect(after.conflicts).toEqual([]);
+    const { request } = saveRequest(now, after.drafts);
+    expect(request.changes).toEqual([]);
+    expect(request.removals).toEqual([{ regionId: 2, forum: 'delete', version: now[1]!.version }]);
+    expect(request.additions.map((one) => one.channel)).toEqual([{ name: 'South' }]);
+    expect(left.undone).toEqual([]);
+    // A save of the very drafts again, after which somebody else moved west: still staged,
+    // against the version it was first edited from, so that it is a conflict, never overwritten.
+    const theirs = [loaded(1, 'west', square(40, -80.1, 40.1, -79.99)), now[1]!];
+    const unsaved = rebaseAfterSave(drafts, theirs, state);
+    expect(applyEdits(theirs, unsaved).conflicts).toEqual([1]);
+    expect(saveRequest(theirs, applyEdits(theirs, unsaved).drafts).request.changes).toEqual([
+      expect.objectContaining({ regionId: 1, version: versionOf(1) }),
+    ]);
+    // Everything saved: nothing staged.
+    expect(rebaseAfterSave(applyEdits(now, emptyEdits()).drafts, now, emptyEdits()).edits).toEqual(
+      [],
+    );
+  });
+});
+
+describe('a KML file in the editor', () => {
+  it('reshapes the regions it names, adds the channels it names, and new ones', () => {
+    const drafts = applyEdits(LOADED, emptyEdits()).drafts;
+    const edit = kmlEdit(
+      [
+        { name: 'West', description: null, outline: square(40, -80.2, 40.1, -80), holes: false },
+        { name: 'south', description: null, outline: square(39.9, -80.1, 40, -80), holes: false },
+        {
+          name: 'Far Away',
+          description: 'Edge',
+          outline: square(41, -80, 41.1, -79.9),
+          holes: false,
+        },
+      ],
+      LOADED,
+      drafts,
+      [{ id: '100000000000000005', name: 'south' }],
+      emptyEdits(),
+    );
+    const after = applyEdits(LOADED, record(emptyEdits(), edit)).drafts;
+    expect(after.find((draft) => draft.key === W)?.outline).toEqual(square(40, -80.2, 40.1, -80));
+    expect(after.slice(2).map((draft) => [draft.channel, draft.description])).toEqual([
+      [{ id: '100000000000000005', name: 'south' }, null],
+      [{ create: 'Far Away' }, 'Edge'],
+    ]);
+  });
+
+  it('exports what the editor shows, which reads back as the same areas', () => {
+    const state = staged(
+      { kind: 'outline', key: W, outline: square(40, -80.1, 40.1, -80.02), bases: {} },
+      { kind: 'remove', key: E, forum: 'keep', bases: {} },
+      {
+        kind: 'add',
+        key: newKey(0),
+        outline: EAST,
+        channel: { create: 'North Hills' },
+        description: 'Suburbs',
+      },
+    );
+    const areas = exportAreas(LOADED, applyEdits(LOADED, state).drafts);
+    expect(areas.map((area) => [area.name, area.description])).toEqual([
+      ['west', 'Town'],
+      ['North Hills', 'Suburbs'],
+    ]);
+    const read = readKml(writeKml(areas));
+    expect(read.ok && read.areas.map((area) => area.outline)).toEqual([
+      square(40, -80.1, 40.1, -80.02),
+      EAST,
+    ]);
+  });
+});
diff --git a/src/domain/regions/edits.ts b/src/domain/regions/edits.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4323d60e3088099514427794b6dbda367e6922c6
--- /dev/null
+++ b/src/domain/regions/edits.ts
@@ -0,0 +1,586 @@
+import type { KmlArea } from '../geo/kml.js';
+import type { LatLon } from '../geo/lat-lon.js';
+import type { Point, SaveRequest } from '../web/editor-data.js';
+import { channelKey } from './region-import.js';
+import { normalisedOutline, regionVersion, roundSix } from './version.js';
+
+/**
+ * The staged changes of the region editor (spec 4.4, plan 8M-2): a list of edits applied to the
+ * regions as they were loaded, with undo and redo over it, kept in the browser between visits
+ * (`serialiseEdits`), and turned into what a save sends (`saveRequest`). Pure: the page keeps
+ * the state and draws what `applyEdits` gives.
+ *
+ * Every edit that touches a loaded region carries the version that region had when the edit was
+ * made (`bases`): a region whose version on the server differs from the one its first edit saw
+ * was changed by somebody else meanwhile (`conflicts`, spec 4.6), until the staff member takes
+ * theirs or keeps theirs own (which sends the version it has now). A region the server has as
+ * it is staged is no conflict: a save whose answer never came saved it.
+ */
+
+/** A region of the server as the editor loaded it (`EditorRegion`, outlines as places). */
+export interface LoadedRegion {
+  id: number;
+  channelId: string;
+  name: string;
+  /** The category of its channel: what an export writes as its description. */
+  category: string | null;
+  /** The region's own description, part of its version. */
+  description: string | null;
+  outline: LatLon[] | null;
+  version: string;
+}
+
+/** The channel of a region: one of the server (by id, with its name), or a new one to create. */
+export type ChannelChoice = { id: string; name: string } | { create: string };
+
+/** A region as the staged edits leave it. */
+export interface Draft {
+  /** `regionKey(id)` of a loaded region, `newKey(n)` of a new one. */
+  key: string;
+  /** The loaded region; null for a new one. */
+  regionId: number | null;
+  /** A loaded region's own channel; a new region's choice, null until it is chosen. */
+  channel: ChannelChoice | null;
+  /** For a new channel: the category to create it in (a KML description). */
+  description: string | null;
+  outline: LatLon[] | null;
+  /** Staged for removal, with what becomes of its forum. */
+  removed: 'keep' | 'delete' | null;
+  /** The version a loaded region had when it was first changed; null while unchanged. */
+  base: string | null;
+}
+
+/** The versions of the loaded regions an edit touches, by key, when the edit was made. */
+export type Bases = Record<string, string>;
+
+/**
+ * One staged edit. `add`: a new region (drawn, or of a file); `outline`: a region reshaped,
+ * moved or drawn anew; `details`: a new region's channel and category; `remove`; `split`: a
+ * region keeps one part and a new region gets the other; `swap`: two regions exchange their
+ * outlines (which part of a split keeps the region); `take-theirs` / `keep-mine`: a region
+ * changed by somebody else is taken as it is now, or the staged one is kept and sent with the
+ * version it has now; `batch`: several edits undone as one (a file).
+ */
+export type Edit =
+  | {
+      kind: 'add';
+      key: string;
+      outline: LatLon[];
+      channel: ChannelChoice | null;
+      description: string | null;
+    }
+  | { kind: 'outline'; key: string; outline: LatLon[]; bases: Bases }
+  | { kind: 'details'; key: string; channel: ChannelChoice | null; description: string | null }
+  | { kind: 'remove'; key: string; forum: 'keep' | 'delete'; bases: Bases }
+  | {
+      kind: 'split';
+      key: string;
+      keep: LatLon[];
+      newKey: string;
+      other: LatLon[];
+      bases: Bases;
+    }
+  | { kind: 'swap'; a: string; b: string; bases: Bases }
+  | { kind: 'take-theirs'; key: string; version: string }
+  | { kind: 'keep-mine'; key: string; version: string }
+  | { kind: 'batch'; edits: Edit[] };
+
+/**
+ * The edits made, those undone (the last undone last), and the number of the next new key.
+ * `recordedAt`: when the last edit was recorded (`record`), while nothing was undone or redone
+ * since; not kept in the browser.
+ */
+export interface EditState {
+  edits: Edit[];
+  undone: Edit[];
+  next: number;
+  recordedAt?: number;
+}
+
+/**
+ * How close one outline edit of a region must follow the one before it, of the same region, to
+ * be one step with it: Geoman reports a drag of a corner as many edits.
+ */
+export const SAME_STEP_MS = 2_000;
+/** How many steps undo goes back at most: the oldest edits beyond are one step together. */
+export const MAX_UNDO_STEPS = 200;
+
+/** The key of a loaded region. */
+export const regionKey = (id: number): string => `r${id}`;
+/** The key of the `n`-th new region. */
+export const newKey = (n: number): string => `n${n}`;
+
+export function emptyEdits(): EditState {
+  return { edits: [], undone: [], next: 0 };
+}
+
+/** The keys of new regions an edit makes. */
+function madeKeys(edit: Edit): string[] {
+  if (edit.kind === 'add') return [edit.key];
+  if (edit.kind === 'split') return [edit.newKey];
+  if (edit.kind === 'batch') return edit.edits.flatMap(madeKeys);
+  return [];
+}
+
+/** An edit with its outlines as the editor keeps them (`normalisedOutline`). */
+function normalised(edit: Edit): Edit {
+  switch (edit.kind) {
+    case 'add':
+    case 'outline':
+      return { ...edit, outline: normalisedOutline(edit.outline) };
+    case 'split':
+      return { ...edit, keep: normalisedOutline(edit.keep), other: normalisedOutline(edit.other) };
+    case 'batch':
+      return { ...edit, edits: edit.edits.map(normalised) };
+    default:
+      return edit;
+  }
+}
+
+/** The edits of one step: a batch's own, or the edit. */
+const stepEdits = (edit: Edit): Edit[] => (edit.kind === 'batch' ? edit.edits : [edit]);
+
+/**
+ * A new edit (made `when.at`, epoch milliseconds, where the page knows it): added after the
+ * others, its outlines at six decimals; what was undone is forgotten. An outline edit of the
+ * region the last edit reshaped, within `SAME_STEP_MS` of it, takes that edit's place (one step
+ * of undo for one drag). Beyond `MAX_UNDO_STEPS` the two oldest steps become one.
+ */
+export function record(state: EditState, edit: Edit, when?: { at: number }): EditState {
+  const at = when?.at;
+  const made = normalised(edit);
+  const numbers = madeKeys(made).flatMap((key) => {
+    const n = /^n(\d+)$/.exec(key)?.[1];
+    return n === undefined ? [] : [Number(n)];
+  });
+  const last = state.edits[state.edits.length - 1];
+  const sameStep =
+    made.kind === 'outline' &&
+    last?.kind === 'outline' &&
+    last.key === made.key &&
+    at !== undefined &&
+    state.recordedAt !== undefined &&
+    at - state.recordedAt <= SAME_STEP_MS;
+  let edits = sameStep
+    ? [...state.edits.slice(0, -1), { ...last, outline: made.outline }]
+    : [...state.edits, made];
+  if (edits.length > MAX_UNDO_STEPS) {
+    const [oldest, second, ...rest] = edits as [Edit, Edit, ...Edit[]];
+    edits = [{ kind: 'batch', edits: [...stepEdits(oldest), ...stepEdits(second)] }, ...rest];
+  }
+  return {
+    edits,
+    undone: [],
+    next: Math.max(state.next, ...numbers.map((n) => n + 1)),
+    ...(at === undefined ? {} : { recordedAt: at }),
+  };
+}
+
+/** The last edit undone; the very same state when there is none. */
+export function undo(state: EditState): EditState {
+  const last = state.edits[state.edits.length - 1];
+  if (!last) return state;
+  return { edits: state.edits.slice(0, -1), undone: [...state.undone, last], next: state.next };
+}
+
+/** The last undone edit made again; the very same state when there is none. */
+export function redo(state: EditState): EditState {
+  const last = state.undone[state.undone.length - 1];
+  if (!last) return state;
+  return { edits: [...state.edits, last], undone: state.undone.slice(0, -1), next: state.next };
+}
+
+/** What the staged edits make of the loaded regions. */
+export interface Applied {
+  /** The loaded regions in their order, then the new ones in the order they were made. */
+  drafts: Draft[];
+  /** The loaded regions changed by somebody else since they were first edited, by id. */
+  conflicts: number[];
+  /** The regions edited that the server no longer has, by id. */
+  gone: number[];
+}
+
+const loadedDraft = (region: LoadedRegion): Draft => ({
+  key: regionKey(region.id),
+  regionId: region.id,
+  channel: { id: region.channelId, name: region.name },
+  description: null,
+  outline: region.outline,
+  removed: null,
+  base: null,
+});
+
+/**
+ * The regions as the edits leave them, applied in order to the regions loaded now. An edit of
+ * a region the server no longer has does nothing; its region is `gone` until a `take-theirs`
+ * drops it. A loaded region keeps its channel: `details` change only new regions.
+ */
+export function applyEdits(loaded: readonly LoadedRegion[], state: EditState): Applied {
+  const drafts = new Map<string, Draft>(
+    loaded.map((region) => [regionKey(region.id), loadedDraft(region)]),
+  );
+  const missing = new Map<string, boolean>();
+  const byKey = new Map(loaded.map((region) => [regionKey(region.id), region]));
+  const touch = (key: string, bases: Bases): Draft | undefined => {
+    const draft = drafts.get(key);
+    if (!draft) {
+      if (/^r\d+$/.test(key)) missing.set(key, true);
+      return undefined;
+    }
+    if (draft.regionId !== null) draft.base ??= bases[key] ?? null;
+    return draft;
+  };
+  const apply = (edit: Edit): void => {
+    switch (edit.kind) {
+      case 'add':
+        drafts.set(edit.key, {
+          key: edit.key,
+          regionId: null,
+          channel: edit.channel,
+          description: edit.description,
+          outline: edit.outline,
+          removed: null,
+          base: null,
+        });
+        return;
+      case 'outline': {
+        const draft = touch(edit.key, edit.bases);
+        if (draft) draft.outline = edit.outline;
+        return;
+      }
+      case 'details': {
+        const draft = drafts.get(edit.key);
+        if (draft && draft.regionId === null) {
+          draft.channel = edit.channel;
+          draft.description = edit.description;
+        }
+        return;
+      }
+      case 'remove': {
+        const draft = touch(edit.key, edit.bases);
+        if (!draft) return;
+        if (draft.regionId === null) drafts.delete(edit.key);
+        else draft.removed = edit.forum;
+        return;
+      }
+      case 'split': {
+        const draft = touch(edit.key, edit.bases);
+        if (!draft) return;
+        draft.outline = edit.keep;
+        drafts.set(edit.newKey, {
+          key: edit.newKey,
+          regionId: null,
+          channel: null,
+          description: null,
+          outline: edit.other,
+          removed: null,
+          base: null,
+        });
+        return;
+      }
+      case 'swap': {
+        const a = touch(edit.a, edit.bases);
+        const b = touch(edit.b, edit.bases);
+        if (a && b) [a.outline, b.outline] = [b.outline, a.outline];
+        return;
+      }
+      case 'take-theirs': {
+        missing.set(edit.key, false);
+        const region = byKey.get(edit.key);
+        if (region) drafts.set(edit.key, { ...loadedDraft(region), base: edit.version });
+        return;
+      }
+      case 'keep-mine': {
+        const draft = drafts.get(edit.key);
+        if (draft) draft.base = edit.version;
+        return;
+      }
+      case 'batch':
+        for (const inner of edit.edits) apply(inner);
+        return;
+    }
+  };
+  for (const edit of state.edits) apply(edit);
+  const all = [...drafts.values()];
+  // A region the server has as it is staged was saved (by a save whose answer never came):
+  // no conflict, and nothing to send.
+  const conflicts = all.flatMap((draft) => {
+    const region = draft.regionId === null ? undefined : byKey.get(draft.key);
+    if (!region || draft.base === null || draft.base === region.version) return [];
+    const saved =
+      draft.removed === null && regionVersion(draft.outline, region.description) === region.version;
+    return saved ? [] : [region.id];
+  });
+  const gone = [...missing]
+    .filter(([, isMissing]) => isMissing)
+    .map(([key]) => Number(key.slice(1)))
+    .sort((a, b) => a - b);
+  return {
+    drafts: [
+      ...all.filter((draft) => draft.regionId !== null),
+      ...all.filter((draft) => draft.regionId === null),
+    ],
+    conflicts,
+    gone,
+  };
+}
+
+/** An outline as a save sends it: `[lat, lon]` at six decimals. */
+export const toPoints = (outline: readonly LatLon[]): Point[] =>
+  outline.map(({ lat, lon }) => [roundSix(lat), roundSix(lon)]);
+
+/** Points as places. */
+export const toLatLons = (points: readonly Point[]): LatLon[] =>
+  points.map(([lat, lon]) => ({ lat, lon }));
+
+/** Whether a draft of a loaded region has another outline than the region has on the server. */
+export function outlineChanged(draft: Draft, region: LoadedRegion): boolean {
+  return (
+    draft.outline !== null && regionVersion(draft.outline, region.description) !== region.version
+  );
+}
+
+/**
+ * What a save of the drafts sends (spec 4.5): the changed outlines of loaded regions, the new
+ * regions, and the removals, each loaded region with the version its first edit saw (or the
+ * one it has, when it was never edited). A new region without a channel is not sent: it is
+ * named in `missingChannel`, and Save waits for it.
+ */
+export function saveRequest(
+  loaded: readonly LoadedRegion[],
+  drafts: readonly Draft[],
+): { request: SaveRequest; missingChannel: string[] } {
+  const byId = new Map(loaded.map((region) => [region.id, region]));
+  const request: SaveRequest = { changes: [], additions: [], removals: [] };
+  const missingChannel: string[] = [];
+  for (const draft of drafts) {
+    const region = draft.regionId === null ? undefined : byId.get(draft.regionId);
+    if (region) {
+      const version = draft.base ?? region.version;
+      if (draft.removed !== null) {
+        request.removals.push({ regionId: region.id, forum: draft.removed, version });
+      } else if (draft.outline !== null && outlineChanged(draft, region)) {
+        request.changes.push({ regionId: region.id, outline: toPoints(draft.outline), version });
+      }
+      continue;
+    }
+    if (draft.regionId !== null || draft.removed !== null || draft.outline === null) continue;
+    if (draft.channel === null) {
+      missingChannel.push(draft.key);
+      continue;
+    }
+    request.additions.push({
+      channel: 'id' in draft.channel ? { id: draft.channel.id } : { name: draft.channel.create },
+      description: draft.description,
+      outline: toPoints(draft.outline),
+    });
+  }
+  return { request, missingChannel };
+}
+
+/** The name a draft goes by: its channel's, the name of the channel to create, or none yet. */
+export function draftName(draft: Draft): string | undefined {
+  if (draft.channel === null) return undefined;
+  return 'id' in draft.channel ? draft.channel.name : draft.channel.create;
+}
+
+/** The format of what is kept in the browser; another is not read. */
+const FORMAT = 1;
+
+/** The staged edits as the browser keeps them (`localStorage`). */
+export function serialiseEdits(state: EditState): string {
+  const { edits, undone, next } = state;
+  return JSON.stringify({ v: FORMAT, edits, undone, next });
+}
+
+const isObject = (value: unknown): value is Record<string, unknown> =>
+  typeof value === 'object' && value !== null && !Array.isArray(value);
+const isText = (value: unknown): value is string => typeof value === 'string';
+const isTextOrNull = (value: unknown): boolean => value === null || isText(value);
+const isOutline = (value: unknown): value is LatLon[] =>
+  Array.isArray(value) &&
+  value.every(
+    (point) => isObject(point) && Number.isFinite(point.lat) && Number.isFinite(point.lon),
+  );
+const isBases = (value: unknown): boolean => isObject(value) && Object.values(value).every(isText);
+const isChannel = (value: unknown): boolean =>
+  value === null ||
+  (isObject(value) &&
+    ((isText(value.id) && isText(value.name)) || (value.id === undefined && isText(value.create))));
+const isForum = (value: unknown): boolean => value === 'keep' || value === 'delete';
+
+/** Whether a value read back is an edit this code made. */
+function isEdit(value: unknown): value is Edit {
+  if (!isObject(value)) return false;
+  switch (value.kind) {
+    case 'add':
+      return (
+        isText(value.key) &&
+        isOutline(value.outline) &&
+        isChannel(value.channel) &&
+        isTextOrNull(value.description)
+      );
+    case 'outline':
+      return isText(value.key) && isOutline(value.outline) && isBases(value.bases);
+    case 'details':
+      return isText(value.key) && isChannel(value.channel) && isTextOrNull(value.description);
+    case 'remove':
+      return isText(value.key) && isForum(value.forum) && isBases(value.bases);
+    case 'split':
+      return (
+        isText(value.key) &&
+        isOutline(value.keep) &&
+        isText(value.newKey) &&
+        isOutline(value.other) &&
+        isBases(value.bases)
+      );
+    case 'swap':
+      return isText(value.a) && isText(value.b) && isBases(value.bases);
+    case 'take-theirs':
+    case 'keep-mine':
+      return isText(value.key) && isText(value.version);
+    case 'batch':
+      return Array.isArray(value.edits) && value.edits.every(isEdit);
+    default:
+      return false;
+  }
+}
+
+/** Staged edits read back from the browser; undefined for anything this code did not write. */
+export function parseEdits(text: string): EditState | undefined {
+  let value: unknown;
+  try {
+    value = JSON.parse(text);
+  } catch {
+    return undefined;
+  }
+  if (!isObject(value) || value.v !== FORMAT) return undefined;
+  const { edits, undone, next } = value;
+  if (!Array.isArray(edits) || !edits.every(isEdit)) return undefined;
+  if (!Array.isArray(undone) || !undone.every(isEdit)) return undefined;
+  if (typeof next !== 'number' || !Number.isInteger(next) || next < 0) return undefined;
+  return { edits, undone, next };
+}
+
+/**
+ * The staged edits left after a save, full or partial (spec 6): the drafts as they were, against
+ * the regions the server has now. What it has as the draft has it (an outline saved, a region
+ * removed, a new region whose channel now has it) is no longer staged; the rest is, against the
+ * versions its regions had when they were first edited (so that what somebody else changed
+ * meanwhile is a conflict). Undo starts afresh.
+ */
+export function rebaseAfterSave(
+  drafts: readonly Draft[],
+  loaded: readonly LoadedRegion[],
+  state: EditState,
+): EditState {
+  const byId = new Map(loaded.map((region) => [region.id, region]));
+  const edits: Edit[] = [];
+  for (const draft of drafts) {
+    if (draft.regionId !== null) {
+      const region = byId.get(draft.regionId);
+      if (!region) continue;
+      // Against the version it was first edited from: a region somebody else changed since is
+      // a conflict, never overwritten unseen.
+      const bases = { [draft.key]: draft.base ?? region.version };
+      if (draft.removed !== null) {
+        edits.push({ kind: 'remove', key: draft.key, forum: draft.removed, bases });
+      } else if (draft.outline !== null && outlineChanged(draft, region)) {
+        edits.push({ kind: 'outline', key: draft.key, outline: draft.outline, bases });
+      }
+      continue;
+    }
+    if (draft.outline === null || draft.removed !== null) continue;
+    const { channel } = draft;
+    const saved = loaded.some(
+      (region) =>
+        channel !== null &&
+        ('id' in channel
+          ? region.channelId === channel.id
+          : channelKey(region.name) === channelKey(channel.create)) &&
+        regionVersion(draft.outline, region.description) === region.version,
+    );
+    if (saved) continue;
+    edits.push({
+      kind: 'add',
+      key: draft.key,
+      outline: draft.outline,
+      channel: draft.channel,
+      description: draft.description,
+    });
+  }
+  return { edits, undone: [], next: state.next };
+}
+
+/**
+ * The areas of a KML file as one staged edit (`readKml` gave them): an area named after a
+ * region shown (by the rule of `/region import`, `channelKey`) reshapes it; one named after a
+ * text channel that is no region yet makes that channel a region; any other makes a new region
+ * of a new channel of its name, in the category its description names (as `/region import`
+ * would create it). New regions are numbered from `state.next`.
+ */
+export function kmlEdit(
+  areas: readonly KmlArea[],
+  loaded: readonly LoadedRegion[],
+  drafts: readonly Draft[],
+  channels: readonly { id: string; name: string }[],
+  state: EditState,
+): Edit {
+  const versions = new Map(loaded.map((region) => [regionKey(region.id), region.version]));
+  const edits: Edit[] = [];
+  let next = state.next;
+  for (const area of areas) {
+    const wanted = channelKey(area.name);
+    const draft =
+      wanted === ''
+        ? undefined
+        : drafts.find((one) => one.removed === null && channelKey(draftName(one) ?? '') === wanted);
+    if (draft) {
+      const version = versions.get(draft.key);
+      edits.push({
+        kind: 'outline',
+        key: draft.key,
+        outline: area.outline,
+        bases: version === undefined ? {} : { [draft.key]: version },
+      });
+      continue;
+    }
+    const channel =
+      wanted === '' ? undefined : channels.find((one) => channelKey(one.name) === wanted);
+    edits.push({
+      kind: 'add',
+      key: newKey(next++),
+      outline: area.outline,
+      channel: channel
+        ? { id: channel.id, name: channel.name }
+        : wanted === ''
+          ? null
+          : { create: area.name },
+      description: channel ? null : area.description,
+    });
+  }
+  return { kind: 'batch', edits };
+}
+
+/**
+ * What the editor shows, as the areas of a KML file (spec 4.7, `writeKml`): the regions not
+ * staged for removal that have an outline, each named after its channel (a new one after the
+ * channel it will create), described by its category, as `/region export` writes them.
+ */
+export function exportAreas(
+  loaded: readonly LoadedRegion[],
+  drafts: readonly Draft[],
+): Pick<KmlArea, 'name' | 'description' | 'outline'>[] {
+  const byId = new Map(loaded.map((region) => [region.id, region]));
+  return drafts.flatMap((draft, index) => {
+    if (draft.removed !== null || draft.outline === null) return [];
+    const region = draft.regionId === null ? undefined : byId.get(draft.regionId);
+    return [
+      {
+        name: draftName(draft) ?? `New region ${index + 1}`,
+        description: region ? region.category : draft.description,
+        outline: draft.outline,
+      },
+    ];
+  });
+}
diff --git a/src/domain/regions/save-plan.test.ts b/src/domain/regions/save-plan.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9b480003a97d1c7ea7ca9103971eddd06ce4be97
--- /dev/null
+++ b/src/domain/regions/save-plan.test.ts
@@ -0,0 +1,200 @@
+import { describe, expect, it } from 'vitest';
+import type { LatLon } from '../geo/lat-lon.js';
+import type { Point, SaveRequest } from '../web/editor-data.js';
+import type { ServerChannel } from './region-import.js';
+import { planSave, type SaveRegion } from './save-plan.js';
+import { regionVersion } from './version.js';
+
+const p = (lat: number, lon: number): LatLon => ({ lat, lon });
+function square(south: number, west: number, north: number, east: number): LatLon[] {
+  return [p(south, west), p(north, west), p(north, east), p(south, east), p(south, west)];
+}
+const points = (ring: LatLon[]): Point[] => ring.map(({ lat, lon }) => [lat, lon]);
+
+const WEST = square(40, -80.1, 40.1, -80);
+const EAST = square(40, -80, 40.1, -79.9);
+const REGIONS: SaveRegion[] = [
+  { id: 1, guildId: 1, channelId: '100000000000000001', description: null, bounds: WEST },
+  { id: 2, guildId: 1, channelId: '100000000000000002', description: null, bounds: EAST },
+  { id: 4, guildId: 2, channelId: '100000000000000004', description: null, bounds: null },
+];
+const CHANNELS: ServerChannel[] = [
+  { id: '100000000000000041', name: 'Town', kind: 'category', categoryId: null },
+  { id: '100000000000000001', name: 'west', kind: 'text', categoryId: '100000000000000041' },
+  { id: '100000000000000002', name: 'east', kind: 'text', categoryId: '100000000000000041' },
+  { id: '100000000000000005', name: 'south', kind: 'text', categoryId: null },
+  { id: '100000000000000006', name: 'raid-forum', kind: 'forum', categoryId: null },
+];
+const version = (id: number): string => {
+  const region = REGIONS.find((one) => one.id === id);
+  return regionVersion(region?.bounds ?? null, region?.description ?? null);
+};
+
+const plan = (request: Partial<SaveRequest>) =>
+  planSave(
+    { changes: [], additions: [], removals: [], ...request },
+    { guildId: 1, regions: REGIONS, channels: CHANNELS },
+  );
+
+describe('a save of the region editor', () => {
+  it('is the areas of an import, named after their channels, and the removals', () => {
+    const moved = square(40, -80.1, 40.1, -80.01);
+    const fresh = square(39.9, -80.1, 40, -80);
+    const planned = plan({
+      changes: [{ regionId: 1, outline: points(moved), version: version(1) }],
+      additions: [
+        { channel: { id: '100000000000000005' }, description: null, outline: points(fresh) },
+        {
+          channel: { name: 'North Hills' },
+          description: 'Suburbs',
+          outline: points(square(40.1, -80.1, 40.2, -80)),
+        },
+      ],
+      removals: [{ regionId: 2, forum: 'delete', version: version(2) }],
+    });
+    expect(planned.problems).toEqual([]);
+    expect(planned.conflicts).toEqual([]);
+    expect(planned.areas.map((area) => [area.name, area.description, area.outline])).toEqual([
+      ['west', null, moved],
+      ['south', null, fresh],
+      ['North Hills', 'Suburbs', square(40.1, -80.1, 40.2, -80)],
+    ]);
+    expect(planned.removals).toEqual([{ regionId: 2, forum: 'delete' }]);
+    expect(planned.before.map((one) => one.key)).toEqual(['r1', 'r2']);
+    expect(planned.after.map((one) => [one.key, one.outline])).toEqual([
+      ['r1', moved],
+      ['a0', fresh],
+      ['a1', square(40.1, -80.1, 40.2, -80)],
+    ]);
+  });
+
+  it('names the regions changed or removed since the page loaded them, and those gone', () => {
+    const planned = plan({
+      changes: [{ regionId: 1, outline: points(WEST), version: 'older-version-x' }],
+      removals: [
+        { regionId: 9, forum: 'keep', version: 'x' },
+        // Another server's region is none of this server's.
+        { regionId: 4, forum: 'keep', version: version(4) },
+      ],
+    });
+    expect(planned.conflicts).toEqual([
+      { regionId: 1, gone: false },
+      { regionId: 9, gone: true },
+      { regionId: 4, gone: true },
+    ]);
+  });
+
+  it('refuses outlines that are no outline, as the page would', () => {
+    const crossing: Point[] = [
+      [40, -80.1],
+      [40.1, -80],
+      [40.1, -80.1],
+      [40, -80],
+      [40, -80.1],
+    ];
+    const planned = plan({
+      changes: [{ regionId: 1, outline: crossing, version: version(1) }],
+      additions: [
+        {
+          channel: { name: 'x' },
+          description: null,
+          outline: [
+            [40, -80],
+            [40.1, -80],
+          ],
+        },
+      ],
+    });
+    expect(planned.problems).toEqual([
+      { kind: 'outline', target: { regionId: 1 }, problem: { kind: 'crosses-itself' } },
+      { kind: 'outline', target: { addition: 0 }, problem: { kind: 'too-few' } },
+    ]);
+    expect(planned.areas).toEqual([]);
+  });
+
+  it('refuses a channel that cannot be a new region, and a region named twice', () => {
+    const outline = points(square(39.9, -80.1, 40, -80));
+    const planned = plan({
+      changes: [
+        { regionId: 1, outline: points(WEST), version: version(1) },
+        { regionId: 1, outline: points(WEST), version: version(1) },
+      ],
+      additions: [
+        { channel: { id: '100000000000000002' }, description: null, outline },
+        { channel: { id: '100000000000000006' }, description: null, outline },
+        { channel: { id: '100000000000000099' }, description: null, outline },
+        { channel: { name: '!!!' }, description: null, outline },
+      ],
+      removals: [{ regionId: 2, forum: 'keep', version: version(2) }],
+    });
+    expect(planned.problems).toEqual([
+      { kind: 'twice', regionId: 1 },
+      { kind: 'already-region', addition: 0, name: 'east' },
+      { kind: 'not-a-channel', addition: 1 },
+      { kind: 'not-a-channel', addition: 2 },
+      { kind: 'no-name', addition: 3 },
+    ]);
+  });
+
+  it('refuses a new channel named as a channel the server has, region or not', () => {
+    const outline = points(square(39.9, -80.1, 40, -80));
+    const planned = plan({
+      additions: [
+        { channel: { name: 'West' }, description: null, outline },
+        { channel: { name: '#South' }, description: null, outline },
+        { channel: { name: 'Raid Forum' }, description: null, outline },
+        // A category of the name is no channel a region could be.
+        { channel: { name: 'town' }, description: null, outline },
+      ],
+    });
+    expect(planned.problems).toEqual([
+      { kind: 'channel-exists', addition: 0, name: 'west', listed: false },
+      { kind: 'channel-exists', addition: 1, name: 'south', listed: true },
+      { kind: 'channel-exists', addition: 2, name: 'raid-forum', listed: false },
+    ]);
+    expect(planned.areas.map((area) => area.name)).toEqual(['town']);
+  });
+
+  it('takes a category as a file would give it, and none for an empty one', () => {
+    const outline = points(square(39.9, -80.1, 40, -80));
+    const planned = plan({
+      additions: [
+        { channel: { name: 'Hills' }, description: '<b>Suburbs</b>  north<br>more', outline },
+        { channel: { name: 'Dales' }, description: '   ', outline },
+      ],
+    });
+    expect(planned.areas.map((area) => area.description)).toEqual(['Suburbs north', null]);
+  });
+
+  it('takes outlines at six decimals, without a corner repeated by the rounding', () => {
+    const planned = plan({
+      additions: [
+        {
+          channel: { name: 'Hills' },
+          description: null,
+          outline: [
+            [39.90000001, -80.1],
+            [39.90000004, -80.1],
+            [40.0000004, -80.1],
+            [40, -80.0000001],
+            [39.9, -80],
+            [39.9, -80.1],
+          ],
+        },
+      ],
+    });
+    expect(planned.areas[0]?.outline).toEqual(square(39.9, -80.1, 40, -80));
+  });
+
+  it('refuses a new outline for a region whose channel is gone: its name would make a new one', () => {
+    const planned = planSave(
+      {
+        changes: [{ regionId: 2, outline: points(EAST), version: version(2) }],
+        additions: [],
+        removals: [],
+      },
+      { guildId: 1, regions: REGIONS, channels: CHANNELS.filter((one) => one.name !== 'east') },
+    );
+    expect(planned.problems).toEqual([{ kind: 'channel-gone', regionId: 2 }]);
+  });
+});
diff --git a/src/domain/regions/save-plan.ts b/src/domain/regions/save-plan.ts
new file mode 100644
index 0000000000000000000000000000000000000000..727603d59acb10c9a8f2bf9a08ad4d778df44f50
--- /dev/null
+++ b/src/domain/regions/save-plan.ts
@@ -0,0 +1,206 @@
+import { plainDescription, type KmlArea } from '../geo/kml.js';
+import type { LatLon } from '../geo/lat-lon.js';
+import { tidyOutline, type OutlineProblem } from '../geo/outline.js';
+import type { SaveRequest } from '../web/editor-data.js';
+import type { Outlined } from './coverage.js';
+import { channelKey, channelNameFor, type ServerChannel } from './region-import.js';
+import { normalisedOutline, regionVersion } from './version.js';
+
+/**
+ * What a save of the region editor asks for, made into what `/region import` and `/region
+ * remove` do (plan 8M-2): the areas of an import, named so that `planImport` finds their
+ * channels, and the removals; and what keeps it from being done. Pure: the caller gives the
+ * regions and the server's channels as they are now, and never trusts the page.
+ */
+
+/** A region as the plan needs it. */
+export interface SaveRegion {
+  id: number;
+  guildId: number | null;
+  channelId: string;
+  description: string | null;
+  bounds: readonly LatLon[] | null;
+}
+
+/** What a save asks for that cannot be: none of it is done then. */
+export type SaveProblem =
+  /** A region is changed or removed twice in one save. */
+  | { kind: 'twice'; regionId: number }
+  /**
+   * A changed region's channel is gone: its outline goes to a channel by name, and the name it
+   * had would make a new channel.
+   */
+  | { kind: 'channel-gone'; regionId: number }
+  /** An outline that cannot be a region's (`tidyOutline`). */
+  | {
+      kind: 'outline';
+      target: { regionId: number } | { addition: number };
+      problem: OutlineProblem;
+    }
+  /** A new region on a channel that is a region already. */
+  | { kind: 'already-region'; addition: number; name: string }
+  /** A new region on what is no ordinary text channel of the server. */
+  | { kind: 'not-a-channel'; addition: number }
+  /** A new channel whose name gives no channel name. */
+  | { kind: 'no-name'; addition: number }
+  /**
+   * A new channel named as a channel the server has (by `channelKey`; categories aside), which
+   * the import would take instead of making one. `listed`: it is a text channel that is no
+   * region, which the page offers to pick.
+   */
+  | { kind: 'channel-exists'; addition: number; name: string; listed: boolean };
+
+export interface SavePlan {
+  /** The areas to import: changed outlines first (by their channels' names), then new ones. */
+  areas: KmlArea[];
+  removals: { regionId: number; forum: 'keep' | 'delete' }[];
+  /**
+   * The regions changed (`gone: false`) or removed (`gone: true`; or never this server's) since
+   * the page loaded them: their versions differ from what the page sent.
+   */
+  conflicts: { regionId: number; gone: boolean }[];
+  problems: SaveProblem[];
+  /** The server's outlines now (`r<id>`), for the check of new overlaps and gaps. */
+  before: Outlined[];
+  /** Its outlines after the save: `r<id>` for its regions, `a<i>` for the i-th addition. */
+  after: Outlined[];
+}
+
+/** Points as places, as the editor keeps outlines (`normalisedOutline`). */
+const toLatLons = (points: readonly [number, number][]): LatLon[] =>
+  normalisedOutline(points.map(([lat, lon]) => ({ lat, lon })));
+
+/**
+ * The category a new channel is created in, as the page sent it: read as a file's description
+ * is (`plainDescription`); none when nothing is left, and the import names it after the channel.
+ */
+function categoryOf(description: string | null): string | null {
+  const text = description === null ? '' : plainDescription(description);
+  return text === '' ? null : text;
+}
+
+/**
+ * The plan of a save. A region changed or removed must be the server's, with the version the
+ * page loaded (else a conflict); a changed region's channel must still be there. A new region
+ * goes to a text channel of the server that is no region (by id: named so that `planImport`
+ * finds it), or to a new channel of the name given, which no channel of the server may have
+ * (whose category its description names, `categoryOf`). Every outline is taken at six decimals
+ * (`normalisedOutline`) and tidied as an import tidies it.
+ */
+export function planSave(
+  request: SaveRequest,
+  server: { guildId: number; regions: readonly SaveRegion[]; channels: readonly ServerChannel[] },
+): SavePlan {
+  const { guildId, regions, channels } = server;
+  const own = regions.filter((region) => region.guildId === guildId);
+  const ownById = new Map(own.map((region) => [region.id, region]));
+  const text = new Map(
+    channels.filter((channel) => channel.kind === 'text').map((channel) => [channel.id, channel]),
+  );
+  const areas: KmlArea[] = [];
+  const problems: SaveProblem[] = [];
+  const conflicts: SavePlan['conflicts'] = [];
+  const seen = new Set<number>();
+  const replaced = new Map<number, LatLon[]>();
+
+  const check = (regionId: number, version: string): SaveRegion | undefined => {
+    if (seen.has(regionId)) {
+      problems.push({ kind: 'twice', regionId });
+      return undefined;
+    }
+    seen.add(regionId);
+    const region = ownById.get(regionId);
+    if (!region) {
+      conflicts.push({ regionId, gone: true });
+      return undefined;
+    }
+    if (regionVersion(region.bounds, region.description) !== version) {
+      conflicts.push({ regionId, gone: false });
+    }
+    return region;
+  };
+
+  for (const change of request.changes) {
+    const region = check(change.regionId, change.version);
+    if (!region) continue;
+    const channel = text.get(region.channelId);
+    if (!channel) {
+      problems.push({ kind: 'channel-gone', regionId: region.id });
+      continue;
+    }
+    const outline = tidyOutline(toLatLons(change.outline));
+    if (!outline.ok) {
+      problems.push({ kind: 'outline', target: { regionId: region.id }, problem: outline.problem });
+      continue;
+    }
+    replaced.set(region.id, outline.ring);
+    areas.push({ name: channel.name, description: null, outline: outline.ring, holes: false });
+  }
+  const removals: SavePlan['removals'] = [];
+  for (const removal of request.removals) {
+    const region = check(removal.regionId, removal.version);
+    if (region) removals.push({ regionId: region.id, forum: removal.forum });
+  }
+  const added: Outlined[] = [];
+  request.additions.forEach((addition, index) => {
+    let name: string;
+    if ('id' in addition.channel) {
+      const channel = text.get(addition.channel.id);
+      if (!channel) {
+        problems.push({ kind: 'not-a-channel', addition: index });
+        return;
+      }
+      if (regions.some((region) => region.channelId === channel.id)) {
+        problems.push({ kind: 'already-region', addition: index, name: channel.name });
+        return;
+      }
+      name = channel.name;
+    } else {
+      const key = channelNameFor(addition.channel.name);
+      if (key === '') {
+        problems.push({ kind: 'no-name', addition: index });
+        return;
+      }
+      const namesake = channels.find(
+        (channel) => channel.kind !== 'category' && channelKey(channel.name) === key,
+      );
+      if (namesake) {
+        problems.push({
+          kind: 'channel-exists',
+          addition: index,
+          name: namesake.name,
+          listed:
+            namesake.kind === 'text' && !regions.some((region) => region.channelId === namesake.id),
+        });
+        return;
+      }
+      name = addition.channel.name;
+    }
+    const outline = tidyOutline(toLatLons(addition.outline));
+    if (!outline.ok) {
+      problems.push({ kind: 'outline', target: { addition: index }, problem: outline.problem });
+      return;
+    }
+    areas.push({
+      name,
+      description: 'id' in addition.channel ? null : categoryOf(addition.description),
+      outline: outline.ring,
+      holes: false,
+    });
+    added.push({ key: `a${index}`, outline: outline.ring });
+  });
+
+  const removed = new Set(removals.map((removal) => removal.regionId));
+  const before = own.flatMap((region) =>
+    region.bounds === null ? [] : [{ key: `r${region.id}`, outline: region.bounds }],
+  );
+  const after = [
+    ...own.flatMap((region) => {
+      if (removed.has(region.id)) return [];
+      const outline = replaced.get(region.id) ?? region.bounds;
+      return outline === null ? [] : [{ key: `r${region.id}`, outline }];
+    }),
+    ...added,
+  ];
+  return { areas, removals, conflicts, problems, before, after };
+}
diff --git a/src/domain/regions/split.test.ts b/src/domain/regions/split.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f5dfc6b45d5b2f3c224850f6b7b2cb20b05fbed9
--- /dev/null
+++ b/src/domain/regions/split.test.ts
@@ -0,0 +1,80 @@
+import { describe, expect, it } from 'vitest';
+import type { LatLon } from '../geo/lat-lon.js';
+import { ringContains } from '../geo/region-membership.js';
+import { ringArea } from './coverage.js';
+import { splitOutline } from './split.js';
+
+const p = (lat: number, lon: number): LatLon => ({ lat, lon });
+const SQUARE = [p(40, -80.1), p(40.1, -80.1), p(40.1, -80), p(40, -80), p(40, -80.1)];
+
+function parts(line: LatLon[], ring = SQUARE): [LatLon[], LatLon[]] {
+  const split = splitOutline(ring, line);
+  if (!split.ok) throw new Error(`not split: ${split.reason}`);
+  return split.parts;
+}
+
+describe('splitting an outline along a line', () => {
+  it('gives the two parts on either side, the larger first, closed', () => {
+    // A line from south to north at -80.07: west of it 0.03 degrees, east 0.07.
+    const [larger, smaller] = parts([p(39.99, -80.07), p(40.11, -80.07)]);
+    expect(ringContains(larger, p(40.05, -80.02))).toBe(true);
+    expect(ringContains(smaller, p(40.05, -80.09))).toBe(true);
+    expect(ringContains(larger, p(40.05, -80.09))).toBe(false);
+    expect(larger[0]).toEqual(larger[larger.length - 1]);
+    expect(smaller[0]).toEqual(smaller[smaller.length - 1]);
+    expect(ringArea(larger) + ringArea(smaller)).toBeCloseTo(ringArea(SQUARE), -1);
+    expect(ringArea(larger) / ringArea(smaller)).toBeCloseTo(7 / 3, 2);
+  });
+
+  it('follows the corners of the line inside the outline', () => {
+    const [, smaller] = parts([p(39.99, -80.08), p(40.05, -80.05), p(40.11, -80.08)]);
+    expect(smaller).toContainEqual(p(40.05, -80.05));
+    expect(ringContains(smaller, p(40.05, -80.06))).toBe(true);
+    expect(ringContains(smaller, p(40.01, -80.06))).toBe(false);
+  });
+
+  it('cuts across one side of the outline, and across a corner', () => {
+    // In and out through the south side: a notch.
+    const [, notch] = parts([p(39.99, -80.06), p(40.05, -80.05), p(39.99, -80.04)]);
+    expect(ringContains(notch, p(40.01, -80.05))).toBe(true);
+    // Through the north-west corner and out through the south side.
+    const [, cut] = parts([p(40.1, -80.1), p(39.99, -80.09)]);
+    expect(ringArea(cut)).toBeGreaterThan(0);
+  });
+
+  it('takes a line whose ends lie on the outline, as snapping leaves them', () => {
+    const [larger, smaller] = parts([p(40, -80.05), p(40.1, -80.05)]);
+    expect(ringArea(larger)).toBeCloseTo(ringArea(smaller), -1);
+  });
+
+  it('refuses a line that does not go across, or goes across more than once', () => {
+    expect(splitOutline(SQUARE, [p(40.05, -80.05), p(40.11, -80.05)])).toEqual({
+      ok: false,
+      reason: 'not-across',
+    });
+    expect(splitOutline(SQUARE, [p(40.2, -80.2), p(40.2, -79.9)])).toEqual({
+      ok: false,
+      reason: 'not-across',
+    });
+    expect(
+      splitOutline(SQUARE, [
+        p(39.99, -80.08),
+        p(40.11, -80.08),
+        p(40.11, -80.02),
+        p(39.99, -80.02),
+      ]),
+    ).toEqual({ ok: false, reason: 'several-crossings' });
+  });
+
+  it('refuses a line that crosses itself inside the outline', () => {
+    expect(
+      splitOutline(SQUARE, [
+        p(39.99, -80.05),
+        p(40.06, -80.05),
+        p(40.04, -80.03),
+        p(40.04, -80.07),
+        p(40.11, -80.05),
+      ]),
+    ).toEqual({ ok: false, reason: 'crosses-itself' });
+  });
+});
diff --git a/src/domain/regions/split.ts b/src/domain/regions/split.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0e3d73b4d359e8403e3d02668eb534877d08857e
--- /dev/null
+++ b/src/domain/regions/split.ts
@@ -0,0 +1,107 @@
+import type { LatLon } from '../geo/lat-lon.js';
+import { tidyOutline } from '../geo/outline.js';
+import { ringContains } from '../geo/region-membership.js';
+import { ringArea } from './coverage.js';
+
+/**
+ * What came of splitting an outline along a line: its two parts, the larger first (it keeps the
+ * region; the other becomes a new one), or why there are none. `not-across`: the line does not
+ * go in through the outline and out again (it crosses once or never, or runs outside between
+ * its crossings); `several-crossings`: it crosses more than twice; `crosses-itself`: a part
+ * would cross itself (the line does); `too-many-corners`: a part would have more corners than
+ * an outline may.
+ */
+export type Split =
+  | { ok: true; parts: [LatLon[], LatLon[]] }
+  | {
+      ok: false;
+      reason: 'not-across' | 'several-crossings' | 'crosses-itself' | 'too-many-corners';
+    };
+
+/** Where the line crosses the outline: along the line, on which side of the outline, where. */
+interface Crossing {
+  /** The line's segment and how far along it: `j + t`. */
+  along: number;
+  /** The outline's side (from corner `side` to the next) and how far along it, `0 <= u < 1`. */
+  side: number;
+  u: number;
+  point: LatLon;
+}
+
+/** Where segment a-b meets segment c-d (flat coordinates): how far along each, or undefined. */
+function meet(a: LatLon, b: LatLon, c: LatLon, d: LatLon): { t: number; u: number } | undefined {
+  const rx = b.lon - a.lon;
+  const ry = b.lat - a.lat;
+  const sx = d.lon - c.lon;
+  const sy = d.lat - c.lat;
+  const denominator = rx * sy - ry * sx;
+  if (denominator === 0) return undefined;
+  const qx = c.lon - a.lon;
+  const qy = c.lat - a.lat;
+  const t = (qx * sy - qy * sx) / denominator;
+  const u = (qx * ry - qy * rx) / denominator;
+  return t >= 0 && t <= 1 && u >= 0 && u < 1 ? { t, u } : undefined;
+}
+
+/**
+ * Splits an outline (closed) along a line drawn across it (spec 4.2): the line must go in
+ * through the outline and out again, once; its ends may lie on the outline (where snapping puts
+ * them) or outside it. Each part is the line's stretch inside the outline and the outline's
+ * corners on one side of it, tidied (`tidyOutline`).
+ */
+export function splitOutline(ring: readonly LatLon[], line: readonly LatLon[]): Split {
+  const corners = ring.slice(0, -1);
+  const n = corners.length;
+  const crossings: Crossing[] = [];
+  for (let j = 0; j + 1 < line.length; j++) {
+    const a = line[j] as LatLon;
+    const b = line[j + 1] as LatLon;
+    for (let side = 0; side < n; side++) {
+      const met = meet(a, b, corners[side] as LatLon, corners[(side + 1) % n] as LatLon);
+      if (!met) continue;
+      const along = j + met.t;
+      // A crossing at a corner of the line is found on both of its segments.
+      if (crossings.some((crossing) => Math.abs(crossing.along - along) < 1e-12)) continue;
+      crossings.push({
+        along,
+        side,
+        u: met.u,
+        point: { lat: a.lat + (b.lat - a.lat) * met.t, lon: a.lon + (b.lon - a.lon) * met.t },
+      });
+    }
+  }
+  if (crossings.length > 2) return { ok: false, reason: 'several-crossings' };
+  crossings.sort((x, y) => x.along - y.along);
+  const [first, second] = crossings;
+  if (!first || !second) return { ok: false, reason: 'not-across' };
+  const middle = line.filter((_corner, k) => k > first.along && k < second.along);
+  // The line must run inside between its crossings, not out and back in.
+  const next = middle[0] ?? second.point;
+  const probe = { lat: (first.point.lat + next.lat) / 2, lon: (first.point.lon + next.lon) / 2 };
+  if (!ringContains(ring, probe)) return { ok: false, reason: 'not-across' };
+
+  /** The outline's corners after `from` up to `to`, going round the way the outline winds. */
+  const forward = (from: Crossing, to: Crossing): LatLon[] => {
+    const start = from.side + from.u;
+    let end = to.side + to.u;
+    if (end <= start) end += n;
+    const found: LatLon[] = [];
+    for (let k = from.side + 1; k <= end; k++) found.push(corners[k % n] as LatLon);
+    return found;
+  };
+  const one = [first.point, ...middle, second.point, ...forward(second, first), first.point];
+  const other = [second.point, ...[...middle].reverse(), first.point, ...forward(first, second)];
+  const tidied = [tidyOutline(one), tidyOutline(other)];
+  const parts: LatLon[][] = [];
+  for (const tidy of tidied) {
+    if (tidy.ok) {
+      parts.push(tidy.ring);
+      continue;
+    }
+    if (tidy.problem.kind === 'crosses-itself') return { ok: false, reason: 'crosses-itself' };
+    if (tidy.problem.kind === 'too-many') return { ok: false, reason: 'too-many-corners' };
+    return { ok: false, reason: 'not-across' };
+  }
+  const [a, b] = parts as [LatLon[], LatLon[]];
+  return { ok: true, parts: ringArea(a) >= ringArea(b) ? [a, b] : [b, a] };
+}
diff --git a/src/domain/regions/version.test.ts b/src/domain/regions/version.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a630ba46023f96211ed52d5392dca666f9a044ab
--- /dev/null
+++ b/src/domain/regions/version.test.ts
@@ -0,0 +1,70 @@
+import { createHash } from 'node:crypto';
+import { describe, expect, it } from 'vitest';
+import type { LatLon } from '../geo/lat-lon.js';
+import { base64url, regionVersion, sha256, versionText } from './version.js';
+
+const p = (lat: number, lon: number): LatLon => ({ lat, lon });
+const SQUARE = [p(40, -80.1), p(40.1, -80.1), p(40.1, -80), p(40, -80), p(40, -80.1)];
+
+describe('sha256', () => {
+  it('gives what node gives, for texts of every length around the blocks', () => {
+    for (const text of [
+      '',
+      'abc',
+      'a'.repeat(55),
+      'a'.repeat(56),
+      'a'.repeat(63),
+      'a'.repeat(64),
+      'a'.repeat(65),
+      'a'.repeat(1_000),
+      'Pokémon Gö — 東京 🏳️‍🌈',
+    ]) {
+      const ours = Buffer.from(sha256(text)).toString('hex');
+      expect(ours, text).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
+    }
+  });
+
+  it('writes bytes as base64url without padding, as node does', () => {
+    for (const length of [0, 1, 2, 3, 4, 31, 32]) {
+      const bytes = Uint8Array.from({ length }, (_unused, i) => (i * 37 + 251) % 256);
+      expect(base64url(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
+    }
+  });
+});
+
+describe('the version of a region', () => {
+  it('is 16 characters of base64url over the outline and the description', () => {
+    const version = regionVersion(SQUARE, null);
+    expect(version).toMatch(/^[A-Za-z0-9_-]{16}$/);
+    expect(version).toBe(
+      createHash('sha256').update(versionText(SQUARE, null)).digest('base64url').slice(0, 16),
+    );
+  });
+
+  it('changes with a corner moved by more than a rounding, and with the description', () => {
+    const before = regionVersion(SQUARE, null);
+    const moved = SQUARE.map((point, i) => (i === 1 ? p(40.100002, -80.1) : point));
+    expect(regionVersion(moved, null)).not.toBe(before);
+    expect(regionVersion(SQUARE, 'Town')).not.toBe(before);
+    expect(regionVersion(SQUARE, 'Town')).not.toBe(regionVersion(SQUARE, 'Towns'));
+  });
+
+  it('is the same for an outline read back at six decimals', () => {
+    const precise = SQUARE.map(({ lat, lon }) => p(lat + 1e-8, lon - 3e-8));
+    expect(regionVersion(precise, null)).toBe(regionVersion(SQUARE, null));
+    // Minus zero and plus zero are one place.
+    expect(versionText([p(-0, 0), p(1e-9, -1e-9)], null)).toBe(
+      versionText([p(0, 0), p(0, 0)], null),
+    );
+  });
+
+  it('is the same for an open and a closed ring, and for none and an empty description', () => {
+    expect(regionVersion(SQUARE.slice(0, -1), null)).toBe(regionVersion(SQUARE, null));
+    expect(regionVersion(SQUARE, '')).toBe(regionVersion(SQUARE, null));
+  });
+
+  it('has one for a region without an outline', () => {
+    expect(regionVersion(null, null)).toMatch(/^[A-Za-z0-9_-]{16}$/);
+    expect(regionVersion(null, null)).not.toBe(regionVersion(SQUARE, null));
+  });
+});
diff --git a/src/domain/regions/version.ts b/src/domain/regions/version.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cdeb6c13cce1226bdd30922a287c0294db1d63a4
--- /dev/null
+++ b/src/domain/regions/version.ts
@@ -0,0 +1,151 @@
+import type { LatLon } from '../geo/lat-lon.js';
+
+/**
+ * The version of a region (spec 4.6): what the region editor loaded a region as, so that a save
+ * can refuse to overwrite what another editor (or `/region import`) changed meanwhile. Pure, so
+ * that the server and the page compute it alike: SHA-256 is written out here, since the page
+ * has no synchronous hash and the domain imports nothing of node.
+ */
+
+/** The round constants of SHA-256 (FIPS 180-4, 4.2.2). */
+const K = Uint32Array.from([
+  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
+  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
+  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
+  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
+  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
+  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
+  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
+  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
+]);
+
+const rotate = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
+
+/** The SHA-256 of a text's UTF-8 bytes (FIPS 180-4). */
+export function sha256(text: string): Uint8Array {
+  const message = new TextEncoder().encode(text);
+  // The message, a 1 bit, zeros, and its length in bits as 64 bits: a multiple of 64 bytes.
+  const length = Math.ceil((message.length + 9) / 64) * 64;
+  const padded = new Uint8Array(length);
+  padded.set(message);
+  padded[message.length] = 0x80;
+  const view = new DataView(padded.buffer);
+  const bits = message.length * 8;
+  view.setUint32(length - 8, Math.floor(bits / 2 ** 32));
+  view.setUint32(length - 4, bits >>> 0);
+  const hash = Uint32Array.from([
+    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
+  ]);
+  const w = new Uint32Array(64);
+  for (let block = 0; block < length; block += 64) {
+    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
+    for (let i = 16; i < 64; i++) {
+      const a = w[i - 15] ?? 0;
+      const b = w[i - 2] ?? 0;
+      const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3);
+      const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
+      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
+    }
+    let [a, b, c, d, e, f, g, h] = hash as unknown as [
+      number,
+      number,
+      number,
+      number,
+      number,
+      number,
+      number,
+      number,
+    ];
+    for (let i = 0; i < 64; i++) {
+      const t1 =
+        (h +
+          (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) +
+          ((e & f) ^ (~e & g)) +
+          (K[i] ?? 0) +
+          (w[i] ?? 0)) >>>
+        0;
+      const t2 =
+        ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
+      h = g;
+      g = f;
+      f = e;
+      e = (d + t1) >>> 0;
+      d = c;
+      c = b;
+      b = a;
+      a = (t1 + t2) >>> 0;
+    }
+    const sums = [a, b, c, d, e, f, g, h];
+    for (let i = 0; i < 8; i++) hash[i] = ((hash[i] ?? 0) + (sums[i] ?? 0)) >>> 0;
+  }
+  const out = new Uint8Array(32);
+  const outView = new DataView(out.buffer);
+  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, hash[i] ?? 0);
+  return out;
+}
+
+const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
+
+/** Bytes as base64url, without padding (RFC 4648, 5). */
+export function base64url(bytes: Uint8Array): string {
+  let text = '';
+  for (let i = 0; i < bytes.length; i += 3) {
+    const a = bytes[i] ?? 0;
+    const b = bytes[i + 1];
+    const c = bytes[i + 2];
+    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
+    text += ALPHABET[(n >> 18) & 63] ?? '';
+    text += ALPHABET[(n >> 12) & 63] ?? '';
+    if (b !== undefined) text += ALPHABET[(n >> 6) & 63] ?? '';
+    if (c !== undefined) text += ALPHABET[n & 63] ?? '';
+  }
+  return text;
+}
+
+/** A coordinate at six decimals (about 10 cm), minus zero as zero. */
+export function roundSix(value: number): number {
+  const rounded = Math.round(value * 1e6) / 1e6;
+  return rounded === 0 ? 0 : rounded;
+}
+
+/** A coordinate as the version reads it: `roundSix`, written with its six decimals. */
+const sixDecimals = (value: number): string => roundSix(value).toFixed(6);
+
+/**
+ * An outline as the region editor keeps and saves it, wherever it comes from (drawn, split, of a
+ * file, sent to the server): each corner at six decimals (`roundSix`, as the editor's data gives
+ * them), and a corner the rounding made equal to the one before it dropped. So the page and the
+ * server see the same corners, and an outline saved has the version it was drawn with.
+ */
+export function normalisedOutline(outline: readonly LatLon[]): LatLon[] {
+  const corners: LatLon[] = [];
+  for (const { lat, lon } of outline) {
+    const corner = { lat: roundSix(lat), lon: roundSix(lon) };
+    const last = corners[corners.length - 1];
+    if (!last || last.lat !== corner.lat || last.lon !== corner.lon) corners.push(corner);
+  }
+  return corners;
+}
+
+/**
+ * What the version of a region is the hash of: its corners at six decimals (as the editor's data
+ * gives them), the ring closed, then its description (none and empty alike). An outline read
+ * back at six decimals has the version of the one it was read from.
+ */
+export function versionText(outline: readonly LatLon[] | null, description: string | null): string {
+  const corners = (outline ?? []).map(({ lat, lon }) => `${sixDecimals(lat)},${sixDecimals(lon)}`);
+  const [first] = corners;
+  if (first !== undefined && corners[corners.length - 1] !== first) corners.push(first);
+  return `${corners.join(';')}|${description ?? ''}`;
+}
+
+/**
+ * The version of a region: base64url of the SHA-256 of `versionText`, cut to 16 characters
+ * (96 bits: two versions of one region never meet by chance).
+ */
+export function regionVersion(
+  outline: readonly LatLon[] | null,
+  description: string | null,
+): string {
+  return base64url(sha256(versionText(outline, description))).slice(0, 16);
+}
diff --git a/src/domain/web/editor-data.ts b/src/domain/web/editor-data.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1d0668f924aef5a59138a13bb9f824f4034d4cae
--- /dev/null
+++ b/src/domain/web/editor-data.ts
@@ -0,0 +1,112 @@
+/**
+ * What the region editor's addresses answer and take (plan 8M-2): `GET /s/<guild>/api/regions/
+ * edit` (`EditorData`) and the bodies of `POST …/api/regions/preview` and `…/save`
+ * (`SaveRequest`). Types alone, with no import: the page's bundle takes them without the
+ * server's code.
+ */
+
+/** A place: `[lat, lon]`, six decimals (about 10 cm). */
+export type Point = [number, number];
+
+/** What a kept Wayspot is in the game. */
+export type EditorWayspotKind = 'gym' | 'stop' | 'powerspot';
+
+/** A region of the server as the editor loads it. */
+export interface EditorRegion {
+  id: number;
+  channelId: string;
+  /** Its channel's name as the bot sees it; `Region <id>` when the channel is gone. */
+  name: string;
+  /** The category its channel is in now (what `/region export` writes as the description). */
+  category: string | null;
+  /** The region's own description (a legacy column; part of the version). */
+  description: string | null;
+  /** Closed; null for a region that has no outline yet. */
+  outline: Point[] | null;
+  /** `regionVersion` of its outline and description, as it is stored now. */
+  version: string;
+}
+
+export interface EditorData {
+  /** The server: its id and name (the name of an exported file). */
+  guild: { id: string; name: string };
+  /** Discord could not say who is asking: the editor shows, but saves nothing. */
+  readOnly: boolean;
+  /** Whether the member may create channels (Manage Channels): new names need it. */
+  mayManageChannels: boolean;
+  /** The server's regions, by id. */
+  regions: EditorRegion[];
+  /** Other servers' regions near these (grey, not selectable): their outlines alone. */
+  others: Array<{ id: number; outline: Point[] }>;
+  /**
+   * The gyms in the server's regions, and those in no region of any server near them: by id,
+   * as `[id, lat, lon, name]`.
+   */
+  gyms: Array<[number, number, number, string]>;
+  /**
+   * The kept Wayspots near the server's regions (their box grown by 2 km), as
+   * `[kind, lat, lon, title]`: no addresses, no pictures.
+   */
+  wayspots: Array<[EditorWayspotKind, number, number, string]>;
+  /** The server's text channels that are no region yet: what a new region may take. */
+  channels: Array<{ id: string; name: string }>;
+}
+
+/** A changed outline of a region, with the version it was changed from. */
+export interface SavedChange {
+  regionId: number;
+  outline: Point[];
+  version: string;
+}
+
+/** A new region: a channel that is no region yet (by id), or a new channel (by its name). */
+export interface SavedAddition {
+  channel: { id: string } | { name: string };
+  /** For a new channel: the category it is created in (as a KML description says it). */
+  description: string | null;
+  outline: Point[];
+}
+
+/** A region to remove, what becomes of its forum, and the version it was loaded as. */
+export interface SavedRemoval {
+  regionId: number;
+  forum: 'keep' | 'delete';
+  version: string;
+}
+
+/** What the page sends to preview or save: the staged changes, by kind. */
+export interface SaveRequest {
+  changes: SavedChange[];
+  additions: SavedAddition[];
+  removals: SavedRemoval[];
+}
+
+/** A list of a preview or an outcome: its title and its lines (plain text). */
+export interface WordedList {
+  title: string;
+  items: string[];
+}
+
+/** A preview or an outcome as the page shows it: sentences, then lists; plain text. */
+export interface Worded {
+  lines: string[];
+  lists: WordedList[];
+}
+
+/** A region the save refused because it changed since the page loaded it (spec 4.6). */
+export interface SaveConflict {
+  regionId: number;
+  /** The region as it is now; null when it is gone. */
+  theirs: EditorRegion | null;
+}
+
+/**
+ * What a preview or a save answers. `preview`: what would be done (and whether anything
+ * would); `saved`: what was done; `refused`: why nothing is done (lines); `conflicts`: regions
+ * changed meanwhile (409).
+ */
+export type SaveAnswer =
+  | { kind: 'preview'; worded: Worded; changes: boolean }
+  | { kind: 'saved'; worded: Worded }
+  | { kind: 'refused'; lines: string[] }
+  | { kind: 'conflicts'; conflicts: SaveConflict[] };
````

### Task 2: Region editor: who is staff on the web, the editor's data

Prototype commit: `30d08313bb940c48e4aed8bb1626bd9f6f3ba4d4`

`regionStaffAnswer` (the guard of `/region`, `isBotManagement`, plus Manage Server, from a fresh member every request; read-only when Discord cannot be reached). `GET /s/<guild>/api/regions/edit` (`editorView`, cached per server by the gym, region and Wayspot generations and the channels; gyms and Wayspots as tuples within 2 km of the server's outlines; the part that depends on who asks put in front per request); 401, 403, 503 in words; 20 a minute per address.

**Files:**

```
 src/app.ts                         |  15 +++++++++
 src/discord/web-staff.ts           |  45 ++++++++++++++++++++++++++
 src/domain/web/editor-view.test.ts | 109 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/web/editor-view.ts      | 135 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/answers.ts                 |   2 ++
 src/web/editor-cache.ts            |  89 +++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/editor-routes.ts           |  80 ++++++++++++++++++++++++++++++++++++++++++++++
 src/web/editor.test.ts             | 129 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/guild-routes.ts            |   4 +++
 src/web/region-staff.test.ts       |  48 ++++++++++++++++++++++++++++
 src/web/region-staff.ts            |  60 ++++++++++++++++++++++++++++++++++
 src/web/server.ts                  |   3 ++
 test/support/web.ts                |  85 ++++++++++++++++++++++++++++++++++++++++++++++++
 13 files changed, 804 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/editor-view.test.ts src/web/editor.test.ts src/web/region-staff.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app.ts src/discord/web-staff.ts src/domain/web/editor-view.test.ts src/domain/web/editor-view.ts src/web/answers.ts src/web/editor-cache.ts src/web/editor-routes.ts src/web/editor.test.ts src/web/guild-routes.ts src/web/region-staff.test.ts src/web/region-staff.ts src/web/server.ts test/support/web.ts` and `npx eslint src/app.ts src/discord/web-staff.ts src/domain/web/editor-view.test.ts src/domain/web/editor-view.ts src/web/answers.ts src/web/editor-cache.ts src/web/editor-routes.ts src/web/editor.test.ts src/web/guild-routes.ts src/web/region-staff.test.ts src/web/region-staff.ts src/web/server.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 30d08313bb940c48e4aed8bb1626bd9f6f3ba4d4 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m2-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Region editor: who is staff on the web, the editor's data`, the paragraph above as the body and the trailer, staging exactly
  `src/app.ts src/discord/web-staff.ts src/domain/web/editor-view.test.ts src/domain/web/editor-view.ts src/web/answers.ts src/web/editor-cache.ts src/web/editor-routes.ts src/web/editor.test.ts src/web/guild-routes.ts src/web/region-staff.test.ts src/web/region-staff.ts src/web/server.ts test/support/web.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index ae8553816b2373ea55f23eab8ffa1896fa793fd2..fc7ca25dd51f3df59733b7a87e3736fe68a67b5b 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -38,6 +38,7 @@ import { enabledCommands } from './discord/command.js';
 import { DiscordDmGateway } from './discord/dm-gateway.js';
 import { attachGatewayHandlers } from './discord/gateway-events.js';
 import { DiscordMemberDirectory } from './discord/member-directory.js';
+import { DiscordRegionStaff } from './discord/web-staff.js';
 import { DiscordRoleGateway } from './discord/role-gateway.js';
 import { postedMessage } from './discord/screenshot-message.js';
 import { DiscordApplicationEmoji } from './discord/application-emoji.js';
@@ -105,6 +106,7 @@ import { createShutdown } from './shutdown.js';
 import { pictureOrigins } from './web/headers.js';
 import { buildWebServer } from './web/server.js';
 import { DiscordOAuth } from './web/discord-oauth.js';
+import { EditorCache } from './web/editor-cache.js';
 import { GeoCache } from './web/geo-cache.js';
 import { readAssets } from './web/page.js';
 import { LoginLinks } from './web/login-links.js';
@@ -792,6 +794,19 @@ export async function startApp(
       loginLinks,
       geo: new GeoCache({ guilds, regions, gyms, channels: partyGateway }),
       assets: webAssets,
+      editor: {
+        staff: new DiscordRegionStaff({ client, guilds, ownerId: config.env.OWNER_ID, log }),
+        view: new EditorCache({
+          guilds,
+          regions,
+          gyms,
+          wayspots,
+          servers: {
+            serverChannels: (guildId) => partyGateway.serverChannels(guildId),
+            serverName: (guildId) => client.guilds.cache.get(guildId)?.name,
+          },
+        }),
+      },
       now: () => Date.now(),
       log,
     });
diff --git a/src/discord/web-staff.ts b/src/discord/web-staff.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1c05eed0a88b9ee35b5b2b94c66fbc73c0b2b902
--- /dev/null
+++ b/src/discord/web-staff.ts
@@ -0,0 +1,45 @@
+import { PermissionFlagsBits, type Client } from 'discord.js';
+import type { Logger } from '../log.js';
+import {
+  regionStaffAnswer,
+  type RegionStaffSource,
+  type StaffAnswer,
+} from '../web/region-staff.js';
+import { fetchGuildMember } from './member-directory.js';
+
+/**
+ * Who may edit a server's regions on the web pages, asked of Discord (plan 8M-2): the member is
+ * fetched fresh every time (`fetchGuildMember(…, true)`: roles given or taken a minute ago
+ * count), and `regionStaffAnswer` decides. A failure of Discord is `unreachable`: the pages are
+ * then read-only.
+ */
+export class DiscordRegionStaff implements RegionStaffSource {
+  constructor(
+    private readonly options: {
+      client: Client;
+      guilds: { idFor(snowflake: string): Promise<number | undefined> };
+      ownerId: string;
+      log: Logger;
+    },
+  ) {}
+
+  async check(guildId: string, userId: string): Promise<StaffAnswer> {
+    const { client, guilds, ownerId, log } = this.options;
+    const guild = client.guilds.cache.get(guildId);
+    if (!guild) return { kind: 'not-member' };
+    let member;
+    try {
+      member = await fetchGuildMember(guild, userId, true);
+    } catch (err) {
+      log.warn({ err, guild: guildId, user: userId }, 'could not fetch a member for the web pages');
+      return { kind: 'unreachable' };
+    }
+    if (!member) return { kind: 'not-member' };
+    const facts = {
+      roleNames: member.roles.cache.map((role) => role.name),
+      manageGuild: member.permissions.has(PermissionFlagsBits.ManageGuild),
+      manageChannels: member.permissions.has(PermissionFlagsBits.ManageChannels),
+    };
+    return regionStaffAnswer(facts, userId, ownerId, guildId, await guilds.idFor(guildId));
+  }
+}
diff --git a/src/domain/web/editor-view.test.ts b/src/domain/web/editor-view.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f24168057ed5d5619b11db8e3b8b2992a7f740ea
--- /dev/null
+++ b/src/domain/web/editor-view.test.ts
@@ -0,0 +1,109 @@
+import { describe, expect, it } from 'vitest';
+import type { LatLon } from '../geo/lat-lon.js';
+import { ringContains } from '../geo/region-membership.js';
+import type { ServerChannel } from '../regions/region-import.js';
+import { regionVersion } from '../regions/version.js';
+import { editorView, type EditorInput } from './editor-view.js';
+
+const p = (lat: number, lon: number): LatLon => ({ lat, lon });
+function square(south: number, west: number, north: number, east: number): LatLon[] {
+  return [p(south, west), p(north, west), p(north, east), p(south, east), p(south, west)];
+}
+
+const WEST = square(40, -80.1, 40.1, -80);
+const EAST = square(40, -80, 40.1, -79.9);
+/** Another server's region a kilometre north of east, and one far away. */
+const NEAR = square(40.11, -80, 40.2, -79.9);
+const FAR = square(41, -80.1, 41.1, -80);
+
+const CHANNELS: ServerChannel[] = [
+  { id: '100000000000000041', name: 'Town', kind: 'category', categoryId: null },
+  { id: '100000000000000001', name: 'west', kind: 'text', categoryId: '100000000000000041' },
+  { id: '100000000000000002', name: 'east', kind: 'text', categoryId: null },
+  { id: '100000000000000005', name: 'south', kind: 'text', categoryId: null },
+  { id: '100000000000000006', name: 'forum', kind: 'forum', categoryId: null },
+  { id: '100000000000000008', name: 'north', kind: 'text', categoryId: null },
+];
+
+function input(more: Partial<EditorInput> = {}): EditorInput {
+  const regions = [
+    { id: 1, guildId: 1, channelId: '100000000000000001', description: null, bounds: WEST },
+    { id: 2, guildId: 1, channelId: '100000000000000002', description: 'Old', bounds: EAST },
+    { id: 3, guildId: 1, channelId: '100000000000000009', description: null, bounds: null },
+    { id: 4, guildId: 2, channelId: '100000000000000008', description: null, bounds: NEAR },
+    { id: 5, guildId: 2, channelId: '100000000000000007', description: null, bounds: FAR },
+  ];
+  const gyms = [
+    { id: 1, name: 'Library', lat: 40.05, lon: -80.05 },
+    { id: 2, name: 'Bridge', lat: 40.0500001234, lon: -79.95 },
+    // In no region, half a kilometre west of west.
+    { id: 3, name: 'Trailhead', lat: 40.05, lon: -80.105 },
+    // In no region, far away.
+    { id: 4, name: 'Lakeview', lat: 40.5, lon: -80.05 },
+    // Only in the other server's region near east.
+    { id: 5, name: 'Mill', lat: 40.15, lon: -79.95 },
+  ];
+  return {
+    guildRow: 1,
+    regions,
+    channels: CHANNELS,
+    gyms,
+    regionsOf: (gymId) => {
+      const gym = gyms.find((one) => one.id === gymId);
+      return regions.flatMap((region) =>
+        gym && region.bounds && ringContains(region.bounds, gym) ? [region.channelId] : [],
+      );
+    },
+    wayspots: [
+      { kind: 'stop', lat: 40.01, lon: -80.01, title: 'Mural' },
+      { kind: 'powerspot', lat: 40.115, lon: -80.05, title: 'Kiosk' },
+      { kind: 'gym', lat: 40.9, lon: -80.05, title: 'Far gym' },
+    ],
+    ...more,
+  };
+}
+
+describe('what the region editor loads', () => {
+  it("is the server's regions with their channels, categories and versions", () => {
+    const view = editorView(input());
+    expect(view.regions.map((region) => [region.id, region.name, region.category])).toEqual([
+      [1, 'west', 'Town'],
+      [2, 'east', null],
+      [3, 'Region 3', null],
+    ]);
+    expect(view.regions[0]?.outline).toEqual(WEST.map(({ lat, lon }) => [lat, lon]));
+    expect(view.regions[1]?.version).toBe(regionVersion(EAST, 'Old'));
+    expect(view.regions[2]).toMatchObject({ outline: null, version: regionVersion(null, null) });
+  });
+
+  it("shows other servers' regions near its own by their outlines alone", () => {
+    const view = editorView(input());
+    expect(view.others).toEqual([{ id: 4, outline: NEAR.map(({ lat, lon }) => [lat, lon]) }]);
+  });
+
+  it('has the gyms in its regions and those in no region near them, at six decimals', () => {
+    const view = editorView(input());
+    expect(view.gyms).toEqual([
+      [1, 40.05, -80.05, 'Library'],
+      [2, 40.05, -79.95, 'Bridge'],
+      [3, 40.05, -80.105, 'Trailhead'],
+    ]);
+  });
+
+  it('has the Wayspots within two kilometres of its regions', () => {
+    expect(editorView(input()).wayspots).toEqual([
+      ['stop', 40.01, -80.01, 'Mural'],
+      ['powerspot', 40.115, -80.05, 'Kiosk'],
+    ]);
+  });
+
+  it('offers the text channels that are no region of any server', () => {
+    expect(editorView(input()).channels).toEqual([{ id: '100000000000000005', name: 'south' }]);
+  });
+
+  it('is empty around a server without outlines', () => {
+    const view = editorView(input({ guildRow: 9 }));
+    expect(view).toMatchObject({ regions: [], others: [], gyms: [], wayspots: [] });
+    expect(editorView(input({ guildRow: undefined })).regions).toEqual([]);
+  });
+});
diff --git a/src/domain/web/editor-view.ts b/src/domain/web/editor-view.ts
new file mode 100644
index 0000000000000000000000000000000000000000..736b959544fff8e41c85453ead05f2bb0a185907
--- /dev/null
+++ b/src/domain/web/editor-view.ts
@@ -0,0 +1,135 @@
+import type { LatLon } from '../geo/lat-lon.js';
+import { boxOf, grownBox, inBox, type Box } from '../geo/region-membership.js';
+import type { ServerChannel } from '../regions/region-import.js';
+import { regionVersion } from '../regions/version.js';
+import type { EditorData, EditorWayspotKind, Point } from './editor-data.js';
+
+/**
+ * What the region editor loads (`GET /s/<guild>/api/regions/edit`, plan 8M-2), but for who is
+ * asking: the server's regions with their versions, other servers' regions near them, the gyms
+ * and Wayspots around them, and the text channels a new region may take. Pure: the caller gives
+ * every region, the server's channels as the bot sees them, every gym with where it lies, and
+ * the kept Wayspots.
+ */
+
+/** How far around the server's regions the editor shows what lies outside them. */
+export const REACH_METRES = 2_000;
+
+export interface EditorInput {
+  /** The row of the server (`Guild.id`); undefined while it has none. */
+  guildRow: number | undefined;
+  /** Every region, of any server. */
+  regions: readonly {
+    id: number;
+    guildId: number | null;
+    channelId: string;
+    description: string | null;
+    bounds: readonly LatLon[] | null;
+  }[];
+  /** The server's channels; undefined when the bot does not know the server. */
+  channels: readonly ServerChannel[] | undefined;
+  /** Every gym. */
+  gyms: readonly { id: number; name: string; lat: number; lon: number }[];
+  /** The channels of the regions (of any server) a gym lies in. */
+  regionsOf(gymId: number): readonly string[];
+  /** Every kept Wayspot. */
+  wayspots: readonly { kind: EditorWayspotKind; lat: number; lon: number; title: string }[];
+}
+
+/** What the editor loads but for who is asking. */
+export type EditorView = Omit<EditorData, 'guild' | 'readOnly' | 'mayManageChannels'>;
+
+const six = (value: number): number => {
+  const rounded = Math.round(value * 1e6) / 1e6;
+  return rounded === 0 ? 0 : rounded;
+};
+const points = (outline: readonly LatLon[]): Point[] =>
+  outline.map(({ lat, lon }) => [six(lat), six(lon)]);
+
+/** The smallest box that holds these boxes. */
+function joined(boxes: readonly Box[]): Box | undefined {
+  if (boxes.length === 0) return undefined;
+  return {
+    south: Math.min(...boxes.map((box) => box.south)),
+    north: Math.max(...boxes.map((box) => box.north)),
+    west: Math.min(...boxes.map((box) => box.west)),
+    east: Math.max(...boxes.map((box) => box.east)),
+  };
+}
+
+const meet = (a: Box, b: Box): boolean =>
+  a.south <= b.north && b.south <= a.north && a.west <= b.east && b.west <= a.east;
+
+/**
+ * The editor's view of a server. Its regions by id, named by their channels as the bot sees
+ * them (`Region <id>` when the channel is gone), with the category their channel is in and
+ * their version. Around them, the box of their outlines grown by `REACH_METRES` (nothing around
+ * a server without outlines): other servers' regions whose boxes meet it, by their outlines
+ * alone; the gyms in no region of any server and the kept Wayspots inside it. The gyms in its
+ * regions wherever they are. The text channels of the server that are no region of any server.
+ * Places at six decimals.
+ */
+export function editorView(input: EditorInput): EditorView {
+  const { guildRow } = input;
+  const channels = input.channels ?? [];
+  const byId = new Map(channels.map((channel) => [channel.id, channel]));
+  const own = input.regions
+    .filter((region) => guildRow !== undefined && region.guildId === guildRow)
+    .sort((a, b) => a.id - b.id);
+  const regions = own.map((region) => {
+    const channel = byId.get(region.channelId);
+    const category = channel?.categoryId == null ? undefined : byId.get(channel.categoryId);
+    return {
+      id: region.id,
+      channelId: region.channelId,
+      name: channel?.name ?? `Region ${region.id}`,
+      category: category?.name ?? null,
+      description: region.description,
+      outline: region.bounds === null ? null : points(region.bounds),
+      version: regionVersion(region.bounds, region.description),
+    };
+  });
+  const box = joined(own.flatMap((region) => (region.bounds ? [boxOf(region.bounds)] : [])));
+  const reach = box && grownBox(box, REACH_METRES);
+  const ownChannels = new Set(own.map((region) => region.channelId));
+  const others = reach
+    ? input.regions
+        .filter(
+          (region): region is typeof region & { bounds: readonly LatLon[] } =>
+            !ownChannels.has(region.channelId) &&
+            (guildRow === undefined || region.guildId !== guildRow) &&
+            region.bounds !== null &&
+            meet(reach, boxOf(region.bounds)),
+        )
+        .sort((a, b) => a.id - b.id)
+        .map((region) => ({ id: region.id, outline: points(region.bounds) }))
+    : [];
+  const gyms = input.gyms
+    .filter((gym) => {
+      const inside = input.regionsOf(gym.id);
+      if (inside.some((channelId) => ownChannels.has(channelId))) return true;
+      return inside.length === 0 && reach !== undefined && inBox(reach, gym);
+    })
+    .sort((a, b) => a.id - b.id)
+    .map((gym): [number, number, number, string] => [gym.id, six(gym.lat), six(gym.lon), gym.name]);
+  const wayspots = reach
+    ? input.wayspots
+        .filter((wayspot) => inBox(reach, wayspot))
+        .map((wayspot): [EditorWayspotKind, number, number, string] => [
+          wayspot.kind,
+          six(wayspot.lat),
+          six(wayspot.lon),
+          wayspot.title,
+        ])
+    : [];
+  const regionChannels = new Set(input.regions.map((region) => region.channelId));
+  return {
+    regions,
+    others,
+    gyms,
+    wayspots,
+    channels: channels
+      .filter((channel) => channel.kind === 'text' && !regionChannels.has(channel.id))
+      .map((channel) => ({ id: channel.id, name: channel.name })),
+  };
+}
diff --git a/src/web/answers.ts b/src/web/answers.ts
index 42ffa9c2b4746b886024d5486fecafd5353624e8..7f5a934b1dd9a945544cdc147b3d6b37c8e36ef9 100644
--- a/src/web/answers.ts
+++ b/src/web/answers.ts
@@ -3,11 +3,13 @@ import type { FastifyReply, FastifyRequest } from 'fastify';
 /** What an answer that failed says, by status: a few words, never what went wrong. */
 const FAILURE_WORDS: Readonly<Record<number, string>> = {
   400: 'Bad request.',
+  401: 'Log in first.',
   403: 'Not allowed.',
   404: 'Not found.',
   413: 'Too large.',
   415: 'Unsupported content.',
   429: 'Too many requests. Try again in a minute.',
+  503: 'Not available just now. Try again in a moment.',
 };
 const FAILED = 'Something went wrong.';
 
diff --git a/src/web/editor-cache.ts b/src/web/editor-cache.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f109475eef4dbd6df12519615521a9f1aabf5770
--- /dev/null
+++ b/src/web/editor-cache.ts
@@ -0,0 +1,89 @@
+import { createHash } from 'node:crypto';
+import { BoundedMap } from '../bounded-map.js';
+import type { Gym } from '../db/repositories/gym-repository.js';
+import type { Region } from '../db/repositories/region-repository.js';
+import type { ServerChannel } from '../domain/regions/region-import.js';
+import type { Wayspot } from '../domain/wayspots/kept.js';
+import { editorView } from '../domain/web/editor-view.js';
+import type { SentView } from './geo-cache.js';
+
+/** How many servers' views are kept. */
+const SERVERS = 20;
+
+/** Where the editor's view of a server is built from. */
+export interface EditorSources {
+  /** The row of a server (`Guild.id`). */
+  guilds: { idFor(snowflake: string): Promise<number | undefined> };
+  /** The regions; `generation` changes with every load. */
+  regions: { all(): readonly Region[]; readonly generation: number };
+  /** The gyms; `generation` changes with every change. */
+  gyms: { all(): Gym[]; regionsOf(gymId: number): string[]; readonly generation: number };
+  /** The kept Wayspots; `generation` changes with every load and forget. */
+  wayspots: { all(): Wayspot[]; readonly generation: number };
+  /** The server's channels and its name as the bot sees them. */
+  servers: {
+    serverChannels(guildId: string): ServerChannel[] | undefined;
+    serverName(guildId: string): string | undefined;
+  };
+}
+
+/** Who is asking, as far as the view tells it. */
+export interface EditorViewer {
+  /** Discord could not say who is asking: the page saves nothing, and is offered no channel. */
+  readOnly: boolean;
+  mayManageChannels: boolean;
+}
+
+const hash = (text: string): string =>
+  createHash('sha256').update(text).digest('base64url').slice(0, 27);
+
+/**
+ * The region editor's view of each server (`editorView`, plan 8M-2), built once and kept until
+ * the gyms, the regions, the Wayspots or the server's channels change: the regions, gyms and
+ * Wayspots are megabytes for a city. What depends on who asks (read-only, may create channels,
+ * the channels offered) is put in front of it per request; the ETag is of both.
+ */
+export class EditorCache {
+  private readonly views = new BoundedMap<
+    string,
+    { key: string; json: string; channels: string; etag: string }
+  >(SERVERS);
+
+  constructor(private readonly sources: EditorSources) {}
+
+  async view(guildId: string, viewer: EditorViewer): Promise<SentView> {
+    const { guilds, regions, gyms, wayspots, servers } = this.sources;
+    const row = await guilds.idFor(guildId);
+    const channels = servers.serverChannels(guildId);
+    const key = JSON.stringify([
+      gyms.generation,
+      regions.generation,
+      wayspots.generation,
+      row,
+      channels ?? null,
+    ]);
+    let kept = this.views.get(guildId);
+    if (kept?.key !== key) {
+      const view = editorView({
+        guildRow: row,
+        regions: regions.all(),
+        channels,
+        gyms: gyms.all(),
+        regionsOf: (id) => gyms.regionsOf(id),
+        wayspots: wayspots.all(),
+      });
+      const { channels: offered, ...rest } = view;
+      const json = JSON.stringify(rest);
+      kept = { key, json, channels: JSON.stringify(offered), etag: hash(json) };
+      this.views.set(guildId, kept);
+    }
+    const front = JSON.stringify({
+      guild: { id: guildId, name: servers.serverName(guildId) ?? guildId },
+      readOnly: viewer.readOnly,
+      mayManageChannels: !viewer.readOnly && viewer.mayManageChannels,
+    });
+    const offered = viewer.readOnly ? '[]' : kept.channels;
+    const body = `${front.slice(0, -1)},"channels":${offered},${kept.json.slice(1)}`;
+    return { body, etag: `"${hash(`${kept.etag}${front}${offered}`)}"` };
+  }
+}
diff --git a/src/web/editor-routes.ts b/src/web/editor-routes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..709e8bea62d78378cdc7bffc942ff65415b03aa0
--- /dev/null
+++ b/src/web/editor-routes.ts
@@ -0,0 +1,80 @@
+import type { FastifyInstance, FastifyReply } from 'fastify';
+import { sendFailure } from './answers.js';
+import type { EditorCache } from './editor-cache.js';
+import { etagMatches } from './geo-cache.js';
+import type { GuildRequest } from './guild-routes.js';
+import { limitedPerAddress, RateLimiter } from './rate-limit.js';
+import type { RegionStaffSource, StaffAnswer } from './region-staff.js';
+import type { WebDeps } from './server.js';
+
+/** The requests for the editor's data one address may make in a minute: each asks Discord. */
+const EDIT_DATA_PER_MINUTE = 20;
+
+/** What the region editor's addresses need (plan 8M-2). */
+export interface EditorDeps {
+  /** Who may edit a server's regions, asked of Discord per request. */
+  staff: RegionStaffSource;
+  /** The editor's view of each server. */
+  view: EditorCache;
+}
+
+/**
+ * Who asks for an address of the editor: nobody logged in, or what Discord says of them now
+ * (`RegionStaffSource`, fresh each time; the session says only who they are).
+ */
+export async function editorViewer(
+  request: GuildRequest,
+  reply: FastifyReply,
+  deps: WebDeps,
+): Promise<{ kind: 'logged-out' } | (StaffAnswer & { userId: string })> {
+  const session = await deps.sessions.of(request, reply);
+  if (!session) return { kind: 'logged-out' };
+  try {
+    const answer = await deps.editor.staff.check(request.params.guild, session.userId);
+    return { ...answer, userId: session.userId };
+  } catch (err) {
+    deps.log.warn(
+      { err, guild: request.params.guild, user: session.userId },
+      'could not ask Discord who edits regions on the web pages',
+    );
+    return { kind: 'unreachable', userId: session.userId };
+  }
+}
+
+/**
+ * The region editor's addresses of a server (`/s/<guild>/…`, plan 8M-2). `GET api/regions/edit`
+ * is the editor's data for the server's staff (`editorView`), with an ETag: 401 without a
+ * session, 403 for somebody who is not staff of the server (or no member), 503 while the server
+ * has no row; when Discord cannot be asked, the view read-only, without the channels a new
+ * region could take.
+ */
+export function editorRoutes(scope: FastifyInstance, deps: WebDeps): void {
+  const dataLimiter = new RateLimiter({ uses: EDIT_DATA_PER_MINUTE, perMs: 60_000 });
+  scope.get(
+    '/api/regions/edit',
+    { onRequest: limitedPerAddress(dataLimiter, { now: deps.now }) },
+    async (request: GuildRequest, reply) => {
+      void reply.header('cache-control', 'private, no-cache');
+      const viewer = await editorViewer(request, reply, deps);
+      switch (viewer.kind) {
+        case 'logged-out':
+          return sendFailure(request, reply, 401);
+        case 'not-member':
+        case 'not-staff':
+          return sendFailure(request, reply, 403);
+        case 'unknown-server':
+          return sendFailure(request, reply, 503);
+        case 'unreachable':
+        case 'staff':
+          break;
+      }
+      const view = await deps.editor.view.view(request.params.guild, {
+        readOnly: viewer.kind === 'unreachable',
+        mayManageChannels: viewer.kind === 'staff' && viewer.staff.mayManageChannels,
+      });
+      void reply.header('etag', view.etag);
+      if (etagMatches(request.headers['if-none-match'], view.etag)) return reply.code(304).send();
+      return reply.type('application/json; charset=utf-8').send(view.body);
+    },
+  );
+}
diff --git a/src/web/editor.test.ts b/src/web/editor.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f0ff8d0778298aa1690174f7ee768d302ab66faa
--- /dev/null
+++ b/src/web/editor.test.ts
@@ -0,0 +1,129 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { keptRow } from '../../test/support/wayspot-cases.js';
+import {
+  editorSourcesWith,
+  FakeRegionStaff,
+  SOUTH_TEXT_CHANNEL,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import type { EditorData } from '../domain/web/editor-data.js';
+
+const DATA = `/s/${FAKE_GUILD_ID}/api/regions/edit`;
+const STAFF = '700000000000000001';
+const MEMBER = '700000000000000002';
+
+describe("the region editor's data", () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  async function made(staff = new FakeRegionStaff().asStaff(STAFF)) {
+    const editor = await editorSourcesWith([
+      // A stop in west, and one a kilometre south of it, outside every region.
+      keptRow(1, { lat: 40.05, lon: -80.04 }),
+      keptRow(2, { lat: 40.0 - 0.009, lon: -80.05, kind: 'powerspot' }),
+      // Far away.
+      keptRow(3, { lat: 41, lon: -80.05 }),
+    ]);
+    web = webServerWith({ staff, editor });
+    return { web, staff, editor };
+  }
+
+  it('is for those logged in', async () => {
+    const { web } = await made();
+    const answer = await web.app.inject({ url: DATA });
+    expect(answer.statusCode).toBe(401);
+    expect(answer.json()).toEqual({ error: 'Log in first.' });
+  });
+
+  it('is for staff of the server alone, asked of Discord at every request', async () => {
+    const { web, staff } = await made();
+    const member = await web.loggedIn(MEMBER, 'Misty');
+    const refused = await web.app.inject({ url: DATA, headers: { cookie: member } });
+    expect(refused.statusCode).toBe(403);
+    expect(refused.json()).toEqual({ error: 'Not allowed.' });
+    staff.answer(MEMBER, { kind: 'not-staff' });
+    expect((await web.app.inject({ url: DATA, headers: { cookie: member } })).statusCode).toBe(403);
+    const cookie = await web.loggedIn(STAFF, 'Brock');
+    expect((await web.app.inject({ url: DATA, headers: { cookie } })).statusCode).toBe(200);
+    expect((await web.app.inject({ url: DATA, headers: { cookie } })).statusCode).toBe(200);
+    expect(staff.asked).toEqual([
+      `${FAKE_GUILD_ID}:${MEMBER}`,
+      `${FAKE_GUILD_ID}:${MEMBER}`,
+      `${FAKE_GUILD_ID}:${STAFF}`,
+      `${FAKE_GUILD_ID}:${STAFF}`,
+    ]);
+  });
+
+  it('gives the regions, gyms, Wayspots near them and the channels a new region may take', async () => {
+    const { web } = await made();
+    const cookie = await web.loggedIn(STAFF, 'Brock');
+    const answer = await web.app.inject({ url: DATA, headers: { cookie } });
+    expect(answer.headers['content-type']).toMatch(/^application\/json/);
+    expect(answer.headers['cache-control']).toBe('private, no-cache');
+    const data = answer.json<EditorData>();
+    expect(data.guild).toEqual({ id: FAKE_GUILD_ID, name: 'Pinewood' });
+    expect(data.readOnly).toBe(false);
+    expect(data.mayManageChannels).toBe(true);
+    expect(data.regions.map((region) => [region.id, region.name, region.category])).toEqual([
+      [1, 'west', 'Town'],
+      [2, 'east', 'Town'],
+      // Its channel is not among the server's: named by its number.
+      [3, 'Region 3', null],
+    ]);
+    expect(data.regions[0]?.version).toMatch(/^[A-Za-z0-9_-]{16}$/);
+    expect(data.gyms.map(([id]) => id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]);
+    expect(data.wayspots.map(([kind, , , title]) => [kind, title])).toEqual([
+      ['stop', 'Stop 1'],
+      ['powerspot', 'Stop 2'],
+    ]);
+    expect(data.channels).toEqual([{ id: SOUTH_TEXT_CHANNEL, name: 'south' }]);
+  });
+
+  it('answers 304 to the ETag it gave, and a new view when a region changed', async () => {
+    const { web, editor } = await made();
+    const cookie = await web.loggedIn(STAFF, 'Brock');
+    const first = await web.app.inject({ url: DATA, headers: { cookie } });
+    const etag = String(first.headers.etag);
+    const again = await web.app.inject({ url: DATA, headers: { cookie, 'if-none-match': etag } });
+    expect(again.statusCode).toBe(304);
+    editor.regionRows.rows = editor.regionRows.rows.filter((region) => region.id !== 2);
+    await editor.regions.load();
+    const changed = await web.app.inject({ url: DATA, headers: { cookie, 'if-none-match': etag } });
+    expect(changed.statusCode).toBe(200);
+    expect(changed.json<EditorData>().regions.map((region) => region.id)).toEqual([1, 3]);
+  });
+
+  it('is read-only, offering no channel, while Discord cannot say who is asking', async () => {
+    const staff = new FakeRegionStaff();
+    staff.failing = new Error('Discord is away');
+    const { web } = await made(staff);
+    const cookie = await web.loggedIn(STAFF, 'Brock');
+    const answer = await web.app.inject({ url: DATA, headers: { cookie } });
+    expect(answer.statusCode).toBe(200);
+    const data = answer.json<EditorData>();
+    expect(data).toMatchObject({ readOnly: true, mayManageChannels: false, channels: [] });
+    expect(data.regions).toHaveLength(3);
+    expect(web.entries.some((entry) => entry.msg?.toString().includes('could not ask'))).toBe(true);
+  });
+
+  it('says that a staff member may not create channels when they may not', async () => {
+    const { web } = await made(new FakeRegionStaff().asStaff(STAFF, false));
+    const cookie = await web.loggedIn(STAFF, 'Brock');
+    const data = (await web.app.inject({ url: DATA, headers: { cookie } })).json<EditorData>();
+    expect(data.mayManageChannels).toBe(false);
+    expect(data.channels).toHaveLength(1);
+  });
+
+  it('waits while the server has no row', async () => {
+    const staff = new FakeRegionStaff().answer(STAFF, { kind: 'unknown-server' });
+    const { web } = await made(staff);
+    const cookie = await web.loggedIn(STAFF, 'Brock');
+    const answer = await web.app.inject({ url: DATA, headers: { cookie } });
+    expect(answer.statusCode).toBe(503);
+  });
+});
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index 118613a5f94d5481bc18f5bca5460c1f724b4b8a..2805cbc1bb4fee4cc8961690c24a3c418993d21a 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -1,6 +1,7 @@
 import type { FastifyInstance, FastifyRequest } from 'fastify';
 import { isSnowflake } from '../db/snowflake.js';
 import { sendFailure, shortPage } from './answers.js';
+import { editorRoutes } from './editor-routes.js';
 import { etagMatches } from './geo-cache.js';
 import { mapPage } from './page.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
@@ -96,4 +97,7 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
       return reply.type('application/json; charset=utf-8').send(view.body);
     },
   );
+
+  // The region editor (plan 8M-2): its data for the server's staff.
+  editorRoutes(scope, deps);
 }
diff --git a/src/web/region-staff.test.ts b/src/web/region-staff.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8bda6bfe66a751a0684896dac66f10de9d6e8dbb
--- /dev/null
+++ b/src/web/region-staff.test.ts
@@ -0,0 +1,48 @@
+import { describe, expect, it } from 'vitest';
+import { regionStaffAnswer, type StaffFacts } from './region-staff.js';
+
+const OWNER = '700000000000000099';
+const USER = '700000000000000001';
+const SERVER = '412345678901234567';
+
+const facts = (more: Partial<StaffFacts> = {}): StaffFacts => ({
+  roleNames: ['Moderator'],
+  manageGuild: true,
+  manageChannels: false,
+  ...more,
+});
+
+describe('staff of a server on the web pages', () => {
+  it('are those /region admits: an admin, a moderator or a bot developer, who may manage it', () => {
+    for (const role of ['Admin', 'moderator', 'Bot Developer']) {
+      expect(
+        regionStaffAnswer(facts({ roleNames: ['Raider', role] }), USER, OWNER, SERVER, 1),
+      ).toEqual({
+        kind: 'staff',
+        staff: { staffId: USER, guildId: 1, server: SERVER, mayManageChannels: false },
+      });
+    }
+    expect(
+      regionStaffAnswer(facts({ manageChannels: true }), USER, OWNER, SERVER, 1),
+    ).toMatchObject({ staff: { mayManageChannels: true } });
+    // The bot's owner, as the guard admits them.
+    expect(regionStaffAnswer(facts({ roleNames: [] }), OWNER, OWNER, SERVER, 1).kind).toBe('staff');
+  });
+
+  it('are not members without such a role, nor such members who may not manage the server', () => {
+    expect(regionStaffAnswer(facts({ roleNames: ['Raider'] }), USER, OWNER, SERVER, 1)).toEqual({
+      kind: 'not-staff',
+    });
+    // Discord offers /region only to those who may manage the server (its default permission).
+    expect(regionStaffAnswer(facts({ manageGuild: false }), USER, OWNER, SERVER, 1)).toEqual({
+      kind: 'not-staff',
+    });
+    expect(regionStaffAnswer(undefined, USER, OWNER, SERVER, 1)).toEqual({ kind: 'not-member' });
+  });
+
+  it('wait for the server to be known', () => {
+    expect(regionStaffAnswer(facts(), USER, OWNER, SERVER, undefined)).toEqual({
+      kind: 'unknown-server',
+    });
+  });
+});
diff --git a/src/web/region-staff.ts b/src/web/region-staff.ts
new file mode 100644
index 0000000000000000000000000000000000000000..808b60e2a20f4e29d79818c081737e0e146bd284
--- /dev/null
+++ b/src/web/region-staff.ts
@@ -0,0 +1,60 @@
+import { isBotManagement } from '../discord/guards.js';
+import type { RegionStaff } from '../services/region-admin-service.js';
+
+/**
+ * Who may edit a server's regions on the web pages (spec 2.5, plan 8M-2): what `/region`
+ * admits, decided per request from the member as Discord has them now, never from the session.
+ */
+
+/** What is needed of a member, fetched fresh from Discord (`fetchGuildMember(…, true)`). */
+export interface StaffFacts {
+  /** The names of their roles in the server. */
+  roleNames: readonly string[];
+  /** Manage Server on the server (also as its owner or an administrator). */
+  manageGuild: boolean;
+  /** Manage Channels on the server: creating channels and deleting forums take it. */
+  manageChannels: boolean;
+}
+
+/**
+ * Whether somebody may edit a server's regions: `staff` with whose regions they touch; not
+ * `staff`, or not a member at all; the server has no row yet; or Discord could not be asked
+ * (nothing is written then, on roles nobody could check).
+ */
+export type StaffAnswer =
+  | { kind: 'staff'; staff: RegionStaff }
+  | { kind: 'not-staff' }
+  | { kind: 'not-member' }
+  | { kind: 'unknown-server' }
+  | { kind: 'unreachable' };
+
+/** Asks Discord who somebody is in a server, fresh, and decides (`regionStaffAnswer`). */
+export interface RegionStaffSource {
+  check(guildId: string, userId: string): Promise<StaffAnswer>;
+}
+
+/**
+ * The decision, from what Discord says of the member. The same check as the guard of `/region`
+ * (`requireBotManagement`: an admin, a moderator or a bot developer by role, or the bot's
+ * owner: `isBotManagement`), and the permission Discord asks of whoever is offered `/region`
+ * by default (Manage Server, its `default_member_permissions`): on the web nobody but the bot
+ * checks, so it checks both. Whether they may create channels is their own Manage Channels on
+ * the server, as `regionStaff` reads it for the command.
+ */
+export function regionStaffAnswer(
+  member: StaffFacts | undefined,
+  userId: string,
+  ownerId: string,
+  server: string,
+  guildRow: number | undefined,
+): StaffAnswer {
+  if (!member) return { kind: 'not-member' };
+  if (!member.manageGuild || !isBotManagement(member.roleNames, userId, ownerId)) {
+    return { kind: 'not-staff' };
+  }
+  if (guildRow === undefined) return { kind: 'unknown-server' };
+  return {
+    kind: 'staff',
+    staff: { staffId: userId, guildId: guildRow, server, mayManageChannels: member.manageChannels },
+  };
+}
diff --git a/src/web/server.ts b/src/web/server.ts
index 89fd8e044f9beabefadc8c597831812084425d63..7dca32cc9d3827e76c109dc53d083d9429747549 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -8,6 +8,7 @@ import { sendFailure, shortPage } from './answers.js';
 import { authRoutes } from './auth-routes.js';
 import { isNearbyPeer } from './client-address.js';
 import type { OAuthGateway } from './discord-oauth.js';
+import type { EditorDeps } from './editor-routes.js';
 import type { GeoCache } from './geo-cache.js';
 import { guildRoutes } from './guild-routes.js';
 import { securityHeaders } from './headers.js';
@@ -38,6 +39,8 @@ export interface WebDeps {
   geo: GeoCache;
   /** The page's bundle (`readAssets`). */
   assets: WebAssets;
+  /** The region editor: who may edit, and its view of each server (plan 8M-2). */
+  editor: EditorDeps;
   now: () => number;
   log: Logger;
 }
diff --git a/test/support/web.ts b/test/support/web.ts
index a5ba14a646a0a5982af0ec32842fdcc0ad31d231..ec2f019fbc6eb3654a8f42da025539d3c1996424 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -6,9 +6,13 @@ import type { FastifyInstance } from 'fastify';
 import type { Logger } from 'pino';
 import { onTestFinished } from 'vitest';
 import type { MemberDirectory } from '../../src/discord/member-directory.js';
+import type { ServerChannel } from '../../src/domain/regions/region-import.js';
+import type { WayspotRow } from '../../src/domain/wayspots/kept.js';
 import { RegionDirectory } from '../../src/services/region-directory.js';
 import type { OAuthGateway, OAuthUser } from '../../src/web/discord-oauth.js';
+import { EditorCache, type EditorSources } from '../../src/web/editor-cache.js';
 import { GeoCache, type GeoSources } from '../../src/web/geo-cache.js';
+import type { RegionStaffSource, StaffAnswer } from '../../src/web/region-staff.js';
 import { LoginLinks } from '../../src/web/login-links.js';
 import type { WebAssets } from '../../src/web/page.js';
 import { buildWebServer, type WebDeps, type WebSettings } from '../../src/web/server.js';
@@ -18,6 +22,7 @@ import { gymDirectoryWith } from './gym-store.js';
 import { EAST_CHANNEL, testRegions, WEST_CHANNEL } from './gyms.js';
 import { FakeMemberDirectory } from './members.js';
 import { createTestLogger } from './test-logger.js';
+import { wayspotsWith } from './wayspots.js';
 import { MemoryWebSessions } from './web-sessions.js';
 
 /**
@@ -52,6 +57,78 @@ export async function geoSourcesWith() {
   return { gyms, directory, regionRows, regions, channelNames, sources };
 }
 
+/** A text channel of the fakes' server that is no region, and the category of West and East. */
+export const SOUTH_TEXT_CHANNEL = '100000000000000005';
+export const TOWN_CATEGORY_ID = '100000000000000041';
+
+/**
+ * Where the region editor's view is built from in tests: the sources of `geoSourcesWith` (the
+ * invented gyms and regions, `regionRows` to change them), the kept Wayspots of `rows`, and the
+ * server's channels as `ServerChannel`s: `west` and `east` in the category `Town`, `south` (no
+ * region) and a forum. `servers.serverName` names the server `Pinewood`.
+ */
+export async function editorSourcesWith(rows: readonly WayspotRow[] = []) {
+  const geo = await geoSourcesWith();
+  const { wayspots } = await wayspotsWith(rows);
+  const channels: ServerChannel[] = [
+    { id: TOWN_CATEGORY_ID, name: 'Town', kind: 'category', categoryId: null },
+    { id: WEST_CHANNEL, name: 'west', kind: 'text', categoryId: TOWN_CATEGORY_ID },
+    { id: EAST_CHANNEL, name: 'east', kind: 'text', categoryId: TOWN_CATEGORY_ID },
+    { id: SOUTH_TEXT_CHANNEL, name: 'south', kind: 'text', categoryId: null },
+    { id: '100000000000000011', name: 'west-raids', kind: 'forum', categoryId: TOWN_CATEGORY_ID },
+  ];
+  const sources: EditorSources = {
+    guilds: geo.sources.guilds,
+    regions: geo.regions,
+    gyms: geo.directory,
+    wayspots,
+    servers: {
+      serverChannels: (guild) => (guild === FAKE_GUILD_ID ? channels : undefined),
+      serverName: (guild) => (guild === FAKE_GUILD_ID ? 'Pinewood' : undefined),
+    },
+  };
+  return { ...geo, wayspots, channels, sources };
+}
+
+/**
+ * Who may edit a server's regions, for tests: nobody is staff of anything until `answer` says
+ * so (`asStaff` for staff of the fakes' server). `asked` records every question as
+ * `<guild>:<user>`; set `failing` to make every question fail, as Discord being away would.
+ */
+export class FakeRegionStaff implements RegionStaffSource {
+  readonly asked: string[] = [];
+  failing: Error | undefined;
+  private readonly answers = new Map<string, StaffAnswer>();
+
+  answer(userId: string, answer: StaffAnswer, guildId = FAKE_GUILD_ID): this {
+    this.answers.set(`${guildId}:${userId}`, answer);
+    return this;
+  }
+
+  /** Makes somebody staff of the fakes' server (row 1). */
+  asStaff(userId: string, mayManageChannels = true): this {
+    return this.answer(userId, {
+      kind: 'staff',
+      staff: { staffId: userId, guildId: 1, server: FAKE_GUILD_ID, mayManageChannels },
+    });
+  }
+
+  check(guildId: string, userId: string): Promise<StaffAnswer> {
+    this.asked.push(`${guildId}:${userId}`);
+    if (this.failing) return Promise.reject(this.failing);
+    return Promise.resolve(this.answers.get(`${guildId}:${userId}`) ?? { kind: 'not-member' });
+  }
+}
+
+/** No regions, gyms or Wayspots: the editor of a server that has none. */
+const NO_EDITOR: EditorSources = {
+  guilds: { idFor: () => Promise.resolve(undefined) },
+  regions: { all: () => [], generation: 0 },
+  gyms: { all: () => [], regionsOf: () => [], generation: 0 },
+  wayspots: { all: () => [], generation: 0 },
+  servers: { serverChannels: () => undefined, serverName: () => undefined },
+};
+
 /** No regions and no gyms: the map of a server that has none. */
 const NOTHING: GeoSources = {
   guilds: { idFor: () => Promise.resolve(undefined) },
@@ -132,6 +209,10 @@ export interface WebTestOptions {
   geo?: { sources: GeoSources };
   /** The built bundle (`builtAssets`); by default none was built. */
   assets?: WebAssets;
+  /** Who may edit a server's regions; nobody by default. */
+  staff?: RegionStaffSource;
+  /** Where the editor's view is built from (`editorSourcesWith`); nothing by default. */
+  editor?: { sources: EditorSources };
 }
 
 /**
@@ -195,6 +276,10 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
     loginLinks,
     geo: new GeoCache(options.geo?.sources ?? NOTHING),
     assets: options.assets ?? { dir: path.join(tmpdir(), 'pine-web-none'), manifest: undefined },
+    editor: {
+      staff: options.staff ?? new FakeRegionStaff(),
+      view: new EditorCache(options.editor?.sources ?? NO_EDITOR),
+    },
     now: () => clock.now,
     log,
   });
````

### Task 3: Region editor: preview and save

Prototype commit: `7c6e564fb726bbafd75aa5038184b992abc31cec`

`POST /s/<guild>/api/regions/preview` and `/save`: a per-address limit, `postGuard` and the member throttle (6 a minute) in `onRequest`, before the body is read and before the fresh staff fetch; 2 MB bodies, zod bounds; versions (409 with the regions as they are), refusals (422), Manage Channels to delete a forum; the overlap and gap check in a worker thread (`save-check.ts`: one at a time, 10 s and 256 MB, "Too complex to check: simplify the outlines.", the preview's verdict kept for 5 minutes); `RegionAdminService.save` re-checks the versions inside one lock run, then imports and removes (each removal caught); the preview and outcome in `/region import`'s words; audit-log reason "region editor by <id>"; the log line with counts only.

**Files:**

```
 src/app.ts                               |   8 +
 src/commands/regions/import.ts           | 113 ++++++++++++---
 src/commands/regions/remove.ts           |  11 +-
 src/commands/regions/shared.ts           |   7 +-
 src/domain/regions/region-import.test.ts |  25 ++++
 src/domain/regions/region-import.ts      |   7 +
 src/services/region-admin-service.ts     | 264 +++++++++++++++++++++------------
 src/web/editor-routes.ts                 |  89 +++++++++++-
 src/web/editor-save.test.ts              | 564 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/editor-save.ts                   | 421 +++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/save-check-thread.ts             |  28 ++++
 src/web/save-check.test.ts               |  83 +++++++++++
 src/web/save-check.ts                    | 159 ++++++++++++++++++++
 test/support/hanging-thread.ts           |   5 +
 test/support/web.ts                      |  59 +++++++-
 15 files changed, 1716 insertions(+), 127 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/regions/region-import.test.ts src/web/editor-save.test.ts src/web/save-check.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app.ts src/commands/regions/import.ts src/commands/regions/remove.ts src/commands/regions/shared.ts src/domain/regions/region-import.test.ts src/domain/regions/region-import.ts src/services/region-admin-service.ts src/web/editor-routes.ts src/web/editor-save.test.ts src/web/editor-save.ts src/web/save-check-thread.ts src/web/save-check.test.ts src/web/save-check.ts test/support/hanging-thread.ts test/support/web.ts` and `npx eslint src/app.ts src/commands/regions/import.ts src/commands/regions/remove.ts src/commands/regions/shared.ts src/domain/regions/region-import.test.ts src/domain/regions/region-import.ts src/services/region-admin-service.ts src/web/editor-routes.ts src/web/editor-save.test.ts src/web/editor-save.ts src/web/save-check-thread.ts src/web/save-check.test.ts src/web/save-check.ts test/support/hanging-thread.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 7c6e564fb726bbafd75aa5038184b992abc31cec -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m2-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Region editor: preview and save`, the paragraph above as the body and the trailer, staging exactly
  `src/app.ts src/commands/regions/import.ts src/commands/regions/remove.ts src/commands/regions/shared.ts src/domain/regions/region-import.test.ts src/domain/regions/region-import.ts src/services/region-admin-service.ts src/web/editor-routes.ts src/web/editor-save.test.ts src/web/editor-save.ts src/web/save-check-thread.ts src/web/save-check.test.ts src/web/save-check.ts test/support/hanging-thread.ts test/support/web.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index fc7ca25dd51f3df59733b7a87e3736fe68a67b5b..a8f4bfc144243fbf3983d5a8a884279986fd4a13 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -106,6 +106,7 @@ import { createShutdown } from './shutdown.js';
 import { pictureOrigins } from './web/headers.js';
 import { buildWebServer } from './web/server.js';
 import { DiscordOAuth } from './web/discord-oauth.js';
+import { SaveCheckWorker } from './web/save-check.js';
 import { EditorCache } from './web/editor-cache.js';
 import { GeoCache } from './web/geo-cache.js';
 import { readAssets } from './web/page.js';
@@ -806,6 +807,13 @@ export async function startApp(
             serverName: (guildId) => client.guilds.cache.get(guildId)?.name,
           },
         }),
+        editing: {
+          regions,
+          admin: regionAdmin,
+          checker: new SaveCheckWorker({ log }),
+          selfRoles: config.settings.features.roles,
+          log,
+        },
       },
       now: () => Date.now(),
       log,
diff --git a/src/commands/regions/import.ts b/src/commands/regions/import.ts
index c1182e5f7a4c7f88915b2005d4938343a0946509..5c7d90db9022038c413902517d5786f47cd00a7f 100644
--- a/src/commands/regions/import.ts
+++ b/src/commands/regions/import.ts
@@ -18,6 +18,7 @@ import {
   type KmlSkipReason,
 } from '../../domain/geo/kml.js';
 import { MAX_OUTLINE_CORNERS } from '../../domain/geo/outline.js';
+import type { Worded } from '../../domain/web/editor-data.js';
 import {
   MAX_CATEGORY_CHANNELS,
   MAX_NEW_CHANNELS,
@@ -232,7 +233,11 @@ const names = (items: readonly string[], sign: string): string =>
   );
 
 /** The first line of a preview: what the file would do, counted. */
-function summaryLine(preview: ImportPreview, oneChannel: boolean): string {
+function summaryLine(
+  preview: ImportPreview,
+  oneChannel: boolean,
+  from: 'file' | 'editor' = 'file',
+): string {
   const { imports } = preview;
   const fresh = imports.filter((one) => one.regionId === null).length;
   const changed = imports.filter((one) => one.regionId !== null && !one.unchanged).length;
@@ -248,8 +253,8 @@ function summaryLine(preview: ImportPreview, oneChannel: boolean): string {
       : []),
   ];
   return (
-    `This file would ${doing.join(' and ')}. Nothing is changed yet` +
-    (oneChannel ? ' (no channel is created).' : '.')
+    `${from === 'file' ? 'This file' : 'Saving'} would ${doing.join(' and ')}. Nothing is ` +
+    `changed yet${oneChannel ? ' (no channel is created).' : '.'}`
   );
 }
 
@@ -268,13 +273,33 @@ export function renderPreview(
   channelNames: ReadonlyMap<string, string> = new Map(),
   buttons: readonly APIButtonComponent[] = [],
 ): V2Message {
+  const { lines, lists } = previewWords(preview, skipped, others, oneChannel);
+  return importMessage(lines, lists, PREVIEW_FILE, channelNames, buttons);
+}
+
+/**
+ * What a preview says, as sentences and lists (Discord's markdown): of a file (`renderPreview`)
+ * or of a save of the region editor (`from: 'editor'`, plan 8M-2), which has no file and says
+ * so.
+ */
+export function previewWords(
+  preview: ImportPreview,
+  skipped: readonly KmlSkipped[],
+  others: number,
+  oneChannel = false,
+  from: 'file' | 'editor' = 'file',
+): { lines: string[]; lists: ImportList[] } {
   const { imports, leftOut, newChannels, newCategories } = preview;
   const lines: string[] = [];
   if (imports.length === 0) {
-    lines.push('Nothing in this file can be imported.');
+    lines.push(
+      from === 'file' ? 'Nothing in this file can be imported.' : 'No outline can be saved.',
+    );
   } else {
-    lines.push(summaryLine(preview, oneChannel));
-    if (!oneChannel) lines.push('Regions that are not in this file stay as they are.');
+    lines.push(summaryLine(preview, oneChannel, from));
+    if (!oneChannel && from === 'file') {
+      lines.push('Regions that are not in this file stay as they are.');
+    }
   }
   const close = imports.filter((one) => one.nearMiss !== undefined).length;
   if (close > 0) {
@@ -341,8 +366,10 @@ export function renderPreview(
     lines.push(
       `I create at most ${MAX_NEW_CHANNELS} channels in one import, so ` +
         `${waiting === 1 ? '1 area waits' : `${waiting} areas wait`} (under "Left out"): once ` +
-        'this import is done, import the same file again. What is imported already comes out ' +
-        'unchanged.',
+        (from === 'file'
+          ? 'this import is done, import the same file again. What is imported already comes ' +
+            'out unchanged.'
+          : 'this save is done, save again: what waits stays staged.'),
     );
   }
   if (others > 0) {
@@ -357,23 +384,52 @@ export function renderPreview(
     .sort((a, b) => risk(a.one) - risk(b.one) || a.index - b.index)
     .map(({ one }) => plannedLine(one));
   const out = [
-    ...leftOut.map((left) => `- ${shown(left.name)}: ${leftOutText(left)}`),
+    ...leftOut.map((left) => leftOutLine(left)),
     ...skipped.map((skip) => `- ${shown(skip.name)}: ${skipText(skip.reason)}`),
   ];
-  return importMessage(
+  return {
     lines,
-    [
+    lists: [
       { title: 'Would be imported', items: planned, room: IMPORT_LIST },
       { title: 'Left out', items: out, room: LEFT_OUT_LIST },
     ],
-    PREVIEW_FILE,
-    channelNames,
-    buttons,
-  );
+  };
+}
+
+/** An area left out of the plan, as a line of a list: its name and why. */
+export function leftOutLine(left: LeftOut): string {
+  return `- ${shown(left.name)}: ${leftOutText(left)}`;
+}
+
+/**
+ * Sentences and lists of a preview or an outcome as plain text (plan 8M-2, the region editor
+ * sets them as text): channels by their names (`channelNames`, by id), no bold, every list
+ * whole, those without lines left out. What the attached file of a cut message holds, by parts.
+ */
+export function plainWords(
+  lines: readonly string[],
+  lists: readonly ImportList[],
+  channelNames: ReadonlyMap<string, string>,
+): Worded {
+  // Names the bot made are code (`derived`), which strips backticks from them: every backtick
+  // is markdown.
+  const plainText = (text: string): string =>
+    text
+      .replace(/<#(\d+)>/gu, (_mention, id: string) => `#${channelNames.get(id) ?? id}`)
+      .replace(/\*\*|`/gu, '');
+  return {
+    lines: lines.map(plainText),
+    lists: lists
+      .filter((list) => list.items.length > 0)
+      .map((list) => ({
+        title: list.title,
+        items: list.items.map((item) => plainText(item.replace(/^- /u, ''))),
+      })),
+  };
 }
 
 /** A list of a preview or an outcome: its heading, its lines and the room it has. */
-interface ImportList {
+export interface ImportList {
   title: string;
   items: readonly string[];
   room: number;
@@ -499,6 +555,18 @@ export function renderOutcome(
   outcome: ImportOutcome,
   channelNames: ReadonlyMap<string, string> = new Map(),
 ): V2Message {
+  const { lines, lists } = outcomeWords(outcome, selfRoleReminder(ctx, 'new'));
+  return importMessage(lines, lists, OUTCOME_FILE, channelNames);
+}
+
+/**
+ * What an import did, as sentences and lists (Discord's markdown): `renderOutcome`'s, and the
+ * region editor's (plan 8M-2). `newReminder` is said when a region is new (`selfRoleReminder`).
+ */
+export function outcomeWords(
+  outcome: ImportOutcome,
+  newReminder: string | undefined,
+): { lines: string[]; lists: ImportList[] } {
   const { imported, notImported, categoriesCreated } = outcome;
   const lines: string[] = [];
   if (imported.length === 0) {
@@ -530,24 +598,21 @@ export function renderOutcome(
         '`/admin setup-forums`.',
     );
   }
-  if (imported.some((region) => region.newRegion)) {
-    const reminder = selfRoleReminder(ctx, 'new');
-    if (reminder !== undefined) lines.push(reminder);
+  if (imported.some((region) => region.newRegion) && newReminder !== undefined) {
+    lines.push(newReminder);
   }
   const ordered = imported
     .map((region, index) => ({ region, index }))
     .sort((a, b) => FORUM_ORDER[a.region.forum] - FORUM_ORDER[b.region.forum] || a.index - b.index)
     .map(({ region }) => importedLine(region));
   const failures = notImported.map((failed) => `- ${shown(failed.name)}: ${failureText(failed)}`);
-  return importMessage(
+  return {
     lines,
-    [
+    lists: [
       { title: 'Imported', items: ordered, room: LEFT_OUT_LIST },
       { title: 'Not imported', items: failures, room: IMPORT_LIST },
     ],
-    OUTCOME_FILE,
-    channelNames,
-  );
+  };
 }
 
 /**
diff --git a/src/commands/regions/remove.ts b/src/commands/regions/remove.ts
index bdf0a049a86ce4035accb20c7b24c3cec806d02a..1b136bc439d8ac43d931c97efb682d434b4f6f6a 100644
--- a/src/commands/regions/remove.ts
+++ b/src/commands/regions/remove.ts
@@ -26,8 +26,11 @@ const parties = (n: number): string =>
 const ofIts = (n: number): string =>
   `${n} of its raids, trains and meetups ${n === 1 ? 'was' : 'were'}`;
 
-/** What goes with a region, as lines; `tense` words them for the question or for the answer. */
-function goesWith(
+/**
+ * What goes with a region, as lines; `tense` words them for the question or for the answer.
+ * Also the region editor's (plan 8M-2).
+ */
+export function goesWith(
   counted: { parties: number; strandedGyms: number; routes: number },
   tense: 'will' | 'did',
 ): string[] {
@@ -139,8 +142,8 @@ export const removeRegion: SubcommandPart = {
   autocomplete: respondWithRegions,
 };
 
-/** What a removal did, as lines. */
-function outcomeLines(
+/** What a removal did, as lines; also the region editor's (plan 8M-2). */
+export function outcomeLines(
   outcome: Exclude<RemovalOutcome, { kind: 'gone' }>,
   label: string,
   reminder: string | undefined,
diff --git a/src/commands/regions/shared.ts b/src/commands/regions/shared.ts
index 5a3280c30c9fab8a58f895425608e8e41f669959..ca53373794d4c7aaad804692ef41a0f9e50b21a7 100644
--- a/src/commands/regions/shared.ts
+++ b/src/commands/regions/shared.ts
@@ -196,7 +196,12 @@ export function content(lines: readonly (string | undefined)[]): string {
  * roles: a region usually has a role of its own. Undefined where that feature is off.
  */
 export function selfRoleReminder(ctx: AppContext, what: 'new' | 'removed'): string | undefined {
-  if (!ctx.config.settings.features.roles) return undefined;
+  return roleReminder(ctx.config.settings.features.roles, what);
+}
+
+/** `selfRoleReminder` by whether members give themselves roles (`settings.features.roles`). */
+export function roleReminder(roles: boolean, what: 'new' | 'removed'): string | undefined {
+  if (!roles) return undefined;
   return what === 'new'
     ? 'If members give themselves a role for a region, add the role of a new region with ' +
         '`/admin self-roles add`.'
diff --git a/src/domain/regions/region-import.test.ts b/src/domain/regions/region-import.test.ts
index 614a8c261964108875d3491f11f806f544d074b6..e4a156ea98b810d04a22a5b878ddbf08287ba470 100644
--- a/src/domain/regions/region-import.test.ts
+++ b/src/domain/regions/region-import.test.ts
@@ -315,6 +315,31 @@ describe('planImport', () => {
     expect(made.stranded).toBe(2);
   });
 
+  it('counts the gyms of the regions removed with it as lying in no region afterwards', () => {
+    // East (gym 3) is removed in the same save that gives West End a new outline: west's gyms
+    // stay, east's would lie in no region.
+    const regions = [
+      { id: 1, guildId: 1, channelId: 'c1', forumChannelId: null, bounds: WEST },
+      { id: 2, guildId: 1, channelId: 'c2', forumChannelId: null, bounds: EAST },
+    ];
+    const made = plan({
+      areas: [area('West End', square(40, -80.1, 40.1, -80.01))],
+      channels: [text('c1', 'west-end'), text('c2', 'east-side')],
+      regions,
+      removing: [2],
+    });
+    expect(made.stranded).toBe(1);
+    // A change that gives east's gym to west keeps it in the server.
+    expect(
+      plan({
+        areas: [area('West End', square(40, -80.1, 40.1, -79.9))],
+        channels: [text('c1', 'west-end'), text('c2', 'east-side')],
+        regions,
+        removing: [2],
+      }).stranded,
+    ).toBe(0);
+  });
+
   it('counts the raids of a changed region whose gym would lie outside it', () => {
     const made = plan({
       areas: [area('West End', square(40.055, -80.1, 40.1, -80))],
diff --git a/src/domain/regions/region-import.ts b/src/domain/regions/region-import.ts
index 825bf517bdf5a45cc1a6162b5fa9f179013adeac..3a8c43639492a662f976a213a26eb941456dc66f 100644
--- a/src/domain/regions/region-import.ts
+++ b/src/domain/regions/region-import.ts
@@ -108,6 +108,11 @@ export interface ImportInput {
   orphanForums?: readonly string[];
   /** What the name of a region's forum adds to the name of its channel (`regionForumSuffix`). */
   forumSuffix?: string;
+  /**
+   * Regions of this server removed together with the import (the region editor's save): they
+   * keep no gym afterwards, so their gyms count among those left in no region.
+   */
+  removing?: readonly number[];
 }
 
 /** The category of a channel that is to be created: one that exists, or one to create. */
@@ -351,8 +356,10 @@ export function planImport(input: ImportInput): ImportPlan {
   for (const { placed: one, region } of accepted) {
     if (region) replaced.set(region.id, one.area.outline);
   }
+  const removing = new Set(input.removing ?? []);
   const outlinesAfter: (readonly LatLon[])[] = [
     ...own.flatMap((region) => {
+      if (removing.has(region.id)) return [];
       const bounds = replaced.get(region.id) ?? region.bounds;
       return bounds ? [bounds] : [];
     }),
diff --git a/src/services/region-admin-service.ts b/src/services/region-admin-service.ts
index e28340c0d830cc2c6c9ae9428b579baaf2165bd0..52fab16907f9917b4a2e602c46c3bae9118b0a0f 100644
--- a/src/services/region-admin-service.ts
+++ b/src/services/region-admin-service.ts
@@ -203,6 +203,21 @@ export type RemovalOutcome =
       reloaded: boolean;
     };
 
+/** What a removal of a save of the region editor did; `error`: it rejected (logged). */
+export interface EditorRemoval {
+  regionId: number;
+  outcome: RemovalOutcome | { kind: 'error' };
+}
+
+/**
+ * What a save of the region editor did (`RegionAdminService.save`): nothing, as something
+ * `changed` since the page loaded it; or it was `saved`: what was imported (none when nothing
+ * was to be), and each removal.
+ */
+export type EditorSaveOutcome<Changed> =
+  | { kind: 'changed'; changed: readonly Changed[] }
+  | { kind: 'saved'; imported: ImportOutcome | undefined; removed: EditorRemoval[] };
+
 /** An area of an export: named so that an import finds its channel again. */
 export type ExportedArea = Pick<KmlArea, 'name' | 'description' | 'outline'>;
 
@@ -293,13 +308,16 @@ export class RegionAdminService {
    * What an import of these areas would do (`planImport`), by the channels, regions, gyms and
    * raids as they are now. Nothing is changed. With `target` the file is for that one channel
    * (which the caller has checked with `textChannel`). `orphanForums` are the forums of removed
-   * regions (`orphanForums`), which a region of the same channel takes back.
+   * regions (`orphanForums`), which a region of the same channel takes back. `removing` are
+   * regions removed together with the import (the region editor's save, plan 8M-2): their gyms
+   * count among those left in no region.
    */
   preview(
     staff: RegionStaff,
     areas: readonly KmlArea[],
     target?: { id: string; name: string },
     orphanForums: readonly string[] = [],
+    removing: readonly number[] = [],
   ): ImportPreview {
     const { regions, gyms, store, gateway, settings } = this.options;
     const mayCreate = gateway.mayCreateChannels(staff.server);
@@ -314,6 +332,7 @@ export class RegionAdminService {
       staffMayCreate: staff.mayManageChannels,
       orphanForums,
       forumSuffix: settings.regionForumSuffix,
+      removing,
       ...(target ? { target } : {}),
     });
     return { ...plan, mayCreate };
@@ -340,16 +359,62 @@ export class RegionAdminService {
    * Active parties stay where they are when an outline changes under them. Never rejects.
    */
   async import(staff: RegionStaff, planned: readonly PlannedImport[]): Promise<ImportOutcome> {
+    return this.options.lock.run(() => this.importNow(staff, planned, '/region import'));
+  }
+
+  /** `import` under the lock already; `via` names what asked in the server's audit log. */
+  private async importNow(
+    staff: RegionStaff,
+    planned: readonly PlannedImport[],
+    via: string,
+  ): Promise<ImportOutcome> {
+    const outcome = await this.write(staff, planned, via);
+    await this.adoptForums(staff, planned, outcome);
+    await this.setUpForums(staff, outcome);
+    this.options.log.info(
+      { staff: staff.staffId, guild: staff.guildId, ...importSummary(outcome) },
+      'a region import is done',
+    );
+    return outcome;
+  }
+
+  /**
+   * A save of the region editor (plan 8M-2): what its preview showed, imported (`import`'s
+   * steps) and removed (`remove`'s), all in one run under the lock, so that nothing changes in
+   * between. First of all, under the lock, `notAsLoaded` is asked what of the save is no longer
+   * as the page loaded it (by the regions as they are now): anything, and nothing is done
+   * (`changed`, with what it said). Each removal that rejects is `error` (logged), and the others
+   * go on. What Discord's audit log says of the channels made and deleted names the region
+   * editor. Never rejects.
+   */
+  async save<Changed>(
+    staff: RegionStaff,
+    planned: readonly PlannedImport[],
+    removals: readonly { regionId: number; forum: 'keep' | 'delete' }[],
+    notAsLoaded: () => readonly Changed[],
+  ): Promise<EditorSaveOutcome<Changed>> {
     const { lock, log } = this.options;
-    return lock.run(async () => {
-      const outcome = await this.write(staff, planned);
-      await this.adoptForums(staff, planned, outcome);
-      await this.setUpForums(staff, outcome);
-      log.info(
-        { staff: staff.staffId, guild: staff.guildId, ...importSummary(outcome) },
-        'a region import is done',
-      );
-      return outcome;
+    return lock.run(async (): Promise<EditorSaveOutcome<Changed>> => {
+      const changed = notAsLoaded();
+      if (changed.length > 0) return { kind: 'changed', changed };
+      const imported =
+        planned.length > 0 ? await this.importNow(staff, planned, 'region editor') : undefined;
+      const removed: EditorRemoval[] = [];
+      for (const { regionId, forum } of removals) {
+        try {
+          removed.push({
+            regionId,
+            outcome: await this.removeNow(regionId, staff, forum, 'region editor'),
+          });
+        } catch (err) {
+          log.error(
+            { err, region: regionId, staff: staff.staffId },
+            'could not remove a region in the web editor',
+          );
+          removed.push({ regionId, outcome: { kind: 'error' } });
+        }
+      }
+      return { kind: 'saved', imported, removed };
     });
   }
 
@@ -427,10 +492,11 @@ export class RegionAdminService {
     }
   }
 
-  /** Steps 1 to 3 of `import`, under the lock. */
+  /** Steps 1 to 3 of `import`, under the lock; `via` names what asked (`importNow`). */
   private async write(
     staff: RegionStaff,
     planned: readonly PlannedImport[],
+    via: string,
   ): Promise<ImportOutcome> {
     const { storage, regions, gyms, log } = this.options;
     const ready: Ready[] = [];
@@ -482,6 +548,7 @@ export class RegionAdminService {
             channels,
             madeCategories,
             categoriesCreated,
+            `${via} by ${staff.staffId}`,
           );
           if (!made.ok) {
             leave(made.reason);
@@ -561,6 +628,7 @@ export class RegionAdminService {
   /**
    * Creates the text channel of a new region, in its category, which is created first when
    * the server has none of that name (looked for again, and among those this run made).
+   * `auditReason` is what the server's audit log says of them: what asked, and who.
    */
   private async createChannel(
     staff: RegionStaff,
@@ -569,10 +637,9 @@ export class RegionAdminService {
     channels: readonly ServerChannel[],
     madeCategories: Map<string, string>,
     categoriesCreated: string[],
+    auditReason: string,
   ): Promise<{ ok: true; id: string } | { ok: false; reason: ImportFailure }> {
     const { gateway, log } = this.options;
-    // What the server's audit log says of what is created: who asked for it.
-    const auditReason = `/region import by ${staff.staffId}`;
     try {
       let categoryId: string | null = null;
       if (category !== null) {
@@ -770,100 +837,107 @@ export class RegionAdminService {
    *    forum that cannot be deleted is said in the answer; the region is gone all the same.
    */
   remove(regionId: number, staff: RegionStaff, forum: 'keep' | 'delete'): Promise<RemovalOutcome> {
-    const { lock, storage, store, posts, gateway, log } = this.options;
-    return lock.run(async (): Promise<RemovalOutcome> => {
-      const region = this.regionOf(regionId, staff.guildId);
-      if (!region) return { kind: 'gone' };
-      await store.closeRegion(region.id);
-      let ended = 0;
-      let stuck: Party | undefined;
-      for (let round = 0; round < END_ROUNDS && !stuck; round++) {
-        const parties = store.inRegion(region.id);
-        if (parties.length === 0) break;
-        for (const party of parties) {
-          try {
-            const lastWords = `This region is being removed, so this ${partyWord(party)} was closed.`;
-            if (await posts.end(party.id, undefined, { lastWords })) ended++;
-          } catch (err) {
-            log.error({ err, party: party.id, region: region.id }, 'could not end a party');
-            stuck = party;
-            break;
-          }
+    return this.options.lock.run(() => this.removeNow(regionId, staff, forum, '/region remove'));
+  }
+
+  /** `remove` under the lock already; `via` names what asked in the server's audit log. */
+  private async removeNow(
+    regionId: number,
+    staff: RegionStaff,
+    forum: 'keep' | 'delete',
+    via: string,
+  ): Promise<RemovalOutcome> {
+    const { storage, store, posts, gateway, log } = this.options;
+    const region = this.regionOf(regionId, staff.guildId);
+    if (!region) return { kind: 'gone' };
+    await store.closeRegion(region.id);
+    let ended = 0;
+    let stuck: Party | undefined;
+    for (let round = 0; round < END_ROUNDS && !stuck; round++) {
+      const parties = store.inRegion(region.id);
+      if (parties.length === 0) break;
+      for (const party of parties) {
+        try {
+          const lastWords = `This region is being removed, so this ${partyWord(party)} was closed.`;
+          if (await posts.end(party.id, undefined, { lastWords })) ended++;
+        } catch (err) {
+          log.error({ err, party: party.id, region: region.id }, 'could not end a party');
+          stuck = party;
+          break;
         }
       }
-      stuck ??= store.inRegion(region.id)[0];
-      if (stuck) {
-        store.reopenRegion(region.id);
-        return { kind: 'stuck', ended, party: stuck };
-      }
-      const strandedGyms = this.onlyIn(region).length;
-      let removed: Awaited<ReturnType<RegionAdminStorage['remove']>>;
+    }
+    stuck ??= store.inRegion(region.id)[0];
+    if (stuck) {
+      store.reopenRegion(region.id);
+      return { kind: 'stuck', ended, party: stuck };
+    }
+    const strandedGyms = this.onlyIn(region).length;
+    let removed: Awaited<ReturnType<RegionAdminStorage['remove']>>;
+    try {
+      removed = await storage.remove(region.id, staff.guildId);
+    } catch (err) {
+      log.error({ err, region: region.id }, 'could not remove a region');
+      store.reopenRegion(region.id);
+      return { kind: 'failed', ended };
+    }
+    const reloaded = await this.reload();
+    // Somebody else removed it in the same moment: memory has caught up now.
+    if (!removed.removed) return { kind: 'gone' };
+    const { routes } = removed;
+    // What the row had when it was locked and deleted, whatever memory said.
+    const forumId = removed.forumChannelId;
+    if (removed.summaryMessageId !== null) {
       try {
-        removed = await storage.remove(region.id, staff.guildId);
+        await gateway.deletePost(removed.summaryMessageId);
       } catch (err) {
-        log.error({ err, region: region.id }, 'could not remove a region');
-        store.reopenRegion(region.id);
-        return { kind: 'failed', ended };
+        log.warn({ err, region: region.id }, 'could not delete the list of a removed region');
       }
-      const reloaded = await this.reload();
-      // Somebody else removed it in the same moment: memory has caught up now.
-      if (!removed.removed) return { kind: 'gone' };
-      const { routes } = removed;
-      // What the row had when it was locked and deleted, whatever memory said.
-      const forumId = removed.forumChannelId;
-      if (removed.summaryMessageId !== null) {
+    }
+    let forumOutcome: Extract<RemovalOutcome, { kind: 'removed' }>['forum'] = 'none';
+    let forumDenied = false;
+    if (forumId !== null) {
+      posts.forgetTags(forumId);
+      // A server the bot does not know (it left it) has no forum left to delete.
+      const channels = gateway.serverChannels(staff.server);
+      const there =
+        channels !== undefined && RegionAdminService.state(channels, forumId, 'forum') === 'there';
+      if (!there) forumOutcome = 'gone';
+      else if (forum === 'keep') forumOutcome = 'kept';
+      else {
         try {
-          await gateway.deletePost(removed.summaryMessageId);
+          await gateway.deleteChannel(forumId, `${via} by ${staff.staffId}`);
+          forumOutcome = 'deleted';
         } catch (err) {
-          log.warn({ err, region: region.id }, 'could not delete the list of a removed region');
+          log.warn({ err, forum: forumId }, 'could not delete the forum of a removed region');
+          forumOutcome = 'not-deleted';
+          forumDenied = isMissingPermission(err);
         }
       }
-      let forumOutcome: Extract<RemovalOutcome, { kind: 'removed' }>['forum'] = 'none';
-      let forumDenied = false;
-      if (forumId !== null) {
-        posts.forgetTags(forumId);
-        // A server the bot does not know (it left it) has no forum left to delete.
-        const channels = gateway.serverChannels(staff.server);
-        const there =
-          channels !== undefined &&
-          RegionAdminService.state(channels, forumId, 'forum') === 'there';
-        if (!there) forumOutcome = 'gone';
-        else if (forum === 'keep') forumOutcome = 'kept';
-        else {
-          try {
-            await gateway.deleteChannel(forumId, `/region remove by ${staff.staffId}`);
-            forumOutcome = 'deleted';
-          } catch (err) {
-            log.warn({ err, forum: forumId }, 'could not delete the forum of a removed region');
-            forumOutcome = 'not-deleted';
-            forumDenied = isMissingPermission(err);
-          }
-        }
-      }
-      log.info(
-        {
-          staff: staff.staffId,
-          guild: staff.guildId,
-          region: region.id,
-          channel: region.channelId,
-          ended,
-          routes,
-          strandedGyms,
-          forum: forumOutcome,
-        },
-        'a region was removed',
-      );
-      return {
-        kind: 'removed',
-        region,
+    }
+    log.info(
+      {
+        staff: staff.staffId,
+        guild: staff.guildId,
+        region: region.id,
+        channel: region.channelId,
         ended,
         routes,
         strandedGyms,
         forum: forumOutcome,
-        forumChannelId: forumId,
-        ...(forumDenied ? { forumDenied } : {}),
-        reloaded,
-      };
-    });
+      },
+      'a region was removed',
+    );
+    return {
+      kind: 'removed',
+      region,
+      ended,
+      routes,
+      strandedGyms,
+      forum: forumOutcome,
+      forumChannelId: forumId,
+      ...(forumDenied ? { forumDenied } : {}),
+      reloaded,
+    };
   }
 }
diff --git a/src/web/editor-routes.ts b/src/web/editor-routes.ts
index 709e8bea62d78378cdc7bffc942ff65415b03aa0..610cac6d310e365a9e9e9c48db7410c09bde81e4 100644
--- a/src/web/editor-routes.ts
+++ b/src/web/editor-routes.ts
@@ -1,6 +1,17 @@
-import type { FastifyInstance, FastifyReply } from 'fastify';
+import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
+import { Throttles, type Throttle } from '../discord/throttle.js';
+import type { SaveAnswer } from '../domain/web/editor-data.js';
 import { sendFailure } from './answers.js';
+import { SaveChecks } from './save-check.js';
+import { postGuard } from './csrf.js';
 import type { EditorCache } from './editor-cache.js';
+import {
+  carryOutSave,
+  previewSave,
+  SAVE_BODY_LIMIT,
+  saveRequestSchema,
+  type RegionEditing,
+} from './editor-save.js';
 import { etagMatches } from './geo-cache.js';
 import type { GuildRequest } from './guild-routes.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
@@ -9,6 +20,13 @@ import type { WebDeps } from './server.js';
 
 /** The requests for the editor's data one address may make in a minute: each asks Discord. */
 const EDIT_DATA_PER_MINUTE = 20;
+/** The previews and saves one address may send in a minute, whoever sends them. */
+const SAVES_PER_ADDRESS_MINUTE = 30;
+/**
+ * How often one member may preview or save: each may have the overlaps and gaps of a city's
+ * regions worked out (seconds of a thread), and asks Discord who is staff.
+ */
+export const REGION_CHECK_THROTTLE: Throttle = { uses: 6, perSeconds: 60 };
 
 /** What the region editor's addresses need (plan 8M-2). */
 export interface EditorDeps {
@@ -16,8 +34,22 @@ export interface EditorDeps {
   staff: RegionStaffSource;
   /** The editor's view of each server. */
   view: EditorCache;
+  /** Preview and save: the region administration `/region` uses. */
+  editing: RegionEditing;
 }
 
+/** The status of each answer of a preview or a save. */
+const SAVE_STATUS: Readonly<Record<SaveAnswer['kind'], number>> = {
+  preview: 200,
+  saved: 200,
+  conflicts: 409,
+  refused: 422,
+};
+
+/** What a preview or a save answers while Discord cannot say who asks. */
+const UNREACHABLE =
+  'Discord cannot be reached just now, so nothing can be saved. Try again in a moment.';
+
 /**
  * Who asks for an address of the editor: nobody logged in, or what Discord says of them now
  * (`RegionStaffSource`, fresh each time; the session says only who they are).
@@ -46,7 +78,10 @@ export async function editorViewer(
  * is the editor's data for the server's staff (`editorView`), with an ETag: 401 without a
  * session, 403 for somebody who is not staff of the server (or no member), 503 while the server
  * has no row; when Discord cannot be asked, the view read-only, without the channels a new
- * region could take.
+ * region could take. `POST api/regions/preview` and `…/save` take the staged changes
+ * (`saveRequestSchema`) and answer a `SaveAnswer`: 200 a preview or what was saved, 409 the
+ * regions changed meanwhile, 422 why nothing is done; while Discord cannot be asked, 503; 429
+ * past `SAVES_PER_ADDRESS_MINUTE` of an address or `REGION_CHECK_THROTTLE` of a member.
  */
 export function editorRoutes(scope: FastifyInstance, deps: WebDeps): void {
   const dataLimiter = new RateLimiter({ uses: EDIT_DATA_PER_MINUTE, perMs: 60_000 });
@@ -77,4 +112,54 @@ export function editorRoutes(scope: FastifyInstance, deps: WebDeps): void {
       return reply.type('application/json; charset=utf-8').send(view.body);
     },
   );
+
+  // Preview and save (spec 4.5): POSTs of the editor's page, up to 2 MB, for the server's staff
+  // as Discord has them now. Before the body is read (`onRequest`): at most
+  // `SAVES_PER_ADDRESS_MINUTE` from one address, the guard of every POST (`postGuard`), and the
+  // member's throttle (`REGION_CHECK_THROTTLE`: each may cut outlines for seconds), so that a
+  // request refused never has its 2 MB read. Then Discord is asked who is staff.
+  const addressLimiter = new RateLimiter({ uses: SAVES_PER_ADDRESS_MINUTE, perMs: 60_000 });
+  const throttles = new Throttles();
+  const memberThrottle = async (request: FastifyRequest, reply: FastifyReply) => {
+    const session = await deps.sessions.of(request, reply);
+    if (!session) return sendFailure(request, reply, 403);
+    const wait = throttles.use('region edit', session.userId, REGION_CHECK_THROTTLE, deps.now());
+    if (wait === undefined) return;
+    void reply.header('retry-after', String(wait));
+    return sendFailure(request, reply, 429);
+  };
+  const checks = new SaveChecks(deps.editor.editing.checker, deps.now);
+  const saving =
+    (what: 'preview' | 'save') => async (request: GuildRequest, reply: FastifyReply) => {
+      void reply.header('cache-control', 'no-store');
+      const viewer = await editorViewer(request, reply, deps);
+      switch (viewer.kind) {
+        case 'logged-out':
+          return sendFailure(request, reply, 401);
+        case 'not-member':
+        case 'not-staff':
+          return sendFailure(request, reply, 403);
+        case 'unknown-server':
+          return sendFailure(request, reply, 503);
+        case 'unreachable':
+          return reply.code(503).send({ error: UNREACHABLE });
+        case 'staff':
+          break;
+      }
+      const body = saveRequestSchema.safeParse(request.body);
+      if (!body.success) return sendFailure(request, reply, 400);
+      const run = what === 'preview' ? previewSave : carryOutSave;
+      const answer = await run(deps.editor.editing, viewer.staff, body.data, checks);
+      return reply.code(SAVE_STATUS[answer.kind]).send(answer);
+    };
+  const options = {
+    bodyLimit: SAVE_BODY_LIMIT,
+    onRequest: [
+      limitedPerAddress(addressLimiter, { now: deps.now }),
+      postGuard(deps.sessions, deps.settings.publicUrl),
+      memberThrottle,
+    ],
+  };
+  scope.post<{ Params: { guild: string } }>('/api/regions/preview', options, saving('preview'));
+  scope.post<{ Params: { guild: string } }>('/api/regions/save', options, saving('save'));
 }
diff --git a/src/web/editor-save.test.ts b/src/web/editor-save.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..926d419e55ee561afcf2b4fbde0d55b5ca786db7
--- /dev/null
+++ b/src/web/editor-save.test.ts
@@ -0,0 +1,564 @@
+import { Readable } from 'node:stream';
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { SOUTH_CHANNEL, squareRing } from '../../test/support/region-admin.js';
+import { Tally } from '../../test/support/tally.js';
+import {
+  FakeRegionStaff,
+  regionEditingWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import type { LatLon } from '../domain/geo/lat-lon.js';
+import { regionVersion } from '../domain/regions/version.js';
+import type { Point, SaveAnswer, SaveRequest } from '../domain/web/editor-data.js';
+import type { AdminLock } from '../services/admin-lock.js';
+import { inThisThread, type SaveChecker } from './save-check.js';
+
+const PREVIEW = `/s/${FAKE_GUILD_ID}/api/regions/preview`;
+const SAVE = `/s/${FAKE_GUILD_ID}/api/regions/save`;
+const STAFF = '700000000000000001';
+
+const points = (ring: LatLon[]): Point[] => ring.map(({ lat, lon }) => [lat, lon]);
+const WEST = squareRing(40.0, -80.1, 40.1, -80.0);
+const EAST = squareRing(40.0, -80.0, 40.1, -79.9);
+/** West without its eastern strip: the Bridge (gym 4, -80.01) falls out of it. */
+const WEST_SHRUNK = squareRing(40.0, -80.1, 40.1, -80.02);
+
+const request = (more: Partial<SaveRequest>): SaveRequest => ({
+  changes: [],
+  additions: [],
+  removals: [],
+  ...more,
+});
+
+describe('preview and save of the region editor', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  async function made(staff = new FakeRegionStaff().asStaff(STAFF), checker?: SaveChecker) {
+    const editing = await regionEditingWith();
+    const server = webServerWith({
+      staff,
+      editing: checker ? { ...editing.editing, checker } : editing.editing,
+    });
+    web = server;
+    const headers = await server.posting(STAFF, 'Brock');
+    const post = async (url: string, body: SaveRequest | string) => {
+      const answer = await server.app.inject({
+        method: 'POST',
+        url,
+        headers: { ...headers, 'content-type': 'application/json' },
+        payload: typeof body === 'string' ? body : JSON.stringify(body),
+      });
+      return { status: answer.statusCode, json: answer.json<SaveAnswer & { error?: string }>() };
+    };
+    return { web: server, editing, post, headers };
+  }
+
+  it("previews a new outline in /region import's words, and changes nothing", async () => {
+    const { post, editing } = await made();
+    const answer = await post(
+      PREVIEW,
+      request({
+        changes: [
+          { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
+        ],
+      }),
+    );
+    expect(answer.status).toBe(200);
+    expect(answer.json).toEqual({
+      kind: 'preview',
+      changes: true,
+      worded: {
+        lines: [
+          'Saving would give 1 new outline. Nothing is changed yet.',
+          '1 gym would then lie in no region of this server any more: no raid can be reported ' +
+            'there.',
+        ],
+        lists: [
+          {
+            title: 'Would be imported',
+            items: [
+              'west → #west · new outline · 7 gyms (8 before) · 1 gym would lie in no region ' +
+                'of this server any more',
+            ],
+          },
+        ],
+      },
+    });
+    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST);
+  });
+
+  it('saves it, and says so region by region; the log has numbers, never names', async () => {
+    const { post, editing } = await made();
+    const answer = await post(
+      SAVE,
+      request({
+        changes: [
+          { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
+        ],
+      }),
+    );
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({
+      kind: 'saved',
+      worded: {
+        lines: ['Imported 1 region.'],
+        lists: [{ title: 'Imported', items: ['#west · new outline · 7 gyms'] }],
+      },
+    });
+    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST_SHRUNK);
+    const logged = editing.entries.find(
+      (entry) => entry.msg === 'regions were saved in the web editor',
+    );
+    expect(logged).toMatchObject({ staff: STAFF, guild: 1, changes: 1, imported: 1 });
+    expect(JSON.stringify(logged)).not.toContain('west');
+  });
+
+  it('makes a new region of a channel, and of a new channel in the category it names', async () => {
+    const { post, editing } = await made();
+    const answer = await post(
+      SAVE,
+      request({
+        additions: [
+          {
+            channel: { id: SOUTH_CHANNEL },
+            description: null,
+            outline: points(squareRing(39.9, -80.1, 40.0, -80.0)),
+          },
+          {
+            channel: { name: 'North Hills' },
+            description: 'Suburbs',
+            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
+          },
+        ],
+      }),
+    );
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({
+      kind: 'saved',
+      worded: {
+        lines: [
+          'Imported 2 regions, and created 1 channel for them.',
+          'Created 1 category: Suburbs.',
+        ],
+      },
+    });
+    expect(editing.regions.rows.map((region) => region.channelId)).toContain(SOUTH_CHANNEL);
+    expect(editing.regions.rows).toHaveLength(5);
+  });
+
+  it('removes a region, keeping or deleting its forum, with what goes with it', async () => {
+    const { post, editing } = await made();
+    const removal = request({
+      removals: [{ regionId: 2, forum: 'keep', version: regionVersion(EAST, null) }],
+    });
+    const preview = await post(PREVIEW, removal);
+    expect(preview.json).toMatchObject({
+      kind: 'preview',
+      changes: true,
+      worded: {
+        lines: ['Saving would remove 1 region. Nothing is changed yet.'],
+        lists: [
+          {
+            title: 'Would be removed',
+            items: [
+              '#east · 3 gyms will lie in no region of this server: no raid can be reported ' +
+                'there until a region covers them · its forum #east-raids stays as history',
+            ],
+          },
+        ],
+      },
+    });
+    const saved = await post(SAVE, removal);
+    expect(saved.json).toMatchObject({
+      kind: 'saved',
+      worded: {
+        lists: [
+          { title: 'Removals', items: [expect.stringMatching(/^Removed the region #east\./u)] },
+        ],
+      },
+    });
+    expect(editing.regions.rows.map((region) => region.id)).toEqual([1, 3]);
+  });
+
+  it('refuses a region changed since the page loaded it, showing it as it is now', async () => {
+    const { post, editing } = await made();
+    const answer = await post(
+      SAVE,
+      request({
+        changes: [{ regionId: 1, outline: points(WEST_SHRUNK), version: 'AAAAAAAAAAAAAAAA' }],
+        removals: [{ regionId: 9, forum: 'keep', version: 'AAAAAAAAAAAAAAAA' }],
+      }),
+    );
+    expect(answer.status).toBe(409);
+    expect(answer.json).toEqual({
+      kind: 'conflicts',
+      conflicts: [
+        {
+          regionId: 1,
+          theirs: expect.objectContaining({
+            id: 1,
+            name: 'west',
+            outline: points(WEST),
+            version: regionVersion(WEST, null),
+          }) as unknown,
+        },
+        { regionId: 9, theirs: null },
+      ],
+    });
+    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST);
+  });
+
+  it('refuses a new overlap or gap, and an outline that crosses itself', async () => {
+    const { post } = await made();
+    const overlapping = squareRing(40.0, -80.1, 40.1, -79.99);
+    const overlap = await post(
+      PREVIEW,
+      request({
+        changes: [
+          { regionId: 1, outline: points(overlapping), version: regionVersion(WEST, null) },
+        ],
+      }),
+    );
+    expect(overlap.status).toBe(422);
+    expect(overlap.json).toEqual({
+      kind: 'refused',
+      lines: [
+        expect.stringMatching(
+          /^Saving would make a new overlap of [\d,]+ m² between #west and #east\.$/u,
+        ) as unknown,
+      ],
+    });
+    const crossing: Point[] = [
+      [40, -80.1],
+      [40.1, -80],
+      [40.1, -80.1],
+      [40, -80],
+      [40, -80.1],
+    ];
+    const crossed = await post(
+      PREVIEW,
+      request({
+        changes: [{ regionId: 1, outline: crossing, version: regionVersion(WEST, null) }],
+      }),
+    );
+    expect(crossed.json).toEqual({
+      kind: 'refused',
+      lines: ['The outline of #west crosses or touches itself.'],
+    });
+  });
+
+  it('refuses to delete a forum for a staff member who may not manage channels', async () => {
+    const { post } = await made(new FakeRegionStaff().asStaff(STAFF, false));
+    const answer = await post(
+      PREVIEW,
+      request({ removals: [{ regionId: 2, forum: 'delete', version: regionVersion(EAST, null) }] }),
+    );
+    expect(answer.json).toEqual({
+      kind: 'refused',
+      lines: [
+        'Deleting the forum of a region takes the Manage Channels permission, which you lack.',
+      ],
+    });
+  });
+
+  it("is for staff, from Pine's own page, with a body it can read", async () => {
+    const OTHER = '700000000000000002';
+    const staff = new FakeRegionStaff().asStaff(STAFF).answer(OTHER, { kind: 'not-staff' });
+    const { web, post, headers } = await made(staff);
+    const other = await web.posting(OTHER, 'Misty');
+    const body = JSON.stringify(request({}));
+    const refused = await web.app.inject({
+      method: 'POST',
+      url: SAVE,
+      headers: { ...other, 'content-type': 'application/json' },
+      payload: body,
+    });
+    expect(refused.statusCode).toBe(403);
+    const noToken = await web.app.inject({
+      method: 'POST',
+      url: SAVE,
+      headers: {
+        cookie: headers.cookie ?? '',
+        origin: headers.origin ?? '',
+        'content-type': 'application/json',
+      },
+      payload: body,
+    });
+    expect(noToken.statusCode).toBe(403);
+    expect((await post(SAVE, '{"changes":[],"additions":[]}')).status).toBe(400);
+    expect((await post(SAVE, request({}))).json).toEqual({
+      kind: 'refused',
+      lines: ['There is nothing to save.'],
+    });
+    const huge = JSON.stringify({ ...request({}), padding: 'x'.repeat(2 * 1024 * 1024) });
+    expect((await post(SAVE, huge)).status).toBe(413);
+    // A large outline fits: 4,000 corners on a circle inside west.
+    const circle = Array.from({ length: 4_000 }, (_unused, i): Point => [
+      Number((40.05 + 0.04 * Math.sin((2 * Math.PI * i) / 4_000)).toFixed(6)),
+      Number((-80.05 + 0.04 * Math.cos((2 * Math.PI * i) / 4_000)).toFixed(6)),
+    ]);
+    const big = await post(
+      PREVIEW,
+      request({
+        changes: [
+          { regionId: 1, outline: [...circle, circle[0]!], version: regionVersion(WEST, null) },
+        ],
+      }),
+    );
+    expect(big.status).toBe(200);
+  });
+
+  it('saves nothing while Discord cannot say who is asking', async () => {
+    const staff = new FakeRegionStaff();
+    staff.failing = new Error('Discord is away');
+    const { post, editing } = await made(staff);
+    const answer = await post(
+      SAVE,
+      request({ removals: [{ regionId: 2, forum: 'keep', version: regionVersion(EAST, null) }] }),
+    );
+    expect(answer.status).toBe(503);
+    expect(answer.json).toEqual({
+      error: 'Discord cannot be reached just now, so nothing can be saved. Try again in a moment.',
+    });
+    expect(editing.regions.rows).toHaveLength(3);
+  });
+
+  it('counts previews and saves against a throttle of their own, six a minute per member', async () => {
+    const { post, web } = await made();
+    for (let i = 0; i < 6; i += 1) {
+      expect((await post(i % 2 === 0 ? PREVIEW : SAVE, request({}))).status).toBe(422);
+    }
+    expect((await post(PREVIEW, request({}))).status).toBe(429);
+    web.clock.now += 60_000;
+    expect((await post(PREVIEW, request({}))).status).toBe(422);
+  });
+
+  it('refuses a new channel named as a channel the server has, region or not', async () => {
+    const { post, editing } = await made();
+    const outline = points(squareRing(39.9, -80.1, 40.0, -80.0));
+    const answer = await post(
+      SAVE,
+      request({
+        additions: [
+          { channel: { name: 'South' }, description: null, outline },
+          { channel: { name: '#West' }, description: null, outline },
+        ],
+      }),
+    );
+    expect(answer.json).toEqual({
+      kind: 'refused',
+      lines: [
+        '#south exists: pick it from the list for the new region South.',
+        '#west exists already: pick another name for the new region #West.',
+      ],
+    });
+    expect(editing.regions.rows).toHaveLength(3);
+  });
+
+  it('saves one of two saves of the same version started together; the other is a conflict', async () => {
+    const { post, editing } = await made();
+    let release: () => void = () => undefined;
+    const held = editing.lock.run(
+      () =>
+        new Promise<void>((resolve) => {
+          release = resolve;
+        }),
+    );
+    const reached = lockReached(editing.lock, 2);
+    const version = regionVersion(WEST, null);
+    const first = post(
+      SAVE,
+      request({ changes: [{ regionId: 1, outline: points(WEST_SHRUNK), version }] }),
+    );
+    const second = post(
+      SAVE,
+      request({
+        changes: [{ regionId: 1, outline: points(squareRing(40.0, -80.1, 40.1, -80.03)), version }],
+      }),
+    );
+    await reached;
+    release();
+    await held;
+    const answers = await Promise.all([first, second]);
+    expect(answers.map((answer) => answer.status)).toEqual([200, 409]);
+    expect(answers[1]?.json).toMatchObject({
+      kind: 'conflicts',
+      conflicts: [{ regionId: 1, theirs: { outline: points(WEST_SHRUNK) } }],
+    });
+    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST_SHRUNK);
+  });
+
+  it('creates nothing for a region removed while its save waited', async () => {
+    const { post, editing } = await made();
+    let release: () => void = () => undefined;
+    const held = editing.lock.run(
+      () =>
+        new Promise<void>((resolve) => {
+          release = resolve;
+        }),
+    );
+    const reached = lockReached(editing.lock, 1);
+    const saving = post(
+      SAVE,
+      request({
+        changes: [
+          { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
+        ],
+      }),
+    );
+    await reached;
+    // Removed meanwhile, as /region remove leaves it: its channel is no region any more.
+    editing.regions.rows = editing.regions.rows.filter((region) => region.id !== 1);
+    release();
+    await held;
+    const answer = await saving;
+    expect(answer.status).toBe(409);
+    expect(answer.json).toEqual({ kind: 'conflicts', conflicts: [{ regionId: 1, theirs: null }] });
+    expect(editing.regions.rows.map((region) => region.id)).toEqual([2, 3]);
+  });
+
+  it('refuses what is too complex to check', async () => {
+    const { post } = await made(undefined, {
+      check: () => Promise.resolve({ kind: 'too-complex' }),
+    });
+    const answer = await post(
+      PREVIEW,
+      request({
+        changes: [
+          { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
+        ],
+      }),
+    );
+    expect(answer.status).toBe(422);
+    expect(answer.json).toEqual({
+      kind: 'refused',
+      lines: ['Too complex to check: simplify the outlines.'],
+    });
+  });
+
+  it('checks a save that was previewed, unchanged, only once', async () => {
+    const checks = new Tally();
+    const { post, editing } = await made(undefined, {
+      check: (before, after) => {
+        checks.add();
+        return inThisThread.check(before, after);
+      },
+    });
+    const change = (outline: LatLon[], from = WEST) =>
+      request({
+        changes: [{ regionId: 1, outline: points(outline), version: regionVersion(from, null) }],
+      });
+    expect((await post(PREVIEW, change(WEST_SHRUNK))).status).toBe(200);
+    expect((await post(SAVE, change(WEST_SHRUNK))).status).toBe(200);
+    expect(checks.count).toBe(1);
+    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST_SHRUNK);
+    // Another body is checked; again, it is not.
+    const smaller = squareRing(40.0, -80.1, 40.1, -80.03);
+    expect((await post(PREVIEW, change(smaller, WEST_SHRUNK))).status).toBe(200);
+    expect((await post(PREVIEW, change(smaller, WEST_SHRUNK))).status).toBe(200);
+    expect(checks.count).toBe(2);
+  });
+
+  it('never reads the body of a request it refuses, and limits each address', async () => {
+    const { web, headers } = await made();
+    let read = false;
+    const body = (): Readable =>
+      new Readable({
+        read() {
+          read = true;
+          this.push(JSON.stringify(request({})));
+          this.push(null);
+        },
+      });
+    const noToken = await web.app.inject({
+      method: 'POST',
+      url: SAVE,
+      headers: { cookie: headers.cookie ?? '', 'content-type': 'application/json' },
+      payload: body(),
+    });
+    expect(noToken.statusCode).toBe(403);
+    expect(read).toBe(false);
+    for (let i = 0; i < 29; i += 1) {
+      await web.app.inject({ method: 'POST', url: PREVIEW, payload: body() });
+    }
+    const limited = await web.app.inject({ method: 'POST', url: PREVIEW, payload: body() });
+    expect(limited.statusCode).toBe(429);
+    expect(read).toBe(false);
+  });
+
+  it('says which removal failed, and still answers and logs the rest', async () => {
+    const { post, editing } = await made();
+    const closeRegion = editing.store.closeRegion.bind(editing.store);
+    editing.store.closeRegion = (regionId: number) =>
+      regionId === 2 ? Promise.reject(new Error('the database is away')) : closeRegion(regionId);
+    const answer = await post(
+      SAVE,
+      request({
+        changes: [
+          { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
+        ],
+        removals: [{ regionId: 2, forum: 'keep', version: regionVersion(EAST, null) }],
+      }),
+    );
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({
+      kind: 'saved',
+      worded: {
+        lines: ['Imported 1 region.'],
+        lists: [
+          { title: 'Imported' },
+          {
+            title: 'Removals',
+            items: [
+              'I could not remove the region #east (the log says what failed): look at the ' +
+                'regions and try again.',
+            ],
+          },
+        ],
+      },
+    });
+    expect(editing.entries.map((entry) => entry.msg)).toEqual(
+      expect.arrayContaining([
+        'could not remove a region in the web editor',
+        'regions were saved in the web editor',
+      ]),
+    );
+  });
+
+  it("says in the server's audit log that the region editor made and deleted channels", async () => {
+    const { post, editing } = await made();
+    await post(
+      SAVE,
+      request({
+        additions: [
+          {
+            channel: { name: 'North Hills' },
+            description: 'Suburbs',
+            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
+          },
+        ],
+        removals: [{ regionId: 2, forum: 'delete', version: regionVersion(EAST, null) }],
+      }),
+    );
+    const reasons = [...editing.gateway.auditReasons.values()];
+    expect(reasons).toHaveLength(3);
+    expect(new Set(reasons)).toEqual(new Set([`region editor by ${STAFF}`]));
+  });
+});
+
+/** Resolves once the lock was asked for `times` more times (by the service, under test). */
+function lockReached(lock: AdminLock, times: number): Promise<void> {
+  const asked = new Tally();
+  const run = lock.run.bind(lock);
+  lock.run = <T>(work: () => T | Promise<T>): Promise<T> => {
+    asked.add();
+    return run(work);
+  };
+  return asked.reached(times);
+}
diff --git a/src/web/editor-save.ts b/src/web/editor-save.ts
new file mode 100644
index 0000000000000000000000000000000000000000..45db1fe8b3ee5e1973117c6a2035ea4c1f59bb19
--- /dev/null
+++ b/src/web/editor-save.ts
@@ -0,0 +1,421 @@
+import { createHash } from 'node:crypto';
+import { z } from 'zod';
+import {
+  leftOutLine,
+  outcomeWords,
+  plainWords,
+  previewWords,
+  type ImportList,
+} from '../commands/regions/import.js';
+import { goesWith, outcomeLines } from '../commands/regions/remove.js';
+import { REGION_GONE, regionInSentence, roleReminder } from '../commands/regions/shared.js';
+import type { Region } from '../db/repositories/region-repository.js';
+import { MAX_KML_AREAS, MAX_KML_CORNERS } from '../domain/geo/kml.js';
+import { MAX_OUTLINE_CORNERS } from '../domain/geo/outline.js';
+import type { Piece } from '../domain/regions/coverage.js';
+import type { ServerChannel } from '../domain/regions/region-import.js';
+import { planSave, type SavePlan, type SaveProblem } from '../domain/regions/save-plan.js';
+import { regionVersion } from '../domain/regions/version.js';
+import type { SaveAnswer, SaveRequest, Worded } from '../domain/web/editor-data.js';
+import { editorView } from '../domain/web/editor-view.js';
+import type { Logger } from '../log.js';
+import { count } from '../render/text.js';
+import {
+  importSummary,
+  type ImportPreview,
+  type RegionAdminService,
+  type RegionStaff,
+} from '../services/region-admin-service.js';
+import type { SaveChecker, SaveChecks } from './save-check.js';
+
+/** The largest body of a preview or a save of the region editor (spec 5). */
+export const SAVE_BODY_LIMIT = 2 * 1024 * 1024;
+
+const point = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
+const outline = z
+  .array(point)
+  .min(3)
+  .max(MAX_OUTLINE_CORNERS + 1);
+const version = z.string().regex(/^[A-Za-z0-9_-]{16}$/u);
+const regionId = z.number().int().positive();
+
+/**
+ * What a preview or a save takes (`SaveRequest`): at most `MAX_KML_AREAS` of each kind and
+ * `MAX_KML_CORNERS` corners in all, as a file of `/region import` may have.
+ */
+export const saveRequestSchema = z
+  .strictObject({
+    changes: z.array(z.strictObject({ regionId, outline, version })).max(MAX_KML_AREAS),
+    additions: z
+      .array(
+        z.strictObject({
+          channel: z.union([
+            z.strictObject({ id: z.string().regex(/^\d{15,20}$/u) }),
+            z.strictObject({ name: z.string().trim().min(1).max(100) }),
+          ]),
+          description: z.string().max(200).nullable(),
+          outline,
+        }),
+      )
+      .max(MAX_KML_AREAS),
+    removals: z
+      .array(z.strictObject({ regionId, forum: z.enum(['keep', 'delete']), version }))
+      .max(MAX_KML_AREAS),
+  })
+  .refine(
+    (request) =>
+      [...request.changes, ...request.additions].reduce(
+        (sum, one) => sum + one.outline.length,
+        0,
+      ) <=
+      MAX_KML_CORNERS + 2 * MAX_KML_AREAS,
+  );
+
+/** What preview and save need (plan 8M-2): the region administration `/region` uses. */
+export interface RegionEditing {
+  /** Every region, of any server, as loaded now (`RegionDirectory`). */
+  regions: { all(): readonly Region[] };
+  admin: Pick<
+    RegionAdminService,
+    'preview' | 'save' | 'removalQuestion' | 'channelsOf' | 'orphanForums'
+  >;
+  /**
+   * What works out the new overlaps and gaps of a save: off the bot's thread (`SaveCheckWorker`)
+   * in the bot, on it in tests (`inThisThread`).
+   */
+  checker: SaveChecker;
+  /** Whether members give themselves roles (`settings.features.roles`): the reminders say so. */
+  selfRoles: boolean;
+  log: Logger;
+}
+
+/** A square metre count as the answers write it: "1,234 m²". */
+const squareMetres = (area: number): string => `${Math.round(area).toLocaleString('en-US')} m²`;
+
+/** How an outline problem reads in a sentence. */
+function outlineProblemText(problem: Extract<SaveProblem, { kind: 'outline' }>['problem']): string {
+  switch (problem.kind) {
+    case 'not-a-number':
+    case 'out-of-range':
+      return 'has a corner that is no place on earth';
+    case 'too-few':
+      return 'has fewer than three corners';
+    case 'too-many':
+      return `has ${problem.corners} corners, more than the ${MAX_OUTLINE_CORNERS} I take`;
+    case 'crosses-itself':
+      return 'crosses or touches itself';
+  }
+}
+
+/** The names of what a save is about: regions by their channels, additions by their names. */
+class SaveNames {
+  constructor(
+    private readonly regions: ReadonlyMap<number, Region>,
+    private readonly channels: readonly ServerChannel[],
+    private readonly request: SaveRequest,
+  ) {}
+
+  region(id: number): string {
+    const region = this.regions.get(id);
+    const channel = region && this.channels.find((one) => one.id === region.channelId);
+    return channel ? `#${channel.name}` : `region ${id}`;
+  }
+
+  addition(index: number): string {
+    const addition = this.request.additions[index];
+    if (!addition) return 'a new region';
+    if ('name' in addition.channel) return `the new region ${addition.channel.name}`;
+    const { id } = addition.channel;
+    const channel = this.channels.find((one) => one.id === id);
+    return `the new region #${channel?.name ?? id}`;
+  }
+
+  /** A key of `SavePlan.before` / `after`: `r<id>` or `a<index>`. */
+  key(key: string): string {
+    const n = Number(key.slice(1));
+    return key.startsWith('r') ? this.region(n) : this.addition(n);
+  }
+}
+
+/** Why a save cannot be done, as a sentence. */
+function problemLine(problem: SaveProblem, names: SaveNames): string {
+  switch (problem.kind) {
+    case 'twice':
+      return `${names.region(problem.regionId)} is changed twice in one save. Reload the page.`;
+    case 'channel-gone':
+      return (
+        `The channel of ${names.region(problem.regionId)} is gone, so its outline cannot be ` +
+        'changed here: remove the region instead.'
+      );
+    case 'outline':
+      return `The outline of ${
+        'regionId' in problem.target
+          ? names.region(problem.target.regionId)
+          : names.addition(problem.target.addition)
+      } ${outlineProblemText(problem.problem)}.`;
+    case 'already-region':
+      return `#${problem.name} is a region already: pick another channel for ${names.addition(problem.addition)}.`;
+    case 'not-a-channel':
+      return `The channel of ${names.addition(problem.addition)} is no text channel of this server any more: pick another.`;
+    case 'no-name':
+      return `The name of ${names.addition(problem.addition)} gives no channel name: use letters or digits.`;
+    case 'channel-exists':
+      return problem.listed
+        ? `#${problem.name} exists: pick it from the list for ${names.addition(problem.addition)}.`
+        : `#${problem.name} exists already: pick another name for ${names.addition(problem.addition)}.`;
+  }
+}
+
+/** What a save answers when its overlaps and gaps would take too long to work out. */
+const TOO_COMPLEX = 'Too complex to check: simplify the outlines.';
+
+/**
+ * What the check of a save is of: the request and the versions of the server's regions it is
+ * checked against (`SaveChecks` keeps verdicts by it), as a hash.
+ */
+function checkKey(staff: RegionStaff, request: SaveRequest, regions: readonly Region[]): string {
+  const versions = regions
+    .filter((region) => region.guildId === staff.guildId)
+    .map((region) => [region.id, regionVersion(region.bounds, region.description)]);
+  return createHash('sha256')
+    .update(JSON.stringify([staff.guildId, request, versions]))
+    .digest('base64url');
+}
+
+/** The 409 of a save: the regions changed or removed meanwhile, as they are now. */
+function conflictAnswer(
+  regions: readonly Region[],
+  staff: RegionStaff,
+  channels: readonly ServerChannel[],
+  conflicts: readonly { regionId: number; gone: boolean }[],
+): SaveAnswer {
+  const theirs = editorView({
+    guildRow: staff.guildId,
+    regions: regions.filter((region) => conflicts.some((one) => one.regionId === region.id)),
+    channels,
+    gyms: [],
+    regionsOf: () => [],
+    wayspots: [],
+  }).regions;
+  return {
+    kind: 'conflicts',
+    conflicts: conflicts.map(({ regionId, gone }) => ({
+      regionId,
+      theirs: gone ? null : (theirs.find((one) => one.id === regionId) ?? null),
+    })),
+  };
+}
+
+/** The middle of a piece, as a place to name. */
+const near = (piece: Piece): string =>
+  `${((piece.box.south + piece.box.north) / 2).toFixed(5)}, ` +
+  `${((piece.box.west + piece.box.east) / 2).toFixed(5)}`;
+
+/** What a save looked at, when it may be done. */
+interface Prepared {
+  plan: SavePlan;
+  preview: ImportPreview;
+  channels: ServerChannel[];
+  names: SaveNames;
+  regions: ReadonlyMap<number, Region>;
+}
+
+/**
+ * Everything a preview and a save check, in this order (the page is never trusted): the regions
+ * changed or removed must be as the page loaded them (else `conflicts`, with how they are now),
+ * the outlines and channels must be what `/region import` takes, deleting a forum takes Manage
+ * Channels, there must be something to do, and no new overlap or gap may come of it (as the
+ * page shades them; worked out off the bot's thread, `SaveChecks`: one too complex to work out
+ * in time is refused, a failure to compute it is logged and does not block). Then the preview
+ * of `RegionAdminService`, with the removals.
+ */
+async function prepare(
+  editing: RegionEditing,
+  staff: RegionStaff,
+  request: SaveRequest,
+  checks: SaveChecks,
+): Promise<{ answer: SaveAnswer } | Prepared> {
+  const { admin, log } = editing;
+  const all = editing.regions.all();
+  const regions = new Map(all.map((region) => [region.id, region]));
+  const channels = admin.channelsOf(staff);
+  const plan = planSave(request, { guildId: staff.guildId, regions: all, channels });
+  const names = new SaveNames(regions, channels, request);
+  if (plan.conflicts.length > 0) {
+    return { answer: conflictAnswer(all, staff, channels, plan.conflicts) };
+  }
+  const refused = plan.problems.map((problem) => problemLine(problem, names));
+  if (!staff.mayManageChannels && plan.removals.some((removal) => removal.forum === 'delete')) {
+    refused.push(
+      'Deleting the forum of a region takes the Manage Channels permission, which you lack.',
+    );
+  }
+  if (refused.length === 0 && plan.areas.length === 0 && plan.removals.length === 0) {
+    refused.push('There is nothing to save.');
+  }
+  if (refused.length === 0) {
+    const verdict = await checks.check(checkKey(staff, request, all), plan.before, plan.after);
+    if (verdict.kind === 'too-complex') {
+      refused.push(TOO_COMPLEX);
+    } else if (verdict.kind === 'failed') {
+      log.warn(
+        { err: verdict.err, guild: staff.guildId },
+        'could not check a save for new overlaps and gaps',
+      );
+    } else {
+      for (const overlap of verdict.coverage.overlaps) {
+        refused.push(
+          `Saving would make a new overlap of ${squareMetres(overlap.area)} between ` +
+            `${names.key(overlap.between[0])} and ${names.key(overlap.between[1])}.`,
+        );
+      }
+      for (const gap of verdict.coverage.gaps) {
+        refused.push(
+          `Saving would make a new gap of ${squareMetres(gap.area)} between regions, around ` +
+            `${near(gap)}.`,
+        );
+      }
+    }
+  }
+  if (refused.length > 0) return { answer: { kind: 'refused', lines: refused } };
+  const orphans = await admin.orphanForums(staff).catch((err: unknown) => {
+    log.warn({ err }, 'could not list the forums that parties name');
+    return [];
+  });
+  const preview = admin.preview(
+    staff,
+    plan.areas,
+    undefined,
+    orphans,
+    plan.removals.map((removal) => removal.regionId),
+  );
+  return { plan, preview, channels, names, regions };
+}
+
+const channelNamesOf = (channels: readonly ServerChannel[]): Map<string, string> =>
+  new Map(channels.map((channel) => [channel.id, channel.name]));
+
+/**
+ * What a save of the region editor would do (spec 4.5): `/region import`'s preview of the new
+ * and changed outlines, in its words but for the file, and the regions it would remove with what
+ * goes with each. Nothing is changed.
+ */
+export async function previewSave(
+  editing: RegionEditing,
+  staff: RegionStaff,
+  request: SaveRequest,
+  checks: SaveChecks,
+): Promise<SaveAnswer> {
+  const prepared = await prepare(editing, staff, request, checks);
+  if ('answer' in prepared) return prepared.answer;
+  const { plan, preview, channels, names } = prepared;
+  const words =
+    plan.areas.length > 0
+      ? previewWords(preview, [], 0, false, 'editor')
+      : { lines: [], lists: [] as ImportList[] };
+  const removed: string[] = [];
+  for (const removal of plan.removals) {
+    const question = await editing.admin.removalQuestion(removal.regionId, staff);
+    if (!question) continue;
+    const forumId = question.forum === 'there' ? question.region.forumChannelId : null;
+    const forum =
+      forumId === null
+        ? []
+        : removal.forum === 'delete'
+          ? [`its forum <#${forumId}> is deleted, with every post in it`]
+          : [`its forum <#${forumId}> stays as history`];
+    const going = goesWith(question, 'will').map((line) => line.replace(/^- /u, ''));
+    removed.push(
+      `- ${names.region(removal.regionId)}` +
+        [...going, ...forum].map((part) => ` · ${part}`).join(''),
+    );
+  }
+  const lines =
+    plan.areas.length === 0
+      ? [`Saving would remove ${count(removed.length, 'region')}. Nothing is changed yet.`]
+      : removed.length > 0
+        ? [...words.lines, `It would also remove ${count(removed.length, 'region')}.`]
+        : words.lines;
+  const worded: Worded = plainWords(
+    lines,
+    [...words.lists, { title: 'Would be removed', items: removed, room: 0 }],
+    channelNamesOf(channels),
+  );
+  return {
+    kind: 'preview',
+    worded,
+    changes: preview.imports.length > 0 || plan.removals.length > 0,
+  };
+}
+
+/**
+ * Saves what the region editor sends (spec 4.5), everything checked again as for the preview
+ * (the overlaps and gaps of what was just previewed are not worked out again: `SaveChecks`),
+ * then `RegionAdminService.save` of the outlines the plan takes and the regions to remove, in
+ * one run under the admin lock, which first looks again whether the regions are still as the
+ * page loaded them (else nothing is done and the answer is the conflicts, as above). The answer
+ * says what was done region by region in `/region import`'s and `/region remove`'s words; areas
+ * left out of the plan are among "Not imported", a removal that failed is said. Logged as a
+ * command is: who, which server, how many; never a name.
+ */
+export async function carryOutSave(
+  editing: RegionEditing,
+  staff: RegionStaff,
+  request: SaveRequest,
+  checks: SaveChecks,
+): Promise<SaveAnswer> {
+  const prepared = await prepare(editing, staff, request, checks);
+  if ('answer' in prepared) return prepared.answer;
+  const { plan, preview, regions } = prepared;
+  const { admin, log } = editing;
+  const done = await admin.save(staff, preview.imports, plan.removals, () => {
+    const now = { guildId: staff.guildId, regions: editing.regions.all() };
+    return planSave(request, { ...now, channels: admin.channelsOf(staff) }).conflicts;
+  });
+  if (done.kind === 'changed') {
+    return conflictAnswer(editing.regions.all(), staff, admin.channelsOf(staff), done.changed);
+  }
+  const outcome = done.imported;
+  const removedLines: string[] = [];
+  let removed = 0;
+  for (const { regionId, outcome: removal } of done.removed) {
+    const region = regions.get(regionId);
+    const label = region ? regionInSentence(region, admin.channelsOf(staff)) : 'that region';
+    if (removal.kind === 'removed') removed++;
+    const lines =
+      removal.kind === 'gone'
+        ? [REGION_GONE]
+        : removal.kind === 'error'
+          ? [
+              `I could not remove ${label} (the log says what failed): look at the regions and try again.`,
+            ]
+          : outcomeLines(removal, label, roleReminder(editing.selfRoles, 'removed'));
+    removedLines.push(`- ${lines.join(' ')}`);
+  }
+  log.info(
+    {
+      staff: staff.staffId,
+      guild: staff.guildId,
+      changes: request.changes.length,
+      additions: request.additions.length,
+      removals: request.removals.length,
+      removed,
+      ...(outcome ? importSummary(outcome) : {}),
+    },
+    'regions were saved in the web editor',
+  );
+  const words = outcome
+    ? outcomeWords(outcome, roleReminder(editing.selfRoles, 'new'))
+    : { lines: [], lists: [] as ImportList[] };
+  const leftOut = preview.leftOut.map((left) => leftOutLine(left));
+  const lists = words.lists.map((list) =>
+    list.title === 'Not imported' ? { ...list, items: [...list.items, ...leftOut] } : list,
+  );
+  if (!outcome && leftOut.length > 0)
+    lists.push({ title: 'Not imported', items: leftOut, room: 0 });
+  lists.push({ title: 'Removals', items: removedLines, room: 0 });
+  return {
+    kind: 'saved',
+    worded: plainWords(words.lines, lists, channelNamesOf(admin.channelsOf(staff))),
+  };
+}
diff --git a/src/web/save-check-thread.ts b/src/web/save-check-thread.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4cfe4e7395c5e3bd9474ab9d2770058c312ee0d9
--- /dev/null
+++ b/src/web/save-check-thread.ts
@@ -0,0 +1,28 @@
+import { parentPort, workerData } from 'node:worker_threads';
+import { newProblems, type Outlined } from '../domain/regions/coverage.js';
+
+/**
+ * The thread `SaveCheckWorker` starts for one check of a save of the region editor (plan 8M-2):
+ * `newProblems` of the outlines it is given (`workerData`), answered as one message, so that the
+ * bot's own thread never cuts outlines for seconds. Its time and memory are limited by the
+ * worker that started it.
+ */
+
+/** What the thread is given. */
+export interface SaveCheckJob {
+  before: readonly Outlined[];
+  after: readonly Outlined[];
+}
+
+/** What it answers: what `newProblems` found, or why it could not (a message alone). */
+export type SaveCheckReply =
+  { ok: true; coverage: ReturnType<typeof newProblems> } | { ok: false; message: string };
+
+const job = workerData as SaveCheckJob;
+let reply: SaveCheckReply;
+try {
+  reply = { ok: true, coverage: newProblems(job.before, job.after) };
+} catch (err) {
+  reply = { ok: false, message: err instanceof Error ? err.message : String(err) };
+}
+parentPort?.postMessage(reply);
diff --git a/src/web/save-check.test.ts b/src/web/save-check.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..63d4a20d07d331a9e7f47a7f5d2f80b90019e620
--- /dev/null
+++ b/src/web/save-check.test.ts
@@ -0,0 +1,83 @@
+import { fileURLToPath } from 'node:url';
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { squareRing } from '../../test/support/region-admin.js';
+import { Tally } from '../../test/support/tally.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { SaveCheckWorker, inThisThread, SaveChecks, type SaveChecker } from './save-check.js';
+
+const HANGING = fileURLToPath(new URL('../../test/support/hanging-thread.ts', import.meta.url));
+
+const WEST = { key: 'r1', outline: squareRing(40.0, -80.1, 40.1, -80.0) };
+const EAST = { key: 'r2', outline: squareRing(40.0, -80.0, 40.1, -79.9) };
+/** West grown into east: a new overlap. */
+const GROWN = { key: 'r1', outline: squareRing(40.0, -80.1, 40.1, -79.99) };
+
+describe('the check of a save in a thread of its own', () => {
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('works out the new overlaps and gaps as on the bot thread', async () => {
+    const worker = new SaveCheckWorker({ log: createTestLogger().log });
+    const verdict = await worker.check([WEST, EAST], [GROWN, EAST]);
+    expect(verdict.kind).toBe('checked');
+    const local = await inThisThread.check([WEST, EAST], [GROWN, EAST]);
+    expect(verdict).toEqual(local);
+    if (verdict.kind === 'checked') expect(verdict.coverage.overlaps).toHaveLength(1);
+  });
+
+  it('gives up on a check past its time limit, and runs one check at a time', async () => {
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    const worker = new SaveCheckWorker({ log: createTestLogger().log, file: HANGING });
+    const first = worker.check([WEST], [GROWN]);
+    const second = worker.check([WEST], [GROWN]);
+    // The second waits: one limit runs.
+    expect(vi.getTimerCount()).toBe(1);
+    await vi.advanceTimersByTimeAsync(9_999);
+    expect(vi.getTimerCount()).toBe(1);
+    await vi.advanceTimersByTimeAsync(1);
+    expect(await first).toEqual({ kind: 'too-complex' });
+    expect(vi.getTimerCount()).toBe(1);
+    await vi.advanceTimersByTimeAsync(10_000);
+    expect(await second).toEqual({ kind: 'too-complex' });
+    expect(vi.getTimerCount()).toBe(0);
+  });
+});
+
+describe('the checks of the saves', () => {
+  it('keep a verdict for a few minutes, by what it was of', async () => {
+    const checks = new Tally();
+    const counting: SaveChecker = {
+      check: (before, after) => {
+        checks.add();
+        return inThisThread.check(before, after);
+      },
+    };
+    const clock = { now: 0 };
+    const saves = new SaveChecks(counting, () => clock.now);
+    const verdict = await saves.check('a', [WEST, EAST], [GROWN, EAST]);
+    expect(await saves.check('a', [WEST, EAST], [GROWN, EAST])).toEqual(verdict);
+    expect(checks.count).toBe(1);
+    await saves.check('b', [WEST, EAST], [GROWN, EAST]);
+    expect(checks.count).toBe(2);
+    clock.now += 5 * 60_000;
+    await saves.check('a', [WEST, EAST], [GROWN, EAST]);
+    expect(checks.count).toBe(3);
+  });
+
+  it('keep no verdict of a check that did not come to one', async () => {
+    const checks = new Tally();
+    const saves = new SaveChecks(
+      {
+        check: () => {
+          checks.add();
+          return Promise.resolve({ kind: 'too-complex' });
+        },
+      },
+      () => 0,
+    );
+    await saves.check('a', [WEST], [GROWN]);
+    await saves.check('a', [WEST], [GROWN]);
+    expect(checks.count).toBe(2);
+  });
+});
diff --git a/src/web/save-check.ts b/src/web/save-check.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7f428942ae55b5299f0cfde6c41eb8262e84e855
--- /dev/null
+++ b/src/web/save-check.ts
@@ -0,0 +1,159 @@
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { Worker } from 'node:worker_threads';
+import { BoundedMap } from '../bounded-map.js';
+import { newProblems, type Coverage, type Outlined } from '../domain/regions/coverage.js';
+import type { Logger } from '../log.js';
+import type { SaveCheckJob, SaveCheckReply } from './save-check-thread.js';
+
+/**
+ * What the check of a save for new overlaps and gaps came to (spec 4.3, plan 8M-2): `checked`,
+ * with what `newProblems` found; `too-complex`, when it took longer or more memory than it may;
+ * `failed`, when it could not be worked out (polyclip could not cut the outlines): logged, and
+ * then it does not block, as the page's own check has shaded what it found.
+ */
+export type CheckVerdict =
+  | { kind: 'checked'; coverage: Coverage }
+  | { kind: 'too-complex' }
+  | { kind: 'failed'; err: unknown };
+
+/** Works out the new overlaps and gaps of a save (`newProblems`). Never rejects. */
+export interface SaveChecker {
+  check(before: readonly Outlined[], after: readonly Outlined[]): Promise<CheckVerdict>;
+}
+
+/** How long the verdict of a check is kept for the save that follows its preview. */
+export const VERDICT_MS = 5 * 60_000;
+/** How many verdicts are kept at most (oldest out). */
+const VERDICTS = 100;
+
+/**
+ * The checks of the saves of the region editor (`SaveChecker`), with the verdicts of the
+ * last few minutes kept by what they were of (`key`: the request and the versions of the
+ * server's regions it was checked against, as the caller hashes them): the save of what was
+ * just previewed, with nothing changed since, is not checked again. Only a `checked` verdict is
+ * kept.
+ */
+export class SaveChecks {
+  private readonly verdicts = new BoundedMap<string, { at: number; coverage: Coverage }>(VERDICTS);
+
+  constructor(
+    private readonly checker: SaveChecker,
+    private readonly now: () => number,
+  ) {}
+
+  async check(
+    key: string,
+    before: readonly Outlined[],
+    after: readonly Outlined[],
+  ): Promise<CheckVerdict> {
+    const kept = this.verdicts.get(key);
+    if (kept && this.now() - kept.at < VERDICT_MS) {
+      return { kind: 'checked', coverage: kept.coverage };
+    }
+    const verdict = await this.checker.check(before, after);
+    if (verdict.kind === 'checked') {
+      this.verdicts.set(key, { at: this.now(), coverage: verdict.coverage });
+    }
+    return verdict;
+  }
+}
+
+/** How long one check may take: a city's regions take a second or two. */
+export const CHECK_LIMIT_MS = 10_000;
+/** How much memory (of its old generation, in MB) the thread of one check may take. */
+const CHECK_MEMORY_MB = 256;
+
+const here = fileURLToPath(import.meta.url);
+/** The thread's script beside this one: `.js` in `dist/`, `.ts` where tests run the source. */
+const THREAD = path.join(path.dirname(here), `save-check-thread${path.extname(here)}`);
+
+export interface SaveCheckWorkerOptions {
+  log: Logger;
+  /** The thread's script; `save-check-thread` beside this module by default (tests give a fake). */
+  file?: string;
+  limitMs?: number;
+}
+
+/**
+ * The checks of the saves of the region editor off the bot's thread: each in a thread of its
+ * own (`save-check-thread`), one at a time (the others wait their turn), ended after
+ * `CHECK_LIMIT_MS` or when it runs out of the memory it may take: `too-complex` then. A thread
+ * that fails otherwise is `failed` (logged by the caller). Threads do not keep the bot from
+ * ending.
+ */
+export class SaveCheckWorker implements SaveChecker {
+  private last: Promise<unknown> | undefined;
+
+  constructor(private readonly options: SaveCheckWorkerOptions) {}
+
+  check(before: readonly Outlined[], after: readonly Outlined[]): Promise<CheckVerdict> {
+    const run = (): Promise<CheckVerdict> => this.run(before, after);
+    const verdict = this.last ? this.last.then(run, run) : run();
+    this.last = verdict;
+    void verdict.then(() => {
+      if (this.last === verdict) this.last = undefined;
+    });
+    return verdict;
+  }
+
+  private run(before: readonly Outlined[], after: readonly Outlined[]): Promise<CheckVerdict> {
+    const file = this.options.file ?? THREAD;
+    return new Promise((resolve) => {
+      let worker: Worker;
+      try {
+        worker = new Worker(file, {
+          workerData: { before, after } satisfies SaveCheckJob,
+          execArgv: path.extname(file) === '.ts' ? ['--import', import.meta.resolve('tsx')] : [],
+          resourceLimits: { maxOldGenerationSizeMb: CHECK_MEMORY_MB },
+          stdout: true,
+          stderr: true,
+        });
+      } catch (err) {
+        resolve({ kind: 'failed', err });
+        return;
+      }
+      worker.unref();
+      let done = false;
+      const finish = (verdict: CheckVerdict): void => {
+        if (done) return;
+        done = true;
+        clearTimeout(timer);
+        void worker.terminate();
+        resolve(verdict);
+      };
+      const timer = setTimeout(() => {
+        this.options.log.warn('the check of a save took too long, and was ended');
+        finish({ kind: 'too-complex' });
+      }, this.options.limitMs ?? CHECK_LIMIT_MS);
+      worker.once('message', (reply: SaveCheckReply) => {
+        finish(
+          reply.ok
+            ? { kind: 'checked', coverage: reply.coverage }
+            : { kind: 'failed', err: new Error(reply.message) },
+        );
+      });
+      worker.once('error', (err: Error & { code?: string }) => {
+        finish(
+          err.code === 'ERR_WORKER_OUT_OF_MEMORY'
+            ? { kind: 'too-complex' }
+            : { kind: 'failed', err },
+        );
+      });
+      worker.once('exit', (code) => {
+        finish({ kind: 'failed', err: new Error(`the thread ended (${code}) without an answer`) });
+      });
+    });
+  }
+}
+
+/** The check on the calling thread: for tests, which need no thread of its own. */
+export const inThisThread: SaveChecker = {
+  check(before, after) {
+    try {
+      return Promise.resolve({ kind: 'checked', coverage: newProblems(before, after) });
+    } catch (err) {
+      return Promise.resolve({ kind: 'failed', err });
+    }
+  },
+};
diff --git a/test/support/hanging-thread.ts b/test/support/hanging-thread.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ab41985972fe661114259393118f66045288ea93
--- /dev/null
+++ b/test/support/hanging-thread.ts
@@ -0,0 +1,5 @@
+/**
+ * A thread that never answers, for the tests of `SaveCheckWorker`: it stands for a check that
+ * takes far longer than it may, and stays until it is ended.
+ */
+setInterval(() => undefined, 60_000);
diff --git a/test/support/web.ts b/test/support/web.ts
index ec2f019fbc6eb3654a8f42da025539d3c1996424..a856595e60d7857e998e5756d8edcf0406ee70c0 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -16,11 +16,14 @@ import type { RegionStaffSource, StaffAnswer } from '../../src/web/region-staff.
 import { LoginLinks } from '../../src/web/login-links.js';
 import type { WebAssets } from '../../src/web/page.js';
 import { buildWebServer, type WebDeps, type WebSettings } from '../../src/web/server.js';
-import { Sessions } from '../../src/web/sessions.js';
+import { inThisThread } from '../../src/web/save-check.js';
+import type { RegionEditing } from '../../src/web/editor-save.js';
+import { Sessions, sessionHash } from '../../src/web/sessions.js';
 import { FAKE_GUILD_ID } from './fake-interactions.js';
 import { gymDirectoryWith } from './gym-store.js';
 import { EAST_CHANNEL, testRegions, WEST_CHANNEL } from './gyms.js';
 import { FakeMemberDirectory } from './members.js';
+import { regionAdminWith } from './region-admin.js';
 import { createTestLogger } from './test-logger.js';
 import { wayspotsWith } from './wayspots.js';
 import { MemoryWebSessions } from './web-sessions.js';
@@ -213,8 +216,48 @@ export interface WebTestOptions {
   staff?: RegionStaffSource;
   /** Where the editor's view is built from (`editorSourcesWith`); nothing by default. */
   editor?: { sources: EditorSources };
+  /**
+   * The region administration of preview and save (`regionEditingWith`); by default none,
+   * which a test that saves must give.
+   */
+  editing?: RegionEditing;
 }
 
+/**
+ * Preview and save over region administration on fakes (`regionAdminWith`: the invented regions
+ * West, East and the one without an outline, the channels `west`, `east`, `unbounded` in `Town`
+ * and `south`), as the bot wires them, but for the new overlaps and gaps of a save, which are
+ * worked out on the test's own thread (`inThisThread`).
+ */
+export async function regionEditingWith(selfRoles = false) {
+  const made = await regionAdminWith();
+  const editing: RegionEditing = {
+    regions: made.regions,
+    admin: made.regionAdmin,
+    checker: inThisThread,
+    selfRoles,
+    log: made.log,
+  };
+  return { ...made, editing };
+}
+
+/** No region administration: a test of preview or save gives its own (`regionEditingWith`). */
+const NO_EDITING: RegionEditing = {
+  regions: { all: () => [] },
+  admin: {
+    preview: () => {
+      throw new Error('no region administration in this test');
+    },
+    save: () => Promise.reject(new Error('no region administration in this test')),
+    removalQuestion: () => Promise.resolve(undefined),
+    channelsOf: () => [],
+    orphanForums: () => Promise.resolve([]),
+  },
+  checker: inThisThread,
+  selfRoles: false,
+  log: createTestLogger().log,
+};
+
 /**
  * A bundle as `npm run web:build` leaves it, in a folder of its own: the script and style with
  * hashes in their names, a file without one, and a file beside the folder that must not be
@@ -246,6 +289,11 @@ export interface TestWeb {
   loginLinks: LoginLinks;
   /** Starts a session for somebody, as a login does; gives the `cookie` header that carries it. */
   loggedIn(userId: string, name: string): Promise<string>;
+  /**
+   * Starts a session for somebody and gives the headers a POST of Pine's own page carries: the
+   * cookie, `Origin` and the session's CSRF token.
+   */
+  posting(userId: string, name: string): Promise<Record<string, string>>;
 }
 
 /**
@@ -279,6 +327,7 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
     editor: {
       staff: options.staff ?? new FakeRegionStaff(),
       view: new EditorCache(options.editor?.sources ?? NO_EDITOR),
+      editing: options.editing ?? NO_EDITING,
     },
     now: () => clock.now,
     log,
@@ -295,5 +344,13 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
       const token = await sessionService.create({ id: userId, name });
       return `${sessionService.cookieName}=${token}`;
     },
+    async posting(userId, name) {
+      const token = await sessionService.create({ id: userId, name });
+      return {
+        cookie: `${sessionService.cookieName}=${token}`,
+        origin: settings.publicUrl,
+        'x-pine-csrf': sessionService.csrfToken({ id: sessionHash(token) }),
+      };
+    },
   };
 }
````

### Task 4: Region editor: the page

Prototype commit: `359b167f60cbff631b8d5882c0c04e517b7a2f81`

`/s/<guild>/regions/edit` (401 and 403 pages in words, 20 loads a minute) and its bundle (a second entry and a worker beside the map's; shared code in `common.ts`). Leaflet with `preferCanvas`, the server's regions, other servers' outlines (snapping only), gyms and Wayspots as toggled layers, places in no region in orange; Geoman draw, edit, drag and snapping; removal with keep/delete forum and Restore; split with Swap; the channel picker refusing an existing channel's name; staged edits in the browser, undo and redo; overlaps and gaps in a Web Worker, shaded and listed; Save sends exactly what was previewed; an unknown outcome reloads and rebases; Take theirs / Keep mine; KML load and export.

**Files:**

```
 scripts/web/build.ts                  |   39 ++-
 src/domain/regions/edits.test.ts      |   11 +
 src/domain/regions/edits.ts           |   13 +-
 src/domain/web/editor-data.ts         |    2 +
 src/domain/web/editor-view.ts         |    2 +-
 src/web/answers.ts                    |   18 ++
 src/web/client/common.ts              |  184 ++++++++++++
 src/web/client/coverage-check.test.ts |   78 +++++
 src/web/client/coverage-check.ts      |  135 +++++++++
 src/web/client/editor-view.test.ts    |  328 +++++++++++++++++++++
 src/web/client/editor-view.ts         |  306 ++++++++++++++++++++
 src/web/client/editor-worker.ts       |   16 ++
 src/web/client/editor.css             |  103 +++++++
 src/web/client/editor.ts              | 1134 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/main.ts                |  169 +----------
 src/web/client/staged-storage.test.ts |   82 ++++++
 src/web/client/staged-storage.ts      |   66 +++++
 src/web/editor-cache.ts               |    2 +
 src/web/editor-page.test.ts           |  113 ++++++++
 src/web/editor-routes.ts              |   73 ++++-
 src/web/editor.test.ts                |    2 +
 src/web/page.test.ts                  |   29 +-
 src/web/page.ts                       |   95 +++++--
 test/support/web.test.ts              |    8 +-
 test/support/web.ts                   |   15 +-
 25 files changed, 2816 insertions(+), 207 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/regions/edits.test.ts src/web/client/coverage-check.test.ts src/web/client/editor-view.test.ts src/web/client/staged-storage.test.ts src/web/editor-page.test.ts src/web/editor.test.ts src/web/page.test.ts test/support/web.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check scripts/web/build.ts src/domain/regions/edits.test.ts src/domain/regions/edits.ts src/domain/web/editor-data.ts src/domain/web/editor-view.ts src/web/answers.ts src/web/client/common.ts src/web/client/coverage-check.test.ts src/web/client/coverage-check.ts src/web/client/editor-view.test.ts src/web/client/editor-view.ts src/web/client/editor-worker.ts src/web/client/editor.ts src/web/client/main.ts src/web/client/staged-storage.test.ts src/web/client/staged-storage.ts src/web/editor-cache.ts src/web/editor-page.test.ts src/web/editor-routes.ts src/web/editor.test.ts src/web/page.test.ts src/web/page.ts test/support/web.test.ts test/support/web.ts` and `npx eslint scripts/web/build.ts src/domain/regions/edits.test.ts src/domain/regions/edits.ts src/domain/web/editor-data.ts src/domain/web/editor-view.ts src/web/answers.ts src/web/client/common.ts src/web/client/coverage-check.test.ts src/web/client/coverage-check.ts src/web/client/editor-view.test.ts src/web/client/editor-view.ts src/web/client/editor-worker.ts src/web/client/editor.ts src/web/client/main.ts src/web/client/staged-storage.test.ts src/web/client/staged-storage.ts src/web/editor-cache.ts src/web/editor-page.test.ts src/web/editor-routes.ts src/web/editor.test.ts src/web/page.test.ts src/web/page.ts test/support/web.test.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 359b167f60cbff631b8d5882c0c04e517b7a2f81 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m2-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Region editor: the page`, the paragraph above as the body and the trailer, staging exactly
  `scripts/web/build.ts src/domain/regions/edits.test.ts src/domain/regions/edits.ts src/domain/web/editor-data.ts src/domain/web/editor-view.ts src/web/answers.ts src/web/client/common.ts src/web/client/coverage-check.test.ts src/web/client/coverage-check.ts src/web/client/editor-view.test.ts src/web/client/editor-view.ts src/web/client/editor-worker.ts src/web/client/editor.css src/web/client/editor.ts src/web/client/main.ts src/web/client/staged-storage.test.ts src/web/client/staged-storage.ts src/web/editor-cache.ts src/web/editor-page.test.ts src/web/editor-routes.ts src/web/editor.test.ts src/web/page.test.ts src/web/page.ts test/support/web.test.ts test/support/web.ts`.

````diff
diff --git a/scripts/web/build.ts b/scripts/web/build.ts
index 20b9719d27396b43f84894dc798bf3aee1dfc11f..f4f5d4c56e2498fd0b76d9c9e2938e06b34ebeb7 100644
--- a/scripts/web/build.ts
+++ b/scripts/web/build.ts
@@ -3,12 +3,14 @@ import path from 'node:path';
 import { build } from 'esbuild';
 
 /**
- * Builds the web map's page (`src/web/client/`) into `dist/web/`: `assets/map-<hash>.js` (the
- * script with Leaflet, an IIFE for ES2022, minified), `assets/map-<hash>.css` (the page's style
- * with Leaflet's) and Leaflet's pictures, each named by a hash of its content so that the
- * server can let browsers keep them for good; `dist/web/assets.json` names the script and the
- * style for the page. The folder is emptied first, so no old file stays; the rest of `dist/web/`
- * is the compiled server code of `src/web/` and is left alone.
+ * Builds the web pages (`src/web/client/`) into `dist/web/`: the map (`assets/map-<hash>.js`
+ * with Leaflet, `assets/map-<hash>.css` with Leaflet's style) and the region editor (plan 8M-2:
+ * `assets/editor-<hash>.js` with Leaflet and Geoman, `assets/editor-<hash>.css` with both
+ * styles, and the script of its worker, `assets/editor-worker-<hash>.js`), each an IIFE for
+ * ES2022, minified, with Leaflet's pictures, every file named by a hash of its content so that
+ * the server can let browsers keep them for good; `dist/web/assets.json` names each page's
+ * script and style and the worker. The folder is emptied first, so no old file stays; the rest
+ * of `dist/web/` is the compiled server code of `src/web/` and is left alone.
  */
 
 const root = path.resolve(import.meta.dirname, '../..');
@@ -26,6 +28,9 @@ const result = await build({
   entryPoints: [
     { in: path.join(client, 'main.ts'), out: 'map' },
     { in: path.join(client, 'map.css'), out: 'map' },
+    { in: path.join(client, 'editor.ts'), out: 'editor' },
+    { in: path.join(client, 'editor.css'), out: 'editor' },
+    { in: path.join(client, 'editor-worker.ts'), out: 'editor-worker' },
   ],
   tsconfig: path.join(client, 'tsconfig.json'),
   outdir: assets,
@@ -37,7 +42,7 @@ const result = await build({
   target: 'es2022',
   minify: true,
   charset: 'utf8',
-  // Leaflet's licence (BSD-2-Clause) asks for its notice: kept at the end of the files.
+  // Leaflet's licence (BSD-2-Clause) and Geoman's (MIT) ask for their notices: kept at the end.
   legalComments: 'eof',
   loader: { '.png': 'file', '.svg': 'file' },
   metafile: true,
@@ -45,11 +50,19 @@ const result = await build({
 });
 
 const outputs = Object.keys(result.metafile.outputs).map((file) => path.basename(file));
-const script = outputs.find((file) => /^map-[A-Z0-9]{8}\.js$/.test(file));
-const style = outputs.find((file) => /^map-[A-Z0-9]{8}\.css$/.test(file));
-if (script === undefined || style === undefined) {
-  throw new Error(`the build made no script or no style: ${outputs.join(', ')}`);
-}
-await writeFile(manifest, `${JSON.stringify({ script, style }, null, 2)}\n`);
+const named = (pattern: RegExp): string => {
+  const found = outputs.find((file) => pattern.test(file));
+  if (found === undefined) throw new Error(`the build made no ${pattern}: ${outputs.join(', ')}`);
+  return found;
+};
+const files = {
+  map: { script: named(/^map-[A-Z0-9]{8}\.js$/), style: named(/^map-[A-Z0-9]{8}\.css$/) },
+  editor: {
+    script: named(/^editor-[A-Z0-9]{8}\.js$/),
+    style: named(/^editor-[A-Z0-9]{8}\.css$/),
+    worker: named(/^editor-worker-[A-Z0-9]{8}\.js$/),
+  },
+};
+await writeFile(manifest, `${JSON.stringify(files, null, 2)}\n`);
 
 process.stdout.write(`dist/web/assets: ${outputs.join(', ')}\n`);
diff --git a/src/domain/regions/edits.test.ts b/src/domain/regions/edits.test.ts
index 7ab5e30e014460f7a54a145ae8fe74c75f9a7a30..692f5eab6ce5475cb3f3907d78b04ada7cd23a47 100644
--- a/src/domain/regions/edits.test.ts
+++ b/src/domain/regions/edits.test.ts
@@ -184,6 +184,17 @@ describe('staged edits', () => {
       removals: [],
     });
   });
+
+  it('take a removal back, whenever it was staged', () => {
+    const state = staged(
+      { kind: 'remove', key: E, forum: 'delete', bases: { [E]: versionOf(2) } },
+      { kind: 'outline', key: W, outline: square(40, -80.1, 40.1, -80.02), bases: {} },
+      { kind: 'restore', key: E, bases: {} },
+    );
+    const { drafts } = applyEdits(LOADED, state);
+    expect(drafts.find((draft) => draft.key === E)?.removed).toBeNull();
+    expect(saveRequest(LOADED, drafts).request.removals).toEqual([]);
+  });
 });
 
 describe('undo and redo', () => {
diff --git a/src/domain/regions/edits.ts b/src/domain/regions/edits.ts
index 4323d60e3088099514427794b6dbda367e6922c6..25eb4fbb2c7fedd5ab2f4aa1f4bd88c412052d8b 100644
--- a/src/domain/regions/edits.ts
+++ b/src/domain/regions/edits.ts
@@ -55,8 +55,9 @@ export type Bases = Record<string, string>;
 
 /**
  * One staged edit. `add`: a new region (drawn, or of a file); `outline`: a region reshaped,
- * moved or drawn anew; `details`: a new region's channel and category; `remove`; `split`: a
- * region keeps one part and a new region gets the other; `swap`: two regions exchange their
+ * moved or drawn anew; `details`: a new region's channel and category; `remove`, and
+ * `restore` (a removal taken back); `split`: a region keeps one part and a new region gets the
+ * other; `swap`: two regions exchange their
  * outlines (which part of a split keeps the region); `take-theirs` / `keep-mine`: a region
  * changed by somebody else is taken as it is now, or the staged one is kept and sent with the
  * version it has now; `batch`: several edits undone as one (a file).
@@ -72,6 +73,7 @@ export type Edit =
   | { kind: 'outline'; key: string; outline: LatLon[]; bases: Bases }
   | { kind: 'details'; key: string; channel: ChannelChoice | null; description: string | null }
   | { kind: 'remove'; key: string; forum: 'keep' | 'delete'; bases: Bases }
+  | { kind: 'restore'; key: string; bases: Bases }
   | {
       kind: 'split';
       key: string;
@@ -263,6 +265,11 @@ export function applyEdits(loaded: readonly LoadedRegion[], state: EditState): A
         else draft.removed = edit.forum;
         return;
       }
+      case 'restore': {
+        const draft = touch(edit.key, edit.bases);
+        if (draft) draft.removed = null;
+        return;
+      }
       case 'split': {
         const draft = touch(edit.key, edit.bases);
         if (!draft) return;
@@ -426,6 +433,8 @@ function isEdit(value: unknown): value is Edit {
       return isText(value.key) && isChannel(value.channel) && isTextOrNull(value.description);
     case 'remove':
       return isText(value.key) && isForum(value.forum) && isBases(value.bases);
+    case 'restore':
+      return isText(value.key) && isBases(value.bases);
     case 'split':
       return (
         isText(value.key) &&
diff --git a/src/domain/web/editor-data.ts b/src/domain/web/editor-data.ts
index 1d0668f924aef5a59138a13bb9f824f4034d4cae..16a708f28e67613d3a61d4e3cd375be204487412 100644
--- a/src/domain/web/editor-data.ts
+++ b/src/domain/web/editor-data.ts
@@ -30,6 +30,8 @@ export interface EditorRegion {
 export interface EditorData {
   /** The server: its id and name (the name of an exported file). */
   guild: { id: string; name: string };
+  /** Who asks: the page keeps their staged edits under it (`storageKey`). */
+  userId: string;
   /** Discord could not say who is asking: the editor shows, but saves nothing. */
   readOnly: boolean;
   /** Whether the member may create channels (Manage Channels): new names need it. */
diff --git a/src/domain/web/editor-view.ts b/src/domain/web/editor-view.ts
index 736b959544fff8e41c85453ead05f2bb0a185907..811080e4c2f481131b0b6ffedbb9dffde2682e8c 100644
--- a/src/domain/web/editor-view.ts
+++ b/src/domain/web/editor-view.ts
@@ -37,7 +37,7 @@ export interface EditorInput {
 }
 
 /** What the editor loads but for who is asking. */
-export type EditorView = Omit<EditorData, 'guild' | 'readOnly' | 'mayManageChannels'>;
+export type EditorView = Omit<EditorData, 'guild' | 'userId' | 'readOnly' | 'mayManageChannels'>;
 
 const six = (value: number): number => {
   const rounded = Math.round(value * 1e6) / 1e6;
diff --git a/src/web/answers.ts b/src/web/answers.ts
index 7f5a934b1dd9a945544cdc147b3d6b37c8e36ef9..481767329e15c307e7ce2b05a9cdf6e3da697612 100644
--- a/src/web/answers.ts
+++ b/src/web/answers.ts
@@ -42,6 +42,24 @@ export function shortPage(sentence: string): string {
   return page(sentence);
 }
 
+/**
+ * A short page of a sentence, a link of Pine's when there is one (`href`, a path), and a last
+ * sentence: how to log in where a page needs a login.
+ */
+export function linkPage(
+  sentence: string,
+  link: { href: string; text: string } | undefined,
+  after: string,
+): string {
+  return page(
+    sentence,
+    (link === undefined
+      ? ''
+      : `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.text)}</a></p>`) +
+      `<p>${escapeHtml(after)}</p>`,
+  );
+}
+
 /**
  * A short page of one sentence and a button that POSTs an empty form to `action` (a path of
  * Pine's): no script, so that opening an address changes nothing until the member presses it.
diff --git a/src/web/client/common.ts b/src/web/client/common.ts
new file mode 100644
index 0000000000000000000000000000000000000000..48025214c8cff94238246a581c130f0e40dcb74b
--- /dev/null
+++ b/src/web/client/common.ts
@@ -0,0 +1,184 @@
+import * as L from 'leaflet';
+import {
+  googleAttribution,
+  googleTileUrl,
+  sessionRequest,
+  sessionUrl,
+  viewportUrl,
+  type TileLayerSpec,
+} from './layers.js';
+import { LOGOUT_FAILED, logOut } from './logout.js';
+import { headerLines, type Me } from './notice.js';
+
+/**
+ * What the map page and the region editor share (plans 8M-1, 8M-2): the elements of the page,
+ * reading JSON, the line under the header, the tiles with Google's layers, and the header with
+ * the login.
+ */
+
+/** How long the map rests before Google is asked for the attribution of what is in view. */
+const ATTRIBUTION_DELAY_MS = 500;
+
+export function byId(id: string): HTMLElement {
+  const found = document.getElementById(id);
+  if (!found) throw new Error(`the page has no #${id}`);
+  return found;
+}
+
+export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
+  const response = await fetch(url, { credentials: 'same-origin', ...init });
+  if (!response.ok) throw new Error(`${response.status}`);
+  return (await response.json()) as T;
+}
+
+/** A line under the header, for a moment's news (a login that failed, tiles that did not load). */
+export function say(text: string): void {
+  const notice = byId('notice');
+  notice.textContent = text;
+  notice.hidden = false;
+}
+
+/** The Google layer of a spec: a session asked for when it is first shown, then its tiles. */
+function googleLayer(
+  map: L.Map,
+  spec: Extract<TileLayerSpec, { kind: 'google' }>,
+  key: string,
+): L.LayerGroup {
+  const group = L.layerGroup();
+  let session: Promise<string> | undefined;
+  let attribution: string | undefined;
+  let timer: number | undefined;
+  const setAttribution = (text: string | undefined): void => {
+    if (attribution !== undefined) map.attributionControl.removeAttribution(attribution);
+    attribution = text;
+    if (text !== undefined) map.attributionControl.addAttribution(text);
+  };
+  const refresh = (): void => {
+    window.clearTimeout(timer);
+    timer = window.setTimeout(() => {
+      if (!session || !map.hasLayer(group)) return;
+      void session
+        .then((id) => {
+          const bounds = map.getBounds();
+          return getJson<{ copyright?: string }>(
+            viewportUrl(id, key, map.getZoom(), {
+              north: bounds.getNorth(),
+              south: bounds.getSouth(),
+              east: bounds.getEast(),
+              west: bounds.getWest(),
+            }),
+            { credentials: 'omit' },
+          );
+        })
+        .then((answer) => {
+          if (map.hasLayer(group)) setAttribution(googleAttribution(answer.copyright ?? ''));
+        })
+        .catch(() => setAttribution(googleAttribution('')));
+    }, ATTRIBUTION_DELAY_MS);
+  };
+  group.on('add', () => {
+    setAttribution(googleAttribution(''));
+    session ??= getJson<{ session: string }>(sessionUrl(key), {
+      method: 'POST',
+      credentials: 'omit',
+      headers: { 'content-type': 'application/json' },
+      body: JSON.stringify(sessionRequest(spec)),
+    }).then((answer) => answer.session);
+    session
+      .then((id) => {
+        if (group.getLayers().length === 0) {
+          group.addLayer(L.tileLayer(googleTileUrl(id, key), { maxZoom: spec.maxZoom }));
+        }
+        refresh();
+      })
+      .catch(() => {
+        session = undefined;
+        say("Google's map could not be loaded.");
+      });
+    map.on('moveend', refresh);
+  });
+  group.on('remove', () => {
+    map.off('moveend', refresh);
+    window.clearTimeout(timer);
+    setAttribution(undefined);
+  });
+  return group;
+}
+
+/** The tiles of the specs, the first shown, with a switch where there are several. */
+export function addTiles(
+  map: L.Map,
+  specs: readonly TileLayerSpec[],
+  key: string | undefined,
+): void {
+  const layers: Record<string, L.Layer> = {};
+  for (const spec of specs) {
+    layers[spec.name] =
+      spec.kind === 'osm'
+        ? L.tileLayer(spec.url, { attribution: spec.attribution, maxZoom: spec.maxZoom })
+        : googleLayer(map, spec, key ?? '');
+  }
+  const [first] = specs;
+  if (first) layers[first.name]?.addTo(map);
+  if (specs.length > 1) L.control.layers(layers, undefined, { position: 'topright' }).addTo(map);
+}
+
+/** Who is asking (`/api/me`); logged out when that cannot be read. */
+export async function whoIsAsking(guild: string): Promise<Me> {
+  try {
+    return await getJson<Me>(`/s/${guild}/api/me`);
+  } catch {
+    return { loggedIn: false };
+  }
+}
+
+/** The header's account: the login, or the member's name with Log out, and what they may not. */
+export async function showAccount(guild: string, login: 'discord' | 'links'): Promise<Me> {
+  const account = byId('account');
+  const me = await whoIsAsking(guild);
+  const header = headerLines(me, login);
+  account.replaceChildren();
+  if (header.login) {
+    const link = document.createElement('a');
+    link.className = 'login';
+    link.href = `/auth/login?next=${encodeURIComponent(location.pathname)}`;
+    link.textContent = 'Log in with Discord';
+    account.append(link);
+  }
+  if (header.name !== undefined && me.loggedIn) {
+    const name = document.createElement('span');
+    name.className = 'name';
+    name.textContent = header.name;
+    const logout = document.createElement('button');
+    logout.type = 'button';
+    logout.textContent = 'Log out';
+    const { csrf } = me;
+    logout.addEventListener('click', () => {
+      logout.disabled = true;
+      void logOut(csrf, {
+        post: (token) =>
+          fetch('/auth/logout', {
+            method: 'POST',
+            credentials: 'same-origin',
+            headers: { 'x-pine-csrf': token },
+          }).then((answer) => answer.status),
+        me: () => getJson<Me>(`/s/${guild}/api/me`),
+      }).then((result) => {
+        if (result === 'done') {
+          location.reload();
+          return;
+        }
+        logout.disabled = false;
+        say(LOGOUT_FAILED);
+      });
+    });
+    account.append(name, logout);
+  }
+  for (const text of header.lines) {
+    const line = document.createElement('span');
+    line.className = 'line';
+    line.textContent = text;
+    account.append(line);
+  }
+  return me;
+}
diff --git a/src/web/client/coverage-check.test.ts b/src/web/client/coverage-check.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..26232edb2eac7b9e7dc9f07319b8dc563996067d
--- /dev/null
+++ b/src/web/client/coverage-check.test.ts
@@ -0,0 +1,78 @@
+import { describe, expect, it } from 'vitest';
+import type { Point } from '../../domain/web/editor-data.js';
+import { CoverageChecker, type CoverageRegion } from './coverage-check.js';
+
+function square(south: number, west: number, north: number, east: number): Point[] {
+  return [
+    [south, west],
+    [north, west],
+    [north, east],
+    [south, east],
+    [south, west],
+  ];
+}
+
+const region = (key: string, outline: Point[], version = 'v1'): CoverageRegion => ({
+  key,
+  version,
+  outline,
+});
+
+describe('the overlaps and gaps the editor shades', () => {
+  const checker = (): CoverageChecker => {
+    const made = new CoverageChecker();
+    made.handle({
+      kind: 'loaded',
+      regions: [
+        region('r1', square(40, -80.1, 40.1, -79.99)),
+        region('r2', square(40, -80, 40.1, -79.9)),
+      ],
+      places: [
+        ['gym', 40.05, -79.995],
+        ['stop', 40.06, -79.995],
+        ['stop', 40.07, -79.995],
+        ['powerspot', 40.05, -80.05],
+        ['wayfarerGym', 40.05, -79.985],
+      ],
+    });
+    return made;
+  };
+
+  it('lists those of the regions as loaded, none of them new, with what lies in them', () => {
+    const answer = checker().handle({
+      kind: 'check',
+      seq: 1,
+      regions: [
+        region('r1', square(40, -80.1, 40.1, -79.99)),
+        region('r2', square(40, -80, 40.1, -79.9)),
+      ],
+    });
+    expect(answer).toMatchObject({ seq: 1, failed: false });
+    expect(answer?.pieces).toHaveLength(1);
+    expect(answer?.pieces[0]).toMatchObject({
+      kind: 'overlap',
+      between: ['r1', 'r2'],
+      fresh: false,
+      counts: { gym: 1, stop: 2, powerspot: 0, wayfarerGym: 0 },
+    });
+    expect(answer?.pieces[0]?.rings[0]?.[0]).toEqual([40, -80]);
+  });
+
+  it('marks what the staged edits make as new', () => {
+    const answer = checker().handle({
+      kind: 'check',
+      seq: 2,
+      regions: [
+        region('r1', square(40, -80.1, 40.1, -79.98), 'v2'),
+        region('r2', square(40, -80, 40.1, -79.9)),
+      ],
+    });
+    expect(
+      answer?.pieces.map((piece) => [piece.kind, piece.fresh, piece.counts.wayfarerGym]),
+    ).toEqual([['overlap', true, 1]]);
+  });
+
+  it('answers nothing before it knows the regions as loaded', () => {
+    expect(new CoverageChecker().handle({ kind: 'check', seq: 3, regions: [] })).toBeUndefined();
+  });
+});
diff --git a/src/web/client/coverage-check.ts b/src/web/client/coverage-check.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6e427576d809bc481eec105c4c2d0b97c600b31c
--- /dev/null
+++ b/src/web/client/coverage-check.ts
@@ -0,0 +1,135 @@
+import type { LatLon } from '../../domain/geo/lat-lon.js';
+import {
+  coverage,
+  inPiece,
+  newPieces,
+  OverlapCache,
+  type Coverage,
+  type Outlined,
+  type Piece,
+} from '../../domain/regions/coverage.js';
+import type { Point } from '../../domain/web/editor-data.js';
+import type { ListedPiece, PlaceKinds } from './editor-view.js';
+
+/**
+ * The overlaps and gaps of the region editor (spec 4.3), worked out in a worker of the page
+ * (`editor-worker.ts`): at the size of a city that takes seconds, which the page must not
+ * stand still for. The worker is told the regions as loaded and the places to count once
+ * (`loaded`), then the staged regions after every edit (`check`); it answers every piece with
+ * what lies in it and whether the edits made it (`newPieces` against the loaded ones).
+ */
+
+/** What kind of place lies in a piece: a gym of Pine's, or a kept Wayspot. */
+export type PlaceKind = keyof PlaceKinds;
+
+/**
+ * A staged region as the worker is told it: its key, a version of its outline (the worker keeps
+ * an outline it has seen, so that the overlaps of unchanged pairs are kept), its outline.
+ */
+export interface CoverageRegion {
+  key: string;
+  version: string;
+  outline: Point[];
+}
+
+export type CoverageRequest =
+  | { kind: 'loaded'; regions: CoverageRegion[]; places: [PlaceKind, number, number][] }
+  | { kind: 'check'; seq: number; regions: CoverageRegion[] };
+
+/** A piece as the page shades and lists it. */
+export interface ShownPiece extends ListedPiece {
+  /** Its outer ring, then its holes. */
+  rings: Point[][];
+}
+
+/** The pieces of one `check`; `failed` when polyclip could not cut the outlines. */
+export interface CoverageAnswer {
+  seq: number;
+  pieces: ShownPiece[];
+  failed: boolean;
+}
+
+const toPoint = ({ lat, lon }: LatLon): Point => [lat, lon];
+
+/** The worker's state: the loaded pieces, the places sorted by latitude, the outlines seen. */
+export class CoverageChecker {
+  private loaded: Coverage | undefined;
+  private places: [PlaceKind, number, number][] = [];
+  private readonly outlines = new Map<string, { version: string; outline: LatLon[] }>();
+  private readonly cache = new OverlapCache();
+
+  /** Answers a `check`; nothing for `loaded`, or for a `check` before it. */
+  handle(message: CoverageRequest): CoverageAnswer | undefined {
+    if (message.kind === 'loaded') {
+      this.places = [...message.places].sort((a, b) => a[1] - b[1]);
+      try {
+        this.loaded = coverage(this.outlined(message.regions), this.cache);
+      } catch {
+        this.loaded = { overlaps: [], gaps: [] };
+      }
+      return undefined;
+    }
+    if (!this.loaded) return undefined;
+    let now: Coverage;
+    try {
+      now = coverage(this.outlined(message.regions), this.cache);
+    } catch {
+      return { seq: message.seq, pieces: [], failed: true };
+    }
+    const freshOverlaps = new Set(newPieces(now.overlaps, this.loaded.overlaps));
+    const freshGaps = new Set(newPieces(now.gaps, this.loaded.gaps));
+    const shown = (
+      piece: Piece,
+      kind: 'overlap' | 'gap',
+      between: [string, string] | null,
+      fresh: boolean,
+    ): ShownPiece => ({
+      kind,
+      rings: piece.rings.map((ring) => ring.map(toPoint)),
+      area: piece.area,
+      between,
+      fresh,
+      counts: this.countIn(piece),
+    });
+    return {
+      seq: message.seq,
+      failed: false,
+      pieces: [
+        ...now.overlaps.map((piece) =>
+          shown(piece, 'overlap', piece.between, freshOverlaps.has(piece)),
+        ),
+        ...now.gaps.map((piece) => shown(piece, 'gap', null, freshGaps.has(piece))),
+      ],
+    };
+  }
+
+  /** The regions as outlines, the very same list for an outline whose version it has seen. */
+  private outlined(regions: readonly CoverageRegion[]): Outlined[] {
+    return regions.map(({ key, version, outline }) => {
+      const kept = this.outlines.get(key);
+      if (kept?.version === version) return { key, outline: kept.outline };
+      const made = outline.map(([lat, lon]) => ({ lat, lon }));
+      this.outlines.set(key, { version, outline: made });
+      return { key, outline: made };
+    });
+  }
+
+  /** What lies in a piece, by kind: the places in its band of latitude, tested one by one. */
+  private countIn(piece: Piece): PlaceKinds {
+    const counts: PlaceKinds = { gym: 0, stop: 0, powerspot: 0, wayfarerGym: 0 };
+    const { places } = this;
+    let low = 0;
+    let high = places.length;
+    while (low < high) {
+      const middle = (low + high) >> 1;
+      if ((places[middle]?.[1] ?? 0) < piece.box.south) low = middle + 1;
+      else high = middle;
+    }
+    for (let i = low; i < places.length; i++) {
+      const place = places[i];
+      if (!place || place[1] > piece.box.north) break;
+      if (inPiece(piece, { lat: place[1], lon: place[2] })) counts[place[0]] += 1;
+    }
+    return counts;
+  }
+}
diff --git a/src/web/client/editor-view.test.ts b/src/web/client/editor-view.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0bf6049a96f4831df0230c9b365cd537dbe0eb74
--- /dev/null
+++ b/src/web/client/editor-view.test.ts
@@ -0,0 +1,328 @@
+import { describe, expect, it } from 'vitest';
+import type { LatLon } from '../../domain/geo/lat-lon.js';
+import {
+  applyEdits,
+  emptyEdits,
+  newKey,
+  record,
+  regionKey,
+  type Draft,
+} from '../../domain/regions/edits.js';
+import type { EditorData, SaveRequest } from '../../domain/web/editor-data.js';
+import {
+  channelChoices,
+  draftLabel,
+  exportFileName,
+  loadedRegions,
+  newChannelProblem,
+  outlineProblems,
+  pieceLine,
+  placeCounts,
+  readSaveAnswer,
+  saveBody,
+  saveReadiness,
+  splitPartner,
+  storageKey,
+} from './editor-view.js';
+
+const p = (lat: number, lon: number): LatLon => ({ lat, lon });
+function square(south: number, west: number, north: number, east: number): LatLon[] {
+  return [p(south, west), p(north, west), p(north, east), p(south, east), p(south, west)];
+}
+const points = (ring: LatLon[]): [number, number][] => ring.map(({ lat, lon }) => [lat, lon]);
+
+const DATA: EditorData = {
+  guild: { id: '412345678901234567', name: 'Pinewood Raids' },
+  userId: '700000000000000001',
+  readOnly: false,
+  mayManageChannels: true,
+  regions: [
+    {
+      id: 1,
+      channelId: '100000000000000001',
+      name: 'west',
+      category: 'Town',
+      description: null,
+      outline: points(square(40, -80.1, 40.1, -80)),
+      version: 'AAAAAAAAAAAAAAAA',
+    },
+    {
+      id: 2,
+      channelId: '100000000000000002',
+      name: 'east',
+      category: 'Town',
+      description: null,
+      outline: points(square(40, -80, 40.1, -79.9)),
+      version: 'BBBBBBBBBBBBBBBB',
+    },
+  ],
+  others: [],
+  gyms: [
+    [1, 40.05, -80.05, 'Library'],
+    [2, 40.05, -79.95, 'Bridge'],
+    [3, 40.2, -80.05, 'Trailhead'],
+  ],
+  wayspots: [
+    ['stop', 40.01, -80.01, 'Mural'],
+    ['powerspot', 40.2, -80.0, 'Kiosk'],
+  ],
+  channels: [
+    { id: '100000000000000005', name: 'south' },
+    { id: '100000000000000006', name: 'north' },
+  ],
+};
+const LOADED = loadedRegions(DATA);
+const drafts = (...edits: Parameters<typeof record>[1][]): Draft[] =>
+  applyEdits(
+    LOADED,
+    edits.reduce((state, edit) => record(state, edit), emptyEdits()),
+  ).drafts;
+
+describe('the region editor page', () => {
+  it('counts the gyms in each region, and finds the places in none', () => {
+    const counts = placeCounts(drafts(), DATA);
+    expect(counts.gyms).toEqual(
+      new Map([
+        [regionKey(1), 1],
+        [regionKey(2), 1],
+      ]),
+    );
+    // By their places in the data: the trailhead, and the kiosk.
+    expect(counts.outsideGyms).toEqual([2]);
+    expect(counts.outsideWayspots).toEqual([1]);
+    // Follows an edit: west grows north over the trailhead.
+    const grown = placeCounts(
+      drafts({
+        kind: 'outline',
+        key: regionKey(1),
+        outline: square(40, -80.1, 40.3, -80),
+        bases: {},
+      }),
+      DATA,
+    );
+    expect(grown.gyms.get(regionKey(1))).toBe(2);
+    expect(grown.outsideGyms).toEqual([]);
+    // A region staged for removal holds nothing.
+    const removed = placeCounts(
+      drafts({ kind: 'remove', key: regionKey(2), forum: 'keep', bases: {} }),
+      DATA,
+    );
+    expect(removed.outsideGyms).toEqual([1, 2]);
+  });
+
+  it('names a region by its channel, a new one by the channel it takes or makes', () => {
+    const [west, , fresh] = drafts({
+      kind: 'add',
+      key: newKey(0),
+      outline: square(39.9, -80.1, 40, -80),
+      channel: { create: 'North Hills' },
+      description: null,
+    });
+    expect(draftLabel(west!)).toBe('#west');
+    expect(draftLabel(fresh!)).toBe('new channel North Hills');
+    const [, , none] = drafts({
+      kind: 'add',
+      key: newKey(0),
+      outline: square(39.9, -80.1, 40, -80),
+      channel: null,
+      description: null,
+    });
+    expect(draftLabel(none!)).toBe('new region (no channel yet)');
+  });
+
+  it('marks an outline that crosses itself', () => {
+    const crossing = [p(40, -80.1), p(40.1, -80), p(40.1, -80.1), p(40, -80), p(40, -80.1)];
+    const problems = outlineProblems(
+      drafts({ kind: 'outline', key: regionKey(1), outline: crossing, bases: {} }),
+    );
+    expect(problems).toEqual(new Map([[regionKey(1), 'its outline crosses or touches itself']]));
+  });
+
+  it('offers a new region the channels no other region has taken', () => {
+    const made = drafts(
+      {
+        kind: 'add',
+        key: newKey(0),
+        outline: square(39.9, -80.1, 40, -80),
+        channel: { id: '100000000000000005', name: 'south' },
+        description: null,
+      },
+      {
+        kind: 'add',
+        key: newKey(1),
+        outline: square(41, -80.1, 41.1, -80),
+        channel: null,
+        description: null,
+      },
+    );
+    expect(channelChoices(DATA.channels, made, newKey(1))).toEqual([
+      { id: '100000000000000006', name: 'north' },
+    ]);
+    expect(channelChoices(DATA.channels, made, newKey(0))).toEqual(DATA.channels);
+  });
+
+  it('says why Save is off', () => {
+    const ready = saveReadiness({
+      readOnly: false,
+      changes: true,
+      problems: new Map(),
+      missingChannel: [],
+      conflicts: 0,
+      fresh: { overlaps: 0, gaps: 0 },
+      checking: false,
+    });
+    expect(ready).toEqual({ ready: true, reasons: [] });
+    const notReady = saveReadiness({
+      readOnly: true,
+      changes: false,
+      problems: new Map([['r1', 'its outline crosses or touches itself']]),
+      missingChannel: ['n0'],
+      conflicts: 2,
+      fresh: { overlaps: 1, gaps: 2 },
+      checking: true,
+    });
+    expect(notReady.ready).toBe(false);
+    expect(notReady.reasons).toEqual([
+      'Discord cannot be reached just now, so the editor is read-only.',
+      'Nothing is changed.',
+      '1 outline cannot be saved (shown in red).',
+      '1 new region has no channel yet.',
+      '2 regions were changed by somebody else: take theirs or keep yours.',
+      'Your changes make 1 new overlap and 2 new gaps.',
+      'The overlaps and gaps are being worked out.',
+    ]);
+    // A page that cannot work them out (its worker failed) waits for nothing: the server checks.
+    expect(
+      saveReadiness({
+        readOnly: false,
+        changes: true,
+        problems: new Map(),
+        missingChannel: [],
+        conflicts: 0,
+        fresh: { overlaps: 0, gaps: 0 },
+        checking: true,
+        checkFailed: true,
+      }),
+    ).toEqual({ ready: true, reasons: [] });
+  });
+
+  it('describes an overlap or a gap by its size, its regions and what lies in it', () => {
+    expect(
+      pieceLine(
+        {
+          kind: 'overlap',
+          area: 1234.4,
+          between: ['r1', 'r2'],
+          fresh: true,
+          counts: { gym: 2, stop: 1, powerspot: 0, wayfarerGym: 0 },
+        },
+        (key) => (key === 'r1' ? '#west' : '#east'),
+      ),
+    ).toBe('New overlap of 1,234 m², #west and #east: 2 gyms, 1 stop');
+    expect(
+      pieceLine(
+        {
+          kind: 'gap',
+          area: 98765,
+          between: null,
+          fresh: false,
+          counts: { gym: 0, stop: 0, powerspot: 3, wayfarerGym: 1 },
+        },
+        () => '',
+      ),
+    ).toBe('Gap of 98,765 m²: 3 power spots, 1 Wayfarer gym');
+    expect(
+      pieceLine(
+        {
+          kind: 'gap',
+          area: 5,
+          between: null,
+          fresh: false,
+          counts: { gym: 0, stop: 0, powerspot: 0, wayfarerGym: 0 },
+        },
+        () => '',
+      ),
+    ).toBe('Gap of 5 m²');
+  });
+
+  it('knows which region a new one was split off', () => {
+    const state = record(emptyEdits(), {
+      kind: 'split',
+      key: regionKey(1),
+      keep: square(40, -80.1, 40.1, -80.05),
+      newKey: newKey(0),
+      other: square(40, -80.05, 40.1, -80),
+      bases: {},
+    });
+    expect(splitPartner(state, newKey(0))).toBe(regionKey(1));
+    expect(splitPartner(state, regionKey(1))).toBe(newKey(0));
+    expect(splitPartner(state, regionKey(2))).toBeUndefined();
+  });
+
+  it('refuses a new channel named as a channel the server has, as the server would', () => {
+    expect(newChannelProblem('South', DATA.channels, LOADED)).toBe(
+      '#south exists: pick it from the list.',
+    );
+    expect(newChannelProblem('#West', DATA.channels, LOADED)).toBe(
+      '#west exists already: pick another name.',
+    );
+    expect(newChannelProblem('!!!', DATA.channels, LOADED)).toBe(
+      'That name gives no channel name: use letters or digits.',
+    );
+    expect(newChannelProblem('North Hills', DATA.channels, LOADED)).toBeUndefined();
+  });
+
+  it('saves only what it previewed', () => {
+    const moved = drafts({
+      kind: 'outline',
+      key: regionKey(1),
+      outline: square(40, -80.1, 40.1, -80.02),
+      bases: {},
+    });
+    const previewed = saveBody(LOADED, moved);
+    // The versions of the data are invented: every region is sent as changed.
+    expect((JSON.parse(previewed) as SaveRequest).changes[0]).toEqual({
+      regionId: 1,
+      outline: points(square(40, -80.1, 40.1, -80.02)),
+      version: 'AAAAAAAAAAAAAAAA',
+    });
+    expect(saveBody(LOADED, moved)).toBe(previewed);
+    const movedAgain = drafts({
+      kind: 'outline',
+      key: regionKey(1),
+      outline: square(40, -80.1, 40.1, -80.03),
+      bases: {},
+    });
+    expect(saveBody(LOADED, movedAgain)).not.toBe(previewed);
+  });
+
+  it('tells an answer it can read from one whose outcome is not known', () => {
+    const saved = { kind: 'saved', worded: { lines: ['Imported 1 region.'], lists: [] } };
+    expect(readSaveAnswer(200, JSON.stringify(saved))).toEqual({ kind: 'answer', answer: saved });
+    const conflicts = { kind: 'conflicts', conflicts: [] };
+    expect(readSaveAnswer(409, JSON.stringify(conflicts))).toEqual({
+      kind: 'answer',
+      answer: conflicts,
+    });
+    // Refused before anything was done: said as it is.
+    expect(readSaveAnswer(429, '{"error":"Too many requests. Try again in a minute."}')).toEqual({
+      kind: 'refused',
+      text: 'Too many requests. Try again in a minute.',
+    });
+    // A failure on the way, or an answer cut off: what the server did is not known.
+    expect(readSaveAnswer(500, '{"error":"Something went wrong."}')).toEqual({ kind: 'unknown' });
+    expect(readSaveAnswer(502, '<html>Bad gateway</html>')).toEqual({ kind: 'unknown' });
+    expect(readSaveAnswer(200, '{"kind":"saved","wor')).toEqual({ kind: 'unknown' });
+    expect(readSaveAnswer(200, '{"kind":"exploded"}')).toEqual({ kind: 'unknown' });
+  });
+
+  it('keeps staged edits per server and member, and names an export after the server', () => {
+    expect(storageKey(DATA.guild.id, DATA.userId)).toBe(
+      'pine-region-edits:412345678901234567:700000000000000001',
+    );
+    expect(exportFileName(DATA.guild)).toBe('Pinewood-Raids-regions.kml');
+    expect(exportFileName({ id: '412345678901234567', name: '../???' })).toBe(
+      '412345678901234567-regions.kml',
+    );
+  });
+});
diff --git a/src/web/client/editor-view.ts b/src/web/client/editor-view.ts
new file mode 100644
index 0000000000000000000000000000000000000000..971a9e6c91357c101324d7e0826bcc220824c77b
--- /dev/null
+++ b/src/web/client/editor-view.ts
@@ -0,0 +1,306 @@
+import type { LatLon } from '../../domain/geo/lat-lon.js';
+import { tidyOutline, type OutlineProblem } from '../../domain/geo/outline.js';
+import { containment } from '../../domain/geo/region-membership.js';
+import {
+  saveRequest,
+  type Draft,
+  type EditState,
+  type LoadedRegion,
+} from '../../domain/regions/edits.js';
+import { channelKey } from '../../domain/regions/region-import.js';
+import type { EditorData, SaveAnswer } from '../../domain/web/editor-data.js';
+
+/**
+ * What the region editor's page shows of the staged regions (plan 8M-2), as pure functions the
+ * page draws with: gym counts and the places in no region, labels, which outlines cannot be
+ * saved and why Save is off, the lines of the overlaps and gaps, the channels a new region may
+ * take. Tested without a browser.
+ */
+
+/** `1 gym`, `2 gyms`. */
+export const count = (n: number, singular: string, plural = `${singular}s`): string =>
+  `${n} ${n === 1 ? singular : plural}`;
+
+/** The regions of the editor's data as the staged edits take them. */
+export function loadedRegions(data: EditorData): LoadedRegion[] {
+  return data.regions.map((region) => ({
+    id: region.id,
+    channelId: region.channelId,
+    name: region.name,
+    category: region.category,
+    description: region.description,
+    outline: region.outline && region.outline.map(([lat, lon]) => ({ lat, lon })),
+    version: region.version,
+  }));
+}
+
+/** The outlines of the drafts that count (not staged for removal), as tests of places. */
+function containers(drafts: readonly Draft[]): { key: string; contains: (p: LatLon) => boolean }[] {
+  return drafts.flatMap((draft) =>
+    draft.removed === null && draft.outline !== null && draft.outline.length >= 4
+      ? [{ key: draft.key, contains: containment(draft.outline) }]
+      : [],
+  );
+}
+
+/** How many gyms each region holds, and which gyms and Wayspots lie in none (by index). */
+export interface PlaceCounts {
+  gyms: Map<string, number>;
+  /** Indexes into `EditorData.gyms`. */
+  outsideGyms: number[];
+  /** Indexes into `EditorData.wayspots`. */
+  outsideWayspots: number[];
+}
+
+/** The gyms in each staged region, and the gyms and Wayspots in none (spec 4.1, 4.2a). */
+export function placeCounts(
+  drafts: readonly Draft[],
+  data: Pick<EditorData, 'gyms' | 'wayspots'>,
+): PlaceCounts {
+  const tests = containers(drafts);
+  const gyms = new Map(tests.map(({ key }) => [key, 0]));
+  const outsideGyms: number[] = [];
+  data.gyms.forEach(([, lat, lon], index) => {
+    let inside = false;
+    for (const test of tests) {
+      if (!test.contains({ lat, lon })) continue;
+      inside = true;
+      gyms.set(test.key, (gyms.get(test.key) ?? 0) + 1);
+    }
+    if (!inside) outsideGyms.push(index);
+  });
+  const outsideWayspots: number[] = [];
+  data.wayspots.forEach(([, lat, lon], index) => {
+    if (!tests.some((test) => test.contains({ lat, lon }))) outsideWayspots.push(index);
+  });
+  return { gyms, outsideGyms, outsideWayspots };
+}
+
+/** How a region is named on the page: `#west`, or what a new one takes or makes. */
+export function draftLabel(draft: Draft): string {
+  const { channel } = draft;
+  if (draft.regionId !== null) return channel && 'id' in channel ? `#${channel.name}` : 'region';
+  if (channel === null) return 'new region (no channel yet)';
+  return 'id' in channel ? `new region #${channel.name}` : `new channel ${channel.create}`;
+}
+
+/** Why an outline cannot be a region's, in words after "its outline …". */
+export function outlineProblemWords(problem: OutlineProblem): string {
+  switch (problem.kind) {
+    case 'not-a-number':
+    case 'out-of-range':
+      return 'its outline has a corner that is no place on earth';
+    case 'too-few':
+      return 'its outline has fewer than three corners';
+    case 'too-many':
+      return `its outline has ${problem.corners} corners, more than 5,000`;
+    case 'crosses-itself':
+      return 'its outline crosses or touches itself';
+  }
+}
+
+/** The staged regions whose outlines cannot be saved (`tidyOutline`), with why. */
+export function outlineProblems(drafts: readonly Draft[]): Map<string, string> {
+  const problems = new Map<string, string>();
+  for (const draft of drafts) {
+    if (draft.removed !== null || draft.outline === null) continue;
+    const tidy = tidyOutline(draft.outline);
+    if (!tidy.ok) problems.set(draft.key, outlineProblemWords(tidy.problem));
+  }
+  return problems;
+}
+
+/**
+ * The text channels a new region may take: those of the server that are no region, less those
+ * another staged region has taken.
+ */
+export function channelChoices(
+  channels: EditorData['channels'],
+  drafts: readonly Draft[],
+  key: string,
+): EditorData['channels'] {
+  const taken = new Set(
+    drafts.flatMap((draft) =>
+      draft.key !== key && draft.removed === null && draft.channel && 'id' in draft.channel
+        ? [draft.channel.id]
+        : [],
+    ),
+  );
+  return channels.filter((channel) => !taken.has(channel.id));
+}
+
+/**
+ * Why a new channel cannot have this name, as the server refuses it (`planSave`): it gives no
+ * channel name, or the server has a channel of the name (`channelKey`), which a new region
+ * takes from the list when it is no region yet. Undefined when it may. The page knows the text
+ * channels that are no region and those of the regions; a forum of the name the server refuses.
+ */
+export function newChannelProblem(
+  name: string,
+  channels: EditorData['channels'],
+  loaded: readonly LoadedRegion[],
+): string | undefined {
+  const key = channelKey(name);
+  if (key === '') return 'That name gives no channel name: use letters or digits.';
+  const listed = channels.find((channel) => channelKey(channel.name) === key);
+  if (listed) return `#${listed.name} exists: pick it from the list.`;
+  const region = loaded.find((one) => channelKey(one.name) === key);
+  if (region) return `#${region.name} exists already: pick another name.`;
+  return undefined;
+}
+
+/**
+ * The body a save of the drafts sends (`saveRequest`), as text: Save sends exactly the body its
+ * preview was of, and previews again when the drafts give another.
+ */
+export const saveBody = (loaded: readonly LoadedRegion[], drafts: readonly Draft[]): string =>
+  JSON.stringify(saveRequest(loaded, drafts).request);
+
+/**
+ * What came back of a preview or a save: an `answer` of the server; a request it `refused`
+ * before doing anything (a 4xx or 503 with its words); or an answer whose outcome is `unknown`
+ * (a failure on the way, an answer cut off or of no kind the page knows): a save may have been
+ * done then.
+ */
+export type ReadAnswer =
+  { kind: 'answer'; answer: SaveAnswer } | { kind: 'refused'; text: string } | { kind: 'unknown' };
+
+const ANSWER_KINDS: ReadonlySet<unknown> = new Set(['preview', 'saved', 'refused', 'conflicts']);
+/** The statuses of a refusal before anything is done (`editorRoutes`, the guards). */
+const REFUSALS: ReadonlySet<number> = new Set([400, 401, 403, 404, 413, 415, 429, 503]);
+
+/** Reads what came back of a preview or a save by its status and its text. */
+export function readSaveAnswer(status: number, text: string): ReadAnswer {
+  let body: unknown;
+  try {
+    body = JSON.parse(text);
+  } catch {
+    return { kind: 'unknown' };
+  }
+  if (typeof body !== 'object' || body === null) return { kind: 'unknown' };
+  if ((status === 200 || status === 409 || status === 422) && 'kind' in body) {
+    return ANSWER_KINDS.has(body.kind)
+      ? { kind: 'answer', answer: body as SaveAnswer }
+      : { kind: 'unknown' };
+  }
+  if (REFUSALS.has(status) && 'error' in body && typeof body.error === 'string') {
+    return { kind: 'refused', text: body.error };
+  }
+  return { kind: 'unknown' };
+}
+
+/** What decides whether Save is offered. */
+export interface ReadinessInput {
+  readOnly: boolean;
+  /** Whether anything is staged that a save would send. */
+  changes: boolean;
+  /** `outlineProblems`. */
+  problems: ReadonlyMap<string, string>;
+  /** New regions without a channel (`saveRequest`). */
+  missingChannel: readonly string[];
+  /** Regions changed or removed by somebody else, not yet resolved. */
+  conflicts: number;
+  /** The overlaps and gaps the staged edits make. */
+  fresh: { overlaps: number; gaps: number };
+  /** Whether the overlaps and gaps of the last edit are still being worked out. */
+  checking: boolean;
+  /**
+   * Whether the page cannot work them out (its worker failed to load or to cut the outlines):
+   * Save then waits for nothing, and the server's own check refuses what is new.
+   */
+  checkFailed?: boolean;
+}
+
+/** Whether Save is offered, and every reason it is not. */
+export function saveReadiness(input: ReadinessInput): { ready: boolean; reasons: string[] } {
+  const reasons: string[] = [];
+  if (input.readOnly)
+    reasons.push('Discord cannot be reached just now, so the editor is read-only.');
+  if (!input.changes) reasons.push('Nothing is changed.');
+  if (input.problems.size > 0) {
+    reasons.push(`${count(input.problems.size, 'outline')} cannot be saved (shown in red).`);
+  }
+  if (input.missingChannel.length > 0) {
+    reasons.push(
+      `${count(input.missingChannel.length, 'new region')} ` +
+        `${input.missingChannel.length === 1 ? 'has' : 'have'} no channel yet.`,
+    );
+  }
+  if (input.conflicts > 0) {
+    reasons.push(
+      `${count(input.conflicts, 'region')} ${input.conflicts === 1 ? 'was' : 'were'} changed by ` +
+        'somebody else: take theirs or keep yours.',
+    );
+  }
+  const { overlaps, gaps } = input.fresh;
+  if (overlaps + gaps > 0) {
+    const made = [
+      ...(overlaps > 0 ? [count(overlaps, 'new overlap')] : []),
+      ...(gaps > 0 ? [count(gaps, 'new gap')] : []),
+    ];
+    reasons.push(`Your changes make ${made.join(' and ')}.`);
+  }
+  if (input.checking && input.checkFailed !== true) {
+    reasons.push('The overlaps and gaps are being worked out.');
+  }
+  return { ready: reasons.length === 0, reasons };
+}
+
+/** What lies in an overlap or a gap, by kind. */
+export interface PlaceKinds {
+  gym: number;
+  stop: number;
+  powerspot: number;
+  wayfarerGym: number;
+}
+
+/** An overlap or a gap as the page lists it. */
+export interface ListedPiece {
+  kind: 'overlap' | 'gap';
+  area: number;
+  between: [string, string] | null;
+  /** Made by the staged edits (Save refuses it). */
+  fresh: boolean;
+  counts: PlaceKinds;
+}
+
+/** "New overlap of 1,234 m², #west and #east: 2 gyms, 1 stop". */
+export function pieceLine(piece: ListedPiece, name: (key: string) => string): string {
+  const what = piece.kind === 'overlap' ? 'overlap' : 'gap';
+  const head = `${piece.fresh ? `New ${what}` : what === 'overlap' ? 'Overlap' : 'Gap'} of ${Math.round(
+    piece.area,
+  ).toLocaleString('en-US')} m²`;
+  const between = piece.between ? `, ${name(piece.between[0])} and ${name(piece.between[1])}` : '';
+  const { gym, stop, powerspot, wayfarerGym } = piece.counts;
+  const inside = [
+    ...(gym > 0 ? [count(gym, 'gym')] : []),
+    ...(stop > 0 ? [count(stop, 'stop')] : []),
+    ...(powerspot > 0 ? [count(powerspot, 'power spot')] : []),
+    ...(wayfarerGym > 0 ? [count(wayfarerGym, 'Wayfarer gym')] : []),
+  ];
+  return `${head}${between}${inside.length > 0 ? `: ${inside.join(', ')}` : ''}`;
+}
+
+/** The region a region was split from, or that was split off it, by the last split of either. */
+export function splitPartner(state: EditState, key: string): string | undefined {
+  for (const edit of [...state.edits].reverse()) {
+    if (edit.kind !== 'split') continue;
+    if (edit.newKey === key) return edit.key;
+    if (edit.key === key) return edit.newKey;
+  }
+  return undefined;
+}
+
+/** Where the staged edits of a member are kept in the browser, per server. */
+export const storageKey = (guildId: string, userId: string): string =>
+  `pine-region-edits:${guildId}:${userId}`;
+
+/** The name of an exported file: the server's name as letters, digits and hyphens, or its id. */
+export function exportFileName(guild: { id: string; name: string }): string {
+  const name = guild.name
+    .normalize('NFKD')
+    .replace(/[^\p{L}\p{N}]+/gu, '-')
+    .replace(/^-+|-+$/gu, '')
+    .slice(0, 60);
+  return `${name === '' ? guild.id : name}-regions.kml`;
+}
diff --git a/src/web/client/editor-worker.ts b/src/web/client/editor-worker.ts
new file mode 100644
index 0000000000000000000000000000000000000000..338562f5b42a93bf94f8cb922de57d243e45ef7a
--- /dev/null
+++ b/src/web/client/editor-worker.ts
@@ -0,0 +1,16 @@
+import { CoverageChecker, type CoverageRequest } from './coverage-check.js';
+
+/**
+ * The region editor's worker (plan 8M-2): works out the overlaps and gaps of the staged regions
+ * (`CoverageChecker`) off the page's thread, which stays free for drawing. A script of Pine's,
+ * so the CSP's `script-src 'self'` lets it run.
+ */
+const scope = globalThis as unknown as {
+  onmessage: ((event: MessageEvent<CoverageRequest>) => void) | null;
+  postMessage(message: unknown): void;
+};
+const checker = new CoverageChecker();
+scope.onmessage = (event) => {
+  const answer = checker.handle(event.data);
+  if (answer) scope.postMessage(answer);
+};
diff --git a/src/web/client/editor.css b/src/web/client/editor.css
new file mode 100644
index 0000000000000000000000000000000000000000..1724362dbd1fa4cd1ac75b68a782eb299bb9b549
--- /dev/null
+++ b/src/web/client/editor.css
@@ -0,0 +1,103 @@
+@import './map.css';
+@import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
+
+#tools {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 6px;
+}
+
+#tools button {
+  color: #1f2328;
+  background: #e8efe9;
+  border: 0;
+  border-radius: 4px;
+  padding: 4px 10px;
+  font: inherit;
+  cursor: pointer;
+}
+
+#tools button:disabled {
+  opacity: 0.5;
+  cursor: default;
+}
+
+#editor {
+  flex: 1;
+  display: flex;
+  min-height: 0;
+}
+
+#panel {
+  width: 360px;
+  max-width: 45vw;
+  overflow-y: auto;
+  padding: 8px 12px;
+  border-left: 1px solid #ccd;
+  font-size: 14px;
+}
+
+#panel h2 {
+  font-size: 15px;
+  margin: 12px 0 4px;
+}
+
+#panel h3 {
+  font-size: 14px;
+  margin: 8px 0 2px;
+}
+
+#panel ul {
+  margin: 0;
+  padding-left: 18px;
+}
+
+#panel li {
+  margin: 2px 0;
+}
+
+#panel select,
+#panel input {
+  display: block;
+  width: 100%;
+  margin: 4px 0;
+  font: inherit;
+  box-sizing: border-box;
+}
+
+#panel .actions button,
+#panel .dialog button,
+#panel .conflict button {
+  margin: 4px 6px 0 0;
+  font: inherit;
+}
+
+#panel .reasons li,
+#panel .warning {
+  color: #8a5a00;
+}
+
+#panel .region-list li,
+#panel .piece-list li {
+  cursor: pointer;
+}
+
+#panel .region-list li.chosen {
+  font-weight: 600;
+}
+
+#panel .piece-list li.fresh {
+  color: #b00020;
+  font-weight: 600;
+}
+
+#panel .dialog {
+  border: 1px solid #8aa;
+  border-radius: 4px;
+  padding: 4px 10px 10px;
+  background: #f7faf7;
+}
+
+#panel .conflict {
+  margin: 6px 0;
+}
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
new file mode 100644
index 0000000000000000000000000000000000000000..38d905a2f1be6ca3dd5799e4236eefabcd9672da
--- /dev/null
+++ b/src/web/client/editor.ts
@@ -0,0 +1,1134 @@
+import * as L from 'leaflet';
+// Leaflet first: Geoman's script adds itself to the global `L` that Leaflet's sets.
+import '@geoman-io/leaflet-geoman-free';
+import { readKml, writeKml, type KmlProblem } from '../../domain/geo/kml.js';
+import type { LatLon } from '../../domain/geo/lat-lon.js';
+import {
+  applyEdits,
+  exportAreas,
+  kmlEdit,
+  newKey,
+  rebaseAfterSave,
+  record,
+  redo,
+  saveRequest,
+  undo,
+  type Applied,
+  type Bases,
+  type ChannelChoice,
+  type Draft,
+  type Edit,
+  type EditState,
+  type LoadedRegion,
+} from '../../domain/regions/edits.js';
+import { splitOutline, type Split } from '../../domain/regions/split.js';
+import { normalisedOutline } from '../../domain/regions/version.js';
+import type { EditorData, Worded } from '../../domain/web/editor-data.js';
+import { addTiles, byId, getJson, say, showAccount, whoIsAsking } from './common.js';
+import type {
+  CoverageAnswer,
+  CoverageRegion,
+  CoverageRequest,
+  PlaceKind,
+  ShownPiece,
+} from './coverage-check.js';
+import {
+  channelChoices,
+  count,
+  draftLabel,
+  exportFileName,
+  loadedRegions,
+  newChannelProblem,
+  outlineProblems,
+  pieceLine,
+  placeCounts,
+  readSaveAnswer,
+  saveBody,
+  saveReadiness,
+  splitPartner,
+  storageKey,
+  type PlaceCounts,
+  type ReadAnswer,
+} from './editor-view.js';
+import { tileLayers } from './layers.js';
+import { loginNotice, type Me } from './notice.js';
+import { regionLabel, renderNode } from './popup.js';
+import { browserStorage, readStaged, writeStaged } from './staged-storage.js';
+
+/**
+ * The region editor (spec 4, plan 8M-2), bundled by `scripts/web/build.ts` beside the map:
+ * Leaflet (on a canvas, for thousands of places) with Geoman's tools to draw, reshape and move
+ * regions, snapping to the corners and edges of every outline; the server's regions labelled
+ * with their channels and gym counts, other servers' in grey; the gyms, stops, power spots and
+ * Wayfarer gyms, those in no region in a warning colour; the overlaps and gaps (worked out in a
+ * worker) shaded and listed. Every change is a staged edit (`edits.ts`), kept in the browser,
+ * undone and redone, and saved through a preview. Everything from data is set as text.
+ */
+
+const PALETTE = [
+  '#3060c0',
+  '#2d7a3a',
+  '#a05a00',
+  '#7a3ab0',
+  '#00838f',
+  '#9e2a5e',
+  '#5d6d00',
+  '#c0392b',
+];
+const BROKEN = '#d00000';
+const OTHERS = '#8a8a8a';
+const GYM = '#2d7a3a';
+const STOP = '#1e88e5';
+const POWERSPOT = '#8e24aa';
+const WAYFARER_GYM = '#6d4c41';
+const OUTSIDE = '#ff8f00';
+const OVERLAP = '#e53935';
+const GAP = '#6a1b9a';
+const THEIRS = '#1565c0';
+/** How long the editor waits after an edit before the overlaps and gaps are worked out again. */
+const CHECK_DELAY_MS = 400;
+/** How many overlaps and gaps the panel lists; the map shades them all. */
+const LISTED_PIECES = 200;
+/** The largest KML file the editor reads, as `/region import` takes. */
+const MAX_KML_BYTES = 1_000_000;
+
+/** Why a file cannot be read as KML, in a sentence (as `/region import` says it, shorter). */
+const KML_PROBLEMS: Readonly<Record<KmlProblem, string>> = {
+  kmz: 'That is a KMZ file (a zipped KML): export as KML instead.',
+  'not-xml': 'That file is not well-formed XML.',
+  doctype: 'That file declares a document type, which is never read.',
+  'too-deep': 'That file is nested deeper than any KML.',
+  'not-kml': 'That file is XML, but not KML.',
+  'no-areas': 'That file has no areas: draw each region as a shape.',
+  'too-many-areas': 'That file has more than 200 areas.',
+  'too-many-corners': 'The outlines of that file have more than 20,000 corners in all.',
+};
+
+const SPLIT_PROBLEMS: Readonly<Record<Extract<Split, { ok: false }>['reason'], string>> = {
+  'not-across': 'Draw the line across the region: from outside it, through it, to outside it.',
+  'several-crossings':
+    'The line crosses the region more than once: draw one that goes across it once.',
+  'crosses-itself': 'The line crosses itself inside the region.',
+  'too-many-corners': 'A part would have more than 5,000 corners.',
+};
+
+/** An element with a class and text. */
+function element<K extends keyof HTMLElementTagNameMap>(
+  tag: K,
+  text?: string,
+  className?: string,
+): HTMLElementTagNameMap[K] {
+  const made = document.createElement(tag);
+  if (text !== undefined) made.textContent = text;
+  if (className !== undefined) made.className = className;
+  return made;
+}
+
+function button(text: string, onClick: () => void, disabled = false): HTMLButtonElement {
+  const made = element('button', text);
+  made.type = 'button';
+  made.disabled = disabled;
+  made.addEventListener('click', onClick);
+  return made;
+}
+
+/** A polygon's outer ring as places, closed, as the staged edits keep it (`normalisedOutline`). */
+function ringOf(layer: L.Polygon): LatLon[] {
+  const rings = layer.getLatLngs() as L.LatLng[][];
+  const ring = (rings[0] ?? []).map(({ lat, lng }) => ({ lat, lon: lng }));
+  const first = ring[0];
+  if (first) ring.push({ ...first });
+  return normalisedOutline(ring);
+}
+
+/** Places as Leaflet takes them (`lng`, not `lon`). */
+const latLngs = (outline: readonly LatLon[]): L.LatLngTuple[] =>
+  outline.map(({ lat, lon }) => [lat, lon]);
+
+const sameRing = (a: readonly LatLon[] | null, b: readonly LatLon[]): boolean =>
+  a !== null &&
+  a.length === b.length &&
+  a.every((p, i) => p.lat === b[i]?.lat && p.lon === b[i]?.lon);
+
+/** Shows a preview's or an outcome's sentences and lists in an element, as text. */
+function showWorded(target: HTMLElement, worded: Worded): void {
+  for (const line of worded.lines) target.append(element('p', line));
+  for (const list of worded.lists) {
+    target.append(element('h3', list.title));
+    const items = element('ul');
+    for (const item of list.items) items.append(element('li', item));
+    target.append(items);
+  }
+}
+
+class Editor {
+  private loaded: LoadedRegion[];
+  private state: EditState;
+  private applied: Applied;
+  private counts: PlaceCounts;
+  private selected: string | undefined;
+  private splitting: string | undefined;
+  private pieces: ShownPiece[] = [];
+  private checking = false;
+  private checkFailed = false;
+  private seq = 0;
+  private timer: number | undefined;
+  /** What became of the staged edits in the browser the last time (`writeStaged`). */
+  private stored: 'kept' | 'full' | 'none' = 'kept';
+  /** The body the last preview was of: Save sends it, and only it. */
+  private previewed: string | undefined;
+  private dialog: HTMLElement | undefined;
+  private readonly key: string;
+  private readonly regions = L.featureGroup();
+  private readonly removed = L.layerGroup();
+  private readonly theirs = L.layerGroup();
+  private readonly shaded = L.layerGroup();
+  private readonly regionLayers = new Map<string, L.Polygon>();
+  private gymDots: L.CircleMarker[] = [];
+  private wayspotDots: L.CircleMarker[] = [];
+  private outsideBefore = { gyms: new Set<number>(), wayspots: new Set<number>() };
+  private coloured = false;
+  private readonly versions = new WeakMap<readonly LatLon[], string>();
+  private versionCount = 0;
+  /** The browser's storage, or none where it keeps nothing for the page. */
+  private readonly storage = browserStorage(() => window.localStorage);
+
+  constructor(
+    private readonly map: L.Map,
+    private data: EditorData,
+    private me: Me,
+    private readonly worker: Worker,
+  ) {
+    this.key = storageKey(data.guild.id, data.userId);
+    this.loaded = loadedRegions(data);
+    this.state = readStaged(this.storage, this.key);
+    this.applied = applyEdits(this.loaded, this.state);
+    this.counts = placeCounts(this.applied.drafts, data);
+    worker.addEventListener('message', (event: MessageEvent<CoverageAnswer>) => {
+      this.answered(event.data);
+    });
+    // A worker that does not load works nothing out: Save then waits for nothing (the server
+    // checks the overlaps and gaps of a save itself).
+    worker.addEventListener('error', () => {
+      this.checking = false;
+      this.checkFailed = true;
+      this.toolbar();
+      this.panel();
+    });
+  }
+
+  start(): void {
+    const { map, data } = this;
+    const others = L.layerGroup(
+      data.others.map((other) =>
+        // Not editable, but snapped to: shared borders meet.
+        L.polygon(other.outline, {
+          color: OTHERS,
+          weight: 1,
+          dashArray: '4 4',
+          fillOpacity: 0.03,
+          pmIgnore: true,
+          snapIgnore: false,
+        }),
+      ),
+    );
+    const dot = (lat: number, lon: number, colour: string, radius: number): L.CircleMarker =>
+      L.circleMarker([lat, lon], {
+        radius,
+        weight: 1,
+        color: colour,
+        fillColor: colour,
+        fillOpacity: 0.8,
+        pmIgnore: true,
+      });
+    // Tooltips are made when shown: tens of thousands of places.
+    this.gymDots = data.gyms.map(([, lat, lon, name]) =>
+      dot(lat, lon, GYM, 5).bindTooltip(() => renderNode({ tag: 'span', text: name }, document)),
+    );
+    this.wayspotDots = data.wayspots.map(([kind, lat, lon, title]) =>
+      dot(
+        lat,
+        lon,
+        kind === 'stop' ? STOP : kind === 'powerspot' ? POWERSPOT : WAYFARER_GYM,
+        kind === 'stop' ? 3 : 4,
+      ).bindTooltip(() => renderNode({ tag: 'span', text: title }, document)),
+    );
+    const ofKind = (kind: string): L.LayerGroup =>
+      L.layerGroup(this.wayspotDots.filter((_dot, i) => data.wayspots[i]?.[0] === kind));
+    const gyms = L.layerGroup(this.gymDots).addTo(map);
+    const stops = ofKind('stop');
+    const powerspots = ofKind('powerspot').addTo(map);
+    const wayfarerGyms = ofKind('gym').addTo(map);
+    others.addTo(map);
+    this.regions.addTo(map);
+    this.removed.addTo(map);
+    this.theirs.addTo(map);
+    this.shaded.addTo(map);
+    // The names are constants of ours: Leaflet sets them as HTML.
+    L.control
+      .layers(
+        undefined,
+        {
+          Gyms: gyms,
+          'Stops (many: off at first)': stops,
+          'Power spots': powerspots,
+          'Wayfarer gyms Pine did not take': wayfarerGyms,
+          "Other servers' regions": others,
+          'Overlaps and gaps': this.shaded,
+        },
+        { position: 'topright', collapsed: true },
+      )
+      .addTo(map);
+    if (!data.readOnly) this.tools();
+    this.toolbar();
+    this.drawRegions();
+    this.recolour();
+    const bounds = this.regions.getBounds();
+    if (bounds.isValid()) map.fitBounds(bounds);
+    else say('This server has no regions yet: draw the first one.');
+    this.post({ kind: 'loaded', regions: this.loadedCoverage(), places: this.places() });
+    this.check();
+    this.panel();
+  }
+
+  /** Geoman's tools: draw a polygon or a rectangle, reshape, move; snapping on. */
+  private tools(): void {
+    const { map } = this;
+    map.pm.addControls({
+      position: 'topleft',
+      drawMarker: false,
+      drawCircleMarker: false,
+      drawPolyline: false,
+      drawCircle: false,
+      drawText: false,
+      drawRectangle: true,
+      drawPolygon: true,
+      editMode: true,
+      dragMode: true,
+      cutPolygon: false,
+      removalMode: false,
+      rotateMode: false,
+    });
+    map.pm.setGlobalOptions({ snappable: true, snapDistance: 15, exitModeOnEscape: true });
+    map.on('pm:create', (event: { shape: string; layer: L.Layer }) => {
+      const { shape, layer } = event;
+      layer.remove();
+      if (shape === 'Line' && this.splitting !== undefined) {
+        this.split(this.splitting, (layer as L.Polyline).getLatLngs() as L.LatLng[]);
+        return;
+      }
+      if (shape !== 'Polygon' && shape !== 'Rectangle') return;
+      const key = newKey(this.state.next);
+      this.edit({
+        kind: 'add',
+        key,
+        outline: ringOf(layer as L.Polygon),
+        channel: null,
+        description: null,
+      });
+      this.selected = key;
+      this.redraw();
+    });
+  }
+
+  /** The header's tools: undo, redo, a KML file in and out, Save. */
+  private toolbar(): void {
+    const tools = byId('tools');
+    tools.replaceChildren();
+    const readOnly = this.data.readOnly;
+    const file = element('input');
+    file.type = 'file';
+    file.accept = '.kml';
+    file.hidden = true;
+    file.addEventListener('change', () => {
+      const chosen = file.files?.[0];
+      file.value = '';
+      if (chosen) void this.loadKml(chosen);
+    });
+    const ready = this.readiness();
+    tools.append(
+      button('Undo', () => this.step(undo), readOnly || this.state.edits.length === 0),
+      button('Redo', () => this.step(redo), readOnly || this.state.undone.length === 0),
+      button('Load KML', () => file.click(), readOnly),
+      file,
+      button('Export KML', () => this.exportKml()),
+      button('Save…', () => void this.preview(), !ready.ready),
+    );
+  }
+
+  /** The versions of the loaded regions these keys stand for, as an edit carries them. */
+  private bases(keys: readonly string[]): Bases {
+    const bases: Bases = {};
+    for (const key of keys) {
+      const region = this.loaded.find((one) => `r${one.id}` === key);
+      if (region) bases[key] = region.version;
+    }
+    return bases;
+  }
+
+  /** Records an edit, keeps the state in the browser and shows what it changed. */
+  private edit(made: Edit): void {
+    this.state = record(this.state, made, { at: Date.now() });
+    this.changed();
+  }
+
+  private step(move: (state: EditState) => EditState): void {
+    this.state = move(this.state);
+    this.changed();
+    this.redraw();
+  }
+
+  /** After every change of the staged edits: kept, counted, coloured, checked, shown. */
+  private changed(): void {
+    this.applied = applyEdits(this.loaded, this.state);
+    const stored = writeStaged(this.storage, this.key, this.state);
+    if (stored !== this.stored) {
+      if (stored === 'full') {
+        say("This browser's storage for the page is full: save or discard some changes.");
+      } else if (stored === 'none') {
+        say('This browser keeps nothing for the page: a reload loses what is staged.');
+      }
+    }
+    this.stored = stored;
+    this.counts = placeCounts(this.applied.drafts, this.data);
+    this.recolour();
+    this.labels();
+    this.check();
+    this.toolbar();
+    this.panel();
+  }
+
+  private draft(key: string): Draft | undefined {
+    return this.applied.drafts.find((draft) => draft.key === key);
+  }
+
+  /** The colour of a region: its own, or red when its outline cannot be saved. */
+  private colour(draft: Draft, index: number, problems: ReadonlyMap<string, string>): string {
+    return problems.has(draft.key)
+      ? BROKEN
+      : (PALETTE[index % PALETTE.length] ?? PALETTE[0] ?? '#3060c0');
+  }
+
+  /** Draws every region anew (after an undo, a split, a file): Geoman's modes are kept. */
+  private redraw(): void {
+    const { pm } = this.map;
+    const editing = !this.data.readOnly && pm.globalEditModeEnabled();
+    const dragging = !this.data.readOnly && pm.globalDragModeEnabled();
+    if (editing) pm.disableGlobalEditMode();
+    if (dragging) pm.disableGlobalDragMode();
+    this.drawRegions();
+    if (editing) pm.enableGlobalEditMode();
+    if (dragging) pm.enableGlobalDragMode();
+  }
+
+  private drawRegions(): void {
+    this.regions.clearLayers();
+    this.removed.clearLayers();
+    this.theirs.clearLayers();
+    this.regionLayers.clear();
+    const problems = outlineProblems(this.applied.drafts);
+    this.applied.drafts.forEach((draft, index) => {
+      if (draft.outline === null) return;
+      if (draft.removed !== null) {
+        L.polygon(latLngs(draft.outline), {
+          color: OTHERS,
+          weight: 2,
+          dashArray: '6 6',
+          fillOpacity: 0,
+          pmIgnore: true,
+        })
+          .on('click', () => this.select(draft.key))
+          .addTo(this.removed);
+        return;
+      }
+      const layer = L.polygon(latLngs(draft.outline), {
+        color: this.colour(draft, index, problems),
+        weight: draft.key === this.selected ? 4 : 2,
+        fillOpacity: 0.06,
+        pmIgnore: this.data.readOnly,
+      });
+      layer.bindTooltip(renderNode(regionLabel(this.labelText(draft)), document), {
+        permanent: true,
+        direction: 'center',
+        className: 'region-label',
+      });
+      layer.on('click', () => this.select(draft.key));
+      const reshaped = (): void => this.reshaped(draft.key, layer);
+      layer.on('pm:edit', reshaped);
+      layer.on('pm:dragend', reshaped);
+      layer.addTo(this.regions);
+      this.regionLayers.set(draft.key, layer);
+    });
+    // Regions changed by somebody else: how they are now, dashed beside the staged ones.
+    for (const id of this.applied.conflicts) {
+      const region = this.loaded.find((one) => one.id === id);
+      if (region?.outline) {
+        L.polygon(latLngs(region.outline), {
+          color: THEIRS,
+          weight: 2,
+          dashArray: '2 6',
+          fillOpacity: 0,
+          pmIgnore: true,
+        }).addTo(this.theirs);
+      }
+    }
+  }
+
+  private labelText(draft: Draft): string {
+    return `${draftLabel(draft)} · ${count(this.counts.gyms.get(draft.key) ?? 0, 'gym')}`;
+  }
+
+  /** The labels and colours of the regions, without drawing them anew (during an edit). */
+  private labels(): void {
+    const problems = outlineProblems(this.applied.drafts);
+    this.applied.drafts.forEach((draft, index) => {
+      const layer = this.regionLayers.get(draft.key);
+      if (!layer) return;
+      layer.setTooltipContent(renderNode(regionLabel(this.labelText(draft)), document));
+      layer.setStyle({
+        color: this.colour(draft, index, problems),
+        weight: draft.key === this.selected ? 4 : 2,
+      });
+    });
+  }
+
+  /** A region reshaped or moved with Geoman's tools: its outline, staged. */
+  private reshaped(key: string, layer: L.Polygon): void {
+    const outline = ringOf(layer);
+    if (sameRing(this.draft(key)?.outline ?? null, outline)) return;
+    this.edit({ kind: 'outline', key, outline, bases: this.bases([key]) });
+  }
+
+  /** The places in no region in the warning colour; after the first time, only those that changed. */
+  private recolour(): void {
+    const gyms = new Set(this.counts.outsideGyms);
+    const wayspots = new Set(this.counts.outsideWayspots);
+    const restyle = (
+      dots: L.CircleMarker[],
+      before: Set<number>,
+      now: Set<number>,
+      colourOf: (i: number) => string,
+    ): void => {
+      dots.forEach((dot, i) => {
+        if (this.coloured && before.has(i) === now.has(i)) return;
+        dot.setStyle({ color: now.has(i) ? OUTSIDE : colourOf(i) });
+      });
+    };
+    restyle(this.gymDots, this.outsideBefore.gyms, gyms, () => GYM);
+    restyle(this.wayspotDots, this.outsideBefore.wayspots, wayspots, (i) => {
+      const kind = this.data.wayspots[i]?.[0];
+      return kind === 'stop' ? STOP : kind === 'powerspot' ? POWERSPOT : WAYFARER_GYM;
+    });
+    this.outsideBefore = { gyms, wayspots };
+    this.coloured = true;
+  }
+
+  private select(key: string | undefined): void {
+    this.selected = key;
+    this.labels();
+    this.panel();
+  }
+
+  /** Splits a region along the line drawn (spec 4.2): the larger part keeps it. */
+  private split(key: string, line: L.LatLng[]): void {
+    this.splitting = undefined;
+    const draft = this.draft(key);
+    if (!draft?.outline) return;
+    const split = splitOutline(
+      draft.outline,
+      line.map(({ lat, lng }) => ({ lat, lon: lng })),
+    );
+    if (!split.ok) {
+      say(SPLIT_PROBLEMS[split.reason]);
+      return;
+    }
+    const other = newKey(this.state.next);
+    this.edit({
+      kind: 'split',
+      key,
+      keep: split.parts[0],
+      newKey: other,
+      other: split.parts[1],
+      bases: this.bases([key]),
+    });
+    this.selected = other;
+    this.redraw();
+    say('Split: the larger part keeps the region; give the new one its channel, or swap them.');
+  }
+
+  /** The loaded regions as the worker is told them once. */
+  private loadedCoverage(): CoverageRegion[] {
+    return this.loaded.flatMap((region) =>
+      region.outline
+        ? [
+            {
+              key: `r${region.id}`,
+              version: this.version(region.outline),
+              outline: region.outline.map(({ lat, lon }): [number, number] => [lat, lon]),
+            },
+          ]
+        : [],
+    );
+  }
+
+  /** A version of an outline for the worker: by the list itself, which an edit replaces. */
+  private version(outline: readonly LatLon[]): string {
+    let version = this.versions.get(outline);
+    if (version === undefined) {
+      version = `${++this.versionCount}`;
+      this.versions.set(outline, version);
+    }
+    return version;
+  }
+
+  private places(): [PlaceKind, number, number][] {
+    return [
+      ...this.data.gyms.map(([, lat, lon]): [PlaceKind, number, number] => ['gym', lat, lon]),
+      ...this.data.wayspots.map(([kind, lat, lon]): [PlaceKind, number, number] => [
+        kind === 'gym' ? 'wayfarerGym' : kind,
+        lat,
+        lon,
+      ]),
+    ];
+  }
+
+  private post(message: CoverageRequest): void {
+    this.worker.postMessage(message);
+  }
+
+  /** Asks the worker for the overlaps and gaps of the staged regions, once edits rest. */
+  private check(): void {
+    this.checking = true;
+    window.clearTimeout(this.timer);
+    this.timer = window.setTimeout(() => {
+      this.seq += 1;
+      this.post({
+        kind: 'check',
+        seq: this.seq,
+        regions: this.applied.drafts.flatMap((draft) =>
+          draft.removed === null && draft.outline !== null && draft.outline.length >= 4
+            ? [
+                {
+                  key: draft.key,
+                  version: this.version(draft.outline),
+                  outline: draft.outline.map(({ lat, lon }): [number, number] => [lat, lon]),
+                },
+              ]
+            : [],
+        ),
+      });
+    }, CHECK_DELAY_MS);
+  }
+
+  private answered(answer: CoverageAnswer): void {
+    if (answer.seq !== this.seq) return;
+    this.checking = false;
+    this.checkFailed = answer.failed;
+    this.pieces = answer.pieces;
+    this.shaded.clearLayers();
+    for (const piece of this.pieces) {
+      L.polygon(piece.rings, {
+        color: piece.kind === 'overlap' ? OVERLAP : GAP,
+        weight: piece.fresh ? 3 : 1,
+        fillOpacity: piece.fresh ? 0.5 : 0.3,
+        pmIgnore: true,
+      }).addTo(this.shaded);
+    }
+    this.toolbar();
+    this.panel();
+  }
+
+  private readiness(): { ready: boolean; reasons: string[] } {
+    const { request, missingChannel } = saveRequest(this.loaded, this.applied.drafts);
+    const changes = request.changes.length + request.additions.length + request.removals.length > 0;
+    return saveReadiness({
+      readOnly: this.data.readOnly,
+      changes: changes || missingChannel.length > 0,
+      problems: outlineProblems(this.applied.drafts),
+      missingChannel,
+      conflicts: this.applied.conflicts.length + this.applied.gone.length,
+      fresh: {
+        overlaps: this.pieces.filter((piece) => piece.fresh && piece.kind === 'overlap').length,
+        gaps: this.pieces.filter((piece) => piece.fresh && piece.kind === 'gap').length,
+      },
+      checking: this.checking,
+      checkFailed: this.checkFailed,
+    });
+  }
+
+  private name(key: string): string {
+    const draft = this.draft(key);
+    return draft ? draftLabel(draft) : key;
+  }
+
+  /** The side panel: the dialog of a save, conflicts, the selected region, the lists. */
+  private panel(): void {
+    const panel = byId('panel');
+    panel.replaceChildren();
+    if (this.dialog) panel.append(this.dialog);
+    const ready = this.readiness();
+    if (!ready.ready && !this.dialog) {
+      const reasons = element('ul', undefined, 'reasons');
+      for (const reason of ready.reasons) reasons.append(element('li', reason));
+      panel.append(reasons);
+    }
+    if (this.checkFailed)
+      panel.append(element('p', 'The overlaps and gaps could not be worked out.', 'warning'));
+    this.conflictSection(panel);
+    this.selectedSection(panel);
+    this.regionList(panel);
+    this.pieceList(panel);
+    const outsideGyms = this.counts.outsideGyms.length;
+    const outsideWayspots = this.counts.outsideWayspots.length;
+    if (outsideGyms + outsideWayspots > 0) {
+      panel.append(
+        element(
+          'p',
+          `In no region (orange): ${count(outsideGyms, 'gym')}, ${count(outsideWayspots, 'Wayspot')}.`,
+          'warning',
+        ),
+      );
+    }
+  }
+
+  private conflictSection(panel: HTMLElement): void {
+    const { conflicts, gone } = this.applied;
+    if (conflicts.length + gone.length === 0) return;
+    panel.append(element('h2', 'Changed by somebody else'));
+    for (const id of conflicts) {
+      const region = this.loaded.find((one) => one.id === id);
+      if (!region) continue;
+      const row = element('div', undefined, 'conflict');
+      row.append(
+        element('span', `#${region.name}: theirs is dashed blue.`),
+        button('Take theirs', () => {
+          this.edit({ kind: 'take-theirs', key: `r${id}`, version: region.version });
+          this.redraw();
+        }),
+        button('Keep mine', () => {
+          this.edit({ kind: 'keep-mine', key: `r${id}`, version: region.version });
+          this.redraw();
+        }),
+      );
+      panel.append(row);
+    }
+    for (const id of gone) {
+      const row = element('div', undefined, 'conflict');
+      row.append(
+        element('span', `Region ${id} was removed meanwhile.`),
+        button('Drop my changes of it', () => {
+          this.edit({ kind: 'take-theirs', key: `r${id}`, version: '' });
+          this.redraw();
+        }),
+      );
+      panel.append(row);
+    }
+  }
+
+  private selectedSection(panel: HTMLElement): void {
+    const key = this.selected;
+    const draft = key === undefined ? undefined : this.draft(key);
+    if (!key || !draft) return;
+    const readOnly = this.data.readOnly;
+    const section = element('section', undefined, 'selected');
+    section.append(element('h2', draftLabel(draft)));
+    const loaded =
+      draft.regionId === null ? undefined : this.loaded.find((one) => one.id === draft.regionId);
+    if (loaded) {
+      section.append(
+        element(
+          'p',
+          `Category: ${loaded.category ?? 'none'}. ${count(this.counts.gyms.get(key) ?? 0, 'gym')}.`,
+        ),
+      );
+    } else {
+      section.append(element('p', count(this.counts.gyms.get(key) ?? 0, 'gym')));
+      if (!readOnly) this.channelPicker(section, draft);
+    }
+    const problem = outlineProblems([draft]).get(key);
+    if (problem !== undefined)
+      section.append(element('p', `This region cannot be saved: ${problem}.`, 'warning'));
+    if (!readOnly) {
+      const actions = element('div', undefined, 'actions');
+      if (draft.removed !== null) {
+        actions.append(
+          element(
+            'span',
+            draft.removed === 'delete'
+              ? 'Staged for removal; its forum is deleted.'
+              : 'Staged for removal; its forum stays.',
+          ),
+          button('Restore', () => {
+            this.edit({ kind: 'restore', key, bases: this.bases([key]) });
+            this.redraw();
+          }),
+        );
+      } else {
+        actions.append(
+          button('Split along a line', () => {
+            this.splitting = key;
+            this.map.pm.enableDraw('Line', { snappable: true });
+            say(
+              `Draw a line across ${draftLabel(draft)}, from outside it to outside it; click its last point again to finish.`,
+            );
+          }),
+        );
+        const partner = splitPartner(this.state, key);
+        if (partner !== undefined && this.draft(partner)) {
+          actions.append(
+            button(`Swap with ${this.name(partner)}`, () => {
+              this.edit({ kind: 'swap', a: key, b: partner, bases: this.bases([key, partner]) });
+              this.redraw();
+            }),
+          );
+        }
+        if (draft.regionId === null) {
+          actions.append(button('Remove', () => this.remove(key, 'keep')));
+        } else {
+          actions.append(button('Remove, keep its forum', () => this.remove(key, 'keep')));
+          if (this.data.mayManageChannels) {
+            actions.append(button('Remove and delete its forum', () => this.remove(key, 'delete')));
+          }
+        }
+      }
+      section.append(actions);
+    }
+    panel.append(section);
+  }
+
+  private remove(key: string, forum: 'keep' | 'delete'): void {
+    this.edit({ kind: 'remove', key, forum, bases: this.bases([key]) });
+    if (this.draft(key) === undefined) this.selected = undefined;
+    this.redraw();
+  }
+
+  /** A new region's channel: a text channel that is no region yet, or a new name (spec 4.2). */
+  private channelPicker(section: HTMLElement, draft: Draft): void {
+    const choices = channelChoices(this.data.channels, this.applied.drafts, draft.key);
+    const select = element('select');
+    select.append(new Option('Choose its channel', ''));
+    for (const channel of choices)
+      select.append(new Option(`#${channel.name}`, `id:${channel.id}`));
+    if (this.data.mayManageChannels) select.append(new Option('A new channel…', 'new'));
+    const current = draft.channel;
+    select.value = current === null ? '' : 'id' in current ? `id:${current.id}` : 'new';
+    const name = element('input');
+    name.placeholder = 'Name of the new channel';
+    name.value = current && 'create' in current ? current.create : '';
+    const category = element('input');
+    category.placeholder = 'Its category (empty: a category named after the channel)';
+    category.value = draft.description ?? '';
+    const refusal = element('p', undefined, 'warning');
+    const fresh = select.value === 'new';
+    name.hidden = !fresh;
+    category.hidden = !fresh;
+    refusal.hidden = true;
+    const save = (): void => {
+      let channel: ChannelChoice | null = null;
+      refusal.hidden = true;
+      if (select.value.startsWith('id:')) {
+        const id = select.value.slice(3);
+        const found = choices.find((one) => one.id === id);
+        if (found) channel = { id: found.id, name: found.name };
+      } else if (select.value === 'new' && name.value.trim() !== '') {
+        // As the server would refuse it: a name the server has a channel of.
+        const problem = newChannelProblem(name.value, this.data.channels, this.loaded);
+        if (problem === undefined) channel = { create: name.value.trim() };
+        else {
+          refusal.textContent = problem;
+          refusal.hidden = false;
+        }
+      }
+      const description =
+        select.value === 'new' && category.value.trim() !== '' ? category.value.trim() : null;
+      this.edit({ kind: 'details', key: draft.key, channel, description });
+      this.labels();
+    };
+    select.addEventListener('change', () => {
+      const isNew = select.value === 'new';
+      name.hidden = !isNew;
+      category.hidden = !isNew;
+      if (!isNew) save();
+    });
+    name.addEventListener('change', save);
+    category.addEventListener('change', save);
+    section.append(select, name, category, refusal);
+    if (!this.data.mayManageChannels) {
+      section.append(
+        element(
+          'p',
+          'Creating channels takes Manage Channels, which you lack: pick a channel that exists.',
+        ),
+      );
+    }
+  }
+
+  private regionList(panel: HTMLElement): void {
+    panel.append(element('h2', `Regions (${this.applied.drafts.length})`));
+    const list = element('ul', undefined, 'region-list');
+    const problems = outlineProblems(this.applied.drafts);
+    for (const draft of this.applied.drafts) {
+      const item = element(
+        'li',
+        `${this.labelText(draft)}${draft.removed !== null ? ' (staged for removal)' : ''}${problems.has(draft.key) ? ' (cannot be saved)' : ''}`,
+      );
+      if (draft.key === this.selected) item.className = 'chosen';
+      item.addEventListener('click', () => {
+        this.select(draft.key);
+        const layer = this.regionLayers.get(draft.key);
+        if (layer) this.map.fitBounds(layer.getBounds(), { padding: [30, 30] });
+      });
+      list.append(item);
+    }
+    panel.append(list);
+  }
+
+  private pieceList(panel: HTMLElement): void {
+    if (this.pieces.length === 0) return;
+    const sorted = [...this.pieces].sort(
+      (a, b) => Number(b.fresh) - Number(a.fresh) || b.area - a.area,
+    );
+    const overlaps = this.pieces.filter((piece) => piece.kind === 'overlap').length;
+    panel.append(
+      element('h2', `Overlaps (${overlaps}) and gaps (${this.pieces.length - overlaps})`),
+    );
+    const list = element('ul', undefined, 'piece-list');
+    for (const piece of sorted.slice(0, LISTED_PIECES)) {
+      const item = element(
+        'li',
+        pieceLine(piece, (key) => this.name(key)),
+        piece.fresh ? 'fresh' : undefined,
+      );
+      item.addEventListener('click', () => {
+        this.map.fitBounds(L.latLngBounds(piece.rings[0] ?? []), {
+          padding: [40, 40],
+          maxZoom: 18,
+        });
+      });
+      list.append(item);
+    }
+    panel.append(list);
+    if (sorted.length > LISTED_PIECES) {
+      panel.append(element('p', `…and ${sorted.length - LISTED_PIECES} more, smaller.`));
+    }
+  }
+
+  /** A KML file into the staged edits (spec 4.2), as one edit. */
+  private async loadKml(file: File): Promise<void> {
+    if (file.size > MAX_KML_BYTES) {
+      say('That file is larger than 1 MB, and a file of regions is far smaller.');
+      return;
+    }
+    const reading = readKml(await file.text());
+    if (!reading.ok) {
+      say(KML_PROBLEMS[reading.reason]);
+      return;
+    }
+    const made = kmlEdit(
+      reading.areas,
+      this.loaded,
+      this.applied.drafts,
+      this.data.channels,
+      this.state,
+    );
+    this.edit(made);
+    this.redraw();
+    const skipped = reading.skipped.length;
+    say(
+      `Staged ${count(reading.areas.length, 'area')} of the file` +
+        (skipped > 0
+          ? `; ${count(skipped, 'area')} could not be read (an outline that crosses itself, or several shapes).`
+          : '.'),
+    );
+  }
+
+  /** What the editor shows as a KML file (spec 4.7). */
+  private exportKml(): void {
+    const text = writeKml(exportAreas(this.loaded, this.applied.drafts));
+    const url = URL.createObjectURL(
+      new Blob([text], { type: 'application/vnd.google-earth.kml+xml' }),
+    );
+    const link = element('a');
+    link.href = url;
+    link.download = exportFileName(this.data.guild);
+    link.click();
+    window.setTimeout(() => URL.revokeObjectURL(url), 0);
+  }
+
+  /**
+   * POSTs a body (`saveBody`) with the CSRF token; asks for a new token once when it was
+   * refused. What came back, read (`readSaveAnswer`); `unknown` also when nothing came back.
+   */
+  private async send(what: 'preview' | 'save', body: string): Promise<ReadAnswer> {
+    const post = async (): Promise<Response> =>
+      fetch(`/s/${this.data.guild.id}/api/regions/${what}`, {
+        method: 'POST',
+        credentials: 'same-origin',
+        headers: {
+          'content-type': 'application/json',
+          'x-pine-csrf': this.me.loggedIn ? this.me.csrf : '',
+        },
+        body,
+      });
+    try {
+      let response = await post();
+      if (response.status === 403) {
+        // The token of a page loaded before a restart: ask for the new one, once.
+        this.me = await whoIsAsking(this.data.guild.id);
+        response = await post();
+      }
+      return readSaveAnswer(response.status, await response.text());
+    } catch {
+      return { kind: 'unknown' };
+    }
+  }
+
+  /** Save, step one: what the server would do (spec 4.5), of the body Save then sends. */
+  private async preview(): Promise<void> {
+    this.showDialog('Asking what would be saved…');
+    const body = saveBody(this.loaded, this.applied.drafts);
+    this.previewed = body;
+    const read = await this.send('preview', body);
+    if (read.kind === 'unknown') {
+      this.showDialog('The preview could not be asked for. Try again in a moment.');
+      return;
+    }
+    await this.shown(read, true);
+  }
+
+  /**
+   * Save, step two: the body previewed, carried out; the outcome shown, the editor loaded anew.
+   * When the drafts changed since the preview, it is previewed again instead. When it cannot be
+   * known what the server did (the answer failed or cannot be read), the editor is loaded anew
+   * and what the server has is no longer staged (`rebaseAfterSave`).
+   */
+  private async save(): Promise<void> {
+    const body = saveBody(this.loaded, this.applied.drafts);
+    if (body !== this.previewed) {
+      this.closeDialog();
+      await this.preview();
+      return;
+    }
+    this.showDialog('Saving…');
+    const read = await this.send('save', body);
+    if (read.kind !== 'unknown') {
+      await this.shown(read, false);
+      return;
+    }
+    try {
+      await this.reload(true);
+      this.showDialog('The outcome is not known: here is what the server has now.');
+    } catch {
+      this.showDialog(
+        'The outcome is not known, and the regions could not be loaded again: reload the page in a moment.',
+      );
+    }
+  }
+
+  private async shown(
+    read: Exclude<ReadAnswer, { kind: 'unknown' }>,
+    previewing: boolean,
+  ): Promise<void> {
+    if (read.kind === 'refused') {
+      this.showDialog(read.text);
+      return;
+    }
+    const { answer } = read;
+    const dialog = element('section', undefined, 'dialog');
+    switch (answer.kind) {
+      case 'preview':
+        dialog.append(element('h2', 'What saving would do'));
+        showWorded(dialog, answer.worded);
+        if (answer.changes) dialog.append(button('Save these changes', () => void this.save()));
+        dialog.append(button('Cancel', () => this.closeDialog()));
+        break;
+      case 'saved': {
+        dialog.append(element('h2', 'Saved'));
+        showWorded(dialog, answer.worded);
+        dialog.append(button('Close', () => this.closeDialog()));
+        await this.reload(true);
+        break;
+      }
+      case 'refused':
+        dialog.append(element('h2', previewing ? 'This cannot be saved' : 'Nothing was saved'));
+        for (const line of answer.lines) dialog.append(element('p', line));
+        dialog.append(button('Close', () => this.closeDialog()));
+        break;
+      case 'conflicts':
+        dialog.append(
+          element('h2', 'Changed by somebody else'),
+          element(
+            'p',
+            `${count(answer.conflicts.length, 'region')} changed since you loaded the page: nothing was saved. Choose for each below, then save again.`,
+          ),
+          button('Close', () => this.closeDialog()),
+        );
+        await this.reload(false);
+        break;
+    }
+    this.dialog = dialog;
+    this.panel();
+  }
+
+  private showDialog(text: string): void {
+    const dialog = element('section', undefined, 'dialog');
+    dialog.append(
+      element('p', text),
+      button('Close', () => this.closeDialog()),
+    );
+    this.dialog = dialog;
+    this.panel();
+  }
+
+  private closeDialog(): void {
+    this.dialog = undefined;
+    this.previewed = undefined;
+    this.panel();
+  }
+
+  /**
+   * The editor's data again. After a save, what the server has as staged is no longer staged
+   * (`rebaseAfterSave`; also after a partial save). After a conflict the staged edits stay as
+   * they are: their versions tell which regions changed meanwhile.
+   */
+  private async reload(saved: boolean): Promise<void> {
+    const drafts = this.applied.drafts;
+    const data = await getJson<EditorData>(`/s/${this.data.guild.id}/api/regions/edit`, {
+      cache: 'no-cache',
+    });
+    this.data = data;
+    this.loaded = loadedRegions(data);
+    if (saved) this.state = rebaseAfterSave(drafts, this.loaded, this.state);
+    this.post({ kind: 'loaded', regions: this.loadedCoverage(), places: this.places() });
+    this.changed();
+    this.redraw();
+  }
+}
+
+async function start(): Promise<void> {
+  const dataset = document.body.dataset;
+  const guild = dataset.guild ?? '';
+  const map = L.map(byId('map'), { center: [40.44, -79.99], zoom: 11, preferCanvas: true });
+  addTiles(
+    map,
+    tileLayers(dataset.tiles === 'google' ? 'google' : 'osm', dataset.googleKey),
+    dataset.googleKey,
+  );
+  const notice = loginNotice(location.search);
+  if (notice) {
+    say(notice.text);
+    history.replaceState(null, '', `${location.pathname}${notice.search}${location.hash}`);
+  }
+  const me = await showAccount(guild, dataset.login === 'discord' ? 'discord' : 'links');
+  let data: EditorData;
+  try {
+    data = await getJson<EditorData>(`/s/${guild}/api/regions/edit`);
+  } catch {
+    say('The regions could not be loaded. Reload the page in a moment.');
+    return;
+  }
+  if (data.readOnly) say('Discord cannot be reached just now, so the editor is read-only.');
+  new Editor(map, data, me, new Worker(dataset.worker ?? '')).start();
+}
+
+void start();
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index c842231c341c93e0884a947333c52df5deb7d916..c8b92e49ec42c1e8c3bf15f4a0f52476e3a1031b 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -1,17 +1,9 @@
 import * as L from 'leaflet';
 import type { GeoView } from '../../domain/web/geo-data.js';
+import { addTiles, byId, getJson, say, showAccount } from './common.js';
 import { gymFilter } from './filter.js';
-import {
-  googleAttribution,
-  googleTileUrl,
-  sessionRequest,
-  sessionUrl,
-  tileLayers,
-  viewportUrl,
-  type TileLayerSpec,
-} from './layers.js';
-import { LOGOUT_FAILED, logOut } from './logout.js';
-import { headerLines, loginNotice, type Me } from './notice.js';
+import { tileLayers } from './layers.js';
+import { loginNotice } from './notice.js';
 import { gymPopup, regionLabel, renderNode, type MapGym } from './popup.js';
 
 /**
@@ -24,165 +16,10 @@ import { gymPopup, regionLabel, renderNode, type MapGym } from './popup.js';
 
 /** From this zoom on the regions' names are shown. */
 const LABEL_ZOOM = 12;
-/** How long the map rests before Google is asked for the attribution of what is in view. */
-const ATTRIBUTION_DELAY_MS = 500;
 const GYM_COLOUR = '#2d7a3a';
 const ELITE_COLOUR = '#8e3ab0';
 const REGION_COLOUR = '#3060c0';
 
-function byId(id: string): HTMLElement {
-  const found = document.getElementById(id);
-  if (!found) throw new Error(`the page has no #${id}`);
-  return found;
-}
-
-async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
-  const response = await fetch(url, { credentials: 'same-origin', ...init });
-  if (!response.ok) throw new Error(`${response.status}`);
-  return (await response.json()) as T;
-}
-
-/** A line under the header, for a moment's news (a login that failed, tiles that did not load). */
-function say(text: string): void {
-  const notice = byId('notice');
-  notice.textContent = text;
-  notice.hidden = false;
-}
-
-/** The Google layer of a spec: a session asked for when it is first shown, then its tiles. */
-function googleLayer(
-  map: L.Map,
-  spec: Extract<TileLayerSpec, { kind: 'google' }>,
-  key: string,
-): L.LayerGroup {
-  const group = L.layerGroup();
-  let session: Promise<string> | undefined;
-  let attribution: string | undefined;
-  let timer: number | undefined;
-  const setAttribution = (text: string | undefined): void => {
-    if (attribution !== undefined) map.attributionControl.removeAttribution(attribution);
-    attribution = text;
-    if (text !== undefined) map.attributionControl.addAttribution(text);
-  };
-  const refresh = (): void => {
-    window.clearTimeout(timer);
-    timer = window.setTimeout(() => {
-      if (!session || !map.hasLayer(group)) return;
-      void session
-        .then((id) => {
-          const bounds = map.getBounds();
-          return getJson<{ copyright?: string }>(
-            viewportUrl(id, key, map.getZoom(), {
-              north: bounds.getNorth(),
-              south: bounds.getSouth(),
-              east: bounds.getEast(),
-              west: bounds.getWest(),
-            }),
-            { credentials: 'omit' },
-          );
-        })
-        .then((answer) => {
-          if (map.hasLayer(group)) setAttribution(googleAttribution(answer.copyright ?? ''));
-        })
-        .catch(() => setAttribution(googleAttribution('')));
-    }, ATTRIBUTION_DELAY_MS);
-  };
-  group.on('add', () => {
-    setAttribution(googleAttribution(''));
-    session ??= getJson<{ session: string }>(sessionUrl(key), {
-      method: 'POST',
-      credentials: 'omit',
-      headers: { 'content-type': 'application/json' },
-      body: JSON.stringify(sessionRequest(spec)),
-    }).then((answer) => answer.session);
-    session
-      .then((id) => {
-        if (group.getLayers().length === 0) {
-          group.addLayer(L.tileLayer(googleTileUrl(id, key), { maxZoom: spec.maxZoom }));
-        }
-        refresh();
-      })
-      .catch(() => {
-        session = undefined;
-        say("Google's map could not be loaded.");
-      });
-    map.on('moveend', refresh);
-  });
-  group.on('remove', () => {
-    map.off('moveend', refresh);
-    window.clearTimeout(timer);
-    setAttribution(undefined);
-  });
-  return group;
-}
-
-function addTiles(map: L.Map, specs: readonly TileLayerSpec[], key: string | undefined): void {
-  const layers: Record<string, L.Layer> = {};
-  for (const spec of specs) {
-    layers[spec.name] =
-      spec.kind === 'osm'
-        ? L.tileLayer(spec.url, { attribution: spec.attribution, maxZoom: spec.maxZoom })
-        : googleLayer(map, spec, key ?? '');
-  }
-  const [first] = specs;
-  if (first) layers[first.name]?.addTo(map);
-  if (specs.length > 1) L.control.layers(layers, undefined, { position: 'topright' }).addTo(map);
-}
-
-async function showAccount(guild: string, login: 'discord' | 'links'): Promise<void> {
-  const account = byId('account');
-  let me: Me;
-  try {
-    me = await getJson<Me>(`/s/${guild}/api/me`);
-  } catch {
-    me = { loggedIn: false };
-  }
-  const header = headerLines(me, login);
-  account.replaceChildren();
-  if (header.login) {
-    const link = document.createElement('a');
-    link.className = 'login';
-    link.href = `/auth/login?next=${encodeURIComponent(location.pathname)}`;
-    link.textContent = 'Log in with Discord';
-    account.append(link);
-  }
-  if (header.name !== undefined && me.loggedIn) {
-    const name = document.createElement('span');
-    name.className = 'name';
-    name.textContent = header.name;
-    const logout = document.createElement('button');
-    logout.type = 'button';
-    logout.textContent = 'Log out';
-    const { csrf } = me;
-    logout.addEventListener('click', () => {
-      logout.disabled = true;
-      void logOut(csrf, {
-        post: (token) =>
-          fetch('/auth/logout', {
-            method: 'POST',
-            credentials: 'same-origin',
-            headers: { 'x-pine-csrf': token },
-          }).then((answer) => answer.status),
-        me: () => getJson<Me>(`/s/${guild}/api/me`),
-      }).then((result) => {
-        if (result === 'done') {
-          location.reload();
-          return;
-        }
-        logout.disabled = false;
-        say(LOGOUT_FAILED);
-      });
-    });
-    account.append(name, logout);
-  }
-  for (const text of header.lines) {
-    const line = document.createElement('span');
-    line.className = 'line';
-    line.textContent = text;
-    account.append(line);
-  }
-}
-
 async function showGeo(map: L.Map, guild: string): Promise<void> {
   const view = await getJson<GeoView>(`/s/${guild}/api/geo`);
   const names = new Map(view.regions.map((region) => [region.id, region.name]));
diff --git a/src/web/client/staged-storage.test.ts b/src/web/client/staged-storage.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..af4d51fc829c9b1ce92704cd1dbb11d632fffdf4
--- /dev/null
+++ b/src/web/client/staged-storage.test.ts
@@ -0,0 +1,82 @@
+import { describe, expect, it } from 'vitest';
+import { emptyEdits, newKey, record } from '../../domain/regions/edits.js';
+import { browserStorage, readStaged, writeStaged, type KeyValueStorage } from './staged-storage.js';
+
+class MemoryStorage implements KeyValueStorage {
+  readonly items = new Map<string, string>();
+  failing = false;
+  /** Full, as a browser's storage for a page is past its few megabytes. */
+  full = false;
+
+  getItem(key: string): string | null {
+    if (this.failing) throw new Error('SecurityError');
+    return this.items.get(key) ?? null;
+  }
+
+  setItem(key: string, value: string): void {
+    if (this.failing) throw new Error('SecurityError');
+    if (this.full)
+      throw Object.assign(new Error('The quota has been exceeded.'), {
+        name: 'QuotaExceededError',
+      });
+    this.items.set(key, value);
+  }
+
+  removeItem(key: string): void {
+    if (this.failing) throw new Error('SecurityError');
+    this.items.delete(key);
+  }
+}
+
+const KEY = 'pine-region-edits:1:2';
+const STAGED = record(emptyEdits(), {
+  kind: 'add',
+  key: newKey(0),
+  outline: [
+    { lat: 40, lon: -80 },
+    { lat: 40.1, lon: -80 },
+    { lat: 40.1, lon: -79.9 },
+    { lat: 40, lon: -80 },
+  ],
+  channel: null,
+  description: null,
+});
+
+describe('staged edits in the browser', () => {
+  it('are kept, read back, and taken away once nothing is staged', () => {
+    const storage = new MemoryStorage();
+    expect(writeStaged(storage, KEY, STAGED)).toBe('kept');
+    expect(readStaged(storage, KEY)).toEqual(STAGED);
+    expect(writeStaged(storage, KEY, emptyEdits())).toBe('kept');
+    expect(storage.items.has(KEY)).toBe(false);
+    expect(readStaged(storage, KEY)).toEqual(emptyEdits());
+  });
+
+  it('are none where the browser keeps nothing, or keeps something else', () => {
+    const storage = new MemoryStorage();
+    storage.items.set(KEY, '{"not":"edits"}');
+    expect(readStaged(storage, KEY)).toEqual(emptyEdits());
+    storage.failing = true;
+    expect(readStaged(storage, KEY)).toEqual(emptyEdits());
+    expect(writeStaged(storage, KEY, STAGED)).toBe('none');
+    expect(readStaged(undefined, KEY)).toEqual(emptyEdits());
+    expect(writeStaged(undefined, KEY, STAGED)).toBe('none');
+  });
+
+  it('are not kept where the storage is full, which is said apart', () => {
+    const storage = new MemoryStorage();
+    storage.full = true;
+    expect(writeStaged(storage, KEY, STAGED)).toBe('full');
+    expect(writeStaged(storage, KEY, emptyEdits())).toBe('kept');
+  });
+
+  it('are none where even asking for the storage throws, as a sandboxed page does', () => {
+    const storage = new MemoryStorage();
+    expect(browserStorage(() => storage)).toBe(storage);
+    expect(
+      browserStorage(() => {
+        throw new Error('SecurityError');
+      }),
+    ).toBeUndefined();
+  });
+});
diff --git a/src/web/client/staged-storage.ts b/src/web/client/staged-storage.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8dd0460c9ebf2263b944014a098bad475b55c365
--- /dev/null
+++ b/src/web/client/staged-storage.ts
@@ -0,0 +1,66 @@
+import {
+  emptyEdits,
+  parseEdits,
+  serialiseEdits,
+  type EditState,
+} from '../../domain/regions/edits.js';
+
+/** What the page needs of `localStorage`. */
+export interface KeyValueStorage {
+  getItem(key: string): string | null;
+  setItem(key: string, value: string): void;
+  removeItem(key: string): void;
+}
+
+/**
+ * The browser's storage (`() => window.localStorage`), or none where even asking for it throws
+ * (a sandboxed page, storage forbidden by the browser's settings).
+ */
+export function browserStorage(get: () => KeyValueStorage): KeyValueStorage | undefined {
+  try {
+    return get();
+  } catch {
+    return undefined;
+  }
+}
+
+/**
+ * The staged edits kept in the browser (spec 4.4) under `key` (`storageKey`), or none: where
+ * the browser keeps nothing (private windows, a full or forbidden storage throws), or what it
+ * keeps is not ours.
+ */
+export function readStaged(storage: KeyValueStorage | undefined, key: string): EditState {
+  try {
+    const text = storage?.getItem(key);
+    return (text == null ? undefined : parseEdits(text)) ?? emptyEdits();
+  } catch {
+    return emptyEdits();
+  }
+}
+
+/** Whether an error of the storage says that it is full (each browser names it its own way). */
+function isFull(err: unknown): boolean {
+  const name = typeof err === 'object' && err !== null && 'name' in err ? err.name : undefined;
+  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
+}
+
+/**
+ * Keeps the staged edits in the browser, or takes them away when nothing is staged or undone:
+ * `kept`. Else `full` when the browser's storage for the page is full (saving or discarding
+ * changes makes room), `none` when the browser keeps nothing for the page: the page says
+ * which, as a reload loses what is staged.
+ */
+export function writeStaged(
+  storage: KeyValueStorage | undefined,
+  key: string,
+  state: EditState,
+): 'kept' | 'full' | 'none' {
+  if (!storage) return 'none';
+  try {
+    if (state.edits.length === 0 && state.undone.length === 0) storage.removeItem(key);
+    else storage.setItem(key, serialiseEdits(state));
+    return 'kept';
+  } catch (err) {
+    return isFull(err) ? 'full' : 'none';
+  }
+}
diff --git a/src/web/editor-cache.ts b/src/web/editor-cache.ts
index f109475eef4dbd6df12519615521a9f1aabf5770..b7883c6c8a75b911c07ff00510ed42769a2e2ed8 100644
--- a/src/web/editor-cache.ts
+++ b/src/web/editor-cache.ts
@@ -29,6 +29,7 @@ export interface EditorSources {
 
 /** Who is asking, as far as the view tells it. */
 export interface EditorViewer {
+  userId: string;
   /** Discord could not say who is asking: the page saves nothing, and is offered no channel. */
   readOnly: boolean;
   mayManageChannels: boolean;
@@ -79,6 +80,7 @@ export class EditorCache {
     }
     const front = JSON.stringify({
       guild: { id: guildId, name: servers.serverName(guildId) ?? guildId },
+      userId: viewer.userId,
       readOnly: viewer.readOnly,
       mayManageChannels: !viewer.readOnly && viewer.mayManageChannels,
     });
diff --git a/src/web/editor-page.test.ts b/src/web/editor-page.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8332d255d27a1bae373e331a795f5a915429aa6d
--- /dev/null
+++ b/src/web/editor-page.test.ts
@@ -0,0 +1,113 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import {
+  builtAssets,
+  FakeRegionStaff,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+
+const EDITOR = `/s/${FAKE_GUILD_ID}/regions/edit`;
+const STAFF = '700000000000000001';
+
+/** The attributes of the page's `<body>`. */
+function bodyData(html: string): Record<string, string> {
+  const body = /<body([^>]*)>/.exec(html)?.[1] ?? '';
+  return Object.fromEntries(
+    [...body.matchAll(/(data-[\w-]+)="([^"]*)"/g)].map((m): [string, string] => [
+      m[1] ?? '',
+      m[2] ?? '',
+    ]),
+  );
+}
+
+describe('the region editor page', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("loads the editor's bundle for staff, its worker named, nothing inline", async () => {
+    web = webServerWith({ assets: builtAssets(), staff: new FakeRegionStaff().asStaff(STAFF) });
+    const cookie = await web.loggedIn(STAFF, 'Brock');
+    const page = await web.app.inject({ url: EDITOR, headers: { cookie } });
+    expect(page.statusCode).toBe(200);
+    expect(page.headers['content-type']).toMatch(/^text\/html/);
+    expect(page.headers['cache-control']).toBe('no-cache');
+    expect(page.body).toContain('<script src="/assets/editor-QRSTUVWX.js" defer></script>');
+    expect(page.body).toContain('<link rel="stylesheet" href="/assets/editor-YZABCDEF.css">');
+    expect(page.body).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
+    expect(page.body).not.toMatch(/<style|\sstyle=|\son\w+=/i);
+    expect(bodyData(page.body)).toEqual({
+      'data-guild': FAKE_GUILD_ID,
+      'data-tiles': 'osm',
+      'data-login': 'discord',
+      'data-worker': '/assets/editor-worker-GHIJKLMN.js',
+    });
+  });
+
+  it('is the editor also while Discord cannot say who asks: its data says it is read-only', async () => {
+    const staff = new FakeRegionStaff();
+    staff.failing = new Error('Discord is away');
+    web = webServerWith({ assets: builtAssets(), staff });
+    const cookie = await web.loggedIn(STAFF, 'Brock');
+    const page = await web.app.inject({ url: EDITOR, headers: { cookie } });
+    expect(page.statusCode).toBe(200);
+    expect(page.body).toContain('editor-QRSTUVWX.js');
+  });
+
+  it('tells somebody who is not staff that it is for staff', async () => {
+    web = webServerWith({
+      assets: builtAssets(),
+      staff: new FakeRegionStaff().answer(STAFF, { kind: 'not-staff' }),
+    });
+    const cookie = await web.loggedIn(STAFF, 'Misty');
+    const page = await web.app.inject({ url: EDITOR, headers: { cookie } });
+    expect(page.statusCode).toBe(403);
+    expect(page.body).toContain('Only staff of this server may edit its regions.');
+    expect(page.body).not.toContain('editor-QRSTUVWX.js');
+  });
+
+  it('offers a login to somebody logged out, and says why the last one did not happen', async () => {
+    web = webServerWith({ assets: builtAssets() });
+    const page = await web.app.inject({ url: EDITOR });
+    expect(page.statusCode).toBe(401);
+    expect(page.body).toContain(
+      `<a href="/auth/login?next=%2Fs%2F${FAKE_GUILD_ID}%2Fregions%2Fedit">Log in with Discord</a>`,
+    );
+    expect(page.body).toContain('Or use /region edit in Discord.');
+    const failed = await web.app.inject({ url: `${EDITOR}?login=failed` });
+    expect(failed.body).toContain('Login failed.');
+    const expired = await web.app.inject({ url: `${EDITOR}?login=expired` });
+    expect(expired.body).toContain('This login link has expired.');
+    await web.app.close();
+
+    web = webServerWith({ assets: builtAssets(), oauth: undefined });
+    const links = await web.app.inject({ url: EDITOR });
+    expect(links.body).not.toContain('/auth/login');
+    expect(links.body).toContain('Use /region edit in Discord to log in.');
+  });
+
+  it('says so when the bundle was not built', async () => {
+    web = webServerWith({ staff: new FakeRegionStaff().asStaff(STAFF) });
+    const cookie = await web.loggedIn(STAFF, 'Brock');
+    const page = await web.app.inject({ url: EDITOR, headers: { cookie } });
+    expect(page.statusCode).toBe(503);
+    expect(page.body).toContain('npm run web:build');
+  });
+
+  it('is opened at most 20 times a minute from one address: each asks Discord', async () => {
+    const staff = new FakeRegionStaff().asStaff(STAFF);
+    const made = webServerWith({ assets: builtAssets(), staff });
+    web = made;
+    const cookie = await made.loggedIn(STAFF, 'Brock');
+    const open = () =>
+      made.app.inject({ url: EDITOR, headers: { cookie }, remoteAddress: '203.0.113.7' });
+    for (let i = 0; i < 20; i += 1) expect((await open()).statusCode).toBe(200);
+    const refused = await open();
+    expect(refused.statusCode).toBe(429);
+    expect(refused.headers['retry-after']).toBe('60');
+    expect(staff.asked).toHaveLength(20);
+  });
+});
diff --git a/src/web/editor-routes.ts b/src/web/editor-routes.ts
index 610cac6d310e365a9e9e9c48db7410c09bde81e4..5c1198b185b7d0c934aa68550fa3d0730ebc0ea9 100644
--- a/src/web/editor-routes.ts
+++ b/src/web/editor-routes.ts
@@ -1,7 +1,7 @@
 import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
 import { Throttles, type Throttle } from '../discord/throttle.js';
 import type { SaveAnswer } from '../domain/web/editor-data.js';
-import { sendFailure } from './answers.js';
+import { linkPage, sendFailure, shortPage } from './answers.js';
 import { SaveChecks } from './save-check.js';
 import { postGuard } from './csrf.js';
 import type { EditorCache } from './editor-cache.js';
@@ -14,6 +14,7 @@ import {
 } from './editor-save.js';
 import { etagMatches } from './geo-cache.js';
 import type { GuildRequest } from './guild-routes.js';
+import { editorPage } from './page.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { RegionStaffSource, StaffAnswer } from './region-staff.js';
 import type { WebDeps } from './server.js';
@@ -46,6 +47,12 @@ const SAVE_STATUS: Readonly<Record<SaveAnswer['kind'], number>> = {
   refused: 422,
 };
 
+/** Why the last login did not happen (`?login=`, as a login sends back): said on the page. */
+const LOGIN_NOTICES: ReadonlyMap<string, string> = new Map([
+  ['failed', 'Login failed. '],
+  ['expired', 'This login link has expired. '],
+]);
+
 /** What a preview or a save answers while Discord cannot say who asks. */
 const UNREACHABLE =
   'Discord cannot be reached just now, so nothing can be saved. Try again in a moment.';
@@ -55,7 +62,7 @@ const UNREACHABLE =
  * (`RegionStaffSource`, fresh each time; the session says only who they are).
  */
 export async function editorViewer(
-  request: GuildRequest,
+  request: FastifyRequest & { params: { guild: string } },
   reply: FastifyReply,
   deps: WebDeps,
 ): Promise<{ kind: 'logged-out' } | (StaffAnswer & { userId: string })> {
@@ -84,6 +91,67 @@ export async function editorViewer(
  * past `SAVES_PER_ADDRESS_MINUTE` of an address or `REGION_CHECK_THROTTLE` of a member.
  */
 export function editorRoutes(scope: FastifyInstance, deps: WebDeps): void {
+  // The page (spec 4): the static template for the server's staff (and while Discord cannot
+  // say: the data then says read-only); a page saying how to log in, or that it is for staff.
+  // It never sends anybody to Discord by itself: a login that failed would come back to it.
+  // Every load asks Discord who is staff: at most `EDIT_DATA_PER_MINUTE` from one address.
+  const pageLimiter = new RateLimiter({ uses: EDIT_DATA_PER_MINUTE, perMs: 60_000 });
+  scope.get<{ Params: { guild: string }; Querystring: { login?: unknown } }>(
+    '/regions/edit',
+    { onRequest: limitedPerAddress(pageLimiter, { now: deps.now }) },
+    async (request, reply) => {
+      void reply.type('text/html; charset=utf-8').header('cache-control', 'no-cache');
+      const { guild } = request.params;
+      const viewer = await editorViewer(request, reply, deps);
+      if (viewer.kind === 'logged-out') {
+        const { login } = request.query;
+        const why = (typeof login === 'string' ? LOGIN_NOTICES.get(login) : undefined) ?? '';
+        const next = encodeURIComponent(`/s/${guild}/regions/edit`);
+        return reply
+          .code(401)
+          .send(
+            deps.oauth
+              ? linkPage(
+                  `${why}Log in to edit this server's regions.`,
+                  { href: `/auth/login?next=${next}`, text: 'Log in with Discord' },
+                  'Or use /region edit in Discord.',
+                )
+              : linkPage(
+                  `${why}Log in to edit this server's regions.`,
+                  undefined,
+                  'Use /region edit in Discord to log in.',
+                ),
+          );
+      }
+      if (viewer.kind === 'not-member' || viewer.kind === 'not-staff') {
+        return reply.code(403).send(shortPage('Only staff of this server may edit its regions.'));
+      }
+      if (viewer.kind === 'unknown-server') {
+        return reply
+          .code(503)
+          .send(shortPage('I do not know this server yet. Try again in a moment.'));
+      }
+      const { manifest } = deps.assets;
+      if (!manifest) {
+        return reply
+          .code(503)
+          .send(shortPage('The region editor has not been built yet: run npm run web:build.'));
+      }
+      const google = deps.settings.tiles === 'google' && deps.googleKey !== undefined;
+      return reply.send(
+        editorPage(
+          {
+            guildId: guild,
+            tiles: google ? 'google' : 'osm',
+            googleKey: google ? deps.googleKey : undefined,
+            login: deps.oauth ? 'discord' : 'links',
+          },
+          manifest,
+        ),
+      );
+    },
+  );
+
   const dataLimiter = new RateLimiter({ uses: EDIT_DATA_PER_MINUTE, perMs: 60_000 });
   scope.get(
     '/api/regions/edit',
@@ -104,6 +172,7 @@ export function editorRoutes(scope: FastifyInstance, deps: WebDeps): void {
           break;
       }
       const view = await deps.editor.view.view(request.params.guild, {
+        userId: viewer.userId,
         readOnly: viewer.kind === 'unreachable',
         mayManageChannels: viewer.kind === 'staff' && viewer.staff.mayManageChannels,
       });
diff --git a/src/web/editor.test.ts b/src/web/editor.test.ts
index f0ff8d0778298aa1690174f7ee768d302ab66faa..229531167f7184a6f1ca66ce08125530eddc236e 100644
--- a/src/web/editor.test.ts
+++ b/src/web/editor.test.ts
@@ -67,6 +67,8 @@ describe("the region editor's data", () => {
     expect(answer.headers['cache-control']).toBe('private, no-cache');
     const data = answer.json<EditorData>();
     expect(data.guild).toEqual({ id: FAKE_GUILD_ID, name: 'Pinewood' });
+    // Whose staged edits the page keeps.
+    expect(data.userId).toBe(STAFF);
     expect(data.readOnly).toBe(false);
     expect(data.mayManageChannels).toBe(true);
     expect(data.regions.map((region) => [region.id, region.name, region.category])).toEqual([
diff --git a/src/web/page.test.ts b/src/web/page.test.ts
index 2f531351b3382932f733b597a675747a3180b95e..2878726d0b34eb694f48dda221abea204e01f445 100644
--- a/src/web/page.test.ts
+++ b/src/web/page.test.ts
@@ -1,9 +1,36 @@
-import { afterEach, describe, expect, it } from 'vitest';
+import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { afterEach, describe, expect, it, onTestFinished } from 'vitest';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { builtAssets, webServerWith, type TestWeb } from '../../test/support/web.js';
+import { readAssets } from './page.js';
 
 const MAP = `/s/${FAKE_GUILD_ID}/map`;
 
+describe("the bundle's manifest", () => {
+  it("names the map's and the editor's files, and is none when it lacks one", async () => {
+    const root = mkdtempSync(path.join(tmpdir(), 'pine-web-'));
+    onTestFinished(() => {
+      rmSync(root, { recursive: true, force: true, maxRetries: 3 });
+    });
+    const manifest = {
+      map: { script: 'map-A.js', style: 'map-B.css' },
+      editor: { script: 'editor-C.js', style: 'editor-D.css', worker: 'editor-worker-E.js' },
+    };
+    writeFileSync(path.join(root, 'assets.json'), JSON.stringify(manifest));
+    expect(await readAssets(root)).toEqual({ dir: path.resolve(root, 'assets'), manifest });
+    // What an older build wrote: the map's names alone.
+    writeFileSync(path.join(root, 'assets.json'), '{"script":"map-A.js","style":"map-B.css"}');
+    expect((await readAssets(root)).manifest).toBeUndefined();
+    writeFileSync(
+      path.join(root, 'assets.json'),
+      JSON.stringify({ ...manifest, editor: { script: 'x.js', style: 'y.css' } }),
+    );
+    expect((await readAssets(root)).manifest).toBeUndefined();
+  });
+});
+
 /** The attributes of the page's `<body>`. */
 function bodyData(html: string): Record<string, string> {
   const body = /<body([^>]*)>/.exec(html)?.[1] ?? '';
diff --git a/src/web/page.ts b/src/web/page.ts
index ab16f17e540391a2f1b2ab82ff638b59f75fd325..a10acc05a8d39538ec16054dd6303b23a64077aa 100644
--- a/src/web/page.ts
+++ b/src/web/page.ts
@@ -5,12 +5,21 @@ import { escapeHtml } from './answers.js';
 /** Where `npm run web:build` leaves the bundle, from the bot's working folder. */
 export const WEB_DIST = 'dist/web';
 
-/** The names of the bundle's script and style, hashed (`dist/web/assets.json`). */
-export interface AssetManifest {
+/** The names of a page's script and style in the bundle, hashed. */
+export interface PageAssets {
   script: string;
   style: string;
 }
 
+/**
+ * The names of the bundle's files the pages load (`dist/web/assets.json`): the map's, and the
+ * region editor's with the script of its worker (plan 8M-2).
+ */
+export interface AssetManifest {
+  map: PageAssets;
+  editor: PageAssets & { worker: string };
+}
+
 /** The built bundle: its folder, served at `/assets/`, and the names the page loads. */
 export interface WebAssets {
   dir: string;
@@ -21,20 +30,33 @@ export interface WebAssets {
 /** A name esbuild gave a hash (`[name]-[hash]`): its content never changes under it. */
 export const HASHED_NAME = /-[A-Z0-9]{8}\.[a-z0-9]+$/;
 
+const isText = (value: unknown): value is string => typeof value === 'string';
+
+/** A page's names from the manifest as read, or undefined when they are not all there. */
+function pageAssets(value: unknown): PageAssets | undefined {
+  const page = value as Partial<PageAssets> | undefined;
+  return page && isText(page.script) && isText(page.style)
+    ? { script: page.script, style: page.style }
+    : undefined;
+}
+
 /**
  * The bundle as the build left it: `dist/web/assets` and the names in `dist/web/assets.json`.
- * Without the manifest (not built) the folder is still given, and the manifest is undefined.
+ * Without the manifest (not built, or built by an older build) the folder is still given, and
+ * the manifest is undefined.
  */
 export async function readAssets(root = WEB_DIST): Promise<WebAssets> {
   const dir = path.resolve(root, 'assets');
   try {
-    const manifest = JSON.parse(
-      await readFile(path.join(root, 'assets.json'), 'utf8'),
-    ) as Partial<AssetManifest>;
-    if (typeof manifest.script !== 'string' || typeof manifest.style !== 'string') {
-      return { dir, manifest: undefined };
-    }
-    return { dir, manifest: { script: manifest.script, style: manifest.style } };
+    const read = JSON.parse(await readFile(path.join(root, 'assets.json'), 'utf8')) as {
+      map?: unknown;
+      editor?: { worker?: unknown };
+    };
+    const map = pageAssets(read.map);
+    const editor = pageAssets(read.editor);
+    const worker = read.editor?.worker;
+    if (!map || !editor || !isText(worker)) return { dir, manifest: undefined };
+    return { dir, manifest: { map, editor: { ...editor, worker } } };
   } catch {
     return { dir, manifest: undefined };
   }
@@ -51,31 +73,43 @@ export interface MapPageData {
   login: 'discord' | 'links';
 }
 
-/**
- * The map page (spec 3.1): a static template that loads the bundle's script and style, with
- * nothing inline (the CSP allows no inline script or style); what the page needs to know is in
- * `data-` attributes of `<body>`, escaped. The script builds everything else.
- */
-export function mapPage(data: MapPageData, assets: AssetManifest): string {
-  const attributes = [
+/** The `data-` attributes of a page's `<body>`, escaped. */
+function bodyAttributes(data: MapPageData, more: readonly string[] = []): string {
+  return [
     `data-guild="${escapeHtml(data.guildId)}"`,
     `data-tiles="${data.tiles}"`,
     ...(data.tiles === 'google' && data.googleKey !== undefined
       ? [`data-google-key="${escapeHtml(data.googleKey)}"`]
       : []),
     `data-login="${data.login}"`,
-  ];
+    ...more,
+  ].join(' ');
+}
+
+/** The head of a page: its title, its style and its script, nothing inline. */
+function head(title: string, assets: PageAssets): string[] {
   return [
     '<!doctype html>',
     '<html lang="en">',
     '<head>',
     '<meta charset="utf-8">',
     '<meta name="viewport" content="width=device-width, initial-scale=1">',
-    '<title>Professor Pine: map</title>',
+    `<title>${escapeHtml(title)}</title>`,
     `<link rel="stylesheet" href="/assets/${escapeHtml(assets.style)}">`,
     `<script src="/assets/${escapeHtml(assets.script)}" defer></script>`,
     '</head>',
-    `<body ${attributes.join(' ')}>`,
+  ];
+}
+
+/**
+ * The map page (spec 3.1): a static template that loads the bundle's script and style, with
+ * nothing inline (the CSP allows no inline script or style); what the page needs to know is in
+ * `data-` attributes of `<body>`, escaped. The script builds everything else.
+ */
+export function mapPage(data: MapPageData, assets: AssetManifest): string {
+  return [
+    ...head('Professor Pine: map', assets.map),
+    `<body ${bodyAttributes(data)}>`,
     '<header id="header"><span class="title">Professor Pine</span>',
     '<input id="filter" type="search" placeholder="Find a gym" aria-label="Find a gym">',
     '<span id="account"></span></header>',
@@ -86,3 +120,24 @@ export function mapPage(data: MapPageData, assets: AssetManifest): string {
     '</html>',
   ].join('\n');
 }
+
+/**
+ * The region editor (spec 4, plan 8M-2): a static template like the map's, which also names the
+ * script of its worker (`data-worker`, a file of Pine's: the CSP's `script-src 'self'` lets it
+ * run). The script builds the tools, the panel and the map.
+ */
+export function editorPage(data: MapPageData, assets: AssetManifest): string {
+  return [
+    ...head('Professor Pine: regions', assets.editor),
+    `<body ${bodyAttributes(data, [`data-worker="/assets/${escapeHtml(assets.editor.worker)}"`])}>`,
+    '<header id="header"><span class="title">Professor Pine: regions</span>',
+    '<span id="tools"></span>',
+    '<span id="account"></span></header>',
+    '<p id="notice" hidden></p>',
+    '<div id="editor"><main id="map" aria-label="Map"></main>',
+    '<aside id="panel" aria-label="Regions"></aside></div>',
+    '<noscript><p>The region editor needs JavaScript.</p></noscript>',
+    '</body>',
+    '</html>',
+  ].join('\n');
+}
diff --git a/test/support/web.test.ts b/test/support/web.test.ts
index 346ea5df8afce9d8a1aad9d1db982528203f758c..e533514e05bb6656a6c9bf085f226cea6dc75ffe 100644
--- a/test/support/web.test.ts
+++ b/test/support/web.test.ts
@@ -9,7 +9,13 @@ describe('builtAssets', () => {
   it('makes a folder of its own with the bundle for the test', () => {
     const assets = builtAssets();
     root = path.dirname(assets.dir);
-    expect(existsSync(path.join(assets.dir, assets.manifest?.script ?? ''))).toBe(true);
+    for (const file of [
+      assets.manifest?.map.script,
+      assets.manifest?.editor.script,
+      assets.manifest?.editor.worker,
+    ]) {
+      expect(existsSync(path.join(assets.dir, file ?? ''))).toBe(true);
+    }
   });
 
   it('removes that folder when the test that made it is over', () => {
diff --git a/test/support/web.ts b/test/support/web.ts
index a856595e60d7857e998e5756d8edcf0406ee70c0..3a5f9a43ecf5f26a6df2edc0627020591f37ac87 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -272,9 +272,22 @@ export function builtAssets(): WebAssets {
   mkdirSync(dir);
   writeFileSync(path.join(dir, 'map-ABCDEFGH.js'), 'console.log("map");');
   writeFileSync(path.join(dir, 'map-IJKLMNOP.css'), 'body { margin: 0; }');
+  writeFileSync(path.join(dir, 'editor-QRSTUVWX.js'), 'console.log("editor");');
+  writeFileSync(path.join(dir, 'editor-YZABCDEF.css'), 'body { margin: 0; }');
+  writeFileSync(path.join(dir, 'editor-worker-GHIJKLMN.js'), 'console.log("worker");');
   writeFileSync(path.join(dir, 'notes.txt'), 'notes');
   writeFileSync(path.join(root, 'assets.json'), '{}');
-  return { dir, manifest: { script: 'map-ABCDEFGH.js', style: 'map-IJKLMNOP.css' } };
+  return {
+    dir,
+    manifest: {
+      map: { script: 'map-ABCDEFGH.js', style: 'map-IJKLMNOP.css' },
+      editor: {
+        script: 'editor-QRSTUVWX.js',
+        style: 'editor-YZABCDEF.css',
+        worker: 'editor-worker-GHIJKLMN.js',
+      },
+    },
+  };
 }
 
 /** A web server built as the bot builds it, over fakes; `entries` is what it logged. */
````

### Task 5: Region edit: the editor's address with a login link

Prototype commit: `9b064cd872aabceb11b7da586776ae24d98987a4`

`/region edit` (with `settings.web`, staff as `/region`): the editor's address and a single-use login link, privately; login links carry the page they open (`map` or `regions/edit`). The commands are registered again at staging.

**Files:**

```
 src/commands/regions/edit.test.ts   | 91 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/regions/edit.ts        | 69 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/regions/index.ts       | 14 ++++++++++--
 src/commands/regions/region.test.ts |  3 ++-
 src/commands/util/maps.test.ts      |  1 +
 src/web/auth-routes.ts              | 57 ++++++++++++++++++++++++++++++------------------
 src/web/login-links.test.ts         | 19 +++++++++++++---
 src/web/login-links.ts              | 36 ++++++++++++++++++++++---------
 src/web/login.test.ts               | 18 ++++++++++++++++
 9 files changed, 271 insertions(+), 37 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/regions/edit.test.ts src/commands/regions/region.test.ts src/commands/util/maps.test.ts src/web/login-links.test.ts src/web/login.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/commands/regions/edit.test.ts src/commands/regions/edit.ts src/commands/regions/index.ts src/commands/regions/region.test.ts src/commands/util/maps.test.ts src/web/auth-routes.ts src/web/login-links.test.ts src/web/login-links.ts src/web/login.test.ts` and `npx eslint src/commands/regions/edit.test.ts src/commands/regions/edit.ts src/commands/regions/index.ts src/commands/regions/region.test.ts src/commands/util/maps.test.ts src/web/auth-routes.ts src/web/login-links.test.ts src/web/login-links.ts src/web/login.test.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 9b064cd872aabceb11b7da586776ae24d98987a4 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m2-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Region edit: the editor's address with a login link`, the paragraph above as the body and the trailer, staging exactly
  `src/commands/regions/edit.test.ts src/commands/regions/edit.ts src/commands/regions/index.ts src/commands/regions/region.test.ts src/commands/util/maps.test.ts src/web/auth-routes.ts src/web/login-links.test.ts src/web/login-links.ts src/web/login.test.ts`.

````diff
diff --git a/src/commands/regions/edit.test.ts b/src/commands/regions/edit.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4263c314cc36b10aea92977840b97312bdfe09b6
--- /dev/null
+++ b/src/commands/regions/edit.test.ts
@@ -0,0 +1,91 @@
+import { MessageFlags } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import {
+  answered,
+  asV2,
+  fakeChatInput,
+  FAKE_GUILD_ID,
+  sent,
+} from '../../../test/support/fake-interactions.js';
+import { buttonsOf, textOf } from '../../../test/support/messages.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { TEST_WEB } from '../../../test/support/web.js';
+import type { Settings } from '../../config/settings.js';
+import { enabledCommands } from '../../discord/command.js';
+import { InteractionRouter } from '../../discord/router.js';
+import { region } from './index.js';
+
+const BROCK = '700000000000000001';
+
+function setup(web: Settings['web']) {
+  const base = createTestContext();
+  const { ctx } = createTestContext({
+    config: { ...base.ctx.config, settings: { ...base.ctx.config.settings, web } },
+  });
+  const router = new InteractionRouter(ctx, enabledCommands([region], ctx.config), []);
+  const run = async (extra: object = {}) => {
+    const interaction = fakeChatInput({
+      commandName: 'region',
+      subcommand: 'edit',
+      userId: BROCK,
+      displayName: 'Brock of Pinewood',
+      globalName: 'Brock',
+      username: 'brock_p',
+      roleNames: ['Moderator'],
+      ...extra,
+    });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  return { ctx, run };
+}
+
+describe('/region edit', () => {
+  it('is offered only where the web pages are on', () => {
+    const subcommands = (web: Settings['web']) => {
+      const { ctx } = setup(web);
+      const [command] = enabledCommands([region], ctx.config);
+      return (command?.data.toJSON().options ?? []).map((option) => option.name);
+    };
+    expect(subcommands(TEST_WEB)).toContain('edit');
+    expect(subcommands(undefined)).not.toContain('edit');
+  });
+
+  it("gives staff the editor's address and a link that logs them in, privately", async () => {
+    const { ctx, run } = setup(TEST_WEB);
+    const payload = answered(await run());
+    expect((payload.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
+    const message = asV2(payload);
+    expect(textOf(message)).toContain(`https://map.example.test/s/${FAKE_GUILD_ID}/regions/edit`);
+    const [button] = buttonsOf(message);
+    expect(button?.label).toBe('Open the region editor (logs you in)');
+    const url = new URL(button?.url ?? '');
+    expect(url.origin).toBe('https://map.example.test');
+    const match = new RegExp(`^/auth/link/${FAKE_GUILD_ID}/([A-Za-z0-9_-]{43})/edit$`).exec(
+      url.pathname,
+    );
+    expect(match).not.toBeNull();
+    expect(ctx.loginLinks.redeem(match?.[1] ?? '', Date.now())).toEqual({
+      guildId: FAKE_GUILD_ID,
+      userId: BROCK,
+      userName: 'Brock',
+      page: 'regions/edit',
+    });
+  });
+
+  it('is for staff alone', async () => {
+    const { run } = setup(TEST_WEB);
+    const refused = sent((await run({ roleNames: [] })).reply);
+    expect(refused.content).toBe('Only admins, moderators and bot developers can do that.');
+  });
+
+  it('says in its help what it gives', () => {
+    const { ctx } = setup(TEST_WEB);
+    const [command] = enabledCommands([region], ctx.config);
+    const part = command && 'subcommands' in command ? command.subcommands?.get('edit') : undefined;
+    const details = part?.help?.details;
+    const text = typeof details === 'function' ? details(ctx.config.settings) : (details ?? '');
+    expect(text).toMatch(/in your browser/);
+    expect(text).toMatch(/once, within five minutes/);
+  });
+});
diff --git a/src/commands/regions/edit.ts b/src/commands/regions/edit.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6ea5cb30c7c5b23363fb4b5e66ca2d277c9d421a
--- /dev/null
+++ b/src/commands/regions/edit.ts
@@ -0,0 +1,69 @@
+import { SlashCommandSubcommandBuilder } from 'discord.js';
+import type { SubcommandPart } from '../../discord/command-group.js';
+import { UserError } from '../../discord/errors.js';
+import { guildIdOf } from '../../discord/guards.js';
+import { answer, v2Answer } from '../../discord/late-reply.js';
+import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
+import { actionRow, linkButton, textMessage } from '../../render/v2.js';
+import { REGION_COLOUR } from './shared.js';
+
+/**
+ * `/region edit` (plan 8M-2): the address of the server's region editor on Pine's web pages and
+ * a button that opens it logged in (a login link of five minutes, once, as `/maps` gives one:
+ * issuing it is a write, hence `MEMBER_WRITE_THROTTLE`). Offered only with `settings.web`; for
+ * staff, as all of `/region`; the editor asks Discord again who is staff at every request.
+ */
+export const editRegions: SubcommandPart = {
+  data: new SlashCommandSubcommandBuilder()
+    .setName('edit')
+    .setDescription('Draw and change the regions on a map in your browser'),
+  help: {
+    details:
+      'Gives you the address of the region editor, on a map in your browser, and a button that ' +
+      'opens it and logs you in (it works once, within five minutes). There you draw new ' +
+      'regions, reshape, move, split and remove them, see the gyms, stops and power spots in ' +
+      'no region and where regions overlap or leave gaps, load and export KML, and save: you ' +
+      'see what a save would do first, in the words of `/region import`. Only you see the answer.',
+    examples: ['/region edit'],
+  },
+  enabled: (config) => config.settings.web !== undefined,
+  throttle: MEMBER_WRITE_THROTTLE,
+  defer: 'late',
+  async execute(interaction, ctx) {
+    const { web } = ctx.config.settings;
+    if (!web) throw new UserError('The web pages of this bot are off.');
+    const guild = guildIdOf(interaction);
+    // One login serves every server: the session is named as the account is.
+    const { user } = interaction;
+    const token = ctx.loginLinks.issue(
+      guild,
+      user.id,
+      user.globalName ?? user.username,
+      Date.now(),
+      'regions/edit',
+    );
+    const editor = `${web.publicUrl}/s/${guild}/regions/edit`;
+    await answer(
+      interaction,
+      v2Answer(
+        textMessage(
+          REGION_COLOUR,
+          [
+            `### The region editor of this server\n${editor}`,
+            '-# The button logs you in as well. It works once, within five minutes; use ' +
+              '/region edit again for another.',
+          ],
+          [
+            actionRow([
+              linkButton(
+                'Open the region editor (logs you in)',
+                undefined,
+                `${web.publicUrl}/auth/link/${guild}/${token}/edit`,
+              ),
+            ]),
+          ],
+        ),
+      ),
+    );
+  },
+};
diff --git a/src/commands/regions/index.ts b/src/commands/regions/index.ts
index 30da1d4811223ace03d9e82b0b69faedf7050c11..288822118bdbe6b427f24e4a6988d29a25f79e66 100644
--- a/src/commands/regions/index.ts
+++ b/src/commands/regions/index.ts
@@ -1,13 +1,23 @@
 import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
 import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
 import { requireBotManagement } from '../../discord/guards.js';
+import { editRegions } from './edit.js';
 import { exportRegions } from './export.js';
 import { importRegions } from './import.js';
 import { listRegions } from './list.js';
 import { removeRegion } from './remove.js';
 
-/** The subcommands of `/region`, each in a file of its own in this folder. */
-const parts: readonly SubcommandPart[] = [importRegions, listRegions, exportRegions, removeRegion];
+/**
+ * The subcommands of `/region`, each in a file of its own in this folder; `edit` only with the
+ * web pages (`settings.web`).
+ */
+const parts: readonly SubcommandPart[] = [
+  importRegions,
+  editRegions,
+  listRegions,
+  exportRegions,
+  removeRegion,
+];
 
 /**
  * `/region`: the regions of a server, for staff. Discord offers it only to members who may
diff --git a/src/commands/regions/region.test.ts b/src/commands/regions/region.test.ts
index b67cf394be79585b4b97e28c0e68e65f11089a2f..590cc670ca6a2658465e873792cad709523af2fe 100644
--- a/src/commands/regions/region.test.ts
+++ b/src/commands/regions/region.test.ts
@@ -54,7 +54,8 @@ describe('/region: who may use it', () => {
     const json = region.data.toJSON();
     expect(json.default_member_permissions).toBe('32');
     expect(region.guards).toHaveLength(1);
-    expect([...region.subcommands.keys()]).toEqual(['import', 'list', 'export', 'remove']);
+    // `edit` only where the web pages are on (edit.test.ts).
+    expect([...region.subcommands.keys()]).toEqual(['import', 'edit', 'list', 'export', 'remove']);
   });
 
   it('refuses a member who is not staff, whatever Discord let through', async () => {
diff --git a/src/commands/util/maps.test.ts b/src/commands/util/maps.test.ts
index 9e529d15824f180b796b3297b5cbd42b8f751447..fb4eee2c6c51970f88d9abc7593fd1a0d070944e 100644
--- a/src/commands/util/maps.test.ts
+++ b/src/commands/util/maps.test.ts
@@ -75,6 +75,7 @@ describe('/maps', () => {
       guildId: FAKE_GUILD_ID,
       userId: ASH,
       userName: 'Ash',
+      page: 'map',
     });
   });
 
diff --git a/src/web/auth-routes.ts b/src/web/auth-routes.ts
index dddbcbe2f9f0742e687071acf3189bee0bc42795..2c9f6d16d932129312196a899261b114ce5d4115 100644
--- a/src/web/auth-routes.ts
+++ b/src/web/auth-routes.ts
@@ -6,6 +6,7 @@ import { buttonPage, sendFailure } from './answers.js';
 import { postGuard } from './csrf.js';
 import { authorizeUrl } from './discord-oauth.js';
 import { localPath } from './local-path.js';
+import type { LinkPage } from './login-links.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
 import { sameText } from './sessions.js';
@@ -39,6 +40,15 @@ function readOAuthCookie(value: string | undefined): { state: string; next?: str
 
 type Query = Record<string, unknown>;
 
+/** What the page of a login link says, by the page it opens. */
+const LINK_SENTENCES: Readonly<Record<LinkPage, string>> = {
+  map: "Open Professor Pine's map of this server, logged in with the link from /maps.",
+  'regions/edit':
+    'Open the region editor of this server, logged in with the link from /region edit.',
+};
+/** What the address of a login link adds after its token, by the page it opens. */
+const LINK_SUFFIXES: Readonly<Record<LinkPage, string>> = { map: '', 'regions/edit': '/edit' };
+
 /** The address of a login link: `/auth/link/<guild>/<token>`. */
 interface LinkParams {
   guild: string;
@@ -104,14 +114,15 @@ export function authRoutes(app: FastifyInstance, deps: WebDeps): void {
     return reply.redirect(back, 302);
   });
 
-  // A link of `/maps` (spec 2.4, a GET from Discord's link button) only shows a page whose
-  // button POSTs to the same address: a GET or HEAD (a link preview, a prefetch) uses nothing up.
-  // The button names the account the link logs in to (somebody else's link logs you in as them);
-  // a link that is unknown, used, expired or another server's names nobody, and the POST then
-  // lands on `?login=expired`.
-  app.get(
-    '/auth/link/:guild/:token',
-    async (request: FastifyRequest<{ Params: LinkParams }>, reply) => {
+  // A link of `/maps` or `/region edit` (spec 2.4, a GET from Discord's link button) only shows
+  // a page whose button POSTs to the same address: a GET or HEAD (a link preview, a prefetch)
+  // uses nothing up. The button names the account the link logs in to (somebody else's link
+  // logs you in as them); a link that is unknown, used, expired or another server's names
+  // nobody, and the POST then lands on `?login=expired` of the page its address names (the
+  // map, or with `/edit` the region editor: an expired link is known no more).
+  const linkPage =
+    (page: LinkPage) =>
+    async (request: FastifyRequest<{ Params: LinkParams }>, reply: FastifyReply) => {
       const { guild, token } = request.params;
       if (!isSnowflake(guild) || !servers.has(guild)) return sendFailure(request, reply, 404);
       const holder = loginLinks.peek(token, now());
@@ -121,16 +132,18 @@ export function authRoutes(app: FastifyInstance, deps: WebDeps): void {
         .type('text/html; charset=utf-8')
         .send(
           buttonPage(
-            "Open Professor Pine's map of this server, logged in with the link from /maps.",
-            `/auth/link/${guild}/${encodeURIComponent(token)}`,
+            LINK_SENTENCES[page],
+            `/auth/link/${guild}/${encodeURIComponent(token)}${LINK_SUFFIXES[page]}`,
             button,
           ),
         );
-    },
-  );
+    };
+  app.get('/auth/link/:guild/:token', linkPage('map'));
+  app.get('/auth/link/:guild/:token/edit', linkPage('regions/edit'));
 
   // The page's button: from Pine's own page alone (`Origin`), the link is used up and a
-  // session started (any session the browser had is ended); then the map, without the token.
+  // session started (any session the browser had is ended); then the page the link was given
+  // for, without the token.
   app.addContentTypeParser(
     'application/x-www-form-urlencoded',
     { parseAs: 'string' },
@@ -138,20 +151,22 @@ export function authRoutes(app: FastifyInstance, deps: WebDeps): void {
       done(null, {});
     },
   );
-  app.post(
-    '/auth/link/:guild/:token',
-    async (request: FastifyRequest<{ Params: LinkParams }>, reply) => {
+  const useLink =
+    (page: LinkPage) =>
+    async (request: FastifyRequest<{ Params: LinkParams }>, reply: FastifyReply) => {
       const { guild, token } = request.params;
       if (!isSnowflake(guild) || !servers.has(guild)) return sendFailure(request, reply, 404);
       if (request.headers.origin !== settings.publicUrl) return sendFailure(request, reply, 403);
-      const map = `/s/${guild}/map`;
       const holder = loginLinks.redeem(token, now());
-      if (!holder || holder.guildId !== guild) return reply.redirect(`${map}?login=expired`, 303);
+      if (!holder || holder.guildId !== guild) {
+        return reply.redirect(`/s/${guild}/${page}?login=expired`, 303);
+      }
       await sessions.start(request, reply, { id: holder.userId, name: holder.userName });
       log.info({ user: holder.userId, guild }, 'logged in to the web pages with a link');
-      return reply.redirect(map, 303);
-    },
-  );
+      return reply.redirect(`/s/${guild}/${holder.page}`, 303);
+    };
+  app.post('/auth/link/:guild/:token', useLink('map'));
+  app.post('/auth/link/:guild/:token/edit', useLink('regions/edit'));
 
   app.post(
     '/auth/logout',
diff --git a/src/web/login-links.test.ts b/src/web/login-links.test.ts
index 92003d0897dc4aea0d3e2c8d7db6ccd46bb05760..3dfacc0a1e4c5318962b33899abedbcce03fa0ec 100644
--- a/src/web/login-links.test.ts
+++ b/src/web/login-links.test.ts
@@ -10,15 +10,28 @@ describe('LoginLinks', () => {
     const token = links.issue(GUILD, ASH, 'Ash', 0);
     expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
     expect(links.issue(GUILD, ASH, 'Ash', 0)).not.toBe(token);
-    expect(links.redeem(token, 1_000)).toEqual({ guildId: GUILD, userId: ASH, userName: 'Ash' });
+    expect(links.redeem(token, 1_000)).toEqual({
+      guildId: GUILD,
+      userId: ASH,
+      userName: 'Ash',
+      page: 'map',
+    });
     expect(links.redeem(token, 1_000)).toBeUndefined();
   });
 
+  it('opens the page it was given for: the map, or the region editor', () => {
+    const links = new LoginLinks();
+    const token = links.issue(GUILD, ASH, 'Ash', 0, 'regions/edit');
+    expect(links.peek(token, 1_000)?.page).toBe('regions/edit');
+    expect(links.redeem(token, 1_000)?.page).toBe('regions/edit');
+  });
+
   it('says whom a link logs in without using it up', () => {
     const links = new LoginLinks();
     const token = links.issue(GUILD, ASH, 'Ash', 0);
-    expect(links.peek(token, 1_000)).toEqual({ guildId: GUILD, userId: ASH, userName: 'Ash' });
-    expect(links.peek(token, 1_000)).toEqual({ guildId: GUILD, userId: ASH, userName: 'Ash' });
+    const holder = { guildId: GUILD, userId: ASH, userName: 'Ash', page: 'map' };
+    expect(links.peek(token, 1_000)).toEqual(holder);
+    expect(links.peek(token, 1_000)).toEqual(holder);
     expect(links.redeem(token, 1_000)).toBeDefined();
     expect(links.peek(token, 1_000)).toBeUndefined();
     const stale = links.issue(GUILD, ASH, 'Ash', 0);
diff --git a/src/web/login-links.ts b/src/web/login-links.ts
index 9e426d6ad1abcecff4493cae763f5fdd14a062e8..69ee6f9d94e907db4ad12ed2ff9d69a855f84910 100644
--- a/src/web/login-links.ts
+++ b/src/web/login-links.ts
@@ -6,18 +6,22 @@ export const LINK_MS = 5 * 60_000;
 /** How many links are kept at most; the oldest go first. */
 const LINKS = 10_000;
 
-/** Whom a login link logs in, and for which server. */
+/** The page of a server a login link opens: the map (`/maps`) or the region editor (`/region edit`). */
+export type LinkPage = 'map' | 'regions/edit';
+
+/** Whom a login link logs in, for which server, and which of its pages it opens. */
 export interface LinkHolder {
   guildId: string;
   userId: string;
   userName: string;
+  page: LinkPage;
 }
 
 /**
- * The links `/maps` gives (spec 2.4): 256 random bits, good for five minutes and once, tied to
- * the member and the server; kept in memory by their SHA-256 alone, so a restart only expires
- * them. Its page names the account (`peek`); its POST starts a session as logging in with
- * Discord does (`redeem`).
+ * The links `/maps` and `/region edit` give (spec 2.4): 256 random bits, good for five minutes
+ * and once, tied to the member, the server and the page they open; kept in memory by their
+ * SHA-256 alone, so a restart only expires them. Its page names the account (`peek`); its POST
+ * starts a session as logging in with Discord does (`redeem`).
  */
 export class LoginLinks {
   private readonly links: BoundedMap<string, LinkHolder & { expiresAt: number }>;
@@ -26,11 +30,23 @@ export class LoginLinks {
     this.links = new BoundedMap(max);
   }
 
-  /** A new link's token for a member of a server, issued at `now`. */
-  issue(guildId: string, userId: string, userName: string, now: number): string {
+  /** A new link's token for a member of a server, issued at `now`, opening `page`. */
+  issue(
+    guildId: string,
+    userId: string,
+    userName: string,
+    now: number,
+    page: LinkPage = 'map',
+  ): string {
     this.links.dropWhile((link) => link.expiresAt <= now);
     const token = randomToken();
-    this.links.set(sessionHash(token), { guildId, userId, userName, expiresAt: now + LINK_MS });
+    this.links.set(sessionHash(token), {
+      guildId,
+      userId,
+      userName,
+      page,
+      expiresAt: now + LINK_MS,
+    });
     return token;
   }
 
@@ -41,7 +57,7 @@ export class LoginLinks {
   peek(token: string, now: number): LinkHolder | undefined {
     const link = this.links.get(sessionHash(token));
     if (!link || link.expiresAt <= now) return undefined;
-    return { guildId: link.guildId, userId: link.userId, userName: link.userName };
+    return { guildId: link.guildId, userId: link.userId, userName: link.userName, page: link.page };
   }
 
   /** Whom a link logs in; undefined for one that is unknown, used or expired. Used up by this. */
@@ -51,6 +67,6 @@ export class LoginLinks {
     if (!link) return undefined;
     this.links.delete(hash);
     if (link.expiresAt <= now) return undefined;
-    return { guildId: link.guildId, userId: link.userId, userName: link.userName };
+    return { guildId: link.guildId, userId: link.userId, userName: link.userName, page: link.page };
   }
 }
diff --git a/src/web/login.test.ts b/src/web/login.test.ts
index 316bdb3ee7f6c6e86d9226b26f172ac1d09122a8..fdd26cb80fab643bb50614b30db0c576e3909465 100644
--- a/src/web/login.test.ts
+++ b/src/web/login.test.ts
@@ -308,6 +308,24 @@ describe('login links', () => {
     expect(web.sessions.rows.size).toBe(0);
   });
 
+  it('of /region edit open the region editor, and lead there when they have expired', async () => {
+    web = webServerWith({ members: new FakeMemberDirectory().add(ASH, 'Ash') });
+    const editor = `/s/${FAKE_GUILD_ID}/regions/edit`;
+    const token = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now, 'regions/edit');
+    const url = `/auth/link/${FAKE_GUILD_ID}/${token}/edit`;
+    const page = (await web.app.inject({ url })).body;
+    expect(page).toContain('the region editor of this server');
+    expect(page).toContain(`<form method="post" action="${url}">`);
+    const first = await pressContinue(web, url);
+    expect(first.headers.location).toBe(editor);
+    expect(web.sessions.rows.size).toBe(1);
+    expect((await pressContinue(web, url)).headers.location).toBe(`${editor}?login=expired`);
+    // A link of /maps opens the map, whichever address it comes by.
+    const mapToken = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now);
+    const opened = await pressContinue(web, `/auth/link/${FAKE_GUILD_ID}/${mapToken}/edit`);
+    expect(opened.headers.location).toBe(MAP);
+  });
+
   it('of a server the bot is not in are not found', async () => {
     web = webServerWith();
     const token = web.loginLinks.issue('412345678901234999', ASH, 'Ash', web.clock.now);
````

### Task 6: Region editor: docs and staging checklist

Prototype commit: `6a572e7dac2ebc9f4c45c9972ffabb7d7af39126`

`web.md` (the editor's routes and rules; Manage Server also with Integrations overrides), `gyms-and-regions.md`, `testing.md`, `docs/web-setup.md`, CLAUDE.md's area index; the staging checklist `docs/superpowers/plans/2026-10-16-phase-8m2-staging.md`.

**Files:**

```
 CLAUDE.md                                              |  2 +-
 docs/architecture/gyms-and-regions.md                  |  3 ++-
 docs/architecture/testing.md                           |  3 ++-
 docs/architecture/web.md                               | 27 +++++++++++++++++++--------
 docs/superpowers/plans/2026-10-16-phase-8m2-staging.md | 59 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 docs/web-setup.md                                      |  4 +++-
 6 files changed, 86 insertions(+), 12 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check CLAUDE.md docs/architecture/gyms-and-regions.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-16-phase-8m2-staging.md docs/web-setup.md`.
- [ ] **Step 4: Check the transcription:** `git diff 6a572e7dac2ebc9f4c45c9972ffabb7d7af39126 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m2-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Region editor: docs and staging checklist`, the paragraph above as the body and the trailer, staging exactly
  `CLAUDE.md docs/architecture/gyms-and-regions.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-16-phase-8m2-staging.md docs/web-setup.md`.

````diff
diff --git a/CLAUDE.md b/CLAUDE.md
index a99b5757904a6d7fddff8a536a8ca1179de27ec5..b888461e78f293fd9f7974a59a2fb5398428bff7 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -158,7 +158,7 @@ Each file under `docs/architecture/` holds the conventions of one subsystem. Rea
 - `history.md`: the party history (its tables, how ended parties are recorded, the opt-in, the legacy import) and the statistics questions as tested SQL. Read before changing the history or writing a query over it.
 - `members-and-roles.md`: member settings and rows, member lookups and viewers, self-assigned roles. Read before changing members or roles.
 - `utilities.md`: game data, the catalogue, Pokémon search, raid tiers and bosses, nicknames, pictures, emoji, `/rank`, `/counters`, `/find-gym`, `/request`, `/maps`, `/help`. Read before changing any of these.
-- `web.md`: the web server in the bot, its settings and secrets, sessions, CSRF, logging in (Discord, the links of `/maps`), rate limits, the map's data and page, the CSP, how to add a route. Read before changing anything under `src/web/`.
+- `web.md`: the web server in the bot, its settings and secrets, sessions, CSRF, logging in (Discord, the links of `/maps` and `/region edit`), rate limits, the map's data and page, the region editor (its data, preview and save, the page) and `/region edit`, the CSP, how to add a route. Read before changing anything under `src/web/`.
 - `operations.md`: the Docker image and stack, `./pine`, the heartbeat and health check, the owner's alerts and the crash marker, the watchdog, backups, restore. Read before changing `Dockerfile`, `compose.yaml`, `pine`, `docker/` or `src/ops/`.
 - `testing.md`: the test database, fake interactions, the fake gateway, party, train, Wayfarer and web helpers. Read before writing tests.
 
diff --git a/docs/architecture/gyms-and-regions.md b/docs/architecture/gyms-and-regions.md
index 3cd5330a1867277d45ba3383b8e3726c4157cb12..faf86280a828ef5fca86fbfd38d455c285d7d7d7 100644
--- a/docs/architecture/gyms-and-regions.md
+++ b/docs/architecture/gyms-and-regions.md
@@ -33,6 +33,7 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 
 ## Regions
 
-- Regions are administered through `ctx.regionAdmin` (`RegionAdminService`, `src/services/region-admin-service.ts`): `preview`, `import`, `list`, `exported`, `remove`, under the `AdminLock` (`src/services/admin-lock.ts`) it shares with `GymAdminService`. An import creates channels and categories first (at most `MAX_NEW_CHANNELS` per import), writes every outline in one transaction (`RegionRepository.saveOutlines`), reloads both directories, takes back an orphan forum beside its channel or sets up a forum (`PartyService.setupForums(guildId, only)`), all inside the lock; nothing is written before staff press Import. A removal closes the region (`PartyStore.closeRegion`: an add for it throws `RegionClosedError`, which reports, meetups, trains and moves answer as no region), ends its parties, deletes the row (forum and summary ids from the locked row; `SavedRoutes` go by their foreign key), reloads, and keeps or deletes the forum. Regions are never deleted by themselves. Creating channels and deleting a forum need the staff member's own Manage Channels; audit-log reasons carry their id.
+- Regions are administered through `ctx.regionAdmin` (`RegionAdminService`, `src/services/region-admin-service.ts`): `preview`, `import`, `list`, `exported`, `remove`, under the `AdminLock` (`src/services/admin-lock.ts`) it shares with `GymAdminService`. An import creates channels and categories first (at most `MAX_NEW_CHANNELS` per import), writes every outline in one transaction (`RegionRepository.saveOutlines`), reloads both directories, takes back an orphan forum beside its channel or sets up a forum (`PartyService.setupForums(guildId, only)`), all inside the lock; nothing is written before staff press Import. A removal closes the region (`PartyStore.closeRegion`: an add for it throws `RegionClosedError`, which reports, meetups, trains and moves answer as no region), ends its parties, deletes the row (forum and summary ids from the locked row; `SavedRoutes` go by their foreign key), reloads, and keeps or deletes the forum. Regions are never deleted by themselves. Creating channels and deleting a forum need the staff member's own Manage Channels; audit-log reasons carry their id. `preview` takes the regions removed in the same save (`removing`, the region editor's): `planImport` counts their gyms among those left in no region.
+- The region editor on Pine's web pages (plan 8M-2; `docs/architecture/web.md`, "The region editor") saves through the same service: its save is `planSave` (`src/domain/regions/save-plan.ts`, the areas of an import named by their channels' current names, and the removals), then `preview` and `save` (one run under the lock: the versions checked again inside it, then the import's steps and each removal through the inner `importNow` / `removeNow`, which `import` and `remove` also run under the lock; audit-log reasons `region editor by <id>`), worded by `previewWords(…, 'editor')` / `outcomeWords` (`src/commands/regions/import.ts`, which `renderPreview` and `renderOutcome` also use) and `/region remove`'s `goesWith` / `outcomeLines`, as plain text (`plainWords`). `/region edit` (`src/commands/regions/edit.ts`, only with `settings.web`) gives its address and a login link. The pure parts of the editor are in `src/domain/regions/`: `version.ts` (`regionVersion`), `coverage.ts` (overlaps, gaps, their areas, `newPieces`, `newProblems`), `split.ts` (`splitOutline`), `edits.ts` (the staged edits); the web staff check reuses `isBotManagement`, the logic of `requireBotManagement`.
 - KML is read by pure code: `src/domain/geo/xml.ts` (a linear reader that never throws; DOCTYPE refused), `kml.ts` (`readKml`, `writeKml`, `kmlFiles`; at most `MAX_KML_AREAS` areas and `MAX_KML_CORNERS` corners in a file, descriptions as one line of plain text), `outline.ts` (`tidyOutline`: closed, latitude first, at most 5,000 corners, no self-crossing; checked by a longitude sweep), and `src/domain/regions/region-import.ts` (`planImport`, the channel a name stands for by the legacy rule, near misses, crowded categories). Gyms are tested against an outline's bounding box before the ring. The picture of a region is drawn from a simplified outline when the address would be too long; the stored outline never is.
 - `/bounds` is a members' command (the picture and the gym count of the region of the channel; `boundsMessage`: `### The area of <#channel>`, the count, the map as a gallery). `/find-region` answers with `findRegionMessage` (the sentence, the map, `OSM_ATTRIBUTION` in small print). Every message of `/region` is v2 (plan 8B-4, `REGION_COLOUR`): the preview of `/region import` and its outcome are one container (`### Import regions` and the sentences within `SENTENCES`, a line, **Would be imported** / **Left out** or **Imported** / **Not imported** within `IMPORT_LIST` and `LEFT_OUT_LIST`, `preview.txt` (of the outcome `outcome.txt`, `OUTCOME_FILE`) as a file component and a file of the message (`V2Message.files`) whenever a list or the sentences are cut, every line in it with channels by their names; **Not imported** has the larger room, the buttons inside; `importMessage`); the question and outcome of `/region remove` are `regionQuestion`s; answers go through `answerRegion`, and what the controls say (working, expired, cancelled, a refusal) through `sayRegion`. Forums that party rows name and no region has are `PartyService.orphanForums(guildId)`: named by `/region list` and `/admin setup-forums`, swept by `sweepPosts`. Region tests use `test/support/region-admin.ts` and `region-commands.ts`; the custom-id kind `region` belongs to the questions of `/region`.
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 239cad40dab4dde2a926bf021f96f402aadeaaeb..5d23b91121303b8aa0e1d1c03289f6b3d09a25ac 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -47,7 +47,8 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 ## The web server
 
 - Route tests build the server with `webServerWith(options)` (`test/support/web.ts`) and ask it with Fastify's `inject` (no port, no network); close `app` after each test. It gives `TEST_WEB` (`https://map.example.test`, OpenStreetMap) changed by `web`, the server of the fake interactions as the only one the bot is in (`servers`), nobody a member (`members`: a `FakeMemberDirectory`), a `FakeOAuth` (`knows(code, user)`, `exchanged`, `whoFails`; `oauth: undefined` is no client secret), sessions in memory (`sessions`: `MemoryWebSessions`, `sessionService`) on a clock of the test's (`clock.now`, from `WEB_START`), `loginLinks`, and `loggedIn(userId, name)` for the `cookie` header of a session. `setCookies(answer)` and `cookieOf(answer, name)` read what an answer set. The map's data comes from `geoSourcesWith()` (the invented gyms and regions under real directories, channels named `west` and `east`; pass `{ geo: sources }`), the page's bundle from `builtAssets()` (a folder with hashed names, made in the temp folder and removed when the test that called it is over, through `onTestFinished`: call it inside a test, not in a `beforeAll`; without it the page answers that it is not built). The cookie names follow the public address: `__Host-pine_session` and `__Secure-pine_oauth` under `TEST_WEB`, the plain names under `web: { publicUrl: 'http://localhost:…' }`; `loggedIn` uses `sessionService.cookieName`. The address of a request is `inject`'s `remoteAddress` (behind a proxy: `web: { trustProxy: true }`, a nearby `remoteAddress` and an `x-forwarded-for` header).
-- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The page's own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header); Leaflet and the real tiles are tried at staging.
+- The region editor (plan 8M-2): who is staff is `FakeRegionStaff` (pass it as `staff`; nobody is staff until `asStaff(userId, mayManageChannels)` or `answer(userId, staffAnswer)`; `asked` records every question, `failing` makes Discord away); its data comes from `editorSourcesWith(wayspotRows)` (the sources of `geoSourcesWith` with kept Wayspots and the channels as `ServerChannel`s: `west`, `east` in `Town`, `south`, a forum; pass `{ editor: sources }`); preview and save run over region administration on fakes, `regionEditingWith()` (`regionAdminWith` as the bot wires it, but the new overlaps and gaps worked out on the test's thread, `inThisThread`; pass `editing`, with a `checker` of the test's own to count or refuse checks; its `regions.rows`, `lock`, `store`, `gateway.auditReasons`, `entries` for the service's log). `SaveCheckWorker` is tested with its real thread through tsx and with `test/support/hanging-thread.ts`, which never answers (its limit by faked `setTimeout`). `posting(userId, name)` gives the headers of a POST of Pine's own page (cookie, `Origin`, CSRF token). `builtAssets()` holds the editor's script, style and worker too.
+- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the worker's `CoverageChecker`, the staged edits in a storage that may throw); Leaflet, Geoman, the worker in a browser and the real tiles are tried at staging.
 
 ## Operations
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index b240c2675cfbc7c64d959837f745b2954b196166..c39f7faec3607db6d329d1a6edb785dbd40d0570 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -1,14 +1,14 @@
 # The web server and the map
 
-The HTTP server in the bot (`src/web/`, plan 8M-1; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps`, rate limits, the public map's data and page, the Content Security Policy, and the rules for the routes of 8M-2 to 8M-5. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
+The HTTP server in the bot (`src/web/`, plans 8M-1 and 8M-2; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the region editor, the Content Security Policy, and the rules for the routes of 8M-3 to 8M-5. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
 
 ## Settings, secrets, start and stop
 
 - Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (`osm` default, or `google`). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
 - Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows OpenStreetMap). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
-- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going.
+- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going.
 - Fastify's own logger is off. Every request is logged at debug by `method`, its route pattern (`/auth/link/:guild/:token`, never the address it was asked with, which may carry a token or code), `status` and `ms`. Never log a token, cookie, OAuth code, CSRF token, secret or the query string of `/auth/*`; a failure is logged as `{ err }` with the route.
-- Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/`, a short page otherwise, never a stack or what went wrong; 500s are logged. Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's 2 MB in 8M-2) sets its own `bodyLimit`.
+- Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/` (401 "Log in first.", 403, 404, 413, 429, 503 "Not available just now."), a short page otherwise, never a stack or what went wrong; 500s are logged. Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's preview and save, 2 MB: `SAVE_BODY_LIMIT`) sets its own `bodyLimit`.
 
 ## Headers and the Content Security Policy
 
@@ -16,7 +16,7 @@ The HTTP server in the bot (`src/web/`, plan 8M-1; spec `docs/superpowers/specs/
 
 ## Addresses
 
-- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`. `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle.
+- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle.
 - Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters) or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
 
 ## Sessions and CSRF
@@ -28,17 +28,28 @@ The HTTP server in the bot (`src/web/`, plan 8M-1; spec `docs/superpowers/specs/
 ## Logging in
 
 - With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
-- With a link of `/maps` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member and one server, named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page without script (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, so that a link preview or a prefetch cannot spend the link. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped), because one click on somebody else's link logs you in as them, and the page is where you see whose it is. An unknown, used or expired link, or one of another server, shows plain "Continue" and nothing else (its POST lands on `?login=expired`). `POST /auth/link/<guild>/<token>` checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to `/s/<guild>/map` without the token; an unknown, used or expired link (or one of another server) leads (303) to the map with `?login=expired`. The guild is in the address so that an expired link still lands on its server's map. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
-- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against the commands' own throttles per member, not per address.
+- With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page without script (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, so that a link preview or a prefetch cannot spend the link. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped), because one click on somebody else's link logs you in as them, and the page is where you see whose it is. An unknown, used or expired link, or one of another server, shows plain "Continue" and nothing else (its POST lands on `?login=expired`). `POST /auth/link/<guild>/<token>` checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to `/s/<guild>/map` without the token; an unknown, used or expired link (or one of another server) leads (303) to the map with `?login=expired`. The guild is in the address so that an expired link still lands on its server's map. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
+- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`).
 
 ## The public map
 
 - `GET /s/<guild>/api/geo` is public: `geoView` (`src/domain/web/geo-view.ts`, pure; its types in `geo-data.ts`, which has no imports so the page can take them) gives the server's regions with an outline (named by their channels as the bot sees them, by their number where it sees none) and the gyms that lie in them (regions, address line, description, notice, elite mark; places to six decimals). Gyms in no region of any server are left out. `GeoCache` (`src/web/geo-cache.ts`) keeps each server's JSON with a strong ETag (the SHA-256 of the JSON, cut) and builds it anew when `GymDirectory.generation` or `RegionDirectory.generation` changed (every load, gym re-read or forget) or a region's channel was renamed; an `If-None-Match` that names it is answered 304 (`etagMatches`: a list of tags compared weakly, `W/` ignored, or `*`), `Cache-Control: no-cache`.
 - The page `/s/<guild>/map` is a static template (`mapPage`, `src/web/page.ts`) that loads the bundle's script and style; what the page needs is in escaped `data-` attributes of `<body>` (`data-guild`, `data-tiles`, `data-google-key` only with Google's tiles, `data-login` `discord | links`). Without a built bundle it answers 503 saying `npm run web:build`.
-- The page's code is `src/web/client/` with its own `tsconfig.json` (the DOM; the root config excludes the folder), bundled by `scripts/web/build.ts` (`npm run web:build`, also run by `npm run build`) with esbuild: an IIFE for ES2022, minified, into `dist/web/assets/` with hashed names (`map-<hash>.js`, `map-<hash>.css` with Leaflet's CSS, Leaflet's pictures), `dist/web/assets.json` naming the script and style (read at start by `readAssets`). The rest of `dist/web/` is the compiled server code; the build empties only `assets/`. `/assets/` (`@fastify/static`) serves that one flat folder: no index, no listing, plain file names only; a hashed name `public, max-age=31536000, immutable`, anything else `no-cache`.
+- The pages' code is `src/web/client/` with its own `tsconfig.json` (the DOM; the root config excludes the folder), bundled by `scripts/web/build.ts` (`npm run web:build`, also run by `npm run build`) with esbuild: IIFEs for ES2022, minified, into `dist/web/assets/` with hashed names: the map (`map-<hash>.js`, `map-<hash>.css` with Leaflet's CSS, Leaflet's pictures), the region editor (`editor-<hash>.js` with Geoman, `editor-<hash>.css` with Geoman's CSS, and its worker `editor-worker-<hash>.js`); `dist/web/assets.json` names each page's script and style and the worker (`AssetManifest`: `map`, `editor`; read at start by `readAssets`, which takes a manifest of an older build as none). What both pages share (the tiles with Google's layers, the header and its login, reading JSON) is `src/web/client/common.ts`. The rest of `dist/web/` is the compiled server code; the build empties only `assets/`. `/assets/` (`@fastify/static`) serves that one flat folder: no index, no listing, plain file names only; a hashed name `public, max-age=31536000, immutable`, anything else `no-cache`.
 - The page: Leaflet; OpenStreetMap's tiles with their attribution; with Google's tiles a layer switch (roadmap, satellite, hybrid: a session per layer from `createSession`, 2D tiles, the attribution of what is in view from `viewport` after the map rests, shown with "Google Maps"; `src/web/client/layers.ts`). Regions as outlines with their names from zoom 12; gyms as dots, elite raid gyms in their own colour; a popup per gym built as a tree of nodes and rendered with `textContent` only (`gymPopup`, `renderNode`): never HTML from data. Leaflet treats string content as HTML (tooltips, popups, attributions, the layer switch's names): data goes to it as nodes (`renderNode`; a region's label is `regionLabel`), and the only strings it is given are constants of ours and the escaped copyright of `googleAttribution`. The filter box hides gyms whose name and nickname lack a word typed (`gymFilter`: no case, accents or apostrophes) and fits the map to the matches on Enter. The header: "Log in with Discord" (only with the secret) or "Use /maps in Discord to log in.", or the member's name, Log out (a POST with the CSRF token; `logOut`, `src/web/client/logout.ts`: on a 403, the token of a page loaded before a restart, it asks `/api/me` again and tries once more, a session gone by then counting as logged out; a second refusal, any other or a broken connection says "Log out failed; try again.") and why they see only the public map. `?login=failed|expired` is said once and taken out of the address.
 
-## Adding a route (8M-2 to 8M-5)
+## The region editor (plan 8M-2)
+
+- **Who:** staff for regions as `/region` admits them, decided per request by `RegionStaffSource.check` (`DiscordRegionStaff`, `src/discord/web-staff.ts`: the member fetched fresh, `fetchGuildMember(…, true)`, then `regionStaffAnswer`, `src/web/region-staff.ts`): an admin, a moderator or a bot developer by role, or the bot's owner (`isBotManagement`, the guard's own check), who also has Manage Server (`/region`'s `default_member_permissions`, which on the web nobody else checks); their own Manage Channels says whether new channels may be made and forums deleted. A server that grants `/region` to a role through its Integrations overrides (Server Settings, Integrations) still needs Manage Server for that role's members on the web: the overrides are not read (Matt, 2026-10-16: Manage Server is kept). `staff`, `not-staff`, `not-member`, `unknown-server` (no `Guild` row yet), or `unreachable` (Discord failed: read-only, nothing written). The session says only who.
+- **The page** `/s/<guild>/regions/edit` (`editorPage`): the template with `data-worker` (the worker's script). Logged out: 401, a page with "Log in with Discord" (when offered, to `/auth/login?next=…`) and "/region edit", saying why the last login did not happen (`?login=failed|expired`); it never sends anybody to Discord by itself, so a failed login cannot loop. Not staff or no member: 403 "Only staff of this server may edit its regions." Discord unreachable: the page, read-only by its data. 20 a minute per address (each load asks Discord).
+- **The data** `GET /s/<guild>/api/regions/edit` (`EditorCache` over `editorView`, `src/domain/web/editor-view.ts`; types in `editor-data.ts`, without imports): the server's regions (id, channel id and name, category, description, outline, `version`), other servers' regions whose boxes meet the box of the server's outlines grown by 2 km (outlines only), the gyms in its regions and those in no region of any server inside that box (`[id, lat, lon, name]`), the kept Wayspots inside it (`[kind, lat, lon, title]`, no addresses or pictures), the text channels that are no region of any server; places at six decimals. The static part is kept per server until the generations of gyms, regions and Wayspots or the server's channels change; who asks (`userId`, `readOnly`, `mayManageChannels`, and the channels, none while read-only) is put in front per request; the ETag covers both; `private, no-cache`; 20 a minute per address (each asks Discord). 401, 403, 503 as the page.
+- **Versions:** `regionVersion` (`src/domain/regions/version.ts`): base64url of SHA-256 (written out in pure code, so the page has it too) over the outline at six decimals and the region's description, cut to 16. A changed or removed region is sent with the version its first staged edit saw. Wherever an outline enters a draft (drawn, split, of a file: `record`) and wherever the server takes one (`planSave`), it is `normalisedOutline` (six decimals, a corner the rounding repeats dropped), so page and server see the same corners.
+- **Preview and save** `POST /s/<guild>/api/regions/preview` and `…/save` (`src/web/editor-save.ts`): before the body is read (`onRequest`, so a refused request never has its 2 MB parsed): 30 a minute per address, `postGuard` (Origin, session, CSRF token), `REGION_CHECK_THROTTLE` (6 a minute per member by the session's user, `Throttles` key `region edit`); then 2 MB, staff as Discord has them now (503 with its own words while unreachable), `saveRequestSchema` (zod; at most 200 of each kind, the corners of a KML file). Both check everything again: `planSave` (`src/domain/regions/save-plan.ts`: a changed region named by its channel's current name, so `planImport` finds it; a new region on a text channel by id, or a new channel by a name no channel of the server has by `channelKey`, categories aside ("#south exists: pick it from the list …", or "… exists already: pick another name …"), in the category of its description read as `plainDescription` (empty: a category named after the channel); conflicts by version; outlines `normalisedOutline` and tidied), deleting a forum needs Manage Channels, something to do, and no new overlap or gap (`newProblems`), worked out off the bot's thread: `SaveChecks` over `SaveCheckWorker` (`src/web/save-check.ts`; a `node:worker_threads` thread per check, `save-check-thread.ts`, compiled beside it into `dist/web/`, run through tsx in tests; one at a time; ended after 10 s or past 256 MB: 422 "Too complex to check: simplify the outlines."; a failure of polyclip is logged and does not block), its verdict kept five minutes by a hash of the request and the versions of the server's regions, so the save of what was just previewed is not checked again. Answers (`SaveAnswer`): 200 `preview` (`/region import`'s words through `previewWords(…, 'editor')`, "Saving would …", and the removals with what goes with each, `goesWith`) or `saved` (`RegionAdminService.save`: one run under the admin lock that first plans the request again against the regions as they are inside the lock and does nothing when one changed meanwhile, 409; then the import's steps and each removal, a removal that rejects said as "I could not remove … (the log says what failed)" while the rest goes on; the audit log says `region editor by <id>`; `outcomeWords` and `/region remove`'s `outcomeLines`; areas the plan left out among "Not imported"), 409 `conflicts` (each region as it is now, or null when gone), 422 `refused` (lines). Everything is plain text (`plainWords`: mentions as `#name`, no markdown); the page sets it as text. A save is logged by numbers (`regions were saved in the web editor`), never names. The save is stateless: it plans again rather than keeping the preview's plan.
+- **The page's code** (`src/web/client/editor.ts`): Leaflet with `preferCanvas`, Geoman (free) for drawing polygons and rectangles, reshaping and moving, snapping (`snapDistance` 15) to every outline (other servers' outlines are `pmIgnore` with `snapIgnore: false`: snapped to, not editable; places are never snapped to); removal, restore, split (a drawn line, `splitOutline`; the larger part keeps the region; Swap), a new region's channel or new channel with its category, in the side panel. Every change is a staged edit (`src/domain/regions/edits.ts`), applied to the regions as loaded, undone and redone, kept in `localStorage` under `pine-region-edits:<guild>:<user>` (`staged-storage.ts`, never throws; a full storage says "This browser's storage for the page is full: save or discard some changes."), and after a save, full or partial, rebased on the regions as the server has them (`rebaseAfterSave`: what the server has as staged is dropped, the rest keeps the version its first edit saw, so a change by somebody else meanwhile is a conflict). Outline edits of one region within 2 s of each other are one step of undo (a drag); undo goes back 200 steps at most, the oldest edits beyond being one step. A region the server has as it is staged is no conflict (a save whose answer never came). Save sends exactly the body it previewed (`saveBody`) and previews again when the drafts changed since; an answer that fails or cannot be read (`readSaveAnswer`: `unknown`) loads the data again, rebases and says "The outcome is not known: here is what the server has now." A new channel's name the server has is refused in the panel as the server would (`newChannelProblem`). Gym counts, places in no region (orange), outlines that cannot be saved (red), why Save is off: `editor-view.ts`. Overlaps and gaps: worked out in a worker (`editor-worker.ts`, `CoverageChecker`, `coverage-check.ts`) after edits rest 400 ms (a worker that fails to load or to cut keeps Save waiting for nothing: the server checks a save itself); shaded, new ones thicker, listed new first then by area (200 at most) with the gyms, stops, power spots and Wayfarer gyms in them. Regions changed by somebody else show dashed in blue with "Take theirs" / "Keep mine". KML in with `readKml` (one edit) and out with `writeKml` (`<server name>-regions.kml`).
+- **Overlaps and gaps** (`src/domain/regions/coverage.ts`, polyclip-ts): pairwise intersections of outlines whose boxes meet (cached per pair of outlines by identity), gaps the holes of the union less what lies in them (`newProblems` cuts the gaps over the outlines whose boxes chain to what changed, `chainedTo`, so a region that closes a ring of regions is seen to close its hole); areas on the sphere (Lambert cylindrical equal-area); a piece thinner than 0.5 m on average (twice its area over its perimeter) is the six-decimal rounding and left out. A piece is new unless 90 % of its area lies inside one piece of its kind of the loaded outlines (so a shrunk overlap, or one split between two regions, is not new). Fix and "Fix all slivers" are plan 8M-2F.
+- **CSP:** unchanged. The worker is a script of Pine's (`worker-src` falls back to `script-src 'self'`). Geoman sets no style element and its CSS is bundled; its toolbar sets constants of its own as HTML; lodash's `Function("return this")` in its bundle is never reached in a browser.
+
+## Adding a route (8M-3 to 8M-5)
 
 - Put it under `/s/<guild>/` in `guildRoutes` (the guild check comes first), JSON under `/s/<guild>/api/`. Read the session with `sessions.of`; decide what the member may do from fresh data each time (`members.find`, `fetchGuildMember(…, true)` before a staff write), never from the session; refuse writes while Discord cannot be reached.
 - Every POST: `preHandler: postGuard(…)`, a body validated with zod, the limit of 16 KB unless the route says otherwise; call the service the command calls (never a repository or Discord directly), with the command's own throttle per member; log a write as a command is logged (member, server, what), never the texts.
diff --git a/docs/superpowers/plans/2026-10-16-phase-8m2-staging.md b/docs/superpowers/plans/2026-10-16-phase-8m2-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..af21b84de7a031283f42d43ed14ed648ecacb16d
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-16-phase-8m2-staging.md
@@ -0,0 +1,59 @@
+# Phase 8M-2 staging checklist: the region editor and `/region edit`
+
+Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the editor in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`. The web settings of 8M-1's staging stay (`"web": { "port": 8080, "publicUrl": "http://localhost:8080" }`).
+
+## Before
+
+1. No migration in this plan. `npm run build` (it runs `npm run web:build`): `dist/web/assets/` holds `editor-<hash>.js`, `editor-<hash>.css` and `editor-worker-<hash>.js` beside the map's files, and `dist/web/assets.json` names them under `map` and `editor`.
+2. `/region edit` is new: `npm run deploy-commands -- --global` with Matt's go-ahead.
+3. A copy of the dev database's `Region` rows (a dump of the table) before anything is saved, to put back after the steps that change regions.
+
+## Who may open it
+
+4. `/region edit` as a moderator of the test server: a private container with the editor's address and "Open the region editor (logs you in)". The button opens "Open the region editor of this server, logged in with the link from /region edit." with "Continue as <account>"; Continue lands on `/s/<id>/regions/edit` without the token. The same button again: the editor's page says "This login link has expired. Log in to edit this server's regions." with "Log in with Discord" and "Or use /region edit in Discord."
+5. `/region edit` as a member without a staff role: "Only admins, moderators and bot developers can do that." Logged in on the web as that member (`/maps`, then the editor's address): "Only staff of this server may edit its regions." (403); the map stays theirs.
+6. Take the moderator's role away on Discord while the editor is open, then press Save: refused (403) at once, without a restart (the member is fetched fresh). Give it back.
+7. The console shows no CSP violation: Leaflet's and Geoman's styles and icons load, the worker starts (`editor-worker-<hash>.js` in the network panel).
+
+## What it shows
+
+8. The test server's regions with their channel names and gym counts; other servers' regions (if any within 2 km) dashed grey and not selectable; gyms green, gyms in no region orange; the layer switch toggles stops (off at first), power spots, Wayfarer gyms Pine did not take, other servers' regions, overlaps and gaps. A stop outside every region is orange.
+9. `/s/<id>/api/regions/edit` twice: the second a 304. Its size for the test server, and how long the page takes to show (network panel).
+
+## Drawing
+
+10. Draw a new polygon with Geoman: it is staged ("new region (no channel yet)"), Save is off with "1 new region has no channel yet." Pick a text channel that is no region: the label follows; pick "A new channel…" with a name and a category.
+11. Reshape a region (drag a corner, add one in the middle of a side, remove one with a right click): the gym count follows; drag a whole region in drag mode. Make an outline cross itself: it turns red, Save is off with the reason; fix it.
+12. Snapping: draw a region beside another; its corners snap to the other's corners and sides (the shared border shows no sliver in the overlap and gap list).
+13. Split a region along a drawn line (from outside, across, to outside; click the last point again): the larger part keeps it, the new one asks for its channel; "Swap with …" exchanges them. A line that does not go across says so.
+14. Remove a region (keep its forum), another (delete its forum, as a moderator with Manage Channels; without it the button is not offered); Restore one.
+15. Undo and redo step through every edit; reload the page: everything staged is still there (localStorage `pine-region-edits:<guild>:<user>` in the storage panel); a private window starts empty.
+
+## Overlaps and gaps
+
+16. Make an overlap on purpose (drag a side into a neighbour): after a moment it is shaded red and listed first as "New overlap of … m², #a and #b: …", Save is off with "Your changes make 1 new overlap." Pull the side back: it is gone. A gap the same way (between three regions).
+17. Load Pittsburgh's real regions (the production dump's `Region` rows restored into the dev database, or `/region import` of their export into the test server, with Matt's go-ahead): the lists show the existing overlaps and gaps with their areas and what lies in them (compare with spec 4.3: 124 overlaps over 2,000 m² and about 1,200 smaller; 22 gaps over 2,000 m² and about 590 smaller; time how long the worker takes after an edit, and whether the page stays responsive meanwhile); none of them blocks Save; an edit elsewhere saves.
+18. Beside a densely traced neighbour of Pittsburgh's (an outline of hundreds of corners along a township line), reshape the shared border by hand: drag a corner of the hand-drawn region onto the traced border, add one, move one. Note how often Save is refused for a new sliver (a thin overlap or gap along the border) before 8M-2F's Fix exists, and how wide those slivers are, for 8M-2F.
+
+## Saving
+
+19. Save…: the preview in `/region import`'s words ("Saving would give 1 new region and 1 new outline. Nothing is changed yet.", **Would be imported**, the channels and categories it would create, gyms left in no region, **Would be removed** with what goes with each). Cancel changes nothing.
+20. Save these changes: the outcome region by region; the new channel and its category exist on Discord, with a forum; the removed region's forum kept or deleted as chosen; the staged list is empty afterwards (localStorage cleared); `/region list` shows the same; the bot's log has `regions were saved in the web editor` with numbers only.
+21. A partial save: stage a new region on a channel, delete that channel on Discord, then save: the outcome says it was not imported, and it stays staged.
+22. Two editors at once (two tabs, or a tab and `/region import`): change a region in one and save; save a change of the same region in the other: "Changed by somebody else", theirs dashed blue; "Take theirs" drops the staged change, "Keep mine" saves it over theirs on the next Save.
+23. With the bot unable to reach Discord (Matt pulls the network for a moment, if at all): the editor opens read-only with "Discord cannot be reached just now, so the editor is read-only.", no channel offered, Save off; a save sent anyway answers 503.
+
+## KML
+
+24. Export KML: `<server name>-regions.kml` with the staged changes; `/region import` of that file in Discord previews "outline unchanged" for the saved regions.
+25. Load KML (the Pittsburgh export, or a file from Google My Maps): the areas named after regions reshape them, others become new regions (of the channels they name, or new channels in the category of their description); one Undo takes the whole file back. A KMZ says to export KML instead.
+
+## Afterwards
+
+26. Put back the `Region` rows from step 3 if the test server's regions should be as before; delete the channels and categories made for the test.
+
+## Left open (to the follow-ups if not settled here)
+
+- How long the worker takes for Pittsburgh's outlines, and how long a save's own check takes in its thread (`SaveCheckWorker`; the bot's log stays live meanwhile), and whether a preview of a whole city's edit stays under its 10 s limit.
+- The page on a phone (Geoman's tools on touch).
+- Fix and "Fix all slivers", the worst-first list on first open: plan 8M-2F.
diff --git a/docs/web-setup.md b/docs/web-setup.md
index 12db5a01b6212616b4f962ad05a4dc0991280175..d5688dccf39d3d55da2aab7d96ce0c9f5b1c64ea 100644
--- a/docs/web-setup.md
+++ b/docs/web-setup.md
@@ -1,6 +1,6 @@
 # Setting up Pine's web pages
 
-Pine can serve a live map of each server's regions and gyms, to everybody, with a login for members (plan 8M-1; the region editor and the parties on the map follow). It is off until `settings.web` is set. Pine itself serves plain HTTP on this machine; how people reach it from outside (a tunnel or a reverse proxy, with its certificate) is set up beside it.
+Pine can serve a live map of each server's regions and gyms, to everybody, with a login for members (plan 8M-1), and a region editor for each server's staff (plan 8M-2; the parties on the map follow). It is off until `settings.web` is set. Pine itself serves plain HTTP on this machine; how people reach it from outside (a tunnel or a reverse proxy, with its certificate) is set up beside it.
 
 ## 1. The settings
 
@@ -56,3 +56,5 @@ The price (Google's pricing page, checked 2026-10-16; check again before enablin
 ## 5. Check it
 
 Start the bot and look for `web server listening` in its log. Open `<publicUrl>/s/<server id>/map`: the regions and gyms of that server are shown to everybody. `/maps` in the server gives the map's address and the login button.
+
+The region editor is `<publicUrl>/s/<server id>/regions/edit`; `/region edit` gives its address and a login button to staff (admins, moderators and bot developers who may manage the server, as for `/region`). On the web the editor asks for Manage Server itself: a server that lets a role use `/region` through its Integrations overrides (Server Settings, Integrations) must also give that role Manage Server for the editor. After an update that adds `/region edit`, register the commands again (`./pine deploy-commands`). Its page needs nothing more to set up: it is built with the map (`npm run build`).
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8m2 HEAD -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-16-phase-8m2-staging.md` prints nothing; then `npm run check`, `npm run build` and `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db`, once each and one after the other. The new and changed test files with timers or waits (the save check's, the editor routes', the staged edits') ten times in a row.
2. Whole-branch review (`pine-reviewer`, Opus, high effort); one fix wave if it finds something (`pine-prototyper`, RED first).
3. If `typescript-migration` moved: merge it into `wayfarer`, settle conflicts (likely the follow-ups, `docs/superpowers/gantt-data.js`, `CLAUDE.md`, `src/app.ts`, `package.json` and `package-lock.json`), run the full check and the database suite again. Fast-forward `typescript-migration` to `wayfarer` when the main checkout is clean and the cutover session is not committing (ask it). Never push.
4. `CLAUDE.md` status line, the follow-ups ("From Phase 8M-2": the rulings and "Made while prototyping" above for Matt, what only staging shows), the Gantt chart (`npm run gantt -- done 8M-2.<n> <commit>` per task, then `review`), the ledger and memory.

## Staging checklist

The checklist is `docs/superpowers/plans/2026-10-16-phase-8m2-staging.md` (added by the last task). Each step with Matt's go-ahead, on the test server with the dev application: `npm run build`, `npm run deploy-commands -- --global` (`/region edit` is new); Matt starts the bot; the editor in the built-in browser with the test server's regions (and Pittsburgh's real outlines from the dev database).
