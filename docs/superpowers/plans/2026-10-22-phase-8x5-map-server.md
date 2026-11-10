# Phase 8X-5: Max Battles on the Live Map, the Server Side: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The fifth plan of max battles (design `docs/superpowers/specs/2026-10-20-max-battles-design.md`, section 7), **the server side only** (Matt, 2026-10-22): the map's page may be redone after its staging (a CSS polish with layers to choose, or more), so this plan builds what any page would use unchanged, and the page (`src/web/client/`) gets no new feature. In detail:

- **`reportMaxAs`**: `/max`'s report as one function `/max` and the map call (as `reportRaidAs`), with `spotAt` (a spot or a point named without an interaction), `maxBarred` and `blockedAtPin` with staff passed in, the words through a namer (`MaxNames`), the ending-soon question's words shared (`endingSoonQuestion`). `/max`'s words and behaviour are unchanged.
- **Max battles in the map's data**: `PartiesView.maxes` of `MapMax` (named as `MapRaid` where the meaning is the same; dropped once the battle has ended; Done always offered), the look through `PartyViewInput.maxLook` so the domain stays pure; every party's attendance gains `remote: { offered, on }`.
- **`GET /api/powerspots?box`** (as `/api/stops`, through the shared `wayspotsInBox`) and **`GET /api/max-options`** (the current max bosses in `/max`'s order, the tier choices).
- **`POST /api/maxes`**: a report at a Power Spot or a point (the nearest spot within 50 m, else a pin), refused as `/max` refuses (blocked members only for a new battle at a pin, the moderators' notice for a pin battle); the ending-soon question as a 422 carrying its choices and their ends, asked before the throttle and decided anew on the second request; `needs: 'tier' | 'listed-spot'` and the map's own words where `/max`'s name the command.
- **Remote on the map**: `POST /api/parties/<id>/remote` for every kind whose post offers Remote, outside `MAP_ACTIONS` (the current page's labels stay as they are).
- **Train kinds on the map**: `POST /api/trains` takes `kind`; `POST …/move/kind` (`setKindAs`); `MapTrain.trainKind` / `trainKindWords`, `MapTrainRights.kind` (true for a planned train without a route, whose `panel` stays null).

**Architecture:**

- **Commands:** `src/commands/max/max-report.ts` (new), `max.ts`, `max-input.ts` (`spotAt`); `render/max-dialog.ts`.
- **Domain:** `src/domain/web/party-data.ts`, `party-view.ts`, `max-data.ts` (new), `picture.ts` (new), `train-data.ts`.
- **Web:** `src/web/max-routes.ts` (new), `max-options.ts` (new), `wayspot-box.ts` (new), `party-routes.ts`, `train-routes.ts`, `meetup-routes.ts`, `raid-routes.ts`, `server.ts`, `guild-routes.ts`; `app.ts` wiring; `commands/trains/train-changes.ts` (`setKindAs`).

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14, Fastify, Vitest. No new dependency, no migration, no party state change, no command change (no deploy needed).

**Spec:** the design above, the brief `.superpowers/sdd/8x-5-map-server/design.md` (its review R1–R13) and the ledger (git-ignored; Matt's decisions).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8x5`, tip `090da1bc`), one commit per task, on `max-battles` 8e49b6ca (8X-4 merged). Each commit typechecks (both projects) and its tests pass; on the tip the full check (8,495 tests), the build and the database suite (520) are clean.

**Reviews:** a fresh Opus reviewer read the brief before any code (five Important: the page's typecheck with a `remote` action, the domain's purity, the ending-soon answer's state and throttle, a planned train's kind, naming a spot without an interaction; all folded into the brief). Two Opus reviewers went through the prototype (tasks 1 and 4: five Minor; tasks 2, 3, 5–7: seven Minor), then two fix reviews (the second: two Minor, words on the map that only work on Discord and a page test that read no max battle). Every finding is in the commits below.

## Decisions in this plan

Made while prototyping and reviewing, for Matt to look at:

1. **Remote on the map for every kind whose post has it** (raids, max battles, meetups, trains). Matt, 2026-10-22: Remote on meetups feels odd but stays (PvP tournaments), and may change before the cutover (one rule, `remoteAllowed`).
2. **Reports at a pin from the map** as `/max` allows them (Q7), with the same blocks and the moderators' notice; the notice does not say "on the map".
3. **The ending-soon question** is a 422 with its choices and their ends, not server state; the second request is accepted only while its choice is still offered.
4. **The pick list** names a boss's tier code `level` (`D2`) and its words `tier` (`Dynamax 2★`), as `MapRaid` and `MapMax` do.
5. **A train's kind** is `trainKind` on `MapTrain` (`kind` already tells the party kinds apart); the kind press is its own constant, not a `PANEL_PRESSES` entry (the page's move body would misread it).
6. **Not built:** the page's part (Power Spot layer, max battle markers and popups, the report form, Remote, the kind menu and the kind in the start form, Add to route from a spot): a follow-up after the map's staging decides the page.

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment.
- `src/domain/` stays pure. Tests never use the network and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8x5`). Apply it exactly with `git apply`, never retype; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock), one at a time. Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/`, `.superpowers/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **`/max` unchanged:** its words, guards, throttle counting, give-backs, ending-soon dialog and pin notice.
2. **The current page:** it compiles and draws exactly what it drew (new fields only; `remote` outside `MAP_ACTIONS`; `panel` null for an empty route).
3. **Every new route:** `postGuard` and limits, the order of checks, the throttle only after every refusal of who asks or what they name, statuses, logs without texts or points.
4. **The ending-soon flow:** asked before the throttle, counted once, a stale choice re-asked or refused as the dialog does.

## Tasks

### Task 1: 8X-5 task 1: reportMaxAs, shared by /max and the map

Prototype commit: `19a2a8b032a72a1bba5c5567693789a5219039da`

The report of /max as a function of its own (src/commands/max/max-report.ts), as
reportRaidAs is for raids: the report as the member with their privacy and automatic
status, the pin's log line and the moderators' notice, the outcome; its words through
the caller's ReportNames (mentions on Discord, no post and a channel by name on the
map). maxBarred and blockedAtPin take no interaction (staff passed in); spotAt names a
spot by its Wayfarer id or a point without an interaction, and readSpot names its pins
through it; endingSoonQuestion words the ending-soon question for the dialog and the
map alike, each choice with the end it reports. /max keeps its words and behaviour.

**Files:**

```
 src/commands/max/max-input.ts       |  47 +++++++++-
 src/commands/max/max-report.test.ts | 178 ++++++++++++++++++++++++++++++++++++
 src/commands/max/max-report.ts      | 275 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/max/max.test.ts        |   3 +-
 src/commands/max/max.ts             | 210 ++++++++-----------------------------------
 src/render/max-dialog.ts            |  55 ++++++++++--
 test/support/max-reporting.ts       |  70 +++++++++++++++
 7 files changed, 649 insertions(+), 189 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/max/max-report.test.ts src/commands/max/max.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 19a2a8b032a72a1bba5c5567693789a5219039da -- src/commands/max/max-input.ts src/commands/max/max-report.test.ts src/commands/max/max-report.ts src/commands/max/max.test.ts src/commands/max/max.ts src/render/max-dialog.ts test/support/max-reporting.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-5 task 1: reportMaxAs, shared by /max and the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/max/max-input.ts b/src/commands/max/max-input.ts
index 093f5c7aca2a2146d89cf1ae19df723173da5749..f4090b799fa28bf25ba81e70de09fe300ad18a13 100644
--- a/src/commands/max/max-input.ts
+++ b/src/commands/max/max-input.ts
@@ -21,7 +21,13 @@ import { plain, truncate } from '../../render/text.js';
 import { currentMaxBossChoices } from '../../services/max-boss-service.js';
 import { placeValue } from '../../services/place-finder.js';
 import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
-import { namedPlace, pickedPlace, type PlaceKindsOnly } from '../place-option.js';
+import {
+  namedPlace,
+  pickedPlace,
+  PIN_NOT_HERE,
+  PLACE_GONE,
+  type PlaceKindsOnly,
+} from '../place-option.js';
 import { between } from '../raids/raid-input.js';
 
 const MINUTE = 60_000;
@@ -207,11 +213,44 @@ export async function readSpot(
   if (place.kind === 'powerspot') return place as PowerSpot;
   if (place.kind !== 'pin') throw new UserError(SPOTS_ONLY.refusal);
   const row = await ctx.guilds.idFor(guildIdOf(interaction));
-  const near = row === undefined ? undefined : ctx.placeFinder.nearestPowerSpot(row, place);
-  const known = near && row !== undefined ? pickedPlace(ctx, row, placeValue(near)) : undefined;
+  // `namedPlace` made the pin in a region of this server, so the row is known.
+  if (row === undefined) throw new UserError(PIN_NOT_HERE);
+  return spotAt(ctx, row, place, { checked: true });
+}
+
+/** What naming a spot without an interaction needs: the gyms, Wayspots and the place search. */
+export type SpotReading = Pick<AppContext, 'gyms' | 'wayspots' | 'placeFinder'>;
+
+/**
+ * The spot of a max battle named without an interaction (the map, plan 8X-5), as `/max` names
+ * it: a power spot by its Wayfarer id (`spot`, as `pickedPlace` names a pick of its list:
+ * refused `PLACE_GONE` once it is gone or of another kind, or outside the server's regions); a
+ * point (`lat`, `lon`; the map keeps it to six decimals) in a region of the server (else `PIN_NOT_HERE`),
+ * which is the nearest power spot within 50 metres (`PlaceFinder.nearestPowerSpot`), else a pin,
+ * an "Unlisted power spot" (Q7), named by nothing else. `readSpot` names its pins so, with
+ * `checked`: `namedPlace` made the pin in a region of the server already (`PlaceFinder.pin`), so
+ * it is not looked at again.
+ */
+export function spotAt(
+  ctx: SpotReading,
+  row: number,
+  named: { spot: string } | { lat: number; lon: number; linkName?: string | null },
+  options: { checked?: boolean } = {},
+): MaxSpot {
+  if ('spot' in named) {
+    const known = pickedPlace(ctx, row, placeValue({ kind: 'powerspot', id: named.spot }));
+    if (known?.kind !== 'powerspot') throw new UserError(PLACE_GONE);
+    return known as PowerSpot;
+  }
+  const point = { lat: named.lat, lon: named.lon };
+  if (options.checked !== true && !ctx.placeFinder.pin(row, point, null, ['powerspot'])) {
+    throw new UserError(PIN_NOT_HERE);
+  }
+  const near = ctx.placeFinder.nearestPowerSpot(row, point);
+  const known = near ? pickedPlace(ctx, row, placeValue(near)) : undefined;
   if (known?.kind === 'powerspot') return known as PowerSpot;
   // An unlisted power spot (Q7): named by nothing else, whatever is near it.
-  return { kind: 'pin', lat: place.lat, lon: place.lon, near: null, linkName: place.linkName };
+  return { kind: 'pin', ...point, near: null, linkName: named.linkName ?? null };
 }
 
 /** Whether a text is a maps link or coordinates (a pin): its autocomplete offers nothing. */
diff --git a/src/commands/max/max-report.test.ts b/src/commands/max/max-report.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4e05d9ed978426fbee657cf88c99154bff00f526
--- /dev/null
+++ b/src/commands/max/max-report.test.ts
@@ -0,0 +1,178 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
+import { WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-reporting.js';
+import { ALICE, asMax, at, TEST_SPOT } from '../../../test/support/parties.js';
+import { MOD_CHANNEL } from '../../../test/support/meetup-safety-service.js';
+import { textDisplays } from '../../../test/support/messages.js';
+import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
+import { endingSoonQuestion, ENDING_SOON, NEXT_ROTATION } from '../../render/max-dialog.js';
+import { PIN_NOT_HERE, PLACE_GONE } from '../place-option.js';
+import { spotAt } from './max-input.js';
+import { MAX_ENDED, maxReportWords, reportMaxAs, takenWords, type MaxNames } from './max-report.js';
+
+/** How the map names a post (not at all) and a region's channel (by its name), and its words. */
+const MAP_NAMES: MaxNames = {
+  post: () => undefined,
+  channel: () => '#west',
+  ended: 'The max battle there has just ended: report it again.',
+  bossHint: ' Open its post and use /boss there to change its boss.',
+};
+
+const MACHOP = { boss: { key: 'machop' }, tier: 'D2' as const, label: 'Dynamax Machop (2★)' };
+const NINE = at('2026-10-22T21:00');
+
+describe('reporting a max battle as a member (reportMaxAs)', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('reports as the member, kept out of the post by their privacy, signed up by their automatic status', async () => {
+    const made = await maxReportingWith();
+    made.userSettings.set(ALICE, {
+      raidPrivacy: RaidPrivacy.Anonymous,
+      autoStatus: PartyStatus.Coming,
+    });
+    const result = await reportMaxAs(
+      made.ctx,
+      { id: ALICE, name: 'Alice' },
+      FAKE_GUILD_ID,
+      { boss: MACHOP, spot: TEST_SPOT, end: NINE, regionChannelId: WEST_CHANNEL },
+      () => Promise.resolve(true),
+    );
+    expect(result.autoStatus).toBe(PartyStatus.Coming);
+    expect(result.outcome.kind).toBe('created');
+    const battle = asMax(made.store.active()[0]);
+    expect(battle).toMatchObject({ anonymous: true, createdById: ALICE, endTime: NINE });
+    expect(battle.attendees[ALICE]?.status).toBe(PartyStatus.Coming);
+  });
+
+  it('tells the moderators of a new battle at a pin, and logs it for staff', async () => {
+    const made = await maxReportingWith({});
+    const pin = { kind: 'pin' as const, lat: 40.05, lon: -80.05, near: null, linkName: null };
+    await reportMaxAs(
+      made.ctx,
+      { id: ALICE, name: 'Alice' },
+      FAKE_GUILD_ID,
+      { boss: MACHOP, spot: pin, end: NINE, regionChannelId: WEST_CHANNEL },
+      () => Promise.resolve(true),
+    );
+    await made.reports.flush();
+    const [notice] = made.gateway.messagesIn(MOD_CHANNEL);
+    expect(textDisplays(notice?.message)[0]).toMatch(/^### Max battle at an unlisted power spot/);
+    expect(made.entries).toContainEqual(
+      expect.objectContaining({
+        msg: 'a max battle was reported at an unlisted power spot',
+        reporter: ALICE,
+        server: FAKE_GUILD_ID,
+      }),
+    );
+  });
+
+  it("words its outcome with the caller's names: no post and a channel by name on the map", async () => {
+    const made = await maxReportingWith();
+    const result = await reportMaxAs(
+      made.ctx,
+      { id: ALICE, name: 'Alice' },
+      FAKE_GUILD_ID,
+      { boss: MACHOP, spot: TEST_SPOT, end: NINE, regionChannelId: WEST_CHANNEL },
+      () => Promise.resolve(true),
+    );
+    const ask = { boss: MACHOP, spot: TEST_SPOT, end: NINE };
+    expect(maxReportWords(made.ctx, result.outcome, ask, result.autoStatus, MAP_NAMES)).toBe(
+      `Reported: Dynamax Machop (2★) at Gazebo of the Park, until <t:${NINE / 1000}:t>.`,
+    );
+    const battle = asMax(made.store.active()[0]);
+    expect(takenWords(made.ctx, battle, 'D3', MAP_NAMES)).toBe(
+      'There is already a max battle against Dynamax Machop (2★) at Gazebo of the Park. ' +
+        'Open its post and use /boss there to change its boss.',
+    );
+    // `/max` keeps its words: the post named, and its hint.
+    expect(takenWords(made.ctx, battle, 'D3')).toBe(
+      'There is already a max battle against Dynamax Machop (2★) at Gazebo of the Park: ' +
+        `<#${battle.forumPostId}>. \`/boss\` there changes its boss.`,
+    );
+    const region = made.regions.byChannel(WEST_CHANNEL);
+    if (!region) throw new Error('no West');
+    expect(
+      maxReportWords(
+        made.ctx,
+        { kind: 'no-forum', region },
+        ask,
+        PartyStatus.Interested,
+        MAP_NAMES,
+      ),
+    ).toBe(
+      'The region #west has no raid forum yet. A moderator can create it with `/admin setup-forums`.',
+    );
+    // A battle that ended twice while the report waited: `/max`'s words name `/max`; the caller's.
+    expect(
+      maxReportWords(made.ctx, { kind: 'ended' }, ask, PartyStatus.Interested, MAP_NAMES),
+    ).toBe('The max battle there has just ended: report it again.');
+    expect(maxReportWords(made.ctx, { kind: 'ended' }, ask, PartyStatus.Interested)).toBe(
+      MAX_ENDED,
+    );
+  });
+});
+
+describe('a spot named without an interaction (spotAt)', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('names a kept power spot by its id, and refuses one Pine keeps no more', async () => {
+    const made = await maxReportingWith();
+    expect(spotAt(made.ctx, 1, { spot: TEST_SPOT.id })).toMatchObject({
+      kind: 'powerspot',
+      id: TEST_SPOT.id,
+      title: 'Gazebo of the Park',
+    });
+    expect(() => spotAt(made.ctx, 1, { spot: 'deadbeef.16' })).toThrow(PLACE_GONE);
+  });
+
+  it('takes a point near a power spot as that spot, one near none as a pin, and refuses one outside the regions', async () => {
+    const made = await maxReportingWith();
+    expect(spotAt(made.ctx, 1, { lat: TEST_SPOT.lat, lon: TEST_SPOT.lon + 0.0002 })).toMatchObject({
+      kind: 'powerspot',
+      id: TEST_SPOT.id,
+    });
+    expect(spotAt(made.ctx, 1, { lat: 40.05, lon: -80.05 })).toEqual({
+      kind: 'pin',
+      lat: 40.05,
+      lon: -80.05,
+      near: null,
+      linkName: null,
+    });
+    expect(() => spotAt(made.ctx, 1, { lat: 10, lon: 10 })).toThrow(PIN_NOT_HERE);
+  });
+});
+
+describe('the ending-soon question (endingSoonQuestion)', () => {
+  const zone = 'America/New_York';
+  const now = at('2026-10-22T14:57');
+  const end = at('2026-10-22T15:00');
+
+  it('offers the next rotation first, then the end about to pass, each with the end it reports', () => {
+    const next = at('2026-10-22T16:00');
+    expect(endingSoonQuestion({ end, next, now, zone })).toEqual({
+      text: 'This max battle ends at 3:00 PM, in 3 minutes. Report it until the next rotation?',
+      choices: [
+        { value: NEXT_ROTATION, label: 'Until the next rotation, 4:00 PM', end: next },
+        { value: ENDING_SOON, label: 'Until 3:00 PM (in 3 minutes)', end },
+      ],
+    });
+  });
+
+  it('asks only whether to report it where no later rotation is left', () => {
+    expect(endingSoonQuestion({ end, next: undefined, now, zone })).toEqual({
+      text: 'This max battle ends at 3:00 PM, in 3 minutes. Report it anyway?',
+      choices: [{ value: ENDING_SOON, label: 'Until 3:00 PM (in 3 minutes)', end }],
+    });
+  });
+});
diff --git a/src/commands/max/max-report.ts b/src/commands/max/max-report.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9e957b149183a00d8795728f2e57a9f56cd8c5bc
--- /dev/null
+++ b/src/commands/max/max-report.ts
@@ -0,0 +1,275 @@
+import type { AppContext } from '../../app-context.js';
+import type { MemberAccess } from '../../discord/party-gateway.js';
+import type { Throttle } from '../../discord/throttle.js';
+import { maxSpotName } from '../../domain/party/max.js';
+import { sameBoss, type MaxParty, type MaxSpot } from '../../domain/party/party.js';
+import { battleKindOf, maxBossTitle, type MaxTier } from '../../domain/pogo/max-tier.js';
+import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
+import { noPostWords } from '../../render/activity.js';
+import { plain, timestamp } from '../../render/text.js';
+import type { Member } from '../../services/attendance-service.js';
+import type { MaxReportOutcome, PartyService } from '../../services/party-service.js';
+import { DISCORD_NAMES, type ReportNames } from '../raids/report.js';
+import type { ReadMaxBoss } from './max-input.js';
+
+/*
+ * Reporting a max battle as `/max` and the live map (plan 8X-5) share it, as `reportRaidAs` is
+ * shared for raids: the report as the member, with their own privacy and automatic status
+ * (`reportMaxAs`, which also logs a pin and tells the moderators of it), the checks both make
+ * before their throttle (`maxBarred`, `blockedAtPin`), and the command's words for what came of
+ * it (`maxReportWords`), a post and a region channel named by the caller's `MaxNames`.
+ */
+
+/** The name `/max` is used and counted under, and the map's reports with it. */
+export const MAX_COMMAND = 'max';
+
+/** How often one member may report a max battle: as raids (`RAID_THROTTLE`). */
+export const MAX_THROTTLE: Throttle = { uses: 20, perSeconds: 900 };
+
+/** What `/max` is refused when the report would put the member in a forum barred to them. */
+export const MAX_BARRED =
+  'You cannot report a max battle at this spot: you are kept out of the forum its battle would be in.';
+
+/**
+ * What `/max` says to a member blocked from meetups (meetup safety's block) who reports at a pin
+ * (Matt, 2026-10-21, final review G1): a known power spot is still theirs to report.
+ */
+export const MAX_PIN_BLOCKED =
+  'You are blocked from making meetups in this server, so you cannot report a max battle at an ' +
+  'unlisted power spot. Pick a power spot from the list.';
+
+/**
+ * What `/max` says when the battle a report would join ended while it waited, and the one after
+ * it too (fix review F2): nothing was done.
+ */
+export const MAX_ENDED = 'The max battle there has just ended: use `/max` again.';
+
+/** A report whose boss, spot and end are read: what, where, until when, made in which region. */
+export interface MaxReportRequest {
+  boss: ReadMaxBoss;
+  spot: MaxSpot;
+  end: number;
+  /** The region channel the report was made in (the map: the region the member picked). */
+  regionChannelId: string;
+}
+
+/** What reporting needs: the members' settings, the party service, the moderators, the log. */
+export type MaxReporting = Pick<AppContext, 'users' | 'partyService' | 'reports' | 'log'>;
+
+/** What came of a report, and the reporter's automatic status, which the answer names. */
+export interface MaxReportResult {
+  outcome: MaxReportOutcome;
+  autoStatus: PartyStatus;
+}
+
+/**
+ * Reports the battle as the member (anonymous when their privacy says so, signed up by their
+ * automatic status) in the server `serverId` (a snowflake). A new battle at a pin is said in the
+ * log for staff (Q7: "a sign to us we need to re-scrape") and told to the moderators once its
+ * post is made (G1). `mayJoin` is asked once the report would join the battle at the spot.
+ */
+export async function reportMaxAs(
+  ctx: MaxReporting,
+  member: Member,
+  serverId: string,
+  request: MaxReportRequest,
+  mayJoin: (forumId: string) => Promise<boolean>,
+): Promise<MaxReportResult> {
+  const { id, ...reporter } = member;
+  const settings = await ctx.users.get(id);
+  const outcome = await ctx.partyService.reportMax({
+    spot: request.spot,
+    reporterId: id,
+    reporter,
+    anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
+    autoStatus: settings.autoStatus,
+    tier: request.boss.tier,
+    boss: request.boss.boss,
+    endTime: request.end,
+    regionChannelId: request.regionChannelId,
+    mayJoin,
+  });
+  if (outcome.kind === 'created' && request.spot.kind === 'pin') {
+    ctx.log.info(
+      {
+        party: outcome.party.id,
+        reporter: id,
+        server: serverId,
+        lat: request.spot.lat,
+        lon: request.spot.lon,
+        boss: request.boss.label,
+      },
+      'a max battle was reported at an unlisted power spot',
+    );
+    // The moderators hear of it on the side (G1): the post is made already.
+    const postId = outcome.party.forumPostId;
+    if (postId !== null) {
+      ctx.reports.maxAtPin({
+        serverId,
+        partyId: outcome.party.id,
+        postId,
+        boss: request.boss.label,
+        reporter: { id, name: reporter.name },
+        regionChannelId: request.regionChannelId,
+        pin: request.spot,
+      });
+    }
+  }
+  return { outcome, autoStatus: settings.autoStatus };
+}
+
+/**
+ * What the check of a report's forums needs: where a new battle would go (`regionForSpot`), and
+ * how a member stands to a forum (on Discord through the party service, on the map through the
+ * parties' own deps).
+ */
+export interface MaxAccess {
+  partyService: Pick<PartyService, 'regionForSpot'>;
+  memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined>;
+}
+
+/**
+ * Whether a report at this spot would put the member in a forum somebody keeps them out of, as
+ * `/raid` asks it (`reportBarred`): the forum a new battle would go to, and that of the battle at
+ * the spot (`joins`). Rejects while Discord cannot say.
+ */
+export async function maxBarred(
+  access: MaxAccess,
+  ask: { spot: MaxSpot; regionChannelId: string; joins: MaxParty | undefined },
+  memberId: string,
+): Promise<boolean> {
+  const forum = access.partyService.regionForSpot(ask.spot, ask.regionChannelId).region
+    ?.forumChannelId;
+  const there = ask.joins?.forumChannelId;
+  for (const forumId of new Set([forum, there])) {
+    if (forumId && (await access.memberAccess(forumId, memberId)) === 'barred') return true;
+  }
+  return false;
+}
+
+/**
+ * Whether a member blocked from meetups (`MeetupSafety.blocked`: never staff, nobody while the
+ * safety is off) asks for a new battle at a pin, a place nobody checked (Matt, 2026-10-21, final
+ * review G1): refused then (`MAX_PIN_BLOCKED`). Ask it only for a new battle: joining the battle
+ * there is allowed (fix review 4). A member appeals the block with `/meetup`, as for meetups.
+ */
+export async function blockedAtPin(
+  ctx: Pick<AppContext, 'meetupSafety'>,
+  serverId: string,
+  memberId: string,
+  staff: boolean,
+  spot: MaxSpot,
+): Promise<boolean> {
+  if (spot.kind !== 'pin') return false;
+  return ctx.meetupSafety.blocked(serverId, memberId, staff);
+}
+
+/** Whether a battle at the spot is one of another boss than the report's (design Q3). */
+export function otherBoss(there: MaxParty, boss: ReadMaxBoss): boolean {
+  return !sameBoss(there.max.boss, boss.boss) || there.max.tier !== boss.tier;
+}
+
+/** `at Gazebo of the Park`, `at an unlisted power spot`: where a battle is, in a sentence. */
+function atSpot(spot: MaxSpot): string {
+  return spot.kind === 'pin' ? 'at an unlisted power spot' : `at ${plain(maxSpotName(spot))}`;
+}
+
+/**
+ * `There is already a max battle against Dynamax Sneasel (1★) at <spot>: <#post>. …` (design
+ * 3.1), with the hint of `/boss` only where it could make the battle the one reported: never
+ * between Dynamax and Gigantamax (`reported`: the tier of the report), in the caller's words
+ * (`names.bossHint`). The post as `names` names it: on the map not at all.
+ */
+export function takenWords(
+  ctx: Pick<AppContext, 'partyService'>,
+  party: MaxParty,
+  reported: MaxTier,
+  names: MaxNames = DISCORD_MAX_NAMES,
+): string {
+  const name = ctx.partyService.maxView(party).boss.name;
+  const title = maxBossTitle(name, party.max.tier);
+  const named = party.forumPostId === null ? undefined : names.post(party.forumPostId);
+  const post =
+    party.forumPostId === null
+      ? ': its post is being made'
+      : named === undefined
+        ? ''
+        : `: ${named}`;
+  const hint = battleKindOf(reported) === battleKindOf(party.max.tier) ? names.bossHint : '';
+  return `There is already a max battle against ${plain(title)} ${atSpot(party.max.spot)}${post}.${hint}`;
+}
+
+/**
+ * How an answer of a report names a post and a region channel (`ReportNames`), and says what
+ * `/max` says in words of Discord's (`ended`: "use `/max` again"; `bossHint`, after another
+ * boss's battle is named: "`/boss` there changes its boss.", with its space before it): on
+ * Discord as `/max` says it (`DISCORD_MAX_NAMES`), on the map in the map's words (plan 8X-5).
+ */
+export interface MaxNames extends ReportNames {
+  ended: string;
+  bossHint: string;
+}
+
+/** `/max`'s own names and words: mentions, `MAX_ENDED` and the hint of `/boss` in the post. */
+export const DISCORD_MAX_NAMES: MaxNames = {
+  ...DISCORD_NAMES,
+  ended: MAX_ENDED,
+  bossHint: ' `/boss` there changes its boss.',
+};
+
+const STATUS_WORDS: Partial<Record<PartyStatus, string>> = {
+  [PartyStatus.Interested]: 'interested',
+  [PartyStatus.Coming]: 'coming',
+  [PartyStatus.Present]: 'here',
+};
+
+/**
+ * What `/max` tells the member came of a report; a post and a region's channel as `names` names
+ * them (mentions on Discord; on the map no post and a channel by its name), and a battle that
+ * ended twice while the report waited in its words (`names.ended`).
+ */
+export function maxReportWords(
+  ctx: Pick<AppContext, 'partyService'>,
+  outcome: MaxReportOutcome,
+  ask: Pick<MaxReportRequest, 'boss' | 'spot' | 'end'>,
+  autoStatus: PartyStatus,
+  names: MaxNames = DISCORD_MAX_NAMES,
+): string {
+  const at = atSpot(ask.spot);
+  const post = (party: MaxParty, missing: string): string => {
+    const named = party.forumPostId === null ? undefined : names.post(party.forumPostId);
+    if (named !== undefined) return ` Its post is ${named}.`;
+    return party.forumPostId === null ? missing : '';
+  };
+  const beingMade = ' It is being set up right now.';
+  switch (outcome.kind) {
+    case 'created':
+      return (
+        `Reported: ${ask.boss.label} ${at}, until ${timestamp(ask.end)}.` +
+        post(outcome.party, beingMade)
+      );
+    case 'exists': {
+      const status = STATUS_WORDS[autoStatus];
+      const marked = outcome.joined && status ? ` You have been marked as ${status}.` : '';
+      return `There is already a max battle against it ${at}.${post(outcome.party, beingMade)}${marked}`;
+    }
+    case 'taken':
+      return takenWords(ctx, outcome.party, ask.boss.tier, names);
+    case 'no-region':
+      return (
+        `${ask.spot.kind === 'pin' ? 'That unlisted power spot' : plain(maxSpotName(ask.spot))} ` +
+        'is not in any region of this server, so I have nowhere to post the battle.'
+      );
+    case 'no-forum':
+      return (
+        `The region ${names.channel(outcome.region.channelId)} has no raid forum yet. ` +
+        'A moderator can create it with `/admin setup-forums`.'
+      );
+    case 'no-post':
+      return noPostWords(outcome.refused, (id) => names.channel(id));
+    case 'barred':
+      return MAX_BARRED;
+    case 'ended':
+      return names.ended;
+  }
+}
diff --git a/src/commands/max/max.test.ts b/src/commands/max/max.test.ts
index 9572ed36d930a5604546be0ba7114d4accf2eaf9..1eb8553d2fbc287d7c4436d3a32f793b96b80ca1 100644
--- a/src/commands/max/max.test.ts
+++ b/src/commands/max/max.test.ts
@@ -37,7 +37,8 @@ import { parseBigEventFeed, parseMaxEventFeed } from '../../domain/time/max-even
 import { maxPinControls } from '../../components/max-pin.js';
 import { closeControls } from '../parties/delete.js';
 import { end } from '../raids/change.js';
-import { MAX_BARRED, MAX_ENDED, MAX_PIN_BLOCKED, max, maxControls, maxReportWords } from './max.js';
+import { max, maxControls } from './max.js';
+import { MAX_BARRED, MAX_ENDED, MAX_PIN_BLOCKED, maxReportWords } from './max-report.js';
 
 /** Thursday 2026-10-22, 14:00: an ordinary day, after the max feed was read (10-20). */
 const THURSDAY = at('2026-10-22T14:00');
diff --git a/src/commands/max/max.ts b/src/commands/max/max.ts
index 194778489c503828cf12d27efe05948d1b92a722..0581527274677acab4c1b9d08f55a6fddbadda8a 100644
--- a/src/commands/max/max.ts
+++ b/src/commands/max/max.ts
@@ -17,13 +17,8 @@ import {
 } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
-import type { Throttle } from '../../discord/throttle.js';
-import { maxSpotName } from '../../domain/party/max.js';
-import { sameBoss, type MaxParty, type MaxSpot } from '../../domain/party/party.js';
-import { battleKindOf, maxBossTitle, type MaxTier } from '../../domain/pogo/max-tier.js';
-import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
+import type { MaxParty, MaxSpot } from '../../domain/party/party.js';
 import { endsSoon, nextRotationEnd } from '../../domain/time/max-end.js';
-import { noPostWords } from '../../render/activity.js';
 import {
   ENDING_SOON,
   endingSoonDialog,
@@ -31,9 +26,7 @@ import {
   MAX_KIND,
   NEXT_ROTATION,
 } from '../../render/max-dialog.js';
-import { plain, timestamp } from '../../render/text.js';
 import type { Member } from '../../services/attendance-service.js';
-import type { MaxReportOutcome } from '../../services/party-service.js';
 import { PendingRequests } from '../../services/pending-requests.js';
 import {
   isPinText,
@@ -45,6 +38,19 @@ import {
   TIER_CHOICES,
   type ReadMaxBoss,
 } from './max-input.js';
+import {
+  blockedAtPin,
+  MAX_BARRED,
+  MAX_COMMAND,
+  MAX_PIN_BLOCKED,
+  MAX_THROTTLE,
+  maxBarred,
+  maxReportWords,
+  otherBoss,
+  reportMaxAs,
+  takenWords,
+  type MaxAccess,
+} from './max-report.js';
 import { nearChoices } from '../place-option.js';
 
 /*
@@ -55,30 +61,6 @@ import { nearChoices } from '../place-option.js';
  * (Matt, 2026-10-21), whose Submit reports it; joining the battle at the spot asks nothing.
  */
 
-/** The name `/max` is used and counted under. */
-export const MAX_COMMAND = 'max';
-
-/** How often one member may report a max battle: as raids (`RAID_THROTTLE`). */
-export const MAX_THROTTLE: Throttle = { uses: 20, perSeconds: 900 };
-
-/** What `/max` is refused when the report would put the member in a forum barred to them. */
-export const MAX_BARRED =
-  'You cannot report a max battle at this spot: you are kept out of the forum its battle would be in.';
-
-/**
- * What `/max` says when the battle a report would join ended while it waited, and the one after
- * it too (fix review F2): nothing was done.
- */
-/**
- * What `/max` says to a member blocked from meetups (meetup safety's block) who reports at a pin
- * (Matt, 2026-10-21, final review G1): a known power spot is still theirs to report.
- */
-export const MAX_PIN_BLOCKED =
-  'You are blocked from making meetups in this server, so you cannot report a max battle at an ' +
-  'unlisted power spot. Pick a power spot from the list.';
-
-export const MAX_ENDED = 'The max battle there has just ended: use `/max` again.';
-
 /** A report as its guard read it: what, where, until when, made where. */
 export interface MaxAsk {
   boss: ReadMaxBoss;
@@ -108,71 +90,31 @@ const asked = new WeakMap<ChatInputCommandInteraction, MaxAsk>();
 /** The reports that wait for the ending-soon dialog's Submit. */
 const pending = new PendingRequests<MaxAsk>();
 
-/** `at Gazebo of the Park`, `at an unlisted power spot`: where a battle is, in a sentence. */
-function atSpot(spot: MaxSpot): string {
-  return spot.kind === 'pin' ? 'at an unlisted power spot' : `at ${plain(maxSpotName(spot))}`;
-}
-
-/**
- * `There is already a max battle against Dynamax Sneasel (1★) at <spot>: <#post>. …` (design
- * 3.1), with the hint of `/boss` only where it could make the battle the one reported: never
- * between Dynamax and Gigantamax (`reported`: the tier of the report).
- */
-export function takenWords(ctx: AppContext, party: MaxParty, reported: MaxTier): string {
-  const name = ctx.partyService.maxView(party).boss.name;
-  const title = maxBossTitle(name, party.max.tier);
-  const post = party.forumPostId === null ? 'its post is being made' : `<#${party.forumPostId}>`;
-  const hint =
-    battleKindOf(reported) === battleKindOf(party.max.tier)
-      ? ' `/boss` there changes its boss.'
-      : '';
-  return (
-    `There is already a max battle against ${plain(title)} ${atSpot(party.max.spot)}: ` +
-    `${post}.${hint}`
-  );
-}
-
 /** The battle that holds the spot now in the member's server (`PartyStore.maxAt`). */
 function battleThere(ctx: AppContext, ask: Pick<MaxAsk, 'guild' | 'spot'>, now: number) {
   return ask.guild === undefined ? undefined : ctx.parties.maxAt(ask.guild, ask.spot, now);
 }
 
-/** Whether a battle there is one of another boss than the report's (design Q3). */
-function otherBoss(there: MaxParty, boss: ReadMaxBoss): boolean {
-  return !sameBoss(there.max.boss, boss.boss) || there.max.tier !== boss.tier;
-}
-
-/**
- * Whether a report at this spot would put the member in a forum somebody keeps them out of, as
- * `/raid` asks it (`reportBarred`): the forum a new battle would go to, and that of the battle at
- * the spot. Rejects while Discord cannot say.
- */
-async function maxBarred(ctx: AppContext, ask: MaxAsk, memberId: string): Promise<boolean> {
-  const forum = ctx.partyService.regionForSpot(ask.spot, ask.regionChannelId).region
-    ?.forumChannelId;
-  const there = ask.joins?.forumChannelId;
-  for (const forumId of new Set([forum, there])) {
-    if (forumId && (await ctx.partyService.memberAccess(forumId, memberId)) === 'barred') {
-      return true;
-    }
-  }
-  return false;
+/** `MaxAccess` on Discord: how a member stands to a forum, through the party service. */
+function accessOf(ctx: AppContext): MaxAccess {
+  return {
+    partyService: ctx.partyService,
+    memberAccess: (forumId, memberId) => ctx.partyService.memberAccess(forumId, memberId),
+  };
 }
 
 /**
- * Refuses a member blocked from meetups (`MeetupSafety.blocked`: never staff, nobody while the
- * safety is off) a new battle at a pin, a place nobody checked (Matt, 2026-10-21, final review
- * G1); joining the battle there is allowed (fix review 4). No Appeal button: a member appeals the
- * block with `/meetup`, as for meetups.
+ * Refuses a member blocked from meetups a new battle at a pin (`blockedAtPin`); joining the
+ * battle there is allowed (fix review 4). No Appeal button: a member appeals the block with
+ * `/meetup`, as for meetups.
  */
 async function refuseBlockedAtPin(
   interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
   ctx: AppContext,
   spot: MaxSpot,
 ): Promise<void> {
-  if (spot.kind !== 'pin') return;
   const staff = isStaff(interaction, ctx);
-  if (await ctx.meetupSafety.blocked(guildIdOf(interaction), interaction.user.id, staff)) {
+  if (await blockedAtPin(ctx, guildIdOf(interaction), interaction.user.id, staff, spot)) {
     throw new UserError(MAX_PIN_BLOCKED);
   }
 }
@@ -211,59 +153,10 @@ const requireMaxReport: Guard = async (interaction, ctx) => {
     guild,
     asks: there === undefined && !typed && endsSoon(end, now),
   };
-  if (await maxBarred(ctx, ask, interaction.user.id)) throw new UserError(MAX_BARRED);
+  if (await maxBarred(accessOf(ctx), ask, interaction.user.id)) throw new UserError(MAX_BARRED);
   asked.set(interaction, ask);
 };
 
-const STATUS_WORDS: Partial<Record<PartyStatus, string>> = {
-  [PartyStatus.Interested]: 'interested',
-  [PartyStatus.Coming]: 'coming',
-  [PartyStatus.Present]: 'here',
-};
-
-/** What `/max` tells the member came of a report. */
-export function maxReportWords(
-  ctx: AppContext,
-  outcome: MaxReportOutcome,
-  ask: MaxAsk,
-  autoStatus: PartyStatus,
-): string {
-  const at = atSpot(ask.spot);
-  const post = (party: MaxParty): string =>
-    party.forumPostId === null
-      ? ' It is being set up right now.'
-      : ` Its post is <#${party.forumPostId}>.`;
-  switch (outcome.kind) {
-    case 'created':
-      return (
-        `Reported: ${ask.boss.label} ${at}, until ${timestamp(ask.end)}.` + post(outcome.party)
-      );
-    case 'exists': {
-      const status = STATUS_WORDS[autoStatus];
-      const marked = outcome.joined && status ? ` You have been marked as ${status}.` : '';
-      return `There is already a max battle against it ${at}.${post(outcome.party)}${marked}`;
-    }
-    case 'taken':
-      return takenWords(ctx, outcome.party, ask.boss.tier);
-    case 'no-region':
-      return (
-        `${ask.spot.kind === 'pin' ? 'That unlisted power spot' : plain(maxSpotName(ask.spot))} ` +
-        'is not in any region of this server, so I have nowhere to post the battle.'
-      );
-    case 'no-forum':
-      return (
-        `The region <#${outcome.region.channelId}> has no raid forum yet. ` +
-        'A moderator can create it with `/admin setup-forums`.'
-      );
-    case 'no-post':
-      return noPostWords(outcome.refused, (id) => `<#${id}>`);
-    case 'barred':
-      return MAX_BARRED;
-    case 'ended':
-      return MAX_ENDED;
-  }
-}
-
 /**
  * Reports the battle as the member (anonymous when their privacy says so, signed up by their
  * automatic status) and answers with what came of it (`editReply`: the interaction is
@@ -277,48 +170,14 @@ async function report(
   ask: MaxAsk,
 ): Promise<void> {
   const member: Member = { id: interaction.user.id, ...memberInfo(interaction) };
-  const { id, ...reporter } = member;
-  const settings = await ctx.users.get(id);
-  const outcome = await ctx.partyService.reportMax({
-    spot: ask.spot,
-    reporterId: id,
-    reporter,
-    anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
-    autoStatus: settings.autoStatus,
-    tier: ask.boss.tier,
-    boss: ask.boss.boss,
-    endTime: ask.end,
-    regionChannelId: ask.regionChannelId,
-    mayJoin: async (forumId) => (await ctx.partyService.memberAccess(forumId, id)) !== 'barred',
-  });
-  if (outcome.kind === 'created' && ask.spot.kind === 'pin') {
-    const serverId = guildIdOf(interaction);
-    ctx.log.info(
-      {
-        party: outcome.party.id,
-        reporter: id,
-        server: serverId,
-        lat: ask.spot.lat,
-        lon: ask.spot.lon,
-        boss: ask.boss.label,
-      },
-      'a max battle was reported at an unlisted power spot',
-    );
-    // The moderators hear of it on the side (G1): the post is made already.
-    const postId = outcome.party.forumPostId;
-    if (postId !== null) {
-      ctx.reports.maxAtPin({
-        serverId,
-        partyId: outcome.party.id,
-        postId,
-        boss: ask.boss.label,
-        reporter: { id, name: reporter.name },
-        regionChannelId: ask.regionChannelId,
-        pin: ask.spot,
-      });
-    }
-  }
-  const content = maxReportWords(ctx, outcome, ask, settings.autoStatus);
+  const { outcome, autoStatus } = await reportMaxAs(
+    ctx,
+    member,
+    guildIdOf(interaction),
+    ask,
+    async (forumId) => (await ctx.partyService.memberAccess(forumId, member.id)) !== 'barred',
+  );
+  const content = maxReportWords(ctx, outcome, ask, autoStatus);
   await interaction.editReply({ content });
   // Neither is the member's doing: the use goes back.
   if (outcome.kind === 'no-post' || outcome.kind === 'ended') {
@@ -458,7 +317,8 @@ export const maxControls: ComponentHandler = {
     // A block that came while the dialog was open (G1), unless the report now joins a battle.
     if (there === undefined) await refuseBlockedAtPin(interaction, ctx, ask.spot);
     const decided: MaxAsk = { ...ask, end, joins: there };
-    if (await maxBarred(ctx, decided, interaction.user.id)) throw new UserError(MAX_BARRED);
+    if (await maxBarred(accessOf(ctx), decided, interaction.user.id))
+      throw new UserError(MAX_BARRED);
     await report(interaction, ctx, decided);
   },
 };
diff --git a/src/render/max-dialog.ts b/src/render/max-dialog.ts
index 1f9b4f817ab89563eb7dc4ff523f01aa0f6b2ccc..ce3ddd94b22a1dc9c21be7ade13ce2c62f510b1d 100644
--- a/src/render/max-dialog.ts
+++ b/src/render/max-dialog.ts
@@ -22,6 +22,47 @@ function inMinutes(end: number, now: number): string {
   return `in ${count(Math.max(1, Math.round((end - now) / 60_000)), 'minute')}`;
 }
 
+/** A choice of the ending-soon question: its value, its words, and the end it reports. */
+export interface EndingSoonChoice {
+  value: typeof NEXT_ROTATION | typeof ENDING_SOON;
+  label: string;
+  end: number;
+}
+
+/**
+ * The ending-soon question as words, for the dialog and the live map (plan 8X-5): the question,
+ * and its choices: with `next`, until the next rotation ("Until the next rotation, 3:00 PM",
+ * first) or until the end about to pass ("Until 2:30 PM (in 1 minute)"); without, only the end
+ * about to pass, and the question whether to report it anyway.
+ */
+export function endingSoonQuestion(input: {
+  end: number;
+  next: number | undefined;
+  now: number;
+  zone: string;
+}): { text: string; choices: EndingSoonChoice[] } {
+  const { end, next, now, zone } = input;
+  const at = clockText(end, zone);
+  const question = `This max battle ends at ${at}, ${inMinutes(end, now)}.`;
+  const soon: EndingSoonChoice = {
+    value: ENDING_SOON,
+    label: `Until ${at} (${inMinutes(end, now)})`,
+    end,
+  };
+  if (next === undefined) return { text: `${question} Report it anyway?`, choices: [soon] };
+  return {
+    text: `${question} Report it until the next rotation?`,
+    choices: [
+      {
+        value: NEXT_ROTATION,
+        label: `Until the next rotation, ${clockText(next, zone)}`,
+        end: next,
+      },
+      soon,
+    ],
+  };
+}
+
 /**
  * The dialog asked before a max battle that ends soon is reported (`customId` carries the
  * report): with `next`, a choice of that end ("Until the next rotation, 3:00 PM", first and
@@ -34,28 +75,24 @@ export function endingSoonDialog(input: {
   now: number;
   zone: string;
 }): APIModalInteractionResponseCallbackData {
-  const { customId, end, next, now, zone } = input;
-  const at = clockText(end, zone);
-  const question = `This max battle ends at ${at}, ${inMinutes(end, now)}.`;
+  const { customId, next } = input;
+  const asked = endingSoonQuestion(input);
   if (next === undefined) {
     return dialog({
       customId,
       title: 'Report a max battle',
-      text: `${question} Report it anyway?\n\nSubmit reports it.`,
+      text: `${asked.text}\n\nSubmit reports it.`,
     });
   }
   return dialog({
     customId,
     title: 'Report a max battle',
-    text: `${question} Report it until the next rotation?`,
+    text: asked.text,
     choice: {
       id: MAX_END_INPUT,
       label: 'Until when?',
       picked: NEXT_ROTATION,
-      options: [
-        { value: NEXT_ROTATION, label: `Until the next rotation, ${clockText(next, zone)}` },
-        { value: ENDING_SOON, label: `Until ${at} (${inMinutes(end, now)})` },
-      ],
+      options: asked.choices.map(({ value, label }) => ({ value, label })),
     },
   });
 }
diff --git a/test/support/max-reporting.ts b/test/support/max-reporting.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8747abb87e45f1f1f6643d4a3fa667361baa2f5c
--- /dev/null
+++ b/test/support/max-reporting.ts
@@ -0,0 +1,70 @@
+import type { WayspotRow } from '../../src/domain/wayspots/kept.js';
+import { parseBigEventFeed, parseMaxEventFeed } from '../../src/domain/time/max-events.js';
+import { at, TEST_SPOT } from './parties.js';
+import { MAX_ZONE } from './max-bosses.js';
+import { maxBossServiceWith } from './max-boss-service.js';
+import { readMaxEventFeed } from './max-events.js';
+import type { SafetyOptions } from './meetup-safety-service.js';
+import { raidEventsFixture } from './raid-events.js';
+import { reportsWith } from './reports-service.js';
+import { createTestContext } from './test-context.js';
+import { MemoryUsers } from './users.js';
+import { keptRow } from './wayspot-cases.js';
+import { wayspotsWith } from './wayspots.js';
+
+/** Thursday 2026-10-22, 14:00: an ordinary day, after the max feed was read (10-20). */
+export const MAX_THURSDAY = at('2026-10-22T14:00');
+
+/** The power spot of `TEST_SPOT`, kept as the Wayfarer import keeps it. */
+export const SPOT_ROW = keptRow(1, {
+  id: TEST_SPOT.id,
+  kind: 'powerspot',
+  title: 'Gazebo of the Park',
+  lat: TEST_SPOT.lat,
+  lon: TEST_SPOT.lon,
+  address: '1 Park Lane, Pinewood, PA 15000, USA',
+  image: null,
+});
+
+/**
+ * Reporting max battles over the services, as `/max` and the map do (plan 8X-5): the reports'
+ * services (`reportsWith`, without the moderators' channel unless `safety` names it), the max
+ * bosses of the recorded feed, the recorded max and big events, the kept power spot `SPOT_ROW`
+ * (and `rows` beside it), the members' settings of `made.userSettings`, in a context
+ * (`createTestContext`) whose place search is built. The services read `Date.now()`: fake `Date`
+ * to the day of the test (`MAX_THURSDAY`) before calling it.
+ */
+export async function maxReportingWith(
+  safety: SafetyOptions = { moderation: null },
+  rows: readonly WayspotRow[] = [],
+) {
+  const made = await reportsWith(safety);
+  // The services read the faked Date, as the bot's read the clock (a battle is made when reported).
+  Object.defineProperty(made.clock, 'now', { get: () => Date.now() });
+  const bosses = await maxBossServiceWith();
+  await bosses.service.sync();
+  // The service's clock is the test's (Date is faked to the day of each test).
+  bosses.state.now = Date.now();
+  const { wayspots } = await wayspotsWith([SPOT_ROW, ...rows]);
+  const feed = readMaxEventFeed();
+  const { ctx, entries } = createTestContext({
+    partyService: made.service,
+    parties: made.store,
+    regions: made.regions,
+    attendance: made.attendance,
+    maxBosses: bosses.service,
+    maxBossAdmin: bosses.service,
+    raidEvents: raidEventsFixture(MAX_ZONE, {
+      max: parseMaxEventFeed(feed, MAX_ZONE).events,
+      big: parseBigEventFeed(feed, MAX_ZONE),
+    }),
+    wayspots,
+    users: new MemoryUsers(made.userSettings),
+    maxBattles: made.maxes,
+    meetupSafety: made.safety,
+    reports: made.reports,
+  });
+  await ctx.placeFinder.built();
+  // `entries` is the context's log; `logged` the services' (the reports' among them).
+  return { ...made, ctx, entries, logged: made.entries, bosses };
+}
````

### Task 2: 8X-5 task 2: max battles and the Remote switch in the map's data

Prototype commit: `2c277ca9c2be74b7672ca7f3c3e88ae6c16f7664`

GET /api/parties gives max battles in a list of their own, PartiesView.maxes (a page
made before them reads raids, trains and meetups and goes on as it was): MapMax with
MapRaid's names wherever they mean the same (picture, tier in words, boss, end, link,
place, attendance), its spot's Wayfarer id (null for an unlisted power spot), the tier's
code and the post's heading; Done always offered; none once its end has come. How the
post shows the boss and the spot comes from the renderer (maxLook over
PartyService.maxView and spotNow), given to the pure view as PartyViewInput.maxLook and
threaded through every route that draws a party, as look is for raids.

Every party's attendance says the member's Remote switch (remote: { offered, on }):
offered where the post offers Remote (every party but an elite raid), never while
read-only; nobody else's is said. The page's test fixtures gain the field.

**Files:**

```
 src/app.ts                               |  3 ++
 src/domain/web/party-data.ts             | 57 ++++++++++++++++++++++++++++++-
 src/domain/web/party-view.test.ts        | 95 ++++++++++++++++++++++++++++++++++++++++++++++++----
 src/domain/web/party-view.ts             | 75 ++++++++++++++++++++++++++++++++---------
 src/domain/web/picture.ts                | 17 ++++++++++
 src/render/max-post.test.ts              | 35 ++++++++++++++++++-
 src/render/max-post.ts                   | 21 ++++++++++++
 src/web/client/meetup-forms.test.ts      |  2 +-
 src/web/client/parties.test.ts           | 18 ++++++++++
 src/web/client/raid-forms.test.ts        |  1 +
 src/web/client/train-forms.test.ts       |  1 +
 src/web/client/train-ui.isolated.test.ts |  1 +
 src/web/meetup-routes.ts                 |  1 +
 src/web/parties.test.ts                  | 26 ++++++++++++--
 src/web/party-routes.ts                  | 21 ++++++++++--
 src/web/raid-routes.ts                   |  1 +
 src/web/train-routes.ts                  |  1 +
 test/support/web.ts                      |  9 +++--
 18 files changed, 353 insertions(+), 32 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/render/max-post.test.ts src/web/client/meetup-forms.test.ts src/web/client/parties.test.ts src/web/client/raid-forms.test.ts src/web/client/train-forms.test.ts src/web/client/train-ui.isolated.test.ts src/web/parties.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 2c277ca9c2be74b7672ca7f3c3e88ae6c16f7664 -- src/app.ts src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/domain/web/picture.ts src/render/max-post.test.ts src/render/max-post.ts src/web/client/meetup-forms.test.ts src/web/client/parties.test.ts src/web/client/raid-forms.test.ts src/web/client/train-forms.test.ts src/web/client/train-ui.isolated.test.ts src/web/meetup-routes.ts src/web/parties.test.ts src/web/party-routes.ts src/web/raid-routes.ts src/web/train-routes.ts test/support/web.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-5 task 2: max battles and the Remote switch in the map's data`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index fdc7247046934387d7a94b4d36b78cc60b5ad87c..4a3ffdbf99d95e689fc5be05768e03684f8f562d 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -117,6 +117,7 @@ import { healthFiles } from './ops/health.js';
 import { gatewayConnected, Heartbeat } from './ops/heartbeat.js';
 import { startCheckpoint } from './ops/start-stop.js';
 import { createShutdown } from './shutdown.js';
+import { maxLook } from './render/max-post.js';
 import { raidLook } from './render/raid-post.js';
 import { pictureOrigins } from './web/headers.js';
 import { buildWebServer } from './web/server.js';
@@ -950,6 +951,8 @@ export async function startApp(
         guilds,
         store: parties,
         look: (raid) => raidLook(partyService.view(raid)),
+        // How a max battle's post shows it (plan 8X-5): its boss, picture and spot as they are now.
+        maxLook: (party) => maxLook(partyService.maxView(party)),
         // A power spot of a train's route (plan 8X-4), as the kept Wayspots have it now.
         spotOf: (id) => {
           const kept = wayspots.byId(id);
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index f73e07bdb9df118f4d126f5bff13fc2e26d5ea7d..c5ac9eede79ae118bf8545e373651e40d21f43b8 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -45,6 +45,19 @@ export interface MapAttendance {
    * where nothing is asked.
    */
   pick?: MapGroupChoice[];
+  /**
+   * The post's Remote switch (plan 8X-5): whether the member takes part remotely (`on`; false
+   * while not signed up), and whether they may switch it on the map (`offered`: where the post
+   * offers Remote, `remoteAllowed`, every party but an elite raid; never while read-only). It is
+   * pressed apart from `actions` (`MAP_REMOTE`).
+   */
+  remote: MapRemote;
+}
+
+/** The Remote switch of a party on the map (`MapAttendance.remote`). */
+export interface MapRemote {
+  offered: boolean;
+  on: boolean;
 }
 
 /** A choice of the popup's question "which group?": a group's letter, none for any with room. */
@@ -218,8 +231,45 @@ export interface MapMeetupPlace {
   gymId: number | null;
 }
 
+/** The tiers of max battles, as `MaxTier` spells them: Dynamax 1 to 5 stars, Gigantamax. */
+export type MapMaxTier = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'G';
+
+/**
+ * A max battle (plan 8X-5; design 7), shown as a raid is: its fields have `MapRaid`'s names
+ * wherever they mean the same, so that one component of a page can draw both. It is at a power
+ * spot (`spotId`, as `/api/powerspots` lists it) or at a pin, an "Unlisted power spot" (`spotId`
+ * null). It has no egg and no hatch, and nothing of it is changed on the map.
+ */
+export interface MapMax {
+  kind: 'max';
+  id: string;
+  /** The power spot's Wayfarer id; null for an unlisted power spot (a pin). */
+  spotId: string | null;
+  /** The post's picture (the boss), only from the hosts the page may load. */
+  picture: string | null;
+  /** The tier: `D1` to `D5`, `G`. */
+  level: MapMaxTier;
+  /** The tier in the posts' words: `Dynamax 2★`, `Gigantamax`. */
+  tier: string;
+  /** The boss the post names: `Machamp`. */
+  boss: string;
+  /** What the battle is, as its post heads it: `Dynamax Machamp (2★)`, `Gigantamax Machamp`. */
+  title: string;
+  /** Epoch milliseconds: a max battle always has an end. */
+  endTime: number;
+  /** The post on Discord (`https://discord.com/channels/…`, which opens the app). */
+  link: string;
+  /**
+   * Where it is, as its post's Where names it: the power spot as it is now while it is the same
+   * place, else as it was named; a pin as `Unlisted power spot` with no address. Six decimals.
+   */
+  place: MapRaidPlace;
+  /** Its attendance; Done is always offered (a max battle is on from the start). */
+  attendance: MapAttendance;
+}
+
 /** A party of any kind, as the map shows it. */
-export type MapParty = MapRaid | MapTrain | MapMeetup;
+export type MapParty = MapRaid | MapMax | MapTrain | MapMeetup;
 
 /** The active parties of a server a member may see, in the order they were made. */
 export interface PartiesView {
@@ -228,6 +278,11 @@ export interface PartiesView {
   /** Discord cannot be reached: nothing can be pressed (spec 2.5). */
   readOnly: boolean;
   raids: MapRaid[];
+  /**
+   * The max battles (plan 8X-5), in the order they were made: a list of their own, so that a page
+   * made before them, which reads `raids`, `trains` and `meetups`, goes on as it was.
+   */
+  maxes: MapMax[];
   trains: MapTrain[];
   meetups: MapMeetup[];
 }
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 213bda7b7f12995886cada6ed1538be9df4df3ca..b159787bee602380a69f53186daca5d23726a1da 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -10,6 +10,8 @@ import {
   PARTY_ZONE,
   REPORTER,
   testMax,
+  TEST_PIN,
+  TEST_SPOT,
   testMeetup,
   testRaid,
   testRaidRules,
@@ -34,6 +36,15 @@ const GUILD = '412345678901234567';
 const EGG_PICTURE = 'https://raw.githubusercontent.com/PokeMiners/raid_egg_2_icon.png';
 const BOSS_PICTURE = 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png';
 const ORIGINS = ['https://cdn.leekduck.com', 'https://raw.githubusercontent.com'];
+const MACHAMP_PICTURE = 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm68.icon.png';
+
+/** How the renderer shows `testMax()` (`maxLook`): the boss's picture, its name, the spot. */
+const MAX_LOOK = () => ({
+  picture: MACHAMP_PICTURE,
+  boss: 'Machamp',
+  place: { name: 'Gazebo of the Park', lat: 40.0005, lon: -80.0005, address: '1 Park Lane' },
+  spotId: TEST_SPOT.id,
+});
 
 /** A party with its post in a forum. */
 function posted<P extends Party>(party: P, forum = WEST_FORUM, post = '700000000000000001'): P {
@@ -87,6 +98,7 @@ describe('partyView', () => {
           groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
           mine: null,
           actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
+          remote: { offered: true, on: false },
         },
       },
     ]);
@@ -185,15 +197,82 @@ describe('partyView', () => {
     expect(mayChangeRaid(egg, ALICE, true)).toBe(true);
   });
 
-  // Final review, G6: max battles are drawn on the map from plan 8X-5 (design 7).
-  it('leaves a max battle out of the view, and keeps the others', () => {
+  // Plan 8X-5 (design 7): a max battle is drawn at its spot, as a raid at its gym.
+  it('shows a max battle at its spot, with its boss, tier, end, post and buttons, Done among them', () => {
     const max = posted(testMax(), WEST_FORUM, '700000000000000009');
-    expect(mapParty(max, input([max]))).toBeNull();
-    const view = partyView(input([max, egg]));
+    const view = partyView(input([max, egg], { maxLook: MAX_LOOK }));
     expect(view.raids.map((raid) => raid.id)).toEqual([egg.id]);
+    expect(view.maxes).toEqual([
+      {
+        kind: 'max',
+        id: max.id,
+        spotId: TEST_SPOT.id,
+        picture: MACHAMP_PICTURE,
+        level: 'D2',
+        tier: 'Dynamax 2★',
+        boss: 'Machamp',
+        title: 'Dynamax Machamp (2★)',
+        endTime: at('2026-10-13T21:00'),
+        link: `https://discord.com/channels/${GUILD}/700000000000000009`,
+        place: { name: 'Gazebo of the Park', lat: 40.0005, lon: -80.0005, address: '1 Park Lane' },
+        attendance: {
+          groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
+          mine: null,
+          actions: [
+            { action: 'interested' },
+            { action: 'join' },
+            { action: 'here' },
+            { action: 'done' },
+          ],
+          remote: { offered: true, on: false },
+        },
+      },
+    ]);
     expect([...view.trains, ...view.meetups]).toEqual([]);
   });
 
+  it('shows a battle at a pin as an unlisted power spot, its place to six decimals', () => {
+    const max = posted(testMax({ spot: TEST_PIN }), WEST_FORUM, '700000000000000009');
+    const look = () => ({
+      boss: 'Machamp',
+      place: { name: 'Unlisted power spot', lat: 40.0020000004, lon: -80.002, address: null },
+      spotId: null,
+    });
+    const [shown] = partyView(input([max], { maxLook: look })).maxes;
+    expect(shown).toMatchObject({
+      spotId: null,
+      picture: null,
+      place: { name: 'Unlisted power spot', lat: 40.002, lon: -80.002, address: null },
+    });
+  });
+
+  it('leaves out a max battle once its end has come, and its picture from a host the page may not load', () => {
+    const max = posted(testMax(), WEST_FORUM, '700000000000000009');
+    const ended = input([max], { maxLook: MAX_LOOK, now: at('2026-10-13T21:00') });
+    expect(mapParty(max, ended)).toBeNull();
+    expect(partyView(ended).maxes).toEqual([]);
+    const evil = () => ({ ...MAX_LOOK(), picture: 'https://evil.example/x.png' });
+    expect(partyView(input([max], { maxLook: evil })).maxes[0]?.picture).toBeNull();
+  });
+
+  it('offers Remote where the post does, and says whether the member takes part remotely', () => {
+    const remote = withAttendees(egg, { [ALICE]: { status: PartyStatus.Coming, remote: true } });
+    expect(partyView(input([remote])).raids[0]?.attendance.remote).toEqual({
+      offered: true,
+      on: true,
+    });
+    expect(partyView(input([remote], { readOnly: true })).raids[0]?.attendance.remote).toEqual({
+      offered: false,
+      on: true,
+    });
+    // An elite raid is in person only: its post has no Remote either.
+    const elite = posted(testRaid({ tier: { level: 'Elite', shadow: false } }));
+    expect(partyView(input([elite])).raids[0]?.attendance.remote).toEqual({
+      offered: false,
+      on: false,
+    });
+  });
+
   it('leaves out a picture from a host the page may not load', () => {
     const view = partyView(
       input([egg], { look: () => ({ picture: 'https://evil.example/x.png', boss: 'Yveltal' }) }),
@@ -257,6 +336,7 @@ describe('partyView', () => {
           groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
           mine: null,
           actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
+          remote: { offered: true, on: false },
         },
         // The member is not signed up: nothing of the route is theirs to change.
         may: { arrange: false, clear: false, load: false },
@@ -276,6 +356,7 @@ describe('partyView', () => {
           groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
           mine: null,
           actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
+          remote: { offered: true, on: false },
         },
         // Made before 8D: no place; no information; not the member's to change.
         place: null,
@@ -361,7 +442,8 @@ describe('partyView', () => {
       WEST_FORUM,
       '700000000000000002',
     );
-    const text = JSON.stringify(partyView(input([anonymous, train], { memberId: CAROL })));
+    const view = partyView(input([anonymous, train], { memberId: CAROL }));
+    const text = JSON.stringify(view);
     for (const hidden of [
       REPORTER,
       ALICE,
@@ -370,13 +452,14 @@ describe('partyView', () => {
       'Alice',
       'Bob',
       'mystic',
-      'remote',
       'createdBy',
       'maker',
       'anonymous',
     ]) {
       expect(text).not.toContain(hidden);
     }
+    // Only the member's own Remote is said (plan 8X-5): Bob takes part remotely, Carol does not.
+    expect(view.raids[0]?.attendance.remote).toEqual({ offered: true, on: false });
   });
 
   it("leaves out other servers' parties, parties without a post, forums the member is barred from, and what is over", () => {
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index bb96541004c368adb4300eeca46ac04d50494143..b782401c6f58e5400bdca17776f6a2a27a80c059 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -1,11 +1,16 @@
+import { allowedPicture } from './picture.js';
 import { stopHandle, stopKey } from '../party/stops.js';
+import { maxEnded } from '../party/max.js';
 import {
   attendeeOf,
   newestFirst,
+  isMax,
   isRaid,
   isTimed,
   mayArrange,
+  remoteAllowed,
   type Attendee,
+  type MaxParty,
   type MeetupParty,
   type Party,
   type RaidParty,
@@ -25,6 +30,7 @@ import {
   targetOf,
   TRAIN_MOVES,
 } from '../party/train.js';
+import { maxBossTitle, maxTierLabel } from '../pogo/max-tier.js';
 import { raidWords } from '../pogo/raid-tier.js';
 import type {
   GroupCounts,
@@ -33,6 +39,7 @@ import type {
   MapMeetupPlace,
   MapParty,
   MapGroupChoice,
+  MapMax,
   MapPress,
   MapRaid,
   MapRaidPlace,
@@ -64,6 +71,19 @@ export interface RaidLook {
   place?: MapRaidPlace;
 }
 
+/**
+ * How a max battle's post looks (plan 8X-5; `maxLook` of the renderer): the boss's picture and
+ * name as the post shows them, and where it is as Where names it (the power spot as it is now
+ * while it is the same place, else as named; a pin as `Unlisted power spot`), with the spot's
+ * Wayfarer id (null for a pin).
+ */
+export interface MaxLook {
+  picture?: string;
+  boss: string;
+  place: MapRaidPlace;
+  spotId: string | null;
+}
+
 const round = (value: number): number => Math.round(value * 1e6) / 1e6;
 
 export interface PartyViewInput {
@@ -95,6 +115,11 @@ export interface PartyViewInput {
    */
   botStaff?: boolean;
   look(raid: RaidParty): RaidLook;
+  /**
+   * How a max battle's post looks (plan 8X-5). Left out: no max battle is shown (a caller that
+   * shows only another kind).
+   */
+  maxLook?: (party: MaxParty) => MaxLook;
   /**
    * A power spot Pine keeps, by its Wayfarer id (plan 8X-4: a stop of a train's route): its name
    * and place; undefined for one it does not keep. Left out: none is known.
@@ -126,16 +151,6 @@ function mapStatus(attendee: Attendee): MapStatus | undefined {
   }
 }
 
-/** A picture only from a host the page may load (the Content Security Policy's). */
-function allowedPicture(url: string | undefined, origins: readonly string[]): string | null {
-  if (url === undefined) return null;
-  try {
-    return origins.includes(new URL(url).origin) ? url : null;
-  } catch {
-    return null;
-  }
-}
-
 /**
  * The popup's question "which group?" (plan 8X-1B), asked as the post's dialog asks it: of a
  * member who is not signed up for a party of several groups, "Any group with room" first where
@@ -157,9 +172,9 @@ function groupPick(party: Party, input: PartyViewInput): MapGroupChoice[] | unde
 
 /**
  * The counts per group, the member's own standing, and the post's buttons, the same for one
- * group and several (plan 8X-1B): Interested, Join, Here; Done for a raid that has hatched;
- * Leave for a member who is signed up. None while read-only. A newcomer to several groups is
- * asked which (`groupPick`).
+ * group and several (plan 8X-1B): Interested, Join, Here; Done for a raid that has hatched and a
+ * max battle; Leave for a member who is signed up. None while read-only. A newcomer to several
+ * groups is asked which (`groupPick`). The Remote switch as the post has it (plan 8X-5).
  */
 function attendanceOf(party: Party, input: PartyViewInput, hatched: boolean): MapAttendance {
   const groups: GroupCounts[] = party.groups.map((group) => ({
@@ -188,7 +203,8 @@ function attendanceOf(party: Party, input: PartyViewInput, hatched: boolean): Ma
         ...(mine ? [{ action: 'leave' as const }] : []),
       ];
   const pick = groupPick(party, input);
-  return { groups, mine, actions, ...(pick === undefined ? {} : { pick }) };
+  const remote = { offered: !input.readOnly && remoteAllowed(party), on: own?.remote ?? false };
+  return { groups, mine, actions, ...(pick === undefined ? {} : { pick }), remote };
 }
 
 /**
@@ -221,7 +237,7 @@ function raidOf(party: RaidParty, link: string, input: PartyViewInput): MapRaid
     kind: 'raid',
     id: party.id,
     gymId: party.gymId,
-    picture: allowedPicture(look.picture, input.pictureOrigins),
+    picture: allowedPicture(look.picture, input.pictureOrigins) ?? null,
     tier: raidWords(party.raid.tier),
     boss: look.boss ?? null,
     stage,
@@ -236,6 +252,31 @@ function raidOf(party: RaidParty, link: string, input: PartyViewInput): MapRaid
   };
 }
 
+/**
+ * A max battle as the map shows it (plan 8X-5; design 7), as a raid is (`raidOf`): its boss and
+ * picture as its post shows them, the tier in the posts' words, its end and where it is; Done
+ * always among its buttons. None once its end has come, nor without the renderer's `maxLook`.
+ */
+function maxOf(party: MaxParty, link: string, input: PartyViewInput): MapMax | null {
+  if (maxEnded(party, input.now) || input.maxLook === undefined) return null;
+  const look = input.maxLook(party);
+  const { tier } = party.max;
+  return {
+    kind: 'max',
+    id: party.id,
+    spotId: look.spotId,
+    picture: allowedPicture(look.picture, input.pictureOrigins) ?? null,
+    level: tier,
+    tier: maxTierLabel(tier),
+    boss: look.boss,
+    title: maxBossTitle(look.boss, tier),
+    endTime: party.endTime ?? party.lastPossibleTime ?? input.now,
+    link,
+    place: { ...look.place, lat: round(look.place.lat), lon: round(look.place.lon) },
+    attendance: attendanceOf(party, input, true),
+  };
+}
+
 /**
  * What the member may do to a train's route on the map (spec 3.7), as the commands decide it
  * (`mayNotArrange`, `mayNotClear`, `mayNotLoad`); nothing while read-only.
@@ -367,7 +408,7 @@ export function mapParty(party: Party, input: PartyViewInput): MapParty | null {
   if (input.barred.has(forumChannelId)) return null;
   const link = postLink(input.guildId, forumPostId);
   if (isRaid(party)) return raidOf(party, link, input);
-  // Max battles are drawn from plan 8X-5 (design 7).
+  if (isMax(party)) return maxOf(party, link, input);
   if (!isTimed(party)) return null;
   if (timedOver(party, input.now)) return null;
   return party.type === 'train' ? trainOf(party, link, input) : meetupOf(party, link, input);
@@ -379,12 +420,14 @@ export function partyView(input: PartyViewInput): PartiesView {
     zone: input.zone,
     readOnly: input.readOnly,
     raids: [],
+    maxes: [],
     trains: [],
     meetups: [],
   };
   for (const party of input.parties) {
     const shown = mapParty(party, input);
     if (shown?.kind === 'raid') view.raids.push(shown);
+    else if (shown?.kind === 'max') view.maxes.push(shown);
     else if (shown?.kind === 'train') view.trains.push(shown);
     else if (shown?.kind === 'meetup') view.meetups.push(shown);
   }
diff --git a/src/domain/web/picture.ts b/src/domain/web/picture.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3da450fb81e246e0c85987db3bc1fb24aca1b40a
--- /dev/null
+++ b/src/domain/web/picture.ts
@@ -0,0 +1,17 @@
+/**
+ * A picture's address only when the page may load it: its origin is one of `origins` (the
+ * Content Security Policy's picture hosts, `pictureOrigins`); undefined for any other, and for an
+ * address that is none (an `attachment://` picture of a post among them). Pure, for the map's
+ * views (`partyView`, the pick lists of a max battle).
+ */
+export function allowedPicture(
+  url: string | undefined,
+  origins: readonly string[],
+): string | undefined {
+  if (url === undefined) return undefined;
+  try {
+    return origins.includes(new URL(url).origin) ? url : undefined;
+  } catch {
+    return undefined;
+  }
+}
diff --git a/src/render/max-post.test.ts b/src/render/max-post.test.ts
index 9218a075f6fefd092526db77d11e6dac1a343d89..1bc1ebc05bb4fbbaa2f2e6bc341f02c5ecb5fd4f 100644
--- a/src/render/max-post.test.ts
+++ b/src/render/max-post.test.ts
@@ -24,7 +24,7 @@ import { expectSendable } from '../../test/support/post-limits.js';
 import { keptRow } from '../../test/support/wayspot-cases.js';
 import { endParty, type MaxParty } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { maxTags, maxTitle, renderMaxPost, type MaxPostView } from './max-post.js';
+import { maxLook, maxTags, maxTitle, renderMaxPost, type MaxPostView } from './max-post.js';
 import { ENDED_COLOUR, KEPT_OPEN } from './party-post.js';
 import { renderRegionLink } from './summary.js';
 
@@ -128,6 +128,39 @@ describe('renderMaxPost: Where', () => {
   });
 });
 
+describe('maxLook: a max battle on the live map (plan 8X-5)', () => {
+  it('gives the boss and picture the post shows, and the spot as it is now while it is the same place', () => {
+    const now = keptRow(1, {
+      id: TEST_SPOT.id,
+      kind: 'powerspot',
+      title: 'Gazebo of the Old Park',
+      lat: TEST_SPOT.lat,
+      lon: TEST_SPOT.lon,
+      address: null,
+    });
+    expect(maxLook(view(testMax()))).toEqual({
+      picture: 'https://example.test/machamp.png',
+      boss: 'Machamp',
+      place: { name: 'Gazebo of the Park', lat: 40.0005, lon: -80.0005, address: '1 Park Lane' },
+      spotId: TEST_SPOT.id,
+    });
+    const renamed = view(testMax(), { wayspot: (id) => (id === TEST_SPOT.id ? now : undefined) });
+    expect(maxLook(renamed).place).toEqual({
+      name: 'Gazebo of the Old Park',
+      lat: 40.0005,
+      lon: -80.0005,
+      address: null,
+    });
+  });
+
+  it('gives a pin as an unlisted power spot, with no spot and no address', () => {
+    expect(maxLook(view(testMax({ spot: TEST_PIN })))).toMatchObject({
+      place: { name: 'Unlisted power spot', lat: 40.002, lon: -80.002, address: null },
+      spotId: null,
+    });
+  });
+});
+
 describe('renderMaxPost: groups, controls and the rest', () => {
   it('counts each group against its lobby, and has Done but no Set time', () => {
     const party = withAttendees(testMax(), {
diff --git a/src/render/max-post.ts b/src/render/max-post.ts
index eeb7dd13fab3aaba29653289a4e038b3d560d490..5fdc19c1a89b3db73ef69714d7626d2fd39bb2fd 100644
--- a/src/render/max-post.ts
+++ b/src/render/max-post.ts
@@ -7,6 +7,7 @@ import { listedMaxBoss } from '../domain/pogo/max-boss-list.js';
 import type { MaxBoss } from '../domain/pogo/max-bosses.js';
 import { maxBossTitle } from '../domain/pogo/max-tier.js';
 import { titleCase } from '../domain/pogo/names.js';
+import type { MaxLook } from '../domain/web/party-view.js';
 import { maxBossPicture, type PokemonIcons } from '../domain/pogo/pokemon-icons.js';
 import type { WayspotRow } from '../domain/wayspots/kept.js';
 import { wayspotPicture } from '../domain/wayspots/picture.js';
@@ -111,6 +112,26 @@ export function spotNow(
   return shown === now ? { ...now, kind: 'powerspot' } : spot;
 }
 
+/**
+ * How the live map shows a max battle (plan 8X-5), decided here as for the post: the boss's
+ * picture and name (`shownMaxBoss`), and where it is as Where names it: the power spot as it is
+ * now while it is the same place (`spotNow`), its address line or null; a pin as
+ * `Unlisted power spot`, no address, and no spot.
+ */
+export function maxLook(view: MaxPostView): MaxLook {
+  const { spot } = view.party.max;
+  const picture = view.boss.image;
+  const shown = spot.kind === 'pin' ? undefined : spotNow(spot, view.wayspot);
+  return {
+    ...(picture === undefined ? {} : { picture }),
+    boss: view.boss.name,
+    place: shown
+      ? { name: shown.title, lat: shown.lat, lon: shown.lon, address: shown.address || null }
+      : { name: UNLISTED_SPOT, lat: spot.lat, lon: spot.lon, address: null },
+    spotId: shown?.id ?? null,
+  };
+}
+
 /** `Dynamax Machamp (2★)`, `Gigantamax Machamp`: what the battle is (`maxBossTitle`). */
 function what(view: MaxPostView): string {
   return maxBossTitle(view.boss.name, view.party.max.tier);
diff --git a/src/web/client/meetup-forms.test.ts b/src/web/client/meetup-forms.test.ts
index c24ab1f250d558e18be51914310e662a2d904c59..9fb5828e70df9dfa179d62069a86d70e13637096 100644
--- a/src/web/client/meetup-forms.test.ts
+++ b/src/web/client/meetup-forms.test.ts
@@ -76,7 +76,7 @@ const MEETUP: MapMeetup = {
   startTime: NOW + 4 * HOUR,
   endTime: null,
   link: 'https://discord.com/channels/1/2',
-  attendance: { groups: [], mine: null, actions: [] },
+  attendance: { groups: [], mine: null, actions: [], remote: { offered: false, on: false } },
   place: { kind: 'gym', words: 'At The Stacks', lat: 40.05, lon: -80.05, gymId: 1 },
   info: 'Bring snacks.',
   panel: { start: true },
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index 5e368d39550b7df048dfb6c406432d41d872de32..f077e90ce6cc374e2ebd9da636938558a76e781a 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -32,6 +32,7 @@ const attendance = (more: Partial<MapAttendance> = {}): MapAttendance => ({
   groups: [{ id: 'A', interested: 1, coming: 3, present: 2 }],
   mine: null,
   actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
+  remote: { offered: true, on: false },
   ...more,
 });
 
@@ -257,6 +258,23 @@ describe('raidPopup', () => {
   });
 });
 
+// Plan 8X-5: the server's list gains `maxes` and every attendance its Remote switch. This page
+// reads `raids`, `trains` and `meetups` alone (`party-layer.ts`), so it never sees `maxes`; nor
+// does it draw Remote yet (follow-ups, the web UX pass): a raid with the switch is drawn as before.
+describe('a raid with the Remote switch', () => {
+  it('is drawn as before: its own buttons only, never one of an undefined label', () => {
+    const remote = raid({ attendance: attendance({ remote: { offered: true, on: true } }) });
+    const { atGyms } = raidsAtGyms([remote], (id) => GYMS.has(id));
+    const popup = gymRaidsPopup(1, atGyms.get(1) ?? [], context);
+    expect(tagged(popup, 'button').map((button) => button.attributes?.['data-action'])).toEqual([
+      'interested',
+      'join',
+      'here',
+    ]);
+    expect(texts(popup).join('\n')).not.toMatch(/undefined|Remote/);
+  });
+});
+
 describe('the raids of a gym', () => {
   const elite = raid({
     id: 'r3',
diff --git a/src/web/client/raid-forms.test.ts b/src/web/client/raid-forms.test.ts
index 43bd2eaaf678d0462a4a684cdd2d2b6170188af5..37c5482f8d31465b23f7f883b19f20a7723c449c 100644
--- a/src/web/client/raid-forms.test.ts
+++ b/src/web/client/raid-forms.test.ts
@@ -77,6 +77,7 @@ const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
     groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
     mine: null,
     actions: [],
+    remote: { offered: false, on: false },
   },
   ...more,
 });
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index b145ba30823062353607942de583441a4c595a79..8927b26fc32631aecac7062c0957b94ea5699b49 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -57,6 +57,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
     groups: [{ id: 'A', interested: 1, coming: 1, present: 0 }],
     mine: null,
     actions: [],
+    remote: { offered: false, on: false },
   },
   may: { arrange: true, clear: false, load: true },
   panel: {
diff --git a/src/web/client/train-ui.isolated.test.ts b/src/web/client/train-ui.isolated.test.ts
index 81ddfc094ee724b21d398bcf2c05a5eeae481e92..76876899bde3755ced20650a2bed00f3bf4db6c2 100644
--- a/src/web/client/train-ui.isolated.test.ts
+++ b/src/web/client/train-ui.isolated.test.ts
@@ -251,6 +251,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
     groups: [{ id: 'A', interested: 1, coming: 1, present: 0 }],
     mine: null,
     actions: [],
+    remote: { offered: false, on: false },
   },
   may: { arrange: true, clear: false, load: true },
   panel: {
diff --git a/src/web/meetup-routes.ts b/src/web/meetup-routes.ts
index e52a98c62f00b9b9bb7d4a1e246f94faec523785..1843729bfc7d66332adfef839d6d80447ff5ec20 100644
--- a/src/web/meetup-routes.ts
+++ b/src/web/meetup-routes.ts
@@ -210,6 +210,7 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
       staff: isMapStaff(standing, userId, parties.ownerId),
       botStaff: isMapBotStaff(standing, userId, parties.ownerId),
       look: (raid) => parties.look(raid),
+      ...(parties.maxLook === undefined ? {} : { maxLook: parties.maxLook }),
       pictureOrigins: deps.pictureOrigins,
     });
     return shown?.kind === 'meetup' ? shown : undefined;
diff --git a/src/web/parties.test.ts b/src/web/parties.test.ts
index e7e7772c7b758fb679974fa7549b318d880c3c83..314a318116a023152c63bc289e9dc5f084c14846 100644
--- a/src/web/parties.test.ts
+++ b/src/web/parties.test.ts
@@ -2,8 +2,8 @@ import { afterEach, describe, expect, it } from 'vitest';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { WEST_FORUM } from '../../test/support/gyms.js';
 import { FakeMemberDirectory } from '../../test/support/members.js';
-import { ALICE, BOB, CAROL, PARTY_NOW } from '../../test/support/parties.js';
-import { reportedRaid } from '../../test/support/party-service.js';
+import { ALICE, BOB, CAROL, PARTY_NOW, TEST_SPOT } from '../../test/support/parties.js';
+import { reportedMax, reportedRaid } from '../../test/support/party-service.js';
 import { partyWebWith, webServerWith, type TestWeb } from '../../test/support/web.js';
 import type { PartiesView } from '../domain/web/party-data.js';
 import { PartyStatus } from '../domain/party/status.js';
@@ -138,6 +138,28 @@ describe('the parties of a server on the map', () => {
     });
   });
 
+  // Plan 8X-5: max battles in a list of their own, which a page made before them never reads.
+  it('show a max battle at its spot in a list of its own, beside the raids the page reads', async () => {
+    const made = await reportedMax();
+    const members = new FakeMemberDirectory().add(ALICE, 'Alice');
+    web = webServerWith({ members, parties: partyWebWith(made) });
+    web.clock.now = PARTY_NOW;
+    const cookie = await web.loggedIn(ALICE, 'Alice');
+    const view = (await web.app.inject({ url: PARTIES, headers: { cookie } })).json<PartiesView>();
+    expect([...view.raids, ...view.trains, ...view.meetups]).toEqual([]);
+    expect(view.maxes).toMatchObject([
+      {
+        kind: 'max',
+        id: made.party.id,
+        spotId: TEST_SPOT.id,
+        title: 'Dynamax Machamp (2★)',
+        place: { name: 'Gazebo of the Park', address: '1 Park Lane' },
+        link: `https://discord.com/channels/${FAKE_GUILD_ID}/${made.postId}`,
+        attendance: { mine: null, remote: { offered: true, on: false } },
+      },
+    ]);
+  });
+
   it('may be asked 30 times a minute from one address', async () => {
     const made = await raidOnTheMap();
     web = made.web;
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index 0e5db50564f9206f6197ca895f203b3091a309a9..b692c0e3cd82d095a75c886ed93be97e399a9e76 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -10,9 +10,20 @@ import {
 import type { MemberStanding } from '../discord/member-directory.js';
 import type { MemberAccess } from '../discord/party-gateway.js';
 import type { Throttles } from '../discord/throttle.js';
-import { isGroupId, type GroupId, type Party, type RaidParty } from '../domain/party/party.js';
+import {
+  isGroupId,
+  type GroupId,
+  type MaxParty,
+  type Party,
+  type RaidParty,
+} from '../domain/party/party.js';
 import { MAP_ACTIONS, type MapAction, type PressAnswer } from '../domain/web/party-data.js';
-import { partyView, type PartyViewInput, type RaidLook } from '../domain/web/party-view.js';
+import {
+  partyView,
+  type MaxLook,
+  type PartyViewInput,
+  type RaidLook,
+} from '../domain/web/party-view.js';
 import { isRaidAction, PARTY_KIND } from '../render/party-controls.js';
 import { unplain } from '../render/text.js';
 import type {
@@ -55,6 +66,11 @@ export interface PartyWebDeps {
   store: { active(): Party[]; get(id: string): Party | undefined };
   /** How a raid's post looks (`raidLook` of the party service's view of it). */
   look(raid: RaidParty): RaidLook;
+  /**
+   * How a max battle's post looks (`maxLook` of the party service's view of it, plan 8X-5); left
+   * out: no max battle is shown.
+   */
+  maxLook?: (party: MaxParty) => MaxLook;
   /**
    * A power spot Pine keeps, by its Wayfarer id, for a train's route on the map (plan 8X-4);
    * left out: none is known.
@@ -186,6 +202,7 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
     staff: isMapStaff(viewer.standing, memberId, parties.ownerId),
     botStaff: isMapBotStaff(viewer.standing, memberId, parties.ownerId),
     look: (raid) => parties.look(raid),
+    ...(parties.maxLook === undefined ? {} : { maxLook: parties.maxLook }),
     ...(parties.spotOf === undefined ? {} : { spotOf: parties.spotOf }),
     pictureOrigins: deps.pictureOrigins,
   });
diff --git a/src/web/raid-routes.ts b/src/web/raid-routes.ts
index 57bc987c083c1600443b487764c99703af0084e7..d65d1f0f716e29e6dae1a32c13bd8a7878ae1449 100644
--- a/src/web/raid-routes.ts
+++ b/src/web/raid-routes.ts
@@ -234,6 +234,7 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
       readOnly: false,
       staff,
       look: (raid) => parties.look(raid),
+      ...(parties.maxLook === undefined ? {} : { maxLook: parties.maxLook }),
       pictureOrigins: deps.pictureOrigins,
     });
     return shown?.kind === 'raid' ? shown : undefined;
diff --git a/src/web/train-routes.ts b/src/web/train-routes.ts
index fe233180a263b70caf08b658f4ecd80b3f2a88d8..251a4712467e39d743f321af42dfed35d5feb836 100644
--- a/src/web/train-routes.ts
+++ b/src/web/train-routes.ts
@@ -269,6 +269,7 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
       staff: isMapStaff(standing, userId, parties.ownerId),
       botStaff: isMapBotStaff(standing, userId, parties.ownerId),
       look: (raid) => parties.look(raid),
+      ...(parties.maxLook === undefined ? {} : { maxLook: parties.maxLook }),
       ...(parties.spotOf === undefined ? {} : { spotOf: parties.spotOf }),
       pictureOrigins: deps.pictureOrigins,
     });
diff --git a/test/support/web.ts b/test/support/web.ts
index 645b82a8b34dbcda74328ca3c65c81058d68136f..5d7107af703b62209d6c891a35aa6911a3b51002 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -24,6 +24,7 @@ import { Throttles } from '../../src/discord/throttle.js';
 import type { Team } from '../../src/domain/party/party.js';
 import type { Member } from '../../src/services/attendance-service.js';
 import { buildWebServer, type WebDeps, type WebSettings } from '../../src/web/server.js';
+import { maxLook } from '../../src/render/max-post.js';
 import { raidLook } from '../../src/render/raid-post.js';
 import { inThisThread } from '../../src/web/save-check.js';
 import type { RegionEditing } from '../../src/web/editor-save.js';
@@ -244,9 +245,10 @@ const NO_PARTIES: PartyWebDeps = {
 };
 
 /**
- * The live map's parties over the party services of a test (`partyServiceWith`, `reportedRaid`
- * and the like), as the bot wires them: the store, the attendance service, the fake gateway's
- * forums, how the party service shows a raid, the server of the fake interactions as row 1.
+ * The live map's parties over the party services of a test (`partyServiceWith`, `reportedRaid`,
+ * `reportedMax` and the like), as the bot wires them: the store, the attendance service, the fake
+ * gateway's forums, how the party service shows a raid and a max battle, the server of the fake
+ * interactions as row 1.
  * Pass as `parties`. Who presses is `acting` (nobody by default); the window of the post's
  * controls is `throttles` (one of the test's, to share with a router or fill beforehand).
  */
@@ -263,6 +265,7 @@ export function partyWebWith(
     },
     store: made.store,
     look: (raid) => raidLook(made.service.view(raid)),
+    maxLook: (party) => maxLook(made.service.maxView(party)),
     forums: made.gateway,
     zone: made.settings.timezone,
     attendance: made.attendance,
````

### Task 3: 8X-5 task 3: the power spots of a box and the max pick lists

Prototype commit: `95732ba3e56318e0403d13028ba7eff9ebb11078`

GET /s/<guild>/api/powerspots?south&west&north&east gives the members of a server its
titled power spots in the box, as /api/stops gives the PokéStops (the same box schema,
nearest to the middle first, at most MAX_MAP_SPOTS with more, private no-store, 60 a
minute per address); both now go through wayspotsInBox (src/web/wayspot-box.ts).
GET /s/<guild>/api/max-options gives /max's bosses of the moment in its order
(maxOptions, pure: the value its choice has, the name, the tier and its words, whether it
is featured, the post's picture only from the picture origins, no value over 100
characters) and the tiers for a boss on no list, with an ETag, private no-cache, 30 a
minute per address. The max routes live in src/web/max-routes.ts over MaxWebDeps, what
/max reads and calls; the tests' maxWebWith, without it NO_MAXES.

**Files:**

```
 src/app.ts                  |   2 +
 src/domain/web/max-data.ts  |  90 +++++++++++++++++++++++++
 src/web/guild-routes.ts     |   5 ++
 src/web/max-options.test.ts | 227 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/max-options.ts      |  42 ++++++++++++
 src/web/max-routes.ts       | 115 ++++++++++++++++++++++++++++++++
 src/web/meetup-routes.ts    |  35 ++--------
 src/web/server.ts           |   3 +
 src/web/wayspot-box.ts      |  53 +++++++++++++++
 test/support/web.ts         |  28 ++++++++
 10 files changed, 570 insertions(+), 30 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/max-options.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 95732ba3e56318e0403d13028ba7eff9ebb11078 -- src/app.ts src/domain/web/max-data.ts src/web/guild-routes.ts src/web/max-options.test.ts src/web/max-options.ts src/web/max-routes.ts src/web/meetup-routes.ts src/web/server.ts src/web/wayspot-box.ts test/support/web.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-5 task 3: the power spots of a box and the max pick lists`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 4a3ffdbf99d95e689fc5be05768e03684f8f562d..5d349a07f41e2d0a8227154bf5b235796b898b7f 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -979,6 +979,8 @@ export async function startApp(
       // Making and changing meetups on the map: what /meetup, /name, /info, /meet and /end read
       // and call.
       meetups: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
+      // Max battles on the map (plan 8X-5): what /max reads and calls.
+      maxes: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
       // The Wayspot export tool (plan 8W-P): served from wayspot-tool/ to the admins the owner
       // approved, on an instance that has the file (the owner's).
       tool: {
diff --git a/src/domain/web/max-data.ts b/src/domain/web/max-data.ts
new file mode 100644
index 0000000000000000000000000000000000000000..91ac48a7470c59ec1fc2a77e9e894c9e12a87937
--- /dev/null
+++ b/src/domain/web/max-data.ts
@@ -0,0 +1,90 @@
+/**
+ * What the live map's max battles read and send (plan 8X-5; design 7), as a page reads it. Types
+ * and lists alone, with no import of the server's code: a page's bundle (`src/web/client/`) may
+ * take them.
+ */
+
+import type { MapMax, MapMaxTier } from './party-data.js';
+
+export type { MapMaxTier };
+
+/**
+ * The power spots of a server in a box of the map (`GET /s/<guild>/api/powerspots`), as
+ * `/api/stops` gives the PokéStops: `[id, lat, lon, title]`, the nearest to the box's middle
+ * first, at most `MAX_MAP_SPOTS`; `more` when the box holds more (the page asks to zoom in).
+ */
+export interface PowerSpotsView {
+  spots: Array<[string, number, number, string]>;
+  more: boolean;
+}
+
+/** As many power spots as one answer of `/api/powerspots` gives (as `MAX_MAP_STOPS`). */
+export const MAX_MAP_SPOTS = 300;
+
+/**
+ * A max boss as `/max` lists it (`GET /s/<guild>/api/max-options`): the value its choice has
+ * (`m:D2:machamp`, which a report sends back), the boss's name, the tier (`level`: `D1` to `G`)
+ * and the tier in the posts' words (`tier`: `Dynamax 2★`), whether it is the featured boss of an
+ * event that is on, and its picture where the page may load it.
+ */
+export interface MaxBossOption {
+  value: string;
+  name: string;
+  level: MapMaxTier;
+  tier: string;
+  featured: boolean;
+  image?: string;
+}
+
+/** A tier as `/max`'s `tier:` offers it, for a boss on no list: its value and its words. */
+export interface MaxTierOption {
+  value: MapMaxTier;
+  tier: string;
+}
+
+/**
+ * The pick lists of a report of a max battle (`GET /s/<guild>/api/max-options`), in `/max`'s
+ * order: the current bosses (the featured ones first; the Gigantamax ones first during a big
+ * event's hours), the tiers for a boss typed that is on no list, and the posts' zone, in which
+ * typed clock times are read.
+ */
+export interface MaxOptionsView {
+  zone: string;
+  bosses: MaxBossOption[];
+  tiers: MaxTierOption[];
+}
+
+/**
+ * The choices of the ending-soon question (a 422 of `POST /s/<guild>/api/maxes`, `soon`): its
+ * value (`next` for the next rotation, `soon` for the end about to pass), its words, and the end
+ * it reports, which the report sent again carries back with the value.
+ */
+export interface MaxEndChoice {
+  value: 'next' | 'soon';
+  label: string;
+  end: number;
+}
+
+/**
+ * What a refused report needs before it can be made, for a page to act on rather than read words
+ * (plan 8X-5): `tier`, a tier for a boss typed that is on no list (`/max` asks for `tier:`);
+ * `listed-spot`, a power spot Pine keeps, not a pin (a member blocked from meetups).
+ */
+export type MaxNeed = 'tier' | 'listed-spot';
+
+/**
+ * What a report of a max battle answers (`POST /s/<guild>/api/maxes`): whether it was done, the
+ * command's words as plain text, and the battle as the member now sees it on the map (also the
+ * battle the report joined), when there is one to show. A point in several regions is answered
+ * with those regions (`regions`, to pick one); a battle about to end with the question `/max`
+ * asks in its dialog (`soon`: the report is sent again with the choice).
+ */
+export interface MaxAnswer {
+  ok: boolean;
+  text: string;
+  /** What a refusal needs of the page, for it to act on (`MaxNeed`); absent otherwise. */
+  needs?: MaxNeed;
+  max?: MapMax;
+  regions?: Array<{ id: number; name: string }>;
+  soon?: { choices: MaxEndChoice[] };
+}
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index 16bd2d2d062d5a90e911654bc2b9bd0e77fe3790..612424bed7316865ffe96c50ccb795954cbf2542 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -4,6 +4,7 @@ import { sendFailure, shortPage } from './answers.js';
 import { editorRoutes } from './editor-routes.js';
 import { etagMatches } from './geo-cache.js';
 import { countsOnTheMap, mapMembers } from './map-members.js';
+import { maxRoutes } from './max-routes.js';
 import { meetupRoutes } from './meetup-routes.js';
 import { mapPage } from './page.js';
 import { partyRoutes } from './party-routes.js';
@@ -133,4 +134,8 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
 
   // Making and changing meetups on the live map (plan 8M-5M): for the same members.
   meetupRoutes(scope, map);
+
+  // Max battles on the live map (plan 8X-5): the power spots, the pick lists and reports, for the
+  // same members.
+  maxRoutes(scope, map);
 }
diff --git a/src/web/max-options.test.ts b/src/web/max-options.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0f282ec7771ec1614295c5e578659765732f9b2a
--- /dev/null
+++ b/src/web/max-options.test.ts
@@ -0,0 +1,227 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { maxReportingWith, MAX_THURSDAY } from '../../test/support/max-reporting.js';
+import { ALICE, BOB } from '../../test/support/parties.js';
+import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
+import { maxWebWith, partyWebWith, webServerWith, type TestWeb } from '../../test/support/web.js';
+import type { WayspotRow } from '../domain/wayspots/kept.js';
+import { maxChoiceValue } from '../commands/max/max-input.js';
+import type { MaxBossChoice } from '../domain/pogo/max-boss-list.js';
+import { MAX_MAP_SPOTS, type MaxOptionsView, type PowerSpotsView } from '../domain/web/max-data.js';
+import { currentMaxBossChoices } from '../services/max-boss-service.js';
+import { maxOptions } from './max-options.js';
+
+const OPTIONS = `/s/${FAKE_GUILD_ID}/api/max-options`;
+const ORIGINS = ['https://cdn.leekduck.com'];
+
+/** The map of the fakes' server with what `/max` reads, Alice a member; kept power spots `rows`. */
+async function serving(rows: readonly WayspotRow[] = []) {
+  const made = await maxReportingWith({ moderation: null }, rows);
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice');
+  const web = webServerWith({ members, parties: partyWebWith(made), maxes: maxWebWith(made.ctx) });
+  web.clock.now = MAX_THURSDAY;
+  return { ...made, web };
+}
+
+/** The bosses `/max` offers now, as the context lists them. */
+function offered(made: Awaited<ReturnType<typeof maxReportingWith>>): MaxBossChoice[] {
+  const { ctx } = made;
+  return currentMaxBossChoices(
+    {
+      maxBosses: ctx.maxBosses,
+      maxEvents: ctx.raidEvents,
+      pokemon: ctx.pokemon,
+      gameData: ctx.gameData,
+      zone: ctx.config.settings.timezone,
+    },
+    MAX_THURSDAY,
+  );
+}
+
+describe('the pick lists of a max battle report (maxOptions)', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it("lists the bosses in /max's order with the values its choices have, the tiers in the posts' words, and the tiers for a boss on no list", async () => {
+    const made = await maxReportingWith();
+    const choices = offered(made);
+    const view = maxOptions(choices, 'America/New_York', () => undefined, ORIGINS);
+    expect(view.zone).toBe('America/New_York');
+    expect(view.bosses.map((boss) => boss.value)).toEqual(
+      choices.map((choice) => maxChoiceValue(choice.boss)),
+    );
+    expect(view.bosses).toContainEqual({
+      value: 'm:D2:machop',
+      name: 'Machop',
+      level: 'D2',
+      tier: 'Dynamax 2★',
+      featured: false,
+    });
+    expect(view.tiers).toEqual([
+      { value: 'D1', tier: 'Dynamax 1★' },
+      { value: 'D2', tier: 'Dynamax 2★' },
+      { value: 'D3', tier: 'Dynamax 3★' },
+      { value: 'D4', tier: 'Dynamax 4★' },
+      { value: 'D5', tier: 'Dynamax 5★' },
+      { value: 'G', tier: 'Gigantamax' },
+    ]);
+  });
+
+  it('marks the featured bosses, gives a picture only from a host the page may load, and leaves out a value over 100 characters', () => {
+    const boss = (key: string, featured: boolean): MaxBossChoice => ({
+      boss: {
+        key,
+        tier: 'D1',
+        shiny: false,
+        name: key,
+        entry: undefined,
+        source: 'feed',
+        autoset: false,
+        pokemonId: key.toUpperCase(),
+        form: null,
+      },
+      name: `${key} · Dynamax 1★`,
+      featured,
+    });
+    const view = maxOptions(
+      [boss('sneasel', true), boss('skwovet', false), boss('x'.repeat(96), false)],
+      'America/New_York',
+      (one) =>
+        one.key === 'sneasel'
+          ? 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm215.icon.png'
+          : 'https://evil.example/x.png',
+      ORIGINS,
+    );
+    expect(view.bosses).toEqual([
+      {
+        value: 'm:D1:sneasel',
+        name: 'sneasel',
+        level: 'D1',
+        tier: 'Dynamax 1★',
+        featured: true,
+        image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm215.icon.png',
+      },
+      { value: 'm:D1:skwovet', name: 'skwovet', level: 'D1', tier: 'Dynamax 1★', featured: false },
+    ]);
+  });
+});
+
+describe('GET /s/<guild>/api/max-options', () => {
+  let web: TestWeb | undefined;
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
+  });
+  afterEach(async () => {
+    vi.useRealTimers();
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('answers a member with the pick lists, kept by an ETag, private', async () => {
+    const made = await serving();
+    web = made.web;
+    const cookie = await web.loggedIn(ALICE, 'Alice');
+    const answer = await web.app.inject({ url: OPTIONS, headers: { cookie } });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['cache-control']).toBe('private, no-cache');
+    const view = answer.json<MaxOptionsView>();
+    expect(view.bosses.map((boss) => boss.value)).toEqual(
+      offered(made).map((choice) => maxChoiceValue(choice.boss)),
+    );
+    const again = await web.app.inject({
+      url: OPTIONS,
+      headers: { cookie, 'if-none-match': String(answer.headers.etag) },
+    });
+    expect(again.statusCode).toBe(304);
+  });
+
+  it('is for members only: 401 without a login, 403 for somebody who is not a member', async () => {
+    const made = await serving();
+    web = made.web;
+    expect((await web.app.inject({ url: OPTIONS })).statusCode).toBe(401);
+    const cookie = await web.loggedIn(BOB, 'Bob');
+    expect((await web.app.inject({ url: OPTIONS, headers: { cookie } })).statusCode).toBe(403);
+  });
+
+  it('may be asked 30 times a minute from one address', async () => {
+    const made = await serving();
+    web = made.web;
+    const cookie = await web.loggedIn(ALICE, 'Alice');
+    for (let n = 0; n < 30; n++) {
+      expect((await web.app.inject({ url: OPTIONS, headers: { cookie } })).statusCode).toBe(200);
+    }
+    expect((await web.app.inject({ url: OPTIONS, headers: { cookie } })).statusCode).toBe(429);
+  });
+});
+
+describe('GET /s/<guild>/api/powerspots', () => {
+  let web: TestWeb | undefined;
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
+  });
+  afterEach(async () => {
+    vi.useRealTimers();
+    await web?.app.close();
+    web = undefined;
+  });
+
+  /** The power spots in a box, asked by `cookie`. */
+  const spotsIn = async (map: TestWeb, cookie: string | undefined, box: string) => {
+    const answer = await map.app.inject({
+      url: `/s/${FAKE_GUILD_ID}/api/powerspots?${box}`,
+      headers: cookie === undefined ? {} : { cookie },
+    });
+    return { status: answer.statusCode, json: answer.json<PowerSpotsView>(), answer };
+  };
+
+  it('gives a member the titled power spots of the server in the box, nearest to its middle first, never a PokéStop', async () => {
+    const made = await serving([
+      keptRow(2, { kind: 'powerspot', lat: 40.062, lon: -80.062, title: 'Salon' }),
+      keptRow(3, { kind: 'powerspot', lat: 40.0651, lon: -80.0651, title: 'Bandstand' }),
+      keptRow(4, { kind: 'powerspot', lat: 40.063, lon: -80.063, title: ' ' }),
+      keptRow(5, { kind: 'stop', lat: 40.064, lon: -80.064, title: 'Market Fountain' }),
+    ]);
+    web = made.web;
+    const cookie = await web.loggedIn(ALICE, 'Alice');
+    const answer = await spotsIn(web, cookie, 'south=40.06&west=-80.07&north=40.07&east=-80.06');
+    expect(answer.status).toBe(200);
+    expect(answer.answer.headers['cache-control']).toBe('private, no-store');
+    expect(answer.json).toEqual({
+      spots: [
+        [wayspotId(3), 40.0651, -80.0651, 'Bandstand'],
+        [wayspotId(2), 40.062, -80.062, 'Salon'],
+      ],
+      more: false,
+    });
+  });
+
+  it(`gives at most ${String(MAX_MAP_SPOTS)}, and says there are more`, async () => {
+    const rows = Array.from({ length: MAX_MAP_SPOTS + 5 }, (_, n) =>
+      keptRow(10 + n, { kind: 'powerspot', lat: 40.05 + n / 100_000, lon: -80.05 }),
+    );
+    const made = await serving(rows);
+    web = made.web;
+    const cookie = await web.loggedIn(ALICE, 'Alice');
+    const answer = await spotsIn(web, cookie, 'south=40&west=-80.1&north=40.1&east=-80');
+    expect(answer.json.spots).toHaveLength(MAX_MAP_SPOTS);
+    expect(answer.json.more).toBe(true);
+  });
+
+  it('is for members alone, refuses a box that is none, and 60 a minute from one address', async () => {
+    const made = await serving();
+    web = made.web;
+    const box = 'south=40&west=-80.1&north=40.1&east=-80';
+    expect((await spotsIn(web, undefined, box)).status).toBe(401);
+    const stranger = await web.loggedIn(BOB, 'Bob');
+    expect((await spotsIn(web, stranger, box)).status).toBe(403);
+    const cookie = await web.loggedIn(ALICE, 'Alice');
+    expect((await spotsIn(web, cookie, 'south=41&west=-80.1&north=40&east=-80')).status).toBe(400);
+    for (let n = 0; n < 57; n++) expect((await spotsIn(web, cookie, box)).status).toBe(200);
+    expect((await spotsIn(web, cookie, box)).status).toBe(429);
+  });
+});
diff --git a/src/web/max-options.ts b/src/web/max-options.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e5c97351b4fd96be19b5f31750b6f2445ce984f9
--- /dev/null
+++ b/src/web/max-options.ts
@@ -0,0 +1,42 @@
+import { maxChoiceValue, TIER_CHOICES } from '../commands/max/max-input.js';
+import type { MaxBossChoice } from '../domain/pogo/max-boss-list.js';
+import type { MaxBoss } from '../domain/pogo/max-bosses.js';
+import { maxTierLabel } from '../domain/pogo/max-tier.js';
+import type { MaxOptionsView } from '../domain/web/max-data.js';
+import { allowedPicture } from '../domain/web/picture.js';
+
+/** The longest value a pick of `/max`'s list may have (Discord's limit, kept for the map too). */
+const MAX_VALUE = 100;
+
+/**
+ * The pick lists of a report of a max battle on the map (plan 8X-5), as `/max` offers them: the
+ * current bosses in their order (`currentMaxBossChoices`: the featured ones first, the Gigantamax
+ * ones first during a big event's hours), each with the value its choice has (`maxChoiceValue`,
+ * which `readMaxBoss` reads back; one over 100 characters left out, as `/max`'s list leaves it),
+ * its tier and the tier in the posts' words, and its picture (`picture`, the post's) only from
+ * `origins`; then the tiers `/max`'s `tier:` offers for a boss on no list. Pure.
+ */
+export function maxOptions(
+  choices: readonly MaxBossChoice[],
+  zone: string,
+  picture: (boss: MaxBoss) => string | undefined,
+  origins: readonly string[],
+): MaxOptionsView {
+  return {
+    zone,
+    bosses: choices
+      .map((choice) => {
+        const image = allowedPicture(picture(choice.boss), origins);
+        return {
+          value: maxChoiceValue(choice.boss),
+          name: choice.boss.name,
+          level: choice.boss.tier,
+          tier: maxTierLabel(choice.boss.tier),
+          featured: choice.featured,
+          ...(image === undefined ? {} : { image }),
+        };
+      })
+      .filter((option) => option.value.length <= MAX_VALUE),
+    tiers: TIER_CHOICES.map((choice) => ({ value: choice.value, tier: choice.name })),
+  };
+}
diff --git a/src/web/max-routes.ts b/src/web/max-routes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..451896fb1bdf3ee637048c37693bbbcc1b2eee13
--- /dev/null
+++ b/src/web/max-routes.ts
@@ -0,0 +1,115 @@
+import type { FastifyInstance } from 'fastify';
+import type { AppContext } from '../app-context.js';
+import type { MaxReading, SpotReading } from '../commands/max/max-input.js';
+import type { MaxReporting } from '../commands/max/max-report.js';
+import { maxBossPicture } from '../domain/pogo/pokemon-icons.js';
+import { MAX_MAP_SPOTS, type PowerSpotsView } from '../domain/web/max-data.js';
+import { currentMaxBossChoices } from '../services/max-boss-service.js';
+import { memberOrFailure } from './acting.js';
+import { sendFailure } from './answers.js';
+import { etagMatches, etagOf } from './geo-cache.js';
+import type { GuildRequest } from './guild-routes.js';
+import { maxOptions } from './max-options.js';
+import { limitedPerAddress, RateLimiter } from './rate-limit.js';
+import type { WebDeps } from './server.js';
+import { boxSchema, wayspotsInBox } from './wayspot-box.js';
+
+/**
+ * What the max battles of the live map read and call (plan 8X-5): exactly what `/max` uses (its
+ * readers' sources: the settings, the max bosses, the events, the Pokémon search, the game data;
+ * the members' settings, the party service, the moderators' notices and the log of its report;
+ * the gyms, kept Wayspots and place search that name a spot; meetup safety's blocks; the regions;
+ * the active parties), so that the map shares its code paths.
+ */
+export type MaxWebContext = MaxReading &
+  MaxReporting &
+  SpotReading &
+  Pick<AppContext, 'meetupSafety' | 'regions' | 'parties'>;
+
+/** What the max battles of the live map need beyond the parties' own (`PartyWebDeps`). */
+export interface MaxWebDeps {
+  ctx: MaxWebContext;
+  /** A channel's name as the bot sees it now: a region's, which an answer names. */
+  channelName(channelId: string): string | undefined;
+}
+
+/** The requests for the pick lists one address may make in a minute (a form asks once). */
+const OPTIONS_PER_MINUTE = 30;
+
+/** The questions for the power spots in a box one address may ask in a minute (each pan). */
+const SPOTS_PER_MINUTE = 60;
+
+/**
+ * The max battles of the live map (plan 8X-5; design 7): the power spots of a box of the map
+ * (`GET /s/<guild>/api/powerspots`), as `/api/stops` gives the PokéStops, and the pick lists of a
+ * report (`GET /s/<guild>/api/max-options`, as `/max` lists its bosses), for members of the
+ * server.
+ */
+export function maxRoutes(scope: FastifyInstance, deps: WebDeps): void {
+  const { sessions, parties, maxes } = deps;
+  const { ctx } = maxes;
+
+  // The power spots of a box of the map (plan 8X-5): members only (as the pick lists), those in a
+  // region of this server with a title, the nearest to the box's middle first, at most
+  // `MAX_MAP_SPOTS` (`more` says there were more: the page asks to zoom in).
+  const spotsLimiter = new RateLimiter({ uses: SPOTS_PER_MINUTE, perMs: 60_000 });
+  scope.get(
+    '/api/powerspots',
+    { onRequest: limitedPerAddress(spotsLimiter, { now: deps.now }) },
+    async (request: GuildRequest, reply) => {
+      void reply.header('cache-control', 'private, no-store');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 401);
+      const box = boxSchema.safeParse(request.query ?? {});
+      if (!box.success) return sendFailure(request, reply, 400);
+      const { guild } = request.params;
+      const refused = await memberOrFailure(deps, request, reply, guild, session.userId);
+      if (refused) return refused;
+      const row = await parties.guilds.idFor(guild);
+      const { found, more } = wayspotsInBox(ctx, row, box.data, 'powerspot', MAX_MAP_SPOTS);
+      const view: PowerSpotsView = { spots: found, more };
+      return view;
+    },
+  );
+
+  // The pick lists of a report (plan 8X-5): `/max`'s bosses of the moment in its order, with the
+  // values its choices have and the post's pictures, and the tiers of a boss on no list; for
+  // members of the server, an ETag of its JSON, `private, no-cache`, 304 when the page has it.
+  const optionsLimiter = new RateLimiter({ uses: OPTIONS_PER_MINUTE, perMs: 60_000 });
+  scope.get(
+    '/api/max-options',
+    { onRequest: limitedPerAddress(optionsLimiter, { now: deps.now }) },
+    async (request: GuildRequest, reply) => {
+      void reply.header('cache-control', 'private, no-cache');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 401);
+      const refused = await memberOrFailure(
+        deps,
+        request,
+        reply,
+        request.params.guild,
+        session.userId,
+      );
+      if (refused) return refused;
+      const { catalogue, icons } = ctx.gameData;
+      const choices = currentMaxBossChoices(
+        {
+          maxBosses: ctx.maxBosses,
+          maxEvents: ctx.raidEvents,
+          pokemon: ctx.pokemon,
+          gameData: ctx.gameData,
+          zone: parties.zone,
+        },
+        deps.now(),
+      );
+      // The picture a post of the boss would show (`shownMaxBoss`): the game's icon, else the list's.
+      const picture = (boss: (typeof choices)[number]['boss']) =>
+        maxBossPicture(boss.entry, boss.tier, { catalogue, icons }) ?? boss.image;
+      const body = JSON.stringify(maxOptions(choices, parties.zone, picture, deps.pictureOrigins));
+      const etag = etagOf(body);
+      void reply.header('etag', etag);
+      if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
+      return reply.type('application/json; charset=utf-8').send(body);
+    },
+  );
+}
diff --git a/src/web/meetup-routes.ts b/src/web/meetup-routes.ts
index 1843729bfc7d66332adfef839d6d80447ff5ec20..a3b57dca8aa878117a82c994ef59e89ecb5d0fd7 100644
--- a/src/web/meetup-routes.ts
+++ b/src/web/meetup-routes.ts
@@ -66,6 +66,7 @@ import { sendFailure } from './answers.js';
 import { postGuard } from './csrf.js';
 import type { GuildRequest } from './guild-routes.js';
 import { pageWords } from './page-words.js';
+import { boxSchema, wayspotsInBox } from './wayspot-box.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
 
@@ -139,17 +140,6 @@ const makeBodySchema = z
   })
   .strict();
 
-/** A box of the map, as Leaflet's bounds give it. */
-const boxSchema = z
-  .object({
-    south: z.coerce.number().min(-90).max(90),
-    west: z.coerce.number().min(-180).max(180),
-    north: z.coerce.number().min(-90).max(90),
-    east: z.coerce.number().min(-180).max(180),
-  })
-  .strict()
-  .refine((box) => box.south <= box.north && box.west <= box.east);
-
 /** A point kept to six decimals (about 10 cm), as the map's outlines and pins are. */
 const sixDecimals = (value: number): number => Math.round(value * 1e6) / 1e6;
 
@@ -548,7 +538,8 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
   // The PokéStops of a box of the map, to pick a meetup's place from (plan 8M-5M): members only
   // (as the pick lists), those in a region of this server with a title, the nearest to the box's
   // middle first, at most `MAX_MAP_STOPS` (`more` says there were more: the page asks to zoom
-  // in). Gyms are on the map already; power spots and other Wayspots are never offered.
+  // in). Gyms are on the map already; power spots are offered by `/api/powerspots` (plan 8X-5),
+  // for max battles, never for a meetup.
   const stopsLimiter = new RateLimiter({ uses: STOPS_PER_MINUTE, perMs: 60_000 });
   scope.get(
     '/api/stops',
@@ -563,24 +554,8 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
       const refused = await memberOrFailure(deps, request, reply, guild, session.userId);
       if (refused) return refused;
       const row = await parties.guilds.idFor(guild);
-      const { south, west, north, east } = box.data;
-      const middle = { lat: (south + north) / 2, lon: (west + east) / 2 };
-      const found = new Map<string, [string, number, number, string]>();
-      for (const region of ctx.regions.all()) {
-        if (region.guildId !== row || row === undefined || region.bounds === null) continue;
-        for (const stop of ctx.wayspots.inRegion(region.channelId)) {
-          if (stop.kind !== 'stop' || stop.title.trim() === '') continue;
-          if (stop.lat < south || stop.lat > north || stop.lon < west || stop.lon > east) continue;
-          found.set(stop.id, [stop.id, stop.lat, stop.lon, stop.title]);
-        }
-      }
-      const distance = ([, lat, lon]: [string, number, number, string]): number =>
-        (lat - middle.lat) ** 2 + (lon - middle.lon) ** 2;
-      const nearest = [...found.values()].sort((a, b) => distance(a) - distance(b));
-      const view: StopsView = {
-        stops: nearest.slice(0, MAX_MAP_STOPS),
-        more: nearest.length > MAX_MAP_STOPS,
-      };
+      const { found, more } = wayspotsInBox(ctx, row, box.data, 'stop', MAX_MAP_STOPS);
+      const view: StopsView = { stops: found, more };
       return view;
     },
   );
diff --git a/src/web/server.ts b/src/web/server.ts
index 08423be6a743fdfc6eaffaefb75fe499c1efb89b..11758c34badfcd40bd9d951adfb72652aea9b5fa 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -17,6 +17,7 @@ import type { GeoCache } from './geo-cache.js';
 import { guildRoutes } from './guild-routes.js';
 import { securityHeaders } from './headers.js';
 import type { LoginLinks } from './login-links.js';
+import type { MaxWebDeps } from './max-routes.js';
 import type { MeetupWebDeps } from './meetup-routes.js';
 import { HASHED_NAME, type WebAssets } from './page.js';
 import type { PartyWebDeps } from './party-routes.js';
@@ -61,6 +62,8 @@ export interface WebDeps {
   trains: TrainWebDeps;
   /** Making and changing meetups on the live map (plan 8M-5M). */
   meetups: MeetupWebDeps;
+  /** Max battles on the live map: power spots, the pick lists, reports (plan 8X-5). */
+  maxes: MaxWebDeps;
   /** The Wayspot export tool and who may have it (plan 8W-P): `/userscript`. */
   tool: ToolWebDeps;
   now: () => number;
diff --git a/src/web/wayspot-box.ts b/src/web/wayspot-box.ts
new file mode 100644
index 0000000000000000000000000000000000000000..06ddab1090d30516d07ec6f96b578374444dd415
--- /dev/null
+++ b/src/web/wayspot-box.ts
@@ -0,0 +1,53 @@
+import { z } from 'zod';
+import type { AppContext } from '../app-context.js';
+
+/**
+ * The kept Wayspots of one kind in a box of the map (plans 8M-5M, 8X-5): the PokéStops of
+ * `/api/stops`, the power spots of `/api/powerspots`.
+ */
+
+/** A box of the map, as Leaflet's bounds give it: within the world, not inverted. */
+export const boxSchema = z
+  .object({
+    south: z.coerce.number().min(-90).max(90),
+    west: z.coerce.number().min(-180).max(180),
+    north: z.coerce.number().min(-90).max(90),
+    east: z.coerce.number().min(-180).max(180),
+  })
+  .strict()
+  .refine((box) => box.south <= box.north && box.west <= box.east);
+
+export type MapBox = z.infer<typeof boxSchema>;
+
+/** A Wayspot as the map lists it: `[id, lat, lon, title]`. */
+export type BoxedWayspot = [string, number, number, string];
+
+/**
+ * The kept Wayspots of `kind` with a title in a region of the server (`row`) inside the box, the
+ * nearest to the box's middle first, at most `max`; `more` when the box holds more. None for a
+ * server without its row yet.
+ */
+export function wayspotsInBox(
+  ctx: Pick<AppContext, 'regions' | 'wayspots'>,
+  row: number | undefined,
+  box: MapBox,
+  kind: 'stop' | 'powerspot',
+  max: number,
+): { found: BoxedWayspot[]; more: boolean } {
+  const { south, west, north, east } = box;
+  const middle = { lat: (south + north) / 2, lon: (west + east) / 2 };
+  const found = new Map<string, BoxedWayspot>();
+  for (const region of ctx.regions.all()) {
+    if (region.guildId !== row || row === undefined || region.bounds === null) continue;
+    for (const wayspot of ctx.wayspots.inRegion(region.channelId)) {
+      if (wayspot.kind !== kind || wayspot.title.trim() === '') continue;
+      const { lat, lon } = wayspot;
+      if (lat < south || lat > north || lon < west || lon > east) continue;
+      found.set(wayspot.id, [wayspot.id, lat, lon, wayspot.title]);
+    }
+  }
+  const distance = ([, lat, lon]: BoxedWayspot): number =>
+    (lat - middle.lat) ** 2 + (lon - middle.lon) ** 2;
+  const nearest = [...found.values()].sort((a, b) => distance(a) - distance(b));
+  return { found: nearest.slice(0, max), more: nearest.length > max };
+}
diff --git a/test/support/web.ts b/test/support/web.ts
index 5d7107af703b62209d6c891a35aa6911a3b51002..4894898e0929802f2adec074e2cf8d82f75c8e46 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -20,6 +20,7 @@ import type { RaidWebContext, RaidWebDeps } from '../../src/web/raid-routes.js';
 import type { SpawnWebContext, SpawnWebDeps } from '../../src/web/spawn-routes.js';
 import type { TrainWebContext, TrainWebDeps } from '../../src/web/train-routes.js';
 import type { MeetupWebContext, MeetupWebDeps } from '../../src/web/meetup-routes.js';
+import type { MaxWebContext, MaxWebDeps } from '../../src/web/max-routes.js';
 import { Throttles } from '../../src/discord/throttle.js';
 import type { Team } from '../../src/domain/party/party.js';
 import type { Member } from '../../src/services/attendance-service.js';
@@ -360,6 +361,30 @@ const NO_MEETUPS: MeetupWebDeps = {
   channelName: () => undefined,
 };
 
+/**
+ * Reporting max battles on the map over a test's context (`maxReportingWith`'s, or
+ * `createTestContext` with the party services, the max bosses, the events, the kept power spots
+ * and meetup safety), as the bot wires it. Pass as `maxes`. `channelName` names the channels the
+ * bot sees (none by default).
+ */
+export function maxWebWith(
+  ctx: MaxWebContext,
+  options: Partial<Omit<MaxWebDeps, 'ctx'>> = {},
+): MaxWebDeps {
+  return { ctx, channelName: () => undefined, ...options };
+}
+
+/** No max battles can be reported: a test that does passes `maxWebWith`. */
+const NO_MAXES: MaxWebDeps = {
+  ctx: new Proxy({} as MaxWebContext, {
+    get(_target, property) {
+      if (typeof property === 'symbol' || property === 'then') return undefined;
+      throw new Error('no max battles in this test: give maxWebWith');
+    },
+  }),
+  channelName: () => undefined,
+};
+
 /** No overwrite of a member's own keeps anybody out of a channel. */
 const NOBODY_KEPT_OUT: SpawnWebDeps['channels'] = { ownViewDenied: () => Promise.resolve(false) };
 
@@ -468,6 +493,8 @@ export interface WebTestOptions {
   trains?: TrainWebDeps;
   /** Making and changing meetups on the map (`meetupWebWith`); none by default. */
   meetups?: MeetupWebDeps;
+  /** Max battles on the map: power spots, pick lists, reports (`maxWebWith`); none by default. */
+  maxes?: MaxWebDeps;
   /** The Wayspot export tool and who may have it (`toolWebWith`); no tool file by default. */
   tool?: ToolWebDeps;
 }
@@ -640,6 +667,7 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
     spawns: options.spawns ?? NO_SPAWNS,
     trains: options.trains ?? NO_TRAINS,
     meetups: options.meetups ?? NO_MEETUPS,
+    maxes: options.maxes ?? NO_MAXES,
     tool: options.tool ?? NO_TOOL,
     now: () => clock.now,
     log,
````

### Task 4: 8X-5 task 4: reporting a max battle from the map

Prototype commit: `46631de9e7d13a8014f04068cedff186c64dbaac`

POST /s/<guild>/api/maxes is /max as the member: a power spot by its Wayfarer id or a
point (the nearest power spot within 50 m, else an unlisted power spot), the region when
the place lies in several (422 with the regions), the boss and tier as /max reads them,
the end as end: reads it. Before the throttle, uncounted: the readers' refusals (422),
another boss at the spot (409, the battle named without its post), a member blocked from
meetups at a pin for a new battle (403; joining one there is allowed), the forums
(maxBarred: 403, 503 while Discord cannot say), and the ending-soon question, where
/max opens its dialog: 422 { soon: { choices } } with the dialog's words, each choice
with its end; the report sent again with a choice still offered takes its end, one no
longer offered is asked again, one that has passed is refused in the dialog's words.
Then /max's throttle in its window, reportMaxAs, the use given back for no post or a
battle ended twice; the answer carries the battle as the map shows it, and where it was
posted when the region picked has no forum. Statuses as raids' where the meaning is the
same; no-post 503. Logged with the spot's id or pin, never a text or the point.

**Files:**

```
 src/commands/max/max-report.ts |   6 +
 src/commands/max/max.ts        |   3 +-
 src/web/max-report.test.ts     | 463 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/max-routes.ts          | 415 +++++++++++++++++++++++++++++++++++++++++++++++++++++-
 4 files changed, 879 insertions(+), 8 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/max-report.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 46631de9e7d13a8014f04068cedff186c64dbaac -- src/commands/max/max-report.ts src/commands/max/max.ts src/web/max-report.test.ts src/web/max-routes.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-5 task 4: reporting a max battle from the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/max/max-report.ts b/src/commands/max/max-report.ts
index 9e957b149183a00d8795728f2e57a9f56cd8c5bc..df3c4cd11ba8599dc6b74ff914ad90ca306d4802 100644
--- a/src/commands/max/max-report.ts
+++ b/src/commands/max/max-report.ts
@@ -44,6 +44,12 @@ export const MAX_PIN_BLOCKED =
  */
 export const MAX_ENDED = 'The max battle there has just ended: use `/max` again.';
 
+/**
+ * What the ending-soon question's answer is refused when the end chosen has passed meanwhile
+ * (the dialog's Submit, the map's report sent again with its choice).
+ */
+export const ENDED_MEANWHILE = 'That battle has ended meanwhile: nothing was reported.';
+
 /** A report whose boss, spot and end are read: what, where, until when, made in which region. */
 export interface MaxReportRequest {
   boss: ReadMaxBoss;
diff --git a/src/commands/max/max.ts b/src/commands/max/max.ts
index 0581527274677acab4c1b9d08f55a6fddbadda8a..ab9ac2205851faf4f3f6f99de7ac0c756dd0ed58 100644
--- a/src/commands/max/max.ts
+++ b/src/commands/max/max.ts
@@ -40,6 +40,7 @@ import {
 } from './max-input.js';
 import {
   blockedAtPin,
+  ENDED_MEANWHILE,
   MAX_BARRED,
   MAX_COMMAND,
   MAX_PIN_BLOCKED,
@@ -309,7 +310,7 @@ export const maxControls: ComponentHandler = {
     await deferSubmit(interaction);
     const now = Date.now();
     const end = choice === NEXT_ROTATION && ask.next !== undefined ? ask.next : ask.end;
-    if (end <= now) throw new UserError('That battle has ended meanwhile: nothing was reported.');
+    if (end <= now) throw new UserError(ENDED_MEANWHILE);
     const there = battleThere(ctx, ask, now);
     if (there && otherBoss(there, ask.boss)) {
       throw new UserError(takenWords(ctx, there, ask.boss.tier));
diff --git a/src/web/max-report.test.ts b/src/web/max-report.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d2d289ca593a01025ff9e5a4dab829c694c056de
--- /dev/null
+++ b/src/web/max-report.test.ts
@@ -0,0 +1,463 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { MOD } from '../../test/support/meetup-safety-cases.js';
+import { MOD_CHANNEL, type SafetyOptions } from '../../test/support/meetup-safety-service.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { maxReportingWith, MAX_THURSDAY } from '../../test/support/max-reporting.js';
+import { textDisplays } from '../../test/support/messages.js';
+import { ALICE, asMax, at, BOB, TEST_SPOT } from '../../test/support/parties.js';
+import {
+  FakeActingMembers,
+  maxWebWith,
+  partyWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { MAX_BARRED, MAX_COMMAND, MAX_THROTTLE } from '../commands/max/max-report.js';
+import { Throttles } from '../discord/throttle.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { MaxAnswer } from '../domain/web/max-data.js';
+import { UNREACHABLE } from './acting.js';
+import { MAP_MAX_ENDED, MAP_NOT_HERE, MAP_PIN_BLOCKED, MAP_WHICH_TIER } from './max-routes.js';
+
+const REPORT = `/s/${FAKE_GUILD_ID}/api/maxes`;
+const NINE = at('2026-10-22T21:00');
+/** A point of West that no power spot is near: an unlisted power spot. */
+const PIN = { lat: 40.05, lon: -80.05 };
+
+/**
+ * The map of the fakes' server over what `/max` reads and calls, Alice and Bob members (Alice
+ * fetched fresh as `Alice` of team valor), the clock at `MAX_THURSDAY` (Date faked to it too).
+ */
+async function reporting(options: { throttles?: Throttles; safety?: SafetyOptions } = {}) {
+  const throttles = options.throttles ?? new Throttles();
+  const made = await maxReportingWith(options.safety ?? { moderation: null });
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const acting = new FakeActingMembers().add(ALICE, 'Alice', 'valor').add(BOB, 'Bob');
+  const names = new Map([
+    [WEST_CHANNEL, 'west'],
+    [EAST_CHANNEL, 'east'],
+  ]);
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made, { acting, throttles }),
+    maxes: maxWebWith(made.ctx, { channelName: (id) => names.get(id) }),
+  });
+  web.clock.now = MAX_THURSDAY;
+  const headers = await web.posting(ALICE, 'Alice');
+  const bob = await web.posting(BOB, 'Bob');
+  const report = async (body: unknown, sent = headers) => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: REPORT,
+      headers: { ...sent, 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return {
+      status: answer.statusCode,
+      json: answer.json<MaxAnswer & { error?: string }>(),
+      headers: answer.headers,
+    };
+  };
+  /** Uses `n` of Alice's uses of /max, as Discord would have. */
+  const fill = (n: number) => {
+    for (let use = 0; use < n; use++) {
+      throttles.use(MAX_COMMAND, ALICE, MAX_THROTTLE, web.clock.now);
+    }
+  };
+  /** Moves the clocks of the services and of the web server on to `time`. */
+  const clockAt = (time: number) => {
+    vi.setSystemTime(time);
+    web.clock.now = time;
+  };
+  return { made, web, acting, members, headers, bob, report, throttles, clockAt, fill };
+}
+
+describe('reporting a max battle on the map', () => {
+  let web: TestWeb | undefined;
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
+  });
+  afterEach(async () => {
+    vi.useRealTimers();
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("reports a boss of the list at a power spot as /max does: as the member, until its end, the command's words and the battle as the map shows it", async () => {
+    const map = await reporting();
+    web = map.web;
+    const answer = await map.report({ spot: TEST_SPOT.id, boss: 'm:D2:machop' });
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({
+      ok: true,
+      text: 'Reported: Dynamax Machop (2★) at Gazebo of the Park, until 9:00 PM.',
+      max: { kind: 'max', spotId: TEST_SPOT.id, title: 'Dynamax Machop (2★)', endTime: NINE },
+    });
+    const battle = asMax(map.made.store.active()[0]);
+    expect(battle).toMatchObject({ createdById: ALICE, forumChannelId: WEST_FORUM, endTime: NINE });
+    expect(battle.attendees[ALICE]).toMatchObject({ name: 'Alice', team: 'valor' });
+    expect(answer.json.max?.id).toBe(battle.id);
+    expect(map.made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
+    // Counted in /max's own window, as a use of /max is: once.
+    map.fill(MAX_THROTTLE.uses - 2);
+    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(409);
+    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(429);
+    expect(map.web.entries).toContainEqual(
+      expect.objectContaining({
+        msg: 'a max battle was reported on the map',
+        user: ALICE,
+        guild: FAKE_GUILD_ID,
+        spot: TEST_SPOT.id,
+        outcome: 'created',
+      }),
+    );
+  });
+
+  it('takes a point near a power spot as that spot, and one near none as an unlisted power spot, telling the moderators', async () => {
+    const map = await reporting({ safety: {} });
+    web = map.web;
+    const near = await map.report({
+      lat: TEST_SPOT.lat,
+      lon: TEST_SPOT.lon + 0.0002,
+      boss: 'Machop',
+    });
+    expect(near.json.max?.spotId).toBe(TEST_SPOT.id);
+    const pinned = await map.report({ lat: 40.0500000004, lon: -80.05, boss: 'Machop' });
+    expect(pinned.status).toBe(200);
+    expect(pinned.json.text).toBe(
+      'Reported: Dynamax Machop (2★) at an unlisted power spot, until 9:00 PM.',
+    );
+    expect(pinned.json.max).toMatchObject({
+      spotId: null,
+      place: { name: 'Unlisted power spot', lat: 40.05, lon: -80.05, address: null },
+    });
+    const pin = map.made.store
+      .active()
+      .map(asMax)
+      .find((one) => one.max.spot.kind === 'pin');
+    expect(pin?.max.spot).toEqual({
+      kind: 'pin',
+      lat: 40.05,
+      lon: -80.05,
+      near: null,
+      linkName: null,
+    });
+    await map.made.reports.flush();
+    const [notice] = map.made.gateway.messagesIn(MOD_CHANNEL);
+    expect(textDisplays(notice?.message)[0]).toMatch(/^### Max battle at an unlisted power spot/);
+    expect(map.web.entries).toContainEqual(
+      expect.objectContaining({ msg: 'a max battle was reported on the map', pin: true }),
+    );
+  });
+
+  it('refuses a member blocked from meetups a new battle at a pin, uncounted, and lets them join one there', async () => {
+    const map = await reporting({ safety: {} });
+    web = map.web;
+    await map.made.storage.addBlock(map.made.gateway.guildId, ALICE, MOD);
+    const refused = await map.report({ ...PIN, boss: 'Machop' });
+    expect(refused.status).toBe(403);
+    // The map's own words (the list of /max's option is no part of the map), and what it needs.
+    expect(refused.json).toEqual({ ok: false, text: MAP_PIN_BLOCKED, needs: 'listed-spot' });
+    expect(map.made.store.active()).toEqual([]);
+    expect(map.throttles.size).toBe(0);
+    expect((await map.report({ ...PIN, boss: 'Machop' }, map.bob)).status).toBe(200);
+    const joined = await map.report({ ...PIN, boss: 'Machop' });
+    expect(joined.status).toBe(409);
+    expect(joined.json.text).toBe(
+      'There is already a max battle against it at an unlisted power spot. You have been marked as interested.',
+    );
+    const battle = asMax(map.made.store.active()[0]);
+    expect(battle.attendees[ALICE]?.status).toBe(PartyStatus.Interested);
+    expect(joined.json.max?.id).toBe(battle.id);
+  });
+
+  it('refuses another boss at the spot, naming the battle there and no post, uncounted', async () => {
+    const map = await reporting();
+    web = map.web;
+    await map.report({ spot: TEST_SPOT.id, boss: 'Machop' }, map.bob);
+    map.fill(MAX_THROTTLE.uses - 1);
+    const taken = await map.report({ spot: TEST_SPOT.id, boss: 'Machamp', tier: 'D3' });
+    expect(taken.status).toBe(409);
+    expect(taken.json).toMatchObject({
+      ok: false,
+      text:
+        'There is already a max battle against Dynamax Machop (2★) at Gazebo of the Park. ' +
+        'Open its post and use /boss there to change its boss.',
+      max: { title: 'Dynamax Machop (2★)' },
+    });
+    expect(map.made.store.active()).toHaveLength(1);
+    // Uncounted: the one use left still reports (here, joins), the next is refused.
+    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(409);
+    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(429);
+  });
+
+  it("refuses what /max's readers refuse in their words, uncounted", async () => {
+    const map = await reporting();
+    web = map.web;
+    const which = await map.report({ spot: TEST_SPOT.id, boss: 'Machamp' });
+    expect(which).toMatchObject({
+      status: 422,
+      json: { ok: false, text: MAP_WHICH_TIER, needs: 'tier' },
+    });
+    const gone = await map.report({ spot: 'deadbeef.16', boss: 'Machop' });
+    expect(gone.json.text).toBe('That place is gone from the list; pick it again.');
+    const outside = await map.report({ lat: 10, lon: 10, boss: 'Machop' });
+    expect(outside.json.text).toBe(
+      'That pin is not in a region of this server. Give a place in the regions here.',
+    );
+    map.clockAt(at('2026-10-22T21:05'));
+    const late = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
+    expect(late.json.text).toBe(
+      'Max battles are over for today: they can be fought from 06:00 to 21:00.',
+    );
+    expect(map.throttles.size).toBe(0);
+    expect(map.made.store.active()).toEqual([]);
+  });
+
+  it('refuses a member kept out of the forum the battle would be in, and says Discord is away, uncounted', async () => {
+    const map = await reporting();
+    web = map.web;
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    const barred = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
+    expect(barred).toMatchObject({ status: 403, json: { error: MAX_BARRED } });
+    map.made.gateway.barred.clear();
+    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
+    const away = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
+    expect(away).toMatchObject({ status: 503, json: { error: UNREACHABLE } });
+    expect(map.throttles.size).toBe(0);
+    expect(map.made.store.active()).toEqual([]);
+  });
+
+  it('asks which region of a spot that lies in several, and says where the battle went when the one picked has no forum', async () => {
+    const map = await reporting();
+    web = map.web;
+    // East reaches into West here, over the spot.
+    const east = map.made.regions.rows.find((region) => region.id === 2);
+    if (east?.bounds) {
+      east.bounds = east.bounds.map((corner) => ({
+        ...corner,
+        lon: corner.lon === -80 ? -80.05 : corner.lon,
+      }));
+    }
+    const asked = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
+    expect(asked).toMatchObject({
+      status: 422,
+      json: {
+        ok: false,
+        text: 'This place lies in several regions: pick the one to report the max battle in.',
+        regions: [
+          { id: 1, name: 'west' },
+          { id: 2, name: 'east' },
+        ],
+      },
+    });
+    expect(map.throttles.size).toBe(0);
+    if (east) east.forumChannelId = null;
+    const posted = await map.report({ spot: TEST_SPOT.id, boss: 'Machop', region: 2 });
+    expect(posted.status).toBe(200);
+    expect(posted.json.text).toBe(
+      'Reported: Dynamax Machop (2★) at Gazebo of the Park, until 9:00 PM. It was posted in #west.',
+    );
+    expect(map.made.gateway.postsIn(EAST_FORUM)).toEqual([]);
+  });
+
+  it('gives the use back when the bot may not make the post', async () => {
+    const map = await reporting();
+    web = map.web;
+    map.made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    // More than /max's window holds, none of them counted.
+    for (let n = 0; n <= MAX_THROTTLE.uses; n++) {
+      const refused = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
+      expect(refused.status).toBe(503);
+      expect(refused.json.text).toMatch(/^I am not allowed to make posts in /);
+    }
+    map.made.gateway.refusePosts.delete(WEST_FORUM);
+    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(200);
+  });
+
+  it("answers what only the report finds out in /max's words: no forum and no region counted, ended and a failure given back", async () => {
+    const map = await reporting();
+    web = map.web;
+    map.fill(MAX_THROTTLE.uses - 3);
+    const west = map.made.regions.rows.find((region) => region.id === 1);
+    if (west) west.forumChannelId = null;
+    const noForum = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
+    expect(noForum).toMatchObject({
+      status: 422,
+      json: {
+        ok: false,
+        text: 'The region #west has no raid forum yet. A moderator can create it with /admin setup-forums.',
+      },
+    });
+    if (west) west.forumChannelId = WEST_FORUM;
+    const reportMax = vi.spyOn(map.made.service, 'reportMax');
+    reportMax.mockResolvedValueOnce({ kind: 'no-region' });
+    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).json).toMatchObject({
+      ok: false,
+      text: 'Gazebo of the Park is not in any region of this server, so I have nowhere to post the battle.',
+    });
+    reportMax.mockResolvedValueOnce({ kind: 'ended' });
+    const ended = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
+    // The map's words for it: /max is no part of the map.
+    expect(ended).toMatchObject({ status: 422, json: { ok: false, text: MAP_MAX_ENDED } });
+    reportMax.mockRejectedValueOnce(new Error('the store failed'));
+    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(500);
+    reportMax.mockRestore();
+    // No forum and no region count, as for /max (a refusal after its throttle); ended and the
+    // failure were given back: one use is left.
+    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(200);
+    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(429);
+  });
+
+  it("refuses a spot whose region's outline no longer holds it, in the map's words", async () => {
+    const map = await reporting();
+    web = map.web;
+    // West's outline moved off the spot since the kept power spots were placed.
+    const west = map.made.regions.rows.find((region) => region.id === 1);
+    if (west?.bounds)
+      west.bounds = west.bounds.map((corner) => ({ ...corner, lat: corner.lat + 1 }));
+    const refused = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
+    expect(refused).toMatchObject({ status: 422, json: { ok: false, text: MAP_NOT_HERE } });
+    expect(MAP_NOT_HERE).toBe(
+      'That place is not in a region of this server. Pick a power spot on the map.',
+    );
+  });
+
+  it("counts in /max's window, shared with Discord", async () => {
+    const map = await reporting();
+    web = map.web;
+    for (let n = 0; n < MAX_THROTTLE.uses; n++) {
+      map.throttles.use(MAX_COMMAND, ALICE, MAX_THROTTLE, Date.now());
+    }
+    const refused = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
+    expect(refused.status).toBe(429);
+    expect(refused.json.error).toMatch(/^You can use \/max again in /);
+    expect(map.made.store.active()).toEqual([]);
+  });
+
+  it('refuses a body that is not a report, and more than 30 reports a minute from one address', async () => {
+    const map = await reporting();
+    web = map.web;
+    const malformed = [
+      {},
+      { boss: 'Machop' },
+      { spot: TEST_SPOT.id, ...PIN, boss: 'Machop' },
+      { lat: 40.05, boss: 'Machop' },
+      { spot: TEST_SPOT.id, boss: 'Machop', tier: 'T5' },
+      { spot: TEST_SPOT.id, boss: 'Machop', colour: 'red' },
+      { spot: TEST_SPOT.id, boss: 'Machop', end: '20', soon: { value: 'next', end: NINE } },
+    ];
+    for (const body of malformed) expect((await map.report(body)).status).toBe(400);
+    for (let n = malformed.length; n < 30; n++) {
+      expect((await map.report({ spot: 'deadbeef.16', boss: 'Machop' })).status).toBe(422);
+    }
+    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(429);
+  });
+});
+
+describe('the ending-soon question of a max battle on the map', () => {
+  let web: TestWeb | undefined;
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: at('2026-10-22T14:57') });
+  });
+  afterEach(async () => {
+    vi.useRealTimers();
+    await web?.app.close();
+    web = undefined;
+  });
+
+  const GIGA = { spot: TEST_SPOT.id, boss: 'Machamp', tier: 'G' };
+
+  it("asks what /max's dialog asks, uncounted, and reports the choice sent back, counted once", async () => {
+    const map = await reporting();
+    web = map.web;
+    map.clockAt(at('2026-10-22T14:57'));
+    map.fill(MAX_THROTTLE.uses - 1);
+    const asked = await map.report(GIGA);
+    expect(asked.status).toBe(422);
+    expect(asked.json).toEqual({
+      ok: false,
+      text: 'This max battle ends at 3:00 PM, in 3 minutes. Report it until the next rotation?',
+      soon: {
+        choices: [
+          { value: 'next', label: 'Until the next rotation, 4:00 PM', end: at('2026-10-22T16:00') },
+          { value: 'soon', label: 'Until 3:00 PM (in 3 minutes)', end: at('2026-10-22T15:00') },
+        ],
+      },
+    });
+    expect(map.made.store.active()).toEqual([]);
+    const reported = await map.report({
+      ...GIGA,
+      soon: { value: 'next', end: at('2026-10-22T16:00') },
+    });
+    expect(reported.status).toBe(200);
+    expect(reported.json.text).toBe(
+      'Reported: Gigantamax Machamp at Gazebo of the Park, until 4:00 PM.',
+    );
+    expect(map.made.store.active()[0]?.endTime).toBe(at('2026-10-22T16:00'));
+    // The question and the report sent again were one use: the window is full now.
+    const more = await map.report({ ...GIGA });
+    expect(more.status).toBe(429);
+  });
+
+  it('ignores the answer when a battle of the same boss came meanwhile: the report joins it', async () => {
+    const map = await reporting();
+    web = map.web;
+    map.clockAt(at('2026-10-22T14:57'));
+    const next = { value: 'next', end: at('2026-10-22T16:00') };
+    expect((await map.report(GIGA)).status).toBe(422);
+    expect((await map.report({ ...GIGA, soon: next }, map.bob)).status).toBe(200);
+    const joined = await map.report({ ...GIGA, soon: next });
+    expect(joined.status).toBe(409);
+    expect(joined.json.text).toMatch(/^There is already a max battle against it at Gazebo/);
+    expect(map.made.store.active()).toHaveLength(1);
+  });
+
+  it('asks again with the new choices when the end sent back is no longer offered, and refuses one that has passed', async () => {
+    const map = await reporting();
+    web = map.web;
+    map.clockAt(at('2026-10-22T14:57'));
+    map.fill(MAX_THROTTLE.uses - 1);
+    const stale = await map.report({
+      ...GIGA,
+      soon: { value: 'next', end: at('2026-10-22T15:30') },
+    });
+    expect(stale.status).toBe(422);
+    expect(stale.json.soon?.choices.map((choice) => choice.end)).toEqual([
+      at('2026-10-22T16:00'),
+      at('2026-10-22T15:00'),
+    ]);
+    map.clockAt(at('2026-10-22T15:00'));
+    const passed = await map.report({
+      ...GIGA,
+      soon: { value: 'soon', end: at('2026-10-22T15:00') },
+    });
+    expect(passed).toMatchObject({
+      status: 422,
+      json: { ok: false, text: 'That battle has ended meanwhile: nothing was reported.' },
+    });
+    expect(map.made.store.active()).toEqual([]);
+    // Neither was counted: the one use left reports, the next is refused.
+    expect((await map.report(GIGA)).status).toBe(200);
+    expect((await map.report(GIGA)).status).toBe(429);
+  });
+
+  it('asks only whether to report it where no later rotation is left, and never about a typed end or a battle to join', async () => {
+    const map = await reporting();
+    web = map.web;
+    map.clockAt(at('2026-10-22T20:57'));
+    const asked = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
+    expect(asked.json).toEqual({
+      ok: false,
+      text: 'This max battle ends at 9:00 PM, in 3 minutes. Report it anyway?',
+      soon: { choices: [{ value: 'soon', label: 'Until 9:00 PM (in 3 minutes)', end: NINE }] },
+    });
+    const typed = await map.report({ spot: TEST_SPOT.id, boss: 'Machop', end: '2' });
+    expect(typed.status).toBe(200);
+    const joined = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' }, map.bob);
+    expect(joined.status).toBe(409);
+    expect(joined.json.text).toMatch(/^There is already a max battle against it/);
+  });
+});
diff --git a/src/web/max-routes.ts b/src/web/max-routes.ts
index 451896fb1bdf3ee637048c37693bbbcc1b2eee13..08b525586e49799526e7b6287c7c7daee07111fa 100644
--- a/src/web/max-routes.ts
+++ b/src/web/max-routes.ts
@@ -1,15 +1,67 @@
-import type { FastifyInstance } from 'fastify';
+import type { FastifyInstance, FastifyReply } from 'fastify';
+import { z } from 'zod';
 import type { AppContext } from '../app-context.js';
-import type { MaxReading, SpotReading } from '../commands/max/max-input.js';
-import type { MaxReporting } from '../commands/max/max-report.js';
+import {
+  maxEndInput,
+  readMaxBoss,
+  reportedEnd,
+  spotAt,
+  WHICH_TIER,
+  type MaxReading,
+  type ReadMaxBoss,
+  type SpotReading,
+} from '../commands/max/max-input.js';
+import {
+  blockedAtPin,
+  ENDED_MEANWHILE,
+  MAX_BARRED,
+  MAX_COMMAND,
+  MAX_THROTTLE,
+  maxBarred,
+  maxReportWords,
+  otherBoss,
+  reportMaxAs,
+  takenWords,
+  type MaxAccess,
+  type MaxNames,
+  type MaxReportResult,
+  type MaxReporting,
+} from '../commands/max/max-report.js';
+import { mayJoinNoting } from '../commands/raids/report.js';
+import type { Region } from '../db/repositories/region-repository.js';
+import { UserError } from '../discord/errors.js';
+import type { MemberStanding } from '../discord/member-directory.js';
+import type { MaxParty, MaxSpot } from '../domain/party/party.js';
+import { MAX_TIERS } from '../domain/pogo/max-tier.js';
 import { maxBossPicture } from '../domain/pogo/pokemon-icons.js';
-import { MAX_MAP_SPOTS, type PowerSpotsView } from '../domain/web/max-data.js';
+import { endsSoon, nextRotationEnd } from '../domain/time/max-end.js';
+import {
+  MAX_MAP_SPOTS,
+  type MaxAnswer,
+  type MaxNeed,
+  type PowerSpotsView,
+} from '../domain/web/max-data.js';
+import type { MapMax } from '../domain/web/party-data.js';
+import { mapParty } from '../domain/web/party-view.js';
+import { ENDING_SOON, endingSoonQuestion, NEXT_ROTATION } from '../render/max-dialog.js';
 import { currentMaxBossChoices } from '../services/max-boss-service.js';
-import { memberOrFailure } from './acting.js';
+import type { MaxReportOutcome } from '../services/party-service.js';
+import { regionsAtPoint } from '../services/region-directory.js';
+import {
+  actingOnTheMap,
+  givenBackOnTheMap,
+  isMapBotStaff,
+  isMapStaff,
+  memberOrFailure,
+  throttledOnTheMap,
+  unreachableOnTheMap,
+} from './acting.js';
 import { sendFailure } from './answers.js';
+import { postGuard } from './csrf.js';
 import { etagMatches, etagOf } from './geo-cache.js';
 import type { GuildRequest } from './guild-routes.js';
 import { maxOptions } from './max-options.js';
+import { pageWords } from './page-words.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
 import { boxSchema, wayspotsInBox } from './wayspot-box.js';
@@ -39,16 +91,186 @@ const OPTIONS_PER_MINUTE = 30;
 /** The questions for the power spots in a box one address may ask in a minute (each pan). */
 const SPOTS_PER_MINUTE = 60;
 
+/** The reports of max battles one address may send in a minute, whoever sends them. */
+export const MAX_WRITES_PER_ADDRESS_MINUTE = 30;
+
+/** What a report answers for a place that lies in several regions without one picked. */
+export const SEVERAL_REGIONS_FOR_MAX =
+  'This place lies in several regions: pick the one to report the max battle in.';
+
+/**
+ * The body of a report: where (a power spot by its Wayfarer id, `spot`, or a point, `lat` and
+ * `lon`, kept to six decimals: the nearest power spot within 50 metres, else an unlisted power
+ * spot), the region when the place lies in several, the boss as `/max` takes it (a value of the
+ * pick list, or typed), its tier for a boss on no list, the end as `/max`'s `end:` takes it, and
+ * the answer to the ending-soon question (`soon`: a choice's value and the end it was offered
+ * with), never with a typed end. Anything else is malformed.
+ */
+const reportBodySchema = z
+  .object({
+    spot: z.string().min(1).max(60).optional(),
+    lat: z.number().min(-90).max(90).optional(),
+    lon: z.number().min(-180).max(180).optional(),
+    region: z.number().int().positive().optional(),
+    boss: z.string().trim().min(1).max(100),
+    tier: z.enum(MAX_TIERS).optional(),
+    end: z.string().max(40).optional(),
+    soon: z
+      .object({ value: z.enum([NEXT_ROTATION, ENDING_SOON]), end: z.number().int() })
+      .strict()
+      .optional(),
+  })
+  .strict()
+  .refine((body) => (body.lat === undefined) === (body.lon === undefined))
+  .refine((body) => (body.spot === undefined) !== (body.lat === undefined))
+  .refine((body) => body.soon === undefined || (body.end ?? '').trim() === '');
+
+/**
+ * What the map says where `/max` names itself or its options (plan 8X-5): the words of
+ * `WHICH_TIER` (the option `tier:`), `MAX_PIN_BLOCKED` and `NOT_HERE` (the list of power spots),
+ * `MAX_ENDED` (`/max` again) and the hint of `/boss` after another boss's battle (the post is not
+ * named on the map). `/max` keeps its own.
+ */
+export const MAP_WHICH_TIER = 'Which tier? Pick the tier of this boss.';
+export const MAP_PIN_BLOCKED =
+  'You are blocked from making meetups in this server, so you cannot report a max battle at an ' +
+  'unlisted power spot. Pick a power spot on the map.';
+export const MAP_MAX_ENDED = 'The max battle there has just ended: report it again.';
+/** After another boss's battle is named: what a member on the map can do about it. */
+export const MAP_BOSS_HINT = ' Open its post and use /boss there to change its boss.';
+/** `NOT_HERE` names `/max`'s list: a spot no region's outline holds any more, on the map. */
+export const MAP_NOT_HERE =
+  'That place is not in a region of this server. Pick a power spot on the map.';
+
+/** The status of each outcome of a report. */
+const REPORT_STATUS: Readonly<Record<MaxReportOutcome['kind'], number>> = {
+  created: 200,
+  exists: 409,
+  taken: 409,
+  ended: 422,
+  barred: 403,
+  'no-region': 422,
+  'no-forum': 422,
+  'no-post': 503,
+};
+
+/** A coordinate to six decimals (about 10 cm), as the map's pins and places are. */
+const sixDecimals = (value: number): number => Math.round(value * 1e6) / 1e6;
+
 /**
  * The max battles of the live map (plan 8X-5; design 7): the power spots of a box of the map
- * (`GET /s/<guild>/api/powerspots`), as `/api/stops` gives the PokéStops, and the pick lists of a
+ * (`GET /s/<guild>/api/powerspots`), as `/api/stops` gives the PokéStops; the pick lists of a
  * report (`GET /s/<guild>/api/max-options`, as `/max` lists its bosses), for members of the
- * server.
+ * server; and a report (`POST /s/<guild>/api/maxes`), which is `/max` as the member: the same
+ * readers, the same checks, the same report, the same throttle, the command's words, and its
+ * ending-soon question as an answer the page sends the report again with.
  */
 export function maxRoutes(scope: FastifyInstance, deps: WebDeps): void {
   const { sessions, parties, maxes } = deps;
   const { ctx } = maxes;
 
+  /** The words of a command as text of the page, in the posts' zone. */
+  const words = (text: string): string => pageWords(text, parties.zone, deps.now());
+
+  /** A region as an answer names it: its channel's name, or its number where the bot sees none. */
+  const regionName = (region: Pick<Region, 'id' | 'channelId'>): string =>
+    maxes.channelName(region.channelId) ?? `Region ${region.id}`;
+
+  /** A region in a sentence: `#west` as its channel reads, else `Region 5` (`regionName`). */
+  const regionInWords = (region: Pick<Region, 'id' | 'channelId'>): string =>
+    maxes.channelName(region.channelId) === undefined
+      ? regionName(region)
+      : `#${regionName(region)}`;
+
+  /**
+   * How the map's answers name a post (not at all: the page opens the battle) and a region, and
+   * say in the map's words what `/max` says by its own name.
+   */
+  const names: MaxNames = {
+    post: () => undefined,
+    channel: (channelId) => {
+      const region = ctx.regions.byChannel(channelId);
+      return region ? regionInWords(region) : `#${maxes.channelName(channelId) ?? 'unknown'}`;
+    },
+    ended: MAP_MAX_ENDED,
+    bossHint: MAP_BOSS_HINT,
+  };
+
+  /** `/max`'s check of a report's forums (`maxBarred`), on the map's deps. */
+  const access = (): MaxAccess => ({
+    partyService: ctx.partyService,
+    memberAccess: (forumId, memberId) => parties.forums.memberAccess(forumId, memberId),
+  });
+
+  /** A max battle as the member sees it on the map now (`mapParty`): none without its post yet. */
+  const viewOf = (
+    guildId: string,
+    guildRow: number,
+    party: MaxParty,
+    userId: string,
+    standing: MemberStanding,
+  ): MapMax | undefined => {
+    const shown = mapParty(party, {
+      guildId,
+      guildRow,
+      parties: [],
+      memberId: userId,
+      barred: new Set(),
+      now: deps.now(),
+      zone: parties.zone,
+      readOnly: false,
+      staff: isMapStaff(standing, userId, parties.ownerId),
+      botStaff: isMapBotStaff(standing, userId, parties.ownerId),
+      look: (raid) => parties.look(raid),
+      ...(parties.maxLook === undefined ? {} : { maxLook: parties.maxLook }),
+      pictureOrigins: deps.pictureOrigins,
+    });
+    return shown?.kind === 'max' ? shown : undefined;
+  };
+
+  /**
+   * The battle as the member sees it, when they are not kept out of its forum: the one a report
+   * made or joined, or the one of another boss that refused it. Asked of Discord unless it is in
+   * the forum the report would go to; none while Discord cannot say.
+   */
+  const shownTo = async (
+    guildId: string,
+    guildRow: number,
+    party: MaxParty,
+    userId: string,
+    standing: MemberStanding,
+    forum: string | null | undefined,
+  ): Promise<MapMax | undefined> => {
+    let shown = party.forumChannelId === forum;
+    if (!shown && party.forumChannelId !== null) {
+      try {
+        shown = (await parties.forums.memberAccess(party.forumChannelId, userId)) !== 'barred';
+      } catch {
+        shown = false;
+      }
+    }
+    return shown ? viewOf(guildId, guildRow, party, userId, standing) : undefined;
+  };
+
+  /**
+   * A refusal in the command's words, as text of the page, with the battle it names, if any, and
+   * what the page should ask for (`needs`).
+   */
+  const refuse = (
+    reply: FastifyReply,
+    status: number,
+    text: string,
+    more: { max?: MapMax | undefined; needs?: MaxNeed } = {},
+  ) => {
+    const answer: MaxAnswer = {
+      ok: false,
+      text: words(text),
+      ...(more.max ? { max: more.max } : {}),
+      ...(more.needs ? { needs: more.needs } : {}),
+    };
+    return reply.code(status).send(answer);
+  };
+
   // The power spots of a box of the map (plan 8X-5): members only (as the pick lists), those in a
   // region of this server with a title, the nearest to the box's middle first, at most
   // `MAX_MAP_SPOTS` (`more` says there were more: the page asks to zoom in).
@@ -112,4 +334,183 @@ export function maxRoutes(scope: FastifyInstance, deps: WebDeps): void {
       return reply.type('application/json; charset=utf-8').send(body);
     },
   );
+
+  // A report (plan 8X-5), as `/max` makes it: before the body is read (`onRequest`), at most
+  // `MAX_WRITES_PER_ADDRESS_MINUTE` from one address and the guard of every POST. Then the session
+  // (403) and the body (400), who reports (`actingOnTheMap`), the spot (`spotAt`, as `/max` names
+  // it), the region when the place lies in several (asked for with the regions), `/max`'s readers
+  // (the boss, the end), another boss at the spot (409, the battle named), a member blocked from
+  // meetups at a pin (403), the forums (`maxBarred`: barred 403, Discord away 503), and the
+  // ending-soon question (422 with its choices, `soon`; the page sends the report again with the
+  // one picked, decided anew); only then `/max`'s throttle in its window, so that a report refused
+  // for who reports, where or what is not counted; then `/max`'s report as the member
+  // (`reportMaxAs`), and the command's words.
+  const writeLimiter = new RateLimiter({ uses: MAX_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
+  const writeGuards = [
+    limitedPerAddress(writeLimiter, { now: deps.now }),
+    postGuard(sessions, deps.settings.publicUrl),
+  ];
+  scope.post('/api/maxes', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
+    void reply.header('cache-control', 'no-store');
+    const session = await sessions.of(request, reply);
+    if (!session) return sendFailure(request, reply, 403);
+    const body = reportBodySchema.safeParse(request.body ?? {});
+    if (!body.success) return sendFailure(request, reply, 400);
+    const { guild } = request.params;
+    const { userId } = session;
+    const doing = 'reported a max battle';
+    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
+    if ('sent' in acting) return acting.sent;
+    const { member, standing } = acting;
+    const where: { spot?: string; pin?: true } = {};
+    /**
+     * What came of the report, logged as a command is, a refusal too: the spot by its id once it
+     * is known, or that it is a pin; never a text or the point.
+     */
+    const noted = <T>(outcome: string, sent: T): T => {
+      deps.log.info(
+        { user: userId, guild, ...where, outcome },
+        'a max battle was reported on the map',
+      );
+      return sent;
+    };
+    const row = await parties.guilds.idFor(guild);
+    if (row === undefined) return noted('no-spot', sendFailure(request, reply, 404));
+    const now = deps.now();
+    let spot: MaxSpot;
+    try {
+      const { spot: id, lat, lon } = body.data;
+      spot =
+        id !== undefined
+          ? spotAt(ctx, row, { spot: id })
+          : spotAt(ctx, row, { lat: sixDecimals(lat ?? 0), lon: sixDecimals(lon ?? 0) });
+    } catch (err) {
+      if (!(err instanceof UserError)) throw err;
+      return noted('refused', refuse(reply, 422, err.message));
+    }
+    if (spot.kind === 'pin') where.pin = true;
+    else where.spot = spot.id;
+    const lying = regionsAtPoint(ctx.regions.all(), row, spot);
+    const [first] = lying;
+    const picked =
+      lying.length === 1 ? first : lying.find((region) => region.id === body.data.region);
+    // `spotAt` names only places in a region of this server; outlines changed meanwhile.
+    if (first === undefined) return noted('no-region', refuse(reply, 422, MAP_NOT_HERE));
+    if (picked === undefined) {
+      const ask: MaxAnswer = {
+        ok: false,
+        text: SEVERAL_REGIONS_FOR_MAX,
+        regions: lying.map((region) => ({ id: region.id, name: regionName(region) })),
+      };
+      return noted('several-regions', reply.code(422).send(ask));
+    }
+    const regionChannelId = picked.channelId;
+    let boss: ReadMaxBoss;
+    let end: number;
+    const typed = (body.data.end ?? '').trim();
+    try {
+      boss = readMaxBoss(ctx, body.data.boss, body.data.tier ?? null, now);
+      end = reportedEnd(ctx, boss.tier, typed === '' ? null : typed, now);
+    } catch (err) {
+      if (!(err instanceof UserError)) throw err;
+      // `/max`'s `tier:` option is no part of the map: its words, and what the page asks for.
+      if (err.message === WHICH_TIER) {
+        return noted('refused', refuse(reply, 422, MAP_WHICH_TIER, { needs: 'tier' }));
+      }
+      return noted('refused', refuse(reply, 422, err.message));
+    }
+    // The end the ending-soon question offered has passed meanwhile: as the dialog's Submit.
+    const { soon } = body.data;
+    if (soon !== undefined && soon.end <= now) {
+      return noted('refused', refuse(reply, 422, ENDED_MEANWHILE));
+    }
+    const there = ctx.parties.maxAt(row, spot, now);
+    if (there && otherBoss(there, boss)) {
+      const shown = await shownTo(guild, row, there, userId, standing, picked.forumChannelId);
+      const text = takenWords(ctx, there, boss.tier, names);
+      return noted('taken', refuse(reply, 409, text, { max: shown }));
+    }
+    // A new battle only: joining the one there is what its Join button does.
+    const staff = isMapStaff(standing, userId, parties.ownerId);
+    if (there === undefined && (await blockedAtPin(ctx, guild, userId, staff, spot))) {
+      return noted('blocked', refuse(reply, 403, MAP_PIN_BLOCKED, { needs: 'listed-spot' }));
+    }
+    try {
+      if (await maxBarred(access(), { spot, regionChannelId, joins: there }, userId)) {
+        return noted('barred', reply.code(403).send({ error: MAX_BARRED }));
+      }
+    } catch (err) {
+      return noted('unreachable', unreachableOnTheMap(deps, reply, err, guild, userId, doing));
+    }
+    // The ending-soon question, where `/max` opens its dialog: a new battle whose end, not typed,
+    // is less than five minutes away. Answered with its choices, uncounted (`/max` counts one use
+    // for the dialog and its Submit); the report sent again with a choice still offered now takes
+    // its end, one no longer offered is asked again.
+    if (there === undefined && typed === '' && endsSoon(end, now)) {
+      const next = nextRotationEnd(end, maxEndInput(ctx, boss.tier, now));
+      const question = endingSoonQuestion({ end, next, now, zone: parties.zone });
+      const chosen = question.choices.find(
+        (choice) => choice.value === soon?.value && choice.end === soon.end,
+      );
+      if (chosen === undefined) {
+        const ask: MaxAnswer = {
+          ok: false,
+          text: words(question.text),
+          soon: { choices: question.choices },
+        };
+        return noted('ends-soon', reply.code(422).send(ask));
+      }
+      end = chosen.end;
+    }
+    const counted = { command: MAX_COMMAND };
+    const throttled = throttledOnTheMap(deps, reply, counted, userId, MAX_THROTTLE);
+    if (throttled) return noted('throttled', throttled);
+    const countedAt = deps.now();
+    // A battle reported at the spot since the check above, in a forum it did not see, is asked
+    // about where the report would join it.
+    const joining = mayJoinNoting(access(), userId);
+    const ask = { boss, spot, end, regionChannelId };
+    let result: MaxReportResult;
+    try {
+      result = await reportMaxAs(ctx, member, guild, ask, joining.mayJoin);
+    } catch (err) {
+      // No fault of the member's (the store failed): the use is given back, as on Discord.
+      givenBackOnTheMap(deps, MAX_COMMAND, userId, MAX_THROTTLE, countedAt);
+      throw err;
+    }
+    const failed = joining.failure();
+    if (failed) {
+      return noted(
+        'unreachable',
+        unreachableOnTheMap(deps, reply, failed.err, guild, userId, doing),
+      );
+    }
+    const { outcome } = result;
+    // None of the member's doing (the bot may not make posts there, the battle there ended
+    // twice while the report waited): given back, as `/max` gives it back.
+    if (outcome.kind === 'no-post' || outcome.kind === 'ended') {
+      givenBackOnTheMap(deps, MAX_COMMAND, userId, MAX_THROTTLE, countedAt);
+    }
+    const battle =
+      outcome.kind === 'created' || outcome.kind === 'exists' || outcome.kind === 'taken'
+        ? outcome.party
+        : undefined;
+    const max =
+      battle && (await shownTo(guild, row, battle, userId, standing, picked.forumChannelId));
+    // The region picked has no forum: the battle went to another region of the spot, by name.
+    const postedIn =
+      outcome.kind === 'created' &&
+      outcome.party.regionId !== null &&
+      outcome.party.regionId !== picked.id
+        ? ctx.regions.byId(outcome.party.regionId)
+        : undefined;
+    const answer: MaxAnswer = {
+      ok: outcome.kind === 'created',
+      text:
+        words(maxReportWords(ctx, outcome, ask, result.autoStatus, names)) +
+        (postedIn ? ` It was posted in ${regionInWords(postedIn)}.` : ''),
+      ...(max ? { max } : {}),
+    };
+    return noted(outcome.kind, reply.code(REPORT_STATUS[outcome.kind]).send(answer));
+  });
 }
````

### Task 5: 8X-5 task 5: the Remote switch pressed on the map

Prototype commit: `5113ddffc0d2801e7b745b8c76784cd17eb7843b`

POST /s/<guild>/api/parties/<id>/remote toggles the member's Remote as the post's
button does (AttendanceService.setRemote with 'toggle', answered in remoteWords), for
any party whose post has Remote: a newcomer is signed up as interested and remote, an
elite raid is refused in the post's words. The same checks and order as every press,
then the window of the post's controls (ACTION_THROTTLE). Remote is no MapAction and
never in attendance.actions (the page draws a button of each action): its own constant,
MAP_REMOTE, and attendance.remote says whether it is offered and on. A body with a group
is malformed. PartyWebDeps.attendance gains setRemote.

**Files:**

```
 src/domain/web/party-data.ts |  7 +++++++
 src/web/party-press.test.ts  | 57 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/party-routes.ts      | 64 ++++++++++++++++++++++++++++++++++++++++++++++------------------
 test/support/web.ts          |  1 +
 4 files changed, 111 insertions(+), 18 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/party-press.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 5113ddffc0d2801e7b745b8c76784cd17eb7843b -- src/domain/web/party-data.ts src/web/party-press.test.ts src/web/party-routes.ts test/support/web.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-5 task 5: the Remote switch pressed on the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index c5ac9eede79ae118bf8545e373651e40d21f43b8..627c96f5d6c5655dad47ad3581dd60c05ebfffeb 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -9,6 +9,13 @@
 export const MAP_ACTIONS = ['interested', 'join', 'here', 'leave', 'done'] as const;
 export type MapAction = (typeof MAP_ACTIONS)[number];
 
+/**
+ * The post's Remote switch pressed on the map (plan 8X-5): `POST /s/<guild>/api/parties/<id>/
+ * remote`, no body, which toggles it as the post's button does. Not one of `MAP_ACTIONS`: those
+ * are the buttons of `MapAttendance.actions`; whether Remote is offered is `MapAttendance.remote`.
+ */
+export const MAP_REMOTE = 'remote';
+
 /**
  * A press of a button: with a group, the one a newcomer chose in the popup (`MapAttendance.pick`;
  * before plan 8X-1B, `join` with a group was "Join B").
diff --git a/src/web/party-press.test.ts b/src/web/party-press.test.ts
index 8762ccb30809954dfd71ebd16e6140466c908a99..13a9c1ba648c99f22c8a843c293032063c5e3639 100644
--- a/src/web/party-press.test.ts
+++ b/src/web/party-press.test.ts
@@ -6,6 +6,7 @@ import { FakeMemberDirectory } from '../../test/support/members.js';
 import { ALICE, BOB, PARTY_NOW } from '../../test/support/parties.js';
 import {
   createdMeetup,
+  createdTrain,
   partyServiceWith,
   reportedMax,
   reportedRaid,
@@ -147,6 +148,62 @@ describe('pressing the buttons of a party on the map', () => {
     expect(map.made.current().attendees[ALICE]).toMatchObject({ status: PartyStatus.Complete });
   });
 
+  // Plan 8X-5: the post's Remote switch, for every party whose post has it.
+  it("switches Remote as the post's button does: on, signing a newcomer up, and off again", async () => {
+    const map = await onTheMap(await reportedMax());
+    web = map.web;
+    const id = map.made.party.id;
+    const on = await map.post(press(id, 'remote'));
+    expect(on).toMatchObject({ status: 200, json: { ok: true } });
+    expect(on.json.text).toMatch(/remote/i);
+    expect(map.made.current().attendees[ALICE]).toMatchObject({
+      status: PartyStatus.Interested,
+      remote: true,
+      name: 'Alice',
+    });
+    const off = await map.post(press(id, 'remote'));
+    expect(off.json.text).toMatch(/in person/i);
+    expect(map.made.current().attendees[ALICE]?.remote).toBe(false);
+    expect(map.web.entries).toContainEqual(
+      expect.objectContaining({ msg: 'a party was pressed on the map', action: 'remote' }),
+    );
+  });
+
+  it("refuses Remote on an elite raid in the post's words, and a Remote with a group", async () => {
+    const map = await onTheMap(await reportedRaid({ tier: { level: 'Elite', shadow: false } }));
+    web = map.web;
+    const id = map.made.party.id;
+    const refused = await map.post(press(id, 'remote'));
+    expect(refused).toMatchObject({
+      status: 422,
+      json: { ok: false, text: 'Elite raids can only be done in person.' },
+    });
+    expect((await map.post(press(id, 'remote'), { group: 'A' })).status).toBe(400);
+  });
+
+  it('switches Remote on a meetup and a train too, as their posts offer it', async () => {
+    for (const made of [await createdMeetup(), await createdTrain()]) {
+      const map = await onTheMap(made);
+      web = map.web;
+      const on = await map.post(press(made.party.id, 'remote'));
+      expect(on).toMatchObject({ status: 200, json: { ok: true } });
+      expect(made.store.get(made.party.id)?.attendees[ALICE]).toMatchObject({ remote: true });
+      await web.app.close();
+      web = undefined;
+    }
+  });
+
+  it('counts Remote against the limit of the buttons of the post', async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < ACTION_THROTTLE.uses; n++) {
+      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
+    }
+    const map = await onTheMap(await reportedRaid(), throttles);
+    web = map.web;
+    expect((await map.post(press(map.made.party.id, 'remote'))).status).toBe(429);
+    expect(map.made.current().attendees[ALICE]).toBeUndefined();
+  });
+
   it("answers Done on an egg with the post's refusal", async () => {
     const map = await onTheMap(await reportedRaid());
     web = map.web;
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index b692c0e3cd82d095a75c886ed93be97e399a9e76..fb15838f4ddf4d86bd64b0dadd881b2886295da0 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -5,6 +5,8 @@ import {
   outcomeWords,
   partyOver,
   pressStatus,
+  remoteWords,
+  type PressAnswerer,
   type StatusPress,
 } from '../commands/parties/reply.js';
 import type { MemberStanding } from '../discord/member-directory.js';
@@ -17,7 +19,12 @@ import {
   type Party,
   type RaidParty,
 } from '../domain/party/party.js';
-import { MAP_ACTIONS, type MapAction, type PressAnswer } from '../domain/web/party-data.js';
+import {
+  MAP_ACTIONS,
+  MAP_REMOTE,
+  type MapAction,
+  type PressAnswer,
+} from '../domain/web/party-data.js';
 import {
   partyView,
   type MaxLook,
@@ -83,7 +90,7 @@ export interface PartyWebDeps {
   /** What a press does: what the post's buttons call (`pressStatus`). */
   attendance: Pick<
     AttendanceService,
-    'signUp' | 'joinInto' | 'joinChosen' | 'done' | 'leave' | 'limits' | 'lobbyOf'
+    'signUp' | 'joinInto' | 'joinChosen' | 'done' | 'leave' | 'setRemote' | 'limits' | 'lobbyOf'
   >;
   /** Who presses, fetched fresh from Discord as a button carries them (`DiscordWebMembers`). */
   acting: ActingMembers;
@@ -131,6 +138,9 @@ const pressBodySchema = z
   })
   .strict();
 
+/** What a press says: whether it was done, and the words. */
+type Said = { ok: boolean; text: string };
+
 /** The status of each outcome of a press. */
 const PRESS_STATUS: Readonly<Record<AttendanceOutcome['kind'], number>> = {
   ok: 200,
@@ -249,10 +259,12 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
   // `mapMembers`), the member as Discord has them now (also by that role), the party in the store
   // and of this server, how they stand to its forum, and only then
   // the member's `ACTION_THROTTLE` in the window of the post's controls; then the press as the
-  // post's button makes it (`pressStatus`).
+  // post's button makes it (`pressStatus`; the Remote switch, `MAP_REMOTE`, as the post's Remote
+  // button toggles it, plan 8X-5).
   const addressLimiter = new RateLimiter({ uses: PRESSES_PER_ADDRESS_MINUTE, perMs: 60_000 });
   const knownAction = async (request: PressRequest, reply: FastifyReply) => {
-    if (!isMapAction(request.params.action)) return sendFailure(request, reply, 404);
+    const { action } = request.params;
+    if (!isMapAction(action) && action !== MAP_REMOTE) return sendFailure(request, reply, 404);
   };
   scope.post(
     '/api/parties/:party/:action',
@@ -269,13 +281,18 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
       if (!session) return sendFailure(request, reply, 403);
       const { guild, party: partyId, action } = request.params;
       const body = pressBodySchema.safeParse(request.body ?? {});
-      if (!isMapAction(action) || !body.success) return sendFailure(request, reply, 400);
+      const remote = action === MAP_REMOTE;
+      if ((!remote && !isMapAction(action)) || !body.success) {
+        return sendFailure(request, reply, 400);
+      }
       const { group } = body.data;
       const takesGroup = action === 'join' || action === 'interested' || action === 'here';
       if (group !== undefined && (!takesGroup || !isGroupId(group))) {
         return sendFailure(request, reply, 400);
       }
-      const press = statusPress(action, group);
+      // The Remote switch (plan 8X-5), or a button of `MAP_ACTIONS` as the post's `StatusPress`.
+      const press = isMapAction(action) ? statusPress(action, group) : undefined;
+      const raidAction = press !== undefined && isRaidAction(press.action);
       const { userId } = session;
       const doing = 'pressed a button of a party';
       // Whoever is no member, by the directory or fresh, learns nothing of the party.
@@ -286,7 +303,7 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
       const own = await ownParties(guild);
       const party = parties.store.get(partyId);
       if (party?.guildId !== own.row || party.status !== 'active') {
-        const over = isRaidAction(press.action) ? ({ type: 'raid' } as const) : undefined;
+        const over = raidAction ? ({ type: 'raid' } as const) : undefined;
         const gone: PressAnswer = { ok: false, text: partyOver(over) };
         return reply.code(PRESS_STATUS.gone).send(gone);
       }
@@ -308,17 +325,28 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
       const counted = { control: PARTY_KIND };
       const throttled = throttledOnTheMap(deps, reply, counted, userId, ACTION_THROTTLE);
       if (throttled) return throttled;
-      const { kind, said } = await countedOnTheMap(deps, counted, userId, ACTION_THROTTLE, () =>
-        pressStatus(parties.attendance, partyId, member, press, (outcome, words) => {
-          // As `answerClick` names the party: as the store has it now, or by the button.
-          const now = parties.store.get(partyId);
-          const named =
-            now ?? (isRaidAction(press.action) ? ({ type: 'raid' } as const) : undefined);
-          return Promise.resolve({
-            kind: outcome.kind,
-            said: outcomeWords(parties.attendance.limits(), named, outcome, words),
-          });
-        }),
+      const answered: PressAnswerer<{ kind: AttendanceOutcome['kind']; said: Said }> = (
+        outcome,
+        words,
+      ) => {
+        // As `answerClick` names the party: as the store has it now, or by the button.
+        const now = parties.store.get(partyId);
+        const named = now ?? (raidAction ? ({ type: 'raid' } as const) : undefined);
+        return Promise.resolve({
+          kind: outcome.kind,
+          said: outcomeWords(parties.attendance.limits(), named, outcome, words),
+        });
+      };
+      const { kind, said } = await countedOnTheMap(
+        deps,
+        counted,
+        userId,
+        ACTION_THROTTLE,
+        async () =>
+          press === undefined
+            ? // The post's Remote button (`partyButtons`): toggled, "in person" said when off.
+              answered(await parties.attendance.setRemote(partyId, member, 'toggle'), remoteWords)
+            : pressStatus(parties.attendance, partyId, member, press, answered),
       );
       deps.log.info(
         { user: userId, guild, party: partyId, action, outcome: kind },
diff --git a/test/support/web.ts b/test/support/web.ts
index 4894898e0929802f2adec074e2cf8d82f75c8e46..fc4aa114a7aeced69fe1181a512f0628168efc05 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -233,6 +233,7 @@ const NO_PARTIES: PartyWebDeps = {
     joinChosen: noAttendance,
     done: noAttendance,
     leave: noAttendance,
+    setRemote: noAttendance,
     limits: () => {
       throw new Error('no parties in this test: give partyWebWith');
     },
````

### Task 6: 8X-5 task 6: train kinds on the map

Prototype commit: `337ab906afde163f9e3f17c977410ad5857b6cc0`

POST /s/<guild>/api/trains takes kind (as /train kind:, a raid train without one), and
POST /s/<guild>/api/trains/<id>/move/kind, body { kind }, sets it as the Manage train
panel's menu does (setKindAs over TrainService.setKind: who may move the train and staff,
refused as the panel refuses, in the window of the post's controls), also for a train
planned ahead without a route. MapTrain says its kind and the words for it (trainKind,
trainKindWords: kind is taken, it says the party is a train), and MapTrainRights.kind
whether the member may set it, while panel stays null for a train without a route.
TRAIN_KIND_WORDS lives in src/domain/web/party-data.ts, where a page and the pure view
may take it; the renderer's train-words gives it on. The page's test fixtures gain the
fields.

**Files:**

```
 src/commands/trains/train-changes.ts     | 17 ++++++++++-
 src/domain/web/party-data.ts             | 31 +++++++++++++++++--
 src/domain/web/party-view.test.ts        | 42 +++++++++++++++++++++----
 src/domain/web/party-view.ts             | 10 ++++--
 src/domain/web/train-data.test.ts        | 12 ++++++++
 src/domain/web/train-data.ts             | 18 +++++++++--
 src/render/train-words.ts                | 16 +++++-----
 src/web/client/parties.test.ts           |  4 ++-
 src/web/client/train-forms.test.ts       | 10 +++---
 src/web/client/train-ui.isolated.test.ts |  4 ++-
 src/web/train-move.test.ts               | 86 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/train-routes.ts                  | 60 ++++++++++++++++++++++++++----------
 src/web/train-start.test.ts              | 24 +++++++++++++++
 13 files changed, 291 insertions(+), 43 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/domain/web/train-data.test.ts src/web/client/parties.test.ts src/web/client/train-forms.test.ts src/web/client/train-ui.isolated.test.ts src/web/train-move.test.ts src/web/train-start.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 337ab906afde163f9e3f17c977410ad5857b6cc0 -- src/commands/trains/train-changes.ts src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/domain/web/train-data.test.ts src/domain/web/train-data.ts src/render/train-words.ts src/web/client/parties.test.ts src/web/client/train-forms.test.ts src/web/client/train-ui.isolated.test.ts src/web/train-move.test.ts src/web/train-routes.ts src/web/train-start.test.ts` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-5 task 6: train kinds on the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/trains/train-changes.ts b/src/commands/trains/train-changes.ts
index 45a0da304d9221bf414db5c0ad2631423cefc5d8..8e0eb7e347c2eda22455f2f16c5b00641bb1d0c8 100644
--- a/src/commands/trains/train-changes.ts
+++ b/src/commands/trains/train-changes.ts
@@ -22,7 +22,7 @@ import { stopInWords, stopsFrom } from '../../render/train-stops.js';
 import { count, memberText, plain } from '../../render/text.js';
 import { whereText } from '../../render/train-panel.js';
 import type { TrainPlaces } from '../../render/train-post.js';
-import { atEndSentence } from '../../render/train-words.js';
+import { atEndSentence, trainKindSentence } from '../../render/train-words.js';
 import type { Member } from '../../services/attendance-service.js';
 import type { TrainOutcome } from '../../services/party-service.js';
 import type { TrainChangeOutcome } from '../../services/train-service.js';
@@ -427,6 +427,21 @@ export async function setAtEndAs(
   return answerOf(ctx, outcome, (ok) => atEndSentence(ok.party.train.atEnd));
 }
 
+/**
+ * Sets what kind of battles the train goes to as the kind menu of the Manage train panel does
+ * (`TrainService.setKind`), and says it: the map's panel (plan 8X-5).
+ */
+export async function setKindAs(
+  ctx: TrainChanging,
+  party: TrainParty,
+  member: Member,
+  staff: boolean,
+  kind: TrainKind,
+): Promise<TrainAnswer> {
+  const outcome = await ctx.trains.setKind(party.id, member, staff, kind);
+  return answerOf(ctx, outcome, (ok) => trainKindSentence(ok.party.train.kind));
+}
+
 /** What splitting a group off needs: the train service, the members' privacy, the words. */
 export type TrainSplitting = Pick<AppContext, 'trains' | 'attendance' | 'users' | 'parties'>;
 
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 627c96f5d6c5655dad47ad3581dd60c05ebfffeb..34ce504609491c219304c21ae1e70621c09a25bf 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -114,10 +114,32 @@ export interface MapRaid {
   attendance: MapAttendance;
 }
 
+/** What kind of battles a train goes to, as `TrainKind` spells it (plan 8X-4). */
+export type MapTrainKind = 'raid' | 'dynamax' | 'gigantamax';
+
+/**
+ * What a train of each kind is called (plan 8X-4; design 6.1), worded once for every place that
+ * names it: the heading of its post and its brief, `/train`'s choices, the panel's menu, `/help`,
+ * the news of a new train, and the map (`MapTrain.trainKindWords`, plan 8X-5). Here, without an
+ * import, so that a page may take it; the renderer's `train-words.ts` gives it on.
+ */
+export const TRAIN_KIND_WORDS: Readonly<Record<MapTrainKind, string>> = {
+  raid: 'Raid Train',
+  dynamax: 'Max Battle Train',
+  gigantamax: 'Gigantamax Train',
+};
+
 export interface MapTrain {
   kind: 'train';
   id: string;
   name: string;
+  /**
+   * What kind of battles it goes to (plan 8X-5; `/train kind:`, the panel's menu), and the
+   * train's name for it (`TRAIN_KIND_WORDS`): `Max Battle Train`. Not `kind`, which says that
+   * the party is a train.
+   */
+  trainKind: MapTrainKind;
+  trainKindWords: string;
   startTime: number | null;
   /**
    * The stops of its route, in order, by their keys (plan 8X-4, `stopKey`): a gym as its id
@@ -140,7 +162,7 @@ export interface MapTrain {
    * What the member may do to its route on the map (plan 8M-5), as the commands decide it; all
    * false while read-only. `arrange`: add, remove and move stops (signed up, the maker, staff);
    * `clear`: empty the route (the conductor, staff); `load`: put a saved route into it (who may
-   * move the train, or the maker its first route).
+   * move the train, or the maker its first route); `kind`: set its kind (plan 8X-5).
    */
   may: MapTrainRights;
   /**
@@ -161,11 +183,16 @@ export interface MapTrainSpot {
   lon: number;
 }
 
-/** What a member may do to a train on the map (`MapTrain.may`). */
+/**
+ * What a member may do to a train on the map (`MapTrain.may`); `kind`: set what it goes to
+ * (plan 8X-5), as the panel's menu, for who may move it and staff (`mayNotMove`), also before it
+ * has a route (when `panel` is null).
+ */
 export interface MapTrainRights {
   arrange: boolean;
   clear: boolean;
   load: boolean;
+  kind: boolean;
 }
 
 /** What a train does at the last stop of its route, as `/train`'s option `at-end` takes it. */
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index b159787bee602380a69f53186daca5d23726a1da..64505c800d1dd7962dcd44589912466ab7ce7390 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -328,6 +328,8 @@ describe('partyView', () => {
         id: train.id,
         name: 'Saturday legendaries',
         startTime: at('2026-10-13T15:00'),
+        trainKind: 'raid',
+        trainKindWords: 'Raid Train',
         route: ['1', '2', '3'],
         spots: [],
         stop: 1,
@@ -338,8 +340,8 @@ describe('partyView', () => {
           actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
           remote: { offered: true, on: false },
         },
-        // The member is not signed up: nothing of the route is theirs to change.
-        may: { arrange: false, clear: false, load: false },
+        // The member is not signed up: nothing of the route, nor its kind, is theirs to change.
+        may: { arrange: false, clear: false, load: false, kind: false },
         panel: null,
         conductor: { who: null, mayTake: false, mayDrop: false },
       },
@@ -507,38 +509,66 @@ describe('trainRights', () => {
 
   it('lets who may arrange the route arrange it, the conductor and staff clear it, and who may move it load one', () => {
     const train = withAttendees(route(), { [ALICE]: { status: PartyStatus.Coming } });
-    expect(trainRights(train, input([]))).toEqual({ arrange: true, clear: false, load: true });
+    expect(trainRights(train, input([]))).toEqual({
+      arrange: true,
+      clear: false,
+      load: true,
+      kind: true,
+    });
     expect(trainRights(train, input([], { memberId: BOB }))).toEqual({
       arrange: false,
       clear: false,
       load: false,
+      kind: false,
     });
     const conducted = { ...train, train: { ...train.train, conductorId: BOB } };
-    expect(trainRights(conducted, input([]))).toEqual({ arrange: true, clear: false, load: false });
+    expect(trainRights(conducted, input([]))).toEqual({
+      arrange: true,
+      clear: false,
+      load: false,
+      kind: false,
+    });
     expect(trainRights(train, input([], { memberId: CAROL, staff: true }))).toEqual({
       arrange: true,
       clear: true,
       load: true,
+      kind: true,
     });
     // A bot developer clears a route, as `/route clear` lets them; nothing else.
     expect(trainRights(train, input([], { memberId: CAROL, botStaff: true }))).toEqual({
       arrange: false,
       clear: true,
       load: false,
+      kind: false,
     });
   });
 
   it('lets the maker who is not signed up give the train its first route, and nothing while read-only', () => {
     const empty = testTrain({ autoStatus: PartyStatus.NotInterested });
     const maker = input([], { memberId: REPORTER });
-    expect(trainRights(empty, maker)).toEqual({ arrange: true, clear: false, load: true });
-    expect(trainRights(route(empty), maker)).toEqual({ arrange: true, clear: false, load: false });
+    expect(trainRights(empty, maker)).toEqual({
+      arrange: true,
+      clear: false,
+      load: true,
+      kind: false,
+    });
+    expect(trainRights(route(empty), maker)).toEqual({
+      arrange: true,
+      clear: false,
+      load: false,
+      kind: false,
+    });
     const signedUp = withAttendees(route(), { [ALICE]: { status: PartyStatus.Coming } });
     expect(trainRights(signedUp, input([], { readOnly: true, staff: true }))).toEqual({
       arrange: false,
       clear: false,
       load: false,
+      kind: false,
     });
+    // Plan 8X-5: the kind of a train planned ahead, before it has a route, as the post's panel.
+    const planned = withAttendees(testTrain(), { [ALICE]: { status: PartyStatus.Coming } });
+    expect(trainRights(planned, input([])).kind).toBe(true);
+    expect(trainPanelOf(planned, input([]))).toBeNull();
   });
 });
 
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index b782401c6f58e5400bdca17776f6a2a27a80c059..44b86eb83199ffbec1d02a5f0f54adf3927dcb28 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -50,6 +50,7 @@ import type {
   MapTrainRights,
   PartiesView,
 } from './party-data.js';
+import { TRAIN_KIND_WORDS } from './party-data.js';
 
 export type * from './party-data.js';
 
@@ -279,15 +280,18 @@ function maxOf(party: MaxParty, link: string, input: PartyViewInput): MapMax | n
 
 /**
  * What the member may do to a train's route on the map (spec 3.7), as the commands decide it
- * (`mayNotArrange`, `mayNotClear`, `mayNotLoad`); nothing while read-only.
+ * (`mayNotArrange`, `mayNotClear`, `mayNotLoad`), and to its kind (plan 8X-5, `mayNotMove`, as
+ * the panel's menu); nothing while read-only.
  */
 export function trainRights(party: TrainParty, input: PartyViewInput): MapTrainRights {
-  if (input.readOnly) return { arrange: false, clear: false, load: false };
+  if (input.readOnly) return { arrange: false, clear: false, load: false, kind: false };
   const { memberId, staff } = input;
   return {
     arrange: mayNotArrange(party, memberId, staff) === undefined,
     clear: mayNotClear(party, memberId, input.botStaff ?? staff) === undefined,
     load: mayNotLoad(party, memberId, staff) === undefined,
+    // As the panel's kind menu (plan 8X-4), also for a train without a route yet.
+    kind: mayNotMove(party, memberId, staff) === undefined,
   };
 }
 
@@ -335,6 +339,8 @@ function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTra
     kind: 'train',
     id: party.id,
     name: party.timed.name,
+    trainKind: party.train.kind,
+    trainKindWords: TRAIN_KIND_WORDS[party.train.kind],
     startTime: party.timed.startTime,
     route: route.map(stopKey),
     spots: route.flatMap((ref) => {
diff --git a/src/domain/web/train-data.test.ts b/src/domain/web/train-data.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e4d9226d970586849d5831c009de21721d696a4f
--- /dev/null
+++ b/src/domain/web/train-data.test.ts
@@ -0,0 +1,12 @@
+import { describe, expect, it } from 'vitest';
+import { TRAIN_KINDS } from '../party/party.js';
+import { TRAIN_KIND_WORDS } from './party-data.js';
+import { MAP_TRAIN_KINDS } from './train-data.js';
+
+// The page's copy of the kinds has no import of the server's code: kept to the domain's here.
+describe('the train kinds a page reads (plan 8X-5)', () => {
+  it('are the kinds of trains, in the order /train kind: offers them, each with its words', () => {
+    expect(MAP_TRAIN_KINDS).toEqual(TRAIN_KINDS);
+    expect(Object.keys(TRAIN_KIND_WORDS)).toEqual([...TRAIN_KINDS]);
+  });
+});
diff --git a/src/domain/web/train-data.ts b/src/domain/web/train-data.ts
index 43b48fb81c86213e3652b4ffdffc36f2499e269c..50a36cc5d84ea4790d4304d689ca54a038c4245e 100644
--- a/src/domain/web/train-data.ts
+++ b/src/domain/web/train-data.ts
@@ -4,9 +4,19 @@
  * takes them.
  */
 
-import type { MapAtEnd, MapTrain } from './party-data.js';
+import type { MapAtEnd, MapTrain, MapTrainKind } from './party-data.js';
 
-export type { MapAtEnd };
+export type { MapAtEnd, MapTrainKind };
+
+/** The kinds of train, in the order `/train kind:` and the panel's menu offer them (plan 8X-5). */
+export const MAP_TRAIN_KINDS: readonly MapTrainKind[] = ['raid', 'dynamax', 'gigantamax'];
+
+/**
+ * The kind menu of the Manage train panel on the map (plan 8X-5): `POST /s/<guild>/api/trains/<id>
+ * /move/kind`, body `{ kind }`, as the post's menu sets it (for who may move the train and staff,
+ * `MapTrainRights.kind`; also without a route). Not one of `PANEL_PRESSES`, the panel's buttons.
+ */
+export const KIND_PRESS = 'kind';
 
 /** What a train may do at the last stop of its route, in the order `/train` offers them. */
 export const MAP_AT_ENDS: readonly MapAtEnd[] = ['finish', 'loop', 'turn-back'];
@@ -71,11 +81,13 @@ export interface SavedRoutesView {
 /**
  * The body of a new train (`POST /s/<guild>/api/trains`): the region it is made in (any region
  * of the server, by id as `/api/geo` lists it), its name, when it starts as `/meet` takes it (a
- * clock time, a date and a time, or `in 30`), and what it does at the end of its route.
+ * clock time, a date and a time, or `in 30`), what it does at the end of its route, and its kind.
  */
 export interface TrainStartBody {
   region: number;
   name: string;
   time?: string;
   atEnd?: MapAtEnd;
+  /** What it goes to (plan 8X-5, as `/train kind:`); left out: raids. */
+  kind?: MapTrainKind;
 }
diff --git a/src/render/train-words.ts b/src/render/train-words.ts
index a05f93342d341b3e07a01e97b5687ffba7b78a24..151c093df6425923ab2632e5cb850b46e5feb705 100644
--- a/src/render/train-words.ts
+++ b/src/render/train-words.ts
@@ -1,15 +1,17 @@
 import type { TrainAtEnd, TrainKind } from '../domain/party/party.js';
+import { TRAIN_KIND_WORDS } from '../domain/web/party-data.js';
 
 /**
  * What a train of each kind is called (plan 8X-4; design 6.1), worded once for every place that
- * names it: the heading of its post and its brief, `/train`'s choices, the panel's menu, `/help`
- * and the news of a new train.
+ * names it, the map's data among them (plan 8X-5: kept in `src/domain/web/party-data.ts`, which a
+ * page may take).
  */
-export const TRAIN_KIND_WORDS: Readonly<Record<TrainKind, string>> = {
-  raid: 'Raid Train',
-  dynamax: 'Max Battle Train',
-  gigantamax: 'Gigantamax Train',
-};
+export { TRAIN_KIND_WORDS };
+
+/** What setting the kind on the map answers (plan 8X-5): `This train is a Gigantamax Train now.` */
+export function trainKindSentence(kind: TrainKind): string {
+  return `This train is a ${TRAIN_KIND_WORDS[kind]} now.`;
+}
 
 /** What each kind goes to, after its name in a choice: `Max Battle Train: Dynamax battles`. */
 export const TRAIN_KIND_GOES_TO: Readonly<Record<TrainKind, string>> = {
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index f077e90ce6cc374e2ebd9da636938558a76e781a..0fa186a6571fa50ecac992cfb21e18319ae8216b 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -403,6 +403,8 @@ describe('trainPopup and meetupItem', () => {
   it('show where the train is on its route, and when a meetup is', () => {
     const train: MapTrain = {
       kind: 'train',
+      trainKind: 'raid',
+      trainKindWords: 'Raid Train',
       id: 't1',
       name: 'Saturday <b>legendaries</b>',
       startTime: NOW + 60 * MINUTE,
@@ -411,7 +413,7 @@ describe('trainPopup and meetupItem', () => {
       stop: 1,
       link: LINK,
       attendance: attendance({ actions: [] }),
-      may: { arrange: false, clear: false, load: false },
+      may: { arrange: false, clear: false, load: false, kind: false },
       panel: null,
       conductor: { who: null, mayTake: false, mayDrop: false },
     };
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index 8927b26fc32631aecac7062c0957b94ea5699b49..89800bdc56cfe4b77cb41b8a3346856aee0892ba 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -46,6 +46,8 @@ const gym = (id: number) => GYMS.get(id);
 
 const train = (more: Partial<MapTrain> = {}): MapTrain => ({
   kind: 'train',
+  trainKind: 'raid',
+  trainKindWords: 'Raid Train',
   id: 't1',
   name: 'Saturday legendaries',
   startTime: null,
@@ -59,7 +61,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
     actions: [],
     remote: { offered: false, on: false },
   },
-  may: { arrange: true, clear: false, load: true },
+  may: { arrange: true, clear: false, load: true, kind: false },
   panel: {
     place: '1',
     moves: [
@@ -179,7 +181,7 @@ describe("a train's actions in its popup (trainActions)", () => {
 
   it('offers nothing to who may do nothing of it', () => {
     const watching = train({
-      may: { arrange: false, clear: false, load: false },
+      may: { arrange: false, clear: false, load: false, kind: false },
       panel: null,
       conductor: { who: 'other', mayTake: false, mayDrop: false },
     });
@@ -326,7 +328,7 @@ describe('route mode (routeEditor, routeMarkers, routeEditBody)', () => {
 
   it('leaves the stops without their buttons for who may no longer arrange the route', () => {
     const editor = routeEditor(
-      train({ may: { arrange: false, clear: false, load: false } }),
+      train({ may: { arrange: false, clear: false, load: false, kind: false } }),
       gym,
       [],
     );
@@ -350,7 +352,7 @@ describe('route mode (routeEditor, routeMarkers, routeEditBody)', () => {
 
   it('offers Clear to who may clear, and Load only to who may load', () => {
     const leading = routeEditor(
-      train({ may: { arrange: true, clear: true, load: false } }),
+      train({ may: { arrange: true, clear: true, load: false, kind: false } }),
       gym,
       [],
     );
diff --git a/src/web/client/train-ui.isolated.test.ts b/src/web/client/train-ui.isolated.test.ts
index 76876899bde3755ced20650a2bed00f3bf4db6c2..a8ce6d5cd52659437c104644f2d09fa8c7b0842e 100644
--- a/src/web/client/train-ui.isolated.test.ts
+++ b/src/web/client/train-ui.isolated.test.ts
@@ -240,6 +240,8 @@ const GYMS = new Map([
 
 const train = (more: Partial<MapTrain> = {}): MapTrain => ({
   kind: 'train',
+  trainKind: 'raid',
+  trainKindWords: 'Raid Train',
   id: 't1',
   name: 'Saturday legendaries',
   startTime: null,
@@ -253,7 +255,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
     actions: [],
     remote: { offered: false, on: false },
   },
-  may: { arrange: true, clear: false, load: true },
+  may: { arrange: true, clear: false, load: true, kind: false },
   panel: {
     place: '1',
     moves: [
diff --git a/src/web/train-move.test.ts b/src/web/train-move.test.ts
index 94df433c026373e23b87a50e84fe369beb311001..564a5aa4ada433a7184af48638744a5becbc0cfd 100644
--- a/src/web/train-move.test.ts
+++ b/src/web/train-move.test.ts
@@ -195,6 +195,92 @@ describe('moving a train on the map', () => {
     expect(map.made.current().train).toMatchObject({ route: stops(7, 1, 4), atEnd: 'loop' });
   });
 
+  // Plan 8X-5: the panel's kind menu (8X-4), as the post's panel sets it.
+  it("sets the train's kind as the panel's menu does, for who may move it, in the window of the post's controls", async () => {
+    const throttles = new Throttles();
+    const map = await moving({ throttles });
+    web = map.web;
+    expect(await map.listed(ALICE, 'Alice')).toMatchObject({
+      trainKind: 'raid',
+      trainKindWords: 'Raid Train',
+      may: { kind: true },
+    });
+    const set = await map.move('kind', { kind: 'gigantamax' });
+    expect(set.status).toBe(200);
+    expect(set.json).toMatchObject({
+      ok: true,
+      text: 'This train is a Gigantamax Train now.',
+      train: { trainKind: 'gigantamax', trainKindWords: 'Gigantamax Train' },
+    });
+    expect(map.made.current().train.kind).toBe('gigantamax');
+    expect(await map.lines()).toContain(
+      '**Alice** (<@' + ALICE + '>) made this a Gigantamax Train.',
+    );
+    expect(throttles.size).toBe(1);
+    // Logged as a kind set, not as a move: who, where, which train, what.
+    expect(map.web.entries).toContainEqual(
+      expect.objectContaining({
+        msg: "a train's kind was set on the map",
+        user: ALICE,
+        party: map.made.party.id,
+        kind: 'gigantamax',
+        outcome: 'ok',
+      }),
+    );
+    const bob = await map.web.posting(BOB, 'Bob');
+    expect((await map.listed(BOB, 'Bob'))?.may.kind).toBe(false);
+    const refused = await map.move('kind', { kind: 'raid' }, bob);
+    expect(refused).toMatchObject({
+      status: 403,
+      json: {
+        ok: false,
+        text: 'You are not signed up for this train.',
+        train: { may: { kind: false } },
+      },
+    });
+    // Refused before the throttle: Bob has used none of the post's controls.
+    expect(
+      throttles.use(controlThrottleKey(PARTY_KIND), BOB, { uses: 1, perSeconds: 60 }, PARTY_NOW),
+    ).toBeUndefined();
+    expect((await map.move('kind', { kind: 'max' })).status).toBe(400);
+    expect((await map.move('kind', { kind: 'raid', from: '4' })).status).toBe(400);
+    expect(map.made.current().train.kind).toBe('gigantamax');
+  });
+
+  it('sets the kind of a train planned ahead, which has no route and so no panel yet', async () => {
+    const made = await createdTrain();
+    const { ctx } = createTestContext({
+      partyService: made.service,
+      attendance: made.attendance,
+      timedParties: made.timed,
+      trains: made.trains,
+      parties: made.store,
+      regions: made.regions,
+      users: made.users,
+    });
+    const members = new FakeMemberDirectory().add(REPORTER, 'Reporter');
+    const acting = new FakeActingMembers().add(REPORTER, 'Reporter');
+    web = webServerWith({
+      members,
+      parties: partyWebWith(made, { acting }),
+      trains: trainWebWith(ctx),
+    });
+    web.clock.now = PARTY_NOW;
+    const cookie = await web.loggedIn(REPORTER, 'Reporter');
+    const listed = (
+      await web.app.inject({ url: `/s/${FAKE_GUILD_ID}/api/parties`, headers: { cookie } })
+    ).json<PartiesView>().trains[0];
+    expect(listed).toMatchObject({ route: [], panel: null, may: { kind: true } });
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: `/s/${FAKE_GUILD_ID}/api/trains/${made.party.id}/move/kind`,
+      headers: { ...(await web.posting(REPORTER, 'Reporter')), 'content-type': 'application/json' },
+      payload: JSON.stringify({ kind: 'dynamax' }),
+    });
+    expect(answer.statusCode).toBe(200);
+    expect(made.current().train.kind).toBe('dynamax');
+  });
+
   it("gives the panel to who may move the train: the moves from where it is with where each leads, Reverse, the mode; nobody else's", async () => {
     const map = await moving();
     web = map.web;
diff --git a/src/web/train-routes.ts b/src/web/train-routes.ts
index 251a4712467e39d743f321af42dfed35d5feb836..611f6a5b5dea15ed92eb664800cbd0d8d95ee8c3 100644
--- a/src/web/train-routes.ts
+++ b/src/web/train-routes.ts
@@ -20,6 +20,7 @@ import {
   saveRouteAs,
   setAtEndAs,
   setConductorAs,
+  setKindAs,
   startTrainAs,
   trainRefusal,
   type ConductorNamer,
@@ -38,6 +39,7 @@ import {
   MAX_PARTY_NAME,
   MAX_ROUTE_STOPS,
   TRAIN_AT_END,
+  TRAIN_KINDS,
   type PartyProblem,
   type TrainParty,
 } from '../domain/party/party.js';
@@ -54,6 +56,7 @@ import { mapParty } from '../domain/web/party-view.js';
 import {
   CONDUCTOR_CHANGES,
   CONDUCTOR_SEEN,
+  KIND_PRESS,
   PANEL_PRESSES,
   ROUTE_EDITS,
   type ConductorChange,
@@ -112,7 +115,8 @@ const ROUTES_PER_MINUTE = 30;
 /**
  * The body of a new train: the region (by id, as `/api/geo` lists it), the name as `/train` takes
  * it (up to its option's length; a blank one is refused in its words), the start as `/meet` takes
- * it, and the mode as `/train`'s `at-end` offers it. Anything else is malformed.
+ * it, the mode as `/train`'s `at-end` offers it, and the kind as its `kind` does (plan 8X-5; a raid
+ * train without one). Anything else is malformed.
  */
 const startBodySchema = z
   .object({
@@ -120,6 +124,7 @@ const startBodySchema = z
     name: z.string().max(MAX_PARTY_NAME),
     time: z.string().max(40).optional(),
     atEnd: z.enum(TRAIN_AT_END).optional(),
+    kind: z.enum(TRAIN_KINDS).optional(),
   })
   .strict();
 
@@ -442,6 +447,7 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
           name: body.data.name,
           regionChannelId: region.channelId,
           ...(body.data.atEnd === undefined ? {} : { atEnd: body.data.atEnd }),
+          ...(body.data.kind === undefined ? {} : { kind: body.data.kind }),
           ...(start === undefined ? {} : { start }),
         },
         names,
@@ -608,15 +614,17 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
 
   // A press of the Manage train panel on the map (spec 3.7), as the post's panel makes it: before
   // the body is read, the per-address limit, the guard of every POST and a press the panel has
-  // (404 otherwise). Then the session (403) and the body (400), the checks of every write to a
-  // train (`trainWrite`), whether the member may (`mayNotMove`; for the mode, `mayNotArrange`, as
-  // `setAtEnd` decides: 403 in the command's words), and only then the window of the post's
-  // controls (`ACTION_THROTTLE`), as a press of the panel counts; then the service with where the
-  // panel was drawn (`from`) and where the press leads (`target`, `first`): a press that no
-  // longer fits the train is refused (409, the train as it is now). The movement is announced in
-  // the post as for any move, with its ping.
+  // (404 otherwise; its kind menu, `KIND_PRESS`, plan 8X-5). Then the session (403) and the body
+  // (400), the checks of every write to a train (`trainWrite`), whether the member may
+  // (`mayNotMove`, the kind too; for the mode, `mayNotArrange`, as `setAtEnd` decides: 403 in the
+  // command's words), and only then the window of the post's controls (`ACTION_THROTTLE`), as a
+  // press of the panel counts; then the service with where the panel was drawn (`from`) and where
+  // the press leads (`target`, `first`): a press that no longer fits the train is refused (409,
+  // the train as it is now). The movement is announced in the post as for any move, with its
+  // ping; a kind set, as the panel's menu says it.
   const knownPress = async (request: TrainRequest, reply: FastifyReply) => {
-    if (!isPanelPress(request.params.action ?? '')) return sendFailure(request, reply, 404);
+    const press = request.params.action ?? '';
+    if (!isPanelPress(press) && press !== KIND_PRESS) return sendFailure(request, reply, 404);
   };
   scope.post(
     '/api/trains/:party/move/:action',
@@ -624,10 +632,12 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
     async (request: TrainRequest, reply) => {
       void reply.header('cache-control', 'no-store');
       const press = request.params.action ?? '';
-      if (!isPanelPress(press)) return sendFailure(request, reply, 404);
+      if (!isPanelPress(press) && press !== KIND_PRESS) return sendFailure(request, reply, 404);
       const session = await sessions.of(request, reply);
       if (!session) return sendFailure(request, reply, 403);
-      const input = pressInput(press, request.body ?? {});
+      const input = isPanelPress(press)
+        ? pressInput(press, request.body ?? {})
+        : kindInput(request.body ?? {});
       if (!input) return sendFailure(request, reply, 400);
       const writing = await trainWrite(request, reply, session.userId, 'moved a train');
       if ('sent' in writing) return writing.sent;
@@ -651,16 +661,25 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
             return reverseRouteAs(ctx, party, member, staff, input.from, input.first);
           case 'at-end':
             return setAtEndAs(ctx, party, member, staff, input.atEnd, input.from);
+          case 'kind':
+            return setKindAs(ctx, party, member, staff, input.kind);
           case 'finish':
             return moveTrainAs(ctx, party, member, 'finish', staff, input.from);
           default:
             return moveTrainAs(ctx, party, member, input.press, staff, input.from, input.target);
         }
       });
-      deps.log.info(
-        { user: userId, guild, party: party.id, move: press, outcome: answer.kind },
-        'a train was moved on the map',
-      );
+      if (input.press === 'kind') {
+        deps.log.info(
+          { user: userId, guild, party: party.id, kind: input.kind, outcome: answer.kind },
+          "a train's kind was set on the map",
+        );
+      } else {
+        deps.log.info(
+          { user: userId, guild, party: party.id, move: press, outcome: answer.kind },
+          'a train was moved on the map',
+        );
+      }
       return answered(reply, guild, row, party.id, userId, standing, answer);
     },
   );
@@ -755,6 +774,8 @@ const PRESS_BODIES = {
   finish: z.object({ from: place }).strict(),
   reverse: z.object({ from: place, first: place }).strict(),
   atEnd: z.object({ from: place, atEnd: z.enum(TRAIN_AT_END) }).strict(),
+  // The kind menu (plan 8X-5): as the post's menu, nothing of where the train is.
+  kind: z.object({ kind: z.enum(TRAIN_KINDS) }).strict(),
 } as const;
 
 /** A conductor's change carries whose the role was when the page drew its button. */
@@ -765,7 +786,8 @@ type PressInput =
   | ({ press: 'next' | 'previous' | 'skip' } & z.infer<typeof PRESS_BODIES.move>)
   | ({ press: 'finish' } & z.infer<typeof PRESS_BODIES.finish>)
   | ({ press: 'reverse' } & z.infer<typeof PRESS_BODIES.reverse>)
-  | ({ press: 'at-end' } & z.infer<typeof PRESS_BODIES.atEnd>);
+  | ({ press: 'at-end' } & z.infer<typeof PRESS_BODIES.atEnd>)
+  | ({ press: 'kind' } & z.infer<typeof PRESS_BODIES.kind>);
 
 /** The press a body is; undefined for a malformed body. */
 function pressInput(press: PanelPress, body: unknown): PressInput | undefined {
@@ -791,6 +813,12 @@ function pressInput(press: PanelPress, body: unknown): PressInput | undefined {
   }
 }
 
+/** The kind menu's press (`KIND_PRESS`); undefined for a malformed body. */
+function kindInput(body: unknown): PressInput | undefined {
+  const parsed = PRESS_BODIES.kind.safeParse(body);
+  return parsed.success ? { press: 'kind', ...parsed.data } : undefined;
+}
+
 function isPanelPress(value: string): value is PanelPress {
   return (PANEL_PRESSES as readonly string[]).includes(value);
 }
diff --git a/src/web/train-start.test.ts b/src/web/train-start.test.ts
index ea0cdcc64cca923ac7de344ad27b16d8a506d6e1..8cd59e8b1cd726366594af10297b38fddca6c6e6 100644
--- a/src/web/train-start.test.ts
+++ b/src/web/train-start.test.ts
@@ -150,6 +150,30 @@ describe('starting a train on the map', () => {
     });
   });
 
+  // Plan 8X-5: the kind of `/train kind:` (8X-4), a raid train when none is given.
+  it('makes a train of the kind picked, as /train kind: does, and a raid train without one', async () => {
+    const map = await starting();
+    web = map.web;
+    const giga = await map.start({ region: 1, name: 'Wild Area', kind: 'gigantamax' });
+    expect(giga.status).toBe(200);
+    expect(giga.json.train).toMatchObject({
+      trainKind: 'gigantamax',
+      trainKindWords: 'Gigantamax Train',
+    });
+    const plain = await map.start(
+      { region: 1, name: 'Park loop' },
+      await map.web.posting(BOB, 'Bob'),
+    );
+    expect(plain.json.train).toMatchObject({ trainKind: 'raid', trainKindWords: 'Raid Train' });
+    expect(
+      map
+        .trains()
+        .map((train) => train.train.kind)
+        .sort(),
+    ).toEqual(['gigantamax', 'raid']);
+    expect((await map.start({ region: 1, name: 'Park loop', kind: 'max' })).status).toBe(400);
+  });
+
   it("refuses what /train's guard and /meet's reader refuse, in their words as text, before its throttle", async () => {
     const throttles = new Throttles();
     const map = await starting({ throttles });
````

### Task 7: 8X-5 task 7: docs for max battles on the map, the page's part as a follow-up

Prototype commit: `090da1bcf67cc4ef1db6223a76fb110ed3278c42`

web.md: the max routes and their limits and windows, a section "Max battles on the
map" (scope, the code paths shared with /max, MapMax and PartiesView.maxes, the power
spots of a box, the pick lists, the report with its statuses and the ending-soon
answer, the log line), Remote in the parties' view and presses, the train's kind in
the start body, the view and the panel's kind press; /api/stops still offers no power
spot, and says where they are offered now. testing.md: maxReportingWith and maxWebWith.
parties-and-posts.md and trains.md: what the map shares. The follow-ups gain "From
Phase 8X-5": the page's part for the web UX pass, the calls made in the prototype.

**Files:**

```
 docs/architecture/parties-and-posts.md       |  4 ++--
 docs/architecture/testing.md                 |  1 +
 docs/architecture/trains.md                  |  4 ++--
 docs/architecture/web.md                     | 30 ++++++++++++++++++++----------
 docs/superpowers/plans/phase-0-follow-ups.md |  9 +++++++++
 5 files changed, 34 insertions(+), 14 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated `); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 090da1bcf67cc4ef1db6223a76fb110ed3278c42 -- docs/architecture/parties-and-posts.md docs/architecture/testing.md docs/architecture/trains.md docs/architecture/web.md docs/superpowers/plans/phase-0-follow-ups.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-5 task 7: docs for max battles on the map, the page's part as a follow-up`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 8ff4c48294f25812d658f457d38a90fc8b1eda20..ab87ffe740056755df4aed504856abebeb3f5232 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -35,7 +35,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 
 - A max battle (plan 8X-3; design `2026-10-20-max-battles-design.md`, section 3) is `MaxParty` (`type: 'max'`, `max: { tier, boss, spot }`; `src/domain/party/max.ts`): a tier of `MaxTier` (`D1` to `D5`, `G`), a boss that is always known (no egg), and a spot, a power spot as it was named (`PowerSpot`, a snapshot shown as it is now while it is the same place, `spotNow` over `shownPlace`) or a pin, an "Unlisted power spot" (Q7, `UNLISTED_SPOT`). `gymId` and `hatchTime` stay null; its end is always set. Remote is allowed; no copies in the remote or elite channels.
 - One max battle per spot and server: `PartyStore.maxAt(guildId, spot, now)` (an active one of that server whose end has not come, `blocksNewMax`; the same power spot, or a pin within 50 m of a pin, `sameSpot`; a Wayfarer id is the same in every server) and `addMaxUnlessTaken` under a `KeyedLock<string>` of the spot (`withSpotLock`, `spotKey`: `w<Wayfarer id>`, one key `pin` for every pin), which `whenIdle` waits for. `PartyService.reportMax(MaxReport)` makes one with its post in the forum of a region whose outline holds the spot (`regionForSpot`, the report's own region first): `created`, `exists` (the same boss and tier: the reporter is signed up by their automatic status), `taken` (another boss: refused, Q3; the boss, tier and that it still holds the spot decided again inside `PartyStore.update`, since `/boss` may change it while the report waits), `no-region`, `no-forum`, `no-post`, `barred`.
-- How long it lasts is `defaultMaxEnd` (`src/domain/time/max-end.ts`, `utilities.md`): the boundary of its rotation, else the day's last battle time or the start of a max event later that day (Q-B); `/end` changes it within its day (`typedMaxTime`) through `ctx.maxBattles` (`MaxChangeService`: `setEnd` under the spot's lock, `spot-taken` where an ended battle's later end would share its spot, meeting times after it cancelled; `setBoss`, the tier with the boss, `max-kind-change` between Dynamax and Gigantamax). A report at or after the last battle time is refused; `/max` asks first about a new battle whose end, not typed (a typed `end:` is never second-guessed), is within `ENDING_SOON_MINUTES` (5), in a dialog (`endingSoonDialog`: until the next rotation, `nextRotationEnd`, first and picked, or until the end about to pass; only "Report it anyway?" at the last battle time and for a Dynamax battle at its event's last boundary). Whether it asks is decided once, by its guard (`MaxAsk.asks`), and read by the deferral and the command: a deferral cannot be followed by a dialog. The Submit (`maxControls`, `requireGuild`) decides again (another boss there by then, a member kept out since, the end passed); one without the choice it was shown is `STALE_COMPONENT`. Its refusal of another boss names the battle by its kind (`maxBossTitle`), a pin "an unlisted power spot", and the `/boss` hint only within one kind.
+- How long it lasts is `defaultMaxEnd` (`src/domain/time/max-end.ts`, `utilities.md`): the boundary of its rotation, else the day's last battle time or the start of a max event later that day (Q-B); `/end` changes it within its day (`typedMaxTime`) through `ctx.maxBattles` (`MaxChangeService`: `setEnd` under the spot's lock, `spot-taken` where an ended battle's later end would share its spot, meeting times after it cancelled; `setBoss`, the tier with the boss, `max-kind-change` between Dynamax and Gigantamax). A report at or after the last battle time is refused; `/max` asks first about a new battle whose end, not typed (a typed `end:` is never second-guessed), is within `ENDING_SOON_MINUTES` (5), in a dialog (`endingSoonDialog`: until the next rotation, `nextRotationEnd`, first and picked, or until the end about to pass; only "Report it anyway?" at the last battle time and for a Dynamax battle at its event's last boundary). Whether it asks is decided once, by its guard (`MaxAsk.asks`), and read by the deferral and the command: a deferral cannot be followed by a dialog. The Submit (`maxControls`, `requireGuild`) decides again (another boss there by then, a member kept out since, the end passed); one without the choice it was shown is `STALE_COMPONENT`. Its refusal of another boss names the battle by its kind (`maxBossTitle`), a pin "an unlisted power spot", and the `/boss` hint only within one kind. The report itself is `reportMaxAs` and its words `maxReportWords` (`src/commands/max/max-report.ts`, a post and a channel named by the caller's `ReportNames`), with `maxBarred`, `blockedAtPin` and the dialog's words `endingSoonQuestion`, the code paths the live map shares (plan 8X-5, `web.md`, "Max battles on the map"; the map asks the ending-soon question as an answer and a second request).
 - Its post (`renderMaxPost`, `src/render/max-post.ts`): `### Dynamax Machamp (2★)` / `### Gigantamax Machamp`, `Until 21:00 (in …)` or `Ended at …`, the boss's types and weaknesses (no catch CP, no moves), the boss's picture (`shownMaxBoss`: the Gigantamax icon where the game has one); Where `**<title>** (power spot) · <address> · [Map]` with the Wayfarer picture, or `📍 **Unlisted power spot** · [Map]` (a power spot as it is now while it is the same place, `spotNow`: the title, the post's heading, the DM brief and `/where` alike); the groups with their lobby; a battle's controls (Done completes; Meet… with the round 5-minute times of the next hour up to its end, Q10; no Set time, no Screenshot feedback); the reporter. Its title `<battle> · <spot>`, its tags `Max battle` (+ `Ended`), its link line `New max battle: <#post>`; the summary lists max battles under **Max battles** after the raids.
 - A battle at a pin, an "Unlisted power spot" (a place nobody checked; Matt, 2026-10-21, final review G1): a member blocked from meetups (`MeetupSafety.blocked`, the block that refuses their meetups; never staff, nobody while meetup safety is off) is refused a new battle there in plain words (`MAX_PIN_BLOCKED`, no Appeal button: the block is appealed with `/meetup`, `meetup-safety.md`) by `/max`'s guard, before anything is made and uncounted, and again at the ending-soon dialog's Submit where the report would not join a battle; joining the battle at the pin is allowed (its Join button would sign them up anyway, fix review 4), and a known power spot is still theirs. Every pin battle is posted at once as before (wants and DMs as before), its log line names the reporter and the server, and the moderators' channel, when set, gets a notice of it on the side (`ModerationReports.maxAtPin`, `moderation.md`). Every DM and `/where` name a max battle's spot as its post does now (`PartyService.spotOf`: `spotNow` over the kept Wayspots; the notifier's `posts.spotOf`, as meetups' `placeOf`).
 
@@ -71,7 +71,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 
 ## Attendance, lines and the completion question
 
-- `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup` (with a label, Group…), `labelGroup`; `joinChosen` and `joinStamped` (the Submits of the dialogs about groups), `lobbyOf` (a party's lobby size). Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. The attendance buttons of a post (Interested, Join, Here, Done, Leave, and the letter Join, "Join B", of a post drawn before plan 8X-1B, which still joins its letter, `joinInto`, or is refused as no such group once the letter is gone) are carried out by `pressStatus(attendance, partyId, member, press, answer)`, the one code path the live map's presses share (plan 8M-3, `web.md`); `outcomeWords(limits, party, outcome, words?)` is the answer's words and whether it worked, without throwing (the map's answer), which `answerOutcome` and `answerClick` throw as a `UserError` when it did not. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`).
+- `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup` (with a label, Group…), `labelGroup`; `joinChosen` and `joinStamped` (the Submits of the dialogs about groups), `lobbyOf` (a party's lobby size). Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. The attendance buttons of a post (Interested, Join, Here, Done, Leave, and the letter Join, "Join B", of a post drawn before plan 8X-1B, which still joins its letter, `joinInto`, or is refused as no such group once the letter is gone) are carried out by `pressStatus(attendance, partyId, member, press, answer)`, the one code path the live map's presses share (plan 8M-3, `web.md`); `outcomeWords(limits, party, outcome, words?)` is the answer's words and whether it worked, without throwing (the map's answer), which `answerOutcome` and `answerClick` throw as a `UserError` when it did not. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`). The live map presses Remote too (plan 8X-5): `setRemote(…, 'toggle')` answered in `remoteWords`, as the post's Remote button.
 - What the bot says in a post about what happened goes through `PartyLines.say(postId, text, key?)` (`src/services/party-lines.ts`): no pings, the first line at once, later ones gathered at most every two seconds, and of several unsent lines with one key only the newest is said (a member's standing has the key `member:<id>`). Lines for a post whose party is no longer active are dropped. How a member stands is worded by `standing` / `standingReply` / `standingLine`, a refusal by `problemText` (`src/render/activity.ts`).
 - The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 14 (plan 8X-4: a train's `kind`, and its `route` and `finishedFrom` as stops, `StopRef`; plan 8X-3, version 13: the part `max`, a max battle's tier, boss and spot; plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; version 9 (plan 8B-3): `train.atEnd`; version 10 (plan 8D): `meetup.place`; version 11 (plan 8T): `train.splitFrom`, with `pending: true` while the split is not settled, and `train.splitOff`; version 12 (plan 8X-1B): a group's `opened`, also kept with a `splitOff` entry; exactly the parts that fit the type must be present); versions 1 to 13 are still read (none of them before 13 a max battle; a train of them before 14 a raid train whose route and `finishedFrom` are gyms; a train of them before 9 as `finish`, a meetup of them before 10 without a place, a train of them before 11 split neither from nor off another, their groups before 12 opened with the party).
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index b239e3d22b70384ed521881d47b70d62fdfd4aa5..ac9b4a2262da46b47e8fcc99b494f4cec71c82af 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -69,6 +69,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Raids on the map (plan 8M-4): `raidWebWith(ctx, { channelName })` gives the web server what the raid commands read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `raids`, `parties`, `regions` of `partyServiceWith` or `reportedRaid`, and `users: new MemoryUsers(settings)` for a member's privacy); pass it as `raids` beside `partyWebWith(made, …)` as `parties`, the same `throttles` in both a router and the map to see a command's window shared (fill it under the command's name, `RAID_COMMAND` or `hatch`, before a request). Without it every use of the raids' deps throws, saying to give it. A gym in several regions: the invented gyms with `regionsOf` overridden (`Object.create(gymsFixture())`), given to `partyServiceWith({ gyms })` and to the context alike (`raid-report.test.ts`; `/raid`'s own refusal of a forum the member is kept out of in `raid.test.ts`, with `gateway.barred` and a router's `Throttles` to see it uncounted, plan 8M-6; a screenshot's in `mention.test.ts`, whose `setup({ alsoInEast })` puts gyms in East as well).
 - Spawns on the map (plan 8M-4S): `spawnWebWith(ctx, { channelName, channels })` gives the web server what `/wild` reads and calls, from a test's context (`createTestContext` with `spawns`, `wants`, `regions` of `partyServiceWith`, and `config` with other `wildSpawnExceptions` to test them); pass it as `spawns` beside `partyWebWith(made, …)`, the same `throttles` in a router to see `/wild`'s window shared (`WILD_COMMAND`). Without it every use of the spawns' deps throws. `channels: made.gateway` lets the fake gateway say who an overwrite of their own keeps out of a region's channel (`gateway.ownViewDenials`, by channel; `failing.set('ownViewDenied', …)` for Discord away); without it nobody is. A point in several regions: change `made.regions.rows` (East's outline reaching into West, `spawn-report.test.ts`); the DMs are `made.notify.flush()` and `made.dms`. The bot refused in a region's channel: `gateway.failing.set('sendMessage', missingPermissions('POST'))`. The page's spawn form itself (`spawnUi`) imports Leaflet, which needs a browser as it loads: its test mocks `leaflet` and is `spawn-ui.isolated.test.ts`, with a `document` of its own (`vi.stubGlobal`, `vi.unstubAllGlobals()` afterwards) and a real `FormHold`.
 - Meetups on the map (plan 8M-5M): `meetupWebWith(ctx, { channelName })` gives the web server what `/meetup`, `/name`, `/info`, `/meet` and `/end` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `parties`, `regions` and `meetupSafety` of `meetupSafetyWith`, or of `createdMeetup` for a change, and `wayspots` of `wayspotsWith` for the stops; `await ctx.placeFinder.built()` before a stop is named); pass it as `meetups` beside `partyWebWith(made, …)`, which takes the services of `meetupSafetyWith` too, the same `throttles` to fill `/meetup`'s window (`MEETUP_COMMAND`) or a change's (`name`, or `variedThrottleKey('meet', START_THROTTLE)` for a start) before a request. Without it every use of the meetups' deps throws. The stops of `meetup-make.test.ts` are kept Wayspots in West: two PokéStops (one titled with a flagged word), a power spot, and for the cap 305 more. A block, a ruling: `made.storage.addBlock`, `made.storage.rule`; the moderators' post: `made.gateway.messagesIn(MOD_CHANNEL)`. The page's meetup forms are tested in their pure parts (`meetup-forms.test.ts`: the form, the editor, their bodies, `PlacePicking`, `StopLoads`, and the state `meetup-ui.ts` keeps, moved into pure functions there: the editor's fields typed in and the value each was drawn from, `editorTyped` and `editorAfter`; whether an answer closes the editor, draws it anew or only says its words, `editorStep`; whether the member chose the region, `regionChosenBy`; the box the stops are asked for, kept to the world, `stopsBox`); what is left in `meetup-ui.ts` is wiring to the DOM, and it and the map's side are tried at staging.
+- Max battles on the map (plan 8X-5): `maxReportingWith(safety, rows)` (`test/support/max-reporting.ts`) gives the services of `reportsWith` (without the moderators' channel unless `safety` names it), the max bosses of the recorded feed, the recorded max and big events, the kept power spot `SPOT_ROW` at `TEST_SPOT` (and `rows`), and a context over them whose place search is built (`ctx`); fake `Date` to `MAX_THURSDAY` (an ordinary Thursday, 14:00) first, and set the web server's `clock.now` to it (move both together to pass time). `maxWebWith(ctx, { channelName })` gives the web server what `/max` reads and calls; pass it as `maxes` beside `partyWebWith(made, …)`, whose `maxLook` shows a max battle as its post does (`reportedMax` for one made through the service). Without it every use of the max deps throws. A block at a pin: `made.storage.addBlock`; the moderators' notice: `made.reports.flush()`, then `made.gateway.messagesIn(MOD_CHANNEL)`; a spot in two regions: East's outline reaching into West (`made.regions.rows`), as for spawns.
 - Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode, the Move panel) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events, the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the right click on a raid's picture or dot runs the real Leaflet in `party-layer-contextmenu.isolated.test.ts` (plan 8W-3): globals stubbed in `vi.hoisted` with just enough of a browser for Leaflet to load (no DOM library), a map made of `L.Map.prototype` with its container, a pane, the marker's element made its target by `addInteractiveTarget`, the pointer's place given by stubbing the map's conversions, and `_fireDOMEvent` as Leaflet calls it; a marker that listens is the control that shows the test can fail. The rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
 - The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a colour written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define; `theme.test.ts` reads a theme through a fake reader (`readTheme`). It lives outside `src/web/client/` because the client's type check has no Node.
 - `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index 3fd859eae2c583a8f6a8ff7a43d81f9747553185..fd35240ed9afe9e2613913b1ca8e6bba63234eaa 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -12,7 +12,7 @@ The third kind of party: a route of gyms and power spots, a kind (raids, Dynamax
 
 - Everything that happens to a train is a pure function in `src/domain/party/train.ts` and goes through `ctx.trains` (`TrainService`: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `move`, `reverse`, `setAtEnd`, `setConductor`, `clearConductor`, `setBoss`, `saveRoute`, `loadRoute`, `forgetRoute`, `savedRoutes`, `reaches`, `flush`; each change answers a `TrainChangeOutcome`). The current stop follows its stop through every route edit. An edit after which the train is somewhere else (`placeOf` differs: the current stop removed, a stop added to a finished route, a loaded route) is a movement: it needs the right to move (`mayNotMove`: the conductor or staff when there is a conductor, otherwise signed up; staff always), puts Here back to Coming and is announced. The first stop of an empty route is an ordinary edit. Finishing leaves Here as Here and changes no time.
 - Who may edit is one rule each in `train.ts`, which the domain functions, the live map's view and its routes all ask: `mayNotArrange` (add, remove, move a stop: signed up, the maker, staff), `mayNotClear` (the conductor and staff; `/route clear` counts bot developers as staff), `mayNotLoad` (who may move the train, or the maker its first route), `mayNotMove`. An edit of the route may carry the route it was drawn from (`drawn`, the live map's route editor: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `loadRoute` and `saveRoute` take it last): the service refuses it inside the store when the route is another by now (`routeDrawn`, reason `route-edited`); a command gives none. So may a change of the conductor carry whose the role was as the map drew its button (`seen`, `ConductorSeen`: `setConductor` and `clearConductor` take it last), refused inside the store when the role is somebody else's by now (`conductorDrawn`, reason `conductor-changed`).
-- What the commands do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs` for `/train`, `addStopAs` … `forgetRouteAs` for `/route`, `moveTrainAs` for the four moves, `setConductorAs`, `clearConductorAs`; `reverseRouteAs` and `setAtEndAs` word the panel's Reverse and mode for the map), answering a `TrainAnswer` in the command's words; the commands throw a refusal as a `UserError`, the live map answers it (plan 8M-5). The post's panel keeps its own answer, drawing itself anew. `startTrainAs` makes the train with its start when one is given (the map's form: `TrainRequest.startTime`, `NewTimedParty.startTime`), so that its post and the new-train DM say it from the first; `notSignedUpWords(where)` is the clause `/train` and the map add for a maker not signed up. `setConductorAs` names the conductor it took over from by the caller's `ConductorNamer` (`DISCORD_CONDUCTOR`, `memberText`, on Discord; the map names nobody).
+- What the commands do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs` for `/train`, `addStopAs` … `forgetRouteAs` for `/route`, `moveTrainAs` for the four moves, `setConductorAs`, `clearConductorAs`; `reverseRouteAs`, `setAtEndAs` and `setKindAs` (plan 8X-5) word the panel's Reverse, mode and kind for the map), answering a `TrainAnswer` in the command's words; the commands throw a refusal as a `UserError`, the live map answers it (plan 8M-5). The post's panel keeps its own answer, drawing itself anew. `startTrainAs` makes the train with its start when one is given (the map's form: `TrainRequest.startTime`, `NewTimedParty.startTime`), so that its post and the new-train DM say it from the first; `notSignedUpWords(where)` is the clause `/train` and the map add for a maker not signed up. `setConductorAs` names the conductor it took over from by the caller's `ConductorNamer` (`DISCORD_CONDUCTOR`, `memberText`, on Discord; the map names nobody).
 - A movement is announced in one message that pings the signed-up members who allow `mentions` and `mentionsTrainStops`, never the mover, gathered for five seconds and worded by the gym the train started from and where it is when the message goes ("back" only when every step was Previous; nothing when it is where it started or the route was emptied; "going round again, back to …" or "turning back at …, on to …" when the last step went round the end or turned back and the train is where it took it: `Movement` kinds `round` and `turn`, `PendingMove.lastFrom`). A gym or a power spot is a stop only when it lies in a region of the train's server (`reaches`, `stopRegionsInGuild`).
 - What is said once a few seconds after the last change goes through `Gathered` (`src/services/gathered.ts`: `later(key, merge)`, `drop`, `flush`, with `fold(older, newer)` for an entry whose turn comes while another waits behind a slow send): the start of a timed party and a train's movement. The party services share `storedChange` (`src/services/party-change.ts`) for a change decided inside the store.
 - What a train does at the last stop of its route is `train.atEnd` (`TRAIN_AT_END`: `finish`, `loop`, `turn-back`; `TrainAtEnd`, `isTrainAtEnd` in `party.ts`), set by `/train`'s option `at-end` (default `finish`), the panel's menu (the menu is only in the panel, which opens only for who may move the train, so `setAtEnd`'s `mayArrange` matters for a panel opened earlier and for saved routes; `setAtEnd`: for whoever may arrange the route, `mayArrange`, and staff, since it never moves the train nor un-finishes a route; the same mode is the same object; the line names the doer through `doer`) and a loaded saved route. A route of fewer than two stops finishes in every mode (`endMode`). `destinationOf(party, move)` is where a move leaves the train (`route`, `stop`, `turn`, `skipped`): Next at the last stop finishes, goes to stop 0 (`turn: 'round'`) or stores the route reversed and goes to its index 1 (`turn: 'back'`); Skip goes round a loop (`(stop + 2) mod n`, three stops or more) and at the last stop of a turn-back to index 2 of the reversed route (refused at its second to last stop); Previous at stop 0 of a loop goes to the last stop, of the others is refused. A move that goes round or turns back is a movement and never finishes the route, and neither does removing the current last stop of a loop or turn-back train with two stops or more left (`removeStop`: a loop goes to stop 0, a turn-back train has the rest reversed and stands at its index 0); Finish finishes in every mode. `nextStop` and `turnAhead` say what Next does from where the train is. `reverseRoute(party, member, staff, from?, first?)` (`cannotReverse`: a loop at any stop, a route that finishes at its first or last stop; a finished route of either mode only when finished from its last stop, which starts it again there, else `reverse-finished-elsewhere`; never a turn-back or a route of one stop) puts the same gyms in the other order with the train at the same gym: no movement, Here stays Here, the mode stays, said in a line without a ping ("…, and starts again at X" for a restart). Reverse leaves `placeOf` as it was (except the restart of a finished route, which moves it from `end` to the gym), so the panel's control also carries `first`, the gym the route began with (`route-changed` otherwise). The post's line of what lies ahead says the mode on a route of three stops or fewer (`, loops` / `, turns back at the end`, on two stops or more) and marks a stop past the end `(round again)` / `(turning back)`; after a turn or a Reverse the stops are numbered in their stored order. The words of the modes are `src/render/train-words.ts`.
@@ -26,7 +26,7 @@ The third kind of party: a route of gyms and power spots, a kind (raids, Dynamax
 
 ## Kinds and power spots (plan 8X-4)
 
-- **The kind** (design `2026-10-20-max-battles-design.md`, 6.1): `train.kind` (`TrainKind`, which is `BattleKind`: `raid`, `dynamax`, `gigantamax`; party state version 14, a train of an older document is `raid`), set by `/train kind:` (default raid) and the Manage train panel's menu "What the train goes to" under the mode's (`party:<id>:kind`, `pressKind`, `TrainService.setKind`, `setTrainKind`: for who may move the train and staff; the same kind is no change; a line `<doer> made this a Gigantamax Train.`). Its words are one set, `TRAIN_KIND_WORDS` (`Raid Train`, `Max Battle Train`, `Gigantamax Train`; `trainKindChoice` for the choices): the post's heading and brief, `/help`, the panel; the new-train DM and the summary line name a max train's kind, a raid train's stays "train". It sets the lobby (`lobbySize`: a Gigantamax train `lobbies.gigantamax`, so Join fills its groups; a raid and a Dynamax train none; `splitLobby` only a raid train), at once when changed (groups already made stay), the forum tag (a Dynamax or Gigantamax train is tagged `Max battle` too) and `/counters` in its post (a Dynamax train the max counters at the boss's Dynamax tier where a max boss list names it, else `tier:` is asked; a Gigantamax train the Gigantamax tier; a raid train raid counters as before). `/boss` takes any Pokémon whatever the kind (`trainBoss`).
+- **The kind** (design `2026-10-20-max-battles-design.md`, 6.1): `train.kind` (`TrainKind`, which is `BattleKind`: `raid`, `dynamax`, `gigantamax`; party state version 14, a train of an older document is `raid`), set by `/train kind:` (default raid) and the Manage train panel's menu "What the train goes to" under the mode's (`party:<id>:kind`, `pressKind`, `TrainService.setKind`, `setTrainKind`: for who may move the train and staff; the same kind is no change; a line `<doer> made this a Gigantamax Train.`); the live map sets it through the same service (`setKindAs`, `POST …/move/kind`) and makes a train with a kind (plan 8X-5, `web.md`). Its words are one set, `TRAIN_KIND_WORDS` (`Raid Train`, `Max Battle Train`, `Gigantamax Train`; kept in `src/domain/web/party-data.ts` since plan 8X-5, where the map's view and a page may take it, and given on by `render/train-words.ts`; `trainKindChoice` for the choices): the post's heading and brief, `/help`, the panel; the new-train DM and the summary line name a max train's kind, a raid train's stays "train". It sets the lobby (`lobbySize`: a Gigantamax train `lobbies.gigantamax`, so Join fills its groups; a raid and a Dynamax train none; `splitLobby` only a raid train), at once when changed (groups already made stay), the forum tag (a Dynamax or Gigantamax train is tagged `Max battle` too) and `/counters` in its post (a Dynamax train the max counters at the boss's Dynamax tier where a max boss list names it, else `tier:` is asked; a Gigantamax train the Gigantamax tier; a raid train raid counters as before). `/boss` takes any Pokémon whatever the kind (`trainBoss`).
 - **Planned ahead:** `/train start:` (a time as `/meet` reads it, `typedTimedTime` over `newPartyTimes('train', now)`, read by the guard first so that a refusal is not counted) makes the train with its start; its route may stay empty until the day (a train with no time still goes a day after it was made). The Manage train panel opens on a train without a route too, with what applies: no moves, no Reverse, no mode, the kind menu (so a kind set wrongly at `/train` can be changed before the first stop).
 - **Stops** (design 6.2; `src/domain/party/stops.ts`): `StopRef` is `{ kind: 'gym', id }` or `{ kind: 'powerspot', id }` (a Wayfarer id); `stopKey` names one as text (`'12'`, `'w<Wayfarer id>'`: no colon, not `p`), by which stops are the same (`sameStop`, `whereOf` for whether a change moved the train) and the map's `MapTrain.route` is made; `stopHandle` is what a control carries (a gym's id; the first 8 hex characters of an FNV-1a hash of a Wayfarer id, so the panel's ids stay within 100 characters with the longest ids, tested), checked against the route when pressed (`stopsByHandle`: no match is `train-moved-on` for a place, two `route-changed`). Every function of `train.ts` works on stops. A power spot is shown as a gym stop (`src/render/train-stops.ts`: `PostStop`, `stopsFrom` over the gyms and the kept Wayspots, `stopLabel` `<title> (power spot)` in lists, the panel and the movement announcement, `stopLink`, `stopWhere`: Where with its address, Map and Wayfarer picture); one no longer kept as a power spot (gone, or an import made it a PokéStop or gym: a train's spot never becomes a stop of another kind) is `Unknown power spot`, refused when added (`spot-gone`) and taken off by `removeUnknownStops` as an unknown gym is (never while no Wayspot is kept, `WayspotProvider.size`). `/where` in a train at a spot names it with its Map; a gym target, a request and the moderators' place are of gyms (a spot is the moderators' place too).
 - **`/route add stop:`** (renamed from `gym:`): its list is the `PlaceFinder`'s of kinds `gym` and `powerspot`, each choice by its kind and where it is (`placeLabel`), a Dynamax or Gigantamax train offered power spots first among places that fit as well, a raid train gyms (`mergePlaces`' `kindsFirst`; a better fit first whatever its kind); with nothing typed the region's gyms as before, a max train's the region's power spots by name ahead of them. A value is `gym:<id>` or `powerspot:<Wayfarer id>` (an old `g:<id>` still read); typed text is a gym by `reportedGym`'s rule and a power spot by `clearOf`'s, and the train's own kind decides first (`typedStop`): its stop beyond doubt is taken, unless the other kind's stop beyond doubt fits the typed text strictly better (`PlaceFit`; design 6.2: a better match first, whatever its kind; a gym beyond doubt fits at least as a word's fit; a tie is the train's kind's), so a raid train finds gyms as before unless a power spot fits strictly better; its several (some fitting every word) are "Several places fit"; without one, or with a list of guesses only (no place of that kind of the server has every word as typed; for gyms, no gym of the server has every word as typed), the other kind's stop beyond doubt, else several or none. A raid train may add power spots. `/route remove stop:` keeps its stop number.
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index ee2af8b58419cb731654c93fdafc3f7a24620772..5acdcaec7ce1a113bbf07f4e727db29652132dbd 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -1,12 +1,12 @@
 # The web server and the map
 
-The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, starting, arranging and moving trains on the map, making and changing meetups on the map, the region editor, the Content Security Policy, and the rules for adding a route. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
+The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, starting, arranging and moving trains on the map, making and changing meetups on the map, max battles on the map (the server side, plan 8X-5), the region editor, the Content Security Policy, and the rules for adding a route. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
 
 ## Settings, secrets, start and stop
 
 - Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (`osm` default, or `google`), `memberRole` (a role's name; blank or absent is unset: see "Who sees what"). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
 - Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows OpenStreetMap). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
-- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, its trains `TrainWebDeps`, its meetups `MeetupWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
+- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, its trains `TrainWebDeps`, its meetups `MeetupWebDeps`, its max battles `MaxWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
 - Fastify's own logger is off. Every request is logged at debug by `method`, its route pattern (`/auth/link/:guild/:token`, never the address it was asked with, which may carry a token or code), `status` and `ms`. Never log a token, cookie, OAuth code, CSRF token, secret or the query string of `/auth/*`; a failure is logged as `{ err }` with the route.
 - Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/` (401 "Log in first.", 403, 404, 413, 429, 503 "Not available just now."), a short page otherwise, never a stack or what went wrong; 500s are logged. Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's preview and save, 2 MB: `SAVE_BODY_LIMIT`) sets its own `bodyLimit`.
 
@@ -16,7 +16,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 ## Addresses
 
-- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>` and `POST …/conductor/<change>` (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
+- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>` and `POST …/conductor/<change>` (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
 - The Wayspot export tool's addresses (plan 8W-P, below) are the one exception to `/s/<guild>/`: `/userscript` (the page and its POSTs) and `/userscript/<key>/pine-wayspot-export.user.js` and `….meta.js`, with every other path under `/userscript/` a plain 404 (`toolPageRoutes`, `toolFileRoutes`, `src/web/tool-routes.ts`). The tool is not a server's: one instance, the owner's, hands it to the admins of other instances.
 - Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters), to `/userscript` exactly (not `/userscript/`, `/userscript?x`, `/userscriptx` or `//userscript`), or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
 
@@ -30,7 +30,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 - With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
 - With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page without script (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, so that a link preview or a prefetch cannot spend the link. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped), because one click on somebody else's link logs you in as them, and the page is where you see whose it is. An unknown, used or expired link, or one of another server, shows plain "Continue" and nothing else (its POST lands on `?login=expired`). `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The answers of `/maps` and `/region edit` say so under the button: "The button logs you in as well. It works once, within five minutes; do not share it: it logs in whoever opens it as you. Use /maps again for another." (Matt, 2026-10-18). The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
-- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute; over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`), a press of the Manage train panel in the window of the post's controls (as the post's panel counts), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words); the work after it runs in `countedOnTheMap`, which gives the use back on an unexpected error or a `UserError` with `givesBack`, as the router does (a refusal stays counted; a write whose service answers a refusal with `givesBack`, a new train or meetup, gives it back itself with `givenBackOnTheMap`).
+- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute, `/s/*/api/powerspots` 60 a minute, `/s/*/api/max-options` 30 a minute, the reports of max battles 30 a minute (`MAX_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`), a press of the Manage train panel in the window of the post's controls (as the post's panel counts; its kind menu too, plan 8X-5), a report of a max battle in `/max`'s (`MAX_COMMAND`, `MAX_THROTTLE`), the Remote switch of a party in the window of the post's controls (as its Remote button counts), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words); the work after it runs in `countedOnTheMap`, which gives the use back on an unexpected error or a `UserError` with `givesBack`, as the router does (a refusal stays counted; a write whose service answers a refusal with `givesBack`, a new train or meetup, gives it back itself with `givenBackOnTheMap`).
 
 ## The public map
 
@@ -42,8 +42,8 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 ## The parties on the map (plan 8M-3)
 
 - **Who sees what** (spec 2.5; `PartyViewers`, `src/web/party-viewers.ts`, decided per request, never from the session): a member of the server (`members.find`, kept a minute by the directory) sees every active party of it except those in a forum `PartyGateway.memberAccess` says they are `barred` from (an overwrite somebody set to keep them out); a forum hidden from @everyone and allowed to a role is not `barred` for a member without that role, so its parties show and Join opens the forum to them, as signing up on a copy does (spec 2.5: the map crosses region roles). A server whose members must earn a role first (a verification role, `Verified`) names it in `settings.web.memberRole` (Matt, 2026-10-17: "unverified members can browse the map in read-only, same as someone that hasn't logged in"): a member without a role of that name (compared as Pine's other role settings: trimmed, whatever its letter case), unless an administrator, is treated as a visitor who is not logged in: `/api/me` says `member: false`, `/api/parties` 403 (the page shows regions and gyms only), a press 403 (`countsOnTheMap`, `src/web/map-members.ts`). It is decided where membership is: the directory's answer, kept a minute (`mapMembers` over `members.find`, given to `/api/me` and the parties by `guildRoutes`; `ServerMember.standing`: the roles by name and Administrator, `memberStanding`), and for a press also the member fetched fresh (`ActingAnswer.standing`). Unset (the default) every member counts; the region editor does not ask it (staff only). what Discord said of a member and a forum is used for a minute (`BARRED_FRESH_MS`, a `BoundedMap` of 10,000), so a page that asks every 20 s does not have every forum looked at each time. While Discord cannot be asked: a member it confirmed within 30 minutes (`MEMBER_SEEN_MS`) gets the list read-only, by what it said last of each forum (a forum it said nothing of lately is hidden); once Discord failed in a request (the member or any forum), nothing more is asked of it in that request, the forums left go by what it said lately (or are hidden), and one warning is logged; anybody else 503 "Discord cannot be reached just now, so I cannot tell whether you are a member." Not logged in 401, not a member 403.
-- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups newest first (`newestFirst`) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; Group… and Meet… are not on the map: follow-ups, the web UX sweep); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
-- **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join`, `here` (each with body `{ group }`, the group a newcomer chose in the popup, plan 8X-1B: the dialog's Submit by the group's letter, `joinChosen` through `StatusPress` `chosen`, so a member signed up meanwhile keeps their own group; `joinInto` is left to the letter Join of a post drawn before plan 8X-1B), `leave`, `done`; any other action 404, a body other than an optional group letter with those three 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This has ended.", as `answerClick` says it: only what a raid alone has, `isRaidAction` (Set time, Screenshot feedback), is said to be a raid's, and no press of the map is one of those; Done is a max battle's too, plan 8X-3); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
+- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups newest first (`newestFirst`) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; Group… and Meet… are not on the map: follow-ups, the web UX sweep); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Since plan 8X-5 the view has `maxes` beside `raids`, `trains` and `meetups` (below, "Max battles on the map"), and every party's attendance says the member's Remote switch (`remote: { offered, on }`: `on` whether the member takes part remotely, false while not signed up, nobody else's; `offered` where the post has Remote, `remoteAllowed`, every party but an elite raid, never while read-only); Remote is pressed apart from `actions` (`MAP_REMOTE`), which the page draws as buttons. Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
+- **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join`, `here` (each with body `{ group }`, the group a newcomer chose in the popup, plan 8X-1B: the dialog's Submit by the group's letter, `joinChosen` through `StatusPress` `chosen`, so a member signed up meanwhile keeps their own group; `joinInto` is left to the letter Join of a post drawn before plan 8X-1B), `leave`, `done`, and `remote` (plan 8X-5, `MAP_REMOTE`, no body: toggles the member's Remote as the post's button does, `AttendanceService.setRemote(…, 'toggle')`, answered in `remoteWords`; a newcomer is signed up as interested and remote, an elite raid refused in the post's words, 422; for every kind whose post has Remote); any other action 404, a body other than an optional group letter with those three 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This has ended.", as `answerClick` says it: only what a raid alone has, `isRaidAction` (Set time, Screenshot feedback), is said to be a raid's, and no press of the map is one of those; Done is a max battle's too, plan 8X-3); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
 - **Rehearsal mode** (8C) leaves the web server off (`servedSettings`); were it on, a press would still go through `AttendanceService` over the wrapped party gateway, as every click does.
 - **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; the picture of its first raid that has one as a 36 px icon, `gymPicture`, `raid-icon`; a red dot without one), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), meetups and raids at gyms the map does not show in the side panel `#parties` (in the template, hidden until it has something; such a raid is named by its `place`, with the address line and Directions a gym's popup has, `raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
 
@@ -66,10 +66,10 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 ## Trains on the map (plan 8M-5)
 
 - **One code path per command** (spec 3.5, 3.7): what `/train`, the `/route` subcommands, `/next`, `/previous`, `/skip`, `/finish` and `/conductor` do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs`, `addStopAs`, `removeStopAs`, `moveStopAs`, `clearRouteAs`, `saveRouteAs`, `loadRouteAs`, `forgetRouteAs`, `moveTrainAs`, `setConductorAs`, `clearConductorAs`; `TrainAnswer`: `ok`, `refused` with the service's reason, `gone`), in the command's words; the commands throw a refusal as a `UserError` and reply with the text, the map answers them. The panel of the post keeps its own answer (it draws itself anew); the map calls the same service methods with the same `from`, `target` and `first`, and words Reverse and the mode with `reverseRouteAs` and `setAtEndAs`. The web server is given what the commands read and call (`TrainWebDeps.ctx`, `TrainWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
-- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop, what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `panel` (`trainPanelOf`: as the post's "Manage train…" opens it, none for who may not move the train, a train without a route, or while read-only; where the train is, `placeOf`; the moves `cannotMove` allows, each with where it leads, `targetOf`; the handle of the stop the route begins with where `cannotReverse` allows Reverse; the mode); `route` the stops' keys and `spots` the power spots of the route Pine keeps with their names and places (`PartyViewInput.spotOf`, plan 8X-4), which the line, the ring, route mode's numbers and the popup (`<title> (power spot)`, Directions) go through; power spots as a layer, Add to route from a spot and the panel's kind menu on the map are plan 8X-5's and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The route is the version of the route (below). Nothing of it while read-only.
-- **Starting a train** `POST /s/<guild>/api/trains`, body `{ region, name, time?, atEnd? }` (strict: any region of the server by id, as `/api/geo` lists it; the name up to `/train`'s 80 characters, blanks allowed so that they are refused in its words; the start as `/meet` takes it, up to 40; the mode as `/train`'s `at-end`). Before the body is read (`onRequest`): 60 a minute per address (`TRAIN_WRITES_PER_ADDRESS_MINUTE`, shared by every write of trains) and `postGuard`. Then the session (403) and the body (400); who starts it (`actingOnTheMap`); the region (of this server, else 404, whatever the id); its forum (none: 422 in `/train`'s words, the region named `#name`, `Region <id>` without a channel; `barred` 403; Discord unreachable 503); what `/train`'s guard and `/meet`'s reader refuse (a blank name 422 "Give a name of 1 to 80 characters."; a time that is none, read by `typedTimedTime` over `newPartyTimes('train', now)`, a party not made yet, 422 in its words); only then `/train`'s throttle in its window; then `startTrainAs` as the member (privacy and automatic status as `/train`), the train made with its start (`TrainRequest.startTime`, `NewTimedParty.startTime`, floored to the minute as `/meet` floors it), so that its post and the DM of who asked to hear of new trains say it from the first. The answer (`TrainAnswer`): 200 `{ ok: true, text: "Your train is made. It starts at 6:15 PM. Click gyms on the map to add its stops.", train }`, and for a maker who is not signed up (automatic status None) `/train`'s clause after it (`notSignedUpWords`: "You are not signed up for it, as your /settings auto-status is None: sign up in its popup or its post to move the train or to be its conductor."); a region that lost its forum meanwhile 422. Logged `{ user, guild, region, outcome }`, "a train was started on the map".
+- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop, what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `panel` (`trainPanelOf`: as the post's "Manage train…" opens it, none for who may not move the train, a train without a route, or while read-only; where the train is, `placeOf`; the moves `cannotMove` allows, each with where it leads, `targetOf`; the handle of the stop the route begins with where `cannotReverse` allows Reverse; the mode); `route` the stops' keys and `spots` the power spots of the route Pine keeps with their names and places (`PartyViewInput.spotOf`, plan 8X-4), which the line, the ring, route mode's numbers and the popup (`<title> (power spot)`, Directions) go through; `trainKind` and `trainKindWords` (plan 8X-5: what it goes to, as `TRAIN_KIND_WORDS` names it, `Max Battle Train`; not `kind`, which says that the party is a train) and `may.kind` (whether the member may set it, `mayNotMove`, as the panel's menu: also for a train without a route, whose `panel` is null); power spots as a layer, Add to route from a spot (the add body takes a spot's key already) and the kind menu are the page's, left for the UX pass (follow-ups, "From Phase 8X-5"); and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The route is the version of the route (below). Nothing of it while read-only.
+- **Starting a train** `POST /s/<guild>/api/trains`, body `{ region, name, time?, atEnd?, kind? }` (strict: any region of the server by id, as `/api/geo` lists it; the name up to `/train`'s 80 characters, blanks allowed so that they are refused in its words; the start as `/meet` takes it, up to 40; the mode as `/train`'s `at-end`; the kind as its `kind`, plan 8X-5, a raid train without one). Before the body is read (`onRequest`): 60 a minute per address (`TRAIN_WRITES_PER_ADDRESS_MINUTE`, shared by every write of trains) and `postGuard`. Then the session (403) and the body (400); who starts it (`actingOnTheMap`); the region (of this server, else 404, whatever the id); its forum (none: 422 in `/train`'s words, the region named `#name`, `Region <id>` without a channel; `barred` 403; Discord unreachable 503); what `/train`'s guard and `/meet`'s reader refuse (a blank name 422 "Give a name of 1 to 80 characters."; a time that is none, read by `typedTimedTime` over `newPartyTimes('train', now)`, a party not made yet, 422 in its words); only then `/train`'s throttle in its window; then `startTrainAs` as the member (privacy and automatic status as `/train`), the train made with its start (`TrainRequest.startTime`, `NewTimedParty.startTime`, floored to the minute as `/meet` floors it), so that its post and the DM of who asked to hear of new trains say it from the first. The answer (`TrainAnswer`): 200 `{ ok: true, text: "Your train is made. It starts at 6:15 PM. Click gyms on the map to add its stops.", train }`, and for a maker who is not signed up (automatic status None) `/train`'s clause after it (`notSignedUpWords`: "You are not signed up for it, as your /settings auto-status is None: sign up in its popup or its post to move the train or to be its conductor."); a region that lost its forum meanwhile 422. Logged `{ user, guild, region, outcome }`, "a train was started on the map".
 - **The route** `POST /s/<guild>/api/trains/<id>/route/<edit>`, edit `add` (`{ drawn, stop }`: the stop by its key, `stopKey`, plan 8X-4: a gym's id or `w<Wayfarer id>`; anything else 400, a stop of no region of the server 404; the route editor adds the gyms clicked; before 8X-4 the body was `{ drawn, gym }` with `drawn` the gyms' ids as numbers, and a page opened before the update keeps its old bundle, whose edits are refused as malformed, 400, and which draws no train line or ring (it looks the stop keys up as gym numbers, so every train is listed as unplaced), until the member reloads it: nothing reloads the page by itself), `remove` (`{ drawn, stop }`), `move` (`{ drawn, from, to }`), `clear` (`{ drawn }`), `save` (`{ drawn, name }`), `load` (`{ drawn, route }`), `forget` (`{ route }`): stops by their numbers from 1, as `/route` takes them; a saved route by the id the list gave it. **The version of the route** is the route itself: every edit but `forget` carries the route it was drawn from (`drawn`, the train's `route` as the page had it), and `TrainService` refuses it inside the store when the route is another by now (`routeDrawn`, reason `route-edited`, "The route changed meanwhile: here it is as it is now.", 409 with the train as it is now; a save is checked against the store's train before it writes); the commands give none, so they work as before. The order: the per-address limit, `postGuard` and an edit the map knows (404) before the body; the session and the body; who edits; an active train of this server as the store has it (anything else, a meetup's id among them, 409 "This train is over.", never read from the database); its forum (`barred` 403, unreachable 503); who may (`mayNotArrange` for add, remove and move, `mayNotClear` for clear, `mayNotLoad` for load: 403 in the command's words, "You are not signed up for this train.", with the train as the member sees it, who has passed its forum's access, so that the page draws the editor or the panel again without the controls); a gym of a region of this server (`reaches`; any other id 404, so nobody learns of other servers' gyms); only then the subcommand's throttle in its window (`route add`, … `CHANGE_THROTTLE`); then its code path. 200 `ok`, 409 for `gone` and a press that no longer fits (`route-edited`, `route-changed`, `train-moved-on`, `conductor-changed`), 422 for any other refusal (`MAX_ROUTE_STOPS`, a gym on the route already, a saved route the member does not have); every answer of who may and of the code path but `gone` carries the train as the member sees it now (the 403 of who may too). The member's saved routes of the train's region `GET /s/<guild>/api/trains/<id>/routes` (members, as the pick lists; an active train of this server, 409 otherwise; its forum, 403, 503; 30 a minute per address): `{ routes: [{ id, name, stops, atEnd }] }`, as `/route load`'s list offers them. Logged `{ user, guild, party, edit, outcome }`, "a train's route was changed on the map", never a name.
-- **Moving** `POST /s/<guild>/api/trains/<id>/move/<press>`, press `next`, `previous`, `skip` (`{ from, target }`), `finish` (`{ from }`), `reverse` (`{ from, first }`), `at-end` (`{ from, atEnd }`): the Manage train panel, each press carrying where the panel was drawn and where it leads, as the post's controls carry them; the same checks in the same order, who may being `mayNotMove` (the mode: `mayNotArrange`, as `setAtEnd` decides), and the window of the post's controls (`ACTION_THROTTLE`, `controlThrottleKey(PARTY_KIND)`), as a press of the panel counts; then `moveTrainAs` (the command's words, where the train is now, "I am telling the others."), `reverseRouteAs` ("The route is reversed. " and where the train is), `setAtEndAs` (`atEndSentence`). The movement message in the post pings as for any move. Logged "a train was moved on the map". **The conductor** `POST …/conductor/take` and `…/give-up` (body `{ who }`: `none`, `other` or `you`, whose the role was as the page drew the button, `CONDUCTOR_SEEN`): `/conductor set` and `/conductor clear` (`setConductorAs`, `clearConductorAs`); after the checks of every write, a button drawn when the role was another's than it is now 409 "The conductor of this train changed meanwhile: here it is as it is now." with the train (checked by the route against the store's train, not counted, and again inside the store, `conductorDrawn`, reason `conductor-changed`, for a change that was on its way meanwhile: `setConductorAs` and `clearConductorAs` pass `who` to the service), then a sign-up to take the role, the conductor or staff to drop it (403 in their words, with the train), in their windows. A takeover names nobody: "…, in the place of the conductor before." (`setConductorAs` takes a `ConductorNamer`; `/conductor set` passes `DISCORD_CONDUCTOR`, `memberText`). Logged "a train's conductor was changed on the map".
+- **Moving** `POST /s/<guild>/api/trains/<id>/move/<press>`, press `next`, `previous`, `skip` (`{ from, target }`), `finish` (`{ from }`), `reverse` (`{ from, first }`), `at-end` (`{ from, atEnd }`), and `kind` (`{ kind }`, plan 8X-5: the panel's kind menu, as the post's menu, nothing of where the train is; who may is `mayNotMove`, also without a route; `setKindAs`, "This train is a Gigantamax Train now.", `trainKindSentence`; not one of `PANEL_PRESSES`, the panel's buttons, but `KIND_PRESS`): the Manage train panel, each press carrying where the panel was drawn and where it leads, as the post's controls carry them; the same checks in the same order, who may being `mayNotMove` (the mode: `mayNotArrange`, as `setAtEnd` decides), and the window of the post's controls (`ACTION_THROTTLE`, `controlThrottleKey(PARTY_KIND)`), as a press of the panel counts; then `moveTrainAs` (the command's words, where the train is now, "I am telling the others."), `reverseRouteAs` ("The route is reversed. " and where the train is), `setAtEndAs` (`atEndSentence`). The movement message in the post pings as for any move. Logged "a train was moved on the map" (a kind set: "a train's kind was set on the map", `{ user, guild, party, kind, outcome }`). **The conductor** `POST …/conductor/take` and `…/give-up` (body `{ who }`: `none`, `other` or `you`, whose the role was as the page drew the button, `CONDUCTOR_SEEN`): `/conductor set` and `/conductor clear` (`setConductorAs`, `clearConductorAs`); after the checks of every write, a button drawn when the role was another's than it is now 409 "The conductor of this train changed meanwhile: here it is as it is now." with the train (checked by the route against the store's train, not counted, and again inside the store, `conductorDrawn`, reason `conductor-changed`, for a change that was on its way meanwhile: `setConductorAs` and `clearConductorAs` pass `who` to the service), then a sign-up to take the role, the conductor or staff to drop it (403 in their words, with the train), in their windows. A takeover names nobody: "…, in the place of the conductor before." (`setConductorAs` takes a `ConductorNamer`; `/conductor set` passes `DISCORD_CONDUCTOR`, `memberText`). Logged "a train's conductor was changed on the map".
 - **Words:** `pageWords` also writes the bot's masked links as their text (`whereText` links every stop), read in the same one pass from the left as escapes and markdown, so that a bracket a member escaped begins no link.
 - **The page** (`src/web/client/train-forms.ts`, pure: the start form and its body, a train's actions, the route editor and the bodies of its edits, the Manage train panel and the body of a press, reading an answer, `sendTrainForm` over `pressParty`; the DOM side `train-ui.ts`): for a member while the map is not read-only, "New train" in a box at the top of the side panel (`#parties`, now shown for such a member also without parties) opens the start form there (name, region from `/api/geo`, start, mode); a train's popup (and its item in the side panel, where trains the map cannot draw are listed: no route yet, or none of its gyms on the map) gains `trainActions`: "Edit route" (`may.arrange`), "Manage…" (`panel`), "Be the conductor", "Stop being the conductor" or "Take the conductor off", and "You are its conductor." / "It has a conductor.". **Route mode** ("Edit route", and at once after a new train is made by who may arrange it): the route editor in the side panel box (the stops numbered as stored, the train's marked; for who may arrange it (`may.arrange`) up, down, a "move to" list of every position (one `/route move`, so that a stop goes far in one edit) and remove per stop, rather than dragging; "Clear the route" for who may; the saved routes to load or forget; a name to save the route under; Done), the stops numbered on the map over a dashed line (`routeMarkers`; a `divIcon` whose `html` is an element of ours with the number as text, never a string), and a gym clicked (or Enter on a focused one), its dot or the marker of its raids, added as the next stop without its popup opening: Leaflet opens a bound popup before any handler of ours, so the gyms' layers have Leaflet's click and keypress handlers taken off and open their popup from ours, which in route mode adds the stop instead (`gymClicks`, `gymClicked`); a gym on the route already is said under the editor ("The Stacks is on the route already.", `routeEditBody`) and nothing is sent, and a double click whose clicks route mode took does not zoom the map. The edits run one at a time (`RouteEdits`): a gym clicked while an edit is on its way waits for its turn, its body made from the train the answer before gave (so quick clicks do not refuse each other as `route-edited` and burn the throttle), and the editor's controls but Done are off meanwhile; each answer redraws the editor and the numbers from the train it gives, also after a 409; an answer that the train is gone (409 without a train, `routeModeEnds`) ends route mode, any other without a train (429, 503, a broken connection) is said and changes nothing. **The panel** ("Manage…") opens in the train's popup in place of its actions: where the train is, the moves with their targets, "Reverse the route", the mode with Set, Done; it stays open after a move, as the post's does, drawn anew from the answer's train with the words under it, also after a press that no longer fits; the list is asked for again after each move and drawn once the panel or its popup closes; Done draws the map with the train's popup open again, and so does a move after which the member may move it no more (no panel, also the 403 of who may, which carries the train); an answer that the train is gone (409 without a train, `routeModeEnds`) closes the panel, says it and draws the map with nothing opened. The conductor's buttons press at once with `conductorBody`. One form or mode at a time (`FormHold`, shared with the raid and spawn forms: route mode and the start form take it as forms of the trains' box (`take(false, true)`, `aside`), the panel as one of a popup or a side panel item; `formControls` also turns "New train", "Edit route" and "Manage…" off). The list waits under a form, but for one of the trains' box, which a redraw of the side panel keeps in place (`keepTools`: a box already first is not taken out, only what follows it, so a field of the start form or the route editor keeps the focus); the route editor, drawn anew from each answer, keeps the name typed to save under and the saved route picked (`RouteEditorFilled`; the name is emptied once the route is saved): under route mode and the start form the list is drawn (the controls that open another form turned off again after each draw), and the line of the train being routed is left to route mode's numbers (`drawnTrains`), the other trains' lines and markers drawn `interactive: false` meanwhile (`clickable`), so that a gym under them stays a stop to click; as route mode starts and ends, the list the page has is drawn anew at once (`TrainUiDeps.redrawn`; the poller draws only a list that changed), so that the train's own line leaves the map with "Edit route" and comes back with Done.
 
@@ -79,12 +79,22 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - **The view:** `MapMeetup` (`party-data.ts`) carries, besides 8M-3's name, times, link and attendance, its `place` (`meetupPlaceOf`, `party-view.ts`: the snapshot it was named as, its kind and point, the gym's id for a gym, and where it is in `words`: a gym or stop `At <title>`, a pin named by a gym or stop near it `Near <title>`, by its link's name `At <name> (a pin)`, else `At a dropped pin`; null for a meetup from before 8D), its `info` (the information as written; the page sets it as text) and `panel` (`meetupPanelOf`: the editor for who may change it on the map, `mayEditMeetup`, its maker or staff by `isMapStaff`; `start` only for a member signed up, as `/meet` has it; null for anybody else and while read-only). Nobody is named.
 - **Making one** `POST /s/<guild>/api/meetups`, body `{ region, name, place, start, info }` (strict: any region of the server by id; the name up to `/meetup`'s 80 characters, blanks allowed so that they are refused in its words; `place` a gym or a PokéStop as `{ kind, id }` (a gym's number as text, a stop's Wayfarer id) or a pin dropped on the map as `{ lat, lon }`, kept to six decimals; `start` as `/meetup start:` takes it, up to 100; `info` as its form takes it, up to `MAX_MEETUP_DESCRIPTION`). Before the body is read (`onRequest`): 30 a minute per address (`MEETUP_WRITES_PER_ADDRESS_MINUTE`, shared with the changes) and `postGuard`. Then, in this order: the session (403) and the body (400); who makes it (`actingOnTheMap`); the region (of this server, else 404); its forum (none: 422 in `/meetup`'s words, the region named `#name`; `barred` 403; Discord unreachable 503); what `/meetup`'s guards and form refuse, in their order and words, none counted: a bad name (422), a member blocked from making meetups in the server (`MeetupSafety.blocked` with `staff` of the member fetched fresh, asked before the place and the start, as `/meetup` asks it: 403 `MAP_BLOCKED`, "You can't create meetups on this server. To appeal, use /meetup on Discord and press Appeal.", since the map has no Appeal button), the place (a kind that is no gym or PokéStop, a power spot among them: 422 `MAP_PLACE_KINDS_ONLY`, "A meetup can be at a gym, a PokéStop or a pin."; a gym or stop gone or of no region of the server: `PLACE_GONE`; a pin outside the regions: `PIN_NOT_HERE`), the start (`typedTimedTime` over `newPartyTimes('meetup', now)`, 422 in its words), the verdict asked with `blocked: false` (`refused`: `NO_MEETUP_HERE`; `review` with a start less than two hours ahead: `MEETUP_TOO_SOON`; `refusalOf`, shared with `/meetup`'s guard), information of nothing but white space (`NO_INFORMATION`); only then `/meetup`'s throttle in its window (`MEETUP_COMMAND`, `MEETUP_THROTTLE`: two a quarter of an hour from Discord and the map together); then `makeMeetupAs` as the member, the request marked as the map's (`RequestAsk.source: 'map'`, below). The place is named exactly as `/meetup near:` names it: a gym or stop through `pickedPlace` (`src/commands/place-option.ts`, the snapshot `namedPlace` makes of a pick: a gym by the name its post shows), a pin through `PlaceFinder.pin` with `MEETUP_PLACE_KINDS` (named by the nearest gym or stop within 50 m, never a power spot). The answer (`MeetupAnswer`, `src/domain/web/meetup-data.ts`): 200 `{ ok: true, outcome: 'posted', text: "Your meetup is made. Edit… in its popup changes its name, information and times.", meetup }` (the meetup as the map shows it to the member), 200 `{ ok: true, outcome: 'held', text: MEETUP_HELD }` (nothing posted: the moderators decide, the member is told by DM, never why; 200 rather than 202, since the page reads `outcome` either way), 403 for a block that came meanwhile, 422 `{ ok: false, text }` for every other refusal in `/meetup`'s words (`MeetupSafety.make`'s `power-spot` among them, which the map never sends). Logged at info, one line per request once who makes it is known, a refusal too (plan 8S-3): `{ user, guild, region, outcome }` (the region once it is one of the server's; `makeMeetupAs`'s kind, or what refused it: `no-region`, `no-forum`, `barred`, `unreachable`, `blocked`, `refused` for `/meetup`'s guards and form, `throttled`), "a meetup was made on the map", never a text or the place.
 - **The moderators' post** of a meetup asked for on the map says so: "Asked by **Name** (<@id>) on the map in <#region>" (`MeetupRequestRecord.source`, `map` or null; migration 021 adds `MeetupRequest.source`), before and after a decision, since the post is drawn anew from the row.
-- **The PokéStops of a box** `GET /s/<guild>/api/stops?south&west&north&east` (members, as the pick lists: 401, 403, 503; 60 a minute per address; a box that is none, beyond the world or inverted 400; the page keeps the map's view to the world first, `stopsBox`: latitude to [-90, 90], longitude to [-180, 180]): `StopsView`, the kept stops with a title in a region of this server inside the box, as `[id, lat, lon, title]`, the nearest to the box's middle first, at most `MAX_MAP_STOPS` (300), `more` when the box holds more (the page says to zoom in). Power spots and other Wayspots are never offered; gyms are on the map already. `private, no-store`. The editor's data (staff only) is the only other Wayspot route, so the map has its own.
+- **The PokéStops of a box** `GET /s/<guild>/api/stops?south&west&north&east` (members, as the pick lists: 401, 403, 503; 60 a minute per address; a box that is none, beyond the world or inverted 400; the page keeps the map's view to the world first, `stopsBox`: latitude to [-90, 90], longitude to [-180, 180]): `StopsView`, the kept stops with a title in a region of this server inside the box, as `[id, lat, lon, title]`, the nearest to the box's middle first, at most `MAX_MAP_STOPS` (300), `more` when the box holds more (the page says to zoom in). Power spots are never offered here (they are `/api/powerspots`'s, plan 8X-5, for max battles), nor other Wayspots; gyms are on the map already. `private, no-store`. The editor's data (staff only) is the only other Wayspot route, so the map has its own.
 - **Changing one** `POST /s/<guild>/api/meetups/<id>/<change>`, change `name` (`{ drawn, name }`), `info` (`{ drawn, info }`; empty removes it, as `/info` sent back empty), `start` (`{ drawn, time }`, as `/meet` takes it; `cancel` removes it, as `/meet time:cancel` does, in `/meet`'s window: `/cancel-meet` has a window of its own, which the map does not use), `end` (`{ drawn, time }`, as `/end`; `none` removes it); any other change 404 before the body is read, a body other than these 400. **Each change carries the value it was drawn from** (`drawn`: the meetup's name, information, start or end as the view gave it). The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active meetup of this server as the store has it (anything else, a raid's id among them, 409 "This meetup is over.", never read from the database); its forum (`barred` 403, unreachable 503); whether the member may change it here (`mayEditMeetup`: its maker or staff; 403 `NOT_YOURS`, "Only its maker and moderators can change this meetup here.", with the meetup: the commands let anybody in the post change its name, information and end, the map, which crosses forums, asks more, as for raids); a change drawn from what the meetup no longer is (409 "This meetup changed meanwhile: here it is as it is now." with the meetup as it is now, uncounted; `TimedPartyService` refuses it again inside the store, `asDrawn`, reason `changed-meanwhile`, for a change on its way meanwhile; the commands give no `drawn`); for a start what `/meet`'s guard refuses before its limit (not signed up: 403 "You are not signed up for this meetup.", with the meetup; a time it cannot read: 422); only then the command's window (`/name`, `/info`, `/end`: `CHANGE_THROTTLE` under their names; a start in `/meet`'s window in a timed party, `START_THROTTLE` under `variedThrottleKey('meet', …)`, the key the router counts a varying limit under; `throttledOnTheMap` with `varies`); then the command's code path with the value drawn (`/end`'s reader after its limit, as in the command: 422). 200 `ok`, 409 for `gone` and `changed-meanwhile`, 422 for any other refusal; every answer but `gone` carries the meetup as the member sees it now. The post's lines and the start's announcement (with its pings, gathered) follow as for the commands. Logged `{ user, guild, party, change, outcome }`, "a meetup was changed on the map", never a text.
 - **Words:** `pageWords` writes a relative timestamp (`<t:…:R>`) as how long until then or since (`relativeTime`, `src/domain/web/clock.ts`: "in 5 h", "1 h 30 min ago", "now"), so that "starts at 7:00 PM (in 5 h)" does not read the clock time twice.
 - **The page** (`src/web/client/meetup-forms.ts`, pure: "New meetup" and "Meetup here", the places picked, `PlacePicking`, the form and its body, the editor and the body of each change, reading an answer, `sendMeetupForm` over `pressParty`; the DOM side `meetup-ui.ts`; the map's side in `party-layer.ts`): a meetup with a place is a purple ring at it (at the gym's dot as the map has it now, else the snapshot's point; without a fill, so that it takes clicks on its line alone and a gym's dot inside it stays a dot to click; on the pane of the rings (`RING_PANE`, `rings`, which the trains' rings share), above Leaflet's markers, so that a raid's picture or route mode's numbers do not hide it), its popup (`meetupPopup`, key `meetup:<id>`) and its item in the side panel (`meetupItem`, every meetup) saying where it is (`words`, Directions to its point), its times, its information as text, the counts and buttons, "Edit…" for who may (`meetupActions`), the post. For a member while the map is not read-only, "New meetup" stands beside "New train" in the side panel's box (`newTrainButton`) and "Meetup here" in every gym's popup (`meetupHereBox`, after "Report spawn here"); either opens the form of a new meetup in the box (`newMeetupForm`: Name, Region (any of the server's; the first region the place lies in, following each place picked, until the member chooses one in the list: `regionChosen`, set by `regionChosenBy`, which choosing none again clears), Place (what was picked, or "No place yet.", with "Pick on the map" / "Pick again"; a pin says it needs a moderator's approval), Starts, Information, "Make the meetup", Cancel; what is missing is said in the page, `newMeetupBody`). **"Pick a place" mode** ("Pick on the map", `PlacePicking`): the form says "Click a gym, a PokéStop or a point of the map." with "Stop picking"; the PokéStops of the map's view are drawn as small blue dots (their titles as tooltips of nodes of ours) from `/api/stops`, asked as the mode starts and again once the map has rested 300 ms after it moved (`StopLoads`: the questions numbered and only the last one's answer shown, none once the mode ended; "Zoom in to see every PokéStop here." said only when whether there are more changes); a gym clicked (its dot or the marker of its raids, through `gymClicks`, before route mode's click), a stop clicked or a point of the map clicked (Leaflet's `click`) becomes the place and ends the mode, no popup opened; the trains' and meetups' lines and markers let clicks through meanwhile (`interactive: false`, as in route mode). Power spots are never offered. After a success the form closes, the words are said, the list is asked for at once and the meetup's popup opened (when it has a place); a held meetup is said in the notice. **The editor** ("Edit…", `meetupEditor`) in the box: the name and the information, filled with what the meetup has, each with Set; "Starts now: 6:00 PM" and Starts with Set (for a member not signed up "Sign up for it to change when it starts."); "Ends now: none" and Ends with Set; Done. The editor keeps, per field, whether the member typed in it and the value it was drawn from (`EditorState`, `editorTyped`: a field typed in is one that no longer shows what it was drawn with, line endings aside (information stored with `\r\n` comes back from the textarea with `\n`, plan 8M-6), and keeps its text and that value from then on). Each Set sends its change alone (`meetupChangeBody`) with `drawn`: for a field typed in the value it was drawn from, for one not typed in the value it shows. Each answer draws the editor anew from the meetup it gives (`editorAfter`): a field not typed in shows what the meetup has now (a name or information changed by somebody else shows up), a field typed in keeps its text and its own `drawn`, so its Set after somebody else changed that value answers 409; the field of a change made shows the meetup's value again, that of a refused one keeps its text, drawn from the meetup the answer gives (the member has been shown it). Its words are said under it, and the list asked for again; an answer that the meetup is gone (409 without a meetup) or that it is no longer the member's to change (its `panel` null: no longer staff, say) closes the editor and says the words (`editorEnds`; `editorStep` decides between closing, drawing anew and, for an editor closed meanwhile, only saying the words). Both forms are forms of the box (`take(false, true)`, `aside`), one form at a time with the raid, spawn and train forms (`formControls` also turns "New meetup", "Meetup here" and "Edit…" off).
 - **Not in it:** a meetup's place cannot change after it is made (no route for it); a member cannot withdraw a pending request; Report on a meetup (8S-2); meetups on Campfire; the PokéStops are drawn only in "pick a place" mode, not from a zoom level up (a question per pan for every member, for little: left for staging to say whether it is wanted); an end given when the meetup is made (`/meetup` takes none, and a request kept for the moderators has no end: it is set with the editor once the meetup is posted).
 
+## Max battles on the map (plan 8X-5)
+
+- **Scope** (Matt, 2026-10-22: the page may be redone, as a responsive or React page for phones): the server side alone, what a new page would use unchanged: the data, the routes, the code paths they share with `/max`. The page (`src/web/client/`) has no max battle feature yet: no power spot layer, no max battle markers or popups, no report form, no kind menu, no Remote button, no Add to route from a spot; they are left for the UX pass (follow-ups, "From Phase 8X-5"). The page as it is reads `raids`, `trains` and `meetups` and ignores the rest.
+- **One code path with `/max`** (spec 3.5; `src/commands/max/max-report.ts`): `reportMaxAs` (the report as the member: privacy and automatic status from their settings, `PartyService.reportMax`, a new pin battle logged for staff and told to the moderators, `ModerationReports.maxAtPin`), `maxReportWords` and `takenWords` with the caller's `ReportNames` (on the map no post, a region as `#name`), `maxBarred` over `MaxAccess` (the forum a new battle would go to and that of the battle at the spot), `blockedAtPin` (staff passed in: `isMapStaff` on the map); `spotAt` (`max-input.ts`) names a spot without an interaction, and `readSpot` names its pins through it; `endingSoonQuestion` (`src/render/max-dialog.ts`) words the ending-soon question for the dialog and the map, each choice with the end it reports. The web server is given what `/max` reads and calls (`MaxWebDeps.ctx`, `MaxWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
+- **The view:** `PartiesView.maxes`, a list of its own in the order the battles were made: `MapMax` (`party-data.ts`), with `MapRaid`'s names where they mean the same, so that one page component can draw both: `id`, `spotId` (the Wayfarer id as `/api/powerspots` lists it, null for a pin), `picture` (the boss's as the post shows it, only from `pictureOrigins`), `level` (`D1` to `G`), `tier` (`Dynamax 2★`), `boss`, `title` (`Dynamax Machamp (2★)`), `endTime`, `link`, `place` (the spot as Where names it: as it is now while it is the same place, `spotNow`; a pin `Unlisted power spot`, address null; six decimals), `attendance` (Done always offered). None once its end has come (`maxEnded`); nothing of it is changed on the map. How the post shows it comes from the renderer (`maxLook`, `src/render/max-post.ts`, over `PartyService.maxView`), given to the pure view as `PartyViewInput.maxLook` (`PartyWebDeps.maxLook`), as `look` is for raids; every route that draws a party passes it.
+- **The power spots of a box** `GET /s/<guild>/api/powerspots?south&west&north&east`: as `/api/stops` (both through `wayspotsInBox`, `src/web/wayspot-box.ts`): members (401, 403, 503), the same box (400 otherwise), the titled power spots in a region of the server, the nearest to the box's middle first, at most `MAX_MAP_SPOTS` (300), `more`; `PowerSpotsView` (`src/domain/web/max-data.ts`), `[id, lat, lon, title]`; `private, no-store`; 60 a minute per address.
+- **The pick lists** `GET /s/<guild>/api/max-options`: `maxOptions` (`src/web/max-options.ts`, pure; types in `max-data.ts`): `/max`'s bosses of the moment in its order (`currentMaxBossChoices`: the featured first, the Gigantamax first in a big event's hours), each `{ value, name, level, tier, featured, image? }`, the value its choice has (`m:<tier>:<key>`, which `readMaxBoss` reads back; none over 100 characters), the picture a post would show (the game's icon, `maxBossPicture`, else the list's) only from `pictureOrigins`; `tiers` for a boss on no list (`TIER_CHOICES`); `zone`. Members, an ETag of its JSON, `private, no-cache`, 304; 30 a minute per address.
+- **A report** `POST /s/<guild>/api/maxes`, body `{ spot }` (a power spot's Wayfarer id) or `{ lat, lon }` (a point), `region?`, `boss` (a value of the list or typed, up to 100), `tier?` (`D1` to `G`, as `/max`'s `tier:`), `end?` (as `end:` takes it, up to 40), `soon?: { value: 'next' | 'soon', end }` (strict; both a spot and a point, neither, or `soon` with a typed end: 400). Before the body is read: 30 a minute per address (`MAX_WRITES_PER_ADDRESS_MINUTE`) and `postGuard`. Then, in this order, none counted: the session (403) and the body (400); who reports (`actingOnTheMap`); the spot (`spotAt`: a power spot by its id, refused `PLACE_GONE` once Pine keeps it no more or it lies in no region of the server; a point, kept to six decimals, in a region of the server, else `PIN_NOT_HERE`, which is the nearest power spot within 50 metres, else an unlisted power spot: the map's point is what a pin is, Q7, as `/max` takes a maps link); the regions of the server at its point (`regionsAtPoint`): several without one of them picked 422 `{ ok: false, text: "This place lies in several regions: pick the one to report the max battle in.", regions }` (names as the raids' list names them); `/max`'s readers (`readMaxBoss`, `reportedEnd`: 422 in their words, the last battle time; where `/max` names its option `tier:`, `WHICH_TIER`, the map says "Which tier? Pick the tier of this boss." with `needs: 'tier'`); a `soon` whose end has passed 422 "That battle has ended meanwhile: nothing was reported." (the dialog's Submit's words); another boss at the spot 409 in `takenWords` (the battle there as `max` where the member may see it; no post named, the hint of `/boss` in the map's words); a new battle at a pin by a member blocked from meetups 403 in the map's words, "… Pick a power spot on the map." (`MAP_PIN_BLOCKED`; `/max`'s `MAX_PIN_BLOCKED` names its list), with `needs: 'listed-spot'` (joining the battle there is allowed, as from `/max`); the forums (`maxBarred`: 403 `{ error: MAX_BARRED }`, Discord unreachable 503); **the ending-soon question** where `/max` opens its dialog (a new battle, no typed end, its end within five minutes): 422 `{ ok: false, text, soon: { choices: [{ value, label, end }] } }` in the dialog's words (until the next rotation first, then until the end about to pass; only the latter, with "Report it anyway?", where no later rotation is left); the report sent again with `soon` takes that end while it is a choice the server offers now (decided anew, no state kept between the two requests), else is asked again with the new choices; a page drops `soon` once that end has passed (a report sent with it is refused as the dialog's Submit refuses it, even where a report without it would pass). Only then `/max`'s throttle in its window (`MAX_COMMAND`, `MAX_THROTTLE`: `/max` counts one use for its dialog and Submit, the map one for the report sent again); then `reportMaxAs` as the member fetched fresh, a battle that came meanwhile in another forum asked about (`mayJoinNoting`: Discord away 503); `no-post` and `ended` give the use back (`givenBackOnTheMap`). `needs` (`MaxNeed`, `max-data.ts`) is the machine part of a refusal a page acts on: `tier`, `listed-spot`; the words are only to be shown. `/max`'s words that name `/max` or its options are said on the map in its own (the namer, `MaxNames`: `ended`, "The max battle there has just ended: report it again.", `MAP_MAX_ENDED`; `bossHint` after another boss's battle, "Open its post and use /boss there to change its boss.", `MAP_BOSS_HINT`; and in the route a spot no region's outline holds any more, "… Pick a power spot on the map.", `MAP_NOT_HERE`, where `/max` says `NOT_HERE`); `/max`'s stay as they are. The answer (`MaxAnswer`): 200 `created`, 409 `exists` (joined: "You have been marked as interested.") and `taken`, 422 `ended`, `no-region` and `no-forum`, 403 `barred`, 503 `no-post` (none of the member's doing, the use given back); `{ ok, text, max? }` with the battle as the map shows it where the member is not kept out of its forum, and " It was posted in #west." after the words when the region picked has no forum and the battle went to another region of the spot (`regionForSpot`). Logged at info once who reports is known, a refusal too: `{ user, guild, spot | pin, outcome }` (the spot's Wayfarer id, or `pin: true`, once known; the outcome's kind, or `no-spot`, `refused`, `several-regions`, `taken`, `blocked`, `barred`, `unreachable`, `ends-soon`, `throttled`), "a max battle was reported on the map", never a text or the point; a new pin battle is also logged by `reportMaxAs` for staff, with its point, as from `/max`.
+- **Remote** on the map is the parties' press `remote` (above, "The parties on the map"), for every kind whose post has Remote; **the train's kind** is in "Trains on the map".
+
 ## The region editor (plans 8M-2, 8M-2F)
 
 - **Who:** staff for regions as `/region` admits them, decided per request by `RegionStaffSource.check` (`DiscordRegionStaff`, `src/discord/web-staff.ts`: the member fetched fresh, `fetchGuildMember(…, true)`, then `regionStaffAnswer`, `src/web/region-staff.ts`): an admin, a moderator or a bot developer by role, or the bot's owner (`isBotManagement`, the guard's own check), who also has Manage Server (`/region`'s `default_member_permissions`, which on the web nobody else checks); their own Manage Channels says whether new channels may be made and forums deleted. A server that grants `/region` to a role through its Integrations overrides (Server Settings, Integrations) still needs Manage Server for that role's members on the web: the overrides are not read (Matt, 2026-10-16: Manage Server is kept). `staff`, `not-staff`, `not-member`, `unknown-server` (no `Guild` row yet), or `unreachable` (Discord failed: read-only for staff seen within 30 minutes, 503 for anybody else, nothing written). The session says only who.
diff --git a/docs/superpowers/plans/phase-0-follow-ups.md b/docs/superpowers/plans/phase-0-follow-ups.md
index 7882c4ad90bedc9b70172c8d0c5606eb7178f707..aff14f5c7adaabce1d11448db52de991fc813d99 100644
--- a/docs/superpowers/plans/phase-0-follow-ups.md
+++ b/docs/superpowers/plans/phase-0-follow-ups.md
@@ -1546,6 +1546,15 @@ Design `docs/superpowers/specs/2026-10-20-max-battles-design.md`, approved by Ma
   - Pokebattler as a fallback source of raid bosses when ScrapedDuck is stale (on 2026-10-20 it listed more T1 bosses and Mega Charizard X/Y beside ScrapedDuck's Mega Dragonite: it seems to keep bosses without an end date).
   - Spot targets ("max battles at this spot"), catch CP and moves for max bosses, a group menu and more than five groups (Matt: dropped "once we're full on groups").
 
+## From Phase 8X-5 (max battles on the map, the server side; prototype 2026-10-22)
+
+Prototyped on `proto-8x5` from the brief `.superpowers/sdd/8x-5-map-server/design.md` (its review R1 to R13 folded in). Matt's scope (2026-10-22): the server alone, what a page made anew (a UX pass, perhaps a responsive or React page for phones) would use unchanged; the page (`src/web/client/`) gets no feature, only the fields its test fixtures need. No migration, no party state change, no command change (`/max` keeps its words; its report is `reportMaxAs`, shared with the map). `web.md`, "Max battles on the map".
+
+- **For the web UX pass (the page's part of design 7, left out on purpose):** power spots as a layer of their own from zoom 15 (`GET …/api/powerspots`, as "pick a place" mode draws the PokéStops), each with a popup: its name, "Report max battle here" (the form over `GET …/api/max-options`: the bosses grouped by tier in the list's order, the featured marked; `tier` for a boss typed that is on no list; the end, optional; the region when the answer names several) and, for a train's route editor, "Add to route" (the add body takes the spot's key, `w<id>`, already); the ending-soon answer (422 with `soon.choices`) as a question in the form, the report sent again with the choice picked (`soon: { value, end }`); max battles drawn at their spot (`PartiesView.maxes`, `MapMax`: the boss's picture in a ring of a max colour, a new `--max` in `theme.css`; a pin battle at its point) with a popup as a raid's (counts, buttons with Done, the post); Remote on every popup where `attendance.remote.offered` (`POST …/parties/<id>/remote`); the kind on the start form (`kind`) and the panel's kind menu (`MapTrain.trainKind`, `trainKindWords`, `may.kind`, `POST …/trains/<id>/move/kind`, also for a train without a route, whose `panel` is null). A train's line through power spot stops works already (8X-4).
+- **Claude's calls (Matt may object):** the map's report takes pins (a point near no power spot), blocked members refused a new battle there and the moderators told, as from `/max`; the ending-soon question is a 422 answer and a second request, no state kept between them (decided anew; an end no longer offered is asked again); Remote is offered on the map for every kind whose post has it; `maxes` is a list of its own, not a fourth kind inside `raids`; a max battle's map fields mirror a raid's names (`tier` the words, `level` the code), also in the pick list (`{ value, name, level, tier, featured, image? }`), where the brief said `tier` and `tierWords`; the train's kind is `trainKind` / `trainKindWords` on `MapTrain` (`kind` says that it is a train); `TRAIN_KIND_WORDS` moved to `src/domain/web/party-data.ts` (the pure view and a page take it; `render/train-words.ts` gives it on); `PowerSpotsView` and the other max types are in `src/domain/web/max-data.ts`, not beside `StopsView`; the moderators' notice of a pin battle reported on the map does not say "on the map" (a meetup request's post does).
+- **Remote on meetups** (Matt, 2026-10-22): it feels odd, but stays for now (meetups served PvP tournaments, played fully remote); Matt may change his mind before cutover: one rule, `remoteAllowed`, decides the post's button and the map's press.
+- **Only staging can show:** the routes against a real map page once the UX pass draws them.
+
 ## From Phase 8X-4 (train kinds and power spot stops, 2026-10-21)
 
 Built subagent-driven from the reviewed prototype (plan `2026-10-21-phase-8x4-train-kinds.md`, tasks 0e69780f..6ef86a05, each equal to its prototype commit; prototype review by two Opus reviewers: two Important (the map's add of a spot untested; typed `/route add` text ignoring the train's kind) and seventeen Minor, then two fix reviews (one Important each, both typed text on a raid train), all folded in; whole-branch review on Opus, high: six Minor, fixed in 0cf32078; typescript-migration merged in, 21fd631f). Check (8,443 tests), build and database suite (520) green; **migration 026** (`PartyHistoryStop.wayspotId`, `PartyHistory.trainKind` with `raid` backfilled for trains already recorded); **party state version 14**; commands change (`/train kind:` and `start:`, `/route add stop:` renamed from `gym:`): deploy the commands before staging. Not yet on Discord: the staging checklist is `docs/superpowers/plans/2026-10-21-phase-8x4-staging.md` (with 8B-3's leftover steps 7, 11, 12, 15–18).
````
