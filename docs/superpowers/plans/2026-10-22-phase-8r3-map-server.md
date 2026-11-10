# Phase 8R-3: Reports at Stops on the Live Map, the Server Side: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The third plan of reports at stops (design `docs/superpowers/specs/2026-10-21-stop-reports-design.md`, section 8 and 9.12, 9.16; Gantt phase 17), **the server side only** (Matt, 2026-10-22, as 8X-5): the map's page may be redone after its staging, so this plan builds what any page would use unchanged, and the page (`src/web/client/`) gets no feature. In detail:

- **One code path per command:** `reportResearchAs` and `reportRocketAs` (with `stopsByKey`, `takeBackAs`, the hideout question's words), called by `/research`, "Same task at more stops…", `/rocket`, its dialog, both `remove` subcommands and the map; the answers' words `researchWords` / `rocketWords` take the caller's channel namer, and the commands' messages stay the same (inline snapshots of every branch, checked against the base's output).
- **`GET /api/stop-reports`:** today's research of the period on (the day's waiting under an event's window counted), the grunts standing and the day's hideouts, each with its stop's snapshot, words, rewards or catches and filter values, the reporter by name (raw text, never an id), `mayTakeBack`, and a link read without drawing anything (`StopPostService.linkOf`, today's post only; grunt links in one read, `GruntMessageStorage.ofReports`). A report shows in the regions its snapshot lies in unless the member is barred from that region's forum (`PartyViewers`, now one instance shared with `/api/parties`); regions placed once per request (`regionsAtPoints`, box first). Read anew per request, ETag, 304.
- **`GET /api/research-options`** (the task list whole, `stale`, `readAt`, the items and Mega Energy a typed task's reward may name) and **`GET /api/rocket-options`** (`/rocket`'s choices, catches, Giovanni's note, `stale`, `readAt`); the providers' `stale(now)` is the one rule, also for the services' "out of date".
- **`POST /api/research`, `POST /api/rocket`, `POST /api/stop-reports/<id>/remove`** in web.md's order of checks; uses counted in the commands' own windows (`varies: true`), refusals uncounted; the hideout question as a 422 with `asks.replacing` (a full window 429 first); give-backs for `asks`, `unposted`, `overtaken` and unexpected errors; answers never carry a report the list would hide.

**Not in 8R-3:** the page's part of design 8 (the layer, popups, right-click, filter): follow-ups, "From the 8R-3 prototype", "For the web UX pass".

**Architecture:**

- **Commands:** `src/commands/research/research-report.ts` (new), `src/commands/rocket/rocket-report.ts` (new), `research.ts`, `rocket.ts`; `src/render/research.ts`, `rocket.ts`.
- **Domain:** `src/domain/web/stop-report-data.ts` (types, no imports), `stop-report-view.ts` (pure).
- **Services:** `StopPostService.linkOf`, `GruntMessageStorage.ofReports` / `GruntMessageService.messagesOfReports`, `regionsAtPoints` (`region-directory.ts`), `stale(now)` on `ResearchTaskProvider` and `RocketLineupProvider`.
- **Web:** `src/web/stop-routes.ts` (new), `stop-options.ts` (new), `guild-routes.ts`, `party-routes.ts`, `server.ts`; `app.ts` wiring (`StopWebDeps`).

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14, Fastify, Vitest. No new dependency, **no migration**, no party state change, **no command change** (no deploy needed).

**Spec:** the design above, the brief `.superpowers/sdd/8r-3-map/design.md` (its review R1–R14) and its ledger (git-ignored).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8r3`, tip `96182d63`, tag `proto-8r3-r3`), one commit per task, on `stop-reports` 973b573f. Each commit typechecks (both projects) and its tests pass; on the tip the full check (8,833 tests), the build and the database suite (568) are clean.

**Reviews:** a fresh Opus reviewer read the brief before any code (ten Important: which reports a member sees, the polling version, what stands under an event's window, pictures, a GET that would have edited Discord, the answers' words, the reporter in JSON, the pick lists, the throttle windows, the give-backs; four Minor; all folded into the brief). Two Opus reviewers went through the prototype (tasks 1 and 3: five Minor; tasks 2 and 4: six Minor), then a fix review (two Minor test gaps), all folded into the commits below.

## Decisions in this plan

Made while prototyping and reviewing, for Matt to look at:

1. **Who sees a report:** it shows unless every region its stop's snapshot lies in is barred to the member (the region's forum, as the parties' list decides it); a region without a forum always shows it; a report in no region shows to nobody.
2. **An answer's words name what stands at the stop the member named** (a hideout, the grunt's reporter, a region's `#channel`), as `/rocket` and `/research` do, even where the member is kept out of that region; the report objects in the answer follow the list.
3. **The reporter** is named on the map by name (stop reports have no anonymity, design 10), "a member" where none was kept.
4. **Links:** research and hideouts link to the message of today's pinned post that holds them, else its first message; a grunt to its own message in a region the member sees. Nothing is drawn to find a link.
5. **Taking back on the map:** one's own report, any for staff (`isMapStaff`); in the remove subcommand's window of its kind; an unknown id and another server's id answer alike (409).
6. **Pictures:** Leek Duck's, already allowed (`cdn.leekduck.com` is `POKEMON_ICON_BASE`'s origin); the CSP is unchanged. Matt (2026-10-22): Leek Duck's server is fine, or Pine caches the pictures itself if it must.
7. **Limits:** the pick lists 30 a minute per address each; the list 30; reports and take-backs share one 30 a minute.

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment.
- `src/domain/` stays pure. Tests never use the network and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8r3`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed. Apply the diffs with `git apply`, never retype them.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock), one at a time. Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/`, `.superpowers/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **`/research` and `/rocket` unchanged** in words and behaviour (the snapshots, the throttles, the give-backs, rehearsal mode).
2. **Who sees what** on the list and in every answer; no id, markdown or other server's report in the JSON.
3. **No Discord call from a GET**; batched reads.
4. **The order of checks** on every POST: per-address limit and CSRF before the body, refusals uncounted, the commands' windows shared.

## Tasks

### Task 1: 8R-3 task 1: research and Rocket reports as one code path each

Prototype commit: `12136f424a4df742a6decd4b74d68d588f0fd696`

What /research report and /rocket report do beyond reading the
interaction is a function the commands call and the map will:
reportResearchAs and reportRocketAs, with stopsByKey (the stops a menu
or the map names by key, Pine's own among them), takeBackAs for
/research remove and /rocket remove, and the hideout question's words.
The answers' words are researchWords and rocketWords with the caller's
channel namer; researchAnswer and rocketAnswer wrap them and stay the
same messages (inline snapshots guard them).

**Files:**

```
 src/commands/research/research-report.test.ts | 172 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/research/research-report.ts      | 178 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/research/research.ts             | 151 ++++++++++++++++++--------------------------------------
 src/commands/rocket/rocket-report.test.ts     | 132 +++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/rocket/rocket-report.ts          | 125 ++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/rocket/rocket.ts                 | 131 ++++++++++++++++++++----------------------------
 src/render/research.test.ts                   | 142 +++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/render/research.ts                        |  59 ++++++++++++++++------
 src/render/rocket.test.ts                     | 170 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/render/rocket.ts                          |  81 ++++++++++++++++++------------
 10 files changed, 1110 insertions(+), 231 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/research/research-report.test.ts src/commands/rocket/rocket-report.test.ts src/render/research.test.ts src/render/rocket.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 12136f424a4df742a6decd4b74d68d588f0fd696 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-3 task 1: research and Rocket reports as one code path each`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/research/research-report.test.ts b/src/commands/research/research-report.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..889df2fcd7164c68408e87479658f159fa7611d6
--- /dev/null
+++ b/src/commands/research/research-report.test.ts
@@ -0,0 +1,172 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
+import { OTHER_GUILD_ID, OTHER_GUILD_ROW, WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { pageTask } from '../../../test/support/research.js';
+import { MemoryStopReports } from '../../../test/support/stop-reports.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
+import { wayspotsWith } from '../../../test/support/wayspots.js';
+import type { PineStop } from '../../domain/stops/pine-stop.js';
+import type { WayspotRow } from '../../domain/wayspots/kept.js';
+import { researchWords } from '../../render/research.js';
+import { Rehearsal } from '../../services/rehearsal.js';
+import { StopReportService } from '../../services/stop-reports.js';
+import { readTask } from './research-input.js';
+import {
+  NOT_YOUR_REPORT,
+  NOTHING_LEFT,
+  REPORT_CHANGED,
+  reportResearchAs,
+  reporterNamed,
+  stopsByKey,
+  takeBackAs,
+} from './research-report.js';
+
+const ASH = { id: '200000000000000061', name: 'Ash' };
+const MISTY = { id: '200000000000000062', name: 'Misty' };
+const DRAGON = pageTask('Catch a Dragon-type Pokémon');
+
+/** Stops in West, and a power spot. */
+const STOPS: WayspotRow[] = [
+  keptRow(1, { title: 'Yellow Mural', lat: 40.06, lon: -80.06, address: null }),
+  keptRow(2, { title: 'Paititi Inti', lat: 40.061, lon: -80.06, address: null }),
+  keptRow(5, { title: 'Library Garden', kind: 'powerspot', lat: 40.0502, lon: -80.0502 }),
+];
+
+/** A stop of Pine's own of a server, in West's outline (North's too, another server's). */
+const sponsored = (id: number, serverId: string): PineStop => ({
+  id,
+  serverId,
+  name: `Coffee Corner ${String(id)}`,
+  lat: 40.0505,
+  lon: -80.05,
+  address: '12 Market Street',
+  createdBy: '200000000000000051',
+  createdAt: 5_000,
+  updatedBy: '200000000000000051',
+  updatedAt: 6_000,
+});
+
+// Noon in Pittsburgh: a report never meets a real midnight.
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 22, 16) });
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+async function setup() {
+  const { wayspots } = await wayspotsWith(STOPS);
+  wayspots.setPineStops([
+    { stop: sponsored(1, FAKE_GUILD_ID), guildRow: 1 },
+    { stop: sponsored(2, OTHER_GUILD_ID), guildRow: OTHER_GUILD_ROW },
+  ]);
+  const store = new MemoryStopReports();
+  const { ctx } = createTestContext({ wayspots });
+  Object.assign(ctx, {
+    stopReports: new StopReportService({
+      store,
+      events: ctx.raidEvents,
+      zone: ctx.config.settings.timezone,
+      log: ctx.log,
+    }),
+  });
+  return { ctx, store };
+}
+
+describe('stopsByKey', () => {
+  it('gives this server’s PokéStops by their keys, each once, Pine’s own among them', async () => {
+    const { ctx } = await setup();
+    const stops = await stopsByKey(ctx, FAKE_GUILD_ID, [
+      wayspotId(2),
+      'pine-1',
+      wayspotId(2),
+      // A power spot, another server's stop of its own, and a key of nothing.
+      wayspotId(5),
+      'pine-2',
+      'nothing',
+    ]);
+    expect(stops.map((stop) => [stop.key, stop.name])).toEqual([
+      [wayspotId(2), 'Paititi Inti'],
+      ['pine-1', 'Coffee Corner 1'],
+    ]);
+    expect(stops[1]).toMatchObject({ address: '12 Market Street', lat: 40.0505, lon: -80.05 });
+    expect(await stopsByKey(ctx, OTHER_GUILD_ID, ['pine-1'])).toEqual([]);
+  });
+});
+
+describe('reportResearchAs', () => {
+  it('reports the task at the stops and gives the words’ view: the posts of its regions', async () => {
+    const { ctx, store } = await setup();
+    const stops = await stopsByKey(ctx, FAKE_GUILD_ID, [wayspotId(1), 'pine-1']);
+    const reported = await reportResearchAs(ctx, FAKE_GUILD_ID, {
+      stops,
+      subject: readTask(ctx, DRAGON.key, null),
+      reporter: ASH,
+    });
+    expect(reported.outcome.saved.map(({ report }) => report.stop.name)).toEqual([
+      'Yellow Mural',
+      'Coffee Corner 1',
+    ]);
+    expect(reported.view).toMatchObject({ channels: [WEST_CHANNEL], until: 'until midnight' });
+    expect(researchWords(reported.view, () => '#west').where).toBe(
+      'In the pinned post "Today at the stops" of #west, until midnight.',
+    );
+    expect(store.rows.size).toBe(2);
+  });
+
+  it('names no pinned post in rehearsal mode, which makes none', async () => {
+    const { ctx } = await setup();
+    Object.assign(ctx, {
+      rehearsal: new Rehearsal({ allowlist: [ASH.id], regions: ['west'], staffRoles: [] }),
+    });
+    const reported = await reportResearchAs(ctx, FAKE_GUILD_ID, {
+      stops: await stopsByKey(ctx, FAKE_GUILD_ID, [wayspotId(1)]),
+      subject: readTask(ctx, DRAGON.key, null),
+      reporter: ASH,
+    });
+    expect(researchWords(reported.view, () => '#west').where).toBe('It stands until midnight.');
+  });
+});
+
+describe('takeBackAs', () => {
+  it('takes back one’s own report, another’s only as staff, and nothing of one gone', async () => {
+    const { ctx, store } = await setup();
+    const { outcome } = await reportResearchAs(ctx, FAKE_GUILD_ID, {
+      stops: await stopsByKey(ctx, FAKE_GUILD_ID, [wayspotId(1)]),
+      subject: readTask(ctx, DRAGON.key, null),
+      reporter: ASH,
+    });
+    const id = outcome.saved[0]?.report.id ?? 0;
+    expect(await takeBackAs(ctx, FAKE_GUILD_ID, id, MISTY.id, false)).toMatchObject({
+      kind: 'not-yours',
+    });
+    expect(await takeBackAs(ctx, OTHER_GUILD_ID, id, ASH.id, false)).toEqual({ kind: 'gone' });
+    expect(store.rows.size).toBe(1);
+    expect(await takeBackAs(ctx, FAKE_GUILD_ID, id, MISTY.id, true)).toMatchObject({
+      kind: 'removed',
+      text: 'Took back **Catch a Dragon-type Pokémon** at **Yellow Mural**.',
+    });
+    expect(await takeBackAs(ctx, FAKE_GUILD_ID, id, ASH.id, false)).toEqual({ kind: 'gone' });
+    expect(store.rows.size).toBe(0);
+  });
+
+  it('keeps the words of the commands', () => {
+    expect(NOT_YOUR_REPORT).toBe('Only the member who reported it, or staff, can take that back.');
+    expect(REPORT_CHANGED).toBe(
+      'The report at that PokéStop changed meanwhile: nothing was taken back. Look again.',
+    );
+    expect(NOTHING_LEFT).toBe(
+      'There was nothing left to take back: the report has ended, was taken back, or was ' +
+        'replaced by a newer one.',
+    );
+  });
+});
+
+describe('reporterNamed', () => {
+  it('names a reporter by the name shown, else the account’s, cut to what is kept', () => {
+    expect(reporterNamed(ASH.id, 'Ash', 'ash99')).toEqual(ASH);
+    expect(reporterNamed(ASH.id, undefined, 'ash99')).toEqual({ id: ASH.id, name: 'ash99' });
+    expect(reporterNamed(ASH.id, 'x'.repeat(150), 'ash99').name.length).toBeLessThanOrEqual(100);
+  });
+});
diff --git a/src/commands/research/research-report.ts b/src/commands/research/research-report.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5e4a42702854c83ab2488c827aa158bf6f2c1335
--- /dev/null
+++ b/src/commands/research/research-report.ts
@@ -0,0 +1,178 @@
+import type { AppContext } from '../../app-context.js';
+import { wayspotAddressLine } from '../../domain/geo/wayfarer-address.js';
+import { cutWhole } from '../../domain/geo/place.js';
+import type { Reporter, ReportedStop, StopReport } from '../../domain/stops/report.js';
+import {
+  periodEndWords,
+  reportSubject,
+  stopLine,
+  type ResearchWordsView,
+} from '../../render/research.js';
+import type { ResearchOutcome, ResearchSubject } from '../../services/stop-reports.js';
+
+/*
+ * What `/research` does beyond reading its interaction (plan 8R-3; web.md's one code path per
+ * command, spec 3.5): the stops a report names by their keys, the report as the member and the
+ * view its words are made of, and taking a report back. `/research`, `/rocket` and the map call
+ * them; each words the outcome with its own namer.
+ */
+
+/** Said to a member who would take back another's report. */
+export const NOT_YOUR_REPORT = 'Only the member who reported it, or staff, can take that back.';
+
+/**
+ * Said where the report `/research remove` read at a stop was replaced or taken back before it
+ * was taken back (review A1): nothing is taken back.
+ */
+export const REPORT_CHANGED =
+  'The report at that PokéStop changed meanwhile: nothing was taken back. Look again.';
+
+/** Said where a Take back finds nothing: the report ended, was taken back or replaced. */
+export const NOTHING_LEFT =
+  'There was nothing left to take back: the report has ended, was taken back, or was ' +
+  'replaced by a newer one.';
+
+/** What a research report from a member reads and calls (`/research` and the map). */
+export type ResearchReporting = Pick<
+  AppContext,
+  'stopReports' | 'guilds' | 'regions' | 'wayspots' | 'config' | 'rehearsal'
+>;
+
+/** A reporter by id and the name shown (else the account's), cut to what is kept. */
+export function reporterNamed(id: string, name: string | undefined, fallback: string): Reporter {
+  return { id, name: cutWhole(name ?? fallback, 100) };
+}
+
+/** The channels of a server's regions that this server's channels are, by its row. */
+async function ownChannels(
+  ctx: Pick<AppContext, 'guilds' | 'regions'>,
+  serverId: string,
+): Promise<Set<string>> {
+  const row = await ctx.guilds.idFor(serverId);
+  return new Set(
+    ctx.regions
+      .all()
+      .filter((region) => row !== undefined && region.guildId === row)
+      .map((region) => region.channelId),
+  );
+}
+
+/**
+ * The PokéStops these keys name, as reports keep them, each once in the order given: a kept
+ * Wayspot of kind `stop` with a title, or a stop of Pine's own (`pine-<id>`), that lies in a
+ * region of this server. Any other key (gone, another kind, another server's) is left out.
+ */
+export async function stopsByKey(
+  ctx: Pick<AppContext, 'guilds' | 'regions' | 'wayspots'>,
+  serverId: string,
+  keys: readonly string[],
+): Promise<ReportedStop[]> {
+  const ours = await ownChannels(ctx, serverId);
+  return [...new Set(keys)].flatMap((key): ReportedStop[] => {
+    const wayspot = ctx.wayspots.byId(key);
+    if (
+      wayspot?.kind !== 'stop' ||
+      wayspot.title.trim() === '' ||
+      !ctx.wayspots.regionsOf(key).some((id) => ours.has(id))
+    ) {
+      return [];
+    }
+    const address = wayspotAddressLine(wayspot.address);
+    return [
+      {
+        key,
+        name: wayspot.title,
+        address: address === '' ? null : address,
+        image: wayspot.image,
+        lat: wayspot.lat,
+        lon: wayspot.lon,
+      },
+    ];
+  });
+}
+
+/** The channels of this server's regions the stops lie in, whose pinned posts show them. */
+async function postChannels(
+  ctx: Pick<AppContext, 'guilds' | 'regions' | 'wayspots'>,
+  serverId: string,
+  stops: readonly ReportedStop[],
+): Promise<string[]> {
+  const ours = await ownChannels(ctx, serverId);
+  return [
+    ...new Set(
+      stops.flatMap((stop) => ctx.wayspots.regionsOf(stop.key).filter((id) => ours.has(id))),
+    ),
+  ];
+}
+
+/** What a research report from a member is: the task, the stops (one to five), who reports. */
+export interface ResearchAsk {
+  stops: readonly ReportedStop[];
+  subject: ResearchSubject;
+  reporter: Reporter;
+}
+
+/** What came of it: the service's outcome, and the view its words are made of. */
+export interface ResearchReported {
+  outcome: ResearchOutcome;
+  view: ResearchWordsView;
+}
+
+/**
+ * `/research report` as the member (plan 8R-3: the command, "Same task at more stops…" and the
+ * map): the task at the stops (`StopReportService.reportResearch`, which tells the pinned posts
+ * and who wants a reward), and the view of the answer's words (`researchWords`): the region
+ * channels whose posts show it (none named in rehearsal mode, which makes no post) and until
+ * when. Throws what storing throws.
+ */
+export async function reportResearchAs(
+  ctx: ResearchReporting,
+  serverId: string,
+  ask: ResearchAsk,
+  also = false,
+): Promise<ResearchReported> {
+  const outcome = await ctx.stopReports.reportResearch({ serverId, ...ask });
+  const stops = outcome.saved.map(({ report }) => report.stop);
+  return {
+    outcome,
+    view: {
+      saved: outcome.saved,
+      channels: await postChannels(ctx, serverId, stops),
+      until: periodEndWords(outcome.period.end, Date.now(), ctx.config.settings.timezone),
+      // Rehearsal mode makes no pinned post (B10).
+      posts: ctx.rehearsal === undefined,
+      also,
+    },
+  };
+}
+
+/** What a report taken back was: `Took back **Catch 7 Pokémon** at **Yellow Mural**.` */
+export function tookBackWords(report: StopReport): string {
+  return `Took back **${reportSubject(report)}** at ${stopLine(report.stop)}.`;
+}
+
+/** What came of taking a report back. */
+export type TakenBackAs =
+  | { kind: 'removed'; report: StopReport; text: string }
+  | { kind: 'not-yours'; report: StopReport }
+  /** None of this server by that id stands (ended, taken back, replaced, or never was). */
+  | { kind: 'gone' };
+
+/**
+ * Takes back a report of a server by its id (plan 8R-3: `/research remove`, `/rocket remove` and
+ * the map): the member's own, or any for `staff`. A replacement is a report of its own, so a
+ * report replaced since it was read is `gone`, and nothing is taken back.
+ */
+export async function takeBackAs(
+  ctx: Pick<AppContext, 'stopReports'>,
+  serverId: string,
+  id: number,
+  by: string,
+  staff: boolean,
+): Promise<TakenBackAs> {
+  const { removed, notYours } = await ctx.stopReports.takeBack(serverId, [id], by, staff);
+  const [gone] = removed;
+  if (gone) return { kind: 'removed', report: gone, text: tookBackWords(gone) };
+  const [kept] = notYours;
+  return kept ? { kind: 'not-yours', report: kept } : { kind: 'gone' };
+}
diff --git a/src/commands/research/research.ts b/src/commands/research/research.ts
index 04613f3e1982d5dbdf6fdfad9f9562b6102872d5..351bf12c18fd07bd49d20413a0d2ffb2196884fc 100644
--- a/src/commands/research/research.ts
+++ b/src/commands/research/research.ts
@@ -14,7 +14,6 @@ import { answer, answerApart, showInPlace, v2Answer } from '../../discord/late-r
 import { memberInfo } from '../../discord/member-info.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
-import { wayspotAddressLine } from '../../domain/geo/wayfarer-address.js';
 import type { Reporter, ReportedStop, StopReport } from '../../domain/stops/report.js';
 import { streetOf } from '../../domain/search/wayspot-index.js';
 import {
@@ -24,12 +23,10 @@ import {
   reportSubject,
   researchAnswer,
   stopLine,
-  periodEndWords,
   type MoreStop,
 } from '../../render/research.js';
-import { cutWhole } from '../../domain/geo/place.js';
 import { textMessage } from '../../render/v2.js';
-import type { ResearchOutcome, ResearchSubject } from '../../services/stop-reports.js';
+import type { ResearchSubject } from '../../services/stop-reports.js';
 import { MAX_PLACE_TEXT, nearChoices } from '../place-option.js';
 import {
   namedStop,
@@ -43,6 +40,16 @@ import {
   STOP_OPTIONS,
   taskChoices,
 } from './research-input.js';
+import {
+  NOT_YOUR_REPORT,
+  NOTHING_LEFT,
+  REPORT_CHANGED,
+  reporterNamed,
+  reportResearchAs,
+  stopsByKey,
+  takeBackAs,
+  type ResearchReported,
+} from './research-report.js';
 
 /** "Same task at more stops…" offers the stops within this many meters of the first one. */
 export const MORE_STOPS_METRES = 2_000;
@@ -57,42 +64,15 @@ export const REPORT_ENDED =
 /** Said where no field research is reported at a stop now. */
 export const NOTHING_AT_STOP = 'No field research is reported at that PokéStop now.';
 
-/**
- * Said where the report `/research remove` read at a stop was replaced or taken back before it
- * was taken back (review A1): nothing is taken back.
- */
-export const REPORT_CHANGED =
-  'The report at that PokéStop changed meanwhile: nothing was taken back. Look again.';
-
-/** Said to a member who would take back another's report. */
-export const NOT_YOUR_REPORT = 'Only the member who reported it, or staff, can take that back.';
+export { NOT_YOUR_REPORT, REPORT_CHANGED } from './research-report.js';
 
 /** The reporter of a use, by name as shown (cut to what is kept; also `/rocket`'s). */
 export function reporterOf(interaction: LocatedInteraction): Reporter {
-  return {
-    id: interaction.user.id,
-    name: cutWhole(memberInfo(interaction).name ?? interaction.user.username, 100),
-  };
-}
-
-/** The channels of this server's regions a stop lies in. */
-async function postChannels(
-  interaction: LocatedInteraction,
-  ctx: AppContext,
-  stops: readonly ReportedStop[],
-): Promise<string[]> {
-  const row = await ctx.guilds.idFor(guildIdOf(interaction));
-  const ours = new Set(
-    ctx.regions
-      .all()
-      .filter((region) => row !== undefined && region.guildId === row)
-      .map((region) => region.channelId),
+  return reporterNamed(
+    interaction.user.id,
+    memberInfo(interaction).name,
+    interaction.user.username,
   );
-  return [
-    ...new Set(
-      stops.flatMap((stop) => ctx.wayspots.regionsOf(stop.key).filter((id) => ours.has(id))),
-    ),
-  ];
 }
 
 /**
@@ -141,28 +121,29 @@ async function moreStops(
     }));
 }
 
-/** The answer of a report: the view of `researchAnswer` worked out for this use. */
+/**
+ * The answer of a report: its words (`reportResearchAs`'s view) with "Same task at more stops…"
+ * worked out for this use.
+ */
 async function answerOf(
   interaction: LocatedInteraction,
   ctx: AppContext,
-  outcome: ResearchOutcome,
+  { outcome, view }: ResearchReported,
   subject: ResearchSubject,
-  also = false,
 ) {
-  const stops = outcome.saved.map(({ report }) => report.stop);
-  const [first] = stops;
-  const now = Date.now();
+  const [first] = outcome.saved;
   return researchAnswer({
-    saved: outcome.saved,
-    channels: await postChannels(interaction, ctx, stops),
-    until: periodEndWords(outcome.period.end, now, ctx.config.settings.timezone),
-    // Rehearsal mode makes no pinned post (B10).
-    posts: ctx.rehearsal === undefined,
+    ...view,
     more:
       first === undefined
         ? []
-        : await moreStops(interaction, ctx, first, subject.subjectKey, outcome.period.key),
-    also,
+        : await moreStops(
+            interaction,
+            ctx,
+            first.report.stop,
+            subject.subjectKey,
+            outcome.period.key,
+          ),
   });
 }
 
@@ -255,13 +236,12 @@ const reportResearch: SubcommandPart = {
       interaction.options.getString('reward'),
     );
     const stops = await namedStops(interaction, ctx);
-    const outcome = await ctx.stopReports.reportResearch({
-      serverId: guildIdOf(interaction),
+    const reported = await reportResearchAs(ctx, guildIdOf(interaction), {
       stops,
       subject,
       reporter: reporterOf(interaction),
     });
-    await answer(interaction, v2Answer(await answerOf(interaction, ctx, outcome, subject)));
+    await answer(interaction, v2Answer(await answerOf(interaction, ctx, reported, subject)));
   },
   autocomplete: async (interaction, ctx) => {
     await interaction.respond(await researchChoices(interaction, ctx));
@@ -290,17 +270,17 @@ const removeResearch: SubcommandPart = {
     if (!report) throw new UserError(NOTHING_AT_STOP);
     // By its id, which never changes what it is (a replacement is a report of its own): one
     // replaced since it was read is gone, and nothing is taken back.
-    const { removed, notYours } = await ctx.stopReports.takeBack(
+    const taken = await takeBackAs(
+      ctx,
       serverId,
-      [report.id],
+      report.id,
       interaction.user.id,
       isStaff(interaction, ctx),
     );
-    const [gone] = removed;
-    if (!gone) throw new UserError(notYours.length > 0 ? NOT_YOUR_REPORT : REPORT_CHANGED);
-    await answer(interaction, {
-      content: `Took back **${reportSubject(gone)}** at ${stopLine(gone.stop)}.`,
-    });
+    if (taken.kind !== 'removed') {
+      throw new UserError(taken.kind === 'not-yours' ? NOT_YOUR_REPORT : REPORT_CHANGED);
+    }
+    await answer(interaction, { content: taken.text });
   },
   autocomplete: async (interaction, ctx) => {
     await interaction.respond(await researchChoices(interaction, ctx));
@@ -316,42 +296,6 @@ export const research = commandGroup({
   parts: [reportResearch, removeResearch],
 });
 
-/** The stops a menu picked, as reports keep them; one gone or of another server left out. */
-async function pickedStops(
-  interaction: LocatedInteraction,
-  ctx: AppContext,
-  keys: readonly string[],
-): Promise<ReportedStop[]> {
-  const row = await ctx.guilds.idFor(guildIdOf(interaction));
-  const ours = new Set(
-    ctx.regions
-      .all()
-      .filter((region) => row !== undefined && region.guildId === row)
-      .map((region) => region.channelId),
-  );
-  return keys.flatMap((key): ReportedStop[] => {
-    const wayspot = ctx.wayspots.byId(key);
-    if (
-      wayspot?.kind !== 'stop' ||
-      wayspot.title.trim() === '' ||
-      !ctx.wayspots.regionsOf(key).some((id) => ours.has(id))
-    ) {
-      return [];
-    }
-    const address = wayspotAddressLine(wayspot.address);
-    return [
-      {
-        key,
-        name: wayspot.title,
-        address: address === '' ? null : address,
-        image: wayspot.image,
-        lat: wayspot.lat,
-        lon: wayspot.lon,
-      },
-    ];
-  });
-}
-
 /**
  * The controls of `/research report`'s answer (kind `research`): "Same task at more stops…"
  * (`research:<report id>:more`, a menu of stop keys: the task of that report at the stops picked,
@@ -377,16 +321,16 @@ export const researchControls: ComponentHandler = {
     if (base?.kind !== 'research' || base.periodKey !== ctx.stopReports.period().key) {
       throw new UserError(REPORT_ENDED, { givesBack: true });
     }
-    const stops = await pickedStops(interaction, ctx, interaction.values);
+    const stops = await stopsByKey(ctx, serverId, interaction.values);
     if (stops.length === 0) throw new UserError(REPORT_ENDED, { givesBack: true });
     const subject: ResearchSubject = { subjectKey: base.subjectKey, research: base.research };
-    const outcome = await ctx.stopReports.reportResearch({
+    const reported = await reportResearchAs(
+      ctx,
       serverId,
-      stops,
-      subject,
-      reporter: reporterOf(interaction),
-    });
-    await answerApart(interaction, await answerOf(interaction, ctx, outcome, subject, true));
+      { stops, subject, reporter: reporterOf(interaction) },
+      true,
+    );
+    await answerApart(interaction, await answerOf(interaction, ctx, reported, subject));
   },
   async button(interaction, id, ctx) {
     const ids = [id.id, ...id.args];
@@ -405,8 +349,7 @@ export const researchControls: ComponentHandler = {
       interaction,
       textMessage(RESEARCH_COLOUR, [
         first === undefined
-          ? 'There was nothing left to take back: the report has ended, was taken back, or was ' +
-            'replaced by a newer one.'
+          ? NOTHING_LEFT
           : `Took back **${reportSubject(first)}** at ` +
             `${removed.map((report) => stopLine(report.stop)).join(', ')}.`,
       ]),
diff --git a/src/commands/rocket/rocket-report.test.ts b/src/commands/rocket/rocket-report.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..15a31133ece17252db6e9dabb06f0311f7d23f36
--- /dev/null
+++ b/src/commands/rocket/rocket-report.test.ts
@@ -0,0 +1,132 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { FakePartyGateway, missingPermissions } from '../../../test/support/fake-gateway.js';
+import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
+import { WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { feedChoice } from '../../../test/support/rocket.js';
+import { MemoryGruntMessages } from '../../../test/support/rocket-store.js';
+import { MemoryStopReports } from '../../../test/support/stop-reports.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
+import { wayspotsWith } from '../../../test/support/wayspots.js';
+import { rocketWords } from '../../render/rocket.js';
+import { GruntMessageService } from '../../services/grunt-messages.js';
+import { RocketService } from '../../services/rocket-reports.js';
+import { StopReportService } from '../../services/stop-reports.js';
+import { stopsByKey } from '../research/research-report.js';
+import { hideoutQuestion, reportRocketAs } from './rocket-report.js';
+
+const ASH = { id: '200000000000000061', name: 'Ash' };
+const MISTY = { id: '200000000000000062', name: 'Misty' };
+const WEST = (id: string) => (id === WEST_CHANNEL ? '#west' : '?');
+
+// Noon in Pittsburgh on 2026-10-22: a report never meets a real midnight.
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 22, 16) });
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+async function setup() {
+  const { wayspots } = await wayspotsWith([
+    keptRow(1, { title: 'Yellow Mural', lat: 40.06, lon: -80.06, address: null }),
+  ]);
+  const store = new MemoryStopReports();
+  const gateway = new FakePartyGateway();
+  const { ctx } = createTestContext({ wayspots });
+  const stopReports = new StopReportService({
+    store,
+    events: ctx.raidEvents,
+    zone: ctx.config.settings.timezone,
+    log: ctx.log,
+  });
+  const messages = new GruntMessageService({
+    gateway,
+    store: new MemoryGruntMessages(),
+    reports: stopReports,
+    log: ctx.log,
+    setTimer: () => () => undefined,
+  });
+  Object.assign(ctx, {
+    stopReports,
+    rocket: new RocketService({
+      reports: stopReports,
+      messages,
+      regions: ctx.regions,
+      guilds: ctx.guilds,
+      log: ctx.log,
+    }),
+  });
+  const [stop] = await stopsByKey(ctx, FAKE_GUILD_ID, [wayspotId(1)]);
+  if (!stop) throw new Error('no stop');
+  const report = (who: string, reporter = ASH, replacing?: number) =>
+    reportRocketAs(
+      ctx,
+      FAKE_GUILD_ID,
+      { choice: feedChoice(who), stop, reporter, ...(replacing ? { replacing } : {}) },
+      WEST,
+    );
+  return { ctx, store, gateway, report };
+}
+
+describe('reportRocketAs', () => {
+  it('reports a grunt, posted in its region, and gives the view of its words', async () => {
+    const { report, gateway } = await setup();
+    const reported = await report('grunt:water');
+    if (reported.kind !== 'reported') throw new Error(reported.kind);
+    expect(rocketWords(reported.view, WEST).where).toMatch(
+      /^Posted in #west; it goes away <t:\d+:R>\.$/,
+    );
+    expect(gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
+  });
+
+  it('gives the grunt that stands, with its messages, for the same grunt again', async () => {
+    const { report, gateway } = await setup();
+    await report('grunt:water');
+    const again = await report('grunt:water', MISTY);
+    expect(again).toMatchObject({
+      kind: 'already',
+      standing: { subjectKey: 'grunt:water', reporter: ASH },
+      posted: [{ channelId: WEST_CHANNEL }],
+    });
+    expect(gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
+  });
+
+  it('asks before a grunt replaces a hideout, and replaces the hideout it was told', async () => {
+    const { report } = await setup();
+    const arlo = await report('leader:arlo');
+    if (arlo.kind !== 'reported') throw new Error(arlo.kind);
+    expect(await report('grunt:water')).toMatchObject({
+      kind: 'asks',
+      standing: { id: arlo.report.id },
+    });
+    const replaced = await report('grunt:water', ASH, arlo.report.id);
+    expect(replaced).toMatchObject({
+      kind: 'reported',
+      view: { replaced: { id: arlo.report.id } },
+    });
+  });
+
+  it('says in the caller’s words where a grunt could not be posted, the hideout back', async () => {
+    const { report, gateway, store } = await setup();
+    const arlo = await report('leader:arlo');
+    if (arlo.kind !== 'reported') throw new Error(arlo.kind);
+    gateway.failing.set('sendMessage', missingPermissions('POST'));
+    expect(await report('grunt:water', ASH, arlo.report.id)).toEqual({
+      kind: 'unposted',
+      text:
+        'I could not post the grunt in #west, so nothing was reported; **Arlo** stands as ' +
+        'before. Try again in a moment.',
+    });
+    expect([...store.rows.values()].map((one) => one.subjectKey)).toEqual(['leader:arlo']);
+  });
+});
+
+describe('hideoutQuestion', () => {
+  it('asks whether a grunt replaces the hideout of the day', () => {
+    expect(hideoutQuestion('Arlo', 'Water-type grunt')).toBe(
+      'Arlo was reported here today, and a hideout keeps grunts away all day. Replace Arlo’s ' +
+        'report with the Water-type grunt?',
+    );
+  });
+});
diff --git a/src/commands/rocket/rocket-report.ts b/src/commands/rocket/rocket-report.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fa08acb577f55068c4b3255418216c80367773f3
--- /dev/null
+++ b/src/commands/rocket/rocket-report.ts
@@ -0,0 +1,125 @@
+import type { AppContext } from '../../app-context.js';
+import type { RocketChoice } from '../../domain/rocket/lineups.js';
+import type { Reporter, ReportedStop, RocketReport } from '../../domain/stops/report.js';
+import { periodEndWords, type ChannelNamer } from '../../render/research.js';
+import type { RocketAnswerView } from '../../render/rocket.js';
+import { plain } from '../../render/text.js';
+import type { PostedGrunt } from '../../services/grunt-messages.js';
+import { rocketSubject } from '../../services/rocket-reports.js';
+import { isHideoutReport } from '../../services/stop-reports.js';
+
+/*
+ * What `/rocket report` does beyond reading its interaction (plan 8R-3; web.md's one code path per
+ * command, spec 3.5): the report as the member through `RocketService` (the one way to report:
+ * the grunt's messages, the DMs), each outcome for the caller to word or answer. `/rocket`, its
+ * dialog's Submit and the map call it.
+ */
+
+/** What a Rocket report from a member reads and calls (`/rocket` and the map). */
+export type RocketReporting = Pick<AppContext, 'rocket' | 'rehearsal' | 'config'>;
+
+/**
+ * What a Rocket report from a member is: who (a choice of the lineups), at which stop, who
+ * reports, and the hideout the member said Replace to (`replacing`, its report's id).
+ */
+export interface RocketAsk {
+  choice: RocketChoice;
+  stop: ReportedStop;
+  reporter: Reporter;
+  replacing?: number;
+}
+
+/** What came of a Rocket report, for the caller to answer. */
+export type RocketAs =
+  /** Reported: the report and the view of its answer's words (`rocketWords`). */
+  | { kind: 'reported'; report: RocketReport; view: RocketAnswerView }
+  /** The same grunt stands (Matt's answer 4), with its messages for a link. */
+  | { kind: 'already'; standing: RocketReport; posted: PostedGrunt[] }
+  /**
+   * A hideout stands at the stop that the member did not say Replace to (one reported meanwhile,
+   * or another since the question): asked again, or refused; the use goes back.
+   */
+  | { kind: 'asks'; standing: RocketReport }
+  /**
+   * None of the member's doing, worded by the caller's namer: the grunt could be posted in none
+   * of its region channels (`unposted`), or a newer report took its place while it was posted
+   * (`overtaken`). Nothing is reported; the use goes back.
+   */
+  | { kind: 'unposted' | 'overtaken'; text: string };
+
+/**
+ * The question before a grunt replaces a hideout (design 5.2, 9.4): the dialog's words on
+ * Discord, the map's 422 (plan 8R-3). Names as shown, made plain.
+ */
+export function hideoutQuestion(hideout: string, grunt: string): string {
+  const there = plain(hideout);
+  return (
+    `${there} was reported here today, and a hideout keeps grunts away all day. Replace ` +
+    `${there}’s report with the ${plain(grunt)}?`
+  );
+}
+
+/**
+ * `/rocket report` as the member (plan 8R-3: the command, its dialog's Submit and the map): the
+ * report through `ctx.rocket.report` (decided with the stop's row locked; a grunt's messages
+ * posted, who wants it told), and each outcome for the caller: the view of the answer's words,
+ * the grunt that stands already, the hideout to ask about, or what went wrong in words whose
+ * channels `channel` names. Throws what storing throws.
+ */
+export async function reportRocketAs(
+  ctx: RocketReporting,
+  serverId: string,
+  ask: RocketAsk,
+  channel: ChannelNamer,
+): Promise<RocketAs> {
+  const outcome = await ctx.rocket.report({
+    serverId,
+    stop: ask.stop,
+    subject: rocketSubject(ask.choice),
+    reporter: ask.reporter,
+    ...(ask.replacing === undefined ? {} : { replacing: ask.replacing }),
+  });
+  switch (outcome.kind) {
+    case 'asks':
+      return { kind: 'asks', standing: outcome.standing };
+    case 'already':
+      return { kind: 'already', standing: outcome.standing, posted: outcome.posted };
+    case 'unposted': {
+      // Taken back by the service (fix A5). What it had replaced: a hideout is back, a grunt is
+      // gone for good (fix R2).
+      const before = outcome.restored
+        ? `; **${plain(outcome.restored.rocket.name)}** stands as before`
+        : outcome.lost
+          ? `, and the **${plain(outcome.lost.rocket.name)}** reported before was taken off`
+          : '';
+      return {
+        kind: 'unposted',
+        text:
+          `I could not post the grunt in ${outcome.channels.map(channel).join(', ')}, ` +
+          `so nothing was reported${before}. Try again in a moment.`,
+      };
+    }
+    case 'overtaken':
+      // Replaced while its messages went out (fix F3).
+      return {
+        kind: 'overtaken',
+        text:
+          `A newer report at that PokéStop took the place of your **${plain(ask.choice.name)}** ` +
+          'while it was being posted, so it was not reported.',
+      };
+    case 'reported':
+      return {
+        kind: 'reported',
+        report: outcome.report,
+        view: {
+          report: outcome.report,
+          replaced: outcome.replaced,
+          hideout: isHideoutReport(outcome.report),
+          channels: outcome.channels,
+          posted: outcome.posted,
+          rehearsal: ctx.rehearsal !== undefined,
+          until: periodEndWords(outcome.report.endsAt, Date.now(), ctx.config.settings.timezone),
+        },
+      };
+  }
+}
diff --git a/src/commands/rocket/rocket.ts b/src/commands/rocket/rocket.ts
index 0b30deff87489e34592b3f291ce73530eb9aaffe..9537f938638ef3d3d28c5f61283c7c14217a17ce 100644
--- a/src/commands/rocket/rocket.ts
+++ b/src/commands/rocket/rocket.ts
@@ -18,7 +18,7 @@ import { MEMBER_WRITE_THROTTLE, type Throttle } from '../../discord/throttle.js'
 import { isHideout, parseRocketKey, type RocketChoice } from '../../domain/rocket/lineups.js';
 import type { ReportedStop, RocketReport } from '../../domain/stops/report.js';
 import { postLink } from '../../render/notify-dm.js';
-import { periodEndWords, reportSubject, stopLine } from '../../render/research.js';
+import { DISCORD_CHANNEL } from '../../render/research.js';
 import {
   alreadyReported,
   ROCKET_ACTIONS,
@@ -29,11 +29,18 @@ import {
 import { plain } from '../../render/text.js';
 import { textMessage } from '../../render/v2.js';
 import { PendingRequests } from '../../services/pending-requests.js';
-import { rocketSubject } from '../../services/rocket-reports.js';
 import { isHideoutReport } from '../../services/stop-reports.js';
 import { MAX_PLACE_TEXT, nearChoices } from '../place-option.js';
-import { NOT_YOUR_REPORT, REPORT_CHANGED, reporterOf } from '../research/research.js';
+import { reporterOf } from '../research/research.js';
 import { namedStop, NO_STOPS_HERE } from '../research/research-input.js';
+import {
+  NOT_YOUR_REPORT,
+  NOTHING_LEFT,
+  REPORT_CHANGED,
+  takeBackAs,
+  tookBackWords,
+} from '../research/research-report.js';
+import { hideoutQuestion, reportRocketAs } from './rocket-report.js';
 import {
   NOT_A_ROCKET_STOP,
   readWho,
@@ -109,13 +116,10 @@ const requireRocketReport: Guard = async (interaction, ctx) => {
 
 /** The dialog that asks before a grunt replaces a hideout (design 5.2, 9.4). */
 function replaceDialog(token: string, ask: WaitingAsk) {
-  const there = plain(ask.hideout.rocket.name);
   return dialog({
     customId: encodeCustomId({ kind: ROCKET_KIND, id: token, action: ROCKET_ACTIONS.replace }),
     title: 'Replace a hideout?',
-    text:
-      `${there} was reported here today, and a hideout keeps grunts away all day. Replace ` +
-      `${there}’s report with the ${plain(ask.choice.name)}?\n\nSubmit replaces it.`,
+    text: `${hideoutQuestion(ask.hideout.rocket.name, ask.choice.name)}\n\nSubmit replaces it.`,
   });
 }
 
@@ -131,66 +135,42 @@ async function report(
   replacing: number | undefined,
 ): Promise<void> {
   const serverId = guildIdOf(interaction);
-  const outcome = await ctx.rocket.report({
+  const outcome = await reportRocketAs(
+    ctx,
     serverId,
-    stop: ask.stop,
-    subject: rocketSubject(ask.choice),
-    reporter: reporterOf(interaction),
-    ...(replacing === undefined ? {} : { replacing }),
-  });
-  if (outcome.kind === 'asks') {
-    throw new UserError(
-      replacing === undefined
-        ? `**${plain(outcome.standing.rocket.name)}** was reported at that PokéStop just now, ` +
-            'and a hideout keeps grunts away all day. Use `/rocket report` again to replace it.'
-        : HIDEOUT_CHANGED,
-      { givesBack: true },
-    );
-  }
-  if (outcome.kind === 'unposted') {
-    // Taken back by the service (fix A5): none of the member's doing. What it had replaced: a
-    // hideout is back, a grunt is gone for good (fix R2).
-    const before = outcome.restored
-      ? `; **${plain(outcome.restored.rocket.name)}** stands as before`
-      : outcome.lost
-        ? `, and the **${plain(outcome.lost.rocket.name)}** reported before was taken off`
-        : '';
-    throw new UserError(
-      `I could not post the grunt in ${outcome.channels.map((id) => `<#${id}>`).join(', ')}, ` +
-        `so nothing was reported${before}. Try again in a moment.`,
-      { givesBack: true },
-    );
-  }
-  if (outcome.kind === 'overtaken') {
-    // Replaced while its messages went out (fix F3): none of the member's doing.
-    throw new UserError(
-      `A newer report at that PokéStop took the place of your **${plain(ask.choice.name)}** ` +
-        'while it was being posted, so it was not reported.',
-      { givesBack: true },
-    );
-  }
-  if (outcome.kind === 'already') {
-    const [message] = outcome.posted;
-    const link =
-      message === undefined ? undefined : postLink(serverId, message.channelId, message.messageId);
-    await answer(interaction, { content: alreadyReported(outcome.standing, link) });
-    return;
-  }
-  const hideout = isHideoutReport(outcome.report);
-  await answer(
-    interaction,
-    v2Answer(
-      rocketAnswer({
-        report: outcome.report,
-        replaced: outcome.replaced,
-        hideout,
-        channels: outcome.channels,
-        posted: outcome.posted,
-        rehearsal: ctx.rehearsal !== undefined,
-        until: periodEndWords(outcome.report.endsAt, Date.now(), ctx.config.settings.timezone),
-      }),
-    ),
+    {
+      choice: ask.choice,
+      stop: ask.stop,
+      reporter: reporterOf(interaction),
+      ...(replacing === undefined ? {} : { replacing }),
+    },
+    DISCORD_CHANNEL,
   );
+  switch (outcome.kind) {
+    case 'asks':
+      throw new UserError(
+        replacing === undefined
+          ? `**${plain(outcome.standing.rocket.name)}** was reported at that PokéStop just now, ` +
+              'and a hideout keeps grunts away all day. Use `/rocket report` again to replace it.'
+          : HIDEOUT_CHANGED,
+        { givesBack: true },
+      );
+    case 'unposted':
+    case 'overtaken':
+      // None of the member's doing: the use goes back.
+      throw new UserError(outcome.text, { givesBack: true });
+    case 'already': {
+      const [message] = outcome.posted;
+      const link =
+        message === undefined
+          ? undefined
+          : postLink(serverId, message.channelId, message.messageId);
+      await answer(interaction, { content: alreadyReported(outcome.standing, link) });
+      return;
+    }
+    case 'reported':
+      await answer(interaction, v2Answer(rocketAnswer(outcome.view)));
+  }
 }
 
 /**
@@ -327,17 +307,17 @@ const removeRocket: SubcommandPart = {
     const standing = await ctx.stopReports.rocketAt(serverId, stop.key);
     if (!standing) throw new UserError(NOTHING_AT_STOP);
     // By its id (a replacement is a report of its own): one replaced since is not taken back.
-    const { removed, notYours } = await ctx.stopReports.takeBack(
+    const taken = await takeBackAs(
+      ctx,
       serverId,
-      [standing.id],
+      standing.id,
       interaction.user.id,
       isStaff(interaction, ctx),
     );
-    const [gone] = removed;
-    if (!gone) throw new UserError(notYours.length > 0 ? NOT_YOUR_REPORT : REPORT_CHANGED);
-    await answer(interaction, {
-      content: `Took back **${reportSubject(gone)}** at ${stopLine(gone.stop)}.`,
-    });
+    if (taken.kind !== 'removed') {
+      throw new UserError(taken.kind === 'not-yours' ? NOT_YOUR_REPORT : REPORT_CHANGED);
+    }
+    await answer(interaction, { content: taken.text });
   },
   autocomplete: async (interaction, ctx) => {
     const focused = interaction.options.getFocused(true);
@@ -401,12 +381,7 @@ export const rocketControls: ComponentHandler = {
     const [first] = removed;
     await showInPlace(
       interaction,
-      textMessage(ROCKET_COLOUR, [
-        first === undefined
-          ? 'There was nothing left to take back: the report has ended, was taken back, or was ' +
-            'replaced by a newer one.'
-          : `Took back **${reportSubject(first)}** at ${stopLine(first.stop)}.`,
-      ]),
+      textMessage(ROCKET_COLOUR, [first === undefined ? NOTHING_LEFT : tookBackWords(first)]),
     );
   },
   async modal(interaction, id, ctx) {
diff --git a/src/render/research.test.ts b/src/render/research.test.ts
index 3d7eac5882bb7e5b58f15de58eb8c6a934a57fa3..4a1057912bf392ebf183ea694f39407859189c1a 100644
--- a/src/render/research.test.ts
+++ b/src/render/research.test.ts
@@ -1,6 +1,146 @@
 import { DateTime } from 'luxon';
 import { describe, expect, it } from 'vitest';
-import { periodEndWords } from './research.js';
+import { textOf } from '../../test/support/messages.js';
+import { researchReport, reportedStop } from '../../test/support/stop-report-cases.js';
+import type { ResearchReport } from '../domain/stops/report.js';
+import {
+  periodEndWords,
+  researchAnswer,
+  researchWords,
+  type ResearchAnswerView,
+} from './research.js';
+
+const WEST = '100000000000000011';
+const EAST = '100000000000000012';
+
+/** A task at two stops, the first in the place of another task, shown in West's and East's posts. */
+function answerView(): ResearchAnswerView {
+  const report = (id: number, n: number): ResearchReport => ({
+    ...researchReport({ stop: reportedStop(n) }),
+    id,
+  });
+  const before: ResearchReport = {
+    ...researchReport({
+      subjectKey: 'typed:0000000000000001',
+      research: { text: 'Catch 7 *Pokémon*', category: null, rewards: [], typed: true },
+    }),
+    id: 3,
+  };
+  return {
+    saved: [
+      { report: report(7, 1), replaced: before },
+      { report: report(8, 2), replaced: undefined },
+    ],
+    channels: [WEST, EAST],
+    until: 'until midnight',
+    more: [{ key: 'b'.repeat(32), name: 'Little Bench', metres: 1_100, where: 'Main Street' }],
+  };
+}
+
+describe('researchAnswer', () => {
+  it('is the message it was before its words were shared with the map (plan 8R-3)', () => {
+    expect(researchAnswer(answerView())).toMatchInlineSnapshot(`
+      {
+        "components": [
+          {
+            "accent_color": 10181046,
+            "components": [
+              {
+                "content": "### Field research reported
+      **Make 2 Excellent Throws** · Dratini
+      - **Yellow Mural 1** · Market Street (was: Catch 7 \\*Pokémon\\*)
+      - **Yellow Mural 2** · Market Street",
+                "type": 10,
+              },
+              {
+                "content": "-# In the pinned post "Today at the stops" of <#100000000000000011>, <#100000000000000012>, until midnight.",
+                "type": 10,
+              },
+              {
+                "components": [
+                  {
+                    "custom_id": "research:7:more",
+                    "max_values": 1,
+                    "min_values": 1,
+                    "options": [
+                      {
+                        "description": "1.1 km away · Main Street",
+                        "label": "Little Bench",
+                        "value": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
+                      },
+                    ],
+                    "placeholder": "Same task at more stops…",
+                    "type": 3,
+                  },
+                ],
+                "type": 1,
+              },
+              {
+                "components": [
+                  {
+                    "custom_id": "research:7:back:8",
+                    "label": "Take back (2 stops)",
+                    "style": 4,
+                    "type": 2,
+                  },
+                ],
+                "type": 1,
+              },
+            ],
+            "type": 17,
+          },
+        ],
+        "v2": true,
+      }
+    `);
+  });
+
+  it('says what it said before in every other case: no posts, no region, also, again (plan 8R-3)', () => {
+    const view = answerView();
+    const [first, second] = view.saved;
+    if (!first || !second) throw new Error('two reports');
+    // The same task again at the first stop, as "Same task at more stops…" answers.
+    const again: ResearchAnswerView = {
+      ...view,
+      saved: [{ report: first.report, replaced: { ...first.report, id: 2 } }, second],
+      also: true,
+      posts: false,
+    };
+    expect(textOf(researchAnswer(again))).toMatchInlineSnapshot(`
+      "### Also reported
+      **Make 2 Excellent Throws** · Dratini
+      - **Yellow Mural 1** · Market Street (again)
+      - **Yellow Mural 2** · Market Street
+      -# It stands until midnight."
+    `);
+    expect(textOf(researchAnswer({ ...view, channels: [] }))).toMatchInlineSnapshot(`
+      "### Field research reported
+      **Make 2 Excellent Throws** · Dratini
+      - **Yellow Mural 1** · Market Street (was: Catch 7 \\*Pokémon\\*)
+      - **Yellow Mural 2** · Market Street
+      -# It lies in no region now, so no post shows it; it stands until midnight."
+    `);
+  });
+});
+
+describe('researchWords', () => {
+  it('names the channels through the namer the caller gives', () => {
+    const names = new Map([
+      [WEST, '#west'],
+      [EAST, '#east'],
+    ]);
+    const words = researchWords(answerView(), (id) => names.get(id) ?? '?');
+    expect(words.head).toBe(
+      '### Field research reported\n' +
+        '**Make 2 Excellent Throws** · Dratini\n' +
+        '- **Yellow Mural 1** · Market Street (was: Catch 7 \\*Pokémon\\*)\n' +
+        '- **Yellow Mural 2** · Market Street',
+    );
+    expect(words.where).toBe(
+      'In the pinned post "Today at the stops" of #west, #east, until midnight.',
+    );
+  });
+});
 
 const ZONE = 'America/New_York';
 const at = (local: string): number => DateTime.fromISO(local, { zone: ZONE }).toMillis();
diff --git a/src/render/research.ts b/src/render/research.ts
index 246d8202e10ca7f21e015c2910daf712279d4f17..70b31a492a894feb214d925ae94b40facc5e9009 100644
--- a/src/render/research.ts
+++ b/src/render/research.ts
@@ -81,43 +81,51 @@ export interface MoreStop {
   where: string | undefined;
 }
 
-/** What the answer of a research report shows. */
-export interface ResearchAnswerView {
+/** What the words of a research report's answer say (`researchWords`), on Discord or the map. */
+export interface ResearchWordsView {
   /** The reports made, one per stop, in the order given; with the report each replaced. */
   saved: readonly { report: ResearchReport; replaced: ResearchReport | undefined }[];
   /** The region channels whose pinned posts show them. */
   channels: readonly string[];
   /** When they end, as shown (`periodEndWords`). */
   until: string;
-  /** The stops near the first that have no report of this task in the period (25 at most). */
-  more: readonly MoreStop[];
   /** `also`: the answer of "Same task at more stops…", which says "Also reported". */
   also?: boolean;
   /** Whether pinned posts are made (not in rehearsal mode: then none is named). */
   posts?: boolean;
 }
 
+/** What the answer of a research report shows. */
+export interface ResearchAnswerView extends ResearchWordsView {
+  /** The stops near the first that have no report of this task in the period (25 at most). */
+  more: readonly MoreStop[];
+}
+
+/** A channel as a caller's answer names it: `<#id>` on Discord, `#west` on the map. */
+export type ChannelNamer = (channelId: string) => string;
+
+/** A channel as Discord shows it: a mention. */
+export const DISCORD_CHANNEL: ChannelNamer = (channelId) => `<#${channelId}>`;
+
 /** A distance as a choice's description shows it. */
 function distance(metres: number): string {
   return metres < 1_000 ? `${String(Math.round(metres))} m` : `${(metres / 1_000).toFixed(1)} km`;
 }
 
 /**
- * The answer of a research report (plan 8R-1; design 4.3), for the reporter alone: the task and
- * its rewards, each stop (with the task it replaced: "was: Catch 7 Pokémon"; "again" for the
- * same task), where it shows and until when, "Same task at more stops…" (a menu of the stops
- * near the first one without this task, up to five at once) and "Take back" (every report of
- * the answer whose id fits the custom id; the rest by `/research remove`).
+ * The words of a research report's answer (plan 8R-3: shared by `/research` and the map): the
+ * task and its rewards, each stop (with the task it replaced: "was: Catch 7 Pokémon"; "again"
+ * for the same task) as `head`, and where it shows and until when as `where`, the region
+ * channels named by `channel`.
  */
-export function researchAnswer(view: ResearchAnswerView): V2Message {
+export function researchWords(
+  view: ResearchWordsView,
+  channel: ChannelNamer,
+): { head: string; where: string } {
   const [first] = view.saved;
   if (!first) throw new Error('a research answer needs a report');
   const { research } = first.report;
   const rewards = rewardWords(research.rewards);
-  const head = [
-    `### ${view.also === true ? 'Also reported' : 'Field research reported'}`,
-    `**${taskText(research)}**${rewards === '' ? '' : ` · ${rewards}`}`,
-  ].join('\n');
   const lines = view.saved.map(({ report, replaced }) => {
     const before =
       replaced === undefined
@@ -127,14 +135,33 @@ export function researchAnswer(view: ResearchAnswerView): V2Message {
           : ` (was: ${taskText(replaced.research, 60)})`;
     return `- ${stopLine(report.stop)}${before}`;
   });
+  const head = [
+    `### ${view.also === true ? 'Also reported' : 'Field research reported'}`,
+    `**${taskText(research)}**${rewards === '' ? '' : ` · ${rewards}`}`,
+    ...lines,
+  ].join('\n');
   const where =
     view.posts === false
       ? `It stands ${view.until}.`
       : view.channels.length === 0
         ? `It lies in no region now, so no post shows it; it stands ${view.until}.`
-        : `In the pinned post "Today at the stops" of ${view.channels.map((id) => `<#${id}>`).join(', ')}, ${view.until}.`;
+        : `In the pinned post "Today at the stops" of ${view.channels.map(channel).join(', ')}, ${view.until}.`;
+  return { head, where };
+}
+
+/**
+ * The answer of a research report (plan 8R-1; design 4.3), for the reporter alone: the task and
+ * its rewards, each stop (with the task it replaced: "was: Catch 7 Pokémon"; "again" for the
+ * same task), where it shows and until when, "Same task at more stops…" (a menu of the stops
+ * near the first one without this task, up to five at once) and "Take back" (every report of
+ * the answer whose id fits the custom id; the rest by `/research remove`).
+ */
+export function researchAnswer(view: ResearchAnswerView): V2Message {
+  const [first] = view.saved;
+  if (!first) throw new Error('a research answer needs a report');
+  const { head, where } = researchWords(view, DISCORD_CHANNEL);
   const parts: APIComponentInContainer[] = [
-    textDisplay(cutText(`${head}\n${lines.join('\n')}`, 3_000)),
+    textDisplay(cutText(head, 3_000)),
     textDisplay(`-# ${where}`),
   ];
   if (view.more.length > 0) {
diff --git a/src/render/rocket.test.ts b/src/render/rocket.test.ts
index 252cb5b4d4e9435e0332cde74dce7b9320ae4348..8b6788d7b4bec2986ba503fb6fd465fb8cce0330 100644
--- a/src/render/rocket.test.ts
+++ b/src/render/rocket.test.ts
@@ -1,18 +1,25 @@
 import { describe, expect, it } from 'vitest';
 import { classic, galleryOf, textOf, thumbnailOf } from '../../test/support/messages.js';
 import { feedChoice } from '../../test/support/rocket.js';
-import { reportedStop } from '../../test/support/stop-report-cases.js';
+import { reportedStop, rocketReport } from '../../test/support/stop-report-cases.js';
+import type { RocketReport } from '../domain/stops/report.js';
 import {
+  alreadyReported,
   catchWords,
   gruntHourNote,
   gruntMessage,
   gruntTextMessage,
   ROCKET_COLOUR,
+  rocketAnswer,
   rocketDmSentence,
+  rocketWords,
   type GruntView,
+  type RocketAnswerView,
 } from './rocket.js';
 
 const GONE = Date.UTC(2026, 9, 22, 16, 30);
+const WEST = '100000000000000011';
+const EAST = '100000000000000012';
 const STOP_PICTURE = 'https://lh3.googleusercontent.com/abc';
 
 const view = (overrides: Partial<GruntView> = {}): GruntView => ({
@@ -96,6 +103,167 @@ describe('rocketDmSentence', () => {
   });
 });
 
+/** A grunt posted in West and East in the place of Arlo, and a hideout in their posts. */
+function answerViews(): { grunt: RocketAnswerView; hideout: RocketAnswerView } {
+  const arlo: RocketReport = {
+    ...rocketReport({ subjectKey: 'leader:arlo', rocket: { name: 'Arlo', catches: [] } }),
+    id: 3,
+  };
+  const grunt: RocketReport = { ...rocketReport(), id: 7 };
+  return {
+    grunt: {
+      report: grunt,
+      replaced: arlo,
+      hideout: false,
+      channels: [WEST, EAST],
+      posted: [{ channelId: WEST }, { channelId: EAST }],
+      rehearsal: false,
+      until: 'until midnight',
+    },
+    hideout: {
+      report: { ...arlo, id: 9 },
+      replaced: undefined,
+      hideout: true,
+      channels: [WEST, EAST],
+      posted: [],
+      rehearsal: false,
+      until: 'until midnight',
+    },
+  };
+}
+
+describe('rocketAnswer', () => {
+  it('is the message it was before its words were shared with the map (plan 8R-3)', () => {
+    const { grunt, hideout } = answerViews();
+    expect(rocketAnswer(grunt)).toMatchInlineSnapshot(`
+      {
+        "components": [
+          {
+            "accent_color": 11740719,
+            "components": [
+              {
+                "content": "### Team GO Rocket reported
+      **Water-type grunt** at **Yellow Mural 1** · Market Street · catch Mudkip (was: Arlo)",
+                "type": 10,
+              },
+              {
+                "content": "-# Posted in <#100000000000000011>, <#100000000000000012>; it goes away <t:1792593000:R>.",
+                "type": 10,
+              },
+              {
+                "components": [
+                  {
+                    "custom_id": "rocket:7:back:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1.16:grunt.water:mvi6im80",
+                    "label": "Take back",
+                    "style": 4,
+                    "type": 2,
+                  },
+                ],
+                "type": 1,
+              },
+            ],
+            "type": 17,
+          },
+        ],
+        "v2": true,
+      }
+    `);
+    expect(rocketAnswer(hideout)).toMatchInlineSnapshot(`
+      {
+        "components": [
+          {
+            "accent_color": 11740719,
+            "components": [
+              {
+                "content": "### Team GO Rocket reported
+      **Arlo** at **Yellow Mural 1** · Market Street",
+                "type": 10,
+              },
+              {
+                "content": "-# In the pinned post "Today at the stops" of <#100000000000000011>, <#100000000000000012>, until midnight.",
+                "type": 10,
+              },
+              {
+                "components": [
+                  {
+                    "custom_id": "rocket:9:back:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1.16:leader.arlo:mvi6im80",
+                    "label": "Take back",
+                    "style": 4,
+                    "type": 2,
+                  },
+                ],
+                "type": 1,
+              },
+            ],
+            "type": 17,
+          },
+        ],
+        "v2": true,
+      }
+    `);
+  });
+
+  it('says what it said before in every other case: rehearsal, unposted, no region, again (plan 8R-3)', () => {
+    const { grunt, hideout } = answerViews();
+    const again: RocketAnswerView = {
+      ...grunt,
+      replaced: { ...grunt.report, id: 2 },
+      rehearsal: true,
+      posted: [],
+    };
+    expect(textOf(rocketAnswer(again))).toMatchInlineSnapshot(`
+      "### Team GO Rocket reported
+      **Water-type grunt** at **Yellow Mural 1** · Market Street · catch Mudkip (again)
+      -# It stands until <t:1792593000:t> (rehearsal mode posts nothing)."
+    `);
+    expect(textOf(rocketAnswer({ ...grunt, posted: [] }))).toMatchInlineSnapshot(`
+      "### Team GO Rocket reported
+      **Water-type grunt** at **Yellow Mural 1** · Market Street · catch Mudkip (was: Arlo)
+      -# It could not be posted in a region channel; it stands until <t:1792593000:t>."
+    `);
+    expect(textOf(rocketAnswer({ ...hideout, rehearsal: true }))).toMatchInlineSnapshot(`
+      "### Team GO Rocket reported
+      **Arlo** at **Yellow Mural 1** · Market Street
+      -# It stands until midnight."
+    `);
+    expect(textOf(rocketAnswer({ ...hideout, channels: [] }))).toMatchInlineSnapshot(`
+      "### Team GO Rocket reported
+      **Arlo** at **Yellow Mural 1** · Market Street
+      -# It lies in no region now, so no post shows it; it stands until midnight."
+    `);
+  });
+});
+
+describe('rocketWords', () => {
+  it('names the channels through the namer the caller gives', () => {
+    const names = new Map([
+      [WEST, '#west'],
+      [EAST, '#east'],
+    ]);
+    const named = (id: string) => names.get(id) ?? '?';
+    const { grunt, hideout } = answerViews();
+    expect(rocketWords(grunt, named)).toEqual({
+      head:
+        '### Team GO Rocket reported\n' +
+        '**Water-type grunt** at **Yellow Mural 1** · Market Street · catch Mudkip (was: Arlo)',
+      where: 'Posted in #west, #east; it goes away <t:1792593000:R>.',
+    });
+    expect(rocketWords(hideout, named).where).toBe(
+      'In the pinned post "Today at the stops" of #west, #east, until midnight.',
+    );
+  });
+});
+
+describe('alreadyReported', () => {
+  it('names the reporter as the caller gives them', () => {
+    const standing: RocketReport = { ...rocketReport(), id: 7 };
+    expect(alreadyReported(standing, undefined)).toContain(', by **Brock** <t:');
+    expect(alreadyReported(standing, 'https://x.test/1', 'Brock')).toMatch(
+      /, by Brock <t:\d+:R>; it goes away <t:\d+:R>\. https:\/\/x\.test\/1$/,
+    );
+  });
+});
+
 describe('catchWords', () => {
   it('names one catch alone and several as one of them, the first few and the rest counted', () => {
     expect(catchWords(feedChoice('decoy').catches)).toBe('Bellsprout');
diff --git a/src/render/rocket.ts b/src/render/rocket.ts
index 79263faa3bff753b721f936b4f28a483577807c1..d0626c84b853df3fef7563a31897834dcf55a027 100644
--- a/src/render/rocket.ts
+++ b/src/render/rocket.ts
@@ -11,7 +11,7 @@ import type { ReportedStop, RocketReport } from '../domain/stops/report.js';
 import { wayspotPicture } from '../domain/wayspots/picture.js';
 import { cutText } from './party-post.js';
 import { mapMarkdown } from './raid-post.js';
-import { stopLine } from './research.js';
+import { DISCORD_CHANNEL, stopLine, type ChannelNamer } from './research.js';
 import {
   memberByName,
   memberName,
@@ -146,6 +146,45 @@ export interface RocketAnswerView {
  * (`rocket:<id>:back:<stop key>:<who>:<made at>`).
  */
 export function rocketAnswer(view: RocketAnswerView): V2Message {
+  const { report } = view;
+  const { head, where } = rocketWords(view, DISCORD_CHANNEL);
+  const button: APIButtonComponentWithCustomId = {
+    type: ComponentType.Button,
+    style: ButtonStyle.Danger,
+    // With the stop, who (`:` read as `.`) and when it was made (base 36), so that a hideout put
+    // back under a new id, which keeps its time, is still found by its meaning (fix S3), and a
+    // newer report of the same who is not (fix F1); without them where the id would not fit.
+    custom_id:
+      encodeCustomIdIfFits({
+        kind: ROCKET_KIND,
+        id: String(report.id),
+        action: ROCKET_ACTIONS.back,
+        args: [report.stop.key, report.subjectKey.replace(':', '.'), report.madeAt.toString(36)],
+      }) ??
+      encodeCustomId({ kind: ROCKET_KIND, id: String(report.id), action: ROCKET_ACTIONS.back }),
+    label: 'Take back',
+  };
+  return {
+    v2: true,
+    components: [
+      container(ROCKET_COLOUR, [
+        textDisplay(cutText(head, 3_000)),
+        textDisplay(`-# ${where}`),
+        actionRow([button]),
+      ]),
+    ],
+  };
+}
+
+/**
+ * The words of a Rocket report's answer (plan 8R-3: shared by `/rocket` and the map): who, at
+ * which stop, what can be caught and what it replaced as `head`; where it shows and until when
+ * as `where`, the region channels named by `channel`.
+ */
+export function rocketWords(
+  view: RocketAnswerView,
+  channel: ChannelNamer,
+): { head: string; where: string } {
   const { report, replaced } = view;
   const catches = catchWords(report.rocket.catches);
   const before =
@@ -159,7 +198,7 @@ export function rocketAnswer(view: RocketAnswerView): V2Message {
     `**${plain(report.rocket.name)}** at ${stopLine(report.stop)}` +
       `${catches === '' ? '' : ` · catch ${catches}`}${before}`,
   ].join('\n');
-  const channels = (ids: readonly string[]): string => ids.map((id) => `<#${id}>`).join(', ');
+  const channels = (ids: readonly string[]): string => ids.map(channel).join(', ');
   let where: string;
   if (view.hideout) {
     where = view.rehearsal
@@ -178,42 +217,22 @@ export function rocketAnswer(view: RocketAnswerView): V2Message {
       `Posted in ${channels(view.posted.map((one) => one.channelId))}; it goes away ` +
       `${timestamp(report.endsAt, 'R')}.`;
   }
-  const button: APIButtonComponentWithCustomId = {
-    type: ComponentType.Button,
-    style: ButtonStyle.Danger,
-    // With the stop, who (`:` read as `.`) and when it was made (base 36), so that a hideout put
-    // back under a new id, which keeps its time, is still found by its meaning (fix S3), and a
-    // newer report of the same who is not (fix F1); without them where the id would not fit.
-    custom_id:
-      encodeCustomIdIfFits({
-        kind: ROCKET_KIND,
-        id: String(report.id),
-        action: ROCKET_ACTIONS.back,
-        args: [report.stop.key, report.subjectKey.replace(':', '.'), report.madeAt.toString(36)],
-      }) ??
-      encodeCustomId({ kind: ROCKET_KIND, id: String(report.id), action: ROCKET_ACTIONS.back }),
-    label: 'Take back',
-  };
-  return {
-    v2: true,
-    components: [
-      container(ROCKET_COLOUR, [
-        textDisplay(cutText(head, 3_000)),
-        textDisplay(`-# ${where}`),
-        actionRow([button]),
-      ]),
-    ],
-  };
+  return { head, where };
 }
 
 /**
  * The answer where the same grunt stands at the stop (Matt's answer 4): who reported it and when,
- * when it goes, and a link to its message (none in rehearsal mode).
+ * when it goes, and a link to its message (none in rehearsal mode). `by` is the reporter as the
+ * caller names them (`memberByName` on Discord; the map names nobody by an id, plan 8R-3).
  */
-export function alreadyReported(standing: RocketReport, link: string | undefined): string {
+export function alreadyReported(
+  standing: RocketReport,
+  link: string | undefined,
+  by = memberByName(standing.reporter),
+): string {
   return (
     `Already reported: ${withArticle(standing.rocket.name, `**${plain(standing.rocket.name)}**`)} at ` +
-    `${stopLine(standing.stop)}, by ${memberByName(standing.reporter)} ` +
+    `${stopLine(standing.stop)}, by ${by} ` +
     `${timestamp(standing.madeAt, 'R')}; it goes away ${timestamp(standing.endsAt, 'R')}.` +
     (link === undefined ? '' : ` ${link}`)
   );
````

### Task 2: 8R-3 task 2: today's reports at stops on the map, as a member sees them

Prototype commit: `808f4bfa12d702a1aa3efb9fcf96321e40744f72`

GET /s/<guild>/api/stop-reports gives a member the research of the
period on (the day's waiting under an event's window counted), the
grunts standing and the day's hideouts, each with its stop's snapshot,
words, rewards or catches and the values a filter needs, the reporter
by name, whether the member may take it back, and its link: the
pinned post's message as last drawn (StopPostService.linkOf, which
draws nothing) or a grunt's own message (one read for all,
GruntMessageStorage.ofReports). A report shows in the regions its
snapshot lies in unless the member is barred from that region's forum,
through the PartyViewers the parties' list now shares. Read anew per
request, ETag of the member's JSON, 304; 30 a minute per address.

**Files:**

```
 src/app.ts                                      |   9 +++
 src/db/repositories/grunt-message-repository.ts |  17 +++++
 src/domain/web/stop-report-data.ts              | 159 ++++++++++++++++++++++++++++++++++++++++++
 src/domain/web/stop-report-view.test.ts         | 176 +++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/web/stop-report-view.ts              | 187 +++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/grunt-messages.test.ts             |  12 ++++
 src/services/grunt-messages.ts                  |  17 +++++
 src/services/region-directory.test.ts           |  40 +++++++++++
 src/services/region-directory.ts                |  19 ++++-
 src/services/stop-posts.test.ts                 |  19 +++++
 src/services/stop-posts.ts                      |  14 ++++
 src/web/guild-routes.ts                         |  16 ++++-
 src/web/party-routes.ts                         |  20 +++---
 src/web/server.ts                               |   3 +
 src/web/stop-reports.test.ts                    | 241 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/stop-routes.ts                          | 170 +++++++++++++++++++++++++++++++++++++++++++++
 test/support/rocket-store-cases.ts              |  14 ++++
 test/support/rocket-store.ts                    |   9 +++
 test/support/stop-reporting.ts                  |  60 ++++++++++++++++
 test/support/web.ts                             |  30 ++++++++
 20 files changed, 1219 insertions(+), 13 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/stop-report-view.test.ts src/services/grunt-messages.test.ts src/services/region-directory.test.ts src/services/stop-posts.test.ts src/web/stop-reports.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 808f4bfa12d702a1aa3efb9fcf96321e40744f72 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-3 task 2: today's reports at stops on the map, as a member sees them`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index e4fff99f716bd7cbb3cbee5dd10eed2e517a64b9..3c97c65141e44e707b1800f536a58b1625310d03 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1112,6 +1112,15 @@ export async function startApp(
       meetups: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
       // Max battles on the map (plan 8X-5): what /max reads and calls.
       maxes: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
+      // Reports at stops on the map (plan 8R-3): what /research and /rocket read and call, the
+      // pinned posts' messages as last drawn, and the grunts' messages (none in rehearsal mode,
+      // which leaves the web server off anyway).
+      stops: {
+        ctx,
+        channelName: (channelId) => partyGateway.channelName(channelId),
+        posts: stopPosts,
+        grunts: gruntMessages,
+      },
       // The Wayspot export tool (plan 8W-P): served from wayspot-tool/ to the admins the owner
       // approved, on an instance that has the file (the owner's).
       tool: {
diff --git a/src/db/repositories/grunt-message-repository.ts b/src/db/repositories/grunt-message-repository.ts
index ed4fe0f9bad6eaf936e853a20993bb58381b69df..25a46314097306fbb90a970d77f40b98264c8a71 100644
--- a/src/db/repositories/grunt-message-repository.ts
+++ b/src/db/repositories/grunt-message-repository.ts
@@ -27,6 +27,11 @@ export interface GruntMessageStorage {
   all(): Promise<GruntMessageRow[]>;
   /** The messages of a report (one per region channel it was posted in), in their order. */
   ofReport(reportId: number): Promise<GruntMessageRow[]>;
+  /**
+   * The messages of several reports in one read (plan 8R-3: the map's grunts, polled), by report
+   * and then in their order; none for no report.
+   */
+  ofReports(reportIds: readonly number[]): Promise<GruntMessageRow[]>;
 }
 
 /** The `GruntMessage` table. */
@@ -64,4 +69,16 @@ export class GruntMessageRepository implements GruntMessageStorage {
       .execute();
     return rows.map((row) => ({ ...row, deleteAt: Number(row.deleteAt) }));
   }
+
+  async ofReports(reportIds: readonly number[]): Promise<GruntMessageRow[]> {
+    if (reportIds.length === 0) return [];
+    const rows = await this.db
+      .selectFrom('GruntMessage')
+      .selectAll()
+      .where('reportId', 'in', [...reportIds])
+      .orderBy('reportId')
+      .orderBy('messageId')
+      .execute();
+    return rows.map((row) => ({ ...row, deleteAt: Number(row.deleteAt) }));
+  }
 }
diff --git a/src/domain/web/stop-report-data.ts b/src/domain/web/stop-report-data.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1b79ae23748cf60e9f4cc25e4cfa1533bbb78a76
--- /dev/null
+++ b/src/domain/web/stop-report-data.ts
@@ -0,0 +1,159 @@
+/**
+ * What the live map's reports at stops read and send (plan 8R-3; design 8, 9.16), as a page reads
+ * it. Types and lists alone, with no import of the server's code: a page's bundle
+ * (`src/web/client/`) may take them.
+ */
+
+/** A stop as a report keeps it (its snapshot: still shown when the stop is renamed or gone). */
+export interface MapStop {
+  /** The stop's key: a Wayfarer id, or `pine-<id>` for a stop of Pine's own. */
+  key: string;
+  name: string;
+  /** Its address line; null for none. */
+  address: string | null;
+  /** To six decimals. */
+  lat: number;
+  lon: number;
+}
+
+/**
+ * A reward of a task, or a Pokémon a Rocket report can give: what it is (`encounter`, an `item`,
+ * Mega Energy as `energy`), its name, `value` (what a filter matches and `/want` names: the
+ * value of a reward's choice, `pokemon:<catalogue key>`, `item:<item key>`, `energy:<dex>`; null
+ * for one the game data does not know), how many (0 where none is said, and for an encounter),
+ * whether it can be shiny, and its picture where the page may load it.
+ */
+export interface MapReward {
+  kind: 'encounter' | 'item' | 'energy';
+  name: string;
+  value: string | null;
+  quantity: number;
+  shiny: boolean;
+  image?: string;
+}
+
+/** What every report on the map has. */
+interface MapStopReportBase {
+  /** The report's id: what `POST …/stop-reports/<id>/remove` takes back. */
+  id: number;
+  stop: MapStop;
+  /** When it ends, epoch milliseconds. */
+  endsAt: number;
+  /** Who reported it, by the name shown then, as text ("a member" where none was kept). */
+  reporter: string;
+  /** Whether this member may take it back here: their own, or any for staff; never read-only. */
+  mayTakeBack: boolean;
+  /**
+   * Where it is on Discord: the message of the pinned post "Today at the stops" that holds a
+   * task or a hideout, a grunt's own message; absent where there is none the member may see.
+   */
+  link?: string;
+}
+
+/**
+ * Field research reported at a stop, of the period on now: the task's text (`typed`: a member
+ * typed it in full, no task of the list), its category (null for a typed one), `task` its key (a
+ * task's key, `typed:<key>` for a typed one: the same task at several stops has the same), its
+ * rewards (one is drawn per player).
+ */
+export interface MapResearch extends MapStopReportBase {
+  task: string;
+  text: string;
+  category: string | null;
+  typed: boolean;
+  rewards: MapReward[];
+}
+
+/** A grunt reported at a stop, for its half hour: who (`grunt:water`), its name, the catches. */
+export interface MapGrunt extends MapStopReportBase {
+  who: string;
+  name: string;
+  catches: MapReward[];
+}
+
+/**
+ * A hideout reported at a stop for the day (a leader, Giovanni, the decoy): who (`leader:arlo`,
+ * `giovanni`, `decoy`), its name, the catches, and its picture (the first catch's, as the pinned
+ * post shows it beside the hideout).
+ */
+export interface MapHideout extends MapStopReportBase {
+  who: string;
+  name: string;
+  catches: MapReward[];
+  picture?: string;
+}
+
+/**
+ * Today's reports at the stops of a server as the member may see them
+ * (`GET /s/<guild>/api/stop-reports`): the research of the period on now (`event`: the research
+ * event whose tasks these are, null on an ordinary day), how many of the day's research reports
+ * wait under an intra-day event's window and when they come back (`waiting`, as the pinned post
+ * says it), the grunts standing, the day's hideouts; the posts' zone.
+ */
+export interface StopReportsView {
+  zone: string;
+  event: string | null;
+  research: MapResearch[];
+  waiting: { stops: number; at: number } | null;
+  grunts: MapGrunt[];
+  hideouts: MapHideout[];
+}
+
+/**
+ * A task as `/research` lists it (`GET /s/<guild>/api/research-options`): its key (what a report
+ * sends as `task`), text, category and rewards.
+ */
+export interface ResearchTaskOption {
+  key: string;
+  text: string;
+  category: string;
+  rewards: MapReward[];
+}
+
+/**
+ * The pick lists of a research report: the task list in the page's order, whether it is out of
+ * date (`stale`: not read for `settings.research.staleAfterHours`, or never; a task missing from
+ * it is typed in full), when it was read, and the rewards a typed task may name besides a
+ * Pokémon (`reward`: a value of these, or a Pokémon by `pokemon:<catalogue key>` or its name).
+ */
+export interface ResearchOptionsView {
+  stale: boolean;
+  readAt: number | null;
+  tasks: ResearchTaskOption[];
+  rewards: Array<{ value: string; name: string }>;
+}
+
+/**
+ * Who of Team GO Rocket `/rocket` offers (`GET /s/<guild>/api/rocket-options`): its key (what a
+ * report sends as `who`), its name, the catches, whether it is a hideout (it holds its stop all
+ * day), and a note to show with it (Giovanni's: report him only when sure).
+ */
+export interface RocketWhoOption {
+  key: string;
+  name: string;
+  hideout: boolean;
+  catches: MapReward[];
+  note?: string;
+}
+
+/** The pick list of a Rocket report: `/rocket`'s choices in its order; `stale` as the tasks'. */
+export interface RocketOptionsView {
+  stale: boolean;
+  choices: RocketWhoOption[];
+}
+
+/**
+ * What a report or a take-back on the map answers (`POST …/research`, `POST …/rocket`,
+ * `POST …/stop-reports/<id>/remove`): whether it was done, the command's words as plain text, the
+ * research reports made (`research`) or the Rocket report made or standing (`grunt`, `hideout`)
+ * as the map shows them to the member; for a grunt where a hideout stands, the question
+ * (`text`) and the hideout to say Replace to (`asks.replacing`: send the report again with it).
+ */
+export interface StopReportAnswer {
+  ok: boolean;
+  text: string;
+  research?: MapResearch[];
+  grunt?: MapGrunt;
+  hideout?: MapHideout;
+  asks?: { replacing: number };
+}
diff --git a/src/domain/web/stop-report-view.test.ts b/src/domain/web/stop-report-view.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c637e3f2c336b6e49c75fa15c42db0c41c6dea06
--- /dev/null
+++ b/src/domain/web/stop-report-view.test.ts
@@ -0,0 +1,176 @@
+import { describe, expect, it } from 'vitest';
+import {
+  DRATINI,
+  MUDKIP,
+  REPORT_NOW,
+  REPORTER,
+  reportedStop,
+  researchReport,
+  rocketReport,
+} from '../../../test/support/stop-report-cases.js';
+import type { StopReport } from '../stops/report.js';
+import { stopReportView, type StopReportViewInput } from './stop-report-view.js';
+
+const CDN = 'https://cdn.leekduck.com';
+const ASH = '200000000000000061';
+
+/** The reports of a day: research of the day and of an event's window, grunts, a hideout. */
+function reports(): StopReport[] {
+  return [
+    { ...researchReport(), id: 1 },
+    // Of the day, waiting under the window that is on.
+    { ...researchReport({ stop: reportedStop(2), periodKey: 'day:2026-10-21' }), id: 2 },
+    {
+      ...researchReport({
+        stop: reportedStop(3, { lat: 40.1234567, lon: -79.7654321 }),
+        periodKey: 'event:cd',
+        subjectKey: 'typed:0000000000000001',
+        research: {
+          text: 'Catch 3 Pawniard',
+          category: null,
+          rewards: [
+            { kind: 'item', item: 'rare-candy', name: 'Rare Candy', quantity: 0, image: null },
+            {
+              kind: 'energy',
+              dex: 3,
+              name: 'Venusaur Mega Energy',
+              quantity: 20,
+              image: 'https://elsewhere.test/energy.png',
+            },
+          ],
+          typed: true,
+        },
+        reporter: { id: ASH, name: '' },
+      }),
+      id: 3,
+    },
+    { ...rocketReport({ stop: reportedStop(4) }), id: 4 },
+    // A grunt whose half hour has passed (the store keeps it until the upkeep).
+    { ...rocketReport({ stop: reportedStop(5), endsAt: REPORT_NOW - 1 }), id: 5 },
+    {
+      ...rocketReport({
+        stop: reportedStop(6),
+        subjectKey: 'leader:arlo',
+        rocket: { name: 'Arlo', catches: [{ ...MUDKIP, key: null, dex: null }] },
+        endsAt: REPORT_NOW + 10 * 3_600_000,
+      }),
+      id: 6,
+    },
+  ];
+}
+
+const input = (overrides: Partial<StopReportViewInput> = {}): StopReportViewInput => ({
+  reports: reports(),
+  period: {
+    key: 'event:cd',
+    event: { id: 'cd', name: 'Pawniard Community Day' },
+    waiting: { key: 'day:2026-10-21', at: REPORT_NOW + 3 * 3_600_000 },
+  },
+  now: REPORT_NOW,
+  zone: 'America/New_York',
+  shown: () => true,
+  memberId: ASH,
+  staff: false,
+  readOnly: false,
+  link: (report) => `https://discord.com/channels/1/2/${String(report.id)}`,
+  pictureOrigins: [CDN],
+  ...overrides,
+});
+
+describe('stopReportView', () => {
+  it('shows the research of the period on, counts what waits, the grunts standing and the hideouts', () => {
+    const view = stopReportView(input());
+    expect(view.event).toBe('Pawniard Community Day');
+    expect(view.zone).toBe('America/New_York');
+    expect(view.research.map((one) => one.id)).toEqual([3]);
+    expect(view.waiting).toEqual({ stops: 2, at: REPORT_NOW + 3 * 3_600_000 });
+    expect(view.grunts.map((one) => one.id)).toEqual([4]);
+    expect(view.hideouts.map((one) => one.id)).toEqual([6]);
+  });
+
+  it('gives each report its stop, words, rewards with the keys a filter needs, and its link', () => {
+    const view = stopReportView(input());
+    expect(view.research[0]).toEqual({
+      id: 3,
+      stop: {
+        key: reportedStop(3).key,
+        name: 'Yellow Mural 3',
+        address: 'Market Street',
+        lat: 40.123457,
+        lon: -79.765432,
+      },
+      endsAt: researchReport().endsAt,
+      reporter: 'a member',
+      mayTakeBack: true,
+      link: 'https://discord.com/channels/1/2/3',
+      task: 'typed:0000000000000001',
+      text: 'Catch 3 Pawniard',
+      category: null,
+      typed: true,
+      rewards: [
+        { kind: 'item', name: 'Rare Candy', value: 'item:rare-candy', quantity: 0, shiny: false },
+        // A picture from no host the page may load is left out.
+        {
+          kind: 'energy',
+          name: 'Venusaur Mega Energy',
+          value: 'energy:3',
+          quantity: 20,
+          shiny: false,
+        },
+      ],
+    });
+    expect(view.grunts[0]).toMatchObject({
+      who: 'grunt:water',
+      name: 'Water-type grunt',
+      reporter: REPORTER.name,
+      mayTakeBack: false,
+      catches: [
+        { kind: 'encounter', name: 'Mudkip', value: 'pokemon:mudkip', quantity: 0, shiny: true },
+      ],
+    });
+    expect(view.grunts[0]?.catches[0]?.image).toBe(MUDKIP.image);
+    expect(view.hideouts[0]).toMatchObject({
+      who: 'leader:arlo',
+      name: 'Arlo',
+      picture: MUDKIP.image,
+      catches: [{ name: 'Mudkip', value: null }],
+    });
+  });
+
+  it('gives an encounter its catalogue key, and the day’s research when no window is on', () => {
+    const view = stopReportView(input({ period: { key: 'day:2026-10-21' } }));
+    expect(view.event).toBeNull();
+    expect(view.waiting).toBeNull();
+    expect(view.research.map((one) => one.id)).toEqual([1, 2]);
+    expect(view.research[0]?.rewards).toEqual([
+      {
+        kind: 'encounter',
+        name: 'Dratini',
+        value: 'pokemon:dratini',
+        quantity: 0,
+        shiny: true,
+        image: DRATINI.image,
+      },
+    ]);
+  });
+
+  it('leaves out what the member may not see, and their links', () => {
+    const view = stopReportView(
+      input({
+        shown: (report) => report.id !== 4,
+        link: (report) => (report.id === 6 ? undefined : 'https://discord.com/channels/1/2/3'),
+      }),
+    );
+    expect(view.grunts).toEqual([]);
+    expect(view.hideouts[0]?.link).toBeUndefined();
+    expect(stopReportView(input({ shown: () => false })).waiting).toBeNull();
+  });
+
+  it('lets staff take back any report, and nobody while read-only', () => {
+    const staff = stopReportView(input({ staff: true, memberId: '200000000000000099' }));
+    expect(staff.grunts[0]?.mayTakeBack).toBe(true);
+    const readOnly = stopReportView(input({ staff: true, readOnly: true }));
+    expect(readOnly.research[0]?.mayTakeBack).toBe(false);
+    expect(readOnly.grunts[0]?.mayTakeBack).toBe(false);
+  });
+});
diff --git a/src/domain/web/stop-report-view.ts b/src/domain/web/stop-report-view.ts
new file mode 100644
index 0000000000000000000000000000000000000000..67d7a3a9e9ce53d069be4bc71471b235fe9db1b0
--- /dev/null
+++ b/src/domain/web/stop-report-view.ts
@@ -0,0 +1,187 @@
+import type { TaskReward } from '../research/task.js';
+import { isHideout, parseRocketKey, type RocketCatch } from '../rocket/lineups.js';
+import {
+  isResearchReport,
+  isRocketReport,
+  type ResearchReport,
+  type RocketReport,
+  type StopReport,
+} from '../stops/report.js';
+import type { ResearchPeriod } from '../time/research-periods.js';
+import { allowedPicture } from './picture.js';
+import type {
+  MapGrunt,
+  MapHideout,
+  MapResearch,
+  MapReward,
+  MapStop,
+  StopReportsView,
+} from './stop-report-data.js';
+
+/** What the view of a member's reports at stops is made of (`stopReportView`). */
+export interface StopReportViewInput {
+  /** The server's reports that have not ended (`StopReportService.standing`), oldest first. */
+  reports: readonly StopReport[];
+  /** The research period on now: its reports are shown, those waiting under it counted. */
+  period: Pick<ResearchPeriod, 'key' | 'event' | 'waiting'>;
+  now: number;
+  /** `settings.timezone`, sent with the view. */
+  zone: string;
+  /** Whether the member may see a report (the regions it lies in: not all kept from them). */
+  shown(report: StopReport): boolean;
+  memberId: string;
+  /** Whether the member is staff (`isMapStaff`), who may take back any report. */
+  staff: boolean;
+  /** Discord cannot be asked: nothing may be done, only seen. */
+  readOnly: boolean;
+  /** Where a report is on Discord, that the member may see; undefined for nowhere. */
+  link(report: StopReport): string | undefined;
+  /** The origins the page may load pictures from (`pictureOrigins`). */
+  pictureOrigins: readonly string[];
+}
+
+/** A coordinate to six decimals (about 10 cm), as the map's places are. */
+const sixDecimals = (value: number): number => Math.round(value * 1e6) / 1e6;
+
+/** A picture the page may load, as an optional field. */
+function pictured(image: string | null, origins: readonly string[]): { image?: string } {
+  const allowed = allowedPicture(image ?? undefined, origins);
+  return allowed === undefined ? {} : { image: allowed };
+}
+
+/** A reward of a task as the map shows it, with the value a filter matches (`MapReward`). */
+export function mapReward(reward: TaskReward, origins: readonly string[]): MapReward {
+  const picture = pictured(reward.image, origins);
+  switch (reward.kind) {
+    case 'encounter':
+      return {
+        kind: 'encounter',
+        name: reward.name,
+        value: reward.key === null ? null : `pokemon:${reward.key}`,
+        quantity: 0,
+        shiny: reward.shiny,
+        ...picture,
+      };
+    case 'item':
+      return {
+        kind: 'item',
+        name: reward.name,
+        value: `item:${reward.item}`,
+        quantity: reward.quantity,
+        shiny: false,
+        ...picture,
+      };
+    case 'energy':
+      return {
+        kind: 'energy',
+        name: reward.name,
+        value: reward.dex === null ? null : `energy:${String(reward.dex)}`,
+        quantity: reward.quantity,
+        shiny: false,
+        ...picture,
+      };
+  }
+}
+
+/** A Pokémon a Rocket report can give, as the map shows a reward. */
+export function mapCatch(caught: RocketCatch, origins: readonly string[]): MapReward {
+  return {
+    kind: 'encounter',
+    name: caught.name,
+    value: caught.key === null ? null : `pokemon:${caught.key}`,
+    quantity: 0,
+    shiny: caught.shiny,
+    ...pictured(caught.image, origins),
+  };
+}
+
+/** A report's stop as its snapshot has it, to six decimals. */
+function mapStop(report: StopReport): MapStop {
+  const { key, name, address, lat, lon } = report.stop;
+  return { key, name, address, lat: sixDecimals(lat), lon: sixDecimals(lon) };
+}
+
+/** What every report on the map has, for the member who asks. */
+function base(report: StopReport, input: StopReportViewInput) {
+  const link = input.link(report);
+  return {
+    id: report.id,
+    stop: mapStop(report),
+    endsAt: report.endsAt,
+    reporter: report.reporter.name.trim() === '' ? 'a member' : report.reporter.name,
+    mayTakeBack: !input.readOnly && (input.staff || report.reporter.id === input.memberId),
+    ...(link === undefined ? {} : { link }),
+  };
+}
+
+function mapResearch(report: ResearchReport, input: StopReportViewInput): MapResearch {
+  const { research } = report;
+  return {
+    ...base(report, input),
+    task: report.subjectKey,
+    text: research.text,
+    category: research.category,
+    typed: research.typed,
+    rewards: research.rewards.map((reward) => mapReward(reward, input.pictureOrigins)),
+  };
+}
+
+function mapGrunt(report: RocketReport, input: StopReportViewInput): MapGrunt {
+  return {
+    ...base(report, input),
+    who: report.subjectKey,
+    name: report.rocket.name,
+    catches: report.rocket.catches.map((caught) => mapCatch(caught, input.pictureOrigins)),
+  };
+}
+
+function mapHideout(report: RocketReport, input: StopReportViewInput): MapHideout {
+  const catches = report.rocket.catches.map((caught) => mapCatch(caught, input.pictureOrigins));
+  const picture = catches.find((caught) => caught.image !== undefined)?.image;
+  return {
+    ...base(report, input),
+    who: report.subjectKey,
+    name: report.rocket.name,
+    catches,
+    ...(picture === undefined ? {} : { picture }),
+  };
+}
+
+/** Whether a Rocket report is of a hideout (a leader, Giovanni, the decoy). */
+function ofHideout(report: RocketReport): boolean {
+  const who = parseRocketKey(report.subjectKey);
+  return who !== undefined && isHideout(who);
+}
+
+/**
+ * Today's reports at the stops of a server as a member may see them on the map (plan 8R-3;
+ * design 8): the research of the period on now (design 9.2: an intra-day event's window shows
+ * its own, and the day's that wait under it are counted with when they come back, as the pinned
+ * post says it), the grunts until their half hour has passed, the day's hideouts; only reports
+ * the member may see (`shown`), each with its stop's snapshot, its words, its rewards or catches
+ * (pictures only from `pictureOrigins`), its reporter by name (never an id), whether the member
+ * may take it back, and its link. Pure.
+ */
+export function stopReportView(input: StopReportViewInput): StopReportsView {
+  const { now, period } = input;
+  const standing = input.reports.filter((report) => report.endsAt > now && input.shown(report));
+  const research = standing.filter(isResearchReport);
+  const rocket = standing.filter(isRocketReport);
+  const waiting =
+    period.waiting === undefined
+      ? 0
+      : research.filter((report) => report.periodKey === period.waiting?.key).length;
+  return {
+    zone: input.zone,
+    event: period.event?.name ?? null,
+    research: research
+      .filter((report) => report.periodKey === period.key)
+      .map((report) => mapResearch(report, input)),
+    waiting:
+      period.waiting !== undefined && waiting > 0
+        ? { stops: waiting, at: period.waiting.at }
+        : null,
+    grunts: rocket.filter((report) => !ofHideout(report)).map((report) => mapGrunt(report, input)),
+    hideouts: rocket.filter(ofHideout).map((report) => mapHideout(report, input)),
+  };
+}
diff --git a/src/services/grunt-messages.test.ts b/src/services/grunt-messages.test.ts
index 7cae00445b70d837044cca386dc4f59f815071c2..eaf7ea05887d9071dd384355f08d564286762a31 100644
--- a/src/services/grunt-messages.test.ts
+++ b/src/services/grunt-messages.test.ts
@@ -83,6 +83,18 @@ describe('GruntMessageService', () => {
     expect(made.store.rows).toEqual([]);
   });
 
+  it('gives the messages of several reports in one read, by report (plan 8R-3)', async () => {
+    const made = messagesWith();
+    const first = await made.messages.post(grunt(1), [WEST_CHANNEL, EAST_CHANNEL]);
+    const second = await made.messages.post(grunt(2), [EAST_CHANNEL]);
+    const read = await made.messages.messagesOfReports([1, 2, 3]);
+    expect([...read.entries()]).toEqual([
+      [1, first],
+      [2, second],
+    ]);
+    expect((await made.messages.messagesOfReports([])).size).toBe(0);
+  });
+
   it('posts plain text where the bot may not embed', async () => {
     const made = messagesWith();
     made.gateway.noEmbeds.add(WEST_CHANNEL);
diff --git a/src/services/grunt-messages.ts b/src/services/grunt-messages.ts
index f6844f38490b0997db56d8fc7ada55167a55eb43..0522fcf76a4345b54c7bb84a536e8985a1fd3643 100644
--- a/src/services/grunt-messages.ts
+++ b/src/services/grunt-messages.ts
@@ -146,6 +146,23 @@ export class GruntMessageService {
     }));
   }
 
+  /**
+   * The messages of several reports that stand, in one read (plan 8R-3: the map's grunts, polled,
+   * each with a link), by report; a report with none is not in it.
+   */
+  async messagesOfReports(reportIds: readonly number[]): Promise<Map<number, PostedGrunt[]>> {
+    const byReport = new Map<number, PostedGrunt[]>();
+    if (reportIds.length === 0) return byReport;
+    for (const { reportId, channelId, messageId } of await this.options.store.ofReports(
+      reportIds,
+    )) {
+      const kept = byReport.get(reportId);
+      if (kept) kept.push({ channelId, messageId });
+      else byReport.set(reportId, [{ channelId, messageId }]);
+    }
+    return byReport;
+  }
+
   /**
    * Sends a grunt's message; when Discord refuses it for what it holds (an address of a picture),
    * once more without its pictures.
diff --git a/src/services/region-directory.test.ts b/src/services/region-directory.test.ts
index 949783a394e8d4cb80b0a66671abe63adeb70a14..bed475ef7e05a16bb3a214090867adfef530a86e 100644
--- a/src/services/region-directory.test.ts
+++ b/src/services/region-directory.test.ts
@@ -14,6 +14,7 @@ import {
   gymRegionsInGuild,
   RegionDirectory,
   regionsAtPoint,
+  regionsAtPoints,
 } from './region-directory.js';
 
 function directory(list: () => Promise<Region[]> = () => Promise.resolve(testRegions())) {
@@ -86,6 +87,45 @@ describe('regionsAtPoint', () => {
     // West's first row does not hold a point of East: its later row is not asked.
     expect(regionsAtPoint(all, 1, inEast).map((region) => region.id)).toEqual([2, 8]);
   });
+
+  it('places many points of a server as it places each (plan 8R-3: the map’s reports)', () => {
+    const all: Region[] = [
+      { ...testRegions()[0]!, id: 9, guildId: 2, channelId: 'foreign-channel', bounds: both },
+      ...testRegions(),
+      { ...testRegions()[0]!, id: 7, bounds: both },
+      { ...testRegions()[0]!, id: 8, channelId: 'second-channel', bounds: both },
+      { ...testRegions()[2]!, id: 6, channelId: 'outline-less-channel', bounds: null },
+      // A triangle: half of its box lies outside it.
+      {
+        ...testRegions()[0]!,
+        id: 5,
+        channelId: 'triangle-channel',
+        bounds: [
+          { lat: 40.2, lon: -80.1 },
+          { lat: 40.3, lon: -80.1 },
+          { lat: 40.2, lon: -80.0 },
+        ],
+      },
+    ];
+    const inTriangle = { lat: 40.21, lon: -80.09 };
+    const inTrianglesBoxOnly = { lat: 40.29, lon: -80.01 };
+    const points = [
+      inWest,
+      inEast,
+      { lat: 41, lon: -81 },
+      { lat: 40.05, lon: -80 },
+      inTriangle,
+      inTrianglesBoxOnly,
+    ];
+    for (const guild of [1, 2, 3]) {
+      const at = regionsAtPoints(all, guild);
+      for (const point of points) expect(at(point)).toEqual(regionsAtPoint(all, guild, point));
+    }
+    expect(regionsAtPoints(all, 1)(inEast).map((region) => region.id)).toEqual([2, 8]);
+    expect(regionsAtPoints(all, 1)(inTriangle).map((region) => region.id)).toEqual([5]);
+    expect(regionsAtPoint(all, 1, inTrianglesBoxOnly)).toEqual([]);
+    expect(regionsAtPoints(all, 1)(inTrianglesBoxOnly)).toEqual([]);
+  });
 });
 
 describe('RegionDirectory', () => {
diff --git a/src/services/region-directory.ts b/src/services/region-directory.ts
index 31cd059da3623395d24325ba7a4a1393d746a0af..b6d3b0afd29aabee4f192097290aedaed992210e 100644
--- a/src/services/region-directory.ts
+++ b/src/services/region-directory.ts
@@ -1,6 +1,6 @@
 import type { Region } from '../db/repositories/region-repository.js';
 import type { LatLon } from '@pine/wayspot-core/lat-lon';
-import { ringContains } from '@pine/wayspot-core/region-membership';
+import { containment, ringContains } from '@pine/wayspot-core/region-membership';
 import type { Logger } from '../log.js';
 import type { StopRef } from '../domain/party/stops.js';
 
@@ -80,6 +80,23 @@ export function regionsAtPoint<
   });
 }
 
+/**
+ * `regionsAtPoint` for many points of one server (plan 8R-3: the reports a map polls): the
+ * server's regions taken once, as `regionsAtPoint` takes them, each outline's box made once
+ * (`containment`), so that a point outside a region's box costs four comparisons.
+ */
+export function regionsAtPoints<
+  R extends { guildId: number | null; channelId: string; bounds: readonly LatLon[] | null },
+>(regions: readonly R[], guildId: number): (point: LatLon) => R[] {
+  const channels = new Set<string>();
+  const outlined = regions.flatMap((region) => {
+    if (region.guildId !== guildId || channels.has(region.channelId)) return [];
+    channels.add(region.channelId);
+    return region.bounds === null ? [] : [{ region, holds: containment(region.bounds) }];
+  });
+  return (point) => outlined.filter(({ holds }) => holds(point)).map(({ region }) => region);
+}
+
 /** What handlers need: the regions, from memory. */
 export interface RegionProvider {
   /** By row id. */
diff --git a/src/services/stop-posts.test.ts b/src/services/stop-posts.test.ts
index 46ce0a097d3b8f83544dc24d9ddfbf8641a18f60..98eb5d5aa73c872d708dd6bb46a2576de8b3f130 100644
--- a/src/services/stop-posts.test.ts
+++ b/src/services/stop-posts.test.ts
@@ -360,6 +360,25 @@ describe('StopPostService', () => {
     expect(id).toBeDefined();
   });
 
+  it('says which message holds a task as last drawn, drawing nothing itself (plan 8R-3)', async () => {
+    made = postsWith();
+    const task = pageTask('Catch a Dragon-type Pokémon');
+    await made.report(task);
+    // Not drawn yet, and asking draws nothing: the map asks on every poll.
+    expect(made.posts.linkOf(WEST_CHANNEL, task.key)).toBeUndefined();
+    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    await made.posts.flush();
+    const [post] = made.gateway.messagesIn(WEST_CHANNEL);
+    expect(made.posts.linkOf(WEST_CHANNEL, task.key)).toBe(post?.id);
+    // A task the post does not hold (one counted only): its first message.
+    expect(made.posts.linkOf(WEST_CHANNEL, 'nothing')).toBe(post?.id);
+    expect(made.posts.linkOf(EAST_CHANNEL, task.key)).toBeUndefined();
+    // Past midnight, before the timer draws the posts anew: yesterday's post is no link.
+    made.clock.now = at('2026-11-22T00:00:01');
+    expect(made.posts.linkOf(WEST_CHANNEL, task.key)).toBeUndefined();
+    expect(made.posts.linkOf(WEST_CHANNEL, 'nothing')).toBeUndefined();
+  });
+
   it('is plain text where the bot may not post embeds', async () => {
     made = postsWith();
     made.gateway.noEmbeds.add(WEST_CHANNEL);
diff --git a/src/services/stop-posts.ts b/src/services/stop-posts.ts
index 263338be80256ec048279e7fcc9f81c6d7eba1c0..b0c93f4ed73cae7f8ab172cce3db45a37ea7bab5 100644
--- a/src/services/stop-posts.ts
+++ b/src/services/stop-posts.ts
@@ -435,6 +435,20 @@ export class StopPostService {
     return this.holding.get(channelId)?.get(subjectKey);
   }
 
+  /**
+   * The message of a channel's post that holds a task or a hideout as the post was last drawn,
+   * else its first message (one counted only, "…and N more"); undefined where the channel has no
+   * post of today drawn (past midnight, before the posts are drawn anew, yesterday's is none).
+   * Read only (plan 8R-3: the map asks on every poll): unlike `messageOf` it draws nothing and
+   * waits for nothing, so a change still gathering shows at the next poll.
+   */
+  linkOf(channelId: string, subjectKey: string): string | undefined {
+    const held = this.holding.get(channelId);
+    const post = this.posts.get(channelId);
+    if (held === undefined || post?.day !== this.dayOf(this.now())) return undefined;
+    return held.get(subjectKey) ?? post.messageIds[0];
+  }
+
   /** Draws what waits now, and waits for every draw. For tests and shutdown. */
   async flush(): Promise<void> {
     await Promise.all(this.redraws);
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index 612424bed7316865ffe96c50ccb795954cbf2542..40e3de76c97b51d74b5c84192662b623f2c29976 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -8,9 +8,11 @@ import { maxRoutes } from './max-routes.js';
 import { meetupRoutes } from './meetup-routes.js';
 import { mapPage } from './page.js';
 import { partyRoutes } from './party-routes.js';
+import { PartyViewers } from './party-viewers.js';
 import { raidRoutes } from './raid-routes.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import { spawnRoutes } from './spawn-routes.js';
+import { stopRoutes } from './stop-routes.js';
 import type { WebDeps } from './server.js';
 import { trainRoutes } from './train-routes.js';
 
@@ -119,9 +121,18 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
   // The region editor (plan 8M-2): its data for the server's staff.
   editorRoutes(scope, deps);
 
+  // Who sees which parties and reports at stops on the map (spec 2.5): one for both, so that what
+  // Discord said of a member and a forum serves the two lists a page polls.
+  const viewers = new PartyViewers({
+    members: map.members,
+    forums: deps.parties.forums,
+    log: deps.log,
+    now: deps.now,
+  });
+
   // The parties on the live map, and joining them (plan 8M-3): for members of the server (with
   // the map's member role, when the settings name one).
-  partyRoutes(scope, map);
+  partyRoutes(scope, map, viewers);
 
   // Reporting and changing raids on the live map (plan 8M-4): for the same members.
   raidRoutes(scope, map);
@@ -138,4 +149,7 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
   // Max battles on the live map (plan 8X-5): the power spots, the pick lists and reports, for the
   // same members.
   maxRoutes(scope, map);
+
+  // Reports at stops on the live map (plan 8R-3): today's reports, for the same members.
+  stopRoutes(scope, map, viewers);
 }
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index fb15838f4ddf4d86bd64b0dadd881b2886295da0..b2b05c458fa8ebad5b085af0edeb195fbbd46e92 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -50,7 +50,7 @@ import { sendFailure } from './answers.js';
 import { postGuard } from './csrf.js';
 import { etagMatches, etagOf } from './geo-cache.js';
 import type { GuildRequest } from './guild-routes.js';
-import { PartyViewers } from './party-viewers.js';
+import type { PartyViewers } from './party-viewers.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
 
@@ -61,8 +61,11 @@ import type { WebDeps } from './server.js';
  */
 export const PARTIES_PER_MINUTE = 30;
 
-/** What the parties' addresses answer while Discord cannot say whether somebody is a member. */
-const UNCONFIRMED =
+/**
+ * What the parties' addresses (and the reports at stops, plan 8R-3) answer while Discord cannot
+ * say whether somebody is a member.
+ */
+export const UNCONFIRMED =
   'Discord cannot be reached just now, so I cannot tell whether you are a member.';
 
 /** What the live map's parties need (plan 8M-3). */
@@ -179,16 +182,11 @@ type PressRequest = FastifyRequest<{
  * server as the member who asks sees them (`partyView`), for members only (`PartyViewers`: 401
  * without a session, 403 for anybody who is not a member, 503 while Discord cannot say and has
  * not said lately), read-only while Discord cannot be asked. The view is the member's own: an
- * ETag of its JSON, `private, no-cache`, 304 when the page has it already.
+ * ETag of its JSON, `private, no-cache`, 304 when the page has it already. `viewers` is shared
+ * with the reports at stops (plan 8R-3), so that what Discord said of a forum serves both.
  */
-export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
+export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: PartyViewers): void {
   const { parties, sessions } = deps;
-  const viewers = new PartyViewers({
-    members: deps.members,
-    forums: parties.forums,
-    log: deps.log,
-    now: deps.now,
-  });
 
   /**
    * The view input of a member: the server's active parties (`own`, of the server's row) and
diff --git a/src/web/server.ts b/src/web/server.ts
index 11758c34badfcd40bd9d951adfb72652aea9b5fa..fce12afd1363b3c1e5cc11c924b334039ec63962 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -24,6 +24,7 @@ import type { PartyWebDeps } from './party-routes.js';
 import type { RaidWebDeps } from './raid-routes.js';
 import type { Sessions } from './sessions.js';
 import type { SpawnWebDeps } from './spawn-routes.js';
+import type { StopWebDeps } from './stop-routes.js';
 import type { TrainWebDeps } from './train-routes.js';
 import { toolFileRoutes, toolPageRoutes, type ToolWebDeps } from './tool-routes.js';
 
@@ -64,6 +65,8 @@ export interface WebDeps {
   meetups: MeetupWebDeps;
   /** Max battles on the live map: power spots, the pick lists, reports (plan 8X-5). */
   maxes: MaxWebDeps;
+  /** Reports at stops on the live map: today's reports, the pick lists, reports (plan 8R-3). */
+  stops: StopWebDeps;
   /** The Wayspot export tool and who may have it (plan 8W-P): `/userscript`. */
   tool: ToolWebDeps;
   now: () => number;
diff --git a/src/web/stop-reports.test.ts b/src/web/stop-reports.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1ddfec6f519a47f320489040dd2441fef7b8e172
--- /dev/null
+++ b/src/web/stop-reports.test.ts
@@ -0,0 +1,241 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { EAST_CHANNEL, EAST_FORUM, OTHER_GUILD_ID, WEST_CHANNEL } from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB } from '../../test/support/parties.js';
+import { pageTask } from '../../test/support/research.js';
+import { MemoryStopPosts } from '../../test/support/research-store.js';
+import { feedChoice } from '../../test/support/rocket.js';
+import { STOP_NOON, stopReportingWith } from '../../test/support/stop-reporting.js';
+import { wayspotId } from '../../test/support/wayspot-cases.js';
+import {
+  FakeActingMembers,
+  partyWebWith,
+  stopWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { readTask } from '../commands/research/research-input.js';
+import { reportResearchAs, stopsByKey } from '../commands/research/research-report.js';
+import { reportRocketAs } from '../commands/rocket/rocket-report.js';
+import { DISCORD_CHANNEL } from '../render/research.js';
+import type { StopReportsView } from '../domain/web/stop-report-data.js';
+import { StopPostService } from '../services/stop-posts.js';
+import { STOP_REPORTS_PER_MINUTE, type StopWebDeps } from './stop-routes.js';
+
+const URL = `/s/${FAKE_GUILD_ID}/api/stop-reports`;
+const DRAGON = pageTask('Catch a Dragon-type Pokémon');
+const ALICE_AS = { id: ALICE, name: 'Alice' };
+
+/**
+ * The map of the fakes' server over the stop reports' services, Alice and Bob members, the clock
+ * at `STOP_NOON` (Date faked to it too); the pinned posts hold every task in a message of their
+ * own (`posts`), unless `posts` makes the real ones of the context.
+ */
+async function setup(
+  postsOf: (made: Awaited<ReturnType<typeof stopReportingWith>>) => StopWebDeps['posts'] = () => ({
+    linkOf: (channelId: string, key: string) => `${channelId.slice(-2)}${key.length}`,
+  }),
+) {
+  const made = await stopReportingWith();
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const posts = postsOf(made);
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made.made, { acting: new FakeActingMembers().add(ALICE, 'Alice') }),
+    stops: stopWebWith(made.ctx, { posts, grunts: made.grunts }),
+  });
+  web.clock.now = STOP_NOON;
+  const research = async (keys: string[], reporter = ALICE_AS) =>
+    reportResearchAs(made.ctx, FAKE_GUILD_ID, {
+      stops: await stopsByKey(made.ctx, FAKE_GUILD_ID, keys),
+      subject: readTask(made.ctx, DRAGON.key, null),
+      reporter,
+    });
+  const rocket = async (who: string, key: string, reporter = ALICE_AS) => {
+    const [stop] = await stopsByKey(made.ctx, FAKE_GUILD_ID, [key]);
+    if (!stop) throw new Error('no stop');
+    return reportRocketAs(
+      made.ctx,
+      FAKE_GUILD_ID,
+      { choice: feedChoice(who), stop, reporter },
+      DISCORD_CHANNEL,
+    );
+  };
+  const ask = async (userId = ALICE, headers: Record<string, string> = {}) => {
+    const cookie = await web.loggedIn(userId, 'x');
+    const answer = await web.app.inject({
+      method: 'GET',
+      url: URL,
+      headers: { cookie, ...headers },
+    });
+    return answer;
+  };
+  return { ...made, web, members, research, rocket, ask };
+}
+
+describe('the reports at stops on the map', () => {
+  let web: TestWeb | undefined;
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: STOP_NOON });
+  });
+  afterEach(async () => {
+    vi.useRealTimers();
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('gives a member today’s research, grunts and hideouts, with their links', async () => {
+    const made = await setup();
+    web = made.web;
+    await made.research([wayspotId(1), wayspotId(3)]);
+    await made.rocket('grunt:water', wayspotId(2));
+    await made.rocket('leader:arlo', wayspotId(1), { id: BOB, name: '' });
+    const answer = await made.ask();
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['cache-control']).toBe('private, no-cache');
+    const view = answer.json<StopReportsView>();
+    expect(
+      view.research.map((one) => [one.stop.name, one.text, one.reporter, one.mayTakeBack]),
+    ).toEqual([
+      ['Yellow Mural', DRAGON.text, 'Alice', true],
+      ['East Fountain', DRAGON.text, 'Alice', true],
+    ]);
+    // The pinned post's message that holds the task, in the region the stop lies in.
+    expect(view.research[0]?.link).toBe(
+      `https://discord.com/channels/${FAKE_GUILD_ID}/${WEST_CHANNEL}/01${String(DRAGON.key.length)}`,
+    );
+    expect(view.research[1]?.link).toBe(
+      `https://discord.com/channels/${FAKE_GUILD_ID}/${EAST_CHANNEL}/02${String(DRAGON.key.length)}`,
+    );
+    const [message] = made.made.gateway.messagesIn(WEST_CHANNEL);
+    expect(view.grunts).toMatchObject([
+      {
+        who: 'grunt:water',
+        name: 'Water-type grunt',
+        stop: { name: 'Paititi Inti' },
+        link: `https://discord.com/channels/${FAKE_GUILD_ID}/${WEST_CHANNEL}/${message?.id ?? ''}`,
+      },
+    ]);
+    expect(view.hideouts).toMatchObject([
+      { who: 'leader:arlo', name: 'Arlo', reporter: 'a member', mayTakeBack: false },
+    ]);
+  });
+
+  it('leaves out what lies only in a region whose forum keeps the member out', async () => {
+    const made = await setup();
+    web = made.web;
+    await made.research([wayspotId(1), wayspotId(3)]);
+    made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
+    const view = (await made.ask()).json<StopReportsView>();
+    expect(view.research.map((one) => one.stop.name)).toEqual(['Yellow Mural']);
+    const bob = (await made.ask(BOB)).json<StopReportsView>();
+    expect(bob.research.map((one) => one.stop.name)).toEqual(['Yellow Mural', 'East Fountain']);
+  });
+
+  it('answers 304 for the view the page has, and anew once a report comes or goes', async () => {
+    const made = await setup();
+    web = made.web;
+    const first = await made.ask();
+    const etag = String(first.headers.etag);
+    expect((await made.ask(ALICE, { 'if-none-match': etag })).statusCode).toBe(304);
+    // A grunt tells the posts nothing: the view follows the reports themselves.
+    await made.rocket('grunt:water', wayspotId(2));
+    const after = await made.ask(ALICE, { 'if-none-match': etag });
+    expect(after.statusCode).toBe(200);
+    expect(after.json<StopReportsView>().grunts).toHaveLength(1);
+    // Its half hour over: gone from the view, though the store keeps it until the upkeep.
+    vi.setSystemTime(STOP_NOON + 31 * 60_000);
+    made.web.clock.now = STOP_NOON + 31 * 60_000;
+    expect((await made.ask()).json<StopReportsView>().grunts).toEqual([]);
+  });
+
+  it('is for members: 401 without a session, 403 for others, 503 while Discord cannot say', async () => {
+    const made = await setup();
+    web = made.web;
+    expect((await made.web.app.inject({ method: 'GET', url: URL })).statusCode).toBe(401);
+    expect((await made.ask('200000000000000099')).statusCode).toBe(403);
+    made.members.failing = new Error('Discord is away');
+    expect((await made.ask()).statusCode).toBe(503);
+  });
+
+  it('answers one address only so often', async () => {
+    const made = await setup();
+    web = made.web;
+    const cookie = await made.web.loggedIn(ALICE, 'Alice');
+    let status = 0;
+    for (let n = 0; n <= STOP_REPORTS_PER_MINUTE; n++) {
+      status = (await made.web.app.inject({ method: 'GET', url: URL, headers: { cookie } }))
+        .statusCode;
+    }
+    expect(status).toBe(429);
+  });
+
+  it('gives no report of another server', async () => {
+    const made = await setup();
+    web = made.web;
+    await made.research([wayspotId(1)]);
+    await made.ctx.stopReports.reportResearch({
+      serverId: OTHER_GUILD_ID,
+      stops: await stopsByKey(made.ctx, FAKE_GUILD_ID, [wayspotId(2)]),
+      subject: readTask(made.ctx, DRAGON.key, null),
+      reporter: ALICE_AS,
+    });
+    expect(made.store.rows.size).toBe(2);
+    const view = (await made.ask()).json<StopReportsView>();
+    expect(view.research.map((one) => one.stop.name)).toEqual(['Yellow Mural']);
+  });
+
+  it('places the reports in their regions once a request, however many there are', async () => {
+    const made = await setup();
+    web = made.web;
+    const all = vi.spyOn(made.ctx.regions, 'all');
+    await made.research([wayspotId(1)]);
+    all.mockClear();
+    await made.ask();
+    const once = all.mock.calls.length;
+    await made.research([wayspotId(2), wayspotId(3)]);
+    await made.rocket('grunt:water', wayspotId(2));
+    all.mockClear();
+    await made.ask();
+    expect(all.mock.calls.length).toBe(once);
+  });
+
+  it('reads the pinned posts as last drawn, and never draws one itself', async () => {
+    let posts: StopPostService | undefined;
+    const made = await setup((reporting) => {
+      posts = new StopPostService({
+        storage: new MemoryStopPosts(),
+        reports: reporting.ctx.stopReports,
+        events: reporting.ctx.raidEvents,
+        regions: reporting.ctx.regions,
+        guilds: reporting.ctx.guilds,
+        gateway: reporting.made.gateway,
+        zone: reporting.ctx.config.settings.timezone,
+        log: reporting.ctx.log,
+        now: () => STOP_NOON,
+        // Long enough that only `flush` draws while the test runs.
+        delayMs: 60_000,
+      });
+      return posts;
+    });
+    web = made.web;
+    if (!posts) throw new Error('no posts');
+    try {
+      await made.research([wayspotId(1)]);
+      await posts.flush();
+      const [post] = made.made.gateway.messagesIn(WEST_CHANNEL);
+      const calls = [...made.made.gateway.calls];
+      // A change still gathering: the poll shows the post as drawn, and draws nothing.
+      await made.rocket('leader:arlo', wayspotId(2));
+      const view = (await made.ask()).json<StopReportsView>();
+      expect(view.research[0]?.link).toBe(
+        `https://discord.com/channels/${FAKE_GUILD_ID}/${WEST_CHANNEL}/${post?.id ?? ''}`,
+      );
+      expect(view.hideouts).toHaveLength(1);
+      expect(made.made.gateway.calls).toEqual(calls);
+    } finally {
+      await posts.close();
+    }
+  });
+});
diff --git a/src/web/stop-routes.ts b/src/web/stop-routes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..16d861b90bc54731bcad9560d60a898e7b87cb03
--- /dev/null
+++ b/src/web/stop-routes.ts
@@ -0,0 +1,170 @@
+import type { FastifyInstance } from 'fastify';
+import type { AppContext } from '../app-context.js';
+import type { ResearchReporting } from '../commands/research/research-report.js';
+import type { RocketReporting } from '../commands/rocket/rocket-report.js';
+import type { Region } from '../db/repositories/region-repository.js';
+import { isRocketReport, type StopReport } from '../domain/stops/report.js';
+import { stopReportView } from '../domain/web/stop-report-view.js';
+import { postLink } from '../render/notify-dm.js';
+import type { GruntMessageService } from '../services/grunt-messages.js';
+import { regionsAtPoints } from '../services/region-directory.js';
+import type { StopPostService } from '../services/stop-posts.js';
+import { isHideoutReport } from '../services/stop-reports.js';
+import { isMapStaff } from './acting.js';
+import { sendFailure } from './answers.js';
+import { etagMatches, etagOf } from './geo-cache.js';
+import type { GuildRequest } from './guild-routes.js';
+import { UNCONFIRMED } from './party-routes.js';
+import type { PartyViewer, PartyViewers } from './party-viewers.js';
+import { limitedPerAddress, RateLimiter } from './rate-limit.js';
+import type { WebDeps } from './server.js';
+
+/**
+ * What the reports at stops of the live map read and call (plan 8R-3): exactly what `/research`
+ * and `/rocket` use (the stop reports, `RocketService`, the regions and kept stops, the task list
+ * and the lineups with what reads them, the place search's stop index, the settings), so that the
+ * map shares their code paths.
+ */
+export type StopWebContext = ResearchReporting &
+  RocketReporting &
+  Pick<AppContext, 'researchTasks' | 'rocketLineups' | 'pokemon' | 'gameData' | 'placeFinder'>;
+
+/** What the reports at stops of the live map need beyond the parties' own (`PartyWebDeps`). */
+export interface StopWebDeps {
+  ctx: StopWebContext;
+  /** A channel's name as the bot sees it now: a region's, which an answer names. */
+  channelName(channelId: string): string | undefined;
+  /**
+   * Which message of a region channel's pinned post holds a task or a hideout, as last drawn
+   * (`StopPostService.linkOf`: read only, never a draw); undefined in rehearsal mode (no posts).
+   */
+  posts: Pick<StopPostService, 'linkOf'> | undefined;
+  /** The grunts' messages, read for many reports at once; undefined in rehearsal mode. */
+  grunts: Pick<GruntMessageService, 'messagesOfReports'> | undefined;
+}
+
+/**
+ * The requests for a server's reports at stops one address may make in a minute: a page asks as
+ * often as it asks for the parties (`PARTIES_PER_MINUTE`).
+ */
+export const STOP_REPORTS_PER_MINUTE = 30;
+
+/**
+ * The reports at stops of the live map (plan 8R-3; design 8, 9.16): today's reports of the server
+ * as the member may see them (`GET /s/<guild>/api/stop-reports`). Who sees what is the parties'
+ * rule (`PartyViewers`, shared with `/api/parties`): a report shows in a region unless the member
+ * is barred from that region's forum, and a report lies in the regions whose outlines hold its
+ * stop's snapshot.
+ */
+export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: PartyViewers): void {
+  const { sessions, stops } = deps;
+  const { ctx } = stops;
+
+  /**
+   * The regions of the server (`row`) whose outlines hold each report's stop as it was reported,
+   * by report: placed once a request (`regionsAtPoints`: each outline's box first), for who may
+   * see them and for the view alike.
+   */
+  const placesOf = (row: number, reports: readonly StopReport[]): Places => {
+    const at = regionsAtPoints(ctx.regions.all(), row);
+    return new Map(reports.map((report) => [report.id, at(report.stop)]));
+  };
+
+  /**
+   * The regions of a report the member may see: a region without a forum, or one whose forum
+   * does not keep them out.
+   */
+  const seenIn = (regions: readonly Region[], viewer: { barred: Set<string> }): Region[] =>
+    regions.filter(
+      (region) => region.forumChannelId === null || !viewer.barred.has(region.forumChannelId),
+    );
+
+  /**
+   * The view of a member (`stopReportView`): each report in the regions the member sees, with
+   * its link there (the message of the pinned post that holds a task or a hideout; a grunt's own
+   * message, every grunt's read in one go).
+   */
+  const viewFor = async (
+    guild: string,
+    places: Places,
+    reports: readonly StopReport[],
+    viewer: Extract<PartyViewer, { kind: 'member' }>,
+    userId: string,
+  ): Promise<string> => {
+    const seen = new Map(
+      reports.map((report) => [report.id, seenIn(places.get(report.id) ?? [], viewer)]),
+    );
+    const grunts = reports.filter(
+      (report) =>
+        isRocketReport(report) &&
+        !isHideoutReport(report) &&
+        (seen.get(report.id) ?? []).length > 0,
+    );
+    const messages =
+      grunts.length === 0 || stops.grunts === undefined
+        ? new Map<number, { channelId: string; messageId: string }[]>()
+        : await stops.grunts.messagesOfReports(grunts.map((report) => report.id));
+    const link = (report: StopReport): string | undefined => {
+      const channels = (seen.get(report.id) ?? []).map((region) => region.channelId);
+      if (isRocketReport(report) && !isHideoutReport(report)) {
+        const message = messages.get(report.id)?.find((one) => channels.includes(one.channelId));
+        return message && postLink(guild, message.channelId, message.messageId);
+      }
+      for (const channelId of channels) {
+        const messageId = stops.posts?.linkOf(channelId, report.subjectKey);
+        if (messageId !== undefined) return postLink(guild, channelId, messageId);
+      }
+      return undefined;
+    };
+    const now = deps.now();
+    return JSON.stringify(
+      stopReportView({
+        reports,
+        period: ctx.stopReports.period(now),
+        now,
+        zone: ctx.config.settings.timezone,
+        shown: (report) => (seen.get(report.id) ?? []).length > 0,
+        memberId: userId,
+        staff: isMapStaff(viewer.standing, userId, deps.parties.ownerId),
+        readOnly: viewer.readOnly,
+        link,
+        pictureOrigins: deps.pictureOrigins,
+      }),
+    );
+  };
+
+  /** The forums of the regions the reports lie in, which say who may see them. */
+  const forumsOf = (places: Places): string[] =>
+    [...places.values()].flatMap((regions) =>
+      regions.flatMap((region) => (region.forumChannelId === null ? [] : [region.forumChannelId])),
+    );
+
+  // Today's reports at the stops of the server (design 9.16): read anew on every request (one
+  // indexed query; the page polls it), for members only, as the parties; an ETag of the member's
+  // JSON, `private, no-cache`, 304 when the page has it.
+  const limiter = new RateLimiter({ uses: STOP_REPORTS_PER_MINUTE, perMs: 60_000 });
+  scope.get(
+    '/api/stop-reports',
+    { onRequest: limitedPerAddress(limiter, { now: deps.now }) },
+    async (request: GuildRequest, reply) => {
+      void reply.header('cache-control', 'private, no-cache');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 401);
+      const { guild } = request.params;
+      const row = await ctx.guilds.idFor(guild);
+      const reports = row === undefined ? [] : await ctx.stopReports.standing(guild);
+      const places: Places = row === undefined ? new Map() : placesOf(row, reports);
+      const viewer = await viewers.viewer(guild, session.userId, forumsOf(places));
+      if (viewer.kind === 'not-member') return sendFailure(request, reply, 403);
+      if (viewer.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
+      const body = await viewFor(guild, places, reports, viewer, session.userId);
+      const etag = etagOf(body);
+      void reply.header('etag', etag);
+      if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
+      return reply.type('application/json; charset=utf-8').send(body);
+    },
+  );
+}
+
+/** The regions each report lies in, by the report's id. */
+type Places = ReadonlyMap<number, readonly Region[]>;
diff --git a/test/support/rocket-store-cases.ts b/test/support/rocket-store-cases.ts
index 9d82dd9ffbfc1f24d11781e56cb78f00c3f7c374..a420fded55323118ff5963f5e0d697cfe21c29b9 100644
--- a/test/support/rocket-store-cases.ts
+++ b/test/support/rocket-store-cases.ts
@@ -65,6 +65,20 @@ export function gruntMessageCases(made: () => Promise<GruntMessageStorage>): voi
     ]);
     expect(await store.ofReport(9)).toEqual([]);
   });
+
+  it('gives the messages of several reports in one read, by report (plan 8R-3)', async () => {
+    const store = await made();
+    await store.add(gruntRow(3, { reportId: 2 }));
+    await store.add(gruntRow(1));
+    await store.add(gruntRow(2, { channelId: '400000000000000002' }));
+    await store.add(gruntRow(4, { reportId: 3 }));
+    expect(await store.ofReports([2, 1, 9])).toEqual([
+      gruntRow(1),
+      gruntRow(2, { channelId: '400000000000000002' }),
+      gruntRow(3, { reportId: 2 }),
+    ]);
+    expect(await store.ofReports([])).toEqual([]);
+  });
 }
 
 /** What the kept Rocket lineups do, run against the repository and its twin in memory alike. */
diff --git a/test/support/rocket-store.ts b/test/support/rocket-store.ts
index 908f7a10d41db5eb88ad3c985282bd6c9772c928..14ac7cd89f223f507c23be3f21e20da725195788 100644
--- a/test/support/rocket-store.ts
+++ b/test/support/rocket-store.ts
@@ -55,6 +55,15 @@ export class MemoryGruntMessages implements GruntMessageStorage {
         .sort((a, b) => a.messageId.localeCompare(b.messageId)),
     );
   }
+
+  ofReports(reportIds: readonly number[]): Promise<GruntMessageRow[]> {
+    return this.attempt('ofReports', () =>
+      this.rows
+        .filter((row) => reportIds.includes(row.reportId))
+        .map((row) => ({ ...row }))
+        .sort((a, b) => a.reportId - b.reportId || a.messageId.localeCompare(b.messageId)),
+    );
+  }
 }
 
 /** The kept Rocket lineups in memory (`RocketLineupStorage`), the twin of `RocketLineupRepository`. */
diff --git a/test/support/stop-reporting.ts b/test/support/stop-reporting.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f3b150ea9d0aa7aba1bcc575779897014cfdab2c
--- /dev/null
+++ b/test/support/stop-reporting.ts
@@ -0,0 +1,60 @@
+import type { WayspotRow } from '../../src/domain/wayspots/kept.js';
+import { GruntMessageService } from '../../src/services/grunt-messages.js';
+import { RocketService } from '../../src/services/rocket-reports.js';
+import { StopReportService } from '../../src/services/stop-reports.js';
+import { partyServiceWith } from './party-service.js';
+import { MemoryGruntMessages } from './rocket-store.js';
+import { MemoryStopReports } from './stop-reports.js';
+import { createTestContext } from './test-context.js';
+import { keptRow } from './wayspot-cases.js';
+import { wayspotsWith } from './wayspots.js';
+
+/** Noon in Pittsburgh on 2026-10-22, an ordinary Thursday: no report meets a real midnight. */
+export const STOP_NOON = Date.UTC(2026, 9, 22, 16);
+
+/** PokéStops in West (1, 2) and East (3), and a power spot in West (5). */
+export const STOP_ROWS: readonly WayspotRow[] = [
+  keptRow(1, { title: 'Yellow Mural', lat: 40.06, lon: -80.06, address: null }),
+  keptRow(2, { title: 'Paititi Inti', lat: 40.061, lon: -80.06, address: null }),
+  keptRow(3, { title: 'East Fountain', lat: 40.05, lon: -79.95, address: null }),
+  keptRow(5, { title: 'Library Garden', kind: 'powerspot', lat: 40.0502, lon: -80.0502 }),
+];
+
+/**
+ * Reporting at stops over the services, as `/research`, `/rocket` and the map do (plan 8R-3): the
+ * party services of `partyServiceWith` (`made`: its fake gateway holds the forums, who is barred,
+ * and the grunts' messages), the kept stops `rows`, a context (`createTestContext`) with the stop
+ * reports (`store`), the grunts' messages (`grunts`, over `gruntStore`; their timers never run) and
+ * `RocketService`, and its place search built. The services read `Date.now()`: fake `Date` to
+ * `STOP_NOON` before calling it.
+ */
+export async function stopReportingWith(rows: readonly WayspotRow[] = STOP_ROWS) {
+  const made = await partyServiceWith();
+  const { wayspots } = await wayspotsWith(rows);
+  const store = new MemoryStopReports();
+  const { ctx, entries } = createTestContext({ wayspots });
+  const stopReports = new StopReportService({
+    store,
+    events: ctx.raidEvents,
+    zone: ctx.config.settings.timezone,
+    log: ctx.log,
+  });
+  const gruntStore = new MemoryGruntMessages();
+  const grunts = new GruntMessageService({
+    gateway: made.gateway,
+    store: gruntStore,
+    reports: stopReports,
+    log: ctx.log,
+    setTimer: () => () => undefined,
+  });
+  const rocket = new RocketService({
+    reports: stopReports,
+    messages: grunts,
+    regions: ctx.regions,
+    guilds: ctx.guilds,
+    log: ctx.log,
+  });
+  Object.assign(ctx, { stopReports, rocket });
+  await ctx.placeFinder.built();
+  return { made, ctx, store, grunts, gruntStore, entries };
+}
diff --git a/test/support/web.ts b/test/support/web.ts
index fc4aa114a7aeced69fe1181a512f0628168efc05..45a7b851d8ac6dad0798e3e4bf7586f2fd49b1df 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -21,6 +21,7 @@ import type { SpawnWebContext, SpawnWebDeps } from '../../src/web/spawn-routes.j
 import type { TrainWebContext, TrainWebDeps } from '../../src/web/train-routes.js';
 import type { MeetupWebContext, MeetupWebDeps } from '../../src/web/meetup-routes.js';
 import type { MaxWebContext, MaxWebDeps } from '../../src/web/max-routes.js';
+import type { StopWebContext, StopWebDeps } from '../../src/web/stop-routes.js';
 import { Throttles } from '../../src/discord/throttle.js';
 import type { Team } from '../../src/domain/party/party.js';
 import type { Member } from '../../src/services/attendance-service.js';
@@ -386,6 +387,32 @@ const NO_MAXES: MaxWebDeps = {
   channelName: () => undefined,
 };
 
+/**
+ * Reports at stops on the map over a test's context (`stopReportingWith`'s), as the bot wires
+ * it (plan 8R-3). Pass as `stops`. `channelName` names the channels the bot sees (none by
+ * default); `posts` says which message of a pinned post holds a task (none by default);
+ * `grunts` reads the grunts' messages (give `stopReportingWith`'s; none by default).
+ */
+export function stopWebWith(
+  ctx: StopWebContext,
+  options: Partial<Omit<StopWebDeps, 'ctx'>> = {},
+): StopWebDeps {
+  return { ctx, channelName: () => undefined, posts: undefined, grunts: undefined, ...options };
+}
+
+/** No reports at stops: a test that has them passes `stopWebWith`. */
+const NO_STOPS: StopWebDeps = {
+  ctx: new Proxy({} as StopWebContext, {
+    get(_target, property) {
+      if (typeof property === 'symbol' || property === 'then') return undefined;
+      throw new Error('no reports at stops in this test: give stopWebWith');
+    },
+  }),
+  channelName: () => undefined,
+  posts: undefined,
+  grunts: undefined,
+};
+
 /** No overwrite of a member's own keeps anybody out of a channel. */
 const NOBODY_KEPT_OUT: SpawnWebDeps['channels'] = { ownViewDenied: () => Promise.resolve(false) };
 
@@ -496,6 +523,8 @@ export interface WebTestOptions {
   meetups?: MeetupWebDeps;
   /** Max battles on the map: power spots, pick lists, reports (`maxWebWith`); none by default. */
   maxes?: MaxWebDeps;
+  /** Reports at stops on the map (`stopWebWith`); none by default. */
+  stops?: StopWebDeps;
   /** The Wayspot export tool and who may have it (`toolWebWith`); no tool file by default. */
   tool?: ToolWebDeps;
 }
@@ -669,6 +698,7 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
     trains: options.trains ?? NO_TRAINS,
     meetups: options.meetups ?? NO_MEETUPS,
     maxes: options.maxes ?? NO_MAXES,
+    stops: options.stops ?? NO_STOPS,
     tool: options.tool ?? NO_TOOL,
     now: () => clock.now,
     log,
````

### Task 3: 8R-3 task 3: the pick lists of research and Rocket reports on the map

Prototype commit: `f51da6f67d5fc9d55fc52c7573f848130d068d7a`

GET /s/<guild>/api/research-options gives /research's task list whole
(key, text, category, rewards with the values a filter and a report
take), whether it is out of date (staleAfterHours) and the items and
Mega Energy a typed task's reward may name; GET .../api/rocket-options
gives /rocket's choices in its order, whether each is a hideout, the
catches, and Giovanni's note (GIOVANNI_ONLY_WHEN_SURE, also in
/rocket report's help). Members, an ETag of the JSON, 304, 30 a minute
per address each. A test shows /api/stops lists stops of Pine's own by
the pine-<id> key the reports take.

**Files:**

```
 src/commands/rocket/rocket-input.ts        |   5 ++
 src/commands/rocket/rocket.ts              |   4 +-
 src/domain/web/stop-report-data.ts         |   6 ++-
 src/services/research-task-service.test.ts |   9 ++++
 src/services/research-task-service.ts      |  14 +++--
 src/services/rocket-lineup-service.test.ts |   9 ++++
 src/services/rocket-lineup-service.ts      |  14 +++--
 src/web/stop-options.test.ts               | 202 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/stop-options.ts                    |  66 +++++++++++++++++++++++
 src/web/stop-routes.ts                     |  58 +++++++++++++++++++-
 test/support/research.ts                   |   9 ++--
 test/support/rocket.ts                     |   9 ++--
 test/support/stop-reporting.ts             |   9 ++--
 13 files changed, 394 insertions(+), 20 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/services/research-task-service.test.ts src/services/rocket-lineup-service.test.ts src/web/stop-options.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff f51da6f67d5fc9d55fc52c7573f848130d068d7a -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-3 task 3: the pick lists of research and Rocket reports on the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/rocket/rocket-input.ts b/src/commands/rocket/rocket-input.ts
index 0bd6aa1e1a176340ab41830bea44614f05f486a3..808b27d60f1af0fac5d2c60c72ddd4885f21e3ab 100644
--- a/src/commands/rocket/rocket-input.ts
+++ b/src/commands/rocket/rocket-input.ts
@@ -54,6 +54,11 @@ export function rocketWindow(settings: Pick<Settings, 'rocket'>): string {
 /** What a choice of Giovanni says (design 5.2: report him only once sure it is him). */
 const GIOVANNI_NOTE = ' (only when sure it is him)';
 
+/** Why, in full: `/rocket report`'s help, and the note of Giovanni's choice on the map. */
+export const GIOVANNI_ONLY_WHEN_SURE =
+  'Report Giovanni only once you have seen it is really him: many stops that look like him are ' +
+  'decoys, which you report as "Decoy grunt".';
+
 /** A choice as the list offers it: `Water-type grunt · Mudkip, Tentacool, Krabby +2`. */
 export function whoChoice(choice: RocketChoice): Choice {
   const catches = catchesInShort(choice.catches);
diff --git a/src/commands/rocket/rocket.ts b/src/commands/rocket/rocket.ts
index 9537f938638ef3d3d28c5f61283c7c14217a17ce..c3e3413c6bafd31b2ea5a8721255cdb397acdf5f 100644
--- a/src/commands/rocket/rocket.ts
+++ b/src/commands/rocket/rocket.ts
@@ -42,6 +42,7 @@ import {
 } from '../research/research-report.js';
 import { hideoutQuestion, reportRocketAs } from './rocket-report.js';
 import {
+  GIOVANNI_ONLY_WHEN_SURE,
   NOT_A_ROCKET_STOP,
   readWho,
   ROCKET_FROM_A_REGION,
@@ -232,8 +233,7 @@ const reportRocket: SubcommandPart = {
       'theirs (your region’s first), or paste a maps link to a stop. A grunt is posted in the ' +
       `region’s channel for ${String(settings.rocket.gruntMinutes)} minutes; a leader, Giovanni ` +
       'or a decoy grunt goes in the pinned post "Today at the stops" until midnight, and keeps ' +
-      'grunts away from the stop all day. Report Giovanni only once you have seen it is really ' +
-      'him: many stops that look like him are decoys, which you report as "Decoy grunt". A ' +
+      `grunts away from the stop all day. ${GIOVANNI_ONLY_WHEN_SURE} A ` +
       'stop has one report: a newer one replaces it (a grunt where a hideout was reported asks ' +
       'first), and the same grunt twice is answered with the report that stands. Members who ' +
       'want it get a direct message. Your answer takes the report back. You can make ' +
diff --git a/src/domain/web/stop-report-data.ts b/src/domain/web/stop-report-data.ts
index 1b79ae23748cf60e9f4cc25e4cfa1533bbb78a76..e494dc7c3f8ee92143dd696e40e4bb069e5424ef 100644
--- a/src/domain/web/stop-report-data.ts
+++ b/src/domain/web/stop-report-data.ts
@@ -136,9 +136,13 @@ export interface RocketWhoOption {
   note?: string;
 }
 
-/** The pick list of a Rocket report: `/rocket`'s choices in its order; `stale` as the tasks'. */
+/**
+ * The pick list of a Rocket report: `/rocket`'s choices in its order; `stale` (not read for
+ * `settings.rocket.staleAfterHours`, or never) and when it was read, as the tasks'.
+ */
 export interface RocketOptionsView {
   stale: boolean;
+  readAt: number | null;
   choices: RocketWhoOption[];
 }
 
diff --git a/src/services/research-task-service.test.ts b/src/services/research-task-service.test.ts
index ae363e3686898561fc88def3675547fc8cd161f9..cdd89c828ff39890311b32aa11e2a320b863333b 100644
--- a/src/services/research-task-service.test.ts
+++ b/src/services/research-task-service.test.ts
@@ -181,6 +181,15 @@ describe('ResearchTaskService', () => {
     expect(said('the research task list is out of date')).toBe(2);
   });
 
+  it('says whether its list is out of date by the rule the log follows (plan 8R-3: the map)', async () => {
+    const { service } = serviceWith(() => page());
+    // Never read: out of date.
+    expect(service.stale(NOW)).toBe(true);
+    await service.refresh();
+    expect(service.stale(NOW + 6 * HOUR - 1)).toBe(false);
+    expect(service.stale(NOW + 6 * HOUR)).toBe(true);
+  });
+
   it('reads at start only when its list is older than the refresh, then every refresh', async () => {
     vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
     const store = new MemoryResearchTasks();
diff --git a/src/services/research-task-service.ts b/src/services/research-task-service.ts
index f647ccbddd756e811f9e747fa46c692ea35552de..10fd3b421b260fb877dcda1955707b3f8b7d4052 100644
--- a/src/services/research-task-service.ts
+++ b/src/services/research-task-service.ts
@@ -47,6 +47,11 @@ export interface ResearchTaskProvider {
   byKey(key: string): ResearchTask | undefined;
   /** When the list in use was read, epoch milliseconds; undefined while none was. */
   readAt(): number | undefined;
+  /**
+   * Whether the list is out of date at `now`: none was read, or not anew for `staleAfterMs`
+   * (the rule the log's warning follows; the map's pick list says it, plan 8R-3).
+   */
+  stale(now: number): boolean;
 }
 
 export type ResearchRefresh =
@@ -104,6 +109,10 @@ export class ResearchTaskService implements ResearchTaskProvider {
     return this.read;
   }
 
+  stale(now: number): boolean {
+    return this.read === undefined || now - this.read >= this.options.staleAfterMs;
+  }
+
   /** Takes the list kept by the last run (no network). */
   async load(): Promise<void> {
     const kept = await this.options.store.kept();
@@ -213,14 +222,13 @@ export class ResearchTaskService implements ResearchTaskProvider {
    */
   private shrinkAgreed(shrunk: string): boolean {
     if (this.shrink === shrunk) return true;
-    return this.read !== undefined && this.now() - this.read >= this.options.staleAfterMs;
+    return this.read !== undefined && this.stale(this.now());
   }
 
   /** Says once in the log that the list is out of date, until a read succeeds again. */
   private tellIfStale(): void {
-    if (this.staleTold) return;
+    if (this.staleTold || !this.stale(this.now())) return;
     const read = this.read;
-    if (read !== undefined && this.now() - read < this.options.staleAfterMs) return;
     this.staleTold = true;
     this.options.log.warn(
       { readAt: read === undefined ? null : new Date(read).toISOString() },
diff --git a/src/services/rocket-lineup-service.test.ts b/src/services/rocket-lineup-service.test.ts
index 2fc36b4c937d4fe9ebf2459449be978dc31fe7d0..acbd7d10b4b4b37e136eaed2c041827a738cb580 100644
--- a/src/services/rocket-lineup-service.test.ts
+++ b/src/services/rocket-lineup-service.test.ts
@@ -151,6 +151,15 @@ describe('RocketLineupService', () => {
     expect(said('Rocket lineups read')).toBe(2);
   });
 
+  it('says whether its list is out of date by the rule the log follows (plan 8R-3: the map)', async () => {
+    const { service } = serviceWith(() => feed());
+    // Never read: out of date.
+    expect(service.stale(NOW)).toBe(true);
+    await service.refresh();
+    expect(service.stale(NOW + 24 * HOUR - 1)).toBe(false);
+    expect(service.stale(NOW + 24 * HOUR)).toBe(true);
+  });
+
   it('reads at start only when its list is older than the refresh, then every refresh', async () => {
     vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
     const store = new MemoryRocketLineups();
diff --git a/src/services/rocket-lineup-service.ts b/src/services/rocket-lineup-service.ts
index 41de407867d8a60866fa530241e2ef43fe1032dc..072c4cd78d655b650809a693485251372a2db5a8 100644
--- a/src/services/rocket-lineup-service.ts
+++ b/src/services/rocket-lineup-service.ts
@@ -38,6 +38,11 @@ export interface RocketLineupProvider {
   byKey(key: string): RocketChoice | undefined;
   /** When the list in use was read, epoch milliseconds; undefined while none was. */
   readAt(): number | undefined;
+  /**
+   * Whether the list is out of date at `now`: none was read, or not anew for `staleAfterMs`
+   * (the rule the log's warning follows; the map's pick list says it, plan 8R-3).
+   */
+  stale(now: number): boolean;
 }
 
 export type RocketRefresh =
@@ -93,6 +98,10 @@ export class RocketLineupService implements RocketLineupProvider {
     return this.read;
   }
 
+  stale(now: number): boolean {
+    return this.read === undefined || now - this.read >= this.options.staleAfterMs;
+  }
+
   /** Takes the list kept by the last run (no network). */
   async load(): Promise<void> {
     const kept = await this.options.store.kept();
@@ -201,14 +210,13 @@ export class RocketLineupService implements RocketLineupProvider {
    */
   private shrinkAgreed(shrunk: string): boolean {
     if (this.shrink === shrunk) return true;
-    return this.read !== undefined && this.now() - this.read >= this.options.staleAfterMs;
+    return this.read !== undefined && this.stale(this.now());
   }
 
   /** Says once in the log that the list is out of date, until a read succeeds again. */
   private tellIfStale(): void {
-    if (this.staleTold) return;
+    if (this.staleTold || !this.stale(this.now())) return;
     const read = this.read;
-    if (read !== undefined && this.now() - read < this.options.staleAfterMs) return;
     this.staleTold = true;
     this.options.log.warn(
       { readAt: read === undefined ? null : new Date(read).toISOString() },
diff --git a/src/web/stop-options.test.ts b/src/web/stop-options.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5e015c789a5af4cc59df1ecc0113eeb8b34ca57b
--- /dev/null
+++ b/src/web/stop-options.test.ts
@@ -0,0 +1,202 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB } from '../../test/support/parties.js';
+import { pageTask, researchTasksFixture } from '../../test/support/research.js';
+import { feedChoice, rocketLineupsFixture } from '../../test/support/rocket.js';
+import { STOP_NOON, stopReportingWith } from '../../test/support/stop-reporting.js';
+import {
+  meetupWebWith,
+  partyWebWith,
+  stopWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { stopsByKey } from '../commands/research/research-report.js';
+import type { StopsView } from '../domain/web/meetup-data.js';
+import type { ResearchOptionsView, RocketOptionsView } from '../domain/web/stop-report-data.js';
+import { GIOVANNI_ONLY_WHEN_SURE } from '../commands/rocket/rocket-input.js';
+
+const RESEARCH = `/s/${FAKE_GUILD_ID}/api/research-options`;
+const ROCKET = `/s/${FAKE_GUILD_ID}/api/rocket-options`;
+const HOUR = 3_600_000;
+
+async function setup(settings: { memberRole?: string } = {}) {
+  const made = await stopReportingWith();
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice');
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made.made),
+    meetups: meetupWebWith(made.ctx),
+    stops: stopWebWith(made.ctx),
+    web: settings,
+  });
+  web.clock.now = STOP_NOON;
+  const cookie = await web.loggedIn(ALICE, 'Alice');
+  const ask = (url: string, headers: Record<string, string> = {}) =>
+    web.app.inject({ method: 'GET', url, headers: { cookie, ...headers } });
+  return { ...made, web, members, ask };
+}
+
+describe('the pick lists of reports at stops', () => {
+  let web: TestWeb | undefined;
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: STOP_NOON });
+  });
+  afterEach(async () => {
+    vi.useRealTimers();
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('gives the whole task list as /research offers it, with the rewards a typed task names', async () => {
+    const made = await setup();
+    web = made.web;
+    const answer = await made.ask(RESEARCH);
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['cache-control']).toBe('private, no-cache');
+    const view = answer.json<ResearchOptionsView>();
+    // The list of 2026-10-21, read more than six hours before the clock: out of date.
+    expect(view.stale).toBe(true);
+    expect(view.readAt).toBe(Date.UTC(2026, 9, 21, 21, 40));
+    expect(view.tasks).toHaveLength(58);
+    const dragon = pageTask('Catch a Dragon-type Pokémon');
+    expect(view.tasks).toContainEqual(
+      expect.objectContaining({ key: dragon.key, text: dragon.text, category: dragon.category }),
+    );
+    const shown = view.tasks.find((task) => task.key === dragon.key);
+    expect(shown?.rewards[0]).toMatchObject({
+      kind: 'encounter',
+      name: 'Dratini',
+      value: 'pokemon:dratini',
+    });
+    expect(view.rewards).toContainEqual({ value: 'item:rare-candy', name: 'Rare Candy' });
+    expect(view.rewards.some((reward) => reward.value.startsWith('energy:'))).toBe(true);
+    expect(
+      (await made.ask(RESEARCH, { 'if-none-match': String(answer.headers.etag) })).statusCode,
+    ).toBe(304);
+  });
+
+  it('says a list read lately is not out of date, and one never read is', async () => {
+    const made = await setup();
+    web = made.web;
+    Object.assign(made.ctx, { researchTasks: researchTasksFixture(undefined, STOP_NOON - HOUR) });
+    expect((await made.ask(RESEARCH)).json<ResearchOptionsView>().stale).toBe(false);
+    Object.assign(made.ctx, { researchTasks: researchTasksFixture([], null) });
+    expect((await made.ask(RESEARCH)).json<ResearchOptionsView>()).toEqual({
+      stale: true,
+      readAt: null,
+      tasks: [],
+      rewards: [],
+    });
+  });
+
+  it("takes out of date from the lists' own rule, not from the settings", async () => {
+    const made = await setup();
+    web = made.web;
+    // Read two hours ago by lists that are out of date after one: the settings' six and
+    // twenty-four hours would call them current.
+    Object.assign(made.ctx, {
+      researchTasks: researchTasksFixture(undefined, STOP_NOON - 2 * HOUR, 1),
+      rocketLineups: rocketLineupsFixture(undefined, STOP_NOON - 2 * HOUR, 1),
+    });
+    expect((await made.ask(RESEARCH)).json<ResearchOptionsView>().stale).toBe(true);
+    expect((await made.ask(ROCKET)).json<RocketOptionsView>().stale).toBe(true);
+  });
+
+  it('gives who of Team GO Rocket as /rocket offers it, Giovanni with his warning', async () => {
+    const made = await setup();
+    web = made.web;
+    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture(undefined, STOP_NOON - HOUR) });
+    const answer = await made.ask(ROCKET);
+    expect(answer.statusCode).toBe(200);
+    const view = answer.json<RocketOptionsView>();
+    expect(view.stale).toBe(false);
+    expect(view.readAt).toBe(STOP_NOON - HOUR);
+    expect(view.choices.map((choice) => choice.key).slice(0, 2)).toEqual([
+      'grunt:bug',
+      'grunt:dark',
+    ]);
+    expect(view.choices.find((choice) => choice.key === 'grunt:water')).toMatchObject({
+      name: 'Water-type grunt',
+      hideout: false,
+    });
+    expect(view.choices.find((choice) => choice.key === 'grunt:water')?.catches[0]).toEqual({
+      kind: 'encounter',
+      name: 'Mudkip',
+      value: 'pokemon:mudkip',
+      quantity: 0,
+      shiny: true,
+      image: feedChoice('grunt:water').catches[0]?.image,
+    });
+    expect(view.choices.at(-1)).toMatchObject({
+      key: 'giovanni',
+      hideout: true,
+      note: GIOVANNI_ONLY_WHEN_SURE,
+    });
+    expect(view.choices.filter((choice) => choice.note !== undefined)).toHaveLength(1);
+    expect(
+      (await made.ask(ROCKET, { 'if-none-match': String(answer.headers.etag) })).statusCode,
+    ).toBe(304);
+  });
+
+  it('is for members only, and says so while Discord cannot', async () => {
+    const made = await setup();
+    web = made.web;
+    const stranger = await made.web.loggedIn('200000000000000099', 'X');
+    for (const url of [RESEARCH, ROCKET]) {
+      expect((await made.web.app.inject({ method: 'GET', url })).statusCode).toBe(401);
+      expect(
+        (await made.web.app.inject({ method: 'GET', url, headers: { cookie: stranger } }))
+          .statusCode,
+      ).toBe(403);
+    }
+    made.members.failing = new Error('Discord is away');
+    for (const url of [RESEARCH, ROCKET]) expect((await made.ask(url)).statusCode).toBe(503);
+  });
+
+  it('is for members with the map’s member role, where the settings name one', async () => {
+    const made = await setup({ memberRole: 'Verified' });
+    web = made.web;
+    made.members
+      .standing(ALICE, { roleNames: ['Trainer'], administrator: false })
+      .add(BOB, 'Bob')
+      .standing(BOB, { roleNames: ['verified'], administrator: false });
+    const bob = await made.web.loggedIn(BOB, 'Bob');
+    for (const url of [RESEARCH, ROCKET]) {
+      expect((await made.ask(url)).statusCode).toBe(403);
+      expect(
+        (await made.web.app.inject({ method: 'GET', url, headers: { cookie: bob } })).statusCode,
+      ).toBe(200);
+    }
+  });
+
+  it('lists Pine’s own stops in a box by the keys the reports take (8R-1)', async () => {
+    const made = await setup();
+    web = made.web;
+    made.wayspots.setPineStops([
+      {
+        stop: {
+          id: 7,
+          serverId: FAKE_GUILD_ID,
+          name: 'Coffee Corner',
+          lat: 40.0505,
+          lon: -80.05,
+          address: null,
+          createdBy: ALICE,
+          createdAt: 5_000,
+          updatedBy: ALICE,
+          updatedAt: 5_000,
+        },
+        guildRow: 1,
+      },
+    ]);
+    const box = 'south=40.04&west=-80.07&north=40.07&east=-80.04';
+    const view = (await made.ask(`/s/${FAKE_GUILD_ID}/api/stops?${box}`)).json<StopsView>();
+    const pine = view.stops.find(([, , , title]) => title === 'Coffee Corner');
+    expect(pine?.[0]).toBe('pine-7');
+    expect(
+      (await stopsByKey(made.ctx, FAKE_GUILD_ID, [pine?.[0] ?? ''])).map((s) => s.name),
+    ).toEqual(['Coffee Corner']);
+  });
+});
diff --git a/src/web/stop-options.ts b/src/web/stop-options.ts
new file mode 100644
index 0000000000000000000000000000000000000000..057272a154c89d934c8f78a3692e9ee28eafea67
--- /dev/null
+++ b/src/web/stop-options.ts
@@ -0,0 +1,66 @@
+import type { ResearchTask } from '../domain/research/task.js';
+import { isHideout, parseRocketKey, type RocketChoice } from '../domain/rocket/lineups.js';
+import type { ResearchOptionsView, RocketOptionsView } from '../domain/web/stop-report-data.js';
+import { mapCatch, mapReward } from '../domain/web/stop-report-view.js';
+
+/**
+ * The pick lists of a research report on the map (plan 8R-3), as `/research` offers them: the
+ * whole task list in the page's order (not the autocomplete's 25), each with its key, text,
+ * category and rewards (pictures only from `origins`); whether it is out of date (`stale`, the
+ * task list's own rule) and when it was read; and the items and Mega Energy of the list
+ * (`listedRewards`), which a typed task's `reward` may name besides a Pokémon. Pure.
+ */
+export function researchOptions(input: {
+  tasks: readonly ResearchTask[];
+  readAt: number | undefined;
+  stale: boolean;
+  listed: { items: ReadonlyMap<string, string>; energies: ReadonlyMap<number, string> };
+  origins: readonly string[];
+}): ResearchOptionsView {
+  return {
+    stale: input.stale,
+    readAt: input.readAt ?? null,
+    tasks: input.tasks.map((task) => ({
+      key: task.key,
+      text: task.text,
+      category: task.category,
+      rewards: task.rewards.map((reward) => mapReward(reward, input.origins)),
+    })),
+    rewards: [
+      ...[...input.listed.items].map(([key, name]) => ({ value: `item:${key}`, name })),
+      ...[...input.listed.energies].map(([dex, name]) => ({
+        value: `energy:${String(dex)}`,
+        name,
+      })),
+    ],
+  };
+}
+
+/**
+ * The pick list of a Rocket report on the map (plan 8R-3), as `/rocket` offers it
+ * (`rocketChoices`, in its order): each who with its key, name, whether it is a hideout, the
+ * catches (pictures only from `origins`), and Giovanni's note (`giovanniNote`); whether the
+ * lineups are out of date (`stale`, their own rule) and when they were read. Pure.
+ */
+export function rocketOptions(input: {
+  choices: readonly RocketChoice[];
+  readAt: number | undefined;
+  stale: boolean;
+  giovanniNote: string;
+  origins: readonly string[];
+}): RocketOptionsView {
+  return {
+    stale: input.stale,
+    readAt: input.readAt ?? null,
+    choices: input.choices.map((choice) => {
+      const who = parseRocketKey(choice.key);
+      return {
+        key: choice.key,
+        name: choice.name,
+        hideout: who !== undefined && isHideout(who),
+        catches: choice.catches.map((caught) => mapCatch(caught, input.origins)),
+        ...(who?.kind === 'giovanni' ? { note: input.giovanniNote } : {}),
+      };
+    }),
+  };
+}
diff --git a/src/web/stop-routes.ts b/src/web/stop-routes.ts
index 16d861b90bc54731bcad9560d60a898e7b87cb03..0bbd2cc464a8102c48e1c3f3598d05bae1d964b5 100644
--- a/src/web/stop-routes.ts
+++ b/src/web/stop-routes.ts
@@ -1,6 +1,8 @@
 import type { FastifyInstance } from 'fastify';
 import type { AppContext } from '../app-context.js';
+import { listedRewards } from '../commands/research/research-input.js';
 import type { ResearchReporting } from '../commands/research/research-report.js';
+import { GIOVANNI_ONLY_WHEN_SURE, rocketChoices } from '../commands/rocket/rocket-input.js';
 import type { RocketReporting } from '../commands/rocket/rocket-report.js';
 import type { Region } from '../db/repositories/region-repository.js';
 import { isRocketReport, type StopReport } from '../domain/stops/report.js';
@@ -10,7 +12,7 @@ import type { GruntMessageService } from '../services/grunt-messages.js';
 import { regionsAtPoints } from '../services/region-directory.js';
 import type { StopPostService } from '../services/stop-posts.js';
 import { isHideoutReport } from '../services/stop-reports.js';
-import { isMapStaff } from './acting.js';
+import { isMapStaff, memberOrFailure } from './acting.js';
 import { sendFailure } from './answers.js';
 import { etagMatches, etagOf } from './geo-cache.js';
 import type { GuildRequest } from './guild-routes.js';
@@ -18,6 +20,7 @@ import { UNCONFIRMED } from './party-routes.js';
 import type { PartyViewer, PartyViewers } from './party-viewers.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
+import { researchOptions, rocketOptions } from './stop-options.js';
 
 /**
  * What the reports at stops of the live map read and call (plan 8R-3): exactly what `/research`
@@ -49,6 +52,9 @@ export interface StopWebDeps {
  */
 export const STOP_REPORTS_PER_MINUTE = 30;
 
+/** The requests for each pick list one address may make in a minute (a form asks once). */
+const OPTIONS_PER_MINUTE = 30;
+
 /**
  * The reports at stops of the live map (plan 8R-3; design 8, 9.16): today's reports of the server
  * as the member may see them (`GET /s/<guild>/api/stop-reports`). Who sees what is the parties'
@@ -164,6 +170,56 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
       return reply.type('application/json; charset=utf-8').send(body);
     },
   );
+
+  /** A pick list's JSON for members: an ETag of it, `private, no-cache`, 304 when the page has it. */
+  const optionsRoute = (url: string, body: () => unknown) => {
+    const limiter = new RateLimiter({ uses: OPTIONS_PER_MINUTE, perMs: 60_000 });
+    scope.get(
+      url,
+      { onRequest: limitedPerAddress(limiter, { now: deps.now }) },
+      async (request: GuildRequest, reply) => {
+        void reply.header('cache-control', 'private, no-cache');
+        const session = await sessions.of(request, reply);
+        if (!session) return sendFailure(request, reply, 401);
+        const refused = await memberOrFailure(
+          deps,
+          request,
+          reply,
+          request.params.guild,
+          session.userId,
+        );
+        if (refused) return refused;
+        const json = JSON.stringify(body());
+        const etag = etagOf(json);
+        void reply.header('etag', etag);
+        if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
+        return reply.type('application/json; charset=utf-8').send(json);
+      },
+    );
+  };
+
+  // The pick lists of a research report (plan 8R-3): `/research`'s task list whole, whether it is
+  // out of date, and the rewards a typed task may name.
+  optionsRoute('/api/research-options', () =>
+    researchOptions({
+      tasks: ctx.researchTasks.tasks(),
+      readAt: ctx.researchTasks.readAt(),
+      stale: ctx.researchTasks.stale(deps.now()),
+      listed: listedRewards(ctx),
+      origins: deps.pictureOrigins,
+    }),
+  );
+
+  // The pick list of a Rocket report (plan 8R-3): `/rocket`'s choices, Giovanni's with its note.
+  optionsRoute('/api/rocket-options', () =>
+    rocketOptions({
+      choices: rocketChoices(ctx),
+      readAt: ctx.rocketLineups.readAt(),
+      stale: ctx.rocketLineups.stale(deps.now()),
+      giovanniNote: GIOVANNI_ONLY_WHEN_SURE,
+      origins: deps.pictureOrigins,
+    }),
+  );
 }
 
 /** The regions each report lies in, by the report's id. */
diff --git a/test/support/research.ts b/test/support/research.ts
index 765679dfa88bdce91a5863cce2442f0e9d7bcd14..e9ea7eebeb75b634370b8d4567d3a745eaa04dad 100644
--- a/test/support/research.ts
+++ b/test/support/research.ts
@@ -26,11 +26,13 @@ export function researchTasksOfPage(): readonly ResearchTask[] {
 
 /**
  * A task list as handlers read it (`ResearchTaskProvider`): the tasks of the page of 2026-10-21
- * unless given, read at `readAt`.
+ * unless given, read at `readAt` (`null`: never read), out of date `staleAfterHours` later (the
+ * settings' default, 6).
  */
 export function researchTasksFixture(
   given?: readonly ResearchTask[],
-  readAt = Date.UTC(2026, 9, 21, 21, 40),
+  readAt: number | null = Date.UTC(2026, 9, 21, 21, 40),
+  staleAfterHours = 6,
 ): ResearchTaskProvider {
   // Read when first asked: most contexts never ask.
   let byKey: Map<string, ResearchTask> | undefined;
@@ -38,7 +40,8 @@ export function researchTasksFixture(
   return {
     tasks,
     byKey: (key) => (byKey ??= new Map(tasks().map((task) => [task.key, task]))).get(key),
-    readAt: () => readAt,
+    readAt: () => readAt ?? undefined,
+    stale: (now) => readAt === null || now - readAt >= staleAfterHours * 3_600_000,
   };
 }
 
diff --git a/test/support/rocket.ts b/test/support/rocket.ts
index 8bbf8db283ffef97d2a93b30ae7cdd5aa912a020..f8fff620cbe7ee4424e5e49c50a4e1b93149492a 100644
--- a/test/support/rocket.ts
+++ b/test/support/rocket.ts
@@ -25,17 +25,20 @@ export function rocketChoicesOfFeed(): readonly RocketChoice[] {
 
 /**
  * The lineups as handlers read them (`RocketLineupProvider`): the choices of the feed of
- * 2026-10-22 unless given, read at `readAt`.
+ * 2026-10-22 unless given, read at `readAt` (`null`: never read), out of date `staleAfterHours`
+ * later (the settings' default, 24).
  */
 export function rocketLineupsFixture(
   given?: readonly RocketChoice[],
-  readAt = Date.UTC(2026, 9, 22, 8, 11),
+  readAt: number | null = Date.UTC(2026, 9, 22, 8, 11),
+  staleAfterHours = 24,
 ): RocketLineupProvider {
   const choices = (): readonly RocketChoice[] => given ?? rocketChoicesOfFeed();
   return {
     choices,
     byKey: (key) => choices().find((choice) => choice.key === key),
-    readAt: () => readAt,
+    readAt: () => readAt ?? undefined,
+    stale: (now) => readAt === null || now - readAt >= staleAfterHours * 3_600_000,
   };
 }
 
diff --git a/test/support/stop-reporting.ts b/test/support/stop-reporting.ts
index f3b150ea9d0aa7aba1bcc575779897014cfdab2c..eb824699cd5f6416aa01d4ad1661ba34c7a04ccc 100644
--- a/test/support/stop-reporting.ts
+++ b/test/support/stop-reporting.ts
@@ -24,9 +24,10 @@ export const STOP_ROWS: readonly WayspotRow[] = [
  * Reporting at stops over the services, as `/research`, `/rocket` and the map do (plan 8R-3): the
  * party services of `partyServiceWith` (`made`: its fake gateway holds the forums, who is barred,
  * and the grunts' messages), the kept stops `rows`, a context (`createTestContext`) with the stop
- * reports (`store`), the grunts' messages (`grunts`, over `gruntStore`; their timers never run) and
- * `RocketService`, and its place search built. The services read `Date.now()`: fake `Date` to
- * `STOP_NOON` before calling it.
+ * reports (`store`), the kept stops (`wayspots`, the directory: `setPineStops`), the grunts'
+ * messages (`grunts`, over `gruntStore`; their timers never run) and `RocketService`, and its
+ * place search built. The services read `Date.now()`: fake `Date` to `STOP_NOON` before calling
+ * it.
  */
 export async function stopReportingWith(rows: readonly WayspotRow[] = STOP_ROWS) {
   const made = await partyServiceWith();
@@ -56,5 +57,5 @@ export async function stopReportingWith(rows: readonly WayspotRow[] = STOP_ROWS)
   });
   Object.assign(ctx, { stopReports, rocket });
   await ctx.placeFinder.built();
-  return { made, ctx, store, grunts, gruntStore, entries };
+  return { made, ctx, wayspots, store, grunts, gruntStore, entries };
 }
````

### Task 4: 8R-3 task 4: reporting research and Rocket on the map, and taking back

Prototype commit: `7a9831a59d741f9f2a375c269ad5dbd27540bfcd`

POST /s/<guild>/api/research (a task as /research's task: takes it,
a typed task's reward, one to five stop keys) and POST .../api/rocket
(who, one stop key, replacing) report as the member through
reportResearchAs and reportRocketAs, in web.md's order: the per-address
limit and postGuard, the session and a strict body, actingOnTheMap,
the stops (NO_STOPS_HERE 422; a key of no stop of this server 404),
the commands' readers in their words (422), none counted; then the
command's own window (researchWindow, rocketWindow). A grunt where a
hideout stands is /rocket's question as a 422 with the hideout's id
(asks.replacing), uncounted, a full window 429 first; sent again with
it, the grunt replaces the hideout, decided anew. A hideout reported
meanwhile, a grunt posted nowhere or overtaken give the use back;
"Already reported" is a counted 409 with the grunt and its link.
POST .../stop-reports/<id>/remove takes back one's own report, any for
staff, in the remove subcommand's window of its kind, after "standing
and of this server" (409 alike otherwise) and "yours or staff" (403).
Answers carry the reports as the list shows them, never one it would
hide; logged at info without a text.

**Files:**

```
 src/commands/research/research-input.ts |   3 +
 src/commands/rocket/rocket-input.ts     |   3 +
 src/web/stop-report-post.test.ts        | 537 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/stop-routes.ts                  | 470 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++----
 4 files changed, 989 insertions(+), 24 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/stop-report-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 7a9831a59d741f9f2a375c269ad5dbd27540bfcd -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-3 task 4: reporting research and Rocket on the map, and taking back`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/research/research-input.ts b/src/commands/research/research-input.ts
index bcec5d5d412b330d554089f8b3a3d2a49411f7e5..22d57ada1d0d6a396ef746df3e170574bc5ca1a9 100644
--- a/src/commands/research/research-input.ts
+++ b/src/commands/research/research-input.ts
@@ -33,6 +33,9 @@ import { namedPlace, orList, type PlaceKindsOnly } from '../place-option.js';
 /** The name `/research report` is used and counted under (the router's key of a subcommand). */
 export const RESEARCH_REPORT = 'research report';
 
+/** The name `/research remove` is counted under (the map's taking back counts there too). */
+export const RESEARCH_REMOVE = 'research remove';
+
 /** Where `/research` works, said wherever it does not. */
 export const RESEARCH_FROM_A_REGION =
   'Report field research from the channel of a region, its forum or a post there.';
diff --git a/src/commands/rocket/rocket-input.ts b/src/commands/rocket/rocket-input.ts
index 808b27d60f1af0fac5d2c60c72ddd4885f21e3ab..db1ba9a19abe5ce2c4edaf777f066d969482be43 100644
--- a/src/commands/rocket/rocket-input.ts
+++ b/src/commands/rocket/rocket-input.ts
@@ -25,6 +25,9 @@ import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
 /** The name `/rocket report` is used and counted under (the router's key of a subcommand). */
 export const ROCKET_REPORT = 'rocket report';
 
+/** The name `/rocket remove` is counted under (the map's taking back counts there too). */
+export const ROCKET_REMOVE = 'rocket remove';
+
 /** Where `/rocket` works, said wherever it does not. */
 export const ROCKET_FROM_A_REGION =
   'Report Team GO Rocket from the channel of a region, its forum or a post there.';
diff --git a/src/web/stop-report-post.test.ts b/src/web/stop-report-post.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9733f8ac75820ac1d39506e6c2f3a42ba7cae0c8
--- /dev/null
+++ b/src/web/stop-report-post.test.ts
@@ -0,0 +1,537 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { missingPermissions } from '../../test/support/fake-gateway.js';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import {
+  EAST_CHANNEL,
+  EAST_FORUM,
+  OTHER_GUILD_ID,
+  OTHER_GUILD_ROW,
+  WEST_CHANNEL,
+} from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB } from '../../test/support/parties.js';
+import { pageTask } from '../../test/support/research.js';
+import { STOP_NOON, stopReportingWith } from '../../test/support/stop-reporting.js';
+import { wayspotId } from '../../test/support/wayspot-cases.js';
+import {
+  FakeActingMembers,
+  partyWebWith,
+  stopWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import {
+  NO_STOPS_HERE,
+  readTask,
+  RESEARCH_REMOVE,
+  researchThrottle,
+  researchWindow,
+  TASK_LIST_CHANGED,
+} from '../commands/research/research-input.js';
+import { NOT_YOUR_REPORT, NOTHING_LEFT, stopsByKey } from '../commands/research/research-report.js';
+import { rocketThrottle, rocketWindow } from '../commands/rocket/rocket-input.js';
+import { MEMBER_WRITE_THROTTLE, Throttles } from '../discord/throttle.js';
+import type { StopReportAnswer } from '../domain/web/stop-report-data.js';
+import { STOP_WRITES_PER_ADDRESS_MINUTE, type StopWebDeps } from './stop-routes.js';
+
+const BASE = `/s/${FAKE_GUILD_ID}/api`;
+const DRAGON = pageTask('Catch a Dragon-type Pokémon');
+
+/**
+ * The map of the fakes' server over the stop reports' services, Alice and Bob members (fetched
+ * fresh as `Alice` and `Bob`), the clock at `STOP_NOON` (Date faked to it too); West's channel
+ * named `west`; the pinned posts' messages read from `posts` (none by default).
+ */
+async function setup(rows?: Parameters<typeof stopReportingWith>[0], posts?: StopWebDeps['posts']) {
+  const made = await stopReportingWith(rows);
+  const throttles = new Throttles();
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const acting = new FakeActingMembers().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made.made, { acting, throttles }),
+    stops: stopWebWith(made.ctx, {
+      channelName: (id) => (id === WEST_CHANNEL ? 'west' : undefined),
+      grunts: made.grunts,
+      posts,
+    }),
+  });
+  web.clock.now = STOP_NOON;
+  const alice = await web.posting(ALICE, 'Alice');
+  const bob = await web.posting(BOB, 'Bob');
+  const post = async (path: string, body: unknown, headers = alice) => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: `${BASE}${path}`,
+      headers: { ...headers, 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return {
+      status: answer.statusCode,
+      json: answer.json<StopReportAnswer & { error?: string }>(),
+      headers: answer.headers,
+    };
+  };
+  const { settings } = made.ctx.config;
+  /** Uses `n` of Alice's uses of a command's window, as Discord would have. */
+  const fill = (window: string, throttle: { uses: number; perSeconds: number }, n: number) => {
+    for (let use = 0; use < n; use++) throttles.use(window, ALICE, throttle, web.clock.now);
+  };
+  const fillResearch = (n: number) => fill(researchWindow(settings), researchThrottle(settings), n);
+  const fillRocket = (n: number) => fill(rocketWindow(settings), rocketThrottle(settings), n);
+  return { ...made, web, members, acting, throttles, post, alice, bob, fillResearch, fillRocket };
+}
+
+describe('reports at stops from the map', () => {
+  let web: TestWeb | undefined;
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: STOP_NOON });
+  });
+  afterEach(async () => {
+    vi.useRealTimers();
+    await web?.app.close();
+    web = undefined;
+  });
+
+  describe('research', () => {
+    it('reports a task at the stops picked, as /research, and gives them as the map shows them', async () => {
+      const made = await setup();
+      web = made.web;
+      const answer = await made.post('/research', {
+        task: DRAGON.key,
+        stops: [wayspotId(1), wayspotId(2)],
+      });
+      expect(answer.status).toBe(200);
+      expect(answer.json.ok).toBe(true);
+      expect(answer.json.text).toBe(
+        'Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew +4\n' +
+          '- Yellow Mural\n- Paititi Inti\n' +
+          'In the pinned post "Today at the stops" of #west, until midnight.',
+      );
+      expect(
+        answer.json.research?.map((one) => [one.stop.name, one.reporter, one.mayTakeBack]),
+      ).toEqual([
+        ['Yellow Mural', 'Alice', true],
+        ['Paititi Inti', 'Alice', true],
+      ]);
+      expect([...made.store.rows.values()].map((one) => one.reporter)).toEqual([
+        { id: ALICE, name: 'Alice' },
+        { id: ALICE, name: 'Alice' },
+      ]);
+      expect(made.web.entries).toContainEqual(
+        expect.objectContaining({
+          user: ALICE,
+          guild: FAKE_GUILD_ID,
+          stops: [wayspotId(1), wayspotId(2)],
+          outcome: 'reported',
+          msg: 'field research was reported on the map',
+        }),
+      );
+    });
+
+    it('takes a task typed in full with its reward, as /research does', async () => {
+      const made = await setup();
+      web = made.web;
+      const answer = await made.post('/research', {
+        task: 'Win 3 raids in the rain',
+        reward: 'item:rare-candy',
+        stops: [wayspotId(1)],
+      });
+      expect(answer.status).toBe(200);
+      expect(answer.json.research?.[0]).toMatchObject({
+        typed: true,
+        rewards: [{ kind: 'item', value: 'item:rare-candy' }],
+      });
+    });
+
+    it('refuses in the command’s words before counting: stops of nowhere, a task gone', async () => {
+      const made = await setup();
+      web = made.web;
+      made.ctx.config.settings.research.throttle.uses = 2;
+      try {
+        made.wayspots.setPineStops([
+          {
+            stop: {
+              id: 9,
+              serverId: OTHER_GUILD_ID,
+              name: 'Another server’s',
+              lat: 40.0505,
+              lon: -80.05,
+              address: null,
+              createdBy: BOB,
+              createdAt: 1,
+              updatedBy: BOB,
+              updatedAt: 1,
+            },
+            guildRow: OTHER_GUILD_ROW,
+          },
+        ]);
+        for (const stops of [[wayspotId(5)], ['pine-9'], [wayspotId(1), 'nothing']]) {
+          expect((await made.post('/research', { task: DRAGON.key, stops })).status).toBe(404);
+        }
+        const gone = await made.post('/research', {
+          task: '0123456789abcdef',
+          stops: [wayspotId(1)],
+        });
+        expect(gone.status).toBe(422);
+        expect(gone.json.text).toBe(TASK_LIST_CHANGED);
+        const reward = await made.post('/research', {
+          task: 'Win 3 raids in the rain',
+          reward: 'a golden thing',
+          stops: [wayspotId(1)],
+        });
+        expect(reward.status).toBe(422);
+        expect(reward.json.text).toMatch(/^I do not know "a golden thing" as a reward\./);
+        expect(made.store.rows.size).toBe(0);
+        // Nothing counted: both uses are there.
+        for (const n of [1, 2]) {
+          expect(
+            (await made.post('/research', { task: DRAGON.key, stops: [wayspotId(n)] })).status,
+          ).toBe(200);
+        }
+      } finally {
+        made.ctx.config.settings.research.throttle.uses = 10;
+      }
+    });
+
+    it('says where no PokéStop is known at all', async () => {
+      const made = await setup([]);
+      web = made.web;
+      const answer = await made.post('/research', { task: DRAGON.key, stops: [wayspotId(1)] });
+      expect(answer.status).toBe(422);
+      expect(answer.json.text).toBe(NO_STOPS_HERE.replace(/`/g, ''));
+    });
+
+    it('counts in /research report’s own window, shared with Discord', async () => {
+      const made = await setup();
+      web = made.web;
+      made.fillResearch(10);
+      const answer = await made.post('/research', { task: DRAGON.key, stops: [wayspotId(1)] });
+      expect(answer.status).toBe(429);
+      expect(answer.json.error).toMatch(/^You can use \/research report again in /);
+      expect(made.store.rows.size).toBe(0);
+    });
+
+    it('shows no report in a region the member is kept out of, though it is made', async () => {
+      const made = await setup();
+      web = made.web;
+      made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
+      const answer = await made.post('/research', {
+        task: DRAGON.key,
+        stops: [wayspotId(1), wayspotId(3)],
+      });
+      expect(answer.status).toBe(200);
+      expect(answer.json.research?.map((one) => one.stop.name)).toEqual(['Yellow Mural']);
+      expect(made.store.rows.size).toBe(2);
+    });
+
+    it('refuses a body other than the command’s options, and a POST without its guard', async () => {
+      const made = await setup();
+      web = made.web;
+      const six = [1, 2, 3, 4, 5, 6].map((n) => wayspotId(n));
+      expect((await made.post('/research', { task: DRAGON.key, stops: six })).status).toBe(400);
+      expect((await made.post('/research', { task: DRAGON.key, stops: [] })).status).toBe(400);
+      expect(
+        (await made.post('/research', { task: DRAGON.key, stops: ['x'], extra: 1 })).status,
+      ).toBe(400);
+      const { 'x-pine-csrf': _token, ...unguarded } = made.alice;
+      expect(
+        (await made.post('/research', { task: DRAGON.key, stops: [wayspotId(1)] }, unguarded))
+          .status,
+      ).toBe(403);
+      const stranger = await made.web.posting('200000000000000099', 'X');
+      expect(
+        (await made.post('/research', { task: DRAGON.key, stops: [wayspotId(1)] }, stranger))
+          .status,
+      ).toBe(403);
+    });
+  });
+
+  describe('Team GO Rocket', () => {
+    it('reports a grunt, posted in its region, and gives it with its message’s link', async () => {
+      const made = await setup();
+      web = made.web;
+      const answer = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) });
+      expect(answer.status).toBe(200);
+      expect(answer.json.text).toMatch(
+        /^Water-type grunt at Yellow Mural · catch one of Mudkip, .*\nPosted in #west; it goes away in 30 min\.$/,
+      );
+      const [message] = made.made.gateway.messagesIn(WEST_CHANNEL);
+      expect(answer.json.grunt).toMatchObject({
+        who: 'grunt:water',
+        reporter: 'Alice',
+        link: `https://discord.com/channels/${FAKE_GUILD_ID}/${WEST_CHANNEL}/${message?.id ?? ''}`,
+      });
+      expect(made.web.entries).toContainEqual(
+        expect.objectContaining({
+          user: ALICE,
+          stop: wayspotId(1),
+          outcome: 'reported',
+          msg: 'Team GO Rocket was reported on the map',
+        }),
+      );
+    });
+
+    it('answers the same grunt again as reported already, with it, and counts the use', async () => {
+      const made = await setup();
+      web = made.web;
+      await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) }, made.bob);
+      made.fillRocket(8);
+      const again = await made.post('/rocket', { who: 'water', stop: wayspotId(1) });
+      expect(again.status).toBe(409);
+      expect(again.json.ok).toBe(false);
+      expect(again.json.text).toMatch(
+        /^Already reported: a Water-type grunt at Yellow Mural, by Bob now; it goes away in 30 min\.$/,
+      );
+      expect(again.json.grunt?.link).toMatch(/^https:\/\/discord\.com\/channels\//);
+      expect(made.made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
+      // Counted, as on Discord (8R-2): the tenth use is the last.
+      expect((await made.post('/rocket', { who: 'grunt:fire', stop: wayspotId(2) })).status).toBe(
+        200,
+      );
+      expect((await made.post('/rocket', { who: 'grunt:ice', stop: wayspotId(2) })).status).toBe(
+        429,
+      );
+    });
+
+    it('asks before a grunt replaces a hideout, uncounted, and replaces it when told to', async () => {
+      const made = await setup();
+      web = made.web;
+      const arlo = await made.post('/rocket', { who: 'leader:arlo', stop: wayspotId(1) }, made.bob);
+      expect(arlo.status).toBe(200);
+      const hideout = arlo.json.hideout?.id ?? 0;
+      made.fillRocket(9);
+      const asked = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) });
+      expect(asked.status).toBe(422);
+      expect(asked.json).toMatchObject({
+        ok: false,
+        text:
+          'Arlo was reported here today, and a hideout keeps grunts away all day. Replace ' +
+          'Arlo’s report with the Water-type grunt?',
+        asks: { replacing: hideout },
+        hideout: { id: hideout, who: 'leader:arlo' },
+      });
+      // A Replace of another hideout than the one standing is asked again.
+      expect(
+        (await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1), replacing: 999 }))
+          .status,
+      ).toBe(422);
+      const replaced = await made.post('/rocket', {
+        who: 'grunt:water',
+        stop: wayspotId(1),
+        replacing: hideout,
+      });
+      expect(replaced.status).toBe(200);
+      expect(replaced.json.text).toContain('(was: Arlo)');
+      // The window is full now: the question is not asked, as Discord opens no dialog.
+      await made.post('/rocket', { who: 'leader:arlo', stop: wayspotId(2) }, made.bob);
+      const full = await made.post('/rocket', { who: 'grunt:fire', stop: wayspotId(2) });
+      expect(full.status).toBe(429);
+    });
+
+    it('asks and gives the use back where a hideout came after the route looked', async () => {
+      const made = await setup();
+      web = made.web;
+      const arlo = await made.post('/rocket', { who: 'leader:arlo', stop: wayspotId(1) }, made.bob);
+      made.fillRocket(9);
+      // The route's look at the stop missed the hideout (reported in between).
+      vi.spyOn(made.ctx.stopReports, 'rocketAt').mockResolvedValueOnce(undefined);
+      const asked = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) });
+      expect(asked.status).toBe(422);
+      expect(asked.json.asks).toEqual({ replacing: arlo.json.hideout?.id });
+      expect((await made.post('/rocket', { who: 'grunt:fire', stop: wayspotId(2) })).status).toBe(
+        200,
+      );
+    });
+
+    it('gives the use back where the grunt could be posted nowhere', async () => {
+      const made = await setup();
+      web = made.web;
+      made.fillRocket(9);
+      made.made.gateway.failing.set('sendMessage', missingPermissions('POST'));
+      const answer = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) });
+      expect(answer.status).toBe(503);
+      expect(answer.json.text).toBe(
+        'I could not post the grunt in #west, so nothing was reported. Try again in a moment.',
+      );
+      made.made.gateway.failing.delete('sendMessage');
+      expect((await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) })).status).toBe(
+        200,
+      );
+    });
+
+    it('leaves out of its answer a grunt in a region the member is kept out of', async () => {
+      const made = await setup();
+      web = made.web;
+      made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
+      const answer = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(3) });
+      expect(answer.status).toBe(200);
+      expect(answer.json.ok).toBe(true);
+      expect(answer.json.grunt).toBeUndefined();
+      expect(made.made.gateway.messagesIn(EAST_CHANNEL)).toHaveLength(1);
+    });
+
+    it('refuses who is not in the lineups and a stop of nowhere, uncounted', async () => {
+      const made = await setup();
+      web = made.web;
+      made.fillRocket(9);
+      const nobody = await made.post('/rocket', { who: 'someone', stop: wayspotId(1) });
+      expect(nobody.status).toBe(422);
+      expect(nobody.json.text).toMatch(/^I do not know "someone" in Team GO Rocket/);
+      expect((await made.post('/rocket', { who: 'arlo', stop: wayspotId(5) })).status).toBe(404);
+      expect((await made.post('/rocket', { who: 'arlo', stop: wayspotId(1) })).status).toBe(200);
+    });
+  });
+
+  describe('taking back', () => {
+    it('takes back one’s own report, another’s only as staff, in the remove window', async () => {
+      const made = await setup();
+      web = made.web;
+      const reported = await made.post('/research', { task: DRAGON.key, stops: [wayspotId(1)] });
+      const id = reported.json.research?.[0]?.id ?? 0;
+      // Bob has one use of /research remove left.
+      for (let use = 1; use < MEMBER_WRITE_THROTTLE.uses; use++) {
+        made.throttles.use(RESEARCH_REMOVE, BOB, MEMBER_WRITE_THROTTLE, STOP_NOON);
+      }
+      const bobs = await made.post(`/stop-reports/${String(id)}/remove`, {}, made.bob);
+      expect(bobs.status).toBe(403);
+      expect(bobs.json.text).toBe(NOT_YOUR_REPORT);
+      expect(made.store.rows.size).toBe(1);
+      // Bob's refusal was not counted: his last use is there for it as staff.
+      made.acting.standing(BOB, { roleNames: ['Moderator'], administrator: false });
+      const staff = await made.post(`/stop-reports/${String(id)}/remove`, {}, made.bob);
+      expect(staff.status).toBe(200);
+      expect(
+        made.throttles.wait(RESEARCH_REMOVE, BOB, MEMBER_WRITE_THROTTLE, STOP_NOON),
+      ).toBeDefined();
+      expect(staff.json.text).toBe('Took back Catch a Dragon-type Pokémon at Yellow Mural.');
+      expect(made.store.rows.size).toBe(0);
+      expect(made.web.entries).toContainEqual(
+        expect.objectContaining({
+          user: BOB,
+          report: id,
+          outcome: 'removed',
+          msg: 'a report at a stop was taken back on the map',
+        }),
+      );
+    });
+
+    it('answers alike for a report gone, another server’s and one that never was', async () => {
+      const made = await setup();
+      web = made.web;
+      const reported = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) });
+      const id = reported.json.grunt?.id ?? 0;
+      expect((await made.post(`/stop-reports/${String(id)}/remove`, {})).status).toBe(200);
+      // Alice's own report, in another server.
+      const elsewhere = await made.ctx.stopReports.reportResearch({
+        serverId: OTHER_GUILD_ID,
+        stops: await stopsByKey(made.ctx, FAKE_GUILD_ID, [wayspotId(2)]),
+        subject: readTask(made.ctx, DRAGON.key, null),
+        reporter: { id: ALICE, name: 'Alice' },
+      });
+      const other = elsewhere.saved[0]?.report.id ?? 0;
+      for (const gone of [id, other, 424242]) {
+        const answer = await made.post(`/stop-reports/${String(gone)}/remove`, {});
+        expect(answer.status).toBe(409);
+        expect(answer.json.text).toBe(NOTHING_LEFT);
+      }
+      expect(made.store.rows.has(other)).toBe(true);
+      expect((await made.post('/stop-reports/abc/remove', {})).status).toBe(404);
+    });
+  });
+
+  describe('every report and take-back', () => {
+    it('counts against one limit of the address, before the guard and the body are read', async () => {
+      const made = await setup();
+      web = made.web;
+      const paths = ['/research', '/rocket', '/stop-reports/1/remove'];
+      for (let n = 0; n < STOP_WRITES_PER_ADDRESS_MINUTE; n++) {
+        // A body of nothing: refused after the limit counted it.
+        expect((await made.post(paths[n % 3] ?? '', { nothing: true })).status).toBe(400);
+      }
+      const { 'x-pine-csrf': _token, ...unguarded } = made.alice;
+      for (const path of paths) {
+        const answer = await made.post(path, { nothing: true }, unguarded);
+        expect(answer.status).toBe(429);
+      }
+    });
+
+    it('takes this server’s own stops (stop:pine-<id>) as /research does', async () => {
+      const made = await setup();
+      web = made.web;
+      made.wayspots.setPineStops([
+        {
+          stop: {
+            id: 7,
+            serverId: FAKE_GUILD_ID,
+            name: 'Coffee Corner',
+            lat: 40.0505,
+            lon: -80.05,
+            address: null,
+            createdBy: ALICE,
+            createdAt: 5_000,
+            updatedBy: ALICE,
+            updatedAt: 5_000,
+          },
+          guildRow: 1,
+        },
+      ]);
+      const research = await made.post('/research', { task: DRAGON.key, stops: ['pine-7'] });
+      expect(research.status).toBe(200);
+      expect(research.json.research?.map((one) => one.stop)).toMatchObject([
+        { key: 'pine-7', name: 'Coffee Corner' },
+      ]);
+      const rocket = await made.post('/rocket', { who: 'grunt:water', stop: 'pine-7' });
+      expect(rocket.status).toBe(200);
+      expect(rocket.json.grunt?.stop).toMatchObject({ key: 'pine-7' });
+    });
+
+    it('logs the stops it found, and only how many where it found none', async () => {
+      const made = await setup();
+      web = made.web;
+      const odd = 'not a stop <b>';
+      expect((await made.post('/research', { task: DRAGON.key, stops: [odd] })).status).toBe(404);
+      expect((await made.post('/rocket', { who: 'grunt:water', stop: odd })).status).toBe(404);
+      const refused = await made.post('/research', {
+        task: '0123456789abcdef',
+        stops: [wayspotId(1), wayspotId(1)],
+      });
+      expect(refused.status).toBe(422);
+      expect(JSON.stringify(made.web.entries)).not.toContain(odd);
+      expect(made.web.entries).toContainEqual(
+        expect.objectContaining({ outcome: 'no-stop', stops: 1 }),
+      );
+      expect(made.web.entries).toContainEqual(
+        expect.objectContaining({ outcome: 'refused', stops: [wayspotId(1)] }),
+      );
+    });
+
+    it('answers a report made though the map cannot show it just now, leaving it out', async () => {
+      let postsFail = false;
+      const made = await setup(undefined, {
+        linkOf: () => {
+          if (postsFail) throw new Error('the posts cannot be read');
+          return undefined;
+        },
+      });
+      web = made.web;
+      // What shows a report cannot be read once it is stored: the pinned posts, the grunts.
+      postsFail = true;
+      const research = await made.post('/research', { task: DRAGON.key, stops: [wayspotId(1)] });
+      expect(research.status).toBe(200);
+      expect(research.json).toMatchObject({ ok: true, research: [] });
+      expect(research.json.text).toContain('Catch a Dragon-type Pokémon');
+      made.gruntStore.failing.set('ofReports', new Error('database away'));
+      const grunt = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(2) });
+      expect(grunt.status).toBe(200);
+      expect(grunt.json.ok).toBe(true);
+      expect(grunt.json.grunt).toBeUndefined();
+      expect(made.store.rows.size).toBe(2);
+      expect(
+        made.web.entries.filter(
+          (entry) => entry.msg === 'could not show reports at stops made on the map',
+        ),
+      ).toHaveLength(2);
+    });
+  });
+});
diff --git a/src/web/stop-routes.ts b/src/web/stop-routes.ts
index 0bbd2cc464a8102c48e1c3f3598d05bae1d964b5..ac91df8445ede11d1e7d201335e0eace6ee9d1d4 100644
--- a/src/web/stop-routes.ts
+++ b/src/web/stop-routes.ts
@@ -1,19 +1,70 @@
-import type { FastifyInstance } from 'fastify';
+import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
+import { z } from 'zod';
 import type { AppContext } from '../app-context.js';
-import { listedRewards } from '../commands/research/research-input.js';
-import type { ResearchReporting } from '../commands/research/research-report.js';
-import { GIOVANNI_ONLY_WHEN_SURE, rocketChoices } from '../commands/rocket/rocket-input.js';
-import type { RocketReporting } from '../commands/rocket/rocket-report.js';
+import {
+  listedRewards,
+  NO_STOPS_HERE,
+  readTask,
+  RESEARCH_REMOVE,
+  RESEARCH_REPORT,
+  researchThrottle,
+  STOP_OPTIONS,
+} from '../commands/research/research-input.js';
+import {
+  NOT_YOUR_REPORT,
+  NOTHING_LEFT,
+  reporterNamed,
+  reportResearchAs,
+  stopsByKey,
+  takeBackAs,
+  type ResearchReporting,
+} from '../commands/research/research-report.js';
+import {
+  GIOVANNI_ONLY_WHEN_SURE,
+  readWho,
+  ROCKET_REMOVE,
+  ROCKET_REPORT,
+  rocketChoices,
+  rocketThrottle,
+  rocketWindow,
+} from '../commands/rocket/rocket-input.js';
+import {
+  hideoutQuestion,
+  reportRocketAs,
+  type RocketAs,
+  type RocketReporting,
+} from '../commands/rocket/rocket-report.js';
 import type { Region } from '../db/repositories/region-repository.js';
-import { isRocketReport, type StopReport } from '../domain/stops/report.js';
+import { UserError } from '../discord/errors.js';
+import { MEMBER_WRITE_THROTTLE } from '../discord/throttle.js';
+import { isHideout, parseRocketKey, type RocketChoice } from '../domain/rocket/lineups.js';
+import {
+  isRocketReport,
+  type ReportedStop,
+  type RocketReport,
+  type StopReport,
+} from '../domain/stops/report.js';
+import type { StopReportAnswer, StopReportsView } from '../domain/web/stop-report-data.js';
 import { stopReportView } from '../domain/web/stop-report-view.js';
 import { postLink } from '../render/notify-dm.js';
+import { researchWords, type ChannelNamer } from '../render/research.js';
+import { alreadyReported, rocketWords } from '../render/rocket.js';
+import { plain } from '../render/text.js';
 import type { GruntMessageService } from '../services/grunt-messages.js';
 import { regionsAtPoints } from '../services/region-directory.js';
 import type { StopPostService } from '../services/stop-posts.js';
-import { isHideoutReport } from '../services/stop-reports.js';
-import { isMapStaff, memberOrFailure } from './acting.js';
+import { isHideoutReport, type ResearchSubject } from '../services/stop-reports.js';
+import {
+  actingOnTheMap,
+  countedOnTheMap,
+  givenBackOnTheMap,
+  isMapStaff,
+  memberOrFailure,
+  throttledOnTheMap,
+} from './acting.js';
 import { sendFailure } from './answers.js';
+import { postGuard } from './csrf.js';
+import { pageWords } from './page-words.js';
 import { etagMatches, etagOf } from './geo-cache.js';
 import type { GuildRequest } from './guild-routes.js';
 import { UNCONFIRMED } from './party-routes.js';
@@ -96,7 +147,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
     reports: readonly StopReport[],
     viewer: Extract<PartyViewer, { kind: 'member' }>,
     userId: string,
-  ): Promise<string> => {
+  ): Promise<StopReportsView> => {
     const seen = new Map(
       reports.map((report) => [report.id, seenIn(places.get(report.id) ?? [], viewer)]),
     );
@@ -123,20 +174,18 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
       return undefined;
     };
     const now = deps.now();
-    return JSON.stringify(
-      stopReportView({
-        reports,
-        period: ctx.stopReports.period(now),
-        now,
-        zone: ctx.config.settings.timezone,
-        shown: (report) => (seen.get(report.id) ?? []).length > 0,
-        memberId: userId,
-        staff: isMapStaff(viewer.standing, userId, deps.parties.ownerId),
-        readOnly: viewer.readOnly,
-        link,
-        pictureOrigins: deps.pictureOrigins,
-      }),
-    );
+    return stopReportView({
+      reports,
+      period: ctx.stopReports.period(now),
+      now,
+      zone: ctx.config.settings.timezone,
+      shown: (report) => (seen.get(report.id) ?? []).length > 0,
+      memberId: userId,
+      staff: isMapStaff(viewer.standing, userId, deps.parties.ownerId),
+      readOnly: viewer.readOnly,
+      link,
+      pictureOrigins: deps.pictureOrigins,
+    });
   };
 
   /** The forums of the regions the reports lie in, which say who may see them. */
@@ -145,6 +194,34 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
       regions.flatMap((region) => (region.forumChannelId === null ? [] : [region.forumChannelId])),
     );
 
+  /**
+   * Reports as the member sees them on the map (`/api/stop-reports`'s view of just these), for an
+   * answer (R13: never one the list would hide from them); none while Discord cannot say, nor
+   * where they cannot be read just now (a warning: the report stands and was counted, so the
+   * answer says it was made, and the page's next poll shows it).
+   */
+  const shownTo = async (
+    guild: string,
+    userId: string,
+    reports: readonly StopReport[],
+  ): Promise<StopReportsView | undefined> => {
+    try {
+      const row = await ctx.guilds.idFor(guild);
+      if (row === undefined) return undefined;
+      const places = placesOf(row, reports);
+      const viewer = await viewers.viewer(guild, userId, forumsOf(places));
+      return viewer.kind === 'member'
+        ? await viewFor(guild, places, reports, viewer, userId)
+        : undefined;
+    } catch (err) {
+      deps.log.warn(
+        { err, guild, user: userId, reports: reports.map((report) => report.id) },
+        'could not show reports at stops made on the map',
+      );
+      return undefined;
+    }
+  };
+
   // Today's reports at the stops of the server (design 9.16): read anew on every request (one
   // indexed query; the page polls it), for members only, as the parties; an ETag of the member's
   // JSON, `private, no-cache`, 304 when the page has it.
@@ -163,7 +240,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
       const viewer = await viewers.viewer(guild, session.userId, forumsOf(places));
       if (viewer.kind === 'not-member') return sendFailure(request, reply, 403);
       if (viewer.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
-      const body = await viewFor(guild, places, reports, viewer, session.userId);
+      const body = JSON.stringify(await viewFor(guild, places, reports, viewer, session.userId));
       const etag = etagOf(body);
       void reply.header('etag', etag);
       if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
@@ -220,7 +297,352 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
       origins: deps.pictureOrigins,
     }),
   );
+
+  /** The words of a command as text of the page, in the posts' zone. */
+  const words = (text: string): string => pageWords(text, deps.parties.zone, deps.now());
+
+  /**
+   * An answer's words on the map: the command's, without the heading of its answer
+   * ("### Field research reported": the page says what was done its own way), as page text.
+   */
+  const answerWords = ({ head, where }: { head: string; where: string }): string =>
+    words(`${head.replace(/^### [^\n]*\n/u, '')}\n${where}`);
+
+  /** A region channel as the map's answers name it: `#west`, else `Region 5`. */
+  const channel: ChannelNamer = (channelId) => {
+    const name = stops.channelName(channelId);
+    if (name !== undefined) return `#${name}`;
+    const region = ctx.regions.byChannel(channelId);
+    return region ? `Region ${String(region.id)}` : '#unknown';
+  };
+
+  /** A refusal in the command's words, as text of the page, and what else the page needs. */
+  const refuse = (
+    reply: FastifyReply,
+    status: number,
+    text: string,
+    more: Omit<StopReportAnswer, 'ok' | 'text'> = {},
+  ) => {
+    const answer: StopReportAnswer = { ok: false, text: words(text), ...more };
+    return reply.code(status).send(answer);
+  };
+
+  /** The reports at stops one address may send in a minute, whoever sends them. */
+  const writeLimiter = new RateLimiter({ uses: STOP_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
+  const writeGuards = [
+    limitedPerAddress(writeLimiter, { now: deps.now }),
+    postGuard(sessions, deps.settings.publicUrl),
+  ];
+
+  /**
+   * The stops a report names by their keys, of this server (`stopsByKey`), or the refusal sent:
+   * none known in the server's regions at all, `/research`'s `NO_STOPS_HERE` (422); a key that is
+   * no PokéStop of this server, 404 (nobody learns of other servers' stops).
+   */
+  const stopsNamed = async (
+    request: GuildRequest,
+    reply: FastifyReply,
+    guild: string,
+    keys: readonly string[],
+  ): Promise<{ stops: ReportedStop[] } | { sent: FastifyReply; outcome: string }> => {
+    const row = await ctx.guilds.idFor(guild);
+    if (row === undefined || !ctx.placeFinder.hasStops(row)) {
+      return { sent: refuse(reply, 422, NO_STOPS_HERE), outcome: 'no-stops' };
+    }
+    const stopsFound = await stopsByKey(ctx, guild, keys);
+    if (stopsFound.length !== new Set(keys).size) {
+      return { sent: sendFailure(request, reply, 404), outcome: 'no-stop' };
+    }
+    return { stops: stopsFound };
+  };
+
+  // A research report (plan 8R-3), as `/research report` makes it: before the body is read, the
+  // per-address limit and the guard of every POST. Then the session (403) and the body (400), who
+  // reports (`actingOnTheMap`), the stops (`NO_STOPS_HERE` 422; a key of no stop of this server
+  // 404), the task and its reward (`readTask`: 422 in its words, `TASK_LIST_CHANGED` among them),
+  // none counted; only then `/research report`'s throttle in its window (`researchWindow`: the
+  // map shares the command's, design 9.12); then `reportResearchAs` as the member.
+  scope.post('/api/research', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
+    void reply.header('cache-control', 'no-store');
+    const session = await sessions.of(request, reply);
+    if (!session) return sendFailure(request, reply, 403);
+    const body = researchBodySchema.safeParse(request.body ?? {});
+    if (!body.success) return sendFailure(request, reply, 400);
+    const { guild } = request.params;
+    const { userId } = session;
+    const doing = 'reported field research';
+    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
+    if ('sent' in acting) return acting.sent;
+    const keys = body.data.stops;
+    /** The stops as the log names them: the keys found, else how many were sent (never a text). */
+    let logged: readonly string[] | number = keys.length;
+    /** What came of the report, logged as a command is, a refusal too; never a text. */
+    const noted = <T>(outcome: string, sent: T): T => {
+      deps.log.info(
+        { user: userId, guild, stops: logged, outcome },
+        'field research was reported on the map',
+      );
+      return sent;
+    };
+    const named = await stopsNamed(request, reply, guild, keys);
+    if ('sent' in named) return noted(named.outcome, named.sent);
+    logged = named.stops.map((stop) => stop.key);
+    let subject: ResearchSubject;
+    try {
+      subject = readTask(ctx, body.data.task, body.data.reward ?? null);
+    } catch (err) {
+      if (!(err instanceof UserError)) throw err;
+      return noted('refused', refuse(reply, 422, err.message));
+    }
+    const { settings } = ctx.config;
+    const throttle = researchThrottle(settings);
+    const key = { command: RESEARCH_REPORT, varies: true };
+    const throttled = throttledOnTheMap(deps, reply, key, userId, throttle);
+    if (throttled) return noted('throttled', throttled);
+    const reporter = reporterNamed(userId, acting.member.name, session.userName);
+    const reported = await countedOnTheMap(deps, key, userId, throttle, () =>
+      reportResearchAs(ctx, guild, { stops: named.stops, subject, reporter }),
+    );
+    const made = reported.outcome.saved.map(({ report }) => report);
+    const shown = await shownTo(guild, userId, made);
+    const answer: StopReportAnswer = {
+      ok: true,
+      text: answerWords(researchWords(reported.view, channel)),
+      research: shown?.research ?? [],
+    };
+    return noted('reported', reply.send(answer));
+  });
+
+  /** A Rocket report as the member sees it on the map: a grunt or a hideout, where shown. */
+  const rocketShown = async (
+    guild: string,
+    userId: string,
+    report: RocketReport,
+  ): Promise<Pick<StopReportAnswer, 'grunt' | 'hideout'>> => {
+    const shown = await shownTo(guild, userId, [report]);
+    const [grunt] = shown?.grunts ?? [];
+    const [hideout] = shown?.hideouts ?? [];
+    return { ...(grunt ? { grunt } : {}), ...(hideout ? { hideout } : {}) };
+  };
+
+  /** The question before a grunt replaces a hideout, with the hideout to say Replace to. */
+  const askReplace = async (
+    reply: FastifyReply,
+    guild: string,
+    userId: string,
+    hideout: RocketReport,
+    grunt: RocketChoice,
+  ) =>
+    refuse(reply, 422, hideoutQuestion(hideout.rocket.name, grunt.name), {
+      asks: { replacing: hideout.id },
+      ...(await rocketShown(guild, userId, hideout)),
+    });
+
+  // A Rocket report (plan 8R-3), as `/rocket report` makes it: before the body is read, the
+  // per-address limit and the guard of every POST. Then the session (403) and the body (400), who
+  // reports, the stop (as for research), who was met (`readWho`: 422 in its words,
+  // `LINEUPS_CHANGED` among them), none counted; a grunt where a hideout stands that the member
+  // did not say Replace to (`replacing`) is the question `/rocket` asks in its dialog, as a 422
+  // with the hideout's id, uncounted, unless `/rocket report`'s window is full (429, as Discord
+  // opens no dialog then); only then the command's throttle in its window (`rocketWindow`); then
+  // `reportRocketAs` as the member. What is none of the member's doing gives the use back (a
+  // hideout reported meanwhile, asked about; a grunt posted nowhere; one overtaken); the same
+  // grunt standing stays counted (8R-2).
+  scope.post('/api/rocket', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
+    void reply.header('cache-control', 'no-store');
+    const session = await sessions.of(request, reply);
+    if (!session) return sendFailure(request, reply, 403);
+    const body = rocketBodySchema.safeParse(request.body ?? {});
+    if (!body.success) return sendFailure(request, reply, 400);
+    const { guild } = request.params;
+    const { userId } = session;
+    const doing = 'reported Team GO Rocket';
+    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
+    if ('sent' in acting) return acting.sent;
+    /** The stop as the log names it: its key once found, else none (never a text). */
+    let logged: { stop?: string } = {};
+    const noted = <T>(outcome: string, sent: T): T => {
+      deps.log.info(
+        { user: userId, guild, ...logged, outcome },
+        'Team GO Rocket was reported on the map',
+      );
+      return sent;
+    };
+    const named = await stopsNamed(request, reply, guild, [body.data.stop]);
+    if ('sent' in named) return noted(named.outcome, named.sent);
+    const [stop] = named.stops;
+    if (stop === undefined) return noted('no-stop', sendFailure(request, reply, 404));
+    logged = { stop: stop.key };
+    let choice: RocketChoice;
+    try {
+      choice = readWho(ctx, body.data.who);
+    } catch (err) {
+      if (!(err instanceof UserError)) throw err;
+      return noted('refused', refuse(reply, 422, err.message));
+    }
+    const { settings } = ctx.config;
+    const throttle = rocketThrottle(settings);
+    const key = { command: ROCKET_REPORT, varies: true };
+    const { replacing } = body.data;
+    const who = parseRocketKey(choice.key);
+    const standing = await ctx.stopReports.rocketAt(guild, stop.key);
+    if (
+      who !== undefined &&
+      !isHideout(who) &&
+      standing !== undefined &&
+      isHideoutReport(standing) &&
+      standing.id !== replacing
+    ) {
+      // Discord refuses `/rocket report` for a full window before its dialog opens.
+      const full = throttledOnTheMap(deps, reply, key, userId, throttle, { count: false });
+      if (full) return noted('throttled', full);
+      return noted('asks', await askReplace(reply, guild, userId, standing, choice));
+    }
+    const throttled = throttledOnTheMap(deps, reply, key, userId, throttle);
+    if (throttled) return noted('throttled', throttled);
+    const countedAt = deps.now();
+    const reporter = reporterNamed(userId, acting.member.name, session.userName);
+    let outcome: RocketAs;
+    try {
+      outcome = await reportRocketAs(
+        ctx,
+        guild,
+        { choice, stop, reporter, ...(replacing === undefined ? {} : { replacing }) },
+        channel,
+      );
+    } catch (err) {
+      // No fault of the member's (the store failed): the use is given back, as on Discord.
+      givenBackOnTheMap(deps, rocketWindow(settings), userId, throttle, countedAt);
+      throw err;
+    }
+    switch (outcome.kind) {
+      case 'reported': {
+        const answer: StopReportAnswer = {
+          ok: true,
+          text: answerWords(rocketWords(outcome.view, channel)),
+          ...(await rocketShown(guild, userId, outcome.report)),
+        };
+        return noted('reported', reply.send(answer));
+      }
+      case 'already': {
+        // Counted, as `/rocket` counts it (8R-2). The reporter by name, never an id.
+        const by = outcome.standing.reporter.name.trim();
+        const text = alreadyReported(
+          outcome.standing,
+          undefined,
+          by === '' ? 'a member' : `**${plain(by)}**`,
+        );
+        const shown = await rocketShown(guild, userId, outcome.standing);
+        return noted('already', refuse(reply, 409, text, shown));
+      }
+      case 'asks':
+        // A hideout reported since the check above (or another than the one said): asked anew.
+        givenBackOnTheMap(deps, rocketWindow(settings), userId, throttle, countedAt);
+        return noted('asks', await askReplace(reply, guild, userId, outcome.standing, choice));
+      case 'unposted':
+      case 'overtaken':
+        givenBackOnTheMap(deps, rocketWindow(settings), userId, throttle, countedAt);
+        return noted(
+          outcome.kind,
+          refuse(reply, outcome.kind === 'unposted' ? 503 : 409, outcome.text),
+        );
+    }
+  });
+
+  // Taking a report back (plan 8R-3), as `/research remove` and `/rocket remove` do: before the
+  // body is read, the per-address limit, the guard of every POST and an id that can be one (404).
+  // Then the session (403), the body (nothing, 400), who takes it back; the report, of this server
+  // and standing (409 `NOTHING_LEFT` otherwise, alike for an id of another server or none), the
+  // member's own or any for staff (`isMapStaff` of the member fetched fresh; 403
+  // `NOT_YOUR_REPORT`), none counted; only then the remove subcommand's throttle of its kind
+  // (`MEMBER_WRITE_THROTTLE` under `research remove` or `rocket remove`); then `takeBackAs`.
+  const knownId = async (request: RemoveRequest, reply: FastifyReply) => {
+    if (!/^\d{1,10}$/u.test(request.params.id)) return sendFailure(request, reply, 404);
+  };
+  scope.post(
+    '/api/stop-reports/:id/remove',
+    { onRequest: [...writeGuards, knownId] },
+    async (request: RemoveRequest, reply) => {
+      void reply.header('cache-control', 'no-store');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 403);
+      const body = removeBodySchema.safeParse(request.body ?? {});
+      if (!body.success) return sendFailure(request, reply, 400);
+      const { guild } = request.params;
+      const id = Number(request.params.id);
+      const { userId } = session;
+      const doing = 'took back a report at a stop';
+      const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
+      if ('sent' in acting) return acting.sent;
+      const noted = <T>(outcome: string, sent: T): T => {
+        deps.log.info(
+          { user: userId, guild, report: id, outcome },
+          'a report at a stop was taken back on the map',
+        );
+        return sent;
+      };
+      const report = await ctx.stopReports.get(guild, id);
+      if (!report) return noted('gone', refuse(reply, 409, NOTHING_LEFT));
+      const staff = isMapStaff(acting.standing, userId, deps.parties.ownerId);
+      if (!staff && report.reporter.id !== userId) {
+        return noted('not-yours', refuse(reply, 403, NOT_YOUR_REPORT));
+      }
+      const key = { command: report.kind === 'research' ? RESEARCH_REMOVE : ROCKET_REMOVE };
+      const throttled = throttledOnTheMap(deps, reply, key, userId, MEMBER_WRITE_THROTTLE);
+      if (throttled) return noted('throttled', throttled);
+      const taken = await countedOnTheMap(deps, key, userId, MEMBER_WRITE_THROTTLE, () =>
+        takeBackAs(ctx, guild, id, userId, staff),
+      );
+      switch (taken.kind) {
+        case 'removed': {
+          const answer: StopReportAnswer = { ok: true, text: words(taken.text) };
+          return noted('removed', reply.send(answer));
+        }
+        case 'not-yours':
+          return noted('not-yours', refuse(reply, 403, NOT_YOUR_REPORT));
+        case 'gone':
+          return noted('gone', refuse(reply, 409, NOTHING_LEFT));
+      }
+    },
+  );
 }
 
 /** The regions each report lies in, by the report's id. */
 type Places = ReadonlyMap<number, readonly Region[]>;
+
+/** A take-back's address: `/api/stop-reports/<id>/remove`. */
+type RemoveRequest = FastifyRequest<{ Params: { guild: string; id: string } }>;
+
+/** The reports at stops one address may send in a minute (reports and taking back together). */
+export const STOP_WRITES_PER_ADDRESS_MINUTE = 30;
+
+/** A stop's key as a report sends it: a Wayfarer id, or `pine-<id>`. */
+const stopKey = z.string().min(1).max(60);
+
+/**
+ * The body of a research report: the task as `/research`'s `task:` takes it (a key of the list,
+ * or typed in full), the reward of a typed task as its `reward:` does, one to five stops by key.
+ * Anything else is malformed.
+ */
+const researchBodySchema = z
+  .object({
+    task: z.string().max(100),
+    reward: z.string().max(100).optional(),
+    stops: z.array(stopKey).min(1).max(STOP_OPTIONS.length),
+  })
+  .strict();
+
+/**
+ * The body of a Rocket report: who as `/rocket`'s `who:` takes it (a key of the list, or a name
+ * typed in full), the stop by key, and the hideout's id the member said Replace to.
+ */
+const rocketBodySchema = z
+  .object({
+    who: z.string().trim().min(1).max(100),
+    stop: stopKey,
+    replacing: z.number().int().positive().optional(),
+  })
+  .strict();
+
+/** A take-back carries nothing. */
+const removeBodySchema = z.object({}).strict();
````

### Task 5: 8R-3 task 5: docs of reports at stops on the map, follow-ups

Prototype commit: `96182d63ddfc11352eb1cb9c2376857654b25e5d`

web.md gains "Reports at stops on the map (plan 8R-3)" (the shared
code paths, who sees which reports, the view, the pick lists, the
reports and the hideout question, taking back) and the addresses,
rate limits, windows and WebDeps lines; stop-reports.md the code paths
the commands share with the map, linkOf and messagesOfReports;
testing.md stopReportingWith and stopWebWith. The follow-ups get
"From the 8R-3 prototype", with what the web UX pass draws over it.

**Files:**

```
 docs/architecture/stop-reports.md            | 14 ++++++++------
 docs/architecture/testing.md                 |  5 +++--
 docs/architecture/web.md                     | 23 +++++++++++++++++------
 docs/superpowers/plans/phase-0-follow-ups.md | 15 +++++++++++++++
 4 files changed, 43 insertions(+), 14 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 96182d63ddfc11352eb1cb9c2376857654b25e5d -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-3 task 5: docs of reports at stops on the map, follow-ups`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index d71eed2ddef2e4db6b15c2cd5720b1505056395e..785174c704d4ac8985cc74316e079fa782c8647e 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -1,6 +1,6 @@
 # Reports at stops
 
-What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/2026-10-21-stop-reports-design.md`): stops of Pine's own, the field research task list, research periods, the stop reports and `/research`, the pinned post "Today at the stops", and the research wants and their DMs; Team GO Rocket (plan 8R-2): the lineups, `/rocket`, grunts' messages, the post's hideouts, Rocket wants and DMs. The map (8R-3) adds a layer. Read before changing anything under `src/domain/stops/`, `src/domain/research/`, `src/domain/rocket/`, `src/commands/research/`, `src/commands/rocket/`, `src/commands/stops/`, or `src/services/` `stop-reports.ts`, `stop-posts.ts`, `research-task-service.ts`, `rocket-lineup-service.ts`, `rocket-reports.ts`, `grunt-messages.ts`, `pine-stops.ts`.
+What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/2026-10-21-stop-reports-design.md`): stops of Pine's own, the field research task list, research periods, the stop reports and `/research`, the pinned post "Today at the stops", and the research wants and their DMs; Team GO Rocket (plan 8R-2): the lineups, `/rocket`, grunts' messages, the post's hideouts, Rocket wants and DMs. The map's server side (plan 8R-3) is in `web.md`, "Reports at stops on the map": it shares the code paths below. Read before changing anything under `src/domain/stops/`, `src/domain/research/`, `src/domain/rocket/`, `src/commands/research/`, `src/commands/rocket/`, `src/commands/stops/`, or `src/services/` `stop-reports.ts`, `stop-posts.ts`, `research-task-service.ts`, `rocket-lineup-service.ts`, `rocket-reports.ts`, `grunt-messages.ts`, `pine-stops.ts`.
 
 ## The tables (migration 027)
 
@@ -18,7 +18,7 @@ What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/202
 ## The task list
 
 - `settings.research` has a default for every key (always on, no switch): `url` (Leek Duck's `https://leekduck.com/research/`), `refreshHours` 1, `staleAfterHours` 6 (refused below twice `refreshHours`), `throttle` `{ uses: 10, minutes: 30 }`.
-- `ResearchTaskService` (`ctx.researchTasks`: `tasks()`, `byKey`, `readAt`) reads the page every `refreshHours` with Pine's User-Agent (`PINE_USER_AGENT`) and a byte cap (`readLimitedText`, `MAX_RESEARCH_PAGE_BYTES`), parses it (`parseResearchPage`, `src/domain/research/leekduck.ts`: tasks by category, rewards of `data-reward-type` `encounter` (a catalogue entry, shiny or not), `item` (key and quantity) and `resource` (Mega Energy of a species); the breakthrough is skipped), and keeps the last good list in `ResearchTask` so a start without the network still offers it. A read with fewer than half the tasks of the list in use is a warning and the list stays, unless the read before it listed the very same tasks or the list in use is older than `staleAfterHours` (then the page did shrink, and the smaller list is taken: a real shrink is never refused for good); a page of no task at all is a failed read (`parseResearchPage` throws), so it never empties the list, however often it comes; a list not read for `staleAfterHours` is said once in the log. The kept list keeps the page's order. A task's key is `taskKeyOf` (an FNV-1a hash of `foldTaskText`), the value of its choice.
+- `ResearchTaskService` (`ctx.researchTasks`: `tasks()`, `byKey`, `readAt`, `stale(now)`: none read, or not anew for `staleAfterHours`, the one rule of "out of date" for its log, its shrink guard and the map's pick list, plan 8R-3) reads the page every `refreshHours` with Pine's User-Agent (`PINE_USER_AGENT`) and a byte cap (`readLimitedText`, `MAX_RESEARCH_PAGE_BYTES`), parses it (`parseResearchPage`, `src/domain/research/leekduck.ts`: tasks by category, rewards of `data-reward-type` `encounter` (a catalogue entry, shiny or not), `item` (key and quantity) and `resource` (Mega Energy of a species); the breakthrough is skipped), and keeps the last good list in `ResearchTask` so a start without the network still offers it. A read with fewer than half the tasks of the list in use is a warning and the list stays, unless the read before it listed the very same tasks or the list in use is older than `staleAfterHours` (then the page did shrink, and the smaller list is taken: a real shrink is never refused for good); a page of no task at all is a failed read (`parseResearchPage` throws), so it never empties the list, however often it comes; a list not read for `staleAfterHours` is said once in the log. The kept list keeps the page's order. A task's key is `taskKeyOf` (an FNV-1a hash of `foldTaskText`), the value of its choice.
 - Whether the page shows an event's own tasks while the event runs is not known before 2026-11-09 (design 4.1): nothing reads event pages; a missing task is typed in full.
 
 ## Research periods
@@ -30,20 +30,22 @@ What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/202
 
 - `StopReportService` (`ctx.stopReports`) reports a task at one to five stops in the period on now (`reportResearch`): each stop's report of the period is replaced, whoever made it (`StopReportStorage.save` gives the one replaced), and ends with the period (`endsAt`). Listeners hear `changed(serverId, stops)` (the posts of the regions those stops lie in) and `reported(news)` (the notifier: only stops that did not have this very task in the period). A replacement is a report of its own: the replaced row is deleted and a new one made under the same lock, so a report's id never changes what it is (an old answer's Take back or "Same task at more stops…" finds its report gone and answers so; `/research remove` takes back by the id it read, and says `REPORT_CHANGED` where the report was replaced meanwhile). `takeBack(serverId, ids, by, staff)` removes a member's own reports, any for staff; a replaced report does not come back. The hourly upkeep (`PartyScheduler`, `stops`) sweeps ended reports.
 - `/research report task: stop: [stop2: … stop5:] [reward:]` and `/research remove stop:` (`src/commands/research/`): from a region's channel, forum or post (`RESEARCH_FROM_A_REGION`); where the server's regions hold no stop, `NO_STOPS_HERE` (Matt's answer 7). `task` is a choice of the list (found by reward words too) or text typed in full (free text, capped at 100 characters, shown through `plainNoLinks`; with `reward:` a Pokémon, item or Mega Energy); a key gone from the list is `TASK_LIST_CHANGED`. A stop is a choice of the stops (`stop:<key>`), typed text naming one, or a maps link (the nearest stop within 50 m, `PlaceFinder.nearestStop`). The guard reads all of it so a refusal does not count; the throttle is `settings.research.throttle` in a window of its own (`researchThrottle`, `researchWindow`); one report of five stops counts once. `defer: 'late'`.
+- **One code path with the map** (plan 8R-3; `src/commands/research/research-report.ts`): `reportResearchAs(ctx, serverId, { stops, subject, reporter }, also?)` is the report as the member and the view of its answer's words (`ResearchWordsView`: the region channels whose posts show it, until when, none named in rehearsal mode); `/research report`, "Same task at more stops…" and the map call it. `stopsByKey` names stops by their keys (a titled PokéStop in a region of the server, a stop of Pine's own by `pine-<id>`, each once; the menu's and the map's). `takeBackAs(ctx, serverId, id, by, staff)` takes a report back by id (`removed` with `tookBackWords`, `not-yours`, `gone`): `/research remove`, `/rocket remove` and the map. `reporterNamed` names a reporter (the name shown, else the account's, cut to 100). `NOT_YOUR_REPORT`, `REPORT_CHANGED` and `NOTHING_LEFT` (a Take back that finds nothing) are its words. `researchWords(view, channel)` (`src/render/research.ts`) words the answer with the caller's `ChannelNamer` (`DISCORD_CHANNEL`, `<#id>`, for the commands); `researchAnswer` wraps it with the controls and is the same message as before (an inline snapshot guards it).
 - The answer (`researchAnswer`, `src/render/research.ts`, for the reporter alone): the task and rewards, each stop (with what it replaced, "again" for the same task), where it shows (in rehearsal mode, which makes no post, only until when) and until when (`periodEndWords`: "until midnight", the time, with its day when it is not today), "Same task at more stops…" (`research:<id>:more`: a menu of up to 25 stops within `MORE_STOPS_METRES` (2 km) of the first without this task in the period, five at once; it counts in `/research report`'s window through the throttle's `as`, gives the use back where the report has ended or was replaced (`REPORT_ENDED`, `givesBack`), and answers apart with its own Take back) and "Take back" (`research:<id>:back[:<id>…]`, as many ids as fit; the rest by `/research remove`).
 
 ## Team GO Rocket (plan 8R-2)
 
-- **The lineups.** `settings.rocket` has a default for every key (always on, no switch): `url` (ScrapedDuck's `rocketLineups.min.json`, `ROCKET_LINEUPS_URL`), `refreshHours` 6, `staleAfterHours` 24 (at least two refreshes), `gruntMinutes` 30, `throttle` `{ uses: 10, minutes: 30 }` (`/research`'s numbers in a window of its own, design 9.12). `RocketLineupService` (`ctx.rocketLineups`: `choices()`, `byKey`, `readAt`) reads the feed with Pine's User-Agent and a byte cap (`readLimitedJson`, `MAX_ROCKET_FEED_BYTES`), keeps the last good list in `RocketLineup` and takes it at start without the network, with the guard of the task list (a read of fewer than half the choices is kept out unless the read before agrees or the list is out of date; a feed of no lineup throws, so it never empties the list; out of date said once). `parseRocketLineups` (`src/domain/rocket/lineups.ts`, pure) makes one choice per grunt type (a type of two lineups, the male and female water grunts, is their union), the untyped grunts, the decoy, Cliff, Arlo, Sierra and Giovanni, in that order (grunt types by name); keys `rocketKey`: `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra>`, `giovanni`; names `rocketName` ("Water-type grunt", "Grunt (no type)", "Decoy grunt"). The catches are the Pokémon marked `isEncounter` in any slot (Giovanni's is in the third), named by the catalogue (`identifyBoss` of name and picture), each once; a lineup of an unknown title, leader or type is skipped and counted. `/rocket` always offers and takes the hideouts (the decoy, Cliff, Arlo, Sierra, Giovanni), with their catches where the lineups have them, and the grunt types of the lineups (every type, without catches, before any lineups were ever read; `rocketChoices`, fix B5): only a grunt type gone from the lineups is `LINEUPS_CHANGED`.
+- **The lineups.** `settings.rocket` has a default for every key (always on, no switch): `url` (ScrapedDuck's `rocketLineups.min.json`, `ROCKET_LINEUPS_URL`), `refreshHours` 6, `staleAfterHours` 24 (at least two refreshes), `gruntMinutes` 30, `throttle` `{ uses: 10, minutes: 30 }` (`/research`'s numbers in a window of its own, design 9.12). `RocketLineupService` (`ctx.rocketLineups`: `choices()`, `byKey`, `readAt`, `stale(now)` as the task list's) reads the feed with Pine's User-Agent and a byte cap (`readLimitedJson`, `MAX_ROCKET_FEED_BYTES`), keeps the last good list in `RocketLineup` and takes it at start without the network, with the guard of the task list (a read of fewer than half the choices is kept out unless the read before agrees or the list is out of date; a feed of no lineup throws, so it never empties the list; out of date said once). `parseRocketLineups` (`src/domain/rocket/lineups.ts`, pure) makes one choice per grunt type (a type of two lineups, the male and female water grunts, is their union), the untyped grunts, the decoy, Cliff, Arlo, Sierra and Giovanni, in that order (grunt types by name); keys `rocketKey`: `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra>`, `giovanni`; names `rocketName` ("Water-type grunt", "Grunt (no type)", "Decoy grunt"). The catches are the Pokémon marked `isEncounter` in any slot (Giovanni's is in the third), named by the catalogue (`identifyBoss` of name and picture), each once; a lineup of an unknown title, leader or type is skipped and counted. `/rocket` always offers and takes the hideouts (the decoy, Cliff, Arlo, Sierra, Giovanni), with their catches where the lineups have them, and the grunt types of the lineups (every type, without catches, before any lineups were ever read; `rocketChoices`, fix B5): only a grunt type gone from the lineups is `LINEUPS_CHANGED`.
 - **One Rocket report per stop and day** (design 5.2, Matt's answer 4). A report is a `StopReport` row of the kind `rocket` (`RocketReport`: the detail is who by name and the catches as the lineups had them; `subjectKey` its `rocketKey`) in the day's period (`rocketDay`: `day:<date>` to local midnight; events change no hideout). Grunt and hideout share the row of the unique `(serverId, stopKey, kind, periodKey)`, so which stands is decided with that row locked: `StopReportStorage.saveUnless(report, keeps)` asks `decideRocket` (`src/domain/rocket/reports.ts`, pure) inside the transaction: nothing standing (or ended), reported; a hideout (a leader, Giovanni, the decoy) replaces whatever stands; the same grunt standing is `already`; another grunt replaces it; a grunt where a hideout stands `asks`, unless the member said Replace to that very hideout (`replacing` its id). `StopReportService.reportRocket` gives the outcome; a grunt stands `gruntMs` (`gruntMinutes`), a hideout until midnight; what it replaced while it stood is told to the listeners as `ended`, a hideout made or replaced draws the posts (`changed`), the same hideout again is no news. The decision holds across midnight (fix A2): `reportRocket` passes `standingAt`, so a Rocket report of another period that still stands at the stop (a grunt of yesterday past midnight) is the one decided against, locked with the rest and replaced (told as `ended`). `rocketAt(serverId, stopKey)` is the stop's Rocket report; `at` is research only. `takeBack` tells what it removed as `ended` too, and `changed` only of research and hideouts (none for a grunt alone, fix A4).
-- **Reporting** goes through `RocketService` (`src/services/rocket-reports.ts`, `ctx.rocket`; the map of 8R-3 will call it): the report (`rocketSubject(choice)`), then for a grunt its message in each region channel whose outline holds the stop (`channelsAt`, `regionsAtPoint`), then `NotifyService.rocketReported` with the messages (`RocketNews`); `already` comes back with the standing grunt's messages (`messagesOf`). Only storing throws, before anything is posted (fix A1): a channel whose message fails is passed over, and the notifier is told of what was posted. Outside rehearsal mode a grunt posted in none of its stop's region channels (all refused, or the bot shutting down) is taken back and answered `unposted` (fix A5: unseen, it would only answer "Already reported" without a link); a hideout it had replaced is put back under a new id in the grunt's place in one step under the stop's lock, so there is no moment without a report (`StopReportService.restore`, fix S4: unless its day has ended or another report than the grunt stands there by then; no new DM; the post is drawn anew), a grunt it had replaced cannot come back (its message is gone) and is named (fix R2); `/rocket` says so and gives the use back. A grunt that is no longer kept once its messages are posted (replaced by a newer report, or taken back, while they went out; `StopReportService.isKept`, read anew) is `overtaken` (fix F3): nobody is told, its messages are deleted, and `/rocket` answers that a newer report at the stop took its place and gives the use back. Outside rehearsal mode a grunt's DMs name only the channels it was posted in (fix R3). In rehearsal mode it has no message service: nothing is posted, the report is kept and told.
-- **Grunts' messages** (`GruntMessageService`, `src/services/grunt-messages.ts`): `gruntMessage` (`src/render/rocket.ts`, `ROCKET_COLOUR`): `### Water-type grunt`, `**Catch** one of …`, when it goes away, `**Where**` the stop's line with its maps link and picture, a gallery of the catches' pictures (ten at most), the reporter in the small print (`memberByName`); `gruntTextMessage` where the bot may not embed; a message refused for what it holds is sent once more without pictures; a channel where the send fails for any reason (refused, 5xx, a time-out) is passed over and logged, and a message that cannot be recorded is deleted at once and counts as not posted (`post` never rejects, fix A1); a delete after a report ended early that fails is tried once more a minute later (fix A3). Each message is a `GruntMessage` row until deleted: at the report's end, at once when it ends early (`ended`: replaced, taken back; one still on its way goes as soon as it is there, `endedEarly`, and `post` sends nothing more of it, fix F3), a failed delete once more a minute later, then by `sweep` (the scheduler's `grunts`, hourly and at start) until a day after its time. A shutdown deletes nothing (`close`): the report stands on through a restart, and so does its message (unlike spawn reports).
+- **Reporting** goes through `RocketService` (`src/services/rocket-reports.ts`, `ctx.rocket`; `/rocket` and the map call it through `reportRocketAs`): the report (`rocketSubject(choice)`), then for a grunt its message in each region channel whose outline holds the stop (`channelsAt`, `regionsAtPoint`), then `NotifyService.rocketReported` with the messages (`RocketNews`); `already` comes back with the standing grunt's messages (`messagesOf`). Only storing throws, before anything is posted (fix A1): a channel whose message fails is passed over, and the notifier is told of what was posted. Outside rehearsal mode a grunt posted in none of its stop's region channels (all refused, or the bot shutting down) is taken back and answered `unposted` (fix A5: unseen, it would only answer "Already reported" without a link); a hideout it had replaced is put back under a new id in the grunt's place in one step under the stop's lock, so there is no moment without a report (`StopReportService.restore`, fix S4: unless its day has ended or another report than the grunt stands there by then; no new DM; the post is drawn anew), a grunt it had replaced cannot come back (its message is gone) and is named (fix R2); `/rocket` says so and gives the use back. A grunt that is no longer kept once its messages are posted (replaced by a newer report, or taken back, while they went out; `StopReportService.isKept`, read anew) is `overtaken` (fix F3): nobody is told, its messages are deleted, and `/rocket` answers that a newer report at the stop took its place and gives the use back. Outside rehearsal mode a grunt's DMs name only the channels it was posted in (fix R3). In rehearsal mode it has no message service: nothing is posted, the report is kept and told.
+- **One code path with the map** (plan 8R-3; `src/commands/rocket/rocket-report.ts`): `reportRocketAs(ctx, serverId, { choice, stop, reporter, replacing? }, channel)` reports through `ctx.rocket.report` and gives each outcome for the caller (`reported` with the view of `rocketWords`, `already` with the grunt's messages, `asks` with the hideout, `unposted` and `overtaken` with their words, the channels named by `channel`); `/rocket report`, its dialog's Submit and the map call it. `hideoutQuestion(hideout, grunt)` is the question's words (the dialog adds "Submit replaces it."); `rocketWords(view, channel)` the answer's, which `rocketAnswer` wraps (an inline snapshot guards it); `alreadyReported(standing, link, by?)` names the reporter as the caller gives them (the map: by name, never an id). `GIOVANNI_ONLY_WHEN_SURE` is the warning of `/rocket report`'s help and of Giovanni's choice on the map.
+- **Grunts' messages** (`GruntMessageService`, `src/services/grunt-messages.ts`): `gruntMessage` (`src/render/rocket.ts`, `ROCKET_COLOUR`): `### Water-type grunt`, `**Catch** one of …`, when it goes away, `**Where**` the stop's line with its maps link and picture, a gallery of the catches' pictures (ten at most), the reporter in the small print (`memberByName`); `gruntTextMessage` where the bot may not embed; a message refused for what it holds is sent once more without pictures; a channel where the send fails for any reason (refused, 5xx, a time-out) is passed over and logged, and a message that cannot be recorded is deleted at once and counts as not posted (`post` never rejects, fix A1); a delete after a report ended early that fails is tried once more a minute later (fix A3). `messagesOfReports(ids)` reads the messages of many reports at once (`GruntMessageStorage.ofReports`; the map's list, plan 8R-3). Each message is a `GruntMessage` row until deleted: at the report's end, at once when it ends early (`ended`: replaced, taken back; one still on its way goes as soon as it is there, `endedEarly`, and `post` sends nothing more of it, fix F3), a failed delete once more a minute later, then by `sweep` (the scheduler's `grunts`, hourly and at start) until a day after its time. A shutdown deletes nothing (`close`): the report stands on through a restart, and so does its message (unlike spawn reports).
 - **`/rocket report who: stop:`** and **`/rocket remove stop:`** (`src/commands/rocket/`, every server): `who` a choice (`whoChoices`: by name, then by what can be caught; `Name · catches in short`, Giovanni's "(only when sure it is him)") or a name typed in full (`readWho`: `water`, `water grunt`, `arlo`, `decoy`); a key gone from the lineups is `LINEUPS_CHANGED`. The stop as `/research` reads it (`namedStop` with Rocket's refusal `NOT_A_ROCKET_STOP`). Its guard (`requireRocketReport`: `ROCKET_FROM_A_REGION`, `NO_STOPS_HERE`, who, the stop, and the hideout standing there) runs before the throttle (`rocketThrottle`, `rocketWindow`). A grunt where a hideout stands today opens the dialog "Replace a hideout?" (`defer` none then; `readInTime` with nothing more to read; `PendingRequests`): "Arlo was reported here today, and a hideout keeps grunts away all day. Replace Arlo’s report with the Water-type grunt? Submit replaces it." Its Submit (`rocket:<token>:replace`, `carriesOn` the command's use and window) reports with that hideout's id; another hideout meanwhile is `HIDEOUT_CHANGED` and gives the use back; one reported between the guard and the report (no dialog possible then) is refused and gives the use back. `already` answers "Already reported: a **Water-type grunt** at **Stop**, by **Ash** <t:R>; it goes away <t:R>." with a link to its message. The answer (`rocketAnswer`): who at which stop, what can be caught, what it replaced, where it shows (the grunt's channels and when it goes; a hideout's pinned posts until midnight; in rehearsal mode only until when) and Take back (`rocket:<id>:back:<stop key>:<rocketKey with . for :>:<madeAt in base 36>`, the bare `rocket:<id>:back` where that would pass 100 characters; `MEMBER_WRITE_THROTTLE`; where the id is gone it takes back the presser's report of the same who at the same stop made at the same moment and standing now, a hideout put back under a new id, which keeps its `madeAt` (fix S3), never a newer report of the same who (fix F1)). `/rocket remove` takes back one's own report at a stop, any for staff.
 
 ## The pinned post "Today at the stops"
 
 - `StopPostService` (`src/services/stop-posts.ts`): one post per region channel and local day, made at the first report of the day in the region, pinned (the "pinned a message" notice deleted where the bot may; at Discord's pin limit, or without Pin Messages, it stands unpinned and that is logged once per channel), drawn anew `POST_DELAY_MS` (3 s) after the last change (`Gathered`, coalesced) in one queue per channel (`KeyedLock`), the midnight delete included; reads are done before any Discord call. A change of the reports is drawn only in the regions it touched: `StopReportListener.changed(serverId, stops)` names the stops of the reports made or taken back (a replaced report's too), and only the region channels whose outlines hold one of them are queued; the period changes and the research events draw every post. A message whose payload equals the one last drawn there (a hash per message id, in memory: the first draw after a restart edits) is not edited. An edit that fails is thrown (logged, the post stands, the next change draws it again); a message is deleted and sent anew only when it is gone or changes kind (components v2 to plain text, or back, as `mayPost` changes), and, its kind not known in the first draw after a restart, when Discord refuses its edit for what it holds (`isRefusedBody`); any other failure keeps it there too. A channel with no post in memory reads its kept rows from storage before it draws (a report before `start` has read them, or after that failed, edits the post a restart left; a failed read draws nothing), and `start` keeps what such a draw made, and deletes a post older than its channel's newest (one whose delete failed at its midnight). A timer at `nextPeriodChange` draws every kept post anew (`draw` deletes the post of an ended day and makes today's where reports stand); `start()` does the same for what a restart left (`StopPost` keeps the ids, each message's saved as soon as it is sent, before it is pinned), and sets the timer also when the kept posts cannot be read; a change of the research events (`onResearchChange`) draws the posts anew and sets the timer again (those redraws in a set of their own, which `flush` and `close` wait for and `messageOf` does not: it waits only for its own channel). It is kept, saying "Nothing reported right now.", when every report is taken back. None in rehearsal mode.
-- `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task, most stops first, each with its rewards and up to 15 stops (`- **Stop** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"), the reward's picture beside it; within 40 components and `TEXT_BUDGET` a message, spilling into a second and third (`MAX_POST_MESSAGES`), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it), under an intra-day window when the day's research comes back. Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link. The day's hideouts (plan 8R-2) go after the research under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (the first catch's picture beside it) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
+- `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task, most stops first, each with its rewards and up to 15 stops (`- **Stop** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"), the reward's picture beside it; within 40 components and `TEXT_BUDGET` a message, spilling into a second and third (`MAX_POST_MESSAGES`), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it), under an intra-day window when the day's research comes back. Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link; `linkOf(channelId, subjectKey)` (plan 8R-3) gives it as last drawn, else the post's first message, and draws nothing: the map asks on every poll, where `messageOf` would edit the post each time. The day's hideouts (plan 8R-2) go after the research under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (the first catch's picture beside it) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
 - `PartyGateway.pinMessage` / `unpinMessage` (`PinOutcome`: `pinned`, `full`, `not-allowed`, `gone`); Pin Messages is optional in `REGION_CHANNEL_NEEDS`, so `cutover-check` warns where it lacks.
 
 ## Wants and DMs
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 4ba21662e923c328516a6ace8a47fe85784ae301..60021e7d0b6b6679cc4804f7ca8ea3fc1252796f 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -57,10 +57,10 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 ## Reports at stops (plans 8R-1, 8R-2)
 
 - Each repository of `stop-reports.md` and its twin run one set of cases: `stopReportCases` (`test/support/stop-report-cases.ts`, with `reportedStop(n, overrides)` (Yellow Mural `n` at 40.44…, −79.99: outside the invented regions, so a test that needs a region moves it, as `west(n)` in `stop-posts.test.ts`), `researchReport()`, `REPORT_NOW`, `REPORT_SERVER`, `DRATINI`), `pineStopCases` (`newPineStop()`), `researchEventCases`, `researchTaskCases` and `stopPostCases` (`test/support/research-store-cases.ts`, with `INTO_THE_WILD`, `PAWNIARD_DAY`, `listedTask()`; twins `MemoryResearchEvents`, `MemoryResearchTasks`, `MemoryStopPosts` in `test/support/research-store.ts`), `targetWantCases` (its constants of every kind of target), `wantBoxCases`.
-- The task list: `readResearchPage()` (Leek Duck's page of 2026-10-21, `test/fixtures/leekduck-research.html`, unchanged: 58 tasks, 299 rewards), `researchTasksOfPage()` (parsed once, frozen), `pageTask(text)` and `researchTasksFixture(tasks?, readAt?)` (`test/support/research.ts`, a `ResearchTaskProvider`, `ctx.researchTasks` of `createTestContext()`). Research events: `raidEventsFixture(zone, { research })`; the events feed fixture `test/fixtures/max-events.json` holds the two research events of November 2026.
+- The task list: `readResearchPage()` (Leek Duck's page of 2026-10-21, `test/fixtures/leekduck-research.html`, unchanged: 58 tasks, 299 rewards), `researchTasksOfPage()` (parsed once, frozen), `pageTask(text)` and `researchTasksFixture(tasks?, readAt?, staleAfterHours?)` (`test/support/research.ts`, a `ResearchTaskProvider`, `readAt` `null` for a list never read, out of date `staleAfterHours` (6) after `readAt`, `ctx.researchTasks` of `createTestContext()`). Research events: `raidEventsFixture(zone, { research })`; the events feed fixture `test/fixtures/max-events.json` holds the two research events of November 2026.
 - `createTestContext()` gives `ctx.stopReports` (a `StopReportService` over `MemoryStopReports` and the context's events), `ctx.pineStops` (none, over memory and the context's Wayspots), `ctx.targetWants` and `ctx.wantBoxes` (`MemoryWantBoxes` over the context's wants and target wants); `partyServiceWith()` gives `targetWants` to the notifier (`made.targetWants`), and `notifying.researchPosts` a test's own links (`notify-service.research.test.ts`).
 - `FakePartyGateway` pins (`pinMessage` / `unpinMessage`): `noPinning` (channels where it is `not-allowed`), `pinLimit`, `pinNotices` (the notices it deleted), `pinnedIn(channelId)`.
-- Team GO Rocket (plan 8R-2): `readRocketFeed()` (ScrapedDuck's `rocketLineups.min.json` of 2026-10-22, `test/fixtures/rocket-lineups.json`, unchanged: 26 lineups, 24 choices), `rocketChoicesOfFeed()` (parsed once, frozen), `feedChoice(key)` and `rocketLineupsFixture(choices?, readAt?)` (`test/support/rocket.ts`, a `RocketLineupProvider`, `ctx.rocketLineups` of `createTestContext()`; `[]` is a list never read). `rocketReport(overrides)` and `MUDKIP` (`stop-report-cases.ts`, a Water-type grunt at stop 1 for half an hour) beside `researchReport`; `rocketLineupCases` (`listedChoice`) and `gruntMessageCases` (`gruntRow`) in `test/support/rocket-store-cases.ts`, twins `MemoryRocketLineups`, `MemoryGruntMessages` (`failing` per method). `createTestContext()` gives `ctx.rocket` (a `RocketService` over the context's reports that posts no message, as in rehearsal mode); a test of grunts' messages passes its own over a `GruntMessageService` on a `FakePartyGateway` (`rocket.test.ts`, `rocket-reports.test.ts`), with `setTimer` to keep or fire the deletes by hand.
+- Team GO Rocket (plan 8R-2): `readRocketFeed()` (ScrapedDuck's `rocketLineups.min.json` of 2026-10-22, `test/fixtures/rocket-lineups.json`, unchanged: 26 lineups, 24 choices), `rocketChoicesOfFeed()` (parsed once, frozen), `feedChoice(key)` and `rocketLineupsFixture(choices?, readAt?, staleAfterHours?)` (`test/support/rocket.ts`, a `RocketLineupProvider`, `readAt` and `staleAfterHours` (24) as the task list's, `ctx.rocketLineups` of `createTestContext()`; `[]` is a list never read). `rocketReport(overrides)` and `MUDKIP` (`stop-report-cases.ts`, a Water-type grunt at stop 1 for half an hour) beside `researchReport`; `rocketLineupCases` (`listedChoice`) and `gruntMessageCases` (`gruntRow`) in `test/support/rocket-store-cases.ts`, twins `MemoryRocketLineups`, `MemoryGruntMessages` (`failing` per method). `createTestContext()` gives `ctx.rocket` (a `RocketService` over the context's reports that posts no message, as in rehearsal mode); a test of grunts' messages passes its own over a `GruntMessageService` on a `FakePartyGateway` (`rocket.test.ts`, `rocket-reports.test.ts`), with `setTimer` to keep or fire the deletes by hand.
 
 ## The Wayspot export tool (plan 8W-P)
 
@@ -78,6 +78,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Spawns on the map (plan 8M-4S): `spawnWebWith(ctx, { channelName, channels })` gives the web server what `/wild` reads and calls, from a test's context (`createTestContext` with `spawns`, `wants`, `regions` of `partyServiceWith`, and `config` with other `wildSpawnExceptions` to test them); pass it as `spawns` beside `partyWebWith(made, …)`, the same `throttles` in a router to see `/wild`'s window shared (`WILD_COMMAND`). Without it every use of the spawns' deps throws. `channels: made.gateway` lets the fake gateway say who an overwrite of their own keeps out of a region's channel (`gateway.ownViewDenials`, by channel; `failing.set('ownViewDenied', …)` for Discord away); without it nobody is. A point in several regions: change `made.regions.rows` (East's outline reaching into West, `spawn-report.test.ts`); the DMs are `made.notify.flush()` and `made.dms`. The bot refused in a region's channel: `gateway.failing.set('sendMessage', missingPermissions('POST'))`. The page's spawn form itself (`spawnUi`) imports Leaflet, which needs a browser as it loads: its test mocks `leaflet` and is `spawn-ui.isolated.test.ts`, with a `document` of its own (`vi.stubGlobal`, `vi.unstubAllGlobals()` afterwards) and a real `FormHold`.
 - Meetups on the map (plan 8M-5M): `meetupWebWith(ctx, { channelName })` gives the web server what `/meetup`, `/name`, `/info`, `/meet` and `/end` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `parties`, `regions` and `meetupSafety` of `meetupSafetyWith`, or of `createdMeetup` for a change, and `wayspots` of `wayspotsWith` for the stops; `await ctx.placeFinder.built()` before a stop is named); pass it as `meetups` beside `partyWebWith(made, …)`, which takes the services of `meetupSafetyWith` too, the same `throttles` to fill `/meetup`'s window (`MEETUP_COMMAND`) or a change's (`name`, or `variedThrottleKey('meet', START_THROTTLE)` for a start) before a request. Without it every use of the meetups' deps throws. The stops of `meetup-make.test.ts` are kept Wayspots in West: two PokéStops (one titled with a flagged word), a power spot, and for the cap 305 more. A block, a ruling: `made.storage.addBlock`, `made.storage.rule`; the moderators' post: `made.gateway.messagesIn(MOD_CHANNEL)`. The page's meetup forms are tested in their pure parts (`meetup-forms.test.ts`: the form, the editor, their bodies, `PlacePicking`, `StopLoads`, and the state `meetup-ui.ts` keeps, moved into pure functions there: the editor's fields typed in and the value each was drawn from, `editorTyped` and `editorAfter`; whether an answer closes the editor, draws it anew or only says its words, `editorStep`; whether the member chose the region, `regionChosenBy`; the box the stops are asked for, kept to the world, `stopsBox`); what is left in `meetup-ui.ts` is wiring to the DOM, and it and the map's side are tried at staging.
 - Max battles on the map (plan 8X-5): `maxReportingWith(safety, rows)` (`test/support/max-reporting.ts`) gives the services of `reportsWith` (without the moderators' channel unless `safety` names it), the max bosses of the recorded feed, the recorded max and big events, the kept power spot `SPOT_ROW` at `TEST_SPOT` (and `rows`), and a context over them whose place search is built (`ctx`); fake `Date` to `MAX_THURSDAY` (an ordinary Thursday, 14:00) first, and set the web server's `clock.now` to it (move both together to pass time). `maxWebWith(ctx, { channelName })` gives the web server what `/max` reads and calls; pass it as `maxes` beside `partyWebWith(made, …)`, whose `maxLook` shows a max battle as its post does (`reportedMax` for one made through the service). Without it every use of the max deps throws. A block at a pin: `made.storage.addBlock`; the moderators' notice: `made.reports.flush()`, then `made.gateway.messagesIn(MOD_CHANNEL)`; a spot in two regions: East's outline reaching into West (`made.regions.rows`), as for spawns.
+- Reports at stops on the map (plan 8R-3): `stopReportingWith(rows)` (`test/support/stop-reporting.ts`) gives the party services of `partyServiceWith` (`made`: its fake gateway holds the forums, who is barred, and the grunts' messages), the kept stops of `STOP_ROWS` (PokéStops 1 and 2 in West, 3 in East, a power spot) or `rows` (`wayspots`, the directory: `setPineStops` for stops of Pine's own), and a context with `StopReportService` over `MemoryStopReports` (`store`), `GruntMessageService` (`grunts`, over `gruntStore`; its timers never run) and `RocketService`; fake `Date` to `STOP_NOON` and set the web server's `clock.now` to it. `stopWebWith(ctx, { channelName, posts, grunts })` gives the web server what `/research` and `/rocket` read and call; pass it as `stops` beside `partyWebWith(made.made, …)` (whose `forums` the shared `PartyViewers` asks); `posts` is a `linkOf` of the test's (none by default), `grunts` the context's `grunts` for the grunts' links. Without it every use of the stops' deps throws. A command's window is filled under `researchWindow(settings)` or `rocketWindow(settings)` with `researchThrottle` / `rocketThrottle` (the varied keys the router counts them under), a take-back's under `RESEARCH_REMOVE` / `ROCKET_REMOVE` with `MEMBER_WRITE_THROTTLE`. A hideout reported between the route's look and the report: `vi.spyOn(made.ctx.stopReports, 'rocketAt').mockResolvedValueOnce(undefined)` (`stop-report-post.test.ts`).
 - Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode, the Move panel) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events, the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the right click on a raid's picture or dot runs the real Leaflet in `party-layer-contextmenu.isolated.test.ts` (plan 8W-3): globals stubbed in `vi.hoisted` with just enough of a browser for Leaflet to load (no DOM library), a map made of `L.Map.prototype` with its container, a pane, the marker's element made its target by `addInteractiveTarget`, the pointer's place given by stubbing the map's conversions, and `_fireDOMEvent` as Leaflet calls it; a marker that listens is the control that shows the test can fail. The rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
 - The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a colour written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define; `theme.test.ts` reads a theme through a fake reader (`readTheme`). It lives outside `src/web/client/` because the client's type check has no Node.
 - `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index a35aba3dd4fb0e05ff670dd0dc1bc2a10c24c857..6b51c0730f829836265050bfdd19f1b2af2b2cb0 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -1,12 +1,12 @@
 # The web server and the map
 
-The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, starting, arranging and moving trains on the map, making and changing meetups on the map, max battles on the map (the server side, plan 8X-5), the region editor, the Content Security Policy, and the rules for adding a route. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
+The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, starting, arranging and moving trains on the map, making and changing meetups on the map, max battles on the map (the server side, plan 8X-5), reports at stops on the map (the server side, plan 8R-3), the region editor, the Content Security Policy, and the rules for adding a route. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
 
 ## Settings, secrets, start and stop
 
 - Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (`osm` default, or `google`), `memberRole` (a role's name; blank or absent is unset: see "Who sees what"). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
 - Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows OpenStreetMap). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
-- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, its trains `TrainWebDeps`, its meetups `MeetupWebDeps`, its max battles `MaxWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
+- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, its trains `TrainWebDeps`, its meetups `MeetupWebDeps`, its max battles `MaxWebDeps`, its reports at stops `StopWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
 - Fastify's own logger is off. Every request is logged at debug by `method`, its route pattern (`/auth/link/:guild/:token`, never the address it was asked with, which may carry a token or code), `status` and `ms`. Never log a token, cookie, OAuth code, CSRF token, secret or the query string of `/auth/*`; a failure is logged as `{ err }` with the route.
 - Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/` (401 "Log in first.", 403, 404, 413, 429, 503 "Not available just now."), a short page otherwise, never a stack or what went wrong; 500s are logged. Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's preview and save, 2 MB: `SAVE_BODY_LIMIT`) sets its own `bodyLimit`.
 
@@ -16,7 +16,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 ## Addresses
 
-- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>` and `POST …/conductor/<change>` (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
+- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>` and `POST …/conductor/<change>` (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the reports at stops' `/s/<guild>/api/stop-reports`, `/s/<guild>/api/research-options`, `/s/<guild>/api/rocket-options`, `POST /s/<guild>/api/research`, `POST /s/<guild>/api/rocket` and `POST /s/<guild>/api/stop-reports/<id>/remove` (`stopRoutes`, `src/web/stop-routes.ts`, plan 8R-3); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
 - The Wayspot export tool's addresses (plan 8W-P, below) are the one exception to `/s/<guild>/`: `/userscript` (the page and its POSTs) and `/userscript/<key>/pine-wayspot-export.user.js` and `….meta.js`, with every other path under `/userscript/` a plain 404 (`toolPageRoutes`, `toolFileRoutes`, `src/web/tool-routes.ts`). The tool is not a server's: one instance, the owner's, hands it to the admins of other instances.
 - Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters), to `/userscript` exactly (not `/userscript/`, `/userscript?x`, `/userscriptx` or `//userscript`), or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
 
@@ -30,7 +30,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 - With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
 - With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page without script (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, so that a link preview or a prefetch cannot spend the link. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped), because one click on somebody else's link logs you in as them, and the page is where you see whose it is. An unknown, used or expired link, or one of another server, shows plain "Continue" and nothing else (its POST lands on `?login=expired`). `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The answers of `/maps` and `/region edit` say so under the button: "The button logs you in as well. It works once, within five minutes; do not share it: it logs in whoever opens it as you. Use /maps again for another." (Matt, 2026-10-18). The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
-- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute, `/s/*/api/powerspots` 60 a minute, `/s/*/api/max-options` 30 a minute, the reports of max battles 30 a minute (`MAX_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`), a press of the Manage train panel in the window of the post's controls (as the post's panel counts; its kind menu too, plan 8X-5), a report of a max battle in `/max`'s (`MAX_COMMAND`, `MAX_THROTTLE`), the Remote switch of a party in the window of the post's controls (as its Remote button counts), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words); the work after it runs in `countedOnTheMap`, which gives the use back on an unexpected error or a `UserError` with `givesBack`, as the router does (a refusal stays counted; a write whose service answers a refusal with `givesBack`, a new train or meetup, gives it back itself with `givenBackOnTheMap`).
+- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute, `/s/*/api/powerspots` 60 a minute, `/s/*/api/max-options` 30 a minute, the reports of max battles 30 a minute (`MAX_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stop-reports` 30 a minute (`STOP_REPORTS_PER_MINUTE`), `/s/*/api/research-options` and `/s/*/api/rocket-options` 30 a minute each, the reports at stops and their taking back 30 a minute together (`STOP_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`), a press of the Manage train panel in the window of the post's controls (as the post's panel counts; its kind menu too, plan 8X-5), a report of a max battle in `/max`'s (`MAX_COMMAND`, `MAX_THROTTLE`), a research report in `/research report`'s and a Rocket report in `/rocket report`'s (`researchWindow`, `rocketWindow`: their limits come from the settings, so the window is the varied one, `{ command, varies: true }`), a taking back in `/research remove`'s or `/rocket remove`'s by the report's kind (`MEMBER_WRITE_THROTTLE`), the Remote switch of a party in the window of the post's controls (as its Remote button counts), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words); the work after it runs in `countedOnTheMap`, which gives the use back on an unexpected error or a `UserError` with `givesBack`, as the router does (a refusal stays counted; a write whose service answers a refusal with `givesBack`, a new train or meetup, gives it back itself with `givenBackOnTheMap`).
 
 ## The public map
 
@@ -95,6 +95,17 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - **A report** `POST /s/<guild>/api/maxes`, body `{ spot }` (a power spot's Wayfarer id) or `{ lat, lon }` (a point), `region?`, `boss` (a value of the list or typed, up to 100), `tier?` (`D1` to `G`, as `/max`'s `tier:`), `end?` (as `end:` takes it, up to 40), `soon?: { value: 'next' | 'soon', end }` (strict; both a spot and a point, neither, or `soon` with a typed end: 400). Before the body is read: 30 a minute per address (`MAX_WRITES_PER_ADDRESS_MINUTE`) and `postGuard`. Then, in this order, none counted: the session (403) and the body (400); who reports (`actingOnTheMap`); the spot (`spotAt`: a power spot by its id, refused `PLACE_GONE` once Pine keeps it no more or it lies in no region of the server; a point, kept to six decimals, in a region of the server, else `PIN_NOT_HERE`, which is the nearest power spot within 50 metres, else an unlisted power spot: the map's point is what a pin is, Q7, as `/max` takes a maps link); the regions of the server at its point (`regionsAtPoint`): several without one of them picked 422 `{ ok: false, text: "This place lies in several regions: pick the one to report the max battle in.", regions }` (names as the raids' list names them); `/max`'s readers (`readMaxBoss`, `reportedEnd`: 422 in their words, the last battle time; where `/max` names its option `tier:`, `WHICH_TIER`, the map says "Which tier? Pick the tier of this boss." with `needs: 'tier'`; where it names the list that appears while one types, `UnknownMaxBoss`, the map says "I know no Pokémon called "…". Pick a boss from the list." with `needs: 'boss'`, `mapUnknownBoss`); a `soon` whose end has passed 422 "That battle has ended meanwhile: nothing was reported." (the dialog's Submit's words); another boss at the spot 409 in `takenWords` (the battle there as `max` where the member may see it, its forum always asked of Discord: this comes before `maxBarred`; no post named, the hint of `/boss` in the map's words); a new battle at a pin by a member blocked from meetups 403 in the map's words, "… Pick a power spot on the map." (`MAP_PIN_BLOCKED`; `/max`'s `MAX_PIN_BLOCKED` names its list), with `needs: 'listed-spot'` (joining the battle there is allowed, as from `/max`); the forums (`maxBarred`: 403 `{ error: MAX_BARRED }`, Discord unreachable 503); **the ending-soon question** where `/max` opens its dialog (a new battle, no typed end, its end within five minutes), unless `/max`'s window is full (429 as the throttle below answers, nothing counted: `throttledOnTheMap` with `count: false`, as Discord refuses `/max` before its dialog opens): 422 `{ ok: false, text, soon: { choices: [{ value, label, end }] } }` in the dialog's words (until the next rotation first, then until the end about to pass; only the latter, with "Report it anyway?", where no later rotation is left); the report sent again with `soon` takes that end while it is a choice the server offers now (decided anew, no state kept between the two requests), else is asked again with the new choices; a page drops `soon` once that end has passed (a report sent with it is refused as the dialog's Submit refuses it, even where a report without it would pass). Only then `/max`'s throttle in its window (`MAX_COMMAND`, `MAX_THROTTLE`: `/max` counts one use for its dialog and Submit, the map one for the report sent again); then `reportMaxAs` as the member fetched fresh, a battle that came meanwhile in another forum asked about (`mayJoinNoting`: Discord away 503); `no-post` and `ended` give the use back (`givenBackOnTheMap`), and so does `pin-blocked` (the battle at a pin a blocked member would join ended before the report was written: 403 `MAP_PIN_BLOCKED` with `needs: 'listed-spot'`, as the check above). `needs` (`MaxNeed`, `max-data.ts`) is the machine part of a refusal a page acts on: `tier`, `listed-spot`, `boss`; the words are only to be shown. `/max`'s words that name `/max` or its options are said on the map in its own (the namer, `MaxNames`: `ended`, "The max battle there has just ended: report it again.", `MAP_MAX_ENDED`; `bossHint` after another boss's battle, "Open its post and use /boss there to change its boss.", `MAP_BOSS_HINT`; `pinBlocked`, `MAP_PIN_BLOCKED`; and in the route a spot no region's outline holds any more, "… Pick a power spot on the map.", `MAP_NOT_HERE`, where `/max` says `NOT_HERE`); `/max`'s stay as they are. The answer (`MaxAnswer`): 200 `created`, 409 `exists` (joined: "You have been marked as interested.") and `taken`, 422 `ended`, `no-region` and `no-forum`, 403 `barred` and `pin-blocked`, 503 `no-post` (none of the member's doing, the use given back); `{ ok, text, max? }` with the battle as the map shows it where the member is not kept out of its forum, and " It was posted in #west." after the words when the region picked has no forum and the battle went to another region of the spot (`regionForSpot`). Logged at info once who reports is known, a refusal too: `{ user, guild, spot | pin, outcome }` (the spot's Wayfarer id, or `pin: true`, once known; the outcome's kind, or `no-spot`, `refused`, `several-regions`, `taken`, `blocked`, `barred`, `unreachable`, `ends-soon`, `throttled`), "a max battle was reported on the map", never a text or the point; a new pin battle is also logged by `reportMaxAs` for staff, with its point, as from `/max`.
 - **Remote** on the map is the parties' press `remote` (above, "The parties on the map"), for every kind whose post has Remote; **the train's kind** is in "Trains on the map".
 
+## Reports at stops on the map (plan 8R-3)
+
+- **Scope** (Matt, 2026-10-22, as 8X-5): the server side alone: the data, the routes and the code paths they share with `/research` and `/rocket`. The page (`src/web/client/`) has none of it yet (no layer, popups, Report research / Report Rocket, right-click, filter): left for the UX pass (follow-ups, "From the 8R-3 prototype"). No migration, no command change.
+- **One code path per command** (spec 3.5; `stop-reports.md`, "Reports and `/research`"): `reportResearchAs` and `stopsByKey` (`src/commands/research/research-report.ts`), `reportRocketAs` and `hideoutQuestion` (`src/commands/rocket/rocket-report.ts`), `takeBackAs`; the answers' words are `researchWords` and `rocketWords` with the caller's `ChannelNamer` (on the map a region channel as `#west`, `Region 5` where the bot sees no name), the heading of the command's answer left out, made page text by `pageWords`. The web server is given what the commands read and call (`StopWebDeps.ctx`, `StopWebContext`), the channel names the bot sees (`channelName`), the pinned posts' messages as last drawn (`posts`: `StopPostService.linkOf`, which draws nothing and waits for nothing, unlike `messageOf`, which flushes the gathered redraw and would edit a post on every poll) and the grunts' messages (`grunts`: `GruntMessageService.messagesOfReports`, one read for every grunt of a request, `GruntMessageStorage.ofReports`); both undefined in rehearsal mode, which leaves the web server off anyway.
+- **Who sees which reports** (review R1): a report lies in the regions of the server whose outlines hold its stop's snapshot (`regionsAtPoints`: the server's regions taken once a request and each outline's box tried first, `containment` as the pinned post's; each report placed once, for who may see it and for the view alike; a stop renamed or gone later the same day stays, design 3), and shows unless the member is `barred` from the forum of every one of them (a region without a forum always shows it): the parties' rule, through the same `PartyViewers` (one for `/api/parties` and `/api/stop-reports`, made in `guildRoutes`, so that what Discord said of a forum serves both; read-only while Discord is away, 503 for a member it has not confirmed lately). No text channel is fetched. A report in no region now is shown to nobody.
+- **The view** `GET /s/<guild>/api/stop-reports` (members, as `/api/parties`: 401, 403, 503, `memberRole`; 30 a minute per address, `STOP_REPORTS_PER_MINUTE`): `stopReportView` (`src/domain/web/stop-report-view.ts`, pure; its types in `stop-report-data.ts`, without imports, for the page), read anew per request from `StopReportService.standing` (one indexed query; no version in memory: a grunt tells the posts nothing and a period change is no report event, so design 9.16's "source of its own" is the reports themselves), filtered by the clock. `research`: the reports of the period on now only (`periodKey`), and `waiting` `{ stops, at }` where the day's research waits under an intra-day event's window, as the pinned post says it, `event` the event's name; `grunts`: until their `endsAt`; `hideouts`: the day's. Each report: `id` (what a take-back sends), `stop` (the snapshot: key, name, address line, point to six decimals), `endsAt`, `reporter` (the name kept with the report as text, "a member" for none: never an id or `memberByName`'s markdown; stop reports have no anonymity, design 10), `mayTakeBack` (the member's own, any for staff by `isMapStaff` of the directory's standing; never while read-only), `link` (the message of today's pinned post that holds the task or hideout in a region the member sees, else its first message, as last drawn, `StopPostService.linkOf`: none past midnight until the posts are drawn anew; a grunt's own message in such a region; absent where there is none). Research: `task` (the key a report sends, `typed:<key>` for a typed task), `text`, `category`, `typed`, `rewards`; grunts and hideouts: `who` (`rocketKey`), `name`, `catches`, a hideout's `picture` (its first catch's, as the post shows it). A reward or catch (`MapReward`): `kind` (`encounter`, `item`, `energy`), `name`, `value` (what a filter matches and `/want` names, as `reward:`'s choices: `pokemon:<catalogue key>`, `item:<key>`, `energy:<dex>`; null for a Pokémon the game data does not know), `quantity`, `shiny`, `image` only from `pictureOrigins` (Leek Duck's pictures are on `cdn.leekduck.com`, the origin of `POKEMON_ICON_BASE`: items and Mega Energy keep theirs). An ETag of the member's JSON (`etagOf`), `private, no-cache`, 304.
+- **The pick lists** (members, an ETag of the JSON, `private, no-cache`, 304; 30 a minute per address each; `src/web/stop-options.ts`, pure): `GET /s/<guild>/api/research-options` (`ResearchOptionsView`): the task list whole in the page's order (not the autocomplete's 25), each `{ key, text, category, rewards }`, `stale` (`ResearchTaskProvider.stale(now)`: not read for `settings.research.staleAfterHours`, or never; the rule the service's own warning follows), `readAt`, and `rewards`, the items and Mega Energy a typed task's `reward` may name (`listedRewards`, `{ value, name }`; a Pokémon is named as `pokemon:<catalogue key>` or by its name, as `readReward` reads it). `GET /s/<guild>/api/rocket-options` (`RocketOptionsView`): `rocketChoices` in `/rocket`'s order, each `{ key, name, hideout, catches, note? }`, Giovanni's `note` `GIOVANNI_ONLY_WHEN_SURE` (also in `/rocket report`'s help), `stale` (`RocketLineupProvider.stale(now)`, `settings.rocket.staleAfterHours`) and `readAt` of the lineups. The stops a report names come from `/api/stops` (8M-5M), which lists the stops of Pine's own by the `pine-<id>` key the reports take (`stop-options.test.ts`).
+- **A research report** `POST /s/<guild>/api/research`, body `{ task, reward?, stops }` (strict: `task` as `/research`'s `task:` takes it, a key of the list or typed in full, up to 100; `reward` as its `reward:`, up to 100; one to five stop keys, each up to 60). Before the body is read: 30 a minute per address (`STOP_WRITES_PER_ADDRESS_MINUTE`, shared with the Rocket reports and taking back) and `postGuard`. Then, none counted: the session (403) and the body (400); who reports (`actingOnTheMap`); the stops (`NO_STOPS_HERE` 422 where the server's regions hold no stop at all; a key that is no titled PokéStop in a region of this server, a power spot or another server's stop of its own among them, 404, so nobody learns of other servers' stops: `stopsByKey`, which dedupes); the task and reward (`readTask`: 422 in its words, `TASK_LIST_CHANGED` among them). Only then `/research report`'s throttle in its window (`{ command: RESEARCH_REPORT, varies: true }`, the router's `researchWindow`: one budget with Discord, design 9.12; 429); then `reportResearchAs` as the member (named as Discord has them now, `reporterNamed`), in `countedOnTheMap`. 200 `{ ok: true, text, research }`: the words (`Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew +4`, a line per stop, where it shows), the reports made as the list shows them to the member (`shownTo`: never one in a region the member is kept out of, though it is made, as from the command; R13). The deliberate exception, for research and Rocket alike: an answer's words name what stands at the stop the member named, as the command does (a hideout in the question, the reporter of a grunt standing, a barred region's `#channel` where a report shows or could not be posted); the report objects follow the GET. Where what shows the reports cannot be read just now (the server's row, the grunts' messages, the posts), the answer is still `ok: true` with the words and without the report(s), and the failure a warning ("could not show reports at stops made on the map"): the report stands and was counted, and the page's next poll shows it. The pinned posts and DMs follow by themselves. Logged at info `{ user, guild, stops, outcome }` (the keys of the stops found, else how many were sent, never a key that names no stop; `reported`, `no-stops`, `no-stop`, `refused`, `throttled`), "field research was reported on the map", never a text. "Same task at more stops…" is no route: the page sends another report.
+- **A Rocket report** `POST /s/<guild>/api/rocket`, body `{ who, stop, replacing? }` (strict: `who` as `/rocket`'s `who:`, a key or a name typed in full, 1 to 100; one stop key; `replacing` the id of the hideout the member said Replace to). The order as for research, `readWho` the reader (`LINEUPS_CHANGED` among its words); then **the hideout question**, where `/rocket` opens its dialog (a grunt at a stop whose standing Rocket report, `rocketAt`, is a hideout, unless `replacing` is that hideout's id): unless `/rocket report`'s window is full (429, nothing counted: `throttledOnTheMap` with `count: false`, as Discord opens no dialog then), 422 `{ ok: false, text: hideoutQuestion(…), asks: { replacing: <hideout id> }, hideout? }` (the hideout as the list shows it, where shown); the report sent again with that `replacing` replaces it, decided anew inside the store (`decideRocket`: another hideout by then is asked about again). No state is kept between the two requests (as 8X-5's ending-soon question). Then `/rocket report`'s throttle (`rocketWindow`), then `reportRocketAs`: 200 `{ ok: true, text, grunt | hideout }`; the same grunt standing 409 "Already reported: a Water-type grunt at …, by Bob 2 min ago; it goes away in 28 min." with the `grunt` and its `link` (counted, as `/rocket` counts it, 8R-2); a hideout reported between the route's look and the report 422 with the question (the use given back); a grunt posted in none of its region channels 503 in `/rocket`'s words with the channels named `#west` (`unposted`, the use given back); one overtaken while posted 409 (given back); an unexpected failure gives it back too. Logged `{ user, guild, stop?, outcome }` (the stop's key once found), "Team GO Rocket was reported on the map".
+- **Taking back** `POST /s/<guild>/api/stop-reports/<id>/remove` (body empty or `{}`; an id that is not 1 to 10 digits 404 before the body): after the session, the body and `actingOnTheMap`, the report by id of this server that has not ended (`StopReportService.get`: an unknown id, another server's and one gone answer alike, 409 `{ ok: false, text: NOTHING_LEFT }`, R14), the member's own or any for staff (`isMapStaff` of the member fetched fresh; 403 `{ ok: false, text: NOT_YOUR_REPORT }`), none counted; then `MEMBER_WRITE_THROTTLE` in `/research remove`'s or `/rocket remove`'s window by the report's kind; then `takeBackAs`: 200 `{ ok: true, text: "Took back Catch a Dragon-type Pokémon at Yellow Mural." }`. A hideout put back under a new id (8R-2's fix S3) is found by the page's next poll, not by the old id. Logged `{ user, guild, report, outcome }`, "a report at a stop was taken back on the map".
+
 ## The region editor (plans 8M-2, 8M-2F)
 
 - **Who:** staff for regions as `/region` admits them, decided per request by `RegionStaffSource.check` (`DiscordRegionStaff`, `src/discord/web-staff.ts`: the member fetched fresh, `fetchGuildMember(…, true)`, then `regionStaffAnswer`, `src/web/region-staff.ts`): an admin, a moderator or a bot developer by role, or the bot's owner (`isBotManagement`, the guard's own check), who also has Manage Server (`/region`'s `default_member_permissions`, which on the web nobody else checks); their own Manage Channels says whether new channels may be made and forums deleted. A server that grants `/region` to a role through its Integrations overrides (Server Settings, Integrations) still needs Manage Server for that role's members on the web: the overrides are not read (Matt, 2026-10-16: Manage Server is kept). `staff`, `not-staff`, `not-member`, `unknown-server` (no `Guild` row yet), or `unreachable` (Discord failed: read-only for staff seen within 30 minutes, 503 for anybody else, nothing written). The session says only who.
@@ -127,5 +138,5 @@ The tool that makes the Wayspot export is private (`wayfarer.md`); the owner's i
 ## Adding a route
 
 - Put it under `/s/<guild>/` in `guildRoutes` (the guild check comes first), JSON under `/s/<guild>/api/`. The only exception is the Wayspot export tool's `/userscript` (above), which belongs to no server; another address outside `/s/<guild>/` needs the same reason. Read the session with `sessions.of`; decide what the member may do from fresh data each time (`members.find`, `fetchGuildMember(…, true)` before a staff write), never from the session; refuse writes while Discord cannot be reached.
-- Every POST: the per-address limit and `postGuard(…)` in `onRequest`, before the body is read (as the region editor's saves and the presses of 8M-3 do), a body validated with zod, the limit of 16 KB unless the route says otherwise; call the service the command calls (never a repository or Discord directly), through the command's own code path where its handler does more than call it (factor it into a function both call, as `pressStatus`, `reportRaidAs`, `changeRaidTime`, `reportSpawnAs`, the functions of `train-changes.ts`, `makeMeetupAs` and `renameAs` are), with the command's own throttle per member (`throttledOnTheMap`, the work after it in `countedOnTheMap` so that an unexpected failure gives the use back), counted in the router's `Throttles` under the command's or control's key (`controlThrottleKey`), as the presses of 8M-3 are, and only after every check that refuses for who asks or what they name (membership, the party, access), so that a refused write is not counted and nobody but a member learns which ids exist; act as the member fetched fresh (`actingOnTheMap` over `ActingMembers`, the same checks in the same order as every write; a forum Discord cannot say anything of is `unreachableOnTheMap`, 503; a GET of a member's data asks `memberOrFailure`, all in `src/web/acting.ts`), and share the handler's code path rather than copy it (`pressStatus`); log a write as a command is logged (member, server, what), never the texts.
-- Answer failures through `sendFailure` and refusals with the command's words, made text of the page by `pageWords` (`src/web/page-words.ts`: Discord's timestamps as clock times in the posts' zone, the bot's markdown and masked links taken out, `unplain`); a press drawn from a state of a party that may have changed carries that state (a place, a target, the route) and the service refuses it inside the store, 409 with the party as it is now; a mention of a post or a channel the page cannot show is named by the caller's namer (`ReportNames`, `PostNamer`, `SpawnNames`), not left as `<#id>`. Anything the page shows from data is set as text. A new outside host the page loads from goes into `securityHeaders` (and its test), never as an inline exception.
+- Every POST: the per-address limit and `postGuard(…)` in `onRequest`, before the body is read (as the region editor's saves and the presses of 8M-3 do), a body validated with zod, the limit of 16 KB unless the route says otherwise; call the service the command calls (never a repository or Discord directly), through the command's own code path where its handler does more than call it (factor it into a function both call, as `pressStatus`, `reportRaidAs`, `changeRaidTime`, `reportSpawnAs`, the functions of `train-changes.ts`, `makeMeetupAs`, `renameAs`, `reportResearchAs` and `reportRocketAs` are), with the command's own throttle per member (`throttledOnTheMap`, the work after it in `countedOnTheMap` so that an unexpected failure gives the use back), counted in the router's `Throttles` under the command's or control's key (`controlThrottleKey`), as the presses of 8M-3 are, and only after every check that refuses for who asks or what they name (membership, the party, access), so that a refused write is not counted and nobody but a member learns which ids exist; act as the member fetched fresh (`actingOnTheMap` over `ActingMembers`, the same checks in the same order as every write; a forum Discord cannot say anything of is `unreachableOnTheMap`, 503; a GET of a member's data asks `memberOrFailure`, all in `src/web/acting.ts`), and share the handler's code path rather than copy it (`pressStatus`); log a write as a command is logged (member, server, what), never the texts.
+- Answer failures through `sendFailure` and refusals with the command's words, made text of the page by `pageWords` (`src/web/page-words.ts`: Discord's timestamps as clock times in the posts' zone, the bot's markdown and masked links taken out, `unplain`); a press drawn from a state of a party that may have changed carries that state (a place, a target, the route) and the service refuses it inside the store, 409 with the party as it is now; a mention of a post or a channel the page cannot show is named by the caller's namer (`ReportNames`, `PostNamer`, `SpawnNames`, `ChannelNamer`), not left as `<#id>`. Anything the page shows from data is set as text. A new outside host the page loads from goes into `securityHeaders` (and its test), never as an inline exception.
diff --git a/docs/superpowers/plans/phase-0-follow-ups.md b/docs/superpowers/plans/phase-0-follow-ups.md
index d8e5e9a06a4abb80f54661cd0362fd95966008d5..c1656cdc6371e3863f47115f9dcdb35b595ce94f 100644
--- a/docs/superpowers/plans/phase-0-follow-ups.md
+++ b/docs/superpowers/plans/phase-0-follow-ups.md
@@ -2012,3 +2012,18 @@ Plan `2026-10-22-phase-8r2-rocket.md`, built on `stop-reports`; staging checklis
 - **Typed `none` stays zero IVs** (legacy Pine's word); "Grunt (no type)" is typed as "no type" (or "grunt"), and the list offers both for "none".
 - **For Matt (rulings, none blocking):** the official announcement's first message is now 2,756 characters (Discord allows 2,000; the 2,348 above is out of date): split it into the two messages the draft plans; Pittsburgh's post (at 2,000) names neither `/research` nor `/rocket`: swap a line. The single-catch gallery of a grunt message (the decoy's Bellsprout) spans the width: look at staging.
 - **Grunts' one-DM hour** and research DMs' told-once record are in memory: a restart may repeat a DM.
+
+## From the 8R-3 prototype (reports at stops on the map, the server side, 2026-10-22)
+
+Prototype on `proto-8r3` (worktree `.claude/worktrees/stop-reports/var/proto-8r3`), four tasks and the docs; `web.md`, "Reports at stops on the map (plan 8R-3)". Matt's scope (2026-10-22, as 8X-5): the server alone; the page gets no feature. No migration, no command change (no deploy), no party state change.
+
+- **Built:** `/research report` and `/rocket report` / `remove` as one code path each (`reportResearchAs`, `reportRocketAs`, `takeBackAs`, `stopsByKey`; their answers' words `researchWords` / `rocketWords` with the caller's channel namer; the commands' messages unchanged, inline snapshots guard them); `GET /api/stop-reports` (today's research of the period on, the waiting count, grunts, hideouts, as the member may see them; read anew per request, ETag, 304); `GET /api/research-options` and `/api/rocket-options`; `POST /api/research`, `POST /api/rocket` (the hideout question as a 422 with `asks.replacing`), `POST /api/stop-reports/<id>/remove`. `StopPostService.linkOf` (read only) and `GruntMessageService.messagesOfReports` (one read, `GruntMessageStorage.ofReports`) give the links. `PartyViewers` is now one for `/api/parties` and `/api/stop-reports` (made in `guildRoutes`).
+- **Differs from the brief's review (R4):** Leek Duck's pictures are already allowed: `cdn.leekduck.com` is the origin of `POKEMON_ICON_BASE` (`pictureOrigins`), so rewards, items, Mega Energy and catches keep the pictures the reports store, through `allowedPicture`; the CSP is unchanged and there is no question about it for Matt.
+- **Decided in the prototype (for the review):** a report shows unless every region it lies in is barred to the member (a region without a forum always shows it), so a stop in two regions shows if either is visible; a report in no region now shows to nobody; research links and hideout links fall back to the post's first message where the post does not hold the task (one counted as "…and N more"); a grunt's link is its message in a region the member sees; `mayTakeBack` is in the view (own or staff by the directory's standing; none while read-only) so a page can draw Take back without asking; staff for taking back on the map is `isMapStaff` (admins, moderators, the owner), as `/research remove`'s `isStaff`; the answers on the map leave out the command's heading ("### Field research reported"); "Already reported" on the map names the reporter by name ("a member" for none); the pick lists' `stale` flags (research by `settings.research.staleAfterHours`, the lineups by `settings.rocket.staleAfterHours`); the research view lists only the reports of the period on now and counts those waiting, as the post; reports and taking back share one limit of 30 a minute per address; the hideout question's 422 carries the hideout as the list shows it.
+- **For the web UX pass (the page's part of design 8, left out on purpose):**
+  - **The layer:** poll `GET …/api/stop-reports` as `/api/parties` is polled (`Poller`, every 20 s while visible, at once after a report or a take-back; 401/403 stop it), only for a member (`/api/me`), drawn when the JSON changed. `StopReportsView`: `research` (`MapResearch`: `id`, `stop { key, name, address, lat, lon }`, `task`, `text`, `category`, `typed`, `rewards`, `endsAt`, `reporter`, `mayTakeBack`, `link?`), `waiting` (`{ stops, at }`: "The day's research comes back at 5:00 PM (6 stops)"), `event`, `grunts` (`MapGrunt`: `who`, `name`, `catches`, …), `hideouts` (`MapHideout`: `who`, `name`, `catches`, `picture?`, …), `zone`. Research drawn with its first reward's `image`, hideouts with `picture`, grunts with a countdown to `endsAt` (and dropped at it without waiting for the poll); several reports at one stop (research and a Rocket report) as one marker with both in its popup. A colour for each (`theme.css`: `--research`, `--rocket`).
+  - **The popups:** the stop's name and address line, Directions; each report's words (task and rewards in short, "one of" where drawn; who and the catches), until when, the reporter, "Open on Discord" (`link`, only a `https://discord.com/channels/` address), and "Take back" where `mayTakeBack` (`POST …/api/stop-reports/<id>/remove`, empty body; 200 `ok`, 403 `NOT_YOUR_REPORT`, 409 `NOTHING_LEFT`, 429).
+  - **Reporting:** "Report research here" and "Report Rocket here" in a stop's popup and on a right-click (or long press) on a stop: the PokéStops come from `GET …/api/stops?south&west&north&east` (8M-5M; stops of Pine's own as `pine-<id>`), drawn from a zoom level up or in a "pick a stop" mode as the meetup form does. The research form over `GET …/api/research-options` (`tasks` with `key`, `text`, `category`, `rewards`; `stale`: say a missing task can be typed in full; `rewards` for a typed task's reward, or a Pokémon typed) and up to five stops (the one clicked, then "Same task at more stops…" as further stops picked on the map: a second report, no route of its own); `POST …/api/research` `{ task, reward?, stops }`: 200 `{ ok, text, research }`, 404 for a stop gone, 422 with words (`TASK_LIST_CHANGED`: ask the list again), 429. **The reward of a typed task is a free text field**, read by the server alone (`readReward`, as `/research`'s `reward:`): a value of `rewards` (`item:<key>`, `energy:<dex>`), `pokemon:<catalogue key>`, or text that names an item of the list, `<species> Mega Energy` of one or a Pokémon in full; anything else is a 422 in its words, `I do not know "…" as a reward. Did you mean A, B or C? Pick one from the list that appears while you type.` (up to five suggestions; the page shows the words as they are, and may offer `rewards` as you type). There is no list of Pokémon for it, none of research-only Pokémon either: any Pokémon the game data knows is taken by its name. The Rocket form over `GET …/api/rocket-options` (`choices` with `key`, `name`, `hideout`, `catches`, Giovanni's `note` shown beside him); `POST …/api/rocket` `{ who, stop, replacing? }`: 200 `{ ok, text, grunt | hideout }`; 409 "Already reported" with the standing `grunt` (open its popup); 422 with `asks.replacing`: **the hideout question as a confirm** ("Replace" sends the same report again with `replacing`; Cancel sends nothing); 503 (posted nowhere: try again); 429.
+  - **The filter:** by a reward or a catch (`MapReward.value`: `pokemon:<key>`, `item:<key>`, `energy:<dex>`, the values `/want` and `reward:` use) and by who (`who`: a grunt type, `leader:arlo`, `giovanni`, `decoy`), from the pick lists' names.
+- **For staging:** the routes from the browser's console (the page draws none of it yet), as 8X-5's checklist does; a grunt's link and a post's link after a restart (the post's link appears once `start` has drawn it).
+- **CLAUDE.md** (Matt or the controller): the status line of 8R-3; the area index line of `web.md` could name reports at stops.
````

