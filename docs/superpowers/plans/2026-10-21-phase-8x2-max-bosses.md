# Phase 8X-2: Max Bosses: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The second plan of max battles (design `docs/superpowers/specs/2026-10-20-max-battles-design.md`, sections 2, 3.2, 9, 10): the bosses of Dynamax and Gigantamax battles, which 8X-3's `/max` will offer. In detail:

- **One spelling of the tiers:** `MaxTier` `D1`…`D5`, `G`; `BattleKind` `raid`, `dynamax`, `gigantamax`; the words ("Dynamax 2★", "Gigantamax Machamp") in one place.
- **The boss repository per family:** raids (every level but the max tiers, EX included) and max bosses; every read and write filters by its family, so neither feed retires, hides or dates the other's bosses; an override without a tier is a raid override.
- **Pokebattler's `/raids` feed** (`settings.maxBattles`: `url`, `refreshMinutes` 360, `firstBattle` 06:00, `lastBattle` 21:00; absent: max bosses off): the tiers `RAID_LEVEL_1_MAX`…`_5_MAX` and `_6_MAX` (Gigantamax), their `_FUTURE` and `_LEGACY` twins ignored; ids mapped to the catalogue; a Gigantamax id its Pokémon with tier G; every 1–4★ boss offered, verified or not (Matt). An upcoming boss is offered from the start of its start date's day, or from the start of a featured event that names it.
- **The game master's Dynamax and Gigantamax lists** (`pokemonExtendedSettings.breadOverrides`), for bosses typed off the list: `GameData.maxBattles`, **`GAME_DATA_VERSION` 6** (the saved game data is downloaded again once at the first start).
- **Max events from ScrapedDuck** (`max-mondays`, `max-battles`), kept apart from the raid events, with their own hours always (an event without hours whose id carries a date takes the clock hours of the nearest event of its kind); kept across reads for eight days once begun (ScrapedDuck drops an event once it is over). **The featured boss:** a Max Monday's boss for its whole week, until the next Max Monday; a Max Battle Day's or Weekend's bosses during their hours, ahead of the week's; a Gigantamax boss an event names offered during its hours even when Pokebattler does not list it.
- **The list `/max` will offer** (`currentMaxBossChoices`): the featured bosses first, then 5★ down to 1★, then Gigantamax.
- **`/admin boss`** offers the max tiers (16 tier choices), keeps max overrides apart, warns when the game data does not list a Pokémon as that kind of max boss, lists max bosses after raid bosses, and `sync max:True` reads the max feed.

**Architecture:**

- **Domain:** `src/domain/pogo/max-tier.ts`, `max-bosses.ts` (`parseMaxBossFeed`, `maxBossOf`, `maxBossPicture`, `comingMaxBosses`), `max-boss-list.ts` (`maxBossChoices`, `typedMaxBoss`); `src/domain/time/max-events.ts` (`parseMaxEventFeed`, `maxEventAt`, `featuredAt`); `GameData.maxBattles` in `game-master.ts`; `canDynamax` / `canGigantamax` on the catalogue.
- **Repository:** a family base in `raid-boss-repository.ts` with `RaidBossRepository` and `MaxBossRepository`; the `level` column (varchar 16) holds the max tiers, no migration.
- **Services:** `BossFeedService<T>` (`src/services/boss-feed-service.ts`) runs one feed (download, 304, schedule, retries, the out-of-date warning, overrides); `RaidBossService` (behaviour and log wording unchanged) and `MaxBossService` are its two families. `RaidEventService.maxEvents()` (`MaxEventProvider`). Wired in `app.ts` only when `maxBattles` is set (`ctx.maxBosses`, `ctx.maxBossAdmin`).

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14, Vitest. No new dependency, no migration, party state unchanged. **A command changes** (`/admin boss`: max tiers, `sync max:`): deploy the commands again before staging. Fixtures recorded 2026-10-20 with Matt's go-ahead: `test/fixtures/pokebattler-raids.json` (every max tier, trimmed), `test/fixtures/max-events.json`; the game master sample rebuilt from the same game master.

**Spec:** the design above, the brief `.superpowers/sdd/8x-2-max-bosses/design.md` and its ledger (Matt's decisions of 2026-10-20 night; git-ignored).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8x2`, tip `96d52f8b`), one commit per task, on `max-battles` b185d8fa (typescript-migration with 8X-1B merged). Each commit typechecks and its unit tests pass; on the tip the full check (8186 tests), the build and the database suite are clean.

**Reviews:** an Opus reviewer went through the prototype (one Important: ScrapedDuck drops a Max Monday once it is over, so the week's boss was lost on Monday night; eight Minor: assumed hours by Day or Weekend, the week across a clock change, zones east of UTC, a warning on a max override, the stale-cache start, a Gigantamax event boss Pokebattler does not list, two tidy-ups), then two fix rounds (three Minor: a "to be announced" Monday without hours, a hidden Gigantamax boss, an event the feed renames; then one doc comment); ready. Every finding is in the commits below.

## Decisions in this plan

Made while prototyping and reviewing, for Matt to look at:

1. **One feed machine, two families** (`BossFeedService<T>`): copying the raid service's 600 lines would duplicate its download, retries and warnings; the raid service's tests pass untouched.
2. **The Dynamax list comes from `pokemonExtendedSettings.breadOverrides`**, not `BREAD_POKEMON_SCALING_SETTINGS` (which lists only the 70 species with custom visuals; Sneasel and Abra are missing there).
3. **Upcoming bosses** are offered from the start of their start date's day in `settings.timezone` (Pokebattler's start for the lake trio is 17:00 New York, the end of their Max Battle Day), or from the start of a featured event that names them.
4. **A Gigantamax boss an event names** is offered as featured during the event's hours when the game master lists it as Gigantamax, even when Pokebattler does not (its `RAID_LEVEL_6_MAX` is empty today); not for Dynamax bosses off the list, whose tier is unknown. Parked for Matt (ledger, Q3).
5. **Max boss changes are not announced** (the 1–4★ pool is large and churns): a follow-up if wanted.
6. **`data/settings.json` gets no `maxBattles` block**: max battles stay off until 8X-3 adds `/max`.
7. **Events of type `event`** (a Gigantamax day inside a larger event, "Dynamax Trails") are not read; only `max-mondays` and `max-battles`.

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment.
- `src/domain/` stays pure. Tests never use the network and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8x2`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed. The fixtures are in the diffs: apply them with `git apply`, never retype them.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock), one at a time. Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/`, `.superpowers/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **The raid family is unchanged:** every query of the raid bosses filters to raid levels; the raid service's behaviour, log wording and tests are as before.
2. **The families stay apart:** a max sync never retires, hides or dates a raid boss, nor the reverse; overrides likewise.
3. **Events and the featured boss** on the recorded fixture: the week's boss across reads and a clock change, the hours from the feed, the zones.
4. **The game data version 6** and the rebuilt sample: nothing else reads the old shape.

### Task 1: 8X-2 task 1: max tiers and the boss repository per family

Prototype commit: `ecf45810801d86be56a0202d06b41971999524c9`

MaxTier (D1 to D5, G), BattleKind and battleKindOf, and the words of a
max tier and boss ("Dynamax 2★", "Dynamax Machamp (2★)", "Machamp ·
Dynamax 2★", "Gigantamax Machamp") in src/domain/pogo/max-tier.ts.

The RaidBoss and RaidBossOverride tables hold two families, kept apart
by their levels: RaidBossRepository (every level but the max tiers, so
the retired EX level stays the raids' to report) and MaxBossRepository
(the levels of MAX_TIERS). Every read and write filters by the family:
replaceFeed, touchActive, lastSyncedAt, listActive, the overrides, their
removal and expiry. An override without a tier is a raid override. The
feed boss and override types take their tier as a parameter (RaidTier by
default). No migration: level is varchar(16).

**Files:**

```
 src/db/repositories/raid-boss-repository.db.test.ts | 106 ++++++++++++++++++++++++-
 src/db/repositories/raid-boss-repository.ts         | 172 +++++++++++++++++++++++++++++-----------
 src/domain/pogo/max-tier.test.ts                    |  69 ++++++++++++++++
 src/domain/pogo/max-tier.ts                         |  52 ++++++++++++
 src/domain/pogo/raid-boss-feed.ts                   |   9 ++-
 src/domain/pogo/raid-bosses.ts                      |  15 +++-
 6 files changed, 369 insertions(+), 54 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/pogo/max-tier.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff ecf45810801d86be56a0202d06b41971999524c9 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-2 task 1: max tiers and the boss repository per family`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/db/repositories/raid-boss-repository.db.test.ts b/src/db/repositories/raid-boss-repository.db.test.ts
index bfc374e1c558b13bbc5d81637ed5a83d66853f85..a42fb9120c6e3e2635302f95121d00ba59138575 100644
--- a/src/db/repositories/raid-boss-repository.db.test.ts
+++ b/src/db/repositories/raid-boss-repository.db.test.ts
@@ -2,10 +2,11 @@ import { sql, type Kysely } from 'kysely';
 import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
 import type { FeedBoss } from '../../domain/pogo/raid-boss-feed.js';
 import type { NewBossOverride } from '../../domain/pogo/raid-bosses.js';
+import type { MaxTier } from '../../domain/pogo/max-tier.js';
 import type { RaidTier } from '../../domain/pogo/raid-tier.js';
 import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
 import type { DB } from '../types.js';
-import { RaidBossRepository } from './raid-boss-repository.js';
+import { MaxBossRepository, RaidBossRepository } from './raid-boss-repository.js';
 
 const T3: RaidTier = { level: 'T3', shadow: false };
 const T5: RaidTier = { level: 'T5', shadow: false };
@@ -421,4 +422,107 @@ describe('RaidBossRepository', () => {
       expect(kept).toEqual([{ level: 'EX', active: 0 }]);
     });
   });
+
+  // Plan 8X-2: the max bosses share the tables, kept apart by their levels (`MaxTier`).
+  describe('the families of bosses', () => {
+    let max: MaxBossRepository;
+    const maxBoss = (pokemonId: string, tier: MaxTier): FeedBoss<MaxTier> => ({
+      pokemonId,
+      form: null,
+      tier,
+      shiny: false,
+      name: pokemonId.toLowerCase(),
+    });
+    const maxOverride = (extra: Partial<NewBossOverride<MaxTier>> = {}) => ({
+      ...override(),
+      tier: 'D2' as MaxTier,
+      ...extra,
+    });
+
+    beforeAll(() => {
+      max = new MaxBossRepository(db);
+    });
+
+    it('store the max tiers and read them back', async () => {
+      const list = [maxBoss('MACHAMP', 'D2'), maxBoss('MACHAMP', 'G'), maxBoss('UXIE', 'D5')];
+      await max.replaceFeed(list, NOW);
+      expect(await max.listActive()).toEqual(
+        list.map((entry) => ({ ...entry, firstSeen: NOW, lastSeen: NOW })),
+      );
+      const levels = await db.selectFrom('RaidBoss').select('level').orderBy('id').execute();
+      expect(levels.map((row) => row.level)).toEqual(['D2', 'G', 'D5']);
+    });
+
+    it('a max sync never retires or hides a raid boss, and a raid sync no max boss', async () => {
+      await bosses.replaceFeed([boss('YVELTAL', T5), boss('MACHAMP', T3)], NOW);
+      await max.replaceFeed([maxBoss('MACHAMP', 'D2')], NOW);
+      await max.replaceFeed([maxBoss('UXIE', 'D5')], NOW + HOUR);
+      expect((await bosses.listActive()).map((b) => [b.pokemonId, b.lastSeen])).toEqual([
+        ['YVELTAL', NOW],
+        ['MACHAMP', NOW],
+      ]);
+      await bosses.replaceFeed([boss('ZEKROM', T5)], NOW + 2 * HOUR);
+      expect((await max.listActive()).map((b) => [b.pokemonId, b.tier])).toEqual([['UXIE', 'D5']]);
+      await max.replaceFeed([], NOW + 3 * HOUR);
+      expect((await bosses.listActive()).map((b) => b.pokemonId)).toEqual(['ZEKROM']);
+    });
+
+    it('each family is touched and dated by itself', async () => {
+      await bosses.replaceFeed([boss('YVELTAL', T5)], NOW);
+      await max.replaceFeed([maxBoss('MACHAMP', 'D2')], NOW + HOUR);
+      // A fresh max sync must not hide that the raid feed is stale, nor the reverse.
+      expect(await bosses.lastSyncedAt()).toBe(NOW);
+      expect(await max.lastSyncedAt()).toBe(NOW + HOUR);
+      await bosses.touchActive(NOW + 2 * HOUR);
+      expect(await max.lastSyncedAt()).toBe(NOW + HOUR);
+      await max.touchActive(NOW + 3 * HOUR);
+      expect(await bosses.lastSyncedAt()).toBe(NOW + 2 * HOUR);
+      expect(await max.lastSyncedAt()).toBe(NOW + 3 * HOUR);
+    });
+
+    it('a raid boss and a max boss of one Pokémon are two rows', async () => {
+      await bosses.replaceFeed([boss('MACHAMP', T3)], NOW);
+      await max.replaceFeed([maxBoss('MACHAMP', 'D2'), maxBoss('MACHAMP', 'G')], NOW);
+      expect(await bosses.listActive()).toHaveLength(1);
+      expect(await max.listActive()).toHaveLength(2);
+    });
+
+    it('keep their overrides apart, a shiny override without a tier with the raids', async () => {
+      const told: { id: number; level: string }[] = [];
+      const raids = new RaidBossRepository(db, (row) => told.push(row));
+      const raidAdd = await raids.saveOverride(override(), NOW);
+      const anyTier = await raids.saveOverride(
+        override({ action: 'shiny', pokemonId: 'MACHAMP', tier: null, shiny: true }),
+        NOW,
+      );
+      const maxHide = await max.saveOverride(maxOverride({ action: 'hide' }), NOW);
+      const maxShiny = await max.saveOverride(
+        maxOverride({ action: 'shiny', pokemonId: 'MACHAMP', tier: 'G', shiny: true }),
+        NOW,
+      );
+      expect((await raids.listOverrides()).map((o) => o.id)).toEqual([raidAdd.id, anyTier.id]);
+      expect(await max.listOverrides()).toEqual([maxHide, maxShiny]);
+      // A max override is no override of a tier the raids do not know.
+      expect(told).toEqual([]);
+    });
+
+    it('a family removes only its own overrides', async () => {
+      const raidAdd = await bosses.saveOverride(override({ expiresAt: NOW }), NOW - HOUR);
+      const maxAdd = await max.saveOverride(maxOverride({ expiresAt: NOW }), NOW - HOUR);
+      expect(await max.removeOverride(raidAdd.id)).toBe(false);
+      expect(await bosses.removeOverride(maxAdd.id)).toBe(false);
+      expect(await max.removeExpiredOverrides(NOW)).toBe(1);
+      expect((await bosses.listOverrides()).map((o) => o.id)).toEqual([raidAdd.id]);
+      expect(await bosses.removeExpiredOverrides(NOW)).toBe(1);
+      expect(await max.removeOverride(maxAdd.id)).toBe(false);
+    });
+
+    it('a max override replaces only max overrides', async () => {
+      await bosses.saveOverride(override({ action: 'hide', pokemonId: 'MACHAMP' }), NOW);
+      await max.saveOverride(maxOverride({ action: 'hide', pokemonId: 'MACHAMP' }), NOW);
+      await max.saveOverride(maxOverride({ action: 'hide', pokemonId: 'MACHAMP' }), NOW + 1);
+      expect(await bosses.listOverrides()).toHaveLength(1);
+      expect((await max.listOverrides()).map((o) => o.createdAt)).toEqual([NOW + 1]);
+    });
+  });
 });
diff --git a/src/db/repositories/raid-boss-repository.ts b/src/db/repositories/raid-boss-repository.ts
index 3710c17cfa2edfddcd467280f47534ddd9275bef..359770abfdac4e52e0751ecdbae4b114134b9d44 100644
--- a/src/db/repositories/raid-boss-repository.ts
+++ b/src/db/repositories/raid-boss-repository.ts
@@ -1,4 +1,5 @@
-import type { Kysely } from 'kysely';
+import type { ExpressionBuilder, Kysely } from 'kysely';
+import { isMaxTier, MAX_TIERS, type MaxTier } from '../../domain/pogo/max-tier.js';
 import type { FeedBoss } from '../../domain/pogo/raid-boss-feed.js';
 import {
   isOverrideAction,
@@ -9,28 +10,59 @@ import { isRaidLevel, raidTier, type RaidTier } from '../../domain/pogo/raid-tie
 import { inTransaction } from '../transaction.js';
 import type { DB } from '../types.js';
 
-/** A feed boss as stored, with when the feed first and last listed it (epoch ms). */
-export interface StoredBoss extends FeedBoss {
+/**
+ * A feed boss as stored, with when the feed first and last listed it (epoch ms). `firstSeen` is
+ * when it is a boss from: the read that first listed it, or the start the feed gave for an
+ * upcoming one (`FeedBoss.startsAt`), which may be later than that read.
+ */
+export interface StoredBoss<T = RaidTier> extends FeedBoss<T> {
   firstSeen: number;
   lastSeen: number;
 }
 
-/** What the raid boss service needs from storage. */
-export interface RaidBossStore {
-  listActive(): Promise<StoredBoss[]>;
-  replaceFeed(bosses: readonly FeedBoss[], now: number): Promise<void>;
+/** What a boss service needs from storage: the rows of one family (`BossFamily`). */
+export interface BossStore<T> {
+  listActive(): Promise<StoredBoss<T>[]>;
+  replaceFeed(bosses: readonly FeedBoss<T>[], now: number): Promise<void>;
   touchActive(now: number): Promise<void>;
   lastSyncedAt(): Promise<number | undefined>;
-  listOverrides(): Promise<BossOverride[]>;
-  saveOverride(override: NewBossOverride, now: number): Promise<BossOverride>;
+  listOverrides(): Promise<BossOverride<T>[]>;
+  saveOverride(override: NewBossOverride<T>, now: number): Promise<BossOverride<T>>;
   removeOverride(id: number): Promise<boolean>;
   removeExpiredOverrides(now: number): Promise<number>;
 }
 
-function tierOf(level: string | null, shadow: number): RaidTier | undefined {
-  return level !== null && isRaidLevel(level) ? raidTier(level, shadow === 1) : undefined;
+/** What the raid boss service needs from storage. */
+export type RaidBossStore = BossStore<RaidTier>;
+/** What the max boss service needs from storage. */
+export type MaxBossStore = BossStore<MaxTier>;
+
+/**
+ * The rows of the boss tables that are one family's, and how its tiers are kept in the `level`
+ * and `shadow` columns (design `2026-10-20-max-battles-design.md`, section 10: the repository per
+ * family). The max family has the levels of `MAX_TIERS`; the raid family everything else, so a
+ * level no version knows (the retired EX tier, one of a later version) stays the raids' to
+ * report, and an override without a tier (a shiny one for every tier) is a raid override.
+ */
+interface BossFamily<T> {
+  readonly maxLevels: boolean;
+  tierOf(level: string, shadow: boolean): T | undefined;
+  columns(tier: T): { level: string; shadow: 0 | 1 };
 }
 
+const RAID_FAMILY: BossFamily<RaidTier> = {
+  maxLevels: false,
+  tierOf: (level, shadow) => (isRaidLevel(level) ? raidTier(level, shadow) : undefined),
+  columns: (tier) => ({ level: tier.level, shadow: tier.shadow ? 1 : 0 }),
+};
+
+const MAX_FAMILY: BossFamily<MaxTier> = {
+  maxLevels: true,
+  // A max tier has no shadow battles: a row with the flag is none this version can show.
+  tierOf: (level, shadow) => (isMaxTier(level) && !shadow ? level : undefined),
+  columns: (tier) => ({ level: tier, shadow: 0 }),
+};
+
 /** The `form` column holds `''` for a Pokémon without a form. */
 function formColumn(form: string | null): string {
   return form ?? '';
@@ -38,40 +70,53 @@ function formColumn(form: string | null): string {
 
 function identity(pokemonId: string, form: string, level: string, shadow: number): string {
   // The columns compare without regard to case, so the identity does too. It relies on ids being
-  // ASCII (the feed parser and `overrideProblem` guarantee it); the collation would also treat
+  // ASCII (the feed parsers and `overrideProblem` guarantee it); the collation would also treat
   // accented letters as equal to plain ones, which this comparison does not.
   return `${pokemonId}|${form}|${level}|${String(shadow)}`.toUpperCase();
 }
 
-/** The `RaidBoss` and `RaidBossOverride` tables. */
-export class RaidBossRepository implements RaidBossStore {
+/** The `RaidBoss` and `RaidBossOverride` tables, as far as they are one family's. */
+class BossRepository<T> implements BossStore<T> {
   private readonly reported = new Set<number>();
 
   /**
-   * `unreadable` hears of an override whose tier this version does not know (one for the EX
-   * tier, which plan 4F removed, or one written by a newer version), once per row: such an
-   * override is left out and left alone.
+   * `unreadable` hears of an override of the family whose tier this version does not know (one
+   * for the EX tier, which plan 4F removed, or one written by a newer version), once per row:
+   * such an override is left out and left alone.
    */
-  constructor(
+  protected constructor(
     private readonly db: Kysely<DB>,
-    private readonly unreadable: (override: { id: number; level: string }) => void = () =>
-      undefined,
+    private readonly family: BossFamily<T>,
+    private readonly unreadable: (override: { id: number; level: string }) => void,
   ) {}
 
+  /** The boss rows of the family: a level of `MAX_TIERS` or not. */
+  private ours(eb: ExpressionBuilder<DB, 'RaidBoss'>) {
+    return eb('level', this.family.maxLevels ? 'in' : 'not in', [...MAX_TIERS]);
+  }
+
+  /** The override rows of the family, as `ours`; one without a level is a raid override. */
+  private oursOverride(eb: ExpressionBuilder<DB, 'RaidBossOverride'>) {
+    return this.family.maxLevels
+      ? eb('level', 'in', [...MAX_TIERS])
+      : eb.or([eb('level', 'is', null), eb('level', 'not in', [...MAX_TIERS])]);
+  }
+
   /** The bosses the feed listed at the last sync, in the order they were first stored. */
-  async listActive(): Promise<StoredBoss[]> {
+  async listActive(): Promise<StoredBoss<T>[]> {
     const rows = await this.db
       .selectFrom('RaidBoss')
       .selectAll()
       .where('active', '=', 1)
+      .where((eb) => this.ours(eb))
       .orderBy('id')
       .execute();
-    const bosses: StoredBoss[] = [];
+    const bosses: StoredBoss<T>[] = [];
     for (const row of rows) {
-      const tier = tierOf(row.level, row.shadow);
+      const tier = this.family.tierOf(row.level, row.shadow === 1);
       // A level this version does not know (written by a newer one, or the EX tier of an
       // older one): not a boss it can show. The next sync marks it as no longer listed.
-      if (!tier) continue;
+      if (tier === undefined) continue;
       bosses.push({
         pokemonId: row.pokemonId,
         form: row.form === '' ? null : row.form,
@@ -87,16 +132,18 @@ export class RaidBossRepository implements RaidBossStore {
   }
 
   /**
-   * Makes `bosses` the stored feed list, in one transaction: a boss already stored keeps its
-   * `firstSeen` if it was still active and starts again if it had gone; every listed boss gets
-   * `lastSeen = now`; a stored boss that is not listed becomes inactive. Of a boss listed twice
-   * the last entry's `shiny`, `name` and `image` are stored (the parser removes duplicates before that).
+   * Makes `bosses` the stored feed list of the family, in one transaction: a boss already stored
+   * keeps its `firstSeen` if it was still active and starts again if it had gone; every listed
+   * boss gets `lastSeen = now`; a stored boss of the family that is not listed becomes inactive
+   * (the other family's rows are not touched). Of a boss listed twice the last entry's `shiny`,
+   * `name` and `image` are stored (the parsers remove duplicates before that).
    */
-  async replaceFeed(bosses: readonly FeedBoss[], now: number): Promise<void> {
+  async replaceFeed(bosses: readonly FeedBoss<T>[], now: number): Promise<void> {
     await inTransaction(this.db, async (trx) => {
       const stored = await trx
         .selectFrom('RaidBoss')
         .select(['id', 'pokemonId', 'form', 'level', 'shadow', 'active'])
+        .where((eb) => this.ours(eb))
         .forUpdate()
         .execute();
       const byIdentity = new Map(
@@ -104,9 +151,9 @@ export class RaidBossRepository implements RaidBossStore {
       );
       const listed = new Set<number>();
       for (const boss of bosses) {
-        const shadow = boss.tier.shadow ? 1 : 0;
+        const { level, shadow } = this.family.columns(boss.tier);
         const form = formColumn(boss.form);
-        const row = byIdentity.get(identity(boss.pokemonId, form, boss.tier.level, shadow));
+        const row = byIdentity.get(identity(boss.pokemonId, form, level, shadow));
         if (row) {
           listed.add(row.id);
           await trx
@@ -127,7 +174,7 @@ export class RaidBossRepository implements RaidBossStore {
             .values({
               pokemonId: boss.pokemonId,
               form,
-              level: boss.tier.level,
+              level,
               shadow,
               shiny: boss.shiny ? 1 : 0,
               name: boss.name,
@@ -140,11 +187,11 @@ export class RaidBossRepository implements RaidBossStore {
           const id = Number(inserted.insertId);
           listed.add(id);
           // A boss listed twice must find its row the second time.
-          byIdentity.set(identity(boss.pokemonId, form, boss.tier.level, shadow), {
+          byIdentity.set(identity(boss.pokemonId, form, level, shadow), {
             id,
             pokemonId: boss.pokemonId,
             form,
-            level: boss.tier.level,
+            level,
             shadow,
             active: 1,
           });
@@ -171,27 +218,37 @@ export class RaidBossRepository implements RaidBossStore {
       .updateTable('RaidBoss')
       .set({ lastSeen: String(now) })
       .where('active', '=', 1)
+      .where((eb) => this.ours(eb))
       .execute();
   }
 
-  /** When the feed was last read successfully (epoch ms); undefined before the first sync. */
+  /**
+   * When the family's feed was last read successfully (epoch ms); undefined before the first
+   * sync. Each family by itself: a fresh read of one feed must not hide that the other is stale.
+   */
   async lastSyncedAt(): Promise<number | undefined> {
     const row = await this.db
       .selectFrom('RaidBoss')
       .select((eb) => eb.fn.max('lastSeen').as('lastSeen'))
       .where('active', '=', 1)
+      .where((eb) => this.ours(eb))
       .executeTakeFirst();
     return row?.lastSeen == null ? undefined : Number(row.lastSeen);
   }
 
-  /** Every override, expired ones included, oldest first. Rows it cannot read are left out. */
-  async listOverrides(): Promise<BossOverride[]> {
-    const rows = await this.db.selectFrom('RaidBossOverride').selectAll().orderBy('id').execute();
-    const overrides: BossOverride[] = [];
+  /** Every override of the family, expired ones included, oldest first. Rows it cannot read are left out. */
+  async listOverrides(): Promise<BossOverride<T>[]> {
+    const rows = await this.db
+      .selectFrom('RaidBossOverride')
+      .selectAll()
+      .where((eb) => this.oursOverride(eb))
+      .orderBy('id')
+      .execute();
+    const overrides: BossOverride<T>[] = [];
     for (const row of rows) {
-      const tier = tierOf(row.level, row.shadow);
+      const tier = row.level === null ? null : this.family.tierOf(row.level, row.shadow === 1);
       if (!isOverrideAction(row.action)) continue;
-      if (row.level !== null && !tier) {
+      if (row.level !== null && tier === undefined) {
         if (!this.reported.has(row.id)) {
           this.reported.add(row.id);
           this.unreadable({ id: row.id, level: row.level });
@@ -218,10 +275,11 @@ export class RaidBossRepository implements RaidBossStore {
    * same action for the same Pokémon and tier, so that saving twice does not leave two, and for
    * an `autoset` every earlier `autoset` of the tier, so that a tier has one.
    */
-  async saveOverride(override: NewBossOverride, now: number): Promise<BossOverride> {
+  async saveOverride(override: NewBossOverride<T>, now: number): Promise<BossOverride<T>> {
     const form = formColumn(override.form);
-    const shadow = override.tier?.shadow ? 1 : 0;
-    const level = override.tier?.level ?? null;
+    const columns = override.tier === null ? null : this.family.columns(override.tier);
+    const shadow = columns?.shadow ?? 0;
+    const level = columns?.level ?? null;
     const anyPokemon = override.action === 'autoset';
     return inTransaction(this.db, async (trx) => {
       await trx
@@ -251,22 +309,44 @@ export class RaidBossRepository implements RaidBossStore {
     });
   }
 
-  /** Whether there was such an override. */
+  /** Whether there was such an override of the family. */
   async removeOverride(id: number): Promise<boolean> {
     const result = await this.db
       .deleteFrom('RaidBossOverride')
       .where('id', '=', id)
+      .where((eb) => this.oursOverride(eb))
       .executeTakeFirst();
     return result.numDeletedRows > 0n;
   }
 
-  /** Deletes the overrides that expired at or before `now`; returns how many. */
+  /** Deletes the family's overrides that expired at or before `now`; returns how many. */
   async removeExpiredOverrides(now: number): Promise<number> {
     const result = await this.db
       .deleteFrom('RaidBossOverride')
       .where('expiresAt', 'is not', null)
       .where('expiresAt', '<=', String(now))
+      .where((eb) => this.oursOverride(eb))
       .executeTakeFirst();
     return Number(result.numDeletedRows);
   }
 }
+
+/** The raid bosses of the boss tables: every level but the max tiers. */
+export class RaidBossRepository extends BossRepository<RaidTier> {
+  constructor(
+    db: Kysely<DB>,
+    unreadable: (override: { id: number; level: string }) => void = () => undefined,
+  ) {
+    super(db, RAID_FAMILY, unreadable);
+  }
+}
+
+/** The max bosses of the boss tables (plan 8X-2): the levels of `MAX_TIERS`. */
+export class MaxBossRepository extends BossRepository<MaxTier> {
+  constructor(
+    db: Kysely<DB>,
+    unreadable: (override: { id: number; level: string }) => void = () => undefined,
+  ) {
+    super(db, MAX_FAMILY, unreadable);
+  }
+}
diff --git a/src/domain/pogo/max-tier.test.ts b/src/domain/pogo/max-tier.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b0781ebd357ea6099ef43ff255a54ac1d18e3f35
--- /dev/null
+++ b/src/domain/pogo/max-tier.test.ts
@@ -0,0 +1,69 @@
+import { describe, expect, it } from 'vitest';
+import {
+  BATTLE_KINDS,
+  battleKindOf,
+  isMaxTier,
+  MAX_TIERS,
+  maxBossChoiceName,
+  maxBossTitle,
+  maxStars,
+  maxTierLabel,
+  type MaxTier,
+} from './max-tier.js';
+
+describe('max battle tiers', () => {
+  it('are the five Dynamax tiers and Gigantamax, in that order', () => {
+    expect(MAX_TIERS).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'G']);
+  });
+
+  it('are told from other text, raid levels included', () => {
+    for (const tier of MAX_TIERS) expect(isMaxTier(tier)).toBe(true);
+    for (const other of ['T5', 'd2', 'D6', 'G1', 'Mega', '']) expect(isMaxTier(other)).toBe(false);
+  });
+
+  it('fit the level column of the boss tables (16 characters)', () => {
+    for (const tier of MAX_TIERS) expect(tier.length).toBeLessThanOrEqual(16);
+  });
+
+  it('count their stars; Gigantamax has none', () => {
+    expect(MAX_TIERS.map(maxStars)).toEqual([1, 2, 3, 4, 5, undefined]);
+  });
+});
+
+describe('the kind of battle', () => {
+  it('is raid, dynamax or gigantamax', () => {
+    expect(BATTLE_KINDS).toEqual(['raid', 'dynamax', 'gigantamax']);
+  });
+
+  it('of a raid tier is raid, whatever its level', () => {
+    expect(battleKindOf({ level: 'T5', shadow: true })).toBe('raid');
+    expect(battleKindOf({ level: 'SuperMega', shadow: false })).toBe('raid');
+  });
+
+  it('of a max tier is dynamax for the stars and gigantamax for G', () => {
+    const kinds = MAX_TIERS.map((tier) => battleKindOf(tier));
+    expect(kinds).toEqual(['dynamax', 'dynamax', 'dynamax', 'dynamax', 'dynamax', 'gigantamax']);
+  });
+});
+
+describe('the words of a max tier', () => {
+  const tiers: MaxTier[] = ['D2', 'G'];
+
+  it('name the tier', () => {
+    expect(tiers.map(maxTierLabel)).toEqual(['Dynamax 2★', 'Gigantamax']);
+  });
+
+  it('name a boss as a post heads it', () => {
+    expect(tiers.map((tier) => maxBossTitle('Machamp', tier))).toEqual([
+      'Dynamax Machamp (2★)',
+      'Gigantamax Machamp',
+    ]);
+  });
+
+  it('name a boss as a list of choices offers it: two entries for one Pokémon', () => {
+    expect(tiers.map((tier) => maxBossChoiceName('Machamp', tier))).toEqual([
+      'Machamp · Dynamax 2★',
+      'Gigantamax Machamp',
+    ]);
+  });
+});
diff --git a/src/domain/pogo/max-tier.ts b/src/domain/pogo/max-tier.ts
new file mode 100644
index 0000000000000000000000000000000000000000..40fc9f6e9c5040a2771f3776d62d6c1e1f6bd852
--- /dev/null
+++ b/src/domain/pogo/max-tier.ts
@@ -0,0 +1,52 @@
+import type { RaidTier } from './raid-tier.js';
+
+/**
+ * The tiers of max battles (design `2026-10-20-max-battles-design.md`, section 10: one spelling
+ * of the tiers): Dynamax 1 to 5 stars and Gigantamax. The same strings are a max battle's tier
+ * in its state document and its history record, and `RaidBoss.level` / `RaidBossOverride.level`
+ * of a max boss, where the unique key keeps them apart from the raid levels (`RaidLevel`).
+ */
+export const MAX_TIERS = ['D1', 'D2', 'D3', 'D4', 'D5', 'G'] as const;
+export type MaxTier = (typeof MAX_TIERS)[number];
+
+/**
+ * The kinds of battle, for lobby sizes (`settings.lobbies`) and the kinds of train: only those
+ * two read it; everything else reads the tier.
+ */
+export const BATTLE_KINDS = ['raid', 'dynamax', 'gigantamax'] as const;
+export type BattleKind = (typeof BATTLE_KINDS)[number];
+
+export function isMaxTier(value: string): value is MaxTier {
+  return (MAX_TIERS as readonly string[]).includes(value);
+}
+
+/** The kind of battle of a tier: a raid tier is `raid`, `G` is `gigantamax`, a star `dynamax`. */
+export function battleKindOf(tier: RaidTier | MaxTier): BattleKind {
+  if (typeof tier !== 'string') return 'raid';
+  return tier === 'G' ? 'gigantamax' : 'dynamax';
+}
+
+/** The stars of a Dynamax tier; undefined for Gigantamax. */
+export function maxStars(tier: MaxTier): number | undefined {
+  return tier === 'G' ? undefined : Number(tier.slice(1));
+}
+
+/** The tier in words: `Dynamax 2★`, `Gigantamax`. */
+export function maxTierLabel(tier: MaxTier): string {
+  const stars = maxStars(tier);
+  return stars === undefined ? 'Gigantamax' : `Dynamax ${String(stars)}★`;
+}
+
+/** A boss as a post heads it: `Dynamax Machamp (2★)`, `Gigantamax Machamp`. */
+export function maxBossTitle(name: string, tier: MaxTier): string {
+  const stars = maxStars(tier);
+  return stars === undefined ? `Gigantamax ${name}` : `Dynamax ${name} (${String(stars)}★)`;
+}
+
+/**
+ * A boss as a list of choices offers it: `Machamp · Dynamax 2★`, `Gigantamax Machamp`, so that
+ * the Dynamax and the Gigantamax battle of one Pokémon are two choices.
+ */
+export function maxBossChoiceName(name: string, tier: MaxTier): string {
+  return tier === 'G' ? `Gigantamax ${name}` : `${name} · ${maxTierLabel(tier)}`;
+}
diff --git a/src/domain/pogo/raid-boss-feed.ts b/src/domain/pogo/raid-boss-feed.ts
index 07355abcfaae5a7136aa3fc62229a02a44fd0ce0..eb639b0e04471c98172220d7db74a1791e1c44db 100644
--- a/src/domain/pogo/raid-boss-feed.ts
+++ b/src/domain/pogo/raid-boss-feed.ts
@@ -3,8 +3,11 @@ import { searchTokens } from '../search/text.js';
 import type { FormKind } from './names.js';
 import { raidTier, type RaidLevel, type RaidTier } from './raid-tier.js';
 
-/** A raid boss as the feed lists it. */
-export interface FeedBoss {
+/**
+ * A boss as a feed lists it: a raid boss of ScrapedDuck's feed (`T` is `RaidTier`), or a max boss
+ * of Pokebattler's (`MaxTier`).
+ */
+export interface FeedBoss<T = RaidTier> {
   /** Game-master species id, e.g. `BLASTOISE`. */
   pokemonId: string;
   /**
@@ -17,7 +20,7 @@ export interface FeedBoss {
    * made of its name. `resolveBoss` runs the same decision again on the stored row.
    */
   form: string | null;
-  tier: RaidTier;
+  tier: T;
   shiny: boolean;
   /** The feed's English name without `Shadow `. Shown only for a Pokémon the game master does not know. */
   name: string;
diff --git a/src/domain/pogo/raid-bosses.ts b/src/domain/pogo/raid-bosses.ts
index a94280a531e234db0c52d177db132278af55b0d3..6b9d6d11697b6126947d562712ec9e17c9314e16 100644
--- a/src/domain/pogo/raid-bosses.ts
+++ b/src/domain/pogo/raid-bosses.ts
@@ -26,10 +26,17 @@ export interface BossIds {
   form: string | null;
 }
 
-export interface NewBossOverride extends BossIds {
+/**
+ * An override of a boss list: of the raid bosses (`T` is `RaidTier`) or of the max bosses
+ * (`MaxTier`), each family's kept apart in the table by its levels (`BossRepository`).
+ */
+export interface NewBossOverride<T = RaidTier> extends BossIds {
   action: OverrideAction;
-  /** Required unless the action is `shiny`, where null means every tier. */
-  tier: RaidTier | null;
+  /**
+   * Required unless the action is `shiny`, where null means every tier. Only a raid override
+   * has null: a shiny override without a tier covers the raid tiers only.
+   */
+  tier: T | null;
   /** For `shiny`: the value to force. For `add` and `autoset`: whether the added boss can be shiny. */
   shiny: boolean | null;
   /** Epoch ms after which the override no longer applies; null for no expiry. */
@@ -38,7 +45,7 @@ export interface NewBossOverride extends BossIds {
   createdBy: string;
 }
 
-export interface BossOverride extends NewBossOverride {
+export interface BossOverride<T = RaidTier> extends NewBossOverride<T> {
   id: number;
   createdAt: number;
 }
````

### Task 2: 8X-2 task 2: the max boss feed, the game master's max lists, the service

Prototype commit: `c338a5326c62f50fcb7de415414773dc82c7f415`

settings.maxBattles (url, refreshMinutes 360, firstBattle 06:00,
lastBattle 21:00; absent: max bosses off; the files of today load
unchanged). Pokebattler's raid list is read by a pure parser
(parseMaxBossFeed): RAID_LEVEL_1_MAX to _5_MAX as D1 to D5 and
RAID_LEVEL_6_MAX as G, verified or not, the _FUTURE and _LEGACY twins and
the raid tiers left out. Ids map to catalogue entries by their
Pokebattler id, else as a catalogue key or alias (a bare species, a
species known by its default form); a Gigantamax id is its Pokemon with
the tier G; an unknown id is a boss by a name made of it, logged once.
An upcoming boss is a boss from the start of its day in the zone
(Pokebattler's instant for the 14:00 Max Battle Day is 17:00 in New
York), stored as its firstSeen, so a restart keeps it back too.

The game master's Dynamax and Gigantamax lists (GameData.maxBattles,
GAME_DATA_VERSION 6) come from pokemonExtendedSettings.breadOverrides:
BREAD_POKEMON_SCALING_SETTINGS lists only 70 species with visuals of
their own. The fixture builder samples those items; the fixtures were
rebuilt from the same game master. Catalogue: canDynamax, canGigantamax.
maxBossPicture gives a Gigantamax boss the game's Gigantamax icon.

RaidBossService's machinery is now BossFeedService<T> with a family
(noun, parser, list in effect, override rules); RaidBossService and the
new MaxBossService are its two families, the raid service's behaviour and
words unchanged. The list rules (familyBosses, familyOverrideKeys,
diffFeedIn, diffBossesIn) take the family's tier operations. The bot
runs a MaxBossService only with settings.maxBattles (ctx.maxBosses,
ctx.maxBossAdmin).

**Files:**

```
 scripts/game-data/make-fixtures.ts                  |    7 +-
 src/app-context.ts                                  |    5 +
 src/app.ts                                          |   34 +-
 src/config/settings.test.ts                         |   47 +
 src/config/settings.ts                              |   26 +
 src/db/repositories/raid-boss-repository.db.test.ts |   25 +
 src/db/repositories/raid-boss-repository.ts         |   12 +-
 src/domain/pogo/boss-diff.ts                        |   22 +-
 src/domain/pogo/catalogue.test.ts                   |   19 +
 src/domain/pogo/catalogue.ts                        |   30 +
 src/domain/pogo/game-master.test.ts                 |   72 +-
 src/domain/pogo/game-master.ts                      |   49 +-
 src/domain/pogo/max-bosses.test.ts                  |  273 +++
 src/domain/pogo/max-bosses.ts                       |  236 ++
 src/domain/pogo/pokemon-icons.test.ts               |   39 +
 src/domain/pogo/pokemon-icons.ts                    |   27 +
 src/domain/pogo/raid-boss-feed.ts                   |   15 +-
 src/domain/pogo/raid-bosses.ts                      |  175 +-
 src/services/boss-feed-service.ts                   |  714 ++++++
 src/services/max-boss-service.test.ts               |   91 +
 src/services/max-boss-service.ts                    |   64 +
 src/services/raid-boss-service.ts                   |  687 +-----
 test/fixtures/game-data.json                        |    3 +-
 test/fixtures/game-master-sample.json               | 5102 +++++++++++++++++++++++++++++++++++++++
 test/fixtures/pokebattler-raids.json                | 3631 ++++++++++++++++++++++++++++
 test/support/max-boss-service.ts                    |   52 +
 test/support/max-bosses.ts                          |   43 +
 test/support/raid-bosses.ts                         |   59 +-
 test/support/test-context.ts                        |    5 +
 29 files changed, 10835 insertions(+), 729 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/config/settings.test.ts src/domain/pogo/catalogue.test.ts src/domain/pogo/game-master.test.ts src/domain/pogo/max-bosses.test.ts src/domain/pogo/pokemon-icons.test.ts src/services/max-boss-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c338a5326c62f50fcb7de415414773dc82c7f415 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-2 task 2: the max boss feed, the game master's max lists, the service`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/scripts/game-data/make-fixtures.ts b/scripts/game-data/make-fixtures.ts
index 8f7b4ff9fec6c1ec73a7e009e82218e096c299a0..3ac5ef5dbaa024d5fc7c06a7508e1e8190dedd5e 100644
--- a/scripts/game-data/make-fixtures.ts
+++ b/scripts/game-data/make-fixtures.ts
@@ -85,7 +85,12 @@ const texts = parseTextFile(textContent);
 const speciesOf = (item: Item): string | undefined => {
   const pokemon = item.data['pokemonSettings'] as { pokemonId?: string } | undefined;
   const forms = item.data['formSettings'] as { pokemon?: string } | undefined;
-  return pokemon?.pokemonId ?? forms?.pokemon;
+  // The extended settings that hold modes of max battles (`GameData.maxBattles`, plan 8X-2);
+  // the others say only sizes, which the parser does not read.
+  const extended = item.data['pokemonExtendedSettings'] as
+    { uniqueId?: string; breadOverrides?: unknown } | undefined;
+  const maxModes = extended?.breadOverrides === undefined ? undefined : extended.uniqueId;
+  return pokemon?.pokemonId ?? forms?.pokemon ?? maxModes;
 };
 const sampled = gameMaster.filter((item) => SAMPLE_SPECIES.includes(speciesOf(item) ?? ''));
 const MOVE_FIELDS = [
diff --git a/src/app-context.ts b/src/app-context.ts
index 0a344150cc134fb4cb81107ede1cdcc6c1e20932..b4d48bf7dca4d5233d7e5981772c8e81b3ef68b1 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -25,6 +25,7 @@ import type { PlaceSearch } from './services/place-search.js';
 import type { PokebattlerGateway } from './services/pokebattler-gateway.js';
 import type { PartyProvider } from './services/party-store.js';
 import type { PokemonFinder, PokemonNicknames } from './services/pokemon-search-service.js';
+import type { MaxBossAdmin, MaxBossProvider } from './services/max-boss-service.js';
 import type { RaidBossAdmin, RaidBossProvider } from './services/raid-boss-service.js';
 import type { RaidChangeService } from './services/raid-change-service.js';
 import type { RaidEventProvider } from './services/raid-event-service.js';
@@ -61,6 +62,10 @@ export interface AppContext {
   readonly raidBosses: RaidBossProvider;
   /** The boss list for staff (`/admin boss`): the feed as stored, the overrides, a sync now. */
   readonly raidBossAdmin: RaidBossAdmin;
+  /** The max bosses in effect (plan 8X-2): none while `settings.maxBattles` is absent. */
+  readonly maxBosses: MaxBossProvider;
+  /** The max boss list for staff (`/admin boss`); undefined while max battles are off. */
+  readonly maxBossAdmin: MaxBossAdmin | undefined;
   /** Raid Hours and Raid Days from the events feed (see `raidDurationRules`). */
   readonly raidEvents: RaidEventProvider;
   /** The gyms, and finding them by what members type. */
diff --git a/src/app.ts b/src/app.ts
index 33284a1317773c6f5f4ae6be014010a0c76ef00e..be2a5bc8f1937e21662529a2d58ee23bebcde624 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -24,7 +24,7 @@ import { HistoryRepository } from './db/repositories/history-repository.js';
 import { PartyRepository } from './db/repositories/party-repository.js';
 import { PokemonNotificationRepository } from './db/repositories/pokemon-notification-repository.js';
 import { PokemonRepository } from './db/repositories/pokemon-repository.js';
-import { RaidBossRepository } from './db/repositories/raid-boss-repository.js';
+import { MaxBossRepository, RaidBossRepository } from './db/repositories/raid-boss-repository.js';
 import { RegionRepository } from './db/repositories/region-repository.js';
 import { RowIds } from './db/repositories/row-ids.js';
 import { SavedRouteRepository } from './db/repositories/saved-route-repository.js';
@@ -86,6 +86,7 @@ import { PartyService } from './services/party-service.js';
 import { PartyStore } from './services/party-store.js';
 import { PokemonSearchService } from './services/pokemon-search-service.js';
 import { RaidBossAnnouncer } from './services/raid-boss-announcer.js';
+import { MaxBossService, NO_MAX_BOSSES } from './services/max-boss-service.js';
 import { RaidBossService } from './services/raid-boss-service.js';
 import { RaidChangeService } from './services/raid-change-service.js';
 import { TimedPartyService } from './services/timed-party-service.js';
@@ -140,6 +141,8 @@ const MINUTE_MS = 60_000;
 /** How long the party clock waits at start for the first read of the raid events. */
 const EVENTS_WAIT_MS = 15_000;
 const HOUR_MS = 60 * MINUTE_MS;
+/** After this long without a read of the max boss feed, a warning is logged once (no setting). */
+const MAX_BOSSES_STALE_AFTER_HOURS = 48;
 /** How long direct messages that wait at shutdown are still sent. */
 const DM_DRAIN_MS = 10_000;
 
@@ -216,6 +219,23 @@ export async function startApp(
     fetch: (url, init) => fetch(url, init),
     log,
   });
+  // The max bosses (plan 8X-2), only with `settings.maxBattles`: Pokebattler's feed, beside the
+  // raid bosses in the same tables. Its changes are announced nowhere (the announcer listens to
+  // the raid bosses), and the warning of a list out of date is only logged.
+  const maxSettings = config.settings.maxBattles;
+  const maxBosses =
+    maxSettings === undefined
+      ? undefined
+      : new MaxBossService({
+          url: maxSettings.url,
+          refreshMs: maxSettings.refreshMinutes * MINUTE_MS,
+          staleAfterMs: MAX_BOSSES_STALE_AFTER_HOURS * HOUR_MS,
+          zone: config.settings.timezone,
+          store: new MaxBossRepository(db),
+          gameData,
+          fetch: (url, init) => fetch(url, init),
+          log,
+        });
   const raidEvents = new RaidEventService({
     url: config.settings.raidEvents.url,
     refreshMs: config.settings.raidEvents.refreshHours * HOUR_MS,
@@ -640,6 +660,7 @@ export async function startApp(
     checkpoint();
     // Reads the list of the last run from the database; the feed is read after the login.
     await raidBosses.load();
+    await maxBosses?.load();
     await gyms.load();
     // The gyms that waited for Google before a restart, and those that lack what it gives.
     await gymUpkeep.resume();
@@ -674,6 +695,8 @@ export async function startApp(
     gameData,
     raidBosses,
     raidBossAdmin: raidBosses,
+    maxBosses: maxBosses ?? NO_MAX_BOSSES,
+    maxBossAdmin: maxBosses,
     raidEvents,
     gyms,
     gymAdmin,
@@ -833,6 +856,7 @@ export async function startApp(
   ctx.features = features;
   // The listeners of the boss list (`bossAnnouncer`) were attached before this call.
   raidBosses.startAutoSync();
+  maxBosses?.startAutoSync();
   raidEvents.start();
   // The clock waits for Discord, however long that takes: a post that cannot be asked for yet
   // would be taken for deleted. Then for the first read of the raid events (a raid that hatched
@@ -990,6 +1014,14 @@ export async function startApp(
           await raidBosses.whenIdle();
         },
       },
+      {
+        name: 'max boss sync',
+        timeoutMs: 5_000,
+        run: async () => {
+          maxBosses?.stop();
+          await maxBosses?.whenIdle();
+        },
+      },
       {
         name: 'raid events',
         timeoutMs: 1_000,
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index bd1b9b51fb31048dd7edb0158eb4f09d63f75bca..45d19436b41cbb8a7684e70a2a1adda97652f891 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -484,6 +484,53 @@ describe('loadSettings', () => {
     expect(() => loadSettings(unknown)).toThrow(/mega/);
   });
 
+  it('has max battles off without a maxBattles block, as the files of today have it', () => {
+    expect(loadSettings(REPO_SETTINGS).maxBattles).toBeUndefined();
+    expect(loadSettings('test/fixtures/settings.json').maxBattles).toBeUndefined();
+  });
+
+  it('takes maxBattles with its defaults: the feed read every 6 hours, battles 06:00 to 21:00', () => {
+    const url = 'https://fight.pokebattler.com/raids';
+    const file = writeSettings((s) => {
+      s.maxBattles = { url };
+    });
+    expect(loadSettings(file).maxBattles).toEqual({
+      url,
+      refreshMinutes: 360,
+      firstBattle: '06:00',
+      lastBattle: '21:00',
+    });
+    const own = writeSettings((s) => {
+      s.maxBattles = { url, refreshMinutes: 60, firstBattle: '7:30', lastBattle: '23:59' };
+    });
+    expect(loadSettings(own).maxBattles).toMatchObject({
+      refreshMinutes: 60,
+      firstBattle: '07:30',
+      lastBattle: '23:59',
+    });
+  });
+
+  it('refuses a maxBattles block it cannot use', () => {
+    const url = 'https://fight.pokebattler.com/raids';
+    const cases: [Record<string, unknown>, RegExp][] = [
+      [{}, /url/],
+      [{ url: 'ftp://example.test/raids' }, /url/],
+      [{ url, refreshMinutes: 4 }, /refreshMinutes/],
+      [{ url, refreshMinutes: 1441 }, /refreshMinutes/],
+      [{ url, firstBattle: '24:00' }, /firstBattle/],
+      [{ url, lastBattle: '9pm' }, /lastBattle/],
+      [{ url, firstBattle: '21:00', lastBattle: '06:00' }, /lastBattle/],
+      [{ url, firstBattle: '06:00', lastBattle: '06:00' }, /lastBattle/],
+      [{ url, staleAfterHours: 48 }, /staleAfterHours/],
+    ];
+    for (const [block, error] of cases) {
+      const file = writeSettings((s) => {
+        s.maxBattles = block;
+      });
+      expect(() => loadSettings(file), JSON.stringify(block)).toThrow(error);
+    }
+  });
+
   it('rejects a missing required key', () => {
     const file = writeSettings((s) => {
       delete s.cleanupInterval;
diff --git a/src/config/settings.ts b/src/config/settings.ts
index 95151a33ac8ef5b5aab7f4ede002b510c2401a86..ca4e8db582fcf2ea44f6772c3b72356cc68c835e 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -8,6 +8,11 @@ const minutes = z.number().int().positive();
 const milliseconds = z.number().int().positive();
 const seconds = z.number().int().positive();
 const lobby = z.number().int().min(MIN_LOBBY).max(MAX_LOBBY);
+/** A time of day, `HH:MM` on a 24-hour clock (`7:30` is `07:30`). */
+const clockTime = z
+  .string()
+  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, { error: 'must be a time of day, as 06:00 or 21:00' })
+  .transform((time) => time.padStart(5, '0'));
 
 function isTimeZone(zone: string): boolean {
   try {
@@ -392,6 +397,27 @@ export const settingsSchema = z.strictObject({
     /** Minutes a boss stays when its egg hatches during such an event. */
     hatchedDuration: z.strictObject({ 'raid-hour': minutes, 'raid-day': minutes }),
   }),
+  /**
+   * Max battles (plan 8X-2; design `2026-10-20-max-battles-design.md`, section 9). Absent: max
+   * bosses are off (no feed is read, `/admin boss` offers no max tier), as a file of before has it.
+   * `url` is Pokebattler's raid list (`https://fight.pokebattler.com/raids`, about 700 KB, which
+   * asks to be cached: read every `refreshMinutes`, 6 hours unless set), whose `RAID_LEVEL_1_MAX`
+   * to `RAID_LEVEL_5_MAX` are the Dynamax bosses and `RAID_LEVEL_6_MAX` the Gigantamax ones.
+   * `firstBattle` and `lastBattle` are the hours of the day max battles can be fought, in
+   * `timezone` (06:00 and 21:00 unless set): a max battle ends at the last one.
+   */
+  maxBattles: z
+    .strictObject({
+      url: z.url({ protocol: /^https?$/ }),
+      refreshMinutes: z.number().int().min(5).max(1440).default(360),
+      firstBattle: clockTime.default('06:00'),
+      lastBattle: clockTime.default('21:00'),
+    })
+    .refine((max) => max.firstBattle < max.lastBattle, {
+      error: 'must be later than firstBattle',
+      path: ['lastBattle'],
+    })
+    .optional(),
 });
 
 export type Settings = z.output<typeof settingsSchema>;
diff --git a/src/db/repositories/raid-boss-repository.db.test.ts b/src/db/repositories/raid-boss-repository.db.test.ts
index a42fb9120c6e3e2635302f95121d00ba59138575..291fc91c0d4e5e84ed241e0e56f2e81639011d53 100644
--- a/src/db/repositories/raid-boss-repository.db.test.ts
+++ b/src/db/repositories/raid-boss-repository.db.test.ts
@@ -517,6 +517,31 @@ describe('RaidBossRepository', () => {
       expect(await max.removeOverride(maxAdd.id)).toBe(false);
     });
 
+    it('stores an upcoming boss from its start, and follows the start until it has come', async () => {
+      const uxie = (startsAt?: number) => ({
+        ...maxBoss('UXIE', 'D5'),
+        ...(startsAt === undefined ? {} : { startsAt }),
+      });
+      await max.replaceFeed([uxie(NOW + 10 * HOUR), maxBoss('SNEASEL', 'D1')], NOW);
+      const first = (await max.listActive()).map((b) => [b.pokemonId, b.firstSeen]);
+      expect(first).toEqual([
+        ['UXIE', NOW + 10 * HOUR],
+        ['SNEASEL', NOW],
+      ]);
+      // Moved to an earlier start before it came: the stored start follows.
+      await max.replaceFeed([uxie(NOW + 5 * HOUR), maxBoss('SNEASEL', 'D1')], NOW + HOUR);
+      expect((await max.listActive())[0]?.firstSeen).toBe(NOW + 5 * HOUR);
+      // Once it has come it stays a boss from then, whatever the feed says of a start.
+      await max.replaceFeed([uxie(NOW + 30 * HOUR)], NOW + 6 * HOUR);
+      expect((await max.listActive())[0]?.firstSeen).toBe(NOW + 5 * HOUR);
+      // A start that is no later than the read is the read.
+      await max.replaceFeed([maxBoss('SNEASEL', 'D1'), uxie(NOW)], NOW + 7 * HOUR);
+      expect((await max.listActive()).map((b) => [b.pokemonId, b.firstSeen])).toEqual([
+        ['UXIE', NOW + 5 * HOUR],
+        ['SNEASEL', NOW + 7 * HOUR],
+      ]);
+    });
+
     it('a max override replaces only max overrides', async () => {
       await bosses.saveOverride(override({ action: 'hide', pokemonId: 'MACHAMP' }), NOW);
       await max.saveOverride(maxOverride({ action: 'hide', pokemonId: 'MACHAMP' }), NOW);
diff --git a/src/db/repositories/raid-boss-repository.ts b/src/db/repositories/raid-boss-repository.ts
index 359770abfdac4e52e0751ecdbae4b114134b9d44..aeed22f9b179fdda2c43c8979702d67494187b0b 100644
--- a/src/db/repositories/raid-boss-repository.ts
+++ b/src/db/repositories/raid-boss-repository.ts
@@ -133,7 +133,8 @@ class BossRepository<T> implements BossStore<T> {
 
   /**
    * Makes `bosses` the stored feed list of the family, in one transaction: a boss already stored
-   * keeps its `firstSeen` if it was still active and starts again if it had gone; every listed
+   * keeps its `firstSeen` if it was still active and starts again if it had gone (an upcoming
+   * boss, `FeedBoss.startsAt`, from its start, which follows the feed until it has come); every listed
    * boss gets `lastSeen = now`; a stored boss of the family that is not listed becomes inactive
    * (the other family's rows are not touched). Of a boss listed twice the last entry's `shiny`,
    * `name` and `image` are stored (the parsers remove duplicates before that).
@@ -142,7 +143,7 @@ class BossRepository<T> implements BossStore<T> {
     await inTransaction(this.db, async (trx) => {
       const stored = await trx
         .selectFrom('RaidBoss')
-        .select(['id', 'pokemonId', 'form', 'level', 'shadow', 'active'])
+        .select(['id', 'pokemonId', 'form', 'level', 'shadow', 'active', 'firstSeen'])
         .where((eb) => this.ours(eb))
         .forUpdate()
         .execute();
@@ -154,6 +155,8 @@ class BossRepository<T> implements BossStore<T> {
         const { level, shadow } = this.family.columns(boss.tier);
         const form = formColumn(boss.form);
         const row = byIdentity.get(identity(boss.pokemonId, form, level, shadow));
+        // An upcoming boss is a boss from its start; one that has come keeps when it came.
+        const from = String(Math.max(now, boss.startsAt ?? now));
         if (row) {
           listed.add(row.id);
           await trx
@@ -164,7 +167,7 @@ class BossRepository<T> implements BossStore<T> {
               image: boss.image ?? null,
               lastSeen: String(now),
               active: 1,
-              ...(row.active === 1 ? {} : { firstSeen: String(now) }),
+              ...(row.active === 1 && Number(row.firstSeen) <= now ? {} : { firstSeen: from }),
             })
             .where('id', '=', row.id)
             .execute();
@@ -179,7 +182,7 @@ class BossRepository<T> implements BossStore<T> {
               shiny: boss.shiny ? 1 : 0,
               name: boss.name,
               image: boss.image ?? null,
-              firstSeen: String(now),
+              firstSeen: from,
               lastSeen: String(now),
               active: 1,
             })
@@ -194,6 +197,7 @@ class BossRepository<T> implements BossStore<T> {
             level,
             shadow,
             active: 1,
+            firstSeen: from,
           });
         }
       }
diff --git a/src/domain/pogo/boss-diff.ts b/src/domain/pogo/boss-diff.ts
index 00d5bff155d6df7e51c5c3067ea1c8c4ca1f37a8..145972c818c4102c35d0a29d6f15cc92d0a522ce 100644
--- a/src/domain/pogo/boss-diff.ts
+++ b/src/domain/pogo/boss-diff.ts
@@ -1,22 +1,30 @@
-import type { RaidBoss } from './raid-bosses.js';
-import { sameRaidTier } from './raid-tier.js';
+import type { Boss, BossFamilyOps, RaidBoss } from './raid-bosses.js';
+import { RAID_OPS } from './raid-bosses.js';
 
 /** What members see change between two boss lists in effect. */
-export interface SeenChange {
+export interface SeenChange<T extends Boss<unknown> = RaidBoss> {
   /** Bosses of the later list that the earlier did not have (by key and tier), in its order. */
-  added: RaidBoss[];
+  added: T[];
   /** Bosses of the earlier list that the later does not have, in its order. */
-  removed: RaidBoss[];
+  removed: T[];
 }
 
-const same = (a: RaidBoss, b: RaidBoss): boolean => a.key === b.key && sameRaidTier(a.tier, b.tier);
-
 /**
  * The bosses that came and went between two lists in effect (`effectiveBosses`), compared as
  * members see them: by key and tier. A boss the feed renamed (one costume id for the next) has
  * the same key and is no change; a boss an override hides or adds counts as the list shows it.
  */
 export function diffBosses(before: readonly RaidBoss[], after: readonly RaidBoss[]): SeenChange {
+  return diffBossesIn(RAID_OPS, before, after);
+}
+
+/** `diffBosses` for the lists of any family. */
+export function diffBossesIn<T>(
+  ops: Pick<BossFamilyOps<T>, 'sameTier'>,
+  before: readonly Boss<T>[],
+  after: readonly Boss<T>[],
+): SeenChange<Boss<T>> {
+  const same = (a: Boss<T>, b: Boss<T>): boolean => a.key === b.key && ops.sameTier(a.tier, b.tier);
   return {
     added: after.filter((boss) => !before.some((other) => same(boss, other))),
     removed: before.filter((boss) => !after.some((other) => same(boss, other))),
diff --git a/src/domain/pogo/catalogue.test.ts b/src/domain/pogo/catalogue.test.ts
index bf3423f90d0f32be203a9f847a17e7ee82c18db7..e8056bc5dca92f40a4a9e56a8342ffdce3f42cd4 100644
--- a/src/domain/pogo/catalogue.test.ts
+++ b/src/domain/pogo/catalogue.test.ts
@@ -312,3 +312,22 @@ describe('PokemonCatalogue: evolution lines', () => {
     expect(keysOf('eevee')).toHaveLength(9);
   });
 });
+
+describe('PokemonCatalogue: max battles (plan 8X-2)', () => {
+  it('says which Pokémon can be Dynamax and which Gigantamax bosses', () => {
+    expect(catalogue.canDynamax(entry('sneasel'))).toBe(true);
+    expect(catalogue.canGigantamax(entry('sneasel'))).toBe(false);
+    expect(catalogue.canDynamax(entry('machamp'))).toBe(true);
+    expect(catalogue.canGigantamax(entry('machamp'))).toBe(true);
+    expect(catalogue.canDynamax(entry('sneasel_hisuian'))).toBe(false);
+    expect(catalogue.canDynamax(entry('venusaur_mega'))).toBe(false);
+  });
+
+  it('lists them as entries, in catalogue order', () => {
+    const gigantamax = catalogue.gigantamaxEntries().map((one) => one.key);
+    expect(gigantamax).toEqual(expect.arrayContaining(['machamp', 'urshifu_rapid_strike']));
+    expect(gigantamax).not.toContain('sneasel');
+    const dex = catalogue.dynamaxEntries().map((one) => one.dex);
+    expect([...dex].sort((a, b) => a - b)).toEqual(dex);
+  });
+});
diff --git a/src/domain/pogo/catalogue.ts b/src/domain/pogo/catalogue.ts
index 4c88a16c133121ec2fb5b93b43aea5d847146a9d..73e1492ab0aa3d7ef09386ef314ad324f267d77f 100644
--- a/src/domain/pogo/catalogue.ts
+++ b/src/domain/pogo/catalogue.ts
@@ -122,6 +122,36 @@ export class PokemonCatalogue {
     return line;
   }
 
+  /** Whether the game has this Pokémon as a Dynamax boss (`GameData.maxBattles`). */
+  canDynamax(entry: PokemonEntry): boolean {
+    return this.maxKeys().dynamax.has(entry.key);
+  }
+
+  /** Whether the game has this Pokémon as a Gigantamax boss. */
+  canGigantamax(entry: PokemonEntry): boolean {
+    return this.maxKeys().gigantamax.has(entry.key);
+  }
+
+  /** The Pokémon that can be Dynamax bosses, in catalogue order. */
+  dynamaxEntries(): PokemonEntry[] {
+    return this.all.filter((entry) => this.canDynamax(entry));
+  }
+
+  /** The Pokémon that can be Gigantamax bosses, in catalogue order. */
+  gigantamaxEntries(): PokemonEntry[] {
+    return this.all.filter((entry) => this.canGigantamax(entry));
+  }
+
+  private maxSets: { dynamax: Set<string>; gigantamax: Set<string> } | undefined;
+
+  private maxKeys(): { dynamax: Set<string>; gigantamax: Set<string> } {
+    this.maxSets ??= {
+      dynamax: new Set(this.data.maxBattles.dynamax),
+      gigantamax: new Set(this.data.maxBattles.gigantamax),
+    };
+    return this.maxSets;
+  }
+
   /** The CP multiplier of every whole level the game master lists; index 0 is level 1. */
   get cpMultipliers(): readonly number[] {
     return this.data.cpMultipliers;
diff --git a/src/domain/pogo/game-master.test.ts b/src/domain/pogo/game-master.test.ts
index be8eed90e57226f86f2fc68cbc45cc7b27f30aad..a0844aee0ad32f65614f4367fb7682ff3c5bd8c0 100644
--- a/src/domain/pogo/game-master.test.ts
+++ b/src/domain/pogo/game-master.test.ts
@@ -741,12 +741,82 @@ describe('the class of a Pokémon', () => {
   });
 });
 
+describe('what can Dynamax and Gigantamax (plan 8X-2)', () => {
+  const extended = (
+    templateId: string,
+    uniqueId: string,
+    form: string | undefined,
+    modes: unknown[],
+  ) => ({
+    templateId,
+    data: {
+      templateId,
+      pokemonExtendedSettings: {
+        uniqueId,
+        ...(form === undefined ? {} : { form }),
+        breadOverrides: modes.map((breadMode) => ({ breadMode, maxBattleVisualSettings: {} })),
+      },
+    },
+  });
+
+  it('reads the modes of the extended settings, by catalogue key, costumes as their species', () => {
+    expect(data.maxBattles.dynamax).toEqual(
+      expect.arrayContaining(['venusaur', 'charizard', 'pikachu', 'gengar']),
+    );
+    expect(data.maxBattles.gigantamax).toEqual(
+      expect.arrayContaining(['venusaur', 'charizard', 'pikachu', 'gengar']),
+    );
+    expect(data.maxBattles.dynamax).not.toContain('rattata');
+    expect(data.maxBattles.dynamax).not.toContain('venusaur_mega');
+    // Each key once, sorted, so the cache and the fixture stay reviewable.
+    for (const list of [data.maxBattles.dynamax, data.maxBattles.gigantamax]) {
+      expect([...new Set(list)].sort()).toEqual(list);
+    }
+  });
+
+  it('takes a second Gigantamax mode as Gigantamax, and neither the special mode nor no mode', () => {
+    const items = [
+      ...sampleItems(),
+      extended('EXTENDED_V0019_POKEMON_RATTATA_ALOLA', 'RATTATA', 'RATTATA_ALOLA', [
+        'BREAD_DOUGH_MODE_2',
+      ]),
+      extended('EXTENDED_V0019_POKEMON_RATTATA_NORMAL', 'RATTATA', 'RATTATA_NORMAL', [
+        'BREAD_SPECIAL_MODE',
+        undefined,
+      ]),
+      extended('EXTENDED_V0019_POKEMON_RATTATA', 'RATTATA', undefined, ['BREAD_MODE']),
+      extended('EXTENDED_V9999_POKEMON_NOBODY', 'NOBODY', undefined, ['BREAD_MODE']),
+    ];
+    const { data: parsed, warnings } = parseWithWarnings(items);
+    expect(parsed.maxBattles.gigantamax).toContain('rattata_alola');
+    expect(parsed.maxBattles.gigantamax).not.toContain('rattata');
+    expect(parsed.maxBattles.dynamax).toContain('rattata');
+    expect(parsed.maxBattles.dynamax).not.toContain('rattata_alola');
+    expect(parsed.maxBattles.dynamax).not.toContain('nobody');
+    expect(warnings).toEqual([]);
+  });
+
+  it('reads the whole game master: the bosses of today, and Gigantamax only where the game has it', () => {
+    const { maxBattles } = gameDataFixture();
+    expect(maxBattles.dynamax).toEqual(
+      expect.arrayContaining(['sneasel', 'machop', 'toxtricity_amped', 'duraludon', 'eevee']),
+    );
+    expect(maxBattles.gigantamax).toEqual(
+      expect.arrayContaining(['machamp', 'toxtricity_amped', 'urshifu_rapid_strike', 'lapras']),
+    );
+    expect(maxBattles.gigantamax).not.toContain('sneasel');
+    // The game master of the fixture (2026-10-10) predates the lake trio's Max Battle Day.
+    expect(maxBattles.dynamax).not.toContain('uxie');
+  });
+});
+
 describe('the shape of the parsed data', () => {
   it('changes only together with GAME_DATA_VERSION: bump GAME_DATA_VERSION when this fails', () => {
-    expect(GAME_DATA_VERSION).toBe(5);
+    expect(GAME_DATA_VERSION).toBe(6);
     expect(Object.keys(data).sort()).toEqual([
       'aliases',
       'cpMultipliers',
+      'maxBattles',
       'moves',
       'pokemon',
       'typeChart',
diff --git a/src/domain/pogo/game-master.ts b/src/domain/pogo/game-master.ts
index 0944689f320ebfb0f2165e58430372de68971310..7068a9e00233aa3ece79b8ab59e36f1f068e6aa8 100644
--- a/src/domain/pogo/game-master.ts
+++ b/src/domain/pogo/game-master.ts
@@ -82,7 +82,7 @@ export interface Move {
  * Bump on ANY change to what `parseGameMaster` produces: the shape of `GameData`, or the rules
  * that decide its contents. A saved cache with another version is discarded.
  */
-export const GAME_DATA_VERSION = 5;
+export const GAME_DATA_VERSION = 6;
 
 /** The highest level the PvP ranks look at (a best buddy); the game master should list it. */
 export const PVP_MAX_LEVEL = 51;
@@ -103,6 +103,15 @@ export interface GameData {
   weatherBoosts: Record<Weather, PokemonType[]>;
   /** CP multiplier per whole level; index 0 is level 1. */
   cpMultipliers: number[];
+  /**
+   * The catalogue keys of the Pokémon the game lets battle as Dynamax and as Gigantamax bosses,
+   * each sorted (plan 8X-2): what may be typed as a max boss off the feed's lists. Read from the
+   * modes of `pokemonExtendedSettings.breadOverrides` (`BREAD_MODE`, `BREAD_DOUGH_MODE` and
+   * `BREAD_DOUGH_MODE_2`), which every such Pokémon has; `BREAD_POKEMON_SCALING_SETTINGS` lists
+   * only the few with visuals of their own (70 species in October 2026, without Sneasel or
+   * Abra), so it is not read. A costume counts as its species.
+   */
+  maxBattles: { dynamax: string[]; gigantamax: string[] };
 }
 
 type Raw = Record<string, unknown>;
@@ -623,6 +632,8 @@ export function parseGameMaster(
     );
   }
 
+  const maxBattles = parseMaxBattles(withData('pokemonExtendedSettings'), keyOf);
+
   return {
     // A plain code-unit comparison keeps the order the same on every host.
     pokemon: entries.sort((a, b) => a.dex - b.dex || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
@@ -636,5 +647,41 @@ export function parseGameMaster(
     typeChart: parseTypeChart(withData('typeEffective')),
     weatherBoosts: parseWeatherBoosts(weatherItems),
     cpMultipliers,
+    maxBattles,
   };
 }
+
+/** The modes of a Pokémon's max battles: Dynamax, and the two of Gigantamax. */
+const MAX_MODES: Readonly<Record<string, keyof GameData['maxBattles']>> = {
+  BREAD_MODE: 'dynamax',
+  BREAD_DOUGH_MODE: 'gigantamax',
+  BREAD_DOUGH_MODE_2: 'gigantamax',
+};
+
+/**
+ * `GameData.maxBattles` from the extended settings: a form the catalogue knows (or a costume, an
+ * alias of its species) by its key, `<id>_NORMAL` or no form by the species. A form the catalogue
+ * does not know is left out rather than taken for its species. Eternamax (`BREAD_SPECIAL_MODE`)
+ * and modes this code does not know are left out.
+ */
+function parseMaxBattles(
+  items: readonly Raw[],
+  keyOf: (id: string) => string | undefined,
+): GameData['maxBattles'] {
+  const found = { dynamax: new Set<string>(), gigantamax: new Set<string>() };
+  for (const item of items) {
+    const settings = record(record(item['data'])['pokemonExtendedSettings']);
+    const species = text(settings['uniqueId']);
+    const form = text(settings['form']);
+    if (species === undefined) continue;
+    const key = form !== undefined && !form.endsWith('_NORMAL') ? keyOf(form) : keyOf(species);
+    if (key === undefined) continue;
+    for (const override of list(settings['breadOverrides']).map(record)) {
+      const mode = MAX_MODES[text(override['breadMode']) ?? ''];
+      if (mode) found[mode].add(key);
+    }
+  }
+  const sorted = (keys: Set<string>): string[] =>
+    [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
+  return { dynamax: sorted(found.dynamax), gigantamax: sorted(found.gigantamax) };
+}
diff --git a/src/domain/pogo/max-bosses.test.ts b/src/domain/pogo/max-bosses.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..429f2f4d6b8d3d6946c4ec8b2483d3955db9e475
--- /dev/null
+++ b/src/domain/pogo/max-bosses.test.ts
@@ -0,0 +1,273 @@
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import {
+  at,
+  MAX_FEED_READ_AT,
+  MAX_ZONE,
+  pokebattlerFeed,
+  readPokebattlerFeed,
+} from '../../../test/support/max-bosses.js';
+import {
+  maxBossesAt,
+  maxBossOf,
+  maxOverrideProblem,
+  parseMaxBossFeed,
+  type MaxFeedBoss,
+} from './max-bosses.js';
+import type { MaxTier } from './max-tier.js';
+import type { BossOverride, NewBossOverride } from './raid-bosses.js';
+
+const catalogue = catalogueFixture();
+const read = (raw: unknown, now = MAX_FEED_READ_AT) =>
+  parseMaxBossFeed(raw, catalogue, { now, zone: MAX_ZONE });
+
+describe('parseMaxBossFeed: the recorded feed', () => {
+  const parsed = read(readPokebattlerFeed());
+  const ofTier = (tier: MaxTier) => parsed.bosses.filter((boss) => boss.tier === tier);
+
+  it('reads the five Dynamax tiers and Gigantamax, verified or not, and nothing else', () => {
+    expect(
+      (['D1', 'D2', 'D3', 'D4', 'D5', 'G'] as const).map((tier) => ofTier(tier).length),
+    ).toEqual([36, 6, 13, 2, 3, 0]);
+    // Neither the _LEGACY and _FUTURE twins nor the raid tier: Dialga is a raid boss there.
+    expect(parsed.bosses.some((boss) => boss.pokemonId === 'DIALGA')).toBe(false);
+    expect(parsed.bosses.some((boss) => boss.pokemonId === 'LATIAS')).toBe(false);
+  });
+
+  it('gives each boss the ids and name of its catalogue entry', () => {
+    expect(ofTier('D4')).toEqual([
+      { pokemonId: 'DURALUDON', form: null, tier: 'D4', shiny: true, name: 'Duraludon' },
+      { pokemonId: 'TOXTRICITY', form: null, tier: 'D4', shiny: false, name: 'Toxtricity' },
+    ]);
+    expect(ofTier('D1').find((boss) => boss.pokemonId === 'SNEASEL')).toMatchObject({
+      form: null,
+      name: 'Sneasel',
+    });
+  });
+
+  it('knows every boss of the day, and reports what it does not know and no tier', () => {
+    expect(parsed.unknownIds).toEqual([]);
+    expect(parsed.unknownLevels).toEqual([]);
+    expect(parsed.skipped).toBe(0);
+  });
+
+  it('keeps an upcoming boss from the start of its day in the zone, and the others from now', () => {
+    const lake = ofTier('D5');
+    expect(lake.map((boss) => boss.name)).toEqual(['Azelf', 'Mesprit', 'Uxie']);
+    // Pokebattler's start is 2026-10-24T21:00Z, 17:00 in the zone, when the Max Battle Day of
+    // 14:00 to 17:00 is over: the day is what is meant.
+    for (const boss of lake) expect(boss.startsAt).toBe(at('2026-10-24T00:00'));
+    expect(parsed.bosses.filter((boss) => boss.startsAt !== undefined)).toHaveLength(3);
+  });
+
+  it('keeps no start once it has passed', () => {
+    const later = read(readPokebattlerFeed(), at('2026-10-25T09:00'));
+    expect(later.bosses.filter((boss) => boss.startsAt !== undefined)).toEqual([]);
+  });
+});
+
+describe('parseMaxBossFeed: Gigantamax and the mapping of ids', () => {
+  const gigantamax = read(
+    pokebattlerFeed({
+      RAID_LEVEL_6_MAX: [
+        { pokemonId: 'MACHAMP_GIGANTAMAX', shiny: true },
+        { pokemonId: 'TOXTRICITY_AMPED_GIGANTAMAX' },
+        { pokemonId: 'URSHIFU_RAPID_STRIKE_GIGANTAMAX' },
+        { pokemonId: 'ETERNATUS' },
+        { pokemonId: 'ETERNATUS_ETERNAMAX_FORM' },
+        { pokemonId: 'NEWMON_GIGANTAMAX' },
+      ],
+      RAID_LEVEL_2_MAX: [{ pokemonId: 'MACHAMP' }],
+    }),
+  );
+
+  it('reads a Gigantamax id as its Pokémon with the tier G, never an entry of its own', () => {
+    expect(gigantamax.bosses.map((boss) => [boss.pokemonId, boss.form, boss.tier])).toEqual([
+      ['MACHAMP', null, 'G'],
+      ['TOXTRICITY', 'TOXTRICITY_AMPED', 'G'],
+      ['URSHIFU', 'URSHIFU_RAPID_STRIKE', 'G'],
+      ['ETERNATUS', null, 'G'],
+      ['ETERNATUS', 'ETERNATUS_ETERNAMAX', 'G'],
+      ['NEWMON', null, 'G'],
+      ['MACHAMP', null, 'D2'],
+    ]);
+    expect(gigantamax.bosses[0]?.shiny).toBe(true);
+  });
+
+  it('lists an id the game data does not know by a name made of it, and reports it', () => {
+    expect(gigantamax.bosses.find((boss) => boss.pokemonId === 'NEWMON')?.name).toBe('Newmon');
+    expect(gigantamax.unknownIds).toEqual(['NEWMON_GIGANTAMAX']);
+  });
+
+  it('maps Pokebattler ids by the catalogue: form ids, the bare species, Gigantamax ids', () => {
+    const key = (id: string) => maxBossOf(id, catalogue);
+    expect(key('MEOWSTIC_FEMALE_FORM')).toEqual({
+      entry: catalogue.byKey('meowstic_female'),
+      gigantamax: false,
+    });
+    expect(key('TOXTRICITY')?.entry?.key).toBe('toxtricity');
+    expect(key('TOXTRICITY_AMPED_FORM')?.entry?.key).toBe('toxtricity_amped');
+    expect(key('TOXTRICITY_GIGANTAMAX')).toEqual({
+      entry: catalogue.byKey('toxtricity'),
+      gigantamax: true,
+    });
+    // A species known by its default form: the bare id is that form (as the raid feed reads it).
+    expect(key('GIRATINA')?.entry?.key).toBe('giratina_altered');
+    expect(key('NEWMON')).toEqual({ entry: undefined, gigantamax: false });
+    // A mega is no max boss.
+    expect(key('CHARIZARD_MEGA_X')?.entry).toBeUndefined();
+  });
+});
+
+describe('parseMaxBossFeed: what it refuses and leaves out', () => {
+  it('refuses a document that is not the feed, and one with no max boss', () => {
+    for (const raw of [null, [], 'text', { tiers: 'none' }, { breakingNews: [] }]) {
+      expect(() => read(raw), JSON.stringify(raw)).toThrow(/not in the expected format/);
+    }
+    expect(() => read(pokebattlerFeed({ RAID_LEVEL_5: [{ pokemonId: 'DIALGA' }] }))).toThrow(
+      /lists no max bosses/,
+    );
+  });
+
+  it('reports a max tier it does not know that has bosses, and leaves them out', () => {
+    const parsed = read(
+      pokebattlerFeed({
+        RAID_LEVEL_1_MAX: [{ pokemonId: 'SNEASEL' }],
+        RAID_LEVEL_7_MAX: [{ pokemonId: 'MACHAMP' }],
+        RAID_LEVEL_6_5_MAX: [],
+        RAID_LEVEL_7_MAX_FUTURE: [{ pokemonId: 'MACHAMP' }],
+      }),
+    );
+    expect(parsed.bosses.map((boss) => boss.pokemonId)).toEqual(['SNEASEL']);
+    expect(parsed.unknownLevels).toEqual(['RAID_LEVEL_7_MAX']);
+    expect(parsed.skipped).toBe(1);
+  });
+
+  it('leaves out an entry without a usable id, and keeps a boss listed twice once', () => {
+    const parsed = read(
+      pokebattlerFeed({
+        RAID_LEVEL_1_MAX: [
+          { pokemonId: 'SNEASEL' },
+          { pokemonId: 'SNEASEL', shiny: true },
+          { pokemonId: 42 },
+          { pokemonId: 'drop table' },
+          { pokemonId: `A${'B'.repeat(80)}` },
+        ],
+      }),
+    );
+    expect(parsed.bosses).toEqual([
+      { pokemonId: 'SNEASEL', form: null, tier: 'D1', shiny: true, name: 'Sneasel' },
+    ]);
+    expect(parsed.skipped).toBe(3);
+  });
+
+  it('takes an upcoming boss without a start, or with one passed, as a boss from now', () => {
+    const parsed = read(
+      pokebattlerFeed({
+        RAID_LEVEL_1_MAX: [
+          { pokemonId: 'SNEASEL', upcoming: true },
+          { pokemonId: 'MACHOP', upcoming: true, startDate: MAX_FEED_READ_AT - 1 },
+          { pokemonId: 'ABRA', upcoming: false, startDate: at('2026-11-01T10:00') },
+        ],
+      }),
+    );
+    expect(parsed.bosses.map((boss) => boss.startsAt)).toEqual([undefined, undefined, undefined]);
+  });
+});
+
+describe('maxBossesAt', () => {
+  const NOW = at('2026-10-21T12:00');
+  const row = (
+    pokemonId: string,
+    tier: MaxTier,
+    firstSeen = NOW - 1,
+  ): MaxFeedBoss & { firstSeen: number } => ({
+    pokemonId,
+    form: null,
+    tier,
+    shiny: false,
+    name: pokemonId,
+    firstSeen,
+  });
+  let id = 0;
+  const override = (extra: Partial<NewBossOverride<MaxTier>>): BossOverride<MaxTier> => ({
+    action: 'add',
+    pokemonId: 'MACHAMP',
+    form: null,
+    tier: 'D2',
+    shiny: null,
+    expiresAt: null,
+    createdBy: '123456789012345678',
+    id: ++id,
+    createdAt: NOW - 1000 + id,
+    ...extra,
+  });
+
+  it('offers a boss from its start, by tier and then name', () => {
+    const feed = [
+      row('UXIE', 'D5', at('2026-10-24T00:00')),
+      row('SNEASEL', 'D1'),
+      row('MACHOP', 'D2'),
+      row('ABRA', 'D1'),
+    ];
+    expect(maxBossesAt(feed, [], catalogue, NOW).map((boss) => [boss.name, boss.tier])).toEqual([
+      ['Abra', 'D1'],
+      ['Sneasel', 'D1'],
+      ['Machop', 'D2'],
+    ]);
+    expect(
+      maxBossesAt(feed, [], catalogue, at('2026-10-24T00:00')).map((boss) => boss.name),
+    ).toContain('Uxie');
+  });
+
+  it('applies its own overrides: one Pokémon in two tiers, hidden in one', () => {
+    const feed = [row('MACHAMP', 'D3')];
+    const bosses = maxBossesAt(
+      feed,
+      [override({ tier: 'G', shiny: true }), override({ action: 'hide', tier: 'D3' })],
+      catalogue,
+      NOW,
+    );
+    expect(
+      bosses.map((boss) => [boss.key, boss.tier, boss.shiny, boss.source, boss.autoset]),
+    ).toEqual([['machamp', 'G', true, 'override', false]]);
+  });
+});
+
+describe('maxOverrideProblem', () => {
+  const base: NewBossOverride<MaxTier> = {
+    action: 'add',
+    pokemonId: 'MACHAMP',
+    form: null,
+    tier: 'D2',
+    shiny: false,
+    expiresAt: null,
+    createdBy: '123456789012345678',
+  };
+  const NOW = at('2026-10-21T12:00');
+
+  it('takes an add, a hide and a shiny override of a max tier', () => {
+    expect(maxOverrideProblem(base, NOW)).toBeUndefined();
+    expect(maxOverrideProblem({ ...base, action: 'hide', shiny: null }, NOW)).toBeUndefined();
+    expect(
+      maxOverrideProblem({ ...base, action: 'shiny', tier: 'G', shiny: true }, NOW),
+    ).toBeUndefined();
+  });
+
+  it('refuses one without a max tier: a shiny override for every tier is a raid one', () => {
+    expect(maxOverrideProblem({ ...base, action: 'shiny', tier: null, shiny: true }, NOW)).toMatch(
+      /max battle tier/,
+    );
+    expect(maxOverrideProblem({ ...base, tier: 'T5' as MaxTier }, NOW)).toMatch(/max battle tier/);
+  });
+
+  it('refuses an autoset: a max battle has no egg', () => {
+    expect(maxOverrideProblem({ ...base, action: 'autoset', shiny: null }, NOW)).toMatch(/egg/);
+  });
+
+  it('refuses what a raid override refuses', () => {
+    expect(maxOverrideProblem({ ...base, pokemonId: 'machamp' }, NOW)).toMatch(/Pokémon id/);
+    expect(maxOverrideProblem({ ...base, expiresAt: NOW }, NOW)).toMatch(/future/);
+    expect(maxOverrideProblem({ ...base, action: 'shiny', shiny: null }, NOW)).toMatch(/shiny/);
+  });
+});
diff --git a/src/domain/pogo/max-bosses.ts b/src/domain/pogo/max-bosses.ts
new file mode 100644
index 0000000000000000000000000000000000000000..519a1a95809e93e50561be2f461aa7322783daa2
--- /dev/null
+++ b/src/domain/pogo/max-bosses.ts
@@ -0,0 +1,236 @@
+import { DateTime } from 'luxon';
+import type { PokemonCatalogue } from './catalogue.js';
+import { bossIdsOf } from './feed-lookup.js';
+import type { PokemonEntry } from './game-master.js';
+import { isMaxTier, MAX_TIERS, type MaxTier } from './max-tier.js';
+import { titleCase } from './names.js';
+import type { FeedBoss, ParsedFeed } from './raid-boss-feed.js';
+import {
+  familyBosses,
+  overrideProblemOf,
+  type Boss,
+  type BossFamilyOps,
+  type BossOverride,
+  type NewBossOverride,
+} from './raid-bosses.js';
+
+/** A max boss as Pokebattler's feed lists it. */
+export type MaxFeedBoss = FeedBoss<MaxTier>;
+/** A boss of the max boss list in effect (plan 8X-2). */
+export type MaxBoss = Boss<MaxTier>;
+export type MaxBossOverride = BossOverride<MaxTier>;
+export type NewMaxBossOverride = NewBossOverride<MaxTier>;
+
+/**
+ * The max bosses' tiers and rows. A row's ids are those of a catalogue entry (the parser maps
+ * Pokebattler's ids to them), so a row is resolved by its ids alone; one the catalogue does not
+ * know stays unresolved, listed by its name.
+ */
+export const MAX_OPS: BossFamilyOps<MaxTier> = {
+  sameTier: (a, b) => a === b,
+  rank: (tier) => MAX_TIERS.indexOf(tier),
+  slot: (tier) => tier,
+  resolve: (catalogue, boss) => catalogue.byGameMasterId(boss.pokemonId, boss.form),
+};
+
+/**
+ * Pokebattler's tiers of max battles (`GET /raids`, design section 2, decision 1): the Dynamax
+ * stars and Gigantamax. Their `_FUTURE` and `_LEGACY` twins are not read; neither are the raid
+ * tiers (Pokebattler is no source of raid bosses).
+ */
+export const MAX_FEED_TIERS: Readonly<Record<string, MaxTier>> = {
+  RAID_LEVEL_1_MAX: 'D1',
+  RAID_LEVEL_2_MAX: 'D2',
+  RAID_LEVEL_3_MAX: 'D3',
+  RAID_LEVEL_4_MAX: 'D4',
+  RAID_LEVEL_5_MAX: 'D5',
+  RAID_LEVEL_6_MAX: 'G',
+};
+
+/** A max tier of the feed Pine does not read yet (`RAID_LEVEL_7_MAX`): reported when it has bosses. */
+const OTHER_MAX_TIER = /^RAID_LEVEL_[A-Z0-9_]+_MAX$/;
+const GIGANTAMAX_SUFFIX = '_GIGANTAMAX';
+/** Pokebattler's ids: game-master words, and a hyphen for a few (`JANGMO-O`). */
+const POKEBATTLER_ID = /^[A-Z][A-Z0-9_-]{0,63}$/;
+const MAX_BOSSES_PER_TIER = 200;
+const MAX_UNKNOWN = 10;
+
+const indexes = new WeakMap<PokemonCatalogue, Map<string, PokemonEntry>>();
+
+/** The catalogue's entries by their Pokebattler id, megas left out; built once per catalogue. */
+function pokebattlerIndex(catalogue: PokemonCatalogue): Map<string, PokemonEntry> {
+  let index = indexes.get(catalogue);
+  if (!index) {
+    index = new Map();
+    for (const entry of catalogue.all) {
+      if (entry.kind === 'mega' || index.has(entry.pokebattlerId)) continue;
+      index.set(entry.pokebattlerId, entry);
+    }
+    indexes.set(catalogue, index);
+  }
+  return index;
+}
+
+/**
+ * The Pokémon of a Pokebattler id of the max tiers (design section 10, the Pokebattler mapping):
+ * the entry of that Pokebattler id (`ARCANINE_HISUIAN_FORM`, `TOXTRICITY_AMPED_FORM`); else the
+ * entry the id names as a catalogue key or alias, which makes a bare species id the species, or
+ * the default form of a species known by one (`GIRATINA` is Altered Forme, as the raid feed's
+ * names are read). A Gigantamax id drops `_GIGANTAMAX` and is looked up the same way
+ * (`TOXTRICITY_AMPED_GIGANTAMAX` is Amped Toxtricity); it is never an entry of its own. A mega is
+ * no max boss. `entry` is undefined for an id the catalogue does not know.
+ */
+export function maxBossOf(
+  id: string,
+  catalogue: PokemonCatalogue,
+): { entry: PokemonEntry | undefined; gigantamax: boolean } {
+  const gigantamax = id.endsWith(GIGANTAMAX_SUFFIX);
+  const base = gigantamax ? id.slice(0, -GIGANTAMAX_SUFFIX.length) : id;
+  const found =
+    pokebattlerIndex(catalogue).get(base) ??
+    catalogue.byKey(base) ??
+    (base.endsWith('_FORM') ? catalogue.byKey(base.slice(0, -'_FORM'.length)) : undefined);
+  const entry = found && found.kind !== 'mega' && found.tempEvolution === null ? found : undefined;
+  return { entry, gigantamax };
+}
+
+function formatError(message: string): Error {
+  return new Error(`The max boss feed is not in the expected format: ${message}`);
+}
+
+function isRecord(value: unknown): value is Record<string, unknown> {
+  return typeof value === 'object' && value !== null && !Array.isArray(value);
+}
+
+/**
+ * When an upcoming boss is a boss from: the start of the day of its `startDate` in `zone`, when
+ * that is after `now`. Pokebattler gives one instant for an event the game holds at a local hour
+ * everywhere (the lake trio's Max Battle Day of 14:00 to 17:00 on 2026-10-24 is
+ * `2026-10-24T21:00Z`, 17:00 in New York), so its day is what can be relied on.
+ */
+function startOf(raid: Record<string, unknown>, now: number, zone: string): number | undefined {
+  const start = raid['startDate'];
+  if (raid['upcoming'] !== true || typeof start !== 'number' || !Number.isFinite(start)) {
+    return undefined;
+  }
+  if (start <= now) return undefined;
+  const day = DateTime.fromMillis(start, { zone }).startOf('day').toMillis();
+  return day > now ? day : undefined;
+}
+
+/**
+ * Reads Pokebattler's raid list (`GET https://fight.pokebattler.com/raids`) for the max bosses:
+ * the tiers of `MAX_FEED_TIERS`, every boss of them, verified or not (Matt, 2026-10-20: the
+ * autocomplete filters as members type). Each boss gets the ids and name of its catalogue entry
+ * (`maxBossOf`); an id the catalogue does not know is a boss by a name made of the id, its ids
+ * made of it too, and is reported in `unknownIds`. An upcoming boss whose start is ahead gets
+ * `startsAt` (`startOf`). A boss listed twice in a tier is kept once, shiny if either says so.
+ *
+ * Throws when the document does not have the feed's shape or lists no max boss, so a broken feed
+ * never replaces a good list. Pokebattler's `dynamaxPokemon` is not read: the game master says
+ * what can be typed (`PokemonCatalogue.canDynamax`).
+ */
+export function parseMaxBossFeed(
+  raw: unknown,
+  catalogue: PokemonCatalogue,
+  options: { now: number; zone: string },
+): ParsedFeed<MaxTier> {
+  if (!isRecord(raw)) throw formatError('the document is not an object');
+  const tiers = raw['tiers'];
+  if (!Array.isArray(tiers)) throw formatError('it has no list of tiers');
+
+  const bosses: MaxFeedBoss[] = [];
+  const unknownLevels: string[] = [];
+  const unknownIds: string[] = [];
+  const seen = new Map<string, MaxFeedBoss>();
+  let skipped = 0;
+  for (const value of tiers as unknown[]) {
+    if (!isRecord(value) || typeof value['tier'] !== 'string') continue;
+    const name = value['tier'];
+    const raids = Array.isArray(value['raids']) ? (value['raids'] as unknown[]) : [];
+    const tier = Object.hasOwn(MAX_FEED_TIERS, name) ? MAX_FEED_TIERS[name] : undefined;
+    if (tier === undefined) {
+      if (OTHER_MAX_TIER.test(name) && raids.length > 0) {
+        skipped += raids.length;
+        if (unknownLevels.length < MAX_UNKNOWN && !unknownLevels.includes(name)) {
+          unknownLevels.push(name.slice(0, 40));
+        }
+      }
+      continue;
+    }
+    if (raids.length > MAX_BOSSES_PER_TIER) {
+      throw formatError(`more than ${String(MAX_BOSSES_PER_TIER)} bosses in one tier`);
+    }
+    for (const raid of raids) {
+      const id = isRecord(raid) ? (raid['pokemonId'] ?? raid['pokemon']) : undefined;
+      if (!isRecord(raid) || typeof id !== 'string' || !POKEBATTLER_ID.test(id)) {
+        skipped += 1;
+        continue;
+      }
+      const { entry, gigantamax } = maxBossOf(id, catalogue);
+      const ids = entry
+        ? bossIdsOf(entry)
+        : {
+            pokemonId: (gigantamax ? id.slice(0, -GIGANTAMAX_SUFFIX.length) : id).replace(
+              /-/g,
+              '_',
+            ),
+            form: null,
+          };
+      if (!entry && unknownIds.length < MAX_UNKNOWN && !unknownIds.includes(id)) {
+        unknownIds.push(id);
+      }
+      const shiny = raid['shiny'] === true;
+      const identity = `${ids.pokemonId}|${ids.form ?? ''}|${tier}`;
+      const earlier = seen.get(identity);
+      if (earlier) {
+        earlier.shiny ||= shiny;
+        continue;
+      }
+      const startsAt = startOf(raid, options.now, options.zone);
+      const boss: MaxFeedBoss = {
+        pokemonId: ids.pokemonId,
+        form: ids.form,
+        tier,
+        shiny,
+        name: entry?.name ?? titleCase(ids.pokemonId),
+        ...(startsAt === undefined ? {} : { startsAt }),
+      };
+      seen.set(identity, boss);
+      bosses.push(boss);
+    }
+  }
+  if (bosses.length === 0) throw new Error('The max boss feed lists no max bosses');
+  return { bosses, unknownLevels, skipped, unknownIds };
+}
+
+/**
+ * The max boss list in effect at `now`: the stored feed's bosses whose start has come
+ * (`firstSeen`, which holds an upcoming boss's start), with the moderators' max overrides
+ * applied as raid overrides are (`familyBosses`), by tier from D1 to G, then name.
+ */
+export function maxBossesAt(
+  feed: readonly (MaxFeedBoss & { firstSeen: number })[],
+  overrides: readonly MaxBossOverride[],
+  catalogue: PokemonCatalogue,
+  now: number,
+): MaxBoss[] {
+  const begun = feed.filter((boss) => boss.firstSeen <= now);
+  return familyBosses(MAX_OPS, begun, overrides, catalogue, now);
+}
+
+/**
+ * What is wrong with a max override a moderator asked for; undefined when it can be stored. As
+ * for a raid override (`overrideProblem`), and: every override names a max tier (one without is
+ * a raid override: a shiny one for every tier covers the raid tiers only), and there is no
+ * `autoset` (a max battle has no egg).
+ */
+export function maxOverrideProblem(override: NewMaxBossOverride, now: number): string | undefined {
+  return overrideProblemOf(override, now, ({ action, tier }) => {
+    if (tier === null || !isMaxTier(tier)) return 'A max battle tier is needed.';
+    if (action === 'autoset') {
+      return 'A max battle has no egg, so there is nothing to hatch as: `autoset` is for raid tiers.';
+    }
+    return undefined;
+  });
+}
diff --git a/src/domain/pogo/pokemon-icons.test.ts b/src/domain/pogo/pokemon-icons.test.ts
index 93c80ad1840db875f5046de28e53c9d3b8541d71..335392415e38562425558f39c0d1bdcbb10f3d7d 100644
--- a/src/domain/pogo/pokemon-icons.test.ts
+++ b/src/domain/pogo/pokemon-icons.test.ts
@@ -8,6 +8,7 @@ import {
   iconName,
   iconNamesOf,
   isTruncatedListing,
+  maxBossPicture,
   POKEMON_ICON_BASE,
   PokemonIcons,
   pokemonPicture,
@@ -296,3 +297,41 @@ describe('pokemonPicture', () => {
     expect(iconAddress(entry('dratini'), undefined)).toBeUndefined();
   });
 });
+
+describe('maxBossPicture (plan 8X-2)', () => {
+  const at = (name: string): string => `${POKEMON_ICON_BASE}${name}`;
+
+  it('is the Gigantamax file of a Gigantamax boss: of its form first, else of its species', () => {
+    const withForm = new PokemonIcons([
+      ...icons.names(),
+      'pm892.fRAPID_STRIKE_GIGANTAMAX.icon.png',
+    ]);
+    expect(maxBossPicture(entry('machamp'), 'G', { catalogue, icons })).toBe(
+      at('pm68.fGIGANTAMAX.icon.png'),
+    );
+    expect(maxBossPicture(entry('toxtricity_amped'), 'G', { catalogue, icons })).toBe(
+      at('pm849.fGIGANTAMAX.icon.png'),
+    );
+    expect(maxBossPicture(entry('urshifu_rapid_strike'), 'G', { catalogue, icons: withForm })).toBe(
+      at('pm892.fRAPID_STRIKE_GIGANTAMAX.icon.png'),
+    );
+  });
+
+  it("is the Pokémon's own picture where the game has no Gigantamax file", () => {
+    expect(maxBossPicture(entry('urshifu_rapid_strike'), 'G', { catalogue, icons })).toBe(
+      at('pm892.fRAPID_STRIKE.icon.png'),
+    );
+    expect(maxBossPicture(entry('eternatus_eternamax'), 'G', { catalogue, icons })).toBe(
+      at('pm890.fETERNAMAX.icon.png'),
+    );
+  });
+
+  it('is never the Gigantamax file of a Dynamax boss', () => {
+    expect(maxBossPicture(entry('machamp'), 'D2', { catalogue, icons })).toBe(at('pm68.icon.png'));
+  });
+
+  it('is nothing without a list of icons', () => {
+    expect(maxBossPicture(entry('machamp'), 'G', { catalogue })).toBeUndefined();
+    expect(maxBossPicture(undefined, 'G', { catalogue, icons })).toBeUndefined();
+  });
+});
diff --git a/src/domain/pogo/pokemon-icons.ts b/src/domain/pogo/pokemon-icons.ts
index d43ceb18955196aa211e5bc506c5b7361499bc08..d7be160ca5294383d5483ddf8071260a5519db26 100644
--- a/src/domain/pogo/pokemon-icons.ts
+++ b/src/domain/pogo/pokemon-icons.ts
@@ -1,6 +1,7 @@
 import type { PokemonCatalogue } from './catalogue.js';
 import { bossIdsOf } from './feed-lookup.js';
 import type { PokemonEntry } from './game-master.js';
+import type { MaxTier } from './max-tier.js';
 import { formTokens } from './raid-boss-feed.js';
 
 /**
@@ -207,6 +208,32 @@ export function iconAddress(
   return name === undefined ? undefined : `${POKEMON_ICON_BASE}${name}`;
 }
 
+/**
+ * The picture of a max battle's boss (plan 8X-2; Pokebattler's feed has no pictures): for a
+ * Gigantamax boss the game's Gigantamax file of its form (`pm849.fAMPED_GIGANTAMAX`), else of its
+ * species (`pm68.fGIGANTAMAX`), else its own picture as `iconAddress` finds it (Eternatus,
+ * which has none); for a Dynamax boss always its own picture, as a raid boss's.
+ */
+export function maxBossPicture(
+  entry: PokemonEntry | undefined,
+  tier: MaxTier,
+  source: PictureSource | undefined,
+): string | undefined {
+  if (!entry || !source?.icons) return undefined;
+  if (tier === 'G') {
+    const { pokemonId, form } = bossIdsOf(entry);
+    const suffix = form === null ? '' : formTokens(pokemonId, form).join('_');
+    const dex = String(entry.dex);
+    const files = [
+      ...(suffix === '' || suffix === 'NORMAL' ? [] : [`pm${dex}.f${suffix}_GIGANTAMAX.icon.png`]),
+      `pm${dex}.fGIGANTAMAX.icon.png`,
+    ];
+    const found = files.find((name) => source.icons?.has(name));
+    if (found !== undefined) return `${POKEMON_ICON_BASE}${found}`;
+  }
+  return iconAddress(entry, source);
+}
+
 /**
  * The picture of a Pokémon wherever one is shown (the post of a raid or train, a spawn
  * report): the one place that decides. The raid boss feed's picture wins when there is one: it
diff --git a/src/domain/pogo/raid-boss-feed.ts b/src/domain/pogo/raid-boss-feed.ts
index eb639b0e04471c98172220d7db74a1791e1c44db..e085a053afd833f1a0780b349e339ef790d191e1 100644
--- a/src/domain/pogo/raid-boss-feed.ts
+++ b/src/domain/pogo/raid-boss-feed.ts
@@ -26,10 +26,16 @@ export interface FeedBoss<T = RaidTier> {
   name: string;
   /** Address of the boss's picture, when the feed gives a usable one. */
   image?: string;
+  /**
+   * When it is a boss from (epoch ms), for one the feed lists before its start (an upcoming max
+   * boss, plan 8X-2); stored as `firstSeen` when that is later than the read, and the list in
+   * effect leaves it out until then. Undefined: from the read that lists it.
+   */
+  startsAt?: number;
 }
 
-export interface ParsedFeed {
-  bosses: FeedBoss[];
+export interface ParsedFeed<T = RaidTier> {
+  bosses: FeedBoss<T>[];
   /**
    * What the feed has that Pine has no raid tier for, as the headings (`Mega Raids`) or, for a
    * shadow name under a level without shadow raids, `Shadow under <heading>`; those bosses were
@@ -38,6 +44,11 @@ export interface ParsedFeed {
   unknownLevels: string[];
   /** Entries left out: no usable name or tier, a heading or a shadow name Pine has no tier for. */
   skipped: number;
+  /**
+   * The feed's ids of bosses the game data does not know (the max boss feed only, which names
+   * its bosses by id): they are listed by a name made of the id, without stats.
+   */
+  unknownIds?: string[];
 }
 
 /**
diff --git a/src/domain/pogo/raid-bosses.ts b/src/domain/pogo/raid-bosses.ts
index 6b9d6d11697b6126947d562712ec9e17c9314e16..f56976825e85cab18f03c9d7cc8390b8cb5e6736 100644
--- a/src/domain/pogo/raid-bosses.ts
+++ b/src/domain/pogo/raid-bosses.ts
@@ -50,14 +50,18 @@ export interface BossOverride<T = RaidTier> extends NewBossOverride<T> {
   createdAt: number;
 }
 
-/** A boss of the list in effect: the feed's list with the moderators' overrides applied. */
-export interface RaidBoss extends BossIds {
+/**
+ * A boss of a list in effect: the feed's list with the moderators' overrides applied. A raid
+ * boss (`RaidBoss`), or a max boss (`MaxBoss`, `T` is `MaxTier`; plan 8X-2), whose `autoset` is
+ * always false: a max battle has no egg.
+ */
+export interface Boss<T = RaidTier> extends BossIds {
   /**
    * What tells bosses of one tier apart: the catalogue key when the game master knows the
    * Pokémon, otherwise the lower-cased form or species id behind `UNKNOWN_KEY_PREFIX`.
    */
   key: string;
-  tier: RaidTier;
+  tier: T;
   shiny: boolean;
   /** The catalogue's name, or the feed's for a Pokémon the game master does not know yet. */
   name: string;
@@ -74,19 +78,56 @@ export interface RaidBoss extends BossIds {
   image?: string;
 }
 
+/** A boss of the raid boss list in effect. */
+export type RaidBoss = Boss<RaidTier>;
+
+/**
+ * What the lists of a family of bosses (raid bosses, max bosses) need to know of its tiers and
+ * its feed rows; the rest of the rules of a list in effect are the same for both.
+ */
+export interface BossFamilyOps<T> {
+  sameTier(a: T, b: T): boolean;
+  /** Where the tier comes in the list's order, lowest first. */
+  rank(tier: T): number;
+  /** The tier as text that tells it from every other tier of the family. */
+  slot(tier: T): string;
+  /** The catalogue entry a feed or stored row of the family stands for, if the catalogue knows it. */
+  resolve(
+    catalogue: PokemonCatalogue,
+    boss: BossIds & { name?: string; tier?: T },
+  ): PokemonEntry | undefined;
+}
+
 const GAME_MASTER_ID = /^[A-Z][A-Z0-9_]{0,63}$/;
 const SNOWFLAKE = /^\d{5,30}$/;
 
 /** What is wrong with an override a moderator asked for; undefined when it can be stored. */
 export function overrideProblem(override: NewBossOverride, now: number): string | undefined {
-  const { action, tier, shiny, expiresAt } = override;
+  return overrideProblemOf(override, now, ({ action, tier }) => {
+    if (action !== 'shiny' && tier === null) return 'A raid tier is needed.';
+    if (tier && !isRaidLevel(tier.level)) return 'That is not a raid tier.';
+    if (tier && !raidTier(tier.level, tier.shadow))
+      return 'There are no shadow raids of that tier.';
+    return undefined;
+  });
+}
+
+/**
+ * What is wrong with an override of any family: its ids, its member, then what `tierProblem`
+ * says of its tier and action, then its shiny flag and expiry.
+ */
+export function overrideProblemOf<T>(
+  override: NewBossOverride<T>,
+  now: number,
+  tierProblem: (override: NewBossOverride<T>) => string | undefined,
+): string | undefined {
+  const { action, shiny, expiresAt } = override;
   if (!GAME_MASTER_ID.test(override.pokemonId)) return 'That is not a Pokémon id.';
   if (override.form !== null && !GAME_MASTER_ID.test(override.form))
     return 'That is not a form id.';
   if (!SNOWFLAKE.test(override.createdBy)) return 'That is not a member id.';
-  if (action !== 'shiny' && tier === null) return 'A raid tier is needed.';
-  if (tier && !isRaidLevel(tier.level)) return 'That is not a raid tier.';
-  if (tier && !raidTier(tier.level, tier.shadow)) return 'There are no shadow raids of that tier.';
+  const tierSays = tierProblem(override);
+  if (tierSays !== undefined) return tierSays;
   if (action === 'shiny' && shiny === null) return 'Say whether it can be shiny or not.';
   if (action === 'hide' && shiny !== null) return 'Hiding a boss says nothing about shiny.';
   if (expiresAt !== null && !(Number.isSafeInteger(expiresAt) && expiresAt > now)) {
@@ -102,11 +143,20 @@ export function overrideProblem(override: NewBossOverride, now: number): string
  * a boss of the tier or come back when the new one is hidden or lapses.
  */
 export function replacesOverride(saved: NewBossOverride, earlier: NewBossOverride): boolean {
+  return replacesOverrideIn(RAID_OPS, saved, earlier);
+}
+
+/** `replacesOverride` for the overrides of any family. */
+export function replacesOverrideIn<T>(
+  ops: Pick<BossFamilyOps<T>, 'sameTier'>,
+  saved: NewBossOverride<T>,
+  earlier: NewBossOverride<T>,
+): boolean {
   if (saved.action !== earlier.action) return false;
   const sameTier =
     saved.tier === null || earlier.tier === null
       ? saved.tier === earlier.tier
-      : sameRaidTier(saved.tier, earlier.tier);
+      : ops.sameTier(saved.tier, earlier.tier);
   if (!sameTier) return false;
   return (
     saved.action === 'autoset' ||
@@ -140,13 +190,17 @@ export function resolveBoss(
   return resolved ? catalogue.byGameMasterId(resolved.pokemonId, resolved.form) : undefined;
 }
 
-function tierRank(tier: RaidTier): number {
-  return RAID_LEVELS.indexOf(tier.level) * 2 + (tier.shadow ? 1 : 0);
-}
+/** The raid bosses' tiers and rows: matched by `resolveBoss`, the feed's names included. */
+export const RAID_OPS: BossFamilyOps<RaidTier> = {
+  sameTier: sameRaidTier,
+  rank: (tier) => RAID_LEVELS.indexOf(tier.level) * 2 + (tier.shadow ? 1 : 0),
+  slot: (tier) => `${tier.level}|${String(tier.shadow)}`,
+  resolve: resolveBoss,
+};
 
-function compareBosses(a: RaidBoss, b: RaidBoss): number {
+function compareBosses<T>(ops: BossFamilyOps<T>, a: Boss<T>, b: Boss<T>): number {
   return (
-    tierRank(a.tier) - tierRank(b.tier) ||
+    ops.rank(a.tier) - ops.rank(b.tier) ||
     (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
     (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
   );
@@ -182,7 +236,16 @@ export function feedBossKey(
   boss: FeedBoss,
   catalogue: PokemonCatalogue,
 ): { key: string; entry: PokemonEntry | undefined } {
-  const entry = resolveBoss(catalogue, boss);
+  return familyBossKey(RAID_OPS, boss, catalogue);
+}
+
+/** `feedBossKey` for a row of any family, resolved as the family resolves its rows. */
+export function familyBossKey<T>(
+  ops: BossFamilyOps<T>,
+  boss: FeedBoss<T>,
+  catalogue: PokemonCatalogue,
+): { key: string; entry: PokemonEntry | undefined } {
+  const entry = ops.resolve(catalogue, boss);
   return { key: keyOf(boss, entry), entry };
 }
 
@@ -194,10 +257,21 @@ export function feedBossKey(
 export function overrideKeys(
   feed: readonly FeedBoss[],
   catalogue: PokemonCatalogue,
+): (ids: BossIds) => { key: string; entry: PokemonEntry | undefined } {
+  return familyOverrideKeys(RAID_OPS, feed, catalogue);
+}
+
+/** `overrideKeys` for the overrides of any family. */
+export function familyOverrideKeys<T>(
+  ops: BossFamilyOps<T>,
+  feed: readonly FeedBoss<T>[],
+  catalogue: PokemonCatalogue,
 ): (ids: BossIds) => { key: string; entry: PokemonEntry | undefined } {
   const feedKeys = new Map<string, { key: string; entry: PokemonEntry | undefined }>();
   for (const boss of feed) {
-    if (!feedKeys.has(rawIds(boss))) feedKeys.set(rawIds(boss), feedBossKey(boss, catalogue));
+    if (!feedKeys.has(rawIds(boss))) {
+      feedKeys.set(rawIds(boss), familyBossKey(ops, boss, catalogue));
+    }
   }
   return (ids) => {
     const exact = catalogue.byGameMasterId(ids.pokemonId, ids.form);
@@ -230,16 +304,28 @@ export function effectiveBosses(
   catalogue: PokemonCatalogue,
   now: number,
 ): RaidBoss[] {
+  return familyBosses(RAID_OPS, feed, overrides, catalogue, now);
+}
+
+/** `effectiveBosses` for the list of any family (plan 8X-2: the max bosses, which have no `autoset`). */
+export function familyBosses<T>(
+  ops: BossFamilyOps<T>,
+  feed: readonly FeedBoss<T>[],
+  overrides: readonly BossOverride<T>[],
+  catalogue: PokemonCatalogue,
+  now: number,
+): Boss<T>[] {
   const active = overrides
     .filter((override) => override.expiresAt === null || override.expiresAt > now)
     .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
-  const slot = (key: string, tier: RaidTier): string =>
-    `${key}|${tier.level}|${String(tier.shadow)}`;
-  const overrideKey = overrideKeys(feed, catalogue);
+  const slot = (key: string, tier: T): string => `${key}|${ops.slot(tier)}`;
+  const overrideKey = familyOverrideKeys(ops, feed, catalogue);
+  // A tier is a plain value or a plain object of plain values: copied, so no list shares it.
+  const copy = (tier: T): T => (typeof tier === 'object' && tier !== null ? { ...tier } : tier);
 
-  const bosses = new Map<string, RaidBoss>();
+  const bosses = new Map<string, Boss<T>>();
   for (const boss of feed) {
-    const { key, entry } = feedBossKey(boss, catalogue);
+    const { key, entry } = familyBossKey(ops, boss, catalogue);
     const existing = bosses.get(slot(key, boss.tier));
     if (existing) {
       existing.shiny ||= boss.shiny;
@@ -250,7 +336,7 @@ export function effectiveBosses(
       key,
       pokemonId: boss.pokemonId,
       form: boss.form,
-      tier: { ...boss.tier },
+      tier: copy(boss.tier),
       shiny: boss.shiny,
       name: entry?.name ?? boss.name,
       entry,
@@ -262,13 +348,15 @@ export function effectiveBosses(
 
   const targets = active.map((override) => ({ override, ...overrideKey(override) }));
   for (const { override, entry, key } of targets) {
-    if ((override.action !== 'add' && override.action !== 'autoset') || !override.tier) continue;
+    if ((override.action !== 'add' && override.action !== 'autoset') || override.tier === null) {
+      continue;
+    }
     if (bosses.has(slot(key, override.tier))) continue;
     bosses.set(slot(key, override.tier), {
       key,
       pokemonId: override.pokemonId,
       form: override.form,
-      tier: { ...override.tier },
+      tier: copy(override.tier),
       shiny: override.shiny ?? false,
       name: entry?.name ?? titleCase(override.form ?? override.pokemonId),
       entry,
@@ -277,7 +365,9 @@ export function effectiveBosses(
     });
   }
   for (const { override, key } of targets) {
-    if (override.action === 'hide' && override.tier) bosses.delete(slot(key, override.tier));
+    if (override.action === 'hide' && override.tier !== null) {
+      bosses.delete(slot(key, override.tier));
+    }
   }
 
   const list = [...bosses.values()];
@@ -290,20 +380,20 @@ export function effectiveBosses(
     if (override.shiny === null) continue;
     for (const boss of list) {
       if (boss.key !== key) continue;
-      if (override.tier && !sameRaidTier(boss.tier, override.tier)) continue;
+      if (override.tier !== null && !ops.sameTier(boss.tier, override.tier)) continue;
       boss.shiny = override.shiny;
     }
   }
   // Oldest first, so the newest autoset of a tier that is still a boss ends up as the one flagged.
   for (const { override, key } of targets) {
-    if (override.action !== 'autoset' || !override.tier) continue;
+    if (override.action !== 'autoset' || override.tier === null) continue;
     const chosen = bosses.get(slot(key, override.tier));
     if (!chosen) continue;
     for (const boss of list) {
-      if (sameRaidTier(boss.tier, chosen.tier)) boss.autoset = boss === chosen;
+      if (ops.sameTier(boss.tier, chosen.tier)) boss.autoset = boss === chosen;
     }
   }
-  return list.sort(compareBosses);
+  return list.sort((a, b) => compareBosses(ops, a, b));
 }
 
 /**
@@ -315,13 +405,9 @@ export function autosetBoss(bosses: readonly RaidBoss[], tier: RaidTier): RaidBo
   return ofTier.find((boss) => boss.autoset) ?? (ofTier.length === 1 ? ofTier[0] : undefined);
 }
 
-export interface BossListChange {
-  added: FeedBoss[];
-  removed: FeedBoss[];
-}
-
-function feedIdentity(boss: FeedBoss): string {
-  return `${boss.pokemonId}|${boss.form ?? ''}|${boss.tier.level}|${String(boss.tier.shadow)}`;
+export interface BossListChange<T = RaidTier> {
+  added: FeedBoss<T>[];
+  removed: FeedBoss<T>[];
 }
 
 /**
@@ -332,10 +418,21 @@ function feedIdentity(boss: FeedBoss): string {
  * and tier.
  */
 export function diffFeed(before: readonly FeedBoss[], after: readonly FeedBoss[]): BossListChange {
-  const was = new Set(before.map(feedIdentity));
-  const is = new Set(after.map(feedIdentity));
+  return diffFeedIn(RAID_OPS, before, after);
+}
+
+/** `diffFeed` for the feed of any family. */
+export function diffFeedIn<T>(
+  ops: Pick<BossFamilyOps<T>, 'slot'>,
+  before: readonly FeedBoss<T>[],
+  after: readonly FeedBoss<T>[],
+): BossListChange<T> {
+  const identity = (boss: FeedBoss<T>): string =>
+    `${boss.pokemonId}|${boss.form ?? ''}|${ops.slot(boss.tier)}`;
+  const was = new Set(before.map(identity));
+  const is = new Set(after.map(identity));
   return {
-    added: after.filter((boss) => !was.has(feedIdentity(boss))),
-    removed: before.filter((boss) => !is.has(feedIdentity(boss))),
+    added: after.filter((boss) => !was.has(identity(boss))),
+    removed: before.filter((boss) => !is.has(identity(boss))),
   };
 }
diff --git a/src/services/boss-feed-service.ts b/src/services/boss-feed-service.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8678d2d4b3a8d0e1bb6ca18f50aeef7d5a625956
--- /dev/null
+++ b/src/services/boss-feed-service.ts
@@ -0,0 +1,714 @@
+import type { BossStore, StoredBoss } from '../db/repositories/raid-boss-repository.js';
+import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
+import { diffBossesIn, type SeenChange } from '../domain/pogo/boss-diff.js';
+import type { FeedBoss, ParsedFeed } from '../domain/pogo/raid-boss-feed.js';
+import {
+  diffFeedIn,
+  replacesOverrideIn,
+  type Boss,
+  type BossFamilyOps,
+  type BossListChange,
+  type BossOverride,
+  type NewBossOverride,
+} from '../domain/pogo/raid-bosses.js';
+import type { RaidTier } from '../domain/pogo/raid-tier.js';
+import type { Logger } from '../log.js';
+import { failureReason } from './failure-reason.js';
+import type { GameDataProvider } from './game-data-service.js';
+
+/** The longest delay `setTimeout` accepts; anything longer fires immediately. */
+const MAX_TIMER_MS = 2 ** 31 - 1;
+const MINUTE_MS = 60_000;
+/** Consecutive failed attempts that are followed by a quick retry. */
+const QUICK_RETRIES = 3;
+/** A list shorter than this is not judged for shrinking: a few bosses come and go each week. */
+export const SHRINK_FLOOR = 4;
+
+/**
+ * What one family of bosses is to the service that keeps its list (plan 8X-2): the raid bosses of
+ * ScrapedDuck's feed (`RaidBossService`) and the max bosses of Pokebattler's (`MaxBossService`).
+ * The reading, storing, scheduling, retrying, overrides and warnings are the same for both.
+ */
+export interface BossFeedFamily<T> {
+  /** What the log lines and errors call one of its bosses: `raid boss`, `max boss`. */
+  readonly noun: string;
+  /** A document longer than this is not the feed. */
+  readonly maxFeedChars: number;
+  readonly ops: BossFamilyOps<T>;
+  /** Reads a downloaded document; throws when it is not the feed. */
+  parse(json: unknown, catalogue: PokemonCatalogue, now: number): ParsedFeed<T>;
+  /** The list in effect at `now` from the stored feed and the overrides. */
+  effective(
+    feed: readonly StoredBoss<T>[],
+    overrides: readonly BossOverride<T>[],
+    catalogue: PokemonCatalogue,
+    now: number,
+  ): Boss<T>[];
+  /** What is wrong with an override staff asked for; undefined when it can be stored. */
+  overrideProblem(override: NewBossOverride<T>, now: number): string | undefined;
+}
+
+/**
+ * What a download of the feed gave: a 304 for the list stored, or the bosses of a valid feed with
+ * its validators and the catalogue it was read with.
+ */
+type FeedRead<T> =
+  | { notModified: true }
+  | {
+      notModified: false;
+      bosses: FeedBoss<T>[];
+      validators: { etag?: string; lastModified?: string };
+      catalogue: PokemonCatalogue;
+    };
+
+/** Thrown inside a sync that `stop` ended; never leaves the service. */
+class SyncStopped extends Error {}
+
+/**
+ * Why a read of the feed failed, for an answer to staff that never shows an address or a database
+ * message: `status` (the feed answered with an HTTP status that is no feed, `httpStatus`),
+ * `timeout`, `unreachable` (no answer at all), `unreadable` (an answer that is not the feed),
+ * `storing` (the database failed), `stopped` (the service was stopped).
+ */
+export type SyncFailure =
+  'status' | 'timeout' | 'unreachable' | 'unreadable' | 'storing' | 'stopped';
+
+/** A failure of the read itself, with its kind; anything else thrown in a sync is `storing`. */
+class FeedFailure extends Error {
+  constructor(
+    message: string,
+    readonly kind: Exclude<SyncFailure, 'storing' | 'stopped'>,
+    readonly httpStatus?: number,
+    options?: ErrorOptions,
+  ) {
+    super(message, options);
+  }
+}
+
+/** The part of `fetch` this service needs. */
+export type FetchFeed = (
+  url: string,
+  init: { signal: AbortSignal; headers: Record<string, string> },
+) => Promise<{
+  ok: boolean;
+  status: number;
+  headers: { get(name: string): string | null };
+  text(): Promise<string>;
+}>;
+
+export interface BossFeedOptions<T> {
+  /** Address of the feed. */
+  url: string;
+  /** How often the feed is read. */
+  refreshMs: number;
+  /** How long without a successful read before `onStale` listeners are told, once. */
+  staleAfterMs: number;
+  store: BossStore<T>;
+  /** Bosses are matched to the catalogue in use at the moment they are asked for. */
+  gameData: GameDataProvider;
+  fetch: FetchFeed;
+  log: Logger;
+  now?: () => number;
+  /** How long one download may take before it is abandoned. Default 30 seconds. */
+  timeoutMs?: number;
+  /**
+   * How long to wait after a failed attempt before the next, for the first three failures in a
+   * row; from the fourth on the next attempt comes after `refreshMs`, so a feed that stays down is
+   * not tried (and logged) every few minutes for ever. Default: 5 minutes, or `refreshMs` if shorter.
+   */
+  retryMs?: number;
+}
+
+/** What a read of the feed says beyond its bosses; each part only when there is something to say. */
+export interface FeedRemarks {
+  /**
+   * The headings of the feed that Pine has no tier for (as `ParsedFeed.unknownLevels`): their
+   * bosses were left out. The only sign that a tier vanished because the feed renamed it.
+   */
+  unknownLevels?: string[];
+  /**
+   * The list has fewer than half the bosses it had (it had at least `SHRINK_FLOOR`): the feed may
+   * be broken in a way its checks do not see. The list is taken all the same.
+   */
+  shrank?: { before: number; after: number };
+}
+
+/**
+ * A change of the feed's list: the feed's own rows that came and went (`BossListChange`), and
+ * what members see change, the list in effect before and after with the overrides in force
+ * (`seen`): a boss an override hides or adds does not come or go for them.
+ */
+export interface FeedChange<T = RaidTier> extends BossListChange<T> {
+  seen: SeenChange<Boss<T>>;
+}
+
+export type SyncResult<T = RaidTier> =
+  /** The feed lists other bosses than before. */
+  | ({ status: 'updated'; change: FeedChange<T> } & FeedRemarks)
+  /** The feed was read and lists the same bosses. */
+  | ({ status: 'unchanged' } & FeedRemarks)
+  /**
+   * The feed could not be read or was not valid; the list in use is unchanged. `reason` is for the
+   * log (it may hold the address or a database message); `kind` is what may be said.
+   */
+  | { status: 'failed'; kind: SyncFailure; httpStatus?: number; reason: string };
+
+/** What staff need of a boss list beyond what handlers read (`/admin boss`). */
+export interface BossAdmin<T> {
+  /** The bosses the feed listed at the last successful read, as stored. */
+  feedBosses(): StoredBoss<T>[];
+  /** The overrides in force, oldest first. */
+  overrides(): BossOverride<T>[];
+  addOverride(override: NewBossOverride<T>): Promise<BossOverride<T>>;
+  removeOverride(id: number): Promise<boolean>;
+  sync(): Promise<SyncResult<T>>;
+  /** When the feed was last read successfully (epoch ms); undefined if it never was. */
+  readonly lastSyncedAt: number | undefined;
+  /** The headings Pine does not know, of the last feed that was read whole; empty before that. */
+  readonly unknownLevels: readonly string[];
+}
+
+export interface StaleFeed {
+  /** When the feed was last read successfully (epoch ms); undefined if it never was. */
+  lastSyncedAt: number | undefined;
+  /** Why the latest attempt failed. */
+  reason: string;
+}
+
+type Listener<T> = (event: T) => void | Promise<void>;
+
+/**
+ * Keeps the boss list of a family: reads its feed on a timer, stores it, and applies the
+ * moderators' overrides. Nothing happens until `load` is called, and `load` never uses the
+ * network: the bot starts with the list of the last run and the feed is read in the background.
+ */
+export class BossFeedService<T> implements BossAdmin<T> {
+  private feed: StoredBoss<T>[] = [];
+  private overrideList: BossOverride<T>[] = [];
+  private loaded = false;
+  private syncedAt: number | undefined;
+  private attemptedAt: number | undefined;
+  protected readonly now: () => number;
+  private readonly timeoutMs: number;
+  private readonly retryMs: number;
+  private failures = 0;
+  private overrideReads = 0;
+  private overrideReadApplied = 0;
+  private controller: AbortController | undefined;
+  // In memory only, on purpose: after a restart the first read is unconditional, which also fills
+  // the columns a later migration added (a 304 would leave them empty).
+  private validators: { etag?: string; lastModified?: string } = {};
+  // The catalogue the feed behind `validators` was parsed with: a 304 would keep the ids worked out
+  // with it, so after a game data refresh the next request is unconditional.
+  private validatorsCatalogue: PokemonCatalogue | undefined;
+  private inFlight: Promise<SyncResult<T>> | undefined;
+  /** The tail of `exclusive`'s queue; never rejects. */
+  private queue: Promise<void> = Promise.resolve();
+  private timer: NodeJS.Timeout | undefined;
+  private stopped = false;
+  private staleReported = false;
+  private reportedSkipped = 0;
+  private lastUnknownLevels: readonly string[] = [];
+  private readonly reportedLevels = new Set<string>();
+  private readonly reportedIds = new Set<string>();
+  private readonly changeListeners = new Set<Listener<FeedChange<T>>>();
+  private readonly staleListeners = new Set<Listener<StaleFeed>>();
+  private readonly notLoaded: string;
+
+  constructor(
+    private readonly options: BossFeedOptions<T>,
+    protected readonly family: BossFeedFamily<T>,
+  ) {
+    this.now = options.now ?? (() => Date.now());
+    this.timeoutMs = options.timeoutMs ?? 30_000;
+    this.retryMs = options.retryMs ?? Math.min(options.refreshMs, 5 * MINUTE_MS);
+    this.notLoaded = `The ${family.noun} list has not been loaded yet`;
+  }
+
+  /** Reads the stored list and overrides. Does not download anything. */
+  async load(): Promise<void> {
+    const { store } = this.options;
+    [this.feed, , this.syncedAt] = await Promise.all([
+      store.listActive(),
+      this.reloadOverrides(),
+      store.lastSyncedAt(),
+    ]);
+    this.loaded = true;
+  }
+
+  /**
+   * Re-reads the overrides. Each read is numbered when it starts and its result is applied only
+   * if no later read has been applied, so a slow older read cannot put back an older list.
+   */
+  private async reloadOverrides(): Promise<void> {
+    const read = ++this.overrideReads;
+    const list = await this.options.store.listOverrides();
+    if (read > this.overrideReadApplied) {
+      this.overrideReadApplied = read;
+      this.overrideList = list;
+    }
+  }
+
+  /** Every boss: the feed's list with the moderators' overrides applied, by tier, then name. */
+  bosses(): Boss<T>[] {
+    if (!this.loaded) throw new Error(this.notLoaded);
+    return this.family.effective(
+      this.feed,
+      this.overrideList,
+      this.options.gameData.catalogue,
+      this.now(),
+    );
+  }
+
+  /** When the feed was last read successfully (epoch ms); undefined if it never was. */
+  get lastSyncedAt(): number | undefined {
+    return this.syncedAt;
+  }
+
+  /** The headings Pine does not know, of the last feed that was read whole; empty before that. */
+  get unknownLevels(): readonly string[] {
+    return this.lastUnknownLevels;
+  }
+
+  /** The bosses the feed listed at the last successful read, as stored. */
+  feedBosses(): StoredBoss<T>[] {
+    if (!this.loaded) throw new Error(this.notLoaded);
+    return this.feed.map((boss) => structuredClone(boss));
+  }
+
+  /** The overrides in force, oldest first. */
+  overrides(): BossOverride<T>[] {
+    const now = this.now();
+    return this.overrideList.filter((o) => o.expiresAt === null || o.expiresAt > now);
+  }
+
+  /**
+   * Stores an override; it applies at once. One with the same action for the same Pokémon and
+   * tier replaces the earlier one, and an `autoset` replaces every earlier `autoset` of its tier
+   * (`replacesOverride`). Throws a RangeError for an override that makes no sense.
+   */
+  async addOverride(override: NewBossOverride<T>): Promise<BossOverride<T>> {
+    const now = this.now();
+    const problem = this.family.overrideProblem(override, now);
+    if (problem) throw new RangeError(problem);
+    return this.exclusive(async () => {
+      const saved = await this.options.store.saveOverride(override, now);
+      await this.reloadAfterWrite(() => {
+        // The store replaced the overrides that this one replaces.
+        this.overrideList = [
+          ...this.overrideList.filter((o) => !replacesOverrideIn(this.family.ops, saved, o)),
+          saved,
+        ];
+      });
+      return saved;
+    });
+  }
+
+  /** Whether there was such an override. */
+  removeOverride(id: number): Promise<boolean> {
+    return this.exclusive(async () => {
+      const removed = await this.options.store.removeOverride(id);
+      await this.reloadAfterWrite(() => {
+        this.overrideList = this.overrideList.filter((o) => o.id !== id);
+      });
+      return removed;
+    });
+  }
+
+  /**
+   * Runs `work` after everything `exclusive` was given before it has finished, failed or not:
+   * the writes of overrides and the part of a sync from storing the feed to working out what
+   * members see change. A write in the middle of that part would count as in force before the
+   * sync as well as after it, and members would not be told of a boss it made them see.
+   */
+  private exclusive<R>(work: () => Promise<R>): Promise<R> {
+    const result = this.queue.then(work);
+    this.queue = result.then(
+      () => undefined,
+      () => undefined,
+    );
+    return result;
+  }
+
+  /**
+   * Re-reads the overrides after a write that succeeded. If only the re-read fails, the write
+   * still stands (and applies at the next sync), so the caller is not told it failed: the warning
+   * is logged and `patch` brings the list in memory up to date.
+   */
+  private async reloadAfterWrite(patch: () => void): Promise<void> {
+    try {
+      await this.reloadOverrides();
+    } catch (err) {
+      this.safely(() =>
+        this.options.log.warn({ err }, `could not re-read the ${this.family.noun} overrides`),
+      );
+      // The patch is newer than any read still in flight: none of those may overwrite it.
+      this.overrideReadApplied = this.overrideReads;
+      patch();
+    }
+  }
+
+  /**
+   * Called after a sync in which the feed's bosses changed. Not called for the first sync of a
+   * new database, where there is nothing to compare with. Returns a function that unsubscribes.
+   */
+  onChange(listener: Listener<FeedChange<T>>): () => void {
+    this.changeListeners.add(listener);
+    return () => this.changeListeners.delete(listener);
+  }
+
+  /**
+   * Called once when the feed has not been read successfully for `staleAfterMs`, and again only
+   * after it has worked in between. Returns a function that unsubscribes.
+   */
+  onStale(listener: Listener<StaleFeed>): () => void {
+    this.staleListeners.add(listener);
+    return () => this.staleListeners.delete(listener);
+  }
+
+  /**
+   * Reads the feed and, if it is valid, stores it as the list. Never rejects: a feed that cannot
+   * be read or is not valid leaves the list as it is. Calls made while one is running share its
+   * result. The one way it throws is when `load` has not been called.
+   */
+  sync(): Promise<SyncResult<T>> {
+    if (!this.loaded) throw new Error(this.notLoaded);
+    // A stopped service (shutdown) asks the feed nothing more.
+    if (this.stopped && !this.inFlight) {
+      return Promise.resolve({ status: 'failed', kind: 'stopped', reason: 'stopped' });
+    }
+    this.inFlight ??= this.syncOnce().finally(() => {
+      this.inFlight = undefined;
+    });
+    return this.inFlight;
+  }
+
+  /** Resolves once no sync is in flight (at once when none is). Never rejects. */
+  async whenIdle(): Promise<void> {
+    while (this.inFlight) await this.inFlight;
+  }
+
+  /**
+   * Reads the feed `refreshMs` after the last attempt (at once when the stored list is older
+   * than that or there is none), and again after every attempt. Calling it again while a sync is
+   * scheduled changes nothing. After a failed attempt the next one is `retryMs` later (see
+   * the option for how long that lasts). Throws
+   * when `load` has not been called.
+   */
+  startAutoSync(): void {
+    if (!this.loaded) throw new Error(this.notLoaded);
+    this.stopped = false;
+    if (this.timer) return;
+    this.schedule();
+  }
+
+  /**
+   * Cancels the scheduled sync and ends a download in flight (that sync reports `stopped`).
+   * Writes to the database are not interrupted.
+   */
+  stop(): void {
+    this.stopped = true;
+    this.controller?.abort();
+    if (this.timer) clearTimeout(this.timer);
+    this.timer = undefined;
+  }
+
+  private schedule(): void {
+    if (this.timer) clearTimeout(this.timer);
+    const quick = this.failures > 0 && this.failures <= QUICK_RETRIES;
+    const interval = quick ? this.retryMs : this.options.refreshMs;
+    const last = this.attemptedAt ?? this.syncedAt;
+    const due = last === undefined ? 0 : last + interval - this.now();
+    this.timer = setTimeout(
+      () => {
+        this.timer = undefined;
+        void this.sync().finally(() => {
+          if (!this.stopped) this.schedule();
+        });
+      },
+      // Never longer than the interval: a stored time in the future must not postpone syncing.
+      Math.min(Math.max(due, 0), interval, MAX_TIMER_MS),
+    );
+    this.timer.unref();
+  }
+
+  private async syncOnce(): Promise<SyncResult<T>> {
+    const now = this.now();
+    const attemptedBefore = this.attemptedAt;
+    this.attemptedAt = now;
+    const before = this.feed.length;
+    const feedBefore = this.feed;
+    const { noun, ops } = this.family;
+    let change: BossListChange<T>;
+    let seen: SeenChange<Boss<T>> | undefined;
+    try {
+      const read = await this.readFeed(now);
+      // No override is written from storing the feed until what members see is worked out.
+      ({ change, seen } = await this.exclusive<{
+        change: BossListChange<T>;
+        seen?: SeenChange<Boss<T>>;
+      }>(async () => {
+        const stored = await this.storeFeed(read, now);
+        if (stored.added.length === 0 && stored.removed.length === 0) return { change: stored };
+        // What members see: the lists in effect before and after, with the same overrides.
+        const { catalogue } = this.options.gameData;
+        return {
+          change: stored,
+          seen: diffBossesIn(
+            ops,
+            this.family.effective(feedBefore, this.overrideList, catalogue, now),
+            this.family.effective(this.feed, this.overrideList, catalogue, now),
+          ),
+        };
+      }));
+    } catch (err) {
+      if (err instanceof SyncStopped) {
+        // Nothing was read, so a later `startAutoSync` must not wait for this attempt.
+        this.attemptedAt = attemptedBefore;
+        return { status: 'failed', kind: 'stopped', reason: 'stopped' };
+      }
+      this.failures++;
+      const reason = err instanceof Error ? err.message : String(err);
+      this.safely(() => this.options.log.error({ err }, `could not sync the ${noun}es`));
+      this.reportIfStale(now, reason);
+      if (err instanceof FeedFailure) {
+        return {
+          status: 'failed',
+          kind: err.kind,
+          ...(err.httpStatus === undefined ? {} : { httpStatus: err.httpStatus }),
+          reason,
+        };
+      }
+      return { status: 'failed', kind: 'storing', reason };
+    }
+    const first = this.syncedAt === undefined;
+    this.failures = 0;
+    this.syncedAt = now;
+    this.staleReported = false;
+    const remarks = this.remarks(before, this.feed.length);
+    if (!seen) return { status: 'unchanged', ...remarks };
+    this.safely(() =>
+      this.options.log.info(
+        {
+          added: change.added.map((boss) => boss.name),
+          removed: change.removed.map((boss) => boss.name),
+        },
+        `${noun}es updated`,
+      ),
+    );
+    const feedChange: FeedChange<T> = { ...change, seen };
+    if (!first) this.emit(this.changeListeners, feedChange);
+    return { status: 'updated', change: feedChange, ...remarks };
+  }
+
+  /** What to say of a read beyond its bosses; a list that shrank by more than half is logged. */
+  private remarks(before: number, after: number): FeedRemarks {
+    const remarks: FeedRemarks = {};
+    if (this.lastUnknownLevels.length > 0) remarks.unknownLevels = [...this.lastUnknownLevels];
+    if (before >= SHRINK_FLOOR && after * 2 < before) {
+      remarks.shrank = { before, after };
+      this.safely(() =>
+        this.options.log.warn(
+          { before, after },
+          `the ${this.family.noun} feed lists fewer than half the bosses it did`,
+        ),
+      );
+    }
+    return remarks;
+  }
+
+  /** Downloads and checks the feed; stores nothing. Throws when anything fails. */
+  private async readFeed(now: number): Promise<FeedRead<T>> {
+    const { url } = this.options;
+    const { noun } = this.family;
+    const timeout = AbortSignal.timeout(this.timeoutMs);
+    const controller = new AbortController();
+    this.controller = controller;
+    const signal = AbortSignal.any([timeout, controller.signal]);
+    const headers: Record<string, string> = { Accept: 'application/json' };
+    const catalogue = this.options.gameData.catalogue;
+    if (this.validatorsCatalogue === catalogue) {
+      if (this.validators.etag) headers['If-None-Match'] = this.validators.etag;
+      if (this.validators.lastModified) headers['If-Modified-Since'] = this.validators.lastModified;
+    }
+
+    const conditional = 'If-None-Match' in headers || 'If-Modified-Since' in headers;
+    let status: number;
+    let body = '';
+    let validators: BossFeedService<T>['validators'] = {};
+    try {
+      const response = await this.options.fetch(url, { signal, headers });
+      status = response.status;
+      if (response.ok) {
+        body = await response.text();
+        validators = {
+          etag: response.headers.get('etag') ?? undefined,
+          lastModified: response.headers.get('last-modified') ?? undefined,
+        };
+      }
+    } catch (err) {
+      if (controller.signal.aborted) throw new SyncStopped();
+      if (timeout.aborted) {
+        throw new FeedFailure(
+          `${url}: timed out after ${this.timeoutMs} ms`,
+          'timeout',
+          undefined,
+          {
+            cause: err,
+          },
+        );
+      }
+      throw new FeedFailure(`${url}: ${failureReason(err)}`, 'unreachable', undefined, {
+        cause: err,
+      });
+    } finally {
+      if (this.controller === controller) this.controller = undefined;
+    }
+
+    if (status === 304) {
+      if (!conditional) {
+        throw new FeedFailure(`${url} answered 304 to a request without validators`, 'status', 304);
+      }
+      return { notModified: true };
+    }
+    if (status < 200 || status > 299) {
+      throw new FeedFailure(`${url} answered ${status}`, 'status', status);
+    }
+    if (body.length > this.family.maxFeedChars) {
+      throw new FeedFailure(
+        `${url} sent ${body.length} characters, which is not the ${noun} feed`,
+        'unreadable',
+      );
+    }
+    let json: unknown;
+    try {
+      json = JSON.parse(body);
+    } catch {
+      throw new FeedFailure(`${url} did not send JSON`, 'unreadable');
+    }
+    let parsed: ParsedFeed<T>;
+    try {
+      parsed = this.family.parse(json, catalogue, now);
+    } catch (err) {
+      throw new FeedFailure(
+        err instanceof Error ? err.message : String(err),
+        'unreadable',
+        undefined,
+        {
+          cause: err,
+        },
+      );
+    }
+    const { bosses, unknownLevels, skipped, unknownIds = [] } = parsed;
+    this.lastUnknownLevels = unknownLevels;
+    for (const level of unknownLevels) {
+      if (this.reportedLevels.has(level)) continue;
+      this.reportedLevels.add(level);
+      this.safely(() =>
+        this.options.log.warn({ level }, `the ${noun} feed has a level Pine does not know`),
+      );
+    }
+    // Each once while the bot runs: listed by a name made of the id until the game data knows it.
+    for (const id of unknownIds) {
+      if (this.reportedIds.has(id)) continue;
+      this.reportedIds.add(id);
+      this.safely(() =>
+        this.options.log.warn(
+          { id },
+          `the ${noun} feed names a Pokémon the game data does not know`,
+        ),
+      );
+    }
+    // Reported when the number changes, whether or not the list does; a feed read whole resets it.
+    if (skipped !== this.reportedSkipped) {
+      this.reportedSkipped = skipped;
+      if (skipped > 0) {
+        this.safely(() => this.options.log.warn({ skipped }, `${noun} feed entries were left out`));
+      }
+    }
+    return { notModified: false, bosses, validators, catalogue };
+  }
+
+  /** Stores what `readFeed` read; returns what changed. Throws when anything fails. */
+  private async storeFeed(read: FeedRead<T>, now: number): Promise<BossListChange<T>> {
+    const { store } = this.options;
+    if (read.notModified) {
+      await store.touchActive(now);
+      this.feed = await store.listActive();
+      await this.housekeeping(now);
+      return { added: [], removed: [] };
+    }
+    const change = diffFeedIn(this.family.ops, this.feed, read.bosses);
+    // Forgotten before the list is replaced: if anything after that fails, the next request is
+    // unconditional and repairs the list, instead of a 304 vouching for one the feed does not have.
+    this.validators = {};
+    await store.replaceFeed(read.bosses, now);
+    this.feed = await store.listActive();
+    await this.housekeeping(now);
+    // Remembered only for a feed that was accepted: a 304 must never vouch for a rejected one.
+    this.validators = read.validators;
+    this.validatorsCatalogue = read.catalogue;
+    return change;
+  }
+
+  /** Deletes expired overrides and re-reads the rest; a failure is logged, never fails the sync. */
+  private async housekeeping(now: number): Promise<void> {
+    try {
+      await this.options.store.removeExpiredOverrides(now);
+      await this.reloadOverrides();
+    } catch (err) {
+      this.safely(() =>
+        this.options.log.warn({ err }, `could not tidy the ${this.family.noun} overrides`),
+      );
+    }
+  }
+
+  /**
+   * Tells the listeners once that the list is out of date: `staleAfterMs` after the last
+   * successful read, which is stored and so survives a restart; when the feed has never been
+   * read (a new database), at the second failure in a row, so that one failed first attempt
+   * does not count as staleness.
+   */
+  private reportIfStale(now: number, reason: string): void {
+    if (this.staleReported) return;
+    if (
+      this.syncedAt === undefined
+        ? this.failures < 2
+        : now - this.syncedAt < this.options.staleAfterMs
+    ) {
+      return;
+    }
+    this.staleReported = true;
+    this.safely(() =>
+      this.options.log.warn(
+        {
+          lastSyncedAt: this.syncedAt === undefined ? null : new Date(this.syncedAt).toISOString(),
+        },
+        `the ${this.family.noun} list is out of date`,
+      ),
+    );
+    this.emit(this.staleListeners, { lastSyncedAt: this.syncedAt, reason });
+  }
+
+  /** A listener that throws or rejects must not stop the others or the sync; none is waited for. */
+  private emit<E>(listeners: ReadonlySet<Listener<E>>, event: E): void {
+    const failed = (err: unknown): void =>
+      this.safely(() => this.options.log.error({ err }, `a ${this.family.noun} listener failed`));
+    for (const listener of listeners) {
+      try {
+        void Promise.resolve(listener(event)).catch(failed);
+      } catch (err) {
+        failed(err);
+      }
+    }
+  }
+
+  /** A broken logger must not turn a finished sync into a rejected one. */
+  private safely(action: () => void): void {
+    try {
+      action();
+    } catch {
+      // Nothing useful can be done about a logger that throws.
+    }
+  }
+}
diff --git a/src/services/max-boss-service.test.ts b/src/services/max-boss-service.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..60a4059d3f2601102f55bee44f1f4c61e1710197
--- /dev/null
+++ b/src/services/max-boss-service.test.ts
@@ -0,0 +1,91 @@
+import { describe, expect, it } from 'vitest';
+import {
+  at,
+  MAX_FEED_READ_AT,
+  pokebattlerFeed,
+  readPokebattlerFeed,
+} from '../../test/support/max-bosses.js';
+import { feedReply } from '../../test/support/raid-bosses.js';
+import { maxBossServiceWith } from '../../test/support/max-boss-service.js';
+
+describe('MaxBossService', () => {
+  it('stores the feed and offers the bosses of the day, an upcoming one from its day', async () => {
+    const { service, state } = await maxBossServiceWith();
+    expect(await service.sync()).toMatchObject({ status: 'updated' });
+    expect(service.feedBosses()).toHaveLength(60);
+    const names = () => service.bosses().map((boss) => boss.name);
+    expect(names()).toHaveLength(57);
+    expect(names()).not.toContain('Uxie');
+    state.now = at('2026-10-24T00:00');
+    expect(names()).toHaveLength(60);
+    expect(
+      service
+        .bosses()
+        .filter((boss) => boss.tier === 'D5')
+        .map((boss) => boss.name),
+    ).toEqual(['Azelf', 'Mesprit', 'Uxie']);
+  });
+
+  it('keeps an upcoming boss back after a restart too: its start is stored', async () => {
+    const { service, store, restarted } = await maxBossServiceWith();
+    await service.sync();
+    const again = await restarted();
+    expect(again.feedBosses()).toEqual(service.feedBosses());
+    expect(again.bosses().some((boss) => boss.name === 'Uxie')).toBe(false);
+    expect(await store.lastSyncedAt()).toBe(MAX_FEED_READ_AT);
+  });
+
+  it('tells of a Pokémon the game data does not know once, and lists it by its id', async () => {
+    const { service, state, logged } = await maxBossServiceWith();
+    const feed = JSON.stringify(
+      pokebattlerFeed({ RAID_LEVEL_6_MAX: [{ pokemonId: 'NEWMON_GIGANTAMAX' }] }),
+    );
+    state.respond = () => Promise.resolve(feedReply(200, feed));
+    await service.sync();
+    state.now += 60_000;
+    await service.sync();
+    const told = logged.filter(
+      (entry) => entry['msg'] === 'the max boss feed names a Pokémon the game data does not know',
+    );
+    expect(told.map((entry) => entry['id'])).toEqual(['NEWMON_GIGANTAMAX']);
+    expect(service.bosses().map((boss) => [boss.name, boss.tier, boss.entry])).toEqual([
+      ['Newmon', 'G', undefined],
+    ]);
+  });
+
+  it('says its failures as max bosses, and keeps the list it had', async () => {
+    const { service, state, logged } = await maxBossServiceWith();
+    await service.sync();
+    state.respond = () => Promise.resolve(feedReply(200, JSON.stringify({ tiers: [] })));
+    state.now += 60_000;
+    expect(await service.sync()).toMatchObject({ status: 'failed', kind: 'unreadable' });
+    expect(logged.some((entry) => entry['msg'] === 'could not sync the max bosses')).toBe(true);
+    expect(service.feedBosses()).toHaveLength(60);
+  });
+
+  it('takes its own overrides, and refuses an autoset or a shiny one for every tier', async () => {
+    const { service } = await maxBossServiceWith();
+    await service.sync();
+    const ids = { pokemonId: 'MACHAMP', form: null, createdBy: '123456789012345678' };
+    await service.addOverride({ ...ids, action: 'add', tier: 'G', shiny: true, expiresAt: null });
+    expect(
+      service
+        .bosses()
+        .filter((boss) => boss.tier === 'G')
+        .map((boss) => boss.key),
+    ).toEqual(['machamp']);
+    await expect(
+      service.addOverride({ ...ids, action: 'autoset', tier: 'D2', shiny: null, expiresAt: null }),
+    ).rejects.toThrow(RangeError);
+    await expect(
+      service.addOverride({ ...ids, action: 'shiny', tier: null, shiny: true, expiresAt: null }),
+    ).rejects.toThrow(/max battle tier/);
+  });
+
+  it('reads a document of the recorded size', async () => {
+    const { service, state } = await maxBossServiceWith();
+    const body = JSON.stringify(readPokebattlerFeed());
+    state.respond = () => Promise.resolve(feedReply(200, body.padEnd(700_000, ' ')));
+    expect(await service.sync()).toMatchObject({ status: 'updated' });
+  });
+});
diff --git a/src/services/max-boss-service.ts b/src/services/max-boss-service.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4c70a90ded0b6a68dd6b513fe63963e073f95714
--- /dev/null
+++ b/src/services/max-boss-service.ts
@@ -0,0 +1,64 @@
+import type { MaxBossStore } from '../db/repositories/raid-boss-repository.js';
+import {
+  MAX_OPS,
+  maxBossesAt,
+  maxOverrideProblem,
+  parseMaxBossFeed,
+  type MaxBoss,
+} from '../domain/pogo/max-bosses.js';
+import type { MaxTier } from '../domain/pogo/max-tier.js';
+import {
+  BossFeedService,
+  type BossAdmin,
+  type BossFeedFamily,
+  type BossFeedOptions,
+} from './boss-feed-service.js';
+
+/** Pokebattler's raid list is about 700 KB (2026-10-20); a document far past that is not it. */
+const MAX_FEED_CHARS = 5_000_000;
+
+export interface MaxBossOptions extends BossFeedOptions<MaxTier> {
+  /** Address of Pokebattler's raid list (`settings.maxBattles.url`). */
+  url: string;
+  store: MaxBossStore;
+  /** The zone of `settings.timezone`, in which an upcoming boss's day is read. */
+  zone: string;
+}
+
+/** What handlers need of the max bosses (plan 8X-2; `/max` is plan 8X-3). */
+export interface MaxBossProvider {
+  /**
+   * The max bosses in effect now: the feed's list whose start has come, with the moderators'
+   * max overrides applied, from D1 to G, then by name. Empty while max battles are off.
+   */
+  bosses(): MaxBoss[];
+}
+
+/** What staff need of the max boss list beyond what handlers read (`/admin boss`). */
+export type MaxBossAdmin = BossAdmin<MaxTier>;
+
+/** The max bosses while max battles are off (`settings.maxBattles` absent): none. */
+export const NO_MAX_BOSSES: MaxBossProvider = { bosses: () => [] };
+
+/**
+ * Keeps the max boss list (plan 8X-2): Pokebattler's feed read on its own timer
+ * (`settings.maxBattles.refreshMinutes`) and stored in the boss tables beside the raid bosses
+ * (`MaxBossRepository`), with the moderators' max overrides, by the same machinery as the raid
+ * bosses (`BossFeedService`: the stored list at start, the first read when it is older than the
+ * refresh, retries, the warning of a list out of date, overrides one at a time). Its changes are
+ * not announced (`RaidBossAnnouncer` listens to the raid bosses only).
+ */
+export class MaxBossService extends BossFeedService<MaxTier> implements MaxBossProvider {
+  constructor(options: MaxBossOptions) {
+    const family: BossFeedFamily<MaxTier> = {
+      noun: 'max boss',
+      maxFeedChars: MAX_FEED_CHARS,
+      ops: MAX_OPS,
+      parse: (json, catalogue, now) =>
+        parseMaxBossFeed(json, catalogue, { now, zone: options.zone }),
+      effective: maxBossesAt,
+      overrideProblem: maxOverrideProblem,
+    };
+    super(options, family);
+  }
+}
diff --git a/src/services/raid-boss-service.ts b/src/services/raid-boss-service.ts
index 4334eaaeab3cc28ff8561c32441e34f2d3faf9a4..1e6d81c9ce33aa1cf9511ce1ef1635610de2ff7b 100644
--- a/src/services/raid-boss-service.ts
+++ b/src/services/raid-boss-service.ts
@@ -1,104 +1,38 @@
-import type { RaidBossStore, StoredBoss } from '../db/repositories/raid-boss-repository.js';
-import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
+import type { RaidBossStore } from '../db/repositories/raid-boss-repository.js';
 import { feedLookupOf } from '../domain/pogo/feed-lookup.js';
-import { diffBosses, type SeenChange } from '../domain/pogo/boss-diff.js';
-import { parseRaidBossFeed, type FeedBoss } from '../domain/pogo/raid-boss-feed.js';
+import { parseRaidBossFeed } from '../domain/pogo/raid-boss-feed.js';
 import {
   autosetBoss,
-  diffFeed,
   effectiveBosses,
   overrideProblem,
-  replacesOverride,
-  type BossListChange,
-  type BossOverride,
-  type NewBossOverride,
+  RAID_OPS,
   type RaidBoss,
 } from '../domain/pogo/raid-bosses.js';
 import { sameRaidTier, type RaidTier } from '../domain/pogo/raid-tier.js';
-import type { Logger } from '../log.js';
-import { failureReason } from './failure-reason.js';
-import type { GameDataProvider } from './game-data-service.js';
+import {
+  BossFeedService,
+  type BossAdmin,
+  type BossFeedFamily,
+  type BossFeedOptions,
+} from './boss-feed-service.js';
+
+export {
+  SHRINK_FLOOR,
+  type FeedChange,
+  type FeedRemarks,
+  type FetchFeed,
+  type StaleFeed,
+  type SyncFailure,
+  type SyncResult,
+} from './boss-feed-service.js';
 
-/** The longest delay `setTimeout` accepts; anything longer fires immediately. */
-const MAX_TIMER_MS = 2 ** 31 - 1;
 /** The feed is about 30,000 characters; anything near this size is not the feed. */
 const MAX_FEED_CHARS = 2_000_000;
-const MINUTE_MS = 60_000;
-/** Consecutive failed attempts that are followed by a quick retry. */
-const QUICK_RETRIES = 3;
-const NOT_LOADED = 'The raid boss list has not been loaded yet';
-/** A list shorter than this is not judged for shrinking: a few bosses come and go each week. */
-export const SHRINK_FLOOR = 4;
-
-/**
- * What a download of the feed gave: a 304 for the list stored, or the bosses of a valid feed with
- * its validators and the catalogue it was read with.
- */
-type FeedRead =
-  | { notModified: true }
-  | {
-      notModified: false;
-      bosses: FeedBoss[];
-      validators: { etag?: string; lastModified?: string };
-      catalogue: PokemonCatalogue;
-    };
-
-/** Thrown inside a sync that `stop` ended; never leaves the service. */
-class SyncStopped extends Error {}
-
-/**
- * Why a read of the feed failed, for an answer to staff that never shows an address or a database
- * message: `status` (the feed answered with an HTTP status that is no feed, `httpStatus`),
- * `timeout`, `unreachable` (no answer at all), `unreadable` (an answer that is not the feed),
- * `storing` (the database failed), `stopped` (the service was stopped).
- */
-export type SyncFailure =
-  'status' | 'timeout' | 'unreachable' | 'unreadable' | 'storing' | 'stopped';
-
-/** A failure of the read itself, with its kind; anything else thrown in a sync is `storing`. */
-class FeedFailure extends Error {
-  constructor(
-    message: string,
-    readonly kind: Exclude<SyncFailure, 'storing' | 'stopped'>,
-    readonly httpStatus?: number,
-    options?: ErrorOptions,
-  ) {
-    super(message, options);
-  }
-}
-
-/** The part of `fetch` this service needs. */
-export type FetchFeed = (
-  url: string,
-  init: { signal: AbortSignal; headers: Record<string, string> },
-) => Promise<{
-  ok: boolean;
-  status: number;
-  headers: { get(name: string): string | null };
-  text(): Promise<string>;
-}>;
 
-export interface RaidBossOptions {
+export interface RaidBossOptions extends BossFeedOptions<RaidTier> {
   /** Address of the raid boss feed (`raids.min.json` of ScrapedDuck). */
   url: string;
-  /** How often the feed is read. */
-  refreshMs: number;
-  /** How long without a successful read before `onStale` listeners are told, once. */
-  staleAfterMs: number;
   store: RaidBossStore;
-  /** Bosses are matched to the catalogue in use at the moment they are asked for. */
-  gameData: GameDataProvider;
-  fetch: FetchFeed;
-  log: Logger;
-  now?: () => number;
-  /** How long one download may take before it is abandoned. Default 30 seconds. */
-  timeoutMs?: number;
-  /**
-   * How long to wait after a failed attempt before the next, for the first three failures in a
-   * row; from the fourth on the next attempt comes after `refreshMs`, so a feed that stays down is
-   * not tried (and logged) every few minutes for ever. Default: 5 minutes, or `refreshMs` if shorter.
-   */
-  retryMs?: number;
 }
 
 /** What handlers need: the boss list in effect. */
@@ -110,138 +44,28 @@ export interface RaidBossProvider {
   autoset(tier: RaidTier): RaidBoss | undefined;
 }
 
-/** What a read of the feed says beyond its bosses; each part only when there is something to say. */
-export interface FeedRemarks {
-  /**
-   * The headings of the feed that Pine has no raid tier for (as `ParsedFeed.unknownLevels`): their
-   * bosses were left out. The only sign that a tier vanished because the feed renamed it.
-   */
-  unknownLevels?: string[];
-  /**
-   * The list has fewer than half the bosses it had (it had at least `SHRINK_FLOOR`): the feed may
-   * be broken in a way its checks do not see. The list is taken all the same.
-   */
-  shrank?: { before: number; after: number };
-}
-
-/**
- * A change of the feed's list: the feed's own rows that came and went (`BossListChange`), and
- * what members see change, the list in effect before and after with the overrides in force
- * (`seen`): a boss an override hides or adds does not come or go for them.
- */
-export interface FeedChange extends BossListChange {
-  seen: SeenChange;
-}
-
-export type SyncResult =
-  /** The feed lists other bosses than before. */
-  | ({ status: 'updated'; change: FeedChange } & FeedRemarks)
-  /** The feed was read and lists the same bosses. */
-  | ({ status: 'unchanged' } & FeedRemarks)
-  /**
-   * The feed could not be read or was not valid; the list in use is unchanged. `reason` is for the
-   * log (it may hold the address or a database message); `kind` is what may be said.
-   */
-  | { status: 'failed'; kind: SyncFailure; httpStatus?: number; reason: string };
-
-/** What staff need of the boss list beyond what handlers read (`/admin boss`). */
-export interface RaidBossAdmin {
-  /** The bosses the feed listed at the last successful read, as stored. */
-  feedBosses(): StoredBoss[];
-  /** The overrides in force, oldest first. */
-  overrides(): BossOverride[];
-  addOverride(override: NewBossOverride): Promise<BossOverride>;
-  removeOverride(id: number): Promise<boolean>;
-  sync(): Promise<SyncResult>;
-  /** When the feed was last read successfully (epoch ms); undefined if it never was. */
-  readonly lastSyncedAt: number | undefined;
-  /** The headings Pine does not know, of the last feed that was read whole; empty before that. */
-  readonly unknownLevels: readonly string[];
-}
+/** What staff need of the raid boss list beyond what handlers read (`/admin boss`). */
+export type RaidBossAdmin = BossAdmin<RaidTier>;
 
-export interface StaleFeed {
-  /** When the feed was last read successfully (epoch ms); undefined if it never was. */
-  lastSyncedAt: number | undefined;
-  /** Why the latest attempt failed. */
-  reason: string;
-}
-
-type Listener<T> = (event: T) => void | Promise<void>;
+/** The raid bosses: ScrapedDuck's feed, read with the catalogue's names and pictures. */
+const RAID_FEED: BossFeedFamily<RaidTier> = {
+  noun: 'raid boss',
+  maxFeedChars: MAX_FEED_CHARS,
+  ops: RAID_OPS,
+  parse: (json, catalogue) => parseRaidBossFeed(json, feedLookupOf(catalogue)),
+  effective: effectiveBosses,
+  overrideProblem,
+};
 
 /**
  * Keeps the raid boss list: reads the feed on a timer, stores it, and applies the moderators'
- * overrides. Nothing happens until `load` is called, and `load` never uses the network: the bot
- * starts with the list of the last run and the feed is read in the background.
+ * overrides (`BossFeedService`). Nothing happens until `load` is called, and `load` never uses
+ * the network: the bot starts with the list of the last run and the feed is read in the
+ * background.
  */
-export class RaidBossService implements RaidBossProvider, RaidBossAdmin {
-  private feed: StoredBoss[] = [];
-  private overrideList: BossOverride[] = [];
-  private loaded = false;
-  private syncedAt: number | undefined;
-  private attemptedAt: number | undefined;
-  private readonly now: () => number;
-  private readonly timeoutMs: number;
-  private readonly retryMs: number;
-  private failures = 0;
-  private overrideReads = 0;
-  private overrideReadApplied = 0;
-  private controller: AbortController | undefined;
-  // In memory only, on purpose: after a restart the first read is unconditional, which also fills
-  // the columns a later migration added (a 304 would leave them empty).
-  private validators: { etag?: string; lastModified?: string } = {};
-  // The catalogue the feed behind `validators` was parsed with: a 304 would keep the ids worked out
-  // with it, so after a game data refresh the next request is unconditional.
-  private validatorsCatalogue: PokemonCatalogue | undefined;
-  private inFlight: Promise<SyncResult> | undefined;
-  /** The tail of `exclusive`'s queue; never rejects. */
-  private queue: Promise<void> = Promise.resolve();
-  private timer: NodeJS.Timeout | undefined;
-  private stopped = false;
-  private staleReported = false;
-  private reportedSkipped = 0;
-  private lastUnknownLevels: readonly string[] = [];
-  private readonly reportedLevels = new Set<string>();
-  private readonly changeListeners = new Set<Listener<FeedChange>>();
-  private readonly staleListeners = new Set<Listener<StaleFeed>>();
-
-  constructor(private readonly options: RaidBossOptions) {
-    this.now = options.now ?? (() => Date.now());
-    this.timeoutMs = options.timeoutMs ?? 30_000;
-    this.retryMs = options.retryMs ?? Math.min(options.refreshMs, 5 * MINUTE_MS);
-  }
-
-  /** Reads the stored list and overrides. Does not download anything. */
-  async load(): Promise<void> {
-    const { store } = this.options;
-    [this.feed, , this.syncedAt] = await Promise.all([
-      store.listActive(),
-      this.reloadOverrides(),
-      store.lastSyncedAt(),
-    ]);
-    this.loaded = true;
-  }
-
-  /**
-   * Re-reads the overrides. Each read is numbered when it starts and its result is applied only
-   * if no later read has been applied, so a slow older read cannot put back an older list.
-   */
-  private async reloadOverrides(): Promise<void> {
-    const read = ++this.overrideReads;
-    const list = await this.options.store.listOverrides();
-    if (read > this.overrideReadApplied) {
-      this.overrideReadApplied = read;
-      this.overrideList = list;
-    }
-  }
-
-  bosses(): RaidBoss[] {
-    if (!this.loaded) throw new Error(NOT_LOADED);
-    return effectiveBosses(
-      this.feed,
-      this.overrideList,
-      this.options.gameData.catalogue,
-      this.now(),
-    );
+export class RaidBossService extends BossFeedService<RaidTier> implements RaidBossProvider {
+  constructor(options: RaidBossOptions) {
+    super(options, RAID_FEED);
   }
 
   bossesOf(tier: RaidTier): RaidBoss[] {
@@ -251,441 +75,4 @@ export class RaidBossService implements RaidBossProvider, RaidBossAdmin {
   autoset(tier: RaidTier): RaidBoss | undefined {
     return autosetBoss(this.bosses(), tier);
   }
-
-  /** When the feed was last read successfully (epoch ms); undefined if it never was. */
-  get lastSyncedAt(): number | undefined {
-    return this.syncedAt;
-  }
-
-  /** The headings Pine does not know, of the last feed that was read whole; empty before that. */
-  get unknownLevels(): readonly string[] {
-    return this.lastUnknownLevels;
-  }
-
-  /** The bosses the feed listed at the last successful read, as stored. */
-  feedBosses(): StoredBoss[] {
-    if (!this.loaded) throw new Error(NOT_LOADED);
-    return this.feed.map((boss) => ({ ...boss, tier: { ...boss.tier } }));
-  }
-
-  /** The overrides in force, oldest first. */
-  overrides(): BossOverride[] {
-    const now = this.now();
-    return this.overrideList.filter((o) => o.expiresAt === null || o.expiresAt > now);
-  }
-
-  /**
-   * Stores an override; it applies at once. One with the same action for the same Pokémon and
-   * tier replaces the earlier one, and an `autoset` replaces every earlier `autoset` of its tier
-   * (`replacesOverride`). Throws a RangeError for an override that makes no sense.
-   */
-  async addOverride(override: NewBossOverride): Promise<BossOverride> {
-    const now = this.now();
-    const problem = overrideProblem(override, now);
-    if (problem) throw new RangeError(problem);
-    return this.exclusive(async () => {
-      const saved = await this.options.store.saveOverride(override, now);
-      await this.reloadAfterWrite(() => {
-        // The store replaced the overrides that this one replaces.
-        this.overrideList = [
-          ...this.overrideList.filter((o) => !replacesOverride(saved, o)),
-          saved,
-        ];
-      });
-      return saved;
-    });
-  }
-
-  /** Whether there was such an override. */
-  removeOverride(id: number): Promise<boolean> {
-    return this.exclusive(async () => {
-      const removed = await this.options.store.removeOverride(id);
-      await this.reloadAfterWrite(() => {
-        this.overrideList = this.overrideList.filter((o) => o.id !== id);
-      });
-      return removed;
-    });
-  }
-
-  /**
-   * Runs `work` after everything `exclusive` was given before it has finished, failed or not:
-   * the writes of overrides and the part of a sync from storing the feed to working out what
-   * members see change. A write in the middle of that part would count as in force before the
-   * sync as well as after it, and members would not be told of a boss it made them see.
-   */
-  private exclusive<T>(work: () => Promise<T>): Promise<T> {
-    const result = this.queue.then(work);
-    this.queue = result.then(
-      () => undefined,
-      () => undefined,
-    );
-    return result;
-  }
-
-  /**
-   * Re-reads the overrides after a write that succeeded. If only the re-read fails, the write
-   * still stands (and applies at the next sync), so the caller is not told it failed: the warning
-   * is logged and `patch` brings the list in memory up to date.
-   */
-  private async reloadAfterWrite(patch: () => void): Promise<void> {
-    try {
-      await this.reloadOverrides();
-    } catch (err) {
-      this.safely(() =>
-        this.options.log.warn({ err }, 'could not re-read the raid boss overrides'),
-      );
-      // The patch is newer than any read still in flight: none of those may overwrite it.
-      this.overrideReadApplied = this.overrideReads;
-      patch();
-    }
-  }
-
-  /**
-   * Called after a sync in which the feed's bosses changed. Not called for the first sync of a
-   * new database, where there is nothing to compare with. Returns a function that unsubscribes.
-   */
-  onChange(listener: Listener<FeedChange>): () => void {
-    this.changeListeners.add(listener);
-    return () => this.changeListeners.delete(listener);
-  }
-
-  /**
-   * Called once when the feed has not been read successfully for `staleAfterMs`, and again only
-   * after it has worked in between. Returns a function that unsubscribes.
-   */
-  onStale(listener: Listener<StaleFeed>): () => void {
-    this.staleListeners.add(listener);
-    return () => this.staleListeners.delete(listener);
-  }
-
-  /**
-   * Reads the feed and, if it is valid, stores it as the list. Never rejects: a feed that cannot
-   * be read or is not valid leaves the list as it is. Calls made while one is running share its
-   * result. The one way it throws is when `load` has not been called.
-   */
-  sync(): Promise<SyncResult> {
-    if (!this.loaded) throw new Error(NOT_LOADED);
-    // A stopped service (shutdown) asks the feed nothing more.
-    if (this.stopped && !this.inFlight) {
-      return Promise.resolve({ status: 'failed', kind: 'stopped', reason: 'stopped' });
-    }
-    this.inFlight ??= this.syncOnce().finally(() => {
-      this.inFlight = undefined;
-    });
-    return this.inFlight;
-  }
-
-  /** Resolves once no sync is in flight (at once when none is). Never rejects. */
-  async whenIdle(): Promise<void> {
-    while (this.inFlight) await this.inFlight;
-  }
-
-  /**
-   * Reads the feed `refreshMs` after the last attempt (at once when the stored list is older
-   * than that or there is none), and again after every attempt. Calling it again while a sync is
-   * scheduled changes nothing. After a failed attempt the next one is `retryMs` later (see
-   * the option for how long that lasts). Throws
-   * when `load` has not been called.
-   */
-  startAutoSync(): void {
-    if (!this.loaded) throw new Error(NOT_LOADED);
-    this.stopped = false;
-    if (this.timer) return;
-    this.schedule();
-  }
-
-  /**
-   * Cancels the scheduled sync and ends a download in flight (that sync reports `stopped`).
-   * Writes to the database are not interrupted.
-   */
-  stop(): void {
-    this.stopped = true;
-    this.controller?.abort();
-    if (this.timer) clearTimeout(this.timer);
-    this.timer = undefined;
-  }
-
-  private schedule(): void {
-    if (this.timer) clearTimeout(this.timer);
-    const quick = this.failures > 0 && this.failures <= QUICK_RETRIES;
-    const interval = quick ? this.retryMs : this.options.refreshMs;
-    const last = this.attemptedAt ?? this.syncedAt;
-    const due = last === undefined ? 0 : last + interval - this.now();
-    this.timer = setTimeout(
-      () => {
-        this.timer = undefined;
-        void this.sync().finally(() => {
-          if (!this.stopped) this.schedule();
-        });
-      },
-      // Never longer than the interval: a stored time in the future must not postpone syncing.
-      Math.min(Math.max(due, 0), interval, MAX_TIMER_MS),
-    );
-    this.timer.unref();
-  }
-
-  private async syncOnce(): Promise<SyncResult> {
-    const now = this.now();
-    const attemptedBefore = this.attemptedAt;
-    this.attemptedAt = now;
-    const before = this.feed.length;
-    const feedBefore = this.feed;
-    let change: BossListChange;
-    let seen: SeenChange | undefined;
-    try {
-      const read = await this.readFeed();
-      // No override is written from storing the feed until what members see is worked out.
-      ({ change, seen } = await this.exclusive<{ change: BossListChange; seen?: SeenChange }>(
-        async () => {
-          const stored = await this.storeFeed(read, now);
-          if (stored.added.length === 0 && stored.removed.length === 0) return { change: stored };
-          // What members see: the lists in effect before and after, with the same overrides.
-          const { catalogue } = this.options.gameData;
-          return {
-            change: stored,
-            seen: diffBosses(
-              effectiveBosses(feedBefore, this.overrideList, catalogue, now),
-              effectiveBosses(this.feed, this.overrideList, catalogue, now),
-            ),
-          };
-        },
-      ));
-    } catch (err) {
-      if (err instanceof SyncStopped) {
-        // Nothing was read, so a later `startAutoSync` must not wait for this attempt.
-        this.attemptedAt = attemptedBefore;
-        return { status: 'failed', kind: 'stopped', reason: 'stopped' };
-      }
-      this.failures++;
-      const reason = err instanceof Error ? err.message : String(err);
-      this.safely(() => this.options.log.error({ err }, 'could not sync the raid bosses'));
-      this.reportIfStale(now, reason);
-      if (err instanceof FeedFailure) {
-        return {
-          status: 'failed',
-          kind: err.kind,
-          ...(err.httpStatus === undefined ? {} : { httpStatus: err.httpStatus }),
-          reason,
-        };
-      }
-      return { status: 'failed', kind: 'storing', reason };
-    }
-    const first = this.syncedAt === undefined;
-    this.failures = 0;
-    this.syncedAt = now;
-    this.staleReported = false;
-    const remarks = this.remarks(before, this.feed.length);
-    if (!seen) return { status: 'unchanged', ...remarks };
-    this.safely(() =>
-      this.options.log.info(
-        {
-          added: change.added.map((boss) => boss.name),
-          removed: change.removed.map((boss) => boss.name),
-        },
-        'raid bosses updated',
-      ),
-    );
-    const feedChange: FeedChange = { ...change, seen };
-    if (!first) this.emit(this.changeListeners, feedChange);
-    return { status: 'updated', change: feedChange, ...remarks };
-  }
-
-  /** What to say of a read beyond its bosses; a list that shrank by more than half is logged. */
-  private remarks(before: number, after: number): FeedRemarks {
-    const remarks: FeedRemarks = {};
-    if (this.lastUnknownLevels.length > 0) remarks.unknownLevels = [...this.lastUnknownLevels];
-    if (before >= SHRINK_FLOOR && after * 2 < before) {
-      remarks.shrank = { before, after };
-      this.safely(() =>
-        this.options.log.warn(
-          { before, after },
-          'the raid boss feed lists fewer than half the bosses it did',
-        ),
-      );
-    }
-    return remarks;
-  }
-
-  /** Downloads and checks the feed; stores nothing. Throws when anything fails. */
-  private async readFeed(): Promise<FeedRead> {
-    const { url } = this.options;
-    const timeout = AbortSignal.timeout(this.timeoutMs);
-    const controller = new AbortController();
-    this.controller = controller;
-    const signal = AbortSignal.any([timeout, controller.signal]);
-    const headers: Record<string, string> = { Accept: 'application/json' };
-    const catalogue = this.options.gameData.catalogue;
-    if (this.validatorsCatalogue === catalogue) {
-      if (this.validators.etag) headers['If-None-Match'] = this.validators.etag;
-      if (this.validators.lastModified) headers['If-Modified-Since'] = this.validators.lastModified;
-    }
-
-    const conditional = 'If-None-Match' in headers || 'If-Modified-Since' in headers;
-    let status: number;
-    let body = '';
-    let validators: RaidBossService['validators'] = {};
-    try {
-      const response = await this.options.fetch(url, { signal, headers });
-      status = response.status;
-      if (response.ok) {
-        body = await response.text();
-        validators = {
-          etag: response.headers.get('etag') ?? undefined,
-          lastModified: response.headers.get('last-modified') ?? undefined,
-        };
-      }
-    } catch (err) {
-      if (controller.signal.aborted) throw new SyncStopped();
-      if (timeout.aborted) {
-        throw new FeedFailure(
-          `${url}: timed out after ${this.timeoutMs} ms`,
-          'timeout',
-          undefined,
-          {
-            cause: err,
-          },
-        );
-      }
-      throw new FeedFailure(`${url}: ${failureReason(err)}`, 'unreachable', undefined, {
-        cause: err,
-      });
-    } finally {
-      if (this.controller === controller) this.controller = undefined;
-    }
-
-    if (status === 304) {
-      if (!conditional) {
-        throw new FeedFailure(`${url} answered 304 to a request without validators`, 'status', 304);
-      }
-      return { notModified: true };
-    }
-    if (status < 200 || status > 299) {
-      throw new FeedFailure(`${url} answered ${status}`, 'status', status);
-    }
-    if (body.length > MAX_FEED_CHARS) {
-      throw new FeedFailure(
-        `${url} sent ${body.length} characters, which is not the raid boss feed`,
-        'unreadable',
-      );
-    }
-    let json: unknown;
-    try {
-      json = JSON.parse(body);
-    } catch {
-      throw new FeedFailure(`${url} did not send JSON`, 'unreadable');
-    }
-    let parsed: ReturnType<typeof parseRaidBossFeed>;
-    try {
-      parsed = parseRaidBossFeed(json, feedLookupOf(catalogue));
-    } catch (err) {
-      throw new FeedFailure(
-        err instanceof Error ? err.message : String(err),
-        'unreadable',
-        undefined,
-        {
-          cause: err,
-        },
-      );
-    }
-    const { bosses, unknownLevels, skipped } = parsed;
-    this.lastUnknownLevels = unknownLevels;
-    for (const level of unknownLevels) {
-      if (this.reportedLevels.has(level)) continue;
-      this.reportedLevels.add(level);
-      this.safely(() =>
-        this.options.log.warn({ level }, 'the raid boss feed has a level Pine does not know'),
-      );
-    }
-    // Reported when the number changes, whether or not the list does; a feed read whole resets it.
-    if (skipped !== this.reportedSkipped) {
-      this.reportedSkipped = skipped;
-      if (skipped > 0) {
-        this.safely(() =>
-          this.options.log.warn({ skipped }, 'raid boss feed entries were left out'),
-        );
-      }
-    }
-    return { notModified: false, bosses, validators, catalogue };
-  }
-
-  /** Stores what `readFeed` read; returns what changed. Throws when anything fails. */
-  private async storeFeed(read: FeedRead, now: number): Promise<BossListChange> {
-    const { store } = this.options;
-    if (read.notModified) {
-      await store.touchActive(now);
-      this.feed = await store.listActive();
-      await this.housekeeping(now);
-      return { added: [], removed: [] };
-    }
-    const change = diffFeed(this.feed, read.bosses);
-    // Forgotten before the list is replaced: if anything after that fails, the next request is
-    // unconditional and repairs the list, instead of a 304 vouching for one the feed does not have.
-    this.validators = {};
-    await store.replaceFeed(read.bosses, now);
-    this.feed = await store.listActive();
-    await this.housekeeping(now);
-    // Remembered only for a feed that was accepted: a 304 must never vouch for a rejected one.
-    this.validators = read.validators;
-    this.validatorsCatalogue = read.catalogue;
-    return change;
-  }
-
-  /** Deletes expired overrides and re-reads the rest; a failure is logged, never fails the sync. */
-  private async housekeeping(now: number): Promise<void> {
-    try {
-      await this.options.store.removeExpiredOverrides(now);
-      await this.reloadOverrides();
-    } catch (err) {
-      this.safely(() => this.options.log.warn({ err }, 'could not tidy the raid boss overrides'));
-    }
-  }
-
-  /**
-   * Tells the listeners once that the list is out of date: `staleAfterMs` after the last
-   * successful read, which is stored and so survives a restart; when the feed has never been
-   * read (a new database), at the second failure in a row, so that one failed first attempt
-   * does not count as staleness.
-   */
-  private reportIfStale(now: number, reason: string): void {
-    if (this.staleReported) return;
-    if (
-      this.syncedAt === undefined
-        ? this.failures < 2
-        : now - this.syncedAt < this.options.staleAfterMs
-    ) {
-      return;
-    }
-    this.staleReported = true;
-    this.safely(() =>
-      this.options.log.warn(
-        {
-          lastSyncedAt: this.syncedAt === undefined ? null : new Date(this.syncedAt).toISOString(),
-        },
-        'the raid boss list is out of date',
-      ),
-    );
-    this.emit(this.staleListeners, { lastSyncedAt: this.syncedAt, reason });
-  }
-
-  /** A listener that throws or rejects must not stop the others or the sync; none is waited for. */
-  private emit<T>(listeners: ReadonlySet<Listener<T>>, event: T): void {
-    const failed = (err: unknown): void =>
-      this.safely(() => this.options.log.error({ err }, 'a raid boss listener failed'));
-    for (const listener of listeners) {
-      try {
-        void Promise.resolve(listener(event)).catch(failed);
-      } catch (err) {
-        failed(err);
-      }
-    }
-  }
-
-  /** A broken logger must not turn a finished sync into a rejected one. */
-  private safely(action: () => void): void {
-    try {
-      action();
-    } catch {
-      // Nothing useful can be done about a logger that throws.
-    }
-  }
 }
diff --git a/test/fixtures/game-data.json b/test/fixtures/game-data.json
index 1aafe41d24373fc6fdfcaece28beb583995fc477..9c3b156db98f4831b9610240d6231ca7f488d2f0 100644
--- a/test/fixtures/game-data.json
+++ b/test/fixtures/game-data.json
@@ -1765,5 +1765,6 @@
 ],
 "typeChart":{"bug":{"normal":1,"fighting":0.625,"flying":0.625,"poison":0.625,"ground":1,"rock":1,"bug":1,"ghost":0.625,"steel":0.625,"fire":0.625,"water":1,"grass":1.6,"electric":1,"psychic":1.6,"ice":1,"dragon":1,"dark":1.6,"fairy":0.625},"dark":{"normal":1,"fighting":0.625,"flying":1,"poison":1,"ground":1,"rock":1,"bug":1,"ghost":1.6,"steel":1,"fire":1,"water":1,"grass":1,"electric":1,"psychic":1.6,"ice":1,"dragon":1,"dark":0.625,"fairy":0.625},"dragon":{"normal":1,"fighting":1,"flying":1,"poison":1,"ground":1,"rock":1,"bug":1,"ghost":1,"steel":0.625,"fire":1,"water":1,"grass":1,"electric":1,"psychic":1,"ice":1,"dragon":1.6,"dark":1,"fairy":0.390625},"electric":{"normal":1,"fighting":1,"flying":1.6,"poison":1,"ground":0.390625,"rock":1,"bug":1,"ghost":1,"steel":1,"fire":1,"water":1.6,"grass":0.625,"electric":0.625,"psychic":1,"ice":1,"dragon":0.625,"dark":1,"fairy":1},"fairy":{"normal":1,"fighting":1.6,"flying":1,"poison":0.625,"ground":1,"rock":1,"bug":1,"ghost":1,"steel":0.625,"fire":0.625,"water":1,"grass":1,"electric":1,"psychic":1,"ice":1,"dragon":1.6,"dark":1.6,"fairy":1},"fighting":{"normal":1.6,"fighting":1,"flying":0.625,"poison":0.625,"ground":1,"rock":1.6,"bug":0.625,"ghost":0.390625,"steel":1.6,"fire":1,"water":1,"grass":1,"electric":1,"psychic":0.625,"ice":1.6,"dragon":1,"dark":1.6,"fairy":0.625},"fire":{"normal":1,"fighting":1,"flying":1,"poison":1,"ground":1,"rock":0.625,"bug":1.6,"ghost":1,"steel":1.6,"fire":0.625,"water":0.625,"grass":1.6,"electric":1,"psychic":1,"ice":1.6,"dragon":0.625,"dark":1,"fairy":1},"flying":{"normal":1,"fighting":1.6,"flying":1,"poison":1,"ground":1,"rock":0.625,"bug":1.6,"ghost":1,"steel":0.625,"fire":1,"water":1,"grass":1.6,"electric":0.625,"psychic":1,"ice":1,"dragon":1,"dark":1,"fairy":1},"ghost":{"normal":0.390625,"fighting":1,"flying":1,"poison":1,"ground":1,"rock":1,"bug":1,"ghost":1.6,"steel":1,"fire":1,"water":1,"grass":1,"electric":1,"psychic":1.6,"ice":1,"dragon":1,"dark":0.625,"fairy":1},"grass":{"normal":1,"fighting":1,"flying":0.625,"poison":0.625,"ground":1.6,"rock":1.6,"bug":0.625,"ghost":1,"steel":0.625,"fire":0.625,"water":1.6,"grass":0.625,"electric":1,"psychic":1,"ice":1,"dragon":0.625,"dark":1,"fairy":1},"ground":{"normal":1,"fighting":1,"flying":0.390625,"poison":1.6,"ground":1,"rock":1.6,"bug":0.625,"ghost":1,"steel":1.6,"fire":1.6,"water":1,"grass":0.625,"electric":1.6,"psychic":1,"ice":1,"dragon":1,"dark":1,"fairy":1},"ice":{"normal":1,"fighting":1,"flying":1.6,"poison":1,"ground":1.6,"rock":1,"bug":1,"ghost":1,"steel":0.625,"fire":0.625,"water":0.625,"grass":1.6,"electric":1,"psychic":1,"ice":0.625,"dragon":1.6,"dark":1,"fairy":1},"normal":{"normal":1,"fighting":1,"flying":1,"poison":1,"ground":1,"rock":0.625,"bug":1,"ghost":0.390625,"steel":0.625,"fire":1,"water":1,"grass":1,"electric":1,"psychic":1,"ice":1,"dragon":1,"dark":1,"fairy":1},"poison":{"normal":1,"fighting":1,"flying":1,"poison":0.625,"ground":0.625,"rock":0.625,"bug":1,"ghost":0.625,"steel":0.390625,"fire":1,"water":1,"grass":1.6,"electric":1,"psychic":1,"ice":1,"dragon":1,"dark":1,"fairy":1.6},"psychic":{"normal":1,"fighting":1.6,"flying":1,"poison":1.6,"ground":1,"rock":1,"bug":1,"ghost":1,"steel":0.625,"fire":1,"water":1,"grass":1,"electric":1,"psychic":0.625,"ice":1,"dragon":1,"dark":0.390625,"fairy":1},"rock":{"normal":1,"fighting":0.625,"flying":1.6,"poison":1,"ground":0.625,"rock":1,"bug":1.6,"ghost":1,"steel":0.625,"fire":1.6,"water":1,"grass":1,"electric":1,"psychic":1,"ice":1.6,"dragon":1,"dark":1,"fairy":1},"steel":{"normal":1,"fighting":1,"flying":1,"poison":1,"ground":1,"rock":1.6,"bug":1,"ghost":1,"steel":0.625,"fire":0.625,"water":0.625,"grass":1,"electric":0.625,"psychic":1,"ice":1.6,"dragon":1,"dark":1,"fairy":1.6},"water":{"normal":1,"fighting":1,"flying":1,"poison":1,"ground":1.6,"rock":1.6,"bug":1,"ghost":1,"steel":1,"fire":1.6,"water":0.625,"grass":0.625,"electric":1,"psychic":1,"ice":1,"dragon":0.625,"dark":1,"fairy":1}},
 "weatherBoosts":{"clear":["grass","ground","fire"],"rainy":["water","electric","bug"],"partly_cloudy":["normal","rock"],"overcast":["fairy","fighting","poison"],"windy":["dragon","flying","psychic"],"snow":["ice","steel"],"fog":["dark","ghost"]},
-"cpMultipliers":[0.094,0.16639787,0.21573247,0.25572005,0.29024988,0.3210876,0.34921268,0.3752356,0.39956728,0.4225,0.44310755,0.4627984,0.48168495,0.49985844,0.51739395,0.5343543,0.5507927,0.5667545,0.5822789,0.5974,0.6121573,0.6265671,0.64065295,0.65443563,0.667934,0.6811649,0.69414365,0.7068842,0.7193991,0.7317,0.7377695,0.74378943,0.74976104,0.7556855,0.76156384,0.76739717,0.7731865,0.77893275,0.784637,0.7903,0.7953,0.8003,0.8053,0.8103,0.8153,0.8203,0.8253,0.8303,0.8353,0.8403,0.8453,0.8503,0.8553,0.8603,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653]
+"cpMultipliers":[0.094,0.16639787,0.21573247,0.25572005,0.29024988,0.3210876,0.34921268,0.3752356,0.39956728,0.4225,0.44310755,0.4627984,0.48168495,0.49985844,0.51739395,0.5343543,0.5507927,0.5667545,0.5822789,0.5974,0.6121573,0.6265671,0.64065295,0.65443563,0.667934,0.6811649,0.69414365,0.7068842,0.7193991,0.7317,0.7377695,0.74378943,0.74976104,0.7556855,0.76156384,0.76739717,0.7731865,0.77893275,0.784637,0.7903,0.7953,0.8003,0.8053,0.8103,0.8153,0.8203,0.8253,0.8303,0.8353,0.8403,0.8453,0.8503,0.8553,0.8603,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653,0.8653],
+"maxBattles":{"dynamax":["abra","alakazam","arcanine","articuno","beldum","blastoise","blissey","boldore","bounsweet","bulbasaur","butterfree","caterpie","centiskorch","chansey","charizard","charmander","charmeleon","cinderace","combee","corviknight","corvisquire","cottonee","cryogonal","darmanitan_standard","darumaka","deino","drampa","drilbur","drizzile","dubwool","duraludon","eevee","electabuzz","electivire","elekid","entei","espeon","espurr","excadrill","falinks","feebas","flareon","flygon","gallade","garbodor","gardevoir","gastly","gengar","gigalith","glaceon","greedent","grimmsnarl","grookey","growlithe","gyarados","hatenna","hatterene","hattrem","haunter","hitmonchan","hitmonlee","hitmontop","ho_oh","hoothoot","hydreigon","inkay","inteleon","ivysaur","jolteon","kabuto","kabutops","kadabra","kingler","kirlia","krabby","kubfu","lapras","latias","latios","leafeon","lugia","machamp","machoke","machop","magby","magikarp","magmar","magmortar","malamar","meowstic","meowstic_female","meowth","meowth_alola","meowth_galarian","metagross","metang","metapod","milotic","moltres","noctowl","omanyte","omastar","passimian","pidove","pikachu","raboot","raichu","raikou","ralts","regice","regirock","registeel","rhydon","rhyhorn","rhyperior","rillaboom","roggenrola","rookidee","sableye","scorbunny","sealeo","shuckle","sizzlipede","skwovet","sneasel","snorlax","sobble","spheal","squirtle","starmie","steenee","suicune","swoobat","sylveon","thwackey","toxel","toxtricity","toxtricity_amped","toxtricity_low_key","tranquill","trapinch","trubbish","tsareena","tyrogue","umbreon","unfezant","urshifu","urshifu_rapid_strike","urshifu_single_strike","vaporeon","venusaur","vespiquen","vibrava","wailmer","wailord","walrein","wartortle","weavile","whimsicott","woobat","wooloo","zapdos","zweilous"],"gigantamax":["blastoise","butterfree","charizard","cinderace","garbodor","gengar","grimmsnarl","inteleon","kingler","lapras","machamp","meowth","pikachu","rillaboom","snorlax","toxtricity","toxtricity_amped","toxtricity_low_key","urshifu_rapid_strike","urshifu_single_strike","venusaur"]}
 }
diff --git a/test/fixtures/game-master-sample.json b/test/fixtures/game-master-sample.json
index a5f3c4c95603580d6de980530b8fdc0e7fa705ef..40f5c480f12982302de36f3eae5406c39c1a3bd0 100644
--- a/test/fixtures/game-master-sample.json
+++ b/test/fixtures/game-master-sample.json
@@ -1,4 +1,5106 @@
 [
+ {
+  "templateId": "EXTENDED_V0003_POKEMON_VENUSAUR",
+  "data": {
+   "templateId": "EXTENDED_V0003_POKEMON_VENUSAUR",
+   "pokemonExtendedSettings": {
+    "uniqueId": "VENUSAUR",
+    "tempEvoOverrides": [
+     {
+      "tempEvoId": "TEMP_EVOLUTION_MEGA",
+      "sizeSettings": {
+       "xxsLowerBound": 1.176,
+       "xsLowerBound": 1.2,
+       "mLowerBound": 1.8,
+       "mUpperBound": 3,
+       "xlUpperBound": 3.6,
+       "xxlUpperBound": 3.72
+      }
+     }
+    ],
+    "sizeSettings": {
+     "xxsLowerBound": 0.98,
+     "xsLowerBound": 1,
+     "mLowerBound": 1.5,
+     "mUpperBound": 2.5,
+     "xlUpperBound": 3,
+     "xxlUpperBound": 3.5
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 9.52,
+       "cameraDistance": 30.72,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 19.04
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": 5,
+       "yOffset": 5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.3
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 24,
+      "camera": {
+       "cylinderRadiusM": 1.25,
+       "cylinderHeightM": 1.9
+      },
+      "modelScaleV2": 1,
+      "modelHeight": 1.54,
+      "maxEncounterVisualSettings": {
+       "scale": 10.74,
+       "cameraDistance": 32.3,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 21.47,
+       "yOffset": -7
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": 5,
+       "yOffset": 5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.46
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0003_POKEMON_VENUSAUR_NORMAL",
+  "data": {
+   "templateId": "EXTENDED_V0003_POKEMON_VENUSAUR_NORMAL",
+   "pokemonExtendedSettings": {
+    "uniqueId": "VENUSAUR",
+    "form": "VENUSAUR_NORMAL",
+    "tempEvoOverrides": [
+     {
+      "tempEvoId": "TEMP_EVOLUTION_MEGA",
+      "sizeSettings": {
+       "xxsLowerBound": 1.176,
+       "xsLowerBound": 1.2,
+       "mLowerBound": 1.8,
+       "mUpperBound": 3,
+       "xlUpperBound": 3.6,
+       "xxlUpperBound": 3.72
+      }
+     }
+    ],
+    "sizeSettings": {
+     "xxsLowerBound": 0.98,
+     "xsLowerBound": 1,
+     "mLowerBound": 1.5,
+     "mUpperBound": 2.5,
+     "xlUpperBound": 3,
+     "xxlUpperBound": 3.5
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 9.52,
+       "cameraDistance": 30.72,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 19.04
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": 5,
+       "yOffset": 5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.3
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 24,
+      "camera": {
+       "cylinderRadiusM": 1.25,
+       "cylinderHeightM": 1.9
+      },
+      "modelScaleV2": 1,
+      "modelHeight": 1.54,
+      "maxEncounterVisualSettings": {
+       "scale": 10.74,
+       "cameraDistance": 32.3,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 21.47,
+       "yOffset": -7
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": 5,
+       "yOffset": 5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.46
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0006_POKEMON_CHARIZARD",
+  "data": {
+   "templateId": "EXTENDED_V0006_POKEMON_CHARIZARD",
+   "pokemonExtendedSettings": {
+    "uniqueId": "CHARIZARD",
+    "tempEvoOverrides": [
+     {
+      "tempEvoId": "TEMP_EVOLUTION_MEGA_X",
+      "sizeSettings": {
+       "xxsLowerBound": 0.833,
+       "xsLowerBound": 0.85,
+       "mLowerBound": 1.275,
+       "mUpperBound": 2.125,
+       "xlUpperBound": 2.55,
+       "xxlUpperBound": 2.635
+      }
+     },
+     {
+      "tempEvoId": "TEMP_EVOLUTION_MEGA_Y",
+      "sizeSettings": {
+       "xxsLowerBound": 0.833,
+       "xsLowerBound": 0.85,
+       "mLowerBound": 1.275,
+       "mUpperBound": 2.125,
+       "xlUpperBound": 2.55,
+       "xxlUpperBound": 2.635
+      }
+     }
+    ],
+    "sizeSettings": {
+     "xxsLowerBound": 0.833,
+     "xsLowerBound": 0.85,
+     "mLowerBound": 1.275,
+     "mUpperBound": 2.125,
+     "xlUpperBound": 2.55,
+     "xxlUpperBound": 2.975
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 11.14,
+       "cameraDistance": 31.65,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 22.28
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.52
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 28,
+      "camera": {
+       "cylinderRadiusM": 1.5,
+       "cylinderHeightM": 2.2
+      },
+      "modelScaleV2": 1.31,
+      "modelHeight": 2.2,
+      "maxEncounterVisualSettings": {
+       "scale": 12.53,
+       "cameraDistance": 29.9,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 25.06
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": 1.5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.7
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0006_POKEMON_CHARIZARD_NORMAL",
+  "data": {
+   "templateId": "EXTENDED_V0006_POKEMON_CHARIZARD_NORMAL",
+   "pokemonExtendedSettings": {
+    "uniqueId": "CHARIZARD",
+    "form": "CHARIZARD_NORMAL",
+    "tempEvoOverrides": [
+     {
+      "tempEvoId": "TEMP_EVOLUTION_MEGA_X",
+      "sizeSettings": {
+       "xxsLowerBound": 0.833,
+       "xsLowerBound": 0.85,
+       "mLowerBound": 1.275,
+       "mUpperBound": 2.125,
+       "xlUpperBound": 2.55,
+       "xxlUpperBound": 2.635
+      }
+     },
+     {
+      "tempEvoId": "TEMP_EVOLUTION_MEGA_Y",
+      "sizeSettings": {
+       "xxsLowerBound": 0.833,
+       "xsLowerBound": 0.85,
+       "mLowerBound": 1.275,
+       "mUpperBound": 2.125,
+       "xlUpperBound": 2.55,
+       "xxlUpperBound": 2.635
+      }
+     }
+    ],
+    "sizeSettings": {
+     "xxsLowerBound": 0.833,
+     "xsLowerBound": 0.85,
+     "mLowerBound": 1.275,
+     "mUpperBound": 2.125,
+     "xlUpperBound": 2.55,
+     "xxlUpperBound": 2.975
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 11.14,
+       "cameraDistance": 31.65,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 22.28
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.52
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 28,
+      "camera": {
+       "cylinderRadiusM": 1.5,
+       "cylinderHeightM": 2.2
+      },
+      "modelScaleV2": 1.31,
+      "modelHeight": 2.2,
+      "maxEncounterVisualSettings": {
+       "scale": 12.53,
+       "cameraDistance": 29.9,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 25.06
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": 1.5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.7
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_PIKACHU_ANNIVERSARY_2026_MALAYSIA_01",
+  "data": {
+   "templateId": "EXTENDED_V0025_PIKACHU_ANNIVERSARY_2026_MALAYSIA_01",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_ANNIVERSARY_2026_MALAYSIA_01",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_PIKACHU_ANNIVERSARY_2026_PHILIPPINE_01",
+  "data": {
+   "templateId": "EXTENDED_V0025_PIKACHU_ANNIVERSARY_2026_PHILIPPINE_01",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_ANNIVERSARY_2026_PHILIPPINE_01",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_PIKACHU_ANNIVERSARY_2026_SINGAPORE_01",
+  "data": {
+   "templateId": "EXTENDED_V0025_PIKACHU_ANNIVERSARY_2026_SINGAPORE_01",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_ANNIVERSARY_2026_SINGAPORE_01",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_PIKACHU_ANNIVERSARY_2026_TAIWAN_01",
+  "data": {
+   "templateId": "EXTENDED_V0025_PIKACHU_ANNIVERSARY_2026_TAIWAN_01",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_ANNIVERSARY_2026_TAIWAN_01",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_ADVENTURE_HAT_2020",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_ADVENTURE_HAT_2020",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_ADVENTURE_HAT_2020",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_ANNIVERSARY_2026",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_ANNIVERSARY_2026",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_ANNIVERSARY_2026",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_BB_2026",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_BB_2026",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_BB_2026",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_COPY_2019",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_COPY_2019",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_COPY_2019",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_COSTUME_2020",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_COSTUME_2020",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_COSTUME_2020",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_DIWALI_2024",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_DIWALI_2024",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_DIWALI_2024",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_DOCTOR",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_DOCTOR",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_DOCTOR",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FALL_2019",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FALL_2019",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_FALL_2019",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FLYING_01",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FLYING_01",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_FLYING_01",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FLYING_02",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FLYING_02",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_FLYING_02",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FLYING_03",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FLYING_03",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_FLYING_03",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FLYING_04",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FLYING_04",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_FLYING_04",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FLYING_5TH_ANNIV",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FLYING_5TH_ANNIV",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_FLYING_5TH_ANNIV",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FLYING_OKINAWA",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FLYING_OKINAWA",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_FLYING_OKINAWA",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FOSSIL_2026",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_FOSSIL_2026",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_FOSSIL_2026",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2022",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2022",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOFEST_2022",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2024_MTIARA",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2024_MTIARA",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOFEST_2024_MTIARA",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2024_STIARA",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2024_STIARA",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOFEST_2024_STIARA",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2025_GOGGLES_BLUE",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2025_GOGGLES_BLUE",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOFEST_2025_GOGGLES_BLUE",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2025_GOGGLES_RED",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2025_GOGGLES_RED",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOFEST_2025_GOGGLES_RED",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2025_GOGGLES_YELLOW",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2025_GOGGLES_YELLOW",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOFEST_2025_GOGGLES_YELLOW",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2025_MONOCLE_BLUE",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2025_MONOCLE_BLUE",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOFEST_2025_MONOCLE_BLUE",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2025_MONOCLE_RED",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2025_MONOCLE_RED",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOFEST_2025_MONOCLE_RED",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2025_MONOCLE_YELLOW",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2025_MONOCLE_YELLOW",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOFEST_2025_MONOCLE_YELLOW",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2026_CAP_BLUE",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2026_CAP_BLUE",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOFEST_2026_CAP_BLUE",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2026_CAP_RED",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2026_CAP_RED",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOFEST_2026_CAP_RED",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2026_CAP_YELLOW",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOFEST_2026_CAP_YELLOW",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOFEST_2026_CAP_YELLOW",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2024_A",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2024_A",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOTOUR_2024_A",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2024_A_02",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2024_A_02",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOTOUR_2024_A_02",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2024_B",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2024_B",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOTOUR_2024_B",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2024_B_02",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2024_B_02",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOTOUR_2024_B_02",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2025_A",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2025_A",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOTOUR_2025_A",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2025_A_02",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2025_A_02",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOTOUR_2025_A_02",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2025_B",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2025_B",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOTOUR_2025_B",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2025_B_02",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2025_B_02",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOTOUR_2025_B_02",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2026_A",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2026_A",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOTOUR_2026_A",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2026_A_02",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2026_A_02",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOTOUR_2026_A_02",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2026_B",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2026_B",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOTOUR_2026_B",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2026_B_02",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2026_B_02",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOTOUR_2026_B_02",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2026_C",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2026_C",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOTOUR_2026_C",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2026_C_02",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_GOTOUR_2026_C_02",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_GOTOUR_2026_C_02",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_HORIZONS",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_HORIZONS",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_HORIZONS",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_JEJU",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_JEJU",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_JEJU",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_KARIYUSHI",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_KARIYUSHI",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_KARIYUSHI",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_KURTA",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_KURTA",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_KURTA",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_NORMAL",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_NORMAL",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_NORMAL",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_POP_STAR",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_POP_STAR",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_POP_STAR",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_PXP_2026",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_PXP_2026",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_PXP_2026",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_ROCK_STAR",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_ROCK_STAR",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_ROCK_STAR",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_SUMMER_2023_A",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_SUMMER_2023_A",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_SUMMER_2023_A",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_SUMMER_2023_B",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_SUMMER_2023_B",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_SUMMER_2023_B",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_SUMMER_2023_C",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_SUMMER_2023_C",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_SUMMER_2023_C",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_SUMMER_2023_D",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_SUMMER_2023_D",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_SUMMER_2023_D",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_SUMMER_2023_E",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_SUMMER_2023_E",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_SUMMER_2023_E",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_TSHIRT_01",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_TSHIRT_01",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_TSHIRT_01",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_TSHIRT_02",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_TSHIRT_02",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_TSHIRT_02",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_TSHIRT_03",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_TSHIRT_03",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_TSHIRT_03",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_VISOR_2026",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_VISOR_2026",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_VISOR_2026",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_VS_2019",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_VS_2019",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_VS_2019",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_WCS_2022",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_WCS_2022",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_WCS_2022",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_WCS_2023",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_WCS_2023",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_WCS_2023",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_WCS_2024",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_WCS_2024",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_WCS_2024",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_WCS_2025",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_WCS_2025",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_WCS_2025",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_WCS_2026",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_WCS_2026",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_WCS_2026",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_WINTER_2020",
+  "data": {
+   "templateId": "EXTENDED_V0025_POKEMON_PIKACHU_WINTER_2020",
+   "pokemonExtendedSettings": {
+    "uniqueId": "PIKACHU",
+    "form": "PIKACHU_WINTER_2020",
+    "sizeSettings": {
+     "xxsLowerBound": 0.196,
+     "xsLowerBound": 0.2,
+     "mLowerBound": 0.3,
+     "mUpperBound": 0.5,
+     "xlUpperBound": 0.6,
+     "xxlUpperBound": 0.7
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 31,
+       "cameraDistance": 27.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 62
+      },
+      "maxStationVisualSettings": {
+       "scale": 4.22
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 21,
+      "camera": {
+       "cylinderRadiusM": 1.3,
+       "cylinderHeightM": 1.1
+      },
+      "modelScaleV2": 0.86,
+      "modelHeight": 2.57,
+      "catchOverrideSettings": {
+       "collisionRadiusM": 0.25,
+       "collisionHeadRadiusM": 0.25
+      },
+      "maxEncounterVisualSettings": {
+       "scale": 10.5,
+       "cameraDistance": 32.5,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20,
+       "xOffset": 3
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5,
+       "yOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.25
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0094_POKEMON_GENGAR",
+  "data": {
+   "templateId": "EXTENDED_V0094_POKEMON_GENGAR",
+   "pokemonExtendedSettings": {
+    "uniqueId": "GENGAR",
+    "tempEvoOverrides": [
+     {
+      "tempEvoId": "TEMP_EVOLUTION_MEGA",
+      "sizeSettings": {
+       "xxsLowerBound": 0.686,
+       "xsLowerBound": 0.7,
+       "mLowerBound": 1.05,
+       "mUpperBound": 1.75,
+       "xlUpperBound": 2.1,
+       "xxlUpperBound": 2.17
+      }
+     }
+    ],
+    "sizeSettings": {
+     "xxsLowerBound": 0.735,
+     "xsLowerBound": 0.75,
+     "mLowerBound": 1.125,
+     "mUpperBound": 1.875,
+     "xlUpperBound": 2.25,
+     "xxlUpperBound": 3
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 10.34,
+       "cameraDistance": 30,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20.68
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.41
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 20,
+      "camera": {
+       "cylinderRadiusM": 1.35,
+       "cylinderHeightM": 2.25
+      },
+      "modelScaleV2": 0.97,
+      "modelHeight": 2.13,
+      "maxEncounterVisualSettings": {
+       "scale": 10.67,
+       "cameraDistance": 30,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 21.33
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.45
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0094_POKEMON_GENGAR_NORMAL",
+  "data": {
+   "templateId": "EXTENDED_V0094_POKEMON_GENGAR_NORMAL",
+   "pokemonExtendedSettings": {
+    "uniqueId": "GENGAR",
+    "form": "GENGAR_NORMAL",
+    "tempEvoOverrides": [
+     {
+      "tempEvoId": "TEMP_EVOLUTION_MEGA",
+      "sizeSettings": {
+       "xxsLowerBound": 0.686,
+       "xsLowerBound": 0.7,
+       "mLowerBound": 1.05,
+       "mUpperBound": 1.75,
+       "xlUpperBound": 2.1,
+       "xxlUpperBound": 2.17
+      }
+     }
+    ],
+    "sizeSettings": {
+     "xxsLowerBound": 0.735,
+     "xsLowerBound": 0.75,
+     "mLowerBound": 1.125,
+     "mUpperBound": 1.875,
+     "xlUpperBound": 2.25,
+     "xxlUpperBound": 3
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 10.34,
+       "cameraDistance": 30,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 20.68
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": -5
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.41
+      }
+     },
+     {
+      "breadMode": "BREAD_DOUGH_MODE",
+      "averageHeightM": 20,
+      "camera": {
+       "cylinderRadiusM": 1.35,
+       "cylinderHeightM": 2.25
+      },
+      "modelScaleV2": 0.97,
+      "modelHeight": 2.13,
+      "maxEncounterVisualSettings": {
+       "scale": 10.67,
+       "cameraDistance": 30,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 21.33
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.45
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0380_POKEMON_LATIAS",
+  "data": {
+   "templateId": "EXTENDED_V0380_POKEMON_LATIAS",
+   "pokemonExtendedSettings": {
+    "uniqueId": "LATIAS",
+    "tempEvoOverrides": [
+     {
+      "tempEvoId": "TEMP_EVOLUTION_MEGA",
+      "sizeSettings": {
+       "xxsLowerBound": 0.882,
+       "xsLowerBound": 0.9,
+       "mLowerBound": 1.35,
+       "mUpperBound": 2.25,
+       "xlUpperBound": 2.7,
+       "xxlUpperBound": 3.15
+      }
+     }
+    ],
+    "sizeSettings": {
+     "xxsLowerBound": 0.686,
+     "xsLowerBound": 0.7,
+     "mLowerBound": 1.05,
+     "mUpperBound": 1.75,
+     "xlUpperBound": 2.1,
+     "xxlUpperBound": 2.17
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 17,
+       "cameraDistance": 30,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 34
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": 5
+      },
+      "maxStationVisualSettings": {
+       "scale": 2.075
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0380_POKEMON_LATIAS_NORMAL",
+  "data": {
+   "templateId": "EXTENDED_V0380_POKEMON_LATIAS_NORMAL",
+   "pokemonExtendedSettings": {
+    "uniqueId": "LATIAS",
+    "form": "LATIAS_NORMAL",
+    "tempEvoOverrides": [
+     {
+      "tempEvoId": "TEMP_EVOLUTION_MEGA",
+      "sizeSettings": {
+       "xxsLowerBound": 0.882,
+       "xsLowerBound": 0.9,
+       "mLowerBound": 1.35,
+       "mUpperBound": 2.25,
+       "xlUpperBound": 2.7,
+       "xxlUpperBound": 3.15
+      }
+     }
+    ],
+    "sizeSettings": {
+     "xxsLowerBound": 0.686,
+     "xsLowerBound": 0.7,
+     "mLowerBound": 1.05,
+     "mUpperBound": 1.75,
+     "xlUpperBound": 2.1,
+     "xxlUpperBound": 2.17
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 17,
+       "cameraDistance": 30,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 34
+      },
+      "maxBattleTrainerVisualSettings": {
+       "xOffset": 5
+      },
+      "maxStationVisualSettings": {
+       "scale": 2.075
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0555_POKEMON_DARMANITAN",
+  "data": {
+   "templateId": "EXTENDED_V0555_POKEMON_DARMANITAN",
+   "pokemonExtendedSettings": {
+    "uniqueId": "DARMANITAN",
+    "sizeSettings": {
+     "xxsLowerBound": 0.637,
+     "xsLowerBound": 0.65,
+     "mLowerBound": 0.975,
+     "mUpperBound": 1.625,
+     "xlUpperBound": 1.95,
+     "xxlUpperBound": 2.015
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 13.74,
+       "cameraDistance": 30,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 27.48
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.9
+      }
+     }
+    ]
+   }
+  }
+ },
+ {
+  "templateId": "EXTENDED_V0555_POKEMON_DARMANITAN_STANDARD",
+  "data": {
+   "templateId": "EXTENDED_V0555_POKEMON_DARMANITAN_STANDARD",
+   "pokemonExtendedSettings": {
+    "uniqueId": "DARMANITAN",
+    "form": "DARMANITAN_STANDARD",
+    "sizeSettings": {
+     "xxsLowerBound": 0.637,
+     "xsLowerBound": 0.65,
+     "mLowerBound": 0.975,
+     "mUpperBound": 1.625,
+     "xlUpperBound": 1.95,
+     "xxlUpperBound": 2.015
+    },
+    "breadOverrides": [
+     {
+      "breadMode": "BREAD_MODE",
+      "maxEncounterVisualSettings": {
+       "scale": 13.74,
+       "cameraDistance": 30,
+       "maxReticleSize": 14
+      },
+      "maxBattleVisualSettings": {
+       "scale": 27.48
+      },
+      "maxStationVisualSettings": {
+       "scale": 1.9
+      }
+     }
+    ]
+   }
+  }
+ },
  {
   "templateId": "FORMS_V0003_POKEMON_VENUSAUR",
   "data": {
diff --git a/test/fixtures/pokebattler-raids.json b/test/fixtures/pokebattler-raids.json
new file mode 100644
index 0000000000000000000000000000000000000000..647d127af29e3ddb355ce5b4f73b1c383a9f19d5
--- /dev/null
+++ b/test/fixtures/pokebattler-raids.json
@@ -0,0 +1,3631 @@
+{
+ "tiers": [
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_5",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 15000,
+    "cpm": 0.7900000214576721,
+    "level": "50",
+    "eggURL": "//static.pokebattler.com/images/legendary_raid_egg.png",
+    "guessTier": "RAID_LEVEL_5",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 300000,
+    "estimatedPlayers": 4,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [
+    {
+     "pokemon": "DIALGA",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "article": {
+      "id": 109,
+      "articleSlug": "dialga-raid-guide-2",
+      "articleThumbnailURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Dialga_Article_Thumbnail.jpg",
+      "articleURL": "https://www.pokebattler.com/raids/guides/DIALGA",
+      "infographicURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Dialga_Raid_Guide6.jpg",
+      "infographicThumbnailURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Dialga_Article_Thumbnail.jpg",
+      "infographicShareURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Dialga_Article_Thumbnail.jpg",
+      "infographicShareWidth": 1200,
+      "infographicShareHeight": 630,
+      "newsCategorySlug": "www-raid",
+      "newsTagSlug": "dialga-raid-guide-2",
+      "videoId": ""
+     },
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "pokemonId": "DIALGA"
+    },
+    {
+     "pokemon": "GIRATINA_ORIGIN_FORM",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "upcoming": true,
+     "startDate": 1793192400000,
+     "pokemonId": "GIRATINA_ORIGIN_FORM"
+    },
+    {
+     "pokemon": "PALKIA",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "article": {
+      "id": 111,
+      "articleSlug": "palkia-raid-guide-3",
+      "articleThumbnailURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Palkia_Article_Thumbnail.jpg",
+      "articleURL": "https://www.pokebattler.com/raids/guides/PALKIA",
+      "infographicURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Palkia_Raid_Guide6.jpg",
+      "infographicThumbnailURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Palkia_Article_Thumbnail.jpg",
+      "infographicShareURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Palkia_Article_Thumbnail.jpg",
+      "infographicShareWidth": 1200,
+      "infographicShareHeight": 630,
+      "newsCategorySlug": "www-raid",
+      "newsTagSlug": "palkia-raid-guide-2",
+      "videoId": ""
+     },
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "pokemonId": "PALKIA"
+    }
+   ],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_5_MAX_FUTURE",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 13000,
+    "cpm": 0.699999988079071,
+    "level": "40",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_5_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 400000,
+    "estimatedPlayers": 4,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [
+    {
+     "pokemon": "AZELF",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 13000,
+      "cpm": 0.699999988079071,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "AZELF"
+    },
+    {
+     "pokemon": "DIALGA",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_UNLIMITED",
+     "bossStats": {
+      "hp": 13000,
+      "cpm": 0.699999988079071,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "DIALGA"
+    },
+    {
+     "pokemon": "LATIAS",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 13000,
+      "cpm": 0.699999988079071,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "LATIAS"
+    },
+    {
+     "pokemon": "LATIOS",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 13000,
+      "cpm": 0.699999988079071,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "LATIOS"
+    },
+    {
+     "pokemon": "MESPRIT",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 13000,
+      "cpm": 0.699999988079071,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "MESPRIT"
+    },
+    {
+     "pokemon": "PALKIA",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_UNLIMITED",
+     "bossStats": {
+      "hp": 13000,
+      "cpm": 0.699999988079071,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "PALKIA"
+    },
+    {
+     "pokemon": "REGIDRAGO",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 13000,
+      "cpm": 0.699999988079071,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "REGIDRAGO"
+    },
+    {
+     "pokemon": "REGISTEEL",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 13000,
+      "cpm": 0.699999988079071,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "REGISTEEL"
+    },
+    {
+     "pokemon": "UXIE",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 13000,
+      "cpm": 0.699999988079071,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "UXIE"
+    }
+   ],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_5_MAX",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 13000,
+    "cpm": 0.699999988079071,
+    "level": "40",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_5_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 400000,
+    "estimatedPlayers": 4,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [
+    {
+     "pokemon": "AZELF",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 13000,
+      "cpm": 0.699999988079071,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "upcoming": true,
+     "startDate": 1792875600000,
+     "pokemonId": "AZELF"
+    },
+    {
+     "pokemon": "MESPRIT",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 13000,
+      "cpm": 0.699999988079071,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "upcoming": true,
+     "startDate": 1792875600000,
+     "pokemonId": "MESPRIT"
+    },
+    {
+     "pokemon": "UXIE",
+     "cp": 0,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 13000,
+      "cpm": 0.699999988079071,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "upcoming": true,
+     "startDate": 1792875600000,
+     "pokemonId": "UXIE"
+    }
+   ],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_5_MAX_LEGACY",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 13000,
+    "cpm": 0.699999988079071,
+    "level": "40",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_5_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 400000,
+    "estimatedPlayers": 4,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [
+    {
+     "pokemon": "ARTICUNO",
+     "cp": 43383,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 17500,
+      "cpm": 0.7,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "ARTICUNO"
+    },
+    {
+     "pokemon": "ENTEI",
+     "cp": 38874,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 27000,
+      "cpm": 0.75,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "ENTEI"
+    },
+    {
+     "pokemon": "HO_OH",
+     "cp": 54075,
+     "shiny": false,
+     "verified": false,
+     "minCp": 24526,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 25000,
+      "cpm": 0.7,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "HO_OH"
+    },
+    {
+     "pokemon": "LATIAS",
+     "cp": 44760,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 25000,
+      "cpm": 0.7,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "LATIAS"
+    },
+    {
+     "pokemon": "LATIOS",
+     "cp": 48615,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 23000,
+      "cpm": 0.75,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "LATIOS"
+    },
+    {
+     "pokemon": "LUGIA",
+     "cp": 42753,
+     "shiny": false,
+     "verified": false,
+     "minCp": 22498,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 18000,
+      "cpm": 0.75,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "LUGIA"
+    },
+    {
+     "pokemon": "MOLTRES",
+     "cp": 49263,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 20000,
+      "cpm": 0.7,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "MOLTRES"
+    },
+    {
+     "pokemon": "RAIKOU",
+     "cp": 42298,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 25000,
+      "cpm": 0.8,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "RAIKOU"
+    },
+    {
+     "pokemon": "REGICE",
+     "cp": 49384,
+     "shiny": true,
+     "verified": false,
+     "minCp": 20952,
+     "article": {
+      "id": 76,
+      "articleSlug": "regice-raid-guide",
+      "articleThumbnailURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Regice_Article_Thumbnail.jpg",
+      "articleURL": "https://www.pokebattler.com/raids/guides/REGICE",
+      "infographicURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Regice_Raid_Guide4.jpg",
+      "infographicThumbnailURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Regice_Article_Thumbnail.jpg",
+      "infographicShareURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Regice_Article_Thumbnail.jpg",
+      "infographicShareWidth": 1200,
+      "infographicShareHeight": 630,
+      "newsCategorySlug": "www-raid",
+      "newsTagSlug": "regice",
+      "videoId": ""
+     },
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 20000,
+      "cpm": 0.8,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "REGICE"
+    },
+    {
+     "pokemon": "REGIROCK",
+     "cp": 39814,
+     "shiny": true,
+     "verified": false,
+     "minCp": 20952,
+     "article": {
+      "id": 77,
+      "articleSlug": "regirock-raid-guide",
+      "articleThumbnailURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Regirock_Article_Thumbnail.jpg",
+      "articleURL": "https://www.pokebattler.com/raids/guides/REGIROCK",
+      "infographicURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Regirock_Raid_Guide4.jpg",
+      "infographicThumbnailURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Regirock_Article_Thumbnail.jpg",
+      "infographicShareURL": "https://storage.googleapis.com/static.pokebattler.com/CaptGoldfish/Regirock_Article_Thumbnail.jpg",
+      "infographicShareWidth": 1200,
+      "infographicShareHeight": 630,
+      "newsCategorySlug": "www-raid",
+      "newsTagSlug": "regirock",
+      "videoId": ""
+     },
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 20000,
+      "cpm": 0.8,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "REGIROCK"
+    },
+    {
+     "pokemon": "REGISTEEL",
+     "cp": 31202,
+     "shiny": true,
+     "verified": false,
+     "minCp": 16419,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 18000,
+      "cpm": 0.9,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "REGISTEEL"
+    },
+    {
+     "pokemon": "SUICUNE",
+     "cp": 35154,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 22000,
+      "cpm": 0.9,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "SUICUNE"
+    },
+    {
+     "pokemon": "ZAPDOS",
+     "cp": 43213,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 13000,
+      "cpm": 0.7,
+      "maxEnergyMultiplier": 4,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 7500,
+      "spreadMoveDelayMs": 6500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "ZAPDOS"
+    }
+   ],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_3_MAX_FUTURE",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 10000,
+    "cpm": 0.5,
+    "level": "30",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_3_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 480000,
+    "estimatedPlayers": 2,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_3_MAX",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 10000,
+    "cpm": 0.5,
+    "level": "30",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_3_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 480000,
+    "estimatedPlayers": 2,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [
+    {
+     "pokemon": "BELDUM",
+     "cp": 13458,
+     "shiny": true,
+     "verified": false,
+     "minCp": 8074,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "BELDUM"
+    },
+    {
+     "pokemon": "CHANSEY",
+     "cp": 8968,
+     "shiny": true,
+     "verified": false,
+     "minCp": 5381,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "CHANSEY"
+    },
+    {
+     "pokemon": "CRYOGONAL",
+     "cp": 31291,
+     "shiny": true,
+     "verified": false,
+     "minCp": 18775,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "CRYOGONAL"
+    },
+    {
+     "pokemon": "DEINO",
+     "cp": 13613,
+     "shiny": true,
+     "verified": false,
+     "minCp": 13613,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "DEINO"
+    },
+    {
+     "pokemon": "DRAMPA",
+     "cp": 32912,
+     "shiny": true,
+     "verified": false,
+     "minCp": 32912,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "DRAMPA"
+    },
+    {
+     "pokemon": "ELECTABUZZ",
+     "cp": 28015,
+     "shiny": true,
+     "verified": false,
+     "minCp": 16809,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "ELECTABUZZ"
+    },
+    {
+     "pokemon": "FALINKS",
+     "cp": 28291,
+     "shiny": true,
+     "verified": false,
+     "minCp": 16974,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "FALINKS"
+    },
+    {
+     "pokemon": "HITMONCHAN",
+     "cp": 30285,
+     "shiny": true,
+     "verified": false,
+     "minCp": 18171,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "HITMONCHAN"
+    },
+    {
+     "pokemon": "HITMONLEE",
+     "cp": 33460,
+     "shiny": true,
+     "verified": false,
+     "minCp": 20076,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "HITMONLEE"
+    },
+    {
+     "pokemon": "HITMONTOP",
+     "cp": 28011,
+     "shiny": true,
+     "verified": false,
+     "minCp": 16806,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "HITMONTOP"
+    },
+    {
+     "pokemon": "MAGMAR",
+     "cp": 28730,
+     "shiny": true,
+     "verified": false,
+     "minCp": 17238,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "MAGMAR"
+    },
+    {
+     "pokemon": "PASSIMIAN",
+     "cp": 31352,
+     "shiny": true,
+     "verified": false,
+     "minCp": 18811,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "PASSIMIAN"
+    },
+    {
+     "pokemon": "SABLEYE",
+     "cp": 19169,
+     "shiny": true,
+     "verified": false,
+     "minCp": 11501,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SABLEYE"
+    }
+   ],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_3_MAX_LEGACY",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 10000,
+    "cpm": 0.5,
+    "level": "30",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_3_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 480000,
+    "estimatedPlayers": 2,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [
+    {
+     "pokemon": "BELDUM",
+     "cp": 13458,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "BELDUM"
+    },
+    {
+     "pokemon": "CHANSEY",
+     "cp": 8968,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "CHANSEY"
+    },
+    {
+     "pokemon": "CRYOGONAL",
+     "cp": 31291,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "CRYOGONAL"
+    },
+    {
+     "pokemon": "FALINKS",
+     "cp": 28291,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "FALINKS"
+    },
+    {
+     "pokemon": "PASSIMIAN",
+     "cp": 31352,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "PASSIMIAN"
+    },
+    {
+     "pokemon": "SHUCKLE",
+     "cp": 6487,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 10000,
+      "cpm": 0.5,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SHUCKLE"
+    }
+   ],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_1_MAX_FUTURE",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 1700,
+    "cpm": 0.15000000596046448,
+    "level": "20",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_1_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 480000,
+    "estimatedPlayers": 1,
+    "soloable": true,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_1_MAX",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 1700,
+    "cpm": 0.15000000596046448,
+    "level": "20",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_1_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 480000,
+    "estimatedPlayers": 1,
+    "soloable": true,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [
+    {
+     "pokemon": "ABRA",
+     "cp": 8527,
+     "shiny": true,
+     "verified": false,
+     "minCp": 12409,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "ABRA"
+    },
+    {
+     "pokemon": "BOUNSWEET",
+     "cp": 2645,
+     "shiny": true,
+     "verified": false,
+     "minCp": 3849,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "BOUNSWEET"
+    },
+    {
+     "pokemon": "BULBASAUR",
+     "cp": 6155,
+     "shiny": true,
+     "verified": false,
+     "minCp": 8957,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "BULBASAUR"
+    },
+    {
+     "pokemon": "CATERPIE",
+     "cp": 2414,
+     "shiny": true,
+     "verified": false,
+     "minCp": 1579,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "CATERPIE"
+    },
+    {
+     "pokemon": "CHARMANDER",
+     "cp": 5613,
+     "shiny": true,
+     "verified": false,
+     "minCp": 8168,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "CHARMANDER"
+    },
+    {
+     "pokemon": "COMBEE",
+     "cp": 3020,
+     "shiny": true,
+     "verified": false,
+     "minCp": 4395,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "COMBEE"
+    },
+    {
+     "pokemon": "COTTONEE",
+     "cp": 3980,
+     "shiny": true,
+     "verified": false,
+     "minCp": 5792,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "COTTONEE"
+    },
+    {
+     "pokemon": "DRILBUR",
+     "cp": 6968,
+     "shiny": true,
+     "verified": false,
+     "minCp": 10140,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "DRILBUR"
+    },
+    {
+     "pokemon": "ESPURR",
+     "cp": 6321,
+     "shiny": true,
+     "verified": false,
+     "minCp": 9199,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "ESPURR"
+    },
+    {
+     "pokemon": "GASTLY",
+     "cp": 7504,
+     "shiny": true,
+     "verified": false,
+     "minCp": 10920,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "GASTLY"
+    },
+    {
+     "pokemon": "GROOKEY",
+     "cp": 5815,
+     "shiny": true,
+     "verified": false,
+     "minCp": 8463,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "GROOKEY"
+    },
+    {
+     "pokemon": "GROWLITHE",
+     "cp": 6470,
+     "shiny": true,
+     "verified": false,
+     "minCp": 9415,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "GROWLITHE"
+    },
+    {
+     "pokemon": "HATENNA",
+     "cp": 4841,
+     "shiny": true,
+     "verified": false,
+     "minCp": 7045,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "HATENNA"
+    },
+    {
+     "pokemon": "HOOTHOOT",
+     "cp": 3431,
+     "shiny": true,
+     "verified": false,
+     "minCp": 4993,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "HOOTHOOT"
+    },
+    {
+     "pokemon": "INKAY",
+     "cp": 4886,
+     "shiny": true,
+     "verified": false,
+     "minCp": 7110,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "INKAY"
+    },
+    {
+     "pokemon": "KABUTO",
+     "cp": 8367,
+     "shiny": true,
+     "verified": false,
+     "minCp": 12176,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "KABUTO"
+    },
+    {
+     "pokemon": "KRABBY",
+     "cp": 9527,
+     "shiny": true,
+     "verified": false,
+     "minCp": 13864,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "KRABBY"
+    },
+    {
+     "pokemon": "MAGIKARP",
+     "cp": 1814,
+     "shiny": true,
+     "verified": false,
+     "minCp": 2640,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "MAGIKARP"
+    },
+    {
+     "pokemon": "OMANYTE",
+     "cp": 9085,
+     "shiny": true,
+     "verified": false,
+     "minCp": 13220,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "OMANYTE"
+    },
+    {
+     "pokemon": "PIDOVE",
+     "cp": 4541,
+     "shiny": true,
+     "verified": false,
+     "minCp": 6608,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "PIDOVE"
+    },
+    {
+     "pokemon": "PIKACHU",
+     "cp": 5516,
+     "shiny": true,
+     "verified": false,
+     "minCp": 8028,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "PIKACHU"
+    },
+    {
+     "pokemon": "RALTS",
+     "cp": 3334,
+     "shiny": true,
+     "verified": false,
+     "minCp": 4851,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "RALTS"
+    },
+    {
+     "pokemon": "RHYHORN",
+     "cp": 7615,
+     "shiny": true,
+     "verified": false,
+     "minCp": 7615,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "RHYHORN"
+    },
+    {
+     "pokemon": "ROGGENROLA",
+     "cp": 6269,
+     "shiny": true,
+     "verified": false,
+     "minCp": 9123,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "ROGGENROLA"
+    },
+    {
+     "pokemon": "ROOKIDEE",
+     "cp": 3845,
+     "shiny": true,
+     "verified": false,
+     "minCp": 5596,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "ROOKIDEE"
+    },
+    {
+     "pokemon": "SCORBUNNY",
+     "cp": 5876,
+     "shiny": true,
+     "verified": false,
+     "minCp": 8551,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SCORBUNNY"
+    },
+    {
+     "pokemon": "SIZZLIPEDE",
+     "cp": 5619,
+     "shiny": true,
+     "verified": false,
+     "minCp": 8177,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SIZZLIPEDE"
+    },
+    {
+     "pokemon": "SKWOVET",
+     "cp": 4558,
+     "shiny": true,
+     "verified": false,
+     "minCp": 6632,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SKWOVET"
+    },
+    {
+     "pokemon": "SNEASEL",
+     "cp": 10672,
+     "shiny": true,
+     "verified": false,
+     "minCp": 15530,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SNEASEL"
+    },
+    {
+     "pokemon": "SOBBLE",
+     "cp": 5876,
+     "shiny": true,
+     "verified": false,
+     "minCp": 8551,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SOBBLE"
+    },
+    {
+     "pokemon": "SPHEAL",
+     "cp": 4647,
+     "shiny": true,
+     "verified": false,
+     "minCp": 6762,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SPHEAL"
+    },
+    {
+     "pokemon": "SQUIRTLE",
+     "cp": 5241,
+     "shiny": true,
+     "verified": false,
+     "minCp": 7626,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SQUIRTLE"
+    },
+    {
+     "pokemon": "TRAPINCH",
+     "cp": 7037,
+     "shiny": true,
+     "verified": false,
+     "minCp": 10241,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "TRAPINCH"
+    },
+    {
+     "pokemon": "TRUBBISH",
+     "cp": 5356,
+     "shiny": true,
+     "verified": false,
+     "minCp": 7795,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "TRUBBISH"
+    },
+    {
+     "pokemon": "WOOBAT",
+     "cp": 5030,
+     "shiny": true,
+     "verified": false,
+     "minCp": 7320,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "WOOBAT"
+    },
+    {
+     "pokemon": "WOOLOO",
+     "cp": 3970,
+     "shiny": true,
+     "verified": false,
+     "minCp": 5778,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "WOOLOO"
+    }
+   ],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_1_MAX_LEGACY",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 1700,
+    "cpm": 0.15000000596046448,
+    "level": "20",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_1_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 480000,
+    "estimatedPlayers": 1,
+    "soloable": true,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [
+    {
+     "pokemon": "BULBASAUR",
+     "cp": 6155,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "BULBASAUR"
+    },
+    {
+     "pokemon": "CATERPIE",
+     "cp": 2414,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "CATERPIE"
+    },
+    {
+     "pokemon": "CHARMANDER",
+     "cp": 5613,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "CHARMANDER"
+    },
+    {
+     "pokemon": "DARUMAKA",
+     "cp": 6961,
+     "shiny": true,
+     "verified": false,
+     "minCp": 10130,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "DARUMAKA"
+    },
+    {
+     "pokemon": "DRILBUR",
+     "cp": 6968,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "DRILBUR"
+    },
+    {
+     "pokemon": "GASTLY",
+     "cp": 7504,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "GASTLY"
+    },
+    {
+     "pokemon": "GROOKEY",
+     "cp": 5815,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "GROOKEY"
+    },
+    {
+     "pokemon": "HATENNA",
+     "cp": 4841,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "HATENNA"
+    },
+    {
+     "pokemon": "KABUTO",
+     "cp": 8367,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "KABUTO"
+    },
+    {
+     "pokemon": "KRABBY",
+     "cp": 9527,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "KRABBY"
+    },
+    {
+     "pokemon": "OMANYTE",
+     "cp": 9085,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "OMANYTE"
+    },
+    {
+     "pokemon": "PIDOVE",
+     "cp": 4541,
+     "shiny": true,
+     "verified": false,
+     "minCp": 6608,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "PIDOVE"
+    },
+    {
+     "pokemon": "ROOKIDEE",
+     "cp": 3845,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "ROOKIDEE"
+    },
+    {
+     "pokemon": "SABLEYE",
+     "cp": 7903,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SABLEYE"
+    },
+    {
+     "pokemon": "SCORBUNNY",
+     "cp": 5876,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SCORBUNNY"
+    },
+    {
+     "pokemon": "SKWOVET",
+     "cp": 4558,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SKWOVET"
+    },
+    {
+     "pokemon": "SOBBLE",
+     "cp": 5876,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SOBBLE"
+    },
+    {
+     "pokemon": "SQUIRTLE",
+     "cp": 5241,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SQUIRTLE"
+    },
+    {
+     "pokemon": "TRUBBISH",
+     "cp": 5356,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "TRUBBISH"
+    },
+    {
+     "pokemon": "WAILMER",
+     "cp": 5672,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "WAILMER"
+    },
+    {
+     "pokemon": "WOOLOO",
+     "cp": 3970,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 1700,
+      "cpm": 0.15000000596046448,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "WOOLOO"
+    }
+   ],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_6_MAX_LEGACY",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 100000,
+    "cpm": 0.7649999856948853,
+    "level": "50",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_6_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 600000,
+    "estimatedPlayers": 20,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [
+    {
+     "pokemon": "BLASTOISE_GIGANTAMAX",
+     "cp": 75896,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 75000,
+      "cpm": 0.85,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "BLASTOISE_GIGANTAMAX"
+    },
+    {
+     "pokemon": "CHARIZARD_GIGANTAMAX",
+     "cp": 86338,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 70000,
+      "cpm": 0.85,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "CHARIZARD_GIGANTAMAX"
+    },
+    {
+     "pokemon": "CINDERACE_GIGANTAMAX",
+     "cp": 95471,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 80000,
+      "cpm": 0.8,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "CINDERACE_GIGANTAMAX"
+    },
+    {
+     "pokemon": "ETERNATUS",
+     "cp": 133306,
+     "shiny": false,
+     "verified": false,
+     "minCp": 25293,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "ETERNATUS"
+    },
+    {
+     "pokemon": "GENGAR_GIGANTAMAX",
+     "cp": 93514,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 70000,
+      "cpm": 0.85,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "GENGAR_GIGANTAMAX"
+    },
+    {
+     "pokemon": "INTELEON_GIGANTAMAX",
+     "cp": 109756,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.9,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "INTELEON_GIGANTAMAX"
+    },
+    {
+     "pokemon": "KINGLER_GIGANTAMAX",
+     "cp": 112893,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.85,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "KINGLER_GIGANTAMAX"
+    },
+    {
+     "pokemon": "LAPRAS_GIGANTAMAX",
+     "cp": 74237,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 90000,
+      "cpm": 0.85,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "LAPRAS_GIGANTAMAX"
+    },
+    {
+     "pokemon": "MACHAMP_GIGANTAMAX",
+     "cp": 103866,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.8,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "MACHAMP_GIGANTAMAX"
+    },
+    {
+     "pokemon": "RILLABOOM_GIGANTAMAX",
+     "cp": 119028,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 120000,
+      "cpm": 1,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "RILLABOOM_GIGANTAMAX"
+    },
+    {
+     "pokemon": "SNORLAX_GIGANTAMAX",
+     "cp": 102171,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 135000,
+      "cpm": 0.65,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "SNORLAX_GIGANTAMAX"
+    },
+    {
+     "pokemon": "TOXTRICITY_AMPED_GIGANTAMAX",
+     "cp": 94094,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.9,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "TOXTRICITY_AMPED_GIGANTAMAX"
+    },
+    {
+     "pokemon": "VENUSAUR_GIGANTAMAX",
+     "cp": 91267,
+     "shiny": true,
+     "verified": true,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 90000,
+      "cpm": 0.85,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "VENUSAUR_GIGANTAMAX"
+    }
+   ],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_6_MAX",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 100000,
+    "cpm": 0.7649999856948853,
+    "level": "50",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_6_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 600000,
+    "estimatedPlayers": 20,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_6_MAX_FUTURE",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 100000,
+    "cpm": 0.7649999856948853,
+    "level": "50",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_6_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 600000,
+    "estimatedPlayers": 20,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [
+    {
+     "pokemon": "ALCREMIE_GIGANTAMAX",
+     "cp": 101785,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "ALCREMIE_GIGANTAMAX"
+    },
+    {
+     "pokemon": "APPLETUN_GIGANTAMAX",
+     "cp": 89978,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 135000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "APPLETUN_GIGANTAMAX"
+    },
+    {
+     "pokemon": "BUTTERFREE_GIGANTAMAX",
+     "cp": 70956,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.85,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "BUTTERFREE_GIGANTAMAX"
+    },
+    {
+     "pokemon": "CENTISKORCH_GIGANTAMAX",
+     "cp": 113568,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 135000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "CENTISKORCH_GIGANTAMAX"
+    },
+    {
+     "pokemon": "COALOSSAL_GIGANTAMAX",
+     "cp": 86334,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 135000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "COALOSSAL_GIGANTAMAX"
+    },
+    {
+     "pokemon": "COPPERAJAH_GIGANTAMAX",
+     "cp": 90495,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "COPPERAJAH_GIGANTAMAX"
+    },
+    {
+     "pokemon": "CORVIKNIGHT_GIGANTAMAX",
+     "cp": 80985,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "CORVIKNIGHT_GIGANTAMAX"
+    },
+    {
+     "pokemon": "DREDNAW_GIGANTAMAX",
+     "cp": 112080,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 135000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "DREDNAW_GIGANTAMAX"
+    },
+    {
+     "pokemon": "DURALUDON_GIGANTAMAX",
+     "cp": 113592,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "DURALUDON_GIGANTAMAX"
+    },
+    {
+     "pokemon": "EEVEE_GIGANTAMAX",
+     "cp": 42740,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "EEVEE_GIGANTAMAX"
+    },
+    {
+     "pokemon": "ETERNATUS_ETERNAMAX_FORM",
+     "cp": 148579,
+     "shiny": false,
+     "verified": false,
+     "minCp": 36394,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 60000,
+      "cpm": 0.75,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "ETERNATUS_ETERNAMAX_FORM"
+    },
+    {
+     "pokemon": "FLAPPLE_GIGANTAMAX",
+     "cp": 106096,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 135000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "FLAPPLE_GIGANTAMAX"
+    },
+    {
+     "pokemon": "GARBODOR_GIGANTAMAX",
+     "cp": 82924,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 1.4,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "GARBODOR_GIGANTAMAX"
+    },
+    {
+     "pokemon": "GRIMMSNARL_GIGANTAMAX",
+     "cp": 79455,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 70000,
+      "cpm": 1.2,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "GRIMMSNARL_GIGANTAMAX"
+    },
+    {
+     "pokemon": "HATTERENE_GIGANTAMAX",
+     "cp": 111849,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "HATTERENE_GIGANTAMAX"
+    },
+    {
+     "pokemon": "INTELEON_GIGANTAMAX",
+     "cp": 109756,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "INTELEON_GIGANTAMAX"
+    },
+    {
+     "pokemon": "MACHAMP_GIGANTAMAX",
+     "cp": 103866,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "MACHAMP_GIGANTAMAX"
+    },
+    {
+     "pokemon": "MELMETAL_GIGANTAMAX",
+     "cp": 109117,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "MELMETAL_GIGANTAMAX"
+    },
+    {
+     "pokemon": "MEOWTH_GIGANTAMAX",
+     "cp": 29185,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 80000,
+      "cpm": 3,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 4500,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "MEOWTH_GIGANTAMAX"
+    },
+    {
+     "pokemon": "ORBEETLE_GIGANTAMAX",
+     "cp": 86350,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "ORBEETLE_GIGANTAMAX"
+    },
+    {
+     "pokemon": "PIKACHU_GIGANTAMAX",
+     "cp": 37845,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 80000,
+      "cpm": 1.7,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 4500,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "MAX_BOSS_STATS"
+     },
+     "pokemonId": "PIKACHU_GIGANTAMAX"
+    },
+    {
+     "pokemon": "SANDACONDA_GIGANTAMAX",
+     "cp": 102243,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SANDACONDA_GIGANTAMAX"
+    },
+    {
+     "pokemon": "SNORLAX_GIGANTAMAX",
+     "cp": 87935,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SNORLAX_GIGANTAMAX"
+    },
+    {
+     "pokemon": "URSHIFU_RAPID_STRIKE_GIGANTAMAX",
+     "cp": 117869,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 100000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "URSHIFU_RAPID_STRIKE_GIGANTAMAX"
+    },
+    {
+     "pokemon": "URSHIFU_SINGLE_STRIKE_GIGANTAMAX",
+     "cp": 136952,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 135000,
+      "cpm": 0.7649999856948853,
+      "maxEnergyMultiplier": 15,
+      "maxEnergyDecimals": 2,
+      "targetMoveDelayMs": 5000,
+      "spreadMoveDelayMs": 2500,
+      "postMaxPhaseDelayMs": 500,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "URSHIFU_SINGLE_STRIKE_GIGANTAMAX"
+    }
+   ],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_4_MAX",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 20000,
+    "cpm": 0.6000000238418579,
+    "level": "35",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_4_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 480000,
+    "estimatedPlayers": 2,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [
+    {
+     "pokemon": "DURALUDON",
+     "cp": 50800,
+     "shiny": true,
+     "verified": false,
+     "minCp": 21552,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 20000,
+      "cpm": 0.6000000238418579,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "DURALUDON"
+    },
+    {
+     "pokemon": "TOXTRICITY",
+     "cp": 51537,
+     "shiny": false,
+     "verified": false,
+     "minCp": 17853,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 30000,
+      "cpm": 0.6000000238418579,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "TOXTRICITY"
+    }
+   ],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_4_MAX_FUTURE",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 20000,
+    "cpm": 0.6000000238418579,
+    "level": "35",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_4_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 480000,
+    "estimatedPlayers": 2,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_4_MAX_LEGACY",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 20000,
+    "cpm": 0.6000000238418579,
+    "level": "35",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_4_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 480000,
+    "estimatedPlayers": 2,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [
+    {
+     "pokemon": "TOXTRICITY",
+     "cp": 51537,
+     "shiny": false,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 30000,
+      "cpm": 0.6000000238418579,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "TOXTRICITY"
+    },
+    {
+     "pokemon": "TOXTRICITY_AMPED_FORM",
+     "cp": 51537,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 30000,
+      "cpm": 0.6000000238418579,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "TOXTRICITY_AMPED_FORM"
+    },
+    {
+     "pokemon": "TOXTRICITY_LOW_KEY_FORM",
+     "cp": 51537,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 30000,
+      "cpm": 0.6000000238418579,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "TOXTRICITY_LOW_KEY_FORM"
+    }
+   ],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_2_MAX",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 5600,
+    "cpm": 0.3799999952316284,
+    "level": "25",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_2_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 480000,
+    "estimatedPlayers": 1,
+    "soloable": true,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [
+    {
+     "pokemon": "DARUMAKA",
+     "cp": 12634,
+     "shiny": true,
+     "verified": false,
+     "minCp": 10130,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 5600,
+      "cpm": 0.3799999952316284,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "DARUMAKA"
+    },
+    {
+     "pokemon": "EEVEE",
+     "cp": 10114,
+     "shiny": true,
+     "verified": false,
+     "minCp": 8109,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 5600,
+      "cpm": 0.3799999952316284,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "EEVEE"
+    },
+    {
+     "pokemon": "FEEBAS",
+     "cp": 3292,
+     "shiny": true,
+     "verified": false,
+     "minCp": 3292,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 5600,
+      "cpm": 0.3799999952316284,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "FEEBAS"
+    },
+    {
+     "pokemon": "MACHOP",
+     "cp": 11202,
+     "shiny": true,
+     "verified": false,
+     "minCp": 8982,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 5600,
+      "cpm": 0.3799999952316284,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "MACHOP"
+    },
+    {
+     "pokemon": "SHUCKLE",
+     "cp": 4854,
+     "shiny": true,
+     "verified": false,
+     "minCp": 3892,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 5600,
+      "cpm": 0.3799999952316284,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "SHUCKLE"
+    },
+    {
+     "pokemon": "WAILMER",
+     "cp": 10294,
+     "shiny": true,
+     "verified": false,
+     "minCp": 8254,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 5600,
+      "cpm": 0.3799999952316284,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "WAILMER"
+    }
+   ],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_2_MAX_FUTURE",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 5600,
+    "cpm": 0.3799999952316284,
+    "level": "25",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_2_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 480000,
+    "estimatedPlayers": 1,
+    "soloable": true,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_2_MAX_LEGACY",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 5600,
+    "cpm": 0.3799999952316284,
+    "level": "25",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_2_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 480000,
+    "estimatedPlayers": 1,
+    "soloable": true,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [
+    {
+     "pokemon": "MACHOP",
+     "cp": 11202,
+     "shiny": true,
+     "verified": false,
+     "minCp": 0,
+     "remoteRaidType": "REMOTE_RAID_LIMITED",
+     "bossStats": {
+      "hp": 5600,
+      "cpm": 0.3799999952316284,
+      "maxEnergyMultiplier": 1,
+      "maxEnergyDecimals": 0,
+      "targetMoveDelayMs": 0,
+      "spreadMoveDelayMs": 0,
+      "postMaxPhaseDelayMs": 0,
+      "source": "TIER_DEFAULT"
+     },
+     "pokemonId": "MACHOP"
+    }
+   ],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_6_5_MAX_FUTURE",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 100000,
+    "cpm": 1.0299999713897705,
+    "level": "60",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_6_5_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 600000,
+    "estimatedPlayers": 20,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_6_5_MAX",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 100000,
+    "cpm": 1.0299999713897705,
+    "level": "60",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_6_5_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 600000,
+    "estimatedPlayers": 20,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  },
+  {
+   "type": "RAID_TYPE_RAID",
+   "tier": "RAID_LEVEL_6_5_MAX_LEGACY",
+   "remoteRaidType": "REMOTE_RAID_LIMITED",
+   "info": {
+    "hp": 100000,
+    "cpm": 1.0299999713897705,
+    "level": "60",
+    "eggURL": "//static.pokebattler.com/images/dynamax_raid.png",
+    "guessTier": "RAID_LEVEL_6_5_MAX",
+    "attackMultiplier": 1,
+    "defenseMultiplier": 1,
+    "staminaMultiplier": 1,
+    "combatTimeMs": 600000,
+    "estimatedPlayers": 20,
+    "soloable": false,
+    "superMega": false,
+    "statsSource": "FORMULAS"
+   },
+   "raids": [],
+   "attackMultiplier": 1,
+   "defenseMultiplier": 1,
+   "staminaMultiplier": 1,
+   "raidType": "RAID_TYPE_RAID"
+  }
+ ],
+ "dynamaxPokemon": [
+  "VENUSAUR",
+  "CHARIZARD",
+  "BLASTOISE",
+  "BUTTERFREE",
+  "RAICHU",
+  "ARCANINE",
+  "ALAKAZAM",
+  "MACHAMP",
+  "HAUNTER",
+  "GENGAR",
+  "KINGLER",
+  "HITMONLEE",
+  "HITMONCHAN",
+  "RHYDON",
+  "CHANSEY",
+  "GYARADOS",
+  "VAPOREON",
+  "JOLTEON",
+  "FLAREON",
+  "OMASTAR",
+  "KABUTOPS",
+  "ARTICUNO",
+  "ZAPDOS",
+  "MOLTRES",
+  "NOCTOWL",
+  "ESPEON",
+  "UMBREON",
+  "SHUCKLE",
+  "HITMONTOP",
+  "BLISSEY",
+  "RAIKOU",
+  "ENTEI",
+  "SUICUNE",
+  "LUGIA",
+  "HO_OH",
+  "GARDEVOIR",
+  "SABLEYE",
+  "WAILORD",
+  "FLYGON",
+  "MILOTIC",
+  "WALREIN",
+  "METAGROSS",
+  "REGIROCK",
+  "REGICE",
+  "REGISTEEL",
+  "LATIAS",
+  "LATIOS",
+  "VESPIQUEN",
+  "WEAVILE",
+  "RHYPERIOR",
+  "ELECTIVIRE",
+  "MAGMORTAR",
+  "LEAFEON",
+  "GLACEON",
+  "GALLADE",
+  "UXIE",
+  "MESPRIT",
+  "AZELF",
+  "UNFEZANT",
+  "GIGALITH",
+  "SWOOBAT",
+  "EXCADRILL",
+  "WHIMSICOTT",
+  "DARMANITAN",
+  "GARBODOR",
+  "CRYOGONAL",
+  "HYDREIGON",
+  "MEOWSTIC",
+  "MALAMAR",
+  "SYLVEON",
+  "TSAREENA",
+  "PASSIMIAN",
+  "DRAMPA",
+  "RILLABOOM",
+  "CINDERACE",
+  "INTELEON",
+  "GREEDENT",
+  "CORVIKNIGHT",
+  "DUBWOOL",
+  "HATTERENE",
+  "FALINKS",
+  "DURALUDON",
+  "ETERNATUS",
+  "TOXTRICITY_LOW_KEY_FORM",
+  "TOXTRICITY_AMPED_FORM",
+  "ZACIAN_CROWNED_SWORD_FORM",
+  "ZAMAZENTA_CROWNED_SHIELD_FORM",
+  "MEOWSTIC_FEMALE_FORM",
+  "VENUSAUR_GIGANTAMAX",
+  "CHARIZARD_GIGANTAMAX",
+  "BLASTOISE_GIGANTAMAX",
+  "MACHAMP_GIGANTAMAX",
+  "GENGAR_GIGANTAMAX",
+  "KINGLER_GIGANTAMAX",
+  "LAPRAS_GIGANTAMAX",
+  "SNORLAX_GIGANTAMAX",
+  "TOXTRICITY_AMPED_GIGANTAMAX",
+  "RILLABOOM_GIGANTAMAX",
+  "CINDERACE_GIGANTAMAX",
+  "INTELEON_GIGANTAMAX",
+  "TOXTRICITY_GIGANTAMAX"
+ ]
+}
diff --git a/test/support/max-boss-service.ts b/test/support/max-boss-service.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4e4dbe3eb1d4c30d7081bca45026de2cb45d9959
--- /dev/null
+++ b/test/support/max-boss-service.ts
@@ -0,0 +1,52 @@
+import { MAX_OPS } from '../../src/domain/pogo/max-bosses.js';
+import type { MaxTier } from '../../src/domain/pogo/max-tier.js';
+import type { FetchFeed } from '../../src/services/boss-feed-service.js';
+import { MaxBossService } from '../../src/services/max-boss-service.js';
+import { catalogueFixture } from './game-data.js';
+import { MAX_FEED_READ_AT, MAX_ZONE, readPokebattlerFeed } from './max-bosses.js';
+import { feedReply, MemoryBossStore } from './raid-bosses.js';
+import { createTestLogger } from './test-logger.js';
+
+/** `MemoryBossStore` of the max bosses. */
+export class MemoryMaxBossStore extends MemoryBossStore<MaxTier> {
+  constructor() {
+    super(MAX_OPS);
+  }
+}
+
+/**
+ * A real `MaxBossService` over `MemoryMaxBossStore`, nothing stored yet, its clock at the
+ * download of the Pokebattler fixture (`MAX_FEED_READ_AT`, `state.now`). The feed is not
+ * downloaded: `state.respond` answers the requests of `sync()` (by default the recorded feed);
+ * `restarted()` gives a loaded service over the same store, as after a restart.
+ */
+export async function maxBossServiceWith() {
+  const store = new MemoryMaxBossStore();
+  const { log, entries } = createTestLogger();
+  const state = {
+    now: MAX_FEED_READ_AT,
+    requests: 0,
+    respond: (() =>
+      Promise.resolve(feedReply(200, JSON.stringify(readPokebattlerFeed())))) as FetchFeed,
+  };
+  const make = async () => {
+    const service = new MaxBossService({
+      url: 'https://example.test/raids',
+      refreshMs: 360 * 60_000,
+      staleAfterMs: 48 * 60 * 60_000,
+      zone: MAX_ZONE,
+      store,
+      gameData: { catalogue: catalogueFixture() },
+      fetch: (url, init) => {
+        state.requests += 1;
+        return state.respond(url, init);
+      },
+      log,
+      now: () => state.now,
+    });
+    await service.load();
+    return service;
+  };
+  const service = await make();
+  return { service, store, state, logged: entries, restarted: make };
+}
diff --git a/test/support/max-bosses.ts b/test/support/max-bosses.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1f31ed33d6383c7e3ed0bbfe86e974a4f349af1e
--- /dev/null
+++ b/test/support/max-bosses.ts
@@ -0,0 +1,43 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+import { DateTime } from 'luxon';
+
+const fixtures = path.resolve(import.meta.dirname, '../fixtures');
+
+/**
+ * Pokebattler's `GET https://fight.pokebattler.com/raids` as downloaded on 2026-10-20 at 21:54
+ * (America/New_York), trimmed to every max tier with its `_FUTURE` and `_LEGACY` twins, the raid
+ * tier `RAID_LEVEL_5` and `dynamaxPokemon`; every entry kept as the feed had it. Today's max
+ * bosses: 36 of `RAID_LEVEL_1_MAX`, 6 of `_2_MAX`, 13 of `_3_MAX`, 2 of `_4_MAX` (Duraludon,
+ * Toxtricity) and 3 of `_5_MAX` (Azelf, Mesprit, Uxie, upcoming from 2026-10-24T21:00Z), none of
+ * `RAID_LEVEL_6_MAX`.
+ */
+export function readPokebattlerFeed(): unknown {
+  return JSON.parse(readFileSync(path.join(fixtures, 'pokebattler-raids.json'), 'utf8'));
+}
+
+/** The zone of the test settings. */
+export const MAX_ZONE = 'America/New_York';
+
+/** When the Pokebattler fixture was downloaded. */
+export const MAX_FEED_READ_AT = DateTime.fromISO('2026-10-20T21:54', { zone: MAX_ZONE }).toMillis();
+
+/** A time of the test zone, as epoch ms: `at('2026-10-24T14:00')`. */
+export function at(local: string): number {
+  return DateTime.fromISO(local, { zone: MAX_ZONE }).toMillis();
+}
+
+/** A feed of Pokebattler's shape with these tiers, each a list of entries (`pokemonId` given). */
+export function pokebattlerFeed(tiers: Record<string, Record<string, unknown>[]>): unknown {
+  return {
+    tiers: Object.entries(tiers).map(([tier, raids]) => ({
+      tier,
+      raids: raids.map((raid) => ({
+        pokemon: raid['pokemonId'],
+        shiny: false,
+        verified: false,
+        ...raid,
+      })),
+    })),
+  };
+}
diff --git a/test/support/raid-bosses.ts b/test/support/raid-bosses.ts
index f7a5277567d03ed456686e21c4bbcf62d973acac..7c85a28060621e797bf55fdef720569332e6e3f0 100644
--- a/test/support/raid-bosses.ts
+++ b/test/support/raid-bosses.ts
@@ -1,15 +1,18 @@
 import { readFileSync } from 'node:fs';
 import path from 'node:path';
-import type { RaidBossStore, StoredBoss } from '../../src/db/repositories/raid-boss-repository.js';
+import type { BossStore, StoredBoss } from '../../src/db/repositories/raid-boss-repository.js';
 import { feedLookup } from '../../src/domain/pogo/feed-lookup.js';
 import { parseRaidBossFeed, type FeedBoss } from '../../src/domain/pogo/raid-boss-feed.js';
 import {
   autosetBoss,
   effectiveBosses,
-  replacesOverride,
+  RAID_OPS,
+  replacesOverrideIn,
+  type BossFamilyOps,
   type BossOverride,
   type NewBossOverride,
 } from '../../src/domain/pogo/raid-bosses.js';
+import type { RaidTier } from '../../src/domain/pogo/raid-tier.js';
 import { sameRaidTier } from '../../src/domain/pogo/raid-tier.js';
 import {
   RaidBossService,
@@ -29,43 +32,47 @@ export function readRaidBossFeed(): unknown {
   return JSON.parse(readFileSync(path.join(fixtures, 'raid-boss-feed.json'), 'utf8'));
 }
 
-function identity(boss: FeedBoss): string {
-  return `${boss.pokemonId}|${boss.form ?? ''}|${boss.tier.level}|${String(boss.tier.shadow)}`;
-}
-
 /**
- * A `RaidBossStore` kept in memory, for tests of the service's own logic. It follows
- * `RaidBossRepository`, whose behaviour raid-boss-repository.db.test.ts pins down. Set `failing`
+ * A `BossStore` of one family kept in memory, for tests of a boss service's own logic. It follows
+ * `RaidBossRepository` and `MaxBossRepository`, whose behaviour raid-boss-repository.db.test.ts
+ * pins down (an upcoming boss stored from its start included). Set `failing`
  * to make every call reject, or put method names in `failingMethods` to make only those reject
  * (with `<method> failed`). `beforeListOverrides` runs after `listOverrides` has taken its
  * snapshot and before it returns, so a test can hold a read back and let a later one overtake it.
  */
-export class MemoryRaidBossStore implements RaidBossStore {
+export class MemoryBossStore<T> implements BossStore<T> {
   failing: Error | undefined;
   failingMethods = new Set<string>();
   beforeListOverrides: (() => Promise<void>) | undefined;
-  private rows: (StoredBoss & { active: boolean })[] = [];
-  private stored: BossOverride[] = [];
+  private rows: (StoredBoss<T> & { active: boolean })[] = [];
+  private stored: BossOverride<T>[] = [];
   private nextId = 1;
 
+  constructor(private readonly ops: Pick<BossFamilyOps<T>, 'slot' | 'sameTier'>) {}
+
+  private identity(boss: FeedBoss<T>): string {
+    return `${boss.pokemonId}|${boss.form ?? ''}|${this.ops.slot(boss.tier)}`;
+  }
+
   private check(method: string): void {
     if (this.failing) throw this.failing;
     if (this.failingMethods.has(method)) throw new Error(`${method} failed`);
   }
 
-  listActive(): Promise<StoredBoss[]> {
+  listActive(): Promise<StoredBoss<T>[]> {
     return this.attempt('listActive', () =>
       this.rows.filter((row) => row.active).map(({ active: _active, ...boss }) => ({ ...boss })),
     );
   }
 
-  replaceFeed(bosses: readonly FeedBoss[], now: number): Promise<void> {
+  replaceFeed(bosses: readonly FeedBoss<T>[], now: number): Promise<void> {
     return this.attempt('replaceFeed', () => {
+      const from = (boss: FeedBoss<T>): number => Math.max(now, boss.startsAt ?? now);
       const listed = new Set<string>();
       for (const boss of bosses) {
-        if (listed.has(identity(boss))) continue;
-        listed.add(identity(boss));
-        const row = this.rows.find((candidate) => identity(candidate) === identity(boss));
+        if (listed.has(this.identity(boss))) continue;
+        listed.add(this.identity(boss));
+        const row = this.rows.find((candidate) => this.identity(candidate) === this.identity(boss));
         if (row) {
           delete row.image;
           Object.assign(row, {
@@ -73,14 +80,15 @@ export class MemoryRaidBossStore implements RaidBossStore {
             name: boss.name,
             ...(boss.image === undefined ? {} : { image: boss.image }),
             lastSeen: now,
-            firstSeen: row.active ? row.firstSeen : now,
+            firstSeen: row.active && row.firstSeen <= now ? row.firstSeen : from(boss),
             active: true,
           });
         } else {
-          this.rows.push({ ...boss, firstSeen: now, lastSeen: now, active: true });
+          const { startsAt: _startsAt, ...kept } = boss;
+          this.rows.push({ ...kept, firstSeen: from(boss), lastSeen: now, active: true });
         }
       }
-      for (const row of this.rows) if (!listed.has(identity(row))) row.active = false;
+      for (const row of this.rows) if (!listed.has(this.identity(row))) row.active = false;
     });
   }
 
@@ -97,7 +105,7 @@ export class MemoryRaidBossStore implements RaidBossStore {
     });
   }
 
-  async listOverrides(): Promise<BossOverride[]> {
+  async listOverrides(): Promise<BossOverride<T>[]> {
     const snapshot = await this.attempt('listOverrides', () =>
       this.stored.map((override) => ({ ...override })),
     );
@@ -105,9 +113,9 @@ export class MemoryRaidBossStore implements RaidBossStore {
     return snapshot;
   }
 
-  saveOverride(override: NewBossOverride, now: number): Promise<BossOverride> {
+  saveOverride(override: NewBossOverride<T>, now: number): Promise<BossOverride<T>> {
     return this.attempt('saveOverride', () => {
-      this.stored = this.stored.filter((other) => !replacesOverride(override, other));
+      this.stored = this.stored.filter((other) => !replacesOverrideIn(this.ops, override, other));
       const saved = { ...override, id: this.nextId++, createdAt: now };
       this.stored.push(saved);
       return { ...saved };
@@ -142,6 +150,13 @@ export class MemoryRaidBossStore implements RaidBossStore {
   }
 }
 
+/** `MemoryBossStore` of the raid bosses. */
+export class MemoryRaidBossStore extends MemoryBossStore<RaidTier> {
+  constructor() {
+    super(RAID_OPS);
+  }
+}
+
 /** The boss list of the downloaded feed against the game-data fixture, with these overrides. */
 export function raidBossesFixture(overrides: readonly BossOverride[] = []): RaidBossProvider {
   const feed = parseRaidBossFeed(readRaidBossFeed(), feedLookup(catalogueFixture())).bosses;
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index fc62c0ef67d53ca9c7ffe9cac143bad7164dedb7..e43192942b66cd963cf2e3d27f95de057ec2b284 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -31,6 +31,7 @@ import { FakeIssues } from './issues.js';
 import { FakePokebattler } from './pokebattler.js';
 import { FakePlaces } from './places.js';
 import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
+import { NO_MAX_BOSSES } from '../../src/services/max-boss-service.js';
 import { raidBossesFixture } from './raid-bosses.js';
 import { raidEventsFixture } from './raid-events.js';
 import { selfRolesWith } from './roles.js';
@@ -82,6 +83,10 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       'raidBossAdmin',
       'pass { raidBosses: service, raidBossAdmin: service } from raidBossServiceWith()',
     ),
+    // Max battles are off, as in the test settings, unless a test passes
+    // { maxBosses: service, maxBossAdmin: service } from maxBossServiceWith().
+    maxBosses: NO_MAX_BOSSES,
+    maxBossAdmin: undefined,
     raidEvents: raidEventsFixture(),
     gyms: gymsFixture(),
     gymAdmin: unavailable<GymAdminService>(
````

### Task 3: 8X-2 task 3: max events, the featured boss and the order of the list

Prototype commit: `72b811e725c99cf24a6e3a39f8771fb7f5a0d37c`

The max events of ScrapedDuck's events feed (max-mondays, max-battles)
are read by parseMaxEventFeed, kept apart from the raid events: their
own hours always, short (one day, under 6 hours: a Max Battle Day) or
all day (a Max Monday, a weekend on from start to end, nights
included), and the bosses the name features (Dynamax or Gigantamax,
"during Max Monday", "Max Battle Day", "Max Battle Weekend"). An event
without hours whose id carries a date takes the clock times of the
nearest event of its kind on that date (Sneasel's Max Monday is 06:00 to
21:00 on 2026-10-19), logged once a read; one that cannot is left out,
with a warning when its date is today or later. RaidEventService keeps
them (maxEvents()). maxEventAt(events, time) gives the event on at a
time with its kind and hours, for 8X-3's default end.

featuredAt: a Max Battle Day's bosses during its hours, first; the week's
Max Monday boss from its start until the next Max Monday or 7 days.
maxBossChoices: the featured bosses (names read by the Pokemon search,
found on the list in the event's kind), then 5 stars down to 1 and
Gigantamax, each worded with its tier; currentMaxBossChoices puts them
together for 8X-3. typedMaxBoss: a typed Pokemon's listed bosses and the
other tiers the game master lets it battle in.

**Files:**

```
 src/domain/pogo/max-boss-list.test.ts   | 236 +++++++++++++++++++++++++++++++++++++++++
 src/domain/pogo/max-boss-list.ts        | 117 +++++++++++++++++++++
 src/domain/pogo/max-bosses.ts           |  23 +++-
 src/domain/pogo/raid-bosses.ts          |   6 +-
 src/domain/time/max-events.test.ts      | 295 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/time/max-events.ts           | 248 +++++++++++++++++++++++++++++++++++++++++++
 src/domain/time/raid-events.ts          |  26 +++--
 src/services/max-boss-service.test.ts   |  66 ++++++++++++
 src/services/max-boss-service.ts        |  70 ++++++++++++-
 src/services/raid-event-service.test.ts | 128 +++++++++++++++++++++++
 src/services/raid-event-service.ts      |  81 ++++++++++++++-
 test/fixtures/max-events.json           | 146 ++++++++++++++++++++++++++
 test/support/max-events.ts              |  14 +++
 13 files changed, 1439 insertions(+), 17 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/pogo/max-boss-list.test.ts src/domain/time/max-events.test.ts src/services/max-boss-service.test.ts src/services/raid-event-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 72b811e725c99cf24a6e3a39f8771fb7f5a0d37c -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-2 task 3: max events, the featured boss and the order of the list`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/pogo/max-boss-list.test.ts b/src/domain/pogo/max-boss-list.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8cf94e9e9ebb14671ec5263d759e0dd349dd5405
--- /dev/null
+++ b/src/domain/pogo/max-boss-list.test.ts
@@ -0,0 +1,236 @@
+import { DateTime } from 'luxon';
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import {
+  at,
+  MAX_FEED_READ_AT,
+  MAX_ZONE,
+  readPokebattlerFeed,
+} from '../../../test/support/max-bosses.js';
+import { readMaxEventFeed } from '../../../test/support/max-events.js';
+import { pokemonFixture } from '../../../test/support/providers.js';
+import { featuredAt, parseMaxEventFeed } from '../time/max-events.js';
+import { maxBossChoices, typedMaxBoss } from './max-boss-list.js';
+import { comingMaxBosses, maxBossesAt, parseMaxBossFeed, type MaxBoss } from './max-bosses.js';
+import type { MaxTier } from './max-tier.js';
+
+const catalogue = catalogueFixture();
+const pokemon = pokemonFixture();
+const exact = (text: string) => pokemon.exact(text);
+const events = parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events;
+const stored = parseMaxBossFeed(readPokebattlerFeed(), catalogue, {
+  now: MAX_FEED_READ_AT,
+  zone: MAX_ZONE,
+}).bosses.map((boss) => ({ ...boss, firstSeen: Math.max(MAX_FEED_READ_AT, boss.startsAt ?? 0) }));
+/** The recorded bosses in effect at `time`, with a Gigantamax Machamp added as staff would. */
+const bossesAt = (time: number): MaxBoss[] =>
+  maxBossesAt(
+    stored,
+    [
+      {
+        id: 1,
+        action: 'add',
+        pokemonId: 'MACHAMP',
+        form: null,
+        tier: 'G',
+        shiny: false,
+        expiresAt: null,
+        createdBy: '123456789012345678',
+        createdAt: MAX_FEED_READ_AT,
+      },
+    ],
+    catalogue,
+    time,
+  );
+const choicesAt = (time: number) =>
+  maxBossChoices(bossesAt(time), featuredAt(events, time, MAX_ZONE), exact);
+
+describe('maxBossChoices', () => {
+  it('lists 5 stars down to 1 and Gigantamax last, each choice saying its tier', () => {
+    const choices = choicesAt(at('2026-10-24T09:00')).filter((choice) => !choice.featured);
+    const tiers = choices.map((choice) => choice.boss.tier);
+    const order: MaxTier[] = ['D5', 'D4', 'D3', 'D2', 'D1', 'G'];
+    expect([...tiers].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(tiers);
+    expect(choices.slice(0, 5).map((choice) => choice.name)).toEqual([
+      'Azelf · Dynamax 5★',
+      'Mesprit · Dynamax 5★',
+      'Uxie · Dynamax 5★',
+      'Duraludon · Dynamax 4★',
+      'Toxtricity · Dynamax 4★',
+    ]);
+    expect(choices.at(-1)?.name).toBe('Gigantamax Machamp');
+  });
+
+  it('gives Machamp the 2-star Dynamax and Gigantamax Machamp as two choices', () => {
+    const machamp = choicesAt(at('2026-10-21T12:00')).filter(
+      (choice) => choice.boss.key === 'machamp',
+    );
+    expect(machamp.map((choice) => choice.name)).toEqual(['Gigantamax Machamp']);
+    const list = bossesAt(at('2026-10-21T12:00'));
+    const gigantamax = list.filter((boss) => boss.key === 'machamp');
+    const dynamax = gigantamax.map((boss): MaxBoss => ({ ...boss, tier: 'D2' }));
+    const withD2 = maxBossChoices([...list, ...dynamax], [], exact).filter(
+      (choice) => choice.boss.key === 'machamp',
+    );
+    expect(withD2.map((choice) => choice.name)).toEqual([
+      'Machamp · Dynamax 2★',
+      'Gigantamax Machamp',
+    ]);
+  });
+
+  it("puts the week's Max Monday boss first", () => {
+    const [first, second] = choicesAt(at('2026-10-21T12:00'));
+    expect(first).toMatchObject({ name: 'Sneasel · Dynamax 1★', featured: true });
+    expect(second?.featured).toBe(false);
+    // The boss is not listed a second time.
+    expect(
+      choicesAt(at('2026-10-21T12:00')).filter((choice) => choice.boss.key === 'sneasel'),
+    ).toHaveLength(1);
+  });
+
+  it("puts a Max Battle Day's bosses first during its hours, then the week's boss", () => {
+    const featured = choicesAt(at('2026-10-24T15:00')).filter((choice) => choice.featured);
+    expect(featured.map((choice) => choice.name)).toEqual([
+      'Uxie · Dynamax 5★',
+      'Mesprit · Dynamax 5★',
+      'Azelf · Dynamax 5★',
+      'Sneasel · Dynamax 1★',
+    ]);
+    expect(
+      choicesAt(at('2026-10-24T17:00'))
+        .filter((choice) => choice.featured)
+        .map((choice) => choice.name),
+    ).toEqual(['Sneasel · Dynamax 1★']);
+  });
+
+  it('features nothing it cannot find on the list: a Gigantamax day features no Dynamax boss', () => {
+    const giga = parseMaxEventFeed(
+      [
+        {
+          eventType: 'max-battles',
+          name: 'Gigantamax Machamp Max Battle Day',
+          start: '2026-10-21T14:00:00.000',
+          end: '2026-10-21T17:00:00.000',
+        },
+        {
+          eventType: 'max-battles',
+          name: 'Dynamax Missingno Max Battle Day',
+          start: '2026-10-21T14:00:00.000',
+          end: '2026-10-21T17:00:00.000',
+        },
+      ],
+      MAX_ZONE,
+    ).events;
+    const time = at('2026-10-21T15:00');
+    const featured = maxBossChoices(bossesAt(time), featuredAt(giga, time, MAX_ZONE), exact).filter(
+      (choice) => choice.featured,
+    );
+    expect(featured.map((choice) => choice.name)).toEqual(['Gigantamax Machamp']);
+  });
+
+  it('offers an upcoming boss its featured event names from the event on, east of UTC too', () => {
+    const TOKYO = 'Asia/Tokyo';
+    const tokyo = (local: string) => DateTime.fromISO(local, { zone: TOKYO }).toMillis();
+    const parsed = parseMaxBossFeed(readPokebattlerFeed(), catalogue, {
+      now: MAX_FEED_READ_AT,
+      zone: TOKYO,
+    }).bosses.map((boss) => ({ ...boss, firstSeen: boss.startsAt ?? MAX_FEED_READ_AT }));
+    // Pokebattler's start (21:00Z) is the next morning in Tokyo, after the event.
+    const lake = parsed.filter((boss) => boss.tier === 'D5');
+    expect(lake.map((boss) => boss.firstSeen)).toEqual(Array(3).fill(tokyo('2026-10-25T00:00')));
+    const time = tokyo('2026-10-24T15:00');
+    const tokyoEvents = parseMaxEventFeed(readMaxEventFeed(), TOKYO).events;
+    const choices = maxBossChoices(
+      maxBossesAt(parsed, [], catalogue, time),
+      featuredAt(tokyoEvents, time, TOKYO),
+      exact,
+      { coming: comingMaxBosses(parsed, [], catalogue, time), time, catalogue },
+    );
+    expect(choices.filter((choice) => choice.featured).map((choice) => choice.name)).toEqual([
+      'Uxie · Dynamax 5★',
+      'Mesprit · Dynamax 5★',
+      'Azelf · Dynamax 5★',
+      'Sneasel · Dynamax 1★',
+    ]);
+    // Before the event they are not offered.
+    const before = tokyo('2026-10-24T13:59');
+    expect(
+      maxBossChoices(
+        maxBossesAt(parsed, [], catalogue, before),
+        featuredAt(tokyoEvents, before, TOKYO),
+        exact,
+        { coming: comingMaxBosses(parsed, [], catalogue, before), time: before, catalogue },
+      ).some((choice) => choice.boss.key === 'uxie'),
+    ).toBe(false);
+  });
+
+  it('offers a Gigantamax boss its event names during the event, though the feed lists none', () => {
+    const day = (name: string) => ({
+      eventType: 'max-battles',
+      name,
+      start: '2026-10-21T14:00:00.000',
+      end: '2026-10-21T17:00:00.000',
+    });
+    const giga = parseMaxEventFeed(
+      [
+        day('Gigantamax Kingler Max Battle Day'),
+        day('Gigantamax Sneasel Max Battle Day'),
+        day('Dynamax Kingler Max Battle Day'),
+      ],
+      MAX_ZONE,
+    ).events;
+    const choose = (time: number) =>
+      maxBossChoices(bossesAt(time), featuredAt(giga, time, MAX_ZONE), exact, {
+        coming: [],
+        time,
+        catalogue,
+      }).filter((choice) => choice.featured);
+    const during = choose(at('2026-10-21T15:00'));
+    // Sneasel has no Gigantamax form, and a Dynamax boss off the list has no known tier.
+    expect(during.map((choice) => [choice.name, choice.boss.tier, choice.boss.source])).toEqual([
+      ['Gigantamax Kingler', 'G', 'event'],
+    ]);
+    expect(choose(at('2026-10-21T17:00'))).toEqual([]);
+    // Staff hid Gigantamax Kingler: the event does not bring it back.
+    const time = at('2026-10-21T15:00');
+    const hidden = maxBossChoices(bossesAt(time), featuredAt(giga, time, MAX_ZONE), exact, {
+      coming: [],
+      time,
+      catalogue,
+      hidden: [{ key: 'kingler', tier: 'G' }],
+    });
+    expect(hidden.some((choice) => choice.boss.key === 'kingler')).toBe(false);
+  });
+});
+
+describe('typedMaxBoss', () => {
+  const now = at('2026-10-21T12:00');
+  const entry = (key: string) => {
+    const found = catalogue.byKey(key);
+    if (!found) throw new Error(key);
+    return found;
+  };
+
+  it('is the list’s bosses of a Pokémon on it, and the tiers the game master allows beyond', () => {
+    const machop = typedMaxBoss(entry('machop'), bossesAt(now), catalogue);
+    expect(machop.listed.map((boss) => boss.tier)).toEqual(['D2']);
+    expect(machop.others).toEqual(['D1', 'D3', 'D4', 'D5']);
+    const machamp = typedMaxBoss(entry('machamp'), bossesAt(now), catalogue);
+    expect(machamp.listed.map((boss) => boss.tier)).toEqual(['G']);
+    expect(machamp.others).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
+  });
+
+  it('is the tiers to ask for a Pokémon off the list the game master lets battle', () => {
+    expect(typedMaxBoss(entry('kingler'), bossesAt(now), catalogue)).toEqual({
+      listed: [],
+      others: ['D1', 'D2', 'D3', 'D4', 'D5', 'G'],
+    });
+  });
+
+  it('is nothing for a Pokémon that is no max boss', () => {
+    expect(typedMaxBoss(entry('rattata'), bossesAt(now), catalogue)).toEqual({
+      listed: [],
+      others: [],
+    });
+  });
+});
diff --git a/src/domain/pogo/max-boss-list.ts b/src/domain/pogo/max-boss-list.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d589d562f861b571a872e069247ba1309f0400a0
--- /dev/null
+++ b/src/domain/pogo/max-boss-list.ts
@@ -0,0 +1,117 @@
+import type { PokemonCatalogue } from './catalogue.js';
+import { bossIdsOf } from './feed-lookup.js';
+import type { PokemonEntry } from './game-master.js';
+import type { MaxEvent } from '../time/max-events.js';
+import type { MaxBoss } from './max-bosses.js';
+import { maxBossChoiceName, MAX_TIERS, type MaxTier } from './max-tier.js';
+
+/** A max boss as `/max` offers it (plan 8X-3 builds the command). */
+export interface MaxBossChoice {
+  boss: MaxBoss;
+  /** The choice's words: `Machamp · Dynamax 2★`, `Gigantamax Machamp` (`maxBossChoiceName`). */
+  name: string;
+  /** Listed first as the boss of an event that is featured now (`featuredAt`). */
+  featured: boolean;
+}
+
+/** The order of the list after the featured bosses: 5 stars down to 1, Gigantamax last. */
+const LIST_ORDER: readonly MaxTier[] = ['D5', 'D4', 'D3', 'D2', 'D1', 'G'];
+
+const choice = (boss: MaxBoss, featured: boolean): MaxBossChoice => ({
+  boss,
+  name: maxBossChoiceName(boss.name, boss.tier),
+  featured,
+});
+
+/**
+ * The current max bosses as `/max`'s boss choice will offer them (design section 3.2): first the
+ * bosses of the events featured now (`featured`, in its order: a Max Battle Day's, then the
+ * week's Max Monday's), each name of the event read through the Pokémon search (`exact`) and
+ * found on the list in the event's kind (Dynamax or Gigantamax), higher tiers first; then every
+ * other boss from 5 stars down to 1 and Gigantamax last, by name within a tier (`bosses` is the
+ * list in effect, by tier and name). A boss is offered once; the Dynamax and the Gigantamax
+ * battle of one Pokémon are two choices. With `extras`:
+ * - an upcoming boss (`coming`, `comingMaxBosses`) that a featured event names is featured too,
+ *   from the event's start (east of UTC its stored start comes after the event);
+ * - during a featured event's own hours (`time`), a Gigantamax boss it names that the game master
+ *   lets battle as Gigantamax (`catalogue`) and the feed does not list is offered as featured
+ *   with the tier G (`source` `event`; the coordinator's call, Q-A, pending Matt), unless staff
+ *   hid it at G (`hidden`: the keys and tiers that hide overrides in force take off). Not a
+ *   Dynamax boss off the list: its stars are unknown.
+ * Otherwise a featured name the search does not find, or whose boss is not on the list, features
+ * nothing (it can still be typed: `typedMaxBoss`).
+ */
+export function maxBossChoices(
+  bosses: readonly MaxBoss[],
+  featured: readonly { event: MaxEvent }[],
+  exact: (text: string) => PokemonEntry | undefined,
+  extras: {
+    coming?: readonly MaxBoss[];
+    time?: number;
+    catalogue?: Pick<PokemonCatalogue, 'canGigantamax'>;
+    hidden?: readonly { key: string; tier: MaxTier }[];
+  } = {},
+): MaxBossChoice[] {
+  const sorted = (list: readonly MaxBoss[]): MaxBoss[] =>
+    [...list].sort((a, b) => LIST_ORDER.indexOf(a.tier) - LIST_ORDER.indexOf(b.tier));
+  const byOrder = sorted(bosses);
+  const coming = sorted(extras.coming ?? []);
+  const first: MaxBoss[] = [];
+  const add = (boss: MaxBoss): void => {
+    if (!first.some((one) => one.key === boss.key && one.tier === boss.tier)) first.push(boss);
+  };
+  for (const { event } of featured) {
+    if (!event.featured) continue;
+    const { gigantamax, names } = event.featured;
+    const during =
+      extras.time !== undefined && event.start <= extras.time && extras.time < event.end;
+    for (const name of names) {
+      const entry = exact(name);
+      if (!entry) continue;
+      const ofKind = (boss: MaxBoss): boolean =>
+        boss.entry?.key === entry.key && (boss.tier === 'G') === gigantamax;
+      for (const boss of [...byOrder, ...coming]) if (ofKind(boss)) add(boss);
+      const offList = ![...byOrder, ...coming].some(ofKind);
+      const hidden = (extras.hidden ?? []).some((one) => one.key === entry.key && one.tier === 'G');
+      if (gigantamax && during && offList && !hidden && extras.catalogue?.canGigantamax(entry)) {
+        add({
+          key: entry.key,
+          ...bossIdsOf(entry),
+          tier: 'G',
+          shiny: false,
+          name: entry.name,
+          entry,
+          source: 'event',
+          autoset: false,
+        });
+      }
+    }
+  }
+  const inFirst = (boss: MaxBoss): boolean =>
+    first.some((one) => one.key === boss.key && one.tier === boss.tier);
+  return [
+    ...first.map((boss) => choice(boss, true)),
+    ...byOrder.filter((boss) => !inFirst(boss)).map((boss) => choice(boss, false)),
+  ];
+}
+
+/**
+ * What a Pokémon typed as a max boss can be (design sections 2 and 3.2): the list's bosses of
+ * it (`listed`, whose tier is known), and the other tiers the game master lets it battle in
+ * (`others`: D1 to D5 where it can be a Dynamax boss, G where it can be a Gigantamax one), which
+ * `/max` asks for when it is typed off the list. Both empty: it is no max boss.
+ */
+export function typedMaxBoss(
+  entry: PokemonEntry,
+  bosses: readonly MaxBoss[],
+  catalogue: Pick<PokemonCatalogue, 'canDynamax' | 'canGigantamax'>,
+): { listed: MaxBoss[]; others: MaxTier[] } {
+  const listed = bosses.filter((boss) => boss.entry?.key === entry.key);
+  const allowed = MAX_TIERS.filter((tier) =>
+    tier === 'G' ? catalogue.canGigantamax(entry) : catalogue.canDynamax(entry),
+  );
+  return {
+    listed,
+    others: allowed.filter((tier) => !listed.some((boss) => boss.tier === tier)),
+  };
+}
diff --git a/src/domain/pogo/max-bosses.ts b/src/domain/pogo/max-bosses.ts
index 519a1a95809e93e50561be2f461aa7322783daa2..7f614a6c19879439128c47c349f36abdca9167cf 100644
--- a/src/domain/pogo/max-bosses.ts
+++ b/src/domain/pogo/max-bosses.ts
@@ -106,7 +106,11 @@ function isRecord(value: unknown): value is Record<string, unknown> {
  * When an upcoming boss is a boss from: the start of the day of its `startDate` in `zone`, when
  * that is after `now`. Pokebattler gives one instant for an event the game holds at a local hour
  * everywhere (the lake trio's Max Battle Day of 14:00 to 17:00 on 2026-10-24 is
- * `2026-10-24T21:00Z`, 17:00 in New York), so its day is what can be relied on.
+ * `2026-10-24T21:00Z`, 17:00 in New York), so its day is what can be relied on. West of UTC
+ * that day holds the event; east of it (Tokyo: 06:00 on the 25th) the day comes after the
+ * event, so a boss a featured max event names is offered from that event's start as well
+ * (`comingMaxBosses`, `maxBossChoices`). An upcoming boss no event names, in a zone whose day
+ * of the instant is later than the game's, is offered a day late: the rest of the cases.
  */
 function startOf(raid: Record<string, unknown>, now: number, zone: string): number | undefined {
   const start = raid['startDate'];
@@ -219,6 +223,23 @@ export function maxBossesAt(
   return familyBosses(MAX_OPS, begun, overrides, catalogue, now);
 }
 
+/**
+ * The stored feed's bosses whose start has not come at `now` (upcoming ones), with the max
+ * overrides that hide one or set its shiny flag applied (an added boss is in `maxBossesAt`
+ * already). `maxBossChoices` offers one that a max event on now features (a zone east of UTC
+ * sees the lake trio's Max Battle Day before the day of Pokebattler's start begins there).
+ */
+export function comingMaxBosses(
+  feed: readonly (MaxFeedBoss & { firstSeen: number })[],
+  overrides: readonly MaxBossOverride[],
+  catalogue: PokemonCatalogue,
+  now: number,
+): MaxBoss[] {
+  const coming = feed.filter((boss) => boss.firstSeen > now);
+  const kept = overrides.filter((one) => one.action === 'hide' || one.action === 'shiny');
+  return familyBosses(MAX_OPS, coming, kept, catalogue, now);
+}
+
 /**
  * What is wrong with a max override a moderator asked for; undefined when it can be stored. As
  * for a raid override (`overrideProblem`), and: every override names a max tier (one without is
diff --git a/src/domain/pogo/raid-bosses.ts b/src/domain/pogo/raid-bosses.ts
index f56976825e85cab18f03c9d7cc8390b8cb5e6736..21de88bc5e2cd369c7001772c0306a492f967ee4 100644
--- a/src/domain/pogo/raid-bosses.ts
+++ b/src/domain/pogo/raid-bosses.ts
@@ -67,7 +67,11 @@ export interface Boss<T = RaidTier> extends BossIds {
   name: string;
   /** Undefined for a Pokémon the game master does not know yet. */
   entry: PokemonEntry | undefined;
-  source: 'feed' | 'override';
+  /**
+   * `event`: only a max boss, a Gigantamax boss a featured max event names that the feed does
+   * not list, offered during the event (`maxBossChoices`).
+   */
+  source: 'feed' | 'override' | 'event';
   /** A moderator chose this boss as what eggs of its tier hatch as. */
   autoset: boolean;
   /**
diff --git a/src/domain/time/max-events.test.ts b/src/domain/time/max-events.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3698e83cdfa1a720e71aa9da91d8e339e2bd8f30
--- /dev/null
+++ b/src/domain/time/max-events.test.ts
@@ -0,0 +1,295 @@
+import { describe, expect, it } from 'vitest';
+import { at, MAX_ZONE } from '../../../test/support/max-bosses.js';
+import { readMaxEventFeed } from '../../../test/support/max-events.js';
+import {
+  featuredAt,
+  featuredNames,
+  maxEventAt,
+  parseMaxEventFeed,
+  type MaxEvent,
+} from './max-events.js';
+
+const recorded = parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE);
+const named = (name: string): MaxEvent => {
+  const found = recorded.events.find((event) => event.name === name);
+  if (!found) throw new Error(`no event ${name}`);
+  return found;
+};
+
+describe('featuredNames', () => {
+  it('reads the bosses a Max Monday, a Max Battle Day or Weekend names', () => {
+    expect(featuredNames('Dynamax Sneasel during Max Monday')).toEqual({
+      gigantamax: false,
+      names: ['Sneasel'],
+    });
+    expect(featuredNames('Dynamax Uxie, Mesprit, and Azelf Max Battle Day')).toEqual({
+      gigantamax: false,
+      names: ['Uxie', 'Mesprit', 'Azelf'],
+    });
+    expect(featuredNames('Dynamax Lugia Max Battle Weekend')?.names).toEqual(['Lugia']);
+    expect(featuredNames('Gigantamax Machamp Max Battle Day')).toEqual({
+      gigantamax: true,
+      names: ['Machamp'],
+    });
+    expect(featuredNames('Dynamax Latios & Latias Max Battle Day')?.names).toEqual([
+      'Latios',
+      'Latias',
+    ]);
+  });
+
+  it('reads nothing from a name that names no boss', () => {
+    expect(featuredNames('Max Monday: Pokémon to be announced')).toBeUndefined();
+    expect(featuredNames('Dynamax Trails')).toBeUndefined();
+    expect(featuredNames('Max Battle Day')).toBeUndefined();
+  });
+});
+
+describe('parseMaxEventFeed: the recorded feed', () => {
+  it('keeps the Max Mondays and Max Battle Days, and no other kind', () => {
+    expect(recorded.events.map((event) => [event.kind, event.name])).toEqual([
+      ['max-monday', 'Dynamax Sneasel during Max Monday'],
+      ['max-battle', 'Dynamax Uxie, Mesprit, and Azelf Max Battle Day'],
+      ['max-monday', 'Dynamax Sableye during Max Monday'],
+      ['max-monday', 'Dynamax Machop during Max Monday'],
+      ['max-monday', 'Max Monday: Pokémon to be announced'],
+      ['max-monday', 'Dynamax Espurr during Max Monday'],
+      ['max-monday', 'Dynamax Cryogonal during Max Monday'],
+    ]);
+  });
+
+  it("takes the feed's own hours: a Max Battle Day is short, a Max Monday all day", () => {
+    expect(named('Dynamax Uxie, Mesprit, and Azelf Max Battle Day')).toEqual({
+      kind: 'max-battle',
+      name: 'Dynamax Uxie, Mesprit, and Azelf Max Battle Day',
+      start: at('2026-10-24T14:00'),
+      end: at('2026-10-24T17:00'),
+      short: true,
+      hoursAssumed: false,
+      featured: { gigantamax: false, names: ['Uxie', 'Mesprit', 'Azelf'] },
+      id: 'dynamax-uxie-mesprit-azelf-max-battle-day-2026',
+    });
+    expect(named('Dynamax Sableye during Max Monday')).toMatchObject({
+      start: at('2026-10-26T06:00'),
+      end: at('2026-10-26T21:00'),
+      short: false,
+    });
+    expect(named('Max Monday: Pokémon to be announced').featured).toBeUndefined();
+  });
+
+  it('assumes the hours of a Max Monday the feed gives none from the nearest of its kind', () => {
+    expect(named('Dynamax Sneasel during Max Monday')).toMatchObject({
+      start: at('2026-10-19T06:00'),
+      end: at('2026-10-19T21:00'),
+      hoursAssumed: true,
+      short: false,
+    });
+    expect(recorded.assumed).toEqual(['Dynamax Sneasel during Max Monday']);
+    expect(recorded.unhoured).toEqual([]);
+  });
+});
+
+describe('parseMaxEventFeed: what the feed may also hold', () => {
+  const item = (extra: Record<string, unknown>) => ({
+    eventID: 'some-event',
+    name: 'Dynamax Lugia Max Battle Weekend',
+    eventType: 'max-battles',
+    start: '2026-11-07T06:00:00.000',
+    end: '2026-11-08T21:00:00.000',
+    ...extra,
+  });
+
+  it('keeps a weekend from its start to its end, nights included, as all day', () => {
+    const [weekend] = parseMaxEventFeed([item({})], MAX_ZONE).events;
+    expect(weekend).toMatchObject({
+      start: at('2026-11-07T06:00'),
+      end: at('2026-11-08T21:00'),
+      short: false,
+      featured: { gigantamax: false, names: ['Lugia'] },
+    });
+    expect(weekend && maxEventAt([weekend], at('2026-11-08T02:00'))).toBe(weekend);
+  });
+
+  it('assumes a weekend of hours across the days of the event it copies', () => {
+    const parsed = parseMaxEventFeed(
+      [
+        item({}),
+        item({
+          eventID: 'dynamax-ho-oh-weekend-2026-11-21',
+          name: 'Dynamax Ho-Oh Max Battle Weekend',
+          start: null,
+          end: null,
+        }),
+      ],
+      MAX_ZONE,
+    );
+    expect(parsed.events[1]).toMatchObject({
+      start: at('2026-11-21T06:00'),
+      end: at('2026-11-22T21:00'),
+      hoursAssumed: true,
+    });
+  });
+
+  it('assumes the hours of the same kind of event: a weekend from a weekend, a day from a day', () => {
+    const parsed = parseMaxEventFeed(
+      [
+        item({}),
+        item({
+          eventID: 'dynamax-latios-max-battle-day-2026-11-20',
+          name: 'Dynamax Latios Max Battle Day',
+          start: '2026-11-20T14:00:00.000',
+          end: '2026-11-20T17:00:00.000',
+        }),
+        item({
+          eventID: 'dynamax-ho-oh-weekend-2026-11-21',
+          name: 'Dynamax Ho-Oh Max Battle Weekend',
+          start: null,
+          end: null,
+        }),
+        item({
+          eventID: 'dynamax-entei-max-battle-day-2026-11-09',
+          name: 'Dynamax Entei Max Battle Day',
+          start: null,
+          end: null,
+        }),
+      ],
+      MAX_ZONE,
+    );
+    const named = (name: string) => parsed.events.find((event) => event.name === name);
+    // The Latios day is nearer to the Ho-Oh weekend, but a weekend copies a weekend.
+    expect(named('Dynamax Ho-Oh Max Battle Weekend')).toMatchObject({
+      start: at('2026-11-21T06:00'),
+      end: at('2026-11-22T21:00'),
+    });
+    // The Lugia weekend is nearer to the Entei day, but a day copies a day.
+    expect(named('Dynamax Entei Max Battle Day')).toMatchObject({
+      start: at('2026-11-09T14:00'),
+      end: at('2026-11-09T17:00'),
+      short: true,
+    });
+  });
+
+  it('assumes the hours of a Max Monday whose name says no boss from another Max Monday', () => {
+    const parsed = parseMaxEventFeed(
+      [
+        item({
+          eventID: 'max-mondays-2026-12-07',
+          eventType: 'max-mondays',
+          name: 'Dynamax Abra during Max Monday',
+          start: '2026-12-07T06:00:00.000',
+          end: '2026-12-07T21:00:00.000',
+        }),
+        item({
+          eventID: 'max-mondays-2026-12-14',
+          eventType: 'max-mondays',
+          name: 'Max Monday: Pokémon to be announced',
+          start: null,
+          end: null,
+        }),
+      ],
+      MAX_ZONE,
+    );
+    expect(parsed.events[1]).toMatchObject({
+      name: 'Max Monday: Pokémon to be announced',
+      start: at('2026-12-14T06:00'),
+      end: at('2026-12-14T21:00'),
+      hoursAssumed: true,
+      featured: undefined,
+    });
+    expect(parsed.unhoured).toEqual([]);
+  });
+
+  it('features nothing of an event without hours it cannot assume, and says which', () => {
+    const parsed = parseMaxEventFeed(
+      [
+        item({
+          eventID: 'max-mondays-2026-12-07',
+          eventType: 'max-mondays',
+          name: 'Dynamax Abra during Max Monday',
+          start: null,
+          end: null,
+        }),
+        item({ eventID: 'no-date-here', start: null, end: null }),
+      ],
+      MAX_ZONE,
+    );
+    expect(parsed.events).toEqual([]);
+    expect(parsed.unhoured).toEqual([
+      { name: 'Dynamax Abra during Max Monday', date: '2026-12-07' },
+      { name: 'Dynamax Lugia Max Battle Weekend', date: undefined },
+    ]);
+  });
+
+  it('leaves out what is no event of its kind', () => {
+    const parsed = parseMaxEventFeed(
+      [
+        item({ end: '2026-11-06T21:00:00.000' }),
+        item({ end: '2026-11-30T21:00:00.000' }),
+        item({ eventType: 'event' }),
+        item({ name: 7 }),
+      ],
+      MAX_ZONE,
+    );
+    expect(parsed.events).toEqual([]);
+  });
+
+  it('refuses a document that is no list of events', () => {
+    expect(() => parseMaxEventFeed({ events: [] }, MAX_ZONE)).toThrow(/not a list of events/);
+  });
+});
+
+describe('maxEventAt', () => {
+  it('is the event on at a time, with its kind and hours', () => {
+    const day = named('Dynamax Uxie, Mesprit, and Azelf Max Battle Day');
+    expect(maxEventAt(recorded.events, at('2026-10-24T14:00'))).toBe(day);
+    expect(maxEventAt(recorded.events, at('2026-10-24T16:59'))).toBe(day);
+    expect(maxEventAt(recorded.events, at('2026-10-24T17:00'))).toBeUndefined();
+    expect(maxEventAt(recorded.events, at('2026-10-26T12:00'))?.name).toBe(
+      'Dynamax Sableye during Max Monday',
+    );
+    expect(maxEventAt(recorded.events, at('2026-10-26T22:00'))).toBeUndefined();
+  });
+
+  it('is a Max Battle Day before a Max Monday at the same time', () => {
+    const monday = named('Dynamax Sableye during Max Monday');
+    const battle: MaxEvent = { ...monday, kind: 'max-battle', name: 'Overlap', short: true };
+    expect(maxEventAt([monday, battle], at('2026-10-26T12:00'))).toBe(battle);
+  });
+});
+
+describe('featuredAt', () => {
+  const names = (time: number) =>
+    featuredAt(recorded.events, time, MAX_ZONE).map(({ event }) => event.name);
+
+  it("features a Max Monday's boss for its week, until the next Max Monday", () => {
+    expect(names(at('2026-10-26T05:59'))).toEqual(['Dynamax Sneasel during Max Monday']);
+    expect(names(at('2026-10-26T06:00'))).toEqual(['Dynamax Sableye during Max Monday']);
+    expect(names(at('2026-11-01T23:00'))).toEqual(['Dynamax Sableye during Max Monday']);
+    expect(names(at('2026-11-02T06:00'))).toEqual(['Dynamax Machop during Max Monday']);
+    expect(names(at('2026-10-19T05:59'))).toEqual([]);
+  });
+
+  it('features a Max Battle Day during its hours, before the boss of the week', () => {
+    expect(names(at('2026-10-24T14:00'))).toEqual([
+      'Dynamax Uxie, Mesprit, and Azelf Max Battle Day',
+      'Dynamax Sneasel during Max Monday',
+    ]);
+    expect(names(at('2026-10-24T17:00'))).toEqual(['Dynamax Sneasel during Max Monday']);
+  });
+
+  it('features nothing in the week of a Max Monday that names no boss, and at most 7 days', () => {
+    expect(names(at('2026-11-16T12:00'))).toEqual([]);
+    // Cryogonal's Monday is the last: its week ends 7 days after its start.
+    expect(names(at('2026-12-07T05:59'))).toEqual(['Dynamax Cryogonal during Max Monday']);
+    expect(names(at('2026-12-07T06:00'))).toEqual([]);
+  });
+
+  it('ends a week at the same local hour across a change of the clocks', () => {
+    const sableye = recorded.events.filter(
+      (event) => event.name === 'Dynamax Sableye during Max Monday',
+    );
+    // The clocks go back on 2026-11-01: a week is 169 hours then, not 168.
+    const week = (time: number) => featuredAt(sableye, time, MAX_ZONE).length;
+    expect(week(at('2026-11-02T05:59'))).toBe(1);
+    expect(week(at('2026-11-02T06:00'))).toBe(0);
+  });
+});
diff --git a/src/domain/time/max-events.ts b/src/domain/time/max-events.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3d4abdab739c4500e9afc151f79d901709a50cd8
--- /dev/null
+++ b/src/domain/time/max-events.ts
@@ -0,0 +1,248 @@
+import { DateTime } from 'luxon';
+import { z } from 'zod';
+import { eventName } from './raid-events.js';
+
+/**
+ * The max events of ScrapedDuck's events feed (plan 8X-2; design section 10, the featured boss),
+ * kept apart from the raid events (`RAID_EVENT_KINDS`, which set raid durations): a Max Monday
+ * (`max-mondays`) and a Max Battle Day or Weekend (`max-battles`).
+ */
+const FEED_KINDS = { 'max-mondays': 'max-monday', 'max-battles': 'max-battle' } as const;
+export type MaxEventKind = (typeof FEED_KINDS)[keyof typeof FEED_KINDS];
+
+/** The bosses an event's name features: their names as written, and whether they are Gigantamax. */
+export interface FeaturedNames {
+  gigantamax: boolean;
+  names: string[];
+}
+
+/** A max event. Times are epoch milliseconds. */
+export interface MaxEvent {
+  kind: MaxEventKind;
+  /** The feed's name, e.g. `Dynamax Sneasel during Max Monday`. Shown to members: escape it. */
+  name: string;
+  /** The feed's own start and end (or those assumed, `hoursAssumed`); `end` is the first moment after it. */
+  start: number;
+  end: number;
+  /**
+   * Within one day of the zone and shorter than `SHORT_EVENT_MS`: a Max Battle Day, whose
+   * battles rotate about every 30 minutes. Otherwise all day (a Max Monday, a weekend over
+   * several days, on from its start to its end, nights included: battles stop at the last battle
+   * time of the settings anyway), whose battles last about an hour.
+   */
+  short: boolean;
+  /**
+   * The feed gave no hours; they are those of the nearest event of its kind that has them, on the
+   * date of the event's id (Matt, 2026-10-20).
+   */
+  hoursAssumed: boolean;
+  /** What its name features; undefined when it names no boss ("Pokémon to be announced"). */
+  featured: FeaturedNames | undefined;
+  /** The feed's `eventID` (`max-mondays-2026-10-26`), which stays when it renames or moves it. */
+  id: string | undefined;
+}
+
+/** An event shorter than this, within one day, is short (`MaxEvent.short`). */
+export const SHORT_EVENT_MS = 6 * 60 * 60_000;
+/** A max event longer than this is none, whatever the feed says. */
+const MAX_EVENT_MS = 8 * 24 * 60 * 60_000;
+const FEATURE =
+  /^(Dynamax|Gigantamax)\s+(.+?)\s+(during\s+(?:a\s+)?Max\s+Monday|Max\s+Battle\s+(?:Day|Weekend))$/i;
+
+/**
+ * What sort of event a name says: `monday`, `day` (a Max Battle Day) or `weekend`, from its last
+ * words as `FEATURE` reads them; undefined for a name of another shape.
+ */
+function sortOf(name: string): 'monday' | 'day' | 'weekend' | undefined {
+  const ending = FEATURE.exec(name.trim())?.[3]?.toLowerCase();
+  if (ending === undefined) return undefined;
+  return ending.endsWith('monday') ? 'monday' : ending.endsWith('weekend') ? 'weekend' : 'day';
+}
+
+/**
+ * The bosses an event's name features: `Dynamax Sneasel during Max Monday`, `Dynamax Uxie,
+ * Mesprit, and Azelf Max Battle Day`, `Dynamax Lugia Max Battle Weekend`, `Gigantamax Machamp Max
+ * Battle Day`. Undefined for a name of another shape: it features nothing.
+ */
+export function featuredNames(name: string): FeaturedNames | undefined {
+  const match = FEATURE.exec(name.trim());
+  if (!match?.[1] || !match[2]) return undefined;
+  const names = match[2]
+    .split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i)
+    .map((one) => one.trim())
+    .filter((one) => one !== '');
+  if (names.length === 0) return undefined;
+  return { gigantamax: match[1].toLowerCase() === 'gigantamax', names };
+}
+
+const feedItem = z.object({
+  eventID: z.string().max(200).optional(),
+  eventType: z.enum(Object.keys(FEED_KINDS) as [keyof typeof FEED_KINDS]),
+  name: eventName,
+  start: z.string().max(40).nullable().optional(),
+  end: z.string().max(40).nullable().optional(),
+});
+type FeedItem = z.output<typeof feedItem>;
+
+export interface ParsedMaxEvents {
+  /** In order of their start. */
+  events: MaxEvent[];
+  /** The names of the events whose hours were assumed (`MaxEvent.hoursAssumed`). */
+  assumed: string[];
+  /**
+   * The events without hours that could not be assumed (no date in the id, or no event of its
+   * kind with hours): they are left out. `date` is the date of the id, when it has one.
+   */
+  unhoured: { name: string; date: string | undefined }[];
+}
+
+/** The date an event's id carries, as `max-mondays-2026-10-19` does. */
+function idDate(item: FeedItem): string | undefined {
+  return /(\d{4}-\d{2}-\d{2})/.exec(item.eventID ?? '')?.[1];
+}
+
+function hoursOf(item: FeedItem, zone: string): { start: DateTime; end: DateTime } | undefined {
+  if (typeof item.start !== 'string' || typeof item.end !== 'string') return undefined;
+  const start = DateTime.fromISO(item.start, { zone });
+  const end = DateTime.fromISO(item.end, { zone });
+  return start.isValid && end.isValid ? { start, end } : undefined;
+}
+
+/**
+ * Whether two events of one `eventType` are of one sort for `assumedHours`: every Max Monday is
+ * (a name that names no boss, "Max Monday: Pokémon to be announced", has no sort); otherwise
+ * when either name has no sort, or both have the same.
+ */
+function sameSort(a: FeedItem, b: FeedItem): boolean {
+  if (a.eventType === 'max-mondays') return true;
+  const one = sortOf(a.name);
+  const other = sortOf(b.name);
+  return one === undefined || other === undefined || one === other;
+}
+
+/**
+ * The hours of an event the feed gives none: those of the nearest event of its kind (its
+ * `eventType`, and a Max Battle Day for a day, a Weekend for a weekend: `sameSort`; by the date of
+ * the id against the other's start) that has them, at the same clock times on the id's date, over
+ * as many days as that one.
+ */
+function assumedHours(
+  date: string,
+  item: FeedItem,
+  houred: readonly { item: FeedItem; start: DateTime; end: DateTime }[],
+  zone: string,
+): { start: DateTime; end: DateTime } | undefined {
+  const day = DateTime.fromISO(date, { zone });
+  if (!day.isValid) return undefined;
+  const nearest = houred
+    .filter((one) => one.item.eventType === item.eventType && sameSort(one.item, item))
+    .sort(
+      (a, b) =>
+        Math.abs(a.start.startOf('day').diff(day).toMillis()) -
+          Math.abs(b.start.startOf('day').diff(day).toMillis()) ||
+        a.start.toMillis() - b.start.toMillis(),
+    )[0];
+  if (!nearest) return undefined;
+  const days = Math.round(
+    nearest.end.startOf('day').diff(nearest.start.startOf('day'), 'days').days,
+  );
+  const at = (time: DateTime, plus: number): DateTime =>
+    day
+      .plus({ days: plus })
+      .set({ hour: time.hour, minute: time.minute, second: 0, millisecond: 0 });
+  return { start: at(nearest.start, 0), end: at(nearest.end, days) };
+}
+
+/**
+ * Reads the max events of ScrapedDuck's events feed (`events.json`). The feed gives local
+ * wall-clock times without a zone, read in `zone`; an event's hours are always the feed's own.
+ * An event without hours whose id carries a date takes the hours of the nearest event of its kind
+ * (`assumedHours`); one that cannot is left out and listed in `unhoured`. An event that ends
+ * before it starts, or lasts longer than eight days, is left out.
+ *
+ * Throws when the document is not a list of events at all, so that the caller keeps what it had.
+ */
+export function parseMaxEventFeed(json: unknown, zone: string): ParsedMaxEvents {
+  if (!Array.isArray(json)) throw new Error('The events feed is not a list of events');
+  const items = (json as unknown[]).flatMap((value) => {
+    const parsed = feedItem.safeParse(value);
+    return parsed.success ? [parsed.data] : [];
+  });
+  const houred = items.flatMap((item) => {
+    const hours = hoursOf(item, zone);
+    return hours ? [{ item, ...hours }] : [];
+  });
+
+  const events: MaxEvent[] = [];
+  const assumed: string[] = [];
+  const unhoured: ParsedMaxEvents['unhoured'] = [];
+  for (const item of items) {
+    let hours = hoursOf(item, zone);
+    const missing = item.start == null || item.end == null;
+    if (!hours && missing) {
+      const date = idDate(item);
+      hours = date === undefined ? undefined : assumedHours(date, item, houred, zone);
+      if (!hours) {
+        unhoured.push({ name: item.name, date });
+        continue;
+      }
+      assumed.push(item.name);
+    }
+    if (!hours) continue;
+    const start = hours.start.toMillis();
+    const end = hours.end.toMillis();
+    const length = end - start;
+    if (length <= 0 || length > MAX_EVENT_MS) continue;
+    events.push({
+      kind: FEED_KINDS[item.eventType],
+      name: item.name,
+      start,
+      end,
+      short: length < SHORT_EVENT_MS && hours.start.hasSame(hours.end.minus(1), 'day'),
+      hoursAssumed: missing,
+      id: item.eventID,
+      featured: featuredNames(item.name),
+    });
+  }
+  events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
+  return { events, assumed, unhoured };
+}
+
+/**
+ * The max event that is on at `time` (its own hours, `start` included, `end` not), with its kind
+ * and hours (8X-3 sets a max battle's default end from it); a Max Battle Day before a Max Monday
+ * that is on at the same time, then the earliest. Undefined when none is on.
+ */
+export function maxEventAt(events: readonly MaxEvent[], time: number): MaxEvent | undefined {
+  const on = events.filter((event) => event.start <= time && time < event.end);
+  return (
+    on.find((event) => event.kind === 'max-battle') ??
+    on.find((event) => event.kind === 'max-monday')
+  );
+}
+
+/**
+ * The events whose bosses are featured (listed first) at `time` (Matt, 2026-10-20): a Max Battle
+ * Day or Weekend during its own hours, first; then the Max Monday of the week, whose boss stays
+ * the most common Dynamax boss all week: from that Monday's start until the next Max Monday starts
+ * (one that names no boss included), or a week of `zone`'s clock (the same hour seven days on),
+ * whichever is sooner. Only events that name bosses; `until` is when the event stops being
+ * featured.
+ */
+export function featuredAt(
+  events: readonly MaxEvent[],
+  time: number,
+  zone: string,
+): { event: MaxEvent; until: number }[] {
+  const battles = events
+    .filter((event) => event.kind === 'max-battle' && event.start <= time && time < event.end)
+    .map((event) => ({ event, until: event.end }));
+  const mondays = events.filter((event) => event.kind === 'max-monday');
+  const weeks = mondays.flatMap((monday) => {
+    const next = mondays.find((other) => other.start > monday.start);
+    const week = DateTime.fromMillis(monday.start, { zone }).plus({ weeks: 1 }).toMillis();
+    const until = Math.min(next?.start ?? Infinity, week);
+    return monday.start <= time && time < until ? [{ event: monday, until }] : [];
+  });
+  return [...battles, ...weeks].filter(({ event }) => event.featured !== undefined);
+}
diff --git a/src/domain/time/raid-events.ts b/src/domain/time/raid-events.ts
index 7c2125ece3f8359e90dc2bc8cd7a754fbc431d33..38d174be66a2ba957ad4dddbddc8752fdba1c694 100644
--- a/src/domain/time/raid-events.ts
+++ b/src/domain/time/raid-events.ts
@@ -18,18 +18,24 @@ export interface RaidEvent {
 /** An event longer than this is not a Raid Hour or a Raid Day, whatever the feed calls it. */
 const MAX_EVENT_MS = 24 * 60 * 60_000;
 
+/**
+ * The name of an event of the feed as it is kept and shown: control and format characters as
+ * spaces, runs of white space as one, at most 100 characters.
+ */
+export const eventName = z
+  .string()
+  .transform((name) =>
+    name
+      .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
+      .replace(/\s+/g, ' ')
+      .trim(),
+  )
+  .pipe(z.string().min(1))
+  .transform((name) => Array.from(name).slice(0, 100).join('').trimEnd());
+
 const feedEvent = z.object({
   eventType: z.enum(RAID_EVENT_KINDS),
-  name: z
-    .string()
-    .transform((name) =>
-      name
-        .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
-        .replace(/\s+/g, ' ')
-        .trim(),
-    )
-    .pipe(z.string().min(1))
-    .transform((name) => Array.from(name).slice(0, 100).join('').trimEnd()),
+  name: eventName,
   start: z.string().max(40),
   end: z.string().max(40),
 });
diff --git a/src/services/max-boss-service.test.ts b/src/services/max-boss-service.test.ts
index 60a4059d3f2601102f55bee44f1f4c61e1710197..b0b0092251c803ab6ffccb2bb02095b18163c867 100644
--- a/src/services/max-boss-service.test.ts
+++ b/src/services/max-boss-service.test.ts
@@ -2,11 +2,17 @@ import { describe, expect, it } from 'vitest';
 import {
   at,
   MAX_FEED_READ_AT,
+  MAX_ZONE,
   pokebattlerFeed,
   readPokebattlerFeed,
 } from '../../test/support/max-bosses.js';
 import { feedReply } from '../../test/support/raid-bosses.js';
 import { maxBossServiceWith } from '../../test/support/max-boss-service.js';
+import { readMaxEventFeed } from '../../test/support/max-events.js';
+import { catalogueFixture } from '../../test/support/game-data.js';
+import { pokemonFixture } from '../../test/support/providers.js';
+import { parseMaxEventFeed } from '../domain/time/max-events.js';
+import { currentMaxBossChoices, NO_MAX_BOSSES } from './max-boss-service.js';
 
 describe('MaxBossService', () => {
   it('stores the feed and offers the bosses of the day, an upcoming one from its day', async () => {
@@ -82,6 +88,66 @@ describe('MaxBossService', () => {
     ).rejects.toThrow(/max battle tier/);
   });
 
+  it('gives the choices of the moment: the featured boss of the week first', async () => {
+    const { service, state } = await maxBossServiceWith();
+    await service.sync();
+    const events = parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events;
+    const deps = {
+      maxBosses: service,
+      maxEvents: { maxEvents: () => events },
+      pokemon: pokemonFixture(),
+      gameData: { catalogue: catalogueFixture() },
+      zone: MAX_ZONE,
+    };
+    state.now = at('2026-10-24T15:00');
+    const choices = currentMaxBossChoices(deps, state.now);
+    expect(choices.slice(0, 4).map((one) => one.name)).toEqual([
+      'Uxie · Dynamax 5★',
+      'Mesprit · Dynamax 5★',
+      'Azelf · Dynamax 5★',
+      'Sneasel · Dynamax 1★',
+    ]);
+    expect(currentMaxBossChoices({ ...deps, maxBosses: NO_MAX_BOSSES }, state.now)).toEqual([]);
+  });
+
+  it('keeps a Gigantamax boss staff hid off the list during the event that names it', async () => {
+    const { service, state } = await maxBossServiceWith();
+    await service.sync();
+    const events = parseMaxEventFeed(
+      [
+        {
+          eventType: 'max-battles',
+          name: 'Gigantamax Kingler Max Battle Day',
+          start: '2026-10-21T14:00:00.000',
+          end: '2026-10-21T17:00:00.000',
+        },
+      ],
+      MAX_ZONE,
+    ).events;
+    const deps = {
+      maxBosses: service,
+      maxEvents: { maxEvents: () => events },
+      pokemon: pokemonFixture(),
+      gameData: { catalogue: catalogueFixture() },
+      zone: MAX_ZONE,
+    };
+    state.now = at('2026-10-21T15:00');
+    const first = () => currentMaxBossChoices(deps, state.now)[0]?.name;
+    expect(first()).toBe('Gigantamax Kingler');
+    expect(service.hidden()).toEqual([]);
+    await service.addOverride({
+      action: 'hide',
+      pokemonId: 'KINGLER',
+      form: null,
+      tier: 'G',
+      shiny: null,
+      expiresAt: null,
+      createdBy: '123456789012345678',
+    });
+    expect(service.hidden()).toEqual([{ key: 'kingler', tier: 'G' }]);
+    expect(first()).not.toBe('Gigantamax Kingler');
+  });
+
   it('reads a document of the recorded size', async () => {
     const { service, state } = await maxBossServiceWith();
     const body = JSON.stringify(readPokebattlerFeed());
diff --git a/src/services/max-boss-service.ts b/src/services/max-boss-service.ts
index 4c70a90ded0b6a68dd6b513fe63963e073f95714..5bfdeaa24a1b63fb66ff9fbf504c6f21a0c803a4 100644
--- a/src/services/max-boss-service.ts
+++ b/src/services/max-boss-service.ts
@@ -1,12 +1,19 @@
 import type { MaxBossStore } from '../db/repositories/raid-boss-repository.js';
 import {
+  comingMaxBosses,
   MAX_OPS,
   maxBossesAt,
   maxOverrideProblem,
   parseMaxBossFeed,
   type MaxBoss,
 } from '../domain/pogo/max-bosses.js';
+import { maxBossChoices, type MaxBossChoice } from '../domain/pogo/max-boss-list.js';
 import type { MaxTier } from '../domain/pogo/max-tier.js';
+import { familyOverrideKeys } from '../domain/pogo/raid-bosses.js';
+import { featuredAt } from '../domain/time/max-events.js';
+import type { GameDataProvider } from './game-data-service.js';
+import type { PokemonFinder } from './pokemon-search-service.js';
+import type { MaxEventProvider } from './raid-event-service.js';
 import {
   BossFeedService,
   type BossAdmin,
@@ -32,13 +39,55 @@ export interface MaxBossProvider {
    * max overrides applied, from D1 to G, then by name. Empty while max battles are off.
    */
   bosses(): MaxBoss[];
+  /**
+   * The feed's upcoming bosses, whose start has not come, with the overrides that hide one or set
+   * its shiny flag: offered only while a max event that names them is on (`maxBossChoices`).
+   */
+  coming(): MaxBoss[];
+  /** The bosses (key and tier) that the hide overrides in force take off the list. */
+  hidden(): { key: string; tier: MaxTier }[];
 }
 
 /** What staff need of the max boss list beyond what handlers read (`/admin boss`). */
 export type MaxBossAdmin = BossAdmin<MaxTier>;
 
 /** The max bosses while max battles are off (`settings.maxBattles` absent): none. */
-export const NO_MAX_BOSSES: MaxBossProvider = { bosses: () => [] };
+export const NO_MAX_BOSSES: MaxBossProvider = {
+  bosses: () => [],
+  coming: () => [],
+  hidden: () => [],
+};
+
+/**
+ * The max bosses `/max` offers at `now`, in their order (`maxBossChoices`): the featured bosses of
+ * the max events of the events feed first (`featuredAt`: a Max Battle Day's during its hours, the
+ * week's Max Monday's), each event's names read through the Pokémon search, then 5 stars down to
+ * 1 and Gigantamax; an upcoming boss a featured event names from that event's start, and during
+ * a featured event's hours a Gigantamax boss it names that the feed does not list. `zone` is
+ * `settings.timezone`. Plan 8X-3 calls it with the bot's context.
+ */
+export function currentMaxBossChoices(
+  deps: {
+    maxBosses: MaxBossProvider;
+    maxEvents: MaxEventProvider;
+    pokemon: Pick<PokemonFinder, 'exact'>;
+    gameData: GameDataProvider;
+    zone: string;
+  },
+  now: number,
+): MaxBossChoice[] {
+  return maxBossChoices(
+    deps.maxBosses.bosses(),
+    featuredAt(deps.maxEvents.maxEvents(), now, deps.zone),
+    (text) => deps.pokemon.exact(text),
+    {
+      coming: deps.maxBosses.coming(),
+      time: now,
+      catalogue: deps.gameData.catalogue,
+      hidden: deps.maxBosses.hidden(),
+    },
+  );
+}
 
 /**
  * Keeps the max boss list (plan 8X-2): Pokebattler's feed read on its own timer
@@ -49,6 +98,8 @@ export const NO_MAX_BOSSES: MaxBossProvider = { bosses: () => [] };
  * not announced (`RaidBossAnnouncer` listens to the raid bosses only).
  */
 export class MaxBossService extends BossFeedService<MaxTier> implements MaxBossProvider {
+  private readonly gameData: GameDataProvider;
+
   constructor(options: MaxBossOptions) {
     const family: BossFeedFamily<MaxTier> = {
       noun: 'max boss',
@@ -60,5 +111,22 @@ export class MaxBossService extends BossFeedService<MaxTier> implements MaxBossP
       overrideProblem: maxOverrideProblem,
     };
     super(options, family);
+    this.gameData = options.gameData;
+  }
+
+  hidden(): { key: string; tier: MaxTier }[] {
+    const keyOf = familyOverrideKeys(MAX_OPS, this.feedBosses(), this.gameData.catalogue);
+    return this.overrides().flatMap((one) =>
+      one.action === 'hide' && one.tier !== null ? [{ key: keyOf(one).key, tier: one.tier }] : [],
+    );
+  }
+
+  coming(): MaxBoss[] {
+    return comingMaxBosses(
+      this.feedBosses(),
+      this.overrides(),
+      this.gameData.catalogue,
+      this.now(),
+    );
   }
 }
diff --git a/src/services/raid-event-service.test.ts b/src/services/raid-event-service.test.ts
index b16a6ff2623606eb2309fb03117f5601988cb71b..ea2455582df3fe63acefac242cc9f1ee810f1b94 100644
--- a/src/services/raid-event-service.test.ts
+++ b/src/services/raid-event-service.test.ts
@@ -1,5 +1,8 @@
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import { fakeTimeoutSignals } from '../../test/support/timers.js';
+import { at } from '../../test/support/max-bosses.js';
+import { readMaxEventFeed } from '../../test/support/max-events.js';
+import { featuredAt } from '../domain/time/max-events.js';
 import { readRaidEventFeed } from '../../test/support/raid-events.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import { RaidEventService, type FetchEvents } from './raid-event-service.js';
@@ -238,4 +241,129 @@ describe('RaidEventService', () => {
     await vi.advanceTimersByTimeAsync(24 * HOUR);
     expect(events.events()).toEqual([]);
   });
+
+  // Plan 8X-2: the max events of the same feed, kept apart from the raid events.
+  describe('the max events', () => {
+    const maxFeed = JSON.stringify(readMaxEventFeed());
+
+    it('keeps the max events of a read apart, and says once a read which hours it assumed', async () => {
+      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, maxFeed)));
+      const { events, entries } = service(fetch, { now: () => at('2026-10-20T22:00') });
+      expect(events.maxEvents()).toEqual([]);
+      await expect(events.refresh()).resolves.toEqual({ status: 'updated', events: 1 });
+      expect(events.events().map((event) => event.name)).toEqual(['Palkia Raid Hour']);
+      expect(events.maxEvents()).toHaveLength(7);
+      const assumed = entries.filter((entry) => entry.msg === 'max event hours assumed');
+      expect(assumed).toHaveLength(1);
+      expect(assumed[0]).toMatchObject({ events: ['Dynamax Sneasel during Max Monday'] });
+      await events.refresh();
+      expect(entries.filter((entry) => entry.msg === 'max event hours assumed')).toHaveLength(2);
+    });
+
+    it('warns of a coming max event without hours it cannot assume, and not of a past one', async () => {
+      const feed = JSON.stringify([
+        {
+          eventID: 'max-mondays-2026-10-19',
+          eventType: 'max-mondays',
+          name: 'Dynamax Abra during Max Monday',
+          start: null,
+          end: null,
+        },
+        {
+          eventID: 'max-mondays-2026-10-26',
+          eventType: 'max-mondays',
+          name: 'Dynamax Ralts during Max Monday',
+          start: null,
+          end: null,
+        },
+        {
+          eventID: 'max-battles-x',
+          eventType: 'max-battles',
+          name: 'Dynamax Lugia Max Battle Weekend',
+          start: null,
+          end: null,
+        },
+      ]);
+      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, feed)));
+      const { events, entries } = service(fetch, { now: () => at('2026-10-20T22:00') });
+      await events.refresh();
+      const warned = entries.filter(
+        (entry) => entry.msg === 'max events without hours feature nothing',
+      );
+      expect(warned).toHaveLength(1);
+      expect(warned[0]).toMatchObject({ events: ['Dynamax Ralts during Max Monday'] });
+      expect(events.maxEvents()).toEqual([]);
+    });
+
+    it('keeps the max events it has when a read fails', async () => {
+      let fail = false;
+      const fetch = vi.fn<FetchEvents>(() =>
+        Promise.resolve(fail ? reply(500) : reply(200, maxFeed)),
+      );
+      const { events } = service(fetch, { now: () => at('2026-10-20T22:00') });
+      await events.refresh();
+      fail = true;
+      await events.refresh();
+      expect(events.maxEvents()).toHaveLength(7);
+    });
+
+    it('keeps one copy of a running event the feed renames or moves: the newest', async () => {
+      const all = readMaxEventFeed() as { eventID: string; name: string; start: string | null }[];
+      let body = maxFeed;
+      let now = at('2026-10-26T12:00');
+      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, body)));
+      const { events } = service(fetch, { now: () => now });
+      await events.refresh();
+      now = at('2026-10-28T12:00');
+      body = JSON.stringify(
+        all.map((event) =>
+          event.eventID === 'max-mondays-2026-10-26'
+            ? {
+                ...event,
+                name: 'Dynamax Sableye and Machop during Max Monday',
+                start: '2026-10-26T07:00:00.000',
+              }
+            : event,
+        ),
+      );
+      await events.refresh();
+      const sableye = events.maxEvents().filter((event) => event.id === 'max-mondays-2026-10-26');
+      expect(sableye.map((event) => event.name)).toEqual([
+        'Dynamax Sableye and Machop during Max Monday',
+      ]);
+      expect(featuredAt(events.maxEvents(), now, 'America/New_York')).toEqual([
+        { event: sableye[0], until: at('2026-11-02T06:00') },
+      ]);
+    });
+
+    it("keeps a Max Monday the feed drops once it is over, so its boss stays the week's", async () => {
+      const all = readMaxEventFeed() as { name: string }[];
+      const without = (...names: string[]) =>
+        JSON.stringify(all.filter((event) => !names.includes(event.name)));
+      let body = maxFeed;
+      let now = at('2026-10-26T12:00');
+      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, body)));
+      const { events } = service(fetch, { now: () => now });
+      await events.refresh();
+      // Wednesday: the feed no longer lists Sableye's Monday, nor Machop's, which is moved away.
+      now = at('2026-10-28T12:00');
+      body = without('Dynamax Sableye during Max Monday', 'Dynamax Machop during Max Monday');
+      await events.refresh();
+      const names = events.maxEvents().map((event) => event.name);
+      expect(names).toContain('Dynamax Sableye during Max Monday');
+      expect(names).not.toContain('Dynamax Machop during Max Monday');
+      const starts = events.maxEvents().map((event) => event.start);
+      expect([...starts].sort((a, b) => a - b)).toEqual(starts);
+      expect(
+        featuredAt(events.maxEvents(), now, 'America/New_York').map(({ event }) => event.name),
+      ).toEqual(['Dynamax Sableye during Max Monday']);
+      // Eight days after its start it is forgotten.
+      now = at('2026-11-03T06:00');
+      body = without('Dynamax Sableye during Max Monday', 'Dynamax Sneasel during Max Monday');
+      await events.refresh();
+      expect(events.maxEvents().map((event) => event.name)).not.toContain(
+        'Dynamax Sableye during Max Monday',
+      );
+    });
+  });
 });
diff --git a/src/services/raid-event-service.ts b/src/services/raid-event-service.ts
index 2a8ba5e417e2626fa9868b490c9fc95d5fda3264..c8a255eaf2897fbd4e1f0e8af8eadf6d627d931e 100644
--- a/src/services/raid-event-service.ts
+++ b/src/services/raid-event-service.ts
@@ -1,3 +1,9 @@
+import { DateTime } from 'luxon';
+import {
+  parseMaxEventFeed,
+  type MaxEvent,
+  type ParsedMaxEvents,
+} from '../domain/time/max-events.js';
 import { parseRaidEventFeed, type RaidEvent } from '../domain/time/raid-events.js';
 import type { Logger } from '../log.js';
 import { failureReason } from './failure-reason.js';
@@ -42,6 +48,16 @@ export interface RaidEventProvider {
   events(): readonly RaidEvent[];
 }
 
+/**
+ * The max events of the same feed (plan 8X-2): Max Mondays and Max Battle Days and Weekends, kept
+ * apart from the raid events, for the featured boss of the max boss list (`featuredAt`) and a max
+ * battle's default end (`maxEventAt`, plan 8X-3).
+ */
+export interface MaxEventProvider {
+  /** In order of their start; empty until the feed was read once. */
+  maxEvents(): readonly MaxEvent[];
+}
+
 export type RefreshResult =
   | { status: 'updated'; events: number }
   /** The feed could not be read or was not valid; the events in use are unchanged. */
@@ -56,8 +72,9 @@ export type RefreshResult =
  * eight days ago is kept after a read that no longer lists it. One that has not begun yet and is
  * no longer listed was moved or cancelled, and is dropped.
  */
-export class RaidEventService implements RaidEventProvider {
+export class RaidEventService implements RaidEventProvider, MaxEventProvider {
   private current: readonly RaidEvent[] = [];
+  private currentMax: readonly MaxEvent[] = [];
   private readonly timeoutMs: number;
   private readonly retryMs: number;
   private controller: AbortController | undefined;
@@ -74,6 +91,14 @@ export class RaidEventService implements RaidEventProvider {
     return this.current;
   }
 
+  /**
+   * The max events of the last good read, with those of the last eight days the feed has dropped
+   * since (`mergedMax`), in order of their start.
+   */
+  maxEvents(): readonly MaxEvent[] {
+    return this.currentMax;
+  }
+
   /**
    * Reads the feed. Never rejects. Calls made while one is running share its result.
    */
@@ -122,7 +147,10 @@ export class RaidEventService implements RaidEventProvider {
   private async refreshOnce(): Promise<RefreshResult> {
     const { log } = this.options;
     try {
-      this.current = this.merged(await this.readFeed());
+      const read = await this.readFeed();
+      this.current = this.merged(read.raid);
+      this.currentMax = this.mergedMax(read.max.events);
+      this.tellOfHours(read.max);
     } catch (err) {
       if (err instanceof RefreshStopped) return { status: 'failed', reason: 'stopped' };
       const reason = err instanceof Error ? err.message : String(err);
@@ -147,7 +175,49 @@ export class RaidEventService implements RaidEventProvider {
     return [...read, ...dropped].sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
   }
 
-  private async readFeed(): Promise<RaidEvent[]> {
+  /**
+   * The max events just read, plus those known before that the feed no longer lists but that have
+   * begun and started less than eight days ago: ScrapedDuck drops an event once it is over, and a
+   * Max Monday's boss is featured for its whole week (`featuredAt`). One that has not begun and is
+   * no longer listed was moved or cancelled: it goes. In memory only: after a restart in the week
+   * the feed no longer lists its Monday, so the week's boss is not featured until the next one.
+   */
+  private mergedMax(read: readonly MaxEvent[]): MaxEvent[] {
+    const now = (this.options.now ?? Date.now)();
+    // One event by its feed id, whatever the feed renamed or moved: the copy just read wins.
+    const same = (a: MaxEvent, b: MaxEvent): boolean =>
+      a.id !== undefined && b.id !== undefined
+        ? a.id === b.id
+        : a.kind === b.kind && a.name === b.name && a.start === b.start;
+    const dropped = this.currentMax.filter(
+      (old) =>
+        old.start <= now &&
+        old.start > now - REMEMBER_MS &&
+        !read.some((event) => same(event, old)),
+    );
+    return [...read, ...dropped].sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
+  }
+
+  /**
+   * Each read: the max events whose hours were assumed, as information, and those without hours
+   * that feature nothing although their date is today or later, as a warning, so that a feed
+   * that drops the hours of coming events is noticed.
+   */
+  private tellOfHours(max: ParsedMaxEvents): void {
+    const { log, zone } = this.options;
+    if (max.assumed.length > 0) {
+      this.safely(() => log.info({ events: max.assumed }, 'max event hours assumed'));
+    }
+    const today = DateTime.fromMillis((this.options.now ?? Date.now)(), { zone }).toISODate() ?? '';
+    const coming = max.unhoured
+      .filter((event) => event.date !== undefined && event.date >= today)
+      .map((event) => event.name);
+    if (coming.length > 0) {
+      this.safely(() => log.warn({ events: coming }, 'max events without hours feature nothing'));
+    }
+  }
+
+  private async readFeed(): Promise<{ raid: RaidEvent[]; max: ParsedMaxEvents }> {
     const { url } = this.options;
     const timeout = AbortSignal.timeout(this.timeoutMs);
     const controller = new AbortController();
@@ -178,7 +248,10 @@ export class RaidEventService implements RaidEventProvider {
     } catch {
       throw new Error(`${url} did not send JSON`);
     }
-    return parseRaidEventFeed(json, this.options.zone);
+    return {
+      raid: parseRaidEventFeed(json, this.options.zone),
+      max: parseMaxEventFeed(json, this.options.zone),
+    };
   }
 
   /** A broken logger must not turn a finished download into a rejected one. */
diff --git a/test/fixtures/max-events.json b/test/fixtures/max-events.json
new file mode 100644
index 0000000000000000000000000000000000000000..4d2e08c7755a29aff8805367180188520a0478ab
--- /dev/null
+++ b/test/fixtures/max-events.json
@@ -0,0 +1,146 @@
+[
+  {
+    "eventID": "max-mondays-2026-10-19",
+    "name": "Dynamax Sneasel during Max Monday",
+    "eventType": "max-mondays",
+    "heading": "Max Mondays",
+    "link": "https://leekduck.com/events/max-mondays-2026-10-19/",
+    "image": "https://cdn.leekduck.com/assets/img/events/max-battles-kanto.jpg",
+    "start": null,
+    "end": null,
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "raidhour20261021",
+    "name": "Palkia Raid Hour",
+    "eventType": "raid-hour",
+    "heading": "Raid Hour",
+    "link": "https://leekduck.com/events/raidhour20261021/",
+    "image": "https://cdn.leekduck.com/assets/img/events/raidhour.jpg",
+    "start": "2026-10-21T18:00:00.000",
+    "end": "2026-10-21T19:00:00.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "dynamax-uxie-mesprit-azelf-max-battle-day-2026",
+    "name": "Dynamax Uxie, Mesprit, and Azelf Max Battle Day",
+    "eventType": "max-battles",
+    "heading": "Max Battles",
+    "link": "https://leekduck.com/events/dynamax-uxie-mesprit-azelf-max-battle-day-2026/",
+    "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-10-24-dynamax-uxie-mesprit-azelf-max-battle-day-2026/dynamax-uxie-mesprit-azelf-max-battle-day.jpg",
+    "start": "2026-10-24T14:00:00.000",
+    "end": "2026-10-24T17:00:00.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "max-mondays-2026-10-26",
+    "name": "Dynamax Sableye during Max Monday",
+    "eventType": "max-mondays",
+    "heading": "Max Mondays",
+    "link": "https://leekduck.com/events/max-mondays-2026-10-26/",
+    "image": "https://cdn.leekduck.com/assets/img/events/max-battles-kanto.jpg",
+    "start": "2026-10-26T06:00:00.000",
+    "end": "2026-10-26T21:00:00.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "max-mondays-2026-11-02",
+    "name": "Dynamax Machop during Max Monday",
+    "eventType": "max-mondays",
+    "heading": "Max Mondays",
+    "link": "https://leekduck.com/events/max-mondays-2026-11-02/",
+    "image": "https://cdn.leekduck.com/assets/img/events/max-battles-kanto.jpg",
+    "start": "2026-11-02T06:00:00.000",
+    "end": "2026-11-02T21:00:00.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "max-mondays-2026-11-16",
+    "name": "Max Monday: Pokémon to be announced",
+    "eventType": "max-mondays",
+    "heading": "Max Mondays",
+    "link": "https://leekduck.com/events/max-mondays-2026-11-16/",
+    "image": "https://cdn.leekduck.com/assets/img/events/max-battles-kanto.jpg",
+    "start": "2026-11-16T06:00:00.000",
+    "end": "2026-11-16T21:00:00.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "dynamax-trails-2026",
+    "name": "Dynamax Trails",
+    "eventType": "event",
+    "heading": "Event",
+    "link": "https://leekduck.com/events/dynamax-trails-2026/",
+    "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+    "start": "2026-11-16T10:00:00.000",
+    "end": "2026-11-23T20:00:00.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "max-mondays-2026-11-23",
+    "name": "Dynamax Espurr during Max Monday",
+    "eventType": "max-mondays",
+    "heading": "Max Mondays",
+    "link": "https://leekduck.com/events/max-mondays-2026-11-23/",
+    "image": "https://cdn.leekduck.com/assets/img/events/max-battles-kanto.jpg",
+    "start": "2026-11-23T06:00:00.000",
+    "end": "2026-11-23T21:00:00.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "max-mondays-2026-11-30",
+    "name": "Dynamax Cryogonal during Max Monday",
+    "eventType": "max-mondays",
+    "heading": "Max Mondays",
+    "link": "https://leekduck.com/events/max-mondays-2026-11-30/",
+    "image": "https://cdn.leekduck.com/assets/img/events/max-battles-kanto.jpg",
+    "start": "2026-11-30T06:00:00.000",
+    "end": "2026-11-30T21:00:00.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
+  }
+]
diff --git a/test/support/max-events.ts b/test/support/max-events.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5be4222dd1187c1724183812f3886c88bf414534
--- /dev/null
+++ b/test/support/max-events.ts
@@ -0,0 +1,14 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+
+const fixtures = path.resolve(import.meta.dirname, '../fixtures');
+
+/**
+ * ScrapedDuck's events feed as downloaded on 2026-10-20 at 21:54, its max events kept unchanged
+ * (six `max-mondays`, one of them "Dynamax Sneasel during Max Monday" without hours and one
+ * "Max Monday: Pokémon to be announced"; one `max-battles`, the lake trio's Max Battle Day of
+ * 2026-10-24 14:00 to 17:00), the `event` "Dynamax Trails" and one Raid Hour (Palkia, 2026-10-21).
+ */
+export function readMaxEventFeed(): unknown {
+  return JSON.parse(readFileSync(path.join(fixtures, 'max-events.json'), 'utf8'));
+}
````

### Task 4: 8X-2 task 4: max tiers in /admin boss, docs

Prototype commit: `96d52f8bb9286d04fd4cb814ec6dd2f4535411b3`

The tier option of /admin boss add, hide, shiny and list offers the max
tiers (Dynamax 1★ to 5★, Gigantamax) after the raid tiers; autoset keeps
the raid tiers only and refuses a max one (a max battle has no egg). An
override with a max tier goes to the max boss list, refused while max
battles are off; a mega is refused as a max boss; a shiny override
without a tier is a raid override, and the answers say "any raid tier".
remove offers and removes the overrides of both lists (one table numbers
them); list shows the max bosses after the raid bosses, the bosses the
feed lists ahead of their start under Coming; sync max:True reads the
max boss feed. The boss report takes the family (familyReport). Max
boss changes are not announced (said at the announcer). /boss-tier
stays raids only.

Docs: utilities.md (the two families, max tiers, the feed and its
mapping, the game master's lists, the featured boss, /admin boss),
testing.md (the max boss helpers), the new-instance guide (maxBattles).

**Files:**

```
 docs/architecture/testing.md              |   2 +-
 docs/architecture/utilities.md            |   6 ++
 docs/guides/new-instance.md               |   2 +-
 src/commands/admin/boss-input.ts          |  88 ++++++++++++++----
 src/commands/admin/boss-list.test.ts      |   4 +-
 src/commands/admin/boss-list.ts           | 170 ++++++++++++++++++++++++++++++----
 src/commands/admin/boss-max.test.ts       | 174 +++++++++++++++++++++++++++++++++++
 src/commands/admin/boss-overrides.test.ts |   6 +-
 src/commands/admin/boss-overrides.ts      | 250 +++++++++++++++++++++++++++++++++-----------------
 src/domain/pogo/boss-report.ts            |  83 ++++++++++-------
 src/services/raid-boss-announcer.ts       |   7 +-
 test/support/boss-commands.ts             |  12 ++-
 test/support/max-boss-service.ts          |   8 +-
 test/support/raid-bosses.ts               |  27 ++++--
 14 files changed, 671 insertions(+), 168 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/admin/boss-list.test.ts src/commands/admin/boss-max.test.ts src/commands/admin/boss-overrides.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 96d52f8bb9286d04fd4cb814ec6dd2f4535411b3 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-2 task 4: max tiers in /admin boss, docs`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index eb93bc85e1f14b629e4d3e4c60c640ddd31ff3a8..8dbb3af96812f7169ea95f333f034d493c94b037 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -6,7 +6,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 - Tests are colocated: `*.test.ts` (unit, no Docker) and `*.db.test.ts` (needs Docker). Test against real MySQL and real pino loggers (`test/support/`) rather than mocks. A run of the database suite starts one MySQL container (`test/support/mysql-global-setup.ts`); `startDatabase()` (`test/support/mysql.ts`) gives each caller a database and a user of its own in it and drops both at `stop()`. The user also has `PROCESS`, to see the server's transactions: a test that has a statement wait for a lock asserts the wait (`information_schema.innodb_trx`, joined to `processlist` on its own user, since the server is shared): `lockWaits(db, holder)` (`test/support/lock-waits.ts`) asks until a transaction other than the holder's (`connectionId(trx)`) waits, every 150 ms (InnoDB fills the table anew only once it has not been read for 0.1 seconds), with a deadline of ten seconds.
 - A database test that a statement draws no warning of MySQL (a deprecated syntax, `DEPRECATED_SYNTAX` 1287) runs it through `lastWarnings(db, work)` (`test/support/mysql-warnings.ts`): `work` in a transaction of its own on one connection, then `show warnings`, which follows its last statement rather than the commit's (plan 8W-3).
-- Tests never use the network. Game data in tests comes from the fixtures built by `scripts/game-data/make-fixtures.ts` (`catalogueFixture()`, `gameDataFixture()`); raid bosses come from `test/support/raid-bosses.ts` (`readRaidBossFeed()`, `raidBossesFixture()`, and `MemoryRaidBossStore` for the service).
+- Tests never use the network. Game data in tests comes from the fixtures built by `scripts/game-data/make-fixtures.ts` (`catalogueFixture()`, `gameDataFixture()`); raid bosses come from `test/support/raid-bosses.ts` (`readRaidBossFeed()`, `raidBossesFixture()`, and `MemoryRaidBossStore` for the service, a `MemoryBossStore` of the raid family). Max bosses (plan 8X-2): the recorded Pokebattler feed `readPokebattlerFeed()`, a feed of its shape `pokebattlerFeed(tiers)`, `MAX_FEED_READ_AT`, `MAX_ZONE` and `at(local)` (`test/support/max-bosses.ts`), the recorded max events `readMaxEventFeed()` (`test/support/max-events.ts`), and `maxBossServiceWith()` (`test/support/max-boss-service.ts`: a real `MaxBossService` over `MemoryMaxBossStore`, nothing stored yet, `restarted()` for a restart); `bossCommandsWith({ max: true })` turns max battles on for `/admin boss`, its override ids counted with the raid bosses' as in the one table (`ids`).
 - Gyms and regions in tests are the invented ones of `test/support/gyms.ts` (never production rows); `createTestContext()` provides `ctx.gyms`, `ctx.pokemon` and `ctx.maps` from `test/support/providers.ts`.
 
 ## How the suites run
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 0b4a3dbc8831de18925298bbfadacab05ae08a34..5b373ae4538eb16d25293f4b30073890ca6f0462 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -21,6 +21,12 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 - There is no EX raid tier (removed in plan 4F; none since 2020): `RaidLevel` has no `EX`. What is stored with it is tolerated, never written: a raid's state document reads `EX` as `Elite`, `RaidBoss` rows with an unknown level are left out, an override with one is logged once, the feed's EX heading is an unknown heading, the retired settings keys are stripped before the strict check (`withoutRetiredSettings`), and migration 009 made EX wants elite wants. Elite raids are rare (Matt, 2026-10-12): wherever they compete with another feature the other feature wins. Elite raid gyms are another matter: they keep their data, staff's views and their copies, but members no longer see the mark (plan 8D; see `gyms-and-regions.md`).
 - Raid bosses come from `ctx.raidBosses` (`bosses()`, `bossesOf(tier)`, `autoset(tier)`): the feed's list (`settings.raidBosses`, synced into the `RaidBoss` table by `RaidBossService`) with the moderators' overrides (`RaidBossOverride`) applied. A boss newer than the game master has no catalogue entry (`entry` is undefined): show its `name`. The legacy `Pokemon.tier` / `exclusive` / `mega` / `elite` / `shiny` columns and `AutosetPokemon` are never read. The feed is ScrapedDuck's `raids.json` (Leek Duck's raid boss page as data): a boss is a display name, a heading text and a picture address, and `matchBoss` (`src/domain/pogo/raid-boss-feed.ts`) gives it a catalogue entry only when the picture's file name (`pm<dex>.f<FORM>.icon.png`) and the name do not contradict each other; otherwise it stays unresolved (listed by the feed's name, without stats), never the wrong Pokémon. `raid-boss-sweep.test.ts` checks every entry of the catalogue; a heading Pine does not know is reported, its bosses left out. `npm run raid-bosses:check` shows how the live feed is read.
 - Staff change the raid boss list only through `ctx.raidBossAdmin` (`RaidBossService` as `RaidBossAdmin`: overrides, `feedBosses()`, `sync()`; override writes and the end of a sync run one at a time). A sync's change is `FeedChange` with `seen`, the difference of `effectiveBosses` before and after with the same overrides (`diffBosses`, `src/domain/pogo/boss-diff.ts`): what members see. `RaidBossAnnouncer` posts `seen` in every server's bot-updates channel when `settings.raidBosses.announceChanges`, and the out-of-date warning (time, never the error) in the moderators' channel; nothing before `ready()`, nothing after `close()`. A failed sync has a `kind` (never show `reason`). A new autoset for a tier replaces the tier's earlier one. A boss the game data does not know has a key starting with `UNKNOWN_KEY_PREFIX` (`~`), never equal to a catalogue key and never stored; `howIdentified` says how a feed boss was matched.
+- Both boss lists are one machine with two families (plan 8X-2): `BossFeedService<T>` (`src/services/boss-feed-service.ts`: the stored list at start, the first read when it is older than the refresh, retries, the out-of-date warning, override writes one at a time) with a `BossFeedFamily` (its noun in the log, its parser, its list in effect, its override rules); `RaidBossService` and `MaxBossService` are its families. The list rules (`familyBosses`, `familyOverrideKeys`, `familyReport`, `diffFeedIn`, `diffBossesIn`) take the family's tier operations (`RAID_OPS`, `MAX_OPS`); `effectiveBosses`, `bossReport` and the rest keep their raid signatures. The tables are kept apart per family by their levels (`RaidBossRepository`: every level but the max tiers, so the retired EX level stays the raids' to report; `MaxBossRepository`: `MAX_TIERS`): every read and write filters by the family, and an override without a tier (a shiny one for every tier) is a raid override.
+- Max battle tiers are `MaxTier` (`D1` to `D5`, `G`; `src/domain/pogo/max-tier.ts`), the one spelling in the domain, the state document, `RaidBoss.level` and the history; `BattleKind` (`raid`, `dynamax`, `gigantamax`, `battleKindOf(tier)`) is only for lobby sizes and train kinds; their words are there too (`maxTierLabel` "Dynamax 2★", `maxBossTitle` "Dynamax Machamp (2★)", `maxBossChoiceName` "Machamp · Dynamax 2★" / "Gigantamax Machamp").
+- Max bosses come from `ctx.maxBosses` (`bosses()`: the list in effect, D1 to G, then name; none while `settings.maxBattles` is absent, `NO_MAX_BOSSES`), staff's list from `ctx.maxBossAdmin` (undefined while off). The feed is Pokebattler's `GET /raids` (`settings.maxBattles.url`, read every `refreshMinutes`, 6 hours unless set; about 700 KB): `parseMaxBossFeed` (`src/domain/pogo/max-bosses.ts`) reads `RAID_LEVEL_1_MAX` to `_5_MAX` as `D1` to `D5` and `RAID_LEVEL_6_MAX` as `G`, verified or not (Matt, 2026-10-20), never the `_FUTURE` and `_LEGACY` twins nor the raid tiers (Pokebattler is no raid boss source); a max tier it does not know that has bosses is reported. `maxBossOf` maps an id: the entry of that Pokebattler id, else the entry the id names as a catalogue key or alias (a bare species is the species, or the default form of a species known by one); a Gigantamax id drops `_GIGANTAMAX` and is that Pokémon with the tier `G`, never an entry of its own; a mega is no max boss; an unknown id is a boss by a name made of it, logged once. An upcoming boss is a boss from the start of its `startDate`'s day in `settings.timezone` (Pokebattler gives one instant for an event held at a local hour: the lake trio's 14:00 Max Battle Day is 17:00 in New York), stored as its `firstSeen` (`FeedBoss.startsAt`), so the list leaves it out until then, after a restart too. `dynamaxPokemon` is not read. Max boss changes are not announced.
+- What may be typed as a max boss off the lists is the game master's (`GameData.maxBattles`, `catalogue.canDynamax` / `canGigantamax`, `GAME_DATA_VERSION` 6): the modes of `pokemonExtendedSettings.breadOverrides` (`BREAD_MODE`; `BREAD_DOUGH_MODE`, `_2` for Gigantamax), which every such Pokémon has, not `BREAD_POKEMON_SCALING_SETTINGS`, which lists only the 70 species with visuals of their own. `typedMaxBoss(entry, bosses, catalogue)` gives a typed Pokémon's listed bosses and the other tiers it may battle in. A Gigantamax boss's picture is `maxBossPicture` (the game's `pm<dex>.f<FORM>_GIGANTAMAX`, else `pm<dex>.fGIGANTAMAX`, else its own).
+- The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; one the feed drops once it is over is kept while it started less than eight days ago (`mergedMax`, in memory: a restart in the week loses the week's Monday). Their hours are always the feed's own; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3): the featured bosses first, then 5 stars down to 1, Gigantamax last. A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
+- `/admin boss` takes the max tiers after the raid tiers (`BossTier`, `readTier`; not `autoset`, `readRaidTier`): `add`, `hide` and `shiny` with a max tier change the max boss list (refused while max battles are off, `maxAdminOf`; a Pokémon the game data does not list as that kind of max boss gets a warning line, not a refusal), `remove` offers the overrides of both (one table numbers them), `list` shows the max bosses after the raid bosses, their upcoming ones under Coming, and `sync max:True` reads the max feed. `/boss-tier` stays raids only.
 - Pokémon nicknames change only through `ctx.nicknames` (`PokemonSearchService`: changes and reloads one at a time; `nicknameProblem` in `src/domain/pogo/nickname-rules.ts` refuses words other commands read, names and nicknames of other Pokémon; removal from every legacy row of the Pokémon; the column stays `, `-joined lower case).
 
 ## Pictures and emoji
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index e934aa81e657efa9db0bdea89ca961e3a553daa8..ae81036e0f0e6ee198250f3ec7883dff1f97f054 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -120,7 +120,7 @@ The settings that matter first:
 - `roles.unown`: the name of an Unown role the server had before Pine: its holders are given a want for Unown. Leave it as it is if you have none.
 - `raidEvents.weeklyRaidHour`: the weekly Raid Hour, in your time zone.
 
-The rest has working defaults (`lobbies`, for example, is how many trainers one lobby of a raid, a Dynamax battle and a Gigantamax battle holds: 20, 4 and 100, as in the game; `raid` only sets when a group of a raid or a train is told to split up, since members choose their own groups there, and Join fills groups by `dynamax` and `gigantamax` only in max battles and Gigantamax trains, which are still to come). The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). After an edit while the bot runs, `./pine restart`.
+The rest has working defaults (`lobbies`, for example, is how many trainers one lobby of a raid, a Dynamax battle and a Gigantamax battle holds: 20, 4 and 100, as in the game; `raid` only sets when a group of a raid or a train is told to split up, since members choose their own groups there, and Join fills groups by `dynamax` and `gigantamax` only in max battles and Gigantamax trains, which are still to come). Max battles are off until you add a `maxBattles` block, `"maxBattles": { "url": "https://fight.pokebattler.com/raids" }` (the max bosses are read from Pokebattler every 6 hours, `refreshMinutes`; `firstBattle` and `lastBattle` are the hours max battles can be fought, 06:00 and 21:00 unless set). The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). After an edit while the bot runs, `./pine restart`.
 
 ## 4. Start the bot
 
diff --git a/src/commands/admin/boss-input.ts b/src/commands/admin/boss-input.ts
index 359870061736ee8c0ea88313cc3f7ecf54bfd441..86bd084ee191c2503161840ebd56397a3e25cef4 100644
--- a/src/commands/admin/boss-input.ts
+++ b/src/commands/admin/boss-input.ts
@@ -12,16 +12,20 @@ import {
   RAID_LEVELS,
   raidTier,
   raidTierLabel,
+  sameRaidTier,
   type RaidTier,
 } from '../../domain/pogo/raid-tier.js';
+import { isMaxTier, MAX_TIERS, maxTierLabel, type MaxTier } from '../../domain/pogo/max-tier.js';
 import { searchTokens } from '../../domain/search/text.js';
+import type { MaxBossAdmin } from '../../services/max-boss-service.js';
 import { plain, truncate } from '../../render/text.js';
 import { CHOICE_NAME, MAX_CHOICES, showsGuessed, type Choice } from '../choices.js';
 import { namedPokemon } from '../pokemon-option.js';
 
 /** The subcommand group of `/admin` the boss list lives under. */
 export const BOSS_GROUP = 'boss';
-export const BOSS_DESCRIPTION = 'The raid boss list: what the feed says, and your changes to it';
+export const BOSS_DESCRIPTION =
+  'The raid and max boss lists: what the feeds say, and your changes to them';
 
 /** The longest `days` an override may be given; 0 is "for good". */
 export const MAX_DAYS = 90;
@@ -38,13 +42,50 @@ export function allTiers(): RaidTier[] {
   );
 }
 
-/** The value of a tier among the choices of the `tier` option: `T5`, `T5:shadow`. */
-export function tierValue(tier: RaidTier): string {
+/**
+ * A tier of either boss list (plan 8X-2): a raid tier, or a max tier (`D1` to `D5`, `G`), which
+ * is a string and so told apart by `isMaxBossTier`.
+ */
+export type BossTier = RaidTier | MaxTier;
+
+export function isMaxBossTier(tier: BossTier): tier is MaxTier {
+  return typeof tier === 'string';
+}
+
+/** `T5`, `Shadow T5`, `Dynamax 2★`, `Gigantamax`. */
+export function bossTierLabel(tier: BossTier): string {
+  return isMaxBossTier(tier) ? maxTierLabel(tier) : raidTierLabel(tier);
+}
+
+export function sameBossTier(a: BossTier, b: BossTier): boolean {
+  if (isMaxBossTier(a) || isMaxBossTier(b)) return a === b;
+  return sameRaidTier(a, b);
+}
+
+/** Every tier an override can have: the raid tiers, then the max tiers. */
+export function adminTiers(): BossTier[] {
+  return [...allTiers(), ...MAX_TIERS];
+}
+
+/** The value of a tier among the choices of the `tier` option: `T5`, `T5:shadow`, `D2`, `G`. */
+export function tierValue(tier: BossTier): string {
+  if (isMaxBossTier(tier)) return tier;
   return tier.shadow ? `${tier.level}:shadow` : tier.level;
 }
 
 /** The tier of a choice of the `tier` option; a `UserError` for anything else. */
-export function readTier(value: string): RaidTier {
+export function readTier(value: string): BossTier {
+  if (isMaxTier(value)) return value;
+  return readRaidTier(value);
+}
+
+/** The raid tier of a choice of the `tier` option; a `UserError` for anything else. */
+export function readRaidTier(value: string): RaidTier {
+  if (isMaxTier(value)) {
+    throw new UserError(
+      'A max battle has no egg, so there is nothing to hatch as: `autoset` is for raid tiers.',
+    );
+  }
   const [level = '', shadow, ...rest] = value.split(':');
   const tier =
     isRaidLevel(level) && rest.length === 0 && (shadow === undefined || shadow === 'shadow')
@@ -54,16 +95,32 @@ export function readTier(value: string): RaidTier {
   return tier;
 }
 
-/** The `tier` option: a choice of every tier the bot knows. */
-export function tierOption(required: boolean, description = 'The raid tier') {
+/**
+ * The `tier` option: a choice of every tier the bot knows, the max tiers after the raid tiers
+ * (16 of Discord's 25; `raidOnly` leaves them out, for `autoset`).
+ */
+export function tierOption(
+  required: boolean,
+  description = 'The raid or max battle tier',
+  raidOnly = false,
+) {
+  const tiers: BossTier[] = raidOnly ? allTiers() : adminTiers();
   return (option: SlashCommandStringOption): SlashCommandStringOption =>
     option
       .setName('tier')
       .setDescription(description)
       .setRequired(required)
-      .addChoices(
-        allTiers().map((tier) => ({ name: raidTierLabel(tier), value: tierValue(tier) })),
-      );
+      .addChoices(tiers.map((tier) => ({ name: bossTierLabel(tier), value: tierValue(tier) })));
+}
+
+/** The max boss list for staff; a `UserError` while max battles are off. */
+export function maxAdminOf(ctx: AppContext): MaxBossAdmin {
+  if (!ctx.maxBossAdmin) {
+    throw new UserError(
+      'Max battles are off here: the settings have no `maxBattles`, so there is no max boss list.',
+    );
+  }
+  return ctx.maxBossAdmin;
 }
 
 /** The `days` option: how long an override lasts. */
@@ -114,7 +171,7 @@ export interface ChosenPokemon {
  */
 export function bossPokemonChoices(ctx: AppContext, typed: string): Choice[] {
   const words = searchTokens(typed);
-  const bosses = ctx.raidBosses.bosses();
+  const bosses = [...ctx.raidBosses.bosses(), ...ctx.maxBosses.bosses()];
   const unknown = bosses
     .filter((boss) => !boss.entry)
     .map((boss) => ({
@@ -169,12 +226,11 @@ export function chosenPokemon(ctx: AppContext, value: string): ChosenPokemon {
   if (ids?.[1]) {
     const pokemonId = ids[1];
     const form = ids[2] ?? null;
-    const feed = ctx.raidBossAdmin
-      .feedBosses()
-      .find((boss) => boss.pokemonId === pokemonId && boss.form === form);
-    const override = ctx.raidBossAdmin
-      .overrides()
-      .find((one) => one.pokemonId === pokemonId && one.form === form);
+    const same = (one: BossIds): boolean => one.pokemonId === pokemonId && one.form === form;
+    const max = ctx.maxBossAdmin;
+    const feed: { name: string } | undefined =
+      ctx.raidBossAdmin.feedBosses().find(same) ?? max?.feedBosses().find(same);
+    const override = ctx.raidBossAdmin.overrides().find(same) ?? max?.overrides().find(same);
     if (!feed && !override) {
       throw new UserError('That boss is no longer in the feed. Pick again from the list.');
     }
diff --git a/src/commands/admin/boss-list.test.ts b/src/commands/admin/boss-list.test.ts
index c42db411da185b44bbb607418b230b8788c5cf5b..fcf73e8928d298f3de42b88c31e179af88c52085 100644
--- a/src/commands/admin/boss-list.test.ts
+++ b/src/commands/admin/boss-list.test.ts
@@ -49,7 +49,7 @@ describe('/admin boss: who may use it', () => {
     const json = admin.data.toJSON();
     const group = json.options?.find((option) => option.name === 'boss');
     expect(group?.description).toBe(
-      'The raid boss list: what the feed says, and your changes to it',
+      'The raid and max boss lists: what the feeds say, and your changes to them',
     );
     expect([...admin.subcommands.keys()]).toEqual(
       expect.arrayContaining(['boss list', 'boss sync']),
@@ -125,7 +125,7 @@ describe('/admin boss list', () => {
     expect(text).toContain(`- **Zekrom** · added (#1, until <t:${at(FEED_READ_AT + 30 * DAY)}:d>)`);
     expect(text).toContain(
       '- **Yveltal** · from the feed, found by picture and name, since ' +
-        `<t:${at(FEED_READ_AT)}:d> · never shiny (any tier) (#4, for good)`,
+        `<t:${at(FEED_READ_AT)}:d> · never shiny (any raid tier) (#4, for good)`,
     );
     expect(text).toContain('**Hidden**\n- Celebi (T5)');
     expect(text).toContain('- Starmie (T3) · hidden (#2, for good)\n');
diff --git a/src/commands/admin/boss-list.ts b/src/commands/admin/boss-list.ts
index 91d012f841cd8631227808c695472b466c6e2a36..cf8d391b80e889eb94fe82b9ea2efe04e5258a86 100644
--- a/src/commands/admin/boss-list.ts
+++ b/src/commands/admin/boss-list.ts
@@ -6,8 +6,10 @@ import {
 import type { AppContext } from '../../app-context.js';
 import type { StoredBoss } from '../../db/repositories/raid-boss-repository.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
-import { bossReport, type ReportedOverride } from '../../domain/pogo/boss-report.js';
+import { bossReport, familyReport, type ReportedOverride } from '../../domain/pogo/boss-report.js';
 import { feedLookupOf } from '../../domain/pogo/feed-lookup.js';
+import { MAX_OPS, maxBossesAt } from '../../domain/pogo/max-bosses.js';
+import { MAX_TIERS, maxTierLabel, type MaxTier } from '../../domain/pogo/max-tier.js';
 import {
   howIdentified,
   isMegaLevel,
@@ -29,7 +31,15 @@ import {
 } from '../../render/boss-changes.js';
 import { count, fitItems, fitMessages, LIMITS, plain, timestamp } from '../../render/text.js';
 import type { FeedChange, SyncFailure, SyncResult } from '../../services/raid-boss-service.js';
-import { BOSS_GROUP, readTier, tierOption } from './boss-input.js';
+import {
+  BOSS_GROUP,
+  bossTierLabel,
+  isMaxBossTier,
+  maxAdminOf,
+  readTier,
+  tierOption,
+  type BossTier,
+} from './boss-input.js';
 
 const IDENTIFIED: Readonly<Record<Identification, string>> = {
   agree: 'found by picture and name',
@@ -47,12 +57,12 @@ const OLD_REASONS: Readonly<Record<ReportedOverride['old'][number], string>> = {
 };
 
 /** How long an override lasts: `until <date>` or `for good`. */
-export function lasting(override: BossOverride): string {
+export function lasting(override: Pick<BossOverride, 'expiresAt'>): string {
   return override.expiresAt === null ? 'for good' : `until ${timestamp(override.expiresAt, 'd')}`;
 }
 
 /** `added (#3, until …)`, and why it may be time to remove it. */
-function overrideText(reported: ReportedOverride): string {
+function overrideText(reported: ReportedOverride<BossTier>): string {
   const { override, old } = reported;
   const tag = `${actionText(override)} (#${String(override.id)}, ${lasting(override)})`;
   return old.length === 0
@@ -61,14 +71,14 @@ function overrideText(reported: ReportedOverride): string {
 }
 
 /** What an override does to the boss it acts on. */
-function actionText(override: BossOverride): string {
+function actionText(override: BossOverride<BossTier>): string {
   switch (override.action) {
     case 'add':
       return 'added';
     case 'autoset':
       return 'eggs hatch as it';
     case 'shiny':
-      return `${override.shiny ? 'can be shiny' : 'never shiny'}${override.tier === null ? ' (any tier)' : ''}`;
+      return `${override.shiny ? 'can be shiny' : 'never shiny'}${override.tier === null ? ' (any raid tier)' : ''}`;
     case 'hide':
       return 'hidden';
   }
@@ -102,18 +112,28 @@ function bossLine(
 }
 
 /** An override that acts on no boss of the list, or hides one. */
-function overrideLine(reported: ReportedOverride): string {
+function overrideLine(reported: ReportedOverride<BossTier>): string {
   const { override } = reported;
-  const tier = override.tier === null ? 'every tier' : raidTierLabel(override.tier);
+  const tier = override.tier === null ? 'every raid tier' : bossTierLabel(override.tier);
   return `- ${plain(reported.name)} (${tier}) · ${overrideText(reported)}`;
 }
 
 /**
  * What `/admin boss list` says: when the feed was read and what it has that Pine does not know,
  * then the bosses tier by tier as members see them, each with where it came from and what acts
- * on it, then what is hidden and what acts on nothing. With `tier`, that tier only.
+ * on it, then what is hidden and what acts on nothing. With `tier`, that tier only; a max tier
+ * shows the max boss list (`maxListLines`), and without a tier it follows the raid bosses where
+ * max battles are on.
  */
-export function bossListLines(ctx: AppContext, now: number, tier?: RaidTier): string[] {
+export function bossListLines(ctx: AppContext, now: number, tier?: BossTier): string[] {
+  if (tier !== undefined && isMaxBossTier(tier)) return maxListLines(ctx, now, tier);
+  return [
+    ...raidListLines(ctx, now, tier),
+    ...(tier === undefined && ctx.maxBossAdmin ? maxListLines(ctx, now) : []),
+  ];
+}
+
+function raidListLines(ctx: AppContext, now: number, tier?: RaidTier): string[] {
   const admin = ctx.raidBossAdmin;
   const report = bossReport(admin.feedBosses(), admin.overrides(), ctx.gameData.catalogue, now);
   const inTier = (other: RaidTier | null): boolean =>
@@ -159,6 +179,80 @@ export function bossListLines(ctx: AppContext, now: number, tier?: RaidTier): st
   return lines;
 }
 
+/**
+ * The max boss list (plan 8X-2), said as the raid list is: when the feed was read, the bosses
+ * tier by tier from D1 to G with where each came from and what acts on it, the bosses the feed
+ * lists ahead of their start (`Coming`, with when they start), then what is hidden and what acts
+ * on nothing. With `tier`, that tier only. While max battles are off, a line that says so.
+ */
+function maxListLines(ctx: AppContext, now: number, tier?: MaxTier): string[] {
+  const admin = ctx.maxBossAdmin;
+  if (!admin) {
+    return ['**Max bosses** · max battles are off here (the settings have no `maxBattles`).'];
+  }
+  const feed = admin.feedBosses();
+  const report = familyReport(
+    MAX_OPS,
+    maxBossesAt,
+    feed,
+    admin.overrides(),
+    ctx.gameData.catalogue,
+    now,
+  );
+  const inTier = (other: MaxTier | null): boolean =>
+    tier === undefined || other === null || other === tier;
+  const read = admin.lastSyncedAt;
+  const lines = [
+    read === undefined
+      ? '**Max bosses** · the feed has not been read yet'
+      : `**Max bosses** · the feed was read ${timestamp(read, 'R')}`,
+  ];
+  if (admin.unknownLevels.length > 0) {
+    lines.push(
+      'The feed has tiers I do not know, whose bosses are left out: ' +
+        `${fitItems(admin.unknownLevels.map(plain), 1000)}.`,
+    );
+  }
+  const shown = report.bosses.filter((one) => inTier(one.boss.tier));
+  for (const shownTier of MAX_TIERS) {
+    const ofTier = shown.filter((one) => one.boss.tier === shownTier);
+    if (ofTier.length === 0) continue;
+    lines.push(`**${maxTierLabel(shownTier)}**`);
+    for (const { boss, rows, overrides } of ofTier) {
+      const parts = [`- **${plain(boss.name)}**`];
+      if (boss.shiny) parts.push('shiny');
+      if (!boss.entry) parts.push(`**not in the game data** (${idsText(boss)})`);
+      const [row] = rows;
+      if (row) parts.push(`from the feed, since ${timestamp(row.firstSeen, 'd')}`);
+      for (const reported of overrides) parts.push(overrideText(reported));
+      lines.push(parts.join(' · '));
+    }
+  }
+  if (shown.length === 0) {
+    lines.push(tier === undefined ? 'There are no max bosses.' : 'That tier has no bosses.');
+  }
+  const coming = feed.filter((row) => row.firstSeen > now && inTier(row.tier));
+  if (coming.length > 0) {
+    lines.push(
+      '**Coming**',
+      ...coming.map(
+        (row) =>
+          `- **${plain(row.name)}** (${maxTierLabel(row.tier)}) · from ${timestamp(row.firstSeen, 'f')}`,
+      ),
+    );
+  }
+  const hidden = report.hidden.filter((one) => inTier(one.override.tier));
+  if (hidden.length > 0) lines.push('**Hidden**', ...hidden.map(overrideLine));
+  const idle = report.idle.filter((one) => inTier(one.override.tier));
+  if (idle.length > 0) {
+    lines.push(
+      '**Overrides that change nothing now** (their boss is hidden, or is no boss of that tier now)',
+      ...idle.map(overrideLine),
+    );
+  }
+  return lines;
+}
+
 /**
  * The lines in blocks: a heading (a line that is no item, `- …`) with the items under it, so
  * that a split between messages does not leave a heading at the end of one and its bosses in the
@@ -194,7 +288,7 @@ export const listBosses: SubcommandPart = {
   group: BOSS_GROUP,
   data: new SlashCommandSubcommandBuilder()
     .setName('list')
-    .setDescription('Show the raid boss list, where each boss came from, and your overrides')
+    .setDescription('Show the boss lists, where each boss came from, and your overrides')
     .addStringOption(tierOption(false, 'Only this tier')),
   help: {
     details:
@@ -203,8 +297,10 @@ export const listBosses: SubcommandPart = {
       'override, and what overrides act on it with their number and expiry. A boss the game ' +
       'data does not know yet is listed by the name the feed gives, with its ids. Hidden ' +
       'bosses and overrides that change nothing are listed apart; an override older than 30 ' +
-      'days, or one the feed has made pointless, is marked "old?".',
-    examples: ['/admin boss list', '/admin boss list tier:T5'],
+      'days, or one the feed has made pointless, is marked "old?". Where max battles are on, ' +
+      "the max bosses follow (Pokebattler's feed), with the bosses it lists ahead of their start " +
+      'under Coming; a max battle tier shows that tier only.',
+    examples: ['/admin boss list', '/admin boss list tier:T5', '/admin boss list tier:Gigantamax'],
   },
   defer: 'ephemeral',
   async execute(interaction, ctx) {
@@ -309,22 +405,64 @@ export function syncLines(ctx: AppContext, result: SyncResult): string[] {
   return lines;
 }
 
+/**
+ * What `/admin boss sync max:True` says of a read of the max boss feed (plan 8X-2): whether it
+ * was read, and how many bosses came and went, and the tiers it does not know. `read` is when it
+ * was last read before.
+ */
+export function maxSyncLines(read: number | undefined, result: SyncResult<MaxTier>): string[] {
+  if (result.status === 'failed') {
+    return [
+      `I could not read the max boss feed: ${failureText(result.kind, result.httpStatus)}.`,
+      read === undefined
+        ? 'It has never been read; the list has no bosses but your overrides.'
+        : `The list stays as it was when the feed was last read, ${timestamp(read, 'R')}.`,
+    ];
+  }
+  const lines =
+    result.status === 'unchanged'
+      ? ['The max boss feed lists the same bosses as before.']
+      : [
+          'The max boss feed lists other bosses now: ' +
+            `${count(result.change.added.length, 'boss', 'bosses')} came, ` +
+            `${String(result.change.removed.length)} went. \`/admin boss list\` shows them.`,
+        ];
+  if (result.unknownLevels) {
+    lines.push(
+      'The feed has tiers I do not know, whose bosses are left out: ' +
+        `${fitItems(result.unknownLevels.map(plain), 1000)}.`,
+    );
+  }
+  return lines;
+}
+
 /** `/admin boss sync`. */
 export const syncBosses: SubcommandPart = {
   group: BOSS_GROUP,
   data: new SlashCommandSubcommandBuilder()
     .setName('sync')
-    .setDescription('Read the raid boss feed now, instead of at the next hourly read'),
+    .setDescription('Read the raid boss feed now, instead of at the next hourly read')
+    .addBooleanOption((option) =>
+      option
+        .setName('max')
+        .setDescription('Read the max boss feed instead (where max battles are on)'),
+    ),
   help: {
     details:
       'Reads the feed at once and says what changed. A read that fails leaves the list as it ' +
-      'was. The game data (names, stats, forms) is not read again by this.',
-    examples: ['/admin boss sync'],
+      'was. The game data (names, stats, forms) is not read again by this. With `max:True` it ' +
+      "reads the max boss feed (Pokebattler's) instead.",
+    examples: ['/admin boss sync', '/admin boss sync max:True'],
   },
   defer: 'ephemeral',
   // A read asks a server of somebody else's; staff need it now and then, not in a loop.
   throttle: { uses: 3, perSeconds: 60 },
   async execute(interaction, ctx) {
+    if (interaction.options.getBoolean('max') === true) {
+      const admin = maxAdminOf(ctx);
+      await sendLines(interaction, maxSyncLines(admin.lastSyncedAt, await admin.sync()));
+      return;
+    }
     const result = await ctx.raidBossAdmin.sync();
     await sendLines(interaction, syncLines(ctx, result));
   },
diff --git a/src/commands/admin/boss-max.test.ts b/src/commands/admin/boss-max.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4c948c6b21b6748ebbaa2f7c8184237b35fcb85a
--- /dev/null
+++ b/src/commands/admin/boss-max.test.ts
@@ -0,0 +1,174 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { bossCommandsWith, choicesOf, textsOf } from '../../../test/support/boss-commands.js';
+import { at as local } from '../../../test/support/max-bosses.js';
+import { admin } from './index.js';
+
+// Plan 8X-2: `/admin boss` with the max tiers beside the raid tiers.
+const NOW = local('2026-10-21T12:00');
+const DAY = 24 * 60 * 60 * 1000;
+const stamp = (ms: number) => String(Math.floor(ms / 1000));
+
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'] });
+  vi.setSystemTime(NOW);
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+async function withMax() {
+  const made = await bossCommandsWith({ max: true });
+  if (!made.max) throw new Error('max battles are off');
+  made.max.state.now = NOW;
+  return { ...made, max: made.max };
+}
+
+const tierChoices = (subcommand: string) => {
+  const group = admin.data.toJSON().options?.find((option) => option.name === 'boss');
+  const part = (group && 'options' in group ? (group.options ?? []) : []).find(
+    (option) => option.name === subcommand,
+  );
+  const tier = (part && 'options' in part ? (part.options ?? []) : []).find(
+    (option) => option.name === 'tier',
+  );
+  return (tier && 'choices' in tier ? (tier.choices ?? []) : []).map((choice) => [
+    choice.name,
+    choice.value,
+  ]);
+};
+
+describe('/admin boss: the tiers', () => {
+  it('offers the max tiers after the raid tiers where an override may have one', () => {
+    for (const subcommand of ['add', 'hide', 'shiny', 'list']) {
+      expect(tierChoices(subcommand).slice(-6), subcommand).toEqual([
+        ['Dynamax 1★', 'D1'],
+        ['Dynamax 2★', 'D2'],
+        ['Dynamax 3★', 'D3'],
+        ['Dynamax 4★', 'D4'],
+        ['Dynamax 5★', 'D5'],
+        ['Gigantamax', 'G'],
+      ]);
+      expect(tierChoices(subcommand)[0], subcommand).toEqual(['T1', 'T1']);
+    }
+  });
+
+  it('offers no max tier for autoset: a max battle has no egg', async () => {
+    expect(tierChoices('autoset').some(([, value]) => value === 'D2')).toBe(false);
+    const made = await withMax();
+    const used = await made.use('boss', 'autoset', { pokemon: 'Machop', tier: 'D2' });
+    expect(textsOf(used).join('\n')).toMatch(/autoset.*raid tiers/);
+    expect(made.max.service.overrides()).toEqual([]);
+  });
+});
+
+describe('/admin boss with a max tier', () => {
+  it('adds a max boss, kept apart from the raid bosses, and shows its tier now', async () => {
+    const made = await withMax();
+    const used = await made.use('boss', 'add', { pokemon: 'Machamp', tier: 'G' });
+    expect(made.max.service.overrides()).toMatchObject([
+      { id: 1, action: 'add', pokemonId: 'MACHAMP', tier: 'G', expiresAt: NOW + 30 * DAY },
+    ]);
+    expect(made.bosses.service.overrides()).toEqual([]);
+    expect(textsOf(used)).toEqual([
+      `Machamp is a boss of Gigantamax (override #1, until <t:${stamp(NOW + 30 * DAY)}:d>).\n` +
+        'It lapses after 30 days unless you give `days` (`days:0` for good), so it does not ' +
+        'outlive the rotation.\n' +
+        '**Gigantamax** now: Machamp',
+    ]);
+  });
+
+  it('hides a max boss from its tier only', async () => {
+    const made = await withMax();
+    const used = await made.use('boss', 'hide', { pokemon: 'Sneasel', tier: 'D1' });
+    expect(textsOf(used)[0]).toMatch(
+      /^Sneasel is hidden from Dynamax 1★ \(override #1, for good\)\./,
+    );
+    expect(made.max.service.bosses().some((boss) => boss.key === 'sneasel')).toBe(false);
+  });
+
+  it('sets a max boss shiny in its tier, and a shiny override without a tier is a raid one', async () => {
+    const made = await withMax();
+    await made.use('boss', 'shiny', { pokemon: 'Machop', 'can-be-shiny': false, tier: 'D2' });
+    expect(made.max.service.bosses().find((boss) => boss.key === 'machop')?.shiny).toBe(false);
+    const every = await made.use('boss', 'shiny', { pokemon: 'Machop', 'can-be-shiny': true });
+    expect(made.bosses.service.overrides()).toMatchObject([{ action: 'shiny', tier: null }]);
+    expect(made.max.service.bosses().find((boss) => boss.key === 'machop')?.shiny).toBe(false);
+    expect(textsOf(every)[0]).toMatch(/can be shiny, in any raid tier/);
+  });
+
+  it('warns, and stores all the same, where the game data has no such max boss', async () => {
+    const made = await withMax();
+    const sneasel = textsOf(await made.use('boss', 'add', { pokemon: 'Sneasel', tier: 'G' }));
+    expect(sneasel[0]?.split('\n')[1]).toBe(
+      'The game data does not list Sneasel as a Gigantamax boss; the override is stored all the same.',
+    );
+    const rattata = textsOf(await made.use('boss', 'hide', { pokemon: 'Rattata', tier: 'D1' }));
+    expect(rattata[0]).toContain('does not list Rattata as a Dynamax boss');
+    expect(made.max.service.overrides()).toHaveLength(2);
+    const machop = textsOf(await made.use('boss', 'add', { pokemon: 'Machop', tier: 'D3' }));
+    expect(machop[0]).not.toContain('does not list');
+  });
+
+  it('refuses a mega as a max boss', async () => {
+    const made = await withMax();
+    const used = await made.use('boss', 'add', { pokemon: 'Mega Venusaur', tier: 'D5' });
+    expect(textsOf(used).join('\n')).toMatch(/no max boss/);
+    expect(made.max.service.overrides()).toEqual([]);
+  });
+
+  it('refuses a max tier while max battles are off', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use('boss', 'add', { pokemon: 'Machamp', tier: 'G' });
+    expect(textsOf(used).join('\n')).toMatch(/Max battles are off/);
+  });
+
+  it('offers and removes overrides of both kinds by their number', async () => {
+    const made = await withMax();
+    await made.use('boss', 'add', { pokemon: 'Zekrom', tier: 'T5' });
+    await made.use('boss', 'add', { pokemon: 'Machamp', tier: 'G' });
+    const choices = choicesOf(await made.typing('boss', 'remove', 'override', ''));
+    expect(choices.map((choice) => choice.value)).toEqual(['id:1', 'id:2']);
+    expect(choices[1]?.name).toMatch(/^#2 Machamp added to Gigantamax · until /);
+    const used = await made.use('boss', 'remove', { override: 'id:2' });
+    expect(textsOf(used)).toEqual([
+      'Removed override #2: Machamp added to Gigantamax.\n**Gigantamax** now has no bosses.',
+    ]);
+    expect(made.max.service.overrides()).toEqual([]);
+    expect(made.bosses.service.overrides()).toHaveLength(1);
+  });
+});
+
+describe('/admin boss list and sync with max battles', () => {
+  it('lists a max tier, an upcoming boss under what is coming', async () => {
+    const made = await withMax();
+    const used = await made.use('boss', 'list', { tier: 'D5' });
+    const text = textsOf(used).join('\n');
+    expect(text).toMatch(/^\*\*Max bosses\*\* · the feed was read <t:\d+:R>/);
+    expect(text).toContain('That tier has no bosses.');
+    expect(text).toContain('**Coming**');
+    expect(text).toContain(
+      `- **Uxie** (Dynamax 5★) · from <t:${stamp(local('2026-10-24T00:00'))}:f>`,
+    );
+    const four = textsOf(await made.use('boss', 'list', { tier: 'D4' })).join('\n');
+    expect(four).toContain('**Dynamax 4★**\n- **Duraludon** · shiny · from the feed, since <t:');
+    expect(four).not.toContain('Raid bosses');
+  });
+
+  it('lists the max bosses after the raid bosses when no tier is given', async () => {
+    const made = await withMax();
+    const text = textsOf(await made.use('boss', 'list')).join('\n');
+    expect(text).toContain('**Raid bosses**');
+    expect(text).toContain('**Max bosses**');
+    expect(text.indexOf('**Raid bosses**')).toBeLessThan(text.indexOf('**Max bosses**'));
+    const off = await bossCommandsWith();
+    expect(textsOf(await off.use('boss', 'list')).join('\n')).not.toContain('Max bosses');
+  });
+
+  it('reads the max boss feed on request', async () => {
+    const made = await withMax();
+    const requests = made.max.state.requests;
+    const used = await made.use('boss', 'sync', { max: true });
+    expect(made.max.state.requests).toBe(requests + 1);
+    expect(textsOf(used)).toEqual(['The max boss feed lists the same bosses as before.']);
+  });
+});
diff --git a/src/commands/admin/boss-overrides.test.ts b/src/commands/admin/boss-overrides.test.ts
index d9095fbb25f09307ce839bef999ec8aa6e7378f5..69f5202ffe04e61439de1a6da701ac722a8769a7 100644
--- a/src/commands/admin/boss-overrides.test.ts
+++ b/src/commands/admin/boss-overrides.test.ts
@@ -239,7 +239,7 @@ describe('/admin boss shiny', () => {
     const made = await bossCommandsWith();
     const every = await made.use('boss', 'shiny', { pokemon: 'yveltal', 'can-be-shiny': false });
     expect(textsOf(every)).toEqual([
-      'Yveltal is never shiny, in any tier (override #1, for good).\n' +
+      'Yveltal is never shiny, in any raid tier (override #1, for good).\n' +
         '**T5** now: Yveltal · eggs hatch as Yveltal',
     ]);
     const one = await made.use('boss', 'shiny', {
@@ -274,7 +274,7 @@ describe('/admin boss remove', () => {
     await made.use('boss', 'shiny', { pokemon: 'yveltal', 'can-be-shiny': false });
     expect(choicesOf(await made.typing('boss', 'remove', 'override', '')).slice(2)).toEqual([
       { name: '#3 Mewtwo: eggs of T5 hatch as it · for good', value: 'id:3' },
-      { name: '#4 Yveltal: never shiny (any tier) · for good', value: 'id:4' },
+      { name: '#4 Yveltal: never shiny (any raid tier) · for good', value: 'id:4' },
     ]);
   });
 
@@ -307,7 +307,7 @@ describe('/admin boss remove', () => {
     await made.use('boss', 'shiny', { pokemon: 'yveltal', 'can-be-shiny': false });
     const typed = await made.use('boss', 'remove', { override: '#2' });
     expect(textsOf(typed)).toEqual([
-      'Removed override #2: Yveltal: never shiny (any tier).\n' +
+      'Removed override #2: Yveltal: never shiny (any raid tier).\n' +
         '**T5** now: Yveltal (shiny) · eggs hatch as Yveltal',
     ]);
   });
diff --git a/src/commands/admin/boss-overrides.ts b/src/commands/admin/boss-overrides.ts
index ab6b75d00c989a5967d4ea1cf84e125698b5907b..936b98583f20fbbdf0fbb4867e7656c332ee0e35 100644
--- a/src/commands/admin/boss-overrides.ts
+++ b/src/commands/admin/boss-overrides.ts
@@ -3,26 +3,33 @@ import { DateTime } from 'luxon';
 import type { AppContext } from '../../app-context.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
 import { UserError } from '../../discord/errors.js';
-import { bossReport, type ReportedOverride } from '../../domain/pogo/boss-report.js';
+import { bossReport, familyReport, type ReportedOverride } from '../../domain/pogo/boss-report.js';
+import { MAX_OPS, maxBossesAt } from '../../domain/pogo/max-bosses.js';
 import { isMegaLevel } from '../../domain/pogo/raid-boss-feed.js';
 import {
   autosetBoss,
+  type Boss,
   type BossOverride,
   type NewBossOverride,
-  type RaidBoss,
 } from '../../domain/pogo/raid-bosses.js';
-import { raidTierLabel, sameRaidTier, type RaidTier } from '../../domain/pogo/raid-tier.js';
+import { raidTierLabel, sameRaidTier } from '../../domain/pogo/raid-tier.js';
 import { plain, truncate } from '../../render/text.js';
 import { CHOICE_NAME, MAX_CHOICES } from '../choices.js';
 import {
   BOSS_GROUP,
   bossPokemonChoices,
+  bossTierLabel,
   chosenPokemon,
   DEFAULT_DAYS,
   expiryOf,
+  isMaxBossTier,
+  maxAdminOf,
+  readRaidTier,
   readTier,
+  sameBossTier,
   tierOption,
   withDays,
+  type BossTier,
   type ChosenPokemon,
 } from './boss-input.js';
 import { pokemonOption } from '../pokemon-option.js';
@@ -31,13 +38,28 @@ import { lasting } from './boss-list.js';
 /** The value of an override among the choices of `remove`. */
 const OVERRIDE_CHOICE = /^(?:id:|#)?(\d{1,10})$/;
 
-/** A tier's bosses after a change, on one line: `T5 now: Yveltal, Zekrom · eggs hatch as …`. */
-export function tierNow(ctx: AppContext, tier: RaidTier): string {
-  const all = ctx.raidBosses.bosses();
-  const bosses = all.filter((boss) => sameRaidTier(boss.tier, tier));
-  const label = `**${raidTierLabel(tier)}**`;
+/**
+ * The bosses in effect of both lists (plan 8X-2): the raid bosses, then the max bosses (none
+ * while max battles are off).
+ */
+function allBosses(ctx: AppContext): Boss<BossTier>[] {
+  return [...ctx.raidBosses.bosses(), ...ctx.maxBosses.bosses()];
+}
+
+/** The overrides in force of both lists; an id names one of either (one table). */
+function allOverrides(ctx: AppContext): BossOverride<BossTier>[] {
+  return [...ctx.raidBossAdmin.overrides(), ...(ctx.maxBossAdmin?.overrides() ?? [])];
+}
+
+/**
+ * A tier's bosses after a change, on one line: `T5 now: Yveltal, Zekrom · eggs hatch as …`,
+ * `Gigantamax now: Machamp`.
+ */
+export function tierNow(ctx: AppContext, tier: BossTier): string {
+  const label = `**${bossTierLabel(tier)}**`;
+  const bosses = allBosses(ctx).filter((boss) => sameBossTier(boss.tier, tier));
   if (bosses.length === 0) return `${label} now has no bosses.`;
-  const hatches = autosetBoss(all, tier);
+  const hatches = isMaxBossTier(tier) ? undefined : autosetBoss(ctx.raidBosses.bosses(), tier);
   const names = bosses.map((boss) => `${plain(boss.name)}${boss.shiny ? ' (shiny)' : ''}`);
   return (
     `${label} now: ${names.join(', ')}` + (hatches ? ` · eggs hatch as ${plain(hatches.name)}` : '')
@@ -45,28 +67,47 @@ export function tierNow(ctx: AppContext, tier: RaidTier): string {
 }
 
 /** `#3, until <date>` or `#3, for good`, as the answers say it. */
-const numbered = (override: BossOverride): string =>
+const numbered = (override: BossOverride<BossTier>): string =>
   `override #${String(override.id)}, ${lasting(override)}`;
 
-/** Every override in force with the name of its Pokémon, by id. */
-function reportedOverrides(ctx: AppContext): Map<number, ReportedOverride> {
+/** Every override in force of both lists with the name of its Pokémon, by id. */
+function reportedOverrides(ctx: AppContext): Map<number, ReportedOverride<BossTier>> {
   const admin = ctx.raidBossAdmin;
-  const report = bossReport(
-    admin.feedBosses(),
-    admin.overrides(),
-    ctx.gameData.catalogue,
-    Date.now(),
-  );
-  const all = [...report.bosses.flatMap((one) => one.overrides), ...report.hidden, ...report.idle];
+  const now = Date.now();
+  const report = bossReport(admin.feedBosses(), admin.overrides(), ctx.gameData.catalogue, now);
+  const max = ctx.maxBossAdmin;
+  const maxReport = max
+    ? familyReport(
+        MAX_OPS,
+        maxBossesAt,
+        max.feedBosses(),
+        max.overrides(),
+        ctx.gameData.catalogue,
+        now,
+      )
+    : undefined;
+  const all: ReportedOverride<BossTier>[] = [
+    ...report.bosses.flatMap((one) => one.overrides),
+    ...report.hidden,
+    ...report.idle,
+    ...(maxReport
+      ? [
+          ...maxReport.bosses.flatMap((one) => one.overrides),
+          ...maxReport.hidden,
+          ...maxReport.idle,
+        ]
+      : []),
+  ];
   return new Map(all.map((one) => [one.override.id, one]));
 }
 
 /**
  * An override in a sentence or a choice, worded as the list words it: `Zekrom added to T5`,
- * `Starmie hidden from T3`, `Mewtwo: eggs of T5 hatch as it`, `Yveltal: never shiny (any tier)`.
+ * `Starmie hidden from T3`, `Mewtwo: eggs of T5 hatch as it`, `Yveltal: never shiny (any raid
+ * tier)`, `Machamp added to Gigantamax`.
  */
-function describeOverride(override: BossOverride, name: string): string {
-  const tier = override.tier === null ? 'any tier' : raidTierLabel(override.tier);
+function describeOverride(override: BossOverride<BossTier>, name: string): string {
+  const tier = override.tier === null ? 'any raid tier' : bossTierLabel(override.tier);
   switch (override.action) {
     case 'add':
       return `${name} added to ${tier}`;
@@ -80,21 +121,23 @@ function describeOverride(override: BossOverride, name: string): string {
 }
 
 /**
- * Stores an override for the member of staff, refusing what `addOverride` refuses with its own
- * sentence.
+ * Stores an override for the member of staff in the list of its tier (a max tier's in the max
+ * boss list, refused while max battles are off; one without a tier is a raid override),
+ * refusing what `addOverride` refuses with its own sentence.
  */
 async function store(
   interaction: ChatInputCommandInteraction,
   ctx: AppContext,
   chosen: ChosenPokemon,
-  override: Omit<NewBossOverride, 'pokemonId' | 'form' | 'createdBy'>,
-): Promise<BossOverride> {
+  override: Omit<NewBossOverride<BossTier>, 'pokemonId' | 'form' | 'createdBy'>,
+): Promise<BossOverride<BossTier>> {
+  const ids = { ...chosen.ids, createdBy: interaction.user.id };
+  const { tier } = override;
   try {
-    return await ctx.raidBossAdmin.addOverride({
-      ...chosen.ids,
-      ...override,
-      createdBy: interaction.user.id,
-    });
+    if (tier !== null && isMaxBossTier(tier)) {
+      return await maxAdminOf(ctx).addOverride({ ...override, ...ids, tier });
+    }
+    return await ctx.raidBossAdmin.addOverride({ ...override, ...ids, tier });
   } catch (err) {
     if (err instanceof RangeError) throw new UserError(err.message);
     throw err;
@@ -103,11 +146,20 @@ async function store(
 
 /**
  * A raid of the mega kind has a mega or primal form for its boss, and only such a raid has one:
- * anything else is refused (a Pokémon the game data does not know is taken as it is).
+ * anything else is refused (a Pokémon the game data does not know is taken as it is). A max
+ * battle's boss is never a mega or primal form.
  */
-function checkTier(chosen: ChosenPokemon, tier: RaidTier): void {
+function checkTier(chosen: ChosenPokemon, tier: BossTier): void {
   if (!chosen.entry) return;
   const mega = chosen.entry.kind === 'mega';
+  if (isMaxBossTier(tier)) {
+    if (mega) {
+      throw new UserError(
+        `${chosen.label} is a mega or primal form, so it is no max boss. Pick its species.`,
+      );
+    }
+    return;
+  }
   if (isMegaLevel(tier.level) && !mega) {
     throw new UserError(
       `${chosen.label} is no mega or primal form, so it cannot be a boss of ` +
@@ -123,48 +175,64 @@ function checkTier(chosen: ChosenPokemon, tier: RaidTier): void {
   }
 }
 
+/**
+ * The warning for a max override of a Pokémon the game data does not list as that kind of max
+ * boss (`canDynamax`, `canGigantamax`): a line of the answer, not a refusal, as the game master
+ * may lag behind a new boss. None for a raid tier or a Pokémon the game data does not know.
+ */
+function maxKindWarning(ctx: AppContext, chosen: ChosenPokemon, tier: BossTier): string[] {
+  if (!isMaxBossTier(tier) || !chosen.entry) return [];
+  const { catalogue } = ctx.gameData;
+  const gigantamax = tier === 'G';
+  const can = gigantamax
+    ? catalogue.canGigantamax(chosen.entry)
+    : catalogue.canDynamax(chosen.entry);
+  if (can) return [];
+  return [
+    `The game data does not list ${chosen.label} as a ${gigantamax ? 'Gigantamax' : 'Dynamax'} ` +
+      'boss; the override is stored all the same.',
+  ];
+}
+
 /**
  * Whether a boss of the list is the Pokémon staff named: by its catalogue entry, or for one the
  * game master does not know by its ids (an unknown boss's key can equal a real catalogue key).
  */
-function sameBoss(chosen: ChosenPokemon, boss: RaidBoss): boolean {
+function sameBoss(chosen: ChosenPokemon, boss: Boss<BossTier>): boolean {
   return chosen.entry
     ? boss.entry?.key === chosen.entry.key
     : !boss.entry && boss.pokemonId === chosen.ids.pokemonId && boss.form === chosen.ids.form;
 }
 
 /** Whether the feed lists this Pokémon in this tier. */
-function feedLists(ctx: AppContext, chosen: ChosenPokemon, tier: RaidTier): boolean {
-  return ctx.raidBosses
-    .bosses()
-    .some(
-      (boss) => boss.source === 'feed' && sameBoss(chosen, boss) && sameRaidTier(boss.tier, tier),
-    );
+function feedLists(ctx: AppContext, chosen: ChosenPokemon, tier: BossTier): boolean {
+  return allBosses(ctx).some(
+    (boss) => boss.source === 'feed' && sameBoss(chosen, boss) && sameBossTier(boss.tier, tier),
+  );
 }
 
 /** The `hide` override in force for this Pokémon and tier, if any. */
 function hiddenBy(
   ctx: AppContext,
   chosen: ChosenPokemon,
-  tier: RaidTier,
-): BossOverride | undefined {
-  return ctx.raidBossAdmin
-    .overrides()
-    .find(
-      (one) =>
-        one.action === 'hide' &&
-        one.pokemonId === chosen.ids.pokemonId &&
-        one.form === chosen.ids.form &&
-        one.tier !== null &&
-        sameRaidTier(one.tier, tier),
-    );
+  tier: BossTier,
+): BossOverride<BossTier> | undefined {
+  return allOverrides(ctx).find(
+    (one) =>
+      one.action === 'hide' &&
+      one.pokemonId === chosen.ids.pokemonId &&
+      one.form === chosen.ids.form &&
+      one.tier !== null &&
+      sameBossTier(one.tier, tier),
+  );
 }
 
-/** The tiers this Pokémon is a boss of now. */
-function tiersOf(ctx: AppContext, chosen: ChosenPokemon): RaidTier[] {
-  const tiers: RaidTier[] = [];
-  for (const boss of ctx.raidBosses.bosses()) {
-    if (sameBoss(chosen, boss) && !tiers.some((tier) => sameRaidTier(tier, boss.tier))) {
+/** The tiers this Pokémon is a boss of now; with `raidOnly`, its raid tiers. */
+function tiersOf(ctx: AppContext, chosen: ChosenPokemon, raidOnly = false): BossTier[] {
+  const tiers: BossTier[] = [];
+  const bosses = raidOnly ? ctx.raidBosses.bosses() : allBosses(ctx);
+  for (const boss of bosses) {
+    if (sameBoss(chosen, boss) && !tiers.some((tier) => sameBossTier(tier, boss.tier))) {
       tiers.push(boss.tier);
     }
   }
@@ -172,8 +240,8 @@ function tiersOf(ctx: AppContext, chosen: ChosenPokemon): RaidTier[] {
 }
 
 /** Whether the Pokémon is a boss of the tier now. */
-function isBoss(ctx: AppContext, chosen: ChosenPokemon, tier: RaidTier): boolean {
-  return tiersOf(ctx, chosen).some((one) => sameRaidTier(one, tier));
+function isBoss(ctx: AppContext, chosen: ChosenPokemon, tier: BossTier): boolean {
+  return tiersOf(ctx, chosen).some((one) => sameBossTier(one, tier));
 }
 
 /** The answer: what was done, what to know about it, and the tier's list now. */
@@ -223,12 +291,14 @@ export const addBoss: SubcommandPart = {
   ),
   help: {
     details:
-      'For a boss the feed has not listed yet (a leak, an event) or lists wrongly. It lasts ' +
-      `${String(DEFAULT_DAYS)} days unless you give \`days\`; \`days:0\` keeps it until you ` +
-      'remove it with `/admin boss remove`. Adding it again replaces the earlier one.',
+      'For a boss the feed has not listed yet (a leak, an event) or lists wrongly. A max ' +
+      'battle tier (Dynamax 1★ to 5★, Gigantamax) changes the max boss list where max battles ' +
+      `are on. It lasts ${String(DEFAULT_DAYS)} days unless you give \`days\`; \`days:0\` keeps ` +
+      'it until you remove it with `/admin boss remove`. Adding it again replaces the earlier one.',
     examples: [
       '/admin boss add pokemon:Zekrom tier:T5',
       '/admin boss add pokemon:Mew tier:T5 days:3',
+      '/admin boss add pokemon:Machamp tier:Gigantamax',
     ],
   },
   defer: 'ephemeral',
@@ -247,7 +317,8 @@ export const addBoss: SubcommandPart = {
     });
     const hide = hiddenBy(ctx, chosen, tier);
     await answer(interaction, [
-      `${chosen.label} is a boss of ${raidTierLabel(tier)} (${numbered(saved)}).`,
+      `${chosen.label} is a boss of ${bossTierLabel(tier)} (${numbered(saved)}).`,
+      ...maxKindWarning(ctx, chosen, tier),
       ...(defaulted ? [DEFAULTED] : []),
       ...(listed
         ? [
@@ -282,8 +353,9 @@ export const hideBoss: SubcommandPart = {
   ),
   help: {
     details:
-      'For a boss the feed lists wrongly or no longer has. It lasts until you remove it with ' +
-      '`/admin boss remove`, or for `days`. A hidden boss beats one you added.',
+      'For a boss the feed lists wrongly or no longer has, in a raid or a max battle tier. It ' +
+      'lasts until you remove it with `/admin boss remove`, or for `days`. A hidden boss beats ' +
+      'one you added.',
     examples: ['/admin boss hide pokemon:Starmie tier:T3'],
   },
   defer: 'ephemeral',
@@ -298,11 +370,12 @@ export const hideBoss: SubcommandPart = {
       expiresAt: expiryOf(interaction.options.getInteger('days'), null, Date.now()),
     });
     await answer(interaction, [
-      `${chosen.label} is hidden from ${raidTierLabel(tier)} (${numbered(saved)}).`,
+      `${chosen.label} is hidden from ${bossTierLabel(tier)} (${numbered(saved)}).`,
+      ...maxKindWarning(ctx, chosen, tier),
       ...(was
         ? []
         : [
-            `It was no boss of ${raidTierLabel(tier)}; it stays off the list if the feed lists ` +
+            `It was no boss of ${bossTierLabel(tier)}; it stays off the list if the feed lists ` +
               'it there.',
           ]),
       tierNow(ctx, tier),
@@ -319,7 +392,7 @@ export const autosetBossPart: SubcommandPart = {
       .setName('autoset')
       .setDescription('Choose what eggs of a tier hatch as when nobody says')
       .addStringOption(pokemonOption())
-      .addStringOption(tierOption(true)),
+      .addStringOption(tierOption(true, 'The raid tier', true)),
     `For how many days (default ${String(DEFAULT_DAYS)}; 0 for good)`,
   ),
   help: {
@@ -328,13 +401,13 @@ export const autosetBossPart: SubcommandPart = {
       'of the tier. A tier with one boss does that by itself; this is for a tier with several. ' +
       `It lasts ${String(DEFAULT_DAYS)} days unless you give \`days\` (\`days:0\` for good). ` +
       'A tier has one choice: a new one replaces the earlier one, which then is no boss of the ' +
-      'tier unless the feed lists it.',
+      'tier unless the feed lists it. Raid tiers only: a max battle has no egg.',
     examples: ['/admin boss autoset pokemon:Yveltal tier:T5'],
   },
   defer: 'ephemeral',
   async execute(interaction, ctx) {
     const chosen = chosenPokemon(ctx, interaction.options.getString('pokemon', true));
-    const tier = readTier(interaction.options.getString('tier', true));
+    const tier = readRaidTier(interaction.options.getString('tier', true));
     checkTier(chosen, tier);
     const { days, defaulted } = daysOf(interaction);
     // The choice in force for the tier, which the new one replaces (`replacesOverride`).
@@ -342,6 +415,7 @@ export const autosetBossPart: SubcommandPart = {
       ({ override }) =>
         override.action === 'autoset' &&
         override.tier !== null &&
+        !isMaxBossTier(override.tier) &&
         sameRaidTier(override.tier, tier),
     );
     const saved = await store(interaction, ctx, chosen, {
@@ -384,12 +458,16 @@ export const shinyBoss: SubcommandPart = {
     .addBooleanOption((option) =>
       option.setName('can-be-shiny').setDescription('True: it can be shiny').setRequired(true),
     )
-    .addStringOption(tierOption(false, 'Only in this tier (default: every tier)')),
+    .addStringOption(tierOption(false, 'Only in this tier (default: every raid tier)')),
   help: {
     details:
       'The feed says which bosses can be shiny; this overrides it until you remove it with ' +
-      '`/admin boss remove`. One for a single tier beats one for every tier.',
-    examples: ['/admin boss shiny pokemon:Yveltal can-be-shiny:True'],
+      '`/admin boss remove`. One for a single tier beats one for every tier. Without a tier it ' +
+      'covers the raid tiers; give a max battle tier for a max boss.',
+    examples: [
+      '/admin boss shiny pokemon:Yveltal can-be-shiny:True',
+      '/admin boss shiny pokemon:Machamp can-be-shiny:True tier:Gigantamax',
+    ],
   },
   defer: 'ephemeral',
   async execute(interaction, ctx) {
@@ -403,12 +481,14 @@ export const shinyBoss: SubcommandPart = {
       shiny,
       expiresAt: null,
     });
-    const where = tier === null ? ', in any tier' : ` in ${raidTierLabel(tier)}`;
-    const tiers = tier === null ? tiersOf(ctx, chosen) : isBoss(ctx, chosen, tier) ? [tier] : [];
+    const where = tier === null ? ', in any raid tier' : ` in ${bossTierLabel(tier)}`;
+    const tiers =
+      tier === null ? tiersOf(ctx, chosen, true) : isBoss(ctx, chosen, tier) ? [tier] : [];
     await answer(interaction, [
       `${chosen.label} ${shiny ? 'can be shiny' : 'is never shiny'}${where} (${numbered(saved)}).`,
+      ...(tier === null ? [] : maxKindWarning(ctx, chosen, tier)),
       ...(tiers.length === 0
-        ? [tier === null ? 'It is no boss now.' : `It is no boss of ${raidTierLabel(tier)} now.`]
+        ? [tier === null ? 'It is no boss now.' : `It is no boss of ${bossTierLabel(tier)} now.`]
         : tiers.map((one) => tierNow(ctx, one))),
     ]);
   },
@@ -420,7 +500,7 @@ export const removeOverride: SubcommandPart = {
   group: BOSS_GROUP,
   data: new SlashCommandSubcommandBuilder()
     .setName('remove')
-    .setDescription('Remove one of your overrides of the boss list')
+    .setDescription('Remove one of your overrides of the boss lists')
     .addStringOption((option) =>
       option
         .setName('override')
@@ -431,9 +511,9 @@ export const removeOverride: SubcommandPart = {
     ),
   help: {
     details:
-      'The list offers every override in force with its number, what it does and when it ' +
-      'lapses; `/admin boss list` shows them too. The boss list is then as the other overrides ' +
-      'and the feed say.',
+      'The list offers every override in force, of the raid and the max boss lists, with its ' +
+      'number, what it does and when it lapses; `/admin boss list` shows them too. The boss ' +
+      'list is then as the other overrides and the feed say.',
     examples: ['/admin boss remove override:3'],
   },
   defer: 'ephemeral',
@@ -447,15 +527,17 @@ export const removeOverride: SubcommandPart = {
     if (!reported) {
       throw new UserError(`There is no override #${id}. It may have lapsed or been removed.`);
     }
-    const removed = await ctx.raidBossAdmin.removeOverride(reported.override.id);
+    const { override } = reported;
+    const max = override.tier !== null && isMaxBossTier(override.tier);
+    const admin = max ? maxAdminOf(ctx) : ctx.raidBossAdmin;
+    const removed = await admin.removeOverride(override.id);
     if (!removed) {
       throw new UserError(`There is no override #${id}. It may have lapsed or been removed.`);
     }
-    const { override } = reported;
-    // An override for every tier (shiny) shows each tier its Pokémon is a boss of now.
+    // An override for every raid tier (shiny) shows each raid tier its Pokémon is a boss of now.
     const tiers =
       override.tier === null
-        ? tiersOf(ctx, { ids: override, entry: reported.entry, label: plain(reported.name) })
+        ? tiersOf(ctx, { ids: override, entry: reported.entry, label: plain(reported.name) }, true)
         : [override.tier];
     await answer(interaction, [
       `Removed override #${id}: ${describeOverride(override, plain(reported.name))}.`,
diff --git a/src/domain/pogo/boss-report.ts b/src/domain/pogo/boss-report.ts
index fcd5bd79b0ffb1564911b9289152d4694e2add44..096e37ba5b8c3b186d42e2888dd8e06f88728348 100644
--- a/src/domain/pogo/boss-report.ts
+++ b/src/domain/pogo/boss-report.ts
@@ -4,19 +4,21 @@ import { titleCase } from './names.js';
 import type { FeedBoss } from './raid-boss-feed.js';
 import {
   effectiveBosses,
-  feedBossKey,
-  overrideKeys,
+  familyBossKey,
+  familyOverrideKeys,
+  RAID_OPS,
+  type Boss,
+  type BossFamilyOps,
   type BossOverride,
-  type RaidBoss,
 } from './raid-bosses.js';
-import { sameRaidTier, type RaidTier } from './raid-tier.js';
+import type { RaidTier } from './raid-tier.js';
 
 /** An override this old is marked as one to look at (`/admin boss list`). */
 export const OLD_OVERRIDE_MS = 30 * 24 * 60 * 60 * 1000;
 
 /** An override in force, with what it is for. */
-export interface ReportedOverride {
-  override: BossOverride;
+export interface ReportedOverride<T = RaidTier> {
+  override: BossOverride<T>;
   /** The `RaidBoss.key` of the Pokémon it is for. */
   key: string;
   /** Its catalogue entry; undefined for a Pokémon the game master does not know. */
@@ -32,52 +34,71 @@ export interface ReportedOverride {
 }
 
 /** A boss of the list in effect, with where it came from. */
-export interface ReportedBoss<T extends FeedBoss> {
-  boss: RaidBoss;
+export interface ReportedBoss<R extends FeedBoss<T>, T = RaidTier> {
+  boss: Boss<T>;
   /** The feed rows it was made of; empty for a boss that only an override adds. */
-  rows: T[];
+  rows: R[];
   /** The overrides in force that add it, chose it for eggs, or set its shiny flag. */
-  overrides: ReportedOverride[];
+  overrides: ReportedOverride<T>[];
 }
 
-export interface BossReport<T extends FeedBoss> {
+export interface BossReport<R extends FeedBoss<T>, T = RaidTier> {
   /** The list in effect, in its order (`effectiveBosses`). */
-  bosses: ReportedBoss<T>[];
+  bosses: ReportedBoss<R, T>[];
   /** The `hide` overrides in force, oldest first. */
-  hidden: ReportedOverride[];
+  hidden: ReportedOverride<T>[];
   /**
    * The other overrides in force that touch no boss of the list: an `add` or `autoset` whose
    * boss is hidden, a `shiny` for a Pokémon that is no boss now. Oldest first.
    */
-  idle: ReportedOverride[];
+  idle: ReportedOverride<T>[];
 }
 
-const touches = (override: BossOverride, tier: RaidTier): boolean =>
-  override.tier === null || sameRaidTier(override.tier, tier);
-
 /**
- * The boss list in effect at `now`, as staff look at it: every boss with the feed rows it came
- * from and the overrides that act on it, the hidden ones apart, and the overrides that act on
- * nothing. Expired overrides are left out, as `effectiveBosses` leaves them out.
+ * The raid boss list in effect at `now`, as staff look at it: every boss with the feed rows it
+ * came from and the overrides that act on it, the hidden ones apart, and the overrides that act
+ * on nothing. Expired overrides are left out, as `effectiveBosses` leaves them out.
  */
-export function bossReport<T extends FeedBoss>(
-  feed: readonly T[],
+export function bossReport<R extends FeedBoss>(
+  feed: readonly R[],
   overrides: readonly BossOverride[],
   catalogue: PokemonCatalogue,
   now: number,
-): BossReport<T> {
+): BossReport<R> {
+  return familyReport(RAID_OPS, effectiveBosses, feed, overrides, catalogue, now);
+}
+
+/**
+ * `bossReport` for the list of any family (plan 8X-2: the max bosses), whose list in effect is
+ * `effective`.
+ */
+export function familyReport<T, R extends FeedBoss<T>>(
+  ops: BossFamilyOps<T>,
+  effective: (
+    feed: readonly R[],
+    overrides: readonly BossOverride<T>[],
+    catalogue: PokemonCatalogue,
+    now: number,
+  ) => Boss<T>[],
+  feed: readonly R[],
+  overrides: readonly BossOverride<T>[],
+  catalogue: PokemonCatalogue,
+  now: number,
+): BossReport<R, T> {
+  const touches = (override: BossOverride<T>, tier: T): boolean =>
+    override.tier === null || ops.sameTier(override.tier, tier);
   const active = overrides
     .filter((override) => override.expiresAt === null || override.expiresAt > now)
     .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
-  const rows = feed.map((row) => ({ row, key: feedBossKey(row, catalogue).key }));
-  const listed = (key: string, tier: RaidTier | null): boolean =>
-    rows.some((one) => one.key === key && (tier === null || sameRaidTier(one.row.tier, tier)));
-  const keyOf = overrideKeys(feed, catalogue);
-  const reported = active.map((override): ReportedOverride => {
+  const rows = feed.map((row) => ({ row, key: familyBossKey(ops, row, catalogue).key }));
+  const listed = (key: string, tier: T | null): boolean =>
+    rows.some((one) => one.key === key && (tier === null || ops.sameTier(one.row.tier, tier)));
+  const keyOf = familyOverrideKeys(ops, feed, catalogue);
+  const reported = active.map((override): ReportedOverride<T> => {
     const { key, entry } = keyOf(override);
     const old: ReportedOverride['old'] = [];
     if (now - override.createdAt > OLD_OVERRIDE_MS) old.push('age');
-    if (override.action === 'add' && override.tier && listed(key, override.tier)) {
+    if (override.action === 'add' && override.tier !== null && listed(key, override.tier)) {
       old.push('feed-lists-it');
     }
     if (
@@ -91,7 +112,7 @@ export function bossReport<T extends FeedBoss>(
   });
 
   const used = new Set<number>();
-  const bosses = effectiveBosses(feed, overrides, catalogue, now).map((boss) => {
+  const bosses = effective(feed, overrides, catalogue, now).map((boss) => {
     const acting = reported.filter(
       ({ override, key }) =>
         override.action !== 'hide' && key === boss.key && touches(override, boss.tier),
@@ -100,7 +121,7 @@ export function bossReport<T extends FeedBoss>(
     return {
       boss,
       rows: rows
-        .filter((one) => one.key === boss.key && sameRaidTier(one.row.tier, boss.tier))
+        .filter((one) => one.key === boss.key && ops.sameTier(one.row.tier, boss.tier))
         .map((one) => one.row),
       overrides: acting,
     };
diff --git a/src/services/raid-boss-announcer.ts b/src/services/raid-boss-announcer.ts
index d566da7cec2deaeed4676d2e3c8003adcb742b48..9111c2041a1020736c1a7dc45dd6c10bf1bf3abb 100644
--- a/src/services/raid-boss-announcer.ts
+++ b/src/services/raid-boss-announcer.ts
@@ -41,7 +41,12 @@ export class RaidBossAnnouncer {
 
   constructor(private readonly options: RaidBossAnnouncerOptions) {}
 
-  /** Listens to the service; call it before the service's first sync. */
+  /**
+   * Listens to the service; call it before the service's first sync. Only the raid bosses: the
+   * max bosses (`MaxBossService`, plan 8X-2) are not announced, their changes nor a max boss list
+   * out of date (which is only logged); a follow-up if Matt wants them, which would word them
+   * with the max tiers and attach here.
+   */
   attach(source: Pick<RaidBossService, 'onChange' | 'onStale'>): void {
     source.onChange((change) => {
       this.changed(change);
diff --git a/test/support/boss-commands.ts b/test/support/boss-commands.ts
index 5e8c97324a2418e3964889a094016bc3f09ad811..e895484d4bcdc3a933c4cb9330b37b4d0b2e7dd2 100644
--- a/test/support/boss-commands.ts
+++ b/test/support/boss-commands.ts
@@ -12,6 +12,7 @@ import {
 import { MEMBER, MODERATOR } from './gym-commands.js';
 import { WEST_CHANNEL } from './gyms.js';
 import { nicknameSearchWith } from './nicknames.js';
+import { maxBossServiceWith } from './max-boss-service.js';
 import { raidBossServiceWith } from './raid-bosses.js';
 import { createTestContext } from './test-context.js';
 
@@ -25,7 +26,9 @@ type OptionValue = string | number | boolean;
  * channel of West unless a call says otherwise. `use(group, subcommand, options)` runs a
  * subcommand (`group` null for one outside a group); `typing` asks for the list of an option.
  * `Date` is not faked: tests that read dates fake it themselves; the service has its own clock
- * (`bosses.state.now`).
+ * (`bosses.state.now`). With `max` (plan 8X-2) max battles are on: a real `MaxBossService`
+ * (`maxBossServiceWith`, its clock `max.state.now`) that has read the recorded Pokebattler feed, its
+ * override ids counted with the raid bosses' as in the one table.
  */
 export async function bossCommandsWith(
   options: {
@@ -33,18 +36,24 @@ export async function bossCommandsWith(
     empty?: boolean;
     nicknames?: Record<string, string[]>;
     context?: Partial<AppContext>;
+    max?: boolean;
   } = {},
 ) {
+  const ids = { next: 1 };
   const bosses = await raidBossServiceWith({
     ...(options.overrides ? { overrides: options.overrides } : {}),
     ...(options.empty ? { empty: true } : {}),
+    ids,
   });
+  const max = options.max ? await maxBossServiceWith({ ids }) : undefined;
+  await max?.service.sync();
   const search = await nicknameSearchWith(options.nicknames ?? {});
   const { ctx, entries } = createTestContext({
     raidBosses: bosses.service,
     raidBossAdmin: bosses.service,
     pokemon: search.search,
     nicknames: search.search,
+    ...(max ? { maxBosses: max.service, maxBossAdmin: max.service } : {}),
     ...options.context,
   });
   const router = new InteractionRouter(ctx, [admin], []);
@@ -60,6 +69,7 @@ export async function bossCommandsWith(
   };
   return {
     bosses,
+    max,
     search,
     ctx,
     logged: entries,
diff --git a/test/support/max-boss-service.ts b/test/support/max-boss-service.ts
index 4e4dbe3eb1d4c30d7081bca45026de2cb45d9959..ed5fd11673c9e2b7e8d460b9d54da9232e9ffef7 100644
--- a/test/support/max-boss-service.ts
+++ b/test/support/max-boss-service.ts
@@ -9,8 +9,8 @@ import { createTestLogger } from './test-logger.js';
 
 /** `MemoryBossStore` of the max bosses. */
 export class MemoryMaxBossStore extends MemoryBossStore<MaxTier> {
-  constructor() {
-    super(MAX_OPS);
+  constructor(ids?: { next: number }) {
+    super(MAX_OPS, ids);
   }
 }
 
@@ -20,8 +20,8 @@ export class MemoryMaxBossStore extends MemoryBossStore<MaxTier> {
  * downloaded: `state.respond` answers the requests of `sync()` (by default the recorded feed);
  * `restarted()` gives a loaded service over the same store, as after a restart.
  */
-export async function maxBossServiceWith() {
-  const store = new MemoryMaxBossStore();
+export async function maxBossServiceWith(options: { ids?: { next: number } } = {}) {
+  const store = new MemoryMaxBossStore(options.ids);
   const { log, entries } = createTestLogger();
   const state = {
     now: MAX_FEED_READ_AT,
diff --git a/test/support/raid-bosses.ts b/test/support/raid-bosses.ts
index 7c85a28060621e797bf55fdef720569332e6e3f0..6c2240b346d1880c5d791858f8d176ae0ce3ecd0 100644
--- a/test/support/raid-bosses.ts
+++ b/test/support/raid-bosses.ts
@@ -46,9 +46,14 @@ export class MemoryBossStore<T> implements BossStore<T> {
   beforeListOverrides: (() => Promise<void>) | undefined;
   private rows: (StoredBoss<T> & { active: boolean })[] = [];
   private stored: BossOverride<T>[] = [];
-  private nextId = 1;
-
-  constructor(private readonly ops: Pick<BossFamilyOps<T>, 'slot' | 'sameTier'>) {}
+  /**
+   * `ids` numbers the overrides; two stores of the two families given one counter number them as
+   * the one table does, so that an id names one override of either.
+   */
+  constructor(
+    private readonly ops: Pick<BossFamilyOps<T>, 'slot' | 'sameTier'>,
+    private readonly ids: { next: number } = { next: 1 },
+  ) {}
 
   private identity(boss: FeedBoss<T>): string {
     return `${boss.pokemonId}|${boss.form ?? ''}|${this.ops.slot(boss.tier)}`;
@@ -116,7 +121,7 @@ export class MemoryBossStore<T> implements BossStore<T> {
   saveOverride(override: NewBossOverride<T>, now: number): Promise<BossOverride<T>> {
     return this.attempt('saveOverride', () => {
       this.stored = this.stored.filter((other) => !replacesOverrideIn(this.ops, override, other));
-      const saved = { ...override, id: this.nextId++, createdAt: now };
+      const saved = { ...override, id: this.ids.next++, createdAt: now };
       this.stored.push(saved);
       return { ...saved };
     });
@@ -152,8 +157,8 @@ export class MemoryBossStore<T> implements BossStore<T> {
 
 /** `MemoryBossStore` of the raid bosses. */
 export class MemoryRaidBossStore extends MemoryBossStore<RaidTier> {
-  constructor() {
-    super(RAID_OPS);
+  constructor(ids?: { next: number }) {
+    super(RAID_OPS, ids);
   }
 }
 
@@ -189,9 +194,15 @@ export const FEED_READ_AT = Date.UTC(2026, 9, 11, 12);
  * `raidBossAdmin` to `createTestContext`.
  */
 export async function raidBossServiceWith(
-  options: { overrides?: readonly NewBossOverride[]; empty?: boolean; staleAfterMs?: number } = {},
+  options: {
+    overrides?: readonly NewBossOverride[];
+    empty?: boolean;
+    staleAfterMs?: number;
+    /** The counter of override ids, shared with a max boss store (`MemoryBossStore`). */
+    ids?: { next: number };
+  } = {},
 ) {
-  const store = new MemoryRaidBossStore();
+  const store = new MemoryRaidBossStore(options.ids);
   const { log, entries } = createTestLogger();
   const state = {
     now: FEED_READ_AT,
````
