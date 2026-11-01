# Phase 8X-6: `/counters` for Max Battles: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The sixth plan of max battles (design `docs/superpowers/specs/2026-10-20-max-battles-design.md`, section 8): Pokebattler's suggested team of three for a Dynamax or Gigantamax boss, in `/counters`. In detail:

- **The endpoint** (undocumented; Pokebattler's site uses it): `fight.pokebattler.com/max/parties/suggested/defenders/<id>/levels/<RAID_LEVEL_n_MAX>?attack&heal&shield&charge&meterCharge&level&weatherCondition&friendLevel`, the five counts adding to 3; each slot a role, a Pokémon, its moves and ten alternatives. Probed live with Matt's go-ahead (2026-10-21): level, weather and friendship are honoured; no Pokébox.
- **Roles** (Matt, 2026-10-21; Pokebattler's words): **Attackers + charger** (the default: two attackers and a charger, `meterCharge`), **Balanced** (an attacker, a charger, a shielder), **All attackers**, **Shielder** (an attacker and two shielders), **Healer** (an attacker and two healers); each with its page on Pokebattler's site for "Full results".
- **`/counters`**: the max tiers D1–D5 and G; `role:`; levels 20–50 in steps of 5 (no best-buddy levels); weather and friendship as for raids; moveset, shadow, mega, single and the Pokébox refused for a max tier, in the guard (uncounted); in a max battle's post the battle's boss and tier; a boss that is a max boss and no raid boss now takes its max tier; "Gigantamax X" and "Dynamax X" read as `/max` reads them; Gigantamax refused (uncounted) for a Pokémon the game master never Gigantamaxes unless Pokebattler lists it; Change options… for a max answer.
- **The raid counters' "Full results" link** goes to Pokebattler's new site (`/raids/<boss>`, with `includeShadow=0` / `includeMegas=0` where the answer left those out): the old long link is redirected there and loses every option.

**Architecture:**

- **Domain:** `src/domain/counters/max-team.ts` (the roles table, levels, the defender ids, the path, `readMaxTeam` with its dropped counts, the slot words); `options.ts`'s `counterSiteLink`.
- **Gateway:** `PokebattlerFight.maxTeam` shares the counters' machinery (turns, the busy limit, the pause, the user agent, a 10-minute cache per kind, the next name on 400/404 or an empty team); an unreadable answer warns.
- **Discord:** `src/commands/util/max-counters.ts` (the max path, refusals, the plan), `src/render/max-team.ts` (the answer), `counters-words.ts`; `counters.ts` and `counters-dialog.ts` route to them.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14, Vitest. No new dependency, no migration, party state unchanged. **A command changes** (`/counters`: max tiers, `role:`): deploy the commands again before staging. Fixture `test/fixtures/pokebattler-max-teams.json`: eight recorded answers kept whole.

**Spec:** the design above, the brief `.superpowers/sdd/8x-6-max-counters/design.md`, its notes (what the endpoint takes, probed live) and ledger (Matt's decisions; git-ignored).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8x6`, tip `ca2c6ca1`), one commit per task, on `max-battles` f4ec6b5c (8X-3 merged). Each commit typechecks and its unit tests pass; on the tip the full check (8381 tests), the build and the database suite (516) are clean.

**Reviews:** an Opus reviewer went through the prototype (one Important: an answer of an unknown shape read as "no team" without a warning; nine Minor), then a fix review (three Minor: a listed Gigantamax boss refused, the moveset list for a max boss typed without a tier, the area file's wording). Every finding is in the commits below.

## Decisions in this plan

Made while prototyping and reviewing, for Matt to look at:

1. **Task order:** the gateway and the command came in parts (2a–2d) as Matt's decisions arrived (weather and friendship honoured after all; the roles with a charger); the raid link is a commit of its own.
2. **Alternatives once per role:** Pokebattler gives every slot of a role the same ten; five are shown, with their fast move; no scores.
3. **A bad option is refused, never ignored**, so nobody believes a weather or level was applied when it was not.
4. **Gigantamax against the game master:** refused for a Pokémon that never Gigantamaxes unless Pokebattler lists it or the post is its battle; a Dynamax boss is asked anyway (Pokebattler may know a boss newer than the game data).
5. **Not built:** a Pokébox for max teams (none found); Pokebattler's `charge` role ("Defender"); a User-Agent with a URL or contact, which Pokebattler's developer page asks for (a follow-up).

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment.
- `src/domain/` stays pure. Tests never use the network and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8x6`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed. Apply the diffs with `git apply`, never retype them.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock), one at a time. Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/`, `.superpowers/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **The raid counters are unchanged** but for the link.
2. **The max path's option handling:** refusals in the guard, uncounted; the tier from the post, `tier:`, the boss list; Gigantamax ids both ways.
3. **The gateway:** caches, the shared pause and busy limit, names tried, warnings on an unknown shape.
4. **The answer within Discord's limits** on its largest layout.

### Task 1: 8X-6 task 1: max battle teams from Pokebattler, the roles and the answer

Prototype commit: `f20f04abb867216d7c4e08081d982ee9287aa74c`

The roles of a member in a max battle in one table (Attacker 3/0/0, the default,
Balanced 2/0/1, Tank 1/0/2, Healer 1/2/0), Pokebattler's level of each max tier,
the boss's names there (Gigantamax as the feed writes it), the request's path,
the answer read into slots with their alternatives (MOVE_NONE as no charged
move), and the team's Pokemon named as the max boss feed is mapped. The
recorded answers of 2026-10-21 are a fixture, kept whole.

**Files:**

```
 src/domain/counters/max-team.test.ts     | 235 +++++++++++++++++++++++++++++++++++++++++++
 src/domain/counters/max-team.ts          | 279 +++++++++++++++++++++++++++++++++++++++++++++++++++
 test/fixtures/pokebattler-max-teams.json |   1 +
 test/support/pokebattler.ts              |  32 ++++++
 4 files changed, 547 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/counters/max-team.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff f20f04abb867216d7c4e08081d982ee9287aa74c -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-6 task 1: max battle teams from Pokebattler, the roles and the answer`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/counters/max-team.test.ts b/src/domain/counters/max-team.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a66ee74fa9209a8b3587f07b304c72a9c23346f8
--- /dev/null
+++ b/src/domain/counters/max-team.test.ts
@@ -0,0 +1,235 @@
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import { recordedMaxTeam } from '../../../test/support/pokebattler.js';
+import { MAX_TIERS } from '../pogo/max-tier.js';
+import {
+  DEFAULT_MAX_ROLE,
+  gigantamaxDefenders,
+  MAX_ROLE_KEYS,
+  MAX_ROLES,
+  maxTeamMember,
+  maxTeamPath,
+  pokebattlerMaxDefenders,
+  pokebattlerMaxLevel,
+  readMaxTeam,
+  slotRoleWords,
+} from './max-team.js';
+
+const catalogue = catalogueFixture();
+const entry = (key: string) => {
+  const found = catalogue.byKey(key);
+  if (!found) throw new Error(`no ${key} in the fixture`);
+  return found;
+};
+
+describe('MAX_ROLES', () => {
+  it('has the four roles of Matt, the attacker first, each a team of three', () => {
+    expect(MAX_ROLE_KEYS).toEqual(['attacker', 'balanced', 'tank', 'healer']);
+    expect(DEFAULT_MAX_ROLE).toBe('attacker');
+    expect(
+      MAX_ROLE_KEYS.map((key) => {
+        const { attack, heal, shield } = MAX_ROLES[key];
+        return [MAX_ROLES[key].name, attack, heal, shield];
+      }),
+    ).toEqual([
+      ['Attacker', 3, 0, 0],
+      ['Balanced', 2, 0, 1],
+      ['Tank', 1, 0, 2],
+      ['Healer', 1, 2, 0],
+    ]);
+    // Pokebattler refuses a team that is not three Pokémon (400).
+    for (const key of MAX_ROLE_KEYS) {
+      const { attack, heal, shield } = MAX_ROLES[key];
+      expect(attack + heal + shield).toBe(3);
+    }
+  });
+});
+
+describe('pokebattlerMaxLevel', () => {
+  it('names every max tier as Pokebattler does', () => {
+    expect(MAX_TIERS.map(pokebattlerMaxLevel)).toEqual([
+      'RAID_LEVEL_1_MAX',
+      'RAID_LEVEL_2_MAX',
+      'RAID_LEVEL_3_MAX',
+      'RAID_LEVEL_4_MAX',
+      'RAID_LEVEL_5_MAX',
+      'RAID_LEVEL_6_MAX',
+    ]);
+  });
+});
+
+describe('gigantamaxDefenders', () => {
+  it('names a Pokémon that Gigantamaxes, and its forms that do', () => {
+    expect(gigantamaxDefenders(entry('machamp'), catalogue)).toEqual(['MACHAMP_GIGANTAMAX']);
+    // Pokebattler answers for the species and for the form (probed 2026-10-21).
+    expect(gigantamaxDefenders(entry('toxtricity'), catalogue)).toEqual([
+      'TOXTRICITY_GIGANTAMAX',
+      'TOXTRICITY_AMPED_GIGANTAMAX',
+      'TOXTRICITY_LOW_KEY_GIGANTAMAX',
+    ]);
+    // A species that does not, whose forms do: the forms.
+    expect(gigantamaxDefenders(entry('urshifu'), catalogue)).toEqual([
+      'URSHIFU_RAPID_STRIKE_GIGANTAMAX',
+      'URSHIFU_SINGLE_STRIKE_GIGANTAMAX',
+    ]);
+  });
+
+  it('has none for a Pokémon the game master never Gigantamaxes', () => {
+    expect(gigantamaxDefenders(entry('uxie'), catalogue)).toEqual([]);
+    expect(gigantamaxDefenders(entry('gengar_mega'), catalogue)).toEqual([]);
+  });
+});
+
+describe('pokebattlerMaxDefenders', () => {
+  it('is the Pokebattler name for a Dynamax boss, and its Gigantamax name for Gigantamax', () => {
+    expect(pokebattlerMaxDefenders(entry('uxie'), 'D5')).toEqual(['UXIE']);
+    expect(pokebattlerMaxDefenders(entry('machamp'), 'G')).toEqual(['MACHAMP_GIGANTAMAX']);
+  });
+
+  it('drops _FORM for a form’s Gigantamax name, as the feed writes it', () => {
+    expect(pokebattlerMaxDefenders(entry('toxtricity_amped'), 'G')).toEqual([
+      'TOXTRICITY_AMPED_GIGANTAMAX',
+    ]);
+    expect(pokebattlerMaxDefenders(entry('toxtricity'), 'D4')).toEqual(['TOXTRICITY']);
+    // A species known by its default form also tries the bare species, as the raid counters do.
+    expect(pokebattlerMaxDefenders(entry('zacian_hero'), 'D5')).toEqual([
+      'ZACIAN_HERO_FORM',
+      'ZACIAN',
+    ]);
+    expect(pokebattlerMaxDefenders(entry('zacian_hero'), 'G')).toEqual([
+      'ZACIAN_HERO_GIGANTAMAX',
+      'ZACIAN_GIGANTAMAX',
+    ]);
+  });
+
+  it('has no name for a mega: it never battles in a max battle', () => {
+    expect(pokebattlerMaxDefenders(entry('gengar_mega'), 'D5')).toEqual([]);
+    expect(pokebattlerMaxDefenders(entry('gengar_mega'), 'G')).toEqual([]);
+  });
+});
+
+describe('maxTeamPath', () => {
+  it('asks for the role’s team at the level, as the endpoint takes it', () => {
+    expect(
+      maxTeamPath({
+        boss: 'MACHAMP_GIGANTAMAX',
+        maxLevel: 'RAID_LEVEL_6_MAX',
+        role: 'balanced',
+        level: '30',
+      }),
+    ).toBe(
+      '/max/parties/suggested/defenders/MACHAMP_GIGANTAMAX/levels/RAID_LEVEL_6_MAX' +
+        '?attack=2&heal=0&shield=1&level=30',
+    );
+    expect(
+      maxTeamPath({ boss: 'UXIE', maxLevel: 'RAID_LEVEL_5_MAX', role: 'healer', level: '40' }),
+    ).toBe(
+      '/max/parties/suggested/defenders/UXIE/levels/RAID_LEVEL_5_MAX?attack=1&heal=2&shield=0&level=40',
+    );
+  });
+});
+
+describe('readMaxTeam', () => {
+  it('reads the three slots of a recorded answer with their alternatives', () => {
+    const team = readMaxTeam(recordedMaxTeam('gmax-machamp-2-0-1'));
+    expect(team?.slots.map((slot) => [slot.role, slot.pick.pokemonId])).toEqual([
+      ['ATTACK', 'ZACIAN_CROWNED_SWORD_FORM'],
+      ['ATTACK', 'GALLADE'],
+      ['SHIELD', 'ZAMAZENTA_CROWNED_SHIELD_FORM'],
+    ]);
+    const [first, , tank] = team?.slots ?? [];
+    // No charged move is no charged move: the max moves are the point.
+    expect(first?.pick).toEqual({
+      pokemonId: 'ZACIAN_CROWNED_SWORD_FORM',
+      fast: 'METAL_CLAW_FAST',
+      charged: null,
+      level: '40',
+    });
+    expect(tank?.pick.charged).toBe('MOONBLAST');
+    expect(first?.alternatives).toHaveLength(10);
+    expect(first?.alternatives[0]).toEqual({
+      pokemonId: 'LATIOS',
+      fast: 'ZEN_HEADBUTT_FAST',
+      charged: 'LUSTER_PURGE',
+      level: '40',
+    });
+    expect(first?.maxMoves).toEqual({ attack: 1, guard: 3, spirit: 3 });
+  });
+
+  it('reads every recorded role', () => {
+    const roles = (name: Parameters<typeof recordedMaxTeam>[0]) =>
+      readMaxTeam(recordedMaxTeam(name))?.slots.map((slot) => slot.role);
+    expect(roles('uxie-d5-3-0-0')).toEqual(['ATTACK', 'ATTACK', 'ATTACK']);
+    expect(roles('uxie-d5-2-0-1')).toEqual(['ATTACK', 'ATTACK', 'SHIELD']);
+    expect(roles('uxie-d5-1-0-2')).toEqual(['ATTACK', 'SHIELD', 'SHIELD']);
+    expect(roles('uxie-d5-1-2-0')).toEqual(['ATTACK', 'HEAL', 'HEAL']);
+  });
+
+  it('leaves out what does not fit and reads the rest; nothing of another shape', () => {
+    const raw = recordedMaxTeam('uxie-d5-3-0-0') as {
+      slots: Record<string, unknown>[];
+    };
+    const [one, two] = raw.slots;
+    if (!one || !two) throw new Error('the recorded answer has no slots');
+    delete one['pokemonId'];
+    (two['alternatives'] as Record<string, unknown>[])[0] = { pokemonId: 7 };
+    const team = readMaxTeam(raw);
+    expect(team?.slots).toHaveLength(2);
+    expect(team?.slots[0]?.alternatives).toHaveLength(9);
+    // What was left out is counted, for the gateway's warning.
+    expect(team?.dropped).toEqual({ slots: 1, alternatives: 1 });
+    expect(readMaxTeam(recordedMaxTeam('uxie-d5-3-0-0'))?.dropped).toBeUndefined();
+    expect(readMaxTeam({ status: '400', error: 'Bad Request' })).toBeUndefined();
+    expect(readMaxTeam([])).toBeUndefined();
+    expect(readMaxTeam({ slots: [] })).toEqual({ slots: [] });
+  });
+
+  it('reads an answer none of whose slots fit as unreadable, not as no team', () => {
+    // A field renamed by Pokebattler: every slot fails, which is no empty team.
+    const raw = recordedMaxTeam('uxie-d5-3-0-0') as { slots: Record<string, unknown>[] };
+    for (const slot of raw.slots) {
+      slot['pokemon'] = slot['pokemonId'];
+      delete slot['pokemonId'];
+    }
+    expect(readMaxTeam(raw)).toBeUndefined();
+  });
+
+  it('takes a role only in Pokebattler’s words', () => {
+    const raw = recordedMaxTeam('uxie-d5-3-0-0') as { slots: Record<string, unknown>[] };
+    const [first] = raw.slots;
+    if (!first) throw new Error('the recorded answer has no slots');
+    first['role'] = 'ATTACK**';
+    expect(readMaxTeam(raw)?.slots).toHaveLength(2);
+  });
+});
+
+describe('maxTeamMember', () => {
+  it('names a Pokémon of the team as the max boss feed is mapped, Gigantamax too', () => {
+    expect(maxTeamMember('ZACIAN_CROWNED_SWORD_FORM', catalogue)).toMatchObject({
+      name: entry('zacian_crowned_sword').name,
+      gigantamax: false,
+    });
+    expect(maxTeamMember('RILLABOOM_GIGANTAMAX', catalogue)).toMatchObject({
+      name: 'Gigantamax Rillaboom',
+      entry: { key: 'rillaboom' },
+      gigantamax: true,
+    });
+  });
+
+  it('names one the game data does not know by Pokebattler’s name in words', () => {
+    expect(maxTeamMember('NEWMON', catalogue)).toEqual({ name: 'Newmon', gigantamax: false });
+    expect(maxTeamMember('NEWMON_GIGANTAMAX', catalogue)).toEqual({
+      name: 'Gigantamax Newmon',
+      gigantamax: true,
+    });
+  });
+});
+
+describe('slotRoleWords', () => {
+  it('says the roles of the slots as the roles of members are named', () => {
+    expect(slotRoleWords('ATTACK')).toEqual({ one: 'Attacker', many: 'attackers' });
+    expect(slotRoleWords('SHIELD')).toEqual({ one: 'Tank', many: 'tanks' });
+    expect(slotRoleWords('HEAL')).toEqual({ one: 'Healer', many: 'healers' });
+    expect(slotRoleWords('METER_CHARGE')).toEqual({ one: 'Meter Charge', many: 'others' });
+  });
+});
diff --git a/src/domain/counters/max-team.ts b/src/domain/counters/max-team.ts
new file mode 100644
index 0000000000000000000000000000000000000000..950e7088ac4da3f52b81b61bd61e9b41a1d72a89
--- /dev/null
+++ b/src/domain/counters/max-team.ts
@@ -0,0 +1,279 @@
+import { z } from 'zod';
+import type { PokemonCatalogue } from '../pogo/catalogue.js';
+import type { PokemonEntry } from '../pogo/game-master.js';
+import { MAX_FEED_TIERS, maxBossOf } from '../pogo/max-bosses.js';
+import type { MaxTier } from '../pogo/max-tier.js';
+import { titleCase } from '../pogo/names.js';
+import { pokebattlerBossIds, type AttackerLevel } from './options.js';
+
+/*
+ * `/counters` for max battles (plan 8X-6; design section 8): Pokebattler's suggested team of
+ * three for a max battle, `GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=a&
+ * heal=h&shield=s&level=n` (explored on 2026-10-21: `a + h + s` must be 3, else 400; `level` is
+ * honoured; weather and a Pokébox are not). One slot per Pokémon, each with its role, moves,
+ * level and ten alternatives.
+ */
+
+/** What a member's three Pokémon are for: how many attack, heal (Max Spirit) and shield (Max Guard). */
+export interface MaxRoleTeam {
+  /** The role as `/counters` offers it. */
+  name: string;
+  /** The team in words, for the answer. */
+  team: string;
+  attack: number;
+  heal: number;
+  shield: number;
+}
+
+/**
+ * The roles a member plays in a max battle (Matt, 2026-10-21: groups play a Dynamax legendary
+ * with a couple of attackers, one balanced, one tank or healer who still brings an attacker; "a
+ * good starting point"): the one table to change.
+ */
+export const MAX_ROLES = {
+  attacker: { name: 'Attacker', team: 'three attackers', attack: 3, heal: 0, shield: 0 },
+  balanced: { name: 'Balanced', team: 'two attackers and a tank', attack: 2, heal: 0, shield: 1 },
+  tank: { name: 'Tank', team: 'an attacker and two tanks', attack: 1, heal: 0, shield: 2 },
+  healer: { name: 'Healer', team: 'an attacker and two healers', attack: 1, heal: 2, shield: 0 },
+} as const satisfies Record<string, MaxRoleTeam>;
+
+export type MaxRole = keyof typeof MAX_ROLES;
+
+/** The roles in the order `/counters` offers them. */
+export const MAX_ROLE_KEYS = Object.keys(MAX_ROLES) as MaxRole[];
+
+/** A member who says nothing attacks (Matt). */
+export const DEFAULT_MAX_ROLE: MaxRole = 'attacker';
+
+export function isMaxRole(value: string): value is MaxRole {
+  return Object.hasOwn(MAX_ROLES, value);
+}
+
+const LEVEL_OF_TIER = new Map<MaxTier, string>(
+  Object.entries(MAX_FEED_TIERS).map(([level, tier]) => [tier, level]),
+);
+
+/** Pokebattler's level of a max tier, as its boss list names it: `RAID_LEVEL_6_MAX` for `G`. */
+export function pokebattlerMaxLevel(tier: MaxTier): string {
+  const level = LEVEL_OF_TIER.get(tier);
+  if (level === undefined) throw new Error(`no Pokebattler level for the max tier ${tier}`);
+  return level;
+}
+
+const GIGANTAMAX_SUFFIX = '_GIGANTAMAX';
+
+/**
+ * The names under which Pokebattler may know a max boss, to be tried in this order (as
+ * `pokebattlerBossIds` for a raid): a Dynamax boss by its Pokebattler name; a Gigantamax boss by
+ * that name without `_FORM` and with `_GIGANTAMAX`, as the max boss feed writes it
+ * (`MACHAMP_GIGANTAMAX`, `TOXTRICITY_AMPED_GIGANTAMAX`). A mega never battles in a max battle: no
+ * names.
+ */
+export function pokebattlerMaxDefenders(entry: PokemonEntry, tier: MaxTier): string[] {
+  if (entry.kind === 'mega' || entry.tempEvolution !== null) return [];
+  const names = pokebattlerBossIds(entry, false);
+  if (tier !== 'G') return names;
+  return [...new Set(names.map((name) => `${name.replace(/_FORM$/, '')}${GIGANTAMAX_SUFFIX}`))];
+}
+
+/**
+ * The names under which Pokebattler may know a Gigantamax boss, to be tried in this order: the
+ * Pokémon's own (`pokebattlerMaxDefenders`) where the game master has it Gigantamax, then those of
+ * its species' forms that it has so (Toxtricity: the species and both forms answer; Urshifu: only
+ * its forms Gigantamax). None for a Pokémon the game master never has Gigantamax, which is refused
+ * before Pokebattler is asked.
+ */
+export function gigantamaxDefenders(
+  entry: PokemonEntry,
+  catalogue: Pick<PokemonCatalogue, 'canGigantamax' | 'byDex'>,
+): string[] {
+  if (entry.kind === 'mega' || entry.tempEvolution !== null) return [];
+  const own = catalogue.canGigantamax(entry) ? [entry] : [];
+  // A species stands for its forms; a form named is that form alone.
+  const forms =
+    entry.kind === 'species'
+      ? catalogue
+          .byDex(entry.dex)
+          .filter(
+            (other) =>
+              other.kind !== 'species' && other.kind !== 'mega' && catalogue.canGigantamax(other),
+          )
+      : [];
+  const names = [...own, ...forms].flatMap((one) => pokebattlerMaxDefenders(one, 'G'));
+  return [...new Set(names)];
+}
+
+/** One request of a team. */
+export interface MaxTeamQuery {
+  /** The boss's Pokebattler name (`pokebattlerMaxDefenders`). */
+  boss: string;
+  /** Pokebattler's level of the tier (`pokebattlerMaxLevel`). */
+  maxLevel: string;
+  role: MaxRole;
+  /** The level of the member's Pokémon. */
+  level: AttackerLevel;
+}
+
+/** The path and query of a team's request. */
+export function maxTeamPath(query: MaxTeamQuery): string {
+  const { attack, heal, shield } = MAX_ROLES[query.role];
+  const params = new URLSearchParams({
+    attack: String(attack),
+    heal: String(heal),
+    shield: String(shield),
+    level: query.level,
+  });
+  return (
+    `/max/parties/suggested/defenders/${encodeURIComponent(query.boss)}` +
+    `/levels/${encodeURIComponent(query.maxLevel)}?${params.toString()}`
+  );
+}
+
+/** A Pokémon of a team: Pokebattler's name of it, its moves and level. */
+export interface MaxPick {
+  /** Pokebattler's name (`ZACIAN_CROWNED_SWORD_FORM`, `RILLABOOM_GIGANTAMAX`). */
+  pokemonId: string;
+  /** Move ids as the game master writes them. */
+  fast: string;
+  /** Null where Pokebattler names none (`MOVE_NONE`): the max moves are the point. */
+  charged: string | null;
+  /** The level Pokebattler simulated it at; null when not given. */
+  level: string | null;
+}
+
+/** The levels of the max moves Pokebattler assumed. */
+export interface MaxMoveLevels {
+  /** Max Attack (`maxPowerLevel`). */
+  attack: number;
+  /** Max Guard (`maxShieldLevel`). */
+  guard: number;
+  /** Max Spirit (`maxHealLevel`). */
+  spirit: number;
+}
+
+/** One of the three Pokémon of a team, with the alternatives Pokebattler gives for its place. */
+export interface MaxSlot {
+  /** Pokebattler's role: `ATTACK`, `SHIELD` or `HEAL` (`slotRoleWords`). */
+  role: string;
+  pick: MaxPick;
+  alternatives: MaxPick[];
+  /** Undefined when the answer does not give them. */
+  maxMoves: MaxMoveLevels | undefined;
+}
+
+export interface MaxTeamAnswer {
+  slots: MaxSlot[];
+  /** How many slots and alternatives did not fit and were left out; absent when none. */
+  dropped?: { slots: number; alternatives: number };
+}
+
+const pickSchema = z.object({
+  // Pokebattler's words only (`ATTACK`, `METER_CHARGE`): a role it adds is shown in words.
+  role: z.string().regex(/^[A-Z_]{1,40}$/),
+  pokemonId: z.string().min(1).max(100),
+  quickMove: z.string().min(1).max(100),
+  cinematicMove: z.string().max(100).nullish(),
+  level: z.union([z.string().max(10), z.number().finite()]).nullish(),
+  maxPowerLevel: z.number().int().nonnegative().nullish(),
+  maxShieldLevel: z.number().int().nonnegative().nullish(),
+  maxHealLevel: z.number().int().nonnegative().nullish(),
+});
+
+const slotSchema = pickSchema.extend({ alternatives: z.array(z.unknown()).nullish() });
+
+const answerSchema = z.object({ slots: z.array(z.unknown()) });
+
+/** The charged move Pokebattler writes where a Pokémon has none. */
+const NO_MOVE = 'MOVE_NONE';
+
+function pickOf(raw: z.infer<typeof pickSchema>): MaxPick {
+  const charged = raw.cinematicMove ?? '';
+  return {
+    pokemonId: raw.pokemonId,
+    fast: raw.quickMove,
+    charged: charged === '' || charged === NO_MOVE ? null : charged,
+    level: raw.level === null || raw.level === undefined ? null : String(raw.level),
+  };
+}
+
+function slotOf(value: unknown, dropped: { alternatives: number }): MaxSlot | undefined {
+  const parsed = slotSchema.safeParse(value);
+  if (!parsed.success) return undefined;
+  const raw = parsed.data;
+  const alternatives: MaxPick[] = [];
+  for (const other of raw.alternatives ?? []) {
+    const read = pickSchema.safeParse(other);
+    if (read.success) alternatives.push(pickOf(read.data));
+    else dropped.alternatives += 1;
+  }
+  const { maxPowerLevel, maxShieldLevel, maxHealLevel } = raw;
+  return {
+    role: raw.role,
+    pick: pickOf(raw),
+    alternatives,
+    maxMoves:
+      typeof maxPowerLevel === 'number' &&
+      typeof maxShieldLevel === 'number' &&
+      typeof maxHealLevel === 'number'
+        ? { attack: maxPowerLevel, guard: maxShieldLevel, spirit: maxHealLevel }
+        : undefined,
+  };
+}
+
+/**
+ * Reads Pokebattler's answer of a team, checked for the fields used: a slot or alternative that
+ * does not fit is left out and the rest is read, and counted (`dropped`); undefined for an
+ * answer not of this shape (an error body) and for one with slots none of which fit (a field
+ * renamed: that is no empty team). An answer may have no slot at all.
+ */
+export function readMaxTeam(body: unknown): MaxTeamAnswer | undefined {
+  const parsed = answerSchema.safeParse(body);
+  if (!parsed.success) return undefined;
+  const dropped = { slots: 0, alternatives: 0 };
+  const slots: MaxSlot[] = [];
+  for (const value of parsed.data.slots) {
+    const slot = slotOf(value, dropped);
+    if (slot) slots.push(slot);
+    else dropped.slots += 1;
+  }
+  if (slots.length === 0 && dropped.slots > 0) return undefined;
+  return dropped.slots + dropped.alternatives === 0 ? { slots } : { slots, dropped };
+}
+
+/** The words of Pokebattler's roles of a slot, as the roles of members are named. */
+const SLOT_ROLES: Readonly<Record<string, { one: string; many: string }>> = {
+  ATTACK: { one: 'Attacker', many: 'attackers' },
+  SHIELD: { one: 'Tank', many: 'tanks' },
+  HEAL: { one: 'Healer', many: 'healers' },
+};
+
+/** A slot's role in words: `Attacker` (one), `attackers` (alternatives); another in Pokebattler's words. */
+export function slotRoleWords(role: string): { one: string; many: string } {
+  return SLOT_ROLES[role] ?? { one: titleCase(role), many: 'others' };
+}
+
+/** A Pokémon of a team as the answer shows it. */
+export interface MaxTeamMember {
+  /** `Zacian (Crowned Sword)`, `Gigantamax Rillaboom`, or Pokebattler's name in words. */
+  name: string;
+  /** Undefined for a Pokémon the game data does not know. */
+  entry?: PokemonEntry;
+  gigantamax: boolean;
+}
+
+/**
+ * A Pokémon of a team by Pokebattler's name, mapped as the max boss feed is (`maxBossOf`): a
+ * Gigantamax name (`RILLABOOM_GIGANTAMAX`) is the Pokémon it names, called `Gigantamax Rillaboom`;
+ * a name the game data does not know is Pokebattler's in words (`entry` undefined: the caller
+ * logs it).
+ */
+export function maxTeamMember(pokemonId: string, catalogue: PokemonCatalogue): MaxTeamMember {
+  const { entry, gigantamax } = maxBossOf(pokemonId, catalogue);
+  const base = gigantamax ? pokemonId.slice(0, -GIGANTAMAX_SUFFIX.length) : pokemonId;
+  const name = entry?.name ?? titleCase(base.replace(/-/g, '_'));
+  return {
+    name: gigantamax ? `Gigantamax ${name}` : name,
+    ...(entry ? { entry } : {}),
+    gigantamax,
+  };
+}
diff --git a/test/fixtures/pokebattler-max-teams.json b/test/fixtures/pokebattler-max-teams.json
new file mode 100644
index 0000000000000000000000000000000000000000..49435b7283bc6832e88600cfc34fe76a58626bb6
--- /dev/null
+++ b/test/fixtures/pokebattler-max-teams.json
@@ -0,0 +1 @@
+{"uxie-d5-3-0-0":{"defenderId":"UXIE","tier":"RAID_LEVEL_5_MAX","composition":{"attack":3,"heal":0,"shield":0,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.0235581035974937,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5635905283024982},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":1,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":1,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":1,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":2,"role":"ATTACK","pokemonId":"HYDREIGON","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.8187299791552247,"alternatives":[{"slot":2,"role":"ATTACK","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5635905283024982},{"slot":2,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":2,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":2,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":2,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":2,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":2,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":2,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":2,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":2,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":3,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109,"alternatives":[{"slot":3,"role":"ATTACK","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5635905283024982},{"slot":3,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":3,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":3,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":3,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":3,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":3,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":3,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":3,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":3,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]}]},"uxie-d5-2-0-1":{"defenderId":"UXIE","tier":"RAID_LEVEL_5_MAX","composition":{"attack":2,"heal":0,"shield":1,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.0235581035974937,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":1,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":1,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":1,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":2,"role":"ATTACK","pokemonId":"HYDREIGON","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.8187299791552247,"alternatives":[{"slot":2,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109},{"slot":2,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":2,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":2,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":2,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":2,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":2,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":2,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":2,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":2,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":3,"role":"SHIELD","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"BEHEMOTH_BASH","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1,"alternatives":[{"slot":3,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"LATIOS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"LATIAS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"EXCADRILL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"DURALUDON","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"REGISTEEL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"BLISSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"CHANSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"REGIROCK","quickMove":"LOCK_ON_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1}]}]},"uxie-d5-1-0-2":{"defenderId":"UXIE","tier":"RAID_LEVEL_5_MAX","composition":{"attack":1,"heal":0,"shield":2,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.0235581035974937,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":1,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":1,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":1,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":2,"role":"SHIELD","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"BEHEMOTH_BASH","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1,"alternatives":[{"slot":2,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"LATIOS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"LATIAS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"EXCADRILL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"DURALUDON","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"REGISTEEL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"BLISSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"CHANSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"REGIROCK","quickMove":"LOCK_ON_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1}]},{"slot":3,"role":"SHIELD","pokemonId":"HYDREIGON","quickMove":"BITE_FAST","cinematicMove":"BRUTAL_SWING","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1,"alternatives":[{"slot":3,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"LATIOS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"LATIAS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"EXCADRILL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"DURALUDON","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"REGISTEEL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"BLISSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"CHANSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"REGIROCK","quickMove":"LOCK_ON_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1}]}]},"uxie-d5-1-2-0":{"defenderId":"UXIE","tier":"RAID_LEVEL_5_MAX","composition":{"attack":1,"heal":2,"shield":0,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.0235581035974937,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"HYDREIGON","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.8187299791552247},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109},{"slot":1,"role":"ATTACK","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5635905283024982},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":1,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":1,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839}]},{"slot":2,"role":"HEAL","pokemonId":"BLISSEY","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.8485583332905581,"alternatives":[{"slot":2,"role":"HEAL","pokemonId":"LAPRAS_GIGANTAMAX","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.7016900959294613},{"slot":2,"role":"HEAL","pokemonId":"GREEDENT","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.6029361802230185},{"slot":2,"role":"HEAL","pokemonId":"REGICE","quickMove":"ROCK_SMASH_FAST","cinematicMove":"EARTHQUAKE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5727973752380169},{"slot":2,"role":"HEAL","pokemonId":"REGIROCK","quickMove":"ROCK_SMASH_FAST","cinematicMove":"EARTHQUAKE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5602709747446388},{"slot":2,"role":"HEAL","pokemonId":"REGISTEEL","quickMove":"ROCK_SMASH_FAST","cinematicMove":"ZAP_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.547807333052085},{"slot":2,"role":"HEAL","pokemonId":"LUGIA","quickMove":"DRAGON_TAIL_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5280823745657869},{"slot":2,"role":"HEAL","pokemonId":"MALAMAR","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5210267423359772},{"slot":2,"role":"HEAL","pokemonId":"SUICUNE","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.46576442508304455},{"slot":2,"role":"HEAL","pokemonId":"DUBWOOL","quickMove":"DOUBLE_KICK_FAST","cinematicMove":"WILD_CHARGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.45534245181674043},{"slot":2,"role":"HEAL","pokemonId":"CORVIKNIGHT","quickMove":"SAND_ATTACK_FAST","cinematicMove":"AIR_CUTTER","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.4525618207433134}]},{"slot":3,"role":"HEAL","pokemonId":"VAPOREON","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.7097417497149792,"alternatives":[{"slot":3,"role":"HEAL","pokemonId":"LAPRAS_GIGANTAMAX","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.7016900959294613},{"slot":3,"role":"HEAL","pokemonId":"GREEDENT","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.6029361802230185},{"slot":3,"role":"HEAL","pokemonId":"REGICE","quickMove":"ROCK_SMASH_FAST","cinematicMove":"EARTHQUAKE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5727973752380169},{"slot":3,"role":"HEAL","pokemonId":"REGIROCK","quickMove":"ROCK_SMASH_FAST","cinematicMove":"EARTHQUAKE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5602709747446388},{"slot":3,"role":"HEAL","pokemonId":"REGISTEEL","quickMove":"ROCK_SMASH_FAST","cinematicMove":"ZAP_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.547807333052085},{"slot":3,"role":"HEAL","pokemonId":"LUGIA","quickMove":"DRAGON_TAIL_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5280823745657869},{"slot":3,"role":"HEAL","pokemonId":"MALAMAR","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5210267423359772},{"slot":3,"role":"HEAL","pokemonId":"SUICUNE","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.46576442508304455},{"slot":3,"role":"HEAL","pokemonId":"DUBWOOL","quickMove":"DOUBLE_KICK_FAST","cinematicMove":"WILD_CHARGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.45534245181674043},{"slot":3,"role":"HEAL","pokemonId":"CORVIKNIGHT","quickMove":"SAND_ATTACK_FAST","cinematicMove":"AIR_CUTTER","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.4525618207433134}]}]},"gmax-machamp-2-0-1":{"defenderId":"MACHAMP_GIGANTAMAX","tier":"RAID_LEVEL_6_MAX","composition":{"attack":2,"heal":0,"shield":1,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3477125000000012,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"LATIOS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"LUSTER_PURGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9823259999999998},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"FLASH_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9637920000000019},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9205680000000016},{"slot":1,"role":"ATTACK","pokemonId":"LATIAS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"MIST_BALL","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8968215000000009},{"slot":1,"role":"ATTACK","pokemonId":"ALAKAZAM","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8941319999999987},{"slot":1,"role":"ATTACK","pokemonId":"ESPEON","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"FUTURESIGHT","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8528129999999995},{"slot":1,"role":"ATTACK","pokemonId":"HATTERENE","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8386080237047683},{"slot":1,"role":"ATTACK","pokemonId":"LUGIA","quickMove":"EXTRASENSORY_FAST","cinematicMove":"AEROBLAST_PLUS_PLUS","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8238966898020914},{"slot":1,"role":"ATTACK","pokemonId":"VENUSAUR_GIGANTAMAX","quickMove":"VINE_WHIP_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8125760164302229},{"slot":1,"role":"ATTACK","pokemonId":"MOLTRES","quickMove":"WING_ATTACK_FAST","cinematicMove":"FLY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8071200000000006}]},{"slot":2,"role":"ATTACK","pokemonId":"GALLADE","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.1116177543508001,"alternatives":[{"slot":2,"role":"ATTACK","pokemonId":"LATIOS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"LUSTER_PURGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9823259999999998},{"slot":2,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"FLASH_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9637920000000019},{"slot":2,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9205680000000016},{"slot":2,"role":"ATTACK","pokemonId":"LATIAS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"MIST_BALL","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8968215000000009},{"slot":2,"role":"ATTACK","pokemonId":"ALAKAZAM","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8941319999999987},{"slot":2,"role":"ATTACK","pokemonId":"ESPEON","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"FUTURESIGHT","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8528129999999995},{"slot":2,"role":"ATTACK","pokemonId":"HATTERENE","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8386080237047683},{"slot":2,"role":"ATTACK","pokemonId":"LUGIA","quickMove":"EXTRASENSORY_FAST","cinematicMove":"AEROBLAST_PLUS_PLUS","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8238966898020914},{"slot":2,"role":"ATTACK","pokemonId":"VENUSAUR_GIGANTAMAX","quickMove":"VINE_WHIP_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8125760164302229},{"slot":2,"role":"ATTACK","pokemonId":"MOLTRES","quickMove":"WING_ATTACK_FAST","cinematicMove":"FLY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8071200000000006}]},{"slot":3,"role":"SHIELD","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOONBLAST","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1,"alternatives":[{"slot":3,"role":"SHIELD","pokemonId":"VENUSAUR_GIGANTAMAX","quickMove":"VINE_WHIP_FAST","cinematicMove":"SOLAR_BEAM","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9813945263157895},{"slot":3,"role":"SHIELD","pokemonId":"VENUSAUR","quickMove":"VINE_WHIP_FAST","cinematicMove":"SOLAR_BEAM","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9813945263157895},{"slot":3,"role":"SHIELD","pokemonId":"VAPOREON","quickMove":"WATER_GUN_FAST","cinematicMove":"HYDRO_PUMP","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"BLASTOISE_GIGANTAMAX","quickMove":"WATER_GUN_FAST","cinematicMove":"HYDRO_PUMP","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9719733684210525},{"slot":3,"role":"SHIELD","pokemonId":"SUICUNE","quickMove":"WATER_GUN_FAST","cinematicMove":"HYDRO_PUMP","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"BLASTOISE","quickMove":"WATER_GUN_FAST","cinematicMove":"SKULL_BASH","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9719733684210528},{"slot":3,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"SUPER_POWER","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9544179999999999},{"slot":3,"role":"SHIELD","pokemonId":"ETERNATUS","quickMove":"DRAGON_TAIL_FAST","cinematicMove":"DYNAMAX_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"BULLET_PUNCH_FAST","cinematicMove":"PSYCHIC","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9630522105263158},{"slot":3,"role":"SHIELD","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"EARTH_POWER","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9626837894736844}]}]},"duraludon-d4-2-0-1":{"defenderId":"DURALUDON","tier":"RAID_LEVEL_4_MAX","composition":{"attack":2,"heal":0,"shield":1,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"MACHAMP_GIGANTAMAX","quickMove":"COUNTER_FAST","cinematicMove":"CLOSE_COMBAT","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":3.138779925731202,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"GALLADE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.837469063099428},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.6647104302359765},{"slot":1,"role":"ATTACK","pokemonId":"HITMONLEE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.6250819235265546},{"slot":1,"role":"ATTACK","pokemonId":"FLYGON","quickMove":"SAND_ATTACK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.468117242961913},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.4162966310698795},{"slot":1,"role":"ATTACK","pokemonId":"ELECTIVIRE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.404397130176186},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.3570256674466012},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.313603936289376},{"slot":1,"role":"ATTACK","pokemonId":"RHYPERIOR","quickMove":"MUD_SLAP_FAST","cinematicMove":"SURF","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.299855544311661},{"slot":1,"role":"ATTACK","pokemonId":"MACHAMP","quickMove":"COUNTER_FAST","cinematicMove":"STONE_EDGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.281032800907299}]},{"slot":2,"role":"ATTACK","pokemonId":"EXCADRILL","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":3.021222482852002,"alternatives":[{"slot":2,"role":"ATTACK","pokemonId":"GALLADE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.837469063099428},{"slot":2,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.6647104302359765},{"slot":2,"role":"ATTACK","pokemonId":"HITMONLEE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.6250819235265546},{"slot":2,"role":"ATTACK","pokemonId":"FLYGON","quickMove":"SAND_ATTACK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.468117242961913},{"slot":2,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.4162966310698795},{"slot":2,"role":"ATTACK","pokemonId":"ELECTIVIRE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.404397130176186},{"slot":2,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.3570256674466012},{"slot":2,"role":"ATTACK","pokemonId":"KINGLER","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.313603936289376},{"slot":2,"role":"ATTACK","pokemonId":"RHYPERIOR","quickMove":"MUD_SLAP_FAST","cinematicMove":"SURF","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.299855544311661},{"slot":2,"role":"ATTACK","pokemonId":"MACHAMP","quickMove":"COUNTER_FAST","cinematicMove":"STONE_EDGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.281032800907299}]},{"slot":3,"role":"SHIELD","pokemonId":"LATIAS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9626298518518519,"alternatives":[{"slot":3,"role":"SHIELD","pokemonId":"GYARADOS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9626298518518519},{"slot":3,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9622970370370371},{"slot":3,"role":"SHIELD","pokemonId":"BLASTOISE_GIGANTAMAX","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9256295555555556},{"slot":3,"role":"SHIELD","pokemonId":"BLASTOISE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9256295555555556},{"slot":3,"role":"SHIELD","pokemonId":"VAPOREON","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9464267407407408},{"slot":3,"role":"SHIELD","pokemonId":"RAIKOU","quickMove":"THUNDER_SHOCK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9626298518518519},{"slot":3,"role":"SHIELD","pokemonId":"BLISSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.999593111111111},{"slot":3,"role":"SHIELD","pokemonId":"LAPRAS_GIGANTAMAX","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9451772592592593},{"slot":3,"role":"SHIELD","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1}]}]}}
diff --git a/test/support/pokebattler.ts b/test/support/pokebattler.ts
index 8bfecad1d970bb6ebb6fb3652811b00e338e92b8..65b1fdccdaf38f84e9df2378c4af49cef3edb844 100644
--- a/test/support/pokebattler.ts
+++ b/test/support/pokebattler.ts
@@ -1,3 +1,5 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
 import type { CounterQuery } from '../../src/domain/counters/options.js';
 import type {
   CounterOutcome,
@@ -9,6 +11,36 @@ import {
   type CounterAnswer,
 } from '../../src/domain/counters/pokebattler-answer.js';
 
+/**
+ * Answers of Pokebattler's suggested max battle teams (`GET /max/parties/suggested/defenders/
+ * <boss>/levels/<tier>?attack=a&heal=h&shield=s`), recorded on 2026-10-21 with Matt's go-ahead,
+ * each kept whole as Pokebattler gave it, by `<boss>-<tier>-<attack>-<heal>-<shield>`: Uxie in
+ * `RAID_LEVEL_5_MAX` for every role of `MAX_ROLES` (3/0/0, 2/0/1, 1/0/2, 1/2/0), Gigantamax
+ * Machamp (`MACHAMP_GIGANTAMAX` in `RAID_LEVEL_6_MAX`) 2/0/1, and Duraludon in `RAID_LEVEL_4_MAX`
+ * 2/0/1, whose first attacker is `MACHAMP_GIGANTAMAX`.
+ */
+export type RecordedMaxTeam =
+  | 'uxie-d5-3-0-0'
+  | 'uxie-d5-2-0-1'
+  | 'uxie-d5-1-0-2'
+  | 'uxie-d5-1-2-0'
+  | 'gmax-machamp-2-0-1'
+  | 'duraludon-d4-2-0-1';
+
+let maxTeams: Record<string, unknown> | undefined;
+
+/** A recorded answer of Pokebattler's max battle teams (`RecordedMaxTeam`), as JSON read anew. */
+export function recordedMaxTeam(name: RecordedMaxTeam): unknown {
+  maxTeams ??= JSON.parse(
+    readFileSync(
+      path.resolve(import.meta.dirname, '../fixtures/pokebattler-max-teams.json'),
+      'utf8',
+    ),
+  ) as Record<string, unknown>;
+  // A copy, so that a test that changes it changes no other test's.
+  return structuredClone(maxTeams[name]);
+}
+
 /** A moveset of a counter as Pokebattler writes it. */
 export interface SampleResult {
   move1: string;
````

### Task 2: 8X-6 task 2a: max battle teams through the Pokebattler gateway

Prototype commit: `e562730eefb3e4a50ea567d310bc938c31e8a4d3`

PokebattlerGateway.maxTeam asks Pokebattler's suggested max battle team for a
role and level, through the same turns, pause, limits, user agent and ten-minute
cache as the raid counters (one cache of each kind; the pause after no answer
holds for both). The boss's names are tried in turn on 400, 404 or an empty
team. FakePokebattler answers maxTeam with a recorded team.

**Files:**

```
 src/services/pokebattler-gateway.test.ts | 165 ++++++++++++++++++++++++++++++++++-
 src/services/pokebattler-gateway.ts      | 241 +++++++++++++++++++++++++++++++++++++--------------
 test/support/pokebattler.ts              |  53 +++++++++--
 3 files changed, 388 insertions(+), 71 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/services/pokebattler-gateway.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff e562730eefb3e4a50ea567d310bc938c31e8a4d3 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-6 task 2a: max battle teams through the Pokebattler gateway`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/services/pokebattler-gateway.test.ts b/src/services/pokebattler-gateway.test.ts
index 8dd78c874984f426ad183a87afa59281f225a9db..bc25ea2ac9cee0b484e17df5c0c871a26530831a 100644
--- a/src/services/pokebattler-gateway.test.ts
+++ b/src/services/pokebattler-gateway.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it, vi } from 'vitest';
 import { fakeTimeoutSignals, watchEachTest } from '../../test/support/timers.js';
-import { pokebattlerAnswer } from '../../test/support/pokebattler.js';
+import { pokebattlerAnswer, recordedMaxTeam } from '../../test/support/pokebattler.js';
 import { jsonResponse } from '../../test/support/responses.js';
 import { Tally } from '../../test/support/tally.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
@@ -8,6 +8,7 @@ import type { LimitedResponse } from './limited-json.js';
 import {
   PokebattlerFight,
   type CounterRequest,
+  type MaxTeamRequest,
   type PokebattlerFetch,
 } from './pokebattler-gateway.js';
 
@@ -327,3 +328,165 @@ describe('PokebattlerFight', () => {
     expect(made.urls()[0]).toContain('/attackers/users/4242/strategies/');
   });
 });
+
+const MAX_REQUEST: MaxTeamRequest = {
+  bosses: ['MACHAMP_GIGANTAMAX'],
+  maxLevel: 'RAID_LEVEL_6_MAX',
+  role: 'balanced',
+  level: '40',
+};
+
+describe('PokebattlerFight: max battle teams', () => {
+  it('asks for the role’s team and reads the answer', async () => {
+    const made = setup(() => Promise.resolve(jsonResponse(recordedMaxTeam('gmax-machamp-2-0-1'))));
+    const outcome = await made.fight.maxTeam(MAX_REQUEST);
+    expect(outcome.ok && outcome.answer.slots.map((slot) => slot.pick.pokemonId)).toEqual([
+      'ZACIAN_CROWNED_SWORD_FORM',
+      'GALLADE',
+      'ZAMAZENTA_CROWNED_SHIELD_FORM',
+    ]);
+    expect(outcome.ok && outcome.query).toEqual({
+      boss: 'MACHAMP_GIGANTAMAX',
+      maxLevel: 'RAID_LEVEL_6_MAX',
+      role: 'balanced',
+      level: '40',
+    });
+    const [url, init] = made.fetch.mock.calls[0] ?? [];
+    expect(url).toBe(
+      'https://fight.pokebattler.com/max/parties/suggested/defenders/MACHAMP_GIGANTAMAX/levels/' +
+        'RAID_LEVEL_6_MAX?attack=2&heal=0&shield=1&level=40',
+    );
+    expect(init?.headers['User-Agent']).toBe('Professor-Pine');
+    expect(init?.redirect).toBe('error');
+  });
+
+  it('asks under the next name on 400 or 404 or an empty team, and says which', async () => {
+    const made = setup((url) =>
+      Promise.resolve(
+        url.includes('/ZACIAN_HERO_FORM/')
+          ? jsonResponse({ status: '400', error: 'Bad Request' }, { status: 400 })
+          : jsonResponse(recordedMaxTeam('uxie-d5-3-0-0')),
+      ),
+    );
+    const outcome = await made.fight.maxTeam({
+      ...MAX_REQUEST,
+      bosses: ['ZACIAN_HERO_FORM', 'ZACIAN'],
+      maxLevel: 'RAID_LEVEL_5_MAX',
+    });
+    expect(outcome.ok && outcome.query.boss).toBe('ZACIAN');
+    expect(made.urls()).toHaveLength(2);
+    const unknown = setup(() => Promise.resolve(jsonResponse({}, { status: 404 })));
+    expect(await unknown.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'unknown' });
+    const empty = setup(() => Promise.resolve(jsonResponse({ slots: [] })));
+    expect(await empty.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'empty' });
+    const odd = setup(() => Promise.resolve(jsonResponse({ attackers: [] })));
+    expect(await odd.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'unreadable' });
+  });
+
+  it('makes one request for the same team at a time, and keeps it ten minutes', async () => {
+    const made = setup(() => Promise.resolve(jsonResponse(recordedMaxTeam('gmax-machamp-2-0-1'))));
+    const [a, b] = await Promise.all([
+      made.fight.maxTeam(MAX_REQUEST),
+      made.fight.maxTeam({ ...MAX_REQUEST }),
+    ]);
+    expect(a).toBe(b);
+    made.clock.now += 599_000;
+    expect(await made.fight.maxTeam(MAX_REQUEST)).toBe(a);
+    expect(made.urls()).toHaveLength(1);
+    // Another role or level is another request.
+    await made.fight.maxTeam({ ...MAX_REQUEST, role: 'tank' });
+    await made.fight.maxTeam({ ...MAX_REQUEST, level: '30' });
+    expect(made.urls()).toHaveLength(3);
+    made.clock.now += 1_000;
+    await made.fight.maxTeam(MAX_REQUEST);
+    expect(made.urls()).toHaveLength(4);
+  });
+
+  it('shares the pause with the raid counters after Pokebattler gave no answer', async () => {
+    let failing = true;
+    const made = setup((url) =>
+      failing
+        ? Promise.reject(new TypeError('fetch failed'))
+        : Promise.resolve(
+            jsonResponse(url.includes('/max/') ? recordedMaxTeam('gmax-machamp-2-0-1') : BODY),
+          ),
+    );
+    expect(await made.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'unreachable' });
+    failing = false;
+    expect(await made.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unavailable' });
+    expect(await made.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'unavailable' });
+    expect(made.urls()).toHaveLength(1);
+    made.clock.now += 60_000;
+    expect((await made.fight.maxTeam(MAX_REQUEST)).ok).toBe(true);
+    expect(
+      made.entries.some(
+        (entry) =>
+          entry.msg === 'could not ask Pokebattler' && entry['maxLevel'] === 'RAID_LEVEL_6_MAX',
+      ),
+    ).toBe(true);
+  });
+
+  it('says an answer none of whose slots fit is unreadable, and warns of what it left out', async () => {
+    const renamed = recordedMaxTeam('gmax-machamp-2-0-1') as { slots: Record<string, unknown>[] };
+    for (const slot of renamed.slots) delete slot['quickMove'];
+    const odd = setup(() => Promise.resolve(jsonResponse(renamed)));
+    expect(await odd.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'unreadable' });
+    expect(odd.entries.map((entry) => entry.msg)).toContain(
+      'the answer of Pokebattler is not of the shape known',
+    );
+    const partly = recordedMaxTeam('gmax-machamp-2-0-1') as { slots: Record<string, unknown>[] };
+    const [first] = partly.slots;
+    if (!first) throw new Error('the recorded answer has no slots');
+    delete first['quickMove'];
+    const some = setup(() => Promise.resolve(jsonResponse(partly)));
+    expect((await some.fight.maxTeam(MAX_REQUEST)).ok).toBe(true);
+    const warned = some.entries.filter(
+      (entry) => entry.msg === 'Pokebattler’s max battle team had parts not of the shape known',
+    );
+    expect(warned).toHaveLength(1);
+    expect(warned[0]).toMatchObject({ slots: 1, alternatives: 0, boss: 'MACHAMP_GIGANTAMAX' });
+  });
+
+  it('says of a boss by a name Pokebattler does not know that it has no team, not counters', async () => {
+    const made = setup(() => Promise.resolve(jsonResponse({}, { status: 404 })));
+    await made.fight.maxTeam(MAX_REQUEST);
+    expect(made.entries.map((entry) => entry.msg)).toEqual([
+      'Pokebattler has no max battle team for this boss by this name',
+    ]);
+  });
+
+  it('counts the raid counters and the max teams waiting for their turn together', async () => {
+    const releases: (() => void)[] = [];
+    const made = setup(
+      (url) =>
+        new Promise((resolve) => {
+          releases.push(() => {
+            resolve(
+              jsonResponse(url.includes('/max/') ? recordedMaxTeam('gmax-machamp-2-0-1') : BODY),
+            );
+          });
+        }),
+    );
+    // Two on their way and ten waiting, raid counters and max teams mixed.
+    const asked = Array.from({ length: 12 }, (_unused, i) =>
+      i % 2 === 0
+        ? made.fight.counters({ ...REQUEST, bosses: [`BOSS_${String(i)}`] })
+        : made.fight.maxTeam({ ...MAX_REQUEST, bosses: [`BOSS_${String(i)}`] }),
+    );
+    await made.asked.reached(2);
+    expect(await made.fight.maxTeam({ ...MAX_REQUEST, bosses: ['ONE_MORE'] })).toEqual({
+      ok: false,
+      reason: 'busy',
+    });
+    expect(await made.fight.counters({ ...REQUEST, bosses: ['ONE_MORE'] })).toEqual({
+      ok: false,
+      reason: 'busy',
+    });
+    for (let answered = 0; releases.length > 0 || made.urls().length < 12; answered++) {
+      if (answered === 12) throw new Error('the requests waiting were not all asked');
+      releases.shift()?.();
+      await background.settle();
+    }
+    expect((await Promise.all(asked)).every((outcome) => outcome.ok)).toBe(true);
+  });
+});
diff --git a/src/services/pokebattler-gateway.ts b/src/services/pokebattler-gateway.ts
index 2ba2d2609feead919bc1794d092549921eb42d7b..a45b33f679b42687facf62e86e06c176f27089c6 100644
--- a/src/services/pokebattler-gateway.ts
+++ b/src/services/pokebattler-gateway.ts
@@ -1,4 +1,10 @@
 import { BoundedMap } from '../bounded-map.js';
+import {
+  maxTeamPath,
+  readMaxTeam,
+  type MaxTeamAnswer,
+  type MaxTeamQuery,
+} from '../domain/counters/max-team.js';
 import { counterPath, POKEBATTLER_API, type CounterQuery } from '../domain/counters/options.js';
 import {
   hasCounters,
@@ -14,40 +20,52 @@ export interface CounterRequest extends Omit<CounterQuery, 'boss'> {
   bosses: readonly string[];
 }
 
+/** A max battle team to ask for (plan 8X-6), with the names the boss may have, in this order. */
+export interface MaxTeamRequest extends Omit<MaxTeamQuery, 'boss'> {
+  bosses: readonly string[];
+}
+
 /**
- * What came of asking Pokebattler. `ok`: the answer, with the query that gave it (the boss's
- * name that Pokebattler knew). `unknown`: Pokebattler knows none of the boss's names (or the
+ * Why Pokebattler gave nothing. `unknown`: Pokebattler knows none of the boss's names (or the
  * Pokébox, also one it will not show: 401 and 403 for a Pokébox). `empty`: it answered, but
- * with no counter at all under any name (an empty Pokébox, or nothing that can fight).
+ * with no counter (no team) at all under any name (an empty Pokébox, or nothing that can fight).
  * `refused`: another error status (`status`). `timeout`, `unreachable`: no answer. `too-large`,
  * `unreadable`: an answer that could not be read. `busy`: too many requests wait for their
  * turn already. `unavailable`: Pokebattler gave no answer (a timeout, unreachable) less than
  * `pauseMs` ago, and is not asked until then.
  */
+export interface PokebattlerFailure {
+  ok: false;
+  reason:
+    | 'unknown'
+    | 'empty'
+    | 'refused'
+    | 'timeout'
+    | 'unreachable'
+    | 'too-large'
+    | 'unreadable'
+    | 'busy'
+    | 'unavailable';
+  status?: number;
+}
+
+/** What came of asking for counters: the answer, with the query that gave it, or a failure. */
 export type CounterOutcome =
-  | { ok: true; answer: CounterAnswer; query: CounterQuery }
-  | {
-      ok: false;
-      reason:
-        | 'unknown'
-        | 'empty'
-        | 'refused'
-        | 'timeout'
-        | 'unreachable'
-        | 'too-large'
-        | 'unreadable'
-        | 'busy'
-        | 'unavailable';
-      status?: number;
-    };
+  { ok: true; answer: CounterAnswer; query: CounterQuery } | PokebattlerFailure;
+
+/** What came of asking for a max battle team: the team, with the query that gave it, or a failure. */
+export type MaxTeamOutcome =
+  { ok: true; answer: MaxTeamAnswer; query: MaxTeamQuery } | PokebattlerFailure;
 
 /**
- * Raid simulations of Pokebattler, for `/counters`. Nothing here throws: a failure is an
- * answer. Tests use `FakePokebattler` (`test/support/pokebattler.ts`); nothing in a test
- * touches the network.
+ * Raid simulations and max battle teams of Pokebattler, for `/counters`. Nothing here throws: a
+ * failure is an answer. Tests use `FakePokebattler` (`test/support/pokebattler.ts`); nothing in
+ * a test touches the network.
  */
 export interface PokebattlerGateway {
   counters(request: CounterRequest): Promise<CounterOutcome>;
+  /** The suggested team of three for a max battle in a role (plan 8X-6). */
+  maxTeam(request: MaxTeamRequest): Promise<MaxTeamOutcome>;
 }
 
 export type PokebattlerFetch = (
@@ -70,7 +88,7 @@ export interface PokebattlerFightOptions {
   maxBytes?: number;
   /** How long an answer is kept for the same request. Default ten minutes. */
   cacheMs?: number;
-  /** How many answers are kept at most. Default ten. */
+  /** How many answers are kept at most, of each kind. Default ten. */
   cacheSize?: number;
   /** How many requests may be on their way at once; the others wait. Default two. */
   maxConcurrent?: number;
@@ -88,21 +106,41 @@ const NOT_KNOWN = new Set([400, 404]);
  */
 const BOX_NOT_SHOWN = new Set([401, 403]);
 
+type Outcome = { ok: true } | PokebattlerFailure;
+
+/** The answers of one kind of request kept, and those being asked. */
+interface Shared<T> {
+  cache: BoundedMap<string, { at: number; outcome: T | PokebattlerFailure }>;
+  asking: Map<string, Promise<T | PokebattlerFailure>>;
+}
+
+/** One request to send: its address, what the log says of it, and how its body is read. */
+interface OneRequest<T> {
+  path: string;
+  what: Record<string, unknown>;
+  /** Whether 401 and 403 mean an unknown Pokébox. */
+  box: boolean;
+  /** The outcome of a body read; `empty` for an answer with nothing in it. */
+  read: (body: unknown) => T | PokebattlerFailure;
+}
+
 /**
- * Pokebattler's API of raid simulations over `fetch`, as the legacy bot asked it. One request
- * per setting at a time: whoever asks for what is being asked already waits for that answer, and
- * an answer is kept for ten minutes, so the members of one raid who ask in turn make one
- * request. A boss Pokebattler does not know under its first name is asked under the next. At
- * most `maxWaiting` wait for their turn (one more is `busy`), and after a request that got no
- * answer nothing is sent for `pauseMs` (`unavailable`, at once, also for what was waiting).
+ * Pokebattler's API over `fetch`: raid simulations as the legacy bot asked them, and max battle
+ * teams (plan 8X-6), both through the same turns, pause, cache and limits. One request per
+ * setting at a time: whoever asks for what is being asked already waits for that answer, and an
+ * answer is kept for ten minutes, so the members of one raid who ask in turn make one request. A
+ * boss Pokebattler does not know under its first name is asked under the next. At most
+ * `maxWaiting` wait for their turn (one more is `busy`), and after a request that got no answer
+ * nothing is sent for `pauseMs` (`unavailable`, at once, also for what was waiting), whatever it
+ * asks for.
  */
 export class PokebattlerFight implements PokebattlerGateway {
   private readonly now: () => number;
   private readonly timeoutMs: number;
   private readonly maxBytes: number;
   private readonly cacheMs: number;
-  private readonly cache: BoundedMap<string, { at: number; outcome: CounterOutcome }>;
-  private readonly asking = new Map<string, Promise<CounterOutcome>>();
+  private readonly counterAnswers: Shared<CounterOutcome>;
+  private readonly maxAnswers: Shared<MaxTeamOutcome>;
   private readonly maxConcurrent: number;
   private running = 0;
   private readonly turns: (() => void)[] = [];
@@ -115,7 +153,9 @@ export class PokebattlerFight implements PokebattlerGateway {
     this.timeoutMs = options.timeoutMs ?? 10_000;
     this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
     this.cacheMs = options.cacheMs ?? 600_000;
-    this.cache = new BoundedMap(options.cacheSize ?? 10);
+    const cacheSize = options.cacheSize ?? 10;
+    this.counterAnswers = { cache: new BoundedMap(cacheSize), asking: new Map() };
+    this.maxAnswers = { cache: new BoundedMap(cacheSize), asking: new Map() };
     this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 2);
     this.maxWaiting = options.maxWaiting ?? 10;
     this.pauseMs = options.pauseMs ?? 60_000;
@@ -132,40 +172,83 @@ export class PokebattlerFight implements PokebattlerGateway {
       request.shadow,
       request.mega,
     ]);
+    const { bosses, ...rest } = request;
+    return this.shared(
+      this.counterAnswers,
+      key,
+      () =>
+        this.byNames(bosses, { raidLevel: request.raidLevel }, 'counters', (boss) =>
+          this.counterRequest({ ...rest, boss }),
+        ),
+      // A Pokébox is its owner's to change at any time: its answer is not kept.
+      request.attackers.kind === 'level',
+    );
+  }
+
+  maxTeam(request: MaxTeamRequest): Promise<MaxTeamOutcome> {
+    if (request.bosses.length === 0) return Promise.resolve({ ok: false, reason: 'unknown' });
+    const key = JSON.stringify([request.bosses, request.maxLevel, request.role, request.level]);
+    const { bosses, ...rest } = request;
+    return this.shared(
+      this.maxAnswers,
+      key,
+      () =>
+        this.byNames(bosses, { maxLevel: request.maxLevel }, 'max battle team', (boss) =>
+          this.maxRequest({ ...rest, boss }),
+        ),
+      true,
+    );
+  }
+
+  /**
+   * An answer kept or being asked for the same key, else a new one (`ask`), unless Pokebattler
+   * is paused or too many wait; a good answer is kept when `keep`.
+   */
+  private shared<T extends Outcome>(
+    answers: Shared<T>,
+    key: string,
+    ask: () => Promise<T | PokebattlerFailure>,
+    keep: boolean,
+  ): Promise<T | PokebattlerFailure> {
     const now = this.now();
-    this.cache.dropWhile((kept) => now - kept.at >= this.cacheMs);
-    const kept = this.cache.get(key);
+    answers.cache.dropWhile((kept) => now - kept.at >= this.cacheMs);
+    const kept = answers.cache.get(key);
     if (kept) return Promise.resolve(kept.outcome);
-    const asking = this.asking.get(key);
+    const asking = answers.asking.get(key);
     if (asking) return asking;
     if (now < this.pausedUntil) return Promise.resolve({ ok: false, reason: 'unavailable' });
     if (this.turns.length >= this.maxWaiting) {
       return Promise.resolve({ ok: false, reason: 'busy' });
     }
-    const answer = this.ask(request)
+    const answer = ask()
       .then((outcome) => {
-        // A Pokébox is its owner's to change at any time: its answer is not kept.
-        if (outcome.ok && request.attackers.kind === 'level') {
-          this.cache.set(key, { at: this.now(), outcome });
-        }
+        if (outcome.ok && keep) answers.cache.set(key, { at: this.now(), outcome });
         return outcome;
       })
-      .finally(() => this.asking.delete(key));
-    this.asking.set(key, answer);
+      .finally(() => answers.asking.delete(key));
+    answers.asking.set(key, answer);
     return answer;
   }
 
-  private async ask(request: CounterRequest): Promise<CounterOutcome> {
-    const { bosses, ...rest } = request;
+  /**
+   * Asks under each name of the boss in turn until one is known and has something; `noun` is what
+   * the log says it had none of.
+   */
+  private async byNames<T extends Outcome>(
+    bosses: readonly string[],
+    level: Record<string, string>,
+    noun: 'counters' | 'max battle team',
+    one: (boss: string) => Promise<T | PokebattlerFailure>,
+  ): Promise<T | PokebattlerFailure> {
     let empty = false;
     for (const boss of bosses) {
-      const outcome = await this.inTurn(() => this.one({ ...rest, boss }));
+      const outcome = await this.inTurn(() => one(boss));
       if (outcome.ok) return outcome;
       if (outcome.reason !== 'unknown' && outcome.reason !== 'empty') return outcome;
       empty ||= outcome.reason === 'empty';
       this.options.log.info(
-        { boss, raidLevel: request.raidLevel, reason: outcome.reason },
-        'Pokebattler has no counters for this boss by this name',
+        { boss, ...level, reason: outcome.reason },
+        `Pokebattler has no ${noun} for this boss by this name`,
       );
     }
     return { ok: false, reason: empty ? 'empty' : 'unknown' };
@@ -175,14 +258,16 @@ export class PokebattlerFight implements PokebattlerGateway {
    * Runs a request once fewer than `maxConcurrent` are on their way; not at all when a pause
    * began while it waited.
    */
-  private async inTurn(request: () => Promise<CounterOutcome>): Promise<CounterOutcome> {
+  private async inTurn<T>(request: () => Promise<T | PokebattlerFailure>) {
     if (this.running >= this.maxConcurrent) {
       await new Promise<void>((resolve) => this.turns.push(resolve));
     } else {
       this.running += 1;
     }
     try {
-      if (this.now() < this.pausedUntil) return { ok: false, reason: 'unavailable' };
+      if (this.now() < this.pausedUntil) {
+        return { ok: false, reason: 'unavailable' } satisfies PokebattlerFailure;
+      }
       return await request();
     } finally {
       const next = this.turns.shift();
@@ -192,30 +277,58 @@ export class PokebattlerFight implements PokebattlerGateway {
     }
   }
 
-  private async one(query: CounterQuery): Promise<CounterOutcome> {
-    const { log } = this.options;
-    const what = {
-      boss: query.boss,
-      raidLevel: query.raidLevel,
+  private counterRequest(query: CounterQuery): Promise<CounterOutcome> {
+    return this.one({
+      path: counterPath(query),
+      what: { boss: query.boss, raidLevel: query.raidLevel, box: query.attackers.kind === 'box' },
       box: query.attackers.kind === 'box',
-    };
+      read: (body): CounterOutcome => {
+        const answer = readCounterAnswer(body);
+        if (!answer) return { ok: false, reason: 'unreadable' };
+        if (!hasCounters(answer)) return { ok: false, reason: 'empty' };
+        return { ok: true, answer, query };
+      },
+    });
+  }
+
+  private maxRequest(query: MaxTeamQuery): Promise<MaxTeamOutcome> {
+    return this.one({
+      path: maxTeamPath(query),
+      what: { boss: query.boss, maxLevel: query.maxLevel, role: query.role },
+      box: false,
+      read: (body): MaxTeamOutcome => {
+        const answer = readMaxTeam(body);
+        if (!answer) return { ok: false, reason: 'unreadable' };
+        if (answer.slots.length === 0) return { ok: false, reason: 'empty' };
+        if (answer.dropped) {
+          // Once per answer read: a kept answer is not read again.
+          this.options.log.warn(
+            { boss: query.boss, maxLevel: query.maxLevel, ...answer.dropped },
+            'Pokebattler’s max battle team had parts not of the shape known',
+          );
+        }
+        return { ok: true, answer, query };
+      },
+    });
+  }
+
+  private async one<T extends Outcome>(request: OneRequest<T>): Promise<T | PokebattlerFailure> {
+    const { log } = this.options;
+    const { what } = request;
     try {
-      const response = await this.options.fetch(`${POKEBATTLER_API}${counterPath(query)}`, {
+      const response = await this.options.fetch(`${POKEBATTLER_API}${request.path}`, {
         method: 'GET',
         headers: { Accept: 'application/json', 'User-Agent': 'Professor-Pine' },
         redirect: 'error',
         signal: AbortSignal.timeout(this.timeoutMs),
       });
-      if (
-        NOT_KNOWN.has(response.status) ||
-        (query.attackers.kind === 'box' && BOX_NOT_SHOWN.has(response.status))
-      ) {
+      if (NOT_KNOWN.has(response.status) || (request.box && BOX_NOT_SHOWN.has(response.status))) {
         discardBody(response);
         return { ok: false, reason: 'unknown', status: response.status };
       }
       if (response.status !== 200) {
         discardBody(response);
-        log.warn({ ...what, status: response.status }, 'Pokebattler refused a simulation');
+        log.warn({ ...what, status: response.status }, 'Pokebattler refused a request');
         return { ok: false, reason: 'refused', status: response.status };
       }
       const body = await readLimitedJson(response, this.maxBytes);
@@ -223,13 +336,11 @@ export class PokebattlerFight implements PokebattlerGateway {
         log.warn({ ...what, reason: body.reason }, 'could not read the answer of Pokebattler');
         return { ok: false, reason: body.reason };
       }
-      const answer = readCounterAnswer(body.value);
-      if (!answer) {
+      const outcome = request.read(body.value);
+      if (!outcome.ok && outcome.reason === 'unreadable') {
         log.warn(what, 'the answer of Pokebattler is not of the shape known');
-        return { ok: false, reason: 'unreadable' };
       }
-      if (!hasCounters(answer)) return { ok: false, reason: 'empty' };
-      return { ok: true, answer, query };
+      return outcome;
     } catch (err) {
       const timeout = err instanceof Error && err.name === 'TimeoutError';
       this.pausedUntil = this.now() + this.pauseMs;
diff --git a/test/support/pokebattler.ts b/test/support/pokebattler.ts
index 65b1fdccdaf38f84e9df2378c4af49cef3edb844..53eead32b827ab33c1c34904e4d1a500a28cdae0 100644
--- a/test/support/pokebattler.ts
+++ b/test/support/pokebattler.ts
@@ -1,9 +1,16 @@
 import { readFileSync } from 'node:fs';
 import path from 'node:path';
+import {
+  readMaxTeam,
+  type MaxTeamAnswer,
+  type MaxTeamQuery,
+} from '../../src/domain/counters/max-team.js';
 import type { CounterQuery } from '../../src/domain/counters/options.js';
 import type {
   CounterOutcome,
   CounterRequest,
+  MaxTeamOutcome,
+  MaxTeamRequest,
   PokebattlerGateway,
 } from '../../src/services/pokebattler-gateway.js';
 import {
@@ -181,10 +188,46 @@ export class FakePokebattler implements PokebattlerGateway {
         break;
       }
     }
-    return new Promise((resolve) => {
-      setImmediate(() => {
-        resolve(outcome);
-      });
-    });
+    return later(outcome);
+  }
+
+  /** Max battle teams asked for (plan 8X-6), as `asked` for counters. */
+  readonly maxAsked: MaxTeamQuery[] = [];
+  /** The team every known boss gets; by default the recorded Uxie, three attackers. */
+  maxAnswer: MaxTeamAnswer = recordedTeam('uxie-d5-3-0-0');
+
+  /** Answered as `counters` is, with `maxAnswer`, `known` and `failing`. */
+  maxTeam(request: MaxTeamRequest): Promise<MaxTeamOutcome> {
+    let outcome: MaxTeamOutcome = { ok: false, reason: 'unknown' };
+    const { bosses, ...rest } = request;
+    for (const boss of bosses) {
+      const query: MaxTeamQuery = { ...rest, boss };
+      this.maxAsked.push(query);
+      if (this.failing) {
+        outcome = this.failing;
+        break;
+      }
+      if (this.known === undefined || this.known.has(boss)) {
+        outcome = { ok: true, answer: this.maxAnswer, query };
+        break;
+      }
+    }
+    return later(outcome);
   }
 }
+
+/** A recorded team as read by `readMaxTeam`. */
+export function recordedTeam(name: RecordedMaxTeam): MaxTeamAnswer {
+  const team = readMaxTeam(recordedMaxTeam(name));
+  if (!team) throw new Error(`the recorded team ${name} could not be read`);
+  return team;
+}
+
+/** Resolves in a later turn of the event loop, as an answer of the network would. */
+function later<T>(value: T): Promise<T> {
+  return new Promise((resolve) => {
+    setImmediate(() => {
+      resolve(value);
+    });
+  });
+}
````

### Task 3: 8X-6 task 2b: counters for max battles, by role

Prototype commit: `578ce7bd21f7314f4f3fddce04edd629712e79c1`

/counters with a max tier (Dynamax 1 to 5 stars, Gigantamax, after the raid
tiers) or in a max battle's post shows Pokebattler's suggested team of three
for the member's role (role: Attacker, the default, Balanced, Tank, Healer):
each Pokemon with its role, moves and picture (Gigantamax ones as Gigantamax),
five alternatives per role, the level the answer used, the full results on the
role's page of Pokebattler's site. Levels 20 to 50 in steps of five (no best
buddy levels), 40 by default. Weather, friendship, boss moves, what else to
list and a Pokebox are refused in words for a max tier, role for a raid. A boss
named without a tier that is no raid boss now takes its max tier. Change
options... under a max answer asks the role and the level.

**Files:**

```
 src/commands/util/counters-dialog.test.ts |  92 ++++++++++++-
 src/commands/util/counters-dialog.ts      |  45 ++++--
 src/commands/util/counters-words.ts       |  24 ++++
 src/commands/util/counters.test.ts        | 370 +++++++++++++++++++++++++++++++++++++++++++++++++-
 src/commands/util/counters.ts             | 271 ++++++++++++++++++++++++++++++------
 src/commands/util/max-counters.ts         | 342 ++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/counters/max-team.test.ts      |  28 ++++
 src/domain/counters/max-team.ts           |  44 +++++-
 src/render/max-team.ts                    | 202 +++++++++++++++++++++++++++
 9 files changed, 1356 insertions(+), 62 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/util/counters-dialog.test.ts src/commands/util/counters.test.ts src/domain/counters/max-team.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 578ce7bd21f7314f4f3fddce04edd629712e79c1 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-6 task 2b: counters for max battles, by role`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/util/counters-dialog.test.ts b/src/commands/util/counters-dialog.test.ts
index 652d5d846d8a6d5dd45f8c1f0fb03debf53103a0..2c906fb65321ccbdd11fa5dd76a3dd1070e4f029 100644
--- a/src/commands/util/counters-dialog.test.ts
+++ b/src/commands/util/counters-dialog.test.ts
@@ -13,7 +13,7 @@ import {
 import { WEST_FORUM } from '../../../test/support/gyms.js';
 import { buttonsOf, textDisplays } from '../../../test/support/messages.js';
 import { ALICE, BOB } from '../../../test/support/parties.js';
-import { reportedRaid } from '../../../test/support/party-service.js';
+import { reportedMax, reportedRaid } from '../../../test/support/party-service.js';
 import { FakePokebattler } from '../../../test/support/pokebattler.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryUsers } from '../../../test/support/users.js';
@@ -21,7 +21,7 @@ import type { V2Message } from '../../discord/party-gateway.js';
 import { decodeCustomId } from '../../discord/custom-id.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
-import { bossMovesets, counters, KeptCounterOptions, keptCounters } from './counters.js';
+import { bossMovesets, counters, isKeptMax, KeptCounterOptions, keptCounters } from './counters.js';
 import { countersControls, countersDialog, NOT_KEPT } from './counters-dialog.js';
 
 /** The form as the fake recorded it. */
@@ -132,6 +132,7 @@ describe('/counters: Change options…', () => {
     expect(first.optionsId).toMatch(/^counters:[0-9a-f]{16}:options$/);
     expect(second.token).not.toBe(first.token);
     expect(keptCounters.get(first.token)).toMatchObject({
+      kind: 'raid',
       bossKey: 'mewtwo',
       tier: { level: 'T5', shadow: false },
       attackers: { kind: 'level', level: '40' },
@@ -179,6 +180,7 @@ describe('/counters: Change options…', () => {
     const entry = made.ctx.gameData.catalogue.byKey('mew');
     if (!entry) throw new Error('no mew');
     const kept = {
+      kind: 'raid',
       bossKey: 'mew',
       tier: { level: 'T5', shadow: false },
       attackers: { kind: 'level', level: '40' },
@@ -251,7 +253,7 @@ describe('/counters: Change options…', () => {
       weather: 'WINDY',
     });
     // The old token stays good for its own message.
-    expect(keptCounters.get(token)?.weather).toBe('NO_WEATHER');
+    expect(keptCounters.get(token)).toMatchObject({ weather: 'NO_WEATHER' });
   });
 
   it('gives anybody else a private copy and leaves the public answer alone', async () => {
@@ -422,7 +424,7 @@ describe('/counters: Change options…', () => {
     const { token } = await made.ask();
     const kept = keptCounters.get(token);
     const entry = made.ctx.gameData.catalogue.byKey('mewtwo');
-    if (!kept || !entry) throw new Error('nothing kept');
+    if (!kept || isKeptMax(kept) || !entry) throw new Error('nothing kept');
     const form = countersDialog(
       made.ctx,
       token,
@@ -461,6 +463,7 @@ describe('KeptCounterOptions', () => {
 
 function keptCountersValue() {
   return {
+    kind: 'raid',
     bossKey: 'mewtwo',
     tier: { level: 'T5', shadow: false },
     attackers: { kind: 'box' },
@@ -474,3 +477,84 @@ function keptCountersValue() {
     partyId: null,
   } as const;
 }
+
+describe('/counters: Change options… under a max battle team', () => {
+  async function maxSetup() {
+    const pokebattler = new FakePokebattler();
+    const max = await reportedMax();
+    const { ctx } = createTestContext({ pokebattler, parties: max.store, regions: max.regions });
+    const router = new InteractionRouter(ctx, [counters], [countersControls], {
+      now: () => 1_800_000_000_000,
+    });
+    const where: FakeOptions = { channelId: max.postId, thread: { parentId: WEST_FORUM } };
+    const used = fakeChatInput({ commandName: 'counters', userId: ALICE, options: {}, ...where });
+    await router.handle(used as never);
+    const answer = asV2(sent(used.editReply));
+    const token =
+      buttonsOf(answer)
+        .find((b) => b.label === 'Change options…')
+        ?.customId?.split(':')[1] ?? '';
+    const open = async (userId: string) => {
+      const press = fakeButton({ customId: `counters:${token}:options`, userId, ...where });
+      await router.handle(press as never);
+      return press;
+    };
+    return { pokebattler, max, router, where, token, open };
+  }
+
+  it('asks the role and the level, as the answer had them', async () => {
+    const made = await maxSetup();
+    const form = formOf(await made.open(BOB));
+    checkModal(form);
+    expect(form.title).toBe('Team against Dynamax Machamp (2★)');
+    expect(form.components.map((component) => component.label)).toEqual([
+      'Your role',
+      'Level of your Pokémon',
+    ]);
+    expect(valuesIn(form, 'Your role')).toEqual(['attacker', 'balanced', 'tank', 'healer']);
+    expect(selectedIn(form, 'Your role')).toEqual(['attacker']);
+    // The levels of a team: no best buddy levels.
+    expect(valuesIn(form, 'Level of your Pokémon')).toEqual([
+      '20',
+      '25',
+      '30',
+      '35',
+      '40',
+      '45',
+      '50',
+    ]);
+    expect(selectedIn(form, 'Level of your Pokémon')).toEqual(['40']);
+  });
+
+  it('changes the asker’s public answer to the team of the role chosen', async () => {
+    const made = await maxSetup();
+    const shown = (await made.open(ALICE)).showModal.mock.calls[0]?.[0];
+    const form = fakeModal({
+      customId: `counters:${made.token}:dialog`,
+      userId: ALICE,
+      askedBy: ALICE,
+      form: shown,
+      selected: { role: ['tank'], level: ['30'] },
+      ...made.where,
+    });
+    await made.router.handle(form as never);
+    expect(form.deferUpdate).toHaveBeenCalledOnce();
+    expect(made.pokebattler.maxAsked.at(-1)).toEqual({
+      boss: 'MACHAMP',
+      maxLevel: 'RAID_LEVEL_2_MAX',
+      role: 'tank',
+      level: '30',
+    });
+    const changed = asV2(sent(form.editReply));
+    expect(textDisplays(changed)[0]).toContain('your role: Tank, an attacker and two tanks');
+    const newToken = buttonsOf(changed)
+      .find((b) => b.label === 'Change options…')
+      ?.customId?.split(':')[1];
+    expect(keptCounters.get(newToken ?? '')).toMatchObject({
+      kind: 'max',
+      role: 'tank',
+      level: '30',
+      partyId: made.max.party.id,
+    });
+  });
+});
diff --git a/src/commands/util/counters-dialog.ts b/src/commands/util/counters-dialog.ts
index 86ed85b0846adc357bdae3cd76557cfbd6c051c3..98308c32f21b072f228cb8e762652d8a2a1c99c2 100644
--- a/src/commands/util/counters-dialog.ts
+++ b/src/commands/util/counters-dialog.ts
@@ -25,23 +25,28 @@ import {
 import type { PokemonEntry } from '../../domain/pogo/game-master.js';
 import { cutText } from '../../render/party-post.js';
 import {
+  answeredMessage,
+  askPokebattler,
   attackersOf,
   AVERAGE_MOVESET,
   bossMovesets,
   COUNTERS_ACTIONS,
   COUNTERS_KIND,
   COUNTERS_THROTTLE,
-  countersMessage,
   keptCounters,
   movesetName,
   movesetValue,
   POKEBOX,
   pokebattlerTarget,
   serverOf,
-  simulate,
+  isKeptMax,
+  isMaxPlan,
+  type AnyCounterPlan,
   type CounterPlan,
+  type KeptAnswer,
   type KeptCounters,
 } from './counters.js';
+import { maxCountersDialog, maxDialogPlan } from './max-counters.js';
 
 /** What a press is told when the options of an answer are no longer kept. */
 export const NOT_KEPT = 'These options are no longer kept. Use `/counters` again.';
@@ -173,7 +178,7 @@ export function countersDialog(
 }
 
 /** The boss of kept options, as the game data has it now. */
-function keptBoss(ctx: AppContext, kept: KeptCounters): PokemonEntry {
+function keptBoss(ctx: AppContext, kept: Pick<KeptAnswer, 'bossKey'>): PokemonEntry {
   const entry = ctx.gameData.catalogue.byKey(kept.bossKey);
   if (!entry) throw new UserError(NOT_KEPT);
   return entry;
@@ -228,6 +233,7 @@ async function dialogPlan(
   );
   const also = new Set(tickedBoxes(interaction));
   return {
+    kind: 'raid',
     entry,
     tier: kept.tier,
     raidLevel,
@@ -253,9 +259,21 @@ const requireDialogPlan: Guard = async (interaction, ctx) => {
   if (id?.action !== COUNTERS_ACTIONS.dialog) return;
   const kept = keptCounters.get(id.id);
   if (!kept) throw new UserError(NOT_KEPT);
-  await dialogPlan(interaction, ctx, kept);
+  await anyDialogPlan(interaction, ctx, kept);
 };
 
+/** The plan of a submitted dialog: of a max battle answer's (plan 8X-6), or of a raid answer's. */
+async function anyDialogPlan(
+  interaction: ModalSubmitInteraction,
+  ctx: AppContext,
+  kept: KeptAnswer,
+): Promise<AnyCounterPlan> {
+  if (isKeptMax(kept)) {
+    return maxDialogPlan(interaction, keptBoss(ctx, kept), kept, ctx.gameData.catalogue);
+  }
+  return dialogPlan(interaction, ctx, kept);
+}
+
 /**
  * "Change options…" under an answer of `/counters` and its dialog (plan 8B-2; custom ids
  * `counters:<token>:options` and `counters:<token>:dialog`, the token that of the answer's kept
@@ -284,6 +302,15 @@ export const countersControls: ComponentHandler = {
     const kept = keptCounters.get(id.id);
     if (!kept) throw new UserError(NOT_KEPT);
     const entry = keptBoss(ctx, kept);
+    if (isKeptMax(kept)) {
+      const dialogId = encodeCustomId({
+        kind: COUNTERS_KIND,
+        id: id.id,
+        action: COUNTERS_ACTIONS.dialog,
+      });
+      await interaction.showModal(maxCountersDialog(dialogId, kept, entry));
+      return;
+    }
     const hasBox = (await ctx.users.get(interaction.user.id)).pokebattlerId !== null;
     await interaction.showModal(countersDialog(ctx, id.id, kept, entry, hasBox));
   },
@@ -292,18 +319,20 @@ export const countersControls: ComponentHandler = {
     const kept = keptCounters.get(id.id);
     if (!kept) throw new UserError(NOT_KEPT);
     // Read again after the guard, which refused what does not fit before the use was counted.
-    const plan = await dialogPlan(interaction, ctx, kept);
+    const plan = await anyDialogPlan(interaction, ctx, kept);
     const postGone = (): boolean =>
       kept.partyId !== null && ctx.parties.get(kept.partyId) === undefined;
-    let how = pressAnswer(interaction, { onlyPrivate: plan.attackers.kind === 'box' });
+    let how = pressAnswer(interaction, {
+      onlyPrivate: !isMaxPlan(plan) && plan.attackers.kind === 'box',
+    });
     if (how === 'update' && postGone()) how = 'copy';
     await deferPress(interaction, how);
-    const simulated = await simulate(ctx, plan);
+    const answered = await askPokebattler(ctx, plan);
     // The party may have ended while Pokebattler was asked: its archived post is left alone, and
     // the answer is the member's.
     const gone = how === 'update' && postGone();
     const changed = how === 'update' && !gone;
-    const message = countersMessage(ctx, plan, simulated, {
+    const message = answeredMessage(ctx, answered, {
       guildId: serverOf(interaction),
       askerId: changed ? kept.askerId : interaction.user.id,
       partyId: changed ? kept.partyId : null,
diff --git a/src/commands/util/counters-words.ts b/src/commands/util/counters-words.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0b697b8ba22ca04ab76f1801005e9b95aaa1e5fc
--- /dev/null
+++ b/src/commands/util/counters-words.ts
@@ -0,0 +1,24 @@
+import type { PokebattlerFailure } from '../../services/pokebattler-gateway.js';
+
+/**
+ * What a member is told when Pokebattler gave nothing for a reason that is not about the boss
+ * (no answer, too many asking, an answer that could not be read): the same for the raid counters
+ * and the max battle teams. Undefined for `unknown` and `empty`, which each says in its own words.
+ */
+export function troubleText(reason: PokebattlerFailure['reason']): string | undefined {
+  switch (reason) {
+    case 'unknown':
+    case 'empty':
+      return undefined;
+    case 'refused':
+    case 'timeout':
+    case 'unreachable':
+    case 'unavailable':
+      return 'Pokebattler did not answer just now. Please try again later.';
+    case 'busy':
+      return 'Many are asking Pokebattler just now. Please try again in a minute.';
+    case 'too-large':
+    case 'unreadable':
+      return 'The answer of Pokebattler could not be read. Please try again later.';
+  }
+}
diff --git a/src/commands/util/counters.test.ts b/src/commands/util/counters.test.ts
index adae21edb3623a04530b11f309e1e383642c6ea2..cfb7dfdd3b7f016420119303747facd24ccb2ffd 100644
--- a/src/commands/util/counters.test.ts
+++ b/src/commands/util/counters.test.ts
@@ -8,15 +8,27 @@ import {
   type FakeInteraction,
 } from '../../../test/support/fake-interactions.js';
 import { WEST_FORUM } from '../../../test/support/gyms.js';
-import { linksOf, textDisplays, textOf, thumbnailOf } from '../../../test/support/messages.js';
+import {
+  buttonsOf,
+  linksOf,
+  sectionsOf,
+  textDisplays,
+  textOf,
+  thumbnailBeside,
+  thumbnailOf,
+} from '../../../test/support/messages.js';
+import { catalogueFixture, iconsFixture } from '../../../test/support/game-data.js';
+import { maxBossServiceWith } from '../../../test/support/max-boss-service.js';
 import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { ALICE } from '../../../test/support/parties.js';
-import { createdTrain, reportedRaid } from '../../../test/support/party-service.js';
-import { FakePokebattler } from '../../../test/support/pokebattler.js';
+import { createdTrain, reportedMax, reportedRaid } from '../../../test/support/party-service.js';
+import { FakePokebattler, recordedTeam } from '../../../test/support/pokebattler.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryUsers } from '../../../test/support/users.js';
 import type { V2Message } from '../../discord/party-gateway.js';
 import { InteractionRouter } from '../../discord/router.js';
+import type { MaxTier } from '../../domain/pogo/max-tier.js';
+import type { MaxBossProvider } from '../../services/max-boss-service.js';
 import { counters } from './counters.js';
 
 function setup(overrides: Parameters<typeof createTestContext>[0] = {}) {
@@ -64,6 +76,7 @@ describe('/counters: the command', () => {
     expect(json.options?.map((option) => [option.name, option.required ?? false])).toEqual([
       ['boss', false],
       ['tier', false],
+      ['role', false],
       ['level', false],
       ['weather', false],
       ['friendship', false],
@@ -88,7 +101,14 @@ describe('/counters: the command', () => {
       'shadow:T1',
       'shadow:T3',
       'shadow:T5',
+      'D1',
+      'D2',
+      'D3',
+      'D4',
+      'D5',
+      'G',
     ]);
+    expect(choices('role')).toEqual(['attacker', 'balanced', 'tank', 'healer']);
     expect(choices('level')).toEqual(['20', '25', '30', '35', '40', '41', '45', '50', '51', 'box']);
     expect(choices('friendship')).toEqual(['0', '1', '2', '3', '4']);
     expect(counters.throttle).toEqual({ uses: 3, perSeconds: 60 });
@@ -218,10 +238,11 @@ describe('/counters: elsewhere than in a raid post', () => {
   it('refuses what it can before Pokebattler is asked, without counting it', async () => {
     const made = setup();
     expect(told(await made.run({}))).toBe(
-      'Say which boss with `boss`, or use this in the post of a raid, where it is that raid’s.',
+      'Say which boss with `boss`, or use this in the post of a raid or a max battle, where it ' +
+        'is that battle’s.',
     );
     expect(told(await made.run({ boss: 'rattata' }))).toBe(
-      'Rattata is not a raid boss now. Say which tier to simulate with `tier`.',
+      'Rattata is not a raid or max battle boss now. Say which tier to simulate with `tier`.',
     );
     expect(told(await made.run({ boss: 'blastoise_mega', tier: 'shadow:T5' }))).toBe(
       'Mega Blastoise is never the boss of a shadow raid.',
@@ -367,7 +388,7 @@ describe('/counters: more in the posts of parties', () => {
     const described = (name: string) =>
       json.options?.find((option) => option.name === name)?.description ?? '';
     expect(described('tier')).toBe(
-      'The tier; when left out, that of the raid whose post this is, else the boss’s now',
+      'The tier; when left out, that of the raid or max battle whose post this is, else the boss’s now',
     );
     expect(described('shadow')).toBe(
       'List shadow Pokémon as counters (a Pokébox lists them unless False)',
@@ -493,4 +514,341 @@ describe('/counters: the lists while typing', () => {
       { name: 'Average of all movesets', value: 'average' },
     ]);
   });
+
+  it('offers no boss moves for a max battle, whose team takes none', async () => {
+    const made = setup();
+    const interaction = fakeAutocomplete({
+      commandName: 'counters',
+      focusedName: 'moveset',
+      focused: '',
+      options: { boss: 'mewtwo', tier: 'D5' },
+    });
+    await made.router.handle(interaction as never);
+    expect(interaction.respond).toHaveBeenCalledWith([]);
+    const max = await reportedMax();
+    const inMax = setup({ parties: max.store, regions: max.regions });
+    const inPost = fakeAutocomplete({
+      commandName: 'counters',
+      focusedName: 'moveset',
+      focused: '',
+      channelId: max.postId,
+      thread: { parentId: WEST_FORUM },
+    });
+    await inMax.router.handle(inPost as never);
+    expect(inPost.respond).toHaveBeenCalledWith([]);
+    // A boss typed without a tier that is no raid boss now and is a max boss is its max battle.
+    const listed = setup({ maxBosses: listing('uxie', 'D5') });
+    const typed = fakeAutocomplete({
+      commandName: 'counters',
+      focusedName: 'moveset',
+      focused: '',
+      options: { boss: 'uxie' },
+    });
+    await listed.router.handle(typed as never);
+    expect(typed.respond).toHaveBeenCalledWith([]);
+  });
 });
+
+describe('/counters: max battles', () => {
+  /** With the game's icons, so that the team has its pictures. */
+  const withIcons = { gameData: { catalogue: catalogueFixture(), icons: iconsFixture() } };
+  const inPost = (postId: string) => ({ channelId: postId, thread: { parentId: WEST_FORUM } });
+
+  it('shows Pokebattler’s team for an attacker against a max boss, privately', async () => {
+    const made = setup(withIcons);
+    const used = await made.run({ boss: 'uxie', tier: 'D5' });
+    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(made.pokebattler.maxAsked).toEqual([
+      { boss: 'UXIE', maxLevel: 'RAID_LEVEL_5_MAX', role: 'attacker', level: '40' },
+    ]);
+    expect(made.pokebattler.asked).toEqual([]);
+    const answer = answerOf(used);
+    const [head = '', ...rest] = textDisplays(answer);
+    expect(head).toBe(
+      '### Max battle team against Dynamax Uxie (5★)\n' +
+        'Psychic · your role: Attacker, three attackers',
+    );
+    // Each of the three with its role and moves, no charged move where Pokebattler names none.
+    expect(sectionsOf(answer).map((section) => section.text)).toEqual([
+      head,
+      '**Attacker** · Zacian (Crowned Sword)\n-# Metal Claw (Steel)',
+      '**Attacker** · Hydreigon\n-# Bite (Dark)',
+      '**Attacker** · Gigantamax Gengar\n-# Sucker Punch (Dark)',
+    ]);
+    // The alternatives once for the three attackers, whose alternatives are the same.
+    expect(rest.filter((text) => text.startsWith('-# Other'))).toEqual([
+      '-# Other attackers: Zamazenta (Crowned Shield) (Metal Claw) · Metagross (Fury Cutter) · ' +
+        'Gigantamax Rillaboom (Scratch) · Weavile (Feint Attack) · Gigantamax Cinderace (Tackle)',
+    ]);
+    expect(rest).toContain(
+      '-# Pokémon at level 40 · Max Attack level 1, Max Guard 3, Max Spirit 3',
+    );
+    expect(rest).toContain('-# Data provided by Pokebattler');
+    // Gigantamax Pokémon are pictured as Gigantamax; the role's page on Pokebattler's site.
+    expect(thumbnailBeside(answer, '**Attacker** · Gigantamax Gengar')).toMatch(
+      /pm94\.fGIGANTAMAX\.icon\.png$/,
+    );
+    expect(linksOf(answer)).toEqual(['Full results https://www.pokebattler.com/max/UXIE']);
+    expect(buttonsOf(answer).map((button) => button.label)).toEqual([
+      'Change options…',
+      'Full results',
+    ]);
+    expectV2Sendable(answer);
+  });
+
+  it('asks for the role’s team, at the level, and a Gigantamax boss by its Gigantamax name', async () => {
+    const made = setup(withIcons);
+    made.pokebattler.maxAnswer = recordedTeam('gmax-machamp-2-0-1');
+    const used = await made.run({ boss: 'machamp', tier: 'G', role: 'balanced', level: '30' });
+    expect(made.pokebattler.maxAsked).toEqual([
+      { boss: 'MACHAMP_GIGANTAMAX', maxLevel: 'RAID_LEVEL_6_MAX', role: 'balanced', level: '30' },
+    ]);
+    const answer = answerOf(used);
+    expect(textDisplays(answer)[0]).toBe(
+      '### Max battle team against Gigantamax Machamp\n' +
+        'Fighting · your role: Balanced, two attackers and a tank',
+    );
+    expect(thumbnailOf(answer)).toMatch(/pm68\.fGIGANTAMAX\.icon\.png$/);
+    expect(linksOf(answer)).toEqual([
+      'Full results https://www.pokebattler.com/max/MACHAMP_GIGANTAMAX/PARTY',
+    ]);
+    const texts = sectionsOf(answer).map((section) => section.text);
+    expect(texts).toContain(
+      '**Tank** · Zamazenta (Crowned Shield)\n-# Metal Claw (Steel) / Moonblast (Fairy)',
+    );
+    expect(textOf(answer)).toContain('-# Other tanks: Gigantamax Venusaur (Vine Whip)');
+    // The level the answer was simulated at, as Pokebattler says (here 40).
+    expect(textOf(answer)).toContain('-# Pokémon at level 40 ·');
+  });
+
+  it('shows the types of the moves as emoji where the server or the application has them', async () => {
+    const made = setup({ ...withIcons, emoji: { find: (name) => `<:${name}:1>` } });
+    const answer = answerOf(await made.run({ boss: 'uxie', tier: 'D5' }));
+    expect(textDisplays(answer)[0]).toContain('<:psychic:1> · your role');
+    expect(textOf(answer)).toContain('**Attacker** · Hydreigon\n-# <:dark:1> Bite');
+  });
+
+  it('refuses what a max battle team does not take, before Pokebattler is asked', async () => {
+    const made = setup();
+    expect(told(await made.run({ boss: 'uxie', tier: 'D5', weather: 'WINDY' }))).toBe(
+      'Pokebattler’s max battle teams take no `weather`: leave it out.',
+    );
+    expect(
+      told(await made.run({ boss: 'uxie', tier: 'D5', friendship: '2', shadow: true, mega: true })),
+    ).toBe(
+      'Pokebattler’s max battle teams take no `friendship`, `shadow` or `mega`: leave them out.',
+    );
+    expect(told(await made.run({ boss: 'uxie', tier: 'D5', level: 'box' }))).toBe(
+      'Pokebattler’s max battle teams cannot use your Pokébox: pick a level, or leave `level` out.',
+    );
+    // A best buddy is one Pokémon at a time: a team at level 41 or 51 makes no sense (Matt).
+    for (const level of ['41', '51']) {
+      expect(told(await made.run({ boss: 'uxie', tier: 'D5', level }))).toBe(
+        'A max battle team is simulated at level 20, 25, 30, 35, 40, 45 or 50: pick one of those.',
+      );
+    }
+    expect(told(await made.run({ boss: 'yveltal', tier: 'T5', role: 'tank' }))).toBe(
+      '`role` is for max battles: leave it out for a raid.',
+    );
+    expect(told(await made.run({ boss: 'gengar_mega', tier: 'G' }))).toBe(
+      'Mega Gengar never battles in a max battle.',
+    );
+    expect(made.pokebattler.maxAsked).toEqual([]);
+    expect(made.pokebattler.asked).toEqual([]);
+  });
+
+  it('says so when Pokebattler gave no team', async () => {
+    const made = setup();
+    made.pokebattler.known = new Set();
+    expect(told(await made.run({ boss: 'machamp', tier: 'G' }))).toBe(
+      'Pokebattler does not know Gigantamax Machamp as a max battle boss.',
+    );
+    made.pokebattler.failing = { ok: false, reason: 'empty' };
+    expect(told(await made.run({ boss: 'uxie', tier: 'D5' }))).toBe(
+      'Pokebattler suggests no team against Dynamax Uxie (5★).',
+    );
+    made.pokebattler.failing = { ok: false, reason: 'timeout' };
+    expect(told(await made.run({ boss: 'uxie', tier: 'D5' }))).toBe(
+      'Pokebattler did not answer just now. Please try again later.',
+    );
+  });
+
+  it('names a Pokémon the game data does not know by Pokebattler’s name, and logs it', async () => {
+    const made = setup();
+    const team = recordedTeam('uxie-d5-3-0-0');
+    const [first, ...others] = team.slots;
+    if (!first) throw new Error('the recorded team has no slots');
+    made.pokebattler.maxAnswer = {
+      slots: [{ ...first, pick: { ...first.pick, pokemonId: 'NEWMON_GIGANTAMAX' } }, ...others],
+    };
+    const answer = answerOf(await made.run({ boss: 'uxie', tier: 'D5' }));
+    expect(textOf(answer)).toContain('**Attacker** · Gigantamax Newmon');
+    expect(
+      made.entries.find(
+        (entry) => entry.msg === 'Pokebattler named Pokémon the game data does not know',
+      ),
+    ).toMatchObject({ pokemonIds: ['NEWMON_GIGANTAMAX'] });
+  });
+
+  it('takes the max tier a Pokémon is a boss of now when no tier is named', async () => {
+    const bosses = await maxBossServiceWith();
+    await bosses.service.sync();
+    const made = setup({ maxBosses: bosses.service });
+    await made.run({ boss: 'duraludon' });
+    expect(made.pokebattler.maxAsked[0]).toMatchObject({
+      boss: 'DURALUDON',
+      maxLevel: 'RAID_LEVEL_4_MAX',
+    });
+  });
+
+  it('takes the boss and tier of a max battle’s post, for everybody there', async () => {
+    const max = await reportedMax();
+    const made = setup({ parties: max.store, regions: max.regions });
+    const used = await made.run({ role: 'healer' }, inPost(max.postId));
+    expect(used.deferReply).toHaveBeenCalledWith({});
+    expect(made.pokebattler.maxAsked).toEqual([
+      { boss: 'MACHAMP', maxLevel: 'RAID_LEVEL_2_MAX', role: 'healer', level: '40' },
+    ]);
+    expect(textDisplays(answerOf(used))[0]).toMatch(
+      /^### Max battle team against Dynamax Machamp \(2★\)\n/,
+    );
+    // A boss named there is simulated in the battle's tier, unless a tier is named.
+    await made.run({ boss: 'uxie' }, inPost(max.postId));
+    expect(made.pokebattler.maxAsked[1]).toMatchObject({
+      boss: 'UXIE',
+      maxLevel: 'RAID_LEVEL_2_MAX',
+    });
+    await made.run({ boss: 'yveltal', tier: 'T5' }, inPost(max.postId));
+    expect(made.pokebattler.asked[0]).toMatchObject({ boss: 'YVELTAL', raidLevel: 'RAID_LEVEL_5' });
+  });
+
+  it('says that the tier of a max battle’s post was used for a mega', async () => {
+    const max = await reportedMax();
+    const made = setup({ parties: max.store, regions: max.regions });
+    expect(told(await made.run({ boss: 'gengar_mega' }, inPost(max.postId)))).toBe(
+      'Mega Gengar never battles in a max battle. I took the tier of this post (Dynamax 2★): ' +
+        'name another with `tier`.',
+    );
+  });
+
+  it('refuses Gigantamax for a Pokémon the game never has so, without counting it', async () => {
+    const made = setup();
+    for (let i = 0; i < 4; i += 1) {
+      expect(told(await made.run({ boss: 'uxie', tier: 'G' }))).toBe(
+        'Uxie has no Gigantamax battle in the game: name a Dynamax tier with `tier`.',
+      );
+    }
+    expect(made.pokebattler.maxAsked).toEqual([]);
+    // Refusals are not counted: the three of a minute are all left.
+    await made.run({ boss: 'uxie', tier: 'D5' });
+    expect(made.pokebattler.maxAsked).toHaveLength(1);
+  });
+
+  it('asks for a species’ Gigantamax forms where it has them', async () => {
+    const made = setup();
+    made.pokebattler.known = new Set(['TOXTRICITY_AMPED_GIGANTAMAX']);
+    await made.run({ boss: 'toxtricity', tier: 'G' });
+    expect(made.pokebattler.maxAsked.map((query) => query.boss)).toEqual([
+      'TOXTRICITY_GIGANTAMAX',
+      'TOXTRICITY_AMPED_GIGANTAMAX',
+    ]);
+  });
+
+  it('reads “Gigantamax” or “Dynamax” before the boss as /max does', async () => {
+    const made = setup();
+    await made.run({ boss: 'Gigantamax Machamp' });
+    expect(made.pokebattler.maxAsked[0]).toMatchObject({
+      boss: 'MACHAMP_GIGANTAMAX',
+      maxLevel: 'RAID_LEVEL_6_MAX',
+    });
+    await made.run({ boss: 'Dynamax Uxie', tier: 'D5' });
+    expect(made.pokebattler.maxAsked[1]).toMatchObject({
+      boss: 'UXIE',
+      maxLevel: 'RAID_LEVEL_5_MAX',
+    });
+    expect(told(await made.run({ boss: 'Gigantamax Machamp', tier: 'T5' }))).toBe(
+      'Gigantamax Machamp is a Gigantamax battle: leave `tier` out, or name Gigantamax.',
+    );
+    expect(told(await made.run({ boss: 'Dynamax Uxie', tier: 'G' }))).toBe(
+      'Dynamax Uxie is a Dynamax battle: name a Dynamax tier with `tier`.',
+    );
+  });
+
+  it('takes the listed boss of a species named whose form is on the list', async () => {
+    const catalogue = catalogueFixture();
+    const amped = catalogue.byKey('toxtricity_amped');
+    const made = setup({
+      maxBosses: {
+        bosses: () => [
+          {
+            pokemonId: 'TOXTRICITY',
+            form: 'TOXTRICITY_AMPED',
+            key: 'toxtricity_amped',
+            tier: 'G',
+            shiny: false,
+            name: amped?.name ?? '',
+            entry: amped,
+            source: 'feed',
+            autoset: false,
+          },
+        ],
+        coming: () => [],
+        hidden: () => [],
+        feedBosses: () => [],
+      },
+    });
+    await made.run({ boss: 'toxtricity' });
+    expect(made.pokebattler.maxAsked[0]).toMatchObject({
+      boss: 'TOXTRICITY_AMPED_GIGANTAMAX',
+      maxLevel: 'RAID_LEVEL_6_MAX',
+    });
+  });
+
+  it('asks for a Gigantamax boss of the list the game data does not have so yet', async () => {
+    // Pokebattler's feed lists Uxie at Gigantamax; the game master has no Gigantamax Uxie.
+    const made = setup({ maxBosses: listing('uxie', 'G') });
+    await made.run({ boss: 'uxie', tier: 'G' });
+    expect(made.pokebattler.maxAsked[0]).toMatchObject({
+      boss: 'UXIE_GIGANTAMAX',
+      maxLevel: 'RAID_LEVEL_6_MAX',
+    });
+    // Off the list it is still refused.
+    expect(told(await made.run({ boss: 'mewtwo', tier: 'G' }))).toBe(
+      'Mewtwo has no Gigantamax battle in the game: name a Dynamax tier with `tier`.',
+    );
+  });
+
+  it('reads a Dynamax species as the listed form, as without the word', async () => {
+    const made = setup({ maxBosses: listing('toxtricity_amped', 'D4') });
+    await made.run({ boss: 'Dynamax Toxtricity' });
+    await made.run({ boss: 'toxtricity' });
+    expect(made.pokebattler.maxAsked.map((query) => query.boss)).toEqual([
+      'TOXTRICITY_AMPED_FORM',
+      'TOXTRICITY_AMPED_FORM',
+    ]);
+  });
+});
+
+/** A max boss list of one boss, by its catalogue key and tier. */
+function listing(key: string, tier: MaxTier): MaxBossProvider {
+  const entry = catalogueFixture().byKey(key);
+  if (!entry) throw new Error(`no ${key} in the fixture`);
+  return {
+    bosses: () => [
+      {
+        pokemonId: entry.pokemonId,
+        form: entry.form,
+        key,
+        tier,
+        shiny: false,
+        name: entry.name,
+        entry,
+        source: 'feed',
+        autoset: false,
+      },
+    ],
+    coming: () => [],
+    hidden: () => [],
+    feedBosses: () => [],
+  };
+}
diff --git a/src/commands/util/counters.ts b/src/commands/util/counters.ts
index f2f4a2d430ded20c5fa5840cd84d18c0ea383965..43a1bf3ab5eab8aa26a282fd8bd927a09fffa9ff 100644
--- a/src/commands/util/counters.ts
+++ b/src/commands/util/counters.ts
@@ -39,7 +39,9 @@ import {
   type Friendship,
 } from '../../domain/counters/options.js';
 import type { BossMovesetCounters } from '../../domain/counters/pokebattler-answer.js';
-import { bossOf, isRaid, isTrain, type Party } from '../../domain/party/party.js';
+import { MAX_ROLE_KEYS, MAX_ROLES } from '../../domain/counters/max-team.js';
+import { bossOf, isMax, isRaid, isTrain, type Party } from '../../domain/party/party.js';
+import { isMaxTier, MAX_TIERS, maxTierLabel, type MaxTier } from '../../domain/pogo/max-tier.js';
 import type { PokemonCatalogue } from '../../domain/pogo/catalogue.js';
 import type { Move, PokemonEntry } from '../../domain/pogo/game-master.js';
 import { parseMoveset } from '../../domain/pogo/move-search.js';
@@ -58,6 +60,15 @@ import { plain, truncate } from '../../render/text.js';
 import type { CounterOutcome } from '../../services/pokebattler-gateway.js';
 import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
 import { namedPokemon, pokemonChoices } from '../pokemon-option.js';
+import { troubleText } from './counters-words.js';
+import {
+  maxTeamMessage,
+  readMaxPlan,
+  simulateMax,
+  type KeptMaxCounters,
+  type MaxCounterPlan,
+  type SimulatedTeam,
+} from './max-counters.js';
 
 /** An outside request: three in a minute (brief of plan 6B). */
 export const COUNTERS_THROTTLE: Throttle = { uses: 3, perSeconds: 60 };
@@ -67,14 +78,16 @@ export const POKEBOX = 'box';
 /** The `moveset` value of the average of all the boss's movesets. */
 export const AVERAGE_MOVESET = 'average';
 
-/** The tiers as the `tier` option offers them: `T5`, `shadow:T5`. */
+/** The raid tiers as the `tier` option offers them: `T5`, `shadow:T5`; the max tiers after them. */
 const TIER_CHOICES: readonly RaidTier[] = [
   ...RAID_LEVELS.map((level) => ({ level, shadow: false })),
   ...SHADOW_RAID_LEVELS.map((level) => ({ level, shadow: true })),
 ];
 const tierValue = (tier: RaidTier): string => `${tier.shadow ? 'shadow:' : ''}${tier.level}`;
 
-function readTier(value: string): RaidTier {
+/** A raid tier (`T5`, `shadow:T5`) or a max tier (`D5`, `G`, plan 8X-6) of the `tier` option. */
+function readTier(value: string): RaidTier | MaxTier {
+  if (isMaxTier(value)) return value;
   const [first, second] = value.split(':');
   const shadow = first === 'shadow';
   const level = shadow ? second : first;
@@ -85,6 +98,7 @@ function readTier(value: string): RaidTier {
 
 /** Everything a use of `/counters` asks for, read before anything is sent. */
 export interface CounterPlan {
+  kind: 'raid';
   entry: PokemonEntry;
   tier: RaidTier;
   raidLevel: string;
@@ -98,11 +112,47 @@ export interface CounterPlan {
   single: boolean;
 }
 
-/** The post of a party with a boss, where the boss and the tier need not be named. */
+/**
+ * The post of a party with a boss, where the boss and the tier need not be named: a raid, a
+ * train, a max battle (plan 8X-6).
+ */
 export function bossParty(interaction: LocatedInteraction, ctx: AppContext): Party | undefined {
   if (!interaction.inGuild()) return undefined;
   const party = partyOf(interaction, ctx);
-  return party && (isRaid(party) || isTrain(party)) ? party : undefined;
+  return party && (isRaid(party) || isTrain(party) || isMax(party)) ? party : undefined;
+}
+
+/**
+ * The max boss a Pokémon is now (plan 8X-6), from the max boss list: the Pokémon itself, or for a
+ * species one of its forms that is listed (Toxtricity for a listed Amped Toxtricity), which is
+ * then the boss; of several the most stars, Gigantamax last (Gigantamax loses design conflicts
+ * to Dynamax), and only Dynamax ones with `dynamaxOnly`. Undefined when it is no max boss now.
+ */
+export function currentMaxBoss(
+  ctx: AppContext,
+  entry: PokemonEntry,
+  dynamaxOnly = false,
+): { entry: PokemonEntry; tier: MaxTier } | undefined {
+  const rank = (tier: MaxTier): number => (tier === 'G' ? -1 : MAX_TIERS.indexOf(tier));
+  const found = ctx.maxBosses
+    .bosses()
+    .flatMap((boss) => {
+      const listed = boss.entry;
+      if (!listed || (dynamaxOnly && boss.tier === 'G')) return [];
+      const same =
+        listed.key === entry.key ||
+        (entry.kind === 'species' && listed.dex === entry.dex && listed.kind !== 'mega');
+      return same ? [{ entry: listed, tier: boss.tier }] : [];
+    })
+    .sort((a, b) => rank(b.tier) - rank(a.tier));
+  return found[0];
+}
+
+/** `Gigantamax Machamp`, `G-Max Machamp`, `Dynamax Uxie`: the kind named and the rest (as `/max` reads it). */
+function maxKindOf(text: string): { gigantamax?: boolean; rest: string } {
+  const match = /^(gigantamax|g-?max|dynamax|d-?max)\s+(.+)$/i.exec(text.trim());
+  if (!match?.[1] || !match[2]) return { rest: text.trim() };
+  return { gigantamax: /^g/i.test(match[1]), rest: match[2] };
 }
 
 /**
@@ -121,35 +171,76 @@ export function currentTier(ctx: AppContext, entry: PokemonEntry): RaidTier | un
 
 /**
  * The boss and tier: the options, else the party of the post. `fromPost`: the tier is that of
- * the raid whose post this is, not one the member named.
+ * the raid or max battle whose post this is, not one the member named.
  */
 function bossAndTier(
   interaction: ChatInputCommandInteraction,
   ctx: AppContext,
-): { entry: PokemonEntry; tier: RaidTier; fromPost: boolean } {
+): { entry: PokemonEntry; tier: RaidTier | MaxTier; fromPost: boolean } {
   const typedBoss = interaction.options.getString('boss')?.trim() ?? '';
   const typedTier = interaction.options.getString('tier');
-  const tierOf = (entry: PokemonEntry, fallback: RaidTier | undefined): RaidTier => {
-    if (typedTier !== null) return readTier(typedTier);
-    const tier = fallback ?? currentTier(ctx, entry);
-    if (!tier) {
+  const named = (
+    entry: PokemonEntry,
+    fallback: RaidTier | MaxTier | undefined,
+  ): { entry: PokemonEntry; tier: RaidTier | MaxTier } => {
+    if (typedTier !== null) return { entry, tier: readTier(typedTier) };
+    if (fallback !== undefined) return { entry, tier: fallback };
+    const raid = currentTier(ctx, entry);
+    if (raid) return { entry, tier: raid };
+    const max = currentMaxBoss(ctx, entry);
+    if (!max) {
       throw new UserError(
-        `${plain(entry.name)} is not a raid boss now. Say which tier to simulate with \`tier\`.`,
+        `${plain(entry.name)} is not a raid or max battle boss now. Say which tier to simulate ` +
+          'with `tier`.',
       );
     }
-    return tier;
+    return max;
   };
   const party = bossParty(interaction, ctx);
-  // In the post of a raid its tier is what a boss named there is simulated in.
-  const raidTier = party && isRaid(party) ? party.raid.tier : undefined;
-  const fromPost = typedTier === null && raidTier !== undefined;
+  // In the post of a raid or max battle its tier is what a boss named there is simulated in.
+  const postTier =
+    party && isRaid(party) ? party.raid.tier : party && isMax(party) ? party.max.tier : undefined;
+  const fromPost = typedTier === null && postTier !== undefined;
   if (typedBoss !== '') {
-    const entry = namedPokemon(ctx, typedBoss);
-    return { entry, tier: tierOf(entry, raidTier), fromPost };
+    const kind = maxKindOf(typedBoss);
+    const entry = namedPokemon(ctx, kind.rest);
+    if (kind.gigantamax === true) {
+      // `Gigantamax Machamp` names its tier, as in `/max`.
+      if (typedTier !== null && typedTier !== 'G') {
+        throw new UserError(
+          `Gigantamax ${plain(entry.name)} is a Gigantamax battle: leave \`tier\` out, or name ` +
+            'Gigantamax.',
+        );
+      }
+      return { entry, tier: 'G', fromPost: false };
+    }
+    if (kind.gigantamax === false) {
+      const dynamaxOf = (tier: RaidTier | MaxTier | undefined): MaxTier | undefined =>
+        typeof tier === 'string' && tier !== 'G' ? tier : undefined;
+      // As without the word: the listed boss, a species' listed form among them.
+      const current = typedTier === null ? currentMaxBoss(ctx, entry, true) : undefined;
+      const tier =
+        typedTier === null
+          ? (dynamaxOf(postTier) ?? current?.tier)
+          : dynamaxOf(readTier(typedTier));
+      if (tier === undefined) {
+        throw new UserError(
+          `Dynamax ${plain(entry.name)} is a Dynamax battle: name a Dynamax tier with \`tier\`.`,
+        );
+      }
+      const fromPostTier = typedTier === null && dynamaxOf(postTier) !== undefined;
+      return {
+        entry: fromPostTier || !current ? entry : current.entry,
+        tier,
+        fromPost: fromPostTier,
+      };
+    }
+    return { ...named(entry, postTier), fromPost };
   }
   if (!party) {
     throw new UserError(
-      'Say which boss with `boss`, or use this in the post of a raid, where it is that raid’s.',
+      'Say which boss with `boss`, or use this in the post of a raid or a max battle, where it ' +
+        'is that battle’s.',
     );
   }
   const ref = bossOf(party);
@@ -167,7 +258,7 @@ function bossAndTier(
         'it is newer than the game data I have.',
     );
   }
-  return { entry, tier: tierOf(entry, raidTier), fromPost };
+  return { ...named(entry, postTier), fromPost };
 }
 
 /**
@@ -267,11 +358,25 @@ export function pokebattlerTarget(
   return { raidLevel, bosses };
 }
 
+/** A plan of either kind: a raid simulation or a max battle team (plan 8X-6). */
+export type AnyCounterPlan = CounterPlan | MaxCounterPlan;
+
+export const isMaxPlan = (plan: AnyCounterPlan): plan is MaxCounterPlan => plan.kind === 'max';
+
 async function readPlan(
   interaction: ChatInputCommandInteraction,
   ctx: AppContext,
-): Promise<CounterPlan> {
+): Promise<AnyCounterPlan> {
   const { entry, tier, fromPost } = bossAndTier(interaction, ctx);
+  if (typeof tier === 'string') {
+    const listed =
+      fromPost ||
+      ctx.maxBosses.bosses().some((boss) => boss.tier === tier && boss.entry?.key === entry.key);
+    return readMaxPlan(interaction, entry, tier, fromPost, ctx.gameData.catalogue, listed);
+  }
+  if (interaction.options.getString('role') !== null) {
+    throw new UserError('`role` is for max battles: leave it out for a raid.');
+  }
   const { raidLevel, bosses } = pokebattlerTarget(entry, tier, fromPost);
   const moveset = chosenMoveset(
     ctx.gameData.catalogue,
@@ -289,6 +394,7 @@ async function readPlan(
     ctx,
   );
   return {
+    kind: 'raid',
     entry,
     tier,
     raidLevel,
@@ -329,16 +435,8 @@ function failureText(outcome: Extract<CounterOutcome, { ok: false }>, plan: Coun
             'that can fight this boss: check that your Pokébox on Pokebattler is filled in.'
         : `Pokebattler lists no counters against ${plain(plan.entry.name)} in ` +
             `${raidTierLabel(plan.tier)} raids.`;
-    case 'refused':
-    case 'timeout':
-    case 'unreachable':
-    case 'unavailable':
-      return 'Pokebattler did not answer just now. Please try again later.';
-    case 'busy':
-      return 'Many are asking Pokebattler just now. Please try again in a minute.';
-    case 'too-large':
-    case 'unreadable':
-      return 'The answer of Pokebattler could not be read. Please try again later.';
+    default:
+      return troubleText(outcome.reason) ?? 'Pokebattler gave no counters just now.';
   }
 }
 
@@ -411,6 +509,31 @@ function bossWhileTyping(
   return ref && 'key' in ref ? ctx.gameData.catalogue.byKey(ref.key) : undefined;
 }
 
+/**
+ * Whether the member is asking about a max battle while typing (a max tier, `Gigantamax` or
+ * `Dynamax` before the boss, the post of a max battle without a raid tier, or a boss without a
+ * tier that is no raid boss now and is a max boss): its team takes no boss moves, so none are
+ * offered.
+ */
+function forMaxBattle(interaction: AutocompleteInteraction, ctx: AppContext): boolean {
+  const tier = interaction.options.getString('tier');
+  if (tier !== null) return isMaxTier(tier);
+  const typed = interaction.options.getString('boss')?.trim() ?? '';
+  if (maxKindOf(typed).gigantamax !== undefined) return true;
+  const party = bossParty(interaction, ctx);
+  // A raid's post gives a boss named there its tier, a max battle's its own.
+  if (party && isRaid(party)) return false;
+  if (party && isMax(party)) return true;
+  // A boss that is no raid boss now and is a max boss is asked about as a max battle.
+  const entry =
+    typed === '' ? undefined : (ctx.gameData.catalogue.byKey(typed) ?? ctx.pokemon.exact(typed));
+  return (
+    entry !== undefined &&
+    currentTier(ctx, entry) === undefined &&
+    currentMaxBoss(ctx, entry) !== undefined
+  );
+}
+
 /** The server whose emoji an answer may show, by the interaction's own id; none in a DM. */
 export const serverOf = (interaction: LocatedInteraction): string | null =>
   interaction.inGuild() ? interaction.guildId : null;
@@ -462,6 +585,7 @@ export const COUNTERS_KEPT_MAX = 5_000;
  * the party whose post a public answer stands in.
  */
 export interface KeptCounters {
+  kind: 'raid';
   bossKey: string;
   tier: RaidTier;
   attackers: { kind: 'level'; level: AttackerLevel } | { kind: 'box' };
@@ -477,12 +601,17 @@ export interface KeptCounters {
   partyId: string | null;
 }
 
+/** The kept options of a raid answer or of a max battle answer (plan 8X-6, `kind: 'max'`). */
+export type KeptAnswer = KeptCounters | KeptMaxCounters;
+
+export const isKeptMax = (kept: KeptAnswer): kept is KeptMaxCounters => kept.kind === 'max';
+
 /**
  * The options of answers by the token of their custom ids, for a day and at most `max` of them
  * (`BoundedMap`, oldest out); kept in memory only, so a restart forgets them.
  */
 export class KeptCounterOptions {
-  private readonly kept: BoundedMap<string, { value: KeptCounters; expires: number }>;
+  private readonly kept: BoundedMap<string, { value: KeptAnswer; expires: number }>;
 
   constructor(private readonly options: { ttlMs?: number; max?: number; now?: () => number } = {}) {
     this.kept = new BoundedMap(options.max ?? COUNTERS_KEPT_MAX);
@@ -493,7 +622,7 @@ export class KeptCounterOptions {
   }
 
   /** Keeps the options of an answer and gives the token of its custom ids. */
-  keep(value: KeptCounters): string {
+  keep(value: KeptAnswer): string {
     const now = this.now();
     this.kept.dropWhile((entry) => entry.expires <= now);
     const token = randomBytes(8).toString('hex');
@@ -502,7 +631,7 @@ export class KeptCounterOptions {
   }
 
   /** The options kept under a token; undefined once they are gone (a day, a restart). */
-  get(token: string): KeptCounters | undefined {
+  get(token: string): KeptAnswer | undefined {
     const entry = this.kept.get(token);
     if (!entry || entry.expires <= this.now()) return undefined;
     return entry.value;
@@ -532,6 +661,7 @@ export function countersMessage(
   place: AnswerPlace,
 ): V2Message {
   const token = keptCounters.keep({
+    kind: 'raid',
     bossKey: plan.entry.key,
     tier: plan.tier,
     attackers:
@@ -580,6 +710,45 @@ export function countersMessage(
   });
 }
 
+/** What Pokebattler answered for a plan of either kind. */
+export type Answered =
+  { plan: CounterPlan; simulated: Simulated } | { plan: MaxCounterPlan; team: SimulatedTeam };
+
+/**
+ * Asks Pokebattler for a plan: the raid's counters (`simulate`) or the max battle's team
+ * (`simulateMax`); a failure is refused with a sentence. The command and the dialog run it.
+ */
+export async function askPokebattler(ctx: AppContext, plan: AnyCounterPlan): Promise<Answered> {
+  if (isMaxPlan(plan)) return { plan, team: await simulateMax(ctx, plan) };
+  return { plan, simulated: await simulate(ctx, plan) };
+}
+
+/**
+ * The answer for what Pokebattler answered, its options kept (`keptCounters`) under a new token
+ * for "Change options…".
+ */
+export function answeredMessage(
+  ctx: AppContext,
+  answered: Answered,
+  place: AnswerPlace,
+): V2Message {
+  if (!('team' in answered)) return countersMessage(ctx, answered.plan, answered.simulated, place);
+  const { plan } = answered;
+  const token = keptCounters.keep({
+    kind: 'max',
+    bossKey: plan.entry.key,
+    tier: plan.tier,
+    role: plan.role,
+    level: plan.level,
+    askerId: place.askerId,
+    partyId: place.partyId,
+  });
+  return maxTeamMessage(ctx, plan, answered.team, {
+    guildId: place.guildId,
+    optionsId: encodeCustomId({ kind: COUNTERS_KIND, id: token, action: COUNTERS_ACTIONS.options }),
+  });
+}
+
 /**
  * `/counters` (spec row 199, the legacy `!counters`): the best counters against a raid boss, as
  * Pokebattler simulates the raid, with the trainers each takes. In the post of a raid the boss
@@ -590,12 +759,16 @@ export function countersMessage(
 export const counters: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('counters')
-    .setDescription('The best counters against a raid boss, from Pokebattler')
+    .setDescription(
+      'The best counters against a raid boss, or a team for a max battle, from Pokebattler',
+    )
     .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
     .addStringOption((option) =>
       option
         .setName('boss')
-        .setDescription('The boss; in the post of a raid, that raid’s when left out')
+        .setDescription(
+          'The boss; in the post of a raid or max battle, that battle’s when left out',
+        )
         .setMaxLength(100)
         .setAutocomplete(true),
     )
@@ -603,16 +776,30 @@ export const counters: SimpleCommand = {
       option
         .setName('tier')
         .setDescription(
-          'The tier; when left out, that of the raid whose post this is, else the boss’s now',
+          'The tier; when left out, that of the raid or max battle whose post this is, else the boss’s now',
         )
         .addChoices(
-          TIER_CHOICES.map((tier) => ({ name: raidTierLabel(tier), value: tierValue(tier) })),
+          ...TIER_CHOICES.map((tier) => ({ name: raidTierLabel(tier), value: tierValue(tier) })),
+          ...MAX_TIERS.map((tier) => ({ name: maxTierLabel(tier), value: tier })),
+        ),
+    )
+    .addStringOption((option) =>
+      option
+        .setName('role')
+        .setDescription('For a max battle: what your three Pokémon are for; Attacker when left out')
+        .addChoices(
+          MAX_ROLE_KEYS.map((role) => ({
+            name: `${MAX_ROLES[role].name}: ${MAX_ROLES[role].team}`,
+            value: role,
+          })),
         ),
     )
     .addStringOption((option) =>
       option
         .setName('level')
-        .setDescription('The level of the counters, or your Pokébox; level 40 when left out')
+        .setDescription(
+          'The level of the counters (a max team: 20 to 50), or your Pokébox; 40 when left out',
+        )
         .addChoices(
           ...ATTACKER_LEVELS.map((level) => ({ name: ATTACKER_LEVEL_NAMES[level], value: level })),
           { name: 'My Pokébox on Pokebattler', value: POKEBOX },
@@ -689,13 +876,13 @@ export const counters: SimpleCommand = {
   async execute(interaction, ctx) {
     const party = bossParty(interaction, ctx);
     const plan = await readPlan(interaction, ctx);
-    const simulated = await simulate(ctx, plan);
+    const answered = await askPokebattler(ctx, plan);
     // The answer in a post is public; the party may have ended while Pokebattler was asked, and
     // anything sent or edited in its archived post would open it again: the answer is then the
     // member's alone, after the public "thinking…" is deleted (as the router does for an error).
     const postGone =
       interaction.ephemeral === false && (!party || ctx.parties.get(party.id) === undefined);
-    const message = countersMessage(ctx, plan, simulated, {
+    const message = answeredMessage(ctx, answered, {
       guildId: serverOf(interaction),
       askerId: interaction.user.id,
       partyId: interaction.ephemeral === false && !postGone && party ? party.id : null,
@@ -716,7 +903,7 @@ export const counters: SimpleCommand = {
     await interaction.respond(
       focused.name === 'boss'
         ? pokemonChoices(ctx, typed)
-        : focused.name === 'moveset'
+        : focused.name === 'moveset' && !forMaxBattle(interaction, ctx)
           ? movesetChoices(ctx, bossWhileTyping(interaction, ctx), typed)
           : [],
     );
diff --git a/src/commands/util/max-counters.ts b/src/commands/util/max-counters.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c92439cd3cf6d0482053bdd011942c13d8ffb557
--- /dev/null
+++ b/src/commands/util/max-counters.ts
@@ -0,0 +1,342 @@
+import {
+  ComponentType,
+  type APIModalInteractionResponseCallbackData,
+  type APISelectMenuOption,
+  type ChatInputCommandInteraction,
+  type ModalSubmitInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import { UserError } from '../../discord/errors.js';
+import type { V2Message } from '../../discord/party-gateway.js';
+import { titleCase } from '../../domain/counters/counters.js';
+import {
+  DEFAULT_MAX_ROLE,
+  DEFAULT_MAX_TEAM_LEVEL,
+  isMaxRole,
+  isMaxTeamLevel,
+  MAX_ROLE_KEYS,
+  MAX_ROLES,
+  MAX_TEAM_LEVELS,
+  maxTeamLink,
+  maxTeamMember,
+  gigantamaxDefenders,
+  pokebattlerMaxDefenders,
+  pokebattlerMaxLevel,
+  type MaxRole,
+  type MaxTeamAnswer,
+  type MaxTeamLevel,
+} from '../../domain/counters/max-team.js';
+import { ATTACKER_LEVEL_NAMES } from '../../domain/counters/options.js';
+import type { PokemonCatalogue } from '../../domain/pogo/catalogue.js';
+import type { PokemonEntry } from '../../domain/pogo/game-master.js';
+import { maxBossTitle, maxTierLabel, type MaxTier } from '../../domain/pogo/max-tier.js';
+import { iconAddress, maxBossPicture } from '../../domain/pogo/pokemon-icons.js';
+import { renderMaxTeam, type ShownTeamMember } from '../../render/max-team.js';
+import { cutText } from '../../render/party-post.js';
+import { plain } from '../../render/text.js';
+import { troubleText } from './counters-words.js';
+
+/*
+ * `/counters` for max battles (plan 8X-6; design section 8): Pokebattler's suggested team of
+ * three for the member's role, at a level, in the counters' message form. `counters.ts` reads
+ * the boss and the tier and hands a max tier here; its dialog ("Change options…") asks the role
+ * and the level. Nothing here imports `counters.ts`, which imports this.
+ */
+
+/** The `level` choice of `/counters` that uses the member's Pokébox (the raid counters' only). */
+const POKEBOX = 'box';
+
+/** Everything a use of `/counters` for a max battle asks for, read before anything is sent. */
+export interface MaxCounterPlan {
+  kind: 'max';
+  entry: PokemonEntry;
+  tier: MaxTier;
+  /** Pokebattler's level of the tier (`RAID_LEVEL_5_MAX`). */
+  maxLevel: string;
+  /** The names Pokebattler may know the boss by, in this order. */
+  bosses: string[];
+  role: MaxRole;
+  level: MaxTeamLevel;
+}
+
+/** The options of a max battle answer, kept for its dialog as a raid answer's are. */
+export interface KeptMaxCounters {
+  kind: 'max';
+  bossKey: string;
+  tier: MaxTier;
+  role: MaxRole;
+  level: MaxTeamLevel;
+  askerId: string;
+  /** The party of the post a public answer stands in; null for a private answer. */
+  partyId: string | null;
+}
+
+/** The options of `/counters` that only a raid simulation takes, as the member sees them. */
+const RAID_ONLY_STRINGS = ['weather', 'friendship', 'moveset'] as const;
+const RAID_ONLY_BOOLEANS = ['shadow', 'mega', 'single'] as const;
+
+/** `a`, `a or b`, `a, b or c`. */
+function orList(words: readonly string[]): string {
+  if (words.length <= 1) return words.join('');
+  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1] ?? ''}`;
+}
+
+/** The sentence for a level the team does not take. */
+const LEVEL_REFUSAL = `A max battle team is simulated at level ${orList(MAX_TEAM_LEVELS)}: pick one of those.`;
+
+/** The level of a team as `/counters` or its dialog names it: 40 when left out. */
+export function maxTeamLevelOf(level: string | null): MaxTeamLevel {
+  if (level === null) return DEFAULT_MAX_TEAM_LEVEL;
+  if (level === POKEBOX) {
+    throw new UserError(
+      'Pokebattler’s max battle teams cannot use your Pokébox: pick a level, or leave `level` out.',
+    );
+  }
+  if (!isMaxTeamLevel(level)) throw new UserError(LEVEL_REFUSAL);
+  return level;
+}
+
+/** The role as `/counters` or its dialog names it: Attacker when left out. */
+export function maxRoleOf(role: string | null): MaxRole {
+  if (role === null) return DEFAULT_MAX_ROLE;
+  if (!isMaxRole(role)) throw new UserError('Pick the role from its list.');
+  return role;
+}
+
+/**
+ * What Pokebattler is asked about for a boss in a max tier: its level and the names it may know
+ * the boss by; refused with a sentence for a mega, and for Gigantamax where the game master has
+ * neither the Pokémon nor its forms so (`gigantamaxDefenders`), unless it is a Gigantamax boss of
+ * the list (`listed`: Pokebattler's feed has it, or the post is of its Gigantamax battle), when
+ * its own Gigantamax name is asked. A Dynamax boss is asked anyway: Pokebattler may simulate a
+ * boss newer than the game data. `fromPost`: the tier was the post's.
+ */
+export function maxTarget(
+  entry: PokemonEntry,
+  tier: MaxTier,
+  catalogue: Pick<PokemonCatalogue, 'canGigantamax' | 'byDex'>,
+  fromPost = false,
+  listed = false,
+): { maxLevel: string; bosses: string[] } {
+  const own = pokebattlerMaxDefenders(entry, tier);
+  if (own.length === 0) {
+    throw new UserError(
+      `${plain(entry.name)} never battles in a max battle.` +
+        (fromPost
+          ? ` I took the tier of this post (${maxTierLabel(tier)}): name another with \`tier\`.`
+          : ''),
+    );
+  }
+  const forms = tier === 'G' ? gigantamaxDefenders(entry, catalogue) : own;
+  const bosses = forms.length === 0 && listed ? own : forms;
+  if (bosses.length === 0) {
+    throw new UserError(
+      `${plain(entry.name)} has no Gigantamax battle in the game: name a Dynamax tier with \`tier\`.`,
+    );
+  }
+  return { maxLevel: pokebattlerMaxLevel(tier), bosses };
+}
+
+/**
+ * The plan of `/counters` for a boss in a max tier: the role and level of the options; the raid
+ * counters' options (weather, friendship, boss moves, what else to list, a Pokébox) are refused
+ * in words, since Pokebattler's teams take none of them (explored 2026-10-21).
+ */
+export function readMaxPlan(
+  interaction: ChatInputCommandInteraction,
+  entry: PokemonEntry,
+  tier: MaxTier,
+  fromPost: boolean,
+  catalogue: Pick<PokemonCatalogue, 'canGigantamax' | 'byDex'>,
+  listed: boolean,
+): MaxCounterPlan {
+  const { maxLevel, bosses } = maxTarget(entry, tier, catalogue, fromPost, listed);
+  const given = [
+    ...RAID_ONLY_STRINGS.filter((name) => interaction.options.getString(name) !== null),
+    ...RAID_ONLY_BOOLEANS.filter((name) => interaction.options.getBoolean(name) !== null),
+  ];
+  if (given.length > 0) {
+    throw new UserError(
+      `Pokebattler’s max battle teams take no ${orList(given.map((name) => `\`${name}\``))}: ` +
+        `leave ${given.length === 1 ? 'it' : 'them'} out.`,
+    );
+  }
+  return {
+    kind: 'max',
+    entry,
+    tier,
+    maxLevel,
+    bosses,
+    level: maxTeamLevelOf(interaction.options.getString('level')),
+    role: maxRoleOf(interaction.options.getString('role')),
+  };
+}
+
+/** The boss as the answer and its refusals name it: `Dynamax Uxie (5★)`, `Gigantamax Machamp`. */
+const titleOf = (plan: MaxCounterPlan): string => plain(maxBossTitle(plan.entry.name, plan.tier));
+
+/** What Pokebattler answered for a plan: the team, and the role's page of it on its site. */
+export interface SimulatedTeam {
+  team: MaxTeamAnswer;
+  link: string;
+}
+
+/**
+ * Asks Pokebattler for the team of a plan; a failure is refused with a sentence. The command and
+ * the dialog of an answer both run it.
+ */
+export async function simulateMax(ctx: AppContext, plan: MaxCounterPlan): Promise<SimulatedTeam> {
+  const outcome = await ctx.pokebattler.maxTeam({
+    bosses: plan.bosses,
+    maxLevel: plan.maxLevel,
+    role: plan.role,
+    level: plan.level,
+  });
+  if (outcome.ok) {
+    // The page of the boss under the name Pokebattler knew it by.
+    return { team: outcome.answer, link: maxTeamLink(outcome.query.boss, plan.role) };
+  }
+  if (outcome.reason === 'unknown') {
+    throw new UserError(`Pokebattler does not know ${titleOf(plan)} as a max battle boss.`);
+  }
+  if (outcome.reason === 'empty') {
+    throw new UserError(`Pokebattler suggests no team against ${titleOf(plan)}.`);
+  }
+  throw new UserError(troubleText(outcome.reason) ?? 'Pokebattler gave no team just now.');
+}
+
+/**
+ * The answer for a team Pokebattler gave: the boss's picture (Gigantamax where the icons have
+ * it) and types, each Pokémon of the team with its picture and moves (their types as emoji
+ * where the server or the application has them), its alternatives, and "Change options…"
+ * (`optionsId`) beside the full results on Pokebattler's site. A Pokémon the game data does not know is named by Pokebattler's name and
+ * logged.
+ */
+export function maxTeamMessage(
+  ctx: AppContext,
+  plan: MaxCounterPlan,
+  { team, link }: SimulatedTeam,
+  place: { guildId: string | null; optionsId: string },
+): V2Message {
+  const { catalogue } = ctx.gameData;
+  const unknown = new Set<string>();
+  const shown = (pick: ShownTeamMember['pick']): ShownTeamMember => {
+    const member = maxTeamMember(pick.pokemonId, catalogue);
+    if (!member.entry) unknown.add(pick.pokemonId);
+    const picture =
+      member.entry &&
+      (member.gigantamax
+        ? maxBossPicture(member.entry, 'G', ctx.gameData)
+        : iconAddress(member.entry, ctx.gameData));
+    return { name: member.name, picture, pick };
+  };
+  const slots = team.slots.map((slot) => ({
+    role: slot.role,
+    member: shown(slot.pick),
+    alternatives: slot.alternatives.map(shown),
+  }));
+  if (unknown.size > 0) {
+    ctx.log.info(
+      { pokemonIds: [...unknown], boss: plan.bosses[0] },
+      'Pokebattler named Pokémon the game data does not know',
+    );
+  }
+  const [first] = team.slots;
+  return renderMaxTeam({
+    bossName: plan.entry.name,
+    tier: plan.tier,
+    bossTypes: plan.entry.types,
+    picture: maxBossPicture(plan.entry, plan.tier, ctx.gameData),
+    role: plan.role,
+    slots,
+    level: first?.pick.level ?? null,
+    maxMoves: first?.maxMoves,
+    move: (id) => {
+      const move = catalogue.move(id);
+      return { name: move?.name ?? titleCase(id), type: move?.type };
+    },
+    icon: (name) => ctx.emoji.find(name, place.guildId),
+    link,
+    optionsId: place.optionsId,
+  });
+}
+
+/** The custom ids of the inputs of the max battle dialog. */
+const INPUTS = { role: 'role', level: 'level' } as const;
+
+const TITLE_ROOM = 45;
+
+const option = (
+  label: string,
+  value: string,
+  selected: boolean,
+  description?: string,
+): APISelectMenuOption => ({
+  label,
+  value,
+  ...(description === undefined ? {} : { description }),
+  ...(selected ? { default: true } : {}),
+});
+
+/**
+ * The dialog of "Change options…" under a max battle answer: the member's role (each with its
+ * team in words) and the level of their Pokémon, as the answer had them. The boss and the tier
+ * never change. `customId` is the dialog's (`counters:<token>:dialog`).
+ */
+export function maxCountersDialog(
+  customId: string,
+  kept: KeptMaxCounters,
+  entry: PokemonEntry,
+): APIModalInteractionResponseCallbackData {
+  return {
+    custom_id: customId,
+    title: cutText(`Team against ${maxBossTitle(entry.name, kept.tier)}`, TITLE_ROOM),
+    components: [
+      {
+        type: ComponentType.Label,
+        label: 'Your role',
+        component: {
+          type: ComponentType.StringSelect,
+          custom_id: INPUTS.role,
+          options: MAX_ROLE_KEYS.map((role) =>
+            option(MAX_ROLES[role].name, role, role === kept.role, MAX_ROLES[role].team),
+          ),
+        },
+      },
+      {
+        type: ComponentType.Label,
+        label: 'Level of your Pokémon',
+        component: {
+          type: ComponentType.StringSelect,
+          custom_id: INPUTS.level,
+          options: MAX_TEAM_LEVELS.map((level) =>
+            option(ATTACKER_LEVEL_NAMES[level], level, level === kept.level),
+          ),
+        },
+      },
+    ],
+  };
+}
+
+/**
+ * The plan a submitted max battle dialog asks for: the boss and the tier of the answer, the role
+ * and level as the dialog says; refused as the command refuses what does not fit.
+ */
+export function maxDialogPlan(
+  interaction: ModalSubmitInteraction,
+  entry: PokemonEntry,
+  kept: KeptMaxCounters,
+  catalogue: Pick<PokemonCatalogue, 'canGigantamax' | 'byDex'>,
+): MaxCounterPlan {
+  const [role] = interaction.fields.getStringSelectValues(INPUTS.role);
+  const [level] = interaction.fields.getStringSelectValues(INPUTS.level);
+  return {
+    kind: 'max',
+    entry,
+    tier: kept.tier,
+    // Its answer was given: the boss was asked for in this tier already.
+    ...maxTarget(entry, kept.tier, catalogue, false, true),
+    role: maxRoleOf(role ?? null),
+    level: maxTeamLevelOf(level ?? null),
+  };
+}
diff --git a/src/domain/counters/max-team.test.ts b/src/domain/counters/max-team.test.ts
index a66ee74fa9209a8b3587f07b304c72a9c23346f8..73eeac0378fa19000eb71709940a0bfc0ffd2d3b 100644
--- a/src/domain/counters/max-team.test.ts
+++ b/src/domain/counters/max-team.test.ts
@@ -2,11 +2,16 @@ import { describe, expect, it } from 'vitest';
 import { catalogueFixture } from '../../../test/support/game-data.js';
 import { recordedMaxTeam } from '../../../test/support/pokebattler.js';
 import { MAX_TIERS } from '../pogo/max-tier.js';
+import { ATTACKER_LEVELS, DEFAULT_ATTACKER_LEVEL } from './options.js';
 import {
   DEFAULT_MAX_ROLE,
+  DEFAULT_MAX_TEAM_LEVEL,
   gigantamaxDefenders,
+  isMaxTeamLevel,
+  MAX_TEAM_LEVELS,
   MAX_ROLE_KEYS,
   MAX_ROLES,
+  maxTeamLink,
   maxTeamMember,
   maxTeamPath,
   pokebattlerMaxDefenders,
@@ -45,6 +50,18 @@ describe('MAX_ROLES', () => {
   });
 });
 
+describe('MAX_TEAM_LEVELS', () => {
+  it('are the raid counters’ levels in steps of five, the same default, no best buddy', () => {
+    expect(MAX_TEAM_LEVELS).toEqual(['20', '25', '30', '35', '40', '45', '50']);
+    expect(
+      MAX_TEAM_LEVELS.every((level) => (ATTACKER_LEVELS as readonly string[]).includes(level)),
+    ).toBe(true);
+    expect(DEFAULT_MAX_TEAM_LEVEL).toBe(DEFAULT_ATTACKER_LEVEL);
+    expect(isMaxTeamLevel('41')).toBe(false);
+    expect(isMaxTeamLevel('45')).toBe(true);
+  });
+});
+
 describe('pokebattlerMaxLevel', () => {
   it('names every max tier as Pokebattler does', () => {
     expect(MAX_TIERS.map(pokebattlerMaxLevel)).toEqual([
@@ -108,6 +125,17 @@ describe('pokebattlerMaxDefenders', () => {
   });
 });
 
+describe('maxTeamLink', () => {
+  it('is the page of the role on Pokebattler’s site', () => {
+    expect(maxTeamLink('UXIE', 'attacker')).toBe('https://www.pokebattler.com/max/UXIE');
+    expect(maxTeamLink('MACHAMP_GIGANTAMAX', 'balanced')).toBe(
+      'https://www.pokebattler.com/max/MACHAMP_GIGANTAMAX/PARTY',
+    );
+    expect(maxTeamLink('UXIE', 'tank')).toBe('https://www.pokebattler.com/max/UXIE/TANK');
+    expect(maxTeamLink('UXIE', 'healer')).toBe('https://www.pokebattler.com/max/UXIE/TOTAL_HEAL');
+  });
+});
+
 describe('maxTeamPath', () => {
   it('asks for the role’s team at the level, as the endpoint takes it', () => {
     expect(
diff --git a/src/domain/counters/max-team.ts b/src/domain/counters/max-team.ts
index 950e7088ac4da3f52b81b61bd61e9b41a1d72a89..a990a982599dbfc41fe1a6671af8785c3af20354 100644
--- a/src/domain/counters/max-team.ts
+++ b/src/domain/counters/max-team.ts
@@ -4,7 +4,7 @@ import type { PokemonEntry } from '../pogo/game-master.js';
 import { MAX_FEED_TIERS, maxBossOf } from '../pogo/max-bosses.js';
 import type { MaxTier } from '../pogo/max-tier.js';
 import { titleCase } from '../pogo/names.js';
-import { pokebattlerBossIds, type AttackerLevel } from './options.js';
+import { POKEBATTLER_SITE, pokebattlerBossIds, type AttackerLevel } from './options.js';
 
 /*
  * `/counters` for max battles (plan 8X-6; design section 8): Pokebattler's suggested team of
@@ -39,6 +39,23 @@ export const MAX_ROLES = {
 
 export type MaxRole = keyof typeof MAX_ROLES;
 
+/**
+ * The page of each role on Pokebattler's site under `/max/<boss>` (seen in a browser on
+ * 2026-10-21): the attackers are the boss's own page; the site also has `/CHARGER` and
+ * `/METER_CHARGE`, which no role of these uses.
+ */
+const MAX_ROLE_PAGES: Readonly<Record<MaxRole, string>> = {
+  attacker: '',
+  balanced: '/PARTY',
+  tank: '/TANK',
+  healer: '/TOTAL_HEAL',
+};
+
+/** The full results of a role's team on Pokebattler's site, for the boss as Pokebattler knew it. */
+export function maxTeamLink(boss: string, role: MaxRole): string {
+  return `${POKEBATTLER_SITE}/max/${encodeURIComponent(boss)}${MAX_ROLE_PAGES[role]}`;
+}
+
 /** The roles in the order `/counters` offers them. */
 export const MAX_ROLE_KEYS = Object.keys(MAX_ROLES) as MaxRole[];
 
@@ -49,6 +66,29 @@ export function isMaxRole(value: string): value is MaxRole {
   return Object.hasOwn(MAX_ROLES, value);
 }
 
+/**
+ * The levels a team is simulated at (Matt, 2026-10-21): the raid counters' levels in steps of
+ * five, without the best buddy levels 41 and 51 (only one Pokémon at a time is a best buddy, so a
+ * team of three at 51 makes no sense).
+ */
+export const MAX_TEAM_LEVELS = [
+  '20',
+  '25',
+  '30',
+  '35',
+  '40',
+  '45',
+  '50',
+] as const satisfies readonly AttackerLevel[];
+export type MaxTeamLevel = (typeof MAX_TEAM_LEVELS)[number];
+
+/** The raid counters' default level (`DEFAULT_ATTACKER_LEVEL`), which is one of the team's. */
+export const DEFAULT_MAX_TEAM_LEVEL: MaxTeamLevel = '40';
+
+export function isMaxTeamLevel(value: string): value is MaxTeamLevel {
+  return (MAX_TEAM_LEVELS as readonly string[]).includes(value);
+}
+
 const LEVEL_OF_TIER = new Map<MaxTier, string>(
   Object.entries(MAX_FEED_TIERS).map(([level, tier]) => [tier, level]),
 );
@@ -111,7 +151,7 @@ export interface MaxTeamQuery {
   maxLevel: string;
   role: MaxRole;
   /** The level of the member's Pokémon. */
-  level: AttackerLevel;
+  level: MaxTeamLevel;
 }
 
 /** The path and query of a team's request. */
diff --git a/src/render/max-team.ts b/src/render/max-team.ts
new file mode 100644
index 0000000000000000000000000000000000000000..001da82ee7e6942bc7cc39be45c9298efd5c49c2
--- /dev/null
+++ b/src/render/max-team.ts
@@ -0,0 +1,202 @@
+import { ButtonStyle, ComponentType, type APIComponentInContainer } from 'discord.js';
+import type { V2Message } from '../discord/party-gateway.js';
+import {
+  MAX_ROLES,
+  slotRoleWords,
+  type MaxMoveLevels,
+  type MaxPick,
+  type MaxRole,
+} from '../domain/counters/max-team.js';
+import { typeWord } from '../domain/pogo/game-icons.js';
+import { maxBossTitle, type MaxTier } from '../domain/pogo/max-tier.js';
+import type { PokemonType } from '../domain/pogo/types.js';
+import { COUNTERS_COLOUR, type ShownMove } from './counters.js';
+import { cutText } from './party-post.js';
+import { plain } from './text.js';
+import {
+  actionRow,
+  container,
+  linkButton,
+  section,
+  separator,
+  textDisplay,
+  thumbnail,
+} from './v2.js';
+
+/** How many alternatives a role of the team lists (each slot of Pokebattler's has ten). */
+export const SHOWN_ALTERNATIVES = 5;
+
+/** A Pokémon of the team as the answer shows it. */
+export interface ShownTeamMember {
+  /** `Zacian (Crowned Sword)`, `Gigantamax Rillaboom`. */
+  name: string;
+  picture: string | undefined;
+  pick: MaxPick;
+}
+
+/** One of the three Pokémon of the team, with the alternatives for its place. */
+export interface ShownSlot {
+  /** Pokebattler's role of the slot (`ATTACK`, `SHIELD`, `HEAL`). */
+  role: string;
+  member: ShownTeamMember;
+  alternatives: readonly ShownTeamMember[];
+}
+
+/** What `/counters` shows for a max battle (plan 8X-6). */
+export interface MaxTeamView {
+  bossName: string;
+  tier: MaxTier;
+  bossTypes: readonly PokemonType[];
+  picture: string | undefined;
+  role: MaxRole;
+  slots: readonly ShownSlot[];
+  /** The level the answer was simulated at; null when it does not say. */
+  level: string | null;
+  maxMoves: MaxMoveLevels | undefined;
+  /** A move by its id (`METAL_CLAW_FAST`). */
+  move: (moveId: string) => ShownMove;
+  /** The emoji of a type by its name (`steel`), undefined where there is none. */
+  icon: (name: string) => string | undefined;
+  /** The role's page of the team on Pokebattler's site (`maxTeamLink`). */
+  link: string;
+  /** The custom id of "Change options…"; without it the answer has the link alone. */
+  optionsId?: string | undefined;
+}
+
+/** What one text of the answer may hold (a name of Pokebattler's is never long; to be safe). */
+const PART_ROOM = 1_000;
+
+/** A type as its emoji, or in words where there is none. */
+const typeText = (type: PokemonType, view: MaxTeamView): string =>
+  view.icon(type) ?? typeWord(type);
+
+/** A move with its type's emoji before it, or its type in words after it where there is none. */
+function moveText(move: ShownMove, view: MaxTeamView): string {
+  if (move.type === undefined) return plain(move.name);
+  const icon = view.icon(move.type);
+  return icon === undefined
+    ? `${plain(move.name)} (${typeWord(move.type)})`
+    : `${icon} ${plain(move.name)}`;
+}
+
+/** A slot: its role and Pokémon, and its moves in small print (no charged move where none). */
+function slotText(slot: ShownSlot, view: MaxTeamView): string {
+  const { pick } = slot.member;
+  const moves = [pick.fast, ...(pick.charged === null ? [] : [pick.charged])]
+    .map((id) => moveText(view.move(id), view))
+    .join(' / ');
+  return cutText(
+    `**${plain(slotRoleWords(slot.role).one)}** · ${plain(slot.member.name)}\n-# ${moves}`,
+    PART_ROOM,
+  );
+}
+
+/** The slots by role, in the order of the answer (attackers first, as Pokebattler lists them). */
+function byRole(slots: readonly ShownSlot[]): ShownSlot[][] {
+  const groups = new Map<string, ShownSlot[]>();
+  for (const slot of slots) {
+    const group = groups.get(slot.role);
+    if (group) group.push(slot);
+    else groups.set(slot.role, [slot]);
+  }
+  return [...groups.values()];
+}
+
+/**
+ * The alternatives of a role, once for all its slots (Pokebattler gives slots of one role the
+ * same list, without the role's own Pokémon): the first `SHOWN_ALTERNATIVES`, each with its fast
+ * move (the max moves follow its type). Undefined when there are none.
+ */
+function othersText(group: readonly ShownSlot[], view: MaxTeamView): string | undefined {
+  const picked = new Set(group.map((slot) => slot.member.pick.pokemonId));
+  const seen = new Set<string>();
+  const shown: string[] = [];
+  for (const other of group.flatMap((slot) => slot.alternatives)) {
+    const key = `${other.pick.pokemonId}/${other.pick.fast}`;
+    if (picked.has(other.pick.pokemonId) || seen.has(key)) continue;
+    seen.add(key);
+    shown.push(`${plain(other.name)} (${plain(view.move(other.pick.fast).name)})`);
+    if (shown.length === SHOWN_ALTERNATIVES) break;
+  }
+  const [first] = group;
+  if (!first || shown.length === 0) return undefined;
+  return cutText(
+    `-# Other ${plain(slotRoleWords(first.role).many)}: ${shown.join(' · ')}`,
+    PART_ROOM,
+  );
+}
+
+/** What the team was simulated with, in small print, as Pokebattler said it. */
+function settingLine(view: MaxTeamView): string | undefined {
+  const parts = [
+    ...(view.level === null ? [] : [`Pokémon at level ${plain(view.level)}`]),
+    ...(view.maxMoves
+      ? [
+          `Max Attack level ${String(view.maxMoves.attack)}, Max Guard ` +
+            `${String(view.maxMoves.guard)}, Max Spirit ${String(view.maxMoves.spirit)}`,
+        ]
+      : []),
+  ];
+  return parts.length === 0 ? undefined : `-# ${parts.join(' · ')}`;
+}
+
+const CREDIT = '-# Data provided by Pokebattler';
+
+/**
+ * The answer of `/counters` for a max battle (plan 8X-6), one components-v2 message in the form
+ * of the raid counters' (`renderCounters`): the boss, its types and the member's role beside the
+ * boss's picture; each of the three Pokémon of Pokebattler's team with its role and moves beside
+ * its picture (a Gigantamax one's where the icons have it), the alternatives of each role once
+ * under its Pokémon; what the team was simulated with; "Change options…" and the full results
+ * (the role's page on Pokebattler's site); and the credit.
+ */
+export function renderMaxTeam(view: MaxTeamView): V2Message {
+  const role = MAX_ROLES[view.role];
+  const head = [
+    `### Max battle team against ${plain(maxBossTitle(view.bossName, view.tier))}`,
+    [
+      ...(view.bossTypes.length === 0
+        ? []
+        : [view.bossTypes.map((type) => typeText(type, view)).join(' / ')]),
+      `your role: ${role.name}, ${role.team}`,
+    ].join(' · '),
+  ].join('\n');
+  const parts: APIComponentInContainer[] = [
+    view.picture === undefined ? textDisplay(head) : section(head, thumbnail(view.picture)),
+    separator(),
+  ];
+  for (const group of byRole(view.slots)) {
+    for (const slot of group) {
+      const text = slotText(slot, view);
+      parts.push(
+        slot.member.picture === undefined
+          ? textDisplay(text)
+          : section(text, thumbnail(slot.member.picture)),
+      );
+    }
+    const others = othersText(group, view);
+    if (others !== undefined) parts.push(textDisplay(others));
+  }
+  if (view.slots.length === 0) parts.push(textDisplay('Pokebattler suggests no team.'));
+  parts.push(separator());
+  const settings = settingLine(view);
+  if (settings !== undefined) parts.push(textDisplay(settings));
+  parts.push(
+    actionRow([
+      ...(view.optionsId === undefined
+        ? []
+        : [
+            {
+              type: ComponentType.Button as const,
+              style: ButtonStyle.Primary as const,
+              custom_id: view.optionsId,
+              label: 'Change options…',
+              emoji: { name: '⚙️' },
+            },
+          ]),
+      linkButton('Full results', undefined, view.link),
+    ]),
+  );
+  parts.push(textDisplay(CREDIT));
+  return { v2: true, components: [container(COUNTERS_COLOUR, parts)] };
+}
````

### Task 4: 8X-6: the raid counters' link to Pokebattler's new site

Prototype commit: `001b0b6ab1a795f4b912de7d1501988deacef034`

Pokebattler's new site sends the old long address of the full results to
/raids/<boss>, dropping every option, and reads only a few from the address.
The Full results link of the raid counters is now /raids/<boss>, with
includeShadow=0 and includeMegas=0 where the answer left them out. The API's
request is unchanged.

**Files:**

```
 src/commands/util/counters.test.ts  | 10 ++++------
 src/commands/util/counters.ts       |  5 ++---
 src/domain/counters/options.test.ts | 22 ++++++++++++++++++++++
 src/domain/counters/options.ts      | 19 ++++++++++++++++++-
 4 files changed, 46 insertions(+), 10 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/util/counters.test.ts src/domain/counters/options.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 001b0b6ab1a795f4b912de7d1501988deacef034 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-6: the raid counters' link to Pokebattler's new site`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/util/counters.test.ts b/src/commands/util/counters.test.ts
index cfb7dfdd3b7f016420119303747facd24ccb2ffd..1bc401eaec636a039efc5b20d816975f850a2bde 100644
--- a/src/commands/util/counters.test.ts
+++ b/src/commands/util/counters.test.ts
@@ -144,12 +144,9 @@ describe('/counters: elsewhere than in a raid post', () => {
         '† a legacy move',
       '-# Data provided by Pokebattler',
     ]);
+    // The boss's page on Pokebattler's new site, without the shadow Pokémon and megas left out.
     expect(linksOf(answer)).toEqual([
-      'Full results https://www.pokebattler.com/raids/defenders/YVELTAL/levels/RAID_LEVEL_5/' +
-        'attackers/levels/40/strategies/CINEMATIC_ATTACK_WHEN_POSSIBLE/DEFENSE_RANDOM_MC?' +
-        'sort=TIME&weatherCondition=NO_WEATHER&dodgeStrategy=DODGE_REACTION_TIME&' +
-        'aggregation=AVERAGE&randomAssistants=-1&friendLevel=FRIENDSHIP_LEVEL_4&' +
-        'includeShadow=false&includeMegas=false',
+      'Full results https://www.pokebattler.com/raids/YVELTAL?includeShadow=0&includeMegas=0',
     ]);
     expect(thumbnailOf(answer)).toBeDefined();
     expectV2Sendable(answer);
@@ -202,7 +199,8 @@ describe('/counters: elsewhere than in a raid post', () => {
       },
     ]);
     const { link, rows, settings } = partsOf(used);
-    expect(link).toContain('/raids/defenders/LANDORUS/levels/RAID_LEVEL_5/');
+    // Shadow Pokémon and megas listed: the page as it comes.
+    expect(link).toBe('Full results https://www.pokebattler.com/raids/LANDORUS');
     expect(settings).toBe(
       '-# Attackers at level 50 · windy weather · great friends · shadow Pokémon and megas ' +
         'listed · every moveset of a counter · † a legacy move',
diff --git a/src/commands/util/counters.ts b/src/commands/util/counters.ts
index 43a1bf3ab5eab8aa26a282fd8bd927a09fffa9ff..4ac551d45186dfaccc63109dcd58029dcff52818 100644
--- a/src/commands/util/counters.ts
+++ b/src/commands/util/counters.ts
@@ -19,7 +19,7 @@ import { counterRows, pokebattlerNames, titleCase } from '../../domain/counters/
 import {
   ATTACKER_LEVEL_NAMES,
   ATTACKER_LEVELS,
-  counterPath,
+  counterSiteLink,
   DEFAULT_ATTACKER_LEVEL,
   DEFAULT_FRIENDSHIP,
   DEFAULT_WEATHER,
@@ -28,7 +28,6 @@ import {
   isAttackerLevel,
   isCounterWeather,
   isFriendship,
-  POKEBATTLER_SITE,
   pokebattlerBossIds,
   pokebattlerRaidLevel,
   WEATHER_NAMES,
@@ -562,7 +561,7 @@ export async function simulate(ctx: AppContext, plan: CounterPlan): Promise<Simu
   if (!outcome.ok) throw new UserError(failureText(outcome, plan));
   return {
     set: countersFor(outcome, plan, ctx.gameData.catalogue),
-    link: `${POKEBATTLER_SITE}${counterPath(outcome.query)}`,
+    link: counterSiteLink(outcome.query),
   };
 }
 
diff --git a/src/domain/counters/options.test.ts b/src/domain/counters/options.test.ts
index 530109a013c644a1b34d808820eac2799ba8cdb4..5a11d447f16867a9fa9966cec805bfe95711de4c 100644
--- a/src/domain/counters/options.test.ts
+++ b/src/domain/counters/options.test.ts
@@ -4,6 +4,7 @@ import { RAID_LEVELS, SHADOW_RAID_LEVELS, raidTier, type RaidTier } from '../pog
 import {
   ATTACKER_LEVELS,
   counterPath,
+  counterSiteLink,
   pokebattlerBossIds,
   pokebattlerRaidLevel,
   WEATHERS,
@@ -117,6 +118,27 @@ describe('counterPath', () => {
     ).toContain('/raids/defenders/KOMMO-O/levels/RAID_LEVEL_3/attackers/users/12345/strategies/');
   });
 
+  it('links the boss’s page on Pokebattler’s site, with what the answer left out', () => {
+    // The site of 2026-10-21 reads only these options from the address (it sends the old long
+    // address to `/raids/<boss>`, dropping every option).
+    const link = (shadow: boolean, mega: boolean) =>
+      counterSiteLink({
+        boss: 'KOMMO-O',
+        raidLevel: 'RAID_LEVEL_3',
+        attackers: { kind: 'box', userId: 12345 },
+        weather: 'WINDY',
+        friendship: '0',
+        shadow,
+        mega,
+      });
+    expect(link(false, false)).toBe(
+      'https://www.pokebattler.com/raids/KOMMO-O?includeShadow=0&includeMegas=0',
+    );
+    expect(link(true, false)).toBe('https://www.pokebattler.com/raids/KOMMO-O?includeMegas=0');
+    expect(link(false, true)).toBe('https://www.pokebattler.com/raids/KOMMO-O?includeShadow=0');
+    expect(link(true, true)).toBe('https://www.pokebattler.com/raids/KOMMO-O');
+  });
+
   it('has the legacy lists', () => {
     expect(ATTACKER_LEVELS).toEqual(['20', '25', '30', '35', '40', '41', '45', '50', '51']);
     expect(WEATHERS).toHaveLength(8);
diff --git a/src/domain/counters/options.ts b/src/domain/counters/options.ts
index 230758d87bd362ebd6c685f6ab233a1b4152374d..420d6a60ff16a62bf3705e9b307ae53b218cfc03 100644
--- a/src/domain/counters/options.ts
+++ b/src/domain/counters/options.ts
@@ -154,12 +154,29 @@ export const POKEBATTLER_API = 'https://fight.pokebattler.com';
 /** Pokebattler's site, where the same path shows the full results. */
 export const POKEBATTLER_SITE = 'https://www.pokebattler.com';
 
+/**
+ * The boss's page of full results on Pokebattler's site. The site of 2026-10-21 sends the API's
+ * long path (`counterPath`) to `/raids/<boss>`, dropping every option, and reads only a few
+ * options from the address (weather, level and friendship are set in the page): the shadow
+ * Pokémon and megas the answer left out are left out there too.
+ */
+export function counterSiteLink(query: CounterQuery): string {
+  const params = new URLSearchParams();
+  if (!query.shadow) params.set('includeShadow', '0');
+  if (!query.mega) params.set('includeMegas', '0');
+  const options = params.toString();
+  return (
+    `${POKEBATTLER_SITE}/raids/${encodeURIComponent(query.boss)}` +
+    (options === '' ? '' : `?${options}`)
+  );
+}
+
 /**
  * The path and query of a simulation, as the legacy bot asked it: the attack when possible, a
  * random boss moveset mix, dodging at reaction time, averaged, any number of other trainers;
  * shadow Pokémon and megas left out by Pokebattler unless they are listed, so that its list of
  * thirty is not mostly counters the answer would drop (staging 2026-10-16: 21 of Dialga's 30
- * were, and 9 of the twelve were left). The same on the API and on the site.
+ * were, and 9 of the twelve were left). The site has a page of its own (`counterSiteLink`).
  */
 export function counterPath(query: CounterQuery): string {
   const attackers =
````

### Task 5: 8X-6 task 2c: weather and friendship for max battle teams

Prototype commit: `25f232794a623bf242aa4917a5b92c540ca14884`

Pokebattler's max team endpoint honours weatherCondition and friendLevel
(probed live on 2026-10-21; without friendLevel the answer is friendship 0).
A max tier now takes weather and friendship as the raid counters do (the same
choices, no weather and best friends by default), sent with every request and
kept for "Change options...", whose dialog asks them after the role and the
level; the small print says them. Boss moves, what else to list and a Pokebox
are still refused for a max tier.

**Files:**

```
 src/commands/util/counters-dialog.test.ts | 10 +++++-
 src/commands/util/counters.test.ts        | 51 ++++++++++++++++++++++-------
 src/commands/util/counters.ts             |  2 ++
 src/commands/util/max-counters.ts         | 90 ++++++++++++++++++++++++++++++++++++++++++++++-----
 src/domain/counters/max-team.test.ts      | 18 ++++++++---
 src/domain/counters/max-team.ts           | 16 +++++++--
 src/render/counters.ts                    |  4 +--
 src/render/max-team.ts                    | 11 ++++++-
 src/services/pokebattler-gateway.test.ts  | 13 ++++++--
 src/services/pokebattler-gateway.ts       |  9 +++++-
 10 files changed, 190 insertions(+), 34 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/util/counters-dialog.test.ts src/commands/util/counters.test.ts src/domain/counters/max-team.test.ts src/services/pokebattler-gateway.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 25f232794a623bf242aa4917a5b92c540ca14884 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-6 task 2c: weather and friendship for max battle teams`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/util/counters-dialog.test.ts b/src/commands/util/counters-dialog.test.ts
index 2c906fb65321ccbdd11fa5dd76a3dd1070e4f029..d47e5bdac253b4191cbdae1a4ea15861f789bdbc 100644
--- a/src/commands/util/counters-dialog.test.ts
+++ b/src/commands/util/counters-dialog.test.ts
@@ -510,7 +510,11 @@ describe('/counters: Change options… under a max battle team', () => {
     expect(form.components.map((component) => component.label)).toEqual([
       'Your role',
       'Level of your Pokémon',
+      'Weather',
+      'Friendship',
     ]);
+    expect(selectedIn(form, 'Weather')).toEqual(['NO_WEATHER']);
+    expect(selectedIn(form, 'Friendship')).toEqual(['4']);
     expect(valuesIn(form, 'Your role')).toEqual(['attacker', 'balanced', 'tank', 'healer']);
     expect(selectedIn(form, 'Your role')).toEqual(['attacker']);
     // The levels of a team: no best buddy levels.
@@ -534,7 +538,7 @@ describe('/counters: Change options… under a max battle team', () => {
       userId: ALICE,
       askedBy: ALICE,
       form: shown,
-      selected: { role: ['tank'], level: ['30'] },
+      selected: { role: ['tank'], level: ['30'], weather: ['FOG'], friendship: ['1'] },
       ...made.where,
     });
     await made.router.handle(form as never);
@@ -544,6 +548,8 @@ describe('/counters: Change options… under a max battle team', () => {
       maxLevel: 'RAID_LEVEL_2_MAX',
       role: 'tank',
       level: '30',
+      weather: 'FOG',
+      friendship: '1',
     });
     const changed = asV2(sent(form.editReply));
     expect(textDisplays(changed)[0]).toContain('your role: Tank, an attacker and two tanks');
@@ -554,6 +560,8 @@ describe('/counters: Change options… under a max battle team', () => {
       kind: 'max',
       role: 'tank',
       level: '30',
+      weather: 'FOG',
+      friendship: '1',
       partyId: made.max.party.id,
     });
   });
diff --git a/src/commands/util/counters.test.ts b/src/commands/util/counters.test.ts
index 1bc401eaec636a039efc5b20d816975f850a2bde..97924a99d0c4403340cd13b777453aafb6cd4687 100644
--- a/src/commands/util/counters.test.ts
+++ b/src/commands/util/counters.test.ts
@@ -557,7 +557,14 @@ describe('/counters: max battles', () => {
     const used = await made.run({ boss: 'uxie', tier: 'D5' });
     expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     expect(made.pokebattler.maxAsked).toEqual([
-      { boss: 'UXIE', maxLevel: 'RAID_LEVEL_5_MAX', role: 'attacker', level: '40' },
+      {
+        boss: 'UXIE',
+        maxLevel: 'RAID_LEVEL_5_MAX',
+        role: 'attacker',
+        level: '40',
+        weather: 'NO_WEATHER',
+        friendship: '4',
+      },
     ]);
     expect(made.pokebattler.asked).toEqual([]);
     const answer = answerOf(used);
@@ -579,7 +586,8 @@ describe('/counters: max battles', () => {
         'Gigantamax Rillaboom (Scratch) · Weavile (Feint Attack) · Gigantamax Cinderace (Tackle)',
     ]);
     expect(rest).toContain(
-      '-# Pokémon at level 40 · Max Attack level 1, Max Guard 3, Max Spirit 3',
+      '-# Pokémon at level 40 · no weather · best friends · Max Attack level 1, Max Guard 3, ' +
+        'Max Spirit 3',
     );
     expect(rest).toContain('-# Data provided by Pokebattler');
     // Gigantamax Pokémon are pictured as Gigantamax; the role's page on Pokebattler's site.
@@ -597,9 +605,23 @@ describe('/counters: max battles', () => {
   it('asks for the role’s team, at the level, and a Gigantamax boss by its Gigantamax name', async () => {
     const made = setup(withIcons);
     made.pokebattler.maxAnswer = recordedTeam('gmax-machamp-2-0-1');
-    const used = await made.run({ boss: 'machamp', tier: 'G', role: 'balanced', level: '30' });
+    const used = await made.run({
+      boss: 'machamp',
+      tier: 'G',
+      role: 'balanced',
+      level: '30',
+      weather: 'RAINY',
+      friendship: '2',
+    });
     expect(made.pokebattler.maxAsked).toEqual([
-      { boss: 'MACHAMP_GIGANTAMAX', maxLevel: 'RAID_LEVEL_6_MAX', role: 'balanced', level: '30' },
+      {
+        boss: 'MACHAMP_GIGANTAMAX',
+        maxLevel: 'RAID_LEVEL_6_MAX',
+        role: 'balanced',
+        level: '30',
+        weather: 'RAINY',
+        friendship: '2',
+      },
     ]);
     const answer = answerOf(used);
     expect(textDisplays(answer)[0]).toBe(
@@ -616,7 +638,7 @@ describe('/counters: max battles', () => {
     );
     expect(textOf(answer)).toContain('-# Other tanks: Gigantamax Venusaur (Vine Whip)');
     // The level the answer was simulated at, as Pokebattler says (here 40).
-    expect(textOf(answer)).toContain('-# Pokémon at level 40 ·');
+    expect(textOf(answer)).toContain('-# Pokémon at level 40 · rainy weather · great friends ·');
   });
 
   it('shows the types of the moves as emoji where the server or the application has them', async () => {
@@ -628,14 +650,12 @@ describe('/counters: max battles', () => {
 
   it('refuses what a max battle team does not take, before Pokebattler is asked', async () => {
     const made = setup();
-    expect(told(await made.run({ boss: 'uxie', tier: 'D5', weather: 'WINDY' }))).toBe(
-      'Pokebattler’s max battle teams take no `weather`: leave it out.',
+    expect(told(await made.run({ boss: 'uxie', tier: 'D5', moveset: 'average' }))).toBe(
+      'Pokebattler’s max battle teams take no `moveset`: leave it out.',
     );
     expect(
-      told(await made.run({ boss: 'uxie', tier: 'D5', friendship: '2', shadow: true, mega: true })),
-    ).toBe(
-      'Pokebattler’s max battle teams take no `friendship`, `shadow` or `mega`: leave them out.',
-    );
+      told(await made.run({ boss: 'uxie', tier: 'D5', single: false, shadow: true, mega: true })),
+    ).toBe('Pokebattler’s max battle teams take no `shadow`, `mega` or `single`: leave them out.');
     expect(told(await made.run({ boss: 'uxie', tier: 'D5', level: 'box' }))).toBe(
       'Pokebattler’s max battle teams cannot use your Pokébox: pick a level, or leave `level` out.',
     );
@@ -705,7 +725,14 @@ describe('/counters: max battles', () => {
     const used = await made.run({ role: 'healer' }, inPost(max.postId));
     expect(used.deferReply).toHaveBeenCalledWith({});
     expect(made.pokebattler.maxAsked).toEqual([
-      { boss: 'MACHAMP', maxLevel: 'RAID_LEVEL_2_MAX', role: 'healer', level: '40' },
+      {
+        boss: 'MACHAMP',
+        maxLevel: 'RAID_LEVEL_2_MAX',
+        role: 'healer',
+        level: '40',
+        weather: 'NO_WEATHER',
+        friendship: '4',
+      },
     ]);
     expect(textDisplays(answerOf(used))[0]).toMatch(
       /^### Max battle team against Dynamax Machamp \(2★\)\n/,
diff --git a/src/commands/util/counters.ts b/src/commands/util/counters.ts
index 4ac551d45186dfaccc63109dcd58029dcff52818..829da3303c71bda452b0a149976b0836aba442b1 100644
--- a/src/commands/util/counters.ts
+++ b/src/commands/util/counters.ts
@@ -739,6 +739,8 @@ export function answeredMessage(
     tier: plan.tier,
     role: plan.role,
     level: plan.level,
+    weather: plan.weather,
+    friendship: plan.friendship,
     askerId: place.askerId,
     partyId: place.partyId,
   });
diff --git a/src/commands/util/max-counters.ts b/src/commands/util/max-counters.ts
index c92439cd3cf6d0482053bdd011942c13d8ffb557..ba7a242b687e83cb8166504179d9200d8026549e 100644
--- a/src/commands/util/max-counters.ts
+++ b/src/commands/util/max-counters.ts
@@ -26,7 +26,19 @@ import {
   type MaxTeamAnswer,
   type MaxTeamLevel,
 } from '../../domain/counters/max-team.js';
-import { ATTACKER_LEVEL_NAMES } from '../../domain/counters/options.js';
+import {
+  ATTACKER_LEVEL_NAMES,
+  DEFAULT_FRIENDSHIP,
+  DEFAULT_WEATHER,
+  FRIENDSHIP_NAMES,
+  FRIENDSHIPS,
+  isCounterWeather,
+  isFriendship,
+  WEATHER_NAMES,
+  WEATHERS,
+  type CounterWeather,
+  type Friendship,
+} from '../../domain/counters/options.js';
 import type { PokemonCatalogue } from '../../domain/pogo/catalogue.js';
 import type { PokemonEntry } from '../../domain/pogo/game-master.js';
 import { maxBossTitle, maxTierLabel, type MaxTier } from '../../domain/pogo/max-tier.js';
@@ -57,6 +69,8 @@ export interface MaxCounterPlan {
   bosses: string[];
   role: MaxRole;
   level: MaxTeamLevel;
+  weather: CounterWeather;
+  friendship: Friendship;
 }
 
 /** The options of a max battle answer, kept for its dialog as a raid answer's are. */
@@ -66,13 +80,18 @@ export interface KeptMaxCounters {
   tier: MaxTier;
   role: MaxRole;
   level: MaxTeamLevel;
+  weather: CounterWeather;
+  friendship: Friendship;
   askerId: string;
   /** The party of the post a public answer stands in; null for a private answer. */
   partyId: string | null;
 }
 
-/** The options of `/counters` that only a raid simulation takes, as the member sees them. */
-const RAID_ONLY_STRINGS = ['weather', 'friendship', 'moveset'] as const;
+/**
+ * The options of `/counters` that only a raid simulation takes, as the member sees them (the
+ * team takes weather and friendship, probed live on 2026-10-21; nothing else).
+ */
+const RAID_ONLY_STRINGS = ['moveset'] as const;
 const RAID_ONLY_BOOLEANS = ['shadow', 'mega', 'single'] as const;
 
 /** `a`, `a or b`, `a, b or c`. */
@@ -96,6 +115,24 @@ export function maxTeamLevelOf(level: string | null): MaxTeamLevel {
   return level;
 }
 
+/**
+ * The weather and friendship as `/counters` or its dialog names them: as the raid counters'
+ * (no weather and best friends when left out).
+ */
+function weatherAndFriendship(
+  weather: string | null,
+  friendship: string | null,
+): { weather: CounterWeather; friendship: Friendship } {
+  const chosen = {
+    weather: weather ?? DEFAULT_WEATHER,
+    friendship: friendship ?? DEFAULT_FRIENDSHIP,
+  };
+  if (!isCounterWeather(chosen.weather) || !isFriendship(chosen.friendship)) {
+    throw new UserError('Pick the weather and the friendship from their lists.');
+  }
+  return { weather: chosen.weather, friendship: chosen.friendship };
+}
+
 /** The role as `/counters` or its dialog names it: Attacker when left out. */
 export function maxRoleOf(role: string | null): MaxRole {
   if (role === null) return DEFAULT_MAX_ROLE;
@@ -138,9 +175,9 @@ export function maxTarget(
 }
 
 /**
- * The plan of `/counters` for a boss in a max tier: the role and level of the options; the raid
- * counters' options (weather, friendship, boss moves, what else to list, a Pokébox) are refused
- * in words, since Pokebattler's teams take none of them (explored 2026-10-21).
+ * The plan of `/counters` for a boss in a max tier: the role, level, weather and friendship of
+ * the options; the raid counters' other options (boss moves, what else to list, a Pokébox) are
+ * refused in words, since Pokebattler's teams take none of them (explored 2026-10-21).
  */
 export function readMaxPlan(
   interaction: ChatInputCommandInteraction,
@@ -169,6 +206,10 @@ export function readMaxPlan(
     bosses,
     level: maxTeamLevelOf(interaction.options.getString('level')),
     role: maxRoleOf(interaction.options.getString('role')),
+    ...weatherAndFriendship(
+      interaction.options.getString('weather'),
+      interaction.options.getString('friendship'),
+    ),
   };
 }
 
@@ -191,6 +232,8 @@ export async function simulateMax(ctx: AppContext, plan: MaxCounterPlan): Promis
     maxLevel: plan.maxLevel,
     role: plan.role,
     level: plan.level,
+    weather: plan.weather,
+    friendship: plan.friendship,
   });
   if (outcome.ok) {
     // The page of the boss under the name Pokebattler knew it by.
@@ -250,6 +293,8 @@ export function maxTeamMessage(
     role: plan.role,
     slots,
     level: first?.pick.level ?? null,
+    weather: plan.weather,
+    friendship: plan.friendship,
     maxMoves: first?.maxMoves,
     move: (id) => {
       const move = catalogue.move(id);
@@ -262,7 +307,12 @@ export function maxTeamMessage(
 }
 
 /** The custom ids of the inputs of the max battle dialog. */
-const INPUTS = { role: 'role', level: 'level' } as const;
+const INPUTS = {
+  role: 'role',
+  level: 'level',
+  weather: 'weather',
+  friendship: 'friendship',
+} as const;
 
 const TITLE_ROOM = 45;
 
@@ -280,7 +330,8 @@ const option = (
 
 /**
  * The dialog of "Change options…" under a max battle answer: the member's role (each with its
- * team in words) and the level of their Pokémon, as the answer had them. The boss and the tier
+ * team in words), the level of their Pokémon, the weather and the friendship, as the answer had
+ * them. The boss and the tier
  * never change. `customId` is the dialog's (`counters:<token>:dialog`).
  */
 export function maxCountersDialog(
@@ -314,6 +365,26 @@ export function maxCountersDialog(
           ),
         },
       },
+      {
+        type: ComponentType.Label,
+        label: 'Weather',
+        component: {
+          type: ComponentType.StringSelect,
+          custom_id: INPUTS.weather,
+          options: WEATHERS.map((each) => option(WEATHER_NAMES[each], each, each === kept.weather)),
+        },
+      },
+      {
+        type: ComponentType.Label,
+        label: 'Friendship',
+        component: {
+          type: ComponentType.StringSelect,
+          custom_id: INPUTS.friendship,
+          options: FRIENDSHIPS.map((each) =>
+            option(FRIENDSHIP_NAMES[each], each, each === kept.friendship),
+          ),
+        },
+      },
     ],
   };
 }
@@ -330,6 +401,8 @@ export function maxDialogPlan(
 ): MaxCounterPlan {
   const [role] = interaction.fields.getStringSelectValues(INPUTS.role);
   const [level] = interaction.fields.getStringSelectValues(INPUTS.level);
+  const [weather] = interaction.fields.getStringSelectValues(INPUTS.weather);
+  const [friendship] = interaction.fields.getStringSelectValues(INPUTS.friendship);
   return {
     kind: 'max',
     entry,
@@ -338,5 +411,6 @@ export function maxDialogPlan(
     ...maxTarget(entry, kept.tier, catalogue, false, true),
     role: maxRoleOf(role ?? null),
     level: maxTeamLevelOf(level ?? null),
+    ...weatherAndFriendship(weather ?? null, friendship ?? null),
   };
 }
diff --git a/src/domain/counters/max-team.test.ts b/src/domain/counters/max-team.test.ts
index 73eeac0378fa19000eb71709940a0bfc0ffd2d3b..c9004386591a3b918048ca0dc64858576d1fed4b 100644
--- a/src/domain/counters/max-team.test.ts
+++ b/src/domain/counters/max-team.test.ts
@@ -137,22 +137,32 @@ describe('maxTeamLink', () => {
 });
 
 describe('maxTeamPath', () => {
-  it('asks for the role’s team at the level, as the endpoint takes it', () => {
+  it('asks for the role’s team at the level, weather and friendship, as the endpoint takes it', () => {
     expect(
       maxTeamPath({
         boss: 'MACHAMP_GIGANTAMAX',
         maxLevel: 'RAID_LEVEL_6_MAX',
         role: 'balanced',
         level: '30',
+        weather: 'RAINY',
+        friendship: '2',
       }),
     ).toBe(
       '/max/parties/suggested/defenders/MACHAMP_GIGANTAMAX/levels/RAID_LEVEL_6_MAX' +
-        '?attack=2&heal=0&shield=1&level=30',
+        '?attack=2&heal=0&shield=1&level=30&weatherCondition=RAINY&friendLevel=FRIENDSHIP_LEVEL_2',
     );
     expect(
-      maxTeamPath({ boss: 'UXIE', maxLevel: 'RAID_LEVEL_5_MAX', role: 'healer', level: '40' }),
+      maxTeamPath({
+        boss: 'UXIE',
+        maxLevel: 'RAID_LEVEL_5_MAX',
+        role: 'healer',
+        level: '40',
+        weather: 'NO_WEATHER',
+        friendship: '4',
+      }),
     ).toBe(
-      '/max/parties/suggested/defenders/UXIE/levels/RAID_LEVEL_5_MAX?attack=1&heal=2&shield=0&level=40',
+      '/max/parties/suggested/defenders/UXIE/levels/RAID_LEVEL_5_MAX?attack=1&heal=2&shield=0' +
+        '&level=40&weatherCondition=NO_WEATHER&friendLevel=FRIENDSHIP_LEVEL_4',
     );
   });
 });
diff --git a/src/domain/counters/max-team.ts b/src/domain/counters/max-team.ts
index a990a982599dbfc41fe1a6671af8785c3af20354..f34c53956a75d704f1d9770335d35c7524dd5a10 100644
--- a/src/domain/counters/max-team.ts
+++ b/src/domain/counters/max-team.ts
@@ -4,7 +4,13 @@ import type { PokemonEntry } from '../pogo/game-master.js';
 import { MAX_FEED_TIERS, maxBossOf } from '../pogo/max-bosses.js';
 import type { MaxTier } from '../pogo/max-tier.js';
 import { titleCase } from '../pogo/names.js';
-import { POKEBATTLER_SITE, pokebattlerBossIds, type AttackerLevel } from './options.js';
+import {
+  POKEBATTLER_SITE,
+  pokebattlerBossIds,
+  type AttackerLevel,
+  type CounterWeather,
+  type Friendship,
+} from './options.js';
 
 /*
  * `/counters` for max battles (plan 8X-6; design section 8): Pokebattler's suggested team of
@@ -152,9 +158,13 @@ export interface MaxTeamQuery {
   role: MaxRole;
   /** The level of the member's Pokémon. */
   level: MaxTeamLevel;
+  /** Pokebattler's weather (`weatherCondition`, which the endpoint honours; `weather` it ignores). */
+  weather: CounterWeather;
+  /** Friendship with the others in the battle (`friendLevel`; friendship 0 without it). */
+  friendship: Friendship;
 }
 
-/** The path and query of a team's request. */
+/** The path and query of a team's request (explored 2026-10-21). */
 export function maxTeamPath(query: MaxTeamQuery): string {
   const { attack, heal, shield } = MAX_ROLES[query.role];
   const params = new URLSearchParams({
@@ -162,6 +172,8 @@ export function maxTeamPath(query: MaxTeamQuery): string {
     heal: String(heal),
     shield: String(shield),
     level: query.level,
+    weatherCondition: query.weather,
+    friendLevel: `FRIENDSHIP_LEVEL_${query.friendship}`,
   });
   return (
     `/max/parties/suggested/defenders/${encodeURIComponent(query.boss)}` +
diff --git a/src/render/counters.ts b/src/render/counters.ts
index 07a148840365c0edb043fed33993e87de665fbae..e4125f3e5486355dbbe3bf4448c97c03b46a965f 100644
--- a/src/render/counters.ts
+++ b/src/render/counters.ts
@@ -99,8 +99,8 @@ function rowText(row: CounterRow, index: number, view: CountersView): string {
   );
 }
 
-/** `no weather`, `windy weather`. */
-function weatherText(weather: CounterWeather): string {
+/** `no weather`, `windy weather`; also in the small print of a max battle team. */
+export function weatherText(weather: CounterWeather): string {
   return weather === 'NO_WEATHER'
     ? 'no weather'
     : `${WEATHER_NAMES[weather].toLowerCase()} weather`;
diff --git a/src/render/max-team.ts b/src/render/max-team.ts
index 001da82ee7e6942bc7cc39be45c9298efd5c49c2..7b85798b0e40b8b9b19d8b1b99e57b573b47ee7a 100644
--- a/src/render/max-team.ts
+++ b/src/render/max-team.ts
@@ -10,7 +10,12 @@ import {
 import { typeWord } from '../domain/pogo/game-icons.js';
 import { maxBossTitle, type MaxTier } from '../domain/pogo/max-tier.js';
 import type { PokemonType } from '../domain/pogo/types.js';
-import { COUNTERS_COLOUR, type ShownMove } from './counters.js';
+import {
+  FRIENDSHIP_NAMES,
+  type CounterWeather,
+  type Friendship,
+} from '../domain/counters/options.js';
+import { COUNTERS_COLOUR, weatherText, type ShownMove } from './counters.js';
 import { cutText } from './party-post.js';
 import { plain } from './text.js';
 import {
@@ -50,6 +55,8 @@ export interface MaxTeamView {
   picture: string | undefined;
   role: MaxRole;
   slots: readonly ShownSlot[];
+  weather: CounterWeather;
+  friendship: Friendship;
   /** The level the answer was simulated at; null when it does not say. */
   level: string | null;
   maxMoves: MaxMoveLevels | undefined;
@@ -130,6 +137,8 @@ function othersText(group: readonly ShownSlot[], view: MaxTeamView): string | un
 function settingLine(view: MaxTeamView): string | undefined {
   const parts = [
     ...(view.level === null ? [] : [`Pokémon at level ${plain(view.level)}`]),
+    weatherText(view.weather),
+    FRIENDSHIP_NAMES[view.friendship].toLowerCase(),
     ...(view.maxMoves
       ? [
           `Max Attack level ${String(view.maxMoves.attack)}, Max Guard ` +
diff --git a/src/services/pokebattler-gateway.test.ts b/src/services/pokebattler-gateway.test.ts
index bc25ea2ac9cee0b484e17df5c0c871a26530831a..74dad6edef322cb12de0a11b162fc83bfd12a57b 100644
--- a/src/services/pokebattler-gateway.test.ts
+++ b/src/services/pokebattler-gateway.test.ts
@@ -334,6 +334,8 @@ const MAX_REQUEST: MaxTeamRequest = {
   maxLevel: 'RAID_LEVEL_6_MAX',
   role: 'balanced',
   level: '40',
+  weather: 'NO_WEATHER',
+  friendship: '4',
 };
 
 describe('PokebattlerFight: max battle teams', () => {
@@ -350,11 +352,14 @@ describe('PokebattlerFight: max battle teams', () => {
       maxLevel: 'RAID_LEVEL_6_MAX',
       role: 'balanced',
       level: '40',
+      weather: 'NO_WEATHER',
+      friendship: '4',
     });
     const [url, init] = made.fetch.mock.calls[0] ?? [];
     expect(url).toBe(
       'https://fight.pokebattler.com/max/parties/suggested/defenders/MACHAMP_GIGANTAMAX/levels/' +
-        'RAID_LEVEL_6_MAX?attack=2&heal=0&shield=1&level=40',
+        'RAID_LEVEL_6_MAX?attack=2&heal=0&shield=1&level=40&weatherCondition=NO_WEATHER&' +
+        'friendLevel=FRIENDSHIP_LEVEL_4',
     );
     expect(init?.headers['User-Agent']).toBe('Professor-Pine');
     expect(init?.redirect).toBe('error');
@@ -396,10 +401,12 @@ describe('PokebattlerFight: max battle teams', () => {
     // Another role or level is another request.
     await made.fight.maxTeam({ ...MAX_REQUEST, role: 'tank' });
     await made.fight.maxTeam({ ...MAX_REQUEST, level: '30' });
-    expect(made.urls()).toHaveLength(3);
+    await made.fight.maxTeam({ ...MAX_REQUEST, weather: 'RAINY' });
+    await made.fight.maxTeam({ ...MAX_REQUEST, friendship: '0' });
+    expect(made.urls()).toHaveLength(5);
     made.clock.now += 1_000;
     await made.fight.maxTeam(MAX_REQUEST);
-    expect(made.urls()).toHaveLength(4);
+    expect(made.urls()).toHaveLength(6);
   });
 
   it('shares the pause with the raid counters after Pokebattler gave no answer', async () => {
diff --git a/src/services/pokebattler-gateway.ts b/src/services/pokebattler-gateway.ts
index a45b33f679b42687facf62e86e06c176f27089c6..c9fb142ed48f1f3cc6a7e2a859e178e40e0f18d8 100644
--- a/src/services/pokebattler-gateway.ts
+++ b/src/services/pokebattler-gateway.ts
@@ -187,7 +187,14 @@ export class PokebattlerFight implements PokebattlerGateway {
 
   maxTeam(request: MaxTeamRequest): Promise<MaxTeamOutcome> {
     if (request.bosses.length === 0) return Promise.resolve({ ok: false, reason: 'unknown' });
-    const key = JSON.stringify([request.bosses, request.maxLevel, request.role, request.level]);
+    const key = JSON.stringify([
+      request.bosses,
+      request.maxLevel,
+      request.role,
+      request.level,
+      request.weather,
+      request.friendship,
+    ]);
     const { bosses, ...rest } = request;
     return this.shared(
       this.maxAnswers,
````

### Task 6: 8X-6 task 3: counters for max battles in the help, the area files and the announcements

Prototype commit: `e5f59dcb52a24ad89b21204b0ba21c665c9cfe8e`

The help of /counters says what a max tier or a max battle's post shows and
takes, with an example; the role choices name their teams, friendship is with
the others in the battle. utilities.md describes the max team (roles, levels,
weather and friendship, refusals, naming, the answer, the dialog, the links,
the gateway's maxTeam) and the raid answer's new link; testing.md the fake's
max teams and the recorded answers; the announcement drafts a line.

**Files:**

```
 docs/architecture/testing.md                                 |  2 +-
 docs/architecture/utilities.md                               |  2 +-
 docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md |  1 +
 src/commands/util/counters.test.ts                           | 12 ++++++++++++
 src/commands/util/counters.ts                                | 15 +++++++++++----
 5 files changed, 26 insertions(+), 6 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/util/counters.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff e5f59dcb52a24ad89b21204b0ba21c665c9cfe8e -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-6 task 3: counters for max battles in the help, the area files and the announcements`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 91f5e19e987313b539012af512a98fbd87293c12..38503213b97cd773993a9f2c14a2ba218ea2c132 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -6,7 +6,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 - Tests are colocated: `*.test.ts` (unit, no Docker) and `*.db.test.ts` (needs Docker). Test against real MySQL and real pino loggers (`test/support/`) rather than mocks. A run of the database suite starts one MySQL container (`test/support/mysql-global-setup.ts`); `startDatabase()` (`test/support/mysql.ts`) gives each caller a database and a user of its own in it and drops both at `stop()`. The user also has `PROCESS`, to see the server's transactions: a test that has a statement wait for a lock asserts the wait (`information_schema.innodb_trx`, joined to `processlist` on its own user, since the server is shared): `lockWaits(db, holder)` (`test/support/lock-waits.ts`) asks until a transaction other than the holder's (`connectionId(trx)`) waits, every 150 ms (InnoDB fills the table anew only once it has not been read for 0.1 seconds), with a deadline of ten seconds.
 - A database test that a statement draws no warning of MySQL (a deprecated syntax, `DEPRECATED_SYNTAX` 1287) runs it through `lastWarnings(db, work)` (`test/support/mysql-warnings.ts`): `work` in a transaction of its own on one connection, then `show warnings`, which follows its last statement rather than the commit's (plan 8W-3).
-- Tests never use the network. Game data in tests comes from the fixtures built by `scripts/game-data/make-fixtures.ts` (`catalogueFixture()`, `gameDataFixture()`); raid bosses come from `test/support/raid-bosses.ts` (`readRaidBossFeed()`, `raidBossesFixture()`, and `MemoryRaidBossStore` for the service, a `MemoryBossStore` of the raid family). Max bosses (plan 8X-2): the recorded Pokebattler feed `readPokebattlerFeed()`, a feed of its shape `pokebattlerFeed(tiers)`, `MAX_FEED_READ_AT`, `MAX_ZONE` and `at(local)` (`test/support/max-bosses.ts`), the recorded max events `readMaxEventFeed()` (`test/support/max-events.ts`), and `maxBossServiceWith()` (`test/support/max-boss-service.ts`: a real `MaxBossService` over `MemoryMaxBossStore`, nothing stored yet, `restarted()` for a restart); `bossCommandsWith({ max: true })` turns max battles on for `/admin boss`, its override ids counted with the raid bosses' as in the one table (`ids`).
+- Tests never use the network. Game data in tests comes from the fixtures built by `scripts/game-data/make-fixtures.ts` (`catalogueFixture()`, `gameDataFixture()`); raid bosses come from `test/support/raid-bosses.ts` (`readRaidBossFeed()`, `raidBossesFixture()`, and `MemoryRaidBossStore` for the service, a `MemoryBossStore` of the raid family). Max bosses (plan 8X-2): the recorded Pokebattler feed `readPokebattlerFeed()`, a feed of its shape `pokebattlerFeed(tiers)`, `MAX_FEED_READ_AT`, `MAX_ZONE` and `at(local)` (`test/support/max-bosses.ts`), the recorded max events `readMaxEventFeed()` (`test/support/max-events.ts`), and `maxBossServiceWith()` (`test/support/max-boss-service.ts`: a real `MaxBossService` over `MemoryMaxBossStore`, nothing stored yet, `restarted()` for a restart); `bossCommandsWith({ max: true })` turns max battles on for `/admin boss`, its override ids counted with the raid bosses' as in the one table (`ids`). Pokebattler in tests is `FakePokebattler` (`test/support/pokebattler.ts`: `asked`, `answer`, `known`, `failing`; for max battle teams, plan 8X-6, `maxAsked` and `maxAnswer`, by default the recorded Uxie team of three attackers); the recorded max team answers of 2026-10-21 are `recordedMaxTeam(name)` (the JSON as Pokebattler gave it, `test/fixtures/pokebattler-max-teams.json`) and `recordedTeam(name)` (read by `readMaxTeam`).
 - Gyms and regions in tests are the invented ones of `test/support/gyms.ts` (never production rows); `createTestContext()` provides `ctx.gyms`, `ctx.pokemon` and `ctx.maps` from `test/support/providers.ts`.
 
 ## How the suites run
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 6a3ee21be3dd8cc2b216e98c54e3cf7b600dd616..3e7c2880f2acbbaccfd4557afe809d9b6a46041d 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -43,7 +43,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 ## Gyms for members, issues, counters and places
 
 - `/find-gym` and `/request` read a gym of this server through `src/commands/util/server-gym.ts` (`#n`, bare digits only when a gym of this server has that number or is called by them, a picked choice, or a clear hit; another server's gym reads as none). GitHub issues go through `ctx.issues` (`GitHubIssues`, `src/services/issue-gateway.ts`: `GITHUB_TOKEN` in the header only, never logged; `GITHUB_REPO`; answers read with a byte limit; a refusal logged by its status and a word for its kind, `refusalKind`, never GitHub's text); text in an issue body has `@`, `#`, `&`, `GH-` and `github.com/` broken by a zero-width space; names in code spans.
-- Pokebattler is `ctx.pokebattler` (`PokebattlerFight`, `src/services/pokebattler-gateway.ts`: ten seconds, 5 MB read by `readLimitedJson`, two requests at once, identical requests shared, answers kept ten minutes, a Pokébox never, the next boss name tried on 400/404 or an empty answer). What a raid tier and a boss are called there, the option tables and the reading of the answer are pure (`src/domain/counters/`). Nominatim is `ctx.places` (`NominatimSearch`, `src/services/place-search.ts`: one request a second for the whole bot, ten waiting, a ten-minute pause after 429/403 also for searches already waiting, the place most likely meant kept a day; the search text is never logged). Of several places by one name `bestPlace` (`src/domain/geo/nominatim.ts`) takes a settlement or boundary before anything else and anything before a road, then the largest; a name is searched in the regions' box widened by `SEARCH_MARGIN_KM` (`widenedBox`); `settings.findRegion` (address and User-Agent) enables `/find-region`. Which regions a place touches is `shapeTouches` (`packages/wayspot-core/src/shape.ts`: the sides' sweep first, then one point each way). `ctx.maps.place` draws a place with regions; place pictures unused for a day are pruned by the hourly upkeep (`ImageCache.removeOlder`). Outside JSON bodies are read with `readLimitedJson` (a byte cap counted while reading). A command that defers publicly in a party's post (`/counters`) reads the party again before it answers and answers privately when the party has ended meanwhile: an edit in an archived post opens it again. The answer of `/counters` is a components-v2 message (`renderCounters`, `src/render/counters.ts`; plan 8B-2): the boss, its raid and moves and the trainers beside its picture, the twelve counters with their moves' type emoji in small print, what the simulation was for in small print (never the member's Pokebattler user number), "Change options…" and the full results. Its options are kept a day (`keptCounters`, `KeptCounterOptions`: at most `COUNTERS_KEPT_MAX`, in memory, without the Pokébox number) under a token, the custom-id kind `counters` (`counters:<token>:options`, the dialog `counters:<token>:dialog`; `src/commands/util/counters-dialog.ts`): the dialog has five labels (attackers with the presser's Pokébox when they have an id, weather, friendship, boss moves of at most 25, "Also list" as a checkbox group); a submit builds the plan from the kept one (boss and tier never change), runs the command's `simulate` and `countersMessage` (a new token; the old one stays good) and answers by `pressAnswer` (a Pokébox only privately); a token that is gone says "These options are no longer kept." A submit counts in the window of the command (above), opening the dialog in its own `MEMBER_READ_THROTTLE` window, and the guard `requireDialogPlan` refuses what does not fit before it is counted.
+- Pokebattler is `ctx.pokebattler` (`PokebattlerFight`, `src/services/pokebattler-gateway.ts`: ten seconds, 5 MB read by `readLimitedJson`, two requests at once, identical requests shared, answers kept ten minutes, a Pokébox never, the next boss name tried on 400/404 or an empty answer). `counters` asks for a raid simulation, `maxTeam` (plan 8X-6) for a max battle team (`GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=&heal=&shield=&level=&weatherCondition=&friendLevel=`, `maxTeamPath`): both through the same turns, limits and pause (no answer for one pauses both), each kind with its own cache. What a raid tier and a boss are called there, the option tables and the reading of the answer are pure (`src/domain/counters/`). Nominatim is `ctx.places` (`NominatimSearch`, `src/services/place-search.ts`: one request a second for the whole bot, ten waiting, a ten-minute pause after 429/403 also for searches already waiting, the place most likely meant kept a day; the search text is never logged). Of several places by one name `bestPlace` (`src/domain/geo/nominatim.ts`) takes a settlement or boundary before anything else and anything before a road, then the largest; a name is searched in the regions' box widened by `SEARCH_MARGIN_KM` (`widenedBox`); `settings.findRegion` (address and User-Agent) enables `/find-region`. Which regions a place touches is `shapeTouches` (`packages/wayspot-core/src/shape.ts`: the sides' sweep first, then one point each way). `ctx.maps.place` draws a place with regions; place pictures unused for a day are pruned by the hourly upkeep (`ImageCache.removeOlder`). Outside JSON bodies are read with `readLimitedJson` (a byte cap counted while reading). `/counters` for max battles (plan 8X-6; design section 8) is a max tier of `tier:` (D1 to D5, G, after the raid tiers) or the post of a max battle (its boss and tier, as a raid's post gives its own; a boss named there is taken in its tier), or a boss named without a tier that is no raid boss now and is a max boss (`currentMaxTier`: the most stars, Gigantamax last). It shows Pokebattler's suggested team of three for the member's `role:`, one table (`MAX_ROLES`, `src/domain/counters/max-team.ts`; Matt, 2026-10-21, "a good starting point"): Attacker 3/0/0 (attack/heal/shield; the default), Balanced 2/0/1, Tank 1/0/2, Healer 1/2/0; Pokebattler refuses a team that is not three. Levels are `MAX_TEAM_LEVELS`, 20 to 50 in steps of five (no best buddy levels: one Pokémon at a time is a best buddy; Matt), 40 unless named; weather and friendship as the raid's (the endpoint reads `weatherCondition` and `friendLevel`, probed live on 2026-10-21; friendship 0 without it); `moveset`, `shadow`, `mega`, `single` and the Pokébox level are refused in words for a max tier (`readMaxPlan`, in the guard, uncounted), `role` for a raid. The boss's names there are `pokebattlerMaxDefenders` (a Gigantamax boss as the feed writes it, `MACHAMP_GIGANTAMAX`, `TOXTRICITY_AMPED_GIGANTAMAX`; a mega has none and is refused); the answer is read by `readMaxTeam` (zod; `MOVE_NONE` is no charged move: the max moves are the point) and its Pokémon named as the max boss feed is mapped (`maxTeamMember`, `maxBossOf`: `RILLABOOM_GIGANTAMAX` is Gigantamax Rillaboom, pictured by `maxBossPicture`; one the game data does not know by Pokebattler's name in words, logged). The answer (`renderMaxTeam`, `src/render/max-team.ts`; `src/commands/util/max-counters.ts`) is in the counters' form: the boss, its types and the role beside its picture, each of the three with its role (`slotRoleWords`: Attacker, Tank, Healer) and moves beside its picture, the first `SHOWN_ALTERNATIVES` (five) alternatives once per role (Pokebattler gives the slots of one role the same ten), the level the answer used, the weather and friendship and the max move levels in small print, "Change options…" (its dialog: role, level, weather, friendship; the kept options `KeptMaxCounters`, `kind: 'max'`, in the same `keptCounters` under the same custom-id kind), and "Full results", the role's page of Pokebattler's site (`maxTeamLink`: `/max/<boss>`, `/PARTY`, `/TANK`, `/TOTAL_HEAL`). No trainers estimate. The raid answer's "Full results" is the boss's page of the new site (`counterSiteLink`: `/raids/<boss>`, with `includeShadow=0` and `includeMegas=0` where the answer left them out; the site sends the API's long path there, dropping every option). A command that defers publicly in a party's post (`/counters`) reads the party again before it answers and answers privately when the party has ended meanwhile: an edit in an archived post opens it again. The answer of `/counters` is a components-v2 message (`renderCounters`, `src/render/counters.ts`; plan 8B-2): the boss, its raid and moves and the trainers beside its picture, the twelve counters with their moves' type emoji in small print, what the simulation was for in small print (never the member's Pokebattler user number), "Change options…" and the full results. Its options are kept a day (`keptCounters`, `KeptCounterOptions`: at most `COUNTERS_KEPT_MAX`, in memory, without the Pokébox number) under a token, the custom-id kind `counters` (`counters:<token>:options`, the dialog `counters:<token>:dialog`; `src/commands/util/counters-dialog.ts`): the dialog has five labels (attackers with the presser's Pokébox when they have an id, weather, friendship, boss moves of at most 25, "Also list" as a checkbox group); a submit builds the plan from the kept one (boss and tier never change), runs the command's `simulate` and `countersMessage` (a new token; the old one stays good) and answers by `pressAnswer` (a Pokébox only privately); a token that is gone says "These options are no longer kept." A submit counts in the window of the command (above), opening the dialog in its own `MEMBER_READ_THROTTLE` window, and the guard `requireDialogPlan` refuses what does not fit before it is counted.
 - `/maps` is offered where `settings.web` or `settings.regionMapLink` (blank is unset) is set. With the web pages it answers in a server with the map's address and a button of a login link (`ctx.loginLinks.issue`, `web.md`; its small print says not to share it: it logs in whoever opens it as the member), under `MEMBER_WRITE_THROTTLE` (a link is a write); in a DM, which names no server, with `regionMapLink` or "Use /maps in your server."; without them with `regionMapLink` anywhere. `MEMBER_READ_THROTTLE` is the throttle of member commands that only read.
 
 ## /help
diff --git a/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md b/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
index 26d6c291d9e3784ff767d1868906825cb7681c89..02029c1969addf2ae75a025b9f1feebd3e7f5456 100644
--- a/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
+++ b/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
@@ -60,6 +60,7 @@ Pine has been rewritten from the ground up:
 - Buttons on the post instead of reactions, with the legacy reaction icons, in three rows at the bottom, the same for one group and several: Interested, Join, Here, Done, Leave; Meet… (the game's Select Time icon), −1, +1, Remote; Group… (and Set time while a raid has no times). A newcomer to a post of several groups is asked which group in a dialog; Group… moves a member or opens a group with a label; Meet… sets the group's meeting time from a list with the in-game RSVP times. Legacy `!group`, `!new` and `!meet` are Group…, Meet… and `/group`, `/meet`; a group nobody is in goes by itself
 - Raid screenshots read with `/raid` or a mention of the bot
 - Max battles (`/max`) at power spots, with lobbies of 4 (Dynamax) and 100 (Gigantamax) that Join fills, the bosses from Pokebattler with the event's boss first, and wants of a species covering its max battles
+- `/counters` for a max battle: the team of three Pokebattler suggests for your role (attacker, balanced, tank or healer), with a few others that would do
 - Members report a raid, max battle, train, meetup or single message to your moderators privately (`/report`, or Apps › Report to moderators on a message); `/delete` is for staff and asks whether to archive the post or delete it
 - Gyms imported from Wayfarer (`/gym import`), regions from KML (`/region import`)
 - A history of every ended raid, max battle, train and meetup for statistics; members are named in it only if they opt in (`/settings history`)
diff --git a/src/commands/util/counters.test.ts b/src/commands/util/counters.test.ts
index 97924a99d0c4403340cd13b777453aafb6cd4687..c92ae50356eac8c29034c509c87d7f3de134f629 100644
--- a/src/commands/util/counters.test.ts
+++ b/src/commands/util/counters.test.ts
@@ -399,6 +399,18 @@ describe('/counters: more in the posts of parties', () => {
       'A boss you name in the post of a raid is simulated in that raid’s tier',
     );
     expect(details).toContain('A Pokébox lists its shadow Pokémon and megas too');
+    // Max battles (plan 8X-6): the team of the role, what it takes and what it does not.
+    expect(details).toContain(
+      'With a max battle tier, or in the post of a max battle, it shows the team of three ' +
+        'Pokebattler suggests for your `role`',
+    );
+    expect(details).toContain('levels 20 to 50 in steps of five');
+    expect(counters.help.examples).toContain(
+      '/counters boss:Uxie tier:Dynamax 5★ role:Tank (an attacker and two tanks)',
+    );
+    expect(described('friendship')).toBe(
+      'Friendship with the others in the battle; best friends when left out',
+    );
   });
 
   it('refuses a boss too new for the game data', async () => {
diff --git a/src/commands/util/counters.ts b/src/commands/util/counters.ts
index 829da3303c71bda452b0a149976b0836aba442b1..eec72c48d0fe867038c26f686e73f47b15bdffeb 100644
--- a/src/commands/util/counters.ts
+++ b/src/commands/util/counters.ts
@@ -752,7 +752,8 @@ export function answeredMessage(
 
 /**
  * `/counters` (spec row 199, the legacy `!counters`): the best counters against a raid boss, as
- * Pokebattler simulates the raid, with the trainers each takes. In the post of a raid the boss
+ * Pokebattler simulates the raid, with the trainers each takes; for a max battle (plan 8X-6) the
+ * team Pokebattler suggests for the member's role (`max-counters.ts`). In the post of a raid the boss
  * and tier are the raid's and the answer is public (the group sees it); elsewhere the boss is
  * named and the tier is the one it is a boss of now, and the answer is the member's alone, as
  * is every answer for a Pokébox. In servers and in a DM with the bot.
@@ -790,7 +791,7 @@ export const counters: SimpleCommand = {
         .setDescription('For a max battle: what your three Pokémon are for; Attacker when left out')
         .addChoices(
           MAX_ROLE_KEYS.map((role) => ({
-            name: `${MAX_ROLES[role].name}: ${MAX_ROLES[role].team}`,
+            name: `${MAX_ROLES[role].name} (${MAX_ROLES[role].team})`,
             value: role,
           })),
         ),
@@ -815,7 +816,7 @@ export const counters: SimpleCommand = {
     .addStringOption((option) =>
       option
         .setName('friendship')
-        .setDescription('Friendship with the others in the raid; best friends when left out')
+        .setDescription('Friendship with the others in the battle; best friends when left out')
         .addChoices(
           FRIENDSHIPS.map((friendship) => ({
             name: FRIENDSHIP_NAMES[friendship],
@@ -860,12 +861,18 @@ export const counters: SimpleCommand = {
       '`shadow` or `mega` is False. "Change options…" under an answer opens a dialog with ' +
       'its attackers, weather, friendship, boss moves and what else to list: the member who ' +
       'asked changes the answer for everybody, anybody else gets an answer of their own. The ' +
-      'options of an answer are kept for a day.',
+      'options of an answer are kept for a day. With a max battle tier, or in the post of a max ' +
+      'battle, it shows the team of three Pokebattler suggests for your `role` (Attacker unless ' +
+      'you name another: Balanced, Tank or Healer), each Pokémon with its moves and a few others ' +
+      'that would do, at levels 20 to 50 in steps of five, with the weather and friendship you ' +
+      'name; boss moves, shadow Pokémon, megas and a Pokébox do not apply there. A boss you name ' +
+      'that is no raid boss now is taken in the max battle tier it is a boss of.',
     examples: [
       '/counters',
       '/counters boss:Mewtwo',
       '/counters boss:Rayquaza tier:T5 level:Level 50 weather:Windy',
       '/counters level:My Pokébox on Pokebattler',
+      '/counters boss:Uxie tier:Dynamax 5★ role:Tank (an attacker and two tanks)',
     ],
   },
   guards: [requireCounterPlan],
````

### Task 7: 8X-6 task 2d: the max roles with a charger, in Pokebattler's words

Prototype commit: `ca2c6ca1243905a3250ba280a09c1a1b6a44d314`

Matt's roles as of 2026-10-21, five counts each (attack, meterCharge, shield,
heal, charge, all sent): Attackers + charger 2/1/0/0, the default and his
usual team; Balanced 1/1/1/0; All attackers 3/0/0/0; Shielder 1/0/2/0;
Healer 1/0/0/2. Slots are worded as Pokebattler's page words them (Attacker,
Charger, Shielder, Healer, Defender for CHARGE). Full results: All attackers
/max/<boss>, a team with a charger /METER_CHARGE, Shielder /TANK, Healer
/TOTAL_HEAL. The default team has no recorded answer: its test fakes one from
a recorded team, and staging checks a real one. utilities.md says the endpoint
is not among Pokebattler's documented ones.

**Files:**

```
 docs/architecture/testing.md                                 |   2 +-
 docs/architecture/utilities.md                               |   2 +-
 docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md |   2 +-
 src/commands/util/counters-dialog.test.ts                    |  88 ++++++++++++++++++++++++--
 src/commands/util/counters.test.ts                           |  61 +++++++++++++++---
 src/commands/util/counters.ts                                |  11 ++--
 src/commands/util/max-counters.ts                            |   2 +-
 src/domain/counters/max-team.test.ts                         |  47 ++++++++------
 src/domain/counters/max-team.ts                              | 102 ++++++++++++++++++++++++-------
 src/render/max-team.ts                                       |   4 +-
 src/services/pokebattler-gateway.test.ts                     |   5 +-
 test/fixtures/pokebattler-max-teams.json                     |   2 +-
 test/support/pokebattler.ts                                  |  19 ++++--
 13 files changed, 270 insertions(+), 77 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/util/counters-dialog.test.ts src/commands/util/counters.test.ts src/domain/counters/max-team.test.ts src/services/pokebattler-gateway.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff ca2c6ca1243905a3250ba280a09c1a1b6a44d314 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-6 task 2d: the max roles with a charger, in Pokebattler's words`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 38503213b97cd773993a9f2c14a2ba218ea2c132..9a6923d5153ca619f274d1f775da06d18d3c4170 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -6,7 +6,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 - Tests are colocated: `*.test.ts` (unit, no Docker) and `*.db.test.ts` (needs Docker). Test against real MySQL and real pino loggers (`test/support/`) rather than mocks. A run of the database suite starts one MySQL container (`test/support/mysql-global-setup.ts`); `startDatabase()` (`test/support/mysql.ts`) gives each caller a database and a user of its own in it and drops both at `stop()`. The user also has `PROCESS`, to see the server's transactions: a test that has a statement wait for a lock asserts the wait (`information_schema.innodb_trx`, joined to `processlist` on its own user, since the server is shared): `lockWaits(db, holder)` (`test/support/lock-waits.ts`) asks until a transaction other than the holder's (`connectionId(trx)`) waits, every 150 ms (InnoDB fills the table anew only once it has not been read for 0.1 seconds), with a deadline of ten seconds.
 - A database test that a statement draws no warning of MySQL (a deprecated syntax, `DEPRECATED_SYNTAX` 1287) runs it through `lastWarnings(db, work)` (`test/support/mysql-warnings.ts`): `work` in a transaction of its own on one connection, then `show warnings`, which follows its last statement rather than the commit's (plan 8W-3).
-- Tests never use the network. Game data in tests comes from the fixtures built by `scripts/game-data/make-fixtures.ts` (`catalogueFixture()`, `gameDataFixture()`); raid bosses come from `test/support/raid-bosses.ts` (`readRaidBossFeed()`, `raidBossesFixture()`, and `MemoryRaidBossStore` for the service, a `MemoryBossStore` of the raid family). Max bosses (plan 8X-2): the recorded Pokebattler feed `readPokebattlerFeed()`, a feed of its shape `pokebattlerFeed(tiers)`, `MAX_FEED_READ_AT`, `MAX_ZONE` and `at(local)` (`test/support/max-bosses.ts`), the recorded max events `readMaxEventFeed()` (`test/support/max-events.ts`), and `maxBossServiceWith()` (`test/support/max-boss-service.ts`: a real `MaxBossService` over `MemoryMaxBossStore`, nothing stored yet, `restarted()` for a restart); `bossCommandsWith({ max: true })` turns max battles on for `/admin boss`, its override ids counted with the raid bosses' as in the one table (`ids`). Pokebattler in tests is `FakePokebattler` (`test/support/pokebattler.ts`: `asked`, `answer`, `known`, `failing`; for max battle teams, plan 8X-6, `maxAsked` and `maxAnswer`, by default the recorded Uxie team of three attackers); the recorded max team answers of 2026-10-21 are `recordedMaxTeam(name)` (the JSON as Pokebattler gave it, `test/fixtures/pokebattler-max-teams.json`) and `recordedTeam(name)` (read by `readMaxTeam`).
+- Tests never use the network. Game data in tests comes from the fixtures built by `scripts/game-data/make-fixtures.ts` (`catalogueFixture()`, `gameDataFixture()`); raid bosses come from `test/support/raid-bosses.ts` (`readRaidBossFeed()`, `raidBossesFixture()`, and `MemoryRaidBossStore` for the service, a `MemoryBossStore` of the raid family). Max bosses (plan 8X-2): the recorded Pokebattler feed `readPokebattlerFeed()`, a feed of its shape `pokebattlerFeed(tiers)`, `MAX_FEED_READ_AT`, `MAX_ZONE` and `at(local)` (`test/support/max-bosses.ts`), the recorded max events `readMaxEventFeed()` (`test/support/max-events.ts`), and `maxBossServiceWith()` (`test/support/max-boss-service.ts`: a real `MaxBossService` over `MemoryMaxBossStore`, nothing stored yet, `restarted()` for a restart); `bossCommandsWith({ max: true })` turns max battles on for `/admin boss`, its override ids counted with the raid bosses' as in the one table (`ids`). Pokebattler in tests is `FakePokebattler` (`test/support/pokebattler.ts`: `asked`, `answer`, `known`, `failing`; for max battle teams, plan 8X-6, `maxAsked` and `maxAnswer`, by default the recorded Uxie team of two attackers and a charger, the default role's); the recorded max team answers of 2026-10-21 are `recordedMaxTeam(name)` (the JSON as Pokebattler gave it, `test/fixtures/pokebattler-max-teams.json`) and `recordedTeam(name)` (read by `readMaxTeam`).
 - Gyms and regions in tests are the invented ones of `test/support/gyms.ts` (never production rows); `createTestContext()` provides `ctx.gyms`, `ctx.pokemon` and `ctx.maps` from `test/support/providers.ts`.
 
 ## How the suites run
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 3e7c2880f2acbbaccfd4557afe809d9b6a46041d..8cb60a37d95d33aeb3213113844675f03c04331c 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -43,7 +43,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 ## Gyms for members, issues, counters and places
 
 - `/find-gym` and `/request` read a gym of this server through `src/commands/util/server-gym.ts` (`#n`, bare digits only when a gym of this server has that number or is called by them, a picked choice, or a clear hit; another server's gym reads as none). GitHub issues go through `ctx.issues` (`GitHubIssues`, `src/services/issue-gateway.ts`: `GITHUB_TOKEN` in the header only, never logged; `GITHUB_REPO`; answers read with a byte limit; a refusal logged by its status and a word for its kind, `refusalKind`, never GitHub's text); text in an issue body has `@`, `#`, `&`, `GH-` and `github.com/` broken by a zero-width space; names in code spans.
-- Pokebattler is `ctx.pokebattler` (`PokebattlerFight`, `src/services/pokebattler-gateway.ts`: ten seconds, 5 MB read by `readLimitedJson`, two requests at once, identical requests shared, answers kept ten minutes, a Pokébox never, the next boss name tried on 400/404 or an empty answer). `counters` asks for a raid simulation, `maxTeam` (plan 8X-6) for a max battle team (`GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=&heal=&shield=&level=&weatherCondition=&friendLevel=`, `maxTeamPath`): both through the same turns, limits and pause (no answer for one pauses both), each kind with its own cache. What a raid tier and a boss are called there, the option tables and the reading of the answer are pure (`src/domain/counters/`). Nominatim is `ctx.places` (`NominatimSearch`, `src/services/place-search.ts`: one request a second for the whole bot, ten waiting, a ten-minute pause after 429/403 also for searches already waiting, the place most likely meant kept a day; the search text is never logged). Of several places by one name `bestPlace` (`src/domain/geo/nominatim.ts`) takes a settlement or boundary before anything else and anything before a road, then the largest; a name is searched in the regions' box widened by `SEARCH_MARGIN_KM` (`widenedBox`); `settings.findRegion` (address and User-Agent) enables `/find-region`. Which regions a place touches is `shapeTouches` (`packages/wayspot-core/src/shape.ts`: the sides' sweep first, then one point each way). `ctx.maps.place` draws a place with regions; place pictures unused for a day are pruned by the hourly upkeep (`ImageCache.removeOlder`). Outside JSON bodies are read with `readLimitedJson` (a byte cap counted while reading). `/counters` for max battles (plan 8X-6; design section 8) is a max tier of `tier:` (D1 to D5, G, after the raid tiers) or the post of a max battle (its boss and tier, as a raid's post gives its own; a boss named there is taken in its tier), or a boss named without a tier that is no raid boss now and is a max boss (`currentMaxTier`: the most stars, Gigantamax last). It shows Pokebattler's suggested team of three for the member's `role:`, one table (`MAX_ROLES`, `src/domain/counters/max-team.ts`; Matt, 2026-10-21, "a good starting point"): Attacker 3/0/0 (attack/heal/shield; the default), Balanced 2/0/1, Tank 1/0/2, Healer 1/2/0; Pokebattler refuses a team that is not three. Levels are `MAX_TEAM_LEVELS`, 20 to 50 in steps of five (no best buddy levels: one Pokémon at a time is a best buddy; Matt), 40 unless named; weather and friendship as the raid's (the endpoint reads `weatherCondition` and `friendLevel`, probed live on 2026-10-21; friendship 0 without it); `moveset`, `shadow`, `mega`, `single` and the Pokébox level are refused in words for a max tier (`readMaxPlan`, in the guard, uncounted), `role` for a raid. The boss's names there are `pokebattlerMaxDefenders` (a Gigantamax boss as the feed writes it, `MACHAMP_GIGANTAMAX`, `TOXTRICITY_AMPED_GIGANTAMAX`; a mega has none and is refused); the answer is read by `readMaxTeam` (zod; `MOVE_NONE` is no charged move: the max moves are the point) and its Pokémon named as the max boss feed is mapped (`maxTeamMember`, `maxBossOf`: `RILLABOOM_GIGANTAMAX` is Gigantamax Rillaboom, pictured by `maxBossPicture`; one the game data does not know by Pokebattler's name in words, logged). The answer (`renderMaxTeam`, `src/render/max-team.ts`; `src/commands/util/max-counters.ts`) is in the counters' form: the boss, its types and the role beside its picture, each of the three with its role (`slotRoleWords`: Attacker, Tank, Healer) and moves beside its picture, the first `SHOWN_ALTERNATIVES` (five) alternatives once per role (Pokebattler gives the slots of one role the same ten), the level the answer used, the weather and friendship and the max move levels in small print, "Change options…" (its dialog: role, level, weather, friendship; the kept options `KeptMaxCounters`, `kind: 'max'`, in the same `keptCounters` under the same custom-id kind), and "Full results", the role's page of Pokebattler's site (`maxTeamLink`: `/max/<boss>`, `/PARTY`, `/TANK`, `/TOTAL_HEAL`). No trainers estimate. The raid answer's "Full results" is the boss's page of the new site (`counterSiteLink`: `/raids/<boss>`, with `includeShadow=0` and `includeMegas=0` where the answer left them out; the site sends the API's long path there, dropping every option). A command that defers publicly in a party's post (`/counters`) reads the party again before it answers and answers privately when the party has ended meanwhile: an edit in an archived post opens it again. The answer of `/counters` is a components-v2 message (`renderCounters`, `src/render/counters.ts`; plan 8B-2): the boss, its raid and moves and the trainers beside its picture, the twelve counters with their moves' type emoji in small print, what the simulation was for in small print (never the member's Pokebattler user number), "Change options…" and the full results. Its options are kept a day (`keptCounters`, `KeptCounterOptions`: at most `COUNTERS_KEPT_MAX`, in memory, without the Pokébox number) under a token, the custom-id kind `counters` (`counters:<token>:options`, the dialog `counters:<token>:dialog`; `src/commands/util/counters-dialog.ts`): the dialog has five labels (attackers with the presser's Pokébox when they have an id, weather, friendship, boss moves of at most 25, "Also list" as a checkbox group); a submit builds the plan from the kept one (boss and tier never change), runs the command's `simulate` and `countersMessage` (a new token; the old one stays good) and answers by `pressAnswer` (a Pokébox only privately); a token that is gone says "These options are no longer kept." A submit counts in the window of the command (above), opening the dialog in its own `MEMBER_READ_THROTTLE` window, and the guard `requireDialogPlan` refuses what does not fit before it is counted.
+- Pokebattler is `ctx.pokebattler` (`PokebattlerFight`, `src/services/pokebattler-gateway.ts`: ten seconds, 5 MB read by `readLimitedJson`, two requests at once, identical requests shared, answers kept ten minutes, a Pokébox never, the next boss name tried on 400/404 or an empty answer). `counters` asks for a raid simulation, `maxTeam` (plan 8X-6) for a max battle team (`GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=&heal=&shield=&charge=&meterCharge=&level=&weatherCondition=&friendLevel=`, `maxTeamPath`; not among Pokebattler's documented endpoints, www.pokebattler.com/developers, so it may change without notice; a 400 or 404 there is read as a boss it does not know, but may also be parameters it refuses, for staging to tell apart): both through the same turns, limits and pause (no answer for one pauses both), each kind with its own cache. What a raid tier and a boss are called there, the option tables and the reading of the answer are pure (`src/domain/counters/`). Nominatim is `ctx.places` (`NominatimSearch`, `src/services/place-search.ts`: one request a second for the whole bot, ten waiting, a ten-minute pause after 429/403 also for searches already waiting, the place most likely meant kept a day; the search text is never logged). Of several places by one name `bestPlace` (`src/domain/geo/nominatim.ts`) takes a settlement or boundary before anything else and anything before a road, then the largest; a name is searched in the regions' box widened by `SEARCH_MARGIN_KM` (`widenedBox`); `settings.findRegion` (address and User-Agent) enables `/find-region`. Which regions a place touches is `shapeTouches` (`packages/wayspot-core/src/shape.ts`: the sides' sweep first, then one point each way). `ctx.maps.place` draws a place with regions; place pictures unused for a day are pruned by the hourly upkeep (`ImageCache.removeOlder`). Outside JSON bodies are read with `readLimitedJson` (a byte cap counted while reading). `/counters` for max battles (plan 8X-6; design section 8) is a max tier of `tier:` (D1 to D5, G, after the raid tiers) or the post of a max battle (its boss and tier, as a raid's post gives its own; a boss named there is taken in its tier), or a boss named without a tier that is no raid boss now and is a max boss (`currentMaxBoss`: the most stars, Gigantamax last; for a species a listed form of it, which is then the boss). "Gigantamax X" and "Dynamax X" are read as `/max` reads them. Gigantamax is refused, in the guard, for a Pokémon the game master has neither itself nor any form of as Gigantamax, unless it is on the max boss list at G (Pokebattler's feed may be ahead of the game data) or the post is of its Gigantamax battle; a species is asked under its own Gigantamax name and those of its forms that Gigantamax (`gigantamaxDefenders`: Toxtricity and both its forms, Urshifu only its forms). It shows Pokebattler's suggested team of three for the member's `role:`, one table (`MAX_ROLES`, `src/domain/counters/max-team.ts`; Matt, 2026-10-21, "a good starting point"): Attackers + charger 2/1/0/0 (attack/meterCharge/shield/heal; the default, Matt's usual team), Balanced 1/1/1/0, All attackers 3/0/0/0, Shielder 1/0/2/0, Healer 1/0/0/2, `charge` (Pokebattler's defender) 0 in all; every count is sent, and Pokebattler refuses a team that is not three. Every role but Balanced has a recorded answer in the tests (`uxie-d5-2-1-0-0` the default's). Levels are `MAX_TEAM_LEVELS`, 20 to 50 in steps of five (no best buddy levels: one Pokémon at a time is a best buddy; Matt), 40 unless named; weather and friendship as the raid's (the endpoint reads `weatherCondition` and `friendLevel`, probed live on 2026-10-21; friendship 0 without it); `moveset`, `shadow`, `mega`, `single` and the Pokébox level are refused in words for a max tier (`readMaxPlan`, in the guard, uncounted), `role` for a raid. The boss's names there are `pokebattlerMaxDefenders` (a Gigantamax boss as the feed writes it, `MACHAMP_GIGANTAMAX`, `TOXTRICITY_AMPED_GIGANTAMAX`; a mega has none and is refused); the answer is read by `readMaxTeam` (zod; `MOVE_NONE` is no charged move: the max moves are the point) and its Pokémon named as the max boss feed is mapped (`maxTeamMember`, `maxBossOf`: `RILLABOOM_GIGANTAMAX` is Gigantamax Rillaboom, pictured by `maxBossPicture`; one the game data does not know by Pokebattler's name in words, logged). The answer (`renderMaxTeam`, `src/render/max-team.ts`; `src/commands/util/max-counters.ts`) is in the counters' form: the boss, its types and the role beside its picture, each of the three with its role (`slotRoleWords`, Pokebattler's page's words: `ATTACK` Attacker, `METER_CHARGE` Charger, `SHIELD` Shielder, `HEAL` Healer, `CHARGE` Defender) and moves beside its picture, the first `SHOWN_ALTERNATIVES` (five) alternatives once per role (Pokebattler gives the slots of one role the same ten), the level the answer used, the weather and friendship and the max move levels in small print, "Change options…" (its dialog: role, level, weather, friendship; the kept options `KeptMaxCounters`, `kind: 'max'`, in the same `keptCounters` under the same custom-id kind), and "Full results", the role's page of Pokebattler's site (`maxTeamLink`: All attackers `/max/<boss>`, a team with a charger `/METER_CHARGE`, Shielder `/TANK`, Healer `/TOTAL_HEAL`; `/CHARGER` is the defenders' and `/PARTY` a lobby of four, no role's). No trainers estimate. The raid answer's "Full results" is the boss's page of the new site (`counterSiteLink`: `/raids/<boss>`, with `includeShadow=0` and `includeMegas=0` where the answer left them out; the site sends the API's long path there, dropping every option). A command that defers publicly in a party's post (`/counters`) reads the party again before it answers and answers privately when the party has ended meanwhile: an edit in an archived post opens it again. The answer of `/counters` is a components-v2 message (`renderCounters`, `src/render/counters.ts`; plan 8B-2): the boss, its raid and moves and the trainers beside its picture, the twelve counters with their moves' type emoji in small print, what the simulation was for in small print (never the member's Pokebattler user number), "Change options…" and the full results. Its options are kept a day (`keptCounters`, `KeptCounterOptions`: at most `COUNTERS_KEPT_MAX`, in memory, without the Pokébox number) under a token, the custom-id kind `counters` (`counters:<token>:options`, the dialog `counters:<token>:dialog`; `src/commands/util/counters-dialog.ts`): the dialog has five labels (attackers with the presser's Pokébox when they have an id, weather, friendship, boss moves of at most 25, "Also list" as a checkbox group); a submit builds the plan from the kept one (boss and tier never change), runs the command's `simulate` and `countersMessage` (a new token; the old one stays good) and answers by `pressAnswer` (a Pokébox only privately); a token that is gone says "These options are no longer kept." A submit counts in the window of the command (above), opening the dialog in its own `MEMBER_READ_THROTTLE` window, and the guard `requireDialogPlan` refuses what does not fit before it is counted.
 - `/maps` is offered where `settings.web` or `settings.regionMapLink` (blank is unset) is set. With the web pages it answers in a server with the map's address and a button of a login link (`ctx.loginLinks.issue`, `web.md`; its small print says not to share it: it logs in whoever opens it as the member), under `MEMBER_WRITE_THROTTLE` (a link is a write); in a DM, which names no server, with `regionMapLink` or "Use /maps in your server."; without them with `regionMapLink` anywhere. `MEMBER_READ_THROTTLE` is the throttle of member commands that only read.
 
 ## /help
diff --git a/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md b/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
index 02029c1969addf2ae75a025b9f1feebd3e7f5456..a02726bcda114c0f279e0016fe83fd503e9a8a27 100644
--- a/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
+++ b/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
@@ -60,7 +60,7 @@ Pine has been rewritten from the ground up:
 - Buttons on the post instead of reactions, with the legacy reaction icons, in three rows at the bottom, the same for one group and several: Interested, Join, Here, Done, Leave; Meet… (the game's Select Time icon), −1, +1, Remote; Group… (and Set time while a raid has no times). A newcomer to a post of several groups is asked which group in a dialog; Group… moves a member or opens a group with a label; Meet… sets the group's meeting time from a list with the in-game RSVP times. Legacy `!group`, `!new` and `!meet` are Group…, Meet… and `/group`, `/meet`; a group nobody is in goes by itself
 - Raid screenshots read with `/raid` or a mention of the bot
 - Max battles (`/max`) at power spots, with lobbies of 4 (Dynamax) and 100 (Gigantamax) that Join fills, the bosses from Pokebattler with the event's boss first, and wants of a species covering its max battles
-- `/counters` for a max battle: the team of three Pokebattler suggests for your role (attacker, balanced, tank or healer), with a few others that would do
+- `/counters` for a max battle: the team of three Pokebattler suggests for your role (two attackers and a charger, balanced, all attackers, shielder or healer), with a few others that would do
 - Members report a raid, max battle, train, meetup or single message to your moderators privately (`/report`, or Apps › Report to moderators on a message); `/delete` is for staff and asks whether to archive the post or delete it
 - Gyms imported from Wayfarer (`/gym import`), regions from KML (`/region import`)
 - A history of every ended raid, max battle, train and meetup for statistics; members are named in it only if they opt in (`/settings history`)
diff --git a/src/commands/util/counters-dialog.test.ts b/src/commands/util/counters-dialog.test.ts
index d47e5bdac253b4191cbdae1a4ea15861f789bdbc..33464dd1a5998b376379d428ff738d19fdea45d5 100644
--- a/src/commands/util/counters-dialog.test.ts
+++ b/src/commands/util/counters-dialog.test.ts
@@ -515,8 +515,14 @@ describe('/counters: Change options… under a max battle team', () => {
     ]);
     expect(selectedIn(form, 'Weather')).toEqual(['NO_WEATHER']);
     expect(selectedIn(form, 'Friendship')).toEqual(['4']);
-    expect(valuesIn(form, 'Your role')).toEqual(['attacker', 'balanced', 'tank', 'healer']);
-    expect(selectedIn(form, 'Your role')).toEqual(['attacker']);
+    expect(valuesIn(form, 'Your role')).toEqual([
+      'charger',
+      'balanced',
+      'attackers',
+      'shielder',
+      'healer',
+    ]);
+    expect(selectedIn(form, 'Your role')).toEqual(['charger']);
     // The levels of a team: no best buddy levels.
     expect(valuesIn(form, 'Level of your Pokémon')).toEqual([
       '20',
@@ -538,7 +544,7 @@ describe('/counters: Change options… under a max battle team', () => {
       userId: ALICE,
       askedBy: ALICE,
       form: shown,
-      selected: { role: ['tank'], level: ['30'], weather: ['FOG'], friendship: ['1'] },
+      selected: { role: ['shielder'], level: ['30'], weather: ['FOG'], friendship: ['1'] },
       ...made.where,
     });
     await made.router.handle(form as never);
@@ -546,23 +552,93 @@ describe('/counters: Change options… under a max battle team', () => {
     expect(made.pokebattler.maxAsked.at(-1)).toEqual({
       boss: 'MACHAMP',
       maxLevel: 'RAID_LEVEL_2_MAX',
-      role: 'tank',
+      role: 'shielder',
       level: '30',
       weather: 'FOG',
       friendship: '1',
     });
     const changed = asV2(sent(form.editReply));
-    expect(textDisplays(changed)[0]).toContain('your role: Tank, an attacker and two tanks');
+    expect(textDisplays(changed)[0]).toContain(
+      'your role: Shielder (an attacker and two shielders)',
+    );
     const newToken = buttonsOf(changed)
       .find((b) => b.label === 'Change options…')
       ?.customId?.split(':')[1];
     expect(keptCounters.get(newToken ?? '')).toMatchObject({
       kind: 'max',
-      role: 'tank',
+      role: 'shielder',
       level: '30',
       weather: 'FOG',
       friendship: '1',
       partyId: made.max.party.id,
     });
   });
+
+  it('gives anybody else a private copy of the team of their role', async () => {
+    const made = await maxSetup();
+    const shown = (await made.open(BOB)).showModal.mock.calls[0]?.[0];
+    const form = fakeModal({
+      customId: `counters:${made.token}:dialog`,
+      userId: BOB,
+      askedBy: ALICE,
+      form: shown,
+      selected: { role: ['healer'], level: ['40'], weather: ['NO_WEATHER'], friendship: ['4'] },
+      ...made.where,
+    });
+    await made.router.handle(form as never);
+    expect(form.deferUpdate).not.toHaveBeenCalled();
+    expect(form.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
+    expect(made.pokebattler.maxAsked.at(-1)).toMatchObject({ role: 'healer' });
+    const copy = asV2(sent(form.editReply));
+    expect(textDisplays(copy)[0]).toContain('your role: Healer (an attacker and two healers)');
+    const copyToken = buttonsOf(copy)
+      .find((b) => b.label === 'Change options…')
+      ?.customId?.split(':')[1];
+    expect(keptCounters.get(copyToken ?? '')).toMatchObject({
+      kind: 'max',
+      askerId: BOB,
+      partyId: null,
+    });
+  });
+
+  it('refuses a role or level not of its lists before the submit is counted', async () => {
+    const made = await maxSetup();
+    const forged = async (selected: Record<string, string[]>) => {
+      const form = fakeModal({
+        customId: `counters:${made.token}:dialog`,
+        userId: ALICE,
+        askedBy: ALICE,
+        selected: {
+          role: ['charger'],
+          level: ['40'],
+          weather: ['NO_WEATHER'],
+          friendship: ['4'],
+          ...selected,
+        },
+        ...made.where,
+      });
+      await made.router.handle(form as never);
+      return sent(form.reply).content;
+    };
+    expect(await forged({ role: ['wizard'] })).toBe('Pick the role from its list.');
+    expect(await forged({ level: ['51'] })).toBe(
+      'A max battle team is simulated at level 20, 25, 30, 35, 40, 45 or 50: pick one of those.',
+    );
+    expect(await forged({ level: ['box'] })).toMatch(/cannot use your Pokébox/);
+    expect(made.pokebattler.maxAsked).toHaveLength(1);
+    // None of them counted: the command's use and two submits are the three of a minute.
+    const shown = (await made.open(ALICE)).showModal.mock.calls[0]?.[0];
+    for (let i = 0; i < 2; i += 1) {
+      const form = fakeModal({
+        customId: `counters:${made.token}:dialog`,
+        userId: ALICE,
+        askedBy: ALICE,
+        form: shown,
+        selected: { role: ['healer'], level: ['40'], weather: ['NO_WEATHER'], friendship: ['4'] },
+        ...made.where,
+      });
+      await made.router.handle(form as never);
+    }
+    expect(made.pokebattler.maxAsked).toHaveLength(3);
+  });
 });
diff --git a/src/commands/util/counters.test.ts b/src/commands/util/counters.test.ts
index c92ae50356eac8c29034c509c87d7f3de134f629..9260e905ff1542a2d1962d1018fdb56e5586ef02 100644
--- a/src/commands/util/counters.test.ts
+++ b/src/commands/util/counters.test.ts
@@ -108,7 +108,7 @@ describe('/counters: the command', () => {
       'D5',
       'G',
     ]);
-    expect(choices('role')).toEqual(['attacker', 'balanced', 'tank', 'healer']);
+    expect(choices('role')).toEqual(['charger', 'balanced', 'attackers', 'shielder', 'healer']);
     expect(choices('level')).toEqual(['20', '25', '30', '35', '40', '41', '45', '50', '51', 'box']);
     expect(choices('friendship')).toEqual(['0', '1', '2', '3', '4']);
     expect(counters.throttle).toEqual({ uses: 3, perSeconds: 60 });
@@ -406,7 +406,7 @@ describe('/counters: more in the posts of parties', () => {
     );
     expect(details).toContain('levels 20 to 50 in steps of five');
     expect(counters.help.examples).toContain(
-      '/counters boss:Uxie tier:Dynamax 5★ role:Tank (an attacker and two tanks)',
+      '/counters boss:Uxie tier:Dynamax 5★ role:Shielder (an attacker and two shielders)',
     );
     expect(described('friendship')).toBe(
       'Friendship with the others in the battle; best friends when left out',
@@ -564,15 +564,33 @@ describe('/counters: max battles', () => {
   const withIcons = { gameData: { catalogue: catalogueFixture(), icons: iconsFixture() } };
   const inPost = (postId: string) => ({ channelId: postId, thread: { parentId: WEST_FORUM } });
 
-  it('shows Pokebattler’s team for an attacker against a max boss, privately', async () => {
+  it('asks for two attackers and a charger unless a role is named', async () => {
     const made = setup(withIcons);
+    made.pokebattler.maxAnswer = recordedTeam('uxie-d5-2-1-0-0');
     const used = await made.run({ boss: 'uxie', tier: 'D5' });
+    expect(made.pokebattler.maxAsked[0]).toMatchObject({ boss: 'UXIE', role: 'charger' });
+    const answer = answerOf(used);
+    expect(textDisplays(answer)[0]).toBe(
+      '### Max battle team against Dynamax Uxie (5★)\n' +
+        'Psychic · your role: Attackers + charger (two attackers and a charger)',
+    );
+    expect(textOf(answer)).toContain('**Charger** · Zamazenta (Crowned Shield)');
+    expect(textOf(answer)).toContain('-# Other chargers: ');
+    expect(linksOf(answer)).toEqual([
+      'Full results https://www.pokebattler.com/max/UXIE/METER_CHARGE',
+    ]);
+  });
+
+  it('shows Pokebattler’s team for all attackers against a max boss, privately', async () => {
+    const made = setup(withIcons);
+    made.pokebattler.maxAnswer = recordedTeam('uxie-d5-3-0-0');
+    const used = await made.run({ boss: 'uxie', tier: 'D5', role: 'attackers' });
     expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     expect(made.pokebattler.maxAsked).toEqual([
       {
         boss: 'UXIE',
         maxLevel: 'RAID_LEVEL_5_MAX',
-        role: 'attacker',
+        role: 'attackers',
         level: '40',
         weather: 'NO_WEATHER',
         friendship: '4',
@@ -583,7 +601,7 @@ describe('/counters: max battles', () => {
     const [head = '', ...rest] = textDisplays(answer);
     expect(head).toBe(
       '### Max battle team against Dynamax Uxie (5★)\n' +
-        'Psychic · your role: Attacker, three attackers',
+        'Psychic · your role: All attackers (three attackers)',
     );
     // Each of the three with its role and moves, no charged move where Pokebattler names none.
     expect(sectionsOf(answer).map((section) => section.text)).toEqual([
@@ -616,6 +634,7 @@ describe('/counters: max battles', () => {
 
   it('asks for the role’s team, at the level, and a Gigantamax boss by its Gigantamax name', async () => {
     const made = setup(withIcons);
+    // A recorded team of two attackers and a shielder: the fake answers any role with it.
     made.pokebattler.maxAnswer = recordedTeam('gmax-machamp-2-0-1');
     const used = await made.run({
       boss: 'machamp',
@@ -638,21 +657,43 @@ describe('/counters: max battles', () => {
     const answer = answerOf(used);
     expect(textDisplays(answer)[0]).toBe(
       '### Max battle team against Gigantamax Machamp\n' +
-        'Fighting · your role: Balanced, two attackers and a tank',
+        'Fighting · your role: Balanced (an attacker, a charger and a shielder)',
     );
     expect(thumbnailOf(answer)).toMatch(/pm68\.fGIGANTAMAX\.icon\.png$/);
     expect(linksOf(answer)).toEqual([
-      'Full results https://www.pokebattler.com/max/MACHAMP_GIGANTAMAX/PARTY',
+      'Full results https://www.pokebattler.com/max/MACHAMP_GIGANTAMAX/METER_CHARGE',
     ]);
     const texts = sectionsOf(answer).map((section) => section.text);
     expect(texts).toContain(
-      '**Tank** · Zamazenta (Crowned Shield)\n-# Metal Claw (Steel) / Moonblast (Fairy)',
+      '**Shielder** · Zamazenta (Crowned Shield)\n-# Metal Claw (Steel) / Moonblast (Fairy)',
     );
-    expect(textOf(answer)).toContain('-# Other tanks: Gigantamax Venusaur (Vine Whip)');
+    expect(textOf(answer)).toContain('-# Other shielders: Gigantamax Venusaur (Vine Whip)');
     // The level the answer was simulated at, as Pokebattler says (here 40).
     expect(textOf(answer)).toContain('-# Pokémon at level 40 · rainy weather · great friends ·');
   });
 
+  it('shows a team of three roles, each with its alternatives once', async () => {
+    const made = setup(withIcons);
+    // An attacker, a shielder and a healer (no role of Matt's asks for it; the fake answers any).
+    made.pokebattler.maxAnswer = recordedTeam('gmax-machamp-1-1-1');
+    const answer = answerOf(await made.run({ boss: 'machamp', tier: 'G', role: 'healer' }));
+    expect(sectionsOf(answer).map((section) => section.text.split('\n')[0])).toEqual([
+      '### Max battle team against Gigantamax Machamp',
+      '**Attacker** · Zacian (Crowned Sword)',
+      '**Shielder** · Zamazenta (Crowned Shield)',
+      '**Healer** · Blissey',
+    ]);
+    expect(textDisplays(answer).filter((text) => text.startsWith('-# Other'))).toEqual([
+      '-# Other attackers: Gallade (Psycho Cut) · Latios (Zen Headbutt) · Metagross (Zen Headbutt) · ' +
+        'Gigantamax Rillaboom (Scratch) · Latias (Zen Headbutt)',
+      '-# Other shielders: Gigantamax Venusaur (Vine Whip) · Venusaur (Vine Whip) · Vaporeon ' +
+        '(Water Gun) · Gigantamax Blastoise (Water Gun) · Suicune (Water Gun)',
+      '-# Other healers: Vaporeon (Water Gun) · Gigantamax Snorlax (Psywave) · Eternatus ' +
+        '(Dragon Tail) · Suicune (Water Gun) · Lugia (Extrasensory)',
+    ]);
+    expectV2Sendable(answer);
+  });
+
   it('shows the types of the moves as emoji where the server or the application has them', async () => {
     const made = setup({ ...withIcons, emoji: { find: (name) => `<:${name}:1>` } });
     const answer = answerOf(await made.run({ boss: 'uxie', tier: 'D5' }));
@@ -677,7 +718,7 @@ describe('/counters: max battles', () => {
         'A max battle team is simulated at level 20, 25, 30, 35, 40, 45 or 50: pick one of those.',
       );
     }
-    expect(told(await made.run({ boss: 'yveltal', tier: 'T5', role: 'tank' }))).toBe(
+    expect(told(await made.run({ boss: 'yveltal', tier: 'T5', role: 'shielder' }))).toBe(
       '`role` is for max battles: leave it out for a raid.',
     );
     expect(told(await made.run({ boss: 'gengar_mega', tier: 'G' }))).toBe(
diff --git a/src/commands/util/counters.ts b/src/commands/util/counters.ts
index eec72c48d0fe867038c26f686e73f47b15bdffeb..5618a21e78c1192946c8bb23edb1c3a5f93a6530 100644
--- a/src/commands/util/counters.ts
+++ b/src/commands/util/counters.ts
@@ -788,7 +788,9 @@ export const counters: SimpleCommand = {
     .addStringOption((option) =>
       option
         .setName('role')
-        .setDescription('For a max battle: what your three Pokémon are for; Attacker when left out')
+        .setDescription(
+          'For a max battle: what your three Pokémon are for; Attackers + charger when left out',
+        )
         .addChoices(
           MAX_ROLE_KEYS.map((role) => ({
             name: `${MAX_ROLES[role].name} (${MAX_ROLES[role].team})`,
@@ -862,8 +864,9 @@ export const counters: SimpleCommand = {
       'its attackers, weather, friendship, boss moves and what else to list: the member who ' +
       'asked changes the answer for everybody, anybody else gets an answer of their own. The ' +
       'options of an answer are kept for a day. With a max battle tier, or in the post of a max ' +
-      'battle, it shows the team of three Pokebattler suggests for your `role` (Attacker unless ' +
-      'you name another: Balanced, Tank or Healer), each Pokémon with its moves and a few others ' +
+      'battle, it shows the team of three Pokebattler suggests for your `role` (two attackers ' +
+      'and a charger unless you name another: Balanced, All attackers, Shielder or Healer), each ' +
+      'Pokémon with its moves and a few others ' +
       'that would do, at levels 20 to 50 in steps of five, with the weather and friendship you ' +
       'name; boss moves, shadow Pokémon, megas and a Pokébox do not apply there. A boss you name ' +
       'that is no raid boss now is taken in the max battle tier it is a boss of.',
@@ -872,7 +875,7 @@ export const counters: SimpleCommand = {
       '/counters boss:Mewtwo',
       '/counters boss:Rayquaza tier:T5 level:Level 50 weather:Windy',
       '/counters level:My Pokébox on Pokebattler',
-      '/counters boss:Uxie tier:Dynamax 5★ role:Tank (an attacker and two tanks)',
+      '/counters boss:Uxie tier:Dynamax 5★ role:Shielder (an attacker and two shielders)',
     ],
   },
   guards: [requireCounterPlan],
diff --git a/src/commands/util/max-counters.ts b/src/commands/util/max-counters.ts
index ba7a242b687e83cb8166504179d9200d8026549e..01429dfc3b407794c4bf736e8995c4e6e05dae13 100644
--- a/src/commands/util/max-counters.ts
+++ b/src/commands/util/max-counters.ts
@@ -133,7 +133,7 @@ function weatherAndFriendship(
   return { weather: chosen.weather, friendship: chosen.friendship };
 }
 
-/** The role as `/counters` or its dialog names it: Attacker when left out. */
+/** The role as `/counters` or its dialog names it: Attackers + charger when left out. */
 export function maxRoleOf(role: string | null): MaxRole {
   if (role === null) return DEFAULT_MAX_ROLE;
   if (!isMaxRole(role)) throw new UserError('Pick the role from its list.');
diff --git a/src/domain/counters/max-team.test.ts b/src/domain/counters/max-team.test.ts
index c9004386591a3b918048ca0dc64858576d1fed4b..45adec0ae18e390e0372306e21d65c4a9ae7b65c 100644
--- a/src/domain/counters/max-team.test.ts
+++ b/src/domain/counters/max-team.test.ts
@@ -28,24 +28,26 @@ const entry = (key: string) => {
 };
 
 describe('MAX_ROLES', () => {
-  it('has the four roles of Matt, the attacker first, each a team of three', () => {
-    expect(MAX_ROLE_KEYS).toEqual(['attacker', 'balanced', 'tank', 'healer']);
-    expect(DEFAULT_MAX_ROLE).toBe('attacker');
+  it('has the five roles of Matt, attackers and a charger first, each a team of three', () => {
+    expect(MAX_ROLE_KEYS).toEqual(['charger', 'balanced', 'attackers', 'shielder', 'healer']);
+    expect(DEFAULT_MAX_ROLE).toBe('charger');
+    // attack / meterCharge / shield / heal / charge
     expect(
       MAX_ROLE_KEYS.map((key) => {
-        const { attack, heal, shield } = MAX_ROLES[key];
-        return [MAX_ROLES[key].name, attack, heal, shield];
+        const { name, attack, meterCharge, shield, heal, charge } = MAX_ROLES[key];
+        return [name, attack, meterCharge, shield, heal, charge];
       }),
     ).toEqual([
-      ['Attacker', 3, 0, 0],
-      ['Balanced', 2, 0, 1],
-      ['Tank', 1, 0, 2],
-      ['Healer', 1, 2, 0],
+      ['Attackers + charger', 2, 1, 0, 0, 0],
+      ['Balanced', 1, 1, 1, 0, 0],
+      ['All attackers', 3, 0, 0, 0, 0],
+      ['Shielder', 1, 0, 2, 0, 0],
+      ['Healer', 1, 0, 0, 2, 0],
     ]);
     // Pokebattler refuses a team that is not three Pokémon (400).
     for (const key of MAX_ROLE_KEYS) {
-      const { attack, heal, shield } = MAX_ROLES[key];
-      expect(attack + heal + shield).toBe(3);
+      const { attack, meterCharge, shield, heal, charge } = MAX_ROLES[key];
+      expect(attack + meterCharge + shield + heal + charge).toBe(3);
     }
   });
 });
@@ -127,11 +129,14 @@ describe('pokebattlerMaxDefenders', () => {
 
 describe('maxTeamLink', () => {
   it('is the page of the role on Pokebattler’s site', () => {
-    expect(maxTeamLink('UXIE', 'attacker')).toBe('https://www.pokebattler.com/max/UXIE');
-    expect(maxTeamLink('MACHAMP_GIGANTAMAX', 'balanced')).toBe(
-      'https://www.pokebattler.com/max/MACHAMP_GIGANTAMAX/PARTY',
+    expect(maxTeamLink('UXIE', 'attackers')).toBe('https://www.pokebattler.com/max/UXIE');
+    expect(maxTeamLink('MACHAMP_GIGANTAMAX', 'charger')).toBe(
+      'https://www.pokebattler.com/max/MACHAMP_GIGANTAMAX/METER_CHARGE',
     );
-    expect(maxTeamLink('UXIE', 'tank')).toBe('https://www.pokebattler.com/max/UXIE/TANK');
+    expect(maxTeamLink('UXIE', 'balanced')).toBe(
+      'https://www.pokebattler.com/max/UXIE/METER_CHARGE',
+    );
+    expect(maxTeamLink('UXIE', 'shielder')).toBe('https://www.pokebattler.com/max/UXIE/TANK');
     expect(maxTeamLink('UXIE', 'healer')).toBe('https://www.pokebattler.com/max/UXIE/TOTAL_HEAL');
   });
 });
@@ -149,7 +154,8 @@ describe('maxTeamPath', () => {
       }),
     ).toBe(
       '/max/parties/suggested/defenders/MACHAMP_GIGANTAMAX/levels/RAID_LEVEL_6_MAX' +
-        '?attack=2&heal=0&shield=1&level=30&weatherCondition=RAINY&friendLevel=FRIENDSHIP_LEVEL_2',
+        '?attack=1&heal=0&shield=1&charge=0&meterCharge=1&level=30&weatherCondition=RAINY&' +
+        'friendLevel=FRIENDSHIP_LEVEL_2',
     );
     expect(
       maxTeamPath({
@@ -162,7 +168,7 @@ describe('maxTeamPath', () => {
       }),
     ).toBe(
       '/max/parties/suggested/defenders/UXIE/levels/RAID_LEVEL_5_MAX?attack=1&heal=2&shield=0' +
-        '&level=40&weatherCondition=NO_WEATHER&friendLevel=FRIENDSHIP_LEVEL_4',
+        '&charge=0&meterCharge=0&level=40&weatherCondition=NO_WEATHER&friendLevel=FRIENDSHIP_LEVEL_4',
     );
   });
 });
@@ -266,8 +272,11 @@ describe('maxTeamMember', () => {
 describe('slotRoleWords', () => {
   it('says the roles of the slots as the roles of members are named', () => {
     expect(slotRoleWords('ATTACK')).toEqual({ one: 'Attacker', many: 'attackers' });
-    expect(slotRoleWords('SHIELD')).toEqual({ one: 'Tank', many: 'tanks' });
+    expect(slotRoleWords('METER_CHARGE')).toEqual({ one: 'Charger', many: 'chargers' });
+    expect(slotRoleWords('SHIELD')).toEqual({ one: 'Shielder', many: 'shielders' });
     expect(slotRoleWords('HEAL')).toEqual({ one: 'Healer', many: 'healers' });
-    expect(slotRoleWords('METER_CHARGE')).toEqual({ one: 'Meter Charge', many: 'others' });
+    // Pokebattler's page calls CHARGE a defender (its page is /CHARGER); no role asks for one.
+    expect(slotRoleWords('CHARGE')).toEqual({ one: 'Defender', many: 'defenders' });
+    expect(slotRoleWords('SOMETHING_NEW')).toEqual({ one: 'Something New', many: 'others' });
   });
 });
diff --git a/src/domain/counters/max-team.ts b/src/domain/counters/max-team.ts
index f34c53956a75d704f1d9770335d35c7524dd5a10..ad6ca6c8a00bef91657fd745729b2a7c8287e9da 100644
--- a/src/domain/counters/max-team.ts
+++ b/src/domain/counters/max-team.ts
@@ -15,45 +15,95 @@ import {
 /*
  * `/counters` for max battles (plan 8X-6; design section 8): Pokebattler's suggested team of
  * three for a max battle, `GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=a&
- * heal=h&shield=s&level=n` (explored on 2026-10-21: `a + h + s` must be 3, else 400; `level` is
- * honoured; weather and a Pokébox are not). One slot per Pokémon, each with its role, moves,
- * level and ten alternatives.
+ * heal=h&shield=s&charge=c&meterCharge=m&level=n&weatherCondition=w&friendLevel=f` (explored on
+ * 2026-10-21: the five counts must add to 3, else 400; `level`, `weatherCondition` and
+ * `friendLevel` are honoured, a Pokébox is not). One slot per Pokémon, each with its role, moves,
+ * level and ten alternatives. The endpoint is not among Pokebattler's documented ones
+ * (www.pokebattler.com/developers) and may change.
  */
 
-/** What a member's three Pokémon are for: how many attack, heal (Max Spirit) and shield (Max Guard). */
+/**
+ * What a member's three Pokémon are for: how many attack, charge the meter (`meterCharge`, a
+ * charger), shield (Max Guard, a shielder), heal (Max Spirit, a healer), and `charge` (a
+ * defender on Pokebattler's page), which no role uses.
+ */
 export interface MaxRoleTeam {
   /** The role as `/counters` offers it. */
   name: string;
   /** The team in words, for the answer. */
   team: string;
   attack: number;
-  heal: number;
+  meterCharge: number;
   shield: number;
+  heal: number;
+  charge: number;
 }
 
 /**
- * The roles a member plays in a max battle (Matt, 2026-10-21: groups play a Dynamax legendary
- * with a couple of attackers, one balanced, one tank or healer who still brings an attacker; "a
- * good starting point"): the one table to change.
+ * The roles a member plays in a max battle (Matt, 2026-10-21: two attackers and a charger is his
+ * usual team; "a good starting point"): the one table to change, its first role the default.
  */
 export const MAX_ROLES = {
-  attacker: { name: 'Attacker', team: 'three attackers', attack: 3, heal: 0, shield: 0 },
-  balanced: { name: 'Balanced', team: 'two attackers and a tank', attack: 2, heal: 0, shield: 1 },
-  tank: { name: 'Tank', team: 'an attacker and two tanks', attack: 1, heal: 0, shield: 2 },
-  healer: { name: 'Healer', team: 'an attacker and two healers', attack: 1, heal: 2, shield: 0 },
+  charger: {
+    name: 'Attackers + charger',
+    team: 'two attackers and a charger',
+    attack: 2,
+    meterCharge: 1,
+    shield: 0,
+    heal: 0,
+    charge: 0,
+  },
+  balanced: {
+    name: 'Balanced',
+    team: 'an attacker, a charger and a shielder',
+    attack: 1,
+    meterCharge: 1,
+    shield: 1,
+    heal: 0,
+    charge: 0,
+  },
+  attackers: {
+    name: 'All attackers',
+    team: 'three attackers',
+    attack: 3,
+    meterCharge: 0,
+    shield: 0,
+    heal: 0,
+    charge: 0,
+  },
+  shielder: {
+    name: 'Shielder',
+    team: 'an attacker and two shielders',
+    attack: 1,
+    meterCharge: 0,
+    shield: 2,
+    heal: 0,
+    charge: 0,
+  },
+  healer: {
+    name: 'Healer',
+    team: 'an attacker and two healers',
+    attack: 1,
+    meterCharge: 0,
+    shield: 0,
+    heal: 2,
+    charge: 0,
+  },
 } as const satisfies Record<string, MaxRoleTeam>;
 
 export type MaxRole = keyof typeof MAX_ROLES;
 
 /**
- * The page of each role on Pokebattler's site under `/max/<boss>` (seen in a browser on
- * 2026-10-21): the attackers are the boss's own page; the site also has `/CHARGER` and
- * `/METER_CHARGE`, which no role of these uses.
+ * The page of each role's team on Pokebattler's site under `/max/<boss>` (seen in a browser on
+ * 2026-10-21): the attackers are the boss's own page, a team with a charger `/METER_CHARGE`, the
+ * shielders `/TANK`, the healers `/TOTAL_HEAL`. (`/CHARGER` is the defenders', `/PARTY` a lobby
+ * of four: no role's.)
  */
 const MAX_ROLE_PAGES: Readonly<Record<MaxRole, string>> = {
-  attacker: '',
-  balanced: '/PARTY',
-  tank: '/TANK',
+  charger: '/METER_CHARGE',
+  balanced: '/METER_CHARGE',
+  attackers: '',
+  shielder: '/TANK',
   healer: '/TOTAL_HEAL',
 };
 
@@ -65,8 +115,8 @@ export function maxTeamLink(boss: string, role: MaxRole): string {
 /** The roles in the order `/counters` offers them. */
 export const MAX_ROLE_KEYS = Object.keys(MAX_ROLES) as MaxRole[];
 
-/** A member who says nothing attacks (Matt). */
-export const DEFAULT_MAX_ROLE: MaxRole = 'attacker';
+/** A member who says nothing brings two attackers and a charger (Matt's usual team). */
+export const DEFAULT_MAX_ROLE: MaxRole = 'charger';
 
 export function isMaxRole(value: string): value is MaxRole {
   return Object.hasOwn(MAX_ROLES, value);
@@ -166,11 +216,14 @@ export interface MaxTeamQuery {
 
 /** The path and query of a team's request (explored 2026-10-21). */
 export function maxTeamPath(query: MaxTeamQuery): string {
-  const { attack, heal, shield } = MAX_ROLES[query.role];
+  const { attack, heal, shield, charge, meterCharge } = MAX_ROLES[query.role];
   const params = new URLSearchParams({
     attack: String(attack),
     heal: String(heal),
     shield: String(shield),
+    // Every count is sent, also those of none.
+    charge: String(charge),
+    meterCharge: String(meterCharge),
     level: query.level,
     weatherCondition: query.weather,
     friendLevel: `FRIENDSHIP_LEVEL_${query.friendship}`,
@@ -205,7 +258,7 @@ export interface MaxMoveLevels {
 
 /** One of the three Pokémon of a team, with the alternatives Pokebattler gives for its place. */
 export interface MaxSlot {
-  /** Pokebattler's role: `ATTACK`, `SHIELD` or `HEAL` (`slotRoleWords`). */
+  /** Pokebattler's role: `ATTACK`, `METER_CHARGE`, `SHIELD`, `HEAL`, `CHARGE` (`slotRoleWords`). */
   role: string;
   pick: MaxPick;
   alternatives: MaxPick[];
@@ -295,8 +348,11 @@ export function readMaxTeam(body: unknown): MaxTeamAnswer | undefined {
 /** The words of Pokebattler's roles of a slot, as the roles of members are named. */
 const SLOT_ROLES: Readonly<Record<string, { one: string; many: string }>> = {
   ATTACK: { one: 'Attacker', many: 'attackers' },
-  SHIELD: { one: 'Tank', many: 'tanks' },
+  METER_CHARGE: { one: 'Charger', many: 'chargers' },
+  SHIELD: { one: 'Shielder', many: 'shielders' },
   HEAL: { one: 'Healer', many: 'healers' },
+  // Pokebattler's page calls this role a defender (it charges the meter and takes hits).
+  CHARGE: { one: 'Defender', many: 'defenders' },
 };
 
 /** A slot's role in words: `Attacker` (one), `attackers` (alternatives); another in Pokebattler's words. */
diff --git a/src/render/max-team.ts b/src/render/max-team.ts
index 7b85798b0e40b8b9b19d8b1b99e57b573b47ee7a..5d5e3e6992c0f3975f212c73b698f881859b2aba 100644
--- a/src/render/max-team.ts
+++ b/src/render/max-team.ts
@@ -41,7 +41,7 @@ export interface ShownTeamMember {
 
 /** One of the three Pokémon of the team, with the alternatives for its place. */
 export interface ShownSlot {
-  /** Pokebattler's role of the slot (`ATTACK`, `SHIELD`, `HEAL`). */
+  /** Pokebattler's role of the slot (`ATTACK`, `METER_CHARGE`, `SHIELD`, `HEAL`). */
   role: string;
   member: ShownTeamMember;
   alternatives: readonly ShownTeamMember[];
@@ -167,7 +167,7 @@ export function renderMaxTeam(view: MaxTeamView): V2Message {
       ...(view.bossTypes.length === 0
         ? []
         : [view.bossTypes.map((type) => typeText(type, view)).join(' / ')]),
-      `your role: ${role.name}, ${role.team}`,
+      `your role: ${role.name} (${role.team})`,
     ].join(' · '),
   ].join('\n');
   const parts: APIComponentInContainer[] = [
diff --git a/src/services/pokebattler-gateway.test.ts b/src/services/pokebattler-gateway.test.ts
index 74dad6edef322cb12de0a11b162fc83bfd12a57b..7615491077819139daaf235f8be84166da99f60d 100644
--- a/src/services/pokebattler-gateway.test.ts
+++ b/src/services/pokebattler-gateway.test.ts
@@ -358,7 +358,8 @@ describe('PokebattlerFight: max battle teams', () => {
     const [url, init] = made.fetch.mock.calls[0] ?? [];
     expect(url).toBe(
       'https://fight.pokebattler.com/max/parties/suggested/defenders/MACHAMP_GIGANTAMAX/levels/' +
-        'RAID_LEVEL_6_MAX?attack=2&heal=0&shield=1&level=40&weatherCondition=NO_WEATHER&' +
+        'RAID_LEVEL_6_MAX?attack=1&heal=0&shield=1&charge=0&meterCharge=1&level=40&' +
+        'weatherCondition=NO_WEATHER&' +
         'friendLevel=FRIENDSHIP_LEVEL_4',
     );
     expect(init?.headers['User-Agent']).toBe('Professor-Pine');
@@ -399,7 +400,7 @@ describe('PokebattlerFight: max battle teams', () => {
     expect(await made.fight.maxTeam(MAX_REQUEST)).toBe(a);
     expect(made.urls()).toHaveLength(1);
     // Another role or level is another request.
-    await made.fight.maxTeam({ ...MAX_REQUEST, role: 'tank' });
+    await made.fight.maxTeam({ ...MAX_REQUEST, role: 'shielder' });
     await made.fight.maxTeam({ ...MAX_REQUEST, level: '30' });
     await made.fight.maxTeam({ ...MAX_REQUEST, weather: 'RAINY' });
     await made.fight.maxTeam({ ...MAX_REQUEST, friendship: '0' });
diff --git a/test/fixtures/pokebattler-max-teams.json b/test/fixtures/pokebattler-max-teams.json
index 49435b7283bc6832e88600cfc34fe76a58626bb6..9b1786dcfc108ecf7db8aa0cfa05447ff6cc0091 100644
--- a/test/fixtures/pokebattler-max-teams.json
+++ b/test/fixtures/pokebattler-max-teams.json
@@ -1 +1 @@
-{"uxie-d5-3-0-0":{"defenderId":"UXIE","tier":"RAID_LEVEL_5_MAX","composition":{"attack":3,"heal":0,"shield":0,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.0235581035974937,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5635905283024982},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":1,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":1,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":1,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":2,"role":"ATTACK","pokemonId":"HYDREIGON","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.8187299791552247,"alternatives":[{"slot":2,"role":"ATTACK","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5635905283024982},{"slot":2,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":2,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":2,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":2,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":2,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":2,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":2,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":2,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":2,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":3,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109,"alternatives":[{"slot":3,"role":"ATTACK","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5635905283024982},{"slot":3,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":3,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":3,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":3,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":3,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":3,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":3,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":3,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":3,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]}]},"uxie-d5-2-0-1":{"defenderId":"UXIE","tier":"RAID_LEVEL_5_MAX","composition":{"attack":2,"heal":0,"shield":1,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.0235581035974937,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":1,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":1,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":1,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":2,"role":"ATTACK","pokemonId":"HYDREIGON","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.8187299791552247,"alternatives":[{"slot":2,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109},{"slot":2,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":2,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":2,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":2,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":2,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":2,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":2,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":2,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":2,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":3,"role":"SHIELD","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"BEHEMOTH_BASH","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1,"alternatives":[{"slot":3,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"LATIOS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"LATIAS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"EXCADRILL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"DURALUDON","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"REGISTEEL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"BLISSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"CHANSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"REGIROCK","quickMove":"LOCK_ON_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1}]}]},"uxie-d5-1-0-2":{"defenderId":"UXIE","tier":"RAID_LEVEL_5_MAX","composition":{"attack":1,"heal":0,"shield":2,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.0235581035974937,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":1,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":1,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":1,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":2,"role":"SHIELD","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"BEHEMOTH_BASH","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1,"alternatives":[{"slot":2,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"LATIOS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"LATIAS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"EXCADRILL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"DURALUDON","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"REGISTEEL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"BLISSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"CHANSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"REGIROCK","quickMove":"LOCK_ON_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1}]},{"slot":3,"role":"SHIELD","pokemonId":"HYDREIGON","quickMove":"BITE_FAST","cinematicMove":"BRUTAL_SWING","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1,"alternatives":[{"slot":3,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"LATIOS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"LATIAS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"EXCADRILL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"DURALUDON","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"REGISTEEL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"BLISSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"CHANSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"REGIROCK","quickMove":"LOCK_ON_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1}]}]},"uxie-d5-1-2-0":{"defenderId":"UXIE","tier":"RAID_LEVEL_5_MAX","composition":{"attack":1,"heal":2,"shield":0,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.0235581035974937,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"HYDREIGON","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.8187299791552247},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109},{"slot":1,"role":"ATTACK","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5635905283024982},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":1,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":1,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839}]},{"slot":2,"role":"HEAL","pokemonId":"BLISSEY","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.8485583332905581,"alternatives":[{"slot":2,"role":"HEAL","pokemonId":"LAPRAS_GIGANTAMAX","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.7016900959294613},{"slot":2,"role":"HEAL","pokemonId":"GREEDENT","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.6029361802230185},{"slot":2,"role":"HEAL","pokemonId":"REGICE","quickMove":"ROCK_SMASH_FAST","cinematicMove":"EARTHQUAKE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5727973752380169},{"slot":2,"role":"HEAL","pokemonId":"REGIROCK","quickMove":"ROCK_SMASH_FAST","cinematicMove":"EARTHQUAKE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5602709747446388},{"slot":2,"role":"HEAL","pokemonId":"REGISTEEL","quickMove":"ROCK_SMASH_FAST","cinematicMove":"ZAP_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.547807333052085},{"slot":2,"role":"HEAL","pokemonId":"LUGIA","quickMove":"DRAGON_TAIL_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5280823745657869},{"slot":2,"role":"HEAL","pokemonId":"MALAMAR","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5210267423359772},{"slot":2,"role":"HEAL","pokemonId":"SUICUNE","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.46576442508304455},{"slot":2,"role":"HEAL","pokemonId":"DUBWOOL","quickMove":"DOUBLE_KICK_FAST","cinematicMove":"WILD_CHARGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.45534245181674043},{"slot":2,"role":"HEAL","pokemonId":"CORVIKNIGHT","quickMove":"SAND_ATTACK_FAST","cinematicMove":"AIR_CUTTER","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.4525618207433134}]},{"slot":3,"role":"HEAL","pokemonId":"VAPOREON","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.7097417497149792,"alternatives":[{"slot":3,"role":"HEAL","pokemonId":"LAPRAS_GIGANTAMAX","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.7016900959294613},{"slot":3,"role":"HEAL","pokemonId":"GREEDENT","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.6029361802230185},{"slot":3,"role":"HEAL","pokemonId":"REGICE","quickMove":"ROCK_SMASH_FAST","cinematicMove":"EARTHQUAKE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5727973752380169},{"slot":3,"role":"HEAL","pokemonId":"REGIROCK","quickMove":"ROCK_SMASH_FAST","cinematicMove":"EARTHQUAKE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5602709747446388},{"slot":3,"role":"HEAL","pokemonId":"REGISTEEL","quickMove":"ROCK_SMASH_FAST","cinematicMove":"ZAP_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.547807333052085},{"slot":3,"role":"HEAL","pokemonId":"LUGIA","quickMove":"DRAGON_TAIL_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5280823745657869},{"slot":3,"role":"HEAL","pokemonId":"MALAMAR","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5210267423359772},{"slot":3,"role":"HEAL","pokemonId":"SUICUNE","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.46576442508304455},{"slot":3,"role":"HEAL","pokemonId":"DUBWOOL","quickMove":"DOUBLE_KICK_FAST","cinematicMove":"WILD_CHARGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.45534245181674043},{"slot":3,"role":"HEAL","pokemonId":"CORVIKNIGHT","quickMove":"SAND_ATTACK_FAST","cinematicMove":"AIR_CUTTER","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.4525618207433134}]}]},"gmax-machamp-2-0-1":{"defenderId":"MACHAMP_GIGANTAMAX","tier":"RAID_LEVEL_6_MAX","composition":{"attack":2,"heal":0,"shield":1,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3477125000000012,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"LATIOS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"LUSTER_PURGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9823259999999998},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"FLASH_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9637920000000019},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9205680000000016},{"slot":1,"role":"ATTACK","pokemonId":"LATIAS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"MIST_BALL","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8968215000000009},{"slot":1,"role":"ATTACK","pokemonId":"ALAKAZAM","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8941319999999987},{"slot":1,"role":"ATTACK","pokemonId":"ESPEON","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"FUTURESIGHT","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8528129999999995},{"slot":1,"role":"ATTACK","pokemonId":"HATTERENE","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8386080237047683},{"slot":1,"role":"ATTACK","pokemonId":"LUGIA","quickMove":"EXTRASENSORY_FAST","cinematicMove":"AEROBLAST_PLUS_PLUS","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8238966898020914},{"slot":1,"role":"ATTACK","pokemonId":"VENUSAUR_GIGANTAMAX","quickMove":"VINE_WHIP_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8125760164302229},{"slot":1,"role":"ATTACK","pokemonId":"MOLTRES","quickMove":"WING_ATTACK_FAST","cinematicMove":"FLY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8071200000000006}]},{"slot":2,"role":"ATTACK","pokemonId":"GALLADE","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.1116177543508001,"alternatives":[{"slot":2,"role":"ATTACK","pokemonId":"LATIOS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"LUSTER_PURGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9823259999999998},{"slot":2,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"FLASH_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9637920000000019},{"slot":2,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9205680000000016},{"slot":2,"role":"ATTACK","pokemonId":"LATIAS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"MIST_BALL","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8968215000000009},{"slot":2,"role":"ATTACK","pokemonId":"ALAKAZAM","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8941319999999987},{"slot":2,"role":"ATTACK","pokemonId":"ESPEON","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"FUTURESIGHT","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8528129999999995},{"slot":2,"role":"ATTACK","pokemonId":"HATTERENE","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8386080237047683},{"slot":2,"role":"ATTACK","pokemonId":"LUGIA","quickMove":"EXTRASENSORY_FAST","cinematicMove":"AEROBLAST_PLUS_PLUS","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8238966898020914},{"slot":2,"role":"ATTACK","pokemonId":"VENUSAUR_GIGANTAMAX","quickMove":"VINE_WHIP_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8125760164302229},{"slot":2,"role":"ATTACK","pokemonId":"MOLTRES","quickMove":"WING_ATTACK_FAST","cinematicMove":"FLY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8071200000000006}]},{"slot":3,"role":"SHIELD","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOONBLAST","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1,"alternatives":[{"slot":3,"role":"SHIELD","pokemonId":"VENUSAUR_GIGANTAMAX","quickMove":"VINE_WHIP_FAST","cinematicMove":"SOLAR_BEAM","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9813945263157895},{"slot":3,"role":"SHIELD","pokemonId":"VENUSAUR","quickMove":"VINE_WHIP_FAST","cinematicMove":"SOLAR_BEAM","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9813945263157895},{"slot":3,"role":"SHIELD","pokemonId":"VAPOREON","quickMove":"WATER_GUN_FAST","cinematicMove":"HYDRO_PUMP","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"BLASTOISE_GIGANTAMAX","quickMove":"WATER_GUN_FAST","cinematicMove":"HYDRO_PUMP","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9719733684210525},{"slot":3,"role":"SHIELD","pokemonId":"SUICUNE","quickMove":"WATER_GUN_FAST","cinematicMove":"HYDRO_PUMP","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"BLASTOISE","quickMove":"WATER_GUN_FAST","cinematicMove":"SKULL_BASH","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9719733684210528},{"slot":3,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"SUPER_POWER","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9544179999999999},{"slot":3,"role":"SHIELD","pokemonId":"ETERNATUS","quickMove":"DRAGON_TAIL_FAST","cinematicMove":"DYNAMAX_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"BULLET_PUNCH_FAST","cinematicMove":"PSYCHIC","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9630522105263158},{"slot":3,"role":"SHIELD","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"EARTH_POWER","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9626837894736844}]}]},"duraludon-d4-2-0-1":{"defenderId":"DURALUDON","tier":"RAID_LEVEL_4_MAX","composition":{"attack":2,"heal":0,"shield":1,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"MACHAMP_GIGANTAMAX","quickMove":"COUNTER_FAST","cinematicMove":"CLOSE_COMBAT","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":3.138779925731202,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"GALLADE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.837469063099428},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.6647104302359765},{"slot":1,"role":"ATTACK","pokemonId":"HITMONLEE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.6250819235265546},{"slot":1,"role":"ATTACK","pokemonId":"FLYGON","quickMove":"SAND_ATTACK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.468117242961913},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.4162966310698795},{"slot":1,"role":"ATTACK","pokemonId":"ELECTIVIRE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.404397130176186},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.3570256674466012},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.313603936289376},{"slot":1,"role":"ATTACK","pokemonId":"RHYPERIOR","quickMove":"MUD_SLAP_FAST","cinematicMove":"SURF","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.299855544311661},{"slot":1,"role":"ATTACK","pokemonId":"MACHAMP","quickMove":"COUNTER_FAST","cinematicMove":"STONE_EDGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.281032800907299}]},{"slot":2,"role":"ATTACK","pokemonId":"EXCADRILL","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":3.021222482852002,"alternatives":[{"slot":2,"role":"ATTACK","pokemonId":"GALLADE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.837469063099428},{"slot":2,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.6647104302359765},{"slot":2,"role":"ATTACK","pokemonId":"HITMONLEE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.6250819235265546},{"slot":2,"role":"ATTACK","pokemonId":"FLYGON","quickMove":"SAND_ATTACK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.468117242961913},{"slot":2,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.4162966310698795},{"slot":2,"role":"ATTACK","pokemonId":"ELECTIVIRE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.404397130176186},{"slot":2,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.3570256674466012},{"slot":2,"role":"ATTACK","pokemonId":"KINGLER","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.313603936289376},{"slot":2,"role":"ATTACK","pokemonId":"RHYPERIOR","quickMove":"MUD_SLAP_FAST","cinematicMove":"SURF","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.299855544311661},{"slot":2,"role":"ATTACK","pokemonId":"MACHAMP","quickMove":"COUNTER_FAST","cinematicMove":"STONE_EDGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.281032800907299}]},{"slot":3,"role":"SHIELD","pokemonId":"LATIAS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9626298518518519,"alternatives":[{"slot":3,"role":"SHIELD","pokemonId":"GYARADOS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9626298518518519},{"slot":3,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9622970370370371},{"slot":3,"role":"SHIELD","pokemonId":"BLASTOISE_GIGANTAMAX","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9256295555555556},{"slot":3,"role":"SHIELD","pokemonId":"BLASTOISE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9256295555555556},{"slot":3,"role":"SHIELD","pokemonId":"VAPOREON","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9464267407407408},{"slot":3,"role":"SHIELD","pokemonId":"RAIKOU","quickMove":"THUNDER_SHOCK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9626298518518519},{"slot":3,"role":"SHIELD","pokemonId":"BLISSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.999593111111111},{"slot":3,"role":"SHIELD","pokemonId":"LAPRAS_GIGANTAMAX","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9451772592592593},{"slot":3,"role":"SHIELD","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1}]}]}}
+{"uxie-d5-3-0-0":{"defenderId":"UXIE","tier":"RAID_LEVEL_5_MAX","composition":{"attack":3,"heal":0,"shield":0,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.0235581035974937,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5635905283024982},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":1,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":1,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":1,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":2,"role":"ATTACK","pokemonId":"HYDREIGON","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.8187299791552247,"alternatives":[{"slot":2,"role":"ATTACK","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5635905283024982},{"slot":2,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":2,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":2,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":2,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":2,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":2,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":2,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":2,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":2,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":3,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109,"alternatives":[{"slot":3,"role":"ATTACK","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5635905283024982},{"slot":3,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":3,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":3,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":3,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":3,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":3,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":3,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":3,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":3,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]}]},"uxie-d5-2-0-1":{"defenderId":"UXIE","tier":"RAID_LEVEL_5_MAX","composition":{"attack":2,"heal":0,"shield":1,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.0235581035974937,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":1,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":1,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":1,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":2,"role":"ATTACK","pokemonId":"HYDREIGON","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.8187299791552247,"alternatives":[{"slot":2,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109},{"slot":2,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":2,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":2,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":2,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":2,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":2,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":2,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":2,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":2,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":3,"role":"SHIELD","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"BEHEMOTH_BASH","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1,"alternatives":[{"slot":3,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"LATIOS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"LATIAS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"EXCADRILL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"DURALUDON","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"REGISTEEL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"BLISSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"CHANSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"REGIROCK","quickMove":"LOCK_ON_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1}]}]},"uxie-d5-1-0-2":{"defenderId":"UXIE","tier":"RAID_LEVEL_5_MAX","composition":{"attack":1,"heal":0,"shield":2,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.0235581035974937,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":1,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":1,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2659532378814151},{"slot":1,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.2327289241569994}]},{"slot":2,"role":"SHIELD","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"BEHEMOTH_BASH","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1,"alternatives":[{"slot":2,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"LATIOS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"LATIAS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"EXCADRILL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"DURALUDON","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"REGISTEEL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"BLISSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"CHANSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"REGIROCK","quickMove":"LOCK_ON_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1}]},{"slot":3,"role":"SHIELD","pokemonId":"HYDREIGON","quickMove":"BITE_FAST","cinematicMove":"BRUTAL_SWING","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1,"alternatives":[{"slot":3,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"LATIOS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"LATIAS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"EXCADRILL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"DURALUDON","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"REGISTEEL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"BLISSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"CHANSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"REGIROCK","quickMove":"LOCK_ON_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1}]}]},"uxie-d5-1-2-0":{"defenderId":"UXIE","tier":"RAID_LEVEL_5_MAX","composition":{"attack":1,"heal":2,"shield":0,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.0235581035974937,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"HYDREIGON","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.8187299791552247},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SUCKER_PUNCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.7786655559786109},{"slot":1,"role":"ATTACK","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5635905283024982},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.5282661796165216},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4853552196392423},{"slot":1,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4758161843625972},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4567171210233747},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.4347573600925407},{"slot":1,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3313343007941807},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.304707627786839}]},{"slot":2,"role":"HEAL","pokemonId":"BLISSEY","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.8485583332905581,"alternatives":[{"slot":2,"role":"HEAL","pokemonId":"LAPRAS_GIGANTAMAX","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.7016900959294613},{"slot":2,"role":"HEAL","pokemonId":"GREEDENT","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.6029361802230185},{"slot":2,"role":"HEAL","pokemonId":"REGICE","quickMove":"ROCK_SMASH_FAST","cinematicMove":"EARTHQUAKE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5727973752380169},{"slot":2,"role":"HEAL","pokemonId":"REGIROCK","quickMove":"ROCK_SMASH_FAST","cinematicMove":"EARTHQUAKE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5602709747446388},{"slot":2,"role":"HEAL","pokemonId":"REGISTEEL","quickMove":"ROCK_SMASH_FAST","cinematicMove":"ZAP_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.547807333052085},{"slot":2,"role":"HEAL","pokemonId":"LUGIA","quickMove":"DRAGON_TAIL_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5280823745657869},{"slot":2,"role":"HEAL","pokemonId":"MALAMAR","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5210267423359772},{"slot":2,"role":"HEAL","pokemonId":"SUICUNE","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.46576442508304455},{"slot":2,"role":"HEAL","pokemonId":"DUBWOOL","quickMove":"DOUBLE_KICK_FAST","cinematicMove":"WILD_CHARGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.45534245181674043},{"slot":2,"role":"HEAL","pokemonId":"CORVIKNIGHT","quickMove":"SAND_ATTACK_FAST","cinematicMove":"AIR_CUTTER","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.4525618207433134}]},{"slot":3,"role":"HEAL","pokemonId":"VAPOREON","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.7097417497149792,"alternatives":[{"slot":3,"role":"HEAL","pokemonId":"LAPRAS_GIGANTAMAX","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.7016900959294613},{"slot":3,"role":"HEAL","pokemonId":"GREEDENT","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.6029361802230185},{"slot":3,"role":"HEAL","pokemonId":"REGICE","quickMove":"ROCK_SMASH_FAST","cinematicMove":"EARTHQUAKE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5727973752380169},{"slot":3,"role":"HEAL","pokemonId":"REGIROCK","quickMove":"ROCK_SMASH_FAST","cinematicMove":"EARTHQUAKE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5602709747446388},{"slot":3,"role":"HEAL","pokemonId":"REGISTEEL","quickMove":"ROCK_SMASH_FAST","cinematicMove":"ZAP_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.547807333052085},{"slot":3,"role":"HEAL","pokemonId":"LUGIA","quickMove":"DRAGON_TAIL_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5280823745657869},{"slot":3,"role":"HEAL","pokemonId":"MALAMAR","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.5210267423359772},{"slot":3,"role":"HEAL","pokemonId":"SUICUNE","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.46576442508304455},{"slot":3,"role":"HEAL","pokemonId":"DUBWOOL","quickMove":"DOUBLE_KICK_FAST","cinematicMove":"WILD_CHARGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.45534245181674043},{"slot":3,"role":"HEAL","pokemonId":"CORVIKNIGHT","quickMove":"SAND_ATTACK_FAST","cinematicMove":"AIR_CUTTER","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.4525618207433134}]}]},"gmax-machamp-2-0-1":{"defenderId":"MACHAMP_GIGANTAMAX","tier":"RAID_LEVEL_6_MAX","composition":{"attack":2,"heal":0,"shield":1,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3477125000000012,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"LATIOS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"LUSTER_PURGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9823259999999998},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"FLASH_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9637920000000019},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9205680000000016},{"slot":1,"role":"ATTACK","pokemonId":"LATIAS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"MIST_BALL","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8968215000000009},{"slot":1,"role":"ATTACK","pokemonId":"ALAKAZAM","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8941319999999987},{"slot":1,"role":"ATTACK","pokemonId":"ESPEON","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"FUTURESIGHT","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8528129999999995},{"slot":1,"role":"ATTACK","pokemonId":"HATTERENE","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8386080237047683},{"slot":1,"role":"ATTACK","pokemonId":"LUGIA","quickMove":"EXTRASENSORY_FAST","cinematicMove":"AEROBLAST_PLUS_PLUS","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8238966898020914},{"slot":1,"role":"ATTACK","pokemonId":"VENUSAUR_GIGANTAMAX","quickMove":"VINE_WHIP_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8125760164302229},{"slot":1,"role":"ATTACK","pokemonId":"MOLTRES","quickMove":"WING_ATTACK_FAST","cinematicMove":"FLY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8071200000000006}]},{"slot":2,"role":"ATTACK","pokemonId":"GALLADE","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.1116177543508001,"alternatives":[{"slot":2,"role":"ATTACK","pokemonId":"LATIOS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"LUSTER_PURGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9823259999999998},{"slot":2,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"FLASH_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9637920000000019},{"slot":2,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9205680000000016},{"slot":2,"role":"ATTACK","pokemonId":"LATIAS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"MIST_BALL","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8968215000000009},{"slot":2,"role":"ATTACK","pokemonId":"ALAKAZAM","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8941319999999987},{"slot":2,"role":"ATTACK","pokemonId":"ESPEON","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"FUTURESIGHT","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8528129999999995},{"slot":2,"role":"ATTACK","pokemonId":"HATTERENE","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8386080237047683},{"slot":2,"role":"ATTACK","pokemonId":"LUGIA","quickMove":"EXTRASENSORY_FAST","cinematicMove":"AEROBLAST_PLUS_PLUS","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8238966898020914},{"slot":2,"role":"ATTACK","pokemonId":"VENUSAUR_GIGANTAMAX","quickMove":"VINE_WHIP_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8125760164302229},{"slot":2,"role":"ATTACK","pokemonId":"MOLTRES","quickMove":"WING_ATTACK_FAST","cinematicMove":"FLY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8071200000000006}]},{"slot":3,"role":"SHIELD","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOONBLAST","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1,"alternatives":[{"slot":3,"role":"SHIELD","pokemonId":"VENUSAUR_GIGANTAMAX","quickMove":"VINE_WHIP_FAST","cinematicMove":"SOLAR_BEAM","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9813945263157895},{"slot":3,"role":"SHIELD","pokemonId":"VENUSAUR","quickMove":"VINE_WHIP_FAST","cinematicMove":"SOLAR_BEAM","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9813945263157895},{"slot":3,"role":"SHIELD","pokemonId":"VAPOREON","quickMove":"WATER_GUN_FAST","cinematicMove":"HYDRO_PUMP","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"BLASTOISE_GIGANTAMAX","quickMove":"WATER_GUN_FAST","cinematicMove":"HYDRO_PUMP","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9719733684210525},{"slot":3,"role":"SHIELD","pokemonId":"SUICUNE","quickMove":"WATER_GUN_FAST","cinematicMove":"HYDRO_PUMP","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"BLASTOISE","quickMove":"WATER_GUN_FAST","cinematicMove":"SKULL_BASH","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9719733684210528},{"slot":3,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"SUPER_POWER","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9544179999999999},{"slot":3,"role":"SHIELD","pokemonId":"ETERNATUS","quickMove":"DRAGON_TAIL_FAST","cinematicMove":"DYNAMAX_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"BULLET_PUNCH_FAST","cinematicMove":"PSYCHIC","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9630522105263158},{"slot":3,"role":"SHIELD","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"EARTH_POWER","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9626837894736844}]}]},"duraludon-d4-2-0-1":{"defenderId":"DURALUDON","tier":"RAID_LEVEL_4_MAX","composition":{"attack":2,"heal":0,"shield":1,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"MACHAMP_GIGANTAMAX","quickMove":"COUNTER_FAST","cinematicMove":"CLOSE_COMBAT","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":3.138779925731202,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"GALLADE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.837469063099428},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.6647104302359765},{"slot":1,"role":"ATTACK","pokemonId":"HITMONLEE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.6250819235265546},{"slot":1,"role":"ATTACK","pokemonId":"FLYGON","quickMove":"SAND_ATTACK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.468117242961913},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.4162966310698795},{"slot":1,"role":"ATTACK","pokemonId":"ELECTIVIRE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.404397130176186},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.3570256674466012},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.313603936289376},{"slot":1,"role":"ATTACK","pokemonId":"RHYPERIOR","quickMove":"MUD_SLAP_FAST","cinematicMove":"SURF","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.299855544311661},{"slot":1,"role":"ATTACK","pokemonId":"MACHAMP","quickMove":"COUNTER_FAST","cinematicMove":"STONE_EDGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.281032800907299}]},{"slot":2,"role":"ATTACK","pokemonId":"EXCADRILL","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":3.021222482852002,"alternatives":[{"slot":2,"role":"ATTACK","pokemonId":"GALLADE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.837469063099428},{"slot":2,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.6647104302359765},{"slot":2,"role":"ATTACK","pokemonId":"HITMONLEE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.6250819235265546},{"slot":2,"role":"ATTACK","pokemonId":"FLYGON","quickMove":"SAND_ATTACK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.468117242961913},{"slot":2,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.4162966310698795},{"slot":2,"role":"ATTACK","pokemonId":"ELECTIVIRE","quickMove":"LOW_KICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.404397130176186},{"slot":2,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.3570256674466012},{"slot":2,"role":"ATTACK","pokemonId":"KINGLER","quickMove":"MUD_SHOT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.313603936289376},{"slot":2,"role":"ATTACK","pokemonId":"RHYPERIOR","quickMove":"MUD_SLAP_FAST","cinematicMove":"SURF","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.299855544311661},{"slot":2,"role":"ATTACK","pokemonId":"MACHAMP","quickMove":"COUNTER_FAST","cinematicMove":"STONE_EDGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.281032800907299}]},{"slot":3,"role":"SHIELD","pokemonId":"LATIAS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9626298518518519,"alternatives":[{"slot":3,"role":"SHIELD","pokemonId":"GYARADOS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9626298518518519},{"slot":3,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9622970370370371},{"slot":3,"role":"SHIELD","pokemonId":"BLASTOISE_GIGANTAMAX","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9256295555555556},{"slot":3,"role":"SHIELD","pokemonId":"BLASTOISE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9256295555555556},{"slot":3,"role":"SHIELD","pokemonId":"VAPOREON","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9464267407407408},{"slot":3,"role":"SHIELD","pokemonId":"RAIKOU","quickMove":"THUNDER_SHOCK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9626298518518519},{"slot":3,"role":"SHIELD","pokemonId":"BLISSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.999593111111111},{"slot":3,"role":"SHIELD","pokemonId":"LAPRAS_GIGANTAMAX","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9451772592592593},{"slot":3,"role":"SHIELD","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":3,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1}]}]},"uxie-d5-2-1-0-0":{"defenderId":"UXIE","tier":"RAID_LEVEL_5_MAX","composition":{"attack":2,"heal":0,"shield":0,"charge":0,"meterCharge":1},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"BEHEMOTH_BLADE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":2.1651015169698926,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.9295385329952297},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.674290044398756},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.6340994402399829},{"slot":1,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.6215622120595388},{"slot":1,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.589313448012435},{"slot":1,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.575450077471886},{"slot":1,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.474624409268832},{"slot":1,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.447092241138291},{"slot":1,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3868161117673625},{"slot":1,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3781643847733864}]},{"slot":2,"role":"ATTACK","pokemonId":"HYDREIGON","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.957472447033676,"alternatives":[{"slot":2,"role":"ATTACK","pokemonId":"GENGAR_GIGANTAMAX","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.9295385329952297},{"slot":2,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.674290044398756},{"slot":2,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.6340994402399829},{"slot":2,"role":"ATTACK","pokemonId":"WEAVILE","quickMove":"FEINT_ATTACK_FAST","cinematicMove":"FOUL_PLAY","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.6215622120595388},{"slot":2,"role":"ATTACK","pokemonId":"CINDERACE_GIGANTAMAX","quickMove":"TACKLE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.589313448012435},{"slot":2,"role":"ATTACK","pokemonId":"KINGLER_GIGANTAMAX","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.575450077471886},{"slot":2,"role":"ATTACK","pokemonId":"ARCANINE","quickMove":"BITE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.474624409268832},{"slot":2,"role":"ATTACK","pokemonId":"CHARIZARD_GIGANTAMAX","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.447092241138291},{"slot":2,"role":"ATTACK","pokemonId":"GENGAR","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3868161117673625},{"slot":2,"role":"ATTACK","pokemonId":"KABUTOPS","quickMove":"FURY_CUTTER_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3781643847733864}]},{"slot":3,"role":"METER_CHARGE","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"BEHEMOTH_BASH","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"METER_CHARGE","score":2.767512911542099,"alternatives":[{"slot":3,"role":"METER_CHARGE","pokemonId":"METAGROSS","quickMove":"SHADOW_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"METER_CHARGE","score":2.4059034575397775},{"slot":3,"role":"METER_CHARGE","pokemonId":"LATIOS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"LUSTER_PURGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"METER_CHARGE","score":2.433565619239701},{"slot":3,"role":"METER_CHARGE","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"METER_CHARGE","score":2.3840849125240497},{"slot":3,"role":"METER_CHARGE","pokemonId":"EXCADRILL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"METER_CHARGE","score":2.3820273134866814},{"slot":3,"role":"METER_CHARGE","pokemonId":"DURALUDON","quickMove":"METAL_CLAW_FAST","cinematicMove":"FLASH_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"METER_CHARGE","score":2.3649830672732834},{"slot":3,"role":"METER_CHARGE","pokemonId":"LATIAS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"METER_CHARGE","score":2.3830444932653023},{"slot":3,"role":"METER_CHARGE","pokemonId":"REGISTEEL","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"METER_CHARGE","score":2.4169009316534074},{"slot":3,"role":"METER_CHARGE","pokemonId":"BLISSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"METER_CHARGE","score":2.4185220949746706},{"slot":3,"role":"METER_CHARGE","pokemonId":"REGIROCK","quickMove":"LOCK_ON_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"METER_CHARGE","score":2.4226481439671823},{"slot":3,"role":"METER_CHARGE","pokemonId":"REGICE","quickMove":"LOCK_ON_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"METER_CHARGE","score":2.4226481439671823}]}]},"gmax-machamp-1-1-1":{"defenderId":"MACHAMP_GIGANTAMAX","tier":"RAID_LEVEL_6_MAX","composition":{"attack":1,"heal":1,"shield":1,"charge":0,"meterCharge":0},"slots":[{"slot":1,"role":"ATTACK","pokemonId":"ZACIAN_CROWNED_SWORD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.3477125000000012,"alternatives":[{"slot":1,"role":"ATTACK","pokemonId":"GALLADE","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":1.1116177543508001},{"slot":1,"role":"ATTACK","pokemonId":"LATIOS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"LUSTER_PURGE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9823259999999998},{"slot":1,"role":"ATTACK","pokemonId":"METAGROSS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"FLASH_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9637920000000019},{"slot":1,"role":"ATTACK","pokemonId":"RILLABOOM_GIGANTAMAX","quickMove":"SCRATCH_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.9205680000000016},{"slot":1,"role":"ATTACK","pokemonId":"LATIAS","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"MIST_BALL","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8968215000000009},{"slot":1,"role":"ATTACK","pokemonId":"ALAKAZAM","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8941319999999987},{"slot":1,"role":"ATTACK","pokemonId":"ESPEON","quickMove":"ZEN_HEADBUTT_FAST","cinematicMove":"FUTURESIGHT","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8528129999999995},{"slot":1,"role":"ATTACK","pokemonId":"HATTERENE","quickMove":"PSYCHO_CUT_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8386080237047683},{"slot":1,"role":"ATTACK","pokemonId":"LUGIA","quickMove":"EXTRASENSORY_FAST","cinematicMove":"AEROBLAST_PLUS_PLUS","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8238966898020914},{"slot":1,"role":"ATTACK","pokemonId":"VENUSAUR_GIGANTAMAX","quickMove":"VINE_WHIP_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"ESTIMATOR","score":0.8125760164302229}]},{"slot":2,"role":"SHIELD","pokemonId":"ZAMAZENTA_CROWNED_SHIELD_FORM","quickMove":"METAL_CLAW_FAST","cinematicMove":"MOONBLAST","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1,"alternatives":[{"slot":2,"role":"SHIELD","pokemonId":"VENUSAUR_GIGANTAMAX","quickMove":"VINE_WHIP_FAST","cinematicMove":"SOLAR_BEAM","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9813945263157895},{"slot":2,"role":"SHIELD","pokemonId":"VENUSAUR","quickMove":"VINE_WHIP_FAST","cinematicMove":"SOLAR_BEAM","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9813945263157895},{"slot":2,"role":"SHIELD","pokemonId":"VAPOREON","quickMove":"WATER_GUN_FAST","cinematicMove":"HYDRO_PUMP","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"BLASTOISE_GIGANTAMAX","quickMove":"WATER_GUN_FAST","cinematicMove":"HYDRO_PUMP","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9719733684210525},{"slot":2,"role":"SHIELD","pokemonId":"SUICUNE","quickMove":"WATER_GUN_FAST","cinematicMove":"HYDRO_PUMP","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"BLASTOISE","quickMove":"WATER_GUN_FAST","cinematicMove":"SKULL_BASH","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9719733684210528},{"slot":2,"role":"SHIELD","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"LICK_FAST","cinematicMove":"SUPER_POWER","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9544179999999999},{"slot":2,"role":"SHIELD","pokemonId":"GALLADE","quickMove":"LOW_KICK_FAST","cinematicMove":"PSYCHIC","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"ETERNATUS","quickMove":"DRAGON_TAIL_FAST","cinematicMove":"DYNAMAX_CANNON","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":1},{"slot":2,"role":"SHIELD","pokemonId":"METAGROSS","quickMove":"BULLET_PUNCH_FAST","cinematicMove":"PSYCHIC","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TANK","score":0.9630522105263158}]},{"slot":3,"role":"HEAL","pokemonId":"BLISSEY","quickMove":"POUND_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.19467668680847047,"alternatives":[{"slot":3,"role":"HEAL","pokemonId":"VAPOREON","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.14455506515525493},{"slot":3,"role":"HEAL","pokemonId":"SNORLAX_GIGANTAMAX","quickMove":"PSYWAVE_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.14194131644098032},{"slot":3,"role":"HEAL","pokemonId":"ETERNATUS","quickMove":"DRAGON_TAIL_FAST","cinematicMove":"FLAMETHROWER","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.13793664478058823},{"slot":3,"role":"HEAL","pokemonId":"SUICUNE","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.13599463878431375},{"slot":3,"role":"HEAL","pokemonId":"LUGIA","quickMove":"EXTRASENSORY_FAST","cinematicMove":"AEROBLAST_PLUS_PLUS","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.12747294035576476},{"slot":3,"role":"HEAL","pokemonId":"LATIAS","quickMove":"DRAGON_BREATH_FAST","cinematicMove":"MIST_BALL","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.12150619583505881},{"slot":3,"role":"HEAL","pokemonId":"CORVIKNIGHT","quickMove":"SAND_ATTACK_FAST","cinematicMove":"SKY_ATTACK","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.12060251901160793},{"slot":3,"role":"HEAL","pokemonId":"WAILORD","quickMove":"WATER_GUN_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.11646877421419609},{"slot":3,"role":"HEAL","pokemonId":"MILOTIC","quickMove":"WATERFALL_FAST","cinematicMove":"SURF","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.11447595558941172},{"slot":3,"role":"HEAL","pokemonId":"RAIKOU","quickMove":"THUNDER_SHOCK_FAST","cinematicMove":"MOVE_NONE","level":"40","maxPowerLevel":1,"maxShieldLevel":3,"maxHealLevel":3,"genericFallback":false,"sort":"TOTAL_HEAL","score":0.11383800457905889}]}]}}
diff --git a/test/support/pokebattler.ts b/test/support/pokebattler.ts
index 53eead32b827ab33c1c34904e4d1a500a28cdae0..1a8903547f37e647705a2428b05aa686d87ca624 100644
--- a/test/support/pokebattler.ts
+++ b/test/support/pokebattler.ts
@@ -22,9 +22,11 @@ import {
  * Answers of Pokebattler's suggested max battle teams (`GET /max/parties/suggested/defenders/
  * <boss>/levels/<tier>?attack=a&heal=h&shield=s`), recorded on 2026-10-21 with Matt's go-ahead,
  * each kept whole as Pokebattler gave it, by `<boss>-<tier>-<attack>-<heal>-<shield>`: Uxie in
- * `RAID_LEVEL_5_MAX` for every role of `MAX_ROLES` (3/0/0, 2/0/1, 1/0/2, 1/2/0), Gigantamax
- * Machamp (`MACHAMP_GIGANTAMAX` in `RAID_LEVEL_6_MAX`) 2/0/1, and Duraludon in `RAID_LEVEL_4_MAX`
- * 2/0/1, whose first attacker is `MACHAMP_GIGANTAMAX`.
+ * `RAID_LEVEL_5_MAX` with attack/heal/shield 3/0/0 (All attackers), 2/0/1, 1/0/2 (Shielder) and
+ * 1/2/0 (Healer); `uxie-d5-2-1-0-0` is two attackers and a charger (attack 2, meterCharge 1: the
+ * default role); Gigantamax Machamp (`MACHAMP_GIGANTAMAX` in `RAID_LEVEL_6_MAX`) 2/0/1 and 1/1/1
+ * (an attacker, a healer and a shielder), and Duraludon in `RAID_LEVEL_4_MAX` 2/0/1, whose first
+ * attacker is `MACHAMP_GIGANTAMAX`.
  */
 export type RecordedMaxTeam =
   | 'uxie-d5-3-0-0'
@@ -32,7 +34,9 @@ export type RecordedMaxTeam =
   | 'uxie-d5-1-0-2'
   | 'uxie-d5-1-2-0'
   | 'gmax-machamp-2-0-1'
-  | 'duraludon-d4-2-0-1';
+  | 'duraludon-d4-2-0-1'
+  | 'uxie-d5-2-1-0-0'
+  | 'gmax-machamp-1-1-1';
 
 let maxTeams: Record<string, unknown> | undefined;
 
@@ -193,8 +197,11 @@ export class FakePokebattler implements PokebattlerGateway {
 
   /** Max battle teams asked for (plan 8X-6), as `asked` for counters. */
   readonly maxAsked: MaxTeamQuery[] = [];
-  /** The team every known boss gets; by default the recorded Uxie, three attackers. */
-  maxAnswer: MaxTeamAnswer = recordedTeam('uxie-d5-3-0-0');
+  /**
+   * The team every known boss gets, whatever the role; by default the recorded Uxie of the
+   * default role (`DEFAULT_MAX_ROLE`), two attackers and a charger.
+   */
+  maxAnswer: MaxTeamAnswer = recordedTeam('uxie-d5-2-1-0-0');
 
   /** Answered as `counters` is, with `maxAnswer`, `known` and `failing`. */
   maxTeam(request: MaxTeamRequest): Promise<MaxTeamOutcome> {
````
