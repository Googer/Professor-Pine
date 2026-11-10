# Phase 8R-4: Want Enhancements: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The fourth plan of reports at stops (Gantt phase 17), from the design `docs/superpowers/specs/2026-10-22-costume-form-wants-design.md` (Want enhancements) and its mockups, agreed with Matt on 2026-10-22, before the stagings of 8R-1 to 8R-4 so that `/want` is staged once. In detail:

- **Costumed wants:** "Only costumed" means any costume of that Pokémon, now or later. A plain want still covers costumes.
  - A `costumed` column on both want tables (migration 030).
  - The game data knows the costumes (`GAME_DATA_VERSION` 7), and a "<Pokémon> wearing …" name is placed as its Pokémon.
  - Raids, research rewards and spawns of global events carry `costumed`. Max bosses and Rocket catches never do.
- **One `/want` dialog per species:**
  - **Tell me about:** Research is hidden for legendaries, mythicals and ultra beasts unless today's tasks reward it or the member holds it.
  - **Which <species>:** checkboxes up to 10 forms, a dropdown up to 25. Megas count for raids only. Unown's letters stay apart.
  - **Costumes:** one Checkbox.
  - **Remove:** where a want is held.
  - On a first want the boxes start unticked and one is required.
  - In a raid's or a max battle's post the Pokémon may be left out, and only the post's box is ticked.
  - Every opening has an id of its own (`openToken`, 8X-F).
- **Change…** replaces Stop on the DMs' Pokémon, tier and Rocket reasons and on `/wants`' lines. It opens the same dialog for the DM's server or the list's page.
  - `/wants` is sorted: Pokémon A–Z, tiers, Team GO Rocket, then items, Perfect IVs and Zero IVs.
  - A species' forms are named together, and counted when there are more than three.
- **One Team GO Rocket dialog:** grunts, leaders and Remove.

**Not in 8R-4:** grunt lineups reported apart (design 4b, S5–S11): plan **8R-4L**, next.

**Architecture:**

- **Domain:**
  - `src/domain/pogo/costumes.ts`: the costume test.
  - `species-answer.ts`: one answer per species.
  - `src/domain/time/spawn-events.ts`: the feed's spawn events.
  - `src/domain/research/leekduck.ts`: `parseEventSpawns`.
  - Matching in `src/domain/notify/reasons.ts`.
- **Commands and controls:** `src/commands/notifications/wants.ts`, `want-boxes.ts`, `src/components/dm.ts`, the member list.
- **Services:**
  - `src/services/event-spawn-service.ts` (new);
  - `SpawnService`'s `costumes`;
  - `RaidEventService.spawnEvents()`;
  - `NotifyService`;
  - the want repositories and their twins;
  - `app.ts` wiring.
- **Game data:** `GameData.costumes`, the fixtures regenerated.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14, Kysely, Vitest. No new dependency. **Migration 030** (additive). **`GAME_DATA_VERSION` 7**: the first start downloads the game data, and a failed download refuses the start. **Command changes** (`/want`, `/unwant`, `/wants`): deploy the commands before staging. No party state change.

**Spec:**
- the design above;
- the brief `.superpowers/sdd/8r-4-wants/design.md`, with its review F1–F14 and the "After the pause" section;
- the fix rounds `fix-round-1.md` and `fix-round-2.md`;
- the ledger (git-ignored).

**Every diff in this plan was run before the plan was written**, on a throwaway branch `proto-8r4` (tip `6fee4447`, tag `proto-8r4-r3`), one commit per task, on `stop-reports` afe3cb99 (typescript-migration's 8X-F merged in). Each commit typechecks in both projects, and its tests pass. On the tip, the full check (9,024 tests), the build and the database suite (583) are clean.

**Reviews:**
- **The brief.** A fresh Opus reviewer read it before any code: one Critical (no event page to test against; Matt let the controller fetch it once), seven Important and six Minor, all folded in.
- **The prototype.**
  - Two Opus reviewers went through it.
    - Tasks 1–4: two Important (a held costume dropped when the field is hidden; nothing ticked keeping hidden boxes) and eight Minor.
    - Tasks 5–8: one Important (the list's Submit wrote before acknowledging) and eight Minor.
  - Two fix reviews followed, with four Minor findings and then one.
  - All are folded into the commits below, except G1 (a stronger throttle test), which goes into this plan's fix wave.

## Decisions in this plan

Matt's rulings (2026-10-22) and the calls made while prototyping:

1. **The first want:**
   - Outside a post, nothing is ticked, and Discord refuses the Submit until a box is ticked. There is no "All" option.
   - Inside a raid's or max battle's post, the post's box only: Raids, Shadow for a shadow raid, Dynamax or Gigantamax.
   - An egg's post gives the egg's tier.
   - A raid or max boss Pine doesn't know is refused with a hint (`/want t5`).
2. **Names:** forms by the catalogue's names ("Arceus (Dragon-Type)"); `/wants` says "Tier 5 raids"; grunt types in alphabetical order.
3. **Costumed spawns:**
   - Only these event types count: ordinary events, Community Day, Spotlight Hour and GO Tour, with the Wild Area and GO Fest only in their Global edition.
   - Events with fixed UTC times (in person) and events longer than 31 days stay out.
   - Leek Duck's free-text "you might also encounter X wearing …" is not read.
4. **Megas:** always written plain, and left out of Costumed.
5. **Unticking:** nothing ticked takes the species off, hidden boxes included, also with Remove shown.
6. **Remove** leaves the species' Mega Energy research want, which is its own line.
7. **Earlier DMs:** a Pokémon's or tier's Stop from before 8R-4 is out of date. Those DMs were only ever sent on the test server (Matt).
8. **Expired reports:** DMs about a spawn or grunt are not deleted when the report expires (Matt). The follow-up edits them when a report is taken back early.
9. **Dialog ids without a token** (`set2`, `rset1`) are refused, since those shapes were never drawn without one.

### Task 1: 8R-4 task 1: Costumes in the game data, and costumes known by name only

Prototype commit: `d6c252f2a81bfc8f0dc7c6860c44c72b7e753b53`

GameData keeps the costume aliases (GAME_DATA_VERSION 7): the flagged
costumes that copy an entry and the unflagged copies of 2019 and
Psyduck's swimming ring, never the wild legendaries of GO Tour: Johto nor
a costume with stats of its own. The fixtures are regenerated (only the
costume list is new). isCostumed tells a costumed sighting by its form
id, a costume-shaped new form, the picture's costume part or, last, a
"<Pokemon> wearing ..." name, which matchBoss now places as the Pokemon
that wears it.

**Files:**

```
 docs/architecture/utilities.md      |   1 +
 src/domain/pogo/catalogue.test.ts   |  21 ++++++++++
 src/domain/pogo/catalogue.ts        |  27 +++++++++++++
 src/domain/pogo/costumes.test.ts    | 159 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/pogo/costumes.ts         |  83 ++++++++++++++++++++++++++++++++++++++++
 src/domain/pogo/feed-lookup.ts      |  20 ++++++++++
 src/domain/pogo/game-master.test.ts |  36 ++++++++++++++++-
 src/domain/pogo/game-master.ts      |  50 ++++++++++++++++++------
 src/domain/pogo/raid-boss-feed.ts   |  47 ++++++++++++++++++++---
 test/fixtures/game-data.json        |   1 +
 10 files changed, 426 insertions(+), 19 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/pogo/catalogue.test.ts src/domain/pogo/costumes.test.ts src/domain/pogo/game-master.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff d6c252f2a81bfc8f0dc7c6860c44c72b7e753b53 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4 task 1: Costumes in the game data, and costumes known by name only`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index eb57fb4b21a2c9e899dcc7ebb1899d5a95d511ae..09439a0bfad00eb4ea38d3083c8992558e8eeb6e 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -7,6 +7,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 - Species, forms, names, types, stats and moves come from the game master through `ctx.gameData.catalogue` (`src/domain/pogo/`); search nicknames come from `CURATED_NICKNAMES` and `PokemonRepository.nicknames()`. The new bot never reads `data/pokemon.json`, `types.json` or `weather.json`; they stay only for the legacy bot and the parity test.
 - A Pokémon is identified by its catalogue key (`rattata_alola`, `charizard_mega_x`). Legacy names are translated with `keyForLegacyName` / `legacyNameForKey`.
 - One identity per form: a species with a named default form is known by that form (`giratina_altered`, `landorus_incarnate`; there is no `giratina` entry). `catalogue.byKey` and `byGameMasterId` also accept aliases (the bare species id, costumes, appearance-only forms), so store the `key` of the entry they return, never the text that was looked up.
+- Costumes (plan 8R-4, `GAME_DATA_VERSION` 7): `GameData.costumes` is the aliases that are costumes, the flagged costumes that copy an entry of their species (every Pikachu in a hat; `corsola_spring_2026` copies Galarian Corsola) and the unflagged appearance-only copies (`UNFLAGGED_COSTUMES`: `*_COPY_2019`, `PSYDUCK_SWIM_2025`), never the wild legendaries of GO Tour: Johto (`RAIKOU_S` and the rest of `COSMETIC_FORMS`, Matt's answer 1) nor a flagged costume with stats of its own (Armored Mewtwo is a form); `catalogue.isCostume(id)` and `hasCostume(dex)` (any entry's). Whether a sighting is costumed is `isCostumed(name, image, { ids, lookup })` (`src/domain/pogo/costumes.ts`, pure; `costumeLookupOf(catalogue)`): the form id a costume of the game data, a form id it does not know that `isCostumeForm` calls a costume, the picture's own costume part (`.c<COSTUME>`, the third number of an older `pokemon_icon_<dex>_<form>_<costume>.png`, `pictureSaysCostume`), last a name "<Pokémon> wearing …" (`wornBy`). `matchBoss` places such a name as the Pokémon that wears it ("Zubat wearing a top hat" with Leek Duck's hand-named picture is Zubat), for raids, research and Rocket catches alike; `costumedSighting(catalogue, name, image)` gives a named Pokémon's key, dex and costume.
 - The bot downloads the game data at start when its saved copy (the parsed data, `var/game-data-cache.json`) is older than `refreshHours` or missing, and again every `refreshHours` while running (URLs and `refreshHours` in `settings.gameData`); it can start offline once it has run once, and deleting that file forces a fresh download.
 
 ## Finding Pokémon
diff --git a/src/domain/pogo/catalogue.test.ts b/src/domain/pogo/catalogue.test.ts
index e8056bc5dca92f40a4a9e56a8342ffdce3f42cd4..dddbb9252350e7b1ff91e4d0d751241388d191bd 100644
--- a/src/domain/pogo/catalogue.test.ts
+++ b/src/domain/pogo/catalogue.test.ts
@@ -39,6 +39,27 @@ describe('PokemonCatalogue: the whole game master', () => {
   });
 });
 
+describe('PokemonCatalogue: costumes', () => {
+  it('knows a costume by its game master id, in any case', () => {
+    expect(catalogue.isCostume('PIKACHU_PXP_2026')).toBe(true);
+    expect(catalogue.isCostume('corsola_spring_2026')).toBe(true);
+    expect(catalogue.isCostume('pikachu')).toBe(false);
+    expect(catalogue.isCostume('RAIKOU_S')).toBe(false);
+    expect(catalogue.isCostume('mewtwo_a')).toBe(false);
+    expect(catalogue.isCostume('landorus')).toBe(false);
+    expect(catalogue.isCostume('constructor')).toBe(false);
+  });
+
+  it('says whether any form of a species has a costume', () => {
+    expect(catalogue.hasCostume(25)).toBe(true);
+    // Corsola's costume copies Galarian Corsola: the species has a costume all the same.
+    expect(catalogue.hasCostume(222)).toBe(true);
+    expect(catalogue.hasCostume(243)).toBe(false);
+    expect(catalogue.hasCostume(150)).toBe(false);
+    expect(catalogue.hasCostume(9999)).toBe(false);
+  });
+});
+
 describe('PokemonCatalogue: lookups', () => {
   it('finds by key, ignoring case', () => {
     expect(entry('rattata_alola').name).toBe('Alolan Rattata');
diff --git a/src/domain/pogo/catalogue.ts b/src/domain/pogo/catalogue.ts
index 73e1492ab0aa3d7ef09386ef314ad324f267d77f..de6131929ecff334830dc3162de49ca0dc565bcd 100644
--- a/src/domain/pogo/catalogue.ts
+++ b/src/domain/pogo/catalogue.ts
@@ -64,6 +64,33 @@ export class PokemonCatalogue {
     return [...this.aliases].filter(([, target]) => target === key).map(([alias]) => alias);
   }
 
+  private costumeSet: Set<string> | undefined;
+
+  /**
+   * Whether a game master form id (any case) is a costume the game data knows (`GameData.costumes`:
+   * `PIKACHU_PXP_2026`, `CORSOLA_SPRING_2026`); never an entry, nor `RAIKOU_S`.
+   */
+  isCostume(id: string): boolean {
+    this.costumeSet ??= new Set(this.data.costumes);
+    return this.costumeSet.has(id.toLowerCase());
+  }
+
+  /**
+   * Whether the game data has a costume of any entry of this Pokédex number (Corsola's copies
+   * Galarian Corsola): `/want`'s dialog asks about costumes for such a species.
+   */
+  hasCostume(dex: number): boolean {
+    this.costumeDexes ??= new Set(
+      this.data.costumes.flatMap((id) => {
+        const entry = this.keys.get(this.aliases.get(id) ?? '');
+        return entry ? [entry.dex] : [];
+      }),
+    );
+    return this.costumeDexes.has(dex);
+  }
+
+  private costumeDexes: Set<number> | undefined;
+
   /** Every entry of a species: the species itself, its forms and its megas. */
   byDex(dex: number): readonly PokemonEntry[] {
     return this.dexes.get(dex) ?? [];
diff --git a/src/domain/pogo/costumes.test.ts b/src/domain/pogo/costumes.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..24e963cdbd62edf78693040b48b55cd55ab0efea
--- /dev/null
+++ b/src/domain/pogo/costumes.test.ts
@@ -0,0 +1,159 @@
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import { costumedSighting, isCostumed } from './costumes.js';
+import { costumeLookupOf } from './feed-lookup.js';
+import { identifyBoss, pictureIds, wornBy } from './raid-boss-feed.js';
+
+const lookup = costumeLookupOf(catalogueFixture());
+const ICONS = 'https://cdn.leekduck.com/assets/img/pokemon_icons/';
+const CROP = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';
+const HALLOWEEN =
+  'https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-10-27-halloween-2026-part-1/';
+
+/** The costume test as a feed's boss or a page's reward is judged: the picture's ids. */
+const costumed = (name: string, image?: string): boolean =>
+  isCostumed(name, image, { ids: pictureIds(image, lookup), lookup });
+
+describe('isCostumed: what the game data says', () => {
+  it('takes a form id the game data has as a costume', () => {
+    expect(
+      isCostumed('Pikachu', undefined, {
+        ids: { pokemonId: 'PIKACHU', form: 'PIKACHU_PXP_2026' },
+        lookup,
+      }),
+    ).toBe(true);
+    // Corsola's costume copies Galarian Corsola, and is a costume all the same.
+    expect(
+      isCostumed('Galarian Corsola', undefined, {
+        ids: { pokemonId: 'CORSOLA', form: 'CORSOLA_SPRING_2026' },
+        lookup,
+      }),
+    ).toBe(true);
+  });
+
+  it('never takes a form of its own, a region, or the wild legendaries of GO Tour: Johto', () => {
+    for (const [pokemonId, form] of [
+      ['MEWTWO', 'MEWTWO_A'],
+      ['CORSOLA', 'CORSOLA_GALARIAN'],
+      ['RAIKOU', 'RAIKOU_S'],
+      ['LUGIA', 'LUGIA_S'],
+      ['GIRATINA', 'GIRATINA_ORIGIN'],
+      ['PIKACHU', null],
+    ] as const) {
+      expect(
+        isCostumed('Pokémon', undefined, { ids: { pokemonId, form }, lookup }),
+        String(form),
+      ).toBe(false);
+    }
+  });
+
+  it('takes a form newer than the game data that is shaped like a costume (isCostumeForm)', () => {
+    // The raid boss feed of 2026-10-11: Astronaut Pikachu in a glass helmet.
+    expect(costumed('Astronaut Pikachu', `${ICONS}pm25.fGLASS_HELMET_2026.icon.png`)).toBe(true);
+    // A new form of its own is not: it carries no year, or says a region.
+    expect(costumed('Mewtwo Z', `${ICONS}pm150.fMEGA_Z.icon.png`)).toBe(false);
+    expect(costumed('Alolan Raichu (Holiday)', `${ICONS}pm26.fALOLA_WINTER_2030.icon.png`)).toBe(
+      false,
+    );
+  });
+});
+
+describe('isCostumed: the picture', () => {
+  it('takes a picture with a costume part', () => {
+    // Halloween 2026 Part I's spawns and the Teddiursa Spotlight Hour of 2026-11-05.
+    expect(
+      costumed(
+        'Piplup wearing a Halloween Mischief costume',
+        `${CROP}pm393.cHALLOWEEN_2021_NOEVOLVE.icon.png`,
+      ),
+    ).toBe(true);
+    expect(costumed('Teddiursa', `${ICONS}pm216.cHALLOWEEN_2025.icon.png`)).toBe(true);
+  });
+
+  it('takes a picture whose form part the game data has as a costume', () => {
+    expect(costumed('Pikachu', `${ICONS}pm25.fPXP_2026.icon.png`)).toBe(true);
+    expect(costumed('Pikachu', `${ICONS}pm25.icon.png`)).toBe(false);
+    expect(costumed('Galarian Corsola', `${ICONS}pm222.fGALARIAN.icon.png`)).toBe(false);
+  });
+
+  it('reads the older pictures by number, whose third number is a costume', () => {
+    // ScrapedDuck's community day spawns (Pawniard, 2026-11-21) and the raid events.
+    expect(costumed('Pawniard', `${ICONS}pokemon_icon_624_00.png`)).toBe(false);
+    expect(costumed('Giratina (Origin)', `${ICONS}pokemon_icon_487_12.png`)).toBe(false);
+    expect(costumed('Pawniard', `${ICONS}pokemon_icon_624_00_shiny.png`)).toBe(false);
+    expect(costumed('Pikachu', `${ICONS}pokemon_icon_025_00_05.png`)).toBe(true);
+    expect(costumed('Pikachu', `${ICONS}pokemon_icon_025_00_05_shiny.png`)).toBe(true);
+  });
+});
+
+describe('isCostumed: the name, last', () => {
+  it('takes "<Pokémon> wearing …", the way Leek Duck names a costume the game data lacks', () => {
+    // Halloween 2026 Part I, with Leek Duck's own pictures named by hand.
+    expect(costumed('Zubat wearing a top hat', `${HALLOWEEN}zubat-top-hat.png`)).toBe(true);
+    expect(
+      costumed('Pikachu wearing a hat and capelet', `${HALLOWEEN}pikachu-hat-capelet.png`),
+    ).toBe(true);
+    expect(costumed('Sinistea wearing a bow', `${HALLOWEEN}sinistea-bow.png`)).toBe(true);
+    expect(costumed('Teddiursa wearing a witch hat')).toBe(true);
+  });
+
+  it('takes nothing else from a name', () => {
+    expect(costumed('Duskull', `${CROP}pokemon_icon_355_00.png`)).toBe(false);
+    expect(costumed('Pikachu')).toBe(false);
+    expect(costumed('Shadow Rider Calyrex')).toBe(false);
+    // "wearing" must stand between the Pokémon and what it wears.
+    expect(costumed('Wearing')).toBe(false);
+  });
+});
+
+describe('wornBy', () => {
+  it('gives the Pokémon of a name that says what it wears', () => {
+    expect(wornBy('Zubat wearing a top hat')).toBe('Zubat');
+    expect(wornBy('Galarian Corsola wearing a crown')).toBe('Galarian Corsola');
+    expect(wornBy('Pikachu')).toBeUndefined();
+    expect(wornBy('wearing a hat')).toBeUndefined();
+  });
+});
+
+describe('a costume known by name only is its species (F2)', () => {
+  const key = (name: string, image?: string): string | undefined => {
+    const ids = identifyBoss(name, image, lookup)?.resolved;
+    return ids && lookup.keyOf(ids.pokemonId, ids.form);
+  };
+
+  it('places the names of the event pages under their species', () => {
+    expect(key('Zubat wearing a top hat', `${HALLOWEEN}zubat-top-hat.png`)).toBe('zubat');
+    expect(key('Pikachu wearing a hat and capelet', `${HALLOWEEN}pikachu-hat-capelet.png`)).toBe(
+      'pikachu',
+    );
+    expect(key('Sinistea wearing a bow', `${HALLOWEEN}sinistea-bow.png`)).toBe('sinistea');
+    expect(
+      key(
+        'Piplup wearing a Halloween Mischief costume',
+        `${CROP}pm393.cHALLOWEEN_2021_NOEVOLVE.icon.png`,
+      ),
+    ).toBe('piplup');
+    expect(key('Teddiursa wearing a witch hat', `${ICONS}pm216.cHALLOWEEN_2025.icon.png`)).toBe(
+      'teddiursa',
+    );
+  });
+
+  it('never places a name whose picture says another Pokémon', () => {
+    expect(key('Zubat wearing a top hat', `${ICONS}pm25.icon.png`)).toBeUndefined();
+  });
+});
+
+describe('costumedSighting', () => {
+  it('gives the catalogue key and whether it is costumed, as a sighting carries them', () => {
+    const catalogue = catalogueFixture();
+    expect(
+      costumedSighting(catalogue, 'Zubat wearing a top hat', `${HALLOWEEN}zubat-top-hat.png`),
+    ).toEqual({ key: 'zubat', dex: 41, costumed: true });
+    expect(costumedSighting(catalogue, 'Duskull', `${CROP}pokemon_icon_355_00.png`)).toEqual({
+      key: 'duskull',
+      dex: 355,
+      costumed: false,
+    });
+    expect(costumedSighting(catalogue, 'Newmon wearing a hat')).toBeUndefined();
+  });
+});
diff --git a/src/domain/pogo/costumes.ts b/src/domain/pogo/costumes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..38a4cae99be6ebcc4936f0285af197abca3ef42d
--- /dev/null
+++ b/src/domain/pogo/costumes.ts
@@ -0,0 +1,83 @@
+import type { PokemonCatalogue } from './catalogue.js';
+import { costumeLookupOf, type CostumeLookup } from './feed-lookup.js';
+import {
+  identifyBoss,
+  isCostumeForm,
+  pictureIds,
+  pictureSaysCostume,
+  wornBy,
+  type Ids,
+} from './raid-boss-feed.js';
+
+/*
+ * Whether a sighting is costumed (plan 8R-4, design 5): a raid boss, a research reward, a spawn
+ * an event lists. "Costumed" is any costume, never one in particular; a costume belongs to the
+ * form it copies (`GameData.aliases`), so a costumed sighting is matched under that form.
+ */
+
+/** What the costume test knows of a sighting beside its name and picture. */
+export interface CostumeEvidence {
+  /**
+   * The ids the sighting stands for: a feed's boss as stored (`FeedBoss.pokemonId` / `form`), or
+   * what a picture names (`pictureIds`); undefined when nothing names them.
+   */
+  ids: Ids | undefined;
+  lookup: CostumeLookup;
+}
+
+/**
+ * The costume test, in this order, the first that holds:
+ * - the form id is a costume the game data knows (`GameData.costumes`: `PIKACHU_PXP_2026`,
+ *   `CORSOLA_SPRING_2026`; never `RAIKOU_S` nor a form with stats of its own);
+ * - a form id the game data does not know yet that `isCostumeForm` calls a costume (Astronaut
+ *   Pikachu's `PIKACHU_GLASS_HELMET_2026`);
+ * - the picture says a costume by its own part (`.c<COSTUME>`, an older picture's third number);
+ * - last, the name says what it wears ("Zubat wearing a top hat", Leek Duck's name for a costume
+ *   before the game data has it, with a picture named by hand).
+ */
+export function isCostumed(name: string, image: unknown, evidence: CostumeEvidence): boolean {
+  const { ids, lookup } = evidence;
+  if (ids?.form != null) {
+    if (lookup.isCostume(ids.form)) return true;
+    const species = lookup.speciesName(ids.pokemonId);
+    if (
+      species !== undefined &&
+      lookup.kindOf(ids.pokemonId, ids.form) === undefined &&
+      isCostumeForm({ pokemonId: ids.pokemonId, form: ids.form, name }, species)
+    ) {
+      return true;
+    }
+  }
+  if (pictureSaysCostume(image)) return true;
+  return wornBy(name) !== undefined;
+}
+
+/** A sighting of a name and picture as the matchers take it. */
+export interface CostumedSighting {
+  key: string;
+  dex: number;
+  costumed: boolean;
+}
+
+/**
+ * A Pokémon a page or feed names by its English name and picture (an event's spawn, a research
+ * reward): its catalogue entry where name and picture agree (`identifyBoss`, a name-only costume
+ * as the Pokémon that wears it), and whether it is costumed by its picture's ids. Undefined where
+ * the game data does not know it.
+ */
+export function costumedSighting(
+  catalogue: PokemonCatalogue,
+  name: string,
+  image?: unknown,
+): CostumedSighting | undefined {
+  const lookup = costumeLookupOf(catalogue);
+  const resolved = identifyBoss(name, image, lookup)?.resolved;
+  const key = resolved && lookup.keyOf(resolved.pokemonId, resolved.form);
+  const entry = key === undefined ? undefined : catalogue.byKey(key);
+  if (!entry) return undefined;
+  return {
+    key: entry.key,
+    dex: entry.dex,
+    costumed: isCostumed(name, image, { ids: pictureIds(image, lookup), lookup }),
+  };
+}
diff --git a/src/domain/pogo/feed-lookup.ts b/src/domain/pogo/feed-lookup.ts
index 34e484666d6d5386c22a92b24a9b17d6aab967d0..b198b3cc198e5a68169db056ff1ad718db5e740c 100644
--- a/src/domain/pogo/feed-lookup.ts
+++ b/src/domain/pogo/feed-lookup.ts
@@ -67,6 +67,26 @@ function speciesNameIn(catalogue: PokemonCatalogue, pokemonId: string): string |
   return words.join(' ');
 }
 
+/**
+ * What the costume test (`isCostumed`, costumes.ts) asks of the game data: the feed's look-ups,
+ * and whether a form id is a costume the game data knows (`PokemonCatalogue.isCostume`).
+ */
+export interface CostumeLookup extends FeedLookup {
+  isCostume(formId: string): boolean;
+}
+
+const costumeLookups = new WeakMap<PokemonCatalogue, CostumeLookup>();
+
+/** `feedLookupOf` with the costume set, built once per catalogue. */
+export function costumeLookupOf(catalogue: PokemonCatalogue): CostumeLookup {
+  let lookup = costumeLookups.get(catalogue);
+  if (!lookup) {
+    lookup = { ...feedLookupOf(catalogue), isCostume: (id) => catalogue.isCostume(id) };
+    costumeLookups.set(catalogue, lookup);
+  }
+  return lookup;
+}
+
 const lookups = new WeakMap<PokemonCatalogue, FeedLookup>();
 
 /** `feedLookup` of a catalogue, built once per catalogue. */
diff --git a/src/domain/pogo/game-master.test.ts b/src/domain/pogo/game-master.test.ts
index 56706d70bd5ab0c9ab4bb2b42ab09533baf253ef..1ef3c986bbc8f6fbb40444e1c146d9002e053381 100644
--- a/src/domain/pogo/game-master.test.ts
+++ b/src/domain/pogo/game-master.test.ts
@@ -512,6 +512,39 @@ describe('parseGameMaster: costumes, megas and moves that cannot be taught by TM
     expect(parsed.pokemon.some((p) => p.key === 'giratina_party_2026')).toBe(false);
     expect(parsed.aliases['giratina_party_2026']).toBe('giratina_altered');
     expect(parsed.aliases['giratina']).toBe('giratina_altered');
+    // The costume is one; the bare species id standing for its default form is none.
+    expect(parsed.costumes).toContain('giratina_party_2026');
+    expect(parsed.costumes).not.toContain('giratina');
+  });
+
+  it('keeps the costume aliases: flagged costumes that copy an entry, the appearance-only copies', () => {
+    expect(data.costumes).toEqual(
+      expect.arrayContaining([
+        'pikachu_adventure_hat_2020',
+        'pikachu_copy_2019',
+        'venusaur_copy_2019',
+        'charizard_copy_2019',
+      ]),
+    );
+    // The wild legendaries of GO Tour: Johto are no costumes (Matt's answer 1), and a flagged
+    // costume with stats of its own is a form.
+    for (const id of ['latias_s', 'mewtwo_a', 'mewtwo', 'giratina', 'pikachu']) {
+      expect(data.costumes, id).not.toContain(id);
+    }
+    for (const id of data.costumes) expect(data.aliases[id], id).toBeDefined();
+    expect(data.costumes).toEqual([...data.costumes].sort());
+  });
+
+  it('keeps every costume of the whole game master, Pikachu with its 68', () => {
+    const { costumes, aliases } = gameDataFixture();
+    expect(costumes.filter((id) => aliases[id] === 'pikachu')).toHaveLength(68);
+    expect(costumes).toEqual(
+      expect.arrayContaining(['pikachu_pxp_2026', 'corsola_spring_2026', 'psyduck_swim_2025']),
+    );
+    for (const id of ['raikou_s', 'entei_s', 'suicune_s', 'lugia_s', 'ho_oh_s', 'latios_s']) {
+      expect(costumes, id).not.toContain(id);
+    }
+    expect(costumes).not.toContain('landorus');
   });
 
   it('keeps the bare species when its formless item copies none of its forms', () => {
@@ -838,9 +871,10 @@ describe('what can Dynamax and Gigantamax (plan 8X-2)', () => {
 
 describe('the shape of the parsed data', () => {
   it('changes only together with GAME_DATA_VERSION: bump GAME_DATA_VERSION when this fails', () => {
-    expect(GAME_DATA_VERSION).toBe(6);
+    expect(GAME_DATA_VERSION).toBe(7);
     expect(Object.keys(data).sort()).toEqual([
       'aliases',
+      'costumes',
       'cpMultipliers',
       'maxBattles',
       'moves',
diff --git a/src/domain/pogo/game-master.ts b/src/domain/pogo/game-master.ts
index 61d5571ed5bc7185ad369b7566f18227bc4e4dbe..87aa7c4657873f0207f7dc82b3890c3dc5a29b64 100644
--- a/src/domain/pogo/game-master.ts
+++ b/src/domain/pogo/game-master.ts
@@ -82,7 +82,7 @@ export interface Move {
  * Bump on ANY change to what `parseGameMaster` produces: the shape of `GameData`, or the rules
  * that decide its contents. A saved cache with another version is discarded.
  */
-export const GAME_DATA_VERSION = 6;
+export const GAME_DATA_VERSION = 7;
 
 /** The highest level the PvP ranks look at (a best buddy); the game master should list it. */
 export const PVP_MAX_LEVEL = 51;
@@ -97,6 +97,14 @@ export interface GameData {
    * `pikachu`). `_NORMAL` form ids are not listed; `PokemonCatalogue.byGameMasterId` knows them.
    */
   aliases: Record<string, string>;
+  /**
+   * The aliases that are costumes, sorted (plan 8R-4, design 5): the flagged costumes that copy
+   * an entry of their species (every Pikachu in a hat, `corsola_spring_2026` of Galarian
+   * Corsola) and the appearance-only copies (`*_copy_2019`, `psyduck_swim_2025`); never the wild
+   * legendaries of GO Tour: Johto (`raikou_s`, Matt's answer 1), nor a flagged costume with
+   * stats of its own, which is a form (`mewtwo_a`).
+   */
+  costumes: string[];
   moves: Move[];
   /** typeChart[attacker][defender] = damage multiplier. */
   typeChart: Record<PokemonType, Record<PokemonType, number>>;
@@ -145,13 +153,24 @@ function number(value: unknown): number {
 }
 
 const REGIONS = ['ALOLA', 'GALARIAN', 'HISUIAN', 'PALDEA'];
-/** Forms that only change appearance but are not flagged as costumes in the game master. */
-const COSMETIC_FORMS = new Set([
+/**
+ * Appearance-only forms that are costumes, though the game master does not flag them (plan 8R-4):
+ * the copies of 2019 and Psyduck in its swimming ring.
+ */
+const UNFLAGGED_COSTUMES: ReadonlySet<string> = new Set([
   'VENUSAUR_COPY_2019',
   'CHARIZARD_COPY_2019',
   'BLASTOISE_COPY_2019',
   'PIKACHU_COPY_2019',
   'PSYDUCK_SWIM_2025',
+]);
+/**
+ * Forms that only change appearance but are not flagged as costumes in the game master: the
+ * unflagged costumes, and the wild legendaries of GO Tour: Johto (`RAIKOU_S`), which are no
+ * costumes (Matt, 2026-10-22).
+ */
+const COSMETIC_FORMS = new Set([
+  ...UNFLAGGED_COSTUMES,
   'RAIKOU_S',
   'ENTEI_S',
   'SUICUNE_S',
@@ -396,6 +415,8 @@ export function parseGameMaster(
   const alias = (id: string, key: string): void => {
     aliases.set(id.toLowerCase(), key);
   };
+  /** The aliases that are costumes (`GameData.costumes`). */
+  const costumeAliases = new Set<string>();
   /** What each entry evolves into, as the game master names it; resolved once all are built. */
   const evolutionTargets = new Map<PokemonEntry, EvolutionTarget[]>();
   for (const [pokemonId, forms] of bySpecies) {
@@ -477,13 +498,17 @@ export function parseGameMaster(
       pokemon.form !== null && costumes.has(`${pokemonId}|${pokemon.form}`);
     const real: { pokemon: RawPokemon; form: string; suffix: string }[] = [];
     /** Costumes and appearance-only forms, each with the item it looks like. */
-    const copies: { form: string; of: RawPokemon | undefined }[] = [];
+    const copies: { form: string; of: RawPokemon | undefined; costume: boolean }[] = [];
     for (const pokemon of forms) {
       if (pokemon.form === null) continue;
       const suffix = suffixOf(pokemon.form);
       if (suffix === 'NORMAL') continue;
       if (COSMETIC_FORMS.has(pokemon.form)) {
-        copies.push({ form: pokemon.form, of: undefined });
+        copies.push({
+          form: pokemon.form,
+          of: undefined,
+          costume: UNFLAGGED_COSTUMES.has(pokemon.form),
+        });
         continue;
       }
       // A flagged costume that copies any real item of its species is not an entry; one with its
@@ -496,7 +521,7 @@ export function parseGameMaster(
               sameStatsAndTypes(pokemon.settings, other.settings),
           )
         : undefined;
-      if (original) copies.push({ form: pokemon.form, of: original });
+      if (original) copies.push({ form: pokemon.form, of: original, costume: true });
       else real.push({ pokemon, form: pokemon.form, suffix });
     }
 
@@ -553,6 +578,7 @@ export function parseGameMaster(
       const original = copy.of?.form;
       const isEntry = formEntries.some((entry) => entry.form === original);
       alias(copy.form, original && isEntry ? original.toLowerCase() : speciesKey);
+      if (copy.costume) costumeAliases.add(copy.form.toLowerCase());
     }
 
     for (const override of list(base.settings['tempEvoOverrides']).map(record)) {
@@ -642,15 +668,15 @@ export function parseGameMaster(
     );
   }
 
+  // An id that is also an entry is not an alias; neither is one whose entry was dropped.
+  const keptAliases = [...aliases]
+    .filter(([id, key]) => !keys.has(id) && keys.has(key))
+    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
   return {
     // A plain code-unit comparison keeps the order the same on every host.
     pokemon: entries.sort((a, b) => a.dex - b.dex || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
-    // An id that is also an entry is not an alias; neither is one whose entry was dropped.
-    aliases: Object.fromEntries(
-      [...aliases]
-        .filter(([id, key]) => !keys.has(id) && keys.has(key))
-        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
-    ),
+    aliases: Object.fromEntries(keptAliases),
+    costumes: keptAliases.flatMap(([id]) => (costumeAliases.has(id) ? [id] : [])),
     moves,
     typeChart: parseTypeChart(withData('typeEffective')),
     weatherBoosts: parseWeatherBoosts(weatherItems),
diff --git a/src/domain/pogo/raid-boss-feed.ts b/src/domain/pogo/raid-boss-feed.ts
index e085a053afd833f1a0780b349e339ef790d191e1..2cb05df7196a89d34bd7724f679c45632958ef7f 100644
--- a/src/domain/pogo/raid-boss-feed.ts
+++ b/src/domain/pogo/raid-boss-feed.ts
@@ -170,15 +170,47 @@ export function readHeading(heading: string): { level: RaidLevel; shadow: boolea
  */
 const PICTURE_NAME = /^pm(\d{1,5})((?:\.(?:f[A-Z0-9_]+|c[A-Za-z0-9_]+|s|g\d+))*)\.icon\.png$/;
 
+function pictureFile(image: unknown): string | undefined {
+  return typeof image === 'string' ? (image.split(/[?#]/)[0]?.split('/').pop() ?? '') : undefined;
+}
+
 function pictureParts(image: unknown): { dex: number; form: string | null } | undefined {
-  if (typeof image !== 'string') return undefined;
-  const file = image.split(/[?#]/)[0]?.split('/').pop() ?? '';
-  const match = PICTURE_NAME.exec(file);
+  const file = pictureFile(image);
+  const match = file === undefined ? null : PICTURE_NAME.exec(file);
   if (!match) return undefined;
   const form = (match[2] ?? '').split('.').find((part) => /^f[A-Z0-9_]+$/.test(part));
   return { dex: Number(match[1]), form: form ? form.slice(1) : null };
 }
 
+/**
+ * The older pictures, named by numbers (`pokemon_icon_624_00.png`, ScrapedDuck's community days
+ * and events): the Pokédex number, the form's number, and a third number for a costume
+ * (`pokemon_icon_025_00_05.png`), `_shiny` last.
+ */
+const OLD_PICTURE_NAME = /^pokemon_icon_(\d{3,4})_(\d{2})(?:_(\d{2}))?(?:_shiny)?\.png$/;
+
+/**
+ * Whether a picture's file name says a costume by its own part: `.c<COSTUME>`
+ * (`pm393.cHALLOWEEN_2021_NOEVOLVE.icon.png`), or the third number of an older picture. A form
+ * part that is a costume is the game data's to say (`isCostumed`).
+ */
+export function pictureSaysCostume(image: unknown): boolean {
+  const file = pictureFile(image);
+  if (file === undefined) return false;
+  const match = PICTURE_NAME.exec(file);
+  if (match) return (match[2] ?? '').split('.').some((part) => /^c[A-Za-z0-9_]+$/.test(part));
+  return OLD_PICTURE_NAME.exec(file)?.[3] !== undefined;
+}
+
+/**
+ * The Pokémon of a name that says what it wears, as Leek Duck names a costume the game data may
+ * not have yet ("Zubat wearing a top hat" is Zubat); undefined for any other name.
+ */
+export function wornBy(name: string): string | undefined {
+  const match = /^(.*\S)\s+wearing\s+\S.*$/i.exec(name);
+  return match?.[1];
+}
+
 /** Form-changing kinds: a form part with one of these tokens is a form of its own. */
 const FORM_CHANGING_TOKENS: ReadonlySet<string> = new Set(['MEGA', 'PRIMAL']);
 
@@ -432,8 +464,11 @@ export function matchBoss(
   lookup: FeedLookup,
   options: { mega?: boolean } = {},
 ): BossIdentity | undefined {
-  const named = picture ? undefined : lookup.findByName(name);
-  const found = picture ? agree(name, picture, lookup) : named && placed(named, 'name');
+  // A costume known by name only ("Zubat wearing a top hat", plan 8R-4) is placed as the
+  // Pokémon that wears it; the id made of a name below keeps the whole name.
+  const placedName = wornBy(name) ?? name;
+  const named = picture ? undefined : lookup.findByName(placedName);
+  const found = picture ? agree(placedName, picture, lookup) : named && placed(named, 'name');
   if (found) {
     const { resolved } = found;
     if (!options.mega || lookup.kindOf(resolved.pokemonId, resolved.form) === 'mega') return found;
@@ -450,7 +485,7 @@ export function matchBoss(
     lookup.speciesName(picture.pokemonId) !== undefined &&
     lookup.kindOf(picture.pokemonId, picture.form) === undefined
   ) {
-    const other = lookup.findByName(name);
+    const other = lookup.findByName(placedName);
     if (!other || other.pokemonId === picture.pokemonId) {
       return {
         pokemonId: picture.pokemonId,
diff --git a/test/fixtures/game-data.json b/test/fixtures/game-data.json
index 9c3b156db98f4831b9610240d6231ca7f488d2f0..668eb373e21642036fbec8715d8a10c2f15cb304 100644
--- a/test/fixtures/game-data.json
+++ b/test/fixtures/game-data.json
@@ -1433,6 +1433,7 @@
 {"key":"pecharunt","form":null,"kind":"species","tempEvolution":null,"dex":1025,"pokemonId":"PECHARUNT","class":"mythical","name":"Pecharunt","types":["poison","ghost"],"stats":{"attack":164,"defense":248,"stamina":186},"fastMoves":["ASTONISH_FAST"],"chargedMoves":["SHADOW_BALL","GUNK_SHOT","POLTERGEIST"],"eliteFastMoves":[],"eliteChargedMoves":[],"family":"PECHARUNT","evolutions":[],"shadow":false,"pokebattlerId":"PECHARUNT"}
 ],
 "aliases":{"aegislash":"aegislash_shield","aerodactyl_summer_2023":"aerodactyl","beartic_winter_2020":"beartic","bewear_wildarea_2025":"bewear","blastoise_copy_2019":"blastoise","bulbasaur_fall_2019":"bulbasaur","caterpie_gofest_2026":"caterpie","charizard_copy_2019":"charizard","charjabug_winter_2025":"charjabug","charmander_fall_2019":"charmander","cherrim":"cherrim_overcast","corsola_spring_2026":"corsola_galarian","cubchoo_winter_2020":"cubchoo","darmanitan":"darmanitan_standard","delibird_winter_2020":"delibird","ditto_spring_2026_a":"ditto","ditto_spring_2026_b":"ditto","eevee_gofest_2024_mtiara":"eevee","eevee_gofest_2024_stiara":"eevee","eiscue":"eiscue_ice","enamorus":"enamorus_incarnate","entei_s":"entei","espeon_gofest_2024_sscarf":"espeon","falinks_gofest_2025_train_conductor":"falinks","gengar_costume_2020":"gengar","gimmighoul_coin_a1":"gimmighoul","gimmighoul_coin_a2_2026":"gimmighoul","giratina":"giratina_altered","gourgeist":"gourgeist_small","ho_oh_s":"ho_oh","hoopa":"hoopa_confined","indeedee":"indeedee_male","koraidon":"koraidon_apex","landorus":"landorus_incarnate","lapras_costume_2020":"lapras","latias_s":"latias","latios_s":"latios","lugia_s":"lugia","lycanroc":"lycanroc_midday","meloetta":"meloetta_aria","miraidon":"miraidon_ultimate","morpeko":"morpeko_full_belly","oricorio":"oricorio_baile","palafin":"palafin_zero","pikachu_adventure_hat_2020":"pikachu","pikachu_anniversary_2026":"pikachu","pikachu_anniversary_2026_malaysia_01":"pikachu","pikachu_anniversary_2026_philippine_01":"pikachu","pikachu_anniversary_2026_singapore_01":"pikachu","pikachu_anniversary_2026_taiwan_01":"pikachu","pikachu_bb_2026":"pikachu","pikachu_copy_2019":"pikachu","pikachu_costume_2020":"pikachu","pikachu_diwali_2024":"pikachu","pikachu_doctor":"pikachu","pikachu_fall_2019":"pikachu","pikachu_flying_01":"pikachu","pikachu_flying_02":"pikachu","pikachu_flying_03":"pikachu","pikachu_flying_04":"pikachu","pikachu_flying_5th_anniv":"pikachu","pikachu_flying_okinawa":"pikachu","pikachu_fossil_2026":"pikachu","pikachu_gofest_2022":"pikachu","pikachu_gofest_2024_mtiara":"pikachu","pikachu_gofest_2024_stiara":"pikachu","pikachu_gofest_2025_goggles_blue":"pikachu","pikachu_gofest_2025_goggles_red":"pikachu","pikachu_gofest_2025_goggles_yellow":"pikachu","pikachu_gofest_2025_monocle_blue":"pikachu","pikachu_gofest_2025_monocle_red":"pikachu","pikachu_gofest_2025_monocle_yellow":"pikachu","pikachu_gofest_2026_cap_blue":"pikachu","pikachu_gofest_2026_cap_red":"pikachu","pikachu_gofest_2026_cap_yellow":"pikachu","pikachu_gotour_2024_a":"pikachu","pikachu_gotour_2024_a_02":"pikachu","pikachu_gotour_2024_b":"pikachu","pikachu_gotour_2024_b_02":"pikachu","pikachu_gotour_2025_a":"pikachu","pikachu_gotour_2025_a_02":"pikachu","pikachu_gotour_2025_b":"pikachu","pikachu_gotour_2025_b_02":"pikachu","pikachu_gotour_2026_a":"pikachu","pikachu_gotour_2026_a_02":"pikachu","pikachu_gotour_2026_b":"pikachu","pikachu_gotour_2026_b_02":"pikachu","pikachu_gotour_2026_c":"pikachu","pikachu_gotour_2026_c_02":"pikachu","pikachu_horizons":"pikachu","pikachu_jeju":"pikachu","pikachu_kariyushi":"pikachu","pikachu_kurta":"pikachu","pikachu_pop_star":"pikachu","pikachu_pxp_2026":"pikachu","pikachu_rock_star":"pikachu","pikachu_summer_2023_a":"pikachu","pikachu_summer_2023_b":"pikachu","pikachu_summer_2023_c":"pikachu","pikachu_summer_2023_d":"pikachu","pikachu_summer_2023_e":"pikachu","pikachu_tshirt_01":"pikachu","pikachu_tshirt_02":"pikachu","pikachu_tshirt_03":"pikachu","pikachu_visor_2026":"pikachu","pikachu_vs_2019":"pikachu","pikachu_wcs_2022":"pikachu","pikachu_wcs_2023":"pikachu","pikachu_wcs_2024":"pikachu","pikachu_wcs_2025":"pikachu","pikachu_wcs_2026":"pikachu","pikachu_winter_2020":"pikachu","psyduck_swim_2025":"psyduck","pumpkaboo":"pumpkaboo_small","raikou_s":"raikou","sableye_costume_2020":"sableye","shaymin":"shaymin_land","slowbro_2021":"slowbro","slowking_2022":"slowking","slowpoke_2020":"slowpoke","snorlax_wildarea_2024":"snorlax","squirtle_fall_2019":"squirtle","sudowoodo_winter_2025":"sudowoodo","suicune_s":"suicune","thundurus":"thundurus_incarnate","tornadus":"tornadus_incarnate","umbreon_gofest_2024_mscarf":"umbreon","venusaur_copy_2019":"venusaur","vikavolt_winter_2025":"vikavolt","wishiwashi":"wishiwashi_solo","wormadam":"wormadam_plant","zacian":"zacian_hero","zamazenta":"zamazenta_hero"},
+"costumes":["aerodactyl_summer_2023","beartic_winter_2020","bewear_wildarea_2025","blastoise_copy_2019","bulbasaur_fall_2019","caterpie_gofest_2026","charizard_copy_2019","charjabug_winter_2025","charmander_fall_2019","corsola_spring_2026","cubchoo_winter_2020","delibird_winter_2020","ditto_spring_2026_a","ditto_spring_2026_b","eevee_gofest_2024_mtiara","eevee_gofest_2024_stiara","espeon_gofest_2024_sscarf","falinks_gofest_2025_train_conductor","gengar_costume_2020","gimmighoul_coin_a1","gimmighoul_coin_a2_2026","lapras_costume_2020","pikachu_adventure_hat_2020","pikachu_anniversary_2026","pikachu_anniversary_2026_malaysia_01","pikachu_anniversary_2026_philippine_01","pikachu_anniversary_2026_singapore_01","pikachu_anniversary_2026_taiwan_01","pikachu_bb_2026","pikachu_copy_2019","pikachu_costume_2020","pikachu_diwali_2024","pikachu_doctor","pikachu_fall_2019","pikachu_flying_01","pikachu_flying_02","pikachu_flying_03","pikachu_flying_04","pikachu_flying_5th_anniv","pikachu_flying_okinawa","pikachu_fossil_2026","pikachu_gofest_2022","pikachu_gofest_2024_mtiara","pikachu_gofest_2024_stiara","pikachu_gofest_2025_goggles_blue","pikachu_gofest_2025_goggles_red","pikachu_gofest_2025_goggles_yellow","pikachu_gofest_2025_monocle_blue","pikachu_gofest_2025_monocle_red","pikachu_gofest_2025_monocle_yellow","pikachu_gofest_2026_cap_blue","pikachu_gofest_2026_cap_red","pikachu_gofest_2026_cap_yellow","pikachu_gotour_2024_a","pikachu_gotour_2024_a_02","pikachu_gotour_2024_b","pikachu_gotour_2024_b_02","pikachu_gotour_2025_a","pikachu_gotour_2025_a_02","pikachu_gotour_2025_b","pikachu_gotour_2025_b_02","pikachu_gotour_2026_a","pikachu_gotour_2026_a_02","pikachu_gotour_2026_b","pikachu_gotour_2026_b_02","pikachu_gotour_2026_c","pikachu_gotour_2026_c_02","pikachu_horizons","pikachu_jeju","pikachu_kariyushi","pikachu_kurta","pikachu_pop_star","pikachu_pxp_2026","pikachu_rock_star","pikachu_summer_2023_a","pikachu_summer_2023_b","pikachu_summer_2023_c","pikachu_summer_2023_d","pikachu_summer_2023_e","pikachu_tshirt_01","pikachu_tshirt_02","pikachu_tshirt_03","pikachu_visor_2026","pikachu_vs_2019","pikachu_wcs_2022","pikachu_wcs_2023","pikachu_wcs_2024","pikachu_wcs_2025","pikachu_wcs_2026","pikachu_winter_2020","psyduck_swim_2025","sableye_costume_2020","slowbro_2021","slowking_2022","slowpoke_2020","snorlax_wildarea_2024","squirtle_fall_2019","sudowoodo_winter_2025","umbreon_gofest_2024_mscarf","venusaur_copy_2019","vikavolt_winter_2025"],
 "moves":[
 {"id":"WRAP","number":13,"name":"Wrap","type":"normal","fast":false,"power":60,"energyDelta":-33,"durationMs":3000},
 {"id":"HYPER_BEAM","number":14,"name":"Hyper Beam","type":"normal","fast":false,"power":150,"energyDelta":-100,"durationMs":4000},
````

### Task 2: 8R-4 task 2: Costumed wants and their matching

Prototype commit: `4ec440f5fcb41cdbd2651a680592bd7379eaa9a6`

Migration 030 adds costumed to PokemonNotification and TargetWant, a
property of the row like the scope: tokens, keys and ids are unchanged.
The repositories and their twins read and write it (plain wins where rows
of one target disagree; a target added again takes the costume of its
add). Every sighting carries costumed: a raid boss as the list has it in
the raid's own tier (a staff override's costume included), a spawn as its
news says, a research reward by its Leek Duck name and picture, max
bosses and Rocket catches never. A costumed want fits only a costumed
sighting, under the form the costume copies; the matchers hand the wants
back so a DM names "Costumed Pikachu". A plain and a costumed reward of a
task stay two.

**Files:**

```
 docs/architecture/notifications-and-dms.md             |   1 +
 docs/architecture/stop-reports.md                      |   2 +-
 docs/architecture/utilities.md                         |   2 +-
 src/db/migrations/2026_10_22_030_costumed_wants.ts     |  33 +++++++++++++
 src/db/migrations/index.ts                             |   2 +
 src/db/migrator.db.test.ts                             |   2 +
 src/db/repositories/pokemon-notification-repository.ts |  35 ++++++++++++--
 src/db/repositories/target-want-repository.ts          |  71 +++++++++++++++++----------
 src/db/repositories/want-box-repository.ts             |  47 +++++++++++++++---
 src/db/types.ts                                        |   2 +
 src/domain/notify/reasons.test.ts                      | 101 +++++++++++++++++++++++++++++++++++---
 src/domain/notify/reasons.ts                           | 150 ++++++++++++++++++++++++++++++++++++++-------------------
 src/domain/notify/target-wants.ts                      |  38 ++++++++++++---
 src/domain/pogo/costumes.ts                            |  19 ++++++--
 src/domain/pogo/notification-target.ts                 |  20 +++++++-
 src/domain/pogo/raid-bosses.test.ts                    |  41 ++++++++++++++++
 src/domain/pogo/raid-bosses.ts                         |  37 +++++++++++++-
 src/domain/pogo/want-boxes.ts                          |  15 +++++-
 src/domain/pogo/wants.test.ts                          |  55 +++++++++++++++++++++
 src/domain/pogo/wants.ts                               |  79 +++++++++++++++++++++++-------
 src/domain/research/leekduck.test.ts                   |  26 ++++++++++
 src/domain/research/leekduck.ts                        |  19 +++++---
 src/render/raid-post.test.ts                           |  24 +++++++++
 src/render/raid-post.ts                                |   8 +++
 src/services/notify-service.test.ts                    |  22 +++++++++
 src/services/notify-service.ts                         |  37 +++++++++-----
 src/services/spawn-service.ts                          |   2 +
 test/support/target-want-cases.ts                      |  17 +++++++
 test/support/target-wants.ts                           |  30 ++++++++++--
 test/support/want-box-cases.ts                         |  22 +++++++++
 test/support/want-boxes.ts                             |  13 +++--
 test/support/wants.ts                                  |  21 +++++---
 32 files changed, 824 insertions(+), 169 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/notify/reasons.test.ts src/domain/pogo/raid-bosses.test.ts src/domain/pogo/wants.test.ts src/domain/research/leekduck.test.ts src/render/raid-post.test.ts src/services/notify-service.test.ts`); all pass. Its database test files (`src/db/migrator.db.test.ts`) run with the database suite at the tip.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 4ec440f5fcb41cdbd2651a680592bd7379eaa9a6 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4 task 2: Costumed wants and their matching`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index dc8ea72e1cecabe64e8972d555ea4c2b1529e565..c89dfe0e93e70c1c9ceae2cc64d36eb19c24c031 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -5,6 +5,7 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 ## Wants and gym targets
 
 - A want (`PokemonNotification`) is per member and server and is one of: a species (every form, megas included), one form (`form`, a catalogue key), the shadow raids of either (`shadow`; since plan 8R-2 shadow raids and Team GO Rocket catches, the Shadow box), a raid tier (raids only), perfect or zero IVs (spawns only); a mega is raids only. The columns are read and written only through the codec (`notification-target.ts`: `readNotification` gives the target and the scope in effect; a row it cannot read is skipped, counted and never deleted on its own) and the pure functions of `src/domain/pogo/wants.ts` (`readWants`, `planSetWant`, `rowsOfWant`: duplicate legacy rows are one want with the union of their scopes, two keys of one catalogue entry are one want, a row is rewritten only when its meaning changes). `ctx.wants` (`WantStorage`: `list`, `set`, `remove`, `removeAll`, `count`) is the repository; `MemoryWants` (`test/support/wants.ts`) is its twin and runs the same functions. `pokemonWantFits(catalogue, target, entry, shadowRaid)` says whether a want is for a boss or a spawn. Since plan 8R-1 a raid scope means raids only (no max battles), and the legacy `!wants` codec and the scope rules (`planSetWant`, `widerScope`) are unchanged.
+- **Costumed wants** (plan 8R-4, migration 030; design `2026-10-22-costume-form-wants-design.md`): `PokemonNotification.costumed` and `TargetWant.costumed` (tinyint, default 0) make a Pokémon's want costumed only, a property of the row like the scope, never part of its target, token, unique key or id (`Want.costumed?: true`, a Pokémon's `TargetWant.costumed?: true`; `boxTarget(kind, dex, form, costumed)`, `withCostume`, `isCostumedTarget`; a Stop or Remove takes the row whatever its costume). Rows of one target that disagree read as plain (`readWants`: plain wins, as the wider scope); `planSetWant(…, costumed)` rewrites a row whose costume differs; a `TargetWant` added again takes the costume of its add (an upsert per costume, `createdAt` kept). Every sighting carries `costumed` (`PokemonSighting`): a raid's boss as the list has it in the raid's tier (`ShownBoss.costumed`), a spawn as `SpawnNews.costumed` says, a research reward by `rewardCostumed` (its Leek Duck name and picture, worked out when read), a max boss and a Rocket catch never. `pokemonWantFits(…, costumed)` fits a costumed want only to a costumed sighting, under the entry the costume copies; a plain want fits either. The matchers (`raidWantsFiring`, `spawnWantsFiring`, `rocketShadowFiring`) give the wants themselves, so a reason carries `costumed` (`wantReason`) and the DM names it "Costumed Pikachu" (`wantTargetLabel(…, costumed)`, `pokemonWantName({ costumed })`: no "(every form)", "Costumed Corsola"), a target "Costumed Pikachu (research)" (`targetWantLabel`); members told of one event share a message only where their reasons read alike (`shownReasonKey`).
 - What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy, written at once with no dialog (`rocketWantAnswer`: a grunt type at most one DM an hour for each type). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (`wantbox:p<dex>:set:<shown>[:<form>]`, `wantbox:t:set:<level>:<shown>`, `<shown>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `wantBoxId`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock (`WantBoxStorage.set`, `planBoxes`; `WantBoxRepository`, twin `MemoryWantBoxes`); nothing ticked takes the target off. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
 - What a member picked in the `target` option of `/want` or `/unwant` is a want token (`wantToken` / `parseWantToken`: `pokemon:<dex>[:<form>][:shadow]`, `tier:<level>[:shadow]`, `iv:perfect|zero`): the value of an autocomplete choice, never part of a custom id. Text sent without picking never guesses (`readWantText`): it acts only when it is a tier or IV word in full (`wantWord`), exactly a species' name (every form) or exactly one form's own name, with `shadow` before either; anything else is refused with suggestions. A bare number is a tier or IV word, never a Pokédex number.
 - Wants are named in one way everywhere (`wantLabel` / `wantName` in `src/commands/notifications/want-input.ts`): "X (every form)" for a species with several entries, "X (base form)" for its plain entry, "Shadow X", and the scope after " · " in the choices of `/unwant`.
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index 785174c704d4ac8985cc74316e079fa782c8647e..33fa5751fd6cae3885e82364750ecfd01ea052c0 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -18,7 +18,7 @@ What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/202
 ## The task list
 
 - `settings.research` has a default for every key (always on, no switch): `url` (Leek Duck's `https://leekduck.com/research/`), `refreshHours` 1, `staleAfterHours` 6 (refused below twice `refreshHours`), `throttle` `{ uses: 10, minutes: 30 }`.
-- `ResearchTaskService` (`ctx.researchTasks`: `tasks()`, `byKey`, `readAt`, `stale(now)`: none read, or not anew for `staleAfterHours`, the one rule of "out of date" for its log, its shrink guard and the map's pick list, plan 8R-3) reads the page every `refreshHours` with Pine's User-Agent (`PINE_USER_AGENT`) and a byte cap (`readLimitedText`, `MAX_RESEARCH_PAGE_BYTES`), parses it (`parseResearchPage`, `src/domain/research/leekduck.ts`: tasks by category, rewards of `data-reward-type` `encounter` (a catalogue entry, shiny or not), `item` (key and quantity) and `resource` (Mega Energy of a species); the breakthrough is skipped), and keeps the last good list in `ResearchTask` so a start without the network still offers it. A read with fewer than half the tasks of the list in use is a warning and the list stays, unless the read before it listed the very same tasks or the list in use is older than `staleAfterHours` (then the page did shrink, and the smaller list is taken: a real shrink is never refused for good); a page of no task at all is a failed read (`parseResearchPage` throws), so it never empties the list, however often it comes; a list not read for `staleAfterHours` is said once in the log. The kept list keeps the page's order. A task's key is `taskKeyOf` (an FNV-1a hash of `foldTaskText`), the value of its choice.
+- `ResearchTaskService` (`ctx.researchTasks`: `tasks()`, `byKey`, `readAt`, `stale(now)`: none read, or not anew for `staleAfterHours`, the one rule of "out of date" for its log, its shrink guard and the map's pick list, plan 8R-3) reads the page every `refreshHours` with Pine's User-Agent (`PINE_USER_AGENT`) and a byte cap (`readLimitedText`, `MAX_RESEARCH_PAGE_BYTES`), parses it (`parseResearchPage`, `src/domain/research/leekduck.ts`: tasks by category, rewards of `data-reward-type` `encounter` (a catalogue entry, shiny or not; a plain and a costumed one of a task listed twice stay two, plan 8R-4, `rewardKey` with `costumedByName`), `item` (key and quantity) and `resource` (Mega Energy of a species); the breakthrough is skipped), and keeps the last good list in `ResearchTask` so a start without the network still offers it. A read with fewer than half the tasks of the list in use is a warning and the list stays, unless the read before it listed the very same tasks or the list in use is older than `staleAfterHours` (then the page did shrink, and the smaller list is taken: a real shrink is never refused for good); a page of no task at all is a failed read (`parseResearchPage` throws), so it never empties the list, however often it comes; a list not read for `staleAfterHours` is said once in the log. The kept list keeps the page's order. A task's key is `taskKeyOf` (an FNV-1a hash of `foldTaskText`), the value of its choice.
 - Whether the page shows an event's own tasks while the event runs is not known before 2026-11-09 (design 4.1): nothing reads event pages; a missing task is typed in full.
 
 ## Research periods
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 09439a0bfad00eb4ea38d3083c8992558e8eeb6e..e4269f90ebfdc7bc4a499d2c55ebd88864b55185 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -20,7 +20,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 
 - Raid tiers are `RaidTier` values (`src/domain/pogo/raid-tier.ts`), never bare numbers. `PokemonNotification.pokemon` is read and written only through the codec in `notification-target.ts`.
 - There is no EX raid tier (removed in plan 4F; none since 2020): `RaidLevel` has no `EX`. What is stored with it is tolerated, never written: a raid's state document reads `EX` as `Elite`, `RaidBoss` rows with an unknown level are left out, an override with one is logged once, the feed's EX heading is an unknown heading, the retired settings keys are stripped before the strict check (`withoutRetiredSettings`), and migration 009 made EX wants elite wants. Elite raids are rare (Matt, 2026-10-12): wherever they compete with another feature the other feature wins. Elite raid gyms are another matter: they keep their data, staff's views and their copies, but members no longer see the mark (plan 8D; see `gyms-and-regions.md`).
-- Raid bosses come from `ctx.raidBosses` (`bosses()`, `bossesOf(tier)`, `autoset(tier)`): the feed's list (`settings.raidBosses`, synced into the `RaidBoss` table by `RaidBossService`) with the moderators' overrides (`RaidBossOverride`) applied. A boss newer than the game master has no catalogue entry (`entry` is undefined): show its `name`. The legacy `Pokemon.tier` / `exclusive` / `mega` / `elite` / `shiny` columns and `AutosetPokemon` are never read. The feed is ScrapedDuck's `raids.json` (Leek Duck's raid boss page as data): a boss is a display name, a heading text and a picture address, and `matchBoss` (`src/domain/pogo/raid-boss-feed.ts`) gives it a catalogue entry only when the picture's file name (`pm<dex>.f<FORM>.icon.png`) and the name do not contradict each other; otherwise it stays unresolved (listed by the feed's name, without stats), never the wrong Pokémon. `raid-boss-sweep.test.ts` checks every entry of the catalogue; a heading Pine does not know is reported, its bosses left out. `npm run raid-bosses:check` shows how the live feed is read.
+- Raid bosses come from `ctx.raidBosses` (`bosses()`, `bossesOf(tier)`, `autoset(tier)`): the feed's list (`settings.raidBosses`, synced into the `RaidBoss` table by `RaidBossService`) with the moderators' overrides (`RaidBossOverride`) applied. A boss newer than the game master has no catalogue entry (`entry` is undefined): show its `name`. The legacy `Pokemon.tier` / `exclusive` / `mega` / `elite` / `shiny` columns and `AutosetPokemon` are never read. The feed is ScrapedDuck's `raids.json` (Leek Duck's raid boss page as data): a boss is a display name, a heading text and a picture address, and `matchBoss` (`src/domain/pogo/raid-boss-feed.ts`) gives it a catalogue entry only when the picture's file name (`pm<dex>.f<FORM>.icon.png`) and the name do not contradict each other; otherwise it stays unresolved (listed by the feed's name, without stats), never the wrong Pokémon. `raid-boss-sweep.test.ts` checks every entry of the catalogue; a heading Pine does not know is reported, its bosses left out. `npm run raid-bosses:check` shows how the live feed is read. A boss of the list in effect is `costumed` (plan 8R-4) when a feed row of it in its tier is by `isCostumed` (its name, picture and ids; `RAID_OPS.costumed`), an override by its ids alone; a costumed and a plain row of one tier are one boss, costumed; never a max boss (`MAX_OPS` has no `costumed`). `shownBoss` copies it from the boss of the raid's own tier only (`ShownBoss.costumed`), never from another tier's.
 - Staff change the raid boss list only through `ctx.raidBossAdmin` (`RaidBossService` as `RaidBossAdmin`: overrides, `feedBosses()`, `sync()`; override writes and the end of a sync run one at a time). A sync's change is `FeedChange` with `seen`, the difference of `effectiveBosses` before and after with the same overrides (`diffBosses`, `src/domain/pogo/boss-diff.ts`): what members see. `RaidBossAnnouncer` posts `seen` in every server's bot-updates channel when `settings.raidBosses.announceChanges`, and the out-of-date warning (time, never the error) in the moderators' channel; nothing before `ready()`, nothing after `close()`. A failed sync has a `kind` (never show `reason`). A new autoset for a tier replaces the tier's earlier one. A boss the game data does not know has a key starting with `UNKNOWN_KEY_PREFIX` (`~`), never equal to a catalogue key and never stored; `howIdentified` says how a feed boss was matched.
 - Both boss lists are one machine with two families (plan 8X-2): `BossFeedService<T>` (`src/services/boss-feed-service.ts`: the stored list at start, the first read when it is older than the refresh, retries, the out-of-date warning, override writes one at a time) with a `BossFeedFamily` (its noun in the log, its parser, its list in effect, its override rules); `RaidBossService` and `MaxBossService` are its families. The list rules (`familyBosses`, `familyOverrideKeys`, `familyReport`, `diffFeedIn`, `diffBossesIn`) take the family's tier operations (`RAID_OPS`, `MAX_OPS`); `effectiveBosses`, `bossReport` and the rest keep their raid signatures. The tables are kept apart per family by their levels (`RaidBossRepository`: every level but the max tiers, so the retired EX level stays the raids' to report; `MaxBossRepository`: `MAX_TIERS`): every read and write filters by the family, and an override without a tier (a shiny one for every tier) is a raid override.
 - Max battle tiers are `MaxTier` (`D1` to `D5`, `G`; `src/domain/pogo/max-tier.ts`), the one spelling in the domain, the state document, `RaidBoss.level` and the history; `BattleKind` (`raid`, `dynamax`, `gigantamax`, `battleKindOf(tier)`) is only for lobby sizes and train kinds; their words are there too (`maxTierLabel` "Dynamax 2★", `maxBossTitle` "Dynamax Machamp (2★)", `maxBossChoiceName` "Machamp · Dynamax 2★" / "Gigantamax Machamp").
diff --git a/src/db/migrations/2026_10_22_030_costumed_wants.ts b/src/db/migrations/2026_10_22_030_costumed_wants.ts
new file mode 100644
index 0000000000000000000000000000000000000000..894f967fc887ed02b7141e2f7e1f593a7be86c96
--- /dev/null
+++ b/src/db/migrations/2026_10_22_030_costumed_wants.ts
@@ -0,0 +1,33 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * Costumed wants (plan 8R-4; design `2026-10-22-costume-form-wants-design.md`, section 2): a
+ * Pokémon want, of either table, may be for costumed sightings only. `PokemonNotification.costumed`
+ * and `TargetWant.costumed` say so with 1; 0, the default, is every row from before and means
+ * costumed and plain alike. A property of the row, like `PokemonNotification.type`: tokens,
+ * unique keys and ids are unchanged. Read and written only through the codec of
+ * `src/domain/pogo/notification-target.ts` and `TargetWantRepository`.
+ *
+ * The legacy bot names its columns when it reads and writes `PokemonNotification`, so it does not
+ * see the new one; until the cutover it never runs on a database with such rows.
+ *
+ * Safe to run again after a failure half-way: a column is added only when it is missing.
+ */
+export const costumedWants: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    for (const table of ['PokemonNotification', 'TargetWant']) {
+      const existing = await sql<{ n: number }>`
+        select count(*) as n from information_schema.columns
+        where table_schema = database() and table_name = ${table}
+          and column_name = 'costumed'`.execute(db);
+      if (Number(existing.rows[0]?.n ?? 0) > 0) continue;
+      await sql`alter table ${sql.table(table)} add column costumed
+        tinyint(1) not null default 0`.execute(db);
+    }
+  },
+  async down() {
+    // Additive only: the columns stay.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index 2ef80c72ce42614b49ee18119386b857d1e9575a..903d6c60a7c98b5720d89a556e1ee006b5ddaff3 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -28,6 +28,7 @@ import { trainSpotStops } from './2026_10_21_026_train_spot_stops.js';
 import { stopReports } from './2026_10_21_027_stop_reports.js';
 import { rocket } from './2026_10_22_028_rocket.js';
 import { maxEvents } from './2026_10_22_029_max_events.js';
+import { costumedWants } from './2026_10_22_030_costumed_wants.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -63,4 +64,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_21_027_stop_reports': stopReports,
   '2026_10_22_028_rocket': rocket,
   '2026_10_22_029_max_events': maxEvents,
+  '2026_10_22_030_costumed_wants': costumedWants,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index eb7d4f95d0cc1ddb5ccd0a1238dafe98058852cc..87d20a6be658367bad84741fed47bc9789a7c243 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -72,6 +72,7 @@ const ADDED_COLUMNS = [
   'Region.summaryMessageId',
   'PokemonNotification.form',
   'PokemonNotification.shadow',
+  'PokemonNotification.costumed',
   'Role.roleSnowflake',
   'Role.groupId',
   'SavedRoutes.atEnd',
@@ -189,6 +190,7 @@ describe('runMigrations', () => {
       '2026_10_21_027_stop_reports',
       '2026_10_22_028_rocket',
       '2026_10_22_029_max_events',
+      '2026_10_22_030_costumed_wants',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/repositories/pokemon-notification-repository.ts b/src/db/repositories/pokemon-notification-repository.ts
index 3941890bf89c73c53133266a16081e82b43a537e..07a99c9a1a84686beb9e8bdb8b9c1291e6e4e709 100644
--- a/src/db/repositories/pokemon-notification-repository.ts
+++ b/src/db/repositories/pokemon-notification-repository.ts
@@ -29,13 +29,14 @@ export interface WantStorage {
   /**
    * Sets a want: a new one, or the scope of the one the member has for this target. The scope
    * is corrected as the codec does (a tier is `raid`, an IV target `spawn`); the outcome says
-   * what is stored.
+   * what is stored. `costumed` (plan 8R-4) makes a Pokémon's want costumed only, else plain.
    */
   set(
     memberId: string,
     guildId: string,
     target: NotificationTarget,
     scope: NotificationScope,
+    costumed?: boolean,
   ): Promise<SetWantOutcome>;
   /** Removes the want for a target; false when the member had none. */
   remove(memberId: string, guildId: string, target: NotificationTarget): Promise<boolean>;
@@ -59,6 +60,20 @@ export interface WantStorage {
   wanting(guildId: string, numbers: readonly number[]): Promise<MemberWants[]>;
 }
 
+/**
+ * A row's values as the columns of `PokemonNotification` hold them: the flags as 0 or 1, and
+ * `costumed` always said (a plain want written over a costumed row makes it plain).
+ */
+export function notificationColumns(values: EncodedNotification) {
+  return {
+    pokemon: values.pokemon,
+    type: values.type,
+    form: values.form,
+    shadow: values.shadow ? 1 : 0,
+    costumed: values.costumed === true ? 1 : 0,
+  };
+}
+
 /**
  * The legacy table `PokemonNotification`: `userId` and `guildId` are row ids of `User` and
  * `Guild`; `pokemon` and `type`, and the columns `form` and `shadow` this bot added, are read
@@ -99,7 +114,7 @@ export class PokemonNotificationRepository implements WantStorage {
   private async rows(db: Kysely<DB>, member: MemberInGuild): Promise<WantRow[]> {
     const rows = await db
       .selectFrom('PokemonNotification')
-      .select(['id', 'pokemon', 'type', 'form', 'shadow'])
+      .select(['id', 'pokemon', 'type', 'form', 'shadow', 'costumed'])
       .where('userId', '=', member.userId)
       .where('guildId', '=', member.guildId)
       .orderBy('id')
@@ -111,12 +126,13 @@ export class PokemonNotificationRepository implements WantStorage {
       type: row.type,
       form: row.form,
       shadow: row.shadow !== 0,
+      costumed: row.costumed !== 0,
     }));
   }
 
   /** The values of a row as the columns hold them. */
   private columns(values: EncodedNotification) {
-    return { ...values, shadow: values.shadow ? 1 : 0 };
+    return notificationColumns(values);
   }
 
   async list(memberId: string, guildId: string): Promise<WantList> {
@@ -138,7 +154,14 @@ export class PokemonNotificationRepository implements WantStorage {
       .selectFrom('PokemonNotification as n')
       .innerJoin('Guild as g', 'g.id', 'n.guildId')
       .innerJoin('User as u', 'u.id', 'n.userId')
-      .select(['u.userSnowflake as memberId', 'n.pokemon', 'n.type', 'n.form', 'n.shadow'])
+      .select([
+        'u.userSnowflake as memberId',
+        'n.pokemon',
+        'n.type',
+        'n.form',
+        'n.shadow',
+        'n.costumed',
+      ])
       .where('g.snowflake', '=', guildId)
       .where('n.pokemon', 'in', asked)
       .orderBy('n.id')
@@ -154,6 +177,7 @@ export class PokemonNotificationRepository implements WantStorage {
                 type: row.type,
                 form: row.form,
                 shadow: row.shadow !== 0,
+                costumed: row.costumed !== 0,
               },
             ],
       ),
@@ -166,10 +190,11 @@ export class PokemonNotificationRepository implements WantStorage {
     guildId: string,
     target: NotificationTarget,
     scope: NotificationScope,
+    costumed = false,
   ): Promise<SetWantOutcome> {
     return this.locked(memberId, guildId, true, async (trx, member) => {
       if (!member) throw new Error(`No rows for member ${memberId} in server ${guildId}`);
-      const plan = planSetWant(await this.rows(trx, member), target, scope, this.forms);
+      const plan = planSetWant(await this.rows(trx, member), target, scope, this.forms, costumed);
       if (plan.insert) {
         await trx
           .insertInto('PokemonNotification')
diff --git a/src/db/repositories/target-want-repository.ts b/src/db/repositories/target-want-repository.ts
index 99fa066a5fc262b1f31bb0098a91168c6f6b539c..3d69f75a454cacc9e0a4119422958ed1e217d18c 100644
--- a/src/db/repositories/target-want-repository.ts
+++ b/src/db/repositories/target-want-repository.ts
@@ -1,7 +1,9 @@
 import type { Kysely } from 'kysely';
 import {
+  isCostumedTarget,
   parseTargetWantToken,
   targetWantToken,
+  withCostume,
   type TargetWant,
 } from '../../domain/notify/target-wants.js';
 import type { DB } from '../types.js';
@@ -73,15 +75,17 @@ export class TargetWantRepository implements TargetWantStorage {
     return withMemberLocked(this.db, memberId, guildId, create, work, this.ids);
   }
 
-  private async tokens(db: Kysely<DB>, member: MemberInGuild): Promise<string[]> {
-    const rows = await db
+  private async tokens(
+    db: Kysely<DB>,
+    member: MemberInGuild,
+  ): Promise<{ target: string; costumed: number }[]> {
+    return db
       .selectFrom('TargetWant')
-      .select('target')
+      .select(['target', 'costumed'])
       .where('guildId', '=', member.guildId)
       .where('userId', '=', member.userId)
       .orderBy('id')
       .execute();
-    return rows.map((row) => row.target);
   }
 
   async list(memberId: string, guildId: string): Promise<TargetWantList> {
@@ -89,8 +93,8 @@ export class TargetWantRepository implements TargetWantStorage {
     if (!member) return { wants: [], unreadable: 0 };
     const wants: TargetWant[] = [];
     let unreadable = 0;
-    for (const token of await this.tokens(this.db, member)) {
-      const want = parseTargetWantToken(token);
+    for (const row of await this.tokens(this.db, member)) {
+      const want = targetWantOfRow(row);
       if (want) wants.push(want);
       else unreadable += 1;
     }
@@ -107,13 +111,13 @@ export class TargetWantRepository implements TargetWantStorage {
     if (!member) return [];
     const rows = await this.db
       .selectFrom('TargetWant')
-      .select('target')
+      .select(['target', 'costumed'])
       .where('guildId', '=', member.guildId)
       .where('userId', '=', member.userId)
       .where('target', 'in', targets.map(targetWantToken))
       .orderBy('id')
       .execute();
-    return rows.flatMap((row) => parseTargetWantToken(row.target) ?? []);
+    return rows.flatMap((row) => targetWantOfRow(row) ?? []);
   }
 
   async change(
@@ -167,14 +171,14 @@ export class TargetWantRepository implements TargetWantStorage {
       .selectFrom('TargetWant as w')
       .innerJoin('Guild as g', 'g.id', 'w.guildId')
       .innerJoin('User as u', 'u.id', 'w.userId')
-      .select(['u.userSnowflake as memberId', 'w.target'])
+      .select(['u.userSnowflake as memberId', 'w.target', 'w.costumed'])
       .where('g.snowflake', '=', guildId)
       .where('w.target', 'in', asked)
       .orderBy('w.id')
       .execute();
     const byMember = new Map<string, TargetWant[]>();
     for (const row of rows) {
-      const want = parseTargetWantToken(row.target);
+      const want = targetWantOfRow(row);
       if (row.memberId === null || !want) continue;
       const known = byMember.get(row.memberId);
       if (known) known.push(want);
@@ -184,10 +188,17 @@ export class TargetWantRepository implements TargetWantStorage {
   }
 }
 
+/** A row as the target it holds, costumed as its column says; undefined for one unreadable. */
+function targetWantOfRow(row: { target: string; costumed: number }): TargetWant | undefined {
+  const want = parseTargetWantToken(row.target);
+  return want && withCostume(want, row.costumed !== 0);
+}
+
 /**
  * Adds and removes a member's targets in a transaction that holds their row locked
  * (`withMemberLocked`): for the dialog of `/want`, which writes these with the member's
- * `PokemonNotification` rows in one transaction. A target there already is not made again.
+ * `PokemonNotification` rows in one transaction. A target there already is not made again, but
+ * takes the `costumed` of its add (plan 8R-4).
  */
 export async function changeTargetWants(
   trx: Kysely<DB>,
@@ -206,19 +217,27 @@ export async function changeTargetWants(
   }
   const added = [...new Set(change.add.map(targetWantToken))];
   if (added.length === 0) return;
-  // A target there already stays as it is (the unique key: the update changes nothing), without
-  // a read first. Not `insert ignore`, which would make a missing parent row (MySQL's 1452, which
-  // `withMemberLocked` answers by trying again) a warning.
-  await trx
-    .insertInto('TargetWant')
-    .values(
-      added.map((target) => ({
-        guildId: member.guildId,
-        userId: member.userId,
-        target,
-        createdAt: String(at),
-      })),
-    )
-    .onDuplicateKeyUpdate((eb) => ({ createdAt: eb.ref('TargetWant.createdAt') }))
-    .execute();
+  const costumedTokens = new Set(change.add.filter(isCostumedTarget).map(targetWantToken));
+  // A target there already keeps its row and `createdAt` and takes the costume of its add (the
+  // unique key), without a read first: one statement per costume, so mostly one. Not `insert
+  // ignore`, which would make a missing parent row (MySQL's 1452, which `withMemberLocked`
+  // answers by trying again) a warning; not `values(costumed)`, which MySQL 8 deprecates.
+  const costumeOf = (token: string): number => (costumedTokens.has(token) ? 1 : 0);
+  // In the order of the adds, so that the rows are made in it.
+  for (const costumed of new Set(added.map(costumeOf))) {
+    const tokens = added.filter((token) => costumeOf(token) === costumed);
+    await trx
+      .insertInto('TargetWant')
+      .values(
+        tokens.map((target) => ({
+          guildId: member.guildId,
+          userId: member.userId,
+          target,
+          createdAt: String(at),
+          costumed,
+        })),
+      )
+      .onDuplicateKeyUpdate({ costumed })
+      .execute();
+  }
 }
diff --git a/src/db/repositories/want-box-repository.ts b/src/db/repositories/want-box-repository.ts
index b9909c813d81fc73b545caf23ff2b9fad7e65c46..b892de777a976d44819034b56821e9d853b44268 100644
--- a/src/db/repositories/want-box-repository.ts
+++ b/src/db/repositories/want-box-repository.ts
@@ -1,5 +1,10 @@
 import type { Kysely } from 'kysely';
-import { parseTargetWantToken, targetWantToken } from '../../domain/notify/target-wants.js';
+import {
+  parseTargetWantToken,
+  targetWantToken,
+  withCostume,
+  type TargetWant,
+} from '../../domain/notify/target-wants.js';
 import {
   tierCode,
   type EncodedNotification,
@@ -25,6 +30,7 @@ import {
 import { raidTier } from '../../domain/pogo/raid-tier.js';
 import type { DB } from '../types.js';
 import { findMemberInGuild, withMemberLocked, type MemberInGuild } from './member-rows.js';
+import { notificationColumns } from './pokemon-notification-repository.js';
 import { RowIds } from './row-ids.js';
 import { changeTargetWants } from './target-want-repository.js';
 
@@ -48,7 +54,8 @@ export interface WantBoxStorage {
   /**
    * Makes the boxes the dialog showed (`shown`) as `ticked`, the others as they are, in one
    * transaction under the member's lock (`withMemberLocked`); nothing ticked takes them away.
-   * `at` is when, for a `TargetWant` row that is made.
+   * `at` is when, for a `TargetWant` row that is made. `costumed` (plan 8R-4) is written to
+   * every row of the subject that stands after it, in both tables.
    */
   set(
     memberId: string,
@@ -57,6 +64,7 @@ export interface WantBoxStorage {
     ticked: ReadonlySet<WantBox>,
     shown: readonly WantBox[],
     at: number,
+    costumed?: boolean,
   ): Promise<BoxChange>;
 }
 
@@ -70,6 +78,24 @@ function numbersOf(subject: BoxSubject): number[] {
   });
 }
 
+/**
+ * The `TargetWant` rows a plan writes, with `costumed` (plan 8R-4): every box that stands after
+ * it is written again (an upsert that keeps its row), so that a changed costume reaches the rows
+ * that were there already.
+ */
+export function costumedTargets(
+  subject: BoxSubject,
+  plan: { after: ReadonlySet<WantBox>; targets: { remove: TargetWant[] } },
+  costumed: boolean,
+): { add: TargetWant[]; remove: TargetWant[] } {
+  return {
+    add: targetWantsOf(subject).flatMap(([box, want]) =>
+      plan.after.has(box) ? [withCostume(want, costumed)] : [],
+    ),
+    remove: plan.targets.remove,
+  };
+}
+
 /** The `PokemonNotification` and `TargetWant` tables, for the boxes of a subject. */
 export class WantBoxRepository implements WantBoxStorage {
   /** `forms` reads a stored form (`formReader`); `ids` the process's memory of rows. */
@@ -86,7 +112,7 @@ export class WantBoxRepository implements WantBoxStorage {
   ): Promise<WantRow[]> {
     const rows = await db
       .selectFrom('PokemonNotification')
-      .select(['id', 'pokemon', 'type', 'form', 'shadow'])
+      .select(['id', 'pokemon', 'type', 'form', 'shadow', 'costumed'])
       .where('userId', '=', member.userId)
       .where('guildId', '=', member.guildId)
       .where('pokemon', 'in', numbersOf(subject))
@@ -98,6 +124,7 @@ export class WantBoxRepository implements WantBoxStorage {
       type: row.type,
       form: row.form,
       shadow: row.shadow !== 0,
+      costumed: row.costumed !== 0,
     }));
   }
 
@@ -133,6 +160,7 @@ export class WantBoxRepository implements WantBoxStorage {
     ticked: ReadonlySet<WantBox>,
     shown: readonly WantBox[],
     at: number,
+    costumed = false,
   ): Promise<BoxChange> {
     const adds = shown.some((box) => ticked.has(box));
     return withMemberLocked(
@@ -144,10 +172,12 @@ export class WantBoxRepository implements WantBoxStorage {
         if (!member) return { before: new Set<WantBox>(), after: new Set<WantBox>() };
         const { rows, held } = await this.heldIn(trx, member, subject);
         const plan = planBoxes(subject, held, ticked, shown);
-        await this.setRow(trx, member, rows, baseTarget(subject), plan.base);
+        await this.setRow(trx, member, rows, baseTarget(subject), plan.base, costumed);
         const shadow = shadowTarget(subject);
-        if (shadow) await this.setRow(trx, member, rows, shadow, plan.shadow ? 'raid' : null);
-        await changeTargetWants(trx, member, plan.targets, at);
+        if (shadow) {
+          await this.setRow(trx, member, rows, shadow, plan.shadow ? 'raid' : null, costumed);
+        }
+        await changeTargetWants(trx, member, costumedTargets(subject, plan, costumed), at);
         return { before: held, after: plan.after };
       },
       this.ids,
@@ -161,6 +191,7 @@ export class WantBoxRepository implements WantBoxStorage {
     rows: readonly WantRow[],
     target: NotificationTarget,
     scope: NotificationScope | null,
+    costumed: boolean,
   ): Promise<void> {
     if (scope === null) {
       const ids = rowsOfWant(rows, target, this.forms);
@@ -168,8 +199,8 @@ export class WantBoxRepository implements WantBoxStorage {
         await trx.deleteFrom('PokemonNotification').where('id', 'in', ids).execute();
       return;
     }
-    const plan = planSetWant(rows, target, scope, this.forms);
-    const columns = (values: EncodedNotification) => ({ ...values, shadow: values.shadow ? 1 : 0 });
+    const plan = planSetWant(rows, target, scope, this.forms, costumed);
+    const columns = (values: EncodedNotification) => notificationColumns(values);
     if (plan.insert) {
       await trx
         .insertInto('PokemonNotification')
diff --git a/src/db/types.ts b/src/db/types.ts
index 874e3a415c0eba24ce72f479b3383548a7186e8b..b5f3f343ee7b5ea2b26d17ad2fed573872c9c8dd 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -439,6 +439,7 @@ export interface Pokemon {
 }
 
 export interface PokemonNotification {
+  costumed: Generated<number>;
   form: string | null;
   guildId: number | null;
   id: Generated<number>;
@@ -589,6 +590,7 @@ export interface StopReport {
 }
 
 export interface TargetWant {
+  costumed: Generated<number>;
   createdAt: string;
   guildId: number;
   id: Generated<number>;
diff --git a/src/domain/notify/reasons.test.ts b/src/domain/notify/reasons.test.ts
index b289a6451b393f79f4fa6262edd2e44ee4e884ba..e50c1ff209041ad5fe7e004a1ad82a011945879b 100644
--- a/src/domain/notify/reasons.test.ts
+++ b/src/domain/notify/reasons.test.ts
@@ -43,9 +43,9 @@ const want = (target: NotificationTarget, scope: NotificationScope = 'raid'): Wa
   target,
   scope,
 });
-const raid = (level: RaidLevel, boss?: string, shadow = false): RaidSighting => ({
+const raid = (level: RaidLevel, boss?: string, shadow = false, costumed = false): RaidSighting => ({
   tier: { level, shadow },
-  boss: boss === undefined ? undefined : entryOf(boss),
+  boss: boss === undefined ? undefined : { ...entryOf(boss), costumed },
 });
 const PERFECT: NotificationTarget = { kind: 'iv', iv: 'perfect' };
 const ZERO: NotificationTarget = { kind: 'iv', iv: 'zero' };
@@ -66,7 +66,7 @@ describe('raidNumbers', () => {
 
 describe('raidWantsFiring', () => {
   const firing = (wants: Want[], sighting: RaidSighting) =>
-    raidWantsFiring(catalogue, wants, sighting);
+    raidWantsFiring(catalogue, wants, sighting).map((fired) => fired.target);
 
   it('fires a want for the species in any form, and a want for one form only for that form', () => {
     const species = pokemonTarget(487);
@@ -140,13 +140,14 @@ describe('raidWantsFiring', () => {
 });
 
 describe('spawnWantsFiring', () => {
+  const spawned = (key: string) => ({ ...entryOf(key), costumed: false });
   const firing = (wants: Want[], key: string, iv?: 'perfect' | 'zero') =>
-    spawnWantsFiring(catalogue, wants, { pokemon: entryOf(key), iv });
+    spawnWantsFiring(catalogue, wants, { pokemon: spawned(key), iv }).map((fired) => fired.target);
 
   it('names the Pokédex number, and the IV code when the report says so', () => {
-    expect(spawnNumbers({ pokemon: entryOf('dratini') })).toEqual([147]);
-    expect(spawnNumbers({ pokemon: entryOf('dratini'), iv: 'perfect' })).toEqual([147, -6]);
-    expect(spawnNumbers({ pokemon: entryOf('dratini'), iv: 'zero' })).toEqual([147, -8]);
+    expect(spawnNumbers({ pokemon: spawned('dratini') })).toEqual([147]);
+    expect(spawnNumbers({ pokemon: spawned('dratini'), iv: 'perfect' })).toEqual([147, -6]);
+    expect(spawnNumbers({ pokemon: spawned('dratini'), iv: 'zero' })).toEqual([147, -8]);
   });
 
   it('fires wants for the Pokémon in the wild, never those for raids alone', () => {
@@ -282,7 +283,91 @@ describe('Rocket wants (plan 8R-2)', () => {
     const plainWant = want(pokemonTarget(88), 'both');
     expect(
       rocketShadowFiring(catalogue, [shadowSpecies, shadowForm, shadowOther, plainWant], catches),
-    ).toEqual([shadowSpecies.target, shadowForm.target]);
+    ).toEqual([shadowSpecies, shadowForm]);
+  });
+});
+
+describe('costumed wants (plan 8R-4)', () => {
+  const costumed = (target: NotificationTarget, scope: NotificationScope = 'both'): Want => ({
+    target,
+    scope,
+    costumed: true,
+  });
+  const PIKACHU = pokemonTarget(25);
+  const GALARIAN_CORSOLA = pokemonTarget(222, 'corsola_galarian');
+
+  it('fires a costumed want only for a costumed boss, a plain want for either, and says which', () => {
+    const plainWant = want(PIKACHU);
+    const costumedWant = costumed(PIKACHU);
+    const wants = [plainWant, costumedWant];
+    expect(raidWantsFiring(catalogue, wants, raid('T1', 'pikachu'))).toEqual([plainWant]);
+    expect(raidWantsFiring(catalogue, wants, raid('T1', 'pikachu', false, true))).toEqual([
+      plainWant,
+      costumedWant,
+    ]);
+    // An egg has no boss to be costumed; a tier want is no Pokémon's.
+    expect(raidWantsFiring(catalogue, [costumedWant], raid('T1'))).toEqual([]);
+  });
+
+  it('matches a costume under the form it copies: Galarian Corsola’s, not Corsola’s', () => {
+    const wants = [costumed(GALARIAN_CORSOLA), costumed(pokemonTarget(222, 'corsola'))];
+    expect(
+      raidWantsFiring(catalogue, wants, raid('T3', 'corsola_galarian', false, true)).map(
+        (fired) => fired.target,
+      ),
+    ).toEqual([GALARIAN_CORSOLA]);
+    // A costumed want of every form fits a costume of any of them.
+    expect(
+      raidWantsFiring(
+        catalogue,
+        [costumed(pokemonTarget(222))],
+        raid('T3', 'corsola_galarian', false, true),
+      ),
+    ).toHaveLength(1);
+  });
+
+  it('fires a costumed spawn want only for a costumed spawn', () => {
+    const wants = [want(PIKACHU, 'spawn'), costumed(PIKACHU, 'spawn')];
+    const spawn = (isCostumed: boolean) =>
+      spawnWantsFiring(catalogue, wants, {
+        pokemon: { ...entryOf('pikachu'), costumed: isCostumed },
+      });
+    expect(spawn(false)).toEqual([wants[0]]);
+    expect(spawn(true)).toEqual(wants);
+  });
+
+  it('tells a costumed research reward by its name and picture, read anew', () => {
+    const reward = (name: string, image: string | null): TaskReward => ({
+      kind: 'encounter',
+      name,
+      key: 'pikachu',
+      dex: 25,
+      shiny: false,
+      cp: null,
+      image,
+    });
+    const plainWant = boxTarget('research-pokemon', 25);
+    const costumedWant: TargetWant = boxTarget('research-pokemon', 25, undefined, true);
+    const wants = [plainWant, costumedWant];
+    const ICONS = 'https://cdn.leekduck.com/assets/img/pokemon_icons/';
+    expect(
+      researchWantsFiring(catalogue, wants, [reward('Pikachu', `${ICONS}pm25.icon.png`)]),
+    ).toEqual([plainWant]);
+    expect(
+      researchWantsFiring(catalogue, wants, [
+        reward('Pikachu wearing a Cosmog suit', `${ICONS}pm25.fPXP_2026.icon.png`),
+      ]),
+    ).toEqual(wants);
+    // A reward a member typed has no picture and the game data's name: never costumed.
+    expect(researchWantsFiring(catalogue, [costumedWant], [reward('Pikachu', null)])).toEqual([]);
+  });
+
+  it('never fires a costumed want of a max battle or a Rocket catch: none is costumed so far', () => {
+    const machamp = entryOf('machamp');
+    const costumedDynamax: TargetWant = boxTarget('dynamax', 68, undefined, true);
+    expect(maxWantsFiring(catalogue, [costumedDynamax], machamp, 'dynamax')).toEqual([]);
+    const shadow = costumed(pokemonTarget(88, undefined, true), 'raid');
+    expect(rocketShadowFiring(catalogue, [shadow], [entryOf('grimer_alola')])).toEqual([]);
   });
 });
 
diff --git a/src/domain/notify/reasons.ts b/src/domain/notify/reasons.ts
index 86ab42f2b62515ea5c6ac02402013abd3d3d3deb..61b7e3430d635b0fa41ebe0905345df8ead182e3 100644
--- a/src/domain/notify/reasons.ts
+++ b/src/domain/notify/reasons.ts
@@ -10,12 +10,14 @@ import {
   type Want,
 } from '../pogo/notification-target.js';
 import { isRaidLevel, raidTier, sameRaidTier, type RaidTier } from '../pogo/raid-tier.js';
-import { pokemonWantFits, wantToken } from '../pogo/wants.js';
+import { costumedByName } from '../pogo/costumes.js';
+import { pokemonWantFits, wantToken, type PokemonSighting } from '../pogo/wants.js';
 import type { BoxSubject } from '../pogo/want-boxes.js';
 import type { TaskReward } from '../research/task.js';
 import {
   ANY_LEADER,
   boxTarget,
+  isCostumedTarget,
   readTargetWantArgs,
   targetWantArgs,
   targetWantToken,
@@ -28,7 +30,8 @@ import {
  * or a train was made and they asked to hear of new trains. One message may have several.
  */
 export type NotifyReason =
-  | { kind: 'want'; target: NotificationTarget }
+  /** `costumed` (plan 8R-4): the want is costumed only, and is named so ("Costumed Pikachu"). */
+  | { kind: 'want'; target: NotificationTarget; costumed?: true }
   | { kind: 'gym'; gymId: number }
   | {
       kind: 'boss-set';
@@ -72,6 +75,18 @@ export function reasonKey(reason: NotifyReason): string {
   }
 }
 
+/**
+ * A reason as one text as a direct message shows it: `reasonKey`, and costumed where the want is
+ * (plan 8R-4: "Costumed Pikachu" is not "Pikachu"), so that members told of one event share a
+ * message only where it names their reasons alike.
+ */
+export function shownReasonKey(reason: NotifyReason): string {
+  const costumed =
+    (reason.kind === 'want' && reason.costumed === true) ||
+    (reason.kind === 'target' && isCostumedTarget(reason.want));
+  return costumed ? `${reasonKey(reason)}:costumed` : reasonKey(reason);
+}
+
 /** A raid's boss as one text, the same for the same boss: what `boss-set` is remembered as. */
 export function bossId(boss: { key: string } | { name: string }): string {
   return 'key' in boss ? `key:${boss.key}` : `name:${boss.name}`;
@@ -81,10 +96,20 @@ export function bossId(boss: { key: string } | { name: string }): string {
 export interface RaidSighting {
   tier: RaidTier;
   /**
-   * The catalogue entry of the boss. Undefined for an egg, and for a boss the game data does
-   * not know: such a raid is for its tier and its gym only.
+   * The catalogue entry of the boss, and whether the list has it costumed (plan 8R-4,
+   * `ShownBoss.costumed`). Undefined for an egg, and for a boss the game data does not know:
+   * such a raid is for its tier and its gym only.
    */
-  boss: { dex: number; key: string } | undefined;
+  boss: (PokemonSighting & { costumed: boolean }) | undefined;
+}
+
+/** A want that fired as the reason of a direct message: its target, and costumed if it is. */
+export function wantReason(want: Want): NotifyReason {
+  return {
+    kind: 'want',
+    target: want.target,
+    ...(want.costumed === true ? { costumed: true as const } : {}),
+  };
 }
 
 /**
@@ -98,11 +123,12 @@ export function raidNumbers(raid: RaidSighting): number[] {
 }
 
 /**
- * Those of a member's wants that are for this raid, in their order:
+ * Those of a member's wants that are for this raid, in their order, each as the member has it
+ * (with its `costumed`):
  *
  * - a want for a Pokémon in raids (scope `raid` or `both`) that fits the boss
  *   (`pokemonWantFits`): the species in any form, the one form, and a want for shadow raids
- *   only when the raid is one;
+ *   only when the raid is one; a costumed want only when the list has the boss costumed;
  * - a want for the raid's tier: the very tier, so a want for T5 is for ordinary tier 5 raids
  *   and not for shadow ones, and a want for shadow T5 for those alone (Matt, 2026-10-10). An
  *   egg fires nothing else.
@@ -113,16 +139,14 @@ export function raidWantsFiring(
   catalogue: Pick<PokemonCatalogue, 'byKey'>,
   wants: readonly Want[],
   raid: RaidSighting,
-): NotificationTarget[] {
-  return wants
-    .filter((want) => {
-      if (want.scope === 'spawn') return false;
-      const { target } = want;
-      if (target.kind === 'tier') return sameRaidTier(target.tier, raid.tier);
-      if (target.kind === 'iv') return false;
-      return pokemonWantFits(catalogue, target, raid.boss, raid.tier.shadow);
-    })
-    .map((want) => want.target);
+): Want[] {
+  return wants.filter((want) => {
+    if (want.scope === 'spawn') return false;
+    const { target } = want;
+    if (target.kind === 'tier') return sameRaidTier(target.tier, raid.tier);
+    if (target.kind === 'iv') return false;
+    return pokemonWantFits(catalogue, target, raid.boss, raid.tier.shadow, want.costumed === true);
+  });
 }
 
 /**
@@ -143,7 +167,8 @@ export function maxTargets(
  * the Dynamax box (`dynamax:<dex>[:<form>]`) of a Dynamax battle, the Gigantamax box of a
  * Gigantamax one, of the species (every form) or of the boss's own entry (its key as the
  * catalogue resolves it). No tier want fires: every report names its boss. A boss the game data
- * does not know fires nothing.
+ * does not know fires nothing. No max boss is costumed so far (Matt, plan 8R-4): a costumed box
+ * never fires.
  */
 export function maxWantsFiring(
   catalogue: Pick<PokemonCatalogue, 'byKey'>,
@@ -155,10 +180,28 @@ export function maxWantsFiring(
   return wants.filter(
     (want) =>
       want.kind === kind &&
-      pokemonWantFits(catalogue, pokemonTarget(want.dex, want.form), boss, false),
+      pokemonWantFits(
+        catalogue,
+        pokemonTarget(want.dex, want.form),
+        { dex: boss.dex, key: boss.key, costumed: false },
+        false,
+        isCostumedTarget(want),
+      ),
   );
 }
 
+/**
+ * Whether a research reward is costumed (plan 8R-4, design 5): the costume test of its Leek Duck
+ * name and picture, worked out when it is read, so that rewards stored before 8R-4 count too. A
+ * reward a member typed (no picture, the game data's name) is not.
+ */
+export function rewardCostumed(
+  catalogue: PokemonCatalogue,
+  reward: Extract<TaskReward, { kind: 'encounter' }>,
+): boolean {
+  return costumedByName(catalogue, reward.name, reward.image ?? undefined);
+}
+
 /**
  * The targets a want for a research task's rewards may be stored under (`TargetWant`; plan 8R-1,
  * design 7): each encounter's species and its own entry, each item, each species' Mega Energy.
@@ -186,10 +229,11 @@ export function researchTargets(rewards: readonly TaskReward[]): TargetWant[] {
 /**
  * Those of a member's targets a research task may reward (design 7, "Matching"): a Pokémon's
  * Research box that fits one of its encounters (`pokemonWantFits`: the species in any form, the
- * one form), an item it gives (whatever the quantity), the Mega Energy of a species it gives.
+ * one form; a costumed box only a costumed encounter, `rewardCostumed`), an item it gives
+ * (whatever the quantity), the Mega Energy of a species it gives.
  */
 export function researchWantsFiring(
-  catalogue: Pick<PokemonCatalogue, 'byKey'>,
+  catalogue: PokemonCatalogue,
   wants: readonly TargetWant[],
   rewards: readonly TaskReward[],
 ): TargetWant[] {
@@ -204,8 +248,9 @@ export function researchWantsFiring(
             pokemonWantFits(
               catalogue,
               pokemonTarget(want.dex, want.form),
-              { dex: reward.dex, key: reward.key },
+              { dex: reward.dex, key: reward.key, costumed: rewardCostumed(catalogue, reward) },
               false,
+              isCostumedTarget(want),
             ),
         );
       case 'research-item':
@@ -253,31 +298,39 @@ export function rocketShadowNumbers(catches: readonly RocketCatchEntry[]): numbe
  * Those of a member's wants a Rocket report fires (design 7, Matt's answer 1): a shadow want
  * (Shadow box: shadow raids and Rocket catches) of a Pokémon it can give, the species in any form
  * or the very form (`pokemonWantFits`, as the shadow row is keyed). Raid and spawn wants are not.
+ * No Rocket catch is costumed so far (Matt, plan 8R-4): a costumed shadow want never fires.
  */
 export function rocketShadowFiring(
   catalogue: Pick<PokemonCatalogue, 'byKey'>,
   wants: readonly Want[],
   catches: readonly RocketCatchEntry[],
-): NotificationTarget[] {
-  return wants
-    .filter(
-      ({ target }) =>
-        target.kind === 'pokemon' &&
-        target.shadow === true &&
-        catches.some(
-          (one) =>
-            one.dex !== null &&
-            one.key !== null &&
-            pokemonWantFits(catalogue, target, { dex: one.dex, key: one.key }, true),
-        ),
-    )
-    .map((want) => want.target);
+): Want[] {
+  return wants.filter(
+    ({ target, costumed }) =>
+      target.kind === 'pokemon' &&
+      target.shadow === true &&
+      catches.some(
+        (one) =>
+          one.dex !== null &&
+          one.key !== null &&
+          pokemonWantFits(
+            catalogue,
+            target,
+            { dex: one.dex, key: one.key, costumed: false },
+            true,
+            costumed === true,
+          ),
+      ),
+  );
 }
 
 /** A reported wild Pokémon as far as wants are matched against it. */
 export interface SpawnSighting {
-  /** The catalogue entry that was reported. */
-  pokemon: { dex: number; key: string };
+  /**
+   * The catalogue entry that was reported, and whether it is costumed (plan 8R-4: an active
+   * event lists it costumed).
+   */
+  pokemon: PokemonSighting & { costumed: boolean };
   /** Set when the report says its IVs are perfect or zero. */
   iv?: 'perfect' | 'zero' | undefined;
 }
@@ -290,22 +343,21 @@ export function spawnNumbers(spawn: SpawnSighting): number[] {
 /**
  * Those of a member's wants that are for this spawn, in their order: a want for the Pokémon in
  * the wild (scope `spawn` or `both`; a want for shadow raids or for a mega is about raids and
- * never fits), and the want for perfect or zero IVs when the report says so.
+ * never fits; a costumed want only for a costumed spawn), and the want for perfect or zero IVs
+ * when the report says so.
  */
 export function spawnWantsFiring(
   catalogue: Pick<PokemonCatalogue, 'byKey'>,
   wants: readonly Want[],
   spawn: SpawnSighting,
-): NotificationTarget[] {
-  return wants
-    .filter((want) => {
-      if (want.scope === 'raid') return false;
-      const { target } = want;
-      if (target.kind === 'iv') return target.iv === spawn.iv;
-      if (target.kind === 'tier') return false;
-      return pokemonWantFits(catalogue, target, spawn.pokemon, false);
-    })
-    .map((want) => want.target);
+): Want[] {
+  return wants.filter((want) => {
+    if (want.scope === 'raid') return false;
+    const { target } = want;
+    if (target.kind === 'iv') return target.iv === spawn.iv;
+    if (target.kind === 'tier') return false;
+    return pokemonWantFits(catalogue, target, spawn.pokemon, false, want.costumed === true);
+  });
 }
 
 /**
diff --git a/src/domain/notify/target-wants.ts b/src/domain/notify/target-wants.ts
index 9379bf199e3c6d5513885319138c1b4de3aad3d6..5e17bf04f4e1657199b7f9d5b7520fcdc1f3cc21 100644
--- a/src/domain/notify/target-wants.ts
+++ b/src/domain/notify/target-wants.ts
@@ -12,14 +12,15 @@ import { POKEMON_TYPES } from '../pogo/types.js';
 
 /**
  * A target of `TargetWant`. A Pokémon is a species (`form` absent: every form) or one form (its
- * catalogue key), as a `PokemonTarget` is.
+ * catalogue key), as a `PokemonTarget` is; `costumed` (plan 8R-4) is the row's own, never part of
+ * its token: costumed only when set.
  */
 export type TargetWant =
-  | { kind: 'research-pokemon'; dex: number; form?: string }
+  | { kind: 'research-pokemon'; dex: number; form?: string; costumed?: true }
   | { kind: 'research-item'; item: string }
   | { kind: 'research-energy'; dex: number }
-  | { kind: 'dynamax'; dex: number; form?: string }
-  | { kind: 'gigantamax'; dex: number; form?: string }
+  | { kind: 'dynamax'; dex: number; form?: string; costumed?: true }
+  | { kind: 'gigantamax'; dex: number; form?: string; costumed?: true }
   /**
    * Team GO Rocket (plan 8R-2; design 7, 9.1): who, as its token, `grunt:<type>`, `grunt:none`,
    * `decoy`, `leader:<cliff|arlo|sierra>`, `giovanni` (a `rocketKey`), or `leader:any`.
@@ -37,9 +38,32 @@ export function isRocketWho(text: string): boolean {
 /** The kinds of `TargetWant` that are a Pokémon (a box of `/want`'s dialog). */
 export type PokemonBoxKind = 'research-pokemon' | 'dynamax' | 'gigantamax';
 
-/** A Pokémon's target of a box: the species, or one form. */
-export function boxTarget(kind: PokemonBoxKind, dex: number, form?: string): TargetWant {
-  return { kind, dex, ...(form === undefined ? {} : { form }) };
+/** A Pokémon's target of a box: the species, or one form; costumed only when `costumed`. */
+export function boxTarget(
+  kind: PokemonBoxKind,
+  dex: number,
+  form?: string,
+  costumed = false,
+): TargetWant {
+  return {
+    kind,
+    dex,
+    ...(form === undefined ? {} : { form }),
+    ...(costumed ? { costumed: true as const } : {}),
+  };
+}
+
+/** Whether a target is a Pokémon's that is costumed only (plan 8R-4). */
+export function isCostumedTarget(want: TargetWant): boolean {
+  return 'costumed' in want && want.costumed === true;
+}
+
+/** A target as costumed or plain: a Pokémon's takes it, any other stays as it is. */
+export function withCostume(want: TargetWant, costumed: boolean): TargetWant {
+  if (want.kind !== 'research-pokemon' && want.kind !== 'dynamax' && want.kind !== 'gigantamax') {
+    return want;
+  }
+  return boxTarget(want.kind, want.dex, want.form, costumed);
 }
 
 const PREFIX: Readonly<Record<Exclude<TargetWant['kind'], 'rocket'>, string>> = {
diff --git a/src/domain/pogo/costumes.ts b/src/domain/pogo/costumes.ts
index 38a4cae99be6ebcc4936f0285af197abca3ef42d..9a2bfb3c17e79fc5a7a580efd4f3254221209307 100644
--- a/src/domain/pogo/costumes.ts
+++ b/src/domain/pogo/costumes.ts
@@ -52,6 +52,19 @@ export function isCostumed(name: string, image: unknown, evidence: CostumeEviden
   return wornBy(name) !== undefined;
 }
 
+/**
+ * The costume test of a Pokémon a page names by its English name and picture (a research reward,
+ * an event's spawn): the picture's ids as the ids.
+ */
+export function costumedByName(
+  catalogue: PokemonCatalogue,
+  name: string,
+  image?: unknown,
+): boolean {
+  const lookup = costumeLookupOf(catalogue);
+  return isCostumed(name, image, { ids: pictureIds(image, lookup), lookup });
+}
+
 /** A sighting of a name and picture as the matchers take it. */
 export interface CostumedSighting {
   key: string;
@@ -75,9 +88,5 @@ export function costumedSighting(
   const key = resolved && lookup.keyOf(resolved.pokemonId, resolved.form);
   const entry = key === undefined ? undefined : catalogue.byKey(key);
   if (!entry) return undefined;
-  return {
-    key: entry.key,
-    dex: entry.dex,
-    costumed: isCostumed(name, image, { ids: pictureIds(image, lookup), lookup }),
-  };
+  return { key: entry.key, dex: entry.dex, costumed: costumedByName(catalogue, name, image) };
 }
diff --git a/src/domain/pogo/notification-target.ts b/src/domain/pogo/notification-target.ts
index 592aca45d5733f92b0d45ebefa01233de5973819..a5da795f3b217fe2110224017c0d33a94e24c263 100644
--- a/src/domain/pogo/notification-target.ts
+++ b/src/domain/pogo/notification-target.ts
@@ -70,6 +70,8 @@ export interface StoredNotification {
   form?: string | null;
   /** The `PokemonNotification.shadow` column. */
   shadow?: boolean;
+  /** The `PokemonNotification.costumed` column (plan 8R-4); a row from before has none. */
+  costumed?: boolean;
 }
 
 /**
@@ -81,6 +83,11 @@ export interface EncodedNotification {
   type: NotificationScope;
   form: string | null;
   shadow: boolean;
+  /**
+   * Costumed only (plan 8R-4): only a Pokémon's row may be, and only when set; absent is plain,
+   * which a writer writes as 0.
+   */
+  costumed?: true;
 }
 
 /** The scope a stored type means, ignoring letter case and padding; undefined if it is none. */
@@ -165,6 +172,7 @@ const ZERO_CODE = -8;
 export function encodeNotification(
   target: NotificationTarget,
   scope: NotificationScope,
+  costumed = false,
 ): EncodedNotification {
   if (target.kind === 'pokemon') {
     if (!isPokedexNumber(target.dex)) {
@@ -179,6 +187,7 @@ export function encodeNotification(
       type: shadow ? 'raid' : scope,
       form: target.form ?? null,
       shadow,
+      ...(costumed ? { costumed: true as const } : {}),
     };
   }
   const plain = { form: null, shadow: false };
@@ -244,6 +253,12 @@ export interface Want {
    * has the scope its row holds, unless the want is for its shadow raids, which is `raid`.
    */
   scope: NotificationScope;
+  /**
+   * Costumed only (plan 8R-4, design 2): a property of the row, like the scope, never part of
+   * what the want is for. Only a Pokémon's want may be; absent is plain, which also fits a
+   * costumed sighting.
+   */
+  costumed?: true;
 }
 
 /**
@@ -255,9 +270,10 @@ export function readNotification(stored: StoredNotification): Want | undefined {
   if (!target) return undefined;
   if (target.kind === 'tier') return { target, scope: 'raid' };
   if (target.kind === 'iv') return { target, scope: 'spawn' };
-  if (target.shadow) return { target, scope: 'raid' };
+  const costumed = stored.costumed === true ? { costumed: true as const } : {};
+  if (target.shadow) return { target, scope: 'raid', ...costumed };
   // `decodeNotification` has read the type already, so it is one of the three.
-  return { target, scope: parseNotificationScope(stored.type) ?? 'both' };
+  return { target, scope: parseNotificationScope(stored.type) ?? 'both', ...costumed };
 }
 
 /**
diff --git a/src/domain/pogo/raid-bosses.test.ts b/src/domain/pogo/raid-bosses.test.ts
index ad1d84f595d6e31afcddee419e4b019989cfafeb..e556cc2c56d1794552ccb781338c1662340c9116 100644
--- a/src/domain/pogo/raid-bosses.test.ts
+++ b/src/domain/pogo/raid-bosses.test.ts
@@ -312,6 +312,47 @@ describe('effectiveBosses: the feed alone', () => {
     ]);
   });
 
+  it('says a boss is costumed when a row of it in its tier is (plan 8R-4)', () => {
+    const bosses = effectiveBosses(
+      [
+        feedBoss('PIKACHU', T1, { form: 'PIKACHU_GLASS_HELMET_2026', name: 'Astronaut Pikachu' }),
+        feedBoss('PIKACHU', T1, { name: 'Pikachu' }),
+        feedBoss('PIKACHU', T3, { name: 'Pikachu' }),
+        feedBoss('ZUBAT', T1, {
+          name: 'Zubat wearing a top hat',
+          image:
+            'https://cdn.leekduck.com/assets/img/events/article-images/2026/x/zubat-top-hat.png',
+        }),
+      ],
+      [
+        override('add', 'PIKACHU', T5, { form: 'PIKACHU_PXP_2026' }),
+        override('add', 'RAIKOU', T5, { form: 'RAIKOU_S' }),
+      ],
+      catalogue,
+      NOW,
+    );
+    expect(bosses.map((b) => [b.key, b.tier.level, b.costumed === true])).toEqual([
+      ['pikachu', 'T1', true],
+      ['zubat', 'T1', true],
+      ['pikachu', 'T3', false],
+      ['pikachu', 'T5', true],
+      ['raikou', 'T5', false],
+    ]);
+    expect(bosses[2]).not.toHaveProperty('costumed');
+  });
+
+  it('makes a plain boss of the feed costumed where an add override names a costume of it', () => {
+    const bosses = effectiveBosses(
+      [feedBoss('PIKACHU', T5, { name: 'Pikachu' })],
+      [override('add', 'PIKACHU', T5, { form: 'PIKACHU_PXP_2026' })],
+      catalogue,
+      NOW,
+    );
+    expect(bosses.map((b) => [b.key, b.tier.level, b.source, b.costumed === true])).toEqual([
+      ['pikachu', 'T5', 'feed', true],
+    ]);
+  });
+
   it('does not change the feed list it is given', () => {
     const frozen = feed.map((boss) =>
       Object.freeze({ ...boss, tier: Object.freeze({ ...boss.tier }) }),
diff --git a/src/domain/pogo/raid-bosses.ts b/src/domain/pogo/raid-bosses.ts
index 21de88bc5e2cd369c7001772c0306a492f967ee4..38d6c4f7e71a26d3f47a2b206a172fb709f0206e 100644
--- a/src/domain/pogo/raid-bosses.ts
+++ b/src/domain/pogo/raid-bosses.ts
@@ -1,7 +1,8 @@
 import type { PokemonCatalogue } from './catalogue.js';
 import type { PokemonEntry } from './game-master.js';
 import { titleCase } from './names.js';
-import { bossIdsOf, feedLookupOf } from './feed-lookup.js';
+import { isCostumed } from './costumes.js';
+import { bossIdsOf, costumeLookupOf, feedLookupOf } from './feed-lookup.js';
 import { isMegaLevel, matchBoss, type FeedBoss } from './raid-boss-feed.js';
 import { RAID_LEVELS, isRaidLevel, raidTier, sameRaidTier, type RaidTier } from './raid-tier.js';
 
@@ -80,6 +81,12 @@ export interface Boss<T = RaidTier> extends BossIds {
    * of the other row.
    */
   image?: string;
+  /**
+   * The list has it costumed (plan 8R-4, design 5): a feed row of it in its tier is costumed by
+   * its name, picture and ids (`isCostumed`), an override by its ids only; a costumed and a plain
+   * row in one tier are one boss, costumed. Absent is plain; never set for a max boss.
+   */
+  costumed?: true;
 }
 
 /** A boss of the raid boss list in effect. */
@@ -100,6 +107,14 @@ export interface BossFamilyOps<T> {
     catalogue: PokemonCatalogue,
     boss: BossIds & { name?: string; tier?: T },
   ): PokemonEntry | undefined;
+  /**
+   * Whether a row of the family is costumed (plan 8R-4); a family without it has no costumed
+   * bosses (max bosses: none so far, Matt).
+   */
+  costumed?(
+    catalogue: PokemonCatalogue,
+    boss: BossIds & { name?: string; image?: string },
+  ): boolean;
 }
 
 const GAME_MASTER_ID = /^[A-Z][A-Z0-9_]{0,63}$/;
@@ -200,6 +215,11 @@ export const RAID_OPS: BossFamilyOps<RaidTier> = {
   rank: (tier) => RAID_LEVELS.indexOf(tier.level) * 2 + (tier.shadow ? 1 : 0),
   slot: (tier) => `${tier.level}|${String(tier.shadow)}`,
   resolve: resolveBoss,
+  costumed: (catalogue, boss) =>
+    isCostumed(boss.name ?? '', boss.image, {
+      ids: { pokemonId: boss.pokemonId, form: boss.form },
+      lookup: costumeLookupOf(catalogue),
+    }),
 };
 
 function compareBosses<T>(ops: BossFamilyOps<T>, a: Boss<T>, b: Boss<T>): number {
@@ -328,12 +348,16 @@ export function familyBosses<T>(
   const copy = (tier: T): T => (typeof tier === 'object' && tier !== null ? { ...tier } : tier);
 
   const bosses = new Map<string, Boss<T>>();
+  const costumed = (ids: BossIds & { name?: string; image?: string }): { costumed?: true } =>
+    ops.costumed?.(catalogue, ids) === true ? { costumed: true } : {};
   for (const boss of feed) {
     const { key, entry } = familyBossKey(ops, boss, catalogue);
     const existing = bosses.get(slot(key, boss.tier));
     if (existing) {
       existing.shiny ||= boss.shiny;
       if (existing.image === undefined && boss.image !== undefined) existing.image = boss.image;
+      // A costumed and a plain row of one boss in one tier: costumed (design 5, "Raids").
+      Object.assign(existing, costumed(boss));
       continue;
     }
     bosses.set(slot(key, boss.tier), {
@@ -347,6 +371,7 @@ export function familyBosses<T>(
       source: 'feed',
       autoset: false,
       ...(boss.image === undefined ? {} : { image: boss.image }),
+      ...costumed(boss),
     });
   }
 
@@ -355,7 +380,14 @@ export function familyBosses<T>(
     if ((override.action !== 'add' && override.action !== 'autoset') || override.tier === null) {
       continue;
     }
-    if (bosses.has(slot(key, override.tier))) continue;
+    // An override has no name or picture: costumed by its ids alone.
+    const ofIds = costumed({ pokemonId: override.pokemonId, form: override.form });
+    const existing = bosses.get(slot(key, override.tier));
+    if (existing) {
+      // An override of a costume beside the feed's plain row of that boss: costumed (A5).
+      Object.assign(existing, ofIds);
+      continue;
+    }
     bosses.set(slot(key, override.tier), {
       key,
       pokemonId: override.pokemonId,
@@ -366,6 +398,7 @@ export function familyBosses<T>(
       entry,
       source: 'override',
       autoset: false,
+      ...ofIds,
     });
   }
   for (const { override, key } of targets) {
diff --git a/src/domain/pogo/want-boxes.ts b/src/domain/pogo/want-boxes.ts
index dd9f5d0f7ae7b23f96527b23868421c904babeea..33ca889d137d45ed6f8807a0224da0feb8194a3c 100644
--- a/src/domain/pogo/want-boxes.ts
+++ b/src/domain/pogo/want-boxes.ts
@@ -1,6 +1,7 @@
 import {
   ANY_LEADER,
   boxTarget,
+  isCostumedTarget,
   sameTargetWant,
   type PokemonBoxKind,
   type TargetWant,
@@ -244,13 +245,23 @@ export function itemNameOf(key: string): string {
 /**
  * What a `TargetWant` is called in a list, an answer and a direct message: `Dratini (research)`,
  * `Rare Candy (research)`, `Charizard Mega Energy (research)`, `Dynamax Machamp`, `Gigantamax
- * Machamp`; a Pokémon as `pokemonWantName` names it (`(every form)` for a species of several).
- * `items` names an item as the task list does (else `itemNameOf`). Not made plain here.
+ * Machamp`; a Pokémon as `pokemonWantName` names it (`(every form)` for a species of several),
+ * `Costumed` before a costumed one (`Costumed Pikachu (research)`, plan 8R-4). `items` names an
+ * item as the task list does (else `itemNameOf`). Not made plain here.
  */
 export function targetWantLabel(
   catalogue: PokemonCatalogue,
   want: TargetWant,
   items: ReadonlyMap<string, string> = new Map(),
+): string {
+  const label = plainTargetLabel(catalogue, want, items);
+  return isCostumedTarget(want) ? `Costumed ${label}` : label;
+}
+
+function plainTargetLabel(
+  catalogue: PokemonCatalogue,
+  want: TargetWant,
+  items: ReadonlyMap<string, string>,
 ): string {
   switch (want.kind) {
     case 'research-item':
diff --git a/src/domain/pogo/wants.test.ts b/src/domain/pogo/wants.test.ts
index 8369b95ff79d071ee9739855289e3f82d97ca4ea..708fe076cf1412305fb427b06b6d7dde164397c1 100644
--- a/src/domain/pogo/wants.test.ts
+++ b/src/domain/pogo/wants.test.ts
@@ -27,6 +27,7 @@ import {
   readWants,
   rowsOfWant,
   typedEntryWant,
+  wantTargetLabel,
   wantToken,
   speciesNameOf,
   wantSpeciesFinder,
@@ -614,6 +615,50 @@ describe('readWants', () => {
   });
 });
 
+describe('costumed wants (plan 8R-4)', () => {
+  it('reads a costumed row as a costumed want, and plain rows of one target over costumed ones', () => {
+    expect(readWants([{ pokemon: 25, type: 'raid', costumed: true }]).wants).toEqual([
+      { target: species(25), scope: 'raid', costumed: true },
+    ]);
+    // Rows of one target that disagree: the plain one wins, as the wider scope does.
+    expect(
+      readWants([
+        { pokemon: 25, type: 'raid', costumed: true },
+        { pokemon: 25, type: 'spawn' },
+      ]).wants,
+    ).toEqual([{ target: species(25), scope: 'both' }]);
+    expect(
+      readWants([
+        { pokemon: 25, type: 'raid', costumed: true },
+        { pokemon: 25, type: 'spawn', costumed: true },
+      ]).wants,
+    ).toEqual([{ target: species(25), scope: 'both', costumed: true }]);
+  });
+
+  it('never reads a tier or an IV want as costumed', () => {
+    expect(readWants([{ pokemon: -5, type: 'raid', costumed: true }]).wants).toEqual([
+      { target: tier('T5'), scope: 'raid' },
+    ]);
+  });
+
+  it('writes the costume of a want, and rewrites a row whose costume changes', () => {
+    expect(planSetWant([], species(25), 'raid', undefined, true)).toEqual({
+      outcome: { kind: 'added', want: { target: species(25), scope: 'raid', costumed: true } },
+      insert: { pokemon: 25, type: 'raid', ...NONE, costumed: true },
+      update: undefined,
+      remove: [],
+    });
+    const costumedRow = { id: 3, pokemon: 25, type: 'raid', costumed: true };
+    expect(planSetWant([costumedRow], species(25), 'raid')).toMatchObject({
+      update: { id: 3, values: { pokemon: 25, type: 'raid', ...NONE } },
+    });
+    expect(planSetWant([costumedRow], species(25), 'raid', undefined, true)).toMatchObject({
+      outcome: { kind: 'unchanged' },
+      update: undefined,
+    });
+  });
+});
+
 describe('planSetWant', () => {
   it('adds a row for a target that has none', () => {
     expect(planSetWant([{ id: 1, pokemon: 151, type: 'both' }], species(150), 'raid')).toEqual({
@@ -1049,6 +1094,16 @@ describe('pokemonWantName', () => {
     expect(listed(pokemonTarget(99999))).toBe('Pokémon #99999');
   });
 
+  it('puts Costumed before a costumed want, which of every form needs no "(every form)"', () => {
+    const costumed = (target: ReturnType<typeof pokemonTarget>) =>
+      pokemonWantName(catalogue, target, { everyForm: true, costumed: true });
+    expect(costumed(pokemonTarget(25))).toBe('Costumed Pikachu');
+    expect(costumed(form(222, 'corsola_galarian'))).toBe('Costumed Galarian Corsola');
+    expect(costumed(pokemonTarget(222))).toBe('Costumed Corsola');
+    expect(wantTargetLabel(catalogue, pokemonTarget(25), true)).toBe('Costumed Pikachu');
+    expect(wantTargetLabel(catalogue, tier('T5'), true)).toBe('T5 raids');
+  });
+
   it('calls a form by the name of its entry', () => {
     expect(name(form(487, 'giratina_origin'))).toBe('Giratina (Origin Forme)');
     expect(listed(form(487, 'giratina_origin'))).toBe('Giratina (Origin Forme)');
diff --git a/src/domain/pogo/wants.ts b/src/domain/pogo/wants.ts
index 93eab44aee9086fb727d1651ce7278d83d1a6bc4..a574d67e9b9b34feac455b3af54159f1a4db422b 100644
--- a/src/domain/pogo/wants.ts
+++ b/src/domain/pogo/wants.ts
@@ -94,10 +94,14 @@ export function ivWantLabel(iv: 'perfect' | 'zero'): string {
  * The name comes from the game data, so it is not made plain here; `plain()` it where it
  * stands in a message. The one name of a want everywhere: lists, answers, direct messages.
  */
-export function wantTargetLabel(catalogue: PokemonCatalogue, target: NotificationTarget): string {
+export function wantTargetLabel(
+  catalogue: PokemonCatalogue,
+  target: NotificationTarget,
+  costumed = false,
+): string {
   if (target.kind === 'tier') return tierWantLabel(target.tier);
   if (target.kind === 'iv') return ivWantLabel(target.iv);
-  return pokemonWantName(catalogue, target, { everyForm: true });
+  return pokemonWantName(catalogue, target, { everyForm: true, costumed });
 }
 
 /** The number a level has in the game, as members type it. */
@@ -367,18 +371,22 @@ export function typedEntryWant(
  * `Mega Charizard Y`), and the entry that is called as its species is by `Charizard (base
  * form)`, so that it is never taken for the species; a form the game data does not have (any
  * more) by its species with the key (`Giratina (giratina_sky)`); a species it does not have by
- * its number. Shadow raids have `Shadow` before the name, and no `(every form)`. The names come
+ * its number. Shadow raids have `Shadow` before the name, and no `(every form)`. A costumed want
+ * (`costumed`, plan 8R-4) has `Costumed` before it all, and no `(every form)` either: "Costumed
+ * Pikachu", "Costumed Galarian Corsola", "Costumed Corsola" for every form. The names come
  * from the game data and are not made plain here.
  */
 export function pokemonWantName(
   catalogue: PokemonCatalogue,
   target: PokemonTarget,
-  options: { everyForm?: boolean } = {},
+  options: { everyForm?: boolean; costumed?: boolean } = {},
 ): string {
   const species = speciesNameOf(catalogue, target.dex) ?? `Pokémon #${String(target.dex)}`;
+  const costumed = options.costumed === true;
   let name: string;
   if (target.form === undefined) {
-    const several = options.everyForm === true && !target.shadow && hasForms(catalogue, target.dex);
+    const several =
+      options.everyForm === true && !target.shadow && !costumed && hasForms(catalogue, target.dex);
     name = several ? `${species} (every form)` : species;
   } else {
     const entry = catalogue.byKey(target.form);
@@ -386,24 +394,37 @@ export function pokemonWantName(
     else if (entry.key === baseEntry(catalogue, target.dex)?.key) name = `${species} (base form)`;
     else name = entry.name;
   }
-  return target.shadow ? `Shadow ${name}` : name;
+  const shadowed = target.shadow ? `Shadow ${name}` : name;
+  return costumed ? `Costumed ${shadowed}` : shadowed;
+}
+
+/** What a sighting is as a want is matched against it: an entry, and whether it is costumed. */
+export interface PokemonSighting {
+  dex: number;
+  key: string;
+  /** Costumed (plan 8R-4, `isCostumed`); absent is plain, as a max boss or a Rocket catch is. */
+  costumed?: boolean;
 }
 
 /**
  * Whether a Pokémon want is for what was reported: a want for a species fits every entry with
  * its Pokédex number, a want for a form only the entry its key stands for (as the catalogue
  * resolves it: a stored key that has become an alias fits the entry it is an alias of), and a
- * want for shadow raids only a shadow raid (`shadowRaid`; a spawn is none). A boss or a spawn
- * without an entry of the catalogue fits no Pokémon want. The scope (raids, spawns) is the
- * caller's to ask.
+ * want for shadow raids only a shadow raid (`shadowRaid`; a spawn is none). A costumed want
+ * (`costumed`, plan 8R-4) fits only a costumed sighting, matched under the entry the costume
+ * copies (the sighting's `key` is that entry's: Galarian Corsola's for its spring costume); a
+ * plain want fits either. A boss or a spawn without an entry of the catalogue fits no Pokémon
+ * want. The scope (raids, spawns) is the caller's to ask.
  */
 export function pokemonWantFits(
   catalogue: Pick<PokemonCatalogue, 'byKey'>,
   target: PokemonTarget,
-  entry: { dex: number; key: string } | undefined,
+  entry: PokemonSighting | undefined,
   shadowRaid: boolean,
+  costumed = false,
 ): boolean {
   if (!entry || entry.dex !== target.dex) return false;
+  if (costumed && entry.costumed !== true) return false;
   if (target.form !== undefined) {
     const wanted = catalogue.byKey(target.form);
     if (wanted?.dex !== target.dex || wanted.key !== entry.key) return false;
@@ -638,7 +659,11 @@ export function readWant(row: StoredNotification, reader: FormReader): Want | un
   if (want?.target.kind !== 'pokemon' || want.target.form === undefined) return want;
   const { dex, form, shadow } = want.target;
   const target = pokemonTarget(dex, reader(dex, form).key, shadow === true);
-  return { target, scope: raidsOnly(target, reader) ? 'raid' : want.scope };
+  return {
+    target,
+    scope: raidsOnly(target, reader) ? 'raid' : want.scope,
+    ...(want.costumed ? { costumed: true as const } : {}),
+  };
 }
 
 /** A target with its form under the key of the entry it stands for today (`reader`). */
@@ -666,8 +691,13 @@ export function readWants(
       continue;
     }
     const known = wants.find((other) => sameNotificationTarget(other.target, want.target));
-    if (known) known.scope = widerScope(known.scope, want.scope);
-    else wants.push(want);
+    if (!known) {
+      wants.push(want);
+      continue;
+    }
+    known.scope = widerScope(known.scope, want.scope);
+    // Plain wins, as the wider scope does: a plain row fires for costumed sightings too.
+    if (want.costumed !== true) delete known.costumed;
   }
   return { wants, unreadable };
 }
@@ -701,17 +731,27 @@ export interface SetWantPlan {
  *
  * A `target` whose form is an older key of an entry (a want the member has, named as its row
  * holds it) is the want of that entry; a want that can only be about raids (`raidsOnly`) is
- * stored as `raid` whatever scope is asked for.
+ * stored as `raid` whatever scope is asked for. `costumed` (plan 8R-4) is written as the row's
+ * own, a Pokémon's only; a row whose costume differs is rewritten.
  */
 export function planSetWant(
   rows: readonly WantRow[],
   asked: NotificationTarget,
   scope: NotificationScope,
   reader: FormReader = formAsStored,
+  costumed = false,
 ): SetWantPlan {
   const target = underTodaysKey(asked, reader);
-  const values = encodeNotification(target, raidsOnly(target, reader) ? 'raid' : scope);
-  const want: Want = { target, scope: values.type };
+  const values = encodeNotification(
+    target,
+    raidsOnly(target, reader) ? 'raid' : scope,
+    costumed && target.kind === 'pokemon',
+  );
+  const want: Want = {
+    target,
+    scope: values.type,
+    ...(values.costumed ? { costumed: true as const } : {}),
+  };
   const same = rows
     .filter((row) => {
       const read = readWant(row, reader);
@@ -724,7 +764,9 @@ export function planSetWant(
   }
   const [had] = readWants(same, reader).wants;
   const before = had?.scope ?? want.scope;
-  const keptScope = readWant(kept, reader)?.scope;
+  const keptWant = readWant(kept, reader);
+  const keptScope = keptWant?.scope;
+  const sameCostume = (keptWant?.costumed === true) === (want.costumed === true);
   // What the row itself says of the form, before the game data is asked: an older key is replaced.
   const keptAs = readNotification(kept)?.target;
   const sameKey = keptAs !== undefined && sameNotificationTarget(keptAs, target);
@@ -732,7 +774,8 @@ export function planSetWant(
     outcome:
       before === want.scope ? { kind: 'unchanged', want } : { kind: 'changed', want, before },
     insert: undefined,
-    update: keptScope === want.scope && sameKey ? undefined : { id: kept.id, values },
+    update:
+      keptScope === want.scope && sameKey && sameCostume ? undefined : { id: kept.id, values },
     remove: others.map((row) => row.id),
   };
 }
diff --git a/src/domain/research/leekduck.test.ts b/src/domain/research/leekduck.test.ts
index ba55ed5396b08fbc89d4343d0e8871065fec8bc1..52fcabe47d5698fc56053a16d9547f5c16c6ca12 100644
--- a/src/domain/research/leekduck.test.ts
+++ b/src/domain/research/leekduck.test.ts
@@ -109,6 +109,32 @@ describe('parseResearchPage', () => {
     expect(read.skipped).toBe(1);
   });
 
+  it('keeps a plain and a costumed reward of one Pokémon in a task apart (plan 8R-4)', () => {
+    const encounter = (name: string, picture: string) =>
+      '<li class="reward" data-reward-type="encounter"><span class="reward-bubble encounter-reward">' +
+      `<img class="reward-image" src="https://cdn.leekduck.com/assets/img/pokemon_icons_crop/${picture}" />` +
+      `</span><span class="reward-label"><span>${name}</span></span></li>`;
+    // The task listed twice: its rewards are merged, each once.
+    const task = (...rewards: string[]) =>
+      '<li class="task-item"><span class="task-text"><span>Spin 26 PokéStops or Gyms</span></span>' +
+      `<ul class="reward-list">${rewards.join('')}</ul></li>`;
+    const page =
+      '<div class="task-category"><h2>Exploring Tasks</h2><ul class="task-list">' +
+      task(encounter('Pikachu', 'pm25.icon.png')) +
+      task(
+        encounter('Pikachu wearing a Cosmog suit', 'pm25.fPXP_2026.icon.png'),
+        encounter('Pikachu', 'pm25.icon.png'),
+      ) +
+      '</ul></div>';
+    const [read] = parseResearchPage(page, catalogueFixture()).tasks;
+    expect(read?.rewards.map((reward) => [reward.name, 'key' in reward ? reward.key : ''])).toEqual(
+      [
+        ['Pikachu', 'pikachu'],
+        ['Pikachu wearing a Cosmog suit', 'pikachu'],
+      ],
+    );
+  });
+
   it('reads text as it shows: tags out, entities read, controls and gaps one space', () => {
     expect(htmlText('<span>Buddy &amp; Friendship</span>  Tasks')).toBe('Buddy & Friendship Tasks');
     expect(htmlText('Farfetch&#39;d &#x2014;\u200B ok')).toBe("Farfetch'd — ok");
diff --git a/src/domain/research/leekduck.ts b/src/domain/research/leekduck.ts
index ada1abab1f13d4636a283f23385486f8a9453d24..c80304ffd6ed7bc01678b2449539d1fdb04a78d7 100644
--- a/src/domain/research/leekduck.ts
+++ b/src/domain/research/leekduck.ts
@@ -1,4 +1,5 @@
 import type { PokemonCatalogue } from '../pogo/catalogue.js';
+import { costumedByName } from '../pogo/costumes.js';
 import { feedLookupOf } from '../pogo/feed-lookup.js';
 import { identifyBoss } from '../pogo/raid-boss-feed.js';
 import { itemKey, MAX_TASK_TEXT, taskKeyOf, type ResearchTask, type TaskReward } from './task.js';
@@ -175,11 +176,16 @@ function readReward(html: string, reading: Reading): TaskReward | undefined {
   return undefined;
 }
 
-/** What tells two rewards of a task apart: its kind and what it is. */
-function rewardKey(reward: TaskReward): string {
+/**
+ * What tells two rewards of a task apart: its kind and what it is; an encounter also whether it
+ * is costumed (plan 8R-4: a plain and a costumed Pikachu stay two).
+ */
+function rewardKey(reward: TaskReward, catalogue: PokemonCatalogue): string {
   switch (reward.kind) {
-    case 'encounter':
-      return `e:${reward.key ?? reward.name}`;
+    case 'encounter': {
+      const costumed = costumedByName(catalogue, reward.name, reward.image ?? undefined);
+      return `e:${reward.key ?? reward.name}${costumed ? ':costumed' : ''}`;
+    }
     case 'item':
       return `i:${reward.item}:${String(reward.quantity)}`;
     case 'energy':
@@ -220,8 +226,9 @@ export function parseResearchPage(html: string, catalogue: PokemonCatalogue): Pa
       const key = taskKeyOf(text);
       const known = byKey.get(key);
       if (known) {
-        const have = new Set(known.rewards.map(rewardKey));
-        known.rewards.push(...rewards.filter((reward) => !have.has(rewardKey(reward))));
+        const keyOf = (reward: TaskReward): string => rewardKey(reward, catalogue);
+        const have = new Set(known.rewards.map(keyOf));
+        known.rewards.push(...rewards.filter((reward) => !have.has(keyOf(reward))));
         continue;
       }
       byKey.set(key, { key, text, category: heading === '' ? 'Other' : heading, rewards });
diff --git a/src/render/raid-post.test.ts b/src/render/raid-post.test.ts
index 439afbffc6b3db4aa4dea9df6e109ca788bd3e4b..5ee5a094a25a627841c138c82d70ded6a2daa923 100644
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -35,6 +35,7 @@ import type { V2Message } from '../discord/party-gateway.js';
 import type { Attendee, RaidParty } from '../domain/party/party.js';
 import { setBoss, setHatchTime } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
+import { effectiveBosses } from '../domain/pogo/raid-bosses.js';
 import { PokemonIcons } from '../domain/pogo/pokemon-icons.js';
 import {
   ENDED_COLOUR,
@@ -118,6 +119,29 @@ describe('shownBoss', () => {
     expect(shown?.image).toMatch(/pm717\.icon\.png$/);
   });
 
+  it('is costumed only where the list has the boss costumed in the raid’s own tier (plan 8R-4)', () => {
+    const list = effectiveBosses(
+      [
+        {
+          pokemonId: 'PIKACHU',
+          form: 'PIKACHU_GLASS_HELMET_2026',
+          tier: { level: 'T1', shadow: false },
+          shiny: false,
+          name: 'Astronaut Pikachu',
+        },
+      ],
+      [],
+      catalogue,
+      PARTY_NOW,
+    );
+    const pikachu = (level: 'T1' | 'T3') =>
+      setBoss(egg, { tier: { level, shadow: false }, boss: { key: 'pikachu' } }, rules, PARTY_NOW)
+        .party;
+    expect(shownBoss(pikachu('T1'), catalogue, list)?.costumed).toBe(true);
+    // The T1 boss is the only one of Pikachu: a T3 raid takes its picture, never its costume.
+    expect(shownBoss(pikachu('T3'), catalogue, list)).not.toHaveProperty('costumed');
+  });
+
   it('shows a Pokémon that is no current boss without shiny mark or picture', () => {
     const mewtwo = setBoss(egg, { tier: T5, boss: { key: 'mewtwo' } }, rules, PARTY_NOW).party;
     const shown = shownBoss(mewtwo, catalogue, bosses);
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index c58a07f260d6955d06aa92069e5b62a80a273225..0f6dabdacc5b421d28517e6877b0d1fb33352d96 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -71,6 +71,11 @@ export interface ShownBoss {
   entry?: PokemonEntry;
   shiny: boolean;
   image?: string;
+  /**
+   * The list has this boss costumed in the raid's own tier (plan 8R-4, `Boss.costumed`): what a
+   * costumed want is matched against. Never taken from the boss of another tier.
+   */
+  costumed?: true;
 }
 
 export interface RaidPostView {
@@ -132,6 +137,7 @@ export function shownBoss(
       ...(listed?.entry ? { entry: listed.entry } : {}),
       shiny: listed?.shiny ?? false,
       ...(image === undefined ? {} : { image }),
+      ...(named.find(inTier)?.costumed === true ? { costumed: true as const } : {}),
     };
   }
   const entry = catalogue.byKey(ref.key);
@@ -143,6 +149,8 @@ export function shownBoss(
     ...(entry ? { entry } : {}),
     shiny: listed?.shiny ?? false,
     ...(image === undefined ? {} : { image }),
+    // Only the boss of the raid's own tier says (F4): `same[0]` may be of another tier.
+    ...(same.find(inTier)?.costumed === true ? { costumed: true as const } : {}),
   };
 }
 
diff --git a/src/services/notify-service.test.ts b/src/services/notify-service.test.ts
index 1f006f166a6f250783fda64633378cefe0bfc7e8..0374a0ea2016f671989369c821e6f6d0c13cd606 100644
--- a/src/services/notify-service.test.ts
+++ b/src/services/notify-service.test.ts
@@ -109,6 +109,28 @@ describe('NotifyService: a raid is reported', () => {
     expect(job?.expiresAt).toBe(made.party.lastPossibleTime ?? made.clock.now + 60 * MINUTE);
   });
 
+  it('tells a costumed want only of a boss the list has costumed in the raid’s tier (plan 8R-4)', async () => {
+    const PIKACHU = pokemonTarget(25);
+    const wanting = async ({ wants, gateway }: Awaited<ReturnType<typeof partyServiceWith>>) => {
+      await wants.set(ALICE, gateway.guildId, PIKACHU, 'raid', true);
+      await wants.set(BOB, gateway.guildId, PIKACHU, 'raid');
+    };
+    // The feed of the fixture lists Astronaut Pikachu (a new costume) under 1-Star Raids.
+    const costumed = await reported(wanting, {
+      boss: { key: 'pikachu' },
+      tier: { level: 'T1', shadow: false },
+    });
+    expect(costumed.dms.recipients).toEqual([ALICE, BOB]);
+    expect(why(costumed, ALICE)).toEqual(['Costumed Pikachu']);
+    expect(why(costumed, BOB)).toEqual(['Pikachu']);
+    // A Pikachu of a tier the list does not have it costumed in is plain.
+    const plainRaid = await reported(wanting, {
+      boss: { key: 'pikachu' },
+      tier: { level: 'T3', shadow: false },
+    });
+    expect(plainRaid.dms.recipients).toEqual([BOB]);
+  });
+
   it('sends one message to a member for whom several reasons fire, and names them all', async () => {
     const made = await reported(
       async ({ wants, gymTargets, gateway }) => {
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index 1b8c9eaf31e903fba250583db3f17172738dd61f..32da79e3452f51311bbd7320f777bd7db487ae12 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -18,6 +18,7 @@ import {
   raidWantsFiring,
   reasonKey,
   researchTargets,
+  shownReasonKey,
   researchWantsFiring,
   rocketShadowFiring,
   rocketShadowNumbers,
@@ -27,6 +28,7 @@ import {
   spawnWantsFiring,
   type NotifyReason,
   type RaidSighting,
+  wantReason,
 } from '../domain/notify/reasons.js';
 import {
   groupOf,
@@ -685,7 +687,10 @@ export class NotifyService implements PartyNotifier {
   private announceSpawn(news: SpawnNews): void {
     if (!this.enabled) return;
     const { wants, gameData } = this.options;
-    const spawn = { pokemon: news.pokemon, iv: news.iv };
+    const spawn = {
+      pokemon: { dex: news.pokemon.dex, key: news.pokemon.key, costumed: news.costumed === true },
+      iv: news.iv,
+    };
     const brief = spawnBrief(news.view, news.goneAt);
     this.spawns += 1;
     this.announce({
@@ -705,9 +710,7 @@ export class NotifyService implements PartyNotifier {
         return {
           ids: [...wanting.keys()],
           reasonsOf: (id) =>
-            spawnWantsFiring(gameData.catalogue, wanting.get(id) ?? [], spawn).map(
-              (target): NotifyReason => ({ kind: 'want', target }),
-            ),
+            spawnWantsFiring(gameData.catalogue, wanting.get(id) ?? [], spawn).map(wantReason),
         };
       },
       message: (guildId, reasons) =>
@@ -927,7 +930,7 @@ export class NotifyService implements PartyNotifier {
                 gameData.catalogue,
                 shadow.get(id) ?? [],
                 report.rocket.catches,
-              ).map((target): NotifyReason => ({ kind: 'want', target })),
+              ).map(wantReason),
             ],
           };
         },
@@ -1034,11 +1037,19 @@ export class NotifyService implements PartyNotifier {
     return `the ${party.type} ${plainNoLinks(party.timed.name)}`;
   }
 
-  /** What a want is matched against: the raid's tier, and its boss as the game data has it. */
+  /**
+   * What a want is matched against: the raid's tier, and its boss as the game data has it,
+   * costumed when the list has it so in the raid's tier (plan 8R-4, worked out when the DM goes
+   * out, never stored on the raid).
+   */
   private sighting(party: RaidParty): RaidSighting {
     const { gameData, raidBosses } = this.options;
-    const entry = shownBoss(party, gameData.catalogue, raidBosses.bosses())?.entry;
-    return { tier: party.raid.tier, boss: entry && { dex: entry.dex, key: entry.key } };
+    const shown = shownBoss(party, gameData.catalogue, raidBosses.bosses());
+    const entry = shown?.entry;
+    return {
+      tier: party.raid.tier,
+      boss: entry && { dex: entry.dex, key: entry.key, costumed: shown?.costumed === true },
+    };
   }
 
   private announceRaid(
@@ -1110,9 +1121,7 @@ export class NotifyService implements PartyNotifier {
             ...(awaiting.has(id) && bossNow !== null
               ? [{ kind: 'boss-set' as const, boss: bossId(bossNow) }]
               : []),
-            ...raidWantsFiring(gameData.catalogue, wanting.get(id) ?? [], sighting).map(
-              (target): NotifyReason => ({ kind: 'want', target }),
-            ),
+            ...raidWantsFiring(gameData.catalogue, wanting.get(id) ?? [], sighting).map(wantReason),
             ...(targeting.has(id) && gymId !== null ? [{ kind: 'gym' as const, gymId }] : []),
           ],
         };
@@ -1181,7 +1190,9 @@ export class NotifyService implements PartyNotifier {
     switch (reason.kind) {
       case 'want':
         return {
-          label: plain(wantTargetLabel(gameData.catalogue, reason.target)),
+          label: plain(
+            wantTargetLabel(gameData.catalogue, reason.target, reason.costumed === true),
+          ),
           stop,
           command: '/unwant',
         };
@@ -1324,7 +1335,7 @@ export class NotifyService implements PartyNotifier {
         }
         for (const [id, reasons] of firing) {
           if (!seeing?.has(id)) continue;
-          const key = [event.variant?.(id) ?? '', ...reasons.map(reasonKey)].join('\n');
+          const key = [event.variant?.(id) ?? '', ...reasons.map(shownReasonKey)].join('\n');
           let message = messages.get(key);
           if (message === undefined) {
             // Made before anything is remembered: a member whose message could not be made
diff --git a/src/services/spawn-service.ts b/src/services/spawn-service.ts
index 17be3422ee6a179231924edf26141a0f32b3613f..38eab73b74322fb23508e6cc2c15593f385f8388 100644
--- a/src/services/spawn-service.ts
+++ b/src/services/spawn-service.ts
@@ -44,6 +44,8 @@ export interface SpawnReport {
 /** What members are told about a spawn (`NotifyService.spawnReported`). */
 export interface SpawnNews extends SpawnReport {
   view: SpawnView;
+  /** The report is of a costumed Pokémon (plan 8R-4: an active event lists it costumed). */
+  costumed?: boolean;
   /** The report in the region's channel: a direct message links to it. */
   messageId: string;
   eventAt: number;
diff --git a/test/support/target-want-cases.ts b/test/support/target-want-cases.ts
index a7d639bc22808ca8206bfb375c2fdd460fcf38d0..80f1106a02405a563f7cf5356e0a073626454180 100644
--- a/test/support/target-want-cases.ts
+++ b/test/support/target-want-cases.ts
@@ -95,6 +95,23 @@ export function targetWantCases(made: () => Promise<TargetWantStorage>): void {
     expect((await store.list(ASH, OTHER_WANT_SERVER)).wants).toEqual([RARE_CANDY]);
   });
 
+  it('keeps whether a Pokémon’s target is costumed, as a row’s own, apart from its token', async () => {
+    const store = await made();
+    const costumed = boxTarget('research-pokemon', 147, undefined, true);
+    await store.change(ASH, WANT_SERVER, { add: [costumed, RARE_CANDY], remove: [] }, WANTED_AT);
+    expect((await store.list(ASH, WANT_SERVER)).wants).toEqual([costumed, RARE_CANDY]);
+    expect(await store.of(ASH, WANT_SERVER, [DRATINI_RESEARCH])).toEqual([costumed]);
+    expect(await store.wanting(WANT_SERVER, [DRATINI_RESEARCH])).toEqual([
+      { memberId: ASH, wants: [costumed] },
+    ]);
+    // Added again plain, the row is plain; removed by its token, whatever its costume.
+    await store.change(ASH, WANT_SERVER, { add: [DRATINI_RESEARCH], remove: [] }, WANTED_AT);
+    expect((await store.list(ASH, WANT_SERVER)).wants).toEqual([DRATINI_RESEARCH, RARE_CANDY]);
+    await store.change(ASH, WANT_SERVER, { add: [costumed], remove: [] }, WANTED_AT);
+    expect(await store.remove(ASH, WANT_SERVER, DRATINI_RESEARCH)).toBe(true);
+    expect((await store.list(ASH, WANT_SERVER)).wants).toEqual([RARE_CANDY]);
+  });
+
   it('finds who wants which of the targets in a server', async () => {
     const store = await made();
     await store.change(
diff --git a/test/support/target-wants.ts b/test/support/target-wants.ts
index 54aca5fcc08423facc4e047e0f8fb6ab821439fd..62459ca4db2b993a37f29c492c5a68caa0d03da8 100644
--- a/test/support/target-wants.ts
+++ b/test/support/target-wants.ts
@@ -4,8 +4,10 @@ import type {
   TargetWantStorage,
 } from '../../src/db/repositories/target-want-repository.js';
 import {
+  isCostumedTarget,
   parseTargetWantToken,
   targetWantToken,
+  withCostume,
   type TargetWant,
 } from '../../src/domain/notify/target-wants.js';
 
@@ -16,12 +18,20 @@ type Method = keyof TargetWantStorage;
  * The wants of `TargetWant` in memory, for tests: the twin of `TargetWantRepository`, running
  * `targetWantCases` as it does. `rows` holds each member's tokens by server and member
  * (`<server> <member>`), in the order they were made: a test may put a token there that this
- * version cannot read. `failing` makes a method reject with the error given.
+ * version cannot read. `failing` makes a method reject with the error given. `costumed` holds
+ * the rows that are costumed (plan 8R-4), as `<server> <member> <token>`.
  */
 export class MemoryTargetWants implements TargetWantStorage {
   readonly rows = new Map<string, string[]>();
+  readonly costumed = new Set<string>();
   readonly failing = new Map<Method, Error>();
 
+  /** A token of a member as the target it is, costumed as its row is. */
+  private read(memberId: string, guildId: string, token: string): TargetWant | undefined {
+    const want = parseTargetWantToken(token);
+    return want && withCostume(want, this.costumed.has(`${guildId} ${memberId} ${token}`));
+  }
+
   private fail(method: Method): void {
     const err = this.failing.get(method);
     if (err) throw err;
@@ -34,7 +44,7 @@ export class MemoryTargetWants implements TargetWantStorage {
   list(memberId: string, guildId: string): Promise<TargetWantList> {
     this.fail('list');
     const tokens = this.tokensOf(memberId, guildId);
-    const wants = tokens.flatMap((token) => parseTargetWantToken(token) ?? []);
+    const wants = tokens.flatMap((token) => this.read(memberId, guildId, token) ?? []);
     return Promise.resolve({ wants, unreadable: tokens.length - wants.length });
   }
 
@@ -44,7 +54,7 @@ export class MemoryTargetWants implements TargetWantStorage {
     return Promise.resolve(
       this.tokensOf(memberId, guildId)
         .filter((token) => asked.has(token))
-        .flatMap((token) => parseTargetWantToken(token) ?? []),
+        .flatMap((token) => this.read(memberId, guildId, token) ?? []),
     );
   }
 
@@ -57,8 +67,14 @@ export class MemoryTargetWants implements TargetWantStorage {
     this.fail('change');
     const removed = new Set(change.remove.map(targetWantToken));
     const kept = this.tokensOf(memberId, guildId).filter((token) => !removed.has(token));
-    for (const token of change.add.map(targetWantToken)) {
+    for (const token of removed) this.costumed.delete(`${guildId} ${memberId} ${token}`);
+    for (const want of change.add) {
+      const token = targetWantToken(want);
       if (!kept.includes(token)) kept.push(token);
+      // A target there already takes the costume of its add, as the repository's.
+      const row = `${guildId} ${memberId} ${token}`;
+      if (isCostumedTarget(want)) this.costumed.add(row);
+      else this.costumed.delete(row);
     }
     this.set(memberId, guildId, kept);
     return Promise.resolve();
@@ -79,12 +95,16 @@ export class MemoryTargetWants implements TargetWantStorage {
       guildId,
       tokens.filter((one) => one !== token),
     );
+    this.costumed.delete(`${guildId} ${memberId} ${token}`);
     return Promise.resolve(true);
   }
 
   removeAll(memberId: string, guildId: string): Promise<number> {
     this.fail('removeAll');
     const n = this.tokensOf(memberId, guildId).length;
+    for (const token of this.tokensOf(memberId, guildId)) {
+      this.costumed.delete(`${guildId} ${memberId} ${token}`);
+    }
     this.set(memberId, guildId, []);
     return Promise.resolve(n);
   }
@@ -103,7 +123,7 @@ export class MemoryTargetWants implements TargetWantStorage {
       if (server !== guildId || memberId === undefined) continue;
       const wants = tokens
         .filter((token) => asked.has(token))
-        .flatMap((token) => parseTargetWantToken(token) ?? []);
+        .flatMap((token) => this.read(memberId, guildId, token) ?? []);
       if (wants.length > 0) found.push({ memberId, wants });
     }
     return Promise.resolve(found);
diff --git a/test/support/want-box-cases.ts b/test/support/want-box-cases.ts
index c917e42d9cf2032d3b4a9e1c0d4664dfac0cd3c1..a228a9e8734191ec15c381dd9f2aa8311bd8bbb0 100644
--- a/test/support/want-box-cases.ts
+++ b/test/support/want-box-cases.ts
@@ -73,6 +73,28 @@ export function wantBoxCases(made: () => Promise<BoxTables>): void {
     expect(await boxes.held(ASH, WANT_SERVER, { kind: 'pokemon', dex: 37 })).toEqual(new Set());
   });
 
+  it('writes costumed into both tables, and plain again on a later Submit', async () => {
+    const { boxes, wants, targets } = await made();
+    const ticked = new Set(['raids', 'research'] as const);
+    await boxes.set(ASH, WANT_SERVER, DRATINI, ticked, EVERY, WANTED_AT, true);
+    expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
+      { target: pokemonTarget(147), scope: 'raid', costumed: true },
+    ]);
+    expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([
+      boxTarget('research-pokemon', 147, undefined, true),
+    ]);
+    expect((await wants.wanting(WANT_SERVER, [147]))[0]?.wants).toEqual([
+      { target: pokemonTarget(147), scope: 'raid', costumed: true },
+    ]);
+    await boxes.set(ASH, WANT_SERVER, DRATINI, ticked, EVERY, WANTED_AT);
+    expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
+      { target: pokemonTarget(147), scope: 'raid' },
+    ]);
+    expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([
+      boxTarget('research-pokemon', 147),
+    ]);
+  });
+
   it('writes a tier’s raids and its shadow raids', async () => {
     const { boxes, wants } = await made();
     await boxes.set(
diff --git a/test/support/want-boxes.ts b/test/support/want-boxes.ts
index 5945c8f19455e9a8283326c5fc4283611e0dd951..160f40c4761984cf3972c19d7feb50766ed9572c 100644
--- a/test/support/want-boxes.ts
+++ b/test/support/want-boxes.ts
@@ -1,4 +1,8 @@
-import type { BoxChange, WantBoxStorage } from '../../src/db/repositories/want-box-repository.js';
+import {
+  costumedTargets,
+  type BoxChange,
+  type WantBoxStorage,
+} from '../../src/db/repositories/want-box-repository.js';
 import {
   baseTarget,
   heldBoxes,
@@ -42,18 +46,19 @@ export class MemoryWantBoxes implements WantBoxStorage {
     ticked: ReadonlySet<WantBox>,
     shown: readonly WantBox[],
     at: number,
+    costumed = false,
   ): Promise<BoxChange> {
     const held = await this.held(memberId, guildId, subject);
     const plan = planBoxes(subject, held, ticked, shown);
     const base = baseTarget(subject);
     if (plan.base === null) await this.wants.remove(memberId, guildId, base);
-    else await this.wants.set(memberId, guildId, base, plan.base);
+    else await this.wants.set(memberId, guildId, base, plan.base, costumed);
     const shadow = shadowTarget(subject);
     if (shadow) {
-      if (plan.shadow) await this.wants.set(memberId, guildId, shadow, 'raid');
+      if (plan.shadow) await this.wants.set(memberId, guildId, shadow, 'raid', costumed);
       else await this.wants.remove(memberId, guildId, shadow);
     }
-    await this.targets.change(memberId, guildId, plan.targets, at);
+    await this.targets.change(memberId, guildId, costumedTargets(subject, plan, costumed), at);
     return { before: held, after: plan.after };
   }
 }
diff --git a/test/support/wants.ts b/test/support/wants.ts
index 1ea592276f27080054481968aa59f1cde442fd2b..62914a59adda21a5619eea3dfa89a6ba395a554c 100644
--- a/test/support/wants.ts
+++ b/test/support/wants.ts
@@ -67,18 +67,19 @@ export class MemoryWants implements WantStorage {
 
   /**
    * A row as it may stand in the table, for a test: any number, any type, and with `more` any
-   * form and the shadow flag (a row has no form and is not for shadow raids otherwise).
+   * form, the shadow flag and costumed (a row has no form, is not for shadow raids and is plain
+   * otherwise).
    */
   add(
     memberId: string,
     guildId: string,
     pokemon: number,
     type: string,
-    more: { form?: string | null; shadow?: boolean } = {},
+    more: { form?: string | null; shadow?: boolean; costumed?: boolean } = {},
   ): number {
     const id = this.nextId++;
-    const { form = null, shadow = false } = more;
-    this.rows.push({ id, memberId, guildId, pokemon, type, form, shadow });
+    const { form = null, shadow = false, costumed = false } = more;
+    this.rows.push({ id, memberId, guildId, pokemon, type, form, shadow, costumed });
     return id;
   }
 
@@ -107,17 +108,23 @@ export class MemoryWants implements WantStorage {
     guildId: string,
     target: NotificationTarget,
     scope: NotificationScope,
+    costumed = false,
   ): Promise<SetWantOutcome> {
     return this.attempt(() => {
-      const plan = planSetWant(this.of(memberId, guildId), target, scope, this.forms);
+      const plan = planSetWant(this.of(memberId, guildId), target, scope, this.forms, costumed);
       if (plan.insert) {
         const { pokemon, type, form, shadow } = plan.insert;
-        this.add(memberId, guildId, pokemon, type, { form, shadow });
+        this.add(memberId, guildId, pokemon, type, {
+          form,
+          shadow,
+          costumed: plan.insert.costumed === true,
+        });
       }
       if (plan.update) {
         const { id, values } = plan.update;
         const row = this.rows.find((found) => found.id === id);
-        if (row) Object.assign(row, values);
+        // As the repository writes it: costumed always said.
+        if (row) Object.assign(row, values, { costumed: values.costumed === true });
       }
       this.drop(plan.remove);
       return plan.outcome;
````

### Task 3: 8R-4 task 3: One answer per species: storage and the dialog's id

Prototype commit: `3b43570b62223e3fb9f3a44348630a77ca4dbe47`

WantBoxStorage reads and writes an answer of /want's dialog over the
whole species: every row of its Pokedex number in both tables (a token
<kind>:<dex> exactly or <kind>:<dex>:..., so 25 never reads 251), Unown
and its letters each an answer of their own. A Submit writes the boxes
and costume to every form ticked, keeps the boxes it did not show as each
row had them, gives a mega a raid row only, and takes the other rows
away; Remove, no form or nothing ticked takes them all. The Submit's id
is set2 with the boxes and fields shown, the Which field's hash, and room
for the server and the page; any other shape is out of date.

**Files:**

```
 docs/architecture/notifications-and-dms.md         |   6 +-
 src/commands/notifications/want-boxes.ts           |  11 +++
 src/commands/notifications/want-dialog.test.ts     | 100 +++++++++++++++++++++
 src/commands/notifications/want-dialog.ts          | 144 ++++++++++++++++++++++++++++++
 src/commands/notifications/wants.test.ts           |  41 +++++++--
 src/commands/notifications/wants.ts                | 123 +++++++++-----------------
 src/components/dm.ts                               |   9 +-
 src/db/repositories/want-box-repository.db.test.ts |  11 +--
 src/db/repositories/want-box-repository.ts         | 144 +++++++++++++++---------------
 src/domain/pogo/species-answer.test.ts             | 247 +++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/pogo/species-answer.ts                  | 281 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/pogo/want-boxes.test.ts                 |  32 -------
 src/domain/pogo/want-boxes.ts                      |  41 ---------
 test/support/want-box-cases.ts                     | 292 +++++++++++++++++++++++++++++++++++++++++++++++++++++--------
 test/support/want-boxes.ts                         |  78 ++++++++---------
 15 files changed, 1234 insertions(+), 326 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/notifications/want-dialog.test.ts src/commands/notifications/wants.test.ts src/domain/pogo/species-answer.test.ts src/domain/pogo/want-boxes.test.ts`); all pass. Its database test files (`src/db/repositories/want-box-repository.db.test.ts`) run with the database suite at the tip.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3b43570b62223e3fb9f3a44348630a77ca4dbe47 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4 task 3: One answer per species: storage and the dialog's id`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index c89dfe0e93e70c1c9ceae2cc64d36eb19c24c031..ba767bd88e2824d0d599ad5c7b1c0471681baf1d 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -6,7 +6,7 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 
 - A want (`PokemonNotification`) is per member and server and is one of: a species (every form, megas included), one form (`form`, a catalogue key), the shadow raids of either (`shadow`; since plan 8R-2 shadow raids and Team GO Rocket catches, the Shadow box), a raid tier (raids only), perfect or zero IVs (spawns only); a mega is raids only. The columns are read and written only through the codec (`notification-target.ts`: `readNotification` gives the target and the scope in effect; a row it cannot read is skipped, counted and never deleted on its own) and the pure functions of `src/domain/pogo/wants.ts` (`readWants`, `planSetWant`, `rowsOfWant`: duplicate legacy rows are one want with the union of their scopes, two keys of one catalogue entry are one want, a row is rewritten only when its meaning changes). `ctx.wants` (`WantStorage`: `list`, `set`, `remove`, `removeAll`, `count`) is the repository; `MemoryWants` (`test/support/wants.ts`) is its twin and runs the same functions. `pokemonWantFits(catalogue, target, entry, shadowRaid)` says whether a want is for a boss or a spawn. Since plan 8R-1 a raid scope means raids only (no max battles), and the legacy `!wants` codec and the scope rules (`planSetWant`, `widerScope`) are unchanged.
 - **Costumed wants** (plan 8R-4, migration 030; design `2026-10-22-costume-form-wants-design.md`): `PokemonNotification.costumed` and `TargetWant.costumed` (tinyint, default 0) make a Pokémon's want costumed only, a property of the row like the scope, never part of its target, token, unique key or id (`Want.costumed?: true`, a Pokémon's `TargetWant.costumed?: true`; `boxTarget(kind, dex, form, costumed)`, `withCostume`, `isCostumedTarget`; a Stop or Remove takes the row whatever its costume). Rows of one target that disagree read as plain (`readWants`: plain wins, as the wider scope); `planSetWant(…, costumed)` rewrites a row whose costume differs; a `TargetWant` added again takes the costume of its add (an upsert per costume, `createdAt` kept). Every sighting carries `costumed` (`PokemonSighting`): a raid's boss as the list has it in the raid's tier (`ShownBoss.costumed`), a spawn as `SpawnNews.costumed` says, a research reward by `rewardCostumed` (its Leek Duck name and picture, worked out when read), a max boss and a Rocket catch never. `pokemonWantFits(…, costumed)` fits a costumed want only to a costumed sighting, under the entry the costume copies; a plain want fits either. The matchers (`raidWantsFiring`, `spawnWantsFiring`, `rocketShadowFiring`) give the wants themselves, so a reason carries `costumed` (`wantReason`) and the DM names it "Costumed Pikachu" (`wantTargetLabel(…, costumed)`, `pokemonWantName({ costumed })`: no "(every form)", "Costumed Corsola"), a target "Costumed Pikachu (research)" (`targetWantLabel`); members told of one event share a message only where their reasons read alike (`shownReasonKey`).
-- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy, written at once with no dialog (`rocketWantAnswer`: a grunt type at most one DM an hour for each type). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (`wantbox:p<dex>:set:<shown>[:<form>]`, `wantbox:t:set:<level>:<shown>`, `<shown>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `wantBoxId`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock (`WantBoxStorage.set`, `planBoxes`; `WantBoxRepository`, twin `MemoryWantBoxes`); nothing ticked takes the target off. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
+- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy, written at once with no dialog (`rocketWantAnswer`: a grunt type at most one DM an hour for each type). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (since plan 8R-4 `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>][:<form>][:l<page>]:~<token>`, a tier `wantbox:t<level>:set2:…`; `src/commands/notifications/want-dialog.ts`, `wantDialogId` / `readWantDialogId`: `<mask>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `<flags>` whether it showed Costumes (1) and Remove (2), `<which>` `whichHash` of the keys its Which field showed, `0` for none (`NO_WHICH`), the server where it was opened from a DM, the form only beyond the Which field (an Unown letter), the page of `/wants`, last `openToken` of when it opened (plan 8X-F: Discord's client shows what was last submitted under an id in place of what the dialog ticks), which `readWantDialogId` leaves out; an id of before (`set`) or of any other shape, one without its token, and a Which hash that is not the field's now, are `STALE_COMPONENT`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock; nothing ticked takes the target off. **One answer per species** (plan 8R-4, design 3; `src/domain/pogo/species-answer.ts`): an answer (`BoxAnswer`: the forms that stand, `undefined` the subject's own row, of a species the species row; the boxes ticked of those shown; costumed; Remove) covers a scope (`AnswerScope`, `scopeOf`: a species is `wide`, every row of its Pokédex number in both tables, `PokemonNotification.pokemon = <dex>` and `TargetWant.target` `<kind>:<dex>` exactly or `<kind>:<dex>:%`, so 25 never reads 251; a species with more entries than the Which field holds, `WHICH_CAP` 25, Unown, is not: its species row and each letter are answers of their own; a tier is its own). `WantBoxStorage.held(member, server, scope)` gives the rows by form (`HeldRow`: its boxes, costumed when every row of it is; `heldRows`), `set(member, server, answer, at)` carries out `planAnswer`: Remove, no form or no box shown ticked takes every row of the scope away, the boxes the dialog did not show included (A2, Q1); every form ticked gets the boxes ticked of those shown and keeps the others as its row had them (a new row: as the scope's rows had them together), all with the answer's costume (`costumed` undefined where the dialog did not show Costumes: each row keeps its own, a new row costumed where every row held is, `allCostumed`, A1); a mega a raid row and nothing else, always plain, nothing without Raids (review R4c, A-D3; `FormReader`'s `mega`); every other row goes; in one transaction under the member's lock (`WantBoxRepository`, twin `MemoryWantBoxes`, both `wantBoxCases`). `removalAnswer(scope)` is `/unwant`'s, a list's Remove and a DM's Stop of a subject. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
 - What a member picked in the `target` option of `/want` or `/unwant` is a want token (`wantToken` / `parseWantToken`: `pokemon:<dex>[:<form>][:shadow]`, `tier:<level>[:shadow]`, `iv:perfect|zero`): the value of an autocomplete choice, never part of a custom id. Text sent without picking never guesses (`readWantText`): it acts only when it is a tier or IV word in full (`wantWord`), exactly a species' name (every form) or exactly one form's own name, with `shadow` before either; anything else is refused with suggestions. A bare number is a tier or IV word, never a Pokédex number.
 - Wants are named in one way everywhere (`wantLabel` / `wantName` in `src/commands/notifications/want-input.ts`): "X (every form)" for a species with several entries, "X (base form)" for its plain entry, "Shadow X", and the scope after " · " in the choices of `/unwant`.
 - Gym targets (`GymNotification`; `gym` holds a gym id as text) are `ctx.gymTargets` (`GymTargetStorage`), with `MemoryGymTargets` as the twin. In code "target" alone is what a want is for; a gym a member wants raids of is a gym target.
@@ -14,13 +14,13 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 
 ## The notifier
 
-- Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `maxReported` and `maxChanged` (plan 8X-3: a max battle's report, once its post exists, and a boss that is another; who wants the boss, `maxWantsFiring`: since plan 8R-1 the Dynamax box of a Dynamax battle and the Gigantamax box of a Gigantamax one (`TargetWant` `dynamax:` / `gigantamax:`, of the species or of the boss's form; Matt's answer 9 of the stop reports design), never a raid, tier, shadow or spawn want, no gym target; at most one DM an hour per member, boss and kind (a Gigantamax Machamp is told within the hour of a Dynamax one), `MAX_WANT_QUIET_MS`, kept in memory and lost on a restart, read when the members are gathered and written as each message is put in line, so two reports of one boss moments apart at two spots may both reach a member; the DM says so in small print, `maxHourNote`: "You won't be told about more Dynamax Machamp battles for an hour.", under the news and its links, above the reasons and their Stop buttons (plan 8X-F: beside Stop it read as what Stop does); a battle at a pin is "at an unlisted power spot" in its sentences (`MaxDmView.pin`); the spot's and the boss's names through `plainNoLinks`), `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated` (the DM names a train of max battles by its kind, "A new Gigantamax Train has been announced", plan 8X-4; a raid train "A new train" as before), `meetingTimeChanged` (a group's meeting time in a raid or a max battle, `isBattle`; the DM names `the max battle at <spot>`), `startTimeChanged`, `spawnReported`, `researchReported` (plan 8R-1, `stop-reports.md`, "Wants and DMs": a research report's DM per region channel, with a member's own variant of the stops not told yet, `Announcement.variant`), `rocketReported` (plan 8R-2, the same section: a Rocket report's DM per region channel; a grunt at the spawn priority, one an hour per member and grunt type; a hideout once a day per stop). Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
+- Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `maxReported` and `maxChanged` (plan 8X-3: a max battle's report, once its post exists, and a boss that is another; who wants the boss, `maxWantsFiring`: since plan 8R-1 the Dynamax box of a Dynamax battle and the Gigantamax box of a Gigantamax one (`TargetWant` `dynamax:` / `gigantamax:`, of the species or of the boss's form; Matt's answer 9 of the stop reports design), never a raid, tier, shadow or spawn want, no gym target; at most one DM an hour per member, boss and kind (a Gigantamax Machamp is told within the hour of a Dynamax one), `MAX_WANT_QUIET_MS`, kept in memory and lost on a restart, read when the members are gathered and written as each message is put in line, so two reports of one boss moments apart at two spots may both reach a member; the DM says so in small print, `maxHourNote`: "You won't be told about more Dynamax Machamp battles for an hour."; the spot's and the boss's names through `plainNoLinks`), `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated` (the DM names a train of max battles by its kind, "A new Gigantamax Train has been announced", plan 8X-4; a raid train "A new train" as before), `meetingTimeChanged` (a group's meeting time in a raid or a max battle, `isBattle`; the DM names `the max battle at <spot>`), `startTimeChanged`, `spawnReported`, `researchReported` (plan 8R-1, `stop-reports.md`, "Wants and DMs": a research report's DM per region channel, with a member's own variant of the stops not told yet, `Announcement.variant`), `rocketReported` (plan 8R-2, the same section: a Rocket report's DM per region channel; a grunt at the spawn priority, one an hour per member and grunt type; a hideout once a day per stop). Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
 - New-train DMs are per member and server: `ctx.newTrains` (`NewTrainStorage`: `isOn`, `set`, `wanting(guildId)`; table `NewTrainNotification`; twin `MemoryNewTrains`). The legacy column `User.newTrain` is neither read nor written. Boss-set is still one setting of the member.
 
 ## Sending direct messages
 
 - Direct messages go out only through `DmSender` (`src/services/dm-sender.ts`; the app's is `QueuedDmSender`): `send(job)` puts a message in line and returns, never waits for Discord and never throws. A timer starts at most one send every 100 ms, five on their way at most; priorities are `DM_PRIORITY.urgent` (meeting times, boss-set), `spawn` (spawns, Rocket grunts), `normal` (raid wants, gym targets, new trains, max battles, field research, Rocket hideouts), the oldest event first within one; a job carries `eventAt` and `expiresAt` and is dropped once that has passed. There is no retry (discord.js waits out a 429), a pause of a minute when Discord refuses to open DM channels, an hour's memory of members who take no DMs, and a log line with the numbers of every burst. Never loop over recipients and send: the legacy bot lost its gateway connection that way. Tests use `RecordingDms` or `QueuedDmSender` over `FakeDmGateway` (`test/support/dms.ts`, `pullUntilIdle`). In rehearsal mode the members' sender is `RehearsalDms` over the queue: only the allowlist is written to (`operations.md`).
-- A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), the note (`DmNews.note`, `-#`), then a separator, "You asked to be told about", the reasons that get no button in one text with the command that stops them (`stopHint`), and last, after all text, one section per reason with a `Stop` button beside it (plan 8X-F, Matt: the Stop buttons always last), as many as the message has room for beside its links, picture and note (`stopButtonRoom`, the note counted: before 8X-F a DM with a note and eleven or more stoppable reasons went one over Discord's 40 components). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a `TargetWant` is `target` with `rp`, `ri`, `re`, `dx`, `gx` (plan 8R-2: `rg:<type|none>`, `rl:<leader|any>`, `rv`, `rd`) and a subject's every box `subject` with `sp` / `st`, plan 8R-1; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag).
+- A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), then "You asked to be told about" and one section per reason with a `Stop` button beside it, as many as the message has room for beside its links and picture (`stopButtonRoom`; the rest are named in `stopHint`). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a `TargetWant` is `target` with `rp`, `ri`, `re`, `dx`, `gx` (plan 8R-2: `rg:<type|none>`, `rl:<leader|any>`, `rv`, `rd`) and a subject's every box `subject` with `sp` / `st`, plan 8R-1; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag).
 - The owner's DM of a request for the Wayspot export tool (plan 8W-P; `web.md`, "The Wayspot export tool"): a new request, or one asked again after a refusal, queues a DM to `OWNER_ID` through `DmSender` (`normal`, expiring after 7 days; the queue is in memory, so a restart loses it and the page is the fallback), only while at most `OPEN_REQUESTS_NOTIFIED` 20 requests are open (any Discord account can ask; the rest wait on the page). It is `accessRequestDm` (`src/render/script-access-dm.ts`): who asks by name (`plainNoLinks`) and id as plain text, no mention, the community line through `plainNoLinks`, when, and **Approve** / **Refuse**, custom ids `scriptaccess:<row id>:approve|refuse:<askedAt in base 36>`. The handler (`scriptAccessControls`, `src/components/script-access.ts`) has a guard that the presser is `OWNER_ID` (a guard refusal counts against no throttle) and `SCRIPT_ACCESS_THROTTLE` 20 a minute; a press decides the request as it is now and for the asking it was drawn for, and edits the DM to what was decided and when without its buttons (`accessDecidedDm`): decided meanwhile, "Decided already: …"; asked again since, "Asked again since, <time>: decide it on its new DM or on the page."; a row gone or a button it cannot read is out of date. No fresh web login is needed for the DM.
 
 ## Spawn reports
diff --git a/src/commands/notifications/want-boxes.ts b/src/commands/notifications/want-boxes.ts
index 8194368bb7c34b0c8651955ac6d1d8d6aeffb631..41ce49dd8cbadb6430a3bcb67d03320d1a376de7 100644
--- a/src/commands/notifications/want-boxes.ts
+++ b/src/commands/notifications/want-boxes.ts
@@ -28,6 +28,7 @@ import {
   type BoxSubject,
   type WantBox,
 } from '../../domain/pogo/want-boxes.js';
+import { answerScopeOf, type AnswerScope } from '../../domain/pogo/species-answer.js';
 import { appearsInWild } from '../../domain/pogo/wild.js';
 import type { WantList } from '../../domain/pogo/wants.js';
 import { foldTaskText } from '../../domain/research/task.js';
@@ -192,6 +193,16 @@ export function shownBoxes(ctx: AppContext, subject: BoxSubject): WantBox[] {
   });
 }
 
+/**
+ * The rows an answer about a subject covers (plan 8R-4): of a species every row of its Pokédex
+ * number in both tables, unless it has more forms than the Which field holds (Unown: its species
+ * row and each letter apart); of a form beyond the Which field, and of a tier, its own.
+ */
+export function scopeOf(ctx: AppContext, subject: BoxSubject): AnswerScope {
+  const entries = subject.kind === 'pokemon' ? ctx.gameData.catalogue.byDex(subject.dex).length : 0;
+  return answerScopeOf(subject, entries);
+}
+
 /** Every box of a kind of subject: what `/unwant` and a list's Remove take away. */
 export function allBoxes(subject: BoxSubject): readonly WantBox[] {
   return subject.kind === 'tier' ? ['raids', 'shadow-raids'] : POKEMON_BOXES;
diff --git a/src/commands/notifications/want-dialog.test.ts b/src/commands/notifications/want-dialog.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8f1b1816f44110a9f18adabbad32ded87e004517
--- /dev/null
+++ b/src/commands/notifications/want-dialog.test.ts
@@ -0,0 +1,100 @@
+import { describe, expect, it } from 'vitest';
+import { decodeCustomId } from '../../discord/custom-id.js';
+import { readWantDialogId, wantDialogId, type WantDialogId } from './want-dialog.js';
+
+const SERVER = '100000000000000011';
+/** When a dialog opened, and its per-open token (`openToken`, plan 8X-F). */
+const OPENED = Date.UTC(2026, 9, 22, 16, 30);
+const TOKEN = `~${OPENED.toString(36)}`;
+const read = (customId: string): WantDialogId | undefined => {
+  const id = decodeCustomId(customId);
+  return id && readWantDialogId(id);
+};
+
+describe('the custom id of /want’s dialog (plan 8R-4, F6)', () => {
+  const corsola: WantDialogId = {
+    subject: { kind: 'pokemon', dex: 222 },
+    shown: ['raids', 'spawns', 'research', 'shadow'],
+    costumes: true,
+    remove: true,
+    which: 'k3n1x2',
+  };
+
+  it('carries the boxes shown, the fields shown, the Which hash, then server, form and page', () => {
+    expect(wantDialogId(corsola, OPENED)).toBe(`wantbox:p222:set2:1l:3:k3n1x2:${TOKEN}`);
+    expect(wantDialogId({ ...corsola, costumes: false, remove: false, which: '0' }, OPENED)).toBe(
+      `wantbox:p222:set2:1l:0:0:${TOKEN}`,
+    );
+    const letter: WantDialogId = {
+      subject: { kind: 'pokemon', dex: 201, form: 'unown_question_mark' },
+      shown: ['raids', 'spawns'],
+      costumes: false,
+      remove: true,
+      which: '0',
+      server: SERVER,
+      page: 2,
+    };
+    expect(wantDialogId(letter, OPENED)).toBe(
+      `wantbox:p201:set2:9:2:0:${SERVER}:unown_question_mark:l2:${TOKEN}`,
+    );
+    const tier: WantDialogId = {
+      subject: { kind: 'tier', level: 'MegaLegendary' },
+      shown: ['raids', 'shadow-raids'],
+      costumes: false,
+      remove: false,
+      which: '0',
+      page: 0,
+    };
+    expect(wantDialogId(tier, OPENED)).toBe(`wantbox:tMegaLegendary:set2:3:0:0:l0:${TOKEN}`);
+    for (const one of [corsola, letter, tier, { ...corsola, server: SERVER }]) {
+      expect(read(wantDialogId(one, OPENED))).toEqual(one);
+    }
+  });
+
+  // Plan 8X-F, "For 8R-4": Discord's client shows what was last submitted under a custom id in
+  // place of what the dialog marks, so every opening has an id of its own.
+  it('ends in a token of when it opened, which a Submit leaves out', () => {
+    const later = wantDialogId(corsola, OPENED + 1);
+    expect(later).not.toBe(wantDialogId(corsola, OPENED));
+    expect(read(later)).toEqual(corsola);
+    // The longest: the largest Pokédex number and mask, a Which hash of seven, a server, Unown's
+    // longest letter and a page of three digits, opened in a far year.
+    const longest = wantDialogId(
+      {
+        subject: { kind: 'pokemon', dex: 1025, form: 'unown_question_mark' },
+        shown: ['raids', 'dynamax', 'gigantamax', 'spawns', 'research', 'shadow'],
+        costumes: true,
+        remove: true,
+        which: 'zzzzzzz',
+        server: '18446744073709551615',
+        page: 999,
+      },
+      Date.UTC(2999, 11, 31),
+    );
+    expect(longest.length).toBeLessThanOrEqual(100);
+  });
+
+  it('reads any other shape as none: an id of before the deploy, or one of a later version', () => {
+    for (const customId of [
+      'wantbox:p68:set:1r',
+      'wantbox:t:set:T5:3',
+      // The shape of the dialog before plan 8R-4 had a token (no released dialog has it).
+      'wantbox:p68:set2:1r:0:0',
+      `wantbox:p68:set2:1r:0:0:${SERVER}`,
+      `wantbox:p68:set3:1r:0:0:${TOKEN}`,
+      `wantbox:p68:set2:1r:0:${TOKEN}`,
+      `wantbox:p68:set2:0:0:0:${TOKEN}`,
+      `wantbox:p68:set2:1r:z:0:${TOKEN}`,
+      `wantbox:p0:set2:1r:0:0:${TOKEN}`,
+      `wantbox:tT9:set2:3:0:0:${TOKEN}`,
+      `wantbox:tT5:set2:3:0:0:unown_a:${TOKEN}`,
+      `wantbox:p201:set2:9:2:0:unown_a:${SERVER}:${TOKEN}`,
+      `wantbox:p201:set2:9:2:0:l2:unown_a:${TOKEN}`,
+      `wantbox:p201:set2:9:2:0:Unown A:${TOKEN}`,
+      `wantbox:p201:set2:9:2:0:unown_a:l1:more:${TOKEN}`,
+      `wantbox:p201:set2:9:2:0:unown_a:${TOKEN}:l1`,
+    ]) {
+      expect(read(customId), customId).toBeUndefined();
+    }
+  });
+});
diff --git a/src/commands/notifications/want-dialog.ts b/src/commands/notifications/want-dialog.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8ad0e4c68b9943883acf9776d8201a1333ff758f
--- /dev/null
+++ b/src/commands/notifications/want-dialog.ts
@@ -0,0 +1,144 @@
+import { encodeCustomId, type CustomId } from '../../discord/custom-id.js';
+import { openToken, withoutOpenToken } from '../../discord/dialog.js';
+import { isSnowflake } from '../../db/snowflake.js';
+import { isFormKey, isPokedexNumber } from '../../domain/pogo/notification-target.js';
+import { isRaidLevel } from '../../domain/pogo/raid-tier.js';
+import type { BoxSubject, WantBox } from '../../domain/pogo/want-boxes.js';
+import { allBoxes } from './want-boxes.js';
+
+/*
+ * The custom id of `/want`'s dialog (plan 8R-4, F6): what a Submit needs to know of the dialog it
+ * comes from, and nothing kept anywhere else.
+ */
+
+/**
+ * The custom-id kind of `/want`'s dialog: `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>]
+ * [:<form>][:l<page>]:~<token>` for a Pokémon, `wantbox:t<level>:set2:…` for a tier
+ * (`wantDialogId`); the token is `openToken` of when it opened (plan 8X-F, "For 8R-4").
+ */
+export const WANT_BOX_KIND = 'wantbox';
+
+/**
+ * The action of the dialog's Submit: `set2` since plan 8R-4, the version of its arguments. An
+ * id of before (`set`) or of any other shape, also one without its token, is out of date
+ * (`STALE_COMPONENT`).
+ */
+export const WANT_BOX_ACTION = 'set2';
+
+/** The Which field's hash where the dialog shows none. */
+export const NO_WHICH = '0';
+
+/** What the custom id of a dialog says. */
+export interface WantDialogId {
+  /** A species (no form), one form beyond the Which field (an Unown letter), or a tier. */
+  subject: BoxSubject;
+  /** The boxes the dialog showed (review B3): the Submit writes those and no others. */
+  shown: WantBox[];
+  /** Whether the dialog showed the Costumes field and the Remove field. */
+  costumes: boolean;
+  remove: boolean;
+  /** `whichHash` of the keys its Which field showed (review R5), `NO_WHICH` for none. */
+  which: string;
+  /** The server it is about, when it was opened from a DM, which has none (Change…, plan 8R-4). */
+  server?: string;
+  /** The page of `/wants` it was opened from, shown again after the Submit. */
+  page?: number;
+}
+
+const COSTUMES_FLAG = 1;
+const REMOVE_FLAG = 2;
+
+/** The boxes shown as a bit per box of `allBoxes`, in base 36. */
+function maskOf(subject: BoxSubject, shown: readonly WantBox[]): string {
+  return allBoxes(subject)
+    .reduce((bits, box, index) => (shown.includes(box) ? bits | (1 << index) : bits), 0)
+    .toString(36);
+}
+
+/** The boxes a mask names; undefined for one that names none or too many. */
+function boxesOfMask(subject: BoxSubject, mask: string | undefined): WantBox[] | undefined {
+  if (mask === undefined || !/^[0-9a-z]{1,3}$/.test(mask)) return undefined;
+  const bits = parseInt(mask, 36);
+  const all = allBoxes(subject);
+  if (bits === 0 || bits >= 1 << all.length) return undefined;
+  return all.filter((_box, index) => (bits & (1 << index)) !== 0);
+}
+
+/**
+ * The custom id of a dialog's Submit, opened at `opened`: it ends in a per-open token
+ * (`openToken`, plan 8X-F), since Discord's client shows what was last submitted under an id in
+ * place of what the dialog ticks; a Submit leaves it out.
+ */
+export function wantDialogId(dialog: WantDialogId, opened: number): string {
+  const { subject } = dialog;
+  const flags = (dialog.costumes ? COSTUMES_FLAG : 0) | (dialog.remove ? REMOVE_FLAG : 0);
+  const id: CustomId = {
+    kind: WANT_BOX_KIND,
+    id: subject.kind === 'tier' ? `t${subject.level}` : `p${String(subject.dex)}`,
+    action: WANT_BOX_ACTION,
+    args: [
+      maskOf(subject, dialog.shown),
+      flags.toString(36),
+      dialog.which,
+      ...(dialog.server === undefined ? [] : [dialog.server]),
+      ...(subject.kind === 'pokemon' && subject.form !== undefined ? [subject.form] : []),
+      ...(dialog.page === undefined ? [] : [`l${String(dialog.page)}`]),
+      openToken(opened),
+    ],
+  };
+  return encodeCustomId(id);
+}
+
+/**
+ * What a custom id of the dialog says (`wantDialogId`), its token left out; undefined for any
+ * other shape, also one without a token: no dialog of `set2` was ever drawn without one.
+ */
+export function readWantDialogId(id: CustomId): WantDialogId | undefined {
+  if (id.kind !== WANT_BOX_KIND || id.action !== WANT_BOX_ACTION) return undefined;
+  const args = withoutOpenToken(id.args);
+  if (args.length === id.args.length) return undefined;
+  const [mask, flagText, which, ...rest] = args;
+  if (flagText === undefined || which === undefined) return undefined;
+  if (!/^[0-3]$/.test(flagText) || !/^[0-9a-z]{1,7}$/.test(which)) return undefined;
+  let subject: BoxSubject;
+  if (id.id.startsWith('t')) {
+    const level = id.id.slice(1);
+    if (!isRaidLevel(level)) return undefined;
+    subject = { kind: 'tier', level };
+  } else {
+    const dex = /^p([1-9]\d*)$/.exec(id.id)?.[1];
+    if (dex === undefined || !isPokedexNumber(Number(dex))) return undefined;
+    subject = { kind: 'pokemon', dex: Number(dex) };
+  }
+  // The optional parts in their order: the server, the form, the page.
+  let server: string | undefined;
+  let page: number | undefined;
+  let at = 0;
+  if (rest[at] !== undefined && isSnowflake(rest[at] ?? '')) server = rest[at++];
+  const form = rest[at];
+  if (form !== undefined && !/^l\d{1,3}$/.test(form)) {
+    if (subject.kind === 'tier' || !isFormKey(form) || isSnowflake(form)) return undefined;
+    subject = { kind: 'pokemon', dex: subject.dex, form };
+    at += 1;
+  }
+  const pageText = rest[at];
+  if (pageText !== undefined) {
+    const read = /^l(\d{1,3})$/.exec(pageText)?.[1];
+    if (read === undefined) return undefined;
+    page = Number(read);
+    at += 1;
+  }
+  if (at !== rest.length) return undefined;
+  const shown = boxesOfMask(subject, mask);
+  if (!shown) return undefined;
+  const flags = Number(flagText);
+  return {
+    subject,
+    shown,
+    costumes: (flags & COSTUMES_FLAG) !== 0,
+    remove: (flags & REMOVE_FLAG) !== 0,
+    which,
+    ...(server === undefined ? {} : { server }),
+    ...(page === undefined ? {} : { page }),
+  };
+}
diff --git a/src/commands/notifications/wants.test.ts b/src/commands/notifications/wants.test.ts
index 6c8b26b6ef2568a9bf5e8d6d71e7fe17301a80e7..dc59c5d90408cacf26a9b018c7827c2415c831f0 100644
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -46,7 +46,6 @@ import {
   unwantAll,
   want,
   wantBoxControls,
-  wantBoxId,
   wantControls,
   wantListControls,
   wants,
@@ -59,6 +58,7 @@ import {
 } from '../../../test/support/research.js';
 import { boxTarget } from '../../domain/notify/target-wants.js';
 import { wantEntries } from './want-boxes.js';
+import { NO_WHICH, wantDialogId } from './want-dialog.js';
 import type { ResearchTask } from '../../domain/research/task.js';
 import type { RocketChoice } from '../../domain/rocket/lineups.js';
 import { rocketChoicesOfFeed, rocketLineupsFixture } from '../../../test/support/rocket.js';
@@ -190,7 +190,8 @@ describe('/want', () => {
     const dialog = shownDialog(asked);
     expect(dialog.title).toBe('Machamp: what for?');
     // Its Submit names the six boxes it shows (B3).
-    expect(dialog.custom_id).toBe('wantbox:p68:set:1r');
+    // Then its per-open token (plan 8X-F).
+    expect(dialog.custom_id).toMatch(/^wantbox:p68:set2:1r:0:0:~[0-9a-z]+$/);
     expect(boxesOf(dialog)).toEqual([
       ['raids', 'Raids', false],
       ['dynamax', 'Dynamax', false],
@@ -252,14 +253,12 @@ describe('/want', () => {
     expect(made.formRows()).toEqual([]);
   });
 
-  it('keeps a species and each of its forms apart, each with its own boxes', async () => {
+  it('answers once for a species: a Submit of the species takes its forms’ rows away (plan 8R-4)', async () => {
     const made = setup();
     await wantWith(made, 'Alolan Rattata', ['spawns']);
+    expect(made.formRows()).toEqual([[19, 'spawn', 'rattata_alola', false]]);
     await wantWith(made, 'pokemon:19', ['raids']);
-    expect(made.formRows()).toEqual([
-      [19, 'spawn', 'rattata_alola', false],
-      [19, 'raid', null, false],
-    ]);
+    expect(made.formRows()).toEqual([[19, 'raid', null, false]]);
     // Shadow raids picked from the list are the Shadow box of their Pokémon's dialog.
     const shadow = shownDialog(await made.run('want', { target: 'pokemon:645::shadow' }));
     expect(shadow.title).toBe('Landorus (every form): what for?');
@@ -324,7 +323,16 @@ describe('/want', () => {
       0,
     );
     // A dialog that showed Raids and Spawns only (the boxes of another moment).
-    const customId = wantBoxId({ kind: 'pokemon', dex: 147 }, ['raids', 'spawns']);
+    const customId = wantDialogId(
+      {
+        subject: { kind: 'pokemon', dex: 147 },
+        shown: ['raids', 'spawns'],
+        costumes: false,
+        remove: false,
+        which: NO_WHICH,
+      },
+      Date.now(),
+    );
     const dialog = shownDialog(await made.run('want', { target: 'Dratini' }));
     await made.handle(
       fakeModal({
@@ -376,6 +384,23 @@ describe('/want', () => {
     expect(withRewards).toBeGreaterThan(0);
   });
 
+  it('refuses a Submit of before plan 8R-4 or of another Which field as out of date', async () => {
+    const made = setup();
+    const dialog = shownDialog(await made.run('want', { target: 'Dratini' }));
+    for (const customId of [
+      'wantbox:p147:set:1r',
+      dialog.custom_id.replace(/:0(:~[0-9a-z]+)$/, ':k3n1x2$1'),
+      // Without its per-open token (plan 8X-F): no dialog of this shape was drawn without one.
+      dialog.custom_id.replace(/:~[0-9a-z]+$/, ''),
+    ]) {
+      const submitted = await made.handle(
+        fakeModal({ customId, form: dialog, checked: { boxes: ['raids'] }, userId: ALICE }),
+      );
+      expect(sent(submitted.reply).content).toBe(STALE_COMPONENT);
+    }
+    expect(made.formRows()).toEqual([]);
+  });
+
   it('refuses a Submit without its boxes as out of date, and writes nothing (B4)', async () => {
     const made = setup();
     const dialog = shownDialog(await made.run('want', { target: 'Dratini' }));
diff --git a/src/commands/notifications/wants.ts b/src/commands/notifications/wants.ts
index 3e82e8bbd0374f06217cd000b1daeaa2da14616e..ff280ae77422eead2e271582ce5320ae2061d6b4 100644
--- a/src/commands/notifications/wants.ts
+++ b/src/commands/notifications/wants.ts
@@ -7,13 +7,13 @@ import {
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
-import { encodeCustomId, type CustomId } from '../../discord/custom-id.js';
 import { deferSubmit, readInTime } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf, requireGuild } from '../../discord/guards.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
-import { isFormKey, isPokedexNumber, type Want } from '../../domain/pogo/notification-target.js';
-import { isRaidLevel, raidTierLabel } from '../../domain/pogo/raid-tier.js';
+import type { Want } from '../../domain/pogo/notification-target.js';
+import { raidTierLabel } from '../../domain/pogo/raid-tier.js';
+import { boxesOf, removalAnswer, type BoxAnswer } from '../../domain/pogo/species-answer.js';
 import {
   BOX_DESCRIPTIONS,
   BOX_WORDS,
@@ -34,18 +34,25 @@ import { CHOICE_NAME, MAX_CHOICES, beginningFirst, type Choice } from '../choice
 import { removeAllQuestion } from './remove-all.js';
 import { NOTIFICATION_THROTTLE, notificationsEnabled } from './shared.js';
 import {
-  allBoxes,
   boxWords,
   readWanted,
   rewardLabel,
   rewardWantChoices,
   rocketWantChoices,
+  scopeOf,
   shownBoxes,
   subjectLabel,
   wantEntries,
   type Wanted,
   type WantEntry,
 } from './want-boxes.js';
+import {
+  NO_WHICH,
+  readWantDialogId,
+  wantDialogId,
+  WANT_BOX_KIND,
+  type WantDialogId,
+} from './want-dialog.js';
 import { wantChoices, wantLabel, wantName } from './want-input.js';
 import { answer, v2Answer } from '../../discord/late-reply.js';
 import { searchText, searchTokens } from '../../domain/search/text.js';
@@ -92,73 +99,12 @@ function ivAnswer(ctx: AppContext, outcome: SetWantOutcome): string {
   return `${promise(ctx, outcome.want)} \`/unwant\` takes them off again.`;
 }
 
-/**
- * The custom-id kind of `/want`'s dialog (plan 8R-1): `wantbox:p<dex>:set:<shown>[:<form>]`,
- * `wantbox:t:set:<level>:<shown>`; `<shown>` the boxes the dialog showed (`wantBoxId`).
- */
-export const WANT_BOX_KIND = 'wantbox';
-
 /** The checkbox group of the dialog. */
 const BOXES_INPUT = 'boxes';
 
 /** How many places of a full list of `/want`'s choices go to research rewards at most (B5). */
 const REWARD_ROOM = 5;
 
-/**
- * The custom id of a dialog's Submit: its subject and the boxes it showed (review B3), a bit per
- * box of `allBoxes` in base 36, so that the Submit writes those boxes and no others, whatever
- * the boxes that can happen are by then.
- */
-export function wantBoxId(subject: BoxSubject, shown: readonly WantBox[]): string {
-  const mask = allBoxes(subject)
-    .reduce((bits, box, index) => (shown.includes(box) ? bits | (1 << index) : bits), 0)
-    .toString(36);
-  const id: CustomId =
-    subject.kind === 'tier'
-      ? { kind: WANT_BOX_KIND, id: 't', action: 'set', args: [subject.level, mask] }
-      : {
-          kind: WANT_BOX_KIND,
-          id: `p${String(subject.dex)}`,
-          action: 'set',
-          args: subject.form === undefined ? [mask] : [mask, subject.form],
-        };
-  return encodeCustomId(id);
-}
-
-/** The boxes a mask of `wantBoxId` names; undefined for one that names none or too many. */
-function boxesOfMask(subject: BoxSubject, mask: string | undefined): WantBox[] | undefined {
-  if (mask === undefined || !/^[0-9a-z]{1,3}$/.test(mask)) return undefined;
-  const bits = parseInt(mask, 36);
-  const all = allBoxes(subject);
-  if (bits === 0 || bits >= 1 << all.length) return undefined;
-  return all.filter((_box, index) => (bits & (1 << index)) !== 0);
-}
-
-/** The subject and the boxes shown of a custom id (`wantBoxId`); undefined for any other. */
-function submitOfId(id: CustomId): { subject: BoxSubject; shown: WantBox[] } | undefined {
-  if (id.action !== 'set') return undefined;
-  const [first, second, ...more] = id.args;
-  if (more.length > 0) return undefined;
-  let subject: BoxSubject;
-  let mask: string | undefined;
-  if (id.id === 't') {
-    if (first === undefined || !isRaidLevel(first)) return undefined;
-    subject = { kind: 'tier', level: first };
-    mask = second;
-  } else {
-    const dex = /^p([1-9]\d*)$/.exec(id.id)?.[1];
-    if (dex === undefined || !isPokedexNumber(Number(dex))) return undefined;
-    if (second !== undefined && !isFormKey(second)) return undefined;
-    subject =
-      second === undefined
-        ? { kind: 'pokemon', dex: Number(dex) }
-        : { kind: 'pokemon', dex: Number(dex), form: second };
-    mask = first;
-  }
-  const shown = boxesOfMask(subject, mask);
-  return shown && { subject, shown };
-}
-
 /** What a tier's boxes say under their names. */
 function tierDescriptions(level: string): Record<'raids' | 'shadow-raids', string> {
   return {
@@ -179,12 +125,19 @@ export function wantDialog(
   held: ReadonlySet<WantBox>,
 ): APIModalInteractionResponseCallbackData {
   const label = subjectLabel(ctx, subject);
+  const id: WantDialogId = {
+    subject,
+    shown: [...shown],
+    costumes: false,
+    remove: false,
+    which: NO_WHICH,
+  };
   const describe = (box: WantBox): string =>
     subject.kind === 'tier'
       ? tierDescriptions(label)[box === 'shadow-raids' ? 'shadow-raids' : 'raids']
       : BOX_DESCRIPTIONS[box as PokemonBox];
   return {
-    custom_id: wantBoxId(subject, shown),
+    custom_id: wantDialogId(id, Date.now()),
     title: truncate(`${label}: what for?`, 45),
     components: [
       textDisplay(
@@ -368,23 +321,22 @@ export const want: SimpleCommand = {
     }
     const { subject } = wanted;
     const shown = shownBoxes(ctx, subject);
+    const scope = scopeOf(ctx, subject);
     if (shown.length === 1) {
       // One box: nothing to ask (design 7: a mega, a tier without shadow raids).
       const { after } = await ctx.wantBoxes.set(
         memberId,
         guildId,
-        subject,
-        new Set(shown),
-        shown,
+        boxAnswerOf(scope, new Set(shown), shown),
         Date.now(),
       );
-      await answer(interaction, { content: boxesAnswer(ctx, subject, after) });
+      await answer(interaction, { content: boxesAnswer(ctx, subject, boxesOf(after)) });
       return;
     }
     const held = await readInTime(ctx.log, interaction, () =>
-      ctx.wantBoxes.held(memberId, guildId, subject),
+      ctx.wantBoxes.held(memberId, guildId, scope),
     );
-    await interaction.showModal(wantDialog(ctx, subject, shown, held));
+    await interaction.showModal(wantDialog(ctx, subject, shown, boxesOf(held)));
   },
 
   async autocomplete(interaction, ctx) {
@@ -401,6 +353,15 @@ export const want: SimpleCommand = {
   },
 };
 
+/** The answer of a dialog that writes its subject's own row (no Which field yet). */
+function boxAnswerOf(
+  scope: BoxAnswer['scope'],
+  ticked: ReadonlySet<WantBox>,
+  shown: readonly WantBox[],
+): BoxAnswer {
+  return { scope, forms: [undefined], ticked, shown, costumed: false, remove: false };
+}
+
 /** The boxes a Submit ticked; a form without the group is of another shape: out of date (B4). */
 function tickedOf(interaction: ModalSubmitInteraction): readonly string[] {
   try {
@@ -420,8 +381,10 @@ export const wantBoxControls: ComponentHandler = {
   guards: [requireGuild],
   throttle: NOTIFICATION_THROTTLE,
   async modal(interaction, id, ctx) {
-    const submit = submitOfId(id);
-    if (!submit) throw new UserError(STALE_COMPONENT);
+    const submit = readWantDialogId(id);
+    // An id of before plan 8R-4, of another shape, or a Which field the game data has changed
+    // since (review R5): out of date, nothing written.
+    if (!submit || submit.which !== NO_WHICH) throw new UserError(STALE_COMPONENT);
     // The boxes the dialog showed (B3), not those that can happen now.
     const { subject, shown } = submit;
     const ticked = new Set(
@@ -431,12 +394,10 @@ export const wantBoxControls: ComponentHandler = {
     const { after } = await ctx.wantBoxes.set(
       interaction.user.id,
       guildIdOf(interaction),
-      subject,
-      ticked,
-      shown,
+      boxAnswerOf(scopeOf(ctx, subject), ticked, shown),
       Date.now(),
     );
-    await interaction.editReply({ content: boxesAnswer(ctx, subject, after) });
+    await interaction.editReply({ content: boxesAnswer(ctx, subject, boxesOf(after)) });
   },
 };
 
@@ -484,12 +445,10 @@ async function removeEntry(
     const { before } = await ctx.wantBoxes.set(
       memberId,
       guildId,
-      what.subject,
-      new Set(),
-      allBoxes(what.subject),
+      removalAnswer(scopeOf(ctx, what.subject)),
       Date.now(),
     );
-    return before.size > 0;
+    return before.length > 0;
   }
   if (what.kind === 'want') return ctx.wants.remove(memberId, guildId, what.target);
   return ctx.targetWants.remove(memberId, guildId, what.want);
diff --git a/src/components/dm.ts b/src/components/dm.ts
index cef19e4dee40e765e38be0cbea3eeb20789ab6a8..ff340c03160d85686b3a76453bcd1af48870fadf 100644
--- a/src/components/dm.ts
+++ b/src/components/dm.ts
@@ -1,7 +1,8 @@
 import { ComponentType, MessageFlags, type Message } from 'discord.js';
 import type { AppContext } from '../app-context.js';
 import { SCOPE_WORDS } from '../commands/notifications/want-input.js';
-import { allBoxes, rewardLabel, subjectLabel } from '../commands/notifications/want-boxes.js';
+import { rewardLabel, scopeOf, subjectLabel } from '../commands/notifications/want-boxes.js';
+import { removalAnswer } from '../domain/pogo/species-answer.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { isSnowflake } from '../db/snowflake.js';
 import { UserError } from '../discord/errors.js';
@@ -85,12 +86,10 @@ async function stop(
       const { before } = await ctx.wantBoxes.set(
         memberId,
         guildId,
-        reason.subject,
-        new Set(),
-        allBoxes(reason.subject),
+        removalAnswer(scopeOf(ctx, reason.subject)),
         Date.now(),
       );
-      return before.size > 0
+      return before.length > 0
         ? `Removed **${name}** from your list for that server. \`/want\` there adds it again.`
         : `**${name}** was already removed from your list for that server.`;
     }
diff --git a/src/db/repositories/want-box-repository.db.test.ts b/src/db/repositories/want-box-repository.db.test.ts
index a0a8fb8d4b5081a6b5a9602023e063907d39b156..967272ddfd6d0a83ff023d11b54a57fe5c9825d9 100644
--- a/src/db/repositories/want-box-repository.db.test.ts
+++ b/src/db/repositories/want-box-repository.db.test.ts
@@ -2,7 +2,8 @@ import type { Kysely } from 'kysely';
 import { afterAll, beforeAll, describe, expect, it } from 'vitest';
 import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
 import { ASH, WANT_SERVER, WANTED_AT } from '../../../test/support/target-want-cases.js';
-import { wantBoxCases } from '../../../test/support/want-box-cases.js';
+import { boxAnswer, wantBoxCases } from '../../../test/support/want-box-cases.js';
+import { boxesOf } from '../../domain/pogo/species-answer.js';
 import { fixtureForms } from '../../../test/support/wants.js';
 import type { DB } from '../types.js';
 import { PokemonNotificationRepository } from './pokemon-notification-repository.js';
@@ -35,18 +36,18 @@ describe('WantBoxRepository', () => {
 
   it('runs two Submits of one member one after the other, under the member’s lock', async () => {
     const { boxes, wants, targets } = await fresh();
-    const dratini = { kind: 'pokemon', dex: 147 } as const;
+    const dratini = { subject: { kind: 'pokemon', dex: 147 }, wide: true } as const;
     const shown = ['raids', 'research', 'shadow'] as const;
     await Promise.all([
-      boxes.set(ASH, WANT_SERVER, dratini, new Set(['raids', 'research']), shown, WANTED_AT),
-      boxes.set(ASH, WANT_SERVER, dratini, new Set(['shadow', 'research']), shown, WANTED_AT),
+      boxes.set(ASH, WANT_SERVER, boxAnswer(dratini, ['raids', 'research'], { shown }), WANTED_AT),
+      boxes.set(ASH, WANT_SERVER, boxAnswer(dratini, ['shadow', 'research'], { shown }), WANTED_AT),
     ]);
     // Whichever came last, each table holds what one Submit made: never a mix of rows doubled.
     const held = await boxes.held(ASH, WANT_SERVER, dratini);
     expect([
       ['raids', 'research'],
       ['research', 'shadow'],
-    ]).toContainEqual([...held].sort());
+    ]).toContainEqual([...boxesOf(held)].sort());
     expect((await targets.list(ASH, WANT_SERVER)).wants).toHaveLength(1);
     expect((await wants.list(ASH, WANT_SERVER)).wants).toHaveLength(1);
   });
diff --git a/src/db/repositories/want-box-repository.ts b/src/db/repositories/want-box-repository.ts
index b892de777a976d44819034b56821e9d853b44268..3785dfbcae8177a8530d8d22d486f65783970109 100644
--- a/src/db/repositories/want-box-repository.ts
+++ b/src/db/repositories/want-box-repository.ts
@@ -13,13 +13,17 @@ import {
 } from '../../domain/pogo/notification-target.js';
 import {
   baseTarget,
-  heldBoxes,
-  planBoxes,
   shadowTarget,
   targetWantsOf,
   type BoxSubject,
-  type WantBox,
 } from '../../domain/pogo/want-boxes.js';
+import {
+  heldRows,
+  planAnswer,
+  type AnswerScope,
+  type BoxAnswer,
+  type HeldRow,
+} from '../../domain/pogo/species-answer.js';
 import {
   planSetWant,
   readWants,
@@ -34,38 +38,32 @@ import { notificationColumns } from './pokemon-notification-repository.js';
 import { RowIds } from './row-ids.js';
 import { changeTargetWants } from './target-want-repository.js';
 
-/** What a Submit of `/want`'s dialog changed: the boxes before and after. */
+/** What a Submit of `/want`'s dialog changed: the rows of its scope before and after. */
 export interface BoxChange {
-  before: Set<WantBox>;
-  after: Set<WantBox>;
+  before: HeldRow[];
+  after: HeldRow[];
 }
 
 /**
  * The boxes of `/want`'s dialog over the rows they map onto (plan 8R-1; design 9.1): a subject's
- * `PokemonNotification` rows (its own, its shadow one) and its `TargetWant` rows. Its twin in
- * memory is `MemoryWantBoxes` (`test/support/want-boxes.ts`); both run `wantBoxCases`.
+ * `PokemonNotification` rows (its own, its shadow one) and its `TargetWant` rows; since plan 8R-4
+ * one answer per species (`AnswerScope`: every row of its Pokédex number, in both tables, unless
+ * it is no wide scope). Its twin in memory is `MemoryWantBoxes` (`test/support/want-boxes.ts`);
+ * both run `wantBoxCases`.
  */
 export interface WantBoxStorage {
   /**
-   * The boxes a member holds of a subject in a server: the dialog's read, by the keys of both
-   * tables (the member's rows of one Pokédex number or tier, of one set of tokens).
+   * The rows a member holds of a scope in a server, by form, with their boxes and costume: the
+   * dialog's read, by the keys of both tables.
    */
-  held(memberId: string, guildId: string, subject: BoxSubject): Promise<Set<WantBox>>;
+  held(memberId: string, guildId: string, scope: AnswerScope): Promise<HeldRow[]>;
   /**
-   * Makes the boxes the dialog showed (`shown`) as `ticked`, the others as they are, in one
-   * transaction under the member's lock (`withMemberLocked`); nothing ticked takes them away.
-   * `at` is when, for a `TargetWant` row that is made. `costumed` (plan 8R-4) is written to
-   * every row of the subject that stands after it, in both tables.
+   * Writes a Submit (`planAnswer`): the boxes and costume to every form ticked, every other row of
+   * the scope away, the boxes the dialog did not show as each row had them, in one transaction
+   * under the member's lock (`withMemberLocked`). `at` is when, for a `TargetWant` row that is
+   * made.
    */
-  set(
-    memberId: string,
-    guildId: string,
-    subject: BoxSubject,
-    ticked: ReadonlySet<WantBox>,
-    shown: readonly WantBox[],
-    at: number,
-    costumed?: boolean,
-  ): Promise<BoxChange>;
+  set(memberId: string, guildId: string, answer: BoxAnswer, at: number): Promise<BoxChange>;
 }
 
 /** The numbers of `PokemonNotification.pokemon` a subject's rows may hold. */
@@ -78,24 +76,6 @@ function numbersOf(subject: BoxSubject): number[] {
   });
 }
 
-/**
- * The `TargetWant` rows a plan writes, with `costumed` (plan 8R-4): every box that stands after
- * it is written again (an upsert that keeps its row), so that a changed costume reaches the rows
- * that were there already.
- */
-export function costumedTargets(
-  subject: BoxSubject,
-  plan: { after: ReadonlySet<WantBox>; targets: { remove: TargetWant[] } },
-  costumed: boolean,
-): { add: TargetWant[]; remove: TargetWant[] } {
-  return {
-    add: targetWantsOf(subject).flatMap(([box, want]) =>
-      plan.after.has(box) ? [withCostume(want, costumed)] : [],
-    ),
-    remove: plan.targets.remove,
-  };
-}
-
 /** The `PokemonNotification` and `TargetWant` tables, for the boxes of a subject. */
 export class WantBoxRepository implements WantBoxStorage {
   /** `forms` reads a stored form (`formReader`); `ids` the process's memory of rows. */
@@ -128,56 +108,76 @@ export class WantBoxRepository implements WantBoxStorage {
     }));
   }
 
-  private async tokens(db: Kysely<DB>, member: MemberInGuild, subject: BoxSubject) {
-    const asked = targetWantsOf(subject).map(([, want]) => targetWantToken(want));
-    if (asked.length === 0) return [];
+  /**
+   * The `TargetWant` rows of a scope: of a wide one every token of the Pokédex number
+   * (`<kind>:<dex>` exactly or `<kind>:<dex>:<form>`, so that 25 never reads 251's), else the
+   * subject's own.
+   */
+  private async tokens(db: Kysely<DB>, member: MemberInGuild, scope: AnswerScope) {
+    const { subject } = scope;
+    const own = targetWantsOf(subject).map(([, want]) => targetWantToken(want));
+    if (own.length === 0) return [];
     const rows = await db
       .selectFrom('TargetWant')
-      .select('target')
+      .select(['target', 'costumed'])
       .where('guildId', '=', member.guildId)
       .where('userId', '=', member.userId)
-      .where('target', 'in', asked)
+      .where((eb) =>
+        scope.wide
+          ? eb.or([
+              eb('target', 'in', own),
+              ...own.map((token) => eb('target', 'like', `${token}:%`)),
+            ])
+          : eb('target', 'in', own),
+      )
+      .orderBy('id')
       .execute();
-    return rows.flatMap((row) => parseTargetWantToken(row.target) ?? []);
+    return rows.flatMap((row) => {
+      const want = parseTargetWantToken(row.target);
+      return want ? [withCostume(want, row.costumed !== 0)] : [];
+    });
   }
 
-  private async heldIn(db: Kysely<DB>, member: MemberInGuild, subject: BoxSubject) {
-    const rows = await this.rows(db, member, subject);
+  private async heldIn(db: Kysely<DB>, member: MemberInGuild, scope: AnswerScope) {
+    const rows = await this.rows(db, member, scope.subject);
     const { wants } = readWants(rows, this.forms);
-    return { rows, held: heldBoxes(subject, wants, await this.tokens(db, member, subject)) };
+    return { rows, held: heldRows(scope, wants, await this.tokens(db, member, scope)) };
   }
 
-  async held(memberId: string, guildId: string, subject: BoxSubject): Promise<Set<WantBox>> {
+  async held(memberId: string, guildId: string, scope: AnswerScope): Promise<HeldRow[]> {
     const member = await findMemberInGuild(this.db, memberId, guildId, this.ids);
-    if (!member) return new Set();
-    return (await this.heldIn(this.db, member, subject)).held;
+    if (!member) return [];
+    return (await this.heldIn(this.db, member, scope)).held;
   }
 
-  set(
-    memberId: string,
-    guildId: string,
-    subject: BoxSubject,
-    ticked: ReadonlySet<WantBox>,
-    shown: readonly WantBox[],
-    at: number,
-    costumed = false,
-  ): Promise<BoxChange> {
-    const adds = shown.some((box) => ticked.has(box));
+  set(memberId: string, guildId: string, answer: BoxAnswer, at: number): Promise<BoxChange> {
+    const { scope } = answer;
+    const adds =
+      !answer.remove &&
+      answer.forms.length > 0 &&
+      answer.shown.some((box) => answer.ticked.has(box));
+    const dex = scope.subject.kind === 'pokemon' ? scope.subject.dex : 0;
     return withMemberLocked(
       this.db,
       memberId,
       guildId,
       adds,
       async (trx, member) => {
-        if (!member) return { before: new Set<WantBox>(), after: new Set<WantBox>() };
-        const { rows, held } = await this.heldIn(trx, member, subject);
-        const plan = planBoxes(subject, held, ticked, shown);
-        await this.setRow(trx, member, rows, baseTarget(subject), plan.base, costumed);
-        const shadow = shadowTarget(subject);
-        if (shadow) {
-          await this.setRow(trx, member, rows, shadow, plan.shadow ? 'raid' : null, costumed);
+        if (!member) return { before: [], after: [] };
+        const { rows, held } = await this.heldIn(trx, member, scope);
+        const plan = planAnswer(scope, held, answer, (form) => this.forms(dex, form).mega);
+        const targets: { add: TargetWant[]; remove: TargetWant[] } = { add: [], remove: [] };
+        for (const row of plan.rows) {
+          await this.setRow(trx, member, rows, baseTarget(row.subject), row.base, row.costumed);
+          const shadow = shadowTarget(row.subject);
+          if (shadow) {
+            const scopeOf = row.shadow ? 'raid' : null;
+            await this.setRow(trx, member, rows, shadow, scopeOf, row.costumed);
+          }
+          targets.add.push(...row.targets.add);
+          targets.remove.push(...row.targets.remove);
         }
-        await changeTargetWants(trx, member, costumedTargets(subject, plan, costumed), at);
+        await changeTargetWants(trx, member, targets, at);
         return { before: held, after: plan.after };
       },
       this.ids,
diff --git a/src/domain/pogo/species-answer.test.ts b/src/domain/pogo/species-answer.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2ed4d4de51dbf1aa311ca21e00c4bf78acfce020
--- /dev/null
+++ b/src/domain/pogo/species-answer.test.ts
@@ -0,0 +1,247 @@
+import { describe, expect, it } from 'vitest';
+import { boxTarget, type TargetWant } from '../notify/target-wants.js';
+import { pokemonTarget, type Want } from './notification-target.js';
+import {
+  answerScopeOf,
+  boxesOf,
+  heldRows,
+  planAnswer,
+  whichHash,
+  type AnswerScope,
+  type BoxAnswer,
+  type HeldRow,
+} from './species-answer.js';
+import type { WantBox } from './want-boxes.js';
+
+const CORSOLA: AnswerScope = { subject: { kind: 'pokemon', dex: 222 }, wide: true };
+const EVERY = ['raids', 'dynamax', 'gigantamax', 'spawns', 'research', 'shadow'] as const;
+const want = (form: string | undefined, scope: Want['scope'], costumed = false): Want => ({
+  target: pokemonTarget(222, form),
+  scope,
+  ...(costumed ? { costumed: true as const } : {}),
+});
+const row = (form: string | undefined, boxes: WantBox[], costumed = false): HeldRow => ({
+  ...(form === undefined ? {} : { form }),
+  boxes: new Set(boxes),
+  costumed,
+});
+const answer = (forms: (string | undefined)[], ticked: WantBox[], more: Partial<BoxAnswer> = {}) =>
+  ({
+    scope: CORSOLA,
+    forms,
+    ticked: new Set(ticked),
+    shown: EVERY,
+    costumed: false,
+    remove: false,
+    ...more,
+  }) satisfies BoxAnswer;
+const NO_MEGA = (): boolean => false;
+
+describe('heldRows', () => {
+  it('reads every row of a species, by form, with its boxes and whether it is costumed', () => {
+    const wants = [
+      want(undefined, 'raid'),
+      want('corsola_galarian', 'spawn', true),
+      { target: pokemonTarget(222, 'corsola_galarian', true), scope: 'raid', costumed: true },
+      { target: pokemonTarget(25), scope: 'both' },
+    ] satisfies Want[];
+    const targets: TargetWant[] = [
+      boxTarget('research-pokemon', 222, 'corsola_galarian', true),
+      boxTarget('research-pokemon', 25),
+    ];
+    expect(heldRows(CORSOLA, wants, targets)).toEqual([
+      row(undefined, ['raids']),
+      row('corsola_galarian', ['spawns', 'research', 'shadow'], true),
+    ]);
+  });
+
+  it('reads one subject alone where the scope is not wide (an Unown letter, a tier)', () => {
+    const unown = { subject: { kind: 'pokemon', dex: 201 }, wide: false } as const;
+    const wants: Want[] = [
+      { target: pokemonTarget(201), scope: 'spawn' },
+      { target: pokemonTarget(201, 'unown_a'), scope: 'spawn' },
+    ];
+    expect(heldRows(unown, wants, [])).toEqual([row(undefined, ['spawns'])]);
+    const letter = {
+      subject: { kind: 'pokemon', dex: 201, form: 'unown_a' },
+      wide: false,
+    } as const;
+    expect(heldRows(letter, wants, [])).toEqual([row(undefined, ['spawns'])]);
+    const t5 = { subject: { kind: 'tier', level: 'T5' }, wide: false } as const;
+    expect(
+      heldRows(
+        t5,
+        [{ target: { kind: 'tier', tier: { level: 'T5', shadow: true } }, scope: 'raid' }],
+        [],
+      ),
+    ).toEqual([row(undefined, ['shadow-raids'])]);
+    expect(heldRows(t5, [], [])).toEqual([]);
+  });
+});
+
+describe('planAnswer: one answer per species', () => {
+  const held = [row(undefined, ['raids']), row('corsola_galarian', ['spawns', 'research'])];
+
+  it('writes the boxes and costume to every ticked form and takes the others away', () => {
+    const plan = planAnswer(
+      CORSOLA,
+      held,
+      answer(['corsola_galarian'], ['raids', 'spawns'], { costumed: true }),
+      NO_MEGA,
+    );
+    expect(plan.after).toEqual([row('corsola_galarian', ['raids', 'spawns'], true)]);
+    expect(plan.rows.map((one) => [one.subject, one.base, one.shadow, one.costumed])).toEqual([
+      [{ kind: 'pokemon', dex: 222 }, null, false, false],
+      [{ kind: 'pokemon', dex: 222, form: 'corsola_galarian' }, 'both', false, true],
+    ]);
+    expect(plan.rows[1]?.targets).toEqual({
+      add: [],
+      remove: [boxTarget('research-pokemon', 222, 'corsola_galarian')],
+    });
+  });
+
+  it('keeps the boxes a dialog did not show as each row had them; a new row takes the species’', () => {
+    const shown = ['raids', 'research'] as const;
+    const plan = planAnswer(
+      CORSOLA,
+      held,
+      answer(['corsola_galarian', 'corsola'], ['raids'], { shown }),
+      NO_MEGA,
+    );
+    expect(plan.after).toEqual([
+      row('corsola_galarian', ['raids', 'spawns']),
+      row('corsola', ['raids', 'spawns']),
+    ]);
+  });
+
+  it('gives a mega a raid row and nothing else, and nothing without Raids', () => {
+    const megaX = (form: string): boolean => form === 'charizard_mega_x';
+    const charizard = { subject: { kind: 'pokemon', dex: 6 }, wide: true } as const;
+    const plan = planAnswer(
+      charizard,
+      [],
+      {
+        ...answer(['charizard', 'charizard_mega_x'], ['raids', 'shadow', 'research']),
+        scope: charizard,
+      },
+      megaX,
+    );
+    expect(plan.after).toEqual([
+      row('charizard', ['raids', 'research', 'shadow']),
+      row('charizard_mega_x', ['raids']),
+    ]);
+    const without = planAnswer(
+      charizard,
+      [],
+      { ...answer(['charizard_mega_x'], ['spawns']), scope: charizard },
+      megaX,
+    );
+    expect(without.after).toEqual([]);
+  });
+
+  it('takes the species off with nothing ticked, no form ticked, or Remove, whatever else is', () => {
+    for (const taken of [
+      answer([undefined], []),
+      answer([], ['raids']),
+      answer([undefined], ['raids', 'spawns'], { remove: true }),
+    ]) {
+      const plan = planAnswer(CORSOLA, held, taken, NO_MEGA);
+      expect(plan.after).toEqual([]);
+      expect(plan.rows.map((one) => one.base)).toEqual([null, null]);
+    }
+  });
+
+  it('takes every row off when no box shown is ticked, the boxes it did not show included (A2)', () => {
+    const plan = planAnswer(
+      CORSOLA,
+      [row(undefined, ['raids', 'research'])],
+      answer([undefined], [], { shown: ['raids', 'spawns'] }),
+      NO_MEGA,
+    );
+    expect(plan.after).toEqual([]);
+    expect(plan.rows).toEqual([
+      expect.objectContaining({
+        base: null,
+        shadow: false,
+        targets: { add: [], remove: [boxTarget('research-pokemon', 222)] },
+      }),
+    ]);
+  });
+
+  it('keeps each row’s own costume where the dialog did not show Costumes (A1)', () => {
+    const plan = planAnswer(
+      CORSOLA,
+      [row(undefined, ['raids'], true), row('corsola_galarian', ['spawns'])],
+      answer([undefined, 'corsola_galarian'], ['raids'], { costumed: undefined }),
+      NO_MEGA,
+    );
+    expect(plan.after).toEqual([
+      row(undefined, ['raids'], true),
+      row('corsola_galarian', ['raids']),
+    ]);
+    // A form without a row of its own: costumed only where every row held is.
+    const added = planAnswer(
+      CORSOLA,
+      [row(undefined, ['raids'], true)],
+      answer(['corsola_galarian'], ['raids'], { costumed: undefined }),
+      NO_MEGA,
+    );
+    expect(added.after).toEqual([row('corsola_galarian', ['raids'], true)]);
+  });
+
+  it('writes a mega plain, whatever the costume ticked (A-D3)', () => {
+    const megaX = (form: string): boolean => form === 'charizard_mega_x';
+    const charizard = { subject: { kind: 'pokemon', dex: 6 }, wide: true } as const;
+    const plan = planAnswer(
+      charizard,
+      [],
+      {
+        ...answer(['charizard', 'charizard_mega_x'], ['raids'], { costumed: true }),
+        scope: charizard,
+      },
+      megaX,
+    );
+    expect(plan.after).toEqual([
+      row('charizard', ['raids'], true),
+      row('charizard_mega_x', ['raids']),
+    ]);
+  });
+
+  it('writes the costume to the targets of every box that stands, as an upsert', () => {
+    const plan = planAnswer(
+      CORSOLA,
+      [row(undefined, ['research'])],
+      answer([undefined], ['research'], { costumed: true }),
+      NO_MEGA,
+    );
+    expect(plan.rows[0]?.targets.add).toEqual([
+      boxTarget('research-pokemon', 222, undefined, true),
+    ]);
+  });
+});
+
+describe('boxesOf, answerScopeOf, whichHash', () => {
+  it('unites the boxes of rows', () => {
+    expect(boxesOf([row(undefined, ['raids']), row('x', ['spawns', 'raids'])])).toEqual(
+      new Set(['raids', 'spawns']),
+    );
+  });
+
+  it('makes every species wide but one with more forms than the Which field holds', () => {
+    expect(answerScopeOf({ kind: 'pokemon', dex: 222 }, 2)).toEqual({
+      subject: { kind: 'pokemon', dex: 222 },
+      wide: true,
+    });
+    expect(answerScopeOf({ kind: 'pokemon', dex: 201 }, 29).wide).toBe(false);
+    expect(answerScopeOf({ kind: 'pokemon', dex: 201, form: 'unown_a' }, 29).wide).toBe(false);
+    expect(answerScopeOf({ kind: 'tier', level: 'T5' }, 0).wide).toBe(false);
+  });
+
+  it('hashes the keys of a Which field, short, and differently for other keys or order', () => {
+    const hash = whichHash(['corsola', 'corsola_galarian']);
+    expect(hash).toMatch(/^[0-9a-z]{1,7}$/);
+    expect(whichHash(['corsola', 'corsola_galarian'])).toBe(hash);
+    expect(whichHash(['corsola_galarian', 'corsola'])).not.toBe(hash);
+    expect(whichHash(['corsola'])).not.toBe(hash);
+  });
+});
diff --git a/src/domain/pogo/species-answer.ts b/src/domain/pogo/species-answer.ts
new file mode 100644
index 0000000000000000000000000000000000000000..734deb5b09b658a9936496a8d25d78576eb0c883
--- /dev/null
+++ b/src/domain/pogo/species-answer.ts
@@ -0,0 +1,281 @@
+import {
+  isCostumedTarget,
+  sameTargetWant,
+  withCostume,
+  type TargetWant,
+} from '../notify/target-wants.js';
+import {
+  sameNotificationTarget,
+  type NotificationScope,
+  type Want,
+} from './notification-target.js';
+import {
+  baseTarget,
+  heldBoxes,
+  shadowTarget,
+  subjectOfTarget,
+  targetWantsOf,
+  type BoxSubject,
+  type WantBox,
+} from './want-boxes.js';
+
+/*
+ * One answer per species (plan 8R-4; design `2026-10-22-costume-form-wants-design.md`, section
+ * 3): `/want`'s dialog writes the boxes and Costumed to every form ticked and takes the species'
+ * other rows away, in both tables. Pure: `WantBoxRepository` and its twin `MemoryWantBoxes` read
+ * the rows and carry out the plan.
+ */
+
+/**
+ * The most forms the Which field of the dialog holds (a string select of 25). A species with more
+ * (Unown, 29) has no Which field: its species row and each form are answers of their own.
+ */
+export const WHICH_CAP = 25;
+
+/**
+ * The rows one answer covers: `wide`, every row of the subject's Pokédex number (a species, its
+ * forms, its megas, in both tables); otherwise the subject's own rows alone (a tier, Unown's
+ * species row, one Unown letter).
+ */
+export interface AnswerScope {
+  subject: BoxSubject;
+  wide: boolean;
+}
+
+/**
+ * The scope of a subject: a species is wide unless it has more entries than the Which field
+ * holds (`entries`, its number in the catalogue); a form of such a species, and a tier, are not.
+ */
+export function answerScopeOf(subject: BoxSubject, entries: number): AnswerScope {
+  const wide = subject.kind === 'pokemon' && subject.form === undefined && entries <= WHICH_CAP;
+  return { subject, wide };
+}
+
+/**
+ * One row of a scope as the dialog reads it: its form (absent: the subject's own row, of a wide
+ * scope the species row, which is every form), its boxes, and whether it is costumed only (every
+ * row of that form in both tables is).
+ */
+export interface HeldRow {
+  form?: string;
+  boxes: Set<WantBox>;
+  costumed: boolean;
+}
+
+/** The boxes of rows together: what a box of the dialog is ticked by (any row has it). */
+export function boxesOf(rows: readonly HeldRow[]): Set<WantBox> {
+  return new Set(rows.flatMap((row) => [...row.boxes]));
+}
+
+/** The subject of a row of a scope. */
+function rowSubject(scope: AnswerScope, form: string | undefined): BoxSubject {
+  const { subject } = scope;
+  if (!scope.wide || subject.kind === 'tier') return subject;
+  return form === undefined
+    ? { kind: 'pokemon', dex: subject.dex }
+    : { kind: 'pokemon', dex: subject.dex, form };
+}
+
+/**
+ * The rows a member holds of a scope, from their wants of both tables (`readWants`' wants, the
+ * targets of `TargetWant`): of a wide scope every form that has a row, the species row first,
+ * the others in the order of their rows; of any other the subject's own, if it has a box.
+ */
+export function heldRows(
+  scope: AnswerScope,
+  wants: readonly Want[],
+  targets: readonly TargetWant[],
+): HeldRow[] {
+  const forms: (string | undefined)[] = [];
+  const { subject } = scope;
+  if (scope.wide && subject.kind === 'pokemon') {
+    const add = (form: string | undefined): void => {
+      if (!forms.includes(form)) forms.push(form);
+    };
+    for (const want of wants) {
+      if (want.target.kind === 'pokemon' && want.target.dex === subject.dex) add(want.target.form);
+    }
+    for (const target of targets) {
+      const of = subjectOfTarget(target);
+      if (of?.kind === 'pokemon' && of.dex === subject.dex) add(of.form);
+    }
+    // The species row first (`sort` would put `undefined` last whatever it is told).
+    if (forms.includes(undefined)) {
+      forms.splice(forms.indexOf(undefined), 1);
+      forms.unshift(undefined);
+    }
+  } else {
+    forms.push(undefined);
+  }
+  return forms.flatMap((form) => {
+    const of = rowSubject(scope, form);
+    const boxes = heldBoxes(of, wants, targets);
+    if (boxes.size === 0) return [];
+    const shadow = shadowTarget(of);
+    const own = wants.filter(
+      (want) =>
+        sameNotificationTarget(want.target, baseTarget(of)) ||
+        (shadow !== undefined && sameNotificationTarget(want.target, shadow)),
+    );
+    const tokens = targetWantsOf(of).map(([, target]) => target);
+    const ownTargets = targets.filter((target) =>
+      tokens.some((token) => sameTargetWant(token, target)),
+    );
+    const costumed =
+      own.every((want) => want.costumed === true) && ownTargets.every(isCostumedTarget);
+    return [{ ...(form === undefined ? {} : { form }), boxes, costumed }];
+  });
+}
+
+/** What a Submit of the dialog says (`planAnswer`). */
+export interface BoxAnswer {
+  scope: AnswerScope;
+  /**
+   * The rows that stand after it: `undefined` the subject's own (of a wide scope the species row:
+   * every form ticked, forms added later included), a key each form ticked. None takes the scope
+   * off.
+   */
+  forms: readonly (string | undefined)[];
+  /** The boxes ticked, of those `shown`. */
+  ticked: ReadonlySet<WantBox>;
+  /** The boxes the dialog showed: the others stay as each row had them. */
+  shown: readonly WantBox[];
+  /**
+   * Costumed ticked; undefined where the dialog did not show Costumes: each row keeps its own (a
+   * form without a row: costumed where every row held is). A mega is always plain (A-D3).
+   */
+  costumed: boolean | undefined;
+  /** Remove was ticked: every row of the scope goes, whatever else is ticked. */
+  remove: boolean;
+}
+
+/** The answer that takes every row of a scope away (Remove, `/unwant`, a list's Remove). */
+export function removalAnswer(scope: AnswerScope): BoxAnswer {
+  return { scope, forms: [], ticked: new Set(), shown: [], costumed: false, remove: true };
+}
+
+/** What a row of a subject becomes. */
+export interface RowPlan {
+  subject: BoxSubject;
+  /** The scope of its own row; null for none (the row goes). */
+  base: NotificationScope | null;
+  /** Whether its shadow row stands. */
+  shadow: boolean;
+  /** The `TargetWant` rows to write (every box that stands, with its costume) and to take away. */
+  targets: { add: TargetWant[]; remove: TargetWant[] };
+  costumed: boolean;
+}
+
+/** What a Submit makes of the rows of its scope. */
+export interface AnswerPlan {
+  /** The rows after it. */
+  after: HeldRow[];
+  /** Every row held before or standing after, in that order, as it is to be written. */
+  rows: RowPlan[];
+}
+
+/** The plan of one row from what it held and what it holds after. */
+function rowPlan(
+  scope: AnswerScope,
+  form: string | undefined,
+  before: HeldRow | undefined,
+  after: HeldRow | undefined,
+): RowPlan {
+  const subject = rowSubject(scope, form);
+  const boxes = after?.boxes ?? new Set<WantBox>();
+  const costumed = after?.costumed ?? false;
+  const raids = boxes.has('raids');
+  const spawns = boxes.has('spawns');
+  const base: NotificationScope | null =
+    raids && spawns ? 'both' : raids ? 'raid' : spawns ? 'spawn' : null;
+  const add: TargetWant[] = [];
+  const remove: TargetWant[] = [];
+  for (const [box, want] of targetWantsOf(subject)) {
+    if (boxes.has(box)) add.push(withCostume(want, costumed));
+    else if (before?.boxes.has(box) === true) remove.push(want);
+  }
+  return {
+    subject,
+    base,
+    shadow: boxes.has(subject.kind === 'tier' ? 'shadow-raids' : 'shadow'),
+    targets: { add, remove },
+    costumed,
+  };
+}
+
+/**
+ * Whether rows are costumed together (design 3, review R6): every row but the megas is, and there
+ * is one. A mega row is always plain (A-D3), so it counts for neither.
+ */
+export function allCostumed(rows: readonly HeldRow[], isMega: (form: string) => boolean): boolean {
+  const own = rows.filter((row) => row.form === undefined || !isMega(row.form));
+  return own.length > 0 && own.every((row) => row.costumed);
+}
+
+/**
+ * What a Submit makes of a scope's rows (design 3, "One answer per species"): Remove, no form, or
+ * no box shown ticked takes every row away, the boxes it did not show included (A2, Q1);
+ * otherwise every form ticked gets the boxes ticked of those shown and keeps the others as its
+ * row had them (a form without a row: as the scope's rows had them together), all with the
+ * answer's costume (Costumes not shown: each row its own, A1); a mega (`isMega`, by its key)
+ * Raids only and plain, and nothing without Raids (review R4c); every other row goes.
+ */
+export function planAnswer(
+  scope: AnswerScope,
+  held: readonly HeldRow[],
+  answer: BoxAnswer,
+  isMega: (form: string) => boolean,
+): AnswerPlan {
+  const after: HeldRow[] = [];
+  const anyTicked = answer.shown.some((box) => answer.ticked.has(box));
+  if (!answer.remove && anyTicked) {
+    const together = boxesOf(held);
+    const costumedTogether = allCostumed(held, isMega);
+    const forms = [...new Set(answer.forms)];
+    for (const form of forms) {
+      const own = held.find((row) => row.form === form);
+      const had = own?.boxes ?? together;
+      const boxes = new Set<WantBox>([
+        ...[...had].filter((box) => !answer.shown.includes(box)),
+        ...answer.shown.filter((box) => answer.ticked.has(box)),
+      ]);
+      const mega = form !== undefined && isMega(form);
+      if (mega) {
+        for (const box of [...boxes]) if (box !== 'raids') boxes.delete(box);
+      }
+      const costumed = mega ? false : (answer.costumed ?? own?.costumed ?? costumedTogether);
+      if (boxes.size > 0) {
+        after.push({ ...(form === undefined ? {} : { form }), boxes, costumed });
+      }
+    }
+  }
+  const forms = [...held.map((row) => row.form)];
+  for (const row of after) if (!forms.includes(row.form)) forms.push(row.form);
+  return {
+    after,
+    rows: forms.map((form) =>
+      rowPlan(
+        scope,
+        form,
+        held.find((row) => row.form === form),
+        after.find((row) => row.form === form),
+      ),
+    ),
+  };
+}
+
+const FNV_OFFSET = 0x811c9dc5;
+const FNV_PRIME = 0x01000193;
+
+/**
+ * A short hash of the keys a Which field showed, in its order (review R5): a Submit whose hash is
+ * not that of the keys the field would show now is out of date. FNV-1a of the keys joined by
+ * `,`, 32 bits in base 36.
+ */
+export function whichHash(keys: readonly string[]): string {
+  let hash = FNV_OFFSET;
+  for (const byte of new TextEncoder().encode(keys.join(','))) {
+    hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
+  }
+  return hash.toString(36);
+}
diff --git a/src/domain/pogo/want-boxes.test.ts b/src/domain/pogo/want-boxes.test.ts
index 2289b43bfcd51bb467ab74f4158830bd963592e5..702694a028354c41c749440269f3594720e4569f 100644
--- a/src/domain/pogo/want-boxes.test.ts
+++ b/src/domain/pogo/want-boxes.test.ts
@@ -4,7 +4,6 @@ import { pokemonTarget, type Want } from './notification-target.js';
 import { catalogueFixture } from '../../../test/support/game-data.js';
 import {
   heldBoxes,
-  planBoxes,
   pokemonBoxes,
   subjectOf,
   subjectOfTarget,
@@ -38,37 +37,6 @@ describe('the boxes of /want’s dialog', () => {
     expect([...heldBoxes(T5, tiers, [])]).toEqual(['shadow-raids']);
   });
 
-  it('plans the rows a Submit makes, leaving a box the dialog did not show as it was', () => {
-    const plan = planBoxes(
-      DRATINI,
-      new Set(['raids', 'spawns', 'dynamax']),
-      new Set(['raids', 'research']),
-      ['raids', 'dynamax', 'research', 'shadow'],
-    );
-    expect(plan).toEqual({
-      base: 'both',
-      shadow: false,
-      targets: {
-        add: [boxTarget('research-pokemon', 147)],
-        remove: [boxTarget('dynamax', 147)],
-      },
-      after: new Set(['spawns', 'raids', 'research']),
-    });
-    // Nothing ticked: everything shown goes.
-    expect(
-      planBoxes(DRATINI, new Set(['raids', 'shadow']), new Set(), ['raids', 'shadow']),
-    ).toMatchObject({
-      base: null,
-      shadow: false,
-    });
-    expect(
-      planBoxes(T5, new Set(), new Set(['shadow-raids']), ['raids', 'shadow-raids']),
-    ).toMatchObject({
-      base: null,
-      shadow: true,
-    });
-  });
-
   it('shows only what can happen', () => {
     const facts = (overrides: Partial<BoxFacts>): BoxFacts => ({
       entries: [{ kind: 'species', shadow: false, key: 'x' }],
diff --git a/src/domain/pogo/want-boxes.ts b/src/domain/pogo/want-boxes.ts
index 33ca889d137d45ed6f8807a0224da0feb8194a3c..d539319ad5c406f1592310e4378789934ef0c808 100644
--- a/src/domain/pogo/want-boxes.ts
+++ b/src/domain/pogo/want-boxes.ts
@@ -14,7 +14,6 @@ import {
   isNotificationTier,
   pokemonTarget,
   sameNotificationTarget,
-  type NotificationScope,
   type NotificationTarget,
   type Want,
 } from './notification-target.js';
@@ -149,46 +148,6 @@ export function heldBoxes(
   return held;
 }
 
-/** What the rows of a subject become (`planBoxes`). */
-export interface BoxPlan {
-  /** The scope of the subject's own row; null for none (the row goes). */
-  base: NotificationScope | null;
-  /** Whether its shadow row stands. */
-  shadow: boolean;
-  /** The `TargetWant` rows to add and to remove. */
-  targets: { add: TargetWant[]; remove: TargetWant[] };
-  /** The boxes ticked after the change. */
-  after: Set<WantBox>;
-}
-
-/**
- * What a dialog's Submit makes of a subject's rows: the boxes it showed (`shown`) as ticked, and
- * every other box as it was (a box the dialog did not show, such as a spawn want of a Pokémon
- * that is no longer met in the wild, is left alone).
- */
-export function planBoxes(
-  subject: BoxSubject,
-  held: ReadonlySet<WantBox>,
-  ticked: ReadonlySet<WantBox>,
-  shown: readonly WantBox[],
-): BoxPlan {
-  const after = new Set<WantBox>(
-    [...held].filter((box) => !shown.includes(box)).concat(shown.filter((box) => ticked.has(box))),
-  );
-  const raids = after.has('raids');
-  const spawns = after.has('spawns');
-  const base: NotificationScope | null =
-    raids && spawns ? 'both' : raids ? 'raid' : spawns ? 'spawn' : null;
-  const shadow = after.has(subject.kind === 'tier' ? 'shadow-raids' : 'shadow');
-  const add: TargetWant[] = [];
-  const remove: TargetWant[] = [];
-  for (const [box, want] of targetWantsOf(subject)) {
-    if (after.has(box) && !held.has(box)) add.push(want);
-    if (!after.has(box) && held.has(box)) remove.push(want);
-  }
-  return { base, shadow, targets: { add, remove }, after };
-}
-
 /** What decides which boxes a Pokémon's dialog shows. */
 export interface BoxFacts {
   /** The subject's entries: every entry of a species, the one of a form. */
diff --git a/test/support/want-box-cases.ts b/test/support/want-box-cases.ts
index a228a9e8734191ec15c381dd9f2aa8311bd8bbb0..f22b486484e13dba6f1e196e31dacb8565413c8e 100644
--- a/test/support/want-box-cases.ts
+++ b/test/support/want-box-cases.ts
@@ -4,14 +4,52 @@ import type { TargetWantStorage } from '../../src/db/repositories/target-want-re
 import type { WantStorage } from '../../src/db/repositories/pokemon-notification-repository.js';
 import { boxTarget } from '../../src/domain/notify/target-wants.js';
 import { pokemonTarget } from '../../src/domain/pogo/notification-target.js';
-import type { BoxSubject } from '../../src/domain/pogo/want-boxes.js';
+import {
+  boxesOf,
+  type AnswerScope,
+  type BoxAnswer,
+  type HeldRow,
+} from '../../src/domain/pogo/species-answer.js';
+import type { WantBox } from '../../src/domain/pogo/want-boxes.js';
 import { ASH, GARY, WANT_SERVER, WANTED_AT } from './target-want-cases.js';
 
-const DRATINI: BoxSubject = { kind: 'pokemon', dex: 147 };
-const ALOLAN_VULPIX: BoxSubject = { kind: 'pokemon', dex: 37, form: 'vulpix_alola' };
-const T5: BoxSubject = { kind: 'tier', level: 'T5' };
+const DRATINI: AnswerScope = { subject: { kind: 'pokemon', dex: 147 }, wide: true };
+const CORSOLA: AnswerScope = { subject: { kind: 'pokemon', dex: 222 }, wide: true };
+const CHARIZARD: AnswerScope = { subject: { kind: 'pokemon', dex: 6 }, wide: true };
+const PIKACHU: AnswerScope = { subject: { kind: 'pokemon', dex: 25 }, wide: true };
+const UNOWN: AnswerScope = { subject: { kind: 'pokemon', dex: 201 }, wide: false };
+const UNOWN_A: AnswerScope = {
+  subject: { kind: 'pokemon', dex: 201, form: 'unown_a' },
+  wide: false,
+};
+const T5: AnswerScope = { subject: { kind: 'tier', level: 'T5' }, wide: false };
 const EVERY = ['raids', 'dynamax', 'gigantamax', 'spawns', 'research', 'shadow'] as const;
 
+/** An answer of the dialog: the rows that stand (the species row unless said), the boxes ticked. */
+export function boxAnswer(
+  scope: AnswerScope,
+  ticked: readonly WantBox[],
+  more: Partial<BoxAnswer> = {},
+): BoxAnswer {
+  return {
+    scope,
+    forms: [undefined],
+    ticked: new Set(ticked),
+    shown: scope.subject.kind === 'tier' ? ['raids', 'shadow-raids'] : EVERY,
+    costumed: false,
+    remove: false,
+    ...more,
+  };
+}
+
+/** Rows as a test writes them: a form (or none) with its boxes. */
+const rows = (...made: [string | undefined, WantBox[], boolean?][]): HeldRow[] =>
+  made.map(([form, boxes, costumed = false]) => ({
+    ...(form === undefined ? {} : { form }),
+    boxes: new Set(boxes),
+    costumed,
+  }));
+
 /** A store of boxes over these tables, fresh and empty, as the cases need it. */
 export interface BoxTables {
   boxes: WantBoxStorage;
@@ -20,8 +58,8 @@ export interface BoxTables {
 }
 
 /**
- * What the boxes of `/want`'s dialog do to the rows of both tables, run against the repository
- * and its twin in memory alike.
+ * What the boxes of `/want`'s dialog do to the rows of both tables (plan 8R-1; one answer per
+ * species since plan 8R-4), run against the repository and its twin in memory alike.
  */
 export function wantBoxCases(made: () => Promise<BoxTables>): void {
   it('writes the ticked boxes into both tables and reads them back', async () => {
@@ -29,14 +67,15 @@ export function wantBoxCases(made: () => Promise<BoxTables>): void {
     const change = await boxes.set(
       ASH,
       WANT_SERVER,
-      DRATINI,
-      new Set(['raids', 'research', 'shadow']),
-      EVERY,
+      boxAnswer(DRATINI, ['raids', 'research', 'shadow']),
       WANTED_AT,
     );
-    expect(change).toEqual({ before: new Set(), after: new Set(['raids', 'research', 'shadow']) });
+    expect(change).toEqual({
+      before: [],
+      after: rows([undefined, ['raids', 'research', 'shadow']]),
+    });
     expect(await boxes.held(ASH, WANT_SERVER, DRATINI)).toEqual(
-      new Set(['raids', 'research', 'shadow']),
+      rows([undefined, ['raids', 'research', 'shadow']]),
     );
     expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
       { target: pokemonTarget(147), scope: 'raid' },
@@ -45,69 +84,250 @@ export function wantBoxCases(made: () => Promise<BoxTables>): void {
     expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([
       boxTarget('research-pokemon', 147),
     ]);
-    expect(await boxes.held(GARY, WANT_SERVER, DRATINI)).toEqual(new Set());
+    expect(await boxes.held(GARY, WANT_SERVER, DRATINI)).toEqual([]);
   });
 
   it('changes what a later Submit changes, and takes everything away with nothing ticked', async () => {
     const { boxes, wants, targets } = await made();
-    await boxes.set(ASH, WANT_SERVER, DRATINI, new Set(['raids', 'dynamax']), EVERY, WANTED_AT);
-    await boxes.set(ASH, WANT_SERVER, DRATINI, new Set(['spawns', 'raids']), EVERY, WANTED_AT);
+    await boxes.set(ASH, WANT_SERVER, boxAnswer(DRATINI, ['raids', 'dynamax']), WANTED_AT);
+    await boxes.set(ASH, WANT_SERVER, boxAnswer(DRATINI, ['spawns', 'raids']), WANTED_AT);
     expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
       { target: pokemonTarget(147), scope: 'both' },
     ]);
     expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([]);
-    const gone = await boxes.set(ASH, WANT_SERVER, DRATINI, new Set(), EVERY, WANTED_AT);
-    expect(gone).toEqual({ before: new Set(['raids', 'spawns']), after: new Set() });
+    const gone = await boxes.set(ASH, WANT_SERVER, boxAnswer(DRATINI, []), WANTED_AT);
+    expect(boxesOf(gone.before)).toEqual(new Set(['raids', 'spawns']));
+    expect(gone.after).toEqual([]);
     expect(await wants.count(ASH, WANT_SERVER)).toBe(0);
   });
 
-  it('leaves the boxes it did not show as they are, and a form apart from its species', async () => {
+  it('leaves the boxes it did not show as the row had them', async () => {
     const { boxes, wants } = await made();
     await wants.set(ASH, WANT_SERVER, pokemonTarget(147), 'spawn');
-    await boxes.set(ASH, WANT_SERVER, DRATINI, new Set(['raids']), ['raids', 'shadow'], WANTED_AT);
+    await boxes.set(
+      ASH,
+      WANT_SERVER,
+      boxAnswer(DRATINI, ['raids'], { shown: ['raids', 'shadow'] }),
+      WANTED_AT,
+    );
     expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
       { target: pokemonTarget(147), scope: 'both' },
     ]);
-    await boxes.set(ASH, WANT_SERVER, ALOLAN_VULPIX, new Set(['gigantamax']), EVERY, WANTED_AT);
-    expect(await boxes.held(ASH, WANT_SERVER, ALOLAN_VULPIX)).toEqual(new Set(['gigantamax']));
-    expect(await boxes.held(ASH, WANT_SERVER, { kind: 'pokemon', dex: 37 })).toEqual(new Set());
   });
 
-  it('writes costumed into both tables, and plain again on a later Submit', async () => {
+  it('answers once for the whole species: the forms ticked get the boxes, the others go', async () => {
     const { boxes, wants, targets } = await made();
-    const ticked = new Set(['raids', 'research'] as const);
-    await boxes.set(ASH, WANT_SERVER, DRATINI, ticked, EVERY, WANTED_AT, true);
+    await wants.set(ASH, WANT_SERVER, pokemonTarget(222), 'raid');
+    await wants.set(ASH, WANT_SERVER, pokemonTarget(222, 'corsola_galarian'), 'spawn');
+    expect(await boxes.held(ASH, WANT_SERVER, CORSOLA)).toEqual(
+      rows([undefined, ['raids']], ['corsola_galarian', ['spawns']]),
+    );
+    await boxes.set(
+      ASH,
+      WANT_SERVER,
+      boxAnswer(CORSOLA, ['raids', 'research'], { forms: ['corsola_galarian'] }),
+      WANTED_AT,
+    );
     expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
-      { target: pokemonTarget(147), scope: 'raid', costumed: true },
+      { target: pokemonTarget(222, 'corsola_galarian'), scope: 'raid' },
     ]);
     expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([
-      boxTarget('research-pokemon', 147, undefined, true),
+      boxTarget('research-pokemon', 222, 'corsola_galarian'),
     ]);
-    expect((await wants.wanting(WANT_SERVER, [147]))[0]?.wants).toEqual([
-      { target: pokemonTarget(147), scope: 'raid', costumed: true },
+    // Every form again: one species row, and the form's rows go.
+    await boxes.set(ASH, WANT_SERVER, boxAnswer(CORSOLA, ['spawns']), WANTED_AT);
+    expect(await boxes.held(ASH, WANT_SERVER, CORSOLA)).toEqual(rows([undefined, ['spawns']]));
+    expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([]);
+  });
+
+  it('gives a mega a raid row and nothing else, and nothing without Raids', async () => {
+    const { boxes, wants, targets } = await made();
+    await boxes.set(
+      ASH,
+      WANT_SERVER,
+      boxAnswer(CHARIZARD, ['raids', 'research', 'shadow'], {
+        forms: ['charizard', 'charizard_mega_y'],
+      }),
+      WANTED_AT,
+    );
+    expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
+      { target: pokemonTarget(6, 'charizard'), scope: 'raid' },
+      { target: pokemonTarget(6, 'charizard', true), scope: 'raid' },
+      { target: pokemonTarget(6, 'charizard_mega_y'), scope: 'raid' },
+    ]);
+    expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([
+      boxTarget('research-pokemon', 6, 'charizard'),
     ]);
-    await boxes.set(ASH, WANT_SERVER, DRATINI, ticked, EVERY, WANTED_AT);
+    const without = await boxes.set(
+      ASH,
+      WANT_SERVER,
+      boxAnswer(CHARIZARD, ['spawns'], { forms: ['charizard_mega_y'] }),
+      WANTED_AT,
+    );
+    expect(without.after).toEqual([]);
+    expect(await wants.count(ASH, WANT_SERVER)).toBe(0);
+  });
+
+  it('keeps Unown’s letters apart from its species row, each an answer of its own', async () => {
+    const { boxes, wants } = await made();
+    await wants.set(ASH, WANT_SERVER, pokemonTarget(201, 'unown_a'), 'spawn');
+    await boxes.set(ASH, WANT_SERVER, boxAnswer(UNOWN, ['raids']), WANTED_AT);
+    expect(await boxes.held(ASH, WANT_SERVER, UNOWN)).toEqual(rows([undefined, ['raids']]));
+    expect(await boxes.held(ASH, WANT_SERVER, UNOWN_A)).toEqual(rows([undefined, ['spawns']]));
+    await boxes.set(ASH, WANT_SERVER, boxAnswer(UNOWN_A, [], { remove: true }), WANTED_AT);
     expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
-      { target: pokemonTarget(147), scope: 'raid' },
+      { target: pokemonTarget(201), scope: 'raid' },
+    ]);
+  });
+
+  it('writes costumed to every row in both tables, and plain again on a later Submit', async () => {
+    const { boxes, wants, targets } = await made();
+    await boxes.set(
+      ASH,
+      WANT_SERVER,
+      boxAnswer(DRATINI, ['raids', 'research'], { costumed: true }),
+      WANTED_AT,
+    );
+    expect(await boxes.held(ASH, WANT_SERVER, DRATINI)).toEqual(
+      rows([undefined, ['raids', 'research'], true]),
+    );
+    expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
+      { target: pokemonTarget(147), scope: 'raid', costumed: true },
     ]);
     expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([
-      boxTarget('research-pokemon', 147),
+      boxTarget('research-pokemon', 147, undefined, true),
     ]);
+    await boxes.set(ASH, WANT_SERVER, boxAnswer(DRATINI, ['raids', 'research']), WANTED_AT);
+    expect(await boxes.held(ASH, WANT_SERVER, DRATINI)).toEqual(
+      rows([undefined, ['raids', 'research']]),
+    );
   });
 
-  it('writes a tier’s raids and its shadow raids', async () => {
+  it('removes every row of the species with Remove, whatever is ticked, and no other species’', async () => {
+    const { boxes, targets } = await made();
+    // Celebi (251) beside Pikachu (25): the species' read takes `research:pokemon:25` and
+    // `research:pokemon:25:<form>`, never Celebi's tokens that begin with 25.
+    await targets.change(
+      ASH,
+      WANT_SERVER,
+      {
+        add: [
+          boxTarget('research-pokemon', 251),
+          boxTarget('dynamax', 251),
+          boxTarget('research-pokemon', 25),
+          boxTarget('gigantamax', 25, 'pikachu'),
+        ],
+        remove: [],
+      },
+      WANTED_AT,
+    );
+    expect(await boxes.held(ASH, WANT_SERVER, PIKACHU)).toEqual(
+      rows([undefined, ['research']], ['pikachu', ['gigantamax']]),
+    );
+    await boxes.set(
+      ASH,
+      WANT_SERVER,
+      boxAnswer(PIKACHU, ['raids', 'spawns'], { remove: true }),
+      WANTED_AT,
+    );
+    expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([
+      boxTarget('research-pokemon', 251),
+      boxTarget('dynamax', 251),
+    ]);
+  });
+
+  it('keeps the boxes it did not show per row across two forms; a new form takes the rows’ together', async () => {
+    const { boxes, wants, targets } = await made();
+    await wants.set(ASH, WANT_SERVER, pokemonTarget(222), 'spawn');
+    await targets.change(
+      ASH,
+      WANT_SERVER,
+      { add: [boxTarget('research-pokemon', 222, 'corsola_galarian')], remove: [] },
+      WANTED_AT,
+    );
+    await wants.set(ASH, WANT_SERVER, pokemonTarget(222, 'corsola_galarian'), 'raid');
+    // Shows Raids and Shadow only: Spawns and Research stay as each row had them.
+    await boxes.set(
+      ASH,
+      WANT_SERVER,
+      boxAnswer(CORSOLA, ['shadow'], {
+        forms: [undefined, 'corsola_galarian'],
+        shown: ['raids', 'shadow'],
+      }),
+      WANTED_AT,
+    );
+    expect(await boxes.held(ASH, WANT_SERVER, CORSOLA)).toEqual(
+      rows([undefined, ['spawns', 'shadow']], ['corsola_galarian', ['research', 'shadow']]),
+    );
+    // A form without a row takes the hidden boxes of the rows together.
+    await boxes.set(
+      ASH,
+      WANT_SERVER,
+      boxAnswer(CORSOLA, ['raids'], { forms: ['corsola'], shown: ['raids', 'shadow'] }),
+      WANTED_AT,
+    );
+    expect(await boxes.held(ASH, WANT_SERVER, CORSOLA)).toEqual(
+      rows(['corsola', ['raids', 'spawns', 'research']]),
+    );
+  });
+
+  it('takes every row off when no box shown is ticked, a box it did not show included (A2)', async () => {
+    const { boxes, wants, targets } = await made();
+    await wants.set(ASH, WANT_SERVER, pokemonTarget(147), 'raid');
+    await targets.change(
+      ASH,
+      WANT_SERVER,
+      { add: [boxTarget('research-pokemon', 147)], remove: [] },
+      WANTED_AT,
+    );
+    const gone = await boxes.set(
+      ASH,
+      WANT_SERVER,
+      boxAnswer(DRATINI, [], { shown: ['raids', 'shadow'] }),
+      WANTED_AT,
+    );
+    expect(gone.after).toEqual([]);
+    expect(await wants.count(ASH, WANT_SERVER)).toBe(0);
+    expect(await targets.count(ASH, WANT_SERVER)).toBe(0);
+  });
+
+  it('writes a mega plain beside a costumed form (A-D3)', async () => {
     const { boxes, wants } = await made();
     await boxes.set(
       ASH,
       WANT_SERVER,
-      T5,
-      new Set(['shadow-raids']),
-      ['raids', 'shadow-raids'],
+      boxAnswer(CHARIZARD, ['raids'], {
+        forms: ['charizard', 'charizard_mega_x'],
+        costumed: true,
+      }),
       WANTED_AT,
     );
+    expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
+      { target: pokemonTarget(6, 'charizard'), scope: 'raid', costumed: true },
+      { target: pokemonTarget(6, 'charizard_mega_x'), scope: 'raid' },
+    ]);
+  });
+
+  it('keeps each row’s costume where the dialog did not show Costumes (A1)', async () => {
+    const { boxes } = await made();
+    await boxes.set(ASH, WANT_SERVER, boxAnswer(PIKACHU, ['raids'], { costumed: true }), WANTED_AT);
+    await boxes.set(
+      ASH,
+      WANT_SERVER,
+      boxAnswer(PIKACHU, ['raids', 'spawns'], { costumed: undefined }),
+      WANTED_AT,
+    );
+    expect(await boxes.held(ASH, WANT_SERVER, PIKACHU)).toEqual(
+      rows([undefined, ['raids', 'spawns'], true]),
+    );
+  });
+
+  it('writes a tier’s raids and its shadow raids', async () => {
+    const { boxes, wants } = await made();
+    await boxes.set(ASH, WANT_SERVER, boxAnswer(T5, ['shadow-raids']), WANTED_AT);
     expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
       { target: { kind: 'tier', tier: { level: 'T5', shadow: true } }, scope: 'raid' },
     ]);
-    expect(await boxes.held(ASH, WANT_SERVER, T5)).toEqual(new Set(['shadow-raids']));
+    expect(await boxes.held(ASH, WANT_SERVER, T5)).toEqual(rows([undefined, ['shadow-raids']]));
   });
 }
diff --git a/test/support/want-boxes.ts b/test/support/want-boxes.ts
index 160f40c4761984cf3972c19d7feb50766ed9572c..121273b9d742192e97f0a4fe55a44751bc91fb4a 100644
--- a/test/support/want-boxes.ts
+++ b/test/support/want-boxes.ts
@@ -1,64 +1,58 @@
+import type { BoxChange, WantBoxStorage } from '../../src/db/repositories/want-box-repository.js';
+import type { TargetWant } from '../../src/domain/notify/target-wants.js';
 import {
-  costumedTargets,
-  type BoxChange,
-  type WantBoxStorage,
-} from '../../src/db/repositories/want-box-repository.js';
-import {
-  baseTarget,
-  heldBoxes,
-  planBoxes,
-  shadowTarget,
-  targetWantsOf,
-  type BoxSubject,
-  type WantBox,
-} from '../../src/domain/pogo/want-boxes.js';
+  heldRows,
+  planAnswer,
+  type AnswerScope,
+  type BoxAnswer,
+  type HeldRow,
+} from '../../src/domain/pogo/species-answer.js';
+import { baseTarget, shadowTarget } from '../../src/domain/pogo/want-boxes.js';
+import type { FormReader } from '../../src/domain/pogo/wants.js';
 import type { TargetWantStorage } from '../../src/db/repositories/target-want-repository.js';
 import type { WantStorage } from '../../src/db/repositories/pokemon-notification-repository.js';
 import { MemoryTargetWants } from './target-wants.js';
-import { MemoryWants } from './wants.js';
+import { fixtureForms, MemoryWants } from './wants.js';
 
 /**
  * The boxes of `/want`'s dialog in memory: the twin of `WantBoxRepository` over the wants and
  * the target wants of a test (`wants`, `targets`, which a test reads), running `wantBoxCases`
- * as it does. It writes one table after the other (nothing here can fail half-way but a
- * `failing` of either).
+ * as it does: one answer per species (plan 8R-4), the megas by `forms` (the fixture's by
+ * default). It writes one table after the other (nothing here can fail half-way but a `failing`
+ * of either).
  */
 export class MemoryWantBoxes implements WantBoxStorage {
   constructor(
     readonly wants: WantStorage = new MemoryWants(),
     readonly targets: TargetWantStorage = new MemoryTargetWants(),
+    private readonly forms: FormReader = fixtureForms(),
   ) {}
 
-  async held(memberId: string, guildId: string, subject: BoxSubject): Promise<Set<WantBox>> {
+  async held(memberId: string, guildId: string, scope: AnswerScope): Promise<HeldRow[]> {
     const { wants } = await this.wants.list(memberId, guildId);
-    const targets = await this.targets.of(
-      memberId,
-      guildId,
-      targetWantsOf(subject).map(([, want]) => want),
-    );
-    return heldBoxes(subject, wants, targets);
+    const { wants: targets } = await this.targets.list(memberId, guildId);
+    return heldRows(scope, wants, targets);
   }
 
-  async set(
-    memberId: string,
-    guildId: string,
-    subject: BoxSubject,
-    ticked: ReadonlySet<WantBox>,
-    shown: readonly WantBox[],
-    at: number,
-    costumed = false,
-  ): Promise<BoxChange> {
-    const held = await this.held(memberId, guildId, subject);
-    const plan = planBoxes(subject, held, ticked, shown);
-    const base = baseTarget(subject);
-    if (plan.base === null) await this.wants.remove(memberId, guildId, base);
-    else await this.wants.set(memberId, guildId, base, plan.base, costumed);
-    const shadow = shadowTarget(subject);
-    if (shadow) {
-      if (plan.shadow) await this.wants.set(memberId, guildId, shadow, 'raid', costumed);
-      else await this.wants.remove(memberId, guildId, shadow);
+  async set(memberId: string, guildId: string, answer: BoxAnswer, at: number): Promise<BoxChange> {
+    const { scope } = answer;
+    const held = await this.held(memberId, guildId, scope);
+    const dex = scope.subject.kind === 'pokemon' ? scope.subject.dex : 0;
+    const plan = planAnswer(scope, held, answer, (form) => this.forms(dex, form).mega);
+    const targets: { add: TargetWant[]; remove: TargetWant[] } = { add: [], remove: [] };
+    for (const row of plan.rows) {
+      const base = baseTarget(row.subject);
+      if (row.base === null) await this.wants.remove(memberId, guildId, base);
+      else await this.wants.set(memberId, guildId, base, row.base, row.costumed);
+      const shadow = shadowTarget(row.subject);
+      if (shadow) {
+        if (row.shadow) await this.wants.set(memberId, guildId, shadow, 'raid', row.costumed);
+        else await this.wants.remove(memberId, guildId, shadow);
+      }
+      targets.add.push(...row.targets.add);
+      targets.remove.push(...row.targets.remove);
     }
-    await this.targets.change(memberId, guildId, costumedTargets(subject, plan, costumed), at);
+    await this.targets.change(memberId, guildId, targets, at);
     return { before: held, after: plan.after };
   }
 }
````

### Task 4: 8R-4 task 4: The Pokémon dialog: Which, Costumes and Remove

Prototype commit: `5aabcbd8feb38ed2a69b81338ddffdba3f68d308`

/want's dialog asks once per species: Tell me about (Research no longer
for a legendary unless today's tasks reward it or it is held), Which
<species> (a checkbox group to ten forms, a dropdown to 25, megas among
them for raids only; none for Unown, whose letters keep dialogs of their
own), Costumes as one Checkbox (also wherever a costumed row is held), and
Remove where a want is held: five components at most, every other
sentence in the one text. A first want opens with no box ticked and the
boxes required, every form ticked (a form picked alone); with wants held
nothing is required and nothing ticked takes them off. In a raid's or a
max battle's post the Pokémon may be left out (the post's boss, an egg's
tier) and only the post's box is ticked; elsewhere, and for a boss Pine
does not know, a Pokémon must be named; refusals come from a guard and
do not count. Every opening has an id of its own (openToken). The answer
names the want as /wants will and warns in small print where Costumed
meets a box no costume has appeared in, or a mega without Raids. /unwant
of a form a species row covers removes nothing and says so. The fakes
submit a Checkbox and refuse a required group left empty.

**Files:**

```
 docs/architecture/discord-framework.md     |   2 +-
 docs/architecture/notifications-and-dms.md |   2 +-
 docs/architecture/testing.md               |   4 +-
 src/commands/notifications/want-boxes.ts   | 133 +++++++++++++-
 src/commands/notifications/want-dialog.ts  | 256 +++++++++++++++++++++++++-
 src/commands/notifications/wants.test.ts   | 689 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++----
 src/commands/notifications/wants.ts        | 529 ++++++++++++++++++++++++++++++++++++++---------------
 src/domain/pogo/species-answer.ts          |   4 +
 src/domain/pogo/want-boxes.ts              |  15 +-
 test/support/dialogs.ts                    |  72 ++++++++
 test/support/fake-interactions.test.ts     |  54 ++++++
 test/support/fake-interactions.ts          |  46 ++++-
 12 files changed, 1603 insertions(+), 203 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/notifications/wants.test.ts test/support/fake-interactions.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 5aabcbd8feb38ed2a69b81338ddffdba3f68d308 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4 task 4: The Pokémon dialog: Which, Costumes and Remove`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index 713a67e4a8e64749847975da161a841b18c01c2b..849ad9f95287cf81bf5691f246bc51930e829e22 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -23,7 +23,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 ## Controls and how a press answers
 
 - Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`. Its `throttle` may be a function of the interaction and the custom id (asked after the guards; undefined lets a control through uncounted): `/counters` counts a submitted dialog in the command's window and the button that opens it in a `MEMBER_READ_THROTTLE` window of its own. A limit with `as` (`ControlThrottle`) counts in the window of that command, as the router counts the command's uses (the dialog of `/counters` runs the command's work against Pokebattler: command and submits share its three a minute, "You can use /counters again in …"); without it a control counts in its kind's own window (`controlThrottleKey(kind)`, `component:<kind>`), as `/rank`'s and `/help`'s do. The bot gives the router its `Throttles` (`RouterOptions.throttles`) and shares them with the web server, whose presses of a party's buttons count in the window of the post's controls (plan 8M-3). What a control refuses belongs in a guard of its handler, which runs before the throttle, so that a refusal does not count (`requireDialogPlan` of `/counters`' dialog).
-- A dialog (a modal; `showModal`, the first answer: nothing is deferred before it) holds up to five labels, rows of a text input and text displays. Checked on the test server (2026-10-18, plan 8T-H): a dialog of one text display alone opens and submits (the split's one-group dialog), and a label may hold a radio group (`ComponentType.RadioGroup`, 2 to 10 choices of a label, value and description of 100 each), read with `fields.getRadioGroup(id, true)`; a required one cannot be submitted empty (Discord refuses Submit), so nothing is preselected where a pick must be deliberate. Labels and descriptions of choices are assumed to show no markdown, as those of select menus do (not yet checked on Discord: 8T staging step 28 checks it): they carry the members' text as it is, not `plain()`.
+- A dialog (a modal; `showModal`, the first answer: nothing is deferred before it) holds up to five labels, rows of a text input and text displays. Checked on the test server (2026-10-18, plan 8T-H): a dialog of one text display alone opens and submits (the split's one-group dialog), and a label may hold a radio group (`ComponentType.RadioGroup`, 2 to 10 choices of a label, value and description of 100 each), read with `fields.getRadioGroup(id, true)`; a required one cannot be submitted empty (Discord refuses Submit), so nothing is preselected where a pick must be deliberate. A label may also hold one tick box (`ComponentType.Checkbox`: a `custom_id` and `default` only, its words the label's and its description's; `fields.getCheckbox`, plan 8R-4: Costumes and Remove of `/want`'s dialog), not yet checked on Discord (8R-4's staging). Labels and descriptions of choices are assumed to show no markdown, as those of select menus do (not yet checked on Discord: 8T staging step 28 checks it): they carry the members' text as it is, not `plain()`.
 - A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. They are Remove all of the wants and gym targets (`notifications-and-dms.md`), staff's `/delete` and Close…, Refuse place…, Block maker… of a report's post (`removalDialog`, `moderation.md`), deleting a gym and `/region remove` (`gyms-and-regions.md`), `/location` to another region (`parties-and-posts.md`), the split of a train (`trains.md`) and `/max`'s question about a battle that ends soon (plan 8X-3, `parties-and-posts.md`: no read from the database, the slow-read rule's clock checked before it opens; its Submit `max:<token>:report`, a pending-request token, carries on the use `/max` counted); the panels used again and again, the import previews and the like stay private replies. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text?, choice?, field? })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`, and may be left out of a dialog that is its choice alone; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Plan 8X-1B: a choice may name the value `picked` to start with (Discord's `default`; the fakes refuse two, as Discord would), which goes first in its list where the order allows: Android picks a radio group's first choice by itself whatever is marked (Matt's check, 2026-10-20), an iPhone only what is marked, so a choice that must not be made by accident is never first; `menu: true` makes it a string select of up to 25 for a longer list (Meet…, `getStringSelectValues`), whose default is marked only (it keeps its order). Discord's client keeps what was submitted in a dialog per custom id and shows that again in place of the value marked (the staging of 8X: Meet… showed the time submitted before, not the group's), so a dialog that marks a value to start with (Meet…, the which-group dialog, Group…) ends its custom id in a per-open token, `openToken(now)` (`~` and the moment it opened in base 36, about ten characters: count them in the 100), which its Submit leaves out with `withoutOpenToken(args)` (plan 8X-F; a dialog drawn before without it submits as before); `field` is one optional line of text (`TextInputStyle.Short`, `required: false`). A command whose throttle varies counts in `variedThrottleKey(name, limit)`; a control that counts in that window (`as`, Meet…'s dialog in `/meet`'s; "Same task at more stops…" in `/research report`'s, plan 8R-1, whose limit is of the settings: a control's `throttle` function gets `(interaction, id, ctx)`) is refused in the command's words, the name before the line break ("You can use /meet again in …"). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), a read that comes back past the budget by the clock is refused too (also before its timer ran, on a busy event loop), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
 - A press on the controls of an answer (plan 8B-2) is answered through `pressAnswer` / `deferPress` / `answerPress` (`src/discord/late-reply.ts`): on a public answer (`/rank`, `/counters` in a post) the member who asked (`message.interactionMetadata.user`, never the deprecated `interaction`) changes the answer for everybody (`update`), anybody else gets a private copy with the change; a press on a private answer always changes it; `onlyPrivate` (a Pokébox) gives even the asker a copy. Work that takes time acknowledges first as it will answer (`deferUpdate` or a private `deferReply`; a form submitted from no message has nothing to update and is deferred as a copy). A public answer in a party's post whose party has ended is never edited: the press answers privately.
 - A control that answers in the place of the message it is on, where that message may be from before it was v2, uses `showInPlace(press, message, oldLine?)` and `sayInPlace(press, text, accent)` (`src/discord/late-reply.ts`; `onV2Message`): on a v2 message an `update` (or an edit after `deferUpdate`) with its files replacing the old ones (`attachments: []`); on a classic one `sayInPlace` answers plain text, and `showInPlace` closes it with `oldLine` (`ANSWERED_BELOW` unless given) and sends the v2 message as a private follow-up, since whether Discord takes a v2 interaction update of a classic message is not known and is not tried; a form a command opened is answered privately. Controls backed by `PendingRequests` (the questions of `/gym` and `/region`) meet a message from before a restart as expired, so these classic paths are a safety net for them; in practice only stateless controls (the `/iam` menus) reach them. An answer in a private message of its own (a command, or a press acknowledged with `deferReply`: `answeredApart`, told by discord.js setting `ephemeral` for a reply or `deferReply` and not for `update` or `deferUpdate`) goes through `answerApart(interaction, message)`; `showInPlace` throws there, and `sayInPlace` answers apart. In tests the fake controls take `v2Message: true` for a press on a v2 message whose rows the test does not give (`gymCommandsWith` and `regionCommandsWith` press so by default; `v2Message: false` is a message from before), and refuse as Discord would: a v2 `update` (or edit after `deferUpdate`) of a classic message ("a classic-to-v2 update is not tried"), a v2 message made classic, and a file component, thumbnail or gallery picture naming a file the message does not carry (a reply and a follow-up carry only their own `files`; an edit that sends `files` without `attachments` keeps none of the old ones, as discord.js sends it). `V2Message.files` are `MessageFile`s: a local path, or text made with its name (`{ attachment: Buffer, name }`).
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index ba767bd88e2824d0d599ad5c7b1c0471681baf1d..170afbf4e556066f1f98b1b5abd6e7213354112f 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -6,7 +6,7 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 
 - A want (`PokemonNotification`) is per member and server and is one of: a species (every form, megas included), one form (`form`, a catalogue key), the shadow raids of either (`shadow`; since plan 8R-2 shadow raids and Team GO Rocket catches, the Shadow box), a raid tier (raids only), perfect or zero IVs (spawns only); a mega is raids only. The columns are read and written only through the codec (`notification-target.ts`: `readNotification` gives the target and the scope in effect; a row it cannot read is skipped, counted and never deleted on its own) and the pure functions of `src/domain/pogo/wants.ts` (`readWants`, `planSetWant`, `rowsOfWant`: duplicate legacy rows are one want with the union of their scopes, two keys of one catalogue entry are one want, a row is rewritten only when its meaning changes). `ctx.wants` (`WantStorage`: `list`, `set`, `remove`, `removeAll`, `count`) is the repository; `MemoryWants` (`test/support/wants.ts`) is its twin and runs the same functions. `pokemonWantFits(catalogue, target, entry, shadowRaid)` says whether a want is for a boss or a spawn. Since plan 8R-1 a raid scope means raids only (no max battles), and the legacy `!wants` codec and the scope rules (`planSetWant`, `widerScope`) are unchanged.
 - **Costumed wants** (plan 8R-4, migration 030; design `2026-10-22-costume-form-wants-design.md`): `PokemonNotification.costumed` and `TargetWant.costumed` (tinyint, default 0) make a Pokémon's want costumed only, a property of the row like the scope, never part of its target, token, unique key or id (`Want.costumed?: true`, a Pokémon's `TargetWant.costumed?: true`; `boxTarget(kind, dex, form, costumed)`, `withCostume`, `isCostumedTarget`; a Stop or Remove takes the row whatever its costume). Rows of one target that disagree read as plain (`readWants`: plain wins, as the wider scope); `planSetWant(…, costumed)` rewrites a row whose costume differs; a `TargetWant` added again takes the costume of its add (an upsert per costume, `createdAt` kept). Every sighting carries `costumed` (`PokemonSighting`): a raid's boss as the list has it in the raid's tier (`ShownBoss.costumed`), a spawn as `SpawnNews.costumed` says, a research reward by `rewardCostumed` (its Leek Duck name and picture, worked out when read), a max boss and a Rocket catch never. `pokemonWantFits(…, costumed)` fits a costumed want only to a costumed sighting, under the entry the costume copies; a plain want fits either. The matchers (`raidWantsFiring`, `spawnWantsFiring`, `rocketShadowFiring`) give the wants themselves, so a reason carries `costumed` (`wantReason`) and the DM names it "Costumed Pikachu" (`wantTargetLabel(…, costumed)`, `pokemonWantName({ costumed })`: no "(every form)", "Costumed Corsola"), a target "Costumed Pikachu (research)" (`targetWantLabel`); members told of one event share a message only where their reasons read alike (`shownReasonKey`).
-- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy, written at once with no dialog (`rocketWantAnswer`: a grunt type at most one DM an hour for each type). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (since plan 8R-4 `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>][:<form>][:l<page>]:~<token>`, a tier `wantbox:t<level>:set2:…`; `src/commands/notifications/want-dialog.ts`, `wantDialogId` / `readWantDialogId`: `<mask>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `<flags>` whether it showed Costumes (1) and Remove (2), `<which>` `whichHash` of the keys its Which field showed, `0` for none (`NO_WHICH`), the server where it was opened from a DM, the form only beyond the Which field (an Unown letter), the page of `/wants`, last `openToken` of when it opened (plan 8X-F: Discord's client shows what was last submitted under an id in place of what the dialog ticks), which `readWantDialogId` leaves out; an id of before (`set`) or of any other shape, one without its token, and a Which hash that is not the field's now, are `STALE_COMPONENT`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock; nothing ticked takes the target off. **One answer per species** (plan 8R-4, design 3; `src/domain/pogo/species-answer.ts`): an answer (`BoxAnswer`: the forms that stand, `undefined` the subject's own row, of a species the species row; the boxes ticked of those shown; costumed; Remove) covers a scope (`AnswerScope`, `scopeOf`: a species is `wide`, every row of its Pokédex number in both tables, `PokemonNotification.pokemon = <dex>` and `TargetWant.target` `<kind>:<dex>` exactly or `<kind>:<dex>:%`, so 25 never reads 251; a species with more entries than the Which field holds, `WHICH_CAP` 25, Unown, is not: its species row and each letter are answers of their own; a tier is its own). `WantBoxStorage.held(member, server, scope)` gives the rows by form (`HeldRow`: its boxes, costumed when every row of it is; `heldRows`), `set(member, server, answer, at)` carries out `planAnswer`: Remove, no form or no box shown ticked takes every row of the scope away, the boxes the dialog did not show included (A2, Q1); every form ticked gets the boxes ticked of those shown and keeps the others as its row had them (a new row: as the scope's rows had them together), all with the answer's costume (`costumed` undefined where the dialog did not show Costumes: each row keeps its own, a new row costumed where every row held is, `allCostumed`, A1); a mega a raid row and nothing else, always plain, nothing without Raids (review R4c, A-D3; `FormReader`'s `mega`); every other row goes; in one transaction under the member's lock (`WantBoxRepository`, twin `MemoryWantBoxes`, both `wantBoxCases`). `removalAnswer(scope)` is `/unwant`'s, a list's Remove and a DM's Stop of a subject. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
+- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy, written at once with no dialog (`rocketWantAnswer`: a grunt type at most one DM an hour for each type). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. **The Pokémon dialog of plan 8R-4** (design 3, the mockups of 2026-10-22; `wantDialog` / `WantDialogView` in `src/commands/notifications/want-dialog.ts`, `wantDialogFor` in `wants.ts`): the title by the species' name ("Corsola: what for?", `dialogName`), one text, then at most four fields, a dialog's five components being Discord's limit (every other sentence goes into the one text: the mega note "A mega is told for raids only.", "Your Ponyta wants differ by form; Submit sets them alike."; Charizard's is the largest, a test builds it): **Tell me about** (`boxes`, two boxes or more; their descriptions, `BOX_DESCRIPTIONS` with `{name}`, only without a Which field; Research no longer for a legendary, mythical or ultra beast unless today's task list rewards it or the member holds it, `shownBoxes` / `dialogBoxes`), **Which <species>** (`forms`, `whichEntries`: a species of 2 to `WHICH_CAP` 25 entries, megas included, by their catalogue names; a checkbox group to ten, a string select above; none for Unown, whose letters are dialogs of their own, `wantbox:p201:…:unown_a`), **Costumes** (`costumed`, one `ComponentType.Checkbox` under a Label `Only costumed <species>` / `Only costumed ones`, shown where the game data has a costume of any of its forms or the raid boss list or today's task list has it costumed now, `costumesShown`, or where a row held is costumed, A1: a Submit never drops a costume unseen; not shown, each row keeps its own) and **Remove** (`remove`, one Checkbox, `Remove <species> from my list`, where the member holds a want of it; it wins over everything). With one box and none of Which and Costumes it writes at once, a costumed row held staying costumed (`asksAbout`, decided synchronously for the deferral, S1: Mew; what a use is about, `WantUse`, is read once per interaction, `useOf`, so the deferral and `execute` decide alike, A8); with one box and a Which field (Arceus) there is no Tell me about field and the text says what it is told for. A first want opens with no box ticked and every form ticked (a form picked from the list alone: `/want galarian corsola`, `/want mega charizard y`, `dialogSubject`), Costumed off, and its Tell me about and Which fields required (`required: true`, `min_values` 1: Discord lets no Submit through till a box and a form are ticked; Matt's R-M2, no "All" option), a tier's dialog alike; with wants, as stored (a box ticked where any row has it, Costumed only where every row but the megas is, `allCostumed`, the picked form added; the rows that differ leave a mega's out, A3), and the fields not required, so that nothing ticked still takes the want off (Q1). **In the post of a raid or a max battle** (Matt's R-M1; `postSubject` and `postBoxOf` in `wants.ts`, the party read from the post's id in memory by `partyOf`, so `opensDialog` stays synchronous and `showModal` the first answer): `/want` with nothing typed (the option is not required) is the boss (a form of a species with several picked in its species' dialog), an egg its tier; a boss the game data does not know is refused (Matt's Q1, F1: a raid's "Pine doesn't know this raid's boss yet: name a Pokémon, or `/want t5` for the tier.", the tier its own; a max battle's "Pine doesn't know this battle's boss yet: name a Pokémon."); the dialog ticks only the post's kind of battle for a first want (a raid's Raids, a shadow raid's Shadow, a tier's Raids or Shadow raids, a max battle's Dynamax or Gigantamax), also for a Pokémon typed there, and beside the rows held for a want held. Anywhere else nothing typed is a `UserError` (`NAME_A_POKEMON`: "Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it out for its boss."; an ended raid's post is out of the store, so as any other). These refusals and a name it cannot read come from the guard `readsUse` (it reads the use, `useOf`), so they do not count against the throttle (F2). The Submit (`answerOfSubmit`, `readWantSubmit`: a Which field read as its forms, every form ticked as the species row; a missing field or another Which hash is `STALE_COMPONENT`) writes through `WantBoxStorage.set`, and the answer names the want as `/wants` does (`rowsLabel`: "Costumed Pikachu", "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above three by count) with its boxes, in small print where Costumed meets a box no costumed Pokémon has appeared in (`NEVER_COSTUMED_YET`: Dynamax, Gigantamax, Shadow; a warning, never a refusal) and where a mega ticked without Raids is off. `/unwant` of a form whose species row covers it (`coveringSpecies`, review R4e) removes nothing and says so. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (since plan 8R-4 `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>][:<form>][:l<page>]:~<token>`, a tier `wantbox:t<level>:set2:…`; `src/commands/notifications/want-dialog.ts`, `wantDialogId` / `readWantDialogId`: `<mask>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `<flags>` whether it showed Costumes (1) and Remove (2), `<which>` `whichHash` of the keys its Which field showed, `0` for none (`NO_WHICH`), the server where it was opened from a DM, the form only beyond the Which field (an Unown letter), the page of `/wants`, last `openToken` of when it opened (plan 8X-F: Discord's client shows what was last submitted under an id in place of what the dialog ticks), which `readWantDialogId` leaves out; an id of before (`set`) or of any other shape, one without its token, and a Which hash that is not the field's now, are `STALE_COMPONENT`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock; nothing ticked takes the target off. **One answer per species** (plan 8R-4, design 3; `src/domain/pogo/species-answer.ts`): an answer (`BoxAnswer`: the forms that stand, `undefined` the subject's own row, of a species the species row; the boxes ticked of those shown; costumed; Remove) covers a scope (`AnswerScope`, `scopeOf`: a species is `wide`, every row of its Pokédex number in both tables, `PokemonNotification.pokemon = <dex>` and `TargetWant.target` `<kind>:<dex>` exactly or `<kind>:<dex>:%`, so 25 never reads 251; a species with more entries than the Which field holds, `WHICH_CAP` 25, Unown, is not: its species row and each letter are answers of their own; a tier is its own). `WantBoxStorage.held(member, server, scope)` gives the rows by form (`HeldRow`: its boxes, costumed when every row of it is; `heldRows`), `set(member, server, answer, at)` carries out `planAnswer`: Remove, no form or no box shown ticked takes every row of the scope away, the boxes the dialog did not show included (A2, Q1); every form ticked gets the boxes ticked of those shown and keeps the others as its row had them (a new row: as the scope's rows had them together), all with the answer's costume (`costumed` undefined where the dialog did not show Costumes: each row keeps its own, a new row costumed where every row held is, `allCostumed`, A1); a mega a raid row and nothing else, always plain, nothing without Raids (review R4c, A-D3; `FormReader`'s `mega`); every other row goes; in one transaction under the member's lock (`WantBoxRepository`, twin `MemoryWantBoxes`, both `wantBoxCases`). `removalAnswer(scope)` is `/unwant`'s, a list's Remove and a DM's Stop of a subject. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
 - What a member picked in the `target` option of `/want` or `/unwant` is a want token (`wantToken` / `parseWantToken`: `pokemon:<dex>[:<form>][:shadow]`, `tier:<level>[:shadow]`, `iv:perfect|zero`): the value of an autocomplete choice, never part of a custom id. Text sent without picking never guesses (`readWantText`): it acts only when it is a tier or IV word in full (`wantWord`), exactly a species' name (every form) or exactly one form's own name, with `shadow` before either; anything else is refused with suggestions. A bare number is a tier or IV word, never a Pokédex number.
 - Wants are named in one way everywhere (`wantLabel` / `wantName` in `src/commands/notifications/want-input.ts`): "X (every form)" for a species with several entries, "X (base form)" for its plain entry, "Shadow X", and the scope after " · " in the choices of `/unwant`.
 - Gym targets (`GymNotification`; `gym` holds a gym id as text) are `ctx.gymTargets` (`GymTargetStorage`), with `MemoryGymTargets` as the twin. In code "target" alone is what a want is for; a gym a member wants raids of is a gym target.
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 48ab4a530a6b86987a09379b22d8a9650100c20f..28f0341a717006db2e9a8d6742a1b4d96149290a 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -25,8 +25,8 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Fake interactions
 
-- Handler tests use the fakes of `test/support/fake-interactions.ts` (`fakeChatInput`, `fakeAutocomplete`, `fakeButton`, `fakeSelect`, `fakeModal`, `fakeMessageCommand` with the `targetMessage` it was used on, a forward's snapshot by `forwards`, `sent()`), which refuse what discord.js refuses (a second acknowledgement, a follow-up before any reply, a missing required option) and a form Discord would refuse (`checkModal`: a title of 45, 1 to 5 labels or rows, a label of 45, custom ids unique, string selects of 1 to 25 options, checkbox groups of 1 to 10 and radio groups of 2 to 10, values unique, labels and values of 100 and descriptions of 100, `min_values` / `max_values` within the options, no more defaults than may be chosen, a text display of 1 to 4,000 characters). A submitted form is as strict as discord.js (reading an input it did not submit, or as another type, throws) and carries `fields` (text), `selected` (select menus), `checked` (checkbox groups, `fields.getCheckboxGroup`) and `picked` (radio groups, `fields.getRadioGroup`); given the form the opener showed (`form`), it submits every input of it (an empty text as `''`, an unticked group or an optional menu as `[]`, an optional radio group as `null`), needs a value for a required menu or radio group (Discord refuses the Submit without one), a radio group's pick among its choices, and refuses inputs the form does not have (the `/gym` helper passes the form the bot showed); a control's message says who asked for it (`askedBy`: `interactionMetadata.user`) and whether it is private (`ephemeralMessage`). Test a handler that has `defer` through `InteractionRouter.handle`, or give the fake `deferred: true`.
-- A dialog (plan 8Q, `discord-framework.md`) is read with `test/support/dialogs.ts`: `dialogOf(fake)` (undefined when none opened) or `shownDialog(fake)`, its `dialogTexts` / `dialogText`, and `dialogChoices` (value, label, description, and `picked` for a choice picked beforehand, Discord's `default`; of radio groups and, since plan 8X-1B, string selects). A Submit of a menu passes `selected`, of a line of text `fields`. Submit it with `fakeModal({ customId: dialog.custom_id, form: dialog, picked })`, so that the fake refuses a required choice left empty. The slow-read rule is tested by holding the read (a spy that resolves a promise when it is asked and never answers), then `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` before the press (the timer is set before the read is asked; the fake's `createdTimestamp` is the real now, so the budget is about `DIALOG_READ_MS`) and `vi.advanceTimersByTimeAsync(DIALOG_READ_MS)` once it was asked. A submitted form's `fields.fields` is the map of what it submitted, as discord.js's (`pickedOf` asks it).
+- Handler tests use the fakes of `test/support/fake-interactions.ts` (`fakeChatInput`, `fakeAutocomplete`, `fakeButton`, `fakeSelect`, `fakeModal`, `fakeMessageCommand` with the `targetMessage` it was used on, a forward's snapshot by `forwards`, `sent()`), which refuse what discord.js refuses (a second acknowledgement, a follow-up before any reply, a missing required option) and a form Discord would refuse (`checkModal`: a title of 45, 1 to 5 labels or rows, a label of 45, custom ids unique, string selects of 1 to 25 options, checkbox groups of 1 to 10 and radio groups of 2 to 10, values unique, labels and values of 100 and descriptions of 100, `min_values` / `max_values` within the options, no more defaults than may be chosen, a text display of 1 to 4,000 characters). A submitted form is as strict as discord.js (reading an input it did not submit, or as another type, throws) and carries `fields` (text), `selected` (select menus), `checked` (checkbox groups, `fields.getCheckboxGroup`) and `picked` (radio groups, `fields.getRadioGroup`); given the form the opener showed (`form`), it submits every input of it (an empty text as `''`, an unticked group or an optional menu as `[]`, an optional radio group as `null`), needs a value for a required menu, checkbox group or radio group (Discord refuses the Submit without one) and at least a menu's or group's `min_values` chosen unless it may stay empty and is (plan 8R-4: a first want's required Tell me about), a radio group's pick among its choices, and refuses inputs the form does not have (the `/gym` helper passes the form the bot showed); a control's message says who asked for it (`askedBy`: `interactionMetadata.user`) and whether it is private (`ephemeralMessage`). Test a handler that has `defer` through `InteractionRouter.handle`, or give the fake `deferred: true`.
+- A dialog (plan 8Q, `discord-framework.md`) is read with `test/support/dialogs.ts`: `dialogOf(fake)` (undefined when none opened) or `shownDialog(fake)`, its `dialogTexts` / `dialogText`, and `dialogChoices` (value, label, description, and `picked` for a choice picked beforehand, Discord's `default`; of radio groups and, since plan 8X-1B, string selects). A Submit of a menu passes `selected`, of a line of text `fields`. Submit it with `fakeModal({ customId: dialog.custom_id, form: dialog, picked })`, so that the fake refuses a required choice left empty. The slow-read rule is tested by holding the read (a spy that resolves a promise when it is asked and never answers), then `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` before the press (the timer is set before the read is asked; the fake's `createdTimestamp` is the real now, so the budget is about `DIALOG_READ_MS`) and `vi.advanceTimersByTimeAsync(DIALOG_READ_MS)` once it was asked. A submitted form's `fields.fields` is the map of what it submitted, as discord.js's (`pickedOf` asks it). Plan 8R-4: a form's one tick box (`ComponentType.Checkbox` in a Label, nothing but its `custom_id` and `default`; `checkModal` refuses more) is submitted with `ticks` (by custom id; one not named comes back unticked) and read with `fields.getCheckbox`; `dialogFields(dialog)` / `dialogField(dialog, label)` give a dialog's fields with their labels, descriptions, kinds, a Checkbox's tick and a group's or menu's options as ticked to start with.
 
 ## Parties
 
diff --git a/src/commands/notifications/want-boxes.ts b/src/commands/notifications/want-boxes.ts
index 41ce49dd8cbadb6430a3bcb67d03320d1a376de7..bfeae16e187196712a3226e4369da89e0bf8f33f 100644
--- a/src/commands/notifications/want-boxes.ts
+++ b/src/commands/notifications/want-boxes.ts
@@ -28,7 +28,17 @@ import {
   type BoxSubject,
   type WantBox,
 } from '../../domain/pogo/want-boxes.js';
-import { answerScopeOf, type AnswerScope } from '../../domain/pogo/species-answer.js';
+import {
+  allCostumed,
+  answerScopeOf,
+  boxesOf,
+  whichHash,
+  WHICH_CAP,
+  type AnswerScope,
+  type HeldRow,
+} from '../../domain/pogo/species-answer.js';
+import { rewardCostumed } from '../../domain/notify/reasons.js';
+import { speciesNameOf } from '../../domain/pogo/wants.js';
 import { appearsInWild } from '../../domain/pogo/wild.js';
 import type { WantList } from '../../domain/pogo/wants.js';
 import { foldTaskText } from '../../domain/research/task.js';
@@ -152,13 +162,132 @@ function entriesOf(
   return entry?.dex === subject.dex ? [entry] : [];
 }
 
+/** Whether today's task list has a Pokémon of this number as a reward (`researchTasks`). */
+function rewardedToday(ctx: AppContext, dex: number): boolean {
+  return ctx.researchTasks
+    .tasks()
+    .some((task) =>
+      task.rewards.some((reward) => reward.kind === 'encounter' && reward.dex === dex),
+    );
+}
+
 /**
  * The boxes the dialog of a subject shows (design 7: only what can happen): of a tier, Raids and
  * its shadow raids where it has them; of a Pokémon, `pokemonBoxes` with the game master, the
- * settings' wild exceptions, the max boss list and the raid boss list of now.
+ * settings' wild exceptions, the max boss list and the raid boss list of now; no Research for a
+ * legendary, mythical or ultra beast (`PokemonEntry.class`, plan 8R-4: never ordinary task
+ * rewards) unless today's task list rewards it (the member's own Research box is added by
+ * `dialogBoxes`). Decided from the lists alone, so `/want` knows at once whether it asks.
  */
 export function shownBoxes(ctx: AppContext, subject: BoxSubject): WantBox[] {
   if (subject.kind === 'tier') return tierBoxes(subject.level);
+  const boxes = pokemonShownBoxes(ctx, subject);
+  const special = entriesOf(ctx, subject).every((entry) => entry.class !== null);
+  return special && !rewardedToday(ctx, subject.dex)
+    ? boxes.filter((box) => box !== 'research')
+    : boxes;
+}
+
+/**
+ * The boxes a dialog shows for a member: `shownBoxes`, and the Research box where the member
+ * holds it though it is not shown any more (a legendary's), so that it can be taken off.
+ */
+export function dialogBoxes(
+  ctx: AppContext,
+  subject: BoxSubject,
+  held: readonly HeldRow[],
+): WantBox[] {
+  const shown = shownBoxes(ctx, subject);
+  if (shown.includes('research') || !boxesOf(held).has('research')) return shown;
+  return POKEMON_BOXES.filter((box) => box === 'research' || shown.includes(box));
+}
+
+/** The forms of a species' Which field: its entries, megas included, where it has 2 to 25. */
+export function whichEntries(ctx: AppContext, subject: BoxSubject): PokemonEntry[] {
+  if (subject.kind !== 'pokemon' || subject.form !== undefined) return [];
+  const entries = ctx.gameData.catalogue.byDex(subject.dex);
+  return entries.length > 1 && entries.length <= WHICH_CAP ? [...entries] : [];
+}
+
+/** The hash of the Which field a dialog of the subject shows now (`whichHash`). */
+export function whichHashOf(ctx: AppContext, subject: BoxSubject): string {
+  return whichHash(whichEntries(ctx, subject).map((entry) => entry.key));
+}
+
+/**
+ * Whether a species' dialog asks about costumes (design 3, review R7): the game data has a
+ * costume of any of its forms, or the raid boss list or today's task list has it costumed now.
+ */
+export function costumesShown(ctx: AppContext, subject: BoxSubject): boolean {
+  if (subject.kind !== 'pokemon') return false;
+  const { catalogue } = ctx.gameData;
+  if (catalogue.hasCostume(subject.dex)) return true;
+  if (ctx.raidBosses.bosses().some((boss) => boss.costumed && boss.entry?.dex === subject.dex)) {
+    return true;
+  }
+  return ctx.researchTasks
+    .tasks()
+    .some((task) =>
+      task.rewards.some(
+        (reward) =>
+          reward.kind === 'encounter' &&
+          reward.dex === subject.dex &&
+          rewardCostumed(catalogue, reward),
+      ),
+    );
+}
+
+/**
+ * The subject a Pokémon's dialog is about, and the form picked (plan 8R-4): a form of a species
+ * with a Which field opens the species' dialog with that form ticked (`/want galarian corsola`,
+ * `/want mega charizard y`); a form beyond the Which field (an Unown letter) its own.
+ */
+export function dialogSubject(
+  ctx: AppContext,
+  subject: BoxSubject,
+): { subject: BoxSubject; picked?: string } {
+  if (subject.kind !== 'pokemon' || subject.form === undefined) return { subject };
+  const species: BoxSubject = { kind: 'pokemon', dex: subject.dex };
+  return whichEntries(ctx, species).length > 0
+    ? { subject: species, picked: subject.form }
+    : { subject };
+}
+
+/** The name of a dialog and its answers: a species' own (`Corsola`), else as a list calls it. */
+export function dialogName(ctx: AppContext, subject: BoxSubject): string {
+  if (subject.kind === 'pokemon' && subject.form === undefined) {
+    return speciesNameOf(ctx.gameData.catalogue, subject.dex) ?? subjectLabel(ctx, subject);
+  }
+  return subjectLabel(ctx, subject);
+}
+
+/**
+ * What rows of a subject are called, as a line of `/wants` and the answer after a Submit say it
+ * (design 4): the species row by the species' name, forms by their names up to three
+ * ("Arceus, Dragon Arceus, Fire Arceus") and above that by count ("Arceus (17 of 18 forms)");
+ * `Costumed` before it where every row is costumed.
+ */
+export function rowsLabel(ctx: AppContext, subject: BoxSubject, rows: readonly HeldRow[]): string {
+  const { catalogue } = ctx.gameData;
+  let label = dialogName(ctx, subject);
+  const forms = rows.flatMap((row) => (row.form === undefined ? [] : [row.form]));
+  if (subject.kind === 'pokemon' && subject.form === undefined && forms.length === rows.length) {
+    const total = whichEntries(ctx, subject).length;
+    label =
+      forms.length <= 3
+        ? forms.map((form) => catalogue.byKey(form)?.name ?? form).join(', ')
+        : `${label} (${String(forms.length)} of ${String(total)} forms)`;
+  }
+  return allCostumed(rows, isMegaForm(ctx)) ? `Costumed ${label}` : label;
+}
+
+/** Whether a form's key is a mega's (or a primal's): always plain, Raids only (A-D3, R4c). */
+export function isMegaForm(ctx: AppContext): (form: string) => boolean {
+  return (form) => ctx.gameData.catalogue.byKey(form)?.kind === 'mega';
+}
+
+/** `shownBoxes` of a Pokémon as the game data and the lists have it, Research of any. */
+function pokemonShownBoxes(ctx: AppContext, subject: BoxSubject & { kind: 'pokemon' }): WantBox[] {
   const entries = entriesOf(ctx, subject);
   const keys = new Set(entries.map((entry) => entry.key));
   const fits = (entry: PokemonEntry | undefined): boolean =>
diff --git a/src/commands/notifications/want-dialog.ts b/src/commands/notifications/want-dialog.ts
index 8ad0e4c68b9943883acf9776d8201a1333ff758f..ac7a1b61bc43454d1a21cc4c61bf13476265b34a 100644
--- a/src/commands/notifications/want-dialog.ts
+++ b/src/commands/notifications/want-dialog.ts
@@ -1,16 +1,32 @@
+import {
+  ComponentType,
+  type APIModalInteractionResponseCallbackData,
+  type ModalSubmitInteraction,
+} from 'discord.js';
 import { encodeCustomId, type CustomId } from '../../discord/custom-id.js';
 import { openToken, withoutOpenToken } from '../../discord/dialog.js';
 import { isSnowflake } from '../../db/snowflake.js';
 import { isFormKey, isPokedexNumber } from '../../domain/pogo/notification-target.js';
 import { isRaidLevel } from '../../domain/pogo/raid-tier.js';
-import type { BoxSubject, WantBox } from '../../domain/pogo/want-boxes.js';
+import { NO_WHICH } from '../../domain/pogo/species-answer.js';
+import {
+  BOX_DESCRIPTIONS,
+  BOX_WORDS,
+  type BoxSubject,
+  type PokemonBox,
+  type WantBox,
+} from '../../domain/pogo/want-boxes.js';
+import { plain, truncate } from '../../render/text.js';
+import { textDisplay } from '../../render/v2.js';
 import { allBoxes } from './want-boxes.js';
 
 /*
- * The custom id of `/want`'s dialog (plan 8R-4, F6): what a Submit needs to know of the dialog it
- * comes from, and nothing kept anywhere else.
+ * `/want`'s dialog (plan 8R-4): its custom id (F6), what a Submit needs to know of the dialog it
+ * comes from, and nothing kept anywhere else; the dialog itself; and how a Submit is read.
  */
 
+export { NO_WHICH };
+
 /**
  * The custom-id kind of `/want`'s dialog: `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>]
  * [:<form>][:l<page>]:~<token>` for a Pokémon, `wantbox:t<level>:set2:…` for a tier
@@ -25,9 +41,6 @@ export const WANT_BOX_KIND = 'wantbox';
  */
 export const WANT_BOX_ACTION = 'set2';
 
-/** The Which field's hash where the dialog shows none. */
-export const NO_WHICH = '0';
-
 /** What the custom id of a dialog says. */
 export interface WantDialogId {
   /** A species (no form), one form beyond the Which field (an Unown letter), or a tier. */
@@ -142,3 +155,234 @@ export function readWantDialogId(id: CustomId): WantDialogId | undefined {
     ...(page === undefined ? {} : { page }),
   };
 }
+
+/** The inputs of the dialog: its boxes, its Which field, Costumes and Remove. */
+export const BOXES_INPUT = 'boxes';
+export const FORMS_INPUT = 'forms';
+export const COSTUMED_INPUT = 'costumed';
+export const REMOVE_INPUT = 'remove';
+
+/** The most choices a checkbox group holds: a Which field of more is a dropdown (to 25). */
+const GROUP_MOST = 10;
+
+/** What the dialog of a subject shows and how it is ticked when it opens. */
+export interface WantDialogView {
+  /** The subject of the Submit: a species, an Unown letter, a tier. */
+  subject: BoxSubject;
+  /** The name in its title and texts: the species' (`Corsola`), a letter's, a tier's. */
+  name: string;
+  /** The boxes it shows; with one only there is no Tell me about field (it is told for that). */
+  shown: WantBox[];
+  /** The forms of the Which field, in their order (none: no field). */
+  which: { key: string; name: string }[];
+  /** `whichHash` of the Which field's keys, `NO_WHICH` for none. */
+  whichHash: string;
+  /** Whether it shows Costumes, and Remove (the member holds a want of it). */
+  costumes: boolean;
+  remove: boolean;
+  /** What is ticked when it opens. */
+  ticks: { boxes: ReadonlySet<WantBox>; forms: ReadonlySet<string>; costumed: boolean };
+  /** The member's rows of it differ by form (a Submit sets them alike). */
+  differ: boolean;
+  /** Opened from a DM: the server it is about, named in its text (`plain`, F14). */
+  server?: { id: string; name: string };
+  /** Opened from `/wants`: the page it shows again. */
+  page?: number;
+  /** When it opened: the per-open token of its id (`openToken`, plan 8X-F). */
+  openedAt: number;
+}
+
+/** What a tier's boxes say under their names. */
+function tierDescription(level: string, box: WantBox): string {
+  return box === 'shadow-raids'
+    ? `Shadow ${level} raids and their eggs`
+    : `${level} raids and their eggs`;
+}
+
+/** The one text of the dialog: what to do, then what else there is to know, in one display. */
+function dialogText(view: WantDialogView): string {
+  const name = plain(view.name);
+  const megas = view.which.some((form) => /^Mega |^Primal /.test(form.name));
+  const opened = view.server !== undefined || view.page !== undefined;
+  const sentences: string[] = [];
+  if (opened && view.remove) {
+    const where = view.server === undefined ? '' : ` in ${plain(view.server.name)}`;
+    sentences.push(
+      `Your ${name} want${where}. Change what you want a DM about, or tick Remove to stop them all.`,
+    );
+  } else if (view.shown.length === 1 && view.subject.kind === 'pokemon') {
+    const box = view.shown[0] ?? 'raids';
+    const what = box === 'raids' ? 'raids' : BOX_WORDS[box].toLowerCase();
+    sentences.push(
+      `${name} is told for ${what}, in the regions you can see.` +
+        (view.which.length > 0 ? ' Pick the forms you want.' : ''),
+    );
+  } else {
+    // A first want cannot be submitted with nothing ticked (R-M2), a want held can and goes (Q1).
+    sentences.push('Tick what you want a DM about, in the regions you can see.');
+  }
+  if (megas) sentences.push('A mega is told for raids only.');
+  if (view.differ) sentences.push(`Your ${name} wants differ by form; Submit sets them alike.`);
+  return sentences.join(' ');
+}
+
+/**
+ * The dialog of `/want` and of Change… (design 3, plan 8R-4; the mockups of 2026-10-22): "Pikachu:
+ * what for?", one text, then at most four fields, since a dialog holds five components at most
+ * (Discord's limit; every other sentence goes into the one text): Tell me about (the boxes, two
+ * or more; their descriptions only where there is no Which field), Which <species> (a checkbox
+ * group up to ten forms, a dropdown to 25), Costumes (one Checkbox) and Remove (one Checkbox,
+ * where the member holds a want of it). Its Submit is `wantbox:…:set2` (`wantDialogId`).
+ */
+export function wantDialog(view: WantDialogView): APIModalInteractionResponseCallbackData {
+  const { subject, shown, which, ticks } = view;
+  // A label shows no markdown (A10): the name as it is.
+  const { name } = view;
+  // A first want lets no Submit through till a box and a form are ticked (Matt's R-M2); a want
+  // held may be submitted with nothing, which takes it off (Q1).
+  const pick = view.remove ? { required: false, min_values: 0 } : { required: true, min_values: 1 };
+  const components: APIModalInteractionResponseCallbackData['components'] = [
+    textDisplay(dialogText(view)),
+  ];
+  const describe = (box: WantBox): string | undefined => {
+    if (subject.kind === 'tier') return tierDescription(view.name, box);
+    if (which.length > 0) return undefined;
+    return BOX_DESCRIPTIONS[box as PokemonBox].replace('{name}', view.name);
+  };
+  if (shown.length > 1) {
+    components.push({
+      type: ComponentType.Label,
+      label: 'Tell me about',
+      component: {
+        type: ComponentType.CheckboxGroup,
+        custom_id: BOXES_INPUT,
+        ...pick,
+        max_values: shown.length,
+        options: shown.map((box) => {
+          const description = describe(box);
+          return {
+            label: BOX_WORDS[box],
+            value: box,
+            ...(description === undefined ? {} : { description: truncate(description, 100) }),
+            ...(ticks.boxes.has(box) ? { default: true } : {}),
+          };
+        }),
+      },
+    });
+  }
+  if (which.length > 0) {
+    const options = which.map((form) => ({
+      label: truncate(form.name, 100),
+      value: form.key,
+      ...(ticks.forms.has(form.key) ? { default: true } : {}),
+    }));
+    components.push({
+      type: ComponentType.Label,
+      label: truncate(`Which ${name}`, 45),
+      component:
+        which.length <= GROUP_MOST
+          ? {
+              type: ComponentType.CheckboxGroup,
+              custom_id: FORMS_INPUT,
+              ...pick,
+              max_values: which.length,
+              options,
+            }
+          : {
+              type: ComponentType.StringSelect,
+              custom_id: FORMS_INPUT,
+              ...pick,
+              max_values: which.length,
+              options,
+            },
+    });
+  }
+  if (view.costumes) {
+    components.push({
+      type: ComponentType.Label,
+      label: truncate(which.length > 0 ? 'Only costumed ones' : `Only costumed ${name}`, 45),
+      description:
+        which.length > 0
+          ? 'Of the forms ticked, any costume, now or later.'
+          : 'Any costume, now or later. Unticked, costumed ones come too.',
+      component: {
+        type: ComponentType.Checkbox,
+        custom_id: COSTUMED_INPUT,
+        ...(ticks.costumed ? { default: true } : {}),
+      },
+    });
+  }
+  if (view.remove) {
+    components.push({
+      type: ComponentType.Label,
+      label: truncate(`Remove ${name} from my list`, 45),
+      description: 'Ticked, Submit removes it, whatever else is ticked.',
+      component: { type: ComponentType.Checkbox, custom_id: REMOVE_INPUT },
+    });
+  }
+  return {
+    custom_id: wantDialogId(
+      {
+        subject,
+        shown,
+        costumes: view.costumes,
+        remove: view.remove,
+        which: view.whichHash,
+        ...(view.server === undefined ? {} : { server: view.server.id }),
+        ...(view.page === undefined ? {} : { page: view.page }),
+      },
+      view.openedAt,
+    ),
+    title: truncate(`${view.name}: what for?`, 45),
+    components,
+  };
+}
+
+/** What a Submit of the dialog says, read by what its id says it showed. */
+export interface WantSubmit {
+  /** The boxes ticked, of those shown. */
+  ticked: Set<WantBox>;
+  /** The forms ticked in the Which field; undefined where it showed none. */
+  forms: string[] | undefined;
+  /** Costumed ticked; undefined where the dialog did not show Costumes. */
+  costumed: boolean | undefined;
+  remove: boolean;
+}
+
+/**
+ * The fields of a Submit as its id says the dialog showed them; a form of another shape (a field
+ * missing) is out of date: undefined. One box shown is no group, and that box is ticked (S1).
+ */
+export function readWantSubmit(
+  interaction: Pick<ModalSubmitInteraction, 'fields'>,
+  id: WantDialogId,
+): WantSubmit | undefined {
+  const { fields } = interaction;
+  try {
+    const ticked = new Set<WantBox>(
+      id.shown.length === 1
+        ? id.shown
+        : fields
+            .getCheckboxGroup(BOXES_INPUT)
+            .filter((box): box is WantBox => (id.shown as string[]).includes(box)),
+    );
+    let forms: string[] | undefined;
+    if (id.which !== NO_WHICH) {
+      const field = fields.fields.get(FORMS_INPUT);
+      forms = [
+        ...(field?.type === ComponentType.StringSelect
+          ? fields.getStringSelectValues(FORMS_INPUT)
+          : fields.getCheckboxGroup(FORMS_INPUT)),
+      ];
+    }
+    return {
+      ticked,
+      forms,
+      // Costumes not shown: each row keeps its own (A1).
+      costumed: id.costumes ? fields.getCheckbox(COSTUMED_INPUT) : undefined,
+      remove: id.remove && fields.getCheckbox(REMOVE_INPUT),
+    };
+  } catch {
+    return undefined;
+  }
+}
diff --git a/src/commands/notifications/wants.test.ts b/src/commands/notifications/wants.test.ts
index dc59c5d90408cacf26a9b018c7827c2415c831f0..5c0386b432472394af3f25c9297c217f4fad89b9 100644
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -4,7 +4,17 @@ import {
   type APIModalInteractionResponseCallbackData,
 } from 'discord.js';
 import { describe, expect, it, vi } from 'vitest';
-import { dialogChoices, dialogText, shownDialog } from '../../../test/support/dialogs.js';
+import {
+  dialogChoices,
+  dialogField,
+  dialogFields,
+  dialogText,
+  shownDialog,
+} from '../../../test/support/dialogs.js';
+import type { AppContext } from '../../app-context.js';
+import type { SimpleCommand } from '../../discord/command.js';
+import { effectiveBosses } from '../../domain/pogo/raid-bosses.js';
+import { sameRaidTier } from '../../domain/pogo/raid-tier.js';
 import {
   FAKE_GUILD_ID,
   fakeAutocomplete,
@@ -25,6 +35,8 @@ import {
 } from '../../../test/support/messages.js';
 import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { ALICE, BOB } from '../../../test/support/parties.js';
+import { WEST_FORUM } from '../../../test/support/gyms.js';
+import { createdMeetup, reportedMax, reportedRaid } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryWants } from '../../../test/support/wants.js';
 import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
@@ -70,12 +82,17 @@ const OTHER_GUILD = '499999999999999999';
  * lineups unless a test gives them (`lineups`, plan 8R-2): the choices of the Pokémon, tiers and
  * IVs are those of before plan 8R-1, which the rewards of research and the Rocket targets follow.
  */
-function setup(tasks: readonly ResearchTask[] = [], lineups: readonly RocketChoice[] = []) {
+function setup(
+  tasks: readonly ResearchTask[] = [],
+  lineups: readonly RocketChoice[] = [],
+  more: Partial<AppContext> = {},
+) {
   const store = new MemoryWants();
   const { ctx } = createTestContext({
     wants: store,
     researchTasks: researchTasksFixture(tasks),
     rocketLineups: rocketLineupsFixture(lineups),
+    ...more,
   });
   const router = new InteractionRouter(
     ctx,
@@ -142,6 +159,8 @@ describe('the notification commands', () => {
       expect(command.help.examples?.length).toBeGreaterThan(0);
     }
     expect(want.help.details).toContain('every form');
+    expect(want.help.details).toContain('In the post of a raid or a max battle');
+    expect(unwant.help.details).toContain('A Pokémon takes all its forms off with it.');
   });
 
   it('work in a server only, and answer the member alone', async () => {
@@ -161,21 +180,33 @@ describe('/want', () => {
   /** The boxes of a dialog: each box's value, label and whether it is ticked to start with. */
   const boxesOf = (dialog: APIModalInteractionResponseCallbackData) =>
     dialog.components.flatMap((component) => {
-      const inner = (component as { component?: { type?: number; options?: unknown[] } }).component;
-      if (inner?.type !== ComponentType.CheckboxGroup) return [];
+      const inner = (
+        component as { component?: { type?: number; custom_id?: string; options?: unknown[] } }
+      ).component;
+      if (inner?.type !== ComponentType.CheckboxGroup || inner.custom_id !== 'boxes') return [];
       return (inner.options as { value: string; label: string; default?: boolean }[]).map(
         (option) => [option.value, option.label, option.default === true] as const,
       );
     });
-  /** `/want` used by Alice, and its dialog submitted with these boxes ticked. */
-  const wantWith = async (made: ReturnType<typeof setup>, target: string, ticked: string[]) => {
+  /**
+   * `/want` used by Alice, and its dialog submitted with these boxes ticked, and the forms of its
+   * Which field as it opened (or `forms`).
+   */
+  const wantWith = async (
+    made: ReturnType<typeof setup>,
+    target: string,
+    ticked: string[],
+    forms?: string[],
+  ) => {
     const asked = await made.run('want', { target });
     const dialog = shownDialog(asked);
+    const which = dialogFields(dialog).find((field) => field.id === 'forms');
+    const opened = (which?.options ?? []).filter((one) => one.ticked).map((one) => one.value);
     const submitted = await made.handle(
       fakeModal({
         customId: dialog.custom_id,
         form: dialog,
-        checked: { boxes: ticked },
+        checked: { boxes: ticked, ...(which ? { forms: forms ?? opened } : {}) },
         userId: ALICE,
       }),
     );
@@ -192,6 +223,7 @@ describe('/want', () => {
     // Its Submit names the six boxes it shows (B3).
     // Then its per-open token (plan 8X-F).
     expect(dialog.custom_id).toMatch(/^wantbox:p68:set2:1r:0:0:~[0-9a-z]+$/);
+    // A first want: every box that can happen, none ticked (Matt's R-M2).
     expect(boxesOf(dialog)).toEqual([
       ['raids', 'Raids', false],
       ['dynamax', 'Dynamax', false],
@@ -200,7 +232,7 @@ describe('/want', () => {
       ['research', 'Research', false],
       ['shadow', 'Shadow', false],
     ]);
-    // Plan 8X-F (Matt): the Dynamax box says no stars.
+    // Plan 8X-F (Matt): the Dynamax box says no stars (the wording of plan 8R-4's mockups).
     const described = dialog.components.flatMap((component) => {
       const inner = (component as { component?: { type?: number; options?: unknown[] } }).component;
       if (inner?.type !== ComponentType.CheckboxGroup) return [];
@@ -209,17 +241,17 @@ describe('/want', () => {
       );
     });
     expect(described.slice(1, 3)).toEqual([
-      ['dynamax', 'Its Dynamax max battles'],
-      ['gigantamax', 'Its Gigantamax max battles'],
+      ['dynamax', 'Dynamax max battles'],
+      ['gigantamax', 'Gigantamax max battles'],
     ]);
-    // A legendary is met in no spawn and can be no max boss here.
+    // A legendary is met in no spawn, can be no max boss here, and has no Research (plan 8R-4).
     expect(
       boxesOf(shownDialog(await made.run('want', { target: 'Mewtwo' }))).map(([box]) => box),
-    ).toEqual(['raids', 'research', 'shadow']);
+    ).toEqual(['raids', 'shadow']);
     const { said } = await wantWith(made, 'pokemon:68', ['raids', 'gigantamax', 'shadow']);
     expect(said).toBe(
       '**Machamp**: Raids, Gigantamax, Shadow. You will get a DM when one is reported in a region ' +
-        'you can see. `/want` again changes it, `/unwant` takes it off.',
+        'you can see.',
     );
     expect(made.formRows()).toEqual([
       [68, 'raid', null, false],
@@ -255,20 +287,19 @@ describe('/want', () => {
 
   it('answers once for a species: a Submit of the species takes its forms’ rows away (plan 8R-4)', async () => {
     const made = setup();
-    await wantWith(made, 'Alolan Rattata', ['spawns']);
+    await wantWith(made, 'Alolan Rattata', ['spawns'], ['rattata_alola']);
     expect(made.formRows()).toEqual([[19, 'spawn', 'rattata_alola', false]]);
-    await wantWith(made, 'pokemon:19', ['raids']);
+    await wantWith(made, 'pokemon:19', ['raids'], ['rattata', 'rattata_alola']);
     expect(made.formRows()).toEqual([[19, 'raid', null, false]]);
     // Shadow raids picked from the list are the Shadow box of their Pokémon's dialog.
     const shadow = shownDialog(await made.run('want', { target: 'pokemon:645::shadow' }));
-    expect(shadow.title).toBe('Landorus (every form): what for?');
+    expect(shadow.title).toBe('Landorus: what for?');
   });
 
-  it('writes what can only be one thing at once: a mega, IVs, a tier without shadow raids', async () => {
+  it('writes what can only be one thing at once: Mew, IVs, a tier without shadow raids', async () => {
     const made = setup();
-    expect(await made.answer('want', { target: 'mega charizard y' })).toBe(
-      '**Mega Charizard Y**: Raids. You will get a DM when one is reported in a region you can ' +
-        'see. `/want` again changes it, `/unwant` takes it off.',
+    expect(await made.answer('want', { target: 'Mew' })).toBe(
+      '**Mew**: Raids. You will get a DM when one is reported in a region you can see.',
     );
     expect(await made.answer('want', { target: 'tier:Elite' })).toMatch(/^\*\*Elite\*\*: Raids\./);
     expect(await made.answer('want', { target: 'hundo' })).toBe(
@@ -279,7 +310,7 @@ describe('/want', () => {
       'Perfect IV spawns are on your list already. `/unwant` takes them off.',
     );
     expect(made.formRows()).toEqual([
-      [6, 'raid', 'charizard_mega_y', false],
+      [151, 'raid', null, false],
       [-20, 'raid', null, false],
       [-6, 'spawn', null, false],
     ]);
@@ -401,6 +432,32 @@ describe('/want', () => {
     expect(made.formRows()).toEqual([]);
   });
 
+  // Plan 8X-F, "For 8R-4": Discord's client shows what was last submitted under a custom id in
+  // place of what the dialog ticks, so every opening has an id of its own.
+  it('gives every opening of the dialog an id of its own, and a Submit of either writes', async () => {
+    const opened = Date.UTC(2026, 9, 22, 16);
+    vi.useFakeTimers({ toFake: ['Date'], now: opened });
+    try {
+      const made = setup();
+      const first = shownDialog(await made.run('want', { target: 'Dratini' }));
+      vi.setSystemTime(opened + 1000);
+      const second = shownDialog(await made.run('want', { target: 'Dratini' }));
+      expect(second.custom_id).not.toBe(first.custom_id);
+      expect(first.custom_id).toMatch(new RegExp(`:~${opened.toString(36)}$`));
+      await made.handle(
+        fakeModal({
+          customId: first.custom_id,
+          form: first,
+          checked: { boxes: ['raids'] },
+          userId: ALICE,
+        }),
+      );
+      expect(made.formRows()).toEqual([[147, 'raid', null, false]]);
+    } finally {
+      vi.useRealTimers();
+    }
+  });
+
   it('refuses a Submit without its boxes as out of date, and writes nothing (B4)', async () => {
     const made = setup();
     const dialog = shownDialog(await made.run('want', { target: 'Dratini' }));
@@ -430,8 +487,8 @@ describe('/want', () => {
       await router.handle(interaction as never);
       return interaction;
     };
-    // Written at once (a mega, IVs, a reward): a late acknowledgement waits for slow work.
-    await use('mega charizard y');
+    // Written at once (Mew, IVs, a reward): a late acknowledgement waits for slow work.
+    await use('Mew');
     await use('hundo');
     expect(timers).toHaveLength(2);
     for (const ms of timers) expect(ms).toBeLessThanOrEqual(LATE_DEFER_MS);
@@ -497,6 +554,569 @@ describe('/want', () => {
   });
 });
 
+describe('/want: the Pokémon dialog (plan 8R-4)', () => {
+  /** `/want` used by Alice. */
+  const opened = async (made: ReturnType<typeof setup>, target: string) =>
+    shownDialog(await made.run('want', { target }));
+  /** A dialog submitted by Alice with what the test ticks; the private answer. */
+  const submit = async (
+    made: ReturnType<typeof setup>,
+    dialog: APIModalInteractionResponseCallbackData,
+    given: {
+      checked?: Record<string, string[]>;
+      selected?: Record<string, string[]>;
+      ticks?: Record<string, boolean>;
+    },
+  ) => {
+    const submitted = await made.handle(
+      fakeModal({ customId: dialog.custom_id, form: dialog, userId: ALICE, ...given }),
+    );
+    return submitted.editReply.mock.calls.length > 0
+      ? sent(submitted.editReply).content
+      : sent(submitted.reply).content;
+  };
+  const labels = (dialog: APIModalInteractionResponseCallbackData) =>
+    dialogFields(dialog).map((field) => field.label);
+  const ticked = (dialog: APIModalInteractionResponseCallbackData, label: string) =>
+    (dialogField(dialog, label).options ?? []).filter((one) => one.ticked).map((one) => one.value);
+
+  /** The input of a dialog's field by its custom id, as it was drawn. */
+  const inputOf = (dialog: APIModalInteractionResponseCallbackData, id: string) =>
+    dialog.components.flatMap((component) => {
+      const inner = (component as { component?: { custom_id?: string } }).component;
+      return inner?.custom_id === id
+        ? [inner as { custom_id: string; required?: boolean; min_values?: number }]
+        : [];
+    })[0];
+
+  it('opens a first want with nothing ticked, and Submit kept back till one is (Matt’s R-M2)', async () => {
+    const made = setup();
+    const dialog = await opened(made, 'Corsola');
+    expect(ticked(dialog, 'Tell me about')).toEqual([]);
+    expect(inputOf(dialog, 'boxes')).toMatchObject({ required: true, min_values: 1 });
+    expect(ticked(dialog, 'Which Corsola')).toEqual(['corsola', 'corsola_galarian']);
+    expect(inputOf(dialog, 'forms')).toMatchObject({ required: true, min_values: 1 });
+    // Discord lets no Submit through with nothing ticked.
+    expect(() =>
+      fakeModal({ customId: dialog.custom_id, form: dialog, checked: { boxes: [] } }),
+    ).toThrow(/at least 1 of boxes/);
+    await submit(made, dialog, {
+      checked: { boxes: ['raids'], forms: ['corsola', 'corsola_galarian'] },
+    });
+    // Held: nothing ticked may be submitted, and takes it off (Q1).
+    const again = await opened(made, 'Corsola');
+    expect(inputOf(again, 'boxes')).toMatchObject({ required: false, min_values: 0 });
+    expect(inputOf(again, 'forms')).toMatchObject({ required: false, min_values: 0 });
+    expect(
+      await submit(made, again, {
+        checked: { boxes: [], forms: ['corsola', 'corsola_galarian'] },
+      }),
+    ).toBe('**Corsola** is off your list.');
+    // A tier alike.
+    const tier = await opened(made, 't5');
+    expect(ticked(tier, 'Tell me about')).toEqual([]);
+    expect(inputOf(tier, 'boxes')).toMatchObject({ required: true, min_values: 1 });
+  });
+
+  it('asks about a Pokémon of one form with its boxes ticked and Costumes, as the mockup', async () => {
+    const made = setup();
+    const dialog = await opened(made, 'Pikachu');
+    expect(dialog.title).toBe('Pikachu: what for?');
+    expect(dialogText(dialog)).toBe('Tick what you want a DM about, in the regions you can see.');
+    expect(labels(dialog)).toEqual(['Tell me about', 'Only costumed Pikachu']);
+    // A first want: nothing ticked (Matt's R-M2), Costumed off.
+    expect(dialogField(dialog, 'Tell me about').options).toEqual([
+      {
+        value: 'raids',
+        label: 'Raids',
+        description: 'Pikachu raids and their eggs',
+        ticked: false,
+      },
+      { value: 'dynamax', label: 'Dynamax', description: 'Dynamax max battles', ticked: false },
+      {
+        value: 'gigantamax',
+        label: 'Gigantamax',
+        description: 'Gigantamax max battles',
+        ticked: false,
+      },
+      { value: 'spawns', label: 'Spawns', description: 'Wild Pikachu reported', ticked: false },
+      {
+        value: 'research',
+        label: 'Research',
+        description: 'Field research that rewards it',
+        ticked: false,
+      },
+    ]);
+    expect(dialogField(dialog, 'Only costumed Pikachu')).toEqual({
+      label: 'Only costumed Pikachu',
+      description: 'Any costume, now or later. Unticked, costumed ones come too.',
+      id: 'costumed',
+      kind: 'checkbox',
+      ticked: false,
+    });
+    const said = await submit(made, dialog, {
+      checked: { boxes: ['raids', 'gigantamax', 'research'] },
+      ticks: { costumed: true },
+    });
+    expect(said).toBe(
+      '**Costumed Pikachu**: Raids, Gigantamax, Research. You will get a DM when one is ' +
+        'reported in a region you can see.\n' +
+        "-# Costumed Pokémon haven't appeared in max battles or as shadows so far, so " +
+        'Gigantamax stays quiet unless that changes.',
+    );
+    expect(made.formRows()).toEqual([[25, 'raid', null, false]]);
+    expect(made.store.rows[0]?.costumed).toBe(true);
+    // Opened again: as stored, Costumed ticked, and Remove since it is held.
+    const again = await opened(made, 'Pikachu');
+    expect(labels(again)).toEqual([
+      'Tell me about',
+      'Only costumed Pikachu',
+      'Remove Pikachu from my list',
+    ]);
+    expect(dialogField(again, 'Only costumed Pikachu').ticked).toBe(true);
+    expect(ticked(again, 'Tell me about')).toEqual(['raids', 'gigantamax', 'research']);
+  });
+
+  it('builds the largest dialog of five fields: Charizard with its megas, a want held', async () => {
+    const made = setup();
+    made.store.add(ALICE, FAKE_GUILD_ID, 6, 'raid');
+    const dialog = await opened(made, 'Charizard');
+    expect(dialog.components).toHaveLength(5);
+    expect(labels(dialog)).toEqual([
+      'Tell me about',
+      'Which Charizard',
+      'Only costumed ones',
+      'Remove Charizard from my list',
+    ]);
+    expect(dialogText(dialog)).toBe(
+      'Tick what you want a DM about, in the regions you can see. A mega is told for raids only.',
+    );
+    // A Which field: the boxes have no descriptions (the mockup's), the forms are by name.
+    expect(dialogField(dialog, 'Tell me about').options?.[0]).toEqual({
+      value: 'raids',
+      label: 'Raids',
+      ticked: true,
+    });
+    expect(dialogField(dialog, 'Which Charizard')).toMatchObject({
+      kind: 'group',
+      options: [
+        { value: 'charizard', label: 'Charizard', ticked: true },
+        { value: 'charizard_mega_x', label: 'Mega Charizard X', ticked: true },
+        { value: 'charizard_mega_y', label: 'Mega Charizard Y', ticked: true },
+      ],
+    });
+    expect(dialogField(dialog, 'Only costumed ones').description).toBe(
+      'Of the forms ticked, any costume, now or later.',
+    );
+    expect(dialogField(dialog, 'Remove Charizard from my list')).toMatchObject({
+      description: 'Ticked, Submit removes it, whatever else is ticked.',
+      id: 'remove',
+      ticked: false,
+    });
+  });
+
+  it('writes every form ticked, a mega for raids only, and says so of a mega without Raids', async () => {
+    const made = setup();
+    const dialog = await opened(made, 'Charizard');
+    const said = await submit(made, dialog, {
+      checked: { boxes: ['spawns', 'research'], forms: ['charizard', 'charizard_mega_y'] },
+    });
+    expect(said).toBe(
+      '**Charizard**: Spawns, Research. You will get a DM when one is reported in a region ' +
+        'you can see.\n-# Mega Charizard Y is told for raids only: it is off your list ' +
+        'without Raids.',
+    );
+    expect(made.formRows()).toEqual([[6, 'spawn', 'charizard', false]]);
+  });
+
+  it('opens a species picked as a form with that form alone ticked, and a mega no longer at once', async () => {
+    const made = setup();
+    const corsola = await opened(made, 'Galarian Corsola');
+    expect(corsola.title).toBe('Corsola: what for?');
+    expect(ticked(corsola, 'Which Corsola')).toEqual(['corsola_galarian']);
+    const mega = await opened(made, 'mega charizard y');
+    expect(ticked(mega, 'Which Charizard')).toEqual(['charizard_mega_y']);
+    // Every form ticked is the species row.
+    await submit(made, corsola, {
+      checked: { boxes: ['raids'], forms: ['corsola', 'corsola_galarian'] },
+    });
+    expect(made.formRows()).toEqual([[222, 'raid', null, false]]);
+  });
+
+  it('opens with the member’s rows, says when they differ by form, and Remove takes them all', async () => {
+    const made = setup();
+    made.store.add(ALICE, FAKE_GUILD_ID, 77, 'raid');
+    made.store.add(ALICE, FAKE_GUILD_ID, 77, 'spawn', { form: 'ponyta_galarian' });
+    const dialog = await opened(made, 'Ponyta');
+    expect(dialogText(dialog)).toBe(
+      'Tick what you want a DM about, in the regions you can see. Your Ponyta wants differ by ' +
+        'form; Submit sets them alike.',
+    );
+    expect(ticked(dialog, 'Which Ponyta')).toEqual(['ponyta', 'ponyta_galarian']);
+    expect(ticked(dialog, 'Tell me about')).toEqual(['raids', 'spawns']);
+    expect(
+      await submit(made, dialog, {
+        checked: { boxes: ['raids'], forms: ['ponyta'] },
+        ticks: { remove: true },
+      }),
+    ).toBe('**Ponyta** is off your list.');
+    expect(made.formRows()).toEqual([]);
+  });
+
+  it('asks about the forms of a Pokémon told for raids alone in a dropdown, with no boxes', async () => {
+    const made = setup();
+    const dialog = await opened(made, 'Arceus');
+    expect(dialogText(dialog)).toBe(
+      'Arceus is told for raids, in the regions you can see. Pick the forms you want.',
+    );
+    expect(labels(dialog)).toEqual(['Which Arceus']);
+    const which = dialogField(dialog, 'Which Arceus');
+    expect(which.kind).toBe('select');
+    expect(which.options).toHaveLength(18);
+    expect(
+      await submit(made, dialog, {
+        selected: { forms: ['arceus', 'arceus_dragon', 'arceus_fire'] },
+      }),
+    ).toBe(
+      '**Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)**: Raids. You will get a DM when one ' +
+        'is reported in a region you can see.',
+    );
+    expect(made.formRows().map((row) => row[2])).toEqual([
+      'arceus',
+      'arceus_dragon',
+      'arceus_fire',
+    ]);
+    // None picked takes it off.
+    await submit(made, await opened(made, 'Arceus'), { selected: { forms: [] } });
+    expect(made.formRows()).toEqual([]);
+  });
+
+  it('hides Research of a legendary unless today’s tasks reward it or the member holds it', async () => {
+    const made = setup();
+    const shownBoxes = (dialog: APIModalInteractionResponseCallbackData) =>
+      (dialogField(dialog, 'Tell me about').options ?? []).map((one) => one.value);
+    const mewtwo = await opened(made, 'Mewtwo');
+    expect(shownBoxes(mewtwo)).toEqual(['raids', 'shadow']);
+    expect(ticked(mewtwo, 'Which Mewtwo')).toEqual([
+      'mewtwo',
+      'mewtwo_a',
+      'mewtwo_mega_x',
+      'mewtwo_mega_y',
+    ]);
+    await made.ctx.targetWants.change(
+      ALICE,
+      FAKE_GUILD_ID,
+      { add: [boxTarget('research-pokemon', 150)], remove: [] },
+      0,
+    );
+    const held = await opened(made, 'Mewtwo');
+    expect(ticked(held, 'Tell me about')).toEqual(['research']);
+    // Rewarded by a task of today's list: shown (A9).
+    const task = pageTask('Catch 10 Pokémon');
+    const rewarded = setup([
+      {
+        ...task,
+        rewards: [
+          {
+            kind: 'encounter',
+            name: 'Mewtwo',
+            key: 'mewtwo',
+            dex: 150,
+            shiny: false,
+            cp: null,
+            image: null,
+          },
+        ],
+      },
+    ]);
+    expect(shownBoxes(await opened(rewarded, 'Mewtwo'))).toEqual(['raids', 'research', 'shadow']);
+  });
+
+  it('shows Costumes where a row held is costumed, and keeps it where Costumes is not shown (A1)', async () => {
+    const made = setup();
+    made.store.add(ALICE, FAKE_GUILD_ID, 147, 'raid', { costumed: true });
+    const dialog = await opened(made, 'Dratini');
+    expect(dialogField(dialog, 'Only costumed Dratini').ticked).toBe(true);
+    // Written at once (one box, nothing else to ask): the costume stays.
+    made.store.add(ALICE, FAKE_GUILD_ID, 151, 'raid', { costumed: true });
+    expect(await made.answer('want', { target: 'Mew' })).toMatch(/^\*\*Costumed Mew\*\*: Raids\./);
+    expect(made.store.rows.find((row) => row.pokemon === 151)?.costumed).toBe(true);
+  });
+
+  it('describes its option as a Pokémon or the boss of the post it is used in (F4)', () => {
+    const [option] = want.data.toJSON().options ?? [];
+    expect(option?.description).toBe(
+      'A Pokémon, tier, IVs, item, grunt or leader; leave it out in a raid or max post for its boss',
+    );
+  });
+
+  it('leaves a mega’s plain row out of Costumed and of rows that differ (A3, A-D3)', async () => {
+    const made = setup();
+    made.store.add(ALICE, FAKE_GUILD_ID, 6, 'both', { form: 'charizard', costumed: true });
+    made.store.add(ALICE, FAKE_GUILD_ID, 6, 'raid', { form: 'charizard_mega_x' });
+    const dialog = await opened(made, 'Charizard');
+    expect(dialogField(dialog, 'Only costumed ones').ticked).toBe(true);
+    expect(dialogText(dialog)).not.toContain('differ');
+  });
+
+  it('leaves the species’ Mega Energy research want, a line of its own, on Remove (A-D4)', async () => {
+    const made = setup();
+    made.store.add(ALICE, FAKE_GUILD_ID, 6, 'raid');
+    await made.ctx.targetWants.change(
+      ALICE,
+      FAKE_GUILD_ID,
+      { add: [{ kind: 'research-energy', dex: 6 }], remove: [] },
+      0,
+    );
+    const dialog = await opened(made, 'Charizard');
+    expect(await submit(made, dialog, { ticks: { remove: true } })).toBe(
+      '**Charizard** is off your list.',
+    );
+    expect(made.formRows()).toEqual([]);
+    expect((await made.ctx.targetWants.list(ALICE, FAKE_GUILD_ID)).wants).toEqual([
+      { kind: 'research-energy', dex: 6 },
+    ]);
+  });
+
+  it('decides once per use whether the dialog opens (A8)', async () => {
+    // The raid boss list has Mew costumed until the router has asked whether a dialog opens.
+    let asked = false;
+    const costumedMew = effectiveBosses(
+      [
+        {
+          pokemonId: 'MEW',
+          form: null,
+          tier: { level: 'T5', shadow: false },
+          shiny: false,
+          name: 'Mew wearing a party hat',
+        },
+      ],
+      [],
+      catalogueFixture(),
+      Date.now(),
+    );
+    const made = setup([], [], {
+      raidBosses: {
+        bosses: () => (asked ? [] : costumedMew),
+        bossesOf: () => [],
+        autoset: () => undefined,
+      },
+    });
+    const defer = want.defer;
+    if (typeof defer !== 'function') throw new Error('/want defers by a function');
+    const deferring: SimpleCommand = {
+      ...want,
+      defer: (interaction, ctx) => {
+        const deferred = defer(interaction, ctx);
+        asked = true;
+        return deferred;
+      },
+    };
+    const router = new InteractionRouter(made.ctx, [deferring], []);
+    const used = fakeChatInput({ commandName: 'want', userId: ALICE, options: { target: 'Mew' } });
+    await router.handle(used as never);
+    expect(asked).toBe(true);
+    expect(shownDialog(used).title).toBe('Mew: what for?');
+  });
+
+  it('writes a Pokémon of one box and no other field at once, as before', async () => {
+    const made = setup();
+    expect(await made.answer('want', { target: 'Mew' })).toBe(
+      '**Mew**: Raids. You will get a DM when one is reported in a region you can see.',
+    );
+    expect(made.formRows()).toEqual([[151, 'raid', null, false]]);
+  });
+
+  it('shows Costumes for a costume the raid boss list has before the game data does', async () => {
+    const catalogue = catalogueFixture();
+    const feed = [
+      {
+        pokemonId: 'ZUBAT',
+        form: null,
+        tier: { level: 'T1', shadow: false },
+        shiny: false,
+        name: 'Zubat wearing a top hat',
+      },
+    ] as const;
+    const bosses = () =>
+      effectiveBosses(
+        feed.map((boss) => ({ ...boss, tier: { ...boss.tier } })),
+        [],
+        catalogue,
+        Date.now(),
+      );
+    const made = setup([], [], {
+      raidBosses: {
+        bosses,
+        bossesOf: (tier) => bosses().filter((boss) => sameRaidTier(boss.tier, tier)),
+        autoset: () => undefined,
+      },
+    });
+    expect(labels(await opened(made, 'Zubat'))).toContain('Only costumed Zubat');
+    expect(labels(await opened(setup(), 'Zubat'))).not.toContain('Only costumed Zubat');
+  });
+
+  it('keeps Unown’s letters apart: no Which field, a letter’s own dialog', async () => {
+    const made = setup();
+    const unown = await opened(made, 'Unown');
+    expect(labels(unown)).not.toContain('Which Unown');
+    await submit(made, unown, { checked: { boxes: ['spawns'] } });
+    const letter = await opened(made, 'pokemon:201:unown_a');
+    expect(letter.title).toBe('Unown (A): what for?');
+    await submit(made, letter, { checked: { boxes: ['raids'] } });
+    expect(made.formRows()).toEqual([
+      [201, 'spawn', null, false],
+      [201, 'raid', 'unown_a', false],
+    ]);
+  });
+
+  it('refuses a Submit whose Which hash is not that of the forms the game data has now (review R5)', async () => {
+    const made = setup();
+    const dialog = await opened(made, 'Corsola');
+    const forged = dialog.custom_id.replace(/:set2:([^:]+):([^:]+):[^:]+/, ':set2:$1:$2:zzzz');
+    const submitted = await made.handle(
+      fakeModal({
+        customId: forged,
+        form: dialog,
+        checked: { boxes: ['raids'], forms: ['corsola'] },
+        userId: ALICE,
+      }),
+    );
+    expect(sent(submitted.reply).content).toBe(STALE_COMPONENT);
+    expect(made.formRows()).toEqual([]);
+  });
+});
+
+describe('/want in the post of a raid or a max battle (plan 8R-4, Matt’s R-M1)', () => {
+  const ticked = (dialog: APIModalInteractionResponseCallbackData, label: string) =>
+    (dialogField(dialog, label).options ?? []).filter((one) => one.ticked).map((one) => one.value);
+  const inPost = (postId: string) => ({ channelId: postId, thread: { parentId: WEST_FORUM } });
+
+  it('wants the raid’s boss with nothing typed, Raids alone ticked; a Pokémon typed alike', async () => {
+    const raid = await reportedRaid({
+      boss: { key: 'machamp' },
+      tier: { level: 'T3', shadow: false },
+    });
+    const made = setup([], [], { parties: raid.store, regions: raid.regions });
+    const post = inPost(raid.postId);
+    const dialog = shownDialog(await made.run('want', {}, post));
+    expect(dialog.title).toBe('Machamp: what for?');
+    expect(ticked(dialog, 'Tell me about')).toEqual(['raids']);
+    const typed = shownDialog(await made.run('want', { target: 'Dratini' }, post));
+    expect(ticked(typed, 'Tell me about')).toEqual(['raids']);
+    // With a want held: the member's rows as stored, and the post's box beside them.
+    made.store.add(ALICE, FAKE_GUILD_ID, 68, 'spawn');
+    const held = shownDialog(await made.run('want', {}, post));
+    expect(ticked(held, 'Tell me about')).toEqual(['raids', 'spawns']);
+    expect(dialogFields(held).map((field) => field.label)).toContain('Remove Machamp from my list');
+  });
+
+  it('ticks Shadow in the post of a shadow raid, and the egg’s tier where there is no boss yet', async () => {
+    const shadow = await reportedRaid({
+      boss: { key: 'machamp' },
+      tier: { level: 'T3', shadow: true },
+    });
+    const inShadow = setup([], [], { parties: shadow.store, regions: shadow.regions });
+    const dialog = shownDialog(await inShadow.run('want', {}, inPost(shadow.postId)));
+    expect(ticked(dialog, 'Tell me about')).toEqual(['shadow']);
+    const egg = await reportedRaid();
+    const made = setup([], [], { parties: egg.store, regions: egg.regions });
+    const tier = shownDialog(await made.run('want', {}, inPost(egg.postId)));
+    expect(tier.title).toBe('T5: what for?');
+    expect(ticked(tier, 'Tell me about')).toEqual(['raids']);
+  });
+
+  it('wants a max battle’s boss with only its kind ticked: Dynamax, or Gigantamax', async () => {
+    const max = await reportedMax();
+    const made = setup([], [], { parties: max.store, regions: max.regions });
+    const dialog = shownDialog(await made.run('want', {}, inPost(max.postId)));
+    expect(dialog.title).toBe('Machamp: what for?');
+    expect(ticked(dialog, 'Tell me about')).toEqual(['dynamax']);
+    const giant = await reportedMax({ tier: 'G' });
+    const inGiant = setup([], [], { parties: giant.store, regions: giant.regions });
+    const typed = shownDialog(
+      await inGiant.run('want', { target: 'Pikachu' }, inPost(giant.postId)),
+    );
+    expect(ticked(typed, 'Tell me about')).toEqual(['gigantamax']);
+  });
+
+  it('needs a Pokémon anywhere else: a region’s channel, a meetup’s post', async () => {
+    const said =
+      'Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it ' +
+      'out for its boss.';
+    const made = setup();
+    const used = await made.run('want');
+    expect(used.showModal).not.toHaveBeenCalled();
+    expect(answered(used).content).toBe(said);
+    const meetup = await createdMeetup();
+    const inMeetup = setup([], [], { parties: meetup.store, regions: meetup.regions });
+    expect(answered(await inMeetup.run('want', {}, inPost(meetup.postId))).content).toBe(said);
+    expect(made.store.rows).toEqual([]);
+  });
+
+  it('ticks Shadow raids in the post of a shadow egg', async () => {
+    const egg = await reportedRaid({ tier: { level: 'T5', shadow: true } });
+    const made = setup([], [], { parties: egg.store, regions: egg.regions });
+    const dialog = shownDialog(await made.run('want', {}, inPost(egg.postId)));
+    expect(dialog.title).toBe('T5: what for?');
+    expect(ticked(dialog, 'Tell me about')).toEqual(['shadow-raids']);
+  });
+
+  it('refuses a raid’s boss the game data does not know, and names the tier to want (Matt’s Q1)', async () => {
+    const raid = await reportedRaid({
+      boss: { name: 'Mysterymon' },
+      tier: { level: 'T3', shadow: false },
+    });
+    const made = setup([], [], { parties: raid.store, regions: raid.regions });
+    const used = await made.run('want', {}, inPost(raid.postId));
+    expect(used.showModal).not.toHaveBeenCalled();
+    expect(answered(used).content).toBe(
+      "Pine doesn't know this raid's boss yet: name a Pokémon, or `/want t3` for the tier.",
+    );
+    // The command it names is the tier's.
+    const tier = shownDialog(await made.run('want', { target: 't3' }, inPost(raid.postId)));
+    expect(tier.title).toBe('T3: what for?');
+    expect(made.store.rows).toEqual([]);
+  });
+
+  it('refuses a max battle’s boss the game data does not know (F1)', async () => {
+    const max = await reportedMax({ boss: { name: 'Mysterymon' } });
+    const made = setup([], [], { parties: max.store, regions: max.regions });
+    const used = await made.run('want', {}, inPost(max.postId));
+    expect(used.showModal).not.toHaveBeenCalled();
+    expect(answered(used).content).toBe(
+      "Pine doesn't know this battle's boss yet: name a Pokémon.",
+    );
+  });
+
+  it('does not count a use it refuses for what it names against the limit (F2)', async () => {
+    const made = setup();
+    for (let n = 0; n < NOTIFICATION_THROTTLE.uses; n++) {
+      expect(answered(await made.run('want')).content).toMatch(/^Name a Pokémon/);
+      expect(answered(await made.run('want', { target: 'zzqqxxv' })).content).toMatch(
+        /^I do not know/,
+      );
+    }
+    expect(await made.answer('want', { target: 'iv:perfect' })).toMatch(/^You will get a DM/);
+  });
+});
+
+describe('/unwant: a form under a species want (plan 8R-4, R4e)', () => {
+  it('removes nothing of a species row for one of its forms, and says what covers it', async () => {
+    const made = setup();
+    made.store.add(ALICE, FAKE_GUILD_ID, 222, 'raid');
+    expect(await made.answer('unwant', { target: 'Galarian Corsola' })).toBe(
+      'Your **Corsola** want covers **Galarian Corsola**. `/want corsola` changes which forms.',
+    );
+    expect(made.formRows()).toEqual([[222, 'raid', null, false]]);
+    made.store.add(ALICE, FAKE_GUILD_ID, 222, 'spawn', { form: 'corsola_galarian' });
+    expect(await made.answer('unwant', { target: 'Galarian Corsola' })).toBe(
+      '**Galarian Corsola** is off your list.',
+    );
+    expect(made.formRows()).toEqual([[222, 'raid', null, false]]);
+  });
+});
+
 describe('/want: Team GO Rocket (plan 8R-2)', () => {
   it('wants a grunt type, a leader, any leader, Giovanni and the decoy at once, by choice or name', async () => {
     const made = setup([], rocketChoicesOfFeed());
@@ -1057,17 +1677,15 @@ describe('/want: the list of choices', () => {
         titles.push(shownDialog(await made.run('want', { target: String(choice.value) })).title);
       }
     }
-    expect(titles).toEqual([
-      'Tyranitar (base form): what for?',
-      'Giratina (every form): what for?',
-    ]);
+    // A form opens its species' dialog with that form ticked (plan 8R-4).
+    expect(titles).toEqual(['Tyranitar: what for?', 'Giratina: what for?']);
   });
 
   it('reads the words of a label that are sent without picking, and nothing looser', async () => {
     const made = setup();
     const title = async (target: string) => shownDialog(await made.run('want', { target })).title;
-    expect(await title('giratina every form')).toBe('Giratina (every form): what for?');
-    expect(await title('tyranitar base form')).toBe('Tyranitar (base form): what for?');
+    expect(await title('giratina every form')).toBe('Giratina: what for?');
+    expect(await title('tyranitar base form')).toBe('Tyranitar: what for?');
     // Half a label is offered by the list, but never acted on.
     expect(await made.answer('want', { target: 'tyranitar base' })).toContain(
       'I do not know "tyranitar base"',
@@ -1096,13 +1714,16 @@ describe('/want: the list of choices', () => {
     const offered = await made.choices('want', 'gira');
     const titles: string[] = [];
     for (const choice of offered) {
-      titles.push(shownDialog(await made.run('want', { target: String(choice.value) })).title);
+      const dialog = shownDialog(await made.run('want', { target: String(choice.value) }));
+      const which = dialogFields(dialog).find((field) => field.id === 'forms');
+      const ticked = (which?.options ?? []).filter((one) => one.ticked).map((one) => one.value);
+      titles.push(`${dialog.title} ${ticked.join(',')}`.trim());
     }
-    // Giratina, a legendary, before Girafarig.
+    // Giratina, a legendary, before Girafarig; a form is its species' dialog, that form ticked.
     expect(titles).toEqual([
-      'Giratina (every form): what for?',
-      'Giratina (Altered Forme): what for?',
-      'Giratina (Origin Forme): what for?',
+      'Giratina: what for? giratina_altered,giratina_origin',
+      'Giratina: what for? giratina_altered',
+      'Giratina: what for? giratina_origin',
       'Girafarig: what for?',
     ]);
   });
diff --git a/src/commands/notifications/wants.ts b/src/commands/notifications/wants.ts
index ff280ae77422eead2e271582ce5320ae2061d6b4..a24ff8e314fe3ad0b9a59a1ffed705431c61e888 100644
--- a/src/commands/notifications/wants.ts
+++ b/src/commands/notifications/wants.ts
@@ -1,25 +1,31 @@
 import {
-  ComponentType,
   SlashCommandBuilder,
   type APIModalInteractionResponseCallbackData,
   type ChatInputCommandInteraction,
   type ModalSubmitInteraction,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
-import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
+import type { ComponentHandler, Guard, SimpleCommand } from '../../discord/command.js';
 import { deferSubmit, readInTime } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
-import { guildIdOf, requireGuild } from '../../discord/guards.js';
+import { guildIdOf, partyOf, requireGuild } from '../../discord/guards.js';
+import { isBattle, isMax, isRaid, type Party } from '../../domain/party/party.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import type { Want } from '../../domain/pogo/notification-target.js';
 import { raidTierLabel } from '../../domain/pogo/raid-tier.js';
-import { boxesOf, removalAnswer, type BoxAnswer } from '../../domain/pogo/species-answer.js';
 import {
-  BOX_DESCRIPTIONS,
+  allCostumed,
+  boxesOf,
+  removalAnswer,
+  whichHash,
+  type BoxAnswer,
+  type HeldRow,
+} from '../../domain/pogo/species-answer.js';
+import {
   BOX_WORDS,
+  baseTarget,
   rocketTargetLabel,
   type BoxSubject,
-  type PokemonBox,
   type WantBox,
 } from '../../domain/pogo/want-boxes.js';
 import { hasForms, type SetWantOutcome } from '../../domain/pogo/wants.js';
@@ -28,30 +34,38 @@ import type { TargetWant } from '../../domain/notify/target-wants.js';
 import { stopArgs, type NotifyReason } from '../../domain/notify/reasons.js';
 import { renderMemberList } from '../../render/member-list.js';
 import { count, plain, truncate } from '../../render/text.js';
-import { textDisplay } from '../../render/v2.js';
 import { memberListControls } from './list-controls.js';
 import { CHOICE_NAME, MAX_CHOICES, beginningFirst, type Choice } from '../choices.js';
 import { removeAllQuestion } from './remove-all.js';
 import { NOTIFICATION_THROTTLE, notificationsEnabled } from './shared.js';
 import {
   boxWords,
+  costumesShown,
+  dialogBoxes,
+  dialogName,
+  dialogSubject,
+  isMegaForm,
   readWanted,
   rewardLabel,
   rewardWantChoices,
   rocketWantChoices,
+  rowsLabel,
   scopeOf,
   shownBoxes,
   subjectLabel,
   wantEntries,
+  whichEntries,
+  whichHashOf,
   type Wanted,
   type WantEntry,
 } from './want-boxes.js';
 import {
-  NO_WHICH,
   readWantDialogId,
-  wantDialogId,
+  readWantSubmit,
+  wantDialog,
   WANT_BOX_KIND,
   type WantDialogId,
+  type WantDialogView,
 } from './want-dialog.js';
 import { wantChoices, wantLabel, wantName } from './want-input.js';
 import { answer, v2Answer } from '../../discord/late-reply.js';
@@ -99,90 +113,178 @@ function ivAnswer(ctx: AppContext, outcome: SetWantOutcome): string {
   return `${promise(ctx, outcome.want)} \`/unwant\` takes them off again.`;
 }
 
-/** The checkbox group of the dialog. */
-const BOXES_INPUT = 'boxes';
-
 /** How many places of a full list of `/want`'s choices go to research rewards at most (B5). */
 const REWARD_ROOM = 5;
 
-/** What a tier's boxes say under their names. */
-function tierDescriptions(level: string): Record<'raids' | 'shadow-raids', string> {
-  return {
-    raids: `${level} raids and their eggs`,
-    'shadow-raids': `Shadow ${level} raids and their eggs`,
-  };
+/**
+ * The boxes no costumed Pokémon has appeared in so far (design 3): Costumed ticked with one of
+ * them is said in small print, never refused, so that a later costumed shadow or max boss is told.
+ */
+export const NEVER_COSTUMED_YET: readonly WantBox[] = ['dynamax', 'gigantamax', 'shadow'];
+
+/** Words of a list: `A`, `A and B`, `A, B and C`. */
+function listWords(words: readonly string[]): string {
+  if (words.length < 2) return words.join('');
+  return `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`;
+}
+
+/** The boxes in the order a line names them. */
+const ANSWER_ORDER: readonly WantBox[] = [
+  'raids',
+  'dynamax',
+  'gigantamax',
+  'spawns',
+  'research',
+  'shadow',
+  'shadow-raids',
+];
+
+/**
+ * What `/want` and the dialog say after a change (design 3, mockup 5): the want as `/wants` names
+ * it with its boxes, or that it is off the list; in small print where Costumed meets a box that
+ * has never had costumes (`NEVER_COSTUMED_YET`) and a mega ticked without Raids, which is off.
+ */
+function boxesAnswer(
+  ctx: AppContext,
+  subject: BoxSubject,
+  after: readonly HeldRow[],
+  given?: BoxAnswer,
+): string {
+  const notes: string[] = [];
+  const dropped = (given?.remove === true ? [] : (given?.forms ?? [])).filter(
+    (form): form is string =>
+      form !== undefined &&
+      ctx.gameData.catalogue.byKey(form)?.kind === 'mega' &&
+      !after.some((row) => row.form === form),
+  );
+  if (dropped.length > 0) {
+    const names = dropped.map((form) => plain(ctx.gameData.catalogue.byKey(form)?.name ?? form));
+    notes.push(
+      dropped.length === 1
+        ? `-# ${names.join('')} is told for raids only: it is off your list without Raids.`
+        : `-# ${listWords(names)} are told for raids only: they are off your list without Raids.`,
+    );
+  }
+  if (after.length === 0) {
+    return [`**${plain(dialogName(ctx, subject))}** is off your list.`, ...notes].join('\n');
+  }
+  const held = boxesOf(after);
+  const boxes = ANSWER_ORDER.filter((box) => held.has(box));
+  const costumed = allCostumed(after, isMegaForm(ctx));
+  const quiet = costumed ? NEVER_COSTUMED_YET.filter((box) => held.has(box)) : [];
+  if (quiet.length > 0) {
+    notes.unshift(
+      "-# Costumed Pokémon haven't appeared in max battles or as shadows so far, so " +
+        `${listWords(quiet.map((box) => BOX_WORDS[box]))} ${quiet.length === 1 ? 'stays' : 'stay'} ` +
+        'quiet unless that changes.',
+    );
+  }
+  return [
+    `**${plain(rowsLabel(ctx, subject, after))}**: ${boxWords(boxes)}. You will get a DM when ` +
+      'one is reported in a region you can see.',
+    ...notes,
+  ].join('\n');
 }
 
 /**
- * The dialog of `/want` (design 7; Matt's answers 2 and 9): "Dratini: what for?", a text that
- * says that nothing ticked takes it off, and one checkbox group of the boxes that can happen,
- * ticked as the member's rows have them (`held`). Its Submit is `wantbox:…:set`.
+ * The dialog of a subject for a member (design 3): the boxes, Which, Costumes and Remove that
+ * show, ticked as their rows are (`held`) with the post's box beside them (`postBox`, R-M1); for
+ * a first want every form (or the one picked), Costumed off, and no box but the post's (Matt's
+ * R-M2: outside a post nothing, and Submit waits till one is ticked). Costumes shows also where a
+ * row held is costumed (A1), so that a Submit never drops it unseen.
  */
-export function wantDialog(
+export function wantDialogFor(
   ctx: AppContext,
   subject: BoxSubject,
-  shown: readonly WantBox[],
-  held: ReadonlySet<WantBox>,
+  held: readonly HeldRow[],
+  options: {
+    /** When it opens (its id's per-open token, plan 8X-F). */
+    openedAt: number;
+    picked?: string;
+    /** The box of the battle of the post `/want` was used in (R-M1), ticked where shown. */
+    postBox?: WantBox;
+    server?: { id: string; name: string };
+    page?: number;
+  },
 ): APIModalInteractionResponseCallbackData {
-  const label = subjectLabel(ctx, subject);
-  const id: WantDialogId = {
+  const which = whichEntries(ctx, subject);
+  const keys = which.map((entry) => entry.key);
+  const shown = dialogBoxes(ctx, subject, held);
+  const isMega = isMegaForm(ctx);
+  const post =
+    options.postBox !== undefined && shown.includes(options.postBox) ? [options.postBox] : [];
+  let ticks: WantDialogView['ticks'];
+  if (held.length === 0) {
+    ticks = {
+      boxes: new Set(post),
+      forms: new Set(options.picked === undefined ? keys : [options.picked]),
+      costumed: false,
+    };
+  } else {
+    const forms = held.some((row) => row.form === undefined)
+      ? keys
+      : held.flatMap((row) => (row.form === undefined ? [] : [row.form]));
+    ticks = {
+      boxes: new Set([...[...boxesOf(held)].filter((box) => shown.includes(box)), ...post]),
+      forms: new Set([...forms, ...(options.picked === undefined ? [] : [options.picked])]),
+      // Costumed only where every row is (review R6: a wrong narrowing loses DMs); a mega's row
+      // is always plain and counts for nothing (A-D3).
+      costumed: allCostumed(held, isMega),
+    };
+  }
+  // A mega's row is Raids only and plain: it differs from no other by that (A3).
+  const own = held.filter((row) => row.form === undefined || !isMega(row.form));
+  const first = own[0];
+  const differ =
+    first !== undefined &&
+    own.some(
+      (row) =>
+        row.costumed !== first.costumed ||
+        boxWords([...row.boxes].sort()) !== boxWords([...first.boxes].sort()),
+    );
+  return wantDialog({
     subject,
-    shown: [...shown],
-    costumes: false,
-    remove: false,
-    which: NO_WHICH,
-  };
-  const describe = (box: WantBox): string =>
-    subject.kind === 'tier'
-      ? tierDescriptions(label)[box === 'shadow-raids' ? 'shadow-raids' : 'raids']
-      : BOX_DESCRIPTIONS[box as PokemonBox];
-  return {
-    custom_id: wantDialogId(id, Date.now()),
-    title: truncate(`${label}: what for?`, 45),
-    components: [
-      textDisplay(
-        'Tick what you want a DM about, in the regions you can see. Nothing ticked takes it off ' +
-          'your list.',
-      ),
-      {
-        type: ComponentType.Label,
-        label: 'Tell me about',
-        component: {
-          type: ComponentType.CheckboxGroup,
-          custom_id: BOXES_INPUT,
-          required: false,
-          min_values: 0,
-          max_values: shown.length,
-          options: shown.map((box) => ({
-            label: BOX_WORDS[box],
-            value: box,
-            description: truncate(describe(box), 100),
-            ...(held.has(box) ? { default: true } : {}),
-          })),
-        },
-      },
-    ],
-  };
+    name: dialogName(ctx, subject),
+    shown,
+    which: which.map((entry) => ({ key: entry.key, name: entry.name })),
+    whichHash: whichHash(keys),
+    costumes: costumesShown(ctx, subject) || held.some((row) => row.costumed),
+    remove: held.length > 0,
+    ticks,
+    differ,
+    ...(options.server === undefined ? {} : { server: options.server }),
+    ...(options.page === undefined ? {} : { page: options.page }),
+    openedAt: options.openedAt,
+  });
 }
 
-/** What `/want` and the dialog say of a subject's boxes after a change. */
-function boxesAnswer(ctx: AppContext, subject: BoxSubject, after: ReadonlySet<WantBox>): string {
-  const name = plain(subjectLabel(ctx, subject));
-  if (after.size === 0) return `**${name}** is off your list.`;
-  const order: WantBox[] = [
-    'raids',
-    'dynamax',
-    'gigantamax',
-    'spawns',
-    'research',
-    'shadow',
-    'shadow-raids',
-  ];
-  const boxes = order.filter((box) => after.has(box));
-  return (
-    `**${name}**: ${boxWords(boxes)}. You will get a DM when one is reported in a region you can ` +
-    'see. `/want` again changes it, `/unwant` takes it off.'
-  );
+/**
+ * The answer a Submit gives, from its id and fields (`readWantSubmit`): a Which field read as its
+ * forms, every form ticked as the species row; out of date (`STALE_COMPONENT`) where the Which
+ * field the game data shows now is another (review R5) or a field is missing.
+ */
+export function answerOfSubmit(
+  ctx: AppContext,
+  interaction: Pick<ModalSubmitInteraction, 'fields'>,
+  id: WantDialogId,
+): BoxAnswer {
+  if (id.which !== whichHashOf(ctx, id.subject)) throw new UserError(STALE_COMPONENT);
+  const read = readWantSubmit(interaction, id);
+  if (!read) throw new UserError(STALE_COMPONENT);
+  const keys = whichEntries(ctx, id.subject).map((entry) => entry.key);
+  let forms: (string | undefined)[] = [undefined];
+  if (read.forms !== undefined) {
+    const picked = keys.filter((key) => read.forms?.includes(key));
+    forms = picked.length === keys.length ? [undefined] : picked;
+  }
+  return {
+    scope: scopeOf(ctx, id.subject),
+    forms,
+    ticked: read.ticked,
+    shown: id.shown,
+    costumed: read.costumed,
+    remove: read.remove,
+  };
 }
 
 /** What `/want` says of a research reward it added. */
@@ -213,25 +315,126 @@ function rocketWantAnswer(target: TargetWant): string {
   );
 }
 
-/** What a use of `/want` names, read once per interaction (its deferral reads it first). */
-const wantedRead = new WeakMap<object, Wanted>();
+/** What `/want` answers where nothing is typed outside the post of a raid or max battle (R-M1). */
+export const NAME_A_POKEMON =
+  'Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it ' +
+  'out for its boss.';
+
+/**
+ * What a use of `/want` is about, read once per interaction (A8: its deferral and `execute`
+ * decide alike): what it names; for a Pokémon or a tier its dialog's subject, the form picked,
+ * whether the dialog opens (`asks`), and the box of the post's battle (R-M1).
+ */
+interface WantUse {
+  wanted: Wanted;
+  subject?: BoxSubject;
+  picked?: string;
+  postBox?: WantBox;
+  asks: boolean;
+}
+
+const usesRead = new WeakMap<object, WantUse>();
+
+/**
+ * The subject `/want` means in the post of a raid or max battle with nothing typed (Matt's
+ * R-M1): the boss, an egg's tier. Refused (a `UserError`) anywhere else (`NAME_A_POKEMON`; a raid
+ * that has ended is out of the store, so its post is as any other) and where the battle's boss is
+ * one the game data does not know (Matt's Q1, F1): a raid's names the tier to want instead.
+ */
+function postSubject(ctx: AppContext, party: Party | undefined): BoxSubject {
+  if (!party || !isBattle(party)) throw new UserError(NAME_A_POKEMON);
+  const boss = isRaid(party) ? party.raid.boss : party.max.boss;
+  if (boss === null && isRaid(party)) return { kind: 'tier', level: party.raid.tier.level };
+  const entry = boss !== null && 'key' in boss ? ctx.gameData.catalogue.byKey(boss.key) : undefined;
+  if (!entry) {
+    if (!isRaid(party)) {
+      throw new UserError("Pine doesn't know this battle's boss yet: name a Pokémon.");
+    }
+    // The tier's dialog asks about its raids and its shadow raids alike: the level names it.
+    const tier = raidTierLabel({ level: party.raid.tier.level, shadow: false }).toLowerCase();
+    throw new UserError(
+      `Pine doesn't know this raid's boss yet: name a Pokémon, or \`/want ${tier}\` for the tier.`,
+    );
+  }
+  // A species of one entry is the species; a form of several, picked in its species' dialog.
+  return ctx.gameData.catalogue.byDex(entry.dex).length > 1
+    ? { kind: 'pokemon', dex: entry.dex, form: entry.key }
+    : { kind: 'pokemon', dex: entry.dex };
+}
+
+/**
+ * The box of a post's battle for a subject (R-M1): a raid's Raids (a shadow raid's Shadow, of a
+ * tier Shadow raids), a max battle's Dynamax or Gigantamax; none elsewhere.
+ */
+function postBoxOf(party: Party | undefined, subject: BoxSubject): WantBox | undefined {
+  if (!party) return undefined;
+  if (isRaid(party)) {
+    const { shadow } = party.raid.tier;
+    if (subject.kind === 'tier') return shadow ? 'shadow-raids' : 'raids';
+    return shadow ? 'shadow' : 'raids';
+  }
+  if (isMax(party) && subject.kind === 'pokemon') {
+    return party.max.tier === 'G' ? 'gigantamax' : 'dynamax';
+  }
+  return undefined;
+}
 
-function wantedOf(interaction: ChatInputCommandInteraction, ctx: AppContext): Wanted {
-  let wanted = wantedRead.get(interaction);
-  if (!wanted) {
-    wanted = readWanted(ctx, interaction.options.getString('target', true));
-    wantedRead.set(interaction, wanted);
+function useOf(interaction: ChatInputCommandInteraction, ctx: AppContext): WantUse {
+  const known = usesRead.get(interaction);
+  if (known) return known;
+  // The post's party from its id alone, in memory (`partyOf`): no read before the dialog.
+  const party = interaction.inGuild() ? partyOf(interaction, ctx) : undefined;
+  const typed = interaction.options.getString('target');
+  let wanted: Wanted;
+  if (typed === null || typed.trim() === '') {
+    const subject = postSubject(ctx, party);
+    wanted = { kind: 'subject', subject, target: baseTarget(subject) };
+  } else {
+    wanted = readWanted(ctx, typed);
+  }
+  let use: WantUse = { wanted, asks: false };
+  if (wanted.kind === 'subject') {
+    const { subject, picked } = dialogSubject(ctx, wanted.subject);
+    const postBox = postBoxOf(party, subject);
+    use = {
+      wanted,
+      subject,
+      ...(picked === undefined ? {} : { picked }),
+      ...(postBox === undefined ? {} : { postBox }),
+      asks: asksAbout(ctx, subject),
+    };
   }
-  return wanted;
+  usesRead.set(interaction, use);
+  return use;
+}
+
+/**
+ * Whether a subject's dialog opens (S1), from the game data and the lists alone: when it would
+ * show Tell me about (two boxes or more), Which or Costumes. Else it writes at once (Mew).
+ */
+function asksAbout(ctx: AppContext, subject: BoxSubject): boolean {
+  return (
+    shownBoxes(ctx, subject).length > 1 ||
+    whichEntries(ctx, subject).length > 0 ||
+    costumesShown(ctx, subject)
+  );
 }
 
-/** Whether a use opens the dialog: a subject with more than one box (else it writes at once). */
+/**
+ * The guard that reads what a use names (`useOf`, F2): nothing typed outside a battle's post, a
+ * boss Pine does not know or a name it cannot read is refused before the throttle counts the use
+ * (`discord-framework.md`: a use a guard refused does not count).
+ */
+const readsUse: Guard = (interaction, ctx) => {
+  if (interaction.isChatInputCommand()) useOf(interaction, ctx);
+};
+
+/** Whether a use opens the dialog (`asksAbout`); decided before any read, so synchronously. */
 function opensDialog(interaction: ChatInputCommandInteraction, ctx: AppContext): boolean {
   try {
-    const wanted = wantedOf(interaction, ctx);
-    return wanted.kind === 'subject' && shownBoxes(ctx, wanted.subject).length > 1;
+    return useOf(interaction, ctx).asks;
   } catch {
-    // What it names is refused by `execute`, answered late.
+    // What it names is refused by the guard `readsUse` before this is asked.
     return false;
   }
 }
@@ -254,9 +457,9 @@ export const want: SimpleCommand = {
       option
         .setName('target')
         .setDescription(
-          'A Pokémon, a raid tier, IVs, an item, a grunt type or leader: pick from the list',
+          'A Pokémon, tier, IVs, item, grunt or leader; leave it out in a raid or max post for its boss',
         )
-        .setRequired(true)
+        .setRequired(false)
         .setMaxLength(100)
         .setAutocomplete(true),
     ),
@@ -268,14 +471,22 @@ export const want: SimpleCommand = {
       'one is reported in a region you can see. For a Pokémon a dialog asks what for: Raids, ' +
       'Dynamax and Gigantamax max battles, Spawns, Research (field research that may reward ' +
       'it) and Shadow (shadow raids and Team GO Rocket catches), each only where the game has ' +
-      'it; tick what you want, and untick everything to take it off. A species is wanted in ' +
-      'every form; to want one form only, pick it from the list or type its name (`Giratina ' +
-      'Origin`, `Alolan Rattata`). A raid tier asks about its raids and its shadow raids. ' +
+      'it; tick what you want, and untick everything to take it off. Where a Pokémon has ' +
+      'several forms (megas included, which are told for raids only) it asks which; every form ' +
+      'ticked is the whole species, forms that come later included. Where it can wear a ' +
+      'costume, "Only costumed" narrows the want to costumed ones (any costume); unticked, ' +
+      'costumed ones come too. Picking a form from the list (`Galarian Corsola`) opens its ' +
+      'species with that form ticked. Remove takes the Pokémon off your list. A raid tier asks ' +
+      'about its raids and its shadow raids. ' +
       'Team GO Rocket is wanted at once: a grunt type (`dragon grunt`; at most one direct ' +
       'message an hour for each type), Cliff, Arlo, Sierra or any leader, Giovanni, or the ' +
-      'decoy grunt. Wanting something again shows what you ticked. Pick from the list that ' +
-      'appears while you type, or type a name or a tier such as `t5`, `mega`, `elite`, ' +
-      '`perfect` or `zero`.',
+      'decoy grunt. Wanting something again shows what you ticked. A first want opens with no ' +
+      'box ticked, and Submit waits till one is. In the post of a raid or a max battle, `/want` ' +
+      'alone is its boss (an egg: its tier; a boss Pine does not know yet has to be named), ' +
+      'and the dialog ticks that kind of battle only ' +
+      '(Raids, Shadow for a shadow raid, Dynamax or Gigantamax), also for a Pokémon you type ' +
+      'there; anywhere else, name a Pokémon. Pick from the list that appears while you type, ' +
+      'or type a name or a tier such as `t5`, `mega`, `elite`, `perfect` or `zero`.',
     examples: [
       '/want target:Dratini',
       '/want target:t5',
@@ -284,14 +495,15 @@ export const want: SimpleCommand = {
     ],
   },
   enabled: notificationsEnabled,
-  guards: [requireGuild],
+  guards: [requireGuild, readsUse],
   // The dialog is the first answer where one opens: nothing is deferred before it; every other
   // use writes under the member's lock first, so it is acknowledged when that takes long (B2).
   defer: (interaction, ctx) => (opensDialog(interaction, ctx) ? undefined : 'late'),
   throttle: NOTIFICATION_THROTTLE,
 
   async execute(interaction, ctx) {
-    const wanted = wantedOf(interaction, ctx);
+    const use = useOf(interaction, ctx);
+    const { wanted } = use;
     const memberId = interaction.user.id;
     const guildId = guildIdOf(interaction);
     if (wanted.kind === 'reward') {
@@ -319,24 +531,35 @@ export const want: SimpleCommand = {
       await answer(interaction, { content: ivAnswer(ctx, outcome) });
       return;
     }
-    const { subject } = wanted;
-    const shown = shownBoxes(ctx, subject);
+    const { subject, picked, postBox } = use;
+    if (!subject) throw new Error('a use of /want without the subject of its dialog');
     const scope = scopeOf(ctx, subject);
-    if (shown.length === 1) {
-      // One box: nothing to ask (design 7: a mega, a tier without shadow raids).
-      const { after } = await ctx.wantBoxes.set(
-        memberId,
-        guildId,
-        boxAnswerOf(scope, new Set(shown), shown),
-        Date.now(),
-      );
-      await answer(interaction, { content: boxesAnswer(ctx, subject, boxesOf(after)) });
+    if (!use.asks) {
+      // One box and nothing else to ask (S1: Mew, a tier without shadow raids): written at once.
+      const shown = shownBoxes(ctx, subject);
+      const given: BoxAnswer = {
+        scope,
+        forms: [undefined],
+        ticked: new Set(shown),
+        shown,
+        // Costumes not shown: a costumed row held stays costumed (A1).
+        costumed: undefined,
+        remove: false,
+      };
+      const { after } = await ctx.wantBoxes.set(memberId, guildId, given, Date.now());
+      await answer(interaction, { content: boxesAnswer(ctx, subject, after, given) });
       return;
     }
     const held = await readInTime(ctx.log, interaction, () =>
       ctx.wantBoxes.held(memberId, guildId, scope),
     );
-    await interaction.showModal(wantDialog(ctx, subject, shown, boxesOf(held)));
+    await interaction.showModal(
+      wantDialogFor(ctx, subject, held, {
+        openedAt: Date.now(),
+        ...(picked === undefined ? {} : { picked }),
+        ...(postBox === undefined ? {} : { postBox }),
+      }),
+    );
   },
 
   async autocomplete(interaction, ctx) {
@@ -353,24 +576,6 @@ export const want: SimpleCommand = {
   },
 };
 
-/** The answer of a dialog that writes its subject's own row (no Which field yet). */
-function boxAnswerOf(
-  scope: BoxAnswer['scope'],
-  ticked: ReadonlySet<WantBox>,
-  shown: readonly WantBox[],
-): BoxAnswer {
-  return { scope, forms: [undefined], ticked, shown, costumed: false, remove: false };
-}
-
-/** The boxes a Submit ticked; a form without the group is of another shape: out of date (B4). */
-function tickedOf(interaction: ModalSubmitInteraction): readonly string[] {
-  try {
-    return interaction.fields.getCheckboxGroup(BOXES_INPUT);
-  } catch {
-    throw new UserError(STALE_COMPONENT);
-  }
-}
-
 /**
  * The Submit of `/want`'s dialog (kind `wantbox`): the boxes it shows now, as ticked; every
  * other box as it is; in one transaction under the member's lock (`WantBoxStorage.set`). The
@@ -382,22 +587,18 @@ export const wantBoxControls: ComponentHandler = {
   throttle: NOTIFICATION_THROTTLE,
   async modal(interaction, id, ctx) {
     const submit = readWantDialogId(id);
-    // An id of before plan 8R-4, of another shape, or a Which field the game data has changed
-    // since (review R5): out of date, nothing written.
-    if (!submit || submit.which !== NO_WHICH) throw new UserError(STALE_COMPONENT);
-    // The boxes the dialog showed (B3), not those that can happen now.
-    const { subject, shown } = submit;
-    const ticked = new Set(
-      tickedOf(interaction).filter((box): box is WantBox => (shown as string[]).includes(box)),
-    );
+    // An id of before plan 8R-4 or of another shape: out of date, nothing written. The boxes
+    // the dialog showed (B3), not those that can happen now.
+    if (!submit) throw new UserError(STALE_COMPONENT);
+    const given = answerOfSubmit(ctx, interaction, submit);
     await deferSubmit(interaction);
     const { after } = await ctx.wantBoxes.set(
       interaction.user.id,
       guildIdOf(interaction),
-      boxAnswerOf(scopeOf(ctx, subject), ticked, shown),
+      given,
       Date.now(),
     );
-    await interaction.editReply({ content: boxesAnswer(ctx, subject, boxesOf(after)) });
+    await interaction.editReply({ content: boxesAnswer(ctx, submit.subject, after, given) });
   },
 };
 
@@ -468,6 +669,32 @@ function removalOf(ctx: AppContext, wanted: Wanted): { what: WantEntry['remove']
   };
 }
 
+/**
+ * What `/unwant` says of a form the member holds no row of while their species row covers it
+ * (review R4e): nothing is removed, the row is never split by itself. Undefined otherwise.
+ */
+async function coveringSpecies(
+  ctx: AppContext,
+  memberId: string,
+  guildId: string,
+  wanted: Wanted,
+): Promise<string | undefined> {
+  if (wanted.kind !== 'subject' || wanted.subject.kind !== 'pokemon') return undefined;
+  const { form, dex } = wanted.subject;
+  const species: BoxSubject = { kind: 'pokemon', dex };
+  if (form === undefined || whichEntries(ctx, species).length === 0) return undefined;
+  const held = await ctx.wantBoxes.held(memberId, guildId, scopeOf(ctx, species));
+  if (held.some((row) => row.form === form) || !held.some((row) => row.form === undefined)) {
+    return undefined;
+  }
+  const name = dialogName(ctx, species);
+  const formName = ctx.gameData.catalogue.byKey(form)?.name ?? form;
+  return (
+    `Your **${plain(name)}** want covers **${plain(formName)}**. ` +
+    `\`/want ${name.toLowerCase()}\` changes which forms.`
+  );
+}
+
 /** `/unwant` (spec 4.2): takes one thing off the member's list in this server, every box of it. */
 export const unwant: SimpleCommand = {
   data: new SlashCommandBuilder()
@@ -485,10 +712,12 @@ export const unwant: SimpleCommand = {
     category: 'notifications',
     details:
       'Takes a Pokémon, a raid tier, perfect or zero IVs, a research reward or a Team GO Rocket ' +
-      'target off your list for this server, whatever you ticked for it. The list that appears while you type shows what ' +
-      'is on it; you can also type the name as for `/want`. A species and one of its forms are ' +
-      'separate entries: each is taken off by itself. To keep some of what you ticked, use ' +
-      '`/want` again instead.',
+      'target off your list for this server, whatever you ticked for it. A Pokémon takes all ' +
+      'its forms off with it. A form (`Galarian Corsola`) is taken off where you want it by ' +
+      'itself; where your want of the whole species covers it, nothing is taken off, and ' +
+      '`/want` on the species changes which forms. Unown’s letters are wants of their own. The ' +
+      'list that appears while you type shows what is on it; you can also type the name as for ' +
+      '`/want`. To keep some of what you ticked, use `/want` again instead.',
     examples: ['/unwant target:Mewtwo', '/unwant target:t5'],
   },
   enabled: notificationsEnabled,
@@ -508,10 +737,16 @@ export const unwant: SimpleCommand = {
       (entry) => searchText(entry.label) === folded || searchText(entryText(entry)) === folded,
     );
     const [only] = named;
+    const wanted = only && named.length === 1 ? undefined : readWanted(ctx, typed, true);
+    const covered = wanted && (await coveringSpecies(ctx, memberId, guildId, wanted));
+    if (covered !== undefined) {
+      await answer(interaction, { content: covered });
+      return;
+    }
     const { what, name } =
       only && named.length === 1
         ? { what: only.remove, name: only.label }
-        : removalOf(ctx, readWanted(ctx, typed, true));
+        : removalOf(ctx, wanted ?? readWanted(ctx, typed, true));
     const removed = await removeEntry(ctx, memberId, guildId, what);
     await answer(interaction, {
       content: removed
diff --git a/src/domain/pogo/species-answer.ts b/src/domain/pogo/species-answer.ts
index 734deb5b09b658a9936496a8d25d78576eb0c883..d9801eafb1f0abe083264617248d341384a2e07c 100644
--- a/src/domain/pogo/species-answer.ts
+++ b/src/domain/pogo/species-answer.ts
@@ -264,6 +264,9 @@ export function planAnswer(
   };
 }
 
+/** The Which field's hash where a dialog shows none (`whichHash` of no keys). */
+export const NO_WHICH = '0';
+
 const FNV_OFFSET = 0x811c9dc5;
 const FNV_PRIME = 0x01000193;
 
@@ -273,6 +276,7 @@ const FNV_PRIME = 0x01000193;
  * `,`, 32 bits in base 36.
  */
 export function whichHash(keys: readonly string[]): string {
+  if (keys.length === 0) return NO_WHICH;
   let hash = FNV_OFFSET;
   for (const byte of new TextEncoder().encode(keys.join(','))) {
     hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
diff --git a/src/domain/pogo/want-boxes.ts b/src/domain/pogo/want-boxes.ts
index d539319ad5c406f1592310e4378789934ef0c808..eb31e27db5874607bcc6b5441879e18fc60152d9 100644
--- a/src/domain/pogo/want-boxes.ts
+++ b/src/domain/pogo/want-boxes.ts
@@ -60,13 +60,16 @@ export const BOX_WORDS: Readonly<Record<WantBox, string>> = {
   'shadow-raids': 'Shadow raids',
 };
 
-/** What a box of a Pokémon says under its name in the dialog. */
+/**
+ * What a box of a Pokémon says under its name in the dialog (the mockups of plan 8R-4), `{name}`
+ * the Pokémon's; shown only in a dialog without a Which field.
+ */
 export const BOX_DESCRIPTIONS: Readonly<Record<PokemonBox, string>> = {
-  raids: 'Its raids and the eggs it hatches from',
-  dynamax: 'Its Dynamax max battles',
-  gigantamax: 'Its Gigantamax max battles',
-  spawns: 'Wild ones reported with /wild',
-  research: 'Field research that may reward it',
+  raids: '{name} raids and their eggs',
+  dynamax: 'Dynamax max battles',
+  gigantamax: 'Gigantamax max battles',
+  spawns: 'Wild {name} reported',
+  research: 'Field research that rewards it',
   shadow: 'Shadow raids and Team GO Rocket catches',
 };
 
diff --git a/test/support/dialogs.ts b/test/support/dialogs.ts
index f1933deea27f3f0bdae59fd6cc8d631e98a58eb8..77d09ba13be292bd9df7aeb1a9daebfafd6fab2e 100644
--- a/test/support/dialogs.ts
+++ b/test/support/dialogs.ts
@@ -37,6 +37,78 @@ export interface DialogChoice {
   picked: boolean;
 }
 
+/** An option of a dialog's field: its value and label, and whether it starts ticked or chosen. */
+export interface FieldOption {
+  value: string;
+  label: string;
+  description?: string;
+  ticked: boolean;
+}
+
+/**
+ * A field of a dialog (a label and what it holds; plan 8R-4): its label and description, its
+ * input's custom id and kind, a Checkbox's tick to start with, a group's or a menu's options.
+ */
+export interface DialogField {
+  label: string;
+  description?: string;
+  id: string;
+  kind: 'checkbox' | 'group' | 'select' | 'radio' | 'text' | 'other';
+  /** A Checkbox: whether it starts ticked. */
+  ticked?: boolean;
+  options?: FieldOption[];
+}
+
+const KINDS: Partial<Record<ComponentType, DialogField['kind']>> = {
+  [ComponentType.Checkbox]: 'checkbox',
+  [ComponentType.CheckboxGroup]: 'group',
+  [ComponentType.StringSelect]: 'select',
+  [ComponentType.RadioGroup]: 'radio',
+  [ComponentType.TextInput]: 'text',
+};
+
+/** The fields of a dialog, in their order: every label with what it holds. */
+export function dialogFields(dialog: APIModalInteractionResponseCallbackData): DialogField[] {
+  return dialog.components.flatMap((component): DialogField[] => {
+    if (component.type !== ComponentType.Label) return [];
+    const inner = component.component as {
+      type: ComponentType;
+      custom_id: string;
+      default?: boolean;
+      options?: { value: string; label: string; description?: string; default?: boolean }[];
+    };
+    return [
+      {
+        label: component.label,
+        ...(component.description === undefined ? {} : { description: component.description }),
+        id: inner.custom_id,
+        kind: KINDS[inner.type] ?? 'other',
+        ...(inner.type === ComponentType.Checkbox ? { ticked: inner.default === true } : {}),
+        ...(inner.options === undefined
+          ? {}
+          : {
+              options: inner.options.map((option) => ({
+                value: option.value,
+                label: option.label,
+                ...(option.description === undefined ? {} : { description: option.description }),
+                ticked: option.default === true,
+              })),
+            }),
+      },
+    ];
+  });
+}
+
+/** A dialog's field by its label; fails the test when it has none. */
+export function dialogField(
+  dialog: APIModalInteractionResponseCallbackData,
+  label: string,
+): DialogField {
+  const found = dialogFields(dialog).find((field) => field.label === label);
+  if (!found) throw new Error(`the dialog has no field ${label}`);
+  return found;
+}
+
 /**
  * The choices of a dialog's radio groups and string selects (a menu, plan 8X-1B: Meet…), in
  * their order; `picked` is a radio choice or a menu option marked to start chosen (`default`).
diff --git a/test/support/fake-interactions.test.ts b/test/support/fake-interactions.test.ts
index c5eeb7f7da60c0fd8180b62397dce06e36d8acb1..d2636c3477b32d2b978a178a23f695808ff5fef8 100644
--- a/test/support/fake-interactions.test.ts
+++ b/test/support/fake-interactions.test.ts
@@ -587,6 +587,60 @@ describe('the forms a control opens', () => {
     );
   });
 
+  const checkbox = (custom_id: string, extra: object = {}) => ({
+    type: ComponentType.Label,
+    label: 'Only costumed ones',
+    description: 'Any costume, now or later.',
+    component: { type: ComponentType.Checkbox, custom_id, ...extra },
+  });
+
+  it('takes a Checkbox of its custom id and default alone, and submits it ticked or not (plan 8R-4)', () => {
+    expect(() => checkModal(form([checkbox('c'), checkbox('d', { default: true })]))).not.toThrow();
+    for (const key of ['label', 'description', 'options', 'required', 'min_values']) {
+      expect(() => checkModal(form([checkbox('c', { [key]: 'x' })])), key).toThrow(
+        new RegExp(`a checkbox has no ${key}`),
+      );
+    }
+    const shown = form([
+      checkbox('c'),
+      checkbox('d'),
+      boxes('g', 2, { min_values: 0, required: false }),
+    ]);
+    const submitted = fakeModal({ customId: 'a:1:form', form: shown, ticks: { c: true } });
+    expect(submitted.fields.getCheckbox('c')).toBe(true);
+    // Left unticked: false, as Discord sends it.
+    expect(submitted.fields.getCheckbox('d')).toBe(false);
+    expect(() => submitted.fields.getCheckbox('g')).toThrow(/FieldNotFound/);
+    expect(() => submitted.fields.getCheckboxGroup('c')).toThrow(/FieldNotFound/);
+    expect(() => fakeModal({ customId: 'a:1:form', form: shown, ticks: { z: true } })).toThrow(
+      /has no input z/,
+    );
+  });
+
+  it('lets no Submit through with fewer than a required group’s min_values ticked (plan 8R-4)', () => {
+    const shown = form([
+      boxes('g', 3, { min_values: 1, required: true }),
+      boxes('h', 3, { min_values: 0, required: false }),
+    ]);
+    expect(
+      fakeModal({
+        customId: 'a:1:form',
+        form: shown,
+        checked: { g: ['v1'] },
+      }).fields.getCheckboxGroup('g'),
+    ).toEqual(['v1']);
+    // Discord keeps Submit from going through: the bot never gets such a form.
+    expect(() => fakeModal({ customId: 'a:1:form', form: shown })).toThrow(
+      /no value for its required checkbox group g/,
+    );
+    expect(() => fakeModal({ customId: 'a:1:form', form: shown, checked: { g: [] } })).toThrow(
+      /at least 1 of g/,
+    );
+    expect(() => checkModal(form([boxes('a', 2, { min_values: 0, required: true })]))).toThrow(
+      /min_values 0 in a form needs required false/,
+    );
+  });
+
   it('refuses a menu of a form that may stay empty without saying it is not required', () => {
     expect(() => checkModal(form([select('a', 2, { min_values: 0 })]))).toThrow(
       /min_values 0 in a form needs required false/,
diff --git a/test/support/fake-interactions.ts b/test/support/fake-interactions.ts
index f4c4ed0f86c1c7323e0aa6521d1e1476fc3826da..43b3ab57c9d0dedc3a1fbf66557756b03fe35615 100644
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -142,6 +142,11 @@ export interface FakeOptions {
   checked?: Record<string, string[]>;
   /** Modal: the choice picked in each radio group of the form, by the group's custom id. */
   picked?: Record<string, string>;
+  /**
+   * Modal: whether each Checkbox of the form (one tick box, `ComponentType.Checkbox`; plan 8R-4)
+   * is ticked, by its custom id; one of the form not named is submitted unticked.
+   */
+  ticks?: Record<string, boolean>;
   /**
    * Modal: the form the opener showed (as passed to `showModal`). The submitted form then has
    * every input of it, and refuses values for inputs it does not have (`submittedForm`).
@@ -407,6 +412,8 @@ interface FormInput {
   type: ComponentType;
   /** A select menu, checkbox group or radio group that may be submitted with nothing chosen. */
   optional: boolean;
+  /** A menu's or a group's `min_values` (1 unless it says): fewer chosen is no Submit. */
+  least: number;
   /** The values of the choices of a radio group (Discord sends only one of them). */
   values?: readonly unknown[];
 }
@@ -435,6 +442,7 @@ function formInputs(modal: unknown): Map<string, FormInput> {
     inputs.set(inner.custom_id, {
       type: inner.type,
       optional,
+      least: 'min_values' in inner && typeof inner.min_values === 'number' ? inner.min_values : 1,
       ...(inner.type === ComponentType.RadioGroup
         ? {
             values: ((inner as { options?: { value?: unknown }[] }).options ?? []).map(
@@ -533,9 +541,16 @@ export function checkModal(modal: unknown): void {
         { least: MODAL.radioLeast, most: MODAL.radioOptions, group: false, inForm: true },
         menuFail,
       );
+    } else if (inner.type === ComponentType.Checkbox) {
+      // One tick box: its custom id and whether it starts ticked, nothing else (the words are
+      // its label's).
+      for (const key of Object.keys(inner)) {
+        if (!['type', 'custom_id', 'default', 'id'].includes(key)) {
+          fail(`${where}: a checkbox has no ${key}`);
+        }
+      }
     } else if (
       inner.type !== ComponentType.TextInput &&
-      inner.type !== ComponentType.Checkbox &&
       inner.type !== ComponentType.FileUpload &&
       inner.type !== ComponentType.UserSelect &&
       inner.type !== ComponentType.RoleSelect &&
@@ -551,7 +566,8 @@ export function checkModal(modal: unknown): void {
 type Submitted =
   | { type: ComponentType.TextInput; value: string }
   | { type: ComponentType.StringSelect | ComponentType.CheckboxGroup; values: string[] }
-  | { type: ComponentType.RadioGroup; value: string | null };
+  | { type: ComponentType.RadioGroup; value: string | null }
+  | { type: ComponentType.Checkbox; value: boolean };
 
 /**
  * What a fake form was submitted with, by custom id. With the form the opener showed (`form`),
@@ -575,6 +591,9 @@ function submittedForm(o: FakeOptions): Map<string, Submitted> {
   for (const [id, value] of Object.entries(o.picked ?? {})) {
     given.set(id, { type: ComponentType.RadioGroup, value });
   }
+  for (const [id, value] of Object.entries(o.ticks ?? {})) {
+    given.set(id, { type: ComponentType.Checkbox, value });
+  }
   if (o.form === undefined) return given;
   const inputs = formInputs(o.form);
   for (const [id, value] of given) {
@@ -586,6 +605,15 @@ function submittedForm(o: FakeOptions): Map<string, Submitted> {
         `The radio group ${id} of the fake form has no choice ${String(value.value)}`,
       );
     }
+    // Discord lets no Submit through with fewer than a menu's or a group's `min_values` chosen,
+    // unless it may stay empty and is (plan 8R-4).
+    if (
+      (value.type === ComponentType.CheckboxGroup || value.type === ComponentType.StringSelect) &&
+      value.values.length < input.least &&
+      !(input.optional && value.values.length === 0)
+    ) {
+      throw new Error(`The fake form needs at least ${String(input.least)} of ${id}`);
+    }
   }
   const all = new Map<string, Submitted>();
   for (const [id, input] of inputs) {
@@ -598,8 +626,10 @@ function submittedForm(o: FakeOptions): Map<string, Submitted> {
       input.type === ComponentType.CheckboxGroup ||
       input.type === ComponentType.StringSelect
     ) {
-      if (input.type === ComponentType.StringSelect && !input.optional) {
-        throw new Error(`The fake form has no value for its required menu ${id}`);
+      if (!input.optional) {
+        throw new Error(
+          `The fake form has no value for its required ${input.type === ComponentType.StringSelect ? 'menu' : 'checkbox group'} ${id}`,
+        );
       }
       all.set(id, { type: input.type, values: [] });
     } else if (input.type === ComponentType.RadioGroup) {
@@ -607,6 +637,8 @@ function submittedForm(o: FakeOptions): Map<string, Submitted> {
         throw new Error(`The fake form has no value for its required radio group ${id}`);
       }
       all.set(id, { type: ComponentType.RadioGroup, value: null });
+    } else if (input.type === ComponentType.Checkbox) {
+      all.set(id, { type: ComponentType.Checkbox, value: false });
     }
   }
   return all;
@@ -874,6 +906,12 @@ function base(kind: Kind, o: FakeOptions) {
         if (input?.type !== ComponentType.CheckboxGroup) throw notSubmitted(id, 'checkbox group');
         return input.values;
       },
+      /** As discord.js: whether one tick box (`ComponentType.Checkbox`) was ticked. */
+      getCheckbox: (id: string) => {
+        const input = submitted.get(id);
+        if (input?.type !== ComponentType.Checkbox) throw notSubmitted(id, 'checkbox');
+        return input.value;
+      },
       /** As discord.js: `null` for nothing picked, unless `required`, which then throws. */
       getRadioGroup: (id: string, required?: boolean) => {
         const input = submitted.get(id);
````

### Task 5: 8R-4 task 5: Change… on direct messages

Prototype commit: `ba6bac118a22fc2fc0ee68d766d2aad4a11ed969`

A DM's reason of a Pokémon or a tier has Change… instead of Stop
(dm:<server>:change:sp:<dex>[:<form>] or st:<level>), named with the box
that fired ("Costumed Pikachu · Research"), after all text as Stop is;
two reasons of one species are one section with one button. The press
reads the member's rows in time and opens /want's dialog for that server,
its id carrying the server; nothing held, a member gone or wants switched
off is said privately instead, and it never writes. The Submit from a DM
checks the member and the server again, then updates the message: its
Change… reads Changed or Removed under the messages' lock, now shared with
Stop, and the answer follows below. Stop stays for gyms, IVs, items, Team
GO Rocket and the settings; a Pokémon's or tier's Stop of an earlier DM
is out of date (those DMs were only ever sent on the test server).

**Files:**

```
 docs/architecture/notifications-and-dms.md   |   4 +-
 docs/architecture/testing.md                 |   2 +-
 src/commands/notifications/wants.ts          |  98 ++++++++++++++++++++++++++-
 src/commands/notifications/wild.test.ts      |  11 +--
 src/components/dm-messages.ts                |   9 +++
 src/components/dm.test.ts                    | 243 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/components/dm.ts                         | 101 +++++++++++++++++++++-------
 src/discord/custom-id.ts                     |   4 +-
 src/domain/pogo/species-answer.ts            |  10 +++
 src/render/notify-dm.test.ts                 | 100 ++++++++++++++++++++++++++++
 src/render/notify-dm.ts                      |  99 +++++++++++++++++++++++++--
 src/services/notify-service.max.test.ts      |   2 +-
 src/services/notify-service.parties.test.ts  |   2 +-
 src/services/notify-service.research.test.ts |   2 +-
 src/services/notify-service.rocket.test.ts   |   4 +-
 src/services/notify-service.test.ts          |  93 +++++++++++++++-----------
 src/services/notify-service.ts               |  87 +++++++++++++++++++++---
 src/web/spawn-report.test.ts                 |   5 +-
 test/support/fake-interactions.ts            |  16 ++++-
 19 files changed, 799 insertions(+), 93 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/notifications/wild.test.ts src/components/dm.test.ts src/render/notify-dm.test.ts src/services/notify-service.max.test.ts src/services/notify-service.parties.test.ts src/services/notify-service.research.test.ts src/services/notify-service.rocket.test.ts src/services/notify-service.test.ts src/web/spawn-report.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff ba6bac118a22fc2fc0ee68d766d2aad4a11ed969 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4 task 5: Change… on direct messages`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index 170afbf4e556066f1f98b1b5abd6e7213354112f..fe30c1cae243891bba0d2d6347f789f32e23205a 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -6,7 +6,7 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 
 - A want (`PokemonNotification`) is per member and server and is one of: a species (every form, megas included), one form (`form`, a catalogue key), the shadow raids of either (`shadow`; since plan 8R-2 shadow raids and Team GO Rocket catches, the Shadow box), a raid tier (raids only), perfect or zero IVs (spawns only); a mega is raids only. The columns are read and written only through the codec (`notification-target.ts`: `readNotification` gives the target and the scope in effect; a row it cannot read is skipped, counted and never deleted on its own) and the pure functions of `src/domain/pogo/wants.ts` (`readWants`, `planSetWant`, `rowsOfWant`: duplicate legacy rows are one want with the union of their scopes, two keys of one catalogue entry are one want, a row is rewritten only when its meaning changes). `ctx.wants` (`WantStorage`: `list`, `set`, `remove`, `removeAll`, `count`) is the repository; `MemoryWants` (`test/support/wants.ts`) is its twin and runs the same functions. `pokemonWantFits(catalogue, target, entry, shadowRaid)` says whether a want is for a boss or a spawn. Since plan 8R-1 a raid scope means raids only (no max battles), and the legacy `!wants` codec and the scope rules (`planSetWant`, `widerScope`) are unchanged.
 - **Costumed wants** (plan 8R-4, migration 030; design `2026-10-22-costume-form-wants-design.md`): `PokemonNotification.costumed` and `TargetWant.costumed` (tinyint, default 0) make a Pokémon's want costumed only, a property of the row like the scope, never part of its target, token, unique key or id (`Want.costumed?: true`, a Pokémon's `TargetWant.costumed?: true`; `boxTarget(kind, dex, form, costumed)`, `withCostume`, `isCostumedTarget`; a Stop or Remove takes the row whatever its costume). Rows of one target that disagree read as plain (`readWants`: plain wins, as the wider scope); `planSetWant(…, costumed)` rewrites a row whose costume differs; a `TargetWant` added again takes the costume of its add (an upsert per costume, `createdAt` kept). Every sighting carries `costumed` (`PokemonSighting`): a raid's boss as the list has it in the raid's tier (`ShownBoss.costumed`), a spawn as `SpawnNews.costumed` says, a research reward by `rewardCostumed` (its Leek Duck name and picture, worked out when read), a max boss and a Rocket catch never. `pokemonWantFits(…, costumed)` fits a costumed want only to a costumed sighting, under the entry the costume copies; a plain want fits either. The matchers (`raidWantsFiring`, `spawnWantsFiring`, `rocketShadowFiring`) give the wants themselves, so a reason carries `costumed` (`wantReason`) and the DM names it "Costumed Pikachu" (`wantTargetLabel(…, costumed)`, `pokemonWantName({ costumed })`: no "(every form)", "Costumed Corsola"), a target "Costumed Pikachu (research)" (`targetWantLabel`); members told of one event share a message only where their reasons read alike (`shownReasonKey`).
-- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy, written at once with no dialog (`rocketWantAnswer`: a grunt type at most one DM an hour for each type). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. **The Pokémon dialog of plan 8R-4** (design 3, the mockups of 2026-10-22; `wantDialog` / `WantDialogView` in `src/commands/notifications/want-dialog.ts`, `wantDialogFor` in `wants.ts`): the title by the species' name ("Corsola: what for?", `dialogName`), one text, then at most four fields, a dialog's five components being Discord's limit (every other sentence goes into the one text: the mega note "A mega is told for raids only.", "Your Ponyta wants differ by form; Submit sets them alike."; Charizard's is the largest, a test builds it): **Tell me about** (`boxes`, two boxes or more; their descriptions, `BOX_DESCRIPTIONS` with `{name}`, only without a Which field; Research no longer for a legendary, mythical or ultra beast unless today's task list rewards it or the member holds it, `shownBoxes` / `dialogBoxes`), **Which <species>** (`forms`, `whichEntries`: a species of 2 to `WHICH_CAP` 25 entries, megas included, by their catalogue names; a checkbox group to ten, a string select above; none for Unown, whose letters are dialogs of their own, `wantbox:p201:…:unown_a`), **Costumes** (`costumed`, one `ComponentType.Checkbox` under a Label `Only costumed <species>` / `Only costumed ones`, shown where the game data has a costume of any of its forms or the raid boss list or today's task list has it costumed now, `costumesShown`, or where a row held is costumed, A1: a Submit never drops a costume unseen; not shown, each row keeps its own) and **Remove** (`remove`, one Checkbox, `Remove <species> from my list`, where the member holds a want of it; it wins over everything). With one box and none of Which and Costumes it writes at once, a costumed row held staying costumed (`asksAbout`, decided synchronously for the deferral, S1: Mew; what a use is about, `WantUse`, is read once per interaction, `useOf`, so the deferral and `execute` decide alike, A8); with one box and a Which field (Arceus) there is no Tell me about field and the text says what it is told for. A first want opens with no box ticked and every form ticked (a form picked from the list alone: `/want galarian corsola`, `/want mega charizard y`, `dialogSubject`), Costumed off, and its Tell me about and Which fields required (`required: true`, `min_values` 1: Discord lets no Submit through till a box and a form are ticked; Matt's R-M2, no "All" option), a tier's dialog alike; with wants, as stored (a box ticked where any row has it, Costumed only where every row but the megas is, `allCostumed`, the picked form added; the rows that differ leave a mega's out, A3), and the fields not required, so that nothing ticked still takes the want off (Q1). **In the post of a raid or a max battle** (Matt's R-M1; `postSubject` and `postBoxOf` in `wants.ts`, the party read from the post's id in memory by `partyOf`, so `opensDialog` stays synchronous and `showModal` the first answer): `/want` with nothing typed (the option is not required) is the boss (a form of a species with several picked in its species' dialog), an egg its tier; a boss the game data does not know is refused (Matt's Q1, F1: a raid's "Pine doesn't know this raid's boss yet: name a Pokémon, or `/want t5` for the tier.", the tier its own; a max battle's "Pine doesn't know this battle's boss yet: name a Pokémon."); the dialog ticks only the post's kind of battle for a first want (a raid's Raids, a shadow raid's Shadow, a tier's Raids or Shadow raids, a max battle's Dynamax or Gigantamax), also for a Pokémon typed there, and beside the rows held for a want held. Anywhere else nothing typed is a `UserError` (`NAME_A_POKEMON`: "Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it out for its boss."; an ended raid's post is out of the store, so as any other). These refusals and a name it cannot read come from the guard `readsUse` (it reads the use, `useOf`), so they do not count against the throttle (F2). The Submit (`answerOfSubmit`, `readWantSubmit`: a Which field read as its forms, every form ticked as the species row; a missing field or another Which hash is `STALE_COMPONENT`) writes through `WantBoxStorage.set`, and the answer names the want as `/wants` does (`rowsLabel`: "Costumed Pikachu", "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above three by count) with its boxes, in small print where Costumed meets a box no costumed Pokémon has appeared in (`NEVER_COSTUMED_YET`: Dynamax, Gigantamax, Shadow; a warning, never a refusal) and where a mega ticked without Raids is off. `/unwant` of a form whose species row covers it (`coveringSpecies`, review R4e) removes nothing and says so. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (since plan 8R-4 `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>][:<form>][:l<page>]:~<token>`, a tier `wantbox:t<level>:set2:…`; `src/commands/notifications/want-dialog.ts`, `wantDialogId` / `readWantDialogId`: `<mask>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `<flags>` whether it showed Costumes (1) and Remove (2), `<which>` `whichHash` of the keys its Which field showed, `0` for none (`NO_WHICH`), the server where it was opened from a DM, the form only beyond the Which field (an Unown letter), the page of `/wants`, last `openToken` of when it opened (plan 8X-F: Discord's client shows what was last submitted under an id in place of what the dialog ticks), which `readWantDialogId` leaves out; an id of before (`set`) or of any other shape, one without its token, and a Which hash that is not the field's now, are `STALE_COMPONENT`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock; nothing ticked takes the target off. **One answer per species** (plan 8R-4, design 3; `src/domain/pogo/species-answer.ts`): an answer (`BoxAnswer`: the forms that stand, `undefined` the subject's own row, of a species the species row; the boxes ticked of those shown; costumed; Remove) covers a scope (`AnswerScope`, `scopeOf`: a species is `wide`, every row of its Pokédex number in both tables, `PokemonNotification.pokemon = <dex>` and `TargetWant.target` `<kind>:<dex>` exactly or `<kind>:<dex>:%`, so 25 never reads 251; a species with more entries than the Which field holds, `WHICH_CAP` 25, Unown, is not: its species row and each letter are answers of their own; a tier is its own). `WantBoxStorage.held(member, server, scope)` gives the rows by form (`HeldRow`: its boxes, costumed when every row of it is; `heldRows`), `set(member, server, answer, at)` carries out `planAnswer`: Remove, no form or no box shown ticked takes every row of the scope away, the boxes the dialog did not show included (A2, Q1); every form ticked gets the boxes ticked of those shown and keeps the others as its row had them (a new row: as the scope's rows had them together), all with the answer's costume (`costumed` undefined where the dialog did not show Costumes: each row keeps its own, a new row costumed where every row held is, `allCostumed`, A1); a mega a raid row and nothing else, always plain, nothing without Raids (review R4c, A-D3; `FormReader`'s `mega`); every other row goes; in one transaction under the member's lock (`WantBoxRepository`, twin `MemoryWantBoxes`, both `wantBoxCases`). `removalAnswer(scope)` is `/unwant`'s, a list's Remove and a DM's Stop of a subject. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
+- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy, written at once with no dialog (`rocketWantAnswer`: a grunt type at most one DM an hour for each type). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. **The Pokémon dialog of plan 8R-4** (design 3, the mockups of 2026-10-22; `wantDialog` / `WantDialogView` in `src/commands/notifications/want-dialog.ts`, `wantDialogFor` in `wants.ts`): the title by the species' name ("Corsola: what for?", `dialogName`), one text, then at most four fields, a dialog's five components being Discord's limit (every other sentence goes into the one text: the mega note "A mega is told for raids only.", "Your Ponyta wants differ by form; Submit sets them alike."; Charizard's is the largest, a test builds it): **Tell me about** (`boxes`, two boxes or more; their descriptions, `BOX_DESCRIPTIONS` with `{name}`, only without a Which field; Research no longer for a legendary, mythical or ultra beast unless today's task list rewards it or the member holds it, `shownBoxes` / `dialogBoxes`), **Which <species>** (`forms`, `whichEntries`: a species of 2 to `WHICH_CAP` 25 entries, megas included, by their catalogue names; a checkbox group to ten, a string select above; none for Unown, whose letters are dialogs of their own, `wantbox:p201:…:unown_a`), **Costumes** (`costumed`, one `ComponentType.Checkbox` under a Label `Only costumed <species>` / `Only costumed ones`, shown where the game data has a costume of any of its forms or the raid boss list or today's task list has it costumed now, `costumesShown`, or where a row held is costumed, A1: a Submit never drops a costume unseen; not shown, each row keeps its own) and **Remove** (`remove`, one Checkbox, `Remove <species> from my list`, where the member holds a want of it; it wins over everything). With one box and none of Which and Costumes it writes at once, a costumed row held staying costumed (`asksAbout`, decided synchronously for the deferral, S1: Mew; what a use is about, `WantUse`, is read once per interaction, `useOf`, so the deferral and `execute` decide alike, A8); with one box and a Which field (Arceus) there is no Tell me about field and the text says what it is told for. A first want opens with no box ticked and every form ticked (a form picked from the list alone: `/want galarian corsola`, `/want mega charizard y`, `dialogSubject`), Costumed off, and its Tell me about and Which fields required (`required: true`, `min_values` 1: Discord lets no Submit through till a box and a form are ticked; Matt's R-M2, no "All" option), a tier's dialog alike; with wants, as stored (a box ticked where any row has it, Costumed only where every row but the megas is, `allCostumed`, the picked form added; the rows that differ leave a mega's out, A3), and the fields not required, so that nothing ticked still takes the want off (Q1). **In the post of a raid or a max battle** (Matt's R-M1; `postSubject` and `postBoxOf` in `wants.ts`, the party read from the post's id in memory by `partyOf`, so `opensDialog` stays synchronous and `showModal` the first answer): `/want` with nothing typed (the option is not required) is the boss (a form of a species with several picked in its species' dialog), an egg its tier; a boss the game data does not know is refused (Matt's Q1, F1: a raid's "Pine doesn't know this raid's boss yet: name a Pokémon, or `/want t5` for the tier.", the tier its own; a max battle's "Pine doesn't know this battle's boss yet: name a Pokémon."); the dialog ticks only the post's kind of battle for a first want (a raid's Raids, a shadow raid's Shadow, a tier's Raids or Shadow raids, a max battle's Dynamax or Gigantamax), also for a Pokémon typed there, and beside the rows held for a want held. Anywhere else nothing typed is a `UserError` (`NAME_A_POKEMON`: "Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it out for its boss."; an ended raid's post is out of the store, so as any other). These refusals and a name it cannot read come from the guard `readsUse` (it reads the use, `useOf`), so they do not count against the throttle (F2). The Submit (`answerOfSubmit`, `readWantSubmit`: a Which field read as its forms, every form ticked as the species row; a missing field or another Which hash is `STALE_COMPONENT`) writes through `WantBoxStorage.set`, and the answer names the want as `/wants` does (`rowsLabel`: "Costumed Pikachu", "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above three by count) with its boxes, in small print where Costumed meets a box no costumed Pokémon has appeared in (`NEVER_COSTUMED_YET`: Dynamax, Gigantamax, Shadow; a warning, never a refusal) and where a mega ticked without Raids is off. `/unwant` of a form whose species row covers it (`coveringSpecies`, review R4e) removes nothing and says so. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (since plan 8R-4 `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>][:<form>][:l<page>]:~<token>`, a tier `wantbox:t<level>:set2:…`; `src/commands/notifications/want-dialog.ts`, `wantDialogId` / `readWantDialogId`: `<mask>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `<flags>` whether it showed Costumes (1) and Remove (2), `<which>` `whichHash` of the keys its Which field showed, `0` for none (`NO_WHICH`), the server where it was opened from a DM, the form only beyond the Which field (an Unown letter), the page of `/wants`, last `openToken` of when it opened (plan 8X-F: Discord's client shows what was last submitted under an id in place of what the dialog ticks), which `readWantDialogId` leaves out; an id of before (`set`) or of any other shape, one without its token, and a Which hash that is not the field's now, are `STALE_COMPONENT`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock; nothing ticked takes the target off. **One answer per species** (plan 8R-4, design 3; `src/domain/pogo/species-answer.ts`): an answer (`BoxAnswer`: the forms that stand, `undefined` the subject's own row, of a species the species row; the boxes ticked of those shown; costumed; Remove) covers a scope (`AnswerScope`, `scopeOf`: a species is `wide`, every row of its Pokédex number in both tables, `PokemonNotification.pokemon = <dex>` and `TargetWant.target` `<kind>:<dex>` exactly or `<kind>:<dex>:%`, so 25 never reads 251; a species with more entries than the Which field holds, `WHICH_CAP` 25, Unown, is not: its species row and each letter are answers of their own; a tier is its own). `WantBoxStorage.held(member, server, scope)` gives the rows by form (`HeldRow`: its boxes, costumed when every row of it is; `heldRows`), `set(member, server, answer, at)` carries out `planAnswer`: Remove, no form or no box shown ticked takes every row of the scope away, the boxes the dialog did not show included (A2, Q1); every form ticked gets the boxes ticked of those shown and keeps the others as its row had them (a new row: as the scope's rows had them together), all with the answer's costume (`costumed` undefined where the dialog did not show Costumes: each row keeps its own, a new row costumed where every row held is, `allCostumed`, A1); a mega a raid row and nothing else, always plain, nothing without Raids (review R4c, A-D3; `FormReader`'s `mega`); every other row goes; in one transaction under the member's lock (`WantBoxRepository`, twin `MemoryWantBoxes`, both `wantBoxCases`). `removalAnswer(scope)` is `/unwant`'s and a list's Remove. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
 - What a member picked in the `target` option of `/want` or `/unwant` is a want token (`wantToken` / `parseWantToken`: `pokemon:<dex>[:<form>][:shadow]`, `tier:<level>[:shadow]`, `iv:perfect|zero`): the value of an autocomplete choice, never part of a custom id. Text sent without picking never guesses (`readWantText`): it acts only when it is a tier or IV word in full (`wantWord`), exactly a species' name (every form) or exactly one form's own name, with `shadow` before either; anything else is refused with suggestions. A bare number is a tier or IV word, never a Pokédex number.
 - Wants are named in one way everywhere (`wantLabel` / `wantName` in `src/commands/notifications/want-input.ts`): "X (every form)" for a species with several entries, "X (base form)" for its plain entry, "Shadow X", and the scope after " · " in the choices of `/unwant`.
 - Gym targets (`GymNotification`; `gym` holds a gym id as text) are `ctx.gymTargets` (`GymTargetStorage`), with `MemoryGymTargets` as the twin. In code "target" alone is what a want is for; a gym a member wants raids of is a gym target.
@@ -20,7 +20,7 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 ## Sending direct messages
 
 - Direct messages go out only through `DmSender` (`src/services/dm-sender.ts`; the app's is `QueuedDmSender`): `send(job)` puts a message in line and returns, never waits for Discord and never throws. A timer starts at most one send every 100 ms, five on their way at most; priorities are `DM_PRIORITY.urgent` (meeting times, boss-set), `spawn` (spawns, Rocket grunts), `normal` (raid wants, gym targets, new trains, max battles, field research, Rocket hideouts), the oldest event first within one; a job carries `eventAt` and `expiresAt` and is dropped once that has passed. There is no retry (discord.js waits out a 429), a pause of a minute when Discord refuses to open DM channels, an hour's memory of members who take no DMs, and a log line with the numbers of every burst. Never loop over recipients and send: the legacy bot lost its gateway connection that way. Tests use `RecordingDms` or `QueuedDmSender` over `FakeDmGateway` (`test/support/dms.ts`, `pullUntilIdle`). In rehearsal mode the members' sender is `RehearsalDms` over the queue: only the allowlist is written to (`operations.md`).
-- A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), then "You asked to be told about" and one section per reason with a `Stop` button beside it, as many as the message has room for beside its links and picture (`stopButtonRoom`; the rest are named in `stopHint`). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a `TargetWant` is `target` with `rp`, `ri`, `re`, `dx`, `gx` (plan 8R-2: `rg:<type|none>`, `rl:<leader|any>`, `rv`, `rd`) and a subject's every box `subject` with `sp` / `st`, plan 8R-1; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag).
+- A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), then "You asked to be told about" and one section per reason with a `Stop` button beside it, as many as the message has room for beside its links and picture (`stopButtonRoom`; the rest are named in `stopHint`). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a `TargetWant` is `target` with `rp`, `ri`, `re`, `dx`, `gx` (plan 8R-2: `rg:<type|none>`, `rl:<leader|any>`, `rv`, `rd`) and a subject's every box `subject` with `sp` / `st`, plan 8R-1; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag). **Change…** (plan 8R-4, design 4, R15–R20): a reason of a Pokémon (`p`, `ps`, `rp`, `dx`, `gx`) or a tier (`t`, `ts`) has Change… instead of Stop (`changeOf` in `notify-service.ts`, `ShownReason.change`), `dm:<server>:change:sp:<dex>` (a form's species, an Unown letter its own, `changeSubject`) or `…:st:<level>` (`changeButtonId`); the reason's label names the want and the box it fired by ("Costumed Pikachu · Research"; a raid's plain want `Raids`, a spawn's `Spawns`, a shadow want `Shadow`), and reasons of one species or tier are one section with one Change… (`grouped`, named by the species where their names differ; counted once in `stopButtonRoom`, F5; like Stop, after all text, plan 8X-F). IV wants, items, Mega Energy, gym targets, the settings and (until plan 8R-4's Rocket dialog) Team GO Rocket keep Stop; a `stop` id of a species or tier (`subject`, of DMs before 8R-4, which were only ever sent on the test server, Matt) is `STALE_COMPONENT`. The press (`openChange`) answers before anything else: wants switched off (`notificationsEnabled`), a member no longer in the server (`ctx.members.find`) or nothing held of it ("**Pikachu** is not on your list; `/want` adds it.", S2: Change… never writes) are refused as `UserError`s, answered privately (`readForChange`, the one check of every Change…, B9); else it reads the rows in time (`readInTime`) and opens `/want`'s dialog for that server (`wantDialogFor` with `server`: "Your Pikachu want in <server>. Change what you want a DM about, or tick Remove to stop them all.", the server's name by `serverNameOf` through `plain`, F14; Remove at least, Mew's is Remove alone), its id carrying the server's snowflake. The Submit's guard takes a server or a snowflake in the id (`requireWantServer`); from a DM (`submitFromDm`) it is acknowledged with `deferUpdate`, asks again whether wants are on and the member is in that server (`changeRefusal`, B2: refused below with `followUp`, nothing written), writes for that server and the presser alone, shows that message's Change… of the subject as a disabled `Changed` (`Removed` where it took the want off; `withChanged`) under the messages' lock (`dmMessages`, `src/components/dm-messages.ts`, shared with Stop; the message read anew first), and answers below with `followUp`, also when the button could not be changed.
 - The owner's DM of a request for the Wayspot export tool (plan 8W-P; `web.md`, "The Wayspot export tool"): a new request, or one asked again after a refusal, queues a DM to `OWNER_ID` through `DmSender` (`normal`, expiring after 7 days; the queue is in memory, so a restart loses it and the page is the fallback), only while at most `OPEN_REQUESTS_NOTIFIED` 20 requests are open (any Discord account can ask; the rest wait on the page). It is `accessRequestDm` (`src/render/script-access-dm.ts`): who asks by name (`plainNoLinks`) and id as plain text, no mention, the community line through `plainNoLinks`, when, and **Approve** / **Refuse**, custom ids `scriptaccess:<row id>:approve|refuse:<askedAt in base 36>`. The handler (`scriptAccessControls`, `src/components/script-access.ts`) has a guard that the presser is `OWNER_ID` (a guard refusal counts against no throttle) and `SCRIPT_ACCESS_THROTTLE` 20 a minute; a press decides the request as it is now and for the asking it was drawn for, and edits the DM to what was decided and when without its buttons (`accessDecidedDm`): decided meanwhile, "Decided already: …"; asked again since, "Asked again since, <time>: decide it on its new DM or on the page."; a row gone or a button it cannot read is out of date. No fresh web login is needed for the DM.
 
 ## Spawn reports
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 28f0341a717006db2e9a8d6742a1b4d96149290a..999e4a48262bc946353bc6a34cd0564e0cd6890c 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -25,7 +25,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Fake interactions
 
-- Handler tests use the fakes of `test/support/fake-interactions.ts` (`fakeChatInput`, `fakeAutocomplete`, `fakeButton`, `fakeSelect`, `fakeModal`, `fakeMessageCommand` with the `targetMessage` it was used on, a forward's snapshot by `forwards`, `sent()`), which refuse what discord.js refuses (a second acknowledgement, a follow-up before any reply, a missing required option) and a form Discord would refuse (`checkModal`: a title of 45, 1 to 5 labels or rows, a label of 45, custom ids unique, string selects of 1 to 25 options, checkbox groups of 1 to 10 and radio groups of 2 to 10, values unique, labels and values of 100 and descriptions of 100, `min_values` / `max_values` within the options, no more defaults than may be chosen, a text display of 1 to 4,000 characters). A submitted form is as strict as discord.js (reading an input it did not submit, or as another type, throws) and carries `fields` (text), `selected` (select menus), `checked` (checkbox groups, `fields.getCheckboxGroup`) and `picked` (radio groups, `fields.getRadioGroup`); given the form the opener showed (`form`), it submits every input of it (an empty text as `''`, an unticked group or an optional menu as `[]`, an optional radio group as `null`), needs a value for a required menu, checkbox group or radio group (Discord refuses the Submit without one) and at least a menu's or group's `min_values` chosen unless it may stay empty and is (plan 8R-4: a first want's required Tell me about), a radio group's pick among its choices, and refuses inputs the form does not have (the `/gym` helper passes the form the bot showed); a control's message says who asked for it (`askedBy`: `interactionMetadata.user`) and whether it is private (`ephemeralMessage`). Test a handler that has `defer` through `InteractionRouter.handle`, or give the fake `deferred: true`.
+- Handler tests use the fakes of `test/support/fake-interactions.ts` (`fakeChatInput`, `fakeAutocomplete`, `fakeButton`, `fakeSelect`, `fakeModal`, `fakeMessageCommand` with the `targetMessage` it was used on, a forward's snapshot by `forwards`, `sent()`), which refuse what discord.js refuses (a second acknowledgement, a follow-up before any reply, a missing required option) and a form Discord would refuse (`checkModal`: a title of 45, 1 to 5 labels or rows, a label of 45, custom ids unique, string selects of 1 to 25 options, checkbox groups of 1 to 10 and radio groups of 2 to 10, values unique, labels and values of 100 and descriptions of 100, `min_values` / `max_values` within the options, no more defaults than may be chosen, a text display of 1 to 4,000 characters). A submitted form is as strict as discord.js (reading an input it did not submit, or as another type, throws) and carries `fields` (text), `selected` (select menus), `checked` (checkbox groups, `fields.getCheckboxGroup`) and `picked` (radio groups, `fields.getRadioGroup`); given the form the opener showed (`form`), it submits every input of it (an empty text as `''`, an unticked group or an optional menu as `[]`, an optional radio group as `null`), needs a value for a required menu, checkbox group or radio group (Discord refuses the Submit without one) and at least a menu's or group's `min_values` chosen unless it may stay empty and is (plan 8R-4: a first want's required Tell me about), a radio group's pick among its choices, and refuses inputs the form does not have (the `/gym` helper passes the form the bot showed); a control's message says who asked for it (`askedBy`: `interactionMetadata.user`) and whether it is private (`ephemeralMessage`). The bot's servers and their names (`interaction.client.guilds.cache`, what a press in a DM names a server by) are `serverNames` (plan 8R-4). Test a handler that has `defer` through `InteractionRouter.handle`, or give the fake `deferred: true`.
 - A dialog (plan 8Q, `discord-framework.md`) is read with `test/support/dialogs.ts`: `dialogOf(fake)` (undefined when none opened) or `shownDialog(fake)`, its `dialogTexts` / `dialogText`, and `dialogChoices` (value, label, description, and `picked` for a choice picked beforehand, Discord's `default`; of radio groups and, since plan 8X-1B, string selects). A Submit of a menu passes `selected`, of a line of text `fields`. Submit it with `fakeModal({ customId: dialog.custom_id, form: dialog, picked })`, so that the fake refuses a required choice left empty. The slow-read rule is tested by holding the read (a spy that resolves a promise when it is asked and never answers), then `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` before the press (the timer is set before the read is asked; the fake's `createdTimestamp` is the real now, so the budget is about `DIALOG_READ_MS`) and `vi.advanceTimersByTimeAsync(DIALOG_READ_MS)` once it was asked. A submitted form's `fields.fields` is the map of what it submitted, as discord.js's (`pickedOf` asks it). Plan 8R-4: a form's one tick box (`ComponentType.Checkbox` in a Label, nothing but its `custom_id` and `default`; `checkModal` refuses more) is submitted with `ticks` (by custom id; one not named comes back unticked) and read with `fields.getCheckbox`; `dialogFields(dialog)` / `dialogField(dialog, label)` give a dialog's fields with their labels, descriptions, kinds, a Checkbox's tick and a group's or menu's options as ticked to start with.
 
 ## Parties
diff --git a/src/commands/notifications/wants.ts b/src/commands/notifications/wants.ts
index a24ff8e314fe3ad0b9a59a1ffed705431c61e888..873bc3e55e26582bda05d33d909626270d2ff6ea 100644
--- a/src/commands/notifications/wants.ts
+++ b/src/commands/notifications/wants.ts
@@ -1,11 +1,16 @@
 import {
+  MessageFlags,
   SlashCommandBuilder,
+  type Message,
   type APIModalInteractionResponseCallbackData,
   type ChatInputCommandInteraction,
   type ModalSubmitInteraction,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { ComponentHandler, Guard, SimpleCommand } from '../../discord/command.js';
+import { decodeCustomId } from '../../discord/custom-id.js';
+import { dmMessages } from '../../components/dm-messages.js';
+import { changeButtonId, withChanged } from '../../render/notify-dm.js';
 import { deferSubmit, readInTime } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf, partyOf, requireGuild } from '../../discord/guards.js';
@@ -576,6 +581,93 @@ export const want: SimpleCommand = {
   },
 };
 
+/**
+ * The guard of the dialog's Submit (plan 8R-4): a server, or one named in its id (a dialog Change…
+ * of a DM opened, which has none).
+ */
+const requireWantServer: Guard = (interaction) => {
+  if (interaction.inGuild()) return;
+  const id = 'customId' in interaction ? decodeCustomId(interaction.customId) : undefined;
+  if (id === undefined || readWantDialogId(id)?.server === undefined) {
+    throw new UserError('This only works in a server.');
+  }
+};
+
+/** What Change… from a DM says where wants are switched off. */
+export const WANTS_OFF = 'Wants are switched off in that server: there is nothing to change.';
+/** What Change… from a DM says to a member no longer in the server it names. */
+export const NOT_A_MEMBER =
+  'You are no longer a member of that server: there is nothing to change there.';
+
+/**
+ * Why a change from a DM writes nothing for that server: wants switched off, or the member no
+ * longer in it; undefined where it may. Asked by a press of Change… (`dm.ts`) and again by the
+ * Submit (B2).
+ */
+export async function changeRefusal(
+  ctx: AppContext,
+  guildId: string,
+  memberId: string,
+): Promise<string | undefined> {
+  if (!notificationsEnabled(ctx.config)) return WANTS_OFF;
+  return (await ctx.members.find(guildId, memberId)) ? undefined : NOT_A_MEMBER;
+}
+
+/**
+ * A Submit from a DM (plan 8R-4, R20): acknowledged on the message the Change… was on
+ * (`deferUpdate`), written for the server of the id and the presser alone, then that message's
+ * Change… of the subject shown as a disabled `Changed` (`Removed` where it took the want off)
+ * under the messages' lock (`dmMessages`, read anew first), and answered below (`followUp`), also
+ * when the button could not be changed.
+ */
+async function submitFromDm(
+  interaction: ModalSubmitInteraction,
+  ctx: AppContext,
+  submit: WantDialogId,
+  given: BoxAnswer,
+): Promise<void> {
+  const guildId = submit.server;
+  if (guildId === undefined) throw new UserError(STALE_COMPONENT);
+  const message = interaction.isFromMessage() ? interaction.message : undefined;
+  if (message) await interaction.deferUpdate();
+  else await deferSubmit(interaction);
+  // Asked again (B2): the member may have left, or wants been switched off, since it opened.
+  const refusal = await changeRefusal(ctx, guildId, interaction.user.id);
+  if (refusal !== undefined) {
+    await (message
+      ? interaction.followUp({ content: refusal })
+      : interaction.editReply({ content: refusal }));
+    return;
+  }
+  const { after } = await ctx.wantBoxes.set(interaction.user.id, guildId, given, Date.now());
+  const said = boxesAnswer(ctx, submit.subject, after, given);
+  if (!message) {
+    await interaction.editReply({ content: said });
+    return;
+  }
+  const button = changeButtonId(guildId, submit.subject);
+  await dmMessages.run(message.id, async () => {
+    let now: Pick<Message, 'components' | 'flags'> = message;
+    try {
+      now = await interaction.fetchReply();
+    } catch (err) {
+      ctx.log.warn({ err }, 'could not read a direct message anew to show a change');
+    }
+    // A classic DM from before 8B-1 has no Change… to show (F5).
+    if (button === undefined || !now.flags.has(MessageFlags.IsComponentsV2)) return;
+    try {
+      const components = now.components.map((component) => component.toJSON());
+      await interaction.editReply({
+        components: withChanged(components, button, given.remove || after.length === 0),
+        flags: MessageFlags.IsComponentsV2,
+      });
+    } catch (err) {
+      ctx.log.warn({ err }, 'could not show a change on a direct message');
+    }
+  });
+  await interaction.followUp({ content: said });
+}
+
 /**
  * The Submit of `/want`'s dialog (kind `wantbox`): the boxes it shows now, as ticked; every
  * other box as it is; in one transaction under the member's lock (`WantBoxStorage.set`). The
@@ -583,7 +675,7 @@ export const want: SimpleCommand = {
  */
 export const wantBoxControls: ComponentHandler = {
   kind: WANT_BOX_KIND,
-  guards: [requireGuild],
+  guards: [requireWantServer],
   throttle: NOTIFICATION_THROTTLE,
   async modal(interaction, id, ctx) {
     const submit = readWantDialogId(id);
@@ -591,6 +683,10 @@ export const wantBoxControls: ComponentHandler = {
     // the dialog showed (B3), not those that can happen now.
     if (!submit) throw new UserError(STALE_COMPONENT);
     const given = answerOfSubmit(ctx, interaction, submit);
+    if (!interaction.inGuild()) {
+      await submitFromDm(interaction, ctx, submit, given);
+      return;
+    }
     await deferSubmit(interaction);
     const { after } = await ctx.wantBoxes.set(
       interaction.user.id,
diff --git a/src/commands/notifications/wild.test.ts b/src/commands/notifications/wild.test.ts
index f604b5809d96aeac16324c5eab01ea3790771aa9..323ad5d5513e8f3733f4f8bd5e9bd82cf8a20a5f 100644
--- a/src/commands/notifications/wild.test.ts
+++ b/src/commands/notifications/wild.test.ts
@@ -513,7 +513,10 @@ describe('/wild', () => {
     made.members.hide(WEST_CHANNEL, CAROL);
     await made.run({ pokemon: 'dratini', details: 'by the fountain' });
     expect(await made.told(BOB)).toEqual([
-      [`A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **Alice**.`, 'Dratini'],
+      [
+        `A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **Alice**.`,
+        'Dratini · Spawns',
+      ],
     ]);
     expect(made.dms.recipients).toEqual([BOB]);
     // After the messages for who is in a party, before the other news.
@@ -527,7 +530,7 @@ describe('/wild', () => {
     expect(linksOf(message)).toEqual([
       `Go to report ${postLink(made.gateway.guildId, WEST_CHANNEL, made.reports()[0]?.id ?? '')}`,
     ]);
-    expect(customIdsOf(message)).toEqual([`dm:${made.gateway.guildId}:stop:p:147`]);
+    expect(customIdsOf(message)).toEqual([`dm:${made.gateway.guildId}:change:sp:147`]);
     expect(made.members.batches.at(-1)).toMatchObject({ channelId: WEST_CHANNEL });
     expect(made.dms.jobs[0]?.expiresAt).toBe(PARTY_NOW + 30 * 60_000);
     // A spawn is no party: another member's report of the same Pokémon is news again.
@@ -572,7 +575,7 @@ describe('/wild', () => {
         expect.stringMatching(
           /^A wild \*\*Dratini\*\* with 100% IVs has been reported in <#\d+> by \*\*Alice\*\*\.$/,
         ),
-        'Perfect IV spawns · Dratini',
+        'Perfect IV spawns · Dratini · Spawns',
       ],
     ]);
     expect(await made.told(CAROL)).toHaveLength(1);
@@ -666,7 +669,7 @@ describe('/wild: Unown', () => {
         expect.stringMatching(
           /^A wild \*\*Unown \(F\)\*\* has been reported in <#\d+> by \*\*Alice\*\*\.$/,
         ),
-        'Unown (every form)',
+        'Unown · Spawns',
       ],
     ]);
   });
diff --git a/src/components/dm-messages.ts b/src/components/dm-messages.ts
new file mode 100644
index 0000000000000000000000000000000000000000..99fa2ec0ea72de5623f5ab6505916bd8e6dbd6dc
--- /dev/null
+++ b/src/components/dm-messages.ts
@@ -0,0 +1,9 @@
+import { KeyedLock } from '../services/keyed-lock.js';
+
+/**
+ * The direct messages whose buttons are being changed, one change at a time per message (plan
+ * 8R-4, F5: shared by a Stop's press, `dm.ts`, and the Submit of the dialog a Change… opened,
+ * `wantBoxControls`): two buttons of one message changed at once would each write the rows as
+ * their own interaction saw them, and the second would undo the first.
+ */
+export const dmMessages = new KeyedLock<string>();
diff --git a/src/components/dm.test.ts b/src/components/dm.test.ts
index c62baa22462cf72fc53c6d44d43448dcfd84d653..8d6f076e70cd23f3c8ddbe9412269b4eaa42e215 100644
--- a/src/components/dm.test.ts
+++ b/src/components/dm.test.ts
@@ -22,9 +22,15 @@ import { parseStopArgs, type NotifyReason } from '../domain/notify/reasons.js';
 import { boxTarget, type TargetWant } from '../domain/notify/target-wants.js';
 import { pokemonTarget, type NotificationTarget } from '../domain/pogo/notification-target.js';
 import { entryWant } from '../domain/pogo/wants.js';
-import { notifyDm, stopButtonId } from '../render/notify-dm.js';
+import { changeButtonId, notifyDm, stopButtonId } from '../render/notify-dm.js';
 import { dmControls } from './dm.js';
 import { components } from './index.js';
+import { dialogField, dialogFields, dialogText, shownDialog } from '../../test/support/dialogs.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { fakeModal } from '../../test/support/fake-interactions.js';
+import { loadSettings } from '../config/settings.js';
+import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
+import type { AppContext } from '../app-context.js';
 
 const HOME = '412345678901234567';
 const AWAY = '412345678901234568';
@@ -505,3 +511,238 @@ describe('the custom id of a stop button', () => {
     }
   });
 });
+
+describe('Change… under a direct message (plan 8R-4)', () => {
+  const PIKACHU = { kind: 'pokemon', dex: 25 } as const;
+  const change = changeButtonId(HOME, PIKACHU) ?? '';
+
+  /** The commands' controls in a DM, over wants in memory, Alice a member of the home server. */
+  function changing(more: Partial<AppContext> = {}) {
+    const wants = new MemoryWants();
+    const members = new FakeMemberDirectory().add(ALICE, 'Alice', HOME);
+    const { ctx, entries } = createTestContext({ wants, members, ...more });
+    const router = new InteractionRouter(ctx, [], components);
+    /** The DM: Change… of Pikachu (Raids, Research) and a gym's Stop. */
+    const message = fakeMessage(
+      notifyDm({ sentence: 'A raid.', links: [] }, [
+        { label: 'Pikachu', change: { customId: change, name: 'Pikachu', box: 'Raids' } },
+        { label: 'a gym', stop: stopButtonId(HOME, { kind: 'gym', gymId: 1 }) },
+      ]).components as unknown as FakeRow[],
+    );
+    const press = async (customId = change) => {
+      const pressed = fakeButton({
+        customId,
+        isDm: true,
+        userId: ALICE,
+        message,
+        serverNames: { [HOME]: 'Pittsburgh Pokémon GO' },
+      });
+      await router.handle(pressed as never);
+      return pressed;
+    };
+    const submit = async (
+      dialog: ReturnType<typeof shownDialog>,
+      given: { checked?: Record<string, string[]>; ticks?: Record<string, boolean> },
+    ) => {
+      const submitted = fakeModal({
+        customId: dialog.custom_id,
+        form: dialog,
+        isDm: true,
+        userId: ALICE,
+        message,
+        ...given,
+      });
+      await router.handle(submitted as never);
+      return submitted;
+    };
+    return { ctx, entries, wants, members, message, press, submit };
+  }
+
+  it('says that nothing is on the list, and opens nothing, where the member holds no want', async () => {
+    const made = changing();
+    const pressed = await made.press();
+    expect(pressed.showModal).not.toHaveBeenCalled();
+    expect(sent(pressed.reply).content).toBe('**Pikachu** is not on your list; `/want` adds it.');
+  });
+
+  it('opens the dialog of the want as stored, the server named, Remove shown, before any answer', async () => {
+    const made = changing();
+    await made.wants.set(ALICE, HOME, pokemonTarget(25), 'raid', true);
+    const pressed = await made.press();
+    expect(pressed.deferUpdate).not.toHaveBeenCalled();
+    const dialog = shownDialog(pressed);
+    expect(dialog.title).toBe('Pikachu: what for?');
+    expect(dialogText(dialog)).toBe(
+      'Your Pikachu want in Pittsburgh Pokémon GO. Change what you want a DM about, or tick ' +
+        'Remove to stop them all.',
+    );
+    expect(dialogFields(dialog).map((field) => field.label)).toEqual([
+      'Tell me about',
+      'Only costumed Pikachu',
+      'Remove Pikachu from my list',
+    ]);
+    expect(dialogField(dialog, 'Only costumed Pikachu').ticked).toBe(true);
+    // The server rides in the dialog's id: its Submit comes from a DM.
+    expect(dialog.custom_id).toMatch(new RegExp(`:${HOME}:~[0-9a-z]+$`));
+  });
+
+  it('tells a member no longer in the server, and where wants are switched off, instead', async () => {
+    const gone = changing({ members: new FakeMemberDirectory() });
+    await gone.wants.set(ALICE, HOME, pokemonTarget(25), 'raid');
+    const pressed = await gone.press();
+    expect(pressed.showModal).not.toHaveBeenCalled();
+    // Thrown as a `UserError` (B9): the router answers it privately.
+    expect(sent(pressed.reply)).toEqual({
+      content: 'You are no longer a member of that server: there is nothing to change there.',
+      flags: MessageFlags.Ephemeral,
+    });
+    const settings = loadSettings(TEST_SETTINGS_PATH);
+    const off = changing({
+      config: {
+        ...createTestContext().ctx.config,
+        settings: { ...settings, features: { ...settings.features, notifications: false } },
+      },
+    });
+    const refused = await off.press();
+    expect(sent(refused.reply).content).toBe(
+      'Wants are switched off in that server: there is nothing to change.',
+    );
+  });
+
+  it('writes from a DM, shows the button as Changed, and answers below', async () => {
+    const made = changing();
+    await made.wants.set(ALICE, HOME, pokemonTarget(25), 'raid');
+    const dialog = shownDialog(await made.press());
+    const submitted = await made.submit(dialog, {
+      checked: { boxes: ['raids', 'spawns'] },
+    });
+    expect(submitted.deferUpdate).toHaveBeenCalledTimes(1);
+    expect((await made.wants.list(ALICE, HOME)).wants).toEqual([
+      { target: pokemonTarget(25), scope: 'both' },
+    ]);
+    const shown = {
+      v2: true as const,
+      components: made.message.rows as unknown as V2Message['components'],
+    };
+    expect(buttonsOf(shown).map((button) => button.label)).toEqual(['Changed', 'Stop']);
+    expect(sent(submitted.followUp).content).toBe(
+      '**Pikachu**: Raids, Spawns. You will get a DM when one is reported in a region you can see.',
+    );
+  });
+
+  it('shows Removed where Remove was ticked, and answers even when the button cannot change', async () => {
+    const made = changing();
+    await made.wants.set(ALICE, HOME, pokemonTarget(25), 'raid');
+    const dialog = shownDialog(await made.press());
+    const submitted = fakeModal({
+      customId: dialog.custom_id,
+      form: dialog,
+      isDm: true,
+      userId: ALICE,
+      message: made.message,
+      ticks: { remove: true },
+    });
+    submitted.editReply.mockImplementationOnce(() => Promise.reject(new Error('Discord is away')));
+    await createTestContextRouter(made.ctx).handle(submitted as never);
+    expect(await made.wants.count(ALICE, HOME)).toBe(0);
+    expect(sent(submitted.followUp).content).toBe('**Pikachu** is off your list.');
+    expect(
+      made.entries.filter((entry) => entry.msg === 'could not show a change on a direct message'),
+    ).toMatchObject([{ level: 40 }]);
+    const again = await made.submit(dialog, { ticks: { remove: true } });
+    const shown = {
+      v2: true as const,
+      components: made.message.rows as unknown as V2Message['components'],
+    };
+    expect(buttonsOf(shown).map((button) => button.label)).toEqual(['Removed', 'Stop']);
+    expect(sent(again.followUp).content).toBe('**Pikachu** is off your list.');
+  });
+
+  it('checks again at Submit that the member is in the server and wants are on (B2)', async () => {
+    const made = changing();
+    await made.wants.set(ALICE, HOME, pokemonTarget(25), 'raid');
+    const dialog = shownDialog(await made.press());
+    made.members.remove(ALICE, HOME);
+    const submitted = await made.submit(dialog, { checked: { boxes: ['spawns'] } });
+    expect(submitted.deferUpdate).toHaveBeenCalledTimes(1);
+    expect(sent(submitted.followUp).content).toBe(
+      'You are no longer a member of that server: there is nothing to change there.',
+    );
+    expect(submitted.editReply).not.toHaveBeenCalled();
+    expect((await made.wants.list(ALICE, HOME)).wants).toEqual([
+      { target: pokemonTarget(25), scope: 'raid' },
+    ]);
+    const settings = loadSettings(TEST_SETTINGS_PATH);
+    const off = new InteractionRouter(
+      {
+        ...made.ctx,
+        config: {
+          ...made.ctx.config,
+          settings: { ...settings, features: { ...settings.features, notifications: false } },
+        },
+      },
+      [],
+      components,
+    );
+    made.members.add(ALICE, 'Alice', HOME);
+    const refused = fakeModal({
+      customId: dialog.custom_id,
+      form: dialog,
+      isDm: true,
+      userId: ALICE,
+      message: made.message,
+      checked: { boxes: ['spawns'] },
+    });
+    await off.handle(refused as never);
+    expect(sent(refused.followUp).content).toBe(
+      'Wants are switched off in that server: there is nothing to change.',
+    );
+    expect(await made.wants.count(ALICE, HOME)).toBe(1);
+  });
+
+  it('refuses a Submit in a DM whose id names no server, and writes nothing', async () => {
+    const made = changing();
+    await made.wants.set(ALICE, HOME, pokemonTarget(25), 'raid');
+    const dialog = shownDialog(await made.press());
+    const customId = dialog.custom_id.replace(`:${HOME}`, '');
+    const submitted = fakeModal({
+      customId,
+      form: dialog,
+      isDm: true,
+      userId: ALICE,
+      message: made.message,
+      checked: { boxes: ['spawns'] },
+    });
+    await createTestContextRouter(made.ctx).handle(submitted as never);
+    expect(sent(submitted.reply).content).toBe('This only works in a server.');
+    expect((await made.wants.list(ALICE, HOME)).wants).toEqual([
+      { target: pokemonTarget(25), scope: 'raid' },
+    ]);
+  });
+
+  it('writes the presser’s own rows alone, never another member’s', async () => {
+    const made = changing();
+    await made.wants.set(ALICE, HOME, pokemonTarget(25), 'raid');
+    await made.wants.set(BOB, HOME, pokemonTarget(25), 'raid');
+    const dialog = shownDialog(await made.press());
+    await made.submit(dialog, { ticks: { remove: true } });
+    expect(await made.wants.count(ALICE, HOME)).toBe(0);
+    expect((await made.wants.list(BOB, HOME)).wants).toEqual([
+      { target: pokemonTarget(25), scope: 'raid' },
+    ]);
+  });
+
+  it('refuses a Stop of a Pokémon or tier from before Change… as no longer active', async () => {
+    const made = changing();
+    await made.wants.set(ALICE, HOME, pokemonTarget(25), 'raid');
+    const subject = stopButtonId(HOME, { kind: 'subject', subject: PIKACHU }) ?? '';
+    const pressed = await made.press(subject);
+    expect(sent(pressed.reply).content).toBe('This control is no longer active.');
+    expect(await made.wants.count(ALICE, HOME)).toBe(1);
+  });
+});
+
+/** A router over every control, for a fake handled outside a test's own. */
+function createTestContextRouter(ctx: AppContext): InteractionRouter {
+  return new InteractionRouter(ctx, [], components);
+}
diff --git a/src/components/dm.ts b/src/components/dm.ts
index ff340c03160d85686b3a76453bcd1af48870fadf..a804f7755d4421ccff952698a837f72c56d44451 100644
--- a/src/components/dm.ts
+++ b/src/components/dm.ts
@@ -1,8 +1,7 @@
-import { ComponentType, MessageFlags, type Message } from 'discord.js';
+import { ComponentType, MessageFlags, type ButtonInteraction, type Message } from 'discord.js';
 import type { AppContext } from '../app-context.js';
 import { SCOPE_WORDS } from '../commands/notifications/want-input.js';
-import { rewardLabel, scopeOf, subjectLabel } from '../commands/notifications/want-boxes.js';
-import { removalAnswer } from '../domain/pogo/species-answer.js';
+import { rewardLabel } from '../commands/notifications/want-boxes.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { isSnowflake } from '../db/snowflake.js';
 import { UserError } from '../discord/errors.js';
@@ -11,6 +10,7 @@ import { MEMBER_WRITE_THROTTLE } from '../discord/throttle.js';
 import { parseStopArgs, type NotifyReason } from '../domain/notify/reasons.js';
 import { wantTargetLabel, wantToken } from '../domain/pogo/wants.js';
 import {
+  CHANGE_ACTION,
   DM_KIND,
   STOP_ACTION,
   withoutButton,
@@ -19,7 +19,12 @@ import {
 } from '../render/notify-dm.js';
 import { gymName } from '../render/raid-post.js';
 import { plain } from '../render/text.js';
-import { KeyedLock } from '../services/keyed-lock.js';
+import { dialogName, scopeOf } from '../commands/notifications/want-boxes.js';
+import { notificationsEnabled } from '../commands/notifications/shared.js';
+import { NOT_A_MEMBER, WANTS_OFF, wantDialogFor } from '../commands/notifications/wants.js';
+import { readInTime } from '../discord/dialog.js';
+import type { BoxSubject } from '../domain/pogo/want-boxes.js';
+import { dmMessages } from './dm-messages.js';
 
 /**
  * Stops one reason for the member who pressed, in the server the button names: removes the
@@ -30,7 +35,7 @@ async function stop(
   ctx: AppContext,
   memberId: string,
   guildId: string,
-  reason: NotifyReason,
+  reason: Exclude<NotifyReason, { kind: 'subject' }>,
 ): Promise<string> {
   switch (reason.kind) {
     case 'want': {
@@ -81,18 +86,6 @@ async function stop(
         ? `Removed **${name}** from your list for that server. \`/want\` there adds it again.`
         : `**${name}** was already removed from your list for that server.`;
     }
-    case 'subject': {
-      const name = plain(subjectLabel(ctx, reason.subject));
-      const { before } = await ctx.wantBoxes.set(
-        memberId,
-        guildId,
-        removalAnswer(scopeOf(ctx, reason.subject)),
-        Date.now(),
-      );
-      return before.length > 0
-        ? `Removed **${name}** from your list for that server. \`/want\` there adds it again.`
-        : `**${name}** was already removed from your list for that server.`;
-    }
   }
 }
 
@@ -103,12 +96,59 @@ function rowsOf(message: Pick<Message, 'components'>): ControlRows {
   );
 }
 
+/** The name of a server the bot is in, for a press from a DM, which has none. */
+export function serverNameOf(
+  interaction: { client: { guilds: { cache: { get(id: string): { name: string } | undefined } } } },
+  guildId: string,
+): string {
+  return interaction.client.guilds.cache.get(guildId)?.name ?? 'that server';
+}
+
 /**
- * The messages whose buttons are being taken off, one press at a time per message: two buttons
- * of one message pressed quickly would each write the rows as its own press saw them, and the
- * second would put the first one's button back.
+ * Change… (plan 8R-4, design 4, R15–R20): the dialog of a species, a form beyond the Which field
+ * or a tier for the server of the button, with the member's rows as stored, read in time
+ * (`readInTime`) before anything is answered (the dialog must be the first answer). It never
+ * writes (S2): nothing held is said, and so is a member no longer in that server and wants
+ * switched off.
  */
-const messages = new KeyedLock<string>();
+async function openChange(
+  interaction: ButtonInteraction,
+  ctx: AppContext,
+  guildId: string,
+  subject: BoxSubject,
+): Promise<void> {
+  const memberId = interaction.user.id;
+  const scope = scopeOf(ctx, subject);
+  const held = await readForChange(interaction, ctx, guildId, () =>
+    ctx.wantBoxes.held(memberId, guildId, scope),
+  );
+  if (held.length === 0) {
+    throw new UserError(
+      `**${plain(dialogName(ctx, subject))}** is not on your list; \`/want\` adds it.`,
+    );
+  }
+  const server = { id: guildId, name: serverNameOf(interaction, guildId) };
+  await interaction.showModal(wantDialogFor(ctx, subject, held, { server, openedAt: Date.now() }));
+}
+
+/**
+ * The one check of a press of Change… (B9): wants switched off, or a member no longer in the
+ * server of the button, refused as a `UserError` (answered privately); else what `read` reads,
+ * with the member, in time (`readInTime`), before any answer.
+ */
+async function readForChange<T>(
+  interaction: ButtonInteraction,
+  ctx: AppContext,
+  guildId: string,
+  read: () => Promise<T>,
+): Promise<T> {
+  if (!notificationsEnabled(ctx.config)) throw new UserError(WANTS_OFF);
+  const [member, value] = await readInTime(ctx.log, interaction, () =>
+    Promise.all([ctx.members.find(guildId, interaction.user.id), read()]),
+  );
+  if (!member) throw new UserError(NOT_A_MEMBER);
+  return value;
+}
 
 /**
  * The buttons under a direct message of the notifier (custom-id kind `dm`; the id is the
@@ -124,19 +164,30 @@ const messages = new KeyedLock<string>();
  * message cannot be read anew its components are those the press carries, and when it cannot be
  * changed the button stays (pressing it again says that it was removed already).
  *
- * It has no guards: a press comes from a DM, where there is no server and no member.
+ * It has no guards: a press comes from a DM, where there is no server and no member. Change… (plan
+ * 8R-4, `dm:<server>:change:sp:<dex>[:<form>]`, `…:st:<level>`) opens `/want`'s dialog instead
+ * (`openChange`); its Submit is `wantBoxControls`'.
  */
 export const dmControls: ComponentHandler = {
   kind: DM_KIND,
   throttle: MEMBER_WRITE_THROTTLE,
   async button(interaction, id, ctx) {
+    if (id.action === CHANGE_ACTION) {
+      const asked = parseStopArgs(id.args);
+      if (asked?.kind !== 'subject' || !isSnowflake(id.id)) throw new UserError(STALE_COMPONENT);
+      await openChange(interaction, ctx, id.id, asked.subject);
+      return;
+    }
     const reason = id.action === STOP_ACTION ? parseStopArgs(id.args) : undefined;
-    // The id of a stop button is the snowflake of a server.
-    if (!reason || !isSnowflake(id.id)) throw new UserError(STALE_COMPONENT);
+    // The id of a stop button is the snowflake of a server. A species or tier has Change…
+    // since plan 8R-4; its Stop of before was only ever on the test server (Matt): refused.
+    if (!reason || reason.kind === 'subject' || !isSnowflake(id.id)) {
+      throw new UserError(STALE_COMPONENT);
+    }
     // The database first: the button goes only once it is known what came of it.
     await interaction.deferUpdate();
     const said = await stop(ctx, interaction.user.id, id.id, reason);
-    await messages.run(interaction.message.id, async () => {
+    await dmMessages.run(interaction.message.id, async () => {
       let now: Pick<Message, 'components' | 'flags'> = interaction.message;
       try {
         now = await interaction.fetchReply();
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index b2f559c10b41d56b2e5673dca9dac3005997e231..d65445e0aa889d6ed843f3fcc2df1b29cc17a8cc 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -8,7 +8,9 @@
  * `dm:<server>:stop:<reason>` stops one reason the message came for; the reason is spelled as
  * `stopArgs` (`src/domain/notify/reasons.ts`) says: `p:<dex>[:<form>]`, `ps:…`, `t:<level>`,
  * `ts:<level>`, `iv:perfect|zero`, `g:<gym id>`, `boss`, `train`. (The spec's example
- * `dm:stop:pokemon:150` had no id and no server; this replaces it.)
+ * `dm:stop:pokemon:150` had no id and no server; this replaces it.) Since plan 8R-4 a Pokémon's
+ * or a tier's reason has `dm:<server>:change:sp:<dex>[:<form>]` or `…:change:st:<level>`, which
+ * opens `/want`'s dialog for that server (`wantbox:…:set2:…:<server>:~<token>`).
  *
  * The controls of `/iam` without a role have the kind `roles` (`src/render/role-menus.ts`). A
  * menu is `roles:<group>:pick:<part>:<page>`: the id is the row id of the group it shows, or
diff --git a/src/domain/pogo/species-answer.ts b/src/domain/pogo/species-answer.ts
index d9801eafb1f0abe083264617248d341384a2e07c..95c9da53aaea51defaa607623a8f488db9f40c01 100644
--- a/src/domain/pogo/species-answer.ts
+++ b/src/domain/pogo/species-answer.ts
@@ -51,6 +51,16 @@ export function answerScopeOf(subject: BoxSubject, entries: number): AnswerScope
   return { subject, wide };
 }
 
+/**
+ * The subject whose dialog Change… opens for a want of a subject (plan 8R-4): a form's species
+ * where the species has a Which field (`entries`, its number in the catalogue, `WHICH_CAP` at
+ * most), else the subject itself (a tier, a species, an Unown letter).
+ */
+export function changeSubject(subject: BoxSubject, entries: number): BoxSubject {
+  if (subject.kind !== 'pokemon' || subject.form === undefined) return subject;
+  return entries > 1 && entries <= WHICH_CAP ? { kind: 'pokemon', dex: subject.dex } : subject;
+}
+
 /**
  * One row of a scope as the dialog reads it: its form (absent: the subject's own row, of a wide
  * scope the species row, which is every form), its boxes, and whether it is costumed only (every
diff --git a/src/render/notify-dm.test.ts b/src/render/notify-dm.test.ts
index 659234f5fa5aa317f4cfa3ddba7ccfcd6709297a..6cae74a5a9dc647b2c5f6f1401071f183d884005 100644
--- a/src/render/notify-dm.test.ts
+++ b/src/render/notify-dm.test.ts
@@ -29,6 +29,8 @@ import {
   trainDmSentence,
   withoutButton,
   withStopped,
+  changeButtonId,
+  withChanged,
   type ControlRows,
   type MaxDmView,
   type RaidDmView,
@@ -328,6 +330,75 @@ describe('notifyDm', () => {
     expect(dmReasons(message)).toHaveLength(reasons.length);
   });
 
+  it('gives a Pokémon or a tier Change…, one section for every reason of it (plan 8R-4, F5)', () => {
+    const change = `dm:${GUILD}:change:sp:25`;
+    const message = notifyDm({ sentence: 'A raid.', brief, links: [postButton(LINK)] }, [
+      {
+        label: 'Costumed Pikachu',
+        change: { customId: change, name: 'Costumed Pikachu', box: 'Raids' },
+      },
+      reason(1, { label: 'raids at The Stacks' }),
+      {
+        label: 'Pikachu (research)',
+        change: { customId: change, name: 'Costumed Pikachu', box: 'Research' },
+      },
+    ]);
+    expect(dmReasons(message)).toEqual([
+      'Costumed Pikachu · Raids, Research',
+      'raids at The Stacks',
+    ]);
+    expect(buttonsOf(message).slice(1)).toEqual([
+      {
+        label: 'Change…',
+        emoji: undefined,
+        style: ButtonStyle.Secondary,
+        customId: change,
+        url: undefined,
+      },
+      {
+        label: 'Stop',
+        emoji: undefined,
+        style: ButtonStyle.Secondary,
+        customId: `dm:${GUILD}:stop:g:1`,
+        url: undefined,
+      },
+    ]);
+    expectV2Sendable(message);
+    // A Change… is a button like Stop: after all text (plan 8X-F), below a reason without one.
+    const mixed = notifyDm({ sentence: 'A raid.', links: [] }, [
+      { label: 'Costumed Pikachu', change: { customId: change, name: 'Pikachu', box: 'Raids' } },
+      reason(2, { label: 'Long form', stop: undefined, command: '/unwant' }),
+    ]);
+    const types = (mixed.components[0] as { components: { type: ComponentType }[] }).components.map(
+      (part) => part.type,
+    );
+    expect(types.at(-1)).toBe(ComponentType.Section);
+    expect(types.at(-2)).toBe(ComponentType.TextDisplay);
+    // A Change… whose id does not fit is named with the command that changes it.
+    const unfit = notifyDm({ sentence: 'A raid.', links: [] }, [
+      { label: 'X', command: '/want', change: { customId: undefined, name: 'X', box: 'Raids' } },
+    ]);
+    expect(dmReasons(unfit)).toEqual(['X · Raids']);
+    expect(textDisplays(unfit).at(-1)).toContain('use `/want` in the server');
+  });
+
+  it('counts one Change… once among the buttons a message has room for', () => {
+    const many = Array.from({ length: 12 }, (_, n): ShownReason => {
+      const customId = `dm:${GUILD}:change:sp:${String(n + 1)}`;
+      return { label: `p${String(n)}`, change: { customId, name: `P${String(n)}`, box: 'Raids' } };
+    });
+    // Each species twice: a second reason of one species takes no room of its own.
+    const twice = many.flatMap((one) => [
+      one,
+      { ...one, change: { ...one.change!, box: 'Research' } },
+    ]);
+    const message = notifyDm({ sentence: 'A raid.', brief, links: [postButton(LINK)] }, twice);
+    const changes = buttonsOf(message).filter((button) => button.label === 'Change…');
+    // The container, the news beside its picture, the row of one link, the line and the heading.
+    expect(changes).toHaveLength(Math.min(12, stopButtonRoom(1 + 3 + 2 + 2)));
+    expectV2Sendable(message);
+  });
+
   it('shows the news as text alone without a picture, and in its own colour without a brief', () => {
     const plainNews = notifyDm(
       { sentence: 'A train.', brief: { accent: 0x3498db, lines: ['No route yet'] }, links: [] },
@@ -431,6 +502,35 @@ describe('the stop buttons of a message', () => {
     expect(stopButtonId(GUILD, { kind: 'boss-set' })).toBe(`dm:${GUILD}:stop:boss`);
   });
 
+  it('spells Change… by the server and the species, form or tier its dialog opens for', () => {
+    expect(changeButtonId(GUILD, { kind: 'pokemon', dex: 25 })).toBe(`dm:${GUILD}:change:sp:25`);
+    expect(changeButtonId(GUILD, { kind: 'pokemon', dex: 201, form: 'unown_a' })).toBe(
+      `dm:${GUILD}:change:sp:201:unown_a`,
+    );
+    expect(changeButtonId(GUILD, { kind: 'tier', level: 'T5' })).toBe(`dm:${GUILD}:change:st:T5`);
+  });
+
+  it('turns Change… after a Submit into a disabled Changed or Removed (plan 8R-4)', () => {
+    const change = `dm:${GUILD}:change:sp:25`;
+    const message = notifyDm({ sentence: 'A raid.', links: [] }, [
+      { label: 'Pikachu', change: { customId: change, name: 'Pikachu', box: 'Raids' } },
+      { label: 'a gym', stop: `dm:${GUILD}:stop:g:1` },
+    ]);
+    for (const [removed, label] of [
+      [false, 'Changed'],
+      [true, 'Removed'],
+    ] as const) {
+      const done = withChanged(message.components, change, removed);
+      expect(buttonsOf({ v2: true, components: done }).map((button) => button.label)).toEqual([
+        label,
+        'Stop',
+      ]);
+      // The one pressed, alone, is disabled; its id stays.
+      expect(JSON.stringify(done).match(/"disabled":true/g)).toHaveLength(1);
+      expect(buttonsOf({ v2: true, components: done })[0]?.customId).toBe(change);
+    }
+  });
+
   it('turns a pressed button into a disabled Stopped and leaves the rest as it was', () => {
     const ids = [1, 2, 3].map((n) => `dm:${GUILD}:stop:g:${String(n)}`);
     const message = notifyDm(
diff --git a/src/render/notify-dm.ts b/src/render/notify-dm.ts
index 435c69ccb7dcd2a01c57de3db4bcb0805e9ad6fd..c9430060fb4ee62c8ca7124e5298ee8b12d60623 100644
--- a/src/render/notify-dm.ts
+++ b/src/render/notify-dm.ts
@@ -10,6 +10,7 @@ import {
 import { encodeCustomIdIfFits } from '../discord/custom-id.js';
 import type { V2Message } from '../discord/party-gateway.js';
 import { stopArgs, type NotifyReason } from '../domain/notify/reasons.js';
+import type { BoxSubject } from '../domain/pogo/want-boxes.js';
 import type { TrainKind } from '../domain/party/party.js';
 import { raidTierLabel, type RaidTier } from '../domain/pogo/raid-tier.js';
 import { TRAIN_KIND_WORDS } from './train-words.js';
@@ -30,6 +31,14 @@ import {
 export const DM_KIND = 'dm';
 /** The action of a button that stops one reason a direct message came for. */
 export const STOP_ACTION = 'stop';
+/**
+ * The action of Change… (plan 8R-4): it opens `/want`'s dialog of a species, a form beyond the
+ * Which field or a tier for the server of the button (`changeButtonId`).
+ */
+export const CHANGE_ACTION = 'change';
+const CHANGE_LABEL = 'Change…';
+const CHANGED_LABEL = 'Changed';
+const REMOVED_LABEL = 'Removed';
 /** The label of a stop button, and of one that was pressed (it stays, disabled). */
 const STOP_LABEL = 'Stop';
 const STOPPED_LABEL = 'Stopped';
@@ -63,6 +72,21 @@ export function stopButtonId(guildId: string, reason: NotifyReason): string | un
   });
 }
 
+/**
+ * The custom id of Change… of a subject in a server (plan 8R-4): `dm:<server>:change:sp:<dex>`
+ * for a species, `…:sp:<dex>:<form>` for a form beyond the Which field (an Unown letter),
+ * `…:st:<level>` for a tier (`stopArgs`' spelling of a subject); undefined where it would not
+ * fit (a form with a very long key: the message names the command then).
+ */
+export function changeButtonId(guildId: string, subject: BoxSubject): string | undefined {
+  return encodeCustomIdIfFits({
+    kind: DM_KIND,
+    id: guildId,
+    action: CHANGE_ACTION,
+    args: stopArgs({ kind: 'subject', subject }),
+  });
+}
+
 /** A message's rows of controls as Discord's API has them. */
 export type ControlRows = APIActionRowComponent<APIComponentInMessageActionRow>[];
 
@@ -90,11 +114,33 @@ export function withoutButton(rows: ControlRows, customId: string): ControlRows
 export function withStopped(
   components: readonly APIMessageTopLevelComponent[],
   customId: string,
+): APIMessageTopLevelComponent[] {
+  return withPressed(components, customId, STOPPED_LABEL);
+}
+
+/**
+ * A components-v2 direct message after a Submit of the dialog its Change… opened (plan 8R-4):
+ * that button disabled and labelled `Changed`, or `Removed` where Remove was ticked, as a pressed
+ * Stop is (`withStopped`).
+ */
+export function withChanged(
+  components: readonly APIMessageTopLevelComponent[],
+  customId: string,
+  removed: boolean,
+): APIMessageTopLevelComponent[] {
+  return withPressed(components, customId, removed ? REMOVED_LABEL : CHANGED_LABEL);
+}
+
+/** The message with the button of this custom id disabled, under `label`; the rest as it was. */
+function withPressed(
+  components: readonly APIMessageTopLevelComponent[],
+  customId: string,
+  label: string,
 ): APIMessageTopLevelComponent[] {
   const visit = (component: object): object => {
     const button = component as { type?: unknown; custom_id?: unknown };
     if (button.type === ComponentType.Button && button.custom_id === customId) {
-      return { ...component, style: ButtonStyle.Secondary, label: STOPPED_LABEL, disabled: true };
+      return { ...component, style: ButtonStyle.Secondary, label, disabled: true };
     }
     const nested = component as { components?: object[]; accessory?: object };
     return {
@@ -300,6 +346,43 @@ export interface ShownReason {
   stop?: string | undefined;
   /** The command that stops it in the server, as a member types it: `/unwant`. */
   command?: string;
+  /**
+   * A reason of a Pokémon or a tier (plan 8R-4): Change… instead of Stop. Its custom id
+   * (`changeButtonId`; undefined where it does not fit), the want's name (made plain:
+   * `Costumed Pikachu`) and the box it fired by (`Raids`, `Research`). Reasons of one custom id
+   * are one section, `Pikachu · Raids, Research`, with one button (F5), named by `group` (the
+   * species') where their names differ (a form's want beside the species').
+   */
+  change?: { customId: string | undefined; name: string; box: string; group?: string };
+}
+
+/** The reasons as the sections show them: those of one Change… together, in their order. */
+function grouped(reasons: readonly ShownReason[]): ShownReason[] {
+  const shown: ShownReason[] = [];
+  const boxes = new Map<string, string[]>();
+  const names = new Map<string, Set<string>>();
+  for (const reason of reasons) {
+    const id = reason.change?.customId;
+    const known = id === undefined ? undefined : boxes.get(id);
+    if (reason.change && known) {
+      if (!known.includes(reason.change.box)) known.push(reason.change.box);
+      names.get(id ?? '')?.add(reason.change.name);
+      continue;
+    }
+    if (reason.change && id !== undefined) {
+      boxes.set(id, [reason.change.box]);
+      names.set(id, new Set([reason.change.name]));
+    }
+    shown.push(reason);
+  }
+  return shown.map((reason) => {
+    if (!reason.change) return reason;
+    const id = reason.change.customId;
+    const said = id === undefined ? [reason.change.box] : (boxes.get(id) ?? []);
+    const several = id !== undefined && (names.get(id)?.size ?? 0) > 1;
+    const name = several ? (reason.change.group ?? reason.change.name) : reason.change.name;
+    return { ...reason, label: `${name} · ${said.join(', ')}` };
+  });
 }
 
 /** A button under the news of a direct message: the post, the report, the gym's place. */
@@ -345,12 +428,12 @@ export interface DmNews {
 export const NEWS_COLOUR = 0x3498db;
 
 /** The button of a reason, as a section shows it beside the reason's label. */
-function stopButton(customId: string): APIButtonComponentWithCustomId {
+function stopButton(customId: string, label = STOP_LABEL): APIButtonComponentWithCustomId {
   return {
     type: ComponentType.Button,
     style: ButtonStyle.Secondary,
     custom_id: customId,
-    label: STOP_LABEL,
+    label,
   };
 }
 
@@ -401,8 +484,12 @@ export function notifyDm(news: DmNews, reasons: readonly ShownReason[]): V2Messa
     let buttons = 0;
     const stoppable: APIComponentInContainer[] = [];
     const rest: ShownReason[] = [];
-    for (const reason of reasons) {
-      if (reason.stop !== undefined && buttons < most) {
+    for (const reason of grouped(reasons)) {
+      const change = reason.change?.customId;
+      if (reason.change && change !== undefined && buttons < most) {
+        buttons += 1;
+        stoppable.push(section(label(reason), stopButton(change, CHANGE_LABEL)));
+      } else if (!reason.change && reason.stop !== undefined && buttons < most) {
         buttons += 1;
         stoppable.push(section(label(reason), stopButton(reason.stop)));
       } else {
@@ -413,7 +500,7 @@ export function notifyDm(news: DmNews, reasons: readonly ShownReason[]): V2Messa
       const hint = stopHint(rest);
       parts.push(textDisplay([...rest.map(label), ...(hint === '' ? [] : [hint])].join('\n')));
     }
-    // The Stop buttons last, after all text (plan 8X-F).
+    // The Stop and Change… buttons last, after all text (plan 8X-F), in the reasons' order.
     parts.push(...stoppable);
   }
   return {
diff --git a/src/services/notify-service.max.test.ts b/src/services/notify-service.max.test.ts
index f39c4880bb602a08ddab1e487d1bdec63171a292..39ff5d01489a90294fb6d5df0a0e46a4b8a990bc 100644
--- a/src/services/notify-service.max.test.ts
+++ b/src/services/notify-service.max.test.ts
@@ -70,7 +70,7 @@ describe('NotifyService: a max battle is reported (plan 8X-3, design 3.4)', () =
       `A **Dynamax Machamp (2★)** battle has been reported at **Gazebo of the Park** ` +
         `(<#${WEST_CHANNEL}>) by **Rita**.`,
     );
-    expect(dmReasons(message)).toEqual(['Dynamax Machamp']);
+    expect(dmReasons(message)).toEqual(['Machamp · Dynamax']);
     // Under the news, above the reasons and their Stop buttons (plan 8X-F).
     expect(textDisplays(message)[1]).toBe(
       "-# You won't be told about more Dynamax Machamp battles for an hour.",
diff --git a/src/services/notify-service.parties.test.ts b/src/services/notify-service.parties.test.ts
index 0da07ae8a45b48154185a5ac376b8f24baead3aa..c4df8150b30dec62325b2284aaa50c51754b9c18 100644
--- a/src/services/notify-service.parties.test.ts
+++ b/src/services/notify-service.parties.test.ts
@@ -183,7 +183,7 @@ describe('NotifyService: an egg gets its boss', () => {
     expect(made.dms.to(ALICE)).toHaveLength(1);
     expect(told(made, ALICE)[0]).toEqual([
       expect.stringMatching(/^The boss of the egg at/),
-      'the boss of your eggs · Yveltal',
+      'the boss of your eggs · Yveltal · Raids',
     ]);
     // Dora is not signed up: for her it is news of a raid she wants.
     expect(told(made, DORA)[0]?.[0]).toMatch(/^The raid at \*\*The Stacks\*\* .* now has its boss/);
diff --git a/src/services/notify-service.research.test.ts b/src/services/notify-service.research.test.ts
index a3343eb932e7d8d8884880612cf6e12b5c067c8f..e8cc378753424c0d01989c5507dde54fdaf476aa 100644
--- a/src/services/notify-service.research.test.ts
+++ b/src/services/notify-service.research.test.ts
@@ -95,7 +95,7 @@ describe('NotifyService: field research is reported (plan 8R-1, design 7)', () =
       '- **Yellow Mural 2** · Market Street',
       'Until midnight.',
     ]);
-    expect(dmReasons(message)).toEqual(['Dratini (research)']);
+    expect(dmReasons(message)).toEqual(['Dratini · Research']);
     // In rehearsal mode (no posts) the DM has no link.
     expect(linksOf(message)).toEqual([]);
     expect(made.dms.jobs[0]).toEqual(
diff --git a/src/services/notify-service.rocket.test.ts b/src/services/notify-service.rocket.test.ts
index 399a27e32f16e785924510ecb128877ffc3b4e2f..3c0118d167c566fc557ee71de55576f2bb9953df 100644
--- a/src/services/notify-service.rocket.test.ts
+++ b/src/services/notify-service.rocket.test.ts
@@ -140,7 +140,7 @@ describe('NotifyService: Team GO Rocket is reported (plan 8R-2, design 7)', () =
     const made = await rocketWith({ targetWants: undefined });
     await made.wants.set(ALICE, made.gateway.guildId, pokemonTarget(258, undefined, true), 'raid');
     await made.report('grunt:water');
-    expect(made.dms.to(ALICE).map(dmReasons)).toEqual([['Shadow Mudkip']]);
+    expect(made.dms.to(ALICE).map(dmReasons)).toEqual([['Mudkip · Shadow']]);
   });
 
   it('tells who wants a shadow of a catch: the species, or the very form', async () => {
@@ -157,7 +157,7 @@ describe('NotifyService: Team GO Rocket is reported (plan 8R-2, design 7)', () =
     await made.wants.set(CAROL, made.gateway.guildId, pokemonTarget(258), 'both');
     await made.report('grunt:water');
     await made.report('leader:arlo', west(2));
-    expect(made.dms.to(ALICE).map(dmReasons)).toEqual([['Shadow Mudkip']]);
+    expect(made.dms.to(ALICE).map(dmReasons)).toEqual([['Mudkip · Shadow']]);
     expect(made.dms.to(BOB)).toHaveLength(1);
     expect(made.dms.recipients).not.toContain(CAROL);
   });
diff --git a/src/services/notify-service.test.ts b/src/services/notify-service.test.ts
index 0374a0ea2016f671989369c821e6f6d0c13cd606..897616988e17e2af0352e7d43bf948137ce18bf2 100644
--- a/src/services/notify-service.test.ts
+++ b/src/services/notify-service.test.ts
@@ -85,8 +85,8 @@ describe('NotifyService: a raid is reported', () => {
     const sentence = `A raid for **Yveltal** has been reported at **The Stacks** (<#${WEST_CHANNEL}>) by **Rhea**.`;
     expect(made.dms.recipients).toEqual([ALICE, BOB, CAROL]);
     expect(told(made, ALICE)).toEqual([sentence]);
-    expect(why(made, ALICE)).toEqual(['Yveltal']);
-    expect(why(made, BOB)).toEqual(['T5 raids']);
+    expect(why(made, ALICE)).toEqual(['Yveltal · Raids']);
+    expect(why(made, BOB)).toEqual(['T5 · Raids']);
     expect(why(made, CAROL)).toEqual(['raids at The Stacks']);
     // Under the news the post in brief, the buttons to the post and the gym; none of the post's
     // controls, and it pings nobody.
@@ -101,7 +101,7 @@ describe('NotifyService: a raid is reported', () => {
       `Go to post ${link}`,
       'Map https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05',
     ]);
-    expect(customIdsOf(message)).toEqual([`dm:${made.gateway.guildId}:stop:p:717`]);
+    expect(customIdsOf(message)).toEqual([`dm:${made.gateway.guildId}:change:sp:717`]);
     expect(message.mention).toBeUndefined();
     const [job] = made.dms.jobs;
     expect(job).toMatchObject({ priority: DM_PRIORITY.normal, eventAt: made.clock.now });
@@ -121,8 +121,8 @@ describe('NotifyService: a raid is reported', () => {
       tier: { level: 'T1', shadow: false },
     });
     expect(costumed.dms.recipients).toEqual([ALICE, BOB]);
-    expect(why(costumed, ALICE)).toEqual(['Costumed Pikachu']);
-    expect(why(costumed, BOB)).toEqual(['Pikachu']);
+    expect(why(costumed, ALICE)).toEqual(['Costumed Pikachu · Raids']);
+    expect(why(costumed, BOB)).toEqual(['Pikachu · Raids']);
     // A Pikachu of a tier the list does not have it costumed in is plain.
     const plainRaid = await reported(wanting, {
       boss: { key: 'pikachu' },
@@ -142,9 +142,8 @@ describe('NotifyService: a raid is reported', () => {
       { boss: { key: 'giratina_origin' } },
     );
     expect(made.dms.jobs).toHaveLength(1);
-    expect(why(made, ALICE)).toEqual([
-      'Giratina (Origin Forme) · T5 raids · Giratina (every form) · raids at The Stacks',
-    ]);
+    // Giratina's two wants (a form and the species) are one section with one Change….
+    expect(why(made, ALICE)).toEqual(['Giratina · Raids · T5 · Raids · raids at The Stacks']);
   });
 
   it('tells only the tier and the gym for an egg, and expires with the raid', async () => {
@@ -165,7 +164,7 @@ describe('NotifyService: a raid is reported', () => {
     );
     expect(made.dms.recipients).toEqual([BOB, CAROL]);
     expect(told(made, BOB)[0]).toMatch(/^A T5 egg has been reported at \*\*The Stacks\*\*/);
-    expect(why(made, BOB)).toEqual(['T5 raids']);
+    expect(why(made, BOB)).toEqual(['T5 · Raids']);
     expect(made.dms.jobs[0]?.expiresAt).toBe(made.party.endTime);
   });
 
@@ -319,35 +318,68 @@ describe('NotifyService: a raid on its way to another region', () => {
 });
 
 describe('NotifyService: the buttons that stop a message', () => {
-  it('gives every reason of a message its button, for the server of the raid', async () => {
+  it('gives a Pokémon’s and a tier’s reason Change…, a gym’s Stop, for the server of the raid', async () => {
     const made = await reported(
       async ({ wants, gymTargets, gateway }) => {
         await wants.set(ALICE, gateway.guildId, T5, 'raid');
         await wants.set(ALICE, gateway.guildId, YVELTAL, 'raid');
+        await wants.set(ALICE, gateway.guildId, pokemonTarget(717, undefined, true), 'raid');
         await gymTargets.add(ALICE, gateway.guildId, 1);
       },
-      { boss: { key: 'yveltal' } },
+      { boss: { key: 'yveltal' }, tier: { level: 'T5', shadow: true } },
     );
     const guild = made.gateway.guildId;
     const message = made.dms.to(ALICE)[0];
-    expect(dmReasons(message)).toEqual(['T5 raids', 'Yveltal', 'raids at The Stacks']);
-    expect(buttonsOf(message).filter((button) => button.customId !== undefined)).toEqual(
-      [`dm:${guild}:stop:t:T5`, `dm:${guild}:stop:p:717`, `dm:${guild}:stop:g:1`].map(
-        (customId) => ({ label: 'Stop', emoji: undefined, style: 2, customId, url: undefined }),
-      ),
-    );
+    // Yveltal's two reasons are one section with one Change… (plan 8R-4, F5).
+    expect(dmReasons(message)).toEqual(['Yveltal · Raids, Shadow', 'raids at The Stacks']);
+    expect(buttonsOf(message).filter((button) => button.customId !== undefined)).toEqual([
+      {
+        label: 'Change…',
+        emoji: undefined,
+        style: 2,
+        customId: `dm:${guild}:change:sp:717`,
+        url: undefined,
+      },
+      {
+        label: 'Stop',
+        emoji: undefined,
+        style: 2,
+        customId: `dm:${guild}:stop:g:1`,
+        url: undefined,
+      },
+    ]);
+    const egg = await reported(async ({ wants, gateway }) => {
+      await wants.set(ALICE, gateway.guildId, T5, 'raid');
+    });
+    expect(dmReasons(egg.dms.to(ALICE)[0])).toEqual(['T5 · Raids']);
+    expect(customIdsOf(egg.dms.to(ALICE)[0])).toEqual([`dm:${egg.gateway.guildId}:change:st:T5`]);
   });
 
-  it('is a message Discord takes, and a pressed button ends the messages for that reason', async () => {
-    const made = await reported(async ({ wants, gateway }) => {
-      await wants.set(ALICE, gateway.guildId, T5, 'raid');
+  it('is a message Discord takes, and a pressed Stop ends the messages for that reason', async () => {
+    const made = await reported(async ({ gymTargets, gateway }) => {
+      await gymTargets.add(ALICE, gateway.guildId, 2);
     });
+    expect(made.dms.to(ALICE)).toHaveLength(0);
+    const gym = gymsFixture().get(2);
+    if (!gym) throw new Error('no gym 2');
+    const report = () =>
+      made.service.reportRaid({
+        gym,
+        reporterId: BOB,
+        anonymous: false,
+        autoStatus: PartyStatus.Interested,
+        tier: { level: 'T5', shadow: false },
+        boss: null,
+      });
+    await report();
+    await made.notify.flush();
     const message = v2(made.dms.to(ALICE)[0]);
     const dmGateway = new FakeDmGateway();
     expect(await dmGateway.send(ALICE, message)).toBe('sent');
     // The press, as the router handles it in a DM.
     const { ctx } = createTestContext({ wants: made.wants, gymTargets: made.gymTargets });
     const [customId = ''] = customIdsOf(message);
+    expect(customId).toBe(`dm:${made.gateway.guildId}:stop:g:2`);
     const pressed = fakeButton({
       customId,
       isDm: true,
@@ -355,20 +387,7 @@ describe('NotifyService: the buttons that stop a message', () => {
       messageRows: message.components as unknown as FakeRow[],
     });
     await new InteractionRouter(ctx, [], components).handle(pressed as never);
-    expect(await made.wants.count(ALICE, made.gateway.guildId)).toBe(0);
-    // The next raid of that tier tells her nothing.
-    const gym = gymsFixture().get(2);
-    if (!gym) throw new Error('no gym 2');
-    await made.service.reportRaid({
-      gym,
-      reporterId: BOB,
-      anonymous: false,
-      autoStatus: PartyStatus.Interested,
-      tier: { level: 'T5', shadow: false },
-      boss: null,
-    });
-    await made.notify.flush();
-    expect(made.dms.to(ALICE)).toHaveLength(1);
+    expect(await made.gymTargets.count(ALICE, made.gateway.guildId)).toBe(0);
   });
 });
 
@@ -405,7 +424,7 @@ describe('NotifyService: a raid changes', () => {
     expect(told(made, BOB)).toEqual([
       `The raid at **The Stacks** (<#${WEST_CHANNEL}>) now has its boss, **Yveltal**.`,
     ]);
-    expect(why(made, DORA)).toEqual(['T5 raids', 'Yveltal']);
+    expect(why(made, DORA)).toEqual(['T5 · Raids', 'Yveltal · Raids']);
     expect(dmBrief(made.dms.to(BOB)[0]).slice(0, 2)).toEqual([
       '**Level 5 raid** (egg)',
       '**Hatches as Yveltal** ✨',
@@ -433,7 +452,7 @@ describe('NotifyService: a raid changes', () => {
     await setBoss(made, CAROL, 'yveltal', 'Yveltal (T5)');
     expect(made.dms.to(EVE)).toEqual([]);
     await setBoss(made, CAROL, 'giratina_origin', 'Giratina (Origin Forme) (T5)');
-    expect(why(made, EVE)).toEqual(['Giratina (every form)']);
+    expect(why(made, EVE)).toEqual(['Giratina · Raids']);
     expect(told(made, EVE)).toEqual([
       `The boss of the raid at **The Stacks** (<#${WEST_CHANNEL}>) is now **Giratina (Origin Forme)**.`,
     ]);
@@ -528,7 +547,7 @@ describe('NotifyService: a raid changes', () => {
     expect(told(made, BOB)).toEqual([
       `The T5 egg is at **Café Élan Fresco** (<#${EAST_CHANNEL}>), not where it was first reported.`,
     ]);
-    expect(why(made, BOB)).toEqual(['T5 raids']);
+    expect(why(made, BOB)).toEqual(['T5 · Raids']);
     expect(why(made, DORA)).toEqual(['raids at Café Élan Fresco']);
     expect(made.members.batches.at(-1)?.channelId).toBe(EAST_FORUM);
     // The old party has ended: what is remembered is about the new one alone.
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index 32da79e3452f51311bbd7320f777bd7db487ae12..3c944531a22cc955205dbe7c1124b2ec0facff87 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -3,8 +3,12 @@ import type { Settings } from '../config/settings.js';
 import type { GymTargetStorage } from '../db/repositories/gym-notification-repository.js';
 import type { WantStorage } from '../db/repositories/pokemon-notification-repository.js';
 import type { TargetWantStorage } from '../db/repositories/target-want-repository.js';
-import type { TargetWant } from '../domain/notify/target-wants.js';
-import { targetWantLabel } from '../domain/pogo/want-boxes.js';
+import { isCostumedTarget, type TargetWant } from '../domain/notify/target-wants.js';
+import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
+import { pokemonTarget, type Want } from '../domain/pogo/notification-target.js';
+import { raidTierLabel, sameRaidTier } from '../domain/pogo/raid-tier.js';
+import { changeSubject } from '../domain/pogo/species-answer.js';
+import { targetWantLabel, type BoxSubject } from '../domain/pogo/want-boxes.js';
 import type { NewTrainStorage } from '../db/repositories/new-train-repository.js';
 import type { UserSettingsReader } from '../db/repositories/user-repository.js';
 import type { MemberDirectory } from '../discord/member-directory.js';
@@ -53,14 +57,13 @@ import {
 import { raidStage } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { startTimeOf } from '../domain/party/timed.js';
-import type { Want } from '../domain/pogo/notification-target.js';
 import { battleKindOf, maxBossTitle } from '../domain/pogo/max-tier.js';
-import { sameRaidTier } from '../domain/pogo/raid-tier.js';
 import { BoundedMap } from '../bounded-map.js';
-import { wantTargetLabel } from '../domain/pogo/wants.js';
+import { pokemonWantName, wantTargetLabel } from '../domain/pogo/wants.js';
 import type { Logger } from '../log.js';
 import {
   bossSetSentence,
+  changeButtonId,
   mapLink,
   maxDmSentence,
   maxHourNote,
@@ -94,6 +97,62 @@ import type { RocketNews } from './rocket-reports.js';
 import { gruntHourNote, rocketDmBrief, rocketDmSentence } from '../render/rocket.js';
 import type { StopReport } from '../domain/stops/report.js';
 
+/**
+ * Change… of a reason (plan 8R-4, design 4): a want of a Pokémon in raids, spawns or as a shadow
+ * (`p`, `ps`), a Pokémon's box of `TargetWant` (`rp`, `dx`, `gx`) and a tier's want (`t`, `ts`)
+ * open the dialog of the species (a form beyond the Which field, an Unown letter, its own) or of
+ * the tier; IV wants, items, Mega Energy, gym targets, Team GO Rocket (until its dialog) and the
+ * settings keep Stop (undefined). The name says the want (`Costumed Pikachu`, made plain), the
+ * box what fired.
+ */
+export function changeOf(
+  catalogue: PokemonCatalogue,
+  guildId: string,
+  reason: NotifyReason,
+  plainBox: 'Raids' | 'Spawns',
+): ShownReason['change'] {
+  const pokemon = (
+    dex: number,
+    form: string | undefined,
+    costumed: boolean,
+    box: string,
+  ): ShownReason['change'] => {
+    const subject = changeSubject(
+      form === undefined ? { kind: 'pokemon', dex } : { kind: 'pokemon', dex, form },
+      catalogue.byDex(dex).length,
+    );
+    const name = plain(pokemonWantName(catalogue, pokemonTarget(dex, form), { costumed }));
+    const group = plain(
+      pokemonWantName(
+        catalogue,
+        subject.kind === 'pokemon' ? pokemonTarget(dex, subject.form) : pokemonTarget(dex),
+      ),
+    );
+    return { customId: changeButtonId(guildId, subject), name, box, group };
+  };
+  if (reason.kind === 'want') {
+    const { target } = reason;
+    if (target.kind === 'iv') return undefined;
+    if (target.kind === 'tier') {
+      const name = raidTierLabel({ level: target.tier.level, shadow: false });
+      const subject: BoxSubject = { kind: 'tier', level: target.tier.level };
+      const box = target.tier.shadow ? 'Shadow raids' : 'Raids';
+      return { customId: changeButtonId(guildId, subject), name, box };
+    }
+    const box = target.shadow === true ? 'Shadow' : plainBox;
+    return pokemon(target.dex, target.form, reason.costumed === true, box);
+  }
+  if (reason.kind === 'target') {
+    const { want } = reason;
+    const boxes = { 'research-pokemon': 'Research', dynamax: 'Dynamax', gigantamax: 'Gigantamax' };
+    if (want.kind !== 'research-pokemon' && want.kind !== 'dynamax' && want.kind !== 'gigantamax') {
+      return undefined;
+    }
+    return pokemon(want.dex, want.form, isCostumedTarget(want), boxes[want.kind]);
+  }
+  return undefined;
+}
+
 /**
  * What the services that change parties tell the notifier, each from the one place that knows
  * who acted (`actorId`; null for the clock): explicit calls, because only the caller knows the
@@ -721,7 +780,7 @@ export class NotifyService implements PartyNotifier {
             // The report itself: the place to look, and to answer.
             links: [reportButton(postLink(guildId, news.regionChannelId, news.messageId))],
           },
-          reasons.map((reason) => this.shown(guildId, reason)),
+          reasons.map((reason) => this.shown(guildId, reason, 'Spawns')),
         ),
       priority: () => DM_PRIORITY.spawn,
     });
@@ -1182,11 +1241,23 @@ export class NotifyService implements PartyNotifier {
 
   /**
    * A reason as the message names it, in the names of the member's own lists, with the button
-   * that stops it in this server and the command that does the same.
+   * that stops it in this server and the command that does the same; a Pokémon's or a tier's
+   * with Change… instead (plan 8R-4: `changeOf`), the box it fired by named after it, where the
+   * want of a Pokémon in raids or spawns fired by `plainBox` (a raid's `Raids`, a spawn's
+   * `Spawns`).
    */
-  private shown(guildId: string, reason: NotifyReason): ShownReason {
+  private shown(
+    guildId: string,
+    reason: NotifyReason,
+    plainBox: 'Raids' | 'Spawns' = 'Raids',
+  ): ShownReason {
     const { gameData, gyms } = this.options;
     const stop = stopButtonId(guildId, reason);
+    const change = changeOf(gameData.catalogue, guildId, reason, plainBox);
+    if (change) {
+      const command = '/want';
+      return { label: change.name, command, change };
+    }
     switch (reason.kind) {
       case 'want':
         return {
diff --git a/src/web/spawn-report.test.ts b/src/web/spawn-report.test.ts
index 6b9a0b80d894f67160750ebbac1d7ec2e4374a46..dc0071cdf24b5a39207d9d38d442ff35cb999ffd 100644
--- a/src/web/spawn-report.test.ts
+++ b/src/web/spawn-report.test.ts
@@ -133,7 +133,10 @@ describe('reporting a wild Pokémon on the map', () => {
     );
     await map.made.notify.flush();
     expect(map.made.dms.to(BOB).map((message) => dmSummary(message))).toEqual([
-      [`A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **Alice**.`, 'Dratini'],
+      [
+        `A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **Alice**.`,
+        'Dratini · Spawns',
+      ],
     ]);
   });
 
diff --git a/test/support/fake-interactions.ts b/test/support/fake-interactions.ts
index 43b3ab57c9d0dedc3a1fbf66557756b03fe35615..4db66f2535bb27be9f6c3a39128b8c5efd77ed3b 100644
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -176,6 +176,11 @@ export interface FakeOptions {
    * has no metadata.
    */
   askedBy?: string;
+  /**
+   * The names of the servers the bot is in, by id (`interaction.client.guilds.cache`): a DM's
+   * Change… names its server (plan 8R-4).
+   */
+  serverNames?: Record<string, string>;
   /** A control: the message it is on is private (`interaction.message.flags` has Ephemeral). */
   ephemeralMessage?: boolean;
   /**
@@ -795,7 +800,16 @@ function base(kind: Kind, o: FakeOptions) {
     customId: o.customId,
     guildId,
     channelId,
-    client: { user: { id: FAKE_BOT_ID } },
+    client: {
+      user: { id: FAKE_BOT_ID },
+      // The servers the bot is in, by id, with their names (`serverNames`): what a press in a
+      // DM reads a server's name from.
+      guilds: {
+        cache: new Map(
+          Object.entries(o.serverNames ?? {}).map(([id, name]) => [id, { id, name }] as const),
+        ),
+      },
+    },
     ...(kind === 'message' && o.targetMessage
       ? {
           targetId: o.targetMessage.id,
````

### Task 6: 8R-4 task 6: /wants: one line per species, and Change…

Prototype commit: `c5af770bff6787d0de6a4c76eac302b47276322c`

/wants lists one line per species, its forms named together up to three
and above that by count, Costumed before it where every row is, an Unown
letter a line of its own; then the tiers in tier order ("Tier 5 raids"),
Team GO Rocket, and the lines without a dialog: items and Mega Energy by
name, Perfect IVs, Zero IVs. A Pokémon's or a tier's line has Change…,
which reads the rows in time and opens its dialog with the list's page in
the id; the Submit is acknowledged first, then writes and shows the page
again in place with the answer as a note at its top and its warning also
privately below. The member list takes a button of an item's own and a
source's own actions; /targets keeps Remove, and /settings show counts
the new lines. A one-box Pokémon held costumed is told how to make it
plain. The lines are built from the rows grouped once by Pokédex number.

**Files:**

```
 docs/architecture/notifications-and-dms.md  |   4 +-
 src/commands/notifications/list-controls.ts |  23 +++++++-
 src/commands/notifications/want-boxes.ts    | 193 +++++++++++++++++++++++++++++++++++++++++++++++++-------------------
 src/commands/notifications/wants.test.ts    | 188 ++++++++++++++++++++++++++++++++++++++++++++++++++++--------------
 src/commands/notifications/wants.ts         | 129 +++++++++++++++++++++++++++++++++++++--------
 src/commands/round-trips.db.test.ts         |   2 +-
 src/commands/settings/settings.test.ts      |   5 +-
 src/render/member-list.ts                   |  34 +++++++++---
 8 files changed, 451 insertions(+), 127 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/notifications/wants.test.ts src/commands/settings/settings.test.ts`); all pass. Its database test files (`src/commands/round-trips.db.test.ts`) run with the database suite at the tip.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c5af770bff6787d0de6a4c76eac302b47276322c -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4 task 6: /wants: one line per species, and Change…`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index fe30c1cae243891bba0d2d6347f789f32e23205a..5873fcf77e0dce56771548c6e11fc3174e297117 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -6,11 +6,11 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 
 - A want (`PokemonNotification`) is per member and server and is one of: a species (every form, megas included), one form (`form`, a catalogue key), the shadow raids of either (`shadow`; since plan 8R-2 shadow raids and Team GO Rocket catches, the Shadow box), a raid tier (raids only), perfect or zero IVs (spawns only); a mega is raids only. The columns are read and written only through the codec (`notification-target.ts`: `readNotification` gives the target and the scope in effect; a row it cannot read is skipped, counted and never deleted on its own) and the pure functions of `src/domain/pogo/wants.ts` (`readWants`, `planSetWant`, `rowsOfWant`: duplicate legacy rows are one want with the union of their scopes, two keys of one catalogue entry are one want, a row is rewritten only when its meaning changes). `ctx.wants` (`WantStorage`: `list`, `set`, `remove`, `removeAll`, `count`) is the repository; `MemoryWants` (`test/support/wants.ts`) is its twin and runs the same functions. `pokemonWantFits(catalogue, target, entry, shadowRaid)` says whether a want is for a boss or a spawn. Since plan 8R-1 a raid scope means raids only (no max battles), and the legacy `!wants` codec and the scope rules (`planSetWant`, `widerScope`) are unchanged.
 - **Costumed wants** (plan 8R-4, migration 030; design `2026-10-22-costume-form-wants-design.md`): `PokemonNotification.costumed` and `TargetWant.costumed` (tinyint, default 0) make a Pokémon's want costumed only, a property of the row like the scope, never part of its target, token, unique key or id (`Want.costumed?: true`, a Pokémon's `TargetWant.costumed?: true`; `boxTarget(kind, dex, form, costumed)`, `withCostume`, `isCostumedTarget`; a Stop or Remove takes the row whatever its costume). Rows of one target that disagree read as plain (`readWants`: plain wins, as the wider scope); `planSetWant(…, costumed)` rewrites a row whose costume differs; a `TargetWant` added again takes the costume of its add (an upsert per costume, `createdAt` kept). Every sighting carries `costumed` (`PokemonSighting`): a raid's boss as the list has it in the raid's tier (`ShownBoss.costumed`), a spawn as `SpawnNews.costumed` says, a research reward by `rewardCostumed` (its Leek Duck name and picture, worked out when read), a max boss and a Rocket catch never. `pokemonWantFits(…, costumed)` fits a costumed want only to a costumed sighting, under the entry the costume copies; a plain want fits either. The matchers (`raidWantsFiring`, `spawnWantsFiring`, `rocketShadowFiring`) give the wants themselves, so a reason carries `costumed` (`wantReason`) and the DM names it "Costumed Pikachu" (`wantTargetLabel(…, costumed)`, `pokemonWantName({ costumed })`: no "(every form)", "Costumed Corsola"), a target "Costumed Pikachu (research)" (`targetWantLabel`); members told of one event share a message only where their reasons read alike (`shownReasonKey`).
-- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy, written at once with no dialog (`rocketWantAnswer`: a grunt type at most one DM an hour for each type). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. **The Pokémon dialog of plan 8R-4** (design 3, the mockups of 2026-10-22; `wantDialog` / `WantDialogView` in `src/commands/notifications/want-dialog.ts`, `wantDialogFor` in `wants.ts`): the title by the species' name ("Corsola: what for?", `dialogName`), one text, then at most four fields, a dialog's five components being Discord's limit (every other sentence goes into the one text: the mega note "A mega is told for raids only.", "Your Ponyta wants differ by form; Submit sets them alike."; Charizard's is the largest, a test builds it): **Tell me about** (`boxes`, two boxes or more; their descriptions, `BOX_DESCRIPTIONS` with `{name}`, only without a Which field; Research no longer for a legendary, mythical or ultra beast unless today's task list rewards it or the member holds it, `shownBoxes` / `dialogBoxes`), **Which <species>** (`forms`, `whichEntries`: a species of 2 to `WHICH_CAP` 25 entries, megas included, by their catalogue names; a checkbox group to ten, a string select above; none for Unown, whose letters are dialogs of their own, `wantbox:p201:…:unown_a`), **Costumes** (`costumed`, one `ComponentType.Checkbox` under a Label `Only costumed <species>` / `Only costumed ones`, shown where the game data has a costume of any of its forms or the raid boss list or today's task list has it costumed now, `costumesShown`, or where a row held is costumed, A1: a Submit never drops a costume unseen; not shown, each row keeps its own) and **Remove** (`remove`, one Checkbox, `Remove <species> from my list`, where the member holds a want of it; it wins over everything). With one box and none of Which and Costumes it writes at once, a costumed row held staying costumed (`asksAbout`, decided synchronously for the deferral, S1: Mew; what a use is about, `WantUse`, is read once per interaction, `useOf`, so the deferral and `execute` decide alike, A8); with one box and a Which field (Arceus) there is no Tell me about field and the text says what it is told for. A first want opens with no box ticked and every form ticked (a form picked from the list alone: `/want galarian corsola`, `/want mega charizard y`, `dialogSubject`), Costumed off, and its Tell me about and Which fields required (`required: true`, `min_values` 1: Discord lets no Submit through till a box and a form are ticked; Matt's R-M2, no "All" option), a tier's dialog alike; with wants, as stored (a box ticked where any row has it, Costumed only where every row but the megas is, `allCostumed`, the picked form added; the rows that differ leave a mega's out, A3), and the fields not required, so that nothing ticked still takes the want off (Q1). **In the post of a raid or a max battle** (Matt's R-M1; `postSubject` and `postBoxOf` in `wants.ts`, the party read from the post's id in memory by `partyOf`, so `opensDialog` stays synchronous and `showModal` the first answer): `/want` with nothing typed (the option is not required) is the boss (a form of a species with several picked in its species' dialog), an egg its tier; a boss the game data does not know is refused (Matt's Q1, F1: a raid's "Pine doesn't know this raid's boss yet: name a Pokémon, or `/want t5` for the tier.", the tier its own; a max battle's "Pine doesn't know this battle's boss yet: name a Pokémon."); the dialog ticks only the post's kind of battle for a first want (a raid's Raids, a shadow raid's Shadow, a tier's Raids or Shadow raids, a max battle's Dynamax or Gigantamax), also for a Pokémon typed there, and beside the rows held for a want held. Anywhere else nothing typed is a `UserError` (`NAME_A_POKEMON`: "Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it out for its boss."; an ended raid's post is out of the store, so as any other). These refusals and a name it cannot read come from the guard `readsUse` (it reads the use, `useOf`), so they do not count against the throttle (F2). The Submit (`answerOfSubmit`, `readWantSubmit`: a Which field read as its forms, every form ticked as the species row; a missing field or another Which hash is `STALE_COMPONENT`) writes through `WantBoxStorage.set`, and the answer names the want as `/wants` does (`rowsLabel`: "Costumed Pikachu", "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above three by count) with its boxes, in small print where Costumed meets a box no costumed Pokémon has appeared in (`NEVER_COSTUMED_YET`: Dynamax, Gigantamax, Shadow; a warning, never a refusal) and where a mega ticked without Raids is off. `/unwant` of a form whose species row covers it (`coveringSpecies`, review R4e) removes nothing and says so. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (since plan 8R-4 `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>][:<form>][:l<page>]:~<token>`, a tier `wantbox:t<level>:set2:…`; `src/commands/notifications/want-dialog.ts`, `wantDialogId` / `readWantDialogId`: `<mask>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `<flags>` whether it showed Costumes (1) and Remove (2), `<which>` `whichHash` of the keys its Which field showed, `0` for none (`NO_WHICH`), the server where it was opened from a DM, the form only beyond the Which field (an Unown letter), the page of `/wants`, last `openToken` of when it opened (plan 8X-F: Discord's client shows what was last submitted under an id in place of what the dialog ticks), which `readWantDialogId` leaves out; an id of before (`set`) or of any other shape, one without its token, and a Which hash that is not the field's now, are `STALE_COMPONENT`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock; nothing ticked takes the target off. **One answer per species** (plan 8R-4, design 3; `src/domain/pogo/species-answer.ts`): an answer (`BoxAnswer`: the forms that stand, `undefined` the subject's own row, of a species the species row; the boxes ticked of those shown; costumed; Remove) covers a scope (`AnswerScope`, `scopeOf`: a species is `wide`, every row of its Pokédex number in both tables, `PokemonNotification.pokemon = <dex>` and `TargetWant.target` `<kind>:<dex>` exactly or `<kind>:<dex>:%`, so 25 never reads 251; a species with more entries than the Which field holds, `WHICH_CAP` 25, Unown, is not: its species row and each letter are answers of their own; a tier is its own). `WantBoxStorage.held(member, server, scope)` gives the rows by form (`HeldRow`: its boxes, costumed when every row of it is; `heldRows`), `set(member, server, answer, at)` carries out `planAnswer`: Remove, no form or no box shown ticked takes every row of the scope away, the boxes the dialog did not show included (A2, Q1); every form ticked gets the boxes ticked of those shown and keeps the others as its row had them (a new row: as the scope's rows had them together), all with the answer's costume (`costumed` undefined where the dialog did not show Costumes: each row keeps its own, a new row costumed where every row held is, `allCostumed`, A1); a mega a raid row and nothing else, always plain, nothing without Raids (review R4c, A-D3; `FormReader`'s `mega`); every other row goes; in one transaction under the member's lock (`WantBoxRepository`, twin `MemoryWantBoxes`, both `wantBoxCases`). `removalAnswer(scope)` is `/unwant`'s and a list's Remove. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
+- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy, written at once with no dialog (`rocketWantAnswer`: a grunt type at most one DM an hour for each type). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. **The Pokémon dialog of plan 8R-4** (design 3, the mockups of 2026-10-22; `wantDialog` / `WantDialogView` in `src/commands/notifications/want-dialog.ts`, `wantDialogFor` in `wants.ts`): the title by the species' name ("Corsola: what for?", `dialogName`), one text, then at most four fields, a dialog's five components being Discord's limit (every other sentence goes into the one text: the mega note "A mega is told for raids only.", "Your Ponyta wants differ by form; Submit sets them alike."; Charizard's is the largest, a test builds it): **Tell me about** (`boxes`, two boxes or more; their descriptions, `BOX_DESCRIPTIONS` with `{name}`, only without a Which field; Research no longer for a legendary, mythical or ultra beast unless today's task list rewards it or the member holds it, `shownBoxes` / `dialogBoxes`), **Which <species>** (`forms`, `whichEntries`: a species of 2 to `WHICH_CAP` 25 entries, megas included, by their catalogue names; a checkbox group to ten, a string select above; none for Unown, whose letters are dialogs of their own, `wantbox:p201:…:unown_a`), **Costumes** (`costumed`, one `ComponentType.Checkbox` under a Label `Only costumed <species>` / `Only costumed ones`, shown where the game data has a costume of any of its forms or the raid boss list or today's task list has it costumed now, `costumesShown`, or where a row held is costumed, A1: a Submit never drops a costume unseen; not shown, each row keeps its own) and **Remove** (`remove`, one Checkbox, `Remove <species> from my list`, where the member holds a want of it; it wins over everything). With one box and none of Which and Costumes it writes at once, a costumed row held staying costumed and the answer saying so in small print, "Only costumed ones are told: Change… in `/wants` can untick Only costumed." (F3; `asksAbout`, decided synchronously for the deferral, S1: Mew; what a use is about, `WantUse`, is read once per interaction, `useOf`, so the deferral and `execute` decide alike, A8); with one box and a Which field (Arceus) there is no Tell me about field and the text says what it is told for. A first want opens with no box ticked and every form ticked (a form picked from the list alone: `/want galarian corsola`, `/want mega charizard y`, `dialogSubject`), Costumed off, and its Tell me about and Which fields required (`required: true`, `min_values` 1: Discord lets no Submit through till a box and a form are ticked; Matt's R-M2, no "All" option), a tier's dialog alike; with wants, as stored (a box ticked where any row has it, Costumed only where every row but the megas is, `allCostumed`, the picked form added; the rows that differ leave a mega's out, A3), and the fields not required, so that nothing ticked still takes the want off (Q1). **In the post of a raid or a max battle** (Matt's R-M1; `postSubject` and `postBoxOf` in `wants.ts`, the party read from the post's id in memory by `partyOf`, so `opensDialog` stays synchronous and `showModal` the first answer): `/want` with nothing typed (the option is not required) is the boss (a form of a species with several picked in its species' dialog), an egg its tier; a boss the game data does not know is refused (Matt's Q1, F1: a raid's "Pine doesn't know this raid's boss yet: name a Pokémon, or `/want t5` for the tier.", the tier its own; a max battle's "Pine doesn't know this battle's boss yet: name a Pokémon."); the dialog ticks only the post's kind of battle for a first want (a raid's Raids, a shadow raid's Shadow, a tier's Raids or Shadow raids, a max battle's Dynamax or Gigantamax), also for a Pokémon typed there, and beside the rows held for a want held. Anywhere else nothing typed is a `UserError` (`NAME_A_POKEMON`: "Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it out for its boss."; an ended raid's post is out of the store, so as any other). These refusals and a name it cannot read come from the guard `readsUse` (it reads the use, `useOf`), so they do not count against the throttle (F2). The Submit (`answerOfSubmit`, `readWantSubmit`: a Which field read as its forms, every form ticked as the species row; a missing field or another Which hash is `STALE_COMPONENT`) writes through `WantBoxStorage.set`, and the answer names the want as `/wants` does (`rowsLabel`: "Costumed Pikachu", "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above three by count) with its boxes, in small print where Costumed meets a box no costumed Pokémon has appeared in (`NEVER_COSTUMED_YET`: Dynamax, Gigantamax, Shadow; a warning, never a refusal) and where a mega ticked without Raids is off. `/unwant` of a form whose species row covers it (`coveringSpecies`, review R4e) removes nothing and says so. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (since plan 8R-4 `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>][:<form>][:l<page>]:~<token>`, a tier `wantbox:t<level>:set2:…`; `src/commands/notifications/want-dialog.ts`, `wantDialogId` / `readWantDialogId`: `<mask>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `<flags>` whether it showed Costumes (1) and Remove (2), `<which>` `whichHash` of the keys its Which field showed, `0` for none (`NO_WHICH`), the server where it was opened from a DM, the form only beyond the Which field (an Unown letter), the page of `/wants`, last `openToken` of when it opened (plan 8X-F: Discord's client shows what was last submitted under an id in place of what the dialog ticks), which `readWantDialogId` leaves out; an id of before (`set`) or of any other shape, one without its token, and a Which hash that is not the field's now, are `STALE_COMPONENT`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock; nothing ticked takes the target off. **One answer per species** (plan 8R-4, design 3; `src/domain/pogo/species-answer.ts`): an answer (`BoxAnswer`: the forms that stand, `undefined` the subject's own row, of a species the species row; the boxes ticked of those shown; costumed; Remove) covers a scope (`AnswerScope`, `scopeOf`: a species is `wide`, every row of its Pokédex number in both tables, `PokemonNotification.pokemon = <dex>` and `TargetWant.target` `<kind>:<dex>` exactly or `<kind>:<dex>:%`, so 25 never reads 251; a species with more entries than the Which field holds, `WHICH_CAP` 25, Unown, is not: its species row and each letter are answers of their own; a tier is its own). `WantBoxStorage.held(member, server, scope)` gives the rows by form (`HeldRow`: its boxes, costumed when every row of it is; `heldRows`), `set(member, server, answer, at)` carries out `planAnswer`: Remove, no form or no box shown ticked takes every row of the scope away, the boxes the dialog did not show included (A2, Q1); every form ticked gets the boxes ticked of those shown and keeps the others as its row had them (a new row: as the scope's rows had them together), all with the answer's costume (`costumed` undefined where the dialog did not show Costumes: each row keeps its own, a new row costumed where every row held is, `allCostumed`, A1); a mega a raid row and nothing else, always plain, nothing without Raids (review R4c, A-D3; `FormReader`'s `mega`); every other row goes; in one transaction under the member's lock (`WantBoxRepository`, twin `MemoryWantBoxes`, both `wantBoxCases`). `removalAnswer(scope)` is `/unwant`'s and a list's Remove. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"; since plan 8R-4 one line per species, `wantEntries`: its forms named together up to three, "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above that by count, "Vivillon (4 of 21 forms)", `Costumed` before it where every row is, an Unown letter a line of its own; in the order Pokémon by species name, tiers in tier order as "Tier 5 raids" (Matt's R-M4: on the list alone, `WantEntry.listLabel`; `/unwant`'s choices and answers keep "T5 raids"), Team GO Rocket, then the lines without a dialog: items and Mega Energy by name as "Rare Candy: Research", "Perfect IVs: Spawns", "Zero IVs: Spawns"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
 - What a member picked in the `target` option of `/want` or `/unwant` is a want token (`wantToken` / `parseWantToken`: `pokemon:<dex>[:<form>][:shadow]`, `tier:<level>[:shadow]`, `iv:perfect|zero`): the value of an autocomplete choice, never part of a custom id. Text sent without picking never guesses (`readWantText`): it acts only when it is a tier or IV word in full (`wantWord`), exactly a species' name (every form) or exactly one form's own name, with `shadow` before either; anything else is refused with suggestions. A bare number is a tier or IV word, never a Pokédex number.
 - Wants are named in one way everywhere (`wantLabel` / `wantName` in `src/commands/notifications/want-input.ts`): "X (every form)" for a species with several entries, "X (base form)" for its plain entry, "Shadow X", and the scope after " · " in the choices of `/unwant`.
 - Gym targets (`GymNotification`; `gym` holds a gym id as text) are `ctx.gymTargets` (`GymTargetStorage`), with `MemoryGymTargets` as the twin. In code "target" alone is what a want is for; a gym a member wants raids of is a gym target.
-- Commands that answer one member privately about their own settings (`/settings`, the wants, the gym targets, `/friend-code`, `/nickname`) are tied to no bot channel; what writes is throttled with `MEMBER_WRITE_THROTTLE` (`src/discord/throttle.ts`), what asks Discord about members with a tighter one. The server of an interaction is `guildIdOf(interaction)` (`guards.ts`). What autocomplete handlers share (`Choice`, `MAX_CHOICES`, `byName`, `beginningFirst`) is in `src/commands/choices.ts`. `/unwant-all`, `/untarget-all` and "Remove all…" ask in a dialog (plan 8Q, `removeAllQuestion` in `src/commands/notifications/remove-all.ts`): titled `Remove all your wants` / `Remove all your gym targets`, the question with the count read in time (`readInTime`), then `Submit removes them.`; with nothing to remove the private answer says so and no dialog opens. Its Submit (`wants:all:remove`, `targets:all:remove`, `NOTIFICATION_THROTTLE` in the Submit's own window, `component:wants` / `component:targets`, as many as the command allows) is acknowledged privately and removes whatever the list holds then; the commands declare no `defer`. `/wants` and `/targets` answer with a components-v2 list (`renderMemberList`, `src/render/member-list.ts`; plan 8B-1): a heading and a count, `LIST_PAGE` (10) entries to a page, each a section with a red Remove, Previous / Next, "Remove all…" (the dialog of `/unwant-all` / `/untarget-all`; the list stays as it was) and how to add one; the entries share what is left of `TEXT_BUDGET` (a gym's name is cut before it is escaped). Their controls are `memberListControls` (`src/commands/notifications/list-controls.ts`), the kinds `wantlist` and `targetlist` (`wants` and `targets` are the Submits of the remove-all dialogs): `<kind>:<page>:prev|next|all` and `<kind>:<page>:remove:<what>` with `<what>` as `stopArgs` spells it; a press reads the member's list anew, removes (what is gone already is no error) and shows the page again with `update` (the last page when it is past the end); one throttle, `MEMBER_WRITE_THROTTLE`, for all of a kind. An answer that is a v2 message goes through `answer(interaction, v2Answer(message))` (`src/discord/late-reply.ts`), an `update` or `editReply` with `v2Answer(message)`.
+- Commands that answer one member privately about their own settings (`/settings`, the wants, the gym targets, `/friend-code`, `/nickname`) are tied to no bot channel; what writes is throttled with `MEMBER_WRITE_THROTTLE` (`src/discord/throttle.ts`), what asks Discord about members with a tighter one. The server of an interaction is `guildIdOf(interaction)` (`guards.ts`). What autocomplete handlers share (`Choice`, `MAX_CHOICES`, `byName`, `beginningFirst`) is in `src/commands/choices.ts`. `/unwant-all`, `/untarget-all` and "Remove all…" ask in a dialog (plan 8Q, `removeAllQuestion` in `src/commands/notifications/remove-all.ts`): titled `Remove all your wants` / `Remove all your gym targets`, the question with the count read in time (`readInTime`), then `Submit removes them.`; with nothing to remove the private answer says so and no dialog opens. Its Submit (`wants:all:remove`, `targets:all:remove`, `NOTIFICATION_THROTTLE` in the Submit's own window, `component:wants` / `component:targets`, as many as the command allows) is acknowledged privately and removes whatever the list holds then; the commands declare no `defer`. `/wants` and `/targets` answer with a components-v2 list (`renderMemberList`, `src/render/member-list.ts`; plan 8B-1): a heading and a count, `LIST_PAGE` (10) entries to a page, each a section with a red Remove, Previous / Next, "Remove all…" (the dialog of `/unwant-all` / `/untarget-all`; the list stays as it was) and how to add one; the entries share what is left of `TEXT_BUDGET` (a gym's name is cut before it is escaped). Their controls are `memberListControls` (`src/commands/notifications/list-controls.ts`), the kinds `wantlist` and `targetlist` (`wants` and `targets` are the Submits of the remove-all dialogs): `<kind>:<page>:prev|next|all` and `<kind>:<page>:remove:<what>` with `<what>` as `stopArgs` spells it; a press reads the member's list anew, removes (what is gone already is no error) and shows the page again with `update` (the last page when it is past the end); one throttle, `MEMBER_WRITE_THROTTLE`, for all of a kind. Plan 8R-4: an item may have a button of its own (`ListItem.button`: action, label, style, arguments, the command named where it does not fit) and a source actions of its own (`MemberListSource.actions`); a line of `/wants` of a Pokémon or a tier has **Change…** (`wantlist:<page>:change:sp:<dex>[:<form>]` / `st:<level>`, `changeLine`: the rows read in time, nothing held said, else `/want`'s dialog with Remove, its id carrying the page `:l<page>`), whose Submit (`submitFromList`) is acknowledged on the list first (`deferUpdate`, B1), writes, shows the page again in place (`showInPlace`, an edit by then) with the answer as a note at its top (`ListView.notice`) and its small print also privately below (`followUp`); `/targets` keeps Remove. An answer that is a v2 message goes through `answer(interaction, v2Answer(message))` (`src/discord/late-reply.ts`), an `update` or `editReply` with `v2Answer(message)`.
 
 ## The notifier
 
diff --git a/src/commands/notifications/list-controls.ts b/src/commands/notifications/list-controls.ts
index a528606c2fec0f49c83cbbbe4102d12edded2bd1..b30dfcbabb913230673aa92ce139a560cae3a317 100644
--- a/src/commands/notifications/list-controls.ts
+++ b/src/commands/notifications/list-controls.ts
@@ -24,6 +24,21 @@ export interface MemberListSource {
   remove(interaction: ButtonInteraction, ctx: AppContext, reason: NotifyReason): Promise<boolean>;
   /** "Remove all…": opens the dialog of `/unwant-all` (`/untarget-all`); the list stays. */
   askAll(interaction: ButtonInteraction, ctx: AppContext): Promise<void>;
+  /**
+   * The source's own actions of an item's button (plan 8R-4: `change` of `/wants`, which opens a
+   * dialog), by action, with the custom id's arguments and the page shown; each answers itself.
+   */
+  actions?: Readonly<
+    Record<
+      string,
+      (
+        interaction: ButtonInteraction,
+        ctx: AppContext,
+        args: readonly string[],
+        page: number,
+      ) => Promise<void>
+    >
+  >;
 }
 
 /** The highest page a custom id may name: a list of a hundred thousand entries. */
@@ -66,8 +81,12 @@ export function memberListControls(source: MemberListSource): ComponentHandler {
           }
           break;
         }
-        default:
-          throw new UserError(stale);
+        default: {
+          const own = source.actions?.[id.action];
+          if (!own) throw new UserError(stale);
+          await own(interaction, ctx, id.args, shown);
+          return;
+        }
       }
       await interaction.update(v2Answer(await source.render(interaction, ctx, page)));
     },
diff --git a/src/commands/notifications/want-boxes.ts b/src/commands/notifications/want-boxes.ts
index bfeae16e187196712a3226e4369da89e0bf8f33f..a41c986805f56fcc371836796231442ef0e7c6c8 100644
--- a/src/commands/notifications/want-boxes.ts
+++ b/src/commands/notifications/want-boxes.ts
@@ -11,15 +11,19 @@ import type { PokemonEntry } from '../../domain/pogo/game-master.js';
 import {
   notificationTiers,
   type NotificationTarget,
+  type Want,
 } from '../../domain/pogo/notification-target.js';
-import { raidTier, raidTierLabel } from '../../domain/pogo/raid-tier.js';
+import {
+  isRaidLevel,
+  raidTier,
+  raidTierLabel,
+  type RaidLevel,
+} from '../../domain/pogo/raid-tier.js';
 import {
   baseTarget,
-  heldBoxes,
   pokemonBoxes,
   subjectOf,
   subjectOfTarget,
-  sameSubject,
   rocketTargetLabel,
   targetWantLabel,
   tierBoxes,
@@ -32,13 +36,14 @@ import {
   allCostumed,
   answerScopeOf,
   boxesOf,
+  heldRows,
   whichHash,
   WHICH_CAP,
   type AnswerScope,
   type HeldRow,
 } from '../../domain/pogo/species-answer.js';
 import { rewardCostumed } from '../../domain/notify/reasons.js';
-import { speciesNameOf } from '../../domain/pogo/wants.js';
+import { speciesNameOf, tierWantLabel } from '../../domain/pogo/wants.js';
 import { appearsInWild } from '../../domain/pogo/wild.js';
 import type { WantList } from '../../domain/pogo/wants.js';
 import { foldTaskText } from '../../domain/research/task.js';
@@ -403,97 +408,179 @@ export function readWanted(ctx: AppContext, value: string, own = false): Wanted
   return subject ? { kind: 'subject', subject, target } : { kind: 'iv', target };
 }
 
-/** A line of `/wants`: what it is called, its boxes (none for IVs and rewards), and its Remove. */
+/**
+ * A line of `/wants`: what it is called, its boxes, what its Remove takes away (and `/unwant`
+ * does), and the subject whose dialog its Change… opens (plan 8R-4: a Pokémon's and a tier's
+ * line; the others keep Remove).
+ */
 export interface WantEntry {
   label: string;
+  /** What the line of `/wants` calls it where that is not `label`: a tier's "Tier 5 raids" (R-M4). */
+  listLabel?: string;
   boxes: WantBox[];
-  /** What the line's Remove takes away. */
+  /** What the line's Remove (or `/unwant`) takes away. */
   remove:
     | { kind: 'subject'; subject: BoxSubject }
     | { kind: 'want'; target: NotificationTarget }
     | { kind: 'target'; want: TargetWant };
   /** The token a choice of `/unwant` gives for it. */
   token: string;
+  /** Change… of the line: the dialog of a species, of an Unown letter, of a tier. */
+  change?: BoxSubject;
 }
 
 /**
- * A member's wants of both tables as `/wants` lists them (design 7): each Pokémon or form once
- * with its boxes (`Dratini: Raids, Research, Shadow`), by name; the tiers in their order with
- * their raids and shadow raids; the IV targets; the items and Mega Energy, by name.
+ * A tier as its line of `/wants` names it (Matt's R-M4): "Tier 5 raids" for the starred tiers,
+ * the others as everywhere ("Mega raids", "Elite raids"). Its shadow raids are a box of the line.
+ */
+function tierListLabel(level: RaidLevel): string {
+  const stars = /^T(\d)$/.exec(level)?.[1];
+  return stars === undefined ? tierWantLabel({ level, shadow: false }) : `Tier ${stars} raids`;
+}
+
+/** A subject's line: its rows named as a want is (`rowsLabel`), their boxes, and Change…. */
+function subjectEntry(ctx: AppContext, subject: BoxSubject, rows: readonly HeldRow[]): WantEntry {
+  const held = boxesOf(rows);
+  return {
+    label:
+      subject.kind === 'tier'
+        ? tierWantLabel(raidTier(subject.level, false) ?? { level: subject.level, shadow: false })
+        : rowsLabel(ctx, subject, rows),
+    boxes: BOX_ORDER.filter((box) => held.has(box)),
+    ...(subject.kind === 'tier' ? { listLabel: tierListLabel(subject.level) } : {}),
+    remove: { kind: 'subject', subject },
+    token:
+      subject.kind === 'tier'
+        ? `tier:${subject.level}`
+        : `pokemon:${String(subject.dex)}${subject.form === undefined ? '' : `:${subject.form}`}`,
+    change: subject,
+  };
+}
+
+/**
+ * A member's wants of both tables as `/wants` lists them (design 4, plan 8R-4): one line per
+ * species with its forms named together (an Unown letter a line of its own), by species name;
+ * the tiers in their order; Team GO Rocket; then the lines without a dialog, which keep Remove:
+ * the items and Mega Energy by name, Perfect IVs, Zero IVs.
  */
 export function wantEntries(
   ctx: AppContext,
   wants: WantList,
   targets: TargetWantList,
 ): WantEntry[] {
-  const subjects: BoxSubject[] = [];
-  const add = (subject: BoxSubject | undefined): void => {
-    if (subject && !subjects.some((known) => sameSubject(known, subject))) subjects.push(subject);
+  const { catalogue } = ctx.gameData;
+  // Each Pokédex number's rows apart, in the order first met: a line reads only its own, so that
+  // a list of every species takes no time for each one over the whole list.
+  const byDex = new Map<number, { wants: Want[]; targets: TargetWant[] }>();
+  const rowsOfDex = (dex: number): { wants: Want[]; targets: TargetWant[] } => {
+    let rows = byDex.get(dex);
+    if (!rows) {
+      rows = { wants: [], targets: [] };
+      byDex.set(dex, rows);
+    }
+    return rows;
   };
   const ivs: NotificationTarget[] = [];
+  const tierLevels = new Set<string>();
   for (const want of wants.wants) {
-    const subject = subjectOf(want.target);
-    if (subject) add(subject);
+    if (want.target.kind === 'pokemon') rowsOfDex(want.target.dex).wants.push(want);
+    else if (want.target.kind === 'tier') tierLevels.add(want.target.tier.level);
     else ivs.push(want.target);
   }
   const rewards: TargetWant[] = [];
   const rocket: TargetWant[] = [];
   for (const want of targets.wants) {
     const subject = subjectOfTarget(want);
-    if (subject) add(subject);
+    if (subject?.kind === 'pokemon') rowsOfDex(subject.dex).targets.push(want);
     else if (want.kind === 'rocket') rocket.push(want);
     else rewards.push(want);
   }
-  const entry = (subject: BoxSubject): WantEntry => ({
-    label: subjectLabel(ctx, subject),
-    boxes: [...heldBoxes(subject, wants.wants, targets.wants)].sort(
-      (a, b) => BOX_ORDER.indexOf(a) - BOX_ORDER.indexOf(b),
-    ),
-    remove: { kind: 'subject', subject },
-    token:
-      subject.kind === 'tier'
-        ? `tier:${subject.level}`
-        : `pokemon:${String(subject.dex)}${subject.form === undefined ? '' : `:${subject.form}`}`,
+  const pokemon = [...byDex].flatMap(([dex, own]) => {
+    const species: BoxSubject = { kind: 'pokemon', dex };
+    const scope = scopeOf(ctx, species);
+    const name = speciesNameOf(catalogue, dex) ?? `Pokémon #${String(dex)}`;
+    const rows = heldRows(scope, own.wants, own.targets);
+    const lines = rows.length > 0 ? [{ name, entry: subjectEntry(ctx, species, rows) }] : [];
+    if (scope.wide) return lines;
+    // Beyond the Which field (Unown): each form a line of its own, after the species'.
+    const forms = new Set<string>();
+    for (const want of own.wants) {
+      if (want.target.kind === 'pokemon' && want.target.form) forms.add(want.target.form);
+    }
+    for (const want of own.targets) {
+      const of = subjectOfTarget(want);
+      if (of?.kind === 'pokemon' && of.form !== undefined) forms.add(of.form);
+    }
+    const letters = [...forms]
+      .map((form) => {
+        const subject: BoxSubject = { kind: 'pokemon', dex, form };
+        const held = heldRows({ subject, wide: false }, own.wants, own.targets);
+        return { name, entry: subjectEntry(ctx, subject, held) };
+      })
+      .filter(({ entry }) => entry.boxes.length > 0)
+      .sort((a, b) => byName(a.entry.label, b.entry.label));
+    return [...lines, ...letters];
   });
-  const pokemon = subjects
-    .filter((subject) => subject.kind === 'pokemon')
-    .map(entry)
-    .sort((a, b) => byName(a.label, b.label));
+  // By species name; a species' line before its letters (a stable sort keeps them so).
+  pokemon.sort((a, b) => byName(a.name, b.name));
   const tiers = notificationTiers()
-    .filter((tier) => !tier.shadow)
-    .flatMap((tier) =>
-      subjects.filter((subject) => subject.kind === 'tier' && subject.level === tier.level),
-    )
-    .map(entry);
-  const ivEntries = (['perfect', 'zero'] as const).flatMap((iv) =>
-    ivs
-      .filter((target) => target.kind === 'iv' && target.iv === iv)
-      .map((target): WantEntry => ({
-        label: wantLabel(ctx, target),
-        boxes: [],
-        remove: { kind: 'want', target },
-        token: `iv:${iv}`,
-      })),
+    .filter((tier) => !tier.shadow && tierLevels.has(tier.level))
+    .flatMap((tier) => {
+      const subject: BoxSubject = { kind: 'tier', level: tier.level };
+      const rows = heldRows({ subject, wide: false }, wants.wants, targets.wants);
+      return rows.length > 0 ? [subjectEntry(ctx, subject, rows)] : [];
+    });
+  // Shadow tiers without their ordinary tier: the tier's line holds them too.
+  for (const level of tierLevels) {
+    if (tiers.some((entry) => entry.change?.kind === 'tier' && entry.change.level === level)) {
+      continue;
+    }
+    if (!isRaidLevel(level)) continue;
+    const subject: BoxSubject = { kind: 'tier', level };
+    const rows = heldRows({ subject, wide: false }, wants.wants, targets.wants);
+    if (rows.length > 0) tiers.push(subjectEntry(ctx, subject, rows));
+  }
+  const tierOrder = notificationTiers().map((tier) => tier.level);
+  tiers.sort(
+    (a, b) =>
+      tierOrder.indexOf(a.change?.kind === 'tier' ? a.change.level : 'T1') -
+      tierOrder.indexOf(b.change?.kind === 'tier' ? b.change.level : 'T1'),
   );
-  const rewardEntries = rewards
-    .map((want): WantEntry => ({
-      label: rewardLabel(ctx, want),
-      boxes: [],
-      remove: { kind: 'target', want },
-      token: targetWantToken(want),
-    }))
-    .sort((a, b) => byName(a.label, b.label));
   // In the order of `rocketTargets` (plan 8R-2): grunts, the decoy, the leaders, Giovanni.
   const order = rocketTargets().map(targetWantToken);
   const rocketEntries = rocket
     .map((want): WantEntry => ({
-      label: targetWantLabel(ctx.gameData.catalogue, want),
+      label: targetWantLabel(catalogue, want),
       boxes: [],
       remove: { kind: 'target', want },
       token: targetWantToken(want),
     }))
     .sort((a, b) => order.indexOf(a.token) - order.indexOf(b.token));
-  return [...pokemon, ...tiers, ...ivEntries, ...rewardEntries, ...rocketEntries];
+  const rewardEntries = rewards
+    .map((want): WantEntry => ({
+      label: rewardLabel(ctx, want).replace(/ \(research\)$/, ''),
+      boxes: ['research'],
+      remove: { kind: 'target', want },
+      token: targetWantToken(want),
+    }))
+    .sort((a, b) => byName(a.label, b.label));
+  const ivEntries = (['perfect', 'zero'] as const).flatMap((iv) =>
+    ivs
+      .filter((target) => target.kind === 'iv' && target.iv === iv)
+      .map((target): WantEntry => ({
+        label: iv === 'perfect' ? 'Perfect IVs' : 'Zero IVs',
+        boxes: ['spawns'],
+        remove: { kind: 'want', target },
+        token: `iv:${iv}`,
+      })),
+  );
+  return [
+    ...pokemon.map(({ entry }) => entry),
+    ...tiers,
+    ...rocketEntries,
+    ...rewardEntries,
+    ...ivEntries,
+  ];
 }
 
 /** The boxes in the order a line names them. */
diff --git a/src/commands/notifications/wants.test.ts b/src/commands/notifications/wants.test.ts
index 5c0386b432472394af3f25c9297c217f4fad89b9..0970cb0dfbb30e5aa04f7e3e1ce9b7f08676970c 100644
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -71,6 +71,7 @@ import {
 import { boxTarget } from '../../domain/notify/target-wants.js';
 import { wantEntries } from './want-boxes.js';
 import { NO_WHICH, wantDialogId } from './want-dialog.js';
+import { wantLineCount } from './wants.js';
 import type { ResearchTask } from '../../domain/research/task.js';
 import type { RocketChoice } from '../../domain/rocket/lineups.js';
 import { rocketChoicesOfFeed, rocketLineupsFixture } from '../../../test/support/rocket.js';
@@ -839,7 +840,11 @@ describe('/want: the Pokémon dialog (plan 8R-4)', () => {
     expect(dialogField(dialog, 'Only costumed Dratini').ticked).toBe(true);
     // Written at once (one box, nothing else to ask): the costume stays.
     made.store.add(ALICE, FAKE_GUILD_ID, 151, 'raid', { costumed: true });
-    expect(await made.answer('want', { target: 'Mew' })).toMatch(/^\*\*Costumed Mew\*\*: Raids\./);
+    // Only there is it said where Costumed can be unticked (F3): a plain Mew's answer has no note.
+    expect(await made.answer('want', { target: 'Mew' })).toBe(
+      '**Costumed Mew**: Raids. You will get a DM when one is reported in a region you can see.\n' +
+        '-# Only costumed ones are told: Change… in `/wants` can untick Only costumed.',
+    );
     expect(made.store.rows.find((row) => row.pokemon === 151)?.costumed).toBe(true);
   });
 
@@ -1237,7 +1242,7 @@ describe('/want: Team GO Rocket (plan 8R-2)', () => {
     const message = asV2(answered(await made.run('wants')));
     expect(textDisplays(message).slice(1, -1)).toEqual([
       '**Dragon-type grunt**',
-      '**Cliff** (Team GO Rocket leader)',
+      '**Cliff (Team GO Rocket leader)**',
     ]);
     expect(customIdsOf(message)).toEqual([
       'wantlist:0:remove:rg:dragon',
@@ -1783,12 +1788,12 @@ describe('/unwant', () => {
     made.store.add(BOB, FAKE_GUILD_ID, 2, 'both');
     expect(await made.choices('unwant', '')).toEqual([
       { name: 'Dratini: Spawns, Shadow', value: 'pokemon:147' },
-      { name: 'Mewtwo (every form): Raids, Spawns', value: 'pokemon:150' },
-      { name: 'Perfect IV spawns', value: 'iv:perfect' },
-      { name: 'T5: Raids', value: 'tier:T5' },
+      { name: 'Mewtwo: Raids, Spawns', value: 'pokemon:150' },
+      { name: 'Perfect IVs: Spawns', value: 'iv:perfect' },
+      { name: 'T5 raids: Raids', value: 'tier:T5' },
     ]);
     expect(await made.choices('unwant', 'mew')).toEqual([
-      { name: 'Mewtwo (every form): Raids, Spawns', value: 'pokemon:150' },
+      { name: 'Mewtwo: Raids, Spawns', value: 'pokemon:150' },
     ]);
     expect(await made.choices('unwant', '', { isDm: true })).toEqual([]);
     expect(await made.answer('unwant', { target: 'Dratini: Spawns, Shadow' })).toBe(
@@ -1850,7 +1855,7 @@ describe('/wants', () => {
     expectV2Sendable(message);
   });
 
-  it('lists each Pokémon once with its boxes by name, then tiers, IVs and rewards', async () => {
+  it('lists each Pokémon once by name, the tiers, then the Remove lines: rewards, IVs (plan 8R-4)', async () => {
     const made = setup([pageTask('Catch a Dragon-type Pokémon')]);
     for (const [pokemon, type] of [
       [150, 'both'],
@@ -1884,26 +1889,135 @@ describe('/wants', () => {
     expect(textDisplays(message)[0]).toBe('### Your wants in Test Server\n8 wants');
     expect(lines(answered(used))).toEqual([
       '**Dratini**: Raids, Research, Shadow',
-      '**Giratina** (every form): Spawns',
+      '**Giratina**: Spawns',
       '**Machamp**: Dynamax',
-      '**Mewtwo** (every form): Raids, Spawns',
-      '**T1**: Raids',
-      '**T5**: Raids, Shadow raids',
-      '**Zero IV spawns**',
-      '**Rare Candy** (research)',
+      '**Mewtwo**: Raids, Spawns',
+      '**Tier 1 raids**: Raids',
+      '**Tier 5 raids**: Raids, Shadow raids',
+      '**Rare Candy**: Research',
+      '**Zero IVs**: Spawns',
+    ]);
+    expect(buttonsOf(message).map((button) => button.label)).toEqual([
+      ...Array.from({ length: 6 }, () => 'Change…'),
+      'Remove',
+      'Remove',
+      'Remove all…',
     ]);
     expect(customIdsOf(message)).toEqual([
-      'wantlist:0:remove:sp:147',
-      'wantlist:0:remove:sp:487',
-      'wantlist:0:remove:sp:68',
-      'wantlist:0:remove:sp:150',
-      'wantlist:0:remove:st:T1',
-      'wantlist:0:remove:st:T5',
-      'wantlist:0:remove:iv:zero',
+      'wantlist:0:change:sp:147',
+      'wantlist:0:change:sp:487',
+      'wantlist:0:change:sp:68',
+      'wantlist:0:change:sp:150',
+      'wantlist:0:change:st:T1',
+      'wantlist:0:change:st:T5',
       'wantlist:0:remove:ri:rare-candy',
+      'wantlist:0:remove:iv:zero',
       'wantlist:0:all',
     ]);
-    expect(textDisplays(message).at(-1)).toBe('-# `/want` adds one or changes what it is for.');
+    expect(textDisplays(message).at(-1)).toBe('-# Add one with `/want`.');
+  });
+
+  it('names the forms of a species together, up to three, and above that by count', async () => {
+    const made = setup();
+    for (const form of ['arceus', 'arceus_dragon', 'arceus_fire']) {
+      made.store.add(ALICE, FAKE_GUILD_ID, 493, 'raid', { form });
+    }
+    for (const form of [
+      'vivillon',
+      'vivillon_archipelago',
+      'vivillon_continental',
+      'vivillon_elegant',
+    ]) {
+      made.store.add(ALICE, FAKE_GUILD_ID, 666, 'spawn', { form });
+    }
+    made.store.add(ALICE, FAKE_GUILD_ID, 25, 'raid', { costumed: true });
+    made.store.add(ALICE, FAKE_GUILD_ID, 222, 'both', { form: 'corsola_galarian' });
+    made.store.add(ALICE, FAKE_GUILD_ID, 201, 'spawn');
+    made.store.add(ALICE, FAKE_GUILD_ID, 201, 'spawn', { form: 'unown_a' });
+    expect(lines(answered(await made.run('wants')))).toEqual([
+      '**Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)**: Raids',
+      '**Galarian Corsola**: Raids, Spawns',
+      '**Costumed Pikachu**: Raids',
+      '**Unown**: Spawns',
+      '**Unown (A)**: Spawns',
+      '**Vivillon (4 of 21 forms)**: Spawns',
+    ]);
+    expect(await wantLineCount(made.ctx, ALICE, FAKE_GUILD_ID)).toBe(6);
+  });
+
+  it('opens the dialog of a line on Change…, with the page, and shows the page again after its Submit', async () => {
+    const made = setup();
+    for (let dex = 1; dex <= 12; dex++) made.store.add(ALICE, FAKE_GUILD_ID, dex, 'both');
+    const pressed = await made.handle(
+      fakeButton({ customId: 'wantlist:1:change:sp:8', userId: ALICE, v2Message: true }),
+    );
+    expect(pressed.update).not.toHaveBeenCalled();
+    const dialog = shownDialog(pressed);
+    expect(dialog.title).toBe('Wartortle: what for?');
+    expect(dialogText(dialog)).toBe(
+      'Your Wartortle want. Change what you want a DM about, or tick Remove to stop them all.',
+    );
+    expect(dialog.custom_id).toMatch(/:l1:~[0-9a-z]+$/);
+    const submit = fakeModal({
+      customId: dialog.custom_id,
+      form: dialog,
+      checked: { boxes: ['raids', 'shadow'] },
+      userId: ALICE,
+      v2Message: true,
+    });
+    // Acknowledged before anything is written (B1): the page is then shown by an edit.
+    const set = made.ctx.wantBoxes.set.bind(made.ctx.wantBoxes);
+    let acknowledged = false;
+    made.ctx.wantBoxes.set = (...args) => {
+      acknowledged = submit.deferUpdate.mock.calls.length > 0;
+      return set(...args);
+    };
+    const submitted = await made.handle(submit);
+    expect(acknowledged).toBe(true);
+    expect(submitted.update).not.toHaveBeenCalled();
+    const shown = asV2(sent(submitted.editReply));
+    expect(textDisplays(shown)[0]).toBe(
+      '### Your wants in Test Server\n' +
+        '**Wartortle**: Raids, Shadow. You will get a DM when one is reported in a region you ' +
+        'can see.\n12 wants · page 2 of 2',
+    );
+    expect(submitted.followUp).not.toHaveBeenCalled();
+    // Nothing held any more: said, nothing opened.
+    made.store.rows.splice(0);
+    const gone = await made.handle(
+      fakeButton({ customId: 'wantlist:0:change:sp:8', userId: ALICE, v2Message: true }),
+    );
+    expect(gone.showModal).not.toHaveBeenCalled();
+    expect(sent(gone.reply).content).toBe('**Wartortle** is not on your list; `/want` adds it.');
+  });
+
+  it('says a warning of its Submit also below, privately', async () => {
+    const made = setup();
+    made.store.add(ALICE, FAKE_GUILD_ID, 25, 'raid');
+    const dialog = shownDialog(
+      await made.handle(
+        fakeButton({ customId: 'wantlist:0:change:sp:25', userId: ALICE, v2Message: true }),
+      ),
+    );
+    const submitted = await made.handle(
+      fakeModal({
+        customId: dialog.custom_id,
+        form: dialog,
+        checked: { boxes: ['raids', 'gigantamax'] },
+        ticks: { costumed: true },
+        userId: ALICE,
+        v2Message: true,
+      }),
+    );
+    expect(textDisplays(asV2(sent(submitted.editReply)))[0]).toMatch(
+      /^### Your wants in Test Server\n\*\*Costumed Pikachu\*\*: Raids, Gigantamax\./,
+    );
+    const warned = sent(submitted.followUp);
+    expect(warned.content).toBe(
+      "-# Costumed Pokémon haven't appeared in max battles or as shadows so far, so " +
+        'Gigantamax stays quiet unless that changes.',
+    );
+    expect(warned.flags).toBe(MessageFlags.Ephemeral);
   });
 
   it('shows what it cannot read, with Remove all, also when nothing else is left', async () => {
@@ -1913,32 +2027,26 @@ describe('/wants', () => {
     expect(textDisplays(message)).toEqual([
       '### Your wants in Test Server\n0 wants\n' +
         '…and 1 entry this version cannot read; `/unwant-all` removes those too.',
-      '-# `/want` adds one or changes what it is for.',
+      '-# Add one with `/want`.',
     ]);
     expect(customIdsOf(message)).toEqual(['wantlist:0:all']);
   });
 
-  it('takes every box of a line off on Remove and shows the list again at the same page', async () => {
+  it('takes a line off on Remove and shows the list again at the same page', async () => {
     const made = setup();
     for (let dex = 1; dex <= 12; dex++) made.store.add(ALICE, FAKE_GUILD_ID, dex, 'both');
-    made.store.add(ALICE, FAKE_GUILD_ID, 8, 'raid', { shadow: true });
-    await made.ctx.targetWants.change(
-      ALICE,
-      FAKE_GUILD_ID,
-      { add: [boxTarget('dynamax', 8)], remove: [] },
-      0,
-    );
+    made.store.add(ALICE, FAKE_GUILD_ID, -6, 'spawn');
+    made.store.add(ALICE, FAKE_GUILD_ID, -8, 'spawn');
     const first = asV2(answered(await made.run('wants')));
-    expect(textDisplays(first)[0]).toBe('### Your wants in Test Server\n12 wants · page 1 of 2');
+    expect(textDisplays(first)[0]).toBe('### Your wants in Test Server\n14 wants · page 1 of 2');
     const next = await made.handle(fakeButton({ customId: 'wantlist:0:next', userId: ALICE }));
     const second = asV2(sent(next.update));
-    const remove = customIdsOf(second).find((id) => id.endsWith(':sp:8'));
-    expect(remove).toBe('wantlist:1:remove:sp:8');
+    const remove = customIdsOf(second).find((id) => id.endsWith(':iv:perfect'));
+    expect(remove).toBe('wantlist:1:remove:iv:perfect');
     const pressed = await made.handle(fakeButton({ customId: remove ?? '', userId: ALICE }));
-    expect(made.rows().some(([pokemon]) => pokemon === 8)).toBe(false);
-    expect(await made.ctx.targetWants.count(ALICE, FAKE_GUILD_ID)).toBe(0);
+    expect(made.rows().some(([pokemon]) => pokemon === -6)).toBe(false);
     expect(textDisplays(asV2(sent(pressed.update)))[0]).toBe(
-      '### Your wants in Test Server\n11 wants · page 2 of 2',
+      '### Your wants in Test Server\n13 wants · page 2 of 2',
     );
     // Somebody else's rows are untouched by a press, and a press twice is no error.
     made.store.add(BOB, FAKE_GUILD_ID, 1, 'both');
@@ -1950,7 +2058,7 @@ describe('/wants', () => {
     );
     expect(again.reply).not.toHaveBeenCalled();
     expect(made.rows(BOB)).toEqual([[1, 'both']]);
-    expect(made.rows()).toHaveLength(10);
+    expect(made.rows()).toHaveLength(12);
   });
 
   it('asks the question of /unwant-all on Remove all… in its dialog, the list staying', async () => {
@@ -2030,9 +2138,9 @@ describe('/wants', () => {
       server,
       0,
     );
-    const [remove] = customIdsOf(long);
-    expect(remove).toMatch(/^wantlist:0:remove:sp:150:mewtwo_x+$/);
-    expect(remove?.length).toBeLessThanOrEqual(100);
+    // A form of Mewtwo, which has a Which field: its species' line, Change… of the species.
+    const [change] = customIdsOf(long);
+    expect(change).toBe('wantlist:0:change:sp:150');
   });
 });
 
diff --git a/src/commands/notifications/wants.ts b/src/commands/notifications/wants.ts
index 873bc3e55e26582bda05d33d909626270d2ff6ea..4ae338568f8c994d4cc39cb5f65090e391c35545 100644
--- a/src/commands/notifications/wants.ts
+++ b/src/commands/notifications/wants.ts
@@ -1,6 +1,8 @@
 import {
+  ButtonStyle,
   MessageFlags,
   SlashCommandBuilder,
+  type ButtonInteraction,
   type Message,
   type APIModalInteractionResponseCallbackData,
   type ChatInputCommandInteraction,
@@ -10,7 +12,7 @@ import type { AppContext } from '../../app-context.js';
 import type { ComponentHandler, Guard, SimpleCommand } from '../../discord/command.js';
 import { decodeCustomId } from '../../discord/custom-id.js';
 import { dmMessages } from '../../components/dm-messages.js';
-import { changeButtonId, withChanged } from '../../render/notify-dm.js';
+import { CHANGE_ACTION, changeButtonId, withChanged } from '../../render/notify-dm.js';
 import { deferSubmit, readInTime } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf, partyOf, requireGuild } from '../../discord/guards.js';
@@ -36,7 +38,7 @@ import {
 import { hasForms, type SetWantOutcome } from '../../domain/pogo/wants.js';
 import type { V2Message } from '../../discord/party-gateway.js';
 import type { TargetWant } from '../../domain/notify/target-wants.js';
-import { stopArgs, type NotifyReason } from '../../domain/notify/reasons.js';
+import { parseStopArgs, stopArgs, type NotifyReason } from '../../domain/notify/reasons.js';
 import { renderMemberList } from '../../render/member-list.js';
 import { count, plain, truncate } from '../../render/text.js';
 import { memberListControls } from './list-controls.js';
@@ -73,7 +75,7 @@ import {
   type WantDialogView,
 } from './want-dialog.js';
 import { wantChoices, wantLabel, wantName } from './want-input.js';
-import { answer, v2Answer } from '../../discord/late-reply.js';
+import { answer, showInPlace, v2Answer } from '../../discord/late-reply.js';
 import { searchText, searchTokens } from '../../domain/search/text.js';
 
 /**
@@ -320,6 +322,13 @@ function rocketWantAnswer(target: TargetWant): string {
   );
 }
 
+/**
+ * What `/want` adds where it wrote at once (one box, no Costumes field) and a row held stays
+ * costumed (F3): the dialog of a line's Change… in `/wants` shows Costumes for it.
+ */
+const STILL_COSTUMED =
+  '-# Only costumed ones are told: Change… in `/wants` can untick Only costumed.';
+
 /** What `/want` answers where nothing is typed outside the post of a raid or max battle (R-M1). */
 export const NAME_A_POKEMON =
   'Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it ' +
@@ -552,7 +561,11 @@ export const want: SimpleCommand = {
         remove: false,
       };
       const { after } = await ctx.wantBoxes.set(memberId, guildId, given, Date.now());
-      await answer(interaction, { content: boxesAnswer(ctx, subject, after, given) });
+      const said = boxesAnswer(ctx, subject, after, given);
+      // A costumed row stays costumed unseen (F3): where to make it plain is said.
+      await answer(interaction, {
+        content: after.some((row) => row.costumed) ? `${said}\n${STILL_COSTUMED}` : said,
+      });
       return;
     }
     const held = await readInTime(ctx.log, interaction, () =>
@@ -668,6 +681,34 @@ async function submitFromDm(
   await interaction.followUp({ content: said });
 }
 
+/**
+ * A Submit of a dialog Change… of `/wants` opened (plan 8R-4, S3): acknowledged on the list first
+ * (`deferUpdate`, B1), written, then the list's page shown again in its place (`showInPlace`, an
+ * edit by then) with the answer as a note at its top; its small print (a warning) also below,
+ * privately, so that it is not missed.
+ */
+async function submitFromList(
+  interaction: ModalSubmitInteraction,
+  ctx: AppContext,
+  submit: WantDialogId,
+  given: BoxAnswer,
+  page: number,
+): Promise<void> {
+  // Acknowledged first (B1): the writing and the list's read may take longer than Discord waits.
+  await interaction.deferUpdate();
+  const { after } = await ctx.wantBoxes.set(
+    interaction.user.id,
+    guildIdOf(interaction),
+    given,
+    Date.now(),
+  );
+  const [said = '', ...warnings] = boxesAnswer(ctx, submit.subject, after, given).split('\n');
+  await showInPlace(interaction, await memberWants(interaction, ctx, page, said));
+  if (warnings.length > 0) {
+    await interaction.followUp({ content: warnings.join('\n'), flags: MessageFlags.Ephemeral });
+  }
+}
+
 /**
  * The Submit of `/want`'s dialog (kind `wantbox`): the boxes it shows now, as ticked; every
  * other box as it is; in one transaction under the member's lock (`WantBoxStorage.set`). The
@@ -687,6 +728,10 @@ export const wantBoxControls: ComponentHandler = {
       await submitFromDm(interaction, ctx, submit, given);
       return;
     }
+    if (submit.page !== undefined && interaction.isFromMessage()) {
+      await submitFromList(interaction, ctx, submit, given, submit.page);
+      return;
+    }
     await deferSubmit(interaction);
     const { after } = await ctx.wantBoxes.set(
       interaction.user.id,
@@ -882,19 +927,15 @@ function reasonOf(entry: WantEntry): NotifyReason {
 
 /**
  * A line of the list, in at most `room` characters: `**Dratini**: Raids, Research, Shadow`,
- * `**Rare Candy** (research)`. Only the name is cut, before it is made plain.
+ * `**Rare Candy**: Research`. Only the name is cut, before it is made plain.
  */
 function entryLine(entry: WantEntry, room: number): string {
   const boxes = entry.boxes.length === 0 ? '' : `: ${boxWords(entry.boxes)}`;
-  const line = (label: string): string => {
-    const cut = label.indexOf(' (');
-    const name = cut > 0 ? label.slice(0, cut) : label;
-    const rest = cut > 0 ? label.slice(cut).trim() : '';
-    return `**${plain(name)}**${rest === '' ? '' : ` ${plain(rest)}`}${boxes}`;
-  };
-  let shown = line(entry.label);
-  for (let keep = entry.label.length - 1; shown.length > room && keep > 1; keep--) {
-    shown = line(truncate(entry.label, keep));
+  const line = (label: string): string => `**${plain(label)}**${boxes}`;
+  const label = entry.listLabel ?? entry.label;
+  let shown = line(label);
+  for (let keep = label.length - 1; shown.length > room && keep > 1; keep--) {
+    shown = line(truncate(label, keep));
   }
   return shown;
 }
@@ -909,6 +950,7 @@ export function wantsList(
   unreadable: number,
   serverName: string,
   page: number,
+  notice?: string,
 ): V2Message {
   return renderMemberList({
     kind: WANT_LIST_KIND,
@@ -917,8 +959,21 @@ export function wantsList(
     items: entries.map((entry) => ({
       line: (room: number) => entryLine(entry, room),
       removeArgs: stopArgs(reasonOf(entry)),
+      // Plan 8R-4: a Pokémon's and a tier's line has Change… (its dialog), the others Remove.
+      ...(entry.change === undefined
+        ? {}
+        : {
+            button: {
+              action: CHANGE_ACTION,
+              label: 'Change…',
+              style: ButtonStyle.Secondary,
+              args: stopArgs({ kind: 'subject', subject: entry.change }),
+              command: '/want',
+            },
+          }),
     })),
     page,
+    ...(notice === undefined ? {} : { notice }),
     notes:
       unreadable > 0
         ? [
@@ -926,21 +981,51 @@ export function wantsList(
               '`/unwant-all` removes those too.',
           ]
         : [],
-    footer: '`/want` adds one or changes what it is for.',
+    footer: 'Add one with `/want`.',
     empty: 'You want nothing yet. `/want` adds one.',
     removeCommand: '/unwant',
     removable: entries.length > 0 || unreadable > 0,
   });
 }
 
-/** The list of the member of an interaction in its server, at a page. */
+/** The list of the member of an interaction in its server, at a page, with a note at its top. */
 async function memberWants(
   interaction: { user: { id: string }; guildId: string | null; guild: { name: string } | null },
   ctx: AppContext,
   page: number,
+  notice?: string,
 ): Promise<V2Message> {
   const { entries, unreadable } = await entriesOf(ctx, interaction.user.id, guildIdOf(interaction));
-  return wantsList(entries, unreadable, interaction.guild?.name ?? 'this server', page);
+  return wantsList(entries, unreadable, interaction.guild?.name ?? 'this server', page, notice);
+}
+
+/**
+ * Change… of a line of `/wants` (plan 8R-4, S3): the dialog of its species, Unown letter or tier
+ * with the member's rows as stored, read in time, before any answer; its id carries the list's
+ * page. Nothing held any more is said (S2).
+ */
+async function changeLine(
+  interaction: ButtonInteraction,
+  ctx: AppContext,
+  args: readonly string[],
+  page: number,
+): Promise<void> {
+  const asked = parseStopArgs(args);
+  if (asked?.kind !== 'subject') {
+    throw new UserError('That list is out of date. Use `/wants` again.');
+  }
+  const { subject } = asked;
+  const memberId = interaction.user.id;
+  const guildId = guildIdOf(interaction);
+  const held = await readInTime(ctx.log, interaction, () =>
+    ctx.wantBoxes.held(memberId, guildId, scopeOf(ctx, subject)),
+  );
+  if (held.length === 0) {
+    throw new UserError(
+      `**${plain(dialogName(ctx, subject))}** is not on your list; \`/want\` adds it.`,
+    );
+  }
+  await interaction.showModal(wantDialogFor(ctx, subject, held, { page, openedAt: Date.now() }));
 }
 
 /** `/wants` (spec 4.2): the member's list in this server, for the member alone. */
@@ -949,10 +1034,11 @@ export const wants: SimpleCommand = {
   help: {
     category: 'notifications',
     details:
-      'Shows your list for this server, ten to a page: each Pokémon once with what you want it ' +
-      'for (`Dratini: Raids, Research, Shadow`), the raid tiers, perfect or zero IVs, the ' +
-      'research rewards and Team GO Rocket. Each has a Remove button; "Remove all…" asks before ' +
-      'it empties the list.',
+      'Shows your list for this server, ten to a page: each Pokémon once with its forms and what ' +
+      'you want it for (`Dratini: Raids, Research, Shadow`), by name, then the raid tiers, Team ' +
+      'GO Rocket, the research rewards and perfect or zero IVs. A Pokémon or a tier has Change…, ' +
+      'which opens its dialog (Remove there takes it off); the others a Remove button. "Remove ' +
+      'all…" asks before it empties the list.',
     examples: ['/wants'],
   },
   enabled: notificationsEnabled,
@@ -1025,4 +1111,5 @@ export const wantListControls = memberListControls({
     return false;
   },
   askAll: (interaction, ctx) => allWants.ask(interaction, ctx),
+  actions: { [CHANGE_ACTION]: changeLine },
 });
diff --git a/src/commands/round-trips.db.test.ts b/src/commands/round-trips.db.test.ts
index 430588d9d007cc9b05e690393b27e7cfa69b8fa2..afc56b92217461863b27378a844348be9c9bfec4 100644
--- a/src/commands/round-trips.db.test.ts
+++ b/src/commands/round-trips.db.test.ts
@@ -284,7 +284,7 @@ describe('round trips to the database per command', () => {
       ]);
       const listed = await use('/wants', command(member, 'wants'));
       expect(listed).toContain('Dratini');
-      expect(listed).toContain('Perfect IV spawns');
+      expect(listed).toContain('Perfect IVs**: Spawns');
       expect(await type('/target, typing', typing(member, 'target', 'gym', 'lib'))).toContain(
         'Pinewood Public Library · The Stacks',
       );
diff --git a/src/commands/settings/settings.test.ts b/src/commands/settings/settings.test.ts
index 9bd38358658f7b1b265d85a9a5dbfc335dae5af8..899d7a12d13345f0d1ac1b0fb1f208ddb1ca031a 100644
--- a/src/commands/settings/settings.test.ts
+++ b/src/commands/settings/settings.test.ts
@@ -362,9 +362,10 @@ describe('/settings show', () => {
       },
       0,
     );
-    // Giratina (its boxes), Giratina Origin, Machamp, Rare Candy.
+    // Giratina (its species row and its Origin Forme: one line since plan 8R-4), Machamp, Rare
+    // Candy.
     expect(await made.answer('show')).toContain(
-      '- Pokémon, raid tiers and rewards on your list in this server: **4** · `/wants`',
+      '- Pokémon, raid tiers and rewards on your list in this server: **3** · `/wants`',
     );
   });
 
diff --git a/src/render/member-list.ts b/src/render/member-list.ts
index 3b711da72e3110edb11ef09877e2549f1bdad7d6..7bdfca708bfcf2318965aecd24bdc926871cf426 100644
--- a/src/render/member-list.ts
+++ b/src/render/member-list.ts
@@ -32,6 +32,18 @@ export interface ListItem {
   line(room: number): string;
   /** The custom id's arguments that name what Remove takes off (a want token's parts, a gym id). */
   removeArgs: string[];
+  /**
+   * A button of its own instead of the red Remove (plan 8R-4: Change… of a line of `/wants`): its
+   * action, label and style, the custom id's arguments, and the command that does the same where
+   * its id would not fit.
+   */
+  button?: {
+    action: string;
+    label: string;
+    style: APIButtonComponentWithCustomId['style'];
+    args: string[];
+    command: string;
+  };
 }
 
 /** What a list shows, besides its entries. */
@@ -47,6 +59,11 @@ export interface ListView {
   page: number;
   /** Lines under the count that are about the whole list (entries this version cannot read). */
   notes?: readonly string[];
+  /**
+   * A note at the top, under the heading (plan 8R-4: what a Submit of a dialog opened from the
+   * list changed).
+   */
+  notice?: string;
   /** The small print at the end: `` `/want` adds one. `` */
   footer: string;
   /** What an empty list says, under its heading: `` You want nothing yet. `/want` adds one. `` */
@@ -104,6 +121,7 @@ export function renderMemberList(view: ListView): V2Message {
   const counted = count(items.length, view.noun[0], view.noun[1]);
   const head = [
     view.heading,
+    ...(view.notice === undefined ? [] : [view.notice]),
     pages > 1 ? `${counted} · page ${page + 1} of ${pages}` : counted,
     ...(view.notes ?? []),
   ].join('\n');
@@ -112,19 +130,23 @@ export function renderMemberList(view: ListView): V2Message {
   const room = Math.floor((TEXT_BUDGET - head.length - footer.length) / Math.max(1, shown.length));
   const parts: APIComponentInContainer[] = [textDisplay(head), separator()];
   for (const item of shown) {
+    const own = item.button;
     const removeId = encodeCustomIdIfFits({
       kind,
       id,
-      action: LIST_ACTIONS.remove,
-      args: item.removeArgs,
+      action: own?.action ?? LIST_ACTIONS.remove,
+      args: own?.args ?? item.removeArgs,
     });
     if (removeId === undefined) {
-      const hint = ` · \`${view.removeCommand}\` removes it`;
+      const hint = own
+        ? ` · \`${own.command}\` changes it`
+        : ` · \`${view.removeCommand}\` removes it`;
       parts.push(textDisplay(cutText(item.line(room - hint.length), room - hint.length) + hint));
     } else {
-      parts.push(
-        section(cutText(item.line(room), room), button(removeId, 'Remove', ButtonStyle.Danger)),
-      );
+      const control = own
+        ? button(removeId, own.label, own.style)
+        : button(removeId, 'Remove', ButtonStyle.Danger);
+      parts.push(section(cutText(item.line(room), room), control));
     }
   }
   if (shown.length > 0) parts.push(separator());
````

### Task 7: 8R-4 task 7: The Team GO Rocket dialog

Prototype commit: `8a7dd1e8667d5aab15ba6cdf7d7df005f5607556`

/want rocket, and any Rocket target picked or typed, opens one dialog:
Grunts, a dropdown of the twenty fixed grunts, Leaders, a checkbox group
of five, and Remove where a Rocket want is held, ticked as the rows are
plus the target picked; its id has a version and a per-open token and no
hash of the lineups. A Submit writes what is picked and takes every other
Rocket target off in one transaction under the member's lock; nothing
picked or Remove takes them all ("Nothing picked" where none was held),
and Any leader beside named ones is said to cover them. /unwant gains
Team GO Rocket, /wants one Rocket line with Change…, and a DM's Rocket
reason Change… of the dialog for its server.

**Files:**

```
 docs/architecture/discord-framework.md         |   2 +-
 docs/architecture/notifications-and-dms.md     |   4 +-
 docs/architecture/stop-reports.md              |   2 +-
 src/commands/notifications/want-boxes.ts       | 135 +++++++++++++++++++++-----
 src/commands/notifications/want-dialog.test.ts |  44 ++++++++-
 src/commands/notifications/want-dialog.ts      | 178 +++++++++++++++++++++++++++++++++++
 src/commands/notifications/wants.test.ts       | 217 ++++++++++++++++++++++++++++++++++++------
 src/commands/notifications/wants.ts            | 333 ++++++++++++++++++++++++++++++++++++++++++++++++-----------------
 src/components/dm.test.ts                      | 147 ++++++++++++++++++++++++++++-
 src/components/dm.ts                           |  29 +++++-
 src/db/repositories/target-want-repository.ts  |  26 ++---
 src/render/notify-dm.ts                        |  26 +++--
 src/services/notify-service.rocket.test.ts     |  13 ++-
 src/services/notify-service.ts                 |  10 +-
 test/support/target-want-cases.ts              |  16 +++-
 test/support/target-wants.ts                   |   8 +-
 16 files changed, 1012 insertions(+), 178 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/notifications/want-dialog.test.ts src/commands/notifications/wants.test.ts src/components/dm.test.ts src/services/notify-service.rocket.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 8a7dd1e8667d5aab15ba6cdf7d7df005f5607556 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4 task 7: The Team GO Rocket dialog`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index 849ad9f95287cf81bf5691f246bc51930e829e22..95355d3b4dc93fc69914df9652aed3ec86b4fb45 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -24,7 +24,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 - Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`. Its `throttle` may be a function of the interaction and the custom id (asked after the guards; undefined lets a control through uncounted): `/counters` counts a submitted dialog in the command's window and the button that opens it in a `MEMBER_READ_THROTTLE` window of its own. A limit with `as` (`ControlThrottle`) counts in the window of that command, as the router counts the command's uses (the dialog of `/counters` runs the command's work against Pokebattler: command and submits share its three a minute, "You can use /counters again in …"); without it a control counts in its kind's own window (`controlThrottleKey(kind)`, `component:<kind>`), as `/rank`'s and `/help`'s do. The bot gives the router its `Throttles` (`RouterOptions.throttles`) and shares them with the web server, whose presses of a party's buttons count in the window of the post's controls (plan 8M-3). What a control refuses belongs in a guard of its handler, which runs before the throttle, so that a refusal does not count (`requireDialogPlan` of `/counters`' dialog).
 - A dialog (a modal; `showModal`, the first answer: nothing is deferred before it) holds up to five labels, rows of a text input and text displays. Checked on the test server (2026-10-18, plan 8T-H): a dialog of one text display alone opens and submits (the split's one-group dialog), and a label may hold a radio group (`ComponentType.RadioGroup`, 2 to 10 choices of a label, value and description of 100 each), read with `fields.getRadioGroup(id, true)`; a required one cannot be submitted empty (Discord refuses Submit), so nothing is preselected where a pick must be deliberate. A label may also hold one tick box (`ComponentType.Checkbox`: a `custom_id` and `default` only, its words the label's and its description's; `fields.getCheckbox`, plan 8R-4: Costumes and Remove of `/want`'s dialog), not yet checked on Discord (8R-4's staging). Labels and descriptions of choices are assumed to show no markdown, as those of select menus do (not yet checked on Discord: 8T staging step 28 checks it): they carry the members' text as it is, not `plain()`.
-- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. They are Remove all of the wants and gym targets (`notifications-and-dms.md`), staff's `/delete` and Close…, Refuse place…, Block maker… of a report's post (`removalDialog`, `moderation.md`), deleting a gym and `/region remove` (`gyms-and-regions.md`), `/location` to another region (`parties-and-posts.md`), the split of a train (`trains.md`) and `/max`'s question about a battle that ends soon (plan 8X-3, `parties-and-posts.md`: no read from the database, the slow-read rule's clock checked before it opens; its Submit `max:<token>:report`, a pending-request token, carries on the use `/max` counted); the panels used again and again, the import previews and the like stay private replies. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text?, choice?, field? })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`, and may be left out of a dialog that is its choice alone; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Plan 8X-1B: a choice may name the value `picked` to start with (Discord's `default`; the fakes refuse two, as Discord would), which goes first in its list where the order allows: Android picks a radio group's first choice by itself whatever is marked (Matt's check, 2026-10-20), an iPhone only what is marked, so a choice that must not be made by accident is never first; `menu: true` makes it a string select of up to 25 for a longer list (Meet…, `getStringSelectValues`), whose default is marked only (it keeps its order). Discord's client keeps what was submitted in a dialog per custom id and shows that again in place of the value marked (the staging of 8X: Meet… showed the time submitted before, not the group's), so a dialog that marks a value to start with (Meet…, the which-group dialog, Group…) ends its custom id in a per-open token, `openToken(now)` (`~` and the moment it opened in base 36, about ten characters: count them in the 100), which its Submit leaves out with `withoutOpenToken(args)` (plan 8X-F; a dialog drawn before without it submits as before); `field` is one optional line of text (`TextInputStyle.Short`, `required: false`). A command whose throttle varies counts in `variedThrottleKey(name, limit)`; a control that counts in that window (`as`, Meet…'s dialog in `/meet`'s; "Same task at more stops…" in `/research report`'s, plan 8R-1, whose limit is of the settings: a control's `throttle` function gets `(interaction, id, ctx)`) is refused in the command's words, the name before the line break ("You can use /meet again in …"). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), a read that comes back past the budget by the clock is refused too (also before its timer ran, on a busy event loop), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
+- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. They are Remove all of the wants and gym targets (`notifications-and-dms.md`), staff's `/delete` and Close…, Refuse place…, Block maker… of a report's post (`removalDialog`, `moderation.md`), deleting a gym and `/region remove` (`gyms-and-regions.md`), `/location` to another region (`parties-and-posts.md`), the split of a train (`trains.md`) and `/max`'s question about a battle that ends soon (plan 8X-3, `parties-and-posts.md`: no read from the database, the slow-read rule's clock checked before it opens; its Submit `max:<token>:report`, a pending-request token, carries on the use `/max` counted); the panels used again and again, the import previews and the like stay private replies. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text?, choice?, field? })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`, and may be left out of a dialog that is its choice alone; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Plan 8X-1B: a choice may name the value `picked` to start with (Discord's `default`; the fakes refuse two, as Discord would), which goes first in its list where the order allows: Android picks a radio group's first choice by itself whatever is marked (Matt's check, 2026-10-20), an iPhone only what is marked, so a choice that must not be made by accident is never first; `menu: true` makes it a string select of up to 25 for a longer list (Meet…, `getStringSelectValues`), whose default is marked only (it keeps its order). Discord's client keeps what was submitted in a dialog per custom id and shows that again in place of the value marked (the staging of 8X: Meet… showed the time submitted before, not the group's), so a dialog that marks a value to start with (Meet…, the which-group dialog, Group…; since plan 8R-4 `/want`'s Pokémon, tier and Team GO Rocket dialogs, whose Submits refuse an id without it, as none was drawn without one) ends its custom id in a per-open token, `openToken(now)` (`~` and the moment it opened in base 36, about ten characters: count them in the 100), which its Submit leaves out with `withoutOpenToken(args)` (plan 8X-F; a dialog drawn before without it submits as before); `field` is one optional line of text (`TextInputStyle.Short`, `required: false`). A command whose throttle varies counts in `variedThrottleKey(name, limit)`; a control that counts in that window (`as`, Meet…'s dialog in `/meet`'s; "Same task at more stops…" in `/research report`'s, plan 8R-1, whose limit is of the settings: a control's `throttle` function gets `(interaction, id, ctx)`) is refused in the command's words, the name before the line break ("You can use /meet again in …"). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), a read that comes back past the budget by the clock is refused too (also before its timer ran, on a busy event loop), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
 - A press on the controls of an answer (plan 8B-2) is answered through `pressAnswer` / `deferPress` / `answerPress` (`src/discord/late-reply.ts`): on a public answer (`/rank`, `/counters` in a post) the member who asked (`message.interactionMetadata.user`, never the deprecated `interaction`) changes the answer for everybody (`update`), anybody else gets a private copy with the change; a press on a private answer always changes it; `onlyPrivate` (a Pokébox) gives even the asker a copy. Work that takes time acknowledges first as it will answer (`deferUpdate` or a private `deferReply`; a form submitted from no message has nothing to update and is deferred as a copy). A public answer in a party's post whose party has ended is never edited: the press answers privately.
 - A control that answers in the place of the message it is on, where that message may be from before it was v2, uses `showInPlace(press, message, oldLine?)` and `sayInPlace(press, text, accent)` (`src/discord/late-reply.ts`; `onV2Message`): on a v2 message an `update` (or an edit after `deferUpdate`) with its files replacing the old ones (`attachments: []`); on a classic one `sayInPlace` answers plain text, and `showInPlace` closes it with `oldLine` (`ANSWERED_BELOW` unless given) and sends the v2 message as a private follow-up, since whether Discord takes a v2 interaction update of a classic message is not known and is not tried; a form a command opened is answered privately. Controls backed by `PendingRequests` (the questions of `/gym` and `/region`) meet a message from before a restart as expired, so these classic paths are a safety net for them; in practice only stateless controls (the `/iam` menus) reach them. An answer in a private message of its own (a command, or a press acknowledged with `deferReply`: `answeredApart`, told by discord.js setting `ephemeral` for a reply or `deferReply` and not for `update` or `deferUpdate`) goes through `answerApart(interaction, message)`; `showInPlace` throws there, and `sayInPlace` answers apart. In tests the fake controls take `v2Message: true` for a press on a v2 message whose rows the test does not give (`gymCommandsWith` and `regionCommandsWith` press so by default; `v2Message: false` is a message from before), and refuse as Discord would: a v2 `update` (or edit after `deferUpdate`) of a classic message ("a classic-to-v2 update is not tried"), a v2 message made classic, and a file component, thumbnail or gallery picture naming a file the message does not carry (a reply and a follow-up carry only their own `files`; an edit that sends `files` without `attachments` keeps none of the old ones, as discord.js sends it). `V2Message.files` are `MessageFile`s: a local path, or text made with its name (`{ attachment: Buffer, name }`).
 
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index 5873fcf77e0dce56771548c6e11fc3174e297117..abc14b1168a96d6a82ee15ae10be24eac83b54dc 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -6,7 +6,7 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 
 - A want (`PokemonNotification`) is per member and server and is one of: a species (every form, megas included), one form (`form`, a catalogue key), the shadow raids of either (`shadow`; since plan 8R-2 shadow raids and Team GO Rocket catches, the Shadow box), a raid tier (raids only), perfect or zero IVs (spawns only); a mega is raids only. The columns are read and written only through the codec (`notification-target.ts`: `readNotification` gives the target and the scope in effect; a row it cannot read is skipped, counted and never deleted on its own) and the pure functions of `src/domain/pogo/wants.ts` (`readWants`, `planSetWant`, `rowsOfWant`: duplicate legacy rows are one want with the union of their scopes, two keys of one catalogue entry are one want, a row is rewritten only when its meaning changes). `ctx.wants` (`WantStorage`: `list`, `set`, `remove`, `removeAll`, `count`) is the repository; `MemoryWants` (`test/support/wants.ts`) is its twin and runs the same functions. `pokemonWantFits(catalogue, target, entry, shadowRaid)` says whether a want is for a boss or a spawn. Since plan 8R-1 a raid scope means raids only (no max battles), and the legacy `!wants` codec and the scope rules (`planSetWant`, `widerScope`) are unchanged.
 - **Costumed wants** (plan 8R-4, migration 030; design `2026-10-22-costume-form-wants-design.md`): `PokemonNotification.costumed` and `TargetWant.costumed` (tinyint, default 0) make a Pokémon's want costumed only, a property of the row like the scope, never part of its target, token, unique key or id (`Want.costumed?: true`, a Pokémon's `TargetWant.costumed?: true`; `boxTarget(kind, dex, form, costumed)`, `withCostume`, `isCostumedTarget`; a Stop or Remove takes the row whatever its costume). Rows of one target that disagree read as plain (`readWants`: plain wins, as the wider scope); `planSetWant(…, costumed)` rewrites a row whose costume differs; a `TargetWant` added again takes the costume of its add (an upsert per costume, `createdAt` kept). Every sighting carries `costumed` (`PokemonSighting`): a raid's boss as the list has it in the raid's tier (`ShownBoss.costumed`), a spawn as `SpawnNews.costumed` says, a research reward by `rewardCostumed` (its Leek Duck name and picture, worked out when read), a max boss and a Rocket catch never. `pokemonWantFits(…, costumed)` fits a costumed want only to a costumed sighting, under the entry the costume copies; a plain want fits either. The matchers (`raidWantsFiring`, `spawnWantsFiring`, `rocketShadowFiring`) give the wants themselves, so a reason carries `costumed` (`wantReason`) and the DM names it "Costumed Pikachu" (`wantTargetLabel(…, costumed)`, `pokemonWantName({ costumed })`: no "(every form)", "Costumed Corsola"), a target "Costumed Pikachu (research)" (`targetWantLabel`); members told of one event share a message only where their reasons read alike (`shownReasonKey`).
-- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy, written at once with no dialog (`rocketWantAnswer`: a grunt type at most one DM an hour for each type). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. **The Pokémon dialog of plan 8R-4** (design 3, the mockups of 2026-10-22; `wantDialog` / `WantDialogView` in `src/commands/notifications/want-dialog.ts`, `wantDialogFor` in `wants.ts`): the title by the species' name ("Corsola: what for?", `dialogName`), one text, then at most four fields, a dialog's five components being Discord's limit (every other sentence goes into the one text: the mega note "A mega is told for raids only.", "Your Ponyta wants differ by form; Submit sets them alike."; Charizard's is the largest, a test builds it): **Tell me about** (`boxes`, two boxes or more; their descriptions, `BOX_DESCRIPTIONS` with `{name}`, only without a Which field; Research no longer for a legendary, mythical or ultra beast unless today's task list rewards it or the member holds it, `shownBoxes` / `dialogBoxes`), **Which <species>** (`forms`, `whichEntries`: a species of 2 to `WHICH_CAP` 25 entries, megas included, by their catalogue names; a checkbox group to ten, a string select above; none for Unown, whose letters are dialogs of their own, `wantbox:p201:…:unown_a`), **Costumes** (`costumed`, one `ComponentType.Checkbox` under a Label `Only costumed <species>` / `Only costumed ones`, shown where the game data has a costume of any of its forms or the raid boss list or today's task list has it costumed now, `costumesShown`, or where a row held is costumed, A1: a Submit never drops a costume unseen; not shown, each row keeps its own) and **Remove** (`remove`, one Checkbox, `Remove <species> from my list`, where the member holds a want of it; it wins over everything). With one box and none of Which and Costumes it writes at once, a costumed row held staying costumed and the answer saying so in small print, "Only costumed ones are told: Change… in `/wants` can untick Only costumed." (F3; `asksAbout`, decided synchronously for the deferral, S1: Mew; what a use is about, `WantUse`, is read once per interaction, `useOf`, so the deferral and `execute` decide alike, A8); with one box and a Which field (Arceus) there is no Tell me about field and the text says what it is told for. A first want opens with no box ticked and every form ticked (a form picked from the list alone: `/want galarian corsola`, `/want mega charizard y`, `dialogSubject`), Costumed off, and its Tell me about and Which fields required (`required: true`, `min_values` 1: Discord lets no Submit through till a box and a form are ticked; Matt's R-M2, no "All" option), a tier's dialog alike; with wants, as stored (a box ticked where any row has it, Costumed only where every row but the megas is, `allCostumed`, the picked form added; the rows that differ leave a mega's out, A3), and the fields not required, so that nothing ticked still takes the want off (Q1). **In the post of a raid or a max battle** (Matt's R-M1; `postSubject` and `postBoxOf` in `wants.ts`, the party read from the post's id in memory by `partyOf`, so `opensDialog` stays synchronous and `showModal` the first answer): `/want` with nothing typed (the option is not required) is the boss (a form of a species with several picked in its species' dialog), an egg its tier; a boss the game data does not know is refused (Matt's Q1, F1: a raid's "Pine doesn't know this raid's boss yet: name a Pokémon, or `/want t5` for the tier.", the tier its own; a max battle's "Pine doesn't know this battle's boss yet: name a Pokémon."); the dialog ticks only the post's kind of battle for a first want (a raid's Raids, a shadow raid's Shadow, a tier's Raids or Shadow raids, a max battle's Dynamax or Gigantamax), also for a Pokémon typed there, and beside the rows held for a want held. Anywhere else nothing typed is a `UserError` (`NAME_A_POKEMON`: "Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it out for its boss."; an ended raid's post is out of the store, so as any other). These refusals and a name it cannot read come from the guard `readsUse` (it reads the use, `useOf`), so they do not count against the throttle (F2). The Submit (`answerOfSubmit`, `readWantSubmit`: a Which field read as its forms, every form ticked as the species row; a missing field or another Which hash is `STALE_COMPONENT`) writes through `WantBoxStorage.set`, and the answer names the want as `/wants` does (`rowsLabel`: "Costumed Pikachu", "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above three by count) with its boxes, in small print where Costumed meets a box no costumed Pokémon has appeared in (`NEVER_COSTUMED_YET`: Dynamax, Gigantamax, Shadow; a warning, never a refusal) and where a mega ticked without Raids is off. `/unwant` of a form whose species row covers it (`coveringSpecies`, review R4e) removes nothing and says so. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (since plan 8R-4 `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>][:<form>][:l<page>]:~<token>`, a tier `wantbox:t<level>:set2:…`; `src/commands/notifications/want-dialog.ts`, `wantDialogId` / `readWantDialogId`: `<mask>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `<flags>` whether it showed Costumes (1) and Remove (2), `<which>` `whichHash` of the keys its Which field showed, `0` for none (`NO_WHICH`), the server where it was opened from a DM, the form only beyond the Which field (an Unown letter), the page of `/wants`, last `openToken` of when it opened (plan 8X-F: Discord's client shows what was last submitted under an id in place of what the dialog ticks), which `readWantDialogId` leaves out; an id of before (`set`) or of any other shape, one without its token, and a Which hash that is not the field's now, are `STALE_COMPONENT`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock; nothing ticked takes the target off. **One answer per species** (plan 8R-4, design 3; `src/domain/pogo/species-answer.ts`): an answer (`BoxAnswer`: the forms that stand, `undefined` the subject's own row, of a species the species row; the boxes ticked of those shown; costumed; Remove) covers a scope (`AnswerScope`, `scopeOf`: a species is `wide`, every row of its Pokédex number in both tables, `PokemonNotification.pokemon = <dex>` and `TargetWant.target` `<kind>:<dex>` exactly or `<kind>:<dex>:%`, so 25 never reads 251; a species with more entries than the Which field holds, `WHICH_CAP` 25, Unown, is not: its species row and each letter are answers of their own; a tier is its own). `WantBoxStorage.held(member, server, scope)` gives the rows by form (`HeldRow`: its boxes, costumed when every row of it is; `heldRows`), `set(member, server, answer, at)` carries out `planAnswer`: Remove, no form or no box shown ticked takes every row of the scope away, the boxes the dialog did not show included (A2, Q1); every form ticked gets the boxes ticked of those shown and keeps the others as its row had them (a new row: as the scope's rows had them together), all with the answer's costume (`costumed` undefined where the dialog did not show Costumes: each row keeps its own, a new row costumed where every row held is, `allCostumed`, A1); a mega a raid row and nothing else, always plain, nothing without Raids (review R4c, A-D3; `FormReader`'s `mega`); every other row goes; in one transaction under the member's lock (`WantBoxRepository`, twin `MemoryWantBoxes`, both `wantBoxCases`). `removalAnswer(scope)` is `/unwant`'s and a list's Remove. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"; since plan 8R-4 one line per species, `wantEntries`: its forms named together up to three, "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above that by count, "Vivillon (4 of 21 forms)", `Costumed` before it where every row is, an Unown letter a line of its own; in the order Pokémon by species name, tiers in tier order as "Tier 5 raids" (Matt's R-M4: on the list alone, `WantEntry.listLabel`; `/unwant`'s choices and answers keep "T5 raids"), Team GO Rocket, then the lines without a dialog: items and Mega Energy by name as "Rare Candy: Research", "Perfect IVs: Spawns", "Zero IVs: Spawns"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
+- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy (a grunt type at most one DM an hour for each type; since plan 8R-4 every Rocket target, and `/want rocket`, opens **the Team GO Rocket dialog**, design 4b: `rocketDialog` in `want-dialog.ts`, "Team GO Rocket: what for?", Grunts a string select of the twenty fixed grunts, `rocketOptions` (18 types, "Grunts without a type", "Decoy grunt"), Leaders a checkbox group of Cliff, Arlo, Sierra, Any leader and Giovanni, Remove where any Rocket want is held; ticked as the member's Rocket rows are, plus the target picked; its Submit `wantbox:r:rset1:<flags>[:<server>][:l<page>]:~<token>` (the per-open token of plan 8X-F, left out by `readRocketDialogId`; one without it is `STALE_COMPONENT`), a version and no hash of the lineups, S12, `readRocketDialogId`; `writeRocket` writes what is picked and takes every other Rocket target off in one `TargetWantStorage.change` under the member's lock, nothing picked or Remove takes them all off (`change` gives how many of those to remove were there, so that a first want with nothing picked, decided under the lock, says "Nothing picked: no Team GO Rocket wants.", B8), and "Any leader" beside named leaders is said to cover them; `opensDialog` is true for every Rocket use, F13; `/unwant`'s "Team GO Rocket" (`rocket`, `TEAM_ROCKET`, also typed `team go rocket`) takes every Rocket row off while a single target typed stays one; `/wants` has one line "Team GO Rocket: Fire and Water grunts, Arlo, Giovanni", over three types "7 grunt types", `rocketLine`, with Change… `wantlist:<p>:change:rocket`; a DM's Rocket reason keeps its 8R-2 label with Change… `dm:<server>:change:rocket`, `rocketChangeButtonId`, which opens the dialog for that server). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. **The Pokémon dialog of plan 8R-4** (design 3, the mockups of 2026-10-22; `wantDialog` / `WantDialogView` in `src/commands/notifications/want-dialog.ts`, `wantDialogFor` in `wants.ts`): the title by the species' name ("Corsola: what for?", `dialogName`), one text, then at most four fields, a dialog's five components being Discord's limit (every other sentence goes into the one text: the mega note "A mega is told for raids only.", "Your Ponyta wants differ by form; Submit sets them alike."; Charizard's is the largest, a test builds it): **Tell me about** (`boxes`, two boxes or more; their descriptions, `BOX_DESCRIPTIONS` with `{name}`, only without a Which field; Research no longer for a legendary, mythical or ultra beast unless today's task list rewards it or the member holds it, `shownBoxes` / `dialogBoxes`), **Which <species>** (`forms`, `whichEntries`: a species of 2 to `WHICH_CAP` 25 entries, megas included, by their catalogue names; a checkbox group to ten, a string select above; none for Unown, whose letters are dialogs of their own, `wantbox:p201:…:unown_a`), **Costumes** (`costumed`, one `ComponentType.Checkbox` under a Label `Only costumed <species>` / `Only costumed ones`, shown where the game data has a costume of any of its forms or the raid boss list or today's task list has it costumed now, `costumesShown`, or where a row held is costumed, A1: a Submit never drops a costume unseen; not shown, each row keeps its own) and **Remove** (`remove`, one Checkbox, `Remove <species> from my list`, where the member holds a want of it; it wins over everything). With one box and none of Which and Costumes it writes at once, a costumed row held staying costumed and the answer saying so in small print, "Only costumed ones are told: Change… in `/wants` can untick Only costumed." (F3; `asksAbout`, decided synchronously for the deferral, S1: Mew; what a use is about, `WantUse`, is read once per interaction, `useOf`, so the deferral and `execute` decide alike, A8); with one box and a Which field (Arceus) there is no Tell me about field and the text says what it is told for. A first want opens with no box ticked and every form ticked (a form picked from the list alone: `/want galarian corsola`, `/want mega charizard y`, `dialogSubject`), Costumed off, and its Tell me about and Which fields required (`required: true`, `min_values` 1: Discord lets no Submit through till a box and a form are ticked; Matt's R-M2, no "All" option), a tier's dialog alike; with wants, as stored (a box ticked where any row has it, Costumed only where every row but the megas is, `allCostumed`, the picked form added; the rows that differ leave a mega's out, A3), and the fields not required, so that nothing ticked still takes the want off (Q1). **In the post of a raid or a max battle** (Matt's R-M1; `postSubject` and `postBoxOf` in `wants.ts`, the party read from the post's id in memory by `partyOf`, so `opensDialog` stays synchronous and `showModal` the first answer): `/want` with nothing typed (the option is not required) is the boss (a form of a species with several picked in its species' dialog), an egg its tier; a boss the game data does not know is refused (Matt's Q1, F1: a raid's "Pine doesn't know this raid's boss yet: name a Pokémon, or `/want t5` for the tier.", the tier its own; a max battle's "Pine doesn't know this battle's boss yet: name a Pokémon."); the dialog ticks only the post's kind of battle for a first want (a raid's Raids, a shadow raid's Shadow, a tier's Raids or Shadow raids, a max battle's Dynamax or Gigantamax), also for a Pokémon typed there, and beside the rows held for a want held. Anywhere else nothing typed is a `UserError` (`NAME_A_POKEMON`: "Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it out for its boss."; an ended raid's post is out of the store, so as any other). These refusals and a name it cannot read come from the guard `readsUse` (it reads the use, `useOf`), so they do not count against the throttle (F2). The Submit (`answerOfSubmit`, `readWantSubmit`: a Which field read as its forms, every form ticked as the species row; a missing field or another Which hash is `STALE_COMPONENT`) writes through `WantBoxStorage.set`, and the answer names the want as `/wants` does (`rowsLabel`: "Costumed Pikachu", "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above three by count) with its boxes, in small print where Costumed meets a box no costumed Pokémon has appeared in (`NEVER_COSTUMED_YET`: Dynamax, Gigantamax, Shadow; a warning, never a refusal) and where a mega ticked without Raids is off. `/unwant` of a form whose species row covers it (`coveringSpecies`, review R4e) removes nothing and says so. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (since plan 8R-4 `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>][:<form>][:l<page>]:~<token>`, a tier `wantbox:t<level>:set2:…`; `src/commands/notifications/want-dialog.ts`, `wantDialogId` / `readWantDialogId`: `<mask>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `<flags>` whether it showed Costumes (1) and Remove (2), `<which>` `whichHash` of the keys its Which field showed, `0` for none (`NO_WHICH`), the server where it was opened from a DM, the form only beyond the Which field (an Unown letter), the page of `/wants`, last `openToken` of when it opened (plan 8X-F: Discord's client shows what was last submitted under an id in place of what the dialog ticks), which `readWantDialogId` leaves out; an id of before (`set`) or of any other shape, one without its token, and a Which hash that is not the field's now, are `STALE_COMPONENT`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock; nothing ticked takes the target off. **One answer per species** (plan 8R-4, design 3; `src/domain/pogo/species-answer.ts`): an answer (`BoxAnswer`: the forms that stand, `undefined` the subject's own row, of a species the species row; the boxes ticked of those shown; costumed; Remove) covers a scope (`AnswerScope`, `scopeOf`: a species is `wide`, every row of its Pokédex number in both tables, `PokemonNotification.pokemon = <dex>` and `TargetWant.target` `<kind>:<dex>` exactly or `<kind>:<dex>:%`, so 25 never reads 251; a species with more entries than the Which field holds, `WHICH_CAP` 25, Unown, is not: its species row and each letter are answers of their own; a tier is its own). `WantBoxStorage.held(member, server, scope)` gives the rows by form (`HeldRow`: its boxes, costumed when every row of it is; `heldRows`), `set(member, server, answer, at)` carries out `planAnswer`: Remove, no form or no box shown ticked takes every row of the scope away, the boxes the dialog did not show included (A2, Q1); every form ticked gets the boxes ticked of those shown and keeps the others as its row had them (a new row: as the scope's rows had them together), all with the answer's costume (`costumed` undefined where the dialog did not show Costumes: each row keeps its own, a new row costumed where every row held is, `allCostumed`, A1); a mega a raid row and nothing else, always plain, nothing without Raids (review R4c, A-D3; `FormReader`'s `mega`); every other row goes; in one transaction under the member's lock (`WantBoxRepository`, twin `MemoryWantBoxes`, both `wantBoxCases`). `removalAnswer(scope)` is `/unwant`'s and a list's Remove. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"; since plan 8R-4 one line per species, `wantEntries`: its forms named together up to three, "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above that by count, "Vivillon (4 of 21 forms)", `Costumed` before it where every row is, an Unown letter a line of its own; in the order Pokémon by species name, tiers in tier order as "Tier 5 raids" (Matt's R-M4: on the list alone, `WantEntry.listLabel`; `/unwant`'s choices and answers keep "T5 raids"), Team GO Rocket, then the lines without a dialog: items and Mega Energy by name as "Rare Candy: Research", "Perfect IVs: Spawns", "Zero IVs: Spawns"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
 - What a member picked in the `target` option of `/want` or `/unwant` is a want token (`wantToken` / `parseWantToken`: `pokemon:<dex>[:<form>][:shadow]`, `tier:<level>[:shadow]`, `iv:perfect|zero`): the value of an autocomplete choice, never part of a custom id. Text sent without picking never guesses (`readWantText`): it acts only when it is a tier or IV word in full (`wantWord`), exactly a species' name (every form) or exactly one form's own name, with `shadow` before either; anything else is refused with suggestions. A bare number is a tier or IV word, never a Pokédex number.
 - Wants are named in one way everywhere (`wantLabel` / `wantName` in `src/commands/notifications/want-input.ts`): "X (every form)" for a species with several entries, "X (base form)" for its plain entry, "Shadow X", and the scope after " · " in the choices of `/unwant`.
 - Gym targets (`GymNotification`; `gym` holds a gym id as text) are `ctx.gymTargets` (`GymTargetStorage`), with `MemoryGymTargets` as the twin. In code "target" alone is what a want is for; a gym a member wants raids of is a gym target.
@@ -20,7 +20,7 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 ## Sending direct messages
 
 - Direct messages go out only through `DmSender` (`src/services/dm-sender.ts`; the app's is `QueuedDmSender`): `send(job)` puts a message in line and returns, never waits for Discord and never throws. A timer starts at most one send every 100 ms, five on their way at most; priorities are `DM_PRIORITY.urgent` (meeting times, boss-set), `spawn` (spawns, Rocket grunts), `normal` (raid wants, gym targets, new trains, max battles, field research, Rocket hideouts), the oldest event first within one; a job carries `eventAt` and `expiresAt` and is dropped once that has passed. There is no retry (discord.js waits out a 429), a pause of a minute when Discord refuses to open DM channels, an hour's memory of members who take no DMs, and a log line with the numbers of every burst. Never loop over recipients and send: the legacy bot lost its gateway connection that way. Tests use `RecordingDms` or `QueuedDmSender` over `FakeDmGateway` (`test/support/dms.ts`, `pullUntilIdle`). In rehearsal mode the members' sender is `RehearsalDms` over the queue: only the allowlist is written to (`operations.md`).
-- A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), then "You asked to be told about" and one section per reason with a `Stop` button beside it, as many as the message has room for beside its links and picture (`stopButtonRoom`; the rest are named in `stopHint`). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a `TargetWant` is `target` with `rp`, `ri`, `re`, `dx`, `gx` (plan 8R-2: `rg:<type|none>`, `rl:<leader|any>`, `rv`, `rd`) and a subject's every box `subject` with `sp` / `st`, plan 8R-1; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag). **Change…** (plan 8R-4, design 4, R15–R20): a reason of a Pokémon (`p`, `ps`, `rp`, `dx`, `gx`) or a tier (`t`, `ts`) has Change… instead of Stop (`changeOf` in `notify-service.ts`, `ShownReason.change`), `dm:<server>:change:sp:<dex>` (a form's species, an Unown letter its own, `changeSubject`) or `…:st:<level>` (`changeButtonId`); the reason's label names the want and the box it fired by ("Costumed Pikachu · Research"; a raid's plain want `Raids`, a spawn's `Spawns`, a shadow want `Shadow`), and reasons of one species or tier are one section with one Change… (`grouped`, named by the species where their names differ; counted once in `stopButtonRoom`, F5; like Stop, after all text, plan 8X-F). IV wants, items, Mega Energy, gym targets, the settings and (until plan 8R-4's Rocket dialog) Team GO Rocket keep Stop; a `stop` id of a species or tier (`subject`, of DMs before 8R-4, which were only ever sent on the test server, Matt) is `STALE_COMPONENT`. The press (`openChange`) answers before anything else: wants switched off (`notificationsEnabled`), a member no longer in the server (`ctx.members.find`) or nothing held of it ("**Pikachu** is not on your list; `/want` adds it.", S2: Change… never writes) are refused as `UserError`s, answered privately (`readForChange`, the one check of every Change…, B9); else it reads the rows in time (`readInTime`) and opens `/want`'s dialog for that server (`wantDialogFor` with `server`: "Your Pikachu want in <server>. Change what you want a DM about, or tick Remove to stop them all.", the server's name by `serverNameOf` through `plain`, F14; Remove at least, Mew's is Remove alone), its id carrying the server's snowflake. The Submit's guard takes a server or a snowflake in the id (`requireWantServer`); from a DM (`submitFromDm`) it is acknowledged with `deferUpdate`, asks again whether wants are on and the member is in that server (`changeRefusal`, B2: refused below with `followUp`, nothing written), writes for that server and the presser alone, shows that message's Change… of the subject as a disabled `Changed` (`Removed` where it took the want off; `withChanged`) under the messages' lock (`dmMessages`, `src/components/dm-messages.ts`, shared with Stop; the message read anew first), and answers below with `followUp`, also when the button could not be changed.
+- A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), then "You asked to be told about" and one section per reason with a `Stop` button beside it, as many as the message has room for beside its links and picture (`stopButtonRoom`; the rest are named in `stopHint`). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a `TargetWant` is `target` with `rp`, `ri`, `re`, `dx`, `gx` (plan 8R-2: `rg:<type|none>`, `rl:<leader|any>`, `rv`, `rd`) and a subject's every box `subject` with `sp` / `st`, plan 8R-1; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag). **Change…** (plan 8R-4, design 4, R15–R20): a reason of a Pokémon (`p`, `ps`, `rp`, `dx`, `gx`) or a tier (`t`, `ts`) has Change… instead of Stop (`changeOf` in `notify-service.ts`, `ShownReason.change`), `dm:<server>:change:sp:<dex>` (a form's species, an Unown letter its own, `changeSubject`) or `…:st:<level>` (`changeButtonId`); the reason's label names the want and the box it fired by ("Costumed Pikachu · Research"; a raid's plain want `Raids`, a spawn's `Spawns`, a shadow want `Shadow`), and reasons of one species or tier are one section with one Change… (`grouped`, named by the species where their names differ; counted once in `stopButtonRoom`, F5; like Stop, after all text, plan 8X-F). IV wants, items, Mega Energy, gym targets and the settings keep Stop (Team GO Rocket's reasons have Change… of its dialog); a `stop` id of a species or tier (`subject`, of DMs before 8R-4, which were only ever sent on the test server, Matt) is `STALE_COMPONENT`. The press (`openChange`) answers before anything else: wants switched off (`notificationsEnabled`), a member no longer in the server (`ctx.members.find`) or nothing held of it ("**Pikachu** is not on your list; `/want` adds it.", S2: Change… never writes) are refused as `UserError`s, answered privately (`readForChange`, the one check of every Change…, B9); else it reads the rows in time (`readInTime`) and opens `/want`'s dialog for that server (`wantDialogFor` with `server`: "Your Pikachu want in <server>. Change what you want a DM about, or tick Remove to stop them all.", the server's name by `serverNameOf` through `plain`, F14; Remove at least, Mew's is Remove alone), its id carrying the server's snowflake. The Submit's guard takes a server or a snowflake in the id (`requireWantServer`); from a DM (`submitFromDm`) it is acknowledged with `deferUpdate`, asks again whether wants are on and the member is in that server (`changeRefusal`, B2: refused below with `followUp`, nothing written), writes for that server and the presser alone, shows that message's Change… of the subject as a disabled `Changed` (`Removed` where it took the want off; `withChanged`) under the messages' lock (`dmMessages`, `src/components/dm-messages.ts`, shared with Stop; the message read anew first), and answers below with `followUp`, also when the button could not be changed.
 - The owner's DM of a request for the Wayspot export tool (plan 8W-P; `web.md`, "The Wayspot export tool"): a new request, or one asked again after a refusal, queues a DM to `OWNER_ID` through `DmSender` (`normal`, expiring after 7 days; the queue is in memory, so a restart loses it and the page is the fallback), only while at most `OPEN_REQUESTS_NOTIFIED` 20 requests are open (any Discord account can ask; the rest wait on the page). It is `accessRequestDm` (`src/render/script-access-dm.ts`): who asks by name (`plainNoLinks`) and id as plain text, no mention, the community line through `plainNoLinks`, when, and **Approve** / **Refuse**, custom ids `scriptaccess:<row id>:approve|refuse:<askedAt in base 36>`. The handler (`scriptAccessControls`, `src/components/script-access.ts`) has a guard that the presser is `OWNER_ID` (a guard refusal counts against no throttle) and `SCRIPT_ACCESS_THROTTLE` 20 a minute; a press decides the request as it is now and for the asking it was drawn for, and edits the DM to what was decided and when without its buttons (`accessDecidedDm`): decided meanwhile, "Decided already: …"; asked again since, "Asked again since, <time>: decide it on its new DM or on the page."; a row gone or a button it cannot read is out of date. No fresh web login is needed for the DM.
 
 ## Spawn reports
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index 33fa5751fd6cae3885e82364750ecfd01ea052c0..89fb4f149d7d837985eb0464d1e7c0be3e407007 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -52,4 +52,4 @@ What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/202
 
 - `/want`'s dialog, `TargetWant` and the matching are in `notifications-and-dms.md` ("Wants and gym targets", "The notifier"). "Grunt (no type)" is typed as `no type`, `no type grunt` or `grunt (no type)`; `none` typed in full is zero IVs, the legacy word (fix F4), and the list of choices offers both for it.
 - A report that is news (`StopReportService`'s `reported`) goes to `NotifyService.researchReported`: who wants a reward of its task (`researchTargets` / `researchWantsFiring`, `src/domain/notify/reasons.ts`: a Pokémon's Research box, the species fitting any form, an item whatever the quantity, a species' Mega Energy) is told at the normal priority, one DM per report and region channel naming that region's stops with their addresses (`researchDmSentence`, `researchDmBrief`: "Field research has been reported in #region by **Name**: **task**.", the rewards, the stops, until when as `periodEndWords` says it; all through `plainNoLinks`), only members who can view the channel, never the reporter, only under `features.notifications`, expiring with the report, with "Go to post" to the message of the pinned post holding the task (`researchPosts`; none in rehearsal mode). A member told of a task at a stop in a period is not told again (`researchTold`, in memory: a restart can repeat one), so a later "Same task at more stops…" names only the new stops. The usual Stop buttons (`target` reasons, `stopArgs` `rp`/`ri`/`re`).
-- A Rocket report that is news goes to `NotifyService.rocketReported` (plan 8R-2, design 7): one DM per region channel holding the stop; a want of its grunt type, its leader or any leader, Giovanni or the decoy (`rocketTargets` / `rocketWantsFiring`, `TargetWant` tokens as `rocketKey` plus `leader:any`) and a Shadow want of a Pokémon it can give (`rocketShadowFiring`, the `PokemonNotification` shadow row of the species or the very form: the Shadow box means shadow raids and Rocket catches). A grunt goes at the spawn priority, at most one DM an hour per member and grunt type (`rocketHeard`, in memory, `MAX_WANT_QUIET_MS`; a grunt's announcement runs in its type's line, `rocket:<server>:<rocketKey>`, so reports of one type made at once keep the hour, fix B1; the small print says so, `gruntHourNote`: "You won't be told about this grunt type again for an hour."; without `TargetWant` the Shadow wants still fire, fix B8), with "Go to report" to its message in that channel; a hideout at the normal priority, never twice to a member for the same hideout at the same stop in a day (`rocketTold`, in memory), with "Go to post" to the message of the pinned post holding it (`researchPosts.messageOf(channel, rocketKey)`); no link in rehearsal mode. `rocketDmSentence` ("A **Water-type grunt** has been reported in #west by **Rita**.", "an" by the name's first letter, a leader by name), `rocketDmBrief` (what can be caught, the stop with its address line, when it goes or until when it stands).
+- A Rocket report that is news goes to `NotifyService.rocketReported` (plan 8R-2, design 7): one DM per region channel holding the stop; a want of its grunt type, its leader or any leader, Giovanni or the decoy (`rocketTargets` / `rocketWantsFiring`, `TargetWant` tokens as `rocketKey` plus `leader:any`) and a Shadow want of a Pokémon it can give (`rocketShadowFiring`, the `PokemonNotification` shadow row of the species or the very form: the Shadow box means shadow raids and Rocket catches). A grunt goes at the spawn priority, at most one DM an hour per member and grunt type (`rocketHeard`, in memory, `MAX_WANT_QUIET_MS`; a grunt's announcement runs in its type's line, `rocket:<server>:<rocketKey>`, so reports of one type made at once keep the hour, fix B1; the small print says so, `gruntHourNote`: "You won't be told about this grunt type again for an hour."; without `TargetWant` the Shadow wants still fire, fix B8), with "Go to report" to its message in that channel; a hideout at the normal priority, never twice to a member for the same hideout at the same stop in a day (`rocketTold`, in memory), with "Go to post" to the message of the pinned post holding it (`researchPosts.messageOf(channel, rocketKey)`); no link in rehearsal mode. `rocketDmSentence` ("A **Water-type grunt** has been reported in #west by **Rita**.", "an" by the name's first letter, a leader by name), `rocketDmBrief` (what can be caught, the stop with its address line, when it goes or until when it stands). Since plan 8R-4 the Rocket wants are made in one dialog (`/want rocket`, `notifications-and-dms.md`), and a Rocket reason's button is Change… of that dialog.
diff --git a/src/commands/notifications/want-boxes.ts b/src/commands/notifications/want-boxes.ts
index a41c986805f56fcc371836796231442ef0e7c6c8..85e9d526094168d271427d34cf676ac3a811ec62 100644
--- a/src/commands/notifications/want-boxes.ts
+++ b/src/commands/notifications/want-boxes.ts
@@ -70,7 +70,8 @@ export type Wanted =
   | { kind: 'subject'; subject: BoxSubject; target: NotificationTarget }
   | { kind: 'iv'; target: NotificationTarget }
   | { kind: 'reward'; want: TargetWant }
-  | { kind: 'rocket'; want: TargetWant };
+  /** A Rocket target, or (none) Team GO Rocket itself, `/want rocket`: its dialog (plan 8R-4). */
+  | { kind: 'rocket'; want?: TargetWant };
 
 /**
  * Every target of Team GO Rocket (plan 8R-2; design 7), in the order a list shows them: the grunt
@@ -127,12 +128,33 @@ function meansRocket(label: string, own: readonly string[], words: readonly stri
   );
 }
 
+/** The value of the choice of Team GO Rocket itself, and the names it is typed by. */
+export const TEAM_ROCKET = 'rocket';
+const TEAM_ROCKET_NAMES: readonly string[] = [
+  'rocket',
+  'team rocket',
+  'team go rocket',
+  'team go rocket every grunt leader and giovanni',
+].map(searchText);
+const TEAM_ROCKET_LABEL = 'Team GO Rocket (every grunt, leader and Giovanni)';
+
 /**
  * The Rocket targets as choices of `/want` (design 9.9): those a typed text means
- * (`meansRocket`), their value the `TargetWant` token. None while nothing is typed.
+ * (`meansRocket`), their value the `TargetWant` token; first Team GO Rocket itself (plan 8R-4:
+ * its dialog) for a text that begins its name by three letters or more. None while nothing is
+ * typed.
  */
 export function rocketWantChoices(typed: string): Choice[] {
   const words = searchTokens(typed);
+  const team =
+    words.join('').length >= 3 && begins('team go rocket', words)
+      ? [{ name: TEAM_ROCKET_LABEL, value: TEAM_ROCKET }]
+      : [];
+  return [...team, ...rocketTargetChoices(words)];
+}
+
+/** The Rocket targets a text's words mean, as choices. */
+function rocketTargetChoices(words: readonly string[]): Choice[] {
   return rocketTargets()
     .map((want) => ({ want, label: rocketTargetLabel(targetWantToken(want)) }))
     .filter(({ want, label }) => meansRocket(label, ownWords(targetWantToken(want)), words))
@@ -142,6 +164,64 @@ export function rocketWantChoices(typed: string): Choice[] {
     }));
 }
 
+/**
+ * The options of the Rocket dialog (plan 8R-4, S12; mockup 8), fixed whatever today's rotation:
+ * the grunts (the 18 types by name, the untyped, the decoy) and the leaders (Cliff, Arlo, Sierra,
+ * any leader, Giovanni), each with its target's `who`.
+ */
+export function rocketOptions(): {
+  grunts: { who: string; label: string; description?: string }[];
+  leaders: { who: string; label: string; description?: string }[];
+} {
+  const type = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);
+  return {
+    grunts: [
+      ...[...POKEMON_TYPES].sort().map((name) => ({
+        who: `grunt:${name}`,
+        label: `${type(name)}-type grunts`,
+      })),
+      { who: 'grunt:none', label: 'Grunts without a type' },
+      { who: 'decoy', label: 'Decoy grunt' },
+    ],
+    leaders: [
+      ...LEADERS.map((name) => ({ who: `leader:${name}`, label: type(name) })),
+      { who: ANY_LEADER, label: 'Any leader', description: 'Every leader, also future ones' },
+      { who: 'giovanni', label: 'Giovanni' },
+    ],
+  };
+}
+
+/** Every Rocket target's `who`, in the dialog's order. */
+export function rocketWhos(): string[] {
+  const { grunts, leaders } = rocketOptions();
+  return [...grunts, ...leaders].map((one) => one.who);
+}
+
+/**
+ * The Rocket wants as one line of `/wants` and the answer (design 4b): the grunt types together
+ * ("Fire and Water grunts", over three "7 grunt types"), then the untyped grunts, the decoy, the
+ * leaders by name, any leader, Giovanni.
+ */
+export function rocketLine(whos: ReadonlySet<string>): string {
+  const types = [...POKEMON_TYPES]
+    .sort()
+    .filter((name) => whos.has(`grunt:${name}`))
+    .map((name) => name.charAt(0).toUpperCase() + name.slice(1));
+  const parts: string[] = [];
+  if (types.length > 3) parts.push(`${String(types.length)} grunt types`);
+  else if (types.length > 0) {
+    const named =
+      types.length === 1 ? types[0] : `${types.slice(0, -1).join(', ')} and ${types.at(-1) ?? ''}`;
+    parts.push(`${named ?? ''} grunts`);
+  }
+  const { grunts, leaders } = rocketOptions();
+  for (const one of [...grunts, ...leaders]) {
+    if (one.who.startsWith('grunt:') && one.who !== 'grunt:none') continue;
+    if (whos.has(one.who)) parts.push(one.label);
+  }
+  return parts.join(', ');
+}
+
 /** What a subject is called: `Dratini`, `Giratina (every form)`, `Mega Charizard Y`, `T5`. */
 export function subjectLabel(ctx: AppContext, subject: BoxSubject): string {
   if (subject.kind === 'tier') {
@@ -387,6 +467,8 @@ export function readWanted(ctx: AppContext, value: string, own = false): Wanted
   }
   if (token?.kind === 'rocket') return { kind: 'rocket', want: token };
   const searched = searchText(value);
+  // Team GO Rocket itself (plan 8R-4): its dialog, or all of it for `/unwant`.
+  if (TEAM_ROCKET_NAMES.includes(searched)) return { kind: 'rocket' };
   for (const want of rocketTargets()) {
     if (want.kind === 'rocket' && rocketNames(want).includes(searched)) {
       return { kind: 'rocket', want };
@@ -422,11 +504,15 @@ export interface WantEntry {
   remove:
     | { kind: 'subject'; subject: BoxSubject }
     | { kind: 'want'; target: NotificationTarget }
-    | { kind: 'target'; want: TargetWant };
+    | { kind: 'target'; want: TargetWant }
+    /** Every Team GO Rocket want (plan 8R-4). */
+    | { kind: 'rocket' };
   /** The token a choice of `/unwant` gives for it. */
   token: string;
-  /** Change… of the line: the dialog of a species, of an Unown letter, of a tier. */
-  change?: BoxSubject;
+  /** Change… of the line: the dialog of a species, of an Unown letter, of a tier, of Rocket. */
+  change?: BoxSubject | 'rocket';
+  /** What follows the label instead of boxes (Team GO Rocket's line: who is wanted). */
+  detail?: string;
 }
 
 /**
@@ -531,31 +617,32 @@ export function wantEntries(
       return rows.length > 0 ? [subjectEntry(ctx, subject, rows)] : [];
     });
   // Shadow tiers without their ordinary tier: the tier's line holds them too.
+  const levelOf = (entry: WantEntry): string =>
+    typeof entry.change === 'object' && entry.change.kind === 'tier' ? entry.change.level : '';
   for (const level of tierLevels) {
-    if (tiers.some((entry) => entry.change?.kind === 'tier' && entry.change.level === level)) {
-      continue;
-    }
+    if (tiers.some((entry) => levelOf(entry) === level)) continue;
     if (!isRaidLevel(level)) continue;
     const subject: BoxSubject = { kind: 'tier', level };
     const rows = heldRows({ subject, wide: false }, wants.wants, targets.wants);
     if (rows.length > 0) tiers.push(subjectEntry(ctx, subject, rows));
   }
-  const tierOrder = notificationTiers().map((tier) => tier.level);
-  tiers.sort(
-    (a, b) =>
-      tierOrder.indexOf(a.change?.kind === 'tier' ? a.change.level : 'T1') -
-      tierOrder.indexOf(b.change?.kind === 'tier' ? b.change.level : 'T1'),
-  );
-  // In the order of `rocketTargets` (plan 8R-2): grunts, the decoy, the leaders, Giovanni.
-  const order = rocketTargets().map(targetWantToken);
-  const rocketEntries = rocket
-    .map((want): WantEntry => ({
-      label: targetWantLabel(catalogue, want),
-      boxes: [],
-      remove: { kind: 'target', want },
-      token: targetWantToken(want),
-    }))
-    .sort((a, b) => order.indexOf(a.token) - order.indexOf(b.token));
+  const tierOrder: string[] = notificationTiers().map((tier) => tier.level);
+  tiers.sort((a, b) => tierOrder.indexOf(levelOf(a)) - tierOrder.indexOf(levelOf(b)));
+  // Team GO Rocket in one line with Change… (plan 8R-4, design 4b).
+  const whos = new Set(rocket.flatMap((want) => (want.kind === 'rocket' ? [want.who] : [])));
+  const rocketEntries: WantEntry[] =
+    whos.size === 0
+      ? []
+      : [
+          {
+            label: 'Team GO Rocket',
+            detail: rocketLine(whos),
+            boxes: [],
+            remove: { kind: 'rocket' },
+            token: TEAM_ROCKET,
+            change: 'rocket',
+          },
+        ];
   const rewardEntries = rewards
     .map((want): WantEntry => ({
       label: rewardLabel(ctx, want).replace(/ \(research\)$/, ''),
diff --git a/src/commands/notifications/want-dialog.test.ts b/src/commands/notifications/want-dialog.test.ts
index 8f1b1816f44110a9f18adabbad32ded87e004517..6f5f005002112abbd12acb61a42a121033342881 100644
--- a/src/commands/notifications/want-dialog.test.ts
+++ b/src/commands/notifications/want-dialog.test.ts
@@ -1,6 +1,13 @@
 import { describe, expect, it } from 'vitest';
 import { decodeCustomId } from '../../discord/custom-id.js';
-import { readWantDialogId, wantDialogId, type WantDialogId } from './want-dialog.js';
+import {
+  readRocketDialogId,
+  readWantDialogId,
+  rocketDialogId,
+  wantDialogId,
+  type RocketDialogId,
+  type WantDialogId,
+} from './want-dialog.js';
 
 const SERVER = '100000000000000011';
 /** When a dialog opened, and its per-open token (`openToken`, plan 8X-F). */
@@ -98,3 +105,38 @@ describe('the custom id of /want’s dialog (plan 8R-4, F6)', () => {
     }
   });
 });
+
+describe('the custom id of the Team GO Rocket dialog (plan 8R-4, S12)', () => {
+  const readRocket = (customId: string): RocketDialogId | undefined => {
+    const id = decodeCustomId(customId);
+    return id && readRocketDialogId(id);
+  };
+
+  it('carries Remove shown, the server and the page, then a token of when it opened', () => {
+    const dm: RocketDialogId = { remove: true, server: SERVER };
+    expect(rocketDialogId(dm, OPENED)).toBe(`wantbox:r:rset1:2:${SERVER}:${TOKEN}`);
+    expect(rocketDialogId({ remove: false, page: 3 }, OPENED)).toBe(
+      `wantbox:r:rset1:0:l3:${TOKEN}`,
+    );
+    for (const one of [dm, { remove: false }, { remove: true, page: 0 }]) {
+      expect(readRocket(rocketDialogId(one, OPENED))).toEqual(one);
+    }
+    // Plan 8X-F, "For 8R-4": every opening has an id of its own.
+    expect(rocketDialogId(dm, OPENED + 1)).not.toBe(rocketDialogId(dm, OPENED));
+    const longest = { remove: true, server: '18446744073709551615', page: 999 };
+    expect(rocketDialogId(longest, Date.UTC(2999, 11, 31)).length).toBeLessThanOrEqual(100);
+  });
+
+  it('reads an id without its token, or of another shape, as none', () => {
+    for (const customId of [
+      'wantbox:r:rset1:2',
+      `wantbox:r:rset1:2:${SERVER}`,
+      `wantbox:r:rset2:2:${TOKEN}`,
+      `wantbox:r:rset1:1:${TOKEN}`,
+      `wantbox:r:rset1:2:l1:${SERVER}:${TOKEN}`,
+      `wantbox:r:rset1:2:${TOKEN}:l1`,
+    ]) {
+      expect(readRocket(customId), customId).toBeUndefined();
+    }
+  });
+});
diff --git a/src/commands/notifications/want-dialog.ts b/src/commands/notifications/want-dialog.ts
index ac7a1b61bc43454d1a21cc4c61bf13476265b34a..76ad407608700f3d8f1f0c9ffc5741ec71b43498 100644
--- a/src/commands/notifications/want-dialog.ts
+++ b/src/commands/notifications/want-dialog.ts
@@ -386,3 +386,181 @@ export function readWantSubmit(
     return undefined;
   }
 }
+
+/*
+ * The Team GO Rocket dialog (plan 8R-4, design 4b, S12): one dialog for every Rocket want, its
+ * options fixed (all 18 grunt types, the untyped grunts, the decoy, the leaders, any leader,
+ * Giovanni) whatever today's rotation, so its id has a version and no hash of the lineups.
+ */
+
+/**
+ * The id of the Rocket dialog's Submit (`wantbox:r:rset1:<flags>[:<server>][:l<page>]:~<token>`,
+ * the token `openToken` of when it opened, plan 8X-F).
+ */
+export const ROCKET_DIALOG_ID = 'r';
+export const ROCKET_ACTION = 'rset1';
+export const GRUNTS_INPUT = 'grunts';
+export const LEADERS_INPUT = 'leaders';
+
+/** What the id of the Rocket dialog says: Remove shown, and where it was opened from. */
+export interface RocketDialogId {
+  remove: boolean;
+  server?: string;
+  page?: number;
+}
+
+/** The custom id of the Rocket dialog's Submit, opened at `opened` (its per-open token). */
+export function rocketDialogId(dialog: RocketDialogId, opened: number): string {
+  return encodeCustomId({
+    kind: WANT_BOX_KIND,
+    id: ROCKET_DIALOG_ID,
+    action: ROCKET_ACTION,
+    args: [
+      (dialog.remove ? REMOVE_FLAG : 0).toString(36),
+      ...(dialog.server === undefined ? [] : [dialog.server]),
+      ...(dialog.page === undefined ? [] : [`l${String(dialog.page)}`]),
+      openToken(opened),
+    ],
+  });
+}
+
+/**
+ * What a custom id of the Rocket dialog says, its token left out; undefined for any other, also
+ * one without a token (no `rset1` dialog was drawn without one).
+ */
+export function readRocketDialogId(id: CustomId): RocketDialogId | undefined {
+  if (id.kind !== WANT_BOX_KIND || id.id !== ROCKET_DIALOG_ID || id.action !== ROCKET_ACTION) {
+    return undefined;
+  }
+  const args = withoutOpenToken(id.args);
+  if (args.length === id.args.length) return undefined;
+  const [flags, ...rest] = args;
+  if (flags !== '0' && flags !== String(REMOVE_FLAG)) return undefined;
+  let at = 0;
+  const server = rest[at] !== undefined && isSnowflake(rest[at] ?? '') ? rest[at++] : undefined;
+  const pageText = rest[at];
+  let page: number | undefined;
+  if (pageText !== undefined) {
+    const read = /^l(\d{1,3})$/.exec(pageText)?.[1];
+    if (read === undefined) return undefined;
+    page = Number(read);
+    at += 1;
+  }
+  if (at !== rest.length) return undefined;
+  return {
+    remove: flags === String(REMOVE_FLAG),
+    ...(server === undefined ? {} : { server }),
+    ...(page === undefined ? {} : { page }),
+  };
+}
+
+/** One option of the Rocket dialog: its target's `who`, its label, a description where it has one. */
+export interface RocketOption {
+  who: string;
+  label: string;
+  description?: string;
+}
+
+/** What the Rocket dialog shows and has ticked when it opens. */
+export interface RocketDialogView {
+  grunts: readonly RocketOption[];
+  leaders: readonly RocketOption[];
+  /** The `who` ticked: the member's Rocket wants, and a target picked. */
+  ticked: ReadonlySet<string>;
+  /** The member holds a Rocket want: Remove shows. */
+  remove: boolean;
+  server?: { id: string; name: string };
+  page?: number;
+  /** When it opened: the per-open token of its id (`openToken`, plan 8X-F). */
+  openedAt: number;
+}
+
+/**
+ * The Team GO Rocket dialog (mockup 8): "Team GO Rocket: what for?", the text, Grunts (a dropdown
+ * of the twenty grunts, `min_values` 0), Leaders (a checkbox group of five) and Remove where the
+ * member holds a Rocket want. Its Submit is `wantbox:r:rset1`.
+ */
+export function rocketDialog(view: RocketDialogView): APIModalInteractionResponseCallbackData {
+  const option = (one: RocketOption) => ({
+    label: one.label,
+    value: one.who,
+    ...(one.description === undefined ? {} : { description: one.description }),
+    ...(view.ticked.has(one.who) ? { default: true } : {}),
+  });
+  const opened = view.server !== undefined || view.page !== undefined;
+  const where = view.server === undefined ? '' : ` in ${plain(view.server.name)}`;
+  const text =
+    opened && view.remove
+      ? `Your Team GO Rocket wants${where}. Change what you want a DM about, or tick Remove to ` +
+        'stop them all.'
+      : 'Pick what you want a DM about, in the regions you can see. A grunt type is told at most ' +
+        'once an hour.';
+  const components: APIModalInteractionResponseCallbackData['components'] = [
+    textDisplay(text),
+    {
+      type: ComponentType.Label,
+      label: 'Grunts',
+      description:
+        'By type, whatever their lineup. For one Pokémon they give, tick Shadow in its own /want.',
+      component: {
+        type: ComponentType.StringSelect,
+        custom_id: GRUNTS_INPUT,
+        required: false,
+        min_values: 0,
+        max_values: view.grunts.length,
+        options: view.grunts.map(option),
+      },
+    },
+    {
+      type: ComponentType.Label,
+      label: 'Leaders',
+      component: {
+        type: ComponentType.CheckboxGroup,
+        custom_id: LEADERS_INPUT,
+        required: false,
+        min_values: 0,
+        max_values: view.leaders.length,
+        options: view.leaders.map(option),
+      },
+    },
+  ];
+  if (view.remove) {
+    components.push({
+      type: ComponentType.Label,
+      label: 'Remove all my Team GO Rocket wants',
+      description: 'Ticked, Submit removes them, whatever else is picked.',
+      component: { type: ComponentType.Checkbox, custom_id: REMOVE_INPUT },
+    });
+  }
+  return {
+    custom_id: rocketDialogId(
+      {
+        remove: view.remove,
+        ...(view.server === undefined ? {} : { server: view.server.id }),
+        ...(view.page === undefined ? {} : { page: view.page }),
+      },
+      view.openedAt,
+    ),
+    title: 'Team GO Rocket: what for?',
+    components,
+  };
+}
+
+/** What a Submit of the Rocket dialog picked; undefined for a form of another shape. */
+export function readRocketSubmit(
+  interaction: Pick<ModalSubmitInteraction, 'fields'>,
+  id: RocketDialogId,
+): { picked: string[]; remove: boolean } | undefined {
+  try {
+    const { fields } = interaction;
+    return {
+      picked: [
+        ...fields.getStringSelectValues(GRUNTS_INPUT),
+        ...fields.getCheckboxGroup(LEADERS_INPUT),
+      ],
+      remove: id.remove && fields.getCheckbox(REMOVE_INPUT),
+    };
+  } catch {
+    return undefined;
+  }
+}
diff --git a/src/commands/notifications/wants.test.ts b/src/commands/notifications/wants.test.ts
index 0970cb0dfbb30e5aa04f7e3e1ce9b7f08676970c..3fd8fc36159e84747e80bc06c342cc82442c2d88 100644
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -1123,38 +1123,165 @@ describe('/unwant: a form under a species want (plan 8R-4, R4e)', () => {
 });
 
 describe('/want: Team GO Rocket (plan 8R-2)', () => {
-  it('wants a grunt type, a leader, any leader, Giovanni and the decoy at once, by choice or name', async () => {
-    const made = setup([], rocketChoicesOfFeed());
-    expect(await made.answer('want', { target: 'grunt:water' })).toBe(
-      'You will get a DM when a **Water-type grunt** is reported in a region you can see, at ' +
-        'most one an hour for each grunt type. `/unwant` takes it off again.',
+  /** The values of a field of the Rocket dialog ticked or chosen when it opens. */
+  const rocketTicks = (dialog: APIModalInteractionResponseCallbackData) => [
+    ...(dialogField(dialog, 'Grunts').options ?? [])
+      .filter((one) => one.ticked)
+      .map((one) => one.value),
+    ...(dialogField(dialog, 'Leaders').options ?? [])
+      .filter((one) => one.ticked)
+      .map((one) => one.value),
+  ];
+  /** The Rocket dialog Alice opened with `target`, submitted with these grunts and leaders. */
+  const rocketWith = async (
+    made: ReturnType<typeof setup>,
+    target: string,
+    grunts: string[],
+    leaders: string[],
+    remove = false,
+  ) => {
+    const dialog = shownDialog(await made.run('want', { target }));
+    const submitted = await made.handle(
+      fakeModal({
+        customId: dialog.custom_id,
+        form: dialog,
+        selected: { grunts },
+        checked: { leaders },
+        ...(dialogFields(dialog).some((field) => field.id === 'remove')
+          ? { ticks: { remove } }
+          : {}),
+        userId: ALICE,
+      }),
     );
-    expect(await made.answer('want', { target: 'Arlo' })).toBe(
-      'You will get a DM when **Arlo** is reported in a region you can see. `/unwant` takes it ' +
-        'off again.',
+    return { dialog, said: sent(submitted.editReply).content };
+  };
+
+  it('opens one dialog for every Rocket want, by /want rocket or any of its targets (plan 8R-4)', async () => {
+    const made = setup([], rocketChoicesOfFeed());
+    // Through the router: nothing is acknowledged before the dialog (F13).
+    const asked = await made.run('want', { target: 'rocket' });
+    expect(asked.deferReply).not.toHaveBeenCalled();
+    const dialog = shownDialog(asked);
+    expect(dialog.title).toBe('Team GO Rocket: what for?');
+    expect(dialogText(dialog)).toBe(
+      'Pick what you want a DM about, in the regions you can see. A grunt type is told at most ' +
+        'once an hour.',
     );
-    for (const target of ['any leader', 'giovanni', 'decoy grunt', 'electric grunt']) {
-      await made.run('want', { target });
+    expect(dialogFields(dialog).map((field) => [field.label, field.kind])).toEqual([
+      ['Grunts', 'select'],
+      ['Leaders', 'group'],
+    ]);
+    expect(dialogField(dialog, 'Grunts').description).toBe(
+      'By type, whatever their lineup. For one Pokémon they give, tick Shadow in its own /want.',
+    );
+    expect(dialogField(dialog, 'Grunts').options?.map((one) => one.label)).toEqual([
+      'Bug-type grunts',
+      'Dark-type grunts',
+      'Dragon-type grunts',
+      'Electric-type grunts',
+      'Fairy-type grunts',
+      'Fighting-type grunts',
+      'Fire-type grunts',
+      'Flying-type grunts',
+      'Ghost-type grunts',
+      'Grass-type grunts',
+      'Ground-type grunts',
+      'Ice-type grunts',
+      'Normal-type grunts',
+      'Poison-type grunts',
+      'Psychic-type grunts',
+      'Rock-type grunts',
+      'Steel-type grunts',
+      'Water-type grunts',
+      'Grunts without a type',
+      'Decoy grunt',
+    ]);
+    expect(dialogField(dialog, 'Leaders').options).toEqual([
+      { value: 'leader:cliff', label: 'Cliff', ticked: false },
+      { value: 'leader:arlo', label: 'Arlo', ticked: false },
+      { value: 'leader:sierra', label: 'Sierra', ticked: false },
+      {
+        value: 'leader:any',
+        label: 'Any leader',
+        description: 'Every leader, also future ones',
+        ticked: false,
+      },
+      { value: 'giovanni', label: 'Giovanni', ticked: false },
+    ]);
+    // A target picked or typed opens it with that one ticked.
+    expect(rocketTicks(shownDialog(await made.run('want', { target: 'grunt:water' })))).toEqual([
+      'grunt:water',
+    ]);
+    expect(rocketTicks(shownDialog(await made.run('want', { target: 'Arlo' })))).toEqual([
+      'leader:arlo',
+    ]);
+    for (const target of ['no type', 'No type grunt', 'grunt (no type)']) {
+      expect(rocketTicks(shownDialog(await made.run('want', { target }))), target).toEqual([
+        'grunt:none',
+      ]);
     }
+    expect(made.rows()).toEqual([]);
+  });
+
+  it('writes the Rocket wants picked, takes the others off, and all with nothing or Remove', async () => {
+    const made = setup([], rocketChoicesOfFeed());
+    const first = await rocketWith(
+      made,
+      'rocket',
+      ['grunt:water', 'grunt:fire'],
+      ['leader:arlo', 'leader:any', 'giovanni'],
+    );
+    expect(first.said).toBe(
+      '**Team GO Rocket**: Fire and Water grunts, Arlo, Any leader, Giovanni. You will get a DM ' +
+        'when one is reported in a region you can see, a grunt type at most once an hour.\n' +
+        '-# Any leader covers Cliff, Arlo and Sierra already: Arlo adds nothing.',
+    );
     expect((await made.ctx.targetWants.list(ALICE, FAKE_GUILD_ID)).wants).toEqual([
+      { kind: 'rocket', who: 'grunt:fire' },
       { kind: 'rocket', who: 'grunt:water' },
       { kind: 'rocket', who: 'leader:arlo' },
       { kind: 'rocket', who: 'leader:any' },
       { kind: 'rocket', who: 'giovanni' },
+    ]);
+    // Opened again: as held, plus the target picked, and Remove.
+    const again = await rocketWith(made, 'decoy', ['grunt:water', 'decoy'], []);
+    expect(rocketTicks(again.dialog)).toEqual([
+      'grunt:fire',
+      'grunt:water',
+      'decoy',
+      'leader:arlo',
+      'leader:any',
+      'giovanni',
+    ]);
+    expect(dialogFields(again.dialog).map((field) => field.label)).toContain(
+      'Remove all my Team GO Rocket wants',
+    );
+    expect((await made.ctx.targetWants.list(ALICE, FAKE_GUILD_ID)).wants).toEqual([
+      { kind: 'rocket', who: 'grunt:water' },
       { kind: 'rocket', who: 'decoy' },
-      { kind: 'rocket', who: 'grunt:electric' },
     ]);
+    const removed = await rocketWith(made, 'rocket', ['grunt:water'], ['giovanni'], true);
+    expect(removed.said).toBe('**Team GO Rocket** is off your list.');
+    expect(await made.ctx.targetWants.count(ALICE, FAKE_GUILD_ID)).toBe(0);
+    await rocketWith(made, 'rocket', ['grunt:water'], []);
+    expect((await rocketWith(made, 'rocket', [], [])).said).toBe(
+      '**Team GO Rocket** is off your list.',
+    );
     expect(made.rows()).toEqual([]);
+    // A first want with nothing picked: nothing was there to take off (B8).
+    expect((await rocketWith(made, 'rocket', [], [])).said).toBe(
+      'Nothing picked: no Team GO Rocket wants.',
+    );
   });
 
-  it('reads the untyped grunts typed as no type (fix S2); none is zero IVs, the legacy word (fix F4)', async () => {
+  it('reads none as zero IVs, the legacy word (fix F4), never the untyped grunts', async () => {
     const made = setup([], rocketChoicesOfFeed());
-    for (const target of ['no type', 'No type grunt', 'grunt (no type)']) {
-      expect(await made.answer('want', { target }), target).toMatch(/\*\*Grunt \(no type\)\*\*/);
-    }
-    expect((await made.ctx.targetWants.list(ALICE, FAKE_GUILD_ID)).wants).toEqual([
-      { kind: 'rocket', who: 'grunt:none' },
-    ]);
+    await made.ctx.targetWants.change(
+      ALICE,
+      FAKE_GUILD_ID,
+      { add: [{ kind: 'rocket', who: 'grunt:none' }], remove: [] },
+      0,
+    );
     expect(await made.answer('want', { target: 'none' })).toMatch(/with zero IVs/);
     expect(made.rows()).toHaveLength(1);
     // A legacy member's `/unwant target:none` takes the zero IVs off, and leaves the grunts.
@@ -1197,11 +1324,16 @@ describe('/want: Team GO Rocket (plan 8R-2)', () => {
     ]);
   });
 
-  it('words a grunt type with its article (fix B4)', async () => {
+  it('offers Team GO Rocket itself as a choice of /want and /unwant', async () => {
     const made = setup([], rocketChoicesOfFeed());
-    expect(await made.answer('want', { target: 'grunt:electric' })).toMatch(
-      /^You will get a DM when an \*\*Electric-type grunt\*\* is reported/,
-    );
+    expect(await made.choices('want', 'rocket')).toContainEqual({
+      name: 'Team GO Rocket (every grunt, leader and Giovanni)',
+      value: 'rocket',
+    });
+    expect(await made.choices('want', 'team go')).toContainEqual({
+      name: 'Team GO Rocket (every grunt, leader and Giovanni)',
+      value: 'rocket',
+    });
   });
 
   it('offers the lineups’ catches a text names before other Pokémon (design 9.9)', async () => {
@@ -1235,27 +1367,50 @@ describe('/want: Team GO Rocket (plan 8R-2)', () => {
     expect(await boxes([decoy])).toContain('shadow');
   });
 
-  it('lists the Rocket targets in /wants, takes them off with /unwant and Remove', async () => {
+  it('lists Team GO Rocket in one line of /wants with Change…, and /unwant takes one or all off', async () => {
     const made = setup([], rocketChoicesOfFeed());
-    await made.run('want', { target: 'grunt:dragon' });
-    await made.run('want', { target: 'leader:cliff' });
+    const rocket = (who: string) => ({ kind: 'rocket', who }) as const;
+    await made.ctx.targetWants.change(
+      ALICE,
+      FAKE_GUILD_ID,
+      { add: [rocket('grunt:dragon'), rocket('leader:cliff'), rocket('giovanni')], remove: [] },
+      0,
+    );
+    made.store.add(ALICE, FAKE_GUILD_ID, -6, 'spawn');
     const message = asV2(answered(await made.run('wants')));
     expect(textDisplays(message).slice(1, -1)).toEqual([
-      '**Dragon-type grunt**',
-      '**Cliff (Team GO Rocket leader)**',
+      '**Team GO Rocket**: Dragon grunts, Cliff, Giovanni',
+      '**Perfect IVs**: Spawns',
     ]);
     expect(customIdsOf(message)).toEqual([
-      'wantlist:0:remove:rg:dragon',
-      'wantlist:0:remove:rl:cliff',
+      'wantlist:0:change:rocket',
+      'wantlist:0:remove:iv:perfect',
       'wantlist:0:all',
     ]);
+    const pressed = await made.handle(
+      fakeButton({ customId: 'wantlist:0:change:rocket', userId: ALICE, v2Message: true }),
+    );
+    expect(shownDialog(pressed).custom_id).toMatch(/:l0:~[0-9a-z]+$/);
     expect(await made.answer('unwant', { target: 'Cliff' })).toBe(
       '**Cliff (Team GO Rocket leader)** is off your list.',
     );
-    await made.handle(
-      fakeButton({ customId: 'wantlist:0:remove:rg:dragon', userId: ALICE, v2Message: true }),
+    expect(await made.answer('unwant', { target: 'rocket' })).toBe(
+      '**Team GO Rocket** is off your list.',
     );
     expect(await made.ctx.targetWants.count(ALICE, FAKE_GUILD_ID)).toBe(0);
+    // Over three grunt types, by count.
+    await made.ctx.targetWants.change(
+      ALICE,
+      FAKE_GUILD_ID,
+      {
+        add: ['bug', 'dark', 'fire', 'ice'].map((type) => rocket(`grunt:${type}`)),
+        remove: [],
+      },
+      0,
+    );
+    expect(textDisplays(asV2(answered(await made.run('wants'))))[1]).toBe(
+      '**Team GO Rocket**: 4 grunt types',
+    );
   });
 });
 
diff --git a/src/commands/notifications/wants.ts b/src/commands/notifications/wants.ts
index 4ae338568f8c994d4cc39cb5f65090e391c35545..65383184e8b2625d635a61bab24de025b0c72451 100644
--- a/src/commands/notifications/wants.ts
+++ b/src/commands/notifications/wants.ts
@@ -12,7 +12,12 @@ import type { AppContext } from '../../app-context.js';
 import type { ComponentHandler, Guard, SimpleCommand } from '../../discord/command.js';
 import { decodeCustomId } from '../../discord/custom-id.js';
 import { dmMessages } from '../../components/dm-messages.js';
-import { CHANGE_ACTION, changeButtonId, withChanged } from '../../render/notify-dm.js';
+import {
+  CHANGE_ACTION,
+  changeButtonId,
+  rocketChangeButtonId,
+  withChanged,
+} from '../../render/notify-dm.js';
 import { deferSubmit, readInTime } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf, partyOf, requireGuild } from '../../discord/guards.js';
@@ -31,13 +36,13 @@ import {
 import {
   BOX_WORDS,
   baseTarget,
-  rocketTargetLabel,
   type BoxSubject,
   type WantBox,
 } from '../../domain/pogo/want-boxes.js';
 import { hasForms, type SetWantOutcome } from '../../domain/pogo/wants.js';
 import type { V2Message } from '../../discord/party-gateway.js';
-import type { TargetWant } from '../../domain/notify/target-wants.js';
+import { ANY_LEADER, type TargetWant } from '../../domain/notify/target-wants.js';
+import type { TargetWantList } from '../../db/repositories/target-want-repository.js';
 import { parseStopArgs, stopArgs, type NotifyReason } from '../../domain/notify/reasons.js';
 import { renderMemberList } from '../../render/member-list.js';
 import { count, plain, truncate } from '../../render/text.js';
@@ -55,8 +60,12 @@ import {
   readWanted,
   rewardLabel,
   rewardWantChoices,
+  rocketLine,
+  rocketOptions,
   rocketWantChoices,
+  rocketWhos,
   rowsLabel,
+  TEAM_ROCKET,
   scopeOf,
   shownBoxes,
   subjectLabel,
@@ -67,8 +76,11 @@ import {
   type WantEntry,
 } from './want-boxes.js';
 import {
+  readRocketDialogId,
+  readRocketSubmit,
   readWantDialogId,
   readWantSubmit,
+  rocketDialog,
   wantDialog,
   WANT_BOX_KIND,
   type WantDialogId,
@@ -302,26 +314,6 @@ function rewardAnswer(ctx: AppContext, wanted: Wanted & { kind: 'reward' }): str
   );
 }
 
-/**
- * What `/want` says of a Rocket target it added (plan 8R-2): a grunt type at most one DM an hour
- * (Matt's answer 3), a leader, any leader, Giovanni or the decoy whenever reported.
- */
-function rocketWantAnswer(target: TargetWant): string {
-  const who = target.kind === 'rocket' ? target.who : '';
-  const label = plain(rocketTargetLabel(who).replace(/ \(Team GO Rocket \w+\)$/, ''));
-  const grunt = who.startsWith('grunt:');
-  const named =
-    who === 'leader:any'
-      ? '**any Team GO Rocket leader**'
-      : grunt || who === 'decoy'
-        ? withArticle(label, `**${label}**`)
-        : `**${label}**`;
-  return (
-    `You will get a DM when ${named} is reported in a region you can see` +
-    `${grunt ? ', at most one an hour for each grunt type' : ''}. \`/unwant\` takes it off again.`
-  );
-}
-
 /**
  * What `/want` adds where it wrote at once (one box, no Costumes field) and a row held stays
  * costumed (F3): the dialog of a line's Change… in `/wants` shows Costumes for it.
@@ -406,7 +398,7 @@ function useOf(interaction: ChatInputCommandInteraction, ctx: AppContext): WantU
   } else {
     wanted = readWanted(ctx, typed);
   }
-  let use: WantUse = { wanted, asks: false };
+  let use: WantUse = { wanted, asks: wanted.kind === 'rocket' };
   if (wanted.kind === 'subject') {
     const { subject, picked } = dialogSubject(ctx, wanted.subject);
     const postBox = postBoxOf(party, subject);
@@ -446,6 +438,7 @@ const readsUse: Guard = (interaction, ctx) => {
 /** Whether a use opens the dialog (`asksAbout`); decided before any read, so synchronously. */
 function opensDialog(interaction: ChatInputCommandInteraction, ctx: AppContext): boolean {
   try {
+    // Team GO Rocket always asks (F13: else the router would acknowledge it as `late`).
     return useOf(interaction, ctx).asks;
   } catch {
     // What it names is refused by the guard `readsUse` before this is asked.
@@ -492,15 +485,15 @@ export const want: SimpleCommand = {
       'costumed ones come too. Picking a form from the list (`Galarian Corsola`) opens its ' +
       'species with that form ticked. Remove takes the Pokémon off your list. A raid tier asks ' +
       'about its raids and its shadow raids. ' +
-      'Team GO Rocket is wanted at once: a grunt type (`dragon grunt`; at most one direct ' +
-      'message an hour for each type), Cliff, Arlo, Sierra or any leader, Giovanni, or the ' +
-      'decoy grunt. Wanting something again shows what you ticked. A first want opens with no ' +
-      'box ticked, and Submit waits till one is. In the post of a raid or a max battle, `/want` ' +
-      'alone is its boss (an egg: its tier; a boss Pine does not know yet has to be named), ' +
-      'and the dialog ticks that kind of battle only ' +
-      '(Raids, Shadow for a shadow raid, Dynamax or Gigantamax), also for a Pokémon you type ' +
-      'there; anywhere else, name a Pokémon. Pick from the list that appears while you type, ' +
-      'or type a name or a tier such as `t5`, `mega`, `elite`, `perfect` or `zero`.',
+      '`/want rocket` (or a grunt type, a leader or Giovanni) asks in one dialog which grunt ' +
+      'types (at most one direct message an hour for each), the untyped and decoy grunts, ' +
+      'Cliff, Arlo, Sierra, any leader and Giovanni you want. Wanting something again shows ' +
+      'what you ticked. A first want opens with no box ticked, and Submit waits till one is. ' +
+      'In the post of a raid or a max battle, `/want` alone is its boss (an egg: its tier; a ' +
+      'boss Pine does not know yet has to be named), and the dialog ticks that kind of battle ' +
+      'only (Raids, Shadow for a shadow raid, Dynamax or Gigantamax), also for a Pokémon you ' +
+      'type there; anywhere else, name a Pokémon. Pick from the list that appears while you ' +
+      'type, or type a name or a tier such as `t5`, `mega`, `elite`, `perfect` or `zero`.',
     examples: [
       '/want target:Dratini',
       '/want target:t5',
@@ -531,13 +524,13 @@ export const want: SimpleCommand = {
       return;
     }
     if (wanted.kind === 'rocket') {
-      await ctx.targetWants.change(
-        memberId,
-        guildId,
-        { add: [wanted.want], remove: [] },
-        Date.now(),
-      );
-      await answer(interaction, { content: rocketWantAnswer(wanted.want) });
+      // One dialog for every Rocket want (plan 8R-4, design 4b), the target picked ticked.
+      const picked = wanted.want?.kind === 'rocket' ? wanted.want.who : undefined;
+      const { dialog } = await rocketDialogFor(ctx, interaction, memberId, guildId, {
+        openedAt: Date.now(),
+        ...(picked === undefined ? {} : { picked }),
+      });
+      await interaction.showModal(dialog);
       return;
     }
     if (wanted.kind === 'iv') {
@@ -601,9 +594,8 @@ export const want: SimpleCommand = {
 const requireWantServer: Guard = (interaction) => {
   if (interaction.inGuild()) return;
   const id = 'customId' in interaction ? decodeCustomId(interaction.customId) : undefined;
-  if (id === undefined || readWantDialogId(id)?.server === undefined) {
-    throw new UserError('This only works in a server.');
-  }
+  const server = id && (readWantDialogId(id)?.server ?? readRocketDialogId(id)?.server);
+  if (server === undefined) throw new UserError('This only works in a server.');
 };
 
 /** What Change… from a DM says where wants are switched off. */
@@ -626,39 +618,42 @@ export async function changeRefusal(
   return (await ctx.members.find(guildId, memberId)) ? undefined : NOT_A_MEMBER;
 }
 
+/** What a Submit wrote: its answer, and whether it took the want off. */
+interface Written {
+  said: string;
+  removed: boolean;
+}
+
 /**
  * A Submit from a DM (plan 8R-4, R20): acknowledged on the message the Change… was on
- * (`deferUpdate`), written for the server of the id and the presser alone, then that message's
- * Change… of the subject shown as a disabled `Changed` (`Removed` where it took the want off)
- * under the messages' lock (`dmMessages`, read anew first), and answered below (`followUp`), also
- * when the button could not be changed.
+ * (`deferUpdate`), written for the server of the id and the presser alone (`write`), then that
+ * message's Change… (`button`) shown as a disabled `Changed` (`Removed` where it took the want
+ * off) under the messages' lock (`dmMessages`, read anew first), and answered below
+ * (`followUp`), also when the button could not be changed.
  */
 async function submitFromDm(
   interaction: ModalSubmitInteraction,
   ctx: AppContext,
-  submit: WantDialogId,
-  given: BoxAnswer,
+  server: string,
+  button: string | undefined,
+  write: () => Promise<Written>,
 ): Promise<void> {
-  const guildId = submit.server;
-  if (guildId === undefined) throw new UserError(STALE_COMPONENT);
   const message = interaction.isFromMessage() ? interaction.message : undefined;
   if (message) await interaction.deferUpdate();
   else await deferSubmit(interaction);
   // Asked again (B2): the member may have left, or wants been switched off, since it opened.
-  const refusal = await changeRefusal(ctx, guildId, interaction.user.id);
+  const refusal = await changeRefusal(ctx, server, interaction.user.id);
   if (refusal !== undefined) {
     await (message
       ? interaction.followUp({ content: refusal })
       : interaction.editReply({ content: refusal }));
     return;
   }
-  const { after } = await ctx.wantBoxes.set(interaction.user.id, guildId, given, Date.now());
-  const said = boxesAnswer(ctx, submit.subject, after, given);
+  const { said, removed } = await write();
   if (!message) {
     await interaction.editReply({ content: said });
     return;
   }
-  const button = changeButtonId(guildId, submit.subject);
   await dmMessages.run(message.id, async () => {
     let now: Pick<Message, 'components' | 'flags'> = message;
     try {
@@ -671,7 +666,7 @@ async function submitFromDm(
     try {
       const components = now.components.map((component) => component.toJSON());
       await interaction.editReply({
-        components: withChanged(components, button, given.remove || after.length === 0),
+        components: withChanged(components, button, removed),
         flags: MessageFlags.IsComponentsV2,
       });
     } catch (err) {
@@ -690,25 +685,144 @@ async function submitFromDm(
 async function submitFromList(
   interaction: ModalSubmitInteraction,
   ctx: AppContext,
-  submit: WantDialogId,
-  given: BoxAnswer,
   page: number,
+  write: () => Promise<Written>,
 ): Promise<void> {
   // Acknowledged first (B1): the writing and the list's read may take longer than Discord waits.
   await interaction.deferUpdate();
-  const { after } = await ctx.wantBoxes.set(
-    interaction.user.id,
-    guildIdOf(interaction),
-    given,
-    Date.now(),
-  );
-  const [said = '', ...warnings] = boxesAnswer(ctx, submit.subject, after, given).split('\n');
+  const [said = '', ...warnings] = (await write()).said.split('\n');
   await showInPlace(interaction, await memberWants(interaction, ctx, page, said));
   if (warnings.length > 0) {
     await interaction.followUp({ content: warnings.join('\n'), flags: MessageFlags.Ephemeral });
   }
 }
 
+/**
+ * A Submit as it came: from a DM (`server`, the Change… of `button`), from `/wants` (`page`), or
+ * from `/want`'s own use (acknowledged privately at once, answered by an edit).
+ */
+async function answerSubmit(
+  interaction: ModalSubmitInteraction,
+  ctx: AppContext,
+  from: { server?: string; page?: number; button: (server: string) => string | undefined },
+  write: (guildId: string) => Promise<Written>,
+): Promise<void> {
+  if (!interaction.inGuild()) {
+    const { server } = from;
+    if (server === undefined) throw new UserError(STALE_COMPONENT);
+    await submitFromDm(interaction, ctx, server, from.button(server), () => write(server));
+    return;
+  }
+  const guildId = guildIdOf(interaction);
+  if (from.page !== undefined && interaction.isFromMessage()) {
+    await submitFromList(interaction, ctx, from.page, () => write(guildId));
+    return;
+  }
+  await deferSubmit(interaction);
+  await interaction.editReply({ content: (await write(guildId)).said });
+}
+
+/**
+ * The Rocket dialog for a member in a server (plan 8R-4, design 4b): their Rocket wants read in
+ * time, ticked, with `picked` (a target picked or typed) beside them.
+ */
+export async function rocketDialogFor(
+  ctx: AppContext,
+  interaction: ChatInputCommandInteraction | ButtonInteraction,
+  memberId: string,
+  guildId: string,
+  options: {
+    /** When it opens (its id's per-open token, plan 8X-F). */
+    openedAt: number;
+    picked?: string;
+    server?: { id: string; name: string };
+    page?: number;
+  },
+): Promise<{ held: Set<string>; dialog: APIModalInteractionResponseCallbackData }> {
+  const held = await readInTime(ctx.log, interaction, async () =>
+    rocketWhosOf(await ctx.targetWants.list(memberId, guildId)),
+  );
+  return { held, dialog: rocketDialogOf(held, options) };
+}
+
+/** The Rocket dialog of a member's Rocket wants (`held`, read), with `picked` beside them. */
+export function rocketDialogOf(
+  held: ReadonlySet<string>,
+  options: {
+    openedAt: number;
+    picked?: string;
+    server?: { id: string; name: string };
+    page?: number;
+  },
+): APIModalInteractionResponseCallbackData {
+  const { grunts, leaders } = rocketOptions();
+  const ticked = new Set([...held, ...(options.picked === undefined ? [] : [options.picked])]);
+  return rocketDialog({
+    grunts,
+    leaders,
+    ticked,
+    remove: held.size > 0,
+    ...(options.server === undefined ? {} : { server: options.server }),
+    ...(options.page === undefined ? {} : { page: options.page }),
+    openedAt: options.openedAt,
+  });
+}
+
+/** The `who` of a member's Rocket wants. */
+export function rocketWhosOf(list: TargetWantList): Set<string> {
+  return new Set(list.wants.flatMap((want) => (want.kind === 'rocket' ? [want.who] : [])));
+}
+
+/**
+ * Writes a Submit of the Rocket dialog (design 4b): the targets picked, in the dialog's order,
+ * and every other Rocket target off, in one transaction under the member's lock
+ * (`TargetWantStorage.change`); nothing picked or Remove takes them all off.
+ */
+async function writeRocket(
+  ctx: AppContext,
+  memberId: string,
+  guildId: string,
+  read: { picked: string[]; remove: boolean },
+): Promise<Written> {
+  const all = rocketWhos();
+  const picked = read.remove ? [] : all.filter((who) => read.picked.includes(who));
+  const rocket = (who: string): TargetWant => ({ kind: 'rocket', who });
+  const gone = await ctx.targetWants.change(
+    memberId,
+    guildId,
+    {
+      add: picked.map(rocket),
+      remove: all.filter((who) => !picked.includes(who)).map(rocket),
+    },
+    Date.now(),
+  );
+  if (picked.length === 0) {
+    // Whether there was any to take off is decided under the member's lock (B8).
+    return gone === 0 && !read.remove
+      ? { said: 'Nothing picked: no Team GO Rocket wants.', removed: false }
+      : { said: '**Team GO Rocket** is off your list.', removed: true };
+  }
+  const whos = new Set(picked);
+  const grunts = picked.some((who) => who.startsWith('grunt:') || who === 'decoy');
+  const lines = [
+    `**Team GO Rocket**: ${plain(rocketLine(whos))}. You will get a DM when one is reported in ` +
+      `a region you can see${grunts ? ', a grunt type at most once an hour' : ''}.`,
+  ];
+  const named = rocketOptions().leaders.filter(
+    (one) => one.who.startsWith('leader:') && one.who !== ANY_LEADER && whos.has(one.who),
+  );
+  if (whos.has(ANY_LEADER) && named.length > 0) {
+    const names = named.map((one) => one.label);
+    const list =
+      names.length === 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
+    lines.push(
+      `-# Any leader covers Cliff, Arlo and Sierra already: ${list} ` +
+        `${names.length === 1 ? 'adds' : 'add'} nothing.`,
+    );
+  }
+  return { said: lines.join('\n'), removed: false };
+}
+
 /**
  * The Submit of `/want`'s dialog (kind `wantbox`): the boxes it shows now, as ticked; every
  * other box as it is; in one transaction under the member's lock (`WantBoxStorage.set`). The
@@ -719,27 +833,34 @@ export const wantBoxControls: ComponentHandler = {
   guards: [requireWantServer],
   throttle: NOTIFICATION_THROTTLE,
   async modal(interaction, id, ctx) {
+    const memberId = interaction.user.id;
+    const rocket = readRocketDialogId(id);
+    if (rocket) {
+      const read = readRocketSubmit(interaction, rocket);
+      if (!read) throw new UserError(STALE_COMPONENT);
+      const from = { ...rocket, button: (server: string) => rocketChangeButtonId(server) };
+      await answerSubmit(interaction, ctx, from, (guildId) =>
+        writeRocket(ctx, memberId, guildId, read),
+      );
+      return;
+    }
     const submit = readWantDialogId(id);
     // An id of before plan 8R-4 or of another shape: out of date, nothing written. The boxes
     // the dialog showed (B3), not those that can happen now.
     if (!submit) throw new UserError(STALE_COMPONENT);
     const given = answerOfSubmit(ctx, interaction, submit);
-    if (!interaction.inGuild()) {
-      await submitFromDm(interaction, ctx, submit, given);
-      return;
-    }
-    if (submit.page !== undefined && interaction.isFromMessage()) {
-      await submitFromList(interaction, ctx, submit, given, submit.page);
-      return;
-    }
-    await deferSubmit(interaction);
-    const { after } = await ctx.wantBoxes.set(
-      interaction.user.id,
-      guildIdOf(interaction),
-      given,
-      Date.now(),
-    );
-    await interaction.editReply({ content: boxesAnswer(ctx, submit.subject, after, given) });
+    const from = {
+      ...(submit.server === undefined ? {} : { server: submit.server }),
+      ...(submit.page === undefined ? {} : { page: submit.page }),
+      button: (server: string) => changeButtonId(server, submit.subject),
+    };
+    await answerSubmit(interaction, ctx, from, async (guildId) => {
+      const { after } = await ctx.wantBoxes.set(memberId, guildId, given, Date.now());
+      return {
+        said: boxesAnswer(ctx, submit.subject, after, given),
+        removed: given.remove || after.length === 0,
+      };
+    });
   },
 };
 
@@ -773,6 +894,7 @@ export async function wantLineCount(
 
 /** A line as `/unwant` lists and reads it: `Dratini: Raids, Research`. */
 function entryText(entry: WantEntry): string {
+  if (entry.detail !== undefined) return `${entry.label}: ${entry.detail}`;
   return entry.boxes.length === 0 ? entry.label : `${entry.label}: ${boxWords(entry.boxes)}`;
 }
 
@@ -793,13 +915,23 @@ async function removeEntry(
     return before.length > 0;
   }
   if (what.kind === 'want') return ctx.wants.remove(memberId, guildId, what.target);
+  if (what.kind === 'rocket') {
+    const held = rocketWhosOf(await ctx.targetWants.list(memberId, guildId));
+    if (held.size === 0) return false;
+    await writeRocket(ctx, memberId, guildId, { picked: [], remove: true });
+    return true;
+  }
   return ctx.targetWants.remove(memberId, guildId, what.want);
 }
 
 /** What a line of `Wanted` takes away, and what it is called. */
 function removalOf(ctx: AppContext, wanted: Wanted): { what: WantEntry['remove']; name: string } {
+  if (wanted.kind === 'rocket' && wanted.want === undefined) {
+    return { what: { kind: 'rocket' }, name: 'Team GO Rocket' };
+  }
   if (wanted.kind === 'reward' || wanted.kind === 'rocket') {
-    return { what: { kind: 'target', want: wanted.want }, name: rewardLabel(ctx, wanted.want) };
+    const want = wanted.want ?? { kind: 'rocket', who: '' };
+    return { what: { kind: 'target', want }, name: rewardLabel(ctx, want) };
   }
   if (wanted.kind === 'iv') {
     return { what: { kind: 'want', target: wanted.target }, name: wantLabel(ctx, wanted.target) };
@@ -856,7 +988,8 @@ export const unwant: SimpleCommand = {
       'target off your list for this server, whatever you ticked for it. A Pokémon takes all ' +
       'its forms off with it. A form (`Galarian Corsola`) is taken off where you want it by ' +
       'itself; where your want of the whole species covers it, nothing is taken off, and ' +
-      '`/want` on the species changes which forms. Unown’s letters are wants of their own. The ' +
+      '`/want` on the species changes which forms. Unown’s letters are wants of their own. ' +
+      '"Team GO Rocket" takes every Rocket want off; a grunt type or leader, that one alone. The ' +
       'list that appears while you type shows what is on it; you can also type the name as for ' +
       '`/want`. To keep some of what you ticked, use `/want` again instead.',
     examples: ['/unwant target:Mewtwo', '/unwant target:t5'],
@@ -918,19 +1051,30 @@ export const unwant: SimpleCommand = {
 export const WANT_LIST_KIND = 'wantlist';
 
 /** The reason a line's Remove carries (`stopArgs`). */
-function reasonOf(entry: WantEntry): NotifyReason {
+function reasonOf(entry: WantEntry): NotifyReason | undefined {
   const { remove } = entry;
   if (remove.kind === 'subject') return { kind: 'subject', subject: remove.subject };
   if (remove.kind === 'want') return { kind: 'want', target: remove.target };
+  if (remove.kind === 'rocket') return undefined;
   return { kind: 'target', want: remove.want };
 }
 
+/** The arguments of a line's Change…: its subject as `stopArgs` spells it, or `rocket`. */
+function changeArgs(change: NonNullable<WantEntry['change']>): string[] {
+  return change === 'rocket' ? [TEAM_ROCKET] : stopArgs({ kind: 'subject', subject: change });
+}
+
 /**
  * A line of the list, in at most `room` characters: `**Dratini**: Raids, Research, Shadow`,
  * `**Rare Candy**: Research`. Only the name is cut, before it is made plain.
  */
 function entryLine(entry: WantEntry, room: number): string {
-  const boxes = entry.boxes.length === 0 ? '' : `: ${boxWords(entry.boxes)}`;
+  const boxes =
+    entry.detail !== undefined
+      ? `: ${plain(entry.detail)}`
+      : entry.boxes.length === 0
+        ? ''
+        : `: ${boxWords(entry.boxes)}`;
   const line = (label: string): string => `**${plain(label)}**${boxes}`;
   const label = entry.listLabel ?? entry.label;
   let shown = line(label);
@@ -958,7 +1102,9 @@ export function wantsList(
     noun: ['want', 'wants'],
     items: entries.map((entry) => ({
       line: (room: number) => entryLine(entry, room),
-      removeArgs: stopArgs(reasonOf(entry)),
+      removeArgs: ((reason) => (reason === undefined ? [TEAM_ROCKET] : stopArgs(reason)))(
+        reasonOf(entry),
+      ),
       // Plan 8R-4: a Pokémon's and a tier's line has Change… (its dialog), the others Remove.
       ...(entry.change === undefined
         ? {}
@@ -967,7 +1113,7 @@ export function wantsList(
               action: CHANGE_ACTION,
               label: 'Change…',
               style: ButtonStyle.Secondary,
-              args: stopArgs({ kind: 'subject', subject: entry.change }),
+              args: changeArgs(entry.change),
               command: '/want',
             },
           }),
@@ -1010,6 +1156,19 @@ async function changeLine(
   args: readonly string[],
   page: number,
 ): Promise<void> {
+  if (args.length === 1 && args[0] === TEAM_ROCKET) {
+    const memberId = interaction.user.id;
+    const guildId = guildIdOf(interaction);
+    const { held, dialog } = await rocketDialogFor(ctx, interaction, memberId, guildId, {
+      page,
+      openedAt: Date.now(),
+    });
+    if (held.size === 0) {
+      throw new UserError('**Team GO Rocket** is not on your list; `/want` adds it.');
+    }
+    await interaction.showModal(dialog);
+    return;
+  }
   const asked = parseStopArgs(args);
   if (asked?.kind !== 'subject') {
     throw new UserError('That list is out of date. Use `/wants` again.');
diff --git a/src/components/dm.test.ts b/src/components/dm.test.ts
index 8d6f076e70cd23f3c8ddbe9412269b4eaa42e215..558d05f304ff1d4ea3551b2b596c6e432fbebd51 100644
--- a/src/components/dm.test.ts
+++ b/src/components/dm.test.ts
@@ -22,7 +22,12 @@ import { parseStopArgs, type NotifyReason } from '../domain/notify/reasons.js';
 import { boxTarget, type TargetWant } from '../domain/notify/target-wants.js';
 import { pokemonTarget, type NotificationTarget } from '../domain/pogo/notification-target.js';
 import { entryWant } from '../domain/pogo/wants.js';
-import { changeButtonId, notifyDm, stopButtonId } from '../render/notify-dm.js';
+import {
+  changeButtonId,
+  notifyDm,
+  rocketChangeButtonId,
+  stopButtonId,
+} from '../render/notify-dm.js';
 import { dmControls } from './dm.js';
 import { components } from './index.js';
 import { dialogField, dialogFields, dialogText, shownDialog } from '../../test/support/dialogs.js';
@@ -746,3 +751,143 @@ describe('Change… under a direct message (plan 8R-4)', () => {
 function createTestContextRouter(ctx: AppContext): InteractionRouter {
   return new InteractionRouter(ctx, [], components);
 }
+
+describe('Change… of Team GO Rocket under a direct message (plan 8R-4)', () => {
+  it('opens the Rocket dialog for the server, and says so where nothing is held', async () => {
+    const wants = new MemoryWants();
+    const members = new FakeMemberDirectory().add(ALICE, 'Alice', HOME);
+    const { ctx } = createTestContext({ wants, members });
+    const router = new InteractionRouter(ctx, [], components);
+    const press = async () => {
+      const pressed = fakeButton({
+        customId: `dm:${HOME}:change:rocket`,
+        isDm: true,
+        userId: ALICE,
+        messageRows: [],
+      });
+      await router.handle(pressed as never);
+      return pressed;
+    };
+    expect(sent((await press()).reply).content).toBe(
+      '**Team GO Rocket** is not on your list; `/want` adds it.',
+    );
+    await ctx.targetWants.change(
+      ALICE,
+      HOME,
+      { add: [{ kind: 'rocket', who: 'grunt:water' }], remove: [] },
+      0,
+    );
+    const dialog = shownDialog(await press());
+    expect(dialog.title).toBe('Team GO Rocket: what for?');
+    expect(dialog.custom_id).toContain(`:${HOME}`);
+    expect(dialogFields(dialog).map((field) => field.label)).toEqual([
+      'Grunts',
+      'Leaders',
+      'Remove all my Team GO Rocket wants',
+    ]);
+  });
+
+  /** A DM with the Change… of Team GO Rocket and a gym's Stop, Alice a member of the server. */
+  function rocketDm(more: Partial<AppContext> = {}) {
+    const members = new FakeMemberDirectory().add(ALICE, 'Alice', HOME);
+    const { ctx } = createTestContext({ wants: new MemoryWants(), members, ...more });
+    const router = new InteractionRouter(ctx, [], components);
+    const message = fakeMessage(
+      notifyDm({ sentence: 'A grunt.', links: [] }, [
+        {
+          label: 'Water-type grunt',
+          change: { customId: rocketChangeButtonId(HOME), name: 'Water-type grunt' },
+        },
+        { label: 'a gym', stop: stopButtonId(HOME, { kind: 'gym', gymId: 1 }) },
+      ]).components as unknown as FakeRow[],
+    );
+    const press = async () => {
+      const pressed = fakeButton({
+        customId: rocketChangeButtonId(HOME),
+        isDm: true,
+        userId: ALICE,
+        message,
+      });
+      await router.handle(pressed as never);
+      return pressed;
+    };
+    const submit = async (
+      dialog: ReturnType<typeof shownDialog>,
+      given: {
+        selected?: Record<string, string[]>;
+        checked?: Record<string, string[]>;
+        ticks?: Record<string, boolean>;
+      },
+    ) => {
+      const submitted = fakeModal({
+        customId: dialog.custom_id,
+        form: dialog,
+        isDm: true,
+        userId: ALICE,
+        message,
+        ...given,
+      });
+      await router.handle(submitted as never);
+      return submitted;
+    };
+    const labels = () =>
+      buttonsOf({
+        v2: true as const,
+        components: message.rows as unknown as V2Message['components'],
+      }).map((button) => button.label);
+    return { ctx, members, press, submit, labels };
+  }
+
+  it('writes a Submit from the DM, shows Changed or Removed, and answers below (B6)', async () => {
+    const made = rocketDm();
+    await made.ctx.targetWants.change(
+      ALICE,
+      HOME,
+      { add: [{ kind: 'rocket', who: 'grunt:water' }], remove: [] },
+      0,
+    );
+    const dialog = shownDialog(await made.press());
+    const changed = await made.submit(dialog, {
+      selected: { grunts: ['grunt:water', 'grunt:fire'] },
+    });
+    expect(changed.deferUpdate).toHaveBeenCalledTimes(1);
+    expect((await made.ctx.targetWants.list(ALICE, HOME)).wants).toEqual([
+      { kind: 'rocket', who: 'grunt:water' },
+      { kind: 'rocket', who: 'grunt:fire' },
+    ]);
+    expect(made.labels()).toEqual(['Changed', 'Stop']);
+    expect(sent(changed.followUp).content).toMatch(
+      /^\*\*Team GO Rocket\*\*: Fire and Water grunts/,
+    );
+    const removed = await made.submit(dialog, { ticks: { remove: true } });
+    expect(await made.ctx.targetWants.count(ALICE, HOME)).toBe(0);
+    expect(made.labels()).toEqual(['Removed', 'Stop']);
+    expect(sent(removed.followUp).content).toBe('**Team GO Rocket** is off your list.');
+  });
+
+  it('refuses privately where the member has left or wants are off, by the one check (B9)', async () => {
+    const gone = rocketDm({ members: new FakeMemberDirectory() });
+    const pressed = await gone.press();
+    expect(pressed.showModal).not.toHaveBeenCalled();
+    expect(sent(pressed.reply)).toEqual({
+      content: 'You are no longer a member of that server: there is nothing to change there.',
+      flags: MessageFlags.Ephemeral,
+    });
+    const settings = loadSettings(TEST_SETTINGS_PATH);
+    const off = rocketDm({
+      config: {
+        ...createTestContext().ctx.config,
+        settings: { ...settings, features: { ...settings.features, notifications: false } },
+      },
+    });
+    expect(sent((await off.press()).reply)).toEqual({
+      content: 'Wants are switched off in that server: there is nothing to change.',
+      flags: MessageFlags.Ephemeral,
+    });
+    const none = rocketDm();
+    expect(sent((await none.press()).reply)).toEqual({
+      content: '**Team GO Rocket** is not on your list; `/want` adds it.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+});
diff --git a/src/components/dm.ts b/src/components/dm.ts
index a804f7755d4421ccff952698a837f72c56d44451..f21b9bef291d2e10002360f22b5146c257f5b18c 100644
--- a/src/components/dm.ts
+++ b/src/components/dm.ts
@@ -21,7 +21,14 @@ import { gymName } from '../render/raid-post.js';
 import { plain } from '../render/text.js';
 import { dialogName, scopeOf } from '../commands/notifications/want-boxes.js';
 import { notificationsEnabled } from '../commands/notifications/shared.js';
-import { NOT_A_MEMBER, WANTS_OFF, wantDialogFor } from '../commands/notifications/wants.js';
+import {
+  NOT_A_MEMBER,
+  WANTS_OFF,
+  rocketDialogOf,
+  rocketWhosOf,
+  wantDialogFor,
+} from '../commands/notifications/wants.js';
+import { TEAM_ROCKET } from '../commands/notifications/want-boxes.js';
 import { readInTime } from '../discord/dialog.js';
 import type { BoxSubject } from '../domain/pogo/want-boxes.js';
 import { dmMessages } from './dm-messages.js';
@@ -104,6 +111,22 @@ export function serverNameOf(
   return interaction.client.guilds.cache.get(guildId)?.name ?? 'that server';
 }
 
+/** Change… of Team GO Rocket (plan 8R-4, design 4b): its one dialog for the server, as `openChange`. */
+async function openRocketChange(
+  interaction: ButtonInteraction,
+  ctx: AppContext,
+  guildId: string,
+): Promise<void> {
+  const held = await readForChange(interaction, ctx, guildId, async () =>
+    rocketWhosOf(await ctx.targetWants.list(interaction.user.id, guildId)),
+  );
+  if (held.size === 0) {
+    throw new UserError('**Team GO Rocket** is not on your list; `/want` adds it.');
+  }
+  const server = { id: guildId, name: serverNameOf(interaction, guildId) };
+  await interaction.showModal(rocketDialogOf(held, { server, openedAt: Date.now() }));
+}
+
 /**
  * Change… (plan 8R-4, design 4, R15–R20): the dialog of a species, a form beyond the Which field
  * or a tier for the server of the button, with the member's rows as stored, read in time
@@ -173,6 +196,10 @@ export const dmControls: ComponentHandler = {
   throttle: MEMBER_WRITE_THROTTLE,
   async button(interaction, id, ctx) {
     if (id.action === CHANGE_ACTION) {
+      if (id.args.length === 1 && id.args[0] === TEAM_ROCKET && isSnowflake(id.id)) {
+        await openRocketChange(interaction, ctx, id.id);
+        return;
+      }
       const asked = parseStopArgs(id.args);
       if (asked?.kind !== 'subject' || !isSnowflake(id.id)) throw new UserError(STALE_COMPONENT);
       await openChange(interaction, ctx, id.id, asked.subject);
diff --git a/src/db/repositories/target-want-repository.ts b/src/db/repositories/target-want-repository.ts
index 3d69f75a454cacc9e0a4119422958ed1e217d18c..c2ba0c16ac1920fc8f42587035cdc7dde14e0162 100644
--- a/src/db/repositories/target-want-repository.ts
+++ b/src/db/repositories/target-want-repository.ts
@@ -38,13 +38,14 @@ export interface TargetWantStorage {
   /**
    * Adds and removes targets of a member in a server, in one transaction (what is there already
    * is not added twice, what is not there is no error). `at` is when, for a row that is made.
+   * Gives how many of those to remove were there (decided under the lock: plan 8R-4, B8).
    */
   change(
     memberId: string,
     guildId: string,
     change: { add: readonly TargetWant[]; remove: readonly TargetWant[] },
     at: number,
-  ): Promise<void>;
+  ): Promise<number>;
   /** Removes one target; false when the member had none. */
   remove(memberId: string, guildId: string, want: TargetWant): Promise<boolean>;
   /** Removes every row of the member in the server, unreadable ones too; gives how many went. */
@@ -125,11 +126,11 @@ export class TargetWantRepository implements TargetWantStorage {
     guildId: string,
     change: { add: readonly TargetWant[]; remove: readonly TargetWant[] },
     at: number,
-  ): Promise<void> {
-    if (change.add.length === 0 && change.remove.length === 0) return;
-    await this.locked(memberId, guildId, change.add.length > 0, async (trx, member) => {
-      if (!member) return;
-      await changeTargetWants(trx, member, change, at);
+  ): Promise<number> {
+    if (change.add.length === 0 && change.remove.length === 0) return 0;
+    return this.locked(memberId, guildId, change.add.length > 0, async (trx, member) => {
+      if (!member) return 0;
+      return changeTargetWants(trx, member, change, at);
     });
   }
 
@@ -198,25 +199,27 @@ function targetWantOfRow(row: { target: string; costumed: number }): TargetWant
  * Adds and removes a member's targets in a transaction that holds their row locked
  * (`withMemberLocked`): for the dialog of `/want`, which writes these with the member's
  * `PokemonNotification` rows in one transaction. A target there already is not made again, but
- * takes the `costumed` of its add (plan 8R-4).
+ * takes the `costumed` of its add (plan 8R-4). Gives how many of those to remove were there.
  */
 export async function changeTargetWants(
   trx: Kysely<DB>,
   member: MemberInGuild,
   change: { add: readonly TargetWant[]; remove: readonly TargetWant[] },
   at: number,
-): Promise<void> {
+): Promise<number> {
   const removed = change.remove.map(targetWantToken);
+  let gone = 0;
   if (removed.length > 0) {
-    await trx
+    const deleted = await trx
       .deleteFrom('TargetWant')
       .where('guildId', '=', member.guildId)
       .where('userId', '=', member.userId)
       .where('target', 'in', removed)
-      .execute();
+      .executeTakeFirst();
+    gone = Number(deleted.numDeletedRows);
   }
   const added = [...new Set(change.add.map(targetWantToken))];
-  if (added.length === 0) return;
+  if (added.length === 0) return gone;
   const costumedTokens = new Set(change.add.filter(isCostumedTarget).map(targetWantToken));
   // A target there already keeps its row and `createdAt` and takes the costume of its add (the
   // unique key), without a read first: one statement per costume, so mostly one. Not `insert
@@ -240,4 +243,5 @@ export async function changeTargetWants(
       .onDuplicateKeyUpdate({ costumed })
       .execute();
   }
+  return gone;
 }
diff --git a/src/render/notify-dm.ts b/src/render/notify-dm.ts
index c9430060fb4ee62c8ca7124e5298ee8b12d60623..9f5e7afe6280623baee56ed0641fc23cbbbfd214 100644
--- a/src/render/notify-dm.ts
+++ b/src/render/notify-dm.ts
@@ -7,7 +7,7 @@ import {
   type APIComponentInMessageActionRow,
   type APIMessageTopLevelComponent,
 } from 'discord.js';
-import { encodeCustomIdIfFits } from '../discord/custom-id.js';
+import { encodeCustomId, encodeCustomIdIfFits } from '../discord/custom-id.js';
 import type { V2Message } from '../discord/party-gateway.js';
 import { stopArgs, type NotifyReason } from '../domain/notify/reasons.js';
 import type { BoxSubject } from '../domain/pogo/want-boxes.js';
@@ -87,6 +87,14 @@ export function changeButtonId(guildId: string, subject: BoxSubject): string | u
   });
 }
 
+/**
+ * The custom id of Change… of Team GO Rocket in a server (plan 8R-4, design 4b):
+ * `dm:<server>:change:rocket`, which opens the one Rocket dialog for that server.
+ */
+export function rocketChangeButtonId(guildId: string): string {
+  return encodeCustomId({ kind: DM_KIND, id: guildId, action: CHANGE_ACTION, args: ['rocket'] });
+}
+
 /** A message's rows of controls as Discord's API has them. */
 export type ControlRows = APIActionRowComponent<APIComponentInMessageActionRow>[];
 
@@ -353,7 +361,7 @@ export interface ShownReason {
    * are one section, `Pikachu · Raids, Research`, with one button (F5), named by `group` (the
    * species') where their names differ (a form's want beside the species').
    */
-  change?: { customId: string | undefined; name: string; box: string; group?: string };
+  change?: { customId: string | undefined; name: string; box?: string; group?: string };
 }
 
 /** The reasons as the sections show them: those of one Change… together, in their order. */
@@ -364,13 +372,14 @@ function grouped(reasons: readonly ShownReason[]): ShownReason[] {
   for (const reason of reasons) {
     const id = reason.change?.customId;
     const known = id === undefined ? undefined : boxes.get(id);
+    const box = reason.change?.box;
     if (reason.change && known) {
-      if (!known.includes(reason.change.box)) known.push(reason.change.box);
+      if (box !== undefined && !known.includes(box)) known.push(box);
       names.get(id ?? '')?.add(reason.change.name);
       continue;
     }
     if (reason.change && id !== undefined) {
-      boxes.set(id, [reason.change.box]);
+      boxes.set(id, box === undefined ? [] : [box]);
       names.set(id, new Set([reason.change.name]));
     }
     shown.push(reason);
@@ -378,9 +387,12 @@ function grouped(reasons: readonly ShownReason[]): ShownReason[] {
   return shown.map((reason) => {
     if (!reason.change) return reason;
     const id = reason.change.customId;
-    const said = id === undefined ? [reason.change.box] : (boxes.get(id) ?? []);
-    const several = id !== undefined && (names.get(id)?.size ?? 0) > 1;
-    const name = several ? (reason.change.group ?? reason.change.name) : reason.change.name;
+    const own = reason.change.box === undefined ? [] : [reason.change.box];
+    const said = id === undefined ? own : (boxes.get(id) ?? []);
+    const all = id === undefined ? [reason.change.name] : [...(names.get(id) ?? [])];
+    // Reasons without a box (Team GO Rocket's) are named as they are, together.
+    if (said.length === 0) return { ...reason, label: all.join(', ') };
+    const name = all.length > 1 ? (reason.change.group ?? reason.change.name) : reason.change.name;
     return { ...reason, label: `${name} · ${said.join(', ')}` };
   });
 }
diff --git a/src/services/notify-service.rocket.test.ts b/src/services/notify-service.rocket.test.ts
index 3c0118d167c566fc557ee71de55576f2bb9953df..f67388e47fbfe7c63a095effd292d03f802d898b 100644
--- a/src/services/notify-service.rocket.test.ts
+++ b/src/services/notify-service.rocket.test.ts
@@ -1,6 +1,13 @@
 import { describe, expect, it } from 'vitest';
 import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
-import { dmBrief, dmReasons, dmSentence, linksOf, textOf } from '../../test/support/messages.js';
+import {
+  buttonsOf,
+  dmBrief,
+  dmReasons,
+  dmSentence,
+  linksOf,
+  textOf,
+} from '../../test/support/messages.js';
 import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
 import { feedChoice } from '../../test/support/rocket.js';
@@ -96,6 +103,10 @@ describe('NotifyService: Team GO Rocket is reported (plan 8R-2, design 7)', () =
       `The report goes away <t:${String(Math.floor(outcome.report.endsAt / 1_000))}:R>.`,
     ]);
     expect(dmReasons(message)).toEqual(['Water-type grunt']);
+    // Change… of Team GO Rocket's dialog, the reason named as before (plan 8R-4).
+    expect(buttonsOf(message).filter((button) => button.label === 'Change…')).toMatchObject([
+      { customId: `dm:${made.gateway.guildId}:change:rocket` },
+    ]);
     expect(linksOf(message)).toEqual([
       `Go to report ${postLink(made.gateway.guildId, WEST_CHANNEL, outcome.posted[0]?.messageId ?? '')}`,
     ]);
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index 3c944531a22cc955205dbe7c1124b2ec0facff87..e3d434ac46ea34912a1bfa23f2c74635d3a09cea 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -64,6 +64,7 @@ import type { Logger } from '../log.js';
 import {
   bossSetSentence,
   changeButtonId,
+  rocketChangeButtonId,
   mapLink,
   maxDmSentence,
   maxHourNote,
@@ -101,8 +102,8 @@ import type { StopReport } from '../domain/stops/report.js';
  * Change… of a reason (plan 8R-4, design 4): a want of a Pokémon in raids, spawns or as a shadow
  * (`p`, `ps`), a Pokémon's box of `TargetWant` (`rp`, `dx`, `gx`) and a tier's want (`t`, `ts`)
  * open the dialog of the species (a form beyond the Which field, an Unown letter, its own) or of
- * the tier; IV wants, items, Mega Energy, gym targets, Team GO Rocket (until its dialog) and the
- * settings keep Stop (undefined). The name says the want (`Costumed Pikachu`, made plain), the
+ * the tier, a Team GO Rocket target the one Rocket dialog; IV wants, items, Mega Energy, gym
+ * targets and the settings keep Stop (undefined). The name says the want (`Costumed Pikachu`, made plain), the
  * box what fired.
  */
 export function changeOf(
@@ -144,6 +145,11 @@ export function changeOf(
   }
   if (reason.kind === 'target') {
     const { want } = reason;
+    if (want.kind === 'rocket') {
+      // Team GO Rocket's one dialog (design 4b); the reason named as plan 8R-2 named it.
+      const name = plain(targetWantLabel(catalogue, want));
+      return { customId: rocketChangeButtonId(guildId), name };
+    }
     const boxes = { 'research-pokemon': 'Research', dynamax: 'Dynamax', gigantamax: 'Gigantamax' };
     if (want.kind !== 'research-pokemon' && want.kind !== 'dynamax' && want.kind !== 'gigantamax') {
       return undefined;
diff --git a/test/support/target-want-cases.ts b/test/support/target-want-cases.ts
index 80f1106a02405a563f7cf5356e0a073626454180..1556c1ba3d89c3a0951899ab6dea2022cbfcc54f 100644
--- a/test/support/target-want-cases.ts
+++ b/test/support/target-want-cases.ts
@@ -66,11 +66,17 @@ export function targetWantCases(made: () => Promise<TargetWantStorage>): void {
       { add: [DRATINI_RESEARCH, MACHAMP_DYNAMAX], remove: [] },
       WANTED_AT,
     );
-    await store.change(
-      ASH,
-      WANT_SERVER,
-      { add: [MACHAMP_GIGANTAMAX], remove: [MACHAMP_DYNAMAX, RARE_CANDY] },
-      WANTED_AT,
+    // It says how many of those to remove were there (plan 8R-4, B8).
+    expect(
+      await store.change(
+        ASH,
+        WANT_SERVER,
+        { add: [MACHAMP_GIGANTAMAX], remove: [MACHAMP_DYNAMAX, RARE_CANDY] },
+        WANTED_AT,
+      ),
+    ).toBe(1);
+    expect(await store.change(ASH, WANT_SERVER, { add: [], remove: [RARE_CANDY] }, WANTED_AT)).toBe(
+      0,
     );
     expect((await store.list(ASH, WANT_SERVER)).wants).toEqual([
       DRATINI_RESEARCH,
diff --git a/test/support/target-wants.ts b/test/support/target-wants.ts
index 62459ca4db2b993a37f29c492c5a68caa0d03da8..f8c4876f3590b8b515783779332e20c8988d281a 100644
--- a/test/support/target-wants.ts
+++ b/test/support/target-wants.ts
@@ -63,10 +63,12 @@ export class MemoryTargetWants implements TargetWantStorage {
     guildId: string,
     change: { add: readonly TargetWant[]; remove: readonly TargetWant[] },
     _at?: number,
-  ): Promise<void> {
+  ): Promise<number> {
     this.fail('change');
     const removed = new Set(change.remove.map(targetWantToken));
-    const kept = this.tokensOf(memberId, guildId).filter((token) => !removed.has(token));
+    const had = this.tokensOf(memberId, guildId);
+    const gone = had.filter((token) => removed.has(token)).length;
+    const kept = had.filter((token) => !removed.has(token));
     for (const token of removed) this.costumed.delete(`${guildId} ${memberId} ${token}`);
     for (const want of change.add) {
       const token = targetWantToken(want);
@@ -77,7 +79,7 @@ export class MemoryTargetWants implements TargetWantStorage {
       else this.costumed.delete(row);
     }
     this.set(memberId, guildId, kept);
-    return Promise.resolve();
+    return Promise.resolve(gone);
   }
 
   private set(memberId: string, guildId: string, tokens: string[]): void {
````

### Task 8: 8R-4 task 8: Costumed spawns from active events

Prototype commit: `6fee4447296b6c236629ca7430856184731f1515`

The global events of the events feed with spawns (community days and
spotlight hours from the feed, other events from the Spawns section of
their Leek Duck page, read while on and every six hours; only Leek Duck's
events pages, no redirects; the Wild Area and GO Fest only in their
Global edition, nothing with fixed UTC times); a spawn report of an entry
an event on lists costumed is costumed in the report, the DMs, /wild's
answer and the matching; /want's Costumes field for such a Pokémon.

**Files:**

```
 docs/architecture/notifications-and-dms.md              |    5 +-
 docs/architecture/testing.md                            |    2 +-
 docs/architecture/utilities.md                          |    2 +-
 src/app-context.ts                                      |    6 +
 src/app.ts                                              |   23 +
 src/commands/notifications/spawn-report.test.ts         |   18 +
 src/commands/notifications/spawn-report.ts              |    2 +-
 src/commands/notifications/want-boxes.ts                |   10 +-
 src/commands/notifications/wants.test.ts                |   19 +
 src/commands/notifications/wild.test.ts                 |   15 +
 src/domain/research/leekduck.test.ts                    |   33 +-
 src/domain/research/leekduck.ts                         |   27 +
 src/domain/time/spawn-events.test.ts                    |  212 ++++++++
 src/domain/time/spawn-events.ts                         |  158 ++++++
 src/render/spawn.ts                                     |   10 +-
 src/services/event-spawn-service.test.ts                |  202 +++++++
 src/services/event-spawn-service.ts                     |  209 ++++++++
 src/services/raid-event-service.test.ts                 |   59 ++
 src/services/raid-event-service.ts                      |   35 +-
 src/services/spawn-service.test.ts                      |   73 +++
 src/services/spawn-service.ts                           |   48 +-
 test/fixtures/leekduck-event-halloween-2026-part-1.html |    8 +
 test/fixtures/leekduck-event-spotlight-2026-11-05.html  |    6 +
 test/fixtures/scrapedduck-events-2026-10-22.json        | 1595 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/party-service.ts                           |    7 +-
 test/support/spawn-events.ts                            |   25 +
 test/support/test-context.ts                            |    2 +
 27 files changed, 2792 insertions(+), 19 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/notifications/spawn-report.test.ts src/commands/notifications/wants.test.ts src/commands/notifications/wild.test.ts src/domain/research/leekduck.test.ts src/domain/time/spawn-events.test.ts src/services/event-spawn-service.test.ts src/services/raid-event-service.test.ts src/services/spawn-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 6fee4447296b6c236629ca7430856184731f1515 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4 task 8: Costumed spawns from active events`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index abc14b1168a96d6a82ee15ae10be24eac83b54dc..506747054072698050f6519fd38311b2cd50de88 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -5,8 +5,8 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 ## Wants and gym targets
 
 - A want (`PokemonNotification`) is per member and server and is one of: a species (every form, megas included), one form (`form`, a catalogue key), the shadow raids of either (`shadow`; since plan 8R-2 shadow raids and Team GO Rocket catches, the Shadow box), a raid tier (raids only), perfect or zero IVs (spawns only); a mega is raids only. The columns are read and written only through the codec (`notification-target.ts`: `readNotification` gives the target and the scope in effect; a row it cannot read is skipped, counted and never deleted on its own) and the pure functions of `src/domain/pogo/wants.ts` (`readWants`, `planSetWant`, `rowsOfWant`: duplicate legacy rows are one want with the union of their scopes, two keys of one catalogue entry are one want, a row is rewritten only when its meaning changes). `ctx.wants` (`WantStorage`: `list`, `set`, `remove`, `removeAll`, `count`) is the repository; `MemoryWants` (`test/support/wants.ts`) is its twin and runs the same functions. `pokemonWantFits(catalogue, target, entry, shadowRaid)` says whether a want is for a boss or a spawn. Since plan 8R-1 a raid scope means raids only (no max battles), and the legacy `!wants` codec and the scope rules (`planSetWant`, `widerScope`) are unchanged.
-- **Costumed wants** (plan 8R-4, migration 030; design `2026-10-22-costume-form-wants-design.md`): `PokemonNotification.costumed` and `TargetWant.costumed` (tinyint, default 0) make a Pokémon's want costumed only, a property of the row like the scope, never part of its target, token, unique key or id (`Want.costumed?: true`, a Pokémon's `TargetWant.costumed?: true`; `boxTarget(kind, dex, form, costumed)`, `withCostume`, `isCostumedTarget`; a Stop or Remove takes the row whatever its costume). Rows of one target that disagree read as plain (`readWants`: plain wins, as the wider scope); `planSetWant(…, costumed)` rewrites a row whose costume differs; a `TargetWant` added again takes the costume of its add (an upsert per costume, `createdAt` kept). Every sighting carries `costumed` (`PokemonSighting`): a raid's boss as the list has it in the raid's tier (`ShownBoss.costumed`), a spawn as `SpawnNews.costumed` says, a research reward by `rewardCostumed` (its Leek Duck name and picture, worked out when read), a max boss and a Rocket catch never. `pokemonWantFits(…, costumed)` fits a costumed want only to a costumed sighting, under the entry the costume copies; a plain want fits either. The matchers (`raidWantsFiring`, `spawnWantsFiring`, `rocketShadowFiring`) give the wants themselves, so a reason carries `costumed` (`wantReason`) and the DM names it "Costumed Pikachu" (`wantTargetLabel(…, costumed)`, `pokemonWantName({ costumed })`: no "(every form)", "Costumed Corsola"), a target "Costumed Pikachu (research)" (`targetWantLabel`); members told of one event share a message only where their reasons read alike (`shownReasonKey`).
-- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy (a grunt type at most one DM an hour for each type; since plan 8R-4 every Rocket target, and `/want rocket`, opens **the Team GO Rocket dialog**, design 4b: `rocketDialog` in `want-dialog.ts`, "Team GO Rocket: what for?", Grunts a string select of the twenty fixed grunts, `rocketOptions` (18 types, "Grunts without a type", "Decoy grunt"), Leaders a checkbox group of Cliff, Arlo, Sierra, Any leader and Giovanni, Remove where any Rocket want is held; ticked as the member's Rocket rows are, plus the target picked; its Submit `wantbox:r:rset1:<flags>[:<server>][:l<page>]:~<token>` (the per-open token of plan 8X-F, left out by `readRocketDialogId`; one without it is `STALE_COMPONENT`), a version and no hash of the lineups, S12, `readRocketDialogId`; `writeRocket` writes what is picked and takes every other Rocket target off in one `TargetWantStorage.change` under the member's lock, nothing picked or Remove takes them all off (`change` gives how many of those to remove were there, so that a first want with nothing picked, decided under the lock, says "Nothing picked: no Team GO Rocket wants.", B8), and "Any leader" beside named leaders is said to cover them; `opensDialog` is true for every Rocket use, F13; `/unwant`'s "Team GO Rocket" (`rocket`, `TEAM_ROCKET`, also typed `team go rocket`) takes every Rocket row off while a single target typed stays one; `/wants` has one line "Team GO Rocket: Fire and Water grunts, Arlo, Giovanni", over three types "7 grunt types", `rocketLine`, with Change… `wantlist:<p>:change:rocket`; a DM's Rocket reason keeps its 8R-2 label with Change… `dm:<server>:change:rocket`, `rocketChangeButtonId`, which opens the dialog for that server). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. **The Pokémon dialog of plan 8R-4** (design 3, the mockups of 2026-10-22; `wantDialog` / `WantDialogView` in `src/commands/notifications/want-dialog.ts`, `wantDialogFor` in `wants.ts`): the title by the species' name ("Corsola: what for?", `dialogName`), one text, then at most four fields, a dialog's five components being Discord's limit (every other sentence goes into the one text: the mega note "A mega is told for raids only.", "Your Ponyta wants differ by form; Submit sets them alike."; Charizard's is the largest, a test builds it): **Tell me about** (`boxes`, two boxes or more; their descriptions, `BOX_DESCRIPTIONS` with `{name}`, only without a Which field; Research no longer for a legendary, mythical or ultra beast unless today's task list rewards it or the member holds it, `shownBoxes` / `dialogBoxes`), **Which <species>** (`forms`, `whichEntries`: a species of 2 to `WHICH_CAP` 25 entries, megas included, by their catalogue names; a checkbox group to ten, a string select above; none for Unown, whose letters are dialogs of their own, `wantbox:p201:…:unown_a`), **Costumes** (`costumed`, one `ComponentType.Checkbox` under a Label `Only costumed <species>` / `Only costumed ones`, shown where the game data has a costume of any of its forms or the raid boss list or today's task list has it costumed now, `costumesShown`, or where a row held is costumed, A1: a Submit never drops a costume unseen; not shown, each row keeps its own) and **Remove** (`remove`, one Checkbox, `Remove <species> from my list`, where the member holds a want of it; it wins over everything). With one box and none of Which and Costumes it writes at once, a costumed row held staying costumed and the answer saying so in small print, "Only costumed ones are told: Change… in `/wants` can untick Only costumed." (F3; `asksAbout`, decided synchronously for the deferral, S1: Mew; what a use is about, `WantUse`, is read once per interaction, `useOf`, so the deferral and `execute` decide alike, A8); with one box and a Which field (Arceus) there is no Tell me about field and the text says what it is told for. A first want opens with no box ticked and every form ticked (a form picked from the list alone: `/want galarian corsola`, `/want mega charizard y`, `dialogSubject`), Costumed off, and its Tell me about and Which fields required (`required: true`, `min_values` 1: Discord lets no Submit through till a box and a form are ticked; Matt's R-M2, no "All" option), a tier's dialog alike; with wants, as stored (a box ticked where any row has it, Costumed only where every row but the megas is, `allCostumed`, the picked form added; the rows that differ leave a mega's out, A3), and the fields not required, so that nothing ticked still takes the want off (Q1). **In the post of a raid or a max battle** (Matt's R-M1; `postSubject` and `postBoxOf` in `wants.ts`, the party read from the post's id in memory by `partyOf`, so `opensDialog` stays synchronous and `showModal` the first answer): `/want` with nothing typed (the option is not required) is the boss (a form of a species with several picked in its species' dialog), an egg its tier; a boss the game data does not know is refused (Matt's Q1, F1: a raid's "Pine doesn't know this raid's boss yet: name a Pokémon, or `/want t5` for the tier.", the tier its own; a max battle's "Pine doesn't know this battle's boss yet: name a Pokémon."); the dialog ticks only the post's kind of battle for a first want (a raid's Raids, a shadow raid's Shadow, a tier's Raids or Shadow raids, a max battle's Dynamax or Gigantamax), also for a Pokémon typed there, and beside the rows held for a want held. Anywhere else nothing typed is a `UserError` (`NAME_A_POKEMON`: "Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it out for its boss."; an ended raid's post is out of the store, so as any other). These refusals and a name it cannot read come from the guard `readsUse` (it reads the use, `useOf`), so they do not count against the throttle (F2). The Submit (`answerOfSubmit`, `readWantSubmit`: a Which field read as its forms, every form ticked as the species row; a missing field or another Which hash is `STALE_COMPONENT`) writes through `WantBoxStorage.set`, and the answer names the want as `/wants` does (`rowsLabel`: "Costumed Pikachu", "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above three by count) with its boxes, in small print where Costumed meets a box no costumed Pokémon has appeared in (`NEVER_COSTUMED_YET`: Dynamax, Gigantamax, Shadow; a warning, never a refusal) and where a mega ticked without Raids is off. `/unwant` of a form whose species row covers it (`coveringSpecies`, review R4e) removes nothing and says so. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (since plan 8R-4 `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>][:<form>][:l<page>]:~<token>`, a tier `wantbox:t<level>:set2:…`; `src/commands/notifications/want-dialog.ts`, `wantDialogId` / `readWantDialogId`: `<mask>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `<flags>` whether it showed Costumes (1) and Remove (2), `<which>` `whichHash` of the keys its Which field showed, `0` for none (`NO_WHICH`), the server where it was opened from a DM, the form only beyond the Which field (an Unown letter), the page of `/wants`, last `openToken` of when it opened (plan 8X-F: Discord's client shows what was last submitted under an id in place of what the dialog ticks), which `readWantDialogId` leaves out; an id of before (`set`) or of any other shape, one without its token, and a Which hash that is not the field's now, are `STALE_COMPONENT`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock; nothing ticked takes the target off. **One answer per species** (plan 8R-4, design 3; `src/domain/pogo/species-answer.ts`): an answer (`BoxAnswer`: the forms that stand, `undefined` the subject's own row, of a species the species row; the boxes ticked of those shown; costumed; Remove) covers a scope (`AnswerScope`, `scopeOf`: a species is `wide`, every row of its Pokédex number in both tables, `PokemonNotification.pokemon = <dex>` and `TargetWant.target` `<kind>:<dex>` exactly or `<kind>:<dex>:%`, so 25 never reads 251; a species with more entries than the Which field holds, `WHICH_CAP` 25, Unown, is not: its species row and each letter are answers of their own; a tier is its own). `WantBoxStorage.held(member, server, scope)` gives the rows by form (`HeldRow`: its boxes, costumed when every row of it is; `heldRows`), `set(member, server, answer, at)` carries out `planAnswer`: Remove, no form or no box shown ticked takes every row of the scope away, the boxes the dialog did not show included (A2, Q1); every form ticked gets the boxes ticked of those shown and keeps the others as its row had them (a new row: as the scope's rows had them together), all with the answer's costume (`costumed` undefined where the dialog did not show Costumes: each row keeps its own, a new row costumed where every row held is, `allCostumed`, A1); a mega a raid row and nothing else, always plain, nothing without Raids (review R4c, A-D3; `FormReader`'s `mega`); every other row goes; in one transaction under the member's lock (`WantBoxRepository`, twin `MemoryWantBoxes`, both `wantBoxCases`). `removalAnswer(scope)` is `/unwant`'s and a list's Remove. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"; since plan 8R-4 one line per species, `wantEntries`: its forms named together up to three, "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above that by count, "Vivillon (4 of 21 forms)", `Costumed` before it where every row is, an Unown letter a line of its own; in the order Pokémon by species name, tiers in tier order as "Tier 5 raids" (Matt's R-M4: on the list alone, `WantEntry.listLabel`; `/unwant`'s choices and answers keep "T5 raids"), Team GO Rocket, then the lines without a dialog: items and Mega Energy by name as "Rare Candy: Research", "Perfect IVs: Spawns", "Zero IVs: Spawns"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
+- **Costumed wants** (plan 8R-4, migration 030; design `2026-10-22-costume-form-wants-design.md`): `PokemonNotification.costumed` and `TargetWant.costumed` (tinyint, default 0) make a Pokémon's want costumed only, a property of the row like the scope, never part of its target, token, unique key or id (`Want.costumed?: true`, a Pokémon's `TargetWant.costumed?: true`; `boxTarget(kind, dex, form, costumed)`, `withCostume`, `isCostumedTarget`; a Stop or Remove takes the row whatever its costume). Rows of one target that disagree read as plain (`readWants`: plain wins, as the wider scope); `planSetWant(…, costumed)` rewrites a row whose costume differs; a `TargetWant` added again takes the costume of its add (an upsert per costume, `createdAt` kept). Every sighting carries `costumed` (`PokemonSighting`): a raid's boss as the list has it in the raid's tier (`ShownBoss.costumed`), a spawn as `SpawnNews.costumed` says (an event on lists it costumed, "Spawn reports"), a research reward by `rewardCostumed` (its Leek Duck name and picture, worked out when read), a max boss and a Rocket catch never. `pokemonWantFits(…, costumed)` fits a costumed want only to a costumed sighting, under the entry the costume copies; a plain want fits either. The matchers (`raidWantsFiring`, `spawnWantsFiring`, `rocketShadowFiring`) give the wants themselves, so a reason carries `costumed` (`wantReason`) and the DM names it "Costumed Pikachu" (`wantTargetLabel(…, costumed)`, `pokemonWantName({ costumed })`: no "(every form)", "Costumed Corsola"), a target "Costumed Pikachu (research)" (`targetWantLabel`); members told of one event share a message only where their reasons read alike (`shownReasonKey`).
+- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy (a grunt type at most one DM an hour for each type; since plan 8R-4 every Rocket target, and `/want rocket`, opens **the Team GO Rocket dialog**, design 4b: `rocketDialog` in `want-dialog.ts`, "Team GO Rocket: what for?", Grunts a string select of the twenty fixed grunts, `rocketOptions` (18 types, "Grunts without a type", "Decoy grunt"), Leaders a checkbox group of Cliff, Arlo, Sierra, Any leader and Giovanni, Remove where any Rocket want is held; ticked as the member's Rocket rows are, plus the target picked; its Submit `wantbox:r:rset1:<flags>[:<server>][:l<page>]:~<token>` (the per-open token of plan 8X-F, left out by `readRocketDialogId`; one without it is `STALE_COMPONENT`), a version and no hash of the lineups, S12, `readRocketDialogId`; `writeRocket` writes what is picked and takes every other Rocket target off in one `TargetWantStorage.change` under the member's lock, nothing picked or Remove takes them all off (`change` gives how many of those to remove were there, so that a first want with nothing picked, decided under the lock, says "Nothing picked: no Team GO Rocket wants.", B8), and "Any leader" beside named leaders is said to cover them; `opensDialog` is true for every Rocket use, F13; `/unwant`'s "Team GO Rocket" (`rocket`, `TEAM_ROCKET`, also typed `team go rocket`) takes every Rocket row off while a single target typed stays one; `/wants` has one line "Team GO Rocket: Fire and Water grunts, Arlo, Giovanni", over three types "7 grunt types", `rocketLine`, with Change… `wantlist:<p>:change:rocket`; a DM's Rocket reason keeps its 8R-2 label with Change… `dm:<server>:change:rocket`, `rocketChangeButtonId`, which opens the dialog for that server). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. **The Pokémon dialog of plan 8R-4** (design 3, the mockups of 2026-10-22; `wantDialog` / `WantDialogView` in `src/commands/notifications/want-dialog.ts`, `wantDialogFor` in `wants.ts`): the title by the species' name ("Corsola: what for?", `dialogName`), one text, then at most four fields, a dialog's five components being Discord's limit (every other sentence goes into the one text: the mega note "A mega is told for raids only.", "Your Ponyta wants differ by form; Submit sets them alike."; Charizard's is the largest, a test builds it): **Tell me about** (`boxes`, two boxes or more; their descriptions, `BOX_DESCRIPTIONS` with `{name}`, only without a Which field; Research no longer for a legendary, mythical or ultra beast unless today's task list rewards it or the member holds it, `shownBoxes` / `dialogBoxes`), **Which <species>** (`forms`, `whichEntries`: a species of 2 to `WHICH_CAP` 25 entries, megas included, by their catalogue names; a checkbox group to ten, a string select above; none for Unown, whose letters are dialogs of their own, `wantbox:p201:…:unown_a`), **Costumes** (`costumed`, one `ComponentType.Checkbox` under a Label `Only costumed <species>` / `Only costumed ones`, shown where the game data has a costume of any of its forms or the raid boss list, today's task list or an event on has it costumed now, `costumesShown`, or where a row held is costumed, A1: a Submit never drops a costume unseen; not shown, each row keeps its own) and **Remove** (`remove`, one Checkbox, `Remove <species> from my list`, where the member holds a want of it; it wins over everything). With one box and none of Which and Costumes it writes at once, a costumed row held staying costumed and the answer saying so in small print, "Only costumed ones are told: Change… in `/wants` can untick Only costumed." (F3; `asksAbout`, decided synchronously for the deferral, S1: Mew; what a use is about, `WantUse`, is read once per interaction, `useOf`, so the deferral and `execute` decide alike, A8); with one box and a Which field (Arceus) there is no Tell me about field and the text says what it is told for. A first want opens with no box ticked and every form ticked (a form picked from the list alone: `/want galarian corsola`, `/want mega charizard y`, `dialogSubject`), Costumed off, and its Tell me about and Which fields required (`required: true`, `min_values` 1: Discord lets no Submit through till a box and a form are ticked; Matt's R-M2, no "All" option), a tier's dialog alike; with wants, as stored (a box ticked where any row has it, Costumed only where every row but the megas is, `allCostumed`, the picked form added; the rows that differ leave a mega's out, A3), and the fields not required, so that nothing ticked still takes the want off (Q1). **In the post of a raid or a max battle** (Matt's R-M1; `postSubject` and `postBoxOf` in `wants.ts`, the party read from the post's id in memory by `partyOf`, so `opensDialog` stays synchronous and `showModal` the first answer): `/want` with nothing typed (the option is not required) is the boss (a form of a species with several picked in its species' dialog), an egg its tier; a boss the game data does not know is refused (Matt's Q1, F1: a raid's "Pine doesn't know this raid's boss yet: name a Pokémon, or `/want t5` for the tier.", the tier its own; a max battle's "Pine doesn't know this battle's boss yet: name a Pokémon."); the dialog ticks only the post's kind of battle for a first want (a raid's Raids, a shadow raid's Shadow, a tier's Raids or Shadow raids, a max battle's Dynamax or Gigantamax), also for a Pokémon typed there, and beside the rows held for a want held. Anywhere else nothing typed is a `UserError` (`NAME_A_POKEMON`: "Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it out for its boss."; an ended raid's post is out of the store, so as any other). These refusals and a name it cannot read come from the guard `readsUse` (it reads the use, `useOf`), so they do not count against the throttle (F2). The Submit (`answerOfSubmit`, `readWantSubmit`: a Which field read as its forms, every form ticked as the species row; a missing field or another Which hash is `STALE_COMPONENT`) writes through `WantBoxStorage.set`, and the answer names the want as `/wants` does (`rowsLabel`: "Costumed Pikachu", "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above three by count) with its boxes, in small print where Costumed meets a box no costumed Pokémon has appeared in (`NEVER_COSTUMED_YET`: Dynamax, Gigantamax, Shadow; a warning, never a refusal) and where a mega ticked without Raids is off. `/unwant` of a form whose species row covers it (`coveringSpecies`, review R4e) removes nothing and says so. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (since plan 8R-4 `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>][:<form>][:l<page>]:~<token>`, a tier `wantbox:t<level>:set2:…`; `src/commands/notifications/want-dialog.ts`, `wantDialogId` / `readWantDialogId`: `<mask>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `<flags>` whether it showed Costumes (1) and Remove (2), `<which>` `whichHash` of the keys its Which field showed, `0` for none (`NO_WHICH`), the server where it was opened from a DM, the form only beyond the Which field (an Unown letter), the page of `/wants`, last `openToken` of when it opened (plan 8X-F: Discord's client shows what was last submitted under an id in place of what the dialog ticks), which `readWantDialogId` leaves out; an id of before (`set`) or of any other shape, one without its token, and a Which hash that is not the field's now, are `STALE_COMPONENT`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock; nothing ticked takes the target off. **One answer per species** (plan 8R-4, design 3; `src/domain/pogo/species-answer.ts`): an answer (`BoxAnswer`: the forms that stand, `undefined` the subject's own row, of a species the species row; the boxes ticked of those shown; costumed; Remove) covers a scope (`AnswerScope`, `scopeOf`: a species is `wide`, every row of its Pokédex number in both tables, `PokemonNotification.pokemon = <dex>` and `TargetWant.target` `<kind>:<dex>` exactly or `<kind>:<dex>:%`, so 25 never reads 251; a species with more entries than the Which field holds, `WHICH_CAP` 25, Unown, is not: its species row and each letter are answers of their own; a tier is its own). `WantBoxStorage.held(member, server, scope)` gives the rows by form (`HeldRow`: its boxes, costumed when every row of it is; `heldRows`), `set(member, server, answer, at)` carries out `planAnswer`: Remove, no form or no box shown ticked takes every row of the scope away, the boxes the dialog did not show included (A2, Q1); every form ticked gets the boxes ticked of those shown and keeps the others as its row had them (a new row: as the scope's rows had them together), all with the answer's costume (`costumed` undefined where the dialog did not show Costumes: each row keeps its own, a new row costumed where every row held is, `allCostumed`, A1); a mega a raid row and nothing else, always plain, nothing without Raids (review R4c, A-D3; `FormReader`'s `mega`); every other row goes; in one transaction under the member's lock (`WantBoxRepository`, twin `MemoryWantBoxes`, both `wantBoxCases`). `removalAnswer(scope)` is `/unwant`'s and a list's Remove. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"; since plan 8R-4 one line per species, `wantEntries`: its forms named together up to three, "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above that by count, "Vivillon (4 of 21 forms)", `Costumed` before it where every row is, an Unown letter a line of its own; in the order Pokémon by species name, tiers in tier order as "Tier 5 raids" (Matt's R-M4: on the list alone, `WantEntry.listLabel`; `/unwant`'s choices and answers keep "T5 raids"), Team GO Rocket, then the lines without a dialog: items and Mega Energy by name as "Rare Candy: Research", "Perfect IVs: Spawns", "Zero IVs: Spawns"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
 - What a member picked in the `target` option of `/want` or `/unwant` is a want token (`wantToken` / `parseWantToken`: `pokemon:<dex>[:<form>][:shadow]`, `tier:<level>[:shadow]`, `iv:perfect|zero`): the value of an autocomplete choice, never part of a custom id. Text sent without picking never guesses (`readWantText`): it acts only when it is a tier or IV word in full (`wantWord`), exactly a species' name (every form) or exactly one form's own name, with `shadow` before either; anything else is refused with suggestions. A bare number is a tier or IV word, never a Pokédex number.
 - Wants are named in one way everywhere (`wantLabel` / `wantName` in `src/commands/notifications/want-input.ts`): "X (every form)" for a species with several entries, "X (base form)" for its plain entry, "Shadow X", and the scope after " · " in the choices of `/unwant`.
 - Gym targets (`GymNotification`; `gym` holds a gym id as text) are `ctx.gymTargets` (`GymTargetStorage`), with `MemoryGymTargets` as the twin. In code "target" alone is what a want is for; a gym a member wants raids of is a gym target.
@@ -26,5 +26,6 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 ## Spawn reports
 
 - A spawn report is `ctx.spawns.report(...)` (`SpawnService`), reached by `/wild` and by the live map (plan 8M-4S; `web.md`, "Spawns on the map") through one code path: `readSpawn` (`wild.ts`: the Pokémon and the details, as the command's guard and handler read them) and `reportSpawnAs` (`spawn-report.ts`: the report, the command's words, a report's link and a channel named by the caller's `SpawnNames`); a map report's point is its `near`, a pin (`PlaceFinder.pin`). The report is a components-v2 message in the region's text channel (`spawnMessage`: `### Wild X`, the IVs and the reporter, when it goes away, the picture beside them; `**Where**`; `SPAWN_CAUTION` and the footer in small print; plan 8B-1), classic text where the bot may not post embeds (`spawnTextMessage`, with the legacy warning); a message Discord refuses with Invalid Form Body is sent once more without its picture (the Unown copy too), and the DM says when the report goes away as the report does (`SpawnNews.goneAt`); deleted after `SPAWN_MINUTES`, also posted in the Unown channel where there is one (`sightingMessage`: the same container headed by the sentence that names the region, which stays). Every report that stands is a row of `SpawnReport` (`SpawnReportStorage`; twin `MemorySpawnReports`) until it is deleted, and `sweep()` (with the hourly upkeep of `PartyScheduler`, also at start) deletes what no process deleted at its time and gives a report up a day after it. Every report is told to who wants it; a member may make five in half an hour (`WILD_THROTTLE`; Matt, 2026-10-13). `details` (where it is) is required. What never appears in the wild is refused with a sentence and not offered (`appearsInWild`, `src/domain/pogo/wild.ts`): legendaries, mythicals, ultra beasts, megas and primals, except the species of `settings.wildSpawnExceptions` (default the lake trio; the Galarian birds stay refused while they come only from a Daily Adventure Incense), read once per catalogue by `wildExceptionsOf(ctx)`. Unown is an ordinary species; `UnownWantService.noticed(interaction)` gives a holder of the old role a spawn want once (table `UnownWantGift`).
+- **Costumed spawns** (plan 8R-4, design 5, F11): a report is costumed when an event on at its moment lists that very entry costumed (`costumedSpawn`, `src/domain/time/spawn-events.ts`: the species' entry for a species, the form's for a form; listed plain and costumed both, costumed). The events are the global ones of ScrapedDuck's feed with spawns (`parseSpawnEventFeed`, read by `RaidEventService` with the research flags and kept in memory, `spawnEvents()`, `SpawnEventProvider`; one on now that a read drops is kept while it lasts): a community day's spawns (`extraData.communityday.spawns`) and a spotlight hour's (`extraData.spotlight.list`) from the feed, any other event the feed marks `generic.hasSpawns` from the Spawns section of its Leek Duck page (`parseEventSpawns`, `src/domain/research/leekduck.ts`). Only the types of an allowlist (`SPAWN_EVENT_TYPES`, Matt's R-M5 and Q2): `event`, `community-day`, `pokemon-spotlight-hour`, `pokemon-go-tour`, and the Global Wild Area and Global GO Fest (`wild-area` and `pokemon-go-fest`, `GLOBAL_ONLY`, whose feed name says Global, `GLOBAL_EDITION`: the feed has nothing firmer; a city's has `Z` times too, and the Global one must have none); never a city's Wild Area or GO Fest, a City Safari (location-bound), a season, a type the feed adds later, an event at fixed times of a zone of its own (`Z`: Pokémon Night Out), nor anything without hours or longer than 31 days. A page gives at most 100 Pokémon (B4); Leek Duck's free-text sentences ("you might also encounter X wearing …") are not read (B-D2, a follow-up). `EventSpawnService` (`src/services/event-spawn-service.ts`, `ctx.eventSpawns`, `EventSpawnProvider.sightingsAt(at)`: the listed Pokémon placed by `costumedSighting`) reads an event's page while it is on, again every six hours (`REREAD_MS`), with Pine's User-Agent and `readLimitedText`, only Leek Duck's events pages (`isEventPage`; another address is skipped and said once; never followed to another address, `redirect: 'error'`, and refused where the answer's `url` is no events page, B3), keeping the spawns of the last good read by event in a `BoundedMap`; a page never read gives none. It looks again at the next start of an event, at the latest in an hour (`nextReadIn`); `app.ts` starts it after the first read of the events feed and stops it at shutdown. `SpawnService` asks it at the report's moment (`costumes`; one that throws is logged and the report goes out plain): `SpawnView.costumed` ("### Wild costumed Pikachu", "A wild costumed **Pikachu**" in DMs), `SpawnNews.costumed` for the matchers, and the posted outcome's `costumed` for `/wild`'s and the map's answer ("Reported: a wild costumed Pikachu"). `/want`'s Costumes field shows for a Pokémon an event on lists costumed (`costumesShown`, review R7).
 - `/wild near:` (plan 8W-2) names a gym, PokéStop or power spot of the server's regions: the option's autocomplete is `ctx.placeFinder` (`nearChoices`: `placeLabel` "Fountain Square (PokéStop) · Market Street", the title cut and never where it is; the member's region first), resolved in the command's guard so that a refusal does not count (`namedPlace`, `src/commands/place-option.ts`: a value whose place is gone or of another kind now is `PLACE_GONE` "That place is gone from the list; pick it again.", one outside the regions `NOT_HERE`; typed text only on `clearOf` of the one search, the one hit of every word; resolved once per interaction (plan 8W-3: `resolvedPlaces`, a `WeakMap` by the interaction, so that the command takes what its guard found, one search in all), else "Which place is …?" with five suggestions); `details` stays required. A maps link or coordinates typed there are a pin (plan 8D, Matt, 2026-10-17; the option takes `MAX_PLACE_TEXT` 1,500 characters for long links, and its autocomplete offers nothing for one): `readPin` (`src/domain/geo/pin-input.ts`, pure, over `readLocation`: coordinates, `geo:` with a phone's label, Google Maps with the place's pin before the map's centre and `/place/<name>/` as `linkName`, Apple Maps `ll`, `coordinate`, `q` with coordinates, `sll` only on a map that asks for nothing (a search near a point, `q=coffee&sll=…`, is `no-point`, as Google’s search link), OpenStreetMap `mlat`/`mlon`, `#map=`) and `PlaceFinder.pin` (refused outside the server's regions, `PIN_NOT_HERE`; named by the nearest gym, PokéStop or power spot within 50 m); a short link (`maps.app.goo.gl`, `goo.gl/maps`, Apple's `maps.apple/p/…`, OpenStreetMap's `osm.org/go/…`) is refused with `SHORT_LINK` and never followed, a link of a maps site that shows no one place (a search, a Street View, `geo:0,0?q=<address>`) with `NO_POINT`, numbers that are no place with `NO_PLACE_ON_EARTH`; the autocomplete offers nothing for any of them. A pin is named by the nearest of the server's gyms (by its nickname, as its post) and of the kept PokéStops and power spots in the server's regions with a title. The option's helpers are `src/commands/place-option.ts` (`namedPlace`, `nearChoices`, `placeLabel`, `placeWords`), shared with `/meetup`. The report carries the place as a snapshot, `SpawnReport.near` (`SpawnPlace`, which is `Place`: never looked up again, the report is short-lived; a pin is `pinLine` without a label, `📍 Near **X** (PokéStop) · [Map](<…>)`, `📍 **<link's name>**` or `📍 Dropped pin`, without a picture): `nearLine` ("Near **<title>** (PokéStop) · <address> · [Map](<…>)": the address a gym's `addressLine`, a Wayspot's `wayspotAddressLine` (`wayfarer-address.ts`: as a gym made of it would show it, never the town, postal code and country Wayfarer repeats), "(no address available)" for none where the place's picture stands beside the line, so that the picture never sits beside a bare name (plan 8W-3: without the picture, in a DM's brief, a report sent again without pictures or the classic text, the address is left out; the moderators' post of a meetup request, `meetup-safety.ts`, words it by its own picture the same way); title and address through `plainNoLinks`) after the details under **Where**, with the place's picture beside them where `wayspotPicture` allows (the Pokémon's beside the head), in the sighting, the text report and the DM's brief alike; a message Discord refuses is sent once more without either picture.
 - Text a member typed that reaches other members' DMs or a spawn report goes through `plainNoLinks` (`src/render/text.ts`), which also breaks bare addresses; a member's name is always shown through it. `plain()` leaves an address alone (a meetup's description may link).
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 999e4a48262bc946353bc6a34cd0564e0cd6890c..d3fda4dd2baf5c9dd6ccceeddad60cc99b7b2883 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -58,7 +58,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 - Each repository of `stop-reports.md` and its twin run one set of cases: `stopReportCases` (`test/support/stop-report-cases.ts`, with `reportedStop(n, overrides)` (Yellow Mural `n` at 40.44…, −79.99: outside the invented regions, so a test that needs a region moves it, as `west(n)` in `stop-posts.test.ts`), `researchReport()`, `REPORT_NOW`, `REPORT_SERVER`, `DRATINI`), `pineStopCases` (`newPineStop()`), `researchEventCases`, `researchTaskCases` and `stopPostCases` (`test/support/research-store-cases.ts`, with `INTO_THE_WILD`, `PAWNIARD_DAY`, `listedTask()`; twins `MemoryResearchEvents`, `MemoryResearchTasks`, `MemoryStopPosts` in `test/support/research-store.ts`), `targetWantCases` (its constants of every kind of target), `wantBoxCases`.
 - The kept max and big events (plan 8X-F, `utilities.md`): `maxEventCases` (`test/support/max-event-store-cases.ts`, with `feedMaxEvents()` and `feedBigEvents()`, those of the recorded feed) run on `MaxEventRepository` and its twin `MemoryMaxEvents` (`test/support/max-event-store.ts`, `failing` per method).
-- The task list: `readResearchPage()` (Leek Duck's page of 2026-10-21, `test/fixtures/leekduck-research.html`, unchanged: 58 tasks, 299 rewards), `researchTasksOfPage()` (parsed once, frozen), `pageTask(text)` and `researchTasksFixture(tasks?, readAt?, staleAfterHours?)` (`test/support/research.ts`, a `ResearchTaskProvider`, `readAt` `null` for a list never read, out of date `staleAfterHours` (6) after `readAt`, `ctx.researchTasks` of `createTestContext()`). Research events: `raidEventsFixture(zone, { research })`; the events feed fixture `test/fixtures/max-events.json` holds the two research events of November 2026.
+- The task list: `readResearchPage()` (Leek Duck's page of 2026-10-21, `test/fixtures/leekduck-research.html`, unchanged: 58 tasks, 299 rewards), `researchTasksOfPage()` (parsed once, frozen), `pageTask(text)` and `researchTasksFixture(tasks?, readAt?, staleAfterHours?)` (`test/support/research.ts`, a `ResearchTaskProvider`, `readAt` `null` for a list never read, out of date `staleAfterHours` (6) after `readAt`, `ctx.researchTasks` of `createTestContext()`). Events with spawns (plan 8R-4): `readSpawnEventFeed()` (ScrapedDuck's whole `events.json` of 2026-10-22, `test/fixtures/scrapedduck-events-2026-10-22.json`) and `readEventPage(file)` (Leek Duck's Halloween 2026 Part I and Teddiursa Spotlight Hour pages, cut to the sections read), `test/support/spawn-events.ts`; `createTestContext()` gives `ctx.eventSpawns` with no spawns, and `partyServiceWith([], { spawnCostumes })` a `SpawnService` that asks `spawnCostumes.sightingsAt`. Research events: `raidEventsFixture(zone, { research })`; the events feed fixture `test/fixtures/max-events.json` holds the two research events of November 2026.
 - `createTestContext()` gives `ctx.stopReports` (a `StopReportService` over `MemoryStopReports` and the context's events), `ctx.pineStops` (none, over memory and the context's Wayspots), `ctx.targetWants` and `ctx.wantBoxes` (`MemoryWantBoxes` over the context's wants and target wants); `partyServiceWith()` gives `targetWants` to the notifier (`made.targetWants`), and `notifying.researchPosts` a test's own links (`notify-service.research.test.ts`).
 - `FakePartyGateway` pins (`pinMessage` / `unpinMessage`): `noPinning` (channels where it is `not-allowed`), `pinLimit`, `pinNotices` (the notices it deleted), `pinnedIn(channelId)`.
 - Team GO Rocket (plan 8R-2): `readRocketFeed()` (ScrapedDuck's `rocketLineups.min.json` of 2026-10-22, `test/fixtures/rocket-lineups.json`, unchanged: 26 lineups, 24 choices), `rocketChoicesOfFeed()` (parsed once, frozen), `feedChoice(key)` and `rocketLineupsFixture(choices?, readAt?, staleAfterHours?)` (`test/support/rocket.ts`, a `RocketLineupProvider`, `readAt` and `staleAfterHours` (24) as the task list's, `ctx.rocketLineups` of `createTestContext()`; `[]` is a list never read). `rocketReport(overrides)` and `MUDKIP` (`stop-report-cases.ts`, a Water-type grunt at stop 1 for half an hour) beside `researchReport`; `rocketLineupCases` (`listedChoice`) and `gruntMessageCases` (`gruntRow`) in `test/support/rocket-store-cases.ts`, twins `MemoryRocketLineups`, `MemoryGruntMessages` (`failing` per method). `createTestContext()` gives `ctx.rocket` (a `RocketService` over the context's reports that posts no message, as in rehearsal mode); a test of grunts' messages passes its own over a `GruntMessageService` on a `FakePartyGateway` (`rocket.test.ts`, `rocket-reports.test.ts`), with `setTimer` to keep or fire the deletes by hand.
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index e4269f90ebfdc7bc4a499d2c55ebd88864b55185..913f24c50b8e810543914c95295cf3c177be81ef 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -26,7 +26,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 - Max battle tiers are `MaxTier` (`D1` to `D5`, `G`; `src/domain/pogo/max-tier.ts`), the one spelling in the domain, the state document, `RaidBoss.level` and the history; `BattleKind` (`raid`, `dynamax`, `gigantamax`, `battleKindOf(tier)`) is only for lobby sizes and train kinds; their words are there too (`maxTierLabel` "Dynamax 2★", `maxBossTitle` "Dynamax Machamp (2★)", `maxBossChoiceName` "Machamp · Dynamax 2★" / "Gigantamax Machamp").
 - Max bosses come from `ctx.maxBosses` (`bosses()`: the list in effect, D1 to G, then name; `feedBosses()`, the feed as stored), staff's list from `ctx.maxBossAdmin`. Max battles are always on (Matt, 2026-10-21, plan 8X-3: trains, meetups and raid bosses cannot be switched off either): `settings.maxBattles` has a default for every key, and a file without the block has them all. The feed is Pokebattler's `GET /raids` (`settings.maxBattles.url`, `MAX_BOSS_FEED_URL` unless set, read every `refreshMinutes`, 6 hours unless set; about 700 KB): `parseMaxBossFeed` (`src/domain/pogo/max-bosses.ts`) reads `RAID_LEVEL_1_MAX` to `_5_MAX` as `D1` to `D5` and `RAID_LEVEL_6_MAX` as `G`, verified or not (Matt, 2026-10-20), never the `_FUTURE` and `_LEGACY` twins nor the raid tiers (Pokebattler is no raid boss source); a max tier it does not know that has bosses is reported. `maxBossOf` maps an id: the entry of that Pokebattler id, else the entry the id names as a catalogue key or alias (a bare species is the species, or the default form of a species known by one); a Gigantamax id drops `_GIGANTAMAX` and is that Pokémon with the tier `G`, never an entry of its own; a mega is no max boss; an unknown id is a boss by a name made of it, logged once. An upcoming boss is a boss from the start of its `startDate`'s day in `settings.timezone` (Pokebattler gives one instant for an event held at a local hour: the lake trio's 14:00 Max Battle Day is 17:00 in New York), stored as its `firstSeen` (`FeedBoss.startsAt`), so the list leaves it out until then, after a restart too; Pokebattler gives no end in any max tier, so `/max`'s list leaves an upcoming boss out again once an event that named it is over and no event names it now or later (`withoutEndedUpcoming`, plan 8X-3: one the feed first had from that event's day on; a boss of the pool from before stays). It needs the ended event still known: ScrapedDuck drops an event once it has ended; the max events are kept in the database since plan 8X-F (`MaxEvent`, below), an ended one while it started less than eight days ago, so only a restart later than that offers the boss again until Pokebattler drops it (step 11 of the 8X-2 staging, after 2026-10-24, decides whether more is needed). `dynamaxPokemon` is not read. Max boss changes are not announced.
 - What may be typed as a max boss off the lists is the game master's (`GameData.maxBattles`, `catalogue.canDynamax` / `canGigantamax`, `GAME_DATA_VERSION` 6): the modes of `pokemonExtendedSettings.breadOverrides` (`BREAD_MODE`; `BREAD_DOUGH_MODE`, `_2` for Gigantamax), which every such Pokémon has, not `BREAD_POKEMON_SCALING_SETTINGS`, which lists only the 70 species with visuals of their own; a game master with no Pokémon that can Dynamax (the field or mode renamed) is a `game data warning`, not a refused refresh. `typedMaxBoss(entry, bosses, catalogue)` gives a typed Pokémon's listed bosses and the other tiers it may battle in. A Gigantamax boss's picture is `maxBossPicture` (the game's `pm<dex>.f<FORM>_GIGANTAMAX`, else `pm<dex>.fGIGANTAMAX`, else its own).
-- The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`). The max events and the big events are kept in the database as last merged (plan 8X-F; the staging of 8X lost the week's boss to a restart after the feed dropped its Monday): table `MaxEvent` of migration 029 (`MaxEventRepository`, twin `MemoryMaxEvents`, shared `maxEventCases`; a `kind` column, `big` for a big event; replaced whole after each read, so what the merge drops, a max event that started eight days ago, a big event once over, one not begun that the read no longer lists, is gone from it too), loaded before the first read (`RaidEventService.loadMax`, in `app.ts` after `loadResearch`; a read made before it stays as read). The raid events (`merged`) are still kept in memory only: a follow-up. Their hours are always the feed's own; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3, `maxBossOptions`, values `m:<tier>:<key>`): the featured bosses first, then 5 stars down to 1, Gigantamax last; during a big event's hours (`bigEventAt`; Matt, 2026-10-21, Q-A) the Gigantamax bosses first, ahead of the featured Dynamax ones, each part in its order. `/max` reads a boss with `readMaxBoss` (`src/commands/max/max-input.ts`): a choice, or a Pokémon typed in full (`Gigantamax ` or `Dynamax ` before it names the kind), its listed boss first, else the tier `tier:` names (asked for, `WHICH_TIER`), Gigantamax needing none; in `/boss` (whose `tier:` is for max battles only, refused in a raid's or a train's post) the listed boss of the battle's own kind first, and in a Gigantamax battle a Pokémon the game lets battle so, while a Dynamax boss on no list needs `tier:` as with `/max` (plan 8X-F: the battle's stars were taken in silence before; this question and the refusal of `tier:` outside a max battle give the use back, `givesBack`). A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
+- The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`). The max events and the big events are kept in the database as last merged (plan 8X-F; the staging of 8X lost the week's boss to a restart after the feed dropped its Monday): table `MaxEvent` of migration 029 (`MaxEventRepository`, twin `MemoryMaxEvents`, shared `maxEventCases`; a `kind` column, `big` for a big event; replaced whole after each read, so what the merge drops, a max event that started eight days ago, a big event once over, one not begun that the read no longer lists, is gone from it too), loaded before the first read (`RaidEventService.loadMax`, in `app.ts` after `loadResearch`; a read made before it stays as read). The raid events (`merged`) are still kept in memory only: a follow-up; so are the events with spawns of plan 8R-4 (`spawnEvents()`, `mergedSpawns`; `notifications-and-dms.md`, "Spawn reports"). Their hours are always the feed's own; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3, `maxBossOptions`, values `m:<tier>:<key>`): the featured bosses first, then 5 stars down to 1, Gigantamax last; during a big event's hours (`bigEventAt`; Matt, 2026-10-21, Q-A) the Gigantamax bosses first, ahead of the featured Dynamax ones, each part in its order. `/max` reads a boss with `readMaxBoss` (`src/commands/max/max-input.ts`): a choice, or a Pokémon typed in full (`Gigantamax ` or `Dynamax ` before it names the kind), its listed boss first, else the tier `tier:` names (asked for, `WHICH_TIER`), Gigantamax needing none; in `/boss` (whose `tier:` is for max battles only, refused in a raid's or a train's post) the listed boss of the battle's own kind first, and in a Gigantamax battle a Pokémon the game lets battle so, while a Dynamax boss on no list needs `tier:` as with `/max` (plan 8X-F: the battle's stars were taken in silence before; this question and the refusal of `tier:` outside a max battle give the use back, `givesBack`). A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
 - The big events (plan 8X-3; Matt, 2026-10-21): ScrapedDuck's `wild-area`, `pokemon-go-tour` and `pokemon-go-fest` (`BIG_EVENT_TYPES`; the last a guess, not in the feed of 2026-10-20: one line to change) bring Gigantamax battles nearly all day, over a day or two; raids act as usual. `parseBigEventFeed` reads the global editions only (an id with the word `global`, local times; the in-person city editions have UTC times and are out of scope until one comes to a region Pine serves), `RaidEventService.bigEvents()` keeps those of the last good read, and one that has begun and not ended that a later read no longer lists (`mergedBig`, by the feed's id, as `mergedMax`) (`ctx.raidEvents`, which is `RaidEventProvider & MaxEventProvider`), `bigEventAt` is the one on at a time. They feature nothing: their names name no boss.
 - How long a max battle lasts (design Q9; Matt, 2026-10-20 and 21): battles rotate on the hour and the half hour, and a report is of a battle in progress, so the default end is the boundary of its rotation (`defaultMaxEnd`, `src/domain/time/max-end.ts`; `maxRotation`): in a short max event (`short`) the next :00 or :30 after the report, in an all-day one the next full hour, and for a Gigantamax battle the next full hour also in a big event and outside any event (`GIGANTAMAX_OUTSIDE_EVENTS`, unconfirmed: the one place to change; `maxRotation` takes another as its second argument, so a test tells a big event from outside), otherwise (a Dynamax battle on an ordinary day) the day's last battle time, or the start of the next max event later that day if sooner (`dayBattleEnd`, Matt, 2026-10-21, Q-B: one rule, to be revisited after the lake trio day of 2026-10-24; `/end` and `end:` still give a later end, and a report under five minutes before the event's start is asked about, the next rotation being the event's first half hour); always capped at `settings.maxBattles.lastBattle`. A report at or after the last battle time is `over`; one before the first battle is taken, its rotation counted from the first battle. `nextRotationEnd` is the end one rotation later (the ending-soon dialog of `/max`), by the rule as things are at the end (review B12: a Dynamax battle at the last boundary of its event has none), undefined at the cap and for a battle that would then last the day.
 - `/admin boss` takes the max tiers after the raid tiers (`BossTier`, `readTier`; not `autoset`, `readRaidTier`): `add`, `hide` and `shiny` with a max tier change the max boss list (a Pokémon the game data does not list as that kind of max boss gets a warning line, not a refusal), `remove` offers the overrides of both (one table numbers them), `list` shows the max bosses after the raid bosses, their upcoming ones under Coming, and `sync max:True` reads the max feed. `/boss-tier` stays raids only.
diff --git a/src/app-context.ts b/src/app-context.ts
index a7ce912a9028af9bfeed57647126dfcdf072cc82..5b820d8a251d1396721c13b072901313e19e8b21 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -59,6 +59,7 @@ import type { LoginLinks } from './web/login-links.js';
 import type { MeetupSafety } from './services/meetup-safety.js';
 import type { ModerationReports } from './services/moderation-reports.js';
 import type { ScriptAccessService } from './services/script-access-service.js';
+import type { EventSpawnProvider } from './services/event-spawn-service.js';
 
 /** Everything a handler may use. Later phases add services here. */
 export interface AppContext {
@@ -85,6 +86,11 @@ export interface AppContext {
   readonly raidEvents: RaidEventProvider & MaxEventProvider & ResearchEventProvider;
   /** The field research task list read from Leek Duck (plan 8R-1). */
   readonly researchTasks: ResearchTaskProvider;
+  /**
+   * The spawns of the events on (plan 8R-4): costumed spawn reports, and Costumes in `/want`'s
+   * dialog for a Pokémon an event lists costumed.
+   */
+  readonly eventSpawns: EventSpawnProvider;
   /** Team GO Rocket's lineups read from ScrapedDuck: `/rocket`'s choices (plan 8R-2). */
   readonly rocketLineups: RocketLineupProvider;
   /** Reports at stops (plan 8R-1): field research, in research periods. */
diff --git a/src/app.ts b/src/app.ts
index a9f782855bf0e6475ae072688410d0190fae031f..d62f20fd3e0a4fa76646ea78033e24ab0f2ab83b 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -74,6 +74,7 @@ import { WayspotDirectory } from './services/wayspot-directory.js';
 import { PlaceFinder } from './services/place-finder.js';
 import { PineStopService } from './services/pine-stops.js';
 import { ResearchTaskService } from './services/research-task-service.js';
+import { EventSpawnService } from './services/event-spawn-service.js';
 import { ResearchTaskRepository } from './db/repositories/research-task-repository.js';
 import { RocketLineupService } from './services/rocket-lineup-service.js';
 import { RocketLineupRepository } from './db/repositories/rocket-lineup-repository.js';
@@ -263,6 +264,14 @@ export async function startApp(
     maxEvents: new MaxEventRepository(db, log),
     log,
   });
+  // The spawns of the events on (plan 8R-4): a community day's from the feed, any other
+  // event's from its Leek Duck page, read while it is on; costumed spawn reports.
+  const eventSpawns = new EventSpawnService({
+    events: raidEvents,
+    gameData,
+    fetch: (url, init) => fetch(url, init),
+    log,
+  });
   // The field research task list (plan 8R-1): Leek Duck's page, the last good list kept.
   const researchTasks = new ResearchTaskService({
     url: config.settings.research.url,
@@ -471,6 +480,7 @@ export async function startApp(
     gateway: partyGateway,
     raidBosses,
     gameData,
+    costumes: eventSpawns,
     notify,
     store: new SpawnReportRepository(db),
     settings: config.settings,
@@ -815,6 +825,7 @@ export async function startApp(
     maxBossAdmin: maxBosses,
     raidEvents,
     researchTasks,
+    eventSpawns,
     rocketLineups,
     stopReports,
     rocket,
@@ -982,6 +993,10 @@ export async function startApp(
   raidBosses.startAutoSync();
   maxBosses.startAutoSync();
   raidEvents.start();
+  // The events' pages once the feed has said which events are on (a read that fails too).
+  void raidEvents.refresh().then(() => {
+    eventSpawns.start();
+  });
   researchTasks.start();
   rocketLineups.start();
   // The clock waits for Discord, however long that takes: a post that cannot be asked for yet
@@ -1197,6 +1212,14 @@ export async function startApp(
           await raidEvents.whenIdle();
         },
       },
+      {
+        name: 'event spawns',
+        timeoutMs: 1_000,
+        run: async () => {
+          eventSpawns.stop();
+          await eventSpawns.whenIdle();
+        },
+      },
       {
         name: 'research tasks',
         timeoutMs: 1_000,
diff --git a/src/commands/notifications/spawn-report.test.ts b/src/commands/notifications/spawn-report.test.ts
index a0b494ac161faee7afc2dfbbaa2aa2e94daf7a01..4e594906f3a09931cff7b01675d29bb260712f4a 100644
--- a/src/commands/notifications/spawn-report.test.ts
+++ b/src/commands/notifications/spawn-report.test.ts
@@ -87,6 +87,24 @@ describe('the spawn report /wild and the live map share', () => {
     );
   });
 
+  it('says "costumed" where an event on lists the Pokémon costumed (plan 8R-4)', async () => {
+    const made = await partyServiceWith([], {
+      spawnCostumes: { sightingsAt: () => [{ key: 'dratini', dex: 147, costumed: true }] },
+    });
+    const { ctx } = createTestContext({ spawns: made.spawns, regions: made.regions });
+    const words = await reportSpawnAs(
+      ctx,
+      {
+        guildId: made.gateway.guildId,
+        regionChannelId: WEST_CHANNEL,
+        read: readSpawn(ctx, 'dratini', 'by the fountain'),
+        reporter: { id: ALICE, name: 'Alice' },
+      },
+      MAP_NAMES,
+    );
+    expect(words).toBe('Reported: a wild costumed Dratini.\nThe report is removed in 30 minutes.');
+  });
+
   it('refuses in the words of /wild what came of a report that was not made, a channel as the caller names it', async () => {
     const made = await setup();
     made.gateway.failing.set(
diff --git a/src/commands/notifications/spawn-report.ts b/src/commands/notifications/spawn-report.ts
index 9c1f6f1baed40e740ce27f96a9190aaac497c260..47ff0e3b13a8f3971dfa183938bf4a6181d5aa97 100644
--- a/src/commands/notifications/spawn-report.ts
+++ b/src/commands/notifications/spawn-report.ts
@@ -105,7 +105,7 @@ export async function reportSpawnAs(
   const place = near === undefined ? '' : ` ${placeWords(near)}`;
   const link = names.report(guildId, outcome.channelId, outcome.messageId);
   return (
-    `Reported: a wild ${plain(entry.name)}${ivs}${place}.${link === undefined ? '' : ` ${link}`}\n` +
+    `Reported: a wild ${outcome.costumed === true ? 'costumed ' : ''}${plain(entry.name)}${ivs}${place}.${link === undefined ? '' : ` ${link}`}\n` +
     `The report is removed in ${String(SPAWN_MINUTES)} minutes.`
   );
 }
diff --git a/src/commands/notifications/want-boxes.ts b/src/commands/notifications/want-boxes.ts
index 85e9d526094168d271427d34cf676ac3a811ec62..61d440c47341265a46ec60f0b86a4406c2bd3031 100644
--- a/src/commands/notifications/want-boxes.ts
+++ b/src/commands/notifications/want-boxes.ts
@@ -301,7 +301,8 @@ export function whichHashOf(ctx: AppContext, subject: BoxSubject): string {
 
 /**
  * Whether a species' dialog asks about costumes (design 3, review R7): the game data has a
- * costume of any of its forms, or the raid boss list or today's task list has it costumed now.
+ * costume of any of its forms, or the raid boss list, today's task list or the spawns of an
+ * event on (`eventSpawns`) has it costumed now.
  */
 export function costumesShown(ctx: AppContext, subject: BoxSubject): boolean {
   if (subject.kind !== 'pokemon') return false;
@@ -310,6 +311,13 @@ export function costumesShown(ctx: AppContext, subject: BoxSubject): boolean {
   if (ctx.raidBosses.bosses().some((boss) => boss.costumed && boss.entry?.dex === subject.dex)) {
     return true;
   }
+  if (
+    ctx.eventSpawns
+      .sightingsAt(Date.now())
+      .some((sighting) => sighting.costumed && sighting.dex === subject.dex)
+  ) {
+    return true;
+  }
   return ctx.researchTasks
     .tasks()
     .some((task) =>
diff --git a/src/commands/notifications/wants.test.ts b/src/commands/notifications/wants.test.ts
index 3fd8fc36159e84747e80bc06c342cc82442c2d88..f24fc33491a6aea84ec2d22d33762ceb8dc53627 100644
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -961,6 +961,25 @@ describe('/want: the Pokémon dialog (plan 8R-4)', () => {
     expect(labels(await opened(setup(), 'Zubat'))).not.toContain('Only costumed Zubat');
   });
 
+  it('shows Costumes for a Pokémon an event on lists costumed among its spawns (review R7)', async () => {
+    const asked: number[] = [];
+    const made = setup([], [], {
+      eventSpawns: {
+        sightingsAt: (at) => {
+          asked.push(at);
+          return [{ key: 'zubat', dex: 41, costumed: true }];
+        },
+      },
+    });
+    expect(labels(await opened(made, 'Zubat'))).toContain('Only costumed Zubat');
+    expect(asked.length).toBeGreaterThan(0);
+    // Listed plain only: no costume to ask about.
+    const plain = setup([], [], {
+      eventSpawns: { sightingsAt: () => [{ key: 'zubat', dex: 41, costumed: false }] },
+    });
+    expect(labels(await opened(plain, 'Zubat'))).not.toContain('Only costumed Zubat');
+  });
+
   it('keeps Unown’s letters apart: no Which field, a letter’s own dialog', async () => {
     const made = setup();
     const unown = await opened(made, 'Unown');
diff --git a/src/commands/notifications/wild.test.ts b/src/commands/notifications/wild.test.ts
index 323ad5d5513e8f3733f4f8bd5e9bd82cf8a20a5f..6f68a821f9ae7942943562b3045e7bd1fb8dec9d 100644
--- a/src/commands/notifications/wild.test.ts
+++ b/src/commands/notifications/wild.test.ts
@@ -105,6 +105,21 @@ describe('/wild', () => {
     vi.useRealTimers();
   });
 
+  it('reports a Pokémon an event on lists costumed as costumed, and tells costumed wants (plan 8R-4)', async () => {
+    const costumes = { listed: [{ key: 'dratini', dex: 147, costumed: true }] };
+    const made = await setup({ spawnCostumes: { sightingsAt: () => costumes.listed } });
+    await made.ctx.wants.set(BOB, made.gateway.guildId, pokemonTarget(147), 'both', true);
+    const used = await made.run({ pokemon: 'dratini' });
+    expect(sent(used.reply).content).toMatch(/^Reported: a wild costumed Dratini\. https:/);
+    expect(made.named()).toEqual(['costumed Dratini']);
+    expect((await made.told(BOB))[0]?.[0]).toMatch(/^A wild costumed \*\*Dratini\*\* has been/);
+    // No event lists it costumed: a plain report, of which a costumed want hears nothing.
+    costumes.listed = [];
+    await made.run({ pokemon: 'dratini' });
+    expect(made.named()).toEqual(['costumed Dratini', 'Dratini']);
+    expect(await made.told(BOB)).toHaveLength(1);
+  });
+
   it('posts the report in the region channel, publicly, and answers privately with a link', async () => {
     const made = await setup();
     const used = await made.run({ pokemon: 'dratini', details: 'by the fountain' });
diff --git a/src/domain/research/leekduck.test.ts b/src/domain/research/leekduck.test.ts
index 52fcabe47d5698fc56053a16d9547f5c16c6ca12..eee11adb24003a84fa0b22adabd047f2eca2129c 100644
--- a/src/domain/research/leekduck.test.ts
+++ b/src/domain/research/leekduck.test.ts
@@ -1,7 +1,8 @@
 import { describe, expect, it } from 'vitest';
 import { catalogueFixture } from '../../../test/support/game-data.js';
 import { readResearchPage } from '../../../test/support/research.js';
-import { htmlText, parseResearchPage } from './leekduck.js';
+import { readEventPage } from '../../../test/support/spawn-events.js';
+import { htmlText, parseEventSpawns, parseResearchPage } from './leekduck.js';
 import { taskKeyOf } from './task.js';
 
 describe('parseResearchPage', () => {
@@ -135,6 +136,36 @@ describe('parseResearchPage', () => {
     );
   });
 
+  it('reads the Spawns section of an event page, and only it (plan 8R-4)', () => {
+    const crop = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';
+    const article =
+      'https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-10-27-halloween-2026-part-1/';
+    // Halloween 2026 Part I: the one-star raids' Pikachu and Sinistea are no spawns.
+    expect(parseEventSpawns(readEventPage('leekduck-event-halloween-2026-part-1.html'))).toEqual([
+      { name: 'Zubat wearing a top hat', image: `${article}zubat-top-hat.png` },
+      { name: 'Duskull', image: `${crop}pokemon_icon_355_00.png` },
+      {
+        name: 'Piplup wearing a Halloween Mischief costume',
+        image: `${crop}pm393.cHALLOWEEN_2021_NOEVOLVE.icon.png`,
+      },
+    ]);
+    expect(parseEventSpawns(readEventPage('leekduck-event-spotlight-2026-11-05.html'))).toEqual([
+      {
+        name: 'Teddiursa wearing a witch hat',
+        image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm216.cHALLOWEEN_2025.icon.png',
+      },
+    ]);
+    expect(parseEventSpawns('<html><h2 id="raids">Raids</h2></html>')).toEqual([]);
+    // At most 100 of a page's Pokémon (B4): no event lists more.
+    const many = Array.from(
+      { length: 150 },
+      (_, i) => `<li class="pkmn-list-item"><div class="pkmn-name">Pokémon ${String(i)}</div></li>`,
+    ).join('');
+    const read = parseEventSpawns(`<h2 id="spawns">Spawns</h2><ul>${many}</ul>`);
+    expect(read).toHaveLength(100);
+    expect(read[99]).toEqual({ name: 'Pokémon 99' });
+  });
+
   it('reads text as it shows: tags out, entities read, controls and gaps one space', () => {
     expect(htmlText('<span>Buddy &amp; Friendship</span>  Tasks')).toBe('Buddy & Friendship Tasks');
     expect(htmlText('Farfetch&#39;d &#x2014;\u200B ok')).toBe("Farfetch'd — ok");
diff --git a/src/domain/research/leekduck.ts b/src/domain/research/leekduck.ts
index c80304ffd6ed7bc01678b2449539d1fdb04a78d7..e48f217bd02eca099246566d304ed00a7194f2de 100644
--- a/src/domain/research/leekduck.ts
+++ b/src/domain/research/leekduck.ts
@@ -193,6 +193,33 @@ function rewardKey(reward: TaskReward, catalogue: PokemonCatalogue): string {
   }
 }
 
+/**
+ * The Pokémon of the Spawns section of a Leek Duck event page (plan 8R-4, design 5): each list
+ * item's name and picture (`<li class="pkmn-list-item">`, `<div class="pkmn-name">`), between the
+ * section's heading (`<h2 id="spawns">`) and the next heading; the text around them ("you might
+ * also encounter …") is not read. None for a page without the section.
+ */
+export function parseEventSpawns(html: string): { name: string; image?: string }[] {
+  const start = html.indexOf('<h2 id="spawns"');
+  if (start < 0) return [];
+  const next = html.indexOf('<h2', start + 3);
+  const section = html.slice(start, next < 0 ? undefined : next);
+  return partsFrom(section, '<li class="pkmn-list-item"')
+    .flatMap((item) => {
+      const name = htmlText(between(item, '<div class="pkmn-name">', '</div>') ?? '').slice(
+        0,
+        MAX_REWARD_NAME,
+      );
+      if (name === '') return [];
+      const image = leekDuckPicture(pictures(item)[0]);
+      return [{ name, ...(image === null ? {} : { image }) }];
+    })
+    .slice(0, MAX_EVENT_SPAWNS);
+}
+
+/** The most Pokémon read of an event page's Spawns section (B4): no event lists more. */
+const MAX_EVENT_SPAWNS = 100;
+
 /**
  * Reads Leek Duck's research page. Throws when it holds no task at all (another page, a page of
  * another shape), so that a broken read never replaces a good list. A task listed twice (the
diff --git a/src/domain/time/spawn-events.test.ts b/src/domain/time/spawn-events.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..36ebe6d57ceaf2a494baab727c936d3a021f4cbc
--- /dev/null
+++ b/src/domain/time/spawn-events.test.ts
@@ -0,0 +1,212 @@
+import { DateTime } from 'luxon';
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import { readSpawnEventFeed as feed } from '../../../test/support/spawn-events.js';
+import {
+  costumedSpawn,
+  isEventPage,
+  parseSpawnEventFeed,
+  spawnEventsAt,
+  type SpawnSightingOf,
+} from './spawn-events.js';
+
+const ZONE = 'America/New_York';
+const at = (local: string): number => DateTime.fromISO(local, { zone: ZONE }).toMillis();
+
+describe('parseSpawnEventFeed (plan 8R-4)', () => {
+  const events = parseSpawnEventFeed(feed(), ZONE);
+  const ids = events.map((event) => event.id);
+
+  it('takes the global events with spawns: community days, spotlight hours, ordinary events', () => {
+    expect(ids).toEqual(
+      expect.arrayContaining([
+        'halloween-2026-part-1',
+        'halloween-2026-part-2',
+        'november-communityday2026',
+        'pokemonspotlighthour2026-11-05',
+        'minior-showers-orionids-2026',
+        'into-the-wild-2026',
+      ]),
+    );
+    const halloween = events.find((event) => event.id === 'halloween-2026-part-1');
+    expect(halloween).toEqual({
+      id: 'halloween-2026-part-1',
+      name: 'Pokémon GO Halloween 2026 Part I',
+      eventType: 'event',
+      start: at('2026-10-27T10:00'),
+      end: at('2026-11-01T10:00'),
+      page: 'https://leekduck.com/events/halloween-2026-part-1/',
+    });
+  });
+
+  it('takes a community day’s and a spotlight hour’s spawns from the feed, without a page', () => {
+    const day = events.find((event) => event.id === 'november-communityday2026');
+    expect(day?.spawns).toEqual([
+      {
+        name: 'Pawniard',
+        image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_624_00.png',
+      },
+    ]);
+    expect(day).not.toHaveProperty('page');
+    const spotlight = events.find((event) => event.id === 'pokemonspotlighthour2026-11-05');
+    expect(spotlight?.spawns).toEqual([
+      {
+        name: 'Teddiursa wearing a witch hat',
+        image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm216.cHALLOWEEN_2025.icon.png',
+      },
+    ]);
+  });
+
+  it('takes the Global Wild Area, by the feed’s name and local times (Matt’s R-M5)', () => {
+    expect(ids).toContain('pokemon-go-wild-area-2026-global');
+  });
+
+  it('takes only the types it knows to be global: an unknown type, a Tour in a city stay out', () => {
+    const item = (eventType: string, name: string, start: string, end: string) => ({
+      eventID: `${eventType}-${name}`,
+      eventType,
+      name,
+      link: 'https://leekduck.com/events/x/',
+      start,
+      end,
+      extraData: { generic: { hasSpawns: true } },
+    });
+    const parsed = parseSpawnEventFeed(
+      [
+        item(
+          'pokemon-go-tour',
+          'Tour: Alola - Global 2027',
+          '2027-02-27T00:00',
+          '2027-02-28T23:59',
+        ),
+        item(
+          'pokemon-go-tour',
+          'Tour: Alola - Kaohsiung',
+          '2027-02-18T16:00Z',
+          '2027-02-21T15:59Z',
+        ),
+        item('event', 'An event', '2027-03-01T10:00', '2027-03-02T20:00'),
+        item('community-day', 'A day', '2027-03-06T14:00', '2027-03-06T17:00'),
+        item('pokemon-spotlight-hour', 'An hour', '2027-03-04T18:00', '2027-03-04T19:00'),
+        item('wild-area', 'Wild Area 2027: Global', '2027-03-13T10:00', '2027-03-14T18:00'),
+        // A city's Wild Area with local times still stays out: its name says no Global.
+        item('wild-area', 'Wild Area 2027: Sendai', '2027-03-20T10:00', '2027-03-21T18:00'),
+        item('max-battles', 'A max battle day', '2027-03-07T14:00', '2027-03-07T17:00'),
+        item('research', 'Timed research', '2027-03-01T10:00', '2027-03-08T20:00'),
+        item('brand-new-type', 'Something new', '2027-03-01T10:00', '2027-03-02T20:00'),
+      ],
+      ZONE,
+    );
+    expect(parsed.map((event) => event.name)).toEqual([
+      'Tour: Alola - Global 2027',
+      'An event',
+      'An hour',
+      'A day',
+      'Wild Area 2027: Global',
+    ]);
+  });
+
+  it('takes GO Fest only in its Global edition at local times, as a Wild Area (Matt’s Q2)', () => {
+    const fest = (name: string, start: string, end: string) => ({
+      eventID: name,
+      eventType: 'pokemon-go-fest',
+      name,
+      link: 'https://leekduck.com/events/x/',
+      start,
+      end,
+      extraData: { generic: { hasSpawns: true } },
+    });
+    const parsed = parseSpawnEventFeed(
+      [
+        fest('Pokémon GO Fest 2027: Global', '2027-07-10T10:00', '2027-07-11T18:00'),
+        // A city's, in its own zone and without the word.
+        fest('Pokémon GO Fest 2027: Osaka', '2027-05-30T01:00Z', '2027-06-01T09:00Z'),
+        // The word alone is not enough: the times must be local too.
+        fest('Pokémon GO Fest 2027: Global', '2027-07-10T14:00Z', '2027-07-11T22:00Z'),
+        // Local times without the word: a city's still.
+        fest('Pokémon GO Fest 2027: Paris', '2027-06-13T10:00', '2027-06-15T18:00'),
+      ],
+      ZONE,
+    );
+    expect(parsed.map((event) => [event.name, event.start])).toEqual([
+      ['Pokémon GO Fest 2027: Global', at('2027-07-10T10:00')],
+    ]);
+  });
+
+  it('leaves out the location-bound events, the seasons and those without spawns (F11)', () => {
+    for (const id of [
+      // City Wild Areas and City Safaris are in-person (Matt, 2026-10-22).
+      'pokemon-go-wild-area-2026-sendai-japan',
+      'pokemon-go-city-safari-boston-2026-rescheduled',
+      // Fixed times in UTC: Pokémon Night Out in a city.
+      'pokemon-night-out-los-angeles-2026',
+      'pokemon-night-out-london-2026',
+      // A season's spawns stand for three months: never a costume's moment.
+      'season-24-twilight-trails',
+      // No spawns.
+      'raidhour20261028',
+      'max-mondays-2026-11-02',
+      'dynamax-trails-2026',
+    ]) {
+      expect(ids, id).not.toContain(id);
+    }
+  });
+
+  it('says which addresses are Leek Duck’s events pages, the only ones read (F11)', () => {
+    expect(isEventPage('https://leekduck.com/events/halloween-2026-part-1/')).toBe(true);
+    expect(isEventPage('https://leekduck.com/events/halloween-2026-part-1')).toBe(true);
+    for (const url of [
+      'http://leekduck.com/events/halloween-2026-part-1/',
+      'https://example.test/events/elsewhere/',
+      'https://leekduck.com/research/',
+      'https://leekduck.com/events/a/b/',
+      'https://leekduck.com.example.test/events/x/',
+    ]) {
+      expect(isEventPage(url), url).toBe(false);
+    }
+  });
+
+  it('refuses a document that is no list', () => {
+    expect(() => parseSpawnEventFeed({}, ZONE)).toThrow();
+  });
+});
+
+describe('spawnEventsAt and costumedSpawn', () => {
+  const events = parseSpawnEventFeed(feed(), ZONE);
+
+  it('gives the events on at a moment', () => {
+    expect(spawnEventsAt(events, at('2026-10-28T12:00')).map((event) => event.id)).toEqual([
+      'halloween-2026-part-1',
+    ]);
+    expect(spawnEventsAt(events, at('2026-11-05T18:30')).map((event) => event.id)).toEqual([
+      'halloween-2026-part-2',
+      'pokemonspotlighthour2026-11-05',
+    ]);
+    expect(spawnEventsAt(events, at('2026-11-01T10:00')).map((event) => event.id)).toEqual([
+      'halloween-2026-part-2',
+    ]);
+  });
+
+  it('calls a spawn costumed where an active event lists its entry costumed, plain beside it or not', () => {
+    const catalogue = catalogueFixture();
+    const sightings: SpawnSightingOf = [
+      { key: 'zubat', dex: 41, costumed: true },
+      { key: 'duskull', dex: 355, costumed: false },
+      { key: 'pikachu', dex: 25, costumed: false },
+      { key: 'pikachu', dex: 25, costumed: true },
+      { key: 'corsola_galarian', dex: 222, costumed: true },
+    ];
+    const entry = (key: string) => {
+      const found = catalogue.byKey(key);
+      if (!found) throw new Error(key);
+      return found;
+    };
+    expect(costumedSpawn(sightings, entry('zubat'))).toBe(true);
+    expect(costumedSpawn(sightings, entry('duskull'))).toBe(false);
+    expect(costumedSpawn(sightings, entry('pikachu'))).toBe(true);
+    // The costume is of Galarian Corsola: a plain Corsola is not it.
+    expect(costumedSpawn(sightings, entry('corsola'))).toBe(false);
+    expect(costumedSpawn(sightings, entry('corsola_galarian'))).toBe(true);
+    expect(costumedSpawn([], entry('zubat'))).toBe(false);
+  });
+});
diff --git a/src/domain/time/spawn-events.ts b/src/domain/time/spawn-events.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3d382164b05a647a6ad4106cf9997316ac7f5aa2
--- /dev/null
+++ b/src/domain/time/spawn-events.ts
@@ -0,0 +1,158 @@
+import { DateTime } from 'luxon';
+import { z } from 'zod';
+import { eventName } from './raid-events.js';
+
+/*
+ * The events whose spawns can be costumed (plan 8R-4; design `2026-10-22-costume-form-wants-
+ * design.md`, section 5, "Spawns"; F11): a spawn report is costumed when an event on now lists
+ * that Pokémon costumed. Pure: `EventSpawnService` reads the pages and keeps what they list.
+ */
+
+/** A Pokémon an event lists among its spawns, by its English name and picture. */
+export interface ListedSpawn {
+  name: string;
+  image?: string;
+}
+
+/**
+ * An event of ScrapedDuck's feed with spawns (`SpawnEvent`): its id, name and type, its start
+ * and end (epoch milliseconds, `end` the first moment after it), and where its spawns are: in
+ * the feed itself (`spawns`: a community day's `extraData.communityday.spawns`, a spotlight
+ * hour's `extraData.spotlight.list`), or on its Leek Duck page (`page`, read by the service).
+ */
+export interface SpawnEvent {
+  id: string;
+  name: string;
+  eventType: string;
+  start: number;
+  end: number;
+  spawns?: ListedSpawn[];
+  page?: string;
+}
+
+/**
+ * The event types whose spawns are every member's (Matt's R-M5 and Q2, 2026-10-22): an
+ * allowlist, so that a type the feed adds later stays out until it is known. A Wild Area and GO
+ * Fest count only in their Global edition (`GLOBAL_ONLY`); city Wild Areas and GO Fests, City
+ * Safaris, seasons (their spawns stand for three months: a costume listed there would mark every
+ * report until the next season) and every other type are out.
+ */
+export const SPAWN_EVENT_TYPES: ReadonlySet<string> = new Set([
+  'event',
+  'community-day',
+  'pokemon-spotlight-hour',
+  'pokemon-go-tour',
+  'wild-area',
+  'pokemon-go-fest',
+]);
+
+/** The types that count only in their Global edition (`GLOBAL_EDITION`, Matt's Q2). */
+const GLOBAL_ONLY: ReadonlySet<string> = new Set(['wild-area', 'pokemon-go-fest']);
+
+/**
+ * The Global edition of a Wild Area or GO Fest, told from a city's by the feed's name ("Pokémon
+ * GO Wild Area 2026: Global"): the feed has nothing firmer (its `extraData` is the same for both;
+ * a city's times carry a `Z`, the Global one's are local, which `ZONED_TIME` checks as well).
+ */
+const GLOBAL_EDITION = /\bglobal\b/i;
+
+/** A time with a zone of its own (`Z`, `+09:00`): an in-person event's, in another city. */
+const ZONED_TIME = /(Z|[+-]\d{2}:?\d{2})$/i;
+
+/** The only pages read (F11): Leek Duck's events pages. */
+const EVENT_PAGE = /^https:\/\/leekduck\.com\/events\/[A-Za-z0-9._~-]{1,200}\/?$/;
+
+/** Whether an address is a Leek Duck events page, the only pages read (F11). */
+export function isEventPage(url: string): boolean {
+  return EVENT_PAGE.test(url);
+}
+
+/** An event longer than this lists no spawns of a moment (a season, whatever its type). */
+const MAX_SPAWN_EVENT_MS = 31 * 24 * 60 * 60_000;
+
+const listed = z
+  .array(
+    z.object({ name: z.string().min(1).max(100), image: z.string().max(300).optional() }).loose(),
+  )
+  .max(100);
+
+const spawnItem = z.object({
+  eventID: z.string().min(1).max(200),
+  eventType: z.string().min(1).max(40),
+  name: eventName,
+  link: z.string().max(300).optional(),
+  start: z.string().max(40).nullable().optional(),
+  end: z.string().max(40).nullable().optional(),
+  extraData: z
+    .object({
+      generic: z.object({ hasSpawns: z.boolean().optional() }).loose().optional(),
+      communityday: z.object({ spawns: listed.optional() }).loose().optional(),
+      spotlight: z.object({ list: listed.optional() }).loose().optional(),
+    })
+    .loose()
+    .optional(),
+});
+
+/**
+ * The events of the feed with spawns (design 5, F11): a community day's and a spotlight hour's
+ * from the feed, any other the feed marks `generic.hasSpawns` from its Leek Duck page; only the
+ * types of `SPAWN_EVENT_TYPES` (a Wild Area and GO Fest only Global), never an event at a fixed time of another zone (times with a `Z`:
+ * Pokémon Night Out), one without hours, one that ends before it starts or lasts over a month.
+ * An event's `page` is its feed link as it stands: whoever reads it reads only a Leek Duck
+ * events page (`isEventPage`). In order of their start.
+ *
+ * Throws when the document is not a list at all, so that the caller keeps what it had.
+ */
+export function parseSpawnEventFeed(json: unknown, zone: string): SpawnEvent[] {
+  if (!Array.isArray(json)) throw new Error('The events feed is not a list of events');
+  const events: SpawnEvent[] = [];
+  for (const value of json as unknown[]) {
+    const parsed = spawnItem.safeParse(value);
+    if (!parsed.success) continue;
+    const { eventID: id, eventType, name, link, start: from, end: to, extraData } = parsed.data;
+    if (!SPAWN_EVENT_TYPES.has(eventType)) continue;
+    if (GLOBAL_ONLY.has(eventType) && !GLOBAL_EDITION.test(name)) continue;
+    if (typeof from !== 'string' || typeof to !== 'string') continue;
+    if (ZONED_TIME.test(from) || ZONED_TIME.test(to)) continue;
+    const start = DateTime.fromISO(from, { zone });
+    const end = DateTime.fromISO(to, { zone });
+    if (!start.isValid || !end.isValid) continue;
+    const length = end.toMillis() - start.toMillis();
+    if (length <= 0 || length > MAX_SPAWN_EVENT_MS) continue;
+    const fromFeed = extraData?.communityday?.spawns ?? extraData?.spotlight?.list;
+    const spawns = fromFeed?.map((one) => ({
+      name: one.name,
+      ...(one.image === undefined ? {} : { image: one.image }),
+    }));
+    const hasPage = extraData?.generic?.hasSpawns === true && link !== undefined;
+    if (!(spawns && spawns.length > 0) && extraData?.generic?.hasSpawns !== true) continue;
+    events.push({
+      id,
+      name,
+      eventType,
+      start: start.toMillis(),
+      end: end.toMillis(),
+      ...(spawns && spawns.length > 0 ? { spawns } : {}),
+      ...(!(spawns && spawns.length > 0) && hasPage ? { page: link } : {}),
+    });
+  }
+  return events.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
+}
+
+/** The events on at a moment. */
+export function spawnEventsAt(events: readonly SpawnEvent[], at: number): SpawnEvent[] {
+  return events.filter((event) => event.start <= at && at < event.end);
+}
+
+/** The spawns events list, as the catalogue places them (`costumedSighting`). */
+export type SpawnSightingOf = readonly { key: string; dex: number; costumed: boolean }[];
+
+/**
+ * Whether a report of an entry is costumed (design 5): an event on lists that very entry
+ * costumed (the species' entry for a species, the form's for a form: Galarian Corsola's costume
+ * is no plain Corsola's), whether or not it lists it plain beside it (a costume hunter would
+ * rather a false alarm than a miss; a plain want fires either way).
+ */
+export function costumedSpawn(sightings: SpawnSightingOf, entry: { key: string }): boolean {
+  return sightings.some((sighting) => sighting.costumed && sighting.key === entry.key);
+}
diff --git a/src/render/spawn.ts b/src/render/spawn.ts
index 204b5e76892f1846a4598573163894d887174a09..1e3496dd090981bfc5b2624d2edf544e99d53775 100644
--- a/src/render/spawn.ts
+++ b/src/render/spawn.ts
@@ -86,15 +86,17 @@ export interface SpawnView {
   image?: string | undefined;
   /** The place the reporter named it near, when they did. */
   near?: SpawnPlace | undefined;
+  /** An event on lists it costumed (plan 8R-4): "costumed" before its name. */
+  costumed?: boolean;
 }
 
 /** How the IVs a reporter checked are said: `100% IVs`, `0% IVs`. */
 export const IV_WORDS = { perfect: '100% IVs', zero: '0% IVs' } as const;
 
-/** `**Dratini**`, `**Dratini** with 100% IVs`. */
-function spawnName(view: Pick<SpawnView, 'pokemon' | 'iv'>): string {
+/** `**Dratini**`, `**Dratini** with 100% IVs`, `costumed **Pikachu**` (plan 8R-4). */
+function spawnName(view: Pick<SpawnView, 'pokemon' | 'iv' | 'costumed'>): string {
   const ivs = view.iv === undefined ? '' : ` with ${IV_WORDS[view.iv]}`;
-  return `**${plain(view.pokemon)}**${ivs}`;
+  return `${view.costumed === true ? 'costumed ' : ''}**${plain(view.pokemon)}**${ivs}`;
 }
 
 /** What a report says of a spawn's worth in its small print (the legacy bot's warning, shorter). */
@@ -140,7 +142,7 @@ function spawnHead(view: SpawnView, text: string): APIComponentInContainer {
 export function spawnMessage(view: SpawnView, footer: string, goneAt: number): V2Message {
   const by = (word: 'Reported' | 'reported') => `${word} by ${memberText(view.reporter)}`;
   const head = [
-    `### Wild ${plain(view.pokemon)}`,
+    `### Wild ${view.costumed === true ? 'costumed ' : ''}${plain(view.pokemon)}`,
     view.iv === undefined ? by('Reported') : `with ${IV_WORDS[view.iv]} · ${by('reported')}`,
     `This report goes away ${timestamp(goneAt, 'R')}.`,
   ].join('\n');
diff --git a/src/services/event-spawn-service.test.ts b/src/services/event-spawn-service.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f96a24ded6e52e994c973b0bdd0bb0db2ffab218
--- /dev/null
+++ b/src/services/event-spawn-service.test.ts
@@ -0,0 +1,202 @@
+import { DateTime } from 'luxon';
+import { describe, expect, it, vi } from 'vitest';
+import { catalogueFixture } from '../../test/support/game-data.js';
+import { jsonResponse } from '../../test/support/responses.js';
+import { readEventPage, readSpawnEventFeed } from '../../test/support/spawn-events.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { parseSpawnEventFeed, type SpawnEvent } from '../domain/time/spawn-events.js';
+import {
+  EventSpawnService,
+  MAX_EVENT_PAGE_BYTES,
+  nextReadIn,
+  REREAD_MS,
+} from './event-spawn-service.js';
+import { PINE_USER_AGENT, type FetchPage } from './research-task-service.js';
+
+const ZONE = 'America/New_York';
+const HOUR = 3_600_000;
+const at = (local: string): number => DateTime.fromISO(local, { zone: ZONE }).toMillis();
+const HALLOWEEN = 'https://leekduck.com/events/halloween-2026-part-1/';
+const FEED_EVENTS = parseSpawnEventFeed(readSpawnEventFeed(), ZONE);
+
+const page = (html: string, status = 200) =>
+  Promise.resolve({ ...jsonResponse(null, { raw: html, status }), ok: status < 300 });
+
+/** A service over `events`, reading what `answer` gives for an address, at `clock.now`. */
+function serviceWith(
+  answer: (url: string) => ReturnType<FetchPage>,
+  events: readonly SpawnEvent[] = FEED_EVENTS,
+) {
+  const { log, entries } = createTestLogger();
+  const clock = { now: at('2026-10-28T12:00') };
+  const asked: { url: string; headers: Record<string, string>; redirect: string }[] = [];
+  const service = new EventSpawnService({
+    events: { spawnEvents: () => events },
+    gameData: { catalogue: catalogueFixture() },
+    fetch: (url, init) => {
+      asked.push({ url, headers: init.headers, redirect: init.redirect });
+      return answer(url);
+    },
+    log,
+    now: () => clock.now,
+  });
+  const said = (msg: string) => entries.filter((entry) => entry.msg === msg).length;
+  return { service, clock, asked, said };
+}
+
+const costumedKeys = (service: EventSpawnService, moment: number) =>
+  service
+    .sightingsAt(moment)
+    .filter((sighting) => sighting.costumed)
+    .map((sighting) => sighting.key);
+
+describe('EventSpawnService (plan 8R-4)', () => {
+  it('reads the page of an event on now with Pine’s User-Agent, and places its spawns', async () => {
+    const halloween = readEventPage('leekduck-event-halloween-2026-part-1.html');
+    const { service, clock, asked } = serviceWith(() => page(halloween));
+    expect(service.sightingsAt(clock.now)).toEqual([]);
+    await service.refresh();
+    expect(asked).toEqual([
+      {
+        url: HALLOWEEN,
+        headers: { Accept: 'text/html', 'User-Agent': PINE_USER_AGENT },
+        redirect: 'error',
+      },
+    ]);
+    // Zubat with a hand-named picture, Piplup by its picture's costume; Duskull plain.
+    expect(service.sightingsAt(clock.now)).toEqual(
+      expect.arrayContaining([
+        { key: 'zubat', dex: 41, costumed: true },
+        { key: 'duskull', dex: 355, costumed: false },
+        expect.objectContaining({ dex: 393, costumed: true }),
+      ]),
+    );
+    // Not on before it starts, nor after it ends.
+    expect(service.sightingsAt(at('2026-10-27T09:59'))).toEqual([]);
+    expect(service.sightingsAt(at('2026-11-01T10:00'))).toEqual([]);
+  });
+
+  it('reads a page again only after six hours, and keeps the last good read when one fails', async () => {
+    let answer = () => page(readEventPage('leekduck-event-halloween-2026-part-1.html'));
+    const { service, clock, asked, said } = serviceWith(() => answer());
+    await service.refresh();
+    clock.now += REREAD_MS - 1;
+    await service.refresh();
+    expect(asked).toHaveLength(1);
+    clock.now += 1;
+    answer = () => page('', 503);
+    await service.refresh();
+    expect(asked).toHaveLength(2);
+    expect(costumedKeys(service, clock.now)).toContain('zubat');
+    expect(said('could not read the spawns of an event')).toBe(1);
+  });
+
+  it('gives no spawns of an event whose page was never read', async () => {
+    const { service, clock, said } = serviceWith(() => Promise.reject(new Error('down')));
+    await service.refresh();
+    expect(service.sightingsAt(clock.now)).toEqual([]);
+    expect(said('could not read the spawns of an event')).toBe(1);
+  });
+
+  it('refuses a page too large to be an event page', async () => {
+    const huge = 'x'.repeat(MAX_EVENT_PAGE_BYTES + 1);
+    const { service, clock, said } = serviceWith(() => page(huge));
+    await service.refresh();
+    expect(service.sightingsAt(clock.now)).toEqual([]);
+    expect(said('could not read the spawns of an event')).toBe(1);
+  });
+
+  it('takes a community day’s and a spotlight hour’s spawns from the feed, reading nothing', async () => {
+    const { service, clock, asked } = serviceWith(() => Promise.reject(new Error('no network')));
+    clock.now = at('2026-11-05T18:30');
+    await service.refresh();
+    // Halloween Part II's page is read; the spotlight hour's spawns are the feed's (B5).
+    expect(asked.map((one) => one.url)).toEqual([
+      'https://leekduck.com/events/halloween-2026-part-2/',
+    ]);
+    expect(costumedKeys(service, clock.now)).toEqual(['teddiursa']);
+    expect(costumedKeys(service, at('2026-11-21T15:00'))).toEqual([]);
+    expect(service.sightingsAt(at('2026-11-21T15:00')).map((sighting) => sighting.key)).toEqual([
+      'pawniard',
+    ]);
+  });
+
+  it('reads no address but Leek Duck’s events pages, and says so once (F11)', async () => {
+    const elsewhere: SpawnEvent = {
+      id: 'elsewhere',
+      name: 'Elsewhere',
+      eventType: 'event',
+      start: at('2026-10-28T00:00'),
+      end: at('2026-10-29T00:00'),
+      page: 'https://example.test/events/elsewhere/',
+    };
+    const { service, asked, said } = serviceWith(() => page('<html></html>'), [elsewhere]);
+    await service.refresh();
+    await service.refresh();
+    expect(asked).toEqual([]);
+    expect(said('an event page that is not Leek Duck’s is not read')).toBe(1);
+  });
+
+  it('takes nothing from a page that ended up anywhere but an events page (B3)', async () => {
+    const halloween = readEventPage('leekduck-event-halloween-2026-part-1.html');
+    const { service, clock, said } = serviceWith(() =>
+      page(halloween).then((response) => ({ ...response, url: 'https://example.test/x' })),
+    );
+    await service.refresh();
+    expect(service.sightingsAt(clock.now)).toEqual([]);
+    expect(said('could not read the spawns of an event')).toBe(1);
+  });
+
+  it('reads as an event begins and again after six hours, by its timer (B6)', async () => {
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    try {
+      const halloween = readEventPage('leekduck-event-halloween-2026-part-1.html');
+      const { service, clock, asked } = serviceWith(() => page(halloween));
+      // Half an hour before Halloween Part I begins: nothing on to read yet.
+      clock.now = at('2026-10-27T09:30');
+      service.start();
+      await service.whenIdle();
+      expect(asked).toEqual([]);
+      expect(vi.getTimerCount()).toBe(1);
+      // Its timer runs at the start: the page is read.
+      clock.now = at('2026-10-27T10:00');
+      await vi.advanceTimersToNextTimerAsync();
+      await service.whenIdle();
+      expect(asked).toHaveLength(1);
+      // Every hour after it looks again; the page is read anew once six hours are up.
+      for (let hour = 1; hour <= 6; hour++) {
+        expect(vi.getTimerCount()).toBe(1);
+        clock.now = at('2026-10-27T10:00') + hour * HOUR;
+        await vi.advanceTimersToNextTimerAsync();
+        await service.whenIdle();
+        expect(asked, `after ${String(hour)} hours`).toHaveLength(hour < 6 ? 1 : 2);
+      }
+      service.stop();
+      expect(vi.getTimerCount()).toBe(0);
+    } finally {
+      vi.useRealTimers();
+    }
+  });
+
+  it('reads at once when started, and nothing once stopped, also when started after (shutdown)', async () => {
+    const halloween = readEventPage('leekduck-event-halloween-2026-part-1.html');
+    const started = serviceWith(() => page(halloween));
+    started.service.start();
+    await started.service.whenIdle();
+    started.service.stop();
+    expect(started.asked).toHaveLength(1);
+    const stopped = serviceWith(() => page(halloween));
+    stopped.service.stop();
+    stopped.service.start();
+    await stopped.service.whenIdle();
+    expect(stopped.asked).toEqual([]);
+  });
+});
+
+describe('nextReadIn', () => {
+  it('reads at the next start of an event with spawns, at the latest in an hour', () => {
+    expect(nextReadIn(FEED_EVENTS, at('2026-10-27T09:30'))).toBe(30 * 60_000);
+    expect(nextReadIn(FEED_EVENTS, at('2026-10-28T12:00'))).toBe(HOUR);
+    expect(nextReadIn([], at('2026-10-28T12:00'))).toBe(HOUR);
+  });
+});
diff --git a/src/services/event-spawn-service.ts b/src/services/event-spawn-service.ts
new file mode 100644
index 0000000000000000000000000000000000000000..96f4cbda3d88316afd297e460975afd84a958307
--- /dev/null
+++ b/src/services/event-spawn-service.ts
@@ -0,0 +1,209 @@
+import { BoundedMap } from '../bounded-map.js';
+import { costumedSighting } from '../domain/pogo/costumes.js';
+import { parseEventSpawns } from '../domain/research/leekduck.js';
+import {
+  isEventPage,
+  spawnEventsAt,
+  type ListedSpawn,
+  type SpawnEvent,
+  type SpawnSightingOf,
+} from '../domain/time/spawn-events.js';
+import type { Logger } from '../log.js';
+import { failureReason } from './failure-reason.js';
+import type { GameDataProvider } from './game-data-service.js';
+import { readLimitedText } from './limited-json.js';
+import type { SpawnEventProvider } from './raid-event-service.js';
+import type { LimitedResponse } from './limited-json.js';
+import { PINE_USER_AGENT } from './research-task-service.js';
+
+/** An event page is about 200 KB; anything near this size is no event page. */
+export const MAX_EVENT_PAGE_BYTES = 3 * 1024 * 1024;
+const HOUR_MS = 3_600_000;
+/** How long the spawns read from an event's page stand before it is read again (design 5). */
+export const REREAD_MS = 6 * HOUR_MS;
+/** How many events' pages are kept: more than are ever on at once. */
+const PAGES_KEPT = 50;
+/** How many addresses that are not Leek Duck's events pages are remembered as told. */
+const TOLD_KEPT = 100;
+
+/** What `/wild` and `/want`'s dialog ask of the spawns of the events on (plan 8R-4). */
+export interface EventSpawnProvider {
+  /**
+   * The Pokémon the events on at `at` list among their spawns, placed in the catalogue, costumed
+   * or not (`costumedSpawn` says whether a report is costumed). Empty for an event whose page was
+   * never read.
+   */
+  sightingsAt(at: number): SpawnSightingOf;
+}
+
+/**
+ * A download of an event page: never followed to another address (`redirect: 'error'`, B3); the
+ * address it ended at (`url`, a real fetch's) must still be an events page.
+ */
+export type FetchEventPage = (
+  url: string,
+  init: { signal: AbortSignal; headers: Record<string, string>; redirect: 'error' },
+) => Promise<LimitedResponse & { ok: boolean; url?: string }>;
+
+export interface EventSpawnOptions {
+  /** The global events with spawns of the events feed (`RaidEventService`). */
+  events: SpawnEventProvider;
+  gameData: Pick<GameDataProvider, 'catalogue'>;
+  fetch: FetchEventPage;
+  log: Logger;
+  /** How long one page may take before it is abandoned. Default 30 seconds. */
+  timeoutMs?: number;
+  now?: () => number;
+}
+
+/**
+ * When to look again at the events: at the next start of an event with spawns, so that its page
+ * is read as it begins, and at the latest in an hour (a page due to be read again, an event the
+ * feed has added).
+ */
+export function nextReadIn(events: readonly SpawnEvent[], now: number): number {
+  return events.reduce(
+    (soonest, event) => (event.start > now ? Math.min(soonest, event.start - now) : soonest),
+    HOUR_MS,
+  );
+}
+
+/** Thrown inside a download that `stop` ended; not worth a warning. */
+class ReadStopped extends Error {}
+
+/**
+ * The spawns of the events on now (plan 8R-4, design 5): a community day's and a spotlight hour's
+ * from the feed itself, any other event's from the Spawns section of its Leek Duck page, read
+ * when the event is on and again every six hours (`REREAD_MS`), kept in memory by event. Only
+ * Leek Duck's events pages are read (F11): another address is skipped and said once. A page that
+ * cannot be read keeps the spawns of its last good read; one never read gives none.
+ */
+export class EventSpawnService implements EventSpawnProvider {
+  private readonly pages = new BoundedMap<string, { readAt: number; spawns: ListedSpawn[] }>(
+    PAGES_KEPT,
+  );
+  private readonly told = new BoundedMap<string, true>(TOLD_KEPT);
+  private readonly now: () => number;
+  private readonly timeoutMs: number;
+  private controller: AbortController | undefined;
+  private inFlight: Promise<void> | undefined;
+  private timer: NodeJS.Timeout | undefined;
+  private stopped = true;
+  /** Set by `stop`: a `start` after it (a shutdown before the first read) does nothing. */
+  private closed = false;
+
+  constructor(private readonly options: EventSpawnOptions) {
+    this.now = options.now ?? (() => Date.now());
+    this.timeoutMs = options.timeoutMs ?? 30_000;
+  }
+
+  sightingsAt(at: number): SpawnSightingOf {
+    const { catalogue } = this.options.gameData;
+    return spawnEventsAt(this.options.events.spawnEvents(), at).flatMap((event) =>
+      (event.spawns ?? this.pages.get(event.id)?.spawns ?? []).flatMap((spawn) => {
+        const sighting = costumedSighting(catalogue, spawn.name, spawn.image);
+        return sighting === undefined ? [] : [sighting];
+      }),
+    );
+  }
+
+  /** Reads the pages of the events on now that are due. Never rejects; calls share one run. */
+  refresh(): Promise<void> {
+    this.inFlight ??= this.readDue().finally(() => {
+      this.inFlight = undefined;
+    });
+    return this.inFlight;
+  }
+
+  /** Resolves once no read is in flight. Never rejects. */
+  async whenIdle(): Promise<void> {
+    while (this.inFlight) await this.inFlight;
+  }
+
+  /** Reads now, then at the next start of an event or within the hour. */
+  start(): void {
+    if (!this.stopped || this.closed) return;
+    this.stopped = false;
+    this.tick();
+  }
+
+  /** Cancels the next look and ends a read in flight. */
+  stop(): void {
+    this.stopped = true;
+    this.closed = true;
+    this.controller?.abort();
+    if (this.timer) clearTimeout(this.timer);
+    this.timer = undefined;
+  }
+
+  private tick(): void {
+    void this.refresh().then(() => {
+      if (this.stopped) return;
+      const wait = nextReadIn(this.options.events.spawnEvents(), this.now());
+      this.timer = setTimeout(() => {
+        this.timer = undefined;
+        this.tick();
+      }, wait);
+      this.timer.unref();
+    });
+  }
+
+  private async readDue(): Promise<void> {
+    const { log } = this.options;
+    const now = this.now();
+    for (const event of spawnEventsAt(this.options.events.spawnEvents(), now)) {
+      const { page } = event;
+      if (page === undefined || event.spawns !== undefined) continue;
+      if (!isEventPage(page)) {
+        if (!this.told.has(page)) {
+          this.told.set(page, true);
+          log.warn(
+            { event: event.id, url: page },
+            'an event page that is not Leek Duck’s is not read',
+          );
+        }
+        continue;
+      }
+      const kept = this.pages.get(event.id);
+      if (kept !== undefined && now - kept.readAt < REREAD_MS) continue;
+      try {
+        const spawns = parseEventSpawns(await this.download(page));
+        this.pages.set(event.id, { readAt: now, spawns });
+        log.info({ event: event.id, spawns: spawns.length }, 'the spawns of an event read');
+      } catch (err) {
+        if (err instanceof ReadStopped) return;
+        log.warn({ err, event: event.id }, 'could not read the spawns of an event');
+      }
+    }
+  }
+
+  private async download(url: string): Promise<string> {
+    const timeout = AbortSignal.timeout(this.timeoutMs);
+    const controller = new AbortController();
+    this.controller = controller;
+    try {
+      const response = await this.options.fetch(url, {
+        signal: AbortSignal.any([timeout, controller.signal]),
+        headers: { Accept: 'text/html', 'User-Agent': PINE_USER_AGENT },
+        redirect: 'error',
+      });
+      if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
+      // Never another page than Leek Duck's events pages (F11, B3).
+      if (response.url !== undefined && response.url !== '' && !isEventPage(response.url)) {
+        throw new Error(`${url}: ended at an address that is no events page`);
+      }
+      const body = await readLimitedText(response, MAX_EVENT_PAGE_BYTES);
+      if (!body.ok) throw new Error(`${url}: the page is ${body.reason}`);
+      return body.text;
+    } catch (err) {
+      if (controller.signal.aborted) throw new ReadStopped('stopped', { cause: err });
+      if (timeout.aborted) {
+        throw new Error(`${url}: timed out after ${String(this.timeoutMs)} ms`, { cause: err });
+      }
+      if (err instanceof Error && err.message.startsWith(url)) throw err;
+      throw new Error(`${url}: ${failureReason(err)}`, { cause: err });
+    } finally {
+      if (this.controller === controller) this.controller = undefined;
+    }
+  }
+}
diff --git a/src/services/raid-event-service.test.ts b/src/services/raid-event-service.test.ts
index bd9cf9594f329fc36c1d802e7d9256b3fa7c8389..69478243b5da0c97a5723ab2d43d5166b9dd60f1 100644
--- a/src/services/raid-event-service.test.ts
+++ b/src/services/raid-event-service.test.ts
@@ -4,6 +4,7 @@ import { at } from '../../test/support/max-bosses.js';
 import { readMaxEventFeed } from '../../test/support/max-events.js';
 import { featuredAt } from '../domain/time/max-events.js';
 import { readRaidEventFeed } from '../../test/support/raid-events.js';
+import { readSpawnEventFeed } from '../../test/support/spawn-events.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import { RaidEventService, type FetchEvents } from './raid-event-service.js';
 import type { ResearchEventStorage } from '../db/repositories/research-event-repository.js';
@@ -550,6 +551,64 @@ describe('RaidEventService', () => {
     });
   });
 
+  describe('the events with spawns (plan 8R-4)', () => {
+    const ids = (events: RaidEventService) => events.spawnEvents().map((event) => event.id);
+
+    it('gives the global events with spawns of each read, in memory', async () => {
+      const fetch = vi.fn<FetchEvents>(() =>
+        Promise.resolve(reply(200, JSON.stringify(readSpawnEventFeed()))),
+      );
+      const { events } = service(fetch, { now: () => at('2026-10-22T12:00') });
+      expect(events.spawnEvents()).toEqual([]);
+      await events.refresh();
+      expect(ids(events)).toEqual(
+        expect.arrayContaining([
+          'halloween-2026-part-1',
+          'november-communityday2026',
+          'pokemonspotlighthour2026-11-05',
+        ]),
+      );
+      // The Global Wild Area counts (Matt's R-M5); a city's does not.
+      expect(ids(events)).toContain('pokemon-go-wild-area-2026-global');
+      expect(ids(events)).not.toContain('pokemon-go-wild-area-2026-sendai-japan');
+    });
+
+    it('keeps one on now that a read drops while it lasts, and drops one not begun', async () => {
+      const full = readSpawnEventFeed() as { eventID?: string }[];
+      let feed = full;
+      let now = at('2026-10-28T12:00');
+      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, JSON.stringify(feed))));
+      const { events } = service(fetch, { now: () => now });
+      await events.refresh();
+      feed = full.filter(
+        (item) =>
+          item.eventID !== 'halloween-2026-part-1' && item.eventID !== 'november-communityday2026',
+      );
+      await events.refresh();
+      expect(ids(events)).toContain('halloween-2026-part-1');
+      expect(ids(events)).not.toContain('november-communityday2026');
+      now = at('2026-11-01T10:00');
+      await events.refresh();
+      expect(ids(events)).not.toContain('halloween-2026-part-1');
+    });
+
+    it('keeps what it has when a read has no flags, or fails', async () => {
+      const full = readSpawnEventFeed() as { extraData?: unknown }[];
+      let body = JSON.stringify(full);
+      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, body)));
+      const { events } = service(fetch, { now: () => at('2026-10-28T12:00') });
+      await events.refresh();
+      const before = events.spawnEvents();
+      expect(before.length).toBeGreaterThan(0);
+      body = JSON.stringify(full.map(({ extraData: _dropped, ...rest }) => rest));
+      await events.refresh();
+      expect(events.spawnEvents()).toEqual(before);
+      body = 'not json';
+      await events.refresh();
+      expect(events.spawnEvents()).toEqual(before);
+    });
+  });
+
   describe('the events with field research (plan 8R-1)', () => {
     it('keeps those of each read, as seen, and gives the kept ones after a restart', async () => {
       const store = new MemoryResearchEvents();
diff --git a/src/services/raid-event-service.ts b/src/services/raid-event-service.ts
index ecd4166c5ebcea06740cc73e75862495103724f3..79ae2be084d7fe89e0cc1ccf0667492513cf8250 100644
--- a/src/services/raid-event-service.ts
+++ b/src/services/raid-event-service.ts
@@ -12,6 +12,7 @@ import {
   parseResearchEventFeed,
   type ResearchEvent,
 } from '../domain/time/research-events.js';
+import { parseSpawnEventFeed, type SpawnEvent } from '../domain/time/spawn-events.js';
 import type { ResearchEventStorage } from '../db/repositories/research-event-repository.js';
 import type { KeptMaxEvents, MaxEventStorage } from '../db/repositories/max-event-repository.js';
 import type { Logger } from '../log.js';
@@ -113,6 +114,15 @@ export interface ResearchEventProvider {
   onResearchChange?(listener: () => void): void;
 }
 
+/**
+ * The global events with spawns (plan 8R-4, design 5): a spawn report is costumed where one on
+ * now lists it costumed (`EventSpawnService`).
+ */
+export interface SpawnEventProvider {
+  /** Those of the last good read, with those on now that the feed has dropped since. */
+  spawnEvents(): readonly SpawnEvent[];
+}
+
 export type RefreshResult =
   | { status: 'updated'; events: number }
   /** The feed could not be read or was not valid; the events in use are unchanged. */
@@ -128,10 +138,11 @@ export type RefreshResult =
  * kept after a read that no longer lists it. One that has not begun yet and is no longer listed
  * was moved or cancelled, and is dropped. The max events and the big events are merged by the
  * same rules and kept in the database (`maxEvents`, plan 8X-F; loaded by `loadMax`), as are the
- * events with field research (`research`, `loadResearch`).
+ * events with field research (`research`, `loadResearch`). The events with spawns (plan 8R-4)
+ * are kept in memory only, from the same read as the research events.
  */
 export class RaidEventService
-  implements RaidEventProvider, MaxEventProvider, ResearchEventProvider
+  implements RaidEventProvider, MaxEventProvider, ResearchEventProvider, SpawnEventProvider
 {
   private current: readonly RaidEvent[] = [];
   private research: readonly ResearchEvent[] = [];
@@ -140,6 +151,7 @@ export class RaidEventService
   private researchFlagsMissingTold = false;
   private currentMax: readonly MaxEvent[] = [];
   private currentBig: readonly BigEvent[] = [];
+  private currentSpawns: readonly SpawnEvent[] = [];
   private readonly timeoutMs: number;
   private readonly retryMs: number;
   private controller: AbortController | undefined;
@@ -172,6 +184,10 @@ export class RaidEventService
     return this.research;
   }
 
+  spawnEvents(): readonly SpawnEvent[] {
+    return this.currentSpawns;
+  }
+
   onResearchChange(listener: () => void): void {
     this.researchListeners.push(listener);
   }
@@ -414,6 +430,8 @@ export class RaidEventService
         return;
       }
       this.researchFlagsMissingTold = false;
+      // The events with spawns (plan 8R-4) need the same flags; kept before the database's part.
+      this.currentSpawns = this.mergedSpawns(parseSpawnEventFeed(flagged, zone));
       const seen = parseResearchEventFeed(flagged, zone);
       const now = (this.options.now ?? Date.now)();
       const listed = new Set(seen.map((event) => event.id));
@@ -432,6 +450,19 @@ export class RaidEventService
     }
   }
 
+  /**
+   * The events with spawns just read, plus those on now that the read no longer lists (as
+   * `mergedBig`): one not begun and no longer listed was moved or cancelled, one over is of no
+   * use.
+   */
+  private mergedSpawns(read: readonly SpawnEvent[]): SpawnEvent[] {
+    const now = (this.options.now ?? Date.now)();
+    const kept = this.currentSpawns.filter(
+      (old) => old.start <= now && now < old.end && !read.some((event) => event.id === old.id),
+    );
+    return [...read, ...kept].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
+  }
+
   private async readFeed(): Promise<{
     raid: RaidEvent[];
     max: ParsedMaxEvents;
diff --git a/src/services/spawn-service.test.ts b/src/services/spawn-service.test.ts
index 678b0ec93151d338c81655aec4253b382b0b2424..d7eec52b05556de0879d3127944380146f0da88b 100644
--- a/src/services/spawn-service.test.ts
+++ b/src/services/spawn-service.test.ts
@@ -365,6 +365,66 @@ describe('SpawnService', () => {
     expect(UNOWN_DEX).toBe(201);
   });
 
+  it('calls a report costumed where an event on lists it costumed, in the report and to the notifier', async () => {
+    const made = await partyServiceWith();
+    const told: { costumed?: boolean; view: SpawnView }[] = [];
+    const asked: number[] = [];
+    const service = new SpawnService({
+      gateway: made.gateway,
+      raidBosses: { bosses: () => [] },
+      gameData: { catalogue: catalogueFixture() },
+      notify: { spawnReported: (news) => told.push(news) },
+      // Dratini costumed and plain (plan 8R-4: then costumed), Pikachu plain only.
+      costumes: {
+        sightingsAt: (moment) => {
+          asked.push(moment);
+          return [
+            { key: 'dratini', dex: 147, costumed: false },
+            { key: 'dratini', dex: 147, costumed: true },
+            { key: 'pikachu', dex: 25, costumed: false },
+          ];
+        },
+      },
+      settings: made.settings,
+      log: made.log,
+      now: () => made.clock.now,
+    });
+    const outcome = await service.report(report(made.gateway.guildId));
+    expect(outcome).toMatchObject({ kind: 'posted', costumed: true });
+    expect(asked).toEqual([made.clock.now]);
+    expect(told[0]?.costumed).toBe(true);
+    expect(told[0]?.view.costumed).toBe(true);
+    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
+    expect(textDisplays(posted?.message)[0]).toMatch(/^### Wild costumed Dratini\n/);
+    const plain = await service.report(
+      report(made.gateway.guildId, { pokemon: { dex: 25, key: 'pikachu', name: 'Pikachu' } }),
+    );
+    expect(plain).not.toHaveProperty('costumed');
+    expect(told[1]).not.toHaveProperty('costumed');
+    await service.flush();
+  });
+
+  it('posts a report as plain when the events’ spawns cannot be asked, and says so', async () => {
+    const made = await partyServiceWith();
+    const service = new SpawnService({
+      gateway: made.gateway,
+      raidBosses: { bosses: () => [] },
+      gameData: { catalogue: catalogueFixture() },
+      costumes: {
+        sightingsAt: () => {
+          throw new Error('broken');
+        },
+      },
+      settings: made.settings,
+      log: made.log,
+    });
+    expect(await service.report(report(made.gateway.guildId))).toMatchObject({ kind: 'posted' });
+    expect(
+      made.entries.filter((entry) => entry.msg === 'could not tell whether a spawn is costumed'),
+    ).toHaveLength(1);
+    await service.flush();
+  });
+
   it('hands the notifier the moment the report goes away, the one the report shows', async () => {
     const made = await partyServiceWith();
     const told: { goneAt?: number; eventAt: number }[] = [];
@@ -606,6 +666,19 @@ describe('the messages of a spawn report', () => {
     ]);
   });
 
+  it('says "costumed" before the name of a costumed spawn in every message (plan 8R-4)', () => {
+    const costumed: SpawnView = { ...view, costumed: true };
+    expect(textDisplays(spawnMessage(costumed, SPAWN_FOOTER, GONE))[0]).toMatch(
+      /^### Wild costumed Dratini\n/,
+    );
+    expect(spawnSentence({ ...costumed, iv: 'zero' }, WEST_CHANNEL)).toBe(
+      `A wild costumed **Dratini** with 0% IVs has been reported in <#${WEST_CHANNEL}> by **Alice**.`,
+    );
+    expect(spawnTextMessage(costumed, SPAWN_FOOTER).content).toMatch(
+      /^A wild costumed \*\*Dratini\*\* has been reported by/,
+    );
+  });
+
   it('shows no working link a member typed, in the details or in their name, in any message', () => {
     const typed: SpawnView = {
       pokemon: 'Dratini',
diff --git a/src/services/spawn-service.ts b/src/services/spawn-service.ts
index 38eab73b74322fb23508e6cc2c15593f385f8388..00052414dbd4606b6f88395ffc28007550c11e7d 100644
--- a/src/services/spawn-service.ts
+++ b/src/services/spawn-service.ts
@@ -19,6 +19,8 @@ import {
 import { placeImage } from '../render/place.js';
 import type { NamedMember } from '../render/text.js';
 import { pokemonPicture } from '../domain/pogo/pokemon-icons.js';
+import { costumedSpawn } from '../domain/time/spawn-events.js';
+import type { EventSpawnProvider } from './event-spawn-service.js';
 import type { GameDataProvider } from './game-data-service.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
 
@@ -54,8 +56,11 @@ export interface SpawnNews extends SpawnReport {
 }
 
 export type SpawnOutcome =
-  /** The report stands in the region's channel, as this message. */
-  | { kind: 'posted'; channelId: string; messageId: string }
+  /**
+   * The report stands in the region's channel, as this message; `costumed` where an event on
+   * lists the Pokémon costumed (plan 8R-4).
+   */
+  | { kind: 'posted'; channelId: string; messageId: string; costumed?: true }
   /** The region's channel is gone. */
   | { kind: 'no-channel' }
   /** Discord refused the message: the bot may not post in the region's channel, or not see it. */
@@ -83,6 +88,11 @@ export interface SpawnServiceOptions {
   raidBosses: Pick<RaidBossProvider, 'bosses'>;
   /** The catalogue and the icon files that exist: the picture of every other Pokémon. */
   gameData: GameDataProvider;
+  /**
+   * The spawns of the events on (plan 8R-4): a report is costumed where one lists the
+   * Pokémon's entry costumed (`costumedSpawn`). Without it no report is.
+   */
+  costumes?: Pick<EventSpawnProvider, 'sightingsAt'>;
   /** Told of every report that was posted, to tell who wants that Pokémon. */
   notify?: { spawnReported(news: SpawnNews): void };
   /**
@@ -189,8 +199,24 @@ export class SpawnService {
     return posting;
   }
 
+  /**
+   * Whether an event on at `at` lists the Pokémon costumed (plan 8R-4); a provider that fails
+   * is logged, and the report goes out plain.
+   */
+  private costumed(key: string, at: number): boolean {
+    const { costumes, log } = this.options;
+    try {
+      return costumes !== undefined && costumedSpawn(costumes.sightingsAt(at), { key });
+    } catch (err) {
+      log.warn({ err, pokemon: key }, 'could not tell whether a spawn is costumed');
+      return false;
+    }
+  }
+
   private async post(report: SpawnReport): Promise<SpawnOutcome> {
     const { gateway, notify, settings, log } = this.options;
+    const eventAt = this.now();
+    const costumed = this.costumed(report.pokemon.key, eventAt);
     const view: SpawnView = {
       pokemon: report.pokemon.name,
       iv: report.iv,
@@ -198,8 +224,8 @@ export class SpawnService {
       reporter: report.reporter,
       image: this.pictureOf(report.pokemon.key),
       near: report.near,
+      ...(costumed ? { costumed: true } : {}),
     };
-    const eventAt = this.now();
     // Without the permission to embed Discord would show the sentence alone: as text then.
     const footer = spawnFooter(settings.features.notifications);
     const goneAt = eventAt + this.deleteAfterMs;
@@ -238,8 +264,20 @@ export class SpawnService {
         log.warn({ err, guild: report.guildId }, 'could not post an Unown sighting');
       }
     }
-    notify?.spawnReported({ ...report, view, messageId, eventAt, goneAt });
-    return { kind: 'posted', channelId: report.regionChannelId, messageId };
+    notify?.spawnReported({
+      ...report,
+      view,
+      messageId,
+      eventAt,
+      goneAt,
+      ...(costumed ? { costumed: true } : {}),
+    });
+    return {
+      kind: 'posted',
+      channelId: report.regionChannelId,
+      messageId,
+      ...(costumed ? { costumed: true as const } : {}),
+    };
   }
 
   /**
diff --git a/test/fixtures/leekduck-event-halloween-2026-part-1.html b/test/fixtures/leekduck-event-halloween-2026-part-1.html
new file mode 100644
index 0000000000000000000000000000000000000000..e5ac8efa4e5d798e20d5a0c9f675aef1f230ec53
--- /dev/null
+++ b/test/fixtures/leekduck-event-halloween-2026-part-1.html
@@ -0,0 +1,8 @@
+<!DOCTYPE html>
+<html lang="en"><head><meta charset="utf-8"><title>Pokémon GO Halloween 2026 Part I</title></head><body><article class="event-page">
+<!-- The Spawns section and what follows it, as Leek Duck served them on 2026-10-22 (https://leekduck.com/events/halloween-2026-part-1/); the rest of the page cut. -->
+<h2 id="spawns" class="event-section-header spawns">
+Spawns <img src="https://cdn.leekduck.com/assets/img/events/icons/wild.png" /></h2><p>Event-themed Pokémon appearing in the wild include the following, with more encounters to discover.</p><ul class="pkmn-list-flex"><li class="pkmn-list-item"><div class="pkmn-list-img pokemon-cutout poison"><img src="https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-10-27-halloween-2026-part-1/zubat-top-hat.png" alt="Zubat wearing a top hat" loading="lazy" /><span class="pokemon-cutout-shiny" role="img" aria-label="Can be Shiny"><svg aria-hidden="true" viewBox="0 0 250 250"><use href="#shiny-icon"></use></svg></span></div><div class="pkmn-name">Zubat wearing a top hat</div></li><li class="pkmn-list-item"><div class="pkmn-list-img pokemon-cutout ghost pokemon-cutout--sprite"><img src="https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pokemon_icon_355_00.png" alt="Duskull" loading="lazy" /><span class="pokemon-cutout-shiny" role="img" aria-label="Can be Shiny"><svg aria-hidden="true" viewBox="0 0 250 250"><use href="#shiny-icon"></use></svg></span></div><div class="pkmn-name">Duskull</div></li><li class="pkmn-list-item"><div class="pkmn-list-img pokemon-cutout water pokemon-cutout--sprite"><img src="https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm393.cHALLOWEEN_2021_NOEVOLVE.icon.png" alt="Piplup wearing a Halloween Mischief costume" loading="lazy" /><span class="pokemon-cutout-shiny" role="img" aria-label="Can be Shiny"><svg aria-hidden="true" viewBox="0 0 250 250"><use href="#shiny-icon"></use></svg></span></div><div class="pkmn-name">Piplup wearing a Halloween Mischief costume</div></li></ul><p>If you’re lucky, you might also encounter <strong>Drifblim wearing a Halloween Mischief costume</strong>! All Pokémon listed above can be Shiny.</p><h2 id="raids" class="event-section-header raids">
+Raids <img src="https://cdn.leekduck.com/assets/img/events/icons/raids.png" /></h2><h3 id="one-star-raids">One-Star Raids</h3><p>The following Pokémon will appear in one-star raids. Both can be Shiny!</p><ul class="pkmn-list-flex"><li class="pkmn-list-item"><div class="pkmn-list-img pokemon-cutout electric"><img src="https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-10-27-halloween-2026-part-1/pikachu-hat-capelet.png" alt="Pikachu wearing a hat and capelet" loading="lazy" /><span class="pokemon-cutout-shiny" role="img" aria-label="Can be Shiny"><svg aria-hidden="true" viewBox="0 0 250 250"><use href="#shiny-icon"></use></svg></span></div><div class="pkmn-name">Pikachu wearing a hat and capelet</div></li><li class="pkmn-list-item"><div class="pkmn-list-img pokemon-cutout ghost"><img src="https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-10-27-halloween-2026-part-1/sinistea-bow.png" alt="Sinistea wearing a bow" loading="lazy" /><span class="pokemon-cutout-shiny" role="img" aria-label="Can be Shiny"><svg aria-hidden="true" viewBox="0 0 250 250"><use href="#shiny-icon"></use></svg></span></div><div class="pkmn-name">Sinistea wearing a bow</div></li></ul><h2 id="research" class="event-section-header research">
+Research <img src="https://cdn.leekduck.com/assets/img/events/icons/research.png" /></h2><h2 id="field-research">Field Research</h2><p>Complete event-themed Field Research tasks to encounter event-themed Pokémon. Specific tasks and encounters have not yet been announced.</p>
+</article></body></html>
diff --git a/test/fixtures/leekduck-event-spotlight-2026-11-05.html b/test/fixtures/leekduck-event-spotlight-2026-11-05.html
new file mode 100644
index 0000000000000000000000000000000000000000..32cab058e21964ae207fca4df1e20d6104b419f3
--- /dev/null
+++ b/test/fixtures/leekduck-event-spotlight-2026-11-05.html
@@ -0,0 +1,6 @@
+<!DOCTYPE html>
+<html lang="en"><head><meta charset="utf-8"><title>Teddiursa wearing a witch hat Spotlight Hour</title></head><body><article class="event-page">
+<!-- The Spawns section and what follows it, as Leek Duck served them on 2026-10-22 (https://leekduck.com/events/pokemonspotlighthour2026-11-05/); the rest of the page cut. -->
+<h2 id="spawns" class="event-section-header spawns">
+Spawns <img src="https://cdn.leekduck.com/assets/img/events/icons/wild.png" /></h2><p>The following Pokémon will appear more frequently in the wild.</p><ul class="pkmn-list-flex"><li class="pkmn-list-item" style="z-index: 256;"><div class="pkmn-list-img normal"><img src="https://cdn.leekduck.com/assets/img/pokemon_icons/pm216.cHALLOWEEN_2025.icon.png" /></div><img class="shiny-icon" src="https://cdn.leekduck.com/assets/img/icons/shiny-icon.png" alt="shiny" /><div class="pkmn-name">Teddiursa wearing a witch hat</div></li></ul>
+</article></body></html>
diff --git a/test/fixtures/scrapedduck-events-2026-10-22.json b/test/fixtures/scrapedduck-events-2026-10-22.json
new file mode 100644
index 0000000000000000000000000000000000000000..2bdc79607b9de012496cfd8431ce11b66f7f4cb0
--- /dev/null
+++ b/test/fixtures/scrapedduck-events-2026-10-22.json
@@ -0,0 +1,1595 @@
+[
+    {
+        "eventID": "pokemon-tcg-30th-celebration",
+        "name": "Pokémon TCG: 30th Celebration",
+        "eventType": "event",
+        "heading": "Event",
+        "link": "https://leekduck.com/events/pokemon-tcg-30th-celebration/",
+        "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-09-27-pokemon-tcg-30th-celebration/pokemon-tcg-30th-celebration.jpg",
+        "start": null,
+        "end": null,
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "dialga-in-5-star-raid-battles-october-2026",
+        "name": "Dialga in 5-star Raid Battles",
+        "eventType": "raid-battles",
+        "heading": "Raid Battles",
+        "link": "https://leekduck.com/events/dialga-in-5-star-raid-battles-october-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/dialgaraids.jpg",
+        "start": null,
+        "end": null,
+        "extraData": {
+            "raidbattles": {
+                "bosses": [
+                    {
+                        "name": "Dialga",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_483_00.png",
+                        "canBeShiny": true
+                    }
+                ],
+                "shinies": [
+                    {
+                        "name": "Dialga",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_483_00_shiny.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "mega-dragonite-in-mega-raids-october-2026",
+        "name": "Mega Dragonite in Mega Raids",
+        "eventType": "raid-battles",
+        "heading": "Raid Battles",
+        "link": "https://leekduck.com/events/mega-dragonite-in-mega-raids-october-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/mega-default.jpg",
+        "start": null,
+        "end": null,
+        "extraData": {
+            "raidbattles": {
+                "bosses": [
+                    {
+                        "name": "Mega Dragonite",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm149.fMEGA.icon.png",
+                        "canBeShiny": true
+                    }
+                ],
+                "shinies": [
+                    {
+                        "name": "Dragonite",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_149_00_shiny.png"
+                    },
+                    {
+                        "name": "Mega Dragonite",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm149.fMEGA.s.icon.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "raidhour20261021",
+        "name": "Palkia Raid Hour",
+        "eventType": "raid-hour",
+        "heading": "Raid Hour",
+        "link": "https://leekduck.com/events/raidhour20261021/",
+        "image": "https://cdn.leekduck.com/assets/img/events/raidhour.jpg",
+        "start": null,
+        "end": null,
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "pokemonspotlighthour2026-10-22",
+        "name": "Morelull Spotlight Hour",
+        "eventType": "pokemon-spotlight-hour",
+        "heading": "Pokémon Spotlight Hour",
+        "link": "https://leekduck.com/events/pokemonspotlighthour2026-10-22/",
+        "image": "https://cdn.leekduck.com/assets/img/events/pokemonspotlighthour.jpg",
+        "start": "2026-10-22T18:00:00.000",
+        "end": "2026-10-22T19:00:00.000",
+        "extraData": {
+            "spotlight": {
+                "name": "Morelull",
+                "canBeShiny": true,
+                "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm755.icon.png",
+                "bonus": "2× Catch Stardust",
+                "list": [
+                    {
+                        "name": "Morelull",
+                        "canBeShiny": true,
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm755.icon.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "dynamax-uxie-mesprit-azelf-max-battle-day-2026",
+        "name": "Dynamax Uxie, Mesprit, and Azelf Max Battle Day",
+        "eventType": "max-battles",
+        "heading": "Max Battles",
+        "link": "https://leekduck.com/events/dynamax-uxie-mesprit-azelf-max-battle-day-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-10-24-dynamax-uxie-mesprit-azelf-max-battle-day-2026/dynamax-uxie-mesprit-azelf-max-battle-day.jpg",
+        "start": "2026-10-24T14:00:00.000",
+        "end": "2026-10-24T17:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "pokemon-night-out-2026-twitch-drops",
+        "name": "Twitch Drops for Pokémon Night Out 2026",
+        "eventType": "twitch-drops",
+        "heading": "Twitch Drops",
+        "link": "https://leekduck.com/events/pokemon-night-out-2026-twitch-drops/",
+        "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-10-24-pokemon-night-out-2026-twitch-drops/pokemon-night-out.jpg",
+        "start": "2026-10-25T02:30:00.000Z",
+        "end": "2026-10-25T06:59:00.000Z",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "pokemon-night-out-los-angeles-2026",
+        "name": "Pokémon Night Out 2026 - Los Angeles",
+        "eventType": "event",
+        "heading": "Event",
+        "link": "https://leekduck.com/events/pokemon-night-out-los-angeles-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/pokemon-night-out-2026.jpg",
+        "start": "2026-10-25T02:30:00.000Z",
+        "end": "2026-10-25T06:59:59.000Z",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "minior-showers-orionids-2026",
+        "name": "Minior Showers: Orionids 2026",
+        "eventType": "event",
+        "heading": "Event",
+        "link": "https://leekduck.com/events/minior-showers-orionids-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/minior-showers-2026.jpg",
+        "start": "2026-10-19T17:00:00.000",
+        "end": "2026-10-24T23:59:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "pokemon-go-city-safari-boston-2026-rescheduled",
+        "name": "Pokémon GO City Safari: Boston (Rescheduled)",
+        "eventType": "city-safari",
+        "heading": "City Safari",
+        "link": "https://leekduck.com/events/pokemon-go-city-safari-boston-2026-rescheduled/",
+        "image": "https://cdn.leekduck.com/assets/img/events/city-safari-boston-2026.jpg",
+        "start": "2026-10-24T10:00:00.000",
+        "end": "2026-10-25T18:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "max-mondays-2026-10-26",
+        "name": "Dynamax Sableye during Max Monday",
+        "eventType": "max-mondays",
+        "heading": "Max Mondays",
+        "link": "https://leekduck.com/events/max-mondays-2026-10-26/",
+        "image": "https://cdn.leekduck.com/assets/img/events/max-battles-kanto.jpg",
+        "start": "2026-10-26T06:00:00.000",
+        "end": "2026-10-26T21:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "gbl-twilight-trails_ultra-league_master-league-mega-edition_fantasy-cup-great-league-edition",
+        "name": "Ultra League, Master League: Mega Edition, and Fantasy Cup: Great League Edition | Twilight Trails",
+        "eventType": "go-battle-league",
+        "heading": "GO Battle League",
+        "link": "https://leekduck.com/events/gbl-twilight-trails_ultra-league_master-league-mega-edition_fantasy-cup-great-league-edition/",
+        "image": "https://cdn.leekduck.com/assets/img/events/go-battle-league-ultra-league-machamp-swampert.jpg",
+        "start": "2026-10-20T20:00:00.000Z",
+        "end": "2026-10-27T20:00:00.000Z",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "mega-charizard-x-mega-charizard-y-in-mega-raids-october-2026",
+        "name": "Mega Charizard X and Mega Charizard Y in Mega Raids",
+        "eventType": "raid-battles",
+        "heading": "Raid Battles",
+        "link": "https://leekduck.com/events/mega-charizard-x-mega-charizard-y-in-mega-raids-october-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/mega-default.jpg",
+        "start": "2026-10-21T06:00:00.000",
+        "end": "2026-10-27T22:00:00.000",
+        "extraData": {
+            "raidbattles": {
+                "bosses": [
+                    {
+                        "name": "Mega Charizard X",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_006_51.png",
+                        "canBeShiny": true
+                    },
+                    {
+                        "name": "Mega Charizard Y",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_006_52.png",
+                        "canBeShiny": true
+                    }
+                ],
+                "shinies": [
+                    {
+                        "name": "Charizard",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_006_00_shiny.png"
+                    },
+                    {
+                        "name": "Mega Charizard X",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_006_51_shiny.png"
+                    },
+                    {
+                        "name": "Mega Charizard Y",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_006_52_shiny.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "palkia-in-5-star-raid-battles-october-2026",
+        "name": "Palkia in 5-star Raid Battles",
+        "eventType": "raid-battles",
+        "heading": "Raid Battles",
+        "link": "https://leekduck.com/events/palkia-in-5-star-raid-battles-october-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/palkiaraid.jpg",
+        "start": "2026-10-21T06:00:00.000",
+        "end": "2026-10-27T22:00:00.000",
+        "extraData": {
+            "raidbattles": {
+                "bosses": [
+                    {
+                        "name": "Palkia",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_484_00.png",
+                        "canBeShiny": true
+                    }
+                ],
+                "shinies": [
+                    {
+                        "name": "Palkia",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_484_00_shiny.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "raidhour20261028",
+        "name": "Giratina (Origin Forme) Raid Hour",
+        "eventType": "raid-hour",
+        "heading": "Raid Hour",
+        "link": "https://leekduck.com/events/raidhour20261028/",
+        "image": "https://cdn.leekduck.com/assets/img/events/raidhour.jpg",
+        "start": "2026-10-28T18:00:00.000",
+        "end": "2026-10-28T19:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "pokemonspotlighthour2026-10-29",
+        "name": "Gastly Spotlight Hour",
+        "eventType": "pokemon-spotlight-hour",
+        "heading": "Pokémon Spotlight Hour",
+        "link": "https://leekduck.com/events/pokemonspotlighthour2026-10-29/",
+        "image": "https://cdn.leekduck.com/assets/img/events/pokemonspotlighthour.jpg",
+        "start": "2026-10-29T18:00:00.000",
+        "end": "2026-10-29T19:00:00.000",
+        "extraData": {
+            "spotlight": {
+                "name": "Gastly",
+                "canBeShiny": true,
+                "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_092_00.png",
+                "bonus": "2× Evolution XP",
+                "list": [
+                    {
+                        "name": "Gastly",
+                        "canBeShiny": true,
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_092_00.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "chandelure-super-mega-raid-day-2026",
+        "name": "Chandelure Super Mega Raid Day",
+        "eventType": "raid-day",
+        "heading": "Raid Day",
+        "link": "https://leekduck.com/events/chandelure-super-mega-raid-day-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/chandelure-super-mega-raid-day-2026.jpg",
+        "start": "2026-10-31T14:00:00.000",
+        "end": "2026-10-31T17:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "halloween-2026-part-1",
+        "name": "Pokémon GO Halloween 2026 Part I",
+        "eventType": "event",
+        "heading": "Event",
+        "link": "https://leekduck.com/events/halloween-2026-part-1/",
+        "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-10-27-halloween-2026-part-1/halloween-2026-part-1.jpg",
+        "start": "2026-10-27T10:00:00.000",
+        "end": "2026-11-01T10:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "max-mondays-2026-11-02",
+        "name": "Dynamax Machop during Max Monday",
+        "eventType": "max-mondays",
+        "heading": "Max Mondays",
+        "link": "https://leekduck.com/events/max-mondays-2026-11-02/",
+        "image": "https://cdn.leekduck.com/assets/img/events/max-battles-kanto.jpg",
+        "start": "2026-11-02T06:00:00.000",
+        "end": "2026-11-02T21:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "go-pass-october-2026",
+        "name": "GO Pass: October",
+        "eventType": "go-pass",
+        "heading": "GO Pass",
+        "link": "https://leekduck.com/events/go-pass-october-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-10-06-go-pass-october-2026/go-pass-october-2026.jpg",
+        "start": "2026-10-06T10:00:00.000",
+        "end": "2026-11-03T10:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "gbl-twilight-trails_master-league_mega-halloween-cup-great-league-edition",
+        "name": "Master League and Mega Halloween Cup: Great League Edition | Twilight Trails",
+        "eventType": "go-battle-league",
+        "heading": "GO Battle League",
+        "link": "https://leekduck.com/events/gbl-twilight-trails_master-league_mega-halloween-cup-great-league-edition/",
+        "image": "https://cdn.leekduck.com/assets/img/events/gobattleleague-master-key.jpg",
+        "start": "2026-10-27T21:00:00.000Z",
+        "end": "2026-11-03T21:00:00.000Z",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "shadow-landorus-incarnate-forme-in-shadow-raids-october-2026",
+        "name": "Shadow Landorus (Incarnate Forme) in Shadow Raids",
+        "eventType": "raid-battles",
+        "heading": "Raid Battles",
+        "link": "https://leekduck.com/events/shadow-landorus-incarnate-forme-in-shadow-raids-october-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+        "start": "2026-10-07T06:00:00.000",
+        "end": "2026-11-03T22:00:00.000",
+        "extraData": {
+            "raidbattles": {
+                "bosses": [
+                    {
+                        "name": "Landorus (Incarnate)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_645_11.png",
+                        "canBeShiny": true
+                    }
+                ],
+                "shinies": [
+                    {
+                        "name": "Landorus (Incarnate)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_645_11_shiny.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "giratina-origin-forme-in-5-star-raid-battles-october-2026",
+        "name": "Giratina (Origin Forme) in 5-star Raid Battles",
+        "eventType": "raid-battles",
+        "heading": "Raid Battles",
+        "link": "https://leekduck.com/events/giratina-origin-forme-in-5-star-raid-battles-october-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/giratinaoriginforme.jpg",
+        "start": "2026-10-28T06:00:00.000",
+        "end": "2026-11-03T22:00:00.000",
+        "extraData": {
+            "raidbattles": {
+                "bosses": [
+                    {
+                        "name": "Giratina (Origin)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_487_12.png",
+                        "canBeShiny": true
+                    }
+                ],
+                "shinies": [
+                    {
+                        "name": "Giratina (Origin)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_487_12_shiny.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "raidhour20261104",
+        "name": "Giratina (Altered Forme) Raid Hour",
+        "eventType": "raid-hour",
+        "heading": "Raid Hour",
+        "link": "https://leekduck.com/events/raidhour20261104/",
+        "image": "https://cdn.leekduck.com/assets/img/events/raidhour.jpg",
+        "start": "2026-11-04T18:00:00.000",
+        "end": "2026-11-04T19:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "pokemonspotlighthour2026-11-05",
+        "name": "Teddiursa wearing a witch hat Spotlight Hour",
+        "eventType": "pokemon-spotlight-hour",
+        "heading": "Pokémon Spotlight Hour",
+        "link": "https://leekduck.com/events/pokemonspotlighthour2026-11-05/",
+        "image": "https://cdn.leekduck.com/assets/img/events/pokemonspotlighthour.jpg",
+        "start": "2026-11-05T18:00:00.000",
+        "end": "2026-11-05T19:00:00.000",
+        "extraData": {
+            "spotlight": {
+                "name": "Teddiursa wearing a witch hat",
+                "canBeShiny": true,
+                "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm216.cHALLOWEEN_2025.icon.png",
+                "bonus": "2× Evolution XP",
+                "list": [
+                    {
+                        "name": "Teddiursa wearing a witch hat",
+                        "canBeShiny": true,
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm216.cHALLOWEEN_2025.icon.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "halloween-2026-part-2",
+        "name": "Pokémon GO Halloween 2026 Part II",
+        "eventType": "event",
+        "heading": "Event",
+        "link": "https://leekduck.com/events/halloween-2026-part-2/",
+        "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-01-halloween-2026-part-2/halloween-2026-part-2.jpg",
+        "start": "2026-11-01T10:00:00.000",
+        "end": "2026-11-05T20:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "pokemon-go-wild-area-2026-sendai-japan",
+        "name": "Pokémon GO Wild Area 2026: Sendai • Tohoku",
+        "eventType": "wild-area",
+        "heading": "Wild Area",
+        "link": "https://leekduck.com/events/pokemon-go-wild-area-2026-sendai-japan/",
+        "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-06-pokemon-go-wild-area-2026-sendai-japan/key-art.jpg",
+        "start": "2026-11-06T01:00:00.000Z",
+        "end": "2026-11-08T09:00:00.000Z",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "pokemon-go-wild-area-2026-mexico-city",
+        "name": "Pokémon GO Wild Area 2026: Mexico City",
+        "eventType": "wild-area",
+        "heading": "Wild Area",
+        "link": "https://leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/",
+        "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-06-pokemon-go-wild-area-2026-mexico-city/key-art.jpg",
+        "start": "2026-11-06T16:00:00.000Z",
+        "end": "2026-11-09T00:00:00.000Z",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "mega-sableye-in-mega-raids-october-2026",
+        "name": "Mega Sableye in Mega Raids",
+        "eventType": "raid-battles",
+        "heading": "Raid Battles",
+        "link": "https://leekduck.com/events/mega-sableye-in-mega-raids-october-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/mega-default.jpg",
+        "start": "2026-10-28T06:00:00.000",
+        "end": "2026-11-08T22:00:00.000",
+        "extraData": {
+            "raidbattles": {
+                "bosses": [
+                    {
+                        "name": "Mega Sableye",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_302_51.png",
+                        "canBeShiny": true
+                    }
+                ],
+                "shinies": [
+                    {
+                        "name": "Sableye",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_302_00_shiny.png"
+                    },
+                    {
+                        "name": "Mega Sableye",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_302_51_shiny.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "giratina-altered-forme-in-5-star-raid-battles-november-2026",
+        "name": "Giratina (Altered Forme) in 5-star Raid Battles",
+        "eventType": "raid-battles",
+        "heading": "Raid Battles",
+        "link": "https://leekduck.com/events/giratina-altered-forme-in-5-star-raid-battles-november-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+        "start": "2026-11-04T06:00:00.000",
+        "end": "2026-11-08T22:00:00.000",
+        "extraData": {
+            "raidbattles": {
+                "bosses": [
+                    {
+                        "name": "Giratina (Altered)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_487_11.png",
+                        "canBeShiny": true
+                    }
+                ],
+                "shinies": [
+                    {
+                        "name": "Giratina (Altered)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_487_11_shiny.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "shadow-tornadus-incarnate-forme-in-shadow-raids-november-4-2026",
+        "name": "Shadow Tornadus (Incarnate Forme) in Shadow Raids",
+        "eventType": "raid-battles",
+        "heading": "Raid Battles",
+        "link": "https://leekduck.com/events/shadow-tornadus-incarnate-forme-in-shadow-raids-november-4-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+        "start": "2026-11-04T06:00:00.000",
+        "end": "2026-11-08T22:00:00.000",
+        "extraData": {
+            "raidbattles": {
+                "bosses": [
+                    {
+                        "name": "Tornadus (Incarnate)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_641_11.png",
+                        "canBeShiny": false
+                    }
+                ],
+                "shinies": []
+            },
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "gbl-twilight-trails_great-league-mega-edition_ultra-league-mega-edition_master-league-mega-edition-split-3",
+        "name": "Great League: Mega Edition, Ultra League: Mega Edition, and Master League: Mega Edition | Twilight Trails",
+        "eventType": "go-battle-league",
+        "heading": "GO Battle League",
+        "link": "https://leekduck.com/events/gbl-twilight-trails_great-league-mega-edition_ultra-league-mega-edition_master-league-mega-edition-split-3/",
+        "image": "https://cdn.leekduck.com/assets/img/events/go-battle-league-season-28-twilight-trails.png",
+        "start": "2026-11-03T21:00:00.000Z",
+        "end": "2026-11-10T21:00:00.000Z",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "pokemon-night-out-london-2026",
+        "name": "Pokémon Night Out 2026 - London",
+        "eventType": "event",
+        "heading": "Event",
+        "link": "https://leekduck.com/events/pokemon-night-out-london-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/pokemon-night-out-2026.jpg",
+        "start": "2026-11-10T18:00:00.000Z",
+        "end": "2026-11-10T22:30:00.000Z",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "into-the-wild-2026",
+        "name": "Into the Wild",
+        "eventType": "event",
+        "heading": "Event",
+        "link": "https://leekduck.com/events/into-the-wild-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-09-into-the-wild-2026/into-the-wild-2026.jpg",
+        "start": "2026-11-09T10:00:00.000",
+        "end": "2026-11-13T20:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": true
+            }
+        }
+    },
+    {
+        "eventID": "pokemon-go-wild-area-2026-global",
+        "name": "Pokémon GO Wild Area 2026: Global",
+        "eventType": "wild-area",
+        "heading": "Wild Area",
+        "link": "https://leekduck.com/events/pokemon-go-wild-area-2026-global/",
+        "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-14-pokemon-go-wild-area-2026-global/key-art.jpg",
+        "start": "2026-11-14T10:00:00.000",
+        "end": "2026-11-15T18:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "max-mondays-2026-11-16",
+        "name": "Max Monday: Pokémon to be announced",
+        "eventType": "max-mondays",
+        "heading": "Max Mondays",
+        "link": "https://leekduck.com/events/max-mondays-2026-11-16/",
+        "image": "https://cdn.leekduck.com/assets/img/events/max-battles-kanto.jpg",
+        "start": "2026-11-16T06:00:00.000",
+        "end": "2026-11-16T21:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "gbl-twilight-trails_great-league_ultra-league-mega-edition_2026-go-laic-cup",
+        "name": "Great League, Ultra League: Mega Edition, and 2026 GO LAIC Cup | Twilight Trails",
+        "eventType": "go-battle-league",
+        "heading": "GO Battle League",
+        "link": "https://leekduck.com/events/gbl-twilight-trails_great-league_ultra-league-mega-edition_2026-go-laic-cup/",
+        "image": "https://cdn.leekduck.com/assets/img/events/gobattle-greatleague-key.jpg",
+        "start": "2026-11-10T21:00:00.000Z",
+        "end": "2026-11-17T21:00:00.000Z",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "raidhour20261118",
+        "name": "Cresselia and Darkrai Raid Hour",
+        "eventType": "raid-hour",
+        "heading": "Raid Hour",
+        "link": "https://leekduck.com/events/raidhour20261118/",
+        "image": "https://cdn.leekduck.com/assets/img/events/raidhour.jpg",
+        "start": "2026-11-18T18:00:00.000",
+        "end": "2026-11-18T19:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "minior-showers-leonids-2026",
+        "name": "Minior Showers: Leonids 2026",
+        "eventType": "event",
+        "heading": "Event",
+        "link": "https://leekduck.com/events/minior-showers-leonids-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/minior-showers-2026.jpg",
+        "start": "2026-11-14T17:00:00.000",
+        "end": "2026-11-19T23:59:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "november-communityday2026",
+        "name": "Pawniard Community Day",
+        "eventType": "community-day",
+        "heading": "Community Day",
+        "link": "https://leekduck.com/events/november-communityday2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-21-november-communityday2026/pawniard-november-cd-2026.jpg",
+        "start": "2026-11-21T14:00:00.000",
+        "end": "2026-11-21T17:00:00.000",
+        "extraData": {
+            "communityday": {
+                "spawns": [
+                    {
+                        "name": "Pawniard",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_624_00.png"
+                    }
+                ],
+                "bonuses": [
+                    {
+                        "text": "Increased Spawns",
+                        "image": "https://cdn.leekduck.com/assets/img/events/bonuses/wildgrass.png"
+                    },
+                    {
+                        "text": "1/4 Egg Hatch Distance",
+                        "image": "https://cdn.leekduck.com/assets/img/events/bonuses/eggdistance.png"
+                    },
+                    {
+                        "text": "3-hour Incense",
+                        "image": "https://cdn.leekduck.com/assets/img/events/bonuses/incense.png"
+                    },
+                    {
+                        "text": "1-hour Lures*",
+                        "image": "https://cdn.leekduck.com/assets/img/events/bonuses/lure.png"
+                    },
+                    {
+                        "text": "2x Catch Candy",
+                        "image": "https://cdn.leekduck.com/assets/img/events/bonuses/candy.png"
+                    },
+                    {
+                        "text": "2x Chance for Trainers level 31 and up to receive Candy XL from catching Pokémon",
+                        "image": "https://cdn.leekduck.com/assets/img/events/bonuses/candyxl.png"
+                    },
+                    {
+                        "text": "One additional Special Trade can be made for a maximum of two for the day*",
+                        "image": "https://cdn.leekduck.com/assets/img/events/bonuses/trade.png"
+                    },
+                    {
+                        "text": "Trades made will require 50% less Stardust*",
+                        "image": "https://cdn.leekduck.com/assets/img/events/bonuses/stardust2x.png"
+                    }
+                ],
+                "bonusDisclaimers": [
+                    "The reduced Egg Hatch Distance applies to Eggs placed in an Incubator during the event.",
+                    "* While most bonuses are only active from 2:00 p.m. to 5:00 p.m. local time, these bonuses will be active from 2:00 p.m. to 9:00 p.m. local time.",
+                    "The three-hour Incense bonus excludes Daily Adventure Incense and the one-hour Lure bonus excludes Golden Lure Modules."
+                ],
+                "shinies": [
+                    {
+                        "name": "Pawniard",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_624_00_shiny.png"
+                    },
+                    {
+                        "name": "Bisharp",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_625_00_shiny.png"
+                    },
+                    {
+                        "name": "Kingambit",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm983.s.icon.png"
+                    }
+                ],
+                "specialresearch": [
+                    {
+                        "name": "Pawniard Community Day (1/3)",
+                        "step": 1,
+                        "tasks": [
+                            {
+                                "text": "Catch 3 Pokemon",
+                                "reward": {
+                                    "text": "Pawniard",
+                                    "image": "https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pokemon_icon_624_00.png"
+                                }
+                            },
+                            {
+                                "text": "Catch 5 Pokemon",
+                                "reward": {
+                                    "text": "Pawniard",
+                                    "image": "https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pokemon_icon_624_00.png"
+                                }
+                            },
+                            {
+                                "text": "Catch 10 Pokemon",
+                                "reward": {
+                                    "text": "Pawniard",
+                                    "image": "https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pokemon_icon_624_00.png"
+                                }
+                            },
+                            {
+                                "text": "Make 7 Nice Throws",
+                                "reward": {
+                                    "text": "Ultra Ball ×20",
+                                    "image": "https://cdn.leekduck.com/assets/img/items/Ultra%20Ball.png"
+                                }
+                            },
+                            {
+                                "text": "Make 5 Great Throws",
+                                "reward": {
+                                    "text": "Incubator ×1",
+                                    "image": "https://cdn.leekduck.com/assets/img/items/Incubator.png"
+                                }
+                            },
+                            {
+                                "text": "Make 5 Curveball Throws",
+                                "reward": {
+                                    "text": "Incense ×1",
+                                    "image": "https://cdn.leekduck.com/assets/img/items/Incense.png"
+                                }
+                            }
+                        ],
+                        "rewards": [
+                            {
+                                "text": "Pawniard",
+                                "image": "https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pokemon_icon_624_00.png"
+                            },
+                            {
+                                "text": "×50",
+                                "image": "https://cdn.leekduck.com/assets/img/candy/regular/624.png"
+                            },
+                            {
+                                "text": "×5",
+                                "image": "https://cdn.leekduck.com/assets/img/candy/xl/624.png"
+                            }
+                        ]
+                    },
+                    {
+                        "name": "Pawniard Community Day (2/3)",
+                        "step": 2,
+                        "tasks": [
+                            {
+                                "text": "Catch 3 Pokemon",
+                                "reward": {
+                                    "text": "Pawniard",
+                                    "image": "https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pokemon_icon_624_00.png"
+                                }
+                            },
+                            {
+                                "text": "Catch 5 Pokemon",
+                                "reward": {
+                                    "text": "Pawniard",
+                                    "image": "https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pokemon_icon_624_00.png"
+                                }
+                            },
+                            {
+                                "text": "Catch 10 Pokemon",
+                                "reward": {
+                                    "text": "Bisharp",
+                                    "image": "https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pokemon_icon_625_00.png"
+                                }
+                            },
+                            {
+                                "text": "Use 3 Berries to help catch Pokemon",
+                                "reward": {
+                                    "text": "Ultra Ball ×20",
+                                    "image": "https://cdn.leekduck.com/assets/img/items/Ultra%20Ball.png"
+                                }
+                            },
+                            {
+                                "text": "Use 5 Berries to help catch Pokemon",
+                                "reward": {
+                                    "text": "Charged TM ×1",
+                                    "image": "https://cdn.leekduck.com/assets/img/items/Charged%20TM.png"
+                                }
+                            },
+                            {
+                                "text": "Use 7 Berries to help catch Pokemon",
+                                "reward": {
+                                    "text": "Silver Pinap Berry ×3",
+                                    "image": "https://cdn.leekduck.com/assets/img/items/Silver%20Pinap%20Berry.png"
+                                }
+                            }
+                        ],
+                        "rewards": [
+                            {
+                                "text": "Pawniard",
+                                "image": "https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pokemon_icon_624_00.png"
+                            },
+                            {
+                                "text": "×7500",
+                                "image": "https://cdn.leekduck.com/assets/img/items/Stardust.png"
+                            },
+                            {
+                                "text": "×3",
+                                "image": "https://cdn.leekduck.com/assets/img/items/Rare%20Candy.png"
+                            }
+                        ]
+                    },
+                    {
+                        "name": "Pawniard Community Day (3/3)",
+                        "step": 3,
+                        "tasks": [
+                            {
+                                "text": "Catch 3 Pokemon",
+                                "reward": {
+                                    "text": "Pawniard",
+                                    "image": "https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pokemon_icon_624_00.png"
+                                }
+                            },
+                            {
+                                "text": "Catch 5 Pokemon",
+                                "reward": {
+                                    "text": "Pawniard",
+                                    "image": "https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pokemon_icon_624_00.png"
+                                }
+                            },
+                            {
+                                "text": "Catch 10 Pokemon",
+                                "reward": {
+                                    "text": "Bisharp",
+                                    "image": "https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pokemon_icon_625_00.png"
+                                }
+                            },
+                            {
+                                "text": "Spin 3 PokeStops or Gyms",
+                                "reward": {
+                                    "text": "Ultra Ball ×20",
+                                    "image": "https://cdn.leekduck.com/assets/img/items/Ultra%20Ball.png"
+                                }
+                            },
+                            {
+                                "text": "Spin 5 PokeStops or Gyms",
+                                "reward": {
+                                    "text": "Rocket Radar ×1",
+                                    "image": "https://cdn.leekduck.com/assets/img/items/Rocket%20Radar.png"
+                                }
+                            },
+                            {
+                                "text": "Explore 1 km",
+                                "reward": {
+                                    "text": "Premium Battle Pass ×1",
+                                    "image": "https://cdn.leekduck.com/assets/img/items/Premium%20Battle%20Pass.png"
+                                }
+                            }
+                        ],
+                        "rewards": [
+                            {
+                                "text": "Pawniard",
+                                "image": "https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pokemon_icon_624_00.png"
+                            },
+                            {
+                                "text": "10000 XP",
+                                "image": "https://cdn.leekduck.com/assets/img/icons/xp.png"
+                            },
+                            {
+                                "text": "×1",
+                                "image": "https://cdn.leekduck.com/assets/img/items/Rare%20Candy%20XL.png"
+                            }
+                        ]
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": true
+            }
+        }
+    },
+    {
+        "eventID": "dynamax-trails-2026",
+        "name": "Dynamax Trails",
+        "eventType": "event",
+        "heading": "Event",
+        "link": "https://leekduck.com/events/dynamax-trails-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+        "start": "2026-11-16T10:00:00.000",
+        "end": "2026-11-23T20:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "max-mondays-2026-11-23",
+        "name": "Dynamax Espurr during Max Monday",
+        "eventType": "max-mondays",
+        "heading": "Max Mondays",
+        "link": "https://leekduck.com/events/max-mondays-2026-11-23/",
+        "image": "https://cdn.leekduck.com/assets/img/events/max-battles-kanto.jpg",
+        "start": "2026-11-23T06:00:00.000",
+        "end": "2026-11-23T21:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "cresselia-darkrai-in-5-star-raid-battles-november-2026",
+        "name": "Cresselia and Darkrai in 5-star Raid Battles",
+        "eventType": "raid-battles",
+        "heading": "Raid Battles",
+        "link": "https://leekduck.com/events/cresselia-darkrai-in-5-star-raid-battles-november-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+        "start": "2026-11-16T06:00:00.000",
+        "end": "2026-11-24T22:00:00.000",
+        "extraData": {
+            "raidbattles": {
+                "bosses": [
+                    {
+                        "name": "Cresselia",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_488_00.png",
+                        "canBeShiny": true
+                    },
+                    {
+                        "name": "Darkrai",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_491_00.png",
+                        "canBeShiny": true
+                    }
+                ],
+                "shinies": [
+                    {
+                        "name": "Cresselia",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_488_00_shiny.png"
+                    },
+                    {
+                        "name": "Darkrai",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_491_00_shiny.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "mega-banette-in-mega-raids-november-2026",
+        "name": "Mega Banette in Mega Raids",
+        "eventType": "raid-battles",
+        "heading": "Raid Battles",
+        "link": "https://leekduck.com/events/mega-banette-in-mega-raids-november-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/mega-default.jpg",
+        "start": "2026-11-16T06:00:00.000",
+        "end": "2026-11-24T22:00:00.000",
+        "extraData": {
+            "raidbattles": {
+                "bosses": [
+                    {
+                        "name": "Mega Banette",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm354.fMEGA.icon.png",
+                        "canBeShiny": true
+                    }
+                ],
+                "shinies": [
+                    {
+                        "name": "Banette",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_354_00_shiny.png"
+                    },
+                    {
+                        "name": "Mega Banette",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm354.fMEGA.s.icon.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "gbl-twilight-trails_ultra-league_master-league-mega-edition_2026-go-laic-cup",
+        "name": "Ultra League, Master League: Mega Edition, and 2026 GO LAIC Cup | Twilight Trails",
+        "eventType": "go-battle-league",
+        "heading": "GO Battle League",
+        "link": "https://leekduck.com/events/gbl-twilight-trails_ultra-league_master-league-mega-edition_2026-go-laic-cup/",
+        "image": "https://cdn.leekduck.com/assets/img/events/go-battle-league-ultra-league-machamp-swampert.jpg",
+        "start": "2026-11-18T21:00:00.000Z",
+        "end": "2026-11-25T21:00:00.000Z",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "raidhour20261125",
+        "name": "Deoxys (Normal, Defense, Attack, and Speed Formes) Raid Hour",
+        "eventType": "raid-hour",
+        "heading": "Raid Hour",
+        "link": "https://leekduck.com/events/raidhour20261125/",
+        "image": "https://cdn.leekduck.com/assets/img/events/raidhour.jpg",
+        "start": "2026-11-25T18:00:00.000",
+        "end": "2026-11-25T19:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "pokemonspotlighthour2026-11-26",
+        "name": "Noibat Spotlight Hour",
+        "eventType": "pokemon-spotlight-hour",
+        "heading": "Pokémon Spotlight Hour",
+        "link": "https://leekduck.com/events/pokemonspotlighthour2026-11-26/",
+        "image": "https://cdn.leekduck.com/assets/img/events/pokemonspotlighthour.jpg",
+        "start": "2026-11-26T18:00:00.000",
+        "end": "2026-11-26T19:00:00.000",
+        "extraData": {
+            "spotlight": {
+                "name": "Noibat",
+                "canBeShiny": true,
+                "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_714_00.png",
+                "bonus": "2× Catch Candy",
+                "list": [
+                    {
+                        "name": "Noibat",
+                        "canBeShiny": true,
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_714_00.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "super-mega-raid-day-november-2026",
+        "name": "Super Mega Raid Day",
+        "eventType": "raid-day",
+        "heading": "Raid Day",
+        "link": "https://leekduck.com/events/super-mega-raid-day-november-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+        "start": "2026-11-28T14:00:00.000",
+        "end": "2026-11-28T17:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "twilight-wishes-2026",
+        "name": "Twilight Wishes",
+        "eventType": "event",
+        "heading": "Event",
+        "link": "https://leekduck.com/events/twilight-wishes-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+        "start": "2026-11-24T10:00:00.000",
+        "end": "2026-11-30T20:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "max-mondays-2026-11-30",
+        "name": "Dynamax Cryogonal during Max Monday",
+        "eventType": "max-mondays",
+        "heading": "Max Mondays",
+        "link": "https://leekduck.com/events/max-mondays-2026-11-30/",
+        "image": "https://cdn.leekduck.com/assets/img/events/max-battles-kanto.jpg",
+        "start": "2026-11-30T06:00:00.000",
+        "end": "2026-11-30T21:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "season-24-twilight-trails",
+        "name": "Twilight Trails",
+        "eventType": "season",
+        "heading": "Season",
+        "link": "https://leekduck.com/events/season-24-twilight-trails/",
+        "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-09-08-season-24-twilight-trails/season-24-twilight-trails.jpg",
+        "start": "2026-09-08T10:00:00.000",
+        "end": "2026-12-01T10:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "go-pass-november-2026",
+        "name": "GO Pass: November",
+        "eventType": "go-pass",
+        "heading": "GO Pass",
+        "link": "https://leekduck.com/events/go-pass-november-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-03-go-pass-november-2026/go-pass-november-2026.jpg",
+        "start": "2026-11-03T10:00:00.000",
+        "end": "2026-12-01T10:00:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "gbl-twilight-trails_master-league_mega-catch-cup-great-league-edition",
+        "name": "Master League and Mega Catch Cup: Great League Edition | Twilight Trails",
+        "eventType": "go-battle-league",
+        "heading": "GO Battle League",
+        "link": "https://leekduck.com/events/gbl-twilight-trails_master-league_mega-catch-cup-great-league-edition/",
+        "image": "https://cdn.leekduck.com/assets/img/events/gobattleleague-master-key.jpg",
+        "start": "2026-11-24T21:00:00.000Z",
+        "end": "2026-12-01T21:00:00.000Z",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "shadow-tornadus-incarnate-forme-in-shadow-raids-november-16-2026",
+        "name": "Shadow Tornadus (Incarnate Forme) in Shadow Raids",
+        "eventType": "raid-battles",
+        "heading": "Raid Battles",
+        "link": "https://leekduck.com/events/shadow-tornadus-incarnate-forme-in-shadow-raids-november-16-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+        "start": "2026-11-16T06:00:00.000",
+        "end": "2026-12-01T22:00:00.000",
+        "extraData": {
+            "raidbattles": {
+                "bosses": [
+                    {
+                        "name": "Tornadus (Incarnate)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_641_11.png",
+                        "canBeShiny": false
+                    }
+                ],
+                "shinies": []
+            },
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "deoxys-normal-defense-attack-speed-formes-in-5-star-raid-battles-november-2026",
+        "name": "Deoxys (Normal, Defense, Attack, and Speed Formes) in 5-star Raid Battles",
+        "eventType": "raid-battles",
+        "heading": "Raid Battles",
+        "link": "https://leekduck.com/events/deoxys-normal-defense-attack-speed-formes-in-5-star-raid-battles-november-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+        "start": "2026-11-25T06:00:00.000",
+        "end": "2026-12-01T22:00:00.000",
+        "extraData": {
+            "raidbattles": {
+                "bosses": [
+                    {
+                        "name": "Deoxys (Normal)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_386_11.png",
+                        "canBeShiny": true
+                    },
+                    {
+                        "name": "Deoxys (Defense)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_386_13.png",
+                        "canBeShiny": true
+                    },
+                    {
+                        "name": "Deoxys (Attack)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_386_12.png",
+                        "canBeShiny": true
+                    },
+                    {
+                        "name": "Deoxys (Speed)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_386_14.png",
+                        "canBeShiny": true
+                    }
+                ],
+                "shinies": [
+                    {
+                        "name": "Deoxys (Normal)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_386_11_shiny.png"
+                    },
+                    {
+                        "name": "Deoxys (Defense)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_386_13_shiny.png"
+                    },
+                    {
+                        "name": "Deoxys (Attack)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_386_12_shiny.png"
+                    },
+                    {
+                        "name": "Deoxys (Speed)",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_386_14_shiny.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "mega-metagross-in-mega-raids-november-2026",
+        "name": "Mega Metagross in Mega Raids",
+        "eventType": "raid-battles",
+        "heading": "Raid Battles",
+        "link": "https://leekduck.com/events/mega-metagross-in-mega-raids-november-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/mega-default.jpg",
+        "start": "2026-11-25T06:00:00.000",
+        "end": "2026-12-01T22:00:00.000",
+        "extraData": {
+            "raidbattles": {
+                "bosses": [
+                    {
+                        "name": "Mega Metagross",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm376.fMEGA.icon.png",
+                        "canBeShiny": true
+                    }
+                ],
+                "shinies": [
+                    {
+                        "name": "Metagross",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_376_00_shiny.png"
+                    },
+                    {
+                        "name": "Mega Metagross",
+                        "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm376.fMEGA.s.icon.png"
+                    }
+                ]
+            },
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "minior-showers-geminids-2026",
+        "name": "Minior Showers: Geminids 2026",
+        "eventType": "event",
+        "heading": "Event",
+        "link": "https://leekduck.com/events/minior-showers-geminids-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/minior-showers-2026.jpg",
+        "start": "2026-12-11T17:00:00.000",
+        "end": "2026-12-16T23:59:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "pokemon-x-adidas-2026",
+        "name": "adidas × Pokémon Timed Research",
+        "eventType": "research",
+        "heading": "Research",
+        "link": "https://leekduck.com/events/pokemon-x-adidas-2026/",
+        "image": "https://cdn.leekduck.com/assets/img/events/pokemon-x-adidas-2026.jpg",
+        "start": "2026-09-25T10:00:00.000",
+        "end": "2027-01-15T20:00:00.000",
+        "extraData": {
+            "promocodes": [
+                "ADIDASxPOKEMON"
+            ],
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "pokemon-go-tour-alola-kaohsiung-2027",
+        "name": "Pokémon GO Tour: Alola - Kaohsiung 2027",
+        "eventType": "pokemon-go-tour",
+        "heading": "Pokémon GO Tour",
+        "link": "https://leekduck.com/events/pokemon-go-tour-alola-kaohsiung-2027/",
+        "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+        "start": "2027-02-18T16:00:00.000Z",
+        "end": "2027-02-21T15:59:59.000Z",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "pokemon-go-tour-alola-los-angeles-2027",
+        "name": "Pokémon GO Tour: Alola - Los Angeles 2027",
+        "eventType": "pokemon-go-tour",
+        "heading": "Pokémon GO Tour",
+        "link": "https://leekduck.com/events/pokemon-go-tour-alola-los-angeles-2027/",
+        "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+        "start": "2027-02-19T08:00:00.000Z",
+        "end": "2027-02-22T07:59:59.000Z",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "pokemon-go-tour-alola-global-2027",
+        "name": "Pokémon GO Tour: Alola - Global 2027",
+        "eventType": "pokemon-go-tour",
+        "heading": "Pokémon GO Tour",
+        "link": "https://leekduck.com/events/pokemon-go-tour-alola-global-2027/",
+        "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+        "start": "2027-02-27T00:00:00.000",
+        "end": "2027-02-28T23:59:59.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": false,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "minior-showers-eta-aquariids-2027",
+        "name": "Minior Showers: Eta Aquariids 2027",
+        "eventType": "event",
+        "heading": "Event",
+        "link": "https://leekduck.com/events/minior-showers-eta-aquariids-2027/",
+        "image": "https://cdn.leekduck.com/assets/img/events/minior-showers-2026.jpg",
+        "start": "2027-05-03T17:00:00.000",
+        "end": "2027-05-08T23:59:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "minior-showers-southern-delta-aquariids-2027",
+        "name": "Minior Showers: Southern Delta Aquariids 2027",
+        "eventType": "event",
+        "heading": "Event",
+        "link": "https://leekduck.com/events/minior-showers-southern-delta-aquariids-2027/",
+        "image": "https://cdn.leekduck.com/assets/img/events/minior-showers-2026.jpg",
+        "start": "2027-07-28T17:00:00.000",
+        "end": "2027-08-02T23:59:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    },
+    {
+        "eventID": "minior-showers-perseids-2027",
+        "name": "Minior Showers: Perseids 2027",
+        "eventType": "event",
+        "heading": "Event",
+        "link": "https://leekduck.com/events/minior-showers-perseids-2027/",
+        "image": "https://cdn.leekduck.com/assets/img/events/minior-showers-2026.jpg",
+        "start": "2027-08-10T17:00:00.000",
+        "end": "2027-08-15T23:59:00.000",
+        "extraData": {
+            "generic": {
+                "hasSpawns": true,
+                "hasFieldResearchTasks": false
+            }
+        }
+    }
+]
\ No newline at end of file
diff --git a/test/support/party-service.ts b/test/support/party-service.ts
index f8c9eec1809af521a8c2fb4f6aa50dea7769fa18..7e81390bbe3243c4a082b12f1d6a39e6233c7a28 100644
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -70,6 +70,7 @@ import { MaxChangeService } from '../../src/services/max-change-service.js';
 import { RaidChangeService } from '../../src/services/raid-change-service.js';
 import { TimedPartyService } from '../../src/services/timed-party-service.js';
 import { TrainService } from '../../src/services/train-service.js';
+import type { EventSpawnProvider } from '../../src/services/event-spawn-service.js';
 
 /** The invented regions as a directory whose rows a test can change; `load` does nothing. */
 export class TestRegions {
@@ -269,6 +270,8 @@ export type ServiceOverrides = Partial<PartyServiceOptions> & {
   notifying?: Partial<NotifyServiceOptions>;
   /** How long a spawn report stands (the service of `/wild`); default thirty minutes. */
   spawnDeleteAfterMs?: number;
+  /** The spawns of the events on, for costumed spawn reports (plan 8R-4); default none. */
+  spawnCostumes?: Pick<EventSpawnProvider, 'sightingsAt'>;
   /** How many parties the history's sweep records between two lines of progress. */
   historySweepProgressEvery?: number;
 };
@@ -310,7 +313,8 @@ export async function partyServiceWith(
   overrides: ServiceOverrides = {},
   kept?: Partial<Outliving>,
 ) {
-  const { notifying, spawnDeleteAfterMs, historySweepProgressEvery, ...forService } = overrides;
+  const { notifying, spawnDeleteAfterMs, spawnCostumes, historySweepProgressEvery, ...forService } =
+    overrides;
   const clock = kept?.clock ?? { now: PARTY_NOW };
   const now = () => clock.now;
   const storage = kept?.storage ?? new MemoryPartyStorage(parties);
@@ -428,6 +432,7 @@ export async function partyServiceWith(
     notify,
     settings: overrides.settings ?? settings,
     ...(spawnDeleteAfterMs === undefined ? {} : { deleteAfterMs: spawnDeleteAfterMs }),
+    ...(spawnCostumes === undefined ? {} : { costumes: spawnCostumes }),
     log,
     now,
     setTimer: (run, ms) => {
diff --git a/test/support/spawn-events.ts b/test/support/spawn-events.ts
new file mode 100644
index 0000000000000000000000000000000000000000..894d8321bac8ce020da82802d9673ce2403bb6cf
--- /dev/null
+++ b/test/support/spawn-events.ts
@@ -0,0 +1,25 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+
+const fixtures = path.resolve(import.meta.dirname, '../fixtures');
+
+/**
+ * ScrapedDuck's events feed (`events.json`) as fetched once for plan 8R-4 on 2026-10-22, whole and
+ * unchanged: Halloween 2026 Part I and Part II (`event`, `generic.hasSpawns`, their spawns on
+ * their Leek Duck pages), Pawniard Community Day (2026-11-21, `extraData.communityday.spawns`),
+ * the Teddiursa Spotlight Hour of 2026-11-05 (`extraData.spotlight.list`, a costumed Teddiursa),
+ * Wild Areas, City Safaris and Pokémon Night Outs (location-bound), a season, Raid Hours and Max
+ * Mondays.
+ */
+export function readSpawnEventFeed(): unknown {
+  return JSON.parse(
+    readFileSync(path.join(fixtures, 'scrapedduck-events-2026-10-22.json'), 'utf8'),
+  );
+}
+
+/** A Leek Duck event page of `test/fixtures/`, cut to the sections read (plan 8R-4). */
+export function readEventPage(
+  file: 'leekduck-event-halloween-2026-part-1.html' | 'leekduck-event-spotlight-2026-11-05.html',
+): string {
+  return readFileSync(path.join(fixtures, file), 'utf8');
+}
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index feb041fab54f41f02436ce8ef9c961682653bfd8..6ae72c8684d75b3141a80dcd4e152440abb03a7d 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -113,6 +113,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     raidEvents: raidEventsFixture(),
     // The task list of Leek Duck's page of 2026-10-21; a test passes its own to change it.
     researchTasks: researchTasksFixture(),
+    // No event's spawns (plan 8R-4); a test passes its own `sightingsAt`.
+    eventSpawns: { sightingsAt: () => [] },
     // The Rocket lineups of ScrapedDuck's feed of 2026-10-22; a test passes its own to change them.
     rocketLineups: rocketLineupsFixture(),
     // Over memory and the context's own research events (below), unless a test passes its own.
````

