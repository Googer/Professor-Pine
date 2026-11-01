# Phase 4F: What the Staging of Phase 4 Found, and the End of the EX Raid Tier: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Do what Matt decided from the staging of Phase 4 on 2026-10-13 (the order of Pokémon choices, `/wild`, trains under privacy and auto-status, role menus, small wordings, a look at speed) and remove the EX raid tier.

**Architecture:** Seven independent tasks on what Phases 1 to 4 built. The game master's class of a species (legendary, mythical, ultra beast) becomes a field of the catalogue and feeds two things: what `/wild` refuses and the order of search hits. `PokemonSearch.find` says how each hit fits (`exact`, `word`, `beginning`, `loose`, `guess`), and the lists of `/want` and of a train's `/boss` are built from that. The EX tier leaves the tier list, with a migration for stored wants and tolerant readers for whatever else is stored. A small memory of row ids (`RowIds`) removes look-ups that were repeated on every command.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Kysely on MySQL, Vitest. No new dependencies. One migration (`2026_10_13_009_ex_wants_to_elite`), which changes rows and no schema.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`. This plan implements decisions newer than the spec: `docs/superpowers/plans/phase-0-follow-ups.md`, "From the Phase 4 staging run" and "From Phase 5A, while it was being prototyped". The design brief is the git-ignored `.superpowers/sdd/phase-4f-design.md`; the reviews and the rulings on them are `review-a.txt`, `review-b.txt`, `review-rulings.md` and `review-rulings-2.md` in `.superpowers/sdd/2026-10-13-phase-4f-staging-fixes/`.

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task, with the typecheck and the tests of each task clean and the full check, build and database suite clean on the tip (4,047 unit tests; the database suite, 268 tests). Two reviewers went through that branch, a third through the first fixes, and the second fixes carry out what the third found. If something does not pass as written, suspect a transcription slip before suspecting the plan.

## Decisions made in this plan

1. **The class of a Pokémon.** `PokemonEntry.class` is `'legendary' | 'mythical' | 'ultra-beast' | null`, from the game master's `pokemonClass`, the same for every form and mega of a species. `GAME_DATA_VERSION` is 4, so the saved copy is downloaded anew.
2. **What never appears in the wild** (Matt): every legendary, mythical and ultra beast, megas and primals; refused by `/wild` with a sentence and not offered. The exceptions are the setting `wildSpawnExceptions` (default Uxie, Mesprit, Azelf). The Galarian birds stay refused for now: they appear only from a Daily Adventure Incense, to one trainer (Matt expects this may change, hence a setting). Regional Pokémon are not restricted.
3. **`/wild`:** `details` is required (where it is); option order `pokemon`, `details`, `iv`. A single letter sent without picking is refused. The private answer names the channel once; the help says five reports in half an hour.
4. **The order of search hits, everywhere:** a whole word of a name before a beginning, a beginning before anything looser, a guess (a misspelling) last. Among hits led by the species' own name (or the beginning of a nickname), a legendary, mythical or ultra-beast species stands first, at most three entries of one species (`CLASS_LIFTS`); its other entries stand where they would without a class.
5. **Guesses are narrower.** A nickname is never read as a misspelling; a word of an alias (a costume) alone does not find its species; a word of up to five letters must keep its first letter; the second, lenient try accepts only two neighbouring letters swapped.
6. **`/want`'s list:** the Pokémon named in full; then current raid bosses found by name (asked for by themselves, so none is cut off); then tier and IV words (matched on their names, not on "raids" or "spawns"); then the other proper matches; then guesses, only where the label shows the guessed word. The words of a label find its choice (`tyranitar base`, `giratina every form`). After `shadow`: no class preference, what can be shadow first, no megas, a single letter is not Unown. A train's `/boss` list follows the same order.
7. **Trains follow privacy and auto-status** (Matt): the maker is signed up as their auto-status says (None: not at all; Here counts as Coming), and an anonymous maker is named neither in the post nor in the new-train DM. A maker who is not signed up may still lay the first route, add, remove and move stops that do not move the train, and set the times; moving the train and being conductor need a sign-up. The archive warning may ping the maker of an anonymous train. Meetups are untouched.
8. **Role menus** give only what the message showed unticked and is now ticked; "None" that already stood ticked is no change. The list's heading counts the roles that can be given.
9. **The EX raid tier is gone** (Matt). `RaidLevel` has no `EX`, the duration kind `exclusive` is gone. A stored EX want becomes an elite want by migration 009 (removed when the member already has the elite want); a stored raid with the EX tier is read as elite; `RaidBoss` rows with it are left out and set inactive by the next sync, an override with it is left out and logged once; an "EX Raids" heading of the feed is an unknown heading; the retired settings keys are stripped before the strict check. Nothing about elite raid **gyms** changes (the columns, the mirror kind `ex`, `features.exGymChannel`, `channels['elite-gym-raids']`).
10. **Speed.** A round trip to the database takes under a millisecond; the 0.6 seconds measured in staging are not there (every slow command defers, so it makes two requests to Discord; to be measured at the next staging). What was plainly repeated is removed: a server's and a member's row ids are remembered per process (`RowIds`), with a repair when a remembered row is gone. `round-trips.db.test.ts` pins the counts.
11. **Left as it is:** `/raid`'s optional `time` (Matt); the menus vanishing when the bot lacks Manage Roles; a short word that lost its first letter finds nothing; a member Here on a train without a route stays Here.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files (`data/settings.json` is the new bot's and changes here). Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure. Repositories are the only code that knows column names; a write in several steps goes through `inTransaction`.
- **Tests never use the network and never contact Discord.** Database tests never use production rows.
- Generated files are regenerated, never hand-edited: `test/fixtures/game-data.json` with `npm run fixtures:game-data` (Task 1). `src/db/types.ts` does not change.
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Each task names the commit of the prototype it transcribes (branch `proto/phase-4f` of this repository). `git diff <that commit> -- src test scripts data/settings.json` must print nothing before the task is committed; fix differences by hand, never by checking files out of that commit.
- Inside the plan a task needs the typecheck and its own tests green; the full `npm run check` must be green after the last task. `npx prettier --write <files you touched>` before every commit.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path. A commit title must not start with a slash.

## Review Focus

1. A proper match must never be pushed out of the 25 choices by worse ones: Task 2, the tests of `ty`, `typ`, `arc`, `ar`, `sil`, `for`, `s` and `m` with a boss, in `pokemon-search.test.ts`, the wants tests and the train `/boss` tests.
2. The search must not act on or offer a wrong Pokémon by a guess: Task 2, the tests of `kabuto`, `regirock`, `gangar`, `star`, `none`, `lake`, `hundo`, and that `lugai` and `mwetwo` still find theirs.
3. A role is never given or taken that the member did not ask for: Task 5, the menu tests (a stale message, "None" already ticked, a group since made pick-one).
4. A remembered row id must never produce a wrong answer or a lasting failure: Task 7, `member-rows.db.test.ts` (a remembered member row gone, a remembered server row gone, nothing remembered from a failed or a caller's transaction, two first changes at once).
5. Nothing stored with the EX tier stops a start or is lost silently: Task 6, the migration's database test, the party-state test (EX read as elite), the repository tests of `RaidBoss` and `RaidBossOverride` rows, the settings test of the retired keys.

---

## File Structure

New files (everything else is modified in place; each task lists its files):

```
src/domain/pogo/wild.test.ts  (create, task 1)
src/domain/pogo/wild.ts  (create, task 1)
src/db/migrations/2026_10_13_009_ex_wants_to_elite.db.test.ts  (create, task 6)
src/db/migrations/2026_10_13_009_ex_wants_to_elite.ts  (create, task 6)
src/commands/round-trips.db.test.ts  (create, task 7)
src/db/repositories/member-rows.db.test.ts  (create, task 7)
src/db/repositories/row-ids.test.ts  (create, task 7)
src/db/repositories/row-ids.ts  (create, task 7)
```

---

### Task 1: Game data: the class of a Pokémon, and what appears in the wild

**Files:**
- Create: `src/domain/pogo/wild.test.ts`, `src/domain/pogo/wild.ts`
- Modify: `data/settings.json`, `scripts/game-data/make-fixtures.ts`, `src/config/settings.test.ts`, `src/config/settings.ts`, `src/domain/pogo/game-master.test.ts`, `src/domain/pogo/game-master.ts`, `test/fixtures/game-data.json`, `test/fixtures/settings.json`

**Interfaces:**
- Consumes: The game master parser and `PokemonEntry` of `src/domain/pogo/`; `GAME_DATA_VERSION`; `scripts/game-data/make-fixtures.ts`; the settings schema.
- Produces: `PokemonEntry.class` (`PokemonClass | null`), kept by the parser for every form and mega of a species; `GAME_DATA_VERSION` 4; the rebuilt fixture `test/fixtures/game-data.json`; `src/domain/pogo/wild.ts` (pure): `wildExceptions(catalogue, texts)` (the species a list of names or keys means, with the texts it does not know) and `appearsInWild(entry, exceptions)`; the setting `wildSpawnExceptions` (default Uxie, Mesprit, Azelf) in the schema, `data/settings.json` and the test fixture; the fixtures script skips the icons fixture when its source file is missing.

The fixture is generated, not printed in this plan: run `npm run fixtures:game-data` after Step 2.

Reference commit of the prototype for this task: `e4e442a`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/config/settings.test.ts`:

```diff
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -32,6 +32,27 @@ describe('loadSettings', () => {
     expect(() => loadSettings(file)).toThrow(/commandPrefix/);
   });
 
+  it('names the species that spawn although they have a class, by default the lake trio', () => {
+    expect(loadSettings(REPO_SETTINGS).wildSpawnExceptions).toEqual(['Uxie', 'Mesprit', 'Azelf']);
+    // A file from before the setting starts, with the default.
+    const without = writeSettings((s) => {
+      delete s.wildSpawnExceptions;
+    });
+    expect(loadSettings(without).wildSpawnExceptions).toEqual(['Uxie', 'Mesprit', 'Azelf']);
+    const own = writeSettings((s) => {
+      s.wildSpawnExceptions = ['articuno_galarian'];
+    });
+    expect(loadSettings(own).wildSpawnExceptions).toEqual(['articuno_galarian']);
+    const none = writeSettings((s) => {
+      s.wildSpawnExceptions = [];
+    });
+    expect(loadSettings(none).wildSpawnExceptions).toEqual([]);
+    const bad = writeSettings((s) => {
+      s.wildSpawnExceptions = ['Uxie', ''];
+    });
+    expect(() => loadSettings(bad)).toThrow(/wildSpawnExceptions/);
+  });
+
   it('rejects an unknown time zone', () => {
     const file = writeSettings((s) => {
       s.timezone = 'Mars/Olympus_Mons';
```

Apply to `src/domain/pogo/game-master.test.ts`:

```diff
--- a/src/domain/pogo/game-master.test.ts
+++ b/src/domain/pogo/game-master.test.ts
@@ -31,6 +31,7 @@ describe('parseGameMaster: Pokémon', () => {
       form: null,
       kind: 'species',
       tempEvolution: null,
+      class: null,
       name: 'Venusaur',
       types: ['grass', 'poison'],
       stats: { attack: 198, defense: 189, stamina: 190 },
@@ -621,9 +622,65 @@ describe('the parsed snapshot', () => {
   });
 });
 
+describe('the class of a Pokémon', () => {
+  it('is read from the species and is null for an ordinary one', () => {
+    expect(entry('mewtwo').class).toBe('legendary');
+    expect(entry('zeraora').class).toBe('mythical');
+    expect(entry('venusaur').class).toBeNull();
+    expect(entry('pikachu').class).toBeNull();
+  });
+
+  it('is the same for every form and mega of a species', () => {
+    expect(entry('mewtwo_a').class).toBe('legendary');
+    expect(entry('giratina_origin').class).toBe('legendary');
+    expect(entry('latias_mega').class).toBe('legendary');
+    expect(entry('kyogre_primal').class).toBe('legendary');
+    expect(entry('deoxys_attack').class).toBe('mythical');
+    expect(entry('charizard_mega_x').class).toBeNull();
+  });
+
+  it('is null for a class this code does not know', () => {
+    const items = (readGameMasterSample() as { data: Record<string, unknown> }[]).map((item) => {
+      const settings = item.data['pokemonSettings'] as Record<string, unknown> | undefined;
+      return settings?.['pokemonId'] === 'MEWTWO'
+        ? { ...item, data: { pokemonSettings: { ...settings, pokemonClass: 'POKEMON_CLASS_NEW' } } }
+        : item;
+    });
+    const parsed = parseGameMaster(items, texts);
+    expect(parsed.pokemon.find((found) => found.key === 'mewtwo')?.class).toBeNull();
+  });
+
+  it('counts 77 legendary, 23 mythical and 11 ultra-beast species in the whole game master', () => {
+    const species = (wanted: PokemonEntry['class']): Set<string> =>
+      new Set(
+        gameDataFixture()
+          .pokemon.filter((found) => found.class === wanted)
+          .map((found) => found.pokemonId),
+      );
+    expect(species('legendary').size).toBe(77);
+    expect(species('mythical').size).toBe(23);
+    expect(species('ultra-beast').size).toBe(11);
+    const whole = new Map(gameDataFixture().pokemon.map((found) => [found.key, found]));
+    for (const key of [
+      'articuno',
+      'articuno_galarian',
+      'kyurem_black',
+      'necrozma_dusk_mane',
+      'uxie',
+    ])
+      expect(whole.get(key)?.class, key).toBe('legendary');
+    for (const key of ['mew', 'meltan', 'hoopa_unbound'])
+      expect(whole.get(key)?.class, key).toBe('mythical');
+    for (const key of ['nihilego', 'poipole', 'kartana'])
+      expect(whole.get(key)?.class, key).toBe('ultra-beast');
+    for (const key of ['dratini', 'tyranitar', 'lucario_mega', 'unown'])
+      expect(whole.get(key)?.class, key).toBeNull();
+  });
+});
+
 describe('the shape of the parsed data', () => {
   it('changes only together with GAME_DATA_VERSION: bump GAME_DATA_VERSION when this fails', () => {
-    expect(GAME_DATA_VERSION).toBe(3);
+    expect(GAME_DATA_VERSION).toBe(4);
     expect(Object.keys(data).sort()).toEqual([
       'aliases',
       'cpMultipliers',
@@ -634,6 +691,7 @@ describe('the shape of the parsed data', () => {
     ]);
     expect(Object.keys(entry('venusaur')).sort()).toEqual([
       'chargedMoves',
+      'class',
       'dex',
       'eliteChargedMoves',
       'eliteFastMoves',
```

Create `src/domain/pogo/wild.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import type { PokemonEntry } from './game-master.js';
import { appearsInWild, wildExceptions } from './wild.js';

const catalogue = catalogueFixture();
/** The default of the settings: the lake trio. */
const LAKE_TRIO = wildExceptions(catalogue, ['Uxie', 'Mesprit', 'Azelf']);
const wild = (found: PokemonEntry): boolean => appearsInWild(found, LAKE_TRIO.species);

function entry(key: string): PokemonEntry {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(`no entry ${key}`);
  return found;
}

describe('wildExceptions', () => {
  it('reads species by key, id or name, whatever the case, and says their names', () => {
    expect(LAKE_TRIO).toEqual({
      species: new Set(['UXIE', 'MESPRIT', 'AZELF']),
      names: ['Uxie', 'Mesprit', 'Azelf'],
      unknown: [],
    });
    const mixed = wildExceptions(catalogue, [' uxie ', 'MESPRIT', 'tapu koko', 'Ho-Oh']);
    expect(mixed.species).toEqual(new Set(['UXIE', 'MESPRIT', 'TAPU_KOKO', 'HO_OH']));
    expect(mixed.names).toEqual(['Uxie', 'Mesprit', 'Tapu Koko', 'Ho-Oh']);
  });

  it('takes a form for its species, and a species once', () => {
    const read = wildExceptions(catalogue, ['giratina_origin', 'Giratina', 'articuno_galarian']);
    expect(read.species).toEqual(new Set(['GIRATINA', 'ARTICUNO']));
    expect(read.names).toEqual(['Giratina', 'Articuno']);
    expect(read.unknown).toEqual([]);
  });

  it('leaves out and reports what the catalogue does not know', () => {
    const read = wildExceptions(catalogue, ['Uxie', 'Missingno', 'lake trio']);
    expect(read.species).toEqual(new Set(['UXIE']));
    expect(read.unknown).toEqual(['Missingno', 'lake trio']);
    expect(wildExceptions(catalogue, [])).toEqual({ species: new Set(), names: [], unknown: [] });
  });
});

describe('appearsInWild', () => {
  it('is true for an ordinary Pokémon, its regional forms and its other forms', () => {
    for (const key of ['dratini', 'tyranitar', 'rattata_alola', 'unown', 'burmy_sandy', 'rotom']) {
      expect(wild(entry(key)), key).toBe(true);
    }
  });

  it('is true for a Pokémon that spawns only in parts of the world', () => {
    for (const key of ['kangaskhan', 'tauros', 'relicanth', 'klefki']) {
      expect(wild(entry(key)), key).toBe(true);
    }
  });

  it('is false for a mega and a primal, whatever the exceptions', () => {
    const all = new Set(catalogue.all.map((found) => found.pokemonId));
    for (const key of ['charizard_mega_x', 'venusaur_mega', 'kyogre_primal']) {
      expect(wild(entry(key)), key).toBe(false);
      expect(appearsInWild(entry(key), all), key).toBe(false);
    }
  });

  it('is false for every legendary, the Galarian birds and the fusions among them', () => {
    for (const key of [
      'mewtwo',
      'mewtwo_a',
      'articuno',
      'zapdos_galarian',
      'giratina_origin',
      'kyurem',
      'kyurem_black',
      'kyurem_white',
      'necrozma_dusk_mane',
      'necrozma_dawn_wings',
      'cosmog',
      'zygarde',
    ]) {
      expect(wild(entry(key)), key).toBe(false);
    }
  });

  it('is false for a mythical Pokémon and an ultra beast', () => {
    for (const key of ['mew', 'celebi', 'meltan', 'zeraora', 'nihilego', 'kartana', 'poipole']) {
      expect(wild(entry(key)), key).toBe(false);
    }
  });

  it('is true for the species the settings except: by default the lake trio', () => {
    for (const key of ['uxie', 'mesprit', 'azelf']) {
      expect(entry(key).class, key).toBe('legendary');
      expect(wild(entry(key)), key).toBe(true);
      // Without the exception they are legendaries like any other.
      expect(appearsInWild(entry(key), new Set()), key).toBe(false);
    }
  });

  it('follows the list it is given: a species with all its forms but its megas', () => {
    const birds = wildExceptions(catalogue, ['Articuno']).species;
    expect(appearsInWild(entry('articuno'), birds)).toBe(true);
    expect(appearsInWild(entry('articuno_galarian'), birds)).toBe(true);
    expect(appearsInWild(entry('zapdos'), birds)).toBe(false);
    expect(appearsInWild(entry('uxie'), birds)).toBe(false);
    const latias = wildExceptions(catalogue, ['Latias']).species;
    expect(appearsInWild(entry('latias'), latias)).toBe(true);
    expect(appearsInWild(entry('latias_mega'), latias)).toBe(false);
  });

  it('refuses exactly the megas and the classed species but the exceptions, over the whole catalogue', () => {
    const refused = catalogue.all.filter((found) => !wild(found));
    expect(refused.every((found) => found.kind === 'mega' || found.class !== null)).toBe(true);
    const allowedClassed = catalogue.all
      .filter((found) => wild(found) && found.class !== null)
      .map((found) => found.pokemonId);
    expect([...new Set(allowedClassed)].sort()).toEqual(['AZELF', 'MESPRIT', 'UXIE']);
  });
});
```

Rebuild `test/fixtures/game-data.json` (generated; about 2,900 changed lines, not printed here): `npm run fixtures:game-data` once the parser of Step 2 is in place. It reads `var/game-data-source/` and never the network; the icons fixture is skipped when its source file is missing.

Apply to `test/fixtures/settings.json`:

```diff
--- a/test/fixtures/settings.json
+++ b/test/fixtures/settings.json
@@ -63,6 +63,7 @@
     "friends",
     "util"
   ],
+  "wildSpawnExceptions": ["Uxie", "Mesprit", "Azelf"],
   "blacklistWords": [
     "ex",
     "raid",
```

Run: `npx vitest run --project unit src/config/settings.test.ts src/domain/pogo/game-master.test.ts src/domain/pogo/wild.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `data/settings.json`:

```diff
--- a/data/settings.json
+++ b/data/settings.json
@@ -63,6 +63,7 @@
     "friends",
     "util"
   ],
+  "wildSpawnExceptions": ["Uxie", "Mesprit", "Azelf"],
   "blacklistWords": [
     "ex",
     "raid",
```

Apply to `scripts/game-data/make-fixtures.ts`:

```diff
--- a/scripts/game-data/make-fixtures.ts
+++ b/scripts/game-data/make-fixtures.ts
@@ -148,13 +148,24 @@ await writeFile(snapshotPath, `{\n${lines.join(',\n')}\n}\n`);
 if (JSON.stringify(JSON.parse(await readFile(snapshotPath, 'utf8'))) !== JSON.stringify(parsed)) {
   throw new Error('game-data.json does not parse back to the parsed game master');
 }
-// One name per line, sorted, so a refresh gives a reviewable diff.
-const icons = iconNamesOf(JSON.parse(await source('pokemon-icons-tree.json', ICONS_URL)));
-await writeFile(
-  path.join(fixtureDir, 'pokemon-icons.json'),
-  `[\n${icons.map((name) => JSON.stringify(name)).join(',\n')}\n]\n`,
-);
+// The listing of the icons is kept by few checkouts (it is fetched only with --download):
+// without it the icons fixture stays as it is, and the rest is rebuilt all the same.
+const ICONS_TREE = 'pokemon-icons-tree.json';
+let iconsWritten = 'the icons fixture left as it is';
+if (download || existsSync(path.join(sourceDir, ICONS_TREE))) {
+  // One name per line, sorted, so a refresh gives a reviewable diff.
+  const icons = iconNamesOf(JSON.parse(await source(ICONS_TREE, ICONS_URL)));
+  await writeFile(
+    path.join(fixtureDir, 'pokemon-icons.json'),
+    `[\n${icons.map((name) => JSON.stringify(name)).join(',\n')}\n]\n`,
+  );
+  iconsWritten = `${icons.length} icon names`;
+} else {
+  process.stdout.write(
+    `Skipped the icons fixture: ${path.join(sourceDir, ICONS_TREE)} is missing (run with --download to fetch it)\n`,
+  );
+}
 for (const message of warnings) process.stdout.write(`Warning: ${message}\n`);
 process.stdout.write(
-  `Wrote ${sample.length} sample items, ${sampleText.split('RESOURCE ID').length - 1} texts, the parsed snapshot and ${icons.length} icon names to ${fixtureDir}\n`,
+  `Wrote ${sample.length} sample items, ${sampleText.split('RESOURCE ID').length - 1} texts, the parsed snapshot and ${iconsWritten} to ${fixtureDir}\n`,
 );
```

Apply to `src/config/settings.ts`:

```diff
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -67,6 +67,15 @@ export const settingsSchema = z.strictObject({
   categories: z.strictObject({ pvp: z.string().min(1) }),
   helpGroups: z.array(z.string().min(1)),
   blacklistWords: z.array(z.string()),
+  /**
+   * The species that can be reported with `/wild` although the game calls them legendary,
+   * mythical or an ultra beast: each by its catalogue key or its name. A text the game data
+   * does not know is logged once and ignored. Left out of a file, it is the lake trio, the
+   * legendaries that do spawn. The Galarian birds stay refused for now: they appear only from
+   * a Daily Adventure Incense, to one trainer, not as spawns others can get (Matt, 2026-10-13;
+   * he expects this may change, hence the setting).
+   */
+  wildSpawnExceptions: z.array(z.string().min(1)).default(['Uxie', 'Mesprit', 'Azelf']),
   timezone: z
     .string()
     .refine(isTimeZone, { message: 'must be an IANA time zone, e.g. America/New_York' }),
```

Apply to `src/domain/pogo/game-master.ts`:

```diff
--- a/src/domain/pogo/game-master.ts
+++ b/src/domain/pogo/game-master.ts
@@ -10,6 +10,18 @@ import {
   type Weather,
 } from './types.js';
 
+/**
+ * What the game says a species is beyond an ordinary Pokémon (`pokemonSettings.pokemonClass`).
+ * The game master spells mythical as `POKEMON_CLASS_MYTHIC`.
+ */
+export type PokemonClass = 'legendary' | 'mythical' | 'ultra-beast';
+
+const POKEMON_CLASSES: Readonly<Record<string, PokemonClass>> = {
+  POKEMON_CLASS_LEGENDARY: 'legendary',
+  POKEMON_CLASS_MYTHIC: 'mythical',
+  POKEMON_CLASS_ULTRA_BEAST: 'ultra-beast',
+};
+
 export interface PokemonEntry {
   /** Stable lower-case identifier, e.g. `venusaur`, `rattata_alola`, `charizard_mega_x`. */
   key: string;
@@ -27,6 +39,12 @@ export interface PokemonEntry {
    */
   kind: 'species' | 'regional' | 'form' | 'mega';
   tempEvolution: TempEvolution | null;
+  /**
+   * The class of the species, the same for every form and mega of it (a Galarian bird and a
+   * fused Kyurem are legendary like their species); null for an ordinary Pokémon and for a
+   * class this code does not know.
+   */
+  class: PokemonClass | null;
   /** English display name, e.g. `Alolan Rattata`, `Giratina (Origin Forme)`, `Mega Charizard X`. */
   name: string;
   types: PokemonType[];
@@ -59,7 +77,7 @@ export interface Move {
  * Bump on ANY change to what `parseGameMaster` produces: the shape of `GameData`, or the rules
  * that decide its contents. A saved cache with another version is discarded.
  */
-export const GAME_DATA_VERSION = 3;
+export const GAME_DATA_VERSION = 4;
 
 /** Everything Pine derives from the game master and text file. JSON-serialisable. */
 export interface GameData {
@@ -360,6 +378,12 @@ export function parseGameMaster(
     }
     const base = formless ?? normal;
     const species = speciesName(pokemonId, base.dex, texts);
+    // Said on every item of a species alike; the first that says it speaks for all.
+    const classId = forms.map((pokemon) => text(pokemon.settings['pokemonClass'])).find(Boolean);
+    const pokemonClass = POKEMON_CLASSES[classId ?? ''] ?? null;
+    if (classId !== undefined && pokemonClass === null) {
+      onWarning(`Unknown Pokémon class ${classId}: its species count as ordinary`);
+    }
 
     const build = (
       source: Raw,
@@ -371,6 +395,7 @@ export function parseGameMaster(
       ...identity,
       dex: base.dex,
       pokemonId,
+      class: pokemonClass,
       name: displayName({
         pokemonId,
         dex: base.dex,
```

Create `src/domain/pogo/wild.ts`:

```ts
import { searchText } from '../search/text.js';
import type { PokemonCatalogue } from './catalogue.js';
import { feedLookupOf } from './feed-lookup.js';
import type { PokemonEntry } from './game-master.js';

/**
 * The species that appear in the wild although the game calls them legendary, mythical or an
 * ultra beast, as the settings name them (`wildSpawnExceptions`), read against a catalogue.
 */
export interface WildExceptions {
  /** Game-master species ids (`PokemonEntry.pokemonId`). */
  species: ReadonlySet<string>;
  /** The names of those species, in the order of the settings, each once: for the help. */
  names: readonly string[];
  /** What the settings name that the catalogue does not know: ignored, and to be said once. */
  unknown: readonly string[];
}

/**
 * Reads the settings' list against a catalogue. A species is named by its catalogue key, its
 * game-master id or its name (`uxie`, `UXIE`, `Uxie`), without regard to case, accents and
 * signs; an entry of one of its forms names the species too (`giratina_origin`), since the
 * exception is a species'. A text the catalogue does not know is left out and reported.
 */
export function wildExceptions(
  catalogue: PokemonCatalogue,
  listed: readonly string[],
): WildExceptions {
  const byText = new Map<string, PokemonEntry>();
  for (const entry of catalogue.all) {
    for (const text of [entry.key, entry.pokemonId, entry.name]) {
      const folded = searchText(text);
      if (folded !== '' && !byText.has(folded)) byText.set(folded, entry);
    }
  }
  const species = new Set<string>();
  const names: string[] = [];
  const unknown: string[] = [];
  for (const text of listed) {
    const entry = catalogue.byKey(text.trim()) ?? byText.get(searchText(text));
    if (!entry) {
      unknown.push(text);
      continue;
    }
    if (species.has(entry.pokemonId)) continue;
    species.add(entry.pokemonId);
    names.push(feedLookupOf(catalogue).speciesName(entry.pokemonId) ?? entry.name);
  }
  return { species, names, unknown };
}

/**
 * Whether a Pokémon can be met in the wild at all, so that a spawn of it can be reported: not a
 * mega or primal, and no legendary, mythical or ultra beast but the species of `exceptions`
 * (the settings' `wildSpawnExceptions`: by default the lake trio; Matt, 2026-10-13). Everything
 * else the game gives a class is met in raids, research or events only; that includes the
 * Galarian birds and the fusions, which are forms of legendary species. A Pokémon that spawns
 * only in parts of the world counts as wild: the game master does not say where, and a server
 * may be anywhere.
 */
export function appearsInWild(
  entry: Pick<PokemonEntry, 'kind' | 'class' | 'pokemonId'>,
  exceptions: ReadonlySet<string>,
): boolean {
  if (entry.kind === 'mega') return false;
  return entry.class === null || exceptions.has(entry.pokemonId);
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/config/settings.test.ts src/domain/pogo/game-master.test.ts src/domain/pogo/wild.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff e4e442a -- src test scripts data/settings.json   # must print nothing
npx prettier --check data/settings.json scripts/game-data/make-fixtures.ts src/config/settings.test.ts src/config/settings.ts src/domain/pogo/game-master.test.ts src/domain/pogo/game-master.ts src/domain/pogo/wild.test.ts src/domain/pogo/wild.ts test/fixtures/game-data.json test/fixtures/settings.json
npm run typecheck; npx eslint data/settings.json scripts/game-data/make-fixtures.ts src/config/settings.test.ts src/config/settings.ts src/domain/pogo/game-master.test.ts src/domain/pogo/game-master.ts src/domain/pogo/wild.test.ts src/domain/pogo/wild.ts test/fixtures/game-data.json test/fixtures/settings.json   # both clean; the full check runs after the last task
git add data/settings.json scripts/game-data/make-fixtures.ts src/config/settings.test.ts src/config/settings.ts src/domain/pogo/game-master.test.ts src/domain/pogo/game-master.ts src/domain/pogo/wild.test.ts src/domain/pogo/wild.ts test/fixtures/game-data.json test/fixtures/settings.json
git commit -F <a file with the message below>
```

The commit message:

```
Game data: the class of a Pokémon, and what appears in the wild

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 2: Search: legendaries before ordinary Pokémon, guesses last; the order of the want and boss lists

**Files:**
- Modify: `src/commands/notifications/want-input.ts`, `src/commands/notifications/wants.test.ts`, `src/commands/raids/raid-input.test.ts`, `src/commands/raids/raid-input.ts`, `src/domain/pogo/pokemon-search.test.ts`, `src/domain/pogo/pokemon-search.ts`, `src/domain/pogo/wants.ts`, `src/services/pokemon-search-service.ts`, `test/support/providers.ts`

**Interfaces:**
- Consumes: Task 1 (`class`); `PokemonSearch`, `PokemonSearchService`; `want-input.ts`; `raid-input.ts` (`trainBossChoices`); the test provider of `ctx.pokemon`.
- Produces: `PokemonSearch.find(text, { limit, filter, plain })` answering `PokemonHit`s (`entry`, how it fits: `exact`, `word`, `beginning`, `loose`, `guess`; `named`: found by its name) and `ctx.pokemon.find`; `search()` is its entries; the order of decision 4, the narrower guesses of decision 5 (`ownWords`, `CLASS_LIFTS`); `wantChoices` in four groups with the label's words, `/unwant`'s list folding text as `/want`'s does, typed wants reading `every form` without brackets; `trainBossChoices` in the same order.

Reference commit of the prototype for this task: `9082676`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/notifications/wants.test.ts`:

```diff
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -18,6 +18,10 @@ import {
   type Want,
 } from '../../domain/pogo/notification-target.js';
 import { LIMITS } from '../../render/text.js';
+import { bossIdsOf, type RaidBoss } from '../../domain/pogo/raid-bosses.js';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
+import { wantChoices } from './want-input.js';
 import { unwant, unwantAll, want, wantControls, wants, wantsEmbed } from './wants.js';
 
 const OTHER_GUILD = '499999999999999999';
@@ -547,18 +551,13 @@ describe('/want: the list of choices', () => {
 
   it('offers shadow raids after the word shadow: the shadow bosses, then what the rest finds', async () => {
     const made = setup();
-    // The word alone: the shadow tiers, then the shadow raids of each shadow boss.
+    // The word alone: the shadow raids of each shadow boss, then the shadow tiers.
     const shadow = (await made.choices('want', 'shadow')).map((choice) => choice.name);
-    expect(shadow.slice(0, 5)).toEqual([
-      'Shadow T1 raids',
-      'Shadow T3 raids',
-      'Shadow T5 raids',
-      'Shadow Gastly',
-      'Shadow Gible',
-    ]);
     // Eight shadow bosses in the fixture, each once and none with its species beside it.
-    expect(shadow.slice(3, 11).every((name) => /^Shadow (?!T\d)/.test(name))).toBe(true);
-    expect(shadow.slice(3, 11)).toContain('Shadow Landorus');
+    expect(shadow.slice(0, 8).every((name) => /^Shadow (?!T\d)/.test(name))).toBe(true);
+    expect(shadow.slice(0, 8)).toContain('Shadow Landorus');
+    expect(shadow.slice(0, 8)).toContain('Shadow Gastly');
+    expect(shadow.slice(8, 11)).toEqual(['Shadow T1 raids', 'Shadow T3 raids', 'Shadow T5 raids']);
     expect(shadow).not.toContain('Landorus (every form)');
     expect(shadow).not.toContain('Gastly');
     // With the beginning of a name: the shadow raids of the species it finds, no boss needed.
@@ -594,26 +593,300 @@ describe('/want: the list of choices', () => {
     });
   });
 
-  it('puts the tier or IV target a text names or begins before everything else', async () => {
+  it('puts the tier or IV target a text names or begins after the bosses and before the rest', async () => {
     const made = setup();
-    // `mega` is the Mega tier, and Mega Blastoise is a boss: the tier comes first.
-    expect((await made.choices('want', 'mega'))[0]).toEqual({
-      name: 'Mega raids',
-      value: 'tier:Mega',
-    });
+    // `mega` is the Mega tier, and Mega Blastoise is a boss: the boss comes first, with its
+    // species, then the tier, then the megas that are no boss.
+    expect((await made.choices('want', 'mega')).slice(0, 4)).toEqual([
+      { name: 'Mega Blastoise', value: 'pokemon:9:blastoise_mega' },
+      { name: 'Blastoise (every form)', value: 'pokemon:9' },
+      { name: 'Mega raids', value: 'tier:Mega' },
+      { name: 'Mega Legendary raids', value: 'tier:MegaLegendary' },
+    ]);
     expect((await made.choices('want', 'zer'))[0]).toEqual({
       name: 'Zero IV spawns',
       value: 'iv:zero',
     });
-    expect(
-      (await made.choices('want', 'shadow')).slice(0, 3).map((choice) => choice.value),
-    ).toEqual(['tier:T1:shadow', 'tier:T3:shadow', 'tier:T5:shadow']);
     // A text with many Pokémon keeps the tier it names.
     const five = await made.choices('want', '5');
     expect(five[0]).toEqual({ name: 'T5 raids', value: 'tier:T5' });
     expect(five.length).toBeLessThanOrEqual(25);
   });
 
+  it('orders as Matt asked after the staging of Phase 4: bosses, tiers, names, guesses', async () => {
+    const made = setup();
+    const names = async (typed: string) =>
+      (await made.choices('want', typed)).map((choice) => choice.name);
+    // A legendary before an ordinary Pokémon that fits as well.
+    expect(await names('gira')).toEqual([
+      'Giratina (every form)',
+      'Giratina (Altered Forme)',
+      'Giratina (Origin Forme)',
+      'Girafarig',
+    ]);
+    // Starmie is a boss: before the tiers (a tier is also called "3 star"), which stand
+    // before the other names. Neither Pikachu (a costume's id) nor Tyranitar (`ttar`).
+    expect(await names('star')).toEqual([
+      'Starmie (base form)',
+      'Starmie (every form)',
+      'T1 raids',
+      'T3 raids',
+      'T5 raids',
+      'Starly',
+      'Staryu',
+      'Staravia',
+      'Staraptor',
+      'Mega Starmie',
+      // Found by the word of a trim, not by a name: after the names.
+      'Furfrou (every form)',
+      'Furfrou (Star Trim)',
+    ]);
+    // `meadow` is a guess for `shadow`: last, and only under the label that shows the word.
+    const shadow = await names('shadow');
+    expect(shadow.slice(-3)).toEqual([
+      'Scatterbug (Meadow Pattern)',
+      'Spewpa (Meadow Pattern)',
+      'Vivillon (Meadow Pattern)',
+    ]);
+    expect(shadow).not.toContain('Scatterbug (every form)');
+    expect(shadow.indexOf('Calyrex (Shadow Rider)')).toBeLessThan(shadow.length - 3);
+    expect(shadow.indexOf('Shadow T5 raids')).toBeLessThan(
+      shadow.indexOf('Calyrex (Shadow Rider)'),
+    );
+    // `percent` (a key of Zygarde) is a guess for `perfect` that no label shows: left out.
+    expect(await names('perfect')).toEqual(['Perfect IV spawns']);
+    // Two wrong letters in a short word are no guess any more: `hundo` is the word alone.
+    expect(await names('hundo')).toEqual(['Perfect IV spawns']);
+    // Two neighbouring letters in the wrong order still are, and the label shows the name.
+    expect(await names('lugai')).toEqual(['Lugia']);
+  });
+
+  it('finds the Pokémon a text leads to by name before the forms and types that have the word', async () => {
+    const made = setup();
+    const names = async (typed: string) =>
+      (await made.choices('want', typed)).map((choice) => choice.name);
+    for (const typed of ['ty', 'typ']) {
+      const found = await names(typed);
+      expect(found.length, typed).toBeLessThanOrEqual(25);
+      expect(found[0], typed).toBe('Type: Null');
+      expect(found, typed).toContain('Typhlosion (every form)');
+    }
+    expect(await names('ty')).toContain('Tyranitar (every form)');
+    expect((await names('psy'))[0]).toBe('Psyduck');
+    expect((await names('bul'))[0]).toBe('Bulbasaur');
+    expect(await names('for')).toContain('Forretress');
+    expect((await names('for'))[0]).toBe('Forretress');
+  });
+
+  it('finds a boss by its name however many Pokémon the text finds before it', async () => {
+    const made = setup();
+    const names = async (typed: string) =>
+      (await made.choices('want', typed)).map((choice) => choice.name);
+    // Starmie and Mega Blastoise are bosses of the fixture; one letter finds hundreds.
+    const s = await names('s');
+    expect(s).toContain('Starmie (base form)');
+    expect(s.indexOf('Starmie (base form)')).toBeLessThan(s.indexOf('Super Mega raids'));
+    const m = await names('m');
+    expect(m).toContain('Mega Blastoise');
+    expect(m.indexOf('Mega Blastoise')).toBeLessThan(m.indexOf('Mega raids'));
+    // And a shadow boss after `shadow`, by one letter of its name.
+    expect((await names('shadow l'))[0]).toBe('Shadow Landorus');
+  });
+
+  it('lets the class fill no list: Arcanine beside Arceus, Silcoon beside Silvally', async () => {
+    const made = setup();
+    const names = async (typed: string) =>
+      (await made.choices('want', typed)).map((choice) => choice.name);
+    expect(await names('arc')).toContain('Arcanine (every form)');
+    expect(await names('ar')).toContain('Arcanine (every form)');
+    expect((await names('sil')).indexOf('Silcoon')).toBeLessThan(8);
+    expect((await names('gira')).slice(0, 4)).toEqual([
+      'Giratina (every form)',
+      'Giratina (Altered Forme)',
+      'Giratina (Origin Forme)',
+      'Girafarig',
+    ]);
+    // The beginning of a nickname is the beginning of a name: Ho-Oh before Hoothoot.
+    const hoo = await names('hoo');
+    expect(hoo.indexOf('Ho-Oh')).toBeGreaterThanOrEqual(0);
+    expect(hoo.indexOf('Ho-Oh')).toBeLessThan(hoo.indexOf('Hoothoot'));
+  });
+
+  it('matches bosses and tiers on what names them, not on what a label adds', async () => {
+    const made = setup();
+    const names = async (typed: string) =>
+      (await made.choices('want', typed)).map((choice) => choice.name);
+    // `ba` is no boss's "(base form)": the Pokémon that begin with it.
+    const ba = await names('ba');
+    expect(ba).not.toContain('Starmie (base form)');
+    expect(ba[0]).toBe('Bagon');
+    // `e` is the Elite tier and then Pokémon, not "(every form)" of the three bosses with forms.
+    const e = await names('e');
+    expect(e[0]).toBe('Elite raids');
+    expect(e).not.toContain('Starmie (every form)');
+    expect(e).not.toContain('Blastoise (every form)');
+    // `f` is no "form".
+    const f = await names('f');
+    expect(f).not.toContain('Starmie (base form)');
+    expect(f).not.toContain('Landorus (every form)');
+    // One letter is how the search knows a form of Unown; then what begins with it.
+    expect(f.slice(0, 3)).toEqual(['Unown (every form)', 'Unown (F)', 'Fezandipiti']);
+    // `ra` is Raikou and its like, not ten tiers of "raids".
+    const ra = await names('ra');
+    expect(ra.filter((name) => name.endsWith(' raids'))).toEqual([]);
+    expect(ra[0]).toBe('Raikou');
+    // `sp` is no "spawns", and `iv` no "IV".
+    const sp = await names('sp');
+    expect(sp.filter((name) => name.endsWith(' spawns'))).toEqual([]);
+    expect((await names('iv')).filter((name) => name.endsWith(' spawns'))).toEqual([]);
+    // What names a tier or an IV target still finds it, with what its label adds after it.
+    expect((await names('perf'))[0]).toBe('Perfect IV spawns');
+    expect((await names('perfect iv'))[0]).toBe('Perfect IV spawns');
+    expect((await names('t5 raids'))[0]).toBe('T5 raids');
+    expect((await names('el'))[0]).toBe('Elite raids');
+    // The shadow raids of the shadow bosses are found by their label, as before.
+    expect((await names('shadow'))[0]).toMatch(/^Shadow (?!T\d)/);
+  });
+
+  it('puts the Pokémon a text names in full before the bosses, and no boss first for its number', () => {
+    const fixture = raidBossesFixture();
+    const boss = (key: string, level: 'T3' | 'T5'): RaidBoss => {
+      const entry = catalogueFixture().byKey(key);
+      if (!entry) throw new Error(`no ${key}`);
+      return {
+        ...bossIdsOf(entry),
+        key,
+        tier: { level, shadow: false },
+        shiny: false,
+        name: entry.name,
+        entry,
+        source: 'feed',
+        autoset: false,
+      };
+    };
+    // Mewtwo is a boss, and so is Venusaur, whose Pokédex number is 3.
+    const list = [boss('mewtwo', 'T5'), boss('venusaur', 'T3'), ...fixture.bosses()];
+    const { ctx } = createTestContext({ raidBosses: { ...fixture, bosses: () => list } });
+    const names = (typed: string) => wantChoices(ctx, typed).map((choice) => choice.name);
+    // Mew is what `mew` names: before the choices of the boss Mewtwo.
+    expect(names('mew').slice(0, 3)).toEqual(['Mew', 'Mewtwo (base form)', 'Mewtwo (every form)']);
+    expect(names('mewt')[0]).toBe('Mewtwo (base form)');
+    // `3` is the tier; the boss with that number stands after it, with the other Pokémon.
+    const three = names('3');
+    expect(three[0]).toBe('T3 raids');
+    expect(three.indexOf('Venusaur (every form)')).toBeGreaterThan(three.indexOf('T3 raids'));
+    expect(names('venu')[0]).toBe('Venusaur (base form)');
+    // A boss found by the beginning of its nickname is found by name: before the tiers.
+    const tyranitar = [boss('tyranitar', 'T5'), ...fixture.bosses()];
+    const withTtar = createTestContext({
+      raidBosses: { ...fixture, bosses: () => tyranitar },
+    }).ctx;
+    expect(wantChoices(withTtar, 'tta').map((choice) => choice.name)).toEqual([
+      'Tyranitar (base form)',
+      'Tyranitar (every form)',
+    ]);
+    expect(wantChoices(withTtar, 't').map((choice) => choice.name)[0]).toBe(
+      'Tyranitar (base form)',
+    );
+  });
+
+  it('offers shadow raids without regard to class, what can be shadow first, and no Unown for a letter', async () => {
+    const made = setup();
+    const names = async (typed: string) =>
+      (await made.choices('want', typed)).map((choice) => choice.name);
+    const catalogue = catalogueFixture();
+    /** By the value of a choice, `pokemon:<dex>::shadow`: whether any form of it can be shadow. */
+    const canBeShadow = (value: string): boolean =>
+      catalogue.byDex(Number(value.split(':')[1])).some((entry) => entry.shadow);
+    // The legendaries are not put first, and what the game data says can be shadow is.
+    for (const typed of ['shadow m', 'shadow me', 'shadow la']) {
+      const offered = (await made.choices('want', typed)).filter((choice) =>
+        String(choice.value).startsWith('pokemon:'),
+      );
+      expect(offered.map((choice) => choice.name)).not.toContain('Shadow Unown');
+      expect(offered.length, typed).toBeGreaterThan(3);
+      const able = offered.map((choice) => canBeShadow(String(choice.value)));
+      expect(able[0], typed).toBe(true);
+      // Every one that can be shadow stands before every one that cannot.
+      expect(able.lastIndexOf(true), typed).toBeLessThan(
+        able.includes(false) ? able.indexOf(false) : able.length,
+      );
+    }
+    // Latias and Latios are legendary and begin with `la` like Larvitar, which is not: the
+    // class puts nobody first here.
+    const la = await names('shadow lar');
+    expect(la[0]).toBe('Shadow Larvitar');
+    // No mega and no primal after `shadow`: `me` begins the nickname `mega` of every mega,
+    // and none of those species is offered for it.
+    const me = await names('shadow me');
+    expect(me).toContain('Shadow Mewtwo');
+    for (const mega of ['Shadow Charizard', 'Shadow Venusaur', 'Shadow Gengar', 'Shadow Kyogre']) {
+      expect(me, mega).not.toContain(mega);
+    }
+    expect(await names('shadow mega')).not.toContain('Shadow Charizard');
+    expect(await names('shadow primal')).toEqual([]);
+    // What the text names in full still stands first: `shadow mew` is the shadow raids of Mew.
+    expect((await names('shadow mew')).slice(0, 2)).toEqual(['Shadow Mew', 'Shadow Mewtwo']);
+  });
+
+  it('finds a choice by the words of its label', async () => {
+    const made = setup();
+    const names = async (typed: string) =>
+      (await made.choices('want', typed)).map((choice) => choice.name);
+    expect(await made.choices('want', 'tyranitar base')).toEqual([
+      { name: 'Tyranitar (base form)', value: 'pokemon:248:tyranitar' },
+    ]);
+    expect(await names('tyranitar base form')).toEqual(['Tyranitar (base form)']);
+    expect(await names('Tyranitar (base form)')).toEqual(['Tyranitar (base form)']);
+    expect(await names('tyranitar ba')).toEqual(['Tyranitar (base form)']);
+    expect(await names('giratina every form')).toEqual(['Giratina (every form)']);
+    expect(await names('giratina every')).toEqual(['Giratina (every form)']);
+    expect(await names('gira ev')).toEqual(['Giratina (every form)']);
+    // The words of a form's own name were found before and still are.
+    expect((await names('giratina origin forme'))[0]).toBe('Giratina (Origin Forme)');
+    expect(await names('shadow mewtwo')).toEqual(['Shadow Mewtwo']);
+    // A species that is one entry has neither label.
+    expect(await names('dratini base')).toEqual([]);
+    // Read as it would be if it were sent: every form of a species with one is the species.
+    expect(await names('dratini every form')).toEqual(['Dratini']);
+    // Each such choice is read back as what it says.
+    for (const typed of ['tyranitar base', 'giratina every form']) {
+      for (const choice of await made.choices('want', typed)) {
+        await made.run('want', { target: String(choice.value) });
+      }
+    }
+    expect(made.formRows()).toEqual([
+      [248, 'both', 'tyranitar', false],
+      [487, 'both', null, false],
+    ]);
+  });
+
+  it('reads the words of a label that are sent without picking, and nothing looser', async () => {
+    const made = setup();
+    expect(await made.answer('want', { target: 'giratina every form', type: 'raid' })).toContain(
+      'Every form of Giratina counts.',
+    );
+    expect(await made.answer('want', { target: 'tyranitar base form', type: 'raid' })).toContain(
+      'a Tyranitar (base form) raid',
+    );
+    expect(made.formRows()).toEqual([
+      [487, 'raid', null, false],
+      [248, 'raid', 'tyranitar', false],
+    ]);
+    // Half a label is offered by the list, but never acted on.
+    expect(await made.answer('want', { target: 'tyranitar base' })).toContain(
+      'I do not know "tyranitar base"',
+    );
+    expect(await made.answer('want', { target: 'giratina every' })).toContain(
+      'I do not know "giratina every"',
+    );
+    // `every form` after the name of one form names nothing.
+    expect(await made.answer('want', { target: 'giratina origin every form' })).toContain(
+      'I do not know',
+    );
+    expect(made.formRows()).toHaveLength(2);
+  });
+
   it('offers each species once and 25 choices at most', async () => {
     const made = setup();
     const found = await made.choices('want', 'char');
@@ -628,11 +901,12 @@ describe('/want: the list of choices', () => {
     const made = setup();
     const offered = await made.choices('want', 'gira');
     for (const choice of offered) await made.run('want', { target: String(choice.value) });
+    // Giratina, a legendary, before Girafarig.
     expect(made.formRows()).toEqual([
-      [203, 'both', null, false],
       [487, 'both', null, false],
       [487, 'both', 'giratina_altered', false],
       [487, 'both', 'giratina_origin', false],
+      [203, 'both', null, false],
     ]);
     // Each is on the list under the name it was offered by.
     expect((await made.choices('unwant', '')).map((choice) => choice.value).sort()).toEqual(
@@ -646,6 +920,39 @@ describe('/want: the list of choices', () => {
 });
 
 describe('/unwant', () => {
+  it('finds and reads a want by the words of its label', async () => {
+    const made = setup();
+    await made.run('want', { target: 'pokemon:248:tyranitar' });
+    await made.run('want', { target: 'pokemon:248' });
+    await made.run('want', { target: 'pokemon:487', type: 'spawn' });
+    const names = async (typed: string) =>
+      (await made.choices('unwant', typed)).map((choice) => choice.name);
+    expect(await names('tyranitar base')).toEqual(['Tyranitar (base form) · raids and spawns']);
+    expect(await names('tyranitar every form')).toEqual([
+      'Tyranitar (every form) · raids and spawns',
+    ]);
+    expect(await names('giratina every')).toEqual(['Giratina (every form) · spawns']);
+    // Folded as the list of `/want` folds: accents, signs and case.
+    await made.run('want', { target: 'pokemon:669' });
+    await made.run('want', { target: 'pokemon:29' });
+    expect((await names('flabebe'))[0]).toMatch(/^Flabébé/);
+    expect(await names('FLABÉBÉ')).toEqual(await names('flabebe'));
+    expect((await names('nidoran female'))[0]).toMatch(/^Nidoran♀/);
+    await made.run('unwant', { target: 'pokemon:669' });
+    await made.run('unwant', { target: 'pokemon:29' });
+    // Sent without picking: the words of the label, with or without its signs.
+    expect(await made.answer('unwant', { target: 'giratina every form' })).toBe(
+      'Giratina (every form) is off your list.',
+    );
+    expect(await made.answer('unwant', { target: 'tyranitar base form raids and spawns' })).toBe(
+      'Tyranitar (base form) is off your list.',
+    );
+    expect(await made.answer('unwant', { target: 'Tyranitar every form' })).toBe(
+      'Tyranitar (every form) is off your list.',
+    );
+    expect(made.formRows()).toEqual([]);
+  });
+
   it('says are of a tier and of IVs, whose names are plural', async () => {
     const made = setup();
     await made.run('want', { target: 'iv:perfect' });
```

Apply to `src/commands/raids/raid-input.test.ts`:

```diff
--- a/src/commands/raids/raid-input.test.ts
+++ b/src/commands/raids/raid-input.test.ts
@@ -12,6 +12,7 @@ import {
   reportedBoss,
   reportedGym,
   reportedTime,
+  trainBossChoices,
   type ReportedBoss,
 } from './raid-input.js';
 
@@ -337,6 +338,76 @@ function contextWith(list: RaidBoss[]) {
   }).ctx;
 }
 
+describe('trainBossChoices', () => {
+  const names = (list: RaidBoss[], typed: string) =>
+    trainBossChoices(contextWith(list), typed).map((choice) => choice.name);
+
+  it('offers the current bosses, each Pokémon once, while nothing is typed', () => {
+    const list = [listed('yveltal', 'T5'), listed('gastly', 'T1'), listed('gastly', 'T1', true)];
+    expect(names(list, '')).toEqual(['Yveltal', 'Gastly']);
+  });
+
+  it('puts the bosses a text finds by name first, in the order of the search, then the rest', () => {
+    // Listed in another order than the search has them; Staryu is no boss.
+    const list = [listed('starmie', 'T3'), listed('starly', 'T1'), listed('yveltal', 'T5')];
+    expect(names(list, 'star')).toEqual([
+      'Starly',
+      'Starmie',
+      'Staryu',
+      'Staravia',
+      'Staraptor',
+      'Mega Starmie',
+      'Furfrou (Star Trim)',
+    ]);
+    // A boss with the letters in the middle of its name is not found by them, as elsewhere.
+    expect(names([listed('yveltal', 'T5')], 'elt')).toEqual([]);
+    // A boss found only by its number stands where the search has it, not before the names.
+    expect(names([listed('venusaur', 'T3'), listed('charmander', 'T1')], '3')[0]).toBe('Venusaur');
+    expect(names([listed('mewtwo', 'T5')], '15').indexOf('Mewtwo')).toBeGreaterThan(0);
+  });
+
+  it('puts the Pokémon a text names in full before the bosses', () => {
+    const list = [listed('mewtwo', 'T5'), listed('yveltal', 'T5')];
+    expect(names(list, 'mew').slice(0, 2)).toEqual(['Mew', 'Mewtwo']);
+    expect(names(list, 'mewt')[0]).toBe('Mewtwo');
+  });
+
+  it('finds a boss by its name however many Pokémon the text finds before it', () => {
+    // The bosses of the fixture, Starmie and Mega Blastoise among them: a single letter finds
+    // hundreds of Pokémon, and the Unown of that letter is what it names in full.
+    const fixture = (typed: string) => trainBossChoices(ctx, typed).map((choice) => choice.name);
+    const s = fixture('s');
+    expect(s[0]).toBe('Unown (S)');
+    expect(s.indexOf('Starmie')).toBeGreaterThan(0);
+    expect(s.indexOf('Starmie')).toBeLessThan(5);
+    const m = fixture('m');
+    expect(m.indexOf('Mega Blastoise')).toBe(1);
+    // Arcanine stands near the top, though Arceus has eighteen entries.
+    expect(fixture('arc').indexOf('Arcanine')).toBeLessThan(12);
+    expect(fixture('ar')).toContain('Arcanine');
+  });
+
+  it('finds Tyranitar and Typhlosion for the beginning of their names', () => {
+    for (const typed of ['ty', 'typ']) {
+      const found = names([listed('yveltal', 'T5')], typed);
+      expect(found.length, typed).toBeLessThanOrEqual(25);
+      expect(found, typed).toContain('Typhlosion');
+    }
+    expect(names([listed('yveltal', 'T5')], 'ty')).toContain('Tyranitar');
+    // As a boss it goes before Type: Null, which the class would otherwise put first.
+    expect(names([listed('tyranitar', 'T5')], 'ty').slice(0, 2)).toEqual([
+      'Tyranitar',
+      'Type: Null',
+    ]);
+  });
+
+  it('finds a boss the game master does not know by the words of its name', () => {
+    const list = [unknownBoss('Bloodmoon Ursaluna', 'T5'), listed('yveltal', 'T5')];
+    expect(names(list, 'blood')).toEqual(['Bloodmoon Ursaluna']);
+    expect(names(list, 'ursa')[0]).toBe('Bloodmoon Ursaluna');
+  });
+});
+
 describe('reportedBoss against a list of bosses', () => {
   it('reads a Mega boss by the name of its Pokémon', () => {
     const list = contextWith([listed('rayquaza_mega', 'MegaLegendary'), listed('yveltal', 'T5')]);
```

Apply to `src/domain/pogo/pokemon-search.test.ts`:

```diff
--- a/src/domain/pogo/pokemon-search.test.ts
+++ b/src/domain/pogo/pokemon-search.test.ts
@@ -6,6 +6,13 @@ import { PokemonSearch, mergeNicknames } from './pokemon-search.js';
 const catalogue = catalogueFixture();
 const search = new PokemonSearch(catalogue, mergeNicknames(catalogue, CURATED_NICKNAMES));
 
+/** The words of an entry's own name and key: what a guess may be a misspelling of. */
+const searchWords = (entry: { name: string; key: string }): string[] =>
+  `${entry.name} ${entry.key.replace(/_/g, ' ')}`
+    .toLowerCase()
+    .split(/[^a-z0-9]+/)
+    .filter(Boolean);
+
 const keys = (text: string, limit?: number) =>
   search.search(text, { limit }).map((entry) => entry.key);
 const first = (text: string) => search.search(text)[0]?.key;
@@ -57,8 +64,7 @@ describe('PokemonSearch: names', () => {
   });
 
   it('accepts the beginning of a word and small misspellings', () => {
-    expect(first('gira')).toBe('girafarig');
-    expect(keys('gira')).toContain('giratina_altered');
+    expect(keys('gira')).toEqual(['giratina_altered', 'giratina_origin', 'girafarig']);
     expect(keys('lando', 2)).toEqual(['landorus_incarnate', 'landorus_therian']);
     expect(keys('lando t')).toEqual(['landorus_therian']);
     expect(first('tyrannitar')).toBe('tyranitar');
@@ -142,7 +148,10 @@ describe('PokemonSearch: nicknames and other ids', () => {
     const found = keys('mega');
     const megas = catalogue.all.filter((entry) => entry.tempEvolution?.startsWith('MEGA'));
     for (const mega of megas) expect(found, mega.key).toContain(mega.key);
-    expect(found.slice(0, 3)).toEqual(['abomasnow_mega', 'absol_mega', 'aerodactyl_mega']);
+    // The megas of legendary and mythical species first, then the others by name.
+    expect(found.slice(0, 3)).toEqual(['diancie_mega', 'latias_mega', 'latios_mega']);
+    const ordinary = found.filter((key) => catalogue.byKey(key)?.class === null);
+    expect(ordinary.slice(0, 3)).toEqual(['abomasnow_mega', 'absol_mega', 'aerodactyl_mega']);
     expect(found.slice(0, 40).every((key) => catalogue.byKey(key)?.kind === 'mega')).toBe(true);
     // A word that merely begins the same comes along, after them.
     expect(found).toContain('meganium');
@@ -165,6 +174,193 @@ describe('PokemonSearch: nicknames and other ids', () => {
   });
 });
 
+describe('PokemonSearch: the order of hits', () => {
+  const hits = (text: string) => search.find(text).map((hit) => `${hit.entry.key}:${hit.match}`);
+
+  it('puts a legendary, a mythical Pokémon and an ultra beast before an ordinary one', () => {
+    expect(keys('gira')[0]).toBe('giratina_altered');
+    const la = keys('la');
+    expect(la.indexOf('latias')).toBeLessThan(la.indexOf('lapras'));
+    expect(la.indexOf('landorus_therian')).toBeLessThan(la.indexOf('larvitar'));
+    const ka = keys('ka');
+    expect(ka.indexOf('kartana')).toBeLessThan(ka.indexOf('kabuto'));
+    const me = keys('me');
+    expect(me.indexOf('meltan')).toBeLessThan(me.indexOf('meowth'));
+  });
+
+  it('puts the Pokémon a text leads to by name before what a form, type or style word finds', () => {
+    // Starmie and the others begin with it; Furfrou has it as the word of a trim.
+    expect(hits('star')).toEqual([
+      'starly:beginning',
+      'staryu:beginning',
+      'staravia:beginning',
+      'staraptor:beginning',
+      'starmie:beginning',
+      'starmie_mega:beginning',
+      'furfrou_star:word',
+    ]);
+    expect(hits('mew').slice(0, 2)).toEqual(['mew:exact', 'mewtwo:beginning']);
+    // Type: Null is found by its name, and so are Tyranitar and Typhlosion: all before the
+    // seventeen types of Arceus and of Silvally, which are legendary and mythical.
+    for (const text of ['ty', 'typ']) {
+      const found = keys(text, 25);
+      expect(found[0], text).toBe('type_null');
+      expect(found, text).toContain('typhlosion');
+      expect(found.indexOf('typhlosion'), text).toBeLessThan(found.indexOf('arceus_bug'));
+    }
+    expect(keys('ty', 25)).toContain('tyranitar');
+    expect(keys('psy')).toEqual(['psyduck', 'arceus_psychic', 'silvally_psychic']);
+    // Tapu Bulu has it in the middle of its name; by `bulu` it is found by name.
+    expect(keys('bul')).toEqual(['bulbasaur', 'tapu_bulu']);
+    expect(keys('bulu')).toEqual(['tapu_bulu']);
+    expect(first('for')).toBe('forretress');
+    // A regional form and a mega are found by the name of their species.
+    expect(keys('ratt')).toEqual(['rattata', 'rattata_alola']);
+    expect(keys('exegg', 2)).toEqual(['exeggutor', 'exeggutor_alola']);
+  });
+
+  it('lets the class lift three entries of a species at most', () => {
+    // Arceus has eighteen entries and Arcanine two: both in the first few.
+    const arc = keys('arc', 25);
+    expect(arc.slice(0, 3).every((key) => key.startsWith('arceus'))).toBe(true);
+    // Then the ordinary Pokémon as the search has them, Arcanine and its Hisuian form among
+    // them, and only then the other fifteen types.
+    expect(arc.slice(3, 11)).toEqual([
+      'archen',
+      'archeops',
+      'arctibax',
+      'arctovish',
+      'arctozolt',
+      'archaludon',
+      'arcanine',
+      'arcanine_hisuian',
+    ]);
+    expect(arc[11]).toBe('arceus_dragon');
+    // The other types of Arceus are still found, where they would stand without a class.
+    expect(keys('arc').filter((key) => key.startsWith('arceus'))).toHaveLength(18);
+    expect(keys('ar', 25)).toContain('arcanine');
+    const sil = keys('sil', 25);
+    expect(sil.filter((key) => key.startsWith('silvally')).slice(0, 3)).toEqual(sil.slice(0, 3));
+    expect(sil.indexOf('silcoon')).toBeLessThan(6);
+    // Two entries are both lifted.
+    expect(keys('gira')).toEqual(['giratina_altered', 'giratina_origin', 'girafarig']);
+  });
+
+  it('takes the beginning of a nickname for the beginning of a name', () => {
+    // `hooh` is a nickname of Ho-Oh, a legendary: found by name, so before Hoothoot.
+    const hoo = keys('hoo');
+    expect(hoo.indexOf('ho_oh')).toBeGreaterThanOrEqual(0);
+    expect(hoo.indexOf('ho_oh')).toBeLessThan(hoo.indexOf('hoothoot'));
+    expect(search.find('tta')).toMatchObject([
+      { entry: { key: 'tyranitar' }, match: 'beginning', named: true },
+    ]);
+    expect(search.find('hoo').find((hit) => hit.entry.key === 'ho_oh')?.named).toBe(true);
+  });
+
+  it('gives an id that stands for an entry no weight over another entry', () => {
+    // As before there were classes: Charjabug, Cubchoo, Bewear and Delibird have such ids.
+    expect(keys('char').slice(0, 4)).toEqual([
+      'charcadet',
+      'charjabug',
+      'charmeleon',
+      'charmander',
+    ]);
+    expect(keys('cub')).toEqual(['cubone', 'cubchoo']);
+    expect(keys('be').slice(0, 2)).toEqual(['beldum', 'bewear']);
+    expect(keys('del').slice(0, 2)).toEqual(['delcatty', 'delibird']);
+  });
+
+  it('puts what only a key or a number finds after the names', () => {
+    expect(hits('zygarde fifty')).toEqual([
+      'zygarde_fifty_percent:loose',
+      'zygarde_complete_fifty_percent:loose',
+    ]);
+    const fifteen = hits('15');
+    expect(fifteen.slice(0, 3)).toEqual([
+      // The species of that number first, but as what a number finds: it is no name.
+      'beedrill:loose',
+      'spinda_15:word',
+      'beedrill_mega:loose',
+    ]);
+    // Mew is number 151: found, but its class does not lift it over number 15 itself.
+    expect(fifteen).toContain('mew:loose');
+  });
+
+  it('puts a guess after every proper match and says which word it guessed', () => {
+    expect(search.find('shadow').map((hit) => [hit.entry.key, hit.match, hit.guessed])).toEqual([
+      ['calyrex_shadow_rider', 'word', []],
+      ['scatterbug_meadow', 'guess', ['meadow']],
+      ['spewpa_meadow', 'guess', ['meadow']],
+      ['vivillon_meadow', 'guess', ['meadow']],
+    ]);
+    expect(search.find('perfect').every((hit) => hit.match === 'guess')).toBe(true);
+    expect(search.find('perfect')[0]?.guessed).toEqual(['percent']);
+    // The second try reads two neighbouring letters in the wrong order, and nothing wider.
+    expect(search.find('lugai').map((hit) => [hit.entry.key, hit.match, hit.guessed])).toEqual([
+      ['lugia', 'guess', ['lugia']],
+    ]);
+    expect(hits('mwetwo')[0]).toBe('mewtwo:guess');
+    for (const text of ['none', 'lake', 'elit', 'base form', 'hundo', 'ex']) {
+      expect(
+        search.find(text).filter((hit) => hit.match === 'guess'),
+        text,
+      ).toEqual([]);
+    }
+    // A short word keeps its first letter to be read as a misspelling.
+    expect(hits('mewt')[0]).toBe('mewtwo:beginning');
+    expect(keys('nuk')).toEqual([]);
+    expect(hits('tyrannitar')[0]).toBe('tyranitar:guess');
+  });
+
+  it('reads no word as a misspelling of a nickname of another Pokémon', () => {
+    // `kanto` is a nickname of the species that have an Alolan form, `regiduck` one of
+    // Cresselia, `galar` one of the Galarian forms.
+    // Kabutops begins with it, and Furfrou's Kabuki Trim is one letter of a name away: no
+    // Diglett, Geodude or Meowth for their `kanto`.
+    expect(keys('kabuto')).toEqual(['kabuto', 'kabutops', 'furfrou_kabuki']);
+    expect(keys('regirock')).toEqual(['regirock']);
+    // Guesses by names (Gengar, Gligar), and no Galarian form for its `galar`.
+    const gangar = search.find('gangar');
+    expect(gangar.map((hit) => hit.entry.key)).toEqual(['gengar', 'gligar', 'gengar_mega']);
+    expect(gangar.every((hit) => hit.match === 'guess')).toBe(true);
+    expect(keys('poodle')).toEqual([]);
+    for (const text of ['swanna', 'poodle', 'kabuto', 'regirock', 'gangar']) {
+      const nicknamed = search
+        .find(text)
+        .filter((hit) => hit.match === 'guess')
+        .filter((hit) => !searchWords(hit.entry).some((word) => hit.guessed.includes(word)));
+      expect(nicknamed, text).toEqual([]);
+    }
+    expect(keys('swanna')[0]).toBe('swanna');
+    expect(search.find('swanna').flatMap((hit) => hit.guessed)).toEqual([
+      'savanna',
+      'savanna',
+      'savanna',
+    ]);
+  });
+
+  it('never reads a nickname as a misspelling', () => {
+    // `ttar` is a nickname of Tyranitar: `star` is not it, `tta` begins it.
+    expect(keys('star')).not.toContain('tyranitar');
+    expect(hits('tta')).toEqual(['tyranitar:beginning']);
+    expect(hits('ttar')).toEqual(['tyranitar:exact']);
+  });
+
+  it('does not find an entry by nothing but the words of ids that stand for it', () => {
+    // Pikachu's costumes have ids such as pikachu_rock_star and pikachu_pop_star.
+    expect(catalogue.aliasesOf('pikachu').some((alias) => alias.includes('star'))).toBe(true);
+    expect(keys('star')).not.toContain('pikachu');
+    for (const text of ['copy', '2019', 'copy 2019']) {
+      for (const key of ['pikachu', 'venusaur', 'charizard', 'blastoise']) {
+        expect(keys(text), text).not.toContain(key);
+      }
+    }
+    // With a word of the entry itself they do find it.
+    expect(hits('pikachu copy')).toEqual(['pikachu:loose']);
+    expect(hits('pikachu star')).toEqual(['pikachu:loose']);
+  });
+});
+
 describe('PokemonSearch: forms that differ in looks only', () => {
   it('leaves them out unless the text names the form', () => {
     expect(keys('vivillon')).toEqual(['vivillon']);
```

Apply to `test/support/providers.ts`:

```diff
--- a/test/support/providers.ts
+++ b/test/support/providers.ts
@@ -39,6 +39,7 @@ export function pokemonFixture(
   };
   return {
     search: (text, options) => current().search(text, options),
+    find: (text, options) => current().find(text, options),
     exact: (text): PokemonEntry | undefined => current().exact(text),
   };
 }
```

Run: `npx vitest run --project unit src/commands/notifications/wants.test.ts src/commands/raids/raid-input.test.ts src/domain/pogo/pokemon-search.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/commands/notifications/want-input.ts`:

```diff
--- a/src/commands/notifications/want-input.ts
+++ b/src/commands/notifications/want-input.ts
@@ -1,4 +1,6 @@
 import type { AppContext } from '../../app-context.js';
+import type { PokemonEntry } from '../../domain/pogo/game-master.js';
+import type { PokemonHit } from '../../domain/pogo/pokemon-search.js';
 import { UserError } from '../../discord/errors.js';
 import {
   notificationTiers,
@@ -23,6 +25,7 @@ import {
   wantWord,
   wantWordGuesses,
 } from '../../domain/pogo/wants.js';
+import { searchText, searchTokens } from '../../domain/search/text.js';
 import { plain, truncate } from '../../render/text.js';
 import { beginningFirst, CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
 
@@ -57,75 +60,231 @@ function fixedTargets(): NotificationTarget[] {
   ];
 }
 
-/** Whether every typed word stands somewhere in a name. */
+/**
+ * Whether every typed word stands somewhere in a name, both folded as the search folds text
+ * (`flabebe` for Flabébé, `nidoran female` for Nidoran♀): `words` are `searchTokens`.
+ */
 function fits(name: string, words: readonly string[]): boolean {
-  const lower = name.toLowerCase();
-  return words.every((word) => lower.includes(word));
+  const folded = searchText(name);
+  return words.every((word) => folded.includes(word));
+}
+
+/** Whether every typed word begins a word of a label (`tyr base` for `Tyranitar (base form)`). */
+function beginsWords(label: string, typed: readonly string[]): boolean {
+  const words = searchTokens(label);
+  return typed.every((begun) => words.some((word) => word.startsWith(begun)));
+}
+
+/** The words a label adds to the name of a Pokémon: `(every form)`, `(base form)`. */
+const LABEL_WORDS = ['every', 'base', 'form'];
+
+/** What a label adds to the name of a tier or an IV target: `T5 raids`, `Perfect IV spawns`. */
+const FIXED_LABEL_WORDS: ReadonlySet<string> = new Set(['raids', 'spawns', 'iv']);
+
+/**
+ * Whether a text begins the label of a tier or an IV target by what names it: every typed word
+ * begins a word of the label, and one of them a word that is the target's own (`perf`, `t5`,
+ * `shadow`, `el`). What the label only adds finds nothing by itself: `ra` is Raikou, not ten
+ * tiers of raids, and `sp` is Spinda.
+ */
+function beginsFixedLabel(label: string, typed: readonly string[]): boolean {
+  const words = searchTokens(label);
+  const own = words.filter((word) => !FIXED_LABEL_WORDS.has(word));
+  return (
+    typed.every((begun) => words.some((word) => word.startsWith(begun))) &&
+    typed.some((begun) => own.some((word) => word.startsWith(begun)))
+  );
+}
+
+/**
+ * The names a typed text may begin with when its last words are words of a label, or the
+ * beginning of them: `tyranitar base` and `tyranitar base fo` give `tyranitar`. The search
+ * knows the names only, so the name is searched and the label then compared with all of the text.
+ */
+function namesBeforeLabelWords(typed: readonly string[]): string[] {
+  const names: string[] = [];
+  for (let tail = 1; tail <= 2 && tail < typed.length; tail += 1) {
+    const last = typed.slice(-tail);
+    if (!last.every((begun) => LABEL_WORDS.some((word) => word.startsWith(begun)))) break;
+    names.push(typed.slice(0, -tail).join(' '));
+  }
+  return names;
 }
 
 /**
  * The choices for the `target` option of `/want`. With nothing typed: the tiers, then the IV
- * targets. With text:
+ * targets. With text, in this order (Matt, 2026-10-13):
  *
- * 1. what the text would be read as if it were sent as it stands (`readWantText`), and the
- *    tier or IV target it names or begins: they must not fall off the end behind the Pokémon;
- * 2. the current raid bosses that fit it: a shadow boss as the shadow raids of its species
- *    (`Shadow Landorus`), a boss that is one of several forms as that form, each with its
- *    species after it; a boss that is all there is of its species once, plainly;
- * 3. the tiers and IV targets whose label fits;
- * 4. after `shadow`, the shadow raids of the species the rest of the text finds;
- * 5. any Pokémon the search finds: a species that has several entries as `X (every form)`,
- *    followed by its entries that were found, each by its name; any other species once.
+ * 0. the Pokémon the text names in full, as it would be read if it were sent as it stands
+ *    (`readWantText`): `mew` is Mew, also while Mewtwo is a boss;
+ * 1. the current raid bosses that the text finds by their name (not by a key or a number, and
+ *    not as a guess): a shadow boss as the shadow raids of its species (`Shadow Landorus`), a
+ *    boss that is one of several forms as that form, each with its species after it; a boss
+ *    that is all there is of its species once, plainly. The words a label adds (`every form`,
+ *    `base form`) find no boss; `shadow` finds the shadow raids of the shadow bosses;
+ * 2. the tier and IV targets the text names or begins (a tier also answers to `3 star`, so
+ *    `star` finds the tiers), and those whose label it begins by a word of their own
+ *    (`beginsFixedLabel`);
+ * 3. every other Pokémon the text finds properly, in the order of the search (`PokemonSearch`:
+ *    what it leads to by name first, a legendary before an ordinary Pokémon): after `shadow`,
+ *    the shadow raids of the species the rest of the text finds, those that can be shadow
+ *    first and without regard to their class; then a species that
+ *    has several entries as `X (every form)`, followed by its entries that were found, each
+ *    by its name, and any other species once; and what the words of a label find
+ *    (`tyranitar base`, `giratina every form`);
+ * 4. guesses (a word read as a misspelling), each only when its label shows the word that was
+ *    guessed: `shadow` finds `Scatterbug (Meadow Pattern)`, but not `Scatterbug (every form)`.
  *
  * Nothing twice, 25 at most. A choice's value is the target's token.
  */
 export function wantChoices(ctx: AppContext, typed: string): Choice[] {
   const { catalogue } = ctx.gameData;
-  const words = typed.trim().toLowerCase().split(/\s+/).filter(Boolean);
+  const words = searchTokens(typed);
   const targets: NotificationTarget[] = [];
   const add = (target: NotificationTarget): void => {
+    if (targets.length >= MAX_CHOICES) return;
     if (!targets.some((known) => sameNotificationTarget(known, target))) targets.push(target);
   };
   if (words.length === 0) {
     fixedTargets().forEach(add);
   } else {
+    const begins = (target: NotificationTarget): boolean =>
+      beginsWords(wantLabel(ctx, target), words);
+    const hits = ctx.pokemon.find(typed, { limit: MAX_CHOICES * 4 });
+    const rest = SHADOW_OF.exec(typed.trim())?.[1];
+    const shadowHits = rest === undefined ? [] : shadowFinds(ctx, rest);
+    // A boss goes first for its name: one found by its key, by its number or by the beginning
+    // of its number (`3` is Venusaur's number, `5` begins number 576) stands with the other
+    // Pokémon, after the tiers. Nor does one found by a word of its form: `for` is
+    // Forretress, not every boss that is a Forme. The bosses are asked for by themselves,
+    // without a limit: among everything `s` finds, Starmie may stand beyond the hundredth.
+    const bosses = ctx.raidBosses.bosses();
+    const bossKeys = new Set(bosses.flatMap((boss) => (boss.entry ? [boss.entry.key] : [])));
+    const shadowBosses = new Set(
+      bosses.flatMap((boss) => (boss.entry && boss.tier.shadow ? [boss.entry.dex] : [])),
+    );
+    const named = new Set(
+      ctx.pokemon
+        .find(typed, { filter: (entry) => bossKeys.has(entry.key) })
+        .filter((hit) => hit.named)
+        .map((hit) => hit.entry.key),
+    );
+    const namedShadow = new Set(
+      rest === undefined
+        ? []
+        : shadowFinds(ctx, rest, (entry) => shadowBosses.has(entry.dex))
+            .filter((hit) => hit.named)
+            .map((hit) => hit.entry.dex),
+    );
+
+    // 0. The Pokémon the text names in full.
     const read = readWantText(typed, wantSpeciesFinder(catalogue, ctx.pokemon));
-    if (read.kind === 'target') add(read.target);
-    wantWordGuesses(typed).forEach(add);
-    for (const boss of ctx.raidBosses.bosses()) {
+    if (read.kind === 'target' && read.target.kind === 'pokemon') add(read.target);
+
+    // 1. The current raid bosses.
+    for (const boss of bosses) {
       // A boss the game master does not know has no Pokédex number: its tier can be wanted.
       if (!boss.entry) continue;
       const species = pokemonTarget(boss.entry.dex);
+      const shadow = pokemonTarget(boss.entry.dex, undefined, true);
       const offered = boss.tier.shadow
-        ? [pokemonTarget(boss.entry.dex, undefined, true), species]
+        ? [shadow, species]
         : hasForms(catalogue, boss.entry.dex)
           ? [entryWant(catalogue, boss.entry), species]
           : [species];
-      // By the boss's name all of it is offered; otherwise what the text itself fits (`shadow`
-      // finds the shadow raids of every shadow boss, not their species besides).
-      const named = fits(boss.name, words);
-      for (const target of offered) if (named || fits(wantLabel(ctx, target), words)) add(target);
+      // By the boss's name all of it is offered. Otherwise only its shadow raids, by what the
+      // text says after `shadow` or by the beginning of their label (`shadow` finds the shadow
+      // raids of every shadow boss, not their species besides): what a label adds to a name
+      // (`every form`, `base form`) finds no boss.
+      const all = named.has(boss.entry.key);
+      for (const target of offered) {
+        const shadowRaids =
+          target === shadow && (namedShadow.has(boss.entry.dex) || begins(target));
+        if (all || shadowRaids) add(target);
+      }
     }
-    for (const target of fixedTargets()) if (fits(wantLabel(ctx, target), words)) add(target);
-    const rest = SHADOW_OF.exec(typed.trim())?.[1];
-    if (rest !== undefined) {
-      for (const entry of ctx.pokemon.search(rest, { limit: MAX_CHOICES })) {
-        if (targets.length >= MAX_CHOICES) break;
-        add(pokemonTarget(entry.dex, undefined, true));
+
+    // 2. The tiers and the IV targets.
+    wantWordGuesses(typed).forEach(add);
+    for (const target of fixedTargets()) {
+      if (beginsFixedLabel(wantLabel(ctx, target), words)) add(target);
+    }
+
+    // 3. Every other proper match.
+    if (read.kind === 'target') add(read.target);
+    for (const hit of shadowHits) {
+      if (hit.match !== 'guess') add(pokemonTarget(hit.entry.dex, undefined, true));
+    }
+    for (const hit of hits) {
+      if (hit.match === 'guess') continue;
+      add(pokemonTarget(hit.entry.dex));
+      add(entryWant(catalogue, hit.entry));
+    }
+    for (const name of namesBeforeLabelWords(words)) {
+      for (const hit of ctx.pokemon.find(name, { limit: MAX_CHOICES })) {
+        if (hit.match === 'guess') continue;
+        for (const target of [pokemonTarget(hit.entry.dex), entryWant(catalogue, hit.entry)]) {
+          if (begins(target)) add(target);
+        }
       }
     }
-    for (const entry of ctx.pokemon.search(typed, { limit: MAX_CHOICES * 4 })) {
-      if (targets.length >= MAX_CHOICES) break;
-      add(pokemonTarget(entry.dex));
-      add(entryWant(catalogue, entry));
+
+    // 4. Guesses, where the label shows the word that was guessed.
+    const shows = (target: NotificationTarget, guessed: readonly string[]): boolean => {
+      const label = searchTokens(wantLabel(ctx, target));
+      return guessed.every((word) => label.includes(word));
+    };
+    const guess = (target: NotificationTarget, guessed: readonly string[]): void => {
+      if (shows(target, guessed)) add(target);
+    };
+    for (const hit of shadowHits) {
+      if (hit.match === 'guess') guess(pokemonTarget(hit.entry.dex, undefined, true), hit.guessed);
+    }
+    for (const hit of hits) {
+      if (hit.match !== 'guess') continue;
+      guess(pokemonTarget(hit.entry.dex), hit.guessed);
+      guess(entryWant(catalogue, hit.entry), hit.guessed);
     }
   }
-  return targets.slice(0, MAX_CHOICES).map((target) => ({
+  return targets.map((target) => ({
     name: truncate(wantLabel(ctx, target), CHOICE_NAME),
     value: wantToken(target),
   }));
 }
 
+/**
+ * What the text after `shadow` finds, for the shadow raids of a species: in the order of the
+ * search without its preference for legendaries (few of them have shadow raids, and it is not
+ * what is likelier meant here), those the game data says can be shadow first. One letter is
+ * not read as the Unown of that letter, and megas and primals are left out: there is no shadow
+ * raid of one, and `me` would find every species that has a mega by its nickname. With
+ * `among`, only these entries are asked for, however far down the search has them.
+ */
+function shadowFinds(
+  ctx: AppContext,
+  rest: string,
+  among?: (entry: PokemonEntry) => boolean,
+): PokemonHit[] {
+  const oneLetter = searchTokens(rest).join('').length < 2;
+  const hits = ctx.pokemon
+    .find(rest, {
+      plain: true,
+      filter: (entry) => entry.kind !== 'mega' && (among?.(entry) ?? true),
+      ...(among ? {} : { limit: MAX_CHOICES * 2 }),
+    })
+    .filter((hit) => !(oneLetter && hit.match === 'exact'));
+  const proper = hits.filter((hit) => hit.match !== 'guess');
+  // Of the species: the choice is for the shadow raids of every form of it.
+  const { catalogue } = ctx.gameData;
+  const canBeShadow = (hit: PokemonHit): boolean =>
+    catalogue.byDex(hit.entry.dex).some((entry) => entry.shadow);
+  return [
+    ...proper.filter(canBeShadow),
+    ...proper.filter((hit) => !canBeShadow(hit)),
+    ...hits.filter((hit) => hit.match === 'guess'),
+  ].slice(0, MAX_CHOICES);
+}
+
 /**
  * Whether a target has a scope to speak of: a Pokémon that can be met in raids and in the wild.
  * A tier, an IV target, the shadow raids of a Pokémon and a mega have the one scope only.
@@ -155,8 +314,10 @@ const folded = (text: string): string => text.trim().toLowerCase().replace(/\s+/
 
 /**
  * The want of the member's own list that a typed text is a name of, in full: its label, with
- * or without the scope (after ` · ` or in brackets), or its name in a sentence. Undefined when
- * the text is no such name or the name of several, and for a token: `typedWant` reads those.
+ * or without the scope (after ` · ` or in brackets), or its name in a sentence; failing that,
+ * the words of one of these without their brackets and signs (`tyranitar base form`).
+ * Undefined when the text is no such name or the name of several, and for a token:
+ * `typedWant` reads those.
  */
 export function ownWantNamed(
   ctx: AppContext,
@@ -164,17 +325,21 @@ export function ownWantNamed(
   typed: string,
 ): NotificationTarget | undefined {
   if (parseWantToken(typed)) return undefined;
-  const text = folded(typed);
-  const named = wants.filter((want) =>
-    [
-      wantWithScope(ctx, want),
-      `${wantLabel(ctx, want.target)} (${SCOPE_WORDS[want.scope]})`,
-      wantLabel(ctx, want.target),
-      wantName(ctx, want.target),
-    ].some((name) => folded(name) === text),
-  );
-  const [only] = named;
-  return only && named.length === 1 ? only.target : undefined;
+  const namedBy = (same: (text: string) => string): NotificationTarget | undefined => {
+    const text = same(typed);
+    if (text === '') return undefined;
+    const named = wants.filter((want) =>
+      [
+        wantWithScope(ctx, want),
+        `${wantLabel(ctx, want.target)} (${SCOPE_WORDS[want.scope]})`,
+        wantLabel(ctx, want.target),
+        wantName(ctx, want.target),
+      ].some((name) => same(name) === text),
+    );
+    const [only] = named;
+    return only && named.length === 1 ? only.target : undefined;
+  };
+  return namedBy(folded) ?? namedBy(searchText);
 }
 
 /**
@@ -183,7 +348,8 @@ export function ownWantNamed(
  */
 export function ownWantChoices(ctx: AppContext, wants: readonly Want[], typed: string): Choice[] {
   const text = typed.trim().toLowerCase();
-  const words = text.split(/\s+/).filter(Boolean);
+  // Folded as the list of `/want` folds what is typed.
+  const words = searchTokens(typed);
   const word = wantWord(typed);
   return wants
     .map((want) => ({ want, name: wantWithScope(ctx, want) }))
```

Apply to `src/commands/raids/raid-input.ts`:

```diff
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -354,30 +354,54 @@ function onePerPokemon(bosses: readonly RaidBoss[]): RaidBoss[] {
 
 /**
  * The choices for the `pokemon` option of `/boss` in the post of a train: the current bosses,
- * each Pokémon once and without its tier, narrowed to what was typed, and then any Pokémon that
- * fits the text (a train may be planned for a boss that is coming). No eggs: a train has no
- * tier.
+ * each Pokémon once and without its tier; with text, the Pokémon it names in full, then the
+ * current bosses it finds by their name, in the order of the search (as the list of `/want`
+ * has them; asked for by themselves, so that a boss far down among everything `s` finds is
+ * still first), and then any Pokémon the search finds, in its order (a train may be planned
+ * for a boss that is coming). No eggs: a train has no tier.
  */
 export function trainBossChoices(ctx: AppContext, typed: string): Choice[] {
-  const words = typed.trim().toLowerCase().split(/\s+/).filter(Boolean);
-  const fits = (name: string): boolean => {
-    const lower = name.toLowerCase();
-    return words.every((word) => lower.includes(word));
-  };
-  const choices = onePerPokemon(ctx.raidBosses.bosses())
-    .map((boss) => ({
-      name: boss.entry?.name ?? boss.name,
-      // A boss the game master does not know is found on the list again by its own key.
-      value: boss.entry ? `p:${boss.entry.key}` : `b:${boss.key}:${tierCode(boss.tier)}`,
-    }))
-    .filter((choice) => choice.value.length <= 100 && fits(choice.name));
-  if (words.length > 0) {
-    const listed = new Set(choices.map((choice) => choice.value));
-    for (const entry of ctx.pokemon.search(typed, { limit: MAX_CHOICES })) {
-      const value = `p:${entry.key}`;
-      if (!listed.has(value) && value.length <= 100) choices.push({ name: entry.name, value });
-    }
+  const words = searchTokens(typed);
+  const bosses = onePerPokemon(ctx.raidBosses.bosses());
+  const choice = (boss: RaidBoss): Choice => ({
+    name: boss.entry?.name ?? boss.name,
+    // A boss the game master does not know is found on the list again by its own key.
+    value: boss.entry ? `p:${boss.entry.key}` : `b:${boss.key}:${tierCode(boss.tier)}`,
+  });
+  let choices: Choice[];
+  if (words.length === 0) {
+    choices = bosses.map(choice);
+  } else {
+    const hits = ctx.pokemon.find(typed, { limit: MAX_CHOICES * 4 });
+    const byKey = new Map(bosses.flatMap((boss) => (boss.entry ? [[boss.entry.key, boss]] : [])));
+    // By its name: not by a word of its form, a key or a number, and not as a guess.
+    const named = ctx.pokemon
+      .find(typed, { filter: (entry) => byKey.has(entry.key) })
+      .filter((hit) => hit.named);
+    // What the text names in full, boss or not: `mew` is Mew, also while Mewtwo is a boss.
+    const [first] = hits;
+    const inFull = first?.match === 'exact' ? [first] : [];
+    // A boss the game master does not know is found by the words of its own name.
+    const begun = (name: string): boolean => {
+      const own = searchTokens(name);
+      return words.every((word) => own.some((part) => part.startsWith(word)));
+    };
+    choices = [
+      ...inFull.map((hit) => ({ name: hit.entry.name, value: `p:${hit.entry.key}` })),
+      ...named.flatMap((hit) => {
+        const boss = byKey.get(hit.entry.key);
+        return boss ? [choice(boss)] : [];
+      }),
+      ...bosses.filter((boss) => !boss.entry && begun(boss.name)).map(choice),
+      ...hits.map((hit) => ({ name: hit.entry.name, value: `p:${hit.entry.key}` })),
+    ];
   }
+  const listed = new Set<string>();
+  choices = choices.filter((one) => {
+    if (one.value.length > 100 || listed.has(one.value)) return false;
+    listed.add(one.value);
+    return true;
+  });
   return choices
     .slice(0, MAX_CHOICES)
     .map((choice) => ({ ...choice, name: truncate(choice.name, CHOICE_NAME) }));
```

Apply to `src/domain/pogo/pokemon-search.ts`:

```diff
--- a/src/domain/pogo/pokemon-search.ts
+++ b/src/domain/pogo/pokemon-search.ts
@@ -1,6 +1,8 @@
+import { distance } from 'fastest-levenshtein';
 import MiniSearch from 'minisearch';
 import { MATCH_WEIGHTS, allowedTypos, searchText, searchTokens } from '../search/text.js';
 import type { PokemonCatalogue } from './catalogue.js';
+import { feedLookupOf } from './feed-lookup.js';
 import type { PokemonEntry } from './game-master.js';
 
 export interface PokemonSearchOptions {
@@ -8,16 +10,70 @@ export interface PokemonSearchOptions {
   limit?: number;
   /** Consider only these entries (raid bosses, Pokémon with a mega, …). */
   filter?: (entry: PokemonEntry) => boolean;
+  /**
+   * Without the preference for legendary and mythical Pokémon and ultra beasts: where the
+   * class says nothing about what is likelier meant (shadow raids, which few of them have).
+   */
+  plain?: boolean;
+}
+
+/**
+ * How well a text fits an entry it found, best first:
+ *
+ * - `exact`: the text names this entry outright (`PokemonSearch.exact`);
+ * - `word`: every typed word is a word of its name or of a nickname;
+ * - `beginning`: every typed word is at least the beginning of such a word (`gira`);
+ * - `loose`: a proper match, but a typed word is found only in the key or in an id that stands
+ *   for the entry (`zygarde fifty percent`, `pikachu copy`), or is or begins its number;
+ * - `guess`: a typed word had to be read as a misspelling (`meadow` for `shadow`).
+ */
+export type PokemonMatch = 'exact' | 'word' | 'beginning' | 'loose' | 'guess';
+
+export interface PokemonHit {
+  entry: PokemonEntry;
+  match: PokemonMatch;
+  /**
+   * Whether the text leads to the entry by its name (`PokemonSearch`): it names it outright,
+   * or its first word begins the entry's or the species' name. False for what a word of a
+   * form, a type or a style found (`for` and every Forme), a key, a number or a guess. A list
+   * that puts some Pokémon first for being named (the current bosses) asks this.
+   */
+  named: boolean;
+  /**
+   * For a guess: the words of the entry that typed words were read as misspellings of. Whoever
+   * offers a guess can show these, so that the reader sees why it is there.
+   */
+  guessed: readonly string[];
 }
 
+const MATCH_ORDER: Readonly<Record<PokemonMatch, number>> = {
+  exact: 0,
+  word: 1,
+  beginning: 2,
+  loose: 3,
+  guess: 4,
+};
+
 interface PokemonDocument {
   id: string;
   name: string;
   nicknames: string;
+  /**
+   * The key, and with it the ids that stand for the entry (the bare species id, costumes,
+   * appearance-only forms): one field, as it always was, so that an entry with many such ids
+   * scores as it always did. Which of its words are the key's own is kept beside the index
+   * (`ownWords`).
+   */
   key: string;
   dex: string;
 }
 
+type Field = Exclude<keyof PokemonDocument, 'id'>;
+
+/** How one typed word was found in an entry, in the order of `MATCH_ORDER`. */
+const WORD_FITS = ['word', 'beginning', 'loose', 'guess'] as const;
+type WordFit = (typeof WORD_FITS)[number];
+
 const KIND_ORDER: Readonly<Record<PokemonEntry['kind'], number>> = {
   species: 0,
   regional: 1,
@@ -26,10 +82,50 @@ const KIND_ORDER: Readonly<Record<PokemonEntry['kind'], number>> = {
 };
 
 /**
- * The second try, for two letters swapped in a short name: no typos up to three letters, else
- * two.
+ * How far the index looks on the second try: two letters, which is what two neighbouring
+ * letters typed in the wrong order count as. What it finds is then held to `swapped`.
+ */
+const SWAP_TYPOS = (term: string): number => (isNumber(term) || term.length < 2 ? 0 : 2);
+
+/** Whether a word is another with two neighbouring letters in the wrong order (`lugai`). */
+function swapped(typed: string, word: string): boolean {
+  if (typed.length !== word.length || typed === word) return false;
+  let first = 0;
+  while (typed[first] === word[first]) first += 1;
+  return (
+    typed[first] === word[first + 1] &&
+    typed[first + 1] === word[first] &&
+    typed.slice(first + 2) === word.slice(first + 2)
+  );
+}
+
+/**
+ * As many entries of one species as its class puts before the ordinary Pokémon, the best of
+ * them: with all of them lifted, the eighteen types of Arceus and of Silvally filled a list
+ * for `ar` and `sil` and left no room for Arcanine and Silcoon.
+ */
+const CLASS_LIFTS = 3;
+
+/** Whether a typed word may be read as a misspelling of a word of an entry. */
+type Misspelt = (typed: string, word: string) => boolean;
+
+/**
+ * The first try: as many wrong letters as the length of the word allows (`allowedTypos`). A
+ * word of up to five letters must keep its first letter, as in the short lists
+ * (`word-match.ts`): one wrong letter in four finds a Pokémon for nearly any short word
+ * otherwise (`lake` is not Walking Wake, `ttar` not Furfrou's Star Trim).
  */
-const LENIENT_TYPOS = (term: string): number => (isNumber(term) || term.length <= 3 ? 0 : 2);
+const MISSPELT: Misspelt = (typed, word) =>
+  distance(typed, word) <= FIRST_TYPOS(typed) && (typed.length > 5 || typed[0] === word[0]);
+
+/**
+ * The second try, when the first found nothing: besides what the first allows, two
+ * neighbouring letters in the wrong order, in a word of any length (`lugai`, which is two
+ * wrong letters in five). Nothing wider: two free wrong letters in a short word found a
+ * Pokémon for nearly any word (`none`, `lake`, `hundo`).
+ */
+const MISSPELT_OR_SWAPPED: Misspelt = (typed, word) =>
+  MISSPELT(typed, word) || (!isNumber(typed) && swapped(typed, word));
 
 /** A number may be typed in part (a beginning) but is never a misspelling: 1000 is not 1002. */
 function isNumber(term: string): boolean {
@@ -79,13 +175,20 @@ export function mergeNicknames(
  * Finds Pokémon by what members type: the name ("giratina origin", "alolan rattata", "mega
  * charizard y"), the catalogue key, a game-master id that stands for an entry, a nickname
  * ("ttar") or the Pokédex number. Every word must match; a word may be the beginning of a longer
- * one ("alo", "galar", "hisu") or slightly misspelt. When that finds nothing, a second try allows
- * more misspelling, for two letters swapped in a short name ("lugai").
+ * one ("alo", "galar", "hisu") or slightly misspelt. When that finds nothing, a second try also
+ * reads two neighbouring letters in the wrong order ("lugai").
  *
- * The best fit comes first. Among equal fits the species comes before its regional forms, other
- * forms and megas, so "giratina" gives the Altered Forme and "charizard" the plain one. A form
- * that differs from its species in looks only (Vivillon's patterns, Unown's letters) is left
- * out unless the text names it: "vivillon" gives one result, "vivillon marine" the pattern.
+ * The best fit comes first (`find`): what the text names outright; then the hits it leads to
+ * by their name (its first word begins the name, a nickname or the species' name, or is a word
+ * of the species' name: `gira`, `hoo`, `rattata`), whole words before beginnings and among
+ * equals a legendary, a mythical Pokémon or an ultra beast before an ordinary one, though the
+ * class lifts three entries of a species at most (`CLASS_LIFTS`: Arceus has eighteen); then
+ * the hits found only by a word of a form, a type or a style (`ty` finds Tyranitar before the
+ * seventeen types of Arceus), whatever their class; then what only a key or a number finds;
+ * guesses last. Among equal fits the species comes before its regional forms, other forms and
+ * megas, so "giratina" gives the Altered Forme and "charizard" the plain one. A form that
+ * differs from its species in looks only (Vivillon's patterns, Unown's letters) is left out
+ * unless the text names it: "vivillon" gives one result, "vivillon marine" the pattern.
  *
  * Built for one catalogue; build a new one when the game data or the nicknames change.
  */
@@ -94,6 +197,16 @@ export class PokemonSearch {
   private readonly exactTexts = new Map<string, PokemonEntry | null>();
   /** For a looks-only form: the words that tell it from its species. */
   private readonly formWords = new Map<string, Set<string>>();
+  /** By entry: the words of its own key, as against those of the ids that stand for it. */
+  private readonly ownWords = new Map<string, ReadonlySet<string>>();
+  /**
+   * By entry: the first word of its name, the first word of each of its nicknames, and the
+   * words of its species' name.
+   */
+  private readonly leads = new Map<
+    string,
+    { first: string; nicknames: readonly string[]; species: ReadonlySet<string> }
+  >();
 
   constructor(
     private readonly catalogue: PokemonCatalogue,
@@ -105,7 +218,8 @@ export class PokemonSearch {
     });
     for (const entry of catalogue.all) {
       const nicks = nicknames.get(entry.key) ?? [];
-      const ids = [entry.key, ...catalogue.aliasesOf(entry.key)];
+      const aliases = catalogue.aliasesOf(entry.key);
+      const ids = [entry.key, ...aliases];
       this.index.add({
         id: entry.key,
         name: entry.name,
@@ -113,7 +227,16 @@ export class PokemonSearch {
         key: ids.join(' '),
         dex: String(entry.dex),
       });
+      this.ownWords.set(entry.key, new Set(searchTokens(entry.key)));
       for (const text of [entry.name, ...ids, ...nicks]) this.remember(text, entry);
+      this.leads.set(entry.key, {
+        first: searchTokens(entry.name)[0] ?? '',
+        nicknames: nicks.flatMap((nick) => searchTokens(nick).slice(0, 1)),
+        // The species as it is called without its form: Giratina, not its Altered Forme.
+        species: new Set(
+          searchTokens(feedLookupOf(catalogue).speciesName(entry.pokemonId) ?? entry.name),
+        ),
+      });
       const species = catalogue.species(entry.dex);
       if (entry.kind === 'form' && species && species !== entry && sameBattler(entry, species)) {
         const shared = new Set(searchTokens(`${species.name} ${species.key}`));
@@ -132,28 +255,132 @@ export class PokemonSearch {
     else if (known !== entry) this.exactTexts.set(folded, null);
   }
 
-  private rank(text: string, typos: (term: string) => number): PokemonEntry[] {
-    return this.index
-      .search(text, {
-        combineWith: 'AND',
-        boost: { name: 3, nicknames: 3 },
-        prefix: true,
-        fuzzy: typos,
-        weights: { ...MATCH_WEIGHTS },
-      })
-      .filter((result) => {
-        const formWords = this.formWords.get(result.id as string);
-        return !formWords || result.terms.some((term) => formWords.has(term));
-      })
-      .map((result) => ({ entry: this.catalogue.byKey(result.id as string), score: result.score }))
-      .filter((hit): hit is { entry: PokemonEntry; score: number } => hit.entry !== undefined)
-      .sort(
-        (a, b) =>
-          b.score - a.score ||
-          KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] ||
-          a.entry.key.localeCompare(b.entry.key),
-      )
-      .map((hit) => hit.entry);
+  /**
+   * How a hit fits the typed words, or undefined for a hit that is none after all:
+   *
+   * - a nickname is never read as a misspelling: nicknames are short slang, and `star` is not
+   *   `ttar`, nor `kabuto` the `kanto` of an Alolan form's counterpart. Neither is an id that
+   *   only stands for the entry, nor a number: a guess is a word of the name, or one of the
+   *   entry's own key;
+   * - a hit found by nothing but the words of ids that stand for it is none: Pikachu's
+   *   costumes have ids with `star`, `party` and `summer` in them, and `star` is not Pikachu.
+   *   With a word of the entry itself beside them (`pikachu copy`) they do find it.
+   */
+  private fit(
+    key: string,
+    typed: readonly string[],
+    found: Readonly<Record<string, readonly string[]>>,
+    misspelt: Misspelt,
+  ): Pick<PokemonHit, 'match' | 'guessed'> | undefined {
+    const ownWords = this.ownWords.get(key);
+    let worst = 0;
+    let onlyAliases = true;
+    const guessed: string[] = [];
+    for (const word of typed) {
+      let best: { fit: number; own: boolean; term: string } | undefined;
+      for (const [term, fields] of Object.entries(found) as [string, Field[]][]) {
+        const named = fields.includes('name') || fields.includes('nicknames');
+        // Found in the key field alone, by a word that is not the key's own: by an id that
+        // only stands for the entry.
+        const own = fields.some((field) => field !== 'key') || ownWords?.has(term) === true;
+        let fit: WordFit;
+        if (term === word) fit = named ? 'word' : 'loose';
+        else if (term.startsWith(word)) fit = named ? 'beginning' : 'loose';
+        else if (
+          (fields.includes('name') || (fields.includes('key') && ownWords?.has(term) === true)) &&
+          misspelt(word, term)
+        ) {
+          fit = 'guess';
+        } else continue;
+        const rank = WORD_FITS.indexOf(fit);
+        // Of two equal fits the one by a word of the entry itself counts.
+        if (!best || rank < best.fit || (rank === best.fit && own && !best.own)) {
+          best = { fit: rank, own, term };
+        }
+      }
+      if (!best) return undefined;
+      if (best.own) onlyAliases = false;
+      if (WORD_FITS[best.fit] === 'guess') guessed.push(best.term);
+      worst = Math.max(worst, best.fit);
+    }
+    const match = WORD_FITS[worst];
+    return onlyAliases || match === undefined ? undefined : { match, guessed };
+  }
+
+  /**
+   * Whether a text leads to an entry by its name: its first word begins the first word of the
+   * entry's name (`gira`, `mega`, `alo`), of one of its nicknames (`hoo` for Ho-Oh, `tta` for
+   * Tyranitar) or of its species' name (`ratt` for the Alolan Rattata, `char` for Mega
+   * Charizard), or is a word of the species' name (`bulu` for Tapu Bulu). Anything else found
+   * the entry by a word of a form, a type or a style (`ty` for Arceus of any type, `for` for
+   * every Forme), or by the middle of its name (`bul` for Tapu Bulu).
+   */
+  private ledByName(entry: PokemonEntry, typed: readonly string[]): boolean {
+    const [first] = typed;
+    const lead = this.leads.get(entry.key);
+    if (first === undefined || !lead) return false;
+    const [speciesFirst = ''] = lead.species;
+    return (
+      lead.first.startsWith(first) ||
+      lead.nicknames.some((nickname) => nickname.startsWith(first)) ||
+      speciesFirst.startsWith(first) ||
+      lead.species.has(first)
+    );
+  }
+
+  private rank(
+    text: string,
+    typos: (term: string) => number,
+    misspelt: Misspelt,
+    plain: boolean,
+  ): PokemonHit[] {
+    const typed = [...new Set(searchTokens(text))];
+    const hits: { hit: PokemonHit; score: number; group: number; classed: boolean }[] = [];
+    const results = this.index.search(text, {
+      combineWith: 'AND',
+      boost: { name: 3, nicknames: 3 },
+      prefix: true,
+      fuzzy: typos,
+      weights: { ...MATCH_WEIGHTS },
+    });
+    for (const result of results) {
+      const formWords = this.formWords.get(result.id as string);
+      if (formWords && !result.terms.some((term) => formWords.has(term))) continue;
+      const entry = this.catalogue.byKey(result.id as string);
+      const fit = this.fit(entry?.key ?? '', typed, result.match, misspelt);
+      if (!entry || !fit) continue;
+      const named = fit.match === 'word' || fit.match === 'beginning';
+      const led = named && this.ledByName(entry, typed);
+      hits.push({
+        hit: { entry, ...fit, named: led },
+        score: result.score,
+        // By its name; by a word of a form or the like; by a key or a number; by a guess.
+        group: led ? 0 : named ? 1 : MATCH_ORDER[fit.match],
+        // The class orders only among the hits a text leads to by their name.
+        classed: led && !plain && entry.class !== null,
+      });
+    }
+    type Ranked = (typeof hits)[number];
+    const order =
+      (withClass: boolean) =>
+      (a: Ranked, b: Ranked): number =>
+        a.group - b.group ||
+        MATCH_ORDER[a.hit.match] - MATCH_ORDER[b.hit.match] ||
+        (withClass ? Number(b.classed) - Number(a.classed) : 0) ||
+        b.score - a.score ||
+        KIND_ORDER[a.hit.entry.kind] - KIND_ORDER[b.hit.entry.kind] ||
+        a.hit.entry.key.localeCompare(b.hit.entry.key);
+    // The class lifts the best few entries of a species; its others stand where they would
+    // without a class.
+    hits.sort(order(false));
+    const lifted = new Map<number, number>();
+    for (const ranked of hits) {
+      if (!ranked.classed) continue;
+      const before = lifted.get(ranked.hit.entry.dex) ?? 0;
+      if (before >= CLASS_LIFTS) ranked.classed = false;
+      else lifted.set(ranked.hit.entry.dex, before + 1);
+    }
+    return hits.sort(order(true)).map(({ hit }) => hit);
   }
 
   /**
@@ -165,15 +392,43 @@ export class PokemonSearch {
     return this.exactTexts.get(searchText(text)) ?? undefined;
   }
 
-  search(text: string, options: PokemonSearchOptions = {}): PokemonEntry[] {
+  /**
+   * What a text finds, best first, each hit with how it fits (`PokemonMatch`): the entry the
+   * text names outright, then the order the class describes; among the hits a text leads to
+   * by their name a legendary, a mythical Pokémon or an ultra beast stands before an ordinary
+   * one (`gira` gives Giratina before Girafarig; not with `plain`), and a guess stands after
+   * every proper match. The species whose Pokédex number the text is stands first as well,
+   * but as a `loose` hit: a number is not a name.
+   */
+  find(text: string, options: PokemonSearchOptions = {}): PokemonHit[] {
     const { filter, limit } = options;
+    const plain = options.plain === true;
     const folded = searchText(text);
-    const number = /^\d+$/.test(folded) ? this.catalogue.species(Number(folded)) : undefined;
-    const exact = this.exact(text) ?? number;
-    let ranked = this.rank(text, FIRST_TYPOS);
-    if (ranked.length === 0) ranked = this.rank(text, LENIENT_TYPOS);
-    const found = exact ? [exact, ...ranked.filter((entry) => entry !== exact)] : ranked;
-    const allowed = filter ? found.filter(filter) : found;
+    const named = this.exact(text);
+    const numbered =
+      named === undefined && /^\d+$/.test(folded)
+        ? this.catalogue.species(Number(folded))
+        : undefined;
+    const first = named ?? numbered;
+    let ranked = this.rank(text, FIRST_TYPOS, MISSPELT, plain);
+    if (ranked.length === 0) ranked = this.rank(text, SWAP_TYPOS, MISSPELT_OR_SWAPPED, plain);
+    const found: PokemonHit[] = first
+      ? [
+          {
+            entry: first,
+            match: named ? 'exact' : 'loose',
+            named: named !== undefined,
+            guessed: [],
+          },
+          ...ranked.filter((hit) => hit.entry !== first),
+        ]
+      : ranked;
+    const allowed = filter ? found.filter((hit) => filter(hit.entry)) : found;
     return limit === undefined ? allowed : allowed.slice(0, limit);
   }
+
+  /** The entries of `find`, for whoever does not ask how they fit. */
+  search(text: string, options: PokemonSearchOptions = {}): PokemonEntry[] {
+    return this.find(text, options).map((hit) => hit.entry);
+  }
 }
```

Apply to `src/domain/pogo/wants.ts`:

```diff
--- a/src/domain/pogo/wants.ts
+++ b/src/domain/pogo/wants.ts
@@ -501,8 +501,11 @@ const SCOPE_AT_END =
   /\s*(?:\((?:raids and spawns|raids|spawns)\)|·\s*(?:raids and spawns|raids|spawns))\s*$/i;
 /** How a species the game data does not have is called in such a list: `Pokémon #1234`. */
 const NUMBERED = /^pok[eé]mon\s*#\s*([1-9]\d*)$/i;
-/** What a list adds to a species that has several forms. */
-const EVERY_FORM = /\s*\(every form\)\s*$/i;
+/**
+ * What a list adds to a species that has several forms; the words alone are read as well, like
+ * `base form` (the words of a label name what it labels).
+ */
+const EVERY_FORM = /\s*(?:\(every form\)|\bevery form)\s*$/i;
 /** How the entry that is called as its species is, is told from the species: `(base form)`. */
 const BASE_FORM = /\s*(?:\(base form\)|\bbase form)\s*$/i;
 /**
```

Apply to `src/services/pokemon-search-service.ts`:

```diff
--- a/src/services/pokemon-search-service.ts
+++ b/src/services/pokemon-search-service.ts
@@ -4,6 +4,7 @@ import { CURATED_NICKNAMES } from '../domain/pogo/nicknames.js';
 import {
   PokemonSearch,
   mergeNicknames,
+  type PokemonHit,
   type PokemonSearchOptions,
 } from '../domain/pogo/pokemon-search.js';
 import type { GameDataProvider } from './game-data-service.js';
@@ -20,6 +21,11 @@ export interface PokemonFinder {
    * without `exact`.
    */
   search(text: string, options?: PokemonSearchOptions): PokemonEntry[];
+  /**
+   * What `search` finds, each hit with how it fits (`PokemonMatch`): for a list that orders or
+   * leaves out by that (a guess is offered only where its label shows why it is there).
+   */
+  find(text: string, options?: PokemonSearchOptions): PokemonHit[];
   /**
    * The one entry this text names outright (its name, key, an id that stands for it, or a
    * nickname no other entry has); undefined when the text is anything less. Act on this; offer
@@ -52,6 +58,10 @@ export class PokemonSearchService implements PokemonFinder {
     return this.current().search(text, options);
   }
 
+  find(text: string, options?: PokemonSearchOptions): PokemonHit[] {
+    return this.current().find(text, options);
+  }
+
   exact(text: string): PokemonEntry | undefined {
     return this.current().exact(text);
   }
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/notifications/wants.test.ts src/commands/raids/raid-input.test.ts src/domain/pogo/pokemon-search.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 9082676 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/commands/notifications/want-input.ts src/commands/notifications/wants.test.ts src/commands/raids/raid-input.test.ts src/commands/raids/raid-input.ts src/domain/pogo/pokemon-search.test.ts src/domain/pogo/pokemon-search.ts src/domain/pogo/wants.ts src/services/pokemon-search-service.ts test/support/providers.ts
npm run typecheck; npx eslint src/commands/notifications/want-input.ts src/commands/notifications/wants.test.ts src/commands/raids/raid-input.test.ts src/commands/raids/raid-input.ts src/domain/pogo/pokemon-search.test.ts src/domain/pogo/pokemon-search.ts src/domain/pogo/wants.ts src/services/pokemon-search-service.ts test/support/providers.ts   # both clean; the full check runs after the last task
git add src/commands/notifications/want-input.ts src/commands/notifications/wants.test.ts src/commands/raids/raid-input.test.ts src/commands/raids/raid-input.ts src/domain/pogo/pokemon-search.test.ts src/domain/pogo/pokemon-search.ts src/domain/pogo/wants.ts src/services/pokemon-search-service.ts test/support/providers.ts
git commit -F <a file with the message below>
```

The commit message:

```
Search: legendaries before ordinary Pokémon, guesses last; the order of /want

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 3: Wild: details are required, and what never spawns is refused

**Files:**
- Modify: `src/app.ts`, `src/commands/notifications/wild.test.ts`, `src/commands/notifications/wild.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2; `src/commands/notifications/wild.ts`; `src/app.ts`.
- Produces: `/wild pokemon details [iv]` with `details` required and read without throwing when a client sends none; the refusal "**X** does not appear in the wild." for picked and typed input, megas and primals with their own sentence, a single letter refused; the autocomplete without what is refused and empty for a refused name typed in full; `wildExceptionsOf(ctx)` read once per catalogue (at start in `src/app.ts`, where an unknown entry is logged); the answer naming the channel once; the help with the limit and the exceptions.

Reference commit of the prototype for this task: `cf8e516`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/notifications/wild.test.ts`:

```diff
--- a/src/commands/notifications/wild.test.ts
+++ b/src/commands/notifications/wild.test.ts
@@ -19,7 +19,7 @@ import { DM_PRIORITY } from '../../services/dm-sender.js';
 import { SPAWN_FOOTER, SPAWN_WARNING } from '../../render/spawn.js';
 import { commands } from '../index.js';
 import { renderCommandHelp } from '../util/help-render.js';
-import { MAX_DETAILS, WILD_THROTTLE, wildCommand } from './wild.js';
+import { MAX_DETAILS, WILD_THROTTLE, wildCommand, wildExceptionsOf } from './wild.js';
 
 const SIGHTINGS = '100000000000000031';
 const PERFECT: NotificationTarget = { kind: 'iv', iv: 'perfect' };
@@ -45,7 +45,8 @@ async function setup(overrides: Parameters<typeof partyServiceWith>[1] = {}) {
         channelId: WEST_CHANNEL,
         userId: ALICE,
         displayName: 'Alice',
-        options,
+        // `details` is required: a report that does not test them says the same place.
+        options: { details: 'by the fountain', ...options },
         ...extra,
       }),
     );
@@ -96,7 +97,7 @@ describe('/wild', () => {
       ],
     });
     expect(sent(used.editReply).content).toBe(
-      `Reported: a wild Dratini in <#${WEST_CHANNEL}>. ` +
+      'Reported: a wild Dratini. ' +
         `${postLink(made.gateway.guildId, WEST_CHANNEL, report?.id ?? '')}\n` +
         'The report is removed in 30 minutes.',
     );
@@ -134,11 +135,9 @@ describe('/wild', () => {
     );
     // The private answer says the IVs again: the member sees what was reported.
     const used = await made.run({ pokemon: 'dratini', iv: 'zero' });
-    expect(sent(used.editReply).content).toMatch(
-      /^Reported: a wild Dratini with 0% IVs in <#\d+>\. https:/,
-    );
+    expect(sent(used.editReply).content).toMatch(/^Reported: a wild Dratini with 0% IVs\. https:/);
     expect(report?.message.embeds?.[0]).toMatchObject({
-      description: SPAWN_WARNING,
+      description: `by the fountain\n\n${SPAWN_WARNING}`,
       thumbnail: { url: expect.stringContaining('pm92.icon.png') as string },
     });
   });
@@ -212,6 +211,184 @@ describe('/wild', () => {
     expect(help(off)).not.toContain('/want');
     expect(help(off)).not.toContain('direct message');
     expect(help(off)).toContain('removed after 30 minutes');
+    // The limit, in both: from the throttle itself.
+    for (const of of [settings, off]) {
+      expect(help(of)).toContain('You can make 5 reports in half an hour.');
+      expect(help(of)).toContain('`details` says where it is and is needed');
+    }
+  });
+
+  it('needs the details, which come right after the Pokémon', async () => {
+    const options = (wildCommand.data.toJSON().options ?? []) as {
+      name: string;
+      required?: boolean;
+    }[];
+    expect(options.map((option) => [option.name, option.required === true])).toEqual([
+      ['pokemon', true],
+      ['details', true],
+      ['iv', false],
+    ]);
+    for (const example of wildCommand.help.examples ?? []) {
+      expect(example).toMatch(/^\/wild pokemon:\S+ details:/);
+    }
+    // Blanks alone say nothing: refused before anything is posted, and not counted.
+    const made = await setup();
+    for (let n = 0; n < 6; n++) {
+      const blank = await made.run({ pokemon: 'dratini', details: '   ' });
+      expect(sent(blank.reply)).toEqual({
+        content: 'Say in `details` where the Pokémon is: a street corner, a park, a gym.',
+        flags: MessageFlags.Ephemeral,
+      });
+    }
+    expect(made.reports()).toEqual([]);
+    await made.run({ pokemon: 'dratini', details: '  Riverside Park ' });
+    expect(made.reports()[0]?.message.embeds?.[0]?.description).toBe(
+      `Riverside Park\n\n${SPAWN_WARNING}`,
+    );
+  });
+
+  it('refuses what never appears in the wild with a sentence, picked or typed', async () => {
+    const made = await setup();
+    const refused = async (pokemon: string) => sent((await made.run({ pokemon })).reply);
+    // Picked from an old list (the key) and typed (the name) alike.
+    expect(await refused('mewtwo')).toEqual({
+      content: '**Mewtwo** does not appear in the wild.',
+      flags: MessageFlags.Ephemeral,
+    });
+    expect((await refused('Mewtwo')).content).toBe('**Mewtwo** does not appear in the wild.');
+    expect((await refused('kyurem_black')).content).toBe(
+      '**Black Kyurem** does not appear in the wild.',
+    );
+    expect((await refused('Galarian Zapdos')).content).toBe(
+      '**Galarian Zapdos** does not appear in the wild.',
+    );
+    expect((await refused('mew')).content).toBe('**Mew** does not appear in the wild.');
+    expect((await refused('kartana')).content).toBe('**Kartana** does not appear in the wild.');
+    expect((await refused('kyogre_primal')).content).toBe(
+      '**Primal Kyogre** is a primal: those are met in raids, not in the wild.',
+    );
+    expect(made.reports()).toEqual([]);
+    // None of them counted against the limit, and the lake trio does spawn.
+    for (const pokemon of ['uxie', 'Mesprit', 'azelf']) await made.run({ pokemon });
+    expect(made.reports().map((report) => report.message.content?.split(' has ')[0])).toEqual([
+      'A wild **Uxie**',
+      'A wild **Mesprit**',
+      'A wild **Azelf**',
+    ]);
+  });
+
+  it('answers a use without details with the sentence, as an old definition may send it', async () => {
+    const made = await setup();
+    const used = await made.handle(
+      fakeChatInput({
+        commandName: 'wild',
+        channelId: WEST_CHANNEL,
+        userId: ALICE,
+        options: { pokemon: 'dratini' },
+      }),
+    );
+    expect(sent(used.reply)).toEqual({
+      content: 'Say in `details` where the Pokémon is: a street corner, a park, a gym.',
+      flags: MessageFlags.Ephemeral,
+    });
+    expect(made.reports()).toEqual([]);
+  });
+
+  it('acts on no single letter that is sent without picking', async () => {
+    const made = await setup();
+    // `f` is how the search knows Unown (F); one letter is too little to act on.
+    for (const pokemon of ['f', 'F', ' a ', '?']) {
+      const used = await made.run({ pokemon });
+      expect(sent(used.reply).content, pokemon).toBe(
+        `I do not know "${pokemon.trim()}" as a Pokémon. ` +
+          'Pick one from the list that appears while you type.',
+      );
+    }
+    expect(made.reports()).toEqual([]);
+    // Picked from the list (its key), the letter is reported.
+    await made.run({ pokemon: 'unown_f' });
+    expect(made.reports()).toHaveLength(1);
+  });
+
+  it('follows the settings for what spawns although it has a class', async () => {
+    const made = await setup();
+    // A name, a text the game data does not know, and the key of a form of a species.
+    const listed = ['Articuno', 'Nobody', 'tapu_koko', 'giratina_origin'];
+    const settings = { ...made.ctx.config.settings, wildSpawnExceptions: listed };
+    // Before anything read the list, the help does not guess at names.
+    expect(renderCommandHelp(wildCommand, settings).toJSON().description).toContain(
+      'ultra beasts do not, with few exceptions. `details`',
+    );
+    const { ctx, entries } = createTestContext({
+      regions: made.regions,
+      spawns: made.spawns,
+      config: { ...made.ctx.config, settings },
+    });
+    const router = new InteractionRouter(ctx, [wildCommand], []);
+    const run = async (pokemon: string) => {
+      const interaction = fakeChatInput({
+        commandName: 'wild',
+        channelId: WEST_CHANNEL,
+        userId: ALICE,
+        options: { pokemon, details: 'by the fountain' },
+      });
+      await router.handle(interaction as never);
+      return interaction;
+    };
+    await run('articuno');
+    await run('articuno_galarian');
+    expect(made.reports()).toHaveLength(2);
+    // The lake trio is no exception here.
+    expect(sent((await run('uxie')).reply).content).toBe('**Uxie** does not appear in the wild.');
+    expect(wildExceptionsOf(ctx).names).toEqual(['Articuno', 'Tapu Koko', 'Giratina']);
+    await run('tapu_koko');
+    await run('Giratina (Origin Forme)');
+    expect(made.reports()).toHaveLength(4);
+    // What the game data does not know is said once, however often it is asked.
+    wildExceptionsOf(ctx);
+    const warned = entries.filter(
+      (entry) =>
+        entry.msg === 'the settings name a Pokémon the game data does not know; it is ignored',
+    );
+    expect(warned).toMatchObject([{ level: 40, text: 'Nobody', setting: 'wildSpawnExceptions' }]);
+    // The help names what the game data knew, by its names: not `Nobody`, and no key.
+    const help = renderCommandHelp(wildCommand, settings).toJSON().description ?? '';
+    expect(help).toContain(
+      'ultra beasts do not, except Articuno, Tapu Koko and Giratina. `details`',
+    );
+    // Another settings object with the same list reads the same.
+    const same = { ...settings, wildSpawnExceptions: [...listed] };
+    expect(renderCommandHelp(wildCommand, same).toJSON().description).toBe(help);
+    const none = renderCommandHelp(wildCommand, { ...settings, wildSpawnExceptions: [] });
+    expect(none.toJSON().description).toContain('ultra beasts do not. `details`');
+    const usual = renderCommandHelp(wildCommand, made.ctx.config.settings).toJSON().description;
+    expect(usual).toContain('ultra beasts do not, except Uxie, Mesprit and Azelf. `details`');
+  });
+
+  it('does not offer what never appears in the wild, nor suggest it', async () => {
+    const made = await setup();
+    const values = async (typed: string) =>
+      ((await made.offered(typed)) ?? []).map((choice) => choice.value);
+    expect(await values('kyurem')).toEqual([]);
+    expect(await values('mewtwo')).toEqual([]);
+    expect(await values('mew')).toEqual([]);
+    // A refused Pokémon named outright brings no near misses: not Lugia's neighbours for Lugia.
+    for (const typed of ['Lugia', 'ho-oh', 'Mega Charizard Y', 'Black Kyurem']) {
+      expect(await values(typed), typed).toEqual([]);
+    }
+    expect(await values('nihilego')).toEqual([]);
+    expect(await values('uxie')).toEqual(['uxie']);
+    // The legendaries leave their places to what can be reported.
+    expect(await values('gira')).toEqual(['girafarig']);
+    expect(await values('zap')).toEqual([]);
+    const la = await values('la');
+    expect(la).toContain('lapras');
+    expect(la).not.toContain('latias');
+    const used = await made.run({ pokemon: 'gira' });
+    expect(sent(used.reply).content).toBe(
+      'I do not know "gira" as a Pokémon. Did you mean Girafarig? ' +
+        'Pick one from the list that appears while you type.',
+    );
   });
 
   it('limits the details to 200 characters', () => {
@@ -236,7 +413,7 @@ describe('/wild', () => {
     ]);
     const mega = await made.run({ pokemon: 'charizard_mega_y' });
     expect(sent(mega.reply).content).toBe(
-      'Mega Charizard Y is a mega: those are met in raids, not in the wild.',
+      '**Mega Charizard Y** is a mega: those are met in raids, not in the wild.',
     );
     expect(made.reports()).toHaveLength(4);
   });
```

Run: `npx vitest run --project unit src/commands/notifications/wild.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,6 +1,7 @@
 import { Events } from 'discord.js';
 import type { AppContext } from './app-context.js';
 import { commands as allCommands } from './commands/index.js';
+import { wildExceptionsOf } from './commands/notifications/wild.js';
 import { components } from './components/index.js';
 import { loadConfig } from './config/index.js';
 import { dbConfigFrom } from './db/db-config.js';
@@ -350,6 +351,9 @@ export async function startApp(
     maps,
     features: requested,
   };
+  // Read once, here: a species of `wildSpawnExceptions` that the game data does not know is
+  // said in the log of the start, and the help of `/wild` names the ones it does.
+  wildExceptionsOf(ctx);
   const router = new InteractionRouter(ctx, commands, components);
   // Resolved by the client that ends up connected (the login may try several).
   let markConnected: () => void = () => undefined;
```

Apply to `src/commands/notifications/wild.ts`:

```diff
--- a/src/commands/notifications/wild.ts
+++ b/src/commands/notifications/wild.ts
@@ -5,10 +5,13 @@ import { UserError } from '../../discord/errors.js';
 import { guildIdOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
+import type { PokemonCatalogue } from '../../domain/pogo/catalogue.js';
 import type { PokemonEntry } from '../../domain/pogo/game-master.js';
+import { appearsInWild, wildExceptions, type WildExceptions } from '../../domain/pogo/wild.js';
+import { searchTokens } from '../../domain/search/text.js';
 import { postLink } from '../../render/notify-dm.js';
 import { IV_WORDS, SPAWN_MINUTES } from '../../render/spawn.js';
-import { plain, truncate } from '../../render/text.js';
+import { count, plain, truncate } from '../../render/text.js';
 import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
 
 /** Where `/wild` works, said wherever it does not. */
@@ -32,6 +35,16 @@ export const WILD_THROTTLE: Throttle = { uses: 5, perSeconds: 1800 };
 /** As much as a member may say about where it is. */
 export const MAX_DETAILS = 200;
 
+/** Said for details that are only blanks: a report that does not say where is of no use. */
+export const SAY_WHERE = 'Say in `details` where the Pokémon is: a street corner, a park, a gym.';
+
+/** The limit in words, for the help: `five reports in half an hour`. */
+function limitWords(throttle: Throttle): string {
+  const minutes = throttle.perSeconds / 60;
+  const span = minutes === 30 ? 'half an hour' : count(minutes, 'minute', 'minutes');
+  return `${count(throttle.uses, 'report', 'reports')} in ${span}`;
+}
+
 const IV_CHOICES = [
   { name: 'Perfect (100%)', value: 'perfect' },
   { name: 'Zero (0%)', value: 'zero' },
@@ -47,30 +60,105 @@ function orList(names: readonly string[]): string {
   return rest.length === 0 ? last : `${rest.join(', ')} or ${last}`;
 }
 
-/** Whether an entry can be met in the wild at all: a mega cannot. */
-const wild = (entry: PokemonEntry): boolean => entry.kind !== 'mega';
+/** The settings' list read against a catalogue, kept while both are in use. */
+const readExceptions = new WeakMap<PokemonCatalogue, WeakMap<readonly string[], WildExceptions>>();
+/** What was said to be unknown already: each text is logged once in a run. */
+const reportedUnknown = new Set<string>();
+/**
+ * The names of the exceptions as the game data has them, by the list of the settings they were
+ * read from (its texts, joined): what the help says. The help is given the settings only, so
+ * it takes the names from the last reading, which the start of the bot makes.
+ */
+const knownNames = new Map<string, readonly string[]>();
+
+const listKey = (listed: readonly string[]): string => JSON.stringify(listed);
+
+/**
+ * The species that can be reported although they have a class: the settings'
+ * `wildSpawnExceptions` read against the game data in use (`wildExceptions`). It is read when
+ * the bot starts (`src/app.ts`), which is where a text the game data does not know is logged,
+ * once, as a warning, and ignored; and again for a catalogue that was not read yet (the game
+ * data is refreshed while the bot runs).
+ */
+export function wildExceptionsOf(ctx: AppContext): WildExceptions {
+  const { catalogue } = ctx.gameData;
+  const listed = ctx.config.settings.wildSpawnExceptions;
+  let byList = readExceptions.get(catalogue);
+  if (!byList) readExceptions.set(catalogue, (byList = new WeakMap()));
+  let read = byList.get(listed);
+  if (!read) {
+    read = wildExceptions(catalogue, listed);
+    byList.set(listed, read);
+    knownNames.set(listKey(listed), read.names);
+    for (const text of read.unknown) {
+      if (reportedUnknown.has(text)) continue;
+      reportedUnknown.add(text);
+      ctx.log.warn(
+        { setting: 'wildSpawnExceptions', text },
+        'the settings name a Pokémon the game data does not know; it is ignored',
+      );
+    }
+  }
+  return read;
+}
+
+/** Whether an entry can be reported in this bot: `appearsInWild` with the settings' exceptions. */
+function wildIn(ctx: AppContext): (entry: PokemonEntry) => boolean {
+  const { species } = wildExceptionsOf(ctx);
+  return (entry) => appearsInWild(entry, species);
+}
+
+/**
+ * Why a Pokémon cannot be reported: it is never met in the wild (`appearsInWild`: a mega or a
+ * primal, and a legendary, a mythical Pokémon or an ultra beast that the settings do not
+ * except).
+ */
+function notWild(entry: PokemonEntry): string {
+  if (entry.kind !== 'mega') return `**${plain(entry.name)}** does not appear in the wild.`;
+  const what = entry.tempEvolution === 'PRIMAL' ? 'a primal' : 'a mega';
+  return `**${plain(entry.name)}** is ${what}: those are met in raids, not in the wild.`;
+}
+
+/**
+ * What the help says of the exceptions: the species the game data knew among those the
+ * settings name, by their names. Before anything read them (not in the running bot, which
+ * reads them at its start) it does not guess at names.
+ */
+function exceptionsClause(listed: readonly string[]): string {
+  const names = knownNames.get(listKey(listed));
+  if (names === undefined) return listed.length === 0 ? '' : ', with few exceptions';
+  return names.length === 0 ? '' : `, except ${andList(names.map((name) => plain(name)))}`;
+}
+
+/** "A, B and C". */
+function andList(names: readonly string[]): string {
+  const rest = [...names];
+  const last = rest.pop() ?? '';
+  return rest.length === 0 ? last : `${rest.join(', ')} and ${last}`;
+}
 
 /**
  * The Pokémon the `pokemon` option names: a choice of the list (the key of its entry), or text
- * that names one entry outright (`ctx.pokemon.exact`). Any Pokémon the game data has can be
- * reported, a form as that form; a mega is refused. Text that names nothing outright is never
- * guessed at: what it may have meant is only suggested.
+ * that names one entry outright (`ctx.pokemon.exact`). Any Pokémon that appears in the wild can
+ * be reported, a form as that form; one that does not is refused with a sentence, picked or
+ * typed. Text that names nothing outright is never guessed at: what it may have meant is only
+ * suggested. One letter is too little to act on, as for `/raid`: it names a form of Unown.
  */
 export function wildPokemon(ctx: AppContext, value: string): PokemonEntry {
   const text = value.trim();
+  const wild = wildIn(ctx);
   const picked = /^[a-z0-9_]+$/i.test(text)
     ? ctx.gameData.catalogue.byKey(text.toLowerCase())
     : undefined;
-  const entry = picked ?? ctx.pokemon.exact(text);
-  if (entry && !wild(entry)) {
-    throw new UserError(`${plain(entry.name)} is a mega: those are met in raids, not in the wild.`);
-  }
+  const tooShort = searchTokens(text).join('').length < 2;
+  const entry = picked ?? (tooShort ? undefined : ctx.pokemon.exact(text));
+  if (entry && !wild(entry)) throw new UserError(notWild(entry));
   if (entry) return entry;
-  const names = ctx.pokemon
-    .search(text, { limit: SUGGESTIONS * 4 })
-    .filter(wild)
-    .slice(0, SUGGESTIONS)
-    .map((found) => plain(found.name));
+  const names = tooShort
+    ? []
+    : ctx.pokemon
+        .search(text, { filter: wild, limit: SUGGESTIONS })
+        .map((found) => plain(found.name));
   throw new UserError(
     `I do not know "${plain(truncate(text, 80))}" as a Pokémon. ` +
       (names.length === 0 ? '' : `Did you mean ${orList(names)}? `) +
@@ -78,24 +166,35 @@ export function wildPokemon(ctx: AppContext, value: string): PokemonEntry {
   );
 }
 
-/** The choices for the `pokemon` option: what the search finds, megas left out. */
+/**
+ * The choices for the `pokemon` option: what the search finds of what appears in the wild.
+ * Nothing when the text names outright a Pokémon that does not: near misses of `Mewtwo` are
+ * not what its typist meant, and sending it says why it is refused.
+ */
 export function wildChoices(ctx: AppContext, typed: string): Choice[] {
   if (typed.trim() === '') return [];
+  const wild = wildIn(ctx);
+  const named = ctx.pokemon.exact(typed);
+  if (named && !wild(named)) return [];
   return ctx.pokemon
-    .search(typed, { limit: MAX_CHOICES * 2 })
-    .filter(wild)
-    .slice(0, MAX_CHOICES)
+    .search(typed, { filter: wild, limit: MAX_CHOICES })
     .map((entry) => ({ name: truncate(entry.name, CHOICE_NAME), value: entry.key }));
 }
 
 /**
  * What can be known before anything is posted is refused here, so that a use that came to
- * nothing does not count against the limit: the place, and the Pokémon.
+ * nothing does not count against the limit: the place, the Pokémon, and details that say
+ * nothing.
  */
 const requireSpawnReport: Guard = (interaction, ctx) => {
   if (regionChannelOf(interaction, ctx) === undefined) throw new UserError(WILD_FROM_A_REGION);
   if (interaction.isChatInputCommand()) {
     wildPokemon(ctx, interaction.options.getString('pokemon', true));
+    // Not asked for as required: a client with the definition from before the option was
+    // required may send none, and that use is answered with the sentence like any other.
+    if ((interaction.options.getString('details') ?? '').trim() === '') {
+      throw new UserError(SAY_WHERE);
+    }
   }
 };
 
@@ -104,7 +203,9 @@ const requireSpawnReport: Guard = (interaction, ctx) => {
  * Pokémon in the region the command is used in. The report is a public message in the region's
  * text channel, also when the command is used in the region's forum or a post there, which is
  * deleted after half an hour; who wants that Pokémon is told by direct message where
- * notifications are on.
+ * notifications are on. `details` is required (Matt, 2026-10-13): while it was optional, text
+ * typed after the Pokémon without selecting the option was dropped by the client, and a report
+ * said nothing of where.
  */
 export const wildCommand: SimpleCommand = {
   data: new SlashCommandBuilder()
@@ -122,6 +223,8 @@ export const wildCommand: SimpleCommand = {
       option
         .setName('details')
         .setDescription('Where it is: a street corner, a park, a gym nearby')
+        .setRequired(true)
+        .setMinLength(1)
         .setMaxLength(MAX_DETAILS),
     )
     .addStringOption((option) =>
@@ -140,11 +243,15 @@ export const wildCommand: SimpleCommand = {
       (settings.features.notifications
         ? 'Members who put that Pokémon on their list with `/want` get a direct message. '
         : '') +
-      'Any Pokémon can be reported, a form as that form (`Alolan Rattata`). `details` says ' +
-      'where it is; `iv` says that you checked it and its IVs are perfect or zero' +
+      'Any Pokémon that appears in the wild can be reported, a form as that form (`Alolan ' +
+      'Rattata`); megas, legendary and mythical Pokémon and ultra beasts do not' +
+      exceptionsClause(settings.wildSpawnExceptions) +
+      '. `details` says where it is and is needed: a report is of no use ' +
+      'without it. `iv` says that you checked it and its IVs are perfect or zero' +
       (settings.features.notifications
-        ? ', which also tells the members who asked for those.'
-        : '.'),
+        ? ', which also tells the members who asked for those. '
+        : '. ') +
+      `You can make ${limitWords(WILD_THROTTLE)}.`,
     examples: [
       '/wild pokemon:Dratini details:by the fountain on Market Street',
       '/wild pokemon:Larvitar details:Riverside Park iv:Perfect (100%)',
@@ -158,7 +265,8 @@ export const wildCommand: SimpleCommand = {
     const regionChannelId = regionChannelOf(interaction, ctx);
     if (regionChannelId === undefined) throw new UserError(WILD_FROM_A_REGION);
     const entry = wildPokemon(ctx, interaction.options.getString('pokemon', true));
-    const details = interaction.options.getString('details')?.trim() ?? '';
+    const details = (interaction.options.getString('details') ?? '').trim();
+    if (details === '') throw new UserError(SAY_WHERE);
     const picked = interaction.options.getString('iv');
     const iv = IV_CHOICES.find((choice) => choice.value === picked)?.value;
     const guildId = guildIdOf(interaction);
@@ -166,7 +274,7 @@ export const wildCommand: SimpleCommand = {
       guildId,
       regionChannelId,
       pokemon: { dex: entry.dex, key: entry.key, name: entry.name },
-      details: details === '' ? null : truncate(details, MAX_DETAILS),
+      details: truncate(details, MAX_DETAILS),
       iv,
       reporter: { id: interaction.user.id, name: memberInfo(interaction).name },
     });
@@ -178,11 +286,12 @@ export const wildCommand: SimpleCommand = {
       );
     }
     if (outcome.kind === 'closed') throw new UserError(RESTARTING);
-    // What was reported, IVs included: the member sees whether the choice was taken.
+    // What was reported, IVs included: the member sees whether the choice was taken. The
+    // channel is named by the link alone: Discord shows a message link as its channel.
     const ivs = iv === undefined ? '' : ` with ${IV_WORDS[iv]}`;
     await interaction.editReply({
       content:
-        `Reported: a wild ${plain(entry.name)}${ivs} in <#${regionChannelId}>. ` +
+        `Reported: a wild ${plain(entry.name)}${ivs}. ` +
         `${postLink(guildId, outcome.channelId, outcome.messageId)}\n` +
         `The report is removed in ${String(SPAWN_MINUTES)} minutes.`,
     });
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/notifications/wild.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff cf8e516 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/app.ts src/commands/notifications/wild.test.ts src/commands/notifications/wild.ts
npm run typecheck; npx eslint src/app.ts src/commands/notifications/wild.test.ts src/commands/notifications/wild.ts   # both clean; the full check runs after the last task
git add src/app.ts src/commands/notifications/wild.test.ts src/commands/notifications/wild.ts
git commit -F <a file with the message below>
```

The commit message:

```
Wild: details are required, and what never spawns is refused

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 4: Trains follow the maker's privacy and automatic status

**Files:**
- Modify: `src/commands/parties/meet.ts`, `src/commands/settings/settings.test.ts`, `src/commands/settings/settings.ts`, `src/commands/trains/train.test.ts`, `src/commands/trains/train.ts`, `src/domain/party/meetup.ts`, `src/domain/party/party.ts`, `src/domain/party/tick.ts`, `src/domain/party/timed.ts`, `src/domain/party/train.test.ts`, `src/domain/party/train.ts`, `src/render/notify-dm.test.ts`, `src/render/notify-dm.ts`, `src/render/train-post.test.ts`, `src/render/train-post.ts`, `src/services/notify-service.parties.test.ts`, `src/services/notify-service.ts`, `src/services/party-service.ts`

**Interfaces:**
- Consumes: `createTrain`, `TrainService`, `TimedPartyService`, `renderTrainPost`, the new-train DM, `/train`, `/settings`.
- Produces: `NewTrain.anonymous` and `autoStatus` (optional; named and interested by default), passed by `/train` from the maker's settings: None signs nobody up, Here counts as Coming; `mayArrange(party, memberId)` (`party.ts`): the maker of a train may arrange its route and times without being signed up, as far as the train does not move; the post and the DM name no anonymous maker; the sentences of `/settings` and `/train`.

Reference commit of the prototype for this task: `9895314`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/settings/settings.test.ts`:

```diff
--- a/src/commands/settings/settings.test.ts
+++ b/src/commands/settings/settings.test.ts
@@ -185,10 +185,10 @@ describe('/settings', () => {
     expect(await made.answer('show')).toContain('**Your settings**');
   });
 
-  it('sets the status of whoever reports a raid', async () => {
+  it('sets the status of whoever reports a raid or makes a train', async () => {
     const made = setup();
     expect(await made.answer('auto-status', { status: 'coming' })).toBe(
-      'When you report a raid, you are signed up for it as coming.',
+      'When you report a raid or make a train, you are signed up for it as coming.',
     );
     expect((await made.users.get(ALICE)).autoStatus).toBe(PartyStatus.Coming);
     await made.run('auto-status', { status: 'here' });
@@ -196,19 +196,19 @@ describe('/settings', () => {
     await made.run('auto-status', { status: 'interested' });
     expect((await made.users.get(ALICE)).autoStatus).toBe(PartyStatus.Interested);
     expect(await made.answer('auto-status', { status: 'none' })).toBe(
-      'When you report a raid, you are not signed up for it.',
+      'When you report a raid or make a train, you are not signed up for it.',
     );
     expect((await made.users.get(ALICE)).autoStatus).toBe(PartyStatus.NotInterested);
   });
 
-  it('sets whether a raid report names its reporter', async () => {
+  it('sets whether a raid report or a train names who made it', async () => {
     const made = setup();
     expect(await made.answer('privacy', { visibility: 'anonymous' })).toBe(
-      'The post of a raid you report does not say who reported it.',
+      'The post of a raid you report or a train you make does not say who did.',
     );
     expect((await made.users.get(ALICE)).raidPrivacy).toBe(RaidPrivacy.Anonymous);
     expect(await made.answer('privacy', { visibility: 'visible' })).toBe(
-      'The post of a raid you report names you as its reporter.',
+      'The post of a raid you report or a train you make names you.',
     );
     expect((await made.users.get(ALICE)).raidPrivacy).toBe(RaidPrivacy.Visible);
   });
@@ -244,8 +244,8 @@ describe('/settings show', () => {
         '- Pings when a train moves: **on** · `/settings mentions-train-stops`',
         '- DM when an egg gets its boss: **off** · `/settings boss-set`',
         '- DM for a new train in this server: **off** · `/settings new-train`',
-        '- Status when you report a raid: **Interested** · `/settings auto-status`',
-        '- Raid reports: **Visible** · `/settings privacy`',
+        '- Status when you report a raid or make a train: **Interested** · `/settings auto-status`',
+        '- Raid reports and trains: **Visible** · `/settings privacy`',
         '- Pokémon and raid tiers on your list in this server: **0** · `/wants`',
         '- Your gyms in this server: **0** · `/targets`',
       ].join('\n'),
@@ -295,8 +295,8 @@ describe('/settings show', () => {
       '- Pings for groups and times: **on** (quiet while all pings are off) · `/settings mentions-groups`',
     );
     expect(shown).toContain('- Pings for shouts: **off** · `/settings mentions-shouts`');
-    expect(shown).toContain('- Status when you report a raid: **None**');
-    expect(shown).toContain('- Raid reports: **Anonymous**');
+    expect(shown).toContain('- Status when you report a raid or make a train: **None**');
+    expect(shown).toContain('- Raid reports and trains: **Anonymous**');
   });
 
   it('shows the friend code and the in-game name when they are set, as plain text', () => {
@@ -333,6 +333,8 @@ describe('/settings show', () => {
       ...DEFAULT_USER_SETTINGS,
       autoStatus: PartyStatus.Complete,
     });
-    expect(lines).toContain('Status when you report a raid: **None** · `/settings auto-status`');
+    expect(lines).toContain(
+      'Status when you report a raid or make a train: **None** · `/settings auto-status`',
+    );
   });
 });
```

Apply to `src/commands/trains/train.test.ts`:

```diff
--- a/src/commands/trains/train.test.ts
+++ b/src/commands/trains/train.test.ts
@@ -150,18 +150,89 @@ describe('/train', () => {
     expect(made.trains()[0]).toMatchObject({ timed: { name: 'Round' } });
   });
 
-  it('names who made it, whatever they chose for the raids they report', async () => {
+  it('names who made it and signs them up as interested unless they set otherwise', async () => {
+    const made = await setup();
+    await made.run('Round');
+    const [party] = made.trains();
+    expect(party?.anonymous).toBe(false);
+    expect(party?.attendees[ALICE]?.status).toBe(PartyStatus.Interested);
+    const post = made.gateway.posts.get(party?.forumPostId ?? '');
+    expect(post?.message.embeds?.[0]?.description?.split('\n')[2]).toBe('Created by Alice.');
+  });
+
+  it('follows the privacy and the automatic status of who makes it, as a raid does', async () => {
     const users = new MemoryUsers(undefined, {
       autoStatus: PartyStatus.Present,
       raidPrivacy: RaidPrivacy.Anonymous,
     });
     const made = await setup({ users });
-    await made.run('Round');
+    const used = await made.run('Round');
     const [party] = made.trains();
-    expect(party?.anonymous).toBe(false);
-    expect(party?.attendees[ALICE]?.status).toBe(PartyStatus.Interested);
+    expect(party?.anonymous).toBe(true);
+    expect(party?.createdById).toBe(ALICE);
+    expect(party?.makerName).toBe('Alice');
+    // Here on a train that is at no gym yet is Coming.
+    expect(party?.attendees[ALICE]).toMatchObject({ status: PartyStatus.Coming, name: 'Alice' });
+    const post = made.gateway.posts.get(party?.forumPostId ?? '');
+    const lines = post?.message.embeds?.[0]?.description?.split('\n') ?? [];
+    expect(lines.some((line) => line.startsWith('Created by'))).toBe(false);
+    // Signed up, so in the list of trainers like anybody: only "Created by" is left out.
+    expect(JSON.stringify(post?.message.embeds?.[0]?.fields)).toContain('Alice');
+    expect(sent(used.editReply).content).toBe(
+      `Your train is made. Its post is <#${party?.forumPostId ?? ''}>. There, \`/route add\` ` +
+        'adds its stops, `/meet` sets when it starts, and `/conductor set` makes you its conductor.',
+    );
+  });
+
+  it('does not sign up a maker whose automatic status is None, and tells them', async () => {
+    const users = new MemoryUsers(undefined, {
+      autoStatus: PartyStatus.NotInterested,
+      raidPrivacy: RaidPrivacy.Anonymous,
+    });
+    const made = await setup({ users });
+    const used = await made.run('Round');
+    const [party] = made.trains();
+    expect(party?.attendees).toEqual({});
+    // Kept for the sentences that name them, though the post does not.
+    expect(party?.makerName).toBe('Alice');
     const post = made.gateway.posts.get(party?.forumPostId ?? '');
-    expect(post?.message.embeds?.[0]?.description?.split('\n')[2]).toBe(`Created by Alice.`);
+    expect(JSON.stringify(post?.message.embeds)).not.toContain('Alice');
+    expect(JSON.stringify(post?.message.embeds)).not.toContain(ALICE);
+    expect(sent(used.editReply).content).toBe(
+      `Your train is made. Its post is <#${party?.forumPostId ?? ''}>. There, \`/route add\` ` +
+        'adds its stops and `/meet` sets when it starts. You are not signed up for it, as ' +
+        'your `/settings auto-status` is None: sign up in the post to move the train or to ' +
+        'be its conductor.',
+    );
+    // And so it is: the maker lays the route and sets the start, and cannot move the train.
+    const id = party?.id ?? '';
+    const alice = { id: ALICE, name: 'Alice' };
+    expect(await made.ctx.trains.addStop(id, alice, 4)).toMatchObject({ kind: 'ok' });
+    expect(await made.ctx.trains.addStop(id, alice, 1)).toMatchObject({ kind: 'ok' });
+    expect(await made.ctx.trains.addStop(id, { id: BOB, name: 'Bob' }, 7)).toMatchObject({
+      kind: 'refused',
+      reason: 'not-attending',
+    });
+    expect(await made.timed.setStartTime(id, alice, Date.now() + 3_600_000)).toMatchObject({
+      kind: 'ok',
+    });
+    expect(await made.ctx.trains.move(id, alice, 'next', false)).toMatchObject({
+      kind: 'refused',
+      reason: 'not-attending',
+    });
+    expect(await made.ctx.trains.setConductor(id, alice)).toMatchObject({
+      kind: 'refused',
+      reason: 'not-attending',
+    });
+    expect(made.store.get(id)).toMatchObject({ train: { route: [4, 1], stop: 0 }, attendees: {} });
+    // Visible and None: named, and not in the list.
+    const named = await setup({
+      users: new MemoryUsers(undefined, { autoStatus: PartyStatus.NotInterested }),
+    });
+    await named.run('Round');
+    const shown = named.gateway.posts.get(named.trains()[0]?.forumPostId ?? '');
+    expect(shown?.message.embeds?.[0]?.description).toContain('Created by Alice.');
+    expect(named.trains()[0]?.attendees).toEqual({});
   });
 
   it('lets a member make two in a quarter of an hour, and does not count a use that made nothing', async () => {
```

Apply to `src/domain/party/train.test.ts`:

```diff
--- a/src/domain/party/train.test.ts
+++ b/src/domain/party/train.test.ts
@@ -26,6 +26,7 @@ import {
   isRaid,
   isTimed,
   isTrain,
+  mayArrange,
   MAX_ROUTE_STOPS,
   partyWord,
   remoteAllowed,
@@ -33,6 +34,7 @@ import {
   type TrainDetails,
   type TrainParty,
 } from './party.js';
+import { partyState } from './party-state.js';
 import { PartyStatus } from './status.js';
 import { OPEN_PARTY_HOURS, setStartTime } from './timed.js';
 import {
@@ -102,6 +104,83 @@ describe('createTrain', () => {
     expect(train.train.conductorId).toBeNull();
   });
 
+  it('signs up who made it as their automatic status says, or not at all', () => {
+    for (const status of [PartyStatus.Interested, PartyStatus.Coming]) {
+      expect(testTrain({ autoStatus: status }).attendees).toEqual({
+        [REPORTER]: { number: 1, status, group: 'A', remote: false },
+      });
+    }
+    // A train without a stop has no "here": Here signs the maker up as coming.
+    expect(testTrain({ autoStatus: PartyStatus.Present }).attendees).toEqual({
+      [REPORTER]: { number: 1, status: PartyStatus.Coming, group: 'A', remote: false },
+    });
+    // None is stored as not interested; anything else that is no way of coming counts the same.
+    for (const status of [PartyStatus.NotInterested, PartyStatus.Complete]) {
+      const train = testTrain({ autoStatus: status });
+      expect(train.attendees).toEqual({});
+      expect(train.createdById).toBe(REPORTER);
+      expect(train.train.conductorId).toBeNull();
+      // It is a train like any other: it survives the state document.
+      expect(partyState(train).attendees).toEqual([]);
+    }
+  });
+
+  it('lets who made it lay its route and set its start without being signed up', () => {
+    const train = testTrain({ autoStatus: PartyStatus.NotInterested });
+    expect(mayArrange(train, REPORTER)).toBe(true);
+    expect(mayArrange(train, ALICE)).toBe(false);
+    // Somebody else who is not signed up is refused as before.
+    expect(addStop(train, ALICE, 4)).toEqual({ ok: false, reason: 'not-attending' });
+    const first = addStop(train, REPORTER, 4);
+    const second = first.ok ? addStop(first.party, REPORTER, 1) : first;
+    const third = second.ok ? addStop(second.party, REPORTER, 7) : second;
+    if (!third.ok) throw new Error(third.reason);
+    expect(third.party.train.route).toEqual([4, 1, 7]);
+    const moved = moveStop(third.party, REPORTER, 3, 2);
+    if (!moved.ok) throw new Error(moved.reason);
+    expect(moved.party.train.route).toEqual([4, 7, 1]);
+    // A stop the train is not at is taken off; the one it is at would move the train.
+    const removed = removeStop(moved.party, REPORTER, 3);
+    if (!removed.ok) throw new Error(removed.reason);
+    expect(removed.party.train.route).toEqual([4, 7]);
+    expect(removeStop(moved.party, REPORTER, 1)).toEqual({ ok: false, reason: 'not-attending' });
+    expect(setStartTime(train, REPORTER, PARTY_NOW + HOUR, PARTY_NOW)).toMatchObject({ ok: true });
+    expect(setStartTime(train, ALICE, PARTY_NOW + HOUR, PARTY_NOW)).toEqual({
+      ok: false,
+      reason: 'not-attending',
+    });
+    // A first route may be loaded; one that replaces a route moves the train.
+    expect(replaceRoute(train, REPORTER, [4, 1])).toMatchObject({ ok: true, moved: false });
+    expect(replaceRoute(train, ALICE, [4, 1])).toEqual({ ok: false, reason: 'not-attending' });
+    expect(replaceRoute(removed.party, REPORTER, [1, 7])).toEqual({
+      ok: false,
+      reason: 'not-attending',
+    });
+    // Moving it and being its conductor still take a sign-up.
+    expect(mayNotMove(removed.party, REPORTER, false)).toBe('not-attending');
+    expect(moveTrain(removed.party, REPORTER, 'next', false)).toMatchObject({
+      ok: false,
+      reason: 'not-attending',
+    });
+    expect(setConductor(train, REPORTER)).toEqual({ ok: false, reason: 'not-attending' });
+    // The maker of a meetup who left it gets nothing by having made it.
+    const left = { ...testMeetup(), attendees: {} };
+    expect(mayArrange(left, REPORTER)).toBe(false);
+    expect(setStartTime(left, REPORTER, PARTY_NOW + HOUR, PARTY_NOW)).toEqual({
+      ok: false,
+      reason: 'not-attending',
+    });
+  });
+
+  it('names its maker unless they asked not to be named', () => {
+    expect(testTrain().anonymous).toBe(false);
+    expect(testTrain({ anonymous: false }).anonymous).toBe(false);
+    const hidden = testTrain({ anonymous: true });
+    expect(hidden.anonymous).toBe(true);
+    expect(hidden.createdById).toBe(REPORTER);
+    expect(partyState(hidden).anonymous).toBe(true);
+  });
+
   it('counts a train without times as going on for a day after it was made', () => {
     expect(testTrain().lastPossibleTime).toBe(PARTY_NOW + OPEN_PARTY_HOURS * HOUR);
     expect(testTrain().deletionTime).toBeNull();
```

Apply to `src/render/notify-dm.test.ts`:

```diff
--- a/src/render/notify-dm.test.ts
+++ b/src/render/notify-dm.test.ts
@@ -237,6 +237,10 @@ describe('the sentences for members of a party and for a new train', () => {
     expect(trainDmSentence({ regionChannelId: undefined, maker: { id: '1' }, link: LINK })).toBe(
       `A new train has been announced by **<@1>**: ${LINK}`,
     );
+    // A maker who chose not to be named is not named here either.
+    expect(trainDmSentence({ regionChannelId: REGION, link: LINK })).toBe(
+      `A new train has been announced in <#${REGION}>: ${LINK}`,
+    );
   });
 
   it('says the legacy sentence for a meeting time, and one of the same kind when it is cancelled', () => {
```

Apply to `src/render/train-post.test.ts`:

```diff
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -117,6 +117,24 @@ describe('renderTrainPost', () => {
     expect(post.message).toEqual({ embeds: [post.embed], components: partyControls(testTrain()) });
   });
 
+  it('names no maker of a train whose maker chose not to be named, and still its conductor', () => {
+    const hidden = testTrain({ anonymous: true });
+    expect(renderTrainPost(view(hidden)).embed.description?.split('\n')).toEqual([
+      '**Raid train**',
+      'No time has been set yet: `/meet` sets the start. Without one this post is archived ' +
+        `${stamp(PARTY_NOW + (24 * 60 + 65) * MINUTE, 'R')}.`,
+      '',
+      'No route yet: `/route add` adds a stop.',
+    ]);
+    const led = { ...hidden, train: { ...hidden.train, conductorId: REPORTER } };
+    const lines = renderTrainPost(view(led)).embed.description?.split('\n') ?? [];
+    expect(lines).toContain(`Conductor: <@${REPORTER}>.`);
+    expect(lines.some((line) => line.startsWith('Created by'))).toBe(false);
+    // A maker who is not signed up either: nobody in the list.
+    const empty = testTrain({ anonymous: true, autoStatus: PartyStatus.NotInterested });
+    expect(JSON.stringify(renderTrainPost(view(empty)).embed)).not.toContain(REPORTER);
+  });
+
   it('says its times as a meetup does, in the second line', () => {
     const train: TrainParty = {
       ...testTrain(),
```

Apply to `src/services/notify-service.parties.test.ts`:

```diff
--- a/src/services/notify-service.parties.test.ts
+++ b/src/services/notify-service.parties.test.ts
@@ -81,6 +81,25 @@ describe('NotifyService: a train is made', () => {
     });
   });
 
+  it('does not name a maker who chose not to be named, and does not tell them either', async () => {
+    const newTrains = new MemoryNewTrains();
+    for (const id of [ALICE, REPORTER]) await newTrains.set(id, '412345678901234567', true, 1);
+    const made = await createdTrain(
+      { creator: { name: 'Rhea' }, anonymous: true, autoStatus: PartyStatus.NotInterested },
+      {},
+      { newTrains },
+    );
+    await made.notify.flush();
+    expect(made.dms.recipients).toEqual([ALICE]);
+    const link = postLink(made.gateway.guildId, made.postId);
+    expect(told(made, ALICE)[0]?.[0]).toBe(
+      `A new train has been announced in <#${WEST_CHANNEL}>: ${link}`,
+    );
+    const [message] = made.dms.to(ALICE);
+    expect(JSON.stringify(message)).not.toContain('Rhea');
+    expect(JSON.stringify(message)).not.toContain(REPORTER);
+  });
+
   it('tells nobody of a meetup, and nobody of a train where notifications are off', async () => {
     const newTrains = new MemoryNewTrains();
     await newTrains.set(ALICE, '412345678901234567', true, 1);
```

Run: `npx vitest run --project unit src/commands/settings/settings.test.ts src/commands/trains/train.test.ts src/domain/party/train.test.ts src/render/notify-dm.test.ts src/render/train-post.test.ts src/services/notify-service.parties.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/commands/parties/meet.ts`:

```diff
--- a/src/commands/parties/meet.ts
+++ b/src/commands/parties/meet.ts
@@ -2,7 +2,7 @@ import { SlashCommandBuilder } from 'discord.js';
 import type { Guard, SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { partyOf, requireParty } from '../../discord/guards.js';
-import { attendeeOf, groupOf, isTimed, membersWhere, partyWord } from '../../domain/party/party.js';
+import { groupOf, isTimed, mayArrange, membersWhere, partyWord } from '../../domain/party/party.js';
 import { problemText } from '../../render/activity.js';
 import { groupWords } from '../../render/party-controls.js';
 import { timestamp } from '../../render/text.js';
@@ -29,13 +29,14 @@ const meetThrottle: NonNullable<SimpleCommand['throttle']> = (interaction, ctx)
 /**
  * For `/meet` and `/cancel-meet` in a timed party: what can be known before the start is
  * changed is refused here, so that a use that changed nothing does not count towards the three
- * a member has in three minutes: a member who is not signed up, a text that is no time, a time
+ * a member has in three minutes: a member who is not signed up (and did not make the train), a
+ * text that is no time, a time
  * the party cannot have. The handler reads the time again, and the service decides again.
  */
 const requireStartChange: Guard = (interaction, ctx) => {
   const party = partyOf(interaction, ctx);
   if (!party || !isTimed(party) || !interaction.isChatInputCommand()) return;
-  if (!attendeeOf(party, interaction.user.id)) {
+  if (!mayArrange(party, interaction.user.id)) {
     throw new UserError(problemText('not-attending', ctx.attendance.limits(), partyWord(party)));
   }
   const text = interaction.options.getString('time');
```

Apply to `src/commands/settings/settings.ts`:

```diff
--- a/src/commands/settings/settings.ts
+++ b/src/commands/settings/settings.ts
@@ -130,25 +130,25 @@ const AUTO_STATUS = [
     value: 'interested',
     name: 'Interested',
     status: PartyStatus.Interested,
-    says: 'When you report a raid, you are signed up for it as interested.',
+    says: 'When you report a raid or make a train, you are signed up for it as interested.',
   },
   {
     value: 'coming',
     name: 'Coming',
     status: PartyStatus.Coming,
-    says: 'When you report a raid, you are signed up for it as coming.',
+    says: 'When you report a raid or make a train, you are signed up for it as coming.',
   },
   {
     value: 'here',
     name: 'Here',
     status: PartyStatus.Present,
-    says: 'When you report a raid, you are signed up for it as here.',
+    says: 'When you report a raid or make a train, you are signed up for it as here.',
   },
   {
     value: 'none',
     name: 'None',
     status: PartyStatus.NotInterested,
-    says: 'When you report a raid, you are not signed up for it.',
+    says: 'When you report a raid or make a train, you are not signed up for it.',
   },
 ] as const;
 
@@ -157,13 +157,13 @@ const PRIVACY = [
     value: 'visible',
     name: 'Visible',
     privacy: RaidPrivacy.Visible,
-    says: 'The post of a raid you report names you as its reporter.',
+    says: 'The post of a raid you report or a train you make names you.',
   },
   {
     value: 'anonymous',
     name: 'Anonymous',
     privacy: RaidPrivacy.Anonymous,
-    says: 'The post of a raid you report does not say who reported it.',
+    says: 'The post of a raid you report or a train you make does not say who did.',
   },
 ] as const;
 
@@ -190,8 +190,8 @@ export function settingsLines(settings: UserSettings, newTrain?: boolean): strin
     newTrain === undefined
       ? `DM for a new train: set per server · \`/settings ${NEW_TRAIN.name}\` in a server`
       : `${NEW_TRAIN.label}: **${onOff(newTrain)}** · \`/settings ${NEW_TRAIN.name}\``,
-    `Status when you report a raid: **${autoStatusName(settings.autoStatus)}** · \`/settings auto-status\``,
-    `Raid reports: **${settings.raidPrivacy === RaidPrivacy.Anonymous ? 'Anonymous' : 'Visible'}** · \`/settings privacy\``,
+    `Status when you report a raid or make a train: **${autoStatusName(settings.autoStatus)}** · \`/settings auto-status\``,
+    `Raid reports and trains: **${settings.raidPrivacy === RaidPrivacy.Anonymous ? 'Anonymous' : 'Visible'}** · \`/settings privacy\``,
   );
   // What a member registered is their own text: shown plain, and only when there is any.
   const friendCode = settings.friendCode?.trim() ?? '';
@@ -325,18 +325,19 @@ const newTrain: SubcommandPart = {
 const autoStatus: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
     .setName('auto-status')
-    .setDescription('The status you get in a raid you report yourself')
+    .setDescription('The status you get in a raid you report or a train you make')
     .addStringOption((option) =>
       option
         .setName('status')
-        .setDescription('How you are signed up for a raid you report')
+        .setDescription('How you are signed up for a raid you report or a train you make')
         .setRequired(true)
         .addChoices(AUTO_STATUS.map(({ name, value }) => ({ name, value }))),
     ),
   help: {
     details:
-      'Whoever reports a raid with `/raid` is signed up for it at once. This sets as what: ' +
-      'interested, coming, here, or (None) not at all.',
+      'Whoever reports a raid with `/raid` or makes a train with `/train` is signed up for it ' +
+      'at once. This sets as what: interested, coming, here, or (None) not at all. Whoever ' +
+      'makes a meetup is always signed up as interested.',
     examples: ['/settings auto-status status:Coming', '/settings auto-status status:None'],
   },
   defer: 'ephemeral',
@@ -353,18 +354,19 @@ const autoStatus: SubcommandPart = {
 const privacy: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
     .setName('privacy')
-    .setDescription('Whether the post of a raid you report names you')
+    .setDescription('Whether the post of a raid you report or a train you make names you')
     .addStringOption((option) =>
       option
         .setName('visibility')
-        .setDescription('Visible names you as the reporter; Anonymous does not')
+        .setDescription('Visible names you in the post; Anonymous does not')
         .setRequired(true)
         .addChoices(PRIVACY.map(({ name, value }) => ({ name, value }))),
     ),
   help: {
     details:
-      'The post of a raid says who reported it, unless you choose Anonymous. It is about ' +
-      'raids you report from then on; a train or a meetup always names who made it.',
+      'The post of a raid says who reported it and the post of a train who made it, unless ' +
+      'you choose Anonymous. It is about raids you report and trains you make from then on; ' +
+      'a meetup always names who made it, and so does a report of a wild Pokémon.',
     examples: ['/settings privacy visibility:Anonymous', '/settings privacy visibility:Visible'],
   },
   defer: 'ephemeral',
```

Apply to `src/commands/trains/train.ts`:

```diff
--- a/src/commands/trains/train.ts
+++ b/src/commands/trains/train.ts
@@ -4,7 +4,8 @@ import { UserError } from '../../discord/errors.js';
 import { regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
-import { MAX_PARTY_NAME } from '../../domain/party/party.js';
+import { attendeeOf, MAX_PARTY_NAME } from '../../domain/party/party.js';
+import { RaidPrivacy } from '../../domain/party/status.js';
 import { problemText } from '../../render/activity.js';
 import { noForumYet, requirePlaceForNew } from '../parties/timed.js';
 
@@ -17,8 +18,9 @@ export const TRAIN_THROTTLE: Throttle = { uses: 2, perSeconds: 900 };
 /**
  * `/train` (spec 4.2): a raid train with a post of its own in the forum of the region it is
  * made in. It starts with its name and nothing else; its route, its times, its conductor and the
- * boss it is after are set in its post. Who makes it is signed up as interested, and named; they
- * are not its conductor unless they say so.
+ * boss it is after are set in its post. Who makes it is signed up as their automatic status says
+ * and named unless their privacy setting is Anonymous, as for a raid they report (Matt,
+ * 2026-10-13); they are not its conductor unless they say so.
  */
 export const train: SimpleCommand = {
   data: new SlashCommandBuilder()
@@ -35,7 +37,10 @@ export const train: SimpleCommand = {
     category: 'train',
     details:
       'For a group that goes from gym to gym. Use it in the channel of a region; the train gets ' +
-      'a post in the forum of that region, and you are marked as interested. In the post, ' +
+      'a post in the forum of that region. You are signed up for it as `/settings ' +
+      'auto-status` says (interested unless you changed it; coming for Here), and the post ' +
+      'names you unless ' +
+      'your `/settings privacy` is Anonymous. In the post, ' +
       '`/route add` adds the gyms it visits (also gyms of other regions), `/meet` sets when it ' +
       'starts and `/end` when it ends, `/boss` says which Pokémon it is after, and `/conductor ' +
       'set` makes you the one who moves it. Members sign up with the buttons, as for a raid, ' +
@@ -50,11 +55,14 @@ export const train: SimpleCommand = {
   async execute(interaction, ctx) {
     const regionChannelId = regionChannelOf(interaction, ctx);
     if (regionChannelId === undefined) throw new UserError(TRAIN_FROM_A_REGION);
+    const settings = await ctx.users.get(interaction.user.id);
     const outcome = await ctx.partyService.createTrain({
       name: interaction.options.getString('name', true),
       creatorId: interaction.user.id,
       creator: memberInfo(interaction),
       regionChannelId,
+      anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
+      autoStatus: settings.autoStatus,
     });
     // The guard has looked at all of these; what follows is for what changed in between.
     switch (outcome.kind) {
@@ -66,11 +74,18 @@ export const train: SimpleCommand = {
         throw new UserError(noForumYet(outcome.region.channelId));
       case 'created': {
         const post = outcome.party.forumPostId;
+        // Who made it may lay its route and set its times without being signed up; moving
+        // it and being its conductor take a sign-up.
+        const signedUp = attendeeOf(outcome.party, interaction.user.id) !== undefined;
         await interaction.editReply({
           content:
             `Your train is made.${post === null ? '' : ` Its post is <#${post}>.`} ` +
-            'There, `/route add` adds its stops, `/meet` sets when it starts, and `/conductor ' +
-            'set` makes you its conductor.',
+            'There, `/route add` adds its stops' +
+            (signedUp
+              ? ', `/meet` sets when it starts, and `/conductor set` makes you its conductor.'
+              : ' and `/meet` sets when it starts. You are not signed up for it, as your ' +
+                '`/settings auto-status` is None: sign up in the post to move the train or ' +
+                'to be its conductor.'),
         });
       }
     }
```

Apply to `src/domain/party/meetup.ts`:

```diff
--- a/src/domain/party/meetup.ts
+++ b/src/domain/party/meetup.ts
@@ -5,9 +5,9 @@ export type NewMeetup = NewTimedParty;
 
 /**
  * A new meetup: a name and nothing else yet, with the member who made it signed up as
- * interested (as the legacy bot did; their automatic status is for raids they report). It names
- * who made it, whatever they chose for the raids they report: they are the first trainer in its
- * list anyway. It has no times, so it counts as going on for a day (`OPEN_PARTY_HOURS`) until
+ * interested (as the legacy bot did; their automatic status is for raids they report and trains
+ * they make). It names who made it, whatever they chose for those: they are the first trainer
+ * in its list anyway. It has no times, so it counts as going on for a day (`OPEN_PARTY_HOURS`) until
  * somebody sets one. Refused with `bad-name` when the text is no name.
  */
 export function createMeetup(input: NewMeetup): Change<MeetupParty> {
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -448,6 +448,19 @@ export function attendeeOf(party: PartyCore, memberId: string): Attendee | undef
   return Object.hasOwn(party.attendees, memberId) ? party.attendees[memberId] : undefined;
 }
 
+/**
+ * Whether a member may arrange a party: lay its route and set its times. Whoever is signed
+ * up; and of a train also the member who made it, signed up or not (Matt, 2026-10-13: a maker
+ * whose automatic status is None could otherwise do nothing to their own train). Moving a
+ * train and being its conductor still take a sign-up.
+ */
+export function mayArrange(party: PartyCore & { type: string }, memberId: string): boolean {
+  return (
+    attendeeOf(party, memberId) !== undefined ||
+    (party.type === 'train' && party.createdById === memberId)
+  );
+}
+
 /**
  * A member with the display name the party has for them: that of their attendee record, and for
  * the member who made the party the one kept with it. Without a name for anybody else.
```

Apply to `src/domain/party/tick.ts`:

```diff
--- a/src/domain/party/tick.ts
+++ b/src/domain/party/tick.ts
@@ -139,6 +139,10 @@ function scheduled<P extends Party>(party: P, input: TickInput, warningMinutes:
  * the member who made the party; and only somebody who is still signed up for it (who left it
  * is not called back to it). Nothing else tells them that their party is about to go. Nobody
  * for a party with an end time, and for a raid: those are over by times that everybody saw.
+ *
+ * Also the maker of a train who chose not to be named (`anonymous`): somebody must be asked,
+ * and a ping at the end of the warning names nobody as the maker; they are in the list of
+ * trainers like anybody who is signed up.
  */
 export function warningAddressee(party: Party): string | undefined {
   if (!isTimed(party) || party.endTime !== null) return undefined;
```

Apply to `src/domain/party/timed.ts`:

```diff
--- a/src/domain/party/timed.ts
+++ b/src/domain/party/timed.ts
@@ -1,5 +1,5 @@
 import {
-  attendeeOf,
+  mayArrange,
   MAX_PARTY_NAME,
   membersWhere,
   NO_PROMPTS,
@@ -39,9 +39,8 @@ export interface NewTimedParty {
 /**
  * What every new timed party starts as, before the part of its own kind is added: a name and
  * nothing else yet, with the member who made it signed up as interested in group A (as the
- * legacy bot did; their automatic status is for raids they report). It names who made it,
- * whatever they chose for the raids they report: they are the first trainer in its list anyway.
- * It has no times: `settled` gives it its day.
+ * legacy bot did), and named. That is a meetup as it stays; a train changes both by what its
+ * maker has set (`createTrain`). It has no times: `settled` gives it its day.
  */
 export function newTimedParty(
   input: NewTimedParty,
@@ -156,9 +155,10 @@ export function setName<P extends TimedParty>(party: P, text: string): Change<P>
 
 /**
  * Sets when the party starts, for everybody, or removes the start with null. Only for an
- * attendee (as with the legacy bot). A start that does not lie before the end is refused. The
- * time is floored to the minute; the caller has checked it (`resolvePartyTime`). `others` are
- * the other attendees, to be told; none when the start did not change.
+ * attendee (as with the legacy bot), and for the maker of a train (`mayArrange`). A start that
+ * does not lie before the end is refused. The time is floored to the minute; the caller has
+ * checked it (`resolvePartyTime`). `others` are the other attendees, to be told; none when the
+ * start did not change.
  */
 export function setStartTime<P extends TimedParty>(
   party: P,
@@ -166,7 +166,7 @@ export function setStartTime<P extends TimedParty>(
   time: number | null,
   now: number,
 ): Change<P, { others: string[] }> {
-  if (!attendeeOf(party, memberId)) return refused('not-attending');
+  if (!mayArrange(party, memberId)) return refused('not-attending');
   const startTime = time === null ? null : Math.floor(time / MINUTE) * MINUTE;
   if (startTime !== null && party.endTime !== null && startTime >= party.endTime) {
     return refused('start-after-end');
```

Apply to `src/domain/party/train.ts`:

```diff
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -1,5 +1,6 @@
 import {
   attendeeOf,
+  mayArrange,
   MAX_ROUTE_STOPS,
   refused,
   sameBoss,
@@ -12,19 +13,43 @@ import {
 import { PartyStatus } from './status.js';
 import { newTimedParty, settled, tidyName, type NewTimedParty } from './timed.js';
 
-export type NewTrain = NewTimedParty;
+/**
+ * What it takes to make a train: what any timed party takes, and what its maker has set for
+ * the parties they start (Matt, 2026-10-13: a train follows privacy and auto-status as a raid
+ * they report does; a meetup does not).
+ */
+export interface NewTrain extends NewTimedParty {
+  /** The post does not say who made it (`RaidPrivacy.Anonymous`). Left out: it does. */
+  anonymous?: boolean;
+  /**
+   * The maker's automatic status (`User.status`): signed up as that when it is interested,
+   * coming or here, and not at all for anything else. Left out: interested.
+   */
+  autoStatus?: PartyStatus;
+}
 
 /**
- * A new raid train: a name and nothing else yet. It has no route, no conductor and no boss; the
- * member who made it is signed up as interested and is not its conductor (as with the legacy
- * bot). Like a meetup it has no times, so it counts as going on for a day until somebody sets
- * one. Refused with `bad-name` when the text is no name.
+ * A new raid train: a name and nothing else yet. It has no route, no conductor and no boss. The
+ * member who made it is signed up as their automatic status says, in group A (as coming when
+ * it says here: a train without a stop has no "here"), or not at all (`autoStatus`), and is
+ * never its conductor by that alone; a train whose maker asked not to
+ * be named is `anonymous`, and its post then names no maker. Like a meetup it has no times, so
+ * it counts as going on for a day until somebody sets one. Refused with `bad-name` when the
+ * text is no name.
  */
 export function createTrain(input: NewTrain): Change<TrainParty> {
   const name = tidyName(input.name);
   if (name === undefined) return refused('bad-name');
+  const asked = input.autoStatus ?? PartyStatus.Interested;
+  // A new train is at no gym, so nobody is "here" yet: Here is Coming.
+  const status = asked === PartyStatus.Present ? PartyStatus.Coming : asked;
+  const signedUp = status === PartyStatus.Interested || status === PartyStatus.Coming;
   const train: TrainParty = {
     ...newTimedParty(input, name),
+    anonymous: input.anonymous === true,
+    attendees: signedUp
+      ? { [input.createdById]: { number: 1, status, group: 'A', remote: false } }
+      : {},
     type: 'train',
     train: { route: [], stop: 0, finishedFrom: null, conductorId: null, boss: null },
   };
@@ -169,12 +194,13 @@ function edited<Extra>(
 }
 
 /**
- * Adds a gym to the end of the route. Only for a member who is signed up, and for staff
- * (`not-attending`); a gym that is on the route already is refused (`already-on-route`), and so
- * is a stop beyond what a route holds (`route-full`). A stop added to a finished route makes
- * the train go on there: that is a movement of the train (`moved`, see `edited`), after which
- * the stop it had finished from is forgotten. The first stop of a route is where the train
- * then is, and is no movement. The caller has checked that there is such a gym.
+ * Adds a gym to the end of the route. Only for a member who is signed up, for who made the
+ * train (`mayArrange`) and for staff (`not-attending`); a gym that is on the route already is
+ * refused (`already-on-route`), and so is a stop beyond what a route holds (`route-full`). A
+ * stop added to a finished route makes the train go on there: that is a movement of the train
+ * (`moved`, see `edited`), after which the stop it had finished from is forgotten. The first
+ * stop of a route is where the train then is, and is no movement. The caller has checked that
+ * there is such a gym.
  */
 export function addStop(
   party: TrainParty,
@@ -182,7 +208,7 @@ export function addStop(
   gymId: number,
   staff = false,
 ): Change<TrainParty, { number: number; moved: boolean }> {
-  if (!staff && !attendeeOf(party, memberId)) return refused('not-attending');
+  if (!staff && !mayArrange(party, memberId)) return refused('not-attending');
   const { route } = party.train;
   if (route.includes(gymId)) return refused('already-on-route');
   if (route.length >= MAX_ROUTE_STOPS) return refused('route-full');
@@ -207,7 +233,7 @@ export function removeStop(
   number: number,
   staff = false,
 ): Change<TrainParty, { gymId: number; moved: boolean }> {
-  if (!staff && !attendeeOf(party, memberId)) return refused('not-attending');
+  if (!staff && !mayArrange(party, memberId)) return refused('not-attending');
   const index = stopIndex(party, number);
   const gymId = index === undefined ? undefined : party.train.route[index];
   if (index === undefined || gymId === undefined) return refused('no-such-stop');
@@ -231,7 +257,7 @@ export function moveStop(
   to: number,
   staff = false,
 ): Change<TrainParty, { gymId: number }> {
-  if (!staff && !attendeeOf(party, memberId)) return refused('not-attending');
+  if (!staff && !mayArrange(party, memberId)) return refused('not-attending');
   const [source, target] = [stopIndex(party, from), stopIndex(party, to)];
   const gymId = source === undefined ? undefined : party.train.route[source];
   if (source === undefined || target === undefined || gymId === undefined) {
@@ -276,7 +302,9 @@ export function clearRoute(
  * that had no route). A gym that is
  * named twice counts once, and what a route does not hold is left off; a route without any gym
  * is refused (`empty-route`). The caller has left out the gyms that no longer exist. The very
- * same party comes back when the train has that route already and is at its first stop.
+ * same party comes back when the train has that route already and is at its first stop. Who
+ * made the train may give it its first route without being signed up (`mayArrange`): that
+ * moves nothing. With a route to replace they need the right to move like anybody.
  */
 export function replaceRoute(
   party: TrainParty,
@@ -285,7 +313,8 @@ export function replaceRoute(
   staff = false,
 ): Change<TrainParty, { moved: boolean }> {
   const problem = mayNotMove(party, memberId, staff);
-  if (problem) return refused(problem);
+  const firstRoute = party.train.route.length === 0 && mayArrange(party, memberId);
+  if (problem && !(problem === 'not-attending' && firstRoute)) return refused(problem);
   const route = [...new Set(gymIds)].slice(0, MAX_ROUTE_STOPS);
   if (route.length === 0) return refused('empty-route');
   const same =
@@ -293,7 +322,8 @@ export function replaceRoute(
     party.train.route.length === route.length &&
     route.every((gymId, index) => party.train.route[index] === gymId);
   if (same) return { ok: true, party, moved: false };
-  return edited(party, withTrain(party, { route, stop: 0 }), memberId, staff, {}, true);
+  // The right to move was asked for above, with the one exception it has.
+  return edited(party, withTrain(party, { route, stop: 0 }), memberId, staff, {}, !firstRoute);
 }
 
 /** The ways a train moves along its route. */
```

Apply to `src/render/notify-dm.ts`:

```diff
--- a/src/render/notify-dm.ts
+++ b/src/render/notify-dm.ts
@@ -153,12 +153,13 @@ export function bossSetSentence(view: {
 /** The first line of a direct message about a new train: the legacy bot's sentence. */
 export function trainDmSentence(view: {
   regionChannelId: string | undefined;
-  /** Who made it. */
-  maker: NamedMember;
+  /** Who made it; left out for a maker who chose not to be named. */
+  maker?: NamedMember | undefined;
   link: string;
 }): string {
   const where = view.regionChannelId === undefined ? '' : ` in <#${view.regionChannelId}>`;
-  return `A new train has been announced${where} by **${memberName(view.maker)}**: ${view.link}`;
+  const by = view.maker ? ` by **${memberName(view.maker)}**` : '';
+  return `A new train has been announced${where}${by}: ${view.link}`;
 }
 
 /** `There are currently **3** trainers attending!`, as the legacy bot ended the sentence. */
```

Apply to `src/render/train-post.ts`:

```diff
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -120,7 +120,7 @@ function whereLines(view: TrainPostView): string[] {
 /**
  * The forum post of a raid train: title, tags, the embed and the controls under it. Pure: the
  * same view gives the same post. It has what the post of a meetup has (its name, its times, who
- * made it, who comes) and what a train has: its conductor, where it is and where it goes next,
+ * made it unless they are anonymous, who comes) and what a train has: its conductor, where it is and where it goes next,
  * its route, the Pokémon it is after, what there is to say about the gym it is at, and its
  * groups, as in a raid. There is no map: `/where` gives it.
  */
@@ -133,8 +133,8 @@ export function renderTrainPost(view: TrainPostView): RenderedPost {
     `**Raid train**${after}`,
     view.closed ?? describeTimes(view),
     ...(conductorId === null ? [] : [`Conductor: ${memberName(memberOf(party, conductorId))}.`]),
-    // A train always names who made it.
-    `Created by ${memberName(memberOf(party, party.createdById))}.`,
+    // Unless they chose not to be named (`/settings privacy`), as for a raid they report.
+    ...(party.anonymous ? [] : [`Created by ${memberName(memberOf(party, party.createdById))}.`]),
     // Not in the last showing of a train that was closed: that post is archived.
     ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
     '',
```

Apply to `src/services/notify-service.ts`:

```diff
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -381,7 +381,8 @@ export class NotifyService implements PartyNotifier {
         return notifyDm(
           trainDmSentence({
             regionChannelId: region?.channelId,
-            maker: memberOf(party, party.createdById),
+            // As for a raid: an anonymous maker is not named to those who are told of it.
+            maker: party.anonymous ? undefined : memberOf(party, party.createdById),
             link: postLink(guildId, forumPostId),
           }),
           reasons.map((one) => this.shown(guildId, one)),
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -123,7 +123,14 @@ export interface TimedRequest {
 }
 
 export type MeetupRequest = TimedRequest;
-export type TrainRequest = TimedRequest;
+
+/** A train follows what its maker has set for the raids they report (`NewTrain`). */
+export interface TrainRequest extends TimedRequest {
+  /** The maker's privacy setting is Anonymous: the post names no maker. Left out: it does. */
+  anonymous?: boolean;
+  /** The maker's automatic status (`User.status`). Left out: interested. */
+  autoStatus?: PartyStatus;
+}
 
 export type TimedOutcome<P extends TimedParty> =
   /** A new party with its post. */
@@ -567,9 +574,17 @@ export class PartyService {
    * Makes a raid train with its post in the forum of the region it is made in (`/train`), as a
    * meetup is made: nothing keeps trains apart, and a train is never left active without a
    * post, nor a post without its train. Its post stays in that forum wherever its route leads.
+   * Its maker is signed up, and named, as they have set it for the raids they report.
    */
   createTrain(request: TrainRequest): Promise<TrainOutcome> {
-    return this.createTimed(request, 'train', createTrain);
+    const { anonymous, autoStatus } = request;
+    return this.createTimed(request, 'train', (input) =>
+      createTrain({
+        ...input,
+        ...(anonymous === undefined ? {} : { anonymous }),
+        ...(autoStatus === undefined ? {} : { autoStatus }),
+      }),
+    );
   }
 
   /** Makes a timed party of one kind (`make`) with its post; `word` names the kind in the log. */
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/settings/settings.test.ts src/commands/trains/train.test.ts src/domain/party/train.test.ts src/render/notify-dm.test.ts src/render/train-post.test.ts src/services/notify-service.parties.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 9895314 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/commands/parties/meet.ts src/commands/settings/settings.test.ts src/commands/settings/settings.ts src/commands/trains/train.test.ts src/commands/trains/train.ts src/domain/party/meetup.ts src/domain/party/party.ts src/domain/party/tick.ts src/domain/party/timed.ts src/domain/party/train.test.ts src/domain/party/train.ts src/render/notify-dm.test.ts src/render/notify-dm.ts src/render/train-post.test.ts src/render/train-post.ts src/services/notify-service.parties.test.ts src/services/notify-service.ts src/services/party-service.ts
npm run typecheck; npx eslint src/commands/parties/meet.ts src/commands/settings/settings.test.ts src/commands/settings/settings.ts src/commands/trains/train.test.ts src/commands/trains/train.ts src/domain/party/meetup.ts src/domain/party/party.ts src/domain/party/tick.ts src/domain/party/timed.ts src/domain/party/train.test.ts src/domain/party/train.ts src/render/notify-dm.test.ts src/render/notify-dm.ts src/render/train-post.test.ts src/render/train-post.ts src/services/notify-service.parties.test.ts src/services/notify-service.ts src/services/party-service.ts   # both clean; the full check runs after the last task
git add src/commands/parties/meet.ts src/commands/settings/settings.test.ts src/commands/settings/settings.ts src/commands/trains/train.test.ts src/commands/trains/train.ts src/domain/party/meetup.ts src/domain/party/party.ts src/domain/party/tick.ts src/domain/party/timed.ts src/domain/party/train.test.ts src/domain/party/train.ts src/render/notify-dm.test.ts src/render/notify-dm.ts src/render/train-post.test.ts src/render/train-post.ts src/services/notify-service.parties.test.ts src/services/notify-service.ts src/services/party-service.ts
git commit -F <a file with the message below>
```

The commit message:

```
Trains follow the maker's privacy and automatic status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 5: Role menus give only what they showed unticked; small wordings

**Files:**
- Modify: `src/commands/admin/self-roles.test.ts`, `src/commands/admin/self-roles.ts`, `src/commands/friends/friends.test.ts`, `src/commands/friends/friends.ts`, `src/commands/notifications/targets.test.ts`, `src/commands/notifications/targets.ts`, `src/commands/notifications/wants.test.ts`, `src/commands/notifications/wants.ts`, `src/commands/roles/menus.test.ts`, `src/commands/roles/menus.ts`, `src/db/repositories/user-repository.db.test.ts`, `src/db/repositories/user-repository.ts`, `src/domain/roles/menus.test.ts`, `src/domain/roles/menus.ts`, `src/services/game-data-service.test.ts`, `src/services/game-data-service.ts`, `test/support/users.ts`

**Interfaces:**
- Consumes: `src/domain/roles/menus.ts`, `src/commands/roles/menus.ts`, `src/commands/admin/self-roles.ts`; the wants' sentences; `/nickname find`; `/untarget`; the icon download.
- Produces: `menuRequest` giving only what was shown unticked and is now ticked, `pickedNone`; the list heading that counts what can be given; `remove` wording by `problem === 'gone'`; the shadow want's sentence; `UserSettingsStore.withNickname` answering `{ snowflake, nickname }` and `/nickname find` showing the name as registered (through `plainNoLinks`); `/untarget`'s choices naming the region; one info line when the icon list was fetched.

Reference commit of the prototype for this task: `cd4bed4`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/admin/self-roles.test.ts`:

```diff
--- a/src/commands/admin/self-roles.test.ts
+++ b/src/commands/admin/self-roles.test.ts
@@ -390,6 +390,28 @@ describe('/admin self-roles add', () => {
 });
 
 describe('/admin self-roles remove', () => {
+  it('does not speak of holders for an entry whose role no longer exists', async () => {
+    const { answer, offerSample, server, rows } = setup();
+    await offerSample();
+    server.delete(ROLE.east);
+    expect(await answer('remove', { role: 'east' })).toBe(
+      '**East** is no longer self-assignable. Its role no longer exists on this server, so ' +
+        'nothing else changes.',
+    );
+    expect((await rows()).map((row) => row.name)).not.toContain('East');
+  });
+
+  it('speaks of the role as usual for an entry that several roles of the server answer to', async () => {
+    const { answer, server, storage } = setup();
+    server.role('540000000000000001', 'Twin').role('540000000000000002', 'twin');
+    storage.legacyRow('Twin');
+    // Its roles exist, and whoever holds one keeps it: only which of them is meant is open.
+    expect(await answer('remove', { role: 'Twin' })).toBe(
+      '**Twin** is no longer self-assignable. The role itself is untouched, and whoever ' +
+        'holds it keeps it.',
+    );
+  });
+
   it('removes the entry and leaves the role and its holders alone', async () => {
     const { answer, offerSample, server, rows, gateway } = setup();
     await offerSample();
@@ -551,6 +573,12 @@ describe('/admin self-roles list', () => {
       .role('540000000000000002', 'twin');
     storage.legacyRow('Twin');
     const text = await answer('list');
+    // The heading counts what can be given, and says how many cannot: East, North, South,
+    // Trader and Twin of the eight.
+    expect(text.split('\n')[0]).toBe(
+      '**3 self-assignable roles** in 2 groups, and 5 more that cannot be given at present ' +
+        '(marked ⚠️). Members pick them with `/iam`.',
+    );
     expect(text).toContain('- **East**\n  ⚠️ Cannot be given: its Discord role no longer exists.');
     expect(text).toContain(
       '- **North** [n]: North of the river\n  ⚠️ Cannot be given: it grants Manage Messages and Kick Members.',
```

Apply to `src/commands/friends/friends.test.ts`:

```diff
--- a/src/commands/friends/friends.test.ts
+++ b/src/commands/friends/friends.test.ts
@@ -318,7 +318,29 @@ describe('/nickname find', () => {
     const made = setup();
     await made.users.update(BOB, { nickname: 'PinéTrainer' });
     expect(await made.answer('nickname', 'find', { name: ' pinetrainer ' })).toBe(
-      `**pinetrainer** is **Bob** (<@${BOB}>).`,
+      // As Bob registered it, not as it was typed.
+      `**PinéTrainer** is **Bob** (<@${BOB}>).`,
+    );
+  });
+
+  it('says the name as it was registered: one spelling once, several each with its member', async () => {
+    const made = setup();
+    await made.users.update(BOB, { nickname: 'PineTrainer' });
+    await made.users.update(CAROL, { nickname: 'PineTrainer' });
+    expect(await made.answer('nickname', 'find', { name: 'PINETRAINER' })).toBe(
+      `2 members of this server registered the in-game name **PineTrainer**: ` +
+        `**Bob** (<@${BOB}>), **Carol** (<@${CAROL}>).`,
+    );
+    // Another member's text, and legacy rows hold anything: no working link comes out of it.
+    await made.users.update(BOB, { nickname: 'see https://evil.example/x' });
+    const linked = await made.answer('nickname', 'find', { name: 'see https://evil.example/x' });
+    expect(linked).toContain('is **Bob**');
+    expect(linked).not.toContain('https://evil');
+    expect(linked).toContain('evil.');
+    await made.users.update(BOB, { nickname: 'PineTrainer' });
+    await made.users.update(CAROL, { nickname: 'pine**trainer' });
+    expect(await made.answer('nickname', 'find', { name: 'pine**trainer' })).toBe(
+      `**pine\\*\\*trainer** is **Carol** (<@${CAROL}>).`,
     );
   });
 
@@ -329,7 +351,7 @@ describe('/nickname find', () => {
     await made.users.update(CAROL, { nickname: 'PINETRAINER' });
     expect(await made.answer('nickname', 'find', { name: 'PineTrainer' })).toBe(
       `2 members of this server registered the in-game name **PineTrainer**: ` +
-        `**Bob** (<@${BOB}>), **Carol** (<@${CAROL}>).`,
+        `**Bob** (<@${BOB}>) as **pinetrainer**, **Carol** (<@${CAROL}>) as **PINETRAINER**.`,
     );
     // Dave is in no server the directory knows.
     expect(made.members.asked).toContain(`${FAKE_GUILD_ID}:${DAVE}`);
@@ -359,8 +381,8 @@ describe('/nickname find', () => {
       });
     }
     await made.users.update(BOB, { nickname: 'PineTrainer' });
-    await made.users.update(CAROL, { nickname: 'pinetrainer' });
-    expect(await made.answer('nickname', 'find', { name: 'PineTrainer' })).toBe(
+    await made.users.update(CAROL, { nickname: 'PineTrainer' });
+    expect(await made.answer('nickname', 'find', { name: 'pinetrainer' })).toBe(
       `2 members of this server registered the in-game name **PineTrainer**: ` +
         `**Bob** (<@${BOB}>), **Carol** (<@${CAROL}>).`,
     );
@@ -416,7 +438,7 @@ describe('/nickname find', () => {
     const made = setup();
     await made.users.update(BOB, { nickname: 'pine trainer' });
     expect(await made.answer('nickname', 'find', { name: 'Pine Trainer' })).toBe(
-      `**Pine Trainer** is **Bob** (<@${BOB}>).`,
+      `**pine trainer** is **Bob** (<@${BOB}>).`,
     );
   });
 
```

Apply to `src/commands/notifications/targets.test.ts`:

```diff
--- a/src/commands/notifications/targets.test.ts
+++ b/src/commands/notifications/targets.test.ts
@@ -386,14 +386,26 @@ describe('/untarget', () => {
       made.store.addRow(ALICE, FAKE_GUILD_ID, gym);
     made.store.addRow(ALICE, OTHER_GUILD, '3');
     made.store.addRow(BOB, FAKE_GUILD_ID, '4');
-    expect(await made.choices('untarget', '')).toEqual([
+    // In the channel of West: a gym of another region is named with its region, as in `/target`.
+    const inWest = { channelId: WEST_CHANNEL };
+    expect(await made.choices('untarget', '', inWest)).toEqual([
       { name: 'Old Stone Fountain', value: 'g:2' },
       { name: 'Pinewood Public Library · The Stacks', value: 'g:1' },
-      { name: 'Starbucks', value: 'g:9' },
+      { name: 'Starbucks · east', value: 'g:9' },
     ]);
-    expect(await made.choices('untarget', 'stacks')).toEqual([
+    expect(await made.choices('untarget', 'stacks', inWest)).toEqual([
       { name: 'Pinewood Public Library · The Stacks', value: 'g:1' },
     ]);
+    // The region is part of what the typed words find.
+    expect(await made.choices('untarget', 'east', inWest)).toEqual([
+      { name: 'Starbucks · east', value: 'g:9' },
+    ]);
+    // Outside every region each gym says where it lies.
+    expect(await made.choices('untarget', '')).toEqual([
+      { name: 'Old Stone Fountain · west', value: 'g:2' },
+      { name: 'Pinewood Public Library · The Stacks · west', value: 'g:1' },
+      { name: 'Starbucks · east', value: 'g:9' },
+    ]);
     // What begins with the text comes before what only holds it.
     expect((await made.choices('untarget', 'st')).map((choice) => choice.value)).toEqual([
       'g:9',
```

Apply to `src/commands/notifications/wants.test.ts`:

```diff
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -287,12 +287,12 @@ describe('/want', () => {
   it('wants the shadow raids of a Pokémon, always for raids', async () => {
     const made = setup();
     expect(await made.answer('want', { target: 'pokemon:645::shadow' })).toBe(
-      'You will get a DM when a Shadow Landorus raid is reported in a region you can see. ' +
-        'Every form of Landorus counts. `/unwant` takes it off again.',
+      'You will get a DM when a shadow raid of any form of Landorus is reported in a region ' +
+        'you can see. `/unwant` takes it off again.',
     );
     expect(await made.answer('want', { target: 'shadow giratina origin', type: 'both' })).toBe(
-      'You will get a DM when a Shadow Giratina (Origin Forme) raid is reported in a region ' +
-        'you can see. Only that form counts. Shadow raids are raids, so that is ' +
+      'You will get a DM when a shadow raid of Giratina (Origin Forme) is reported in a ' +
+        'region you can see. Only that form counts. Shadow raids are raids, so that is ' +
         'what I stored. `/unwant` takes it off again.',
     );
     expect(await made.answer('want', { target: 'Shadow Landorus', type: 'spawn' })).toBe(
```

Apply to `src/commands/roles/menus.test.ts`:

```diff
--- a/src/commands/roles/menus.test.ts
+++ b/src/commands/roles/menus.test.ts
@@ -316,6 +316,20 @@ describe('changing a menu', () => {
     expect(held()).toEqual([]);
   });
 
+  it('says the rule when an old menu of a group that became pick-one costs a role that stayed ticked', async () => {
+    const { server, storage, open, pick, held, note } = await setup();
+    // The menu of the regions lets several be ticked, and shows North ticked.
+    server.member(ALICE, ROLE.north);
+    const shown = await open();
+    await storage.saveGroup(FAKE_GUILD_ID, { name: 'Regions', pickOne: true });
+    // South is ticked beside North, which the member did not untick.
+    const { after } = await pick(shown, 0, [ROLE.north, ROLE.south]);
+    expect(note(after)).toBe(
+      'Added **South**; removed **North**. Only one role of the group Regions can be held at a time.',
+    );
+    expect(held()).toEqual(['South']);
+  });
+
   it('says once that the bot lacks Manage Roles, and changes nothing', async () => {
     const { server, open, pick, held } = await setup();
     const shown = await open();
@@ -509,6 +523,52 @@ describe('changing a menu', () => {
     expect(ticked(after)).toEqual([['North', 'South'], ['None'], []]);
   });
 
+  it('gives only what the menu showed unticked: a role given up elsewhere since stays away', async () => {
+    const { server, open, pick, held, note, ticked, gateway } = await setup();
+    // The message is made while Alice holds North and South; then she gives South up some
+    // other way, and ticks East in the old message, which still shows South ticked.
+    server.member(ALICE, ROLE.north, ROLE.south);
+    const old = await open();
+    expect(ticked(old)[0]).toEqual(['North', 'South']);
+    server.member(ALICE, ROLE.north);
+    const { after } = await pick(old, 0, [ROLE.north, ROLE.south, ROLE.east]);
+    expect(note(after)).toBe('Added **East**.');
+    expect(held()).toEqual(['East', 'North']);
+    expect(gateway.calls.map((call) => [call.action, call.roleId])).toEqual([['give', ROLE.east]]);
+    // The message is shown anew as things are.
+    expect(ticked(after)[0]).toEqual(['East', 'North']);
+  });
+
+  it('changes nothing through an old menu that is closed as it was shown', async () => {
+    const { server, open, pick, held, note, gateway } = await setup();
+    server.member(ALICE, ROLE.north, ROLE.south);
+    const old = await open();
+    // She no longer holds South, which the old message still shows ticked.
+    server.member(ALICE, ROLE.north);
+    const { after } = await pick(old, 0, [ROLE.north, ROLE.south]);
+    expect(note(after)).toBe('Nothing was changed.');
+    expect(held()).toEqual(['North']);
+    expect(gateway.calls).toEqual([]);
+  });
+
+  it('acts in a pick-one menu only on a real change of what it showed', async () => {
+    const { server, open, pick, held, note, gateway } = await setup();
+    // The message shows Valor; Alice gives it up elsewhere, and the old message sends it again.
+    server.member(ALICE, ROLE.valor);
+    const withValor = await open();
+    server.member(ALICE);
+    const again = await pick(withValor, 1, [ROLE.valor]);
+    expect(note(again.after)).toBe('Nothing was changed.');
+    expect(held()).toEqual([]);
+    // The message shows "None"; Alice takes Mystic elsewhere, and the old message sends "None".
+    const withNone = await open();
+    server.member(ALICE, ROLE.mystic);
+    const none = await pick(withNone, 1, ['none']);
+    expect(note(none.after)).toBe('Nothing was changed.');
+    expect(held()).toEqual(['Mystic']);
+    expect(gateway.calls).toEqual([]);
+  });
+
   it('says the rule of a pick-one group for a role the member did not untick in the menu', async () => {
     const { server, open, pick, held, note } = await setup();
     // The message shows no team; Alice then takes Valor with `/iam role`, and picks Mystic in it.
```

Apply to `src/db/repositories/user-repository.db.test.ts`:

```diff
--- a/src/db/repositories/user-repository.db.test.ts
+++ b/src/db/repositories/user-repository.db.test.ts
@@ -146,7 +146,9 @@ describe('UserRepository', () => {
 
   it('finds a member by game nickname, ignoring case', async () => {
     await users.update(ALICE, { nickname: 'AliceGo' });
-    expect(await users.withNickname('alicego')).toEqual([ALICE]);
+    expect(await users.withNickname('alicego')).toEqual([
+      { snowflake: ALICE, nickname: 'AliceGo' },
+    ]);
     expect(await users.withNickname('nobody')).toEqual([]);
   });
 
@@ -154,7 +156,11 @@ describe('UserRepository', () => {
     await users.update(BOB, { nickname: 'pinétrainer' });
     await users.update(ALICE, { nickname: 'PineTrainer' });
     await users.update(CAROL, { nickname: 'PineTrainer2' });
-    expect(await users.withNickname('PINETRAINER')).toEqual([BOB, ALICE]);
+    // Each with the name as they registered it.
+    expect(await users.withNickname('PINETRAINER')).toEqual([
+      { snowflake: BOB, nickname: 'pinétrainer' },
+      { snowflake: ALICE, nickname: 'PineTrainer' },
+    ]);
     // The whole name, not a part of it, and no padding.
     expect(await users.withNickname('PineTrain')).toEqual([]);
     expect(await users.withNickname('PineTrainer ')).toEqual([]);
```

Apply to `src/domain/roles/menus.test.ts`:

```diff
--- a/src/domain/roles/menus.test.ts
+++ b/src/domain/roles/menus.test.ts
@@ -3,6 +3,7 @@ import {
   groupRoleIds,
   menuPages,
   menuRequest,
+  pickedNone,
   nearestPage,
   NONE_VALUE,
   roleMenus,
@@ -270,10 +271,19 @@ describe('menuRequest', () => {
   const shown = (...values: string[]) =>
     values.map((value) => ({ value: value.replace('*', ''), ticked: value.endsWith('*') }));
 
-  it('gives what is ticked and takes away what the menu showed ticked and is ticked no longer', () => {
+  it('gives what is newly ticked and takes away what the menu showed ticked and is ticked no longer', () => {
     expect(menuRequest(shown('1*', '2', '3*'), ['2'])).toEqual({ give: ['2'], take: ['1', '3'] });
     expect(menuRequest(shown('1*', '2*', '3*'), [])).toEqual({ give: [], take: ['1', '2', '3'] });
-    expect(menuRequest(shown('1*', '2'), ['1', '2'])).toEqual({ give: ['1', '2'], take: [] });
+    expect(menuRequest(shown('1*', '2'), ['1', '2'])).toEqual({ give: ['2'], take: [] });
+  });
+
+  it('never gives a role the menu showed ticked', () => {
+    // The member gave 1 up elsewhere after the message was made, and ticks 3 in it: the
+    // client sends 1 along, because the old message still shows it ticked.
+    expect(menuRequest(shown('1*', '2', '3'), ['1', '3'])).toEqual({ give: ['3'], take: [] });
+    expect(menuRequest(shown('1*', '2*'), ['1', '2'])).toEqual({ give: [], take: [] });
+    // In a single choice: the role it showed ticked, picked again.
+    expect(menuRequest(shown(NONE_VALUE, '1*', '2'), ['1'])).toEqual({ give: [], take: [] });
   });
 
   it('never takes away a role the menu showed unticked', () => {
@@ -304,11 +314,24 @@ describe('menuRequest', () => {
     expect(menuRequest(shown(NONE_VALUE, '1*', '2'), ['999'])).toEqual({ give: [], take: [] });
     expect(menuRequest(shown(NONE_VALUE, '1*', '2'), [])).toEqual({ give: [], take: [] });
     // "None" beside a role (which Discord's single choice never sends) is still "None".
-    expect(menuRequest(shown(NONE_VALUE, '1*', '2*'), [NONE_VALUE, '2'])).toEqual({
+    expect(menuRequest(shown(NONE_VALUE, '1*', '2'), [NONE_VALUE, '2'])).toEqual({
       give: ['2'],
       take: ['1'],
     });
   });
+
+  it('reads "None" that stood ticked already as no change', () => {
+    // The member held no role of the group when the message was made.
+    expect(menuRequest(shown(`${NONE_VALUE}*`, '1', '2'), [NONE_VALUE])).toEqual({
+      give: [],
+      take: [],
+    });
+    expect(pickedNone(shown(`${NONE_VALUE}*`, '1', '2'), [NONE_VALUE])).toBe(false);
+    expect(pickedNone(shown(NONE_VALUE, '1*', '2'), [NONE_VALUE])).toBe(true);
+    expect(pickedNone(shown(NONE_VALUE, '1*', '2'), ['2'])).toBe(false);
+    // A menu that did not offer it cannot have it picked.
+    expect(pickedNone(shown('1*', '2'), [NONE_VALUE])).toBe(false);
+  });
 });
 
 describe('groupRoleIds', () => {
```

Apply to `src/services/game-data-service.test.ts`:

```diff
--- a/src/services/game-data-service.test.ts
+++ b/src/services/game-data-service.test.ts
@@ -86,10 +86,14 @@ describe('GameDataService', () => {
     const withIcons = { iconsUrl: ICONS_URL };
 
     it('is downloaded with the game data, saved with it, and read from the saved copy', async () => {
-      const { gameData } = service(withIcons);
+      const { gameData, entries } = service(withIcons);
       expect(gameData.icons).toBeUndefined();
       await gameData.load();
       expect(requests.sort()).toEqual([TEXT_URL, ICONS_URL, GAME_MASTER_URL].sort());
+      // One line says that the list was fetched, with how many icons it has.
+      expect(
+        entries.filter((entry) => entry.msg === 'the list of Pokémon icons was downloaded'),
+      ).toMatchObject([{ level: 30, icons: 3 }]);
       expect(gameData.icons?.has('pm147.icon.png')).toBe(true);
       expect(gameData.icons?.has('pm147.s.icon.png')).toBe(false);
       expect(gameData.icons?.size).toBe(3);
```

Apply to `test/support/users.ts`:

```diff
--- a/test/support/users.ts
+++ b/test/support/users.ts
@@ -1,5 +1,6 @@
 import {
   DEFAULT_USER_SETTINGS,
+  type NicknameHolder,
   type UserSettings,
   type UserSettingsPatch,
   type UserSettingsStore,
@@ -48,12 +49,17 @@ export class MemoryUsers implements UserSettingsStore {
   }
 
   /** As the column's collation compares: the whole name, without regard to case and accents. */
-  withNickname(nickname: string): Promise<string[]> {
-    const same = (stored: string | null | undefined): boolean =>
-      typeof stored === 'string' &&
-      stored.localeCompare(nickname, 'en', { sensitivity: 'base' }) === 0;
-    return Promise.resolve(
-      [...this.settings].filter(([, set]) => same(set.nickname)).map(([snowflake]) => snowflake),
-    );
+  withNickname(nickname: string): Promise<NicknameHolder[]> {
+    const holders: NicknameHolder[] = [];
+    for (const [snowflake, set] of this.settings) {
+      const stored = set.nickname;
+      if (
+        typeof stored === 'string' &&
+        stored.localeCompare(nickname, 'en', { sensitivity: 'base' }) === 0
+      ) {
+        holders.push({ snowflake, nickname: stored });
+      }
+    }
+    return Promise.resolve(holders);
   }
 }
```

Run: `npx vitest run --project unit src/commands/admin/self-roles.test.ts src/commands/friends/friends.test.ts src/commands/notifications/targets.test.ts src/commands/notifications/wants.test.ts src/commands/roles/menus.test.ts src/domain/roles/menus.test.ts src/services/game-data-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/commands/admin/self-roles.ts`:

```diff
--- a/src/commands/admin/self-roles.ts
+++ b/src/commands/admin/self-roles.ts
@@ -309,7 +309,14 @@ async function removable(
   guildId: string,
   remember: 'wait' | 'aside',
 ): Promise<
-  { row: SelfRoleRow; name: string; hasRole: boolean; problem: RoleProblem | undefined }[]
+  {
+    row: SelfRoleRow;
+    name: string;
+    hasRole: boolean;
+    /** The server's roles are known and none is this row's: its role no longer exists. */
+    roleGone: boolean;
+    problem: RoleProblem | undefined;
+  }[]
 > {
   const roster = await ctx.selfRoles.roster(guildId, remember);
   if (roster) {
@@ -317,13 +324,15 @@ async function removable(
       row: entry.row,
       name: entry.name,
       hasRole: entry.role !== undefined,
+      // Not a row that leads to no role because several are called alike: those exist.
+      roleGone: entry.problem === 'gone',
       problem: entry.role === undefined ? entry.problem : undefined,
     }));
   }
   const { rows } = await ctx.selfRoles.stored(guildId);
   return [...rows]
     .sort(byRoleName)
-    .map((row) => ({ row, name: row.name, hasRole: false, problem: undefined }));
+    .map((row) => ({ row, name: row.name, hasRole: false, roleGone: false, problem: undefined }));
 }
 
 /** What the list of `remove` says after the name of a row that leads to no role. */
@@ -368,11 +377,12 @@ const remove: SubcommandPart = {
     const typed = interaction.options.getString('role', true);
     const picked = ROW_CHOICE.exec(typed.trim());
     let rowId = picked ? Number(picked[1]) : undefined;
+    // Read before the row goes: whether it still leads to a role decides what is said.
+    const named = await removable(ctx, guildId, 'wait');
     if (rowId === undefined) {
       // Typed without picking: the name of a row as it is stored first, then as its role is
       // called now. Two rows of one name are not guessed between, and neither are two roles
       // that are called alike at present.
-      const named = await removable(ctx, guildId, 'wait');
       const alike = named.filter(({ name, hasRole }) => hasRole && sameName(name, typed));
       if (alike.length > 1) throw new UserError(calledAlike(alike));
       const stored = named.filter(({ row }) => sameName(row.name, typed));
@@ -393,10 +403,14 @@ const remove: SubcommandPart = {
           '`/admin self-roles list` shows them all.',
       );
     }
+    // A role that no longer exists has nobody holding it: nothing is said of keeping it.
+    const gone = named.find(({ row }) => row.id === removed.id)?.roleGone === true;
     await interaction.editReply({
       content:
-        `${roleText(removed.name)} is no longer self-assignable. The role itself is untouched, ` +
-        'and whoever holds it keeps it.',
+        `${roleText(removed.name)} is no longer self-assignable. ` +
+        (gone
+          ? 'Its role no longer exists on this server, so nothing else changes.'
+          : 'The role itself is untouched, and whoever holds it keeps it.'),
     });
   },
 
@@ -462,9 +476,17 @@ const list: SubcommandPart = {
       });
       return;
     }
+    // The heading counts what members can really be given. That the bot lacks Manage Roles
+    // is said once below and marks no line, so it does not count against a role here either.
+    const marked = entries.filter(
+      (entry) => entry.problem !== undefined && entry.problem !== 'no-manage-roles',
+    ).length;
     const lines = [
-      `**${count(entries.length, 'self-assignable role')}**` +
+      `**${count(entries.length - marked, 'self-assignable role')}**` +
         (groups.length === 0 ? '' : ` in ${count(groups.length, 'group')}`) +
+        (marked === 0
+          ? ''
+          : `, and ${String(marked)} more that cannot be given at present (marked ⚠️)`) +
         '. Members pick them with `/iam`.',
     ];
     if (!roster.bot.mayManageRoles) {
```

Apply to `src/commands/friends/friends.ts`:

```diff
--- a/src/commands/friends/friends.ts
+++ b/src/commands/friends/friends.ts
@@ -9,7 +9,15 @@ import { UserError } from '../../discord/errors.js';
 import { guildIdOf, requireGuild } from '../../discord/guards.js';
 import type { ServerMember } from '../../discord/member-directory.js';
 import { MEMBER_WRITE_THROTTLE, type Throttle } from '../../discord/throttle.js';
-import { count, fitItems, LIMITS, memberText, plain, truncate } from '../../render/text.js';
+import {
+  count,
+  fitItems,
+  LIMITS,
+  memberText,
+  plain,
+  plainNoLinks,
+  truncate,
+} from '../../render/text.js';
 
 const FRIEND_CODE_DIGITS = 12;
 
@@ -290,22 +298,36 @@ const findName: SubcommandPart = {
     const guildId = guildIdOf(interaction);
     const typed = interaction.options.getString('name', true).normalize('NFC').trim();
     if (typed === '') throw new UserError('Say which in-game name to look for.');
-    const shown = `**${plain(truncate(typed, 40))}**`;
+    /**
+     * A name as an answer shows it. A registered name is another member's text (legacy rows
+     * hold anything), so it carries no working link.
+     */
+    const bold = (name: string): string => `**${plainNoLinks(truncate(name, 40))}**`;
+    const shown = bold(typed);
     // Legacy rows hold any text, so the name is looked for as typed, not only when it could
     // be registered today.
     const registered = await ctx.users.withNickname(typed);
     // Each is asked for at Discord, a few at a time: only who is in this server is named. It
     // goes on until enough of them are found or the list ends, however many others (members
     // of other servers) registered the name.
-    const members: ServerMember[] = [];
+    const members: { member: ServerMember; nickname: string }[] = [];
     for (
       let start = 0;
       start < registered.length && members.length < MAX_NAMESAKES;
       start += LOOKUPS_AT_ONCE
     ) {
       const asked = registered.slice(start, start + LOOKUPS_AT_ONCE);
-      const found = await Promise.all(asked.map((id) => memberOfServer(ctx, guildId, id)));
-      members.push(...found.flatMap((member) => (member ? [member] : [])));
+      const found = await Promise.all(
+        asked.map(async ({ snowflake, nickname: name }) => ({
+          member: await memberOfServer(ctx, guildId, snowflake),
+          nickname: name,
+        })),
+      );
+      members.push(
+        ...found.flatMap(({ member, nickname: name }) =>
+          member ? [{ member, nickname: name }] : [],
+        ),
+      );
     }
     members.splice(MAX_NAMESAKES);
     if (members.length === 0) {
@@ -314,12 +336,25 @@ const findName: SubcommandPart = {
       });
       return;
     }
+    // The name is said as it was registered, not as it was typed: capital letters and accents
+    // do not matter for finding it, but they are part of the name in the game.
     const [only] = members;
-    const content =
-      only && members.length === 1
-        ? `${shown} is ${memberText(only)}.`
-        : `${count(members.length, 'member')} of this server registered the in-game name ${shown}: ` +
-          `${fitItems(members.map(memberText), LIMITS.content - 200)}.`;
+    const spellings = new Set(members.map((found) => found.nickname));
+    let content: string;
+    if (only && members.length === 1) {
+      content = `${bold(only.nickname)} is ${memberText(only.member)}.`;
+    } else {
+      // Several members under one spelling are listed under it; where they spell it
+      // differently each is listed with their own.
+      const [spelling] = spellings;
+      const same = spellings.size === 1 && spelling !== undefined;
+      const listed = members.map((found) =>
+        same ? memberText(found.member) : `${memberText(found.member)} as ${bold(found.nickname)}`,
+      );
+      content =
+        `${count(members.length, 'member')} of this server registered the in-game name ` +
+        `${same ? bold(spelling) : shown}: ${fitItems(listed, LIMITS.content - 200)}.`;
+    }
     await interaction.editReply({ content });
   },
 };
```

Apply to `src/commands/notifications/targets.ts`:

```diff
--- a/src/commands/notifications/targets.ts
+++ b/src/commands/notifications/targets.ts
@@ -230,16 +230,27 @@ function knownGyms(ctx: AppContext, gymIds: readonly number[]): Gym[] {
 
 /**
  * The choices for the `gym` option of `/untarget`: the member's own gyms, narrowed to what was
- * typed; those whose name begins with it first, then by name.
+ * typed; those whose name begins with it first, then by name. `regionOf` names the region of a
+ * gym that lies elsewhere than where the command is used, as the list of `/target` does; the
+ * typed words find a gym by its region as well.
  */
-export function ownTargetChoices(gyms: readonly Gym[], typed: string): Choice[] {
+export function ownTargetChoices(
+  gyms: readonly Gym[],
+  typed: string,
+  regionOf: (gym: Gym) => string | undefined = () => undefined,
+): Choice[] {
   const text = typed.trim().toLowerCase();
   const words = text.split(/\s+/).filter(Boolean);
   return gyms
-    .map((gym) => ({
-      gym,
-      name: [gym.name, ...(gym.nickname ? [gym.nickname] : [])].join(' · '),
-    }))
+    .map((gym) => {
+      const region = regionOf(gym);
+      return {
+        gym,
+        name: [gym.name, ...(gym.nickname ? [gym.nickname] : []), ...(region ? [region] : [])].join(
+          ' · ',
+        ),
+      };
+    })
     .filter(({ name }) => words.every((word) => name.toLowerCase().includes(word)))
     .sort(beginningFirst(text))
     .slice(0, MAX_CHOICES)
@@ -304,8 +315,19 @@ export const untarget: SimpleCommand = {
       return;
     }
     const { gymIds } = await ctx.gymTargets.list(interaction.user.id, interaction.guildId);
+    // As `/target` says it: the region of a gym that is not in the region the command is used
+    // in, by the name of its channel.
+    const here = regionChannelOf(interaction, ctx);
+    const regionOf = (gym: Gym): string | undefined => {
+      const regions = ctx.gyms.regionsOf(gym.id);
+      const [elsewhere] = regions;
+      if (elsewhere === undefined || (here !== undefined && regions.includes(here))) {
+        return undefined;
+      }
+      return interaction.guild?.channels.cache.get(elsewhere)?.name;
+    };
     await interaction.respond(
-      ownTargetChoices(knownGyms(ctx, gymIds), interaction.options.getFocused()),
+      ownTargetChoices(knownGyms(ctx, gymIds), interaction.options.getFocused(), regionOf),
     );
   },
 };
```

Apply to `src/commands/notifications/wants.ts`:

```diff
--- a/src/commands/notifications/wants.ts
+++ b/src/commands/notifications/wants.ts
@@ -4,6 +4,7 @@ import type { SimpleCommand } from '../../discord/command.js';
 import { guildIdOf, requireGuild } from '../../discord/guards.js';
 import {
   notificationTiers,
+  pokemonTarget,
   type NotificationScope,
   type NotificationTarget,
   type Want,
@@ -53,19 +54,26 @@ function promise(ctx: AppContext, want: Want): string {
     const ivs = target.iv === 'perfect' ? 'perfect' : 'zero';
     return `You will get a DM when a wild Pokémon with ${ivs} IVs is reported ${where}.`;
   }
+  // The species as it is called without `Shadow`: what "every form" is said of. A species
+  // that is one entry has no forms to speak of.
+  const species = plain(wantName(ctx, { kind: 'pokemon', dex: target.dex }));
+  const several = target.form === undefined && hasForms(ctx.gameData.catalogue, target.dex);
+  if (target.shadow) {
+    // Said in one sentence: "a Shadow Mewtwo raid … Every form of Mewtwo counts" read as if
+    // ordinary raids of its forms counted too.
+    const of = plain(wantName(ctx, pokemonTarget(target.dex, target.form)));
+    const which = several ? `any form of ${species}` : of;
+    const only = target.form === undefined ? '' : ' Only that form counts.';
+    return `You will get a DM when a shadow raid of ${which} is reported ${where}.${only}`;
+  }
   const name = plain(wantName(ctx, target));
   const what = {
     both: `${withArticle(name)} raid or a wild ${name} is`,
     raid: `${withArticle(name)} raid is`,
     spawn: `a wild ${name} is`,
   }[scope];
-  // The species as it is called without `Shadow`: what "every form" is said of. A species
-  // that is one entry has no forms to speak of.
-  const species = plain(wantName(ctx, { kind: 'pokemon', dex: target.dex }));
   let forms = ' Only that form counts.';
-  if (target.form === undefined) {
-    forms = hasForms(ctx.gameData.catalogue, target.dex) ? ` Every form of ${species} counts.` : '';
-  }
+  if (target.form === undefined) forms = several ? ` Every form of ${species} counts.` : '';
   return `You will get a DM when ${what} reported ${where}.${forms}`;
 }
 
```

Apply to `src/commands/roles/menus.ts`:

```diff
--- a/src/commands/roles/menus.ts
+++ b/src/commands/roles/menus.ts
@@ -12,7 +12,7 @@ import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
 import {
   groupRoleIds,
   menuRequest,
-  NONE_VALUE,
+  pickedNone,
   type ShownChoice,
 } from '../../domain/roles/menus.js';
 import type { ChangeRequest, RosterEntry } from '../../domain/roles/self-roles.js';
@@ -107,12 +107,13 @@ function withSentence(text: string, sentence: string): string {
  * (what was really done), a sentence for each role of the menu that was skipped, and for a
  * change Discord stopped half-way what it did not do. `shown` is the menu as it was pressed,
  * for the name of a role that is no longer on the list and for what the member unticked in it;
- * `request` is what the menu asked for.
+ * `request` is what the menu asked for, and `chosen` the values that are ticked now.
  */
 function changeNote(
   outcome: Extract<RoleChangeOutcome, { kind: 'done' | 'partial' }>,
   request: ChangeRequest,
   shown: readonly PressedChoice[],
+  chosen: readonly string[],
 ): string {
   const { plan, given, taken } = outcome;
   const names = (entries: readonly RosterEntry[]): string =>
@@ -127,10 +128,13 @@ function changeNote(
   const sentences = done === '' ? [] : [`${done.charAt(0).toUpperCase()}${done.slice(1)}.`];
   // The rule needs saying only for a role the member did not untick in this menu themself
   // (by picking another one where it stood ticked): one that another part of the group shows,
-  // or that they got elsewhere since.
+  // or that they got elsewhere since; and one that stood ticked and still does (an old menu of
+  // a group that has since become pick-one, in which another role was ticked beside it). From
+  // the values that are ticked now, not from what is to be given: a role that stays ticked is
+  // not given again.
   const unticked = new Set(
     shown.flatMap((choice) =>
-      choice.ticked && !request.give.includes(choice.value) ? [choice.value] : [],
+      choice.ticked && !chosen.includes(choice.value) ? [choice.value] : [],
     ),
   );
   const [unasked] = taken.filter(
@@ -163,7 +167,9 @@ const requireRoles: Guard = (_interaction, ctx) => {
 
 /**
  * The controls of `/iam` without a role. Changing a menu applies exactly that menu's
- * difference, read from the menu as the message shows it (`interaction.message`), so nothing
+ * difference (`menuRequest`: what it showed unticked and is now ticked is given, what it showed
+ * ticked and is now unticked is taken), read from the menu as the message shows it
+ * (`interaction.message`), so nothing
  * about an open message is kept anywhere and it still works after a restart. The message is
  * then made anew from the roster and the member's roles as they are now. Every press is
  * acknowledged first: what follows may ask Discord and the database. A change that did nothing
@@ -196,11 +202,9 @@ export const roleControls: ComponentHandler = {
       });
     let outcome: RoleChangeOutcome;
     try {
-      // "None" counts only where the menu offered it: it is no role's id, but anything may arrive.
-      const none =
-        interaction.values.includes(NONE_VALUE) &&
-        shown.some((choice) => choice.value === NONE_VALUE);
-      if (none && id.id !== OTHER_ID) {
+      // "None" counts only where the menu offered it and showed it unticked: it is no role's
+      // id, but anything may arrive, and "None" that stood ticked already changes nothing.
+      if (pickedNone(shown, interaction.values) && id.id !== OTHER_ID) {
         // "None" gives back every role of the group, also those another part of it shows.
         const roster = await ctx.selfRoles.roster(guildId);
         const group = roster?.groups.find((other) => String(other.id) === id.id);
@@ -232,7 +236,7 @@ export const roleControls: ComponentHandler = {
         outcome.roster,
         new Set(outcome.held),
         Number(id.args[1]),
-        changeNote(outcome, request, shown),
+        changeNote(outcome, request, shown, interaction.values),
       ),
     );
   },
```

Apply to `src/db/repositories/user-repository.ts`:

```diff
--- a/src/db/repositories/user-repository.ts
+++ b/src/db/repositories/user-repository.ts
@@ -77,15 +77,22 @@ export interface UserSettingsReader {
   getMany(snowflakes: readonly string[]): Promise<Map<string, UserSettings>>;
 }
 
+/** A member who registered an in-game name, with the name as they registered it. */
+export interface NicknameHolder {
+  snowflake: string;
+  nickname: string;
+}
+
 /** Members' settings as handlers use them (`ctx.users`). */
 export interface UserSettingsStore extends UserSettingsReader {
   /** Changes the given fields of a member's settings. */
   update(snowflake: string, patch: UserSettingsPatch): Promise<void>;
   /**
-   * The snowflakes of everybody who registered this in-game name, compared without regard to
-   * letter case and accents; whether they are in a given server is not known here.
+   * Everybody who registered this in-game name, compared without regard to letter case and
+   * accents, each with the name as they registered it; whether they are in a given server is
+   * not known here.
    */
-  withNickname(nickname: string): Promise<string[]>;
+  withNickname(nickname: string): Promise<NicknameHolder[]>;
 }
 
 /** As many members as one query of `getMany` names. */
@@ -185,16 +192,21 @@ export class UserRepository implements UserSettingsStore {
   }
 
   /**
-   * Everybody who registered this in-game name, oldest row first: the name is not unique. The
-   * column's collation makes the match exact but for letter case and accents.
+   * Everybody who registered this in-game name, oldest row first, each with the name as they
+   * registered it: the name is not unique, and the column's collation makes the match exact
+   * but for letter case and accents.
    */
-  async withNickname(nickname: string): Promise<string[]> {
+  async withNickname(nickname: string): Promise<NicknameHolder[]> {
     const rows = await this.db
       .selectFrom('User')
-      .select('userSnowflake')
+      .select(['userSnowflake', 'nickname'])
       .where('nickname', '=', nickname)
       .orderBy('id')
       .execute();
-    return rows.flatMap((row) => (row.userSnowflake === null ? [] : [row.userSnowflake]));
+    return rows.flatMap((row) =>
+      row.userSnowflake === null || row.nickname === null
+        ? []
+        : [{ snowflake: row.userSnowflake, nickname: row.nickname }],
+    );
   }
 }
```

Apply to `src/domain/roles/menus.ts`:

```diff
--- a/src/domain/roles/menus.ts
+++ b/src/domain/roles/menus.ts
@@ -178,19 +178,35 @@ export interface ShownChoice {
 }
 
 /**
- * What changing a menu asks for: exactly that menu's difference. `shown` are the options the
- * menu had when it was pressed, `chosen` the values that are ticked now: the ticked roles are
- * to be given, and the roles the menu showed ticked that are ticked no longer are to be taken
- * away. A role the menu showed unticked is never taken away: the member may have got it
- * elsewhere since the message was made, and did not untick it here. A value the menu did not
- * show is ignored, and "None" names no role. (`planChange` then does nothing for a role the
- * member has already, or does not have.)
+ * Whether "None" was really picked: the menu offered it, showed it unticked, and it is ticked
+ * now. "None" that stood ticked already is no change (the member held no role of the group
+ * when the message was made, and may have got one elsewhere since), and a menu that did not
+ * offer it cannot have it picked, whatever values arrive.
+ */
+export function pickedNone(shown: readonly ShownChoice[], chosen: readonly string[]): boolean {
+  return (
+    chosen.includes(NONE_VALUE) &&
+    shown.some((choice) => choice.value === NONE_VALUE && !choice.ticked)
+  );
+}
+
+/**
+ * What changing a menu asks for: exactly that menu's difference (Matt, 2026-10-13, for the
+ * giving as it was for the taking). `shown` are the options the menu had when it was pressed,
+ * `chosen` the values that are ticked now: the roles the menu showed unticked that are ticked
+ * now are to be given, and the roles it showed ticked that are ticked no longer are to be
+ * taken away. A role the menu showed unticked is never taken away (the member may have got it
+ * elsewhere since the message was made, and did not untick it here), and a role it showed
+ * ticked is never given: the member may have given it up elsewhere since, and did not tick it
+ * here. A value the menu did not show is ignored, and "None" names no role. (`planChange` then
+ * does nothing for a role the member has already, or does not have.)
  *
  * A menu that showed "None" is a single choice, and picking another role in it unticks the old
  * one whether the member means to lose it or not: such a menu asks for a take only when "None"
- * itself was chosen. A swap is left to `planChange`, which takes the old role of a pick-one
- * group away only when the new one is really given; a picked role that can no longer be given
- * (the message may be old) must not cost the member the role they had.
+ * itself was picked (`pickedNone`: a real change of what it showed). A swap is left to
+ * `planChange`, which takes the old role of a pick-one group away only when the new one is
+ * really given; a picked role that can no longer be given (the message may be old) must not
+ * cost the member the role they had.
  */
 export function menuRequest(
   shown: readonly ShownChoice[],
@@ -198,9 +214,9 @@ export function menuRequest(
 ): ChangeRequest {
   const offered = shown.filter((choice) => choice.value !== NONE_VALUE);
   const showedNone = offered.length < shown.length;
-  const give = offered.filter((choice) => chosen.includes(choice.value));
+  const give = offered.filter((choice) => !choice.ticked && chosen.includes(choice.value));
   const take =
-    showedNone && !chosen.includes(NONE_VALUE)
+    showedNone && !pickedNone(shown, chosen)
       ? []
       : offered.filter((choice) => choice.ticked && !chosen.includes(choice.value));
   return { give: give.map((choice) => choice.value), take: take.map((choice) => choice.value) };
```

Apply to `src/services/game-data-service.ts`:

```diff
--- a/src/services/game-data-service.ts
+++ b/src/services/game-data-service.ts
@@ -210,7 +210,6 @@ export class GameDataService implements GameDataProvider {
       saved.icons = icons.names();
       await this.writeCache(saved);
     }
-    this.options.log.info({ icons: icons.size }, 'the list of Pokémon icons was downloaded');
     return true;
   }
 
@@ -366,7 +365,11 @@ export class GameDataService implements GameDataProvider {
       const listing = JSON.parse(await this.download(iconsUrl)) as unknown;
       const listed = new PokemonIcons(iconNamesOf(listing));
       this.iconsFailed = false;
-      if (!isTruncatedListing(listing)) return listed;
+      if (!isTruncatedListing(listing)) {
+        // Said for every download, with the game data or alone: the pictures rest on it.
+        log.info({ icons: listed.size }, 'the list of Pokémon icons was downloaded');
+        return listed;
+      }
       const icons = this.iconList ? this.iconList.with(listed) : listed;
       log.warn(
         { listed: listed.size, icons: icons.size },
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/admin/self-roles.test.ts src/commands/friends/friends.test.ts src/commands/notifications/targets.test.ts src/commands/notifications/wants.test.ts src/commands/roles/menus.test.ts src/domain/roles/menus.test.ts src/services/game-data-service.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/repositories/user-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/repositories/user-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff cd4bed4 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/commands/admin/self-roles.test.ts src/commands/admin/self-roles.ts src/commands/friends/friends.test.ts src/commands/friends/friends.ts src/commands/notifications/targets.test.ts src/commands/notifications/targets.ts src/commands/notifications/wants.test.ts src/commands/notifications/wants.ts src/commands/roles/menus.test.ts src/commands/roles/menus.ts src/db/repositories/user-repository.db.test.ts src/db/repositories/user-repository.ts src/domain/roles/menus.test.ts src/domain/roles/menus.ts src/services/game-data-service.test.ts src/services/game-data-service.ts test/support/users.ts
npm run typecheck; npx eslint src/commands/admin/self-roles.test.ts src/commands/admin/self-roles.ts src/commands/friends/friends.test.ts src/commands/friends/friends.ts src/commands/notifications/targets.test.ts src/commands/notifications/targets.ts src/commands/notifications/wants.test.ts src/commands/notifications/wants.ts src/commands/roles/menus.test.ts src/commands/roles/menus.ts src/db/repositories/user-repository.db.test.ts src/db/repositories/user-repository.ts src/domain/roles/menus.test.ts src/domain/roles/menus.ts src/services/game-data-service.test.ts src/services/game-data-service.ts test/support/users.ts   # both clean; the full check runs after the last task
git add src/commands/admin/self-roles.test.ts src/commands/admin/self-roles.ts src/commands/friends/friends.test.ts src/commands/friends/friends.ts src/commands/notifications/targets.test.ts src/commands/notifications/targets.ts src/commands/notifications/wants.test.ts src/commands/notifications/wants.ts src/commands/roles/menus.test.ts src/commands/roles/menus.ts src/db/repositories/user-repository.db.test.ts src/db/repositories/user-repository.ts src/domain/roles/menus.test.ts src/domain/roles/menus.ts src/services/game-data-service.test.ts src/services/game-data-service.ts test/support/users.ts
git commit -F <a file with the message below>
```

The commit message:

```
Role menus give only what they showed unticked; small wordings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 6: The EX raid tier is removed

**Files:**
- Create: `src/db/migrations/2026_10_13_009_ex_wants_to_elite.db.test.ts`, `src/db/migrations/2026_10_13_009_ex_wants_to_elite.ts`
- Modify: `data/settings.json`, `src/app.ts`, `src/commands/notifications/wants.test.ts`, `src/commands/raids/change.ts`, `src/commands/raids/raid-input.test.ts`, `src/commands/raids/raid-input.ts`, `src/config/settings.test.ts`, `src/config/settings.ts`, `src/db/migrations/index.ts`, `src/db/migrator.db.test.ts`, `src/db/repositories/party-repository.db.test.ts`, `src/db/repositories/raid-boss-repository.db.test.ts`, `src/db/repositories/raid-boss-repository.ts`, `src/domain/notify/reasons.test.ts`, `src/domain/notify/reasons.ts`, `src/domain/party/party-state.test.ts`, `src/domain/party/party-state.ts`, `src/domain/party/raid.test.ts`, `src/domain/party/raid.ts`, `src/domain/party/tick.test.ts`, `src/domain/pogo/notification-target.test.ts`, `src/domain/pogo/notification-target.ts`, `src/domain/pogo/raid-boss-feed.test.ts`, `src/domain/pogo/raid-boss-feed.ts`, `src/domain/pogo/raid-bosses.test.ts`, `src/domain/pogo/raid-tier.test.ts`, `src/domain/pogo/raid-tier.ts`, `src/domain/pogo/wants.test.ts`, `src/domain/pogo/wants.ts`, `src/domain/time/party-time.test.ts`, `src/domain/time/party-time.ts`, `src/domain/time/raid-durations.test.ts`, `src/domain/time/raid-durations.ts`, `src/render/notify-dm.ts`, `src/render/party-post.ts`, `src/render/raid-post.test.ts`, `src/render/raid-post.ts`, `src/render/text.ts`, `src/services/party-mirrors.test.ts`, `src/services/party-store.test.ts`, `src/services/party-store.ts`, `src/services/raid-change-service.test.ts`, `test/fixtures/settings.json`

**Interfaces:**
- Consumes: `raid-tier.ts`, `party-time.ts`, `raid-durations.ts`, the wants codec (`notification-target.ts`), the feed's headings, the state document, `RaidBossRepository`, the settings loader, `FORUM_TAGS`.
- Produces: `RaidLevel` without `EX`, no duration kind `exclusive`; migration `2026_10_13_009_ex_wants_to_elite` (listed in the migrations index); the state document reading a stored `EX` as `Elite`; `RaidBoss` rows with an unknown level left out, overrides with one reported through a callback that `src/app.ts` logs; `withoutRetiredSettings` stripping the retired keys before the strict check; `data/settings.json` and the test fixture without them.

The database tests of this task (`2026_10_13_009_ex_wants_to_elite.db.test.ts` and the changed repository tests) need Docker. Nothing about elite raid gyms changes.

Reference commit of the prototype for this task: `7f506a6`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/notifications/wants.test.ts`:

```diff
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -472,7 +472,6 @@ describe('/want: the list of choices', () => {
       { name: 'Mega Legendary raids', value: 'tier:MegaLegendary' },
       { name: 'Super Mega raids', value: 'tier:SuperMega' },
       { name: 'Elite raids', value: 'tier:Elite' },
-      { name: 'EX raids', value: 'tier:EX' },
       { name: 'Shadow T1 raids', value: 'tier:T1:shadow' },
       { name: 'Shadow T3 raids', value: 'tier:T3:shadow' },
       { name: 'Shadow T5 raids', value: 'tier:T5:shadow' },
```

Apply to `src/commands/raids/raid-input.test.ts`:

```diff
--- a/src/commands/raids/raid-input.test.ts
+++ b/src/commands/raids/raid-input.test.ts
@@ -23,7 +23,8 @@ const T5 = { level: 'T5', shadow: false } as const;
 describe('bossChoices', () => {
   it('offers the current bosses first, then an egg for every tier', () => {
     const choices = bossChoices(ctx, '');
-    expect(choices).toHaveLength(25);
+    // Fourteen bosses, and an egg for each of the seven levels and the three shadow tiers.
+    expect(choices).toHaveLength(24);
     expect(choices[0]).toEqual({ name: 'Pikachu (T1)', value: 'b:pikachu:T1:0' });
     expect(choices[13]).toEqual({
       name: 'Mega Blastoise (Mega)',
@@ -32,6 +33,7 @@ describe('bossChoices', () => {
     expect(choices[14]).toEqual({ name: 'T1 egg', value: 'e:T1:0' });
     expect(choices[15]).toEqual({ name: 'Shadow T1 egg', value: 'e:T1:1' });
     expect(choices.map((choice) => choice.name)).toContain('Elite egg');
+    expect(choices.map((choice) => choice.name)).not.toContain('EX egg');
   });
 
   it('narrows to what was typed, by name or by tier, whatever the case', () => {
@@ -76,7 +78,12 @@ describe('reportedBoss', () => {
     });
     expect(egg('super mega egg')).toMatchObject({ tier: { level: 'SuperMega', shadow: false } });
     expect(egg('elite')).toMatchObject({ tier: { level: 'Elite', shadow: false } });
-    expect(egg('EX raid')).toMatchObject({ tier: { level: 'EX', shadow: false } });
+  });
+
+  it('knows no EX tier any more: the word names no egg', () => {
+    for (const text of ['ex', 'EX raid', 'exclusive']) {
+      expect(() => reportedBoss(ctx, text), text).toThrow(UserError);
+    }
   });
 
   it('reads a typed name of a current boss, also half typed, with its tier from the list', () => {
@@ -533,10 +540,6 @@ describe('reportedBoss against a list of bosses', () => {
     expect(() => reportedBoss(list, 't3 mewtwo')).toThrow(
       'Mewtwo is an Elite raid right now. Pick it from the list, or leave the tier out.',
     );
-    const ex = contextWith([listed('mewtwo', 'EX')]);
-    expect(() => reportedBoss(ex, 't3 mewtwo')).toThrow(
-      'Mewtwo is an EX raid right now. Pick it from the list, or leave the tier out.',
-    );
   });
 
   it('names the mega forms of a Pokémon that has several, instead of not knowing it', () => {
```

Apply to `src/config/settings.test.ts`:

```diff
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -3,7 +3,7 @@ import { tmpdir } from 'node:os';
 import path from 'node:path';
 import { describe, expect, it } from 'vitest';
 import { ConfigError } from './errors.js';
-import { loadSettings } from './settings.js';
+import { loadSettings, RETIRED_SETTINGS, withoutRetiredSettings } from './settings.js';
 
 const REPO_SETTINGS = 'data/settings.json';
 
@@ -32,6 +32,46 @@ describe('loadSettings', () => {
     expect(() => loadSettings(file)).toThrow(/commandPrefix/);
   });
 
+  it('starts with a file from before the EX tier went, whose durations it no longer reads', () => {
+    expect(RETIRED_SETTINGS).toEqual([
+      'exclusiveRaidIncubateDuration',
+      'exclusiveRaidHatchedDuration',
+    ]);
+    const current = JSON.parse(readFileSync(REPO_SETTINGS, 'utf8')) as Record<string, unknown>;
+    for (const key of RETIRED_SETTINGS) expect(current, key).not.toHaveProperty(key);
+    const old = writeSettings((s) => {
+      s.exclusiveRaidIncubateDuration = 20160;
+      s.exclusiveRaidHatchedDuration = 45;
+    });
+    const settings = loadSettings(old);
+    expect(settings).toEqual(loadSettings(REPO_SETTINGS));
+    for (const key of RETIRED_SETTINGS) expect(settings, key).not.toHaveProperty(key);
+    // Whatever they hold: they are not read, so they are not checked either.
+    const odd = writeSettings((s) => {
+      s.exclusiveRaidIncubateDuration = 'two weeks';
+    });
+    expect(loadSettings(odd)).toEqual(loadSettings(REPO_SETTINGS));
+  });
+
+  it('takes only those keys out, and only at the top of the file', () => {
+    expect(
+      withoutRetiredSettings({ exclusiveRaidHatchedDuration: 45, cleanupInterval: 1, other: 2 }),
+    ).toEqual({ cleanupInterval: 1, other: 2 });
+    for (const raw of [null, 'text', 7, [{ exclusiveRaidHatchedDuration: 45 }]]) {
+      expect(withoutRetiredSettings(raw)).toBe(raw);
+    }
+    // The same name further down is a key nobody knows: refused like any other.
+    const nested = writeSettings((s) => {
+      (s.gameData as Record<string, unknown>).exclusiveRaidHatchedDuration = 45;
+    });
+    expect(() => loadSettings(nested)).toThrow(/exclusiveRaidHatchedDuration/);
+    // And a key that only looks alike is still refused.
+    const alike = writeSettings((s) => {
+      s.exclusiveRaidDuration = 45;
+    });
+    expect(() => loadSettings(alike)).toThrow(/exclusiveRaidDuration/);
+  });
+
   it('names the species that spawn although they have a class, by default the lake trio', () => {
     expect(loadSettings(REPO_SETTINGS).wildSpawnExceptions).toEqual(['Uxie', 'Mesprit', 'Azelf']);
     // A file from before the setting starts, with the default.
```

Create `src/db/migrations/2026_10_13_009_ex_wants_to_elite.db.test.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { fixtureForms } from '../../../test/support/wants.js';
import { PokemonNotificationRepository } from '../repositories/pokemon-notification-repository.js';
import { UserRepository } from '../repositories/user-repository.js';
import type { DB } from '../types.js';
import { exWantsToElite } from './2026_10_13_009_ex_wants_to_elite.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const CAROL = '312345678901234569';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';

/** The numbers the codec stored the two tiers under. */
const EX = -21;
const ELITE = -20;

describe('migration 009: a want for EX raids becomes a want for elite raids', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let users: UserRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    users = new UserRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('PokemonNotification').execute();
    await db.deleteFrom('User').execute();
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
  });

  const row = async (member: string, guildId: number, pokemon: number, type: string) =>
    db
      .insertInto('PokemonNotification')
      .values({ userId: await users.ensure(member), guildId, pokemon, type })
      .execute();
  /** `[member, server row, pokemon, type]` of every row, in the order they were made. */
  const stored = async () => {
    const rows = await db
      .selectFrom('PokemonNotification')
      .innerJoin('User', 'User.id', 'PokemonNotification.userId')
      .select(['User.userSnowflake as member', 'guildId', 'pokemon', 'type'])
      .orderBy('PokemonNotification.id')
      .execute();
    return rows.map((found) => [found.member, found.guildId, found.pokemon, found.type]);
  };
  const migrate = () => exWantsToElite.up(db);

  it('rewrites the EX want of a member who has no elite want in that server', async () => {
    await row(ALICE, 1, EX, 'raid');
    // Another member's elite want, and her own in another server, do not count as hers here.
    await row(BOB, 1, ELITE, 'raid');
    await row(ALICE, 2, ELITE, 'raid');
    await migrate();
    expect(await stored()).toEqual([
      [ALICE, 1, ELITE, 'raid'],
      [BOB, 1, ELITE, 'raid'],
      [ALICE, 2, ELITE, 'raid'],
    ]);
  });

  it('deletes the EX want of a member who already has the elite want in that server', async () => {
    await row(ALICE, 1, ELITE, 'raid');
    await row(ALICE, 1, EX, 'raid');
    await row(ALICE, 1, 150, 'both');
    // In the other server she has only the EX want: that one is rewritten.
    await row(ALICE, 2, EX, 'raid');
    await migrate();
    expect(await stored()).toEqual([
      [ALICE, 1, ELITE, 'raid'],
      [ALICE, 1, 150, 'both'],
      [ALICE, 2, ELITE, 'raid'],
    ]);
  });

  it('reads the type as the codec does: raid or both in any case, and writes raid', async () => {
    await row(ALICE, 1, EX, 'Both');
    await row(BOB, 1, EX, 'RAID');
    await row(BOB, 1, ELITE, 'both');
    await migrate();
    expect(await stored()).toEqual([
      [ALICE, 1, ELITE, 'raid'],
      [BOB, 1, ELITE, 'both'],
    ]);
  });

  it('reads a type with blanks around it, as the codec does', async () => {
    await row(ALICE, 1, EX, ' raid ');
    await row(BOB, 1, ELITE, ' Both');
    await row(BOB, 1, EX, 'RAID  ');
    await migrate();
    expect(await stored()).toEqual([
      [ALICE, 1, ELITE, 'raid'],
      [BOB, 1, ELITE, ' Both'],
    ]);
  });

  it('makes elite rows of two EX rows of one member, which then read as one want', async () => {
    await row(ALICE, 1, EX, 'raid');
    await row(ALICE, 1, EX, 'both');
    await migrate();
    expect(await stored()).toEqual([
      [ALICE, 1, ELITE, 'raid'],
      [ALICE, 1, ELITE, 'raid'],
    ]);
    const wants = new PokemonNotificationRepository(db, fixtureForms());
    expect(await wants.list(ALICE, HOME)).toEqual({
      wants: [{ target: { kind: 'tier', tier: { level: 'Elite', shadow: false } }, scope: 'raid' }],
      unreadable: 0,
    });
    // Taking the want off takes both rows.
    expect(
      await wants.remove(ALICE, HOME, { kind: 'tier', tier: { level: 'Elite', shadow: false } }),
    ).toBe(true);
    expect(await stored()).toEqual([]);
  });

  it('leaves alone a row the codec cannot read, and does not count one as the elite want', async () => {
    // A tier typed `spawn` is unreadable: never changed, never deleted on its own.
    await row(ALICE, 1, EX, 'spawn');
    await row(BOB, 1, ELITE, 'spawn');
    await row(BOB, 1, EX, 'raid');
    await migrate();
    expect(await stored()).toEqual([
      [ALICE, 1, EX, 'spawn'],
      [BOB, 1, ELITE, 'spawn'],
      [BOB, 1, ELITE, 'raid'],
    ]);
  });

  it('touches nothing else, and does nothing the second time', async () => {
    await row(ALICE, 1, -5, 'raid');
    await row(ALICE, 1, -6, 'both');
    await row(ALICE, 1, -35, 'raid');
    await row(ALICE, 1, 21, 'spawn');
    await row(CAROL, 1, EX, 'raid');
    await migrate();
    const once = await stored();
    expect(once).toEqual([
      [ALICE, 1, -5, 'raid'],
      [ALICE, 1, -6, 'both'],
      [ALICE, 1, -35, 'raid'],
      [ALICE, 1, 21, 'spawn'],
      [CAROL, 1, ELITE, 'raid'],
    ]);
    await migrate();
    expect(await stored()).toEqual(once);
  });

  it('leaves the member with one elite want that the repository reads', async () => {
    await row(ALICE, 1, EX, 'raid');
    await row(BOB, 1, EX, 'raid');
    await row(BOB, 1, ELITE, 'raid');
    await migrate();
    const wants = new PokemonNotificationRepository(db, fixtureForms());
    for (const member of [ALICE, BOB]) {
      expect(await wants.list(member, HOME)).toEqual({
        wants: [
          { target: { kind: 'tier', tier: { level: 'Elite', shadow: false } }, scope: 'raid' },
        ],
        unreadable: 0,
      });
    }
  });

  it('is skipped and counted, never deleted, when such a row turns up afterwards', async () => {
    // Written by an older version of this bot after a rollback, once the migration has run.
    await row(ALICE, 1, EX, 'raid');
    const wants = new PokemonNotificationRepository(db, fixtureForms());
    expect(await wants.list(ALICE, HOME)).toEqual({ wants: [], unreadable: 1 });
    expect(await stored()).toEqual([[ALICE, 1, EX, 'raid']]);
  });
});
```

Apply to `src/db/migrator.db.test.ts`:

```diff
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -127,6 +127,7 @@ describe('runMigrations', () => {
       '2026_10_12_006_new_train_notifications',
       '2026_10_12_007_unown_want_gifts',
       '2026_10_13_008_self_role_groups',
+      '2026_10_13_009_ex_wants_to_elite',
     ]);
     expect(
       await describeSchema(
```

Apply to `src/db/repositories/party-repository.db.test.ts`:

```diff
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -3,6 +3,7 @@ import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
 import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
 import {
   ALICE,
+  asRaid,
   MINUTE,
   PARTY_NOW,
   testMeetup,
@@ -11,10 +12,12 @@ import {
   testTrain,
   withAttendees,
 } from '../../../test/support/parties.js';
+import { createTestLogger } from '../../../test/support/test-logger.js';
 import { endParty } from '../../domain/party/party.js';
 import type { MeetupParty, RaidParty, TrainParty } from '../../domain/party/party.js';
 import { setHatchTime } from '../../domain/party/raid.js';
 import { PartyStatus } from '../../domain/party/status.js';
+import { PartyStore } from '../../services/party-store.js';
 import type { DB } from '../types.js';
 import { PartyRepository } from './party-repository.js';
 
@@ -316,6 +319,34 @@ describe('PartyRepository', () => {
     expect(unreadable).toEqual([]);
   });
 
+  it('loads a raid stored with the EX tier beside an elite raid at the same gym: a start is not stopped', async () => {
+    const elite = { level: 'Elite', shadow: false } as const;
+    await parties.insert(testRaid({ id: ID(1), tier: elite }));
+    await parties.insert(testRaid({ id: ID(2), tier: elite, now: PARTY_NOW + MINUTE }));
+    // As a version with the EX tier stored it: two raids of different kinds could share a gym.
+    await sql`
+      update Party set state = json_set(state, '$.raid.tier.level', 'EX')
+      where id = ${ID(2)}`.execute(db);
+    const { log, entries } = createTestLogger();
+    const store = new PartyStore({ storage: parties, log, now: () => PARTY_NOW + 2 * MINUTE });
+    await store.load();
+    // Both are read, as two elite raids at one gym, and nothing is reported.
+    expect(store.active().map((party) => [party.id, asRaid(party).raid.tier])).toEqual([
+      [ID(1), elite],
+      [ID(2), elite],
+    ]);
+    expect(entries.filter((entry) => Number(entry.level) >= 40)).toEqual([]);
+    // One of them stands for the gym where a new report asks; each ends by its own clock.
+    expect(store.raidAt(1, 'elite', PARTY_NOW + 2 * MINUTE)?.id).toBe(ID(1));
+    // A change of the one that was stored with EX is written back as an elite raid.
+    const changed = await store.update(ID(2), (party) => ({ party: { ...party, saved: true } }));
+    expect(changed).toMatchObject({ written: true });
+    const levels = await sql<{ level: string }>`
+      select json_unquote(json_extract(state, '$.raid.tier.level')) as level
+      from Party order by id`.execute(db);
+    expect(levels.rows.map((found) => found.level)).toEqual(['Elite', 'Elite']);
+  });
+
   it('reports rows it cannot read and still lists the others', async () => {
     await parties.insert(testRaid({ id: ID(1) }));
     await parties.insert({ ...fullRaid(2), createdAt: PARTY_NOW + MINUTE });
```

Apply to `src/db/repositories/raid-boss-repository.db.test.ts`:

```diff
--- a/src/db/repositories/raid-boss-repository.db.test.ts
+++ b/src/db/repositories/raid-boss-repository.db.test.ts
@@ -349,5 +349,51 @@ describe('RaidBossRepository', () => {
         .execute();
       expect((await bosses.listOverrides()).map((o) => o.pokemonId)).toEqual(['MEWTWO']);
     });
+
+    it('reports an override whose tier it does not know, once, and leaves the row', async () => {
+      const reported: { id: number; level: string }[] = [];
+      const telling = new RaidBossRepository(db, (override) => reported.push(override));
+      await telling.saveOverride(override(), NOW);
+      await db
+        .insertInto('RaidBossOverride')
+        .values([
+          // The EX tier, which plan 4F removed, and a tier of some later version.
+          { pokemonId: 'MEWTWO', action: 'add', level: 'EX', createdBy: '1', createdAt: '1' },
+          { pokemonId: 'B', action: 'add', level: 'T9', createdBy: '1', createdAt: '1' },
+        ])
+        .execute();
+      expect((await telling.listOverrides()).map((o) => o.tier?.level)).toEqual(['T5']);
+      expect(reported.map((row) => row.level)).toEqual(['EX', 'T9']);
+      await telling.listOverrides();
+      expect(reported).toHaveLength(2);
+      const rows = await db.selectFrom('RaidBossOverride').select('level').orderBy('id').execute();
+      expect(rows.map((row) => row.level)).toEqual(['T5', 'EX', 'T9']);
+    });
+
+    it('does not show a stored boss of the EX tier, and the next sync retires its row', async () => {
+      await db
+        .insertInto('RaidBoss')
+        .values({
+          pokemonId: 'MEWTWO',
+          form: '',
+          level: 'EX',
+          shadow: 0,
+          shiny: 0,
+          name: 'Mewtwo',
+          active: 1,
+          firstSeen: String(NOW),
+          lastSeen: String(NOW),
+        })
+        .execute();
+      expect(await bosses.listActive()).toEqual([]);
+      await bosses.replaceFeed([boss('ZEKROM', T5)], NOW + HOUR);
+      expect((await bosses.listActive()).map((found) => found.pokemonId)).toEqual(['ZEKROM']);
+      const kept = await db
+        .selectFrom('RaidBoss')
+        .select(['level', 'active'])
+        .where('pokemonId', '=', 'MEWTWO')
+        .execute();
+      expect(kept).toEqual([{ level: 'EX', active: 0 }]);
+    });
   });
 });
```

Apply to `src/domain/notify/reasons.test.ts`:

```diff
--- a/src/domain/notify/reasons.test.ts
+++ b/src/domain/notify/reasons.test.ts
@@ -45,7 +45,7 @@ describe('raidNumbers', () => {
     expect(raidNumbers(raid('T5', 'giratina_origin'))).toEqual([487, -5]);
     expect(raidNumbers(raid('T5'))).toEqual([-5]);
     expect(raidNumbers(raid('T5', 'giratina_origin', true))).toEqual([487, -35]);
-    expect(raidNumbers(raid('EX', 'mewtwo'))).toEqual([150, -21]);
+    expect(raidNumbers(raid('Elite', 'mewtwo'))).toEqual([150, -20]);
     expect(raidNumbers(raid('MegaLegendary'))).toEqual([-6]);
   });
 
@@ -111,10 +111,12 @@ describe('raidWantsFiring', () => {
     expect(firing(wants, raid('T5', 'yveltal'))).toEqual([pokemonTarget(717), tier('T5')]);
   });
 
-  it('treats EX, elite and mega legendary raids like any other', () => {
-    expect(firing([want(tier('EX'))], raid('EX', 'mewtwo'))).toEqual([tier('EX')]);
+  it('treats elite and mega legendary raids like any other', () => {
+    expect(firing([want(tier('Elite'))], raid('Elite', 'mewtwo'))).toEqual([tier('Elite')]);
     expect(firing([want(tier('Elite'))], raid('Elite'))).toEqual([tier('Elite')]);
-    expect(firing([want(pokemonTarget(150))], raid('EX', 'mewtwo'))).toEqual([pokemonTarget(150)]);
+    expect(firing([want(pokemonTarget(150))], raid('Elite', 'mewtwo'))).toEqual([
+      pokemonTarget(150),
+    ]);
   });
 
   it('never fires an IV want, also not the one stored under the number of a tier', () => {
```

Apply to `src/domain/party/party-state.test.ts`:

```diff
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -128,6 +128,29 @@ describe('party state', () => {
     expect(back).toEqual({ ok: true, party: raid });
   });
 
+  it('reads a raid that was stored with the EX tier as an elite raid, at any version', () => {
+    const raid = fullRaid();
+    const document = stored(partyState(raid)) as { v: number; raid: { tier: object } };
+    const asEx = { ...document, raid: { ...document.raid, tier: { level: 'EX', shadow: false } } };
+    const back = partyFromStored(columnsOf(raid), asEx, stored(raid.mirrorMessages));
+    expect(back).toEqual({
+      ok: true,
+      party: { ...raid, raid: { ...raid.raid, tier: { level: 'Elite', shadow: false } } },
+    });
+    // Nothing was added to the document for it: the version is what it was.
+    expect(document.v).toBe(7);
+    // There were no shadow EX raids, and there are no shadow elite raids: still refused.
+    const shadow = { ...document, raid: { ...document.raid, tier: { level: 'EX', shadow: true } } };
+    expect(partyFromStored(columnsOf(raid), shadow, stored(raid.mirrorMessages))).toMatchObject({
+      ok: false,
+    });
+    // A level nobody knows is still a row this version cannot read.
+    const odd = { ...document, raid: { ...document.raid, tier: { level: 'T9', shadow: false } } };
+    expect(partyFromStored(columnsOf(raid), odd, stored(raid.mirrorMessages))).toMatchObject({
+      ok: false,
+    });
+  });
+
   it('stores the version, and neither the columns nor a name for a known boss', () => {
     const state = partyState(fullRaid());
     expect(state.v).toBe(7);
```

Apply to `src/domain/party/raid.test.ts`:

```diff
--- a/src/domain/party/raid.test.ts
+++ b/src/domain/party/raid.test.ts
@@ -100,11 +100,8 @@ describe('createRaid', () => {
     expect(long.lastPossibleTime).toBe(day + 120 * MINUTE);
   });
 
-  it('allows for the days an EX or elite egg takes', () => {
+  it('allows for the day an elite egg takes', () => {
     expect(testRaid({ tier: ELITE }).lastPossibleTime).toBe(PARTY_NOW + (1440 + 30) * MINUTE);
-    expect(testRaid({ tier: { level: 'EX', shadow: false } }).lastPossibleTime).toBe(
-      PARTY_NOW + (20160 + 45) * MINUTE,
-    );
   });
 });
 
@@ -144,7 +141,7 @@ describe('raid times', () => {
     expect(raidDayEnd.hatchTime).toBe(at('2026-10-31T15:30'));
   });
 
-  it('uses the durations of EX and elite raids', () => {
+  it('uses the durations of elite raids', () => {
     const elite = setHatchTime(testRaid({ tier: ELITE }), at('2026-10-14T18:00'), rules, PARTY_NOW);
     expect(elite.endTime).toBe(at('2026-10-14T18:30'));
   });
@@ -388,8 +385,9 @@ describe('setBoss', () => {
   });
 
   it('works out the last possible time again, also downwards', () => {
-    const ex = testRaid({ tier: { level: 'EX', shadow: false } });
-    const normal = setBoss(ex, { tier: T5, boss: YVELTAL }, rules, PARTY_NOW).party;
+    const elite = testRaid({ tier: ELITE });
+    expect(elite.lastPossibleTime).toBeGreaterThan(PARTY_NOW + 105 * MINUTE);
+    const normal = setBoss(elite, { tier: T5, boss: YVELTAL }, rules, PARTY_NOW).party;
     expect(normal.lastPossibleTime).toBe(PARTY_NOW + 105 * MINUTE);
   });
 
@@ -479,10 +477,9 @@ describe('raidMirrors', () => {
     expect(raidMirrors(egg, undefined, PARTY_NOW)).toEqual(['remote']);
   });
 
-  it('keeps an elite raid out of the remote channel and an EX raid out of the EX channel', () => {
+  it('keeps an elite raid out of the remote channel', () => {
     expect(raidMirrors(testRaid({ tier: ELITE }), tagged, PARTY_NOW)).toEqual(['ex']);
-    const ex = testRaid({ tier: { level: 'EX', shadow: false } });
-    expect(raidMirrors(ex, tagged, PARTY_NOW)).toEqual(['remote']);
+    expect(raidMirrors(testRaid({ tier: ELITE }), plain, PARTY_NOW)).toEqual([]);
   });
 
   it('wants none for a raid that is over by the clock, or has ended', () => {
```

Apply to `src/domain/party/tick.test.ts`:

```diff
--- a/src/domain/party/tick.test.ts
+++ b/src/domain/party/tick.test.ts
@@ -74,7 +74,7 @@ describe('tickAutoset', () => {
 
   it('gives undefined for a tier with several bosses and for one with none', () => {
     expect(autoset({ level: 'T3', shadow: false })).toBeUndefined();
-    expect(autoset({ level: 'EX', shadow: false })).toBeUndefined();
+    expect(autoset({ level: 'Elite', shadow: false })).toBeUndefined();
   });
 });
 
@@ -364,7 +364,8 @@ describe('partyTick: archiving', () => {
 
 describe('partyTick: the date', () => {
   it('shows the post anew when the day changed since the previous tick, or on the first tick', () => {
-    const ex = testRaid({ tier: { level: 'EX', shadow: false } });
+    // An elite egg is reported a day ahead: nothing is due at midnight but the date.
+    const ex = testRaid({ tier: { level: 'Elite', shadow: false } });
     const midnight = at('2026-10-14T00:00');
     const changed = tick(ex, midnight + 1000, { previous: midnight - 1000 });
     expect(changed).toEqual({ party: ex, effects: [], render: true });
```

Apply to `src/domain/pogo/notification-target.test.ts`:

```diff
--- a/src/domain/pogo/notification-target.test.ts
+++ b/src/domain/pogo/notification-target.test.ts
@@ -196,7 +196,7 @@ describe('notification codec: writing', () => {
   });
 
   it('gives the new tiers numbers outside the legacy range', () => {
-    const fresh = [tier('Elite'), tier('EX'), tier('T1', true), tier('T3', true), tier('T5', true)];
+    const fresh = [tier('Elite'), tier('T1', true), tier('T3', true), tier('T5', true)];
     for (const target of fresh) {
       expect(encodeNotification(target, 'raid').pokemon).toBeLessThan(-8);
     }
@@ -400,12 +400,20 @@ describe('tierCode and ivCode', () => {
     expect(tierCode({ level: 'T5', shadow: false })).toBe(-5);
     expect(tierCode({ level: 'T5', shadow: true })).toBe(-35);
     expect(tierCode({ level: 'MegaLegendary', shadow: false })).toBe(-6);
-    expect(tierCode({ level: 'EX', shadow: false })).toBe(-21);
+    expect(tierCode({ level: 'Elite', shadow: false })).toBe(-20);
+  });
+
+  it('no longer knows the number the EX tier had: such a row is one it cannot read', () => {
+    expect(notificationTiers().map((found) => tierCode(found))).not.toContain(-21);
+    for (const type of ['raid', 'both', 'spawn']) {
+      expect(decodeNotification({ pokemon: -21, type })).toBeUndefined();
+      expect(readNotification({ pokemon: -21, type })).toBeUndefined();
+    }
   });
 
   it('has no number, and does not throw, for a tier the codec has none for', () => {
     expect(tierCode({ level: 'Mega', shadow: true })).toBeUndefined();
-    expect(tierCode({ level: 'EX', shadow: true })).toBeUndefined();
+    expect(tierCode({ level: 'Elite', shadow: true })).toBeUndefined();
   });
 
   it('gives the numbers of the IV targets', () => {
```

Apply to `src/domain/pogo/raid-boss-feed.test.ts`:

```diff
--- a/src/domain/pogo/raid-boss-feed.test.ts
+++ b/src/domain/pogo/raid-boss-feed.test.ts
@@ -265,8 +265,6 @@ describe('parseRaidBossFeed: headings', () => {
     ['Primal Raids', 'MegaLegendary'],
     ['Super Mega Raids', 'SuperMega'],
     ['Elite Raids', 'Elite'],
-    ['EX Raids', 'EX'],
-    ['ex', 'EX'],
   ])('reads the heading %j as %s', (heading, level) => {
     const { bosses, unknownLevels } = parse([raid('Yveltal', heading, 'pm717.icon.png')]);
     expect(unknownLevels).toEqual([]);
@@ -280,7 +278,7 @@ describe('parseRaidBossFeed: headings', () => {
 
   it('only gives tiers that exist', () => {
     const { bosses } = parse(
-      ['1-Star', '3-Star', '5-Star', 'Mega', 'Mega Legendary', 'Super Mega', 'Elite', 'EX'].map(
+      ['1-Star', '3-Star', '5-Star', 'Mega', 'Mega Legendary', 'Super Mega', 'Elite'].map(
         (heading, index) => raid(`Boss ${index}`, heading),
       ),
     );
@@ -295,6 +293,10 @@ describe('parseRaidBossFeed: headings', () => {
     [''],
     ['   '],
     ['Mega Elite Raids'],
+    // The EX tier is gone (plan 4F): its heading is one Pine does not know, like any other.
+    ['EX Raids'],
+    ['ex'],
+    ['Exclusive Raids'],
   ])('leaves out the bosses of the heading %j and reports it', (heading) => {
     const result = parse([raid('Rayquaza', heading), raid('Yveltal', '5-Star Raids')]);
     expect(result.bosses.map((b) => b.pokemonId)).toEqual(['YVELTAL']);
```

Apply to `src/domain/pogo/raid-bosses.test.ts`:

```diff
--- a/src/domain/pogo/raid-bosses.test.ts
+++ b/src/domain/pogo/raid-bosses.test.ts
@@ -24,7 +24,7 @@ const T3: RaidTier = { level: 'T3', shadow: false };
 const T5: RaidTier = { level: 'T5', shadow: false };
 const SHADOW_T5: RaidTier = { level: 'T5', shadow: true };
 const MEGA: RaidTier = { level: 'Mega', shadow: false };
-const EX: RaidTier = { level: 'EX', shadow: false };
+const ELITE: RaidTier = { level: 'Elite', shadow: false };
 
 let nextId = 1;
 function override(
@@ -329,13 +329,13 @@ describe('effectiveBosses: overrides', () => {
   it('adds a boss the feed does not list', () => {
     const bosses = effectiveBosses(
       feed,
-      [override('add', 'MEWTWO', EX, { shiny: true }), override('add', 'ZEKROM', T5)],
+      [override('add', 'MEWTWO', ELITE, { shiny: true }), override('add', 'ZEKROM', T5)],
       catalogue,
       NOW,
     );
     expect(keys(bosses, T5)).toEqual(['yveltal', 'zekrom']);
     expect(bosses.find((b) => b.key === 'mewtwo')).toMatchObject({
-      tier: EX,
+      tier: ELITE,
       shiny: true,
       name: 'Mewtwo',
       source: 'override',
@@ -575,7 +575,7 @@ describe('autosetBoss', () => {
   it('is nothing for a tier with several bosses or none', () => {
     const bosses = effectiveBosses(feed, [], catalogue, NOW);
     expect(autosetBoss(bosses, T3)).toBeUndefined();
-    expect(autosetBoss(bosses, EX)).toBeUndefined();
+    expect(autosetBoss(bosses, ELITE)).toBeUndefined();
     expect(autosetBoss([], T5)).toBeUndefined();
   });
 
@@ -667,8 +667,8 @@ describe('diffFeed', () => {
 describe('overrideProblem', () => {
   it('accepts each kind of override', () => {
     for (const ok of [
-      override('add', 'MEWTWO', EX),
-      override('add', 'MEWTWO', EX, { shiny: true, expiresAt: NOW + 1 }),
+      override('add', 'MEWTWO', ELITE),
+      override('add', 'MEWTWO', ELITE, { shiny: true, expiresAt: NOW + 1 }),
       override('hide', 'YVELTAL', T5),
       override('autoset', 'BLASTOISE', MEGA, { form: 'BLASTOISE_MEGA' }),
       override('shiny', 'KIRLIA', null, { shiny: false }),
@@ -685,7 +685,7 @@ describe('overrideProblem', () => {
     ['a tier is missing for autoset', override('autoset', 'MEWTWO', null), /tier is needed/],
     [
       'the tier has no shadow raids',
-      override('add', 'MEWTWO', { level: 'EX', shadow: true }),
+      override('add', 'MEWTWO', { level: 'Elite', shadow: true }),
       /no shadow raids/,
     ],
     ['a shiny override has no value', override('shiny', 'MEWTWO', null), /shiny or not/],
```

Apply to `src/domain/pogo/raid-tier.test.ts`:

```diff
--- a/src/domain/pogo/raid-tier.test.ts
+++ b/src/domain/pogo/raid-tier.test.ts
@@ -1,6 +1,7 @@
 import { describe, expect, it } from 'vitest';
 import {
   RAID_LEVELS,
+  RETIRED_EX_LEVEL,
   bossStamina,
   isRaidLevel,
   raidDurationKind,
@@ -11,16 +12,10 @@ import {
 
 describe('raid tiers', () => {
   it('names every level', () => {
-    expect(RAID_LEVELS).toEqual([
-      'T1',
-      'T3',
-      'T5',
-      'Mega',
-      'MegaLegendary',
-      'SuperMega',
-      'Elite',
-      'EX',
-    ]);
+    expect(RAID_LEVELS).toEqual(['T1', 'T3', 'T5', 'Mega', 'MegaLegendary', 'SuperMega', 'Elite']);
+    // The EX tier is gone (plan 4F): what was stored with it is no level any more.
+    expect(RETIRED_EX_LEVEL).toBe('EX');
+    expect(isRaidLevel(RETIRED_EX_LEVEL)).toBe(false);
     expect(isRaidLevel('SuperMega')).toBe(true);
     expect(isRaidLevel('T5')).toBe(true);
     expect(isRaidLevel('T2')).toBe(false);
@@ -30,7 +25,7 @@ describe('raid tiers', () => {
     expect(raidTier('T5', true)).toEqual({ level: 'T5', shadow: true });
     expect(raidTier('T1')).toEqual({ level: 'T1', shadow: false });
     expect(raidTier('Mega', true)).toBeUndefined();
-    expect(raidTier('EX', true)).toBeUndefined();
+    expect(raidTier('Elite', true)).toBeUndefined();
     expect(raidTier('SuperMega', true)).toBeUndefined();
   });
 
@@ -43,7 +38,7 @@ describe('raid tiers', () => {
 
   it('knows the boss stamina of each level', () => {
     expect(RAID_LEVELS.map((level) => bossStamina({ level, shadow: false }))).toEqual([
-      600, 3600, 15000, 9000, 22500, 25000, 20000, 15000,
+      600, 3600, 15000, 9000, 22500, 25000, 20000,
     ]);
     expect(bossStamina({ level: 'T5', shadow: true })).toBe(15000);
   });
@@ -53,7 +48,6 @@ describe('raid tiers', () => {
     expect(raidDurationKind({ level: 'Mega', shadow: false })).toBe('standard');
     expect(raidDurationKind({ level: 'SuperMega', shadow: false })).toBe('standard');
     expect(raidDurationKind({ level: 'Elite', shadow: false })).toBe('elite');
-    expect(raidDurationKind({ level: 'EX', shadow: false })).toBe('exclusive');
   });
 
   it('compares tiers by level and shadow', () => {
```

Apply to `src/domain/pogo/wants.test.ts`:

```diff
--- a/src/domain/pogo/wants.test.ts
+++ b/src/domain/pogo/wants.test.ts
@@ -87,7 +87,7 @@ describe('readNotification: the scope in effect', () => {
   });
 
   it('reads back what the codec writes, with the scope it stored', () => {
-    for (const target of [species(1), tier('T5', true), tier('EX'), PERFECT, ZERO]) {
+    for (const target of [species(1), tier('T5', true), tier('Elite'), PERFECT, ZERO]) {
       for (const scope of ['raid', 'spawn', 'both'] as const) {
         const stored = encodeNotification(target, scope);
         expect(readNotification(stored)).toEqual({ target, scope: stored.type });
@@ -97,7 +97,7 @@ describe('readNotification: the scope in effect', () => {
 });
 
 describe('notificationTiers', () => {
-  it('lists the tiers with a code: ordinary first, then elite, EX, the shadow tiers', () => {
+  it('lists the tiers with a code: ordinary first, then elite, the shadow tiers', () => {
     expect(notificationTiers().map(raidTierLabel)).toEqual([
       'T1',
       'T3',
@@ -106,7 +106,6 @@ describe('notificationTiers', () => {
       'Mega Legendary',
       'Super Mega',
       'Elite',
-      'EX',
       'Shadow T1',
       'Shadow T3',
       'Shadow T5',
@@ -251,9 +250,6 @@ describe('wantWord', () => {
     ['super mega', tier('SuperMega')],
     ['7', tier('SuperMega')],
     ['elite', tier('Elite')],
-    ['ex', tier('EX')],
-    ['EX raid', tier('EX')],
-    ['exclusive', tier('EX')],
     ['shadow 5', tier('T5', true)],
     ['shadow t5', tier('T5', true)],
     ['Shadow Tier 1', tier('T1', true)],
@@ -332,7 +328,12 @@ describe('wantWordGuesses', () => {
   it('offers what a beginning or a misspelling may mean, three at most', () => {
     expect(wantWordGuesses('perf')).toEqual([PERFECT]);
     expect(wantWordGuesses('perfact')).toEqual([PERFECT]);
-    expect(wantWordGuesses('exclusiv')).toEqual([tier('EX')]);
+    expect(wantWordGuesses('elit')).toEqual([tier('Elite')]);
+    // The words of the EX tier, which is gone, name and begin nothing.
+    for (const text of ['ex', 'EX raid', 'exclusive', 'exclusiv']) {
+      expect(wantWord(text), text).toBeUndefined();
+      expect(wantWordGuesses(text), text).toEqual([]);
+    }
     expect(wantWordGuesses('mega l')).toContainEqual(tier('MegaLegendary'));
     expect(wantWordGuesses('shadow').length).toBe(3);
     expect(wantWordGuesses('mewtwo')).toEqual([]);
@@ -357,11 +358,12 @@ describe('wantWord against every Pokemon', () => {
     }
     expect(texts.size).toBeGreaterThan(10_000);
     // Only what is a tier's own word in full, which members type for the tier: `mega` begins
-    // Meganium and every Mega's name, `ex` begins Exeggcute. A longer beginning is the Pokemon.
+    // Meganium and every Mega's name. A longer beginning is the Pokemon. (`ex` was the EX
+    // tier's word, and now only begins Exeggcute.)
     const read = [...texts]
       .filter((text) => wantWord(text) !== undefined)
       .map((text) => text.trim());
-    expect([...new Set(read)].sort()).toEqual(['ex', 'mega']);
+    expect([...new Set(read)].sort()).toEqual(['mega']);
   });
 });
 
```

Apply to `src/domain/time/party-time.test.ts`:

```diff
--- a/src/domain/time/party-time.test.ts
+++ b/src/domain/time/party-time.test.ts
@@ -117,11 +117,7 @@ describe('resolvePartyTime: raid hatch time', () => {
     }
   });
 
-  it('uses the long windows of EX and elite raids', () => {
-    expect(resolvePartyTime(request({ text: '10-20 6:30pm', raidKind: 'exclusive' }))).toEqual({
-      kind: 'time',
-      at: at('2026-10-20T18:30'),
-    });
+  it('uses the long window of elite raids', () => {
     expect(resolvePartyTime(request({ text: '10-11 11am', raidKind: 'elite' }))).toEqual({
       kind: 'time',
       at: at('2026-10-11T11:00'),
@@ -160,10 +156,10 @@ describe('resolvePartyTime: text that only starts like a duration', () => {
 
   it('reads a date in front of a time as a date, not as ten minutes', () => {
     // Legacy tried "10-20 6" as a duration first and got 10 minutes; now the clock parser runs.
-    // 6 o'clock on the 20th is the first candidate and is inside the exclusive raid's window.
-    expect(resolvePartyTime(request({ text: '10-20 6', raidKind: 'exclusive' }))).toEqual({
+    // 6 o'clock on the 11th is the first candidate and is inside the elite raid's window.
+    expect(resolvePartyTime(request({ text: '10-11 6', raidKind: 'elite' }))).toEqual({
       kind: 'time',
-      at: at('2026-10-20T06:00'),
+      at: at('2026-10-11T06:00'),
     });
   });
 
```

Apply to `src/domain/time/raid-durations.test.ts`:

```diff
--- a/src/domain/time/raid-durations.test.ts
+++ b/src/domain/time/raid-durations.test.ts
@@ -127,14 +127,14 @@ describe('raidDurationsAt', () => {
     );
   });
 
-  it('leaves EX and elite raids alone', () => {
+  it('leaves elite raids alone', () => {
     expect(raidDurationsAt('elite', at('2026-10-14T18:30'), rules)).toEqual({
       incubation: 1440,
       hatched: 30,
     });
-    expect(raidDurationsAt('exclusive', at('2026-10-31T15:00'), rules)).toEqual({
-      incubation: 20160,
-      hatched: 45,
+    expect(raidDurationsAt('elite', at('2026-10-31T15:00'), rules)).toEqual({
+      incubation: 1440,
+      hatched: 30,
     });
   });
 });
```

Apply to `src/render/raid-post.test.ts`:

```diff
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -20,6 +20,7 @@ import {
 } from '../../test/support/parties.js';
 import { raidBossesFixture } from '../../test/support/raid-bosses.js';
 import type { Attendee, RaidParty } from '../domain/party/party.js';
+import { FORUM_TAGS } from './party-post.js';
 import { setBoss, setHatchTime } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import {
@@ -207,7 +208,8 @@ describe('raidTitle and raidTags', () => {
     expect(raidTags(testRaid({ tier: { level: 'Elite', shadow: false } }), PARTY_NOW)[1]).toBe(
       'Elite',
     );
-    expect(raidTags(testRaid({ tier: { level: 'EX', shadow: false } }), PARTY_NOW)[1]).toBe('EX');
+    // No tag for the EX tier, which is gone.
+    expect(FORUM_TAGS).not.toContain('EX');
   });
 });
 
@@ -567,8 +569,9 @@ describe('renderRaidPost', () => {
     expect(about({ notice: 'Closes at **dusk** @everyone' })).toBe(
       'Closes at \\*\\*dusk\\*\\* @\u200beveryone',
     );
-    const ex = testRaid({ tier: { level: 'EX', shadow: false } });
-    expect(about({ taggedEx: true }, ex)).toBeUndefined();
+    // Whatever the raid: an elite raid at such a gym says so too.
+    const elite = testRaid({ tier: { level: 'Elite', shadow: false } });
+    expect(about({ taggedEx: true }, elite)).toBe('This is an elite raid gym.');
   });
 
   it('keeps the lines of a notice that was written as a paragraph', () => {
```

Apply to `src/services/party-mirrors.test.ts`:

```diff
--- a/src/services/party-mirrors.test.ts
+++ b/src/services/party-mirrors.test.ts
@@ -53,7 +53,7 @@ describe('the copies of a raid in other channels', () => {
     expect(gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
   });
 
-  it('puts a raid at an elite raid gym into the channel for those as well, but not an EX raid', async () => {
+  it('puts a raid at an elite raid gym into the channel for those as well', async () => {
     const made = await mirrored({}, { gyms: gymsWithExLibrary() });
     expect(made.gateway.messagesIn(ELITE_GYM_CHANNEL)).toHaveLength(1);
     expect(made.gateway.messagesIn(ELITE_GYM_CHANNEL)[0]?.message.content).toBe(
@@ -61,12 +61,13 @@ describe('the copies of a raid in other channels', () => {
     );
     expect(made.current().mirrorMessages.map((mirror) => mirror.kind)).toEqual(['ex', 'remote']);
 
-    const ex = await mirrored(
-      { tier: { level: 'EX', shadow: false } },
+    // An elite raid there too: it is only the remote channel that an elite raid stays out of.
+    const elite = await mirrored(
+      { tier: { level: 'Elite', shadow: false } },
       { gyms: gymsWithExLibrary() },
     );
-    expect(ex.gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
-    expect(ex.gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
+    expect(elite.gateway.messagesIn(ELITE_GYM_CHANNEL)).toHaveLength(1);
+    expect(elite.gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
   });
 
   it('makes no copy where the server has no such channel or the feature is off', async () => {
```

Apply to `src/services/party-store.test.ts`:

```diff
--- a/src/services/party-store.test.ts
+++ b/src/services/party-store.test.ts
@@ -120,7 +120,6 @@ describe('PartyStore', () => {
     expect(store.raidAt(1, 'standard', at('2026-10-13T14:39'))?.id).toBe(ID(1));
     expect(store.raidAt(1, 'standard', at('2026-10-13T14:40'))).toBeUndefined();
     expect(store.raidAt(1, 'elite', PARTY_NOW)?.id).toBe(ID(2));
-    expect(store.raidAt(1, 'exclusive', PARTY_NOW)).toBeUndefined();
     expect(store.raidAt(2, 'standard', PARTY_NOW)).toBeUndefined();
   });
 
```

Apply to `src/services/raid-change-service.test.ts`:

```diff
--- a/src/services/raid-change-service.test.ts
+++ b/src/services/raid-change-service.test.ts
@@ -109,8 +109,8 @@ describe('RaidChangeService: times', () => {
   });
 
   it('names the day for a time that is far off', async () => {
-    const made = await reportedRaid({ tier: { level: 'EX', shadow: false } });
-    const far = at('2026-10-20T12:00');
+    const made = await reportedRaid({ tier: { level: 'Elite', shadow: false } });
+    const far = at('2026-10-14T12:00');
     await made.raids.setHatchTime(made.party.id, alice, far);
     expect(await lines(made)).toEqual([
       `**Alice** (<@${ALICE}>) set the hatch time: <t:${far / 1000}:f>.`,
@@ -534,7 +534,7 @@ describe('RaidChangeService: the gym, and one raid per gym', () => {
 
   it('lets a raid of another kind share the gym', async () => {
     const made = await reportedRaid();
-    await secondRaid(made, 2, { tier: { level: 'EX', shadow: false } });
+    await secondRaid(made, 2, { tier: { level: 'Elite', shadow: false } });
     expect(await made.raids.setGym(made.party.id, alice, 2)).toMatchObject({ kind: 'ok' });
   });
 
@@ -556,7 +556,7 @@ describe('RaidChangeService: the gym, and one raid per gym', () => {
   });
 
   it('refuses a boss that makes the raid the kind another raid at the gym is', async () => {
-    const made = await reportedRaid({ tier: { level: 'EX', shadow: false } });
+    const made = await reportedRaid({ tier: { level: 'Elite', shadow: false } });
     const standard = await secondRaid(made, 1);
     const outcome = await made.raids.setBoss(made.party.id, alice, {
       tier: T5,
```

Apply to `test/fixtures/settings.json`:

```diff
--- a/test/fixtures/settings.json
+++ b/test/fixtures/settings.json
@@ -1,8 +1,6 @@
 {
   "standardRaidIncubateDuration": 60,
   "standardRaidHatchedDuration": 45,
-  "exclusiveRaidIncubateDuration": 20160,
-  "exclusiveRaidHatchedDuration": 45,
   "eliteRaidIncubateDuration": 1440,
   "eliteRaidHatchedDuration": 30,
   "maxRaidHatchedDuration": 180,
```

Run: `npx vitest run --project unit src/commands/notifications/wants.test.ts src/commands/raids/raid-input.test.ts src/config/settings.test.ts src/domain/notify/reasons.test.ts src/domain/party/party-state.test.ts src/domain/party/raid.test.ts src/domain/party/tick.test.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/raid-boss-feed.test.ts src/domain/pogo/raid-bosses.test.ts src/domain/pogo/raid-tier.test.ts src/domain/pogo/wants.test.ts src/domain/time/party-time.test.ts src/domain/time/raid-durations.test.ts src/render/raid-post.test.ts src/services/party-mirrors.test.ts src/services/party-store.test.ts src/services/raid-change-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `data/settings.json`:

```diff
--- a/data/settings.json
+++ b/data/settings.json
@@ -1,8 +1,6 @@
 {
   "standardRaidIncubateDuration": 60,
   "standardRaidHatchedDuration": 45,
-  "exclusiveRaidIncubateDuration": 20160,
-  "exclusiveRaidHatchedDuration": 45,
   "eliteRaidIncubateDuration": 1440,
   "eliteRaidHatchedDuration": 30,
   "maxRaidHatchedDuration": 180,
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -102,7 +102,12 @@ export async function startApp(
     url: config.settings.raidBosses.url,
     refreshMs: config.settings.raidBosses.refreshMinutes * MINUTE_MS,
     staleAfterMs: config.settings.raidBosses.staleAfterHours * HOUR_MS,
-    store: new RaidBossRepository(db),
+    store: new RaidBossRepository(db, (override) => {
+      log.warn(
+        { override: override.id, level: override.level },
+        'a raid boss override has a tier Pine does not know and is ignored',
+      );
+    }),
     gameData,
     fetch: (url, init) => fetch(url, init),
     log,
```

Apply to `src/commands/raids/change.ts`:

```diff
--- a/src/commands/raids/change.ts
+++ b/src/commands/raids/change.ts
@@ -34,7 +34,7 @@ export function changingMember(interaction: Changing): Member {
 
 /**
  * `It hatches at <t> and ends at <t>.`: the times of a raid as an answer names them (`hatched`,
- * `ended` for what is past), with the day when they are not within half a day of now (an EX or
+ * `ended` for what is past), with the day when they are not within half a day of now (an
  * elite raid, or a clock time that was read as another day than the member meant).
  */
 export function timesText(party: RaidParty, now: number = Date.now()): string {
```

Apply to `src/commands/raids/raid-input.ts`:

```diff
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -105,7 +105,6 @@ const LEVEL_WORDS: Readonly<Record<string, RaidLevel>> = {
   megalegendary: 'MegaLegendary',
   supermega: 'SuperMega',
   elite: 'Elite',
-  ex: 'EX',
 };
 
 /** A tier typed as words at the start of a text (`shadow t5`, `tier 3`, `mega`), and the rest. */
@@ -517,7 +516,7 @@ function gymLabel(gym: Gym, region: string | undefined): string {
 
 /**
  * `between <t> and <t>`: the range a time must lie in, with the day only when an end of it is
- * not within half a day of now (an EX or elite raid).
+ * not within half a day of now (an elite raid).
  */
 export function between(first: number, last: number, now: number): string {
   const style = isFarOff(first, now) || isFarOff(last, now) ? 'f' : 't';
```

Apply to `src/config/settings.ts`:

```diff
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -14,11 +14,27 @@ function isTimeZone(zone: string): boolean {
   }
 }
 
+/**
+ * Keys an older settings file may still have, and that mean nothing any more: the durations of
+ * EX raids, a tier that plan 4F removed. The schema is strict, so that a misspelt key is
+ * refused; these are taken out first, so that a file from before the removal still starts.
+ * Top-level keys only.
+ */
+export const RETIRED_SETTINGS = [
+  'exclusiveRaidIncubateDuration',
+  'exclusiveRaidHatchedDuration',
+] as const;
+
+/** A settings file as it was read, without the keys of `RETIRED_SETTINGS`. */
+export function withoutRetiredSettings(raw: unknown): unknown {
+  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
+  const retired: readonly string[] = RETIRED_SETTINGS;
+  return Object.fromEntries(Object.entries(raw).filter(([key]) => !retired.includes(key)));
+}
+
 export const settingsSchema = z.strictObject({
   standardRaidIncubateDuration: minutes,
   standardRaidHatchedDuration: minutes,
-  exclusiveRaidIncubateDuration: minutes,
-  exclusiveRaidHatchedDuration: minutes,
   eliteRaidIncubateDuration: minutes,
   eliteRaidHatchedDuration: minutes,
   maxRaidHatchedDuration: minutes,
@@ -143,7 +159,7 @@ export function loadSettings(path: string): Settings {
   } catch (err) {
     throw new ConfigError(`${path} is not valid JSON: ${(err as Error).message}`);
   }
-  const result = settingsSchema.safeParse(raw);
+  const result = settingsSchema.safeParse(withoutRetiredSettings(raw));
   if (!result.success) {
     throw new ConfigError(`Invalid settings in ${path}:\n${z.prettifyError(result.error)}`);
   }
```

Create `src/db/migrations/2026_10_13_009_ex_wants_to_elite.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** The number a want for the EX tier was stored under (`notification-target.ts`, until plan 4F). */
const EX_CODE = -21;
/** The number a want for the elite tier is stored under. */
const ELITE_CODE = -20;

/**
 * A want for EX raids becomes a want for elite raids (plan 4F; Matt, 2026-10-13: explicit, not
 * read-as). The EX tier is gone from the bot: the game has had no EX raid since early 2020 and
 * turned EX gyms into elite raid gyms.
 *
 * Only a database this bot has written to has such rows: the legacy bot had no code for an EX
 * want (production holds the tier codes -1, -3, -4, -5, -6, -7 and -8 only), so on a takeover
 * of production this changes nothing.
 *
 * A row is touched only when it reads as a tier want, which is when its type is `raid` or
 * `both` in any letter case and with or without blanks around it, as the codec reads it (a
 * tier row typed `spawn` is one the codec cannot read, and such a row is never changed or
 * deleted on its own). The scope of a tier want is always raids,
 * whatever the type says, so two rows of one member cannot differ in scope and there is no
 * union to keep: where the member already has the elite want in that server, the EX row is
 * deleted; otherwise it is rewritten, with the type the codec writes. Several EX rows of one
 * member without an elite row all become elite rows: the reader takes rows for one target as
 * one want, and the next change of it leaves one row.
 *
 * Safe to run again after a failure half-way: both statements find nothing to do the second
 * time. There is no way back: an elite want does not say that it was an EX want.
 */
export const exWantsToElite: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      delete ex from PokemonNotification ex
      join PokemonNotification elite
        on elite.userId = ex.userId and elite.guildId = ex.guildId
      where ex.pokemon = ${EX_CODE} and trim(lower(ex.type)) in ('raid', 'both')
        and elite.pokemon = ${ELITE_CODE}
        and trim(lower(elite.type)) in ('raid', 'both')`.execute(db);
    await sql`
      update PokemonNotification
      set pokemon = ${ELITE_CODE}, type = 'raid'
      where pokemon = ${EX_CODE} and trim(lower(type)) in ('raid', 'both')`.execute(db);
  },
  async down() {
    // The rows stay elite wants: nothing says which of them were for EX raids.
  },
};
```

Apply to `src/db/migrations/index.ts`:

```diff
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -8,6 +8,7 @@ import { pokemonNotificationForm } from './2026_10_12_005_pokemon_notification_f
 import { newTrainNotifications } from './2026_10_12_006_new_train_notifications.js';
 import { unownWantGifts } from './2026_10_12_007_unown_want_gifts.js';
 import { selfRoleGroups } from './2026_10_13_008_self_role_groups.js';
+import { exWantsToElite } from './2026_10_13_009_ex_wants_to_elite.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -23,4 +24,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_12_006_new_train_notifications': newTrainNotifications,
   '2026_10_12_007_unown_want_gifts': unownWantGifts,
   '2026_10_13_008_self_role_groups': selfRoleGroups,
+  '2026_10_13_009_ex_wants_to_elite': exWantsToElite,
 };
```

Apply to `src/db/repositories/raid-boss-repository.ts`:

```diff
--- a/src/db/repositories/raid-boss-repository.ts
+++ b/src/db/repositories/raid-boss-repository.ts
@@ -45,7 +45,18 @@ function identity(pokemonId: string, form: string, level: string, shadow: number
 
 /** The `RaidBoss` and `RaidBossOverride` tables. */
 export class RaidBossRepository implements RaidBossStore {
-  constructor(private readonly db: Kysely<DB>) {}
+  private readonly reported = new Set<number>();
+
+  /**
+   * `unreadable` hears of an override whose tier this version does not know (one for the EX
+   * tier, which plan 4F removed, or one written by a newer version), once per row: such an
+   * override is left out and left alone.
+   */
+  constructor(
+    private readonly db: Kysely<DB>,
+    private readonly unreadable: (override: { id: number; level: string }) => void = () =>
+      undefined,
+  ) {}
 
   /** The bosses the feed listed at the last sync, in the order they were first stored. */
   async listActive(): Promise<StoredBoss[]> {
@@ -58,7 +69,8 @@ export class RaidBossRepository implements RaidBossStore {
     const bosses: StoredBoss[] = [];
     for (const row of rows) {
       const tier = tierOf(row.level, row.shadow);
-      // A level this version does not know (written by a newer one): not a boss it can show.
+      // A level this version does not know (written by a newer one, or the EX tier of an
+      // older one): not a boss it can show. The next sync marks it as no longer listed.
       if (!tier) continue;
       bosses.push({
         pokemonId: row.pokemonId,
@@ -179,7 +191,13 @@ export class RaidBossRepository implements RaidBossStore {
     for (const row of rows) {
       const tier = tierOf(row.level, row.shadow);
       if (!isOverrideAction(row.action)) continue;
-      if (row.level !== null && !tier) continue;
+      if (row.level !== null && !tier) {
+        if (!this.reported.has(row.id)) {
+          this.reported.add(row.id);
+          this.unreadable({ id: row.id, level: row.level });
+        }
+        continue;
+      }
       overrides.push({
         id: row.id,
         pokemonId: row.pokemonId,
```

Apply to `src/domain/notify/reasons.ts`:

```diff
--- a/src/domain/notify/reasons.ts
+++ b/src/domain/notify/reasons.ts
@@ -84,7 +84,7 @@ export function raidNumbers(raid: RaidSighting): number[] {
  *   and not for shadow ones, and a want for shadow T5 for those alone (Matt, 2026-10-10). An
  *   egg fires nothing else.
  *
- * EX and elite raids are raids like any other here.
+ * Elite raids are raids like any other here.
  */
 export function raidWantsFiring(
   catalogue: Pick<PokemonCatalogue, 'byKey'>,
```

Apply to `src/domain/party/party-state.ts`:

```diff
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -1,5 +1,5 @@
 import { z } from 'zod';
-import { RAID_LEVELS, raidTier } from '../pogo/raid-tier.js';
+import { RAID_LEVELS, RETIRED_EX_LEVEL, raidTier } from '../pogo/raid-tier.js';
 import {
   GROUP_IDS,
   MAX_COMPLETION_PROMPTS,
@@ -82,8 +82,20 @@ const group = z.object({
   startClearTime: time.optional(),
 });
 
+/**
+ * The level of a raid. A raid stored while there was an EX tier (plan 4F removed it; a dev
+ * database may hold ended ones) is read as an elite raid, which is what the game made of EX.
+ * That is no new version of the document: nothing was added to it, no document is ever written
+ * with the old level again (the level is no `RaidLevel` any more), and a reader that still
+ * knows the old level reads a document without it as before.
+ */
+const tierLevel = z.preprocess(
+  (level) => (level === RETIRED_EX_LEVEL ? 'Elite' : level),
+  z.enum(RAID_LEVELS),
+);
+
 const tier = z
-  .object({ level: z.enum(RAID_LEVELS), shadow: z.boolean() })
+  .object({ level: tierLevel, shadow: z.boolean() })
   .refine((value) => raidTier(value.level, value.shadow) !== undefined, {
     error: 'this level has no shadow raids',
   });
```

Apply to `src/domain/party/raid.ts`:

```diff
--- a/src/domain/party/raid.ts
+++ b/src/domain/party/raid.ts
@@ -106,7 +106,7 @@ export function isEliteGym(gym: { taggedEx: boolean; confirmedEx: boolean }): bo
 
 /**
  * The channels besides its own post in which a raid's message should stand (spec 5.2): `ex` for
- * a raid, itself not an EX raid, at an elite raid gym; `remote` for a raid that can be
+ * a raid at an elite raid gym; `remote` for a raid that can be
  * joined remotely (every raid but an elite one). None once the raid has ended by the clock: what
  * is over is of no use to somebody looking for a raid. Whether the server has such channels, and
  * wants them, is the caller's to know.
@@ -119,7 +119,7 @@ export function raidMirrors(
   if (party.status !== 'active' || raidStage(party, now) === 'ended') return [];
   const { level } = party.raid.tier;
   return [
-    ...(gym && isEliteGym(gym) && level !== 'EX' ? ['ex' as const] : []),
+    ...(gym && isEliteGym(gym) ? ['ex' as const] : []),
     ...(level !== 'Elite' ? ['remote' as const] : []),
   ];
 }
```

Apply to `src/domain/pogo/notification-target.ts`:

```diff
--- a/src/domain/pogo/notification-target.ts
+++ b/src/domain/pogo/notification-target.ts
@@ -105,7 +105,7 @@ export function parseNotificationScope(value: string): NotificationScope | undef
  * collide.
  *
  * In the legacy bot a -5 want also fired for an elite raid whose boss was known and for shadow
- * tier 5 raids (it had no shadow concept), and EX raids notified nobody. The codec reads -5 as
+ * tier 5 raids (it had no shadow concept). The codec reads -5 as
  * tier 5 only; widening the match for existing rows is a decision for the notification matcher.
  *
  * A super mega raid is tier 7 in the game, so it is -7. In the legacy bot 7 was the "rare"
@@ -113,10 +113,15 @@ export function parseNotificationScope(value: string): NotificationScope | undef
  * into -6 and -8; production has one stray `(-7, spawn)` row, which stays unreadable like every
  * tier typed `spawn`. As of 2026-10 production has no -7 row typed `raid` or `both`.
  *
- * Elite, EX and shadow tiers had no legacy number. They get the values below (-20, -21, -31,
- * -33, -35), which never match in the legacy bot's raid or spawn lookups. A row holding one does
- * break the legacy `!wants` listing for that member, so a rollback must first remove the rows
- * with `pokemon < -8` and the rows with `pokemon = -7` typed `raid`.
+ * Elite and shadow tiers had no legacy number. They get the values below (-20, -31, -33, -35),
+ * which never match in the legacy bot's raid or spawn lookups. A row holding one does break the
+ * legacy `!wants` listing for that member, so a rollback must first remove the rows with
+ * `pokemon < -8` and the rows with `pokemon = -7` typed `raid`.
+ *
+ * -21 was the EX tier until plan 4F removed that tier (Matt, 2026-10-13). Migration
+ * `2026_10_13_009` made every such want an elite want, so no row should hold it; one that does
+ * (written by an older version of this bot after a rollback) is a code the codec does not
+ * know, skipped and counted like any other. The number is not given to another tier.
  *
  * The columns `form` and `shadow` (plan 4A, task 7) narrow a row with a Pokédex number: `form`
  * holds the catalogue key of the one form that is wanted (NULL: every form of the species),
@@ -144,7 +149,6 @@ const TIER_CODES: ReadonlyArray<readonly [number, RaidLevel, boolean]> = [
   [-6, 'MegaLegendary', false],
   [-7, 'SuperMega', false],
   [-20, 'Elite', false],
-  [-21, 'EX', false],
   [-31, 'T1', true],
   [-33, 'T3', true],
   [-35, 'T5', true],
@@ -258,7 +262,7 @@ export function readNotification(stored: StoredNotification): Want | undefined {
 
 /**
  * The tiers a want can be for (those the codec has a code for), in the order a list offers
- * them: the ordinary ones, then elite and EX, then the shadow tiers.
+ * them: the ordinary ones, then elite, then the shadow tiers.
  */
 export function notificationTiers(): RaidTier[] {
   return TIER_CODES.flatMap(([, level, shadow]) => {
```

Apply to `src/domain/pogo/raid-boss-feed.ts`:

```diff
--- a/src/domain/pogo/raid-boss-feed.ts
+++ b/src/domain/pogo/raid-boss-feed.ts
@@ -124,7 +124,6 @@ const HEADINGS: Readonly<Record<string, RaidLevel>> = {
   primal: MEGA_LEGENDARY,
   'super mega': 'SuperMega',
   elite: 'Elite',
-  ex: 'EX',
   // An ultra beast is an ordinary tier 5 boss.
   'ultra beast': 'T5',
 };
```

Apply to `src/domain/pogo/raid-tier.ts`:

```diff
--- a/src/domain/pogo/raid-tier.ts
+++ b/src/domain/pogo/raid-tier.ts
@@ -2,7 +2,9 @@ import type { RaidKind } from '../time/party-time.js';
 
 /**
  * The kinds of raid. Shadow raids are a flag on top of T1, T3 and T5. In the game a mega
- * legendary raid is tier 6 and a super mega raid tier 7.
+ * legendary raid is tier 6 and a super mega raid tier 7. There is no EX tier any more (plan 4F;
+ * Matt, 2026-10-13): the game has had no EX raid since early 2020 and turned EX gyms into elite
+ * raid gyms. What was stored with it is read as elite or left alone (`RETIRED_EX_LEVEL`).
  */
 export const RAID_LEVELS = [
   'T1',
@@ -12,7 +14,6 @@ export const RAID_LEVELS = [
   'MegaLegendary',
   'SuperMega',
   'Elite',
-  'EX',
 ] as const;
 export type RaidLevel = (typeof RAID_LEVELS)[number];
 
@@ -21,6 +22,13 @@ export interface RaidTier {
   shadow: boolean;
 }
 
+/**
+ * How the EX tier was stored while it existed: in the state document of a raid, which is read
+ * as an elite raid (`party-state.ts`), and in the `RaidBoss` and `RaidBossOverride` tables,
+ * whose rows with it are no boss this version can show.
+ */
+export const RETIRED_EX_LEVEL = 'EX';
+
 /** Levels that also exist as shadow raids. */
 export const SHADOW_RAID_LEVELS: readonly RaidLevel[] = ['T1', 'T3', 'T5'];
 
@@ -32,7 +40,6 @@ const LABELS: Readonly<Record<RaidLevel, string>> = {
   MegaLegendary: 'Mega Legendary',
   SuperMega: 'Super Mega',
   Elite: 'Elite',
-  EX: 'EX',
 };
 
 /**
@@ -47,7 +54,6 @@ const BOSS_STAMINA: Readonly<Record<RaidLevel, number>> = {
   MegaLegendary: 22500,
   SuperMega: 25000,
   Elite: 20000,
-  EX: 15000,
 };
 
 /** Which incubation and hatched durations apply (see `RaidKind` in domain/time). */
@@ -59,7 +65,6 @@ const DURATION_KIND: Readonly<Record<RaidLevel, RaidKind>> = {
   MegaLegendary: 'standard',
   SuperMega: 'standard',
   Elite: 'elite',
-  EX: 'exclusive',
 };
 
 export function isRaidLevel(value: string): value is RaidLevel {
```

Apply to `src/domain/pogo/wants.ts`:

```diff
--- a/src/domain/pogo/wants.ts
+++ b/src/domain/pogo/wants.ts
@@ -110,7 +110,7 @@ const LEVEL_NUMBERS: Partial<Record<RaidLevel, string>> = {
   SuperMega: '7',
 };
 
-/** Words for a level beside its number. `ex` and `exclusive` are the legacy bot's. */
+/** Words for a level beside its number. */
 const LEVEL_WORDS: Readonly<Record<RaidLevel, readonly string[]>> = {
   T1: [],
   T3: [],
@@ -119,7 +119,6 @@ const LEVEL_WORDS: Readonly<Record<RaidLevel, readonly string[]>> = {
   MegaLegendary: ['mega legendary', 'legendary mega'],
   SuperMega: ['super mega'],
   Elite: ['elite'],
-  EX: ['ex', 'exclusive'],
 };
 
 /** Every way a tier is typed: `5`, `t5`, `tier 5`, `level 5`, `5 star`, `shadow 5`, `mega`. */
@@ -180,11 +179,11 @@ const FILLER = new Set(['raid', 'raids', 'egg', 'eggs', 'spawn', 'spawns', 'boss
 
 /**
  * The tier or IV target a typed text names as a word: `tier 5`, `t5`, `5`, `level 5`, `5 star`,
- * `legendary`, `mega`, `mega legendary`, `super mega`, `elite`, `ex`, `exclusive`, `shadow 5`,
+ * `legendary`, `mega`, `mega legendary`, `super mega`, `elite`, `shadow 5`,
  * `perfect`, `hundo`, `100`, `zero`, `none`, `useless`, `0`, with or without `raids`, `eggs` or
  * `spawns` after it. Only a text that is one of these names in full is that target: the
  * beginning of a name or a misspelling of one is never acted on, because it is as likely the
- * beginning of a Pokémon's name (`zer`, `hun`, `exc`, `mega s`). Such a text is only offered
+ * beginning of a Pokémon's name (`zer`, `hun`, `eli`, `mega s`). Such a text is only offered
  * (`wantWordGuesses`). Undefined for anything else.
  */
 export function wantWord(text: string): NotificationTarget | undefined {
```

Apply to `src/domain/time/party-time.ts`:

```diff
--- a/src/domain/time/party-time.ts
+++ b/src/domain/time/party-time.ts
@@ -4,14 +4,12 @@ import { parseClockInput, parseRelativeMinutes, type ClockInput } from './clock-
 
 export type TimeParameter = 'hatch' | 'meet' | 'end';
 export type TimedPartyType = 'raid' | 'train' | 'meetup';
-export type RaidKind = 'standard' | 'exclusive' | 'elite';
+export type RaidKind = 'standard' | 'elite';
 
 export type TimeSettings = Pick<
   Settings,
   | 'standardRaidIncubateDuration'
   | 'standardRaidHatchedDuration'
-  | 'exclusiveRaidIncubateDuration'
-  | 'exclusiveRaidHatchedDuration'
   | 'eliteRaidIncubateDuration'
   | 'eliteRaidHatchedDuration'
   | 'maxMeetupLeadupDuration'
@@ -87,10 +85,6 @@ function raidDurations(request: PartyTimeRequest): { incubation: number; hatched
         incubation: settings.standardRaidIncubateDuration,
         hatched: settings.standardRaidHatchedDuration,
       },
-      exclusive: {
-        incubation: settings.exclusiveRaidIncubateDuration,
-        hatched: settings.exclusiveRaidHatchedDuration,
-      },
       elite: {
         incubation: settings.eliteRaidIncubateDuration,
         hatched: settings.eliteRaidHatchedDuration,
@@ -153,7 +147,7 @@ function timeWindow(request: PartyTimeRequest): Window {
  * Every moment a typed clock time could mean, most likely first. Standard raids, whose windows
  * are under two hours, also get tomorrow's guesses (so 12:10 at 23:50 means ten past midnight),
  * yesterday's (so 11:50pm at 00:10 means twenty minutes ago) and "12:xx" read as "00:xx". An
- * exclusive or elite raid has a window of hours or days, where a time that has already passed
+ * elite raid has a window of hours or days, where a time that has already passed
  * today must stay out of range rather than silently become tomorrow's, so those get exactly the
  * legacy bot's candidates: today, next year, and the afternoon variants.
  *
```

Apply to `src/domain/time/raid-durations.ts`:

```diff
--- a/src/domain/time/raid-durations.ts
+++ b/src/domain/time/raid-durations.ts
@@ -10,8 +10,6 @@ export type RaidDurationSettings = Pick<
   Settings,
   | 'standardRaidIncubateDuration'
   | 'standardRaidHatchedDuration'
-  | 'exclusiveRaidIncubateDuration'
-  | 'exclusiveRaidHatchedDuration'
   | 'eliteRaidIncubateDuration'
   | 'eliteRaidHatchedDuration'
 > & { raidEvents: Pick<Settings['raidEvents'], 'weeklyRaidHour' | 'hatchedDuration'> };
@@ -48,11 +46,6 @@ function configured(kind: RaidKind, settings: RaidDurationSettings): RaidDuratio
         incubation: settings.standardRaidIncubateDuration,
         hatched: settings.standardRaidHatchedDuration,
       };
-    case 'exclusive':
-      return {
-        incubation: settings.exclusiveRaidIncubateDuration,
-        hatched: settings.exclusiveRaidHatchedDuration,
-      };
     case 'elite':
       return {
         incubation: settings.eliteRaidIncubateDuration,
@@ -104,7 +97,7 @@ export function raidEventAt(time: number, rules: RaidDurationRules): RaidEvent |
 /**
  * How long a raid lasts whose egg hatches at `hatchTime`. Only standard raids follow events: a
  * boss that hatches during a Raid Hour or a Raid Day stays for the time configured for that kind
- * of event. EX and elite raids keep their own durations.
+ * of event. Elite raids keep their own durations.
  */
 export function raidDurationsAt(
   kind: RaidKind,
```

Apply to `src/render/notify-dm.ts`:

```diff
--- a/src/render/notify-dm.ts
+++ b/src/render/notify-dm.ts
@@ -63,7 +63,7 @@ export function postLink(guildId: string, postId: string, messageId?: string): s
   return `https://discord.com/channels/${guildId}/${postId}${message}`;
 }
 
-/** A word with its article: `a T5`, `an Elite`, `an EX`. */
+/** A word with its article: `a T5`, `an Elite`. */
 function withArticle(word: string): string {
   return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;
 }
```

Apply to `src/render/party-post.ts`:

```diff
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -21,7 +21,6 @@ export const FORUM_TAGS = [
   'T5',
   'Mega',
   'Elite',
-  'EX',
   'Shadow',
   'Train',
   'Meetup',
```

Apply to `src/render/raid-post.ts`:

```diff
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -192,7 +192,6 @@ export function raidTags(party: RaidParty, now: number): ForumTag[] {
     MegaLegendary: 'Mega',
     SuperMega: 'Mega',
     Elite: 'Elite',
-    EX: 'EX',
   };
   const { tier } = party.raid;
   return [
@@ -209,8 +208,8 @@ function describeTimes(view: RaidPostView, stage: RaidStage): string {
     return stage === 'ended' ? 'This raid is over.' : 'No time has been set yet.';
   }
   if (stage === 'egg') {
-    // A clock time does not say which day it is when the egg was reported far ahead (EX and
-    // elite raids), so the date is shown: until the day itself, when the clock time is enough
+    // A clock time does not say which day it is when the egg was reported far ahead (an
+    // elite raid), so the date is shown: until the day itself, when the clock time is enough
     // again. The scheduler shows every post anew at midnight. An ordinary raid never has a date.
     const today = DateTime.fromMillis(now, { zone }).hasSame(
       DateTime.fromMillis(hatchTime, { zone }),
@@ -250,14 +249,12 @@ export function bossFacts(
 }
 
 /**
- * What a post says about the gym it is at: that it is an elite raid gym (not for an EX raid, which says
- * so itself: `exRaid`), and the notice the moderators gave the gym. Empty when there is nothing.
+ * What a post says about the gym it is at: that it is an elite raid gym, and the notice the
+ * moderators gave the gym. Empty when there is nothing.
  */
-export function gymNotes(gym: PostGym | undefined, exRaid = false): string[] {
+export function gymNotes(gym: PostGym | undefined): string[] {
   const notes: string[] = [];
-  if (gym && !exRaid) {
-    if (isEliteGym(gym)) notes.push('This is an elite raid gym.');
-  }
+  if (gym && isEliteGym(gym)) notes.push('This is an elite raid gym.');
   // A notice of nothing but white space is empty once plain; Discord refuses an empty field
   // value. It is written as a paragraph (`/gym edit`), and its lines stay lines.
   const notice = gym?.notice ? plainLines(gym.notice) : '';
@@ -353,7 +350,7 @@ export function renderRaidPost(view: RaidPostView): RenderedPost {
     fields.push({ field: done, shrink: (limit) => doneField(view, limit) ?? done, rank: 2 });
   }
 
-  const location = gymNotes(gym, party.raid.tier.level === 'EX');
+  const location = gymNotes(gym);
   if (location.length > 0) {
     fields.push({
       field: {
```

Apply to `src/render/text.ts`:

```diff
--- a/src/render/text.ts
+++ b/src/render/text.ts
@@ -164,7 +164,7 @@ export function isFarOff(time: number, now: number): boolean {
 }
 
 /**
- * A time as a sentence names it: the clock time, with the date when it is far off (an EX or
+ * A time as a sentence names it: the clock time, with the date when it is far off (an
  * elite raid, a meetup planned for another day, a clock time that was read as another day than
  * the member meant).
  */
```

Apply to `src/services/party-store.ts`:

```diff
--- a/src/services/party-store.ts
+++ b/src/services/party-store.ts
@@ -17,7 +17,7 @@ export interface PartyProvider {
   /** The active parties of a region, oldest first. */
   inRegion(regionId: number): Party[];
   /**
-   * The raid at this gym that stands in the way of a new report of the same kind (standard, EX
+   * The raid at this gym that stands in the way of a new report of the same kind (standard
    * or elite): one that has not ended by the clock.
    */
   raidAt(gymId: number, kind: RaidKind, now: number): RaidParty | undefined;
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/notifications/wants.test.ts src/commands/raids/raid-input.test.ts src/config/settings.test.ts src/domain/notify/reasons.test.ts src/domain/party/party-state.test.ts src/domain/party/raid.test.ts src/domain/party/tick.test.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/raid-boss-feed.test.ts src/domain/pogo/raid-bosses.test.ts src/domain/pogo/raid-tier.test.ts src/domain/pogo/wants.test.ts src/domain/time/party-time.test.ts src/domain/time/raid-durations.test.ts src/render/raid-post.test.ts src/services/party-mirrors.test.ts src/services/party-store.test.ts src/services/raid-change-service.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/migrations/2026_10_13_009_ex_wants_to_elite.db.test.ts`, `src/db/migrator.db.test.ts`, `src/db/repositories/party-repository.db.test.ts`, `src/db/repositories/raid-boss-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/migrations/2026_10_13_009_ex_wants_to_elite.db.test.ts src/db/migrator.db.test.ts src/db/repositories/party-repository.db.test.ts src/db/repositories/raid-boss-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 7f506a6 -- src test scripts data/settings.json   # must print nothing
npx prettier --check data/settings.json src/app.ts src/commands/notifications/wants.test.ts src/commands/raids/change.ts src/commands/raids/raid-input.test.ts src/commands/raids/raid-input.ts src/config/settings.test.ts src/config/settings.ts src/db/migrations/2026_10_13_009_ex_wants_to_elite.db.test.ts src/db/migrations/2026_10_13_009_ex_wants_to_elite.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/party-repository.db.test.ts src/db/repositories/raid-boss-repository.db.test.ts src/db/repositories/raid-boss-repository.ts src/domain/notify/reasons.test.ts src/domain/notify/reasons.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/raid.test.ts src/domain/party/raid.ts src/domain/party/tick.test.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/notification-target.ts src/domain/pogo/raid-boss-feed.test.ts src/domain/pogo/raid-boss-feed.ts src/domain/pogo/raid-bosses.test.ts src/domain/pogo/raid-tier.test.ts src/domain/pogo/raid-tier.ts src/domain/pogo/wants.test.ts src/domain/pogo/wants.ts src/domain/time/party-time.test.ts src/domain/time/party-time.ts src/domain/time/raid-durations.test.ts src/domain/time/raid-durations.ts src/render/notify-dm.ts src/render/party-post.ts src/render/raid-post.test.ts src/render/raid-post.ts src/render/text.ts src/services/party-mirrors.test.ts src/services/party-store.test.ts src/services/party-store.ts src/services/raid-change-service.test.ts test/fixtures/settings.json
npm run typecheck; npx eslint data/settings.json src/app.ts src/commands/notifications/wants.test.ts src/commands/raids/change.ts src/commands/raids/raid-input.test.ts src/commands/raids/raid-input.ts src/config/settings.test.ts src/config/settings.ts src/db/migrations/2026_10_13_009_ex_wants_to_elite.db.test.ts src/db/migrations/2026_10_13_009_ex_wants_to_elite.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/party-repository.db.test.ts src/db/repositories/raid-boss-repository.db.test.ts src/db/repositories/raid-boss-repository.ts src/domain/notify/reasons.test.ts src/domain/notify/reasons.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/raid.test.ts src/domain/party/raid.ts src/domain/party/tick.test.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/notification-target.ts src/domain/pogo/raid-boss-feed.test.ts src/domain/pogo/raid-boss-feed.ts src/domain/pogo/raid-bosses.test.ts src/domain/pogo/raid-tier.test.ts src/domain/pogo/raid-tier.ts src/domain/pogo/wants.test.ts src/domain/pogo/wants.ts src/domain/time/party-time.test.ts src/domain/time/party-time.ts src/domain/time/raid-durations.test.ts src/domain/time/raid-durations.ts src/render/notify-dm.ts src/render/party-post.ts src/render/raid-post.test.ts src/render/raid-post.ts src/render/text.ts src/services/party-mirrors.test.ts src/services/party-store.test.ts src/services/party-store.ts src/services/raid-change-service.test.ts test/fixtures/settings.json   # both clean; the full check runs after the last task
git add data/settings.json src/app.ts src/commands/notifications/wants.test.ts src/commands/raids/change.ts src/commands/raids/raid-input.test.ts src/commands/raids/raid-input.ts src/config/settings.test.ts src/config/settings.ts src/db/migrations/2026_10_13_009_ex_wants_to_elite.db.test.ts src/db/migrations/2026_10_13_009_ex_wants_to_elite.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/party-repository.db.test.ts src/db/repositories/raid-boss-repository.db.test.ts src/db/repositories/raid-boss-repository.ts src/domain/notify/reasons.test.ts src/domain/notify/reasons.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/raid.test.ts src/domain/party/raid.ts src/domain/party/tick.test.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/notification-target.ts src/domain/pogo/raid-boss-feed.test.ts src/domain/pogo/raid-boss-feed.ts src/domain/pogo/raid-bosses.test.ts src/domain/pogo/raid-tier.test.ts src/domain/pogo/raid-tier.ts src/domain/pogo/wants.test.ts src/domain/pogo/wants.ts src/domain/time/party-time.test.ts src/domain/time/party-time.ts src/domain/time/raid-durations.test.ts src/domain/time/raid-durations.ts src/render/notify-dm.ts src/render/party-post.ts src/render/raid-post.test.ts src/render/raid-post.ts src/render/text.ts src/services/party-mirrors.test.ts src/services/party-store.test.ts src/services/party-store.ts src/services/raid-change-service.test.ts test/fixtures/settings.json
git commit -F <a file with the message below>
```

The commit message:

```
The EX raid tier is removed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 7: Speed: the rows of a server and a member are asked for once

**Files:**
- Create: `src/commands/round-trips.db.test.ts`, `src/db/repositories/member-rows.db.test.ts`, `src/db/repositories/row-ids.test.ts`, `src/db/repositories/row-ids.ts`
- Modify: `src/app.ts`, `src/db/kysely.ts`, `src/db/repositories/guild-repository.ts`, `src/db/repositories/gym-notification-repository.ts`, `src/db/repositories/member-rows.ts`, `src/db/repositories/pokemon-notification-repository.ts`, `src/db/repositories/user-repository.ts`, `test/support/migrated-db.ts`

**Interfaces:**
- Consumes: `GuildRepository`, `UserRepository`, the wants and gym-target repositories, `withMemberLocked`, `createDb`, `src/app.ts`.
- Produces: `src/db/repositories/row-ids.ts`: `RowIds` (bounded memory of server and member row ids, `RowIds.none` remembering nothing), made once in `src/app.ts` and given to those repositories; `withMemberLocked` using it, remembering a row only after its commit, repairing itself when a remembered member or server row is gone (not inside a caller's transaction); `GuildRepository.ensure` always inserting and reading; `createDb` and `startMigratedDatabase` taking an optional Kysely `log`; `src/commands/round-trips.db.test.ts` pinning the round trips of `/settings`, `/want`, `/target`, `/wild`, `/raid` and the typing of `/gym`.

Reference commit of the prototype for this task: `f990bf0`.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/round-trips.db.test.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_GUILD_ID,
  fakeAutocomplete,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../test/support/fake-interactions.js';
import { WEST_CHANNEL } from '../../test/support/gyms.js';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { ALICE, BOB, CAROL, PARTY_NOW } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import { fixtureForms } from '../../test/support/wants.js';
import { AccessGrantRepository } from '../db/repositories/access-grant-repository.js';
import { GuildRepository } from '../db/repositories/guild-repository.js';
import { GymNotificationRepository } from '../db/repositories/gym-notification-repository.js';
import { NewTrainRepository } from '../db/repositories/new-train-repository.js';
import { PartyRepository } from '../db/repositories/party-repository.js';
import { PokemonNotificationRepository } from '../db/repositories/pokemon-notification-repository.js';
import { RowIds } from '../db/repositories/row-ids.js';
import { UserRepository } from '../db/repositories/user-repository.js';
import type { DB } from '../db/types.js';
import { InteractionRouter } from '../discord/router.js';
import { pokemonTarget } from '../domain/pogo/notification-target.js';
import type { GymAdminService } from '../services/gym-admin-service.js';
import { gym } from './gyms/index.js';
import { target, targetControls, untarget } from './notifications/targets.js';
import { unwant, want, wants as wantsCommand } from './notifications/wants.js';
import { wildCommand } from './notifications/wild.js';
import { raid, raidControls } from './raids/raid.js';
import { settings } from './settings/settings.js';

/**
 * How often a command goes to the database, counted on the real tables (plan 4F, after the
 * staging of Phase 4 measured 0.6 to 0.7 s for every command that touches it). Every statement
 * Kysely sends is a round trip, `begin` and `commit` included. One costs well under a
 * millisecond against this container, so the time that was measured is not spent here: a
 * command with one statement was as slow as one with eight. The counts are pinned all the
 * same: a round trip costs more over a network, and what was plainly waste (the row ids of the
 * server and the member, asked for before every statement) is gone and should stay gone.
 *
 * The numbers are upper bounds: a change that needs fewer is welcome, one that needs more must
 * say why here.
 */
describe('round trips to the database per command', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  /** The statements since they were last cleared, as Kysely sent them. */
  const statements: string[] = [];

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase({
      log: (event) => {
        statements.push(event.query.sql);
      },
    }));
    await sql`insert into Guild (id, snowflake) values (1, ${FAKE_GUILD_ID})`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788)`.execute(
      db,
    );
    await sql`insert into Region (id, guildId, channelId) values (2, 1, 1234567890123456789)`.execute(
      db,
    );
    await sql`insert into Gym (id, name) values (1, 'Library'), (2, 'Fountain')`.execute(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
    for (const table of ['Party', 'PartyAccessGrant', 'PokemonNotification', 'GymNotification']) {
      await sql`delete from ${sql.table(table)}`.execute(db);
    }
    await db.deleteFrom('User').execute();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * The bot over the real tables: every repository a command reaches is the real one, built as
   * `src/app.ts` builds them, over one memory of the rows the process has seen (`RowIds`).
   */
  async function bot() {
    const rowIds = new RowIds();
    const users = new UserRepository(db, rowIds);
    const guilds = new GuildRepository(db, rowIds);
    const wants = new PokemonNotificationRepository(db, fixtureForms(), rowIds);
    const gymTargets = new GymNotificationRepository(db, rowIds);
    const newTrains = new NewTrainRepository(db);
    const made = await partyServiceWith(
      [],
      { users, guilds, notifying: { users, guilds, wants, gymTargets, newTrains } },
      { database: new PartyRepository(db), grants: new AccessGrantRepository(db) },
    );
    const { ctx } = createTestContext({
      users,
      guilds,
      wants,
      gymTargets,
      newTrains,
      partyService: made.service,
      attendance: made.attendance,
      raids: made.raids,
      parties: made.store,
      regions: made.regions,
      spawns: made.spawns,
      // Every gym is within reach: what is counted is the look for the server's row.
      gymAdmin: { mayTouch: () => true } as unknown as GymAdminService,
    });
    const router = new InteractionRouter(
      ctx,
      [settings, want, unwant, wantsCommand, target, untarget, wildCommand, raid, gym],
      [targetControls, raidControls],
    );
    /** Everything that goes on beside the answer: the post, its copies, who is told. */
    const settle = async () => {
      await made.service.flush();
      await made.attendance.flush();
      await made.access.flush();
      await made.notify.flush();
    };
    /**
     * Uses a command and counts the statements: `answered` when the member has their answer,
     * `settled` when everything that follows from it is done as well.
     */
    const counted = async (interaction: FakeInteraction) => {
      await settle();
      statements.length = 0;
      await router.handle(interaction as never);
      const answered = statements.length;
      await settle();
      return { answered, settled: statements.length };
    };
    const command = (
      userId: string,
      commandName: string,
      options: Record<string, string | boolean> = {},
      subcommand?: string,
    ) =>
      fakeChatInput({
        commandName,
        ...(subcommand === undefined ? {} : { subcommand }),
        userId,
        channelId: WEST_CHANNEL,
        displayName: 'Trainer',
        options,
      });
    const typing = (
      userId: string,
      commandName: string,
      focusedName: string,
      focused: string,
      extra: object = {},
    ) =>
      fakeAutocomplete({
        commandName,
        userId,
        channelId: WEST_CHANNEL,
        focusedName,
        focused,
        ...extra,
      });
    return { ...made, ctx, router, counted, command, typing, wants, gymTargets, users };
  }

  it('uses the connections of the pool again, and says what a round trip costs here', async () => {
    const times: number[] = [];
    const connections = new Set<unknown>();
    for (let n = 0; n < 50; n++) {
      const started = performance.now();
      const answer = await sql<{ id: unknown }>`select connection_id() as id`.execute(db);
      times.push(performance.now() - started);
      connections.add(String(answer.rows[0]?.id));
    }
    // Fifty queries one after the other: never more connections than the pool keeps (ten),
    // where a connection made for every query would be fifty.
    expect(connections.size).toBeLessThanOrEqual(10);
    // The time is printed, not pinned: it is the machine's.
    times.sort((a, b) => a - b);
    process.stdout.write(`a round trip here: ${(times[25] ?? 0).toFixed(2)} ms (median of 50)\n`);
  });

  it('sends the pool no more statements than these for each command', async () => {
    const made = await bot();
    const measured: Record<string, { answered: number; settled: number }> = {};
    /**
     * Uses a command, counts, and makes sure it did its work: a use that was refused sends no
     * statement and would meet any bound. A command was deferred and answered by the edit of
     * that answer, with neither a refusal (`reply`) nor an error after it (`followUp`).
     */
    const use = async (name: string, interaction: FakeInteraction): Promise<string> => {
      measured[name] = await made.counted(interaction);
      expect(interaction.deferReply, name).toHaveBeenCalledTimes(1);
      expect(interaction.reply, name).not.toHaveBeenCalled();
      expect(interaction.followUp, name).not.toHaveBeenCalled();
      expect(interaction.editReply, name).toHaveBeenCalledTimes(1);
      const answer = sent(interaction.editReply);
      return answer.content ?? JSON.stringify(answer.embeds);
    };
    /** Types into an option, counts, and gives the names of the choices that were offered. */
    const type = async (name: string, interaction: FakeInteraction): Promise<string[]> => {
      measured[name] = await made.counted(interaction);
      expect(interaction.respond, name).toHaveBeenCalledTimes(1);
      const choices = interaction.respond.mock.calls[0]?.[0] ?? [];
      return choices.map((choice) => choice.name);
    };
    /** A member's rows of a table that hangs on their `User` row, as `[column value]`. */
    const wantsOf = async (member: string) =>
      (
        await db
          .selectFrom('PokemonNotification as n')
          .innerJoin('User as u', 'u.id', 'n.userId')
          .select('n.pokemon')
          .where('u.userSnowflake', '=', member)
          .orderBy('n.id')
          .execute()
      ).map((row) => row.pokemon);
    const gymsOf = async (member: string) =>
      (
        await db
          .selectFrom('GymNotification as n')
          .innerJoin('User as u', 'u.id', 'n.userId')
          .select(['n.gym', 'n.guildId'])
          .where('u.userSnowflake', '=', member)
          .execute()
      ).map((row) => [row.gym, row.guildId]);
    // Alice first: with her the process sees the server's row. Bob is who is counted.
    for (const member of [ALICE, BOB]) {
      const { command, typing } = made;
      await use('/settings mentions', command(member, 'settings', { enabled: false }, 'mentions'));
      const row = await db
        .selectFrom('User')
        .select('mentions')
        .where('userSnowflake', '=', member)
        .executeTakeFirst();
      expect(row).toEqual({ mentions: 0 });
      const shown = await use('/settings show', command(member, 'settings', {}, 'show'));
      expect(shown).toContain('- Pings in posts: **off**');
      expect(await use('/want', command(member, 'want', { target: 'pokemon:147' }))).toContain(
        'a Dratini raid or a wild Dratini',
      );
      expect(await wantsOf(member)).toEqual([147]);
      await use('/want, a second', command(member, 'want', { target: 'pokemon:150' }));
      expect(await wantsOf(member)).toEqual([147, 150]);
      expect(await type('/unwant, typing', typing(member, 'unwant', 'target', 'dra'))).toEqual([
        'Dratini · raids and spawns',
      ]);
      const listed = await use('/wants', command(member, 'wants'));
      expect(listed).toContain('Dratini');
      expect(listed).toContain('Mewtwo (every form)');
      expect(await type('/target, typing', typing(member, 'target', 'gym', 'lib'))).toContain(
        'Pinewood Public Library · The Stacks',
      );
      expect(await use('/target', command(member, 'target', { gym: 'g:1' }))).toContain(
        'is one of your gyms now',
      );
      expect(await gymsOf(member)).toEqual([['1', 1]]);
      expect(await type('/untarget, typing', typing(member, 'untarget', 'gym', 'lib'))).toEqual([
        'Pinewood Public Library · The Stacks',
      ]);
      const reports = made.gateway.messagesIn(WEST_CHANNEL).length;
      expect(
        await use(
          '/wild',
          command(member, 'wild', { pokemon: 'dratini', details: 'by the fountain' }),
        ),
      ).toContain('Reported: a wild Dratini.');
      const posted = made.gateway.messagesIn(WEST_CHANNEL);
      expect(posted).toHaveLength(reports + 1);
      expect(posted.at(-1)?.message.content).toContain('A wild **Dratini** has been reported');
      // The staff member was let in, and the list has the Library.
      const staff = typing(member, 'gym', 'gym', 'lib', {
        subcommand: 'show',
        roleNames: ['Admin'],
      });
      expect((await type('/gym show, typing', staff)).join()).toContain('Pinewood Public Library');
    }
    // Carol wants the boss of the raid that is reported next: somebody is to be told.
    await made.wants.set(CAROL, FAKE_GUILD_ID, pokemonTarget(717), 'both');
    expect(
      await use('/raid', made.command(BOB, 'raid', { boss: 'b:yveltal:T5:0', gym: 'g:2' })),
    ).toContain('Reported: ');
    const raids = await db.selectFrom('Party').select(['type', 'gymId', 'status']).execute();
    expect(raids).toEqual([{ type: 'raid', gymId: 2, status: 'active' }]);
    expect(raids.length).toBe(made.store.active().length);
    // Carol was told of it, which is what the two reads on the side were for.
    expect(made.dms.recipients).toContain(CAROL);
    process.stdout.write(
      `${Object.entries(measured)
        .map(([name, { answered, settled }]) => `${name}: ${String(answered)} / ${String(settled)}`)
        .join('\n')}\n`,
    );

    // Until the member is answered, and until everything that follows is done.
    const limits: Record<string, { answered: number; settled: number }> = {
      // One statement: the row is written, or made, in one.
      '/settings mentions': { answered: 1, settled: 1 },
      // The settings, the new-train row, the member's wants and their gyms: one read each.
      '/settings show': { answered: 4, settled: 4 },
      // begin, the lock on the member's row, their rows, the insert, commit.
      '/want': { answered: 5, settled: 5 },
      '/want, a second': { answered: 5, settled: 5 },
      // The member's rows, and nothing else: on every keystroke.
      '/unwant, typing': { answered: 1, settled: 1 },
      '/wants': { answered: 1, settled: 1 },
      // The gyms are in memory, and so is the row of the server.
      '/target, typing': { answered: 0, settled: 0 },
      '/target': { answered: 5, settled: 5 },
      '/untarget, typing': { answered: 1, settled: 1 },
      // The report is a message; who wants the Pokémon is read on the side, in one query.
      '/wild': { answered: 0, settled: 1 },
      '/gym show, typing': { answered: 0, settled: 0 },
      // The reporter's settings, the party's row, and its post and its link line written to it
      // as each exists; on the side, who wants the boss and who the gym.
      '/raid': { answered: 4, settled: 6 },
    };
    expect(Object.keys(measured).sort()).toEqual(Object.keys(limits).sort());
    for (const [name, limit] of Object.entries(limits)) {
      expect(measured[name]?.answered, `${name}, answered`).toBeLessThanOrEqual(limit.answered);
      expect(measured[name]?.settled, `${name}, settled`).toBeLessThanOrEqual(limit.settled);
    }
    // Before plan 4F these were 8 for `/settings show`, 7 for `/want`, 8 for `/target`, 3 for
    // each list of a member's own and 1 for every keystroke of `/target`.
  });

  it('asks once for a row it has not seen, and makes a member’s row inside the transaction', async () => {
    const made = await bot();
    // The first want of a member without a row, in a server this process has not seen: the
    // looks for both rows, then begin, the member's row, the lock, the rows, the insert, commit.
    const first = await made.counted(made.command(ALICE, 'want', { target: 'pokemon:147' }));
    expect(first.settled).toBeLessThanOrEqual(8);
    // The first want of another member: only the look for their row comes before.
    const second = await made.counted(made.command(BOB, 'want', { target: 'pokemon:147' }));
    expect(second.settled).toBeLessThanOrEqual(7);
    // From then on nothing is asked twice.
    const third = await made.counted(made.command(BOB, 'want', { target: 'pokemon:150' }));
    expect(third.settled).toBeLessThanOrEqual(5);
    expect(await made.wants.count(BOB, FAKE_GUILD_ID)).toBe(2);
    // A member without a row has nothing to list: the look for their row is all there is, and
    // it is made again the next time (a row that is missing is never remembered).
    for (let n = 0; n < 2; n++) {
      const typed = await made.counted(made.typing(CAROL, 'unwant', 'target', 'dra'));
      expect(typed.settled).toBe(1);
    }
  });
});
```

Create `src/db/repositories/member-rows.db.test.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { GuildRepository } from './guild-repository.js';
import { findMemberInGuild, withMemberLocked } from './member-rows.js';
import { RowIds } from './row-ids.js';
import { UserRepository } from './user-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';

/** The rows of `User` and `Guild` with the process's memory of them (`RowIds`, plan 4F). */
describe('member rows with a memory of the rows that were seen', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  /** The statements since they were last cleared. */
  const statements: string[] = [];

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase({
      log: (event) => {
        statements.push(event.query.sql);
      },
    }));
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('GymNotification').execute();
    await db.deleteFrom('User').execute();
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME})`.execute(db);
    statements.length = 0;
  });

  /** A change that adds one gym target, as a repository would. */
  const addTarget = (ids: RowIds | undefined, memberId = ALICE, guildId = HOME, gym = '1') =>
    withMemberLocked(
      db,
      memberId,
      guildId,
      true,
      async (trx, member) => {
        if (!member) throw new Error('no member');
        await trx
          .insertInto('GymNotification')
          .values({ ...member, gym })
          .execute();
        return member;
      },
      ids,
    );
  const targets = () => db.selectFrom('GymNotification').select(['userId', 'gym']).execute();

  it('asks for both rows every time without a memory, as it always did', async () => {
    await addTarget(undefined);
    statements.length = 0;
    await addTarget(undefined, ALICE, HOME, '2');
    // The member's row, the server's, begin, the lock, the insert, commit.
    expect(statements).toHaveLength(6);
    statements.length = 0;
    expect(await findMemberInGuild(db, ALICE, HOME)).toBeDefined();
    expect(statements).toHaveLength(2);
  });

  it('asks for a row once with a memory, and then only locks the member’s', async () => {
    const ids = new RowIds();
    const first = await addTarget(ids);
    // The look for the member's row, the server's, begin, the member's row, the lock, the
    // insert, commit.
    expect(statements).toHaveLength(7);
    expect(ids.user(ALICE)).toBe(first.userId);
    expect(ids.guild(HOME)).toBe(1);
    statements.length = 0;
    expect(await addTarget(ids, ALICE, HOME, '2')).toEqual(first);
    expect(statements.map((statement) => statement.split(' ')[0])).toEqual([
      'begin',
      'select',
      'insert',
      'commit',
    ]);
    // The lock is still taken, by the snowflake, whatever is remembered.
    expect(statements[1]).toContain('for update');
    statements.length = 0;
    expect(await findMemberInGuild(db, ALICE, HOME, ids)).toEqual(first);
    expect(statements).toEqual([]);
  });

  it('never remembers a row that is missing', async () => {
    const ids = new RowIds();
    expect(await findMemberInGuild(db, BOB, HOME, ids)).toBeUndefined();
    expect(await findMemberInGuild(db, BOB, AWAY, ids)).toBeUndefined();
    const userId = await new UserRepository(db).ensure(BOB);
    // Found at once, though it was looked for in vain a moment ago.
    expect(await findMemberInGuild(db, BOB, HOME, ids)).toEqual({ userId, guildId: 1 });
    expect(await findMemberInGuild(db, BOB, AWAY, ids)).toBeUndefined();
    const away = await new GuildRepository(db).ensure(AWAY);
    expect(await findMemberInGuild(db, BOB, AWAY, ids)).toEqual({ userId, guildId: away });
  });

  it('does not remember the row of a member whose first change failed', async () => {
    const ids = new RowIds();
    await expect(
      withMemberLocked(db, ALICE, HOME, true, () => Promise.reject(new Error('no')), ids),
    ).rejects.toThrow('no');
    // The row was made inside the transaction and went with it.
    expect(await db.selectFrom('User').selectAll().execute()).toEqual([]);
    expect(ids.user(ALICE)).toBeUndefined();
    const member = await addTarget(ids);
    expect(ids.user(ALICE)).toBe(member.userId);
  });

  it('forgets a member’s row that is gone after all, and makes the change as for a new member', async () => {
    const ids = new RowIds();
    const before = await addTarget(ids);
    // Deleted behind the bot's back: nothing in either bot does this, but a hand might.
    await db.deleteFrom('User').execute();
    expect(await targets()).toEqual([]);
    const after = await addTarget(ids);
    expect(after.userId).not.toBe(before.userId);
    expect(await targets()).toEqual([{ userId: after.userId, gym: '1' }]);
    expect(ids.user(ALICE)).toBe(after.userId);
    // Without `create` there is then simply nothing to change.
    await db.deleteFrom('User').execute();
    const seen = await withMemberLocked(
      db,
      ALICE,
      HOME,
      false,
      (_trx, member) => Promise.resolve(member),
      ids,
    );
    expect(seen).toBeUndefined();
    expect(ids.user(ALICE)).toBeUndefined();
  });

  it('forgets a server whose row was deleted behind the process, and makes the change on its new row', async () => {
    const ids = new RowIds();
    await addTarget(ids);
    expect(ids.guild(HOME)).toBe(1);
    // The legacy bot left the server and came back: the row is another, with another id.
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (7, ${HOME})`.execute(db);
    expect(await targets()).toEqual([]);
    // The write fails the foreign key on the remembered id, and is made once more.
    const again = await addTarget(ids);
    expect(again.guildId).toBe(7);
    expect(ids.guild(HOME)).toBe(7);
    expect(ids.guildSnowflake(1)).toBeUndefined();
    expect(await db.selectFrom('GymNotification').select(['guildId', 'gym']).execute()).toEqual([
      { guildId: 7, gym: '1' },
    ]);
    // Deleted and not made again: the change makes the row, as it always did.
    await db.deleteFrom('Guild').execute();
    const made = await addTarget(ids, ALICE, HOME, '2');
    expect(made.guildId).not.toBe(7);
    expect(ids.guild(HOME)).toBe(made.guildId);
    // Without `create` there is nothing to change in a server that has no row.
    await db.deleteFrom('Guild').execute();
    const seen = await withMemberLocked(
      db,
      ALICE,
      HOME,
      false,
      async (trx, member) => {
        if (member)
          await trx
            .insertInto('GymNotification')
            .values({ ...member, gym: '3' })
            .execute();
        return member;
      },
      ids,
    );
    expect(seen).toBeUndefined();
    expect(ids.guild(HOME)).toBeUndefined();
  });

  it('does not take another failure of the work for a missing server, nor one on an id it just read', async () => {
    const ids = new RowIds();
    await addTarget(ids);
    let runs = 0;
    await expect(
      withMemberLocked(
        db,
        ALICE,
        HOME,
        true,
        () => {
          runs += 1;
          return Promise.reject(new Error('no'));
        },
        ids,
      ),
    ).rejects.toThrow('no');
    expect(runs).toBe(1);
    expect(ids.guild(HOME)).toBe(1);
    // A foreign key that fails for another reason, with nothing remembered: once, and thrown.
    runs = 0;
    await expect(
      withMemberLocked(
        db,
        ALICE,
        HOME,
        true,
        async (trx, member) => {
          runs += 1;
          await trx
            .insertInto('GymNotification')
            .values({ userId: member?.userId ?? 0, guildId: 999, gym: '1' })
            .execute();
        },
        new RowIds(),
      ),
    ).rejects.toMatchObject({ errno: 1452 });
    expect(runs).toBe(1);
  });

  it('makes one row of two first changes of one member at once, and remembers it', async () => {
    const ids = new RowIds();
    const [first, second] = await Promise.all([
      addTarget(ids, ALICE, HOME, '1'),
      addTarget(ids, ALICE, HOME, '2'),
    ]);
    expect(first.userId).toBe(second.userId);
    const users = await db.selectFrom('User').select('id').execute();
    expect(users).toEqual([{ id: first.userId }]);
    expect(ids.user(ALICE)).toBe(first.userId);
    expect((await targets()).map((row) => row.gym).sort()).toEqual(['1', '2']);
    // And two members at once in a server nobody has seen.
    await db.deleteFrom('GymNotification').execute();
    await db.deleteFrom('Guild').execute();
    const fresh = new RowIds();
    const both = await Promise.all([
      addTarget(fresh, ALICE, AWAY, '1'),
      addTarget(fresh, BOB, AWAY, '1'),
    ]);
    expect(both[0].guildId).toBe(both[1].guildId);
    expect(await db.selectFrom('Guild').select('id').execute()).toEqual([{ id: both[0].guildId }]);
    expect(fresh.guild(AWAY)).toBe(both[0].guildId);
  });

  it('remembers nothing inside a caller’s transaction, also when it makes the change once more', async () => {
    const ids = new RowIds();
    // A new member and a new server, in a transaction that is rolled back.
    await expect(
      db.transaction().execute(async (trx) => {
        await withMemberLocked(
          trx,
          BOB,
          AWAY,
          true,
          async (inner, member) => {
            if (!member) throw new Error('no member');
            await inner
              .insertInto('GymNotification')
              .values({ ...member, gym: '1' })
              .execute();
          },
          ids,
        );
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');
    expect(ids.user(BOB)).toBeUndefined();
    expect(ids.guild(AWAY)).toBeUndefined();
    expect(await db.selectFrom('User').selectAll().execute()).toEqual([]);
    expect(await findMemberInGuild(db, BOB, AWAY, ids)).toBeUndefined();

    // A member who is remembered wrongly: forgotten, the change made, and not remembered anew.
    const before = await addTarget(ids);
    await db.deleteFrom('User').execute();
    const inside = await db
      .transaction()
      .execute((trx) =>
        withMemberLocked(trx, ALICE, HOME, true, (_inner, member) => Promise.resolve(member), ids),
      );
    expect(inside?.userId).not.toBe(before.userId);
    expect(ids.user(ALICE)).toBeUndefined();

    // A server that is remembered wrongly: forgotten, but the change is not made once more.
    // What the work wrote before it failed is still in the caller's transaction, and a
    // second run would write it again.
    await addTarget(ids);
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (9, ${HOME})`.execute(db);
    await sql`create table if not exists WorkLog (note varchar(20) not null)`.execute(db);
    await sql`delete from WorkLog`.execute(db);
    let runs = 0;
    const change = (inner: Kysely<DB>) =>
      withMemberLocked(
        inner,
        ALICE,
        HOME,
        true,
        async (trx, member) => {
          if (!member) throw new Error('no member');
          runs += 1;
          // A write that succeeds, then the one that fails the foreign key.
          await sql`insert into WorkLog (note) values ('ran')`.execute(trx);
          await trx
            .insertInto('GymNotification')
            .values({ ...member, gym: '4' })
            .execute();
          return member;
        },
        ids,
      );
    // The caller goes on after the failure and commits: the first run's write is there once.
    await db.transaction().execute(async (trx) => {
      await expect(change(trx)).rejects.toMatchObject({ errno: 1452 });
    });
    expect(runs).toBe(1);
    expect(ids.guild(HOME)).toBeUndefined();
    const logged = await sql<{ note: string }>`select note from WorkLog`.execute(db);
    expect(logged.rows).toEqual([{ note: 'ran' }]);
    expect(await db.selectFrom('GymNotification').selectAll().execute()).toEqual([]);
    // The caller's next try reads the row as it is; nothing is remembered from inside it.
    const moved = await db.transaction().execute((trx) => change(trx));
    expect(moved.guildId).toBe(9);
    expect(runs).toBe(2);
    expect(ids.guild(HOME)).toBeUndefined();
    expect(await db.selectFrom('GymNotification').select(['guildId', 'gym']).execute()).toEqual([
      { guildId: 9, gym: '4' },
    ]);
    await sql`drop table WorkLog`.execute(db);
  });

  it('gives the repositories of a process one memory: a row one of them read is known to all', async () => {
    const ids = new RowIds();
    const users = new UserRepository(db, ids);
    const guilds = new GuildRepository(db, ids);
    await users.update(ALICE, { mentions: false });
    // Reading the settings is seeing the row.
    await users.get(ALICE);
    expect(await guilds.idFor(HOME)).toBe(1);
    statements.length = 0;
    expect(await findMemberInGuild(db, ALICE, HOME, ids)).toEqual({
      userId: await users.idFor(ALICE),
      guildId: 1,
    });
    expect(await guilds.idFor(HOME)).toBe(1);
    expect(await guilds.snowflakeOf(1)).toBe(HOME);
    expect(statements).toEqual([]);
  });

  it('puts the memory right in ensure, which never trusts it', async () => {
    const ids = new RowIds();
    const guilds = new GuildRepository(db, ids);
    expect(await guilds.idFor(HOME)).toBe(1);
    // Deleted and made again behind the process: the memory still has the old id.
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (5, ${HOME})`.execute(db);
    expect(await guilds.idFor(HOME)).toBe(1);
    expect(await guilds.snowflakeOf(1)).toBe(HOME);
    statements.length = 0;
    expect(await guilds.ensure(HOME)).toBe(5);
    // It wrote and read, whatever it remembered.
    expect(statements.map((statement) => statement.split(' ')[0])).toEqual(['insert', 'select']);
    expect(await guilds.idFor(HOME)).toBe(5);
    expect(await guilds.snowflakeOf(5)).toBe(HOME);
    expect(ids.guildSnowflake(1)).toBeUndefined();
    // Deleted and not made again: ensure makes it.
    await db.deleteFrom('Guild').execute();
    const made = await guilds.ensure(HOME);
    expect(made).not.toBe(5);
    expect(ids.guild(HOME)).toBe(made);
  });

  it('forgets a server whose row the bot deletes, and takes its new row when it comes back', async () => {
    const ids = new RowIds();
    const guilds = new GuildRepository(db, ids);
    const first = await guilds.ensure(AWAY);
    expect(ids.guild(AWAY)).toBe(first);
    await guilds.remove(AWAY);
    expect(ids.guild(AWAY)).toBeUndefined();
    expect(ids.guildSnowflake(first)).toBeUndefined();
    expect(await guilds.idFor(AWAY)).toBeUndefined();
    expect(await guilds.snowflakeOf(first)).toBeUndefined();
    const second = await guilds.ensure(AWAY);
    expect(second).not.toBe(first);
    expect(await guilds.idFor(AWAY)).toBe(second);
    expect(await guilds.snowflakeOf(second)).toBe(AWAY);
  });
});
```

Create `src/db/repositories/row-ids.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RowIds } from './row-ids.js';

describe('RowIds', () => {
  it('remembers the rows it saw, a server both ways', () => {
    const ids = new RowIds();
    expect(ids.guild('g1')).toBeUndefined();
    expect(ids.user('u1')).toBeUndefined();
    ids.sawGuild('g1', 7);
    ids.sawUser('u1', 42);
    expect(ids.guild('g1')).toBe(7);
    expect(ids.guildSnowflake(7)).toBe('g1');
    expect(ids.user('u1')).toBe(42);
    expect(ids.guild('g2')).toBeUndefined();
    expect(ids.guildSnowflake(8)).toBeUndefined();
  });

  it('forgets a server both ways, and a member', () => {
    const ids = new RowIds();
    ids.sawGuild('g1', 7);
    ids.sawUser('u1', 42);
    ids.forgetGuild('g1');
    ids.forgetUser('u1');
    expect(ids.guild('g1')).toBeUndefined();
    expect(ids.guildSnowflake(7)).toBeUndefined();
    expect(ids.user('u1')).toBeUndefined();
    // Forgetting what was never seen is nothing.
    ids.forgetGuild('g9');
    ids.forgetUser('u9');
  });

  it('drops the old id of a server that is seen with a new one, without being told to forget', () => {
    const ids = new RowIds();
    ids.sawGuild('g1', 7);
    // Deleted and made again behind the process (the legacy bot left and rejoined).
    ids.sawGuild('g1', 8);
    expect(ids.guild('g1')).toBe(8);
    expect(ids.guildSnowflake(8)).toBe('g1');
    expect(ids.guildSnowflake(7)).toBeUndefined();
    // Seen again with the same id: nothing is dropped.
    ids.sawGuild('g1', 8);
    expect(ids.guildSnowflake(8)).toBe('g1');
  });

  it('takes the newer id of a server whose row was made again', () => {
    const ids = new RowIds();
    ids.sawGuild('g1', 7);
    ids.forgetGuild('g1');
    ids.sawGuild('g1', 8);
    expect(ids.guild('g1')).toBe(8);
    expect(ids.guildSnowflake(8)).toBe('g1');
    expect(ids.guildSnowflake(7)).toBeUndefined();
  });

  it('holds a bounded number of members: the one seen longest ago goes first', () => {
    const ids = new RowIds();
    for (let n = 0; n <= 20_000; n++) ids.sawUser(`u${String(n)}`, n);
    expect(ids.user('u0')).toBeUndefined();
    expect(ids.user('u1')).toBe(1);
    expect(ids.user('u20000')).toBe(20_000);
  });

  it('remembers nothing when it is the one a repository has by default', () => {
    RowIds.none.sawGuild('g1', 7);
    RowIds.none.sawUser('u1', 42);
    expect(RowIds.none.guild('g1')).toBeUndefined();
    expect(RowIds.none.guildSnowflake(7)).toBeUndefined();
    expect(RowIds.none.user('u1')).toBeUndefined();
  });
});
```

Apply to `test/support/migrated-db.ts`:

```diff
--- a/test/support/migrated-db.ts
+++ b/test/support/migrated-db.ts
@@ -1,18 +1,21 @@
-import type { Kysely } from 'kysely';
+import type { Kysely, LogConfig } from 'kysely';
 import { pino } from 'pino';
 import { createDb } from '../../src/db/kysely.js';
 import { runMigrations } from '../../src/db/migrator.js';
 import type { DB } from '../../src/db/types.js';
 import { startDatabase, type TestDatabase } from './mysql.js';
 
-/** A throwaway MySQL holding the legacy schema with every Kysely migration applied. */
-export async function startMigratedDatabase(): Promise<{
+/**
+ * A throwaway MySQL holding the legacy schema with every Kysely migration applied. `log` hears
+ * of every statement sent through `db` (the migrations' own included).
+ */
+export async function startMigratedDatabase(options: { log?: LogConfig } = {}): Promise<{
   database: TestDatabase;
   db: Kysely<DB>;
   stop: () => Promise<void>;
 }> {
   const database = await startDatabase({ legacySchema: true });
-  const db = createDb<DB>(database.config);
+  const db = createDb<DB>(database.config, options.log);
   await runMigrations(db, pino({ level: 'silent' }));
   return {
     database,
```

Run: `npx vitest run --project unit src/db/repositories/row-ids.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -18,6 +18,7 @@ import { PokemonNotificationRepository } from './db/repositories/pokemon-notific
 import { PokemonRepository } from './db/repositories/pokemon-repository.js';
 import { RaidBossRepository } from './db/repositories/raid-boss-repository.js';
 import { RegionRepository } from './db/repositories/region-repository.js';
+import { RowIds } from './db/repositories/row-ids.js';
 import { SavedRouteRepository } from './db/repositories/saved-route-repository.js';
 import { SelfRoleRepository } from './db/repositories/self-role-repository.js';
 import { UnownGiftRepository } from './db/repositories/unown-gift-repository.js';
@@ -146,8 +147,11 @@ export async function startApp(
     storage: new AccessGrantRepository(db),
     log,
   });
-  const guilds = new GuildRepository(db);
-  const users = new UserRepository(db);
+  // One memory of the `Guild` and `User` rows this process has seen, for the repositories that
+  // would otherwise ask for a row id before every statement (plan 4F).
+  const rowIds = new RowIds();
+  const guilds = new GuildRepository(db, rowIds);
+  const users = new UserRepository(db, rowIds);
   const savedRoutes = new SavedRouteRepository(db);
   const partyService = new PartyService({
     store: parties,
@@ -166,8 +170,9 @@ export async function startApp(
   const wants = new PokemonNotificationRepository(
     db,
     formReader(() => gameData.catalogue),
+    rowIds,
   );
-  const gymTargets = new GymNotificationRepository(db);
+  const gymTargets = new GymNotificationRepository(db, rowIds);
   const newTrains = new NewTrainRepository(db);
   // Made after the party service, whose embeds it sends, and told by it from here on.
   const notify = new NotifyService({
```

Apply to `src/db/kysely.ts`:

```diff
--- a/src/db/kysely.ts
+++ b/src/db/kysely.ts
@@ -1,4 +1,4 @@
-import { Kysely, MysqlDialect } from 'kysely';
+import { Kysely, MysqlDialect, type LogConfig } from 'kysely';
 import { createPool } from 'mysql2';
 import type { DbConfig } from './db-config.js';
 
@@ -8,9 +8,14 @@ import type { DbConfig } from './db-config.js';
  * how to turn a JavaScript `Date` into DATETIME text and back (as UTC, whatever zone the machine
  * is in); it does not set the session's `time_zone`, so `NOW()` and TIMESTAMP columns would still
  * be in the server's zone. The bot's own columns hold epoch milliseconds and need neither.
+ *
+ * The pool keeps up to ten connections open and hands them out again: a query does not make a
+ * connection of its own. `log` hears of every statement Kysely sends, `begin` and `commit`
+ * included (a test counts the round trips of a command with it).
  */
-export function createDb<Schema>(config: DbConfig): Kysely<Schema> {
+export function createDb<Schema>(config: DbConfig, log?: LogConfig): Kysely<Schema> {
   return new Kysely<Schema>({
+    ...(log === undefined ? {} : { log }),
     dialect: new MysqlDialect({
       pool: createPool({
         ...config,
```

Apply to `src/db/repositories/guild-repository.ts`:

```diff
--- a/src/db/repositories/guild-repository.ts
+++ b/src/db/repositories/guild-repository.ts
@@ -1,5 +1,6 @@
 import type { Kysely } from 'kysely';
 import type { DB } from '../types.js';
+import { RowIds } from './row-ids.js';
 
 /** What guild syncing needs; lets tests use an in-memory fake. */
 export interface GuildStore {
@@ -8,42 +9,74 @@ export interface GuildStore {
   remove(snowflake: string): Promise<void>;
 }
 
-/** The Guild table: one row per Discord server the bot is in. */
+/**
+ * The Guild table: one row per Discord server the bot is in. With `ids` (the process's memory
+ * of rows it has seen) a server's row id is asked for once. The row can be deleted behind this
+ * process (the legacy bot does when it leaves a server), so `ensure` never trusts the memory:
+ * it is what puts it right (`RowIds`).
+ */
 export class GuildRepository implements GuildStore {
-  constructor(private readonly db: Kysely<DB>) {}
+  constructor(
+    private readonly db: Kysely<DB>,
+    private readonly ids: RowIds = RowIds.none,
+  ) {}
 
+  /**
+   * Always writes and reads, whatever is remembered: this runs for every server at each start
+   * and when the bot joins one, and is where a row that was deleted and made again behind the
+   * process gets its new id into the memory.
+   */
   async ensure(snowflake: string): Promise<number> {
     await this.db
       .insertInto('Guild')
       .values({ snowflake })
       .onDuplicateKeyUpdate({ snowflake })
       .execute();
-    const id = await this.idFor(snowflake);
-    if (id === undefined) throw new Error(`Guild row for ${snowflake} vanished after insert`);
-    return id;
+    const row = await this.db
+      .selectFrom('Guild')
+      .select('id')
+      .where('snowflake', '=', snowflake)
+      .executeTakeFirst();
+    if (!row) {
+      this.ids.forgetGuild(snowflake);
+      throw new Error(`Guild row for ${snowflake} vanished after insert`);
+    }
+    if (!this.db.isTransaction) this.ids.sawGuild(snowflake, row.id);
+    return row.id;
   }
 
   /** Deleting a guild cascades to its regions, roles and notifications. */
   async remove(snowflake: string): Promise<void> {
+    // Forgotten before and after: a look-up that runs beside the deletion may see the row.
+    this.ids.forgetGuild(snowflake);
     await this.db.deleteFrom('Guild').where('snowflake', '=', snowflake).execute();
+    this.ids.forgetGuild(snowflake);
   }
 
   /** The snowflake of the server with this row id: parties and regions name a server by its row. */
   async snowflakeOf(id: number): Promise<string | undefined> {
+    const seen = this.ids.guildSnowflake(id);
+    if (seen !== undefined) return seen;
     const row = await this.db
       .selectFrom('Guild')
       .select('snowflake')
       .where('id', '=', id)
       .executeTakeFirst();
-    return row?.snowflake ?? undefined;
+    const snowflake = row?.snowflake ?? undefined;
+    if (snowflake !== undefined && !this.db.isTransaction) this.ids.sawGuild(snowflake, id);
+    return snowflake;
   }
 
+  /** The row id of a server; undefined (and asked again the next time) while it has no row. */
   async idFor(snowflake: string): Promise<number | undefined> {
+    const seen = this.ids.guild(snowflake);
+    if (seen !== undefined) return seen;
     const row = await this.db
       .selectFrom('Guild')
       .select('id')
       .where('snowflake', '=', snowflake)
       .executeTakeFirst();
+    if (row && !this.db.isTransaction) this.ids.sawGuild(snowflake, row.id);
     return row?.id;
   }
 }
```

Apply to `src/db/repositories/gym-notification-repository.ts`:

```diff
--- a/src/db/repositories/gym-notification-repository.ts
+++ b/src/db/repositories/gym-notification-repository.ts
@@ -1,6 +1,7 @@
 import type { Kysely } from 'kysely';
 import type { DB } from '../types.js';
 import { findMemberInGuild, withMemberLocked, type MemberInGuild } from './member-rows.js';
+import { RowIds } from './row-ids.js';
 
 /** A member's gym targets (the gyms of /target) in a server as the rows say them. */
 export interface GymTargetList {
@@ -104,7 +105,21 @@ export function rowsOfGymTarget(rows: readonly GymTargetRow[], gymId: number): n
  * known here: the commands ask `ctx.gyms`.
  */
 export class GymNotificationRepository implements GymTargetStorage, GymTargetUpkeep {
-  constructor(private readonly db: Kysely<DB>) {}
+  /** `ids` is the process's memory of `User` and `Guild` rows it has seen (`RowIds`). */
+  constructor(
+    private readonly db: Kysely<DB>,
+    private readonly ids: RowIds = RowIds.none,
+  ) {}
+
+  /** `withMemberLocked` over this repository's database and its memory of rows. */
+  private locked<T>(
+    memberId: string,
+    guildId: string,
+    create: boolean,
+    work: (trx: Kysely<DB>, member: MemberInGuild | undefined) => Promise<T>,
+  ): Promise<T> {
+    return withMemberLocked(this.db, memberId, guildId, create, work, this.ids);
+  }
 
   /** The member's rows of a server; a plain read (see `PokemonNotificationRepository.rows`). */
   private rows(db: Kysely<DB>, member: MemberInGuild): Promise<GymTargetRow[]> {
@@ -118,7 +133,7 @@ export class GymNotificationRepository implements GymTargetStorage, GymTargetUpk
   }
 
   async list(memberId: string, guildId: string): Promise<GymTargetList> {
-    const member = await findMemberInGuild(this.db, memberId, guildId);
+    const member = await findMemberInGuild(this.db, memberId, guildId, this.ids);
     if (!member) return { gymIds: [], unreadable: 0 };
     return readGymTargets(await this.rows(this.db, member));
   }
@@ -148,7 +163,7 @@ export class GymNotificationRepository implements GymTargetStorage, GymTargetUpk
   }
 
   async add(memberId: string, guildId: string, gymId: number): Promise<'added' | 'exists'> {
-    return withMemberLocked(this.db, memberId, guildId, true, async (trx, member) => {
+    return this.locked(memberId, guildId, true, async (trx, member) => {
       if (!member) throw new Error(`No rows for member ${memberId} in server ${guildId}`);
       // The oldest row of the gym stays; legacy duplicates of it go.
       const [kept, ...duplicates] = rowsOfGymTarget(await this.rows(trx, member), gymId);
@@ -165,7 +180,7 @@ export class GymNotificationRepository implements GymTargetStorage, GymTargetUpk
   }
 
   async remove(memberId: string, guildId: string, gymId: number): Promise<boolean> {
-    return withMemberLocked(this.db, memberId, guildId, false, async (trx, member) => {
+    return this.locked(memberId, guildId, false, async (trx, member) => {
       if (!member) return false;
       const ids = rowsOfGymTarget(await this.rows(trx, member), gymId);
       if (ids.length === 0) return false;
@@ -175,7 +190,7 @@ export class GymNotificationRepository implements GymTargetStorage, GymTargetUpk
   }
 
   async removeAll(memberId: string, guildId: string): Promise<number> {
-    return withMemberLocked(this.db, memberId, guildId, false, async (trx, member) => {
+    return this.locked(memberId, guildId, false, async (trx, member) => {
       if (!member) return 0;
       const result = await trx
         .deleteFrom('GymNotification')
```

Apply to `src/db/repositories/member-rows.ts`:

```diff
--- a/src/db/repositories/member-rows.ts
+++ b/src/db/repositories/member-rows.ts
@@ -1,6 +1,7 @@
 import type { Kysely } from 'kysely';
 import { inTransaction } from '../transaction.js';
 import type { DB } from '../types.js';
+import { RowIds } from './row-ids.js';
 
 /** The rows of `User` and `Guild` that a member's rows in a server hang on. */
 export interface MemberInGuild {
@@ -8,28 +9,58 @@ export interface MemberInGuild {
   guildId: number;
 }
 
+/** MySQL's `ER_NO_REFERENCED_ROW_2`: a row was hung on a parent row that does not exist. */
+const NO_REFERENCED_ROW = 1452;
+
+function isMissingParentRow(err: unknown): boolean {
+  return (
+    typeof err === 'object' && err !== null && 'errno' in err && err.errno === NO_REFERENCED_ROW
+  );
+}
+
+/** The id of a member's row, from what was seen (`ids`) or from the table; undefined when none. */
+async function userRow(db: Kysely<DB>, memberId: string, ids: RowIds): Promise<number | undefined> {
+  const seen = ids.user(memberId);
+  if (seen !== undefined) return seen;
+  const row = await db
+    .selectFrom('User')
+    .select('id')
+    .where('userSnowflake', '=', memberId)
+    .executeTakeFirst();
+  // A row read inside a caller's transaction may be one that transaction made and rolls back.
+  if (row && !db.isTransaction) ids.sawUser(memberId, row.id);
+  return row?.id;
+}
+
+/** The id of a server's row, from what was seen (`ids`) or from the table; undefined when none. */
+async function guildRow(db: Kysely<DB>, guildId: string, ids: RowIds): Promise<number | undefined> {
+  const seen = ids.guild(guildId);
+  if (seen !== undefined) return seen;
+  const row = await db
+    .selectFrom('Guild')
+    .select('id')
+    .where('snowflake', '=', guildId)
+    .executeTakeFirst();
+  if (row && !db.isTransaction) ids.sawGuild(guildId, row.id);
+  return row?.id;
+}
+
 /**
  * The row ids of a member and a server, without creating either and without a lock: for reading
  * what a member has in a server. Undefined when one of the two has no row, and the member has
- * nothing there then.
+ * nothing there then. With `ids` (the process's memory of rows it has seen) a row that is
+ * known is not asked for again: the read that follows is then the only round trip.
  */
 export async function findMemberInGuild(
   db: Kysely<DB>,
   memberId: string,
   guildId: string,
+  ids: RowIds = RowIds.none,
 ): Promise<MemberInGuild | undefined> {
-  const user = await db
-    .selectFrom('User')
-    .select('id')
-    .where('userSnowflake', '=', memberId)
-    .executeTakeFirst();
-  if (!user) return undefined;
-  const guild = await db
-    .selectFrom('Guild')
-    .select('id')
-    .where('snowflake', '=', guildId)
-    .executeTakeFirst();
-  return guild && { userId: user.id, guildId: guild.id };
+  const userId = await userRow(db, memberId, ids);
+  if (userId === undefined) return undefined;
+  const guild = await guildRow(db, guildId, ids);
+  return guild === undefined ? undefined : { userId, guildId: guild };
 }
 
 /**
@@ -55,6 +86,19 @@ export async function findMemberInGuild(
  * the repositories that use this are built over the pool. Inside a caller's transaction the
  * work would still be correct, but the first read would fix that transaction's view before the
  * member's lock is held.
+ *
+ * With `ids` (the process's memory of rows it has seen) the two looks before the transaction
+ * are skipped for rows that are known, which leaves the transaction itself: of a member's
+ * second change in a server nothing is asked twice. The member's row is locked by its
+ * snowflake all the same, so what is remembered of it decides only whether an insert is
+ * tried; when a remembered row turns out to be gone it is forgotten and the change runs once
+ * more as for a member who was never seen. The server's row is used by its remembered id; when
+ * that row is gone (the legacy bot deletes it on leaving a server, and the next one has
+ * another id), `work` fails the foreign key of whatever it hangs on the server (MySQL's error
+ * 1452): the server is then forgotten and the change runs once more, with the row as it is
+ * now, or made anew. Not inside a caller's transaction: there the first run's writes are not
+ * rolled back (there is no savepoint), so a second run would add to them; the server is
+ * forgotten and the failure is the caller's, whose next try reads the row.
  */
 export async function withMemberLocked<T>(
   db: Kysely<DB>,
@@ -62,18 +106,15 @@ export async function withMemberLocked<T>(
   guildId: string,
   create: boolean,
   work: (trx: Kysely<DB>, member: MemberInGuild | undefined) => Promise<T>,
+  ids: RowIds = RowIds.none,
 ): Promise<T> {
-  const known = await db
-    .selectFrom('User')
-    .select('id')
-    .where('userSnowflake', '=', memberId)
-    .executeTakeFirst();
+  const remembered = ids.user(memberId) !== undefined;
+  const guildRemembered = ids.guild(guildId) !== undefined;
+  const known = (await userRow(db, memberId, ids)) !== undefined;
   // Nothing to change for a member without a row: no lock is needed to say so.
   if (!known && !create) return work(db, undefined);
-  const guildRow = () =>
-    db.selectFrom('Guild').select('id').where('snowflake', '=', guildId).executeTakeFirst();
-  let guild = await guildRow();
-  if (!guild) {
+  let guildRowId = await guildRow(db, guildId, ids);
+  if (guildRowId === undefined) {
     if (!create) return work(db, undefined);
     // The bot records a server when it joins it; this is for a row that went missing. Two
     // members may come here at once: the unique key makes one row of it.
@@ -82,11 +123,14 @@ export async function withMemberLocked<T>(
       .values({ snowflake: guildId })
       .onDuplicateKeyUpdate({ snowflake: guildId })
       .execute();
-    guild = await guildRow();
-    if (!guild) throw new Error(`Guild row for ${guildId} vanished after insert`);
+    guildRowId = await guildRow(db, guildId, ids);
+    if (guildRowId === undefined) throw new Error(`Guild row for ${guildId} vanished after insert`);
   }
-  const guildRowId = guild.id;
-  return inTransaction(db, async (trx) => {
+  const guild = guildRowId;
+  /** Set when the row that was only remembered is no longer there. */
+  let forgotten = false;
+  let made: number | undefined;
+  const changed = inTransaction(db, async (trx) => {
     if (!known) {
       await trx
         .insertInto('User')
@@ -101,16 +145,42 @@ export async function withMemberLocked<T>(
       .forUpdate()
       .executeTakeFirst();
     if (!user) {
+      if (remembered) {
+        // Not deleted under this change, as far as anybody knows: only remembered wrongly.
+        forgotten = true;
+        return undefined;
+      }
       // Deleted since it was seen: nothing to change, or nothing to hang a new row on.
-      if (!create) return work(trx, undefined);
+      if (!create) return { value: await work(trx, undefined) };
       throw new Error(
         known
           ? `User row for ${memberId} was deleted while their rows were being changed`
           : `User row for ${memberId} vanished after insert`,
       );
     }
+    made = user.id;
     // From here on plain reads see everything that was written before the lock was got: the
     // first of them fixes what the transaction sees.
-    return work(trx, { userId: user.id, guildId: guildRowId });
+    return { value: await work(trx, { userId: user.id, guildId: guild }) };
   });
+  let result: { value: T } | undefined;
+  try {
+    result = await changed;
+  } catch (err) {
+    // Only for an id that came from the memory: one that was just read and fails all the
+    // same is a failure like any other. The second run reads the row, so it cannot come here.
+    if (!guildRemembered || !isMissingParentRow(err)) throw err;
+    ids.forgetGuild(guildId);
+    // The transaction was the caller's: what `work` wrote before it failed is still in it,
+    // and nothing here can take it back. The caller rolls back, or knows what it kept.
+    if (db.isTransaction) throw err;
+    return withMemberLocked(db, memberId, guildId, create, work, ids);
+  }
+  if (forgotten || result === undefined) {
+    ids.forgetUser(memberId);
+    return withMemberLocked(db, memberId, guildId, create, work, ids);
+  }
+  // Only now, and only when the transaction was this function's own: the row is committed.
+  if (made !== undefined && !db.isTransaction) ids.sawUser(memberId, made);
+  return result.value;
 }
```

Apply to `src/db/repositories/pokemon-notification-repository.ts`:

```diff
--- a/src/db/repositories/pokemon-notification-repository.ts
+++ b/src/db/repositories/pokemon-notification-repository.ts
@@ -17,6 +17,7 @@ import {
 } from '../../domain/pogo/wants.js';
 import type { DB } from '../types.js';
 import { findMemberInGuild, withMemberLocked, type MemberInGuild } from './member-rows.js';
+import { RowIds } from './row-ids.js';
 
 /**
  * What the commands need of the wants (`ctx.wants`); lets tests keep them in memory. A member
@@ -73,11 +74,23 @@ export interface WantStorage {
  * whose want is about raids whatever its row says.
  */
 export class PokemonNotificationRepository implements WantStorage {
+  /** `ids` is the process's memory of `User` and `Guild` rows it has seen (`RowIds`). */
   constructor(
     private readonly db: Kysely<DB>,
     private readonly forms: FormReader,
+    private readonly ids: RowIds = RowIds.none,
   ) {}
 
+  /** `withMemberLocked` over this repository's database and its memory of rows. */
+  private locked<T>(
+    memberId: string,
+    guildId: string,
+    create: boolean,
+    work: (trx: Kysely<DB>, member: MemberInGuild | undefined) => Promise<T>,
+  ): Promise<T> {
+    return withMemberLocked(this.db, memberId, guildId, create, work, this.ids);
+  }
+
   /**
    * The member's rows of a server. A plain read, also inside `withMemberLocked`: there it is the
    * transaction's first, so it sees everything written before the member's lock was got, and a
@@ -107,7 +120,7 @@ export class PokemonNotificationRepository implements WantStorage {
   }
 
   async list(memberId: string, guildId: string): Promise<WantList> {
-    const member = await findMemberInGuild(this.db, memberId, guildId);
+    const member = await findMemberInGuild(this.db, memberId, guildId, this.ids);
     if (!member) return { wants: [], unreadable: 0 };
     return readWants(await this.rows(this.db, member), this.forms);
   }
@@ -154,7 +167,7 @@ export class PokemonNotificationRepository implements WantStorage {
     target: NotificationTarget,
     scope: NotificationScope,
   ): Promise<SetWantOutcome> {
-    return withMemberLocked(this.db, memberId, guildId, true, async (trx, member) => {
+    return this.locked(memberId, guildId, true, async (trx, member) => {
       if (!member) throw new Error(`No rows for member ${memberId} in server ${guildId}`);
       const plan = planSetWant(await this.rows(trx, member), target, scope, this.forms);
       if (plan.insert) {
@@ -182,7 +195,7 @@ export class PokemonNotificationRepository implements WantStorage {
   }
 
   async remove(memberId: string, guildId: string, target: NotificationTarget): Promise<boolean> {
-    return withMemberLocked(this.db, memberId, guildId, false, async (trx, member) => {
+    return this.locked(memberId, guildId, false, async (trx, member) => {
       if (!member) return false;
       const ids = rowsOfWant(await this.rows(trx, member), target, this.forms);
       if (ids.length === 0) return false;
@@ -192,7 +205,7 @@ export class PokemonNotificationRepository implements WantStorage {
   }
 
   async removeAll(memberId: string, guildId: string): Promise<number> {
-    return withMemberLocked(this.db, memberId, guildId, false, async (trx, member) => {
+    return this.locked(memberId, guildId, false, async (trx, member) => {
       if (!member) return 0;
       const result = await trx
         .deleteFrom('PokemonNotification')
```

Create `src/db/repositories/row-ids.ts`:

```ts
import { BoundedMap } from '../../bounded-map.js';

/** As many servers as are remembered: far more than the bot is in. */
const MAX_GUILDS = 1_000;
/** As many members as are remembered; the one met longest ago goes first. */
const MAX_USERS = 20_000;

/**
 * The row ids of `Guild` and `User` rows this process has made or seen, by snowflake, so that
 * they are not asked for again before every statement that needs one (plan 4F: a want cost two
 * such reads before its transaction, a list three round trips for one read).
 *
 * A row id never changes while its row exists, and only a row that exists is remembered: a
 * missing one is asked for every time, so a row that somebody else makes is found at once.
 * But a remembered row can go:
 *
 * - a `Guild` row is deleted by this bot through `GuildRepository.remove`, which forgets it
 *   here, and by the legacy bot on the same database when it leaves a server (its
 *   `guildDelete`), which this process does not hear of. The row that is made when the server
 *   comes back has another id. So what is remembered of a server is corrected wherever the
 *   truth shows: `GuildRepository.ensure` (run for every server at each start and whenever the
 *   bot joins one) always writes, reads and overwrites it, and a write that hangs a row on a
 *   server id that is gone fails the foreign key, on which `withMemberLocked` forgets the
 *   server and makes the change once more. Until one of the two happens, a read by the old id
 *   finds nothing, which is what is there: the member's rows went with the server's;
 * - nothing in either bot deletes a `User` row. Should one be gone all the same, a write
 *   notices (`withMemberLocked` locks the row by its snowflake), forgets it and makes the
 *   change as for a new member; a read finds nothing until then.
 *
 * One of these is shared by the repositories of a process (`src/app.ts`). A repository that is
 * given none remembers nothing, as before: `RowIds.none`.
 */
export class RowIds {
  /** Remembers nothing and knows nothing: every id is asked for. The default of a repository. */
  static readonly none: RowIds = new RowIds(false);

  private readonly guilds = new BoundedMap<string, number>(MAX_GUILDS);
  private readonly guildSnowflakes = new BoundedMap<number, string>(MAX_GUILDS);
  private readonly users = new BoundedMap<string, number>(MAX_USERS);

  constructor(private readonly remembering = true) {}

  /** The row id of a server that was seen; undefined for one that was not. */
  guild(snowflake: string): number | undefined {
    return this.guilds.get(snowflake);
  }

  /** The snowflake of the server with a row id that was seen. */
  guildSnowflake(id: number): string | undefined {
    return this.guildSnowflakes.get(id);
  }

  /** The row id of a member that was seen; undefined for one that was not. */
  user(snowflake: string): number | undefined {
    return this.users.get(snowflake);
  }

  /** A server's row exists with this id: it was read, or made and read back. */
  sawGuild(snowflake: string, id: number): void {
    if (!this.remembering) return;
    // The row was made anew: its old id is no server's any more.
    const before = this.guilds.get(snowflake);
    if (before !== undefined && before !== id) this.guildSnowflakes.delete(before);
    this.guilds.set(snowflake, id);
    this.guildSnowflakes.set(id, snowflake);
  }

  /**
   * A member's row exists with this id. Never for a row made inside a transaction that has not
   * committed yet: one that is rolled back would be remembered all the same.
   */
  sawUser(snowflake: string, id: number): void {
    if (this.remembering) this.users.set(snowflake, id);
  }

  /** The server's row was deleted, or is no longer sure. */
  forgetGuild(snowflake: string): void {
    const id = this.guilds.get(snowflake);
    this.guilds.delete(snowflake);
    if (id !== undefined) this.guildSnowflakes.delete(id);
  }

  /** The member's row turned out to be gone. */
  forgetUser(snowflake: string): void {
    this.users.delete(snowflake);
  }
}
```

Apply to `src/db/repositories/user-repository.ts`:

```diff
--- a/src/db/repositories/user-repository.ts
+++ b/src/db/repositories/user-repository.ts
@@ -6,6 +6,7 @@ import {
   toRaidPrivacy,
 } from '../../domain/party/status.js';
 import type { DB } from '../types.js';
+import { RowIds } from './row-ids.js';
 
 /**
  * One member's personal settings, as the rest of the bot sees them. Whether a member is told
@@ -114,9 +115,16 @@ function toSettings(snowflake: string, row: Selectable<DB['User']>): UserSetting
   };
 }
 
-/** The User table: one row per member who has changed a setting. */
+/**
+ * The User table: one row per member who has changed a setting. With `ids` (the process's
+ * memory of rows it has seen) a row that was read here need not be looked for again by the
+ * repositories of a member's wants and gyms.
+ */
 export class UserRepository implements UserSettingsStore {
-  constructor(private readonly db: Kysely<DB>) {}
+  constructor(
+    private readonly db: Kysely<DB>,
+    private readonly ids: RowIds = RowIds.none,
+  ) {}
 
   /** The member's settings; the defaults when they have no row. Never creates a row. */
   async get(snowflake: string): Promise<UserSettings> {
@@ -125,6 +133,7 @@ export class UserRepository implements UserSettingsStore {
       .selectAll()
       .where('userSnowflake', '=', snowflake)
       .executeTakeFirst();
+    if (row && !this.db.isTransaction) this.ids.sawUser(snowflake, row.id);
     return row ? toSettings(snowflake, row) : { snowflake, ...DEFAULT_USER_SETTINGS };
   }
 
@@ -155,11 +164,14 @@ export class UserRepository implements UserSettingsStore {
 
   /** The row id other tables reference (PokemonNotification.userId and so on). */
   async idFor(snowflake: string): Promise<number | undefined> {
+    const seen = this.ids.user(snowflake);
+    if (seen !== undefined) return seen;
     const row = await this.db
       .selectFrom('User')
       .select('id')
       .where('userSnowflake', '=', snowflake)
       .executeTakeFirst();
+    if (row && !this.db.isTransaction) this.ids.sawUser(snowflake, row.id);
     return row?.id;
   }
 
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/db/repositories/row-ids.test.ts`
Expected: PASS.

This task also changes database tests (`src/commands/round-trips.db.test.ts`, `src/db/repositories/member-rows.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/commands/round-trips.db.test.ts src/db/repositories/member-rows.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff f990bf0 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/app.ts src/commands/round-trips.db.test.ts src/db/kysely.ts src/db/repositories/guild-repository.ts src/db/repositories/gym-notification-repository.ts src/db/repositories/member-rows.db.test.ts src/db/repositories/member-rows.ts src/db/repositories/pokemon-notification-repository.ts src/db/repositories/row-ids.test.ts src/db/repositories/row-ids.ts src/db/repositories/user-repository.ts test/support/migrated-db.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app.ts src/commands/round-trips.db.test.ts src/db/kysely.ts src/db/repositories/guild-repository.ts src/db/repositories/gym-notification-repository.ts src/db/repositories/member-rows.db.test.ts src/db/repositories/member-rows.ts src/db/repositories/pokemon-notification-repository.ts src/db/repositories/row-ids.test.ts src/db/repositories/row-ids.ts src/db/repositories/user-repository.ts test/support/migrated-db.ts
git commit -F <a file with the message below>
```

The commit message:

```
Speed: the rows of a server and a member are asked for once

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: `npm run check` green with 4,047 unit tests.

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto/phase-4f HEAD -- src test scripts data/settings.json` prints nothing; `npm run check`, `npm run build` and `npm run test:db`, each once and one after the other.
2. Whole-branch review (Opus, high effort) of the seven commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line, and the conventions that changed (`PokemonEntry.class`, `ctx.pokemon.find` and the order of hits, `wildSpawnExceptions`, `/wild`'s required details, a train's maker under privacy and auto-status with `mayArrange`, the role menus' rule, no EX tier, `RowIds`).
4. `docs/superpowers/plans/phase-0-follow-ups.md`: a "From Phase 4F" section. The Gantt chart and memory.
5. `var/stage/settings.json` (the git-ignored staging copy) loses the retired EX keys by itself (they are stripped); nothing to do unless it should name other exceptions for `/wild`.

## Staging checklist (with Matt, on the test application and server)

Nothing of this plan has touched Discord. Each step needs Matt's go-ahead; the bot is started by Matt. `npm run deploy-commands -- --guild <test server>` comes first (`/wild` has a required option now, `/raid` and `/want` lose EX). One migration runs at start.

- [ ] `/want`: `gira` (Giratina before Girafarig), `star` (the boss before the tiers, no Pikachu or Tyranitar), `ty` (Tyranitar is there), `arc` (Arcanine is there), `tyranitar base`, `shadow` (no stray guesses), a current boss by one letter.
- [ ] `/wild`: `details` must be filled; Mewtwo, a mega and Black Kyurem are refused with a sentence; Azelf is accepted; the answer names the channel once; the report shows the details. `/help wild` names the limit and the exceptions.
- [ ] `/train` with auto-status None: not signed up, told to sign up to move it, can still add the first stops; with privacy Anonymous: no "Created by", and the second account's new-train DM names nobody. With auto-status Here: signed up as Coming.
- [ ] `/iam` menus: open two `/iam` messages, give up a role in one, pick something else in the other: the role given up does not come back.
- [ ] `/admin self-roles list` with a role that cannot be given: the heading's count. `/nickname find`: the name as registered. `/untarget`: the region in the choices.
- [ ] No "EX" among the tiers of `/raid` and `/want`; a raid at an elite raid gym still gets its copy in `elite-gym-raids`.
- [ ] Speed, to note down: the time from sending to the answer for `/settings`, `/want`, `/wild` and `/help`, and from the log how long the deferral and the edit of the answer each take, to decide whether short commands should answer without deferring.
