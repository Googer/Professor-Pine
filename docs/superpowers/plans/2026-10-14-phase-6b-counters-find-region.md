# Phase 6B: `/counters` (Pokebattler) and `/find-region` (Nominatim): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members get the best counters against a raid boss from Pokebattler (also for their own Pokébox, also in a DM), with an estimate of how many trainers it takes; and find which of the server's regions a place lies in, by name, coordinates or a maps link.

**Architecture:** The second plan of Phase 6 (6A is done). Pokebattler sits behind `PokebattlerFight` (`ctx.pokebattler`: ten seconds, 5 MB, two requests at once, identical requests shared, answers kept ten minutes, a Pokébox never); Nominatim behind `NominatimSearch` (`ctx.places`: one request a second for the whole bot, ten waiting, a ten-minute pause after a refusal, the largest place kept a day). What the answers mean is pure (`src/domain/counters/`, `src/domain/geo/shape.ts`, `nominatim.ts`); the map of a place is `ctx.maps.place`, pruned after a day unused.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Vitest. No new dependencies, no migration. `User.pokebattlerId` (legacy column) is read and written through `UserRepository`.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: rows 199 and 200 of 4.2, 487, 530. The design brief is the git-ignored `.superpowers/sdd/phase-6-design.md`; the legacy behaviour and the live checks of Pokebattler are `.superpowers/sdd/phase-6-legacy-notes.txt` (sections 2, 4, 9); the rulings are in `.superpowers/sdd/2026-10-14-phase-6b-counters-find-region/`.

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto/phase-6b`), one commit per task, with the typecheck and the tests of each task clean and the full check, build and database suite clean on the tip (4,726 unit tests; the database suite, 294 tests). Two reviewers went through that branch and a third through the fixes; what they found is already in the code below.

## Decisions made in this plan (the controller's rulings overnight; Matt has not seen them)

1. **`/counters [boss] [tier] [level] [weather] [friendship] [moveset] [shadow] [mega] [single]`** in servers and DMs. In a raid's or train's post the boss and the tier come from it (a typed boss takes the post's tier; a typed tier wins); elsewhere the tier the boss is in now. Defaults: level 40, no weather, best friends, each marked "(assumed)". Every tier maps to a Pokebattler raid level (checked live), shadow bosses as `<SPECIES>_SHADOW_FORM`. The moveset is an option with autocomplete (the average first). Top 12, grouped by Pokémon; "About N trainers" from Pokebattler's estimator, which replaces `howmany`. Public in a party's post, private elsewhere.
2. **Pokébox:** `level:My Pokébox on Pokebattler` uses the member's saved Pokebattler id (`/settings pokebattler-id`); always private, shadows and megas shown by default, never cached.
3. **`/find-region location`** (enabled by `settings.findRegion`: Nominatim's address and the User-Agent): coordinates, a maps link or a place name searched within the box of this server's regions; which regions a point lies in, or an area or line lies wholly or partly in; a map of the place and the regions; "© OpenStreetMap contributors".

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- `src/domain/` stays pure. **Tests never use the network.** Nothing a member searched for is logged.
- Each task carries the full diff of the prototype commit it transcribes (branch `proto/phase-6b`). Apply it exactly; `git diff <that commit> -- src test scripts` must print nothing before the task is committed.
- A task needs the typecheck and its own tests green; the full `npm run check` after the last task. `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. A large place cannot block the bot: the `shapeTouches` limit tests (a region in a hole of a 50,000-point area, in a crescent's mouth).
2. Nominatim's usage policy holds: one request a second for the whole bot, nothing sent during a pause, also for searches already waiting.
3. Pokebattler cannot exhaust memory: two requests at once, 5 MB each, a cache of ten.
4. Counters are asked for the boss and tier the member means (the post's tier, the moveset check in the guard).
5. Every answer fits Discord's limits.

---

### Task 1: Pokebattler raid simulations: the option tables and the port

Prototype commit: `3a85a58eb90104fb8a54c77f73228a6f355effb5`

The fixed lists of counters (attacker levels, weather, friendship) are typed
constants in src/domain/counters/options.ts, with Pokebattler's raid level
of every tier (as its list of raids names them, checked live: T1/T3/T5, the
shadow levels, MEGA, MEGA_5, 5_MEGA_ENHANCED, ELITE) and the names under
which it may know a boss: the catalogue's pokebattlerId, the bare species id
after it for a species known by its default form, <species>_SHADOW_FORM for
a shadow boss. counterPath is the legacy request.

readCounterAnswer reads the answer, checked with zod for the fields used:
the counters per moveset of the boss and averaged, each with its movesets,
time, deaths and estimator; what does not fit is left out.

PokebattlerFight (src/services/pokebattler-gateway.ts) is the port: fetch
with ten seconds, the body read with a limit of 5 MB (readLimitedJson), one
request per setting at a time and its answer kept ten minutes, the next name
of the boss asked when Pokebattler does not know one. Every failure is an
answer. FakePokebattler is its twin for tests.


**Files:**

```
 src/domain/counters/options.test.ts            | 103 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/counters/options.ts                 | 176 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/counters/pokebattler-answer.test.ts | 133 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/counters/pokebattler-answer.ts      | 166 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/limited-json.test.ts              |  39 +++++++++++++++++++++++++++
 src/services/limited-json.ts                   |  63 +++++++++++++++++++++++++++++++++++++++++++
 src/services/pokebattler-gateway.test.ts       | 215 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/pokebattler-gateway.ts            | 202 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/pokebattler.ts                    | 157 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/responses.ts                      |  41 ++++++++++++++++++++++++++++
 10 files changed, 1295 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `Pokebattler raid simulations: the option tables and the port`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/src/domain/counters/options.test.ts b/src/domain/counters/options.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e4a12124d7be2b5489802f9601e921a951d8485a
--- /dev/null
+++ b/src/domain/counters/options.test.ts
@@ -0,0 +1,103 @@
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import { RAID_LEVELS, SHADOW_RAID_LEVELS, raidTier, type RaidTier } from '../pogo/raid-tier.js';
+import {
+  ATTACKER_LEVELS,
+  counterPath,
+  pokebattlerBossIds,
+  pokebattlerRaidLevel,
+  WEATHERS,
+} from './options.js';
+
+const catalogue = catalogueFixture();
+const entry = (key: string) => {
+  const found = catalogue.byKey(key);
+  if (!found) throw new Error(`no ${key} in the fixture`);
+  return found;
+};
+
+describe('pokebattlerRaidLevel', () => {
+  it('names the level of every tier as Pokebattler lists its raids', () => {
+    const named = (tier: RaidTier) => pokebattlerRaidLevel(tier);
+    expect(RAID_LEVELS.map((level) => named({ level, shadow: false }))).toEqual([
+      'RAID_LEVEL_1',
+      'RAID_LEVEL_3',
+      'RAID_LEVEL_5',
+      'RAID_LEVEL_MEGA',
+      'RAID_LEVEL_MEGA_5',
+      'RAID_LEVEL_5_MEGA_ENHANCED',
+      'RAID_LEVEL_ELITE',
+    ]);
+    expect(SHADOW_RAID_LEVELS.map((level) => named({ level, shadow: true }))).toEqual([
+      'RAID_LEVEL_1_SHADOW',
+      'RAID_LEVEL_3_SHADOW',
+      'RAID_LEVEL_5_SHADOW',
+    ]);
+  });
+
+  it('has no level for a shadow tier the game does not have', () => {
+    expect(raidTier('Mega', true)).toBeUndefined();
+    expect(pokebattlerRaidLevel({ level: 'Mega', shadow: true })).toBeUndefined();
+    expect(pokebattlerRaidLevel({ level: 'Elite', shadow: true })).toBeUndefined();
+  });
+});
+
+describe('pokebattlerBossIds', () => {
+  it('is the catalogue name of an ordinary species, a regional form and a mega', () => {
+    expect(pokebattlerBossIds(entry('mewtwo'), false)).toEqual(['MEWTWO']);
+    expect(pokebattlerBossIds(entry('arcanine_hisuian'), false)).toEqual(['ARCANINE_HISUIAN_FORM']);
+    expect(pokebattlerBossIds(entry('charizard_mega_x'), false)).toEqual(['CHARIZARD_MEGA_X']);
+  });
+
+  it('falls back to the bare species id for a species known by its default form', () => {
+    expect(pokebattlerBossIds(entry('landorus_incarnate'), false)).toEqual([
+      'LANDORUS_INCARNATE_FORM',
+      'LANDORUS',
+    ]);
+  });
+
+  it('names a shadow boss <species>_SHADOW_FORM, and a mega never', () => {
+    expect(pokebattlerBossIds(entry('landorus_incarnate'), true)).toEqual(['LANDORUS_SHADOW_FORM']);
+    expect(pokebattlerBossIds(entry('mewtwo'), true)).toEqual(['MEWTWO_SHADOW_FORM']);
+    expect(pokebattlerBossIds(entry('arcanine_hisuian'), true)).toEqual([
+      'ARCANINE_HISUIAN_SHADOW_FORM',
+    ]);
+    expect(pokebattlerBossIds(entry('charizard_mega_x'), true)).toEqual([]);
+  });
+});
+
+describe('counterPath', () => {
+  it('is the legacy request for attackers of a level', () => {
+    expect(
+      counterPath({
+        boss: 'MEWTWO',
+        raidLevel: 'RAID_LEVEL_5',
+        attackers: { kind: 'level', level: '40' },
+        weather: 'WINDY',
+        friendship: '4',
+      }),
+    ).toBe(
+      '/raids/defenders/MEWTWO/levels/RAID_LEVEL_5/attackers/levels/40/strategies/' +
+        'CINEMATIC_ATTACK_WHEN_POSSIBLE/DEFENSE_RANDOM_MC?sort=TIME&weatherCondition=WINDY&' +
+        'dodgeStrategy=DODGE_REACTION_TIME&aggregation=AVERAGE&randomAssistants=-1&' +
+        'friendLevel=FRIENDSHIP_LEVEL_4',
+    );
+  });
+
+  it('asks for the Pokébox of a Pokebattler user', () => {
+    expect(
+      counterPath({
+        boss: 'KOMMO-O',
+        raidLevel: 'RAID_LEVEL_3',
+        attackers: { kind: 'box', userId: 12345 },
+        weather: 'NO_WEATHER',
+        friendship: '0',
+      }),
+    ).toContain('/raids/defenders/KOMMO-O/levels/RAID_LEVEL_3/attackers/users/12345/strategies/');
+  });
+
+  it('has the legacy lists', () => {
+    expect(ATTACKER_LEVELS).toEqual(['20', '25', '30', '35', '40', '41', '45', '50', '51']);
+    expect(WEATHERS).toHaveLength(8);
+  });
+});
diff --git a/src/domain/counters/options.ts b/src/domain/counters/options.ts
new file mode 100644
index 0000000000000000000000000000000000000000..76c39278c06a05043f4ac88ece19f1589a608b4c
--- /dev/null
+++ b/src/domain/counters/options.ts
@@ -0,0 +1,176 @@
+import type { PokemonEntry } from '../pogo/game-master.js';
+import type { RaidLevel, RaidTier } from '../pogo/raid-tier.js';
+
+/**
+ * The fixed lists of `/counters` (spec 487: the legacy `data/counters.json` as typed constants)
+ * and how each value is written in a request to Pokebattler.
+ */
+
+/** The levels of the attackers Pokebattler simulates with (its `attackers/levels/<n>`). */
+export const ATTACKER_LEVELS = ['20', '25', '30', '35', '40', '41', '45', '50', '51'] as const;
+export type AttackerLevel = (typeof ATTACKER_LEVELS)[number];
+
+/** Level 40: the common case, said in the answer as what was assumed (ruling, plan 6B). */
+export const DEFAULT_ATTACKER_LEVEL: AttackerLevel = '40';
+
+export const ATTACKER_LEVEL_NAMES: Readonly<Record<AttackerLevel, string>> = {
+  '20': 'Level 20',
+  '25': 'Level 25',
+  '30': 'Level 30',
+  '35': 'Level 35',
+  '40': 'Level 40',
+  '41': 'Level 41 (best buddy at 40)',
+  '45': 'Level 45',
+  '50': 'Level 50',
+  '51': 'Level 51 (best buddy at 50)',
+};
+
+export function isAttackerLevel(value: string): value is AttackerLevel {
+  return (ATTACKER_LEVELS as readonly string[]).includes(value);
+}
+
+/** Pokebattler's weather conditions (`weatherCondition`). */
+export const WEATHERS = [
+  'NO_WEATHER',
+  'CLEAR',
+  'RAINY',
+  'PARTLY_CLOUDY',
+  'OVERCAST',
+  'WINDY',
+  'SNOW',
+  'FOG',
+] as const;
+export type CounterWeather = (typeof WEATHERS)[number];
+
+export const DEFAULT_WEATHER: CounterWeather = 'NO_WEATHER';
+
+export const WEATHER_NAMES: Readonly<Record<CounterWeather, string>> = {
+  NO_WEATHER: 'No weather',
+  CLEAR: 'Sunny or clear',
+  RAINY: 'Rainy',
+  PARTLY_CLOUDY: 'Partly cloudy',
+  OVERCAST: 'Cloudy',
+  WINDY: 'Windy',
+  SNOW: 'Snow',
+  FOG: 'Fog',
+};
+
+export function isCounterWeather(value: string): value is CounterWeather {
+  return (WEATHERS as readonly string[]).includes(value);
+}
+
+/** Friendship with the other trainers of the raid, 0 (none) to 4 (best friends). */
+export const FRIENDSHIPS = ['0', '1', '2', '3', '4'] as const;
+export type Friendship = (typeof FRIENDSHIPS)[number];
+
+/** Best friends: the common case among the members of a raid group (ruling, plan 6B). */
+export const DEFAULT_FRIENDSHIP: Friendship = '4';
+
+export const FRIENDSHIP_NAMES: Readonly<Record<Friendship, string>> = {
+  '0': 'Not friends',
+  '1': 'Good friends',
+  '2': 'Great friends',
+  '3': 'Ultra friends',
+  '4': 'Best friends',
+};
+
+export function isFriendship(value: string): value is Friendship {
+  return (FRIENDSHIPS as readonly string[]).includes(value);
+}
+
+/**
+ * Pokebattler's raid level of each tier, as its list of raids names them (checked live on
+ * 2026-10-14). A mega legendary raid is its `MEGA_5`, a super mega raid its `5_MEGA_ENHANCED`.
+ */
+const RAID_LEVEL_NAMES: Readonly<Record<RaidLevel, string>> = {
+  T1: 'RAID_LEVEL_1',
+  T3: 'RAID_LEVEL_3',
+  T5: 'RAID_LEVEL_5',
+  Mega: 'RAID_LEVEL_MEGA',
+  MegaLegendary: 'RAID_LEVEL_MEGA_5',
+  SuperMega: 'RAID_LEVEL_5_MEGA_ENHANCED',
+  Elite: 'RAID_LEVEL_ELITE',
+};
+
+/** The shadow raid levels Pokebattler has. */
+const SHADOW_RAID_LEVEL_NAMES: Readonly<Partial<Record<RaidLevel, string>>> = {
+  T1: 'RAID_LEVEL_1_SHADOW',
+  T3: 'RAID_LEVEL_3_SHADOW',
+  T5: 'RAID_LEVEL_5_SHADOW',
+};
+
+/**
+ * Pokebattler's raid level for a tier; undefined for a tier it has none for, which is refused
+ * with a sentence and never asked with a guessed level.
+ */
+export function pokebattlerRaidLevel(tier: RaidTier): string | undefined {
+  return tier.shadow ? SHADOW_RAID_LEVEL_NAMES[tier.level] : RAID_LEVEL_NAMES[tier.level];
+}
+
+/**
+ * The names under which Pokebattler may know a boss, to be tried in this order (the next only
+ * when the one before is unknown to it, or answers without any counter). Usually the catalogue's `pokebattlerId`. A species known
+ * by its default form (`LANDORUS_INCARNATE_FORM`) falls back to the bare species id, which the
+ * legacy data used for 14 of them (follow-ups: which Pokebattler takes is for staging to show).
+ * A shadow boss is `<species>_SHADOW_FORM` (live, 2026-10-14: `LANDORUS_SHADOW_FORM`); for a
+ * regional or other form the form's name stands for the species (`ARCANINE_HISUIAN_SHADOW_FORM`,
+ * not seen live). A mega is never a shadow boss: no names.
+ */
+export function pokebattlerBossIds(entry: PokemonEntry, shadow: boolean): string[] {
+  if (shadow) {
+    if (entry.kind === 'mega') return [];
+    const base =
+      entry.kind === 'species' ? entry.pokemonId : entry.pokebattlerId.replace(/_FORM$/, '');
+    return [`${base}_SHADOW_FORM`];
+  }
+  const names = [entry.pokebattlerId];
+  if (entry.kind === 'species' && entry.pokebattlerId !== entry.pokemonId) {
+    names.push(entry.pokemonId);
+  }
+  return names;
+}
+
+/** Where the attackers of a simulation come from: everybody's at a level, or one Pokébox. */
+export type CounterAttackers =
+  { kind: 'level'; level: AttackerLevel } | { kind: 'box'; userId: number };
+
+/** One simulation Pokebattler is asked for. */
+export interface CounterQuery {
+  /** The boss's Pokebattler name (`pokebattlerBossIds`). */
+  boss: string;
+  /** Pokebattler's raid level (`pokebattlerRaidLevel`). */
+  raidLevel: string;
+  attackers: CounterAttackers;
+  weather: CounterWeather;
+  friendship: Friendship;
+}
+
+/** Pokebattler's API of raid simulations. */
+export const POKEBATTLER_API = 'https://fight.pokebattler.com';
+/** Pokebattler's site, where the same path shows the full results. */
+export const POKEBATTLER_SITE = 'https://www.pokebattler.com';
+
+/**
+ * The path and query of a simulation, as the legacy bot asked it: the attack when possible, a
+ * random boss moveset mix, dodging at reaction time, averaged, any number of other trainers.
+ * The same on the API and on the site.
+ */
+export function counterPath(query: CounterQuery): string {
+  const attackers =
+    query.attackers.kind === 'level'
+      ? `levels/${query.attackers.level}`
+      : `users/${String(query.attackers.userId)}`;
+  const params = new URLSearchParams({
+    sort: 'TIME',
+    weatherCondition: query.weather,
+    dodgeStrategy: 'DODGE_REACTION_TIME',
+    aggregation: 'AVERAGE',
+    randomAssistants: '-1',
+    friendLevel: `FRIENDSHIP_LEVEL_${query.friendship}`,
+  });
+  return (
+    `/raids/defenders/${encodeURIComponent(query.boss)}/levels/${encodeURIComponent(query.raidLevel)}` +
+    `/attackers/${attackers}/strategies/CINEMATIC_ATTACK_WHEN_POSSIBLE/DEFENSE_RANDOM_MC` +
+    `?${params.toString()}`
+  );
+}
diff --git a/src/domain/counters/pokebattler-answer.test.ts b/src/domain/counters/pokebattler-answer.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..41f2897187439542064d4abf61c71b5cbea2a6d7
--- /dev/null
+++ b/src/domain/counters/pokebattler-answer.test.ts
@@ -0,0 +1,133 @@
+import { describe, expect, it } from 'vitest';
+import { pokebattlerAnswer } from '../../../test/support/pokebattler.js';
+import { hasCounters, readCounterAnswer } from './pokebattler-answer.js';
+
+describe('readCounterAnswer', () => {
+  it('reads the counters per moveset of the boss and averaged', () => {
+    const answer = readCounterAnswer(
+      pokebattlerAnswer({
+        byMove: [
+          {
+            move1: 'CONFUSION_FAST',
+            move2: 'PSYSTRIKE',
+            defenders: [
+              {
+                pokemonId: 'TYRANITAR',
+                cp: 3670,
+                byMove: [
+                  {
+                    move1: 'BITE_FAST',
+                    move2: 'BRUTAL_SWING',
+                    seconds: 120.5,
+                    deaths: 4.25,
+                    estimator: 2.62,
+                  },
+                ],
+              },
+            ],
+          },
+        ],
+        average: [
+          {
+            pokemonId: 'DARKRAI',
+            name: 'Nightmare',
+            byMove: [
+              {
+                move1: 'SNARL_FAST',
+                move2: 'SHADOW_BALL',
+                move3: 'DARK_PULSE',
+                legacyDate: '2023-01-01',
+                seconds: 99,
+              },
+            ],
+          },
+        ],
+      }),
+    );
+    expect(answer).toEqual({
+      byMoveset: [
+        {
+          fast: 'CONFUSION_FAST',
+          charged: 'PSYSTRIKE',
+          counters: [
+            {
+              pokemonId: 'TYRANITAR',
+              cp: 3670,
+              nickname: null,
+              results: [
+                {
+                  fast: 'BITE_FAST',
+                  charged: 'BRUTAL_SWING',
+                  third: null,
+                  legacy: false,
+                  timeMs: 120_500,
+                  deaths: 4.25,
+                  estimator: 2.62,
+                },
+              ],
+            },
+          ],
+        },
+      ],
+      average: {
+        fast: null,
+        charged: null,
+        counters: [
+          {
+            pokemonId: 'DARKRAI',
+            cp: 3000,
+            nickname: 'Nightmare',
+            results: [
+              {
+                fast: 'SNARL_FAST',
+                charged: 'SHADOW_BALL',
+                third: 'DARK_PULSE',
+                legacy: true,
+                timeMs: 99_000,
+                deaths: 5,
+                estimator: null,
+              },
+            ],
+          },
+        ],
+      },
+    });
+  });
+
+  it('leaves out what does not fit and reads the rest', () => {
+    const body = pokebattlerAnswer({
+      average: [
+        { pokemonId: 'TYRANITAR', byMove: [{ move1: 'BITE_FAST', move2: 'CRUNCH', seconds: 130 }] },
+        { pokemonId: 'GENGAR', byMove: [{ move1: 'LICK_FAST', move2: 'SHADOW_BALL', seconds: 1 }] },
+      ],
+    }) as { attackers: { randomMove: { defenders: Record<string, unknown>[] } }[] };
+    const defenders = body.attackers[0]?.randomMove.defenders ?? [];
+    // A counter without a name, and a result without a time.
+    delete defenders[0]?.['pokemonId'];
+    const gengar = defenders[1] as { byMove: { result: Record<string, unknown> }[] };
+    defenders.push({ ...structuredClone(gengar), pokemonId: 'HOUNDOOM' });
+    if (gengar.byMove[0]) gengar.byMove[0].result = { effectiveDeaths: 1 };
+    const answer = readCounterAnswer(body);
+    expect(answer?.average?.counters.map((counter) => counter.pokemonId)).toEqual(['HOUNDOOM']);
+    expect(answer?.byMoveset).toEqual([]);
+  });
+
+  it('reads an answer without any counter as one, which has no counters', () => {
+    const answer = readCounterAnswer(pokebattlerAnswer({ average: [] }));
+    expect(answer).toEqual({ byMoveset: [], average: { fast: null, charged: null, counters: [] } });
+    expect(answer && hasCounters(answer)).toBe(false);
+    const some = readCounterAnswer(
+      pokebattlerAnswer({
+        average: [{ pokemonId: 'X', byMove: [{ move1: 'A_FAST', move2: 'B', seconds: 1 }] }],
+      }),
+    );
+    expect(some && hasCounters(some)).toBe(true);
+  });
+
+  it('is nothing for an answer not of this shape', () => {
+    expect(readCounterAnswer({ attackers: [] })).toBeUndefined();
+    expect(readCounterAnswer({ error: 'no such raid' })).toBeUndefined();
+    expect(readCounterAnswer('<html>')).toBeUndefined();
+    expect(readCounterAnswer(null)).toBeUndefined();
+  });
+});
diff --git a/src/domain/counters/pokebattler-answer.ts b/src/domain/counters/pokebattler-answer.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ac0da55a375d3fd9d78ea9a94091934f6cf16745
--- /dev/null
+++ b/src/domain/counters/pokebattler-answer.ts
@@ -0,0 +1,166 @@
+import { z } from 'zod';
+
+/**
+ * What is used of Pokebattler's answer to a raid simulation (its shape checked live on
+ * 2026-10-14: 1.75 MB for Mewtwo in a T5 raid at level 40). `attackers[0]` holds `byMove`, one
+ * entry per moveset of the boss, and `randomMove`, the same averaged over the boss's movesets.
+ * Each lists `defenders` (the Pokémon that fight the boss, Pokebattler's word), each with its
+ * own movesets and their results.
+ */
+
+/** One moveset of a counter, and how it fares. */
+export interface CounterResult {
+  /** Move ids as the game master writes them (`CONFUSION_FAST`, `PSYSTRIKE`). */
+  fast: string;
+  charged: string;
+  /** A second charged move (a Pokébox's Pokémon can have one); null otherwise. */
+  third: string | null;
+  /** A move the Pokémon can no longer learn (Pokebattler's `legacyDate`). */
+  legacy: boolean;
+  /** How long the raid takes, in milliseconds (`effectiveCombatTime`). */
+  timeMs: number;
+  /** How often a counter faints on average (`effectiveDeaths`). */
+  deaths: number;
+  /** How many trainers it takes with this counter (`estimator`); null when not given. */
+  estimator: number | null;
+}
+
+/** A Pokémon that fights the boss (Pokebattler's "defender"). */
+export interface Counter {
+  /** Pokebattler's name of the Pokémon (`MEWTWO`, `MACHAMP_SHADOW_FORM`, `RAYQUAZA_MEGA`). */
+  pokemonId: string;
+  cp: number | null;
+  /** The name a trainer gave it, for a Pokémon of a Pokébox; null otherwise. */
+  nickname: string | null;
+  results: CounterResult[];
+}
+
+/** The counters against one moveset of the boss, or against all of them averaged. */
+export interface BossMovesetCounters {
+  /** The boss's moves; null for the average. */
+  fast: string | null;
+  charged: string | null;
+  counters: Counter[];
+}
+
+export interface CounterAnswer {
+  /** One per moveset of the boss Pokebattler knows. */
+  byMoveset: BossMovesetCounters[];
+  /** Averaged over the boss's movesets; undefined when the answer has none. */
+  average: BossMovesetCounters | undefined;
+}
+
+const resultSchema = z.object({
+  move1: z.string().min(1),
+  move2: z.string().min(1),
+  move3: z.string().min(1).nullish(),
+  legacyDate: z.unknown().optional(),
+  result: z.object({
+    effectiveCombatTime: z.number().finite().nonnegative(),
+    effectiveDeaths: z.number().finite().nonnegative(),
+    estimator: z.number().finite().positive().nullish(),
+  }),
+});
+
+const counterSchema = z.object({
+  pokemonId: z.string().min(1).max(100),
+  cp: z.number().finite().nullish(),
+  name: z.string().nullish(),
+  byMove: z.array(z.unknown()),
+});
+
+const bossMovesetSchema = z.object({
+  move1: z.string().min(1).nullish(),
+  move2: z.string().min(1).nullish(),
+  defenders: z.array(z.unknown()),
+});
+
+const answerSchema = z.object({
+  attackers: z
+    .array(
+      z.object({
+        byMove: z.array(z.unknown()).nullish(),
+        randomMove: z.unknown().optional(),
+      }),
+    )
+    .min(1),
+});
+
+/** A value of a list that does not fit is left out; the rest of the list is read. */
+function each<T>(values: readonly unknown[], schema: z.ZodType<T>): T[] {
+  const read: T[] = [];
+  for (const value of values) {
+    const parsed = schema.safeParse(value);
+    if (parsed.success) read.push(parsed.data);
+  }
+  return read;
+}
+
+function counterOf(raw: z.infer<typeof counterSchema>): Counter | undefined {
+  const results = each(raw.byMove, resultSchema).map((moveset): CounterResult => ({
+    fast: moveset.move1,
+    charged: moveset.move2,
+    third: moveset.move3 ?? null,
+    legacy:
+      moveset.legacyDate !== undefined &&
+      moveset.legacyDate !== null &&
+      moveset.legacyDate !== '' &&
+      moveset.legacyDate !== 0,
+    timeMs: moveset.result.effectiveCombatTime,
+    deaths: moveset.result.effectiveDeaths,
+    estimator: moveset.result.estimator ?? null,
+  }));
+  if (results.length === 0) return undefined;
+  const nickname = raw.name?.trim() ?? '';
+  return {
+    pokemonId: raw.pokemonId,
+    cp: raw.cp ?? null,
+    nickname: nickname === '' ? null : nickname,
+    results,
+  };
+}
+
+function bossMovesetOf(value: unknown): BossMovesetCounters | undefined {
+  const parsed = bossMovesetSchema.safeParse(value);
+  if (!parsed.success) return undefined;
+  const counters = each(parsed.data.defenders, counterSchema)
+    .map(counterOf)
+    .filter((counter): counter is Counter => counter !== undefined);
+  return {
+    fast: parsed.data.move1 ?? null,
+    charged: parsed.data.move2 ?? null,
+    counters,
+  };
+}
+
+/**
+ * Reads Pokebattler's answer, checked for the fields used. A moveset or counter that does not
+ * fit is left out and the rest is read; undefined for an answer not of this shape. An answer
+ * may have no counter at all (`hasCounters`): a Pokébox with nothing that can fight, or a name
+ * Pokebattler answers for without knowing it.
+ */
+export function readCounterAnswer(body: unknown): CounterAnswer | undefined {
+  const parsed = answerSchema.safeParse(body);
+  if (!parsed.success) return undefined;
+  const [attackers] = parsed.data.attackers;
+  if (!attackers) return undefined;
+  const byMoveset = (attackers.byMove ?? [])
+    .map(bossMovesetOf)
+    .filter(
+      (moveset): moveset is BossMovesetCounters =>
+        moveset !== undefined && moveset.fast !== null && moveset.charged !== null,
+    );
+  const average =
+    attackers.randomMove === undefined ? undefined : bossMovesetOf(attackers.randomMove);
+  return {
+    byMoveset,
+    average: average ? { ...average, fast: null, charged: null } : undefined,
+  };
+}
+
+/** Whether an answer lists any counter at all. */
+export function hasCounters(answer: CounterAnswer): boolean {
+  return [...answer.byMoveset, ...(answer.average ? [answer.average] : [])].some(
+    (moveset) => moveset.counters.length > 0,
+  );
+}
diff --git a/src/services/limited-json.test.ts b/src/services/limited-json.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2e5e7151ff8512f6da8fbdb2474e537e60f5017a
--- /dev/null
+++ b/src/services/limited-json.test.ts
@@ -0,0 +1,39 @@
+import { describe, expect, it } from 'vitest';
+import { jsonResponse } from '../../test/support/responses.js';
+import { readLimitedJson } from './limited-json.js';
+
+describe('readLimitedJson', () => {
+  it('reads a body in pieces as JSON', async () => {
+    const body = { attackers: [{ pokemonId: 'MEWTWO', text: 'é'.repeat(100) }] };
+    expect(await readLimitedJson(jsonResponse(body, { pieceBytes: 7 }), 10_000)).toEqual({
+      ok: true,
+      value: body,
+    });
+  });
+
+  it('gives up a body the moment it passes the limit, whatever its length said', async () => {
+    const response = jsonResponse({ text: 'x'.repeat(5_000) }, { pieceBytes: 1_000 });
+    expect(await readLimitedJson(response, 2_500)).toEqual({ ok: false, reason: 'too-large' });
+    expect(response.readBytes()).toBe(3_000);
+    expect(response.cancelled()).toBe(true);
+  });
+
+  it('does not read a body whose length says it is too large', async () => {
+    const response = jsonResponse({}, { contentLength: 6_000_000 });
+    expect(await readLimitedJson(response, 5_000_000)).toEqual({
+      ok: false,
+      reason: 'too-large',
+    });
+    expect(response.readBytes()).toBe(0);
+  });
+
+  it('says so of a body that is no JSON, or no body', async () => {
+    expect(await readLimitedJson(jsonResponse(null, { raw: '<html>' }), 100)).toEqual({
+      ok: false,
+      reason: 'unreadable',
+    });
+    expect(
+      await readLimitedJson({ status: 200, headers: { get: () => null }, body: null }, 100),
+    ).toEqual({ ok: false, reason: 'unreadable' });
+  });
+});
diff --git a/src/services/limited-json.ts b/src/services/limited-json.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a269586d09b6dbc678c5ba2fae33eb8b8d94f1a8
--- /dev/null
+++ b/src/services/limited-json.ts
@@ -0,0 +1,63 @@
+/** What is used of an answer whose body is read with a limit: its status, length and pieces. */
+export interface LimitedResponse {
+  status: number;
+  headers: { get(name: string): string | null };
+  body: {
+    getReader(): {
+      read(): Promise<{ done: boolean; value?: Uint8Array | undefined }>;
+      cancel(): Promise<void>;
+    };
+  } | null;
+}
+
+/**
+ * The body of an answer read as JSON. `too-large`: more bytes than the limit, whatever the
+ * answer said of its length (reading stops there). `unreadable`: no body, or no JSON.
+ */
+export type LimitedJson =
+  { ok: true; value: unknown } | { ok: false; reason: 'too-large' | 'unreadable' };
+
+/** Lets go of a body that is not read: what it says is of no use. */
+export function discardBody(response: LimitedResponse): void {
+  void response.body
+    ?.getReader()
+    .cancel()
+    .catch(() => undefined);
+}
+
+/**
+ * Reads the body of an answer piece by piece and gives it up the moment it passes `maxBytes`,
+ * then parses it as JSON. Throws only what reading throws (a broken connection, the end of
+ * the time limit of the request's signal).
+ */
+export async function readLimitedJson(
+  response: LimitedResponse,
+  maxBytes: number,
+): Promise<LimitedJson> {
+  const declared = Number(response.headers.get('content-length') ?? '');
+  if (Number.isFinite(declared) && declared > maxBytes) {
+    discardBody(response);
+    return { ok: false, reason: 'too-large' };
+  }
+  const reader = response.body?.getReader();
+  if (!reader) return { ok: false, reason: 'unreadable' };
+  const pieces: Uint8Array[] = [];
+  let length = 0;
+  for (;;) {
+    const { done, value } = await reader.read();
+    if (done) break;
+    if (!value) continue;
+    length += value.byteLength;
+    if (length > maxBytes) {
+      void reader.cancel().catch(() => undefined);
+      return { ok: false, reason: 'too-large' };
+    }
+    pieces.push(value);
+  }
+  const text = new TextDecoder().decode(Buffer.concat(pieces, length));
+  try {
+    return { ok: true, value: JSON.parse(text) as unknown };
+  } catch {
+    return { ok: false, reason: 'unreadable' };
+  }
+}
diff --git a/src/services/pokebattler-gateway.test.ts b/src/services/pokebattler-gateway.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9b4f760d596986618584915cf1f148df6101512e
--- /dev/null
+++ b/src/services/pokebattler-gateway.test.ts
@@ -0,0 +1,215 @@
+import { describe, expect, it, vi } from 'vitest';
+import { pokebattlerAnswer } from '../../test/support/pokebattler.js';
+import { jsonResponse } from '../../test/support/responses.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import type { LimitedResponse } from './limited-json.js';
+import {
+  PokebattlerFight,
+  type CounterRequest,
+  type PokebattlerFetch,
+} from './pokebattler-gateway.js';
+
+const BODY = pokebattlerAnswer({
+  average: [
+    { pokemonId: 'TYRANITAR', byMove: [{ move1: 'BITE_FAST', move2: 'CRUNCH', seconds: 120 }] },
+  ],
+});
+
+const REQUEST: CounterRequest = {
+  bosses: ['LANDORUS_INCARNATE_FORM', 'LANDORUS'],
+  raidLevel: 'RAID_LEVEL_5',
+  attackers: { kind: 'level', level: '40' },
+  weather: 'NO_WEATHER',
+  friendship: '4',
+};
+
+function setup(
+  answer: (url: string, signal: AbortSignal) => Promise<LimitedResponse>,
+  options: { maxBytes?: number; timeoutMs?: number } = {},
+) {
+  const { log, entries } = createTestLogger();
+  const fetch = vi.fn<PokebattlerFetch>((url, init) => answer(url, init.signal));
+  const clock = { now: 1_000_000 };
+  const fight = new PokebattlerFight({ fetch, log, now: () => clock.now, ...options });
+  const urls = () => fetch.mock.calls.map(([url]) => url);
+  return { fight, fetch, entries, clock, urls };
+}
+
+describe('PokebattlerFight', () => {
+  it('asks the API as the legacy bot did, and reads the answer', async () => {
+    const made = setup(() => Promise.resolve(jsonResponse(BODY)));
+    const outcome = await made.fight.counters(REQUEST);
+    expect(outcome.ok && outcome.answer.average?.counters[0]?.pokemonId).toBe('TYRANITAR');
+    expect(outcome.ok && outcome.query.boss).toBe('LANDORUS_INCARNATE_FORM');
+    const [url, init] = made.fetch.mock.calls[0] ?? [];
+    expect(url).toBe(
+      'https://fight.pokebattler.com/raids/defenders/LANDORUS_INCARNATE_FORM/levels/RAID_LEVEL_5/' +
+        'attackers/levels/40/strategies/CINEMATIC_ATTACK_WHEN_POSSIBLE/DEFENSE_RANDOM_MC?' +
+        'sort=TIME&weatherCondition=NO_WEATHER&dodgeStrategy=DODGE_REACTION_TIME&' +
+        'aggregation=AVERAGE&randomAssistants=-1&friendLevel=FRIENDSHIP_LEVEL_4',
+    );
+    expect(init?.method).toBe('GET');
+    expect(init?.redirect).toBe('error');
+    expect(init?.signal).toBeInstanceOf(AbortSignal);
+  });
+
+  it('asks under the next name of the boss when Pokebattler does not know the first', async () => {
+    const made = setup((url) =>
+      Promise.resolve(
+        url.includes('_INCARNATE_FORM') ? jsonResponse({}, { status: 404 }) : jsonResponse(BODY),
+      ),
+    );
+    const outcome = await made.fight.counters(REQUEST);
+    expect(outcome.ok && outcome.query.boss).toBe('LANDORUS');
+    expect(made.urls()).toHaveLength(2);
+  });
+
+  it('says it is unknown when no name is known, and does not keep that', async () => {
+    const made = setup(() => Promise.resolve(jsonResponse({}, { status: 404 })));
+    expect(await made.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unknown' });
+    await made.fight.counters(REQUEST);
+    expect(made.urls()).toHaveLength(4);
+    expect(await made.fight.counters({ ...REQUEST, bosses: [] })).toEqual({
+      ok: false,
+      reason: 'unknown',
+    });
+    expect(made.urls()).toHaveLength(4);
+  });
+
+  it('makes one request for the same setting at a time, and keeps the answer ten minutes', async () => {
+    let release: (() => void) | undefined;
+    const made = setup(
+      () =>
+        new Promise((resolve) => {
+          release = () => {
+            resolve(jsonResponse(BODY));
+          };
+        }),
+    );
+    const first = made.fight.counters(REQUEST);
+    const second = made.fight.counters({ ...REQUEST });
+    await vi.waitFor(() => {
+      expect(release).toBeDefined();
+    });
+    release?.();
+    const [a, b] = await Promise.all([first, second]);
+    expect(a).toBe(b);
+    expect(made.urls()).toHaveLength(1);
+    made.clock.now += 599_000;
+    expect(await made.fight.counters(REQUEST)).toBe(a);
+    expect(made.urls()).toHaveLength(1);
+    // Another setting is another request.
+    void made.fight.counters({ ...REQUEST, weather: 'WINDY' });
+    await vi.waitFor(() => {
+      expect(made.urls()).toHaveLength(2);
+    });
+    release?.();
+    made.clock.now += 1_000;
+    const again = made.fight.counters(REQUEST);
+    await vi.waitFor(() => {
+      expect(made.urls()).toHaveLength(3);
+    });
+    release?.();
+    expect((await again).ok).toBe(true);
+  });
+
+  it('fails into an answer: a refusal, an answer too large or of another shape, no answer', async () => {
+    const refused = setup(() => Promise.resolve(jsonResponse({}, { status: 503 })));
+    expect(await refused.fight.counters(REQUEST)).toEqual({
+      ok: false,
+      reason: 'refused',
+      status: 503,
+    });
+    const large = setup(() => Promise.resolve(jsonResponse(BODY, { pieceBytes: 50 })), {
+      maxBytes: 100,
+    });
+    expect(await large.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'too-large' });
+    const odd = setup(() => Promise.resolve(jsonResponse({ attackers: [] })));
+    expect(await odd.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unreadable' });
+    const html = setup(() => Promise.resolve(jsonResponse(null, { raw: '<html>' })));
+    expect(await html.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unreadable' });
+    const down = setup(() => Promise.reject(new TypeError('fetch failed')));
+    expect(await down.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unreachable' });
+    const slow = setup(() =>
+      Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })),
+    );
+    expect(await slow.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'timeout' });
+    expect(slow.entries.some((entry) => entry.msg === 'could not ask Pokebattler')).toBe(true);
+  });
+
+  it('asks under the next name when an answer has no counters, and says so of none', async () => {
+    const empty = pokebattlerAnswer({ average: [] });
+    const made = setup((url) =>
+      Promise.resolve(jsonResponse(url.includes('_INCARNATE_FORM') ? empty : BODY)),
+    );
+    const outcome = await made.fight.counters(REQUEST);
+    expect(outcome.ok && outcome.query.boss).toBe('LANDORUS');
+    const none = setup(() => Promise.resolve(jsonResponse(empty)));
+    expect(await none.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'empty' });
+    expect(none.urls()).toHaveLength(2);
+    // An empty answer is not kept either.
+    await none.fight.counters(REQUEST);
+    expect(none.urls()).toHaveLength(4);
+  });
+
+  it('does not keep the answer for a Pokébox, which its owner may change at any time', async () => {
+    const made = setup(() => Promise.resolve(jsonResponse(BODY)));
+    const box: CounterRequest = { ...REQUEST, attackers: { kind: 'box', userId: 4242 } };
+    await made.fight.counters(box);
+    await made.fight.counters(box);
+    expect(made.urls()).toHaveLength(2);
+  });
+
+  it('makes two requests at once at most; the others wait for their turn', async () => {
+    const releases: (() => void)[] = [];
+    const made = setup(
+      () =>
+        new Promise((resolve) => {
+          releases.push(() => {
+            resolve(jsonResponse(BODY));
+          });
+        }),
+    );
+    const asked = ['WINDY', 'RAINY', 'FOG'].map((weather) =>
+      made.fight.counters({ ...REQUEST, weather: weather as CounterRequest['weather'] }),
+    );
+    await vi.waitFor(() => {
+      expect(made.urls()).toHaveLength(2);
+    });
+    await new Promise((resolve) => setImmediate(resolve));
+    expect(made.urls()).toHaveLength(2);
+    releases[0]?.();
+    await vi.waitFor(() => {
+      expect(made.urls()).toHaveLength(3);
+    });
+    releases[1]?.();
+    releases[2]?.();
+    expect((await Promise.all(asked)).every((outcome) => outcome.ok)).toBe(true);
+  });
+
+  it('gives up a body that stops coming at the time limit', async () => {
+    const stalled = (signal: AbortSignal): LimitedResponse => ({
+      status: 200,
+      headers: { get: () => null },
+      body: {
+        getReader: () => ({
+          read: () =>
+            new Promise((_resolve, reject) => {
+              signal.addEventListener('abort', () => {
+                reject(signal.reason as Error);
+              });
+            }),
+          cancel: () => Promise.resolve(),
+        }),
+      },
+    });
+    const made = setup((_url, signal) => Promise.resolve(stalled(signal)), { timeoutMs: 30 });
+    expect(await made.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'timeout' });
+  });
+
+  it('asks for a Pokébox by its user id', async () => {
+    const made = setup(() => Promise.resolve(jsonResponse(BODY)));
+    await made.fight.counters({ ...REQUEST, attackers: { kind: 'box', userId: 4242 } });
+    expect(made.urls()[0]).toContain('/attackers/users/4242/strategies/');
+  });
+});
diff --git a/src/services/pokebattler-gateway.ts b/src/services/pokebattler-gateway.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5f72db0b33994ea1dc5cd92a5641568a249709ec
--- /dev/null
+++ b/src/services/pokebattler-gateway.ts
@@ -0,0 +1,202 @@
+import { BoundedMap } from '../bounded-map.js';
+import { counterPath, POKEBATTLER_API, type CounterQuery } from '../domain/counters/options.js';
+import {
+  hasCounters,
+  readCounterAnswer,
+  type CounterAnswer,
+} from '../domain/counters/pokebattler-answer.js';
+import type { Logger } from '../log.js';
+import { failureReason } from './failure-reason.js';
+import { discardBody, readLimitedJson, type LimitedResponse } from './limited-json.js';
+
+/** A simulation to ask for, with the names the boss may have, tried in this order. */
+export interface CounterRequest extends Omit<CounterQuery, 'boss'> {
+  bosses: readonly string[];
+}
+
+/**
+ * What came of asking Pokebattler. `ok`: the answer, with the query that gave it (the boss's
+ * name that Pokebattler knew). `unknown`: Pokebattler knows none of the boss's names (or the
+ * Pokébox). `empty`: it answered, but with no counter at all under any name (an empty Pokébox,
+ * or nothing that can fight). `refused`: another error status (`status`). `timeout`,
+ * `unreachable`: no answer. `too-large`, `unreadable`: an answer that could not be read.
+ */
+export type CounterOutcome =
+  | { ok: true; answer: CounterAnswer; query: CounterQuery }
+  | {
+      ok: false;
+      reason:
+        'unknown' | 'empty' | 'refused' | 'timeout' | 'unreachable' | 'too-large' | 'unreadable';
+      status?: number;
+    };
+
+/**
+ * Raid simulations of Pokebattler, for `/counters`. Nothing here throws: a failure is an
+ * answer. Tests use `FakePokebattler` (`test/support/pokebattler.ts`); nothing in a test
+ * touches the network.
+ */
+export interface PokebattlerGateway {
+  counters(request: CounterRequest): Promise<CounterOutcome>;
+}
+
+export type PokebattlerFetch = (
+  url: string,
+  init: {
+    method: 'GET';
+    headers: Record<string, string>;
+    redirect: 'error';
+    signal: AbortSignal;
+  },
+) => Promise<LimitedResponse>;
+
+export interface PokebattlerFightOptions {
+  fetch: PokebattlerFetch;
+  log: Logger;
+  now?: () => number;
+  /** How long one request may take, its body included. Default ten seconds. */
+  timeoutMs?: number;
+  /** A longer answer is given up. Default 5 MB (a real one is 1.75 MB). */
+  maxBytes?: number;
+  /** How long an answer is kept for the same request. Default ten minutes. */
+  cacheMs?: number;
+  /** How many answers are kept at most. Default ten. */
+  cacheSize?: number;
+  /** How many requests may be on their way at once; the others wait. Default two. */
+  maxConcurrent?: number;
+}
+
+/** Statuses by which Pokebattler says it knows no such boss, level or Pokébox. */
+const NOT_KNOWN = new Set([400, 404]);
+
+/**
+ * Pokebattler's API of raid simulations over `fetch`, as the legacy bot asked it. One request
+ * per setting at a time: whoever asks for what is being asked already waits for that answer, and
+ * an answer is kept for ten minutes, so the members of one raid who ask in turn make one
+ * request. A boss Pokebattler does not know under its first name is asked under the next.
+ */
+export class PokebattlerFight implements PokebattlerGateway {
+  private readonly now: () => number;
+  private readonly timeoutMs: number;
+  private readonly maxBytes: number;
+  private readonly cacheMs: number;
+  private readonly cache: BoundedMap<string, { at: number; outcome: CounterOutcome }>;
+  private readonly asking = new Map<string, Promise<CounterOutcome>>();
+  private readonly maxConcurrent: number;
+  private running = 0;
+  private readonly turns: (() => void)[] = [];
+
+  constructor(private readonly options: PokebattlerFightOptions) {
+    this.now = options.now ?? (() => Date.now());
+    this.timeoutMs = options.timeoutMs ?? 10_000;
+    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
+    this.cacheMs = options.cacheMs ?? 600_000;
+    this.cache = new BoundedMap(options.cacheSize ?? 10);
+    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 2);
+  }
+
+  counters(request: CounterRequest): Promise<CounterOutcome> {
+    if (request.bosses.length === 0) return Promise.resolve({ ok: false, reason: 'unknown' });
+    const key = JSON.stringify([
+      request.bosses,
+      request.raidLevel,
+      request.attackers,
+      request.weather,
+      request.friendship,
+    ]);
+    const now = this.now();
+    this.cache.dropWhile((kept) => now - kept.at >= this.cacheMs);
+    const kept = this.cache.get(key);
+    if (kept) return Promise.resolve(kept.outcome);
+    const asking = this.asking.get(key);
+    if (asking) return asking;
+    const answer = this.ask(request)
+      .then((outcome) => {
+        // A Pokébox is its owner's to change at any time: its answer is not kept.
+        if (outcome.ok && request.attackers.kind === 'level') {
+          this.cache.set(key, { at: this.now(), outcome });
+        }
+        return outcome;
+      })
+      .finally(() => this.asking.delete(key));
+    this.asking.set(key, answer);
+    return answer;
+  }
+
+  private async ask(request: CounterRequest): Promise<CounterOutcome> {
+    const { bosses, ...rest } = request;
+    let empty = false;
+    for (const boss of bosses) {
+      const outcome = await this.inTurn(() => this.one({ ...rest, boss }));
+      if (outcome.ok) return outcome;
+      if (outcome.reason !== 'unknown' && outcome.reason !== 'empty') return outcome;
+      empty ||= outcome.reason === 'empty';
+      this.options.log.info(
+        { boss, raidLevel: request.raidLevel, reason: outcome.reason },
+        'Pokebattler has no counters for this boss by this name',
+      );
+    }
+    return { ok: false, reason: empty ? 'empty' : 'unknown' };
+  }
+
+  /** Runs a request once fewer than `maxConcurrent` are on their way. */
+  private async inTurn(request: () => Promise<CounterOutcome>): Promise<CounterOutcome> {
+    if (this.running >= this.maxConcurrent) {
+      await new Promise<void>((resolve) => this.turns.push(resolve));
+    } else {
+      this.running += 1;
+    }
+    try {
+      return await request();
+    } finally {
+      const next = this.turns.shift();
+      // The place is handed on to the next in line, or given up.
+      if (next) next();
+      else this.running -= 1;
+    }
+  }
+
+  private async one(query: CounterQuery): Promise<CounterOutcome> {
+    const { log } = this.options;
+    const what = {
+      boss: query.boss,
+      raidLevel: query.raidLevel,
+      box: query.attackers.kind === 'box',
+    };
+    try {
+      const response = await this.options.fetch(`${POKEBATTLER_API}${counterPath(query)}`, {
+        method: 'GET',
+        headers: { Accept: 'application/json', 'User-Agent': 'Professor-Pine' },
+        redirect: 'error',
+        signal: AbortSignal.timeout(this.timeoutMs),
+      });
+      if (NOT_KNOWN.has(response.status)) {
+        discardBody(response);
+        return { ok: false, reason: 'unknown', status: response.status };
+      }
+      if (response.status !== 200) {
+        discardBody(response);
+        log.warn({ ...what, status: response.status }, 'Pokebattler refused a simulation');
+        return { ok: false, reason: 'refused', status: response.status };
+      }
+      const body = await readLimitedJson(response, this.maxBytes);
+      if (!body.ok) {
+        log.warn({ ...what, reason: body.reason }, 'could not read the answer of Pokebattler');
+        return { ok: false, reason: body.reason };
+      }
+      const answer = readCounterAnswer(body.value);
+      if (!answer) {
+        log.warn(what, 'the answer of Pokebattler is not of the shape known');
+        return { ok: false, reason: 'unreadable' };
+      }
+      if (!hasCounters(answer)) return { ok: false, reason: 'empty' };
+      return { ok: true, answer, query };
+    } catch (err) {
+      const timeout = err instanceof Error && err.name === 'TimeoutError';
+      log.warn(
+        { ...what, reason: timeout ? 'timeout' : failureReason(err) },
+        'could not ask Pokebattler',
+      );
+      return { ok: false, reason: timeout ? 'timeout' : 'unreachable' };
+    }
+  }
+}
diff --git a/test/support/pokebattler.ts b/test/support/pokebattler.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e98337c58430279be8dd3950d40aed5077c7b5e8
--- /dev/null
+++ b/test/support/pokebattler.ts
@@ -0,0 +1,157 @@
+import type { CounterQuery } from '../../src/domain/counters/options.js';
+import type {
+  CounterOutcome,
+  CounterRequest,
+  PokebattlerGateway,
+} from '../../src/services/pokebattler-gateway.js';
+import {
+  readCounterAnswer,
+  type CounterAnswer,
+} from '../../src/domain/counters/pokebattler-answer.js';
+
+/** A moveset of a counter as Pokebattler writes it. */
+export interface SampleResult {
+  move1: string;
+  move2: string;
+  move3?: string;
+  legacyDate?: string;
+  /** Seconds the raid takes. */
+  seconds: number;
+  deaths?: number;
+  estimator?: number;
+}
+
+/** A counter as Pokebattler writes it. */
+export interface SampleCounter {
+  pokemonId: string;
+  cp?: number;
+  name?: string;
+  byMove: SampleResult[];
+}
+
+function rawCounter(counter: SampleCounter): unknown {
+  return {
+    pokemonId: counter.pokemonId,
+    cp: counter.cp ?? 3000,
+    ...(counter.name === undefined ? {} : { name: counter.name, userId: 777 }),
+    byMove: counter.byMove.map((result) => ({
+      move1: result.move1,
+      move2: result.move2,
+      ...(result.move3 === undefined ? {} : { move3: result.move3 }),
+      ...(result.legacyDate === undefined ? {} : { legacyDate: result.legacyDate }),
+      result: {
+        effectiveCombatTime: result.seconds * 1000,
+        effectiveDeaths: result.deaths ?? 5,
+        tdo: 500,
+        ...(result.estimator === undefined ? {} : { estimator: result.estimator }),
+        win: true,
+      },
+    })),
+  };
+}
+
+/**
+ * An answer of Pokebattler's in its own shape (as checked live on 2026-10-14): the counters
+ * against each moveset of the boss and against all of them averaged. Made by hand: no test
+ * downloads one.
+ */
+export function pokebattlerAnswer(sample: {
+  byMove?: { move1: string; move2: string; defenders: SampleCounter[] }[];
+  average: SampleCounter[];
+}): unknown {
+  return {
+    attackers: [
+      {
+        pokemonId: 'MEWTWO',
+        byMove: (sample.byMove ?? []).map((moveset) => ({
+          move1: moveset.move1,
+          move2: moveset.move2,
+          defenders: moveset.defenders.map(rawCounter),
+          total: { win: true },
+        })),
+        randomMove: {
+          move1: 'RANDOM',
+          move2: 'RANDOM',
+          defenders: sample.average.map(rawCounter),
+        },
+      },
+    ],
+    sort: 'TIME',
+  };
+}
+
+/** A small answer for Mewtwo in a T5 raid: three counters, a shadow and a mega among them. */
+export function mewtwoAnswer(): CounterAnswer {
+  const counters: SampleCounter[] = [
+    {
+      pokemonId: 'TYRANITAR_SHADOW_FORM',
+      byMove: [{ move1: 'BITE_FAST', move2: 'BRUTAL_SWING', seconds: 100, estimator: 2.2 }],
+    },
+    {
+      pokemonId: 'GENGAR_MEGA',
+      byMove: [{ move1: 'LICK_FAST', move2: 'SHADOW_BALL', seconds: 110, estimator: 2.4 }],
+    },
+    {
+      pokemonId: 'TYRANITAR',
+      byMove: [
+        { move1: 'BITE_FAST', move2: 'BRUTAL_SWING', seconds: 120, estimator: 2.62 },
+        { move1: 'BITE_FAST', move2: 'CRUNCH', seconds: 125, estimator: 2.8 },
+      ],
+    },
+    {
+      pokemonId: 'DARKRAI',
+      byMove: [
+        {
+          move1: 'SNARL_FAST',
+          move2: 'SHADOW_BALL',
+          legacyDate: '2023-01-01',
+          seconds: 122,
+          estimator: 2.7,
+        },
+      ],
+    },
+  ];
+  const answer = readCounterAnswer(
+    pokebattlerAnswer({
+      byMove: [{ move1: 'CONFUSION_FAST', move2: 'PSYSTRIKE', defenders: counters.slice(2) }],
+      average: counters,
+    }),
+  );
+  if (!answer) throw new Error('the sample answer could not be read');
+  return answer;
+}
+
+/**
+ * Pokebattler as a test wants it: nothing leaves the process. Every request is recorded in
+ * `asked`; it is answered with `answer` (by default `mewtwoAnswer()`) for any boss name of
+ * `known` (every name when `known` is undefined), `unknown` for the others, or with `failing`.
+ * Like the real one it tries the boss's names in turn, never throws and never answers in the
+ * same turn of the event loop.
+ */
+export class FakePokebattler implements PokebattlerGateway {
+  readonly asked: CounterQuery[] = [];
+  answer: CounterAnswer = mewtwoAnswer();
+  known: ReadonlySet<string> | undefined;
+  failing: Extract<CounterOutcome, { ok: false }> | undefined;
+
+  counters(request: CounterRequest): Promise<CounterOutcome> {
+    let outcome: CounterOutcome = { ok: false, reason: 'unknown' };
+    for (const boss of request.bosses) {
+      const query: CounterQuery = { ...request, boss };
+      this.asked.push(query);
+      if (this.failing) {
+        outcome = this.failing;
+        break;
+      }
+      if (this.known === undefined || this.known.has(boss)) {
+        outcome = { ok: true, answer: this.answer, query };
+        break;
+      }
+    }
+    return new Promise((resolve) => {
+      setImmediate(() => {
+        resolve(outcome);
+      });
+    });
+  }
+}
diff --git a/test/support/responses.ts b/test/support/responses.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4d224614dc89b555a21a9b8bc96ec2db6dac64ab
--- /dev/null
+++ b/test/support/responses.ts
@@ -0,0 +1,41 @@
+import type { LimitedResponse } from '../../src/services/limited-json.js';
+
+/**
+ * An answer of a server as `readLimitedJson` reads it, made in the test: the body in pieces of
+ * `pieceBytes`, a `content-length` header only when given. `cancelled` says whether the reader
+ * let go of the rest.
+ */
+export function jsonResponse(
+  body: unknown,
+  options: { status?: number; contentLength?: number; pieceBytes?: number; raw?: string } = {},
+): LimitedResponse & { cancelled: () => boolean; readBytes: () => number } {
+  const bytes = new TextEncoder().encode(options.raw ?? JSON.stringify(body));
+  const pieceBytes = options.pieceBytes ?? 64 * 1024;
+  let at = 0;
+  let cancelled = false;
+  return {
+    status: options.status ?? 200,
+    headers: {
+      get: (name) =>
+        name.toLowerCase() === 'content-length' && options.contentLength !== undefined
+          ? String(options.contentLength)
+          : null,
+    },
+    body: {
+      getReader: () => ({
+        read: () => {
+          if (cancelled || at >= bytes.length) return Promise.resolve({ done: true });
+          const value = bytes.slice(at, at + pieceBytes);
+          at += value.byteLength;
+          return Promise.resolve({ done: false, value });
+        },
+        cancel: () => {
+          cancelled = true;
+          return Promise.resolve();
+        },
+      }),
+    },
+    cancelled: () => cancelled,
+    readBytes: () => at,
+  };
+}
````

---

### Task 2: Counters against a raid boss from Pokebattler: counters

Prototype commit: `a6f557f7b06c878664538d45dadb29090b7c4f27`

counters shows the twelve best counters against a raid boss as Pokebattler
simulates the raid: the time to win, how often a counter faints and how many
trainers it takes (Pokebattler's estimator, which replaces howmany), one line
above them with the trainers the best counter takes, and the title linked to
the full results on pokebattler.com. By default a counter's best moveset
only, without shadow Pokemon and megas; single, shadow and mega change that;
a legacy move is marked.

In the post of a raid (or of a train with a boss) the boss and tier are the
party's and the answer is public; elsewhere the boss is named, the tier is
the one it is a boss of now (the hardest of several), and the answer is
private. An egg whose boss is not known is refused. Level 40, no weather and
best friends are assumed when not given, and the answer says so. The boss's
moveset is an option with the boss's movesets as choices (the average
first). In servers and DMs, three uses a minute; what can be refused before
Pokebattler is asked is refused by a guard, without counting.

level can be the member's Pokebox: settings pokebattler-id saves or forgets
the id of their Pokebattler account (User.pokebattlerId), and that answer is
always private.

ctx.pokebattler holds the port; the test context a FakePokebattler.


**Files:**

```
 scripts/role-auth/report.test.ts       |   7 +-
 scripts/role-auth/report.ts            |   2 +-
 src/app-context.ts                     |   3 +
 src/app.ts                             |   3 +
 src/commands/index.ts                  |   2 +
 src/commands/settings/settings.test.ts |  34 ++++++++++
 src/commands/settings/settings.ts      |  46 ++++++++++++-
 src/commands/util/counters.test.ts     | 427 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/util/counters.ts          | 538 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/counters/counters.test.ts   |  81 +++++++++++++++++++++++
 src/domain/counters/counters.ts        |  85 +++++++++++++++++++++++++
 src/render/counters.test.ts            |  74 +++++++++++++++++++++
 src/render/counters.ts                 | 121 +++++++++++++++++++++++++++++++++++
 test/support/pokebattler.ts            |   7 +-
 test/support/test-context.ts           |   3 +
 15 files changed, 1425 insertions(+), 8 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `Counters against a raid boss from Pokebattler: counters`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/scripts/role-auth/report.test.ts b/scripts/role-auth/report.test.ts
index d3caebbe3647a9ffe82695ee9d1cc06b3c31463f..a581db16a764e55464d9ff8529be07c347511806 100644
--- a/scripts/role-auth/report.test.ts
+++ b/scripts/role-auth/report.test.ts
@@ -174,7 +174,8 @@ describe('the mapping of legacy commands', () => {
     expect(newCommandOf('gym')).toEqual({ kind: 'slash', commands: ['/location'] });
     expect(newCommandOf('spawn')).toEqual({ kind: 'slash', commands: ['/wild'] });
     expect(newCommandOf('require-role')).toMatchObject({ kind: 'dropped' });
-    expect(newCommandOf('counters')).toEqual({ kind: 'later', commands: ['/counters'] });
+    expect(newCommandOf('counters')).toEqual({ kind: 'slash', commands: ['/counters'] });
+    expect(newCommandOf('find')).toEqual({ kind: 'later', commands: ['/find-region'] });
     expect(newCommandOf('toString')).toBeUndefined();
     expect(newCommandOf('nonsense')).toBeUndefined();
   });
@@ -238,7 +239,7 @@ describe('exportText and exportJson', () => {
     { guild: HOME, command: 'meetup', roleRequired: true, roleIds: ['501', '502'] },
     { guild: HOME, command: 'train', roleRequired: true, roleIds: [] },
     { guild: HOME, command: 'rare', roleRequired: false, roleIds: ['503'] },
-    { guild: AWAY, command: 'counters', roleRequired: true, roleIds: ['504'] },
+    { guild: AWAY, command: 'find', roleRequired: true, roleIds: ['504'] },
   ]);
 
   it('prints a block per server, says that role names are not looked up', () => {
@@ -253,7 +254,7 @@ describe('exportText and exportJson', () => {
         '    warning: roles are listed but none is required: they had no effect\n',
     );
     expect(text).toContain(
-      `Server ${AWAY}\n  counters: required, roles 504 -> /counters (not built yet)\n`,
+      `Server ${AWAY}\n  find: required, roles 504 -> /find-region (not built yet)\n`,
     );
     expect(text.endsWith('\n')).toBe(true);
   });
diff --git a/scripts/role-auth/report.ts b/scripts/role-auth/report.ts
index c1018b6c895070ca8ea08150142d818111304019..2d1cc43fb670f8be0618291082bf8b3b5c3fc8ae 100644
--- a/scripts/role-auth/report.ts
+++ b/scripts/role-auth/report.ts
@@ -107,7 +107,7 @@ export const LEGACY_COMMANDS: Readonly<Record<string, NewCommand>> = {
   // Utilities (Phase 6).
   request: slash('/request'),
   rank: slash('/rank'),
-  counters: later('/counters'),
+  counters: slash('/counters'),
   'boss-tier': slash('/boss-tier'),
   find: later('/find-region'),
   maps: slash('/maps'),
diff --git a/src/app-context.ts b/src/app-context.ts
index 1fd0ebc8a0b8cbefb37c636e8fd9126bcc1476f3..202ddf79a81ede04786ea3dd842df7b81cef3e9d 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -18,6 +18,7 @@ import type { GymAdminService } from './services/gym-admin-service.js';
 import type { GymProvider } from './services/gym-directory.js';
 import type { IssueGateway } from './services/issue-gateway.js';
 import type { PartyService } from './services/party-service.js';
+import type { PokebattlerGateway } from './services/pokebattler-gateway.js';
 import type { PartyProvider } from './services/party-store.js';
 import type { PokemonFinder, PokemonNicknames } from './services/pokemon-search-service.js';
 import type { RaidBossAdmin, RaidBossProvider } from './services/raid-boss-service.js';
@@ -95,6 +96,8 @@ export interface AppContext {
   readonly maps: MapProvider;
   /** The issues of the GitHub repository that `/request` sends gym requests to. */
   readonly issues: IssueGateway;
+  /** Pokebattler's raid simulations, which `/counters` shows. */
+  readonly pokebattler: PokebattlerGateway;
   /** Privileged-intent features actually granted at login (may be fewer than configured). */
   features: IntentFlags;
 }
diff --git a/src/app.ts b/src/app.ts
index b40421edd375ea5c4d8aa4e87e7fe44f8ad74982..3222c9bd67a0f520b5893398d016919a4e36d943 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -46,6 +46,7 @@ import { QueuedDmSender } from './services/dm-sender.js';
 import { GameDataService } from './services/game-data-service.js';
 import { GoogleGeo } from './services/geo-gateway.js';
 import { GitHubIssues } from './services/issue-gateway.js';
+import { PokebattlerFight } from './services/pokebattler-gateway.js';
 import { GymAdminService } from './services/gym-admin-service.js';
 import { GymDirectory } from './services/gym-directory.js';
 import { GymUpkeep } from './services/gym-upkeep.js';
@@ -408,6 +409,8 @@ export async function startApp(
       fetch: (url, init) => fetch(url, init),
       log,
     }),
+    // Raid simulations for `/counters`, with ten minutes of memory of each answer.
+    pokebattler: new PokebattlerFight({ fetch: (url, init) => fetch(url, init), log }),
     features: requested,
   };
   // Read once, here: a species of `wildSpawnExceptions` that the game data does not know is
diff --git a/src/commands/index.ts b/src/commands/index.ts
index c4eaac5a14238bba63ab746a7092d6f11de87fd2..03ca8ec5f12c8d3810a123f307b406b03534c627 100644
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -27,6 +27,7 @@ import { finish, next, previous, skip } from './trains/move.js';
 import { route } from './trains/route.js';
 import { train } from './trains/train.js';
 import { bossTier } from './util/boss-tier.js';
+import { counters } from './util/counters.js';
 import { findGym } from './util/find-gym.js';
 import { help } from './util/help.js';
 import { maps } from './util/maps.js';
@@ -87,6 +88,7 @@ export const commands: readonly CommandModule[] = [
   gym,
   region,
   rank,
+  counters,
   bossTier,
   maps,
   findGym,
diff --git a/src/commands/settings/settings.test.ts b/src/commands/settings/settings.test.ts
index 893a214542594f6ac7f4f5c3d80404edb5bfe30f..8b53cfa11722acb163763abdc748928dbce54dc8 100644
--- a/src/commands/settings/settings.test.ts
+++ b/src/commands/settings/settings.test.ts
@@ -61,6 +61,7 @@ describe('/settings', () => {
       'new-train',
       'auto-status',
       'privacy',
+      'pokebattler-id',
     ]);
     expect(settings.help.category).toBe('notifications');
     // The switch for all pings names every ping it switches.
@@ -344,3 +345,36 @@ describe('/settings show', () => {
     );
   });
 });
+
+describe('/settings pokebattler-id', () => {
+  it('saves the id of a Pokebattler account, shows it, and forgets it', async () => {
+    const made = setup();
+    expect(await made.answer('pokebattler-id', { id: 123456 } as never)).toBe(
+      'Your Pokebattler user id is 123456: `/counters level:My Pokébox on Pokebattler` uses ' +
+        'the Pokémon of that account.',
+    );
+    expect((await made.users.get(ALICE)).pokebattlerId).toBe(123456);
+    expect(await made.answer('show')).toContain(
+      '- Pokebattler user id: **123456** · `/settings pokebattler-id`',
+    );
+    expect(await made.answer('pokebattler-id')).toBe('Your Pokebattler user id is forgotten.');
+    expect((await made.users.get(ALICE)).pokebattlerId).toBeNull();
+    expect(await made.answer('show')).not.toContain('Pokebattler');
+  });
+
+  it('names the choice of /counters as the list shows it', () => {
+    const details = settings.subcommands.get('pokebattler-id')?.help?.details ?? '';
+    expect(details).toContain('`/counters level:My Pokébox on Pokebattler`');
+  });
+
+  it('takes a whole number from 1 to what the legacy column holds', () => {
+    const json = settings.data.toJSON();
+    const part = json.options?.find((option) => option.name === 'pokebattler-id') as
+      | { options?: { name: string; min_value?: number; max_value?: number; required?: boolean }[] }
+      | undefined;
+    expect(part?.options).toEqual([
+      expect.objectContaining({ name: 'id', min_value: 1, max_value: 2_147_483_647 }),
+    ]);
+    expect(part?.options?.[0]?.required).toBeFalsy();
+  });
+});
diff --git a/src/commands/settings/settings.ts b/src/commands/settings/settings.ts
index 4af63a79c52b5810ae57026c3dcc434c1922e99b..25e7719f5101755e080190e3e47b98b752f06047 100644
--- a/src/commands/settings/settings.ts
+++ b/src/commands/settings/settings.ts
@@ -11,6 +11,7 @@ import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
 import { plain, truncate } from '../../render/text.js';
 import { answer } from '../../discord/late-reply.js';
+import { UserError } from '../../discord/errors.js';
 
 /** The settings that are switched on or off, as `UserSettings` names them. */
 type Flag =
@@ -214,6 +215,11 @@ export function settingsLines(
       `In-game name: **${plain(truncate(nickname, SHOWN_VALUE))}**${via('/nickname register')}`,
     );
   }
+  if (settings.pokebattlerId !== null) {
+    lines.push(
+      `Pokebattler user id: **${String(settings.pokebattlerId)}**${via('/settings pokebattler-id')}`,
+    );
+  }
   return lines;
 }
 
@@ -387,6 +393,44 @@ const privacy: SubcommandPart = {
   },
 };
 
+/** The largest id the legacy column (`User.pokebattlerId`, a signed `int`) holds. */
+export const MAX_POKEBATTLER_ID = 2_147_483_647;
+
+const pokebattlerId: SubcommandPart = {
+  data: new SlashCommandSubcommandBuilder()
+    .setName('pokebattler-id')
+    .setDescription('Your user id on Pokebattler, for /counters with your Pokébox')
+    .addIntegerOption((option) =>
+      option
+        .setName('id')
+        .setDescription('The number of your Pokebattler account; leave it out to forget it')
+        .setMinValue(1)
+        .setMaxValue(MAX_POKEBATTLER_ID),
+    ),
+  help: {
+    details:
+      'Saves the user id of your Pokebattler account, so that ' +
+      '`/counters level:My Pokébox on Pokebattler` simulates a raid with the Pokémon you entered there. Without an id it is forgotten.',
+    examples: ['/settings pokebattler-id id:123456', '/settings pokebattler-id'],
+  },
+  defer: 'late',
+  throttle: MEMBER_WRITE_THROTTLE,
+  async execute(interaction, ctx) {
+    const id = interaction.options.getInteger('id');
+    if (id !== null && (!Number.isSafeInteger(id) || id < 1 || id > MAX_POKEBATTLER_ID)) {
+      throw new UserError('A Pokebattler user id is a whole number from 1 up.');
+    }
+    await ctx.users.update(interaction.user.id, { pokebattlerId: id });
+    await answer(interaction, {
+      content:
+        id === null
+          ? 'Your Pokebattler user id is forgotten.'
+          : `Your Pokebattler user id is ${String(id)}: \`/counters level:My Pokébox on ` +
+            'Pokebattler` uses the Pokémon of that account.',
+    });
+  },
+};
+
 /**
  * `/settings` (spec 4.2): what a member sets for themself. Every answer is for the member
  * alone, it works in any channel and in a DM with the bot, and nothing is sent to anybody else.
@@ -405,5 +449,5 @@ export const settings = commandGroup({
       '`/settings show` lists it all. Nobody else sees your answers.',
     examples: ['/settings show', '/settings mentions enabled:False'],
   },
-  parts: [show, ...FLAGS.map(flagPart), newTrain, autoStatus, privacy],
+  parts: [show, ...FLAGS.map(flagPart), newTrain, autoStatus, privacy, pokebattlerId],
 });
diff --git a/src/commands/util/counters.test.ts b/src/commands/util/counters.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7265847293e1d4de8c67fbcf95cb765df8218f01
--- /dev/null
+++ b/src/commands/util/counters.test.ts
@@ -0,0 +1,427 @@
+import { InteractionContextType, MessageFlags, type APIEmbed } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import {
+  fakeAutocomplete,
+  fakeChatInput,
+  sent,
+  type FakeInteraction,
+} from '../../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../../test/support/gyms.js';
+import { ALICE } from '../../../test/support/parties.js';
+import { createdTrain, reportedRaid } from '../../../test/support/party-service.js';
+import { FakePokebattler } from '../../../test/support/pokebattler.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { MemoryUsers } from '../../../test/support/users.js';
+import { InteractionRouter } from '../../discord/router.js';
+import { counters } from './counters.js';
+
+function setup(overrides: Parameters<typeof createTestContext>[0] = {}) {
+  const pokebattler = new FakePokebattler();
+  const users = new MemoryUsers();
+  const { ctx, entries } = createTestContext({ pokebattler, users, ...overrides });
+  const router = new InteractionRouter(ctx, [counters], []);
+  const run = async (options: Record<string, string | boolean>, extra: object = {}) => {
+    const interaction = fakeChatInput({
+      commandName: 'counters',
+      userId: ALICE,
+      options,
+      ...extra,
+    });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  return { ctx, entries, pokebattler, users, router, run };
+}
+
+/** What the member was told in words: a refusal before the deferral, or a failure after it. */
+function told(used: FakeInteraction): string | undefined {
+  for (const mock of [used.followUp, used.editReply, used.reply]) {
+    if (mock.mock.calls.length > 0) return sent(mock).content;
+  }
+  throw new Error('nothing was answered');
+}
+
+/** The embed of the answer. */
+function embedOf(used: FakeInteraction): APIEmbed {
+  const embed = (sent(used.editReply).embeds as APIEmbed[] | undefined)?.[0];
+  if (!embed) throw new Error('no embed was answered');
+  return embed;
+}
+
+describe('/counters: the command', () => {
+  it('is for members, in servers and DMs, three in a minute, with the legacy choices', () => {
+    const json = counters.data.toJSON();
+    expect(json.default_member_permissions).toBeUndefined();
+    expect(json.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
+    expect(json.options?.map((option) => [option.name, option.required ?? false])).toEqual([
+      ['boss', false],
+      ['tier', false],
+      ['level', false],
+      ['weather', false],
+      ['friendship', false],
+      ['moveset', false],
+      ['shadow', false],
+      ['mega', false],
+      ['single', false],
+    ]);
+    const choices = (name: string) =>
+      (
+        json.options?.find((option) => option.name === name) as
+          { choices?: { name: string; value: string }[] } | undefined
+      )?.choices?.map((choice) => choice.value);
+    expect(choices('tier')).toEqual([
+      'T1',
+      'T3',
+      'T5',
+      'Mega',
+      'MegaLegendary',
+      'SuperMega',
+      'Elite',
+      'shadow:T1',
+      'shadow:T3',
+      'shadow:T5',
+    ]);
+    expect(choices('level')).toEqual(['20', '25', '30', '35', '40', '41', '45', '50', '51', 'box']);
+    expect(choices('friendship')).toEqual(['0', '1', '2', '3', '4']);
+    expect(counters.throttle).toEqual({ uses: 3, perSeconds: 60 });
+  });
+});
+
+describe('/counters: elsewhere than in a raid post', () => {
+  it('simulates the boss named, in the tier it is a boss of now, privately', async () => {
+    const made = setup();
+    const used = await made.run({ boss: 'yveltal' });
+    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(made.pokebattler.asked).toEqual([
+      {
+        boss: 'YVELTAL',
+        raidLevel: 'RAID_LEVEL_5',
+        attackers: { kind: 'level', level: '40' },
+        weather: 'NO_WEATHER',
+        friendship: '4',
+      },
+    ]);
+    const embed = embedOf(used);
+    expect(embed.title).toBe('Counters for Yveltal (T5)');
+    expect(embed.url).toBe(
+      'https://www.pokebattler.com/raids/defenders/YVELTAL/levels/RAID_LEVEL_5/attackers/' +
+        'levels/40/strategies/CINEMATIC_ATTACK_WHEN_POSSIBLE/DEFENSE_RANDOM_MC?sort=TIME&' +
+        'weatherCondition=NO_WEATHER&dodgeStrategy=DODGE_REACTION_TIME&aggregation=AVERAGE&' +
+        'randomAssistants=-1&friendLevel=FRIENDSHIP_LEVEL_4',
+    );
+    expect(embed.description).toBe(
+      [
+        'About **3 trainers** with the best counters.',
+        'Attackers at Level 40 (assumed) · No weather (assumed) · Best friends (assumed)',
+        'Boss moves: the average of all its movesets',
+        '__Time to win | Deaths | Trainers__',
+        '`#01` **Tyranitar**: 120s | 5.0 | 2.7\n*Bite / Brutal Swing*',
+        '`#02` **Darkrai**: 122s | 5.0 | 2.7\n*Snarl / Shadow Ball †*',
+      ].join('\n'),
+    );
+    expect(embed.footer?.text).toBe(
+      'Click the title for the full results · † a legacy move · no shadow Pokémon ' +
+        '(shadow:True lists them) · no megas (mega:True lists them)',
+    );
+    expect(embed.author?.name).toBe('Data provided by Pokebattler');
+    expect(embed.thumbnail?.url).toBeDefined();
+  });
+
+  it('takes the shadow tier a Pokémon is a boss of, and its shadow name', async () => {
+    const made = setup();
+    await made.run({ boss: 'landorus_incarnate' });
+    expect(made.pokebattler.asked.map((query) => [query.boss, query.raidLevel])).toEqual([
+      ['LANDORUS_SHADOW_FORM', 'RAID_LEVEL_5_SHADOW'],
+    ]);
+  });
+
+  it('asks with what was chosen, and under the next name Pokebattler might know', async () => {
+    const made = setup();
+    made.pokebattler.known = new Set(['LANDORUS']);
+    const used = await made.run({
+      boss: 'landorus_incarnate',
+      tier: 'T5',
+      level: '50',
+      weather: 'WINDY',
+      friendship: '2',
+      shadow: true,
+      mega: true,
+      single: true,
+    });
+    expect(made.pokebattler.asked).toEqual([
+      expect.objectContaining({ boss: 'LANDORUS_INCARNATE_FORM' }),
+      {
+        boss: 'LANDORUS',
+        raidLevel: 'RAID_LEVEL_5',
+        attackers: { kind: 'level', level: '50' },
+        weather: 'WINDY',
+        friendship: '2',
+      },
+    ]);
+    const embed = embedOf(used);
+    expect(embed.url).toContain('/raids/defenders/LANDORUS/levels/RAID_LEVEL_5/');
+    expect(embed.description).toContain('Attackers at Level 50 · Windy · Great friends');
+    expect(embed.description).toContain('`#01` **Shadow Tyranitar**: 100s');
+    expect(embed.description).toContain('`#02` **Mega Gengar**: 110s');
+    expect(embed.description).toContain('`#05` **Tyranitar**: 125s');
+    expect(embed.footer?.text).toBe('Click the title for the full results · † a legacy move');
+  });
+
+  it('shows the counters against one moveset of the boss', async () => {
+    const made = setup();
+    const used = await made.run({
+      boss: 'mewtwo',
+      tier: 'T5',
+      moveset: 'CONFUSION_FAST/PSYSTRIKE',
+    });
+    const description = embedOf(used).description ?? '';
+    expect(description).toContain('Boss moves: Confusion / Psystrike');
+    expect(description).toContain('`#01` **Tyranitar**');
+    expect(description).not.toContain('Darkrai');
+  });
+
+  it('reads a moveset typed by its moves, and says which Pokebattler has', async () => {
+    const made = setup();
+    expect(
+      told(await made.run({ boss: 'mewtwo', tier: 'T5', moveset: 'psycho cut / shadow ball' })),
+    ).toBe(
+      'Pokebattler has no results for Mewtwo with Psycho Cut / Shadow Ball. It simulates ' +
+        'Confusion / Psystrike.',
+    );
+  });
+
+  it('refuses what it can before Pokebattler is asked, without counting it', async () => {
+    const made = setup();
+    expect(told(await made.run({}))).toBe(
+      'Say which boss with `boss`, or use this in the post of a raid, where it is that raid’s.',
+    );
+    expect(told(await made.run({ boss: 'rattata' }))).toBe(
+      'Rattata is not a raid boss now. Say which tier to simulate with `tier`.',
+    );
+    expect(told(await made.run({ boss: 'blastoise_mega', tier: 'shadow:T5' }))).toBe(
+      'Mega Blastoise is never the boss of a shadow raid.',
+    );
+    expect(told(await made.run({ boss: 'mewtwo', tier: 'T5', moveset: 'hydro pump' }))).toBe(
+      '"hydro pump" is not a moveset of Mewtwo: name a fast and a charged move it has, or ' +
+        'pick one from the list.',
+    );
+    expect(told(await made.run({ boss: 'mewtwo', tier: 'T5', level: 'box' }))).toBe(
+      'You have no Pokebattler user id saved. Save it with `/settings pokebattler-id`, or pick ' +
+        'a level.',
+    );
+    // A value of the list that is no moveset of this boss (another Pokémon's list).
+    expect(
+      told(await made.run({ boss: 'yveltal', tier: 'T5', moveset: 'CONFUSION_FAST/PSYSTRIKE' })),
+    ).toBe(
+      '"CONFUSION\\_FAST/PSYSTRIKE" is not a moveset of Yveltal: name a fast and a charged move ' +
+        'it has, or pick one from the list.',
+    );
+    expect(made.pokebattler.asked).toEqual([]);
+    for (let i = 0; i < 3; i += 1) await made.run({ boss: 'yveltal' });
+    expect(told(await made.run({ boss: 'yveltal' }))).toMatch(/^You can use \/counters again in/);
+    expect(made.pokebattler.asked).toHaveLength(3);
+  });
+
+  it('says so when Pokebattler gave nothing', async () => {
+    const made = setup();
+    made.pokebattler.known = new Set();
+    expect(told(await made.run({ boss: 'yveltal' }))).toBe(
+      'Pokebattler does not know Yveltal as a boss of T5 raids.',
+    );
+    made.pokebattler.failing = { ok: false, reason: 'empty' };
+    expect(told(await made.run({ boss: 'yveltal' }))).toBe(
+      'Pokebattler lists no counters against Yveltal in T5 raids.',
+    );
+    const again = setup();
+    again.pokebattler.failing = { ok: false, reason: 'timeout' };
+    expect(told(await again.run({ boss: 'yveltal' }))).toBe(
+      'Pokebattler did not answer just now. Please try again later.',
+    );
+    again.pokebattler.failing = { ok: false, reason: 'unreadable' };
+    expect(told(await again.run({ boss: 'yveltal' }))).toBe(
+      'The answer of Pokebattler could not be read. Please try again later.',
+    );
+  });
+
+  it('works in a DM', async () => {
+    const made = setup();
+    const used = await made.run({ boss: 'yveltal' }, { isDm: true, guildId: null });
+    expect(embedOf(used).title).toBe('Counters for Yveltal (T5)');
+  });
+});
+
+describe('/counters: in the post of a raid', () => {
+  it('simulates the raid’s boss and tier, for everybody there', async () => {
+    const raid = await reportedRaid({
+      boss: { key: 'yveltal' },
+      tier: { level: 'T5', shadow: false },
+    });
+    const made = setup({ parties: raid.store, regions: raid.regions });
+    const used = await made.run({}, { channelId: raid.postId, thread: { parentId: WEST_FORUM } });
+    expect(used.deferReply).toHaveBeenCalledWith({});
+    expect(made.pokebattler.asked[0]?.boss).toBe('YVELTAL');
+    expect(embedOf(used).title).toBe('Counters for Yveltal (T5)');
+  });
+
+  it('answers a Pokébox privately, with the member’s saved id', async () => {
+    const raid = await reportedRaid({ boss: { key: 'yveltal' } });
+    const made = setup({ parties: raid.store, regions: raid.regions });
+    await made.users.update(ALICE, { pokebattlerId: 4242 });
+    const used = await made.run(
+      { level: 'box' },
+      { channelId: raid.postId, thread: { parentId: WEST_FORUM } },
+    );
+    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(made.pokebattler.asked[0]?.attackers).toEqual({ kind: 'box', userId: 4242 });
+    expect(embedOf(used).description).toContain('The Pokébox of Pokebattler user 4242');
+  });
+
+  it('refuses for an egg whose boss is not known yet', async () => {
+    const raid = await reportedRaid();
+    const made = setup({ parties: raid.store, regions: raid.regions });
+    const used = await made.run({}, { channelId: raid.postId, thread: { parentId: WEST_FORUM } });
+    expect(told(used)).toBe('The boss of this raid is not known yet. Name it with `boss`.');
+    expect(used.deferReply).not.toHaveBeenCalled();
+  });
+});
+
+describe('/counters: more in the posts of parties', () => {
+  const inPost = (postId: string) => ({ channelId: postId, thread: { parentId: WEST_FORUM } });
+
+  it('takes the raid’s tier for a boss named in its post, unless a tier is named', async () => {
+    const egg = await reportedRaid({ tier: { level: 'T5', shadow: false } });
+    const made = setup({ parties: egg.store, regions: egg.regions });
+    await made.run({ boss: 'yveltal' }, inPost(egg.postId));
+    expect(made.pokebattler.asked[0]?.raidLevel).toBe('RAID_LEVEL_5');
+    const t3 = await reportedRaid({ tier: { level: 'T3', shadow: false } });
+    const other = setup({ parties: t3.store, regions: t3.regions });
+    await other.run({ boss: 'yveltal' }, inPost(t3.postId));
+    expect(other.pokebattler.asked[0]?.raidLevel).toBe('RAID_LEVEL_3');
+    await other.run({ boss: 'yveltal', tier: 'Elite' }, inPost(t3.postId));
+    expect(other.pokebattler.asked[1]?.raidLevel).toBe('RAID_LEVEL_ELITE');
+  });
+
+  it('says that the tier of a shadow raid’s post was used for a boss never shadow', async () => {
+    const raid = await reportedRaid({ tier: { level: 'T5', shadow: true } });
+    const made = setup({ parties: raid.store, regions: raid.regions });
+    expect(told(await made.run({ boss: 'blastoise_mega' }, inPost(raid.postId)))).toBe(
+      'Mega Blastoise is never the boss of a shadow raid. I took the tier of this post ' +
+        '(Shadow T5): name another with `tier`.',
+    );
+    await made.run({ boss: 'blastoise_mega', tier: 'Mega' }, inPost(raid.postId));
+    expect(made.pokebattler.asked[0]?.raidLevel).toBe('RAID_LEVEL_MEGA');
+  });
+
+  it('says in its help and options what a raid’s post and a Pokébox change', () => {
+    const json = counters.data.toJSON();
+    const described = (name: string) =>
+      json.options?.find((option) => option.name === name)?.description ?? '';
+    expect(described('tier')).toBe(
+      'The tier; when left out, that of the raid whose post this is, else the boss’s now',
+    );
+    expect(described('shadow')).toBe(
+      'List shadow Pokémon as counters (a Pokébox lists them unless False)',
+    );
+    expect(described('mega')).toBe('List megas as counters (a Pokébox lists them unless False)');
+    for (const option of json.options ?? [])
+      expect(option.description.length).toBeLessThanOrEqual(100);
+    const details = typeof counters.help.details === 'string' ? counters.help.details : '';
+    expect(details).toContain(
+      'A boss you name in the post of a raid is simulated in that raid’s tier',
+    );
+    expect(details).toContain('A Pokébox lists its shadow Pokémon and megas too');
+  });
+
+  it('refuses a boss too new for the game data', async () => {
+    const raid = await reportedRaid({ boss: { name: 'Newmon' } });
+    const made = setup({ parties: raid.store, regions: raid.regions });
+    expect(told(await made.run({}, inPost(raid.postId)))).toBe(
+      'I cannot ask Pokebattler about Newmon yet: it is newer than the game data I have.',
+    );
+  });
+
+  it('tells of a failure after the public deferral privately', async () => {
+    const raid = await reportedRaid({ boss: { key: 'yveltal' } });
+    const made = setup({ parties: raid.store, regions: raid.regions });
+    made.pokebattler.failing = { ok: false, reason: 'unreachable' };
+    const used = await made.run({}, inPost(raid.postId));
+    expect(used.deferReply).toHaveBeenCalledWith({});
+    expect(used.deleteReply).toHaveBeenCalled();
+    expect(used.followUp).toHaveBeenCalledWith({
+      content: 'Pokebattler did not answer just now. Please try again later.',
+      flags: MessageFlags.Ephemeral,
+    });
+    expect(used.editReply).not.toHaveBeenCalled();
+  });
+
+  it('simulates the boss of a train for everybody in its post, and refuses without one', async () => {
+    const train = await createdTrain();
+    const made = setup({ parties: train.store, regions: train.regions });
+    expect(told(await made.run({}, inPost(train.postId)))).toBe(
+      'This train has no boss. Name one with `boss`.',
+    );
+    await train.trains.setBoss(
+      train.party.id,
+      { id: ALICE },
+      { boss: { key: 'yveltal' }, label: 'Yveltal' },
+    );
+    const used = await made.run({}, inPost(train.postId));
+    expect(used.deferReply).toHaveBeenCalledWith({});
+    expect(made.pokebattler.asked[0]).toMatchObject({
+      boss: 'YVELTAL',
+      raidLevel: 'RAID_LEVEL_5',
+    });
+  });
+
+  it('lists shadow Pokémon and megas of a Pokébox unless told not to', async () => {
+    const made = setup();
+    await made.users.update(ALICE, { pokebattlerId: 4242 });
+    const used = await made.run({ boss: 'yveltal', level: 'box' });
+    const description = embedOf(used).description ?? '';
+    expect(description).toContain('**Shadow Tyranitar**');
+    expect(description).toContain('**Mega Gengar**');
+    const without = await made.run({ boss: 'yveltal', level: 'box', shadow: false, mega: false });
+    expect(embedOf(without).description).not.toContain('Shadow Tyranitar');
+  });
+
+  it('says so of a Pokébox with nothing that can fight', async () => {
+    const made = setup();
+    await made.users.update(ALICE, { pokebattlerId: 4242 });
+    made.pokebattler.failing = { ok: false, reason: 'empty' };
+    expect(told(await made.run({ boss: 'yveltal', level: 'box' }))).toBe(
+      'Pokebattler found no Pokémon in the Pokébox of user 4242 that can fight this boss: ' +
+        'check that your Pokébox on Pokebattler is filled in.',
+    );
+  });
+});
+
+describe('/counters: the lists while typing', () => {
+  it('offers Pokémon for the boss, and the boss’s movesets with the average first', async () => {
+    const made = setup();
+    const ask = async (options: object) => {
+      const interaction = fakeAutocomplete({ commandName: 'counters', ...options });
+      await made.router.handle(interaction as never);
+      return (interaction.respond.mock.calls[0]?.[0] ?? []) as { name: string; value: string }[];
+    };
+    expect((await ask({ focusedName: 'boss', focused: 'yvelt' }))[0]?.value).toBe('yveltal');
+    const movesets = await ask({
+      focusedName: 'moveset',
+      focused: '',
+      options: { boss: 'mewtwo' },
+    });
+    expect(movesets[0]).toEqual({ name: 'Average of all movesets', value: 'average' });
+    expect(movesets).toContainEqual({
+      name: 'Confusion / Psystrike',
+      value: 'CONFUSION_FAST/PSYSTRIKE',
+    });
+    const narrowed = await ask({
+      focusedName: 'moveset',
+      focused: 'psystr',
+      options: { boss: 'mewtwo' },
+    });
+    expect(narrowed.every((choice) => choice.name.includes('Psystrike'))).toBe(true);
+    expect(await ask({ focusedName: 'moveset', focused: '' })).toEqual([
+      { name: 'Average of all movesets', value: 'average' },
+    ]);
+  });
+});
diff --git a/src/commands/util/counters.ts b/src/commands/util/counters.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3894fb89403061065023c662f3d577187e0ceb90
--- /dev/null
+++ b/src/commands/util/counters.ts
@@ -0,0 +1,538 @@
+import {
+  InteractionContextType,
+  SlashCommandBuilder,
+  type AutocompleteInteraction,
+  type ChatInputCommandInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { Guard, LocatedInteraction, SimpleCommand } from '../../discord/command.js';
+import { UserError } from '../../discord/errors.js';
+import { partyOf } from '../../discord/guards.js';
+import type { Throttle } from '../../discord/throttle.js';
+import { counterRows, pokebattlerNames, titleCase } from '../../domain/counters/counters.js';
+import {
+  ATTACKER_LEVEL_NAMES,
+  ATTACKER_LEVELS,
+  counterPath,
+  DEFAULT_ATTACKER_LEVEL,
+  DEFAULT_FRIENDSHIP,
+  DEFAULT_WEATHER,
+  FRIENDSHIP_NAMES,
+  FRIENDSHIPS,
+  isAttackerLevel,
+  isCounterWeather,
+  isFriendship,
+  POKEBATTLER_SITE,
+  pokebattlerBossIds,
+  pokebattlerRaidLevel,
+  WEATHER_NAMES,
+  WEATHERS,
+  type CounterAttackers,
+  type CounterWeather,
+  type Friendship,
+} from '../../domain/counters/options.js';
+import type { BossMovesetCounters } from '../../domain/counters/pokebattler-answer.js';
+import { bossOf, isRaid, isTrain, type Party } from '../../domain/party/party.js';
+import type { PokemonCatalogue } from '../../domain/pogo/catalogue.js';
+import type { Move, PokemonEntry } from '../../domain/pogo/game-master.js';
+import { parseMoveset } from '../../domain/pogo/move-search.js';
+import { pokemonPicture } from '../../domain/pogo/pokemon-icons.js';
+import {
+  bossStamina,
+  isRaidLevel,
+  RAID_LEVELS,
+  raidTier,
+  raidTierLabel,
+  SHADOW_RAID_LEVELS,
+  type RaidTier,
+} from '../../domain/pogo/raid-tier.js';
+import { renderCounters, type Assumed } from '../../render/counters.js';
+import { plain, truncate } from '../../render/text.js';
+import type { CounterOutcome } from '../../services/pokebattler-gateway.js';
+import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
+import { namedPokemon, pokemonChoices } from '../pokemon-option.js';
+
+/** An outside request: three in a minute (brief of plan 6B). */
+export const COUNTERS_THROTTLE: Throttle = { uses: 3, perSeconds: 60 };
+
+/** The `level` choice that uses the member's Pokébox on Pokebattler. */
+export const POKEBOX = 'box';
+/** The `moveset` value of the average of all the boss's movesets. */
+export const AVERAGE_MOVESET = 'average';
+
+/** The tiers as the `tier` option offers them: `T5`, `shadow:T5`. */
+const TIER_CHOICES: readonly RaidTier[] = [
+  ...RAID_LEVELS.map((level) => ({ level, shadow: false })),
+  ...SHADOW_RAID_LEVELS.map((level) => ({ level, shadow: true })),
+];
+const tierValue = (tier: RaidTier): string => `${tier.shadow ? 'shadow:' : ''}${tier.level}`;
+
+function readTier(value: string): RaidTier {
+  const [first, second] = value.split(':');
+  const shadow = first === 'shadow';
+  const level = shadow ? second : first;
+  const tier = level !== undefined && isRaidLevel(level) ? raidTier(level, shadow) : undefined;
+  if (!tier) throw new UserError('Pick the tier from its list.');
+  return tier;
+}
+
+/** Everything a use of `/counters` asks for, read before anything is sent. */
+interface CounterPlan {
+  entry: PokemonEntry;
+  tier: RaidTier;
+  raidLevel: string;
+  bosses: string[];
+  attackers: CounterAttackers;
+  weather: CounterWeather;
+  friendship: Friendship;
+  assumed: Assumed;
+  moveset: { fast: Move; charged: Move } | undefined;
+  shadow: boolean;
+  mega: boolean;
+  single: boolean;
+}
+
+/** The post of a party with a boss, where the boss and the tier need not be named. */
+function bossParty(interaction: LocatedInteraction, ctx: AppContext): Party | undefined {
+  if (!interaction.inGuild()) return undefined;
+  const party = partyOf(interaction, ctx);
+  return party && (isRaid(party) || isTrain(party)) ? party : undefined;
+}
+
+/**
+ * The tier a Pokémon is a boss of now, from the boss list members see; of several the hardest
+ * (the most stamina), an ordinary raid before a shadow raid of the same level. Undefined when it
+ * is no boss now.
+ */
+export function currentTier(ctx: AppContext, entry: PokemonEntry): RaidTier | undefined {
+  const tiers = ctx.raidBosses
+    .bosses()
+    .filter((boss) => boss.entry?.key === entry.key)
+    .map((boss) => boss.tier)
+    .sort((a, b) => bossStamina(b) - bossStamina(a) || Number(a.shadow) - Number(b.shadow));
+  return tiers[0];
+}
+
+/**
+ * The boss and tier: the options, else the party of the post. `fromPost`: the tier is that of
+ * the raid whose post this is, not one the member named.
+ */
+function bossAndTier(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+): { entry: PokemonEntry; tier: RaidTier; fromPost: boolean } {
+  const typedBoss = interaction.options.getString('boss')?.trim() ?? '';
+  const typedTier = interaction.options.getString('tier');
+  const tierOf = (entry: PokemonEntry, fallback: RaidTier | undefined): RaidTier => {
+    if (typedTier !== null) return readTier(typedTier);
+    const tier = fallback ?? currentTier(ctx, entry);
+    if (!tier) {
+      throw new UserError(
+        `${plain(entry.name)} is not a raid boss now. Say which tier to simulate with \`tier\`.`,
+      );
+    }
+    return tier;
+  };
+  const party = bossParty(interaction, ctx);
+  // In the post of a raid its tier is what a boss named there is simulated in.
+  const raidTier = party && isRaid(party) ? party.raid.tier : undefined;
+  const fromPost = typedTier === null && raidTier !== undefined;
+  if (typedBoss !== '') {
+    const entry = namedPokemon(ctx, typedBoss);
+    return { entry, tier: tierOf(entry, raidTier), fromPost };
+  }
+  if (!party) {
+    throw new UserError(
+      'Say which boss with `boss`, or use this in the post of a raid, where it is that raid’s.',
+    );
+  }
+  const ref = bossOf(party);
+  if (ref === null) {
+    throw new UserError(
+      isRaid(party)
+        ? 'The boss of this raid is not known yet. Name it with `boss`.'
+        : 'This train has no boss. Name one with `boss`.',
+    );
+  }
+  const entry = 'key' in ref ? ctx.gameData.catalogue.byKey(ref.key) : undefined;
+  if (!entry) {
+    throw new UserError(
+      `I cannot ask Pokebattler about ${'name' in ref ? plain(ref.name) : 'this boss'} yet: ` +
+        'it is newer than the game data I have.',
+    );
+  }
+  return { entry, tier: tierOf(entry, raidTier), fromPost };
+}
+
+/**
+ * The boss's movesets: each fast move with each charged move, its elite moves among them (a
+ * raid boss can have one: Mewtwo with Psystrike), those without elite moves first.
+ */
+function bossMovesets(
+  catalogue: PokemonCatalogue,
+  entry: PokemonEntry,
+): { fast: Move; charged: Move }[] {
+  const moves = (ids: readonly string[]): Move[] =>
+    ids.map((id) => catalogue.move(id)).filter((move): move is Move => move !== undefined);
+  const fastMoves = moves(entry.fastMoves);
+  const chargedMoves = moves(entry.chargedMoves);
+  const eliteFast = moves(entry.eliteFastMoves);
+  const eliteCharged = moves(entry.eliteChargedMoves);
+  const pairs = (fast: readonly Move[], charged: readonly Move[]) =>
+    fast.flatMap((one) => charged.map((other) => ({ fast: one, charged: other })));
+  return [
+    ...pairs(fastMoves, chargedMoves),
+    ...pairs(fastMoves, eliteCharged),
+    ...pairs(eliteFast, [...chargedMoves, ...eliteCharged]),
+  ];
+}
+
+const movesetName = (moveset: { fast: Move; charged: Move }): string =>
+  `${moveset.fast.name} / ${moveset.charged.name}`;
+
+/** The boss moveset asked for: a choice of the list (`FAST/CHARGED`), or the moves typed. */
+function chosenMoveset(
+  catalogue: PokemonCatalogue,
+  entry: PokemonEntry,
+  value: string | null,
+): { fast: Move; charged: Move } | undefined {
+  const text = value?.trim() ?? '';
+  if (text === '' || text === AVERAGE_MOVESET) return undefined;
+  // A value of the list: one of this boss's movesets, never another Pokémon's.
+  const listed = bossMovesets(catalogue, entry).find(
+    (moveset) => `${moveset.fast.id}/${moveset.charged.id}` === text,
+  );
+  if (listed) return listed;
+  const typed = parseMoveset(catalogue, entry, text);
+  if (typed.fast && typed.charged && typed.unknown.length === 0) {
+    return { fast: typed.fast, charged: typed.charged };
+  }
+  throw new UserError(
+    `"${plain(truncate(text, 80))}" is not a moveset of ${plain(entry.name)}: name a fast and a ` +
+      'charged move it has, or pick one from the list.',
+  );
+}
+
+/** Where the attackers come from: a level, or the member's Pokébox. */
+async function attackersOf(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+): Promise<{ attackers: CounterAttackers; assumed: boolean }> {
+  const level = interaction.options.getString('level');
+  if (level === null) {
+    return { attackers: { kind: 'level', level: DEFAULT_ATTACKER_LEVEL }, assumed: true };
+  }
+  if (level === POKEBOX) {
+    const userId = (await ctx.users.get(interaction.user.id)).pokebattlerId;
+    if (userId === null) {
+      throw new UserError(
+        'You have no Pokebattler user id saved. Save it with `/settings pokebattler-id`, or ' +
+          'pick a level.',
+      );
+    }
+    return { attackers: { kind: 'box', userId }, assumed: false };
+  }
+  if (!isAttackerLevel(level)) throw new UserError('Pick the level from its list.');
+  return { attackers: { kind: 'level', level }, assumed: false };
+}
+
+async function readPlan(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+): Promise<CounterPlan> {
+  const { entry, tier, fromPost } = bossAndTier(interaction, ctx);
+  const raidLevel = pokebattlerRaidLevel(tier);
+  if (raidLevel === undefined) {
+    throw new UserError(`Pokebattler simulates no ${raidTierLabel(tier)} raids.`);
+  }
+  const bosses = pokebattlerBossIds(entry, tier.shadow);
+  if (bosses.length === 0) {
+    throw new UserError(
+      `${plain(entry.name)} is never the boss of a shadow raid.` +
+        (fromPost
+          ? ` I took the tier of this post (${raidTierLabel(tier)}): name another with \`tier\`.`
+          : ''),
+    );
+  }
+  const moveset = chosenMoveset(
+    ctx.gameData.catalogue,
+    entry,
+    interaction.options.getString('moveset'),
+  );
+  const weather = interaction.options.getString('weather') ?? DEFAULT_WEATHER;
+  const friendship = interaction.options.getString('friendship') ?? DEFAULT_FRIENDSHIP;
+  if (!isCounterWeather(weather) || !isFriendship(friendship)) {
+    throw new UserError('Pick the weather and the friendship from their lists.');
+  }
+  const { attackers, assumed } = await attackersOf(interaction, ctx);
+  return {
+    entry,
+    tier,
+    raidLevel,
+    bosses,
+    attackers,
+    weather,
+    friendship,
+    assumed: {
+      level: assumed,
+      weather: interaction.options.getString('weather') === null,
+      friendship: interaction.options.getString('friendship') === null,
+    },
+    moveset,
+    // A Pokébox is the member's own Pokémon: its shadows and megas are shown unless left out.
+    shadow: interaction.options.getBoolean('shadow') ?? attackers.kind === 'box',
+    mega: interaction.options.getBoolean('mega') ?? attackers.kind === 'box',
+    single: interaction.options.getBoolean('single') ?? false,
+  };
+}
+
+/**
+ * What can be known before Pokebattler is asked is refused here, before the answer is deferred
+ * and before the use counts against the three of a minute.
+ */
+const requireCounterPlan: Guard = async (interaction, ctx) => {
+  if (interaction.isChatInputCommand()) await readPlan(interaction, ctx);
+};
+
+/** What the member is told when Pokebattler gave nothing. */
+function failureText(outcome: Extract<CounterOutcome, { ok: false }>, plan: CounterPlan): string {
+  switch (outcome.reason) {
+    case 'unknown':
+      return plan.attackers.kind === 'box'
+        ? `Pokebattler knows no Pokébox of user ${String(plan.attackers.userId)}, or does not ` +
+            `know ${plain(plan.entry.name)} as a boss of ${raidTierLabel(plan.tier)} raids.`
+        : `Pokebattler does not know ${plain(plan.entry.name)} as a boss of ` +
+            `${raidTierLabel(plan.tier)} raids.`;
+    case 'empty':
+      return plan.attackers.kind === 'box'
+        ? `Pokebattler found no Pokémon in the Pokébox of user ${String(plan.attackers.userId)} ` +
+            'that can fight this boss: check that your Pokébox on Pokebattler is filled in.'
+        : `Pokebattler lists no counters against ${plain(plan.entry.name)} in ` +
+            `${raidTierLabel(plan.tier)} raids.`;
+    case 'refused':
+    case 'timeout':
+    case 'unreachable':
+      return 'Pokebattler did not answer just now. Please try again later.';
+    case 'too-large':
+    case 'unreadable':
+      return 'The answer of Pokebattler could not be read. Please try again later.';
+  }
+}
+
+/** The counters against the boss moveset asked for, or a sentence when the answer has none. */
+function countersFor(
+  outcome: Extract<CounterOutcome, { ok: true }>,
+  plan: CounterPlan,
+  catalogue: PokemonCatalogue,
+): BossMovesetCounters {
+  const { moveset, entry } = plan;
+  if (!moveset) {
+    if (outcome.answer.average) return outcome.answer.average;
+    throw new UserError(
+      'Pokebattler gave no average of all movesets this time: pick a moveset with `moveset`.',
+    );
+  }
+  const found = outcome.answer.byMoveset.find(
+    (set) => set.fast === moveset.fast.id && set.charged === moveset.charged.id,
+  );
+  if (found) return found;
+  const simulated = outcome.answer.byMoveset.map(
+    (set) =>
+      `${catalogue.move(set.fast ?? '')?.name ?? titleCase(set.fast ?? '')} / ` +
+      `${catalogue.move(set.charged ?? '')?.name ?? titleCase(set.charged ?? '')}`,
+  );
+  throw new UserError(
+    `Pokebattler has no results for ${plain(entry.name)} with ${plain(movesetName(moveset))}.` +
+      (simulated.length === 0 ? '' : ` It simulates ${plain(simulated.join(', '))}.`),
+  );
+}
+
+const names = new WeakMap<PokemonCatalogue, (pokemonId: string) => string>();
+function namesOf(catalogue: PokemonCatalogue): (pokemonId: string) => string {
+  let found = names.get(catalogue);
+  if (!found) {
+    found = pokebattlerNames(catalogue.all);
+    names.set(catalogue, found);
+  }
+  return found;
+}
+
+/** The boss's movesets for the `moveset` option: the average first, then what fits the text. */
+function movesetChoices(ctx: AppContext, entry: PokemonEntry | undefined, typed: string): Choice[] {
+  const words = typed
+    .toLowerCase()
+    .split(/[\s/]+/)
+    .filter((word) => word !== '');
+  const fits = (name: string): boolean => words.every((word) => name.toLowerCase().includes(word));
+  const average: Choice = { name: 'Average of all movesets', value: AVERAGE_MOVESET };
+  const own = entry
+    ? bossMovesets(ctx.gameData.catalogue, entry).map((moveset) => ({
+        name: truncate(movesetName(moveset), CHOICE_NAME),
+        value: `${moveset.fast.id}/${moveset.charged.id}`,
+      }))
+    : [];
+  return [average, ...own].filter((choice) => fits(choice.name)).slice(0, MAX_CHOICES);
+}
+
+/** The boss the `moveset` list is for, while the member types: the option, or the post's. */
+function bossWhileTyping(
+  interaction: AutocompleteInteraction,
+  ctx: AppContext,
+): PokemonEntry | undefined {
+  const typed = interaction.options.getString('boss')?.trim() ?? '';
+  if (typed !== '') {
+    return ctx.gameData.catalogue.byKey(typed) ?? ctx.pokemon.exact(typed);
+  }
+  const party = bossParty(interaction, ctx);
+  const ref = party && bossOf(party);
+  return ref && 'key' in ref ? ctx.gameData.catalogue.byKey(ref.key) : undefined;
+}
+
+/**
+ * `/counters` (spec row 199, the legacy `!counters`): the best counters against a raid boss, as
+ * Pokebattler simulates the raid, with the trainers each takes. In the post of a raid the boss
+ * and tier are the raid's and the answer is public (the group sees it); elsewhere the boss is
+ * named and the tier is the one it is a boss of now, and the answer is the member's alone, as
+ * is every answer for a Pokébox. In servers and in a DM with the bot.
+ */
+export const counters: SimpleCommand = {
+  data: new SlashCommandBuilder()
+    .setName('counters')
+    .setDescription('The best counters against a raid boss, from Pokebattler')
+    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
+    .addStringOption((option) =>
+      option
+        .setName('boss')
+        .setDescription('The boss; in the post of a raid, that raid’s when left out')
+        .setMaxLength(100)
+        .setAutocomplete(true),
+    )
+    .addStringOption((option) =>
+      option
+        .setName('tier')
+        .setDescription(
+          'The tier; when left out, that of the raid whose post this is, else the boss’s now',
+        )
+        .addChoices(
+          TIER_CHOICES.map((tier) => ({ name: raidTierLabel(tier), value: tierValue(tier) })),
+        ),
+    )
+    .addStringOption((option) =>
+      option
+        .setName('level')
+        .setDescription('The level of the counters, or your Pokébox; level 40 when left out')
+        .addChoices(
+          ...ATTACKER_LEVELS.map((level) => ({ name: ATTACKER_LEVEL_NAMES[level], value: level })),
+          { name: 'My Pokébox on Pokebattler', value: POKEBOX },
+        ),
+    )
+    .addStringOption((option) =>
+      option
+        .setName('weather')
+        .setDescription('The weather; none when left out')
+        .addChoices(WEATHERS.map((weather) => ({ name: WEATHER_NAMES[weather], value: weather }))),
+    )
+    .addStringOption((option) =>
+      option
+        .setName('friendship')
+        .setDescription('Friendship with the others in the raid; best friends when left out')
+        .addChoices(
+          FRIENDSHIPS.map((friendship) => ({
+            name: FRIENDSHIP_NAMES[friendship],
+            value: friendship,
+          })),
+        ),
+    )
+    .addStringOption((option) =>
+      option
+        .setName('moveset')
+        .setDescription('The boss’s moves; the average of all its movesets when left out')
+        .setMaxLength(100)
+        .setAutocomplete(true),
+    )
+    .addBooleanOption((option) =>
+      option
+        .setName('shadow')
+        .setDescription('List shadow Pokémon as counters (a Pokébox lists them unless False)'),
+    )
+    .addBooleanOption((option) =>
+      option
+        .setName('mega')
+        .setDescription('List megas as counters (a Pokébox lists them unless False)'),
+    )
+    .addBooleanOption((option) =>
+      option
+        .setName('single')
+        .setDescription('Every moveset of a counter a line of its own, not only its best'),
+    ),
+  help: {
+    category: 'util',
+    details:
+      'The twelve best counters against a raid boss, as Pokebattler simulates the raid: the ' +
+      'time to win, how often a counter faints, and how many trainers it takes, with a link ' +
+      'to the full results. In the post of a raid the boss and tier are that raid’s and ' +
+      'everybody there sees the answer; elsewhere name the boss, and only you see it. A boss ' +
+      'you name in the post of a raid is simulated in that raid’s tier unless you name ' +
+      'another with `tier`. Without more it assumes counters at level 40, no weather and best ' +
+      'friends, and leaves out shadow Pokémon and megas. `level` can also be your own Pokébox ' +
+      'on Pokebattler (save your user id with `/settings pokebattler-id`); that answer is ' +
+      'always for you alone. A Pokébox lists its shadow Pokémon and megas too, unless ' +
+      '`shadow` or `mega` is False.',
+    examples: [
+      '/counters',
+      '/counters boss:Mewtwo',
+      '/counters boss:Rayquaza tier:T5 level:Level 50 weather:Windy',
+      '/counters level:My Pokébox on Pokebattler',
+    ],
+  },
+  guards: [requireCounterPlan],
+  defer: (interaction, ctx) =>
+    interaction.options.getString('level') !== POKEBOX && bossParty(interaction, ctx)
+      ? 'public'
+      : 'ephemeral',
+  throttle: COUNTERS_THROTTLE,
+  async execute(interaction, ctx) {
+    const plan = await readPlan(interaction, ctx);
+    const catalogue = ctx.gameData.catalogue;
+    const outcome = await ctx.pokebattler.counters({
+      bosses: plan.bosses,
+      raidLevel: plan.raidLevel,
+      attackers: plan.attackers,
+      weather: plan.weather,
+      friendship: plan.friendship,
+    });
+    if (!outcome.ok) throw new UserError(failureText(outcome, plan));
+    const set = countersFor(outcome, plan, catalogue);
+    const feedImage = ctx.raidBosses
+      .bosses()
+      .find((boss) => boss.entry?.key === plan.entry.key)?.image;
+    const embed = renderCounters({
+      bossName: plan.entry.name,
+      tierLabel: raidTierLabel(plan.tier),
+      link: `${POKEBATTLER_SITE}${counterPath(outcome.query)}`,
+      picture: pokemonPicture(feedImage, plan.entry, ctx.gameData),
+      attackers: plan.attackers,
+      weather: plan.weather,
+      friendship: plan.friendship,
+      assumed: plan.assumed,
+      bossMoves: plan.moveset ? movesetName(plan.moveset) : undefined,
+      rows: counterRows(set, plan),
+      pokemonName: namesOf(catalogue),
+      moveName: (id) => catalogue.move(id)?.name ?? titleCase(id),
+      shadow: plan.shadow,
+      mega: plan.mega,
+    });
+    await interaction.editReply({ embeds: [embed] });
+  },
+  async autocomplete(interaction, ctx) {
+    const focused = interaction.options.getFocused(true);
+    const typed = String(focused.value);
+    await interaction.respond(
+      focused.name === 'boss'
+        ? pokemonChoices(ctx, typed)
+        : focused.name === 'moveset'
+          ? movesetChoices(ctx, bossWhileTyping(interaction, ctx), typed)
+          : [],
+    );
+  },
+};
diff --git a/src/domain/counters/counters.test.ts b/src/domain/counters/counters.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ac93b4f9b64bd8a8d8fa34419fa8fad61f826987
--- /dev/null
+++ b/src/domain/counters/counters.test.ts
@@ -0,0 +1,81 @@
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import { mewtwoAnswer } from '../../../test/support/pokebattler.js';
+import {
+  counterRows,
+  isMegaCounter,
+  isShadowCounter,
+  pokebattlerNames,
+  titleCase,
+  type CounterRow,
+} from './counters.js';
+import type { BossMovesetCounters } from './pokebattler-answer.js';
+
+const answer = mewtwoAnswer();
+const average = answer.average as BossMovesetCounters;
+const lines = (rows: CounterRow[]) =>
+  rows.map((row) => `${row.counter.pokemonId} ${row.result.charged}`);
+
+describe('counterRows', () => {
+  it('lists the best moveset of each counter, fastest first, without shadows and megas', () => {
+    expect(lines(counterRows(average, { shadow: false, mega: false, single: false }))).toEqual([
+      'TYRANITAR BRUTAL_SWING',
+      'DARKRAI SHADOW_BALL',
+    ]);
+  });
+
+  it('lists every moveset with single, and shadows and megas when asked', () => {
+    expect(lines(counterRows(average, { shadow: true, mega: true, single: true }))).toEqual([
+      'TYRANITAR_SHADOW_FORM BRUTAL_SWING',
+      'GENGAR_MEGA SHADOW_BALL',
+      'TYRANITAR BRUTAL_SWING',
+      'DARKRAI SHADOW_BALL',
+      'TYRANITAR CRUNCH',
+    ]);
+    expect(
+      lines(counterRows(average, { shadow: true, mega: false, single: false, limit: 2 })),
+    ).toEqual(['TYRANITAR_SHADOW_FORM BRUTAL_SWING', 'TYRANITAR BRUTAL_SWING']);
+  });
+
+  it('keeps two Pokémon of one species in a Pokébox apart', () => {
+    const box: BossMovesetCounters = {
+      fast: null,
+      charged: null,
+      counters: [
+        { ...average.counters[2]!, cp: 3500, nickname: 'Rocky' },
+        { ...average.counters[2]!, cp: 2900, nickname: null },
+      ],
+    };
+    expect(counterRows(box, { shadow: false, mega: false, single: false })).toHaveLength(2);
+  });
+});
+
+describe('the kinds of counters', () => {
+  it('tells shadows and megas by Pokebattler name', () => {
+    expect(isShadowCounter('MACHAMP_SHADOW_FORM')).toBe(true);
+    expect(isShadowCounter('MACHAMP')).toBe(false);
+    expect(isMegaCounter('RAYQUAZA_MEGA')).toBe(true);
+    expect(isMegaCounter('CHARIZARD_MEGA_Y')).toBe(true);
+    expect(isMegaCounter('KYOGRE_PRIMAL')).toBe(true);
+    expect(isMegaCounter('MEGANIUM')).toBe(false);
+  });
+});
+
+describe('pokebattlerNames', () => {
+  const name = pokebattlerNames(catalogueFixture().all);
+
+  it('names a Pokémon by the catalogue, a shadow as such', () => {
+    expect(name('TYRANITAR')).toBe('Tyranitar');
+    expect(name('RAYQUAZA_MEGA')).toBe('Mega Rayquaza');
+    expect(name('RATTATA_ALOLA_FORM')).toBe('Alolan Rattata');
+    expect(name('MACHAMP_SHADOW_FORM')).toBe('Shadow Machamp');
+    expect(name('RATTATA_ALOLA_SHADOW_FORM')).toBe('Shadow Alolan Rattata');
+    expect(name('GIRATINA_ORIGIN_FORM')).toBe('Giratina (Origin Forme)');
+  });
+
+  it('names what the catalogue does not know by Pokebattler name in words', () => {
+    expect(name('NEWMON_SPECIAL')).toBe('Newmon Special');
+    expect(titleCase('DYNAMIC_PUNCH')).toBe('Dynamic Punch');
+    expect(titleCase('COUNTER_FAST')).toBe('Counter');
+  });
+});
diff --git a/src/domain/counters/counters.ts b/src/domain/counters/counters.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d3e83a07925a7f0104c1ea9e800995790069860b
--- /dev/null
+++ b/src/domain/counters/counters.ts
@@ -0,0 +1,85 @@
+import type { PokemonEntry } from '../pogo/game-master.js';
+import type { BossMovesetCounters, Counter, CounterResult } from './pokebattler-answer.js';
+
+/** How many counters the answer lists (the legacy bot's twelve). */
+export const SHOWN_COUNTERS = 12;
+
+/** One line of the answer: a counter with one of its movesets. */
+export interface CounterRow {
+  counter: Counter;
+  result: CounterResult;
+}
+
+/** A shadow Pokémon, as Pokebattler names it. */
+export const isShadowCounter = (pokemonId: string): boolean => pokemonId.endsWith('_SHADOW_FORM');
+
+/** A mega or primal Pokémon, as Pokebattler names it. */
+export const isMegaCounter = (pokemonId: string): boolean =>
+  /_MEGA(?:_[XY])?$/.test(pokemonId) || pokemonId.endsWith('_PRIMAL');
+
+export interface RowOptions {
+  /** Shadow counters too (left out by default, as the legacy bot did). */
+  shadow: boolean;
+  /** Megas and primals too (left out by default). */
+  mega: boolean;
+  /** Every moveset a line of its own; by default a counter's best moveset only. */
+  single: boolean;
+  limit?: number;
+}
+
+/** Fastest first; of two as fast, the one that faints less. */
+function faster(a: CounterRow, b: CounterRow): number {
+  return a.result.timeMs - b.result.timeMs || a.result.deaths - b.result.deaths;
+}
+
+/**
+ * The lines of the answer: the counters' movesets, fastest first; by default the best
+ * moveset of each counter only (a counter of a Pokébox is one Pokémon of it, so two of one
+ * species are two counters), and every moveset a line of its own with `single`. Shadow
+ * Pokémon and megas only when asked for.
+ */
+export function counterRows(set: BossMovesetCounters, options: RowOptions): CounterRow[] {
+  const rows: CounterRow[] = [];
+  for (const counter of set.counters) {
+    if (!options.shadow && isShadowCounter(counter.pokemonId)) continue;
+    if (!options.mega && isMegaCounter(counter.pokemonId)) continue;
+    const own = counter.results.map((result) => ({ counter, result })).sort(faster);
+    rows.push(...(options.single ? own : own.slice(0, 1)));
+  }
+  return rows.sort(faster).slice(0, options.limit ?? SHOWN_COUNTERS);
+}
+
+/** `CONFUSION_FAST` as `Confusion`, for a move or Pokémon the catalogue does not know. */
+export function titleCase(id: string): string {
+  return id
+    .replace(/_FAST$/, '')
+    .split(/[_\s]+/)
+    .filter((word) => word !== '')
+    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
+    .join(' ');
+}
+
+/**
+ * The names of Pokémon by what Pokebattler calls them: the catalogue's entry of that
+ * `pokebattlerId` (a species before its forms, where two share one), a shadow Pokémon as
+ * "Shadow" and the name of what it is a shadow of, anything else by Pokebattler's name in
+ * words.
+ */
+export function pokebattlerNames(entries: readonly PokemonEntry[]): (pokemonId: string) => string {
+  const byId = new Map<string, PokemonEntry>();
+  for (const entry of entries) {
+    const known = byId.get(entry.pokebattlerId);
+    if (!known || (known.kind !== 'species' && entry.kind === 'species')) {
+      byId.set(entry.pokebattlerId, entry);
+    }
+  }
+  const nameOf = (id: string): string | undefined =>
+    byId.get(id)?.name ?? byId.get(`${id}_FORM`)?.name;
+  return (pokemonId) => {
+    if (isShadowCounter(pokemonId)) {
+      const base = pokemonId.slice(0, -'_SHADOW_FORM'.length);
+      return `Shadow ${nameOf(base) ?? titleCase(base)}`;
+    }
+    return nameOf(pokemonId) ?? titleCase(pokemonId);
+  };
+}
diff --git a/src/render/counters.test.ts b/src/render/counters.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..64f90c9d41083f2556c10fc8509871011c3eb981
--- /dev/null
+++ b/src/render/counters.test.ts
@@ -0,0 +1,74 @@
+import { describe, expect, it } from 'vitest';
+import { titleCase } from '../domain/counters/counters.js';
+import type { Counter } from '../domain/counters/pokebattler-answer.js';
+import { renderCounters, type CountersView } from './counters.js';
+
+const tyranitar = (nickname: string | null, cp: number, estimator: number | null): Counter => ({
+  pokemonId: 'TYRANITAR',
+  cp,
+  nickname,
+  results: [
+    {
+      fast: 'BITE_FAST',
+      charged: 'BRUTAL_SWING',
+      third: 'CRUNCH',
+      legacy: false,
+      timeMs: 150_400,
+      deaths: 3.04,
+      estimator,
+    },
+  ],
+});
+
+function view(overrides: Partial<CountersView> = {}): CountersView {
+  return {
+    bossName: 'Mewtwo',
+    tierLabel: 'T5',
+    link: 'https://www.pokebattler.com/raids/x',
+    picture: undefined,
+    attackers: { kind: 'box', userId: 77 },
+    weather: 'FOG',
+    friendship: '0',
+    assumed: { level: false, weather: false, friendship: false },
+    bossMoves: undefined,
+    rows: [],
+    pokemonName: titleCase,
+    moveName: titleCase,
+    shadow: true,
+    mega: true,
+    ...overrides,
+  };
+}
+
+describe('renderCounters', () => {
+  it('names a Pokémon of a Pokébox with its nickname and CP, plainly', () => {
+    const counter = tyranitar('*Rocky* https://x.test', 3512, 1.01);
+    const embed = renderCounters(view({ rows: [{ counter, result: counter.results[0]! }] }));
+    expect(embed.description).toBe(
+      [
+        'About **2 trainers** with the best counters.',
+        'The Pokébox of Pokebattler user 77 · Fog · Not friends',
+        'Boss moves: the average of all its movesets',
+        '__Time to win | Deaths | Trainers__',
+        '`#01` **Tyranitar** "\\*Rocky\\* https:\u200b//x.test" 3512 CP: 150s | 3.0 | 1.1\n' +
+          '*Bite / Brutal Swing / Crunch*',
+      ].join('\n'),
+    );
+    expect(embed.footer?.text).toBe('Click the title for the full results');
+    expect(embed.thumbnail).toBeUndefined();
+  });
+
+  it('leaves out the trainers when Pokebattler gave no estimate, and says when nothing fits', () => {
+    const counter = tyranitar(null, 3000, null);
+    const one = renderCounters(
+      view({
+        attackers: { kind: 'level', level: '40' },
+        rows: [{ counter, result: counter.results[0]! }],
+      }),
+    );
+    expect(one.description).not.toContain('About');
+    expect(one.description).toContain('`#01` **Tyranitar**: 150s | 3.0 | ?');
+    const none = renderCounters(view());
+    expect(none.description).toContain('Pokebattler lists no counter that fits.');
+  });
+});
diff --git a/src/render/counters.ts b/src/render/counters.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c5decc1bc4b372b28fb348bb2826086a0650bbd8
--- /dev/null
+++ b/src/render/counters.ts
@@ -0,0 +1,121 @@
+import type { APIEmbed } from 'discord.js';
+import type { CounterRow } from '../domain/counters/counters.js';
+import {
+  ATTACKER_LEVEL_NAMES,
+  FRIENDSHIP_NAMES,
+  WEATHER_NAMES,
+  type CounterAttackers,
+  type CounterWeather,
+  type Friendship,
+} from '../domain/counters/options.js';
+import { count, fitItems, LIMITS, plain, plainNoLinks, truncate } from './text.js';
+
+/** Pokebattler's green, as the legacy answer had it. */
+export const COUNTERS_COLOUR = 0x43b581;
+
+/** What the member left out and was assumed: the answer says so. */
+export interface Assumed {
+  level: boolean;
+  weather: boolean;
+  friendship: boolean;
+}
+
+/** What `/counters` shows. */
+export interface CountersView {
+  bossName: string;
+  /** `T5`, `Shadow T5`. */
+  tierLabel: string;
+  /** The page with the full results on pokebattler.com. */
+  link: string;
+  picture: string | undefined;
+  attackers: CounterAttackers;
+  weather: CounterWeather;
+  friendship: Friendship;
+  assumed: Assumed;
+  /** The boss's moves, `Confusion / Psystrike`; undefined for the average of all movesets. */
+  bossMoves: string | undefined;
+  rows: readonly CounterRow[];
+  /** The name of a Pokémon by what Pokebattler calls it. */
+  pokemonName: (pokemonId: string) => string;
+  moveName: (moveId: string) => string;
+  /** Whether shadow Pokémon and megas were asked for. */
+  shadow: boolean;
+  mega: boolean;
+}
+
+/** `#01`. */
+const place = (index: number): string => `\`#${String(index + 1).padStart(2, '0')}\``;
+
+/** The trainers a counter takes, up to a tenth, as the legacy bot showed it. */
+const trainers = (estimator: number | null): string =>
+  estimator === null ? '?' : (Math.ceil(estimator * 10) / 10).toFixed(1);
+
+function rowText(row: CounterRow, index: number, view: CountersView): string {
+  const { counter, result } = row;
+  const nickname =
+    counter.nickname === null ? '' : ` "${plainNoLinks(truncate(counter.nickname, 30))}"`;
+  const cp =
+    view.attackers.kind === 'box' && counter.cp !== null ? ` ${String(counter.cp)} CP` : '';
+  const moves = [result.fast, result.charged, ...(result.third === null ? [] : [result.third])]
+    .map(view.moveName)
+    .join(' / ');
+  return (
+    `${place(index)} **${plain(view.pokemonName(counter.pokemonId))}**${nickname}${cp}: ` +
+    `${String(Math.round(result.timeMs / 1000))}s | ${result.deaths.toFixed(1)} | ` +
+    `${trainers(result.estimator)}\n*${plain(moves)}${result.legacy ? ' †' : ''}*`
+  );
+}
+
+/** What the simulation was for, with what was assumed marked. */
+function settingLine(view: CountersView): string {
+  const mark = (text: string, assumed: boolean): string => (assumed ? `${text} (assumed)` : text);
+  const attackers =
+    view.attackers.kind === 'box'
+      ? `The Pokébox of Pokebattler user ${String(view.attackers.userId)}`
+      : mark(`Attackers at ${ATTACKER_LEVEL_NAMES[view.attackers.level]}`, view.assumed.level);
+  return [
+    attackers,
+    mark(WEATHER_NAMES[view.weather], view.assumed.weather),
+    mark(FRIENDSHIP_NAMES[view.friendship], view.assumed.friendship),
+  ].join(' · ');
+}
+
+/**
+ * The answer of `/counters`: the legacy embed made tidy. The best counters (twelve), each with
+ * the time to win, how often it faints and how many trainers it takes (Pokebattler's
+ * estimator), one line above them with the trainers the best counter takes, and a link to the
+ * full results on pokebattler.com.
+ */
+export function renderCounters(view: CountersView): APIEmbed {
+  const best = view.rows[0]?.result.estimator ?? null;
+  const head = [
+    best === null
+      ? undefined
+      : `About **${count(Math.max(1, Math.ceil(best)), 'trainer')}** with the best counters.`,
+    settingLine(view),
+    view.bossMoves === undefined
+      ? 'Boss moves: the average of all its movesets'
+      : `Boss moves: ${plain(view.bossMoves)}`,
+  ].filter((line): line is string => line !== undefined);
+  const rows =
+    view.rows.length === 0
+      ? ['Pokebattler lists no counter that fits.']
+      : [
+          '__Time to win | Deaths | Trainers__',
+          ...view.rows.map((row, i) => rowText(row, i, view)),
+        ];
+  const notes = [
+    ...(view.rows.some((row) => row.result.legacy) ? ['† a legacy move'] : []),
+    ...(view.shadow ? [] : ['no shadow Pokémon (shadow:True lists them)']),
+    ...(view.mega ? [] : ['no megas (mega:True lists them)']),
+  ];
+  return {
+    author: { name: 'Data provided by Pokebattler', url: 'https://www.pokebattler.com' },
+    title: truncate(`Counters for ${view.bossName} (${view.tierLabel})`, LIMITS.embedTitle),
+    url: view.link,
+    color: COUNTERS_COLOUR,
+    description: fitItems([head.join('\n'), ...rows], LIMITS.embedDescription, '\n'),
+    ...(view.picture === undefined ? {} : { thumbnail: { url: view.picture } }),
+    footer: { text: ['Click the title for the full results', ...notes].join(' · ') },
+  };
+}
diff --git a/test/support/pokebattler.ts b/test/support/pokebattler.ts
index e98337c58430279be8dd3950d40aed5077c7b5e8..8bfecad1d970bb6ebb6fb3652811b00e338e92b8 100644
--- a/test/support/pokebattler.ts
+++ b/test/support/pokebattler.ts
@@ -113,7 +113,7 @@ export function mewtwoAnswer(): CounterAnswer {
   ];
   const answer = readCounterAnswer(
     pokebattlerAnswer({
-      byMove: [{ move1: 'CONFUSION_FAST', move2: 'PSYSTRIKE', defenders: counters.slice(2) }],
+      byMove: [{ move1: 'CONFUSION_FAST', move2: 'PSYSTRIKE', defenders: counters.slice(2, 3) }],
       average: counters,
     }),
   );
@@ -136,8 +136,9 @@ export class FakePokebattler implements PokebattlerGateway {
 
   counters(request: CounterRequest): Promise<CounterOutcome> {
     let outcome: CounterOutcome = { ok: false, reason: 'unknown' };
-    for (const boss of request.bosses) {
-      const query: CounterQuery = { ...request, boss };
+    const { bosses, ...rest } = request;
+    for (const boss of bosses) {
+      const query: CounterQuery = { ...rest, boss };
       this.asked.push(query);
       if (this.failing) {
         outcome = this.failing;
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index db917ded9418855e5b77f27d3b43b5dc2c2e14a1..28a72af5a48541ebda538bb6f01b1d62426e5c37 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -22,6 +22,7 @@ import { RecordingDms } from './dms.js';
 import { MemoryNewTrains } from './new-trains.js';
 import { noParties } from './parties.js';
 import { FakeIssues } from './issues.js';
+import { FakePokebattler } from './pokebattler.js';
 import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
 import { raidBossesFixture } from './raid-bosses.js';
 import { raidEventsFixture } from './raid-events.js';
@@ -126,6 +127,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     maps: mapsFixture(),
     // Every issue is recorded and opened; a test passes its own to read or fail them.
     issues: new FakeIssues(),
+    // Every simulation is asked of a fake that answers the sample for Mewtwo; a test passes its own.
+    pokebattler: new FakePokebattler(),
     features: { ocrPassive: false, autoAssignRole: false },
     ...overrides,
   };
````

---

### Task 3: Places by name from Nominatim, and which regions a place touches

Prototype commit: `0d55b49b188eedeb7840fca645493f625da4c036`

src/domain/geo/shape.ts: a place is a point, lines or areas (with holes).
shapeTouches says whether it has something in common with the outline of a
region: the region contains the point; a point of a line lies in the region
or the line crosses its outline; a corner of one lies in the other, or the
outlines cross (a hole is outline too). The crossings are found by a sweep
over the sides in the order of their longitude, only inside the box both
share, so outlines of thousands of corners compare in milliseconds (no new
package). largestShape chooses among what a search found as the legacy bot
did: an area before a line before a point, the largest of each.

src/domain/geo/nominatim.ts: the search query (within a box only, with
outlines drawn to about ten metres) and the answer read with zod, GeoJSON
longitude first, a place without an outline it reads as its point, at most
50,000 points in all.

NominatimSearch (src/services/place-search.ts) is the port, as Nominatim's
usage policy asks: one request a second for the whole bot (ten may wait;
the next is told the service is busy), the User-Agent of the settings,
answers kept a day; ten seconds and 5 MB; what members search for is never
logged. FakePlaces is its twin. settings.findRegion (the server, by default
OpenStreetMap's, and the User-Agent) is new and optional.


**Files:**

```
 src/config/settings.ts            |  11 +++++++
 src/domain/geo/nominatim.test.ts  | 121 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/geo/nominatim.ts       | 157 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/geo/outline.ts         |   6 ++--
 src/domain/geo/shape.test.ts      | 237 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/geo/shape.ts           | 247 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/place-search.test.ts | 215 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/place-search.ts      | 231 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/fixtures/settings.json       |   4 +++
 test/support/places.ts            |  33 +++++++++++++++++++++
 10 files changed, 1259 insertions(+), 3 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `Places by name from Nominatim, and which regions a place touches`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/src/config/settings.ts b/src/config/settings.ts
index 9686df11d53146fc8b8d87eab0b61a08cda00957..bc86e6e8de60e104f52e29b0d17f22dbcef2a458 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -112,6 +112,17 @@ export const settingsSchema = z.strictObject({
     (value) => (typeof value === 'string' ? value.trim() || undefined : value),
     z.url({ protocol: /^https?$/ }).optional(),
   ),
+  /**
+   * Where `/find-region` searches places by name: a Nominatim server (`url`, OpenStreetMap's own
+   * by default) and the User-Agent that names this installation to it, as its usage policy
+   * asks. Without it the command is not offered (plan 6B).
+   */
+  findRegion: z
+    .strictObject({
+      url: z.url({ protocol: /^https$/ }).default('https://nominatim.openstreetmap.org'),
+      userAgent: z.string().trim().min(3).max(200),
+    })
+    .optional(),
   timezone: z
     .string()
     .refine(isTimeZone, { message: 'must be an IANA time zone, e.g. America/New_York' }),
diff --git a/src/domain/geo/nominatim.test.ts b/src/domain/geo/nominatim.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cbc945002d1f3bfb9fbf375545273c86484d0fc5
--- /dev/null
+++ b/src/domain/geo/nominatim.test.ts
@@ -0,0 +1,121 @@
+import { describe, expect, it } from 'vitest';
+import {
+  MAX_PLACE_POINTS,
+  placeSearchQuery,
+  readNominatimPlaces,
+  shapeOfGeoJson,
+} from './nominatim.js';
+
+/** A place as Nominatim answers it with `format=jsonv2` and `polygon_geojson=1`. */
+function place(name: string, geojson?: unknown): unknown {
+  return {
+    place_id: 1,
+    osm_type: 'way',
+    osm_id: 2,
+    lat: '40.4406',
+    lon: '-79.9959',
+    category: 'leisure',
+    type: 'park',
+    display_name: name,
+    boundingbox: ['40.43', '40.45', '-80.0', '-79.99'],
+    ...(geojson === undefined ? {} : { geojson }),
+  };
+}
+
+const RING = [
+  [-80, 40],
+  [-79, 40],
+  [-79, 41],
+  [-80, 41],
+  [-80, 40],
+];
+
+describe('placeSearchQuery', () => {
+  it('searches within the box only, with outlines', () => {
+    const query = new URLSearchParams(
+      placeSearchQuery('Schenley Park', { south: 40, north: 41, west: -80.5, east: -79 }),
+    );
+    expect(Object.fromEntries(query)).toEqual({
+      q: 'Schenley Park',
+      format: 'jsonv2',
+      limit: '5',
+      bounded: '1',
+      viewbox: '-80.5,41,-79,40',
+      polygon_geojson: '1',
+      polygon_threshold: '0.0001',
+      'accept-language': 'en',
+    });
+  });
+});
+
+describe('shapeOfGeoJson', () => {
+  it('reads points, lines and areas, longitude first', () => {
+    expect(shapeOfGeoJson({ type: 'Point', coordinates: [-79.9, 40.4] })).toEqual({
+      kind: 'point',
+      point: { lat: 40.4, lon: -79.9 },
+    });
+    expect(
+      shapeOfGeoJson({
+        type: 'LineString',
+        coordinates: [
+          [-79.9, 40.4],
+          [-79.8, 40.5],
+        ],
+      }),
+    ).toEqual({
+      kind: 'line',
+      lines: [
+        [
+          { lat: 40.4, lon: -79.9 },
+          { lat: 40.5, lon: -79.8 },
+        ],
+      ],
+    });
+    const polygon = shapeOfGeoJson({ type: 'Polygon', coordinates: [RING, RING] });
+    expect(polygon?.kind).toBe('area');
+    expect(polygon?.kind === 'area' && polygon.areas[0]?.holes).toHaveLength(1);
+    const multi = shapeOfGeoJson({ type: 'MultiPolygon', coordinates: [[RING], [RING]] });
+    expect(multi?.kind === 'area' && multi.areas).toHaveLength(2);
+    const lines = shapeOfGeoJson({ type: 'MultiLineString', coordinates: [RING, RING] });
+    expect(lines?.kind === 'line' && lines.lines).toHaveLength(2);
+  });
+
+  it('closes a ring that is not closed, and leaves out what is no ring or line', () => {
+    const open = shapeOfGeoJson({ type: 'Polygon', coordinates: [RING.slice(0, 4)] });
+    expect(open?.kind === 'area' && open.areas[0]?.outer).toHaveLength(5);
+    expect(shapeOfGeoJson({ type: 'Polygon', coordinates: [RING.slice(0, 2)] })).toBeUndefined();
+    expect(shapeOfGeoJson({ type: 'LineString', coordinates: [[-79, 40]] })).toBeUndefined();
+  });
+
+  it('refuses what is not GeoJSON it reads, and coordinates off the earth', () => {
+    expect(shapeOfGeoJson(undefined)).toBeUndefined();
+    expect(shapeOfGeoJson({ type: 'GeometryCollection', geometries: [] })).toBeUndefined();
+    expect(shapeOfGeoJson({ type: 'Point', coordinates: [200, 40] })).toBeUndefined();
+    expect(shapeOfGeoJson({ type: 'Point', coordinates: ['a', 40] })).toBeUndefined();
+  });
+
+  it('reads no more points than the limit', () => {
+    const many = Array.from({ length: MAX_PLACE_POINTS + 1 }, (_unused, i) => [-79 + i / 1e6, 40]);
+    expect(shapeOfGeoJson({ type: 'LineString', coordinates: many })).toBeUndefined();
+  });
+});
+
+describe('readNominatimPlaces', () => {
+  it('reads the places in order, a place without an outline as its point', () => {
+    const places = readNominatimPlaces([
+      place('Schenley Park, Pittsburgh', { type: 'Polygon', coordinates: [RING] }),
+      place('Schenley Drive'),
+      { display_name: 'no point' },
+    ]);
+    expect(places?.map((one) => [one.name, one.shape.kind])).toEqual([
+      ['Schenley Park, Pittsburgh', 'area'],
+      ['Schenley Drive', 'point'],
+    ]);
+    expect(places?.[1]?.shape).toEqual({ kind: 'point', point: { lat: 40.4406, lon: -79.9959 } });
+  });
+
+  it('is an empty list for nothing found, and nothing for an answer that is no list', () => {
+    expect(readNominatimPlaces([])).toEqual([]);
+    expect(readNominatimPlaces({ error: 'Bad request' })).toBeUndefined();
+  });
+});
diff --git a/src/domain/geo/nominatim.ts b/src/domain/geo/nominatim.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ed59befec13d8a5b74012c1387bdc0dc4b89de94
--- /dev/null
+++ b/src/domain/geo/nominatim.ts
@@ -0,0 +1,157 @@
+import { z } from 'zod';
+import type { LatLon } from './lat-lon.js';
+import type { Box } from './region-membership.js';
+import type { Area, Shape } from './shape.js';
+
+/**
+ * Searching places by name in OpenStreetMap's Nominatim (`/search`), for `/find-region`: the
+ * request and what is used of the answer. With `polygon_geojson=1` each place carries its
+ * outline as GeoJSON (longitude first); without it, or with an outline Pine does not read, the
+ * place is its point.
+ */
+
+/** How many places a search answers at most (the legacy bot's five). */
+export const PLACES_PER_SEARCH = 5;
+
+/**
+ * How finely Nominatim draws an outline, in degrees (about ten metres): outlines of towns
+ * otherwise have tens of thousands of corners, far more than telling regions apart needs.
+ */
+const OUTLINE_TOLERANCE = 0.0001;
+
+/** No place is read with more corners than this in all: an answer that has more is cut short. */
+export const MAX_PLACE_POINTS = 50_000;
+
+/**
+ * The query of a search for `text` among the places in `box` only (`bounded=1`; Nominatim's
+ * `viewbox` is west, north, east, south), with outlines, in English.
+ */
+export function placeSearchQuery(text: string, box: Box): string {
+  return new URLSearchParams({
+    q: text,
+    format: 'jsonv2',
+    limit: String(PLACES_PER_SEARCH),
+    bounded: '1',
+    viewbox: [box.west, box.north, box.east, box.south].map(String).join(','),
+    polygon_geojson: '1',
+    polygon_threshold: String(OUTLINE_TOLERANCE),
+    'accept-language': 'en',
+  }).toString();
+}
+
+/** A place a search found. */
+export interface Place {
+  /** What OpenStreetMap calls it in full ("Schenley Park, Pittsburgh, …"). */
+  name: string;
+  shape: Shape;
+}
+
+const coordinate = z
+  .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
+  .rest(z.unknown());
+const path = z.array(coordinate);
+
+const geometry = z.discriminatedUnion('type', [
+  z.object({ type: z.literal('Point'), coordinates: coordinate }),
+  z.object({ type: z.literal('LineString'), coordinates: path }),
+  z.object({ type: z.literal('MultiLineString'), coordinates: z.array(path) }),
+  z.object({ type: z.literal('Polygon'), coordinates: z.array(path) }),
+  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(path)) }),
+]);
+
+const degrees = (low: number, high: number) =>
+  z.coerce.number().refine((value) => Number.isFinite(value) && value >= low && value <= high);
+
+const placeSchema = z.object({
+  display_name: z.string().min(1),
+  lat: degrees(-90, 90),
+  lon: degrees(-180, 180),
+  geojson: z.unknown().optional(),
+});
+
+/** Counts the points read, to stop at `MAX_PLACE_POINTS`. */
+class Budget {
+  left = MAX_PLACE_POINTS;
+  take(points: readonly z.infer<typeof coordinate>[]): LatLon[] | undefined {
+    if (points.length > this.left) return undefined;
+    this.left -= points.length;
+    return points.map(([lon, lat]) => ({ lat, lon }));
+  }
+}
+
+/**
+ * The points as a closed ring (the first point added at the end when it is not there), or
+ * undefined for fewer than four points: a closed triangle has four, so an open triangle (three
+ * points) is refused too, as GeoJSON never sends one.
+ */
+function ringOf(points: LatLon[] | undefined): LatLon[] | undefined {
+  if (!points || points.length < 4) return undefined;
+  const first = points[0] as LatLon;
+  const last = points[points.length - 1] as LatLon;
+  return first.lat === last.lat && first.lon === last.lon ? points : [...points, { ...first }];
+}
+
+function areaOf(rings: readonly z.infer<typeof path>[], budget: Budget): Area | undefined {
+  const [outerPoints, ...holePoints] = rings;
+  const outer = ringOf(outerPoints && budget.take(outerPoints));
+  if (!outer) return undefined;
+  const holes = holePoints
+    .map((hole) => ringOf(budget.take(hole)))
+    .filter((hole): hole is LatLon[] => hole !== undefined);
+  return { outer, holes };
+}
+
+/** The shape of a place's GeoJSON outline; undefined for what this does not read. */
+export function shapeOfGeoJson(value: unknown): Shape | undefined {
+  const parsed = geometry.safeParse(value);
+  if (!parsed.success) return undefined;
+  const budget = new Budget();
+  const lines = (paths: readonly z.infer<typeof path>[]): Shape | undefined => {
+    const read = paths
+      .map((one) => budget.take(one))
+      .filter((line): line is LatLon[] => line !== undefined && line.length >= 2);
+    return read.length === 0 ? undefined : { kind: 'line', lines: read };
+  };
+  const areas = (polygons: readonly (readonly z.infer<typeof path>[])[]): Shape | undefined => {
+    const read = polygons
+      .map((rings) => areaOf(rings, budget))
+      .filter((area): area is Area => area !== undefined);
+    return read.length === 0 ? undefined : { kind: 'area', areas: read };
+  };
+  const shape = parsed.data;
+  switch (shape.type) {
+    case 'Point':
+      return { kind: 'point', point: { lat: shape.coordinates[1], lon: shape.coordinates[0] } };
+    case 'LineString':
+      return lines([shape.coordinates]);
+    case 'MultiLineString':
+      return lines(shape.coordinates);
+    case 'Polygon':
+      return areas([shape.coordinates]);
+    case 'MultiPolygon':
+      return areas(shape.coordinates);
+  }
+}
+
+/**
+ * The places of Nominatim's answer (`format=jsonv2`), in its order; a place without an outline
+ * this reads is its point, one without a name or point is left out. Undefined for an answer
+ * that is no list.
+ */
+export function readNominatimPlaces(body: unknown): Place[] | undefined {
+  if (!Array.isArray(body)) return undefined;
+  const places: Place[] = [];
+  for (const value of body.slice(0, PLACES_PER_SEARCH)) {
+    const parsed = placeSchema.safeParse(value);
+    if (!parsed.success) continue;
+    const place = parsed.data;
+    places.push({
+      name: place.display_name,
+      shape: shapeOfGeoJson(place.geojson) ?? {
+        kind: 'point',
+        point: { lat: place.lat, lon: place.lon },
+      },
+    });
+  }
+  return places;
+}
diff --git a/src/domain/geo/outline.ts b/src/domain/geo/outline.ts
index 5d13a5941219390fa3aa1b1dd7f1b862ed9bd498..3cc13e72de8e4fcd80f194f3c7901144f6ef016f 100644
--- a/src/domain/geo/outline.ts
+++ b/src/domain/geo/outline.ts
@@ -41,8 +41,8 @@ function between(a: LatLon, b: LatLon, c: LatLon): boolean {
   );
 }
 
-/** Whether the segments a-b and c-d have a point in common, their ends included. */
-function meet(a: LatLon, b: LatLon, c: LatLon, d: LatLon): boolean {
+/** Whether the segments a-b and c-d have a point in common, their ends included (flat coordinates). */
+export function segmentsMeet(a: LatLon, b: LatLon, c: LatLon, d: LatLon): boolean {
   const abc = turn(a, b, c);
   const abd = turn(a, b, d);
   const cda = turn(c, d, a);
@@ -114,7 +114,7 @@ function isSimple(corners: readonly LatLon[]): boolean {
       const apart = Math.abs(i - j);
       if (apart === 1 || apart === n - 1) continue;
       if ((north[i] ?? 0) < (south[j] ?? 0) || (north[j] ?? 0) < (south[i] ?? 0)) continue;
-      if (meet(at(i), at(i + 1), at(j), at(j + 1))) return false;
+      if (segmentsMeet(at(i), at(i + 1), at(j), at(j + 1))) return false;
     }
     open.push(i);
   }
diff --git a/src/domain/geo/shape.test.ts b/src/domain/geo/shape.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..106381e14c99b9ea17f1df96dc4b0ec3982e874d
--- /dev/null
+++ b/src/domain/geo/shape.test.ts
@@ -0,0 +1,237 @@
+import { describe, expect, it } from 'vitest';
+import type { LatLon } from './lat-lon.js';
+import { MAX_OUTLINE_CORNERS } from './outline.js';
+import {
+  largestShape,
+  pathsMeet,
+  regionsBox,
+  regionsTouching,
+  shapeTouches,
+  type Area,
+  type Shape,
+} from './shape.js';
+
+/** A closed square ring from (south, west) with sides of `size` degrees. */
+function square(south: number, west: number, size: number): LatLon[] {
+  return [
+    { lat: south, lon: west },
+    { lat: south + size, lon: west },
+    { lat: south + size, lon: west + size },
+    { lat: south, lon: west + size },
+    { lat: south, lon: west },
+  ];
+}
+
+/** A closed ring of `corners` corners around a middle: a traced boundary. */
+function circle(lat: number, lon: number, radius: number, corners: number): LatLon[] {
+  const ring = Array.from({ length: corners }, (_unused, i) => ({
+    lat: lat + radius * Math.sin((2 * Math.PI * i) / corners),
+    lon: lon + radius * Math.cos((2 * Math.PI * i) / corners),
+  }));
+  return [...ring, { ...(ring[0] as LatLon) }];
+}
+
+const area = (outer: LatLon[], ...holes: LatLon[][]): Shape => ({
+  kind: 'area',
+  areas: [{ outer, holes } satisfies Area],
+});
+
+/** The region: the square from (40, -80) to (41, -79). */
+const REGION = square(40, -80, 1);
+
+describe('shapeTouches', () => {
+  it('counts a point inside the region, not one outside', () => {
+    expect(shapeTouches({ kind: 'point', point: { lat: 40.5, lon: -79.5 } }, REGION)).toBe(true);
+    expect(shapeTouches({ kind: 'point', point: { lat: 41.5, lon: -79.5 } }, REGION)).toBe(false);
+  });
+
+  it('counts a line with a point inside, or one that crosses the region without a point in it', () => {
+    const into = [
+      { lat: 40.5, lon: -79.5 },
+      { lat: 42, lon: -79.5 },
+    ];
+    const across = [
+      { lat: 39, lon: -79.5 },
+      { lat: 42, lon: -79.5 },
+    ];
+    const past = [
+      { lat: 39, lon: -81 },
+      { lat: 42, lon: -81 },
+    ];
+    expect(shapeTouches({ kind: 'line', lines: [into] }, REGION)).toBe(true);
+    expect(shapeTouches({ kind: 'line', lines: [across] }, REGION)).toBe(true);
+    expect(shapeTouches({ kind: 'line', lines: [past, past] }, REGION)).toBe(false);
+  });
+
+  it('counts an area inside the region, around it, or overlapping it', () => {
+    expect(shapeTouches(area(square(40.2, -79.8, 0.2)), REGION)).toBe(true);
+    expect(shapeTouches(area(square(39, -81, 3)), REGION)).toBe(true);
+    expect(shapeTouches(area(square(40.5, -79.5, 1)), REGION)).toBe(true);
+    expect(shapeTouches(area(square(42, -79.5, 1)), REGION)).toBe(false);
+  });
+
+  it('counts a cross of two areas with no corner in the other', () => {
+    // A tall thin bar through the middle of the region, its ends outside.
+    const bar = [
+      { lat: 39, lon: -79.6 },
+      { lat: 42, lon: -79.6 },
+      { lat: 42, lon: -79.4 },
+      { lat: 39, lon: -79.4 },
+      { lat: 39, lon: -79.6 },
+    ];
+    // A wide flat region across it.
+    const wide = [
+      { lat: 40.4, lon: -81 },
+      { lat: 40.6, lon: -81 },
+      { lat: 40.6, lon: -78 },
+      { lat: 40.4, lon: -78 },
+      { lat: 40.4, lon: -81 },
+    ];
+    expect(shapeTouches(area(bar), wide)).toBe(true);
+  });
+
+  it('does not count a region that lies wholly in a hole of the area', () => {
+    const ring = square(38, -82, 5);
+    expect(shapeTouches(area(ring, square(39.5, -80.5, 2)), REGION)).toBe(false);
+    expect(shapeTouches(area(ring, square(40.5, -80.5, 2)), REGION)).toBe(true);
+  });
+});
+
+describe('regionsTouching', () => {
+  it('gives the regions with something in common with the shape, in their order', () => {
+    const regions = [
+      { id: 1, bounds: REGION },
+      { id: 2, bounds: square(41, -80, 1) },
+      { id: 3, bounds: null },
+      { id: 4, bounds: square(45, -80, 1) },
+    ];
+    const line: Shape = {
+      kind: 'line',
+      lines: [
+        [
+          { lat: 40.5, lon: -79.5 },
+          { lat: 41.5, lon: -79.5 },
+        ],
+      ],
+    };
+    expect(regionsTouching(line, regions).map((region) => region.id)).toEqual([1, 2]);
+  });
+
+  it('compares outlines of thousands of corners in well under a second', () => {
+    const region = circle(40.5, -79.5, 0.5, 5_000);
+    const town = circle(40.5, -78.9, 0.2, 5_000);
+    const started = performance.now();
+    expect(shapeTouches(area(town), region)).toBe(true);
+    expect(shapeTouches(area(circle(40.5, -78.7, 0.15, 5_000)), region)).toBe(false);
+    expect(performance.now() - started).toBeLessThan(500);
+  });
+});
+
+describe('shapeTouches at the limits', () => {
+  /**
+   * The fastest of three runs, in milliseconds: the first call also compiles the code for lists
+   * this long, and other test files run beside this one; neither is what is measured.
+   */
+  const fastest = (run: () => unknown): number => {
+    let best = Infinity;
+    for (let i = 0; i < 3; i++) {
+      const started = performance.now();
+      run();
+      best = Math.min(best, performance.now() - started);
+    }
+    return best;
+  };
+
+  /** An arc of `corners` points from `from` to `to` (radians) around a middle. */
+  const arc = (
+    lat: number,
+    lon: number,
+    radius: number,
+    from: number,
+    to: number,
+    corners: number,
+  ) =>
+    Array.from({ length: corners }, (_unused, i) => {
+      const angle = from + ((to - from) * i) / (corners - 1);
+      return { lat: lat + radius * Math.sin(angle), lon: lon + radius * Math.cos(angle) };
+    });
+
+  it('finds a region of 5,000 corners in the hole of an area of 50,000 points quickly', () => {
+    const region = circle(40.5, -79.5, 0.1, MAX_OUTLINE_CORNERS);
+    const outer = circle(40.5, -79.5, 1, 25_000);
+    const hole = circle(40.5, -79.5, 0.3, 25_000);
+    expect(shapeTouches(area(outer, hole), region)).toBe(false);
+    expect(fastest(() => shapeTouches(area(outer, hole), region))).toBeLessThan(50);
+  });
+
+  it('finds a region of 5,000 corners in the mouth of a crescent of 50,000 points quickly', () => {
+    const region = circle(40.5, -79.5, 0.1, MAX_OUTLINE_CORNERS);
+    // A ring around the region, open on the east: out along a wide arc, back along a narrow one.
+    const wide = arc(40.5, -79.5, 1, 0.3, 2 * Math.PI - 0.3, 25_000);
+    const narrow = arc(40.5, -79.5, 0.3, 2 * Math.PI - 0.3, 0.3, 25_000);
+    const crescent = [...wide, ...narrow, { ...(wide[0] as LatLon) }];
+    expect(shapeTouches(area(crescent), region)).toBe(false);
+    expect(fastest(() => shapeTouches(area(crescent), region))).toBeLessThan(50);
+  });
+
+  it('decides by one corner each way when no sides meet', () => {
+    const region = circle(40.5, -79.5, 0.1, 100);
+    expect(shapeTouches(area(circle(40.5, -79.5, 1, 100)), region)).toBe(true);
+    expect(shapeTouches(area(circle(40.5, -79.5, 0.05, 100)), region)).toBe(true);
+    expect(
+      shapeTouches(
+        {
+          kind: 'line',
+          lines: [
+            [
+              { lat: 40.5, lon: -79.52 },
+              { lat: 40.5, lon: -79.48 },
+            ],
+          ],
+        },
+        region,
+      ),
+    ).toBe(true);
+    // Two parts of one place: only the second lies in the region.
+    expect(
+      shapeTouches(
+        {
+          kind: 'area',
+          areas: [
+            { outer: circle(42, -79.5, 0.05, 50), holes: [] },
+            { outer: circle(40.5, -79.5, 0.05, 50), holes: [] },
+          ],
+        },
+        region,
+      ),
+    ).toBe(true);
+  });
+});
+
+describe('pathsMeet', () => {
+  it('is false for paths whose boxes do not meet', () => {
+    expect(pathsMeet([square(0, 0, 1)], [square(5, 5, 1)])).toBe(false);
+  });
+});
+
+describe('largestShape', () => {
+  it('prefers an area to a line to a point, then the largest', () => {
+    const point = { name: 'point', shape: { kind: 'point', point: { lat: 1, lon: 1 } } as Shape };
+    const street = { name: 'street', shape: { kind: 'line', lines: [square(0, 0, 9)] } as Shape };
+    const park = { name: 'park', shape: area(square(0, 0, 1)) };
+    const town = { name: 'town', shape: area(square(0, 0, 2)) };
+    expect(largestShape([point, street, park, town])?.name).toBe('town');
+    expect(largestShape([point, street])?.name).toBe('street');
+    expect(largestShape([point])?.name).toBe('point');
+    expect(largestShape([])).toBeUndefined();
+  });
+});
+
+describe('regionsBox', () => {
+  it('is the box of all outlines', () => {
+    expect(
+      regionsBox([{ bounds: REGION }, { bounds: null }, { bounds: square(41, -79, 1) }]),
+    ).toEqual({ south: 40, north: 42, west: -80, east: -78 });
+    expect(regionsBox([{ bounds: null }])).toBeUndefined();
+  });
+});
diff --git a/src/domain/geo/shape.ts b/src/domain/geo/shape.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4231a36727d2fe626dae5ef7ab11ae780cbb2dbd
--- /dev/null
+++ b/src/domain/geo/shape.ts
@@ -0,0 +1,247 @@
+import type { LatLon } from './lat-lon.js';
+import { segmentsMeet } from './outline.js';
+import { boxOf, inBox, ringContains, type Box } from './region-membership.js';
+
+/** An area with the holes in it; each ring closed (its first point is also its last). */
+export interface Area {
+  outer: LatLon[];
+  holes: LatLon[][];
+}
+
+/**
+ * A place on the map: a point, lines (a street, a river: each an open list of points), or
+ * areas (a park, a town). Latitude and longitude are taken as flat coordinates, as everywhere
+ * regions are compared with what lies in them.
+ */
+export type Shape =
+  | { kind: 'point'; point: LatLon }
+  | { kind: 'line'; lines: LatLon[][] }
+  | { kind: 'area'; areas: Area[] };
+
+/** Every point of a shape: the point, the lines' points, the areas' rings. */
+export function shapePoints(shape: Shape): LatLon[] {
+  switch (shape.kind) {
+    case 'point':
+      return [shape.point];
+    case 'line':
+      return shape.lines.flat();
+    case 'area':
+      return shape.areas.flatMap((area) => [...area.outer, ...area.holes.flat()]);
+  }
+}
+
+/** The smallest box that holds all these paths, read in place (no list of all points is made). */
+function boxOfPaths(paths: readonly (readonly LatLon[])[]): Box {
+  const box = { south: Infinity, north: -Infinity, west: Infinity, east: -Infinity };
+  for (const path of paths) {
+    for (const { lat, lon } of path) {
+      if (lat < box.south) box.south = lat;
+      if (lat > box.north) box.north = lat;
+      if (lon < box.west) box.west = lon;
+      if (lon > box.east) box.east = lon;
+    }
+  }
+  return box;
+}
+
+/** The paths of a shape: the point as a path of one, the lines, the areas' rings. */
+function pathsOf(shape: Shape): (readonly LatLon[])[] {
+  switch (shape.kind) {
+    case 'point':
+      return [[shape.point]];
+    case 'line':
+      return shape.lines;
+    case 'area':
+      return shape.areas.flatMap((area) => [area.outer, ...area.holes]);
+  }
+}
+
+/** The smallest box that holds a shape. */
+export function shapeBox(shape: Shape): Box {
+  return boxOfPaths(pathsOf(shape));
+}
+
+const boxesMeet = (a: Box, b: Box): boolean =>
+  a.south <= b.north && b.south <= a.north && a.west <= b.east && b.west <= a.east;
+
+/** A side of a path: its two ends and its box. */
+interface Side {
+  a: LatLon;
+  b: LatLon;
+  west: number;
+  east: number;
+  south: number;
+  north: number;
+  /** Which of the two sets it is of. */
+  of: 0 | 1;
+}
+
+function sidesOf(paths: readonly (readonly LatLon[])[], of: 0 | 1, within: Box): Side[] {
+  const sides: Side[] = [];
+  for (const path of paths) {
+    for (let i = 0; i + 1 < path.length; i++) {
+      const a = path[i] as LatLon;
+      const b = path[i + 1] as LatLon;
+      const side: Side = {
+        a,
+        b,
+        west: Math.min(a.lon, b.lon),
+        east: Math.max(a.lon, b.lon),
+        south: Math.min(a.lat, b.lat),
+        north: Math.max(a.lat, b.lat),
+        of,
+      };
+      if (boxesMeet(side, within)) sides.push(side);
+    }
+  }
+  return sides;
+}
+
+/**
+ * Whether a side of one set of paths meets a side of the other. Only sides inside the box both
+ * sets share are looked at, and of those only sides whose spans of longitude overlap are
+ * compared (a sweep in the order of where they begin), so outlines of thousands of corners are
+ * compared in milliseconds.
+ */
+export function pathsMeet(
+  first: readonly (readonly LatLon[])[],
+  second: readonly (readonly LatLon[])[],
+): boolean {
+  const firstBox = boxOfPaths(first);
+  const secondBox = boxOfPaths(second);
+  if (!boxesMeet(firstBox, secondBox)) return false;
+  const shared: Box = {
+    south: Math.max(firstBox.south, secondBox.south),
+    north: Math.min(firstBox.north, secondBox.north),
+    west: Math.max(firstBox.west, secondBox.west),
+    east: Math.min(firstBox.east, secondBox.east),
+  };
+  const sides = [...sidesOf(first, 0, shared), ...sidesOf(second, 1, shared)].sort(
+    (a, b) => a.west - b.west,
+  );
+  const open: Side[] = [];
+  for (const side of sides) {
+    let kept = 0;
+    for (const other of open) if (other.east >= side.west) open[kept++] = other;
+    open.length = kept;
+    for (const other of open) {
+      if (other.of === side.of) continue;
+      if (side.north < other.south || other.north < side.south) continue;
+      if (segmentsMeet(side.a, side.b, other.a, other.b)) return true;
+    }
+    open.push(side);
+  }
+  return false;
+}
+
+/** Whether a point lies in one of the areas, outside its holes. */
+export function inAreas(areas: readonly Area[], point: LatLon): boolean {
+  return areas.some(
+    (area) =>
+      ringContains(area.outer, point) && !area.holes.some((hole) => ringContains(hole, point)),
+  );
+}
+
+/**
+ * Whether a shape and the outline of a region (a closed ring) have something in common: the
+ * region contains the point; a line or an area crosses the region's outline (an area's holes
+ * count as outline), or, where no sides meet, one lies wholly in the other, which one point of
+ * each part says (a region that lies wholly in a hole has nothing in common with the area). So
+ * the cost is the sweep over the sides near both and a test of a few points, never every
+ * corner against the other outline. A shape that only touches the outline may be counted either
+ * way.
+ */
+export function shapeTouches(shape: Shape, ring: readonly LatLon[]): boolean {
+  const box = boxOf(ring);
+  if (!boxesMeet(box, shapeBox(shape))) return false;
+  const inRegion = (point: LatLon | undefined): boolean =>
+    point !== undefined && inBox(box, point) && ringContains(ring, point);
+  switch (shape.kind) {
+    case 'point':
+      return inRegion(shape.point);
+    case 'line':
+      // Without a crossing, each line lies wholly in the region or wholly outside it.
+      return pathsMeet(shape.lines, [ring]) || shape.lines.some((line) => inRegion(line[0]));
+    case 'area': {
+      if (pathsMeet(pathsOf(shape), [ring])) return true;
+      // No sides meet: each part lies wholly in the region, or the region wholly in a part (and
+      // then in its hole or not), or they are apart.
+      if (shape.areas.some((area) => inRegion(area.outer[0]))) return true;
+      const corner = ring[0];
+      return corner !== undefined && inAreas(shape.areas, corner);
+    }
+  }
+}
+
+/** The regions with something in common with a shape (`shapeTouches`), in their order. */
+export function regionsTouching<R extends { bounds: readonly LatLon[] | null }>(
+  shape: Shape,
+  regions: readonly R[],
+): R[] {
+  return regions.filter((region) => region.bounds !== null && shapeTouches(shape, region.bounds));
+}
+
+/** Twice the area of a ring in square degrees, without its sign (shoelace). */
+function ringArea(ring: readonly LatLon[]): number {
+  let sum = 0;
+  for (let i = 0; i + 1 < ring.length; i++) {
+    const a = ring[i] as LatLon;
+    const b = ring[i + 1] as LatLon;
+    sum += a.lon * b.lat - b.lon * a.lat;
+  }
+  return Math.abs(sum);
+}
+
+/** The size of a shape, to choose the largest of several: area for areas, length for lines. */
+export function shapeSize(shape: Shape): number {
+  switch (shape.kind) {
+    case 'point':
+      return 0;
+    case 'line':
+      return shape.lines.reduce((sum, line) => {
+        let length = 0;
+        for (let i = 0; i + 1 < line.length; i++) {
+          const a = line[i] as LatLon;
+          const b = line[i + 1] as LatLon;
+          length += Math.hypot(a.lat - b.lat, a.lon - b.lon);
+        }
+        return sum + length;
+      }, 0);
+    case 'area':
+      return shape.areas.reduce(
+        (sum, area) =>
+          sum +
+          ringArea(area.outer) -
+          area.holes.reduce((holes, hole) => holes + ringArea(hole), 0),
+        0,
+      );
+  }
+}
+
+/**
+ * The largest of several shapes, as the legacy bot chose among what a search found: an area
+ * before a line before a point, the largest area or the longest line, and of points the first.
+ */
+export function largestShape<T extends { shape: Shape }>(found: readonly T[]): T | undefined {
+  const rank: Record<Shape['kind'], number> = { area: 2, line: 1, point: 0 };
+  let best: T | undefined;
+  for (const one of found) {
+    if (
+      !best ||
+      rank[one.shape.kind] > rank[best.shape.kind] ||
+      (rank[one.shape.kind] === rank[best.shape.kind] &&
+        shapeSize(one.shape) > shapeSize(best.shape))
+    ) {
+      best = one;
+    }
+  }
+  return best;
+}
+
+/** The box of all regions' outlines, to search places in; undefined when none has one. */
+export function regionsBox(
+  regions: readonly { bounds: readonly LatLon[] | null }[],
+): Box | undefined {
+  const points = regions.flatMap((region) => region.bounds ?? []);
+  return points.length === 0 ? undefined : boxOf(points);
+}
diff --git a/src/services/place-search.test.ts b/src/services/place-search.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ff405ee55a607ec59e8b8a8f058184f94f99cab7
--- /dev/null
+++ b/src/services/place-search.test.ts
@@ -0,0 +1,215 @@
+import { describe, expect, it, vi } from 'vitest';
+import { jsonResponse } from '../../test/support/responses.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import type { LimitedResponse } from './limited-json.js';
+import { NominatimSearch, type PlaceFetch } from './place-search.js';
+
+const BOX = { south: 40, north: 41, west: -80.5, east: -79 };
+const SERVER = { url: 'https://nominatim.example.test/', userAgent: 'Pine test' };
+
+const ANSWER = [
+  {
+    display_name: 'Schenley Park, Pittsburgh',
+    lat: '40.43',
+    lon: '-79.94',
+    geojson: { type: 'Point', coordinates: [-79.94, 40.43] },
+  },
+];
+
+function setup(
+  answer: (url: string) => Promise<LimitedResponse> = () => Promise.resolve(jsonResponse(ANSWER)),
+  options: { server?: typeof SERVER | undefined; maxWaiting?: number } = {},
+) {
+  const { log, entries } = createTestLogger();
+  const fetch = vi.fn<PlaceFetch>(answer);
+  const clock = { now: 1_000_000 };
+  const waits: number[] = [];
+  const search = new NominatimSearch({
+    server: 'server' in options ? options.server : SERVER,
+    fetch,
+    log,
+    now: () => clock.now,
+    // Waiting moves the clock on at once.
+    sleep: (ms) => {
+      waits.push(ms);
+      clock.now += ms;
+      return Promise.resolve();
+    },
+    ...(options.maxWaiting === undefined ? {} : { maxWaiting: options.maxWaiting }),
+  });
+  return { search, fetch, entries, clock, waits };
+}
+
+describe('NominatimSearch', () => {
+  it('searches the server with the installation’s User-Agent, within the box', async () => {
+    const made = setup();
+    const outcome = await made.search.search('Schenley  Park', BOX);
+    expect(outcome).toEqual({
+      ok: true,
+      place: {
+        name: 'Schenley Park, Pittsburgh',
+        shape: { kind: 'point', point: { lat: 40.43, lon: -79.94 } },
+      },
+      found: 1,
+    });
+    const [url, init] = made.fetch.mock.calls[0] ?? [];
+    const address = new URL(url ?? '');
+    expect(`${address.origin}${address.pathname}`).toBe('https://nominatim.example.test/search');
+    expect(address.searchParams.get('q')).toBe('schenley park');
+    expect(address.searchParams.get('bounded')).toBe('1');
+    expect(address.searchParams.get('viewbox')).toBe('-80.5,41,-79,40');
+    expect(init?.headers['User-Agent']).toBe('Pine test');
+    expect(init?.redirect).toBe('error');
+    // What members search for is never logged.
+    expect(JSON.stringify(made.entries)).not.toMatch(/schenley/i);
+  });
+
+  it('answers and keeps only the largest place found, with how many were', async () => {
+    const ring = [
+      [-80, 40],
+      [-79.9, 40],
+      [-79.9, 40.1],
+      [-80, 40],
+    ];
+    const made = setup(() =>
+      Promise.resolve(
+        jsonResponse([
+          ...ANSWER,
+          {
+            display_name: 'Schenley Park Area',
+            lat: '40.05',
+            lon: '-79.95',
+            geojson: { type: 'Polygon', coordinates: [ring] },
+          },
+        ]),
+      ),
+    );
+    const outcome = await made.search.search('Schenley Park', BOX);
+    expect(outcome.ok && outcome.place?.name).toBe('Schenley Park Area');
+    expect(outcome.ok && outcome.found).toBe(2);
+    expect(await made.search.search('Schenley Park', BOX)).toEqual(outcome);
+    expect(made.fetch).toHaveBeenCalledTimes(1);
+    const none = setup(() => Promise.resolve(jsonResponse([])));
+    expect(await none.search.search('Nowhere', BOX)).toEqual({
+      ok: true,
+      place: undefined,
+      found: 0,
+    });
+  });
+
+  it.each([429, 403])('pauses ten minutes after Nominatim answers %i', async (status) => {
+    let answer = status;
+    const made = setup(() => Promise.resolve(jsonResponse(ANSWER, { status: answer })));
+    expect(await made.search.search('Park', BOX)).toEqual({ ok: false, reason: 'paused', status });
+    answer = 200;
+    made.clock.now += 9 * 60_000;
+    expect(await made.search.search('Garden', BOX)).toEqual({ ok: false, reason: 'paused' });
+    expect(made.fetch).toHaveBeenCalledTimes(1);
+    made.clock.now += 60_000;
+    expect((await made.search.search('Garden', BOX)).ok).toBe(true);
+    expect(made.fetch).toHaveBeenCalledTimes(2);
+  });
+
+  it('sends no search that waited for its turn while a pause began', async () => {
+    const clock = { now: 1_000_000 };
+    let release: (() => void) | undefined;
+    const turn = new Promise<void>((resolve) => {
+      release = resolve;
+    });
+    const fetch = vi.fn<PlaceFetch>(() => Promise.resolve(jsonResponse({}, { status: 429 })));
+    const search = new NominatimSearch({
+      server: SERVER,
+      fetch,
+      log: createTestLogger().log,
+      now: () => clock.now,
+      sleep: (ms) =>
+        turn.then(() => {
+          clock.now += ms;
+        }),
+    });
+    const first = search.search('Park', BOX);
+    const second = search.search('Garden', BOX);
+    expect(await first).toEqual({ ok: false, reason: 'paused', status: 429 });
+    release?.();
+    expect(await second).toEqual({ ok: false, reason: 'paused' });
+    expect(fetch).toHaveBeenCalledTimes(1);
+  });
+
+  it('keeps fifty answers at most', async () => {
+    const made = setup();
+    for (let i = 0; i <= 50; i += 1) await made.search.search(`Place ${String(i)}`, BOX);
+    expect(made.fetch).toHaveBeenCalledTimes(51);
+    await made.search.search('Place 50', BOX);
+    expect(made.fetch).toHaveBeenCalledTimes(51);
+    await made.search.search('Place 0', BOX);
+    expect(made.fetch).toHaveBeenCalledTimes(52);
+  });
+
+  it('is switched off without a server', async () => {
+    const made = setup(undefined, { server: undefined });
+    expect(made.search.enabled).toBe(false);
+    expect(await made.search.search('Park', BOX)).toEqual({ ok: false, reason: 'disabled' });
+    expect(made.fetch).not.toHaveBeenCalled();
+  });
+
+  it('keeps an answer for a day, the same search in another box apart', async () => {
+    const made = setup();
+    await made.search.search('Schenley Park', BOX);
+    await made.search.search('schenley park ', BOX);
+    expect(made.fetch).toHaveBeenCalledTimes(1);
+    await made.search.search('Schenley Park', { ...BOX, south: 39 });
+    expect(made.fetch).toHaveBeenCalledTimes(2);
+    made.clock.now += 86_400_000;
+    await made.search.search('Schenley Park', BOX);
+    expect(made.fetch).toHaveBeenCalledTimes(3);
+  });
+
+  it('starts one request a second at most, and tells the eleventh waiting that it is busy', async () => {
+    const made = setup(undefined, { maxWaiting: 2 });
+    await made.search.search('One', BOX);
+    await made.search.search('Two', BOX);
+    expect(made.waits).toEqual([1_000]);
+    made.clock.now += 5_000;
+    await made.search.search('Three', BOX);
+    expect(made.waits).toEqual([1_000]);
+    // Three at once: the first goes, two wait, one more is turned away.
+    const slow = setup(undefined, { maxWaiting: 2 });
+    let release: (() => void) | undefined;
+    const held = new Promise<void>((resolve) => {
+      release = resolve;
+    });
+    const waiting = new NominatimSearch({
+      server: SERVER,
+      fetch: () => Promise.resolve(jsonResponse(ANSWER)),
+      log: createTestLogger().log,
+      now: () => slow.clock.now,
+      sleep: () => held,
+      maxWaiting: 2,
+    });
+    const first = waiting.search('a', BOX);
+    const second = waiting.search('b', BOX);
+    const third = waiting.search('c', BOX);
+    expect(await waiting.search('d', BOX)).toEqual({ ok: false, reason: 'busy' });
+    release?.();
+    expect((await Promise.all([first, second, third])).every((outcome) => outcome.ok)).toBe(true);
+  });
+
+  it('fails into an answer, and keeps no failure', async () => {
+    const refused = setup(() => Promise.resolve(jsonResponse({}, { status: 500 })));
+    expect(await refused.search.search('Park', BOX)).toEqual({
+      ok: false,
+      reason: 'refused',
+      status: 500,
+    });
+    await refused.search.search('Park', BOX);
+    expect(refused.fetch).toHaveBeenCalledTimes(2);
+    const odd = setup(() => Promise.resolve(jsonResponse({ error: 'Bad' })));
+    expect(await odd.search.search('Park', BOX)).toEqual({ ok: false, reason: 'unreadable' });
+    const down = setup(() => Promise.reject(new TypeError('fetch failed')));
+    expect(await down.search.search('Park', BOX)).toEqual({ ok: false, reason: 'unreachable' });
+    const slow = setup(() =>
+      Promise.reject(Object.assign(new Error('late'), { name: 'TimeoutError' })),
+    );
+    expect(await slow.search.search('Park', BOX)).toEqual({ ok: false, reason: 'timeout' });
+  });
+});
diff --git a/src/services/place-search.ts b/src/services/place-search.ts
new file mode 100644
index 0000000000000000000000000000000000000000..12bb07b1fed4d27c009af7a7d76d022e17b85ee6
--- /dev/null
+++ b/src/services/place-search.ts
@@ -0,0 +1,231 @@
+import { BoundedMap } from '../bounded-map.js';
+import { placeSearchQuery, readNominatimPlaces, type Place } from '../domain/geo/nominatim.js';
+import type { Box } from '../domain/geo/region-membership.js';
+import { largestShape } from '../domain/geo/shape.js';
+import type { Logger } from '../log.js';
+import { failureReason } from './failure-reason.js';
+import { discardBody, readLimitedJson, type LimitedResponse } from './limited-json.js';
+
+/**
+ * What came of a search. `ok`: the largest of the places found (`largestShape`; undefined when
+ * none was), and how many were found. `disabled`: no server is configured. `busy`: too many
+ * searches wait for their turn already. `paused`: Nominatim asked to be left alone (429, 403)
+ * and nothing is asked of it for a while (`status` on the answer that asked).
+ * `refused`: another error status (`status`). `timeout`, `unreachable`: no answer. `too-large`,
+ * `unreadable`: an answer that could not be read.
+ */
+export type PlaceOutcome =
+  | { ok: true; place: Place | undefined; found: number }
+  | {
+      ok: false;
+      reason:
+        | 'disabled'
+        | 'busy'
+        | 'paused'
+        | 'refused'
+        | 'timeout'
+        | 'unreachable'
+        | 'too-large'
+        | 'unreadable';
+      status?: number;
+    };
+
+/**
+ * Places by name, for `/find-region`. Nothing here throws: a failure is an answer. Tests use
+ * `FakePlaces` (`test/support/places.ts`); nothing in a test touches the network.
+ */
+export interface PlaceSearch {
+  /** False when no server is configured (`settings.findRegion`). */
+  readonly enabled: boolean;
+  /** The largest of the places called `text` that lie in `box`. */
+  search(text: string, box: Box): Promise<PlaceOutcome>;
+}
+
+export type PlaceFetch = (
+  url: string,
+  init: {
+    method: 'GET';
+    headers: Record<string, string>;
+    redirect: 'error';
+    signal: AbortSignal;
+  },
+) => Promise<LimitedResponse>;
+
+export interface NominatimOptions {
+  /** `settings.findRegion`: the server and the User-Agent; undefined switches searching off. */
+  server: { url: string; userAgent: string } | undefined;
+  fetch: PlaceFetch;
+  log: Logger;
+  now?: () => number;
+  /** Waits; for tests. Default `setTimeout`. */
+  sleep?: (ms: number) => Promise<void>;
+  /** How long one search may take once its turn came. Default ten seconds. */
+  timeoutMs?: number;
+  /** A longer answer is given up. Default 5 MB. */
+  maxBytes?: number;
+  /** The least time between the starts of two requests. Default a second (Nominatim's policy). */
+  intervalMs?: number;
+  /** How many searches may wait for their turn; one more is `busy`. Default ten. */
+  maxWaiting?: number;
+  /** How long a search's answer is kept. Default a day. */
+  cacheMs?: number;
+  /** How many answers are kept at most. Default 50: a place is a large object. */
+  cacheSize?: number;
+  /** How long nothing is asked after Nominatim answered 429 or 403. Default ten minutes. */
+  pauseMs?: number;
+}
+
+/** The statuses by which Nominatim says the bot asks too much, or is blocked for it. */
+const LEAVE_ALONE = new Set([403, 429]);
+
+const sleep = (ms: number): Promise<void> =>
+  new Promise((resolve) => {
+    setTimeout(resolve, ms);
+  });
+
+/**
+ * OpenStreetMap's Nominatim (or another server of it) over `fetch`. Its usage policy is kept:
+ * one request a second at most for the whole bot (searches wait for their turn, and when ten
+ * wait already the next is told the service is busy), a User-Agent that names the installation,
+ * and answers kept for a day, so that the same search in the same box is asked once. What
+ * members search for is never logged.
+ */
+export class NominatimSearch implements PlaceSearch {
+  private readonly now: () => number;
+  private readonly sleep: (ms: number) => Promise<void>;
+  private readonly timeoutMs: number;
+  private readonly maxBytes: number;
+  private readonly intervalMs: number;
+  private readonly maxWaiting: number;
+  private readonly cacheMs: number;
+  private readonly cache: BoundedMap<
+    string,
+    { at: number; place: Place | undefined; found: number }
+  >;
+  private readonly pauseMs: number;
+  /** Until when nothing is asked of Nominatim. */
+  private pausedUntil = 0;
+  private readonly asking = new Map<string, Promise<PlaceOutcome>>();
+  /** When the next request may start. */
+  private nextStart = 0;
+  private waiting = 0;
+
+  constructor(private readonly options: NominatimOptions) {
+    this.now = options.now ?? (() => Date.now());
+    this.sleep = options.sleep ?? sleep;
+    this.timeoutMs = options.timeoutMs ?? 10_000;
+    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
+    this.intervalMs = options.intervalMs ?? 1_000;
+    this.maxWaiting = options.maxWaiting ?? 10;
+    this.cacheMs = options.cacheMs ?? 86_400_000;
+    this.cache = new BoundedMap(options.cacheSize ?? 50);
+    this.pauseMs = options.pauseMs ?? 600_000;
+  }
+
+  get enabled(): boolean {
+    return this.options.server !== undefined;
+  }
+
+  search(text: string, box: Box): Promise<PlaceOutcome> {
+    const { server } = this.options;
+    if (!server) return Promise.resolve({ ok: false, reason: 'disabled' });
+    const query = placeSearchQuery(text.trim().replace(/\s+/g, ' ').toLowerCase(), box);
+    const now = this.now();
+    this.cache.dropWhile((kept) => now - kept.at >= this.cacheMs);
+    const kept = this.cache.get(query);
+    if (kept) return Promise.resolve({ ok: true, place: kept.place, found: kept.found });
+    const asking = this.asking.get(query);
+    if (asking) return asking;
+    if (now < this.pausedUntil) return Promise.resolve({ ok: false, reason: 'paused' });
+    if (this.waiting >= this.maxWaiting) return Promise.resolve({ ok: false, reason: 'busy' });
+    const answer = this.inTurn(() => this.ask(server, query))
+      .then((outcome) => {
+        // Only what is answered is kept: the largest place and the count, not every outline.
+        if (outcome.ok) {
+          this.cache.set(query, { at: this.now(), place: outcome.place, found: outcome.found });
+        }
+        return outcome;
+      })
+      .finally(() => this.asking.delete(query));
+    this.asking.set(query, answer);
+    return answer;
+  }
+
+  /**
+   * Runs a request when its turn has come: `intervalMs` after the start of the one before; not
+   * at all when a pause began while it waited.
+   */
+  private async inTurn(request: () => Promise<PlaceOutcome>): Promise<PlaceOutcome> {
+    const now = this.now();
+    const start = Math.max(now, this.nextStart);
+    this.nextStart = start + this.intervalMs;
+    if (start > now) {
+      this.waiting += 1;
+      try {
+        await this.sleep(start - now);
+      } finally {
+        this.waiting -= 1;
+      }
+      if (this.now() < this.pausedUntil) return { ok: false, reason: 'paused' };
+    }
+    return request();
+  }
+
+  private async ask(
+    server: { url: string; userAgent: string },
+    query: string,
+  ): Promise<PlaceOutcome> {
+    const { log } = this.options;
+    const host = hostOf(server.url);
+    try {
+      const response = await this.options.fetch(
+        `${server.url.replace(/\/+$/, '')}/search?${query}`,
+        {
+          method: 'GET',
+          headers: { Accept: 'application/json', 'User-Agent': server.userAgent },
+          redirect: 'error',
+          signal: AbortSignal.timeout(this.timeoutMs),
+        },
+      );
+      if (response.status !== 200) {
+        discardBody(response);
+        if (LEAVE_ALONE.has(response.status)) {
+          this.pausedUntil = this.now() + this.pauseMs;
+          log.warn(
+            { host, status: response.status, pauseMs: this.pauseMs },
+            'Nominatim asks to be left alone; not searching for a while',
+          );
+          return { ok: false, reason: 'paused', status: response.status };
+        }
+        log.warn({ host, status: response.status }, 'Nominatim refused a search');
+        return { ok: false, reason: 'refused', status: response.status };
+      }
+      const body = await readLimitedJson(response, this.maxBytes);
+      if (!body.ok) {
+        log.warn({ host, reason: body.reason }, 'could not read the answer of Nominatim');
+        return { ok: false, reason: body.reason };
+      }
+      const places = readNominatimPlaces(body.value);
+      if (!places) {
+        log.warn({ host }, 'the answer of Nominatim is not of the shape known');
+        return { ok: false, reason: 'unreadable' };
+      }
+      return { ok: true, place: largestShape(places), found: places.length };
+    } catch (err) {
+      const timeout = err instanceof Error && err.name === 'TimeoutError';
+      log.warn(
+        { host, reason: timeout ? 'timeout' : failureReason(err) },
+        'could not search Nominatim',
+      );
+      return { ok: false, reason: timeout ? 'timeout' : 'unreachable' };
+    }
+  }
+}
+
+function hostOf(url: string): string {
+  try {
+    return new URL(url).hostname;
+  } catch {
+    return 'unknown';
+  }
+}
diff --git a/test/fixtures/settings.json b/test/fixtures/settings.json
index 4637d38ee51aae6e2063940e7c8975a6526240c1..30759b26ccd3c1f125e7e0b2ef9044a16d976516 100644
--- a/test/fixtures/settings.json
+++ b/test/fixtures/settings.json
@@ -64,6 +64,10 @@
   "wildSpawnExceptions": ["Uxie", "Mesprit", "Azelf"],
   "regionForumSuffix": "-meetups",
   "regionMapLink": "https://maps.example.test/regions",
+  "findRegion": {
+    "url": "https://nominatim.example.test",
+    "userAgent": "Professor Pine test installation"
+  },
   "blacklistWords": [
     "ex",
     "raid",
diff --git a/test/support/places.ts b/test/support/places.ts
new file mode 100644
index 0000000000000000000000000000000000000000..92309985eb77367f8aa43fe64f681edf295d4261
--- /dev/null
+++ b/test/support/places.ts
@@ -0,0 +1,33 @@
+import type { Place } from '../../src/domain/geo/nominatim.js';
+import type { Box } from '../../src/domain/geo/region-membership.js';
+import { largestShape } from '../../src/domain/geo/shape.js';
+import type { PlaceOutcome, PlaceSearch } from '../../src/services/place-search.js';
+
+/**
+ * Nominatim as a test wants it: nothing leaves the process. A search is answered with the
+ * largest of the places of `found` under its text (lower case; none when there are none) and
+ * their count, as the real one answers, or with `failing`.
+ * Every search is recorded in `asked`. Like the real one it never throws and never answers in
+ * the same turn of the event loop.
+ */
+export class FakePlaces implements PlaceSearch {
+  enabled = true;
+  readonly found = new Map<string, Place[]>();
+  readonly asked: { text: string; box: Box }[] = [];
+  failing: Extract<PlaceOutcome, { ok: false }> | undefined;
+
+  search(text: string, box: Box): Promise<PlaceOutcome> {
+    this.asked.push({ text, box });
+    const places = this.found.get(text.trim().toLowerCase()) ?? [];
+    const outcome: PlaceOutcome = this.failing ?? {
+      ok: true,
+      place: largestShape(places),
+      found: places.length,
+    };
+    return new Promise((resolve) => {
+      setImmediate(() => {
+        resolve(outcome);
+      });
+    });
+  }
+}
````

---

### Task 4: Which regions a place lies in: find-region

Prototype commit: `a79cfbc99ce7ca3b41d41f91ce64e91dcb10f789`

find-region names the regions of this server a place lies in: a point in
them, a line or an area that has something in common with them. The place
is coordinates or a map link (read as gym add reads them; a short link of
the Maps app is followed), or a name, looked up in OpenStreetMap within the
box of this server's regions only, the largest of what is found counting.
The answer is private, with a map of the place (red) and the regions found
(blue outlines) and, for a place from OpenStreetMap, its attribution. In
servers only, five uses a minute; what can be refused before anything is
searched is refused by a guard. Offered where settings.findRegion is set.

maps.place draws such a map (placeMap in src/domain/geo/static-map.ts:
everything simplified by one tolerance until the address fits, a point
alone at street level); its picture is named by what it shows. ctx.places
holds the Nominatim port; the test context a FakePlaces.


**Files:**

```
 scripts/role-auth/report.test.ts      |  15 ++--------
 scripts/role-auth/report.ts           |  10 ++-----
 src/app-context.ts                    |   3 ++
 src/app.ts                            |  16 ++++++++---
 src/commands/index.ts                 |   2 ++
 src/commands/regions/region.test.ts   |   2 ++
 src/commands/util/find-gym.test.ts    |   1 +
 src/commands/util/find-region.test.ts | 238 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/util/find-region.ts      | 240 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/geo/static-map.test.ts     |  61 +++++++++++++++++++++++++++++++++++++++
 src/domain/geo/static-map.ts          |  62 ++++++++++++++++++++++++++++++++++++++--
 src/services/image-cache.test.ts      |  33 +++++++++++++++++++++-
 src/services/image-cache.ts           |  38 +++++++++++++++++++++++--
 src/services/party-scheduler.test.ts  |  27 ++++++++++++++++++
 src/services/party-scheduler.ts       |   5 +++-
 src/services/static-maps.test.ts      |  43 +++++++++++++++++++++++++++-
 src/services/static-maps.ts           |  41 ++++++++++++++++++++++++++-
 test/support/providers.ts             |   1 +
 test/support/test-context.ts          |   3 ++
 19 files changed, 808 insertions(+), 33 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `Which regions a place lies in: find-region`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/scripts/role-auth/report.test.ts b/scripts/role-auth/report.test.ts
index a581db16a764e55464d9ff8529be07c347511806..55cf6fd8c1cbd2c3d55522287a267de314cf5dfd 100644
--- a/scripts/role-auth/report.test.ts
+++ b/scripts/role-auth/report.test.ts
@@ -159,15 +159,6 @@ describe('the mapping of legacy commands', () => {
     }
   });
 
-  it('names commands that are not built yet as later', () => {
-    for (const [legacy, becomes] of Object.entries(LEGACY_COMMANDS)) {
-      if (becomes.kind !== 'later') continue;
-      for (const command of becomes.commands) {
-        expect(built.has(command), `${legacy} -> ${command} is built now`).toBe(false);
-      }
-    }
-  });
-
   it('knows the legacy names of the spec, without regard to case', () => {
     expect(newCommandOf('meetup')).toEqual({ kind: 'slash', commands: ['/meetup'] });
     expect(newCommandOf(' Left ')).toEqual({ kind: 'slash', commands: ['/end'] });
@@ -175,7 +166,7 @@ describe('the mapping of legacy commands', () => {
     expect(newCommandOf('spawn')).toEqual({ kind: 'slash', commands: ['/wild'] });
     expect(newCommandOf('require-role')).toMatchObject({ kind: 'dropped' });
     expect(newCommandOf('counters')).toEqual({ kind: 'slash', commands: ['/counters'] });
-    expect(newCommandOf('find')).toEqual({ kind: 'later', commands: ['/find-region'] });
+    expect(newCommandOf('find')).toEqual({ kind: 'slash', commands: ['/find-region'] });
     expect(newCommandOf('toString')).toBeUndefined();
     expect(newCommandOf('nonsense')).toBeUndefined();
   });
@@ -253,9 +244,7 @@ describe('exportText and exportJson', () => {
         '  rare: not required, roles 503 -> dropped: /want and /wild take any Pokémon\n' +
         '    warning: roles are listed but none is required: they had no effect\n',
     );
-    expect(text).toContain(
-      `Server ${AWAY}\n  find: required, roles 504 -> /find-region (not built yet)\n`,
-    );
+    expect(text).toContain(`Server ${AWAY}\n  find: required, roles 504 -> /find-region\n`);
     expect(text.endsWith('\n')).toBe(true);
   });
 
diff --git a/scripts/role-auth/report.ts b/scripts/role-auth/report.ts
index 2d1cc43fb670f8be0618291082bf8b3b5c3fc8ae..a0872beeb47dffc989f0491b99b395856b31b2d7 100644
--- a/scripts/role-auth/report.ts
+++ b/scripts/role-auth/report.ts
@@ -11,16 +11,12 @@ import type { LegacyCommandRoles } from '../../src/db/repositories/role-authoriz
  * What a legacy command became:
  * - `slash`: these commands of the new bot (top-level names: Discord sets permissions per
  *   command, not per subcommand);
- * - `later`: planned for a later phase of the rewrite, not built yet;
  * - `dropped`: the new bot has nothing that does it.
  */
 export type NewCommand =
-  | { kind: 'slash'; commands: readonly string[]; note?: string }
-  | { kind: 'later'; commands: readonly string[] }
-  | { kind: 'dropped'; note: string };
+  { kind: 'slash'; commands: readonly string[]; note?: string } | { kind: 'dropped'; note: string };
 
 const slash = (...commands: string[]): NewCommand => ({ kind: 'slash', commands });
-const later = (...commands: string[]): NewCommand => ({ kind: 'later', commands });
 const dropped = (note: string): NewCommand => ({ kind: 'dropped', note });
 
 const ROLE_AUTH_GONE = "role authorization is replaced by Discord's command permissions";
@@ -109,7 +105,7 @@ export const LEGACY_COMMANDS: Readonly<Record<string, NewCommand>> = {
   rank: slash('/rank'),
   counters: slash('/counters'),
   'boss-tier': slash('/boss-tier'),
-  find: later('/find-region'),
+  find: slash('/find-region'),
   maps: slash('/maps'),
   // Staff.
   asar: slash('/admin'),
@@ -238,8 +234,6 @@ function becomesText(becomes: NewCommand | undefined): string {
   switch (becomes.kind) {
     case 'slash':
       return becomes.commands.join(', ');
-    case 'later':
-      return `${becomes.commands.join(', ')} (not built yet)`;
     case 'dropped':
       return `dropped: ${becomes.note}`;
   }
diff --git a/src/app-context.ts b/src/app-context.ts
index 202ddf79a81ede04786ea3dd842df7b81cef3e9d..387261d56a680573966f746287ed9da90ebda541 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -18,6 +18,7 @@ import type { GymAdminService } from './services/gym-admin-service.js';
 import type { GymProvider } from './services/gym-directory.js';
 import type { IssueGateway } from './services/issue-gateway.js';
 import type { PartyService } from './services/party-service.js';
+import type { PlaceSearch } from './services/place-search.js';
 import type { PokebattlerGateway } from './services/pokebattler-gateway.js';
 import type { PartyProvider } from './services/party-store.js';
 import type { PokemonFinder, PokemonNicknames } from './services/pokemon-search-service.js';
@@ -98,6 +99,8 @@ export interface AppContext {
   readonly issues: IssueGateway;
   /** Pokebattler's raid simulations, which `/counters` shows. */
   readonly pokebattler: PokebattlerGateway;
+  /** Places by name (OpenStreetMap's Nominatim), which `/find-region` looks up. */
+  readonly places: PlaceSearch;
   /** Privileged-intent features actually granted at login (may be fewer than configured). */
   features: IntentFlags;
 }
diff --git a/src/app.ts b/src/app.ts
index 3222c9bd67a0f520b5893398d016919a4e36d943..e66309a7653d21611707a269be0bac5a6cffce15 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -47,6 +47,7 @@ import { GameDataService } from './services/game-data-service.js';
 import { GoogleGeo } from './services/geo-gateway.js';
 import { GitHubIssues } from './services/issue-gateway.js';
 import { PokebattlerFight } from './services/pokebattler-gateway.js';
+import { NominatimSearch } from './services/place-search.js';
 import { GymAdminService } from './services/gym-admin-service.js';
 import { GymDirectory } from './services/gym-directory.js';
 import { GymUpkeep } from './services/gym-upkeep.js';
@@ -324,6 +325,10 @@ export async function startApp(
   });
   // Files that members attach to a command, downloaded from Discord's own hosts only.
   const attachments = new FetchAttachments({ fetch: (url, init) => fetch(url, init), log });
+  const maps = new StaticMaps(
+    config.env.GOOGLE_API_KEY,
+    new ImageCache({ dir: IMAGE_CACHE, fetch: (url, init) => fetch(url, init), log }),
+  );
   const scheduler = new PartyScheduler({
     store: parties,
     posts: partyService,
@@ -331,6 +336,7 @@ export async function startApp(
     access,
     routes: trains,
     spawns,
+    pictures: maps,
     lines,
     gateway: partyGateway,
     raidBosses,
@@ -341,10 +347,6 @@ export async function startApp(
   });
   const clickAnswers = new ClickAnswers({ log });
   const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db), log);
-  const maps = new StaticMaps(
-    config.env.GOOGLE_API_KEY,
-    new ImageCache({ dir: IMAGE_CACHE, fetch: (url, init) => fetch(url, init), log }),
-  );
   try {
     await runMigrations(db, log);
     await gameData.load();
@@ -411,6 +413,12 @@ export async function startApp(
     }),
     // Raid simulations for `/counters`, with ten minutes of memory of each answer.
     pokebattler: new PokebattlerFight({ fetch: (url, init) => fetch(url, init), log }),
+    // Places by name for `/find-region`; without settings.findRegion the command is not offered.
+    places: new NominatimSearch({
+      server: config.settings.findRegion,
+      fetch: (url, init) => fetch(url, init),
+      log,
+    }),
     features: requested,
   };
   // Read once, here: a species of `wildSpawnExceptions` that the game data does not know is
diff --git a/src/commands/index.ts b/src/commands/index.ts
index 03ca8ec5f12c8d3810a123f307b406b03534c627..43b5821827fb43e2ebca6f02f63308018c1b97df 100644
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -29,6 +29,7 @@ import { train } from './trains/train.js';
 import { bossTier } from './util/boss-tier.js';
 import { counters } from './util/counters.js';
 import { findGym } from './util/find-gym.js';
+import { findRegion } from './util/find-region.js';
 import { help } from './util/help.js';
 import { maps } from './util/maps.js';
 import { request } from './util/request.js';
@@ -92,5 +93,6 @@ export const commands: readonly CommandModule[] = [
   bossTier,
   maps,
   findGym,
+  findRegion,
   request,
 ];
diff --git a/src/commands/regions/region.test.ts b/src/commands/regions/region.test.ts
index 755535342bdc7b78dc6f9b716c3a7499a794f64b..aa4cc3bfa5a9a68254929718a4ab2f7d5024bbd0 100644
--- a/src/commands/regions/region.test.ts
+++ b/src/commands/regions/region.test.ts
@@ -295,6 +295,7 @@ describe('/bounds', () => {
         enabled: true,
         gym: () => Promise.resolve(undefined),
         region: (asked) => Promise.resolve(`var/images/regions/${asked.id}-abc.png`),
+        place: () => Promise.resolve(undefined),
         clear: () => Promise.resolve(0),
       },
     });
@@ -324,6 +325,7 @@ describe('/bounds', () => {
         enabled: true,
         gym: () => Promise.resolve(undefined),
         region: () => Promise.reject(new Error('disk full')),
+        place: () => Promise.resolve(undefined),
         clear: () => Promise.resolve(0),
       },
     });
diff --git a/src/commands/util/find-gym.test.ts b/src/commands/util/find-gym.test.ts
index 9038360125ff4791347698a670dc8dd6f3acbac4..ac2d6437e80e93939ce0f76491a350cffd762635 100644
--- a/src/commands/util/find-gym.test.ts
+++ b/src/commands/util/find-gym.test.ts
@@ -65,6 +65,7 @@ describe('/find-gym', () => {
         enabled: true,
         gym: (asked) => Promise.resolve(`var/images/gyms/${String(asked.id)}-abc.png`),
         region: () => Promise.resolve(undefined),
+        place: () => Promise.resolve(undefined),
         clear: () => Promise.resolve(0),
       },
     });
diff --git a/src/commands/util/find-region.test.ts b/src/commands/util/find-region.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2456804ddf5e81521f6dc765717c587c66bfc4fa
--- /dev/null
+++ b/src/commands/util/find-region.test.ts
@@ -0,0 +1,238 @@
+import { MessageFlags, type APIEmbed } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import {
+  fakeChatInput,
+  sent,
+  type FakeInteraction,
+} from '../../../test/support/fake-interactions.js';
+import { EAST_CHANNEL, testRegions, WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { ALICE } from '../../../test/support/parties.js';
+import { FakePlaces } from '../../../test/support/places.js';
+import { mapsFixture } from '../../../test/support/providers.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import type { Region } from '../../db/repositories/region-repository.js';
+import { InteractionRouter } from '../../discord/router.js';
+import type { Shape } from '../../domain/geo/shape.js';
+import type { GymAdminService } from '../../services/gym-admin-service.js';
+import type { RegionProvider } from '../../services/region-directory.js';
+import { findRegion, shortName } from './find-region.js';
+
+/** North: a region of another server, above West. */
+const NORTH: Region = {
+  id: 9,
+  guildId: 2,
+  channelId: '100000000000000009',
+  description: null,
+  bounds: [
+    { lat: 40.2, lon: -80.1 },
+    { lat: 40.3, lon: -80.1 },
+    { lat: 40.3, lon: -80.0 },
+    { lat: 40.2, lon: -80.0 },
+    { lat: 40.2, lon: -80.1 },
+  ],
+  forumChannelId: null,
+  summaryMessageId: null,
+};
+
+function regionsWith(regions: Region[]): RegionProvider {
+  return {
+    byId: (id) => regions.find((region) => region.id === id),
+    byChannel: (channelId) => regions.find((region) => region.channelId === channelId),
+    byForum: (forumId) => regions.find((region) => region.forumChannelId === forumId),
+    all: () => regions,
+  };
+}
+
+/** A park in West and East both, as OpenStreetMap might outline it. */
+const PARK: Shape = {
+  kind: 'area',
+  areas: [
+    {
+      outer: [
+        { lat: 40.04, lon: -80.02 },
+        { lat: 40.06, lon: -80.02 },
+        { lat: 40.06, lon: -79.98 },
+        { lat: 40.04, lon: -79.98 },
+        { lat: 40.04, lon: -80.02 },
+      ],
+      holes: [],
+    },
+  ],
+};
+
+function setup(overrides: Parameters<typeof createTestContext>[0] = {}) {
+  const places = new FakePlaces();
+  const pictures: { shape: Shape; outlines: number }[] = [];
+  const maps = {
+    ...mapsFixture(),
+    enabled: true,
+    place: (shape: Shape, outlines: readonly unknown[]) => {
+      pictures.push({ shape, outlines: outlines.length });
+      return Promise.resolve('var/images/places/abc.123.png');
+    },
+  };
+  const { ctx, entries } = createTestContext({
+    places,
+    maps,
+    regions: regionsWith([...testRegions(), NORTH]),
+    ...overrides,
+  });
+  const router = new InteractionRouter(ctx, [findRegion], []);
+  const run = async (location: string, extra: object = {}) => {
+    const interaction = fakeChatInput({
+      commandName: 'find-region',
+      userId: ALICE,
+      options: { location },
+      ...extra,
+    });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  return { ctx, entries, places, pictures, router, run };
+}
+
+function told(used: FakeInteraction): string | undefined {
+  for (const mock of [used.followUp, used.editReply, used.reply]) {
+    if (mock.mock.calls.length > 0) return sent(mock).content;
+  }
+  throw new Error('nothing was answered');
+}
+
+function embedOf(used: FakeInteraction): APIEmbed {
+  const embed = (sent(used.editReply).embeds as APIEmbed[] | undefined)?.[0];
+  if (!embed) throw new Error('no embed was answered');
+  return embed;
+}
+
+describe('/find-region: the command', () => {
+  it('exists only where place search is set up, for members of servers', () => {
+    const { ctx } = createTestContext();
+    expect(findRegion.enabled?.(ctx.config)).toBe(true);
+    const { findRegion: _off, ...without } = ctx.config.settings;
+    expect(findRegion.enabled?.({ ...ctx.config, settings: without })).toBe(false);
+    const json = findRegion.data.toJSON();
+    expect(json.default_member_permissions).toBeUndefined();
+    expect(json.contexts).toBeUndefined();
+    expect(findRegion.defer).toBe('ephemeral');
+    expect(findRegion.throttle).toEqual({ uses: 5, perSeconds: 60 });
+  });
+});
+
+describe('/find-region: a place by name', () => {
+  it('names the regions of this server it lies in, with a map and the attribution', async () => {
+    const made = setup();
+    made.places.found.set('big park', [
+      { name: 'Little Garden', shape: { kind: 'point', point: { lat: 40.05, lon: -80.05 } } },
+      { name: 'Big Park, Pinewood', shape: PARK },
+    ]);
+    const used = await made.run('Big Park');
+    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    // Searched within the box of this server's regions only, not North's.
+    expect(made.places.asked).toEqual([
+      { text: 'Big Park', box: { south: 40, north: 40.1, west: -80.1, east: -79.9 } },
+    ]);
+    expect(embedOf(used)).toEqual({
+      description:
+        '**Big Park, Pinewood** (the largest of 2 places by that name) lies wholly or partly ' +
+        `in <#${WEST_CHANNEL}>, <#${EAST_CHANNEL}>.`,
+      image: { url: 'attachment://abc.123.png' },
+      footer: { text: '© OpenStreetMap contributors' },
+    });
+    expect(sent(used.editReply).files).toEqual(['var/images/places/abc.123.png']);
+    expect(made.pictures).toEqual([{ shape: PARK, outlines: 2 }]);
+    expect(JSON.stringify(made.entries)).not.toContain('Big Park');
+  });
+
+  it('names a place by the first three parts of its name', async () => {
+    const made = setup();
+    made.places.found.set('schenley park', [
+      {
+        name: 'Schenley Park, Squirrel Hill North, Pittsburgh, Allegheny County, Pennsylvania, 15213',
+        shape: PARK,
+      },
+    ]);
+    expect(embedOf(await made.run('Schenley Park')).description).toMatch(
+      /^\*\*Schenley Park, Squirrel Hill North, Pittsburgh\*\* lies wholly or partly in /,
+    );
+  });
+
+  it('falls back to the whole name, then to "this place"', () => {
+    expect(shortName('Big Park, Pinewood')).toBe('Big Park, Pinewood');
+    expect(shortName(' , ,')).toBe(', ,');
+    expect(shortName('   ')).toBe('this place');
+    expect(shortName('')).toBe('this place');
+  });
+
+  it('says so when nothing is found, or it lies in no region', async () => {
+    const made = setup();
+    expect(told(await made.run('Nowhere Lane'))).toBe(
+      'I found no place called **Nowhere Lane** in or near this server’s regions.',
+    );
+    made.places.found.set('edge', [
+      { name: 'Edge', shape: { kind: 'point', point: { lat: 40.099, lon: -79.85 } } },
+    ]);
+    expect(embedOf(await made.run('Edge')).description).toBe(
+      '**Edge** lies in none of this server’s regions.',
+    );
+  });
+
+  it('says so when the search fails or is busy', async () => {
+    const made = setup();
+    made.places.failing = { ok: false, reason: 'busy' };
+    expect(told(await made.run('Park'))).toBe(
+      'Many places are being looked up just now. Please try again in a minute.',
+    );
+    made.places.failing = { ok: false, reason: 'paused' };
+    expect(told(await made.run('Park'))).toBe(
+      'Nominatim asked me to wait; please try again later.',
+    );
+    made.places.failing = { ok: false, reason: 'timeout' };
+    expect(told(await made.run('Park'))).toBe(
+      'The search for places did not answer just now. Please try again later.',
+    );
+  });
+});
+
+describe('/find-region: coordinates and links', () => {
+  it('reads coordinates without searching, and answers without the map when there is none', async () => {
+    const made = setup({ maps: mapsFixture() });
+    const used = await made.run('40.05, -80.05');
+    expect(made.places.asked).toEqual([]);
+    expect(embedOf(used)).toEqual({ description: `**40.05, -80.05** lies in <#${WEST_CHANNEL}>.` });
+    expect(sent(used.editReply).files).toEqual([]);
+  });
+
+  it('follows a short link of the Maps app', async () => {
+    const gymAdmin = {
+      readLocation: () =>
+        Promise.resolve({ kind: 'point', point: { lat: 40.05, lon: -79.95 }, approximate: true }),
+    } as unknown as GymAdminService;
+    const made = setup({ gymAdmin });
+    const used = await made.run('https://maps.app.goo.gl/abcdef');
+    expect(embedOf(used).description).toBe(
+      `**40.05, -79.95** (where the map of the link was centred) lies in <#${EAST_CHANNEL}>.`,
+    );
+  });
+
+  it('refuses what is no place before anything is counted', async () => {
+    const made = setup();
+    expect(told(await made.run('95.5, 200.5'))).toMatch(
+      /^Those coordinates are no place on earth\./,
+    );
+    expect(told(await made.run('https://example.test/somewhere'))).toMatch(
+      /^I cannot read a place from that link\./,
+    );
+    expect(told(await made.run('   '))).toBe(
+      'Say which place: its name, its coordinates or a link.',
+    );
+    expect(made.places.asked).toEqual([]);
+  });
+
+  it('refuses in a server without regions, and in a DM', async () => {
+    const made = setup({ regions: regionsWith([NORTH]) });
+    expect(told(await made.run('Park'))).toBe('This server has no regions with an outline.');
+    expect(told(await made.run('Park', { isDm: true, guildId: null }))).toBe(
+      'This only works in a server.',
+    );
+  });
+});
diff --git a/src/commands/util/find-region.ts b/src/commands/util/find-region.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7a7506040cdc574e60ba72f52b5906c665afebda
--- /dev/null
+++ b/src/commands/util/find-region.ts
@@ -0,0 +1,240 @@
+import { basename } from 'node:path';
+import { SlashCommandBuilder, type APIEmbed, type ChatInputCommandInteraction } from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { Region } from '../../db/repositories/region-repository.js';
+import type { Guard, SimpleCommand } from '../../discord/command.js';
+import { UserError } from '../../discord/errors.js';
+import { requireGuild } from '../../discord/guards.js';
+import type { Throttle } from '../../discord/throttle.js';
+import type { LatLon } from '../../domain/geo/lat-lon.js';
+import { LOCATION_FORMS, readLocation } from '../../domain/geo/location-input.js';
+import { regionsBox, regionsTouching, type Shape } from '../../domain/geo/shape.js';
+import { fitItems, LIMITS, plainNoLinks, truncate } from '../../render/text.js';
+import type { PlaceOutcome } from '../../services/place-search.js';
+import { serverOf } from './server-gym.js';
+
+/** A search of an outside service, with a map: five in a minute. */
+export const FIND_REGION_THROTTLE: Throttle = { uses: 5, perSeconds: 60 };
+
+/** The longest place a member may type. */
+export const MAX_LOCATION = 200;
+
+/** OpenStreetMap's licence asks that what comes from it says so. */
+export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
+
+/** The regions of the server that have an outline, oldest first. */
+async function serverRegions(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+): Promise<Region[]> {
+  const guildRow = await serverOf(interaction, ctx);
+  const regions =
+    guildRow === undefined
+      ? []
+      : ctx.regions.all().filter((region) => region.guildId === guildRow && region.bounds !== null);
+  if (regions.length === 0) throw new UserError('This server has no regions with an outline.');
+  return regions;
+}
+
+/** What the member typed, which must say something. */
+function typedLocation(interaction: ChatInputCommandInteraction): string {
+  const text = interaction.options.getString('location', true).trim();
+  if (text === '') throw new UserError('Say which place: its name, its coordinates or a link.');
+  if (text.length > MAX_LOCATION) {
+    throw new UserError(`A place has at most ${String(MAX_LOCATION)} characters.`);
+  }
+  return text;
+}
+
+/** A place that was read from what was typed, or searched for by its name. */
+type Reading =
+  { kind: 'point'; point: LatLon; approximate: boolean } | { kind: 'link' } | { kind: 'name' };
+
+/** Coordinates and links are read; a text that is neither is a name to search for. */
+function readTyped(text: string): Reading {
+  const reading = readLocation(text);
+  switch (reading.kind) {
+    case 'point':
+      return { kind: 'point', point: reading.point, approximate: reading.approximate === true };
+    case 'short-link':
+      return { kind: 'link' };
+    case 'out-of-range':
+      throw new UserError(`Those coordinates are no place on earth. ${LOCATION_FORMS}`);
+    case 'unreadable':
+      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
+        throw new UserError(`I cannot read a place from that link. ${LOCATION_FORMS}`);
+      }
+      return { kind: 'name' };
+  }
+}
+
+/**
+ * What can be known before anything is searched or downloaded is refused here, before the
+ * answer is deferred and before the use counts.
+ */
+const requireFindable: Guard = async (interaction, ctx) => {
+  if (!interaction.isChatInputCommand()) return;
+  readTyped(typedLocation(interaction));
+  await serverRegions(interaction, ctx);
+};
+
+/** What the member is told when the search gave nothing. */
+function failureText(outcome: Extract<PlaceOutcome, { ok: false }>): string {
+  switch (outcome.reason) {
+    case 'busy':
+      return 'Many places are being looked up just now. Please try again in a minute.';
+    case 'paused':
+      return 'Nominatim asked me to wait; please try again later.';
+    case 'disabled':
+      return 'Looking up places by name is not set up here. Give coordinates or a map link.';
+    case 'refused':
+    case 'timeout':
+    case 'unreachable':
+    case 'too-large':
+    case 'unreadable':
+      return 'The search for places did not answer just now. Please try again later.';
+  }
+}
+
+/** Where the place is, and what it is called in the answer (`label`, Markdown that shows as it is). */
+async function placeOf(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  text: string,
+  regions: readonly Region[],
+): Promise<{ label: string; shape: Shape; approximate: boolean; fromOsm: boolean }> {
+  const reading = readTyped(text);
+  if (reading.kind === 'point') {
+    return {
+      label: `**${String(reading.point.lat)}, ${String(reading.point.lon)}**`,
+      shape: { kind: 'point', point: reading.point },
+      approximate: reading.approximate,
+      fromOsm: false,
+    };
+  }
+  if (reading.kind === 'link') {
+    const followed = await ctx.gymAdmin.readLocation(text);
+    if (followed.kind !== 'point') {
+      throw new UserError(`I could not follow that link to a place. ${LOCATION_FORMS}`);
+    }
+    return {
+      label: `**${String(followed.point.lat)}, ${String(followed.point.lon)}**`,
+      shape: { kind: 'point', point: followed.point },
+      approximate: followed.approximate,
+      fromOsm: false,
+    };
+  }
+  const box = regionsBox(regions);
+  if (!box) throw new UserError('This server has no regions with an outline.');
+  const outcome = await ctx.places.search(text, box);
+  if (!outcome.ok) throw new UserError(failureText(outcome));
+  const found = outcome.place;
+  if (!found) {
+    throw new UserError(
+      `I found no place called **${plainNoLinks(truncate(text, 80))}** in or near this ` +
+        'server’s regions.',
+    );
+  }
+  ctx.log.info(
+    { member: interaction.user.id, found: outcome.found, kind: found.shape.kind },
+    'a member looked up the regions of a place',
+  );
+  return {
+    label:
+      `**${plainNoLinks(truncate(shortName(found.name), 200))}**` +
+      (outcome.found > 1 ? ` (the largest of ${String(outcome.found)} places by that name)` : ''),
+    shape: found.shape,
+    approximate: false,
+    fromOsm: true,
+  };
+}
+
+/**
+ * A place as OpenStreetMap names it, by its first three parts: "Schenley Park, Squirrel Hill
+ * North, Pittsburgh" of a name that goes on to the county, the state and the post code. A name
+ * without parts is shown whole, and a blank one as "this place".
+ */
+export function shortName(name: string): string {
+  const short = name
+    .split(',')
+    .map((part) => part.trim())
+    .filter((part) => part !== '')
+    .slice(0, 3)
+    .join(', ');
+  if (short !== '') return short;
+  const whole = name.trim();
+  return whole === '' ? 'this place' : whole;
+}
+
+/** The sentence of the answer. */
+function answerText(
+  label: string,
+  shape: Shape,
+  found: readonly Region[],
+  approximate: boolean,
+): string {
+  const place = label;
+  const where = approximate ? ' (where the map of the link was centred)' : '';
+  if (found.length === 0) return `${place}${where} lies in none of this server’s regions.`;
+  const channels = fitItems(
+    found.map((region) => `<#${region.channelId}>`),
+    LIMITS.embedDescription - 400,
+  );
+  return shape.kind === 'point'
+    ? `${place}${where} lies in ${channels}.`
+    : `${place} lies wholly or partly in ${channels}.`;
+}
+
+/**
+ * `/find-region` (spec row 200, the legacy `!find`): which of this server's regions a place
+ * lies in. The place is coordinates or a map link (read as `/gym add` reads them), or a name,
+ * looked up in OpenStreetMap (Nominatim) among the places of the area the regions cover. The
+ * answer names the region channels and shows a map of the place with them; for the member
+ * alone. Offered where `settings.findRegion` is set.
+ */
+export const findRegion: SimpleCommand = {
+  data: new SlashCommandBuilder()
+    .setName('find-region')
+    .setDescription('Which regions a place lies in')
+    .addStringOption((option) =>
+      option
+        .setName('location')
+        .setDescription('A place name, coordinates, or a link from a maps app')
+        .setRequired(true)
+        .setMaxLength(MAX_LOCATION),
+    ),
+  help: {
+    category: 'util',
+    details:
+      'Says which of this server’s regions a place lies in, with a map of the place and those ' +
+      'regions. Name the place (a park, a street, a town: it is looked up in OpenStreetMap ' +
+      'within the area of the regions), or give its coordinates or a link to it from a maps ' +
+      'app. Only you see the answer.',
+    examples: ['/find-region location:Schenley Park', '/find-region location:40.4406, -79.9959'],
+  },
+  enabled: (config) => config.settings.findRegion !== undefined,
+  guards: [requireGuild, requireFindable],
+  defer: 'ephemeral',
+  throttle: FIND_REGION_THROTTLE,
+  async execute(interaction, ctx) {
+    const text = typedLocation(interaction);
+    const regions = await serverRegions(interaction, ctx);
+    const place = await placeOf(interaction, ctx, text, regions);
+    const found = regionsTouching(place.shape, regions);
+    const map = await ctx.maps
+      .place(
+        place.shape,
+        found.flatMap((region) => (region.bounds ? [region.bounds] : [])),
+      )
+      .catch((err: unknown) => {
+        ctx.log.warn({ err }, 'could not get the map of a place');
+        return undefined;
+      });
+    const embed: APIEmbed = {
+      description: answerText(place.label, place.shape, found, place.approximate),
+      ...(map === undefined ? {} : { image: { url: `attachment://${basename(map)}` } }),
+      ...(place.fromOsm ? { footer: { text: OSM_ATTRIBUTION } } : {}),
+    };
+    await interaction.editReply({ embeds: [embed], files: map === undefined ? [] : [map] });
+  },
+};
diff --git a/src/domain/geo/static-map.test.ts b/src/domain/geo/static-map.test.ts
index 3fc5962a02b98c769bdadd166b5d1c1ebe216fd0..8dc7fe98094ea6ec86af5323bf13b5263c7f05f2 100644
--- a/src/domain/geo/static-map.test.ts
+++ b/src/domain/geo/static-map.test.ts
@@ -4,6 +4,8 @@ import {
   MAX_STATIC_MAP_QUERY,
   STATIC_MAP_ENDPOINT,
   gymMap,
+  MAX_PLACE_PARTS,
+  placeMap,
   regionMap,
   staticMapQuery,
 } from './static-map.js';
@@ -157,3 +159,62 @@ describe('regionMap with a long outline', () => {
     expect(map.paths?.[0]?.points.length).toBeGreaterThan(3);
   });
 });
+
+describe('placeMap', () => {
+  const params = (query: string) => new URLSearchParams(query);
+  const ring = (lat: number, lon: number, corners: number, radius = 0.05) => {
+    const points = Array.from({ length: corners }, (_unused, i) => ({
+      lat: lat + radius * Math.sin((2 * Math.PI * i) / corners),
+      lon: lon + radius * Math.cos((2 * Math.PI * i) / corners),
+    }));
+    return [...points, { ...(points[0] ?? { lat, lon }) }];
+  };
+
+  it('draws a place in red and the regions it lies in in blue', () => {
+    const query = params(
+      staticMapQuery(placeMap({ kind: 'area', areas: [{ outer: square, holes: [] }] }, [square])),
+    );
+    expect(query.getAll('path')).toEqual([
+      `fillcolor:0xAA000033|color:red|weight:2|enc:${encodePolyline(square)}`,
+      `color:0x1E50D0|weight:2|enc:${encodePolyline(square)}`,
+    ]);
+    expect(query.has('zoom')).toBe(false);
+  });
+
+  it('pins a point, at street level when no region is drawn', () => {
+    const point = { lat: 40.05, lon: -80.05 };
+    const alone = params(staticMapQuery(placeMap({ kind: 'point', point }, [])));
+    expect(alone.get('markers')).toBe('size:small|color:red|40.05,-80.05');
+    expect(alone.get('zoom')).toBe('15');
+    const withRegion = params(staticMapQuery(placeMap({ kind: 'point', point }, [square])));
+    expect(withRegion.has('zoom')).toBe(false);
+    expect(withRegion.getAll('path')).toHaveLength(1);
+  });
+
+  it('simplifies a large place and its regions together until the address fits', () => {
+    const lines = [ring(40, -80, 3_000), ring(40.2, -80, 3_000)];
+    const map = placeMap({ kind: 'line', lines }, [ring(40.1, -80, 5_000, 0.3)]);
+    expect(staticMapQuery(map).length).toBeLessThanOrEqual(MAX_STATIC_MAP_QUERY);
+    expect(map.paths).toHaveLength(3);
+    expect(map.paths?.[2]?.colour).toBe('blue');
+  });
+
+  it('draws the largest parts of a place when it has more than the limit', () => {
+    const small = Array.from({ length: MAX_PLACE_PARTS }, (_unused, i) => ({
+      outer: ring(40 + i / 10, -80, 8, 0.01),
+      holes: [],
+    }));
+    const large = { outer: ring(45, -80, 8, 0.5), holes: [] };
+    const map = placeMap({ kind: 'area', areas: [...small, large] }, []);
+    expect(map.paths).toHaveLength(MAX_PLACE_PARTS);
+    expect(map.paths?.[0]?.points).toEqual(large.outer);
+  });
+
+  it('draws no more parts of a place than the limit', () => {
+    const areas = Array.from({ length: MAX_PLACE_PARTS + 5 }, (_unused, i) => ({
+      outer: ring(40 + i / 10, -80, 8, 0.01),
+      holes: [],
+    }));
+    expect(placeMap({ kind: 'area', areas }, []).paths).toHaveLength(MAX_PLACE_PARTS);
+  });
+});
diff --git a/src/domain/geo/static-map.ts b/src/domain/geo/static-map.ts
index 07612d1c4d35b5f275161cfc2b6c467f25101ed2..0533f3c1d1e289ca3d7e03b88308f9934e815ae1 100644
--- a/src/domain/geo/static-map.ts
+++ b/src/domain/geo/static-map.ts
@@ -1,5 +1,6 @@
 import type { LatLon } from './lat-lon.js';
 import { encodePolyline } from './polyline.js';
+import { shapeSize, type Shape } from './shape.js';
 import { simplifyLine } from './simplify.js';
 
 export const STATIC_MAP_ENDPOINT = 'https://maps.googleapis.com/maps/api/staticmap';
@@ -12,10 +13,14 @@ export const MAX_STATIC_MAP_QUERY = 15_000;
 /** The finest simplification tried for a picture: a hundred-thousandth of a degree, about a metre. */
 const FINEST_TOLERANCE = 1e-5;
 
-/** A line or outline drawn on the map in red; `fill` shades the inside of a closed outline. */
+/**
+ * A line or outline drawn on the map, in red unless `colour` says blue; `fill` shades the inside
+ * of a closed outline.
+ */
 export interface MapPath {
   points: readonly LatLon[];
   fill?: boolean;
+  colour?: 'red' | 'blue';
 }
 
 export interface StaticMap {
@@ -38,7 +43,10 @@ export function staticMapQuery(map: StaticMap): string {
     params.append('markers', `size:small|color:red|${pins}`);
   }
   for (const path of map.paths ?? []) {
-    const style = path.fill ? 'fillcolor:0xAA000033|color:red|weight:2' : 'color:red|weight:2';
+    const colour = path.colour === 'blue' ? '0x1E50D0' : 'red';
+    const style = path.fill
+      ? `fillcolor:0xAA000033|color:${colour}|weight:2`
+      : `color:${colour}|weight:2`;
     params.append('path', `${style}|enc:${encodePolyline(path.points)}`);
   }
   return params.toString();
@@ -68,3 +76,53 @@ export function regionMap(bounds: readonly LatLon[]): StaticMap {
   // No tolerance left more than the two ends of the line, and they still do not fit: cannot be.
   return mapOf(bounds.slice(0, 1));
 }
+
+/** How many parts of a place a picture draws at most: a place of many parts is shown by its first. */
+export const MAX_PLACE_PARTS = 20;
+
+/**
+ * The map of a place and the regions it lies in (`/find-region`): the place in red (an area
+ * shaded, a line drawn, a point a pin), the outlines of the regions in blue. Everything is
+ * simplified by one tolerance, the smallest with which the address fits, as for a region; a
+ * point alone is shown at street level. A place with nothing to draw (no part, no region) is a
+ * map without content: `hasContent` says whether a map shows anything.
+ */
+export function placeMap(shape: Shape, outlines: readonly (readonly LatLon[])[]): StaticMap {
+  // Of a place of many parts the largest are drawn: they are what the picture is about.
+  const largest = <T>(parts: readonly T[], size: (part: T) => number): T[] =>
+    [...parts].sort((a, b) => size(b) - size(a)).slice(0, MAX_PLACE_PARTS);
+  const place: MapPath[] =
+    shape.kind === 'line'
+      ? largest(shape.lines, (line) => shapeSize({ kind: 'line', lines: [line] })).map(
+          (points) => ({ points }),
+        )
+      : shape.kind === 'area'
+        ? largest(shape.areas, (area) => shapeSize({ kind: 'area', areas: [area] })).map(
+            (area) => ({ points: area.outer, fill: true }),
+          )
+        : [];
+  const regions: MapPath[] = outlines.map((points) => ({ points, colour: 'blue' }));
+  const markers = shape.kind === 'point' ? [shape.point] : [];
+  const mapOf = (tolerance: number): StaticMap => ({
+    ...(markers.length > 0 ? { markers } : {}),
+    ...(markers.length > 0 && regions.length === 0 ? { zoom: 15 } : {}),
+    paths: [...place, ...regions].map((path) => ({
+      ...path,
+      points: tolerance === 0 ? path.points : simplifyLine(path.points, tolerance),
+    })),
+  });
+  const fits = (map: StaticMap): boolean => staticMapQuery(map).length <= MAX_STATIC_MAP_QUERY;
+  const whole = mapOf(0);
+  if (fits(whole)) return whole;
+  for (let tolerance = FINEST_TOLERANCE; tolerance < 360; tolerance *= 2) {
+    const map = mapOf(tolerance);
+    if (fits(map)) return map;
+  }
+  // Even two points a path do not fit: the pins alone, or nothing.
+  return markers.length > 0 ? { markers, zoom: 15 } : {};
+}
+
+/** Whether a map shows anything: a pin or a path. A map without either is not downloaded. */
+export function hasContent(map: StaticMap): boolean {
+  return (map.markers?.length ?? 0) > 0 || (map.paths?.length ?? 0) > 0;
+}
diff --git a/src/services/image-cache.test.ts b/src/services/image-cache.test.ts
index e1b1c742e94daa6f20ea38686ceb5fc7053d1317..2900245f93a0518a588560db696cda5c05b2667c 100644
--- a/src/services/image-cache.test.ts
+++ b/src/services/image-cache.test.ts
@@ -1,4 +1,4 @@
-import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
+import { mkdtemp, readFile, readdir, rename, rm, utimes, writeFile } from 'node:fs/promises';
 import { tmpdir } from 'node:os';
 import path from 'node:path';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
@@ -291,6 +291,37 @@ describe('ImageCache.get', () => {
   );
 });
 
+describe('ImageCache.removeOlder', () => {
+  it('writes the time anew of a picture asked for with touch, so that it is not removed', async () => {
+    const { cache } = cacheWith(() => Promise.resolve(response()));
+    const ask = request({ folder: 'places', id: 'a', touch: true });
+    const file = await cache.get(ask);
+    const dayAgo = (Date.now() - 86_400_000 - 60_000) / 1000;
+    await utimes(file ?? '', dayAgo, dayAgo);
+    expect(await cache.get(ask)).toBe(file);
+    expect(calls).toHaveLength(1);
+    expect(await cache.removeOlder('places', Date.now() - 86_400_000)).toBe(0);
+    // Without touch a picture served from disk keeps its time.
+    await utimes(file ?? '', dayAgo, dayAgo);
+    await cache.get({ ...ask, touch: undefined });
+    expect(await cache.removeOlder('places', Date.now() - 86_400_000)).toBe(1);
+  });
+
+  it('deletes the pictures of a folder last written before the time given, and no others', async () => {
+    const { cache } = cacheWith(() => Promise.resolve(response()));
+    const old = await cache.get(request({ folder: 'places', id: 'a' }));
+    const fresh = await cache.get(request({ folder: 'places', id: 'b' }));
+    const gym = await cache.get(request({ id: 'c' }));
+    const dayAgo = (Date.now() - 86_400_000 - 60_000) / 1000;
+    for (const file of [old, gym]) await utimes(file ?? '', dayAgo, dayAgo);
+    expect(await cache.removeOlder('places', Date.now() - 86_400_000)).toBe(1);
+    expect(await readdir(path.join(dir, 'places'))).toEqual([path.basename(fresh ?? '')]);
+    expect(await readdir(path.join(dir, 'gyms'))).toEqual([path.basename(gym ?? '')]);
+    expect(await cache.removeOlder('missing', Date.now())).toBe(0);
+    await expect(cache.removeOlder('../x', Date.now())).rejects.toThrow(RangeError);
+  });
+});
+
 describe('ImageCache.clear', () => {
   it('deletes the pictures of one folder or of all', async () => {
     const { cache } = cacheWith(() => Promise.resolve(response()));
diff --git a/src/services/image-cache.ts b/src/services/image-cache.ts
index f2abc187a9e5c29c5fdb2a9f306d7c6a5fa07415..bb22772019fd68386d920d4a18597135d5c80407 100644
--- a/src/services/image-cache.ts
+++ b/src/services/image-cache.ts
@@ -1,5 +1,5 @@
 import { createHash } from 'node:crypto';
-import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
+import { mkdir, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
 import path from 'node:path';
 import type { Logger } from '../log.js';
 import { failureReason } from './failure-reason.js';
@@ -43,6 +43,11 @@ export interface ImageRequest {
   url: string;
   /** A reason to refuse an otherwise good response, or undefined to accept it. */
   refuse?: (response: ImageResponse) => string | undefined;
+  /**
+   * A picture served from disk is written the time anew, so that `removeOlder` counts from when
+   * it was last asked for (the pictures of places), not from when it was downloaded.
+   */
+  touch?: boolean | undefined;
 }
 
 const FOLDER = /^[a-z0-9-]+$/;
@@ -117,6 +122,28 @@ export class ImageCache {
     return deleted;
   }
 
+  /**
+   * Deletes the pictures of one folder that were last written before `before` (epoch ms), and
+   * gives how many. A picture that is downloaded again is written anew.
+   */
+  async removeOlder(folder: string, before: number): Promise<number> {
+    if (!FOLDER.test(folder)) throw new RangeError(`Bad image folder: ${folder}`);
+    const dir = path.resolve(this.options.dir, folder);
+    let deleted = 0;
+    for (const file of await this.list(dir)) {
+      if (!file.endsWith('.png')) continue;
+      const at = path.join(dir, file);
+      try {
+        if ((await stat(at)).mtimeMs >= before) continue;
+        await rm(at, { force: true });
+        deleted += 1;
+      } catch {
+        // Gone meanwhile, or held by another program: left for the next time.
+      }
+    }
+    return deleted;
+  }
+
   private async list(dir: string): Promise<string[]> {
     try {
       return await readdir(dir);
@@ -128,7 +155,14 @@ export class ImageCache {
   private async provide(file: string, request: ImageRequest): Promise<string | undefined> {
     const what = { folder: request.folder, id: request.id };
     try {
-      if ((await stat(file)).size > 0) return file;
+      if ((await stat(file)).size > 0) {
+        if (request.touch) {
+          const now = new Date();
+          // A time that cannot be written costs only an early download again.
+          await utimes(file, now, now).catch(() => undefined);
+        }
+        return file;
+      }
     } catch {
       // Not on disk yet.
     }
diff --git a/src/services/party-scheduler.test.ts b/src/services/party-scheduler.test.ts
index 5e448a0ea8a348ec9a4277ef802fdd607be26fd8..401e91a087bf4dff8481148a1cc10bbf8306da1e 100644
--- a/src/services/party-scheduler.test.ts
+++ b/src/services/party-scheduler.test.ts
@@ -588,6 +588,33 @@ describe('PartyScheduler: running', () => {
     expect(looked).toHaveBeenCalledTimes(2);
   });
 
+  it('has old pictures of places deleted with the upkeep', async () => {
+    const made = await reportedRaid();
+    let pruned = 0;
+    const { PartyScheduler } = await import('./party-scheduler.js');
+    const scheduler = new PartyScheduler({
+      store: made.store,
+      posts: made.service,
+      attendance: made.attendance,
+      pictures: {
+        prunePlaces: () => {
+          pruned += 1;
+          return Promise.resolve(0);
+        },
+      },
+      lines: made.lines,
+      gateway: made.gateway,
+      raidBosses: { autoset: () => undefined },
+      settings: made.settings,
+      log: made.log,
+      now: () => made.clock.now,
+      upkeepMs: 0,
+    });
+    await scheduler.tick();
+    await scheduler.whenIdle();
+    expect(pruned).toBe(1);
+  });
+
   it('has the standing spawn reports swept with the forums, also when another step fails', async () => {
     const made = await reportedRaid();
     let swept = 0;
diff --git a/src/services/party-scheduler.ts b/src/services/party-scheduler.ts
index b303e093defea14a91f72a4a383a7e58c38162d7..4ef2808bb612a1849148c740fb17f30bbaaeb2b1 100644
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -39,6 +39,8 @@ export interface PartySchedulerOptions {
   routes?: { removeUnknownStops(): Promise<unknown> };
   /** The spawn reports that still stand, swept with the forums (`SpawnService.sweep`). */
   spawns?: { sweep(): Promise<unknown> };
+  /** The map pictures of places, of which those older than a day go with the upkeep. */
+  pictures?: { prunePlaces(): Promise<unknown> };
   lines: Pick<PartyLines, 'say'>;
   gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage'>;
   raidBosses: Pick<RaidBossProvider, 'autoset'>;
@@ -215,7 +217,7 @@ export class PartyScheduler {
    * hourly.
    */
   private upkeep(): void {
-    const { posts, access, routes, spawns, log } = this.options;
+    const { posts, access, routes, spawns, pictures, log } = this.options;
     this.lastUpkeep = this.now();
     // Each by itself: one that fails does not keep the others from running.
     const step = async (work: () => Promise<unknown>): Promise<void> => {
@@ -231,6 +233,7 @@ export class PartyScheduler {
       if (access) await step(() => access.sweep());
       if (routes) await step(() => routes.removeUnknownStops());
       if (spawns) await step(() => spawns.sweep());
+      if (pictures) await step(() => pictures.prunePlaces());
     })()
       .catch((err: unknown) => {
         log.error({ err }, 'the upkeep of the forums failed');
diff --git a/src/services/static-maps.test.ts b/src/services/static-maps.test.ts
index c6fbb0120f7a56d476b59c84155448ec61184209..79bbd5a93861dd3519e73c3b1bca38995975a106 100644
--- a/src/services/static-maps.test.ts
+++ b/src/services/static-maps.test.ts
@@ -1,4 +1,4 @@
-import { mkdtemp, rm } from 'node:fs/promises';
+import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
 import { tmpdir } from 'node:os';
 import path from 'node:path';
 import { afterEach, beforeEach, describe, expect, it } from 'vitest';
@@ -79,6 +79,47 @@ describe('StaticMaps', () => {
     expect(new URL(urls[0] ?? '').searchParams.get('path')).toMatch(/^fillcolor:0xAA000033\|/);
   });
 
+  it('downloads the map of a place named by what it shows, one file per place', async () => {
+    const { maps: service } = maps('k');
+    const outline = west().bounds ?? [];
+    const point = { kind: 'point', point: { lat: 40.05, lon: -80.05 } } as const;
+    const first = await service.place(point, [outline]);
+    expect(path.dirname(first ?? '')).toBe(path.resolve(dir, 'places'));
+    expect(path.basename(first ?? '')).toMatch(/^[0-9a-f]{16}\.[0-9a-f]{12}\.png$/);
+    const query = new URL(urls[0] ?? '').searchParams;
+    expect(query.get('markers')).toBe('size:small|color:red|40.05,-80.05');
+    expect(query.get('path')).toMatch(/^color:0x1E50D0\|/);
+    expect(query.get('key')).toBe('k');
+    const second = await service.place({ ...point, point: { lat: 40.06, lon: -80.05 } }, []);
+    expect(second).not.toBe(first);
+    expect(await service.place(point, [outline])).toBe(first);
+    expect(urls).toHaveLength(2);
+    expect(await service.clear()).toBe(2);
+  });
+
+  it('downloads nothing for a place it cannot draw', async () => {
+    const { maps: service } = maps('k');
+    expect(await service.place({ kind: 'area', areas: [] }, [])).toBeUndefined();
+    expect(urls).toEqual([]);
+  });
+
+  it('deletes the pictures of places older than a day, and only those', async () => {
+    const { maps: service } = maps('k');
+    const point = { kind: 'point', point: { lat: 40.05, lon: -80.05 } } as const;
+    const old = await service.place(point, []);
+    const fresh = await service.place({ ...point, point: { lat: 40.06, lon: -80.05 } }, []);
+    const gym = await service.gym({ id: 12, lat: 40.05, lon: -80.05 });
+    const dayAgo = (Date.now() - 86_400_000 - 60_000) / 1000;
+    for (const file of [old, gym]) await utimes(file ?? '', dayAgo, dayAgo);
+    expect(await service.prunePlaces()).toBe(1);
+    // A place asked for again is kept another day.
+    await utimes(fresh ?? '', dayAgo, dayAgo);
+    await service.place({ ...point, point: { lat: 40.06, lon: -80.05 } }, []);
+    expect(await service.prunePlaces()).toBe(0);
+    expect(await readdir(path.join(dir, 'places'))).toEqual([path.basename(fresh ?? '')]);
+    expect(await readdir(path.join(dir, 'gyms'))).toHaveLength(1);
+  });
+
   it('has no map for a region without an outline', async () => {
     const { maps: service } = maps('k');
     expect(await service.region({ id: 3, bounds: null })).toBeUndefined();
diff --git a/src/services/static-maps.ts b/src/services/static-maps.ts
index 23bf3159fa5ba32eb2f8d1140383c40c8121fd9b..dbcfa97a834049847d92b5aaaca11d3f994c485f 100644
--- a/src/services/static-maps.ts
+++ b/src/services/static-maps.ts
@@ -1,7 +1,11 @@
+import { createHash } from 'node:crypto';
 import type { LatLon } from '../domain/geo/lat-lon.js';
+import type { Shape } from '../domain/geo/shape.js';
 import {
   STATIC_MAP_ENDPOINT,
   gymMap,
+  hasContent,
+  placeMap,
   regionMap,
   staticMapQuery,
   type StaticMap,
@@ -16,6 +20,11 @@ export interface MapProvider {
   gym(gym: { id: number; lat: number; lon: number }): Promise<string | undefined>;
   /** Path of a picture of the region's outline; undefined when it cannot be had. */
   region(region: { id: number; bounds: readonly LatLon[] | null }): Promise<string | undefined>;
+  /**
+   * Path of a picture of a place and the outlines of the regions it lies in (`/find-region`);
+   * undefined when it cannot be had.
+   */
+  place(shape: Shape, outlines: readonly (readonly LatLon[])[]): Promise<string | undefined>;
   /**
    * Deletes every picture that is kept (`/admin clear-image-cache`) and gives how many there
    * were. Those still in use are downloaded again when they are next asked for.
@@ -23,6 +32,9 @@ export interface MapProvider {
   clear(): Promise<number>;
 }
 
+/** How long the picture of a place is kept after it was last made. */
+const PLACE_PICTURE_MS = 86_400_000;
+
 /** Google answers a request it cannot fulfil (quota, bad key) with a picture of an error. */
 function refuseWarning(response: ImageResponse): string | undefined {
   const warning = response.headers.get('x-staticmap-api-warning');
@@ -53,11 +65,37 @@ export class StaticMaps implements MapProvider {
     return this.picture('regions', region.id, regionMap(region.bounds));
   }
 
+  /**
+   * A place has no id of its own: its picture is named by what it shows, so the same search
+   * finds the same file, and pictures of different places never replace each other (they go
+   * with `/admin clear-image-cache`).
+   */
+  place(shape: Shape, outlines: readonly (readonly LatLon[])[]): Promise<string | undefined> {
+    const map = placeMap(shape, outlines);
+    if (!hasContent(map)) return Promise.resolve(undefined);
+    const id = createHash('sha256').update(staticMapQuery(map)).digest('hex').slice(0, 16);
+    // Served again, it is kept another day (`prunePlaces` counts from its last use).
+    return this.picture('places', id, map, true);
+  }
+
   clear(): Promise<number> {
     return this.cache.clear();
   }
 
-  private picture(folder: string, id: number, map: StaticMap): Promise<string | undefined> {
+  /**
+   * Deletes the pictures of places not made again for a day (with the hourly upkeep): unlike a
+   * gym's or a region's, which a new one replaces, they would only pile up.
+   */
+  prunePlaces(): Promise<number> {
+    return this.cache.removeOlder('places', Date.now() - PLACE_PICTURE_MS);
+  }
+
+  private picture(
+    folder: string,
+    id: number | string,
+    map: StaticMap,
+    touch = false,
+  ): Promise<string | undefined> {
     if (!this.enabled) return Promise.resolve(undefined);
     const query = staticMapQuery(map);
     return this.cache.get({
@@ -66,6 +104,7 @@ export class StaticMaps implements MapProvider {
       variant: query,
       url: `${STATIC_MAP_ENDPOINT}?${query}&key=${encodeURIComponent(this.apiKey ?? '')}`,
       refuse: refuseWarning,
+      ...(touch ? { touch } : {}),
     });
   }
 }
diff --git a/test/support/providers.ts b/test/support/providers.ts
index 08f7a050211d235dfc632e5c159ad2abf5b51170..81a5b8f5d20bf8f273202748197c0fa9b819df6b 100644
--- a/test/support/providers.ts
+++ b/test/support/providers.ts
@@ -50,6 +50,7 @@ export function mapsFixture(): MapProvider {
     enabled: false,
     gym: () => Promise.resolve(undefined),
     region: () => Promise.resolve(undefined),
+    place: () => Promise.resolve(undefined),
     clear: () => Promise.resolve(0),
   };
 }
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index 28a72af5a48541ebda538bb6f01b1d62426e5c37..1dc5fd11b0fe986a50f93a6e0317d9455a356370 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -23,6 +23,7 @@ import { MemoryNewTrains } from './new-trains.js';
 import { noParties } from './parties.js';
 import { FakeIssues } from './issues.js';
 import { FakePokebattler } from './pokebattler.js';
+import { FakePlaces } from './places.js';
 import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
 import { raidBossesFixture } from './raid-bosses.js';
 import { raidEventsFixture } from './raid-events.js';
@@ -129,6 +130,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     issues: new FakeIssues(),
     // Every simulation is asked of a fake that answers the sample for Mewtwo; a test passes its own.
     pokebattler: new FakePokebattler(),
+    // No place is found by name; a test passes its own with places.
+    places: new FakePlaces(),
     features: { ocrPassive: false, autoAssignRole: false },
     ...overrides,
   };
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto/phase-6b HEAD -- src test scripts` prints nothing; `npm run check`, `npm run build` and `npm run test:db`, each once and one after the other.
2. Whole-branch review (Opus, high effort); one fix wave if it finds something.
3. `CLAUDE.md` (status: Phase 6 built; conventions for `ctx.pokebattler`, `ctx.places`, `src/domain/counters/`, `shape.ts`, `ctx.maps.place`), the follow-ups ("From Phase 6B"), the Gantt chart and memory.

## Staging checklist (with Matt, on the test application and server)

Nothing of this plan has touched Discord, Pokebattler or Nominatim. Each step needs Matt's go-ahead. `npm run deploy-commands -- --guild <test server>` first (two new commands; a `/settings` subcommand). `settings.findRegion` (with a User-Agent that names the bot and a contact) must be set for `/find-region`.

- [ ] `/counters` in a raid's post of a current T5 boss: public, "About N trainers", twelve rows, the link to Pokebattler; in an egg's post without a boss: refused; with `boss` typed: the post's tier.
- [ ] `/counters boss:<a shadow boss> tier:Shadow T5`, `tier:Mega`, `tier:Elite` if a boss exists: Pokebattler answers (shadow ids of regional forms are guessed); a default-form boss (e.g. Landorus) answers.
- [ ] `/settings pokebattler-id` with Matt's id, then `/counters level:My Pokébox on Pokebattler`: private, his Pokémon; an empty or private box: the sentence.
- [ ] `/counters` in a DM with the bot (after a global registration, Matt's call).
- [ ] `/find-region` with coordinates, a maps link and a town name near the test regions: the regions, the picture, the attribution; a place far away: the sentence.
- [ ] Note how long `/counters` takes (a real answer is 1.75 MB).
