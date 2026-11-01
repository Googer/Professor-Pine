# Phase 8W-6: The Google Line as a Priority Queue with a Monthly Budget, Imports in Blocks: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the Google line ready for the cutover (before about 2026-11-11, when Pittsburgh's first import after the takeover adds about 2,600 gyms):

- **Task 1, the arithmetic:** `src/domain/geo/google-line.ts`, pure: Google's month (the 1st at midnight Pacific), what the line may ask under the monthly budget and the reserve, the daily share for PokéStops and Power Spots, region ranks per server, the line's order, `/gym google`'s estimate.
- **Task 2, storage, budget and ranks:** migration 031 (additive: `GymLookup.regionRank`, `WayspotLookup`, `WayspotPlaces`, `GoogleUseDay`, `GymGoogleAsked`); `googleLookupsPerMonth` 4,500, `googleLookupsReserve` 500, `googleGeocodesPerMonth` 9,000 in place of `googleLookupsPerDay`; every question counted by Pacific day and kind; gyms by the rank of their best region from 90 days of raids; a stuck item set aside until the next day; the timer capped at six hours; a gym asked once is not queued again at a restart.
- **Task 3, Wayspots in the line:** PokéStops and Power Spots (stops of Pine's own too) after every gym, paced by the day's share; their Google places kept apart from the import's writes and found by the search at weight 0.5.
- **Task 4, imports in blocks:** a first import's new gyms in blocks of 250, each one transaction with the nearest gyms computed once per block; a failed block added gym by gym; a log line per block.
- **Task 5, `/gym google`:** staff only, private: this server's waiting gyms and Wayspots, the month's use, the next reset, the estimate.
- **Task 6, the staging checklist.**

**Tech stack:** TypeScript 6.0, Node 24, discord.js v14, Kysely, Luxon and Vitest. No new dependency. **Migration 031** (first merge wins; checked free on every branch 2026-10-25). Settings changed (`googleLookupsPerDay` removed, three new). **A command option change** (`/gym google`): deploy the commands before staging.

**Spec:** `docs/superpowers/specs/2026-10-20-google-line-priority-design.md` (approved by Matt 2026-10-25), the brief `.superpowers/sdd/2026-10-25-phase-8w6-google-line/design.md` (git-ignored) and its `fix-list.md` and `progress.md` (rulings).

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto-8w6` (tip `88f98805`), one commit per task, on `wayfarer` 7b5c974a (= typescript-migration 06c705d5 plus the design marked approved). Each commit typechecks and passes its tests; on the tip the full check passes (9,807 tests), the build passes and the database suite passes (607 tests).

**Reviews:**

- **The prototype:** an Opus reviewer (high): ready after fixes: 1 Critical (a wait past Node's timer limit became a busy loop once the budget ran out early in a month), 3 Important (the back-off per item so a stuck gym cannot starve the stops; a gym Google found nothing for re-queued at every restart; the staging checklist), 7 Minor. The prototyper's claim that the one-by-one import added two Wayfarer gyms within 10 m of each other was verified (the block keeps it).
- **The fix rounds:** round 1 folded into the six commits; a scoped Opus re-review (ready after six Minor fixes: an answered stop billed again after a failed write, a gym moved during a failing turn put behind every gym, two staging steps, two test gaps, a per-gym copy on the fallback path); round 2 folded in, its diff read by the controller.

**Conventions:** read `CLAUDE.md` and `docs/architecture/gyms-and-regions.md`, `wayfarer.md`, `history.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck and its own test files. The full check, the build and the database suite run once on the tip. Work in `../Professor-Pine-wayfarer` on `wayfarer`; never commit in the main checkout.

## Review Focus

- The month's budget running out on the 1st–6th: the line waits (capped at six hours per timer) and never loops (task 2).
- A gym whose question always fails beside many stops: the stops go on; the gym is asked at most once a day (tasks 2, 3).
- A restart after Google found nothing for many gyms: none is asked again (task 2, `GymGoogleAsked`).
- A Wayfarer import of thousands of gyms: blocks of 250, the nearest gyms once per block, a bad gym failing alone (task 4).
- The Pacific month boundary across daylight saving, and the old `GymLookupDay` rows of the month counted (tasks 1, 2).

---

## Tasks

### Task 1: 8W-6 task 1: the Google line's arithmetic in the domain

Prototype commit: `afc3faf58ee11f9ace63357e823095b092aa2ea8`

src/domain/geo/google-line.ts, pure: the month as Google counts it (the 1st at midnight in
America/Los_Angeles, whatever settings.timezone is), what the line may ask under a monthly
budget (gyms the whole month above the reserve, PokéStops and Power Spots an even share a day,
addresses within their own budget), the rank of a region by its raids over 90 days as a part of
its own server's busiest region, a place's best region, the line's order (kind, rank, time
queued, key) and the estimate /gym google gives (the line simulated day by day).

Builder's choices:
- The rank is a region's raids divided by the busiest region's of its server (1 for each
  server's busiest), not its plain share of the server's raids: the design wants each server's
  busiest level with every other's, which a plain share does not give.
- A server without raids in 90 days has every region at 1 (level with each busiest region), so
  that an instance without history ranks every region the same and a new server is not starved.
- The day's share for stops and Power Spots counts every places question of the day (gyms and
  questions outside the line too) against what was left above the reserve when the day began.

**Files:**

```
 src/domain/geo/google-line.test.ts | 203 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/geo/google-line.ts      | 266 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 469 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/geo/google-line.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff afc3faf58ee11f9ace63357e823095b092aa2ea8 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-25-phase-8w6-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8W-6 task 1: the Google line's arithmetic in the domain`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/geo/google-line.test.ts b/src/domain/geo/google-line.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9b27fdfd4aea2d724b0da136669466cfd6c5c555
--- /dev/null
+++ b/src/domain/geo/google-line.test.ts
@@ -0,0 +1,203 @@
+import { describe, expect, it } from 'vitest';
+import {
+  bestRank,
+  estimateLine,
+  googleMonth,
+  lineAllowance,
+  lineOrder,
+  NO_REGION_RANK,
+  regionRanks,
+  type GoogleBudget,
+} from './google-line.js';
+
+/** A moment given in Pacific time (`2026-10-31T23:30`), as epoch milliseconds. */
+const pacific = (local: string, offset = '-07:00'): number =>
+  new Date(`${local}${offset}`).getTime();
+
+const BUDGET: GoogleBudget = { places: 4_500, reserve: 500, geocodes: 9_000 };
+const NONE = { monthPlaces: 0, todayPlaces: 0, monthGeocodes: 0 };
+
+describe('googleMonth', () => {
+  it('starts the month on the 1st at midnight Pacific time, whatever the zone of the bot', () => {
+    // 23:30 on the 31st in California is already November in New York and in UTC.
+    const month = googleMonth(pacific('2026-10-31T23:30'));
+    expect(month.today).toBe('2026-10-31');
+    expect(month.days).toHaveLength(31);
+    expect(month.days[0]).toBe('2026-10-01');
+    expect(month.daysLeft).toBe(1);
+    expect(month.nextReset).toBe(pacific('2026-11-01T00:00'));
+    expect(month.tomorrow).toBe(pacific('2026-11-01T00:00'));
+  });
+
+  it('counts the days left with today, and knows where daylight saving time ends', () => {
+    const month = googleMonth(pacific('2026-11-01T00:10'));
+    expect(month.today).toBe('2026-11-01');
+    expect(month.daysLeft).toBe(30);
+    // Daylight saving time ends on November 1: the next day begins 25 hours later.
+    expect(month.tomorrow - pacific('2026-11-01T00:00')).toBe(25 * 3_600_000);
+    expect(month.nextReset).toBe(pacific('2026-12-01T00:00', '-08:00'));
+  });
+});
+
+describe('lineAllowance', () => {
+  const now = pacific('2026-10-11T12:00');
+
+  it('lets gyms use the whole month above the reserve, and paces stops evenly over the days left', () => {
+    // 21 days left with today; 4,000 above the reserve: 190 a day for stops and power spots.
+    const fresh = lineAllowance(now, NONE, BUDGET);
+    expect(fresh).toMatchObject({ gyms: true, wayspots: true, geocode: true, share: 190 });
+    // Gyms used 3,000 today already: they go on, stops wait for tomorrow.
+    const busy = lineAllowance(
+      now,
+      { monthPlaces: 3_000, todayPlaces: 3_000, monthGeocodes: 0 },
+      BUDGET,
+    );
+    expect(busy).toMatchObject({ gyms: true, wayspots: false, share: 190 });
+    expect(busy.waitMs).toBe(pacific('2026-10-12T00:00') - now);
+  });
+
+  it('takes the share from what was left when the day began', () => {
+    // 2,000 used before today, 10 of it today: (4,000 − 1,990) ÷ 21 = 95 a day.
+    const allowance = lineAllowance(
+      now,
+      { monthPlaces: 2_000, todayPlaces: 10, monthGeocodes: 0 },
+      BUDGET,
+    );
+    expect(allowance).toMatchObject({ share: 95, wayspots: true });
+  });
+
+  it('stops the line when only the reserve is left, until the month resets', () => {
+    const allowance = lineAllowance(
+      now,
+      { monthPlaces: 4_000, todayPlaces: 0, monthGeocodes: 0 },
+      BUDGET,
+    );
+    expect(allowance).toMatchObject({ gyms: false, wayspots: false });
+    expect(allowance.waitMs).toBe(pacific('2026-11-01T00:00') - now);
+    // Questions outside the line went past the budget: the line still waits, it does not break.
+    const over = lineAllowance(
+      now,
+      { monthPlaces: 4_700, todayPlaces: 0, monthGeocodes: 0 },
+      BUDGET,
+    );
+    expect(over).toMatchObject({ gyms: false, wayspots: false, share: 0 });
+  });
+
+  it('stops asking addresses once the geocodes of the month are used', () => {
+    const allowance = lineAllowance(
+      now,
+      { monthPlaces: 0, todayPlaces: 0, monthGeocodes: 9_000 },
+      BUDGET,
+    );
+    expect(allowance).toMatchObject({ gyms: true, geocode: false });
+  });
+
+  it('asks nothing with a budget of nothing', () => {
+    const allowance = lineAllowance(now, NONE, { places: 0, reserve: 0, geocodes: 0 });
+    expect(allowance).toMatchObject({ gyms: false, wayspots: false, geocode: false });
+  });
+});
+
+describe('regionRanks', () => {
+  it('ranks each region by its share of its own server, so that each server’s busiest is level', () => {
+    const regions = [
+      { id: 1, guildId: 10 },
+      { id: 2, guildId: 10 },
+      { id: 3, guildId: 20 },
+      { id: 4, guildId: 20 },
+      { id: 5, guildId: null },
+    ];
+    const ranks = regionRanks(
+      regions,
+      new Map([
+        [1, 400],
+        [2, 100],
+        [3, 4],
+        [4, 2],
+        [5, 50],
+      ]),
+    );
+    expect(ranks.get(1)).toBe(1);
+    expect(ranks.get(3)).toBe(1);
+    expect(ranks.get(2)).toBe(0.25);
+    expect(ranks.get(4)).toBe(0.5);
+    // A region of no server is no region a place can rank by.
+    expect(ranks.has(5)).toBe(false);
+  });
+
+  it('ranks every region the same where there is no history', () => {
+    const ranks = regionRanks(
+      [
+        { id: 1, guildId: 10 },
+        { id: 2, guildId: 10 },
+        { id: 3, guildId: 20 },
+      ],
+      new Map(),
+    );
+    expect([...ranks.values()]).toEqual([1, 1, 1]);
+  });
+
+  it('gives a place its best region, and none in no region of any server', () => {
+    const ranks = new Map([
+      [1, 0.25],
+      [2, 0.75],
+    ]);
+    expect(bestRank([1, 2], ranks)).toBe(0.75);
+    expect(bestRank([], ranks)).toBe(NO_REGION_RANK);
+    expect(bestRank([9], ranks)).toBe(NO_REGION_RANK);
+  });
+});
+
+describe('lineOrder', () => {
+  it('orders by kind, then rank, then the time queued, then the key', () => {
+    const items = [
+      { kind: 'powerspot' as const, rank: 1, queuedAt: 1, key: 'p' },
+      { kind: 'stop' as const, rank: 0.5, queuedAt: 1, key: 's2' },
+      { kind: 'stop' as const, rank: 1, queuedAt: 9, key: 's1' },
+      { kind: 'gym' as const, rank: NO_REGION_RANK, queuedAt: 1, key: '3' },
+      { kind: 'gym' as const, rank: 0.2, queuedAt: 5, key: '2' },
+      { kind: 'gym' as const, rank: 0.2, queuedAt: 5, key: '1' },
+    ];
+    expect([...items].sort(lineOrder).map((item) => item.key)).toEqual([
+      '1',
+      '2',
+      '3',
+      's1',
+      's2',
+      'p',
+    ]);
+  });
+});
+
+describe('estimateLine', () => {
+  const now = pacific('2026-10-11T12:00');
+  const pace = { now, used: NONE, budget: BUDGET, everyMs: 5_000 };
+
+  it('finishes gyms within the day when the month allows, and stops at the pace of the share', () => {
+    // 2,000 gyms in 12 hours at one every five seconds (8,640 could go); then 190 stops a day,
+    // but the gyms took more than today's share: the stops start tomorrow, at (2,000 ÷ 20) = 100
+    // a day, so 200 are done on the 13th.
+    const estimate = estimateLine({ ...pace, gyms: 2_000, allGyms: 2_000, wayspots: 200 });
+    expect(estimate.gyms).toBe(now);
+    expect(estimate.all).toBe(pacific('2026-10-13T00:00'));
+  });
+
+  it('goes into the next months when this month is not enough', () => {
+    const estimate = estimateLine({ ...pace, gyms: 5_000, allGyms: 6_000, wayspots: 0 });
+    // 4,000 this month, then 1,000 on November 1.
+    expect(estimate.gyms).toBe(pacific('2026-11-01T00:00'));
+    expect(estimate.all).toBe(estimate.gyms);
+  });
+
+  it('names nothing for a server with nothing waiting, and gives up at a budget of nothing', () => {
+    expect(estimateLine({ ...pace, gyms: 0, allGyms: 10, wayspots: 0 })).toEqual({});
+    const never = estimateLine({
+      ...pace,
+      budget: { places: 0, reserve: 0, geocodes: 0 },
+      gyms: 1,
+      allGyms: 1,
+      wayspots: 0,
+    });
+    expect(never).toEqual({ gyms: 'beyond', all: 'beyond' });
+  });
+});
diff --git a/src/domain/geo/google-line.ts b/src/domain/geo/google-line.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7df74b8dba019e06315ff0db73f0f03af8302d67
--- /dev/null
+++ b/src/domain/geo/google-line.ts
@@ -0,0 +1,266 @@
+import { DateTime } from 'luxon';
+
+/**
+ * The arithmetic of the line that waits for Google (plan 8W-6; design
+ * `2026-10-20-google-line-priority-design.md`): the month Google's free amounts are counted in,
+ * what the line may ask now under a monthly budget, the rank of a place by its regions' raids,
+ * the order of the line, and when a server's part of it will be done. Pure.
+ */
+
+/** Google's free amounts reset on the 1st at midnight in California, whatever the bot's zone. */
+export const GOOGLE_ZONE = 'America/Los_Angeles';
+
+/** What waits in the line: a gym, a PokéStop or a Power Spot. */
+export type LineKind = 'gym' | 'stop' | 'powerspot';
+
+/** Kind first (Matt, 2026-10-20): gyms are caught up within weeks, then stops, then Power Spots. */
+const KIND_ORDER: Readonly<Record<LineKind, number>> = { gym: 0, stop: 1, powerspot: 2 };
+
+/** The rank of a gym in no region of any server: after every gym that is in one. */
+export const NO_REGION_RANK = -1;
+
+/** How far back the raids of a region count for its rank. */
+export const RANK_DAYS = 90;
+
+/** The month a moment is in, as Google counts it. */
+export interface GoogleMonth {
+  /** Every day of the month (`YYYY-MM-DD`, Pacific), the 1st first. */
+  days: string[];
+  /** The day of the moment. */
+  today: string;
+  /** The days left in the month, today included. */
+  daysLeft: number;
+  /** When the next day begins (epoch ms). */
+  tomorrow: number;
+  /** When the next month begins: the free amounts reset (epoch ms). */
+  nextReset: number;
+}
+
+export function googleMonth(now: number): GoogleMonth {
+  const moment = DateTime.fromMillis(now, { zone: GOOGLE_ZONE });
+  const first = moment.startOf('month');
+  const days: string[] = [];
+  for (let day = first; day.month === first.month; day = day.plus({ days: 1 })) {
+    days.push(day.toISODate() ?? '');
+  }
+  return {
+    days,
+    today: moment.toISODate() ?? '',
+    daysLeft: days.length - moment.day + 1,
+    tomorrow: moment.startOf('day').plus({ days: 1 }).toMillis(),
+    nextReset: first.plus({ months: 1 }).toMillis(),
+  };
+}
+
+/**
+ * The monthly budget (`settings.googleLookupsPerMonth`, `googleLookupsReserve`,
+ * `googleGeocodesPerMonth`): places questions a month, of which the line leaves `reserve` for the
+ * questions outside it, and geocodes a month.
+ */
+export interface GoogleBudget {
+  places: number;
+  reserve: number;
+  geocodes: number;
+}
+
+/** What was asked of Google this month: places questions (and of them today), geocodes. */
+export interface GoogleUsed {
+  monthPlaces: number;
+  todayPlaces: number;
+  monthGeocodes: number;
+}
+
+/** What the line may ask now. */
+export interface LineAllowance {
+  /** Gyms may be asked: something is left above the reserve. */
+  gyms: boolean;
+  /** PokéStops and Power Spots may be asked: as gyms, and today's share is not used yet. */
+  wayspots: boolean;
+  /** An address may be asked (the month's geocodes are not used). */
+  geocode: boolean;
+  /** Today's share of places questions, while stops and Power Spots are asked. */
+  share: number;
+  /**
+   * How long until the line may ask again what it may not ask now: until tomorrow while only the
+   * day's share is used, until the month resets while only the reserve is left.
+   */
+  waitMs: number;
+}
+
+/**
+ * What the line may ask at a moment. Gyms may use everything that is left above the reserve at
+ * once; stops and Power Spots are paced evenly: on a day at most what was left above the
+ * reserve when the day began, divided by the days left in the month with that day. Every places
+ * question of the day counts against that share (gyms and questions outside the line too).
+ */
+export function lineAllowance(now: number, used: GoogleUsed, budget: GoogleBudget): LineAllowance {
+  const month = googleMonth(now);
+  const above = budget.places - budget.reserve - used.monthPlaces;
+  const atDayStart = budget.places - budget.reserve - (used.monthPlaces - used.todayPlaces);
+  const share = Math.floor(Math.max(0, atDayStart) / month.daysLeft);
+  const gyms = above > 0;
+  return {
+    gyms,
+    wayspots: gyms && used.todayPlaces < share,
+    geocode: used.monthGeocodes < budget.geocodes,
+    share,
+    waitMs: (gyms ? month.tomorrow : month.nextReset) - now,
+  };
+}
+
+/** What the rank needs of a region: its row and its server's (null: the region of no server). */
+export interface RankedRegion {
+  id: number;
+  guildId: number | null;
+}
+
+/**
+ * The rank of each region of a server (Matt, 2026-10-20): its raids (max battles count as raids
+ * here) over the last `RANK_DAYS` days, as a part of the raids of the busiest region of its own
+ * server, so that each server's busiest region stands level with every other server's busiest
+ * and a quiet server is not starved. A server without raids has every region at 1, level with
+ * every busiest region: with no history at all, every region ranks the same. A region of no
+ * server has no rank.
+ */
+export function regionRanks(
+  regions: readonly RankedRegion[],
+  raids: ReadonlyMap<number, number>,
+): Map<number, number> {
+  const busiest = new Map<number, number>();
+  for (const region of regions) {
+    if (region.guildId === null) continue;
+    const count = raids.get(region.id) ?? 0;
+    busiest.set(region.guildId, Math.max(busiest.get(region.guildId) ?? 0, count));
+  }
+  const ranks = new Map<number, number>();
+  for (const region of regions) {
+    if (region.guildId === null) continue;
+    const top = busiest.get(region.guildId) ?? 0;
+    ranks.set(region.id, top === 0 ? 1 : (raids.get(region.id) ?? 0) / top);
+  }
+  return ranks;
+}
+
+/**
+ * The rank of a place in these regions: its best region's; `NO_REGION_RANK` for a place in no
+ * region of any server.
+ */
+export function bestRank(regionIds: Iterable<number>, ranks: ReadonlyMap<number, number>): number {
+  let best = NO_REGION_RANK;
+  for (const id of regionIds) {
+    const rank = ranks.get(id);
+    if (rank !== undefined && rank > best) best = rank;
+  }
+  return best;
+}
+
+/** A place in the line, as its order needs it. */
+export interface LinePlace {
+  kind: LineKind;
+  rank: number;
+  queuedAt: number;
+  /** The gym's number or the Wayspot's id, as text: the last tie-break. */
+  key: string;
+}
+
+/** The order of the line: kind, then rank (higher first), then the time queued, then the key. */
+export function lineOrder(a: LinePlace, b: LinePlace): number {
+  return (
+    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
+    b.rank - a.rank ||
+    a.queuedAt - b.queuedAt ||
+    compareKeys(a.key, b.key)
+  );
+}
+
+/** Gyms' numbers by number, other keys as text. */
+function compareKeys(a: string, b: string): number {
+  const numbers = /^\d+$/.test(a) && /^\d+$/.test(b);
+  return numbers ? Number(a) - Number(b) : a < b ? -1 : a > b ? 1 : 0;
+}
+
+/** How far ahead `estimateLine` looks before it says "beyond". */
+const ESTIMATE_DAYS = 3 * 366;
+
+/** What `estimateLine` works from. */
+export interface LineEstimateInput {
+  now: number;
+  used: GoogleUsed;
+  budget: GoogleBudget;
+  /** The pace of the line: one question every so often. */
+  everyMs: number;
+  /** The gyms of the line up to and with this server's last, in the line's order (0: none of it). */
+  gyms: number;
+  /** Every gym of the line. */
+  allGyms: number;
+  /** The stops and Power Spots up to and with this server's last, in the line's order (0: none). */
+  wayspots: number;
+}
+
+/**
+ * When something will be done: the moment (now for today, else the start of that Pacific day),
+ * or `beyond` when not within three years at this budget.
+ */
+export type EstimatedDay = number | 'beyond';
+
+/**
+ * When a server's last gym of the line (`gyms`) and its last item of any kind (`all`) will be
+ * asked about, at the current pace: the line simulated day by day in its order against what is
+ * left of this month above the reserve and the next months' budgets, gyms at the line's pace,
+ * stops and Power Spots at the day's share (`lineAllowance`). Each item is one places question;
+ * what is added later is not foreseen. A part with nothing waiting is left out.
+ */
+export function estimateLine(input: LineEstimateInput): {
+  gyms?: EstimatedDay;
+  all?: EstimatedDay;
+} {
+  const { now, budget, everyMs } = input;
+  const result: { gyms?: EstimatedDay; all?: EstimatedDay } = {};
+  if (input.gyms === 0 && input.wayspots === 0) return result;
+  const wantAll = input.wayspots > 0 ? input.allGyms + input.wayspots : input.gyms;
+  let monthUsed = input.used.monthPlaces;
+  let todayUsed = input.used.todayPlaces;
+  let done = 0;
+  let day = DateTime.fromMillis(now, { zone: GOOGLE_ZONE });
+  let monthOf = day.month;
+  for (let index = 0; index < ESTIMATE_DAYS; index++) {
+    if (index > 0) {
+      day = day.startOf('day').plus({ days: 1 });
+      todayUsed = 0;
+      if (day.month !== monthOf) {
+        monthOf = day.month;
+        monthUsed = 0;
+      }
+    }
+    const at = index === 0 ? now : day.toMillis();
+    const end = day.startOf('day').plus({ days: 1 }).toMillis();
+    let room = Math.floor((end - at) / Math.max(1, everyMs));
+    let monthLeft = Math.max(0, budget.places - budget.reserve - monthUsed);
+    const daysLeft = day.daysInMonth! - day.day + 1;
+    const share = Math.floor(
+      Math.max(0, budget.places - budget.reserve - (monthUsed - todayUsed)) / daysLeft,
+    );
+    // Gyms first, as fast as the line goes and the month allows.
+    const gyms = Math.max(0, Math.min(input.allGyms - done, monthLeft, room));
+    done += gyms;
+    room -= gyms;
+    monthLeft -= gyms;
+    monthUsed += gyms;
+    todayUsed += gyms;
+    // Then stops and Power Spots, within the day's share.
+    if (done >= input.allGyms) {
+      const spots = Math.max(0, Math.min(wantAll - done, share - todayUsed, monthLeft, room));
+      done += spots;
+      monthUsed += spots;
+      todayUsed += spots;
+    }
+    if (input.gyms > 0 && result.gyms === undefined && done >= input.gyms) result.gyms = at;
+    if (done >= wantAll) {
+      result.all = at;
+      return result;
+    }
+  }
+  if (input.gyms > 0 && result.gyms === undefined) result.gyms = 'beyond';
+  result.all = 'beyond';
+  return result;
+}
````

### Task 2: 8W-6 task 2: the line's storage, the monthly budget and the region ranks

Prototype commit: `3efa51b6212be24318891e6a58086ffb998f4b53`

Migration 031 (additive): GymLookup.regionRank with an index for the line's order,
WayspotLookup (the PokéStops and Power Spots that wait, used in task 3; its index
(kind desc, regionRank desc, queuedAt, wayspotId) serves the query's order), WayspotPlaces
(their places, apart from the Wayfarer import's writes), GymGoogleAsked (one row per gym whose
places Google answered at the place it is now, whatever it found; deleted when the gym moves,
and with the gym) and GoogleUseDay (questions per Pacific day and kind; GymLookupDay stays
readable, its rows of the month read as places questions). Repositories and twins with shared
cases: GymLookupRepository (rank, list, setRanks, next with placesOnly and except, asked,
markAsked, forgetAsked), WayspotLookupRepository (next with except), GoogleUseRepository
(googleUseCases in test/support/google-use-cases.ts); HistoryRepository.raidsByRegion. The
twins in memory order their lines by the domain's lineOrder; the SQL is the one other copy, held
to it by the shared cases.

settings: googleLookupsPerDay removed (refused as any unknown key); googleLookupsPerMonth 4,500,
googleLookupsReserve 500, googleGeocodesPerMonth 9,000, each at least 0, the reserve below the
budget (settingsObject, refined into settingsSchema).

GymUpkeep: the line within the month's budget (lineAllowance): gyms until only the reserve is
left, then wait for the reset; every question that reaches Google counts by its kind, by hand
too, which may use the reserve and go past the budget; no address asked once the month's
geocodes are used, gyms for their places alone go on. Gyms by the rank of their best region
(GoogleRanks over the party history, read at start and at the line's first turn of each
Pacific day, the line ranked anew then). resume() now runs after the regions and Wayspots load,
and puts in the line only the gyms without places that were never asked where they are
(GymGoogleAsked; a gym of before with places counts as asked), so that a gym Google found
nothing for is not asked again at every start. The line never sets a timer longer than six
hours (MAX_TIMER_MS): Node fires a timer beyond 2^31 - 1 ms at once, which would ask the
database in a busy loop for the days until the month resets; a longer wait is a turn every six
hours that finds nothing to ask.

Builder's choices:
- Schema: the gyms keep their table (GymLookup with a rank column); the Wayspots get a second
  table (WayspotLookup): kind comes first in the order, so the line takes gyms, then Wayspots.
- The rank is held as a column on the line's rows, set at queueing and refreshed daily (one
  statement per rank value), not computed in the next() query: it needs region geometry.
- The column is regionRank (RANK is a reserved word in MySQL 8).
- A budget of 0 with a reserve of 0 is allowed (the line stopped), beside "reserve below
  budget".
- Found while building: with the whole month allowed at once, a gym whose question keeps
  failing (or whose address Google never gives) would be asked every few seconds until the
  month's budget is gone (the daily cap bounded it before). Such a gym is now set aside until
  the next Pacific day (asideGyms, in memory, cleared by the daily rerank; next({ except })
  passes over it), so that the line goes on with the others and a stuck gym is asked at most
  once a day; its row waits after every other gym (RETRY_RANK) until the line is ranked anew.
  The line also waits twice as long after each failing turn in a row, up to an hour (a turn that
  answers resets it), for a Google that fails altogether. A gym moved during a failing turn is
  neither set aside nor put behind: its row stays as the move queued it, and asks for the
  address that did not come too.
- A move deletes the gym's GymGoogleAsked row (its new place was never asked) rather than
  keeping the asked point; a failed write of the row is logged, never thrown.

**Files:**

```
 docs/architecture/gyms-and-regions.md                |   4 +-
 docs/architecture/history.md                         |   1 +
 docs/architecture/wayfarer.md                        |   2 +-
 docs/guides/new-instance.md                          |   2 +-
 src/app.ts                                           |  22 +++++++--
 src/config/settings.test.ts                          |  37 +++++++++++++++
 src/config/settings.ts                               |  31 ++++++++----
 src/db/migrations/2026_10_25_031_google_line.ts      |  86 +++++++++++++++++++++++++++++++++
 src/db/migrations/index.ts                           |   2 +
 src/db/migrator.db.test.ts                           |   5 ++
 src/db/repositories/google-line.db.test.ts           |  88 ++++++++++++++++++++++++++++++++++
 src/db/repositories/google-use-repository.ts         |  45 ++++++++++++++++++
 src/db/repositories/gym-lookup-repository.db.test.ts |  10 ++--
 src/db/repositories/gym-lookup-repository.ts         | 101 +++++++++++++++++++++++++++++++--------
 src/db/repositories/history-repository.ts            |  19 ++++++++
 src/db/repositories/wayspot-lookup-repository.ts     | 123 +++++++++++++++++++++++++++++++++++++++++++++++
 src/db/table-names.ts                                |   4 ++
 src/db/types.ts                                      |  32 +++++++++++++
 src/services/google-ranks.test.ts                    |  70 +++++++++++++++++++++++++++
 src/services/google-ranks.ts                         |  65 +++++++++++++++++++++++++
 src/services/google-use.test.ts                      |  31 ++++++++++++
 src/services/google-use.ts                           |  80 +++++++++++++++++++++++++++++++
 src/services/gym-lookups.ts                          | 124 ++++++++++++++++++++++++++++++++++++------------
 src/services/gym-upkeep.test.ts                      | 362 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--------------------
 src/services/gym-upkeep.ts                           | 279 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------------------------
 src/services/wayspot-lookups.test.ts                 |   7 +++
 src/services/wayspot-lookups.ts                      | 109 ++++++++++++++++++++++++++++++++++++++++++
 test/support/google-use-cases.ts                     |  29 ++++++++++++
 test/support/gym-lookup-cases.ts                     |  84 +++++++++++++++++++++++++--------
 test/support/wayspot-lookup-cases.ts                 |  91 +++++++++++++++++++++++++++++++++++
 30 files changed, 1733 insertions(+), 212 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/config/settings.test.ts src/services/google-ranks.test.ts src/services/google-use.test.ts src/services/gym-upkeep.test.ts src/services/wayspot-lookups.test.ts`, `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/google-line.db.test.ts src/db/repositories/gym-lookup-repository.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3efa51b6212be24318891e6a58086ffb998f4b53 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-25-phase-8w6-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8W-6 task 2: the line's storage, the monthly budget and the region ranks`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/gyms-and-regions.md b/docs/architecture/gyms-and-regions.md
index 29263542392aee6710c1f582ecfbcc18dd834393..7213b12a03d72c10515e1571c2fdc3541ade4fbd 100644
--- a/docs/architecture/gyms-and-regions.md
+++ b/docs/architecture/gyms-and-regions.md
@@ -19,7 +19,9 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 - A deletion is refused while an active raid is at the gym. Otherwise: one transaction for the saved routes, the gym targets and the row (`GymRemovalRepository`), then `GymDirectory.forget(id)`, then the gym is taken off the route of every active train (best effort; a train that could not be changed is named in the answer), then the announcement. Nothing visible happens before the gym is really gone. From `forget` on, whatever picks the gym late (a report, `/location`, a relocation, a train's `addStop`, a loaded route) is refused with the reason `gym-gone`; `PartyStore.addRaidUnlessTaken` asks `gymExists` under the gym's lock. The hourly upkeep takes stops the directory does not know off active trains (`TrainService.removeUnknownStops`; never against an empty directory). Lock order: the admin lock, then a gym's lock, then a party's.
 - No server's staff administer another server's gyms: `withinReach` (`src/domain/gyms/gym-server.ts`; `mayTouch`, `mayPlace` of the service) allows a gym or a place that lies in a region of the own server (also where regions of two servers overlap) or in no region of any server. A gym out of reach is neither offered nor accepted, as if it did not exist; a place out of reach is refused for `add` and `move`. Decided by the regions' rows, at the command and again under the lock.
 - A location staff give is read by `readLocation` (`src/domain/geo/location-input.ts`, pure): coordinates, or a maps link. The link Pokémon GO shares for a gym ("View in map") is the main way and reads as an exact point; a Google Maps pin wins over where the map is centred; a route is read by where it ends; a place read only from a map's centre is `approximate`, and the question says so. A short link is followed by `GeoGateway.followShortLink`: `https`, the Maps short-link hosts and Google's own only, five hops, five seconds, no body read. A new shape of link gets a test before it is read.
-- What Google knows of a place is behind `GeoGateway` (`src/services/geo-gateway.ts`; `GoogleGeo` calls the Geocoding API and Places API (New) with `fetch`, the key in the address of the one and a header of the other): each call answers a value, `none`, `no-key`, `denied` (remembered for an hour) or `failed`, never throws and never logs an address. In the upkeep's line of lookups (`GymUpkeep`) a refused geocode holds back only the gyms that want an address: the refused gym stays first and is asked no Places, the line goes on with the gyms that want their places alone (`GymLookups.next({ placesOnly })`), and it waits out the refusal only when every gym left wants an address. The address parts also hold the address as Google writes it (`FORMATTED_ADDRESS`), which the search does not read and `addressLine` shows (`/gym show`); a row without it gets a line made of its parts. `GymUpkeep` (`gym-upkeep.ts`) keeps a gym's address parts, nearby places and nearest gym: the nearest gyms of the gyms concerned only (`nearestGymChanges`), the places of gyms whose nearest gym changed in a slow queue, a generation per gym so that a stale answer is never written. Without a key a gym is saved all the same. Tests use `FakeGeo` (`test/support/geo.ts`), `MemoryGyms` and `gymDirectoryWith` (`test/support/gym-store.ts`), `MemoryGymRemoval` and the service of `test/support/gym-admin.ts`; `partyServiceWith` gives all its services one gym list.
+- What Google knows of a place is behind `GeoGateway` (`src/services/geo-gateway.ts`; `GoogleGeo` calls the Geocoding API and Places API (New) with `fetch`, the key in the address of the one and a header of the other): each call answers a value, `none`, `no-key`, `denied` (remembered for an hour) or `failed`, never throws and never logs an address. In the upkeep's line of lookups (`GymUpkeep`) a refused geocode holds back only the gyms that want an address: the refused gym stays first and is asked no Places, the line goes on with the gyms that want their places alone (`GymLookups.next({ placesOnly })`), and it waits out the refusal only when every gym left wants an address. The address parts also hold the address as Google writes it (`FORMATTED_ADDRESS`), which the search does not read and `addressLine` shows (`/gym show`); a row without it gets a line made of its parts. `GymUpkeep` (`gym-upkeep.ts`) keeps a gym's address parts, nearby places and nearest gym: the nearest gyms of the gyms concerned only (`nearestGymChanges`), the places of gyms whose nearest gym changed in a slow queue, a generation per gym so that a stale answer is never written. Without a key a gym is saved all the same.
+- The line that waits for Google is a priority queue with a monthly budget (plan 8W-6; design `2026-10-20-google-line-priority-design.md`). The arithmetic is pure (`src/domain/geo/google-line.ts`): the month as Google counts it (`googleMonth`, the 1st at midnight in `America/Los_Angeles`, `GOOGLE_ZONE`, whatever `settings.timezone` is), `lineAllowance` (gyms may use the whole month above the reserve; the line stops when only `settings.googleLookupsReserve` of `googleLookupsPerMonth` is left, until the month resets; addresses within `googleGeocodesPerMonth`), `regionRanks` and `bestRank` (a region's raids and max battles over `RANK_DAYS` 90 from the party history, `HistoryRepository.raidsByRegion`, divided by its server's busiest region's: each server's busiest is 1; a server without raids has every region at 1; a region of no server has no rank; a gym in no region of any server is `NO_REGION_RANK`, last), `lineOrder`, and `estimateLine` (below, `/gym google`). `GoogleRanks` (`src/services/google-ranks.ts`) reads the raids at start and at the line's first turn of each Pacific day (`GymUpkeep.rerank`, which ranks the line anew), never per question. Every question that reaches Google counts (a failure too; `denied` and `no-key` do not), in the line or not (a gym added or moved by hand, `/gym refresh`), each by its kind on its Pacific day (`GoogleUse`: `GoogleUseRepository`, table `GoogleUseDay` of migration 031, the old `GymLookupDay` of the current month read as places questions; twin `MemoryGoogleUse`; both run `googleUseCases`; `usedThisMonth`); a question by hand may use the reserve and go past the budget, since an admin asked. While Geocoding is refused or its budget used, the gyms that wait for an address wait (until the refusal ends or the month resets) and the gyms for their places alone go on. A gym asked again for what did not come (a failure, an address Google did not give) is set aside until the next Pacific day (`asideGyms`, cleared by `rerank`; `GymLookups.next({ except })` passes over it, so one gym that keeps failing holds up neither the others nor the budget; put in the line anew, moved, it is asked again), its row after every other gym (`RETRY_RANK`) until the line is ranked anew, and the line waits twice as long after each such turn in a row (up to an hour; a turn that answers resets it), so that a Google that keeps failing does not take the month's budget a few seconds at a time. The line never sets a timer longer than `MAX_TIMER_MS` (six hours: Node fires a timer beyond 2^31 − 1 ms at once): a longer wait, until the month resets, is a turn every six hours that finds nothing to ask. A gym whose places Google answered is noted (`GymLookups.markAsked`, table `GymGoogleAsked` of migration 031, whatever Google found; forgotten when the gym moves, and with the gym), so that `resume` puts in the line at a start only the gyms without places that were never asked where they are (a gym Google found nothing for has neither address nor places, as one never asked); a gym of before with places counts as asked. The twins in memory order their lines by `lineOrder`; the repositories' SQL is its one other copy, held to it by the shared cases. `googleLookupsPerDay` of before is gone (a settings file that still names it is refused, as any unknown key).
+- Tests use `FakeGeo` (`test/support/geo.ts`), `MemoryGyms` and `gymDirectoryWith` (`test/support/gym-store.ts`), `MemoryGymRemoval` and the service of `test/support/gym-admin.ts`; `partyServiceWith` gives all its services one gym list.
 - The texts of a gym are tidied and checked by `src/domain/gyms/gym-text.ts`: name and nickname must fit `varchar(255)` once entity-encoded (the encoder is passed in; the domain does not import `he`), control and direction characters are stripped (ZWNJ, ZWJ and the flag tag characters stay), keywords are lower case and unique. `/gym edit` writes only the fields that differ from what its form showed (`gymFormTexts`, `changedGymTexts`); a text too long for the form is left out of it, never cut. A gym is named beside its number by `gymWithId` (`src/render/gym-view.ts`), which cuts before it escapes and falls back to "Gym" for a name that shows as nothing.
 - The `gym` option of `/gym` (`src/commands/gyms/gym-option.ts`: `respondWithGyms`, `chosenGym`) is free text with autocomplete; a choice's value is `id:<n>`. Typed: `#123` and `id:123` are always ids; bare digits are an id unless no gym has it (a text search then) or another gym is called by those digits (refused, both listed); other text acts only on a clear hit (`clearGymHit`, shared with `/raid`). The questions and forms of `/gym` keep their state in `pendingGyms` (a `PendingRequests` of six hours) under the token of their custom ids, `gym:<token>:<action>`; a token that was answered is remembered, so a second press is only acknowledged; a refused form keeps what was typed behind "Open the form again".
 - A gym is an elite raid gym when either stored flag is set (`isEliteGym`, `src/domain/party/raid.ts`): the game renamed EX gyms, and everything staff see says "elite raid gym". Members are not told (plan 8D, Matt, 2026-10-17: it mattered for EX raids, not now): no post, train route, `/route show`, `/find-gym` view or `/targets` list marks it; staff's `/gym show`, `/gym elite`, `/region list`'s count, the `#elite-gym-raids` copies with their lead line and the `Elite` forum tag (the raid tier) keep it. The columns `taggedEx` / `confirmedEx`, the mirror kind `ex` and `features.exGymChannel` keep their names; only the channel setting was renamed. Never decide on one flag alone.
diff --git a/docs/architecture/history.md b/docs/architecture/history.md
index e766fc04fbe7450df164b208ab85f890abf26b59..82f33a4ff5cf726bff1df5282e338a1758d56037 100644
--- a/docs/architecture/history.md
+++ b/docs/architecture/history.md
@@ -15,6 +15,7 @@ Every party that ends is kept in relational tables beside the live `Party` table
 - `EndedPartyPost`: the post and forum of a party whose `Party` row was deleted once its record was written, for what still reads them (below): no member, no party id. Its rows are kept for good, as the ended `Party` rows were before: the post can be reopened by a late message any time.
 - Text a member wrote (a train's or meetup's name, a meetup's description, a group's label) is kept with every member it names written `@member` (`withoutMembers`, `src/domain/history/party-history.ts`; mentions and bare ids of 17 to 20 digits, an emoji's tag stays), live and legacy alike.
 - `createdById` of a raid whose reporter asked not to be named in the post (`anonymous`) is kept all the same when the reporter opted in to the history: a statistic shown to others later must honour `anonymous`.
+- What else reads the history: `HistoryRepository.raidsByRegion(since)` (plan 8W-6) counts each region's raids and max battles (`kind` `raid` or `max`, by `regionId`, `createdAt` from `since`), the rank of a region in the line that waits for Google (`gyms-and-regions.md`); live and legacy records alike.
 
 How a party ended (`ending`): `completed` whenever it took place (somebody completed the raid, or was at the train or meetup), however it was closed; otherwise `expired` (the clock), `cancelled` (`/delete`, its region removed, its post deleted by hand), `cutover` (a legacy party still going on at the cutover), `unknown` (nobody said: a legacy raid nobody completed, whose files do not say whether it ran out or was deleted; a party the sweep recorded, which runs at start and hourly).
 
diff --git a/docs/architecture/wayfarer.md b/docs/architecture/wayfarer.md
index d095bdbe5f3da8130c0dc1547023196286a8299c..73f930f0d43f19c7fd7b8ab4e78114a402837302 100644
--- a/docs/architecture/wayfarer.md
+++ b/docs/architecture/wayfarer.md
@@ -20,7 +20,7 @@ The true list of gyms from Wayfarer: the export file and its parts, S2 cells and
 - The import is `ctx.wayfarer` (`WayfarerImportService`, `src/services/wayfarer-import-service.ts`): `preview(staff, file)` plans and writes nothing; `apply(staff, file)` plans again inside `GymAdminService.batch` against the gyms as they are then and writes that plan, each gym's write decided before any of it is written (`mayPlace` first: a match that would move a gym where the server may not put it is held and asked about); each match is one row write (a move takes the other fields as its `patch`: a move refused when the regions changed meanwhile writes nothing, and the summary counts a rename only with its move); a write that fails is counted and logged, and the import goes on; a move over `REFETCH_METRES` 25 takes the Wayspot's address and has its places fetched again, in `GymUpkeep`'s line (`placed(id, { places: 'later', address })`; its address too when the Wayspot's names no street); the outcome says what was not recorded (`Unrecorded`). It considers the gyms this server may touch (`mayTouch`) that lie in its regions, and gyms in no region of any server that lie within 100 m of one of its outlines (`nearRing`, `region-membership.ts`) or in a covered cell; Wayspots outside the regions count only near those gyms. The count `outside` (preview and outcome: "N Wayfarer gyms lie just outside every region of this server: your outlines may leave them out") is `plan.outsideGyms`, measured by `metresFromRing` (`region-membership.ts`, beside `grownBox`) against the server's outlines within `file.margin` (none for a file without a margin); the `ignored` Wayspots may include them. `GymAdminService.batch(place, source, work)` runs `work(ops)` under the admin lock with `GymBatch` (`add`, `move` with an optional `patch`, `update` of `BatchPatch`, `remove`), none of which takes the lock or announces: what it changed is announced in one summary at the end, also when `work` failed (`source` decides when it is posted: gathered for the review, at once otherwise; the summary names no source, Matt, 2026-10-16); work that asks for the lock from inside never finishes. `delete(id, by, place, onlyIf)` asks `onlyIf` under the lock first and answers `withdrawn` when it no longer holds.
 - `/gym import` (`src/commands/gyms/import.ts`) previews in a v2 message (counts in sentences, by region, the stops of Pine's own within 30 m of an imported stop named for staff to remove, plan 8R-1 `pineStopsNear`, `wayfarer-import.csv` as a file component, Import / Cancel) and keeps the parsed export in its own `pendingImports` (`MAX_PENDING_IMPORTS` 3, `IMPORT_PENDING_MINUTES` 30) under the token of `gym:<token>:wayfarer-import|wayfarer-cancel`, only what Import reads of it (`forImport`: no descriptions, no status; plan 8W-3); an export that would change nothing gets no Import (`changesNothing`; an item counts as queued already, `queuedAlready`, only when an open item asks the same kind about the same set of candidate ids; a preview that could not read the kept Wayspots may change them: it offers Import and says why it cannot tell, `KEPT_UNREAD`). The sentences of the preview, the outcome and the question are cut by `sentencesText` (`cutMarkdown`: never inside a mention, a code span or bold). Import replaces the preview with "Importing…", then the outcome, or a failure line when `apply` throws; when that edit fails (an import may outlast the interaction) the outcome is logged.
 - The scanned area of an export is its own outlines grown by its margin, never the server's regions of the day (`src/domain/wayspots/scanned-area.ts`): the preview says where they differ (`compareOutlines`: regions not as scanned, areas that are no region now) and lists the gyms this server may touch that lie in no region of any server beyond the area (`gymsBeyond`, `WayfarerImportService.outsideArea`, the report's `beyond`). After an import of a finished scan with a margin (`mayDeleteOutside`: every cell of the area received, `scanFinished`) whose outlines are every region of the server as it is now (while `compareOutlines` names a region not scanned, `outsideArea` gives nothing and the preview says why), the outcome offers "Delete N gyms outside the area…" (`gym:<token>:outside-ask`, then `outside-delete` / `outside-keep` of a private question naming the first `OUTSIDE_NAMED` and what goes with them; the area alone is kept in `pendingOutside`, the question under `questionToken` of the outcome's token, so that asking again replaces it and presses do not crowd the store; it names each gym's metres from the nearest outline, as the report's `beyond` lines do): the list is worked out again at each press (the question and the deletion, under the lock, refuse with nothing deleted when a region was added or changed since: `OutsideDeletion.regionsNotScanned`), each gym deleted through `GymBatch.remove` (gym administration's deletion under the batch's lock; an active raid keeps its gym, named), one summary at the end (`deleteOutside`).
-- An imported gym takes the Wayspot's address (`wayfarerGeodata`, `src/domain/geo/wayfarer-address.ts`: Wayfarer's address read as Google's address parts, a plus code dropped, null without a street), as does a matched gym without an address or moved beyond `REFETCH_METRES`; Google is then asked for its places only (`GymUpkeep.placed(id, { places: 'later', address: false })`, `GymBatch.move(…, { address })`). What waits for Google is a line in the database (`GymLookups`: `GymLookupRepository`, tables `GymLookup` and `GymLookupDay` of migration 014; twin `MemoryGymLookups`; both run `gymLookupCases`): at most `settings.googleLookupsPerDay` gyms a day (default 100, counted in `settings.timezone`), one every few seconds, one at a time (a gym stays in the line while it is asked about, and one put in it again before its turn is written down keeps its row), a gym counted when either of its questions reached Google (not one gone before the first), and one whose geocode did not answer kept waiting for its address (to the end of the line); while Geocoding is refused (`denied`) a gym that waits for its address asks no Places (each is billed) and keeps its place in the line, and the line goes on with the gyms that wait for their places alone (`GymLookups.next({ placesOnly })`), waiting out the refusal only when every gym left waits for its address, and in either refused path an address asked for again during the turn keeps waiting (plan 8W-3); its upsert uses MySQL's row alias (`INSERT … AS new`), never `VALUES()`, deprecated since 8.0.20, as do the Wayfarer tables' (`lastWarnings` in their database tests); taken up at start (`resume`); a gym added or moved by hand is still asked about at once and is not counted.
+- An imported gym takes the Wayspot's address (`wayfarerGeodata`, `src/domain/geo/wayfarer-address.ts`: Wayfarer's address read as Google's address parts, a plus code dropped, null without a street), as does a matched gym without an address or moved beyond `REFETCH_METRES`; Google is then asked for its places only (`GymUpkeep.placed(id, { places: 'later', address: false })`, `GymBatch.move(…, { address })`). What waits for Google is a line in the database (`GymLookups`: `GymLookupRepository`, table `GymLookup` of migration 014 with its `regionRank` of migration 031; twin `MemoryGymLookups`; both run `gymLookupCases`; plan 8W-6, `gyms-and-regions.md` for the budget and the ranks): gyms by the rank of their best region, then by the time queued, one every few seconds, one at a time (a gym stays in the line while it is asked about, and one put in it again before its turn is written down keeps its row), each question counted by itself when it reached Google, and one whose geocode did not answer kept waiting for its address (to the end of the line); while Geocoding is refused (`denied`) a gym that waits for its address asks no Places (each is billed) and keeps its place in the line, and the line goes on with the gyms that wait for their places alone (`GymLookups.next({ placesOnly })`), waiting out the refusal only when every gym left waits for its address, and in either refused path an address asked for again during the turn keeps waiting (plan 8W-3); its upsert uses MySQL's row alias (`INSERT … AS new`), never `VALUES()`, deprecated since 8.0.20, as do the Wayfarer tables' (`lastWarnings` in their database tests); taken up at start (`resume`); a gym added or moved by hand is still asked about at once, and counted.
 
 ## The kept Wayspots
 
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index e4c2709e135d6e674060799c47ef09063814015a..55d853b5f00c51616f9c483094a43d9588ef32c0 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -122,7 +122,7 @@ The settings that matter first:
 - `roles.unown`: the name of an Unown role the server had before Pine: its holders are given a want for Unown. Leave it as it is if you have none.
 - `raidEvents.weeklyRaidHour`: the weekly Raid Hour, in your time zone.
 
-The rest has working defaults (`lobbies`, for example, is how many trainers one lobby of a raid, a Dynamax battle and a Gigantamax battle holds: 20, 4 and 100, as in the game; `raid` only sets when a group of a raid or a train is told to split up, since members choose their own groups there, and Join fills groups by `dynamax` and `gigantamax` only in max battles and Gigantamax trains, the trains still to come). Max battles are always on and need no block: `maxBattles` only changes their defaults (the max bosses are read from Pokebattler's `https://fight.pokebattler.com/raids`, `url`, every 6 hours, `refreshMinutes`; `firstBattle` and `lastBattle` are the hours max battles can be fought, 06:00 and 21:00 unless set). Field research is always on too: `research` only changes its defaults (the task list is read from Leek Duck's `https://leekduck.com/research/`, `url`, every hour, `refreshHours`, and said to be out of date in the log after 6 hours without a good read, `staleAfterHours`; `throttle` is how many reports a member may make in how many minutes, 10 in 30). Team GO Rocket is always on as well: `rocket` only changes its defaults (the lineups are read from ScrapedDuck's `https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/rocketLineups.min.json`, `url`, every 6 hours, `refreshHours`, out of date after 24, `staleAfterHours`; a grunt's message stands 30 minutes, `gruntMinutes`; `throttle`, 10 reports in 30 minutes). The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). After an edit while the bot runs, `./pine restart`.
+The rest has working defaults (`lobbies`, for example, is how many trainers one lobby of a raid, a Dynamax battle and a Gigantamax battle holds: 20, 4 and 100, as in the game; `raid` only sets when a group of a raid or a train is told to split up, since members choose their own groups there, and Join fills groups by `dynamax` and `gigantamax` only in max battles and Gigantamax trains, the trains still to come). Max battles are always on and need no block: `maxBattles` only changes their defaults (the max bosses are read from Pokebattler's `https://fight.pokebattler.com/raids`, `url`, every 6 hours, `refreshMinutes`; `firstBattle` and `lastBattle` are the hours max battles can be fought, 06:00 and 21:00 unless set). Field research is always on too: `research` only changes its defaults (the task list is read from Leek Duck's `https://leekduck.com/research/`, `url`, every hour, `refreshHours`, and said to be out of date in the log after 6 hours without a good read, `staleAfterHours`; `throttle` is how many reports a member may make in how many minutes, 10 in 30). Team GO Rocket is always on as well: `rocket` only changes its defaults (the lineups are read from ScrapedDuck's `https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/rocketLineups.min.json`, `url`, every 6 hours, `refreshHours`, out of date after 24, `staleAfterHours`; a grunt's message stands 30 minutes, `gruntMinutes`; `throttle`, 10 reports in 30 minutes). With a `GOOGLE_API_KEY`, the gyms, PokéStops and Power Spots wait in a line for Google within a monthly budget that stays within Google's free amounts: `googleLookupsPerMonth` Places searches (4,500 unless set), of which the line leaves `googleLookupsReserve` (500) for gyms you add or move by hand and `/gym refresh`, and `googleGeocodesPerMonth` addresses (9,000); the month starts on the 1st at midnight Pacific time, when Google's free amounts reset, and `/gym google` shows how far the line is. The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). After an edit while the bot runs, `./pine restart`.
 
 ## 4. Start the bot
 
diff --git a/src/app.ts b/src/app.ts
index 08cadc39f97646183c984976944d1c24a9b9967a..affd85bff4c2f08d0929718d4e0e40b6e2469140 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -92,6 +92,8 @@ import { StopPostRepository } from './db/repositories/stop-post-repository.js';
 import { PineStopRepository } from './db/repositories/pine-stop-repository.js';
 import { GymUpkeep } from './services/gym-upkeep.js';
 import { GymLookupRepository } from './db/repositories/gym-lookup-repository.js';
+import { GoogleUseRepository } from './db/repositories/google-use-repository.js';
+import { GoogleRanks } from './services/google-ranks.js';
 import { ImageCache } from './services/image-cache.js';
 import { NotifyService } from './services/notify-service.js';
 import { OcrAssets } from './services/ocr-assets.js';
@@ -598,8 +600,19 @@ export async function startApp(
     posts: partyService,
     log,
     lookups: new GymLookupRepository(db),
-    perDay: config.settings.googleLookupsPerDay,
-    zone: config.settings.timezone,
+    use: new GoogleUseRepository(db),
+    budget: {
+      places: config.settings.googleLookupsPerMonth,
+      reserve: config.settings.googleLookupsReserve,
+      geocodes: config.settings.googleGeocodesPerMonth,
+    },
+    // The line goes by the raids of each place's best region (plan 8W-6), from the history.
+    ranks: new GoogleRanks({
+      regions,
+      gymRegions: (id) => gyms.regionsOf(id),
+      wayspotRegions: (id) => wayspots.regionsOf(id),
+      activity: history,
+    }),
   });
   // Map pictures from Google Static Maps, through the image cache (also for gym announcements).
   const maps = new StaticMaps(
@@ -811,11 +824,12 @@ export async function startApp(
     // Before the first read of the feed: the week's featured boss, a max battle's default end.
     await raidEvents.loadMax();
     await gyms.load();
-    // The gyms that waited for Google before a restart, and those that lack what it gives.
-    await gymUpkeep.resume();
     await regions.load();
     await wayspots.load();
     await pineStops.load();
+    // The gyms that waited for Google before a restart, and those that lack what it gives;
+    // after the regions and the Wayspots, which its ranks read (plan 8W-6).
+    await gymUpkeep.resume();
     await parties.load();
     await access.load();
     // What a stop between storing a raid and creating its post left behind: only the store is
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index 66ba6a3afaf1067a8224025b2df02d066cdd599d..22589232b8e1d0af12d3d33b31735bc03ce51dc7 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -142,6 +142,43 @@ describe('loadSettings', () => {
     }
   });
 
+  it('takes a monthly budget for Google, 4,500 places, a reserve of 500 and 9,000 geocodes unless set', () => {
+    const settings = loadSettings(REPO_SETTINGS);
+    expect(settings.googleLookupsPerMonth).toBe(4_500);
+    expect(settings.googleLookupsReserve).toBe(500);
+    expect(settings.googleGeocodesPerMonth).toBe(9_000);
+    const own = writeSettings((s) => {
+      s.googleLookupsPerMonth = 1_000;
+      s.googleLookupsReserve = 100;
+      s.googleGeocodesPerMonth = 0;
+    });
+    expect(loadSettings(own)).toMatchObject({
+      googleLookupsPerMonth: 1_000,
+      googleLookupsReserve: 100,
+      googleGeocodesPerMonth: 0,
+    });
+    // A budget of nothing, with nothing kept back: the line is stopped.
+    const stopped = writeSettings((s) => {
+      s.googleLookupsPerMonth = 0;
+      s.googleLookupsReserve = 0;
+    });
+    expect(loadSettings(stopped).googleLookupsPerMonth).toBe(0);
+    // The reserve must stay below the budget, and no budget is below nothing.
+    const reserved = writeSettings((s) => {
+      s.googleLookupsPerMonth = 500;
+    });
+    expect(() => loadSettings(reserved)).toThrow(/googleLookupsReserve/);
+    const negative = writeSettings((s) => {
+      s.googleGeocodesPerMonth = -1;
+    });
+    expect(() => loadSettings(negative)).toThrow(/googleGeocodesPerMonth/);
+    // The daily limit before plan 8W-6 is gone: a file that still names it is refused.
+    const old = writeSettings((s) => {
+      s.googleLookupsPerDay = 100;
+    });
+    expect(() => loadSettings(old)).toThrow(/googleLookupsPerDay/);
+  });
+
   it('words distances in imperial units unless the file says metric (task 7)', () => {
     expect(loadSettings(REPO_SETTINGS).distanceUnits).toBe('imperial');
     const metric = writeSettings((s) => {
diff --git a/src/config/settings.ts b/src/config/settings.ts
index 68b60f9e459e9b160a613890f55fceb3ca560ab5..67a63971517be5b74201cf0d02ae4bc7d02a6b7b 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -85,7 +85,7 @@ const publicUrl = z
   })
   .transform((value) => new URL(value).origin);
 
-export const settingsSchema = z.strictObject({
+const settingsObject = z.strictObject({
   standardRaidIncubateDuration: minutes,
   standardRaidHatchedDuration: minutes,
   eliteRaidIncubateDuration: minutes,
@@ -126,14 +126,18 @@ export const settingsSchema = z.strictObject({
   databaseRaids: z.boolean(),
   postNewGyms: z.boolean(),
   /**
-   * How many gyms of the line that waits for Google are asked about a day (`GymUpkeep`; Matt,
-   * 2026-10-16): what a Wayfarer import adds and moves, and the gyms whose nearest gym changed.
-   * A gym is a Places search (Nearby Search Pro: 5,000 free a month) and, without an address, a
-   * Geocoding (10,000 free a month); 100 a day stays within both with room for `/gym add` and
-   * moves by hand, which are asked about at once. A higher number for a catch-up is the
-   * operator's call; 0 stops the line.
+   * The monthly budget of the line that waits for Google (plan 8W-6; `GymUpkeep`): how many
+   * Places searches (Nearby Search Pro, 5,000 free a month) are asked a month, counted from the
+   * 1st at midnight Pacific time, when Google's free amounts reset. Every places question counts,
+   * in the line or not; the line stops when only `googleLookupsReserve` is left, which gyms added
+   * and moved by hand and `/gym refresh` may use (and go past the budget: an admin asked).
+   * `googleGeocodesPerMonth` is the line's budget of Geocodings (10,000 free a month), asked only
+   * for a gym without an address. The reserve stays below the budget, unless both are 0 (the line
+   * stopped). `googleLookupsPerDay` of before is gone, and refused as any unknown key is.
    */
-  googleLookupsPerDay: z.number().int().min(0).default(100),
+  googleLookupsPerMonth: z.number().int().min(0).default(4_500),
+  googleLookupsReserve: z.number().int().min(0).default(500),
+  googleGeocodesPerMonth: z.number().int().min(0).default(9_000),
   /**
    * Where admins ask for the Pine Wayspot export tool, which makes the file `/gym import` reads
    * (plan 8W-P; Matt, 2026-10-19): the page `/userscript` of the instance that hands it out. Its
@@ -515,6 +519,17 @@ export const settingsSchema = z.strictObject({
     })),
 });
 
+/** The settings, with the checks across keys. */
+export const settingsSchema = settingsObject.refine(
+  (settings) =>
+    settings.googleLookupsReserve < settings.googleLookupsPerMonth ||
+    (settings.googleLookupsPerMonth === 0 && settings.googleLookupsReserve === 0),
+  {
+    error: 'must be below googleLookupsPerMonth (both 0 stop the line)',
+    path: ['googleLookupsReserve'],
+  },
+);
+
 export type Settings = z.output<typeof settingsSchema>;
 
 /**
diff --git a/src/db/migrations/2026_10_25_031_google_line.ts b/src/db/migrations/2026_10_25_031_google_line.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f0330560161b515281e306de8f766694ec00c2dc
--- /dev/null
+++ b/src/db/migrations/2026_10_25_031_google_line.ts
@@ -0,0 +1,86 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * The line that waits for Google as a priority queue with a monthly budget (plan 8W-6; design
+ * `2026-10-20-google-line-priority-design.md`):
+ *
+ * - `GymLookup.regionRank`: the rank of the gym's best region by its raids (`regionRanks`,
+ *   `src/domain/geo/google-line.ts`; -1 for a gym in no region of any server), by which the line
+ *   is worked through before the time a gym was queued. Rows from before take 0 until the line's
+ *   ranks are worked out at the next start.
+ * - `WayspotLookup`: one row per PokéStop or Power Spot that waits for its places (`wayspotId`:
+ *   the Wayfarer id of a kept Wayspot, or `pine-<id>` for a stop of Pine's own; no foreign key,
+ *   since the two live in different tables: the line passes over an id it no longer knows),
+ *   its `kind` (`stop`, `powerspot`) and `regionRank` as for gyms, and when it was queued.
+ * - `WayspotPlaces`: the places Google gave around a PokéStop or Power Spot, kept apart from the
+ *   Wayfarer import's writes to `Wayspot` (whose upsert must not clear them), with the point and
+ *   kind they were asked for (`lat`, `lon`, `kind`: a Wayspot moved by more than a few meters, or
+ *   of another kind now, waits again) and when (`askedAt`, epoch ms); `places` the names joined
+ *   by spaces, as `GymMeta.places`, null when Google found none.
+ * - `GymGoogleAsked`: one row per gym whose places Google answered at the place it is now
+ *   (`askedAt`, epoch ms), whatever it found, written with the answer and deleted when the gym
+ *   moves (and with the gym): a gym Google found nothing for has neither address nor places, as
+ *   one never asked, and a start must not put it in the line again. A gym of before with places
+ *   counts as asked without a row.
+ * - `GoogleUseDay`: the questions that reached Google per day (`day`, `YYYY-MM-DD` in Pacific
+ *   time, when Google's free amounts reset) and kind (`places`, `geocode`): a month is the sum of
+ *   its days, so that a restart does not start the month's count again. `GymLookupDay` stays and
+ *   is no longer written; its rows of the current month are read as places questions.
+ *
+ * 031: first merge wins; another branch that adds a 031 renumbers.
+ *
+ * Safe to run again after a failure half-way: a table is created and a column added only when it
+ * is missing.
+ */
+export const googleLine: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    const existing = await sql<{ n: number }>`
+      select count(*) as n from information_schema.columns
+      where table_schema = database() and table_name = 'GymLookup'
+        and column_name = 'regionRank'`.execute(db);
+    if (Number(existing.rows[0]?.n ?? 0) === 0) {
+      await sql`alter table GymLookup
+        add column regionRank double not null default 0,
+        add key gymlookup_order_index (regionRank desc, queuedAt, gymId)`.execute(db);
+    }
+    await sql`
+      create table if not exists WayspotLookup (
+        wayspotId varchar(40) not null,
+        kind varchar(10) not null,
+        regionRank double not null default 0,
+        queuedAt bigint not null,
+        primary key (wayspotId),
+        key wayspotlookup_order_index (kind desc, regionRank desc, queuedAt, wayspotId)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists WayspotPlaces (
+        wayspotId varchar(40) not null,
+        kind varchar(10) not null,
+        lat double not null,
+        lon double not null,
+        places text default null,
+        askedAt bigint not null,
+        primary key (wayspotId)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists GymGoogleAsked (
+        gymId int unsigned not null,
+        askedAt bigint not null,
+        primary key (gymId),
+        constraint gymgoogleasked_gymid_foreign foreign key (gymId) references Gym (id)
+          on delete cascade
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists GoogleUseDay (
+        day char(10) not null,
+        kind varchar(8) not null,
+        questions int unsigned not null default 0,
+        primary key (day, kind)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+  },
+  async down() {
+    // Additive only: nothing is ever dropped.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index 903d6c60a7c98b5720d89a556e1ee006b5ddaff3..389da0d9fdccc3c6552d440e2a74fe23104252a5 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -29,6 +29,7 @@ import { stopReports } from './2026_10_21_027_stop_reports.js';
 import { rocket } from './2026_10_22_028_rocket.js';
 import { maxEvents } from './2026_10_22_029_max_events.js';
 import { costumedWants } from './2026_10_22_030_costumed_wants.js';
+import { googleLine } from './2026_10_25_031_google_line.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -65,4 +66,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_22_028_rocket': rocket,
   '2026_10_22_029_max_events': maxEvents,
   '2026_10_22_030_costumed_wants': costumedWants,
+  '2026_10_25_031_google_line': googleLine,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index 87d20a6be658367bad84741fed47bc9789a7c243..7c9477be7318670a7bee43ccd7322aa1faf9a4aa 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -65,6 +65,10 @@ const ADDED_TABLES = [
   'RocketLineup',
   'GruntMessage',
   'MaxEvent',
+  'WayspotLookup',
+  'WayspotPlaces',
+  'GymGoogleAsked',
+  'GoogleUseDay',
 ];
 /** The columns it adds to tables of the legacy bot, as `Table.column`. */
 const ADDED_COLUMNS = [
@@ -191,6 +195,7 @@ describe('runMigrations', () => {
       '2026_10_22_028_rocket',
       '2026_10_22_029_max_events',
       '2026_10_22_030_costumed_wants',
+      '2026_10_25_031_google_line',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/repositories/google-line.db.test.ts b/src/db/repositories/google-line.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4d5db3472e40c59017e74901295e1dd645c19582
--- /dev/null
+++ b/src/db/repositories/google-line.db.test.ts
@@ -0,0 +1,88 @@
+import { sql, type Kysely } from 'kysely';
+import { afterAll, beforeAll, describe, expect, it } from 'vitest';
+import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import { DEPRECATED_SYNTAX, lastWarnings } from '../../../test/support/mysql-warnings.js';
+import { googleUseCases } from '../../../test/support/google-use-cases.js';
+import { wayspotLookupCases } from '../../../test/support/wayspot-lookup-cases.js';
+import type { DB } from '../types.js';
+import { GoogleUseRepository } from './google-use-repository.js';
+import { HistoryRepository } from './history-repository.js';
+import { WayspotLookupRepository } from './wayspot-lookup-repository.js';
+
+/** The storage of the line that waits for Google beside the gyms' (plan 8W-6). */
+describe('the storage of the Google line', () => {
+  let stop: () => Promise<void>;
+  let db: Kysely<DB>;
+
+  beforeAll(async () => {
+    ({ db, stop } = await startMigratedDatabase());
+  });
+  afterAll(async () => {
+    await stop();
+  });
+
+  describe('WayspotLookupRepository', () => {
+    const fresh = async () => {
+      await db.deleteFrom('WayspotLookup').execute();
+      await db.deleteFrom('WayspotPlaces').execute();
+      return new WayspotLookupRepository(db);
+    };
+
+    wayspotLookupCases(fresh);
+
+    it('queues and keeps places again without the VALUES() function MySQL deprecates', async () => {
+      await fresh();
+      const warnings = await lastWarnings(db, async (trx) => {
+        const lookups = new WayspotLookupRepository(trx);
+        await lookups.add([{ wayspotId: 'aa.16', kind: 'stop', rank: 0 }], 1_000);
+        await lookups.add([{ wayspotId: 'aa.16', kind: 'powerspot', rank: 1 }], 2_000);
+        const asked = { wayspotId: 'aa.16', kind: 'stop' as const, lat: 40, lon: -80 };
+        await lookups.saveAsked({ ...asked, places: 'One', askedAt: 1 });
+        await lookups.saveAsked({ ...asked, places: 'Two', askedAt: 2 });
+      });
+      expect(warnings.filter((warning) => warning.Code === DEPRECATED_SYNTAX)).toEqual([]);
+      const lookups = new WayspotLookupRepository(db);
+      expect(await lookups.next()).toMatchObject({ kind: 'powerspot', queuedAt: 1_000 });
+      expect((await lookups.asked())[0]?.places).toBe('Two');
+    });
+  });
+
+  describe('GoogleUseRepository', () => {
+    googleUseCases(async () => {
+      await db.deleteFrom('GoogleUseDay').execute();
+      await db.deleteFrom('GymLookupDay').execute();
+      return {
+        use: new GoogleUseRepository(db),
+        legacy: async (day, gyms) => {
+          await db.insertInto('GymLookupDay').values({ day, gyms }).execute();
+        },
+      };
+    });
+  });
+
+  describe('HistoryRepository.raidsByRegion', () => {
+    it('counts the raids and max battles of each region since a moment', async () => {
+      await db.deleteFrom('PartyHistory').execute();
+      const party = async (kind: string, regionId: number | null, createdAt: number) => {
+        await sql`insert into PartyHistory (source, kind, serverId, regionId, createdAt, ending)
+                  values ('live', ${kind}, '412345678901234567', ${regionId}, ${createdAt},
+                          'completed')`.execute(db);
+      };
+      await party('raid', 1, 2_000);
+      await party('raid', 1, 3_000);
+      await party('max', 1, 3_000);
+      await party('raid', 2, 3_000);
+      await party('train', 2, 3_000);
+      await party('meetup', 3, 3_000);
+      await party('raid', 2, 999);
+      await party('raid', null, 3_000);
+      const raids = await new HistoryRepository(db).raidsByRegion(1_000);
+      expect(raids).toEqual(
+        new Map([
+          [1, 3],
+          [2, 1],
+        ]),
+      );
+    });
+  });
+});
diff --git a/src/db/repositories/google-use-repository.ts b/src/db/repositories/google-use-repository.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7a1053b64edb106bd2ae9d657d226e02238d2a9c
--- /dev/null
+++ b/src/db/repositories/google-use-repository.ts
@@ -0,0 +1,45 @@
+import { sql, type Kysely } from 'kysely';
+import type { DayUse, GoogleQuestion, GoogleUse } from '../../services/google-use.js';
+import type { DB } from '../types.js';
+
+/**
+ * The questions that reached Google per Pacific day and kind (`GoogleUseDay`, migration 031),
+ * with the gyms the line counted per day before (`GymLookupDay`, migration 014, no longer
+ * written) read as places questions. Its twin is `MemoryGoogleUse`; both run `googleUseCases`.
+ */
+export class GoogleUseRepository implements GoogleUse {
+  constructor(private readonly db: Kysely<DB>) {}
+
+  async use(day: string, question: GoogleQuestion): Promise<void> {
+    await this.db
+      .insertInto('GoogleUseDay')
+      .values({ day, kind: question, questions: 1 })
+      .onDuplicateKeyUpdate({ questions: sql`questions + 1` })
+      .execute();
+  }
+
+  async usedOn(days: readonly string[]): Promise<Map<string, DayUse>> {
+    const used = new Map<string, DayUse>();
+    if (days.length === 0) return used;
+    const add = (day: string, places: number, geocodes: number): void => {
+      const kept = used.get(day) ?? { places: 0, geocodes: 0 };
+      used.set(day, { places: kept.places + places, geocodes: kept.geocodes + geocodes });
+    };
+    const rows = await this.db
+      .selectFrom('GoogleUseDay')
+      .select(['day', 'kind', 'questions'])
+      .where('day', 'in', days)
+      .execute();
+    for (const row of rows) {
+      if (row.kind === 'geocode') add(row.day, 0, row.questions);
+      else add(row.day, row.questions, 0);
+    }
+    const old = await this.db
+      .selectFrom('GymLookupDay')
+      .select(['day', 'gyms'])
+      .where('day', 'in', days)
+      .execute();
+    for (const row of old) if (row.gyms > 0) add(row.day, row.gyms, 0);
+    return used;
+  }
+}
diff --git a/src/db/repositories/gym-lookup-repository.db.test.ts b/src/db/repositories/gym-lookup-repository.db.test.ts
index 212e10351d70a6d3f5e2e26f690b379cb6518ead..54d1109844bb454500305f9c34d09df01cdd7438 100644
--- a/src/db/repositories/gym-lookup-repository.db.test.ts
+++ b/src/db/repositories/gym-lookup-repository.db.test.ts
@@ -35,18 +35,20 @@ describe('GymLookupRepository', () => {
     await fresh();
     const warnings = await lastWarnings(db, async (trx) => {
       const lookups = new GymLookupRepository(trx);
-      await lookups.add([{ gymId: 2, address: false }], 1_000);
-      await lookups.add([{ gymId: 2, address: true }], 2_000);
+      await lookups.add([{ gymId: 2, address: false, rank: 0 }], 1_000);
+      await lookups.add([{ gymId: 2, address: true, rank: 1 }], 2_000);
     });
     expect(warnings.filter((warning) => warning.Code === DEPRECATED_SYNTAX)).toEqual([]);
     const lookups = new GymLookupRepository(db);
     expect(await lookups.next()).toEqual({ gymId: 2, address: true });
   });
 
-  it('takes a gym out of the line with its row', async () => {
+  it('takes a gym out of the line and forgets it was asked with its row', async () => {
     const lookups = await fresh();
-    await lookups.add([{ gymId: 2, address: true }], 1_000);
+    await lookups.add([{ gymId: 2, address: true, rank: 0 }], 1_000);
+    await lookups.markAsked(2, 1_000);
     await db.deleteFrom('Gym').where('id', '=', 2).execute();
     expect(await lookups.count()).toBe(0);
+    expect(await lookups.asked()).toEqual(new Set());
   });
 });
diff --git a/src/db/repositories/gym-lookup-repository.ts b/src/db/repositories/gym-lookup-repository.ts
index bca42a9a60398e33105ffbf39c0502d36eb9081c..3ebba7e83314b088ff4a1c74c31c073dbd6edbd8 100644
--- a/src/db/repositories/gym-lookup-repository.ts
+++ b/src/db/repositories/gym-lookup-repository.ts
@@ -1,39 +1,53 @@
 import { sql, type Kysely } from 'kysely';
-import type { GymLookup, GymLookups } from '../../services/gym-lookups.js';
+import type {
+  GymLookup,
+  GymLookups,
+  NextGymOptions,
+  QueuedGym,
+  WaitingGym,
+} from '../../services/gym-lookups.js';
 import type { DB } from '../types.js';
 
 /**
- * The line of gyms that wait for Google, in the tables `GymLookup` and `GymLookupDay`
- * (migration 014): what `GymUpkeep` works through a bounded number a day. Its twin in memory is
- * `MemoryGymLookups`; both run `gymLookupCases` (`test/support/gym-lookup-cases.ts`).
+ * The line of gyms that wait for Google, in the table `GymLookup` (migration 014, its rank of
+ * migration 031): what `GymUpkeep` works through within the monthly budget, and the gyms Google
+ * answered about (`GymGoogleAsked`, migration 031). Its twin in memory is `MemoryGymLookups`;
+ * both run `gymLookupCases` (`test/support/gym-lookup-cases.ts`). The old count per day,
+ * `GymLookupDay`, is read by `GoogleUseRepository`.
  */
 export class GymLookupRepository implements GymLookups {
   constructor(private readonly db: Kysely<DB>) {}
 
-  async add(gyms: readonly GymLookup[], now: number): Promise<void> {
+  async add(gyms: readonly QueuedGym[], now: number): Promise<void> {
     if (gyms.length === 0) return;
-    // A gym already in the line keeps its place; it waits for its address when either asks.
+    // A gym already in the line keeps its time; it waits for its address when either asks, and
+    // takes the rank given.
     await this.db
       .insertInto('GymLookup')
       .values(
-        gyms.map(({ gymId, address }) => ({
+        gyms.map(({ gymId, address, rank }) => ({
           gymId,
           address: address ? 1 : 0,
+          regionRank: rank,
           queuedAt: String(now),
         })),
       )
       // The row alias (MySQL 8.0.19 on), not `VALUES()`, which 8.0.20 deprecates.
       .modifyEnd(
-        sql`as new on duplicate key update address = greatest(GymLookup.address, new.address)`,
+        sql`as new on duplicate key update address = greatest(GymLookup.address, new.address),
+            regionRank = new.regionRank`,
       )
       .execute();
   }
 
-  async next(options: { placesOnly?: boolean } = {}): Promise<GymLookup | undefined> {
+  async next(options: NextGymOptions = {}): Promise<GymLookup | undefined> {
+    const except = [...(options.except ?? [])];
     const row = await this.db
       .selectFrom('GymLookup')
       .select(['gymId', 'address'])
       .$if(options.placesOnly === true, (query) => query.where('address', '=', 0))
+      .$if(except.length > 0, (query) => query.where('gymId', 'not in', except))
+      .orderBy('regionRank', 'desc')
       .orderBy('queuedAt')
       .orderBy('gymId')
       .limit(1)
@@ -61,20 +75,67 @@ export class GymLookupRepository implements GymLookups {
     return Number(row?.n ?? 0);
   }
 
-  async used(day: string): Promise<number> {
-    const row = await this.db
-      .selectFrom('GymLookupDay')
-      .select('gyms')
-      .where('day', '=', day)
-      .executeTakeFirst();
-    return row?.gyms ?? 0;
+  async list(): Promise<WaitingGym[]> {
+    const rows = await this.db
+      .selectFrom('GymLookup')
+      .select(['gymId', 'address', 'regionRank', 'queuedAt'])
+      .orderBy('regionRank', 'desc')
+      .orderBy('queuedAt')
+      .orderBy('gymId')
+      .execute();
+    return rows.map((row) => ({
+      gymId: row.gymId,
+      address: row.address === 1,
+      rank: row.regionRank,
+      queuedAt: Number(row.queuedAt),
+    }));
+  }
+
+  async setRanks(ranks: ReadonlyMap<number, number>): Promise<void> {
+    // A region's rank is shared by its gyms: one statement per rank.
+    for (const [rank, ids] of byRank(ranks)) {
+      await this.db
+        .updateTable('GymLookup')
+        .set({ regionRank: rank })
+        .where('gymId', 'in', ids)
+        .execute();
+    }
   }
 
-  async use(day: string): Promise<void> {
+  async asked(): Promise<Set<number>> {
+    const rows = await this.db.selectFrom('GymGoogleAsked').select('gymId').execute();
+    return new Set(rows.map((row) => row.gymId));
+  }
+
+  async markAsked(gymId: number, at: number): Promise<void> {
     await this.db
-      .insertInto('GymLookupDay')
-      .values({ day, gyms: 1 })
-      .onDuplicateKeyUpdate({ gyms: sql`gyms + 1` })
+      .insertInto('GymGoogleAsked')
+      .values({ gymId, askedAt: String(at) })
+      .modifyEnd(sql`as new on duplicate key update askedAt = new.askedAt`)
       .execute();
   }
+
+  async forgetAsked(gymId: number): Promise<void> {
+    await this.db.deleteFrom('GymGoogleAsked').where('gymId', '=', gymId).execute();
+  }
+}
+
+/** How many ids one statement names at most. */
+const CHUNK = 1_000;
+
+/** The ids of each rank, in chunks of `CHUNK`. */
+function byRank<K>(ranks: ReadonlyMap<K, number>): [number, K[]][] {
+  const grouped = new Map<number, K[]>();
+  for (const [id, rank] of ranks) {
+    const ids = grouped.get(rank);
+    if (ids) ids.push(id);
+    else grouped.set(rank, [id]);
+  }
+  const chunks: [number, K[]][] = [];
+  for (const [rank, ids] of grouped) {
+    for (let start = 0; start < ids.length; start += CHUNK) {
+      chunks.push([rank, ids.slice(start, start + CHUNK)]);
+    }
+  }
+  return chunks;
 }
diff --git a/src/db/repositories/history-repository.ts b/src/db/repositories/history-repository.ts
index 4558ba771e37a357d936280c429ad734c6eefaf8..2d4e75eb7ef067f6905463c2781bc6e68891d541 100644
--- a/src/db/repositories/history-repository.ts
+++ b/src/db/repositories/history-repository.ts
@@ -393,6 +393,25 @@ export class HistoryRepository implements HistoryOptIns, HistoryStorage {
     });
   }
 
+  /**
+   * How many raids each region had since a moment (epoch ms), max battles counted as raids
+   * (plan 8W-6: the rank of a region in the line that waits for Google). Regions without any are
+   * left out, as are parties without a region.
+   */
+  async raidsByRegion(since: number): Promise<Map<number, number>> {
+    const rows = await this.db
+      .selectFrom('PartyHistory')
+      .select((eb) => ['regionId', eb.fn.countAll<number | string>().as('raids')])
+      .where('kind', 'in', ['raid', 'max'])
+      .where('createdAt', '>=', String(since))
+      .where('regionId', 'is not', null)
+      .groupBy('regionId')
+      .execute();
+    return new Map(
+      rows.flatMap((row) => (row.regionId === null ? [] : [[row.regionId, Number(row.raids)]])),
+    );
+  }
+
   async isOptedIn(memberId: string, guildId: string): Promise<boolean> {
     const row = await this.db
       .selectFrom('HistoryOptIn')
diff --git a/src/db/repositories/wayspot-lookup-repository.ts b/src/db/repositories/wayspot-lookup-repository.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fcacbe1d8b50ec450b77657c51ef48b15a3b9743
--- /dev/null
+++ b/src/db/repositories/wayspot-lookup-repository.ts
@@ -0,0 +1,123 @@
+import { sql, type Kysely } from 'kysely';
+import type {
+  AskedPlaces,
+  QueuedWayspot,
+  WaitingWayspot,
+  WayspotLineKind,
+  WayspotLookups,
+} from '../../services/wayspot-lookups.js';
+import type { DB } from '../types.js';
+
+/** A kind as stored; anything else is read as a stop (the line asks it again as it is). */
+function lineKind(kind: string): WayspotLineKind {
+  return kind === 'powerspot' ? 'powerspot' : 'stop';
+}
+
+/**
+ * The PokéStops and Power Spots that wait for Google (`WayspotLookup`) and the places it gave
+ * around them (`WayspotPlaces`), of migration 031. Its twin is `MemoryWayspotLookups`; both run
+ * `wayspotLookupCases`.
+ */
+export class WayspotLookupRepository implements WayspotLookups {
+  constructor(private readonly db: Kysely<DB>) {}
+
+  async add(wayspots: readonly QueuedWayspot[], now: number): Promise<void> {
+    if (wayspots.length === 0) return;
+    await this.db
+      .insertInto('WayspotLookup')
+      .values(
+        wayspots.map(({ wayspotId, kind, rank }) => ({
+          wayspotId,
+          kind,
+          regionRank: rank,
+          queuedAt: String(now),
+        })),
+      )
+      .modifyEnd(sql`as new on duplicate key update kind = new.kind, regionRank = new.regionRank`)
+      .execute();
+  }
+
+  private ordered() {
+    return (
+      this.db
+        .selectFrom('WayspotLookup')
+        .select(['wayspotId', 'kind', 'regionRank', 'queuedAt'])
+        // Stops before Power Spots ('stop' > 'powerspot'), as the index wayspotlookup_order_index.
+        .orderBy('kind', 'desc')
+        .orderBy('regionRank', 'desc')
+        .orderBy('queuedAt')
+        .orderBy('wayspotId')
+    );
+  }
+
+  async next(options: { except?: ReadonlySet<string> } = {}): Promise<WaitingWayspot | undefined> {
+    const except = [...(options.except ?? [])];
+    const row = await this.ordered()
+      .$if(except.length > 0, (query) => query.where('wayspotId', 'not in', except))
+      .limit(1)
+      .executeTakeFirst();
+    return row && waiting(row);
+  }
+
+  async remove(ids: readonly string[]): Promise<void> {
+    if (ids.length === 0) return;
+    await this.db.deleteFrom('WayspotLookup').where('wayspotId', 'in', ids).execute();
+  }
+
+  async count(): Promise<number> {
+    const row = await this.db
+      .selectFrom('WayspotLookup')
+      .select((eb) => eb.fn.countAll<number | string>().as('n'))
+      .executeTakeFirst();
+    return Number(row?.n ?? 0);
+  }
+
+  async list(): Promise<WaitingWayspot[]> {
+    return (await this.ordered().execute()).map(waiting);
+  }
+
+  async asked(): Promise<AskedPlaces[]> {
+    const rows = await this.db
+      .selectFrom('WayspotPlaces')
+      .select(['wayspotId', 'kind', 'lat', 'lon', 'places', 'askedAt'])
+      .execute();
+    return rows.map((row) => ({
+      wayspotId: row.wayspotId,
+      kind: lineKind(row.kind),
+      lat: row.lat,
+      lon: row.lon,
+      places: row.places,
+      askedAt: Number(row.askedAt),
+    }));
+  }
+
+  async saveAsked(row: AskedPlaces): Promise<void> {
+    await this.db
+      .insertInto('WayspotPlaces')
+      .values({ ...row, askedAt: String(row.askedAt) })
+      .modifyEnd(
+        sql`as new on duplicate key update kind = new.kind, lat = new.lat, lon = new.lon,
+            places = new.places, askedAt = new.askedAt`,
+      )
+      .execute();
+  }
+
+  async dropAsked(ids: readonly string[]): Promise<void> {
+    if (ids.length === 0) return;
+    await this.db.deleteFrom('WayspotPlaces').where('wayspotId', 'in', ids).execute();
+  }
+}
+
+function waiting(row: {
+  wayspotId: string;
+  kind: string;
+  regionRank: number;
+  queuedAt: string;
+}): WaitingWayspot {
+  return {
+    wayspotId: row.wayspotId,
+    kind: lineKind(row.kind),
+    rank: row.regionRank,
+    queuedAt: Number(row.queuedAt),
+  };
+}
diff --git a/src/db/table-names.ts b/src/db/table-names.ts
index b6c6ad8a5f46c7fd7307d1b40cf4f7bc02132dac..726210797a2b2790537ff6e09cd9fc7b7bc8fef6 100644
--- a/src/db/table-names.ts
+++ b/src/db/table-names.ts
@@ -17,6 +17,8 @@ export const PINE_TABLES: readonly string[] = [
   'GruntMessage',
   'GymLookup',
   'GymLookupDay',
+  'GymGoogleAsked',
+  'GoogleUseDay',
   'GymReview',
   'GymWayfarer',
   'EndedPartyPost',
@@ -51,6 +53,8 @@ export const PINE_TABLES: readonly string[] = [
   'TargetWant',
   'UnownWantGift',
   'Wayspot',
+  'WayspotLookup',
+  'WayspotPlaces',
   'WayspotImport',
   'WebSession',
   'kysely_migration',
diff --git a/src/db/types.ts b/src/db/types.ts
index b5f3f343ee7b5ea2b26d17ad2fed573872c9c8dd..fbaa19b8429ce60b55be5e650528e660b79b7651 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -70,6 +70,12 @@ export interface EndedPartyPost {
   guildId: number;
 }
 
+export interface GoogleUseDay {
+  day: string;
+  kind: string;
+  questions: Generated<number>;
+}
+
 export interface GruntMessage {
   channelId: string;
   deleteAt: string;
@@ -91,10 +97,16 @@ export interface Gym {
   pogoId: string | null;
 }
 
+export interface GymGoogleAsked {
+  askedAt: string;
+  gymId: number;
+}
+
 export interface GymLookup {
   address: Generated<number>;
   gymId: number;
   queuedAt: string;
+  regionRank: Generated<number>;
 }
 
 export interface GymLookupDay {
@@ -644,6 +656,22 @@ export interface WayspotImport {
   startedAt: string | null;
 }
 
+export interface WayspotLookup {
+  kind: string;
+  queuedAt: string;
+  regionRank: Generated<number>;
+  wayspotId: string;
+}
+
+export interface WayspotPlaces {
+  askedAt: string;
+  kind: string;
+  lat: number;
+  lon: number;
+  places: string | null;
+  wayspotId: string;
+}
+
 export interface WebSession {
   createdAt: string;
   expiresAt: string;
@@ -660,9 +688,11 @@ export interface DB {
   CommandRoleAuthorization: CommandRoleAuthorization;
   CommandRoles: CommandRoles;
   EndedPartyPost: EndedPartyPost;
+  GoogleUseDay: GoogleUseDay;
   GruntMessage: GruntMessage;
   Guild: Guild;
   Gym: Gym;
+  GymGoogleAsked: GymGoogleAsked;
   GymLookup: GymLookup;
   GymLookupDay: GymLookupDay;
   GymMeta: GymMeta;
@@ -707,5 +737,7 @@ export interface DB {
   User: User;
   Wayspot: Wayspot;
   WayspotImport: WayspotImport;
+  WayspotLookup: WayspotLookup;
+  WayspotPlaces: WayspotPlaces;
   WebSession: WebSession;
 }
diff --git a/src/services/google-ranks.test.ts b/src/services/google-ranks.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9c15d0a6357a0cd4057816398f290de4c3fdabfb
--- /dev/null
+++ b/src/services/google-ranks.test.ts
@@ -0,0 +1,70 @@
+import { describe, expect, it } from 'vitest';
+import { NO_REGION_RANK } from '../domain/geo/google-line.js';
+import { GoogleRanks } from './google-ranks.js';
+
+const REGIONS = [
+  { id: 1, guildId: 10, channelId: 'north' },
+  { id: 2, guildId: 10, channelId: 'south' },
+  { id: 3, guildId: 20, channelId: 'other' },
+  { id: 4, guildId: null, channelId: 'nobody' },
+];
+
+describe('GoogleRanks', () => {
+  it('ranks a place by its best region, from the raids since 90 days before the moment', async () => {
+    const asked: number[] = [];
+    const now = 100 * 86_400_000;
+    const ranks = new GoogleRanks({
+      regions: { all: () => REGIONS },
+      gymRegions: (id) => (id === 7 ? ['north', 'south'] : id === 8 ? ['south'] : []),
+      wayspotRegions: (id) => (id === 'aa.16' ? ['nobody'] : id === 'bb.16' ? ['other'] : []),
+      activity: {
+        raidsByRegion: (since) => {
+          asked.push(since);
+          return Promise.resolve(
+            new Map([
+              [1, 10],
+              [2, 5],
+              [3, 1],
+            ]),
+          );
+        },
+      },
+      now: () => now,
+    });
+    // Before the first reading every region ranks the same.
+    expect(ranks.ofGym(8)).toBe(1);
+    await ranks.refresh();
+    expect(asked).toEqual([10 * 86_400_000]);
+    expect(ranks.ofGym(7)).toBe(1);
+    expect(ranks.ofGym(8)).toBe(0.5);
+    expect(ranks.ofGym(9)).toBe(NO_REGION_RANK);
+    expect(ranks.ofWayspot('bb.16')).toBe(1);
+    // A Wayspot in no region of any server is not ranked: it does not wait for Google.
+    expect(ranks.ofWayspot('aa.16')).toBeUndefined();
+    expect(ranks.ofWayspot('cc.16')).toBeUndefined();
+  });
+
+  it('keeps the ranks it had when the history cannot be read', async () => {
+    let failing = false;
+    const ranks = new GoogleRanks({
+      regions: { all: () => REGIONS },
+      gymRegions: () => ['south'],
+      wayspotRegions: () => [],
+      activity: {
+        raidsByRegion: () =>
+          failing
+            ? Promise.reject(new Error('no database'))
+            : Promise.resolve(
+                new Map([
+                  [1, 4],
+                  [2, 1],
+                ]),
+              ),
+      },
+    });
+    await ranks.refresh();
+    failing = true;
+    await expect(ranks.refresh()).rejects.toThrow('no database');
+    expect(ranks.ofGym(1)).toBe(0.25);
+  });
+});
diff --git a/src/services/google-ranks.ts b/src/services/google-ranks.ts
new file mode 100644
index 0000000000000000000000000000000000000000..169562a43e2b8e144579701e3dc3cd69b64334fa
--- /dev/null
+++ b/src/services/google-ranks.ts
@@ -0,0 +1,65 @@
+import {
+  bestRank,
+  NO_REGION_RANK,
+  RANK_DAYS,
+  regionRanks,
+  type RankedRegion,
+} from '../domain/geo/google-line.js';
+
+export interface GoogleRanksOptions {
+  /** The regions (`RegionDirectory`): their rows and channels. */
+  regions: { all(): readonly (RankedRegion & { channelId: string })[] };
+  /** The channels of the regions a gym lies in (`GymDirectory.regionsOf`). */
+  gymRegions(gymId: number): readonly string[];
+  /** The channels of the regions a Wayspot lies in (`WayspotDirectory.regionsOf`). */
+  wayspotRegions(wayspotId: string): readonly string[];
+  /** The party history: the raids of each region since a moment (`HistoryRepository`). */
+  activity: { raidsByRegion(since: number): Promise<ReadonlyMap<number, number>> };
+  /** Default `Date.now`. */
+  now?: () => number;
+}
+
+/**
+ * The rank of each place in the line that waits for Google (plan 8W-6): its best region's, by
+ * the region's raids over the last `RANK_DAYS` days as a part of its server's busiest region
+ * (`regionRanks`). The raids are read at `refresh` (at start and once a day: the line ranks by
+ * them, not per question); until the first reading, and while there is no history, every region
+ * ranks the same. A gym in no region of any server ranks last; a Wayspot there has no rank and
+ * does not wait for Google.
+ */
+export class GoogleRanks {
+  private ranks = new Map<number, number>();
+  private read = false;
+
+  constructor(private readonly options: GoogleRanksOptions) {}
+
+  /** Reads the raids anew. Rejects when they cannot be read; the ranks are then as they were. */
+  async refresh(): Promise<void> {
+    const now = (this.options.now ?? Date.now)();
+    const raids = await this.options.activity.raidsByRegion(now - RANK_DAYS * 86_400_000);
+    this.ranks = regionRanks(this.options.regions.all(), raids);
+    this.read = true;
+  }
+
+  private rankOf(channels: readonly string[]): number {
+    const regions = this.options.regions.all();
+    // Before the first reading: the regions of a server alike.
+    const ranks = this.read ? this.ranks : regionRanks(regions, new Map());
+    const ids = channels.flatMap((channelId) => {
+      const region = regions.find((one) => one.channelId === channelId);
+      return region ? [region.id] : [];
+    });
+    return bestRank(ids, ranks);
+  }
+
+  /** The rank of a gym; `NO_REGION_RANK` for one in no region of any server. */
+  ofGym(gymId: number): number {
+    return this.rankOf(this.options.gymRegions(gymId));
+  }
+
+  /** The rank of a PokéStop or Power Spot; undefined for one in no region of any server. */
+  ofWayspot(wayspotId: string): number | undefined {
+    const rank = this.rankOf(this.options.wayspotRegions(wayspotId));
+    return rank === NO_REGION_RANK ? undefined : rank;
+  }
+}
diff --git a/src/services/google-use.test.ts b/src/services/google-use.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9502198dda720a90520ffbc74e911296e658c4b3
--- /dev/null
+++ b/src/services/google-use.test.ts
@@ -0,0 +1,31 @@
+import { describe, expect, it } from 'vitest';
+import { googleUseCases } from '../../test/support/google-use-cases.js';
+import { MemoryGoogleUse, usedThisMonth } from './google-use.js';
+
+describe('MemoryGoogleUse', () => {
+  googleUseCases(() => {
+    const use = new MemoryGoogleUse();
+    return Promise.resolve({
+      use,
+      legacy: (day, gyms) => {
+        use.legacy.set(day, gyms);
+        return Promise.resolve();
+      },
+    });
+  });
+});
+
+describe('usedThisMonth', () => {
+  it('sums the days of the Pacific month of a moment, and of them today', async () => {
+    const use = new MemoryGoogleUse();
+    await use.use('2026-09-30', 'places');
+    await use.use('2026-10-01', 'places');
+    await use.use('2026-10-31', 'places');
+    await use.use('2026-10-31', 'geocode');
+    await use.use('2026-11-01', 'places');
+    use.legacy.set('2026-10-02', 10);
+    // 23:30 on October 31 in California: November 1 in UTC, still October for Google.
+    const used = await usedThisMonth(use, new Date('2026-10-31T23:30:00-07:00').getTime());
+    expect(used).toEqual({ monthPlaces: 12, todayPlaces: 1, monthGeocodes: 1 });
+  });
+});
diff --git a/src/services/google-use.ts b/src/services/google-use.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8937dcb870ac1e5c6eb8b428457f79ab9bca5c00
--- /dev/null
+++ b/src/services/google-use.ts
@@ -0,0 +1,80 @@
+import { googleMonth, type GoogleUsed } from '../domain/geo/google-line.js';
+
+/**
+ * What was asked of Google, per day and kind of question (plan 8W-6): the monthly budget is the
+ * sum of the month's days (`googleMonth`, Pacific time), and the days serve the pacing of the
+ * line. A question counts when it reached Google (a refused key or none asks nothing; a failure
+ * counts). `GoogleUseRepository` keeps it in the database (`GoogleUseDay`, and the old
+ * `GymLookupDay` read as places questions); `MemoryGoogleUse` is its twin (both run
+ * `googleUseCases`).
+ */
+
+/** A Places search (Nearby Search Pro) or a Geocoding (reverse geocoding). */
+export type GoogleQuestion = 'places' | 'geocode';
+
+/** What one day used. */
+export interface DayUse {
+  places: number;
+  geocodes: number;
+}
+
+export interface GoogleUse {
+  /** Counts one question on a day (`YYYY-MM-DD`, Pacific time). */
+  use(day: string, question: GoogleQuestion): Promise<void>;
+  /**
+   * What these days used; a day without questions is left out. The gyms the line before plan
+   * 8W-6 counted on a day (`GymLookupDay`) count as places questions of that day.
+   */
+  usedOn(days: readonly string[]): Promise<Map<string, DayUse>>;
+}
+
+/** The counts in memory: the database's twin. `legacy` is the old count of gyms per day. */
+export class MemoryGoogleUse implements GoogleUse {
+  readonly days = new Map<string, DayUse>();
+  readonly legacy = new Map<string, number>();
+
+  use(day: string, question: GoogleQuestion): Promise<void> {
+    const kept = this.days.get(day) ?? { places: 0, geocodes: 0 };
+    this.days.set(
+      day,
+      question === 'places'
+        ? { ...kept, places: kept.places + 1 }
+        : { ...kept, geocodes: kept.geocodes + 1 },
+    );
+    return Promise.resolve();
+  }
+
+  usedOn(days: readonly string[]): Promise<Map<string, DayUse>> {
+    const used = new Map<string, DayUse>();
+    for (const day of days) {
+      const kept = this.days.get(day);
+      const old = this.legacy.get(day) ?? 0;
+      if (!kept && old === 0) continue;
+      used.set(day, {
+        places: (kept?.places ?? 0) + old,
+        geocodes: kept?.geocodes ?? 0,
+      });
+    }
+    return Promise.resolve(used);
+  }
+
+  /** Every question counted, over every day (for tests). */
+  total(question: GoogleQuestion): number {
+    let sum = 0;
+    for (const day of this.days.values()) sum += question === 'places' ? day.places : day.geocodes;
+    return sum;
+  }
+}
+
+/** What the month of a moment used so far, and of it the day (`lineAllowance` takes it). */
+export async function usedThisMonth(use: GoogleUse, now: number): Promise<GoogleUsed> {
+  const month = googleMonth(now);
+  const days = await use.usedOn(month.days);
+  let monthPlaces = 0;
+  let monthGeocodes = 0;
+  for (const day of days.values()) {
+    monthPlaces += day.places;
+    monthGeocodes += day.geocodes;
+  }
+  return { monthPlaces, monthGeocodes, todayPlaces: days.get(month.today)?.places ?? 0 };
+}
diff --git a/src/services/gym-lookups.ts b/src/services/gym-lookups.ts
index 4d377b922343032e88a40a7f89eb2225427abdcd..07a7dcc2f610b6a8e33df0cd03f6f5e52a66017a 100644
--- a/src/services/gym-lookups.ts
+++ b/src/services/gym-lookups.ts
@@ -1,9 +1,12 @@
+import { lineOrder } from '../domain/geo/google-line.js';
+
 /**
- * The line of gyms that wait for Google (Matt, 2026-10-16): what `GymUpkeep` asks Google about
- * one at a time, a bounded number a day, kept in the database (`GymLookupRepository`) so that a
- * restart loses nothing and a city's first import (thousands of gyms) is worked through over
- * weeks within the free allowance. `MemoryGymLookups` is its twin, for tests and for an upkeep
- * built without a database.
+ * The line of gyms that wait for Google (Matt, 2026-10-16; plan 8W-6): what `GymUpkeep` asks
+ * Google about one at a time within a monthly budget, kept in the database
+ * (`GymLookupRepository`) so that a restart loses nothing and a city's first import (thousands of
+ * gyms) is worked through within the free allowance. The gyms go by the rank of their best region
+ * (`regionRanks`, `src/domain/geo/google-line.ts`), then by the time they were queued.
+ * `MemoryGymLookups` is its twin, for tests and for an upkeep built without a database.
  */
 
 /** A gym in the line: for its places, and with `address` its address first. */
@@ -12,54 +15,96 @@ export interface GymLookup {
   address: boolean;
 }
 
+/** A gym put in the line, with the rank of its best region (`NO_REGION_RANK` in none). */
+export interface QueuedGym extends GymLookup {
+  rank: number;
+}
+
+/** A gym that waits, as the line holds it. */
+export interface WaitingGym extends QueuedGym {
+  queuedAt: number;
+}
+
+/** Which gym `GymLookups.next` may give. */
+export interface NextGymOptions {
+  /** Only one that waits for its places alone. */
+  placesOnly?: boolean;
+  /** None of these gyms. */
+  except?: ReadonlySet<number>;
+}
+
 export interface GymLookups {
   /**
-   * Puts gyms in the line; a gym already in it keeps its place, and waits for its address too
-   * when either asks for it.
+   * Puts gyms in the line; a gym already in it keeps its place in time, takes the rank given,
+   * and waits for its address too when either asks for it.
    */
-  add(gyms: readonly GymLookup[], now: number): Promise<void>;
+  add(gyms: readonly QueuedGym[], now: number): Promise<void>;
   /**
-   * The gym that has waited longest (the lower id first among those queued at once); with
-   * `placesOnly`, of those that do not wait for their address (while Geocoding is refused).
+   * The first gym of the line: the highest rank, then the one that has waited longest, then the
+   * lower id; with `placesOnly`, of those that do not wait for their address (while Geocoding is
+   * refused or its budget used); never one of `except` (set aside after a failure).
    */
-  next(options?: { placesOnly?: boolean }): Promise<GymLookup | undefined>;
+  next(options?: NextGymOptions): Promise<GymLookup | undefined>;
   /** Sets whether a gym in the line still waits for its address (its places it always waits for). */
   setAddress(gymId: number, address: boolean): Promise<void>;
   /** Takes a gym out of the line. */
   remove(gymId: number): Promise<void>;
   /** How many gyms wait. */
   count(): Promise<number>;
-  /** How many gyms were asked about on a day (`YYYY-MM-DD` in the bot's time zone). */
-  used(day: string): Promise<number>;
-  /** Counts one more gym asked about on a day. */
-  use(day: string): Promise<void>;
+  /** Every gym that waits, in the order of the line. */
+  list(): Promise<WaitingGym[]>;
+  /** Sets the rank of the gyms named (those not in the line are left alone). */
+  setRanks(ranks: ReadonlyMap<number, number>): Promise<void>;
+  /**
+   * The gyms whose places Google answered at the place they are (`markAsked`), whatever it
+   * found: a gym it found nothing for has neither address nor places, as one never asked.
+   */
+  asked(): Promise<Set<number>>;
+  /** Notes that Google answered about a gym's places (`at`: when). */
+  markAsked(gymId: number, at: number): Promise<void>;
+  /** Forgets that a gym was asked about: it moved, and its new place was not. */
+  forgetAsked(gymId: number): Promise<void>;
+}
+
+/** The order of the line in memory (`lineOrder`): rank (higher first), time queued, id. */
+function gymLineOrder(a: WaitingGym, b: WaitingGym): number {
+  return lineOrder(
+    { kind: 'gym', rank: a.rank, queuedAt: a.queuedAt, key: String(a.gymId) },
+    { kind: 'gym', rank: b.rank, queuedAt: b.queuedAt, key: String(b.gymId) },
+  );
 }
 
 /** The line in memory: the database's twin. */
 export class MemoryGymLookups implements GymLookups {
-  /** By gym id: whether it waits for its address, and when it was queued. */
-  readonly rows = new Map<number, { address: boolean; queuedAt: number }>();
-  readonly days = new Map<string, number>();
+  /** By gym id: whether it waits for its address, its rank, and when it was queued. */
+  readonly rows = new Map<number, { address: boolean; rank: number; queuedAt: number }>();
+  /** By gym id: when Google answered about its places. */
+  readonly askedAt = new Map<number, number>();
 
-  add(gyms: readonly GymLookup[], now: number): Promise<void> {
-    for (const { gymId, address } of gyms) {
+  add(gyms: readonly QueuedGym[], now: number): Promise<void> {
+    for (const { gymId, address, rank } of gyms) {
       const kept = this.rows.get(gymId);
       this.rows.set(gymId, {
         address: address || (kept?.address ?? false),
+        rank,
         queuedAt: kept?.queuedAt ?? now,
       });
     }
     return Promise.resolve();
   }
 
-  next(options: { placesOnly?: boolean } = {}): Promise<GymLookup | undefined> {
-    let first: [number, { address: boolean; queuedAt: number }] | undefined;
-    for (const row of this.rows) {
-      if (options.placesOnly && row[1].address) continue;
-      if (!first || row[1].queuedAt < first[1].queuedAt) first = row;
-      else if (row[1].queuedAt === first[1].queuedAt && row[0] < first[0]) first = row;
+  private waiting(): WaitingGym[] {
+    return [...this.rows].map(([gymId, row]) => ({ gymId, ...row }));
+  }
+
+  next(options: NextGymOptions = {}): Promise<GymLookup | undefined> {
+    let first: WaitingGym | undefined;
+    for (const row of this.waiting()) {
+      if (options.placesOnly && row.address) continue;
+      if (options.except?.has(row.gymId)) continue;
+      if (!first || gymLineOrder(row, first) < 0) first = row;
     }
-    return Promise.resolve(first && { gymId: first[0], address: first[1].address });
+    return Promise.resolve(first && { gymId: first.gymId, address: first.address });
   }
 
   setAddress(gymId: number, address: boolean): Promise<void> {
@@ -77,12 +122,29 @@ export class MemoryGymLookups implements GymLookups {
     return Promise.resolve(this.rows.size);
   }
 
-  used(day: string): Promise<number> {
-    return Promise.resolve(this.days.get(day) ?? 0);
+  list(): Promise<WaitingGym[]> {
+    return Promise.resolve(this.waiting().sort(gymLineOrder));
+  }
+
+  setRanks(ranks: ReadonlyMap<number, number>): Promise<void> {
+    for (const [gymId, rank] of ranks) {
+      const kept = this.rows.get(gymId);
+      if (kept) this.rows.set(gymId, { ...kept, rank });
+    }
+    return Promise.resolve();
+  }
+
+  asked(): Promise<Set<number>> {
+    return Promise.resolve(new Set(this.askedAt.keys()));
+  }
+
+  markAsked(gymId: number, at: number): Promise<void> {
+    this.askedAt.set(gymId, at);
+    return Promise.resolve();
   }
 
-  use(day: string): Promise<void> {
-    this.days.set(day, (this.days.get(day) ?? 0) + 1);
+  forgetAsked(gymId: number): Promise<void> {
+    this.askedAt.delete(gymId);
     return Promise.resolve();
   }
 }
diff --git a/src/services/gym-upkeep.test.ts b/src/services/gym-upkeep.test.ts
index 810c8b1f158b7f8d01a06b138ad6877d3f77dca6..62b9cd85ae3577c35c864fc96f9a394793d9be09 100644
--- a/src/services/gym-upkeep.test.ts
+++ b/src/services/gym-upkeep.test.ts
@@ -7,9 +7,11 @@ import { testGyms } from '../../test/support/gyms.js';
 import { testMeetup, testRaid, testTrain } from '../../test/support/parties.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import { metresBetween } from '@pine/wayspot-core/distance';
+import { NO_REGION_RANK } from '../domain/geo/google-line.js';
 import type { Party, TrainParty } from '../domain/party/party.js';
+import { MemoryGoogleUse } from './google-use.js';
 import { MemoryGymLookups } from './gym-lookups.js';
-import { GymUpkeep, type GymUpkeepOptions } from './gym-upkeep.js';
+import { GymUpkeep, MAX_TIMER_MS, type GymUpkeepOptions } from './gym-upkeep.js';
 
 /** Gym 10 (Lakeview Trailhead) lies far from every other gym: what is put beside it is its nearest. */
 const LONELY = 10;
@@ -563,6 +565,9 @@ describe('GymUpkeep: answers that come late, and an API that is denied', () => {
 });
 
 describe('the line of gyms that wait for Google', () => {
+  /** Every question counted, of either kind, over every day. */
+  const counted = (use: MemoryGoogleUse): number => use.total('places') + use.total('geocode');
+
   /** Three gyms put in the line as an import puts them: each for its address and places. */
   async function threeQueued(options: Partial<Omit<GymUpkeepOptions, 'parties'>>) {
     const made = await upkeepWith(options);
@@ -577,40 +582,249 @@ describe('the line of gyms that wait for Google', () => {
     return { ...made, ids };
   }
 
-  it('asks about at most so many gyms a day, and the rest the next day', async () => {
-    let now = new Date('2026-10-16T12:00:00-04:00').getTime();
+  it('asks gyms until only the reserve of the month is left, then waits for the next month', async () => {
+    // Noon in California on October 16: the month resets on November 1 at midnight there.
+    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
     const lookups = new MemoryGymLookups();
-    const { upkeep, geo, ids, waits, timers } = await threeQueued({
+    const use = new MemoryGoogleUse();
+    const { upkeep, geo, waits, timers } = await threeQueued({
       lookups,
-      perDay: 2,
-      zone: 'America/New_York',
+      use,
+      budget: { places: 4, reserve: 2, geocodes: 100 },
       now: () => now,
     });
     const queued = await upkeep.waiting();
     expect(queued).toBeGreaterThan(2);
     await upkeep.flush();
-    // Two gyms of the line today (a gym is its address and its places, or its places alone).
-    expect(lookups.days.get('2026-10-16')).toBe(2);
+    // Two places questions above the reserve this month, each counted on its Pacific day.
+    expect(use.days.get('2026-10-16')?.places).toBe(2);
     expect(await upkeep.waiting()).toBe(queued - 2);
-    // The timer waits for the next day in the bot's time zone.
+    // The line waits for the month to reset, half a month away: it looks again in six hours.
     timers.splice(0);
     waits.splice(0);
     await upkeep.resume();
     timers.shift()?.();
     await background.settle();
     expect(timers.length).toBe(1);
-    expect(waits.at(-1)).toBe(12 * 3_600_000);
-    // Day after day, two at a time, until the line is empty.
-    // (Taking the line up also puts in it the invented gyms that have no places yet.)
-    for (let day = 0; day < 30 && (await upkeep.waiting()) > 0; day++) {
-      now += 24 * 3_600_000;
-      await upkeep.flush();
+    expect(waits.at(-1)).toBe(MAX_TIMER_MS);
+    // Late on the last day the timer is set for the reset itself.
+    now = new Date('2026-10-31T22:00:00-07:00').getTime();
+    timers.shift()?.();
+    await background.settle();
+    expect(waits.at(-1)).toBe(2 * 3_600_000);
+    now = new Date('2026-10-16T12:00:00-07:00').getTime();
+    // Nothing more this month, however many days pass.
+    now += 10 * 24 * 3_600_000;
+    await upkeep.flush();
+    expect(use.total('places')).toBe(2);
+    // November: two more.
+    now = new Date('2026-11-01T00:10:00-07:00').getTime();
+    await upkeep.flush();
+    expect(use.days.get('2026-11-01')?.places).toBe(2);
+    expect(geo.questions('places')).toHaveLength(4);
+  });
+
+  it('sets no timer beyond six hours while the month is used up: the turn looks again', async () => {
+    // Early on the 1st, the month's budget used: the reset is a month away, beyond what a timer
+    // of Node holds (2^31 - 1 ms, about 24.8 days), which would fire at once, again and again.
+    let now = new Date('2026-10-01T01:00:00-07:00').getTime();
+    const use = new MemoryGoogleUse();
+    const { upkeep, geo, waits, timers } = await threeQueued({
+      lookups: new MemoryGymLookups(),
+      use,
+      budget: { places: 0, reserve: 0, geocodes: 100 },
+      now: () => now,
+    });
+    await upkeep.flush();
+    timers.splice(0);
+    waits.splice(0);
+    await upkeep.resume();
+    for (let turn = 0; turn < 3; turn++) {
+      timers.shift()?.();
+      await background.settle();
+      now += MAX_TIMER_MS;
+    }
+    expect(waits.length).toBeGreaterThan(1);
+    expect(waits.every((ms) => ms <= MAX_TIMER_MS)).toBe(true);
+    expect(waits.at(-1)).toBe(MAX_TIMER_MS);
+    expect(geo.asked).toEqual([]);
+    expect(use.total('places')).toBe(0);
+  });
+
+  it('counts every question, by hand too, which may use the reserve and go past the budget', async () => {
+    const lookups = new MemoryGymLookups();
+    const use = new MemoryGoogleUse();
+    const { upkeep, geo, add } = await upkeepWith({
+      lookups,
+      use,
+      budget: { places: 1, reserve: 1, geocodes: 100 },
+    });
+    const id = await add(40.01, -80.09, 'One');
+    await lookups.add([{ gymId: id, address: true, rank: 0 }], 1);
+    // Only the reserve is left: the line asks nothing.
+    await upkeep.flush();
+    expect(geo.asked).toEqual([]);
+    // An admin asks: the reserve, then past the budget, each counted.
+    await upkeep.refresh(id);
+    await upkeep.refresh(id);
+    expect(use.total('places')).toBe(2);
+    expect(use.total('geocode')).toBe(2);
+    // A gym added by hand is asked about at once, and counted.
+    await upkeep.placed(await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon), {});
+    await upkeep.flush();
+    expect(use.total('places')).toBe(3);
+  });
+
+  it('asks no address once the month’s geocodes are used, and goes on with gyms for their places', async () => {
+    const lookups = new MemoryGymLookups();
+    const { upkeep, geo, gyms, add } = await upkeepWith({
+      lookups,
+      budget: { places: 100, reserve: 0, geocodes: 0 },
+    });
+    const one = await add(40.01, -80.09, 'One');
+    const two = await add(40.03, -80.09, 'Two');
+    await lookups.add([{ gymId: one, address: true, rank: 1 }], 1);
+    await lookups.add([{ gymId: two, address: false, rank: 0 }], 2);
+    await upkeep.flush();
+    expect(geo.questions('geocode')).toEqual([]);
+    expect(gyms.row(two)?.places).not.toBeNull();
+    // The gym that waits for its address keeps waiting, its places not asked without it.
+    expect(gyms.row(one)?.places).toBeNull();
+    expect(lookups.rows.get(one)?.address).toBe(true);
+  });
+
+  it('waits longer after each question in a row that did not answer, and asks those gyms the next day', async () => {
+    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
+    const lookups = new MemoryGymLookups();
+    const use = new MemoryGoogleUse();
+    // Three gyms alone, never asked: the start puts them in the line.
+    const alone = await gymDirectoryWith(new MemoryGyms([]));
+    const { upkeep, geo, timers, waits } = await upkeepWith({
+      ...alone,
+      lookups,
+      use,
+      now: () => now,
+    });
+    geo.failing = { places: 'failed' };
+    for (const [n, name] of ['One', 'Two', 'Three'].entries()) {
+      const made = await alone.gyms.create({ name, lat: 40.01 + n / 100, lon: -80.09 });
+      await alone.directory.refreshGym(made.id);
     }
+    await upkeep.resume();
+    expect(await upkeep.waiting()).toBe(3);
+    // The month's budget is not spent on gyms that fail every few seconds.
+    for (let turn = 0; turn < 3; turn++) {
+      timers.shift()?.();
+      await background.settle();
+    }
+    expect(use.total('places')).toBe(3);
+    expect(waits).toEqual([5_000, 10_000, 20_000, 40_000]);
+    // Each waits after every other gym now, whatever its region, until the line is ranked anew.
+    expect([...lookups.rows.values()].every((row) => row.rank < NO_REGION_RANK)).toBe(true);
+    // Google answers again: the gyms that failed today wait for tomorrow.
+    geo.failing = {};
+    await upkeep.flush();
+    expect(use.total('places')).toBe(3);
+    expect(await upkeep.waiting()).toBe(3);
+    now += 24 * 3_600_000;
+    await upkeep.flush();
     expect(await upkeep.waiting()).toBe(0);
-    expect(lookups.days.get('2026-10-17')).toBe(2);
-    const geocoded = geo.questions('geocode').map((question) => question.point.lat);
-    expect([...geocoded].sort()).toEqual([40.01, 40.02, 40.03]);
-    expect(ids).toHaveLength(3);
+  });
+
+  it('sets a gym whose question keeps failing aside until the next day, and goes on with the others', async () => {
+    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
+    const lookups = new MemoryGymLookups();
+    const { upkeep, geo, add } = await upkeepWith({ lookups, now: () => now });
+    const stuck = await add(40.01, -80.09, 'Stuck');
+    const fine = await add(40.03, -80.09, 'Fine');
+    const later = await add(40.05, -80.09, 'Later');
+    await lookups.add([{ gymId: stuck, address: false, rank: 1 }], 1);
+    await lookups.add([{ gymId: fine, address: false, rank: 0 }], 2);
+    let stuckAsked = 0;
+    const placesNear = geo.placesNear.bind(geo);
+    geo.placesNear = (point, radius) => {
+      if (point.lat !== 40.01) return placesNear(point, radius);
+      stuckAsked++;
+      return Promise.resolve({ ok: false, reason: 'failed' });
+    };
+    for (let turn = 0; turn < 4; turn++) await upkeep.flush();
+    expect(stuckAsked).toBe(1);
+    expect(lookups.rows.has(fine)).toBe(false);
+    expect(lookups.rows.has(stuck)).toBe(true);
+    // Only an answer notes a gym as asked: a start puts the stuck one in the line again.
+    expect(lookups.askedAt.has(stuck)).toBe(false);
+    expect(lookups.askedAt.has(fine)).toBe(true);
+    // A gym queued later that day is asked; the stuck one still waits.
+    await lookups.add([{ gymId: later, address: false, rank: 1 }], 3);
+    await upkeep.flush();
+    expect(lookups.rows.has(later)).toBe(false);
+    expect(stuckAsked).toBe(1);
+    // The next day it is asked once more.
+    now += 24 * 3_600_000;
+    for (let turn = 0; turn < 4; turn++) await upkeep.flush();
+    expect(stuckAsked).toBe(2);
+    expect(lookups.rows.has(stuck)).toBe(true);
+  });
+
+  it('leaves a gym moved during a turn that failed in its place in the line, and asks it again', async () => {
+    const lookups = new MemoryGymLookups();
+    const { upkeep, geo, add } = await upkeepWith({ lookups });
+    await upkeep.flush();
+    const id = await add(40.01, -80.09, 'One');
+    await lookups.add([{ gymId: id, address: false, rank: 0 }], 1);
+    geo.failing = { places: 'failed' };
+    let release: () => void = () => undefined;
+    geo.holdPlaces.push(
+      new Promise((resolve) => {
+        release = resolve;
+      }),
+    );
+    const flushing = upkeep.flush();
+    await background.settle();
+    expect(geo.failing.places).toBe('failed');
+    // Moved while the question that fails is on its way: it waits for its new place.
+    await upkeep.placed(id, { places: 'later' });
+    geo.failing = {};
+    release();
+    await flushing;
+    expect(lookups.rows.get(id)).toEqual({ address: true, rank: 0, queuedAt: 1 });
+    // Not set aside: its new place is asked about.
+    await upkeep.flush();
+    expect(lookups.rows.has(id)).toBe(false);
+    expect(lookups.askedAt.has(id)).toBe(true);
+  });
+
+  it('asks about the gyms of the best-ranked region first, the ranks worked out at the start', async () => {
+    const lookups = new MemoryGymLookups();
+    let refreshed = 0;
+    const busy = new Set<number>();
+    const { upkeep, geo, add } = await upkeepWith({
+      lookups,
+      ranks: {
+        refresh: () => {
+          refreshed++;
+          return Promise.resolve();
+        },
+        ofGym: (id) => (busy.has(id) ? 1 : 0),
+        ofWayspot: () => undefined,
+      },
+    });
+    const quiet = await add(40.01, -80.09, 'Quiet');
+    const lively = await add(40.03, -80.09, 'Lively');
+    busy.add(lively);
+    await upkeep.placed(quiet, { places: 'later' });
+    await upkeep.placed(lively, { places: 'later' });
+    expect((await lookups.list()).slice(0, 1).map((gym) => gym.gymId)).toEqual([lively]);
+    // The busy region quietens: at the start the line is ranked anew.
+    busy.clear();
+    busy.add(quiet);
+    await upkeep.resume();
+    expect(refreshed).toBe(1);
+    expect(lookups.rows.get(quiet)?.rank).toBe(1);
+    expect(lookups.rows.get(lively)?.rank).toBe(0);
+    await upkeep.flush();
+    const asked = geo.questions('geocode').map((question) => question.point.lat);
+    expect(asked.indexOf(40.01)).toBeLessThan(asked.indexOf(40.03));
   });
 
   it('keeps a gym in the line that was put in it again while it was asked about', async () => {
@@ -622,7 +836,7 @@ describe('the line of gyms that wait for Google', () => {
     await upkeep.flush();
     lookups.rows.clear();
     geo.asked.length = 0;
-    await lookups.add([{ gymId: id, address: false }], 1);
+    await lookups.add([{ gymId: id, address: false, rank: 0 }], 1);
     let release: () => void = () => undefined;
     geo.holdPlaces.push(
       new Promise((resolve) => {
@@ -648,49 +862,60 @@ describe('the line of gyms that wait for Google', () => {
 
   it('counts only the gyms Google was asked about, and puts one whose question failed at the end', async () => {
     const lookups = new MemoryGymLookups();
-    const { upkeep, geo, ids } = await threeQueued({ lookups, perDay: 100 });
+    const use = new MemoryGoogleUse();
+    // Two questions' worth: the failing gyms are not asked again and again.
+    const { upkeep, geo, ids } = await threeQueued({
+      lookups,
+      use,
+      budget: { places: 2, reserve: 0, geocodes: 100 },
+    });
     geo.failing = { geocode: 'denied', places: 'denied' };
     await upkeep.flush();
-    expect([...lookups.days.values()].reduce((a, b) => a + b, 0)).toBe(0);
+    expect(counted(use)).toBe(0);
     geo.failing = { places: 'failed' };
     const first = await lookups.next();
     await upkeep.flush();
     // Failed questions are counted (Google was asked) and their gyms wait at the end, not gone.
-    expect([...lookups.days.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
+    expect(counted(use)).toBeGreaterThan(0);
     expect(lookups.rows.has(first!.gymId)).toBe(true);
     expect(ids).toHaveLength(3);
   });
 
-  /** The total of gyms counted, over every day. */
-  const counted = (lookups: MemoryGymLookups): number =>
-    [...lookups.days.values()].reduce((a, b) => a + b, 0);
-
   it('keeps a gym in the line for its address when only its places came', async () => {
     const lookups = new MemoryGymLookups();
-    const { upkeep, geo, gyms, add } = await upkeepWith({ lookups, perDay: 1 });
+    const use = new MemoryGoogleUse();
+    const { upkeep, geo, gyms, add } = await upkeepWith({
+      lookups,
+      use,
+      // One gym's worth: the gym is not asked again and again for the address that fails.
+      budget: { places: 1, reserve: 0, geocodes: 100 },
+    });
     const id = await add(40.01, -80.09, 'One');
-    await lookups.add([{ gymId: id, address: true }], 1);
+    await lookups.add([{ gymId: id, address: true, rank: 0 }], 1);
     geo.failing = { geocode: 'failed' };
     await upkeep.flush();
     expect(gyms.row(id)?.places).not.toBeNull();
     expect(gyms.row(id)?.geodata).toBeNull();
     expect(lookups.rows.get(id)?.address).toBe(true);
-    expect(counted(lookups)).toBe(1);
+    // Each question counts by itself: the failed geocode reached Google too.
+    expect(use.total('places')).toBe(1);
+    expect(use.total('geocode')).toBe(1);
   });
 
   it('counts a gym whose address was asked about though its places were refused', async () => {
     const lookups = new MemoryGymLookups();
-    const { upkeep, geo, gyms, add } = await upkeepWith({ lookups });
+    const use = new MemoryGoogleUse();
+    const { upkeep, geo, gyms, add } = await upkeepWith({ lookups, use });
     const id = await add(40.01, -80.09, 'One');
-    await lookups.add([{ gymId: id, address: true }], 1);
+    await lookups.add([{ gymId: id, address: true, rank: 0 }], 1);
     geo.failing = { places: 'denied' };
     await upkeep.flush();
     expect(gyms.row(id)?.geodata).not.toBeNull();
     expect(lookups.rows.get(id)?.address).toBe(false);
-    expect(counted(lookups)).toBe(1);
+    expect(counted(use)).toBe(1);
     // Neither came: the gym still waits for its address.
     const other = await add(40.02, -80.09, 'Two');
-    await lookups.add([{ gymId: other, address: true }], 2);
+    await lookups.add([{ gymId: other, address: true, rank: 0 }], 2);
     geo.failing = { geocode: 'failed', places: 'denied' };
     await upkeep.flush();
     expect(lookups.rows.get(other)?.address).toBe(true);
@@ -698,14 +923,16 @@ describe('the line of gyms that wait for Google', () => {
 
   it('asks no places of a gym that waits for its address while Geocoding is refused, and goes on with the others', async () => {
     const lookups = new MemoryGymLookups();
+    const use = new MemoryGoogleUse();
     let clock = 1_000_000;
     const { upkeep, geo, gyms, add } = await upkeepWith({
+      use,
       lookups,
       placesEveryMs: 5_000,
       now: () => clock,
     });
     const id = await add(40.01, -80.09, 'One');
-    await lookups.add([{ gymId: id, address: true }], 1);
+    await lookups.add([{ gymId: id, address: true, rank: 0 }], 1);
     geo.failing = { geocode: 'denied' };
     geo.retryInMs = 1_800_000;
     await upkeep.flush();
@@ -713,10 +940,10 @@ describe('the line of gyms that wait for Google', () => {
     expect(geo.questions('places')).toEqual([]);
     expect(gyms.row(id)?.places).toBeNull();
     expect(lookups.rows.get(id)?.address).toBe(true);
-    expect(counted(lookups)).toBe(0);
+    expect(counted(use)).toBe(0);
     // A gym behind it that waits for its places alone gets them meanwhile.
     const two = await add(40.03, -80.09, 'Two');
-    await lookups.add([{ gymId: two, address: false }], 2);
+    await lookups.add([{ gymId: two, address: false, rank: 0 }], 2);
     await upkeep.flush();
     expect(gyms.row(two)?.places).not.toBeNull();
     expect(geo.questions('places').map((question) => question.point.lat)).toEqual([40.03]);
@@ -744,7 +971,7 @@ describe('the line of gyms that wait for Google', () => {
     const lookups = new MemoryGymLookups();
     const { upkeep, geo, add } = await upkeepWith({ lookups });
     const id = await add(40.01, -80.09, 'One');
-    await lookups.add([{ gymId: id, address: true }], 1);
+    await lookups.add([{ gymId: id, address: true, rank: 0 }], 1);
     geo.failing = { places: 'denied' };
     let release: () => void = () => undefined;
     geo.holdPlaces.push(
@@ -764,11 +991,12 @@ describe('the line of gyms that wait for Google', () => {
 
   it('does not count a gym that was gone before Google was asked', async () => {
     const lookups = new MemoryGymLookups();
-    const { upkeep, geo } = await upkeepWith({ lookups });
-    await lookups.add([{ gymId: 999, address: true }], 1);
+    const use = new MemoryGoogleUse();
+    const { upkeep, geo } = await upkeepWith({ lookups, use });
+    await lookups.add([{ gymId: 999, address: true, rank: 0 }], 1);
     await upkeep.flush();
     expect(geo.asked).toEqual([]);
-    expect(counted(lookups)).toBe(0);
+    expect(counted(use)).toBe(0);
     expect(lookups.rows.has(999)).toBe(false);
   });
 
@@ -777,23 +1005,23 @@ describe('the line of gyms that wait for Google', () => {
     const { upkeep, geo, add, directory } = await upkeepWith({ lookups });
     await upkeep.flush();
     const id = await add(40.01, -80.09, 'One');
-    await lookups.add([{ gymId: id, address: false }], 1);
+    await lookups.add([{ gymId: id, address: false, rank: 0 }], 1);
     geo.asked.length = 0;
-    // The day's count waits until the gym was put in the line again.
+    // Taking it out of the line waits until the gym was put in the line again.
     let release: () => void = () => undefined;
     const held = new Promise<void>((resolve) => {
       release = resolve;
     });
-    let using = false;
-    const use = lookups.use.bind(lookups);
-    lookups.use = async (day) => {
-      using = true;
+    let removing = false;
+    const remove = lookups.remove.bind(lookups);
+    lookups.remove = async (gymId) => {
+      removing = true;
       await held;
-      return use(day);
+      return remove(gymId);
     };
     const flushing = upkeep.flush();
     await background.settle();
-    expect(using).toBe(true);
+    expect(removing).toBe(true);
     await upkeep.placed(id, { places: 'later' });
     release();
     await flushing;
@@ -805,26 +1033,56 @@ describe('the line of gyms that wait for Google', () => {
     expect(asked).toHaveLength(2);
   });
 
-  it('puts in the line, when it is taken up, the gyms that lack an address or places', async () => {
+  it('puts in the line, when it is taken up, the gyms that lack places', async () => {
     const lookups = new MemoryGymLookups();
     const { upkeep, gyms, directory } = await upkeepWith({
       lookups,
       setTimer: () => () => undefined,
     });
-    const lacking = directory.all().filter((gym) => gym.geodata === null || gym.places === null);
+    const lacking = directory.all().filter((gym) => gym.places === null);
     await upkeep.resume();
     expect(await upkeep.waiting()).toBe(lacking.length);
     const bare = await gyms.create({ name: 'Bare', lat: 40.05, lon: -80.05 });
     await directory.refreshGym(bare.id);
+    // A gym of before with places counts as asked, though it has no address.
+    const placed = await gyms.create({ name: 'Placed', lat: 40.051, lon: -80.05 });
+    await gyms.update(placed.id, { places: 'Corner Bakery' });
+    await directory.refreshGym(placed.id);
     await upkeep.resume();
     expect(lookups.rows.get(bare.id)?.address).toBe(true);
+    expect(lookups.rows.has(placed.id)).toBe(false);
+  });
+
+  it('puts in the line at a start no gym Google found nothing for, until it moves', async () => {
+    const lookups = new MemoryGymLookups();
+    const { upkeep, gyms, geo, directory, add } = await upkeepWith({
+      lookups,
+      setTimer: () => () => undefined,
+    });
+    const id = await add(40.01, -80.09, 'Nowhere');
+    geo.addresses.set('40.01,-80.09', {});
+    geo.placesAt.set('40.01,-80.09', []);
+    await upkeep.placed(id, { places: 'later' });
+    await upkeep.flush();
+    // Asked, and nothing found: the gym looks as one never asked.
+    expect(gyms.row(id)).toMatchObject({ geodata: null, places: null });
+    expect(lookups.rows.has(id)).toBe(false);
+    await upkeep.resume();
+    expect(lookups.rows.has(id)).toBe(false);
+    // Moved, and its place in the line lost: the next start puts it in again.
+    await gyms.update(id, { lat: 40.011 });
+    await directory.refreshGym(id);
+    await upkeep.placed(id, { places: 'later' });
+    lookups.rows.delete(id);
+    await upkeep.resume();
+    expect(lookups.rows.get(id)?.address).toBe(true);
   });
 
   it('takes a gym asked about by hand out of the line', async () => {
     const lookups = new MemoryGymLookups();
     const { upkeep, add } = await upkeepWith({ lookups });
     const id = await add(40.01, -80.09, 'One');
-    await lookups.add([{ gymId: id, address: true }], 1);
+    await lookups.add([{ gymId: id, address: true, rank: 0 }], 1);
     await upkeep.refresh(id);
     expect(lookups.rows.has(id)).toBe(false);
   });
diff --git a/src/services/gym-upkeep.ts b/src/services/gym-upkeep.ts
index d8dc7d09008797104a58674a33e0757af50bdc47..6121c0a098d46f9d033404314d5ffe0e9c909e0a 100644
--- a/src/services/gym-upkeep.ts
+++ b/src/services/gym-upkeep.ts
@@ -1,5 +1,4 @@
 import { gymStop, hasStop } from '../domain/party/stops.js';
-import { DateTime } from 'luxon';
 import type { Gym, GymStorage } from '../db/repositories/gym-repository.js';
 import { metresBetween } from '@pine/wayspot-core/distance';
 import { geodataJson, placesRadius, placesText } from '../domain/geo/google.js';
@@ -7,6 +6,19 @@ import { nearestGymChanges, type NearestEvent } from '../domain/gyms/nearest.js'
 import { isMeetup, isRaid, isTrain, type Party } from '../domain/party/party.js';
 import type { Logger } from '../log.js';
 import type { GeoFailure, GeoGateway } from './geo-gateway.js';
+import {
+  googleMonth,
+  lineAllowance,
+  NO_REGION_RANK,
+  type GoogleBudget,
+} from '../domain/geo/google-line.js';
+import {
+  MemoryGoogleUse,
+  usedThisMonth,
+  type GoogleQuestion,
+  type GoogleUse,
+} from './google-use.js';
+import type { GoogleRanks } from './google-ranks.js';
 import { MemoryGymLookups, type GymLookups } from './gym-lookups.js';
 
 /**
@@ -24,12 +36,34 @@ function reachedGoogle(outcome: FetchOutcome | undefined): boolean {
 const MANY_NEAREST = 10;
 
 /**
- * How many gyms of the line Google is asked about a day unless the settings say otherwise
- * (`googleLookupsPerDay`; Matt, 2026-10-16): a gym is a Places search (Nearby Search Pro, 5,000
- * free a month) and, without an address, a Geocoding (10,000 free), so 100 a day is about 3,000
- * of each a month, with room for gyms added and moved by hand.
+ * The monthly budget unless the settings say otherwise (plan 8W-6; `googleLookupsPerMonth`,
+ * `googleLookupsReserve`, `googleGeocodesPerMonth`): Google's free amounts are 5,000 Places
+ * searches (Nearby Search Pro) and 10,000 Geocodings a month, less a margin; the line leaves 500
+ * places questions for gyms added and moved by hand and `/gym refresh`.
  */
-export const DEFAULT_LOOKUPS_PER_DAY = 100;
+export const DEFAULT_GOOGLE_BUDGET: GoogleBudget = { places: 4_500, reserve: 500, geocodes: 9_000 };
+
+/** What the line needs of the ranks of places (`GoogleRanks`); without it every place ranks 0. */
+export type LineRanks = Pick<GoogleRanks, 'refresh' | 'ofGym' | 'ofWayspot'>;
+
+/** The rank of a gym asked again for what did not come: after every other gym, until reranked. */
+const RETRY_RANK = NO_REGION_RANK - 1;
+
+/** The longest the line waits after turns whose questions did not answer. */
+const MAX_RETRY_WAIT_MS = 3_600_000;
+
+/**
+ * The longest timer the line sets: a longer wait (until the month resets) is a turn every six
+ * hours that finds nothing to ask and sets the next. Node holds a timer of at most 2^31 - 1 ms
+ * (about 24.8 days) and fires a longer one at once, which would ask the database again and again.
+ */
+export const MAX_TIMER_MS = 6 * 3_600_000;
+
+const SAME_RANK: LineRanks = {
+  refresh: () => Promise.resolve(),
+  ofGym: () => 0,
+  ofWayspot: () => 0,
+};
 
 /** What `refresh` got for a gym, which is given as it is afterwards. */
 export interface GymRefresh {
@@ -66,10 +100,12 @@ export interface GymUpkeepOptions {
   setTimer?: (run: () => void, ms: number) => () => void;
   /** The line (`GymLookupRepository` in the bot); default one in memory. */
   lookups?: GymLookups;
-  /** How many gyms of the line are asked about a day (`DEFAULT_LOOKUPS_PER_DAY`). */
-  perDay?: number;
-  /** The time zone a day is counted in (`settings.timezone`); default UTC. */
-  zone?: string;
+  /** The questions asked of Google per day (`GoogleUseRepository` in the bot); default in memory. */
+  use?: GoogleUse;
+  /** The monthly budget (`DEFAULT_GOOGLE_BUDGET`). */
+  budget?: GoogleBudget;
+  /** The ranks of the places of the line (`GoogleRanks` in the bot); default all alike. */
+  ranks?: LineRanks;
   /** Default `Date.now`. */
   now?: () => number;
 }
@@ -83,8 +119,10 @@ export interface GymUpkeepOptions {
  * Nothing waits for Google. A gym that was added or moved by hand is asked about at once, on
  * the side; the gyms whose nearest gym changed with it, and what a Wayfarer import adds and
  * moves, wait in a line (the circle places are looked for in is half the way to the nearest
- * gym), one every few seconds and at most `perDay` a day (Matt, 2026-10-16: an import of a city
- * would otherwise ask thousands of questions at once). The line is kept in the database
+ * gym), one every few seconds, the gyms of the best-ranked region first (`LineRanks`), within a
+ * monthly budget (plan 8W-6, `lineAllowance`: the line stops when only the reserve is left;
+ * every question that reaches Google counts, by hand too, and those by hand may use the reserve
+ * and go past the budget). The line is kept in the database
  * (`GymLookups`): a restart loses nothing, and `resume` takes it up at start. Only tests and the
  * shutdown wait for it (`flush`, `stop`). While Google refuses the key for places, the line
  * keeps its gyms and looks again when the refusal is over.
@@ -103,8 +141,9 @@ export class GymUpkeep {
   private readonly setTimer: (run: () => void, ms: number) => () => void;
   /** The gyms that wait for Google (`GymLookups`). */
   private readonly lookups: GymLookups;
-  private readonly perDay: number;
-  private readonly zone: string;
+  private readonly use: GoogleUse;
+  private readonly budget: GoogleBudget;
+  private readonly ranks: LineRanks;
   private readonly now: () => number;
   private readonly running = new Set<Promise<unknown>>();
   /**
@@ -129,13 +168,24 @@ export class GymUpkeep {
    * line asks only about the gyms that wait for their places alone.
    */
   private geocodeRefusedUntil = 0;
+  /** The Pacific day the line was last ranked on (`rerank`). */
+  private rankedDay = '';
+  /** The turns in a row whose questions did not answer: the line waits longer after each. */
+  private misses = 0;
+  /**
+   * The gyms whose question did not answer today: the line passes over them until the next
+   * Pacific day (`rerank`), so that one gym that keeps failing holds up neither the others nor
+   * the budget; one put in the line anew (moved) is asked again.
+   */
+  private readonly asideGyms = new Set<number>();
   private stopped = false;
 
   constructor(private readonly options: GymUpkeepOptions) {
     this.placesEveryMs = options.placesEveryMs ?? 5_000;
     this.lookups = options.lookups ?? new MemoryGymLookups();
-    this.perDay = options.perDay ?? DEFAULT_LOOKUPS_PER_DAY;
-    this.zone = options.zone ?? 'UTC';
+    this.use = options.use ?? new MemoryGoogleUse();
+    this.budget = options.budget ?? DEFAULT_GOOGLE_BUDGET;
+    this.ranks = options.ranks ?? SAME_RANK;
     this.now = options.now ?? Date.now;
     this.setTimer =
       options.setTimer ??
@@ -160,19 +210,34 @@ export class GymUpkeep {
 
   /**
    * Takes up the line kept from before a restart (at start), and puts in it the gyms that have
-   * no address or no places and are not in it (Matt, 2026-10-16: "the upkeep finds them"):
-   * gyms added while there was no key, or whose place in the line could not be written. A gym
-   * Google knows nothing about is asked about again after every start, within the day's limit.
+   * no places and were never asked about where they are (`GymLookups.asked`; Matt, 2026-10-16:
+   * "the upkeep finds them"): gyms added while there was no key, or whose place in the line
+   * could not be written; those without an address for it too. A gym Google found nothing for
+   * was asked, and is not asked again at every start; a gym of before with places counts as
+   * asked. The ranks are read first, and the line ranked anew by them (`rerank`).
    */
   async resume(): Promise<void> {
     if (this.fetches && !this.stopped) {
-      const all = this.options.directory.all();
-      const address = all.filter((gym) => gym.geodata === null).map((gym) => gym.id);
-      const places = all
-        .filter((gym) => gym.geodata !== null && gym.places === null)
-        .map((gym) => gym.id);
-      await this.queueGyms(address, true);
-      await this.queueGyms(places, false);
+      await this.rerank();
+      let asked: Set<number> | undefined;
+      try {
+        asked = await this.lookups.asked();
+      } catch (err) {
+        this.options.log.warn({ err }, 'could not read which gyms Google was asked about');
+      }
+      if (asked) {
+        const never = this.options.directory
+          .all()
+          .filter((gym) => gym.places === null && !asked.has(gym.id));
+        await this.queueGyms(
+          never.filter((gym) => gym.geodata === null).map((gym) => gym.id),
+          true,
+        );
+        await this.queueGyms(
+          never.filter((gym) => gym.geodata !== null).map((gym) => gym.id),
+          false,
+        );
+      }
     }
     this.schedule();
   }
@@ -235,6 +300,10 @@ export class GymUpkeep {
     // Whatever is on its way about this gym was asked about another place.
     this.outdate('address', id);
     this.outdate('places', id);
+    // Its new place was never asked: a start puts it in the line if its place there is lost.
+    await this.lookups.forgetAsked(id).catch((err: unknown) => {
+      this.options.log.warn({ err, gym: id }, 'could not forget that Google was asked about a gym');
+    });
     const changed = await this.settle({ placed: id });
     // The gyms that have this one as their nearest: their circle follows it, also when a move
     // left it their nearest.
@@ -354,6 +423,7 @@ export class GymUpkeep {
     if (!asked) return undefined;
     const wanted = this.question('address', id);
     const answer = await geo.reverseGeocode({ lat: asked.lat, lon: asked.lon });
+    if (answer.ok || reachedGoogle(answer.reason)) await this.count('geocode');
     const gym = directory.get(id);
     if (!gym) return undefined;
     if (!answer.ok) {
@@ -380,6 +450,7 @@ export class GymUpkeep {
     const radius = placesRadius(nearest && metresBetween(asked, nearest));
     const wanted = this.question('places', id);
     const answer = await geo.placesNear({ lat: asked.lat, lon: asked.lon }, radius);
+    if (answer.ok || reachedGoogle(answer.reason)) await this.count('places');
     const gym = directory.get(id);
     if (!gym) return undefined;
     if (!answer.ok) {
@@ -388,10 +459,17 @@ export class GymUpkeep {
     }
     if (!wanted()) return 'unchanged';
     const places = placesText(answer.value);
-    if (places === gym.places) return 'unchanged';
-    await gyms.update(id, { places });
-    await directory.refreshGym(id);
-    return 'updated';
+    let outcome: FetchOutcome = 'unchanged';
+    if (places !== gym.places) {
+      await gyms.update(id, { places });
+      await directory.refreshGym(id);
+      outcome = 'updated';
+    }
+    // Asked at this place, whatever Google found: a start does not put it in the line again.
+    await this.lookups.markAsked(id, this.now()).catch((err: unknown) => {
+      this.options.log.warn({ err, gym: id }, 'could not note that Google was asked about a gym');
+    });
+    return outcome;
   }
 
   private queuePlaces(ids: readonly number[]): Promise<void> {
@@ -405,6 +483,8 @@ export class GymUpkeep {
    */
   private async queueGyms(ids: readonly number[], address: boolean): Promise<void> {
     if (this.stopped || !this.fetches || ids.length === 0) return;
+    // Put in the line anew (moved, another nearest gym): asked again, set aside or not.
+    for (const id of ids) this.asideGyms.delete(id);
     const { asking } = this;
     if (asking && ids.includes(asking.gymId)) {
       asking.requeued = true;
@@ -412,7 +492,7 @@ export class GymUpkeep {
     }
     try {
       await this.lookups.add(
-        ids.map((gymId) => ({ gymId, address })),
+        ids.map((gymId) => this.queued(gymId, address)),
         this.now(),
       );
     } catch (err) {
@@ -422,8 +502,54 @@ export class GymUpkeep {
     this.schedule();
   }
 
+  /** A gym as the line takes it, with the rank of its best region. */
+  private queued(
+    gymId: number,
+    address: boolean,
+  ): { gymId: number; address: boolean; rank: number } {
+    return { gymId, address, rank: this.ranks.ofGym(gymId) };
+  }
+
+  /** Counts a question that reached Google, on its Pacific day. Never rejects. */
+  private async count(question: GoogleQuestion): Promise<void> {
+    try {
+      await this.use.use(googleMonth(this.now()).today, question);
+    } catch (err) {
+      this.options.log.warn({ err, question }, 'could not count a question asked of Google');
+    }
+  }
+
+  /**
+   * Reads the ranks of the regions anew and ranks the line by them: at start, and at the first
+   * turn of each Pacific day (the rank is not worked out per question). Never rejects: what
+   * cannot be read leaves the ranks as they were.
+   */
+  private async rerank(): Promise<void> {
+    const { log } = this.options;
+    this.rankedDay = googleMonth(this.now()).today;
+    // A new day: what failed before is asked again, in its place by its rank.
+    this.asideGyms.clear();
+    try {
+      await this.ranks.refresh();
+    } catch (err) {
+      log.warn({ err }, 'could not read the raids of the regions: the line keeps its order');
+      return;
+    }
+    try {
+      const changed = new Map<number, number>();
+      for (const gym of await this.lookups.list()) {
+        const rank = this.ranks.ofGym(gym.gymId);
+        if (rank !== gym.rank) changed.set(gym.gymId, rank);
+      }
+      await this.lookups.setRanks(changed);
+    } catch (err) {
+      log.warn({ err }, 'could not rank the line of gyms that wait for Google anew');
+    }
+  }
+
   /**
-   * Sets the timer for the next gym of the line: after the usual pause, or after `waitMs`. The
+   * Sets the timer for the next gym of the line: after the usual pause, or after `waitMs`, but
+   * never longer than `MAX_TIMER_MS` (the turn then finds nothing to ask and sets the next). The
    * line itself says whether anything waits: a timer that finds it empty sets no other.
    */
   private schedule(waitMs = this.placesEveryMs): void {
@@ -436,31 +562,21 @@ export class GymUpkeep {
           if (next !== 'empty') this.schedule(next);
         });
       },
-      Math.max(waitMs, this.placesEveryMs),
+      Math.min(MAX_TIMER_MS, Math.max(waitMs, this.placesEveryMs)),
     );
   }
 
-  /** The day a moment is in, in the bot's time zone (`YYYY-MM-DD`). */
-  private dayOf(now: number): string {
-    return DateTime.fromMillis(now, { zone: this.zone }).toISODate() ?? 'unknown';
-  }
-
-  /** How long until the next day begins, in the bot's time zone. */
-  private untilTomorrow(now: number): number {
-    const today = DateTime.fromMillis(now, { zone: this.zone });
-    return Math.max(this.placesEveryMs, today.plus({ days: 1 }).startOf('day').toMillis() - now);
-  }
-
   /**
-   * Asks about the gym that has waited longest, unless `perDay` gyms were asked about today.
-   * Never rejects. Answers `empty` when nothing waits, how long to wait when the day's gyms are
-   * done (until tomorrow) or Google refuses the key (as long as the refusal lasts; the gym stays
-   * the first of the line; while only Geocoding is refused, gyms that want their places alone are
-   * still asked about, and the line waits only when none is left), `empty` too once the last gym was asked about, and undefined when
-   * more wait. A gym is counted once Google was asked about it, by either question (not one gone
-   * before the first); one whose places failed, or whose address did not come, goes to the end
-   * of the line (still waiting for its address), and one put in the line again before its turn
-   * was written down stays in it.
+   * Asks about the first gym of the line, as the budget allows (`lineAllowance`). Never rejects.
+   * Answers `empty` when nothing waits, how long to wait when nothing may be asked now (until the
+   * month resets once only the reserve is left; while Geocoding is refused or the month's
+   * geocodes are used, the gyms that want their places alone are still asked about, and the line
+   * waits only when none is left: as long as the refusal lasts, or until the month resets), as
+   * long as Google refuses the key for places (the gym stays the first of the line), `empty` too
+   * once the last gym was asked about, and undefined when more wait. Each question that reached
+   * Google is counted by itself (`count`); a gym whose places failed, or whose address did not
+   * come, goes to the end of the line (still waiting for its address), and one put in the line
+   * again before its turn was written down stays in it.
    */
   private next(): Promise<number | 'empty' | undefined> {
     const run = this.turn.then(() => this.nextNow());
@@ -472,16 +588,27 @@ export class GymUpkeep {
     const { log } = this.options;
     let first;
     try {
-      // While Geocoding is refused, the gyms that wait for their address wait; the others go on.
-      const refusedFor = this.geocodeRefusedUntil - this.now();
-      first = await this.lookups.next(refusedFor > 0 ? { placesOnly: true } : {});
+      const now = this.now();
+      if (googleMonth(now).today !== this.rankedDay) await this.rerank();
+      const allowance = lineAllowance(now, await usedThisMonth(this.use, now), this.budget);
+      // While Geocoding is refused, or its budget used, the gyms that wait for their address
+      // wait; the others go on.
+      const refusedFor = this.geocodeRefusedUntil - now;
+      const placesOnly = refusedFor > 0 || !allowance.geocode;
+      first = allowance.gyms
+        ? await this.lookups.next({ placesOnly, except: this.asideGyms })
+        : undefined;
       if (!first) {
-        if (refusedFor > 0 && (await this.lookups.count()) > 0) return refusedFor;
-        return 'empty';
+        if ((await this.lookups.count()) === 0) return 'empty';
+        if (!allowance.gyms) return allowance.waitMs;
+        const month = googleMonth(now);
+        return Math.min(
+          // Only gyms that wait for their address are left.
+          refusedFor > 0 && allowance.geocode ? refusedFor : month.nextReset - now,
+          // What failed today is asked again tomorrow.
+          this.asideGyms.size > 0 ? month.tomorrow - now : Number.POSITIVE_INFINITY,
+        );
       }
-      const now = this.now();
-      const day = this.dayOf(now);
-      if ((await this.lookups.used(day)) >= this.perDay) return this.untilTomorrow(now);
     } catch (err) {
       log.warn({ err }, 'could not read the line of gyms that wait for Google');
       return this.placesEveryMs;
@@ -509,11 +636,6 @@ export class GymUpkeep {
       const gone = !thrown && geodata !== 'denied' && places === undefined;
       // Its address still to come: the geocode was not answered (failed, refused, not asked).
       const wantsAddress = address && geodata !== 'updated' && geodata !== 'unchanged';
-      // Counted when Google was asked, by either question: a refused key or none asks nothing,
-      // and a gym gone before the first question asked nothing either.
-      if (thrown || reachedGoogle(geodata) || reachedGoogle(places)) {
-        await this.lookups.use(this.dayOf(this.now()));
-      }
       // Geocoding refused: the gym stays where it is in the line, waiting for its address, and
       // the line goes on with the gyms that wait for their places alone (`geocodeRefusedUntil`).
       if (geodata === 'denied') return undefined;
@@ -526,16 +648,33 @@ export class GymUpkeep {
         return this.deniedForMs;
       }
       if (!gone && (thrown || places === 'failed' || wantsAddress)) {
-        // Asked again later, for what did not come: to the end of the line.
-        await this.lookups.remove(gymId);
-        await this.lookups.add([{ gymId, address: wantsAddress || asking.address }], this.now());
+        // Asked again for what did not come, the next day (`asideGyms`, which the line passes
+        // over meanwhile; its row waits after every other gym until the line is ranked anew,
+        // `RETRY_RANK`); and the line waits longer after each such turn in a row, so that a
+        // Google that keeps failing does not take the month's budget a few seconds at a time
+        // (the budget allows the gyms the whole month at once). One put in the line again
+        // meanwhile (moved) is neither set aside nor put behind: its row stays as it was put
+        // in the line, and waits for the address that did not come too.
+        if (asking.requeued) {
+          await this.lookups.add([this.queued(gymId, wantsAddress)], this.now());
+        } else {
+          this.asideGyms.add(gymId);
+          await this.lookups.remove(gymId);
+          await this.lookups.add(
+            [{ gymId, address: wantsAddress || asking.address, rank: RETRY_RANK }],
+            this.now(),
+          );
+        }
+        this.misses++;
+        return Math.min(MAX_RETRY_WAIT_MS, this.placesEveryMs * 2 ** this.misses);
       } else if (!asking.requeued) {
         await this.lookups.remove(gymId);
         // Put in the line again while it was being taken out: the newer request stays.
         if (asking.requeued) {
-          await this.lookups.add([{ gymId, address: asking.address }], this.now());
+          await this.lookups.add([this.queued(gymId, asking.address)], this.now());
         }
       }
+      this.misses = 0;
       // The last one: no timer is left for an empty line.
       if ((await this.lookups.count()) === 0) return 'empty';
     } catch (err) {
diff --git a/src/services/wayspot-lookups.test.ts b/src/services/wayspot-lookups.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..79fb86350a409bc44cdd33929fa48badff2e20d8
--- /dev/null
+++ b/src/services/wayspot-lookups.test.ts
@@ -0,0 +1,7 @@
+import { describe } from 'vitest';
+import { wayspotLookupCases } from '../../test/support/wayspot-lookup-cases.js';
+import { MemoryWayspotLookups } from './wayspot-lookups.js';
+
+describe('MemoryWayspotLookups', () => {
+  wayspotLookupCases(() => Promise.resolve(new MemoryWayspotLookups()));
+});
diff --git a/src/services/wayspot-lookups.ts b/src/services/wayspot-lookups.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7af3d29da073b46fdcf4791bb44b7caa9f099287
--- /dev/null
+++ b/src/services/wayspot-lookups.ts
@@ -0,0 +1,109 @@
+import { lineOrder } from '../domain/geo/google-line.js';
+
+/**
+ * The PokéStops and Power Spots that wait for Google, and the places it gave around them (plan
+ * 8W-6): they join the gyms' line after every gym (`GymUpkeep`), PokéStops before Power Spots,
+ * each by the rank of its best region, then by the time it was queued. Their places are kept
+ * apart from the Wayfarer import's writes, with the point and kind they were asked for, so that a
+ * Wayspot moved or of another kind waits again. `WayspotLookupRepository` keeps them in the
+ * database; `MemoryWayspotLookups` is its twin (both run `wayspotLookupCases`).
+ */
+
+/** The kinds of Wayspot the line asks about. */
+export type WayspotLineKind = 'stop' | 'powerspot';
+
+/** A Wayspot put in the line: its id (a Wayfarer id or `pine-<id>`), kind and rank. */
+export interface QueuedWayspot {
+  wayspotId: string;
+  kind: WayspotLineKind;
+  rank: number;
+}
+
+/** A Wayspot that waits, as the line holds it. */
+export interface WaitingWayspot extends QueuedWayspot {
+  queuedAt: number;
+}
+
+/** What Google gave around a Wayspot, and for which point and kind it was asked. */
+export interface AskedPlaces {
+  wayspotId: string;
+  kind: WayspotLineKind;
+  lat: number;
+  lon: number;
+  /** The names joined by spaces (`placesText`); null when Google found none. */
+  places: string | null;
+  askedAt: number;
+}
+
+export interface WayspotLookups {
+  /** Puts Wayspots in the line; one already in it keeps its time, and takes the kind and rank given. */
+  add(wayspots: readonly QueuedWayspot[], now: number): Promise<void>;
+  /**
+   * The first of the line: stops before Power Spots, then the highest rank, the oldest, the
+   * lower id; never one of `except` (set aside after a failure).
+   */
+  next(options?: { except?: ReadonlySet<string> }): Promise<WaitingWayspot | undefined>;
+  /** Takes Wayspots out of the line. */
+  remove(ids: readonly string[]): Promise<void>;
+  count(): Promise<number>;
+  /** Every Wayspot that waits, in the order of the line. */
+  list(): Promise<WaitingWayspot[]>;
+  /** Every Wayspot's places as asked. */
+  asked(): Promise<AskedPlaces[]>;
+  /** Keeps what Google gave around a Wayspot, over what it gave before. */
+  saveAsked(row: AskedPlaces): Promise<void>;
+  /** Forgets the places of these Wayspots (they became gyms, or are gone). */
+  dropAsked(ids: readonly string[]): Promise<void>;
+}
+
+/** The order of the line (`lineOrder`): kind, rank (higher first), time queued, id. */
+function wayspotLineOrder(a: WaitingWayspot, b: WaitingWayspot): number {
+  return lineOrder({ ...a, key: a.wayspotId }, { ...b, key: b.wayspotId });
+}
+
+/** The line and the places in memory: the database's twin. */
+export class MemoryWayspotLookups implements WayspotLookups {
+  readonly rows = new Map<string, WaitingWayspot>();
+  readonly places = new Map<string, AskedPlaces>();
+
+  add(wayspots: readonly QueuedWayspot[], now: number): Promise<void> {
+    for (const wayspot of wayspots) {
+      const kept = this.rows.get(wayspot.wayspotId);
+      this.rows.set(wayspot.wayspotId, { ...wayspot, queuedAt: kept?.queuedAt ?? now });
+    }
+    return Promise.resolve();
+  }
+
+  async next(options: { except?: ReadonlySet<string> } = {}): Promise<WaitingWayspot | undefined> {
+    return (await this.list()).find((row) => options.except?.has(row.wayspotId) !== true);
+  }
+
+  remove(ids: readonly string[]): Promise<void> {
+    for (const id of ids) this.rows.delete(id);
+    return Promise.resolve();
+  }
+
+  count(): Promise<number> {
+    return Promise.resolve(this.rows.size);
+  }
+
+  list(): Promise<WaitingWayspot[]> {
+    return Promise.resolve(
+      [...this.rows.values()].map((row) => ({ ...row })).sort(wayspotLineOrder),
+    );
+  }
+
+  asked(): Promise<AskedPlaces[]> {
+    return Promise.resolve([...this.places.values()].map((row) => ({ ...row })));
+  }
+
+  saveAsked(row: AskedPlaces): Promise<void> {
+    this.places.set(row.wayspotId, { ...row });
+    return Promise.resolve();
+  }
+
+  dropAsked(ids: readonly string[]): Promise<void> {
+    for (const id of ids) this.places.delete(id);
+    return Promise.resolve();
+  }
+}
diff --git a/test/support/google-use-cases.ts b/test/support/google-use-cases.ts
new file mode 100644
index 0000000000000000000000000000000000000000..99731fc6f569a2b19db0eb5e03b608d6eb97dd4d
--- /dev/null
+++ b/test/support/google-use-cases.ts
@@ -0,0 +1,29 @@
+import { expect, it } from 'vitest';
+import type { GoogleUse } from '../../src/services/google-use.js';
+
+/**
+ * What the counts of questions to Google do, run against the repository and its twin alike.
+ * `made` gives fresh counts; `legacy` writes a day of the old count of gyms (`GymLookupDay`).
+ */
+export function googleUseCases(
+  made: () => Promise<{ use: GoogleUse; legacy: (day: string, gyms: number) => Promise<void> }>,
+): void {
+  it('counts the questions per day and kind, with the old count of gyms as places', async () => {
+    const { use, legacy } = await made();
+    expect(await use.usedOn(['2026-10-25'])).toEqual(new Map());
+    await use.use('2026-10-25', 'places');
+    await use.use('2026-10-25', 'places');
+    await use.use('2026-10-25', 'geocode');
+    await use.use('2026-10-26', 'geocode');
+    await legacy('2026-10-24', 40);
+    await legacy('2026-10-25', 3);
+    const used = await use.usedOn(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
+    expect(used).toEqual(
+      new Map([
+        ['2026-10-24', { places: 40, geocodes: 0 }],
+        ['2026-10-25', { places: 5, geocodes: 1 }],
+        ['2026-10-26', { places: 0, geocodes: 1 }],
+      ]),
+    );
+  });
+}
diff --git a/test/support/gym-lookup-cases.ts b/test/support/gym-lookup-cases.ts
index 42e377bc25c6a6c73f16abad408a28949f10b318..53821497469483b877bf579a63d4228bfc77e3fb 100644
--- a/test/support/gym-lookup-cases.ts
+++ b/test/support/gym-lookup-cases.ts
@@ -11,12 +11,12 @@ export function gymLookupCases(made: () => Promise<GymLookups>): void {
     expect(await lookups.next()).toBeUndefined();
     await lookups.add(
       [
-        { gymId: 3, address: true },
-        { gymId: 2, address: false },
+        { gymId: 3, address: true, rank: 0 },
+        { gymId: 2, address: false, rank: 0 },
       ],
       1_000,
     );
-    await lookups.add([{ gymId: 1, address: false }], 2_000);
+    await lookups.add([{ gymId: 1, address: false, rank: 0 }], 2_000);
     expect(await lookups.next()).toEqual({ gymId: 2, address: false });
     expect(await lookups.count()).toBe(3);
     await lookups.remove(2);
@@ -25,36 +25,80 @@ export function gymLookupCases(made: () => Promise<GymLookups>): void {
     expect(await lookups.next()).toEqual({ gymId: 1, address: false });
   });
 
+  it('gives the gym of the best-ranked region first, whenever it was queued', async () => {
+    const lookups = await made();
+    await lookups.add([{ gymId: 1, address: false, rank: -1 }], 1_000);
+    await lookups.add([{ gymId: 2, address: false, rank: 0.25 }], 2_000);
+    await lookups.add([{ gymId: 3, address: false, rank: 1 }], 3_000);
+    await lookups.add([{ gymId: 4, address: false, rank: 0.25 }], 1_500);
+    expect((await lookups.list()).map((gym) => gym.gymId)).toEqual([3, 4, 2, 1]);
+    expect(await lookups.next()).toEqual({ gymId: 3, address: false });
+    // The ranks are worked out anew: the gym in no region now has a busy one.
+    await lookups.setRanks(
+      new Map([
+        [1, 2],
+        [9, 5],
+      ]),
+    );
+    expect(await lookups.next()).toEqual({ gymId: 1, address: false });
+    expect((await lookups.list())[0]).toEqual({
+      gymId: 1,
+      address: false,
+      rank: 2,
+      queuedAt: 1_000,
+    });
+    expect(await lookups.count()).toBe(4);
+  });
+
   it('gives the gym that waited longest of those that wait for their places alone, when asked', async () => {
     const lookups = await made();
-    await lookups.add([{ gymId: 1, address: true }], 1_000);
+    await lookups.add([{ gymId: 1, address: true, rank: 0 }], 1_000);
     expect(await lookups.next({ placesOnly: true })).toBeUndefined();
-    await lookups.add([{ gymId: 3, address: false }], 2_000);
-    await lookups.add([{ gymId: 2, address: false }], 3_000);
+    await lookups.add([{ gymId: 3, address: false, rank: 0 }], 2_000);
+    await lookups.add([{ gymId: 2, address: false, rank: 0 }], 3_000);
     expect(await lookups.next({ placesOnly: true })).toEqual({ gymId: 3, address: false });
     expect(await lookups.next()).toEqual({ gymId: 1, address: true });
   });
 
+  it('passes over the gyms set aside', async () => {
+    const lookups = await made();
+    await lookups.add([{ gymId: 1, address: false, rank: 1 }], 1_000);
+    await lookups.add([{ gymId: 2, address: true, rank: 0 }], 2_000);
+    await lookups.add([{ gymId: 3, address: false, rank: 0 }], 3_000);
+    expect(await lookups.next({ except: new Set([1]) })).toEqual({ gymId: 2, address: true });
+    expect(await lookups.next({ placesOnly: true, except: new Set([1]) })).toEqual({
+      gymId: 3,
+      address: false,
+    });
+    expect(await lookups.next({ except: new Set([1, 2, 3]) })).toBeUndefined();
+    expect(await lookups.next({ except: new Set() })).toEqual({ gymId: 1, address: false });
+    expect(await lookups.count()).toBe(3);
+  });
+
+  it('notes the gyms Google answered about, until forgotten', async () => {
+    const lookups = await made();
+    expect(await lookups.asked()).toEqual(new Set());
+    await lookups.markAsked(2, 1_000);
+    await lookups.markAsked(3, 1_000);
+    await lookups.markAsked(2, 2_000);
+    expect(await lookups.asked()).toEqual(new Set([2, 3]));
+    await lookups.forgetAsked(2);
+    await lookups.forgetAsked(4);
+    expect(await lookups.asked()).toEqual(new Set([3]));
+    // Apart from the line.
+    expect(await lookups.count()).toBe(0);
+  });
+
   it('keeps the place of a gym queued again, and its address when either asks for it', async () => {
     const lookups = await made();
-    await lookups.add([{ gymId: 4, address: false }], 1_000);
-    await lookups.add([{ gymId: 1, address: false }], 2_000);
-    await lookups.add([{ gymId: 4, address: true }], 3_000);
+    await lookups.add([{ gymId: 4, address: false, rank: 0 }], 1_000);
+    await lookups.add([{ gymId: 1, address: false, rank: 0 }], 2_000);
+    await lookups.add([{ gymId: 4, address: true, rank: 0 }], 3_000);
     expect(await lookups.next()).toEqual({ gymId: 4, address: true });
-    await lookups.add([{ gymId: 4, address: false }], 4_000);
+    await lookups.add([{ gymId: 4, address: false, rank: 0 }], 4_000);
     expect(await lookups.next()).toEqual({ gymId: 4, address: true });
     await lookups.setAddress(4, false);
     expect(await lookups.next()).toEqual({ gymId: 4, address: false });
     expect(await lookups.count()).toBe(2);
   });
-
-  it('counts the gyms asked about by day', async () => {
-    const lookups = await made();
-    expect(await lookups.used('2026-10-16')).toBe(0);
-    await lookups.use('2026-10-16');
-    await lookups.use('2026-10-16');
-    await lookups.use('2026-10-17');
-    expect(await lookups.used('2026-10-16')).toBe(2);
-    expect(await lookups.used('2026-10-17')).toBe(1);
-  });
 }
diff --git a/test/support/wayspot-lookup-cases.ts b/test/support/wayspot-lookup-cases.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0a0d29bf4a34e2345a93fe6200ded4f8519fd4c2
--- /dev/null
+++ b/test/support/wayspot-lookup-cases.ts
@@ -0,0 +1,91 @@
+import { expect, it } from 'vitest';
+import type { WayspotLookups } from '../../src/services/wayspot-lookups.js';
+
+/**
+ * What the line of PokéStops and Power Spots that wait for Google does, and the places it keeps,
+ * run against the repository and its twin in memory alike. `made` gives a fresh, empty line.
+ */
+export function wayspotLookupCases(made: () => Promise<WayspotLookups>): void {
+  it('gives stops before Power Spots, each by rank, then by the time queued', async () => {
+    const lookups = await made();
+    expect(await lookups.next()).toBeUndefined();
+    await lookups.add([{ wayspotId: 'aa.16', kind: 'powerspot', rank: 1 }], 1_000);
+    await lookups.add(
+      [
+        { wayspotId: 'bb.16', kind: 'stop', rank: 0.5 },
+        { wayspotId: 'cc.16', kind: 'stop', rank: 0.5 },
+      ],
+      2_000,
+    );
+    await lookups.add([{ wayspotId: 'pine-7', kind: 'stop', rank: 1 }], 3_000);
+    expect((await lookups.list()).map((row) => row.wayspotId)).toEqual([
+      'pine-7',
+      'bb.16',
+      'cc.16',
+      'aa.16',
+    ]);
+    expect(await lookups.next()).toEqual({
+      wayspotId: 'pine-7',
+      kind: 'stop',
+      rank: 1,
+      queuedAt: 3_000,
+    });
+    await lookups.remove(['pine-7', 'bb.16']);
+    expect(await lookups.count()).toBe(2);
+    expect((await lookups.next())?.wayspotId).toBe('cc.16');
+  });
+
+  it('passes over the Wayspots set aside', async () => {
+    const lookups = await made();
+    await lookups.add([{ wayspotId: 'aa.16', kind: 'stop', rank: 1 }], 1_000);
+    await lookups.add([{ wayspotId: 'bb.16', kind: 'powerspot', rank: 1 }], 2_000);
+    expect((await lookups.next({ except: new Set(['aa.16']) }))?.wayspotId).toBe('bb.16');
+    expect(await lookups.next({ except: new Set(['aa.16', 'bb.16']) })).toBeUndefined();
+    expect((await lookups.next({ except: new Set() }))?.wayspotId).toBe('aa.16');
+    expect(await lookups.count()).toBe(2);
+  });
+
+  it('keeps the time of a Wayspot queued again, with its new kind and rank', async () => {
+    const lookups = await made();
+    await lookups.add([{ wayspotId: 'aa.16', kind: 'stop', rank: 0 }], 1_000);
+    await lookups.add([{ wayspotId: 'bb.16', kind: 'stop', rank: 0 }], 2_000);
+    // A stop that became a Power Spot.
+    await lookups.add([{ wayspotId: 'aa.16', kind: 'powerspot', rank: 0 }], 3_000);
+    expect(await lookups.list()).toEqual([
+      { wayspotId: 'bb.16', kind: 'stop', rank: 0, queuedAt: 2_000 },
+      { wayspotId: 'aa.16', kind: 'powerspot', rank: 0, queuedAt: 1_000 },
+    ]);
+    // Ranked anew (`queueWayspots` queues it again with its new rank): its time stays.
+    await lookups.add([{ wayspotId: 'aa.16', kind: 'powerspot', rank: 0.5 }], 4_000);
+    expect((await lookups.list())[1]).toEqual({
+      wayspotId: 'aa.16',
+      kind: 'powerspot',
+      rank: 0.5,
+      queuedAt: 1_000,
+    });
+    expect(await lookups.count()).toBe(2);
+  });
+
+  it('keeps the places asked about a Wayspot, the newest over the older, until dropped', async () => {
+    const lookups = await made();
+    expect(await lookups.asked()).toEqual([]);
+    const asked = {
+      wayspotId: 'aa.16',
+      kind: 'stop' as const,
+      lat: 40.01,
+      lon: -80.02,
+      places: 'Corner Bakery Maple Dental',
+      askedAt: 5_000,
+    };
+    await lookups.saveAsked(asked);
+    await lookups.saveAsked({ ...asked, wayspotId: 'bb.16', places: null });
+    await lookups.saveAsked({ ...asked, places: 'Corner Bakery', askedAt: 6_000 });
+    const kept = await lookups.asked();
+    expect(kept.sort((a, b) => a.wayspotId.localeCompare(b.wayspotId))).toEqual([
+      { ...asked, places: 'Corner Bakery', askedAt: 6_000 },
+      { ...asked, wayspotId: 'bb.16', places: null },
+    ]);
+    await lookups.dropAsked(['aa.16']);
+    expect((await lookups.asked()).map((row) => row.wayspotId)).toEqual(['bb.16']);
+  });
+}
````

### Task 3: 8W-6 task 3: PokéStops and Power Spots in the line, their places in the search

Prototype commit: `aab178da1cf6da9966067c6c77b332e8bb7d0322`

GymUpkeep queues every PokéStop and Power Spot in a region of a server (the kept Wayspots and
the stops of Pine's own) whose places were never asked, or asked at a point more than 10 m away
or for another kind, after every gym: stops before Power Spots, each by rank, then by time
queued. Their turn is paced evenly (the day's share of lineAllowance), never asks an address,
and looks within half the way to the nearest gym, PokéStop or Power Spot (placesRadius). One
that became a gym, was found gone or is a Wayfarer gym leaves the line and loses its places; one
in no region of any server is never queued. The line follows every change of the Wayspots
(whenChanged) and the daily ranking (which also catches a change of the regions).

A Wayspot whose question failed, or whose answer could not be written, is set aside until the
next Pacific day (asideSpots, cleared with the gyms' by the daily rerank; WayspotLookups.next
({ except }) passes over it), its row put after the others of its kind (RETRY_RANK), and the
line waits longer, as after a gym's (wayspotFailed, which never rejects). A failure after its
places were kept (taking it out of the line, the counts) is only logged: it is neither set
aside nor put back, so a stop already answered is not asked and billed again.

WayspotPlaces keeps the places in memory over the table WayspotPlaces (apart from the import's
writes to Wayspot) and tells the search at its load and at most once an hour while answers
arrive; WayspotIndex has a places field at weight 0.5 (as a gym's), and PlaceFinder builds anew
when either the Wayspots or the places change.

Builder's choices:
- "More than a few meters": 10 m (WAYSPOT_MOVED_METRES); the import corrects points a little.
- The nearest place for a Wayspot's circle is looked for within 1 km (beyond it the circle is
  500 m anyway), among gyms, PokéStops, Power Spots and Wayfarer gyms Pine did not take.
- A Wayspot set aside stays set aside when it is queued again the same day (queueWayspots
  re-adds rows at every import and rank change, which would undo it); a gym is released when it
  moves.
- The places are told to the search at once when the last telling is more than an hour old,
  else at the end of that hour (one timer), never per answer.

**Files:**

```
 docs/architecture/gyms-and-regions.md    |   5 ++-
 docs/architecture/stop-reports.md        |   2 +-
 docs/architecture/wayfarer.md            |   1 +
 src/app.ts                               |  24 ++++++++++--
 src/domain/search/wayspot-index.test.ts  |  18 +++++++++
 src/domain/search/wayspot-index.ts       |  22 +++++++----
 src/services/gym-upkeep-wayspots.test.ts | 304 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/gym-upkeep.ts               | 241 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------
 src/services/place-finder.test.ts        |  34 +++++++++++++++++
 src/services/place-finder.ts             |  29 +++++++++++++--
 src/services/wayspot-places.test.ts      |  86 +++++++++++++++++++++++++++++++++++++++++++
 src/services/wayspot-places.ts           | 125 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 12 files changed, 860 insertions(+), 31 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/search/wayspot-index.test.ts src/services/gym-upkeep-wayspots.test.ts src/services/place-finder.test.ts src/services/wayspot-places.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff aab178da1cf6da9966067c6c77b332e8bb7d0322 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-25-phase-8w6-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8W-6 task 3: PokéStops and Power Spots in the line, their places in the search`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/gyms-and-regions.md b/docs/architecture/gyms-and-regions.md
index 7213b12a03d72c10515e1571c2fdc3541ade4fbd..8a617b644cef21f22eab69af71dc0da59a485f39 100644
--- a/docs/architecture/gyms-and-regions.md
+++ b/docs/architecture/gyms-and-regions.md
@@ -6,7 +6,7 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 
 - Gyms are found through `ctx.gyms` (`search(channelId, text, { limit })`, `get`, `isRegion`, `regionsOf`, `inRegion`): all gyms are held in memory by `GymDirectory`. A hit says where it lies (`place`: `local`, `neighbouring`, `anywhere`), whether every word matched (`allWords`; false means a guess), whether a word had to be read as a misspelling (`corrected`) and how far the reading is (`typos`, `typoCost` of `src/domain/search/text.ts`: per typed word nothing as typed, a quarter for a word it only begins, else the fewest wrong letters, read by the words found in the gym's name, nickname or keywords, a word found only in its places, description or address costing 3: `namedReading`; a stop's or Power Spot's by its title, its street counting so): corrected matches and guesses come by how many typed words they lack (`missed` of `reading`: a guess that found more of the words first, whatever its misspellings), then by it, then by score (plan 8W-3: the score weighs a rare word high, so "libary" read as "Vicary" with two letters wrong came before the libraries with one). Act only on a clear hit; offer the rest as a choice. After a gym edit call `GymDirectory.refreshGym(id)`; after regions change, `load()`.
 - `ctx.regions` (`RegionDirectory`) has the regions by id, channel and forum; `GymDirectory` holds its own copy, so after a region changes load both. Every change to what either directory holds bumps its `generation` (`GymDirectory`: every load, gym re-read or forgotten; `RegionDirectory`: every load): the web map's cache (`GeoCache`, `web.md`) rebuilds a server's view only when a generation differs, so a new way of changing either directory's state must bump it too, or the map keeps showing the old state. `regionChannelOf` also answers for a region's forum and a post in it. `ctx.users.get(snowflake)` gives a member's settings.
-- Gyms, PokéStops and Power Spots together are found through `ctx.placeFinder` (`PlaceFinder`, `src/services/place-finder.ts`; plan 8W-2, Matt's rules of 2026-10-15): the server's gyms through the gym search (`GymLookupOptions.within`, the gyms of its regions: a gym elsewhere with every word leaves the server's guesses alone; `PlaceFinder` takes what it needs of `GymDirectory` by `Pick`, and `GymProvider` has no `all()`), the stops (the kept Wayspots and, plan 8R-1, the stops of Pine's own that staff add with `/pokestop`, `stop-reports.md`) and Power Spots each through a `WayspotIndex` of their own (`src/domain/search/wayspot-index.ts`: title, and counting little the street and town; every word as typed or as a beginning; one letter wrong only when nothing matched as typed, or when a word as typed looks misspelt (a word one letter off is in at least `MISSPELT_TITLES` 3 titles and three times as many as it: "Little Free Libary" beside the libraries, plan 8W-3), whose corrections then follow its hits as typed; guesses by some words only when nothing else matched; common words weigh little by MiniSearch's BM25, the legacy stop words not at all), never one mixed index; merged by `mergePlaces` (`place-merge.ts`: `placeFit` exact, word, beginning, loose, guess, the guesses by `guessRank` across kinds (fewer typed words missed first, then the fewest letters read wrong); then the member's region; then gym, stop, Power Spot; then fewer title words beyond those typed, `extraWords`, counted in the name the fit came from (`placeFitBy`: a gym's name or nickname), tuned on Pittsburgh's export; then score). Only what lies in a region of the server is found (`find`, `chosen(value)`); a choice says where it is (`where`: its street, or "near <gym>", the nearest of the server's gyms within `NEAR_GYM_METRES` 1 km, never the place itself; with none so near, nothing); a value is `<kind>:<id>` (`placeValue`, `readPlaceValue`); typed text is acted on only through `clearOf(found)`, of the list one `find` gave (`clearPlace`: the one hit, of every kind and region, whose every word matched exactly, `exact` or `word`; one that names it outright beside another with every word is no clear hit). The indexes are built after every change of what the Wayspots are (`ctx.wayspots.contentGeneration`, told by `whenChanged`: a load; not a change of the regions, nor a forget: a forgotten Wayspot is passed over at once because the search takes only what `inRegion` has) in a turn of their own (`setImmediate`, about half a second for a city), never inside a search: a search before the first build finds the gyms alone, one after a load what was built until the new build is done; `built()` waits for a build that is due (tests).
+- Gyms, PokéStops and Power Spots together are found through `ctx.placeFinder` (`PlaceFinder`, `src/services/place-finder.ts`; plan 8W-2, Matt's rules of 2026-10-15): the server's gyms through the gym search (`GymLookupOptions.within`, the gyms of its regions: a gym elsewhere with every word leaves the server's guesses alone; `PlaceFinder` takes what it needs of `GymDirectory` by `Pick`, and `GymProvider` has no `all()`), the stops (the kept Wayspots and, plan 8R-1, the stops of Pine's own that staff add with `/pokestop`, `stop-reports.md`) and Power Spots each through a `WayspotIndex` of their own (`src/domain/search/wayspot-index.ts`: title, and counting little the street and town and (plan 8W-6) the places Google gave around it, `places` at 0.5 as a gym's, from `WayspotPlaces.placesOf`; every word as typed or as a beginning; one letter wrong only when nothing matched as typed, or when a word as typed looks misspelt (a word one letter off is in at least `MISSPELT_TITLES` 3 titles and three times as many as it: "Little Free Libary" beside the libraries, plan 8W-3), whose corrections then follow its hits as typed; guesses by some words only when nothing else matched; common words weigh little by MiniSearch's BM25, the legacy stop words not at all), never one mixed index; merged by `mergePlaces` (`place-merge.ts`: `placeFit` exact, word, beginning, loose, guess, the guesses by `guessRank` across kinds (fewer typed words missed first, then the fewest letters read wrong); then the member's region; then gym, stop, Power Spot; then fewer title words beyond those typed, `extraWords`, counted in the name the fit came from (`placeFitBy`: a gym's name or nickname), tuned on Pittsburgh's export; then score). Only what lies in a region of the server is found (`find`, `chosen(value)`); a choice says where it is (`where`: its street, or "near <gym>", the nearest of the server's gyms within `NEAR_GYM_METRES` 1 km, never the place itself; with none so near, nothing); a value is `<kind>:<id>` (`placeValue`, `readPlaceValue`); typed text is acted on only through `clearOf(found)`, of the list one `find` gave (`clearPlace`: the one hit, of every kind and region, whose every word matched exactly, `exact` or `word`; one that names it outright beside another with every word is no clear hit). The indexes are built after every change of what the Wayspots are (`ctx.wayspots.contentGeneration`, told by `whenChanged`: a load; not a change of the regions, nor a forget: a forgotten Wayspot is passed over at once because the search takes only what `inRegion` has) and when `WayspotPlaces` tells of new places (its load, then at most once an hour while the line's answers arrive, `PLACES_TOLD_EVERY_MS`; its `generation`), in a turn of their own (`setImmediate`, about half a second for a city), never inside a search: a search before the first build finds the gyms alone, one after a load what was built until the new build is done; `built()` waits for a build that is due (tests).
 - Whether a gym belongs to a server is decided by the row of its region, never by the channel cache: `gymRegionsInGuild` / `gymInGuild` (`src/services/region-directory.ts`). A region without a `guildId` belongs to no server.
 
 ## Maps
@@ -20,7 +20,8 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 - No server's staff administer another server's gyms: `withinReach` (`src/domain/gyms/gym-server.ts`; `mayTouch`, `mayPlace` of the service) allows a gym or a place that lies in a region of the own server (also where regions of two servers overlap) or in no region of any server. A gym out of reach is neither offered nor accepted, as if it did not exist; a place out of reach is refused for `add` and `move`. Decided by the regions' rows, at the command and again under the lock.
 - A location staff give is read by `readLocation` (`src/domain/geo/location-input.ts`, pure): coordinates, or a maps link. The link Pokémon GO shares for a gym ("View in map") is the main way and reads as an exact point; a Google Maps pin wins over where the map is centred; a route is read by where it ends; a place read only from a map's centre is `approximate`, and the question says so. A short link is followed by `GeoGateway.followShortLink`: `https`, the Maps short-link hosts and Google's own only, five hops, five seconds, no body read. A new shape of link gets a test before it is read.
 - What Google knows of a place is behind `GeoGateway` (`src/services/geo-gateway.ts`; `GoogleGeo` calls the Geocoding API and Places API (New) with `fetch`, the key in the address of the one and a header of the other): each call answers a value, `none`, `no-key`, `denied` (remembered for an hour) or `failed`, never throws and never logs an address. In the upkeep's line of lookups (`GymUpkeep`) a refused geocode holds back only the gyms that want an address: the refused gym stays first and is asked no Places, the line goes on with the gyms that want their places alone (`GymLookups.next({ placesOnly })`), and it waits out the refusal only when every gym left wants an address. The address parts also hold the address as Google writes it (`FORMATTED_ADDRESS`), which the search does not read and `addressLine` shows (`/gym show`); a row without it gets a line made of its parts. `GymUpkeep` (`gym-upkeep.ts`) keeps a gym's address parts, nearby places and nearest gym: the nearest gyms of the gyms concerned only (`nearestGymChanges`), the places of gyms whose nearest gym changed in a slow queue, a generation per gym so that a stale answer is never written. Without a key a gym is saved all the same.
-- The line that waits for Google is a priority queue with a monthly budget (plan 8W-6; design `2026-10-20-google-line-priority-design.md`). The arithmetic is pure (`src/domain/geo/google-line.ts`): the month as Google counts it (`googleMonth`, the 1st at midnight in `America/Los_Angeles`, `GOOGLE_ZONE`, whatever `settings.timezone` is), `lineAllowance` (gyms may use the whole month above the reserve; the line stops when only `settings.googleLookupsReserve` of `googleLookupsPerMonth` is left, until the month resets; addresses within `googleGeocodesPerMonth`), `regionRanks` and `bestRank` (a region's raids and max battles over `RANK_DAYS` 90 from the party history, `HistoryRepository.raidsByRegion`, divided by its server's busiest region's: each server's busiest is 1; a server without raids has every region at 1; a region of no server has no rank; a gym in no region of any server is `NO_REGION_RANK`, last), `lineOrder`, and `estimateLine` (below, `/gym google`). `GoogleRanks` (`src/services/google-ranks.ts`) reads the raids at start and at the line's first turn of each Pacific day (`GymUpkeep.rerank`, which ranks the line anew), never per question. Every question that reaches Google counts (a failure too; `denied` and `no-key` do not), in the line or not (a gym added or moved by hand, `/gym refresh`), each by its kind on its Pacific day (`GoogleUse`: `GoogleUseRepository`, table `GoogleUseDay` of migration 031, the old `GymLookupDay` of the current month read as places questions; twin `MemoryGoogleUse`; both run `googleUseCases`; `usedThisMonth`); a question by hand may use the reserve and go past the budget, since an admin asked. While Geocoding is refused or its budget used, the gyms that wait for an address wait (until the refusal ends or the month resets) and the gyms for their places alone go on. A gym asked again for what did not come (a failure, an address Google did not give) is set aside until the next Pacific day (`asideGyms`, cleared by `rerank`; `GymLookups.next({ except })` passes over it, so one gym that keeps failing holds up neither the others nor the budget; put in the line anew, moved, it is asked again), its row after every other gym (`RETRY_RANK`) until the line is ranked anew, and the line waits twice as long after each such turn in a row (up to an hour; a turn that answers resets it), so that a Google that keeps failing does not take the month's budget a few seconds at a time. The line never sets a timer longer than `MAX_TIMER_MS` (six hours: Node fires a timer beyond 2^31 − 1 ms at once): a longer wait, until the month resets, is a turn every six hours that finds nothing to ask. A gym whose places Google answered is noted (`GymLookups.markAsked`, table `GymGoogleAsked` of migration 031, whatever Google found; forgotten when the gym moves, and with the gym), so that `resume` puts in the line at a start only the gyms without places that were never asked where they are (a gym Google found nothing for has neither address nor places, as one never asked); a gym of before with places counts as asked. The twins in memory order their lines by `lineOrder`; the repositories' SQL is its one other copy, held to it by the shared cases. `googleLookupsPerDay` of before is gone (a settings file that still names it is refused, as any unknown key).
+- The line that waits for Google is a priority queue with a monthly budget (plan 8W-6; design `2026-10-20-google-line-priority-design.md`). The arithmetic is pure (`src/domain/geo/google-line.ts`): the month as Google counts it (`googleMonth`, the 1st at midnight in `America/Los_Angeles`, `GOOGLE_ZONE`, whatever `settings.timezone` is), `lineAllowance` (gyms may use the whole month above the reserve; the line stops when only `settings.googleLookupsReserve` of `googleLookupsPerMonth` is left, until the month resets; addresses within `googleGeocodesPerMonth`), `regionRanks` and `bestRank` (a region's raids and max battles over `RANK_DAYS` 90 from the party history, `HistoryRepository.raidsByRegion`, divided by its server's busiest region's: each server's busiest is 1; a server without raids has every region at 1; a region of no server has no rank; a gym in no region of any server is `NO_REGION_RANK`, last), `lineOrder`, and `estimateLine` (below, `/gym google`). `GoogleRanks` (`src/services/google-ranks.ts`) reads the raids at start and at the line's first turn of each Pacific day (`GymUpkeep.rerank`, which ranks the line anew), never per question. Every question that reaches Google counts (a failure too; `denied` and `no-key` do not), in the line or not (a gym added or moved by hand, `/gym refresh`), each by its kind on its Pacific day (`GoogleUse`: `GoogleUseRepository`, table `GoogleUseDay` of migration 031, the old `GymLookupDay` of the current month read as places questions; twin `MemoryGoogleUse`; both run `googleUseCases`; `usedThisMonth`); a question by hand may use the reserve and go past the budget, since an admin asked. While Geocoding is refused or its budget used, the gyms that wait for an address wait (until the refusal ends or the month resets) and the gyms for their places alone go on. A gym asked again for what did not come (a failure, an address Google did not give) is set aside until the next Pacific day (`asideGyms`, cleared by `rerank`; `GymLookups.next({ except })` passes over it, so one gym that keeps failing holds up neither the others nor the budget; put in the line anew, moved, it is asked again), its row after every other gym (`RETRY_RANK`) until the line is ranked anew, and the line waits twice as long after each such turn in a row (up to an hour; a turn that answers resets it), so that a Google that keeps failing does not take the month's budget a few seconds at a time. The line never sets a timer longer than `MAX_TIMER_MS` (six hours: Node fires a timer beyond 2^31 − 1 ms at once): a longer wait, until the month resets, is a turn every six hours that finds nothing to ask. A gym whose places Google answered is noted (`GymLookups.markAsked`, table `GymGoogleAsked` of migration 031, whatever Google found; forgotten when the gym moves, and with the gym), so that `resume` puts in the line at a start only the gyms without places that were never asked where they are (a gym Google found nothing for has neither address nor places, as one never asked); a gym of before with places counts as asked. The twins in memory order their lines by `lineOrder`; the repositories' SQL is its one other copy, held to it by the shared cases.
+- PokéStops and Power Spots wait in the same line after every gym (plan 8W-6): `GymUpkeep` takes the kept Wayspots and the stops of Pine's own (`WayspotDirectory`) and queues each PokéStop and Power Spot in a region of a server (`GoogleRanks.ofWayspot`; one in no region of any server is never queued) whose places were never asked, or asked more than `WAYSPOT_MOVED_METRES` 10 away or for another kind (`queueWayspots`: after `resume`, at every change of what the Wayspots are, `whenChanged`, and with the daily ranking, which also follows a change of the regions); one that is no PokéStop or Power Spot any more (it became a gym, was found gone, is a Wayfarer gym) leaves the line and its places are dropped. The line (`WayspotLookups`: `WayspotLookupRepository`, table `WayspotLookup` of migration 031; twin `MemoryWayspotLookups`; both run `wayspotLookupCases`) gives PokéStops before Power Spots, each by rank, then by the time queued. They are paced evenly (`lineAllowance`: on a day at most what was left above the reserve when the day began over the days left in the month, every places question of the day counted), one every few seconds until the day's share is used; never a Geocoding. A Wayspot's circle is half the way to its nearest gym, PokéStop or Power Spot within 1 km (`placesRadius`, 25 to 500 m), so that stops in a row each get their own businesses. Its places are kept apart from the Wayfarer import's writes (`WayspotPlaces`, `src/services/wayspot-places.ts`, over table `WayspotPlaces`: the names, the point and kind asked, when), which the import's upsert of `Wayspot` never touches. A question that failed, or an answer that could not be written, sets the Wayspot aside until the next Pacific day (`asideSpots`) and puts it after the others of its kind, and the line waits longer, as for gyms. `googleLookupsPerDay` of before is gone (a settings file that still names it is refused, as any unknown key).
 - Tests use `FakeGeo` (`test/support/geo.ts`), `MemoryGyms` and `gymDirectoryWith` (`test/support/gym-store.ts`), `MemoryGymRemoval` and the service of `test/support/gym-admin.ts`; `partyServiceWith` gives all its services one gym list.
 - The texts of a gym are tidied and checked by `src/domain/gyms/gym-text.ts`: name and nickname must fit `varchar(255)` once entity-encoded (the encoder is passed in; the domain does not import `he`), control and direction characters are stripped (ZWNJ, ZWJ and the flag tag characters stay), keywords are lower case and unique. `/gym edit` writes only the fields that differ from what its form showed (`gymFormTexts`, `changedGymTexts`); a text too long for the form is left out of it, never cut. A gym is named beside its number by `gymWithId` (`src/render/gym-view.ts`), which cuts before it escapes and falls back to "Gym" for a name that shows as nothing.
 - The `gym` option of `/gym` (`src/commands/gyms/gym-option.ts`: `respondWithGyms`, `chosenGym`) is free text with autocomplete; a choice's value is `id:<n>`. Typed: `#123` and `id:123` are always ids; bare digits are an id unless no gym has it (a text search then) or another gym is called by those digits (refused, both listed); other text acts only on a clear hit (`clearGymHit`, shared with `/raid`). The questions and forms of `/gym` keep their state in `pendingGyms` (a `PendingRequests` of six hours) under the token of their custom ids, `gym:<token>:<action>`; a token that was answered is remembered, so a second press is only acknowledged; a refused form keeps what was typed behind "Open the form again".
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index 5e5bfc7c53333074f8cae171c3d596922433e553..c8d912a9dd68130168356bc4d6af7175896397f8 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -11,7 +11,7 @@ What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/202
 ## Stops of Pine's own
 
 - A stop Wayfarer does not list (a sponsored one) is added by staff with `/pokestop add name: at: [address:]` (`src/commands/stops/pokestop.ts`, Manage Server and `requireBotManagement`, shaped like `/gym add`): `at` is a maps link, the game's share link or coordinates (`readLocation`), and must lie in a region of the server (`STOP_NOT_HERE`). Within `PINE_STOP_NEAR_METRES` (30) of a known stop (imported or Pine's own) it asks "Add anyway?" with the stops named (`pokestop:<token>:add|cancel`, `PendingRequests`, an hour); `/pokestop edit stop: [name:] [at:] [address:]` (`-` takes the address away) and `/pokestop remove stop:` (no dialog: a report keeps its snapshot) name a stop by the autocomplete of the server's own stops (`NO_SUCH_STOP` else).
-- `PineStopService` (`src/services/pine-stops.ts`, `ctx.pineStops`) keeps them in memory and hands them to `WayspotDirectory.setPineStops`: a Pine stop is a `Wayspot` of kind `stop` with `pineServer` set, keyed `pine-<id>` (`pineStopKey`, `pineStopIdOf`), placed only in the regions of its own server, so `PlaceFinder` (`/wild near:`, `/meetup` with meetup safety's checks, pin names, `/research`) finds it as any stop, and every change bumps the stop index's and the map's generation. `readPlaceValue` takes `stop:pine-<id>`; the region editor's cache leaves out other servers' Pine stops.
+- `PineStopService` (`src/services/pine-stops.ts`, `ctx.pineStops`) keeps them in memory and hands them to `WayspotDirectory.setPineStops`: a Pine stop is a `Wayspot` of kind `stop` with `pineServer` set, keyed `pine-<id>` (`pineStopKey`, `pineStopIdOf`), placed only in the regions of its own server, so `PlaceFinder` (`/wild near:`, `/meetup` with meetup safety's checks, pin names, `/research`) finds it as any stop, and every change bumps the stop index's and the map's generation. `readPlaceValue` takes `stop:pine-<id>`; the region editor's cache leaves out other servers' Pine stops. A stop of Pine's own also waits in the line for Google as a PokéStop, by the same rules (plan 8W-6, `gyms-and-regions.md`): its places, keyed `pine-<id>`, make it findable by the businesses around it.
 - The Wayfarer import's preview names the Pine stops within 30 m of an imported stop (`pineStopsNear`), for staff to remove what Wayfarer lists now.
 - A file of sponsored stops seeds them at once (`npm run stops:seed -- <file> --server <id> [--apply]`, `./pine seed-stops`; `src/ops/stop-seed.ts`, the pure part `src/domain/stops/seed.ts`): a CSV of `id,name,lat,lon,region,basis` (`SEED_COLUMNS`; quoted fields, a BOM and Windows line ends read; only `name`, `lat` and `lon` make the stop, the rest are notes; an unreadable row is said and passed over). `planSeed` skips a row outside every outlined region of the server and one within `PINE_STOP_NEAR_METRES` of a known stop (`PineStopService.nearStops`: a kept Wayspot of kind stop or a Pine stop of that server) or of a row added before it; the rest are added through `PineStopService.add`, address none, `createdBy` `SEED_MAKER` (`stops-seed`, no member). A dry run without `--apply`; each row's fate printed; a second run adds nothing. The database only: a running bot reads the stops at its next start. Pittsburgh's file (beside its Wayfarer export) is kept out of the repository; the tests use `test/fixtures/sponsored-stops.csv`, made up.
 
diff --git a/docs/architecture/wayfarer.md b/docs/architecture/wayfarer.md
index 73f930f0d43f19c7fd7b8ab4e78114a402837302..9a0b76db6b3508ee1ee5117d0af2a6714ed56b0d 100644
--- a/docs/architecture/wayfarer.md
+++ b/docs/architecture/wayfarer.md
@@ -25,6 +25,7 @@ The true list of gyms from Wayfarer: the export file and its parts, S2 cells and
 ## The kept Wayspots
 
 - Every Wayspot of an applied import is kept (plan 8W-2): table `Wayspot` (migration `2026_10_16_017_wayspot`; a migration merged after it must sort after it, since Kysely refuses an earlier name once 017 ran on a database: 8H's is `2026_10_16_018_party_history`, 016 stays unused; first merge wins, the second renumbers above it, and only a merged migration, or one that already sorts after everything merged, is run on the dev database. The table: the Wayfarer id, `kind`, `formerKind` (the kind before an import last saw it as another; `stop` for a promoted stop), place, title and address plain (not entity-encoded: nothing legacy reads it; cut to 255), picture (`pictureOf`, the address as Wayfarer gives it; a message shows it through `wayspotPicture`: https, `=s400`), `firstSeen` (when an import first kept it: the import's time), `lastSeen` (when the scan of the newest file that saw it was made, `scanTimeOf`: the file's `finishedAt`, else `startedAt`, else the import's time, never later than the import's time: a file dated in the future would freeze its rows); not per server) behind `WayspotStorage` (`WayspotRepository`: `all`, `gone`, `saveFromImport({ upsert, remove, gone }, importedAt, scannedAt, startedAt)` in one transaction of chunks of 500, `remove(ids)`; twin `MemoryWayspots`, both run `wayspotCases`). The pure part is `planKept` (`src/domain/wayspots/keep.ts`, rows `kept.ts`): every Wayspot of the file but those whose id is a Pine gym's `pogoId` (of any server) after the import, which live in `Gym` (a row of one is deleted); a kept row not in the file is marked gone where the file covered its cell (`coveredCells`; plan 8W-3: the row stays with `kind` `gone`, its kind before in `formerKind` and its `lastSeen` the time of the scan that found it gone, never read by `all`; no column was added, ruling: tombstones are kept for good, a few thousand rows at most: nothing prunes them, and every preview and import reads them all, `WayspotStorage.gone`, with the kind each had, `GoneWayspot` (a stop where it is not known, `UNKNOWN_GONE_KIND`, so that no tombstone is left out); one brought back keeps that kind as its `formerKind`, and a Wayfarer gym added that was such a stop counts as one, `promoted`), and a Wayspot a newer scan found gone (`KeptInput.gone`, from `WayspotStorage.gone`) is not brought back by an older file (a newer one brings it back, keeping its `firstSeen`); the storage keeps these guards itself whatever the caller planned (plan 8W-3: an upsert never overwrites a row, kept or gone, last seen after the file's scan, by MySQL's row alias `AS new` with `IF(Wayspot.lastSeen > new.lastSeen, …)`, `lastSeen` assigned last; a row is marked gone only when not seen since the file's scan started, or at its own scan time), so that imports that were not one after the other cannot undo each other either; a row last seen after the file's scan (another server's newer scan) is neither changed nor deleted nor counted (a week-old file does not undo a fresh scan; only a gym that is it now takes it), and one another scan saw after the file's scan started (`scanStartOf`: `startedAt`, else `finishedAt`, never later than the import) is not deleted (a row last seen exactly at the file's scan time is its own: an earlier import of the same scan); moves and renames are silent; `WayspotCounts` counts stops and Power Spots `added`, `changed` (kind, title, place, address or picture), `gone` (also a stop that became a gym), and `gyms` (kept Wayfarer gyms written, said nowhere and no reason to offer an import). The import reads the kept rows under its lock, writes them after the gyms (`Unrecorded` `wayspots` when it fails or they cannot be read; the gyms stand, and a gym added is then not known to have been a PokéStop) and stores the counts in its row as `wayspots*`; preview and outcome say them in one line (a preview that cannot read them logs it and says nothing of them), and an import that changes only stops and Power Spots is offered (`changesNothing`, `changesWayspots`). A Wayfarer gym whose adding failed stays a kept `gym` row. A review's Same as (`applyMatch`) and New gym delete the row of the Wayspot the gym now is; New gym gives the gym the kept row's picture. A Wayfarer gym added whose kept row was a stop (`wasStop`) is counted by `GymBatch.add(…, { promoted: true })`: the summary says "Professor Pine has added 12 gyms (3 of them were PokéStops)". The summary also says what the import changed of the stops and Power Spots (`planKept`'s `byKind`, `WayspotChanges`, given to the batch by `GymBatch.countWayspots` once they are written), each count by its kind: "It also added 120 PokéStops and 3 Power Spots, changed 4 PokéStops, and removed 2 Power Spots."; its `gone` is only what left Wayfarer's map, not a stop that became a gym (unlike `WayspotCounts.gone`, which the preview says): a stop Wayfarer now shows as a gym, taken by a Pine gym or not, is counted neither as removed nor as a stop. Its `changed` is only a new kind, a new title or a move over `NOTICED_MOVE_METRES` 10 (`noticeable`): a new address or picture alone is written but not said, so that routine re-imports post nothing (the preview's `changed` still counts them). Real export (43,057): `planKept` 0.2 s, the first write 1.9 s, a write of all again 1.2 s.
+- The places Google gave around a PokéStop or Power Spot (plan 8W-6) live in a table of their own, `WayspotPlaces`, keyed by the Wayspot's id with the point and kind they were asked for: the import's upsert of `Wayspot` neither reads nor clears them; a Wayspot moved by more than a few meters or of another kind waits in the line again, and one that became a gym or was found gone loses them (`gyms-and-regions.md`, the line).
 - `ctx.wayspots` is `WayspotDirectory` (`src/services/wayspot-directory.ts`): loaded at start (after the regions) and after every applied import, empty until then; it also holds the stops of Pine's own (plan 8R-1, `setPineStops` from `PineStopService`: kind `stop`, `pineServer` set, keyed `pine-<id>`, in the regions of their own server only; each change bumps both generations; `stop-reports.md`); `byId`, `all`, `inRegion(channelId)`, `regionsOf(id)` (by the outlines, worked out again when `RegionDirectory.generation` changes), `near(point, metres, kinds?)`, `forget(ids)` (an id forgotten while a load reads stays forgotten when the load ends), a `generation` that changes with every load, forget and change of the regions (the region editor of 8M-2 rebuilds on it), and a `contentGeneration` that changes only with what the Wayspots are (every load; not the regions, not a forget: what is built of them passes over a forgotten one through `inRegion` and `byId`), with `whenChanged(listener)` called after each change of it (the search indexes of `PlaceFinder` are built on it, and `PartyService` shows the meetups near a PokéStop or Power Spot anew, plan 8D). `near` also names a pin: `PlaceFinder.pin` takes the nearest gym of the server or kept PokéStop or Power Spot within 50 m.
 
 ## The review queue
diff --git a/src/app.ts b/src/app.ts
index affd85bff4c2f08d0929718d4e0e40b6e2469140..2cda6a4b74d639e8b662d7a9e7118e8428a0bc89 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -94,6 +94,8 @@ import { GymUpkeep } from './services/gym-upkeep.js';
 import { GymLookupRepository } from './db/repositories/gym-lookup-repository.js';
 import { GoogleUseRepository } from './db/repositories/google-use-repository.js';
 import { GoogleRanks } from './services/google-ranks.js';
+import { WayspotLookupRepository } from './db/repositories/wayspot-lookup-repository.js';
+import { WayspotPlaces } from './services/wayspot-places.js';
 import { ImageCache } from './services/image-cache.js';
 import { NotifyService } from './services/notify-service.js';
 import { OcrAssets } from './services/ocr-assets.js';
@@ -592,6 +594,10 @@ export async function startApp(
     fetch: (url, init) => fetch(url, init),
     log,
   });
+  // The PokéStops and Power Spots that wait for Google, and the places it gave around them
+  // (plan 8W-6), which the search reads.
+  const wayspotLookups = new WayspotLookupRepository(db);
+  const wayspotPlaces = new WayspotPlaces({ storage: wayspotLookups, log });
   const gymUpkeep = new GymUpkeep({
     gyms: gymRepository,
     directory: gyms,
@@ -613,6 +619,9 @@ export async function startApp(
       wayspotRegions: (id) => wayspots.regionsOf(id),
       activity: history,
     }),
+    wayspots,
+    wayspotLookups,
+    places: wayspotPlaces,
   });
   // Map pictures from Google Static Maps, through the image cache (also for gym announcements).
   const maps = new StaticMaps(
@@ -827,8 +836,10 @@ export async function startApp(
     await regions.load();
     await wayspots.load();
     await pineStops.load();
+    await wayspotPlaces.load();
     // The gyms that waited for Google before a restart, and those that lack what it gives;
-    // after the regions and the Wayspots, which its ranks read (plan 8W-6).
+    // after the regions and the Wayspots, which its ranks read, and the Wayspots' places,
+    // which say which were asked (plan 8W-6).
     await gymUpkeep.resume();
     await parties.load();
     await access.load();
@@ -877,7 +888,7 @@ export async function startApp(
     wayfarerReview,
     wayspots,
     pineStops,
-    placeFinder: new PlaceFinder({ gyms, wayspots, regions, log }),
+    placeFinder: new PlaceFinder({ gyms, wayspots, places: wayspotPlaces, regions, log }),
     regions,
     regionAdmin,
     legacyCleanup,
@@ -1359,7 +1370,14 @@ export async function startApp(
       { name: 'click answers', timeoutMs: 3_000, run: () => clickAnswers.flush() },
       { name: 'start times', timeoutMs: 5_000, run: () => timedParties.flush() },
       // The line of gyms that wait for their places is forgotten; what is being written finishes.
-      { name: 'gym upkeep', timeoutMs: 5_000, run: () => gymUpkeep.stop() },
+      {
+        name: 'gym upkeep',
+        timeoutMs: 5_000,
+        run: async () => {
+          await gymUpkeep.stop();
+          wayspotPlaces.stop();
+        },
+      },
       { name: 'gym announcements', timeoutMs: 3_000, run: () => gymAdmin.flush() },
       { name: 'raid boss announcements', timeoutMs: 3_000, run: () => bossAnnouncer.close() },
       // A change of gyms or regions that has begun is finished while the database is open.
diff --git a/src/domain/search/wayspot-index.test.ts b/src/domain/search/wayspot-index.test.ts
index 943a4c75d8f2f66c7a91410c4b5f4cecd330c288..af5a07fc8fed144fe31e57bb3d1858a38df13970 100644
--- a/src/domain/search/wayspot-index.test.ts
+++ b/src/domain/search/wayspot-index.test.ts
@@ -30,6 +30,24 @@ describe('WayspotIndex', () => {
     expect(ids(index.search('church'))[0]).toBe('s2');
   });
 
+  it('finds a Wayspot by the places Google gave around it, after a title with the word', () => {
+    const places = new Map([
+      ['s5', 'Corner Bakery Maple Dental'],
+      ['s3', 'Pinewood Bakery'],
+    ]);
+    const index = new WayspotIndex(stops, (id) => places.get(id) ?? null);
+    expect(ids(index.search('corner bakery'))).toEqual(['s5']);
+    expect(ids(index.search('bakery')).sort()).toEqual(['s3', 's5']);
+    // A place's name counts less than a title's word.
+    const withTitle = new WayspotIndex(
+      [...stops, { id: 's7', title: 'Bakery Square Fountain', address: null }],
+      (id) => places.get(id) ?? null,
+    );
+    expect(ids(withTitle.search('bakery'))[0]).toBe('s7');
+    // Without places nothing is found by them.
+    expect(ids(new WayspotIndex(stops).search('corner bakery', { guesses: false }))).toEqual([]);
+  });
+
   it('reads a misspelling of one letter only when nothing matched as typed', () => {
     const index = new WayspotIndex(stops);
     const misspelt = index.search('libary');
diff --git a/src/domain/search/wayspot-index.ts b/src/domain/search/wayspot-index.ts
index 2ce09668c1fc97ad7f5742cd4f21d5e2eb6ddb8f..0013b053fc3220aa8bea2727f1d1f5acd76e7c4e 100644
--- a/src/domain/search/wayspot-index.ts
+++ b/src/domain/search/wayspot-index.ts
@@ -8,7 +8,7 @@ import { MATCH_WEIGHTS, namedReading, STOP_WORDS, searchTokens } from './text.js
  * the gyms have `GymIndex`. Pure.
  *
  * A Wayspot is found by its title and, counting little, by its street (and town) from the
- * address. Every typed word must match, as typed or as the beginning of a word; only when no
+ * address and by the places Google gave around it (plan 8W-6). Every typed word must match, as typed or as the beginning of a word; only when no
  * Wayspot has every word as typed is one letter read as wrong (`corrected`: about 900 stops a
  * region, so "church" or "park" hit dozens as typed, and a looser reading would bury them); only
  * when that found nothing either, Wayspots with some of the words are guesses (`allWords` false).
@@ -55,14 +55,18 @@ interface WayspotDocument {
   id: string;
   title: string;
   street: string;
+  places: string;
 }
 
 type Field = Exclude<keyof WayspotDocument, 'id'>;
 
-const FIELDS: readonly Field[] = ['title', 'street'];
+const FIELDS: readonly Field[] = ['title', 'street', 'places'];
 
-/** A title word counts eight times a street word (the gyms' name against their address). */
-const FIELD_WEIGHTS: Readonly<Record<Field, number>> = { title: 8, street: 1 };
+/**
+ * A title word counts eight times a street word (the gyms' name against their address), and the
+ * names of the places Google gave around it (plan 8W-6) half a street word, as a gym's places.
+ */
+const FIELD_WEIGHTS: Readonly<Record<Field, number>> = { title: 8, street: 1, places: 0.5 };
 
 /** One letter wrong at most, and only in a word of five letters or more ("libary"). */
 function oneTypo(term: string): number {
@@ -75,20 +79,24 @@ export function streetOf(address: string | null): string | undefined {
   return wayfarerAddressParts(address).route;
 }
 
-function toDocument(wayspot: SearchableWayspot): WayspotDocument {
+function toDocument(wayspot: SearchableWayspot, places: string | null): WayspotDocument {
   const parts = wayspot.address === null ? {} : wayfarerAddressParts(wayspot.address);
   return {
     id: wayspot.id,
     title: wayspot.title,
     street: [parts.premise, parts.route, parts.locality].filter((part) => part).join(' '),
+    places: places ?? '',
   };
 }
 
+/** The names of the places Google gave around a Wayspot (`WayspotPlaces.placesOf`), or null. */
+export type PlacesOf = (id: string) => string | null;
+
 export class WayspotIndex<W extends SearchableWayspot> {
   private readonly index: MiniSearch<WayspotDocument>;
   private readonly wayspots = new Map<string, W>();
 
-  constructor(wayspots: Iterable<W>) {
+  constructor(wayspots: Iterable<W>, placesOf: PlacesOf = () => null) {
     this.index = new MiniSearch<WayspotDocument>({
       fields: [...FIELDS],
       tokenize: searchTokens,
@@ -98,7 +106,7 @@ export class WayspotIndex<W extends SearchableWayspot> {
     for (const wayspot of wayspots) {
       if (this.wayspots.has(wayspot.id)) continue;
       this.wayspots.set(wayspot.id, wayspot);
-      documents.push(toDocument(wayspot));
+      documents.push(toDocument(wayspot, placesOf(wayspot.id)));
     }
     this.index.addAll(documents);
   }
diff --git a/src/services/gym-upkeep-wayspots.test.ts b/src/services/gym-upkeep-wayspots.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..018f41f5457bd29ff35d402ccda6998eb04ce600
--- /dev/null
+++ b/src/services/gym-upkeep-wayspots.test.ts
@@ -0,0 +1,304 @@
+import { describe, expect, it } from 'vitest';
+import { FakeGeoGateway } from '../../test/support/geo.js';
+import { gymDirectoryWith, MemoryGyms } from '../../test/support/gym-store.js';
+import { regionsFixture } from '../../test/support/providers.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { watchEachTest } from '../../test/support/timers.js';
+import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
+import { wayspotsWith } from '../../test/support/wayspots.js';
+import { metresBetween } from '@pine/wayspot-core/distance';
+import type { WayspotRow } from '../domain/wayspots/kept.js';
+import { MemoryGoogleUse } from './google-use.js';
+import { GoogleRanks } from './google-ranks.js';
+import { MemoryGymLookups } from './gym-lookups.js';
+import { GymUpkeep, type GymUpkeepOptions } from './gym-upkeep.js';
+import { MemoryWayspotLookups } from './wayspot-lookups.js';
+import { WayspotPlaces } from './wayspot-places.js';
+
+const background = watchEachTest();
+
+/** In West (40.00 to 40.10 north, -80.10 to -80.00): a stop and a Power Spot 100 m apart. */
+const STOP = keptRow(1, { title: 'Mural', lat: 40.0301, lon: -80.0801 });
+const SPOT = keptRow(2, { title: 'Bench', kind: 'powerspot', lat: 40.031, lon: -80.0801 });
+/** Outside every region of every server. */
+const AWAY = keptRow(3, { title: 'Far Away', lat: 41, lon: -81 });
+/** A Wayfarer gym Pine did not take: never asked about as a Wayspot. */
+const WAYFARER_GYM = keptRow(4, { title: 'Hall', kind: 'gym', lat: 40.04, lon: -80.08 });
+
+/**
+ * The line over no gyms (so that the Wayspots' turn comes at once) and kept Wayspots in the
+ * invented regions, ranked by `GoogleRanks` over no history.
+ */
+async function lineWith(
+  rows: readonly WayspotRow[],
+  options: Partial<Omit<GymUpkeepOptions, 'parties'>> = {},
+) {
+  const { gyms, directory } = await gymDirectoryWith(new MemoryGyms([]));
+  const { storage, wayspots } = await wayspotsWith(rows);
+  const geo = new FakeGeoGateway();
+  const { log } = createTestLogger();
+  const spots = new MemoryWayspotLookups();
+  const use = new MemoryGoogleUse();
+  const places = new WayspotPlaces({ storage: spots, log, setTimer: () => () => undefined });
+  await places.load();
+  const ranks = new GoogleRanks({
+    regions: regionsFixture(),
+    gymRegions: (id) => directory.regionsOf(id),
+    wayspotRegions: (id) => wayspots.regionsOf(id),
+    activity: { raidsByRegion: () => Promise.resolve(new Map()) },
+  });
+  const timers: (() => void)[] = [];
+  const waits: number[] = [];
+  const upkeep = new GymUpkeep({
+    gyms,
+    directory,
+    geo,
+    parties: { active: () => [] },
+    posts: { changed: () => undefined },
+    log,
+    setTimer: (run, ms) => {
+      timers.push(run);
+      waits.push(ms);
+      return () => {
+        const index = timers.indexOf(run);
+        if (index >= 0) timers.splice(index, 1);
+      };
+    },
+    lookups: new MemoryGymLookups(),
+    use,
+    ranks,
+    wayspots,
+    wayspotLookups: spots,
+    places,
+    ...options,
+  });
+  return { upkeep, geo, storage, wayspots, spots, use, places, timers, waits };
+}
+
+describe('GymUpkeep: PokéStops and Power Spots in the line', () => {
+  it('queues the stops and Power Spots of the regions, stops first, and keeps their places', async () => {
+    const { upkeep, geo, spots, places } = await lineWith([STOP, SPOT, AWAY, WAYFARER_GYM]);
+    await upkeep.resume();
+    expect((await spots.list()).map((row) => [row.wayspotId, row.kind])).toEqual([
+      [STOP.id, 'stop'],
+      [SPOT.id, 'powerspot'],
+    ]);
+    expect(await upkeep.waitingWayspots()).toBe(2);
+    await upkeep.flush();
+    const asked = geo.questions('places');
+    expect(asked.map((question) => question.point.lat)).toEqual([STOP.lat, SPOT.lat]);
+    // Half the way to the nearest stop or Power Spot: each gets its own businesses.
+    expect(asked[0]?.radius).toBeCloseTo(metresBetween(STOP, SPOT) / 2, 5);
+    // No address is ever asked for a Wayspot.
+    expect(geo.questions('geocode')).toEqual([]);
+    expect(places.get(STOP.id)).toMatchObject({
+      kind: 'stop',
+      lat: STOP.lat,
+      lon: STOP.lon,
+      places: 'Corner Bakery Maple Dental',
+    });
+    expect(await spots.count()).toBe(0);
+    // Asked once: not queued again at the next start.
+    await upkeep.resume();
+    expect(await spots.count()).toBe(0);
+  });
+
+  it('comes after every gym', async () => {
+    const { gyms, directory } = await gymDirectoryWith();
+    const made = await lineWith([STOP], { gyms, directory });
+    await made.upkeep.resume();
+    expect(await made.upkeep.waiting()).toBeGreaterThan(0);
+    await made.upkeep.flush();
+    const lats = made.geo.questions('places').map((question) => question.point.lat);
+    expect(lats.at(-1)).toBe(STOP.lat);
+    expect(lats.indexOf(STOP.lat)).toBe(lats.length - 1);
+  });
+
+  it('asks stops and Power Spots at an even share of each day', async () => {
+    // October 11 at 8 p.m. in California: 21 days left with today, a share of 1 a day; the next
+    // day begins in four hours (within the longest timer the line sets).
+    let now = new Date('2026-10-11T20:00:00-07:00').getTime();
+    const made = await lineWith([STOP, SPOT], {
+      budget: { places: 23, reserve: 2, geocodes: 100 },
+      now: () => now,
+    });
+    await made.upkeep.resume();
+    await made.upkeep.flush();
+    expect(made.use.days.get('2026-10-11')?.places).toBe(1);
+    expect(await made.spots.count()).toBe(1);
+    // The line waits for tomorrow.
+    made.timers.splice(0);
+    made.waits.splice(0);
+    await made.upkeep.resume();
+    made.timers.shift()?.();
+    await background.settle();
+    expect(made.waits.at(-1)).toBe(new Date('2026-10-12T00:00:00-07:00').getTime() - now);
+    now = new Date('2026-10-12T00:05:00-07:00').getTime();
+    await made.upkeep.flush();
+    expect(made.use.days.get('2026-10-12')?.places).toBe(1);
+    expect(await made.spots.count()).toBe(0);
+  });
+
+  it('asks again a Wayspot that moved or became a Power Spot, and forgets one that became a gym', async () => {
+    const made = await lineWith([STOP, SPOT]);
+    await made.upkeep.resume();
+    await made.upkeep.flush();
+    expect(made.places.ids().sort()).toEqual([STOP.id, SPOT.id].sort());
+    // A later import: the stop moved 50 m and is a Power Spot now; the spot a few meters only;
+    // a new stop came.
+    const fresh = keptRow(5, { title: 'Fresh', lat: 40.06, lon: -80.06 });
+    await made.storage.saveFromImport(
+      {
+        upsert: [
+          { ...STOP, kind: 'powerspot', lat: STOP.lat + 0.00045 },
+          { ...SPOT, lat: SPOT.lat + 0.00001 },
+          fresh,
+        ],
+        remove: [],
+      },
+      2_000,
+    );
+    await made.wayspots.load();
+    await made.upkeep.flush();
+    expect(made.geo.questions('places').map((question) => question.point.lat)).toEqual([
+      STOP.lat,
+      SPOT.lat,
+      fresh.lat,
+      STOP.lat + 0.00045,
+    ]);
+    expect(made.places.get(STOP.id)?.kind).toBe('powerspot');
+    // The spot becomes a gym: its places go, and it is not queued.
+    await made.storage.saveFromImport({ upsert: [], remove: [SPOT.id] }, 3_000);
+    await made.wayspots.load();
+    await made.upkeep.flush();
+    expect(made.places.get(SPOT.id)).toBeUndefined();
+    expect(made.places.get(wayspotId(5))).toBeDefined();
+  });
+
+  it('queues the stops of Pine’s own as PokéStops', async () => {
+    const made = await lineWith([]);
+    made.wayspots.setPineStops([
+      {
+        stop: {
+          id: 7,
+          serverId: '1',
+          name: 'Sponsored Cafe',
+          lat: 40.02,
+          lon: -80.02,
+          address: null,
+          createdBy: '1',
+          createdAt: 1,
+          updatedBy: '1',
+          updatedAt: 1,
+        },
+        guildRow: 1,
+      },
+    ]);
+    await made.upkeep.resume();
+    expect((await made.spots.list()).map((row) => [row.wayspotId, row.kind])).toEqual([
+      ['pine-7', 'stop'],
+    ]);
+  });
+
+  it('asks the stops while a gym whose question keeps failing waits for the next day', async () => {
+    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
+    const { gyms, directory } = await gymDirectoryWith(new MemoryGyms([]));
+    const stuck = await gyms.create({ name: 'Stuck', lat: 40.05, lon: -80.05 });
+    await directory.refreshGym(stuck.id);
+    const made = await lineWith([STOP], { gyms, directory, now: () => now });
+    let stuckAsked = 0;
+    const placesNear = made.geo.placesNear.bind(made.geo);
+    made.geo.placesNear = (point, radius) => {
+      if (point.lat !== 40.05) return placesNear(point, radius);
+      stuckAsked++;
+      return Promise.resolve({ ok: false, reason: 'failed' });
+    };
+    await made.upkeep.resume();
+    expect(await made.upkeep.waiting()).toBe(1);
+    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
+    expect(stuckAsked).toBe(1);
+    expect(made.places.get(STOP.id)).toBeDefined();
+    expect(await made.upkeep.waiting()).toBe(1);
+    now += 24 * 3_600_000;
+    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
+    expect(stuckAsked).toBe(2);
+  });
+
+  it('sets a stop whose question keeps failing aside until the next day, and asks the others', async () => {
+    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
+    const other = keptRow(6, { title: 'Other Mural', lat: 40.032, lon: -80.0801 });
+    const made = await lineWith([STOP, other], { now: () => now });
+    let stuckAsked = 0;
+    const placesNear = made.geo.placesNear.bind(made.geo);
+    made.geo.placesNear = (point, radius) => {
+      if (point.lat !== STOP.lat) return placesNear(point, radius);
+      stuckAsked++;
+      return Promise.resolve({ ok: false, reason: 'failed' });
+    };
+    await made.upkeep.resume();
+    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
+    expect(stuckAsked).toBe(1);
+    expect(made.places.get(other.id)).toBeDefined();
+    expect((await made.spots.list()).map((row) => row.wayspotId)).toEqual([STOP.id]);
+    now += 24 * 3_600_000;
+    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
+    expect(stuckAsked).toBe(2);
+  });
+
+  it('sets a stop whose places cannot be written aside until the next day, as a failed question', async () => {
+    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
+    const other = keptRow(6, { title: 'Other Mural', lat: 40.032, lon: -80.0801 });
+    const made = await lineWith([STOP, other], { now: () => now });
+    const saveAsked = made.spots.saveAsked.bind(made.spots);
+    made.spots.saveAsked = (row) =>
+      row.wayspotId === STOP.id ? Promise.reject(new Error('database is down')) : saveAsked(row);
+    await made.upkeep.resume();
+    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
+    const atStop = () =>
+      made.geo.questions('places').filter((question) => question.point.lat === STOP.lat).length;
+    expect(atStop()).toBe(1);
+    expect(made.places.get(other.id)).toBeDefined();
+    expect(await made.spots.count()).toBe(1);
+    now += 24 * 3_600_000;
+    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
+    expect(atStop()).toBe(2);
+  });
+
+  it('does not ask again a stop whose places were written, though its turn failed after', async () => {
+    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
+    const made = await lineWith([STOP], { now: () => now });
+    await made.upkeep.resume();
+    // The places are kept and the stop leaves the line; the count after it fails once.
+    const count = made.spots.count.bind(made.spots);
+    let failing = true;
+    made.spots.count = () => {
+      if (!failing) return count();
+      failing = false;
+      return Promise.reject(new Error('database is down'));
+    };
+    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
+    now += 24 * 3_600_000;
+    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
+    expect(made.geo.questions('places')).toHaveLength(1);
+    expect(made.places.get(STOP.id)).toBeDefined();
+    expect(await made.spots.count()).toBe(0);
+  });
+
+  it('keeps a stop whose question failed, after the other stops, and the line waits longer', async () => {
+    const other = keptRow(6, { title: 'Other Mural', lat: 40.032, lon: -80.0801 });
+    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
+    const made = await lineWith([STOP, other], { now: () => now });
+    await made.upkeep.resume();
+    made.geo.failing = { places: 'failed' };
+    await made.upkeep.flush();
+    expect(made.use.total('places')).toBe(1);
+    expect((await made.spots.list()).map((row) => row.wayspotId)).toEqual([other.id, STOP.id]);
+    made.geo.failing = {};
+    await made.upkeep.flush();
+    // The other stop is asked; the one that failed waits for the next day.
+    expect((await made.spots.list()).map((row) => row.wayspotId)).toEqual([STOP.id]);
+    now += 24 * 3_600_000;
+    await made.upkeep.flush();
+    expect(await made.spots.count()).toBe(0);
+  });
+});
diff --git a/src/services/gym-upkeep.ts b/src/services/gym-upkeep.ts
index 6121c0a098d46f9d033404314d5ffe0e9c909e0a..3569c5938dd9b385518028f38fcc853696f2760d 100644
--- a/src/services/gym-upkeep.ts
+++ b/src/services/gym-upkeep.ts
@@ -20,6 +20,14 @@ import {
 } from './google-use.js';
 import type { GoogleRanks } from './google-ranks.js';
 import { MemoryGymLookups, type GymLookups } from './gym-lookups.js';
+import type { WayspotProvider } from './wayspot-directory.js';
+import {
+  MemoryWayspotLookups,
+  type QueuedWayspot,
+  type WaitingWayspot,
+  type WayspotLookups,
+} from './wayspot-lookups.js';
+import { WayspotPlaces } from './wayspot-places.js';
 
 /**
  * What came of fetching one thing about a gym: it was written (`updated`), it is what the gym
@@ -59,6 +67,15 @@ const MAX_RETRY_WAIT_MS = 3_600_000;
  */
 export const MAX_TIMER_MS = 6 * 3_600_000;
 
+/**
+ * A PokéStop or Power Spot moved farther than this since its places were asked waits again: a
+ * few meters change no circle of places, and an import corrects thousands of points a little.
+ */
+export const WAYSPOT_MOVED_METRES = 10;
+
+/** How far around a Wayspot its nearest gym, PokéStop or Power Spot is looked for. */
+const NEAREST_PLACE_METRES = 1_000;
+
 const SAME_RANK: LineRanks = {
   refresh: () => Promise.resolve(),
   ofGym: () => 0,
@@ -106,6 +123,16 @@ export interface GymUpkeepOptions {
   budget?: GoogleBudget;
   /** The ranks of the places of the line (`GoogleRanks` in the bot); default all alike. */
   ranks?: LineRanks;
+  /**
+   * The kept Wayspots and stops of Pine's own (`WayspotDirectory`): their PokéStops and Power
+   * Spots in a region of a server wait in the line after the gyms (plan 8W-6). Without them only
+   * gyms wait.
+   */
+  wayspots?: Pick<WayspotProvider, 'all' | 'byId' | 'near' | 'contentGeneration' | 'whenChanged'>;
+  /** The Wayspots' line (`WayspotLookupRepository` in the bot); default one in memory. */
+  wayspotLookups?: WayspotLookups;
+  /** The places Google gave around them (`WayspotPlaces`); default one over `wayspotLookups`. */
+  places?: WayspotPlaces;
   /** Default `Date.now`. */
   now?: () => number;
 }
@@ -144,6 +171,11 @@ export class GymUpkeep {
   private readonly use: GoogleUse;
   private readonly budget: GoogleBudget;
   private readonly ranks: LineRanks;
+  /** The PokéStops and Power Spots that wait for Google. */
+  private readonly wayspotLookups: WayspotLookups;
+  private readonly places: WayspotPlaces;
+  /** Whether the line was taken up (`resume`): only then a change of the Wayspots queues them. */
+  private resumed = false;
   private readonly now: () => number;
   private readonly running = new Set<Promise<unknown>>();
   /**
@@ -173,11 +205,12 @@ export class GymUpkeep {
   /** The turns in a row whose questions did not answer: the line waits longer after each. */
   private misses = 0;
   /**
-   * The gyms whose question did not answer today: the line passes over them until the next
-   * Pacific day (`rerank`), so that one gym that keeps failing holds up neither the others nor
-   * the budget; one put in the line anew (moved) is asked again.
+   * The gyms and the PokéStops and Power Spots whose question did not answer today: the line
+   * passes over them until the next Pacific day (`rerank`), so that one item that keeps failing
+   * holds up neither the others nor the budget; one put in the line anew (moved) is asked again.
    */
   private readonly asideGyms = new Set<number>();
+  private readonly asideSpots = new Set<string>();
   private stopped = false;
 
   constructor(private readonly options: GymUpkeepOptions) {
@@ -186,7 +219,14 @@ export class GymUpkeep {
     this.use = options.use ?? new MemoryGoogleUse();
     this.budget = options.budget ?? DEFAULT_GOOGLE_BUDGET;
     this.ranks = options.ranks ?? SAME_RANK;
+    this.wayspotLookups = options.wayspotLookups ?? new MemoryWayspotLookups();
+    this.places =
+      options.places ?? new WayspotPlaces({ storage: this.wayspotLookups, log: options.log });
     this.now = options.now ?? Date.now;
+    // What the Wayspots are changed (an import, a stop of Pine's own): the line follows.
+    options.wayspots?.whenChanged(() => {
+      if (this.resumed) this.aside(() => this.queueWayspots());
+    });
     this.setTimer =
       options.setTimer ??
       ((run, ms) => {
@@ -208,6 +248,67 @@ export class GymUpkeep {
     return this.lookups.count();
   }
 
+  /** How many PokéStops and Power Spots wait in the line. */
+  waitingWayspots(): Promise<number> {
+    return this.wayspotLookups.count();
+  }
+
+  /**
+   * Brings the Wayspots' part of the line up to date with the Wayspots (after `resume`, at every
+   * change of what they are, and with the daily ranking): a PokéStop or Power Spot in a region
+   * of a server whose places were never asked, or asked at a point more than
+   * `WAYSPOT_MOVED_METRES` away or for another kind, is queued (by its kind and rank); one no
+   * longer in a region of any server leaves the line; one that is no PokéStop or Power Spot any
+   * more (it became a gym, was found gone, is a Wayfarer gym) leaves it and its places are
+   * dropped. Never rejects.
+   */
+  private async queueWayspots(): Promise<void> {
+    const { wayspots, log } = this.options;
+    // Before the first load of the Wayspots nothing is known of them: nothing is dropped.
+    if (!wayspots || wayspots.contentGeneration === 0 || !this.fetches || this.stopped) return;
+    try {
+      const waiting = new Map(
+        (await this.wayspotLookups.list()).map((row): [string, WaitingWayspot] => [
+          row.wayspotId,
+          row,
+        ]),
+      );
+      const add: QueuedWayspot[] = [];
+      const kept = new Set<string>();
+      for (const wayspot of wayspots.all()) {
+        if (wayspot.kind !== 'stop' && wayspot.kind !== 'powerspot') continue;
+        const rank = this.ranks.ofWayspot(wayspot.id);
+        if (rank === undefined) continue;
+        kept.add(wayspot.id);
+        const asked = this.places.get(wayspot.id);
+        if (
+          asked &&
+          asked.kind === wayspot.kind &&
+          metresBetween(asked, wayspot) <= WAYSPOT_MOVED_METRES
+        ) {
+          continue;
+        }
+        const queued = waiting.get(wayspot.id);
+        if (queued?.kind === wayspot.kind && queued.rank === rank) continue;
+        add.push({ wayspotId: wayspot.id, kind: wayspot.kind, rank });
+      }
+      const leave = [...waiting.keys()].filter((id) => !kept.has(id));
+      const drop = this.places.ids().filter((id) => {
+        const kind = wayspots.byId(id)?.kind;
+        return kind !== 'stop' && kind !== 'powerspot';
+      });
+      await this.wayspotLookups.add(add, this.now());
+      await this.wayspotLookups.remove(leave);
+      await this.places.drop(drop);
+      if (add.length > 0) this.schedule();
+    } catch (err) {
+      log.warn(
+        { err },
+        'could not bring the PokéStops and Power Spots that wait for Google up to date',
+      );
+    }
+  }
+
   /**
    * Takes up the line kept from before a restart (at start), and puts in it the gyms that have
    * no places and were never asked about where they are (`GymLookups.asked`; Matt, 2026-10-16:
@@ -239,6 +340,8 @@ export class GymUpkeep {
         );
       }
     }
+    this.resumed = true;
+    if (this.fetches && !this.stopped) await this.queueWayspots();
     this.schedule();
   }
 
@@ -529,6 +632,7 @@ export class GymUpkeep {
     this.rankedDay = googleMonth(this.now()).today;
     // A new day: what failed before is asked again, in its place by its rank.
     this.asideGyms.clear();
+    this.asideSpots.clear();
     try {
       await this.ranks.refresh();
     } catch (err) {
@@ -545,6 +649,9 @@ export class GymUpkeep {
     } catch (err) {
       log.warn({ err }, 'could not rank the line of gyms that wait for Google anew');
     }
+    // The Wayspots' part: ranked anew, and one that came into a region (or left every one)
+    // since is queued (or leaves): a change of the regions is not a change of the Wayspots.
+    if (this.resumed) await this.queueWayspots();
   }
 
   /**
@@ -587,32 +694,45 @@ export class GymUpkeep {
   private async nextNow(): Promise<number | 'empty' | undefined> {
     const { log } = this.options;
     let first;
+    let spot: WaitingWayspot | undefined;
     try {
       const now = this.now();
       if (googleMonth(now).today !== this.rankedDay) await this.rerank();
       const allowance = lineAllowance(now, await usedThisMonth(this.use, now), this.budget);
       // While Geocoding is refused, or its budget used, the gyms that wait for their address
-      // wait; the others go on.
+      // wait; the others go on, then the PokéStops and Power Spots.
       const refusedFor = this.geocodeRefusedUntil - now;
       const placesOnly = refusedFor > 0 || !allowance.geocode;
       first = allowance.gyms
         ? await this.lookups.next({ placesOnly, except: this.asideGyms })
         : undefined;
       if (!first) {
-        if ((await this.lookups.count()) === 0) return 'empty';
-        if (!allowance.gyms) return allowance.waitMs;
-        const month = googleMonth(now);
-        return Math.min(
-          // Only gyms that wait for their address are left.
-          refusedFor > 0 && allowance.geocode ? refusedFor : month.nextReset - now,
-          // What failed today is asked again tomorrow.
-          this.asideGyms.size > 0 ? month.tomorrow - now : Number.POSITIVE_INFINITY,
-        );
+        spot = allowance.wayspots
+          ? await this.wayspotLookups.next({ except: this.asideSpots })
+          : undefined;
+        if (!spot) {
+          const gyms = await this.lookups.count();
+          const spots = await this.wayspotLookups.count();
+          if (gyms + spots === 0) return 'empty';
+          if (!allowance.gyms) return allowance.waitMs;
+          const month = googleMonth(now);
+          return Math.min(
+            // Only gyms that wait for their address are left.
+            gyms > 0 && refusedFor > 0 && allowance.geocode ? refusedFor : month.nextReset - now,
+            // The day's share of stops and Power Spots is used.
+            spots > 0 ? month.tomorrow - now : Number.POSITIVE_INFINITY,
+            // What failed today is asked again tomorrow.
+            this.asideGyms.size + this.asideSpots.size > 0
+              ? month.tomorrow - now
+              : Number.POSITIVE_INFINITY,
+          );
+        }
       }
     } catch (err) {
       log.warn({ err }, 'could not read the line of gyms that wait for Google');
       return this.placesEveryMs;
     }
+    if (!first) return spot ? this.askWayspot(spot) : 'empty';
     const { gymId, address } = first;
     const asking = { gymId, requeued: false, address: false };
     this.asking = asking;
@@ -676,7 +796,7 @@ export class GymUpkeep {
       }
       this.misses = 0;
       // The last one: no timer is left for an empty line.
-      if ((await this.lookups.count()) === 0) return 'empty';
+      if ((await this.lookups.count()) + (await this.wayspotLookups.count()) === 0) return 'empty';
     } catch (err) {
       log.warn({ err, gym: gymId }, 'could not take a gym out of the line for Google');
     } finally {
@@ -686,6 +806,99 @@ export class GymUpkeep {
     return undefined;
   }
 
+  /**
+   * The turn of a PokéStop or Power Spot: its places, within half the way to the nearest gym,
+   * PokéStop or Power Spot (`placesRadius`), never its address. Kept with the point and kind
+   * asked (`WayspotPlaces`); one no longer a PokéStop or Power Spot leaves the line unasked; one
+   * whose question failed waits after the others of its kind, and the line waits longer (as for
+   * gyms); while Google refuses the key for places it stays first. Answers as `next`.
+   */
+  private async askWayspot(item: WaitingWayspot): Promise<number | 'empty' | undefined> {
+    const { geo, log } = this.options;
+    const id = item.wayspotId;
+    /** Its places are kept: what fails after is no failed question, and is not asked again. */
+    let saved = false;
+    try {
+      const wayspot = this.options.wayspots?.byId(id);
+      if (!wayspot || (wayspot.kind !== 'stop' && wayspot.kind !== 'powerspot')) {
+        await this.wayspotLookups.remove([id]);
+        return undefined;
+      }
+      const point = { lat: wayspot.lat, lon: wayspot.lon };
+      const answer = await geo.placesNear(point, placesRadius(this.nearestPlace(wayspot)));
+      if (answer.ok || reachedGoogle(answer.reason)) await this.count('places');
+      if (!answer.ok) {
+        if (answer.reason === 'denied') {
+          this.deniedForMs = answer.retryInMs ?? this.placesEveryMs;
+          return this.deniedForMs;
+        }
+        if (answer.reason === 'no-key') return 'empty';
+        return this.wayspotFailed(item);
+      }
+      await this.places.save({
+        wayspotId: id,
+        kind: wayspot.kind,
+        ...point,
+        places: placesText(answer.value),
+        askedAt: this.now(),
+      });
+      saved = true;
+      // Moved or of another kind while Google was asked: it waits again, as it is now.
+      const now = this.options.wayspots?.byId(id);
+      const changed =
+        now !== undefined &&
+        (now.kind !== wayspot.kind || metresBetween(now, wayspot) > WAYSPOT_MOVED_METRES);
+      if (!changed) await this.wayspotLookups.remove([id]);
+      this.misses = 0;
+      if ((await this.lookups.count()) + (await this.wayspotLookups.count()) === 0) return 'empty';
+    } catch (err) {
+      log.warn({ err, wayspot: id }, 'could not bring the places of a Wayspot up to date');
+      // Answered and kept: no failed question, neither set aside nor put back in the line; the
+      // line goes on after its pause.
+      if (saved) return this.placesEveryMs;
+      // Its answer could not be written (or the line not read): as a failed question.
+      return this.wayspotFailed(item);
+    }
+    return undefined;
+  }
+
+  /**
+   * A PokéStop or Power Spot whose turn did not answer: set aside until the next day
+   * (`asideSpots`, also when it is queued again meanwhile), its row after the others of its kind
+   * until it is queued anew (`RETRY_RANK`), and the line waits longer, as after a gym's. Never
+   * rejects.
+   */
+  private async wayspotFailed(item: WaitingWayspot): Promise<number> {
+    this.asideSpots.add(item.wayspotId);
+    this.misses++;
+    try {
+      await this.wayspotLookups.add([{ ...item, rank: RETRY_RANK }], this.now());
+    } catch (err) {
+      this.options.log.warn(
+        { err, wayspot: item.wayspotId },
+        'could not put a Wayspot at the end of the line for Google',
+      );
+    }
+    return Math.min(MAX_RETRY_WAIT_MS, this.placesEveryMs * 2 ** this.misses);
+  }
+
+  /** How far the nearest gym, PokéStop or Power Spot is from a Wayspot; undefined beyond 1 km. */
+  private nearestPlace(wayspot: { id: string; lat: number; lon: number }): number | undefined {
+    let nearest: number | undefined;
+    for (const gym of this.options.directory.all()) {
+      if (Math.abs(gym.lat - wayspot.lat) > 0.01) continue;
+      const metres = metresBetween(gym, wayspot);
+      if (metres <= NEAREST_PLACE_METRES && (nearest === undefined || metres < nearest)) {
+        nearest = metres;
+      }
+    }
+    const other = this.options.wayspots
+      ?.near(wayspot, NEAREST_PLACE_METRES, ['stop', 'powerspot', 'gym'])
+      .find((near) => near.wayspot.id !== wayspot.id);
+    if (other && (nearest === undefined || other.metres < nearest)) nearest = other.metres;
+    return nearest;
+  }
+
   /** Runs work nobody waits for; what it throws is logged. Nothing is started after `stop`. */
   private aside(run: () => Promise<unknown>): void {
     if (this.stopped) return;
diff --git a/src/services/place-finder.test.ts b/src/services/place-finder.test.ts
index a13191a90a988a1c7fda22564eca67bc82786970..28b5476fabda09fb8bab3738a76478d0484f271d 100644
--- a/src/services/place-finder.test.ts
+++ b/src/services/place-finder.test.ts
@@ -7,6 +7,8 @@ import { wayspotsWith } from '../../test/support/wayspots.js';
 import type { Gym } from '../db/repositories/gym-repository.js';
 import type { WayspotRow } from '../domain/wayspots/kept.js';
 import { clearOf, PlaceFinder, placeValue, readPlaceValue } from './place-finder.js';
+import { MemoryWayspotLookups } from './wayspot-lookups.js';
+import { WayspotPlaces } from './wayspot-places.js';
 
 /**
  * Kept Wayspots over the invented gyms: in West a stop called Fountain without an address, a
@@ -228,6 +230,38 @@ describe('PlaceFinder', () => {
     expect(builds()).toBe(1);
   });
 
+  it('finds a stop by the places Google gave around it, once the places tell of them', async () => {
+    const { wayspots } = await wayspotsWith([
+      keptRow(1, { title: 'Fountain', lat: 40.0601, lon: -80.0601, address: null }),
+    ]);
+    const storage = new MemoryWayspotLookups();
+    const places = new WayspotPlaces({ storage, log: createTestLogger().log });
+    const finder = new PlaceFinder({
+      gyms: gymsFixture(),
+      wayspots,
+      places,
+      regions: regionsFixture(),
+      log: createTestLogger().log,
+    });
+    await finder.built();
+    const stops = () =>
+      finder
+        .find(1, WEST_CHANNEL, 'zeppelin bakery')
+        .filter((one) => one.kind === 'stop')
+        .map((one) => one.title);
+    expect(stops()).toEqual([]);
+    await places.save({
+      wayspotId: wayspotId(1),
+      kind: 'stop',
+      lat: 40.0601,
+      lon: -80.0601,
+      places: 'Zeppelin Bakery',
+      askedAt: 1,
+    });
+    await finder.built();
+    expect(stops()).toEqual(['Fountain']);
+  });
+
   it('builds the indexes of stops and Power Spots after each load, not while it searches', async () => {
     const { storage, wayspots } = await wayspotsWith([
       keptRow(1, { title: 'Fountain', lat: 40.0601, lon: -80.0601, address: null }),
diff --git a/src/services/place-finder.ts b/src/services/place-finder.ts
index 68c3f89c8d2dba2f14af56bff22fde6f27f1c31a..dc12bda47123e5f2e6bc3821be8fd5a1a3850649 100644
--- a/src/services/place-finder.ts
+++ b/src/services/place-finder.ts
@@ -23,6 +23,7 @@ import {
   type PlaceKind,
 } from '../domain/search/place-merge.js';
 import { streetOf, WayspotIndex } from '../domain/search/wayspot-index.js';
+import type { WayspotPlaces } from './wayspot-places.js';
 import type { Wayspot } from '../domain/wayspots/kept.js';
 import type { Logger } from '../log.js';
 import type { GymDirectory } from './gym-directory.js';
@@ -72,6 +73,12 @@ export interface PlaceFinderOptions {
   gyms: Pick<GymDirectory, 'search' | 'get' | 'regionsOf' | 'inRegion'>;
   /** The kept Wayspots: their indexes are built anew after every change of what they are. */
   wayspots: WayspotProvider;
+  /**
+   * The places Google gave around the stops and Power Spots (plan 8W-6, `WayspotPlaces`), found
+   * as their gyms' places are; the indexes are built anew when it tells of new ones. Without it
+   * a Wayspot has none.
+   */
+  places?: Pick<WayspotPlaces, 'placesOf' | 'generation' | 'whenChanged'>;
   regions: { all(): readonly Region[] };
   log: Logger;
 }
@@ -91,6 +98,8 @@ export const MEETUP_PLACE_KINDS: readonly PlaceKind[] = ['gym', 'stop'];
 interface Indexes {
   /** The Wayspots' `contentGeneration` they were built at. */
   generation: number;
+  /** The places' `generation` they were built at. */
+  placesGeneration: number;
   stop: WayspotIndex<Wayspot>;
   powerspot: WayspotIndex<Wayspot>;
 }
@@ -98,6 +107,7 @@ interface Indexes {
 /** What is searched before the first build: no stop or power spot. */
 const NO_INDEXES: Indexes = {
   generation: -1,
+  placesGeneration: -1,
   stop: new WayspotIndex<Wayspot>([]),
   powerspot: new WayspotIndex<Wayspot>([]),
 };
@@ -120,6 +130,9 @@ export class PlaceFinder {
     options.wayspots.whenChanged(() => {
       this.schedule();
     });
+    options.places?.whenChanged(() => {
+      this.schedule();
+    });
     this.schedule();
   }
 
@@ -368,17 +381,25 @@ export class PlaceFinder {
 
   /** The indexes of the stops and power spots, built anew when what the Wayspots are changed. */
   private build(): void {
-    const { wayspots, log } = this.options;
+    const { wayspots, places, log } = this.options;
     const generation = wayspots.contentGeneration;
-    if (this.indexes.generation === generation) return;
+    const placesGeneration = places?.generation ?? 0;
+    if (
+      this.indexes.generation === generation &&
+      this.indexes.placesGeneration === placesGeneration
+    ) {
+      return;
+    }
     const started = performance.now();
     const all = wayspots.all();
     const stops = all.filter((wayspot) => wayspot.kind === 'stop');
     const spots = all.filter((wayspot) => wayspot.kind === 'powerspot');
+    const placesOf = (id: string): string | null => places?.placesOf(id) ?? null;
     this.indexes = {
       generation,
-      stop: new WayspotIndex(stops),
-      powerspot: new WayspotIndex(spots),
+      placesGeneration,
+      stop: new WayspotIndex(stops, placesOf),
+      powerspot: new WayspotIndex(spots, placesOf),
     };
     log.info(
       {
diff --git a/src/services/wayspot-places.test.ts b/src/services/wayspot-places.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d05ea6dced88f2dc2cbdc791ee1c6699bd94cf9a
--- /dev/null
+++ b/src/services/wayspot-places.test.ts
@@ -0,0 +1,86 @@
+import { describe, expect, it } from 'vitest';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { MemoryWayspotLookups } from './wayspot-lookups.js';
+import { WayspotPlaces } from './wayspot-places.js';
+
+const ASKED = {
+  wayspotId: 'aa.16',
+  kind: 'stop' as const,
+  lat: 40.05,
+  lon: -80.05,
+  places: 'Corner Bakery',
+  askedAt: 1,
+};
+
+function placesWith(storage = new MemoryWayspotLookups()) {
+  let now = 10_000_000;
+  const timers: { run: () => void; ms: number }[] = [];
+  const places = new WayspotPlaces({
+    storage,
+    log: createTestLogger().log,
+    now: () => now,
+    setTimer: (run, ms) => {
+      const timer = { run, ms };
+      timers.push(timer);
+      return () => {
+        timers.splice(timers.indexOf(timer), 1);
+      };
+    },
+  });
+  let told = 0;
+  places.whenChanged(() => {
+    told++;
+  });
+  return {
+    places,
+    storage,
+    timers,
+    told: () => told,
+    later: (ms: number) => {
+      now += ms;
+    },
+  };
+}
+
+describe('WayspotPlaces', () => {
+  it('reads what was kept, and tells of it at once', async () => {
+    const storage = new MemoryWayspotLookups();
+    await storage.saveAsked(ASKED);
+    const { places, told } = placesWith(storage);
+    expect(places.placesOf('aa.16')).toBeNull();
+    await places.load();
+    expect(places.placesOf('aa.16')).toBe('Corner Bakery');
+    expect(places.get('aa.16')).toEqual(ASKED);
+    expect(told()).toBe(1);
+  });
+
+  it('tells of new answers at most once an hour, never once per answer', async () => {
+    const { places, storage, timers, told, later } = placesWith();
+    await places.load();
+    await places.save({ ...ASKED, askedAt: 2 });
+    // Within the hour of the load: told when the hour is over.
+    expect(told()).toBe(1);
+    expect(timers.map((timer) => timer.ms)).toEqual([3_600_000]);
+    await places.save({ ...ASKED, wayspotId: 'bb.16', places: null });
+    expect(timers).toHaveLength(1);
+    expect(places.placesOf('bb.16')).toBeNull();
+    expect((await storage.asked()).map((row) => row.wayspotId).sort()).toEqual(['aa.16', 'bb.16']);
+    later(3_600_000);
+    timers.shift()?.run();
+    expect(told()).toBe(2);
+    // A quiet hour later an answer is told at once.
+    later(2 * 3_600_000);
+    await places.save({ ...ASKED, places: 'Maple Dental' });
+    expect(told()).toBe(3);
+    expect(timers).toEqual([]);
+  });
+
+  it('forgets dropped places, also in the storage', async () => {
+    const { places, storage } = placesWith();
+    await places.save(ASKED);
+    await places.drop(['aa.16']);
+    expect(places.get('aa.16')).toBeUndefined();
+    expect(await storage.asked()).toEqual([]);
+    expect(places.ids()).toEqual([]);
+  });
+});
diff --git a/src/services/wayspot-places.ts b/src/services/wayspot-places.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5f367b8c1853a00d7c6c0d6f71bb5d8ff2d4d4fa
--- /dev/null
+++ b/src/services/wayspot-places.ts
@@ -0,0 +1,125 @@
+import type { Logger } from '../log.js';
+import type { AskedPlaces, WayspotLookups } from './wayspot-lookups.js';
+
+/** How often at most the search is told of new places while answers arrive. */
+export const PLACES_TOLD_EVERY_MS = 3_600_000;
+
+export interface WayspotPlacesOptions {
+  /** Where the places are kept (`WayspotLookupRepository` in the bot). */
+  storage: Pick<WayspotLookups, 'asked' | 'saveAsked' | 'dropAsked'>;
+  log: Logger;
+  /** Default `PLACES_TOLD_EVERY_MS`. */
+  toldEveryMs?: number;
+  /** Starts a timer and gives the function that cancels it; default `setTimeout`, unref'd. */
+  setTimer?: (run: () => void, ms: number) => () => void;
+  /** Default `Date.now`. */
+  now?: () => number;
+}
+
+/**
+ * The places Google gave around each PokéStop and Power Spot (plan 8W-6), in memory: read at
+ * start, written by `GymUpkeep` as the line's answers arrive, read by the search
+ * (`PlaceFinder`, `WayspotIndex`'s `places`). The search builds its indexes anew when told
+ * (`whenChanged`): at the load, and at most once an hour while answers arrive (a build takes
+ * about half a second for a city), never once per answer.
+ */
+export class WayspotPlaces {
+  private rows = new Map<string, AskedPlaces>();
+  private changes = 0;
+  private toldAt = Number.NEGATIVE_INFINITY;
+  private cancelTimer: (() => void) | undefined;
+  private readonly listeners: (() => void)[] = [];
+  private readonly toldEveryMs: number;
+  private readonly now: () => number;
+  private readonly setTimer: (run: () => void, ms: number) => () => void;
+
+  constructor(private readonly options: WayspotPlacesOptions) {
+    this.toldEveryMs = options.toldEveryMs ?? PLACES_TOLD_EVERY_MS;
+    this.now = options.now ?? Date.now;
+    this.setTimer =
+      options.setTimer ??
+      ((run, ms) => {
+        const timer = setTimeout(run, ms);
+        timer.unref();
+        return () => {
+          clearTimeout(timer);
+        };
+      });
+  }
+
+  /** A number that changes whenever the search is told: what it built at it is current. */
+  get generation(): number {
+    return this.changes;
+  }
+
+  whenChanged(listener: () => void): void {
+    this.listeners.push(listener);
+  }
+
+  /** Reads every Wayspot's places, and tells the search at once. */
+  async load(): Promise<void> {
+    const rows = await this.options.storage.asked();
+    this.rows = new Map(rows.map((row) => [row.wayspotId, row]));
+    this.tell();
+  }
+
+  get(id: string): AskedPlaces | undefined {
+    return this.rows.get(id);
+  }
+
+  /** The names of the places around a Wayspot, as the search reads them; null for none. */
+  placesOf(id: string): string | null {
+    return this.rows.get(id)?.places ?? null;
+  }
+
+  /** The Wayspots whose places are kept. */
+  ids(): string[] {
+    return [...this.rows.keys()];
+  }
+
+  /** Keeps what Google gave around a Wayspot; the search is told within the hour. */
+  async save(row: AskedPlaces): Promise<void> {
+    await this.options.storage.saveAsked(row);
+    this.rows.set(row.wayspotId, row);
+    this.changed();
+  }
+
+  /** Forgets the places of these Wayspots (they became gyms, are gone, or are gyms). */
+  async drop(ids: readonly string[]): Promise<void> {
+    if (ids.length === 0) return;
+    await this.options.storage.dropAsked(ids);
+    for (const id of ids) this.rows.delete(id);
+    this.changed();
+  }
+
+  /** For shutdown: no timer is left. */
+  stop(): void {
+    this.cancelTimer?.();
+    this.cancelTimer = undefined;
+  }
+
+  private changed(): void {
+    if (this.cancelTimer) return;
+    const wait = this.toldAt + this.toldEveryMs - this.now();
+    if (wait <= 0) {
+      this.tell();
+      return;
+    }
+    this.cancelTimer = this.setTimer(() => {
+      this.cancelTimer = undefined;
+      this.tell();
+    }, wait);
+  }
+
+  private tell(): void {
+    this.toldAt = this.now();
+    this.changes += 1;
+    for (const listener of this.listeners) {
+      try {
+        listener();
+      } catch (err) {
+        this.options.log.warn({ err }, 'could not tell of the places around the Wayspots');
+      }
+    }
+  }
+}
````

### Task 4: 8W-6 task 4: a first import's gyms in blocks

Prototype commit: `92749091af92ee56ec6f73ae5fac73b89efe574e`

The import adds its new gyms in blocks of 250 (IMPORT_BLOCK) through GymBatch.addBlock: each gym
decided first as add decides (foreign, near a gym it was not told of), then those accepted
written in one transaction with their nearest gyms (GymStorage.createBlock, nearestBlockChanges:
the nearest-gym scan once per block instead of once per gym), the directory read in one turn
(GymDirectory.refreshGyms) and the line written once (GymUpkeep.placedBlock). A refused gym is
reported as before without failing its block; a block whose transaction fails left nothing and
is added gym by gym, so a bad gym fails alone. The lock is held across all blocks; matches, the
review queue, the kept Wayspots and the one summary are unchanged.

Builder's choices:
- Per-gym outcomes of a block: decided before the insert (refusals), and a retry one by one
  after a failed transaction, not savepoints.
- Gyms within one block are known to each other: the one-by-one path added every gym it added
  to `known`, so two Wayfarer gyms within 10 m of each other were both added; the block keeps
  that (the design read the one-by-one path as refusing them).
- MemoryGyms counts blocks (`blocks`) and refuses rows by name (`refuseNames`), as a database
  refuses a bad row; its writes that throw now reject instead of escaping the fake.

**Files:**

```
 docs/architecture/wayfarer.md                 |   3 ++-
 src/db/repositories/gym-repository.db.test.ts |  43 ++++++++++++++++++++++++++++++++++++++++++
 src/db/repositories/gym-repository.ts         |  95 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------------------------
 src/domain/gyms/nearest.test.ts               |  53 ++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/domain/gyms/nearest.ts                    |  37 ++++++++++++++++++++++++++++++++++++
 src/services/gym-admin-service.test.ts        |  57 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/gym-admin-service.ts             | 151 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----
 src/services/gym-directory.test.ts            |  17 +++++++++++++++++
 src/services/gym-directory.ts                 |  20 ++++++++++++++++++++
 src/services/gym-upkeep.test.ts               |  35 ++++++++++++++++++++++++++++++++++
 src/services/gym-upkeep.ts                    |  34 +++++++++++++++++++++++++++++++++
 src/services/wayfarer-import-service.test.ts  |  52 ++++++++++++++++++++++++++++++++++++++++++++++----
 src/services/wayfarer-import-service.ts       |  86 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--------------------
 test/support/gym-store.ts                     |  70 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 14 files changed, 695 insertions(+), 58 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/gyms/nearest.test.ts src/services/gym-admin-service.test.ts src/services/gym-directory.test.ts src/services/gym-upkeep.test.ts src/services/wayfarer-import-service.test.ts`, `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/repositories/gym-repository.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 92749091af92ee56ec6f73ae5fac73b89efe574e -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-25-phase-8w6-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8W-6 task 4: a first import's gyms in blocks`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/wayfarer.md b/docs/architecture/wayfarer.md
index 9a0b76db6b3508ee1ee5117d0af2a6714ed56b0d..9bee52003d174bbe53f78ba2436862c5a290fc62 100644
--- a/docs/architecture/wayfarer.md
+++ b/docs/architecture/wayfarer.md
@@ -17,7 +17,8 @@ The true list of gyms from Wayfarer: the export file and its parts, S2 cells and
 ## Matching and the import
 
 - Matching gyms to Wayspots is pure (`src/domain/wayspots/match.ts`, `matchGyms(input): ImportPlan`): by id (a `pogoId` that is a Wayfarer gym of the file; beyond `CANDIDATE_METRES` 100 m it is asked about instead of moving the gym; of two gyms that hold one id the nearer to the Wayspot is it, ties to the lower id, and the other shares it (plan 8W-3): it goes on as a gym never matched, and if nothing takes it it is asked about with that Wayspot as its own candidate marked `heldBy` the nearer gym, a `missing` item unless a Wayfarer gym near makes it a `match`; such a candidate has no "Same as" or "New gym", and `/gym review` says "<gym> shares its Wayspot **T** with <holder>, which lies nearer to it: that gym is the Wayspot now.", however far it lies, and for a Wayspot that is a PokéStop or Power Spot now "… shares its Wayspot **T**, a PokéStop now, with <holder>, which lies nearer to it and holds it too."), then certain among the Wayspots not taken, exactly one by `certainBy` (title equal by `nameKey` within `CERTAIN_NAME_METRES` 20, equal but for "the", "a", "an" and punctuation by `looseNameKey` within `CERTAIN_LOOSE_METRES` 50, any title within `CERTAIN_PLACE_METRES` 5 for a Wayfarer gym only; a gym marked "not in Wayfarer" only by id or name), or exactly one by name beside others by place alone (`certainPick`), every pick by name before any by place alone (a pass takes picks by place only when it has none by name), within each the gyms ordered by the Wayspot each would take, nearest first, and again while a pass takes anything (never a gym whose Wayfarer id the file lacks where it did not cover every cell within `COVERED_AROUND_METRES` of it, plan 8W-3: that Wayspot is there, unseen, maybe across the edge of the gym's cell; such a gym is `notCovered` with the first uncovered cell, and `isOtherWayspot` reads the same); a Wayspot goes to at most one gym, and the Wayfarer ids of gyms outside the input are taken. A Wayfarer gym nobody took is offered to a gym within 100 m that may be it (neither matched nor marked; not one whose Wayfarer id the file lacks where it did not cover the gym's cell, which is a Wayspot the file did not see; not one whose last answer was "None of these" about that Wayspot, `MatchInput.refused`, from `latestDecided`), its namesake first, else the nearest, each gym at most `MAX_CANDIDATES` such Wayspots with its own first (the rest go to the next such gym; when every gym that may be it has its five, it is neither offered nor added but `held`, and a later import offers it once a place is free); with none it is added where it lies in the regions, unless a gym outside the input that may be it (`MatchInput.others`, `isOtherWayspot`: not marked, and its id neither a Wayfarer gym of the file nor absent where the file did not cover it, and its latest decided item of any server, `latestDecided('any', ...)`, not "None of these" about that Wayspot) lies within 100 m: then it is `held` too (counted in the preview, "N Wayfarer gyms wait for a question about a gym nearby", logged, listed in the report, not added); stops and Power Spots are never added. The rest is queued (`ReviewItem`) with up to `MAX_CANDIDATES` 5 candidates within 100 m (never a Wayspot the plan adds: it becomes a gym of its own): `match` when a Wayfarer gym is among them, else `missing` (its own Wayspot is a stop or Power Spot now, or its id is gone from a covered cell) or `unknown` (never matched, cell covered), a gone id and `unknown` only where every cell within `COVERED_AROUND_METRES` 50 of the gym is covered (`cellsAround`: its point and eight points that far; a gym whose own Wayspot was seen as a stop or Power Spot is `missing` whatever the coverage); a gym in an uncovered cell, or near one, is otherwise `notCovered` (with the first uncovered cell), a marked one counted. A candidate keeps Wayfarer's address (`ReviewCandidate.address`, absent where Wayfarer has none and on items stored before 8W-3), which "Same as" and "New gym" write instead of asking Google (an older item falls back to the kept Wayspot's address). A match writes `pogoId`, the title as name (`newGymName`, tidied by `gym-text.ts`; a blank or too long title leaves the name), the picture (`pictureOf`, at most `MAX_PICTURE_ADDRESS`), and the place when farther than `MOVE_METRES` 3 (`matchChange`). A Wayfarer gym outside the regions that no gym took (here or elsewhere), none is offered and none may be (of the input or of `others`), that lies in no region of another server (`mayPlace`), within the file's margin of an outline (`MatchInput.nearOutline`), is listed in `outsideGyms` (`OutsideGym`: metres from the nearest outline and that region's channel), never added; stops and Power Spots outside are not listed. `withAnswers` leaves out what staff answered already (`stillAnswered` with the new file's covered cells, plan 8W-3: a Wayspot answered about whose cell the new file did not cover is not missed, so that two files covering different cells around a gym do not ask again; a Wayspot new to the question is a change wherever it lies). The CSV of the preview is `importReportCsv` (`src/render/wayfarer-report.ts`, one line per gym, per added Wayspot, per `held` one (with the gym that holds it back where the server may name it: the considered gyms and `WayfarerPreview.holders`, the gyms outside the import it may touch; else no gym) and per `outside` Wayfarer gym, the last with its metres and the nearest region's channel name in the column `region`, empty when the bot does not see the channel).
-- The import is `ctx.wayfarer` (`WayfarerImportService`, `src/services/wayfarer-import-service.ts`): `preview(staff, file)` plans and writes nothing; `apply(staff, file)` plans again inside `GymAdminService.batch` against the gyms as they are then and writes that plan, each gym's write decided before any of it is written (`mayPlace` first: a match that would move a gym where the server may not put it is held and asked about); each match is one row write (a move takes the other fields as its `patch`: a move refused when the regions changed meanwhile writes nothing, and the summary counts a rename only with its move); a write that fails is counted and logged, and the import goes on; a move over `REFETCH_METRES` 25 takes the Wayspot's address and has its places fetched again, in `GymUpkeep`'s line (`placed(id, { places: 'later', address })`; its address too when the Wayspot's names no street); the outcome says what was not recorded (`Unrecorded`). It considers the gyms this server may touch (`mayTouch`) that lie in its regions, and gyms in no region of any server that lie within 100 m of one of its outlines (`nearRing`, `region-membership.ts`) or in a covered cell; Wayspots outside the regions count only near those gyms. The count `outside` (preview and outcome: "N Wayfarer gyms lie just outside every region of this server: your outlines may leave them out") is `plan.outsideGyms`, measured by `metresFromRing` (`region-membership.ts`, beside `grownBox`) against the server's outlines within `file.margin` (none for a file without a margin); the `ignored` Wayspots may include them. `GymAdminService.batch(place, source, work)` runs `work(ops)` under the admin lock with `GymBatch` (`add`, `move` with an optional `patch`, `update` of `BatchPatch`, `remove`), none of which takes the lock or announces: what it changed is announced in one summary at the end, also when `work` failed (`source` decides when it is posted: gathered for the review, at once otherwise; the summary names no source, Matt, 2026-10-16); work that asks for the lock from inside never finishes. `delete(id, by, place, onlyIf)` asks `onlyIf` under the lock first and answers `withdrawn` when it no longer holds.
+- The import is `ctx.wayfarer` (`WayfarerImportService`, `src/services/wayfarer-import-service.ts`): `preview(staff, file)` plans and writes nothing; `apply(staff, file)` plans again inside `GymAdminService.batch` against the gyms as they are then and writes that plan, each gym's write decided before any of it is written (`mayPlace` first: a match that would move a gym where the server may not put it is held and asked about); each match is one row write (a move takes the other fields as its `patch`: a move refused when the regions changed meanwhile writes nothing, and the summary counts a rename only with its move); a write that fails is counted and logged, and the import goes on; a move over `REFETCH_METRES` 25 takes the Wayspot's address and has its places fetched again, in `GymUpkeep`'s line (`placed(id, { places: 'later', address })`; its address too when the Wayspot's names no street); the outcome says what was not recorded (`Unrecorded`). It considers the gyms this server may touch (`mayTouch`) that lie in its regions, and gyms in no region of any server that lie within 100 m of one of its outlines (`nearRing`, `region-membership.ts`) or in a covered cell; Wayspots outside the regions count only near those gyms. The count `outside` (preview and outcome: "N Wayfarer gyms lie just outside every region of this server: your outlines may leave them out") is `plan.outsideGyms`, measured by `metresFromRing` (`region-membership.ts`, beside `grownBox`) against the server's outlines within `file.margin` (none for a file without a margin); the `ignored` Wayspots may include them. `GymAdminService.batch(place, source, work)` runs `work(ops)` under the admin lock with `GymBatch` (`add`, `addBlock`, `move` with an optional `patch`, `update` of `BatchPatch`, `remove`), none of which takes the lock or announces: what it changed is announced in one summary at the end, also when `work` failed (`source` decides when it is posted: gathered for the review, at once otherwise; the summary names no source, Matt, 2026-10-16); work that asks for the lock from inside never finishes. `delete(id, by, place, onlyIf)` asks `onlyIf` under the lock first and answers `withdrawn` when it no longer holds.
+- The new gyms of an import are added in blocks of `IMPORT_BLOCK` 250 (plan 8W-6; a city's first import adds thousands, which one by one held the lock and `/gym` for minutes): `GymBatch.addBlock` decides each gym first as `add` does (`foreign`; `near` a gym not among its `knownNearIds`, the import's matched, marked and added gyms; the gyms of the block are known to each other, as the gyms an import added one by one always were: two Wayfarer gyms within 10 m of each other are both added), then writes those accepted in one transaction with the nearest gyms worked out once for the block (`GymStorage.createBlock`, `nearestBlockChanges` of `src/domain/gyms/nearest.ts`: each new gym's nearest among all, and every other gym the block's nearest where it is nearer; the nearest-gym scan once per block, not per gym), then reads them into the directory in one turn (`GymDirectory.refreshGyms`) and puts them and the gyms whose nearest gym changed in the line once (`GymUpkeep.placedBlock`). A gym refused is reported as before (`held`, logged) without failing its block; a block whose transaction fails left nothing and is added gym by gym (`failed` for a gym that cannot be written, logged). The lock is held across all blocks, and each block is a line in the log (`a block of Wayfarer gyms was added`: which of how many, and its gyms added, held and failed), by which staff follow a first import. One list of the gyms they may stand beside serves a whole block. Matches, the review queue, the kept Wayspots and the summary are as before. Tests: `MemoryGyms.blocks` counts the blocks written, `refuseNames` has a write refuse a gym by its name.
 - `/gym import` (`src/commands/gyms/import.ts`) previews in a v2 message (counts in sentences, by region, the stops of Pine's own within 30 m of an imported stop named for staff to remove, plan 8R-1 `pineStopsNear`, `wayfarer-import.csv` as a file component, Import / Cancel) and keeps the parsed export in its own `pendingImports` (`MAX_PENDING_IMPORTS` 3, `IMPORT_PENDING_MINUTES` 30) under the token of `gym:<token>:wayfarer-import|wayfarer-cancel`, only what Import reads of it (`forImport`: no descriptions, no status; plan 8W-3); an export that would change nothing gets no Import (`changesNothing`; an item counts as queued already, `queuedAlready`, only when an open item asks the same kind about the same set of candidate ids; a preview that could not read the kept Wayspots may change them: it offers Import and says why it cannot tell, `KEPT_UNREAD`). The sentences of the preview, the outcome and the question are cut by `sentencesText` (`cutMarkdown`: never inside a mention, a code span or bold). Import replaces the preview with "Importing…", then the outcome, or a failure line when `apply` throws; when that edit fails (an import may outlast the interaction) the outcome is logged.
 - The scanned area of an export is its own outlines grown by its margin, never the server's regions of the day (`src/domain/wayspots/scanned-area.ts`): the preview says where they differ (`compareOutlines`: regions not as scanned, areas that are no region now) and lists the gyms this server may touch that lie in no region of any server beyond the area (`gymsBeyond`, `WayfarerImportService.outsideArea`, the report's `beyond`). After an import of a finished scan with a margin (`mayDeleteOutside`: every cell of the area received, `scanFinished`) whose outlines are every region of the server as it is now (while `compareOutlines` names a region not scanned, `outsideArea` gives nothing and the preview says why), the outcome offers "Delete N gyms outside the area…" (`gym:<token>:outside-ask`, then `outside-delete` / `outside-keep` of a private question naming the first `OUTSIDE_NAMED` and what goes with them; the area alone is kept in `pendingOutside`, the question under `questionToken` of the outcome's token, so that asking again replaces it and presses do not crowd the store; it names each gym's metres from the nearest outline, as the report's `beyond` lines do): the list is worked out again at each press (the question and the deletion, under the lock, refuse with nothing deleted when a region was added or changed since: `OutsideDeletion.regionsNotScanned`), each gym deleted through `GymBatch.remove` (gym administration's deletion under the batch's lock; an active raid keeps its gym, named), one summary at the end (`deleteOutside`).
 - An imported gym takes the Wayspot's address (`wayfarerGeodata`, `src/domain/geo/wayfarer-address.ts`: Wayfarer's address read as Google's address parts, a plus code dropped, null without a street), as does a matched gym without an address or moved beyond `REFETCH_METRES`; Google is then asked for its places only (`GymUpkeep.placed(id, { places: 'later', address: false })`, `GymBatch.move(…, { address })`). What waits for Google is a line in the database (`GymLookups`: `GymLookupRepository`, table `GymLookup` of migration 014 with its `regionRank` of migration 031; twin `MemoryGymLookups`; both run `gymLookupCases`; plan 8W-6, `gyms-and-regions.md` for the budget and the ranks): gyms by the rank of their best region, then by the time queued, one every few seconds, one at a time (a gym stays in the line while it is asked about, and one put in it again before its turn is written down keeps its row), each question counted by itself when it reached Google, and one whose geocode did not answer kept waiting for its address (to the end of the line); while Geocoding is refused (`denied`) a gym that waits for its address asks no Places (each is billed) and keeps its place in the line, and the line goes on with the gyms that wait for their places alone (`GymLookups.next({ placesOnly })`), waiting out the refusal only when every gym left waits for its address, and in either refused path an address asked for again during the turn keeps waiting (plan 8W-3); its upsert uses MySQL's row alias (`INSERT … AS new`), never `VALUES()`, deprecated since 8.0.20, as do the Wayfarer tables' (`lastWarnings` in their database tests); taken up at start (`resume`); a gym added or moved by hand is still asked about at once, and counted.
diff --git a/src/db/repositories/gym-repository.db.test.ts b/src/db/repositories/gym-repository.db.test.ts
index f8d0b3c97102c2b3deefe12b7d98d1bba0f4a931..52f39fd8b2dbf104858c988f3eb3511ff1c952bc 100644
--- a/src/db/repositories/gym-repository.db.test.ts
+++ b/src/db/repositories/gym-repository.db.test.ts
@@ -99,6 +99,49 @@ describe('GymRepository', () => {
     expect(await gyms.get(created.id)).toEqual(created);
   });
 
+  it('creates a block of gyms and their nearest gyms in one transaction, all or nothing', async () => {
+    const old = await gyms.create({ name: 'Old Gym', lat: 40.45, lon: -80 });
+    const created = await gyms.createBlock(
+      [
+        { name: 'Café & Co', lat: 40.4501, lon: -80, pogoId: 'aa.16', geodata: '{"a":1}' },
+        { name: 'Second', lat: 40.46, lon: -80 },
+      ],
+      (made) => {
+        const [first, second] = made;
+        return [
+          { id: old.id, nearestGym: first!.id },
+          { id: first!.id, nearestGym: old.id },
+          { id: second!.id, nearestGym: first!.id },
+        ];
+      },
+    );
+    expect(created.map((gym) => [gym.name, gym.pogoId, gym.geodata])).toEqual([
+      ['Café & Co', 'aa.16', '{"a":1}'],
+      ['Second', null, null],
+    ]);
+    const [first, second] = created;
+    expect(created.map((gym) => gym.nearestGym)).toEqual([old.id, first!.id]);
+    expect((await gyms.get(old.id))?.nearestGym).toBe(first!.id);
+    expect((await gyms.get(second!.id))?.name).toBe('Second');
+    // A block that fails half-way leaves nothing of it.
+    const before = (await gyms.listAll()).length;
+    await expect(
+      gyms.createBlock([{ name: 'Third', lat: 40.47, lon: -80 }], () => {
+        throw new Error('no nearest gyms');
+      }),
+    ).rejects.toThrow('no nearest gyms');
+    await expect(
+      gyms.createBlock(
+        [
+          { name: 'Fourth', lat: 40.48, lon: -80 },
+          { name: 'x'.repeat(300), lat: 40.49, lon: -80 },
+        ],
+        () => [],
+      ),
+    ).rejects.toThrow();
+    expect(await gyms.listAll()).toHaveLength(before);
+  });
+
   it('measures a text as it is stored', async () => {
     expect(storedTextLength('Big Fountain')).toBe(12);
     expect(storedTextLength("Rosie's")).toBe(he.encode("Rosie's").length);
diff --git a/src/db/repositories/gym-repository.ts b/src/db/repositories/gym-repository.ts
index 15926c0b46ac63dd25f4a4d4b5a4631dfc4b0d54..f1a8a10d6f7021e257675505b7a0cf56672a84ed 100644
--- a/src/db/repositories/gym-repository.ts
+++ b/src/db/repositories/gym-repository.ts
@@ -172,11 +172,54 @@ function metaColumns(patch: GymPatch): Updateable<DB['GymMeta']> {
   return columns;
 }
 
+/** A gym's nearest gym to write (`nearestBlockChanges`). */
+export interface NearestWrite {
+  id: number;
+  nearestGym: number | null;
+}
+
+/** Inserts a gym and its metadata (inside the caller's transaction); gives its id. */
+async function insertGym(trx: Kysely<DB>, gym: NewGym): Promise<number> {
+  const inserted = await trx
+    .insertInto('Gym')
+    .values({
+      name: he.encode(gym.name),
+      lat: gym.lat,
+      lon: gym.lon,
+      pogoId: gym.pogoId ?? null,
+    })
+    .executeTakeFirstOrThrow();
+  const gymId = Number(inserted.insertId);
+  await trx
+    .insertInto('GymMeta')
+    .values({
+      gymId,
+      nickname: encode(gym.nickname ?? null),
+      description: encode(gym.description ?? null),
+      notice: encode(gym.notice ?? null),
+      keywords: formatKeywords(gym.keywords ?? []),
+      imageUrl: gym.imageUrl ?? null,
+      geodata: gym.geodata ?? null,
+    })
+    .execute();
+  return gymId;
+}
+
 /** What gym administration needs of the tables; lets tests keep the gyms in memory. */
 export interface GymStorage {
   get(id: number): Promise<Gym | undefined>;
   listAll(): Promise<Gym[]>;
   create(gym: NewGym): Promise<Gym>;
+  /**
+   * Creates gyms as one (plan 8W-6: a block of a Wayfarer import), with the nearest gyms that
+   * `nearest` works out from the created gyms (theirs and those of other gyms), in one
+   * transaction: all of it, or nothing when anything fails (also `nearest`). Gives the gyms as
+   * created, in order, with their nearest gym.
+   */
+  createBlock(
+    gyms: readonly NewGym[],
+    nearest: (created: readonly Gym[]) => readonly NearestWrite[],
+  ): Promise<Gym[]>;
   /** Undefined, having written nothing, when there is no such gym. */
   update(id: number, patch: GymPatch): Promise<Gym | undefined>;
   /** False when there was no such gym. */
@@ -247,36 +290,38 @@ export class GymRepository implements GymStorage {
   }
 
   async create(gym: NewGym): Promise<Gym> {
-    const id = await inTransaction(this.db, async (trx) => {
-      const inserted = await trx
-        .insertInto('Gym')
-        .values({
-          name: he.encode(gym.name),
-          lat: gym.lat,
-          lon: gym.lon,
-          pogoId: gym.pogoId ?? null,
-        })
-        .executeTakeFirstOrThrow();
-      const gymId = Number(inserted.insertId);
-      await trx
-        .insertInto('GymMeta')
-        .values({
-          gymId,
-          nickname: encode(gym.nickname ?? null),
-          description: encode(gym.description ?? null),
-          notice: encode(gym.notice ?? null),
-          keywords: formatKeywords(gym.keywords ?? []),
-          imageUrl: gym.imageUrl ?? null,
-          geodata: gym.geodata ?? null,
-        })
-        .execute();
-      return gymId;
-    });
+    const id = await inTransaction(this.db, (trx) => insertGym(trx, gym));
     const created = await this.get(id);
     if (!created) throw new Error(`Gym ${id} vanished after insert`);
     return created;
   }
 
+  async createBlock(
+    gyms: readonly NewGym[],
+    nearest: (created: readonly Gym[]) => readonly NearestWrite[],
+  ): Promise<Gym[]> {
+    return inTransaction(this.db, async (trx) => {
+      const ids: number[] = [];
+      for (const gym of gyms) ids.push(await insertGym(trx, gym));
+      const inBlock = new GymRepository(trx);
+      const created = toGyms(
+        await inBlock.select().where('Gym.id', 'in', ids).orderBy('Gym.id').execute(),
+      );
+      const writes = nearest(created);
+      for (const { id, nearestGym } of writes) {
+        await trx
+          .insertInto('GymMeta')
+          .values({ gymId: id, nearestGym })
+          .onDuplicateKeyUpdate({ nearestGym })
+          .execute();
+      }
+      const written = new Map(writes.map((write) => [write.id, write.nearestGym]));
+      return created.map((gym) =>
+        written.has(gym.id) ? { ...gym, nearestGym: written.get(gym.id) ?? null } : gym,
+      );
+    });
+  }
+
   /**
    * Changes the given fields. Returns the gym afterwards. Returns undefined, having written
    * nothing, when the gym does not exist or has no coordinates (such a gym is invisible to the
diff --git a/src/domain/gyms/nearest.test.ts b/src/domain/gyms/nearest.test.ts
index 3939bb82a7aa5f3e55e6875db96c93fff51e0561..c4211ad061dd056c1ab20920df2544ba4a2d9ef9 100644
--- a/src/domain/gyms/nearest.test.ts
+++ b/src/domain/gyms/nearest.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from 'vitest';
 import { nearestTo } from '@pine/wayspot-core/distance';
-import { nearestGymChanges, type NearGym } from './nearest.js';
+import { nearestBlockChanges, nearestGymChanges, type NearGym } from './nearest.js';
 
 /** Gyms on one line, a hundredth of a degree of latitude (1.1 km) per step of `at`. */
 const gym = (id: number, at: number, nearestGym: number | null = null): NearGym => ({
@@ -169,3 +169,54 @@ describe('nearestGymChanges', () => {
     }
   });
 });
+
+describe('nearestBlockChanges', () => {
+  it('settles the gyms of a block added at once and those they are nearer to, as a full comparison', () => {
+    // 1 at 0, 2 at 1, 3 at 5, 4 at 6; a block of 5 at 4.6, 6 at 4.7 and 7 at 20 (far away).
+    const before = settled([gym(1, 0), gym(2, 1), gym(3, 5), gym(4, 6)]);
+    const gyms = [...before, gym(5, 4.6), gym(6, 4.7), gym(7, 20)];
+    const changes = nearestBlockChanges(gyms, new Set([5, 6, 7]));
+    expect(changes).toEqual([
+      { id: 3, nearestGym: 6 },
+      { id: 5, nearestGym: 6 },
+      { id: 6, nearestGym: 5 },
+      { id: 7, nearestGym: 4 },
+    ]);
+    expect(applied(gyms, changes)).toEqual(settled(gyms));
+  });
+
+  it('agrees with a full comparison on random towns and blocks, ties to the lower id', () => {
+    let state = 20261025;
+    const random = (): number => {
+      state = (state + 0x6d2b79f5) | 0;
+      let t = Math.imul(state ^ (state >>> 15), 1 | state);
+      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
+      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
+    };
+    for (let round = 0; round < 200; round++) {
+      const town: NearGym[] = [];
+      const size = Math.floor(random() * 12);
+      for (let id = 1; id <= size; id++) {
+        town.push({ id, lat: 40 + random() * 0.02, lon: -80 + random() * 0.02, nearestGym: null });
+      }
+      const before = settled(town);
+      const block: NearGym[] = [];
+      const count = 1 + Math.floor(random() * 8);
+      for (let id = size + 1; id <= size + count; id++) {
+        // A few share a place with another gym: ties.
+        const twin = random() < 0.15 ? [...before, ...block][0] : undefined;
+        block.push({
+          id,
+          lat: twin ? twin.lat : 40 + random() * 0.02,
+          lon: twin ? twin.lon : -80 + random() * 0.02,
+          nearestGym: null,
+        });
+      }
+      const gyms = [...before, ...block];
+      const added = new Set(block.map((one) => one.id));
+      expect(applied(gyms, nearestBlockChanges(gyms, added)), `block ${round}`).toEqual(
+        settled(gyms),
+      );
+    }
+  });
+});
diff --git a/src/domain/gyms/nearest.ts b/src/domain/gyms/nearest.ts
index dd255160037a426e44a51c16e54c2862435c63f6..6238b85f5b5a601d03e894ba71b845e6f9162779 100644
--- a/src/domain/gyms/nearest.ts
+++ b/src/domain/gyms/nearest.ts
@@ -60,3 +60,40 @@ export function nearestGymChanges(gyms: readonly NearGym[], event: NearestEvent)
   }
   return changes.sort((a, b) => a.id - b.id);
 }
+
+/**
+ * `nearestGymChanges` for a block of gyms added at once (plan 8W-6: a Wayfarer import adds its
+ * new gyms in blocks), worked out once for the block instead of once per gym: each new gym looks
+ * for its nearest among all gyms (the others of the block too), and every other gym takes the
+ * nearest of the block when it is nearer than the one it points at (or it points at none, or at
+ * one that does not exist). Of two gyms equally near, the lower id. Sorted by id.
+ */
+export function nearestBlockChanges(
+  gyms: readonly NearGym[],
+  added: ReadonlySet<number>,
+): NearestChange[] {
+  const byId = new Map(gyms.map((gym) => [gym.id, gym]));
+  const block = gyms.filter((gym) => added.has(gym.id));
+  const changes: NearestChange[] = [];
+  const note = (gym: NearGym, nearest: number | null): void => {
+    if (gym.nearestGym !== nearest) changes.push({ id: gym.id, nearestGym: nearest });
+  };
+  for (const gym of gyms) {
+    const pointsAt = gym.nearestGym === null ? undefined : byId.get(gym.nearestGym);
+    if (added.has(gym.id) || !pointsAt || pointsAt.id === gym.id) {
+      note(gym, nearestTo(gym, gyms)?.place.id ?? null);
+      continue;
+    }
+    let best = pointsAt;
+    let bestMetres = metresBetween(gym, pointsAt);
+    for (const other of block) {
+      const metres = metresBetween(gym, other);
+      if (metres < bestMetres || (metres === bestMetres && other.id < best.id)) {
+        best = other;
+        bestMetres = metres;
+      }
+    }
+    note(gym, best.id);
+  }
+  return changes.sort((a, b) => a.id - b.id);
+}
diff --git a/src/services/gym-admin-service.test.ts b/src/services/gym-admin-service.test.ts
index 27fc1804b491a42b8838e88c93d45915646a8fea..ac72bbd559fb62cb86ee2a498e44c4c337f917fb 100644
--- a/src/services/gym-admin-service.test.ts
+++ b/src/services/gym-admin-service.test.ts
@@ -1327,6 +1327,63 @@ describe('GymAdminService.batch', () => {
     ]);
   });
 
+  it('adds a block of gyms in one transaction, their nearest gyms worked out once for it', async () => {
+    const made = await gymAdminWith();
+    const library = gymOf(made, 1);
+    const beside = { lat: library.lat + 0.00005, lon: library.lon };
+    const twin = { lat: FREE.lat + 0.00003, lon: FREE.lon };
+    const outcomes = await made.admin.batch(STAFF_PLACE, 'import', (ops) =>
+      ops.addBlock([
+        { gym: { name: 'Clock Tower', ...FREE, geodata: '{"addressComponents":{}}' } },
+        // Within ten metres of a gym it was not told of: not added.
+        { gym: { name: 'Mural', ...beside } },
+        { gym: { name: 'Mural Too', ...beside }, knownNearIds: [1] },
+        // Within ten metres of another gym of the block: added, as one by one (both exist).
+        { gym: { name: 'Clock Twin', ...twin } },
+        { gym: { name: 'Far', ...NORTH_PLACE }, promoted: true },
+      ]),
+    );
+    expect(outcomes.map((outcome) => outcome.kind)).toEqual([
+      'added',
+      'near',
+      'added',
+      'added',
+      'added',
+    ]);
+    expect(outcomes[1]).toMatchObject({ near: [{ gym: { id: 1 } }] });
+    expect(made.gymStore.blocks).toBe(1);
+    const [clock, , muralToo, clockTwin] = outcomes.map((outcome) =>
+      outcome.kind === 'added' ? outcome.gym.id : 0,
+    );
+    expect(made.gymStore.row(clock!)?.nearestGym).toBe(clockTwin);
+    expect(made.gymStore.row(clockTwin!)?.nearestGym).toBe(clock);
+    // The library's nearest gym is the new mural beside it now.
+    expect(made.gymStore.row(1)?.nearestGym).toBe(muralToo);
+    expect(made.directory.regionsOf(clock!)).toEqual([WEST_CHANNEL]);
+    // In the line: the clock tower for its places, the others for their address too.
+    expect(await made.upkeep.waiting()).toBeGreaterThanOrEqual(4);
+    expect(made.geo.asked).toEqual([]);
+    await settle(made);
+    expect(announced(made).map((message) => textOf(message))).toEqual([
+      '### The gym list changed\nProfessor Pine has added 4 gyms (1 of them was a PokéStop).',
+    ]);
+  });
+
+  it('adds a block gym by gym when its transaction fails, so that one bad gym fails alone', async () => {
+    const made = await gymAdminWith();
+    made.gymStore.refuseNames.add('Bad Gym');
+    const outcomes = await made.admin.batch(STAFF_PLACE, 'import', (ops) =>
+      ops.addBlock([
+        { gym: { name: 'Clock Tower', ...FREE } },
+        { gym: { name: 'Bad Gym', lat: 40.02, lon: -80.03 } },
+        { gym: { name: 'Far', ...NORTH_PLACE } },
+      ]),
+    );
+    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['added', 'failed', 'added']);
+    expect(made.gymStore.blocks).toBe(0);
+    expect(made.directory.all().filter((gym) => gym.name === 'Bad Gym')).toEqual([]);
+  });
+
   it('adds beside a gym it was told of, and nowhere near another', async () => {
     const made = await gymAdminWith();
     const library = gymOf(made, 1);
diff --git a/src/services/gym-admin-service.ts b/src/services/gym-admin-service.ts
index d53afa60afb969581e812a64e6f4e45b30ba41b7..58a55cc2a3616eb886c24d481aa5ef209bf98f2e 100644
--- a/src/services/gym-admin-service.ts
+++ b/src/services/gym-admin-service.ts
@@ -15,6 +15,7 @@ import type { LatLon } from '@pine/wayspot-core/lat-lon';
 import { readLocation } from '../domain/geo/location-input.js';
 import { ringContains } from '@pine/wayspot-core/region-membership';
 import { withinReach } from '../domain/gyms/gym-server.js';
+import { nearestBlockChanges } from '../domain/gyms/nearest.js';
 import type { GymTexts } from '../domain/gyms/gym-text.js';
 import { isRaid, isTrain, type RaidParty, type TrainParty } from '../domain/party/party.js';
 import type { Logger } from '../log.js';
@@ -112,6 +113,17 @@ export type BatchPatch = Pick<GymPatch, 'name' | 'pogoId' | 'imageUrl' | 'geodat
 /** What came of a move in a batch: as `move`, without the questions a batch does not ask. */
 export type BatchMoveOutcome = Extract<MoveOutcome, { kind: 'moved' | 'foreign' }>;
 
+/** A gym of a block (`GymBatch.addBlock`): the gym, the gyms near it it may stand beside. */
+export interface BlockGym {
+  gym: NewGym;
+  knownNearIds?: readonly number[];
+  /** It was a PokéStop, which the summary counts. */
+  promoted?: boolean;
+}
+
+/** What came of a gym of a block: as `add`, or `failed` when it could not be written. */
+export type BlockOutcome = AddOutcome | { kind: 'failed' };
+
 /**
  * Gym administration inside `GymAdminService.batch`, under the lock the batch holds: what a
  * Wayfarer import (and a decision of its review queue) does to many gyms at once. Each method
@@ -132,6 +144,17 @@ export interface GymBatch {
     knownNearIds?: readonly number[],
     options?: { promoted?: boolean },
   ): Promise<AddOutcome>;
+  /**
+   * Adds gyms as one block (plan 8W-6: a Wayfarer import's new gyms, in blocks of
+   * `IMPORT_BLOCK`): each is decided first as `add` decides (`foreign`, `near` a gym not among
+   * its `knownNearIds`; the other gyms of the block count as known to each other, as the gyms an
+   * import added one by one were), then those accepted are written in one transaction with the
+   * nearest gyms worked out once for the block (`nearestBlockChanges`), and the directory and
+   * the line follow once for the block. When the block's transaction fails, nothing of it was
+   * written and its gyms are added one by one, so that a gym that cannot be written fails alone
+   * (`failed`, logged). One outcome per gym, in order.
+   */
+  addBlock(gyms: readonly BlockGym[]): Promise<BlockOutcome[]>;
   /**
    * Moves a gym, wherever other gyms are (the batch knows where it puts gyms); `places` says
    * whether its address and the places around it are fetched again (`GymUpkeep.placed`, in its
@@ -205,7 +228,10 @@ export interface GymAdminOptions {
   trains: Pick<TrainService, 'gymRemoved'>;
   routes: Pick<SavedRouteUpkeep, 'countWithGym'>;
   targets: Pick<GymTargetUpkeep, 'membersTargeting'>;
-  upkeep: Pick<GymUpkeep, 'gymChanged' | 'placed' | 'removed' | 'refresh' | 'fetches'>;
+  upkeep: Pick<
+    GymUpkeep,
+    'gymChanged' | 'placed' | 'placedBlock' | 'removed' | 'refresh' | 'fetches'
+  >;
   geo: Pick<GeoGateway, 'followShortLink'>;
   /** To announce a new gym and a deletion in the server's channel for bot updates. */
   gateway: Pick<PartyGateway, 'findChannel' | 'sendMessage'>;
@@ -382,7 +408,7 @@ export class GymAdminService {
    */
   add(gym: NewGym, place: StaffPlace, knownNearIds: readonly number[] = []): Promise<AddOutcome> {
     return this.lock.run(async () => {
-      const outcome = await this.addLocked(gym, place, knownNearIds);
+      const outcome = await this.addLocked(gym, place, new Set(knownNearIds));
       if (outcome.kind === 'added') {
         const added = outcome.gym;
         this.announce(place, async () => {
@@ -414,13 +440,13 @@ export class GymAdminService {
   private async addLocked(
     gym: NewGym,
     place: StaffPlace,
-    knownNearIds: readonly number[],
+    known: ReadonlySet<number>,
     places: true | 'later' = true,
   ): Promise<AddOutcome> {
     const { gyms, upkeep, directory, log } = this.options;
     if (!this.mayPlace(gym, place.guildId)) return { kind: 'foreign' };
     const near = this.near(gym);
-    if (near.some((found) => !knownNearIds.includes(found.gym.id))) return { kind: 'near', near };
+    if (near.some((found) => !known.has(found.gym.id))) return { kind: 'near', near };
     const created = await gyms.create(gym);
     log.info(
       { staff: place.staffId, gym: created.id, lat: created.lat, lon: created.lon },
@@ -436,6 +462,112 @@ export class GymAdminService {
     return { kind: 'added', gym: directory.get(created.id) ?? created };
   }
 
+  /** `GymBatch.addBlock` (the caller holds the lock). */
+  private async addBlockLocked(
+    block: readonly BlockGym[],
+    place: StaffPlace,
+  ): Promise<BlockOutcome[]> {
+    const { gyms, upkeep, directory, log } = this.options;
+    // Decided first, against the gyms as they are: each as `add` decides, the block's gyms
+    // known to each other.
+    const all = directory.all();
+    // The gyms of a block share one list of the gyms they may stand beside: one set of it.
+    const knownSets = new Map<readonly number[], ReadonlySet<number>>();
+    const knownOf = (ids: readonly number[] = []): ReadonlySet<number> => {
+      let known = knownSets.get(ids);
+      if (!known) knownSets.set(ids, (known = new Set(ids)));
+      return known;
+    };
+    const decided = block.map((item): AddOutcome | 'accepted' => {
+      if (!this.mayPlace(item.gym, place.guildId)) return { kind: 'foreign' };
+      const near = placesWithin(item.gym, all, DUPLICATE_METRES).map(({ place: gym, metres }) => ({
+        gym,
+        metres,
+      }));
+      const known = knownOf(item.knownNearIds);
+      return near.some((found) => !known.has(found.gym.id)) ? { kind: 'near', near } : 'accepted';
+    });
+    const accepted = block.filter((_, index) => decided[index] === 'accepted');
+    let created: Gym[];
+    /** The gyms of before whose nearest gym the block's transaction wrote. */
+    let changed: number[] = [];
+    try {
+      created =
+        accepted.length === 0
+          ? []
+          : await gyms.createBlock(
+              accepted.map((item) => item.gym),
+              (made) => {
+                const added = new Set(made.map((gym) => gym.id));
+                const writes = nearestBlockChanges([...all, ...made], added);
+                changed = writes.map((write) => write.id).filter((id) => !added.has(id));
+                return writes;
+              },
+            );
+    } catch (err) {
+      // Nothing of the block was written: one by one, so that a bad gym fails alone.
+      log.warn({ err, gyms: accepted.length }, 'a block of gyms failed: adding them one by one');
+      return this.addOneByOne(block, decided, place);
+    }
+    const ids = created.map((gym) => gym.id);
+    for (const gym of created) {
+      log.info(
+        { staff: place.staffId, gym: gym.id, lat: gym.lat, lon: gym.lon },
+        'a gym was added',
+      );
+    }
+    try {
+      // Once for the block: the directory, then the line.
+      await directory.refreshGyms([...ids, ...changed]);
+      await upkeep.placedBlock(ids, changed);
+    } catch (err) {
+      log.error(
+        { err, gyms: ids.length },
+        'a block of gyms was added, but not everything after it worked',
+      );
+    }
+    let next = 0;
+    return decided.map((outcome): BlockOutcome => {
+      if (outcome !== 'accepted') return outcome;
+      const gym = created[next++];
+      return gym ? { kind: 'added', gym: directory.get(gym.id) ?? gym } : { kind: 'failed' };
+    });
+  }
+
+  /** The gyms of a block whose transaction failed, added one by one (the lock is held). */
+  private async addOneByOne(
+    block: readonly BlockGym[],
+    decided: readonly (AddOutcome | 'accepted')[],
+    place: StaffPlace,
+  ): Promise<BlockOutcome[]> {
+    const outcomes: BlockOutcome[] = [];
+    const mates: number[] = [];
+    // One set per list of known gyms the block shares, with the gyms added before.
+    const knownSets = new Map<readonly number[], Set<number>>();
+    for (const [index, item] of block.entries()) {
+      const outcome = decided[index];
+      if (outcome !== 'accepted' && outcome !== undefined) {
+        outcomes.push(outcome);
+        continue;
+      }
+      const ids = item.knownNearIds ?? [];
+      let known = knownSets.get(ids);
+      if (!known) knownSets.set(ids, (known = new Set([...ids, ...mates])));
+      try {
+        const added = await this.addLocked(item.gym, place, known, 'later');
+        if (added.kind === 'added') {
+          mates.push(added.gym.id);
+          for (const set of knownSets.values()) set.add(added.gym.id);
+        }
+        outcomes.push(added);
+      } catch (err) {
+        this.options.log.error({ err }, 'could not add a gym of a block');
+        outcomes.push({ kind: 'failed' });
+      }
+    }
+    return outcomes;
+  }
+
   /**
    * Runs `work` under the lock with the operations of a batch (`GymBatch`): adds, moves and
    * writes of many gyms that nothing else interleaves with, as a Wayfarer import needs (it plans
@@ -460,13 +592,22 @@ export class GymAdminService {
       };
       const ops: GymBatch = {
         add: async (gym, knownNearIds = [], options = {}) => {
-          const outcome = await this.addLocked(gym, place, knownNearIds, 'later');
+          const outcome = await this.addLocked(gym, place, new Set(knownNearIds), 'later');
           if (outcome.kind === 'added') {
             changes.added++;
             if (options.promoted === true) changes.promoted++;
           }
           return outcome;
         },
+        addBlock: async (block) => {
+          const outcomes = await this.addBlockLocked(block, place);
+          outcomes.forEach((outcome, index) => {
+            if (outcome.kind !== 'added') return;
+            changes.added++;
+            if (block[index]?.promoted === true) changes.promoted++;
+          });
+          return outcomes;
+        },
         move: async (id, point, { places, address = true, patch = {} }) => {
           const before = this.options.directory.get(id)?.name;
           const outcome = await this.moveLocked(id, point, place, places, address, patch);
diff --git a/src/services/gym-directory.test.ts b/src/services/gym-directory.test.ts
index 6a3886b44abb31e7c33157f3ed49112cfa260a82..1665459d8f862d70c1ab9d6b6480ea0a6a99e86c 100644
--- a/src/services/gym-directory.test.ts
+++ b/src/services/gym-directory.test.ts
@@ -131,6 +131,23 @@ describe('GymDirectory', () => {
     expect(await service.refreshGym(12345)).toBeUndefined();
   });
 
+  it('re-reads the gyms of a block in one turn, and changes its generation once', async () => {
+    const { service, state } = directory();
+    await service.load();
+    const template = state.gyms[0];
+    if (!template) throw new Error('The fixture is empty');
+    state.gyms.push({ ...template, id: 50, name: 'Zeppelin Clock', keywords: [] });
+    state.gyms.push({ ...template, id: 51, name: 'Zeppelin Bell', keywords: [] });
+    state.gyms = state.gyms.map((gym) => (gym.id === 2 ? { ...gym, nearestGym: 51 } : gym));
+    const generation = service.generation;
+    const read = await service.refreshGyms([50, 51, 2, 999]);
+    expect(read.map((gym) => gym.id)).toEqual([50, 51, 2]);
+    expect(service.generation).toBe(generation + 1);
+    expect(ids(service, WEST_CHANNEL, 'zeppelin').sort()).toEqual([50, 51]);
+    expect(service.get(2)?.nearestGym).toBe(51);
+    expect(state.fetched).toEqual([50, 51, 2, 999]);
+  });
+
   it('keeps the gym as it was when re-reading it fails', async () => {
     const { service, state } = directory();
     await service.load();
diff --git a/src/services/gym-directory.ts b/src/services/gym-directory.ts
index e532038d726b1d360cf8c5d13d68ed04681fd994..8796dcc3207728d96ff5f517c5049f57d01a880d 100644
--- a/src/services/gym-directory.ts
+++ b/src/services/gym-directory.ts
@@ -108,6 +108,26 @@ export class GymDirectory implements GymProvider {
     });
   }
 
+  /**
+   * Re-reads several gyms in one turn (plan 8W-6: a block of a Wayfarer import and the gyms whose
+   * nearest gym it changed), the generation changed once. Gives those that exist, in order.
+   */
+  refreshGyms(ids: readonly number[]): Promise<Gym[]> {
+    return this.enqueue(async () => {
+      const lookup = this.current;
+      const read: Gym[] = [];
+      for (const id of ids) {
+        const gym = await this.options.gyms.get(id);
+        if (gym) {
+          lookup.put(gym);
+          read.push(gym);
+        } else lookup.remove(id);
+      }
+      this.changes += 1;
+      return read;
+    });
+  }
+
   /**
    * Takes a gym out of memory at once, without reading anything: for a gym whose row was just
    * deleted, so that nothing finds it in the moment before (or when) the database can be asked.
diff --git a/src/services/gym-upkeep.test.ts b/src/services/gym-upkeep.test.ts
index 62b9cd85ae3577c35c864fc96f9a394793d9be09..bee4aee5c4452ef1801da890facddaf9f7432ad6 100644
--- a/src/services/gym-upkeep.test.ts
+++ b/src/services/gym-upkeep.test.ts
@@ -8,6 +8,7 @@ import { testMeetup, testRaid, testTrain } from '../../test/support/parties.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import { metresBetween } from '@pine/wayspot-core/distance';
 import { NO_REGION_RANK } from '../domain/geo/google-line.js';
+import { nearestBlockChanges } from '../domain/gyms/nearest.js';
 import type { Party, TrainParty } from '../domain/party/party.js';
 import { MemoryGoogleUse } from './google-use.js';
 import { MemoryGymLookups } from './gym-lookups.js';
@@ -321,6 +322,40 @@ describe('GymUpkeep.placed', () => {
   });
 });
 
+describe('GymUpkeep.placedBlock', () => {
+  it('puts a block of new gyms in the line once, and the gyms whose nearest gym it changed', async () => {
+    const lookups = new MemoryGymLookups();
+    const { upkeep, gyms, directory, geo } = await upkeepWith({ lookups });
+    await upkeep.flush();
+    const block = await gyms.createBlock(
+      [
+        // Beside the lonely gym, with Wayfarer's address: it waits for its places only.
+        { name: 'Beside', ...BESIDE_LONELY, geodata: '{"addressComponents":{"route":"Lake"}}' },
+        { name: 'Elsewhere', lat: 40.08, lon: -80.02 },
+      ],
+      (made) =>
+        nearestBlockChanges([...directory.all(), ...made], new Set(made.map((gym) => gym.id))),
+    );
+    const ids = block.map((gym) => gym.id);
+    const changed = gyms.writes.flatMap((write) =>
+      write.what === 'update' && 'nearestGym' in write.patch ? [write.id] : [],
+    );
+    expect(changed).toContain(LONELY);
+    await directory.refreshGyms([...ids, ...changed]);
+    await upkeep.placedBlock(ids, changed);
+    expect(lookups.rows.get(ids[0]!)?.address).toBe(false);
+    expect(lookups.rows.get(ids[1]!)?.address).toBe(true);
+    // The lonely gym's circle follows its new nearest gym.
+    expect(lookups.rows.get(LONELY)?.address).toBe(false);
+    // Nothing is asked at once: the line asks one every few seconds.
+    expect(geo.asked).toEqual([]);
+    await upkeep.flush();
+    expect(gyms.row(ids[0]!)?.places).not.toBeNull();
+    const lonely = geo.questions('places').find((question) => question.point.lat === 40.5);
+    expect(lonely?.radius).toBeCloseTo(metresBetween(directory.get(LONELY)!, BESIDE_LONELY) / 2, 5);
+  });
+});
+
 describe('GymUpkeep.removed', () => {
   it('gives the gyms that pointed at a deleted gym another nearest one', async () => {
     const { upkeep, gyms, directory, geo, add } = await upkeepWith();
diff --git a/src/services/gym-upkeep.ts b/src/services/gym-upkeep.ts
index 3569c5938dd9b385518028f38fcc853696f2760d..f1967d0e922568cf798186bfa3e9c0b6443ee513 100644
--- a/src/services/gym-upkeep.ts
+++ b/src/services/gym-upkeep.ts
@@ -94,6 +94,8 @@ export interface GymsInMemory {
   all(): Gym[];
   get(id: number): Gym | undefined;
   refreshGym(id: number): Promise<Gym | undefined>;
+  /** Re-reads the gyms of a block in one turn (`GymDirectory.refreshGyms`). */
+  refreshGyms(ids: readonly number[]): Promise<Gym[]>;
 }
 
 export interface GymUpkeepOptions {
@@ -431,6 +433,38 @@ export class GymUpkeep {
     await this.queuePlaces(others);
   }
 
+  /**
+   * After a block of gyms was added at once (plan 8W-6: `GymBatch.addBlock`, a Wayfarer import),
+   * with their nearest gyms and those of the gyms around them written in the block's transaction
+   * (`nearestBlockChanges`) and the directory read again: the new gyms wait in the line (for
+   * their address too where they have none), and the gyms whose nearest gym changed wait for
+   * their places, in one write of the line each. Google is asked about nothing at once. Never
+   * rejects.
+   */
+  async placedBlock(ids: readonly number[], nearestChanged: readonly number[]): Promise<void> {
+    const { directory } = this.options;
+    for (const id of ids) {
+      this.outdate('address', id);
+      this.outdate('places', id);
+    }
+    const added = new Set(ids);
+    const others = nearestChanged.filter((id) => !added.has(id));
+    // Their circle follows the distance to their new nearest gym.
+    for (const id of others) this.outdate('places', id);
+    await this.queueGyms(
+      ids.filter((id) => directory.get(id)?.geodata === null),
+      true,
+    );
+    await this.queueGyms(
+      ids.filter((id) => {
+        const gym = directory.get(id);
+        return gym !== undefined && gym.geodata !== null;
+      }),
+      false,
+    );
+    await this.queuePlaces(others);
+  }
+
   /**
    * After a gym was deleted (the directory no longer has it): the gyms that pointed at it get
    * another nearest gym, and wait in the line for their places. Never rejects.
diff --git a/src/services/wayfarer-import-service.test.ts b/src/services/wayfarer-import-service.test.ts
index cf683a598cc76dfc48daf898c2d1454a6880a139..e183e98af4a55bdabfd2d21ed1a1a3fe9748bc47 100644
--- a/src/services/wayfarer-import-service.test.ts
+++ b/src/services/wayfarer-import-service.test.ts
@@ -25,7 +25,7 @@ import type { ExportedWayspot, WayspotExport, WayspotKind } from '@pine/wayspot-
 import { textOf } from '../../test/support/messages.js';
 import { keptRowOf } from '../domain/wayspots/keep.js';
 import { missingCells } from '@pine/wayspot-core/scan-area';
-import { mayDeleteOutside, REFETCH_METRES } from './wayfarer-import-service.js';
+import { IMPORT_BLOCK, mayDeleteOutside, REFETCH_METRES } from './wayfarer-import-service.js';
 
 type Made = Awaited<ReturnType<typeof wayfarerImportWith>>;
 
@@ -1024,6 +1024,51 @@ describe('WayfarerImportService.apply', () => {
   });
 });
 
+describe('WayfarerImportService: a first import adds its gyms in blocks', () => {
+  /** Wayfarer gyms on a grid over West, 300 m apart, starting far from the invented gyms. */
+  function grid(count: number): ExportedWayspot[] {
+    const start = { lat: 40.004, lon: -80.096 };
+    return Array.from({ length: count }, (_, n) =>
+      wayspot(1_000 + n, `Grid Gym ${n}`, at(start, (n % 30) * 300, Math.floor(n / 30) * 300)),
+    );
+  }
+
+  it('writes a block of 250 gyms in one transaction, and the rest of the import as before', async () => {
+    const made = await wayfarerImportWith();
+    const outcome = await made.wayfarer.apply(STAFF_PLACE, exportOf(grid(600)));
+    expect(outcome.counts.added).toBeGreaterThan(500);
+    expect(outcome.counts.failed).toBe(0);
+    expect(made.gymStore.blocks).toBe(Math.ceil(outcome.counts.added / IMPORT_BLOCK));
+    // Every gym is there, with its Wayfarer id, in the line for its places.
+    const added = made.directory.all().filter((gym) => gym.name.startsWith('Grid Gym'));
+    expect(added).toHaveLength(outcome.counts.added);
+    expect(added.every((gym) => gym.pogoId !== null && gym.nearestGym !== null)).toBe(true);
+    expect(await made.upkeep.waiting()).toBeGreaterThanOrEqual(outcome.counts.added);
+    // A line in the log per block, with how far the import has come.
+    const blocks = made.entries.filter(
+      (entry) => entry.msg === 'a block of Wayfarer gyms was added',
+    );
+    expect(blocks).toHaveLength(made.gymStore.blocks);
+    expect(blocks[0]).toMatchObject({ level: 30, block: 1, blocks: blocks.length, added: 250 });
+    expect(blocks.at(-1)).toMatchObject({ block: blocks.length, held: 0, failed: 0 });
+    // One summary, as before.
+    await settle(made);
+    expect(announced(made).map((message) => textOf(message))).toEqual([
+      `### The gym list changed\nProfessor Pine has added ${outcome.counts.added} gyms.`,
+    ]);
+  });
+
+  it('adds the gyms of a block that fails one by one, so that a bad gym fails alone', async () => {
+    const made = await wayfarerImportWith();
+    const gyms = grid(3);
+    made.gymStore.refuseNames.add('Grid Gym 1');
+    const outcome = await made.wayfarer.apply(STAFF_PLACE, exportOf(gyms));
+    expect(outcome.counts).toMatchObject({ added: 2, failed: 1 });
+    expect(made.gymStore.blocks).toBe(0);
+    expect(made.directory.all().filter((gym) => gym.name.startsWith('Grid Gym'))).toHaveLength(2);
+  });
+});
+
 describe('WayfarerImportService: the kept Wayspots', () => {
   const ids = async (made: Made) => (await made.wayspotStore.all()).map((row) => row.id);
 
@@ -1188,9 +1233,8 @@ describe('WayfarerImportService: the kept Wayspots', () => {
   it('keeps a Wayfarer gym whose adding failed as a Wayfarer gym Pine did not take', async () => {
     const made = await wayfarerImportWith();
     const { file } = cityFile(made);
-    const create = made.gymStore.create.bind(made.gymStore);
-    made.gymStore.create = (gym) =>
-      gym.name === 'Clock Tower' ? Promise.reject(new Error('lock wait timeout')) : create(gym);
+    // The database refuses its row: its block fails, and then it alone.
+    made.gymStore.refuseNames.add('Clock Tower');
 
     const outcome = await made.wayfarer.apply(STAFF_PLACE, file);
 
diff --git a/src/services/wayfarer-import-service.ts b/src/services/wayfarer-import-service.ts
index a41e077cb8ceb5dc21fec31e847b7ac00b9d96ab..88fe78a8da6cff985154d5adaf2e3ca080a82a21 100644
--- a/src/services/wayfarer-import-service.ts
+++ b/src/services/wayfarer-import-service.ts
@@ -53,7 +53,14 @@ import { PINE_STOP_NEAR_METRES, type PineStopService } from './pine-stops.js';
 import type { ReviewItem } from '../domain/wayspots/review.js';
 import type { Logger } from '../log.js';
 import type { Member } from './attendance-service.js';
-import type { BatchPatch, GymAdminService, GymBatch, StaffPlace } from './gym-admin-service.js';
+import type {
+  BatchPatch,
+  BlockGym,
+  BlockOutcome,
+  GymAdminService,
+  GymBatch,
+  StaffPlace,
+} from './gym-admin-service.js';
 import type { RegionProvider } from './region-directory.js';
 import type { WayspotDirectory } from './wayspot-directory.js';
 
@@ -64,6 +71,13 @@ import type { WayspotDirectory } from './wayspot-directory.js';
  */
 export const REFETCH_METRES = 25;
 
+/**
+ * How many new gyms an import adds in one transaction (plan 8W-6, `GymBatch.addBlock`): a
+ * city's first import (thousands of gyms) holds the gym admin lock for seconds, and a block is
+ * small enough that adding a failed one gym by gym takes no longer than before.
+ */
+export const IMPORT_BLOCK = 250;
+
 /**
  * What an import does, counted. `matched`: gyms that are a Wayfarer gym of the file, of which
  * `unchanged` had nothing to write but when they were seen, `renamed` take the Wayspot's title
@@ -609,6 +623,11 @@ export class WayfarerImportService {
         'a Wayfarer gym was not added: a gym nearby may be it',
       );
     }
+    // The new gyms in blocks (plan 8W-6): each block one transaction with its nearest gyms, the
+    // directory and the line once per block, so that a city's first import holds the lock for
+    // seconds, not minutes. A gym the block refuses (near a gym, a region of another server) is
+    // reported as before; a block that fails is added gym by gym.
+    const titled: { wayspot: ExportedWayspot; gym: BlockGym }[] = [];
     for (const wayspot of plan.added) {
       const name = newGymName(wayspot.title, this.storedLength);
       if (name === null) {
@@ -616,9 +635,10 @@ export class WayfarerImportService {
         log.info({ wayspot: wayspot.id }, 'a Wayfarer gym without a title was not added');
         continue;
       }
-      try {
-        const outcome = await ops.add(
-          {
+      titled.push({
+        wayspot,
+        gym: {
+          gym: {
             name,
             lat: wayspot.lat,
             lon: wayspot.lon,
@@ -628,29 +648,55 @@ export class WayfarerImportService {
             // places around it only, and for the address of a Wayspot without a street.
             geodata: wayfarerGeodata(wayspot.address),
           },
-          [...known],
           // A stop found gone by an earlier import was a stop all the same.
-          { promoted: wasStop(before.get(wayspot.id) ?? wentAs(gone?.get(wayspot.id))) },
-        );
+          promoted: wasStop(before.get(wayspot.id) ?? wentAs(gone?.get(wayspot.id))),
+        },
+      });
+    }
+    const blocks = Math.ceil(titled.length / IMPORT_BLOCK);
+    for (let start = 0; start < titled.length; start += IMPORT_BLOCK) {
+      const block = titled.slice(start, start + IMPORT_BLOCK);
+      // The gyms the block's gyms may stand beside: one list for the whole block.
+      const knownNearIds = [...known];
+      let outcomes: BlockOutcome[];
+      try {
+        outcomes = await ops.addBlock(block.map(({ gym }) => ({ ...gym, knownNearIds })));
+      } catch (err) {
+        counts.failed += block.length;
+        log.error({ err, gyms: block.length }, 'could not add a block of Wayfarer gyms');
+        continue;
+      }
+      const done = { added: 0, held: 0, failed: 0 };
+      for (const [index, outcome] of outcomes.entries()) {
+        const wayspot = block[index]?.wayspot;
+        if (!wayspot) continue;
         if (outcome.kind === 'added') {
           known.add(outcome.gym.id);
           seen.push(outcome.gym.id);
           counts.added++;
-          continue;
+          done.added++;
+        } else if (outcome.kind === 'failed') {
+          counts.failed++;
+          done.failed++;
+          log.error({ wayspot: wayspot.id }, 'could not add a Wayfarer gym');
+        } else {
+          counts.held++;
+          done.held++;
+          log.warn(
+            {
+              wayspot: wayspot.id,
+              outcome: outcome.kind,
+              ...(outcome.kind === 'near' ? { near: outcome.near.map(({ gym }) => gym.id) } : {}),
+            },
+            'a Wayfarer gym was not added: a gym or a region of another server is there',
+          );
         }
-        counts.held++;
-        log.warn(
-          {
-            wayspot: wayspot.id,
-            outcome: outcome.kind,
-            ...(outcome.kind === 'near' ? { near: outcome.near.map(({ gym }) => gym.id) } : {}),
-          },
-          'a Wayfarer gym was not added: a gym or a region of another server is there',
-        );
-      } catch (err) {
-        counts.failed++;
-        log.error({ err, wayspot: wayspot.id }, 'could not add a Wayfarer gym');
       }
+      // How far a city's first import has come (thousands of gyms take minutes).
+      log.info(
+        { block: start / IMPORT_BLOCK + 1, blocks, ...done },
+        'a block of Wayfarer gyms was added',
+      );
     }
 
     const items = plan.reviews.map((item) => ({
diff --git a/test/support/gym-store.ts b/test/support/gym-store.ts
index 4c0f0719bcd297355eb470670b57f596704c94b0..2000ba3a6f2b49a1a2cad65c97f9c86268185572 100644
--- a/test/support/gym-store.ts
+++ b/test/support/gym-store.ts
@@ -2,6 +2,7 @@ import type {
   Gym,
   GymPatch,
   GymStorage,
+  NearestWrite,
   NewGym,
 } from '../../src/db/repositories/gym-repository.js';
 import { loadSettings } from '../../src/config/settings.js';
@@ -22,7 +23,7 @@ export function settledTestGyms(): Gym[] {
 }
 
 /** The methods of the storage, for a test that holds or fails one of them. */
-export type GymMethod = 'get' | 'listAll' | 'create' | 'update' | 'delete';
+export type GymMethod = 'get' | 'listAll' | 'create' | 'createBlock' | 'update' | 'delete';
 
 /**
  * The gyms kept in memory as `GymRepository` keeps them, whose behaviour
@@ -62,7 +63,14 @@ export class MemoryGyms implements GymStorage {
       setImmediate(() => {
         const failing = this.failing ?? this.failingOn[method];
         if (failing) reject(failing);
-        else resolve(work());
+        else {
+          // A write the database refuses (`refuseNames`) rejects, as a query does.
+          try {
+            resolve(work());
+          } catch (err) {
+            reject(err instanceof Error ? err : new Error(String(err)));
+          }
+        }
       });
     });
   }
@@ -97,8 +105,66 @@ export class MemoryGyms implements GymStorage {
     );
   }
 
+  /** How many blocks were created (`createBlock`), each one transaction. */
+  blocks = 0;
+
+  createBlock(
+    gyms: readonly NewGym[],
+    nearest: (created: readonly Gym[]) => readonly NearestWrite[],
+  ): Promise<Gym[]> {
+    return this.attempt('createBlock', () => {
+      // All or nothing, as one transaction: the rows go in only once everything worked.
+      const made = gyms.map((gym, index) => this.made(this.nextId + index, gym));
+      if (this.refuseNames.size > 0 && made.some((gym) => this.refuseNames.has(gym.name))) {
+        throw new Error('a gym of the block was refused');
+      }
+      const writes = new Map(nearest(made).map((write) => [write.id, write.nearestGym]));
+      this.nextId += made.length;
+      for (const gym of made) {
+        this.rows.set(gym.id, { ...gym, nearestGym: writes.get(gym.id) ?? null });
+        this.writes.push({ what: 'create', id: gym.id });
+      }
+      for (const [id, nearestGym] of writes) {
+        const kept = this.rows.get(id);
+        if (kept && !made.some((gym) => gym.id === id)) {
+          this.rows.set(id, { ...kept, nearestGym });
+          this.writes.push({ what: 'update', id, patch: { nearestGym } });
+        }
+      }
+      this.blocks++;
+      return made.map((gym) => this.row(gym.id)!);
+    });
+  }
+
+  /** Gym names a write refuses (`create` and `createBlock`), as a database refuses a bad row. */
+  readonly refuseNames = new Set<string>();
+
+  private made(id: number, gym: NewGym): Gym {
+    return {
+      id,
+      pogoId: gym.pogoId ?? null,
+      name: gym.name,
+      lat: gym.lat,
+      lon: gym.lon,
+      nickname: gym.nickname ?? null,
+      description: gym.description ?? null,
+      keywords: (gym.keywords ?? [])
+        .map((keyword) => keyword.trim().toLowerCase())
+        .filter((keyword) => keyword !== ''),
+      notice: gym.notice ?? null,
+      taggedEx: false,
+      confirmedEx: false,
+      imageUrl: gym.imageUrl ?? null,
+      sponsor: null,
+      geodata: gym.geodata ?? null,
+      places: null,
+      nearestGym: null,
+    };
+  }
+
   create(gym: NewGym): Promise<Gym> {
     return this.attempt('create', () => {
+      if (this.refuseNames.has(gym.name)) throw new Error('the gym was refused');
       const id = this.nextId++;
       const created: Gym = {
         id,
````

### Task 5: 8W-6 task 5: /gym google, how far the line for Google is

Prototype commit: `7fcca44d02d46158011e09be25c12052f18fe3e7`

A new subcommand of /gym, staff only, answered privately as a components-v2 message: this
server's gyms and its PokéStops and Power Spots that wait, this month's places questions of the
budget and the reserve and its addresses, when the month starts again (Pacific), and when at
this pace this server's last gym and its last item of any kind will be asked about
(estimateLine over GymUpkeep.snapshot through GymAdminService.googleLine). Without a Google key
it says so. A command option change: deploy the commands before staging it.

Builder's choices:
- Wording:
    ### The line for Google
    2 gyms and 2 PokéStops or Power Spots of this server wait for Google.
    This month 3 of 4,500 places searches are used; the line stops when 500 are left, for gyms
    added or moved by hand and `/gym refresh`. 1 of 9,000 addresses is used. The month starts
    again <t:…:f>, when Google's free amounts reset.
    At this pace the gyms of this server are all asked about today, and everything of this
    server on <t:…:D>.
    -# The line and the budget are this instance's, for its one Google key; the counts are this
    server's part of it.
  with "Nothing of this server waits for Google." and "not within three years at this budget".
- Answered through answerGym (the /gym flows' private v2 answer, v2Answer underneath) after
  defer: 'ephemeral'.
- This server's gyms are those in one of its regions; its Wayspots those in its regions (a gym
  or Wayspot in no region of any server is counted for no server).
- timestamp() takes the long date style 'D'.
- gymAdminWith exposes the line's storage (lookups, wayspotLookups, googleUse) for tests.

**Files:**

```
 docs/architecture/gyms-and-regions.md |   3 ++-
 src/commands/gyms/google.test.ts      | 108 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/gyms/google.ts           | 176 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/gyms/index.ts            |   2 ++
 src/render/text.ts                    |   2 +-
 src/services/gym-admin-service.ts     |   9 ++++++--
 src/services/gym-upkeep.ts            |  35 ++++++++++++++++++++++++++++++-
 test/support/gym-admin.ts             |  24 ++++++++++++++++++++-
 8 files changed, 353 insertions(+), 6 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/gyms/google.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 7fcca44d02d46158011e09be25c12052f18fe3e7 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-25-phase-8w6-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8W-6 task 5: /gym google, how far the line for Google is`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/gyms-and-regions.md b/docs/architecture/gyms-and-regions.md
index 8a617b644cef21f22eab69af71dc0da59a485f39..03d148f0c80c97ad2dc53ea08ad66cf42723dd6f 100644
--- a/docs/architecture/gyms-and-regions.md
+++ b/docs/architecture/gyms-and-regions.md
@@ -22,7 +22,8 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 - What Google knows of a place is behind `GeoGateway` (`src/services/geo-gateway.ts`; `GoogleGeo` calls the Geocoding API and Places API (New) with `fetch`, the key in the address of the one and a header of the other): each call answers a value, `none`, `no-key`, `denied` (remembered for an hour) or `failed`, never throws and never logs an address. In the upkeep's line of lookups (`GymUpkeep`) a refused geocode holds back only the gyms that want an address: the refused gym stays first and is asked no Places, the line goes on with the gyms that want their places alone (`GymLookups.next({ placesOnly })`), and it waits out the refusal only when every gym left wants an address. The address parts also hold the address as Google writes it (`FORMATTED_ADDRESS`), which the search does not read and `addressLine` shows (`/gym show`); a row without it gets a line made of its parts. `GymUpkeep` (`gym-upkeep.ts`) keeps a gym's address parts, nearby places and nearest gym: the nearest gyms of the gyms concerned only (`nearestGymChanges`), the places of gyms whose nearest gym changed in a slow queue, a generation per gym so that a stale answer is never written. Without a key a gym is saved all the same.
 - The line that waits for Google is a priority queue with a monthly budget (plan 8W-6; design `2026-10-20-google-line-priority-design.md`). The arithmetic is pure (`src/domain/geo/google-line.ts`): the month as Google counts it (`googleMonth`, the 1st at midnight in `America/Los_Angeles`, `GOOGLE_ZONE`, whatever `settings.timezone` is), `lineAllowance` (gyms may use the whole month above the reserve; the line stops when only `settings.googleLookupsReserve` of `googleLookupsPerMonth` is left, until the month resets; addresses within `googleGeocodesPerMonth`), `regionRanks` and `bestRank` (a region's raids and max battles over `RANK_DAYS` 90 from the party history, `HistoryRepository.raidsByRegion`, divided by its server's busiest region's: each server's busiest is 1; a server without raids has every region at 1; a region of no server has no rank; a gym in no region of any server is `NO_REGION_RANK`, last), `lineOrder`, and `estimateLine` (below, `/gym google`). `GoogleRanks` (`src/services/google-ranks.ts`) reads the raids at start and at the line's first turn of each Pacific day (`GymUpkeep.rerank`, which ranks the line anew), never per question. Every question that reaches Google counts (a failure too; `denied` and `no-key` do not), in the line or not (a gym added or moved by hand, `/gym refresh`), each by its kind on its Pacific day (`GoogleUse`: `GoogleUseRepository`, table `GoogleUseDay` of migration 031, the old `GymLookupDay` of the current month read as places questions; twin `MemoryGoogleUse`; both run `googleUseCases`; `usedThisMonth`); a question by hand may use the reserve and go past the budget, since an admin asked. While Geocoding is refused or its budget used, the gyms that wait for an address wait (until the refusal ends or the month resets) and the gyms for their places alone go on. A gym asked again for what did not come (a failure, an address Google did not give) is set aside until the next Pacific day (`asideGyms`, cleared by `rerank`; `GymLookups.next({ except })` passes over it, so one gym that keeps failing holds up neither the others nor the budget; put in the line anew, moved, it is asked again), its row after every other gym (`RETRY_RANK`) until the line is ranked anew, and the line waits twice as long after each such turn in a row (up to an hour; a turn that answers resets it), so that a Google that keeps failing does not take the month's budget a few seconds at a time. The line never sets a timer longer than `MAX_TIMER_MS` (six hours: Node fires a timer beyond 2^31 − 1 ms at once): a longer wait, until the month resets, is a turn every six hours that finds nothing to ask. A gym whose places Google answered is noted (`GymLookups.markAsked`, table `GymGoogleAsked` of migration 031, whatever Google found; forgotten when the gym moves, and with the gym), so that `resume` puts in the line at a start only the gyms without places that were never asked where they are (a gym Google found nothing for has neither address nor places, as one never asked); a gym of before with places counts as asked. The twins in memory order their lines by `lineOrder`; the repositories' SQL is its one other copy, held to it by the shared cases.
 - PokéStops and Power Spots wait in the same line after every gym (plan 8W-6): `GymUpkeep` takes the kept Wayspots and the stops of Pine's own (`WayspotDirectory`) and queues each PokéStop and Power Spot in a region of a server (`GoogleRanks.ofWayspot`; one in no region of any server is never queued) whose places were never asked, or asked more than `WAYSPOT_MOVED_METRES` 10 away or for another kind (`queueWayspots`: after `resume`, at every change of what the Wayspots are, `whenChanged`, and with the daily ranking, which also follows a change of the regions); one that is no PokéStop or Power Spot any more (it became a gym, was found gone, is a Wayfarer gym) leaves the line and its places are dropped. The line (`WayspotLookups`: `WayspotLookupRepository`, table `WayspotLookup` of migration 031; twin `MemoryWayspotLookups`; both run `wayspotLookupCases`) gives PokéStops before Power Spots, each by rank, then by the time queued. They are paced evenly (`lineAllowance`: on a day at most what was left above the reserve when the day began over the days left in the month, every places question of the day counted), one every few seconds until the day's share is used; never a Geocoding. A Wayspot's circle is half the way to its nearest gym, PokéStop or Power Spot within 1 km (`placesRadius`, 25 to 500 m), so that stops in a row each get their own businesses. Its places are kept apart from the Wayfarer import's writes (`WayspotPlaces`, `src/services/wayspot-places.ts`, over table `WayspotPlaces`: the names, the point and kind asked, when), which the import's upsert of `Wayspot` never touches. A question that failed, or an answer that could not be written, sets the Wayspot aside until the next Pacific day (`asideSpots`) and puts it after the others of its kind, and the line waits longer, as for gyms. `googleLookupsPerDay` of before is gone (a settings file that still names it is refused, as any unknown key).
-- Tests use `FakeGeo` (`test/support/geo.ts`), `MemoryGyms` and `gymDirectoryWith` (`test/support/gym-store.ts`), `MemoryGymRemoval` and the service of `test/support/gym-admin.ts`; `partyServiceWith` gives all its services one gym list.
+- `/gym google` (`src/commands/gyms/google.ts`, staff, `defer: 'ephemeral'`, a private v2 answer through `answerGym`; a new subcommand: the commands are deployed first) says how far the line is: this server's gyms that wait (in a region of the server, `gymRegionsInGuild`) and its PokéStops and Power Spots (in its regions), this month's places questions of the budget and the reserve and its addresses, when the month starts again (Pacific), and when at this pace this server's last gym and its last item of any kind are asked about (`estimateLine` over `GymUpkeep.snapshot()`, through `GymAdminService.googleLine()`: the instance's line simulated in its order against this month's budget left above the reserve and the next months' budgets, gyms at the line's pace, stops at the day's share; "today", a date (the day at noon Pacific, so that a reader west of California sees the same date), or "not within three years at this budget"; one sentence when the gyms and everything are done the same day, "the gyms first"). Without a Google key it says so. The line and the budget are the instance's (one key), the counts this server's share (`serverShare`).
+- Tests use `FakeGeo` (`test/support/geo.ts`), `MemoryGyms` and `gymDirectoryWith` (`test/support/gym-store.ts`), `MemoryGymRemoval` and the service of `test/support/gym-admin.ts` (`gymAdminWith`, which also gives the line's storage in memory: `lookups`, `wayspotLookups` and `googleUse`, plan 8W-6); `partyServiceWith` gives all its services one gym list.
 - The texts of a gym are tidied and checked by `src/domain/gyms/gym-text.ts`: name and nickname must fit `varchar(255)` once entity-encoded (the encoder is passed in; the domain does not import `he`), control and direction characters are stripped (ZWNJ, ZWJ and the flag tag characters stay), keywords are lower case and unique. `/gym edit` writes only the fields that differ from what its form showed (`gymFormTexts`, `changedGymTexts`); a text too long for the form is left out of it, never cut. A gym is named beside its number by `gymWithId` (`src/render/gym-view.ts`), which cuts before it escapes and falls back to "Gym" for a name that shows as nothing.
 - The `gym` option of `/gym` (`src/commands/gyms/gym-option.ts`: `respondWithGyms`, `chosenGym`) is free text with autocomplete; a choice's value is `id:<n>`. Typed: `#123` and `id:123` are always ids; bare digits are an id unless no gym has it (a text search then) or another gym is called by those digits (refused, both listed); other text acts only on a clear hit (`clearGymHit`, shared with `/raid`). The questions and forms of `/gym` keep their state in `pendingGyms` (a `PendingRequests` of six hours) under the token of their custom ids, `gym:<token>:<action>`; a token that was answered is remembered, so a second press is only acknowledged; a refused form keeps what was typed behind "Open the form again".
 - A gym is an elite raid gym when either stored flag is set (`isEliteGym`, `src/domain/party/raid.ts`): the game renamed EX gyms, and everything staff see says "elite raid gym". Members are not told (plan 8D, Matt, 2026-10-17: it mattered for EX raids, not now): no post, train route, `/route show`, `/find-gym` view or `/targets` list marks it; staff's `/gym show`, `/gym elite`, `/region list`'s count, the `#elite-gym-raids` copies with their lead line and the `Elite` forum tag (the raid tier) keep it. The columns `taggedEx` / `confirmedEx`, the mirror kind `ex` and `features.exGymChannel` keep their names; only the channel setting was renamed. Never decide on one flag alone.
diff --git a/src/commands/gyms/google.test.ts b/src/commands/gyms/google.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f9af403202536a61de753bae57a70c2d08675950
--- /dev/null
+++ b/src/commands/gyms/google.test.ts
@@ -0,0 +1,108 @@
+import { MessageFlags } from 'discord.js';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { withOtherServer } from '../../../test/support/gym-admin.js';
+import { answerOf, gymCommandsWith, said } from '../../../test/support/gym-commands.js';
+import { keptRow } from '../../../test/support/wayspot-cases.js';
+
+/** Noon in California on October 11: 21 days of the month are left. */
+const NOW = new Date('2026-10-11T12:00:00-07:00').getTime();
+const stamp = (ms: number, style: string) => `<t:${Math.floor(ms / 1000)}:${style}>`;
+
+describe('/gym google', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'] });
+    vi.setSystemTime(NOW);
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  /** The line with gyms and Wayspots of this server, of another and of none. */
+  async function lineWith(options: { places?: number; geocodes?: number } = {}) {
+    const made = await gymCommandsWith();
+    const north = await withOtherServer(made);
+    // Gyms 1 and 2 lie in West (this server), Lakeview (10) in no region.
+    await made.lookups.add(
+      [
+        { gymId: 1, address: false, rank: 1 },
+        { gymId: north.id, address: false, rank: 1 },
+        { gymId: 2, address: true, rank: 0.5 },
+        { gymId: 10, address: true, rank: -1 },
+      ],
+      1,
+    );
+    const stop = keptRow(1, { lat: 40.05, lon: -80.06 });
+    const spot = keptRow(2, { lat: 40.06, lon: -80.06, kind: 'powerspot' });
+    const away = keptRow(3);
+    await made.wayspotStore.saveFromImport({ upsert: [stop, spot, away], remove: [] }, 1);
+    await made.wayspots.load();
+    await made.wayspotLookups.add(
+      [
+        { wayspotId: stop.id, kind: 'stop', rank: 1 },
+        { wayspotId: away.id, kind: 'stop', rank: 1 },
+        { wayspotId: spot.id, kind: 'powerspot', rank: 1 },
+      ],
+      1,
+    );
+    for (let n = 0; n < (options.places ?? 3); n++)
+      await made.googleUse.use('2026-10-11', 'places');
+    for (let n = 0; n < (options.geocodes ?? 1); n++)
+      await made.googleUse.use('2026-10-11', 'geocode');
+    return made;
+  }
+
+  it("says what of this server waits, the month's budget, when it resets, and when it will be done", async () => {
+    const made = await lineWith();
+    const used = await made.use('google');
+    const answer = answerOf(used);
+    expect(said(answer)).toBe(
+      [
+        '### The line for Google',
+        '2 gyms and 2 PokéStops or Power Spots of this server wait for Google.',
+        'This month 3 of 4,500 places searches are used; the line stops when 500 are left, for ' +
+          'gyms added or moved by hand and `/gym refresh`. 1 of 9,000 addresses is used. The ' +
+          `month starts again ${stamp(new Date('2026-11-01T00:00:00-07:00').getTime(), 'f')}, ` +
+          'when Google’s free amounts reset.',
+        'At this pace everything of this server is asked about today, the gyms first.',
+        '-# The line and the budget are this instance’s, for its one Google key; the counts ' +
+          'are this server’s part of it.',
+      ].join('\n'),
+    );
+    // Private: the reply is deferred as ephemeral, and the answer is a components-v2 message.
+    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(answer.flags).toBe(MessageFlags.IsComponentsV2);
+  });
+
+  it('says when this month is used up and the rest waits for the next months', async () => {
+    const made = await lineWith({ places: 4_000 });
+    const text = said(answerOf(await made.use('google')));
+    expect(text).toContain('This month 4,000 of 4,500 places searches are used;');
+    // The day at noon in California (standard time again on November 1): a reader west of it
+    // sees the same date.
+    expect(text).toContain(
+      'At this pace everything of this server is asked about on ' +
+        `${stamp(new Date('2026-11-01T12:00:00-08:00').getTime(), 'D')}, the gyms first.`,
+    );
+  });
+
+  it('names both days when the gyms are done before the rest', async () => {
+    // Today's share of PokéStops and Power Spots is used: they wait for tomorrow.
+    const made = await lineWith({ places: 300 });
+    const text = said(answerOf(await made.use('google')));
+    expect(text).toContain(
+      'At this pace the gyms of this server are all asked about today, and everything of ' +
+        `this server on ${stamp(new Date('2026-10-12T12:00:00-07:00').getTime(), 'D')}.`,
+    );
+  });
+
+  it('says so when nothing of this server waits, or there is no Google key', async () => {
+    const made = await gymCommandsWith();
+    expect(said(answerOf(await made.use('google')))).toContain(
+      'Nothing of this server waits for Google.',
+    );
+    made.geo.enabled = false;
+    expect(said(answerOf(await made.use('google')))).toBe(
+      '### The line for Google\nNo Google API key is configured, so nothing is asked of Google.',
+    );
+  });
+});
diff --git a/src/commands/gyms/google.ts b/src/commands/gyms/google.ts
new file mode 100644
index 0000000000000000000000000000000000000000..319d4bae7b5ef33b753014737c5445607e602ac2
--- /dev/null
+++ b/src/commands/gyms/google.ts
@@ -0,0 +1,176 @@
+import { SlashCommandSubcommandBuilder } from 'discord.js';
+import { DateTime } from 'luxon';
+import type { AppContext } from '../../app-context.js';
+import type { SubcommandPart } from '../../discord/command-group.js';
+import {
+  estimateLine,
+  GOOGLE_ZONE,
+  googleMonth,
+  type EstimatedDay,
+} from '../../domain/geo/google-line.js';
+import { timestamp } from '../../render/text.js';
+import type { GoogleLineSnapshot } from '../../services/gym-upkeep.js';
+import { gymRegionsInGuild } from '../../services/region-directory.js';
+import { answerGym, gymQuestion, staffPlace } from './shared.js';
+
+/** A number as a sentence writes it: `4,500`. */
+function amount(n: number): string {
+  return n.toLocaleString('en-US');
+}
+
+/** `1 gym`, `2,600 gyms`. */
+function counted(n: number, singular: string, plural = `${singular}s`): string {
+  return `${amount(n)} ${n === 1 ? singular : plural}`;
+}
+
+/** This server's part of the line: how many wait, and how far into the line its last ones are. */
+export interface ServerShare {
+  gyms: number;
+  wayspots: number;
+  /** The gyms of the line up to and with this server's last (0: none of it waits). */
+  gymsTo: number;
+  /** The PokéStops and Power Spots up to and with this server's last (0: none). */
+  wayspotsTo: number;
+}
+
+/**
+ * This server's part of the instance's line (`/gym google`): its gyms are those in a region of
+ * the server; its PokéStops and Power Spots those in its regions.
+ */
+export function serverShare(
+  line: Pick<GoogleLineSnapshot, 'gyms' | 'wayspots'>,
+  isOwnGym: (gymId: number) => boolean,
+  isOwnWayspot: (wayspotId: string) => boolean,
+): ServerShare {
+  const share: ServerShare = { gyms: 0, wayspots: 0, gymsTo: 0, wayspotsTo: 0 };
+  line.gyms.forEach((gym, index) => {
+    if (!isOwnGym(gym.gymId)) return;
+    share.gyms++;
+    share.gymsTo = index + 1;
+  });
+  line.wayspots.forEach((wayspot, index) => {
+    if (!isOwnWayspot(wayspot.wayspotId)) return;
+    share.wayspots++;
+    share.wayspotsTo = index + 1;
+  });
+  return share;
+}
+
+/**
+ * When something will be done, as a sentence ends: today, on a day, or not soon. The day is shown
+ * at noon in California, so that a reader west of it (Hawaii) sees the same date, not the day
+ * before.
+ */
+function when(day: EstimatedDay, now: number): string {
+  if (day === 'beyond') return 'not within three years at this budget';
+  if (googleMonth(day).today === googleMonth(now).today) return 'today';
+  const noon = DateTime.fromMillis(day, { zone: GOOGLE_ZONE }).set({
+    hour: 12,
+    minute: 0,
+    second: 0,
+    millisecond: 0,
+  });
+  return `on ${timestamp(noon.toMillis(), 'D')}`;
+}
+
+/** What `/gym google` says. */
+export function googleLineTexts(line: GoogleLineSnapshot, share: ServerShare): string[] {
+  const heading = '### The line for Google';
+  if (!line.fetches) {
+    return [heading, 'No Google API key is configured, so nothing is asked of Google.'];
+  }
+  const { used, budget, now } = line;
+  const waiting =
+    share.gyms + share.wayspots === 0
+      ? 'Nothing of this server waits for Google.'
+      : `${[
+          share.gyms > 0 ? counted(share.gyms, 'gym') : undefined,
+          share.wayspots > 0
+            ? counted(share.wayspots, 'PokéStop or Power Spot', 'PokéStops or Power Spots')
+            : undefined,
+        ]
+          .filter((part) => part !== undefined)
+          .join(
+            ' and ',
+          )} of this server ${share.gyms + share.wayspots === 1 ? 'waits' : 'wait'} for Google.`;
+  const month =
+    `This month ${amount(used.monthPlaces)} of ${amount(budget.places)} places searches ` +
+    `${used.monthPlaces === 1 ? 'is' : 'are'} used; the line stops when ` +
+    `${amount(budget.reserve)} ${budget.reserve === 1 ? 'is' : 'are'} left, for gyms added or ` +
+    `moved by hand and \`/gym refresh\`. ${amount(used.monthGeocodes)} of ` +
+    `${amount(budget.geocodes)} addresses ${used.monthGeocodes === 1 ? 'is' : 'are'} used. The ` +
+    `month starts again ${timestamp(googleMonth(now).nextReset, 'f')}, when Google’s free ` +
+    'amounts reset.';
+  const estimate = estimateLine({
+    now,
+    used,
+    budget,
+    everyMs: line.everyMs,
+    gyms: share.gymsTo,
+    allGyms: line.gyms.length,
+    wayspots: share.wayspotsTo,
+  });
+  const gymsWhen = estimate.gyms === undefined ? undefined : when(estimate.gyms, now);
+  const allWhen = estimate.all === undefined ? undefined : when(estimate.all, now);
+  const pace =
+    allWhen === undefined
+      ? undefined
+      : gymsWhen === undefined
+        ? `At this pace everything of this server is asked about ${allWhen}.`
+        : gymsWhen === allWhen
+          ? `At this pace everything of this server is asked about ${allWhen}, the gyms first.`
+          : `At this pace the gyms of this server are all asked about ${gymsWhen}, and ` +
+            `everything of this server ${allWhen}.`;
+  return [
+    heading,
+    waiting,
+    month,
+    ...(pace === undefined ? [] : [pace]),
+    '-# The line and the budget are this instance’s, for its one Google key; the counts are ' +
+      'this server’s part of it.',
+  ];
+}
+
+/** `/gym google` for the staff member's server. */
+async function googleLineMessage(ctx: AppContext, guildId: number | undefined) {
+  const line = await ctx.gymAdmin.googleLine();
+  const own = new Set(
+    ctx.regions
+      .all()
+      .filter((region) => guildId !== undefined && region.guildId === guildId)
+      .map((region) => region.channelId),
+  );
+  const share = serverShare(
+    line,
+    (gymId) =>
+      guildId !== undefined && gymRegionsInGuild(ctx.gyms, ctx.regions, gymId, guildId).length > 0,
+    (wayspotId) => ctx.wayspots.regionsOf(wayspotId).some((channelId) => own.has(channelId)),
+  );
+  return gymQuestion(googleLineTexts(line, share));
+}
+
+/**
+ * `/gym google` (plan 8W-6): how far the line that waits for Google is, for staff: this
+ * server's gyms, PokéStops and Power Spots that wait, this month's questions of the budget and
+ * the reserve, when the month resets, and when at the current pace this server's gyms and all
+ * of its part will be done. The line and the budget are the instance's (one Google key).
+ */
+export const googleLine: SubcommandPart = {
+  data: new SlashCommandSubcommandBuilder()
+    .setName('google')
+    .setDescription('See how far the gyms and PokéStops waiting for Google have come'),
+  help: {
+    details:
+      'Gyms are also found by the names of the places around them, and PokéStops and Power ' +
+      'Spots too, which I ask Google for one at a time within a monthly budget that stays ' +
+      'within its free amounts: gyms first, the busiest regions first, then PokéStops and Power ' +
+      'Spots a little every day. This says how many of this server wait, how much of the ' +
+      'month’s budget is used, and when they will be done at this pace.',
+    examples: ['/gym google'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const { guildId } = await staffPlace(interaction, ctx);
+    await answerGym(interaction, await googleLineMessage(ctx, guildId));
+  },
+};
diff --git a/src/commands/gyms/index.ts b/src/commands/gyms/index.ts
index 4efcfdc38ed84f45ce7bfcc68889dc8758664ae6..1f42d884b71c642ebc1ba95e86c8ee4ae5257b9e 100644
--- a/src/commands/gyms/index.ts
+++ b/src/commands/gyms/index.ts
@@ -6,6 +6,7 @@ import { deleteGym } from './delete.js';
 import { duplicateGyms } from './duplicates.js';
 import { editGym } from './edit.js';
 import { eliteGym } from './elite.js';
+import { googleLine } from './google.js';
 import { importGyms } from './import.js';
 import { moveGym } from './move.js';
 import { reviewGyms } from './review.js';
@@ -25,6 +26,7 @@ const parts: readonly SubcommandPart[] = [
   duplicateGyms,
   importGyms,
   reviewGyms,
+  googleLine,
 ];
 
 /**
diff --git a/src/render/text.ts b/src/render/text.ts
index 7a6e1df88df9c23c8364a9c86c410a43282b2342..a39a2c1bfe63e52fd137ff1f9ea7f4be7de8ff56 100644
--- a/src/render/text.ts
+++ b/src/render/text.ts
@@ -318,7 +318,7 @@ export function clockText(ms: number, zone: string): string {
  * A moment as Discord shows it in each reader's own time zone: `<t:1760000000:t>`. `t` is the
  * clock time, `f` the date with it, `F` the weekday too, `R` how long until or since.
  */
-export function timestamp(ms: number, style: 't' | 'R' | 'f' | 'F' | 'd' = 't'): string {
+export function timestamp(ms: number, style: 't' | 'R' | 'f' | 'F' | 'd' | 'D' = 't'): string {
   return `<t:${Math.floor(ms / 1000)}:${style}>`;
 }
 
diff --git a/src/services/gym-admin-service.ts b/src/services/gym-admin-service.ts
index 58a55cc2a3616eb886c24d481aa5ef209bf98f2e..21a1eff1616729f33086f9f083c85f0f1c64ecf2 100644
--- a/src/services/gym-admin-service.ts
+++ b/src/services/gym-admin-service.ts
@@ -34,7 +34,7 @@ import { mapPicture } from '../render/v2.js';
 import { mapOrNothing, type MapProvider } from './static-maps.js';
 import type { Member } from './attendance-service.js';
 import type { GeoGateway } from './geo-gateway.js';
-import type { GymRefresh, GymsInMemory, GymUpkeep } from './gym-upkeep.js';
+import type { GoogleLineSnapshot, GymRefresh, GymsInMemory, GymUpkeep } from './gym-upkeep.js';
 import { AdminLock } from './admin-lock.js';
 import type { PartyStore } from './party-store.js';
 import { gymRegionsInGuild, type RegionProvider } from './region-directory.js';
@@ -230,7 +230,7 @@ export interface GymAdminOptions {
   targets: Pick<GymTargetUpkeep, 'membersTargeting'>;
   upkeep: Pick<
     GymUpkeep,
-    'gymChanged' | 'placed' | 'placedBlock' | 'removed' | 'refresh' | 'fetches'
+    'gymChanged' | 'placed' | 'placedBlock' | 'removed' | 'refresh' | 'fetches' | 'snapshot'
   >;
   geo: Pick<GeoGateway, 'followShortLink'>;
   /** To announce a new gym and a deletion in the server's channel for bot updates. */
@@ -850,6 +850,11 @@ export class GymAdminService {
     return this.options.upkeep.refresh(id);
   }
 
+  /** The line that waits for Google as it is (`GymUpkeep.snapshot`, `/gym google`). */
+  googleLine(): Promise<GoogleLineSnapshot> {
+    return this.options.upkeep.snapshot();
+  }
+
   /** How many members have a gym as a gym target, over all servers. */
   targetCount(id: number): Promise<number> {
     return this.options.targets.membersTargeting(id);
diff --git a/src/services/gym-upkeep.ts b/src/services/gym-upkeep.ts
index f1967d0e922568cf798186bfa3e9c0b6443ee513..92b6dc7614bedbbcddb39e109f30f905737bcea4 100644
--- a/src/services/gym-upkeep.ts
+++ b/src/services/gym-upkeep.ts
@@ -11,6 +11,7 @@ import {
   lineAllowance,
   NO_REGION_RANK,
   type GoogleBudget,
+  type GoogleUsed,
 } from '../domain/geo/google-line.js';
 import {
   MemoryGoogleUse,
@@ -19,7 +20,7 @@ import {
   type GoogleUse,
 } from './google-use.js';
 import type { GoogleRanks } from './google-ranks.js';
-import { MemoryGymLookups, type GymLookups } from './gym-lookups.js';
+import { MemoryGymLookups, type GymLookups, type WaitingGym } from './gym-lookups.js';
 import type { WayspotProvider } from './wayspot-directory.js';
 import {
   MemoryWayspotLookups,
@@ -89,6 +90,21 @@ export interface GymRefresh {
   places: FetchOutcome;
 }
 
+/** The line as it is (`GymUpkeep.snapshot`, for `/gym google`). */
+export interface GoogleLineSnapshot {
+  /** Whether Google is asked at all (an API key is configured). */
+  fetches: boolean;
+  /** Every gym that waits, in the line's order. */
+  gyms: WaitingGym[];
+  /** Every PokéStop and Power Spot that waits, in the line's order (after every gym). */
+  wayspots: WaitingWayspot[];
+  used: GoogleUsed;
+  budget: GoogleBudget;
+  /** One question every so often. */
+  everyMs: number;
+  now: number;
+}
+
 /** The part of `GymDirectory` the upkeep works on. */
 export interface GymsInMemory {
   all(): Gym[];
@@ -250,6 +266,23 @@ export class GymUpkeep {
     return this.lookups.count();
   }
 
+  /**
+   * The line as it is (`/gym google`): whether Google is asked at all, every gym and Wayspot
+   * that waits in the line's order, this month's questions, the budget and the line's pace.
+   */
+  async snapshot(): Promise<GoogleLineSnapshot> {
+    const now = this.now();
+    return {
+      fetches: this.fetches,
+      gyms: await this.lookups.list(),
+      wayspots: await this.wayspotLookups.list(),
+      used: await usedThisMonth(this.use, now),
+      budget: this.budget,
+      everyMs: this.placesEveryMs,
+      now,
+    };
+  }
+
   /** How many PokéStops and Power Spots wait in the line. */
   waitingWayspots(): Promise<number> {
     return this.wayspotLookups.count();
diff --git a/test/support/gym-admin.ts b/test/support/gym-admin.ts
index 9ff329cd6c2d38050f1781ed807d65e56ef9a026..53efbbfd8417750cb59c2cb9d4706b4596560f93 100644
--- a/test/support/gym-admin.ts
+++ b/test/support/gym-admin.ts
@@ -3,6 +3,9 @@ import type { GymRemoval, RemovedGym } from '../../src/db/repositories/gym-remov
 import { AdminLock } from '../../src/services/admin-lock.js';
 import { GymAdminService, type StaffPlace } from '../../src/services/gym-admin-service.js';
 import { GymUpkeep } from '../../src/services/gym-upkeep.js';
+import { MemoryGoogleUse } from '../../src/services/google-use.js';
+import { MemoryGymLookups } from '../../src/services/gym-lookups.js';
+import { MemoryWayspotLookups } from '../../src/services/wayspot-lookups.js';
 import type { Party } from '../../src/domain/party/party.js';
 import { FakeGeoGateway } from './geo.js';
 import { gymDirectoryWith, MemoryGyms } from './gym-store.js';
@@ -100,6 +103,10 @@ export async function gymAdminWith(
   const made = await partyServiceWith(parties, { gyms: directory }, { ...kept, regions });
   made.gateway.channelNames.set(UPDATES_CHANNEL, made.settings.channels['bot-updates']);
   const geo = new FakeGeoGateway();
+  // The line and the month's counts, for a test to fill and read (plan 8W-6).
+  const lookups = new MemoryGymLookups();
+  const wayspotLookups = new MemoryWayspotLookups();
+  const use = new MemoryGoogleUse();
   const upkeep = new GymUpkeep({
     gyms: gymStore,
     directory,
@@ -109,6 +116,9 @@ export async function gymAdminWith(
     log: made.log,
     // The line waits for `flush`.
     setTimer: () => () => undefined,
+    lookups,
+    wayspotLookups,
+    use,
   });
   const removal = new MemoryGymRemoval(gymStore, made.routes, made.gymTargets);
   // The one lock of gym and region administration, as in the bot.
@@ -130,5 +140,17 @@ export async function gymAdminWith(
     settings: made.settings,
     log: made.log,
   });
-  return { ...made, admin, upkeep, geo, gymStore, removal, directory, lock };
+  return {
+    ...made,
+    admin,
+    upkeep,
+    geo,
+    gymStore,
+    removal,
+    directory,
+    lock,
+    lookups,
+    wayspotLookups,
+    googleUse: use,
+  };
 }
````

### Task 6: 8W-6 task 6: the staging checklist

Prototype commit: `88f98805f13b923c89525ca28bfcbdcebd89e908`

docs/superpowers/plans/2026-10-25-phase-8w6-staging.md: every step with Matt's go-ahead; the
commands deployed first for /gym google; the old setting refused; the Pacific month and the
budget checked with a seeded GoogleUseDay (and an old GymLookupDay row); the reserve, questions
by hand, a restart; the ranks and the order (gyms, then stops and Power Spots at the day's
share), a stop found by its businesses, moved and gone Wayspots; a first import of the
Pittsburgh export in blocks on a restored pre-import snapshot of the dev database, timed, the
nearest gyms checked, then the backup loaded again.

**Files:**

```
 docs/superpowers/plans/2026-10-25-phase-8w6-staging.md | 94 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 94 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 88f98805f13b923c89525ca28bfcbdcebd89e908 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-25-phase-8w6-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8W-6 task 6: the staging checklist`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/superpowers/plans/2026-10-25-phase-8w6-staging.md b/docs/superpowers/plans/2026-10-25-phase-8w6-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..324735f484e17af006fa3017cf4b98a91e4191f4
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-25-phase-8w6-staging.md
@@ -0,0 +1,94 @@
+# Phase 8W-6 staging checklist: the Google line as a priority queue with a monthly budget, a first import's gyms in blocks (draft)
+
+Every step needs Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab and reads the dev database (`pine-dev-mysql`) and the bot's log. Every step that lets the bot ask Google spends real questions of the dev key: the stage settings keep the budget small (step 2), so that the whole run asks at most about a hundred.
+
+- **Accounts:** Googer (owner, staff) and Tester (a member).
+- **Plan:** 8W-6; design `docs/superpowers/specs/2026-10-20-google-line-priority-design.md`.
+- **Conventions:** `docs/architecture/gyms-and-regions.md` (the line, its budget, its ranks, the gyms set aside, the gyms asked, the Wayspots in it, `/gym google`), `wayfarer.md` (the import in blocks, the Wayspots' places), `history.md` (`raidsByRegion`).
+- **Database:** migration 031 (`2026_10_25_031_google_line`) runs on the dev database only once 8W-6 is merged into `typescript-migration` (a migration not merged is never run there).
+- **Counts:** the line asks one question every five seconds from the moment the bot starts, so a count read a little after a start may be a few higher than the step says ("or more"); every count of a step is read relative to the counts of the step before it (`select day, kind, questions from GoogleUseDay order by day, kind`).
+
+## Before
+
+1. **The commands changed** (`/gym google` is new). Matt deploys them with the stage settings:
+
+   ```
+   set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global
+   ```
+
+2. **Settings** (`var/stage/settings.json`): `googleLookupsPerDay` taken out if it is there (step 3 shows why), and a small budget for the run: `"googleLookupsPerMonth": 60`, `"googleLookupsReserve": 10`, `"googleGeocodesPerMonth": 20`. `GOOGLE_API_KEY` set in `.env` (checked with a command that says set or empty, never read). The server's regions are Pittsburgh's 28, with their party history (staged parties and, if imported, the legacy history).
+3. **The old setting is refused.** With a copy of the stage settings that still names `googleLookupsPerDay`, the settings alone are read (no bot started):
+
+   ```
+   node --conditions=pine-source --import tsx -e "import('./src/config/settings.ts').then((m) => m.loadSettings('var/stage/settings-old.json'))"
+   ```
+
+   It fails, naming `googleLookupsPerDay` as an unknown key. A reserve of 60 beside a budget of 60 fails the same way, naming `googleLookupsReserve`.
+4. **A backup of the dev database** before anything else: `docker exec pine-dev-mysql mysqldump --single-transaction -uroot -p<root> <schema> > var/stage/8w6/before.sql` (the password from Matt). Every count this run clears or seeds, and the import steps (23 to 28), come back to this one.
+
+## The month and the budget, with a seeded day table
+
+5. **Migration 031** runs at the start (the log names it): `GymLookup` has `regionRank`, and `WayspotLookup`, `WayspotPlaces`, `GymGoogleAsked` and `GoogleUseDay` exist. `GymLookupDay` keeps its rows. Matt stops the bot again as soon as the log has named the migration: the line starts asking at once.
+6. **The Pacific day.** With the bot stopped, clear what was counted this month (the backup of step 4 has it) and seed `GoogleUseDay` for the current Pacific month (the 1st of the month in California, whatever the time in Pittsburgh):
+
+   ```sql
+   select day, gyms from GymLookupDay where day >= '<YYYY-MM>-01';   -- noted, then cleared
+   delete from GymLookupDay where day >= '<YYYY-MM>-01';
+   delete from GoogleUseDay;
+   insert into GoogleUseDay (day, kind, questions) values
+     ('<YYYY-MM>-01', 'places', 20), ('<YYYY-MM>-01', 'geocode', 5),
+     ('<previous month>-28', 'places', 999);
+   insert into GymLookupDay (day, gyms) values ('<YYYY-MM>-02', 7);
+   ```
+
+   Start the bot. `/gym google` (Googer) says "This month 27 of 60 places searches are used" (or a few more: the line has begun), "the line stops when 10 are left …", "5 of 20 addresses are used" (or a few more), and "The month starts again" with the 1st of next month at midnight Pacific (3:00 in Pittsburgh). The previous month's 999 is not counted; the old `GymLookupDay` row of this month is, as 7 places questions.
+7. **The night of the 1st.** Only if the run falls on it: between midnight and 3:00 in Pittsburgh on the 1st it is still the last day of the month in California, and `/gym google` still names that month and its counts; from 3:00 Pittsburgh time the counts start from nothing.
+8. **The line stops at the reserve.** With the bot running, `/gym google` again a few minutes later: the places searches climb by one every few seconds from the count of step 6 (log: the line's questions) until 50 of 60 are used, then stop. The log says nothing more of the line; `/gym google`'s counts stand still.
+9. **A question by hand uses the reserve.** `/gym refresh gym:<any gym>`: answered as before; `/gym google` shows 51 of 60, and one more address. Ten more refreshes go past 60 (61 of 60): each is answered, and counted (`GoogleUseDay` of today).
+10. **A gym added by hand** (`/gym add` at a free place in a region, then `/gym delete` it): it gets its address and places at once, counted; the line itself still asks nothing.
+11. **A restart keeps the month.** Matt stops the bot (one Ctrl+C) and starts it again: `/gym google` shows the same counts, and the line does not start again (only the reserve is left).
+12. **No busy timer while the month is used up.** Only while the reset is more than 25 days away (before the 6th in a 30-day month, the 7th in a 31-day month): only then does the wait lie beyond what a Node timer holds (24.8 days); later in the month the unit test covers it. With only the reserve left (step 11), watch for ten minutes: the log has nothing of the line, `GoogleUseDay` is unchanged, the bot's process is idle in Task Manager (no core busy), and MySQL's `show global status like 'Questions'` grows only by what other work asks.
+13. **Addresses used up, places go on.** With the bot stopped: `update GoogleUseDay set questions = 20 where day = '<YYYY-MM>-01' and kind = 'geocode'` (with today's geocodes, at least 20 this month), and the budget raised to 80 (`googleLookupsPerMonth`). Start the bot: the line asks about gyms that wait for their places alone (`GymLookup.address = 0`; log, `gym` ids), never a geocode (the geocodes of `GoogleUseDay` stand still); the gyms with `address = 1` stay in `GymLookup`. `/gym google` says "20 of 20 addresses are used" (or more, from step 9).
+
+## The order of the line
+
+14. **The ranks.** In the dev database:
+
+    ```sql
+    select g.regionRank, count(*) from GymLookup g group by g.regionRank order by 1 desc;
+    ```
+
+    The ranks match the regions' raids of the last 90 days (`PartyHistory`, kinds `raid` and `max`), the busiest region at 1; gyms in no region at -1. With no history at all, every region at 1. A rank of -2 is a gym whose question failed, until the next day.
+15. **The busiest region first.** The geocodes back as they were (`update GoogleUseDay set questions = 5 where day = '<YYYY-MM>-01' and kind = 'geocode'`), the budget raised by 20 over this month's places count (`googleLookupsPerMonth`, restart): the next gyms asked (log, `gym` ids) lie in the region of the highest rank, whatever their time in the line, until the count reaches the new budget less 10.
+16. **Gyms before Wayspots.** `/gym google` names the PokéStops and Power Spots of this server that wait; `select kind, count(*) from WayspotLookup group by kind` has stops and power spots of the server's regions only (none of the Wayspots outside every region; none of kind gym). While gyms wait, no Wayspot is asked (log).
+17. **The day's share.** The gyms out of the way for the step, so that Wayspots get turns: with the bot stopped, every gym that waits, and every gym without places (the Wayfarer gyms never asked, which a start would put in the line again), is marked as asked, and the line of gyms emptied (the backup of step 4 has them):
+
+    ```sql
+    insert ignore into GymGoogleAsked (gymId, askedAt)
+      select g.id, 0 from Gym g left join GymMeta m on m.gymId = g.id where m.places is null;
+    insert ignore into GymGoogleAsked (gymId, askedAt) select gymId, 0 from GymLookup;
+    delete from GymLookup;
+    ```
+
+    Raise the budget to this month's places count plus 70. Today's share is (budget − 10 − places counted before today) ÷ days left in the month, with today; the places counted today already (steps 8 to 15) count against it, and by now the share is usually at or below today's count, so the line would ask none. So, with the bot still stopped, work the share out and set today's places to the share less 10 (`update GoogleUseDay set questions = <share − 10> where day = '<today>' and kind = 'places'`), then start the bot. After the start `GymLookup` is still empty; the line asks PokéStops, then Power Spots, about 10 of them, until today's places count reaches the share, then waits. The log says nothing more today. `WayspotPlaces` has a row per Wayspot asked, with its point and the names.
+18. **Found by its businesses.** After a restart (the places are read at once at a start; otherwise within the hour), `/wild near:` with the name of a business of one of those rows (not in the stop's title): the stop is offered, after any stop or gym that has the word in its own name.
+19. **A stop of Pine's own waits as a PokéStop.** `/pokestop add` a stop at a free place in a region (Googer): within seconds `select * from WayspotLookup where wayspotId like 'pine-%'` has `pine-<its id>` of kind `stop` (asked at once while today's share allows, then in `WayspotPlaces` under that id). `/pokestop remove` it afterwards: it leaves `WayspotLookup` and `WayspotPlaces` at once.
+20. **A moved or changed Wayspot waits again.** In the dev database, move a Wayspot asked about by 50 m (`update Wayspot set lat = lat + 0.00045 where id = '<id>'`) and change another's kind to `powerspot`, then restart: both are in `WayspotLookup` again (the second as `powerspot`); one moved by 2 m is not.
+21. **Gone Wayspots lose their places.** Mark a Wayspot asked about `kind = 'gone'`, restart: it leaves `WayspotLookup` and `WayspotPlaces`. Restore it afterwards (`kind` as before).
+22. **Staff only.** Tester's slash menu offers no `/gym` (and so no `/gym google`); Tester's `/help` names neither `/gym` nor `/gym google`.
+
+## A first import in blocks
+
+23. **A database before the first import.** Restore the snapshot of the dev database from before the Wayfarer import of 2026-10-18 (`var/stage/TEST-SERVER-STATE.md` names it; `./pine restore` is not used here, the dump is loaded into `pine-dev-mysql` by hand), then start the bot: migration 031 runs on it too.
+24. **The preview** of the Pittsburgh export (the file of the 2026-10-18 scan, `var/stage/`): `/gym import` as before; note the number of gyms it would add (about 2,600 on a takeover, about 5,300 on the test server's gyms).
+25. **Import.** Press Import and time it from the press to the outcome:
+    - the outcome's counts are the preview's; the log has a line per block (`a block of Wayfarer gyms was added`, with `block` 1 to `blocks`, and its gyms `added`, `held` and `failed`), `a gym was added` per gym, and no `a block of gyms failed`;
+    - the gym admin lock is held for seconds, not minutes: `/gym show gym:<any>` used right after the press waits only until the outcome;
+    - one summary post in bot updates, as before.
+26. **The nearest gyms are right.** In the dev database, for a sample of 20 added gyms, the stored `GymMeta.nearestGym` is the nearest gym by distance (a query of the step's notes in `var/stage/8w6/`), and the gyms whose nearest gym is a new one wait in `GymLookup` for their places.
+27. **The line after the import.** `/gym google`: the added gyms wait (those with Wayfarer's address for their places only, `address = 0`), the busiest regions first; the estimate names when this server's gyms will be done at the stage budget (months, at 60 a month) and at the production budget (`googleLookupsPerMonth` 4,500: within weeks).
+28. **Back.** Stop the bot and load `var/stage/8w6/before.sql` (step 4) again.
+
+## After
+
+29. Note the results in the follow-ups file, under "From the staging run of 8W-6", and take the stage budget out of `var/stage/settings.json` (back to the defaults).
````

## After the last task

- [ ] `npm run check > var/8w6-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff 88f98805f13b923c89525ca28bfcbdcebd89e908 HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
