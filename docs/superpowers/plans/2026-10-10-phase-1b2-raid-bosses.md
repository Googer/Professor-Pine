# Phase 1B-2: Raid Bosses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the list of current raid bosses correct without moderator work: read it from a public feed, store it, let moderators override it, and say what an egg of each tier hatches as. First, give every Pokémon exactly one identity (the "one identity per form" decision), because the feed names bosses by form.

**Architecture:** Pure modules in `src/domain/pogo/` read the feed (`raid-boss-feed.ts`) and work out the list in effect (`raid-bosses.ts`: feed plus overrides, auto-set, what changed). `RaidBossRepository` owns two new tables, `RaidBoss` and `RaidBossOverride`. `RaidBossService` is the only part that touches the network: it reads the feed on a timer with conditional requests, replaces the stored list only with a valid one, and tells listeners about changes and about a feed that has gone stale. Handlers see it as `ctx.raidBosses`. Starting the bot never waits for the feed: the list of the last run is read from the database.

**Tech Stack:** TypeScript 6.0, native `fetch`, zod 4, Kysely on MySQL 8, Vitest (unit, and Testcontainers for `*.db.test.ts`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`, section 6.7 (and 6.1 for the tables). Phase 1 is split into 1A (done), 1B-1 (done), 1B-2 (this plan) and 1C (search, image cache, static maps). Hand-offs from earlier phases: `docs/superpowers/plans/phase-0-follow-ups.md`, section "From Phase 1B-1".

**Every code block in this plan was run before the plan was written**, on a throwaway branch: 505 unit tests and 91 database tests pass, lint and typecheck are clean, and the check script of Task 6 read the live feed (14 bosses, all resolved). If something does not pass as written, suspect a transcription slip before suspecting the design.

## Decisions made in this plan

Matt decided "one identity per form" (2026-10-10). Working it out against the data settled these points; items 1 to 3 differ from what was said when the decision was recorded.

1. **25 species are known by their default form, not 26.** The rule: a species with no `_NORMAL` form whose bare game-master item is a copy (stats, types, moves) of exactly one of its forms is known by that form, and the bare species id becomes an alias. That gives 21 species (Giratina, Shaymin, Darmanitan, Tornadus, Thundurus, Landorus, Enamorus, Hoopa, Aegislash, Lycanroc, Cherrim, Pumpkaboo, Gourgeist, Oricorio, Wishiwashi, Eiscue, Indeedee, Morpeko, Palafin, Koraidon, Miraidon). The earlier count of 26 wrongly included five species that do have a `_NORMAL` form and a variant with the same data (female Frillish, Jellicent and Pyroar, Dusk-form Rockruff, original-colour Magearna): those stay as they are.
2. **Four more are collapsed by an explicit table**, because their bare item copies no form and is wrong on its own: Zacian and Zamazenta (the bare item has the Hero stats with the Crowned types, so a raid would show the wrong weaknesses), Meloetta and Wormadam (the bare item lacks moves). They are known by `zacian_hero`, `zamazenta_hero`, `meloetta_aria` and `wormadam_plant`.
3. **Species whose forms are all alike keep the bare entry**: Unown, Vivillon, Spinda, Furfrou, Keldeo, Toxtricity, Mimikyu and about twenty others. There is no single form to prefer; Phase 1C collapses them in search results. Urshifu and Minior also keep the bare entry (it matches neither or none of the forms); see "Not in this plan".
4. **The entry that stands for a species has `kind: 'species'`**, also when it is a default form (then `form` is set and the name says the form: "Landorus (Incarnate Forme)"). So `catalogue.species(dex)` and everything that counts species keep working unchanged.
5. **Aliases** (`GameData.aliases`, 133 today) cover the bare id of those 25 species, costumes and appearance-only forms, each pointing at the entry it copies (`corsola_spring_2026` → `corsola_galarian`). `catalogue.byKey` and `byGameMasterId` resolve them. `_NORMAL` form ids stay a rule in `byGameMasterId`, because `NIDORAN_NORMAL` belongs to two species.
6. **Feed level keys** were read from the feed project's source (`RaidLevel` enum): `lvl1`, `lvl3`, `lvl5`, `ex`, `mega`, `legendary_mega`, `ultra_beast`, `primal`, `super_mega`, `shadow_lvl1/3/5`. The feed itself tells mega from mega legendary, so the catalogue does not need the species class. `ultra_beast` maps to T5 and `primal` to Mega Legendary. **`super_mega` becomes a new raid level, `SuperMega`** (Matt, 2026-10-10: tier 7, as the game shows it; an ordinary mega raid is tier 4 and a mega legendary tier 6, which is how the legacy numbers -4 and -6 already read). Its notification code is -7, the next number of the legacy scheme. Its boss stamina is not known: the mega legendary value (22,500) stands in, which only affects the CP shown on the boss. A level key Pine does not know is reported once and its bosses are left out. Elite raids are not in the feed; moderators add them with an override.
7. **The tables** store the feed's ids (`pokemonId`, `form`) and resolve them against the catalogue when read, so a boss newer than the game master is kept and starts resolving by itself once the game data catches up. Times are epoch milliseconds in `BIGINT` columns. The moderator's snowflake is a `VARCHAR(30)`, like `User.userSnowflake`.
8. **Override actions are `add`, `hide`, `autoset` and `shiny`.** The spec lists the first three and says `/admin boss shiny` "is an override"; this plan makes it a fourth action. `autoset` also makes the Pokémon a boss of the tier. `hide` beats `add` and `autoset`.
9. **Validators (ETag, Last-Modified) are kept in memory only**, and only for a feed that was accepted. After a restart the first request is unconditional.
10. **`data/settings.json` gains a `raidBosses` block**, like the `gameData` block in Phase 1B-1. The legacy bot ignores keys it does not know.
11. **No `RaidBossSource` interface.** The spec puts the feed behind an interface so that a second source (ScrapedDuck) could be added, and says that source is not built now. With one source that would be an interface with a single implementation. The seam is kept instead: `parseRaidBossFeed` is pure and returns plain `FeedBoss` values, and the only code that knows the feed's address and format is `RaidBossService.readFeed` (about forty lines). A second source means a second parser and a choice in that method.
12. **Not built here:** posting changes and the stale warning to Discord channels, and the `/admin boss` commands (Phase 5). This plan provides `onChange` and `onStale` and logs both. The ScrapedDuck fallback named in the spec is not built (the spec says so).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit or delete legacy JS or the legacy `data/*.json` files. The one exception is the `raidBosses` block Task 6 adds to `data/settings.json`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/pogo/` is pure: no imports from `discord.js`, `kysely`, `node:fs`, or the network.
- **Tests never use the network.** The feed in tests is the committed fixture `test/fixtures/raid-boss-feed.json`; game data is `catalogueFixture()` / `gameDataFixture()`.
- A Pokémon's identity is its **catalogue key**. After Task 1, look-ups also accept aliases, so always keep the `key` of the entry returned, never the text looked up.
- Raid tiers are `RaidTier` values (`src/domain/pogo/raid-tier.ts`): `{ level, shadow }`. In the tables the level is the `RaidLevel` string (`T1`, `T3`, `T5`, `Mega`, `MegaLegendary`, `Elite`, `EX`) and `shadow` a `TINYINT(1)`.
- Database changes are additive only. New tables state `utf8mb4` and `utf8mb4_0900_ai_ci` explicitly. Multi-step writes use `inTransaction()` (`src/db/transaction.ts`).
- `src/db/types.ts` is generated: change it only with `npm run db:codegen` (needs Docker).
- The diffs in this plan are exact. Apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (re-run lint after formatting). Tasks 4 and 5 also run their `*.db.test.ts` files (need Docker).
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/` or `var/`.

## Review Focus

1. A member, a stored row or a legacy name still says `landorus`, `giratina` or `hoopa` after those entries are gone. It must find the Pokémon, not nothing. Tests: Task 1, "resolves an alias to the entry it stands for" and "maps a species the catalogue knows by its default form to that form".
2. The feed lists a boss the game master does not know yet: a new Pokémon, a new mega, a new costume. It must stay in the list under a readable name, and must never be shown with the stats of a different Pokémon. Tests: Task 3, "takes a costume newer than the game master for the species the feed names it as" and "does not pass off a new form or mega as the species".
3. The feed is down, answers with an HTML page, an empty list or another JSON shape, or answers 304 for days. The last good list must stay, and moderators must hear once that it is out of date. Tests: Task 5, "keeps the list in use after …" (eight cases), "does not remember the validators of a feed it rejected", "says so once after staleAfterMs …".
4. The bot restarts. The boss list must be there at once without the network, the first sync of a new install must not announce fourteen "new" bosses, and a real change found by the first sync after a restart must be announced. Tests: Task 5, "starts with the list and overrides of the last run", "does not announce the first list of a new database", "announces a change found by the first sync after a restart".
5. Moderators' overrides contradict each other or name the boss differently from the feed (`LANDORUS` against `LANDORUS_INCARNATE`, Pikachu against a costumed Pikachu), or have expired. Tests: Task 3, "hides by Pokémon, whichever ids name it", "lets hide beat add and autoset, whichever is newer", "takes the newest choice for a tier …", "ignores an override once it has expired".

---

## File Structure

```
src/domain/pogo/
  game-master.ts                 modify: GameData.aliases, default forms, GAME_DATA_VERSION 3
  catalogue.ts                   modify: byKey resolves aliases
  pokebattler.ts                 modify: drop five exceptions the rule now covers
  legacy-names.ts                modify: legacy species names of the default forms
  raid-boss-feed.ts              create: FeedBoss, parseRaidBossFeed (zod), the level-key table
  raid-bosses.ts                 create: overrides, RaidBoss, effectiveBosses, autosetBoss, diffFeed
  (+ the tests beside each)
src/db/
  migrations/2026_10_10_001_raid_bosses.ts   create: RaidBoss, RaidBossOverride
  migrations/index.ts            modify: register it
  types.ts                       regenerate
  repositories/raid-boss-repository.ts       create: RaidBossStore, StoredBoss, RaidBossRepository
  repositories/raid-boss-repository.db.test.ts   create
  migrator.db.test.ts            modify: a takeover adds only the new tables
src/services/
  failure-reason.ts              create: failureReason, moved out of game-data-service.ts
  game-data-service.ts           modify: cache check for aliases; import failureReason
  raid-boss-service.ts           create: RaidBossService, RaidBossProvider, SyncResult
  raid-boss-service.test.ts      create (store kept in memory)
  raid-boss-service.db.test.ts   create (the real tables)
src/config/settings.ts           modify: raidBosses block
src/app-context.ts, src/app.ts   modify: ctx.raidBosses, start, shutdown
scripts/raid-bosses/check-feed.ts            create: npm run raid-bosses:check
test/support/raid-bosses.ts      create: readRaidBossFeed, MemoryRaidBossStore, raidBossesFixture
test/support/test-context.ts     modify: raidBosses
test/fixtures/raid-boss-feed.json            create: the feed of 2026-10-10
test/fixtures/game-data.json     regenerate (Task 1)
test/fixtures/settings.json, data/settings.json   modify: raidBosses block
CLAUDE.md, package.json          modify
```

Tasks 1 to 6 are done in order. Each ends with a commit.

---

### Task 1: One identity per form

A species with a named default form is known by that form: the catalogue has `landorus_incarnate` ("Landorus (Incarnate Forme)", `kind: 'species'`) and no `landorus`. The bare species id, costumes and appearance-only forms become aliases that `byKey` and `byGameMasterId` resolve.

**Files:**
- Modify: `src/domain/pogo/game-master.ts`, `src/domain/pogo/catalogue.ts`, `src/domain/pogo/pokebattler.ts`, `src/domain/pogo/legacy-names.ts`, `src/services/game-data-service.ts`
- Modify (tests): `src/domain/pogo/game-master.test.ts`, `catalogue.test.ts`, `pokebattler.test.ts`, `legacy-names.test.ts`, `nicknames.test.ts`, `src/services/game-data-service.test.ts`
- Regenerate: `test/fixtures/game-data.json`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `GameData.aliases: Record<string, string>`: lower-cased game-master id → key of the entry it stands for. `GAME_DATA_VERSION` is `3`.
  - `PokemonEntry.kind === 'species'` marks the one entry that stands for a species; for a default form its `form` is set.
  - `PokemonCatalogue.byKey(key)` and `byGameMasterId(pokemonId, form?, tempEvolution?)` resolve aliases. The entry's `key` may differ from the text looked up.
  - `keyForLegacyName('landorus') === 'landorus_incarnate'`; `legacyNamesForKey('hoopa_confined')` is `['hoopa_confined', 'hoopa']`.

- [ ] **Step 1: Change the tests**

Apply these diffs.

`src/domain/pogo/game-master.test.ts`:

```diff
--- a/src/domain/pogo/game-master.test.ts
+++ b/src/domain/pogo/game-master.test.ts
@@ -98,10 +98,66 @@ describe('parseGameMaster: Pokémon', () => {
       kind: 'form',
       stats: { attack: 225, defense: 187, stamina: 284 },
     });
-    expect(entry('giratina').stats).toEqual({ attack: 187, defense: 225, stamina: 284 });
     expect(entry('unown_question_mark').name).toBe('Unown (?)');
   });
 
+  it('knows a species with a named default form by that form alone', () => {
+    expect(byKey.has('giratina')).toBe(false);
+    expect(entry('giratina_altered')).toMatchObject({
+      dex: 487,
+      pokemonId: 'GIRATINA',
+      form: 'GIRATINA_ALTERED',
+      kind: 'species',
+      name: 'Giratina (Altered Forme)',
+      stats: { attack: 187, defense: 225, stamina: 284 },
+      shadow: true,
+      pokebattlerId: 'GIRATINA_ALTERED_FORM',
+    });
+    expect(data.aliases['giratina']).toBe('giratina_altered');
+    expect(
+      data.pokemon.filter((p) => p.pokemonId === 'GIRATINA').map((p) => [p.key, p.kind]),
+    ).toEqual([
+      ['giratina_altered', 'species'],
+      ['giratina_origin', 'form'],
+    ]);
+    // The regional forms of such a species are unaffected.
+    expect(byKey.has('darmanitan')).toBe(false);
+    expect(entry('darmanitan_standard').kind).toBe('species');
+    expect(entry('darmanitan_galarian_standard').kind).toBe('regional');
+  });
+
+  it('keeps the bare species when it has a NORMAL form or its forms are all alike', () => {
+    expect(entry('deoxys')).toMatchObject({ kind: 'species', form: null });
+    expect(entry('unown')).toMatchObject({ kind: 'species', form: null, name: 'Unown' });
+    expect(entry('unown_a').kind).toBe('form');
+    expect(data.aliases['deoxys']).toBeUndefined();
+    expect(data.aliases['unown']).toBeUndefined();
+  });
+
+  it('has exactly one entry standing for each species', () => {
+    const standing = data.pokemon.filter((p) => p.kind === 'species');
+    expect(new Set(standing.map((p) => p.pokemonId)).size).toBe(standing.length);
+    expect(standing.length).toBe(new Set(data.pokemon.map((p) => p.pokemonId)).size);
+  });
+
+  it('lists costumes and appearance-only forms as aliases of the entry they copy', () => {
+    expect(data.aliases).toMatchObject({
+      pikachu_adventure_hat_2020: 'pikachu',
+      venusaur_copy_2019: 'venusaur',
+      latias_s: 'latias',
+    });
+    // NORMAL form ids are not aliases, and neither is anything that is an entry.
+    for (const id of ['venusaur_normal', 'nidoran_normal', 'mewtwo_a', 'venusaur', 'missingno']) {
+      expect(data.aliases[id], id).toBeUndefined();
+    }
+    for (const [id, key] of Object.entries(data.aliases)) {
+      expect(id, id).toBe(id.toLowerCase());
+      expect(byKey.has(id), id).toBe(false);
+      expect(byKey.has(key), id).toBe(true);
+    }
+    expect(Object.keys(data.aliases)).toEqual(Object.keys(data.aliases).sort());
+  });
+
   it('lists temporary evolutions with their own stats and types', () => {
     expect(entry('charizard_mega_x')).toMatchObject({
       name: 'Mega Charizard X',
@@ -220,8 +276,8 @@ describe('parseGameMaster: bad input', () => {
       },
     });
     const { data: parsed, warnings } = parseWithWarnings(items);
-    expect(parsed.pokemon.find((p) => p.key === 'giratina')?.stats).toEqual(
-      entry('giratina').stats,
+    expect(parsed.pokemon.find((p) => p.key === 'giratina_altered')?.stats).toEqual(
+      entry('giratina_altered').stats,
     );
     expect(parsed.pokemon).toHaveLength(data.pokemon.length);
     expect(warnings).toHaveLength(1);
@@ -396,6 +452,7 @@ describe('parseGameMaster: costumes, megas and moves that cannot be taught by TM
     });
     const { data: parsed } = parseWithWarnings(items);
     expect(parsed.pokemon.some((p) => p.key === 'dugtrio_party')).toBe(false);
+    expect(parsed.aliases['dugtrio_party']).toBe('dugtrio');
   });
 
   it('drops a flagged costume that equals a regional form of its species', () => {
@@ -416,6 +473,57 @@ describe('parseGameMaster: costumes, megas and moves that cannot be taught by TM
     expect(parsed.pokemon.some((p) => p.key === 'rattata_spring_2026')).toBe(false);
     expect(parsed.pokemon.some((p) => p.key === 'rattata_alola')).toBe(true);
     expect(parsed.pokemon.some((p) => p.key === 'mewtwo_a')).toBe(true);
+    expect(parsed.aliases['rattata_spring_2026']).toBe('rattata_alola');
+  });
+
+  it('points a costume of a species known by its default form at that form', () => {
+    const items = sampleItems();
+    const costume = structuredClone(item(items, 'V0487_POKEMON_GIRATINA'));
+    costume.templateId = 'V0487_POKEMON_GIRATINA_PARTY_2026';
+    (costume.data['pokemonSettings'] as Rec)['form'] = 'GIRATINA_PARTY_2026';
+    items.push(costume, {
+      templateId: 'FORMS_V0487_POKEMON_GIRATINA_EXTRA',
+      data: {
+        formSettings: {
+          pokemon: 'GIRATINA',
+          forms: [{ form: 'GIRATINA_PARTY_2026', isCostume: true }],
+        },
+      },
+    });
+    const { data: parsed } = parseWithWarnings(items);
+    expect(parsed.pokemon.some((p) => p.key === 'giratina_party_2026')).toBe(false);
+    expect(parsed.aliases['giratina_party_2026']).toBe('giratina_altered');
+    expect(parsed.aliases['giratina']).toBe('giratina_altered');
+  });
+
+  it('keeps the bare species when its formless item copies none of its forms', () => {
+    const items = sampleItems();
+    const settings = item(items, 'V0487_POKEMON_GIRATINA').data['pokemonSettings'] as Rec;
+    settings['stats'] = { baseAttack: 1, baseDefense: 2, baseStamina: 3 };
+    const { data: parsed } = parseWithWarnings(items);
+    expect(
+      parsed.pokemon.filter((p) => p.pokemonId === 'GIRATINA').map((p) => [p.key, p.kind]),
+    ).toEqual([
+      ['giratina', 'species'],
+      ['giratina_altered', 'form'],
+      ['giratina_origin', 'form'],
+    ]);
+    expect(parsed.aliases['giratina']).toBeUndefined();
+  });
+
+  it('keeps the bare species when its formless item copies several of its forms', () => {
+    const items = sampleItems();
+    const origin = item(items, 'V0487_POKEMON_GIRATINA_ORIGIN').data;
+    origin['pokemonSettings'] = {
+      ...structuredClone(item(items, 'V0487_POKEMON_GIRATINA').data['pokemonSettings'] as Rec),
+      form: 'GIRATINA_ORIGIN',
+    };
+    const { data: parsed } = parseWithWarnings(items);
+    expect(parsed.pokemon.filter((p) => p.pokemonId === 'GIRATINA').map((p) => p.key)).toEqual([
+      'giratina',
+      'giratina_altered',
+      'giratina_origin',
+    ]);
   });
 
   it('keeps the first of two entries with one key and warns about the duplicate', () => {
@@ -503,8 +611,9 @@ describe('the parsed snapshot', () => {
 
 describe('the shape of the parsed data', () => {
   it('changes only together with GAME_DATA_VERSION: bump GAME_DATA_VERSION when this fails', () => {
-    expect(GAME_DATA_VERSION).toBe(2);
+    expect(GAME_DATA_VERSION).toBe(3);
     expect(Object.keys(data).sort()).toEqual([
+      'aliases',
       'cpMultipliers',
       'moves',
       'pokemon',
```

`src/domain/pogo/catalogue.test.ts`:

```diff
--- a/src/domain/pogo/catalogue.test.ts
+++ b/src/domain/pogo/catalogue.test.ts
@@ -46,6 +46,33 @@ describe('PokemonCatalogue: lookups', () => {
     expect(catalogue.byKey('missingno')).toBeUndefined();
   });
 
+  it('resolves an alias to the entry it stands for', () => {
+    expect(catalogue.byKey('landorus')).toBe(entry('landorus_incarnate'));
+    expect(catalogue.byKey('LANDORUS')?.key).toBe('landorus_incarnate');
+    expect(catalogue.byKey('pikachu_adventure_hat_2020')?.key).toBe('pikachu');
+    expect(catalogue.byKey('corsola_spring_2026')?.key).toBe('corsola_galarian');
+    expect(catalogue.byKey('zacian')?.key).toBe('zacian_hero');
+    expect(catalogue.all.some((p) => p.key === 'landorus')).toBe(false);
+    // Names every object has must not be mistaken for aliases.
+    expect(catalogue.byKey('constructor')).toBeUndefined();
+    expect(catalogue.byKey('__proto__')).toBeUndefined();
+  });
+
+  it('knows a species with a named default form by that form', () => {
+    expect(catalogue.species(645)?.key).toBe('landorus_incarnate');
+    expect(catalogue.byDex(645).map((p) => p.key)).toEqual([
+      'landorus_incarnate',
+      'landorus_therian',
+    ]);
+    expect(entry('zacian_hero')).toMatchObject({ kind: 'species', types: ['fairy'] });
+    expect(entry('zamazenta_hero').kind).toBe('species');
+    expect(entry('meloetta_aria').kind).toBe('species');
+    expect(entry('wormadam_plant').kind).toBe('species');
+    // Forms that are all alike leave the bare species in place.
+    expect(entry('vivillon')).toMatchObject({ kind: 'species', form: null });
+    expect(entry('keldeo')).toMatchObject({ kind: 'species', form: null });
+  });
+
   it('finds the species and all entries for a Pokédex number', () => {
     expect(catalogue.species(150)?.key).toBe('mewtwo');
     expect(catalogue.byDex(150).map((p) => p.key)).toEqual([
@@ -70,10 +97,20 @@ describe('PokemonCatalogue: lookups', () => {
     // `<SPECIES>_NORMAL` means the species itself.
     expect(catalogue.byGameMasterId('MEWTWO', 'MEWTWO_NORMAL')?.key).toBe('mewtwo');
     expect(catalogue.byGameMasterId('NIDORAN_FEMALE', 'NIDORAN_NORMAL')?.dex).toBe(29);
-    // A costume the game master does not list as its own entry.
+    // A species known by its default form, with or without the form id.
+    expect(catalogue.byGameMasterId('LANDORUS')?.key).toBe('landorus_incarnate');
+    expect(catalogue.byGameMasterId('GIRATINA', 'GIRATINA_ALTERED')?.key).toBe('giratina_altered');
+    // A costume or an appearance-only form gives the entry it copies.
+    expect(catalogue.byGameMasterId('PIKACHU', 'PIKACHU_ADVENTURE_HAT_2020')?.key).toBe('pikachu');
+    expect(catalogue.byGameMasterId('CORSOLA', 'CORSOLA_SPRING_2026')?.key).toBe(
+      'corsola_galarian',
+    );
+    expect(catalogue.byGameMasterId('LATIAS', 'LATIAS_S')?.key).toBe('latias');
+    // A costume newer than the game master.
     expect(catalogue.byGameMasterId('PIKACHU', 'PIKACHU_GLASS_HELMET_2026')).toBeUndefined();
     // A form id that belongs to another species.
     expect(catalogue.byGameMasterId('PIKACHU', 'RATTATA_ALOLA')).toBeUndefined();
+    expect(catalogue.byGameMasterId('PIKACHU', 'CORSOLA_SPRING_2026')).toBeUndefined();
   });
 
   it('finds moves', () => {
```

`src/domain/pogo/pokebattler.test.ts`:

```diff
--- a/src/domain/pogo/pokebattler.test.ts
+++ b/src/domain/pogo/pokebattler.test.ts
@@ -19,7 +19,8 @@ describe('pokebattlerId', () => {
   });
 
   it('applies the exceptions', () => {
-    expect(pokebattlerId('TORNADUS', null, null)).toBe('TORNADUS_INCARNATE_FORM');
+    expect(pokebattlerId('ARCEUS', null, null)).toBe('ARCEUS_NORMAL_FORM');
+    expect(pokebattlerId('TORNADUS', 'TORNADUS_INCARNATE', null)).toBe('TORNADUS_INCARNATE_FORM');
     expect(pokebattlerId('KYUREM', 'KYUREM_WHITE', null)).toBe('KYUREM_WHITE');
     expect(pokebattlerId('CHERRIM', 'CHERRIM_SUNNY', null)).toBe('CHERRIM');
     expect(pokebattlerId('JANGMO_O', null, null)).toBe('JANGMO-O');
```

`src/domain/pogo/legacy-names.test.ts`:

```diff
--- a/src/domain/pogo/legacy-names.test.ts
+++ b/src/domain/pogo/legacy-names.test.ts
@@ -34,6 +34,29 @@ const LEGACY_POKEBATTLER_ERRORS: Record<string, string> = {
   basculin_white_striped: 'BASCULIN_WHITE_STRIPED_FORM',
 };
 
+/**
+ * Legacy entries under a bare species name whose Pokebattler name was the species id, where the
+ * catalogue now knows the species by its default form and derives `<FORM>_FORM`. Which of the
+ * two Pokebattler accepts is checked when `/counters` is ported (Phase 6).
+ */
+const LEGACY_SPECIES_ID_FOR_DEFAULT_FORM = [
+  'aegislash',
+  'darmanitan',
+  'eiscue',
+  // Listed twice in the legacy data, once with each Pokebattler name.
+  'enamorus',
+  'gourgeist',
+  'hoopa',
+  'indeedee',
+  'koraidon',
+  'lycanroc',
+  'miraidon',
+  'morpeko',
+  'oricorio',
+  'pumpkaboo',
+  'wishiwashi',
+];
+
 describe('legacy names', () => {
   it('maps hand-typed legacy names to catalogue keys', () => {
     expect(keyForLegacyName('nidoran♀')).toBe('nidoran_female');
@@ -43,6 +66,18 @@ describe('legacy names', () => {
     expect(keyForLegacyName(' Venusaur ')).toBe('venusaur');
   });
 
+  it('maps a species the catalogue knows by its default form to that form', () => {
+    expect(keyForLegacyName('landorus')).toBe('landorus_incarnate');
+    expect(keyForLegacyName('Hoopa')).toBe('hoopa_confined');
+    expect(keyForLegacyName('giratina_altered')).toBe('giratina_altered');
+    // The legacy data has only the bare name: that is the row the legacy bot reads.
+    expect(legacyNamesForKey('landorus_incarnate')).toEqual(['landorus', 'landorus_incarnate']);
+    // It has both names: the form's name is the exact match.
+    expect(legacyNamesForKey('hoopa_confined')).toEqual(['hoopa_confined', 'hoopa']);
+    // It has only the form's name.
+    expect(legacyNamesForKey('giratina_altered')).toEqual(['giratina_altered']);
+  });
+
   it('maps back to the name the legacy bot uses', () => {
     expect(legacyNameForKey('nidoran_female')).toBe('nidoran♀');
     expect(legacyNameForKey('mr_mime')).toBe('mr. mime');
@@ -64,9 +99,9 @@ describe('legacy names', () => {
     expect(legacyNamesForKey('venusaur')).toEqual(['venusaur']);
   });
 
-  it('points every alias at a real catalogue entry', () => {
+  it('points every alias at a real catalogue entry, by its own key', () => {
     for (const [legacyName, key] of Object.entries(LEGACY_NAME_ALIASES)) {
-      expect(catalogue.byKey(key), legacyName).toBeDefined();
+      expect(catalogue.byKey(key)?.key, legacyName).toBe(key);
     }
   });
 });
@@ -86,6 +121,17 @@ describe('parity with the legacy data/pokemon.json', () => {
     expect(unknown.sort()).toEqual([...NOT_IN_GAME_MASTER].sort());
   });
 
+  it('gives the key of an entry, never an alias of one, for every legacy name', () => {
+    const aliased = real
+      .map((entry) => entry.name)
+      .filter((name) => {
+        const key = keyForLegacyName(name);
+        const found = catalogue.byKey(key);
+        return found !== undefined && found.key !== key;
+      });
+    expect(aliased).toEqual([]);
+  });
+
   it('round-trips every legacy name to a name the legacy data has', () => {
     const names = new Set(real.map((entry) => entry.name));
     const resolvable = [...names].filter(
@@ -101,22 +147,23 @@ describe('parity with the legacy data/pokemon.json', () => {
     expect(notListed.sort()).toEqual([]);
   });
 
-  it('derives the same Pokebattler name, apart from three legacy errors', () => {
+  it('derives the same Pokebattler name, apart from three legacy errors and the default forms', () => {
     const different: Record<string, string> = {};
+    const speciesIdInLegacy: string[] = [];
     for (const entry of real) {
       const pokemon = catalogue.byKey(keyForLegacyName(entry.name));
-      if (!pokemon || entry.pbName === undefined) continue;
-      // The legacy data lists Enamorus twice, once under each of its two names.
-      if (pokemon.pokebattlerId !== entry.pbName && entry.pbName !== pokemon.pokemonId) {
-        different[pokemon.key] = pokemon.pokebattlerId;
-      }
+      if (!pokemon || entry.pbName === undefined || pokemon.pokebattlerId === entry.pbName)
+        continue;
+      if (entry.pbName === pokemon.pokemonId) speciesIdInLegacy.push(entry.name);
+      else different[pokemon.key] = pokemon.pokebattlerId;
     }
     expect(different).toEqual(LEGACY_POKEBATTLER_ERRORS);
+    expect(speciesIdInLegacy.sort()).toEqual(LEGACY_SPECIES_ID_FOR_DEFAULT_FORM);
   });
 
   it('needs every Pokebattler exception it lists', () => {
     for (const key of Object.keys(POKEBATTLER_EXCEPTIONS)) {
-      expect(catalogue.byKey(key), key).toBeDefined();
+      expect(catalogue.byKey(key)?.key, key).toBe(key);
     }
   });
 });
```

`src/domain/pogo/nicknames.test.ts`:

```diff
--- a/src/domain/pogo/nicknames.test.ts
+++ b/src/domain/pogo/nicknames.test.ts
@@ -14,9 +14,9 @@ describe('curated nicknames', () => {
     expect(CURATED_NICKNAMES['unown_a']).toEqual(['a']);
   });
 
-  it('is keyed by catalogue keys only', () => {
+  it('is keyed by the keys of catalogue entries, never by an alias', () => {
     for (const key of Object.keys(CURATED_NICKNAMES)) {
-      expect(catalogue.byKey(key), key).toBeDefined();
+      expect(catalogue.byKey(key)?.key, key).toBe(key);
     }
   });
 
```

`src/services/game-data-service.test.ts`:

```diff
--- a/src/services/game-data-service.test.ts
+++ b/src/services/game-data-service.test.ts
@@ -312,12 +312,15 @@ describe('GameDataService', () => {
       data: Record<string, unknown>;
     };
     const { moves: _moves, ...withoutMoves } = saved.data;
-    await writeFile(cachePath, JSON.stringify({ ...saved, data: withoutMoves }));
-    requests = [];
-    const { gameData } = service();
-    await gameData.load();
-    expect(requests).toHaveLength(2);
-    expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
+    const { aliases: _aliases, ...withoutAliases } = saved.data;
+    for (const data of [withoutMoves, withoutAliases]) {
+      await writeFile(cachePath, JSON.stringify({ ...saved, data }));
+      requests = [];
+      const { gameData } = service();
+      await gameData.load();
+      expect(requests).toHaveLength(2);
+      expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
+    }
   });
 
   it('downloads when the saved copy is dated in the future, and uses it only if that fails', async () => {
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --project unit src/domain/pogo src/services`
Expected: FAIL. Among the failures: "knows a species with a named default form by that form alone", "lists costumes and appearance-only forms as aliases of the entry they copy", "resolves an alias to the entry it stands for", "maps a species the catalogue knows by its default form to that form", and the shape test (`GAME_DATA_VERSION` is still 2).

- [ ] **Step 3: Change the parser**

`src/domain/pogo/game-master.ts`:

```diff
--- a/src/domain/pogo/game-master.ts
+++ b/src/domain/pogo/game-master.ts
@@ -16,8 +16,15 @@ export interface PokemonEntry {
   dex: number;
   /** Game-master species id, e.g. `VENUSAUR`, `NIDORAN_FEMALE`. */
   pokemonId: string;
-  /** Game-master form id, e.g. `RATTATA_ALOLA`; null for the species entry and for megas. */
+  /**
+   * Game-master form id, e.g. `RATTATA_ALOLA`; null for megas and for a species that has no
+   * form of its own to be known by.
+   */
   form: string | null;
+  /**
+   * `species` is the entry that stands for the species. For a species known by its default form
+   * (Giratina, Landorus) that is the form's entry, so `form` is set and the name says the form.
+   */
   kind: 'species' | 'regional' | 'form' | 'mega';
   tempEvolution: TempEvolution | null;
   /** English display name, e.g. `Alolan Rattata`, `Giratina (Origin Forme)`, `Mega Charizard X`. */
@@ -52,11 +59,18 @@ export interface Move {
  * Bump on ANY change to what `parseGameMaster` produces: the shape of `GameData`, or the rules
  * that decide its contents. A saved cache with another version is discarded.
  */
-export const GAME_DATA_VERSION = 2;
+export const GAME_DATA_VERSION = 3;
 
 /** Everything Pine derives from the game master and text file. JSON-serialisable. */
 export interface GameData {
   pokemon: PokemonEntry[];
+  /**
+   * Lower-cased game-master ids that are not entries of their own, each with the key of the
+   * entry it stands for: the id of a species known by its default form (`landorus` to
+   * `landorus_incarnate`), and costumes and appearance-only forms (`pikachu_copy_2019` to
+   * `pikachu`). `_NORMAL` form ids are not listed; `PokemonCatalogue.byGameMasterId` knows them.
+   */
+  aliases: Record<string, string>;
   moves: Move[];
   /** typeChart[attacker][defender] = damage multiplier. */
   typeChart: Record<PokemonType, Record<PokemonType, number>>;
@@ -111,6 +125,17 @@ const COSMETIC_FORMS = new Set([
   'LATIAS_S',
   'LATIOS_S',
 ]);
+/**
+ * The default form of species whose formless item copies no single form, so the data cannot say
+ * which form the bare species is: Zacian's and Zamazenta's formless items have the Hero stats
+ * with the Crowned types, and Meloetta's and Wormadam's lack moves their default form has.
+ */
+const DEFAULT_FORMS: Readonly<Record<string, string>> = {
+  WORMADAM: 'WORMADAM_PLANT',
+  MELOETTA: 'MELOETTA_ARIA',
+  ZACIAN: 'ZACIAN_HERO',
+  ZAMAZENTA: 'ZAMAZENTA_HERO',
+};
 const TEMP_EVOLUTIONS: Record<string, TempEvolution> = {
   TEMP_EVOLUTION_MEGA: 'MEGA',
   TEMP_EVOLUTION_MEGA_X: 'MEGA_X',
@@ -146,6 +171,20 @@ function sameStatsAndTypes(a: Raw, b: Raw): boolean {
   );
 }
 
+/** Whether two entries are the same Pokémon in everything but name. */
+function sameData(a: PokemonEntry, b: PokemonEntry): boolean {
+  const data = (entry: PokemonEntry): string =>
+    JSON.stringify([
+      entry.stats,
+      entry.types,
+      entry.fastMoves,
+      entry.chargedMoves,
+      entry.eliteFastMoves,
+      entry.eliteChargedMoves,
+    ]);
+  return data(a) === data(b);
+}
+
 function parseMoves(items: Raw[], texts: Map<string, string>): Move[] {
   const moves: Move[] = [];
   for (const item of items) {
@@ -295,6 +334,10 @@ export function parseGameMaster(
     keys.add(entry.key);
     entries.push(entry);
   };
+  const aliases = new Map<string, string>();
+  const alias = (id: string, key: string): void => {
+    aliases.set(id.toLowerCase(), key);
+  };
   for (const [pokemonId, forms] of bySpecies) {
     const suffixOf = (form: string): string =>
       form.startsWith(`${pokemonId}_`)
@@ -350,42 +393,74 @@ export function parseGameMaster(
       pokebattlerId: pokebattlerId(pokemonId, identity.form, identity.tempEvolution),
     });
 
-    add(
-      build(
-        normal.settings,
-        { key: pokemonId.toLowerCase(), form: null, kind: 'species', tempEvolution: null },
-        'species',
-        null,
-      ),
-    );
-
+    const isCostume = (pokemon: RawPokemon): boolean =>
+      pokemon.form !== null && costumes.has(`${pokemonId}|${pokemon.form}`);
+    const real: { pokemon: RawPokemon; form: string; suffix: string }[] = [];
+    /** Costumes and appearance-only forms, each with the item it looks like. */
+    const copies: { form: string; of: RawPokemon | undefined }[] = [];
     for (const pokemon of forms) {
       if (pokemon.form === null) continue;
       const suffix = suffixOf(pokemon.form);
-      if (suffix === 'NORMAL' || COSMETIC_FORMS.has(pokemon.form)) continue;
-      // A flagged costume that copies any real item of its species is dropped; one with its own
-      // stats or types is a real form (Armored Mewtwo).
-      if (
-        costumes.has(`${pokemonId}|${pokemon.form}`) &&
-        forms.some(
-          (other) =>
-            other !== pokemon &&
-            !(other.form !== null && costumes.has(`${pokemonId}|${other.form}`)) &&
-            sameStatsAndTypes(pokemon.settings, other.settings),
-        )
-      ) {
+      if (suffix === 'NORMAL') continue;
+      if (COSMETIC_FORMS.has(pokemon.form)) {
+        copies.push({ form: pokemon.form, of: undefined });
         continue;
       }
-      const regional = REGIONS.includes(suffix.split('_')[0] ?? '');
-      const kind = regional ? 'regional' : 'form';
-      add(
-        build(
-          pokemon.settings,
-          { key: pokemon.form.toLowerCase(), form: pokemon.form, kind, tempEvolution: null },
-          kind,
-          suffix,
-        ),
+      // A flagged costume that copies any real item of its species is not an entry; one with its
+      // own stats or types is a real form (Armored Mewtwo).
+      const original = isCostume(pokemon)
+        ? forms.find(
+            (other) =>
+              other !== pokemon &&
+              !isCostume(other) &&
+              sameStatsAndTypes(pokemon.settings, other.settings),
+          )
+        : undefined;
+      if (original) copies.push({ form: pokemon.form, of: original });
+      else real.push({ pokemon, form: pokemon.form, suffix });
+    }
+
+    const plain = build(
+      normal.settings,
+      { key: pokemonId.toLowerCase(), form: null, kind: 'species', tempEvolution: null },
+      'species',
+      null,
+    );
+    const formEntries = real.map(({ pokemon, form, suffix }) => {
+      const kind = REGIONS.includes(suffix.split('_')[0] ?? '') ? 'regional' : 'form';
+      return build(
+        pokemon.settings,
+        { key: form.toLowerCase(), form, kind, tempEvolution: null },
+        kind,
+        suffix,
       );
+    });
+
+    // One identity per form: a species with no NORMAL form whose bare item is a copy of exactly
+    // one of its forms (Giratina and its Altered Forme) is known by that form, and the species
+    // id becomes an alias of it. Species whose forms are all alike (Unown, Vivillon) keep the
+    // bare entry.
+    let standIn: PokemonEntry | undefined;
+    if (!normalForm) {
+      const identical = formEntries.filter((entry) => sameData(entry, plain));
+      standIn =
+        formEntries.find((entry) => entry.form === DEFAULT_FORMS[pokemonId]) ??
+        (identical.length === 1 ? identical[0] : undefined);
+    }
+    if (standIn) {
+      standIn.kind = 'species';
+      standIn.shadow ||= plain.shadow;
+      alias(pokemonId, standIn.key);
+    } else {
+      add(plain);
+    }
+    for (const entry of formEntries) add(entry);
+
+    const speciesKey = standIn?.key ?? plain.key;
+    for (const copy of copies) {
+      const original = copy.of?.form;
+      const isEntry = formEntries.some((entry) => entry.form === original);
+      alias(copy.form, original && isEntry ? original.toLowerCase() : speciesKey);
     }
 
     for (const override of list(base.settings['tempEvoOverrides']).map(record)) {
@@ -432,6 +507,12 @@ export function parseGameMaster(
   return {
     // A plain code-unit comparison keeps the order the same on every host.
     pokemon: entries.sort((a, b) => a.dex - b.dex || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
+    // An id that is also an entry is not an alias; neither is one whose entry was dropped.
+    aliases: Object.fromEntries(
+      [...aliases]
+        .filter(([id, key]) => !keys.has(id) && keys.has(key))
+        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
+    ),
     moves,
     typeChart: parseTypeChart(withData('typeEffective')),
     weatherBoosts: parseWeatherBoosts(weatherItems),
```

What the loop over a species now does, in order: sort its game-master items into real forms and copies (costumes and appearance-only forms); build the bare entry and one entry per real form; choose the stand-in (the form named in `DEFAULT_FORMS`, otherwise the only form with the same data as the bare entry, and only when the species has no `_NORMAL` form); add either the stand-in's alias or the bare entry; add the forms; record an alias for every copy; then the megas, as before.

- [ ] **Step 4: Change the catalogue, the Pokebattler exceptions, the legacy names and the cache check**

`src/domain/pogo/catalogue.ts`:

```diff
--- a/src/domain/pogo/catalogue.ts
+++ b/src/domain/pogo/catalogue.ts
@@ -16,6 +16,7 @@ export interface Weakness {
 /** Read-only lookups over the parsed game data. */
 export class PokemonCatalogue {
   private readonly keys = new Map<string, PokemonEntry>();
+  private readonly aliases: Map<string, string>;
   private readonly dexes = new Map<number, PokemonEntry[]>();
   private readonly moves = new Map<string, Move>();
 
@@ -24,6 +25,7 @@ export class PokemonCatalogue {
       this.keys.set(entry.key, entry);
       this.dexes.set(entry.dex, [...(this.dexes.get(entry.dex) ?? []), entry]);
     }
+    this.aliases = new Map(Object.entries(data.aliases));
     for (const move of data.moves) this.moves.set(move.id, move);
   }
 
@@ -31,9 +33,14 @@ export class PokemonCatalogue {
     return this.data.pokemon;
   }
 
-  /** By catalogue key, e.g. `rattata_alola`. Case-insensitive. */
+  /**
+   * By catalogue key, e.g. `rattata_alola`, or by an alias of one (`GameData.aliases`): `landorus`
+   * gives the entry `landorus_incarnate`. Case-insensitive. Use the `key` of the entry returned,
+   * not the text looked up, as the Pokémon's identity.
+   */
   byKey(key: string): PokemonEntry | undefined {
-    return this.keys.get(key.toLowerCase());
+    const lower = key.toLowerCase();
+    return this.keys.get(lower) ?? this.keys.get(this.aliases.get(lower) ?? lower);
   }
 
   /** Every entry of a species: the species itself, its forms and its megas. */
@@ -41,7 +48,7 @@ export class PokemonCatalogue {
     return this.dexes.get(dex) ?? [];
   }
 
-  /** The species entry for a Pokédex number. */
+  /** The entry that stands for a Pokédex number: the species, or the form it is known by. */
   species(dex: number): PokemonEntry | undefined {
     return this.byDex(dex).find((entry) => entry.kind === 'species');
   }
@@ -51,10 +58,12 @@ export class PokemonCatalogue {
    * raid feed sends a mega either as a temporary evolution or as a form string such as
    * `BLASTOISE_MEGA`; both work. A form id
    * ending in `_NORMAL` means the species itself (`MEWTWO_NORMAL`, and `NIDORAN_NORMAL` for
-   * `NIDORAN_FEMALE`, whose form id does not repeat its pokemon id).
+   * `NIDORAN_FEMALE`, whose form id does not repeat its pokemon id). The id of a costume or an
+   * appearance-only form gives the entry it copies, and the id of a species known by its
+   * default form gives that form's entry (see `GameData.aliases`).
    *
-   * An unknown form (a costume, or a form newer than the game master) returns undefined. A
-   * caller that wants the nearest thing falls back to `byGameMasterId(pokemonId)`.
+   * A form newer than the game master returns undefined. A caller that wants the nearest thing
+   * falls back to `byGameMasterId(pokemonId)`.
    */
   byGameMasterId(
     pokemonId: string,
```

`src/domain/pogo/pokebattler.ts` (the five removed species are now known by a form whose name the `<form>_FORM` rule already gives):

```diff
--- a/src/domain/pogo/pokebattler.ts
+++ b/src/domain/pogo/pokebattler.ts
@@ -5,13 +5,8 @@ import type { TempEvolution } from './types.js';
  * names the legacy bot used (data/pokemon.json `pbName`), keyed by catalogue key.
  */
 export const POKEBATTLER_EXCEPTIONS: Readonly<Record<string, string>> = {
-  // The species entry stands for a named default form.
+  // Pokebattler names the species by its NORMAL form.
   arceus: 'ARCEUS_NORMAL_FORM',
-  tornadus: 'TORNADUS_INCARNATE_FORM',
-  thundurus: 'THUNDURUS_INCARNATE_FORM',
-  landorus: 'LANDORUS_INCARNATE_FORM',
-  enamorus: 'ENAMORUS_INCARNATE_FORM',
-  meloetta: 'MELOETTA_ARIA_FORM',
   // Forms Pokebattler names without the _FORM suffix.
   kyurem_white: 'KYUREM_WHITE',
   kyurem_black: 'KYUREM_BLACK',
```

`src/domain/pogo/legacy-names.ts`:

```diff
--- a/src/domain/pogo/legacy-names.ts
+++ b/src/domain/pogo/legacy-names.ts
@@ -20,6 +20,27 @@ export const LEGACY_NAME_ALIASES: Readonly<Record<string, string>> = {
   perrserker_normal: 'perrserker',
   runerigus_normal: 'runerigus',
   oinkologne_normal: 'oinkologne',
+  // The catalogue knows these species by their default form (one identity per form); the legacy
+  // data listed them under the bare species name.
+  darmanitan: 'darmanitan_standard',
+  tornadus: 'tornadus_incarnate',
+  thundurus: 'thundurus_incarnate',
+  landorus: 'landorus_incarnate',
+  meloetta: 'meloetta_aria',
+  aegislash: 'aegislash_shield',
+  pumpkaboo: 'pumpkaboo_small',
+  gourgeist: 'gourgeist_small',
+  hoopa: 'hoopa_confined',
+  oricorio: 'oricorio_baile',
+  lycanroc: 'lycanroc_midday',
+  wishiwashi: 'wishiwashi_solo',
+  eiscue: 'eiscue_ice',
+  indeedee: 'indeedee_male',
+  morpeko: 'morpeko_full_belly',
+  enamorus: 'enamorus_incarnate',
+  palafin: 'palafin_zero',
+  koraidon: 'koraidon_apex',
+  miraidon: 'miraidon_ultimate',
 };
 
 /**
@@ -27,11 +48,16 @@ export const LEGACY_NAME_ALIASES: Readonly<Record<string, string>> = {
  * spelling. The legacy bot matches rows to its data by exact string, so case matters: the data
  * has no `deoxys`, only `deoxys_normal`, and spells the female Oinkologne in upper case. The
  * four other species the data lists under both names (obstagoon, perrserker, runerigus,
- * oinkologne) are not here: they use the plain name.
+ * oinkologne) are not here: they use the plain name. The last four are default forms the data
+ * lists under the form's name as well as the species name: the form's name is the exact match.
  */
 const PREFERRED_LEGACY_NAMES: Readonly<Record<string, string>> = {
   deoxys: 'deoxys_normal',
   oinkologne_female: 'OINKOLOGNE_FEMALE',
+  pumpkaboo_small: 'pumpkaboo_small',
+  gourgeist_small: 'gourgeist_small',
+  hoopa_confined: 'hoopa_confined',
+  palafin_zero: 'palafin_zero',
 };
 
 /** Every alias, grouped by the key it stands for, in the order of `LEGACY_NAME_ALIASES`. */
```

`src/services/game-data-service.ts` (a saved copy without `aliases` is not usable):

```diff
--- a/src/services/game-data-service.ts
+++ b/src/services/game-data-service.ts
@@ -280,6 +280,8 @@ export class GameDataService implements GameDataProvider {
         typeof cache.fetchedAt !== 'number' ||
         !Array.isArray(data?.pokemon) ||
         data.pokemon.length === 0 ||
+        typeof data.aliases !== 'object' ||
+        data.aliases === null ||
         !Array.isArray(data.moves) ||
         data.moves.length === 0 ||
         !Array.isArray(data.cpMultipliers) ||
```

- [ ] **Step 5: Regenerate the game-data fixture**

Run: `npm run fixtures:game-data` (no `--download`: it must rebuild from the game master already in `var/game-data-source/`).
Expected output: `Wrote 311 sample items, 430 texts and the parsed snapshot to …test/fixtures`.

Then check: `git status --short test/fixtures` must list only `test/fixtures/game-data.json` as modified (the two sample files are unchanged). If `var/game-data-source/gamemaster.json` is missing, stop and report it; do not download.

Run: `node -e "const d=require('./test/fixtures/game-data.json');console.log(d.pokemon.length,Object.keys(d.aliases).length,d.pokemon.filter(p=>p.kind==='species'&&p.form).length)"`
Expected: `1431 133 25`

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --project unit src/domain/pogo src/services`
Expected: PASS, no failures.

If "derives the same Pokebattler name, apart from three legacy errors and the default forms" fails, do not edit the expected list: report the difference.

- [ ] **Step 7: Record the convention in `CLAUDE.md`**

In the "Conventions" list, directly after the line that begins "- A Pokémon is identified by its catalogue key", add this line:

```markdown
- One identity per form: a species with a named default form is known by that form (`giratina_altered`, `landorus_incarnate`; there is no `giratina` entry). `catalogue.byKey` and `byGameMasterId` also accept aliases (the bare species id, costumes, appearance-only forms), so store the `key` of the entry they return, never the text that was looked up.
```

- [ ] **Step 8: Format, check and commit**

```bash
npx prettier --write src/domain/pogo src/services
npm run check
git add src/domain/pogo src/services test/fixtures/game-data.json CLAUDE.md
git commit -m "One identity per form: default forms stand for their species; aliases for species ids, costumes and cosmetic forms" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 384 unit tests.

---

### Task 2: Reading the raid boss feed

**Files:**
- Create: `src/domain/pogo/raid-boss-feed.ts`, `src/domain/pogo/raid-boss-feed.test.ts`, `test/support/raid-bosses.ts`, `test/fixtures/raid-boss-feed.json`
- Modify: `src/domain/pogo/raid-tier.ts`, `raid-tier.test.ts`, `notification-target.ts`, `notification-target.test.ts`

**Interfaces:**
- Consumes: `RaidTier`, `raidTier`, `RAID_LEVELS` from `./raid-tier.js`.
- Produces:
  - `RaidLevel` gains `'SuperMega'` (after `'MegaLegendary'` in `RAID_LEVELS`), label `Super Mega`, standard durations; notification code -7.
  - `interface FeedBoss { pokemonId: string; form: string | null; tier: RaidTier; shiny: boolean; name: string }`
  - `interface ParsedFeed { bosses: FeedBoss[]; unknownLevels: string[] }`
  - `parseRaidBossFeed(raw: unknown): ParsedFeed`: throws an `Error` whose message starts "The raid boss feed is not in the expected format" or is "The raid boss feed lists no bosses".
  - `readRaidBossFeed(): unknown` in `test/support/raid-bosses.ts`.

The feed is `raidboss.json` of pokemon-go-api. Its `currentList` maps a level key to a list of bosses; each boss has `id` (game-master species id), `form` (form id; the species id again when there is no form; `BLASTOISE_MEGA` for a mega), `shiny`, `names.English`, and other fields Pine ignores (`costume`, `assets`, `types`, `counter`, `weather`, `cpRange`, `battleResult`).

- [ ] **Step 1: Add the super mega raid level**

Super mega raids are tier 7 in the game. Change the tests first.

`src/domain/pogo/raid-tier.test.ts`:

```diff
--- a/src/domain/pogo/raid-tier.test.ts
+++ b/src/domain/pogo/raid-tier.test.ts
@@ -11,7 +11,17 @@ import {
 
 describe('raid tiers', () => {
   it('names every level', () => {
-    expect(RAID_LEVELS).toEqual(['T1', 'T3', 'T5', 'Mega', 'MegaLegendary', 'Elite', 'EX']);
+    expect(RAID_LEVELS).toEqual([
+      'T1',
+      'T3',
+      'T5',
+      'Mega',
+      'MegaLegendary',
+      'SuperMega',
+      'Elite',
+      'EX',
+    ]);
+    expect(isRaidLevel('SuperMega')).toBe(true);
     expect(isRaidLevel('T5')).toBe(true);
     expect(isRaidLevel('T2')).toBe(false);
   });
@@ -21,17 +31,19 @@ describe('raid tiers', () => {
     expect(raidTier('T1')).toEqual({ level: 'T1', shadow: false });
     expect(raidTier('Mega', true)).toBeUndefined();
     expect(raidTier('EX', true)).toBeUndefined();
+    expect(raidTier('SuperMega', true)).toBeUndefined();
   });
 
   it('labels tiers for people', () => {
     expect(raidTierLabel({ level: 'T5', shadow: false })).toBe('T5');
     expect(raidTierLabel({ level: 'T3', shadow: true })).toBe('Shadow T3');
     expect(raidTierLabel({ level: 'MegaLegendary', shadow: false })).toBe('Mega Legendary');
+    expect(raidTierLabel({ level: 'SuperMega', shadow: false })).toBe('Super Mega');
   });
 
   it('knows the boss stamina of each level', () => {
     expect(RAID_LEVELS.map((level) => bossStamina({ level, shadow: false }))).toEqual([
-      600, 3600, 15000, 9000, 22500, 20000, 15000,
+      600, 3600, 15000, 9000, 22500, 22500, 20000, 15000,
     ]);
     expect(bossStamina({ level: 'T5', shadow: true })).toBe(15000);
   });
@@ -39,6 +51,7 @@ describe('raid tiers', () => {
   it('knows which durations apply', () => {
     expect(raidDurationKind({ level: 'T5', shadow: true })).toBe('standard');
     expect(raidDurationKind({ level: 'Mega', shadow: false })).toBe('standard');
+    expect(raidDurationKind({ level: 'SuperMega', shadow: false })).toBe('standard');
     expect(raidDurationKind({ level: 'Elite', shadow: false })).toBe('elite');
     expect(raidDurationKind({ level: 'EX', shadow: false })).toBe('exclusive');
   });
```

`src/domain/pogo/notification-target.test.ts`:

```diff
--- a/src/domain/pogo/notification-target.test.ts
+++ b/src/domain/pogo/notification-target.test.ts
@@ -74,10 +74,16 @@ describe('notification codec: legacy rows', () => {
     expect(decodeNotification({ pokemon: -7, type: 'spawn' })).toBeUndefined();
   });
 
+  it('reads -7 as the super mega tier (tier 7 in the game), for a raid row only', () => {
+    expect(decodeNotification({ pokemon: -7, type: 'raid' })).toEqual(tier('SuperMega'));
+    expect(decodeNotification({ pokemon: -7, type: 'Both' })).toEqual(tier('SuperMega'));
+    expect(encodeNotification(tier('SuperMega'), 'both')).toEqual({ pokemon: -7, type: 'raid' });
+  });
+
   it('returns undefined for values it does not know', () => {
     expect(decodeNotification({ pokemon: 0, type: 'both' })).toBeUndefined();
     expect(decodeNotification({ pokemon: -2, type: 'raid' })).toBeUndefined();
-    expect(decodeNotification({ pokemon: -7, type: 'raid' })).toBeUndefined();
+    expect(decodeNotification({ pokemon: -9, type: 'raid' })).toBeUndefined();
     expect(decodeNotification({ pokemon: -5, type: 'spawn' })).toBeUndefined();
     expect(decodeNotification({ pokemon: 1.5, type: 'both' })).toBeUndefined();
   });
```

Run: `npx vitest run --project unit src/domain/pogo/raid-tier.test.ts src/domain/pogo/notification-target.test.ts`
Expected: FAIL ("names every level", "reads -7 as the super mega tier …").

`src/domain/pogo/raid-tier.ts`:

```diff
--- a/src/domain/pogo/raid-tier.ts
+++ b/src/domain/pogo/raid-tier.ts
@@ -1,7 +1,19 @@
 import type { RaidKind } from '../time/party-time.js';
 
-/** The kinds of raid. Shadow raids are a flag on top of T1, T3 and T5. */
-export const RAID_LEVELS = ['T1', 'T3', 'T5', 'Mega', 'MegaLegendary', 'Elite', 'EX'] as const;
+/**
+ * The kinds of raid. Shadow raids are a flag on top of T1, T3 and T5. In the game a mega
+ * legendary raid is tier 6 and a super mega raid tier 7.
+ */
+export const RAID_LEVELS = [
+  'T1',
+  'T3',
+  'T5',
+  'Mega',
+  'MegaLegendary',
+  'SuperMega',
+  'Elite',
+  'EX',
+] as const;
 export type RaidLevel = (typeof RAID_LEVELS)[number];
 
 export interface RaidTier {
@@ -18,17 +30,22 @@ const LABELS: Readonly<Record<RaidLevel, string>> = {
   T5: 'T5',
   Mega: 'Mega',
   MegaLegendary: 'Mega Legendary',
+  SuperMega: 'Super Mega',
   Elite: 'Elite',
   EX: 'EX',
 };
 
-/** Stamina the game gives a boss of each level, which sets the CP shown on the boss. */
+/**
+ * Stamina the game gives a boss of each level, which sets the CP shown on the boss. The value for
+ * a super mega raid is the mega legendary one until the real figure is known.
+ */
 const BOSS_STAMINA: Readonly<Record<RaidLevel, number>> = {
   T1: 600,
   T3: 3600,
   T5: 15000,
   Mega: 9000,
   MegaLegendary: 22500,
+  SuperMega: 22500,
   Elite: 20000,
   EX: 15000,
 };
@@ -40,6 +57,7 @@ const DURATION_KIND: Readonly<Record<RaidLevel, RaidKind>> = {
   T5: 'standard',
   Mega: 'standard',
   MegaLegendary: 'standard',
+  SuperMega: 'standard',
   Elite: 'elite',
   EX: 'exclusive',
 };
```

`src/domain/pogo/notification-target.ts`:

```diff
--- a/src/domain/pogo/notification-target.ts
+++ b/src/domain/pogo/notification-target.ts
@@ -51,6 +51,10 @@ export function parseNotificationScope(value: string): NotificationScope | undef
  * tier 5 raids (it had no shadow concept), and EX raids notified nobody. The codec reads -5 as
  * tier 5 only; widening the match for existing rows is a decision for the notification matcher.
  *
+ * A super mega raid is tier 7 in the game, so it is -7, the next number of the legacy scheme; the
+ * legacy bot never wrote it for a raid (production has one stray `(-7, spawn)` row, which stays
+ * unreadable, like every tier typed `spawn`).
+ *
  * Elite, EX and shadow tiers had no legacy number. They get the values below (-20, -21, -31,
  * -33, -35), which never match in the legacy bot's raid or spawn lookups. A row holding one does
  * break the legacy `!wants` listing for that member, so a rollback must first remove the rows
@@ -62,6 +66,7 @@ const TIER_CODES: ReadonlyArray<readonly [number, RaidLevel, boolean]> = [
   [-5, 'T5', false],
   [-4, 'Mega', false],
   [-6, 'MegaLegendary', false],
+  [-7, 'SuperMega', false],
   [-20, 'Elite', false],
   [-21, 'EX', false],
   [-31, 'T1', true],
```

Run the same command again. Expected: PASS.

- [ ] **Step 1b: Commit the feed fixture**

```bash
cp var/game-data-source/raidboss.json test/fixtures/raid-boss-feed.json
sha256sum test/fixtures/raid-boss-feed.json
```

Expected hash: `9a77120634ebffa784244d0cb44f8c7892147d199612ed050c1b230c01d55505`. If the source file is missing or the hash differs, stop and report it; do not download. (`test/fixtures/` is ignored by Prettier; do not format the file.)

- [ ] **Step 2: Write the test support and the failing test**

`test/support/raid-bosses.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');

/**
 * The raid boss feed as downloaded on 2026-10-10: 14 bosses in seven levels, among them a mega,
 * a shadow boss with a named form and a costume newer than the game-data fixture.
 */
export function readRaidBossFeed(): unknown {
  return JSON.parse(readFileSync(path.join(fixtures, 'raid-boss-feed.json'), 'utf8'));
}
```

`src/domain/pogo/raid-boss-feed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readRaidBossFeed } from '../../../test/support/raid-bosses.js';
import { parseRaidBossFeed } from './raid-boss-feed.js';
import { RAID_LEVELS, raidTier } from './raid-tier.js';

function feed(currentList: Record<string, unknown>): unknown {
  return { currentList };
}

function boss(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, form: id, shiny: false, names: { English: id.toLowerCase() }, ...extra };
}

describe('parseRaidBossFeed: the feed as downloaded', () => {
  const { bosses, unknownLevels } = parseRaidBossFeed(readRaidBossFeed());

  it('lists every boss with its tier, shiny flag and English name', () => {
    expect(bosses).toHaveLength(14);
    expect(unknownLevels).toEqual([]);
    expect(bosses.find((b) => b.pokemonId === 'YVELTAL')).toEqual({
      pokemonId: 'YVELTAL',
      form: null,
      tier: { level: 'T5', shadow: false },
      shiny: true,
      name: 'Yveltal',
    });
  });

  it('keeps the form id of a mega, a named form and a costume', () => {
    expect(bosses.find((b) => b.pokemonId === 'BLASTOISE')).toMatchObject({
      form: 'BLASTOISE_MEGA',
      tier: { level: 'Mega', shadow: false },
      name: 'Mega Blastoise',
    });
    expect(bosses.find((b) => b.pokemonId === 'LANDORUS')).toMatchObject({
      form: 'LANDORUS_INCARNATE',
      tier: { level: 'T5', shadow: true },
    });
    expect(bosses.find((b) => b.pokemonId === 'PIKACHU')?.form).toBe('PIKACHU_GLASS_HELMET_2026');
  });

  it('gives every boss a tier that exists', () => {
    for (const { tier, pokemonId } of bosses) {
      expect(raidTier(tier.level, tier.shadow), pokemonId).toEqual(tier);
    }
    expect(bosses.filter((b) => b.tier.shadow).map((b) => b.pokemonId)).toEqual([
      'LANDORUS',
      'PRIMEAPE',
      'KIRLIA',
      'DRAPION',
      'GASTLY',
      'TOTODILE',
      'SHIELDON',
      'GIBLE',
    ]);
  });
});

describe('parseRaidBossFeed: level keys', () => {
  it('maps every level key of the feed to a raid tier', () => {
    const keys = [
      'lvl1',
      'lvl3',
      'lvl5',
      'ultra_beast',
      'mega',
      'legendary_mega',
      'primal',
      'super_mega',
      'ex',
      'shadow_lvl1',
      'shadow_lvl3',
      'shadow_lvl5',
    ];
    const list = Object.fromEntries(keys.map((key, index) => [key, [boss(`BOSS_${index}`)]]));
    const { bosses, unknownLevels } = parseRaidBossFeed(feed(list));
    expect(unknownLevels).toEqual([]);
    expect(bosses.map((b) => `${b.tier.shadow ? 'shadow ' : ''}${b.tier.level}`)).toEqual([
      'T1',
      'T3',
      'T5',
      'T5',
      'Mega',
      'MegaLegendary',
      'MegaLegendary',
      'SuperMega',
      'EX',
      'shadow T1',
      'shadow T3',
      'shadow T5',
    ]);
    for (const { tier } of bosses) expect(RAID_LEVELS).toContain(tier.level);
  });

  it('leaves out the bosses of a level it does not know and reports the key', () => {
    const { bosses, unknownLevels } = parseRaidBossFeed(
      feed({
        lvl5: [boss('YVELTAL')],
        lvl6: [boss('RAYQUAZA')],
        constructor: [boss('MEW')],
        lvl9: [],
      }),
    );
    expect(bosses.map((b) => b.pokemonId)).toEqual(['YVELTAL']);
    expect(unknownLevels).toEqual(['lvl6', 'constructor']);
  });

  it('gives each boss its own tier object', () => {
    const { bosses } = parseRaidBossFeed(feed({ lvl5: [boss('YVELTAL'), boss('XERNEAS')] }));
    expect(bosses[0]?.tier).not.toBe(bosses[1]?.tier);
  });
});

describe('parseRaidBossFeed: forms and duplicates', () => {
  it('reads a form equal to the species id, null or missing as no form', () => {
    const { bosses } = parseRaidBossFeed(
      feed({
        lvl1: [
          boss('STARMIE'),
          boss('UMBREON', { form: null }),
          { id: 'KIRLIA', shiny: true, names: { English: 'Kirlia' } },
        ],
      }),
    );
    expect(bosses.map((b) => b.form)).toEqual([null, null, null]);
  });

  it('keeps a boss listed twice in one tier once, and in two tiers twice', () => {
    const { bosses } = parseRaidBossFeed(
      feed({
        lvl3: [boss('STARMIE'), boss('STARMIE', { shiny: true })],
        shadow_lvl3: [boss('STARMIE')],
        lvl5: [boss('GIRATINA', { form: 'GIRATINA_ORIGIN' }), boss('GIRATINA')],
      }),
    );
    expect(bosses.map((b) => [b.pokemonId, b.form, b.tier.level, b.tier.shadow, b.shiny])).toEqual([
      ['STARMIE', null, 'T3', false, false],
      ['STARMIE', null, 'T3', true, false],
      ['GIRATINA', 'GIRATINA_ORIGIN', 'T5', false, false],
      ['GIRATINA', null, 'T5', false, false],
    ]);
  });

  it('trims the English name', () => {
    const { bosses } = parseRaidBossFeed(
      feed({ lvl1: [boss('MR_MIME', { names: { English: ' Mr. Mime ', German: 'Pantimos' } })] }),
    );
    expect(bosses[0]?.name).toBe('Mr. Mime');
  });
});

describe('parseRaidBossFeed: a feed that must not replace the list', () => {
  it.each([
    ['not an object', 'rate limited'],
    ['null', null],
    ['an array', []],
    ['no currentList', { graphics: {} }],
    ['a level that is not a list', feed({ lvl5: { id: 'YVELTAL' } })],
    ['a boss without an id', feed({ lvl5: [{ form: 'X', shiny: true, names: { English: 'X' } }] })],
    ['a boss without an English name', feed({ lvl5: [boss('YVELTAL', { names: {} })] })],
    ['a blank English name', feed({ lvl5: [boss('YVELTAL', { names: { English: '  ' } })] })],
    ['a shiny flag that is not a boolean', feed({ lvl5: [boss('YVELTAL', { shiny: 'yes' })] })],
    ['an id that is not a game-master id', feed({ lvl5: [boss('Yveltal; drop table')] })],
    ['a form that is not a game-master id', feed({ lvl5: [boss('YVELTAL', { form: 'a b' })] })],
    ['an id longer than the column', feed({ lvl5: [boss('A'.repeat(65))] })],
    [
      'a name longer than the column',
      feed({ lvl5: [boss('MEW', { names: { English: 'x'.repeat(101) } })] }),
    ],
  ])('rejects %s', (_what, raw) => {
    expect(() => parseRaidBossFeed(raw)).toThrow(/raid boss feed is not in the expected format/);
  });

  it('says where the feed is wrong', () => {
    expect(() => parseRaidBossFeed(feed({ lvl5: [boss('YVELTAL', { shiny: 'yes' })] }))).toThrow(
      /currentList\.lvl5\.0\.shiny/,
    );
  });

  it.each([
    ['no levels', feed({})],
    ['only empty levels', feed({ lvl1: [], lvl5: [] })],
    ['only levels it does not know', feed({ lvl6: [boss('RAYQUAZA')] })],
  ])('rejects a feed with %s', (_what, raw) => {
    expect(() => parseRaidBossFeed(raw)).toThrow('The raid boss feed lists no bosses');
  });

  it('rejects a level with an absurd number of bosses', () => {
    const many = Array.from({ length: 201 }, (_, index) => boss(`BOSS_${index}`));
    expect(() => parseRaidBossFeed(feed({ lvl1: many }))).toThrow(/expected format/);
  });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run: `npx vitest run --project unit src/domain/pogo/raid-boss-feed.test.ts`
Expected: FAIL, cannot find `./raid-boss-feed.js`.

- [ ] **Step 4: Write the parser**

`src/domain/pogo/raid-boss-feed.ts`:

```ts
import { z } from 'zod';
import type { RaidTier } from './raid-tier.js';

/** A raid boss as the feed lists it. */
export interface FeedBoss {
  /** Game-master species id, e.g. `BLASTOISE`. */
  pokemonId: string;
  /**
   * Game-master form id as the feed gives it, e.g. `LANDORUS_INCARNATE`, or `BLASTOISE_MEGA` for
   * a mega; null when the feed names no form.
   */
  form: string | null;
  tier: RaidTier;
  shiny: boolean;
  /** The feed's English name. Shown only for a Pokémon the game master does not know yet. */
  name: string;
}

export interface ParsedFeed {
  bosses: FeedBoss[];
  /** Level keys of the feed that Pine has no raid level for; their bosses were left out. */
  unknownLevels: string[];
}

/**
 * The feed's level keys (the `RaidLevel` enum of pokemon-go-api, as of 2026-10). An ultra beast
 * is an ordinary tier 5 boss, and a primal raid has the stamina of a mega legendary raid.
 */
const FEED_LEVELS: Readonly<Record<string, RaidTier>> = {
  lvl1: { level: 'T1', shadow: false },
  lvl3: { level: 'T3', shadow: false },
  lvl5: { level: 'T5', shadow: false },
  ultra_beast: { level: 'T5', shadow: false },
  mega: { level: 'Mega', shadow: false },
  legendary_mega: { level: 'MegaLegendary', shadow: false },
  primal: { level: 'MegaLegendary', shadow: false },
  super_mega: { level: 'SuperMega', shadow: false },
  ex: { level: 'EX', shadow: false },
  shadow_lvl1: { level: 'T1', shadow: true },
  shadow_lvl3: { level: 'T3', shadow: true },
  shadow_lvl5: { level: 'T5', shadow: true },
};

/** Game-master ids are upper-case words joined with underscores; the columns hold 64 characters. */
const gameMasterId = z
  .string()
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/);

const feedSchema = z.object({
  currentList: z.record(
    z.string(),
    z
      .array(
        z.object({
          id: gameMasterId,
          form: gameMasterId.nullish(),
          shiny: z.boolean(),
          names: z.object({ English: z.string().trim().min(1).max(100) }),
        }),
      )
      .max(200),
  ),
});

/**
 * Reads the raid boss feed (`raidboss.json` of pokemon-go-api). Throws when the document does
 * not have the expected shape or lists no boss Pine understands, so a broken feed never replaces
 * a good list. A boss listed twice in one tier is kept once.
 */
export function parseRaidBossFeed(raw: unknown): ParsedFeed {
  const parsed = feedSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `The raid boss feed is not in the expected format: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim(),
    );
  }
  const bosses: FeedBoss[] = [];
  const unknownLevels: string[] = [];
  const seen = new Set<string>();
  for (const [levelKey, list] of Object.entries(parsed.data.currentList)) {
    // `Object.hasOwn`: a key such as `constructor` must not find something on the prototype.
    const tier = Object.hasOwn(FEED_LEVELS, levelKey) ? FEED_LEVELS[levelKey] : undefined;
    if (!tier) {
      if (list.length > 0) unknownLevels.push(levelKey);
      continue;
    }
    for (const boss of list) {
      // The feed repeats the species id as the form of a Pokémon that has no form.
      const form = boss.form == null || boss.form === boss.id ? null : boss.form;
      const identity = `${boss.id}|${form ?? ''}|${tier.level}|${String(tier.shadow)}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      bosses.push({
        pokemonId: boss.id,
        form,
        tier: { ...tier },
        shiny: boss.shiny,
        name: boss.names.English,
      });
    }
  }
  if (bosses.length === 0) throw new Error('The raid boss feed lists no bosses');
  return { bosses, unknownLevels };
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run --project unit src/domain/pogo/raid-boss-feed.test.ts`
Expected: PASS, 27 tests.

- [ ] **Step 6: Format, check and commit**

```bash
npx prettier --write src/domain/pogo/raid-tier.ts src/domain/pogo/raid-tier.test.ts src/domain/pogo/notification-target.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/raid-boss-feed.ts src/domain/pogo/raid-boss-feed.test.ts test/support/raid-bosses.ts
npm run check
git add src/domain/pogo/raid-tier.ts src/domain/pogo/raid-tier.test.ts src/domain/pogo/notification-target.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/raid-boss-feed.ts src/domain/pogo/raid-boss-feed.test.ts test/support/raid-bosses.ts test/fixtures/raid-boss-feed.json
git commit -m "Read the raid boss feed: level keys to raid tiers, validation, a committed fixture; super mega raids as a raid level" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The boss list in effect

**Files:**
- Create: `src/domain/pogo/raid-bosses.ts`, `src/domain/pogo/raid-bosses.test.ts`

**Interfaces:**
- Consumes: `FeedBoss`, `parseRaidBossFeed` (Task 2); `PokemonCatalogue.byGameMasterId` with aliases (Task 1); `PokemonEntry`; `titleCase` from `./names.js`; `RAID_LEVELS`, `raidTier`, `sameRaidTier`, `RaidTier`.
- Produces:
  - `OVERRIDE_ACTIONS = ['add', 'hide', 'autoset', 'shiny']`, `type OverrideAction`, `isOverrideAction(value: string)`
  - `interface BossIds { pokemonId: string; form: string | null }`
  - `interface NewBossOverride extends BossIds { action: OverrideAction; tier: RaidTier | null; shiny: boolean | null; expiresAt: number | null; createdBy: string }`
  - `interface BossOverride extends NewBossOverride { id: number; createdAt: number }`
  - `interface RaidBoss extends BossIds { key: string; tier: RaidTier; shiny: boolean; name: string; entry: PokemonEntry | undefined; source: 'feed' | 'override'; autoset: boolean }`
  - `overrideProblem(override: NewBossOverride, now: number): string | undefined`
  - `bossIdsOf(entry: PokemonEntry): BossIds`
  - `resolveBoss(catalogue: PokemonCatalogue, boss: BossIds & { name?: string }): PokemonEntry | undefined`
  - `effectiveBosses(feed: readonly FeedBoss[], overrides: readonly BossOverride[], catalogue: PokemonCatalogue, now: number): RaidBoss[]`
  - `autosetBoss(bosses: readonly RaidBoss[], tier: RaidTier): RaidBoss | undefined`
  - `interface BossListChange { added: FeedBoss[]; removed: FeedBoss[] }`, `diffFeed(before, after): BossListChange`

Rules (spec 6.7): the list in effect is the feed's list, plus `add` and `autoset` overrides, minus `hide` overrides. When a tier has exactly one boss, eggs of that tier hatch as it; an `autoset` override takes precedence. Shiny comes from the feed unless a `shiny` override says otherwise. Expired overrides do not apply.

- [ ] **Step 1: Write the failing test**

`src/domain/pogo/raid-bosses.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { readRaidBossFeed } from '../../../test/support/raid-bosses.js';
import { parseRaidBossFeed, type FeedBoss } from './raid-boss-feed.js';
import {
  autosetBoss,
  bossIdsOf,
  diffFeed,
  effectiveBosses,
  isOverrideAction,
  overrideProblem,
  resolveBoss,
  type BossOverride,
  type RaidBoss,
} from './raid-bosses.js';
import type { RaidTier } from './raid-tier.js';

const catalogue = catalogueFixture();
const feed = parseRaidBossFeed(readRaidBossFeed()).bosses;
const NOW = 1_800_000_000_000;
const T1: RaidTier = { level: 'T1', shadow: false };
const T3: RaidTier = { level: 'T3', shadow: false };
const T5: RaidTier = { level: 'T5', shadow: false };
const SHADOW_T5: RaidTier = { level: 'T5', shadow: true };
const MEGA: RaidTier = { level: 'Mega', shadow: false };
const EX: RaidTier = { level: 'EX', shadow: false };

let nextId = 1;
function override(
  action: BossOverride['action'],
  pokemonId: string,
  tier: RaidTier | null,
  extra: Partial<BossOverride> = {},
): BossOverride {
  const id = nextId++;
  return {
    id,
    action,
    pokemonId,
    form: null,
    tier,
    shiny: null,
    expiresAt: null,
    createdBy: '123456789012345678',
    createdAt: NOW - 1_000_000 + id,
    ...extra,
  };
}

function feedBoss(pokemonId: string, tier: RaidTier, extra: Partial<FeedBoss> = {}): FeedBoss {
  return { pokemonId, form: null, tier, shiny: false, name: pokemonId, ...extra };
}

function keys(bosses: readonly RaidBoss[], tier?: RaidTier): string[] {
  return bosses
    .filter((b) => !tier || (b.tier.level === tier.level && b.tier.shadow === tier.shadow))
    .map((b) => b.key);
}

describe('resolveBoss', () => {
  it('finds the entry of a plain species, a mega and a named form', () => {
    expect(resolveBoss(catalogue, { pokemonId: 'YVELTAL', form: null })?.key).toBe('yveltal');
    expect(resolveBoss(catalogue, { pokemonId: 'BLASTOISE', form: 'BLASTOISE_MEGA' })?.key).toBe(
      'blastoise_mega',
    );
    expect(resolveBoss(catalogue, { pokemonId: 'LANDORUS', form: 'LANDORUS_INCARNATE' })?.key).toBe(
      'landorus_incarnate',
    );
    expect(resolveBoss(catalogue, { pokemonId: 'LANDORUS', form: null })?.key).toBe(
      'landorus_incarnate',
    );
  });

  it('takes a costume newer than the game master for the species the feed names it as', () => {
    const boss = { pokemonId: 'PIKACHU', form: 'PIKACHU_GLASS_HELMET_2026' };
    expect(resolveBoss(catalogue, { ...boss, name: 'Pikachu' })?.key).toBe('pikachu');
    expect(resolveBoss(catalogue, { ...boss, name: ' pikachu ' })?.key).toBe('pikachu');
  });

  it('does not pass off a new form or mega as the species', () => {
    expect(
      resolveBoss(catalogue, { pokemonId: 'YVELTAL', form: 'YVELTAL_MEGA', name: 'Mega Yveltal' }),
    ).toBeUndefined();
    expect(resolveBoss(catalogue, { pokemonId: 'YVELTAL', form: 'YVELTAL_MEGA' })).toBeUndefined();
    expect(
      resolveBoss(catalogue, { pokemonId: 'NEWMON', form: null, name: 'Newmon' }),
    ).toBeUndefined();
  });

  it('resolves every boss of the downloaded feed', () => {
    expect(feed.map((boss) => resolveBoss(catalogue, boss)?.key)).toEqual([
      'blastoise_mega',
      'yveltal',
      'starmie',
      'umbreon',
      'gothitelle',
      'pikachu',
      'landorus_incarnate',
      'primeape',
      'kirlia',
      'drapion',
      'gastly',
      'totodile',
      'shieldon',
      'gible',
    ]);
  });
});

describe('bossIdsOf', () => {
  it('names an entry the way the feed does', () => {
    const ids = (key: string) => {
      const entry = catalogue.byKey(key);
      if (!entry) throw new Error(key);
      return bossIdsOf(entry);
    };
    expect(ids('yveltal')).toEqual({ pokemonId: 'YVELTAL', form: null });
    expect(ids('blastoise_mega')).toEqual({ pokemonId: 'BLASTOISE', form: 'BLASTOISE_MEGA' });
    expect(ids('charizard_mega_x')).toEqual({ pokemonId: 'CHARIZARD', form: 'CHARIZARD_MEGA_X' });
    expect(ids('kyogre_primal')).toEqual({ pokemonId: 'KYOGRE', form: 'KYOGRE_PRIMAL' });
    expect(ids('landorus_incarnate')).toEqual({
      pokemonId: 'LANDORUS',
      form: 'LANDORUS_INCARNATE',
    });
  });

  it('gives ids that resolve back to the same entry, for every entry', () => {
    const wrong = catalogue.all.filter(
      (entry) => resolveBoss(catalogue, bossIdsOf(entry)) !== entry,
    );
    expect(wrong.map((entry) => entry.key)).toEqual([]);
  });
});

describe('effectiveBosses: the feed alone', () => {
  const bosses = effectiveBosses(feed, [], catalogue, NOW);

  it('lists the feed in tier order, then by name', () => {
    expect(bosses.map((b) => `${b.tier.shadow ? 'S' : ''}${b.tier.level} ${b.name}`)).toEqual([
      'T1 Pikachu',
      'ST1 Gastly',
      'ST1 Gible',
      'ST1 Shieldon',
      'ST1 Totodile',
      'T3 Gothitelle',
      'T3 Starmie',
      'T3 Umbreon',
      'ST3 Drapion',
      'ST3 Kirlia',
      'ST3 Primeape',
      'T5 Yveltal',
      'ST5 Landorus (Incarnate Forme)',
      'Mega Mega Blastoise',
    ]);
  });

  it('carries the catalogue entry, the feed ids and the shiny flag', () => {
    expect(bosses.find((b) => b.key === 'blastoise_mega')).toEqual({
      key: 'blastoise_mega',
      pokemonId: 'BLASTOISE',
      form: 'BLASTOISE_MEGA',
      tier: MEGA,
      shiny: true,
      name: 'Mega Blastoise',
      entry: catalogue.byKey('blastoise_mega'),
      source: 'feed',
      autoset: false,
    });
  });

  it('keeps a Pokémon the game master does not know, under the name of the feed', () => {
    const [boss] = effectiveBosses(
      [feedBoss('NEWMON', T5, { form: 'NEWMON_SKY', name: 'Newmon (Sky Forme)' })],
      [],
      catalogue,
      NOW,
    );
    expect(boss).toMatchObject({
      key: 'newmon_sky',
      name: 'Newmon (Sky Forme)',
      entry: undefined,
      source: 'feed',
    });
  });

  it('makes one boss of two feed rows that are one Pokémon in one tier', () => {
    const merged = effectiveBosses(
      [
        feedBoss('PIKACHU', T1, { form: 'PIKACHU_GLASS_HELMET_2026', name: 'Pikachu' }),
        feedBoss('PIKACHU', T1, { shiny: true, name: 'Pikachu' }),
        feedBoss('PIKACHU', T3, { name: 'Pikachu' }),
      ],
      [],
      catalogue,
      NOW,
    );
    expect(merged.map((b) => [b.key, b.tier.level, b.shiny, b.form])).toEqual([
      ['pikachu', 'T1', true, 'PIKACHU_GLASS_HELMET_2026'],
      ['pikachu', 'T3', false, null],
    ]);
  });

  it('does not change the feed list it is given', () => {
    const frozen = feed.map((boss) => Object.freeze({ ...boss, tier: Object.freeze(boss.tier) }));
    expect(() =>
      effectiveBosses(
        frozen,
        [override('shiny', 'YVELTAL', null, { shiny: false })],
        catalogue,
        NOW,
      ),
    ).not.toThrow();
  });
});

describe('effectiveBosses: overrides', () => {
  it('adds a boss the feed does not list', () => {
    const bosses = effectiveBosses(
      feed,
      [override('add', 'MEWTWO', EX, { shiny: true }), override('add', 'ZEKROM', T5)],
      catalogue,
      NOW,
    );
    expect(keys(bosses, T5)).toEqual(['yveltal', 'zekrom']);
    expect(bosses.find((b) => b.key === 'mewtwo')).toMatchObject({
      tier: EX,
      shiny: true,
      name: 'Mewtwo',
      source: 'override',
      pokemonId: 'MEWTWO',
      form: null,
    });
    expect(bosses.find((b) => b.key === 'zekrom')?.shiny).toBe(false);
  });

  it('leaves a feed boss as it is when an override adds it again', () => {
    const bosses = effectiveBosses(feed, [override('add', 'YVELTAL', T5)], catalogue, NOW);
    expect(bosses.filter((b) => b.key === 'yveltal')).toHaveLength(1);
    expect(bosses.find((b) => b.key === 'yveltal')).toMatchObject({ source: 'feed', shiny: true });
  });

  it('names an added Pokémon the game master does not know after its id', () => {
    const [boss] = effectiveBosses(
      [],
      [override('add', 'NEWMON', T5, { form: 'NEWMON_SKY_FORME' })],
      catalogue,
      NOW,
    );
    expect(boss).toMatchObject({ key: 'newmon_sky_forme', name: 'Newmon Sky Forme' });
  });

  it('hides a boss of one tier only', () => {
    const twice = [...feed, feedBoss('YVELTAL', SHADOW_T5, { name: 'Yveltal' })];
    const bosses = effectiveBosses(twice, [override('hide', 'YVELTAL', T5)], catalogue, NOW);
    expect(keys(bosses, T5)).toEqual([]);
    expect(keys(bosses, SHADOW_T5)).toEqual(['landorus_incarnate', 'yveltal']);
  });

  it('hides by Pokémon, whichever ids name it', () => {
    const bosses = effectiveBosses(
      feed,
      [
        // The feed says LANDORUS_INCARNATE; the bare species id is the same Pokémon.
        override('hide', 'LANDORUS', SHADOW_T5),
        // The feed lists a costume; hiding Pikachu hides it.
        override('hide', 'PIKACHU', T1),
      ],
      catalogue,
      NOW,
    );
    expect(keys(bosses, SHADOW_T5)).toEqual([]);
    expect(keys(bosses, T1)).toEqual([]);
  });

  it('lets hide beat add and autoset, whichever is newer', () => {
    const bosses = effectiveBosses(
      feed,
      [
        override('hide', 'ZEKROM', T5),
        override('add', 'ZEKROM', T5),
        override('autoset', 'ZEKROM', T5),
      ],
      catalogue,
      NOW,
    );
    expect(keys(bosses, T5)).toEqual(['yveltal']);
    expect(autosetBoss(bosses, T5)?.key).toBe('yveltal');
  });

  it('forces the shiny flag, for one tier or for all', () => {
    const twice = [...feed, feedBoss('YVELTAL', SHADOW_T5, { shiny: true, name: 'Yveltal' })];
    const everywhere = effectiveBosses(
      twice,
      [override('shiny', 'YVELTAL', null, { shiny: false })],
      catalogue,
      NOW,
    );
    expect(everywhere.filter((b) => b.key === 'yveltal').map((b) => b.shiny)).toEqual([
      false,
      false,
    ]);
    const oneTier = effectiveBosses(
      twice,
      [override('shiny', 'YVELTAL', SHADOW_T5, { shiny: false })],
      catalogue,
      NOW,
    );
    expect(oneTier.filter((b) => b.key === 'yveltal').map((b) => [b.tier.shadow, b.shiny])).toEqual(
      [
        [false, true],
        [true, false],
      ],
    );
  });

  it('lets the newest shiny override win, and one tier beat every tier', () => {
    const newest = effectiveBosses(
      feed,
      [
        override('shiny', 'YVELTAL', T5, { shiny: false }),
        override('shiny', 'YVELTAL', T5, { shiny: true }),
      ],
      catalogue,
      NOW,
    );
    expect(newest.find((b) => b.key === 'yveltal')?.shiny).toBe(true);
    const specific = effectiveBosses(
      feed,
      [
        override('shiny', 'YVELTAL', T5, { shiny: false }),
        override('shiny', 'YVELTAL', null, { shiny: true }),
      ],
      catalogue,
      NOW,
    );
    expect(specific.find((b) => b.key === 'yveltal')?.shiny).toBe(false);
  });

  it('applies a shiny override to a boss another override added', () => {
    const bosses = effectiveBosses(
      [],
      [override('add', 'ZEKROM', T5), override('shiny', 'ZEKROM', null, { shiny: true })],
      catalogue,
      NOW,
    );
    expect(bosses[0]).toMatchObject({ key: 'zekrom', shiny: true });
  });

  it('ignores an override once it has expired', () => {
    const overrides = [
      override('hide', 'YVELTAL', T5, { expiresAt: NOW }),
      override('add', 'ZEKROM', T5, { expiresAt: NOW + 1 }),
      override('add', 'RESHIRAM', T5, { expiresAt: NOW - 1 }),
    ];
    expect(keys(effectiveBosses(feed, overrides, catalogue, NOW), T5)).toEqual([
      'yveltal',
      'zekrom',
    ]);
    expect(keys(effectiveBosses(feed, overrides, catalogue, NOW - 1), T5)).toEqual(['zekrom']);
  });

  it('ignores an override that needs a tier and has none', () => {
    const bosses = effectiveBosses(
      feed,
      [override('add', 'ZEKROM', null), override('hide', 'YVELTAL', null)],
      catalogue,
      NOW,
    );
    expect(keys(bosses, T5)).toEqual(['yveltal']);
  });
});

describe('autosetBoss', () => {
  it('is the only boss of a tier', () => {
    const bosses = effectiveBosses(feed, [], catalogue, NOW);
    expect(autosetBoss(bosses, T5)?.key).toBe('yveltal');
    expect(autosetBoss(bosses, MEGA)?.key).toBe('blastoise_mega');
    expect(autosetBoss(bosses, SHADOW_T5)?.key).toBe('landorus_incarnate');
  });

  it('is nothing for a tier with several bosses or none', () => {
    const bosses = effectiveBosses(feed, [], catalogue, NOW);
    expect(autosetBoss(bosses, T3)).toBeUndefined();
    expect(autosetBoss(bosses, EX)).toBeUndefined();
    expect(autosetBoss([], T5)).toBeUndefined();
  });

  it('is the boss a moderator chose, which need not be in the feed', () => {
    const chosen = effectiveBosses(feed, [override('autoset', 'UMBREON', T3)], catalogue, NOW);
    expect(autosetBoss(chosen, T3)?.key).toBe('umbreon');
    expect(chosen.filter((b) => b.autoset).map((b) => b.key)).toEqual(['umbreon']);

    const added = effectiveBosses(feed, [override('autoset', 'ZEKROM', T5)], catalogue, NOW);
    expect(keys(added, T5)).toEqual(['yveltal', 'zekrom']);
    expect(autosetBoss(added, T5)).toMatchObject({ key: 'zekrom', source: 'override' });
  });

  it('takes the newest choice for a tier, and each tier has its own', () => {
    const bosses = effectiveBosses(
      feed,
      [
        override('autoset', 'UMBREON', T3),
        override('autoset', 'STARMIE', T3),
        override('autoset', 'KIRLIA', { level: 'T3', shadow: true }),
      ],
      catalogue,
      NOW,
    );
    expect(autosetBoss(bosses, T3)?.key).toBe('starmie');
    expect(autosetBoss(bosses, { level: 'T3', shadow: true })?.key).toBe('kirlia');
    expect(bosses.filter((b) => b.autoset).map((b) => b.key)).toEqual(['starmie', 'kirlia']);
  });

  it('falls back when the choice has expired or is hidden', () => {
    const expired = effectiveBosses(
      feed,
      [override('autoset', 'ZEKROM', T5, { expiresAt: NOW - 1 })],
      catalogue,
      NOW,
    );
    expect(autosetBoss(expired, T5)?.key).toBe('yveltal');
    const hidden = effectiveBosses(
      feed,
      [
        override('autoset', 'UMBREON', T3),
        override('autoset', 'STARMIE', T3),
        override('hide', 'STARMIE', T3),
      ],
      catalogue,
      NOW,
    );
    expect(autosetBoss(hidden, T3)?.key).toBe('umbreon');
  });
});

describe('diffFeed', () => {
  it('lists what appeared and what went', () => {
    const before = [feedBoss('ZEKROM', T5), feedBoss('STARMIE', T3)];
    const after = [feedBoss('STARMIE', T3), feedBoss('YVELTAL', T5), feedBoss('STARMIE', T1)];
    const change = diffFeed(before, after);
    expect(change.added.map((b) => [b.pokemonId, b.tier.level])).toEqual([
      ['YVELTAL', 'T5'],
      ['STARMIE', 'T1'],
    ]);
    expect(change.removed.map((b) => b.pokemonId)).toEqual(['ZEKROM']);
  });

  it('tells forms and shadow tiers apart, and ignores the shiny flag and the name', () => {
    const before = [feedBoss('GIRATINA', T5, { form: 'GIRATINA_ALTERED' }), feedBoss('MEW', T5)];
    const after = [
      feedBoss('GIRATINA', T5, { form: 'GIRATINA_ORIGIN' }),
      feedBoss('MEW', T5, { shiny: true, name: 'Mew!' }),
      feedBoss('MEW', SHADOW_T5),
    ];
    const change = diffFeed(before, after);
    expect(change.added.map((b) => b.form ?? b.tier.shadow)).toEqual(['GIRATINA_ORIGIN', true]);
    expect(change.removed.map((b) => b.form)).toEqual(['GIRATINA_ALTERED']);
  });

  it('finds nothing between equal lists', () => {
    expect(diffFeed(feed, [...feed].reverse())).toEqual({ added: [], removed: [] });
    expect(diffFeed([], [])).toEqual({ added: [], removed: [] });
  });
});

describe('overrideProblem', () => {
  it('accepts each kind of override', () => {
    for (const ok of [
      override('add', 'MEWTWO', EX),
      override('add', 'MEWTWO', EX, { shiny: true, expiresAt: NOW + 1 }),
      override('hide', 'YVELTAL', T5),
      override('autoset', 'BLASTOISE', MEGA, { form: 'BLASTOISE_MEGA' }),
      override('shiny', 'KIRLIA', null, { shiny: false }),
      override('shiny', 'KIRLIA', SHADOW_T5, { shiny: true }),
      override('add', 'PORYGON2', T3),
    ]) {
      expect(overrideProblem(ok, NOW), JSON.stringify(ok)).toBeUndefined();
    }
  });

  it.each([
    ['a tier is missing', override('add', 'MEWTWO', null), /tier is needed/],
    ['a tier is missing for hide', override('hide', 'MEWTWO', null), /tier is needed/],
    ['a tier is missing for autoset', override('autoset', 'MEWTWO', null), /tier is needed/],
    [
      'the tier has no shadow raids',
      override('add', 'MEWTWO', { level: 'EX', shadow: true }),
      /no shadow raids/,
    ],
    ['a shiny override has no value', override('shiny', 'MEWTWO', null), /shiny or not/],
    [
      'a hide override has a shiny value',
      override('hide', 'MEWTWO', T5, { shiny: true }),
      /says nothing/,
    ],
    ['the expiry is now', override('add', 'MEWTWO', T5, { expiresAt: NOW }), /in the future/],
    [
      'the expiry is not a time',
      override('add', 'MEWTWO', T5, { expiresAt: Number.NaN }),
      /in the future/,
    ],
    ['the Pokémon id is lower case', override('add', 'mewtwo', T5), /not a Pokémon id/],
    ['the Pokémon id is empty', override('add', '', T5), /not a Pokémon id/],
    ['the Pokémon id is too long', override('add', 'A'.repeat(65), T5), /not a Pokémon id/],
    [
      'the form is not an id',
      override('add', 'MEWTWO', T5, { form: 'armored mewtwo' }),
      /not a form id/,
    ],
    [
      'the member id is not a snowflake',
      override('add', 'MEWTWO', T5, { createdBy: 'matt' }),
      /not a member id/,
    ],
  ])('refuses an override when %s', (_what, bad, message) => {
    expect(overrideProblem(bad, NOW)).toMatch(message);
  });
});

describe('isOverrideAction', () => {
  it('accepts the four actions only', () => {
    expect(['add', 'hide', 'autoset', 'shiny'].every(isOverrideAction)).toBe(true);
    expect(isOverrideAction('remove')).toBe(false);
    expect(isOverrideAction('ADD')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run --project unit src/domain/pogo/raid-bosses.test.ts`
Expected: FAIL, cannot find `./raid-bosses.js`.

- [ ] **Step 3: Write the module**

`src/domain/pogo/raid-bosses.ts`:

```ts
import type { PokemonCatalogue } from './catalogue.js';
import type { PokemonEntry } from './game-master.js';
import { titleCase } from './names.js';
import type { FeedBoss } from './raid-boss-feed.js';
import { RAID_LEVELS, raidTier, sameRaidTier, type RaidTier } from './raid-tier.js';

/**
 * What a moderator can do to the boss list:
 * - `add`: the Pokémon is a boss of the tier although the feed does not list it;
 * - `hide`: it is not a boss of the tier although the feed lists it;
 * - `autoset`: eggs of the tier hatch as it (and it is a boss of the tier);
 * - `shiny`: it can or cannot be shiny, whatever the feed says.
 */
export const OVERRIDE_ACTIONS = ['add', 'hide', 'autoset', 'shiny'] as const;
export type OverrideAction = (typeof OVERRIDE_ACTIONS)[number];

export function isOverrideAction(value: string): value is OverrideAction {
  return (OVERRIDE_ACTIONS as readonly string[]).includes(value);
}

/** The game-master ids that name a boss, as the feed and the tables hold them. */
export interface BossIds {
  pokemonId: string;
  /** A form id, or `<pokemonId>_<temporary evolution>` for a mega; null for the plain species. */
  form: string | null;
}

export interface NewBossOverride extends BossIds {
  action: OverrideAction;
  /** Required unless the action is `shiny`, where null means every tier. */
  tier: RaidTier | null;
  /** For `shiny`: the value to force. For `add` and `autoset`: whether the added boss can be shiny. */
  shiny: boolean | null;
  /** Epoch ms after which the override no longer applies; null for no expiry. */
  expiresAt: number | null;
  /** Snowflake of the moderator. */
  createdBy: string;
}

export interface BossOverride extends NewBossOverride {
  id: number;
  createdAt: number;
}

/** A boss of the list in effect: the feed's list with the moderators' overrides applied. */
export interface RaidBoss extends BossIds {
  /**
   * What tells bosses of one tier apart: the catalogue key when the game master knows the
   * Pokémon, otherwise the lower-cased form or species id.
   */
  key: string;
  tier: RaidTier;
  shiny: boolean;
  /** The catalogue's name, or the feed's for a Pokémon the game master does not know yet. */
  name: string;
  /** Undefined for a Pokémon the game master does not know yet. */
  entry: PokemonEntry | undefined;
  source: 'feed' | 'override';
  /** A moderator chose this boss as what eggs of its tier hatch as. */
  autoset: boolean;
}

const GAME_MASTER_ID = /^[A-Z][A-Z0-9_]{0,63}$/;
const SNOWFLAKE = /^\d{5,30}$/;

/** What is wrong with an override a moderator asked for; undefined when it can be stored. */
export function overrideProblem(override: NewBossOverride, now: number): string | undefined {
  const { action, tier, shiny, expiresAt } = override;
  if (!GAME_MASTER_ID.test(override.pokemonId)) return 'That is not a Pokémon id.';
  if (override.form !== null && !GAME_MASTER_ID.test(override.form))
    return 'That is not a form id.';
  if (!SNOWFLAKE.test(override.createdBy)) return 'That is not a member id.';
  if (action !== 'shiny' && tier === null) return 'A raid tier is needed.';
  if (tier && !raidTier(tier.level, tier.shadow)) return 'There are no shadow raids of that tier.';
  if (action === 'shiny' && shiny === null) return 'Say whether it can be shiny or not.';
  if (action === 'hide' && shiny !== null) return 'Hiding a boss says nothing about shiny.';
  if (expiresAt !== null && !(Number.isSafeInteger(expiresAt) && expiresAt > now)) {
    return 'The expiry must be in the future.';
  }
  return undefined;
}

/** The ids under which the feed, and so the tables, name a catalogue entry. */
export function bossIdsOf(entry: PokemonEntry): BossIds {
  return {
    pokemonId: entry.pokemonId,
    form: entry.tempEvolution ? `${entry.pokemonId}_${entry.tempEvolution}` : entry.form,
  };
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The catalogue entry for a boss. A form the game master does not know gives the species only
 * when the feed calls the boss by the species' name: that is a costume newer than the game
 * master (a Pikachu in a new hat). A new mega or a new form with a name of its own gives
 * undefined, so that nobody is shown the stats of the wrong Pokémon.
 */
export function resolveBoss(
  catalogue: PokemonCatalogue,
  boss: BossIds & { name?: string },
): PokemonEntry | undefined {
  const exact = catalogue.byGameMasterId(boss.pokemonId, boss.form);
  if (exact || boss.form === null || boss.name === undefined) return exact;
  const species = catalogue.byGameMasterId(boss.pokemonId);
  return species && sameName(species.name, boss.name) ? species : undefined;
}

function tierRank(tier: RaidTier): number {
  return RAID_LEVELS.indexOf(tier.level) * 2 + (tier.shadow ? 1 : 0);
}

function compareBosses(a: RaidBoss, b: RaidBoss): number {
  return (
    tierRank(a.tier) - tierRank(b.tier) ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

/**
 * The boss list in effect at `now`: the feed's bosses, plus `add` and `autoset` overrides, minus
 * `hide` overrides, with `shiny` overrides applied; expired overrides are ignored. Two feed rows
 * that are one Pokémon in one tier (a costume beside the plain species) become one boss, shiny
 * if either is. Ordered by tier, then name.
 *
 * Where overrides disagree: `hide` beats `add` and `autoset`; the newest `autoset` of a tier is
 * the one that counts; the newest `shiny` override for a boss wins, and one for a single tier
 * beats one for every tier.
 */
export function effectiveBosses(
  feed: readonly FeedBoss[],
  overrides: readonly BossOverride[],
  catalogue: PokemonCatalogue,
  now: number,
): RaidBoss[] {
  const active = overrides
    .filter((override) => override.expiresAt === null || override.expiresAt > now)
    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  const keyOf = (ids: BossIds, entry: PokemonEntry | undefined): string =>
    entry?.key ?? (ids.form ?? ids.pokemonId).toLowerCase();
  const slot = (key: string, tier: RaidTier): string =>
    `${key}|${tier.level}|${String(tier.shadow)}`;

  const bosses = new Map<string, RaidBoss>();
  for (const boss of feed) {
    const entry = resolveBoss(catalogue, boss);
    const key = keyOf(boss, entry);
    const existing = bosses.get(slot(key, boss.tier));
    if (existing) {
      existing.shiny ||= boss.shiny;
      continue;
    }
    bosses.set(slot(key, boss.tier), {
      key,
      pokemonId: boss.pokemonId,
      form: boss.form,
      tier: { ...boss.tier },
      shiny: boss.shiny,
      name: entry?.name ?? boss.name,
      entry,
      source: 'feed',
      autoset: false,
    });
  }

  const targets = active.map((override) => {
    const entry = resolveBoss(catalogue, override);
    return { override, entry, key: keyOf(override, entry) };
  });
  for (const { override, entry, key } of targets) {
    if ((override.action !== 'add' && override.action !== 'autoset') || !override.tier) continue;
    if (bosses.has(slot(key, override.tier))) continue;
    bosses.set(slot(key, override.tier), {
      key,
      pokemonId: override.pokemonId,
      form: override.form,
      tier: { ...override.tier },
      shiny: override.shiny ?? false,
      name: entry?.name ?? titleCase(override.form ?? override.pokemonId),
      entry,
      source: 'override',
      autoset: false,
    });
  }
  for (const { override, key } of targets) {
    if (override.action === 'hide' && override.tier) bosses.delete(slot(key, override.tier));
  }

  const list = [...bosses.values()];
  // Oldest first, every-tier overrides before single-tier ones: the last one applied wins.
  const shinyOverrides = targets.filter(({ override }) => override.action === 'shiny');
  for (const { override, key } of [
    ...shinyOverrides.filter(({ override: o }) => o.tier === null),
    ...shinyOverrides.filter(({ override: o }) => o.tier !== null),
  ]) {
    if (override.shiny === null) continue;
    for (const boss of list) {
      if (boss.key !== key) continue;
      if (override.tier && !sameRaidTier(boss.tier, override.tier)) continue;
      boss.shiny = override.shiny;
    }
  }
  // Oldest first, so the newest autoset of a tier that is still a boss ends up as the one flagged.
  for (const { override, key } of targets) {
    if (override.action !== 'autoset' || !override.tier) continue;
    const chosen = bosses.get(slot(key, override.tier));
    if (!chosen) continue;
    for (const boss of list) {
      if (sameRaidTier(boss.tier, chosen.tier)) boss.autoset = boss === chosen;
    }
  }
  return list.sort(compareBosses);
}

/**
 * What an egg of this tier hatches as when nobody says: the boss a moderator chose (`autoset`),
 * otherwise the tier's only boss. Undefined when the tier has several bosses or none.
 */
export function autosetBoss(bosses: readonly RaidBoss[], tier: RaidTier): RaidBoss | undefined {
  const ofTier = bosses.filter((boss) => sameRaidTier(boss.tier, tier));
  return ofTier.find((boss) => boss.autoset) ?? (ofTier.length === 1 ? ofTier[0] : undefined);
}

export interface BossListChange {
  added: FeedBoss[];
  removed: FeedBoss[];
}

function feedIdentity(boss: FeedBoss): string {
  return `${boss.pokemonId}|${boss.form ?? ''}|${boss.tier.level}|${String(boss.tier.shadow)}`;
}

/** The bosses that appeared in and disappeared from the feed's list, each in its list's order. */
export function diffFeed(before: readonly FeedBoss[], after: readonly FeedBoss[]): BossListChange {
  const was = new Set(before.map(feedIdentity));
  const is = new Set(after.map(feedIdentity));
  return {
    added: after.filter((boss) => !was.has(feedIdentity(boss))),
    removed: before.filter((boss) => !is.has(feedIdentity(boss))),
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --project unit src/domain/pogo/raid-bosses.test.ts`
Expected: PASS, 45 tests.

- [ ] **Step 5: Format, check and commit**

```bash
npx prettier --write src/domain/pogo/raid-bosses.ts src/domain/pogo/raid-bosses.test.ts
npm run check
git add src/domain/pogo/raid-bosses.ts src/domain/pogo/raid-bosses.test.ts
git commit -m "Work out the raid boss list in effect: overrides, auto-set, what the feed changed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The raid boss tables and their repository

**Files:**
- Create: `src/db/migrations/2026_10_10_001_raid_bosses.ts`, `src/db/repositories/raid-boss-repository.ts`, `src/db/repositories/raid-boss-repository.db.test.ts`
- Modify: `src/db/migrations/index.ts`, `src/db/migrator.db.test.ts`
- Regenerate: `src/db/types.ts`

**Interfaces:**
- Consumes: `FeedBoss` (Task 2); `BossOverride`, `NewBossOverride`, `isOverrideAction` (Task 3); `isRaidLevel`, `raidTier`; `inTransaction`.
- Produces (`src/db/repositories/raid-boss-repository.ts`):
  - `interface StoredBoss extends FeedBoss { firstSeen: number; lastSeen: number }`
  - `interface RaidBossStore` with `listActive(): Promise<StoredBoss[]>`, `replaceFeed(bosses: readonly FeedBoss[], now: number): Promise<void>`, `touchActive(now: number): Promise<void>`, `lastSyncedAt(): Promise<number | undefined>`, `listOverrides(): Promise<BossOverride[]>`, `saveOverride(override: NewBossOverride, now: number): Promise<BossOverride>`, `removeOverride(id: number): Promise<boolean>`, `removeExpiredOverrides(now: number): Promise<number>`
  - `class RaidBossRepository implements RaidBossStore`, constructed with `Kysely<DB>`

Docker must be running for this task.

- [ ] **Step 1: Write the migration and register it**

`src/db/migrations/2026_10_10_001_raid_bosses.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The raid boss list (spec section 6.7).
 *
 * `RaidBoss` holds what the feed lists: one row per Pokémon and tier, kept with `active = 0`
 * once the feed drops it. `RaidBossOverride` holds what moderators change. In both, `form` is
 * `''` for a Pokémon without one, so that the unique key works, and times are epoch
 * milliseconds.
 *
 * MySQL commits each statement of a migration by itself, so the statements are written to be
 * safe to run again after a failure half-way.
 */
export const raidBosses: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists RaidBoss (
        id int unsigned not null auto_increment,
        pokemonId varchar(64) not null,
        form varchar(64) not null default '',
        level varchar(16) not null,
        shadow tinyint(1) not null default 0,
        shiny tinyint(1) not null default 0,
        name varchar(100) not null,
        firstSeen bigint not null,
        lastSeen bigint not null,
        active tinyint(1) not null default 1,
        primary key (id),
        unique key raidboss_identity_unique (pokemonId, form, level, shadow)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists RaidBossOverride (
        id int unsigned not null auto_increment,
        pokemonId varchar(64) not null,
        form varchar(64) not null default '',
        level varchar(16) default null,
        shadow tinyint(1) not null default 0,
        action varchar(16) not null,
        shiny tinyint(1) default null,
        expiresAt bigint default null,
        createdBy varchar(30) not null,
        createdAt bigint not null,
        primary key (id)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the tables stay.
  },
};
```

`src/db/migrations/index.ts`:

```diff
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -1,5 +1,6 @@
 import type { Migration } from 'kysely/migration';
 import { baseline } from './2026_10_09_000_baseline.js';
+import { raidBosses } from './2026_10_10_001_raid_bosses.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -7,4 +8,5 @@ import { baseline } from './2026_10_09_000_baseline.js';
  */
 export const migrations: Record<string, Migration> = {
   '2026_10_09_000_baseline': baseline,
+  '2026_10_10_001_raid_bosses': raidBosses,
 };
```

- [ ] **Step 2: Regenerate the database types**

Run: `npm run db:codegen`
Expected: `✓ Introspected 17 tables and generated .\src\db\types.ts`.

`src/db/types.ts` must now contain exactly these two interfaces (and `RaidBoss: RaidBoss;` and `RaidBossOverride: RaidBossOverride;` in `DB`):

```ts
export interface RaidBoss {
  active: Generated<number>;
  firstSeen: string;
  form: Generated<string>;
  id: Generated<number>;
  lastSeen: string;
  level: string;
  name: string;
  pokemonId: string;
  shadow: Generated<number>;
  shiny: Generated<number>;
}

export interface RaidBossOverride {
  action: string;
  createdAt: string;
  createdBy: string;
  expiresAt: string | null;
  form: Generated<string>;
  id: Generated<number>;
  level: string | null;
  pokemonId: string;
  shadow: Generated<number>;
  shiny: number | null;
}
```

`BIGINT` columns are typed `string` (the pool returns them as strings); the repository converts with `Number()` and `String()`.

- [ ] **Step 3: Change the migrator test**

A takeover used to leave the schema exactly as it was; now it adds the two tables and must still change none of the legacy ones.

`src/db/migrator.db.test.ts`:

```diff
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -22,21 +22,39 @@ async function migrate(database: TestDatabase): Promise<void> {
   }
 }
 
-/** Everything about the Pine tables that a new install must reproduce exactly. */
-async function describeSchema(database: TestDatabase) {
+/** The tables the new bot adds to a database it takes over. */
+const ADDED_TABLES = ['RaidBoss', 'RaidBossOverride'];
+
+/**
+ * Everything about the Pine tables that a new install must reproduce exactly. `except` leaves
+ * tables out, to compare only what the legacy bot created.
+ */
+async function describeSchema(database: TestDatabase, except: readonly string[] = []) {
+  const kept = <Row extends { t: string }>(rows: Row[]): Row[] =>
+    rows.filter((row) => !except.includes(row.t));
+  const described = await describeTables(database);
   return {
-    columns: await database.query(
+    columns: kept(described.columns),
+    indexes: kept(described.indexes),
+    foreignKeys: kept(described.foreignKeys),
+  };
+}
+
+async function describeTables(database: TestDatabase) {
+  type Row = { t: string } & Record<string, unknown>;
+  return {
+    columns: await database.query<Row>(
       `select table_name as t, column_name as c, column_type as type, is_nullable as nullable,
               column_default as dflt, column_key as k, extra
        from information_schema.columns
        where table_schema = database() and ${OWN_TABLES} order by t, c`,
     ),
-    indexes: await database.query(
+    indexes: await database.query<Row>(
       `select table_name as t, index_name as i, seq_in_index as s, column_name as c, non_unique as nu
        from information_schema.statistics
        where table_schema = database() and ${OWN_TABLES} order by t, i, s`,
     ),
-    foreignKeys: await database.query(
+    foreignKeys: await database.query<Row>(
       `select r.table_name as t, r.constraint_name as name, r.referenced_table_name as rt,
               r.delete_rule as onDelete, r.update_rule as onUpdate
        from information_schema.referential_constraints r
@@ -55,13 +73,31 @@ describe('runMigrations', () => {
     database = other = undefined;
   });
 
-  it('takes over a fully migrated legacy database', async () => {
+  it('takes over a fully migrated legacy database, changing none of its tables', async () => {
     database = await startDatabase({ legacySchema: true });
     const before = await describeSchema(database);
     await migrate(database);
-    const rows = await database.query<{ name: string }>('select name from kysely_migration');
-    expect(rows.map((r) => r.name)).toContain('2026_10_09_000_baseline');
-    expect(await describeSchema(database)).toEqual(before);
+    const rows = await database.query<{ name: string }>(
+      'select name from kysely_migration order by name',
+    );
+    expect(rows.map((r) => r.name)).toEqual([
+      '2026_10_09_000_baseline',
+      '2026_10_10_001_raid_bosses',
+    ]);
+    expect(await describeSchema(database, ADDED_TABLES)).toEqual(before);
+    const tables = await database.query<{ name: string }>(ALL_TABLES);
+    expect(tables.map((r) => r.name)).toEqual(expect.arrayContaining(ADDED_TABLES));
+  });
+
+  it('creates the raid boss tables again if the migration failed half-way', async () => {
+    database = await startDatabase({ legacySchema: true });
+    await migrate(database);
+    // What a failure between the two statements leaves behind: one table, no migration record.
+    await database.query('drop table RaidBossOverride');
+    await database.query("delete from kysely_migration where name = '2026_10_10_001_raid_bosses'");
+    await expect(migrate(database)).resolves.toBeUndefined();
+    const tables = await database.query<{ name: string }>(ALL_TABLES);
+    expect(tables.map((r) => r.name)).toEqual(expect.arrayContaining(ADDED_TABLES));
   });
 
   it('is idempotent', async () => {
@@ -112,7 +148,7 @@ describe('runMigrations', () => {
       'select table_name as name from information_schema.tables where table_schema = database()',
     );
     expect(tables.map((r) => r.name)).toEqual(
-      expect.arrayContaining(['Guild', 'Region', 'User', 'Gym']),
+      expect.arrayContaining(['Guild', 'Region', 'User', 'Gym', ...ADDED_TABLES]),
     );
     expect(tables.map((r) => r.name)).not.toContain('knex_migrations');
   });
```

Run: `npx vitest run --project db src/db/migrator.db.test.ts`
Expected: PASS, 11 tests (about a minute).

- [ ] **Step 4: Write the failing repository test**

`src/db/repositories/raid-boss-repository.db.test.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FeedBoss } from '../../domain/pogo/raid-boss-feed.js';
import type { NewBossOverride } from '../../domain/pogo/raid-bosses.js';
import type { RaidTier } from '../../domain/pogo/raid-tier.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { RaidBossRepository } from './raid-boss-repository.js';

const T3: RaidTier = { level: 'T3', shadow: false };
const T5: RaidTier = { level: 'T5', shadow: false };
const SHADOW_T5: RaidTier = { level: 'T5', shadow: true };
const MEGA: RaidTier = { level: 'Mega', shadow: false };
const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;

function boss(pokemonId: string, tier: RaidTier, extra: Partial<FeedBoss> = {}): FeedBoss {
  return { pokemonId, form: null, tier, shiny: false, name: pokemonId.toLowerCase(), ...extra };
}

function override(extra: Partial<NewBossOverride> = {}): NewBossOverride {
  return {
    action: 'add',
    pokemonId: 'MEWTWO',
    form: null,
    tier: T5,
    shiny: null,
    expiresAt: null,
    createdBy: '123456789012345678',
    ...extra,
  };
}

describe('RaidBossRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let bosses: RaidBossRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    bosses = new RaidBossRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('RaidBoss').execute();
    await db.deleteFrom('RaidBossOverride').execute();
  });

  describe('the tables', () => {
    it('use the character set and collation of the legacy tables', async () => {
      const { rows } = await sql<{ name: string; collation: string }>`
        select table_name as name, table_collation as collation from information_schema.tables
        where table_schema = database() and table_name in ('RaidBoss', 'RaidBossOverride', 'Pokemon')
        order by name`.execute(db);
      expect(rows).toEqual([
        { name: 'Pokemon', collation: 'utf8mb4_0900_ai_ci' },
        { name: 'RaidBoss', collation: 'utf8mb4_0900_ai_ci' },
        { name: 'RaidBossOverride', collation: 'utf8mb4_0900_ai_ci' },
      ]);
    });

    it('allow one row per Pokémon, form, level and shadow flag', async () => {
      const row = {
        pokemonId: 'YVELTAL',
        form: '',
        level: 'T5',
        shadow: 0,
        name: 'Yveltal',
        firstSeen: '1',
        lastSeen: '1',
      };
      await db.insertInto('RaidBoss').values(row).execute();
      await expect(db.insertInto('RaidBoss').values(row).execute()).rejects.toThrow(/Duplicate/);
      await db
        .insertInto('RaidBoss')
        .values({ ...row, shadow: 1 })
        .execute();
    });
  });

  describe('the feed list', () => {
    it('is empty, and never synced, in a new database', async () => {
      expect(await bosses.listActive()).toEqual([]);
      expect(await bosses.lastSyncedAt()).toBeUndefined();
    });

    it('stores a list and reads it back', async () => {
      const list = [
        boss('BLASTOISE', MEGA, { form: 'BLASTOISE_MEGA', shiny: true, name: 'Mega Blastoise' }),
        boss('YVELTAL', T5, { name: 'Yveltal' }),
        boss('LANDORUS', SHADOW_T5, { form: 'LANDORUS_INCARNATE', name: 'Landorus (Incarnate)' }),
      ];
      await bosses.replaceFeed(list, NOW);
      expect(await bosses.listActive()).toEqual(
        list.map((entry) => ({ ...entry, firstSeen: NOW, lastSeen: NOW })),
      );
      expect(await bosses.lastSyncedAt()).toBe(NOW);
    });

    it('stores text outside the Latin alphabet', async () => {
      await bosses.replaceFeed([boss('MR_MIME', T3, { name: 'Flabébé ♀ メガ' })], NOW);
      expect((await bosses.listActive())[0]?.name).toBe('Flabébé ♀ メガ');
    });

    it('replaces the list: keeps, updates, adds and retires', async () => {
      await bosses.replaceFeed(
        [boss('YVELTAL', T5), boss('STARMIE', T3), boss('UMBREON', T3)],
        NOW,
      );
      await bosses.replaceFeed(
        [
          boss('YVELTAL', T5, { shiny: true, name: 'Yveltal!' }),
          boss('UMBREON', T3),
          boss('ZEKROM', T5),
        ],
        NOW + HOUR,
      );
      expect(
        (await bosses.listActive()).map((b) => [
          b.pokemonId,
          b.shiny,
          b.name,
          b.firstSeen,
          b.lastSeen,
        ]),
      ).toEqual([
        ['YVELTAL', true, 'Yveltal!', NOW, NOW + HOUR],
        ['UMBREON', false, 'umbreon', NOW, NOW + HOUR],
        ['ZEKROM', false, 'zekrom', NOW + HOUR, NOW + HOUR],
      ]);
      const retired = await db
        .selectFrom('RaidBoss')
        .select(['pokemonId', 'active', 'lastSeen'])
        .where('active', '=', 0)
        .execute();
      expect(retired).toEqual([{ pokemonId: 'STARMIE', active: 0, lastSeen: String(NOW) }]);
      expect(await bosses.lastSyncedAt()).toBe(NOW + HOUR);
    });

    it('starts a returning boss again instead of adding a second row', async () => {
      await bosses.replaceFeed([boss('YVELTAL', T5), boss('ZEKROM', T5)], NOW);
      await bosses.replaceFeed([boss('ZEKROM', T5)], NOW + HOUR);
      await bosses.replaceFeed([boss('ZEKROM', T5), boss('YVELTAL', T5)], NOW + 2 * HOUR);
      expect((await bosses.listActive()).map((b) => [b.pokemonId, b.firstSeen])).toEqual([
        ['YVELTAL', NOW + 2 * HOUR],
        ['ZEKROM', NOW],
      ]);
      const { count } = await db
        .selectFrom('RaidBoss')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();
      expect(Number(count)).toBe(2);
    });

    it('tells apart forms, tiers and shadow raids of one species', async () => {
      const list = [
        boss('GIRATINA', T5, { form: 'GIRATINA_ALTERED' }),
        boss('GIRATINA', T5, { form: 'GIRATINA_ORIGIN' }),
        boss('GIRATINA', T5),
        boss('GIRATINA', SHADOW_T5),
        boss('GIRATINA', T3),
      ];
      await bosses.replaceFeed(list, NOW);
      expect(await bosses.listActive()).toHaveLength(5);
      await bosses.replaceFeed(list.slice(1), NOW + HOUR);
      expect((await bosses.listActive()).map((b) => [b.form, b.tier])).toEqual(
        list.slice(1).map((b) => [b.form, b.tier]),
      );
    });

    it('stores a boss listed twice once', async () => {
      await bosses.replaceFeed(
        [boss('YVELTAL', T5), boss('YVELTAL', T5, { shiny: true }), boss('yveltal', T5)],
        NOW,
      );
      expect((await bosses.listActive()).map((b) => [b.pokemonId, b.shiny])).toEqual([
        ['YVELTAL', false],
      ]);
    });

    it('retires everything for an empty list', async () => {
      await bosses.replaceFeed([boss('YVELTAL', T5)], NOW);
      await bosses.replaceFeed([], NOW + HOUR);
      expect(await bosses.listActive()).toEqual([]);
      expect(await bosses.lastSyncedAt()).toBeUndefined();
    });

    it('changes nothing when the transaction it runs in is rolled back', async () => {
      await bosses.replaceFeed([boss('YVELTAL', T5)], NOW);
      await expect(
        db.transaction().execute(async (trx) => {
          await new RaidBossRepository(trx).replaceFeed([boss('ZEKROM', T5)], NOW + HOUR);
          throw new Error('rolled back');
        }),
      ).rejects.toThrow('rolled back');
      expect((await bosses.listActive()).map((b) => [b.pokemonId, b.lastSeen])).toEqual([
        ['YVELTAL', NOW],
      ]);
    });

    it('records that the list is still current', async () => {
      await bosses.replaceFeed([boss('YVELTAL', T5), boss('ZEKROM', T5)], NOW);
      await bosses.replaceFeed([boss('YVELTAL', T5)], NOW + HOUR);
      await bosses.touchActive(NOW + 2 * HOUR);
      expect(await bosses.lastSyncedAt()).toBe(NOW + 2 * HOUR);
      expect((await bosses.listActive())[0]).toMatchObject({
        firstSeen: NOW,
        lastSeen: NOW + 2 * HOUR,
      });
      const retired = await db
        .selectFrom('RaidBoss')
        .select('lastSeen')
        .where('active', '=', 0)
        .executeTakeFirstOrThrow();
      expect(retired.lastSeen).toBe(String(NOW));
    });

    it('leaves out a row whose level it does not know', async () => {
      await bosses.replaceFeed([boss('YVELTAL', T5)], NOW);
      await db
        .insertInto('RaidBoss')
        .values([
          { pokemonId: 'A', level: 'T9', name: 'a', firstSeen: '1', lastSeen: '1' },
          { pokemonId: 'B', level: 'Mega', shadow: 1, name: 'b', firstSeen: '1', lastSeen: '1' },
        ])
        .execute();
      expect((await bosses.listActive()).map((b) => b.pokemonId)).toEqual(['YVELTAL']);
    });
  });

  describe('overrides', () => {
    it('has none in a new database', async () => {
      expect(await bosses.listOverrides()).toEqual([]);
    });

    it('stores every kind and reads them back, oldest first', async () => {
      const inputs = [
        override({ action: 'add', shiny: true, expiresAt: NOW + HOUR }),
        override({ action: 'hide', pokemonId: 'YVELTAL' }),
        override({ action: 'autoset', pokemonId: 'BLASTOISE', form: 'BLASTOISE_MEGA', tier: MEGA }),
        override({ action: 'shiny', pokemonId: 'KIRLIA', tier: null, shiny: false }),
        override({ action: 'shiny', pokemonId: 'KIRLIA', tier: SHADOW_T5, shiny: true }),
      ];
      const saved = [];
      for (const [index, input] of inputs.entries()) {
        saved.push(await bosses.saveOverride(input, NOW + index));
      }
      expect(saved.map((o) => o.createdAt)).toEqual([NOW, NOW + 1, NOW + 2, NOW + 3, NOW + 4]);
      expect(new Set(saved.map((o) => o.id)).size).toBe(5);
      expect(await bosses.listOverrides()).toEqual(saved);
      expect(saved[0]).toEqual({ ...inputs[0], id: saved[0]?.id, createdAt: NOW });
    });

    it('replaces an earlier override of the same kind for the same boss', async () => {
      const first = await bosses.saveOverride(override({ shiny: false }), NOW);
      await bosses.saveOverride(override({ tier: SHADOW_T5 }), NOW);
      await bosses.saveOverride(override({ action: 'hide' }), NOW);
      await bosses.saveOverride(override({ form: 'MEWTWO_A' }), NOW);
      const second = await bosses.saveOverride(
        override({ shiny: true, expiresAt: NOW + HOUR }),
        NOW + 5,
      );
      const all = await bosses.listOverrides();
      expect(all).toHaveLength(4);
      expect(all.some((o) => o.id === first.id)).toBe(false);
      expect(all.find((o) => o.id === second.id)).toMatchObject({
        shiny: true,
        expiresAt: NOW + HOUR,
        createdAt: NOW + 5,
      });
    });

    it('replaces an every-tier shiny override without touching one for a single tier', async () => {
      await bosses.saveOverride(override({ action: 'shiny', tier: null, shiny: true }), NOW);
      await bosses.saveOverride(override({ action: 'shiny', tier: T5, shiny: true }), NOW);
      await bosses.saveOverride(override({ action: 'shiny', tier: null, shiny: false }), NOW + 1);
      expect((await bosses.listOverrides()).map((o) => [o.tier, o.shiny])).toEqual([
        [T5, true],
        [null, false],
      ]);
    });

    it('removes one by id', async () => {
      const saved = await bosses.saveOverride(override(), NOW);
      expect(await bosses.removeOverride(saved.id)).toBe(true);
      expect(await bosses.removeOverride(saved.id)).toBe(false);
      expect(await bosses.listOverrides()).toEqual([]);
    });

    it('removes the ones that have expired', async () => {
      await bosses.saveOverride(override({ pokemonId: 'A', expiresAt: NOW - 1 }), NOW - HOUR);
      await bosses.saveOverride(override({ pokemonId: 'B', expiresAt: NOW }), NOW - HOUR);
      await bosses.saveOverride(override({ pokemonId: 'C', expiresAt: NOW + 1 }), NOW - HOUR);
      await bosses.saveOverride(override({ pokemonId: 'D', expiresAt: null }), NOW - HOUR);
      expect(await bosses.removeExpiredOverrides(NOW)).toBe(2);
      expect((await bosses.listOverrides()).map((o) => o.pokemonId)).toEqual(['C', 'D']);
      expect(await bosses.removeExpiredOverrides(NOW)).toBe(0);
    });

    it('leaves out rows it cannot read', async () => {
      await bosses.saveOverride(override(), NOW);
      await db
        .insertInto('RaidBossOverride')
        .values([
          { pokemonId: 'A', action: 'explode', level: 'T5', createdBy: '1', createdAt: '1' },
          { pokemonId: 'B', action: 'add', level: 'T9', createdBy: '1', createdAt: '1' },
          { pokemonId: 'C', action: 'add', level: 'EX', shadow: 1, createdBy: '1', createdAt: '1' },
        ])
        .execute();
      expect((await bosses.listOverrides()).map((o) => o.pokemonId)).toEqual(['MEWTWO']);
    });
  });
});
```

Run: `npx vitest run --project db src/db/repositories/raid-boss-repository.db.test.ts`
Expected: FAIL, cannot find `./raid-boss-repository.js`.

- [ ] **Step 5: Write the repository**

`src/db/repositories/raid-boss-repository.ts`:

```ts
import type { Kysely } from 'kysely';
import type { FeedBoss } from '../../domain/pogo/raid-boss-feed.js';
import {
  isOverrideAction,
  type BossOverride,
  type NewBossOverride,
} from '../../domain/pogo/raid-bosses.js';
import { isRaidLevel, raidTier, type RaidTier } from '../../domain/pogo/raid-tier.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/** A feed boss as stored, with when the feed first and last listed it (epoch ms). */
export interface StoredBoss extends FeedBoss {
  firstSeen: number;
  lastSeen: number;
}

/** What the raid boss service needs from storage. */
export interface RaidBossStore {
  listActive(): Promise<StoredBoss[]>;
  replaceFeed(bosses: readonly FeedBoss[], now: number): Promise<void>;
  touchActive(now: number): Promise<void>;
  lastSyncedAt(): Promise<number | undefined>;
  listOverrides(): Promise<BossOverride[]>;
  saveOverride(override: NewBossOverride, now: number): Promise<BossOverride>;
  removeOverride(id: number): Promise<boolean>;
  removeExpiredOverrides(now: number): Promise<number>;
}

function tierOf(level: string | null, shadow: number): RaidTier | undefined {
  return level !== null && isRaidLevel(level) ? raidTier(level, shadow === 1) : undefined;
}

/** The `form` column holds `''` for a Pokémon without a form. */
function formColumn(form: string | null): string {
  return form ?? '';
}

function identity(pokemonId: string, form: string, level: string, shadow: number): string {
  // The columns compare without regard to case, so the identity does too.
  return `${pokemonId}|${form}|${level}|${String(shadow)}`.toUpperCase();
}

/** The `RaidBoss` and `RaidBossOverride` tables. */
export class RaidBossRepository implements RaidBossStore {
  constructor(private readonly db: Kysely<DB>) {}

  /** The bosses the feed listed at the last sync, in the order they were first stored. */
  async listActive(): Promise<StoredBoss[]> {
    const rows = await this.db
      .selectFrom('RaidBoss')
      .selectAll()
      .where('active', '=', 1)
      .orderBy('id')
      .execute();
    const bosses: StoredBoss[] = [];
    for (const row of rows) {
      const tier = tierOf(row.level, row.shadow);
      // A level this version does not know (written by a newer one): not a boss it can show.
      if (!tier) continue;
      bosses.push({
        pokemonId: row.pokemonId,
        form: row.form === '' ? null : row.form,
        tier,
        shiny: row.shiny === 1,
        name: row.name,
        firstSeen: Number(row.firstSeen),
        lastSeen: Number(row.lastSeen),
      });
    }
    return bosses;
  }

  /**
   * Makes `bosses` the stored feed list, in one transaction: a boss already stored keeps its
   * `firstSeen` if it was still active and starts again if it had gone; every listed boss gets
   * `lastSeen = now`; a stored boss that is not listed becomes inactive.
   */
  async replaceFeed(bosses: readonly FeedBoss[], now: number): Promise<void> {
    await inTransaction(this.db, async (trx) => {
      const stored = await trx
        .selectFrom('RaidBoss')
        .select(['id', 'pokemonId', 'form', 'level', 'shadow', 'active'])
        .forUpdate()
        .execute();
      const byIdentity = new Map(
        stored.map((row) => [identity(row.pokemonId, row.form, row.level, row.shadow), row]),
      );
      const listed = new Set<number>();
      for (const boss of bosses) {
        const shadow = boss.tier.shadow ? 1 : 0;
        const form = formColumn(boss.form);
        const row = byIdentity.get(identity(boss.pokemonId, form, boss.tier.level, shadow));
        if (row) {
          listed.add(row.id);
          await trx
            .updateTable('RaidBoss')
            .set({
              shiny: boss.shiny ? 1 : 0,
              name: boss.name,
              lastSeen: String(now),
              active: 1,
              ...(row.active === 1 ? {} : { firstSeen: String(now) }),
            })
            .where('id', '=', row.id)
            .execute();
        } else {
          const inserted = await trx
            .insertInto('RaidBoss')
            .values({
              pokemonId: boss.pokemonId,
              form,
              level: boss.tier.level,
              shadow,
              shiny: boss.shiny ? 1 : 0,
              name: boss.name,
              firstSeen: String(now),
              lastSeen: String(now),
              active: 1,
            })
            .executeTakeFirstOrThrow();
          const id = Number(inserted.insertId);
          listed.add(id);
          // A boss listed twice must find its row the second time.
          byIdentity.set(identity(boss.pokemonId, form, boss.tier.level, shadow), {
            id,
            pokemonId: boss.pokemonId,
            form,
            level: boss.tier.level,
            shadow,
            active: 1,
          });
        }
      }
      const gone = stored.filter((row) => row.active === 1 && !listed.has(row.id));
      if (gone.length > 0) {
        await trx
          .updateTable('RaidBoss')
          .set({ active: 0 })
          .where(
            'id',
            'in',
            gone.map((row) => row.id),
          )
          .execute();
      }
    });
  }

  /** Records that the feed still lists the same bosses at `now`. */
  async touchActive(now: number): Promise<void> {
    await this.db
      .updateTable('RaidBoss')
      .set({ lastSeen: String(now) })
      .where('active', '=', 1)
      .execute();
  }

  /** When the feed was last read successfully (epoch ms); undefined before the first sync. */
  async lastSyncedAt(): Promise<number | undefined> {
    const row = await this.db
      .selectFrom('RaidBoss')
      .select((eb) => eb.fn.max('lastSeen').as('lastSeen'))
      .where('active', '=', 1)
      .executeTakeFirst();
    return row?.lastSeen == null ? undefined : Number(row.lastSeen);
  }

  /** Every override, expired ones included, oldest first. Rows it cannot read are left out. */
  async listOverrides(): Promise<BossOverride[]> {
    const rows = await this.db.selectFrom('RaidBossOverride').selectAll().orderBy('id').execute();
    const overrides: BossOverride[] = [];
    for (const row of rows) {
      const tier = tierOf(row.level, row.shadow);
      if (!isOverrideAction(row.action)) continue;
      if (row.level !== null && !tier) continue;
      overrides.push({
        id: row.id,
        pokemonId: row.pokemonId,
        form: row.form === '' ? null : row.form,
        tier: tier ?? null,
        action: row.action,
        shiny: row.shiny === null ? null : row.shiny === 1,
        expiresAt: row.expiresAt === null ? null : Number(row.expiresAt),
        createdBy: row.createdBy,
        createdAt: Number(row.createdAt),
      });
    }
    return overrides;
  }

  /**
   * Stores an override, replacing any earlier one with the same action for the same Pokémon and
   * tier, so that saving twice does not leave two.
   */
  async saveOverride(override: NewBossOverride, now: number): Promise<BossOverride> {
    const form = formColumn(override.form);
    const shadow = override.tier?.shadow ? 1 : 0;
    const level = override.tier?.level ?? null;
    return inTransaction(this.db, async (trx) => {
      await trx
        .deleteFrom('RaidBossOverride')
        .where('pokemonId', '=', override.pokemonId)
        .where('form', '=', form)
        .where('action', '=', override.action)
        .where('shadow', '=', shadow)
        .where((eb) => (level === null ? eb('level', 'is', null) : eb('level', '=', level)))
        .execute();
      const inserted = await trx
        .insertInto('RaidBossOverride')
        .values({
          pokemonId: override.pokemonId,
          form,
          level,
          shadow,
          action: override.action,
          shiny: override.shiny === null ? null : override.shiny ? 1 : 0,
          expiresAt: override.expiresAt === null ? null : String(override.expiresAt),
          createdBy: override.createdBy,
          createdAt: String(now),
        })
        .executeTakeFirstOrThrow();
      return { ...override, id: Number(inserted.insertId), createdAt: now };
    });
  }

  /** Whether there was such an override. */
  async removeOverride(id: number): Promise<boolean> {
    const result = await this.db
      .deleteFrom('RaidBossOverride')
      .where('id', '=', id)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  /** Deletes the overrides that expired at or before `now`; returns how many. */
  async removeExpiredOverrides(now: number): Promise<number> {
    const result = await this.db
      .deleteFrom('RaidBossOverride')
      .where('expiresAt', 'is not', null)
      .where('expiresAt', '<=', String(now))
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --project db src/db/repositories/raid-boss-repository.db.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 7: Format, check and commit**

```bash
npx prettier --write src/db/migrations src/db/repositories/raid-boss-repository.ts src/db/repositories/raid-boss-repository.db.test.ts src/db/migrator.db.test.ts
npm run check
npm run db:codegen -- --verify
git add src/db
git commit -m "Add the RaidBoss and RaidBossOverride tables and their repository" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run db:codegen -- --verify` exits 0 (the committed types match the schema).

---

### Task 5: RaidBossService

**Files:**
- Create: `src/services/failure-reason.ts`, `src/services/raid-boss-service.ts`, `src/services/raid-boss-service.test.ts`, `src/services/raid-boss-service.db.test.ts`
- Modify: `src/services/game-data-service.ts`, `test/support/raid-bosses.ts`

**Interfaces:**
- Consumes: `RaidBossStore`, `StoredBoss`, `RaidBossRepository` (Task 4); `parseRaidBossFeed` (Task 2); `effectiveBosses`, `autosetBoss`, `diffFeed`, `overrideProblem`, `BossListChange`, `BossOverride`, `NewBossOverride`, `RaidBoss` (Task 3); `GameDataProvider` (`{ readonly catalogue: PokemonCatalogue }`); `Logger`.
- Produces (`src/services/raid-boss-service.ts`):
  - `type FetchFeed = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>`
  - `interface RaidBossOptions { url; refreshMs; staleAfterMs; store: RaidBossStore; gameData: GameDataProvider; fetch: FetchFeed; log: Logger; now?: () => number; timeoutMs?: number }`
  - `interface RaidBossProvider { bosses(): RaidBoss[]; bossesOf(tier: RaidTier): RaidBoss[]; autoset(tier: RaidTier): RaidBoss | undefined }`
  - `type SyncResult = { status: 'updated'; change: BossListChange } | { status: 'unchanged' } | { status: 'failed'; reason: string }`
  - `interface StaleFeed { lastSyncedAt: number | undefined; reason: string }`
  - `class RaidBossService implements RaidBossProvider` with `load()`, `sync()`, `whenIdle()`, `startAutoSync()`, `stop()`, `lastSyncedAt`, `overrides()`, `addOverride(override)`, `removeOverride(id)`, `onChange(listener)`, `onStale(listener)`
- Produces (`test/support/raid-bosses.ts`): `class MemoryRaidBossStore implements RaidBossStore` (with a `failing: Error | undefined` field), `raidBossesFixture(overrides?): RaidBossProvider`.

Behaviour the tests pin down:
- `load()` reads the stored list, the overrides and the time of the last sync; it never downloads.
- `sync()` never rejects. A valid feed replaces the stored list; anything else (an error status, a body that is not JSON, another shape, no bosses, a timeout, a database error) leaves the list as it is and returns `failed`.
- A 304 counts as a successful sync. Validators are remembered only from a feed that was accepted.
- `onChange` listeners hear about added and removed bosses, except for the first sync of a new database.
- `onStale` listeners hear once when `staleAfterMs` has passed without a successful sync (counted from the start of the bot if there never was one), and again only after a success in between.
- The timer reads the feed `refreshMs` after the last attempt, at once when the stored list is older than that or absent.

- [ ] **Step 1: Move `failureReason` into its own module**

Create `src/services/failure-reason.ts`:

```ts
/**
 * Why a download failed. undici's `fetch failed` hides the real reason in `cause`, so this is the
 * first non-empty of: the cause's message, its code, its first nested error, the error's own
 * message.
 */
export function failureReason(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause: unknown = err.cause;
  const candidates: unknown[] = [];
  if (cause instanceof Error) {
    candidates.push(cause.message, (cause as { code?: unknown }).code);
    const nested: unknown = (cause as { errors?: unknown }).errors;
    if (Array.isArray(nested) && nested[0] instanceof Error) candidates.push(nested[0].message);
  }
  candidates.push(err.message);
  const found = candidates.find((value) => typeof value === 'string' && value !== '');
  return typeof found === 'string' ? found : String(err);
}
```

`src/services/game-data-service.ts` (the function is removed here and imported):

```diff
--- a/src/services/game-data-service.ts
+++ b/src/services/game-data-service.ts
@@ -4,6 +4,7 @@ import { PokemonCatalogue } from '../domain/pogo/catalogue.js';
 import { GAME_DATA_VERSION, parseGameMaster, type GameData } from '../domain/pogo/game-master.js';
 import { parseTextFile } from '../domain/pogo/text.js';
 import type { Logger } from '../log.js';
+import { failureReason } from './failure-reason.js';
 
 /** The longest delay `setTimeout` accepts; anything longer fires immediately. */
 const MAX_TIMER_MS = 2 ** 31 - 1;
@@ -52,21 +53,6 @@ export interface GameDataProvider {
 
 let temporaryCounter = 0;
 
-/** The first non-empty of: the cause's message, its code, its first nested error, the error's own message. */
-function failureReason(err: unknown): string {
-  if (!(err instanceof Error)) return String(err);
-  const cause: unknown = err.cause;
-  const candidates: unknown[] = [];
-  if (cause instanceof Error) {
-    candidates.push(cause.message, (cause as { code?: unknown }).code);
-    const nested: unknown = (cause as { errors?: unknown }).errors;
-    if (Array.isArray(nested) && nested[0] instanceof Error) candidates.push(nested[0].message);
-  }
-  candidates.push(err.message);
-  const found = candidates.find((value) => typeof value === 'string' && value !== '');
-  return typeof found === 'string' ? found : String(err);
-}
-
 /**
  * Downloads the game master and English text file, parses them and keeps the result on disk,
  * so the bot still starts when the download fails. Nothing happens until `load` is called.
```

Run: `npx vitest run --project unit src/services/game-data-service.test.ts`
Expected: PASS (the behaviour is unchanged).

- [ ] **Step 2: Extend the test support**

Replace `test/support/raid-bosses.ts` with:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { RaidBossStore, StoredBoss } from '../../src/db/repositories/raid-boss-repository.js';
import { parseRaidBossFeed, type FeedBoss } from '../../src/domain/pogo/raid-boss-feed.js';
import {
  autosetBoss,
  effectiveBosses,
  type BossOverride,
  type NewBossOverride,
} from '../../src/domain/pogo/raid-bosses.js';
import { sameRaidTier } from '../../src/domain/pogo/raid-tier.js';
import type { RaidBossProvider } from '../../src/services/raid-boss-service.js';
import { catalogueFixture } from './game-data.js';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');

/**
 * The raid boss feed as downloaded on 2026-10-10: 14 bosses in seven levels, among them a mega,
 * a shadow boss with a named form and a costume newer than the game-data fixture.
 */
export function readRaidBossFeed(): unknown {
  return JSON.parse(readFileSync(path.join(fixtures, 'raid-boss-feed.json'), 'utf8'));
}

function identity(boss: FeedBoss): string {
  return `${boss.pokemonId}|${boss.form ?? ''}|${boss.tier.level}|${String(boss.tier.shadow)}`;
}

/**
 * A `RaidBossStore` kept in memory, for tests of the service's own logic. It follows
 * `RaidBossRepository`, whose behaviour raid-boss-repository.db.test.ts pins down. Set `failing`
 * to make every call reject.
 */
export class MemoryRaidBossStore implements RaidBossStore {
  failing: Error | undefined;
  private rows: (StoredBoss & { active: boolean })[] = [];
  private stored: BossOverride[] = [];
  private nextId = 1;

  private check(): void {
    if (this.failing) throw this.failing;
  }

  listActive(): Promise<StoredBoss[]> {
    return this.attempt(() =>
      this.rows.filter((row) => row.active).map(({ active: _active, ...boss }) => ({ ...boss })),
    );
  }

  replaceFeed(bosses: readonly FeedBoss[], now: number): Promise<void> {
    return this.attempt(() => {
      const listed = new Set<string>();
      for (const boss of bosses) {
        if (listed.has(identity(boss))) continue;
        listed.add(identity(boss));
        const row = this.rows.find((candidate) => identity(candidate) === identity(boss));
        if (row) {
          Object.assign(row, {
            shiny: boss.shiny,
            name: boss.name,
            lastSeen: now,
            firstSeen: row.active ? row.firstSeen : now,
            active: true,
          });
        } else {
          this.rows.push({ ...boss, firstSeen: now, lastSeen: now, active: true });
        }
      }
      for (const row of this.rows) if (!listed.has(identity(row))) row.active = false;
    });
  }

  touchActive(now: number): Promise<void> {
    return this.attempt(() => {
      for (const row of this.rows) if (row.active) row.lastSeen = now;
    });
  }

  lastSyncedAt(): Promise<number | undefined> {
    return this.attempt(() => {
      const seen = this.rows.filter((row) => row.active).map((row) => row.lastSeen);
      return seen.length === 0 ? undefined : Math.max(...seen);
    });
  }

  listOverrides(): Promise<BossOverride[]> {
    return this.attempt(() => this.stored.map((override) => ({ ...override })));
  }

  saveOverride(override: NewBossOverride, now: number): Promise<BossOverride> {
    return this.attempt(() => {
      const sameTier = (other: BossOverride): boolean =>
        override.tier === null || other.tier === null
          ? override.tier === other.tier
          : sameRaidTier(override.tier, other.tier);
      this.stored = this.stored.filter(
        (other) =>
          !(
            other.pokemonId === override.pokemonId &&
            other.form === override.form &&
            other.action === override.action &&
            sameTier(other)
          ),
      );
      const saved = { ...override, id: this.nextId++, createdAt: now };
      this.stored.push(saved);
      return { ...saved };
    });
  }

  removeOverride(id: number): Promise<boolean> {
    return this.attempt(() => {
      const before = this.stored.length;
      this.stored = this.stored.filter((override) => override.id !== id);
      return this.stored.length < before;
    });
  }

  removeExpiredOverrides(now: number): Promise<number> {
    return this.attempt(() => {
      const before = this.stored.length;
      this.stored = this.stored.filter(
        (override) => override.expiresAt === null || override.expiresAt > now,
      );
      return before - this.stored.length;
    });
  }

  private attempt<T>(action: () => T): Promise<T> {
    try {
      this.check();
      return Promise.resolve(action());
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

/** The boss list of the downloaded feed against the game-data fixture, with these overrides. */
export function raidBossesFixture(overrides: readonly BossOverride[] = []): RaidBossProvider {
  const feed = parseRaidBossFeed(readRaidBossFeed()).bosses;
  const bosses = () => effectiveBosses(feed, overrides, catalogueFixture(), Date.now());
  return {
    bosses,
    bossesOf: (tier) => bosses().filter((boss) => sameRaidTier(boss.tier, tier)),
    autoset: (tier) => autosetBoss(bosses(), tier),
  };
}
```

(`raid-boss-service.js` does not exist yet, so `npm run typecheck` fails until Step 4.)

- [ ] **Step 3: Write the failing tests**

`src/services/raid-boss-service.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogueFixture, gameDataFixture } from '../../test/support/game-data.js';
import { MemoryRaidBossStore, readRaidBossFeed } from '../../test/support/raid-bosses.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import type { BossListChange, NewBossOverride } from '../domain/pogo/raid-bosses.js';
import type { RaidTier } from '../domain/pogo/raid-tier.js';
import { RaidBossService, type FetchFeed, type StaleFeed } from './raid-boss-service.js';

const URL = 'https://example.test/raidboss.json';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const T3: RaidTier = { level: 'T3', shadow: false };
const T5: RaidTier = { level: 'T5', shadow: false };

type Response = Awaited<ReturnType<FetchFeed>>;

function reply(status: number, body = '', headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status <= 299,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: () => Promise.resolve(body),
  };
}

/** A feed with these bosses, each `[level key, id, form?]`. */
function feedOf(...bosses: [string, string, string?][]): string {
  const currentList: Record<string, unknown[]> = {};
  for (const [level, id, form] of bosses) {
    (currentList[level] ??= []).push({
      id,
      form: form ?? id,
      shiny: false,
      names: { English: id.charAt(0) + id.slice(1).toLowerCase() },
    });
  }
  return JSON.stringify({ currentList });
}

const downloaded = JSON.stringify(readRaidBossFeed());

function override(extra: Partial<NewBossOverride> = {}): NewBossOverride {
  return {
    action: 'add',
    pokemonId: 'ZEKROM',
    form: null,
    tier: T5,
    shiny: null,
    expiresAt: null,
    createdBy: '123456789012345678',
    ...extra,
  };
}

describe('RaidBossService', () => {
  let now: number;
  let store: MemoryRaidBossStore;
  let requests: { url: string; headers: Record<string, string> }[];
  let respond: FetchFeed;

  function service(extra: { timeoutMs?: number; staleAfterMs?: number } = {}) {
    const { log, entries } = createTestLogger();
    const changes: BossListChange[] = [];
    const stale: StaleFeed[] = [];
    const raidBosses = new RaidBossService({
      url: URL,
      refreshMs: HOUR,
      staleAfterMs: 48 * HOUR,
      store,
      gameData: { catalogue: catalogueFixture() },
      fetch: (url, init) => {
        requests.push({ url, headers: init.headers });
        return respond(url, init);
      },
      log,
      now: () => now,
      ...extra,
    });
    raidBosses.onChange((change) => changes.push(change));
    raidBosses.onStale((event) => stale.push(event));
    return { raidBosses, entries, changes, stale };
  }

  beforeEach(() => {
    now = Date.UTC(2026, 9, 10, 12);
    store = new MemoryRaidBossStore();
    requests = [];
    respond = () => Promise.resolve(reply(200, downloaded));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('loading', () => {
    it('has no list before it is loaded', () => {
      const { raidBosses } = service();
      expect(() => raidBosses.bosses()).toThrow(/not been loaded/);
      expect(() => raidBosses.autoset(T5)).toThrow(/not been loaded/);
    });

    it('loads an empty list from a new database without downloading', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      expect(raidBosses.bosses()).toEqual([]);
      expect(raidBosses.lastSyncedAt).toBeUndefined();
      expect(requests).toEqual([]);
    });

    it('starts with the list and overrides of the last run', async () => {
      const first = service().raidBosses;
      await first.load();
      await first.sync();
      await first.addOverride(override());
      now += 10 * MINUTE;

      const { raidBosses } = service();
      await raidBosses.load();
      expect(raidBosses.bosses()).toHaveLength(15);
      expect(raidBosses.bossesOf(T5).map((b) => b.key)).toEqual(['yveltal', 'zekrom']);
      expect(raidBosses.lastSyncedAt).toBe(now - 10 * MINUTE);
      expect(requests).toHaveLength(1);
    });

    it('rejects when the database cannot be read', async () => {
      store.failing = new Error('connection lost');
      await expect(service().raidBosses.load()).rejects.toThrow('connection lost');
    });
  });

  describe('syncing', () => {
    it('stores the feed and serves it against the catalogue', async () => {
      const { raidBosses, entries } = service();
      await raidBosses.load();
      const result = await raidBosses.sync();
      expect(result.status).toBe('updated');
      expect(raidBosses.lastSyncedAt).toBe(now);
      expect(raidBosses.bosses()).toHaveLength(14);
      expect(raidBosses.bossesOf(T5)).toMatchObject([
        { key: 'yveltal', name: 'Yveltal', shiny: true, source: 'feed' },
      ]);
      expect(raidBosses.autoset(T5)?.key).toBe('yveltal');
      expect(raidBosses.autoset(T3)).toBeUndefined();
      expect(await store.listActive()).toHaveLength(14);
      expect(requests).toEqual([{ url: URL, headers: { Accept: 'application/json' } }]);
      expect(entries.some((e) => e['msg'] === 'raid bosses updated')).toBe(true);
    });

    it('reports what the feed added and dropped', async () => {
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'], ['lvl3', 'STARMIE'])));
      const { raidBosses, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      now += HOUR;
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'YVELTAL'], ['lvl3', 'STARMIE'])));
      const result = await raidBosses.sync();
      expect(result).toMatchObject({
        status: 'updated',
        change: { added: [{ pokemonId: 'YVELTAL' }], removed: [{ pokemonId: 'ZEKROM' }] },
      });
      expect(changes).toHaveLength(1);
      expect(changes[0]?.added.map((b) => b.name)).toEqual(['Yveltal']);
      expect(changes[0]?.removed.map((b) => b.name)).toEqual(['Zekrom']);
      expect(raidBosses.bossesOf(T5).map((b) => b.key)).toEqual(['yveltal']);
    });

    it('does not announce the first list of a new database', async () => {
      const { raidBosses, changes } = service();
      await raidBosses.load();
      expect((await raidBosses.sync()).status).toBe('updated');
      expect(changes).toEqual([]);
    });

    it('announces a change found by the first sync after a restart', async () => {
      const first = service().raidBosses;
      await first.load();
      await first.sync();
      now += HOUR;
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
      const { raidBosses, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(changes).toHaveLength(1);
      expect(changes[0]?.added.map((b) => b.pokemonId)).toEqual(['ZEKROM']);
      expect(changes[0]?.removed).toHaveLength(14);
    });

    it('says nothing changed when the feed lists the same bosses', async () => {
      const { raidBosses, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      now += HOUR;
      expect(await raidBosses.sync()).toEqual({ status: 'unchanged' });
      expect(changes).toEqual([]);
      expect(raidBosses.lastSyncedAt).toBe(now);
      expect((await store.listActive()).every((b) => b.lastSeen === now)).toBe(true);
    });

    it('takes a new shiny flag without calling it a change of bosses', async () => {
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
      const { raidBosses, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(raidBosses.bosses()[0]?.shiny).toBe(false);
      const shiny = JSON.parse(feedOf(['lvl5', 'ZEKROM'])) as {
        currentList: { lvl5: { shiny: boolean }[] };
      };
      (shiny.currentList.lvl5[0] as { shiny: boolean }).shiny = true;
      respond = () => Promise.resolve(reply(200, JSON.stringify(shiny)));
      expect((await raidBosses.sync()).status).toBe('unchanged');
      expect(raidBosses.bosses()[0]?.shiny).toBe(true);
      expect(changes).toEqual([]);
    });

    it('shares one download between calls made together', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      const [a, b] = await Promise.all([raidBosses.sync(), raidBosses.sync()]);
      expect(requests).toHaveLength(1);
      expect(a).toBe(b);
    });

    it('warns once about a level it does not know and keeps the rest', async () => {
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'], ['lvl6', 'RAYQUAZA'])));
      const { raidBosses, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      await raidBosses.sync();
      expect(raidBosses.bosses().map((b) => b.key)).toEqual(['zekrom']);
      const warnings = entries.filter((e) => e['level'] === 'lvl6');
      expect(warnings).toHaveLength(1);
    });

    it('keeps a boss the game master does not know, under the name of the feed', async () => {
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'NEWMON'])));
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(raidBosses.bosses()).toMatchObject([
        { key: 'newmon', name: 'Newmon', entry: undefined },
      ]);
    });

    it('uses the catalogue in use at the moment it is asked', async () => {
      const data = gameDataFixture();
      const gameData = { catalogue: catalogueFixture() };
      const { log } = createTestLogger();
      const raidBosses = new RaidBossService({
        url: URL,
        refreshMs: HOUR,
        staleAfterMs: 48 * HOUR,
        store,
        gameData,
        fetch: () => Promise.resolve(reply(200, downloaded)),
        log,
        now: () => now,
      });
      await raidBosses.load();
      await raidBosses.sync();
      expect(raidBosses.bossesOf(T5)[0]?.entry?.key).toBe('yveltal');
      // A refresh of the game data swaps the catalogue; here, for one that lacks Yveltal.
      gameData.catalogue = new PokemonCatalogue({
        ...data,
        pokemon: data.pokemon.filter((entry) => entry.key !== 'yveltal'),
      });
      expect(raidBosses.bossesOf(T5)).toMatchObject([
        { key: 'yveltal', name: 'Yveltal', entry: undefined },
      ]);
    });
  });

  describe('conditional requests', () => {
    it('sends the validators of the last accepted feed and accepts 304', async () => {
      respond = () =>
        Promise.resolve(
          reply(200, downloaded, {
            etag: '"abc"',
            'last-modified': 'Sat, 10 Oct 2026 10:00:00 GMT',
          }),
        );
      const { raidBosses, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      now += HOUR;
      respond = () => Promise.resolve(reply(304));
      expect(await raidBosses.sync()).toEqual({ status: 'unchanged' });
      expect(requests[1]?.headers).toEqual({
        Accept: 'application/json',
        'If-None-Match': '"abc"',
        'If-Modified-Since': 'Sat, 10 Oct 2026 10:00:00 GMT',
      });
      expect(raidBosses.lastSyncedAt).toBe(now);
      expect(await store.lastSyncedAt()).toBe(now);
      expect(raidBosses.bosses()).toHaveLength(14);
      expect(changes).toEqual([]);
    });

    it('does not remember the validators of a feed it rejected', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      respond = () => Promise.resolve(reply(200, downloaded, { etag: '"good"' }));
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(200, '{"currentList":{}}', { etag: '"bad"' }));
      expect((await raidBosses.sync()).status).toBe('failed');
      await raidBosses.sync();
      expect(requests[2]?.headers['If-None-Match']).toBe('"good"');
    });

    it('sends no validators after a restart', async () => {
      respond = () => Promise.resolve(reply(200, downloaded, { etag: '"abc"' }));
      const first = service().raidBosses;
      await first.load();
      await first.sync();
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(requests[1]?.headers).toEqual({ Accept: 'application/json' });
    });
  });

  describe('a feed that cannot be used', () => {
    const bad: [string, () => Promise<Response>, RegExp][] = [
      ['an error status', () => Promise.resolve(reply(503, 'busy')), /answered 503/],
      ['a redirect it was not sent', () => Promise.resolve(reply(302)), /answered 302/],
      ['a page that is not JSON', () => Promise.resolve(reply(200, '<html>')), /did not send JSON/],
      ['an empty body', () => Promise.resolve(reply(200, '')), /did not send JSON/],
      [
        'JSON of another shape',
        () => Promise.resolve(reply(200, '{"message":"Not Found"}')),
        /expected format/,
      ],
      [
        'a list without bosses',
        () => Promise.resolve(reply(200, '{"currentList":{"lvl5":[]}}')),
        /lists no bosses/,
      ],
      [
        'an enormous body',
        () => Promise.resolve(reply(200, ' '.repeat(2_000_001))),
        /not the raid boss feed/,
      ],
      [
        'a network error',
        () =>
          Promise.reject(
            new TypeError('fetch failed', {
              cause: new Error('getaddrinfo ENOTFOUND example.test'),
            }),
          ),
        /ENOTFOUND/,
      ],
    ];

    it.each(bad)('keeps the list in use after %s', async (_what, response, reason) => {
      const { raidBosses, entries, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      const synced = now;
      now += HOUR;
      respond = response;
      const result = await raidBosses.sync();
      expect(result.status).toBe('failed');
      expect(result).toMatchObject({ reason: expect.stringMatching(reason) as unknown });
      expect(raidBosses.bosses()).toHaveLength(14);
      expect(raidBosses.lastSyncedAt).toBe(synced);
      expect(await store.lastSyncedAt()).toBe(synced);
      expect(changes).toEqual([]);
      expect(entries.some((e) => e['msg'] === 'could not sync the raid bosses')).toBe(true);
    });

    it('gives up on a download that stalls', async () => {
      const { raidBosses } = service({ timeoutMs: 20 });
      await raidBosses.load();
      respond = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason as Error), {
            once: true,
          });
        });
      expect(await raidBosses.sync()).toMatchObject({
        status: 'failed',
        reason: expect.stringMatching(/timed out after 20 ms/) as unknown,
      });
    });

    it('keeps the list in memory when the database fails, and recovers', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      now += HOUR;
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM']), { etag: '"new"' }));
      store.failing = new Error('connection lost');
      expect(await raidBosses.sync()).toEqual({ status: 'failed', reason: 'connection lost' });
      expect(raidBosses.bosses()).toHaveLength(14);
      store.failing = undefined;
      expect((await raidBosses.sync()).status).toBe('updated');
      expect(requests[2]?.headers['If-None-Match']).toBeUndefined();
      expect(raidBosses.bosses().map((b) => b.key)).toEqual(['zekrom']);
    });

    it('never rejects, even when the logger is broken', async () => {
      const { log } = createTestLogger();
      log.error = () => {
        throw new Error('logger down');
      };
      const raidBosses = new RaidBossService({
        url: URL,
        refreshMs: HOUR,
        staleAfterMs: 48 * HOUR,
        store,
        gameData: { catalogue: catalogueFixture() },
        fetch: () => Promise.reject(new Error('offline')),
        log,
        now: () => now,
      });
      await raidBosses.load();
      await expect(raidBosses.sync()).resolves.toMatchObject({ status: 'failed' });
    });
  });

  describe('going stale', () => {
    it('says so once after staleAfterMs without a successful sync, and again after a recovery', async () => {
      const { raidBosses, stale, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      const synced = now;
      respond = () => Promise.resolve(reply(503));

      now = synced + 48 * HOUR - 1;
      await raidBosses.sync();
      expect(stale).toEqual([]);

      now = synced + 48 * HOUR;
      await raidBosses.sync();
      expect(stale).toEqual([{ lastSyncedAt: synced, reason: `${URL} answered 503` }]);
      expect(entries.filter((e) => e['msg'] === 'the raid boss list is out of date')).toHaveLength(
        1,
      );

      now += HOUR;
      await raidBosses.sync();
      expect(stale).toHaveLength(1);

      respond = () => Promise.resolve(reply(200, downloaded));
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(503));
      now += 48 * HOUR;
      await raidBosses.sync();
      expect(stale).toHaveLength(2);
    });

    it('counts from the start of the bot when the feed has never been read', async () => {
      respond = () => Promise.resolve(reply(503));
      const { raidBosses, stale } = service();
      await raidBosses.load();
      now += 47 * HOUR;
      await raidBosses.sync();
      expect(stale).toEqual([]);
      now += HOUR;
      await raidBosses.sync();
      expect(stale).toEqual([{ lastSyncedAt: undefined, reason: `${URL} answered 503` }]);
    });

    it('counts from the last run when the bot starts with an old list', async () => {
      const first = service().raidBosses;
      await first.load();
      await first.sync();
      const synced = now;
      now += 72 * HOUR;
      respond = () => Promise.resolve(reply(503));
      const { raidBosses, stale } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(stale).toMatchObject([{ lastSyncedAt: synced }]);
    });

    it('treats a 304 as a successful sync', async () => {
      respond = () => Promise.resolve(reply(200, downloaded, { etag: '"abc"' }));
      const { raidBosses, stale } = service();
      await raidBosses.load();
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(304));
      now += 47 * HOUR;
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(503));
      now += 2 * HOUR;
      await raidBosses.sync();
      expect(stale).toEqual([]);
    });
  });

  describe('listeners', () => {
    it('keeps going when a listener throws, and stops telling one that unsubscribed', async () => {
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
      const { raidBosses, changes, entries } = service();
      const heard: string[] = [];
      raidBosses.onChange(() => {
        throw new Error('listener broke');
      });
      const unsubscribe = raidBosses.onChange(() => heard.push('second'));
      await raidBosses.load();
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'YVELTAL'])));
      expect((await raidBosses.sync()).status).toBe('updated');
      expect(changes).toHaveLength(1);
      expect(heard).toEqual(['second']);
      expect(entries.some((e) => e['msg'] === 'a raid boss listener failed')).toBe(true);

      unsubscribe();
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
      await raidBosses.sync();
      expect(changes).toHaveLength(2);
      expect(heard).toEqual(['second']);
    });
  });

  describe('overrides', () => {
    it('applies an override at once and stores it', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      const saved = await raidBosses.addOverride(override({ shiny: true }));
      expect(saved).toMatchObject({ pokemonId: 'ZEKROM', createdAt: now });
      expect(raidBosses.bossesOf(T5).map((b) => [b.key, b.source, b.shiny])).toEqual([
        ['yveltal', 'feed', true],
        ['zekrom', 'override', true],
      ]);
      expect(raidBosses.autoset(T5)).toBeUndefined();
      expect(raidBosses.overrides()).toEqual([saved]);
      expect(await store.listOverrides()).toEqual([saved]);
    });

    it('lets a moderator choose what eggs hatch as', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      await raidBosses.addOverride(override({ action: 'autoset', pokemonId: 'UMBREON', tier: T3 }));
      expect(raidBosses.autoset(T3)?.key).toBe('umbreon');
    });

    it('removes an override', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      const saved = await raidBosses.addOverride(override());
      expect(await raidBosses.removeOverride(saved.id)).toBe(true);
      expect(await raidBosses.removeOverride(saved.id)).toBe(false);
      expect(raidBosses.bosses()).toEqual([]);
      expect(raidBosses.overrides()).toEqual([]);
    });

    it('refuses an override that makes no sense, storing nothing', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      await expect(raidBosses.addOverride(override({ tier: null }))).rejects.toThrow(RangeError);
      await expect(raidBosses.addOverride(override({ expiresAt: now }))).rejects.toThrow(
        /in the future/,
      );
      expect(await store.listOverrides()).toEqual([]);
    });

    it('lets an override lapse at its expiry and deletes it at the next sync', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      await raidBosses.addOverride(override({ expiresAt: now + 30 * MINUTE }));
      now += 30 * MINUTE - 1;
      expect(raidBosses.bossesOf(T5)).toHaveLength(2);
      now += 1;
      expect(raidBosses.bossesOf(T5)).toHaveLength(1);
      expect(raidBosses.overrides()).toEqual([]);
      expect(await store.listOverrides()).toHaveLength(1);
      await raidBosses.sync();
      expect(await store.listOverrides()).toEqual([]);
    });
  });

  describe('syncing on a timer', () => {
    beforeEach(() => {
      vi.useFakeTimers({ now });
    });

    function timed() {
      const { log } = createTestLogger();
      return new RaidBossService({
        url: URL,
        refreshMs: HOUR,
        staleAfterMs: 48 * HOUR,
        store,
        gameData: { catalogue: catalogueFixture() },
        fetch: (url, init) => {
          requests.push({ url, headers: init.headers });
          return respond(url, init);
        },
        log,
      });
    }

    it('reads the feed at once on a new database, then every refreshMs', async () => {
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      expect(requests).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(HOUR - 1);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(3 * HOUR);
      expect(requests).toHaveLength(5);
      raidBosses.stop();
    });

    it('waits for the stored list to be refreshMs old after a restart', async () => {
      const first = timed();
      await first.load();
      await first.sync();
      await vi.advanceTimersByTimeAsync(20 * MINUTE);
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(40 * MINUTE - 1);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(2);
      raidBosses.stop();
    });

    it('reads the feed at once when the stored list is older than refreshMs', async () => {
      const first = timed();
      await first.load();
      await first.sync();
      await vi.advanceTimersByTimeAsync(5 * HOUR);
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(2);
      raidBosses.stop();
    });

    it('tries again refreshMs after a failure', async () => {
      respond = () => Promise.resolve(reply(503));
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(HOUR - 1);
      expect(requests).toHaveLength(1);
      respond = () => Promise.resolve(reply(200, downloaded));
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(2);
      expect(raidBosses.bosses()).toHaveLength(14);
      raidBosses.stop();
    });

    it('does not start two timers', async () => {
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(2 * HOUR);
      expect(requests).toHaveLength(3);
      raidBosses.stop();
    });

    it('stops', async () => {
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      raidBosses.stop();
      await vi.advanceTimersByTimeAsync(5 * HOUR);
      expect(requests).toHaveLength(1);
    });

    it('lets a sync in flight finish after stop, and waits for it', async () => {
      let release: (response: Response) => void = () => undefined;
      respond = () =>
        new Promise((resolve) => {
          release = resolve;
        });
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      raidBosses.stop();
      let idle = false;
      const waiting = raidBosses.whenIdle().then(() => {
        idle = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(idle).toBe(false);
      release(reply(200, downloaded));
      await waiting;
      expect(raidBosses.bosses()).toHaveLength(14);
      await vi.advanceTimersByTimeAsync(5 * HOUR);
      expect(requests).toHaveLength(1);
    });

    it('is idle at once when nothing is running', async () => {
      await expect(timed().whenIdle()).resolves.toBeUndefined();
    });
  });
});
```

`src/services/raid-boss-service.db.test.ts`:

```ts
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { readRaidBossFeed } from '../../test/support/raid-bosses.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { RaidBossRepository } from '../db/repositories/raid-boss-repository.js';
import type { DB } from '../db/types.js';
import type { BossListChange } from '../domain/pogo/raid-bosses.js';
import type { RaidTier } from '../domain/pogo/raid-tier.js';
import { RaidBossService, type FetchFeed } from './raid-boss-service.js';

const HOUR = 3_600_000;
const T5: RaidTier = { level: 'T5', shadow: false };
const SHADOW_T5: RaidTier = { level: 'T5', shadow: true };

/** The service on the real tables: what the unit tests check against a store kept in memory. */
describe('RaidBossService with the database', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let now: number;
  let body: string;
  let status: number;

  const respond: FetchFeed = () =>
    Promise.resolve({
      ok: status === 200,
      status,
      headers: { get: (name) => (name === 'etag' ? '"v1"' : null) },
      text: () => Promise.resolve(body),
    });

  function service() {
    const changes: BossListChange[] = [];
    const raidBosses = new RaidBossService({
      url: 'https://example.test/raidboss.json',
      refreshMs: HOUR,
      staleAfterMs: 48 * HOUR,
      store: new RaidBossRepository(db),
      gameData: { catalogue: catalogueFixture() },
      fetch: respond,
      log: createTestLogger().log,
      now: () => now,
    });
    raidBosses.onChange((change) => changes.push(change));
    return { raidBosses, changes };
  }

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('RaidBoss').execute();
    await db.deleteFrom('RaidBossOverride').execute();
    now = Date.UTC(2026, 9, 10, 12);
    body = JSON.stringify(readRaidBossFeed());
    status = 200;
  });

  it('syncs the downloaded feed into the tables and serves it', async () => {
    const { raidBosses } = service();
    await raidBosses.load();
    expect(raidBosses.bosses()).toEqual([]);
    expect((await raidBosses.sync()).status).toBe('updated');
    expect(raidBosses.bosses()).toHaveLength(14);
    expect(raidBosses.autoset(T5)?.key).toBe('yveltal');
    expect(raidBosses.autoset(SHADOW_T5)?.key).toBe('landorus_incarnate');
    const rows = await db.selectFrom('RaidBoss').select(['pokemonId', 'form', 'active']).execute();
    expect(rows).toHaveLength(14);
    expect(rows.find((row) => row.pokemonId === 'YVELTAL')).toEqual({
      pokemonId: 'YVELTAL',
      form: '',
      active: 1,
    });
  });

  it('carries the list, its age and the overrides over a restart', async () => {
    const first = service().raidBosses;
    await first.load();
    await first.sync();
    const override = await first.addOverride({
      action: 'autoset',
      pokemonId: 'ZEKROM',
      form: null,
      tier: T5,
      shiny: true,
      expiresAt: now + 24 * HOUR,
      createdBy: '123456789012345678',
    });
    const synced = now;
    now += 2 * HOUR;

    const { raidBosses } = service();
    await raidBosses.load();
    expect(raidBosses.lastSyncedAt).toBe(synced);
    expect(raidBosses.overrides()).toEqual([override]);
    expect(raidBosses.bossesOf(T5).map((b) => [b.key, b.source, b.autoset])).toEqual([
      ['yveltal', 'feed', false],
      ['zekrom', 'override', true],
    ]);
    expect(raidBosses.autoset(T5)).toMatchObject({ key: 'zekrom', shiny: true });
  });

  it('retires bosses the feed drops, announces the change and deletes expired overrides', async () => {
    const { raidBosses, changes } = service();
    await raidBosses.load();
    await raidBosses.sync();
    await raidBosses.addOverride({
      action: 'hide',
      pokemonId: 'YVELTAL',
      form: null,
      tier: T5,
      shiny: null,
      expiresAt: now + HOUR,
      createdBy: '123456789012345678',
    });
    expect(raidBosses.bossesOf(T5)).toEqual([]);

    now += HOUR;
    body = JSON.stringify({
      currentList: {
        lvl5: [
          { id: 'YVELTAL', form: 'YVELTAL', shiny: true, names: { English: 'Yveltal' } },
          { id: 'ZEKROM', form: 'ZEKROM', shiny: false, names: { English: 'Zekrom' } },
        ],
      },
    });
    expect((await raidBosses.sync()).status).toBe('updated');
    expect(changes).toHaveLength(1);
    expect(changes[0]?.added.map((b) => b.pokemonId)).toEqual(['ZEKROM']);
    expect(changes[0]?.removed).toHaveLength(13);
    expect(raidBosses.bosses().map((b) => b.key)).toEqual(['yveltal', 'zekrom']);
    expect(await db.selectFrom('RaidBossOverride').selectAll().execute()).toEqual([]);
    const active = await db
      .selectFrom('RaidBoss')
      .select('pokemonId')
      .where('active', '=', 1)
      .orderBy('pokemonId')
      .execute();
    expect(active.map((row) => row.pokemonId)).toEqual(['YVELTAL', 'ZEKROM']);
  });

  it('records a 304 as a successful sync and keeps the list after a failure', async () => {
    const { raidBosses } = service();
    await raidBosses.load();
    await raidBosses.sync();
    now += HOUR;
    status = 304;
    expect(await raidBosses.sync()).toEqual({ status: 'unchanged' });
    expect(await new RaidBossRepository(db).lastSyncedAt()).toBe(now);
    const synced = now;
    now += HOUR;
    status = 503;
    expect((await raidBosses.sync()).status).toBe('failed');
    expect(raidBosses.bosses()).toHaveLength(14);
    expect(await new RaidBossRepository(db).lastSyncedAt()).toBe(synced);
  });
});
```

Run: `npx vitest run --project unit src/services/raid-boss-service.test.ts`
Expected: FAIL, cannot find `./raid-boss-service.js`.

- [ ] **Step 4: Write the service**

`src/services/raid-boss-service.ts`:

```ts
import type { RaidBossStore, StoredBoss } from '../db/repositories/raid-boss-repository.js';
import { parseRaidBossFeed } from '../domain/pogo/raid-boss-feed.js';
import {
  autosetBoss,
  diffFeed,
  effectiveBosses,
  overrideProblem,
  type BossListChange,
  type BossOverride,
  type NewBossOverride,
  type RaidBoss,
} from '../domain/pogo/raid-bosses.js';
import { sameRaidTier, type RaidTier } from '../domain/pogo/raid-tier.js';
import type { Logger } from '../log.js';
import { failureReason } from './failure-reason.js';
import type { GameDataProvider } from './game-data-service.js';

/** The longest delay `setTimeout` accepts; anything longer fires immediately. */
const MAX_TIMER_MS = 2 ** 31 - 1;
/** The feed is about 30,000 characters; anything near this size is not the feed. */
const MAX_FEED_CHARS = 2_000_000;

/** The part of `fetch` this service needs. */
export type FetchFeed = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface RaidBossOptions {
  /** Address of `raidboss.json`. */
  url: string;
  /** How often the feed is read. */
  refreshMs: number;
  /** How long without a successful read before `onStale` listeners are told, once. */
  staleAfterMs: number;
  store: RaidBossStore;
  /** Bosses are matched to the catalogue in use at the moment they are asked for. */
  gameData: GameDataProvider;
  fetch: FetchFeed;
  log: Logger;
  now?: () => number;
  /** How long one download may take before it is abandoned. Default 30 seconds. */
  timeoutMs?: number;
}

/** What handlers need: the boss list in effect. */
export interface RaidBossProvider {
  /** Every boss: the feed's list with the moderators' overrides applied, by tier, then name. */
  bosses(): RaidBoss[];
  bossesOf(tier: RaidTier): RaidBoss[];
  /** What an egg of this tier hatches as when nobody says; undefined when that is not certain. */
  autoset(tier: RaidTier): RaidBoss | undefined;
}

export type SyncResult =
  /** The feed lists other bosses than before. */
  | { status: 'updated'; change: BossListChange }
  /** The feed was read and lists the same bosses. */
  | { status: 'unchanged' }
  /** The feed could not be read or was not valid; the list in use is unchanged. */
  | { status: 'failed'; reason: string };

export interface StaleFeed {
  /** When the feed was last read successfully (epoch ms); undefined if it never was. */
  lastSyncedAt: number | undefined;
  /** Why the latest attempt failed. */
  reason: string;
}

type Listener<T> = (event: T) => void;

/**
 * Keeps the raid boss list: reads the feed on a timer, stores it, and applies the moderators'
 * overrides. Nothing happens until `load` is called, and `load` never uses the network: the bot
 * starts with the list of the last run and the feed is read in the background.
 */
export class RaidBossService implements RaidBossProvider {
  private feed: StoredBoss[] = [];
  private overrideList: BossOverride[] = [];
  private loaded = false;
  private syncedAt: number | undefined;
  private attemptedAt: number | undefined;
  private readonly startedAt: number;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private validators: { etag?: string; lastModified?: string } = {};
  private inFlight: Promise<SyncResult> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private staleReported = false;
  private readonly reportedLevels = new Set<string>();
  private readonly changeListeners = new Set<Listener<BossListChange>>();
  private readonly staleListeners = new Set<Listener<StaleFeed>>();

  constructor(private readonly options: RaidBossOptions) {
    this.now = options.now ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.startedAt = this.now();
  }

  /** Reads the stored list and overrides. Does not download anything. */
  async load(): Promise<void> {
    const { store } = this.options;
    [this.feed, this.overrideList, this.syncedAt] = await Promise.all([
      store.listActive(),
      store.listOverrides(),
      store.lastSyncedAt(),
    ]);
    this.loaded = true;
  }

  bosses(): RaidBoss[] {
    if (!this.loaded) throw new Error('The raid boss list has not been loaded yet');
    return effectiveBosses(
      this.feed,
      this.overrideList,
      this.options.gameData.catalogue,
      this.now(),
    );
  }

  bossesOf(tier: RaidTier): RaidBoss[] {
    return this.bosses().filter((boss) => sameRaidTier(boss.tier, tier));
  }

  autoset(tier: RaidTier): RaidBoss | undefined {
    return autosetBoss(this.bosses(), tier);
  }

  /** When the feed was last read successfully (epoch ms); undefined if it never was. */
  get lastSyncedAt(): number | undefined {
    return this.syncedAt;
  }

  /** The overrides in force, oldest first. */
  overrides(): BossOverride[] {
    const now = this.now();
    return this.overrideList.filter((o) => o.expiresAt === null || o.expiresAt > now);
  }

  /**
   * Stores an override; it applies at once. One with the same action for the same Pokémon and
   * tier replaces the earlier one. Throws a RangeError for an override that makes no sense.
   */
  async addOverride(override: NewBossOverride): Promise<BossOverride> {
    const now = this.now();
    const problem = overrideProblem(override, now);
    if (problem) throw new RangeError(problem);
    const saved = await this.options.store.saveOverride(override, now);
    this.overrideList = await this.options.store.listOverrides();
    return saved;
  }

  /** Whether there was such an override. */
  async removeOverride(id: number): Promise<boolean> {
    const removed = await this.options.store.removeOverride(id);
    this.overrideList = await this.options.store.listOverrides();
    return removed;
  }

  /**
   * Called after a sync in which the feed's bosses changed. Not called for the first sync of a
   * new database, where there is nothing to compare with. Returns a function that unsubscribes.
   */
  onChange(listener: Listener<BossListChange>): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /**
   * Called once when the feed has not been read successfully for `staleAfterMs`, and again only
   * after it has worked in between. Returns a function that unsubscribes.
   */
  onStale(listener: Listener<StaleFeed>): () => void {
    this.staleListeners.add(listener);
    return () => this.staleListeners.delete(listener);
  }

  /**
   * Reads the feed and, if it is valid, stores it as the list. Never rejects: a feed that cannot
   * be read or is not valid leaves the list as it is. Calls made while one is running share its
   * result.
   */
  sync(): Promise<SyncResult> {
    this.inFlight ??= this.syncOnce().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  /** Resolves once no sync is in flight (at once when none is). Never rejects. */
  async whenIdle(): Promise<void> {
    while (this.inFlight) await this.inFlight;
  }

  /**
   * Reads the feed `refreshMs` after the last attempt (at once when the stored list is older
   * than that or there is none), and again after every attempt. Calling it again while a sync is
   * scheduled changes nothing.
   */
  startAutoSync(): void {
    this.stopped = false;
    if (this.timer) return;
    this.schedule();
  }

  /** Cancels the scheduled sync. One already running finishes but schedules nothing. */
  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    const last = this.attemptedAt ?? this.syncedAt;
    const due = last === undefined ? 0 : last + this.options.refreshMs - this.now();
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.sync().finally(() => {
          if (!this.stopped) this.schedule();
        });
      },
      Math.min(Math.max(due, 0), MAX_TIMER_MS),
    );
    this.timer.unref();
  }

  private async syncOnce(): Promise<SyncResult> {
    const now = this.now();
    this.attemptedAt = now;
    let change: BossListChange;
    try {
      change = await this.readFeed(now);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.safely(() => this.options.log.error({ err }, 'could not sync the raid bosses'));
      this.reportIfStale(now, reason);
      return { status: 'failed', reason };
    }
    const first = this.syncedAt === undefined;
    this.syncedAt = now;
    this.staleReported = false;
    if (change.added.length === 0 && change.removed.length === 0) return { status: 'unchanged' };
    this.safely(() =>
      this.options.log.info(
        {
          added: change.added.map((boss) => boss.name),
          removed: change.removed.map((boss) => boss.name),
        },
        'raid bosses updated',
      ),
    );
    if (!first) this.emit(this.changeListeners, change);
    return { status: 'updated', change };
  }

  /** Downloads, checks and stores the feed; returns what changed. Throws when anything fails. */
  private async readFeed(now: number): Promise<BossListChange> {
    const { store, url } = this.options;
    const signal = AbortSignal.timeout(this.timeoutMs);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.validators.etag) headers['If-None-Match'] = this.validators.etag;
    if (this.validators.lastModified) headers['If-Modified-Since'] = this.validators.lastModified;

    let status: number;
    let body = '';
    let validators: RaidBossService['validators'] = {};
    try {
      const response = await this.options.fetch(url, { signal, headers });
      status = response.status;
      if (response.ok) {
        body = await response.text();
        validators = {
          etag: response.headers.get('etag') ?? undefined,
          lastModified: response.headers.get('last-modified') ?? undefined,
        };
      }
    } catch (err) {
      const reason = signal.aborted ? `timed out after ${this.timeoutMs} ms` : failureReason(err);
      throw new Error(`${url}: ${reason}`, { cause: err });
    }

    if (status === 304) {
      await store.touchActive(now);
      this.feed = await store.listActive();
      return { added: [], removed: [] };
    }
    if (status < 200 || status > 299) throw new Error(`${url} answered ${status}`);
    if (body.length > MAX_FEED_CHARS) {
      throw new Error(`${url} sent ${body.length} characters, which is not the raid boss feed`);
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error(`${url} did not send JSON`);
    }
    const { bosses, unknownLevels } = parseRaidBossFeed(json);
    for (const level of unknownLevels) {
      if (this.reportedLevels.has(level)) continue;
      this.reportedLevels.add(level);
      this.options.log.warn({ level }, 'the raid boss feed has a level Pine does not know');
    }
    const change = diffFeed(this.feed, bosses);
    await store.replaceFeed(bosses, now);
    await store.removeExpiredOverrides(now);
    [this.feed, this.overrideList] = await Promise.all([store.listActive(), store.listOverrides()]);
    // Remembered only for a feed that was accepted: a 304 must never vouch for a rejected one.
    this.validators = validators;
    return change;
  }

  private reportIfStale(now: number, reason: string): void {
    const since = this.syncedAt ?? this.startedAt;
    if (this.staleReported || now - since < this.options.staleAfterMs) return;
    this.staleReported = true;
    this.safely(() =>
      this.options.log.warn(
        {
          lastSyncedAt: this.syncedAt === undefined ? null : new Date(this.syncedAt).toISOString(),
        },
        'the raid boss list is out of date',
      ),
    );
    this.emit(this.staleListeners, { lastSyncedAt: this.syncedAt, reason });
  }

  /** A listener that throws must not stop the others, or the sync. */
  private emit<T>(listeners: ReadonlySet<Listener<T>>, event: T): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        this.safely(() => this.options.log.error({ err }, 'a raid boss listener failed'));
      }
    }
  }

  /** A broken logger must not turn a finished sync into a rejected one. */
  private safely(action: () => void): void {
    try {
      action();
    } catch {
      // Nothing useful can be done about a logger that throws.
    }
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --project unit src/services`
Expected: PASS; `raid-boss-service.test.ts` has 46 tests.

Run (Docker): `npx vitest run --project db src/services/raid-boss-service.db.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Format, check and commit**

```bash
npx prettier --write src/services test/support/raid-bosses.ts
npm run check
git add src/services test/support/raid-bosses.ts
git commit -m "Add RaidBossService: sync the feed on a timer, keep the last good list, overrides, change and stale events" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Settings, wiring and the feed check

**Files:**
- Modify: `src/config/settings.ts`, `src/config/settings.test.ts`, `test/fixtures/settings.json`, `data/settings.json`, `src/app-context.ts`, `src/app.ts`, `test/support/test-context.ts`, `package.json`, `CLAUDE.md`
- Create: `scripts/raid-bosses/check-feed.ts`

**Interfaces:**
- Consumes: `RaidBossService`, `RaidBossProvider` (Task 5); `RaidBossRepository` (Task 4); `raidBossesFixture` (Task 5).
- Produces: `settings.raidBosses: { url: string; refreshMinutes: number; staleAfterHours: number; announceChanges: boolean }`; `AppContext.raidBosses: RaidBossProvider`; `npm run raid-bosses:check`.

`announceChanges` is read in Phase 5, when changes are posted to the bot-updates channel; this task only defines and validates it.

- [ ] **Step 1: Write the failing settings test**

`src/config/settings.test.ts`:

```diff
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -55,6 +55,42 @@ describe('loadSettings', () => {
     }
   });
 
+  it('reads the raid boss settings', () => {
+    expect(loadSettings(writeSettings(() => undefined)).raidBosses).toEqual({
+      url: 'https://pokemon-go-api.github.io/pokemon-go-api/api/raidboss.json',
+      refreshMinutes: 60,
+      staleAfterHours: 48,
+      announceChanges: false,
+    });
+  });
+
+  it('rejects raid boss settings that are missing or out of range', () => {
+    const cases: [string, unknown][] = [
+      ['url', 'file:///etc/passwd'],
+      ['url', 'raidboss.json'],
+      ['refreshMinutes', 4],
+      ['refreshMinutes', 1441],
+      ['refreshMinutes', 7.5],
+      ['staleAfterHours', 0],
+      ['staleAfterHours', 721],
+      ['announceChanges', 'yes'],
+    ];
+    for (const [key, value] of cases) {
+      const file = writeSettings((s) => {
+        (s.raidBosses as Record<string, unknown>)[key] = value;
+      });
+      expect(() => loadSettings(file), `${key} = ${String(value)}`).toThrow(new RegExp(key));
+    }
+    const without = writeSettings((s) => {
+      delete s.raidBosses;
+    });
+    expect(() => loadSettings(without)).toThrow(/raidBosses/);
+    const extra = writeSettings((s) => {
+      (s.raidBosses as Record<string, unknown>).fallbackUrl = 'https://example.test';
+    });
+    expect(() => loadSettings(extra)).toThrow(/fallbackUrl/);
+  });
+
   it('rejects a missing required key', () => {
     const file = writeSettings((s) => {
       delete s.cleanupInterval;
```

Run: `npx vitest run --project unit src/config/settings.test.ts`
Expected: FAIL in "reads the raid boss settings".

- [ ] **Step 2: Add the settings block**

`src/config/settings.ts`:

```diff
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -78,6 +78,15 @@ export const settingsSchema = z.strictObject({
     textUrl: z.url({ protocol: /^https?$/ }),
     refreshHours: z.number().int().min(1).max(168),
   }),
+  raidBosses: z.strictObject({
+    /** Address of the raid boss feed (`raidboss.json` of pokemon-go-api). */
+    url: z.url({ protocol: /^https?$/ }),
+    refreshMinutes: z.number().int().min(5).max(1440),
+    /** After this long without a successful read, the moderators are warned once. */
+    staleAfterHours: z.number().int().min(1).max(720),
+    /** Post changes of the boss list to the bot-updates channel. */
+    announceChanges: z.boolean(),
+  }),
 });
 
 export type Settings = z.output<typeof settingsSchema>;
```

`test/fixtures/settings.json` and `data/settings.json` get the same change (this is the one permitted edit to `data/settings.json`; change nothing else in it):

```diff
--- a/test/fixtures/settings.json
+++ b/test/fixtures/settings.json
@@ -87,5 +87,11 @@
     "gameMasterUrl": "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json",
     "textUrl": "https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/English.txt",
     "refreshHours": 24
+  },
+  "raidBosses": {
+    "url": "https://pokemon-go-api.github.io/pokemon-go-api/api/raidboss.json",
+    "refreshMinutes": 60,
+    "staleAfterHours": 48,
+    "announceChanges": false
   }
 }
```

Run: `npx vitest run --project unit src/config/settings.test.ts`
Expected: PASS.

- [ ] **Step 3: Put the boss list in the context**

`src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -5,6 +5,7 @@ import type { CommandModule } from './discord/command.js';
 import type { IntentFlags } from './discord/intents.js';
 import type { Logger } from './log.js';
 import type { GameDataProvider } from './services/game-data-service.js';
+import type { RaidBossProvider } from './services/raid-boss-service.js';
 
 /** Everything a handler may use. Later phases add services here. */
 export interface AppContext {
@@ -14,6 +15,8 @@ export interface AppContext {
   readonly commands: readonly CommandModule[];
   /** Pokémon, moves and type data from the game master. */
   readonly gameData: GameDataProvider;
+  /** The raid bosses in effect: the feed's list with the moderators' overrides. */
+  readonly raidBosses: RaidBossProvider;
   /** Privileged-intent features actually granted at login (may be fewer than configured). */
   features: IntentFlags;
 }
```

`test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -5,6 +5,7 @@ import { loadEnv } from '../../src/config/env.js';
 import { loadSettings } from '../../src/config/settings.js';
 import type { DB } from '../../src/db/types.js';
 import { catalogueFixture } from './game-data.js';
+import { raidBossesFixture } from './raid-bosses.js';
 import { createTestLogger } from './test-logger.js';
 import { TEST_ENV } from './test-env.js';
 
@@ -20,6 +21,7 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     db: {} as Kysely<DB>,
     commands: [],
     gameData: { catalogue: catalogueFixture() },
+    raidBosses: raidBossesFixture(),
     features: { ocrPassive: false, autoAssignRole: false },
     ...overrides,
   };
```

- [ ] **Step 4: Start and stop the service with the bot**

`src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -6,6 +6,7 @@ import { dbConfigFrom } from './db/db-config.js';
 import { createDb } from './db/kysely.js';
 import { runMigrations } from './db/migrator.js';
 import { GuildRepository } from './db/repositories/guild-repository.js';
+import { RaidBossRepository } from './db/repositories/raid-boss-repository.js';
 import type { DB } from './db/types.js';
 import { createClient, loginWithFallback } from './discord/client.js';
 import { attachGatewayHandlers } from './discord/gateway-events.js';
@@ -13,11 +14,13 @@ import { syncGuilds } from './discord/guild-sync.js';
 import { InteractionRouter } from './discord/router.js';
 import { createLogger, type Logger } from './log.js';
 import { GameDataService } from './services/game-data-service.js';
+import { RaidBossService } from './services/raid-boss-service.js';
 import { createShutdown } from './shutdown.js';
 
 /** Parsed game data is kept here between runs, so the bot can start while offline. */
 const GAME_DATA_CACHE = 'var/game-data-cache.json';
-const HOUR_MS = 3_600_000;
+const MINUTE_MS = 60_000;
+const HOUR_MS = 60 * MINUTE_MS;
 
 export interface StartOptions {
   /** Called when the gateway closes for good; receives the shutdown to run before exiting. */
@@ -43,20 +46,32 @@ export async function startApp(
     fetch: (url, init) => fetch(url, init),
     log,
   });
+  const raidBosses = new RaidBossService({
+    url: config.settings.raidBosses.url,
+    refreshMs: config.settings.raidBosses.refreshMinutes * MINUTE_MS,
+    staleAfterMs: config.settings.raidBosses.staleAfterHours * HOUR_MS,
+    store: new RaidBossRepository(db),
+    gameData,
+    fetch: (url, init) => fetch(url, init),
+    log,
+  });
   try {
     await runMigrations(db, log);
     await gameData.load();
+    // Reads the list of the last run from the database; the feed is read in the background.
+    await raidBosses.load();
   } catch (err) {
     await db.destroy();
     throw err;
   }
   gameData.startAutoRefresh();
+  raidBosses.startAutoSync();
 
   const requested = {
     ocrPassive: config.settings.ocr.passive,
     autoAssignRole: config.settings.autoAssignRole,
   };
-  const ctx: AppContext = { config, log, db, commands, gameData, features: requested };
+  const ctx: AppContext = { config, log, db, commands, gameData, raidBosses, features: requested };
   const router = new InteractionRouter(ctx, commands, []);
   const guilds = new GuildRepository(db);
 
@@ -97,6 +112,15 @@ export async function startApp(
           await gameData.whenIdle();
         },
       },
+      {
+        name: 'raid boss sync',
+        // A sync in flight may be writing the list; give it time to finish before the pool closes.
+        timeoutMs: 5_000,
+        run: async () => {
+          raidBosses.stop();
+          await raidBosses.whenIdle();
+        },
+      },
       { name: 'discord', timeoutMs: 5_000, run: () => client.destroy() },
       { name: 'database', timeoutMs: 5_000, run: () => db.destroy() },
     ],
```

Do not start the bot to try this. `raidBosses.load()` only reads the database; the first download happens on the timer, after the bot has started.

- [ ] **Step 5: Add the feed check script**

`scripts/raid-bosses/check-feed.ts`:

```ts
/**
 * Downloads the raid boss feed and prints the boss list Pine would make of it. It writes nothing
 * and needs neither the database nor Discord: run it with `npm run raid-bosses:check` to see
 * whether the feed still has the format Pine expects, which level keys it does not know, and
 * which bosses the game data does not know.
 *
 * The address is `raidBosses.url` in data/settings.json, or the first argument. The game data is
 * the bot's saved copy (var/game-data-cache.json) when there is one, otherwise the test fixture.
 *
 * The test fixture test/fixtures/raid-boss-feed.json is a copy of the feed of 2026-10-10 and is
 * not refreshed by this script: the tests name its bosses.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadSettings } from '../../src/config/settings.js';
import { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
import { GAME_DATA_VERSION, type GameData } from '../../src/domain/pogo/game-master.js';
import { parseRaidBossFeed } from '../../src/domain/pogo/raid-boss-feed.js';
import { autosetBoss, effectiveBosses } from '../../src/domain/pogo/raid-bosses.js';
import { raidTierLabel, sameRaidTier } from '../../src/domain/pogo/raid-tier.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function loadGameData(): { data: GameData; source: string } {
  const cache = path.join(repoRoot, 'var/game-data-cache.json');
  if (existsSync(cache)) {
    const saved = JSON.parse(readFileSync(cache, 'utf8')) as { version?: number; data: GameData };
    if (saved.version === GAME_DATA_VERSION) return { data: saved.data, source: cache };
  }
  const fixture = path.join(repoRoot, 'test/fixtures/game-data.json');
  return { data: JSON.parse(readFileSync(fixture, 'utf8')) as GameData, source: fixture };
}

const url =
  process.argv[2] ?? loadSettings(path.join(repoRoot, 'data/settings.json')).raidBosses.url;
const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`${url} answered ${response.status}`);
const { bosses: feed, unknownLevels } = parseRaidBossFeed(await response.json());

const { data, source } = loadGameData();
const bosses = effectiveBosses(feed, [], new PokemonCatalogue(data), Date.now());

const lines = [`Feed: ${url}`, `Game data: ${source}`, ''];
let previous = '';
for (const boss of bosses) {
  const label = raidTierLabel(boss.tier);
  if (label !== previous) {
    const only = autosetBoss(bosses, boss.tier);
    lines.push(`${label}${only ? ' (eggs hatch as this boss)' : ''}`);
    previous = label;
  }
  const known = boss.entry ? boss.key : 'NOT IN THE GAME DATA';
  lines.push(`  ${boss.name}${boss.shiny ? ' (shiny)' : ''}  [${known}]`);
}
const tiers = bosses.filter(
  (boss, index) => bosses.findIndex((other) => sameRaidTier(other.tier, boss.tier)) === index,
).length;
lines.push('', `${bosses.length} bosses in ${tiers} tiers.`);
if (unknownLevels.length > 0) lines.push(`Levels Pine does not know: ${unknownLevels.join(', ')}`);
const unknown = bosses.filter((boss) => !boss.entry);
if (unknown.length > 0) {
  lines.push(`Not in the game data: ${unknown.map((boss) => boss.name).join(', ')}`);
}
process.stdout.write(`${lines.join('\n')}\n`);
```

`package.json`:

```diff
--- a/package.json
+++ b/package.json
@@ -15,6 +15,7 @@
     "deploy-commands": "tsx --env-file-if-exists=.env src/discord/deploy-cli.ts",
     "db:legacy-fixture": "tsx scripts/legacy-schema/generate.ts",
     "fixtures:game-data": "tsx scripts/game-data/make-fixtures.ts",
+    "raid-bosses:check": "tsx scripts/raid-bosses/check-feed.ts",
     "db:codegen": "tsx scripts/codegen.ts",
     "typecheck": "tsc --noEmit",
     "lint": "eslint .",
```

Do not run the script: it uses the network. The controller runs it after the final review.

- [ ] **Step 6: Record the conventions in `CLAUDE.md`**

In the "Commands" block, directly before the `npm run migrate` line, add:

```bash
npm run raid-bosses:check    # download the raid boss feed and print the list Pine makes of it (writes nothing)
```

In the "Conventions" list, directly before the line that begins "- The bot downloads the game data at start", add:

```markdown
- Raid bosses come from `ctx.raidBosses` (`bosses()`, `bossesOf(tier)`, `autoset(tier)`): the feed's list (`settings.raidBosses`, synced into the `RaidBoss` table by `RaidBossService`) with the moderators' overrides (`RaidBossOverride`) applied. A boss newer than the game master has no catalogue entry (`entry` is undefined): show its `name`. The legacy `Pokemon.tier` / `exclusive` / `mega` / `elite` / `shiny` columns and `AutosetPokemon` are never read.
```

Replace the line that begins "- Tests never use the network." with:

```markdown
- Tests never use the network. Game data in tests comes from the fixtures built by `scripts/game-data/make-fixtures.ts` (`catalogueFixture()`, `gameDataFixture()`); raid bosses come from `test/support/raid-bosses.ts` (`readRaidBossFeed()`, `raidBossesFixture()`, and `MemoryRaidBossStore` for the service).
```

- [ ] **Step 7: Format, check and commit**

```bash
npx prettier --write src/config src/app.ts src/app-context.ts test/support/test-context.ts scripts/raid-bosses package.json
npm run check
npm run build
git add src/config src/app.ts src/app-context.ts test/support/test-context.ts test/fixtures/settings.json data/settings.json scripts/raid-bosses package.json CLAUDE.md
git commit -m "Wire the raid boss list into the bot: settings, context, start and shutdown, a feed check script" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 505 unit tests; `npm run build` succeeds.

---

## After the last task (controller)

- Run `npm run test:db` (91 tests) and `npm run db:codegen -- --verify`.
- Run `npm run raid-bosses:check` once: this is the spec's "the boss list syncs from the live feed". Record its output in the ledger, including any level Pine does not know and any boss not in the game data.
- Final whole-branch review on Opus at high effort; one fix wave.
- Update `docs/superpowers/plans/phase-0-follow-ups.md` (a "From Phase 1B-2" section with the items below and whatever the reviews leave open), the status line in `CLAUDE.md`, `docs/superpowers/gantt.html` and memory; delete the local branch `proto/1b2` and its worktree `var/proto-1b2`; then stop and ask Matt to compact.

## Not in this plan

Recorded for the follow-ups file when the phase ends:

- **Phase 1C:** the search index must be rebuilt when the catalogue changes; `GameDataProvider` still exposes only `catalogue` (compare object identity, or add a revision number then). The boss list needs no signal: it resolves bosses each time it is asked. Searching must go through `catalogue.byKey` so that `landorus`, `giratina` and costume ids keep working, and nicknames from `PokemonRepository.nicknames()` are already keyed by entry keys for the default forms.
- **Phase 2:** an egg of a tier hatches as `ctx.raidBosses.autoset(tier)`; a raid's boss is stored by catalogue key, or by the feed's name when `entry` is undefined. Escape the feed's `name` before showing it (it is free text from outside). Boss CP is `raidBossCp(entry.stats, bossStamina(tier))`.
- **Phase 4:** matching a notification's Pokédex number against a boss uses `entry.dex`; a boss without an entry matches nobody.
- **Phase 5:** `/admin boss` (list, add, hide, autoset, shiny, remove, sync) on `RaidBossService.addOverride` / `removeOverride` / `overrides()` / `sync()`, using `bossIdsOf(entry)` for the ids and turning the `RangeError` of `addOverride` into a `UserError`; post `onChange` to bot-updates when `settings.raidBosses.announceChanges` and `onStale` to the mod bot channel; `ctx.raidBosses` is only a `RaidBossProvider`, so the command needs the service itself (as with `GameDataService`). An override for a Pokémon the game master does not know cannot be given a name (it shows as the title-cased id).
- **Phase 6:** the Pokebattler name of 14 default forms is now `<FORM>_FORM` where the legacy data had the bare species id (`LEGACY_SPECIES_ID_FOR_DEFAULT_FORM` in `legacy-names.test.ts`); check which Pokebattler accepts.
- **Phase 8:** rollback needs nothing for the two new tables (the legacy bot does not know them). A `Pokemon` row the new bot creates for a nickname of a default form is named as the legacy data names it (`landorus`, `hoopa_confined`).
- **Upkeep:** the boss stamina of a super mega raid (`BOSS_STAMINA.SuperMega` in `raid-tier.ts`) is the mega legendary value until the real figure is known. Phase 4: `/want` offers the super mega tier (code -7). Phase 8 rollback: -7 rows are inside the legacy range, so the `pokemon < -8` clean-up does not remove them; delete `(-7, raid)` rows too. Retired `RaidBoss` rows are never deleted (a few hundred a year). Urshifu and Minior keep a bare entry that is neither of their forms; add them to `DEFAULT_FORMS` if they become raid bosses and a default is agreed. A change to `DEFAULT_FORMS` or to the rule changes keys: bump `GAME_DATA_VERSION`.
