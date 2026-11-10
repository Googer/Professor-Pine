# Phase 8M-9B: Reports at Stops on the Map: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the second of the two 8M-9 plans of the web polish: the page's part of 8R-3. Field research and Team GO Rocket at PokéStops are drawn, listed, filtered and reported on the map, and a member's own report is taken back from it, over the routes 8R-3 built (`GET /api/stop-reports`, `/api/research-options`, `/api/rocket-options`, `POST /api/research`, `/api/rocket`, `/api/stop-reports/<id>/remove`).

- **Task 1:** the server side: square pictures made when the task list and the lineups are read (`prepare` in the two services, `reportPictures` for typed rewards), `picture` and `rewardText` on `MapResearch`, `picture` and `typeKey` on `MapGrunt`, each research version's own `rewards`, `backAtWords` shared with the post, `rewardWords` over `rewardLine`, `StopReportAnswer.reason` from `ListChanged`.
- **Task 2:** the Field research and Team GO Rocket layers with their own poll, one marker per stop (both kinds as a half-and-half ring), the shared-place seam with the parties, the icons (QuestSymbol as a CSS mask tinted `--research`, the Rocket R), the header from 768 px ("Layers · n" up to 1023 px).
- **Task 3:** the list's Field research and Team GO Rocket groups, the waiting note, reports nearest first under Most going.
- **Task 4:** a stop's popup and phone card, Take back with the button's `madeAt`, "Ended" at `endsAt`.
- **Task 5:** the filters, always in sight (the map's chip line, the group heading, the dashed toggle).
- **Task 6:** Research and Team GO Rocket in the Report menu; step 2 at PokéStops.
- **Task 7:** the Team GO Rocket form at a stop (lineups, the hideout question, "Already reported").
- **Task 8:** the field research form (search, versions, a typed task, "Add stops…", the contradiction question, "Same task at more stops…").
- **Task 9:** docs (`web.md`, `stop-reports.md`, `testing.md`) and the staging checklist `2026-10-27-phase-8m9b-staging.md`.

**Tech stack:** TypeScript 6.0, Node 24, Leaflet, esbuild, Fastify and Vitest. No new dependency, no new route, no migration, no setting, no command change (no deploy needed); the CSP is unchanged.

**Spec:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` (approved by Matt 2026-10-25), `docs/architecture/web.md`'s 8R-3 section, and the brief `.superpowers/sdd/2026-10-27-phase-8m9b-stop-reports-map/design.md` (git-ignored) with its builder check's rulings B1–B18 (B7, the header, provisional for Matt), its review findings and `progress.md`.

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto-8m9b` (tip `d82b35d2`), one commit per task, on web-polish 9f57b658. Each commit typechecks and passes its tests; on the tip the full check passes (10,541 tests), the build passes and the database suite passes (611 tests).

**Reviews:**

- **The brief:** an Opus builder check (the square pictures need the server; the server picks a report's picture; a report and a party at one stop share a tap; `reason` on the answers; the header's width), ruled B1–B18 by the controller.
- **The prototype:** an Opus review: ready after fixes (3 Important: the draw tests on the real clock, the page's own version rewards, the search field rebuilt per key; 8 Minor); fix round 1 folded in.
- **Fix round 1:** a scoped re-review (1 Important: the parties' placeholder took the first list, so every post was fetched and "Nothing is on just now." shown; 2 Minor); fix round 2 folded in.
- **Fix round 2:** a scoped re-review: ready, one Minor finding (S1: a stop redraw replaces a parties list waiting behind an open form) left for the branch's fix wave.

**Conventions:** read `CLAUDE.md` and `docs/architecture/web.md`, `stop-reports.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck (root and `src/web/client`) and its own test files. The full check, the build and the database suite run once on the tip. Work in `../Professor-Pine-web` on `web-polish`; never commit in the main checkout.

## Review Focus

- A form held open survives the stop poll's redraws, and the parties' list that came meanwhile is drawn when it closes (S1).
- Take back sends the `madeAt` the member saw; a report changed in place is refused, not taken back.
- A report drops at its `endsAt`, and an open popup says "Ended" rather than vanishing under the member.
- The research form's answers (`ended`, `list-changed`, 404, 409, the contradiction question) each leave a usable form or close it with the server's words, never a loop.
- Nothing scrolls sideways at 360 px; the desktop header stays one row from 768 px with a long member name.

---

### Task 1: 8M-9B task 1: square pictures for the map's reports, backAtWords, reason

Prototype commit: `f5700cd5f39ee113120e6ffe875dedb3000e5e8a`

The server side of the map's reports at stops (plan 8M-9B, rulings B1, B2, B4, B5):

- The task list and the lineups have their pictures made square as they are
  read (`taskPictureSources`, `lineupPictureSources`, `StopPictures.prepare`
  fire-and-forget, never per request); a typed task's reward, on no list, as
  it is reported (`reportPictures`, a listener of the stop reports).
- `stopReportView` and the pick lists name rewards' and catches' pictures as
  the post of the stops does (`StopPictures.url`); research and grunts carry
  their own `picture` (`researchPicture`, `rocketPicture`) as hideouts did.
- What the page shows and filters by comes from the server: research's
  `rewardText` (`rewardLine`, the post's reward line before it is made plain)
  and a grunt's `typeKey` (`typeKeyOf`), which a filter by type matches.
- `StopReportAnswer.reason`: `ended` for `REPORT_ENDED`, `list-changed` for
  `TASK_LIST_CHANGED` and `LINEUPS_CHANGED`; the words unchanged.
- `backAtWords` in `src/domain/stops/` (imports nothing), used by the post's
  heading (its output unchanged) and the map's page.
- The web tests' picture origins include `publicUrl`, as the bot's do.

**Files:**

```
 src/app-wiring.test.ts                     | 25 ++++++++++++++++++++++++-
 src/app-wiring.ts                          | 17 +++++++++++++++++
 src/app.ts                                 | 25 +++++++++++++++----------
 src/commands/research/research-input.ts    |  6 +++---
 src/commands/research/research.test.ts     |  4 ++++
 src/commands/rocket/rocket-input.ts        |  8 ++++----
 src/commands/rocket/rocket.test.ts         | 16 +++++++++++++++-
 src/discord/errors.ts                      |  9 +++++++++
 src/domain/research/task.ts                | 10 ++++++++++
 src/domain/stops/back-at.test.ts           | 11 +++++++++++
 src/domain/stops/back-at.ts                | 14 ++++++++++++++
 src/domain/stops/pictures.test.ts          | 32 ++++++++++++++++++++++++++++++++
 src/domain/stops/pictures.ts               | 41 +++++++++++++++++++++++++++++++++++++++++
 src/domain/web/stop-report-data.ts         | 33 +++++++++++++++++++++++++++++++++
 src/domain/web/stop-report-view.test.ts    | 99 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/web/stop-report-view.ts         | 91 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------------------
 src/render/research.ts                     | 11 ++++++-----
 src/render/stop-post.ts                    |  3 ++-
 src/services/research-task-service.test.ts | 22 +++++++++++++++++++++-
 src/services/research-task-service.ts      | 14 ++++++++++++++
 src/services/rocket-lineup-service.test.ts | 22 +++++++++++++++++++++-
 src/services/rocket-lineup-service.ts      | 10 +++++++++-
 src/web/stop-options.test.ts               | 86 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/web/stop-options.ts                    | 24 ++++++++++++++++++++----
 src/web/stop-report-post.test.ts           | 16 ++++++++++++++--
 src/web/stop-routes.ts                     | 19 +++++++++++++++----
 test/support/web.ts                        |  3 ++-
 27 files changed, 609 insertions(+), 62 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/app-wiring.test.ts src/commands/research/research.test.ts src/commands/rocket/rocket.test.ts src/domain/stops/back-at.test.ts src/domain/stops/pictures.test.ts src/domain/web/stop-report-view.test.ts src/services/research-task-service.test.ts src/services/rocket-lineup-service.test.ts src/web/stop-options.test.ts src/web/stop-report-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff f5700cd5f39ee113120e6ffe875dedb3000e5e8a -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-9B task 1: square pictures for the map's reports, backAtWords, reason`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app-wiring.test.ts b/src/app-wiring.test.ts
index c6731349501dc81f3bd807aee3e1e3c45f5f4549..1f72cb0630044ace89bcb4e089c8361a795af936 100644
--- a/src/app-wiring.test.ts
+++ b/src/app-wiring.test.ts
@@ -1,9 +1,32 @@
 import { describe, expect, it } from 'vitest';
 import { createTestLogger } from '../test/support/test-logger.js';
-import { picturesServed, stopReportSteps } from './app-wiring.js';
+import {
+  DRATINI,
+  REPORT_SERVER,
+  REPORTER,
+  researchReport,
+} from '../test/support/stop-report-cases.js';
+import { picturesServed, reportPictures, stopReportSteps } from './app-wiring.js';
+import { ENCOUNTER_PICTURE } from './domain/stops/pictures.js';
 import { createShutdown } from './shutdown.js';
 
 describe('the wiring of the pictures and the reports at stops (plan 8R-6)', () => {
+  it('has a typed task’s reward made square when it is reported, which no list holds (plan 8M-9B)', () => {
+    const prepared: string[][] = [];
+    const listener = reportPictures({
+      prepare: (sources) => Promise.resolve(void prepared.push([...sources])),
+    });
+    const research = { ...researchReport().research, rewards: [DRATINI], typed: true };
+    listener.reported?.({
+      serverId: REPORT_SERVER,
+      reports: [{ ...researchReport({ research }), id: 1 }],
+      reporter: REPORTER,
+      period: { key: 'day:2026-10-21', kind: 'day', start: 0, end: 1 },
+      replaced: [],
+    });
+    expect(prepared).toEqual([[ENCOUNTER_PICTURE, DRATINI.image]]);
+  });
+
   it('tells the pictures of the stops that the web server listens, with the eggs', () => {
     const told: string[] = [];
     picturesServed({
diff --git a/src/app-wiring.ts b/src/app-wiring.ts
index c24625cdabb04670470133970b3d96bbc4165844..9fde2a5c96fd79c3d4e8ca3cc524c016d3038a84 100644
--- a/src/app-wiring.ts
+++ b/src/app-wiring.ts
@@ -1,3 +1,6 @@
+import { taskPictureSources } from './domain/stops/pictures.js';
+import type { PictureMaking } from './services/research-task-service.js';
+import type { StopReportListener } from './services/stop-reports.js';
 import type { ShutdownStep } from './shutdown.js';
 
 /*
@@ -10,6 +13,20 @@ export interface ServedPictures {
   serving(): void;
 }
 
+/**
+ * Has the pictures of reported research made square (plan 8M-9B, B1): a typed task's reward is
+ * on no list that `ResearchTaskService` makes square when it reads it, so the map's view would
+ * name the feed's address all day. Every other picture of a report is a list's (the tasks', the
+ * lineups' with the portraits), made when the list is read; asked again it is passed over.
+ */
+export function reportPictures(pictures: PictureMaking): StopReportListener {
+  return {
+    reported: (news) => {
+      void pictures.prepare(taskPictureSources(news.reports.map((report) => report.research)));
+    },
+  };
+}
+
 /** Something the shutdown closes and waits for. */
 interface Closing {
   close(): Promise<void>;
diff --git a/src/app.ts b/src/app.ts
index d193d406e2cb423f848fc5bd2d5aa6e2f97750c2..94cd02369fb945ab634271e356b71075250ab97b 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -149,7 +149,7 @@ import {
 import { healthFiles } from './ops/health.js';
 import { gatewayConnected, Heartbeat } from './ops/heartbeat.js';
 import { startCheckpoint } from './ops/start-stop.js';
-import { picturesServed, stopReportSteps } from './app-wiring.js';
+import { picturesServed, reportPictures, stopReportSteps } from './app-wiring.js';
 import { createShutdown } from './shutdown.js';
 import { maxLook } from './render/max-post.js';
 import { raidLook } from './render/raid-post.js';
@@ -292,8 +292,19 @@ export async function startApp(
     fetch: (url, init) => fetch(url, init),
     log,
   });
+  // The square pictures of the reports at stops (plan 8R-6): kept in var/pictures/, named at the
+  // web server's address once it listens, the feeds' addresses till then. The task list and the
+  // lineups have theirs made as they are read (plan 8M-9B), for the map's views and pick lists.
+  const stopPictures = new StopPictures({
+    settings: config.settings,
+    folder: PICTURE_FOLDER,
+    fetch: (url, init) => fetch(url, init),
+    log,
+  });
+  void stopPictures.start();
   // The field research task list (plan 8R-1): Leek Duck's page, the last good list kept.
   const researchTasks = new ResearchTaskService({
+    pictures: stopPictures,
     url: config.settings.research.url,
     refreshMs: config.settings.research.refreshHours * HOUR_MS,
     staleAfterMs: config.settings.research.staleAfterHours * HOUR_MS,
@@ -304,6 +315,7 @@ export async function startApp(
   });
   // Team GO Rocket's lineups (plan 8R-2): ScrapedDuck's feed, the last good list kept.
   const rocketLineups = new RocketLineupService({
+    pictures: stopPictures,
     url: config.settings.rocket.url,
     refreshMs: config.settings.rocket.refreshHours * HOUR_MS,
     staleAfterMs: config.settings.rocket.staleAfterHours * HOUR_MS,
@@ -323,6 +335,8 @@ export async function startApp(
     rewardHash: (reward) => rewardHash(reward, gameData.catalogue),
     log,
   });
+  // A typed task's reward, on no list, made square once reported (plan 8M-9B).
+  stopReports.listen(reportPictures(stopPictures));
   const gymRepository = new GymRepository(db);
   const gyms = new GymDirectory({
     gyms: gymRepository,
@@ -420,15 +434,6 @@ export async function startApp(
   const savedRoutes = new SavedRouteRepository(db);
   // Eggs' pictures from the web server only once it listens (`startWebServer`), files till then.
   const eggPictures = new EggPictures(config.settings);
-  // The square pictures of the reports at stops (plan 8R-6): kept in var/pictures/, named at the
-  // web server's address once it listens, the feeds' addresses till then.
-  const stopPictures = new StopPictures({
-    settings: config.settings,
-    folder: PICTURE_FOLDER,
-    fetch: (url, init) => fetch(url, init),
-    log,
-  });
-  void stopPictures.start();
   const partyService = new PartyService({
     eggPictures,
     wayspots,
diff --git a/src/commands/research/research-input.ts b/src/commands/research/research-input.ts
index 619bcd08d6dd2e49a7adb795f97e9db4af4b5a71..cc9f7bff166d8dd2d971ce3c8e60d770f18fc124 100644
--- a/src/commands/research/research-input.ts
+++ b/src/commands/research/research-input.ts
@@ -1,7 +1,7 @@
 import type { AppContext } from '../../app-context.js';
 import type { Settings } from '../../config/settings.js';
 import type { LocatedInteraction } from '../../discord/command.js';
-import { UserError } from '../../discord/errors.js';
+import { ListChanged, UserError } from '../../discord/errors.js';
 import { guildIdOf } from '../../discord/guards.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { variedThrottleKey } from '../../discord/router.js';
@@ -324,12 +324,12 @@ export function readTask(
   const subject = researchSubjectOf(text);
   if (subject?.hash !== undefined && !subject.task.startsWith('typed:')) {
     const found = ctx.researchTasks.byVersion(text);
-    if (!found) throw new UserError(TASK_LIST_CHANGED);
+    if (!found) throw new ListChanged(TASK_LIST_CHANGED);
     return versionSubject(found.task, found.version);
   }
   if (isTaskKey(text)) {
     const task = ctx.researchTasks.byKey(text);
-    if (!task) throw new UserError(TASK_LIST_CHANGED);
+    if (!task) throw new ListChanged(TASK_LIST_CHANGED);
     return listedVersion(ctx, task, reward);
   }
   if (text === '')
diff --git a/src/commands/research/research.test.ts b/src/commands/research/research.test.ts
index 7be2193d76d20deca51f07f0bfeeee94ba4c8250..2a7aec5480cb2892e2093acff598e19709a1fa35 100644
--- a/src/commands/research/research.test.ts
+++ b/src/commands/research/research.test.ts
@@ -41,6 +41,7 @@ import {
   TASK_LIST_CHANGED,
 } from './research-input.js';
 import { Rehearsal } from '../../services/rehearsal.js';
+import { ListChanged } from '../../discord/errors.js';
 import { stopsByKey } from './research-report.js';
 import {
   NOT_YOUR_REPORT,
@@ -453,6 +454,9 @@ describe('/research report and the versions of a task (plan 8R-5)', () => {
       'Make 3 Excellent Throws in a row does not give Rare Candy: pick the reward from the list.',
     );
     expect(() => subject(`${THROWS.key}:00000000`)).toThrow(TASK_LIST_CHANGED);
+    // Known by its kind, not its words (review F8): the map asks for its lists again.
+    expect(() => subject(`${THROWS.key}:00000000`)).toThrow(ListChanged);
+    expect(() => subject('0123456789abcdef')).toThrow(ListChanged);
     // A typed task with its reward is a version of it (R11).
     expect(subject('Win 3 raids in the rain', 'rare candy')).toMatch(
       /^typed:[0-9a-f]{16}:[0-9a-f]{8}$/,
diff --git a/src/commands/rocket/rocket-input.ts b/src/commands/rocket/rocket-input.ts
index bec1384d893b8f769c7b89f4cda75320575a5cc4..0ba7d0553e53eb7264026900c8950a321e3245bb 100644
--- a/src/commands/rocket/rocket-input.ts
+++ b/src/commands/rocket/rocket-input.ts
@@ -1,6 +1,6 @@
 import type { AppContext } from '../../app-context.js';
 import type { Settings } from '../../config/settings.js';
-import { UserError } from '../../discord/errors.js';
+import { ListChanged, UserError } from '../../discord/errors.js';
 import { variedThrottleKey } from '../../discord/router.js';
 import type { Throttle } from '../../discord/throttle.js';
 import {
@@ -170,12 +170,12 @@ function lineupOfNow(choices: readonly RocketChoice[], value: string): RocketCho
   const key = value.slice(0, mark);
   const who = parseRocketKey(key);
   // Only a lineup's key carries a fingerprint (B14).
-  if (who?.kind !== 'grunt' || who.lineup === undefined) throw new UserError(LINEUPS_CHANGED);
+  if (who?.kind !== 'grunt' || who.lineup === undefined) throw new ListChanged(LINEUPS_CHANGED);
   const type = choices.find((choice) => choice.key === typeKeyOf(key));
   const lineup = type?.lineups?.find(
     (one) => one.lineup === who.lineup && one.fingerprint === value.slice(mark + 1),
   );
-  if (!type || !lineup) throw new UserError(LINEUPS_CHANGED);
+  if (!type || !lineup) throw new ListChanged(LINEUPS_CHANGED);
   return lineupChoice(type, lineup);
 }
 
@@ -209,7 +209,7 @@ export function readWho(ctx: Pick<AppContext, 'rocketLineups'>, value: string):
       who.kind === 'grunt' && who.lineup !== undefined
         ? undefined
         : choices.find((choice) => choice.key === text);
-    if (!chosen) throw new UserError(LINEUPS_CHANGED);
+    if (!chosen) throw new ListChanged(LINEUPS_CHANGED);
     return chosen;
   }
   const folded = searchText(text);
diff --git a/src/commands/rocket/rocket.test.ts b/src/commands/rocket/rocket.test.ts
index 1738052352f769174d63640517c0200508c21efc..93aa97a568066b81043a093f3bc9cfc5f4ff7f8c 100644
--- a/src/commands/rocket/rocket.test.ts
+++ b/src/commands/rocket/rocket.test.ts
@@ -37,7 +37,13 @@ import { StopReportService } from '../../services/stop-reports.js';
 import { NO_STOPS_HERE } from '../research/research-input.js';
 import { NOT_YOUR_REPORT, REPORT_CHANGED } from '../research/research.js';
 import { HIDEOUT_CHANGED, NOTHING_AT_STOP, rocket, rocketControls } from './rocket.js';
-import { LINEUPS_CHANGED, NOT_A_ROCKET_STOP, ROCKET_FROM_A_REGION } from './rocket-input.js';
+import {
+  LINEUPS_CHANGED,
+  NOT_A_ROCKET_STOP,
+  readWho,
+  ROCKET_FROM_A_REGION,
+} from './rocket-input.js';
+import { ListChanged } from '../../discord/errors.js';
 
 const ASH = '200000000000000061';
 const MISTY = '200000000000000062';
@@ -409,6 +415,14 @@ describe('/rocket report of one lineup of a grunt type (plan 8R-4L)', () => {
     });
     expect(await refused(MAGIKARPS)).toBe(LINEUPS_CHANGED);
     expect(made.store.rows.size).toBe(0);
+    // Known by its kind, not its words (review F8): the map asks for its lists again.
+    for (const who of [
+      MAGIKARPS,
+      'grunt:water:male',
+      `grunt:shadow:male#${magikarps.fingerprint}`,
+    ]) {
+      expect(() => readWho(made.ctx, who), who).toThrow(ListChanged);
+    }
   });
 
   it('suggests each type once for words that find it by its catches (B5)', async () => {
diff --git a/src/discord/errors.ts b/src/discord/errors.ts
index 085d37b2444dbeca6b72e99df39f3a36c6c49233..c236b5720e06216a3a448419aa3b0c1dffb60059 100644
--- a/src/discord/errors.ts
+++ b/src/discord/errors.ts
@@ -27,3 +27,12 @@ export class UserError extends Error {
     this.said = options.said ?? false;
   }
 }
+
+/**
+ * A choice of a list that changed under it (the task list's `TASK_LIST_CHANGED`, the lineups'
+ * `LINEUPS_CHANGED`): known by its kind, not its words, by the map's routes (plan 8M-9B, review
+ * F8: `reason: 'list-changed'`, the page asking for its lists again).
+ */
+export class ListChanged extends UserError {
+  override name = 'ListChanged';
+}
diff --git a/src/domain/research/task.ts b/src/domain/research/task.ts
index f9281f606adaeaa381751e48eda2c755e5e0080b..5edaedfc31655281291e2a5879d7c359d6e6643d 100644
--- a/src/domain/research/task.ts
+++ b/src/domain/research/task.ts
@@ -179,3 +179,13 @@ export function rewardsInShort(rewards: readonly TaskReward[], most = 3): string
   const shown = names.slice(0, most).join(', ');
   return names.length > most ? `${shown} +${String(names.length - most)}` : shown;
 }
+
+/**
+ * What a task may give, in short, as text (the post's reward line before it is made plain, the
+ * map's report, plan 8M-9B): `one of Dratini, Bagon, Axew +4`, `Rare Candy ×3`; empty for none.
+ */
+export function rewardLine(rewards: readonly TaskReward[]): string {
+  if (rewards.length === 0) return '';
+  const short = rewardsInShort(rewards);
+  return rewards.length === 1 ? short : `one of ${short}`;
+}
diff --git a/src/domain/stops/back-at.test.ts b/src/domain/stops/back-at.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7bada4e4431564b72d3723d658f9dcbe74b15556
--- /dev/null
+++ b/src/domain/stops/back-at.test.ts
@@ -0,0 +1,11 @@
+import { describe, expect, it } from 'vitest';
+import { backAtWords } from './back-at.js';
+
+describe('the words of the day’s research waiting under an event’s window (plan 8M-9B, B5)', () => {
+  it('says when it comes back, and after which event where one is named', () => {
+    expect(backAtWords('2:00 PM')).toBe('Back at 2:00 PM');
+    expect(backAtWords('<t:1:t>', 'Pawniard Community Day')).toBe(
+      'Back at <t:1:t>, after Pawniard Community Day',
+    );
+  });
+});
diff --git a/src/domain/stops/back-at.ts b/src/domain/stops/back-at.ts
new file mode 100644
index 0000000000000000000000000000000000000000..be896cd300ea9430cb07b2278b5db274d15daf2c
--- /dev/null
+++ b/src/domain/stops/back-at.ts
@@ -0,0 +1,14 @@
+/*
+ * Imports nothing: the map's page takes it (plan 8M-9B, B5), so that the post of the stops and the
+ * map say the day's research waiting under an event's window in the same words.
+ */
+
+/**
+ * When the day's research comes back after an intra-day event's window (plan 8R-6): `Back at
+ * <time>`, and `, after <event>` where the event is named. The time and the event's name are the
+ * caller's, written as its medium writes them (the post a Discord timestamp and `plain`, the map
+ * its clock's words, as text).
+ */
+export function backAtWords(time: string, event?: string): string {
+  return `Back at ${time}${event === undefined ? '' : `, after ${event}`}`;
+}
diff --git a/src/domain/stops/pictures.test.ts b/src/domain/stops/pictures.test.ts
index 498a8729c73f222602b30b6a98613c99b47ffad3..2290cc5c6decb5c3dc0cb87ab303add9e49f15e7 100644
--- a/src/domain/stops/pictures.test.ts
+++ b/src/domain/stops/pictures.test.ts
@@ -5,8 +5,10 @@ import { GIOVANNI_PORTRAIT, LEADER_PORTRAITS } from '../rocket/portraits.js';
 import {
   ENCOUNTER_PICTURE,
   isPictureSource,
+  lineupPictureSources,
   researchPicture,
   rocketPicture,
+  taskPictureSources,
   type StopPicture,
 } from './pictures.js';
 
@@ -203,3 +205,33 @@ describe('where a picture may be fetched from', () => {
     ).toBe(false);
   });
 });
+
+describe('the pictures made square when a list is read (plan 8M-9B)', () => {
+  it('names every reward of the task list with a picture, and the encounter picture of "one of"', () => {
+    const tasks = [
+      { key: 'a', text: 'Catch a Dragon', category: 'Catching', rewards: [GIBLE, LARVITAR] },
+      { key: 'b', text: 'Spin', category: 'Other', rewards: [RARE_CANDY, UNPICTURED, GIBLE] },
+    ];
+    expect([...taskPictureSources(tasks)].sort()).toEqual(
+      [ENCOUNTER_PICTURE, GIBLE.image!, LARVITAR.image!, RARE_CANDY.image!].sort(),
+    );
+  });
+
+  it('names every catch of the lineups, both lineups of a type, the portraits and the encounter picture', () => {
+    const choices = [
+      // A type of two lineups: its own catches are both lineups'.
+      { catches: [MAGIKARP], lineups: [{ catches: [MAGIKARP] }, { catches: [FEEBAS] }] },
+      { catches: [CUBONE] },
+    ];
+    expect([...lineupPictureSources(choices)].sort()).toEqual(
+      [
+        ENCOUNTER_PICTURE,
+        MAGIKARP.image!,
+        FEEBAS.image!,
+        CUBONE.image!,
+        GIOVANNI_PORTRAIT,
+        ...Object.values(LEADER_PORTRAITS),
+      ].sort(),
+    );
+  });
+});
diff --git a/src/domain/stops/pictures.ts b/src/domain/stops/pictures.ts
index aa74d4189359f03b1cae36d75554906e587e0fe5..ec3d3ecb5ac4e1be77dad8f983e099f86d43971f 100644
--- a/src/domain/stops/pictures.ts
+++ b/src/domain/stops/pictures.ts
@@ -102,3 +102,44 @@ export function rocketPicture(
     ? pictured(only.image, 'pokemon')
     : { source: ENCOUNTER_PICTURE, kind: 'pokemon' };
 }
+
+/** The pictures of these, each with one. */
+function sourcesOf(items: Iterable<{ image: string | null }>): string[] {
+  return [...items].flatMap((item) => (item.image === null ? [] : [item.image]));
+}
+
+/**
+ * Every picture the task list's reports and pick lists can show (plan 8M-9B): each reward's, and
+ * the encounter picture of "one of". `StopPictures.prepare` makes them square when the list is
+ * read, so the map's views name the square ones (B1: never per request).
+ */
+export function taskPictureSources(tasks: Iterable<{ rewards: readonly TaskReward[] }>): string[] {
+  return [
+    ...new Set([ENCOUNTER_PICTURE, ...[...tasks].flatMap((task) => sourcesOf(task.rewards))]),
+  ];
+}
+
+/**
+ * Every picture the lineups' reports and pick lists can show (plan 8M-9B): each catch's (a type's
+ * two lineups too), the leaders' and Giovanni's portraits, and the encounter picture of a grunt
+ * whose catch is open; made square when the lineups are read.
+ */
+export function lineupPictureSources(
+  choices: Iterable<{
+    catches: readonly Pick<RocketCatch, 'image'>[];
+    lineups?: readonly { catches: readonly Pick<RocketCatch, 'image'>[] }[];
+  }>,
+): string[] {
+  const catches = [...choices].flatMap((choice) => [
+    ...sourcesOf(choice.catches),
+    ...(choice.lineups ?? []).flatMap((lineup) => sourcesOf(lineup.catches)),
+  ]);
+  return [
+    ...new Set([
+      ENCOUNTER_PICTURE,
+      ...catches,
+      GIOVANNI_PORTRAIT,
+      ...Object.values(LEADER_PORTRAITS),
+    ]),
+  ];
+}
diff --git a/src/domain/web/stop-report-data.ts b/src/domain/web/stop-report-data.ts
index 9b29df7eb6dd2e021b175e4227a79479c3c1c5e1..0410dfa487fcecd54f03e5d52411bf7f0f0827ac 100644
--- a/src/domain/web/stop-report-data.ts
+++ b/src/domain/web/stop-report-data.ts
@@ -79,6 +79,17 @@ export interface MapResearch extends MapStopReportBase {
   typed: boolean;
   oneOf: boolean;
   rewards: MapReward[];
+  /**
+   * The rewards in short as the post's reward line says them (plan 8M-9B, `rewardLine`): `Rare
+   * Candy ×3`, `one of Dratini, Bagon, Axew +4`; empty for a typed task without its reward.
+   */
+  rewardText: string;
+  /**
+   * The picture of its reward line in the post of the stops (plan 8M-9B, B2: the one reward's, the
+   * encounter picture for "one of"; none for a typed task without its reward), as the post names
+   * it, only where the page may load it.
+   */
+  picture?: string;
 }
 
 /**
@@ -88,9 +99,19 @@ export interface MapResearch extends MapStopReportBase {
  */
 export interface MapGrunt extends MapStopReportBase {
   who: string;
+  /**
+   * Its grunt type's key (plan 8M-9B, `typeKeyOf`: a lineup's `grunt:water:male` is
+   * `grunt:water`), which a filter by grunt type matches.
+   */
+  typeKey: string;
   name: string;
   catches: MapReward[];
   lineup?: string;
+  /**
+   * Its picture as its message shows it (plan 8M-9B, B2: the one catch's, else the encounter
+   * picture), only where the page may load it: the popup shows it, the marker the Rocket icon.
+   */
+  picture?: string;
 }
 
 /**
@@ -131,6 +152,11 @@ export interface ResearchVersionOption {
   value: string;
   label: string;
   oneOf: boolean;
+  /**
+   * The rewards it stands for (plan 8M-9B, review F2: `TaskVersion.rewards`, a reward listed twice
+   * once; "one of" its encounters), their pictures as the task's rewards name them.
+   */
+  rewards: MapReward[];
 }
 
 /**
@@ -221,6 +247,13 @@ export interface StopReportAnswer {
   hideout?: MapHideout;
   /** Rocket's: `replacing`; research's: `reports`, and `hidden` where any is not shown. */
   asks?: { replacing?: number; reports?: MapResearch[]; hidden?: HiddenReport[] };
+  /**
+   * The machine part of a refusal a page acts on (plan 8M-9B, B4; the words are only shown):
+   * `ended`, the report `sameAs` named is gone (`REPORT_ENDED`: send a listed one's `task` with
+   * `more`); `list-changed`, the task list or the lineups changed under the choice
+   * (`TASK_LIST_CHANGED`, `LINEUPS_CHANGED`: ask for the pick lists again).
+   */
+  reason?: 'ended' | 'list-changed';
 }
 
 /** A contested report the map does not show the member (review R5): its id and its stop's name. */
diff --git a/src/domain/web/stop-report-view.test.ts b/src/domain/web/stop-report-view.test.ts
index f0067c38d6c04e150cda7158a56e67290e5e3d71..8751ef3361e0f62389437eac83e2fc70f3774cb1 100644
--- a/src/domain/web/stop-report-view.test.ts
+++ b/src/domain/web/stop-report-view.test.ts
@@ -115,6 +115,7 @@ describe('stopReportView', () => {
       typed: true,
       // A task's key alone with two rewards or more reads as "one of" (plan 8R-5, R10).
       oneOf: true,
+      rewardText: 'one of Rare Candy, Venusaur Mega Energy ×20',
       rewards: [
         { kind: 'item', name: 'Rare Candy', value: 'item:rare-candy', quantity: 0, shiny: false },
         // A picture from no host the page may load is left out.
@@ -196,6 +197,85 @@ describe('stopReportView', () => {
     expect(view.hideouts[1]).not.toHaveProperty('picture');
   });
 
+  it('names rewards’, catches’ and reports’ pictures as the post does: the square ones Pine serves (plan 8M-9B)', () => {
+    const pine = 'https://map.example.test';
+    const square = (source: string) => `${pine}/pictures/${source.slice(-12)}`;
+    const oneOf = {
+      ...researchReport({
+        stop: reportedStop(7),
+        subjectKey: 'dragon',
+        research: {
+          text: 'Catch a Dragon-type Pokémon',
+          category: 'Catching',
+          rewards: [
+            DRATINI,
+            {
+              kind: 'encounter',
+              name: 'Bagon',
+              key: 'bagon',
+              dex: 371,
+              shiny: false,
+              cp: null,
+              image: null,
+            },
+          ],
+          typed: false,
+        },
+      }),
+      id: 7,
+    };
+    const typed = {
+      ...researchReport({
+        stop: reportedStop(8),
+        subjectKey: 'typed:0000000000000002',
+        research: { text: 'Spin 3 stops', category: null, rewards: [], typed: true },
+      }),
+      id: 8,
+    };
+    const twoCatches = {
+      ...rocketReport({
+        stop: reportedStop(9),
+        rocket: { name: 'Water-type grunt', catches: [MUDKIP, MAGIKARP] },
+      }),
+      id: 9,
+    };
+    const view = stopReportView(
+      input({
+        reports: [
+          { ...researchReport(), id: 1 },
+          oneOf,
+          typed,
+          { ...rocketReport(), id: 4 },
+          twoCatches,
+        ],
+        period: { key: 'day:2026-10-21' },
+        pictureOrigins: [CDN, pine],
+        // Mudkip's picture is gone (it answered 404): none.
+        picture: (source) => (source === MUDKIP.image ? undefined : square(source)),
+      }),
+    );
+    const [one, dragon, spin] = view.research;
+    expect(one?.rewards[0]?.image).toBe(square(DRATINI.image!));
+    // A reward line's picture by the post's rule: the one reward's; "one of" the encounter picture.
+    expect(one?.picture).toBe(square(DRATINI.image!));
+    expect(dragon?.picture).toBe(square(ENCOUNTER_PICTURE));
+    expect(dragon?.rewards.map((reward) => reward.image)).toEqual([
+      square(DRATINI.image!),
+      undefined,
+    ]);
+    // A typed task without its reward has none.
+    expect(spin).not.toHaveProperty('picture');
+    // A grunt's: its one catch's (gone here: none), else the encounter picture.
+    const [water, two] = view.grunts;
+    expect(water).not.toHaveProperty('picture');
+    expect(water?.catches[0]).not.toHaveProperty('image');
+    expect(two?.picture).toBe(square(ENCOUNTER_PICTURE));
+    expect(two?.catches.map((caught) => caught.image)).toEqual([
+      undefined,
+      square(MAGIKARP.image!),
+    ]);
+  });
+
   it('names a grunt of one lineup by its first slot, the gender never (plan 8R-4L)', () => {
     const view = stopReportView(
       input({ reports: [{ ...magikarpLineup({ stop: reportedStop(4) }), id: 7 }] }),
@@ -212,6 +292,25 @@ describe('stopReportView', () => {
     expect(stopReportView(input()).grunts[0]).not.toHaveProperty('lineup');
   });
 
+  it('gives what the page shows and filters by, as the server words and reads them (plan 8M-9B)', () => {
+    const view = stopReportView(
+      input({
+        reports: [
+          { ...magikarpLineup({ stop: reportedStop(4) }), id: 7 },
+          { ...rocketReport({ stop: reportedStop(5) }), id: 8 },
+        ],
+      }),
+    );
+    // A grunt's type, which a filter by grunt type matches (the lineup's too).
+    expect(view.grunts.map((grunt) => grunt.typeKey)).toEqual(['grunt:water', 'grunt:water']);
+    // The rewards in short, as a reward line of the post says them.
+    const day = stopReportView(input({ period: { key: 'day:2026-10-21' } }));
+    expect(day.research.map((one) => one.rewardText)).toEqual(['Dratini', 'Dratini']);
+    expect(view.research).toEqual([]);
+    const typed = stopReportView(input()).research[0];
+    expect(typed?.rewardText).toBe('one of Rare Candy, Venusaur Mega Energy ×20');
+  });
+
   it('gives an encounter its catalogue key, and the day’s research when no window is on', () => {
     const view = stopReportView(input({ period: { key: 'day:2026-10-21' } }));
     expect(view.event).toBeNull();
diff --git a/src/domain/web/stop-report-view.ts b/src/domain/web/stop-report-view.ts
index 903366861afca93484eeaa35689403c13ad21547..e0189b53f70bee0dc1fb7fd86576aebc02f82139 100644
--- a/src/domain/web/stop-report-view.ts
+++ b/src/domain/web/stop-report-view.ts
@@ -1,6 +1,6 @@
 import { isOneOf } from '../research/reports.js';
-import type { TaskReward } from '../research/task.js';
-import { isHideout, parseRocketKey, type RocketCatch } from '../rocket/lineups.js';
+import { rewardLine, type TaskReward } from '../research/task.js';
+import { isHideout, parseRocketKey, typeKeyOf, type RocketCatch } from '../rocket/lineups.js';
 import {
   isResearchReport,
   isRocketReport,
@@ -9,7 +9,7 @@ import {
   type StopReport,
 } from '../stops/report.js';
 import type { ResearchPeriod } from '../time/research-periods.js';
-import { AS_FED, rocketPicture, type PictureLookup } from '../stops/pictures.js';
+import { AS_FED, researchPicture, rocketPicture, type PictureLookup } from '../stops/pictures.js';
 import { allowedPicture } from './picture.js';
 import type {
   MapGrunt,
@@ -51,15 +51,38 @@ export interface StopReportViewInput {
 /** A coordinate to six decimals (about 10 cm), as the map's places are. */
 const sixDecimals = (value: number): number => Math.round(value * 1e6) / 1e6;
 
+/**
+ * A picture's address as the post of the stops names it (`picture`: the square one Pine serves, none
+ * where its source is gone; the source itself without a lookup), only where the page may load it.
+ */
+function shownPicture(
+  source: string | null | undefined,
+  origins: readonly string[],
+  picture: PictureLookup = AS_FED,
+): string | undefined {
+  return allowedPicture(source == null ? undefined : picture(source), origins);
+}
+
 /** A picture the page may load, as an optional field. */
-function pictured(image: string | null, origins: readonly string[]): { image?: string } {
-  const allowed = allowedPicture(image ?? undefined, origins);
+function pictured(
+  image: string | null,
+  origins: readonly string[],
+  picture?: PictureLookup,
+): { image?: string } {
+  const allowed = shownPicture(image, origins, picture);
   return allowed === undefined ? {} : { image: allowed };
 }
 
-/** A reward of a task as the map shows it, with the value a filter matches (`MapReward`). */
-export function mapReward(reward: TaskReward, origins: readonly string[]): MapReward {
-  const picture = pictured(reward.image, origins);
+/**
+ * A reward of a task as the map shows it, with the value a filter matches (`MapReward`); its
+ * picture named as the post names it (plan 8M-9B: `StopPictures.url`, the square one).
+ */
+export function mapReward(
+  reward: TaskReward,
+  origins: readonly string[],
+  lookup?: PictureLookup,
+): MapReward {
+  const picture = pictured(reward.image, origins, lookup);
   switch (reward.kind) {
     case 'encounter':
       return {
@@ -91,15 +114,19 @@ export function mapReward(reward: TaskReward, origins: readonly string[]): MapRe
   }
 }
 
-/** A Pokémon a Rocket report can give, as the map shows a reward. */
-export function mapCatch(caught: RocketCatch, origins: readonly string[]): MapReward {
+/** A Pokémon a Rocket report can give, as the map shows a reward (its picture as `mapReward`'s). */
+export function mapCatch(
+  caught: RocketCatch,
+  origins: readonly string[],
+  lookup?: PictureLookup,
+): MapReward {
   return {
     kind: 'encounter',
     name: caught.name,
     value: caught.key === null ? null : `pokemon:${caught.key}`,
     quantity: 0,
     shiny: caught.shiny,
-    ...pictured(caught.image, origins),
+    ...pictured(caught.image, origins, lookup),
   };
 }
 
@@ -123,6 +150,20 @@ function base(report: StopReport, input: StopReportViewInput) {
   };
 }
 
+/** A report's own picture as an optional field (`picture`), only where the page may load it. */
+function reportPicture(
+  source: string | undefined,
+  input: StopReportViewInput,
+): { picture?: string } {
+  const picture = shownPicture(source, input.pictureOrigins, input.picture);
+  return picture === undefined ? {} : { picture };
+}
+
+/**
+ * Research as the map shows it; its picture the reward line's in the post (plan 8M-9B, B2:
+ * `researchPicture`, the one reward's, "one of" the encounter picture; none for a typed task
+ * without its reward).
+ */
 function mapResearch(report: ResearchReport, input: StopReportViewInput): MapResearch {
   const { research } = report;
   return {
@@ -132,17 +173,29 @@ function mapResearch(report: ResearchReport, input: StopReportViewInput): MapRes
     category: research.category,
     typed: research.typed,
     oneOf: isOneOf(report),
-    rewards: research.rewards.map((reward) => mapReward(reward, input.pictureOrigins)),
+    rewardText: rewardLine(research.rewards),
+    rewards: research.rewards.map((reward) =>
+      mapReward(reward, input.pictureOrigins, input.picture),
+    ),
+    ...reportPicture(researchPicture(research.rewards)?.source, input),
   };
 }
 
+/**
+ * A grunt as the map shows it; its picture as its message's (plan 8M-9B, B2: `rocketPicture`, the
+ * one catch's, else the encounter picture), which the popup shows (its marker the Rocket icon).
+ */
 function mapGrunt(report: RocketReport, input: StopReportViewInput): MapGrunt {
   return {
     ...base(report, input),
     who: report.subjectKey,
+    typeKey: typeKeyOf(report.subjectKey),
     name: report.rocket.name,
-    catches: report.rocket.catches.map((caught) => mapCatch(caught, input.pictureOrigins)),
+    catches: report.rocket.catches.map((caught) =>
+      mapCatch(caught, input.pictureOrigins, input.picture),
+    ),
     ...(report.rocket.lineup === undefined ? {} : { lineup: report.rocket.lineup }),
+    ...reportPicture(rocketPicture(report.subjectKey, report.rocket.catches)?.source, input),
   };
 }
 
@@ -152,18 +205,14 @@ function mapGrunt(report: RocketReport, input: StopReportViewInput): MapGrunt {
  * names it (`picture`: none where it is gone), only from a host the page may load.
  */
 function mapHideout(report: RocketReport, input: StopReportViewInput): MapHideout {
-  const catches = report.rocket.catches.map((caught) => mapCatch(caught, input.pictureOrigins));
-  const source = rocketPicture(report.subjectKey, report.rocket.catches)?.source;
-  const picture = allowedPicture(
-    source === undefined ? undefined : (input.picture ?? AS_FED)(source),
-    input.pictureOrigins,
-  );
   return {
     ...base(report, input),
     who: report.subjectKey,
     name: report.rocket.name,
-    catches,
-    ...(picture === undefined ? {} : { picture }),
+    catches: report.rocket.catches.map((caught) =>
+      mapCatch(caught, input.pictureOrigins, input.picture),
+    ),
+    ...reportPicture(rocketPicture(report.subjectKey, report.rocket.catches)?.source, input),
   };
 }
 
diff --git a/src/render/research.ts b/src/render/research.ts
index fb051b7255ff963c29a5e739d042ec5cd0ab2c47..654f63afbca74efc7d8f6da8e4e586204abdc26e 100644
--- a/src/render/research.ts
+++ b/src/render/research.ts
@@ -11,7 +11,7 @@ import { encodeCustomId, encodeCustomIdIfFits } from '../discord/custom-id.js';
 import type { V2Message } from '../discord/party-gateway.js';
 import { taskOfSubject } from '../domain/research/reports.js';
 import { AS_FED, researchPicture, type PictureLookup } from '../domain/stops/pictures.js';
-import { rewardsInShort, type TaskReward } from '../domain/research/task.js';
+import { rewardLine, rewardsInShort, type TaskReward } from '../domain/research/task.js';
 import type {
   ReportedStop,
   ResearchDetail,
@@ -59,11 +59,12 @@ export function reportSubject(report: StopReport): string {
   return report.kind === 'research' ? taskText(report.research) : plain(report.rocket.name);
 }
 
-/** What a task may give, in short: `one of Dratini, Bagon, Axew +4`, `Rare Candy ×3`. */
+/**
+ * What a task may give, in short: `one of Dratini, Bagon, Axew +4`, `Rare Candy ×3`; the map's
+ * line (`rewardLine`, plan 8M-9B) made plain.
+ */
 export function rewardWords(rewards: readonly TaskReward[]): string {
-  if (rewards.length === 0) return '';
-  const short = plain(rewardsInShort(rewards));
-  return rewards.length === 1 ? short : `one of ${short}`;
+  return plain(rewardLine(rewards));
 }
 
 /** A stop as a line names it: `**Yellow Mural** · Market Street`. */
diff --git a/src/render/stop-post.ts b/src/render/stop-post.ts
index 8fcc87e743a8390b80399d92901d79beea2537a8..e56e2dde39b787b97d8b9eda28f43deb3d4eed65 100644
--- a/src/render/stop-post.ts
+++ b/src/render/stop-post.ts
@@ -9,6 +9,7 @@ import {
   type PictureLookup,
   type StopPicture,
 } from '../domain/stops/pictures.js';
+import { backAtWords } from '../domain/stops/back-at.js';
 import type { Reporter, ReportedStop, ResearchDetail } from '../domain/stops/report.js';
 import { cutText, TEXT_BUDGET } from './party-post.js';
 import { RESEARCH_COLOUR, rewardWords, stopMapLine, taskText } from './research.js';
@@ -236,7 +237,7 @@ const ROCKET_HEADING = '### Team GO Rocket hideouts';
 
 /** The heading of the day's research under an event's window (plan 8R-6). */
 function backHeading(at: number, event: string | undefined): string {
-  return `### Back at ${timestamp(at, 't')}${event === undefined ? '' : `, after ${plain(event)}`}`;
+  return `### ${backAtWords(timestamp(at, 't'), event === undefined ? undefined : plain(event))}`;
 }
 
 /**
diff --git a/src/services/research-task-service.test.ts b/src/services/research-task-service.test.ts
index 21858a3017a3d957a7d4b41de02aaf76b0189fc1..f4a65eba7d932a0a3c9c2421eee13911a494f1c9 100644
--- a/src/services/research-task-service.test.ts
+++ b/src/services/research-task-service.test.ts
@@ -5,6 +5,7 @@ import { listedTask } from '../../test/support/research-store-cases.js';
 import { MemoryResearchTasks } from '../../test/support/research-store.js';
 import { jsonResponse } from '../../test/support/responses.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
+import { taskPictureSources } from '../domain/stops/pictures.js';
 import {
   MAX_RESEARCH_PAGE_BYTES,
   PINE_USER_AGENT,
@@ -21,7 +22,14 @@ function serviceWith(answer: () => ReturnType<FetchPage>, store = new MemoryRese
   const { log, entries } = createTestLogger();
   const clock = { now: NOW };
   const asked: { url: string; headers: Record<string, string> }[] = [];
+  const prepared: string[][] = [];
   const service = new ResearchTaskService({
+    pictures: {
+      prepare: (sources) => {
+        prepared.push([...sources]);
+        return Promise.resolve();
+      },
+    },
     url: URL,
     refreshMs: HOUR,
     staleAfterMs: 6 * HOUR,
@@ -35,7 +43,7 @@ function serviceWith(answer: () => ReturnType<FetchPage>, store = new MemoryRese
     now: () => clock.now,
   });
   const said = (msg: string) => entries.filter((entry) => entry.msg === msg).length;
-  return { service, store, clock, asked, said };
+  return { service, store, clock, asked, said, prepared };
 }
 
 const page = (html = readResearchPage(), options: { status?: number } = {}) =>
@@ -169,6 +177,18 @@ describe('ResearchTaskService', () => {
     expect(service.readAt()).toBe(NOW - HOUR / 2);
   });
 
+  it('has the pictures of the list it takes made square, without waiting for them (plan 8M-9B)', async () => {
+    const store = new MemoryResearchTasks();
+    await store.replace([listedTask('Make 2 Excellent Throws')], NOW - HOUR / 2);
+    const { service, prepared } = serviceWith(() => page(), store);
+    await service.load();
+    expect(prepared).toEqual([taskPictureSources(service.tasks())]);
+    await service.refresh();
+    expect(prepared).toHaveLength(2);
+    expect(prepared[1]).toEqual(taskPictureSources(service.tasks()));
+    expect(prepared[1]?.length).toBeGreaterThan(20);
+  });
+
   it('keeps its list when the page lists fewer than half the tasks, and says so', async () => {
     const store = new MemoryResearchTasks();
     const { service, said } = serviceWith(() => page(), store);
diff --git a/src/services/research-task-service.ts b/src/services/research-task-service.ts
index 8f2384630932eec75772f15816a109f10b84a225..0784f5d9681109c02a55fa02dc1eeba5ebe3f5fa 100644
--- a/src/services/research-task-service.ts
+++ b/src/services/research-task-service.ts
@@ -2,6 +2,7 @@ import type { ResearchTaskStorage } from '../db/repositories/research-task-repos
 import { parseResearchPage } from '../domain/research/leekduck.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
 import { eventTasksFirst, isEventCategory, type ResearchTask } from '../domain/research/task.js';
+import { taskPictureSources } from '../domain/stops/pictures.js';
 import {
   versionIndex,
   type FoundVersion,
@@ -45,6 +46,17 @@ export interface ResearchTaskOptions {
   /** How long to wait after a failed attempt. Default 15 minutes, at most `refreshMs`. */
   retryMs?: number;
   now?: () => number;
+  /**
+   * The square pictures of the stops (plan 8M-9B, `StopPictures.prepare`): every reward's picture
+   * of a list taken is made, not waited for, so that the map's views name the square ones.
+   */
+  pictures?: PictureMaking;
+}
+
+/** What a list's reader asks of `StopPictures`: its pictures made, never waited for. */
+export interface PictureMaking {
+  /** Never rejects. */
+  prepare(sources: Iterable<string>): Promise<void>;
 }
 
 /** What handlers need: the task list of now. */
@@ -178,6 +190,8 @@ export class ResearchTaskService implements ResearchTaskProvider {
     this.current = tasks;
     this.keyed = new Map(tasks.map((task) => [task.key, task]));
     this.read = readAt;
+    // Its pictures made square in the background (plan 8M-9B, B1); `prepare` never rejects.
+    void this.options.pictures?.prepare(taskPictureSources(tasks));
   }
 
   /** Reads the page now. Never rejects; calls made while one runs share its result. */
diff --git a/src/services/rocket-lineup-service.test.ts b/src/services/rocket-lineup-service.test.ts
index b48453fa593e61c1c6f2f515c7bcd8b77686b696..7b55fb3e4f9f02c76ae15b2c90f2e4565b198982 100644
--- a/src/services/rocket-lineup-service.test.ts
+++ b/src/services/rocket-lineup-service.test.ts
@@ -5,6 +5,7 @@ import { listedChoice } from '../../test/support/rocket-store-cases.js';
 import { MemoryRocketLineups } from '../../test/support/rocket-store.js';
 import { jsonResponse } from '../../test/support/responses.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
+import { lineupPictureSources } from '../domain/stops/pictures.js';
 import { PINE_USER_AGENT, type FetchPage } from './research-task-service.js';
 import { MAX_ROCKET_FEED_BYTES, RocketLineupService } from './rocket-lineup-service.js';
 
@@ -17,7 +18,14 @@ function serviceWith(answer: () => ReturnType<FetchPage>, store = new MemoryRock
   const { log, entries } = createTestLogger();
   const clock = { now: NOW };
   const asked: { url: string; headers: Record<string, string> }[] = [];
+  const prepared: string[][] = [];
   const service = new RocketLineupService({
+    pictures: {
+      prepare: (sources) => {
+        prepared.push([...sources]);
+        return Promise.resolve();
+      },
+    },
     url: URL,
     refreshMs: 6 * HOUR,
     staleAfterMs: 24 * HOUR,
@@ -31,7 +39,7 @@ function serviceWith(answer: () => ReturnType<FetchPage>, store = new MemoryRock
     now: () => clock.now,
   });
   const said = (msg: string) => entries.filter((entry) => entry.msg === msg).length;
-  return { service, store, clock, asked, said };
+  return { service, store, clock, asked, said, prepared };
 }
 
 const feed = (body: unknown = readRocketFeed(), options: { status?: number; raw?: string } = {}) =>
@@ -87,6 +95,18 @@ describe('RocketLineupService', () => {
     expect(service.readAt()).toBe(NOW - HOUR);
   });
 
+  it('has the pictures of the lineups it takes made square, without waiting for them (plan 8M-9B)', async () => {
+    const store = new MemoryRocketLineups();
+    await store.replace([listedChoice('leader:arlo')], NOW - HOUR);
+    const { service, prepared } = serviceWith(() => feed(), store);
+    await service.load();
+    expect(prepared).toEqual([lineupPictureSources(service.choices())]);
+    await service.refresh();
+    expect(prepared).toHaveLength(2);
+    expect(prepared[1]).toEqual(lineupPictureSources(service.choices()));
+    expect(prepared[1]?.length).toBeGreaterThan(20);
+  });
+
   it('keeps its list when the feed lists fewer than half the choices, and says so', async () => {
     let body: unknown = readRocketFeed();
     const { service, clock, said } = serviceWith(() => feed(body));
diff --git a/src/services/rocket-lineup-service.ts b/src/services/rocket-lineup-service.ts
index 7ce05f7c7a3c6bea075866d6d3a952e8a24b1336..217fe6f4325ce41676179368bd7bf7f8b48de029 100644
--- a/src/services/rocket-lineup-service.ts
+++ b/src/services/rocket-lineup-service.ts
@@ -1,11 +1,12 @@
 import type { RocketLineupStorage } from '../db/repositories/rocket-lineup-repository.js';
 import { parseRocketLineups, type RocketChoice } from '../domain/rocket/lineups.js';
+import { lineupPictureSources } from '../domain/stops/pictures.js';
 import type { Logger } from '../log.js';
 import type { CatchUpOutcome } from './catch-up.js';
 import { failureReason } from './failure-reason.js';
 import type { GameDataProvider } from './game-data-service.js';
 import { readLimitedJson } from './limited-json.js';
-import { PINE_USER_AGENT, type FetchPage } from './research-task-service.js';
+import { PINE_USER_AGENT, type FetchPage, type PictureMaking } from './research-task-service.js';
 
 /** The feed was 38 KB on 2026-10-22; anything much larger is not the feed. */
 export const MAX_ROCKET_FEED_BYTES = 1024 * 1024;
@@ -29,6 +30,11 @@ export interface RocketLineupOptions {
   /** How long to wait after a failed attempt. Default 15 minutes, at most `refreshMs`. */
   retryMs?: number;
   now?: () => number;
+  /**
+   * The square pictures of the stops (plan 8M-9B, `StopPictures.prepare`): every catch's picture
+   * of a list taken, the portraits and the encounter picture are made, not waited for.
+   */
+  pictures?: PictureMaking;
 }
 
 /** What handlers need: `/rocket`'s choices of now. */
@@ -116,6 +122,8 @@ export class RocketLineupService implements RocketLineupProvider {
     this.current = choices;
     this.keyed = new Map(choices.map((choice) => [choice.key, choice]));
     this.read = readAt;
+    // Its pictures made square in the background (plan 8M-9B, B1); `prepare` never rejects.
+    void this.options.pictures?.prepare(lineupPictureSources(choices));
   }
 
   /** Reads the feed now. Never rejects; calls made while one runs share its result. */
diff --git a/src/web/stop-options.test.ts b/src/web/stop-options.test.ts
index b11faccddffc6a14773bf26950bdd2a2407d847f..e738351831c3fca5106bad483626796570dbbd06 100644
--- a/src/web/stop-options.test.ts
+++ b/src/web/stop-options.test.ts
@@ -17,12 +17,19 @@ import type { StopsView } from '../domain/web/meetup-data.js';
 import type { ResearchOptionsView, RocketOptionsView } from '../domain/web/stop-report-data.js';
 import { GIOVANNI_ONLY_WHEN_SURE } from '../commands/rocket/rocket-input.js';
 import { lineupValue } from '../domain/rocket/lineups.js';
+import { catalogueFixture } from '../../test/support/game-data.js';
+import type { ResearchTask, TaskReward } from '../domain/research/task.js';
+import { taskVersions } from '../domain/research/versions.js';
+import { researchOptions } from './stop-options.js';
 
 const RESEARCH = `/s/${FAKE_GUILD_ID}/api/research-options`;
 const ROCKET = `/s/${FAKE_GUILD_ID}/api/rocket-options`;
 const HOUR = 3_600_000;
 
-async function setup(settings: { memberRole?: string } = {}) {
+async function setup(
+  settings: { memberRole?: string } = {},
+  pictures?: { url(source: string): string | undefined },
+) {
   const made = await stopReportingWith();
   const members = new FakeMemberDirectory().add(ALICE, 'Alice');
   const web = webServerWith({
@@ -31,6 +38,7 @@ async function setup(settings: { memberRole?: string } = {}) {
     meetups: meetupWebWith(made.ctx),
     stops: stopWebWith(made.ctx),
     web: settings,
+    ...(pictures === undefined ? {} : { pictures }),
   });
   web.clock.now = STOP_NOON;
   const cookie = await web.loggedIn(ALICE, 'Alice');
@@ -39,6 +47,57 @@ async function setup(settings: { memberRole?: string } = {}) {
   return { ...made, web, members, ask };
 }
 
+// Review F2 (one path): which rewards a version stands for is the server's (`taskVersions`), never
+// guessed by the page from the task's rewards.
+describe("a research task's versions in the pick list", () => {
+  const crop = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';
+  const encounter = (name: string, dex: number, shiny: boolean, picture: string): TaskReward => ({
+    kind: 'encounter',
+    name,
+    key: name.toLowerCase(),
+    dex,
+    shiny,
+    cp: null,
+    image: `${crop}${picture}`,
+  });
+
+  it('carries the rewards of each version, a shiny one listed twice once, their pictures squared', () => {
+    const catalogue = catalogueFixture();
+    const task: ResearchTask = {
+      key: '0123456789abcdef',
+      text: 'Catch a Dragon-type Pokémon',
+      category: 'Catching',
+      rewards: [
+        encounter('Dratini', 147, false, 'pm147.icon.png'),
+        encounter('Dratini', 147, true, 'pm147.s.icon.png'),
+        encounter('Bagon', 371, false, 'pm371.icon.png'),
+      ],
+    };
+    const square = (source: string) => `https://map.example.test/pictures/${source.slice(-14)}`;
+    const view = researchOptions({
+      tasks: [task],
+      versions: (one) => taskVersions(one, catalogue),
+      readAt: undefined,
+      stale: false,
+      listed: { items: new Map(), energies: new Map() },
+      origins: ['https://map.example.test'],
+      picture: square,
+    });
+    const versions = view.tasks[0]?.versions ?? [];
+    expect(
+      versions.map((version) => [version.label, version.rewards.map((one) => one.name)]),
+    ).toEqual([
+      ['Dratini', ['Dratini']],
+      ['Bagon', ['Bagon']],
+      ['one of Dratini, Bagon', ['Dratini', 'Bagon']],
+    ]);
+    expect(versions[1]?.rewards[0]).toMatchObject({
+      value: 'pokemon:bagon',
+      image: square(`${crop}pm371.icon.png`),
+    });
+  });
+});
+
 describe('the pick lists of reports at stops', () => {
   let web: TestWeb | undefined;
   beforeEach(() => {
@@ -76,12 +135,18 @@ describe('the pick lists of reports at stops', () => {
       value: expect.stringMatching(new RegExp(`^${dragon.key}:[0-9a-f]{8}$`)) as string,
       label: 'Dratini',
       oneOf: false,
+      rewards: [shown?.rewards[0]],
     });
-    expect(shown?.versions.at(-1)).toEqual({
+    expect(shown?.versions.at(-1)).toMatchObject({
       value: dragon.key,
       label: 'one of Dratini, Bagon, Axew',
       oneOf: true,
     });
+    expect(shown?.versions.at(-1)?.rewards.map((reward) => reward.name)).toEqual([
+      'Dratini',
+      'Bagon',
+      'Axew',
+    ]);
     expect(view.rewards).toContainEqual({ value: 'item:rare-candy', name: 'Rare Candy' });
     expect(view.rewards.some((reward) => reward.value.startsWith('energy:'))).toBe(true);
     expect(
@@ -176,6 +241,23 @@ describe('the pick lists of reports at stops', () => {
     ).toBe(304);
   });
 
+  it('names the rewards’ and catches’ pictures as the post does: the square ones Pine serves (plan 8M-9B)', async () => {
+    // The square pictures are served at the web server's own address (`publicUrl`), an origin
+    // the page may load.
+    const square = (source: string) =>
+      `https://map.example.test/pictures/${source.length.toString(16).padStart(32, '0')}.png`;
+    const made = await setup({}, { url: square });
+    web = made.web;
+    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture(undefined, STOP_NOON - HOUR) });
+    const research = (await made.ask(RESEARCH)).json<ResearchOptionsView>();
+    const dragon = research.tasks.find((task) => task.text === 'Catch a Dragon-type Pokémon');
+    expect(dragon?.rewards[0]?.image).toBe(square(pageTask(dragon?.text ?? '').rewards[0]!.image!));
+    const rocket = (await made.ask(ROCKET)).json<RocketOptionsView>();
+    const water = rocket.choices.find((choice) => choice.key === 'grunt:water');
+    expect(water?.catches[0]?.image).toBe(square(feedChoice('grunt:water').catches[0]!.image!));
+    expect(water?.lineups?.[1]?.catches[0]?.image).toMatch(/\/pictures\/[0-9a-f]{32}\.png$/);
+  });
+
   it('is for members only, and says so while Discord cannot', async () => {
     const made = await setup();
     web = made.web;
diff --git a/src/web/stop-options.ts b/src/web/stop-options.ts
index 5558b508147d9ad8da352fea7a557b6987d572dd..55c6b874463142642889fe322abb1406ff8db17d 100644
--- a/src/web/stop-options.ts
+++ b/src/web/stop-options.ts
@@ -5,8 +5,10 @@ import {
   lineupChoice,
   lineupValue,
   parseRocketKey,
+  type RocketCatch,
   type RocketChoice,
 } from '../domain/rocket/lineups.js';
+import type { PictureLookup } from '../domain/stops/pictures.js';
 import type { ResearchOptionsView, RocketOptionsView } from '../domain/web/stop-report-data.js';
 import { mapCatch, mapReward } from '../domain/web/stop-report-view.js';
 
@@ -25,6 +27,11 @@ export function researchOptions(input: {
   stale: boolean;
   listed: { items: ReadonlyMap<string, string>; energies: ReadonlyMap<number, string> };
   origins: readonly string[];
+  /**
+   * The address of a picture as the post of the stops names it (plan 8M-9B, `StopPictures.url`: the
+   * square one, made when the list was read); the source itself without it.
+   */
+  picture?: PictureLookup;
 }): ResearchOptionsView {
   return {
     stale: input.stale,
@@ -33,8 +40,14 @@ export function researchOptions(input: {
       key: task.key,
       text: task.text,
       category: task.category,
-      rewards: task.rewards.map((reward) => mapReward(reward, input.origins)),
-      versions: input.versions(task).map(({ value, label, oneOf }) => ({ value, label, oneOf })),
+      rewards: task.rewards.map((reward) => mapReward(reward, input.origins, input.picture)),
+      // Each version with the rewards it stands for, as the server decides them (review F2).
+      versions: input.versions(task).map(({ value, label, oneOf, rewards }) => ({
+        value,
+        label,
+        oneOf,
+        rewards: rewards.map((reward) => mapReward(reward, input.origins, input.picture)),
+      })),
     })),
     rewards: [
       ...[...input.listed.items].map(([key, name]) => ({ value: `item:${key}`, name })),
@@ -59,7 +72,10 @@ export function rocketOptions(input: {
   stale: boolean;
   giovanniNote: string;
   origins: readonly string[];
+  /** As `researchOptions`' (plan 8M-9B): the square pictures, made when the lineups were read. */
+  picture?: PictureLookup;
 }): RocketOptionsView {
+  const mapped = (caught: RocketCatch) => mapCatch(caught, input.origins, input.picture);
   return {
     stale: input.stale,
     readAt: input.readAt ?? null,
@@ -69,7 +85,7 @@ export function rocketOptions(input: {
         key: choice.key,
         name: choice.name,
         hideout: who !== undefined && isHideout(who),
-        catches: choice.catches.map((caught) => mapCatch(caught, input.origins)),
+        catches: choice.catches.map(mapped),
         ...(who?.kind === 'giovanni' ? { note: input.giovanniNote } : {}),
         ...(choice.lineups === undefined
           ? {}
@@ -81,7 +97,7 @@ export function rocketOptions(input: {
                   value: lineupValue(choice, lineup),
                   label: taken.lineup ?? '',
                   fingerprint: lineup.fingerprint,
-                  catches: lineup.catches.map((caught) => mapCatch(caught, input.origins)),
+                  catches: lineup.catches.map(mapped),
                 };
               }),
             }),
diff --git a/src/web/stop-report-post.test.ts b/src/web/stop-report-post.test.ts
index 51b58acf5d23ca798b5b6cc9894b8ef891f304a3..1681673e603192b18d80015438a4617a6f37ef1b 100644
--- a/src/web/stop-report-post.test.ts
+++ b/src/web/stop-report-post.test.ts
@@ -289,7 +289,12 @@ describe('reports at stops from the map', () => {
           stops: [wayspotId(3)],
         });
         expect(ended.status).toBe(409);
-        expect(ended.json).toEqual({ ok: false, text: REPORT_ENDED.replace(/`/g, '') });
+        expect(ended.json).toEqual({
+          ok: false,
+          text: REPORT_ENDED.replace(/`/g, ''),
+          // What the page acts on (plan 8M-9B, B4): the words are only shown.
+          reason: 'ended',
+        });
         const more = await made.post('/research', {
           task: listed?.task,
           more: true,
@@ -421,6 +426,7 @@ describe('reports at stops from the map', () => {
         });
         expect(gone.status).toBe(422);
         expect(gone.json.text).toBe(TASK_LIST_CHANGED);
+        expect(gone.json.reason).toBe('list-changed');
         const reward = await made.post('/research', {
           task: 'Win 3 raids in the rain',
           reward: 'a golden thing',
@@ -428,6 +434,7 @@ describe('reports at stops from the map', () => {
         });
         expect(reward.status).toBe(422);
         expect(reward.json.text).toMatch(/^I do not know "a golden thing" as a reward\./);
+        expect(reward.json).not.toHaveProperty('reason');
         expect(made.store.rows.size).toBe(0);
         // Nothing counted: both uses are there.
         for (const n of [1, 2]) {
@@ -540,7 +547,11 @@ describe('reports at stops from the map', () => {
       ]) {
         const answer = await made.post('/research', { sameAs, stops: [wayspotId(1)] });
         expect(answer.status).toBe(409);
-        expect(answer.json).toEqual({ ok: false, text: REPORT_ENDED.replace(/`/g, '') });
+        expect(answer.json).toEqual({
+          ok: false,
+          text: REPORT_ENDED.replace(/`/g, ''),
+          reason: 'ended',
+        });
       }
       expect(made.web.entries).toContainEqual(
         expect.objectContaining({ outcome: 'ended', stops: [wayspotId(1)] }),
@@ -774,6 +785,7 @@ describe('reports at stops from the map', () => {
         });
         expect(stale.status).toBe(422);
         expect(stale.json.text).toBe(LINEUPS_CHANGED);
+        expect(stale.json.reason).toBe('list-changed');
         expect(
           (await made.post('/rocket', { who: 'grunt:water:male', stop: wayspotId(1) })).json.text,
         ).toBe(LINEUPS_CHANGED);
diff --git a/src/web/stop-routes.ts b/src/web/stop-routes.ts
index 3157375c5aae7f6f3052a92185897c66583620b5..401164825437db9c7f4aa818fab3d394a5bbcc94 100644
--- a/src/web/stop-routes.ts
+++ b/src/web/stop-routes.ts
@@ -39,7 +39,7 @@ import {
   type RocketReporting,
 } from '../commands/rocket/rocket-report.js';
 import type { Region } from '../db/repositories/region-repository.js';
-import { UserError } from '../discord/errors.js';
+import { ListChanged, UserError } from '../discord/errors.js';
 import { MEMBER_WRITE_THROTTLE } from '../discord/throttle.js';
 import { isHideout, parseRocketKey, type RocketChoice } from '../domain/rocket/lineups.js';
 import {
@@ -295,6 +295,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
       stale: ctx.researchTasks.stale(deps.now()),
       listed: listedRewards(ctx),
       origins: deps.pictureOrigins,
+      picture: (source) => deps.pictures.url(source),
     }),
   );
 
@@ -306,6 +307,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
       stale: ctx.rocketLineups.stale(deps.now()),
       giovanniNote: GIOVANNI_ONLY_WHEN_SURE,
       origins: deps.pictureOrigins,
+      picture: (source) => deps.pictures.url(source),
     }),
   );
 
@@ -417,7 +419,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
       // listed one gone from the list since).
       const base = await ctx.stopReports.get(guild, body.data.sameAs);
       if (base?.kind !== 'research' || base.periodKey !== ctx.stopReports.period(deps.now()).key) {
-        return noted('ended', refuse(reply, 409, REPORT_ENDED));
+        return noted('ended', refuse(reply, 409, REPORT_ENDED, { reason: 'ended' }));
       }
       subject = { subjectKey: base.subjectKey, research: base.research };
     } else {
@@ -429,7 +431,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
         subject = readTask(ctx, body.data.task, body.data.reward ?? null);
       } catch (err) {
         if (!(err instanceof UserError)) throw err;
-        return noted('refused', refuse(reply, 422, err.message));
+        return noted('refused', refuse(reply, 422, err.message, listChanged(err)));
       }
     }
     const { settings } = ctx.config;
@@ -577,7 +579,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
       choice = readWho(ctx, body.data.who);
     } catch (err) {
       if (!(err instanceof UserError)) throw err;
-      return noted('refused', refuse(reply, 422, err.message));
+      return noted('refused', refuse(reply, 422, err.message, listChanged(err)));
     }
     const { settings } = ctx.config;
     const throttle = rocketThrottle(settings);
@@ -717,6 +719,15 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
 /** The regions each report lies in, by the report's id. */
 type Places = ReadonlyMap<number, readonly Region[]>;
 
+/**
+ * The machine part of a reader's refusal (plan 8M-9B, B4): the task list or the lineups changed
+ * under the choice (`ListChanged`, by its kind: review F8), `list-changed`, which a page acts on
+ * by asking for its lists again.
+ */
+function listChanged(err: UserError): Pick<StopReportAnswer, 'reason'> {
+  return err instanceof ListChanged ? { reason: 'list-changed' } : {};
+}
+
 /** A take-back's address: `/api/stop-reports/<id>/remove`. */
 type RemoveRequest = FastifyRequest<{ Params: { guild: string; id: string } }>;
 
diff --git a/test/support/web.ts b/test/support/web.ts
index 24acc82b556d87c12f5c95b3a1a8d3138bcafa48..d9d501e27355c388c61f328b00733bbc5e9a3560 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -746,7 +746,8 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
   const gateway = 'oauth' in options ? options.oauth : new FakeOAuth();
   const app = buildWebServer({
     settings,
-    pictureOrigins: ['https://cdn.leekduck.com'],
+    // As the bot's: the feeds' host and its own address, whose /pictures/ and /eggs/ posts show.
+    pictureOrigins: ['https://cdn.leekduck.com', settings.publicUrl],
     googleKey: options.googleKey,
     distanceUnits: options.distanceUnits ?? 'imperial',
     servers: options.servers ?? { has: (guildId) => guildId === FAKE_GUILD_ID },
````

### Task 2: 8M-9B task 2: the research and Rocket layers, their poll and markers

Prototype commit: `655ad858a7ed4bb5768191d65105bf4a6187368a`

Two live layers, Field research and Team GO Rocket (members only, on by
default; "Research" and "Rocket" on the desktop's toggles, the full names in
the sheet and the title):

- `/api/stop-reports` polled as the parties are (`stopReportLayer`: every
  20 s while visible, 401/403 stop it, drawn only when its JSON changed),
  drawn inside the parties' draw (one hold, one redraw).
- One marker per stop holding every report shown there (`reportsAtStops`,
  `stopMarkerNode`): a hideout's picture, else the research's, else the Rocket
  icon (the research icon for a typed task without its reward); ringed
  `--research`, `--rocket`, or half and half with both; a grunt's minutes as a
  raid's badge, dimmed in its last five minutes; never clustered. A report
  drops at its end (the parties drawn anew then), but at the stop whose popup
  or card is open. The plain PokéStop dot under it is left out.
- A stop and a party at one place: one tap lists both (the shared-place seam,
  `PlacedLayer` takes `research` and `rocket`).
- The icons: the game's quest symbol as a mask tinted `--research`, Team GO
  Rocket's R, at the pinned pogo_assets commit.
- The header (B7, provisional): "Layers · n" and its sheet up to 1023 px, the
  five toggles from 1024; "Professor Pine" whole from 768 px; "Find a gym"
  narrower to 1279 px and a long name cut at 140 px, so the row holds.

**Files:**

```
 src/web/client/layer-registry.test.ts            |  24 ++++++++++++---
 src/web/client/layer-registry.ts                 |  26 +++++++++++++++-
 src/web/client/layers-ui.ts                      |  12 +++++++-
 src/web/client/list-ui.test.ts                   |  29 ++++++++++++++++++
 src/web/client/list-ui.ts                        |   7 ++++-
 src/web/client/main.ts                           |   5 +++-
 src/web/client/map.css                           | 153 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----
 src/web/client/party-layer-draw.isolated.test.ts | 235 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----------------
 src/web/client/party-layer.ts                    |  95 +++++++++++++++++++++++++++++++++++++++++++++++++---------
 src/web/client/report-icons.ts                   |  19 ++++++++++--
 src/web/client/report-menu.ts                    |  19 +++++++++---
 src/web/client/report-ui.ts                      |   5 +++-
 src/web/client/stop-popup.ts                     |  28 +++++++++++++++++
 src/web/client/stop-report-cases.ts              | 217 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/stop-report-layer.ts              | 205 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/stop-reports.test.ts              | 167 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/stop-reports.ts                   | 212 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/theme.css                         |   5 ++++
 src/web/phone-header.test.ts                     |  41 +++++++++++++++++++++++++
 src/web/report-icons.test.ts                     |  26 ++++++++++++++++
 20 files changed, 1465 insertions(+), 65 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/layer-registry.test.ts src/web/client/list-ui.test.ts src/web/client/party-layer-draw.isolated.test.ts src/web/client/stop-reports.test.ts src/web/phone-header.test.ts src/web/report-icons.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 655ad858a7ed4bb5768191d65105bf4a6187368a -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-9B task 2: the research and Rocket layers, their poll and markers`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/layer-registry.test.ts b/src/web/client/layer-registry.test.ts
index 485518eb4ba5a0cdcd1bebc656030c7285d92d0c..f65220c141b9e1461ff455168b68e70496960262 100644
--- a/src/web/client/layer-registry.test.ts
+++ b/src/web/client/layer-registry.test.ts
@@ -7,6 +7,7 @@ import {
   type LayerSpec,
 } from './layer-registry.js';
 import {
+  chipLabel,
   inViewWords,
   layersButtonLabel,
   moreCloses,
@@ -45,6 +46,9 @@ describe('the layers of the map (plan 8M-7)', () => {
       ['raids', true],
       ['trains', true],
       ['meetups', true],
+      // Reports at stops (plan 8M-9B): live, on.
+      ['research', true],
+      ['rocket', true],
       ['spawns', false],
       // Off since the Report button (plan 8M-9A): its step 2 draws the gyms to pick from.
       ['gyms', false],
@@ -58,7 +62,14 @@ describe('the layers of the map (plan 8M-7)', () => {
         .layers()
         .filter((layer) => layer.kind === 'live')
         .map((l) => l.name),
-    ).toEqual(['Raids', 'Trains', 'Meetups']);
+    ).toEqual(['Raids', 'Trains', 'Meetups', 'Field research', 'Team GO Rocket']);
+    // Short in the desktop's row (B7), the full name in the sheet and the toggle's title.
+    expect(
+      registry
+        .layers()
+        .filter((layer) => layer.kind === 'live')
+        .map((l) => chipLabel(l)),
+    ).toEqual(['Raids', 'Trains', 'Meetups', 'Research', 'Rocket']);
     expect(
       registry
         .layers()
@@ -117,15 +128,20 @@ describe('the layers of the map (plan 8M-7)', () => {
         .map((layer) => layer.id);
     expect(offered(false)).not.toContain('stops');
     expect(offered(false)).not.toContain('spots');
+    // Reports at stops are a member's (plan 8M-9B): not offered logged out.
+    expect(offered(false)).not.toContain('research');
+    expect(offered(false)).not.toContain('rocket');
+    expect(offered(true)).toEqual(expect.arrayContaining(['research', 'rocket']));
     expect(offered(true)).toEqual(expect.arrayContaining(['stops', 'spots']));
     // Wild spawns wait for their data (no route lists spawns yet).
     expect(offered(true)).not.toContain('spawns');
     registry.setOffered('spawns', true);
     expect(offered(true)).toContain('spawns');
     registry.set('stops', true);
-    // Raids, trains, meetups, outlines and the stops: the Gyms layer is off (plan 8M-9A).
-    expect(registry.countOn(true)).toBe(5);
-    // The stops are not offered to a visitor: not counted, though kept on.
+    // Raids, trains, meetups, research, Rocket, outlines and the stops: the Gyms layer is off
+    // (plan 8M-9A).
+    expect(registry.countOn(true)).toBe(7);
+    // The stops and the reports at them are not offered to a visitor: not counted, though on.
     expect(registry.countOn(false)).toBe(4);
   });
 
diff --git a/src/web/client/layer-registry.ts b/src/web/client/layer-registry.ts
index c208449c02326cd1cad03cbba8e9bc0d81d76cb1..be1efdbecc9faa3cc08e0b925ff1b8ebe1e0eed0 100644
--- a/src/web/client/layer-registry.ts
+++ b/src/web/client/layer-registry.ts
@@ -5,13 +5,18 @@ import type { ViewStorage } from './view.js';
  * name, whether it is on by default, whether it is live (what happens now: a toggle of its own in
  * the desktop row) or background (under "More"), and how many of its things are in view (the
  * phone's sheet says it). The page's parts register with the registry (one call adds a layer:
- * field research and Team GO Rocket come so with plan 8M-9) and follow it; the member's choice is
+ * field research and Team GO Rocket came so with plan 8M-9B) and follow it; the member's choice is
  * kept per browser (`localStorage`, read and written in try/catch).
  */
 
 export interface LayerSpec {
   id: string;
   name: string;
+  /**
+   * Its words on the desktop's toggle, where the row has no room for its name (plan 8M-9B, B7:
+   * "Research", "Rocket"); the name stays in the sheet and the toggle's title.
+   */
+  short?: string;
   /** On by default. */
   on: boolean;
   /** Live: a toggle of its own on the desktop; background: under "More". */
@@ -29,6 +34,25 @@ export const MAP_LAYERS: readonly LayerSpec[] = [
   { id: 'raids', name: 'Raids', on: true, kind: 'live', hint: 'Bosses, eggs and max battles' },
   { id: 'trains', name: 'Trains', on: true, kind: 'live' },
   { id: 'meetups', name: 'Meetups', on: true, kind: 'live' },
+  // Reports at stops (plan 8M-9B): `/api/stop-reports`, a member's.
+  {
+    id: 'research',
+    name: 'Field research',
+    short: 'Research',
+    on: true,
+    kind: 'live',
+    hint: 'Tasks reported at PokéStops today',
+    membersOnly: true,
+  },
+  {
+    id: 'rocket',
+    name: 'Team GO Rocket',
+    short: 'Rocket',
+    on: true,
+    kind: 'live',
+    hint: 'Grunts, leaders and Giovanni at PokéStops',
+    membersOnly: true,
+  },
   { id: 'spawns', name: 'Wild spawns', on: false, kind: 'background', waits: true },
   // Off since the Report button (plan 8M-9A): its step 2 draws the gyms to pick from whatever
   // this says (on until then, fix round 1 of 8M-7: "Report raid" was in a gym's popup alone). A
diff --git a/src/web/client/layers-ui.ts b/src/web/client/layers-ui.ts
index 33e7fb01655c877c0ddcf12391bfd11fec33ad2f..c0418f97a8009cf9ad4ff3b3acb21764eb9240ce 100644
--- a/src/web/client/layers-ui.ts
+++ b/src/web/client/layers-ui.ts
@@ -23,6 +23,11 @@ export function inViewWords(count: number | undefined): string {
   return count === undefined ? '' : `${count} in view`;
 }
 
+/** A live layer's words on the desktop's toggle: its short words where it has them (B7). */
+export function chipLabel(spec: LayerSpec): string {
+  return spec.short ?? spec.name;
+}
+
 /** A layer's switch is named by its layer, for a screen reader (fix round 1). */
 export function switchLabel(spec: LayerSpec): string {
   return spec.name;
@@ -112,7 +117,12 @@ export function showLayerControls(registry: LayerRegistry, nav: HTMLElement): La
     const dot = document.createElement('span');
     dot.className = 'dot';
     const name = document.createElement('span');
-    name.textContent = spec.name;
+    name.textContent = chipLabel(spec);
+    // Its whole name where the row shows it short (B7), for the pointer and a screen reader.
+    if (spec.short !== undefined) {
+      button.title = spec.name;
+      button.setAttribute('aria-label', spec.name);
+    }
     button.append(dot, name);
     button.addEventListener('click', () => {
       toggle(spec.id, !registry.isOn(spec.id));
diff --git a/src/web/client/list-ui.test.ts b/src/web/client/list-ui.test.ts
index e6375a55d30bbe1d67d2734364566e48699bfeb8..079be9f66eda1276334eb86bfc7c2e5cf6a9c44e 100644
--- a/src/web/client/list-ui.test.ts
+++ b/src/web/client/list-ui.test.ts
@@ -293,3 +293,32 @@ describe('the focus in the list drawn anew (review fix 2)', () => {
     expect(focused.element?.isConnected).toBe(true);
   });
 });
+
+describe("the list before the parties' list came (review round 2, R1)", () => {
+  afterEach(() => {
+    vi.unstubAllGlobals();
+  });
+
+  it('says that nothing is on only once the parties are known', () => {
+    fakeDocument();
+    const section = new FakeElement('section');
+    let known = false;
+    const list = new WhatIsOn({
+      section: section as unknown as HTMLElement,
+      registry: { isOn: () => true } as unknown as LayerRegistry,
+      storage: undefined,
+      origin: () => undefined,
+      zone: () => 'America/New_York',
+      units: 'imperial',
+      open: () => false,
+      highlight: () => undefined,
+      detail: () => undefined,
+      partiesKnown: () => known,
+    });
+    list.show([]);
+    expect(section.words()).not.toContain('Nothing is on just now.');
+    known = true;
+    list.render();
+    expect(section.words()).toContain('Nothing is on just now.');
+  });
+});
diff --git a/src/web/client/list-ui.ts b/src/web/client/list-ui.ts
index 26d2d7c2880fe65cb2b15bbec90769f67265f127..63be70bd2cd50f80748317422405424a80fce37c 100644
--- a/src/web/client/list-ui.ts
+++ b/src/web/client/list-ui.ts
@@ -37,6 +37,11 @@ export interface WhatIsOnDeps {
   detail(line: ListLine): HTMLElement | undefined;
   /** Drawn: a form of a line that went with it lets its claim go (fix round 1). */
   rendered?(): void;
+  /**
+   * Whether the parties' list has come (review round 2, R1); until it has, the list does not say
+   * that nothing is on. Known without it.
+   */
+  partiesKnown?(): boolean;
 }
 
 export class WhatIsOn {
@@ -124,7 +129,7 @@ export class WhatIsOn {
     });
     header.append(heading, sort);
     const body: HTMLElement[] = [header];
-    if (groups.length === 0) {
+    if (groups.length === 0 && (deps.partiesKnown?.() ?? true)) {
       const empty = document.createElement('p');
       empty.className = 'empty';
       empty.textContent = 'Nothing is on just now.';
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 37b09b9cf06fc62d6fbdc03f6f5b87c187b1fb5b..14f305df4b3bfdd87821c4ef31341e8deeec58fa 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -303,7 +303,10 @@ function start(): void {
       gymExtras.clicked = (gym) => raids.gymClicked(gym);
       spotTaps.clicked = (spot) => raids.spotClicked(spot);
       placesHooks.spotControls = (spot) => raids.spotControls(spot);
-      placesHooks.occupied = (layer) => (layer === 'spots' ? raids.battleSpots() : new Set());
+      // A Power Spot with a battle shows the battle (A6), a PokéStop with reports their marker
+      // (plan 8M-9B).
+      placesHooks.occupied = (layer) =>
+        layer === 'spots' ? raids.battleSpots() : raids.reportStops();
       placesHooks.forced = (layer) => raids.forcedPlaces(layer);
       placesHooks.openBattle = (spotId) => raids.openBattle(spotId);
       placesHooks.stopTapped = (stop) => raids.stopTapped(stop);
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 550af15a16a9e23bb5e143591eada7661e6fe919..4ce445c763708c6a418b8a23c1c530cb08ba016d 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -121,6 +121,19 @@ a {
   list-style: none;
 }
 
+/*
+ * A long name is cut to fit on the desktop too (plan 8M-9B, B7): beside five toggles at 1024
+ * pixels a name of 26 letters took the row's room and the header wrapped.
+ */
+@media (min-width: 768px) {
+  .account-menu summary {
+    display: block;
+    max-width: 140px;
+    overflow: hidden;
+    text-overflow: ellipsis;
+  }
+}
+
 .account-menu summary::-webkit-details-marker {
   display: none;
 }
@@ -148,16 +161,17 @@ a {
 }
 
 /*
- * With the Report button in it (plan 8M-9A), the desktop's one row needs the room up to 1024
- * pixels: the title is "Pine" there too and "Find a gym" starts narrower.
+ * Up to 1280 pixels "Find a gym" starts narrower (plan 8M-9A to 1024; plan 8M-9B, B7, to 1280,
+ * for the five toggles). The title is whole from 768: with "Layers · n" in place of the toggles
+ * up to 1023 the row has room for it, and from 1024 the five toggles, Report, "Find a gym" and
+ * the account (its name cut at 140 pixels) fit beside it (measured in the preview at 768, 1023,
+ * 1024, 1150 and 1280 pixels).
  */
-@media (min-width: 768px) and (max-width: 1023px) {
-  #header .title-first {
-    display: none;
-  }
-
+@media (min-width: 768px) and (max-width: 1279px) {
+  /* Its own width (some 180 pixels) is no floor: the row wraps only below 120. */
   #filter {
     flex-basis: 120px;
+    min-width: 0;
   }
 }
 
@@ -361,7 +375,11 @@ a {
   padding: 8px 12px;
 }
 
-@media (max-width: 767px) {
+/*
+ * With the reports at stops' two toggles (plan 8M-9B, B7, provisional) the desktop's row of five
+ * toggles needs 1024 pixels: narrower, "Layers · n" and its sheet, as on a phone.
+ */
+@media (max-width: 1023px) {
   #layers .chips,
   #layers .more {
     display: none;
@@ -1352,6 +1370,125 @@ path.highlighted {
   border-color: var(--tier-gigantamax);
 }
 
+/*
+ * A stop's reports (plan 8M-9B): a circle centered on the stop, smaller than a raid's (the raids'
+ * middle size from zoom 15, their small one below), its picture in a ring of `--research` or
+ * `--rocket`, half and half where the stop has both; a grunt's minutes under it, dimmed in its last
+ * five minutes as a raid.
+ */
+.stop-icon {
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  background: none;
+  border: 0;
+}
+
+.stop-marker {
+  position: relative;
+  flex: none;
+  width: var(--raid-middle);
+  height: var(--raid-middle);
+}
+
+.stop-marker.size-small {
+  width: var(--raid-small);
+  height: var(--raid-small);
+}
+
+.stop-marker .ring {
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  box-sizing: border-box;
+  width: 100%;
+  height: 100%;
+  border: 3px solid var(--line);
+  border-radius: 50%;
+  background: var(--marker-bg);
+  box-shadow: 0 2px 6px var(--shadow);
+  overflow: hidden;
+}
+
+.stop-marker .ring img,
+.stop-marker .ring .report-icon {
+  width: 78%;
+  height: 78%;
+  pointer-events: none;
+}
+
+.stop-marker.research .ring {
+  border-color: var(--research);
+}
+
+.stop-marker.rocket .ring {
+  border-color: var(--rocket);
+}
+
+/* Both layers at one stop: the ring half research, half Rocket. */
+.stop-marker.both .ring {
+  border-color: var(--research) var(--rocket) var(--rocket) var(--research);
+  transform: rotate(-45deg);
+}
+
+.stop-marker.both .ring > * {
+  transform: rotate(45deg);
+}
+
+.stop-marker .badge {
+  position: absolute;
+  top: 100%;
+  left: 50%;
+  transform: translateX(-50%);
+  padding: 1px 6px;
+  border-radius: 8px;
+  background: var(--marker-bg);
+  color: var(--text);
+  box-shadow: 0 1px 3px var(--shadow);
+  font-size: 11px;
+  font-weight: 600;
+  white-space: nowrap;
+}
+
+.stop-marker.dim {
+  opacity: 0.45;
+}
+
+.stop-icon.highlighted .ring {
+  outline: 3px solid var(--focus);
+  outline-offset: 2px;
+}
+
+/* The game's pictures drawn as a mask in the color of what they stand for (B17). */
+.report-icon.mask {
+  background: currentColor;
+  mask-size: contain;
+  mask-repeat: no-repeat;
+  mask-position: center;
+  -webkit-mask-size: contain;
+  -webkit-mask-repeat: no-repeat;
+  -webkit-mask-position: center;
+}
+
+/*
+ * The quest symbol's picture by its pinned address, as `REPORT_ICONS.research` names it
+ * (`report-icons.test.ts` holds the two to one address): set here, so that every place of the icon
+ * (the menu, the markers, the popups and phone cards) draws it, with no script.
+ */
+.report-icon.mask-research {
+  color: var(--research);
+  mask-image: url('https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Quests/QuestSymbol.png');
+  -webkit-mask-image: url('https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Quests/QuestSymbol.png');
+}
+
+.chip[data-layer='research'] .dot {
+  background: var(--research);
+}
+
+.chip[data-layer='rocket'] .dot {
+  background: var(--rocket);
+}
+
 /* The list of the things at one place (plan 8M-7): a choice per thing. */
 .place-list .choices {
   display: flex;
diff --git a/src/web/client/party-layer-draw.isolated.test.ts b/src/web/client/party-layer-draw.isolated.test.ts
index 532f5c8f683b41264cf89bcfef96c32ecdc95b24..4a1d48c18c20d147c47daab4a7c649357b95e8d3 100644
--- a/src/web/client/party-layer-draw.isolated.test.ts
+++ b/src/web/client/party-layer-draw.isolated.test.ts
@@ -1,12 +1,20 @@
-import { afterEach, describe, expect, it, vi } from 'vitest';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import type { GeoView } from '../../domain/web/geo-data.js';
-import type { MapMax, MapRaid, MapTrain, PartiesView } from '../../domain/web/party-data.js';
+import type {
+  MapMax,
+  MapMeetup,
+  MapRaid,
+  MapTrain,
+  PartiesView,
+} from '../../domain/web/party-data.js';
+import type { StopReportsView } from '../../domain/web/stop-report-data.js';
 import { LayerRegistry, LAYERS_KEY, MAP_LAYERS } from './layer-registry.js';
 import type { MaxUiDeps } from './max-ui.js';
 import { showParties } from './party-layer.js';
 import type { MapGym } from './popup.js';
 import type { RaidUiDeps } from './raid-ui.js';
 import type { LatLon } from './view.js';
+import { CASE_NOW, caseGrunt, caseResearch, caseStop, caseView } from './stop-report-cases.js';
 
 /**
  * `showParties` drawing a list of parties (plan 8M-9A, review B1 and B9) on a map of fakes: just
@@ -164,7 +172,26 @@ const fake = vi.hoisted(() => {
    */
   const route = { on: false, taken: [] as unknown[] };
 
-  return { Layer, Marker, Path, CircleMarker, Group, shown, Card, card, forms, route };
+  /** The contents of the popups opened by themselves (the list of things at one place). */
+  const placeList: unknown[] = [];
+
+  /** The list of what is on as the party layer made it: whether it is told the parties are known. */
+  const list: { partiesKnown?: (() => boolean) | undefined } = {};
+
+  return {
+    Layer,
+    Marker,
+    Path,
+    CircleMarker,
+    Group,
+    shown,
+    Card,
+    card,
+    forms,
+    route,
+    placeList,
+    list,
+  };
 });
 
 vi.mock('leaflet', () => ({
@@ -189,7 +216,11 @@ vi.mock('leaflet', () => ({
   popup: () => {
     const popup = {
       setLatLng: () => popup,
-      setContent: () => popup,
+      // The list of the things at one place (plan 8M-7): kept, for a test to read.
+      setContent: (content: unknown) => {
+        fake.placeList.push(content);
+        return popup;
+      },
       openOn: () => popup,
       getElement: () => undefined,
     };
@@ -221,6 +252,9 @@ vi.mock('./list-ui.js', async (importOriginal) => {
     ...real,
     WhatIsOn: class {
       sorted = 'soonest';
+      constructor(deps: { partiesKnown?: () => boolean }) {
+        fake.list.partiesKnown = deps.partiesKnown;
+      }
       show() {}
       render() {}
       redrawLine() {}
@@ -520,14 +554,18 @@ const battle = (id: string, spotId: string | null, lat: number, lon: number): Ma
   postKey: null,
 });
 
-const SPOT_BATTLE = battle('x1', 'spot-1', 40.45, -79.94);
-const PIN_BATTLE = battle('x2', null, 40.46, -79.93);
+/**
+ * The battle at the Power Spot and the one at a pin, made when called (review round 2, R3): their
+ * ends by the clock of the test that asks, faked or not, never the one the file was loaded at.
+ */
+const spotBattle = (): MapMax => battle('x1', 'spot-1', 40.45, -79.94);
+const pinBattle = (): MapMax => battle('x2', null, 40.46, -79.93);
 
 const view = (more: Partial<PartiesView> = {}): PartiesView => ({
   zone: ZONE,
   readOnly: false,
   raids: [raidAt(1)],
-  maxes: [SPOT_BATTLE, PIN_BATTLE],
+  maxes: [spotBattle(), pinBattle()],
   trains: [],
   meetups: [],
   ...more,
@@ -550,6 +588,16 @@ async function started(options: {
   regions?: GeoView['regions'];
   /** A phone's page: a party opens as the card. */
   phone?: boolean;
+  /** The reports at stops `/api/stop-reports` gives (plan 8M-9B): drawn once they came. */
+  stops?: StopReportsView;
+  /** The layers as the browser kept them, beside `raids`. */
+  layers?: Record<string, boolean>;
+  /** `/api/parties` answers 503 (Discord cannot be asked just now): no parties are drawn. */
+  partiesDown?: boolean;
+  /** `/api/parties` answers only once the test lets it (`releaseParties`): the reports first. */
+  partiesLate?: boolean;
+  /** Which places the map shows (its bounds); every place without it. */
+  inView?: (at: [number, number]) => boolean;
 }) {
   page.byId = new Map();
   page.active = null;
@@ -561,6 +609,7 @@ async function started(options: {
   fake.card.wanted = options.phone ?? false;
   fake.route.on = false;
   fake.route.taken = [];
+  fake.placeList.splice(0);
   const body = new PageElement('body');
   vi.stubGlobal('HTMLElement', PageElement);
   vi.stubGlobal('HTMLButtonElement', PageElement);
@@ -599,10 +648,22 @@ async function started(options: {
   vi.stubGlobal('location', { origin: 'https://pine.example' });
   let listed = JSON.stringify(options.parties ?? view());
   const asked: string[] = [];
+  let releaseParties = (): void => undefined;
+  const partiesLet = new Promise<void>((resolve) => {
+    releaseParties = resolve;
+  });
   vi.stubGlobal('fetch', (url: string) => {
     asked.push(url);
     if (url.endsWith('/api/parties')) {
-      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(listed) });
+      if (options.partiesDown === true) {
+        return Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('') });
+      }
+      const answer = { ok: true, status: 200, text: () => Promise.resolve(listed) };
+      return options.partiesLate === true ? partiesLet.then(() => answer) : Promise.resolve(answer);
+    }
+    if (url.endsWith('/api/stop-reports') && options.stops !== undefined) {
+      const reports = JSON.stringify(options.stops);
+      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(reports) });
     }
     return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
   });
@@ -625,7 +686,10 @@ async function started(options: {
     createPane: () => ({ style: {} }),
     getZoom: () => 16,
     getSize: () => ({ x: 1200, y: 800 }),
-    getBounds: () => ({ contains: () => true }),
+    getBounds: () => ({
+      contains: (at: [number, number] | { lat: number; lng: number }) =>
+        options.inView?.(Array.isArray(at) ? at : [at.lat, at.lng]) ?? true,
+    }),
     getCenter: () => ({ lat: 40.44, lng: -79.95 }),
     getContainer: () => container,
     // Far apart on the screen: no two things share a place.
@@ -645,18 +709,25 @@ async function started(options: {
   fake.shown.map = map;
   const kept = {
     getItem: (key: string) =>
-      key === LAYERS_KEY ? JSON.stringify({ raids: options.raids }) : null,
+      key === LAYERS_KEY ? JSON.stringify({ ...options.layers, raids: options.raids }) : null,
     setItem: () => undefined,
   };
   const registry = new LayerRegistry(kept);
   for (const layer of MAP_LAYERS) registry.register(layer);
-  /** Those who wait for the next list to be drawn. */
-  const waiting: Array<() => void> = [];
-  const nextDraw = () =>
+  /** How many times the parties were drawn, and those who wait for a draw by its number. */
+  let draws = 0;
+  const waiting: Array<{ at: number; resolve: () => void }> = [];
+  const drawNumber = (at: number) =>
     new Promise<void>((resolve) => {
-      waiting.push(resolve);
+      if (draws >= at) resolve();
+      else waiting.push({ at, resolve });
     });
-  const firstDraw = nextDraw();
+  const nextDraw = () => drawNumber(draws + 1);
+  // The parties first; the reports at stops, asked for after them, drawn again with them.
+  const firstDraw = drawNumber(
+    (options.partiesDown === true || options.partiesLate === true ? 0 : 1) +
+      (options.stops === undefined ? 0 : 1),
+  );
   const raids = showParties(
     map as unknown as Parameters<typeof showParties>[0],
     '100000000000000001',
@@ -673,7 +744,11 @@ async function started(options: {
     {
       registry,
       afterDraw: () => {
-        for (const resolve of waiting.splice(0)) resolve();
+        draws += 1;
+        for (const waiter of waiting.filter((one) => one.at <= draws)) {
+          waiting.splice(waiting.indexOf(waiter), 1);
+          waiter.resolve();
+        }
       },
       located: () => options.located,
       onMove: () => undefined,
@@ -715,15 +790,19 @@ async function started(options: {
     raidForms: fake.forms.raid as RaidUiDeps,
     maxForms: fake.forms.max as MaxUiDeps,
     card: () => fake.card.made,
+    /** The next draw of the parties, once it is done. */
+    nextDraw,
+    /** `/api/parties` answers now (`partiesLate`). */
+    releaseParties,
   };
 }
 
 describe('a party a report made or found, opened with the Raids layer off (review B1)', () => {
   it('opens a max battle on its own marker after its form, the raids drawn while it shows', async () => {
     const { maxForms, markerOf } = await started({ raids: false });
-    expect(markerOf(SPOT_BATTLE.title)?.group?.onMap).toBe(false);
-    await maxForms.done(SPOT_BATTLE);
-    const marker = markerOf(SPOT_BATTLE.title);
+    expect(markerOf(spotBattle().title)?.group?.onMap).toBe(false);
+    await maxForms.done(spotBattle());
+    const marker = markerOf(spotBattle().title);
     expect(marker?.group?.onMap).toBe(true);
     expect(fake.shown.popupOf).toBe(marker);
   });
@@ -741,7 +820,7 @@ describe('a party a report made or found, opened with the Raids layer off (revie
     expect(raids.openBattle('spot-9')).toBe(false);
     expect(fake.shown.popupOf).toBeUndefined();
     expect(raids.openBattle('spot-1')).toBe(true);
-    const marker = markerOf(SPOT_BATTLE.title);
+    const marker = markerOf(spotBattle().title);
     expect(marker?.group?.onMap).toBe(true);
     expect(fake.shown.popupOf).toBe(marker);
   });
@@ -811,8 +890,8 @@ describe('Escape in step 2 of the Report button with the phone card open (review
     maxForms.pickSpot?.();
     // The battle tapped opens as the card on a phone (step 2 ends once the tap is through, a
     // timer the page's stub never runs here).
-    markerOf(SPOT_BATTLE.title)?.fire('click', {});
-    expect(card()?.key).toBe(`max:${SPOT_BATTLE.id}`);
+    markerOf(spotBattle().title)?.fire('click', {});
+    expect(card()?.key).toBe(`max:${spotBattle().id}`);
     escape();
     expect(card()?.key).toBeUndefined();
     expect(raids.forcedPlaces('spots')).toBe(true);
@@ -847,7 +926,7 @@ describe('a battle at a Power Spot and one at a pin on the map', () => {
 
   it('draws each as its marker under the raids, opened by its own key max:<id>', async () => {
     const { markerOf, card } = await started({ raids: true, phone: true });
-    for (const battle of [SPOT_BATTLE, PIN_BATTLE]) {
+    for (const battle of [spotBattle(), pinBattle()]) {
       const marker = markerOf(battle.title);
       expect(marker?.group?.onMap).toBe(true);
       marker?.fire('click', {});
@@ -871,18 +950,18 @@ describe('a battle at a Power Spot and one at a pin on the map', () => {
     // Step 2 of a raid takes it (the battle dimmed: nothing happens); route mode never sees it.
     chooseReport('raid');
     expect(raids.forced()).toBe(true);
-    markerOf(SPOT_BATTLE.title)?.fire('click', {});
+    markerOf(spotBattle().title)?.fire('click', {});
     expect(fake.route.taken).toEqual([]);
     expect(fake.shown.popupOf).toBeUndefined();
     // Step 2 canceled: route mode takes the spot's battle as its Power Spot, the pin's never.
     panel.querySelector('button[data-cancel]')?.dispatch('click');
     expect(raids.forced()).toBe(false);
-    markerOf(SPOT_BATTLE.title)?.fire('click', {});
+    markerOf(spotBattle().title)?.fire('click', {});
     expect(fake.route.taken).toEqual([{ id: 'spot-1', title: 'Lake Gazebo' }]);
     expect(fake.shown.popupOf).toBeUndefined();
-    markerOf(PIN_BATTLE.title)?.fire('click', {});
+    markerOf(pinBattle().title)?.fire('click', {});
     expect(fake.route.taken).toHaveLength(1);
-    expect(fake.shown.popupOf).toBe(markerOf(PIN_BATTLE.title));
+    expect(fake.shown.popupOf).toBe(markerOf(pinBattle().title));
   });
 
   it("rings a train at a Power Spot round its battle's circle while the raids are drawn", async () => {
@@ -920,3 +999,105 @@ describe("a raid's marker in a max battle's step 2 of the Report button", () =>
     }
   });
 });
+
+describe('the reports at stops on the map (plan 8M-9B)', () => {
+  /** Stop 5's research and grunt, stop 7's research, in Oakland (away from the Library). */
+  const STOPS = caseView({
+    research: [caseResearch(5), caseResearch(7)],
+    grunts: [caseGrunt(5)],
+  });
+  // The cases' clock (their reports end hours after it): the draw drops a report at its end.
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'] });
+    vi.setSystemTime(CASE_NOW);
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('draws one marker per stop with every report there, its PokéStop dot left out', async () => {
+    const { markerOf, raids, registry } = await started({ raids: true, stops: STOPS });
+    expect(markerOf('Yellow Mural 5')?.group?.onMap).toBe(true);
+    expect(markerOf('Yellow Mural 7')?.group?.onMap).toBe(true);
+    expect([...raids.reportStops()]).toEqual(['stop-5', 'stop-7']);
+    // Research off: stop 5 keeps its grunt's marker, stop 7 has none.
+    registry.set('research', false);
+    expect([...raids.reportStops()]).toEqual(['stop-5']);
+    registry.set('rocket', false);
+    expect([...raids.reportStops()]).toEqual([]);
+  });
+
+  it('is not drawn for layers the browser kept off', async () => {
+    const { raids } = await started({
+      raids: true,
+      stops: STOPS,
+      layers: { research: false, rocket: false },
+    });
+    expect([...raids.reportStops()]).toEqual([]);
+  });
+
+  // Review F11: the reports have their own poll, and do not wait for the parties'.
+  it('is drawn while the parties cannot be had, the map not said to be read-only', async () => {
+    const { markerOf, raids } = await started({ raids: true, stops: STOPS, partiesDown: true });
+    expect([...raids.reportStops()]).toEqual(['stop-5', 'stop-7']);
+    expect(markerOf('Yellow Mural 5')?.group?.onMap).toBe(true);
+    expect(page.byId.get('read-only')?.hidden).toBe(true);
+  });
+
+  // Review round 2, R1: drawn with the reports alone, the map has not had its first list of
+  // parties yet; that list asks for the posts in view alone (review N6), and until it comes the
+  // list of what is on does not say that nothing is on.
+  it("keeps the parties' first list for when it comes after the reports", async () => {
+    const { asked, nextDraw, releaseParties } = await started({
+      raids: true,
+      stops: STOPS,
+      partiesLate: true,
+      // Library (40.441) in view, Lake Gazebo (40.45) beyond it.
+      inView: ([lat]) => lat < 40.445,
+      parties: view({
+        raids: [{ ...raidAt(1), postKey: 'a' }],
+        maxes: [{ ...battle('x1', 'spot-1', 40.45, -79.94), postKey: 'b' }],
+      }),
+    });
+    expect(fake.list.partiesKnown?.()).toBe(false);
+    const drawn = nextDraw();
+    releaseParties();
+    await drawn;
+    expect(asked.filter((url) => url.includes('/post?'))).toEqual([
+      '/s/100000000000000001/api/parties/r1/post?k=a',
+    ]);
+    expect(fake.list.partiesKnown?.()).toBe(true);
+  });
+
+  // B3: a report and a party at one stop, one tap lists both.
+  it('lists a meetup at a stop and its reports for a tap on either', async () => {
+    const at = caseStop(5);
+    const meetup: MapMeetup = {
+      kind: 'meetup',
+      id: 'm1',
+      name: 'Picnic at the mural',
+      startTime: null,
+      endTime: null,
+      link: 'https://discord.com/channels/1/2/6',
+      attendance: attendance(),
+      postKey: null,
+      place: { kind: 'stop', words: `At ${at.name}`, lat: at.lat, lon: at.lon, gymId: null },
+      info: null,
+      panel: null,
+    };
+    const { markerOf } = await started({
+      raids: true,
+      stops: STOPS,
+      parties: view({ meetups: [meetup] }),
+    });
+    markerOf('Yellow Mural 5')?.fire('click', {});
+    expect(fake.shown.popupOf).toBeUndefined();
+    const list = fake.placeList.at(-1) as PageElement | undefined;
+    expect(
+      list?.querySelectorAll('button[data-open]').map((choice) => choice.dataset.open),
+    ).toEqual(['stop:stop-5', 'meetup:m1']);
+    // Alone at its stop: its own popup.
+    markerOf('Yellow Mural 7')?.fire('click', {});
+    expect(fake.shown.popupOf).toBe(markerOf('Yellow Mural 7'));
+  });
+});
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 466ac13e6eb610a2d91f5163448ccb461e26b708..499f0ebcb4232034f809d2452c698032fa6b4019 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -73,6 +73,9 @@ import { cardWanted, PhoneCard } from './phone-card.js';
 import { stopName } from './train-forms.js';
 import { stopPlace } from './parties.js';
 import type { Place } from './distance.js';
+import { stopReportLayer } from './stop-report-layer.js';
+import { stopPopup } from './stop-popup.js';
+import type { StopLayer } from './stop-reports.js';
 
 /**
  * The parties on the live map for a member (plan 8M-3, spec 3.2 to 3.4): one marker per gym
@@ -139,9 +142,10 @@ type Draw = (node: PageNode) => HTMLElement;
 
 /**
  * The layers whose things are drawn at a place, which a tap lists where they share it (plan 8M-7):
- * max battles are the raids' (plan 8M-9A); reports at stops join with plan 8M-9B.
+ * max battles are the raids' (plan 8M-9A); a stop's reports are research's or Rocket's (plan 8M-9B,
+ * B3: a report and a party at one stop, one tap lists both).
  */
-export type PlacedLayer = 'raids' | 'trains' | 'meetups';
+export type PlacedLayer = 'raids' | 'trains' | 'meetups' | StopLayer;
 
 /**
  * A raid chosen in the list of a gym's raids (`data-show-raid`; empty: "← All raids here"), in
@@ -288,6 +292,11 @@ export interface MapRaids {
   forcedPlaces(layer: 'stops' | 'spots'): boolean;
   /** Whether the raids are drawn: their layer on, or a raid's step 2 picking gyms (C1). */
   raidsShown(): boolean;
+  /**
+   * The PokéStops whose reports are drawn in place of their dot (plan 8M-9B: one marker per stop),
+   * by their keys as `/api/stops` names them.
+   */
+  reportStops(): ReadonlySet<string>;
 }
 
 /**
@@ -354,6 +363,32 @@ export function showParties(
   for (const [id, group] of Object.entries(groups)) {
     if (registry.isOn(id)) group.addTo(map);
   }
+  /**
+   * The parties' list until the first one comes (review F11: the reports at stops are drawn
+   * without it): none of them, reports offered as at the load (`reportOffered`), and the map not
+   * said to be read-only for it.
+   */
+  const noParties: PartiesView = {
+    zone: 'UTC',
+    readOnly: !mayReport,
+    raids: [],
+    maxes: [],
+    trains: [],
+    meetups: [],
+  };
+  /**
+   * The reports at stops (plan 8M-9B): their own poll, drawn with the parties (one hold, one
+   * redraw, one list of the things at a place).
+   */
+  const stopReports = stopReportLayer({
+    map,
+    guild,
+    registry,
+    // Not waiting for the parties' list (review F11): until it comes, drawn with none.
+    redraw: () => {
+      hold.shown(view ?? noParties);
+    },
+  });
   /** The party the Report button's step 3 opened (R2-1), by its popup's key, while it shows. */
   let openedForStep3: string | undefined;
   /** That party is being opened: the parties drawn with it before its popup opens (R3-1). */
@@ -389,6 +424,8 @@ export function showParties(
     }, 0);
   };
   registry.onChange((id) => {
+    // The reports at stops are drawn with the parties (plan 8M-9B): a stop's marker holds both.
+    if ((id === 'research' || id === 'rocket') && view) hold.shown(view);
     const group = (groups as Record<string, L.LayerGroup | undefined>)[id];
     if (!group) return;
     if (layerShown(id)) group.addTo(map);
@@ -928,6 +965,8 @@ export function showParties(
     rendered: () => {
       hold.checkGone();
     },
+    // Not "Nothing is on just now." while the reports at stops are drawn without the parties.
+    partiesKnown: () => view !== undefined && view !== noParties,
     units: frame.units,
     registry,
     storage: frame.storage,
@@ -1192,6 +1231,26 @@ export function showParties(
         });
       }
     }
+    // The reports at stops (plan 8M-9B): a marker per stop with reports of the layers on, its
+    // popup bound as a party's (the card, the held content), the stop whose popup or card is open
+    // kept with its ended reports (B14).
+    const openStop = (key: string | undefined): string[] =>
+      key?.startsWith('stop:') === true ? [key.slice('stop:'.length)] : [];
+    placed.push(
+      ...stopReports.draw({
+        now,
+        size,
+        circles: { full: sizes.raidMiddle, small: sizes.raidSmall },
+        keep: new Set([...openStop(showing.key), ...openStop(card.key)]),
+        interactive,
+        bind: (marker, key, popup) => withPopup(marker, key, popup),
+        tapped: () => false,
+        open: (key, marker) => {
+          openAt(key, marker);
+        },
+        popup: (at) => stopPopup(at),
+      }),
+    );
     // "New train" (or the form or route editor open in its place) for a member who may; a form
     // open there stays whatever the list says, and is shown over the list (plan 8M-7), which
     // comes back when it closes.
@@ -1207,19 +1266,22 @@ export function showParties(
     whatIsOn.show(listLines(next, gyms));
     // The posts of the parties in view, then (after the page's first list, review N6) the rest,
     // asked for ahead, at most `PREFETCH_POSTS` a list (review 8A-3), so that a popup that opens
-    // has its post.
-    const bounds = map.getBounds();
-    const all: MapParty[] = [...next.raids, ...next.maxes, ...next.trains, ...next.meetups];
-    const inView = (party: MapParty): boolean => {
-      const at = placeOf(party);
-      return at !== undefined && bounds.contains([at.lat, at.lon]);
-    };
-    postViews.keepOnly(all);
-    postViews.prefetch(prefetchOrder(all, inView, firstList), PREFETCH_POSTS);
-    firstList = false;
+    // has its post. Not for the reports drawn without the parties (review round 2, R1): the
+    // parties' first list is still to come.
+    if (next !== noParties) {
+      const bounds = map.getBounds();
+      const all: MapParty[] = [...next.raids, ...next.maxes, ...next.trains, ...next.meetups];
+      const inView = (party: MapParty): boolean => {
+        const at = placeOf(party);
+        return at !== undefined && bounds.contains([at.lat, at.lon]);
+      };
+      postViews.keepOnly(all);
+      postViews.prefetch(prefetchOrder(all, inView, firstList), PREFETCH_POSTS);
+      firstList = false;
+    }
     panel.hidden = false;
     map.invalidateSize();
-    const line = readOnlyLine(next.readOnly);
+    const line = readOnlyLine(next !== noParties && next.readOnly);
     readOnly.textContent = line ?? '';
     readOnly.hidden = line === undefined;
     // Drawn under a form of the trains' box: the controls that open another form stay off.
@@ -1679,7 +1741,10 @@ export function showParties(
     // The raids' badges and their last minutes (plan 8M-7), between two lists, by the rules they
     // were drawn by (`markerNow`).
     const zone = readerZone();
-    for (const marker of document.querySelectorAll<HTMLElement>('.raid-marker[data-stage]')) {
+    // A stop's marker with a grunt (plan 8M-9B) by the same rules, by its grunt's end.
+    for (const marker of document.querySelectorAll<HTMLElement>(
+      '.raid-marker[data-stage], .stop-marker[data-stage]',
+    )) {
       const shown = markerNow(marker.dataset, now, zone);
       const badge = marker.querySelector('.badge');
       if (badge) badge.textContent = shown.badge;
@@ -1687,7 +1752,9 @@ export function showParties(
     }
   }, COUNTDOWN_MS);
   void poller.start();
+  stopReports.start();
   return {
+    reportStops: () => stopReports.stops(),
     gymControls: (gym) =>
       reportOffered(mayReport, view)
         ? [raidForms.reportControl(gym), spawnForms.spawnControl(gym), meetupHereControl(gym)]
diff --git a/src/web/client/report-icons.ts b/src/web/client/report-icons.ts
index 787afc0a630e23cb1476a165ecc9555d232fb8d1..7afa9cbb37f7f8ec92aefd82d178448d247a152a 100644
--- a/src/web/client/report-icons.ts
+++ b/src/web/client/report-icons.ts
@@ -9,6 +9,10 @@
  *
  * - Raid: the game's raid icon (`Images/Raids/ic_raid_small.png`, the picture the screenshot
  *   reader's tier heads were matched against).
+ * - Field research (plan 8M-9B, B17): the game's quest symbol (`Images/Quests/QuestSymbol.png`,
+ *   white on clear), as a mask tinted `--research`.
+ * - Team GO Rocket (B17): the game's Team GO Rocket "R" (`Images/Rocket/teamrocket_r.png`), also
+ *   the marker of a stop with a grunt (goal 2).
  * - Wild spawn: the game's Poké Ball (`Images/Items/pokeball_sprite.png`).
  * - Max battle: Pine's own burst, until Matt picks the game's Dynamax icon by hand (it is not in
  *   pogo_assets; the official map's bundle and the Pokémon GO wiki have it, which are never fetched
@@ -25,11 +29,18 @@ export const POGO_ASSETS =
   'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/';
 
 /** What can be reported from the Report button (8M-9B adds research and Team GO Rocket). */
-export type ReportKindId = 'raid' | 'max' | 'spawn' | 'train' | 'meetup';
+export type ReportKindId = 'raid' | 'max' | 'research' | 'rocket' | 'spawn' | 'train' | 'meetup';
 
-/** An icon: a picture by its address, or a drawing of Pine's own (its paths, `currentColor`). */
+/**
+ * An icon: a picture by its address; a picture whose shape is drawn in the color of what it stands
+ * for (`mask`: a CSS mask over `currentColor`, plan 8M-9B, B17: the game's white quest symbol
+ * tinted `--research`; mask pictures are fetched with CORS, which raw.githubusercontent.com
+ * answers with `*`); or a drawing of Pine's own (its paths, `currentColor`).
+ */
 export type ReportIcon =
-  { kind: 'picture'; src: string } | { kind: 'shape'; name: string; paths: readonly string[] };
+  | { kind: 'picture'; src: string }
+  | { kind: 'mask'; name: string; src: string }
+  | { kind: 'shape'; name: string; paths: readonly string[] };
 
 const picture = (path: string): ReportIcon => ({ kind: 'picture', src: `${POGO_ASSETS}${path}` });
 
@@ -40,6 +51,8 @@ export const REPORT_ICONS: Readonly<Record<ReportKindId, ReportIcon>> = {
     name: 'max',
     paths: ['M12 1l2.6 6.1L21 6l-3.6 5.4L22 16l-6.4-.4L12 23l-3.6-7.4L2 16l4.6-4.6L3 6l6.4 1.1z'],
   },
+  research: { kind: 'mask', name: 'research', src: `${POGO_ASSETS}Quests/QuestSymbol.png` },
+  rocket: picture('Rocket/teamrocket_r.png'),
   spawn: picture('Items/pokeball_sprite.png'),
   train: {
     kind: 'shape',
diff --git a/src/web/client/report-menu.ts b/src/web/client/report-menu.ts
index 5222fd4080852dbf7d5e82df1accefa1194787cf..513ada14c71da969f4ad7c6f912e94b4bbf873cc 100644
--- a/src/web/client/report-menu.ts
+++ b/src/web/client/report-menu.ts
@@ -60,17 +60,28 @@ export const REPORT_KINDS: readonly ReportKind[] = [
  * the page draws as SVG (`renderNode` makes HTML elements only).
  */
 export function iconNode(icon: ReportIcon): PageNode {
-  return icon.kind === 'picture'
-    ? {
+  switch (icon.kind) {
+    case 'picture':
+      return {
         tag: 'img',
         className: 'report-icon',
         attributes: { src: icon.src, alt: '', draggable: 'false' },
-      }
-    : {
+      };
+    case 'mask':
+      // The picture's shape in the color of what it stands for (plan 8M-9B, B17): its mask set by
+      // the stylesheet (`.mask-<name>` in `map.css`: no inline style, no script).
+      return {
+        tag: 'span',
+        className: `report-icon mask mask-${icon.name}`,
+        attributes: { 'data-mask': icon.name, 'aria-hidden': 'true' },
+      };
+    case 'shape':
+      return {
         tag: 'span',
         className: `report-icon shape-${icon.name}`,
         attributes: { 'data-shape': icon.name, 'aria-hidden': 'true' },
       };
+  }
 }
 
 /** The menu of step 1: a button per kind with its icon and label, then Cancel. */
diff --git a/src/web/client/report-ui.ts b/src/web/client/report-ui.ts
index 20ed0c3f6eb2672d2b3e2519a2c4c373298bca41..3ff742bcd237eb1108fe63d06bb8f85f111cf151 100644
--- a/src/web/client/report-ui.ts
+++ b/src/web/client/report-ui.ts
@@ -442,7 +442,10 @@ function shapeOf(icon: Extract<ReportIcon, { kind: 'shape' }>): SVGSVGElement {
   return svg;
 }
 
-/** Draws Pine's own icons into their places (`data-shape`) under `root`. */
+/**
+ * Draws Pine's own icons into their places (`data-shape`) under `root`. The game's pictures drawn
+ * as masks (plan 8M-9B) take theirs from the stylesheet (`map.css`, review F5).
+ */
 export function drawShapes(root: ParentNode): void {
   for (const place of root.querySelectorAll<HTMLElement>('[data-shape]')) {
     const icon = REPORT_ICONS[place.dataset.shape as ReportKindId] as ReportIcon | undefined;
diff --git a/src/web/client/stop-popup.ts b/src/web/client/stop-popup.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a85406ca4e1ec4bf9be2ed5bac83537105dedb7b
--- /dev/null
+++ b/src/web/client/stop-popup.ts
@@ -0,0 +1,28 @@
+import type { PageNode } from './popup.js';
+import type { StopReports } from './stop-reports.js';
+
+/*
+ * A stop's popup and phone card on the live map (plan 8M-9B, goal 3), as a tree of nodes
+ * (`renderNode`: every text as text).
+ */
+
+/** A stop's popup: its name, then what was reported there. */
+export function stopPopup(at: StopReports): PageNode {
+  return {
+    tag: 'div',
+    className: 'stop-popup',
+    children: [
+      { tag: 'strong', className: 'name', text: at.stop.name },
+      ...at.research.map((report): PageNode => ({
+        tag: 'div',
+        className: 'report',
+        text: report.text,
+      })),
+      ...[...at.grunts, ...at.hideouts].map((report): PageNode => ({
+        tag: 'div',
+        className: 'report',
+        text: report.name,
+      })),
+    ],
+  };
+}
diff --git a/src/web/client/stop-report-cases.ts b/src/web/client/stop-report-cases.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1aacbc664193031161fc559a6430b15656082f3f
--- /dev/null
+++ b/src/web/client/stop-report-cases.ts
@@ -0,0 +1,217 @@
+import type {
+  MapGrunt,
+  MapHideout,
+  MapResearch,
+  MapReward,
+  ResearchOptionsView,
+  RocketOptionsView,
+  StopReportsView,
+} from '../../domain/web/stop-report-data.js';
+
+/*
+ * Reports at stops as `/api/stop-reports` and the pick lists give them (plan 8M-9B), for the tests
+ * of the page's pure parts (the page's own type check cannot take `test/support/`). The page never
+ * imports it.
+ */
+
+export const CASE_ZONE = 'America/New_York';
+/** Tuesday 27 October 2026, 14:00 in New York. */
+export const CASE_NOW = Date.UTC(2026, 9, 27, 18);
+const MINUTE = 60_000;
+export const CASE_ICONS = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';
+
+/** Stop `n`: `stop-<n>`, a little north of the one before. */
+export const caseStop = (n: number) => ({
+  key: `stop-${String(n)}`,
+  name: `Yellow Mural ${String(n)}`,
+  address: 'Market Street',
+  lat: 40.44 + n * 0.001,
+  lon: -79.95,
+});
+
+/** Brock's Dragon task at stop `n`, for the rest of the day, Dratini. */
+export const caseResearch = (n: number, more: Partial<MapResearch> = {}): MapResearch => ({
+  id: n,
+  stop: caseStop(n),
+  madeAt: CASE_NOW - 30 * MINUTE,
+  endsAt: CASE_NOW + 10 * 60 * MINUTE,
+  reporter: 'Brock',
+  mayTakeBack: false,
+  task: `dragon:${String(n)}`,
+  text: 'Catch a Dragon-type Pokémon',
+  category: 'Catching',
+  typed: false,
+  oneOf: false,
+  rewards: [
+    {
+      kind: 'encounter',
+      name: 'Dratini',
+      value: 'pokemon:dratini',
+      quantity: 0,
+      shiny: true,
+      image: `${CASE_ICONS}pm147.icon.png`,
+    },
+  ],
+  rewardText: 'Dratini',
+  picture: `${CASE_ICONS}pm147.icon.png`,
+  ...more,
+});
+
+/** Misty's Water-type grunt (the Magikarp lineup) at stop `n`, 25 minutes left. */
+export const caseGrunt = (n: number, more: Partial<MapGrunt> = {}): MapGrunt => ({
+  id: 100 + n,
+  stop: caseStop(n),
+  madeAt: CASE_NOW - 5 * MINUTE,
+  endsAt: CASE_NOW + 25 * MINUTE,
+  reporter: 'Misty',
+  mayTakeBack: true,
+  who: 'grunt:water:male',
+  typeKey: 'grunt:water',
+  name: 'Water-type grunt',
+  catches: [
+    {
+      kind: 'encounter',
+      name: 'Magikarp',
+      value: 'pokemon:magikarp',
+      quantity: 0,
+      shiny: true,
+      image: `${CASE_ICONS}pm129.icon.png`,
+    },
+  ],
+  lineup: 'Magikarp, Feebas',
+  picture: `${CASE_ICONS}pm129.icon.png`,
+  ...more,
+});
+
+/** Brock's Arlo at stop `n`, for the day. */
+export const caseHideout = (n: number, more: Partial<MapHideout> = {}): MapHideout => ({
+  id: 200 + n,
+  stop: caseStop(n),
+  madeAt: CASE_NOW - 60 * MINUTE,
+  endsAt: CASE_NOW + 9 * 60 * MINUTE,
+  reporter: 'Brock',
+  mayTakeBack: false,
+  who: 'leader:arlo',
+  name: 'Arlo',
+  catches: [
+    {
+      kind: 'encounter',
+      name: 'Mudkip',
+      value: 'pokemon:mudkip',
+      quantity: 0,
+      shiny: false,
+      image: `${CASE_ICONS}pm258.icon.png`,
+    },
+  ],
+  picture: 'https://map.example.test/pictures/arlo.png',
+  ...more,
+});
+
+/** A view of the reports, none unless given. */
+export const caseView = (more: Partial<StopReportsView> = {}): StopReportsView => ({
+  zone: CASE_ZONE,
+  event: null,
+  research: [],
+  waiting: null,
+  grunts: [],
+  hideouts: [],
+  ...more,
+});
+
+const DRATINI = caseResearch(1).rewards[0]!;
+const BAGON: MapReward = {
+  kind: 'encounter',
+  name: 'Bagon',
+  value: 'pokemon:bagon',
+  quantity: 0,
+  shiny: true,
+  image: `${CASE_ICONS}pm371.icon.png`,
+};
+const RARE_CANDY: MapReward = {
+  kind: 'item',
+  name: 'Rare Candy',
+  value: 'item:rare-candy',
+  quantity: 3,
+  shiny: false,
+  image: 'https://cdn.leekduck.com/assets/img/items/Rare%20Candy.png',
+};
+
+/** The pick lists of a research report: the Dragon task of three versions, Spin of one. */
+export const caseResearchOptions = (
+  more: Partial<ResearchOptionsView> = {},
+): ResearchOptionsView => ({
+  stale: false,
+  readAt: CASE_NOW - 60 * MINUTE,
+  tasks: [
+    {
+      key: 'dragon',
+      text: 'Catch a Dragon-type Pokémon',
+      category: 'Catching',
+      rewards: [DRATINI, BAGON],
+      versions: [
+        { value: 'dragon:aaaa1111', label: 'Dratini', oneOf: false, rewards: [DRATINI] },
+        { value: 'dragon:bbbb2222', label: 'Bagon', oneOf: false, rewards: [BAGON] },
+        {
+          value: 'dragon',
+          label: 'one of Dratini, Bagon',
+          oneOf: true,
+          rewards: [DRATINI, BAGON],
+        },
+      ],
+    },
+    {
+      key: 'spin',
+      text: 'Spin 3 PokéStops',
+      category: 'Exploring',
+      rewards: [RARE_CANDY],
+      versions: [
+        { value: 'spin:cccc3333', label: 'Rare Candy ×3', oneOf: false, rewards: [RARE_CANDY] },
+      ],
+    },
+  ],
+  rewards: [
+    { value: 'item:rare-candy', name: 'Rare Candy' },
+    { value: 'item:stardust', name: 'Stardust' },
+  ],
+  ...more,
+});
+
+/** The pick list of a Rocket report: the water grunts of two lineups, Arlo, Giovanni. */
+export const caseRocketOptions = (more: Partial<RocketOptionsView> = {}): RocketOptionsView => ({
+  stale: false,
+  readAt: CASE_NOW - 60 * MINUTE,
+  choices: [
+    {
+      key: 'grunt:water',
+      name: 'Water-type grunt',
+      hideout: false,
+      catches: [caseGrunt(1).catches[0]!, caseHideout(1).catches[0]!],
+      lineups: [
+        {
+          key: 'grunt:water:female',
+          value: 'grunt:water:female#f1',
+          label: 'Mudkip, Tentacool, Krabby',
+          fingerprint: 'f1',
+          catches: [caseHideout(1).catches[0]!],
+        },
+        {
+          key: 'grunt:water:male',
+          value: 'grunt:water:male#m1',
+          label: 'Magikarp, Feebas',
+          fingerprint: 'm1',
+          catches: [caseGrunt(1).catches[0]!],
+        },
+      ],
+    },
+    { key: 'grunt:fire', name: 'Fire-type grunt', hideout: false, catches: [] },
+    { key: 'leader:arlo', name: 'Arlo', hideout: true, catches: caseHideout(1).catches },
+    {
+      key: 'giovanni',
+      name: 'Giovanni',
+      hideout: true,
+      catches: [],
+      note: 'Report Giovanni only when you are sure.',
+    },
+  ],
+  ...more,
+});
diff --git a/src/web/client/stop-report-layer.ts b/src/web/client/stop-report-layer.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4bdcbea3d5668ef3fff604a0d6f786837c3af307
--- /dev/null
+++ b/src/web/client/stop-report-layer.ts
@@ -0,0 +1,205 @@
+import * as L from 'leaflet';
+import type { StopReportsView } from '../../domain/web/stop-report-data.js';
+import type { LayerRegistry } from './layer-registry.js';
+import { Poller } from './parties.js';
+import { renderNode, type PageNode } from './popup.js';
+import { tapBox, type MarkerSize } from './raid-marker.js';
+import { drawShapes } from './report-ui.js';
+import type { PlacedThing } from './shared-place.js';
+import {
+  nextEnd,
+  reportsAtStops,
+  reportsInView,
+  stopMarkerNode,
+  stopPlaced,
+  stopPopupKey,
+  type StopLayer,
+  type StopPick,
+  type StopReports,
+} from './stop-reports.js';
+
+/*
+ * The reports at stops of the live map in the page (plan 8M-9B): `/api/stop-reports` asked as the
+ * parties are (`Poller`: every 20 seconds while the page is visible, at once after a report or a
+ * take-back from this page, stopped by a 401 or 403, drawn only when its JSON changed; the browser
+ * revalidates it by its ETag), each stop with reports a marker of ours (`stopMarkerNode`) drawn
+ * with the parties (`draw`, inside their draw: one hold, one redraw, one list of things at a
+ * place), its popup bound by the parties' `withPopup` (the phone card, the held content), its tap
+ * the parties' (`open`: the list of the things at its place where it shares it, B3). A report
+ * drops at its end without waiting for the poll: the parties are drawn anew at the next end.
+ */
+
+const EVERY_MS = 20_000;
+/** The longest delay `setTimeout` takes. */
+const MAX_TIMER_MS = 2 ** 31 - 1;
+
+export interface StopReportLayerDeps {
+  map: L.Map;
+  guild: string;
+  registry: LayerRegistry;
+  /** Draws the parties anew, through their hold (not under a form being filled in). */
+  redraw(): void;
+}
+
+/** What a draw of the reports needs of the parties' draw. */
+export interface StopDraw {
+  now: number;
+  size: MarkerSize;
+  /** The circle of a full marker and of a small one, in pixels (`theme.css`). */
+  circles: { full: number; small: number };
+  /** The stops whose popup or card is open: their reports stay past their end (B14). */
+  keep: ReadonlySet<string>;
+  /** Whether the markers take taps (not while route mode or a meetup's place lets them through). */
+  interactive: boolean;
+  /** Whether a report passes the filters; all where none is given. */
+  shows?: StopPick['shows'];
+  /** Binds the stop's popup (`withPopup`) under its key. */
+  bind(marker: L.Marker, key: string, popup: () => PageNode): L.Marker;
+  /** A tap taken before its popup (the Report button's step 2, a form's picking): true takes it. */
+  tapped(at: StopReports): boolean;
+  /** Opens what a tap on the marker opens (`openAt`: the list where it shares its place). */
+  open(key: string, marker: L.Marker): void;
+  /** The popup of a stop with reports. */
+  popup(at: StopReports): PageNode;
+}
+
+export function stopReportLayer(deps: StopReportLayerDeps) {
+  const { map, guild, registry } = deps;
+  const group = L.layerGroup().addTo(map);
+  let view: StopReportsView | undefined;
+  let shown = '';
+  /** The stops drawn last, for the counts in view and the PokéStops left out under them. */
+  let drawn: StopReports[] = [];
+  let timer: number | undefined;
+
+  const poller = new Poller({
+    everyMs: EVERY_MS,
+    visible: () => document.visibilityState === 'visible',
+    setTimer: (run, ms) => {
+      const handle = window.setTimeout(run, ms);
+      return () => {
+        window.clearTimeout(handle);
+      };
+    },
+    load: async () => {
+      try {
+        // The browser asks again with the ETag it has; a 304 gives the body it kept.
+        const answer = await fetch(`/s/${guild}/api/stop-reports`, { credentials: 'same-origin' });
+        if (answer.status === 401 || answer.status === 403) return 'stop';
+        // 503 (Discord cannot say who the member is just now) and the rest: asked again later.
+        if (!answer.ok) return 'go';
+        const text = await answer.text();
+        if (text !== shown) {
+          shown = text;
+          view = JSON.parse(text) as StopReportsView;
+          deps.redraw();
+        }
+      } catch {
+        // Offline for a moment: the next turn asks again.
+      }
+      return 'go';
+    },
+  });
+  document.addEventListener('visibilitychange', () => {
+    poller.visibilityChanged();
+  });
+
+  /** The parties drawn anew at the next end of a report (B14), once. */
+  const atNextEnd = (now: number): void => {
+    if (timer !== undefined) window.clearTimeout(timer);
+    timer = undefined;
+    const end = nextEnd(view, now);
+    if (end === undefined) return;
+    timer = window.setTimeout(
+      () => {
+        timer = undefined;
+        deps.redraw();
+      },
+      Math.min(end - now + 1_000, MAX_TIMER_MS),
+    );
+  };
+
+  const counted = (): void => {
+    const bounds = map.getBounds();
+    const counts = reportsInView(drawn, (point) => bounds.contains([point.lat, point.lon]));
+    for (const layer of ['research', 'rocket'] as const) registry.setCount(layer, counts[layer]);
+  };
+  map.on('moveend', counted);
+
+  return {
+    /** The reports as the last answer gave them. */
+    get view(): StopReportsView | undefined {
+      return view;
+    },
+
+    start(): void {
+      void poller.start();
+    },
+
+    /** Asks at once (after a report or a take-back from this page). */
+    now: (): Promise<void> => poller.now(),
+
+    /** The reports of the layers on, as the parties' draw shows them. */
+    reports(pick: Omit<StopPick, 'on'>): StopReports[] {
+      return reportsAtStops(view, { ...pick, on: (layer: StopLayer) => registry.isOn(layer) });
+    },
+
+    /**
+     * Draws a marker per stop with reports of the layers on (inside the parties' draw); gives the
+     * things it placed, for the list of the things at one place.
+     */
+    draw(how: StopDraw): Array<PlacedThing & { layer: StopLayer }> {
+      group.clearLayers();
+      drawn = reportsAtStops(view, {
+        on: (layer) => registry.isOn(layer),
+        now: how.now,
+        keep: how.keep,
+        ...(how.shows === undefined ? {} : { shows: how.shows }),
+      });
+      const circle = how.size === 'full' ? how.circles.full : how.circles.small;
+      const placed = drawn.map((at) => {
+        const key = stopPopupKey(at.stop.key);
+        const element = renderNode(stopMarkerNode(at, how.now, how.size), document);
+        drawShapes(element);
+        const box = tapBox(circle);
+        const marker: L.Marker = L.marker([at.stop.lat, at.stop.lon], {
+          icon: L.divIcon({
+            html: element,
+            className: 'stop-icon',
+            iconSize: [box, box],
+            iconAnchor: [box / 2, box / 2],
+            popupAnchor: [0, -circle / 2],
+          }),
+          keyboard: how.interactive,
+          interactive: how.interactive,
+          // Named for a screen reader by its stop, as Leaflet sets it: as text.
+          title: at.stop.name,
+        });
+        how.bind(marker, key, () => how.popup(at));
+        // Opened by our own handler (`gymClicks` of the parties): a tap the Report button's step 2
+        // or a form takes is not a popup.
+        marker.off('click').off('keypress');
+        const clicked = (event: L.LeafletEvent): void => {
+          L.DomEvent.stop(event);
+          if (!how.tapped(at)) how.open(key, marker);
+        };
+        marker.on('click', clicked);
+        marker.on('keypress', (event: L.LeafletKeyboardEvent) => {
+          if (event.originalEvent.key === 'Enter') clicked(event);
+        });
+        marker.addTo(group);
+        return stopPlaced(at, how.now);
+      });
+      counted();
+      atNextEnd(how.now);
+      return placed;
+    },
+
+    /** The stops whose marker is drawn: their plain PokéStop dot is left out (`occupied`). */
+    stops(): ReadonlySet<string> {
+      return new Set(drawn.map((at) => at.stop.key));
+    },
+  };
+}
+
+export type StopReportLayer = ReturnType<typeof stopReportLayer>;
diff --git a/src/web/client/stop-reports.test.ts b/src/web/client/stop-reports.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..60b602f5dd7d5d2c3def28cd50185370849beba6
--- /dev/null
+++ b/src/web/client/stop-reports.test.ts
@@ -0,0 +1,167 @@
+import { describe, expect, it } from 'vitest';
+import type { PageNode } from './popup.js';
+import {
+  CASE_ICONS as ICONS,
+  CASE_NOW as NOW,
+  caseGrunt as grunt,
+  caseHideout as hideout,
+  caseResearch as research,
+  caseView as view,
+} from './stop-report-cases.js';
+import {
+  nextEnd,
+  reportsAtStops,
+  reportsInView,
+  stopMarkerFacts,
+  stopMarkerNode,
+  stopPlaced,
+} from './stop-reports.js';
+
+const MINUTE = 60_000;
+const everything = { on: () => true, now: NOW };
+
+/** Every class name of a tree. */
+const classes = (node: PageNode): string[] => [
+  ...(node.className === undefined ? [] : node.className.split(' ')),
+  ...(node.children ?? []).flatMap(classes),
+];
+
+describe('the reports at stops on the map (plan 8M-9B)', () => {
+  it('gathers every report shown at a stop into one, for the layers on', () => {
+    const at = reportsAtStops(
+      view({ research: [research(1), research(2)], grunts: [grunt(1)], hideouts: [hideout(3)] }),
+      everything,
+    );
+    expect(
+      at.map((one) => [one.stop.key, one.research.length, one.grunts.length, one.hideouts.length]),
+    ).toEqual([
+      ['stop-1', 1, 1, 0],
+      ['stop-2', 1, 0, 0],
+      ['stop-3', 0, 0, 1],
+    ]);
+    const rocketOff = reportsAtStops(
+      view({ research: [research(1)], grunts: [grunt(1)], hideouts: [hideout(3)] }),
+      { on: (layer) => layer === 'research', now: NOW },
+    );
+    expect(rocketOff.map((one) => [one.stop.key, one.grunts.length])).toEqual([['stop-1', 0]]);
+    expect(reportsAtStops(undefined, everything)).toEqual([]);
+  });
+
+  it('drops a report at its end without waiting for the list, but keeps the stop that is open', () => {
+    const ended = grunt(1, { endsAt: NOW - 1 });
+    expect(reportsAtStops(view({ grunts: [ended] }), everything)).toEqual([]);
+    const kept = reportsAtStops(view({ grunts: [ended] }), {
+      ...everything,
+      keep: new Set(['stop-1']),
+    });
+    expect(kept.map((one) => one.grunts.length)).toEqual([1]);
+    // The next end to drop one at, of what has not ended.
+    expect(nextEnd(view({ research: [research(1)], grunts: [grunt(2), ended] }), NOW)).toBe(
+      NOW + 25 * MINUTE,
+    );
+    expect(nextEnd(view(), NOW)).toBeUndefined();
+  });
+
+  it('leaves out what a filter hides', () => {
+    const at = reportsAtStops(view({ research: [research(1)], grunts: [grunt(1), grunt(2)] }), {
+      ...everything,
+      shows: (report) => report.id !== 101,
+    });
+    expect(at.map((one) => [one.stop.key, one.grunts.map((each) => each.id)])).toEqual([
+      ['stop-1', []],
+      ['stop-2', [102]],
+    ]);
+  });
+
+  it('pictures a stop by a hideout’s picture, else the research’s, else the Rocket icon', () => {
+    const [both] = reportsAtStops(
+      view({ research: [research(1)], hideouts: [hideout(1)] }),
+      everything,
+    );
+    expect(stopMarkerFacts(both!, NOW).picture).toEqual({
+      kind: 'picture',
+      src: 'https://map.example.test/pictures/arlo.png',
+    });
+    const [task] = reportsAtStops(
+      view({ research: [research(1)], grunts: [grunt(1)] }),
+      everything,
+    );
+    expect(stopMarkerFacts(task!, NOW).picture).toEqual({
+      kind: 'picture',
+      src: `${ICONS}pm147.icon.png`,
+    });
+    const [rocket] = reportsAtStops(view({ grunts: [grunt(1)] }), everything);
+    expect(stopMarkerFacts(rocket!, NOW).picture).toEqual({ kind: 'icon', icon: 'rocket' });
+    // A typed task without its reward has no picture: the research icon.
+    const [typed] = reportsAtStops(
+      view({ research: [research(1, { picture: undefined, rewards: [], typed: true })] }),
+      everything,
+    );
+    expect(stopMarkerFacts(typed!, NOW).picture).toEqual({ kind: 'icon', icon: 'research' });
+  });
+
+  it('rings a stop by its layers, both when it has both, with a grunt’s minutes and last minutes', () => {
+    const [both] = reportsAtStops(
+      view({ research: [research(1)], grunts: [grunt(1)] }),
+      everything,
+    );
+    const facts = stopMarkerFacts(both!, NOW);
+    expect(facts.ring).toBe('both');
+    expect(facts.end).toBe(NOW + 25 * MINUTE);
+    expect(facts.badge).toBe('25m');
+    expect(facts.dimmed).toBe(false);
+    const [soon] = reportsAtStops(
+      view({ grunts: [grunt(1, { endsAt: NOW + 4 * MINUTE })] }),
+      everything,
+    );
+    expect(stopMarkerFacts(soon!, NOW)).toMatchObject({
+      ring: 'rocket',
+      badge: '4m',
+      dimmed: true,
+    });
+    const [task] = reportsAtStops(view({ research: [research(1)] }), everything);
+    expect(stopMarkerFacts(task!, NOW)).toMatchObject({ ring: 'research' });
+    expect(stopMarkerFacts(task!, NOW).badge).toBeUndefined();
+  });
+
+  it('draws a stop’s marker as a circle of ours, a grunt’s end on it for the page to keep current', () => {
+    const [both] = reportsAtStops(
+      view({ research: [research(1)], grunts: [grunt(1)] }),
+      everything,
+    );
+    const node = stopMarkerNode(both!, NOW, 'full');
+    expect(classes(node)).toEqual(expect.arrayContaining(['stop-marker', 'both', 'ring', 'badge']));
+    expect(node.attributes).toMatchObject({
+      'data-stage': 'hatched',
+      'data-end': String(NOW + 25 * MINUTE),
+    });
+    // Zoomed out, no badge.
+    expect(classes(stopMarkerNode(both!, NOW, 'small'))).not.toContain('badge');
+    const [rocket] = reportsAtStops(view({ grunts: [grunt(2)] }), everything);
+    expect(JSON.stringify(stopMarkerNode(rocket!, NOW, 'full'))).toContain('teamrocket_r.png');
+    const [task] = reportsAtStops(view({ research: [research(3)] }), everything);
+    expect(stopMarkerNode(task!, NOW, 'full').attributes).not.toHaveProperty('data-end');
+  });
+
+  it('names a stop in the list of things at one place by its name and what it has', () => {
+    const [both] = reportsAtStops(
+      view({ research: [research(1)], grunts: [grunt(1)], hideouts: [] }),
+      everything,
+    );
+    expect(stopPlaced(both!, NOW)).toMatchObject({
+      key: 'stop:stop-1',
+      gymId: null,
+      name: 'Yellow Mural 1',
+      time: 'Field research · Water-type grunt 25m',
+      picture: `${ICONS}pm147.icon.png`,
+    });
+  });
+
+  it('counts the reports in view by layer, for the sheet of the layers', () => {
+    const at = reportsAtStops(
+      view({ research: [research(1), research(5)], grunts: [grunt(1)], hideouts: [hideout(1)] }),
+      everything,
+    );
+    expect(reportsInView(at, (point) => point.lat < 40.443)).toEqual({ research: 1, rocket: 2 });
+  });
+});
diff --git a/src/web/client/stop-reports.ts b/src/web/client/stop-reports.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cfa4540f8787415ffeff78ba6ba02d4d65a7ca3d
--- /dev/null
+++ b/src/web/client/stop-reports.ts
@@ -0,0 +1,212 @@
+import type {
+  MapGrunt,
+  MapHideout,
+  MapResearch,
+  MapStop,
+  StopReportsView,
+} from '../../domain/web/stop-report-data.js';
+import type { PageNode } from './popup.js';
+import { badgeWords, isDimmed, type MarkerSize } from './raid-marker.js';
+import { iconNode } from './report-menu.js';
+import { REPORT_ICONS } from './report-icons.js';
+import type { PlacedThing } from './shared-place.js';
+import type { LatLon } from './view.js';
+
+/*
+ * The reports at stops on the live map (plan 8M-9B; design "Markers"): two live layers, Field
+ * research and Team GO Rocket, from `/api/stop-reports`; one marker per stop holding every report
+ * shown there (research, a grunt, a hideout), a plain circle centered on the stop, never
+ * clustered. Its picture a hideout's, else the research's (its reward line's in the post: the one
+ * reward's, the encounter picture for "one of"), else the Rocket icon for a grunt (B2), the
+ * research icon for a typed task without its reward; its ring of `--research` or `--rocket`, half
+ * and half where it has both; a grunt's minutes left as a raid's badge, dimmed in its last five
+ * minutes by the raids' rule (`isDimmed`, the domain's `endsSoon`). A report drops at its end
+ * without waiting for the list, but at the stop whose popup or card is open, which says "Ended"
+ * (B14). The pure part; `stop-report-layer.ts` draws it.
+ */
+
+/** The two layers of the reports at stops (their ids in `MAP_LAYERS`). */
+export type StopLayer = 'research' | 'rocket';
+
+/** A report of either layer. */
+export type StopReport = MapResearch | MapGrunt | MapHideout;
+
+/** What is shown at a stop: its snapshot and its reports by kind, in the list's order. */
+export interface StopReports {
+  stop: MapStop;
+  research: MapResearch[];
+  grunts: MapGrunt[];
+  hideouts: MapHideout[];
+}
+
+/** How the reports are picked: the layers on, the clock, the stops kept open, a filter. */
+export interface StopPick {
+  on(layer: StopLayer): boolean;
+  now: number;
+  /** The stops whose popup or card is open: their reports stay past their end (B14). */
+  keep?: ReadonlySet<string>;
+  /** Whether a report passes the filters (plan 8M-9B, goal 5); all where none is given. */
+  shows?(report: StopReport, layer: StopLayer): boolean;
+}
+
+/** A stop's popup key on the map (`stop:<key>`), as the parties' are `gym:<id>`. */
+export const stopPopupKey = (stopKey: string): string => `stop:${stopKey}`;
+
+/** The reports of the view shown now, gathered by stop in the order the view lists them. */
+export function reportsAtStops(view: StopReportsView | undefined, pick: StopPick): StopReports[] {
+  if (!view) return [];
+  const byStop = new Map<string, StopReports>();
+  const at = (stop: MapStop): StopReports => {
+    let found = byStop.get(stop.key);
+    if (!found) {
+      found = { stop, research: [], grunts: [], hideouts: [] };
+      byStop.set(stop.key, found);
+    }
+    return found;
+  };
+  const shown = (report: StopReport, layer: StopLayer): boolean =>
+    pick.on(layer) &&
+    (report.endsAt > pick.now || pick.keep?.has(report.stop.key) === true) &&
+    (pick.shows?.(report, layer) ?? true);
+  // Every stop that has a report shown (of a layer on, not ended or kept, passing the filters) is
+  // placed, in the view's order; a stop whose reports a filter hides all is not.
+  for (const report of view.research)
+    if (shown(report, 'research')) at(report.stop).research.push(report);
+  for (const report of view.grunts)
+    if (shown(report, 'rocket')) at(report.stop).grunts.push(report);
+  for (const report of view.hideouts) {
+    if (shown(report, 'rocket')) at(report.stop).hideouts.push(report);
+  }
+  return [...byStop.values()];
+}
+
+/** The soonest end still to come of the view's reports: when to draw them anew (B14). */
+export function nextEnd(view: StopReportsView | undefined, now: number): number | undefined {
+  if (!view) return undefined;
+  const ends = [...view.research, ...view.grunts, ...view.hideouts]
+    .map((report) => report.endsAt)
+    .filter((end) => end > now);
+  return ends.length === 0 ? undefined : Math.min(...ends);
+}
+
+/** A stop marker's picture: one of the server's, or an icon of the Report menu's. */
+export type StopPicture = { kind: 'picture'; src: string } | { kind: 'icon'; icon: StopLayer };
+
+/** What a stop's marker is drawn from. */
+export interface StopMarkerFacts {
+  picture: StopPicture;
+  ring: StopLayer | 'both';
+  /** The soonest grunt's end: its badge and its last minutes; none without a grunt. */
+  end?: number;
+  /** A grunt's minutes left (`12m`), as a raid's badge says them. */
+  badge?: string;
+  dimmed: boolean;
+}
+
+/** The soonest-ending grunt at a stop, if any. */
+function soonestGrunt(at: StopReports): MapGrunt | undefined {
+  return [...at.grunts].sort((a, b) => a.endsAt - b.endsAt)[0];
+}
+
+/**
+ * A stop's marker facts (goal 2, B2): its picture (a hideout's, else the research's, else the
+ * Rocket icon for a grunt; the research icon for research without a picture), its ring, and a
+ * grunt's minutes and last minutes as a raid's (`badgeWords`, `isDimmed`).
+ */
+export function stopMarkerFacts(at: StopReports, now: number): StopMarkerFacts {
+  const hideoutPicture = at.hideouts.find((one) => one.picture !== undefined)?.picture;
+  const researchPicture = at.research.find((one) => one.picture !== undefined)?.picture;
+  const src = hideoutPicture ?? researchPicture;
+  const picture: StopPicture =
+    src !== undefined
+      ? { kind: 'picture', src }
+      : { kind: 'icon', icon: at.research.length > 0 ? 'research' : 'rocket' };
+  const rocket = at.grunts.length + at.hideouts.length > 0;
+  const research = at.research.length > 0;
+  const grunt = soonestGrunt(at);
+  return {
+    picture,
+    ring: research && rocket ? 'both' : research ? 'research' : 'rocket',
+    ...(grunt === undefined
+      ? {}
+      : {
+          end: grunt.endsAt,
+          badge: badgeWords('end', grunt.endsAt, now, 'UTC'),
+        }),
+    dimmed:
+      grunt !== undefined &&
+      isDimmed({ stage: 'hatched', hatchTime: null, endTime: grunt.endsAt }, now),
+  };
+}
+
+/** A marker's picture as nodes: the server's picture, or the icon of the Report menu. */
+export function stopPictureNode(picture: StopPicture): PageNode {
+  return picture.kind === 'picture'
+    ? { tag: 'img', attributes: { src: picture.src, alt: '', draggable: 'false' } }
+    : iconNode(REPORT_ICONS[picture.icon]);
+}
+
+/**
+ * A stop's marker as a tree of nodes: a circle of ours with its picture in the ring of its layers
+ * (`map.css`), a grunt's minutes under it from zoom 15 (`markerSize` 'full'), dimmed in its last
+ * minutes. A grunt's end is on it (`data-stage`, `data-end`) for the page to keep the badge and
+ * the dimming current between two lists, as a raid's (`markerNow`).
+ */
+export function stopMarkerNode(at: StopReports, now: number, size: MarkerSize): PageNode {
+  const facts = stopMarkerFacts(at, now);
+  const small = size === 'full' ? '' : ' size-small';
+  return {
+    tag: 'div',
+    className: `stop-marker ${facts.ring}${small}${facts.dimmed ? ' dim' : ''}`,
+    attributes:
+      facts.end === undefined ? {} : { 'data-stage': 'hatched', 'data-end': String(facts.end) },
+    children: [
+      { tag: 'span', className: 'ring', children: [stopPictureNode(facts.picture)] },
+      ...(facts.badge !== undefined && size === 'full'
+        ? [{ tag: 'span', className: 'badge', text: facts.badge }]
+        : []),
+    ],
+  };
+}
+
+/** A grunt's or hideout's words in the list of things at one place: `Water-type grunt 25m`. */
+function rocketWords(at: StopReports, now: number): string[] {
+  return [
+    ...at.grunts.map((grunt) => `${grunt.name} ${badgeWords('end', grunt.endsAt, now, 'UTC')}`),
+    ...at.hideouts.map((hideout) => hideout.name),
+  ];
+}
+
+/**
+ * A stop as the list of things at one place names it (B3: a report and a party at one stop, one
+ * tap lists both): its popup's key, its place, its picture, its name, and what it has.
+ */
+export function stopPlaced(at: StopReports, now: number): PlacedThing & { layer: StopLayer } {
+  const facts = stopMarkerFacts(at, now);
+  return {
+    key: stopPopupKey(at.stop.key),
+    layer: at.research.length > 0 ? 'research' : 'rocket',
+    gymId: null,
+    lat: at.stop.lat,
+    lon: at.stop.lon,
+    picture: facts.picture.kind === 'picture' ? facts.picture.src : null,
+    name: at.stop.name,
+    time: [...(at.research.length > 0 ? ['Field research'] : []), ...rocketWords(at, now)].join(
+      ' · ',
+    ),
+  };
+}
+
+/** How many reports of each layer are at stops in view (`inView`), for the sheet of the layers. */
+export function reportsInView(
+  stops: readonly StopReports[],
+  inView: (point: LatLon) => boolean,
+): Record<StopLayer, number> {
+  const counts = { research: 0, rocket: 0 };
+  for (const at of stops) {
+    if (!inView(at.stop)) continue;
+    counts.research += at.research.length;
+    counts.rocket += at.grunts.length + at.hideouts.length;
+  }
+  return counts;
+}
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index b762ca2e13c6c24f748e20cf703485e9e6db98a5..e5889fbc5fab06a3c53a69fcb010b2247d67f37a 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -90,6 +90,9 @@
   --train: #d35400;
   --meetup: #8e44ad;
   --stop: #2980b9;
+  /* The reports at stops (plan 8M-9B): a marker's ring and the layers' dots, the research icon. */
+  --research: #d68910;
+  --rocket: #a93226;
   /* The ring of a raid's marker, by tier group (plan 8M-7), and its count of those going. */
   --tier-1: #e0609c;
   --tier-3: #d79b00;
@@ -209,6 +212,8 @@
     --train: #e67e22;
     --meetup: #b065d0;
     --stop: #5b9cf6;
+    --research: #f5b041;
+    --rocket: #f1948a;
     --tier-1: #f07ab3;
     --tier-3: #f1c40f;
     --tier-5: #b06ad0;
diff --git a/src/web/phone-header.test.ts b/src/web/phone-header.test.ts
index d83e4bf76bdace8973f0f7942f5b8b7a39811794..1ab68dd18db13aa4e14e2451118c887a0708966d 100644
--- a/src/web/phone-header.test.ts
+++ b/src/web/phone-header.test.ts
@@ -77,6 +77,47 @@ describe("the header's login on a phone (8M-7 review fix 4)", () => {
   });
 });
 
+/** Whether a media query of the stylesheet's (widths only) holds at a window this wide. */
+function holds(media: string, width: number): boolean {
+  return media.split(' and ').every((part) => {
+    const found = /\((min|max)-width: (\d+)px\)/u.exec(part);
+    if (!found) return false;
+    const limit = Number(found[2]);
+    return found[1] === 'min' ? width >= limit : width <= limit;
+  });
+}
+
+/** What the rules say of a property for a selector at a window this wide, the last winning. */
+function shownAt(rules: Rule[], selector: string, property: string, width: number) {
+  let value: string | undefined;
+  for (const rule of rules) {
+    if (rule.media !== undefined && !holds(rule.media, width)) continue;
+    if (!rule.selectors.includes(selector)) continue;
+    value = rule.declarations.get(property) ?? value;
+  }
+  return value;
+}
+
+// Plan 8M-9B (B7, provisional): five live toggles need the room of 1024 pixels.
+describe("the layers' controls by the window's width", () => {
+  const rules = rulesOf(
+    readFileSync(path.resolve(import.meta.dirname, 'client', 'map.css'), 'utf8'),
+  );
+
+  it('are "Layers · n" and its sheet up to 1023 pixels, the row of toggles from 1024', () => {
+    for (const width of [375, 768, 1023]) {
+      expect(shownAt(rules, '#layers .chips', 'display', width), String(width)).toBe('none');
+      expect(shownAt(rules, '.layers-button', 'display', width), String(width)).toBe(
+        'inline-block',
+      );
+    }
+    for (const width of [1024, 1280]) {
+      expect(shownAt(rules, '#layers .chips', 'display', width), String(width)).toBe('flex');
+      expect(shownAt(rules, '.layers-button', 'display', width), String(width)).toBe('none');
+    }
+  });
+});
+
 // Plan 8M-9A (A7): the header's row stays one row on a phone; the Report button floats there.
 describe('the Report button on a wide screen and on a phone', () => {
   const rules = rulesOf(
diff --git a/src/web/report-icons.test.ts b/src/web/report-icons.test.ts
index a84ac40853ccebb078222080a5a51f727ddfb4aa..cc854ba510b18d6a78dfc1eaf8dd08f5c26e43fa 100644
--- a/src/web/report-icons.test.ts
+++ b/src/web/report-icons.test.ts
@@ -1,3 +1,5 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
 import { describe, expect, it } from 'vitest';
 import { REPORT_ICONS } from './client/report-icons.js';
 import { pictureOrigins } from './headers.js';
@@ -16,6 +18,7 @@ describe("the Report menu's icons", () => {
         expect(icon.paths.length, kind).toBeGreaterThan(0);
         continue;
       }
+      // A picture, or a picture drawn as a mask (plan 8M-9B, B17).
       expect(icon.src, kind).toMatch(
         /^https:\/\/raw\.githubusercontent\.com\/PokeMiners\/pogo_assets\/[0-9a-f]{40}\/Images\/[^?#]+\.png$/u,
       );
@@ -29,9 +32,32 @@ describe("the Report menu's icons", () => {
     ).toEqual({
       raid: 'picture',
       max: 'shape',
+      research: 'mask',
+      rocket: 'picture',
       spawn: 'picture',
       train: 'shape',
       meetup: 'shape',
     });
   });
+
+  it("are the game's quest symbol and Team GO Rocket's R for reports at stops (plan 8M-9B, B17)", () => {
+    expect(REPORT_ICONS.research).toMatchObject({
+      src: expect.stringMatching(/\/Images\/Quests\/QuestSymbol\.png$/u) as string,
+    });
+    expect(REPORT_ICONS.rocket).toMatchObject({
+      src: expect.stringMatching(/\/Images\/Rocket\/teamrocket_r\.png$/u) as string,
+    });
+  });
+
+  // Review F5: drawn as a mask wherever the icon is, the popups and phone cards too, by the
+  // stylesheet alone (no script sets it): never a solid block.
+  it("draws the quest symbol's mask from the stylesheet, at the pinned address", () => {
+    const css = readFileSync(path.join(import.meta.dirname, 'client', 'map.css'), 'utf8');
+    const rule = /\.report-icon\.mask-research\s*\{([^}]*)\}/u.exec(css)?.[1] ?? '';
+    const { research } = REPORT_ICONS;
+    if (research.kind !== 'mask') throw new Error(research.kind);
+    for (const name of ['mask-image', '-webkit-mask-image']) {
+      expect(rule, name).toContain(`${name}: url('${research.src}')`);
+    }
+  });
 });
````

### Task 3: 8M-9B task 3: the list's Field research and Team GO Rocket groups

Prototype commit: `907490c2054f3c47d72ca831dca755f25ee4c69e`

The reports at stops in the list of what is on, after the parties (raids
and max battles, trains, meetups, research, Rocket, spawns), only for the
layers on (`stopReportLines`):

- A line per report: its picture, the task or the grunt's or hideout's name,
  the stop, the distance, and its time: research and hideouts "until 5:00 PM"
  ("until midnight" at the day's end), a grunt its minutes left, dimmed in its
  last five as a raid. A tap flies to the stop and opens its popup; hover
  rings its marker.
- Sorts: Nearest as the others, Soonest by the end; Most going keeps them
  nearest first, having no count (a per-kind branch, B13).
- The research group's note while the day's research waits under an event:
  "Back at 4:05 PM, after Pawniard Community Day: the day's research at 3
  stops." (`backAtWords`, the post's words; `waiting.stops` as the server
  counts them), shown with no research listed too.

**Files:**

```
 src/web/client/list-ui.test.ts      |  31 +++++++++++++++++++++++++++++++
 src/web/client/list-ui.ts           |  17 +++++++++++++++--
 src/web/client/map.css              |  16 ++++++++++++++++
 src/web/client/party-layer.ts       |  10 ++++++++--
 src/web/client/stop-report-layer.ts |   6 +++---
 src/web/client/what-is-on.test.ts   | 120 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/what-is-on.ts        | 144 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------------------
 7 files changed, 318 insertions(+), 26 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/list-ui.test.ts src/web/client/what-is-on.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 907490c2054f3c47d72ca831dca755f25ee4c69e -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-9B task 3: the list's Field research and Team GO Rocket groups`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/list-ui.test.ts b/src/web/client/list-ui.test.ts
index 079be9f66eda1276334eb86bfc7c2e5cf6a9c44e..80a717c88d1278cf5297696943757d83a067849e 100644
--- a/src/web/client/list-ui.test.ts
+++ b/src/web/client/list-ui.test.ts
@@ -226,6 +226,37 @@ describe('a line of the list shown with its popup (fix round 2)', () => {
   });
 });
 
+describe('a group of the list with a note (plan 8M-9B)', () => {
+  afterEach(() => {
+    vi.unstubAllGlobals();
+  });
+
+  it('says the note under its heading, kept for a move of the map, gone with the next list', () => {
+    fakeDocument();
+    const section = new FakeElement('section');
+    const list = new WhatIsOn({
+      section: section as unknown as HTMLElement,
+      registry: { isOn: () => true } as unknown as LayerRegistry,
+      storage: undefined,
+      origin: () => undefined,
+      zone: () => 'America/New_York',
+      units: 'imperial',
+      open: () => false,
+      highlight: () => undefined,
+      detail: () => undefined,
+    });
+    const note = 'Back at 3:00 PM: the day’s research at 1 stop.';
+    list.show([], { research: note });
+    const said = () => section.all('p').map((one) => [one.className, one.textContent]);
+    expect(section.all('h3').map((one) => one.textContent)).toEqual(['Field research · 0']);
+    expect(said()).toEqual([['group-note', note]]);
+    list.render();
+    expect(said()).toEqual([['group-note', note]]);
+    list.show([]);
+    expect(said()).toEqual([['empty', 'Nothing is on just now.']]);
+  });
+});
+
 describe('the focus in the list drawn anew (review fix 2)', () => {
   afterEach(() => {
     vi.unstubAllGlobals();
diff --git a/src/web/client/list-ui.ts b/src/web/client/list-ui.ts
index 63be70bd2cd50f80748317422405424a80fce37c..7f8ac4ae8088162824ac6b53db97565b07f71643 100644
--- a/src/web/client/list-ui.ts
+++ b/src/web/client/list-ui.ts
@@ -7,6 +7,7 @@ import {
   readSort,
   SORTS,
   writeSort,
+  type ListKind,
   type ListLine,
   type ListSort,
 } from './what-is-on.js';
@@ -72,11 +73,15 @@ export class WhatIsOn {
    * counts, "You:", its buttons), the group chosen in its menu kept while that group is still
    * offered, and the focus given back to its control of the same kind (fix round 2).
    */
-  show(lines: ListLine[]): void {
+  show(lines: ListLine[], notes: Partial<Record<ListKind, string>> = {}): void {
     this.lines = lines;
+    this.notes = notes;
     this.render(true);
   }
 
+  /** The groups' notes of the last list (plan 8M-9B: the day's research waiting, B5). */
+  private notes: Partial<Record<ListKind, string>> = {};
+
   /** The line whose popup is drawn anew in the drawing under way (`redrawLine`). */
   private fresh: string | undefined;
 
@@ -107,6 +112,7 @@ export class WhatIsOn {
       on: (kind) => deps.registry.isOn(kind),
       sort: this.sort,
       origin,
+      notes: this.notes,
     });
     const header = document.createElement('header');
     const heading = document.createElement('h2');
@@ -141,7 +147,14 @@ export class WhatIsOn {
       const list = document.createElement('ul');
       list.className = 'list-lines';
       for (const line of group.lines) list.append(this.item(line, origin, now));
-      body.push(title, list);
+      body.push(title);
+      if (group.note !== undefined) {
+        const note = document.createElement('p');
+        note.className = 'group-note';
+        note.textContent = group.note;
+        body.push(note);
+      }
+      body.push(list);
     }
     // A field of a line's popup keeps the focus where it had it.
     const focused = document.activeElement;
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 4ce445c763708c6a418b8a23c1c530cb08ba016d..e61eb6eb5bd748b2566a2ea7307f6d67d5d84714 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -948,6 +948,22 @@ a {
   border-color: var(--raid);
 }
 
+/* The reports at stops (plan 8M-9B): a ring of their layer's color without a picture. */
+.list-lines span.picture.research {
+  border-color: var(--research);
+}
+
+.list-lines span.picture.rocket {
+  border-color: var(--rocket);
+}
+
+/* A group's note: the day's research waiting under an event (B5). */
+.what-is-on .group-note {
+  margin: 2px 0 4px;
+  color: var(--muted);
+  font-size: 13px;
+}
+
 .list-lines .words {
   display: flex;
   flex-direction: column;
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 499f0ebcb4232034f809d2452c698032fa6b4019..d75ffdc915c2c379eafa99e422d4e6d46961a5f9 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -56,7 +56,7 @@ import {
 import type { DistanceUnits } from './distance.js';
 import { WhatIsOn } from './list-ui.js';
 import { STREET_ZOOM, withinReach, type LatLon, type ViewStorage } from './view.js';
-import { ListRefresh, listLines, paneShows } from './what-is-on.js';
+import { ListRefresh, listLines, paneShows, stopReportLines, waitingNote } from './what-is-on.js';
 import { placeListNode, sharedPlace, startWords, type PlacedThing } from './shared-place.js';
 import type { MapParty, MapRaid, PostView } from '../../domain/web/party-data.js';
 import {
@@ -1263,7 +1263,13 @@ export function showParties(
     paneShown();
     // The list of what is on (plan 8M-7): every party the layers on show, across the server;
     // trains and raids the map cannot draw, and meetups without a place, keep their line.
-    whatIsOn.show(listLines(next, gyms));
+    // The reports at stops after the parties (plan 8M-9B), every layer's: the list keeps the
+    // groups of the layers on; the research group says when the day's research comes back (B5).
+    const waiting = waitingNote(stopReports.view, now, readerZone());
+    whatIsOn.show(
+      [...listLines(next, gyms), ...stopReportLines(stopReports.all(now))],
+      waiting === undefined ? {} : { research: waiting },
+    );
     // The posts of the parties in view, then (after the page's first list, review N6) the rest,
     // asked for ahead, at most `PREFETCH_POSTS` a list (review 8A-3), so that a popup that opens
     // has its post. Not for the reports drawn without the parties (review round 2, R1): the
diff --git a/src/web/client/stop-report-layer.ts b/src/web/client/stop-report-layer.ts
index 4bdcbea3d5668ef3fff604a0d6f786837c3af307..f9cabb29c85b800bc431ce359a0cc45989c0970b 100644
--- a/src/web/client/stop-report-layer.ts
+++ b/src/web/client/stop-report-layer.ts
@@ -139,9 +139,9 @@ export function stopReportLayer(deps: StopReportLayerDeps) {
     /** Asks at once (after a report or a take-back from this page). */
     now: (): Promise<void> => poller.now(),
 
-    /** The reports of the layers on, as the parties' draw shows them. */
-    reports(pick: Omit<StopPick, 'on'>): StopReports[] {
-      return reportsAtStops(view, { ...pick, on: (layer: StopLayer) => registry.isOn(layer) });
+    /** Every report that has not ended, of both layers, by stop: the list's lines. */
+    all(now: number): StopReports[] {
+      return reportsAtStops(view, { on: () => true, now });
     },
 
     /**
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
index 14611fa315e45a621d257969cb2a5f085f18bab9..8374558710f048477cb48a384f1d110a9cc452f2 100644
--- a/src/web/client/what-is-on.test.ts
+++ b/src/web/client/what-is-on.test.ts
@@ -17,10 +17,21 @@ import {
   paneShows,
   readSort,
   SORT_KEY,
+  stopReportLines,
+  waitingNote,
   writeSort,
   type ListLine,
 } from './what-is-on.js';
 import type { ViewStorage } from './view.js';
+import {
+  CASE_NOW,
+  CASE_ZONE,
+  caseGrunt,
+  caseHideout,
+  caseResearch,
+  caseView,
+} from './stop-report-cases.js';
+import { reportsAtStops } from './stop-reports.js';
 
 const ZONE = 'America/New_York';
 /** Tuesday 13 October 2026, 14:00 in New York. */
@@ -417,3 +428,112 @@ describe('the list kept current (plan 8M-7, fix round 1)', () => {
     expect(drawn).toBe(1);
   });
 });
+
+describe('the reports at stops in the list (plan 8M-9B)', () => {
+  /** The stops of the cases from the Library of stop 1 (40.441 N), stop 5 the farthest. */
+  const at = reportsAtStops(
+    caseView({
+      research: [caseResearch(5), caseResearch(2, { text: 'Spin 3 PokéStops' })],
+      grunts: [caseGrunt(3, { endsAt: CASE_NOW + 4 * MINUTE }), caseGrunt(1)],
+      hideouts: [caseHideout(4)],
+    }),
+    { on: () => true, now: CASE_NOW },
+  );
+  const origin = { lat: 40.441, lon: -79.95 };
+
+  it('follows the parties as "Field research" and "Team GO Rocket", before the spawns', () => {
+    const lines = [...listLines(view({ raids: [raid('r1', 1)] }), GYMS), ...stopReportLines(at)];
+    const groups = listGroups(lines, { on: allOn, sort: 'nearest', origin });
+    expect(groups.map((group) => group.heading)).toEqual([
+      'Raids and max battles · 1',
+      'Field research · 2',
+      'Team GO Rocket · 3',
+    ]);
+    // A layer off takes its group out.
+    expect(
+      listGroups(lines, { on: (kind) => kind !== 'rocket', sort: 'nearest', origin }).map(
+        (group) => group.kind,
+      ),
+    ).toEqual(['raids', 'research']);
+    // Each line opens its stop's popup.
+    expect(groups[1]?.lines.map((line) => [line.key, line.marker, line.place])).toEqual([
+      ['research:2', 'stop:stop-2', 'Yellow Mural 2'],
+      ['research:5', 'stop:stop-5', 'Yellow Mural 5'],
+    ]);
+  });
+
+  it('sorts Soonest by their end, and keeps them nearest first under Most going (B13)', () => {
+    const lines = stopReportLines(at);
+    const soonest = listGroups(lines, { on: allOn, sort: 'soonest', origin });
+    expect(soonest[1]?.lines.map((line) => line.key)).toEqual([
+      'grunt:103',
+      'grunt:101',
+      'hideout:204',
+    ]);
+    const going = listGroups(lines, { on: allOn, sort: 'going', origin });
+    expect(going[1]?.lines.map((line) => line.key)).toEqual([
+      'grunt:101',
+      'grunt:103',
+      'hideout:204',
+    ]);
+  });
+
+  it('words research and hideouts until their end, a grunt by the minutes it has left', () => {
+    const words = (key: string) => {
+      const line = stopReportLines(at).find((one) => one.key === key);
+      if (!line) throw new Error(key);
+      return lineWords(line, origin, CASE_NOW, CASE_ZONE, 'imperial');
+    };
+    expect(words('research:5')).toMatchObject({
+      name: 'Catch a Dragon-type Pokémon',
+      place: 'Yellow Mural 5',
+      // The day's end: midnight, not tomorrow's 12:00 AM.
+      time: 'until midnight',
+      going: '',
+      dimmed: false,
+    });
+    expect(words('grunt:101')).toMatchObject({ name: 'Water-type grunt', time: '25m left' });
+    expect(words('grunt:103')).toMatchObject({ time: '4m left', dimmed: true });
+    expect(words('hideout:204')).toMatchObject({ name: 'Arlo', time: 'until 11:00 PM' });
+    // Its picture: the research's, a grunt's, a hideout's.
+    expect(stopReportLines(at).find((one) => one.key === 'hideout:204')?.picture).toBe(
+      'https://map.example.test/pictures/arlo.png',
+    );
+  });
+
+  it('says when the day’s research comes back under an event, as the post of the stops does (B5)', () => {
+    expect(
+      waitingNote(
+        caseView({
+          event: 'Pawniard Community Day',
+          waiting: { stops: 3, at: CASE_NOW + 2 * 60 * MINUTE },
+        }),
+        CASE_NOW,
+        CASE_ZONE,
+      ),
+    ).toBe('Back at 4:00 PM, after Pawniard Community Day: the day’s research at 3 stops.');
+    expect(
+      waitingNote(
+        caseView({ waiting: { stops: 1, at: CASE_NOW + 60 * MINUTE } }),
+        CASE_NOW,
+        CASE_ZONE,
+      ),
+    ).toBe('Back at 3:00 PM: the day’s research at 1 stop.');
+    expect(waitingNote(caseView(), CASE_NOW, CASE_ZONE)).toBeUndefined();
+    // The group is headed with its note, even with no research shown yet.
+    const groups = listGroups([], {
+      on: allOn,
+      sort: 'nearest',
+      origin,
+      notes: { research: 'Back at 3:00 PM: the day’s research at 1 stop.' },
+    });
+    expect(groups).toEqual([
+      {
+        kind: 'research',
+        heading: 'Field research · 0',
+        lines: [],
+        note: 'Back at 3:00 PM: the day’s research at 1 stop.',
+      },
+    ]);
+  });
+});
diff --git a/src/web/client/what-is-on.ts b/src/web/client/what-is-on.ts
index 74bb5f15c678499047d75b1ce292b3c02de1d634..02d76b48fa6b3aa3932cae1dc7be53440b588f18 100644
--- a/src/web/client/what-is-on.ts
+++ b/src/web/client/what-is-on.ts
@@ -1,6 +1,9 @@
 import { stageAt } from '../../domain/party/raid-stage.js';
 import { clockTime } from '../../domain/web/clock.js';
 import type { PartiesView } from '../../domain/web/party-data.js';
+import { backAtWords } from '../../domain/stops/back-at.js';
+import type { StopReportsView } from '../../domain/web/stop-report-data.js';
+import { stopPopupKey, type StopLayer, type StopReport, type StopReports } from './stop-reports.js';
 import { distanceWords, metersBetween, type DistanceUnits } from './distance.js';
 import { stopLine, trainPlaces } from './parties.js';
 import type { MapGym } from './popup.js';
@@ -19,16 +22,20 @@ import type { LatLon, ViewStorage } from './view.js';
  * `list-ui.ts` draws it.
  */
 
-export type ListKind = 'raids' | 'trains' | 'meetups' | 'spawns';
+export type ListKind = 'raids' | 'trains' | 'meetups' | StopLayer | 'spawns';
 
 /**
  * The groups in their order, each with its heading (the registry's layer of the same id). Max
- * battles are in the raids' group and layer (plan 8M-9A).
+ * battles are in the raids' group and layer (plan 8M-9A); the reports at stops follow the parties
+ * (plan 8M-9B, the design's order: raids and max battles, trains, meetups, research, Rocket,
+ * spawns).
  */
 const GROUPS: ReadonlyArray<[ListKind, string]> = [
   ['raids', 'Raids and max battles'],
   ['trains', 'Trains'],
   ['meetups', 'Meetups'],
+  ['research', 'Field research'],
+  ['rocket', 'Team GO Rocket'],
   ['spawns', 'Wild spawns'],
 ];
 
@@ -55,6 +62,8 @@ export interface ListLine {
     hatch?: number | null;
     end?: number | null;
     start?: number | null;
+    /** A report at a stop standing all period or all day (plan 8M-9B): "until 5:00 PM". */
+    until?: number;
   };
 }
 
@@ -131,6 +140,77 @@ export function listLines(view: PartiesView, gyms: ReadonlyMap<number, MapGym>):
   return [...raids, ...maxes, ...trains, ...meetups];
 }
 
+/**
+ * The lines of the reports at stops (plan 8M-9B, goal 4), each opening its stop's popup
+ * (`stop:<key>`): research by its task, a grunt or hideout by its name, the stop as its place, the
+ * picture as the popup shows it; Soonest by their end; no count of those going (Most going keeps
+ * them nearest first, B13). Research and hideouts stand until their end ("until 5:00 PM"), a
+ * grunt for its minutes left, read as a hatched raid's (its last minutes dimmed).
+ */
+export function stopReportLines(stops: readonly StopReports[]): ListLine[] {
+  const base = (at: StopReports, report: StopReport, kind: StopLayer) => ({
+    kind,
+    id: String(report.id),
+    marker: stopPopupKey(at.stop.key),
+    place: at.stop.name,
+    point: { lat: at.stop.lat, lon: at.stop.lon },
+    going: 0,
+    soonest: report.endsAt,
+  });
+  return stops.flatMap((at) => [
+    ...at.research.map((report): ListLine => ({
+      ...base(at, report, 'research'),
+      key: `research:${String(report.id)}`,
+      name: report.text,
+      picture: report.picture ?? null,
+      times: { until: report.endsAt },
+    })),
+    ...at.grunts.map((report): ListLine => ({
+      ...base(at, report, 'rocket'),
+      key: `grunt:${String(report.id)}`,
+      name: report.name,
+      picture: report.picture ?? null,
+      times: { stage: 'hatched', hatch: null, end: report.endsAt },
+    })),
+    ...at.hideouts.map((report): ListLine => ({
+      ...base(at, report, 'rocket'),
+      key: `hideout:${String(report.id)}`,
+      name: report.name,
+      picture: report.picture ?? null,
+      times: { until: report.endsAt },
+    })),
+  ]);
+}
+
+/**
+ * The note of the research group while the day's research waits under an intra-day event's window
+ * (plan 8M-9B, B5): when it comes back and after which event, in the post of the stops' words
+ * (`backAtWords`, the reader's clock), and at how many stops (`waiting.stops`, as the server counts
+ * them); none while nothing waits.
+ */
+export function waitingNote(
+  view: Pick<StopReportsView, 'waiting' | 'event'> | undefined,
+  now: number,
+  zone: string,
+): string | undefined {
+  const waiting = view?.waiting;
+  if (!waiting) return undefined;
+  const back = backAtWords(clockTime(waiting.at, zone, now), view.event ?? undefined);
+  const stops = waiting.stops === 1 ? '1 stop' : `${String(waiting.stops)} stops`;
+  return `${back}: the day’s research at ${stops}.`;
+}
+
+/**
+ * When a report that stands to its end ends, in a line: `until 5:00 PM`; a day's end, local
+ * midnight, `until midnight` (not tomorrow's 12:00 AM).
+ */
+export function untilWords(end: number, now: number, zone: string): string {
+  const before = end - 1;
+  const today = clockTime(before, zone, now) === clockTime(before, zone, before);
+  const words = clockTime(end, zone, now);
+  return today && words.endsWith('12:00 AM') ? 'until midnight' : `until ${words}`;
+}
+
 export type ListSort = 'nearest' | 'soonest' | 'going';
 
 /** The sorts offered, in the menu's order, with their names. */
@@ -144,31 +224,56 @@ export interface ListGroup {
   kind: ListKind;
   heading: string;
   lines: ListLine[];
+  /** A line under its heading (plan 8M-9B: the day's research waiting under an event, B5). */
+  note?: string;
 }
 
-/** The groups of the list for the layers on, each sorted. */
+/** The kinds that have no count of those going: Most going keeps them nearest first (B13). */
+const UNCOUNTED: ReadonlySet<ListKind> = new Set<ListKind>(['research', 'rocket']);
+
+/**
+ * The groups of the list for the layers on, each sorted; a group with a note (`notes`) is shown
+ * with it, lines or none.
+ */
 export function listGroups(
   lines: readonly ListLine[],
-  how: { on: (kind: ListKind) => boolean; sort: ListSort; origin: LatLon | undefined },
+  how: {
+    on: (kind: ListKind) => boolean;
+    sort: ListSort;
+    origin: LatLon | undefined;
+    notes?: Partial<Record<ListKind, string>>;
+  },
 ): ListGroup[] {
   const distance = (line: ListLine): number =>
     line.point && how.origin ? metersBetween(how.origin, line.point) : Infinity;
-  const order = (a: ListLine, b: ListLine): number => {
-    // What the map cannot place goes last in its group, whatever the sort.
-    if ((a.point === null) !== (b.point === null)) return a.point === null ? 1 : -1;
-    const by =
-      how.sort === 'nearest'
-        ? distance(a) - distance(b)
-        : how.sort === 'soonest'
-          ? (a.soonest ?? Infinity) - (b.soonest ?? Infinity)
-          : b.going - a.going;
-    return (Number.isNaN(by) ? 0 : by) || a.name.localeCompare(b.name);
-  };
+  const order =
+    (sort: ListSort) =>
+    (a: ListLine, b: ListLine): number => {
+      // What the map cannot place goes last in its group, whatever the sort.
+      if ((a.point === null) !== (b.point === null)) return a.point === null ? 1 : -1;
+      const by =
+        sort === 'nearest'
+          ? distance(a) - distance(b)
+          : sort === 'soonest'
+            ? (a.soonest ?? Infinity) - (b.soonest ?? Infinity)
+            : b.going - a.going;
+      return (Number.isNaN(by) ? 0 : by) || a.name.localeCompare(b.name);
+    };
   return GROUPS.flatMap(([kind, name]) => {
     if (!how.on(kind)) return [];
     const of = lines.filter((line) => line.kind === kind);
-    if (of.length === 0) return [];
-    return [{ kind, heading: `${name} · ${of.length}`, lines: [...of].sort(order) }];
+    const note = how.notes?.[kind];
+    if (of.length === 0 && note === undefined) return [];
+    // Reports have no count of those going: nearest first under Most going (B13).
+    const sort = how.sort === 'going' && UNCOUNTED.has(kind) ? 'nearest' : how.sort;
+    return [
+      {
+        kind,
+        heading: `${name} · ${of.length}`,
+        lines: [...of].sort(order(sort)),
+        ...(note === undefined ? {} : { note }),
+      },
+    ];
   });
 }
 
@@ -193,10 +298,11 @@ export function lineWords(
   zone: string,
   units: DistanceUnits,
 ): LineWords {
-  const { stage, hatch = null, end = null, start = null } = line.times;
+  const { stage, hatch = null, end = null, start = null, until } = line.times;
   let time: string;
   let dimmed = false;
-  if (stage === undefined) time = startWords(start, now, zone);
+  if (until !== undefined) time = untilWords(until, now, zone);
+  else if (stage === undefined) time = startWords(start, now, zone);
   else {
     // Egg or hatched by the clock: the domain's `stageAt`, as the marker reads it.
     const hatched =
````

### Task 4: 8M-9B task 4: a stop's popup and card, with Take back

Prototype commit: `9f50ee94ef7a19ac58079bcd0760c60574ecbf15`

A stop's popup (and on a phone its card, as a party's) as a tree of nodes
(`stopPopup`): its name, address line, distance and Directions (the parties'
map line); then each report shown there: research (the task, its rewards in
short with the pictures of "one of", until when, who reported it), a grunt
(its name and lineup, the catches' pictures, its minutes left) and a hideout
(its picture, name, catches); each with Open on Discord (a
`https://discord.com/channels/` address only) and Take back where the server
says the member may (`mayTakeBack`).

- Take back asks first in the place of the report's actions ("Take back
  <task> at <stop>?"), held as the other forms; then
  `POST …/stop-reports/<id>/remove` with `{ madeAt }` through `pressParty`'s
  CSRF retry (`sendStop`); whatever it answers is said and the reports are
  asked for at once.
- A report whose end passes while it shows says "Ended" and loses Take back;
  the popup stays (B14: `tick`, and the stop kept in the draw).
- A plain PokéStop's popup (B11): its name, distance and Directions, no
  address line (`plainStopPopup`, through `PlacesHooks.stopPopup`).

**Files:**

```
 src/web/client/main.ts              |   4 +++
 src/web/client/map.css              | 125 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/party-layer.ts       |  49 +++++++++++++++++++++++++++--
 src/web/client/places-ui.ts         |  24 +++++++++-----
 src/web/client/stop-forms.test.ts   |  91 +++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/stop-forms.ts        |  84 +++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/stop-popup.test.ts   | 192 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/stop-popup.ts        | 271 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++----------
 src/web/client/stop-report-cases.ts |   3 ++
 src/web/client/stop-report-ui.ts    | 147 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 10 files changed, 964 insertions(+), 26 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/stop-forms.test.ts src/web/client/stop-popup.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 9f50ee94ef7a19ac58079bcd0760c60574ecbf15 -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-9B task 4: a stop's popup and card, with Take back`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 14f305df4b3bfdd87821c4ef31341e8deeec58fa..3a9da230e4ed2a2a65cc7707f8ba139c0487b696 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -233,6 +233,7 @@ function start(): void {
         forced: () => false,
         openBattle: () => false,
         stopTapped: () => false,
+        stopPopup: () => undefined,
       };
       const places = showPlaces(
         map,
@@ -248,6 +249,7 @@ function start(): void {
           forced: (layer) => placesHooks.forced(layer),
           openBattle: (spotId) => placesHooks.openBattle(spotId),
           stopTapped: (stop) => placesHooks.stopTapped(stop),
+          stopPopup: (stop) => placesHooks.stopPopup?.(stop),
         },
       );
       if (!me.loggedIn || !member) {
@@ -310,6 +312,8 @@ function start(): void {
       placesHooks.forced = (layer) => raids.forcedPlaces(layer);
       placesHooks.openBattle = (spotId) => raids.openBattle(spotId);
       placesHooks.stopTapped = (stop) => raids.stopTapped(stop);
+      // A PokéStop's popup: how far, Directions, its actions (plan 8M-9B, B11).
+      placesHooks.stopPopup = (stop) => raids.stopPopup(stop);
       places.redrawn();
       gymExtras.forced = () => raids.forced();
       gymExtras.raidGyms = () => raids.raidGyms();
diff --git a/src/web/client/map.css b/src/web/client/map.css
index e61eb6eb5bd748b2566a2ea7307f6d67d5d84714..11018d6bbe9646bfda8ae69839de435ff569eb3d 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -2225,3 +2225,128 @@ path.highlighted {
 .max-form [hidden] {
   display: none;
 }
+
+/*
+ * A stop's popup and card (plan 8M-9B): the stop, how far and Directions, then a part per report
+ * (its picture and kind, its task or name, rewards or catches, until when and who), then the
+ * stop's own actions. Its side bar in the color of research, or of Rocket where it has no research.
+ */
+.leaflet-popup-content-wrapper:has(.stop-popup) {
+  border-left-color: var(--rocket);
+}
+
+.leaflet-popup-content-wrapper:has(.stop-report.research) {
+  border-left-color: var(--research);
+}
+
+.party-card:has(.stop-popup) {
+  border-top-color: var(--rocket);
+}
+
+.party-card:has(.stop-report.research) {
+  border-top-color: var(--research);
+}
+
+.stop-popup {
+  display: flex;
+  flex-direction: column;
+  gap: 4px;
+  min-width: 0;
+  overflow-wrap: anywhere;
+}
+
+.stop-popup > .name {
+  font-size: 16px;
+}
+
+.stop-popup .address {
+  color: var(--muted);
+  font-size: 13px;
+}
+
+.stop-popup .map-line,
+.stop-popup .report-actions,
+.stop-popup .small {
+  color: var(--muted);
+  font-size: 13px;
+}
+
+.stop-popup .map-line a,
+.stop-popup .report-actions a {
+  color: var(--link);
+}
+
+.stop-report {
+  display: flex;
+  flex-direction: column;
+  gap: 3px;
+  margin-top: 6px;
+  padding-top: 8px;
+  border-top: 1px solid var(--line);
+}
+
+.stop-report .report-head {
+  display: flex;
+  align-items: center;
+  gap: 8px;
+  color: var(--muted);
+  font-size: 12px;
+  font-weight: 700;
+  text-transform: uppercase;
+}
+
+.stop-report .report-picture,
+.stop-report .report-head .report-icon {
+  width: 32px;
+  height: 32px;
+  object-fit: contain;
+}
+
+.stop-report .report-name {
+  font-weight: 600;
+}
+
+.stop-report .small-pictures {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 4px;
+}
+
+.stop-report .small-picture {
+  width: 28px;
+  height: 28px;
+  object-fit: contain;
+}
+
+.stop-report .ended {
+  color: var(--danger);
+  font-weight: 600;
+}
+
+.stop-report .link-button,
+.stop-actions .link-button {
+  padding: 0;
+  border: 0;
+  background: none;
+  color: var(--link);
+  font: inherit;
+  cursor: pointer;
+}
+
+.stop-report .link-button:disabled {
+  color: var(--muted);
+  cursor: default;
+}
+
+.stop-report .take-back-question .form-buttons,
+.stop-actions {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 6px;
+  margin-top: 6px;
+}
+
+.stop-report .take-back-question .form-text {
+  margin: 0;
+  color: var(--text);
+}
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index d75ffdc915c2c379eafa99e422d4e6d46961a5f9..cc2859413ccfa098124708487cf3171dc6631534 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -74,7 +74,9 @@ import { stopName } from './train-forms.js';
 import { stopPlace } from './parties.js';
 import type { Place } from './distance.js';
 import { stopReportLayer } from './stop-report-layer.js';
-import { stopPopup } from './stop-popup.js';
+import { plainStopPopup, stopPopup, type StopPopupContext } from './stop-popup.js';
+import { stopUi } from './stop-report-ui.js';
+import type { StopReport } from './stop-reports.js';
 import type { StopLayer } from './stop-reports.js';
 
 /**
@@ -297,6 +299,11 @@ export interface MapRaids {
    * by their keys as `/api/stops` names them.
    */
   reportStops(): ReadonlySet<string>;
+  /**
+   * A PokéStop's popup without reports (plan 8M-9B, B11): its name, how far it is, Directions,
+   * and the stop's own actions; its clicks the parties' own.
+   */
+  stopPopup(stop: { id: string; title: string; lat: number; lon: number }): HTMLElement;
 }
 
 /**
@@ -496,6 +503,37 @@ export function showParties(
   });
   const popups = new Map<string, L.Layer>();
 
+  /**
+   * The reports at stops' controls (plan 8M-9B): Take back, held as the other forms; after it, the
+   * reports asked for at once.
+   */
+  const stopControls = stopUi({
+    guild,
+    csrf: {
+      get: () => csrf,
+      set: (token) => {
+        csrf = token;
+      },
+    },
+    hold,
+    refresh: () => stopReports.now(),
+  });
+  /** What a stop's popup needs of the map now: the clock, your location, the units. */
+  const stopContext = (): StopPopupContext => ({
+    now: Date.now(),
+    zone: readerZone(),
+    located: frame.located(),
+    units: frame.units,
+  });
+  /** A report shown by its id (an ended one too: its popup stays, B14). */
+  const stopReportById = (id: string | undefined): StopReport | undefined => {
+    const reports = stopReports.view;
+    if (id === undefined || !reports) return undefined;
+    return [...reports.research, ...reports.grunts, ...reports.hideouts].find(
+      (report) => String(report.id) === id,
+    );
+  };
+
   /**
    * A gym clicked on the map: while a meetup's place is picked it is the place, in route mode the
    * next stop; true when its popup is not wanted.
@@ -782,6 +820,10 @@ export function showParties(
         // Report… (plan 8M-8B): `/report`'s form in the place of the post.
         const party = partyById(target.dataset.reportParty);
         if (party) postForms.reportClicked(target, party);
+      } else if (target.dataset.takeBack !== undefined) {
+        // A report at a stop taken back (plan 8M-9B): its question in the place of its actions.
+        const report = stopReportById(target.dataset.takeBack);
+        if (report) stopControls.takeBackClicked(target, report);
       } else if (target.dataset.party !== undefined && target.dataset.action !== undefined) {
         void press(target);
       } else postButton(target);
@@ -1248,7 +1290,7 @@ export function showParties(
         open: (key, marker) => {
           openAt(key, marker);
         },
-        popup: (at) => stopPopup(at),
+        popup: (at) => stopPopup(at, stopContext()),
       }),
     );
     // "New train" (or the form or route editor open in its place) for a member who may; a form
@@ -1747,6 +1789,8 @@ export function showParties(
     // The raids' badges and their last minutes (plan 8M-7), between two lists, by the rules they
     // were drawn by (`markerNow`).
     const zone = readerZone();
+    // A stop's popup or card (plan 8M-9B): a grunt's minutes, a report ended "Ended" (B14).
+    stopControls.tick(document, now);
     // A stop's marker with a grunt (plan 8M-9B) by the same rules, by its grunt's end.
     for (const marker of document.querySelectorAll<HTMLElement>(
       '.raid-marker[data-stage], .stop-marker[data-stage]',
@@ -1761,6 +1805,7 @@ export function showParties(
   stopReports.start();
   return {
     reportStops: () => stopReports.stops(),
+    stopPopup: (stop) => draw(plainStopPopup(stop, stopContext())),
     gymControls: (gym) =>
       reportOffered(mayReport, view)
         ? [raidForms.reportControl(gym), spawnForms.spawnControl(gym), meetupHereControl(gym)]
diff --git a/src/web/client/places-ui.ts b/src/web/client/places-ui.ts
index 5e18b4981dac5e119d4ca7536f3e3e4038dc44b2..c5d2bcee30da63010e9518745b61677158126a07 100644
--- a/src/web/client/places-ui.ts
+++ b/src/web/client/places-ui.ts
@@ -119,6 +119,11 @@ export interface PlacesHooks {
    * review B6), its popup not opened.
    */
   stopTapped(stop: PlaceSpot): boolean;
+  /**
+   * A PokéStop's popup (plan 8M-9B, B11): its name, how far it is, Directions and the stop's own
+   * actions, made by the parties; none: its name alone.
+   */
+  stopPopup?(stop: PlaceSpot): HTMLElement | undefined;
 }
 
 /** A PokéStop or Power Spot as the page has it from `/api/stops` and `/api/powerspots`. */
@@ -167,14 +172,17 @@ export function showPlaces(
    * 8M-9A); its element.
    */
   const placePopup = (id: 'stops' | 'spots', place: PlaceSpot): HTMLElement | undefined => {
-    const content = renderNode(
-      {
-        tag: 'div',
-        className: 'place-popup',
-        children: [{ tag: 'strong', className: 'place-name', text: place.title }],
-      },
-      document,
-    );
+    const made = id === 'stops' ? hooks?.stopPopup?.(place) : undefined;
+    const content =
+      made ??
+      renderNode(
+        {
+          tag: 'div',
+          className: 'place-popup',
+          children: [{ tag: 'strong', className: 'place-name', text: place.title }],
+        },
+        document,
+      );
     if (id === 'spots') content.append(...(hooks?.spotControls(place) ?? []));
     const popup = L.popup().setLatLng([place.lat, place.lon]).setContent(content).openOn(map);
     return popup.getElement();
diff --git a/src/web/client/stop-forms.test.ts b/src/web/client/stop-forms.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..92e77e4e57746ee1c6e7e10704ce40745b1831cd
--- /dev/null
+++ b/src/web/client/stop-forms.test.ts
@@ -0,0 +1,91 @@
+import { describe, expect, it } from 'vitest';
+import type { Me } from './notice.js';
+import { PRESS_FAILED } from './parties.js';
+import type { PageNode } from './popup.js';
+import { CASE_NOW, CASE_ZONE, caseGrunt, caseView } from './stop-report-cases.js';
+import { sendStop, stopAnswerOf, takeBackBody, takeBackPath } from './stop-forms.js';
+import { stopPopup } from './stop-popup.js';
+import { reportsAtStops } from './stop-reports.js';
+
+/** The attributes of every button of a tree. */
+const buttonsOf = (node: PageNode): Array<Record<string, string>> => [
+  ...(node.tag === 'button' ? [node.attributes ?? {}] : []),
+  ...(node.children ?? []).flatMap(buttonsOf),
+];
+
+const ME: Me = {
+  loggedIn: true,
+  name: 'Googer',
+  csrf: 'fresh',
+  member: true,
+  readOnly: false,
+};
+
+describe('what the page sends of the reports at stops (plan 8M-9B)', () => {
+  it('takes a report back at its address, always with the version its popup showed', () => {
+    const grunt = caseGrunt(1);
+    expect(takeBackPath('412345678901234567', grunt)).toBe(
+      '/s/412345678901234567/api/stop-reports/101/remove',
+    );
+    // Review F4: the version of the Take back pressed (its `data-made-at`), not the one a poll
+    // brought since (a grunt refined in place keeps its id).
+    const [at] = reportsAtStops(caseView({ grunts: [grunt] }), { on: () => true, now: CASE_NOW });
+    const popup = stopPopup(at!, {
+      now: CASE_NOW,
+      zone: CASE_ZONE,
+      located: undefined,
+      units: 'imperial',
+    });
+    const button = buttonsOf(popup).find((one) => one['data-take-back'] !== undefined);
+    const dataset = { madeAt: button?.['data-made-at'] };
+    expect(takeBackBody(dataset)).toEqual({ madeAt: grunt.madeAt });
+  });
+
+  it('says what the server answered, its refusal’s words, a stale token tried once more', async () => {
+    const sent: string[] = [];
+    const answers = [
+      { status: 403, body: { error: 'Not allowed.' } },
+      { status: 409, body: { ok: false, text: 'That report was changed meanwhile.' } },
+    ];
+    const done = await sendStop('stale', {
+      post: (token) => {
+        sent.push(token);
+        return Promise.resolve(answers.shift() ?? { status: 500, body: undefined });
+      },
+      me: () => Promise.resolve(ME),
+    });
+    expect(sent).toEqual(['stale', 'fresh']);
+    expect(done.text).toBe('That report was changed meanwhile.');
+    expect(done.csrf).toBe('fresh');
+    expect(done.answer).toEqual({
+      ok: false,
+      status: 409,
+      text: 'That report was changed meanwhile.',
+    });
+    // Too many: the limit's words.
+    const throttled = await sendStop('fresh', {
+      post: () =>
+        Promise.resolve({ status: 429, body: { error: 'Slow down: try again in a minute.' } }),
+      me: () => Promise.resolve(ME),
+    });
+    expect(throttled.text).toBe('Slow down: try again in a minute.');
+    // A broken connection.
+    const broken = await sendStop('fresh', {
+      post: () => Promise.reject(new TypeError('fetch failed')),
+      me: () => Promise.resolve(ME),
+    });
+    expect(broken.text).toBe(PRESS_FAILED);
+  });
+
+  it('reads only the parts of an answer the page acts on (B4: by `reason`, never the words)', () => {
+    expect(
+      stopAnswerOf(409, { ok: false, text: 'That report has ended.', reason: 'ended', other: 1 }),
+    ).toEqual({ ok: false, status: 409, text: 'That report has ended.', reason: 'ended' });
+    expect(stopAnswerOf(422, { ok: false, text: 'x', reason: 'something else' })).toEqual({
+      ok: false,
+      status: 422,
+      text: 'x',
+    });
+    expect(stopAnswerOf(500, 'not json')).toEqual({ ok: false, status: 500 });
+  });
+});
diff --git a/src/web/client/stop-forms.ts b/src/web/client/stop-forms.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4bfa37b3e65645bf7c5fba73c5abd67a3deb5d8b
--- /dev/null
+++ b/src/web/client/stop-forms.ts
@@ -0,0 +1,84 @@
+import type {
+  HiddenReport,
+  MapGrunt,
+  MapHideout,
+  MapResearch,
+  StopReportAnswer,
+} from '../../domain/web/stop-report-data.js';
+import { pressParty, type Pressed, type PressSteps } from './parties.js';
+import type { StopReport } from './stop-reports.js';
+
+/*
+ * What the page sends of the reports at stops (plan 8M-9B) and reads of the answers, the parts with
+ * no page in them: every report and take-back goes through the routes of plan 8R-3 with the page's
+ * CSRF token as a press does (`pressParty`: a stale token's 403 tried once more with a new one,
+ * B16), and the page acts only on what the answer says by its machine parts (`reason`, `asks`),
+ * never on its words (B4).
+ */
+
+/** What a POST of the page needs: the request with this token, and `/api/me` again. */
+export type StopSteps = PressSteps;
+
+/** What the page reads of an answer (`StopReportAnswer`), only what it can read. */
+export interface StopAnswered {
+  ok: boolean;
+  /** The HTTP status, which says what kind of refusal it is (403, 404, 409, 422, 429, 503). */
+  status: number;
+  text?: string;
+  research?: MapResearch[];
+  already?: MapResearch[];
+  grunt?: MapGrunt;
+  hideout?: MapHideout;
+  asks?: { replacing?: number; reports?: MapResearch[]; hidden?: HiddenReport[] };
+  reason?: StopReportAnswer['reason'];
+}
+
+/** An answer's body as the page may read it (anything else left out). */
+export function stopAnswerOf(status: number, body: unknown): StopAnswered {
+  if (typeof body !== 'object' || body === null) return { ok: false, status };
+  const read = body as Partial<StopReportAnswer> & { error?: unknown };
+  const answered: StopAnswered = { ok: read.ok === true, status };
+  if (typeof read.text === 'string') answered.text = read.text;
+  else if (typeof read.error === 'string') answered.text = read.error;
+  if (Array.isArray(read.research)) answered.research = read.research;
+  if (Array.isArray(read.already)) answered.already = read.already;
+  if (typeof read.grunt === 'object') answered.grunt = read.grunt;
+  if (typeof read.hideout === 'object') answered.hideout = read.hideout;
+  if (typeof read.asks === 'object') answered.asks = read.asks;
+  if (read.reason === 'ended' || read.reason === 'list-changed') answered.reason = read.reason;
+  return answered;
+}
+
+/**
+ * Sends a report or a take-back with the page's CSRF token as a press is sent (`pressParty`): the
+ * words to say (the answer's `text`, else its `error`, else that it did not get through), the
+ * token now, and what the answer says.
+ */
+export async function sendStop(
+  csrf: string,
+  steps: StopSteps,
+): Promise<Pressed & { answer: StopAnswered }> {
+  let last: { status: number; body: unknown } = { status: 0, body: undefined };
+  const pressed = await pressParty(csrf, {
+    post: async (token) => {
+      last = await steps.post(token);
+      return last;
+    },
+    me: () => steps.me(),
+  });
+  return { ...pressed, answer: stopAnswerOf(last.status, last.body) };
+}
+
+/** Where a report is taken back: `POST /s/<guild>/api/stop-reports/<id>/remove`. */
+export function takeBackPath(guild: string, report: Pick<StopReport, 'id'>): string {
+  return `/s/${guild}/api/stop-reports/${encodeURIComponent(String(report.id))}/remove`;
+}
+
+/**
+ * A take-back's body: always the version the popup showed, its Take back's `data-made-at`
+ * (`madeAt`, plan 8R-4L's follow-up: a grunt refined in place since keeps its id, and is not taken
+ * back by an older popup; review F4: never the version of a poll that came since).
+ */
+export function takeBackBody(shown: { madeAt?: string | undefined }): { madeAt: number } {
+  return { madeAt: Number(shown.madeAt) };
+}
diff --git a/src/web/client/stop-popup.test.ts b/src/web/client/stop-popup.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a5890405bb652d49a4461bd82e9a96b87a39c60f
--- /dev/null
+++ b/src/web/client/stop-popup.test.ts
@@ -0,0 +1,192 @@
+import { describe, expect, it } from 'vitest';
+import type { PageNode } from './popup.js';
+import {
+  CASE_NOW,
+  CASE_ZONE,
+  caseGrunt,
+  caseHideout,
+  caseResearch,
+  caseView,
+} from './stop-report-cases.js';
+import {
+  plainStopPopup,
+  stopPopup,
+  takeBackQuestion,
+  type StopPopupContext,
+} from './stop-popup.js';
+import { reportsAtStops } from './stop-reports.js';
+
+const MINUTE = 60_000;
+
+/** Every text of a tree, in order. */
+const texts = (node: PageNode): string[] => [
+  ...(node.text === undefined ? [] : [node.text]),
+  ...(node.children ?? []).flatMap(texts),
+];
+
+/** The nodes of a tree that match. */
+const found = (node: PageNode, test: (one: PageNode) => boolean): PageNode[] => [
+  ...(test(node) ? [node] : []),
+  ...(node.children ?? []).flatMap((child) => found(child, test)),
+];
+
+const ctx: StopPopupContext = {
+  now: CASE_NOW,
+  zone: CASE_ZONE,
+  located: { lat: 40.44, lon: -79.95 },
+  units: 'imperial',
+};
+
+/** The one stop of a view of reports, all of them shown. */
+const stopOf = (view: ReturnType<typeof caseView>) => {
+  const [at] = reportsAtStops(view, { on: () => true, now: CASE_NOW, keep: new Set(['stop-1']) });
+  if (!at) throw new Error('no stop');
+  return at;
+};
+
+describe("a stop's popup (plan 8M-9B)", () => {
+  it('names the stop, its address, how far it is and Directions, then its research', () => {
+    const node = stopPopup(stopOf(caseView({ research: [caseResearch(1)] })), ctx);
+    expect(texts(node)).toEqual([
+      'Yellow Mural 1',
+      'Market Street',
+      '360 ft',
+      ' · ',
+      'Directions',
+      'Field research',
+      'Catch a Dragon-type Pokémon',
+      'Dratini',
+      'until midnight',
+      ' · reported by Brock',
+      'Open on Discord',
+    ]);
+    // Brock's: no Take back for this member.
+    expect(found(node, (one) => one.attributes?.['data-take-back'] !== undefined)).toEqual([]);
+  });
+
+  it('shows "one of" with its rewards’ pictures, and Take back where the member may', () => {
+    const oneOf = caseResearch(1, {
+      oneOf: true,
+      mayTakeBack: true,
+      rewardText: 'one of Dratini, Bagon',
+      rewards: [
+        ...caseResearch(1).rewards,
+        { ...caseResearch(1).rewards[0]!, name: 'Bagon', image: 'https://cdn.leekduck.com/b.png' },
+      ],
+    });
+    const node = stopPopup(stopOf(caseView({ research: [oneOf] })), ctx);
+    expect(texts(node)).toContain('one of Dratini, Bagon');
+    expect(
+      found(node, (one) => one.className === 'small-picture').map((one) => one.attributes?.title),
+    ).toEqual(['Dratini', 'Bagon']);
+    expect(
+      found(node, (one) => one.attributes?.['data-take-back'] !== undefined).map(
+        (one) => one.attributes,
+      ),
+    ).toEqual([
+      {
+        type: 'button',
+        'data-take-back': '1',
+        'data-made-at': String(oneOf.madeAt),
+      },
+    ]);
+  });
+
+  // Review F7: "one of" is the server's fact (`oneOf`), not the count of the rewards.
+  it('shows the pictures of "one of" by what the server says, not by the count of rewards', () => {
+    const two = [
+      ...caseResearch(1).rewards,
+      { ...caseResearch(1).rewards[0]!, name: 'Bagon', image: 'https://cdn.leekduck.com/b.png' },
+    ];
+    const pictures = (report: ReturnType<typeof caseResearch>) =>
+      found(
+        stopPopup(stopOf(caseView({ research: [report] })), ctx),
+        (one) => one.className === 'small-picture',
+      );
+    expect(pictures(caseResearch(1, { oneOf: false, rewards: two }))).toEqual([]);
+    expect(pictures(caseResearch(1, { oneOf: true, rewards: two }))).toHaveLength(2);
+  });
+
+  it('links only a message of Discord, and says nothing of a report without one', () => {
+    const elsewhere = caseResearch(1, { link: 'https://example.test/x' });
+    const node = stopPopup(stopOf(caseView({ research: [elsewhere] })), ctx);
+    expect(texts(node)).not.toContain('Open on Discord');
+    const { link: _link, ...without } = caseResearch(1);
+    expect(texts(stopPopup(stopOf(caseView({ research: [without] })), ctx))).not.toContain(
+      'Open on Discord',
+    );
+  });
+
+  it('says "Ended" for a report whose end passed while it shows, without Take back (B14)', () => {
+    const ended = caseGrunt(1, { endsAt: CASE_NOW - MINUTE });
+    const node = stopPopup(stopOf(caseView({ grunts: [ended] })), ctx);
+    expect(texts(node)).toContain('Ended');
+    expect(found(node, (one) => one.attributes?.['data-take-back'] !== undefined)).toEqual([]);
+    expect(texts(node)).toContain('Open on Discord');
+  });
+
+  it('shows a grunt by its name and lineup, its catches and minutes, a hideout by its picture', () => {
+    const node = stopPopup(
+      stopOf(caseView({ grunts: [caseGrunt(1)], hideouts: [caseHideout(1)] })),
+      ctx,
+    );
+    expect(texts(node)).toEqual(
+      expect.arrayContaining(['Water-type grunt · Magikarp, Feebas', '25m left', 'Arlo']),
+    );
+    const left = found(node, (one) => one.className === 'left')[0];
+    expect(left?.attributes?.['data-left']).toBe(String(caseGrunt(1).endsAt));
+    expect(
+      found(node, (one) => one.className === 'report-picture').map((one) => one.attributes?.src),
+    ).toEqual([caseGrunt(1).picture, caseHideout(1).picture]);
+    // Each report's section carries its end, for the page to say "Ended" as it passes.
+    expect(
+      found(node, (one) => one.tag === 'section').map((one) => one.attributes?.['data-ends']),
+    ).toEqual([String(caseGrunt(1).endsAt), String(caseHideout(1).endsAt)]);
+  });
+
+  it('ends with the stop’s own actions, where offered', () => {
+    const action: PageNode = { tag: 'button', text: 'Report research here' };
+    const node = stopPopup(stopOf(caseView({ research: [caseResearch(1)] })), {
+      ...ctx,
+      actions: [action],
+    });
+    expect(texts(node).at(-1)).toBe('Report research here');
+  });
+});
+
+describe("a PokéStop's popup without reports (plan 8M-9B, B11)", () => {
+  it('names it, how far it is and Directions, no address line, then its actions', () => {
+    const node = plainStopPopup(
+      { id: 'stop-9', title: 'Blue Bench', lat: 40.441, lon: -79.95 },
+      { ...ctx, actions: [{ tag: 'button', text: 'Report Rocket here' }] },
+    );
+    expect(texts(node)).toEqual([
+      'Blue Bench',
+      '360 ft',
+      ' · ',
+      'Directions',
+      'Report Rocket here',
+    ]);
+    // Without your location, Directions alone (the parties' rule).
+    expect(
+      texts(
+        plainStopPopup(
+          { id: 'stop-9', title: 'Blue Bench', lat: 40.441, lon: -79.95 },
+          {
+            ...ctx,
+            located: undefined,
+          },
+        ),
+      ),
+    ).toEqual(['Blue Bench', 'Directions']);
+  });
+});
+
+describe('taking a report back (plan 8M-9B)', () => {
+  it('asks first by the task or name and the stop', () => {
+    expect(takeBackQuestion(caseResearch(1))).toBe(
+      'Take back Catch a Dragon-type Pokémon at Yellow Mural 1?',
+    );
+    expect(takeBackQuestion(caseGrunt(2))).toBe('Take back Water-type grunt at Yellow Mural 2?');
+  });
+});
diff --git a/src/web/client/stop-popup.ts b/src/web/client/stop-popup.ts
index a85406ca4e1ec4bf9be2ed5bac83537105dedb7b..2a97535dcec82f368307d3f966fbf92c1ba26bca 100644
--- a/src/web/client/stop-popup.ts
+++ b/src/web/client/stop-popup.ts
@@ -1,28 +1,267 @@
-import type { PageNode } from './popup.js';
-import type { StopReports } from './stop-reports.js';
+import type {
+  MapGrunt,
+  MapHideout,
+  MapResearch,
+  MapReward,
+} from '../../domain/web/stop-report-data.js';
+import type { DistanceUnits, Place } from './distance.js';
+import { addressLine, type PageNode } from './popup.js';
+import { mapLine } from './post-draw.js';
+import { badgeWords } from './raid-marker.js';
+import { iconNode } from './report-menu.js';
+import { REPORT_ICONS } from './report-icons.js';
+import type { StopReport, StopReports } from './stop-reports.js';
+import { untilWords } from './what-is-on.js';
 
 /*
  * A stop's popup and phone card on the live map (plan 8M-9B, goal 3), as a tree of nodes
- * (`renderNode`: every text as text).
+ * (`renderNode`: every text as text): the stop's name, its address line, how far it is and
+ * Directions (the parties' map line, `mapLine`); then each report shown there: research (the task,
+ * the rewards in short with the pictures of "one of", until when, who reported it), a grunt (its
+ * name and lineup, the catches' pictures, its minutes left), a hideout (its picture, name,
+ * catches); each with Open on Discord (a `https://discord.com/channels/` address only) and Take
+ * back where the server says the member may (`mayTakeBack`); an ended one says "Ended" and loses
+ * its Take back (B14). Then the stop's own actions.
  */
 
-/** A stop's popup: its name, then what was reported there. */
-export function stopPopup(at: StopReports): PageNode {
+/** What a stop's popup needs of the map. */
+export interface StopPopupContext {
+  now: number;
+  /** The reader's zone (plan 8M-8A), the times' words. */
+  zone: string;
+  /** Your location once the browser said: how far the stop is (the parties' rule). */
+  located: Place | undefined;
+  units: DistanceUnits;
+  /** The stop's own actions ("Report research here", "Report Rocket here"), where offered. */
+  actions?: readonly PageNode[];
+  /** A report's own actions beyond Take back ("Same task at more stops…"), where offered. */
+  more?: (report: StopReport, kind: 'research' | 'grunt' | 'hideout') => readonly PageNode[];
+}
+
+const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const;
+
+/** What a report says once its end has passed (B14). */
+export const ENDED = 'Ended';
+
+/** A picture of the server's, as a small one of a line. */
+const picture = (src: string, name: string, className: string): PageNode => ({
+  tag: 'img',
+  className,
+  attributes: { src, alt: name, title: name, draggable: 'false' },
+});
+
+/** The pictures of rewards or catches with one, small, each named by its title. */
+function picturesOf(rewards: readonly MapReward[]): PageNode[] {
+  const shown = rewards.flatMap((reward) =>
+    reward.image === undefined ? [] : [picture(reward.image, reward.name, 'small-picture')],
+  );
+  return shown.length === 0 ? [] : [{ tag: 'div', className: 'small-pictures', children: shown }];
+}
+
+/** A report's head: its picture (else its layer's icon) and its kind. */
+function head(src: string | undefined, kind: 'research' | 'rocket', words: string): PageNode {
+  return {
+    tag: 'div',
+    className: 'report-head',
+    children: [
+      src === undefined ? iconNode(REPORT_ICONS[kind]) : picture(src, '', 'report-picture'),
+      { tag: 'span', className: 'report-kind', text: words },
+    ],
+  };
+}
+
+/** Open on Discord, only to a message of a server's channel. */
+function discordLink(link: string | undefined): PageNode[] {
+  return link?.startsWith('https://discord.com/channels/') === true
+    ? [
+        {
+          tag: 'a',
+          className: 'post-link',
+          text: 'Open on Discord',
+          attributes: { href: link, ...NEW_TAB },
+        },
+      ]
+    : [];
+}
+
+/** Take back, where the member may: the report's id and the version the list showed. */
+function takeBack(report: StopReport): PageNode[] {
+  return report.mayTakeBack
+    ? [
+        {
+          tag: 'button',
+          className: 'link-button',
+          text: 'Take back',
+          attributes: {
+            type: 'button',
+            'data-take-back': String(report.id),
+            'data-made-at': String(report.madeAt),
+          },
+        },
+      ]
+    : [];
+}
+
+/** A report's last lines: when, who, its link and actions; "Ended" and no actions once it ended. */
+function footer(
+  report: StopReport,
+  when: PageNode,
+  ctx: StopPopupContext,
+  more: readonly PageNode[],
+): PageNode[] {
+  const ended = report.endsAt <= ctx.now;
+  const actions = [...discordLink(report.link), ...(ended ? [] : [...takeBack(report), ...more])];
+  return [
+    {
+      tag: 'div',
+      className: 'small',
+      children: [
+        ended ? { tag: 'span', className: 'ended', text: ENDED } : when,
+        { tag: 'span', text: ` · reported by ${report.reporter}` },
+      ],
+    },
+    ...(actions.length === 0
+      ? []
+      : [
+          {
+            tag: 'div',
+            className: 'report-actions',
+            children: actions.flatMap((part, index) =>
+              index === 0 ? [part] : [{ tag: 'span', className: 'sep', text: ' · ' }, part],
+            ),
+          },
+        ]),
+  ];
+}
+
+/** A report's section, its end on it for the page to say "Ended" when it passes (B14). */
+function section(report: StopReport, kind: string, children: PageNode[]): PageNode {
+  return {
+    tag: 'section',
+    className: `stop-report ${kind}`,
+    attributes: { 'data-report': String(report.id), 'data-ends': String(report.endsAt) },
+    children,
+  };
+}
+
+function researchPart(report: MapResearch, ctx: StopPopupContext): PageNode {
+  // "One of" as the server says it (`isOneOf`, review F7).
+  const { oneOf } = report;
+  return section(report, 'research', [
+    head(report.picture, 'research', 'Field research'),
+    { tag: 'div', className: 'report-name', text: report.text },
+    ...(report.rewardText === ''
+      ? []
+      : [{ tag: 'div', className: 'rewards', text: report.rewardText }]),
+    ...(oneOf ? picturesOf(report.rewards) : []),
+    ...footer(
+      report,
+      { tag: 'span', text: untilWords(report.endsAt, ctx.now, ctx.zone) },
+      ctx,
+      ctx.more?.(report, 'research') ?? [],
+    ),
+  ]);
+}
+
+/** A grunt's minutes left, kept current by the page between two lists (`data-left`). */
+function minutesLeft(report: MapGrunt, now: number): PageNode {
+  const left = badgeWords('end', report.endsAt, now, 'UTC');
+  return {
+    tag: 'span',
+    className: 'left',
+    text: left === 'ended' ? ENDED : `${left} left`,
+    attributes: { 'data-left': String(report.endsAt) },
+  };
+}
+
+function gruntPart(report: MapGrunt, ctx: StopPopupContext): PageNode {
+  return section(report, 'grunt', [
+    head(report.picture, 'rocket', 'Team GO Rocket'),
+    {
+      tag: 'div',
+      className: 'report-name',
+      text: report.lineup === undefined ? report.name : `${report.name} · ${report.lineup}`,
+    },
+    ...picturesOf(report.catches),
+    ...footer(report, minutesLeft(report, ctx.now), ctx, ctx.more?.(report, 'grunt') ?? []),
+  ]);
+}
+
+function hideoutPart(report: MapHideout, ctx: StopPopupContext): PageNode {
+  return section(report, 'hideout', [
+    head(report.picture, 'rocket', 'Team GO Rocket'),
+    { tag: 'div', className: 'report-name', text: report.name },
+    ...picturesOf(report.catches),
+    ...footer(
+      report,
+      { tag: 'span', text: untilWords(report.endsAt, ctx.now, ctx.zone) },
+      ctx,
+      ctx.more?.(report, 'hideout') ?? [],
+    ),
+  ]);
+}
+
+/** The stop's own lines: its name, its address, how far it is and Directions. */
+function stopHead(
+  stop: { name: string; address: string | null; lat: number; lon: number },
+  ctx: StopPopupContext,
+  address: boolean,
+): PageNode[] {
+  return [
+    { tag: 'strong', className: 'name', text: stop.name },
+    ...(address ? addressLine(stop) : []),
+    mapLine(stop, '', ctx.located, ctx.units),
+  ];
+}
+
+/** The stop's own actions, where offered. */
+function actionsPart(ctx: StopPopupContext): PageNode[] {
+  return ctx.actions === undefined || ctx.actions.length === 0
+    ? []
+    : [{ tag: 'div', className: 'stop-actions', children: [...ctx.actions] }];
+}
+
+/** A stop's popup (goal 3): the stop, then each report shown there, then its own actions. */
+export function stopPopup(at: StopReports, ctx: StopPopupContext): PageNode {
   return {
     tag: 'div',
     className: 'stop-popup',
+    attributes: { 'data-stop': at.stop.key },
     children: [
-      { tag: 'strong', className: 'name', text: at.stop.name },
-      ...at.research.map((report): PageNode => ({
-        tag: 'div',
-        className: 'report',
-        text: report.text,
-      })),
-      ...[...at.grunts, ...at.hideouts].map((report): PageNode => ({
-        tag: 'div',
-        className: 'report',
-        text: report.name,
-      })),
+      ...stopHead(at.stop, ctx, true),
+      ...at.research.map((report) => researchPart(report, ctx)),
+      ...at.grunts.map((report) => gruntPart(report, ctx)),
+      ...at.hideouts.map((report) => hideoutPart(report, ctx)),
+      ...actionsPart(ctx),
     ],
   };
 }
+
+/**
+ * A PokéStop's popup without reports (B11): its name, how far it is and Directions (no address
+ * line: `/api/stops` gives none), then its own actions.
+ */
+export function plainStopPopup(
+  stop: { id: string; title: string; lat: number; lon: number },
+  ctx: StopPopupContext,
+): PageNode {
+  return {
+    tag: 'div',
+    className: 'stop-popup plain',
+    attributes: { 'data-stop': stop.id },
+    children: [
+      ...stopHead({ name: stop.title, address: null, lat: stop.lat, lon: stop.lon }, ctx, false),
+      ...actionsPart(ctx),
+    ],
+  };
+}
+
+/** What a report is called in its Take back's question: the task, or the grunt's or hideout's name. */
+function subjectOf(report: StopReport): string {
+  return 'text' in report ? report.text : report.name;
+}
+
+/** The question before a report is taken back: "Take back <task> at <stop>?". */
+export function takeBackQuestion(report: StopReport): string {
+  return `Take back ${subjectOf(report)} at ${report.stop.name}?`;
+}
diff --git a/src/web/client/stop-report-cases.ts b/src/web/client/stop-report-cases.ts
index 1aacbc664193031161fc559a6430b15656082f3f..da742e78acfcbd0f32cc2b3f6d6b212276d366ae 100644
--- a/src/web/client/stop-report-cases.ts
+++ b/src/web/client/stop-report-cases.ts
@@ -37,6 +37,7 @@ export const caseResearch = (n: number, more: Partial<MapResearch> = {}): MapRes
   endsAt: CASE_NOW + 10 * 60 * MINUTE,
   reporter: 'Brock',
   mayTakeBack: false,
+  link: 'https://discord.com/channels/1/2/3',
   task: `dragon:${String(n)}`,
   text: 'Catch a Dragon-type Pokémon',
   category: 'Catching',
@@ -65,6 +66,7 @@ export const caseGrunt = (n: number, more: Partial<MapGrunt> = {}): MapGrunt =>
   endsAt: CASE_NOW + 25 * MINUTE,
   reporter: 'Misty',
   mayTakeBack: true,
+  link: 'https://discord.com/channels/1/2/4',
   who: 'grunt:water:male',
   typeKey: 'grunt:water',
   name: 'Water-type grunt',
@@ -91,6 +93,7 @@ export const caseHideout = (n: number, more: Partial<MapHideout> = {}): MapHideo
   endsAt: CASE_NOW + 9 * 60 * MINUTE,
   reporter: 'Brock',
   mayTakeBack: false,
+  link: 'https://discord.com/channels/1/2/3',
   who: 'leader:arlo',
   name: 'Arlo',
   catches: [
diff --git a/src/web/client/stop-report-ui.ts b/src/web/client/stop-report-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ddb037a45de7193e6e4ef4b5ffd76142cf97f80e
--- /dev/null
+++ b/src/web/client/stop-report-ui.ts
@@ -0,0 +1,147 @@
+import { getJson, say } from './common.js';
+import type { Me } from './notice.js';
+import { renderNode } from './popup.js';
+import { formPlace, type FormHold } from './raid-forms.js';
+import { badgeWords } from './raid-marker.js';
+import { sendStop, takeBackBody, takeBackPath } from './stop-forms.js';
+import { ENDED, takeBackQuestion } from './stop-popup.js';
+import type { StopReport } from './stop-reports.js';
+
+/*
+ * The reports at stops' controls in the page (plan 8M-9B): Take back in a stop's popup or card, a
+ * question first in the place of the report's actions ("Take back <task> at <stop>?"), held as the
+ * other forms are (`FormHold`: the popup's content kept while it is asked); then
+ * `POST …/stop-reports/<id>/remove` with `{ madeAt }`, whatever it answers said as a notice (the
+ * server's words: taken back, not yours, nothing left, changed meanwhile, too many), and the reports
+ * asked for at once. Between two lists the popup keeps a grunt's minutes current and says "Ended"
+ * for a report whose end passed, its Take back gone (B14: `tick`).
+ */
+export interface StopUiDeps {
+  guild: string;
+  /** The page's CSRF token, which a stale one's renewal changes. */
+  csrf: { get(): string; set(token: string): void };
+  hold: Pick<FormHold<unknown>, 'take' | 'release' | 'holds' | 'fit'>;
+  /** The reports asked for at once (after a take-back or a report). */
+  refresh(): Promise<void>;
+}
+
+export function stopUi(deps: StopUiDeps) {
+  const { guild, hold } = deps;
+
+  /** A report's Take back pressed: the question in the place of its actions, then the request. */
+  const takeBackClicked = (button: HTMLButtonElement, report: StopReport): void => {
+    const actions = button.closest<HTMLElement>('.report-actions');
+    if (!actions) return;
+    const claim = hold.take(formPlace(actions));
+    if (!claim) return;
+    const before = [...actions.childNodes];
+    const question = renderNode(
+      {
+        tag: 'div',
+        className: 'take-back-question',
+        attributes: { role: 'group', 'aria-label': 'Take back' },
+        children: [
+          { tag: 'p', className: 'form-text', text: takeBackQuestion(report) },
+          {
+            tag: 'div',
+            className: 'form-buttons',
+            children: [
+              {
+                tag: 'button',
+                className: 'press danger',
+                text: 'Take back',
+                attributes: { type: 'button', 'data-confirm-take-back': '' },
+              },
+              {
+                tag: 'button',
+                className: 'press',
+                text: 'Cancel',
+                attributes: { type: 'button', 'data-cancel': '' },
+              },
+            ],
+          },
+        ],
+      },
+      document,
+    );
+    const close = (): void => {
+      actions.replaceChildren(...before);
+      hold.release(claim);
+    };
+    question.addEventListener('click', (event) => {
+      const target = event.target instanceof Element ? event.target.closest('button') : null;
+      if (!(target instanceof HTMLButtonElement)) return;
+      if (target.dataset.cancel !== undefined) {
+        close();
+        button.focus();
+        return;
+      }
+      if (target.dataset.confirmTakeBack === undefined) return;
+      for (const each of question.querySelectorAll('button')) each.disabled = true;
+      void sendStop(deps.csrf.get(), {
+        post: async (token) => {
+          const reply = await fetch(takeBackPath(guild, report), {
+            method: 'POST',
+            credentials: 'same-origin',
+            headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
+            // The version the pressed Take back showed (review F4).
+            body: JSON.stringify(takeBackBody(button.dataset)),
+          });
+          return {
+            status: reply.status,
+            body: (await reply.json().catch(() => undefined)) as unknown,
+          };
+        },
+        me: () => getJson<Me>(`/s/${guild}/api/me`),
+      }).then(async (sent) => {
+        deps.csrf.set(sent.csrf);
+        // Whatever it answered: its words, and the reports as they are now.
+        if (hold.holds(claim)) close();
+        say(sent.text);
+        await deps.refresh();
+      });
+    });
+    actions.replaceChildren(question);
+    hold.fit();
+    question.querySelector<HTMLElement>('button[data-confirm-take-back]')?.focus();
+  };
+
+  return {
+    takeBackClicked,
+
+    /**
+     * Between two lists (B14): a grunt's minutes left kept current, and a report whose end passed
+     * says "Ended" and loses its Take back and its other actions, its popup staying.
+     */
+    tick(root: ParentNode, now: number): void {
+      for (const left of root.querySelectorAll<HTMLElement>('[data-left]')) {
+        const words = badgeWords('end', Number(left.dataset.left), now, 'UTC');
+        left.textContent = words === 'ended' ? ENDED : `${words} left`;
+      }
+      for (const section of root.querySelectorAll<HTMLElement>('.stop-report[data-ends]')) {
+        if (Number(section.dataset.ends) > now || section.classList.contains('ended')) continue;
+        section.classList.add('ended');
+        for (const action of section.querySelectorAll(
+          'button[data-take-back], button[data-same-task]',
+        )) {
+          action.remove();
+        }
+        // The separators left without a part on both sides go with them.
+        for (const actions of section.querySelectorAll('.report-actions')) {
+          const parts = [...actions.children];
+          parts.forEach((part, index) => {
+            const next = parts[index + 1];
+            const sep = part.classList.contains('sep');
+            if (sep && (index === 0 || next === undefined || next.classList.contains('sep'))) {
+              part.remove();
+            }
+          });
+        }
+        const when = section.querySelector('.small > span');
+        if (when) when.textContent = ENDED;
+      }
+    },
+  };
+}
+
+export type StopUi = ReturnType<typeof stopUi>;
````

### Task 5: 8M-9B task 5: filters of the reports at stops, always in sight

Prototype commit: `3617502e2b55bd3e0a575c589c5b131986e263af`

Research by one or several rewards ("one of" when any of its rewards
matches; a reward the game data does not know is no choice), Team GO Rocket
by one or several of who (a grunt type, a lineup by its type through the
server's `typeKey`, a leader, Giovanni, the decoy) or a catch (`shownBy`).
The choices are today's reports' and the pick lists' names, the lists asked
for only when a filter opens (B12). A report a filter hides is neither drawn
nor listed. Kept per browser (`pine-map-stop-filters`, try/catch).

Where it lives (the builder's call): "Filter…" beside the list group's
heading opens its choices under it. Always in sight while one is on: the
group's heading ("Field research · 1 · Rare Candy ×") and its note ("3
hidden by the filter."), a line over the map at the top right with each
layer's filter and its × (on a phone too), and the layer's toggle (dashed,
its title "Field research · Rare Candy"; its row in the sheet "Filter: Rare
Candy").

**Files:**

```
 src/web/client/layer-registry.test.ts            |   5 +++
 src/web/client/layers-ui.ts                      |  59 ++++++++++++++++++++++++++++++----
 src/web/client/list-ui.test.ts                   |  27 ++++++++++++++++
 src/web/client/list-ui.ts                        |   7 +++-
 src/web/client/main.ts                           |   4 +++
 src/web/client/map.css                           | 115 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/party-layer-draw.isolated.test.ts |  34 +++++++++++++++++++-
 src/web/client/party-layer.ts                    |  53 ++++++++++++++++++++++++++++--
 src/web/client/stop-filter-ui.ts                 | 251 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/stop-filter.test.ts               | 136 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/stop-filter.ts                    | 148 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/stop-report-layer.ts              |  10 ++++--
 12 files changed, 835 insertions(+), 14 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/layer-registry.test.ts src/web/client/list-ui.test.ts src/web/client/party-layer-draw.isolated.test.ts src/web/client/stop-filter.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3617502e2b55bd3e0a575c589c5b131986e263af -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-9B task 5: filters of the reports at stops, always in sight`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/layer-registry.test.ts b/src/web/client/layer-registry.test.ts
index f65220c141b9e1461ff455168b68e70496960262..394bd224fce340d8c939ff250856211df2c52740 100644
--- a/src/web/client/layer-registry.test.ts
+++ b/src/web/client/layer-registry.test.ts
@@ -13,6 +13,7 @@ import {
   moreCloses,
   SheetFocus,
   switchLabel,
+  toggleName,
 } from './layers-ui.js';
 import type { ViewStorage } from './view.js';
 
@@ -70,6 +71,10 @@ describe('the layers of the map (plan 8M-7)', () => {
         .filter((layer) => layer.kind === 'live')
         .map((l) => chipLabel(l)),
     ).toEqual(['Raids', 'Trains', 'Meetups', 'Research', 'Rocket']);
+    // A filter on says itself on the toggle: its title and name for a screen reader (goal 5).
+    const research = registry.layers().find((layer) => layer.id === 'research');
+    expect(research && toggleName(research, 'Rare Candy')).toBe('Field research · Rare Candy');
+    expect(research && toggleName(research, undefined)).toBe('Field research');
     expect(
       registry
         .layers()
diff --git a/src/web/client/layers-ui.ts b/src/web/client/layers-ui.ts
index c0418f97a8009cf9ad4ff3b3acb21764eb9240ce..72e2068e3c0303a6b890d8eeddcda0c9604c7f2a 100644
--- a/src/web/client/layers-ui.ts
+++ b/src/web/client/layers-ui.ts
@@ -11,6 +11,11 @@ import type { LayerRegistry, LayerSpec } from './layer-registry.js';
 export interface LayerControls {
   /** Draws the controls anew: who asks, or which layers are offered, changed. */
   refresh(member: boolean): void;
+  /**
+   * A layer's filter in words, or none (plan 8M-9B, goal 5): its toggle marked and named with it,
+   * its row in the sheet saying it.
+   */
+  filtered(id: string, words: string | undefined): void;
 }
 
 /** "Layers · 3". */
@@ -28,6 +33,14 @@ export function chipLabel(spec: LayerSpec): string {
   return spec.short ?? spec.name;
 }
 
+/**
+ * A toggle's whole name, its title and its name for a screen reader: the layer's name, and the
+ * filter on it where one is (plan 8M-9B, goal 5: "Field research · Rare Candy").
+ */
+export function toggleName(spec: LayerSpec, filter: string | undefined): string {
+  return filter === undefined ? spec.name : `${spec.name} · ${filter}`;
+}
+
 /** A layer's switch is named by its layer, for a screen reader (fix round 1). */
 export function switchLabel(spec: LayerSpec): string {
   return spec.name;
@@ -100,6 +113,24 @@ export class SheetFocus {
 
 export function showLayerControls(registry: LayerRegistry, nav: HTMLElement): LayerControls {
   let member = false;
+  /** The filters on, by layer, in words (plan 8M-9B). */
+  const filters = new Map<string, string>();
+  /**
+   * A toggle's whole name and mark: its full name where the row shows it short (B7), and its
+   * filter where one is on (goal 5), for the pointer and a screen reader; marked while filtered.
+   */
+  const named = (button: HTMLElement, spec: LayerSpec): void => {
+    const filter = filters.get(spec.id);
+    const whole = toggleName(spec, filter);
+    button.classList.toggle('filtered', filter !== undefined);
+    if (whole === chipLabel(spec)) {
+      button.removeAttribute('title');
+      button.removeAttribute('aria-label');
+    } else {
+      button.title = whole;
+      button.setAttribute('aria-label', whole);
+    }
+  };
   const sheet = document.createElement('div');
   sheet.className = 'sheet-wrap';
   sheet.hidden = true;
@@ -118,12 +149,8 @@ export function showLayerControls(registry: LayerRegistry, nav: HTMLElement): La
     dot.className = 'dot';
     const name = document.createElement('span');
     name.textContent = chipLabel(spec);
-    // Its whole name where the row shows it short (B7), for the pointer and a screen reader.
-    if (spec.short !== undefined) {
-      button.title = spec.name;
-      button.setAttribute('aria-label', spec.name);
-    }
     button.append(dot, name);
+    named(button, spec);
     button.addEventListener('click', () => {
       toggle(spec.id, !registry.isOn(spec.id));
     });
@@ -215,7 +242,14 @@ export function showLayerControls(registry: LayerRegistry, nav: HTMLElement): La
       small.textContent = spec.hint ?? '';
       const count = document.createElement('small');
       count.dataset.count = spec.id;
-      words.append(name, ...(spec.hint ? [small] : []), count);
+      // Its filter, while one is on (plan 8M-9B).
+      const filter = document.createElement('small');
+      filter.className = 'filter-note';
+      filter.dataset.filterNote = spec.id;
+      const said = filters.get(spec.id);
+      filter.textContent = said === undefined ? '' : `Filter: ${said}`;
+      filter.hidden = said === undefined;
+      words.append(name, ...(spec.hint ? [small] : []), filter, count);
       row.append(words, checkbox(spec, 'switch'));
       panel.append(row);
     }
@@ -256,5 +290,18 @@ export function showLayerControls(registry: LayerRegistry, nav: HTMLElement): La
       member = next;
       draw();
     },
+    filtered(id, words) {
+      if (filters.get(id) === words) return;
+      if (words === undefined) filters.delete(id);
+      else filters.set(id, words);
+      const spec = registry.layers().find((one) => one.id === id);
+      for (const button of nav.querySelectorAll<HTMLElement>(`.chip[data-layer="${id}"]`)) {
+        if (spec) named(button, spec);
+      }
+      for (const note of sheet.querySelectorAll<HTMLElement>(`[data-filter-note="${id}"]`)) {
+        note.textContent = words === undefined ? '' : `Filter: ${words}`;
+        note.hidden = words === undefined;
+      }
+    },
   };
 }
diff --git a/src/web/client/list-ui.test.ts b/src/web/client/list-ui.test.ts
index 80a717c88d1278cf5297696943757d83a067849e..c03f705e3e35a918d39912908a5f94c03c1c19fc 100644
--- a/src/web/client/list-ui.test.ts
+++ b/src/web/client/list-ui.test.ts
@@ -255,6 +255,33 @@ describe('a group of the list with a note (plan 8M-9B)', () => {
     list.show([]);
     expect(said()).toEqual([['empty', 'Nothing is on just now.']]);
   });
+
+  it('puts what its group adds beside its heading and under it (the filters, goal 5)', () => {
+    fakeDocument();
+    const section = new FakeElement('section');
+    const made = (tag: string, text: string) => {
+      const element = new FakeElement(tag);
+      element.textContent = text;
+      return element as unknown as HTMLElement;
+    };
+    const list = new WhatIsOn({
+      section: section as unknown as HTMLElement,
+      registry: { isOn: () => true } as unknown as LayerRegistry,
+      storage: undefined,
+      origin: () => undefined,
+      zone: () => 'America/New_York',
+      units: 'imperial',
+      open: () => false,
+      highlight: () => undefined,
+      detail: () => undefined,
+      groupHead: (kind) => (kind === 'research' ? [made('button', 'Filter…')] : []),
+      groupBody: (kind) => (kind === 'research' ? [made('fieldset', 'Rare Candy')] : []),
+    });
+    list.show([], { research: '2 hidden by the filter.' });
+    const [heading] = section.all('h3');
+    expect(heading?.words().trim()).toBe('Field research · 0 Filter…');
+    expect(section.all('fieldset').map((one) => one.textContent)).toEqual(['Rare Candy']);
+  });
 });
 
 describe('the focus in the list drawn anew (review fix 2)', () => {
diff --git a/src/web/client/list-ui.ts b/src/web/client/list-ui.ts
index 7f8ac4ae8088162824ac6b53db97565b07f71643..23dc09791e0fbece6ac1496ea560c09d03fb3e50 100644
--- a/src/web/client/list-ui.ts
+++ b/src/web/client/list-ui.ts
@@ -43,6 +43,10 @@ export interface WhatIsOnDeps {
    * that nothing is on. Known without it.
    */
   partiesKnown?(): boolean;
+  /** What a group adds beside its heading (plan 8M-9B: its filter in words, ×, "Filter…"). */
+  groupHead?(kind: ListKind): HTMLElement[];
+  /** What a group adds under its heading and note (plan 8M-9B: its filter's choices, open). */
+  groupBody?(kind: ListKind): HTMLElement[];
 }
 
 export class WhatIsOn {
@@ -147,6 +151,7 @@ export class WhatIsOn {
       const list = document.createElement('ul');
       list.className = 'list-lines';
       for (const line of group.lines) list.append(this.item(line, origin, now));
+      title.append(...(deps.groupHead?.(group.kind) ?? []));
       body.push(title);
       if (group.note !== undefined) {
         const note = document.createElement('p');
@@ -154,7 +159,7 @@ export class WhatIsOn {
         note.textContent = group.note;
         body.push(note);
       }
-      body.push(list);
+      body.push(...(deps.groupBody?.(group.kind) ?? []), list);
     }
     // A field of a line's popup keeps the focus where it had it.
     const focused = document.activeElement;
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 3a9da230e4ed2a2a65cc7707f8ba139c0487b696..e08c2ca45b0e413a890f008d18a5fcf406031d78 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -269,6 +269,10 @@ function start(): void {
       const mayReport = me.member && !me.readOnly;
       const raids = showParties(map, guild, me, gyms, names, regions, mayReport, {
         registry,
+        // A filter of the reports at stops in sight on its layer's toggle (plan 8M-9B).
+        filtered: (layer, words) => {
+          controls.filtered(layer, words);
+        },
         afterDraw: () => {
           dots.refresh();
           places.redrawn();
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 11018d6bbe9646bfda8ae69839de435ff569eb3d..d92b0f9e485bf1c6aaed878dafec6a6e06983d52 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -2350,3 +2350,118 @@ path.highlighted {
   margin: 0;
   color: var(--text);
 }
+
+/*
+ * The filters of the reports at stops (plan 8M-9B, goal 5), always in sight while one is on: a
+ * line over the map at the top right with each layer's filter and its ×, the list's heading with
+ * its words and ×, and the toggle marked (dashed) with the words in its title.
+ */
+.filter-line {
+  display: flex;
+  flex-wrap: wrap;
+  justify-content: flex-end;
+  gap: 4px;
+  max-width: 70vw;
+}
+
+.filter-chip {
+  display: inline-flex;
+  align-items: center;
+  gap: 4px;
+  padding: 2px 4px 2px 10px;
+  border: 2px solid var(--line);
+  border-radius: 14px;
+  background: var(--card-bg);
+  color: var(--text);
+  box-shadow: 0 1px 4px var(--shadow);
+  font-size: 13px;
+}
+
+.filter-chip.research {
+  border-color: var(--research);
+}
+
+.filter-chip.rocket {
+  border-color: var(--rocket);
+}
+
+.clear-filter {
+  width: 22px;
+  height: 22px;
+  padding: 0;
+  border: 0;
+  border-radius: 50%;
+  background: var(--secondary);
+  color: var(--secondary-text);
+  font: inherit;
+  line-height: 22px;
+  cursor: pointer;
+}
+
+.clear-filter:hover {
+  background: var(--secondary-hover);
+}
+
+.what-is-on h3 .filter-words {
+  color: var(--text);
+}
+
+.what-is-on h3 .clear-filter {
+  width: 18px;
+  height: 18px;
+  margin-left: 4px;
+  font-size: 12px;
+  line-height: 18px;
+  text-transform: none;
+}
+
+.what-is-on h3 .filter-open {
+  float: right;
+  padding: 0;
+  border: 0;
+  background: none;
+  color: var(--link);
+  font: inherit;
+  font-weight: 500;
+  letter-spacing: 0;
+  text-transform: none;
+  cursor: pointer;
+}
+
+.filter-panel {
+  display: flex;
+  flex-direction: column;
+  gap: 4px;
+  margin: 4px 0 8px;
+  padding: 8px 10px;
+  border: 1px solid var(--line);
+  border-radius: var(--card-radius);
+  background: var(--card-bg);
+}
+
+.filter-panel legend {
+  padding: 0 4px;
+  color: var(--muted);
+  font-size: 13px;
+}
+
+.filter-panel .filter-choice {
+  display: flex;
+  align-items: center;
+  gap: 8px;
+  cursor: pointer;
+}
+
+.filter-panel .press {
+  align-self: flex-start;
+  margin-top: 4px;
+}
+
+.chip.filtered {
+  border-style: dashed;
+}
+
+.sheet-row .filter-note {
+  color: var(--text);
+  font-weight: 600;
+}
diff --git a/src/web/client/party-layer-draw.isolated.test.ts b/src/web/client/party-layer-draw.isolated.test.ts
index 4a1d48c18c20d147c47daab4a7c649357b95e8d3..f929869dfd61288353f4c80707737f61ac6749bd 100644
--- a/src/web/client/party-layer-draw.isolated.test.ts
+++ b/src/web/client/party-layer-draw.isolated.test.ts
@@ -175,6 +175,9 @@ const fake = vi.hoisted(() => {
   /** The contents of the popups opened by themselves (the list of things at one place). */
   const placeList: unknown[] = [];
 
+  /** Those who wait for the list of what is on to be drawn again without a new list. */
+  const renders: Array<() => void> = [];
+
   /** The list of what is on as the party layer made it: whether it is told the parties are known. */
   const list: { partiesKnown?: (() => boolean) | undefined } = {};
 
@@ -190,6 +193,7 @@ const fake = vi.hoisted(() => {
     forms,
     route,
     placeList,
+    renders,
     list,
   };
 });
@@ -256,7 +260,9 @@ vi.mock('./list-ui.js', async (importOriginal) => {
         fake.list.partiesKnown = deps.partiesKnown;
       }
       show() {}
-      render() {}
+      render() {
+        for (const done of fake.renders.splice(0)) done();
+      }
       redrawLine() {}
     },
   };
@@ -1100,4 +1106,30 @@ describe('the reports at stops on the map (plan 8M-9B)', () => {
     markerOf('Yellow Mural 7')?.fire('click', {});
     expect(fake.shown.popupOf).toBe(markerOf('Yellow Mural 7'));
   });
+
+  // Review F10: the pick lists asked for as a filter opens, each time (the browser asks again by
+  // their ETag), a failed answer not kept for good.
+  it("asks for the pick lists each time a layer's filter opens, after a failure too", async () => {
+    const { asked, panel } = await started({ raids: true, stops: STOPS });
+    // No field is typed in here: the filters' checkboxes are none of these buttons.
+    vi.stubGlobal('HTMLInputElement', class {});
+    const list = panel.querySelector('section.what-is-on');
+    /** A control of the list's research group, pressed. */
+    const press = (data: string): void => {
+      const button = new PageElement('button');
+      button.setAttribute(data, 'research');
+      list?.append(button);
+      button.dispatch('click');
+    };
+    const lists = () => asked.filter((url) => url.endsWith('/api/research-options')).length;
+    press('data-filter-open');
+    // The lists' answers (refused here) drawn into the list.
+    await new Promise<void>((resolve) => {
+      fake.renders.push(resolve);
+    });
+    expect(lists()).toBe(1);
+    press('data-filter-done');
+    press('data-filter-open');
+    expect(lists()).toBe(2);
+  });
 });
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index cc2859413ccfa098124708487cf3171dc6631534..0f26a2dc4db76067c29f3346343e5f18565d3463 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -76,6 +76,7 @@ import type { Place } from './distance.js';
 import { stopReportLayer } from './stop-report-layer.js';
 import { plainStopPopup, stopPopup, type StopPopupContext } from './stop-popup.js';
 import { stopUi } from './stop-report-ui.js';
+import { stopFilterUi } from './stop-filter-ui.js';
 import type { StopReport } from './stop-reports.js';
 import type { StopLayer } from './stop-reports.js';
 
@@ -237,6 +238,8 @@ export interface PartyFrame {
   openSpot?: (spot: MapSpot) => HTMLElement | undefined;
   /** Tells `listener` each answer of the Power Spots of the view, or why none came (A4, R1-6). */
   onSpots?: (listener: (spots: readonly MapSpot[] | 'failed' | 'zoom') => void) => void;
+  /** A layer's toggle says its filter of the reports at stops, or none (plan 8M-9B, goal 5). */
+  filtered?: (layer: StopLayer, words: string | undefined) => void;
 }
 
 export interface MapRaids {
@@ -1002,6 +1005,28 @@ export function showParties(
     if (layer instanceof L.Marker || layer instanceof L.Path) return layer.getElement();
     return undefined;
   };
+  /**
+   * The filters of the reports at stops (plan 8M-9B, goal 5): in the list's groups, in sight on the
+   * map and on the toggles; a change draws the reports anew.
+   */
+  const stopFilters = stopFilterUi({
+    map,
+    guild,
+    storage: frame.storage,
+    view: () => stopReports.view,
+    changed: () => {
+      if (view) hold.shown(view);
+    },
+    render: () => {
+      whatIsOn.render();
+    },
+    ...(frame.filtered === undefined ? {} : { filtered: frame.filtered }),
+  });
+  for (const type of ['click', 'change']) {
+    listSection.addEventListener(type, (event) => {
+      if (stopFilters.handled(event.target)) event.stopPropagation();
+    });
+  }
   const whatIsOn = new WhatIsOn({
     section: listSection,
     rendered: () => {
@@ -1009,6 +1034,8 @@ export function showParties(
     },
     // Not "Nothing is on just now." while the reports at stops are drawn without the parties.
     partiesKnown: () => view !== undefined && view !== noParties,
+    groupHead: (kind) => stopFilters.head(kind),
+    groupBody: (kind) => stopFilters.body(kind),
     units: frame.units,
     registry,
     storage: frame.storage,
@@ -1285,6 +1312,8 @@ export function showParties(
         circles: { full: sizes.raidMiddle, small: sizes.raidSmall },
         keep: new Set([...openStop(showing.key), ...openStop(card.key)]),
         interactive,
+        // A filter's reports are neither drawn nor listed (goal 5).
+        shows: (report, layer) => stopFilters.shows(report, layer),
         bind: (marker, key, popup) => withPopup(marker, key, popup),
         tapped: () => false,
         open: (key, marker) => {
@@ -1307,11 +1336,29 @@ export function showParties(
     // trains and raids the map cannot draw, and meetups without a place, keep their line.
     // The reports at stops after the parties (plan 8M-9B), every layer's: the list keeps the
     // groups of the layers on; the research group says when the day's research comes back (B5).
-    const waiting = waitingNote(stopReports.view, now, readerZone());
+    // A filter's reports are left out, and the group says how many it hides (goal 5).
+    const noteOf = (...parts: Array<string | undefined>): string | undefined => {
+      const said = parts.filter((part): part is string => part !== undefined);
+      return said.length === 0 ? undefined : said.join(' ');
+    };
+    const research = noteOf(
+      waitingNote(stopReports.view, now, readerZone()),
+      stopFilters.hiddenNote('research', now),
+    );
+    const rocket = noteOf(stopFilters.hiddenNote('rocket', now));
     whatIsOn.show(
-      [...listLines(next, gyms), ...stopReportLines(stopReports.all(now))],
-      waiting === undefined ? {} : { research: waiting },
+      [
+        ...listLines(next, gyms),
+        ...stopReportLines(
+          stopReports.all(now, (report, layer) => stopFilters.shows(report, layer)),
+        ),
+      ],
+      {
+        ...(research === undefined ? {} : { research }),
+        ...(rocket === undefined ? {} : { rocket }),
+      },
     );
+    stopFilters.shown();
     // The posts of the parties in view, then (after the page's first list, review N6) the rest,
     // asked for ahead, at most `PREFETCH_POSTS` a list (review 8A-3), so that a popup that opens
     // has its post. Not for the reports drawn without the parties (review round 2, R1): the
diff --git a/src/web/client/stop-filter-ui.ts b/src/web/client/stop-filter-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4bc6c6efbc4fe9f705b1c6098b2626ac0072bfca
--- /dev/null
+++ b/src/web/client/stop-filter-ui.ts
@@ -0,0 +1,251 @@
+import * as L from 'leaflet';
+import type {
+  ResearchOptionsView,
+  RocketOptionsView,
+  StopReportsView,
+} from '../../domain/web/stop-report-data.js';
+import { getJson } from './common.js';
+import { renderNode, type PageNode } from './popup.js';
+import {
+  filterChoices,
+  filterWords,
+  hiddenCount,
+  readFilters,
+  shownBy,
+  writeFilters,
+  type StopFilters,
+} from './stop-filter.js';
+import type { StopLayer, StopReport } from './stop-reports.js';
+import type { ViewStorage } from './view.js';
+
+/*
+ * The filters of the reports at stops in the page (plan 8M-9B, goal 5): chosen in the list's group
+ * of each layer ("Filter…" beside its heading opens its choices under it, the pick lists asked for
+ * then, B12), and always in sight while one is on: the group's heading says it with a clear ×
+ * ("Field research · 2 · Rare Candy ×") and how many it hides, a line over the map says it with
+ * its × (`.filter-line`, on a phone too), and the layer's toggle says it (`filtered`). Kept per
+ * browser (`readFilters`).
+ */
+
+/** The layers' names as the filter's line over the map says them. */
+const LAYER_NAMES: Readonly<Record<StopLayer, string>> = {
+  research: 'Field research',
+  rocket: 'Team GO Rocket',
+};
+
+export interface StopFilterUiDeps {
+  map: L.Map;
+  guild: string;
+  storage: ViewStorage | undefined;
+  /** The reports as the page has them now. */
+  view(): StopReportsView | undefined;
+  /** The filters changed: the reports drawn anew (the map and the list). */
+  changed(): void;
+  /** The list drawn anew without a new list (the choices came, the panel opened or closed). */
+  render(): void;
+  /** The layer's toggle says the filter (its title, its row in the sheet), or none. */
+  filtered?(layer: StopLayer, words: string | undefined): void;
+}
+
+const isLayer = (kind: string): kind is StopLayer => kind === 'research' || kind === 'rocket';
+
+export function stopFilterUi(deps: StopFilterUiDeps) {
+  let filters: StopFilters = readFilters(deps.storage);
+  let open: StopLayer | undefined;
+  const lists: { research?: ResearchOptionsView; rocket?: RocketOptionsView } = {};
+  let asking: Promise<void> | undefined;
+
+  const choices = () => filterChoices(deps.view(), lists.research, lists.rocket);
+  const names = (): Map<string, string> => {
+    const all = choices();
+    return new Map([...all.research, ...all.rocket].map((choice) => [choice.value, choice.name]));
+  };
+  const words = (layer: StopLayer): string | undefined => filterWords(filters[layer], names());
+
+  /** The line over the map while a filter is on: each layer's words with its ×. */
+  const line = document.createElement('div');
+  line.className = 'filter-line';
+  line.hidden = true;
+  L.DomEvent.disableClickPropagation(line);
+  const control = new L.Control({ position: 'topright' });
+  control.onAdd = () => line;
+  control.addTo(deps.map);
+
+  const set = (layer: StopLayer, values: readonly string[]): void => {
+    filters = { ...filters, [layer]: values };
+    writeFilters(deps.storage, filters);
+    deps.changed();
+  };
+
+  const clearButton = (layer: StopLayer): PageNode => ({
+    tag: 'button',
+    className: 'clear-filter',
+    text: '×',
+    attributes: {
+      type: 'button',
+      'data-clear-filter': layer,
+      'aria-label': `Clear the filter of ${LAYER_NAMES[layer]}`,
+      title: 'Clear the filter',
+    },
+  });
+
+  /** The words in sight drawn anew: the map's line and the toggles. */
+  const shown = (): void => {
+    const parts: PageNode[] = [];
+    for (const layer of ['research', 'rocket'] as const) {
+      const said = words(layer);
+      deps.filtered?.(layer, said);
+      if (said === undefined) continue;
+      parts.push({
+        tag: 'span',
+        className: `filter-chip ${layer}`,
+        children: [{ tag: 'span', text: `${LAYER_NAMES[layer]} · ${said}` }, clearButton(layer)],
+      });
+    }
+    line.replaceChildren(...parts.map((part) => renderNode(part, document)));
+    line.hidden = parts.length === 0;
+  };
+  line.addEventListener('click', (event) => {
+    const target = event.target instanceof Element ? event.target.closest('button') : null;
+    const layer = target instanceof HTMLButtonElement ? target.dataset.clearFilter : undefined;
+    if (layer !== undefined && isLayer(layer)) set(layer, []);
+  });
+
+  /**
+   * The pick lists, asked for as a filter opens (B12), each time (review F10: the browser asks
+   * again by their ETag, a 304 costing nothing; a failed answer is not kept), not twice at once;
+   * a list that fails keeps the one it had. The list drawn once they came.
+   */
+  const askLists = (): void => {
+    if (asking) return;
+    asking = Promise.allSettled([
+      getJson<ResearchOptionsView>(`/s/${deps.guild}/api/research-options`).then((view) => {
+        lists.research = view;
+      }),
+      getJson<RocketOptionsView>(`/s/${deps.guild}/api/rocket-options`).then((view) => {
+        lists.rocket = view;
+      }),
+    ]).then(() => {
+      asking = undefined;
+      deps.render();
+    });
+  };
+
+  return {
+    /** Whether a report passes the filters (the draw and the list). */
+    shows(report: StopReport, layer: StopLayer): boolean {
+      return shownBy(filters)(report, layer);
+    },
+
+    /** The words in sight, drawn anew with each draw of the reports. */
+    shown,
+
+    /** What a group's note adds: how many its filter hides. */
+    hiddenNote(layer: StopLayer, now: number): string | undefined {
+      const hidden = hiddenCount(deps.view(), filters, layer, now);
+      if (filters[layer].length === 0) return undefined;
+      return hidden === 1 ? '1 hidden by the filter.' : `${String(hidden)} hidden by the filter.`;
+    },
+
+    /** Beside a group's heading: its filter in words with its ×, and "Filter…". */
+    head(kind: string): HTMLElement[] {
+      if (!isLayer(kind)) return [];
+      const said = words(kind);
+      const parts: PageNode[] = [
+        ...(said === undefined
+          ? []
+          : [{ tag: 'span', className: 'filter-words', text: ` · ${said}` }, clearButton(kind)]),
+        {
+          tag: 'button',
+          className: 'filter-open',
+          text: 'Filter…',
+          attributes: {
+            type: 'button',
+            'data-filter-open': kind,
+            'aria-expanded': String(open === kind),
+          },
+        },
+      ];
+      return parts.map((part) => renderNode(part, document));
+    },
+
+    /** Under a group's heading while its filter is open: its choices, then Done. */
+    body(kind: string): HTMLElement[] {
+      if (!isLayer(kind) || open !== kind) return [];
+      const offered = choices()[kind];
+      const chosen = new Set(filters[kind]);
+      const node: PageNode = {
+        tag: 'fieldset',
+        className: 'filter-panel',
+        children: [
+          {
+            tag: 'legend',
+            text:
+              kind === 'research'
+                ? 'Show only research that gives'
+                : 'Show only Team GO Rocket of, or giving',
+          },
+          ...(offered.length === 0
+            ? [{ tag: 'p', className: 'hint', text: 'Nothing to filter by yet.' }]
+            : offered.map((choice): PageNode => ({
+                tag: 'label',
+                className: 'filter-choice',
+                children: [
+                  {
+                    tag: 'input',
+                    attributes: {
+                      type: 'checkbox',
+                      'data-filter-kind': kind,
+                      'data-filter-value': choice.value,
+                      ...(chosen.has(choice.value) ? { checked: '' } : {}),
+                    },
+                  },
+                  { tag: 'span', text: choice.name },
+                ],
+              }))),
+          {
+            tag: 'button',
+            className: 'press',
+            text: 'Done',
+            attributes: { type: 'button', 'data-filter-done': kind },
+          },
+        ],
+      };
+      return [renderNode(node, document)];
+    },
+
+    /** A click or a change in the list that is the filters': true when taken. */
+    handled(target: EventTarget | null): boolean {
+      if (target instanceof HTMLInputElement) {
+        const { filterKind, filterValue } = target.dataset;
+        if (filterKind === undefined || filterValue === undefined || !isLayer(filterKind)) {
+          return false;
+        }
+        const rest = filters[filterKind].filter((value) => value !== filterValue);
+        set(filterKind, target.checked ? [...rest, filterValue] : rest);
+        return true;
+      }
+      const button = target instanceof Element ? target.closest('button') : null;
+      if (!(button instanceof HTMLButtonElement)) return false;
+      const { filterOpen, filterDone, clearFilter } = button.dataset;
+      if (filterOpen !== undefined && isLayer(filterOpen)) {
+        open = open === filterOpen ? undefined : filterOpen;
+        if (open !== undefined) askLists();
+        deps.render();
+        return true;
+      }
+      if (filterDone !== undefined) {
+        open = undefined;
+        deps.render();
+        return true;
+      }
+      if (clearFilter !== undefined && isLayer(clearFilter)) {
+        set(clearFilter, []);
+        return true;
+      }
+      return false;
+    },
+  };
+}
+
+export type StopFilterUi = ReturnType<typeof stopFilterUi>;
diff --git a/src/web/client/stop-filter.test.ts b/src/web/client/stop-filter.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..38cdcd7e7d142f4d17b04a043c18037f46a77578
--- /dev/null
+++ b/src/web/client/stop-filter.test.ts
@@ -0,0 +1,136 @@
+import { describe, expect, it } from 'vitest';
+import {
+  caseGrunt,
+  caseHideout,
+  caseResearch,
+  caseResearchOptions,
+  caseRocketOptions,
+  caseView,
+} from './stop-report-cases.js';
+import {
+  FILTERS_KEY,
+  filterChoices,
+  filterWords,
+  hiddenCount,
+  NO_FILTERS,
+  readFilters,
+  shownBy,
+  writeFilters,
+} from './stop-filter.js';
+import type { ViewStorage } from './view.js';
+
+const CANDY = {
+  kind: 'item' as const,
+  name: 'Rare Candy',
+  value: 'item:rare-candy',
+  quantity: 3,
+  shiny: false,
+};
+const spin = caseResearch(2, { rewards: [CANDY], rewardText: 'Rare Candy ×3' });
+const oneOf = caseResearch(3, {
+  rewards: [
+    caseResearch(1).rewards[0]!,
+    { ...CANDY, kind: 'encounter', name: 'Bagon', value: 'pokemon:bagon' },
+  ],
+});
+const unknown = caseResearch(4, {
+  rewards: [{ ...CANDY, kind: 'encounter', name: 'Missingno', value: null }],
+});
+
+describe('the filters of the reports at stops (plan 8M-9B, goal 5)', () => {
+  it('shows research of a reward chosen, "one of" when any of its rewards is (B12)', () => {
+    const filters = { research: ['pokemon:bagon'], rocket: [] };
+    expect(shownBy(filters)(caseResearch(1), 'research')).toBe(false);
+    expect(shownBy(filters)(oneOf, 'research')).toBe(true);
+    expect(shownBy(filters)(spin, 'research')).toBe(false);
+    // A reward the game data does not know is no choice: such a report is hidden by any filter.
+    expect(shownBy(filters)(unknown, 'research')).toBe(false);
+    // No filter: everything.
+    expect(shownBy(NO_FILTERS)(unknown, 'research')).toBe(true);
+    // A filter of the other layer changes nothing here.
+    expect(shownBy({ research: [], rocket: ['grunt:fire'] })(spin, 'research')).toBe(true);
+  });
+
+  it('shows a grunt of a type chosen, its lineup by its type, a hideout by who, or by a catch', () => {
+    const lineup = caseGrunt(1);
+    const filters = { research: [], rocket: ['grunt:water', 'leader:sierra'] };
+    expect(shownBy(filters)(lineup, 'rocket')).toBe(true);
+    expect(
+      shownBy(filters)(caseGrunt(2, { who: 'grunt:fire', typeKey: 'grunt:fire' }), 'rocket'),
+    ).toBe(false);
+    expect(shownBy(filters)(caseHideout(1), 'rocket')).toBe(false);
+    expect(shownBy({ research: [], rocket: ['leader:arlo'] })(caseHideout(1), 'rocket')).toBe(true);
+    // By a catch: Arlo's Mudkip.
+    expect(shownBy({ research: [], rocket: ['pokemon:mudkip'] })(caseHideout(1), 'rocket')).toBe(
+      true,
+    );
+  });
+
+  it('counts what a filter hides, for the list’s group to say', () => {
+    const view = caseView({ research: [caseResearch(1), spin, oneOf], grunts: [caseGrunt(1)] });
+    expect(hiddenCount(view, { research: ['item:rare-candy'], rocket: [] }, 'research')).toBe(2);
+    expect(hiddenCount(view, { research: ['item:rare-candy'], rocket: [] }, 'rocket')).toBe(0);
+  });
+
+  it('offers the rewards and who of today’s reports and of the pick lists, each once, by name', () => {
+    const view = caseView({
+      research: [spin, unknown],
+      grunts: [caseGrunt(1)],
+      hideouts: [caseHideout(1)],
+    });
+    const none = filterChoices(view, undefined, undefined);
+    expect(none.research.map((one) => one.value)).toEqual(['item:rare-candy']);
+    expect(none.rocket.map((one) => [one.value, one.name])).toEqual([
+      ['grunt:water', 'Water-type grunt'],
+      ['leader:arlo', 'Arlo'],
+      ['pokemon:magikarp', 'Magikarp'],
+      ['pokemon:mudkip', 'Mudkip'],
+    ]);
+    const lists = filterChoices(view, caseResearchOptions(), caseRocketOptions());
+    expect(lists.research.map((one) => one.name)).toEqual(['Bagon', 'Dratini', 'Rare Candy']);
+    expect(lists.rocket.map((one) => one.name)).toEqual([
+      'Water-type grunt',
+      'Fire-type grunt',
+      'Arlo',
+      'Giovanni',
+      'Magikarp',
+      'Mudkip',
+    ]);
+  });
+
+  it('says a filter in sight: the one choice by name, else how many', () => {
+    const names = new Map([['item:rare-candy', 'Rare Candy']]);
+    expect(filterWords([], names)).toBeUndefined();
+    expect(filterWords(['item:rare-candy'], names)).toBe('Rare Candy');
+    expect(filterWords(['item:rare-candy', 'pokemon:bagon'], names)).toBe('2 filters');
+    // One whose name the page has not (yet): one filter.
+    expect(filterWords(['pokemon:bagon'], names)).toBe('1 filter');
+  });
+
+  it('keeps the filters per browser, nothing odd taken, and works where nothing can be kept', () => {
+    const items = new Map<string, string>();
+    const storage: ViewStorage = {
+      getItem: (key) => items.get(key) ?? null,
+      setItem: (key, value) => {
+        items.set(key, value);
+      },
+    };
+    expect(readFilters(storage)).toEqual(NO_FILTERS);
+    writeFilters(storage, { research: ['item:rare-candy'], rocket: [] });
+    expect(readFilters(storage)).toEqual({ research: ['item:rare-candy'], rocket: [] });
+    items.set(FILTERS_KEY, '{"research":"x","rocket":[1,"giovanni"]}');
+    expect(readFilters(storage)).toEqual({ research: [], rocket: ['giovanni'] });
+    const refusing: ViewStorage = {
+      getItem: () => {
+        throw new Error('SecurityError');
+      },
+      setItem: () => {
+        throw new Error('QuotaExceededError');
+      },
+    };
+    expect(readFilters(refusing)).toEqual(NO_FILTERS);
+    expect(() => {
+      writeFilters(refusing, NO_FILTERS);
+    }).not.toThrow();
+  });
+});
diff --git a/src/web/client/stop-filter.ts b/src/web/client/stop-filter.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b319686e2507632f66055aa1cd2786fb1d7d6927
--- /dev/null
+++ b/src/web/client/stop-filter.ts
@@ -0,0 +1,148 @@
+import type {
+  MapReward,
+  ResearchOptionsView,
+  RocketOptionsView,
+  StopReportsView,
+} from '../../domain/web/stop-report-data.js';
+import type { StopLayer, StopReport } from './stop-reports.js';
+import type { ViewStorage } from './view.js';
+
+/*
+ * The filters of the reports at stops (plan 8M-9B, goal 5; the design: "by reward or catch and by
+ * grunt type or leader"): research by one or several rewards (`MapReward.value`; "one of" matches
+ * when any of its rewards does, B12; a reward the game data does not know, `value` null, is no
+ * choice), Team GO Rocket by one or several of who (a grunt type, matched by the grunt's
+ * `typeKey`, a lineup's too; a leader; Giovanni; the decoy) or a catch. The choices are today's
+ * reports' and the pick lists' names (asked only when the filter opens, B12). A report a filter
+ * hides is neither drawn nor listed, and the filter is always in sight (anti-goal: no hidden
+ * rule): the map's line, the list's group and the layer's toggle say it. Kept per browser.
+ */
+
+/** The values chosen per layer: rewards for research; who and catches for Rocket. */
+export interface StopFilters {
+  research: readonly string[];
+  rocket: readonly string[];
+}
+
+export const NO_FILTERS: StopFilters = { research: [], rocket: [] };
+
+/** Where the filters are kept in the browser: one choice for every server, as the layers'. */
+export const FILTERS_KEY = 'pine-map-stop-filters';
+
+/** Whether a report passes the filters of its layer (none: everything does). */
+export function shownBy(filters: StopFilters): (report: StopReport, layer: StopLayer) => boolean {
+  const research = new Set(filters.research);
+  const rocket = new Set(filters.rocket);
+  const any = (rewards: readonly MapReward[], chosen: ReadonlySet<string>) =>
+    rewards.some((reward) => reward.value !== null && chosen.has(reward.value));
+  return (report, layer) => {
+    if (layer === 'research') {
+      return research.size === 0 || ('rewards' in report && any(report.rewards, research));
+    }
+    if (rocket.size === 0) return true;
+    if (!('catches' in report)) return false;
+    const who = 'typeKey' in report ? report.typeKey : report.who;
+    return rocket.has(who) || any(report.catches, rocket);
+  };
+}
+
+/** How many of a layer's reports the filters hide (that have not ended), for its group to say. */
+export function hiddenCount(
+  view: StopReportsView | undefined,
+  filters: StopFilters,
+  layer: StopLayer,
+  now = 0,
+): number {
+  if (!view) return 0;
+  const shows = shownBy(filters);
+  const reports = layer === 'research' ? view.research : [...view.grunts, ...view.hideouts];
+  return reports.filter((report) => report.endsAt > now && !shows(report, layer)).length;
+}
+
+/** A choice of a filter: what it matches and its name. */
+export interface FilterChoice {
+  value: string;
+  name: string;
+}
+
+/** Choices each once by value, in the order met. */
+function once(choices: Iterable<FilterChoice>): FilterChoice[] {
+  const seen = new Map<string, FilterChoice>();
+  for (const choice of choices) if (!seen.has(choice.value)) seen.set(choice.value, choice);
+  return [...seen.values()];
+}
+
+/** The rewards or catches as choices, those the game data knows. */
+function rewardChoices(rewards: Iterable<MapReward>): FilterChoice[] {
+  return [...rewards].flatMap((reward) =>
+    reward.value === null ? [] : [{ value: reward.value, name: reward.name }],
+  );
+}
+
+const byName = (a: FilterChoice, b: FilterChoice) => a.name.localeCompare(b.name);
+
+/**
+ * The choices of the filters: research's rewards by name; Rocket's who (the pick list's order,
+ * then today's reports') and then its catches by name; each once, of today's reports and the pick
+ * lists (where the page asked them).
+ */
+export function filterChoices(
+  view: StopReportsView | undefined,
+  research: ResearchOptionsView | undefined,
+  rocket: RocketOptionsView | undefined,
+): { research: FilterChoice[]; rocket: FilterChoice[] } {
+  const rewards = once(
+    rewardChoices([
+      ...(view?.research ?? []).flatMap((report) => report.rewards),
+      ...(research?.tasks ?? []).flatMap((task) => task.rewards),
+    ]),
+  ).sort(byName);
+  const who = once([
+    ...(rocket?.choices ?? []).map((choice) => ({ value: choice.key, name: choice.name })),
+    ...(view?.grunts ?? []).map((grunt) => ({ value: grunt.typeKey, name: grunt.name })),
+    ...(view?.hideouts ?? []).map((hideout) => ({ value: hideout.who, name: hideout.name })),
+  ]);
+  const catches = once(
+    rewardChoices([
+      ...[...(view?.grunts ?? []), ...(view?.hideouts ?? [])].flatMap((report) => report.catches),
+      ...(rocket?.choices ?? []).flatMap((choice) => choice.catches),
+    ]),
+  ).sort(byName);
+  return { research: rewards, rocket: [...who, ...catches] };
+}
+
+/** A filter in words, as the map, the toggle and the list say it: its one choice, else how many. */
+export function filterWords(
+  values: readonly string[],
+  names: ReadonlyMap<string, string>,
+): string | undefined {
+  const [only, ...more] = values;
+  if (only === undefined) return undefined;
+  if (more.length > 0) return `${String(values.length)} filters`;
+  return names.get(only) ?? '1 filter';
+}
+
+/** The filters kept in this browser; none where nothing (good) is kept. */
+export function readFilters(storage: ViewStorage | undefined): StopFilters {
+  try {
+    const read = JSON.parse(storage?.getItem(FILTERS_KEY) ?? '{}') as unknown;
+    if (typeof read !== 'object' || read === null) return NO_FILTERS;
+    const list = (value: unknown): string[] =>
+      Array.isArray(value)
+        ? value.filter((one): one is string => typeof one === 'string' && one.length <= 100)
+        : [];
+    const kept = read as { research?: unknown; rocket?: unknown };
+    return { research: list(kept.research), rocket: list(kept.rocket) };
+  } catch {
+    return NO_FILTERS;
+  }
+}
+
+/** Keeps the filters; a browser that keeps nothing is left alone. */
+export function writeFilters(storage: ViewStorage | undefined, filters: StopFilters): void {
+  try {
+    storage?.setItem(FILTERS_KEY, JSON.stringify(filters));
+  } catch {
+    // Private mode or a full storage: the filters hold for this visit.
+  }
+}
diff --git a/src/web/client/stop-report-layer.ts b/src/web/client/stop-report-layer.ts
index f9cabb29c85b800bc431ce359a0cc45989c0970b..9cb4ecaf678db95e0a2f529fdd40560071d2b357 100644
--- a/src/web/client/stop-report-layer.ts
+++ b/src/web/client/stop-report-layer.ts
@@ -139,9 +139,13 @@ export function stopReportLayer(deps: StopReportLayerDeps) {
     /** Asks at once (after a report or a take-back from this page). */
     now: (): Promise<void> => poller.now(),
 
-    /** Every report that has not ended, of both layers, by stop: the list's lines. */
-    all(now: number): StopReports[] {
-      return reportsAtStops(view, { on: () => true, now });
+    /** Every report that has not ended and passes the filters, of both layers, by stop: the list's. */
+    all(now: number, shows?: StopPick['shows']): StopReports[] {
+      return reportsAtStops(view, {
+        on: () => true,
+        now,
+        ...(shows === undefined ? {} : { shows }),
+      });
     },
 
     /**
````

### Task 6: 8M-9B task 6: the Report menu's research and Rocket, step 2 at PokéStops

Prototype commit: `8195eb3c918b3885967b49c3c61ffaac7eb61e6a`

Two entries after Max battle (Raid, Max battle, Field research, Team GO
Rocket, Wild spawn, Train, Meetup), `pick: 'stops'`, headed "Report field
research" and "Report Team GO Rocket", with the game's quest symbol (a mask
tinted `--research`) and Team GO Rocket's R.

Step 2 for PokéStops as for Power Spots (B9): the map flies to the reference
point at `PLACES_FROM`, the stops of `/api/stops` for that box drawn whatever
the PokéStops layer says and ringed, the nearest five listed (`onStops` beside
`onSpots`, the words of each kind of place: "The PokéStops could not be
loaded.", "Zoom in to see the PokéStops near here."). A stop with reports is
pickable by its marker (it takes taps then, and lets them through while
another kind is picked). A tap on open map puts no pin and says "Tap a
PokéStop." A stop picked ends step 2 and opens step 3 there (`toStop`): for
now its own popup or card, the forms coming next.

**Files:**

```
 src/web/client/main.ts                           |  5 +++++
 src/web/client/map.css                           | 21 +++++++++++++++++++++
 src/web/client/party-layer-draw.isolated.test.ts | 15 +++++++++++++++
 src/web/client/party-layer.ts                    | 46 +++++++++++++++++++++++++++++++++++++++++-----
 src/web/client/places-ui.ts                      | 34 +++++++++++++++++++++++-----------
 src/web/client/report-flow.ts                    | 38 ++++++++++++++++++++++++++++++--------
 src/web/client/report-menu.test.ts               | 18 +++++++++++++++++-
 src/web/client/report-menu.ts                    | 15 +++++++++++++++
 src/web/client/report-ui.isolated.test.ts        | 61 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/report-ui.ts                      | 77 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++------
 10 files changed, 299 insertions(+), 31 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/party-layer-draw.isolated.test.ts src/web/client/report-menu.test.ts src/web/client/report-ui.isolated.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 8195eb3c918b3885967b49c3c61ffaac7eb61e6a -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-9B task 6: the Report menu's research and Rocket, step 2 at PokéStops`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index e08c2ca45b0e413a890f008d18a5fcf406031d78..d9b4aaeb79b120c25e8194573c3b43c10c945bf4 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -300,6 +300,11 @@ function start(): void {
         onSpots: (listener) => {
           places.onSpots(listener);
         },
+        // A report at a stop's step 2 and 3 (plan 8M-9B, B9), as the Power Spots'.
+        onStops: (listener) => {
+          places.onStops(listener);
+        },
+        openStop: (stop) => places.openStop(stop),
         routeMode: (on) => {
           routeFocus.set(on);
         },
diff --git a/src/web/client/map.css b/src/web/client/map.css
index d92b0f9e485bf1c6aaed878dafec6a6e06983d52..243729c6b400d112b73e4278653095262d4f660f 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -819,6 +819,27 @@ a {
   opacity: 1;
 }
 
+/*
+ * Plan 8M-9B (B9): the PokéStops picked for a report at a stop, a stop with reports by its marker
+ * ringed as the dots are; while another kind is picked the stops' markers are dimmed with the rest.
+ */
+.pick-stops .stop-icon .ring {
+  outline: 3px solid var(--primary);
+  outline-offset: 1px;
+}
+
+.report-picking:not(.pick-stops) .stop-icon,
+.pick-stops .raid-icon,
+.pick-stops .cluster {
+  opacity: 0.35;
+}
+
+.report-pick .pick-note {
+  margin: 0;
+  color: var(--text);
+  font-weight: 600;
+}
+
 /* A place's larger target to tap while it is picked (R1-10): clear, never dimmed or drawn. */
 .report-picking .leaflet-overlay-pane path.place-target {
   opacity: 0;
diff --git a/src/web/client/party-layer-draw.isolated.test.ts b/src/web/client/party-layer-draw.isolated.test.ts
index f929869dfd61288353f4c80707737f61ac6749bd..2f9d1893a6a26083c72edf8c3df0332b96341914 100644
--- a/src/web/client/party-layer-draw.isolated.test.ts
+++ b/src/web/client/party-layer-draw.isolated.test.ts
@@ -1075,6 +1075,21 @@ describe('the reports at stops on the map (plan 8M-9B)', () => {
     expect(fake.list.partiesKnown?.()).toBe(true);
   });
 
+  // B9: a stop with reports is pickable in the Report button's step 2 of a report at a stop.
+  it("takes a stop's marker in research's step 2 as its stop, and step 3 opens there", async () => {
+    const { markerOf, raids, chooseReport } = await started({ raids: true, stops: STOPS });
+    chooseReport('research');
+    expect(raids.forcedPlaces('stops')).toBe(true);
+    // Its marker takes taps while stops are picked.
+    expect(markerOf('Yellow Mural 5')?.options.interactive).toBe(true);
+    markerOf('Yellow Mural 5')?.fire('click', {});
+    expect(raids.forcedPlaces('stops')).toBe(false);
+    expect(fake.shown.popupOf).toBe(markerOf('Yellow Mural 5'));
+    // While gyms are picked it lets taps through, as the rings do.
+    chooseReport('raid');
+    expect(markerOf('Yellow Mural 5')?.options.interactive).toBe(false);
+  });
+
   // B3: a report and a party at one stop, one tap lists both.
   it('lists a meetup at a stop and its reports for a tap on either', async () => {
     const at = caseStop(5);
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 0f26a2dc4db76067c29f3346343e5f18565d3463..b01d522486744204c77c4441a653c3d4db3a0341 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -240,6 +240,10 @@ export interface PartyFrame {
   onSpots?: (listener: (spots: readonly MapSpot[] | 'failed' | 'zoom') => void) => void;
   /** A layer's toggle says its filter of the reports at stops, or none (plan 8M-9B, goal 5). */
   filtered?: (layer: StopLayer, words: string | undefined) => void;
+  /** Tells `listener` each answer of the PokéStops of the view, or why none came (8M-9B, B9). */
+  onStops?: (listener: (stops: readonly MapSpot[] | 'failed' | 'zoom') => void) => void;
+  /** A PokéStop's own popup opened at it, whatever the layers draw (step 3 at a stop, B9). */
+  openStop?: (stop: MapSpot) => HTMLElement | undefined;
 }
 
 export interface MapRaids {
@@ -289,7 +293,7 @@ export interface MapRaids {
    * A PokéStop of the map's layer tapped: in the Report button's step 2 of a spawn or a max battle
    * the pin at its place (review B6), as a gym tapped is; true says its popup is not wanted.
    */
-  stopTapped(stop: { lat: number; lon: number }): boolean;
+  stopTapped(stop: MapSpot): boolean;
   /**
    * The PokéStops or Power Spots are to be tapped (the Report button's step 2, A4): drawn whatever
    * their layer says, as `forced` draws the gyms.
@@ -1311,11 +1315,20 @@ export function showParties(
         size,
         circles: { full: sizes.raidMiddle, small: sizes.raidSmall },
         keep: new Set([...openStop(showing.key), ...openStop(card.key)]),
-        interactive,
+        // A stop with reports is pickable in the Report button's step 2 of a report at a stop
+        // (B9): its marker takes the tap then, the other kinds' let it through as the rings do.
+        interactive:
+          drawn.clickable && !meetupForms.picking() && (!report.inTools() || report.picks('stops')),
         // A filter's reports are neither drawn nor listed (goal 5).
         shows: (report, layer) => stopFilters.shows(report, layer),
         bind: (marker, key, popup) => withPopup(marker, key, popup),
-        tapped: () => false,
+        tapped: (at) =>
+          report.stopClicked({
+            id: at.stop.key,
+            title: at.stop.name,
+            lat: at.stop.lat,
+            lon: at.stop.lon,
+          }),
         open: (key, marker) => {
           openAt(key, marker);
         },
@@ -1707,6 +1720,21 @@ export function showParties(
     }
   };
 
+  /**
+   * A PokéStop's own popup opened at it (plan 8M-9B, B9: step 3 of a report at a stop): the popup
+   * or card of its reports where they are drawn, else its plain popup; the element that shows it.
+   */
+  const openStopAt = (stop: MapSpot): HTMLElement | undefined => {
+    const layer = popups.get(`stop:${stop.id}`);
+    if (!layer) return frame.openStop?.(stop);
+    layer.openPopup();
+    return (
+      document.querySelector<HTMLElement>('.party-card:not([hidden]) .stop-popup') ??
+      showing.popup?.getElement() ??
+      undefined
+    );
+  };
+
   /** The battle that stands at a Power Spot opened on its own marker (true), where there is one. */
   const openBattle = (spotId: string): boolean => {
     const max = view?.maxes.find((one) => one.spotId === spotId);
@@ -1785,6 +1813,13 @@ export function showParties(
     onSpots: (listener) => {
       frame.onSpots?.(listener);
     },
+    onStops: (listener) => {
+      frame.onStops?.(listener);
+    },
+    // A report at a stop's step 3 (B9): the stop's own popup (or card) opened at it.
+    toStop: (_kind, stop) => {
+      openStopAt(stop);
+    },
   });
   report.refresh();
 
@@ -1868,8 +1903,9 @@ export function showParties(
     spotControls: (spot) => (reportOffered(mayReport, view) ? [maxForms.maxControl(spot)] : []),
     battleSpots: () => battleSpots,
     openBattle,
-    // A point of the map at the stop: its pin in step 2 (review B6), as a gym tapped is.
-    stopTapped: (stop) => report.mapClicked({ lat: stop.lat, lon: stop.lon }),
+    // A PokéStop's dot in step 2: step 3 of a report at a stop (B9), the pin of a spawn or a max
+    // battle at its place (review B6).
+    stopTapped: (stop) => report.stopClicked(stop),
     gymTapped: (gym, own) => {
       const target: PlacedThing = {
         key: `gym-dot:${gym.id}`,
diff --git a/src/web/client/places-ui.ts b/src/web/client/places-ui.ts
index c5d2bcee30da63010e9518745b61677158126a07..314a84c736ebfeeef76eeaffe16e572e80908781 100644
--- a/src/web/client/places-ui.ts
+++ b/src/web/client/places-ui.ts
@@ -142,8 +142,12 @@ export interface ShownPlaces {
   redrawn(): void;
   /** A Power Spot's popup opened at it, whether its dot is drawn or not (plan 8M-9A, A6). */
   openSpot(spot: PlaceSpot): HTMLElement | undefined;
+  /** A PokéStop's popup opened at it, whether its dot is drawn or not (plan 8M-9B, B9). */
+  openStop(stop: PlaceSpot): HTMLElement | undefined;
   /** Tells `listener` each answer of the Power Spots of the view, or why none came (step 2, R1-6). */
   onSpots(listener: (spots: readonly PlaceSpot[] | 'failed' | 'zoom') => void): void;
+  /** Tells `listener` each answer of the PokéStops of the view (plan 8M-9B, B9), as `onSpots`. */
+  onStops(listener: (stops: readonly PlaceSpot[] | 'failed' | 'zoom') => void): void;
 }
 
 export function showPlaces(
@@ -161,10 +165,14 @@ export function showPlaces(
 ): ShownPlaces {
   const checks: Array<() => void> = [];
   const redraws: Array<() => void> = [];
-  const spotListeners: Array<(spots: readonly PlaceSpot[] | 'failed' | 'zoom') => void> = [];
-  /** Tells the listeners of the Power Spots an answer, or why none came (R1-6). */
-  const toldSpots = (answer: readonly PlaceSpot[] | 'failed' | 'zoom'): void => {
-    for (const listener of spotListeners) listener(answer);
+  /** Who hears of the places of the view, by layer (the PokéStops' since plan 8M-9B, B9). */
+  const placeListeners: Record<
+    'stops' | 'spots',
+    Array<(places: readonly PlaceSpot[] | 'failed' | 'zoom') => void>
+  > = { stops: [], spots: [] };
+  /** Tells a layer's listeners an answer, or why none came (R1-6). */
+  const told = (layer: 'stops' | 'spots', answer: readonly PlaceSpot[] | 'failed' | 'zoom') => {
+    for (const listener of placeListeners[layer]) listener(answer);
   };
   /**
    * A place's popup at it: its name, as text of an element of ours (Leaflet sets a string as
@@ -274,16 +282,16 @@ export function showPlaces(
       show: (view) => {
         last = view;
         draw(view);
-        if (layer.id === 'spots') {
-          const spots = view.stops.map(([id, lat, lon, title]) => ({ id, title, lat, lon }));
-          toldSpots(spots);
-        }
+        told(
+          layer.id,
+          view.stops.map(([id, lat, lon, title]) => ({ id, title, lat, lon })),
+        );
       },
       more: (more) => {
         quiet.set(layer.id, more ? MORE_THAN_SHOWN[layer.id] : undefined);
       },
       failed: () => {
-        if (layer.id === 'spots') toldSpots('failed');
+        told(layer.id, 'failed');
       },
       delayMs: 300,
       setTimer: (run, ms) => {
@@ -300,7 +308,7 @@ export function showPlaces(
         group.clearLayers();
         quiet.set(layer.id, undefined);
         registry.setCount(layer.id, 0);
-        if (layer.id === 'spots') toldSpots('zoom');
+        told(layer.id, 'zoom');
       },
     });
     const wanted = (): boolean =>
@@ -331,8 +339,12 @@ export function showPlaces(
       for (const redraw of redraws) redraw();
     },
     openSpot: (spot) => placePopup('spots', spot),
+    openStop: (stop) => placePopup('stops', stop),
     onSpots: (listener) => {
-      spotListeners.push(listener);
+      placeListeners.spots.push(listener);
+    },
+    onStops: (listener) => {
+      placeListeners.stops.push(listener);
     },
   };
 }
diff --git a/src/web/client/report-flow.ts b/src/web/client/report-flow.ts
index 863ecd3e15289e8c237f1ec6d8599c28b3369234..21edd72fe56907e624839048ba84e4d67adcc1cd 100644
--- a/src/web/client/report-flow.ts
+++ b/src/web/client/report-flow.ts
@@ -78,19 +78,35 @@ export function regionHolding(place: LatLon, regions: GeoView['regions']): numbe
  */
 export type Nearest = readonly NearLine[] | 'loading' | 'failed' | 'zoom';
 
-/** What step 2 says of the Power Spots while it has none to list (R1-6). */
-const NEAREST_WORDS: Readonly<Record<Exclude<Nearest, readonly NearLine[]>, string>> = {
-  loading: 'Finding the nearest…',
-  failed: 'The Power Spots could not be loaded. Tap the map for an unlisted power spot.',
-  zoom: 'Zoom in to see the Power Spots near here.',
+/**
+ * What step 2 says of the places it asks for while it has none to list, by the kind of place
+ * (R1-6; the PokéStops since plan 8M-9B, B9: a report needs a stop, so no pin is offered).
+ */
+const NEAREST_WORDS: Readonly<
+  Record<'spots' | 'stops', Record<Exclude<Nearest, readonly NearLine[]>, string>>
+> = {
+  spots: {
+    loading: 'Finding the nearest…',
+    failed: 'The Power Spots could not be loaded. Tap the map for an unlisted power spot.',
+    zoom: 'Zoom in to see the Power Spots near here.',
+  },
+  stops: {
+    loading: 'Finding the nearest…',
+    failed: 'The PokéStops could not be loaded. Try again in a moment.',
+    zoom: 'Zoom in to see the PokéStops near here.',
+  },
 };
 
+/** What step 2 says of a tap on open map while it picks PokéStops (plan 8M-9B): no pin. */
+export const TAP_A_STOP = 'Tap a PokéStop.';
+
 /** The nearest places as buttons (`data-report-near`), or what is said while it has none. */
-function nearestPart(nearest: Nearest | undefined): PageNode[] {
+function nearestPart(nearest: Nearest | undefined, pick: ReportPick): PageNode[] {
   if (nearest === undefined) return [];
   const label: PageNode = { tag: 'div', className: 'near-label', text: 'Nearest' };
   if (typeof nearest === 'string') {
-    return [label, { tag: 'p', className: 'near-none', text: NEAREST_WORDS[nearest] }];
+    const words = NEAREST_WORDS[pick === 'stops' ? 'stops' : 'spots'];
+    return [label, { tag: 'p', className: 'near-none', text: words[nearest] }];
   }
   if (nearest.length === 0) {
     return [label, { tag: 'p', className: 'near-none', text: 'None near here.' }];
@@ -156,12 +172,18 @@ export function pickLive(
   nearest?: Nearest,
   pin?: LatLon,
   refused?: string,
+  /** What a tap said that took nothing (plan 8M-9B: "Tap a PokéStop."). */
+  note?: string,
 ): PageNode {
   return {
     tag: 'div',
     className: 'pick-live',
     attributes: { 'aria-live': 'polite', 'data-pick-live': '' },
-    children: [...pinPart(kind, pin, refused), ...nearestPart(nearest)],
+    children: [
+      ...(note === undefined ? [] : [{ tag: 'p', className: 'pick-note', text: note }]),
+      ...pinPart(kind, pin, refused),
+      ...nearestPart(nearest, kind.pick),
+    ],
   };
 }
 
diff --git a/src/web/client/report-menu.test.ts b/src/web/client/report-menu.test.ts
index b54a8a6a12b9ef042bff46a6d7a2241ccf51f5f9..7dc16dd7ae6b2601d852cca3bb72fed812581fb4 100644
--- a/src/web/client/report-menu.test.ts
+++ b/src/web/client/report-menu.test.ts
@@ -16,10 +16,13 @@ const tagged = (node: PageNode, tag: string): PageNode[] => [
 ];
 
 describe("the Report button's step 1 (plan 8M-9A)", () => {
-  it('offers, in order, raids, max battles, wild spawns, trains and meetups, each picked its way', () => {
+  it('offers, in order, raids, max battles, research, Rocket, wild spawns, trains and meetups, each picked its way', () => {
     expect(REPORT_KINDS.map((kind) => [kind.id, kind.label, kind.pick])).toEqual([
       ['raid', 'Raid', 'gyms'],
       ['max', 'Max battle', 'spots'],
+      // Plan 8M-9B: reports at stops, a PokéStop tapped.
+      ['research', 'Field research', 'stops'],
+      ['rocket', 'Team GO Rocket', 'stops'],
       ['spawn', 'Wild spawn', 'point'],
       ['train', 'Train', 'form'],
       ['meetup', 'Meetup', 'form'],
@@ -32,6 +35,8 @@ describe("the Report button's step 1 (plan 8M-9A)", () => {
     expect(REPORT_KINDS.map((kind) => kind.heading)).toEqual([
       'Report a raid',
       'Report a max battle',
+      'Report field research',
+      'Report Team GO Rocket',
       'Report a wild spawn',
       'Start a train',
       'Make a meetup',
@@ -45,6 +50,8 @@ describe("the Report button's step 1 (plan 8M-9A)", () => {
       'What are you reporting?',
       'Raid',
       'Max battle',
+      'Field research',
+      'Team GO Rocket',
       'Wild spawn',
       'Train',
       'Meetup',
@@ -54,6 +61,8 @@ describe("the Report button's step 1 (plan 8M-9A)", () => {
     expect(buttons.map((button) => button.attributes?.['data-report-kind'])).toEqual([
       'raid',
       'max',
+      'research',
+      'rocket',
       'spawn',
       'train',
       'meetup',
@@ -63,6 +72,7 @@ describe("the Report button's step 1 (plan 8M-9A)", () => {
     // The game's pictures as pictures, Pine's own drawn into a place of their own.
     expect(tagged(menu, 'img').map((img) => img.attributes?.src)).toEqual([
       REPORT_ICONS.raid.kind === 'picture' ? REPORT_ICONS.raid.src : '',
+      REPORT_ICONS.rocket.kind === 'picture' ? REPORT_ICONS.rocket.src : '',
       REPORT_ICONS.spawn.kind === 'picture' ? REPORT_ICONS.spawn.src : '',
     ]);
     expect(
@@ -70,5 +80,11 @@ describe("the Report button's step 1 (plan 8M-9A)", () => {
         .filter((span) => span.attributes?.['data-shape'] !== undefined)
         .map((span) => span.attributes?.['data-shape']),
     ).toEqual(['max', 'train', 'meetup']);
+    // The game's quest symbol as a mask in research's color (plan 8M-9B, B17).
+    expect(
+      tagged(menu, 'span')
+        .filter((span) => span.attributes?.['data-mask'] !== undefined)
+        .map((span) => span.attributes?.['data-mask']),
+    ).toEqual(['research']);
   });
 });
diff --git a/src/web/client/report-menu.ts b/src/web/client/report-menu.ts
index 513ada14c71da969f4ad7c6f912e94b4bbf873cc..fe76cf7709c6a603af4024624f230273b0692c86 100644
--- a/src/web/client/report-menu.ts
+++ b/src/web/client/report-menu.ts
@@ -38,6 +38,21 @@ export const REPORT_KINDS: readonly ReportKind[] = [
     icon: REPORT_ICONS.max,
     pick: 'spots',
   },
+  // Reports at stops (plan 8M-9B): a PokéStop tapped.
+  {
+    id: 'research',
+    label: 'Field research',
+    heading: 'Report field research',
+    icon: REPORT_ICONS.research,
+    pick: 'stops',
+  },
+  {
+    id: 'rocket',
+    label: 'Team GO Rocket',
+    heading: 'Report Team GO Rocket',
+    icon: REPORT_ICONS.rocket,
+    pick: 'stops',
+  },
   {
     id: 'spawn',
     label: 'Wild spawn',
diff --git a/src/web/client/report-ui.isolated.test.ts b/src/web/client/report-ui.isolated.test.ts
index a0229455ed88dc959d99cd8a95182aa35b55c2f4..6be15ec9304c3396314a08107966592eaf85a8e2 100644
--- a/src/web/client/report-ui.isolated.test.ts
+++ b/src/web/client/report-ui.isolated.test.ts
@@ -118,6 +118,7 @@ function started(more: Partial<ReportFlowDeps> = {}) {
     spawnAt: (point) => calls.push(`spawn at ${String(point.lat)} ${free()}`),
     startTrain: (region) => calls.push(`train ${String(region)}`),
     startMeetup: () => calls.push('meetup'),
+    toStop: (id, stop) => calls.push(`${id} at ${stop.title} ${free()}`),
     ...more,
   };
   const flow = new ReportFlow(deps);
@@ -355,6 +356,66 @@ describe("the Report button's step 2 per kind and step 3 (plan 8M-9A, A4 to A6)"
     }
   });
 
+  // Plan 8M-9B (B9): step 2 for stops as for Power Spots.
+  it('flies to the PokéStops, lists the nearest, and opens the kind’s step 3 at the stop tapped', () => {
+    for (const id of ['research', 'rocket']) {
+      const { flow, calls, shown, land, hold } = started();
+      flow.choose(kind(id));
+      expect(calls).toContain('fly 40.44');
+      expect(flow.picks('stops')).toBe(true);
+      expect(shown()).toEqual(expect.arrayContaining(['Tap a PokéStop on the map.']));
+      land();
+      flow.stopsCame('failed');
+      expect(shown()).toContain('The PokéStops could not be loaded. Try again in a moment.');
+      flow.stopsCame('zoom');
+      expect(shown()).toContain('Zoom in to see the PokéStops near here.');
+      flow.stopsCame([
+        { id: 'stop-1', title: 'Yellow Mural', lat: 40.4405, lon: -79.95 },
+        { id: 'stop-2', title: 'Blue Bench', lat: 40.442, lon: -79.95 },
+      ]);
+      expect(shown()).toEqual(expect.arrayContaining(['Yellow Mural', 'Blue Bench']));
+      // A tap on open map puts no pin: a report needs a stop.
+      calls.length = 0;
+      expect(flow.mapClicked({ lat: 40.45, lon: -79.95 })).toBe(true);
+      expect(calls).toEqual(['live']);
+      expect(shown()).toContain('Tap a PokéStop.');
+      // A stop tapped (its dot, or the marker of its reports): step 3 there, the hold free first.
+      calls.length = 0;
+      expect(
+        flow.stopClicked({ id: 'stop-2', title: 'Blue Bench', lat: 40.442, lon: -79.95 }),
+      ).toBe(true);
+      expect(calls.at(-1)).toBe(`${id} at Blue Bench free`);
+      expect(hold.editing).toBe(false);
+    }
+    // A line of the nearest picks it as a tap does.
+    const { flow, calls } = started();
+    flow.choose(kind('research'));
+    flow.stopsCame([{ id: 'stop-1', title: 'Yellow Mural', lat: 40.4405, lon: -79.95 }]);
+    flow.nearPicked('stop-1');
+    expect(calls.at(-1)).toBe('research at Yellow Mural free');
+  });
+
+  it('takes a stop’s tap while another kind is picked, and gives it up outside step 2', () => {
+    const { flow, calls } = started();
+    expect(flow.stopClicked({ id: 'stop-1', title: 'Yellow Mural', lat: 40.44, lon: -79.95 })).toBe(
+      false,
+    );
+    flow.choose(kind('raid'));
+    calls.length = 0;
+    expect(flow.stopClicked({ id: 'stop-1', title: 'Yellow Mural', lat: 40.44, lon: -79.95 })).toBe(
+      true,
+    );
+    expect(calls).toEqual([]);
+    // A spawn's step 2 puts the pin at the stop (review B6), as before.
+    flow.cancel();
+    flow.choose(kind('spawn'));
+    calls.length = 0;
+    expect(flow.stopClicked({ id: 'stop-1', title: 'Yellow Mural', lat: 40.44, lon: -79.95 })).toBe(
+      true,
+    );
+    expect(calls).toContain('pin 40.44');
+  });
+
   it('opens a train with its region prefilled and a meetup with its picking, no step 2', () => {
     const { flow, hold, calls } = started();
     flow.choose(kind('train'));
diff --git a/src/web/client/report-ui.ts b/src/web/client/report-ui.ts
index 3ff742bcd237eb1108fe63d06bb8f85f111cf151..26802a1104c70ffc749916583ef7840e9396f432 100644
--- a/src/web/client/report-ui.ts
+++ b/src/web/client/report-ui.ts
@@ -12,6 +12,7 @@ import {
   nearestLines,
   pickBox,
   pickLive,
+  TAP_A_STOP,
   regionHolding,
   type NearPlace,
   type Nearest,
@@ -109,6 +110,11 @@ export interface ReportFlowDeps {
    */
   startTrain(region: number | undefined): void;
   startMeetup(): void;
+  /**
+   * Research's or Team GO Rocket's step 3 at a PokéStop (plan 8M-9B, B9): the research form in the
+   * side pane, the Rocket form in the stop's popup, with the stop.
+   */
+  toStop(kind: 'research' | 'rocket', stop: MapSpot): void;
 }
 
 /**
@@ -127,6 +133,8 @@ export class ReportFlow {
         refused: string | undefined;
         /** The map on its way to the Power Spots (R2-4): its zoom on the way says nothing. */
         flying: boolean;
+        /** What a tap that took nothing said (plan 8M-9B: "Tap a PokéStop."), if so. */
+        note: string | undefined;
       }
     | undefined;
 
@@ -170,6 +178,7 @@ export class ReportFlow {
       pin: undefined,
       refused: undefined,
       flying: false,
+      note: undefined,
     };
     deps.closePopup();
     if (kind.pick === 'gyms') {
@@ -182,9 +191,10 @@ export class ReportFlow {
       }));
       this.picking.places = new Map(gyms.map((gym) => [gym.id, gym]));
       this.picking.nearest = nearestLines(gyms, origin, deps.units);
-    } else if (kind.pick === 'spots') {
+    } else if (kind.pick === 'spots' || kind.pick === 'stops') {
       // A4: the map flies to where you are (else stays at its middle) at the zoom the Power Spots
-      // are drawn from, whose answer for that box lists the nearest (`spotsCame`).
+      // are drawn from, whose answer for that box lists the nearest (`spotsCame`); the PokéStops
+      // alike (plan 8M-9B, B9: `stopsCame`).
       this.picking.nearest = 'loading';
       this.picking.flying = true;
       const flight = this.picking;
@@ -205,7 +215,9 @@ export class ReportFlow {
    */
   private draw(): void {
     const open = this.picking;
-    if (open) this.deps.showLive(pickLive(open.kind, open.nearest, open.pin, open.refused));
+    if (open) {
+      this.deps.showLive(pickLive(open.kind, open.nearest, open.pin, open.refused, open.note));
+    }
   }
 
   /**
@@ -339,14 +351,45 @@ export class ReportFlow {
     return battle && pick !== undefined;
   }
 
-  /** A point of the map tapped: in step 2 of a max battle or a spawn, the pin there (true). */
+  /**
+   * A point of the map tapped: in step 2 of a max battle or a spawn, the pin there (true); of a
+   * report at a stop, nothing but "Tap a PokéStop." (plan 8M-9B: a report needs a stop, no pin).
+   */
   mapClicked(point: LatLon): boolean {
-    const pick = this.picking?.kind.pick;
+    const open = this.picking;
+    const pick = open?.kind.pick;
+    if (open && pick === 'stops') {
+      open.note = TAP_A_STOP;
+      this.draw();
+      return true;
+    }
     if (pick !== 'point' && pick !== 'spots') return false;
     this.pinAt(point);
     return true;
   }
 
+  /** A PokéStop picked in step 2 of a report at a stop (plan 8M-9B): its kind's step 3 there. */
+  private stopPicked(stop: MapSpot): void {
+    const open = this.picking;
+    if (!open || (open.kind.id !== 'research' && open.kind.id !== 'rocket')) return;
+    const kind = open.kind.id;
+    this.toStep3();
+    this.deps.toStop(kind, stop);
+  }
+
+  /**
+   * A PokéStop tapped (its dot, or the marker of its reports; B9): in step 2 of a report at a stop,
+   * step 3 there; of a spawn or a max battle, the pin at its place (review B6); of another kind,
+   * nothing (its marker dimmed). True: its own popup is not wanted.
+   */
+  stopClicked(stop: MapSpot): boolean {
+    const pick = this.picking?.kind.pick;
+    if (pick === undefined) return false;
+    if (pick === 'stops') this.stopPicked(stop);
+    else if (pick === 'point' || pick === 'spots') this.pinAt({ lat: stop.lat, lon: stop.lon });
+    return true;
+  }
+
   /** "Report here" on the pin's line: step 3 there. */
   pinPicked(): void {
     const open = this.picking;
@@ -367,6 +410,8 @@ export class ReportFlow {
       if (gym) this.gymPicked(gym);
     } else if (open.kind.pick === 'spots') {
       this.spotPicked({ id: place.id, title: place.name, lat: place.lat, lon: place.lon });
+    } else if (open.kind.pick === 'stops') {
+      this.stopPicked({ id: place.id, title: place.name, lat: place.lat, lon: place.lon });
     }
   }
 
@@ -375,8 +420,21 @@ export class ReportFlow {
    * step 2 of a max battle lists the nearest, or says why it has none.
    */
   spotsCame(answer: readonly MapSpot[] | 'failed' | 'zoom'): void {
+    this.placesCame('spots', answer);
+  }
+
+  /** The PokéStops of the view, as the Power Spots' (plan 8M-9B, B9): a report at a stop's. */
+  stopsCame(answer: readonly MapSpot[] | 'failed' | 'zoom'): void {
+    this.placesCame('stops', answer);
+  }
+
+  /** The places of the view came for the step 2 that asks for them: its nearest, or why none. */
+  private placesCame(
+    pick: 'spots' | 'stops',
+    answer: readonly MapSpot[] | 'failed' | 'zoom',
+  ): void {
     const open = this.picking;
-    if (open?.kind.pick !== 'spots') return;
+    if (open?.kind.pick !== pick) return;
     if (typeof answer === 'string') {
       // On its way the map passes zooms the Power Spots are not drawn from (R2-4).
       if (answer === 'zoom' && open.flying) return;
@@ -423,6 +481,8 @@ export interface ReportUiDeps extends Omit<
   showMap(): void;
   /** Tells `listener` each answer of the Power Spots of the view, or why there is none (A4, R1-6). */
   onSpots(listener: (spots: readonly MapSpot[] | 'failed' | 'zoom') => void): void;
+  /** Tells `listener` each answer of the PokéStops of the view, or why none came (B9). */
+  onStops(listener: (stops: readonly MapSpot[] | 'failed' | 'zoom') => void): void;
 }
 
 const SVG = 'http://www.w3.org/2000/svg';
@@ -562,6 +622,9 @@ export function reportUi(deps: ReportUiDeps) {
       pin.setLatLng([point.lat, point.lon]).addTo(map);
     },
   });
+  deps.onStops((answer) => {
+    flow.stopsCame(answer);
+  });
   deps.onSpots((answer) => {
     flow.spotsCame(answer);
   });
@@ -657,6 +720,8 @@ export function reportUi(deps: ReportUiDeps) {
       battle = false,
     ) => flow.spotClicked(spot, battle),
     mapClicked: (point: LatLon) => flow.mapClicked(point),
+    /** A PokéStop tapped, its dot or its reports' marker (plan 8M-9B, B9). */
+    stopClicked: (stop: MapSpot) => flow.stopClicked(stop),
     /** The Report button's step 2 of a max battle (← Pick a Power Spot of the max form, R1-4). */
     pickSpots: () => {
       const max = REPORT_KINDS.find((kind) => kind.id === 'max');
````

### Task 7: 8M-9B task 7: the Team GO Rocket form at a stop

Prototype commit: `c4ece8a62a8388cd8259366b768eea051f896634`

"Report Rocket here" in a stop's popup or card (with reports or a plain
PokéStop's; members only, not read-only) and the Report button's step 3 at
a stop open the Rocket form in its place, as the max battle form is in a
Power Spot's popup (B8), held as the other forms:

- Who as a menu in `/rocket`'s order from `/api/rocket-options` (grunt types,
  leaders, Giovanni with his note under it, the decoy), the catches' pictures
  of the choice; a type of two lineups asks which (each by its first slot
  with its catches, then "Not sure which", the type's own key); the lineups
  said to be out of date where they are.
- `POST …/api/rocket` `{ who, stop }` through `pressParty`'s CSRF retry.
  Made, or the same grunt there ("Already reported"): the form closes, the
  words are said, the reports asked for at once and the stop's popup opened
  after the poll (B15). A hideout there: the hideout question as a confirm
  in the form, Replace sending it again with `replacing`, Cancel sending
  nothing. The lineups changed (`reason: 'list-changed'`, B4): the lists
  asked for again, the type kept. A stop gone (404): "That PokéStop is gone:
  pick another." (B6). Posted nowhere (503), too many (429): their words.
- The controls of the reports at stops are off while another form holds.

**Files:**

```
 src/web/client/map.css              |  21 +++++++----
 src/web/client/party-layer.ts       |  47 ++++++++++++++++++++----
 src/web/client/raid-ui.ts           |   5 ++-
 src/web/client/rocket-forms.test.ts | 194 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/rocket-forms.ts      | 314 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/rocket-ui.ts         | 179 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 6 files changed, 745 insertions(+), 15 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/rocket-forms.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c4ece8a62a8388cd8259366b768eea051f896634 -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-9B task 7: the Team GO Rocket form at a stop`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 243729c6b400d112b73e4278653095262d4f660f..ff707d33a93e092b8a92e3b01e796e690d86c4b1 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -2213,7 +2213,8 @@ path.highlighted {
   gap: 4px;
 }
 
-.max-form .form-choice {
+.max-form .form-choice,
+.stop-form .form-choice {
   display: flex;
   flex-direction: column;
   gap: 4px;
@@ -2222,12 +2223,14 @@ path.highlighted {
   border: 0;
 }
 
-.max-form .form-choice legend {
+.max-form .form-choice legend,
+.stop-form .form-choice legend {
   margin-bottom: 4px;
   font-weight: 600;
 }
 
-.max-form .choice {
+.max-form .choice,
+.stop-form .choice {
   display: flex;
   gap: 8px;
   align-items: flex-start;
@@ -2237,13 +2240,15 @@ path.highlighted {
   cursor: pointer;
 }
 
-.max-form .choice input {
+.max-form .choice input,
+.stop-form .choice input {
   flex: none;
   min-width: 0;
   margin-top: 3px;
 }
 
-.max-form [hidden] {
+.max-form [hidden],
+.stop-form [hidden] {
   display: none;
 }
 
@@ -2327,13 +2332,15 @@ path.highlighted {
   font-weight: 600;
 }
 
-.stop-report .small-pictures {
+.stop-report .small-pictures,
+.stop-form .small-pictures {
   display: flex;
   flex-wrap: wrap;
   gap: 4px;
 }
 
-.stop-report .small-picture {
+.stop-report .small-picture,
+.stop-form .small-picture {
   width: 28px;
   height: 28px;
   object-fit: contain;
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index b01d522486744204c77c4441a653c3d4db3a0341..dc5b3c03902999e68d15d6c99125f5785340852f 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -77,6 +77,8 @@ import { stopReportLayer } from './stop-report-layer.js';
 import { plainStopPopup, stopPopup, type StopPopupContext } from './stop-popup.js';
 import { stopUi } from './stop-report-ui.js';
 import { stopFilterUi } from './stop-filter-ui.js';
+import { rocketBox } from './rocket-forms.js';
+import { rocketUi } from './rocket-ui.js';
 import type { StopReport } from './stop-reports.js';
 import type { StopLayer } from './stop-reports.js';
 
@@ -525,12 +527,34 @@ export function showParties(
     hold,
     refresh: () => stopReports.now(),
   });
-  /** What a stop's popup needs of the map now: the clock, your location, the units. */
-  const stopContext = (): StopPopupContext => ({
+  /**
+   * Team GO Rocket's form in a stop's popup or card (plan 8M-9B, goal 9): after a report, the
+   * reports at once, then the stop's popup (B15: after the poll, not from the answer).
+   */
+  const rocketForms = rocketUi({
+    guild,
+    csrf: {
+      get: () => csrf,
+      set: (token) => {
+        csrf = token;
+      },
+    },
+    hold,
+    done: async (stopKey) => {
+      await stopReports.now();
+      if (stopKey !== undefined) popups.get(`stop:${stopKey}`)?.openPopup();
+    },
+  });
+  /**
+   * What a stop's popup needs of the map now: the clock, your location, the units, and its own
+   * actions for a member who may report (not read-only, as 8M-9A's `reportOffered`).
+   */
+  const stopContext = (stop: { key: string; name: string }): StopPopupContext => ({
     now: Date.now(),
     zone: readerZone(),
     located: frame.located(),
     units: frame.units,
+    actions: reportOffered(mayReport, view) ? [rocketBox(stop)] : [],
   });
   /** A report shown by its id (an ended one too: its popup stays, B14). */
   const stopReportById = (id: string | undefined): StopReport | undefined => {
@@ -827,6 +851,9 @@ export function showParties(
         // Report… (plan 8M-8B): `/report`'s form in the place of the post.
         const party = partyById(target.dataset.reportParty);
         if (party) postForms.reportClicked(target, party);
+      } else if (target.dataset.reportRocket !== undefined) {
+        // "Report Rocket here" (plan 8M-9B): its form in the place of the button.
+        rocketForms.rocketClicked(target);
       } else if (target.dataset.takeBack !== undefined) {
         // A report at a stop taken back (plan 8M-9B): its question in the place of its actions.
         const report = stopReportById(target.dataset.takeBack);
@@ -1332,7 +1359,7 @@ export function showParties(
         open: (key, marker) => {
           openAt(key, marker);
         },
-        popup: (at) => stopPopup(at, stopContext()),
+        popup: (at) => stopPopup(at, stopContext(at.stop)),
       }),
     );
     // "New train" (or the form or route editor open in its place) for a member who may; a form
@@ -1816,9 +1843,14 @@ export function showParties(
     onStops: (listener) => {
       frame.onStops?.(listener);
     },
-    // A report at a stop's step 3 (B9): the stop's own popup (or card) opened at it.
-    toStop: (_kind, stop) => {
-      openStopAt(stop);
+    // A report at a stop's step 3 (B9): the stop's own popup (or card) opened at it, and Team GO
+    // Rocket's form in it, its first field focused (B8).
+    toStop: (kind, stop) => {
+      const shown = openStopAt(stop);
+      if (kind === 'rocket') {
+        const button = shown?.querySelector<HTMLButtonElement>('button[data-report-rocket]');
+        if (button) rocketForms.rocketClicked(button, true);
+      }
     },
   });
   report.refresh();
@@ -1887,7 +1919,8 @@ export function showParties(
   stopReports.start();
   return {
     reportStops: () => stopReports.stops(),
-    stopPopup: (stop) => draw(plainStopPopup(stop, stopContext())),
+    stopPopup: (stop) =>
+      draw(plainStopPopup(stop, stopContext({ key: stop.id, name: stop.title }))),
     gymControls: (gym) =>
       reportOffered(mayReport, view)
         ? [raidForms.reportControl(gym), spawnForms.spawnControl(gym), meetupHereControl(gym)]
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index 93a9718e9a49a70b4767517da38cb7808285636b..07e4218478283a10199fb2c92713cfa980069bff 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -59,7 +59,10 @@ export function formControls(root: ParentNode, on: boolean): void {
       'button[data-manage-train], button[data-split-train], ' +
       'button[data-new-meetup], button[data-meetup-here], button[data-edit-meetup], ' +
       'button[data-regroup], button[data-meet], button[data-close-party], ' +
-      'button[data-report-party], button[data-report-max]',
+      'button[data-report-party], button[data-report-max], ' +
+      // The reports at stops' (plan 8M-9B).
+      'button[data-report-rocket], button[data-report-research], button[data-take-back], ' +
+      'button[data-same-task]',
   )) {
     button.disabled = !on;
   }
diff --git a/src/web/client/rocket-forms.test.ts b/src/web/client/rocket-forms.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1b986403b26f7e41bdceb09403a1b43a01660017
--- /dev/null
+++ b/src/web/client/rocket-forms.test.ts
@@ -0,0 +1,194 @@
+import { describe, expect, it } from 'vitest';
+import type { PageNode } from './popup.js';
+import {
+  rocketBody,
+  rocketForm,
+  STOP_GONE,
+  submitRocket,
+  type RocketSubmitDeps,
+} from './rocket-forms.js';
+import type { StopAnswered } from './stop-forms.js';
+import { caseGrunt, caseRocketOptions } from './stop-report-cases.js';
+
+/** Every text of a tree, in order. */
+const texts = (node: PageNode): string[] => [
+  ...(node.text === undefined ? [] : [node.text]),
+  ...(node.children ?? []).flatMap(texts),
+];
+
+/** The nodes of a tree that match. */
+const found = (node: PageNode, test: (one: PageNode) => boolean): PageNode[] => [
+  ...(test(node) ? [node] : []),
+  ...(node.children ?? []).flatMap((child) => found(child, test)),
+];
+
+const OPTIONS = caseRocketOptions();
+
+/** Deps that answer the report as the test says, and write down what was sent. */
+function deps(answer: StopAnswered, text = answer.text ?? '', holds = true) {
+  const sent: Array<Record<string, unknown>> = [];
+  let asked = 0;
+  const made: RocketSubmitDeps = {
+    send: (body) => {
+      sent.push(body);
+      return Promise.resolve({ text, answer });
+    },
+    options: () => {
+      asked += 1;
+      return Promise.resolve(
+        caseRocketOptions({
+          choices: OPTIONS.choices.map((choice) =>
+            choice.key === 'grunt:water' ? { ...choice, lineups: [] } : choice,
+          ),
+        }),
+      );
+    },
+    holds: () => holds,
+  };
+  return { made, sent, asked: () => asked };
+}
+
+describe('the Team GO Rocket form of the map (plan 8M-9B, goal 9)', () => {
+  it("offers who in /rocket's order, a type's lineups with Not sure which, Giovanni's note", () => {
+    const empty = rocketForm(OPTIONS, { filled: {} });
+    expect(found(empty, (one) => one.tag === 'option').map((one) => one.text)).toEqual([
+      'Pick who you met',
+      'Water-type grunt',
+      'Fire-type grunt',
+      'Arlo',
+      'Giovanni',
+    ]);
+    expect(texts(empty)).not.toContain('Which lineup?');
+    const water = rocketForm(OPTIONS, { filled: { who: 'grunt:water' } });
+    expect(texts(water)).toEqual(
+      expect.arrayContaining([
+        'Which lineup?',
+        'Mudkip, Tentacool, Krabby',
+        'Magikarp, Feebas',
+        'Not sure which',
+      ]),
+    );
+    expect(
+      found(water, (one) => one.attributes?.type === 'radio').map((one) => one.attributes?.value),
+    ).toEqual(['grunt:water:female#f1', 'grunt:water:male#m1', 'grunt:water']);
+    // The catches of the choice, by their pictures.
+    expect(
+      found(water, (one) => one.className === 'small-picture').map((one) => one.attributes?.title),
+    ).toEqual(['Magikarp', 'Mudkip', 'Mudkip', 'Magikarp']);
+    expect(texts(rocketForm(OPTIONS, { filled: { who: 'giovanni' } }))).toContain(
+      'Report Giovanni only when you are sure.',
+    );
+    expect(texts(rocketForm({ ...OPTIONS, stale: true }, { filled: {} }))).toContain(
+      'The lineups may be out of date: Pine could not read them lately.',
+    );
+  });
+
+  it('sends who as /rocket takes it: a lineup by its value, Not sure which by the type', () => {
+    expect(rocketBody('stop-1', OPTIONS, {})).toEqual({ text: 'Pick who you met first.' });
+    expect(rocketBody('stop-1', OPTIONS, { who: 'grunt:water' })).toEqual({
+      text: 'Pick the lineup, or Not sure which.',
+    });
+    expect(
+      rocketBody('stop-1', OPTIONS, { who: 'grunt:water', lineup: 'grunt:water:male#m1' }),
+    ).toEqual({ body: { who: 'grunt:water:male#m1', stop: 'stop-1' } });
+    expect(rocketBody('stop-1', OPTIONS, { who: 'grunt:water', lineup: 'grunt:water' })).toEqual({
+      body: { who: 'grunt:water', stop: 'stop-1' },
+    });
+    expect(rocketBody('stop-1', OPTIONS, { who: 'leader:arlo' }, 7)).toEqual({
+      body: { who: 'leader:arlo', stop: 'stop-1', replacing: 7 },
+    });
+  });
+
+  it('closes when made, and when the same grunt stands there already', async () => {
+    const made = deps({ ok: true, status: 200, text: 'Reported a Fire-type grunt.' });
+    expect(await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, made.made)).toEqual({
+      kind: 'close',
+      text: 'Reported a Fire-type grunt.',
+    });
+    const already = deps({
+      ok: false,
+      status: 409,
+      text: 'Already reported…',
+      grunt: caseGrunt(1),
+    });
+    expect((await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, already.made)).kind).toBe(
+      'close',
+    );
+  });
+
+  it('asks the hideout question as a confirm, and Replace sends it again with the hideout', async () => {
+    const asked = deps({
+      ok: false,
+      status: 422,
+      text: 'Arlo stands at this PokéStop today. Replace Arlo with a Fire-type grunt?',
+      asks: { replacing: 21 },
+    });
+    const after = await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, asked.made);
+    expect(after).toMatchObject({
+      kind: 'draw',
+      state: {
+        filled: { who: 'grunt:fire' },
+        replacing: {
+          id: 21,
+          text: 'Arlo stands at this PokéStop today. Replace Arlo with a Fire-type grunt?',
+        },
+      },
+    });
+    if (after.kind !== 'draw') throw new Error(after.kind);
+    const question = rocketForm(OPTIONS, after.state);
+    expect(texts(question)).toEqual(
+      expect.arrayContaining([
+        'Arlo stands at this PokéStop today. Replace Arlo with a Fire-type grunt?',
+        'Replace',
+        'Cancel',
+      ]),
+    );
+    expect(texts(question)).not.toContain('Report');
+    const replaced = deps({ ok: true, status: 200, text: 'Reported.' });
+    await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, replaced.made, 21);
+    expect(replaced.sent).toEqual([{ who: 'grunt:fire', stop: 'stop-1', replacing: 21 }]);
+  });
+
+  it('asks for the lists again when the lineups changed, keeping the type, by `reason` alone', async () => {
+    const changed = deps({
+      ok: false,
+      status: 422,
+      text: 'The lineups just changed: pick again.',
+      reason: 'list-changed',
+    });
+    const after = await submitRocket(
+      'stop-1',
+      OPTIONS,
+      { who: 'grunt:water', lineup: 'grunt:water:male#m1' },
+      changed.made,
+    );
+    expect(changed.asked()).toBe(1);
+    expect(after).toMatchObject({ kind: 'draw', state: { filled: { who: 'grunt:water' } } });
+    // The same words without the reason: drawn again as they are, the lists not asked.
+    const other = deps({ ok: false, status: 422, text: 'The lineups just changed: pick again.' });
+    await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, other.made);
+    expect(other.asked()).toBe(0);
+  });
+
+  it('says a stop gone in its own words, and the rest as the server words them', async () => {
+    const gone = deps({ ok: false, status: 404, text: 'Not found.' });
+    expect(await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, gone.made)).toEqual({
+      kind: 'close',
+      text: STOP_GONE,
+    });
+    const unposted = deps({ ok: false, status: 503, text: 'I could not post it in #west.' });
+    expect(
+      await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, unposted.made),
+    ).toMatchObject({
+      kind: 'draw',
+      text: 'I could not post it in #west.',
+      state: { filled: { who: 'grunt:fire' } },
+    });
+    // Its popup closed meanwhile: only the words.
+    const late = deps({ ok: true, status: 200, text: 'Reported.' }, 'Reported.', false);
+    expect(await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, late.made)).toEqual({
+      kind: 'gone',
+      text: 'Reported.',
+    });
+  });
+});
diff --git a/src/web/client/rocket-forms.ts b/src/web/client/rocket-forms.ts
new file mode 100644
index 0000000000000000000000000000000000000000..381b6e54f3047c96216b623cb33d914fe8165cde
--- /dev/null
+++ b/src/web/client/rocket-forms.ts
@@ -0,0 +1,314 @@
+import type {
+  MapReward,
+  RocketOptionsView,
+  RocketWhoOption,
+} from '../../domain/web/stop-report-data.js';
+import type { PageNode } from './popup.js';
+import type { StopAnswered } from './stop-forms.js';
+
+/*
+ * The Team GO Rocket form of the live map (plan 8M-9B, goal 9; B8: in the stop's popup or card, as
+ * the max battle form is in a Power Spot's), the part with no page in it: who as a menu in
+ * `/rocket`'s order (`/api/rocket-options`: grunt types, leaders, Giovanni with his note, the
+ * decoy), the catches' pictures of the choice, and for a type of two lineups which lineup (each by
+ * its first slot with its catches, then "Not sure which", the type's own key); the lineups said to
+ * be out of date where they are. Its Submit (`submitRocket`) sends `{ who, stop }` to
+ * `POST …/api/rocket` and does what the answer says by its machine parts (B4): made, the form
+ * closes; the same grunt there, "Already reported" and its stop's popup; a hideout there, the
+ * hideout question as a confirm (Replace sends it again with `replacing`, Cancel sends nothing);
+ * the lineups changed (`reason: 'list-changed'`), the lists asked for again keeping the type; a
+ * stop gone (404, B6), the page's own words; anything else (posted nowhere, too many), its words.
+ */
+
+/** What the form holds: who (a choice's key) and the lineup (a lineup's value, or the type's key). */
+export interface RocketValues {
+  who: string;
+  lineup: string;
+}
+
+/** What the form shows besides its lists: what was filled in, the hideout question asked. */
+export interface RocketFormState {
+  filled: Partial<RocketValues>;
+  /** The hideout question (422 `asks.replacing`): its words and the hideout's id. */
+  replacing?: { text: string; id: number };
+}
+
+/** The words of a stop that is gone (B6, the page's own: a 404 says nothing more). */
+export const STOP_GONE = 'That PokéStop is gone: pick another.';
+
+/** "Report Rocket here" in the box a click opens the form in (`rocket-box`), in a stop's popup. */
+export function rocketBox(stop: { key: string; name: string }): PageNode {
+  return {
+    tag: 'div',
+    className: 'rocket-box',
+    children: [
+      {
+        tag: 'button',
+        className: 'press',
+        text: 'Report Rocket here',
+        attributes: { type: 'button', 'data-report-rocket': stop.key, 'data-stop-name': stop.name },
+      },
+    ],
+  };
+}
+
+const option = (value: string, text: string, selected: boolean): PageNode => ({
+  tag: 'option',
+  text,
+  attributes: { value, ...(selected ? { selected: '' } : {}) },
+});
+
+/** Small pictures of catches, each named. */
+function catchPictures(catches: readonly MapReward[]): PageNode[] {
+  const shown = catches.flatMap((caught): PageNode[] =>
+    caught.image === undefined
+      ? []
+      : [
+          {
+            tag: 'img',
+            className: 'small-picture',
+            attributes: {
+              src: caught.image,
+              alt: caught.name,
+              title: caught.name,
+              draggable: 'false',
+            },
+          },
+        ],
+  );
+  return shown.length === 0 ? [] : [{ tag: 'div', className: 'small-pictures', children: shown }];
+}
+
+/** The choice of the form's who, if any. */
+export function chosenWho(
+  options: RocketOptionsView,
+  filled: Partial<RocketValues>,
+): RocketWhoOption | undefined {
+  return options.choices.find((choice) => choice.key === filled.who);
+}
+
+/** The lineup question of a type of two lineups: each by its first slot, then "Not sure which". */
+function lineupPart(choice: RocketWhoOption, picked: string | undefined): PageNode[] {
+  const lineups = choice.lineups ?? [];
+  if (lineups.length === 0) return [];
+  const radio = (value: string, label: string, catches: readonly MapReward[]): PageNode => ({
+    tag: 'label',
+    className: 'choice',
+    children: [
+      {
+        tag: 'input',
+        attributes: {
+          type: 'radio',
+          name: 'lineup',
+          value,
+          ...(value === picked ? { checked: '' } : {}),
+        },
+      },
+      {
+        tag: 'span',
+        className: 'choice-words',
+        children: [
+          { tag: 'span', className: 'choice-label', text: label },
+          ...catchPictures(catches),
+        ],
+      },
+    ],
+  });
+  return [
+    {
+      tag: 'fieldset',
+      className: 'form-choice',
+      children: [
+        { tag: 'legend', text: 'Which lineup?' },
+        ...lineups.map((lineup) => radio(lineup.value, lineup.label, lineup.catches)),
+        radio(choice.key, 'Not sure which', []),
+      ],
+    },
+  ];
+}
+
+/**
+ * The form at a stop: who, the catches of the choice (and Giovanni's note), which lineup for a
+ * type of two; the lineups said to be out of date; or, once the server asked it, the hideout
+ * question in its words with Replace and Cancel.
+ */
+export function rocketForm(options: RocketOptionsView, state: RocketFormState): PageNode {
+  const { filled, replacing } = state;
+  const choice = chosenWho(options, filled);
+  const buttons: PageNode =
+    replacing === undefined
+      ? {
+          tag: 'div',
+          className: 'form-buttons',
+          children: [
+            {
+              tag: 'button',
+              className: 'press primary',
+              text: 'Report',
+              attributes: { type: 'button', 'data-submit': 'rocket' },
+            },
+            {
+              tag: 'button',
+              className: 'press',
+              text: 'Cancel',
+              attributes: { type: 'button', 'data-cancel': '' },
+            },
+          ],
+        }
+      : {
+          tag: 'div',
+          className: 'form-buttons',
+          children: [
+            {
+              tag: 'button',
+              className: 'press danger',
+              text: 'Replace',
+              attributes: { type: 'button', 'data-replace': String(replacing.id) },
+            },
+            {
+              tag: 'button',
+              className: 'press',
+              text: 'Cancel',
+              attributes: { type: 'button', 'data-cancel': '' },
+            },
+          ],
+        };
+  return {
+    tag: 'div',
+    className: 'raid-form rocket-form stop-form',
+    attributes: { 'data-form': 'rocket' },
+    children: [
+      ...(replacing === undefined
+        ? [
+            {
+              tag: 'label',
+              className: 'form-row',
+              children: [
+                { tag: 'span', text: 'Who' },
+                {
+                  tag: 'select',
+                  attributes: { name: 'who' },
+                  children: [
+                    option('', 'Pick who you met', (filled.who ?? '') === ''),
+                    ...options.choices.map((one) =>
+                      option(one.key, one.name, one.key === filled.who),
+                    ),
+                  ],
+                },
+              ],
+            },
+            ...(choice?.note === undefined
+              ? []
+              : [{ tag: 'p', className: 'hint', text: choice.note }]),
+            ...(choice === undefined ? [] : catchPictures(choice.catches)),
+            ...(choice === undefined ? [] : lineupPart(choice, filled.lineup)),
+            ...(options.stale
+              ? [
+                  {
+                    tag: 'p',
+                    className: 'hint',
+                    text: 'The lineups may be out of date: Pine could not read them lately.',
+                  },
+                ]
+              : []),
+          ]
+        : [
+            {
+              tag: 'p',
+              className: 'form-text',
+              attributes: { role: 'alert' },
+              text: replacing.text,
+            },
+          ]),
+      buttons,
+      { tag: 'div', className: 'form-answer', attributes: { hidden: '', 'aria-live': 'polite' } },
+    ],
+  };
+}
+
+/** The body of a Rocket report, or what must be picked first. */
+export function rocketBody(
+  stop: string,
+  options: RocketOptionsView,
+  values: Partial<RocketValues>,
+  replacing?: number,
+): { body: { who: string; stop: string; replacing?: number } } | { text: string } {
+  const choice = chosenWho(options, values);
+  if (!choice) return { text: 'Pick who you met first.' };
+  let who = choice.key;
+  if ((choice.lineups ?? []).length > 0) {
+    const lineup = values.lineup ?? '';
+    if (lineup !== choice.key && !(choice.lineups ?? []).some((one) => one.value === lineup)) {
+      return { text: 'Pick the lineup, or Not sure which.' };
+    }
+    who = lineup;
+  }
+  return { body: { who, stop, ...(replacing === undefined ? {} : { replacing }) } };
+}
+
+/** What the page does after a Rocket report's answer. */
+export type RocketAfter =
+  /** Something to pick first: said under the form, nothing sent. */
+  | { kind: 'missing'; text: string }
+  /** The form went away meanwhile: only its words are said. */
+  | { kind: 'gone'; text: string }
+  /** Made, or the same grunt there: the form closes, the stop's popup opened after the poll. */
+  | { kind: 'close'; text: string }
+  /** The form drawn again: the hideout question, new lists, or the words of a refusal. */
+  | { kind: 'draw'; options: RocketOptionsView; state: RocketFormState; text: string };
+
+/** What `submitRocket` needs: sending, the lists, whether the form still holds. */
+export interface RocketSubmitDeps {
+  send(body: Record<string, unknown>): Promise<{ text: string; answer: StopAnswered }>;
+  options(): Promise<RocketOptionsView>;
+  holds(): boolean;
+}
+
+/**
+ * The Rocket form's Submit (and its Replace): the body, the report, and what the answer leads to,
+ * by its machine parts (B4), the words only shown.
+ */
+export async function submitRocket(
+  stop: string,
+  options: RocketOptionsView,
+  values: Partial<RocketValues>,
+  deps: RocketSubmitDeps,
+  replacing?: number,
+): Promise<RocketAfter> {
+  const body = rocketBody(stop, options, values, replacing);
+  if ('text' in body) return { kind: 'missing', text: body.text };
+  const sent = await deps.send(body.body);
+  if (!deps.holds()) return { kind: 'gone', text: sent.text };
+  const { answer } = sent;
+  // Made; or the same grunt stands there already (409 with the grunt): its stop shows it.
+  if (answer.ok || (answer.status === 409 && answer.grunt !== undefined)) {
+    return { kind: 'close', text: sent.text };
+  }
+  if (answer.status === 404) return { kind: 'close', text: STOP_GONE };
+  const ask = answer.asks?.replacing;
+  if (answer.status === 422 && ask !== undefined) {
+    return {
+      kind: 'draw',
+      options,
+      state: { filled: values, replacing: { text: sent.text, id: ask } },
+      text: sent.text,
+    };
+  }
+  if (answer.reason === 'list-changed') {
+    // The lineups changed under the choice: the lists anew, the type kept, its lineup asked again.
+    let now = options;
+    try {
+      now = await deps.options();
+    } catch {
+      // The lists it has stay.
+    }
+    const kept = now.choices.some((choice) => choice.key === values.who) ? values.who : undefined;
+    return {
+      kind: 'draw',
+      options: now,
+      state: { filled: kept === undefined ? {} : { who: kept } },
+      text: sent.text,
+    };
+  }
+  return { kind: 'draw', options, state: { filled: values }, text: sent.text };
+}
diff --git a/src/web/client/rocket-ui.ts b/src/web/client/rocket-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e9fec929df4948607fec6da5b2a7493a32a149de
--- /dev/null
+++ b/src/web/client/rocket-ui.ts
@@ -0,0 +1,179 @@
+import type { RocketOptionsView } from '../../domain/web/stop-report-data.js';
+import { getJson, say } from './common.js';
+import type { Me } from './notice.js';
+import { renderNode } from './popup.js';
+import { formPlace, type FormClaim, type FormHold } from './raid-forms.js';
+import { sayUnder } from './raid-ui.js';
+import {
+  rocketForm,
+  submitRocket,
+  type RocketAfter,
+  type RocketFormState,
+  type RocketValues,
+} from './rocket-forms.js';
+import { sendStop } from './stop-forms.js';
+
+/*
+ * The Team GO Rocket form of the live map in the page (plan 8M-9B, goal 9; B8): "Report Rocket
+ * here" in a stop's popup or card (and the Report button's step 3 at a stop) opens it in place of
+ * its button, held as the other forms (`FormHold`); its lists from `/api/rocket-options` (the
+ * browser revalidates them by their ETag). After a report or "Already reported", the form closes,
+ * its words are said, and the reports are asked for at once, the stop's popup opened after the
+ * poll (`done`, B15).
+ */
+export interface RocketUiDeps {
+  guild: string;
+  /** The page's CSRF token, which a stale one's renewal changes. */
+  csrf: { get(): string; set(token: string): void };
+  hold: Pick<FormHold<unknown>, 'editing' | 'take' | 'holds' | 'ready' | 'fit' | 'release'>;
+  /** After a report: the reports asked for at once, then the stop's popup opened. */
+  done(stopKey: string | undefined): Promise<void>;
+}
+
+/** What the page says when the pick list cannot be loaded. */
+const NO_OPTIONS = 'Team GO Rocket could not be loaded. Try again in a moment.';
+
+export function rocketUi(deps: RocketUiDeps) {
+  const { guild, hold } = deps;
+  const options = (): Promise<RocketOptionsView> =>
+    getJson<RocketOptionsView>(`/s/${guild}/api/rocket-options`);
+
+  /** What the form holds: who, and the lineup checked. */
+  const valuesOf = (form: HTMLElement): Partial<RocketValues> => {
+    const who = form.querySelector<HTMLSelectElement>('select[name="who"]')?.value;
+    const lineup = form.querySelector<HTMLInputElement>('input[name="lineup"]:checked')?.value;
+    return { ...(who === undefined ? {} : { who }), ...(lineup === undefined ? {} : { lineup }) };
+  };
+
+  const send = async (form: HTMLElement, body: Record<string, unknown>) => {
+    const buttons = form.querySelectorAll('button');
+    for (const each of buttons) each.disabled = true;
+    const sent = await sendStop(deps.csrf.get(), {
+      post: async (token) => {
+        const reply = await fetch(`/s/${guild}/api/rocket`, {
+          method: 'POST',
+          credentials: 'same-origin',
+          headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
+          body: JSON.stringify(body),
+        });
+        return {
+          status: reply.status,
+          body: (await reply.json().catch(() => undefined)) as unknown,
+        };
+      },
+      me: () => getJson<Me>(`/s/${guild}/api/me`),
+    });
+    deps.csrf.set(sent.csrf);
+    for (const each of buttons) each.disabled = false;
+    return sent;
+  };
+
+  /** Draws the form into `box` once the lists came, while its claim holds and the box is there. */
+  const openForm = async (
+    box: HTMLElement,
+    stop: string,
+    claim: FormClaim,
+    finish: () => void,
+    focusFirst: boolean,
+  ): Promise<void> => {
+    let lists: RocketOptionsView;
+    try {
+      lists = await options();
+    } catch {
+      say(NO_OPTIONS);
+      if (hold.holds(claim)) finish();
+      return;
+    }
+    if (!hold.ready(claim, box.isConnected)) return;
+    let state: RocketFormState = { filled: {} };
+    const draw = (focus?: string): void => {
+      const form = renderNode(rocketForm(lists, state), document);
+      form.querySelector('select[name="who"]')?.addEventListener('change', () => {
+        state = { filled: valuesOf(form) };
+        draw('select[name="who"]');
+      });
+      form.addEventListener('click', (event) => {
+        clicked(form, event);
+      });
+      box.replaceChildren(form);
+      hold.fit();
+      if (focus !== undefined) form.querySelector<HTMLElement>(focus)?.focus();
+    };
+    const after = async (done: RocketAfter): Promise<void> => {
+      switch (done.kind) {
+        case 'missing': {
+          const form = box.firstElementChild;
+          if (form instanceof HTMLElement) sayUnder(form, done.text);
+          return;
+        }
+        case 'gone':
+          say(done.text);
+          await deps.done(undefined);
+          return;
+        case 'close':
+          finish();
+          say(done.text);
+          await deps.done(stop);
+          return;
+        case 'draw': {
+          if (!hold.holds(claim)) return;
+          lists = done.options;
+          state = done.state;
+          // The hideout question takes the focus on Replace, read with its words; else Report.
+          draw(state.replacing === undefined ? 'button[data-submit]' : 'button[data-replace]');
+          const form = box.firstElementChild;
+          // The question is its words over its buttons: not said again under them.
+          if (form instanceof HTMLElement && state.replacing === undefined) {
+            sayUnder(form, done.text);
+          }
+        }
+      }
+    };
+    const clicked = (form: HTMLElement, event: Event): void => {
+      const target = event.target;
+      if (!(target instanceof HTMLButtonElement)) return;
+      if (target.dataset.cancel !== undefined) {
+        // Cancel sends nothing, the hideout question's too.
+        finish();
+        return;
+      }
+      const submitDeps = {
+        send: (body: Record<string, unknown>) => send(form, body),
+        options,
+        holds: () => hold.holds(claim),
+      };
+      if (target.dataset.submit === 'rocket') {
+        void submitRocket(stop, lists, valuesOf(form), submitDeps).then(after);
+      } else if (target.dataset.replace !== undefined) {
+        const replacing = Number(target.dataset.replace);
+        void submitRocket(stop, lists, state.filled, submitDeps, replacing).then(after);
+      }
+    };
+    draw(focusFirst ? 'select[name="who"]' : undefined);
+  };
+
+  /** A click on "Report Rocket here" (`rocketBox`): the form in place of the button. */
+  const rocketClicked = (button: HTMLButtonElement, focusFirst = false): void => {
+    const box = button.parentElement;
+    const stop = button.dataset.reportRocket;
+    if (!box || stop === undefined) return;
+    const claim = hold.take(formPlace(box));
+    if (!claim) return;
+    box.textContent = 'Loading Team GO Rocket…';
+    hold.fit();
+    void openForm(
+      box,
+      stop,
+      claim,
+      () => {
+        box.replaceChildren(button);
+        hold.release(claim);
+      },
+      focusFirst,
+    );
+  };
+
+  return { rocketClicked };
+}
+
+export type RocketUi = ReturnType<typeof rocketUi>;
````

### Task 8: 8M-9B task 8: the field research form, its question, Same task at more stops

Prototype commit: `c944fd43dc9e48f777adb28dbafa9f8e7af906ee`

The research form in the side pane, docked under the map on a phone (B8), an
aside claim of the hold as the meetup and train forms; opened by "Report
research here" in a stop's popup or card and the Report button's step 3 at a
stop:

- The task: a search over the whole list (`/api/research-options`, the
  server's order, an event's tasks first), grouped by category, each with its
  rewards' pictures; then its version where it has several (one reward each,
  then "one of"), a task of one version taken without asking. The list said
  to be out of date where it is; "I can't find my task" types the task and
  its reward in full (a `<datalist>` of the list's rewards; the reward read by
  the server alone).
- The stops: the one it was opened on, and "Add stops…" picking up to four
  more on the map (the stops drawn whatever their layer and ringed, a stop
  with reports by its marker; open map says "Tap a PokéStop."), as chips
  with ×.
- `POST …/api/research` `{ task, reward?, stops }`: made or every stop
  reported already, the form closes, the reports asked for at once and the
  first stop's popup opened after the poll (B15); the list changed
  (`reason: 'list-changed'`), the lists asked for again, the pick kept where
  still listed; a stop gone, "That PokéStop is gone: pick another." (B6).
- The contradiction question (422 `asks`): in the form, the server's words,
  an unticked box per contested report (its stop, task and reporter; a hidden
  one by its stop), Report sending it again with `replacing` (none ticked:
  `[]`), Cancel sending nothing (R7).
- "Same task at more stops…" on a research report's popup (once the poll
  shows it, B15): the report's task, stops picked at once, `{ sameAs, stops }`;
  once it is gone (`reason: 'ended'`) a listed one is sent again as
  `{ task, more: true, stops }`, a typed one says the server's words.

**Files:**

```
 src/web/client/map.css                           |  93 ++++++++++++++++++++++
 src/web/client/party-layer-draw.isolated.test.ts | 194 ++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/party-layer.ts                    | 123 ++++++++++++++++++++++-------
 src/web/client/research-forms.test.ts            | 352 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/research-forms.ts                 | 621 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/research-ui.ts                    | 326 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 6 files changed, 1676 insertions(+), 33 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/party-layer-draw.isolated.test.ts src/web/client/research-forms.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c944fd43dc9e48f777adb28dbafa9f8e7af906ee -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-9B task 8: the field research form, its question, Same task at more stops`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/map.css b/src/web/client/map.css
index ff707d33a93e092b8a92e3b01e796e690d86c4b1..6810e3175806ec45bb1463c073b2975a0e0679f2 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -2493,3 +2493,96 @@ path.highlighted {
   color: var(--text);
   font-weight: 600;
 }
+
+/*
+ * The field research form (plan 8M-9B, goal 7): in the side pane, docked under the map on a phone.
+ * Its stops as chips with ×; the task list searched, by category, the task picked marked; the
+ * contradiction question's boxes.
+ */
+.research-form {
+  display: flex;
+  flex-direction: column;
+  gap: 8px;
+}
+
+.research-form .form-row input {
+  flex: 1 1 100%;
+  box-sizing: border-box;
+  padding: 6px 8px;
+}
+
+.stop-chips .chips {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 4px;
+}
+
+.stop-chip {
+  display: inline-flex;
+  align-items: center;
+  gap: 4px;
+  padding: 2px 4px 2px 10px;
+  border-radius: 14px;
+  background: var(--chip-on-bg);
+  color: var(--text);
+  font-size: 13px;
+}
+
+.stop-chips .press {
+  align-self: flex-start;
+}
+
+.task-list {
+  display: flex;
+  flex-direction: column;
+  gap: 2px;
+  max-height: 40vh;
+  overflow-y: auto;
+}
+
+.task-list h4 {
+  margin: 6px 0 2px;
+  color: var(--muted);
+  font-size: 12px;
+  text-transform: uppercase;
+}
+
+.task-choice {
+  display: flex;
+  flex-wrap: wrap;
+  align-items: center;
+  justify-content: space-between;
+  gap: 6px;
+  padding: 6px 8px;
+  border: 1px solid transparent;
+  border-radius: var(--radius);
+  background: var(--card-bg);
+  color: var(--text);
+  font: inherit;
+  text-align: left;
+  cursor: pointer;
+}
+
+.task-choice[aria-pressed='true'] {
+  border-color: var(--primary);
+  background: var(--chip-on-bg);
+}
+
+.task-choice:hover {
+  background: var(--secondary-hover);
+}
+
+.research-form .link-button {
+  align-self: flex-start;
+  padding: 0;
+  border: 0;
+  background: none;
+  color: var(--link);
+  font: inherit;
+  cursor: pointer;
+}
+
+.research-form .form-text,
+.rocket-form .form-text {
+  margin: 0;
+}
diff --git a/src/web/client/party-layer-draw.isolated.test.ts b/src/web/client/party-layer-draw.isolated.test.ts
index 2f9d1893a6a26083c72edf8c3df0332b96341914..29f85e585078417a67d027c355da08377e0b4373 100644
--- a/src/web/client/party-layer-draw.isolated.test.ts
+++ b/src/web/client/party-layer-draw.isolated.test.ts
@@ -7,14 +7,21 @@ import type {
   MapTrain,
   PartiesView,
 } from '../../domain/web/party-data.js';
-import type { StopReportsView } from '../../domain/web/stop-report-data.js';
+import type { ResearchOptionsView, StopReportsView } from '../../domain/web/stop-report-data.js';
 import { LayerRegistry, LAYERS_KEY, MAP_LAYERS } from './layer-registry.js';
 import type { MaxUiDeps } from './max-ui.js';
 import { showParties } from './party-layer.js';
 import type { MapGym } from './popup.js';
 import type { RaidUiDeps } from './raid-ui.js';
 import type { LatLon } from './view.js';
-import { CASE_NOW, caseGrunt, caseResearch, caseStop, caseView } from './stop-report-cases.js';
+import {
+  CASE_NOW,
+  caseGrunt,
+  caseResearch,
+  caseResearchOptions,
+  caseStop,
+  caseView,
+} from './stop-report-cases.js';
 
 /**
  * `showParties` drawing a list of parties (plan 8M-9A, review B1 and B9) on a map of fakes: just
@@ -50,8 +57,11 @@ const fake = vi.hoisted(() => {
     fire(type: string, event: unknown = {}) {
       for (const handler of this.handlers.get(type) ?? []) handler(event);
     }
-    bindPopup() {
+    /** The popup's content as the page gave it (a function that draws it). */
+    content: unknown;
+    bindPopup(content?: unknown) {
       this.bound = true;
+      this.content = content;
       return this;
     }
     getPopup() {
@@ -447,8 +457,12 @@ class PageElement {
 
   focus(): void {
     page.active = this;
+    page.focused?.(this);
   }
 
+  /** A field's caret, which these tests do not follow. */
+  setSelectionRange(): void {}
+
   getBoundingClientRect() {
     return { left: 0, top: 0, width: 0, height: 0 };
   }
@@ -482,6 +496,8 @@ const page: {
   /** The document's own listeners, by event. */
   listeners: Map<string, Array<(event: unknown) => void>>;
   visibility: 'hidden' | 'visible';
+  /** Told of each element the focus moves to. */
+  focused?: ((element: PageElement) => void) | undefined;
 } = { byId: new Map(), active: null, listeners: new Map(), visibility: 'hidden' };
 
 const ZONE = 'America/New_York';
@@ -604,9 +620,14 @@ async function started(options: {
   partiesLate?: boolean;
   /** Which places the map shows (its bounds); every place without it. */
   inView?: (at: [number, number]) => boolean;
+  /** The pick lists of a research report `/api/research-options` gives. */
+  research?: ResearchOptionsView;
+  /** A research report sent is never answered. */
+  sendsForever?: boolean;
 }) {
   page.byId = new Map();
   page.active = null;
+  page.focused = undefined;
   page.listeners = new Map();
   page.visibility = 'hidden';
   fake.shown.markers = [];
@@ -620,6 +641,9 @@ async function started(options: {
   vi.stubGlobal('HTMLElement', PageElement);
   vi.stubGlobal('HTMLButtonElement', PageElement);
   vi.stubGlobal('Element', PageElement);
+  // No field of these tests is typed in (the research form's, plan 8M-9B).
+  vi.stubGlobal('HTMLInputElement', class {});
+  vi.stubGlobal('CSS', { escape: (text: string) => text });
   vi.stubGlobal('document', {
     createElement: (tag: string) => new PageElement(tag),
     // Pine's own icons (`drawShapes`), as SVG.
@@ -671,6 +695,14 @@ async function started(options: {
       const reports = JSON.stringify(options.stops);
       return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(reports) });
     }
+    if (url.endsWith('/api/research-options') && options.research !== undefined) {
+      const lists = options.research;
+      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(lists) });
+    }
+    // A report on its way, never answered.
+    if (url.endsWith('/api/research') && options.sendsForever === true) {
+      return new Promise(() => undefined);
+    }
     return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
   });
   const handlers = new Map<string, Array<(event: unknown) => void>>();
@@ -796,6 +828,8 @@ async function started(options: {
     raidForms: fake.forms.raid as RaidUiDeps,
     maxForms: fake.forms.max as MaxUiDeps,
     card: () => fake.card.made,
+    /** The map's own element, its classes the look of what is picked. */
+    container,
     /** The next draw of the parties, once it is done. */
     nextDraw,
     /** `/api/parties` answers now (`partiesLate`). */
@@ -1077,19 +1111,171 @@ describe('the reports at stops on the map (plan 8M-9B)', () => {
 
   // B9: a stop with reports is pickable in the Report button's step 2 of a report at a stop.
   it("takes a stop's marker in research's step 2 as its stop, and step 3 opens there", async () => {
-    const { markerOf, raids, chooseReport } = await started({ raids: true, stops: STOPS });
+    const { markerOf, raids, chooseReport, panel } = await started({ raids: true, stops: STOPS });
     chooseReport('research');
     expect(raids.forcedPlaces('stops')).toBe(true);
     // Its marker takes taps while stops are picked.
     expect(markerOf('Yellow Mural 5')?.options.interactive).toBe(true);
     markerOf('Yellow Mural 5')?.fire('click', {});
     expect(raids.forcedPlaces('stops')).toBe(false);
+    // Field research's form in the side pane (B8), with the stop; no popup.
+    expect(fake.shown.popupOf).toBeUndefined();
+    const form = panel.querySelector('div.research-form');
+    expect(
+      form
+        ?.querySelector('span.stop-chip')
+        ?.all()
+        .map((one) => one.textContent),
+    ).toContain('Yellow Mural 5');
+    form?.querySelector('button[data-cancel]')?.dispatch('click');
+    // Team GO Rocket's in the stop's popup, in place of its "Report Rocket here" (B8).
+    chooseReport('rocket');
+    markerOf('Yellow Mural 5')?.fire('click', {});
     expect(fake.shown.popupOf).toBe(markerOf('Yellow Mural 5'));
     // While gyms are picked it lets taps through, as the rings do.
+    fake.shown.popupOf?.closePopup();
     chooseReport('raid');
     expect(markerOf('Yellow Mural 5')?.options.interactive).toBe(false);
   });
 
+  // Goal 7: "Add stops…" picks stops on the map, a stop with reports by its marker.
+  it('adds stops to the research form by their markers and dots while it adds, and only then', async () => {
+    const { markerOf, raids, chooseReport, panel } = await started({ raids: true, stops: STOPS });
+    chooseReport('research');
+    markerOf('Yellow Mural 5')?.fire('click', {});
+    const chips = () =>
+      panel.querySelectorAll('span.stop-chip').map((chip) => chip.all()[0]?.textContent);
+    expect(raids.forcedPlaces('stops')).toBe(false);
+    panel.querySelector('button[data-add-stops="start"]')?.dispatch('click');
+    expect(raids.forcedPlaces('stops')).toBe(true);
+    expect(markerOf('Yellow Mural 7')?.options.interactive).toBe(true);
+    markerOf('Yellow Mural 7')?.fire('click', {});
+    expect(raids.stopTapped({ id: 'stop-9', title: 'Blue Bench', lat: 40.45, lon: -79.95 })).toBe(
+      true,
+    );
+    expect(chips()).toEqual(['Yellow Mural 5', 'Yellow Mural 7', 'Blue Bench']);
+    expect(fake.shown.popupOf).toBeUndefined();
+    panel.querySelector('button[data-add-stops="done"]')?.dispatch('click');
+    expect(raids.forcedPlaces('stops')).toBe(false);
+    expect(raids.stopTapped({ id: 'stop-10', title: 'Red Bench', lat: 40.45, lon: -79.95 })).toBe(
+      false,
+    );
+  });
+
+  // Review F9: dimmed while "Add stops…" picks, as in the Report button's step 2 (review B7b).
+  it("takes a raid's or a battle's tap and does nothing while stops are added", async () => {
+    const { markerOf, raids, chooseReport, panel } = await started({ raids: true, stops: STOPS });
+    chooseReport('research');
+    markerOf('Yellow Mural 5')?.fire('click', {});
+    panel.querySelector('button[data-add-stops="start"]')?.dispatch('click');
+    for (const title of ['Level 5 raid against Yveltal', spotBattle().title]) {
+      // Drawn as running (review round 2, R3: by the clock of this describe, not the one the
+      // file was loaded at).
+      const icon = markerOf(title)?.options.icon as { options: { html: PageElement } } | undefined;
+      expect(icon?.options.html.classList.contains('dim'), title).toBe(false);
+      markerOf(title)?.fire('click', {});
+      // Compared, not printed: the fakes are no page chai can show.
+      expect(fake.shown.popupOf === undefined, title).toBe(true);
+    }
+    expect(raids.forcedPlaces('stops')).toBe(true);
+    // Done adding: a raid's tap opens it again.
+    panel.querySelector('button[data-add-stops="done"]')?.dispatch('click');
+    markerOf('Level 5 raid against Yveltal')?.fire('click', {});
+    expect(fake.shown.popupOf === markerOf('Level 5 raid against Yveltal')).toBe(true);
+  });
+
+  // Review round 2, R2: a meetup's ring lets taps through while "Add stops…" picks (Leaflet gives
+  // a layer that is not interactive no click), as while a meetup's place is picked.
+  it("lets a meetup ring's taps through while stops are added, and only then", async () => {
+    const meetup: MapMeetup = {
+      kind: 'meetup',
+      id: 'm2',
+      name: 'Walk by the river',
+      startTime: null,
+      endTime: null,
+      link: 'https://discord.com/channels/1/2/7',
+      attendance: attendance(),
+      postKey: null,
+      place: { kind: 'pin', words: 'At a pin', lat: 40.452, lon: -79.96, gymId: null },
+      info: null,
+      panel: null,
+    };
+    const { markerOf, chooseReport, panel } = await started({
+      raids: true,
+      stops: STOPS,
+      parties: view({ meetups: [meetup] }),
+    });
+    const ringTaken = () =>
+      fake.shown.circles.findLast(
+        (circle) => circle.options.pane === 'rings' && (circle.at as number[])[0] === 40.452,
+      )?.options.interactive;
+    expect(ringTaken()).toBe(true);
+    chooseReport('research');
+    markerOf('Yellow Mural 5')?.fire('click', {});
+    expect(ringTaken()).toBe(true);
+    panel.querySelector('button[data-add-stops="start"]')?.dispatch('click');
+    expect(ringTaken()).toBe(false);
+    panel.querySelector('button[data-add-stops="done"]')?.dispatch('click');
+    expect(ringTaken()).toBe(true);
+  });
+
+  // Review F3: a keystroke keeps the search field (an IME's word, a phone's keyboard) and draws
+  // the task list alone; a report on its way keeps its buttons off, whatever draws the form.
+  it('keeps the search field as it is typed in, and the buttons off while a report is sent', async () => {
+    const { markerOf, chooseReport, panel } = await started({
+      raids: true,
+      stops: STOPS,
+      research: caseResearchOptions(),
+      sendsForever: true,
+    });
+    // The lists come, and the search field takes the focus (step 3 of the Report button).
+    const search = new Promise<PageElement>((resolve) => {
+      page.focused = (element) => {
+        if (element.getAttribute('name') === 'query') resolve(element);
+      };
+    });
+    chooseReport('research');
+    markerOf('Yellow Mural 5')?.fire('click', {});
+    const field = await search;
+    // Typed in: the page's own field.
+    vi.stubGlobal('HTMLInputElement', PageElement);
+    Object.assign(field, { name: 'query', value: 'spin' });
+    field.dispatch('input');
+    // Compared, not printed: the fakes are no page chai can show.
+    expect(panel.querySelector('input[name="query"]') === field).toBe(true);
+    expect(panel.querySelectorAll('button[data-task]').map((one) => one.dataset.task)).toEqual([
+      'spin',
+    ]);
+    // Reported, its answer still to come: a stop added meanwhile draws the form again.
+    panel.querySelector('button[data-task="spin"]')?.dispatch('click');
+    panel.querySelector('button[data-add-stops="start"]')?.dispatch('click');
+    panel.querySelector('button[data-submit="research"]')?.dispatch('click');
+    markerOf('Yellow Mural 7')?.fire('click', {});
+    const submit = panel.querySelector('button[data-submit="research"]');
+    expect(submit?.disabled === true || submit?.getAttribute('disabled') !== null).toBe(true);
+  });
+
+  // "Same task at more stops…" from a report's popup, refused (here: a stop gone): the form stays
+  // with the server's words, and the map no longer looks as if it picked stops.
+  it('stops picking stops on the map when a report from "Add stops…" is refused', async () => {
+    const { markerOf, raids, panel, container, nextDraw } = await started({
+      raids: true,
+      stops: STOPS,
+    });
+    const marker = markerOf('Yellow Mural 5');
+    marker?.fire('click', {});
+    const popup = (marker?.content as (() => PageElement) | undefined)?.();
+    popup?.querySelector('button[data-same-task]')?.dispatch('click');
+    expect(container.classList.contains('report-picking')).toBe(true);
+    markerOf('Yellow Mural 7')?.fire('click', {});
+    const drawn = nextDraw();
+    panel.querySelector('button[data-submit="research"]')?.dispatch('click');
+    await drawn;
+    expect(raids.forcedPlaces('stops')).toBe(false);
+    expect(container.classList.contains('report-picking')).toBe(false);
+    expect(panel.querySelector('div.research-form')).not.toBeNull();
+  });
+
   // B3: a report and a party at one stop, one tap lists both.
   it('lists a meetup at a stop and its reports for a tap on either', async () => {
     const at = caseStop(5);
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index dc5b3c03902999e68d15d6c99125f5785340852f..525dd5884f18d4df57a17e87b7e2b2a8217ad7ee 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -79,6 +79,8 @@ import { stopUi } from './stop-report-ui.js';
 import { stopFilterUi } from './stop-filter-ui.js';
 import { rocketBox } from './rocket-forms.js';
 import { rocketUi } from './rocket-ui.js';
+import { researchButton, sameTaskButton } from './research-forms.js';
+import { researchUi } from './research-ui.js';
 import type { StopReport } from './stop-reports.js';
 import type { StopLayer } from './stop-reports.js';
 
@@ -546,16 +548,60 @@ export function showParties(
     },
   });
   /**
-   * What a stop's popup needs of the map now: the clock, your location, the units, and its own
-   * actions for a member who may report (not read-only, as 8M-9A's `reportOffered`).
+   * Field research's form in the side pane (plan 8M-9B, goals 7 and 8, B8): after a report, the
+   * reports at once, then the first stop's popup (B15).
    */
-  const stopContext = (stop: { key: string; name: string }): StopPopupContext => ({
-    now: Date.now(),
-    zone: readerZone(),
-    located: frame.located(),
-    units: frame.units,
-    actions: reportOffered(mayReport, view) ? [rocketBox(stop)] : [],
+  const researchForms = researchUi({
+    guild,
+    csrf: {
+      get: () => csrf,
+      set: (token) => {
+        csrf = token;
+      },
+    },
+    hold,
+    tools,
+    closePopup: () => {
+      map.closePopup();
+      card.close();
+    },
+    done: async (stopKey) => {
+      await stopReports.now();
+      if (stopKey !== undefined) popups.get(`stop:${stopKey}`)?.openPopup();
+    },
+    // "Add stops…": the stops drawn whatever their layer and ringed, the reports' markers taking
+    // taps, the docked pane shown (B9's picking, as the Report button's step 2).
+    picking: (on) => {
+      const container = map.getContainer();
+      container.classList.toggle('report-picking', on);
+      container.classList.toggle('pick-stops', on);
+      frame.placesChanged?.();
+      if (view) hold.shown(view);
+    },
   });
+  /**
+   * A PokéStop tapped, its dot or its reports' marker: added by the research form's "Add stops…",
+   * else the Report button's step 2's (step 3 of a report at a stop, a pin of a spawn or a max
+   * battle); true: its popup is not wanted.
+   */
+  const stopClicked = (stop: MapSpot): boolean =>
+    researchForms.stopClicked(stop) || report.stopClicked(stop);
+  /**
+   * What a stop's popup needs of the map now: the clock, your location, the units, and for a
+   * member who may report (not read-only, as 8M-9A's `reportOffered`) its own actions and a
+   * research report's "Same task at more stops…" (B15: offered once the poll shows the report).
+   */
+  const stopContext = (stop: { key: string; name: string }): StopPopupContext => {
+    const offered = reportOffered(mayReport, view);
+    return {
+      now: Date.now(),
+      zone: readerZone(),
+      located: frame.located(),
+      units: frame.units,
+      actions: offered ? [researchButton(stop), rocketBox(stop)] : [],
+      more: (report, kind) => (offered && kind === 'research' ? [sameTaskButton(report)] : []),
+    };
+  };
   /** A report shown by its id (an ended one too: its popup stays, B14). */
   const stopReportById = (id: string | undefined): StopReport | undefined => {
     const reports = stopReports.view;
@@ -567,10 +613,14 @@ export function showParties(
 
   /**
    * A gym clicked on the map: while a meetup's place is picked it is the place, in route mode the
-   * next stop; true when its popup is not wanted.
+   * next stop; true when its popup is not wanted. While the research form's "Add stops…" picks
+   * stops, taken and nothing done (review F9: dimmed, as in the Report button's step 2).
    */
   const gymClicked = (gym: MapGym): boolean =>
-    report.gymClicked(gym) || meetupForms.gymClicked(gym) || trainForms.gymClicked(gym);
+    researchForms.adding() ||
+    report.gymClicked(gym) ||
+    meetupForms.gymClicked(gym) ||
+    trainForms.gymClicked(gym);
 
   const context = (): ShowContext => ({
     now: Date.now(),
@@ -851,6 +901,13 @@ export function showParties(
         // Report… (plan 8M-8B): `/report`'s form in the place of the post.
         const party = partyById(target.dataset.reportParty);
         if (party) postForms.reportClicked(target, party);
+      } else if (target.dataset.reportResearch !== undefined) {
+        // "Report research here" (plan 8M-9B): the research form in the side pane (B8).
+        researchForms.researchClicked(target);
+      } else if (target.dataset.sameTask !== undefined) {
+        // "Same task at more stops…" (goal 8): the report's task at more stops picked on the map.
+        const report = stopReportById(target.dataset.sameTask);
+        if (report && 'task' in report) researchForms.sameTaskClicked(report);
       } else if (target.dataset.reportRocket !== undefined) {
         // "Report Rocket here" (plan 8M-9B): its form in the place of the button.
         rocketForms.rocketClicked(target);
@@ -1140,7 +1197,8 @@ export function showParties(
    * round 1: `body.form-docked`, whatever "List" says).
    */
   const paneShown = (): void => {
-    const formOpen = hold.asideHeld || trainForms.inTools() || meetupForms.inTools();
+    const formOpen =
+      hold.asideHeld || trainForms.inTools() || meetupForms.inTools() || researchForms.inTools();
     listSection.hidden = paneShows({ loggedIn: true, formOpen }) === 'form';
     document.body.classList.toggle('form-docked', formOpen);
     map.invalidateSize();
@@ -1213,6 +1271,8 @@ export function showParties(
         max.title,
         (made) => withPopup(made, key, () => partyPopup(max, () => maxPopup(max, context()))),
         () =>
+          // Dimmed while "Add stops…" picks stops: the tap does nothing (review F9).
+          researchForms.adding() ||
           report.spotClicked(max.place, true) ||
           (max.spotId !== null &&
             trainForms.spotClicked({ id: max.spotId, title: max.place.name })),
@@ -1242,10 +1302,12 @@ export function showParties(
       return raidAt(gymOfStop(stop) ?? undefined);
     };
     // The train being routed is left to route mode, which draws its stops as they are edited.
-    // While a train is routed or a meetup's place picked, the trains' and meetups' lines and
-    // markers let clicks through to the gyms and the map.
+    // While a train is routed, a meetup's place picked or the research form adds stops (review
+    // round 2, R2), the trains' and meetups' lines and markers let clicks through to the gyms,
+    // the stops and the map.
     const drawn = drawnTrains(next.trains, trainForms.routing()?.id);
-    const interactive = drawn.clickable && !meetupForms.picking() && !report.inTools();
+    const interactive =
+      drawn.clickable && !meetupForms.picking() && !report.inTools() && !researchForms.adding();
     // Meetups at their place (plan 8M-5M): at the gym as the map has it now, else the snapshot's
     // point; listed in the side panel too. A ring without a fill, which takes clicks on its line
     // alone: a gym's dot inside it stays a dot to click. On a pane of its own above the markers
@@ -1345,17 +1407,15 @@ export function showParties(
         // A stop with reports is pickable in the Report button's step 2 of a report at a stop
         // (B9): its marker takes the tap then, the other kinds' let it through as the rings do.
         interactive:
-          drawn.clickable && !meetupForms.picking() && (!report.inTools() || report.picks('stops')),
+          drawn.clickable &&
+          !meetupForms.picking() &&
+          (!report.inTools() || report.picks('stops') || researchForms.adding()),
         // A filter's reports are neither drawn nor listed (goal 5).
         shows: (report, layer) => stopFilters.shows(report, layer),
         bind: (marker, key, popup) => withPopup(marker, key, popup),
+        // Taken by the research form's "Add stops…" first, then by the Report button's step 2.
         tapped: (at) =>
-          report.stopClicked({
-            id: at.stop.key,
-            title: at.stop.name,
-            lat: at.stop.lat,
-            lon: at.stop.lon,
-          }),
+          stopClicked({ id: at.stop.key, title: at.stop.name, lat: at.stop.lat, lon: at.stop.lon }),
         open: (key, marker) => {
           openAt(key, marker);
         },
@@ -1365,7 +1425,8 @@ export function showParties(
     // "New train" (or the form or route editor open in its place) for a member who may; a form
     // open there stays whatever the list says, and is shown over the list (plan 8M-7), which
     // comes back when it closes.
-    const formOpen = trainForms.inTools() || meetupForms.inTools() || report.inTools();
+    const formOpen =
+      trainForms.inTools() || meetupForms.inTools() || report.inTools() || researchForms.inTools();
     const reporting = reportOffered(mayReport, next);
     keepTools<ChildNode>(panel, reporting || formOpen ? tools : undefined);
     // The phone list's own Report line (plan 8M-9A, A7), over the list, while Report is offered
@@ -1716,7 +1777,7 @@ export function showParties(
   // A point of the map clicked while a meetup's place is picked: a pin there.
   map.on('click', (event: L.LeafletMouseEvent) => {
     const point = { lat: event.latlng.lat, lon: event.latlng.lng };
-    if (!report.mapClicked(point)) meetupForms.mapClicked(point);
+    if (!report.mapClicked(point) && !researchForms.mapClicked()) meetupForms.mapClicked(point);
   });
 
   /**
@@ -1846,11 +1907,14 @@ export function showParties(
     // A report at a stop's step 3 (B9): the stop's own popup (or card) opened at it, and Team GO
     // Rocket's form in it, its first field focused (B8).
     toStop: (kind, stop) => {
-      const shown = openStopAt(stop);
-      if (kind === 'rocket') {
-        const button = shown?.querySelector<HTMLButtonElement>('button[data-report-rocket]');
-        if (button) rocketForms.rocketClicked(button, true);
+      // Field research's form in the side pane (B8), its search focused.
+      if (kind === 'research') {
+        researchForms.researchAt({ key: stop.id, name: stop.title });
+        return;
       }
+      const shown = openStopAt(stop);
+      const button = shown?.querySelector<HTMLButtonElement>('button[data-report-rocket]');
+      if (button) rocketForms.rocketClicked(button, true);
     },
   });
   report.refresh();
@@ -1930,7 +1994,8 @@ export function showParties(
     spotClicked: (spot) => report.spotClicked(spot) || trainForms.spotClicked(spot),
     forced: () =>
       trainForms.routing() !== undefined || meetupForms.picking() || report.picks('gyms'),
-    forcedPlaces: (layer) => report.picks(layer),
+    // The PokéStops are drawn to pick also while the research form adds stops (plan 8M-9B).
+    forcedPlaces: (layer) => report.picks(layer) || (layer === 'stops' && researchForms.adding()),
     raidsShown,
     raidGyms: () => raidGyms,
     spotControls: (spot) => (reportOffered(mayReport, view) ? [maxForms.maxControl(spot)] : []),
@@ -1938,7 +2003,7 @@ export function showParties(
     openBattle,
     // A PokéStop's dot in step 2: step 3 of a report at a stop (B9), the pin of a spawn or a max
     // battle at its place (review B6).
-    stopTapped: (stop) => report.stopClicked(stop),
+    stopTapped: (stop) => stopClicked(stop),
     gymTapped: (gym, own) => {
       const target: PlacedThing = {
         key: `gym-dot:${gym.id}`,
diff --git a/src/web/client/research-forms.test.ts b/src/web/client/research-forms.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..bc8bd5ab109f3cf06751c15b1f3545bedb884942
--- /dev/null
+++ b/src/web/client/research-forms.test.ts
@@ -0,0 +1,352 @@
+import { describe, expect, it } from 'vitest';
+import type { PageNode } from './popup.js';
+import {
+  researchBody,
+  researchForm,
+  submitResearch,
+  tasksFound,
+  type ResearchBody,
+  type ResearchSubmitDeps,
+} from './research-forms.js';
+import { STOP_GONE } from './rocket-forms.js';
+import type { StopAnswered } from './stop-forms.js';
+import { caseResearch, caseResearchOptions } from './stop-report-cases.js';
+
+/** Every text of a tree, in order. */
+const texts = (node: PageNode): string[] => [
+  ...(node.text === undefined ? [] : [node.text]),
+  ...(node.children ?? []).flatMap(texts),
+];
+
+/** The nodes of a tree that match. */
+const found = (node: PageNode, test: (one: PageNode) => boolean): PageNode[] => [
+  ...(test(node) ? [node] : []),
+  ...(node.children ?? []).flatMap((child) => found(child, test)),
+];
+
+const OPTIONS = caseResearchOptions();
+const AT = [{ key: 'stop-1', name: 'Yellow Mural 1' }];
+
+/** Deps that answer each report in turn as the test says, and write down what was sent. */
+function deps(answers: StopAnswered[], holds = true) {
+  const sent: ResearchBody[] = [];
+  let asked = 0;
+  const made: ResearchSubmitDeps = {
+    send: (body) => {
+      sent.push(body);
+      const answer = answers.shift() ?? { ok: false, status: 500 };
+      return Promise.resolve({ text: answer.text ?? '', answer });
+    },
+    options: () => {
+      asked += 1;
+      return Promise.resolve(
+        caseResearchOptions({ tasks: OPTIONS.tasks.filter((task) => task.key !== 'spin') }),
+      );
+    },
+    holds: () => holds,
+  };
+  return { made, sent, asked: () => asked };
+}
+
+describe('the field research form of the map (plan 8M-9B, goal 7)', () => {
+  it('finds tasks by any word of their text or rewards, in the list’s order, grouped by category', () => {
+    expect(tasksFound(OPTIONS.tasks, '').map((task) => task.key)).toEqual(['dragon', 'spin']);
+    expect(tasksFound(OPTIONS.tasks, 'BAGON').map((task) => task.key)).toEqual(['dragon']);
+    expect(tasksFound(OPTIONS.tasks, 'pokestops rare').map((task) => task.key)).toEqual(['spin']);
+    const form = researchForm(OPTIONS, AT, { query: '' });
+    expect(found(form, (one) => one.tag === 'h4').map((one) => one.text)).toEqual([
+      'Catching',
+      'Exploring',
+    ]);
+    expect(
+      found(form, (one) => one.attributes?.['data-task'] !== undefined).map(
+        (one) => one.attributes?.['data-task'],
+      ),
+    ).toEqual(['dragon', 'spin']);
+  });
+
+  it('asks the version of a task of several, with their pictures, and takes a task of one as it is', () => {
+    const picked = researchForm(OPTIONS, AT, { query: '', task: 'dragon' });
+    expect(
+      found(picked, (one) => one.attributes?.type === 'radio').map((one) => one.attributes?.value),
+    ).toEqual(['dragon:aaaa1111', 'dragon:bbbb2222', 'dragon']);
+    expect(texts(researchForm(OPTIONS, AT, { query: '', task: 'spin' }))).not.toContain(
+      'Its reward',
+    );
+    expect(researchBody(OPTIONS, AT, { query: '', task: 'dragon' }, { kind: 'new' })).toEqual({
+      text: 'Pick its reward first.',
+    });
+    expect(
+      researchBody(OPTIONS, AT, { query: '', task: 'dragon', version: 'dragon' }, { kind: 'new' }),
+    ).toEqual({ body: { task: 'dragon', stops: ['stop-1'] } });
+    expect(researchBody(OPTIONS, AT, { query: '', task: 'spin' }, { kind: 'new' })).toEqual({
+      body: { task: 'spin:cccc3333', stops: ['stop-1'] },
+    });
+    expect(researchBody(OPTIONS, [], { query: '', task: 'spin' }, { kind: 'new' })).toEqual({
+      text: 'Pick the stop first.',
+    });
+  });
+
+  // Review F2: a version's pictures are the rewards the server says it stands for, never guessed
+  // from the task's rewards by their place (a shiny Dratini listed twice is one version).
+  it('shows each version with the pictures of the rewards the server gives it', () => {
+    const [dragon] = OPTIONS.tasks;
+    const [dratini, bagon] = dragon!.rewards;
+    const shiny = { ...dratini!, image: `${dratini!.image ?? ''}?shiny` };
+    const twice = {
+      ...OPTIONS,
+      tasks: [{ ...dragon!, rewards: [dratini!, shiny, bagon!] }],
+    };
+    const pictures = found(
+      researchForm(twice, AT, { query: '', task: 'dragon' }),
+      (one) => one.className?.includes('choice') === true,
+    )
+      .filter((one) => one.tag === 'label')
+      .map((label) =>
+        found(label, (one) => one.tag === 'img').map((img) => img.attributes?.title ?? ''),
+      );
+    expect(pictures).toEqual([['Dratini'], ['Bagon'], ['Dratini', 'Bagon']]);
+  });
+
+  it('types a task the list lacks, its reward offered from the list’s rewards, the list said stale', () => {
+    const typing = { query: '', typing: { task: 'Catch 3 Pawniard', reward: 'Rare Candy' } };
+    const form = researchForm({ ...OPTIONS, stale: true }, AT, typing);
+    expect(texts(form)).toContain(
+      'The task list may be out of date: a task missing from it can be typed in full.',
+    );
+    expect(found(form, (one) => one.tag === 'option').map((one) => one.attributes?.value)).toEqual([
+      'Bagon',
+      'Dratini',
+      'Rare Candy',
+      'Stardust',
+    ]);
+    expect(found(form, (one) => one.attributes?.['data-task'] !== undefined)).toEqual([]);
+    expect(researchBody(OPTIONS, AT, typing, { kind: 'new' })).toEqual({
+      body: { task: 'Catch 3 Pawniard', reward: 'Rare Candy', stops: ['stop-1'] },
+    });
+    expect(
+      researchBody(OPTIONS, AT, { query: '', typing: { task: ' ', reward: '' } }, { kind: 'new' }),
+    ).toEqual({ text: 'Type the task first.' });
+  });
+
+  it('names up to five stops as chips with ×, "Add stops…" while there is room', () => {
+    const five = [1, 2, 3, 4, 5].map((n) => ({
+      key: `stop-${String(n)}`,
+      name: `Stop ${String(n)}`,
+    }));
+    expect(texts(researchForm(OPTIONS, AT, { query: '' }))).toContain('Add stops…');
+    expect(texts(researchForm(OPTIONS, five, { query: '' }))).not.toContain('Add stops…');
+    expect(
+      found(
+        researchForm(OPTIONS, five, { query: '' }),
+        (one) => one.attributes?.['data-remove-stop'] !== undefined,
+      ),
+    ).toHaveLength(5);
+    expect(texts(researchForm(OPTIONS, AT, { query: '', adding: true }))).toContain('Done adding');
+  });
+
+  // Review F3: a form drawn again while its report is on its way can send nothing more.
+  it('draws every button off while its report is sent', () => {
+    const buttons = (sending: boolean) =>
+      found(
+        researchForm(OPTIONS, AT, { query: '', task: 'dragon', sending }),
+        (one) => one.tag === 'button',
+      );
+    expect(buttons(true).length).toBeGreaterThan(3);
+    expect(buttons(true).every((one) => one.attributes?.disabled !== undefined)).toBe(true);
+    expect(buttons(false).some((one) => one.attributes?.disabled !== undefined)).toBe(false);
+  });
+
+  it('closes when made, and when every stop was reported already', async () => {
+    const made = deps([{ ok: true, status: 200, text: 'Reported.' }]);
+    expect(
+      await submitResearch(OPTIONS, AT, { query: '', task: 'spin' }, { kind: 'new' }, made.made),
+    ).toEqual({ kind: 'close', text: 'Reported.' });
+    const already = deps([{ ok: false, status: 409, text: 'Reported already at Yellow Mural 1.' }]);
+    expect(
+      (
+        await submitResearch(
+          OPTIONS,
+          AT,
+          { query: '', task: 'spin' },
+          { kind: 'new' },
+          already.made,
+        )
+      ).kind,
+    ).toBe('close');
+  });
+
+  it('asks the contradiction question, and Report sends it again with the ticked ones (R7)', async () => {
+    const contested = caseResearch(2, { text: 'Spin 3 PokéStops', rewardText: 'Rare Candy ×3' });
+    const asking = deps([
+      {
+        ok: false,
+        status: 422,
+        text: 'Another member’s report stands at a stop you named. Tick it to replace that report…',
+        asks: { reports: [contested], hidden: [{ id: 9, stop: 'Hidden Bench' }] },
+      },
+    ]);
+    const after = await submitResearch(
+      OPTIONS,
+      AT,
+      { query: '', task: 'dragon', version: 'dragon' },
+      { kind: 'new' },
+      asking.made,
+    );
+    if (after.kind !== 'draw') throw new Error(after.kind);
+    const question = researchForm(OPTIONS, AT, after.state);
+    expect(texts(question)).toEqual(
+      expect.arrayContaining([
+        'Another member’s report stands at a stop you named. Tick it to replace that report…',
+        'Yellow Mural 2 · Spin 3 PokéStops · Rare Candy ×3 · by Brock',
+        'Hidden Bench (a report you cannot see)',
+      ]),
+    );
+    // Unticked, and no task list under the question.
+    const boxes = found(question, (one) => one.attributes?.type === 'checkbox');
+    expect(boxes.map((one) => [one.attributes?.value, one.attributes?.checked])).toEqual([
+      ['2', undefined],
+      ['9', undefined],
+    ]);
+    expect(found(question, (one) => one.attributes?.['data-task'] !== undefined)).toEqual([]);
+    // Report with none ticked replaces none: `replacing: []`.
+    const again = deps([{ ok: true, status: 200, text: 'Reported.' }]);
+    await submitResearch(OPTIONS, AT, after.state, { kind: 'new' }, again.made, []);
+    expect(again.sent).toEqual([{ task: 'dragon', stops: ['stop-1'], replacing: [] }]);
+  });
+
+  it('asks for the lists again when the list changed, the pick kept where still listed (B4)', async () => {
+    const changed = deps([
+      {
+        ok: false,
+        status: 422,
+        text: 'The task list just changed: pick the task again.',
+        reason: 'list-changed',
+      },
+    ]);
+    const after = await submitResearch(
+      OPTIONS,
+      AT,
+      { query: 'dra', task: 'dragon', version: 'dragon:aaaa1111' },
+      { kind: 'new' },
+      changed.made,
+    );
+    expect(changed.asked()).toBe(1);
+    expect(after).toMatchObject({
+      kind: 'draw',
+      state: { query: 'dra', task: 'dragon', version: 'dragon:aaaa1111' },
+    });
+    const gone = deps([
+      {
+        ok: false,
+        status: 422,
+        text: 'The task list just changed: pick the task again.',
+        reason: 'list-changed',
+      },
+    ]);
+    const without = await submitResearch(
+      OPTIONS,
+      AT,
+      { query: '', task: 'spin' },
+      { kind: 'new' },
+      gone.made,
+    );
+    expect(without).toMatchObject({ kind: 'draw', state: { query: '' } });
+    if (without.kind === 'draw') expect(without.state.task).toBeUndefined();
+  });
+
+  it('says a stop gone in its own words, the form kept (B6)', async () => {
+    const gone = deps([{ ok: false, status: 404, text: 'Not found.' }]);
+    expect(
+      await submitResearch(OPTIONS, AT, { query: '', task: 'spin' }, { kind: 'new' }, gone.made),
+    ).toMatchObject({ kind: 'draw', text: STOP_GONE });
+  });
+});
+
+describe('"Same task at more stops…" (plan 8M-9B, goal 8)', () => {
+  const listed = caseResearch(1, { task: 'dragon:aaaa1111' });
+
+  it('sends the report’s id with the stops picked, and its task with `more` once it is gone', async () => {
+    const more = { kind: 'more' as const, report: listed };
+    expect(researchBody(OPTIONS, [], { query: '' }, more)).toEqual({
+      text: 'Add the stops first.',
+    });
+    const ended = deps([
+      { ok: false, status: 409, text: 'That report has ended.', reason: 'ended' },
+      { ok: true, status: 200, text: 'Reported.' },
+    ]);
+    const after = await submitResearch(OPTIONS, AT, { query: '' }, more, ended.made);
+    expect(ended.sent).toEqual([
+      { sameAs: 1, stops: ['stop-1'] },
+      { task: 'dragon:aaaa1111', more: true, stops: ['stop-1'] },
+    ]);
+    expect(after).toEqual({ kind: 'close', text: 'Reported.' });
+  });
+
+  it('says the server’s words for a typed one gone, its task being no task of the list', async () => {
+    const typed = caseResearch(1, {
+      task: 'typed:0000000000000001',
+      typed: true,
+      text: 'Win 3 raids in the rain',
+      rewardText: 'Rare Candy',
+      rewards: [{ ...OPTIONS.tasks[1]!.rewards[0]!, quantity: 0 }],
+    });
+    const ended = deps([
+      { ok: false, status: 409, text: 'That report has ended.', reason: 'ended' },
+    ]);
+    const after = await submitResearch(
+      OPTIONS,
+      AT,
+      { query: '' },
+      { kind: 'more', report: typed },
+      ended.made,
+    );
+    expect(ended.sent).toHaveLength(1);
+    expect(after).toMatchObject({ kind: 'draw', text: 'That report has ended.' });
+    // Review F6: a new report's form, its task and reward typed in, never `sameAs` again.
+    if (after.kind !== 'draw') throw new Error(after.kind);
+    expect(after.mode).toEqual({ kind: 'new' });
+    expect(researchBody(after.options, AT, after.state, after.mode ?? { kind: 'new' })).toEqual({
+      body: { task: 'Win 3 raids in the rain', reward: 'Rare Candy', stops: ['stop-1'] },
+    });
+  });
+
+  // Review F6: sent again by its task, the list changed under it: a new report's form.
+  it('turns to a new report’s form when the task sent again is no longer listed as it was', async () => {
+    const changed = deps([
+      { ok: false, status: 409, text: 'That report has ended.', reason: 'ended' },
+      {
+        ok: false,
+        status: 422,
+        text: 'The task list just changed: pick the task again.',
+        reason: 'list-changed',
+      },
+    ]);
+    const after = await submitResearch(
+      OPTIONS,
+      AT,
+      { query: '' },
+      { kind: 'more', report: listed },
+      changed.made,
+    );
+    expect(changed.asked()).toBe(1);
+    if (after.kind !== 'draw') throw new Error(after.kind);
+    expect(after.mode).toEqual({ kind: 'new' });
+    // Its version still listed: picked in the new lists.
+    expect(after.state).toMatchObject({ task: 'dragon', version: 'dragon:aaaa1111' });
+    expect(after.text).toBe('The task list just changed: pick the task again.');
+  });
+
+  it('names the task and its reward in place of the task list', () => {
+    const form = researchForm(OPTIONS, [], { query: '' }, { kind: 'more', report: listed });
+    expect(texts(form)).toEqual(
+      expect.arrayContaining([
+        'Same task at more stops',
+        'Catch a Dragon-type Pokémon',
+        'Dratini',
+        'More stops',
+      ]),
+    );
+    expect(found(form, (one) => one.attributes?.['data-task'] !== undefined)).toEqual([]);
+  });
+});
diff --git a/src/web/client/research-forms.ts b/src/web/client/research-forms.ts
new file mode 100644
index 0000000000000000000000000000000000000000..207c9b908ae5f5db8bc67f359b374e99532209ce
--- /dev/null
+++ b/src/web/client/research-forms.ts
@@ -0,0 +1,621 @@
+import type {
+  HiddenReport,
+  MapResearch,
+  MapReward,
+  ResearchOptionsView,
+  ResearchTaskOption,
+} from '../../domain/web/stop-report-data.js';
+import type { PageNode } from './popup.js';
+import { STOP_GONE } from './rocket-forms.js';
+import type { StopAnswered } from './stop-forms.js';
+
+/*
+ * The field research form of the live map (plan 8M-9B, goals 7 and 8; B8: in the side pane, docked
+ * under the map on a phone, as the meetup and train forms), the part with no page in it. A new
+ * report: the task searched for in the whole list (`/api/research-options`, the server's order, an
+ * event's tasks first, grouped by `category`), then its version where it has several (one reward
+ * each, then "one of", with the rewards' pictures; a task of one version takes it without asking);
+ * a task the list lacks typed in full with its reward ("I can't find my task"); the stops: the one
+ * it was opened on and up to four more picked on the map ("Add stops…"). "Same task at more
+ * stops…" (`sameAs`): the task of a report standing, at up to four more stops. Its Submit
+ * (`submitResearch`) sends `POST …/api/research` and does what the answer says by its machine
+ * parts (B4): made, the form closes; every stop reported already, its words; the report `sameAs`
+ * named gone (`reason: 'ended'`), a listed one sent again by its task with `more: true`, a typed
+ * one (or a listed one whose task the list lost since) turned into a new report's form; the list
+ * changed (`reason: 'list-changed'`), the lists asked for again, the pick kept where still listed;
+ * other members' reports it contradicts (`asks`), the contradiction question in the form, an
+ * unticked checkbox per report, Report sending it again with `replacing` (none ticked: `[]`),
+ * Cancel sending nothing (R7); a stop gone (404), the page's own words (B6).
+ */
+
+/** The most stops a report names (`STOP_OPTIONS` of `/research`: the one and four more). */
+export const MAX_STOPS = 5;
+
+/** A stop picked for the report: its key as `/api/stops` names it, and its name. */
+export interface PickedStop {
+  key: string;
+  name: string;
+}
+
+/** What the form holds, kept when it is drawn anew. */
+export interface ResearchFormState {
+  /** The words searched for in the task list. */
+  query: string;
+  /** The task picked, by its key. */
+  task?: string;
+  /** Its version picked, by its value. */
+  version?: string;
+  /** "I can't find my task": the task and its reward typed in full. */
+  typing?: { task: string; reward: string };
+  /** The contradiction question (422 `asks`): its words and the reports it names. */
+  asks?: { text: string; reports: MapResearch[]; hidden: HiddenReport[] };
+  /** "Add stops…" is picking stops on the map. */
+  adding?: boolean;
+  /** Its report is on its way: every button is drawn off (review F3), whatever draws the form. */
+  sending?: boolean;
+}
+
+/** A tree of the form with every button off while its report is sent (review F3). */
+function offWhileSending(node: PageNode, state: ResearchFormState): PageNode {
+  if (state.sending !== true) return node;
+  const off = (one: PageNode): PageNode => ({
+    ...one,
+    ...(one.tag === 'button' ? { attributes: { ...one.attributes, disabled: '' } } : {}),
+    ...(one.children === undefined ? {} : { children: one.children.map(off) }),
+  });
+  return off(node);
+}
+
+/** What the form reports: a task of the list or typed, or the task of a report (`sameAs`). */
+export type ResearchMode = { kind: 'new' } | { kind: 'more'; report: MapResearch };
+
+/** "Report research here" in a stop's popup: the form in the side pane, with the stop. */
+export function researchButton(stop: PickedStop): PageNode {
+  return {
+    tag: 'button',
+    className: 'press',
+    text: 'Report research here',
+    attributes: { type: 'button', 'data-report-research': stop.key, 'data-stop-name': stop.name },
+  };
+}
+
+/** "Same task at more stops…" on a research report of a popup (goal 8). */
+export function sameTaskButton(report: Pick<MapResearch, 'id'>): PageNode {
+  return {
+    tag: 'button',
+    className: 'link-button',
+    text: 'Same task at more stops…',
+    attributes: { type: 'button', 'data-same-task': String(report.id) },
+  };
+}
+
+/** Folded for a search: no case, accents or apostrophes. */
+const fold = (text: string): string =>
+  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/['’]/gu, '').toLowerCase();
+
+/** The tasks a search shows, in the list's order: every word typed in its text or rewards. */
+export function tasksFound(
+  tasks: readonly ResearchTaskOption[],
+  query: string,
+): ResearchTaskOption[] {
+  const words = fold(query)
+    .split(/\s+/u)
+    .filter((word) => word !== '');
+  return tasks.filter((task) => {
+    const said = fold([task.text, ...task.rewards.map((reward) => reward.name)].join(' '));
+    return words.every((word) => said.includes(word));
+  });
+}
+
+/** Small pictures of rewards, each named. */
+function rewardPictures(rewards: readonly MapReward[]): PageNode[] {
+  const shown = rewards.flatMap((reward): PageNode[] =>
+    reward.image === undefined
+      ? []
+      : [
+          {
+            tag: 'img',
+            className: 'small-picture',
+            attributes: {
+              src: reward.image,
+              alt: reward.name,
+              title: reward.name,
+              draggable: 'false',
+            },
+          },
+        ],
+  );
+  return shown.length === 0 ? [] : [{ tag: 'span', className: 'small-pictures', children: shown }];
+}
+
+/** The stops of the form as chips with ×, "Add stops…" while there is room. */
+function stopsPart(stops: readonly PickedStop[], adding: boolean, more: boolean): PageNode[] {
+  return [
+    {
+      tag: 'div',
+      className: 'form-row stop-chips',
+      children: [
+        { tag: 'span', text: more ? 'More stops' : stops.length > 1 ? 'Stops' : 'Stop' },
+        {
+          tag: 'div',
+          className: 'chips',
+          children: stops.map((stop): PageNode => ({
+            tag: 'span',
+            className: 'stop-chip',
+            children: [
+              { tag: 'span', text: stop.name },
+              {
+                tag: 'button',
+                className: 'clear-filter',
+                text: '×',
+                attributes: {
+                  type: 'button',
+                  'data-remove-stop': stop.key,
+                  'aria-label': `Leave out ${stop.name}`,
+                },
+              },
+            ],
+          })),
+        },
+        ...(adding
+          ? [
+              {
+                tag: 'p',
+                className: 'hint',
+                attributes: { 'aria-live': 'polite' },
+                text: `Tap PokéStops on the map to add them (up to ${String(MAX_STOPS)} in all).`,
+              },
+              {
+                tag: 'button',
+                className: 'press',
+                text: 'Done adding',
+                attributes: { type: 'button', 'data-add-stops': 'done' },
+              },
+            ]
+          : stops.length < MAX_STOPS
+            ? [
+                {
+                  tag: 'button',
+                  className: 'press',
+                  text: 'Add stops…',
+                  attributes: { type: 'button', 'data-add-stops': 'start' },
+                },
+              ]
+            : []),
+      ],
+    },
+  ];
+}
+
+/**
+ * The tasks a search finds, grouped by category, one picked: drawn anew alone as the search is
+ * typed in (review F3: the field itself is kept).
+ */
+export function taskList(options: ResearchOptionsView, state: ResearchFormState): PageNode {
+  const found = tasksFound(options.tasks, state.query);
+  const groups = new Map<string, ResearchTaskOption[]>();
+  for (const task of found) groups.set(task.category, [...(groups.get(task.category) ?? []), task]);
+  const list: PageNode = {
+    tag: 'div',
+    className: 'task-list',
+    attributes: { role: 'group', 'aria-label': 'Tasks' },
+    children:
+      found.length === 0
+        ? [{ tag: 'p', className: 'hint', text: 'No task of the list has these words.' }]
+        : [...groups].flatMap(([category, tasks]): PageNode[] => [
+            { tag: 'h4', text: category },
+            ...tasks.map((task): PageNode => ({
+              tag: 'button',
+              className: 'task-choice',
+              attributes: {
+                type: 'button',
+                'data-task': task.key,
+                'aria-pressed': String(task.key === state.task),
+              },
+              children: [
+                { tag: 'span', className: 'task-text', text: task.text },
+                ...rewardPictures(task.rewards),
+              ],
+            })),
+          ]),
+  };
+  return offWhileSending(list, state);
+}
+
+/** The task list: a search box, then the tasks it finds (`taskList`). */
+function tasksPart(options: ResearchOptionsView, state: ResearchFormState): PageNode[] {
+  return [
+    {
+      tag: 'label',
+      className: 'form-row',
+      children: [
+        { tag: 'span', text: 'Task' },
+        {
+          tag: 'input',
+          attributes: {
+            name: 'query',
+            type: 'search',
+            placeholder: 'Search the tasks or rewards',
+            autocomplete: 'off',
+            value: state.query,
+          },
+        },
+      ],
+    },
+    taskList(options, state),
+  ];
+}
+
+/** The versions of the task picked, where it has several: a radio each with its pictures. */
+function versionsPart(
+  task: ResearchTaskOption | undefined,
+  picked: string | undefined,
+): PageNode[] {
+  if (!task || task.versions.length < 2) return [];
+  return [
+    {
+      tag: 'fieldset',
+      className: 'form-choice',
+      children: [
+        { tag: 'legend', text: 'Its reward' },
+        ...task.versions.map((version): PageNode => ({
+          tag: 'label',
+          className: 'choice',
+          children: [
+            {
+              tag: 'input',
+              attributes: {
+                type: 'radio',
+                name: 'version',
+                value: version.value,
+                ...(version.value === picked ? { checked: '' } : {}),
+              },
+            },
+            {
+              tag: 'span',
+              className: 'choice-words',
+              children: [
+                { tag: 'span', className: 'choice-label', text: version.label },
+                // The rewards the server says it stands for (review F2).
+                ...rewardPictures(version.rewards),
+              ],
+            },
+          ],
+        })),
+      ],
+    },
+  ];
+}
+
+/** "I can't find my task": the task and its reward typed in full, the reward offered as typed. */
+function typingPart(options: ResearchOptionsView, typing: ResearchFormState['typing']): PageNode[] {
+  if (typing === undefined) {
+    return [
+      {
+        tag: 'button',
+        className: 'link-button',
+        text: 'I can’t find my task',
+        attributes: { type: 'button', 'data-typing': 'start' },
+      },
+    ];
+  }
+  const names = new Set([
+    ...options.rewards.map((reward) => reward.name),
+    ...options.tasks.flatMap((task) => task.rewards.map((reward) => reward.name)),
+  ]);
+  return [
+    {
+      tag: 'label',
+      className: 'form-row',
+      children: [
+        { tag: 'span', text: 'The task, in full' },
+        {
+          tag: 'input',
+          attributes: {
+            name: 'typedTask',
+            type: 'text',
+            maxlength: '100',
+            autocomplete: 'off',
+            placeholder: 'As the game words it',
+            value: typing.task,
+          },
+        },
+      ],
+    },
+    {
+      tag: 'label',
+      className: 'form-row',
+      children: [
+        { tag: 'span', text: 'Its reward' },
+        {
+          tag: 'input',
+          attributes: {
+            name: 'typedReward',
+            type: 'text',
+            maxlength: '100',
+            autocomplete: 'off',
+            list: 'research-rewards',
+            placeholder: 'optional: a Pokémon or an item',
+            value: typing.reward,
+          },
+        },
+      ],
+    },
+    {
+      tag: 'datalist',
+      attributes: { id: 'research-rewards' },
+      children: [...names]
+        .sort()
+        .map((name): PageNode => ({ tag: 'option', attributes: { value: name } })),
+    },
+    {
+      tag: 'button',
+      className: 'link-button',
+      text: '← Pick from the list',
+      attributes: { type: 'button', 'data-typing': 'stop' },
+    },
+  ];
+}
+
+/**
+ * The contradiction question in the form (R7): its words, then an unticked checkbox per report it
+ * names (its stop, task and reporter as the list shows it; those the member cannot see by their
+ * stop alone), then Report (sending it again with the ticked ones) and Cancel (sending nothing).
+ */
+function asksPart(asks: NonNullable<ResearchFormState['asks']>): PageNode[] {
+  const box = (id: number, label: string): PageNode => ({
+    tag: 'label',
+    className: 'choice',
+    children: [
+      { tag: 'input', attributes: { type: 'checkbox', name: 'replacing', value: String(id) } },
+      { tag: 'span', className: 'choice-words', text: label },
+    ],
+  });
+  return [
+    { tag: 'p', className: 'form-text', attributes: { role: 'alert' }, text: asks.text },
+    {
+      tag: 'fieldset',
+      className: 'form-choice',
+      children: [
+        { tag: 'legend', text: 'Replace' },
+        ...asks.reports.map((report) =>
+          box(
+            report.id,
+            `${report.stop.name} · ${report.text}${report.rewardText === '' ? '' : ` · ${report.rewardText}`} · by ${report.reporter}`,
+          ),
+        ),
+        ...asks.hidden.map((report) => box(report.id, `${report.stop} (a report you cannot see)`)),
+      ],
+    },
+  ];
+}
+
+/** The form: its heading, its stops, then the task (or the question), Report and Cancel. */
+export function researchForm(
+  options: ResearchOptionsView | undefined,
+  stops: readonly PickedStop[],
+  state: ResearchFormState,
+  mode: ResearchMode = { kind: 'new' },
+): PageNode {
+  const task = options?.tasks.find((one) => one.key === state.task);
+  const body: PageNode[] =
+    state.asks !== undefined
+      ? asksPart(state.asks)
+      : mode.kind === 'more'
+        ? [
+            { tag: 'p', className: 'form-text', text: mode.report.text },
+            ...(mode.report.rewardText === ''
+              ? []
+              : [{ tag: 'p', className: 'hint', text: mode.report.rewardText }]),
+          ]
+        : options === undefined
+          ? [{ tag: 'p', className: 'hint', text: 'Loading the task list…' }]
+          : [
+              ...(options.stale
+                ? [
+                    {
+                      tag: 'p',
+                      className: 'hint',
+                      text: 'The task list may be out of date: a task missing from it can be typed in full.',
+                    },
+                  ]
+                : []),
+              ...(state.typing === undefined
+                ? [...tasksPart(options, state), ...versionsPart(task, state.version)]
+                : []),
+              ...typingPart(options, state.typing),
+            ];
+  const form: PageNode = {
+    tag: 'div',
+    className: 'raid-form research-form stop-form',
+    attributes: {
+      'data-form': 'research',
+      role: 'group',
+      'aria-label': mode.kind === 'more' ? 'Same task at more stops' : 'Report field research',
+    },
+    children: [
+      {
+        tag: 'strong',
+        className: 'name',
+        attributes: { tabindex: '-1', 'data-form-heading': '' },
+        text: mode.kind === 'more' ? 'Same task at more stops' : 'Report field research',
+      },
+      ...stopsPart(stops, state.adding === true, mode.kind === 'more'),
+      ...body,
+      {
+        tag: 'div',
+        className: 'form-buttons',
+        children: [
+          {
+            tag: 'button',
+            className: 'press primary',
+            text: 'Report',
+            attributes: { type: 'button', 'data-submit': 'research' },
+          },
+          {
+            tag: 'button',
+            className: 'press',
+            text: 'Cancel',
+            attributes: { type: 'button', 'data-cancel': '' },
+          },
+        ],
+      },
+      { tag: 'div', className: 'form-answer', attributes: { hidden: '', 'aria-live': 'polite' } },
+    ],
+  };
+  return offWhileSending(form, state);
+}
+
+/** A research report's body (`POST …/api/research`). */
+export type ResearchBody =
+  | { task: string; reward?: string; more?: true; stops: string[]; replacing?: number[] }
+  | { sameAs: number; stops: string[]; replacing?: number[] };
+
+/** The body of the form, or what must be filled in first. */
+export function researchBody(
+  options: ResearchOptionsView | undefined,
+  stops: readonly PickedStop[],
+  state: ResearchFormState,
+  mode: ResearchMode,
+  replacing?: number[],
+): { body: ResearchBody } | { text: string } {
+  if (stops.length === 0) {
+    return { text: mode.kind === 'more' ? 'Add the stops first.' : 'Pick the stop first.' };
+  }
+  const keys = stops.map((stop) => stop.key);
+  const also = replacing === undefined ? {} : { replacing };
+  if (mode.kind === 'more') return { body: { sameAs: mode.report.id, stops: keys, ...also } };
+  if (state.typing !== undefined) {
+    const task = state.typing.task.trim();
+    if (task === '') return { text: 'Type the task first.' };
+    const reward = state.typing.reward.trim();
+    return { body: { task, ...(reward === '' ? {} : { reward }), stops: keys, ...also } };
+  }
+  const task = options?.tasks.find((one) => one.key === state.task);
+  if (!task) return { text: 'Pick the task first.' };
+  const [only] = task.versions;
+  const version = task.versions.length === 1 ? only?.value : state.version;
+  if (version === undefined || !task.versions.some((one) => one.value === version)) {
+    return { text: 'Pick its reward first.' };
+  }
+  return { body: { task: version, stops: keys, ...also } };
+}
+
+/** What the page does after a research report's answer. */
+export type ResearchAfter =
+  /** Something to fill in first: said under the form, nothing sent. */
+  | { kind: 'missing'; text: string }
+  /** The form went away meanwhile: only its words are said. */
+  | { kind: 'gone'; text: string }
+  /** Made, or every stop reported already: the form closes, its first stop opened after the poll. */
+  | { kind: 'close'; text: string }
+  /** The form drawn again: the question, new lists, or the words of a refusal. */
+  | {
+      kind: 'draw';
+      options: ResearchOptionsView | undefined;
+      state: ResearchFormState;
+      text: string;
+      /**
+       * The report `sameAs` named is gone and could not be sent by its task (a typed one, or one
+       * whose task the list changed since): a new report's form (review F6).
+       */
+      mode?: ResearchMode;
+    };
+
+/** What `submitResearch` needs: sending, the lists, whether the form still holds. */
+export interface ResearchSubmitDeps {
+  send(body: ResearchBody): Promise<{ text: string; answer: StopAnswered }>;
+  options(): Promise<ResearchOptionsView>;
+  holds(): boolean;
+}
+
+/**
+ * The research form's Submit (and its Report after the question): the body, the report, and what
+ * the answer leads to, by its machine parts (B4), the words only shown.
+ */
+export async function submitResearch(
+  options: ResearchOptionsView | undefined,
+  stops: readonly PickedStop[],
+  state: ResearchFormState,
+  mode: ResearchMode,
+  deps: ResearchSubmitDeps,
+  replacing?: number[],
+): Promise<ResearchAfter> {
+  const made = researchBody(options, stops, state, mode, replacing);
+  if ('text' in made) return { kind: 'missing', text: made.text };
+  let sent = await deps.send(made.body);
+  // "Same task at more stops…" of a report gone since (goal 8): a listed one by its task, as
+  // "Same task at more stops…" (`more`); a typed one's task is no task of the list.
+  if (sent.answer.reason === 'ended' && mode.kind === 'more' && !mode.report.typed) {
+    sent = await deps.send({
+      task: mode.report.task,
+      more: true,
+      stops: made.body.stops,
+      ...(replacing === undefined ? {} : { replacing }),
+    });
+  }
+  if (!deps.holds()) return { kind: 'gone', text: sent.text };
+  const { answer } = sent;
+  const kept: ResearchFormState = { ...state, adding: false };
+  delete kept.asks;
+  if (answer.ok || (answer.status === 409 && answer.reason === undefined)) {
+    return { kind: 'close', text: sent.text };
+  }
+  // A typed report gone (review F6): its task is no task of the list, and `sameAs` would be
+  // refused again; a new report's form, its task and reward typed in, the stops kept.
+  if (answer.reason === 'ended' && mode.kind === 'more') {
+    const [reward] = mode.report.rewards;
+    return {
+      kind: 'draw',
+      options,
+      state: { query: '', typing: { task: mode.report.text, reward: reward?.name ?? '' } },
+      text: sent.text,
+      mode: { kind: 'new' },
+    };
+  }
+  if (answer.status === 404) return { kind: 'draw', options, state: kept, text: STOP_GONE };
+  const asks = answer.asks;
+  if (
+    answer.status === 422 &&
+    asks !== undefined &&
+    (asks.reports !== undefined || asks.hidden !== undefined)
+  ) {
+    return {
+      kind: 'draw',
+      options,
+      state: {
+        ...kept,
+        asks: { text: sent.text, reports: asks.reports ?? [], hidden: asks.hidden ?? [] },
+      },
+      text: sent.text,
+    };
+  }
+  if (answer.reason === 'list-changed') {
+    let now = options;
+    try {
+      now = await deps.options();
+    } catch {
+      // The lists it has stay.
+    }
+    if (mode.kind === 'more') {
+      // Sent again by its task, the list changed under it (review F6): a new report's form, the
+      // report's version picked where the new lists still have it.
+      const wanted = mode.report.task;
+      const task = now?.tasks.find((one) => one.versions.some((each) => each.value === wanted));
+      const picked: ResearchFormState = { query: '' };
+      if (task) {
+        picked.task = task.key;
+        picked.version = wanted;
+      }
+      return { kind: 'draw', options: now, state: picked, text: sent.text, mode: { kind: 'new' } };
+    }
+    const task = now?.tasks.find((one) => one.key === state.task);
+    const version = task?.versions.some((one) => one.value === state.version) === true;
+    const picked: ResearchFormState = { query: state.query };
+    if (task) picked.task = task.key;
+    if (task && version && state.version !== undefined) picked.version = state.version;
+    if (state.typing !== undefined) picked.typing = state.typing;
+    return { kind: 'draw', options: now, state: picked, text: sent.text };
+  }
+  return { kind: 'draw', options, state: kept, text: sent.text };
+}
diff --git a/src/web/client/research-ui.ts b/src/web/client/research-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ab4baf524314a2d4026905486e2b120ee9ecf8f1
--- /dev/null
+++ b/src/web/client/research-ui.ts
@@ -0,0 +1,326 @@
+import type { MapResearch, ResearchOptionsView } from '../../domain/web/stop-report-data.js';
+import { getJson, say } from './common.js';
+import type { Me } from './notice.js';
+import { renderNode } from './popup.js';
+import type { FormClaim, FormHold } from './raid-forms.js';
+import { sayUnder } from './raid-ui.js';
+import {
+  MAX_STOPS,
+  researchForm,
+  submitResearch,
+  taskList,
+  type PickedStop,
+  type ResearchAfter,
+  type ResearchBody,
+  type ResearchFormState,
+  type ResearchMode,
+} from './research-forms.js';
+import { TAP_A_STOP } from './report-flow.js';
+import { sendStop } from './stop-forms.js';
+import { newTrainButton } from './train-forms.js';
+
+/*
+ * The field research form of the live map in the page (plan 8M-9B, goals 7 and 8; B8): in the side
+ * pane's box (docked under the map on a phone), as the meetup and train forms, an aside claim of
+ * the hold (`take(false, true)`), the list drawn under it. "Report research here" in a stop's popup
+ * and the Report button's step 3 at a stop open it with the stop; "Same task at more stops…" on a
+ * research report opens it with that report's task, picking stops at once. "Add stops…" picks
+ * stops on the map: the stops drawn whatever their layer and ringed (`adding`), a tap on one (its
+ * dot or its reports' marker) adding it, a tap on open map saying "Tap a PokéStop.". After a
+ * report, the reports asked for at once and the first stop's popup opened after the poll (B15).
+ */
+export interface ResearchUiDeps {
+  guild: string;
+  /** The page's CSRF token, which a stale one's renewal changes. */
+  csrf: { get(): string; set(token: string): void };
+  hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'release'>;
+  /** The side pane's box, where the form is drawn. */
+  tools: HTMLElement;
+  /** Closes the popup or card that is open (the form is in the side pane). */
+  closePopup(): void;
+  /** After a report: the reports asked for at once, then the stop's popup opened. */
+  done(stopKey: string | undefined): Promise<void>;
+  /** The stops to pick drawn or taken away (`adding`), the map's look with them. */
+  picking(on: boolean): void;
+}
+
+/** What the page says of a form while another one is open. */
+const FORM_OPEN = 'Close the form that is open first.';
+
+/** What the page says when the task list cannot be loaded. */
+const NO_OPTIONS = 'The task list could not be loaded. Try again in a moment.';
+
+export function researchUi(deps: ResearchUiDeps) {
+  const { guild, hold } = deps;
+  let open:
+    | {
+        claim: FormClaim;
+        stops: PickedStop[];
+        state: ResearchFormState;
+        mode: ResearchMode;
+        lists: ResearchOptionsView | undefined;
+      }
+    | undefined;
+
+  const options = (): Promise<ResearchOptionsView> =>
+    getJson<ResearchOptionsView>(`/s/${guild}/api/research-options`);
+
+  const send = async (form: HTMLElement, body: ResearchBody) => {
+    // Off until the answer, also in a form drawn anew meanwhile (review F3: `sending`).
+    const sending = open;
+    if (sending) sending.state.sending = true;
+    const buttons = form.querySelectorAll('button');
+    for (const each of buttons) each.disabled = true;
+    const sent = await sendStop(deps.csrf.get(), {
+      post: async (token) => {
+        const reply = await fetch(`/s/${guild}/api/research`, {
+          method: 'POST',
+          credentials: 'same-origin',
+          headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
+          body: JSON.stringify(body),
+        });
+        return {
+          status: reply.status,
+          body: (await reply.json().catch(() => undefined)) as unknown,
+        };
+      },
+      me: () => getJson<Me>(`/s/${guild}/api/me`),
+    });
+    deps.csrf.set(sent.csrf);
+    if (sending) delete sending.state.sending;
+    for (const each of buttons) each.disabled = false;
+    return sent;
+  };
+
+  /** The form drawn anew from what it holds; the focus on `focus`, or kept on its control. */
+  const draw = (focus?: string): void => {
+    if (!open) return;
+    const active = document.activeElement;
+    const kept =
+      active instanceof HTMLInputElement && deps.tools.contains(active)
+        ? { name: active.name, at: active.selectionStart }
+        : undefined;
+    const form = renderNode(researchForm(open.lists, open.stops, open.state, open.mode), document);
+    form.addEventListener('click', (event) => {
+      clicked(form, event);
+    });
+    form.addEventListener('input', (event) => {
+      typed(event.target);
+    });
+    form.addEventListener('change', (event) => {
+      const target = event.target;
+      if (open && target instanceof HTMLInputElement && target.name === 'version') {
+        open.state.version = target.value;
+      }
+    });
+    deps.tools.replaceChildren(form);
+    if (focus !== undefined) form.querySelector<HTMLElement>(focus)?.focus();
+    else if (kept !== undefined) {
+      const again = form.querySelector<HTMLInputElement>(`input[name="${kept.name}"]`);
+      again?.focus();
+      if (again && kept.at !== null) again.setSelectionRange(kept.at, kept.at);
+    }
+  };
+
+  /**
+   * What is typed: the search (the task list under it drawn anew, the field itself kept: review
+   * F3, an IME's word or a phone's keyboard is not cut), the typed task and its reward (kept).
+   */
+  const typed = (target: EventTarget | null): void => {
+    if (!open || !(target instanceof HTMLInputElement)) return;
+    if (target.name === 'query') {
+      open.state.query = target.value;
+      const list = deps.tools.querySelector('.task-list');
+      if (list && open.lists) {
+        const fresh = renderNode(taskList(open.lists, open.state), document);
+        list.replaceChildren(...fresh.childNodes);
+      }
+    } else if (target.name === 'typedTask' && open.state.typing) {
+      open.state.typing.task = target.value;
+    } else if (target.name === 'typedReward' && open.state.typing) {
+      open.state.typing.reward = target.value;
+    }
+  };
+
+  const setAdding = (on: boolean): void => {
+    if (!open || (open.state.adding === true) === on) return;
+    open.state.adding = on;
+    deps.picking(on);
+  };
+
+  const close = (): void => {
+    const was = open;
+    if (!was) return;
+    setAdding(false);
+    open = undefined;
+    deps.tools.replaceChildren(renderNode(newTrainButton(), document));
+    hold.release(was.claim);
+  };
+
+  const after = async (done: ResearchAfter): Promise<void> => {
+    switch (done.kind) {
+      case 'missing': {
+        const form = deps.tools.firstElementChild;
+        if (form instanceof HTMLElement) sayUnder(form, done.text);
+        return;
+      }
+      case 'gone':
+        say(done.text);
+        await deps.done(undefined);
+        return;
+      case 'close': {
+        const first = open?.stops[0]?.key;
+        close();
+        say(done.text);
+        await deps.done(first);
+        return;
+      }
+      case 'draw': {
+        if (!open) return;
+        open.lists = done.options;
+        // The map picks stops as the state drawn says (a refusal ends "Add stops…").
+        setAdding(done.state.adding === true);
+        open.state = done.state;
+        if (done.mode) open.mode = done.mode;
+        // The question takes the focus on its first box, read with its words; else Report.
+        draw(
+          open.state.asks === undefined
+            ? 'button[data-submit]'
+            : 'input[name="replacing"], button[data-submit]',
+        );
+        const form = deps.tools.firstElementChild;
+        if (form instanceof HTMLElement && open.state.asks === undefined) {
+          sayUnder(form, done.text);
+        }
+      }
+    }
+  };
+
+  const clicked = (form: HTMLElement, event: Event): void => {
+    const target = event.target instanceof Element ? event.target.closest('button') : null;
+    if (!(target instanceof HTMLButtonElement) || !open) return;
+    const { cancel, task, typing, addStops, removeStop, submit } = target.dataset;
+    if (cancel !== undefined) {
+      // Cancel sends nothing, the contradiction question's too (R7).
+      close();
+    } else if (task !== undefined) {
+      open.state.task = task;
+      delete open.state.version;
+      draw(`button[data-task="${CSS.escape(task)}"]`);
+    } else if (typing !== undefined) {
+      if (typing === 'start') open.state.typing = { task: '', reward: '' };
+      else delete open.state.typing;
+      draw(typing === 'start' ? 'input[name="typedTask"]' : 'input[name="query"]');
+    } else if (addStops !== undefined) {
+      setAdding(addStops === 'start');
+      draw('button[data-add-stops]');
+    } else if (removeStop !== undefined) {
+      open.stops = open.stops.filter((stop) => stop.key !== removeStop);
+      draw('button[data-add-stops], button[data-submit]');
+    } else if (submit === 'research') {
+      const replacing =
+        open.state.asks === undefined
+          ? undefined
+          : [...form.querySelectorAll<HTMLInputElement>('input[name="replacing"]:checked')].map(
+              (box) => Number(box.value),
+            );
+      const now = open;
+      void submitResearch(
+        now.lists,
+        now.stops,
+        now.state,
+        now.mode,
+        {
+          send: (body) => send(form, body),
+          options,
+          holds: () => open === now && hold.holds(now.claim),
+        },
+        replacing,
+      ).then(after);
+    }
+  };
+
+  /** Opens the form in the side pane: its claim, and the task list asked for. */
+  const openForm = (stops: PickedStop[], mode: ResearchMode, focus: string | undefined): void => {
+    const claim = hold.take(false, true);
+    if (!claim) {
+      say(FORM_OPEN);
+      return;
+    }
+    deps.closePopup();
+    const state: ResearchFormState = { query: '' };
+    open = { claim, stops, state, mode, lists: undefined };
+    if (mode.kind === 'more') setAdding(true);
+    draw(focus ?? '[data-form-heading]');
+    const now = open;
+    void options().then(
+      (lists) => {
+        if (open !== now) return;
+        now.lists = lists;
+        draw(mode.kind === 'new' && focus !== undefined ? 'input[name="query"]' : undefined);
+      },
+      () => {
+        if (open !== now) return;
+        const form = deps.tools.firstElementChild;
+        if (form instanceof HTMLElement) sayUnder(form, NO_OPTIONS);
+        else say(NO_OPTIONS);
+      },
+    );
+  };
+
+  return {
+    /** "Report research here" in a stop's popup: the form with the stop. */
+    researchClicked(button: HTMLButtonElement): void {
+      const key = button.dataset.reportResearch;
+      if (key === undefined) return;
+      openForm([{ key, name: button.dataset.stopName ?? key }], { kind: 'new' }, undefined);
+    },
+
+    /** The Report button's step 3 at a stop: the form with the stop, its search focused. */
+    researchAt(stop: PickedStop): void {
+      openForm([stop], { kind: 'new' }, 'input[name="query"]');
+    },
+
+    /** "Same task at more stops…" on a research report: its task, stops picked at once. */
+    sameTaskClicked(report: MapResearch): void {
+      openForm([], { kind: 'more', report }, undefined);
+    },
+
+    /** Whether "Add stops…" picks stops now: they are drawn whatever their layer, and ringed. */
+    adding(): boolean {
+      return open?.state.adding === true;
+    },
+
+    /** A PokéStop tapped while stops are added: added (true: no popup), else nothing. */
+    stopClicked(stop: { id: string; title: string }): boolean {
+      if (!open || open.state.adding !== true) return false;
+      if (!open.stops.some((one) => one.key === stop.id)) {
+        if (open.stops.length >= MAX_STOPS) {
+          const form = deps.tools.firstElementChild;
+          if (form instanceof HTMLElement)
+            sayUnder(form, `A report names ${String(MAX_STOPS)} stops at most.`);
+          return true;
+        }
+        open.stops = [...open.stops, { key: stop.id, name: stop.title }];
+        if (open.stops.length >= MAX_STOPS) setAdding(false);
+      }
+      draw();
+      return true;
+    },
+
+    /** A point of the map tapped while stops are added: no pin, "Tap a PokéStop." (true). */
+    mapClicked(): boolean {
+      if (open?.state.adding !== true) return false;
+      const form = deps.tools.firstElementChild;
+      if (form instanceof HTMLElement) sayUnder(form, TAP_A_STOP);
+      return true;
+    },
+
+    /** Whether the side pane's box holds the form: the list keeps it. */
+    inTools(): boolean {
+      return open !== undefined;
+    },
+  };
+}
+
+export type ResearchUi = ReturnType<typeof researchUi>;
````

### Task 9: 8M-9B task 9: docs and the staging checklist

Prototype commit: `d82b35d20f1157385d3311b2043f5b15965fa19a`

- `web.md`: the 8R-3 section's "The page has none of it yet" replaced; a
  section "Reports at stops on the map's page (plan 8M-9B)": the server's
  part, the two layers and their poll, the markers, the popup and card, Take
  back, the list, the filters, the Report menu and step 2 at stops, the
  Rocket and research forms, "Same task at more stops…", read-only, the
  tests; the layers' row, the header's widths (B7) and the Report menu's order
  where they are described.
- `stop-reports.md`: where `prepare` runs for the map (the lists as they are
  read, a typed task's reward as it is reported), the map's pictures, and
  `backAtWords`.
- `testing.md`: the client tests' cases `stop-report-cases.ts`.
- The staging checklist `docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md`
  (step 0: `npm run web:build`, then start the bot).

**Files:**

```
 docs/architecture/stop-reports.md                       |  6 +++---
 docs/architecture/testing.md                            |  2 +-
 docs/architecture/web.md                                | 30 ++++++++++++++++++++++++------
 docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md | 81 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 109 insertions(+), 10 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff d82b35d20f1157385d3311b2043f5b15965fa19a -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-9B task 9: docs and the staging checklist`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index dd2da39c1a4f69dc04df3d3a13e10973731dd493..04a8edb4a250265a66df8a830d0ce8c9a5de3362 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -59,7 +59,7 @@ Design `docs/superpowers/specs/2026-10-25-region-board-design.md` (its review B1
 
 - `StopPostService` (`src/services/stop-posts.ts`): one post per region channel and local day, made at the first report of the day in the region, in the region's board: the thread of `Region.summaryMessageId`, read anew at each draw (B2), its messages sent with `SuppressNotifications` (`SendOptions.silent`, B13: a follower of the board is not notified of each; edits never notify). No pin: every message the bot sends lands below the ones before (a member's message between them is deleted at once, plan 8R-9F; a moderator's kept message stays where it is); the summary stays the post's first message. Drawn anew `POST_DELAY_MS` (3 s) after the last change (`Gathered`, coalesced) in one queue per channel (`KeyedLock`), the midnight delete included; reads are done before any Discord call. A change of the reports is drawn only in the regions it touched: `StopReportListener.changed(serverId, stops)` names the stops of the reports made or taken back (a replaced report's too), and only the region channels whose outlines hold one of them are queued; the period changes and the research events draw every post. A message whose payload equals the one last drawn there (a hash per message id, in memory: the first draw after a restart edits) is not edited. **Reactions** (plan 8R-9G): each edit removes the reactions on the edited message (`EditOptions.clearReactions`; a removal refused or failed never fails the edit and is said once per board, `could not remove the reactions on a message in the board`, which the sweep says in the same words once more), and the board's sweep at start and on reconnect removes them on every message of the bot there (`parties-and-posts.md`, "The region's board"): a reaction lasts until the message's next edit or the next sweep. Only the board's messages: the party posts in the same forum keep their reactions, since a forum's permissions cannot tell the board from them. An edit that fails is thrown (logged, the post stands, the next change draws it again); a message is deleted and sent anew only when it is gone or changes kind (components v2 to plain text, or back, as the board's `postAccess` changes), and, its kind not known in the first draw after a restart, when Discord refuses its edit for what it holds (`isRefusedBody`); any other failure keeps it there too. **A message sent anew in its place takes every message after it along** (B5): messages i to n are deleted and sent again below it, so the order stays (a moderator's message kept between the bot's messages stays above any re-sent stops: accepted, plan 8R-9F, B11). **Where the board is not** (B10: the region has no forum or no summary post): nothing is drawn, the summary's counts and the links are forgotten, and `the region has no board post` is said once per channel until it draws again; no fallback to the text channel. The next turn-over (the period timer, the research events, the catch-up) draws such a region again (review P6, its server by `serverOf`); a send into a board that is gone tells the summary (`changed`), whose next edit makes the board anew (review P2). **Where the bot may not write in it** (B6, `PartyGateway.postAccess`, the post fetched (review P3), on the post's forum: View Channel and Send Messages in Threads, and Manage Threads only where a moderator locked the board, which writing in a locked post takes, Discord's 160005; plan 8R-9F, B5): nothing is drawn, said once (`the bot may not write in the board post`); without Embed Links the post is plain text (`stopPostText`). **A board replaced or taken over** (B2: `replaceSummary` deletes the whole thread, `takeOverSummary` may record another post): the `StopPost` row keeps the board it was drawn in (`threadId`, migration 031); a draw in another board deletes the old board's messages first (review P5: a post taken over must not keep a second copy; a thread gone is fine), never opening it (review R2: an archived old board refuses with 50083, which is logged and accepted) and sends every message anew there, and `PartyService` tells `boardChanged(channelId)` when it makes or takes over a summary, which draws the region's post (its server by the kept post, else by the region's row, `guilds.snowflakeOf`). The gateway opens an archived board before it sends or deletes in it where asked (B3: Discord refuses either in an archived locked post, 50083; an edit opened it already; review P4: `SendOptions.reopen` and `DeleteOptions.reopen`, asked only by the posts of the stops, every other send and delete as before), and the summary checks the board's pin and lock after each draw of the stops (`changed` → `PartyService.summaryChanged(region, true)`, B4). **The first switch** (B11): a row without `threadId` is a post the bot before plan 8R-9 pinned in the region's channel, read as messages of that channel still to delete (`fromStorage`, `StopPostRecord.leftover`, column `leftoverIds` of migration 031); the first draw unpins and deletes them there (`clear`), `start` the older days' rows too (`remove`), and today's post is drawn in the board. **A delete that fails** (review P1, the network away) is never forgotten: a message of the region's channel stays in `leftover` of the day's row (with the board post, or in a row of its own while none is drawn) and is tried again at each draw; a post of an ended day whose delete fails keeps its row with what is left (`leftovers` in memory), deleted again at the channel's next draw (review W2, in its queue, before anything else of the draw), at the next turn-over and, after a restart, at `start`; a message gone counts as deleted, and a delete Discord refuses for good (50001, 50013, review R1) is said once per channel and forgotten (DMs and answers sent earlier that day point at deleted messages: accepted). A channel with no post in memory reads its kept rows from storage before it draws (a report before `start` has read them, or after that failed, edits the post a restart left; a failed read draws nothing), and `start` keeps what such a draw made, and deletes a post older than its channel's newest (one whose delete failed at its midnight). A timer at `nextPeriodChange` draws every kept post anew (`draw` deletes the post of an ended day and makes today's where reports stand); `start()` does the same for what a restart left (`StopPost` keeps the ids, each message's saved as soon as it is sent), and sets the timer also when the kept posts cannot be read; a change of the research events (`onResearchChange`) draws the posts anew and sets the timer again (those redraws in a set of their own, which `flush` and `close` wait for and `messageOf` does not: it waits only for its own channel). It is kept, saying "Nothing reported right now.", when every report is taken back. None in rehearsal mode. **Links** (B1): `messageOf` (once what waits is drawn) and `linkOf` (as last drawn) give a `PostLink`, the message that holds the subject or else the post's first message (review P9: a task only counted), `{ channelId, messageId }` with the board's thread as the channel, and every caller links it so (`https://discord.com/channels/<server>/<thread>/<message>`): the research and Rocket DMs' "Go to post", "Already reported" (`postLinkOf`), the map's links (`stop-routes.ts`) and the lines of the region channels. The region's summary links the post (plan 8X-G, `parties-and-posts.md`): `summaryOf(channelId)` gives the server, the board's thread, the first message of the stops and how many tasks and hideouts it shows as last drawn (the hideouts as the post counts them, one per leader or decoy whatever its stops, review r0 C2), and under an event's window how many tasks of the day's research wait below it and when they come back (`waiting`, plan 8R-6: the summary says `· 13 tasks back at <t:…:t>`), undefined without a post of today drawn since the start; `changed(channelId)` (`StopPostServiceOptions`, `app.ts`: `PartyService.summaryChanged(region, true)`) is told after each draw and each delete, so the summary is drawn anew after every draw of the post, edited where the counts changed, and its pin checked (and a board never opened, opened once: `parties-and-posts.md`). A member kept out of the region's forum (`memberAccess`) no longer sees the stops, though they see the text channel's lines (Matt's answer: accepted).
 - **The lines of the region channels** (B9; `StopLineService`, `src/services/stop-lines.ts`, `src/render/stop-lines.ts`): the first time in a local day that a research task (any version of it, "one of" too; research waiting under an event's window counts, its task placed in the post) or a leader or Giovanni is reported at a stop in a region, a line in the region's channel links the board's message that holds it: `Research: **Catch 25 Pokémon** (Rare Candy) → <link>` (its text and its reward as first reported, `one of …` for a "one of", nothing for a typed task without one; `researchLine`) and `Team GO Rocket: **Arlo** at **Yellow Mural** → <link>` (`hideoutLine`); names through `plain()`. The line is claimed first by its row (`StopLine`, migration 031, unique `(serverId, regionChannelId, day, lineKey)`; keys `research:<task key>` and `rocket:<leader:… | giovanni>`; `StopLineRepository` and its twin `MemoryStopLines`, `stopLineCases`), then the board's draw is waited for (`messageOf`), then it is sent and its message kept; where the region has no board recorded (or the send fails) nothing is sent and the claim is let go, so a later report there tries again; where it has one but the board's message is not found (a moderator deleted the board, which is being made anew: plan 8R-9F, M2, B9) the claim is kept and the line waits for that channel's next full draw (`StopPostService.onDrawn`, never told of a draw whose send failed), tried once more then and let go if still nothing, or at the day's end, or at shutdown (`close` lets every waiting claim go, review F4, so that a report after a restart that day can claim it; a draw told after the close sends nothing). A line whose day ended while its board message was looked for (midnight's sweep may have forgotten its claim, and the link would be today's post) is not sent and its claim is let go (review W1); a line sent while a sweep forgot its claim is kept all the same (`StopLineStorage.sent` is an upsert), so a sweep deletes it. Later reports of the same task or leader that day post nothing, and the line is never edited; a task whose only report is taken back keeps its line (Matt's answer). No line for a decoy, a grunt or a narrowing (the same task's key). It hears research news (`reported`) and hideouts (`StopReportListener.hideoutReported`, told by `reportRocket` for every hideout reported, the same one again too, not for one put back). At each local midnight (`nextLocalMidnight`, Luxon) the lines of the days before are deleted, and at `start` those a restart left; a line whose delete fails keeps its row for the next sweep, unless Discord refused it for good (50001, 50013: said once and forgotten, review R1) (review P1: midnight, start, and the catch-up on reconnect, whose job `stop lines` runs `sweep`; and, where a line of a day that ended was kept, a delete failed or a line was sent as its day ended, before the next line is sent, review W2, rather than by a timer of its own). Two losses are accepted: a process that stops between the claim and the send leaves a claimed row without a message, so that task or leader gets no line that day; a line sent whose message id could not be stored is not deleted at midnight. None in rehearsal mode (nor where the region has no board); at shutdown it is closed before the posts of the stops, in their step (`stopReportSteps`).
-- `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task (`grouped`, `stop-posts.ts`), an event's tasks first (plan 8R-8: `isEventCategory` of the report's category; a typed task never is one), then the rest, each part most stops first and then by the first report, so a busy day cuts an event's task last (plan 8R-5, R9: one block per task, counted as tasks; a task of one version with its rewards beside it, of several a line of each version's rewards before its stops (`reward not said` for a typed task's version without its reward, review R1), the rewards' versions first and "one of" last, a picture per reward line (plan 8R-6, "Pictures at the stops"); the versions as the decision sees them (`grouped` by `StopReportService.versionOf`, review R2: a report of before plan 8R-5 of a task of one reward under that reward's version, R10; "one of" before and now one group), each in the words of its newest report; the task's key and every version placed, so a DM of any version links the block), each with its rewards and up to 15 stops (`- **[Stop](<maps>)** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"; since plan 8R-7, E1, every stop's name is the link to its place on Google Maps, `stopMapLine`, `src/render/research.ts`: `stopMapsUrl` of `raid-post.ts`, the address `gymMapsUrl` makes with the coordinates rounded to five decimals, in angle brackets so that it unfurls no preview, the name cut to 80 before it is made plain, always without a working address (`plainNoLinks`: a stop named `https://…` would show one address and link another), and its brackets escaped by `linkTextOf`; a task's, a version's, a hideout's and the day's research under a window alike, the plain text too; `fill` counts each line whole with its link, so a link is never cut and a busy day shows fewer stops a block by the same rules, `STOPS_SHOWN` unchanged; Matt's choice, R6: the party posts' Where keeps its name plain bold with a `[Map]` word, and so does a grunt's message); within 40 components and `TEXT_BUDGET` a message, spilling into further messages, ten at most (`MAX_POST_MESSAGES`: three before plan 8R-9F; Matt, a sanity limit, so a busy day spills rather than cuts and a hideout is never what is lost; a re-send of messages i to n is then up to nine deletes and nine sends inside the channel's queue, B10), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it); under an intra-day window (or a big event's daily hours) the day's research waiting stays below the window's tasks (plan 8R-6, Matt: `StopPostView.waiting.tasks`, under `### Back at <t:…:t>, after <event>`, in the same blocks without pictures, after the hideouts, so that a busy event day counts it away before any hideout (Matt, 2026-10-24); the line "The day's research comes back at" is gone; it counts in the layout and the busy day as any block, and the placement keeps the window's message for a key both have). Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link; `linkOf(channelId, subjectKey)` (plan 8R-3) gives it as last drawn, else the post's first message, and draws nothing: the map asks on every poll, where `messageOf` would edit the post each time. The day's hideouts (plan 8R-2) go after the research (before the day's research waiting under a window) under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (its picture by the rule beside it, plan 8R-6: a leader's or Giovanni's portrait) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
+- `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task (`grouped`, `stop-posts.ts`), an event's tasks first (plan 8R-8: `isEventCategory` of the report's category; a typed task never is one), then the rest, each part most stops first and then by the first report, so a busy day cuts an event's task last (plan 8R-5, R9: one block per task, counted as tasks; a task of one version with its rewards beside it, of several a line of each version's rewards before its stops (`reward not said` for a typed task's version without its reward, review R1), the rewards' versions first and "one of" last, a picture per reward line (plan 8R-6, "Pictures at the stops"); the versions as the decision sees them (`grouped` by `StopReportService.versionOf`, review R2: a report of before plan 8R-5 of a task of one reward under that reward's version, R10; "one of" before and now one group), each in the words of its newest report; the task's key and every version placed, so a DM of any version links the block), each with its rewards and up to 15 stops (`- **[Stop](<maps>)** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"; since plan 8R-7, E1, every stop's name is the link to its place on Google Maps, `stopMapLine`, `src/render/research.ts`: `stopMapsUrl` of `raid-post.ts`, the address `gymMapsUrl` makes with the coordinates rounded to five decimals, in angle brackets so that it unfurls no preview, the name cut to 80 before it is made plain, always without a working address (`plainNoLinks`: a stop named `https://…` would show one address and link another), and its brackets escaped by `linkTextOf`; a task's, a version's, a hideout's and the day's research under a window alike, the plain text too; `fill` counts each line whole with its link, so a link is never cut and a busy day shows fewer stops a block by the same rules, `STOPS_SHOWN` unchanged; Matt's choice, R6: the party posts' Where keeps its name plain bold with a `[Map]` word, and so does a grunt's message); within 40 components and `TEXT_BUDGET` a message, spilling into further messages, ten at most (`MAX_POST_MESSAGES`: three before plan 8R-9F; Matt, a sanity limit, so a busy day spills rather than cuts and a hideout is never what is lost; a re-send of messages i to n is then up to nine deletes and nine sends inside the channel's queue, B10), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it); under an intra-day window (or a big event's daily hours) the day's research waiting stays below the window's tasks (plan 8R-6, Matt: `StopPostView.waiting.tasks`, under `### Back at <t:…:t>, after <event>`, worded by `backAtWords` of `src/domain/stops/back-at.ts`, which imports nothing and words the map's research group the same, plan 8M-9B, B5, in the same blocks without pictures, after the hideouts, so that a busy event day counts it away before any hideout (Matt, 2026-10-24); the line "The day's research comes back at" is gone; it counts in the layout and the busy day as any block, and the placement keeps the window's message for a key both have). Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link; `linkOf(channelId, subjectKey)` (plan 8R-3) gives it as last drawn, else the post's first message, and draws nothing: the map asks on every poll, where `messageOf` would edit the post each time. The day's hideouts (plan 8R-2) go after the research (before the day's research waiting under a window) under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (its picture by the rule beside it, plan 8R-6: a leader's or Giovanni's portrait) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
 
 ## Wants and DMs
 
@@ -73,11 +73,11 @@ Design `docs/superpowers/specs/2026-10-23-stop-pictures-design.md` and its mocku
 
 - **The rule** (`src/domain/stops/pictures.ts`, pure): `researchPicture(rewards)` for a reward line of the post, a research DM and a confirmation: one reward its own picture (a Pokémon `pokemon`, an item or Mega Energy `item`); two or more ("one of", or a report of before plan 8R-5 holding every reward of its task) the game's encounter picture `ENCOUNTER_PICTURE` (PokeMiners' `Images/Quests/QuestPokemonReward.png`, pinned to their commit `c2a686eb`, byte-identical to master's on 2026-10-24, so it cannot change under the bot) while any is an encounter, several items alone none; none without a reward or a picture. `rocketPicture(key, catches)`: a leader or Giovanni the portrait (`LEADER_PORTRAITS`, `GIOVANNI_PORTRAIT` in `src/domain/rocket/portraits.ts`, Leek Duck's, square already), a grunt or the decoy of one possible catch that Pokémon, of two or more the encounter picture, of none known none. A `StopPicture` is the source address and its kind; the encounter picture and the portraits count as Pokémon. `isPictureSource(url)` is the allowlist a fetch takes: https of `cdn.leekduck.com` as `leekDuckPicture` takes it, and the encounter picture's address. Renderers take a `PictureLookup` (source to address, or none where the source is gone: the renderer then shows no picture, rule 6; `AS_FED` the source itself) and stay pure.
 - **`StopPictures`** (`src/services/stop-pictures.ts`, made in `app.ts`, told `serving()` beside the eggs once the web server listens (`picturesServed`, `src/app-wiring.ts`); at shutdown closed after the spawn reports and before the grunts' messages and the posts of the stops, so that neither waits for a fetch (`stopReportSteps`, the same file: one second, the grunts' four, the posts' five); the services take it as `PictureMaker`, its `prepare` and `url`): `prepare(sources)` fetches what is missing or older than `RENEW_MS` (only `isPictureSource`, `redirect: 'error'`, Pine's User-Agent, ten seconds, `MAX_PICTURE_BYTES` 512 KB read with `readLimitedBytes`, an `image/*` answer, sharp's `limitInputPixels` `MAX_PICTURE_PIXELS`, then refused where its longest side passes `MAX_PICTURE_SIDE` (1024) or it is no png, jpeg, webp or gif, SVG among them; four at once across every `prepare`, one fetch per source whoever asks). It waits only for the missing pictures, and for `PREPARE_DEADLINE_MS` (2.5 seconds) at most, so a slow Leek Duck holds up no post, DM or grunt's message for long; an old picture is served while it is fetched again; the fetches still running go on in the background (`idle()` waits for them, `close()` aborts them, records none as failed, and every `prepare` after it returns at once), and what lands late is named at the next redraw (nothing is redrawn on landing). It pads it to a square with transparent edges, centred and unscaled, as `scripts/eggs/make-eggs.ts` made the eggs, and keeps it in `var/pictures/<key>.png` (`PICTURE_FOLDER`; `key` the first 32 hex digits of the SHA-256 of the source address, never the address; written through a temporary file and `moveIntoPlace`, shared with `ImageCache`, its file's time when it was made). At most `MAX_PICTURES` (2,000) are kept, in a `BoundedMap`: a picture that lands in a full index makes room at once, before anything is awaited, by the oldest made that is not being fetched again (the oldest of all where every one is), whose file is deleted after; `start()` reads the index back from the folder (each file's time and the SHA-256 of what it holds, the oldest beyond the bound deleted, leftover `.tmp` files removed), so a restart fetches nothing again. A picture older than `RENEW_MS` (7 days) is fetched again by the next `prepare` (the old one served meanwhile, and kept where the fetch fails for any reason but a gone source); a failed fetch is not tried again for `FAILED_AGAIN_MS` (30 minutes), logged as "could not make a picture square" with the source and the reason, and remembered with whether the source is gone (it answered 404 or 410, `PictureGone`). `url(source)` gives `<publicUrl>/pictures/<key>.png?v=<8 hex of its SHA-256>` once the web server listens at a public address (`settings.web`, not this machine's: `isLocalAddress`); none (`undefined`) for a source that is gone, also over a picture kept from before, until a later fetch of it works, so every renderer leaves the picture out (rule 6; a portrait that answers 404 gives a hideout without one); and the source itself before `serving()` and without a public address (nothing is fetched then), and while a picture is not ready or its fetch failed for another reason: the feed's cropped icon, PokeMiners' raw address for the encounter picture. No attachments. `read(key)` is the route's: only what it made.
-- **Where `prepare` runs:** `StopPostService.draw` before it lays a post out (in the channel's queue, after `POST_DELAY_MS`; not for the plain text post); the notifier's research and Rocket announcements in `gather`, once somebody is to be told; `GruntMessageService` in a report's turn before it posts or edits its messages. A post drawn before the pictures are ready (a fetch past the deadline, the start's catch-up) names the feeds' addresses until its next redraw.
+- **Where `prepare` runs:** `StopPostService.draw` before it lays a post out (in the channel's queue, after `POST_DELAY_MS`; not for the plain text post); the notifier's research and Rocket announcements in `gather`, once somebody is to be told; `GruntMessageService` in a report's turn before it posts or edits its messages. A post drawn before the pictures are ready (a fetch past the deadline, the start's catch-up) names the feeds' addresses until its next redraw. For the map (plan 8M-9B, B1), never awaited and never per request: `ResearchTaskService` and `RocketLineupService` as they take a list (`use`, at the start's load and each read; their `pictures` option, `PictureMaking`) ask for every picture it can show (`taskPictureSources`: each reward's and the encounter picture; `lineupPictureSources`: each catch's, both lineups' of a type, the portraits and the encounter picture), some 400 against `MAX_PICTURES`; a typed task's reward, on no list, as it is reported (`reportPictures`, a listener of the stop reports in `src/app-wiring.ts`). A picture asked for again is passed over until it is `RENEW_MS` old.
 - **The post of the stops** (`stopPostMessages(view, picture)`; `postPictures(view, picture)` the sources `prepare` gets, read off the layout `stopPostMessages` chooses, with the same lookup as the draw (`StopPostService` passes `StopPictures.url` to both, and the choice of a busy day below is made with it), so only those it shows, a gone source listed too so that it is asked for again once its failure is old while the next line's picture takes its place: none past the six of a task, none of a version with no stop shown or of a task counted by "…and N more", none of the day's research under a window, on a busy day only those of the step taken): each version of a task a section with its thumbnail by the rule, the task's text a text display above them; a task of one version one block as before (one section); a hideout one section after the heading `### Team GO Rocket hideouts`, a text display of its own. At most `PICTURES_PER_TASK` (6) pieces of a block carry a picture, Pokémon first, then items, in the list's order (a picture the lookup names none for takes no place among the six, and its piece is text); pieces without one in a row share one text display (the task's text, the lines past the six, `reward not said`, the "…and N more stops" line); a version with no stop shown has no piece and no picture. **A busy day** is decided for the whole post, and no reported task is cut for pictures (Matt, 2026-10-24): the post takes the first layout of `PICTURE_STEPS` that places every task and hideout in its `MAX_POST_MESSAGES`, however many of them it fills: every picture; without the pictures of items and Mega Energy; one picture per task or hideout (its first pictured line by the order of the six; items stay out, so each step shows no more than the one before); no picture. Only where even the layout without pictures counts blocks away does the post spill and count away as before, drawn with the first step that places the most blocks (review W5 of 8R-7: pictures cost components, not text, so a day limited by text keeps every picture while its tasks spill; a day limited by components is drawn without pictures). The same view and lookup always give the same layout. The day's research under a window (above) has no pictures.
 - **DMs:** `researchDmBrief(view, picture)` and `researchConfirmBrief(view, picture)` by `researchPicture` (a "one of" DM the encounter picture, also with the member's reward named first; a confirmation the Pokémon); `rocketDmBrief({ key, … }, picture)` by `rocketPicture`; a DM whose picture is gone has none. DMs sent stay as they are when a grunt is refined.
 - **A grunt's message:** one picture beside its heading (`GruntView.picture`, worked out in `GruntMessageService` from the report as it is, so a grunt refined in place takes the picture of its new catches); the stop's photo stays beside Where; a message sent again without pictures has neither.
-- **The map** follows the post: a hideout's `picture` is `rocketPicture`'s source as `StopPictures.url` names it (`stop-report-view.ts`, `StopReportViewInput.picture`: the square picture Pine serves, none where it is gone), only from `pictureOrigins`, which names Pine's own origin and the encounter picture's (`web.md`).
+- **The map** follows the post: a hideout's `picture` is `rocketPicture`'s source as `StopPictures.url` names it (`stop-report-view.ts`, `StopReportViewInput.picture`: the square picture Pine serves, none where it is gone), only from `pictureOrigins`, which names Pine's own origin and the encounter picture's (`web.md`). Since plan 8M-9B (B2) research has its reward line's picture (`researchPicture`) and a grunt its message's (`rocketPicture`) as `picture` too, and every reward's and catch's `image` (the reports' and the pick lists', `stop-options.ts`) is named through the same lookup.
 
 ## The 8R staging's small fixes (plan 8R-6)
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 87d931435ebe528337f771647e91ee68163d94e6..8fcd125051e82bc673d5949506db054e31af68a8 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -91,7 +91,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Reports at stops on the map (plan 8R-3): `stopReportingWith(rows)` (`test/support/stop-reporting.ts`) gives the party services of `partyServiceWith` (`made`: its fake gateway holds the forums, who is barred, and the grunts' messages), the kept stops of `STOP_ROWS` (PokéStops 1 and 2 in West, 3 in East, a Power Spot) or `rows` (`wayspots`, the directory: `setPineStops` for stops of Pine's own), and a context with `StopReportService` over `MemoryStopReports` (`store`), `GruntMessageService` (`grunts`, over `gruntStore`; its timers never run) and `RocketService`; fake `Date` to `STOP_NOON` and set the web server's `clock.now` to it. `stopWebWith(ctx, { channelName, posts, grunts })` gives the web server what `/research` and `/rocket` read and call; pass it as `stops` beside `partyWebWith(made.made, …)` (whose `forums` the shared `PartyViewers` asks); `posts` is a `linkOf` of the test's (none by default), `grunts` the context's `grunts` for the grunts' links. Without it every use of the stops' deps throws. A command's window is filled under `researchWindow(settings)` or `rocketWindow(settings)` with `researchThrottle` / `rocketThrottle` (the varied keys the router counts them under), a take-back's under `RESEARCH_REMOVE` / `ROCKET_REMOVE` with `MEMBER_WRITE_THROTTLE`. A hideout reported between the route's look and the report: `vi.spyOn(made.ctx.stopReports, 'rocketAt').mockResolvedValueOnce(undefined)` (`stop-report-post.test.ts`).
 - Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it, a stop dragged, `StopDrag` and `dropPosition` over rows of the test's; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A train's dialogs as forms (plan 8M-8C): their routes in `train-move.test.ts` (Move…), `train-manage.test.ts` and `train-split.test.ts` (a split as in `train-split.test.ts` of the commands: groups opened through `made.attendance`), the functions shared with Discord in `src/commands/trains/train-changes.test.ts`, the forms' pure parts in `src/web/client/train-post-forms.test.ts`, their addresses in `post-forms-ui.isolated.test.ts`. A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode: its edits, a stop dragged and dropped, a Power Spot tapped) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events with a pointer's `clientY`, the rows' boxes a test lays out (`box`, `getBoundingClientRect`), the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the right click on a raid's picture or dot runs the real Leaflet in `party-layer-contextmenu.isolated.test.ts` (plan 8W-3): globals stubbed in `vi.hoisted` with just enough of a browser for Leaflet to load (no DOM library), a map made of `L.Map.prototype` with its container, a pane, the marker's element made its target by `addInteractiveTarget`, the pointer's place given by stubbing the map's conversions, and `_fireDOMEvent` as Leaflet calls it; a marker that listens is the control that shows the test can fail. `showParties` drawing a list runs in `party-layer-draw.isolated.test.ts` (plan 8M-9A, reviews B1 to B9): Leaflet mocked down to layers and groups that say whether they are on the map, markers whose popup opens only there and tells the map before the layer (as Leaflet's), the circles drawn with their options; a page of `PageElement`s (attributes and `dataset`, the tree, simple selectors, bubbling clicks, the focus) with the document's own listeners (Escape, `visibilitychange`, which a test fires to have the list asked for again and drawn, `poll`); `fetch` answering `/api/parties` with the test's list; the theme, the list of what is on and the phone card stubbed (`fake.card`), and the hooks the party layer hands `raidUi` and `maxUi` taken as they are made (their `done`, `pickSpot`); route mode a stub of `trainUi`'s `spotClicked` (`fake.route`). It waits for each draw through `afterDraw`. The Power Spots' and PokéStops' dots (`showPlaces`) run over a Leaflet of dots and popups in `places-ui.isolated.test.ts`. The rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
 - The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a color written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define, and checks that its light and dark sets name the same values and that every page's stylesheet imports it (plan 8M-7); `theme.test.ts` reads a theme through a fake reader (`readTheme`) and a change of scheme through a fake `matchMedia` (`ThemeWatch`). It lives outside `src/web/client/` because the client's type check has no Node.
-- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
+- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand; the reports at stops' popups, list, filters and forms over the cases of `src/web/client/stop-report-cases.ts`, plan 8M-9B, which the page never imports); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
 
 ## Operations
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index d1fb9fa87265ab2241797afea96d2c4b32ea2baf..24d66bf1790d44ce79a55799b7eb4c88f2c73461 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -1,6 +1,6 @@
 # The web server and the map
 
-The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, starting, arranging and moving trains on the map, making and changing meetups on the map, max battles on the map (the server side, plan 8X-5; the page, plan 8M-9A), the Report button (plan 8M-9A), reports at stops on the map (the server side, plan 8R-3), the region editor, the Content Security Policy, and the rules for adding a route. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
+The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, starting, arranging and moving trains on the map, making and changing meetups on the map, max battles on the map (the server side, plan 8X-5; the page, plan 8M-9A), the Report button (plan 8M-9A), reports at stops on the map (the server side, plan 8R-3; the page, plan 8M-9B), the region editor, the Content Security Policy, and the rules for adding a route. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
 
 ## Settings, secrets, start and stop
 
@@ -47,7 +47,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **The start view** (`startView`, the first rule that applies): (1) your location, at street level (`STREET_ZOOM`, 15), when the browser granted it already (`alreadyGranted`, `your-location.ts`: `navigator.permissions.query({ name: 'geolocation' })` is `granted`; the page never asks on load), applied when its first fix comes unless the member moved the map meanwhile (`MemberMoves`: any `movestart` or `zoomstart` after the start view is set, a tap on a line of the list that flies the map among them); (2) the region `/maps` named (`?region=<id>`, `regionOf`), at street level at the middle of its box; it wins over (3) where the member last left the map of this server, at its own zoom (`readLastView` / `writeLastView`: `localStorage` `pine-map-view:<guild>`, written at each `moveend`, read and written in try/catch, `browserStorage`); (4) the whole server (`fitBounds` of its regions, else of its gyms, else "This server has no regions yet."). A location or last view beyond the regions and their margin is passed over. `?region=` is taken out of the address once read (as `?login=`), so that a reload opens where the member left the map.
 - **`/maps` names its region:** used in a region's channel or its forum (`regionChannelOf`), `/maps` puts the region's id in the map's address it shows (`/s/<guild>/map?region=<id>`) and in its login link (`LoginLinks.issue(…, 'map', region)`, `LinkHolder.region`); the link's POST redirects to `/s/<guild>/map?region=<id>` (an id of ours, never of the request); an expired link lands on the whole map (`?login=expired`).
 - **Your location** (`you-ui.ts`, `showWhereYouAre`; words in `your-location.ts`): "Show where I am", a round button with a crosshair (SVG of ours, `currentColor`) at the bottom right, asks the browser only when pressed (`watchPosition`, high accuracy), draws a blue dot (`--you`, edged `--you-edge`, drawn colors of `theme.ts`) with a circle of its accuracy, centers the map on it at street level or closer, and keeps it current while the page is open; pressed again it centers on the dot. Refused or unavailable: one line under the header (`locationRefusal`: "Your browser did not share your location.", "Your location is not available just now.", or "This browser cannot share your location with this page." where there is no geolocation or the page is not a secure context; browsers count `http://localhost` as one), nothing else. `onMove` tells the list each new fix.
-- **Layers** (`layer-registry.ts`, `LayerRegistry`): everything drawn is a layer the member toggles, registered with a name, whether it is on by default, live (a toggle of its own on the desktop) or background (under "More"), a line about it, members only (`membersOnly`) or waiting for data (`waits`), and how many of its things are in view (`setCount`, which the parts that draw it keep current at each `moveend` and draw). One call adds a layer (`register`; field research and Team GO Rocket come so with 8M-9B). The layers of `MAP_LAYERS`: Raids (max battles too since plan 8M-9A: the toggle keeps the name "Raids", since "Raids and max battles" broke the desktop's one row at 768 pixels; its line in the phone's sheet says "Bosses, eggs and max battles", and the list's group is "Raids and max battles"), Trains, Meetups (live, on), Wild spawns (off; it waits for data: no route lists spawns yet, so it is not offered until something calls `setOffered('spawns', true)`), Gyms (off since plan 8M-9A: the Report button's step 2 draws the gyms to pick from whatever the layer says; on until then, the controller's ruling of fix round 1 of 8M-7, while "Report raid" was in a gym's popup alone; a browser that kept the layer on keeps it on), PokéStops, Power Spots (off), Region outlines (on). The choice is kept per browser, one for every server (`localStorage` `pine-map-layers`, `{ id: boolean }`, read and written in try/catch; a value that is no boolean is ignored, a layer the browser kept nothing of takes its default). The controls (`layers-ui.ts`): on the desktop a row in the header (`<nav id="layers">` of the template) with the live layers as labelled toggles (`aria-pressed`, a dot of the layer's color) and the background ones as checkboxes under "More" (a `<details>`); narrower than 768 pixels (`map.css`) a "Layers · n" button (`layersButtonLabel`, n the offered layers on) that opens a bottom sheet listing every offered layer with its line, how many are in view ("4 in view", `inViewWords`) and a switch (a checkbox `role="switch"`), Done and a tap on the scrim closing it; the sheet is a modal dialog for the keyboard (`SheetFocus`: `aria-modal`, the focus moved to its first switch, Tab and Shift+Tab kept inside it (from its last control to its first and back, and from outside it in: 8M-7 review fix 9), Escape closes it, the focus given back to the button), each switch named by its layer (`switchLabel`, `aria-label`), and "More" closes on Escape and on a click outside it (`moreCloses`). Logged out (or not a member), PokéStops and Power Spots are not offered (`offered(spec, member)`); the controls are drawn anew once `/api/me` answers (`refresh`).
+- **Layers** (`layer-registry.ts`, `LayerRegistry`): everything drawn is a layer the member toggles, registered with a name, whether it is on by default, live (a toggle of its own on the desktop) or background (under "More"), a line about it, members only (`membersOnly`) or waiting for data (`waits`), and how many of its things are in view (`setCount`, which the parts that draw it keep current at each `moveend` and draw). One call adds a layer (`register`; field research and Team GO Rocket came so with 8M-9B). The layers of `MAP_LAYERS`: Raids, and since plan 8M-9B Field research and Team GO Rocket after Meetups (below, "Reports at stops on the map's page"); Raids (max battles too since plan 8M-9A: the toggle keeps the name "Raids", since "Raids and max battles" broke the desktop's one row at 768 pixels; its line in the phone's sheet says "Bosses, eggs and max battles", and the list's group is "Raids and max battles"), Trains, Meetups (live, on), Wild spawns (off; it waits for data: no route lists spawns yet, so it is not offered until something calls `setOffered('spawns', true)`), Gyms (off since plan 8M-9A: the Report button's step 2 draws the gyms to pick from whatever the layer says; on until then, the controller's ruling of fix round 1 of 8M-7, while "Report raid" was in a gym's popup alone; a browser that kept the layer on keeps it on), PokéStops, Power Spots (off), Region outlines (on). The choice is kept per browser, one for every server (`localStorage` `pine-map-layers`, `{ id: boolean }`, read and written in try/catch; a value that is no boolean is ignored, a layer the browser kept nothing of takes its default). The controls (`layers-ui.ts`): on the desktop a row in the header (`<nav id="layers">` of the template) with the live layers as labelled toggles (`aria-pressed`, a dot of the layer's color) and the background ones as checkboxes under "More" (a `<details>`); narrower than 1024 pixels (`map.css`; 768 until plan 8M-9B, B7, provisional: five live toggles, "Research" and "Rocket" short in the row with their names in the sheet and the toggle's title, fit from 1024) a "Layers · n" button (`layersButtonLabel`, n the offered layers on) that opens a bottom sheet listing every offered layer with its line, how many are in view ("4 in view", `inViewWords`) and a switch (a checkbox `role="switch"`), Done and a tap on the scrim closing it; the sheet is a modal dialog for the keyboard (`SheetFocus`: `aria-modal`, the focus moved to its first switch, Tab and Shift+Tab kept inside it (from its last control to its first and back, and from outside it in: 8M-7 review fix 9), Escape closes it, the focus given back to the button), each switch named by its layer (`switchLabel`, `aria-label`), and "More" closes on Escape and on a click outside it (`moreCloses`). Logged out (or not a member), PokéStops and Power Spots are not offered (`offered(spec, member)`); the controls are drawn anew once `/api/me` answers (`refresh`).
 - **What each layer draws:** the parties' popups and markers as before (`party-layer.ts`), now in a group per layer (`raids`, `trains`, `meetups`) put on and taken off the map by the registry; the regions' outlines with their labels (`main.ts`; the labels on a pane of their own, `region-labels`, at 350 under the overlay pane of the outlines and of the gyms', stops' and spots' circles and under every marker (round 2), taking no clicks, in 12 px type, so that a name never covers a raid or a gym); the gyms (`gyms-ui.ts`, `showGymDots`) at every zoom, by Pine's grid clustering below zoom 16 (`cluster.ts`, `clustersAt`, `CLUSTER_BELOW`: the places of one 60-pixel cell of a grid fixed on the world are one cluster, drawn as a circle with its count at the middle of its places, `.cluster`, `--cluster`; a tap zooms in on it, at least two zooms and at most to 16; Leaflet.markercluster's last release is from 2020); what is drawn is worked out for the view and half its size round it (`wantedDots`, `DOTS_MARGIN`; keyed `gym:<id>` and `cluster:<cell>:<its gyms>`) and only the difference added or taken off at each move, list or change (`dotsDiff`): the gym whose popup is open is never taken off nor clustered while it is open (fix round 1); which gyms are drawn is `shownGyms` (`gym-dots.ts`): every gym while the Gyms layer is on, or while a gym is to be clicked (route mode, a meetup's place picked, the Report button's step 2 of a raid: `MapRaids.forced`, the gyms drawn anew after each draw of the parties), and while "Find a gym" holds a word those it matches whatever the layer (Enter fits the map to them and opens the one gym's popup once the map rests); the PokéStops and Power Spots of the view (`places-ui.ts`, `showPlaces`) for a member from zoom 16 (`placesWanted`, `PLACES_FROM`) through `/api/stops` and `/api/powerspots`, asked at once when wanted and again 300 ms after the map rests (`PlacesInView` over `StopLoads`: only the last question's answer shown, nothing after they are no longer wanted), small dots of `--stop` and `--power-spot` with the name in a popup (a Power Spot's popup also offers "Report max battle here" since plan 8M-9A, below, "Max battles on the map"; a spot whose battle is drawn is left out, `unoccupied`, drawn again from the last answer as the parties change, `ShownPlaces.redrawn`; while the Report button's step 2 picks them they are drawn whatever the layer, `placesWanted`'s `forced`, `MapRaids.forcedPlaces`), and "more than shown" in one quiet line at the bottom left of the map ("Zoom in to see every PokéStop here.", `MORE_THAN_SHOWN`, `quietLine`). Live things never cluster.
 - **Raid markers** (`raid-marker.ts`, frame B of the mockups): a circle centered on the gym, named for a screen reader by the lead raid's `heading` (the marker's `title`, 8M-7 review fix 9) (`raidMarkerNode`, drawn as an element of ours in a `divIcon`, `raidIcon`, 44 pixels): the post's picture (the boss, or the egg of its tier before it hatches) in a ring of its tier group's color (`MapRaid.tierGroup`, made by the domain's `raidTierGroup` of `src/domain/pogo/raid-tier.ts`: `1`, `3`, `5`, `mega` for Mega, Mega Legendary and Super Mega, `elite`, `shadow` for every shadow raid; `tierColour` names `--tier-<group>`; `raid-marker-tiers.test.ts` holds `theme.css` and `map.css` to every group of `RAID_TIER_GROUPS`), a time badge under it (`badgeFor`: "12m", "1h 05m" while it runs, "hatches 2:40" before the hatch, the posts' time by `clockTime` with AM or PM left out today only, "hatches Wed, Oct 14, 2:00 PM" another day; "egg" or "hatched" where nobody said when, "ended" by `stageAt`), and a green count of those going (`MapAttendance.going`, made by the domain's `goingCount` of `party.ts`: the committed heads of the whole party, coming, here and asked whether done, +1s counted, the lobbies' own rule that `lobbyCount` shares; none at zero). Raids shrink as the map zooms out and are still never grouped (Matt, 2026-10-25; `markerSize`): from zoom 15 the full marker (`--raid-full`, 44 px, with its badge and count), at 14 a smaller circle with the count and no badge (`--raid-middle`, 30 px), at 13 and below a small circle with the boss picture in its ring and no badge or count (`--raid-small`, 20 px); sizes are named values of `theme.css`, read by `theme().sizes` for what Leaflet draws; the tap target is never under 32 pixels (`tapBox`, a clear margin round a small circle), the train's and meetup's rings round a raid scale with its circle (`ringSizes(circle)`), and a zoom into another size draws the parties anew. Nearly over, it is dimmed (`isDimmed`: hatched by the clock, `stageAt` of `src/domain/party/raid-stage.ts`, which `raidStage` reads raids through, and `endsSoon` of `src/domain/time/ending-soon.ts`, the five minutes `/max`'s ending-soon question asks by: one rule). The page keeps badges and dimming current every 15 s from the times on the marker (`data-stage`, `data-hatch`, `data-end`; `markerNow`, by the same rules as at the draw), an egg turning into its time left as it hatches. One source for every fact (Matt, 2026-10-25): what the page shows or decides of a party is computed by the domain code the Discord side uses, sent with the list or imported from a pure module of `src/domain/` that imports nothing (`raid-stage.ts`, `ending-soon.ts`), never a second implementation; only the words are the page's. A gym with a raid shows the raid, not its gym dot, while the Raids layer is on (`hiddenGyms`, `MapRaids.raidGyms`); off, the dot is back. Trains and meetups keep their drawing (rings, a line), restyled; at a gym whose raid circle is drawn, their rings go round it rather than over the boss (`ringSizes`: the train's just outside the 44-pixel circle, radius 26, the meetup's outside the train's, radius 31; the old sizes elsewhere, and again when the Raids layer is off). A gym of several raids is drawn by one lead raid, the first with a picture, else the first (`leadRaid`): picture, ring, badge and count are all that raid's. A raid is named everywhere on the map (its popup, the list, the list of things at one place) in its post's own heading words, `MapRaid.heading` (`raidLook` over the renderer's `headlineParts`: `Level 5 raid against Yveltal`, `Level 5 raid (egg)`, without the shiny mark; the tier's words where the renderer gave none), and its popup reads its stage by the clock (`stageAt`), not the list's `stage`.
 - **Several things at one place** (`shared-place.ts`): when more than one shown thing sits at the same place (the same gym, or within 12 pixels at the current zoom, `sharedPlace`, `SHARED_PIXELS`; a raid marker, a max battle's marker (the raids' layer, plan 8M-9A: at its Power Spot, whose own dot it replaces, or at its pin), a train's ring, a meetup's ring, and a gym's dot tapped where parties share it, `MapRaids.gymTapped`), a tap on any of them opens one popup listing each (`placeListNode`: picture, name, time: the lead raid's `heading` and badge, a battle's `title` and badge, a train's or meetup's `startWords`), and a choice (`data-open`) opens that thing's own popup as before. A layer turned off takes its things out, and the overlap with them. This replaces the tap on a ring's line of the 8S-4 staging: the rings still take clicks on their line alone, but a tap on what they ring lists them.
@@ -169,23 +169,41 @@ Brief `.superpowers/sdd/2026-10-27-phase-8m8c-train-controls/design.md` (its "Af
 
 Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("Reporting"); brief `.superpowers/sdd/2026-10-27-phase-8m9a-report-and-max/design.md` (rulings A1 to A11). Every report goes through the route its command shares (`/raid`'s, `/max`'s, `/wild`'s, `/train`'s, `/meetup`'s, above); the button only leads to their forms. No route was added: the places to pick come from `/api/geo` and `/api/powerspots`.
 
-- **The button** (`report-ui.ts`, `reportUi`; A7): for a member while the map is not read-only (`reportOffered`, at each list; logged out it is never shown): on a wide screen in the header before "Find a gym" (`#report-button` of the template, hidden until the script shows it); narrower than 768 pixels a round button over the map at the bottom right, a Leaflet control above "Show where I am" (`.report-control`; under the phone card while the card is open, and opening Report closes the card), so that the header stays one row (`phone-header.test.ts`), and a line of its own at the top of the phone's list (`.report-line`, shown only while the list is), which shows the map first; the line is put over the list only while Report is offered, not for a form of the side pane left open meanwhile, and the phone's rule shows it only while it is not hidden (review B2, `:not([hidden])`). Up to 1024 pixels the desktop's title says "Pine" and "Find a gym" starts narrower, so that the header's row holds the button (`map.css`).
-- **Step 1, what** (`report-menu.ts`, pure: `REPORT_KINDS`, `reportMenuNode`): a dialog of a button per kind in this order, Raid, Max battle, Wild spawn, Train, Meetup, each with its icon and how its place is picked (`pick`: `gyms`, `spots`, `stops` for 8M-9B's research and Team GO Rocket, `point`, or `form` for none), then Cancel; a list of data, so that 8M-9B adds two entries (A11). A bottom sheet on a phone, a small panel under the button on a wide screen; a modal dialog for the keyboard as the layers' sheet is (`SheetFocus`: the focus on its first choice, Tab kept inside it, Escape, Cancel and the scrim closing it, the focus given back). Opened while another form holds it says "Close the form that is open first."; a step 2 open ends.
+- **The button** (`report-ui.ts`, `reportUi`; A7): for a member while the map is not read-only (`reportOffered`, at each list; logged out it is never shown): on a wide screen in the header before "Find a gym" (`#report-button` of the template, hidden until the script shows it); narrower than 768 pixels a round button over the map at the bottom right, a Leaflet control above "Show where I am" (`.report-control`; under the phone card while the card is open, and opening Report closes the card), so that the header stays one row (`phone-header.test.ts`), and a line of its own at the top of the phone's list (`.report-line`, shown only while the list is), which shows the map first; the line is put over the list only while Report is offered, not for a form of the side pane left open meanwhile, and the phone's rule shows it only while it is not hidden (review B2, `:not([hidden])`). "Find a gym" starts narrower up to 1280 pixels, so that the header's row holds the button (`map.css`; plan 8M-9B, B7: the title whole from 768, the account's name cut at 140 pixels).
+- **Step 1, what** (`report-menu.ts`, pure: `REPORT_KINDS`, `reportMenuNode`): a dialog of a button per kind in this order, Raid, Max battle, Field research, Team GO Rocket (plan 8M-9B), Wild spawn, Train, Meetup, each with its icon and how its place is picked (`pick`: `gyms`, `spots`, `stops` for research and Team GO Rocket (plan 8M-9B), `point`, or `form` for none), then Cancel; a list of data, so that 8M-9B adds two entries (A11). A bottom sheet on a phone, a small panel under the button on a wide screen; a modal dialog for the keyboard as the layers' sheet is (`SheetFocus`: the focus on its first choice, Tab kept inside it, Escape, Cancel and the scrim closing it, the focus given back). Opened while another form holds it says "Close the form that is open first."; a step 2 open ends.
 - **The icons** (`report-icons.ts`; A8; Matt's notes, follow-ups "From Phase 8M-7"): the game's raid icon (`Images/Raids/ic_raid_small.png`) and Poké Ball (`Images/Items/pokeball_sprite.png`) of PokeMiners' pogo_assets at the commit Pine's other game pictures are pinned to (`POGO_ASSETS`), on raw.githubusercontent.com, an origin the page loads already (`pictureOrigins`): the policy is unchanged (`report-icons.test.ts`); Pine's own drawings for the max battle (the game's Dynamax icon is not in pogo_assets: a follow-up for Matt to pick it by hand), the train and the meetup, paths of a 24-pixel square drawn as SVG of ours (`drawShapes`, `currentColor`: `--tier-dynamax`, `--train`, `--meetup`); every icon outlined to read on any background (`drop-shadow` of `--icon-outline`, light and dark). pogo_assets has no license of its own: they are the game's files, used as Pine's other game pictures are.
 - **Step 2, where** (`report-flow.ts`, pure; A4, A5, A6): in the side pane's box, as route mode (an aside claim of the hold, `take(false, true)`; on a phone the pane docked under the map), the kind's heading and icon, what to tap, the nearest five with their distances from your location, else the map's middle (`nearestLines`, `distanceWords`; your location only where the map may go, within the regions and the margin panning stops at, as the start view takes it: review B5, `withinReach`), "← Back" to step 1 and Cancel (Escape outside a field too). The fitting places are drawn whatever the layers say and ringed in `--primary`, the rest of what is drawn dimmed (`report-picking`, `pick-<pick>` on the map's container, `map.css`; the trains' and meetups' rings let taps through meanwhile): a raid's gyms (`MapRaids.forced`), listed from every gym the page has; a max battle's Power Spots (`MapRaids.forcedPlaces`, `placesWanted`'s `forced`): the map flies to the reference point at `PLACES_FROM` and the answer of `/api/powerspots` for that box lists the nearest (`ShownPlaces.onSpots`); a spawn any point. A tap on a place or on its line goes to step 3, step 2's claim let go first so that the form takes its own: a raid's report form opened in the gym's popup (`GymDots.open`, the dot drawn for it whatever the layer; "Report raid" pressed for the member), or the raid standing there where the map draws it (`openRaid`, by the list: the server's answer covers a raid the page cannot see); a max battle's form in the spot's popup (`ShownPlaces.openSpot`), or the battle there, a tap on a battle's marker opening it as it would (while another kind is picked the battle's marker, dimmed, does nothing: review B7; so does a gym's dot or raid marker while a max battle's Power Spots are picked, review B7b); a point tapped while a max battle or a spawn is picked puts a pin there (review R1-1: a marker of ours, `report-pin`; a long press or a right click too, which outside step 2 opens the spawn form, review B6), its line in the box, "Unlisted power spot here" or "Spawn here" with "Report here", opening the form there (`maxAt`, `spawnAt`), so that a double tap only zooms and moves the pin; a pin in no region of the map's outlines says "That point is not in a region of this server." on its line in place of "Report here", and step 2 goes on (review B6: `pressedWhere`, as a long press is checked); a gym, a Power Spot or a PokéStop tapped while a spawn is picked puts the pin at its place (a PokéStop also for a max battle: `PlacesHooks.stopTapped`, a point at the stop, review B6). A train has no step 2: its start form opens with its region prefilled where one region alone holds your location or the map's middle (`regionHolding`); a meetup's form opens with its own place picking already started (`newMeetupClicked(true)`, not a second picker). Tapping a place directly (a gym's or Power Spot's popup, the right click or long press for a spawn) still skips steps 1 and 2.
 - **Its controller and its details** (prototype review 1): steps 2 and 3 are `ReportFlow` (`report-ui.ts`), a controller over the hold and what the page gives it (`ReportFlowDeps`), tested without a page (`report-ui.isolated.test.ts`: the claim let go before step 3, Cancel, ← Back and Escape giving back the hold, the box, the places, the classes and the focus, Report no longer offered, the battle's marker opened as it would, the pin's order); `reportUi` is the page's side. Each kind's heading is its own (`ReportKind.heading`: "Report a raid", "Start a train"). The focus (R1-3): step 2's heading takes it as step 2 begins (`tabindex="-1"`); what changes in the box, the pin and the nearest places, is a part of its own that stays in the page, `aria-live="polite"`, drawn anew alone with the focus kept on the same control (review R2-2, `pickLive`, `showLive`), back on the Report button when step 2 ends with the focus in it (not for a step 3), the step-3 form's first field (`focusFirst` of the raid, max battle, spawn and start forms); Escape with a popup or the phone card open closes it alone (a capturing listener, before Leaflet's; the card counts as a popup, `popupOpen`, and step 2's start closes it too, review B7), else ends step 2, but is left to another sheet that is open, the layers' (R2-5). While a raid's step 2 picks gyms the raids are drawn whatever their layer (controller's ruling C1, `MapRaids.raidsShown`), so the raid standing at a gym shows; as before once it ends, and a raid or battle a step 3 opens is opened on its own marker, the raids drawn while its popup or the card shows it, the parties drawn anew as it opens and once it closes (reviews R2-1, R3-1: its Power Spot's dot, the gyms with raids and the rings as the layer has them; `openParty`, `raidsDrawn`). Report no longer offered (read-only) ends step 2 at the start of the list's draw, without a draw inside the draw (R1-9). The Power Spots that cannot be had or are not drawn at this zoom are said in place of "Finding the nearest…" (R1-6: `onSpots` tells `failed` and `zoom`; a zoom passed while the map flies to the reference point says nothing, R2-4). The places that do not fit are dimmed with the rest (R1-7), and those that fit offer a clear target of 16 pixels round their dot while they are picked (R1-10, `PICKED_TARGET`, `place-target`).
 
 ## Reports at stops on the map (plan 8R-3)
 
-- **Scope** (Matt, 2026-10-22, as 8X-5): the server side alone: the data, the routes and the code paths they share with `/research` and `/rocket`. The page (`src/web/client/`) has none of it yet (no layer, popups, Report research / Report Rocket, right-click, filter): left for the UX pass (follow-ups, "From the 8R-3 prototype"). No migration, no command change.
+- **Scope** (Matt, 2026-10-22, as 8X-5): the server side alone: the data, the routes and the code paths they share with `/research` and `/rocket`. The page came with the map's UX pass: below, "Reports at stops on the map's page (plan 8M-9B)"; for it the view gained research's and grunts' `picture`, `rewardText`, a grunt's `typeKey`, the square pictures of rewards and catches, and the answers' `reason`. No migration, no command change.
 - **One code path per command** (spec 3.5; `stop-reports.md`, "Reports and `/research`"): `reportResearchAs` and `stopsByKey` (`src/commands/research/research-report.ts`), `reportRocketAs` and `hideoutQuestion` (`src/commands/rocket/rocket-report.ts`), `takeBackAs`; the answers' words are `researchWords` and `rocketWords` with the caller's `ChannelNamer` (on the map a region channel as `#west`, `Region 5` where the bot sees no name), the heading of the command's answer left out, made page text by `pageWords`. The web server is given what the commands read and call (`StopWebDeps.ctx`, `StopWebContext`), the channel names the bot sees (`channelName`), the messages of the posts of the stops in the regions' boards as last drawn (`posts`: `StopPostService.linkOf`, which draws nothing and waits for nothing, unlike `messageOf`, which flushes the gathered redraw and would edit a post on every poll) and the grunts' messages (`grunts`: `GruntMessageService.messagesOfReports`, one read for every grunt of a request, `GruntMessageStorage.ofReports`); both undefined in rehearsal mode, which leaves the web server off anyway.
 - **Who sees which reports** (review R1): a report lies in the regions of the server whose outlines hold its stop's snapshot (`regionsAtPoints`: the server's regions taken once a request and each outline's box tried first, `containment` as the post of the stops'; each report placed once, for who may see it and for the view alike; a stop renamed or gone later the same day stays, design 3), and shows unless the member is `barred` from the forum of every one of them (a region without a forum always shows it): the parties' rule, through the same `PartyViewers` (one for `/api/parties` and `/api/stop-reports`, made in `guildRoutes`, so that what Discord said of a forum serves both; read-only while Discord is away, 503 for a member it has not confirmed lately). No text channel is fetched. A report in no region now is shown to nobody.
 - **The view** `GET /s/<guild>/api/stop-reports` (members, as `/api/parties`: 401, 403, 503, `memberRole`; 30 a minute per address, `STOP_REPORTS_PER_MINUTE`; whether somebody is a member is asked first, `PartyViewers.membership`, the directory's answer kept a minute, so that nothing of the server is read for anybody else, and the forums after the read, `viewer(…, forumsOf(places), membership)`, which does not ask Discord again): `stopReportView` (`src/domain/web/stop-report-view.ts`, pure; its types in `stop-report-data.ts`, without imports, for the page), read anew per request from `StopReportService.standing` (one indexed query; no version in memory: a grunt tells the posts nothing and a period change is no report event, so design 9.16's "source of its own" is the reports themselves), filtered by the clock. `research`: the reports of the period on now only (`periodKey`), and `waiting` `{ stops, at }` where the day's research waits under an intra-day event's window, as the post of the stops says it, `event` the event's name; `grunts`: until their `endsAt` (a lineup's with its label, `MapGrunt.lineup`, plan 8R-4L; `MapHideout` has none); `hideouts`: the day's. Each report: `id` (what a take-back sends), `stop` (the snapshot: key, name, address line, point to six decimals), `madeAt` (with `id` its version, which a take-back sends back, plan 8R-4L, review L1), `endsAt`, `reporter` (the name kept with the report as text, "a member" for none: never an id or `memberByName`'s markdown; stop reports have no anonymity, design 10), `mayTakeBack` (the member's own, any for staff by `isMapStaff` of the directory's standing; never while read-only), `link` (the message of today's post of the stops, in the region's board (plan 8R-9: the thread of the board, `PostLink`), that holds the task or hideout in a region the member sees, else its first message, as last drawn, `StopPostService.linkOf`: none past midnight until the posts are drawn anew; a grunt's own message in such a region; absent where there is none). Research: `task` (its version, plan 8R-5: `<task key>:<reward hash>`, the task's key alone for "one of", `typed:<key>[:<hash>]` for a typed task: it tells versions apart; the same version at more stops is sent as `sameAs` of the report's `id` while the report stands, and once it is gone (narrowed or replaced since, where `sameAs` is `REPORT_ENDED`) as the report's `task` with `more: true` for a listed one (review R4, the controller's call; F3), a typed one's `task` being refused), `text`, `category`, `typed`, `oneOf` (R13: `isOneOf`, a report of before plan 8R-5 with every reward of its task too), `rewards` (the one reward, or those "one of" stands for); grunts and hideouts: `who` (`rocketKey`), `name`, `catches`, a hideout's `picture` (as the post shows it, plan 8R-6: `rocketPicture`, a leader's or Giovanni's portrait, a decoy's one catch or the encounter picture, named as `StopPictures.url` names it, `WebDeps.pictures`: the square picture under `/pictures/` once it is made, none where its source is gone). A reward or catch (`MapReward`): `kind` (`encounter`, `item`, `energy`), `name`, `value` (what a filter matches and `/want` names, as `reward:`'s choices: `pokemon:<catalogue key>`, `item:<key>`, `energy:<dex>`; null for a Pokémon the game data does not know), `quantity`, `shiny`, `image` only from `pictureOrigins` (Leek Duck's pictures are on `cdn.leekduck.com`, the origin of `POKEMON_ICON_BASE`: items and Mega Energy keep theirs). An ETag of the member's JSON (`etagOf`), `private, no-cache`, 304.
-- **The pick lists** (members, an ETag of the JSON, `private, no-cache`, 304; 30 a minute per address each; `src/web/stop-options.ts`, pure): `GET /s/<guild>/api/research-options` (`ResearchOptionsView`): the task list whole in the page's order (not the autocomplete's 25), each `{ key, text, category, rewards, versions }` (`versions`, plan 8R-5, R13: `{ value, label, oneOf }` as `/research` offers them, `ResearchTaskProvider.versions`; a report sends a `value` as its `task`), `stale` (`ResearchTaskProvider.stale(now)`: not read for `settings.research.staleAfterHours`, or never; the rule the service's own warning follows), `readAt`, and `rewards`, the items and Mega Energy a typed task's `reward` may name (`listedRewards`, `{ value, name }`; a Pokémon is named as `pokemon:<catalogue key>` or by its name, as `readReward` reads it). `GET /s/<guild>/api/rocket-options` (`RocketOptionsView`): `rocketChoices` in `/rocket`'s order, each `{ key, name, hideout, catches, note?, lineups? }`, Giovanni's `note` `GIOVANNI_ONLY_WHEN_SURE` (also in `/rocket report`'s help), a grunt type's two lineups (plan 8R-4L, B9; `RocketLineupOption`: `key` `grunt:water:male`, `value` `<key>#<fingerprint>` as a report sends it, `label` the first slot in short, `fingerprint`, `catches`; in the feed's order, the type's own `key` then "not sure which"), `stale` (`RocketLineupProvider.stale(now)`, `settings.rocket.staleAfterHours`) and `readAt` of the lineups. The stops a report names come from `/api/stops` (8M-5M), which lists the stops of Pine's own by the `pine-<id>` key the reports take (`stop-options.test.ts`).
+- **The pick lists** (members, an ETag of the JSON, `private, no-cache`, 304; 30 a minute per address each; `src/web/stop-options.ts`, pure): `GET /s/<guild>/api/research-options` (`ResearchOptionsView`): the task list whole in the page's order (not the autocomplete's 25), each `{ key, text, category, rewards, versions }` (`versions`, plan 8R-5, R13: `{ value, label, oneOf, rewards }` as `/research` offers them, `ResearchTaskProvider.versions`, `rewards` since plan 8M-9B (review F2); a report sends a `value` as its `task`), `stale` (`ResearchTaskProvider.stale(now)`: not read for `settings.research.staleAfterHours`, or never; the rule the service's own warning follows), `readAt`, and `rewards`, the items and Mega Energy a typed task's `reward` may name (`listedRewards`, `{ value, name }`; a Pokémon is named as `pokemon:<catalogue key>` or by its name, as `readReward` reads it). `GET /s/<guild>/api/rocket-options` (`RocketOptionsView`): `rocketChoices` in `/rocket`'s order, each `{ key, name, hideout, catches, note?, lineups? }`, Giovanni's `note` `GIOVANNI_ONLY_WHEN_SURE` (also in `/rocket report`'s help), a grunt type's two lineups (plan 8R-4L, B9; `RocketLineupOption`: `key` `grunt:water:male`, `value` `<key>#<fingerprint>` as a report sends it, `label` the first slot in short, `fingerprint`, `catches`; in the feed's order, the type's own `key` then "not sure which"), `stale` (`RocketLineupProvider.stale(now)`, `settings.rocket.staleAfterHours`) and `readAt` of the lineups. The stops a report names come from `/api/stops` (8M-5M), which lists the stops of Pine's own by the `pine-<id>` key the reports take (`stop-options.test.ts`).
 - **A research report** `POST /s/<guild>/api/research`, body `{ task, reward?, more?, stops, replacing? }` or `{ sameAs, stops, replacing? }` (strict, one or the other, never both nor neither; `replacing` the ids of the reports the member said to replace, up to five, plan 8R-5: `task` as `/research`'s `task:` takes it, a key of the list or typed in full, up to 100; `reward` as its `reward:`, up to 100; `sameAs` the id of a research report, the page's "Same task at more stops…" while that report stands; `more: true` beside `task` for "Same task at more stops…" once it is gone, the report's `task` sent as `task` (review R4, F3); one to five stop keys, each up to 60). `sameAs` and `more` are "Same task at more stops…" alike: its question says the stops `picked` and `reportResearchAs` gets `also` (the "Also reported" of Discord's answer; the map's words leave the heading out). A listed report of before plan 8R-5 has its task's bare key as `task`: one whose rewards are only items names no one reward, and `more` with it is refused with `PICK_THE_REWARD` (422), accepted since such reports stand only on the day of the deploy. Before the body is read: 30 a minute per address (`STOP_WRITES_PER_ADDRESS_MINUTE`, shared with the Rocket reports and taking back) and `postGuard`. Then, none counted: the session (403) and the body (400); who reports (`actingOnTheMap`); the stops (`NO_STOPS_HERE` 422 where the server's regions hold no stop at all; a key that is no titled PokéStop in a region of this server, a Power Spot or another server's stop of its own among them, 404, so nobody learns of other servers' stops: `stopsByKey`, which dedupes); the task and reward (`readTask`: 422 in its words, `TASK_LIST_CHANGED` among them; a `task` that is a typed task's key, `typed:…` in any case, 422 `TYPED_TASK_KEY`, never stored as text), or instead the report `sameAs` names, resolved as `researchControls` resolves its base (`StopReportService.get`: research of this server whose `periodKey` is the period on now, else 409 `REPORT_ENDED` in the command's words, logged `ended`), whose `{ subjectKey, research }` is reported as it stands (a typed task with its text and reward, a listed task gone from Leek Duck's list since). Without `replacing`, **the contradiction question** (plan 8R-5, R7), where `/research` opens its dialog: other members' reports at the stops that the version contradicts (`StopReportService.contested`), unless `/research report`'s window is full (429, nothing counted), 422 `{ ok: false, text: replaceQuestion(…), asks: { reports, hidden? } }` (the contested reports as the list shows them, where shown; those it does not show the member, in a region they are kept out of or all where `shownTo` fails, by id and stop name only as `hidden: { id, stop }[]`, review R5, so that the page can still overrule them); sent again with `replacing` (any of their ids, none for none), those are replaced and the others keep theirs, decided anew inside the store. Only then `/research report`'s throttle in its window (`{ command: RESEARCH_REPORT, varies: true }`, the router's `researchWindow`: one budget with Discord, design 9.12; 429); then `reportResearchAs` as the member (named as Discord has them now, `reporterNamed`), in `countedOnTheMap`. 200 `{ ok: true, text, research, already }`: the words (`Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew`, a line per stop, where it shows; the stops reported already after them, R8, by the reporter's name and without a link), the stops reported already (the same version, or one that says more, standing there; or a contradiction met after the question) as `already`; where every stop was, 409 `{ ok: false, text, research: [], already }`, the use given back as `/research` gives it back (plan 8R-6: `givenBackOnTheMap` in `researchWindow`), the reports made as the list shows them to the member (`shownTo`: never one in a region the member is kept out of, though it is made, as from the command; R13). The deliberate exception, for research and Rocket alike: an answer's words name what stands at the stop the member named, as the command does (a hideout in the question, the reporter of a grunt standing, a barred region's `#channel` where a report shows or could not be posted); the report objects follow the GET. Where what shows the reports cannot be read just now (the server's row, the grunts' messages, the posts), the answer is still `ok: true` with the words and without the report(s), and the failure a warning ("could not show reports at stops made on the map"): the report stands and was counted, and the page's next poll shows it. The posts of the stops and DMs follow by themselves. Where it shows names the boards of its regions only where one is recorded, and says only until when where none is (`boards`, review W4, as `/research` and `/rocket` say it). Logged at info `{ user, guild, stops, outcome }` (the keys of the stops found, else how many were sent, never a key that names no stop; `reported`, `already`, `asks`, `no-stops`, `no-stop`, `refused`, `ended`, `throttled`), "field research was reported on the map", never a text. "Same task at more stops…" is no route of its own: the page sends `sameAs` with the listed report's id; once that is `REPORT_ENDED`, the report's `task` with `more: true`; a typed task only `sameAs`. It is counted in `/research report`'s window as the command's menu is.
 - **A Rocket report** `POST /s/<guild>/api/rocket`, body `{ who, stop, replacing? }` (strict: `who` as `/rocket`'s `who:`, a key, a lineup's `value` (plan 8R-4L: a fingerprint not of now is `LINEUPS_CHANGED`, uncounted) or a name typed in full, 1 to 100; a lineup over "not sure which" or the other lineup refines the grunt in place, as `/rocket` does, its `grunt` keeping its id; the question names a lineup by `rocketLabel`; one stop key; `replacing` the id of the hideout the member said Replace to). The order as for research, `readWho` the reader (`LINEUPS_CHANGED` among its words); then **the hideout question**, where `/rocket` opens its dialog (a grunt at a stop whose standing Rocket report, `rocketAt`, is a hideout, unless `replacing` is that hideout's id): unless `/rocket report`'s window is full (429, nothing counted: `throttledOnTheMap` with `count: false`, as Discord opens no dialog then), 422 `{ ok: false, text: hideoutQuestion(…), asks: { replacing: <hideout id> }, hideout? }` (the hideout as the list shows it, where shown); the report sent again with that `replacing` replaces it, decided anew inside the store (`decideRocket`: another hideout by then is asked about again). No state is kept between the two requests (as 8X-5's ending-soon question). Then `/rocket report`'s throttle (`rocketWindow`), then `reportRocketAs`: 200 `{ ok: true, text, grunt | hideout }`; the same grunt standing 409 "Already reported: a Water-type grunt at …, by Bob 2 min ago; it goes away in 28 min." with the `grunt` and its `link` (the use given back, as `/rocket` gives it back, plan 8R-6); a hideout reported between the route's look and the report 422 with the question (the use given back); a grunt posted in none of its region channels 503 in `/rocket`'s words with the channels named `#west` (`unposted`, the use given back); one overtaken while posted 409 (given back); an unexpected failure gives it back too. Logged `{ user, guild, stop?, outcome }` (the stop's key once found), "Team GO Rocket was reported on the map".
 - **Taking back** `POST /s/<guild>/api/stop-reports/<id>/remove` (body empty, `{}`, or `{ madeAt }`, the report's `madeAt` as the list gave it, plan 8R-4L, review L1; an id that is not 1 to 10 digits 404 before the body): after the session, the body and `actingOnTheMap`, the report by id of this server that has not ended (`StopReportService.get`: an unknown id, another server's and one gone answer alike, 409 `{ ok: false, text: NOTHING_LEFT }`, R14), the member's own or any for staff (`isMapStaff` of the member fetched fresh; 403 `{ ok: false, text: NOT_YOUR_REPORT }`), with a `madeAt` that is no longer the report's before that (a grunt refined in place since keeps its id: 409 `{ ok: false, text: REPORT_CHANGED }`, for its first reporter and staff alike, and again where `takeBackAs` meets a refine meanwhile, `changed`), none counted; then `MEMBER_WRITE_THROTTLE` in `/research remove`'s or `/rocket remove`'s window by the report's kind; then `takeBackAs`: 200 `{ ok: true, text: "Took back Catch a Dragon-type Pokémon at Yellow Mural." }`. A hideout put back under a new id (8R-2's fix S3) is found by the page's next poll, not by the old id. Logged `{ user, guild, report, outcome }`, "a report at a stop was taken back on the map".
 
+## Reports at stops on the map's page (plan 8M-9B)
+
+Brief `.superpowers/sdd/2026-10-27-phase-8m9b-stop-reports-map/design.md` (rulings B1 to B18); design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("Layers", "Markers", "The list", "Reporting"). Every report and take-back goes through the routes of plan 8R-3 above; the page decides no domain fact (which versions exist, whether a lineup is current, who may take back): it acts on the answers' machine parts (`asks`, `reason`, the status), never on their words. No route was added.
+
+- **The server's part** (B1, B2, B4, B5): rewards' and catches' pictures in the view and the pick lists named as the post of the stops names them (`StopPictures.url`, the square ones; made when the task list and the lineups are read, `stop-reports.md`, "Pictures at the stops"); research's `picture` (`researchPicture`), a grunt's `picture` (`rocketPicture`), research's `rewardText` (`rewardLine` of `src/domain/research/task.ts`, the post's reward line before it is made plain: `rewardWords` is `plain(rewardLine(…))`) and a grunt's `typeKey` (`typeKeyOf`, what a filter by type matches); each version of the pick list with the rewards it stands for (`ResearchVersionOption.rewards`, `TaskVersion.rewards`: a reward listed twice, shiny or not, once; "one of" its encounters; review F2), their pictures named as the task's are; `StopReportAnswer.reason`: `ended` where `REPORT_ENDED` is answered, `list-changed` where the readers refuse a choice of a list that changed (`ListChanged` of `src/discord/errors.ts`, thrown by `readTask` and `readWho` with `TASK_LIST_CHANGED` or `LINEUPS_CHANGED`; `listChanged`, `stop-routes.ts`, knows it by its kind, never by its words: review F8); `backAtWords` (`src/domain/stops/back-at.ts`, no import) words the day's research waiting in the post and on the page alike.
+- **Two live layers** (`MAP_LAYERS`: `research` "Field research", `rocket` "Team GO Rocket", on by default, members only; "Research" and "Rocket" on the desktop's toggles, `LayerSpec.short`, their names in the sheet and the toggle's title and `aria-label`, `toggleName`). Their data from `GET /api/stop-reports`, polled as the parties are (`stopReportLayer`, `src/web/client/stop-report-layer.ts`: a `Poller` of its own, every 20 seconds while the page is visible, at once after a report or a take-back from this page, 401 or 403 stopping it, 503 asked again later, drawn only when the JSON changed; the browser revalidates by the ETag), and drawn inside the parties' draw (`showParties`: one hold, one redraw, one list of the things at one place): the poll draws the parties anew through their hold, so nothing is drawn under a form being filled in. The reports do not wait for the parties' list (review F11): until it comes (a 503 at the load), they are drawn with none (`noParties`: reports offered as at the load, the map not said to be read-only for it).
+- **Markers** (`src/web/client/stop-reports.ts`, pure: `reportsAtStops`, `stopMarkerFacts`, `stopMarkerNode`): one marker per stop holding every report shown there, a circle of ours centered on the stop (the raids' middle size, `--raid-middle`, from zoom 15, their small one below; a tap target of 32 pixels at least), never clustered. Its picture: a hideout's `picture`, else the research's (its reward line's: the one reward's, the encounter picture for "one of"), else the Rocket icon for a grunt (B2), the research icon for a typed task without its reward. Its ring of `--research` or `--rocket` (`theme.css`, light and dark), half and half where the stop has both (the ring's four borders, turned 45 degrees). A grunt's minutes left as a raid's badge, dimmed in its last five minutes by the raids' rule (`isDimmed`, the domain's `endsSoon`), kept current every 15 s from the marker's `data-end` as a raid's. A report drops at its end without waiting for the poll (the parties drawn anew at the next end, `nextEnd`, B14), but at the stop whose popup or card is open, whose ended reports say "Ended" and lose Take back. The plain PokéStop dot under a marker is left out (`PlacesHooks.occupied('stops')`, `MapRaids.reportStops`). A stop and a party at one place (a meetup at a stop, a raid's gym beside it): one tap lists both (B3: `PlacedLayer` takes `research` and `rocket`, `stopPlaced` names the stop in the list by its name and what it has).
+- **The stop's popup and card** (`src/web/client/stop-popup.ts`, pure: `stopPopup`; bound as a party's, `withPopup`, so a phone opens the parties' card with it and a form holds its content): the stop's name, address line, distance (once the browser shared your location, the parties' rule) and Directions (`mapLine`); then each report: research (its picture and kind, the task, the rewards in short, the pictures of "one of" where the server says it is one, `oneOf`, "until 5:00 PM" or "until midnight", "reported by Brock"), a grunt (its name and lineup, the catches' pictures, its minutes left), a hideout (its picture, name, catches, until when), each with Open on Discord (a `https://discord.com/channels/` address only) and Take back where the server says the member may (`mayTakeBack`), research also "Same task at more stops…"; then the stop's own actions, "Report research here" and "Report Rocket here", for a member while the map is not read-only (`reportOffered`). A plain PokéStop's popup (B11, `plainStopPopup` through `PlacesHooks.stopPopup`): its name, distance and Directions, no address line (`/api/stops` gives none), the two actions. No right click or long press on a stop reports at it (B10): the popup and the Report button cover it.
+- **Take back** (`stopUi`, `src/web/client/stop-report-ui.ts`; `sendStop`, `takeBackPath`, `takeBackBody` of `stop-forms.ts`): a question first in the place of the report's actions, "Take back <task> at <stop>?", held as the other forms; then `POST …/stop-reports/<id>/remove` with `{ madeAt }` (always: plan 8R-4L's follow-up; the version the pressed Take back showed, its `data-made-at`, never a later poll's: review F4) through `pressParty`'s retry of a stale CSRF token; whatever it answers (taken back, not yours, nothing left, changed meanwhile, too many) is said as the notice, and the reports are asked for at once. Between two lists (`tick`, every 15 s) a grunt's minutes in an open popup stay current and a report ended says "Ended", its Take back and "Same task at more stops…" gone.
+- **The list** (`stopReportLines`, `waitingNote`, `untilWords` of `what-is-on.ts`): the groups "Field research" and "Team GO Rocket" after the parties' (raids and max battles, trains, meetups, research, Rocket, spawns), only for the layers on; a line per report (picture, the task or the grunt's or hideout's name, the stop, the distance, "until 5:00 PM" or a grunt's "24m left", dimmed in its last minutes), opening its stop's popup (`stop:<key>`); Soonest by the end; Most going has no count for reports: they keep nearest order within their groups (B13, `UNCOUNTED` in `listGroups`). While the day's research waits under an event's window the research group says so, also with no research listed: "Back at 4:05 PM, after Pawniard Community Day: the day's research at 3 stops." (`backAtWords` with the reader's clock, `waiting.stops` as the server counts them).
+- **Filters** (`src/web/client/stop-filter.ts`, pure; `stop-filter-ui.ts`): research by one or several rewards (`MapReward.value`; "one of" when any of its rewards matches; `value: null` is no choice, B12), Team GO Rocket by who (a grunt type, matched by the grunt's `typeKey` so its lineup too; a leader; Giovanni; the decoy) or a catch; the choices today's reports' and the pick lists', which are asked for only when a filter opens (B12), each time it opens (review F10: the browser asks again by their ETag; not twice at once; a list that fails keeps the one it had and is asked for at the next opening). A report a filter hides is neither drawn nor listed. Chosen under "Filter…" beside the list group's heading (the builder's call); always in sight while one is on: the group's heading ("Field research · 1 · Rare Candy" with ×) and its note ("3 hidden by the filter."), a line over the map at the top right (`.filter-line`, on a phone too) with each layer's words and ×, and the layer's toggle (dashed, its title and name for a screen reader "Field research · Rare Candy"; its row in the sheet "Filter: Rare Candy", `LayerControls.filtered`). Kept per browser (`localStorage` `pine-map-stop-filters`, read and written in try/catch).
+- **The Report menu and step 2** (B9, B17): Field research and Team GO Rocket after Max battle, `pick: 'stops'`, headed "Report field research" and "Report Team GO Rocket"; their icons the game's quest symbol (`Images/Quests/QuestSymbol.png`, white, drawn as a CSS mask tinted `--research`: `ReportIcon` of kind `mask`, its picture set by the stylesheet, `.report-icon.mask-research` in `map.css` at the same pinned address, so that every place of the icon draws it, the popups and phone cards too, with no script (review F5; `report-icons.test.ts` holds the two to one address); mask pictures are fetched with CORS, which raw.githubusercontent.com answers with `*`) and Team GO Rocket's R (`Images/Rocket/teamrocket_r.png`, also a grunt's marker), at the pinned pogo_assets commit (`report-icons.test.ts`). Step 2 for stops as for Power Spots: the map flies to the reference point at `PLACES_FROM`, the stops of `/api/stops` for that box drawn whatever the PokéStops layer says and ringed (`forcedPlaces('stops')`), the nearest five listed (`onStops` beside `onSpots`, the words of each kind of place, `NEAREST_WORDS`); a stop with reports is picked by its marker (it takes taps while stops are picked, and lets them through while another kind is); a tap on open map puts no pin and says "Tap a PokéStop." (`TAP_A_STOP`). A stop picked ends step 2 for step 3 there (`ReportFlowDeps.toStop`): research's form in the side pane, Team GO Rocket's in the stop's popup or card.
+- **Team GO Rocket's form** (B8: in the stop's popup or card, as the max battle form is in a Power Spot's; `rocket-forms.ts` pure, `rocket-ui.ts`): who as a menu in `/rocket`'s order (`/api/rocket-options`), Giovanni's note under him, the catches' pictures of the choice; a type of two lineups asks which (each by its first slot with its catches, then "Not sure which", the type's own key); the lineups said to be out of date where `stale`. `POST /api/rocket` `{ who, stop }` (`submitRocket`): made, or the same grunt there (409 with `grunt`): the form closes, the words said, the reports asked for at once and the stop's popup opened after the poll (B15); a hideout there (422 `asks.replacing`): the hideout question as a confirm, Replace sending it again with `replacing`, Cancel sending nothing; `reason: 'list-changed'`: the lists asked for again, the type kept; 404: "That PokéStop is gone: pick another." (`STOP_GONE`, B6); 503 (posted nowhere), 429 and the rest: the server's words under the form.
+- **Field research's form** (B8: in the side pane's box, docked under the map on a phone, an aside claim of the hold as the meetup and train forms; `research-forms.ts` pure, `research-ui.ts`): the stops as chips with ×, the one it was opened on and "Add stops…" picking up to four more on the map (`MAX_STOPS`; the stops drawn and ringed, a stop with reports by its marker, a tap on open map "Tap a PokéStop."; a raid's or a max battle's marker, dimmed, takes the tap and does nothing, as in the Report button's step 2: review F9; a refusal drawn ends the picking); the task searched for in the whole list (`/api/research-options`, the server's order, an event's tasks first), grouped by category, each with its rewards' pictures, a keystroke drawing the list alone (`taskList`) and never the field (review F3: an IME's word or a phone's keyboard is not cut); its version where it has several (radios, each with the pictures of the rewards the server gives it, `ResearchVersionOption.rewards`: one reward each, then "one of"), a task of one version taken as it is; "I can't find my task" types the task and its reward in full, the reward offered from the list's rewards (a `<datalist>`; read by the server alone); the list said to be out of date where `stale`. `POST /api/research` (`submitResearch`; every button of the form off until the answer, also in a form drawn anew meanwhile, `ResearchFormState.sending`, review F3): made, or every stop reported already (409): the form closes, the reports asked for at once, the first stop's popup opened after the poll (B15); `reason: 'list-changed'`: the lists asked for again, the task and version kept where still listed; 404: `STOP_GONE`; **the contradiction question** (422 `asks`): in the form, the server's words, an unticked checkbox per contested report (its stop, task, rewards and reporter as the list shows them; a hidden one by its stop name, "(a report you cannot see)"), Report sending it again with `replacing` (the ticked ids; none ticked `[]`), Cancel sending nothing (R7).
+- **"Same task at more stops…"** (goal 8; B15: offered from a research report's popup once the poll shows the report, so also right after a report from this page, whose stop's popup opens after the poll): the research form with the report's task and its stops picked at once, `{ sameAs, stops }`; answered `reason: 'ended'` (the report narrowed or replaced since), a listed report is sent again as `{ task, more: true, stops }`; a typed one says the server's words and the form becomes a new report's, the task and its reward typed in, the stops kept (review F6: never `sameAs` again); a listed one whose version the list lost meanwhile (`list-changed` to the second request) likewise a new report's form, the version picked where the new lists have it; the contradiction question as above.
+- **Read-only and logged out** (B16): logged out the two layers are not offered and nothing is polled (the parties' layer is a member's); read-only by the parties' list (`reportOffered`): no "Report research here", "Report Rocket here" or "Same task at more stops…", and the server says `mayTakeBack: false`. The controls of the reports at stops are off while another form holds (`formControls`).
+- **Tests:** the pure parts in `stop-reports.test.ts`, `stop-popup.test.ts`, `stop-forms.test.ts`, `stop-filter.test.ts`, `rocket-forms.test.ts`, `research-forms.test.ts`, `what-is-on.test.ts` and `list-ui.test.ts` over the cases of `src/web/client/stop-report-cases.ts` (the page never imports it); the drawing (also with the parties' list down), the shared place, step 2's pick of a stop's marker, "Add stops…" (raids' taps taken meanwhile, a refusal ending it), the search field kept as it is typed in, the buttons off while a report is sent and the filters' lists asked for at each opening in `party-layer-draw.isolated.test.ts` (its `started` takes `stops`, the view `/api/stop-reports` answers, the layers kept, `partiesDown`, `research` and `sendsForever`; Date set to the cases' clock, `CASE_NOW`, since the draw drops a report at its end: review F1); step 2 for stops in `report-ui.isolated.test.ts`; the header's breakpoints in `src/web/phone-header.test.ts`. The rest of Leaflet's side is tried in the preview and at staging (`docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md`).
+
 ## The region editor (plans 8M-2, 8M-2F)
 
 - **Who:** staff for regions as `/region` admits them, decided per request by `RegionStaffSource.check` (`DiscordRegionStaff`, `src/discord/web-staff.ts`: the member fetched fresh, `fetchGuildMember(…, true)`, then `regionStaffAnswer`, `src/web/region-staff.ts`): an admin, a moderator or a bot developer by role, or the bot's owner (`isBotManagement`, the guard's own check), who also has Manage Server (`/region`'s `default_member_permissions`, which on the web nobody else checks); their own Manage Channels says whether new channels may be made and forums deleted. A server that grants `/region` to a role through its Integrations overrides (Server Settings, Integrations) still needs Manage Server for that role's members on the web: the overrides are not read (Matt, 2026-10-16: Manage Server is kept). `staff`, `not-staff`, `not-member`, `unknown-server` (no `Guild` row yet), or `unreachable` (Discord failed: read-only for staff seen within 30 minutes, 503 for anybody else, nothing written). The session says only who.
diff --git a/docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md b/docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..86789d2166c505b4c088b5b485c3c6a18969b601
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-27-phase-8m9b-staging.md
@@ -0,0 +1,81 @@
+# Phase 8M-9B staging checklist: reports at stops on the map
+
+Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude drives Discord and the map in its own tab, Matt the phone steps.
+
+- **Accounts:** Googer (owner, staff), Tester (a member).
+- **Brief:** `.superpowers/sdd/2026-10-27-phase-8m9b-stop-reports-map/design.md` (its last section, "After the builder check", B1 to B18).
+- **Design:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("Layers", "Markers", "The list", "Reporting", "The deferred page features").
+- **Conventions:** `docs/architecture/web.md` ("Reports at stops on the map's page", "Reports at stops on the map"), `docs/architecture/stop-reports.md` ("Pictures at the stops").
+- **Devices:** a desktop browser (light and dark, and narrowed to 768, 1023, 1024, 1150 and 1280 pixels), an Android phone and an iPhone if at hand (360 and 375 wide), Discord's in-app browser and the phone's own.
+- **Compare with Discord:** every report and take-back beside its command on Discord (`/research report`, `/research remove`, `/rocket report`, `/rocket remove`): the same pick lists, questions, words and answers; the post "Today’s Stops" and the grunts' messages follow by themselves.
+
+## Before
+
+0. **The page built, the bot started after it.** `npm run web:build`, then start (or restart) the bot: the bot serves the map's page from `dist/web/assets/` and reads `dist/web/assets.json` once at startup.
+1. **No migration, no setting, no command change:** no deploy needed. `settings.web.publicUrl` is `https://dev.example.com` and the tunnel `pine-dev` runs (the square pictures are served at `/pictures/` only at a public address). Research and Rocket on, the task list and the lineups read (`/research report` and `/rocket report` offer them).
+2. **Pictures made as the lists are read (B1).** In the bot's log after the start, no "could not make a picture square" for every reward (a few gone sources are fine); `var/pictures/` holds some 400 files after the task list and lineups were read (count them before and after a restart: none fetched again).
+3. **Reports.** On Discord, Googer reports with `/research report` a task of one reward at a stop of West, a "one of" task at another, and a typed task without its reward at a third; with `/rocket report` a grunt of a type with two lineups (one lineup picked) at the first stop (so that it has both), a grunt of one lineup at a fourth, and a leader (a hideout) at a fifth. Tester reports a task at a sixth stop. Note the time of an event with research of its own if one is on (for step 12).
+
+## The layers and the header (goal 1, B7)
+
+4. **Two live layers.** Logged in as Tester: "Research" and "Rocket" toggles in the desktop's row from 1024 pixels, their full names in the toggle's title (hover); on in a private window. Logged out: not offered (not in the row, not in the phone's sheet), and `/api/stop-reports` not asked (devtools' network). Turn each off and on: its reports go and come back on the map and in the list.
+5. **The header's widths (B7, provisional).** At 768 and 1023: "Professor Pine", "Layers · n", Report, "Find a gym", the account, one row; the sheet lists Field research and Team GO Rocket with their lines and counts in view. At 1024, 1150 and 1280: the five toggles, More, Report, "Find a gym", the account in one row, also with a long display name (cut at 140 pixels). Phones (360 and 375): one row, nothing scrolls sideways. Say what fits and where it wraps, for Matt's ruling on B7.
+6. **The poll.** With devtools open: `/api/stop-reports` every 20 s while the tab is visible (304 when nothing changed), none while it is hidden, at once when shown again; report a grunt on Discord: it appears on the map within 20 s without a reload. Log out in another tab: the next poll's 401 stops it.
+
+## Markers and the shared place (goal 2, B2, B3, B14)
+
+7. **One marker per stop.** At street level: the first stop's marker ringed half research, half Rocket; the "one of" stop with the encounter picture, the typed task's with the research icon (the quest symbol in research's color), the grunt alone with the Rocket R, the hideout with the leader's portrait (`/pictures/…png`, square). Light and dark. The PokéStops layer on: no plain dot under a marker. Zoomed out to 14 and 13: smaller, without the badge; never clustered.
+8. **A grunt's minutes.** The grunt's badge counts down every 15 s without a reload ("24m"), dimmed in its last five minutes; at its end the marker goes without waiting for the poll (watch with the stop's popup closed); with its popup open instead, the popup stays and says "Ended", its Take back gone.
+9. **A report and a party at one stop (B3).** Make a meetup at the first stop (`/meetup` at the stop): one tap on the stop's marker or the meetup's ring lists both ("Here"); a choice opens its own popup. Turn the Meetups layer off: the tap opens the stop's popup alone.
+
+## The stop's popup and card, Take back (goal 3, B11, B14)
+
+10. **The popup.** Tap the first stop: its name, address, distance (once your location is shared) and Directions; the research (picture, "Field research", the task, its reward, "until midnight · reported by Googer", Open on Discord, Take back, "Same task at more stops…"), the grunt (its name and lineup, the catches' pictures, "24m left", reporter, Open on Discord); then "Report research here" and "Report Rocket here". The typed task's research shows the quest symbol in research's color, not a filled square (also in the phone's card). Open on Discord opens the message of "Today’s Stops" in the board, and the grunt's own message. On a phone: the card, readable at 375, nothing sideways. As Tester at Googer's stop: no Take back (Tester's own: Take back). As Googer (staff): Take back on every report.
+11. **A plain PokéStop's popup (B11).** PokéStops on, a stop without reports: its name, distance and Directions, no address line, and the two actions. Read-only (Discord away for the bot) or logged in as a non-member: no actions.
+12. **Take back.** Take back the typed task: "Take back Make … at …?" with Take back and Cancel in the place of its actions; Cancel puts them back; Take back: "Took back … at …." as on Discord, the marker gone at once (no 20 s wait), the post "Today’s Stops" drawn anew. Refine the grunt on Discord (`/rocket report` the other lineup) while its popup is open from before, then Take back: "That report was changed meanwhile…" (`REPORT_CHANGED`), the popup redrawn with the refined grunt. Take back a report taken back meanwhile in another tab: its `NOTHING_LEFT` words.
+
+## The list (goal 4, B5, B13)
+
+13. **The groups.** "Field research · n" and "Team GO Rocket · n" after Meetups, only for the layers on; each line its picture, the task or name, the stop, the distance, "until midnight" or "24m left" (dimmed in its last minutes). Tap a line: the map flies to the stop and opens its popup (on a phone, back to the map first); hover on the desktop rings its marker. Soonest: the grunt ending first first; Most going: nearest first within the groups (no count).
+14. **Back at.** During an intra-day event window with research of its own (or the day's research reported before it): the research group says "Back at <time>, after <event>: the day’s research at n stops." as the post's heading says it, in the reader's zone.
+
+## Filters (goal 5, B12)
+
+15. **Research by a reward.** "Filter…" beside Field research's heading: the rewards of today's reports and the task list (asked for now, devtools: `/api/research-options` and `/api/rocket-options`; closed and opened again, asked again, 304 when unchanged; offline at the first opening, the choices come at the next). Tick Dratini: only research giving Dratini (the "one of" with Dratini among them too) on the map and in the list; the heading "Field research · 2 · Dratini" with ×, its note "n hidden by the filter.", the line over the map at the top right "Field research · Dratini ×", the Research toggle dashed with its title "Field research · Dratini", the phone sheet's row "Filter: Dratini". Tick a second: "2 filters". × clears it everywhere.
+16. **Rocket by type, leader, catch.** Tick the grunt's type: its lineup grunt shows (matched by type); tick the leader: the hideout shows; untick both and tick a catch: the reports that give it. Reload: the filters kept (one choice for every server). A private window: none.
+
+## The Report button (goal 6, B9, B17)
+
+17. **Step 1.** The menu: Raid, Max battle, Field research, Team GO Rocket, Wild spawn, Train, Meetup; the quest symbol in research's color and Team GO Rocket's R load (light and dark, outlined).
+18. **Step 2.** Field research: the map flies to where you are (or its middle) at street level, "Finding the nearest…", the five nearest PokéStops, the stops drawn and ringed whatever the PokéStops layer, the stops with reports ringed too and taking taps; zoomed out: "Zoom in to see the PokéStops near here."; offline: "The PokéStops could not be loaded. Try again in a moment."; a tap on open map: "Tap a PokéStop.", no pin. Team GO Rocket the same.
+19. **Step 3.** Field research at a stop (its dot, its marker or its line): the research form in the side pane (docked under the map on a phone), its search focused. Team GO Rocket at a stop: the stop's popup (or card) with the Rocket form open in it, its menu focused.
+
+## Team GO Rocket's form (goal 9)
+
+20. **The lists.** "Report Rocket here": who in `/rocket`'s order, Giovanni with his note under him, the catches' pictures of the choice; a type of two lineups asks "Which lineup?" (each by its first slot with its catches, then "Not sure which"); compare with `/rocket report`'s choices. Report without a lineup: "Pick the lineup, or Not sure which.".
+21. **A report.** A grunt at a plain stop: "Reported …" in `/rocket`'s words (the channel as `#west`), the form closes, the stop's popup opens after the poll with the grunt; the grunt's message on Discord. The same grunt again at that stop: "Already reported: …" and its popup.
+22. **The hideout question.** A grunt at the hideout's stop: the question in `/rocket`'s words with Replace and Cancel; Cancel sends nothing (the hideout stays); Replace: the grunt replaces the hideout for the day, as on Discord.
+23. **The lineups changed.** With the form open on a lineup, let the lineups change (or send an old fingerprint by hand in devtools): "The lineups just changed: pick again.", the form drawn from fresh lists, the type kept.
+
+## Field research's form (goal 7)
+
+24. **The task.** "Report research here": the stop as a chip, the search over the whole list (an event's tasks first, grouped by category, each with its rewards' pictures); type "dragon": only matching tasks, the field keeping the focus and the phone's keyboard up as each letter is typed (also a word chosen from the keyboard's suggestions, and on an IME such as Japanese). Pick a task of several rewards: "Its reward" radios with pictures, then "one of …"; a task of one reward: no question. Stale list (wait past `staleAfterHours`, or the dev database's list): the out-of-date line; "I can't find my task" types the task and its reward (the reward offered as typed).
+25. **More stops.** "Add stops…": the stops drawn and ringed, tapping three more adds them as chips (a stop with reports by its marker), × leaves one out, "Done adding"; a fifth fills it and "Add stops…" goes. While stops are added a raid's or a max battle's marker (dimmed) takes the tap and opens nothing.
+26. **A report.** Report: "Field research reported" words without its heading (the stops, where it shows), the form closes, the first stop's popup opens after the poll with the report and "Same task at more stops…"; the post on Discord. Every stop reported already: the server's words, the form closes. Report pressed twice quickly (or a stop tapped while it is sent, "Add stops…" on): one report, the buttons off until the answer.
+27. **The contradiction question.** As Tester, report another reward at Googer's stop: the question in `/research`'s words, an unticked box per contested report (its stop, task, rewards and reporter), Report with none ticked keeps Googer's (`replacing: []`), with it ticked replaces it; Cancel sends nothing. A report in a forum Tester is kept out of: named by its stop only, "(a report you cannot see)".
+28. **The list changed.** With a version picked, let the task list change (or edit the version's value in devtools): "The task list just changed: pick the task again.", the lists asked for again, the task kept where still listed.
+29. **A stop gone.** A Pine stop removed with `/pokestop remove` while it is in the form: "That PokéStop is gone: pick another." (B6), the form kept.
+
+## Same task at more stops (goal 8)
+
+30. **More stops.** "Same task at more stops…" on the research's popup: the form in the side pane with the task and its reward, picking at once; add two stops, Report: reported there as `/research`'s "Same task at more stops…" ("Also reported" left out).
+31. **Once it is gone.** Replace that report on Discord, then "Same task at more stops…" from the popup still open: sent again by its task with `more` (the same words); for the typed task: the server's words, and the form becomes a new report's with the task and its reward typed in and the stops kept (Report sends it as a typed task, never the gone report again); a listed task whose version the list lost meanwhile: "The task list just changed…", a new report's form, the version picked where the list still has it.
+
+## Read-only, logged out, phones
+
+32. **Read-only** (Discord away for the bot, the read-only line under the header): no Report research/Rocket here, no Same task at more stops…, no Take back; the reports still drawn.
+33. **Phones.** Every popup, card, form and the filter on a phone of 360 and 375 pixels: nothing scrolls sideways; the research form docked under the map, the map usable to add stops.
+
+## After
+
+34. **Follow-ups.** Matt's ruling on the header (B7); the research icon's mask and the Rocket R as the menu's icons; anything found.
````

## After the last task

- [ ] `npm run check > var/8m9b-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff d82b35d20f1157385d3311b2043f5b15965fa19a HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
