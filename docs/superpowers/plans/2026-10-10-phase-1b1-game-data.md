# Phase 1B-1: Game Data Catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make everything Pine knows about Pokémon (species, forms, megas, names, types, stats, moves, CP, raid tiers) come from the downloaded game master and English text file instead of the hand-maintained `data/pokemon.json`, `data/types.json` and `data/weather.json`.

**Architecture:** Pure modules in `src/domain/pogo/` turn the raw game master and text file into a compact, JSON-serialisable `GameData` object and answer questions about it through a read-only `PokemonCatalogue`. `GameDataService` (`src/services/`) is the only part that touches the network and the disk: it downloads, parses, keeps the result in `var/gamemaster.json`, and falls back to that copy when a download fails. Nothing runs on import. No new tables or migrations.

**Tech Stack:** TypeScript 6.0, native `fetch`, Vitest, Kysely (one repository). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`, sections 6.3 and 6.6. Phase 1 is split into 1A (done), 1B-1 (this plan), 1B-2 (raid boss feed and tables) and 1C (search, image cache, static maps).

**Every code block in this plan was run before the plan was written:** the modules and tests below pass (105 tests) against the game master of 2026-10-10, with lint and typecheck clean. If something does not pass as written, suspect a transcription slip or a newer game master before suspecting the design.

## Corrections to the spec

The spec's section 6.6 made three assumptions that the real data contradicts. This plan follows the data:

1. **`gsName` is not an OCR name.** In the legacy bot it is the GoStadium name, used only by the old `/rank` link, which the spec drops. Screenshot matching uses the Pokémon's internal name. `gsName` is therefore not ported at all.
2. **The Pokebattler name (`pbName`) is not the template id.** The rule is: the species id for a species, `<species>_MEGA[_X|_Y]` for megas, `<form>_FORM` for other forms, with 30 exceptions kept in an explicit table (Task 2). Three legacy values were plain errors and are not reproduced (Task 5).
3. **"Retired" means the new bot never reads `data/pokemon.json`, `types.json` or `weather.json` at runtime.** The files stay in the repository, because the legacy bot on `main-dev` still uses them and the parity test (Task 5) reads `pokemon.json`. They are deleted with the rest of the legacy tree in Phase 8.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit or delete legacy JS or the legacy `data/*.json` files.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/pogo/` is pure: no imports from `discord.js`, `kysely`, `node:fs`, or the network. Only `src/services/game-data-service.ts`, scripts and tests read files or fetch.
- **Tests never use the network.** They read three committed fixtures: `test/fixtures/game-master-sample.json` and `english-sample.txt` (raw items for 18 species) and `test/fixtures/game-data.json` (a whole game master, parsed). The fixtures are produced only by `scripts/game-data/make-fixtures.ts` (Task 3) and never edited by hand.
- The raw downloads live in `var/game-data-source/` (`gamemaster.json`, `English.txt`), which is git-ignored and already present on this machine. Do not commit anything under `var/`.
- A Pokémon's identity is its **catalogue key**: lower case, `venusaur`, `rattata_alola`, `charizard_mega_x`. Keys are unique. Costumes are never catalogue entries.
- Types are the lower-case names in `POKEMON_TYPES`, always in that order; it is the order in which the game master lists defenders, and it is not alphabetical.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (re-run lint after formatting). Task 5 also runs its `*.db.test.ts` file (needs Docker).
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage `.idea/` or `var/`.

## Review Focus

1. A download can succeed with the wrong content: an HTML rate-limit page, `[]`, or a JSON error object. The bot must keep the data it has rather than replace it with nothing. Test: Task 7, "keeps the data in use when a refresh returns rubbish".
2. The bot must start when the download host is unreachable, as long as an earlier copy exists, and must say that the copy is out of date. Test: Task 7, "starts from an out-of-date copy when the download fails, and says so".
3. The game master is ahead of the text file: new species, megas and moves arrive without an English name. They must still appear, with a readable name, not vanish or show an id like `WALKINGWAKE`. Test: Task 3, "copes with a species that has no moves and one with no English name yet".
4. A member searching for Pikachu expects one Pikachu, not seventy costumes; but Armored Mewtwo, which the game master also flags as a costume, is a real raid boss with its own stats. Tests: Task 3, "does not list NORMAL forms, costumes or cosmetic forms separately" and "keeps a costume that has its own stats as a real form".
5. In the live database the value `-6` in `PokemonNotification.pokemon` means "perfect IV spawn" in some rows and "mega legendary raid" in others. Members must keep the notification they asked for. Test: Task 6, "tells the two meanings of -6 apart by the scope".

---

## File Structure

```
scripts/game-data/
  make-fixtures.ts                 create: builds the three fixtures from var/game-data-source
  make-nicknames.ts                create: one-off copy of nicknames out of data/pokemon.json
src/domain/pogo/
  types.ts                         create: POKEMON_TYPES, WEATHER_CONDITIONS, TempEvolution, parsers
  text.ts                          create: parseTextFile
  names.ts                         create: speciesName, displayName, titleCase
  pokebattler.ts                   create: pokebattlerId, POKEBATTLER_EXCEPTIONS
  game-master.ts                   create: GameData, PokemonEntry, Move, parseGameMaster
  cp.ts                            create: cpMultiplierAt, combatPower, raidCatchCp, raidBossCp
  catalogue.ts                     create: PokemonCatalogue
  legacy-names.ts                  create: keyForLegacyName, legacyNameForKey
  nicknames.ts                     create (generated once): CURATED_NICKNAMES
  raid-tier.ts                     create: RaidLevel, RaidTier and helpers
  notification-target.ts           create: NotificationTarget codec
  (each with a colocated *.test.ts)
src/services/
  game-data-service.ts             create: GameDataService, GameDataProvider
  game-data-service.test.ts        create
src/db/repositories/
  pokemon-repository.ts            create: moderator-added nicknames (Pokemon table)
  pokemon-repository.db.test.ts    create
src/config/settings.ts             modify: gameData block
src/app-context.ts                 modify: gameData
src/app.ts                         modify: load game data at start, refresh on a timer
data/settings.json                 modify: gameData block
test/fixtures/
  game-master-sample.json          create (generated)
  english-sample.txt               create (generated)
  game-data.json                   create (generated)
  settings.json                    modify: gameData block
test/support/
  game-data.ts                     create: fixture readers
  test-context.ts                  modify: gameData
CLAUDE.md, docs/superpowers/plans/phase-0-follow-ups.md   modify (Task 7)
```

---

### Task 1: Types and the text file

**Files:**
- Create: `src/domain/pogo/types.ts`, `src/domain/pogo/types.test.ts`, `src/domain/pogo/text.ts`, `src/domain/pogo/text.test.ts`

**Interfaces:**
- Produces: `POKEMON_TYPES` (readonly tuple of 18 lower-case names), `type PokemonType`, `WEATHER_CONDITIONS` (`clear`, `rainy`, `partly_cloudy`, `overcast`, `windy`, `snow`, `fog`), `type Weather`, `type TempEvolution = 'MEGA' | 'MEGA_X' | 'MEGA_Y' | 'PRIMAL'`, `parseType(raw: unknown): PokemonType | undefined`, `parseWeather(raw: unknown): Weather | undefined`, `parseTextFile(content: string): Map<string, string>`.

- [ ] **Step 1: Write the failing tests**

`src/domain/pogo/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { POKEMON_TYPES, WEATHER_CONDITIONS, parseType, parseWeather } from './types.js';

describe('pokemon types', () => {
  it('lists the 18 types in the game master defender order', () => {
    expect(POKEMON_TYPES).toEqual([
      'normal',
      'fighting',
      'flying',
      'poison',
      'ground',
      'rock',
      'bug',
      'ghost',
      'steel',
      'fire',
      'water',
      'grass',
      'electric',
      'psychic',
      'ice',
      'dragon',
      'dark',
      'fairy',
    ]);
  });

  it('parses game-master type ids', () => {
    expect(parseType('POKEMON_TYPE_GRASS')).toBe('grass');
    expect(parseType('POKEMON_TYPE_FAIRY')).toBe('fairy');
  });

  it('rejects anything that is not a type', () => {
    expect(parseType('POKEMON_TYPE_SHADOW')).toBeUndefined();
    expect(parseType(undefined)).toBeUndefined();
    expect(parseType(7)).toBeUndefined();
  });
});

describe('weather', () => {
  it('lists the seven conditions', () => {
    expect(WEATHER_CONDITIONS).toHaveLength(7);
  });

  it('parses game-master weather ids', () => {
    expect(parseWeather('PARTLY_CLOUDY')).toBe('partly_cloudy');
    expect(parseWeather('RAINY')).toBe('rainy');
    expect(parseWeather('HAIL')).toBeUndefined();
    expect(parseWeather(null)).toBeUndefined();
  });
});
```

`src/domain/pogo/text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseTextFile } from './text.js';

describe('parseTextFile', () => {
  it('reads RESOURCE ID / TEXT pairs', () => {
    const texts = parseTextFile(
      'RESOURCE ID: pokemon_name_0003\nTEXT: Venusaur\n\nRESOURCE ID: move_name_0013\nTEXT: Wrap\n',
    );
    expect(texts.get('pokemon_name_0003')).toBe('Venusaur');
    expect(texts.get('move_name_0013')).toBe('Wrap');
    expect(texts.size).toBe(2);
  });

  it('handles Windows line endings', () => {
    const texts = parseTextFile(
      'RESOURCE ID: a\r\nTEXT: one\r\n\r\nRESOURCE ID: b\r\nTEXT: two\r\n',
    );
    expect([...texts]).toEqual([
      ['a', 'one'],
      ['b', 'two'],
    ]);
  });

  it('keeps names that end in r, which the legacy parser truncated', () => {
    const texts = parseTextFile('RESOURCE ID: move_name_0024\nTEXT: Flamethrower\n');
    expect(texts.get('move_name_0024')).toBe('Flamethrower');
  });

  it('keeps colons and leading spaces inside the text', () => {
    const texts = parseTextFile('RESOURCE ID: pokemon_name_0772\nTEXT: Type: Null\n');
    expect(texts.get('pokemon_name_0772')).toBe('Type: Null');
  });

  it('skips a key with no text line and survives junk', () => {
    const texts = parseTextFile('garbage\nRESOURCE ID: lonely\n\nRESOURCE ID: ok\nTEXT: fine');
    expect([...texts]).toEqual([['ok', 'fine']]);
    expect(parseTextFile('').size).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/pogo`
Expected: FAIL, cannot resolve `./types.js` and `./text.js`.

- [ ] **Step 3: Implement**

`src/domain/pogo/types.ts`:

```ts
/** The 18 types, in the order the game master lists defenders in `typeEffective.attackScalar`. */
export const POKEMON_TYPES = [
  'normal',
  'fighting',
  'flying',
  'poison',
  'ground',
  'rock',
  'bug',
  'ghost',
  'steel',
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'ice',
  'dragon',
  'dark',
  'fairy',
] as const;
export type PokemonType = (typeof POKEMON_TYPES)[number];

export const WEATHER_CONDITIONS = [
  'clear',
  'rainy',
  'partly_cloudy',
  'overcast',
  'windy',
  'snow',
  'fog',
] as const;
export type Weather = (typeof WEATHER_CONDITIONS)[number];

/** `POKEMON_TYPE_GRASS` → `grass`. Undefined for anything that is not one of the 18 types. */
export function parseType(raw: unknown): PokemonType | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.replace(/^POKEMON_TYPE_/, '').toLowerCase();
  return (POKEMON_TYPES as readonly string[]).includes(name) ? (name as PokemonType) : undefined;
}

export function parseWeather(raw: unknown): Weather | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.toLowerCase();
  return (WEATHER_CONDITIONS as readonly string[]).includes(name) ? (name as Weather) : undefined;
}

/** A temporary evolution: a mega evolution or a primal reversion. */
export type TempEvolution = 'MEGA' | 'MEGA_X' | 'MEGA_Y' | 'PRIMAL';
```

`src/domain/pogo/text.ts`:

```ts
/** Parses the game's text file: blocks of `RESOURCE ID: <key>` followed by `TEXT: <value>`. */
export function parseTextFile(content: string): Map<string, string> {
  const texts = new Map<string, string>();
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    const key = /^RESOURCE ID: (.+)$/.exec(lines[i] ?? '')?.[1]?.trim();
    const next = lines[i + 1] ?? '';
    if (key && next.startsWith('TEXT: ')) texts.set(key, next.slice('TEXT: '.length));
  }
  return texts;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/domain/pogo`
Expected: PASS, 10 tests in 2 files.

- [ ] **Step 5: Check and commit**

Run: `npx prettier --write src/domain/pogo && npm run check`

```bash
git add src/domain/pogo
git commit -m "Add Pokémon type, weather and text-file parsing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Display names and Pokebattler names

The game master identifies Pokémon by ids such as `RATTATA_ALOLA` and `TEMP_EVOLUTION_MEGA_X`. People need "Alolan Rattata" and "Mega Charizard X"; Pokebattler (used by `/counters`, Phase 6) needs `RATTATA_ALOLA_FORM` and `CHARIZARD_MEGA_X`.

Where the names come from in the text file:
- species: `pokemon_name_NNNN` (Pokédex number padded to four digits);
- megas and primals: `pokemon_name_NNNN_000X`, X = 1 mega, 2 mega X, 3 mega Y, 4 primal;
- forms: `form_<species>_<suffix>`, then for five species a key filed under another prefix, then the generic `form_<suffix>` (but not for six suffixes whose generic text belongs to Kyurem or Castform).

**Files:**
- Create: `src/domain/pogo/names.ts`, `src/domain/pogo/names.test.ts`, `src/domain/pogo/pokebattler.ts`, `src/domain/pogo/pokebattler.test.ts`

**Interfaces:**
- Consumes: `TempEvolution` from `./types.js`.
- Produces: `type FormKind = 'species' | 'regional' | 'form' | 'mega'`; `titleCase(id: string): string`; `speciesName(pokemonId: string, dex: number, texts: Map<string, string>): string`; `interface NameInput { pokemonId; dex; species; kind: FormKind; suffix: string | null; form: string | null; tempEvolution: TempEvolution | null; texts }`; `displayName(input: NameInput): string`; `POKEBATTLER_EXCEPTIONS: Readonly<Record<string, string>>`; `pokebattlerId(pokemonId: string, form: string | null, tempEvolution: TempEvolution | null): string`.

- [ ] **Step 1: Write the failing tests**

`src/domain/pogo/names.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { displayName, speciesName, titleCase, type NameInput } from './names.js';

const texts = new Map([
  ['pokemon_name_0019', 'Rattata'],
  ['pokemon_name_0006', 'Charizard'],
  ['pokemon_name_0006_0002', 'Mega Charizard X'],
  ['pokemon_name_0128', 'Tauros'],
  ['pokemon_name_0150', 'Mewtwo'],
  ['pokemon_name_0201', 'Unown'],
  ['pokemon_name_0479', 'Rotom'],
  ['pokemon_name_0487', 'Giratina'],
  ['pokemon_name_0646', 'Kyurem'],
  ['pokemon_name_0774', 'Minior'],
  ['pokemon_name_0931', 'Squawkabilly'],
  ['form_giratina_origin', 'Origin Forme'],
  ['form_rotom_wash', 'Wash Rotom'],
  ['form_paldea_blaze', 'Blaze Breed'],
  ['form_core_blue', 'Blue Core'],
  ['form_squakabilly_white', 'White Plumage'],
  ['form_white', 'White Kyurem'],
  ['form_kyurem_white', 'White Kyurem'],
]);

function name(input: Partial<NameInput> & Pick<NameInput, 'pokemonId' | 'dex'>): string {
  return displayName({
    species: speciesName(input.pokemonId, input.dex, texts),
    kind: 'species',
    suffix: null,
    form: null,
    tempEvolution: null,
    texts,
    ...input,
  });
}

describe('speciesName', () => {
  it('uses the text file', () => {
    expect(speciesName('RATTATA', 19, texts)).toBe('Rattata');
  });

  it('falls back for species the text file does not name yet', () => {
    expect(speciesName('WALKINGWAKE', 1009, texts)).toBe('Walking Wake');
    expect(speciesName('DIPPLIN', 1011, texts)).toBe('Dipplin');
    expect(speciesName('MR_MIME', 122, texts)).toBe('Mr Mime');
  });
});

describe('displayName', () => {
  it('names a species', () => {
    expect(name({ pokemonId: 'RATTATA', dex: 19 })).toBe('Rattata');
  });

  it('puts the region first for regional forms', () => {
    expect(
      name({
        pokemonId: 'RATTATA',
        dex: 19,
        kind: 'regional',
        suffix: 'ALOLA',
        form: 'RATTATA_ALOLA',
      }),
    ).toBe('Alolan Rattata');
  });

  it('adds the rest of a regional form in brackets', () => {
    expect(
      name({
        pokemonId: 'TAUROS',
        dex: 128,
        kind: 'regional',
        suffix: 'PALDEA_BLAZE',
        form: 'TAUROS_PALDEA_BLAZE',
      }),
    ).toBe('Paldean Tauros (Blaze Breed)');
  });

  it('describes a form in brackets', () => {
    expect(
      name({
        pokemonId: 'GIRATINA',
        dex: 487,
        kind: 'form',
        suffix: 'ORIGIN',
        form: 'GIRATINA_ORIGIN',
      }),
    ).toBe('Giratina (Origin Forme)');
  });

  it('uses the form text alone when it already names the species', () => {
    expect(
      name({ pokemonId: 'ROTOM', dex: 479, kind: 'form', suffix: 'WASH', form: 'ROTOM_WASH' }),
    ).toBe('Wash Rotom');
    expect(
      name({ pokemonId: 'KYUREM', dex: 646, kind: 'form', suffix: 'WHITE', form: 'KYUREM_WHITE' }),
    ).toBe('White Kyurem');
  });

  it('finds form texts filed under another key', () => {
    expect(
      name({ pokemonId: 'MINIOR', dex: 774, kind: 'form', suffix: 'BLUE', form: 'MINIOR_BLUE' }),
    ).toBe('Minior (Blue Core)');
  });

  it('does not borrow a text that belongs to one species only', () => {
    // form_white is "White Kyurem"; Squawkabilly has its own, misspelt, key.
    expect(
      name({
        pokemonId: 'SQUAWKABILLY',
        dex: 931,
        kind: 'form',
        suffix: 'WHITE',
        form: 'SQUAWKABILLY_WHITE',
      }),
    ).toBe('Squawkabilly (White Plumage)');
  });

  it('falls back to the form id when there is no text', () => {
    expect(name({ pokemonId: 'UNOWN', dex: 201, kind: 'form', suffix: 'A', form: 'UNOWN_A' })).toBe(
      'Unown (A)',
    );
  });

  it('has fixed names where the text file has nothing usable', () => {
    expect(
      name({ pokemonId: 'MEWTWO', dex: 150, kind: 'form', suffix: 'A', form: 'MEWTWO_A' }),
    ).toBe('Armored Mewtwo');
    expect(
      name({
        pokemonId: 'UNOWN',
        dex: 201,
        kind: 'form',
        suffix: 'QUESTION_MARK',
        form: 'UNOWN_QUESTION_MARK',
      }),
    ).toBe('Unown (?)');
  });

  it('names megas from the text file, or by rule when it has none', () => {
    expect(name({ pokemonId: 'CHARIZARD', dex: 6, kind: 'mega', tempEvolution: 'MEGA_X' })).toBe(
      'Mega Charizard X',
    );
    expect(name({ pokemonId: 'CHARIZARD', dex: 6, kind: 'mega', tempEvolution: 'MEGA_Y' })).toBe(
      'Mega Charizard Y',
    );
    expect(name({ pokemonId: 'RATTATA', dex: 19, kind: 'mega', tempEvolution: 'MEGA' })).toBe(
      'Mega Rattata',
    );
    expect(name({ pokemonId: 'RATTATA', dex: 19, kind: 'mega', tempEvolution: 'PRIMAL' })).toBe(
      'Primal Rattata',
    );
  });
});

describe('titleCase', () => {
  it('turns an id into words', () => {
    expect(titleCase('RAPID_STRIKE')).toBe('Rapid Strike');
    expect(titleCase('00')).toBe('00');
  });
});
```

`src/domain/pogo/pokebattler.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { POKEBATTLER_EXCEPTIONS, pokebattlerId } from './pokebattler.js';

describe('pokebattlerId', () => {
  it('uses the species id for a species', () => {
    expect(pokebattlerId('VENUSAUR', null, null)).toBe('VENUSAUR');
    expect(pokebattlerId('MR_MIME', null, null)).toBe('MR_MIME');
  });

  it('appends _FORM to a form', () => {
    expect(pokebattlerId('RATTATA', 'RATTATA_ALOLA', null)).toBe('RATTATA_ALOLA_FORM');
    expect(pokebattlerId('GIRATINA', 'GIRATINA_ORIGIN', null)).toBe('GIRATINA_ORIGIN_FORM');
  });

  it('names megas after the species', () => {
    expect(pokebattlerId('VENUSAUR', null, 'MEGA')).toBe('VENUSAUR_MEGA');
    expect(pokebattlerId('CHARIZARD', null, 'MEGA_X')).toBe('CHARIZARD_MEGA_X');
    expect(pokebattlerId('KYOGRE', null, 'PRIMAL')).toBe('KYOGRE_PRIMAL');
  });

  it('applies the exceptions', () => {
    expect(pokebattlerId('TORNADUS', null, null)).toBe('TORNADUS_INCARNATE_FORM');
    expect(pokebattlerId('KYUREM', 'KYUREM_WHITE', null)).toBe('KYUREM_WHITE');
    expect(pokebattlerId('CHERRIM', 'CHERRIM_SUNNY', null)).toBe('CHERRIM');
    expect(pokebattlerId('JANGMO_O', null, null)).toBe('JANGMO-O');
    expect(pokebattlerId('DARMANITAN', 'DARMANITAN_GALARIAN_ZEN', null)).toBe(
      'DARMANITAN_ZEN_GALARIAN_FORM',
    );
  });

  it('keys every exception in lower case', () => {
    for (const key of Object.keys(POKEBATTLER_EXCEPTIONS)) {
      expect(key).toBe(key.toLowerCase());
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/pogo/names.test.ts src/domain/pogo/pokebattler.test.ts`
Expected: FAIL, cannot resolve `./names.js` and `./pokebattler.js`.

- [ ] **Step 3: Implement**

`src/domain/pogo/names.ts`:

```ts
import type { TempEvolution } from './types.js';

export type FormKind = 'species' | 'regional' | 'form' | 'mega';

const REGION_ADJECTIVES: Readonly<Record<string, string>> = {
  ALOLA: 'Alolan',
  GALARIAN: 'Galarian',
  HISUIAN: 'Hisuian',
  PALDEA: 'Paldean',
};

/** Species whose form texts are filed under the key of another species, or a misspelt one. */
const FORM_TEXT_PREFIX: Readonly<Record<string, string>> = {
  SCATTERBUG: 'form_vivillon_',
  SPEWPA: 'form_vivillon_',
  WORMADAM: 'form_burmy_',
  MINIOR: 'form_core_',
  SQUAWKABILLY: 'form_squakabilly_',
};

/** Generic `form_<suffix>` texts that belong to one species only (Kyurem, Castform). */
const SPECIES_ONLY_FORM_TEXTS = new Set(['white', 'black', 'sun', 'rain', 'snow', 'normal']);

/** Names the text file cannot supply. Keyed by game-master form id. */
const FORM_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  MEWTWO_A: 'Armored Mewtwo',
  UNOWN_EXCLAMATION_POINT: 'Unown (!)',
  UNOWN_QUESTION_MARK: 'Unown (?)',
};

const TEMP_EVOLUTION_TEXT_INDEX: Readonly<Record<TempEvolution, number>> = {
  MEGA: 1,
  MEGA_X: 2,
  MEGA_Y: 3,
  PRIMAL: 4,
};

function pad4(value: number): string {
  return String(value).padStart(4, '0');
}

export function titleCase(id: string): string {
  return id
    .toLowerCase()
    .split('_')
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Species the text file may not name yet whose id runs two words together. */
const SPECIES_NAME_FALLBACKS: Readonly<Record<string, string>> = {
  WALKINGWAKE: 'Walking Wake',
  IRONLEAVES: 'Iron Leaves',
  GOUGINGFIRE: 'Gouging Fire',
  RAGINGBOLT: 'Raging Bolt',
  IRONBOULDER: 'Iron Boulder',
  IRONCROWN: 'Iron Crown',
};

/** The English name of a species; a fallback when the text file does not have it yet. */
export function speciesName(pokemonId: string, dex: number, texts: Map<string, string>): string {
  return (
    texts.get(`pokemon_name_${pad4(dex)}`) ??
    SPECIES_NAME_FALLBACKS[pokemonId] ??
    titleCase(pokemonId)
  );
}

/** The text describing a form, e.g. `Origin Forme`; undefined when the text file has none. */
function formText(
  pokemonId: string,
  suffix: string,
  texts: Map<string, string>,
): string | undefined {
  const lower = suffix.toLowerCase();
  const keys = [`form_${pokemonId.toLowerCase()}_${lower}`];
  const prefix = FORM_TEXT_PREFIX[pokemonId];
  if (prefix) keys.push(`${prefix}${lower}`);
  if (!SPECIES_ONLY_FORM_TEXTS.has(lower)) keys.push(`form_${lower}`);
  for (const key of keys) {
    const found = texts.get(key)?.trim();
    if (found) return found;
  }
  return undefined;
}

export interface NameInput {
  pokemonId: string;
  dex: number;
  /** Result of `speciesName`. */
  species: string;
  kind: FormKind;
  /** The form id without the species prefix, e.g. `ALOLA`, `ORIGIN`; null for species and megas. */
  suffix: string | null;
  form: string | null;
  tempEvolution: TempEvolution | null;
  texts: Map<string, string>;
}

/** English display name: `Alolan Rattata`, `Giratina (Origin Forme)`, `Mega Charizard X`. */
export function displayName(input: NameInput): string {
  const { pokemonId, dex, species, kind, suffix, form, tempEvolution, texts } = input;
  const override = form ? FORM_NAME_OVERRIDES[form] : undefined;
  if (override) return override;

  if (kind === 'mega' && tempEvolution) {
    const fromText = texts.get(
      `pokemon_name_${pad4(dex)}_${pad4(TEMP_EVOLUTION_TEXT_INDEX[tempEvolution])}`,
    );
    if (fromText) return fromText;
    const [stage, variant] = tempEvolution.split('_');
    return `${titleCase(stage ?? '')} ${species}${variant ? ` ${variant}` : ''}`;
  }
  if (suffix === null || kind === 'species') return species;

  if (kind === 'regional') {
    const [region, ...rest] = suffix.split('_');
    const regional = `${REGION_ADJECTIVES[region ?? ''] ?? titleCase(region ?? '')} ${species}`;
    if (rest.length === 0) return regional;
    const remainder = rest.join('_');
    const described =
      formText(pokemonId, remainder, texts) ??
      formText(pokemonId, suffix, texts) ??
      titleCase(remainder);
    return `${regional} (${described})`;
  }
  const described = formText(pokemonId, suffix, texts) ?? titleCase(suffix);
  return described.toLowerCase().includes(species.toLowerCase())
    ? described
    : `${species} (${described})`;
}
```

`src/domain/pogo/pokebattler.ts`:

```ts
import type { TempEvolution } from './types.js';

/**
 * Pokémon whose Pokebattler name does not follow the rule in `pokebattlerId`. Values are the
 * names the legacy bot used (data/pokemon.json `pbName`), keyed by catalogue key.
 */
export const POKEBATTLER_EXCEPTIONS: Readonly<Record<string, string>> = {
  // The species entry stands for a named default form.
  arceus: 'ARCEUS_NORMAL_FORM',
  tornadus: 'TORNADUS_INCARNATE_FORM',
  thundurus: 'THUNDURUS_INCARNATE_FORM',
  landorus: 'LANDORUS_INCARNATE_FORM',
  enamorus: 'ENAMORUS_INCARNATE_FORM',
  meloetta: 'MELOETTA_ARIA_FORM',
  // Forms Pokebattler names without the _FORM suffix.
  kyurem_white: 'KYUREM_WHITE',
  kyurem_black: 'KYUREM_BLACK',
  pumpkaboo_small: 'PUMPKABOO_SMALL',
  pumpkaboo_average: 'PUMPKABOO_AVERAGE',
  pumpkaboo_large: 'PUMPKABOO_LARGE',
  pumpkaboo_super: 'PUMPKABOO_SUPER',
  gourgeist_small: 'GOURGEIST_SMALL',
  gourgeist_average: 'GOURGEIST_AVERAGE',
  gourgeist_large: 'GOURGEIST_LARGE',
  gourgeist_super: 'GOURGEIST_SUPER',
  hoopa_confined: 'HOOPA_CONFINED',
  hoopa_unbound: 'HOOPA_UNBOUND',
  // Forms Pokebattler does not tell apart from the species.
  cherrim_overcast: 'CHERRIM',
  cherrim_sunny: 'CHERRIM',
  oinkologne_female: 'OINKOLOGNE',
  maushold_family_of_three: 'MAUSHOLD',
  maushold_family_of_four: 'MAUSHOLD',
  palafin_hero: 'PALAFIN',
  palafin_zero: 'PALAFIN',
  // Different word order.
  darmanitan_galarian_standard: 'DARMANITAN_GALARIAN_FORM',
  darmanitan_galarian_zen: 'DARMANITAN_ZEN_GALARIAN_FORM',
  // Hyphenated names.
  jangmo_o: 'JANGMO-O',
  hakamo_o: 'HAKAMO-O',
  kommo_o: 'KOMMO-O',
};

/**
 * The name Pokebattler uses: the species id, `<species>_MEGA[_X|_Y]` for megas, and
 * `<form>_FORM` for any other form, except for the entries in `POKEBATTLER_EXCEPTIONS`.
 */
export function pokebattlerId(
  pokemonId: string,
  form: string | null,
  tempEvolution: TempEvolution | null,
): string {
  const key = (tempEvolution ? `${pokemonId}_${tempEvolution}` : (form ?? pokemonId)).toLowerCase();
  const exception = POKEBATTLER_EXCEPTIONS[key];
  if (exception) return exception;
  if (tempEvolution) return `${pokemonId}_${tempEvolution}`;
  return form ? `${form}_FORM` : pokemonId;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/domain/pogo/names.test.ts src/domain/pogo/pokebattler.test.ts`
Expected: PASS, 18 tests in 2 files.

- [ ] **Step 5: Check and commit**

Run: `npx prettier --write src/domain/pogo && npm run check`

```bash
git add src/domain/pogo
git commit -m "Derive Pokémon display names and Pokebattler names" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Game-master parser and fixtures

The game master is an array of about 19,000 `{ templateId, data: { <kind>: {...} } }` items. This task turns the kinds Pine needs into `GameData`.

Facts about the data that the parser depends on (all checked against the 2026-10-10 game master):
- `pokemonSettings` items have templateIds `V0003_POKEMON_VENUSAUR[_FORM]`; the four digits are the Pokédex number. Each species has one item with no `form`, usually one with form `<SPECIES>_NORMAL`, and one per other form.
- The two Nidoran species share the form id `NIDORAN_NORMAL`, so forms are grouped by `pokemonId`, never looked up by form id alone.
- The `_NORMAL` form is the species as it appears in game and differs from the formless item for four species (Dugtrio's stats; the moves of Castform, Deoxys and Genesect), so the species entry takes its data from `_NORMAL` when there is one.
- Costumes are flagged `isCostume` in `formSettings`. Two flagged forms have their own stats or types (Armored Mewtwo, a Corsola event form) and are kept as real forms. Twelve unflagged forms are cosmetic and are listed by id.
- Megas and primals are `tempEvoOverrides` on the formless item. Some override elements carry no `tempEvoId` and no stats (camera settings only) and are skipped.
- Moves are `V0021_MOVE_FLAME_WHEEL`. A fast move's id ends in `_FAST`. A few Pokémon reference a move by its number instead of its id.
- `typeEffective.attackScalar` lists the 18 defender types in the `POKEMON_TYPES` order.
- `playerLevel.cpMultiplier` has one value per whole level.

**Files:**
- Create: `scripts/game-data/make-fixtures.ts`, `test/support/game-data.ts`, `src/domain/pogo/game-master.ts`, `src/domain/pogo/game-master.test.ts`
- Create (generated): `test/fixtures/game-master-sample.json`, `test/fixtures/english-sample.txt`, `test/fixtures/game-data.json`

**Interfaces:**
- Consumes: Task 1 and Task 2 exports.
- Produces: `interface PokemonEntry { key; dex; pokemonId; form: string | null; kind: 'species' | 'regional' | 'form' | 'mega'; tempEvolution: TempEvolution | null; name; types: PokemonType[]; stats: { attack; defense; stamina }; fastMoves: string[]; chargedMoves: string[]; eliteFastMoves: string[]; eliteChargedMoves: string[]; family: string; shadow: boolean; pokebattlerId: string }`; `interface Move { id; number; name; type: PokemonType; fast: boolean; power; energyDelta; durationMs }`; `interface GameData { pokemon: PokemonEntry[]; moves: Move[]; typeChart: Record<PokemonType, Record<PokemonType, number>>; weatherBoosts: Record<Weather, PokemonType[]>; cpMultipliers: number[] }`; `parseGameMaster(raw: unknown, texts: Map<string, string>): GameData`; test helpers `readGameMasterSample(): unknown`, `readEnglishSample(): string`, `gameDataFixture(): GameData`.

- [ ] **Step 1: Write the fixture readers**

`test/support/game-data.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { GameData } from '../../src/domain/pogo/game-master.js';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');

/** A few species' raw game-master items, as downloaded (see scripts/game-data/make-fixtures.ts). */
export function readGameMasterSample(): unknown {
  return JSON.parse(readFileSync(path.join(fixtures, 'game-master-sample.json'), 'utf8'));
}

/** The text-file entries that go with the sample. */
export function readEnglishSample(): string {
  return readFileSync(path.join(fixtures, 'english-sample.txt'), 'utf8');
}

let snapshot: GameData | undefined;

/** A whole game master, parsed. Shared between tests; treat it as read-only. */
export function gameDataFixture(): GameData {
  snapshot ??= JSON.parse(readFileSync(path.join(fixtures, 'game-data.json'), 'utf8')) as GameData;
  return snapshot;
}
```

- [ ] **Step 2: Write the failing test**

`src/domain/pogo/game-master.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readEnglishSample, readGameMasterSample } from '../../../test/support/game-data.js';
import { parseGameMaster, type PokemonEntry } from './game-master.js';
import { parseTextFile } from './text.js';

const texts = parseTextFile(readEnglishSample());
const data = parseGameMaster(readGameMasterSample(), texts);
const byKey = new Map(data.pokemon.map((entry) => [entry.key, entry]));

function entry(key: string): PokemonEntry {
  const found = byKey.get(key);
  if (!found) throw new Error(`no entry ${key}`);
  return found;
}

describe('parseGameMaster: Pokémon', () => {
  it('builds a species entry with types, stats, moves and family', () => {
    expect(entry('venusaur')).toEqual({
      key: 'venusaur',
      dex: 3,
      pokemonId: 'VENUSAUR',
      form: null,
      kind: 'species',
      tempEvolution: null,
      name: 'Venusaur',
      types: ['grass', 'poison'],
      stats: { attack: 198, defense: 189, stamina: 190 },
      fastMoves: ['RAZOR_LEAF_FAST', 'VINE_WHIP_FAST'],
      chargedMoves: ['SLUDGE_BOMB', 'PETAL_BLIZZARD', 'SOLAR_BEAM', 'SLUDGE'],
      eliteFastMoves: [],
      eliteChargedMoves: ['FRENZY_PLANT'],
      family: 'BULBASAUR',
      shadow: true,
      pokebattlerId: 'VENUSAUR',
    });
  });

  it('gives every entry a unique key', () => {
    expect(new Set(data.pokemon.map((p) => p.key)).size).toBe(data.pokemon.length);
  });

  it('keeps the two Nidoran species apart although they share a form id', () => {
    expect(entry('nidoran_female').dex).toBe(29);
    expect(entry('nidoran_male').dex).toBe(32);
    expect(byKey.has('nidoran_normal')).toBe(false);
  });

  it('takes the species data from the NORMAL form where the two differ', () => {
    // The formless Dugtrio entry has defense 134; the form that appears in game has 136.
    expect(entry('dugtrio').stats).toEqual({ attack: 167, defense: 136, stamina: 111 });
    expect(entry('deoxys').chargedMoves).toContain('THUNDERBOLT');
  });

  it('does not list NORMAL forms, costumes or cosmetic forms separately', () => {
    for (const key of [
      'venusaur_normal',
      'venusaur_copy_2019',
      'pikachu_flying_01',
      'pikachu_normal',
      'latias_s',
    ]) {
      expect(byKey.has(key), key).toBe(false);
    }
    expect(data.pokemon.filter((p) => p.pokemonId === 'PIKACHU').map((p) => p.key)).toEqual([
      'pikachu',
    ]);
  });

  it('keeps a costume that has its own stats as a real form', () => {
    expect(entry('mewtwo_a')).toMatchObject({
      name: 'Armored Mewtwo',
      kind: 'form',
      form: 'MEWTWO_A',
      stats: { attack: 182, defense: 278, stamina: 214 },
      pokebattlerId: 'MEWTWO_A_FORM',
    });
  });

  it('lists regional and other forms with their own data', () => {
    expect(entry('rattata_alola')).toMatchObject({
      name: 'Alolan Rattata',
      kind: 'regional',
      types: ['dark', 'normal'],
      pokebattlerId: 'RATTATA_ALOLA_FORM',
    });
    expect(entry('tauros_paldea_blaze').name).toBe('Paldean Tauros (Blaze Breed)');
    expect(entry('giratina_origin')).toMatchObject({
      name: 'Giratina (Origin Forme)',
      kind: 'form',
      stats: { attack: 225, defense: 187, stamina: 284 },
    });
    expect(entry('giratina').stats).toEqual({ attack: 187, defense: 225, stamina: 284 });
    expect(entry('unown_question_mark').name).toBe('Unown (?)');
  });

  it('lists temporary evolutions with their own stats and types', () => {
    expect(entry('charizard_mega_x')).toMatchObject({
      name: 'Mega Charizard X',
      kind: 'mega',
      form: null,
      tempEvolution: 'MEGA_X',
      types: ['fire', 'dragon'],
      stats: { attack: 273, defense: 213, stamina: 186 },
      pokebattlerId: 'CHARIZARD_MEGA_X',
    });
    expect(entry('kyogre_primal')).toMatchObject({
      name: 'Primal Kyogre',
      tempEvolution: 'PRIMAL',
    });
    expect(entry('venusaur_mega').fastMoves).toEqual(entry('venusaur').fastMoves);
    expect(byKey.has('mewtwo_mega_x')).toBe(true);
    expect(byKey.has('mewtwo_mega_y')).toBe(true);
  });

  it('resolves a move referenced by number', () => {
    expect(entry('zeraora').chargedMoves).toContain('PLASMA_FISTS');
  });

  it('copes with a species that has no moves and one with no English name yet', () => {
    expect(entry('smeargle')).toMatchObject({ fastMoves: [], chargedMoves: [] });
    expect(entry('walkingwake').name).toBe('Walking Wake');
  });

  it('marks which Pokémon can be shadow', () => {
    expect(entry('venusaur').shadow).toBe(true);
    expect(entry('smeargle').shadow).toBe(false);
  });

  it('sorts by Pokédex number, then key', () => {
    const order = data.pokemon.map((p) => `${String(p.dex).padStart(4, '0')} ${p.key}`);
    expect(order).toEqual([...order].sort());
  });
});

describe('parseGameMaster: moves, types, weather, CP', () => {
  it('parses moves and tells fast from charged', () => {
    const moves = new Map(data.moves.map((move) => [move.id, move]));
    expect(moves.get('VINE_WHIP_FAST')).toEqual({
      id: 'VINE_WHIP_FAST',
      number: 214,
      name: 'Vine Whip',
      type: 'grass',
      fast: true,
      power: 6,
      energyDelta: 5,
      durationMs: 500,
    });
    expect(moves.get('FRENZY_PLANT')).toMatchObject({ name: 'Frenzy Plant', fast: false });
    // No English name in the text file: the id is turned into words.
    expect(moves.get('PLASMA_FISTS')?.name).toBe('Plasma Fists');
  });

  it('reads the type chart with defenders in the fixed order', () => {
    expect(data.typeChart.water.fire).toBe(1.6);
    expect(data.typeChart.fire.water).toBe(0.625);
    expect(data.typeChart.electric.ground).toBe(0.390625);
    expect(data.typeChart.normal.ghost).toBe(0.390625);
    expect(data.typeChart.dragon.fairy).toBe(0.390625);
    expect(data.typeChart.fairy.dragon).toBe(1.6);
    expect(data.typeChart.normal.normal).toBe(1);
  });

  it('reads the weather boosts', () => {
    expect(data.weatherBoosts.clear).toEqual(['grass', 'ground', 'fire']);
    expect(data.weatherBoosts.fog).toEqual(['dark', 'ghost']);
    expect(Object.keys(data.weatherBoosts)).toHaveLength(7);
  });

  it('reads the CP multipliers by level', () => {
    expect(data.cpMultipliers[0]).toBe(0.094);
    expect(data.cpMultipliers[19]).toBe(0.5974);
    expect(data.cpMultipliers.length).toBeGreaterThanOrEqual(50);
  });
});

describe('parseGameMaster: bad input', () => {
  it('rejects input with no Pokémon', () => {
    expect(() => parseGameMaster([], texts)).toThrow(/no Pokémon/);
    expect(() => parseGameMaster({ error: 'rate limited' }, texts)).toThrow(/no Pokémon/);
  });

  it('rejects a game master without the type chart', () => {
    const items = (readGameMasterSample() as Array<{ data: Record<string, unknown> }>).filter(
      (item) => !('typeEffective' in item.data),
    );
    expect(() => parseGameMaster(items, texts)).toThrow(/type effectiveness/);
  });

  it('skips items it does not understand', () => {
    const items = [
      ...(readGameMasterSample() as unknown[]),
      null,
      'text',
      { templateId: 'V9999_POKEMON_BROKEN', data: { pokemonSettings: {} } },
      { templateId: 'NOT_A_POKEMON', data: { pokemonSettings: { pokemonId: 'X' } } },
    ];
    expect(parseGameMaster(items, texts).pokemon).toHaveLength(data.pokemon.length);
  });

  it('treats a form id that is not a string as the species itself', () => {
    const items = (readGameMasterSample() as Array<Record<string, unknown>>).map((item) =>
      item['templateId'] === 'V0235_POKEMON_SMEARGLE'
        ? {
            ...item,
            data: {
              pokemonSettings: { pokemonId: 'SMEARGLE', form: 2592, type: 'POKEMON_TYPE_NORMAL' },
            },
          }
        : item,
    );
    expect(parseGameMaster(items, texts).pokemon.some((p) => p.key === 'smeargle')).toBe(true);
  });

  it('falls back to ids when the text file is empty', () => {
    const bare = parseGameMaster(readGameMasterSample(), new Map());
    expect(bare.pokemon.find((p) => p.key === 'venusaur')?.name).toBe('Venusaur');
    expect(bare.pokemon.find((p) => p.key === 'giratina_origin')?.name).toBe('Giratina (Origin)');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/domain/pogo/game-master.test.ts`
Expected: FAIL, cannot resolve `./game-master.js` (and the fixtures do not exist yet).

- [ ] **Step 4: Implement the parser**

`src/domain/pogo/game-master.ts`:

```ts
import { displayName, speciesName, type FormKind } from './names.js';
import { pokebattlerId } from './pokebattler.js';
import {
  POKEMON_TYPES,
  WEATHER_CONDITIONS,
  parseType,
  parseWeather,
  type PokemonType,
  type TempEvolution,
  type Weather,
} from './types.js';

export interface PokemonEntry {
  /** Stable lower-case identifier, e.g. `venusaur`, `rattata_alola`, `charizard_mega_x`. */
  key: string;
  dex: number;
  /** Game-master species id, e.g. `VENUSAUR`, `NIDORAN_FEMALE`. */
  pokemonId: string;
  /** Game-master form id, e.g. `RATTATA_ALOLA`; null for the species entry and for megas. */
  form: string | null;
  kind: 'species' | 'regional' | 'form' | 'mega';
  tempEvolution: TempEvolution | null;
  /** English display name, e.g. `Alolan Rattata`, `Giratina (Origin Forme)`, `Mega Charizard X`. */
  name: string;
  types: PokemonType[];
  stats: { attack: number; defense: number; stamina: number };
  /** Move ids (see `Move.id`). */
  fastMoves: string[];
  chargedMoves: string[];
  eliteFastMoves: string[];
  eliteChargedMoves: string[];
  family: string;
  /** Can appear as a shadow Pokémon. */
  shadow: boolean;
  /** Name Pokebattler uses for this Pokémon. */
  pokebattlerId: string;
}

export interface Move {
  /** Game-master move id, e.g. `FLAME_WHEEL`, `VINE_WHIP_FAST`. */
  id: string;
  number: number;
  name: string;
  type: PokemonType;
  fast: boolean;
  power: number;
  energyDelta: number;
  durationMs: number;
}

/** Everything Pine derives from the game master and text file. JSON-serialisable. */
export interface GameData {
  pokemon: PokemonEntry[];
  moves: Move[];
  /** typeChart[attacker][defender] = damage multiplier. */
  typeChart: Record<PokemonType, Record<PokemonType, number>>;
  weatherBoosts: Record<Weather, PokemonType[]>;
  /** CP multiplier per whole level; index 0 is level 1. */
  cpMultipliers: number[];
}

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): Raw {
  return isRecord(value) ? value : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

const REGIONS = ['ALOLA', 'GALARIAN', 'HISUIAN', 'PALDEA'];
/** Forms that only change appearance but are not flagged as costumes in the game master. */
const COSMETIC_FORMS = new Set([
  'VENUSAUR_COPY_2019',
  'CHARIZARD_COPY_2019',
  'BLASTOISE_COPY_2019',
  'PIKACHU_COPY_2019',
  'PSYDUCK_SWIM_2025',
  'RAIKOU_S',
  'ENTEI_S',
  'SUICUNE_S',
  'LUGIA_S',
  'HO_OH_S',
  'LATIAS_S',
  'LATIOS_S',
]);
const TEMP_EVOLUTIONS: Record<string, TempEvolution> = {
  TEMP_EVOLUTION_MEGA: 'MEGA',
  TEMP_EVOLUTION_MEGA_X: 'MEGA_X',
  TEMP_EVOLUTION_MEGA_Y: 'MEGA_Y',
  TEMP_EVOLUTION_PRIMAL: 'PRIMAL',
};

interface RawPokemon {
  dex: number;
  pokemonId: string;
  form: string | null;
  settings: Raw;
}

function parseStats(raw: unknown): PokemonEntry['stats'] {
  const stats = record(raw);
  return {
    attack: number(stats['baseAttack']),
    defense: number(stats['baseDefense']),
    stamina: number(stats['baseStamina']),
  };
}

function parseTypes(first: unknown, second: unknown): PokemonType[] {
  return [parseType(first), parseType(second)].filter((t): t is PokemonType => t !== undefined);
}

function sameStatsAndTypes(a: Raw, b: Raw): boolean {
  return (
    JSON.stringify(parseStats(a['stats'])) === JSON.stringify(parseStats(b['stats'])) &&
    JSON.stringify(parseTypes(a['type'], a['type2'])) ===
      JSON.stringify(parseTypes(b['type'], b['type2']))
  );
}

function parseMoves(items: Raw[], texts: Map<string, string>): Move[] {
  const moves: Move[] = [];
  for (const item of items) {
    const match = /^V(\d{4})_MOVE_(.+)$/.exec(text(item['templateId']) ?? '');
    const settings = record(record(item['data'])['moveSettings']);
    const type = parseType(settings['pokemonType']);
    if (!match?.[1] || !match[2] || !type) continue;
    const id = match[2];
    const fallback = id
      .replace(/_FAST$/, '')
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    moves.push({
      id,
      number: Number(match[1]),
      name: texts.get(`move_name_${match[1]}`) ?? fallback,
      type,
      fast: id.endsWith('_FAST'),
      power: number(settings['power']),
      energyDelta: number(settings['energyDelta']),
      durationMs: number(settings['durationMs']),
    });
  }
  return moves.sort((a, b) => a.number - b.number);
}

function parseTypeChart(items: Raw[]): GameData['typeChart'] {
  const chart = {} as GameData['typeChart'];
  for (const item of items) {
    const effective = record(record(item['data'])['typeEffective']);
    const attacker = parseType(effective['attackType']);
    const scalars = list(effective['attackScalar']);
    if (!attacker || scalars.length !== POKEMON_TYPES.length) continue;
    const row = {} as Record<PokemonType, number>;
    POKEMON_TYPES.forEach((defender, index) => {
      row[defender] = number(scalars[index]);
    });
    chart[attacker] = row;
  }
  const missing = POKEMON_TYPES.filter((type) => !(type in chart));
  if (missing.length > 0) {
    throw new Error(`Game master has no type effectiveness for: ${missing.join(', ')}`);
  }
  return chart;
}

function parseWeatherBoosts(items: Raw[]): GameData['weatherBoosts'] {
  const boosts = Object.fromEntries(
    WEATHER_CONDITIONS.map((weather) => [weather, [] as PokemonType[]]),
  ) as GameData['weatherBoosts'];
  for (const item of items) {
    const affinity = record(record(item['data'])['weatherAffinities']);
    const weather = parseWeather(affinity['weatherCondition']);
    if (!weather) continue;
    boosts[weather] = list(affinity['pokemonType'])
      .map(parseType)
      .filter((t): t is PokemonType => t !== undefined);
  }
  return boosts;
}

/**
 * Turns the raw game master (an array of `{ templateId, data }`) and the parsed English text
 * file into the data Pine uses. Unknown or malformed items are skipped; a game master without
 * any Pokémon, or without the type chart or CP multipliers, is rejected.
 */
export function parseGameMaster(raw: unknown, texts: Map<string, string>): GameData {
  const items = list(raw).filter(isRecord);
  const withData = (kind: string): Raw[] =>
    items.filter((item) => isRecord(record(item['data'])[kind]));

  const moves = parseMoves(withData('moveSettings'), texts);
  const moveByNumber = new Map(moves.map((move) => [move.number, move.id]));
  const moveIds = new Set(moves.map((move) => move.id));
  /** Move references are ids, or occasionally the move's number. */
  const moveRefs = (value: unknown): string[] =>
    list(value)
      .map((ref) => (typeof ref === 'number' ? moveByNumber.get(ref) : text(ref)))
      .filter((id): id is string => id !== undefined && moveIds.has(id));

  const costumes = new Set<string>();
  for (const item of withData('formSettings')) {
    const settings = record(record(item['data'])['formSettings']);
    for (const form of list(settings['forms']).map(record)) {
      if (form['isCostume'] === true)
        costumes.add(`${String(settings['pokemon'])}|${String(form['form'])}`);
    }
  }

  const rawPokemon: RawPokemon[] = [];
  for (const item of withData('pokemonSettings')) {
    const dex = /^V(\d{4})_POKEMON_/.exec(text(item['templateId']) ?? '')?.[1];
    const settings = record(record(item['data'])['pokemonSettings']);
    const pokemonId = text(settings['pokemonId']);
    if (!dex || !pokemonId) continue;
    // The form is normally a string; older game masters had numbers for brand-new forms.
    rawPokemon.push({
      dex: Number(dex),
      pokemonId,
      form: text(settings['form']) ?? null,
      settings,
    });
  }

  const bySpecies = new Map<string, RawPokemon[]>();
  for (const pokemon of rawPokemon) {
    bySpecies.set(pokemon.pokemonId, [...(bySpecies.get(pokemon.pokemonId) ?? []), pokemon]);
  }

  const entries: PokemonEntry[] = [];
  for (const [pokemonId, forms] of bySpecies) {
    const base = forms.find((pokemon) => pokemon.form === null);
    if (!base) continue;
    const suffixOf = (form: string): string =>
      form.startsWith(`${pokemonId}_`)
        ? form.slice(pokemonId.length + 1)
        : form.replace(/^[A-Z]+_/, '');
    // The "_NORMAL" form is the species as it normally appears; prefer its data where it exists.
    const normal = forms.find((p) => p.form !== null && suffixOf(p.form) === 'NORMAL') ?? base;
    const species = speciesName(pokemonId, base.dex, texts);

    const build = (
      source: Raw,
      identity: Pick<PokemonEntry, 'key' | 'form' | 'kind' | 'tempEvolution'>,
      formKind: FormKind,
      suffix: string | null,
      overrides: { stats?: unknown; types?: PokemonType[] } = {},
    ): PokemonEntry => ({
      ...identity,
      dex: base.dex,
      pokemonId,
      name: displayName({
        pokemonId,
        dex: base.dex,
        species,
        kind: formKind,
        suffix,
        form: identity.form,
        tempEvolution: identity.tempEvolution,
        texts,
      }),
      types: overrides.types ?? parseTypes(source['type'], source['type2']),
      stats: parseStats(overrides.stats ?? source['stats']),
      fastMoves: moveRefs(source['quickMoves']),
      chargedMoves: moveRefs(source['cinematicMoves']),
      eliteFastMoves: moveRefs(source['eliteQuickMove']),
      eliteChargedMoves: moveRefs(source['eliteCinematicMove']),
      family: (text(source['familyId']) ?? pokemonId).replace(/^FAMILY_/, ''),
      shadow: isRecord(source['shadow']),
      pokebattlerId: pokebattlerId(pokemonId, identity.form, identity.tempEvolution),
    });

    entries.push(
      build(
        normal.settings,
        { key: pokemonId.toLowerCase(), form: null, kind: 'species', tempEvolution: null },
        'species',
        null,
      ),
    );

    for (const pokemon of forms) {
      if (pokemon.form === null) continue;
      const suffix = suffixOf(pokemon.form);
      if (suffix === 'NORMAL' || COSMETIC_FORMS.has(pokemon.form)) continue;
      // A flagged costume with its own stats or types is a real form (Armored Mewtwo).
      if (
        costumes.has(`${pokemonId}|${pokemon.form}`) &&
        sameStatsAndTypes(pokemon.settings, base.settings)
      ) {
        continue;
      }
      const regional = REGIONS.includes(suffix.split('_')[0] ?? '');
      const kind = regional ? 'regional' : 'form';
      entries.push(
        build(
          pokemon.settings,
          { key: pokemon.form.toLowerCase(), form: pokemon.form, kind, tempEvolution: null },
          kind,
          suffix,
        ),
      );
    }

    for (const override of list(base.settings['tempEvoOverrides']).map(record)) {
      const tempEvolution = TEMP_EVOLUTIONS[text(override['tempEvoId']) ?? ''];
      if (!tempEvolution || !isRecord(override['stats'])) continue;
      entries.push(
        build(
          normal.settings,
          {
            key: `${pokemonId}_${tempEvolution}`.toLowerCase(),
            form: null,
            kind: 'mega',
            tempEvolution,
          },
          'mega',
          null,
          {
            stats: override['stats'],
            types: parseTypes(override['typeOverride1'], override['typeOverride2']),
          },
        ),
      );
    }
  }
  if (entries.length === 0) throw new Error('Game master contains no Pokémon');

  const playerLevel = withData('playerLevel')[0];
  const cpMultipliers = list(record(record(playerLevel?.['data'])['playerLevel'])['cpMultiplier'])
    .map(number)
    .filter((multiplier) => multiplier > 0);
  if (cpMultipliers.length === 0) throw new Error('Game master contains no CP multipliers');

  return {
    pokemon: entries.sort((a, b) => a.dex - b.dex || a.key.localeCompare(b.key)),
    moves,
    typeChart: parseTypeChart(withData('typeEffective')),
    weatherBoosts: parseWeatherBoosts(withData('weatherAffinities')),
    cpMultipliers,
  };
}
```

- [ ] **Step 5: Write the fixture builder and build the fixtures**

`scripts/game-data/make-fixtures.ts`:

```ts
/**
 * Builds the game-data test fixtures from a downloaded game master and English text file:
 * - test/fixtures/game-master-sample.json: the raw items for a few species, for parser tests
 * - test/fixtures/english-sample.txt: the text entries those items need
 * - test/fixtures/game-data.json: the whole game master parsed, for catalogue and parity tests
 * Reads var/game-data-source/gamemaster.json and English.txt, downloading them when missing.
 * Re-run to refresh the fixtures to a newer game master.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseGameMaster } from '../../src/domain/pogo/game-master.js';
import { parseTextFile } from '../../src/domain/pogo/text.js';

const GAME_MASTER_URL =
  'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json';
const TEXT_URL =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/English.txt';

/** Species that between them exercise every rule in the parser. */
const SAMPLE_SPECIES = [
  'VENUSAUR', // mega, shadow, a cosmetic COPY_2019 form
  'CHARIZARD', // two megas
  'RATTATA', // regional form
  'PIKACHU', // costumes
  'NIDORAN_FEMALE', // shares the form id NIDORAN_NORMAL with NIDORAN_MALE
  'NIDORAN_MALE',
  'DUGTRIO', // the formless entry and the NORMAL form have different stats
  'TAUROS', // regional forms with a second part
  'MEWTWO', // a flagged costume that is a real form (Armored)
  'SMEARGLE', // no moves
  'UNOWN', // forms without text
  'LATIAS', // cosmetic S form, mega
  'KYOGRE', // primal
  'DEOXYS', // forms; NORMAL differs from the formless entry in moves
  'GIRATINA', // no NORMAL form
  'DARMANITAN', // regional forms with a mode
  'ZERAORA', // a move referenced by number
  'WALKINGWAKE', // no English name in the text file yet
];

const repoRoot = path.resolve(import.meta.dirname, '../..');
const sourceDir = path.join(repoRoot, 'var/game-data-source');
const fixtureDir = path.join(repoRoot, 'test/fixtures');

async function source(file: string, url: string): Promise<string> {
  const target = path.join(sourceDir, file);
  if (!existsSync(target)) {
    process.stdout.write(`Downloading ${url}\n`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    await mkdir(sourceDir, { recursive: true });
    await writeFile(target, await response.text());
  }
  return readFile(target, 'utf8');
}

type Item = { templateId: string; data: Record<string, unknown> };

const textContent = await source('English.txt', TEXT_URL);
const gameMaster = JSON.parse(await source('gamemaster.json', GAME_MASTER_URL)) as Item[];
const texts = parseTextFile(textContent);

const speciesOf = (item: Item): string | undefined => {
  const pokemon = item.data['pokemonSettings'] as { pokemonId?: string } | undefined;
  const forms = item.data['formSettings'] as { pokemon?: string } | undefined;
  return pokemon?.pokemonId ?? forms?.pokemon;
};
const sampled = gameMaster.filter((item) => SAMPLE_SPECIES.includes(speciesOf(item) ?? ''));
const referencedMoves = new Set<string | number>();
for (const item of sampled) {
  const settings = (item.data['pokemonSettings'] ?? {}) as Record<string, unknown>;
  for (const field of ['quickMoves', 'cinematicMoves', 'eliteQuickMove', 'eliteCinematicMove']) {
    for (const move of (settings[field] ?? []) as Array<string | number>) referencedMoves.add(move);
  }
}
const sample = gameMaster.filter((item) => {
  if (sampled.includes(item)) return true;
  if ('typeEffective' in item.data || 'weatherAffinities' in item.data) return true;
  if ('playerLevel' in item.data) return true;
  const move = /^V(\d{4})_MOVE_(.+)$/.exec(item.templateId);
  return (
    'moveSettings' in item.data &&
    move !== null &&
    (referencedMoves.has(move[2] ?? '') || referencedMoves.has(Number(move[1])))
  );
});

const sampleDex = new Set(sampled.map((item) => /^V(\d{4})_/.exec(item.templateId)?.[1]));
const sampleMoves = new Set(sample.map((item) => /^V(\d{4})_MOVE_/.exec(item.templateId)?.[1]));
const sampleText = [...texts]
  .filter(([key]) => {
    const pokemon = /^pokemon_name_(\d{4})/.exec(key)?.[1];
    const move = /^move_name_(\d{4})$/.exec(key)?.[1];
    return (
      (pokemon !== undefined && sampleDex.has(pokemon) && !key.startsWith('pokemon_name_1009')) ||
      (move !== undefined && sampleMoves.has(move)) ||
      key.startsWith('form_')
    );
  })
  .map(([key, value]) => `RESOURCE ID: ${key}\nTEXT: ${value}\n`)
  .join('\n');

await mkdir(fixtureDir, { recursive: true });
await writeFile(
  path.join(fixtureDir, 'game-master-sample.json'),
  `${JSON.stringify(sample, null, 1)}\n`,
);
await writeFile(path.join(fixtureDir, 'english-sample.txt'), sampleText);
await writeFile(
  path.join(fixtureDir, 'game-data.json'),
  `${JSON.stringify(parseGameMaster(gameMaster, texts))}\n`,
);
process.stdout.write(
  `Wrote ${sample.length} sample items, ${sampleText.split('RESOURCE ID').length - 1} texts and the parsed snapshot to ${fixtureDir}\n`,
);
```

Run: `ls var/game-data-source`
Expected: `English.txt  gamemaster.json  raidboss.json` (already downloaded on this machine; the script downloads the first two only if they are missing).

Run: `npx tsx scripts/game-data/make-fixtures.ts`
Expected: `Wrote 295 sample items, 416 texts and the parsed snapshot to …test/fixtures` (the counts depend on the game master in `var/`; with the 2026-10-10 file they are exactly these).

Run: `ls -la test/fixtures/game-*.json test/fixtures/english-sample.txt`
Expected: `game-master-sample.json` about 400 KB, `game-data.json` about 650 KB, `english-sample.txt` about 20 KB.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/domain/pogo/game-master.test.ts`
Expected: PASS, 21 tests.

If a test about a specific Pokémon fails, first confirm the fixtures were built from the game master in `var/game-data-source` and not from a fresh download; a newer game master can change stats or moves. Report any expectation you had to change and why; do not loosen a test to make it pass.

- [ ] **Step 7: Check and commit**

`test/fixtures/` is ignored by Prettier, so only the sources need formatting.

Run: `npx prettier --write src/domain/pogo scripts/game-data test/support/game-data.ts && npm run check`

```bash
git add src/domain/pogo scripts/game-data test/support/game-data.ts test/fixtures/game-master-sample.json test/fixtures/english-sample.txt test/fixtures/game-data.json
git commit -m "Parse the game master into Pine's game data" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: CP maths and the catalogue

**Files:**
- Create: `src/domain/pogo/cp.ts`, `src/domain/pogo/cp.test.ts`, `src/domain/pogo/catalogue.ts`, `src/domain/pogo/catalogue.test.ts`
- Modify: `test/support/game-data.ts`

**Interfaces:**
- Consumes: `GameData`, `PokemonEntry`, `Move` (Task 3); `gameDataFixture()`.
- Produces:
  - `interface Ivs { attack; defense; stamina }`; `cpMultiplierAt(multipliers: readonly number[], level: number): number` (levels in steps of a half; throws `RangeError` otherwise); `combatPower(stats, ivs, multiplier): number`; `interface RaidCatchCp { min; max; minBoosted; maxBoosted }`; `raidCatchCp(stats, multipliers): RaidCatchCp`; `raidBossCp(stats, bossStamina: number): number`.
  - `interface Weakness { type: PokemonType; multiplier: number }`; `class PokemonCatalogue` with `constructor(data: GameData)`, `all: readonly PokemonEntry[]`, `byKey(key)`, `byDex(dex)`, `species(dex)`, `byGameMasterId(pokemonId, form = null, tempEvolution = null)`, `move(id)`, `effectiveness(attacker, defenders)`, `weaknesses(entry): Weakness[]`, `boostedIn(entry): Weather[]`, `cpMultiplier(level)`, `raidCatchCp(entry)`.
  - test helper `catalogueFixture(): PokemonCatalogue`.

- [ ] **Step 1: Write the failing tests**

`src/domain/pogo/cp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gameDataFixture } from '../../../test/support/game-data.js';
import { combatPower, cpMultiplierAt, raidBossCp, raidCatchCp } from './cp.js';

const multipliers = gameDataFixture().cpMultipliers;
const MEWTWO = { attack: 300, defense: 182, stamina: 214 };
const PERFECT = { attack: 15, defense: 15, stamina: 15 };

describe('cpMultiplierAt', () => {
  it('returns the listed multiplier for a whole level', () => {
    expect(cpMultiplierAt(multipliers, 1)).toBe(0.094);
    expect(cpMultiplierAt(multipliers, 20)).toBe(0.5974);
    expect(cpMultiplierAt(multipliers, 40)).toBeCloseTo(0.7903, 6);
  });

  it('derives half levels from their neighbours', () => {
    expect(cpMultiplierAt(multipliers, 1.5)).toBeCloseTo(0.13513743, 7);
    expect(cpMultiplierAt(multipliers, 40.5)).toBeCloseTo(0.79280394, 7);
  });

  it('rejects levels that do not exist', () => {
    expect(() => cpMultiplierAt(multipliers, 0)).toThrow(RangeError);
    expect(() => cpMultiplierAt(multipliers, 20.25)).toThrow(RangeError);
    expect(() => cpMultiplierAt(multipliers, 500)).toThrow(RangeError);
    expect(() => cpMultiplierAt(multipliers, multipliers.length + 0.5)).toThrow(RangeError);
  });
});

describe('combatPower', () => {
  it('matches known values', () => {
    expect(combatPower(MEWTWO, PERFECT, cpMultiplierAt(multipliers, 20))).toBe(2387);
    expect(combatPower(MEWTWO, PERFECT, cpMultiplierAt(multipliers, 25))).toBe(2984);
    expect(combatPower(MEWTWO, PERFECT, cpMultiplierAt(multipliers, 40))).toBe(4178);
    expect(combatPower(MEWTWO, PERFECT, cpMultiplierAt(multipliers, 50))).toBe(4724);
  });

  it('never goes below 10', () => {
    expect(
      combatPower(
        { attack: 1, defense: 1, stamina: 1 },
        { attack: 0, defense: 0, stamina: 0 },
        0.094,
      ),
    ).toBe(10);
  });
});

describe('raid CP', () => {
  it('gives the catch range at level 20 and weather-boosted level 25', () => {
    expect(raidCatchCp(MEWTWO, multipliers)).toEqual({
      min: 2294,
      max: 2387,
      minBoosted: 2868,
      maxBoosted: 2984,
    });
  });

  it('gives the CP shown on the boss from the stamina of its raid level', () => {
    expect(raidBossCp(MEWTWO, 15000)).toBe(54148);
  });
});
```

`src/domain/pogo/catalogue.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import type { PokemonEntry } from './game-master.js';
import { POKEMON_TYPES } from './types.js';

const catalogue = catalogueFixture();

function entry(key: string): PokemonEntry {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(`no entry ${key}`);
  return found;
}

describe('PokemonCatalogue: the whole game master', () => {
  it('holds every species once, with forms and megas beside it', () => {
    const species = catalogue.all.filter((p) => p.kind === 'species');
    expect(species.length).toBeGreaterThanOrEqual(1024);
    expect(new Set(species.map((p) => p.dex)).size).toBe(species.length);
    expect(catalogue.all.filter((p) => p.kind === 'mega').length).toBeGreaterThanOrEqual(61);
    expect(catalogue.all.filter((p) => p.kind === 'regional').length).toBeGreaterThanOrEqual(56);
  });

  it('has unique keys and complete data for every entry', () => {
    expect(new Set(catalogue.all.map((p) => p.key)).size).toBe(catalogue.all.length);
    for (const pokemon of catalogue.all) {
      expect(pokemon.types.length, pokemon.key).toBeGreaterThan(0);
      expect(pokemon.stats.attack, pokemon.key).toBeGreaterThan(0);
      expect(pokemon.name, pokemon.key).not.toBe('');
      for (const move of [...pokemon.fastMoves, ...pokemon.chargedMoves]) {
        expect(catalogue.move(move), `${pokemon.key} ${move}`).toBeDefined();
      }
    }
  });

  it('never lists a costume', () => {
    expect(catalogue.all.filter((p) => p.pokemonId === 'PIKACHU').map((p) => p.key)).toEqual([
      'pikachu',
    ]);
  });
});

describe('PokemonCatalogue: lookups', () => {
  it('finds by key, ignoring case', () => {
    expect(entry('rattata_alola').name).toBe('Alolan Rattata');
    expect(catalogue.byKey('RATTATA_ALOLA')).toBe(entry('rattata_alola'));
    expect(catalogue.byKey('missingno')).toBeUndefined();
  });

  it('finds the species and all entries for a Pokédex number', () => {
    expect(catalogue.species(150)?.key).toBe('mewtwo');
    expect(catalogue.byDex(150).map((p) => p.key)).toEqual([
      'mewtwo',
      'mewtwo_a',
      'mewtwo_mega_x',
      'mewtwo_mega_y',
    ]);
    expect(catalogue.species(0)).toBeUndefined();
    expect(catalogue.byDex(99999)).toEqual([]);
  });

  it('finds by game-master ids', () => {
    expect(catalogue.byGameMasterId('YVELTAL')?.key).toBe('yveltal');
    expect(catalogue.byGameMasterId('LANDORUS', 'LANDORUS_INCARNATE')?.key).toBe(
      'landorus_incarnate',
    );
    expect(catalogue.byGameMasterId('BLASTOISE', null, 'MEGA')?.key).toBe('blastoise_mega');
    expect(catalogue.byGameMasterId('NIDORAN_FEMALE')?.dex).toBe(29);
    // A costume the game master does not list as its own entry.
    expect(catalogue.byGameMasterId('PIKACHU', 'PIKACHU_GLASS_HELMET_2026')).toBeUndefined();
    // A form id that belongs to another species.
    expect(catalogue.byGameMasterId('PIKACHU', 'RATTATA_ALOLA')).toBeUndefined();
  });

  it('finds moves', () => {
    expect(catalogue.move('FRENZY_PLANT')?.name).toBe('Frenzy Plant');
    expect(catalogue.move('NOPE')).toBeUndefined();
  });
});

describe('PokemonCatalogue: types and weather', () => {
  it('multiplies effectiveness over both types', () => {
    expect(catalogue.effectiveness('ice', ['dragon', 'flying'])).toBeCloseTo(2.56, 10);
    expect(catalogue.effectiveness('ground', ['electric', 'flying'])).toBeCloseTo(0.625, 10);
    expect(catalogue.effectiveness('normal', [])).toBe(1);
  });

  it('lists weaknesses strongest first, ties in type order', () => {
    expect(catalogue.weaknesses(entry('dragonite')).map((w) => w.type)).toEqual([
      'ice',
      'rock',
      'dragon',
      'fairy',
    ]);
    expect(catalogue.weaknesses(entry('dragonite'))[0]?.multiplier).toBeCloseTo(2.56, 10);
  });

  it('uses the types of the mega, not of the species', () => {
    expect(catalogue.weaknesses(entry('charizard')).map((w) => w.type)).toEqual([
      'rock',
      'water',
      'electric',
    ]);
    expect(catalogue.weaknesses(entry('charizard_mega_x')).map((w) => w.type)).toEqual([
      'ground',
      'rock',
      'dragon',
    ]);
  });

  it('gives every type at least one weakness and no multiplier of 1 or less', () => {
    for (const type of POKEMON_TYPES) {
      const single = catalogue.all.find((p) => p.types.length === 1 && p.types[0] === type);
      if (!single) continue;
      const weaknesses = catalogue.weaknesses(single);
      expect(weaknesses.length, type).toBeGreaterThan(0);
      expect(weaknesses.every((w) => w.multiplier > 1)).toBe(true);
    }
  });

  it('lists the weather that boosts a Pokémon', () => {
    expect(catalogue.boostedIn(entry('venusaur'))).toEqual(['clear', 'overcast']);
    expect(catalogue.boostedIn(entry('mewtwo'))).toEqual(['windy']);
  });
});

describe('PokemonCatalogue: CP', () => {
  it('exposes multipliers and raid catch ranges', () => {
    expect(catalogue.cpMultiplier(20)).toBe(0.5974);
    expect(catalogue.raidCatchCp(entry('mewtwo'))).toEqual({
      min: 2294,
      max: 2387,
      minBoosted: 2868,
      maxBoosted: 2984,
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/pogo/cp.test.ts src/domain/pogo/catalogue.test.ts`
Expected: FAIL, cannot resolve `./cp.js`; `catalogueFixture` is not exported.

- [ ] **Step 3: Implement**

`src/domain/pogo/cp.ts`:

```ts
import type { PokemonEntry } from './game-master.js';

export interface Ivs {
  attack: number;
  defense: number;
  stamina: number;
}

const PERFECT: Ivs = { attack: 15, defense: 15, stamina: 15 };
/** The lowest IVs a raid catch can have. */
const RAID_FLOOR: Ivs = { attack: 10, defense: 10, stamina: 10 };
/** Level of a raid catch, and of one boosted by the weather. */
const RAID_CATCH_LEVEL = 20;
const RAID_BOOSTED_LEVEL = 25;

/**
 * The CP multiplier for a level from 1 up, in steps of a half. The game master lists whole
 * levels only; a half level is the root mean square of its neighbours.
 */
export function cpMultiplierAt(multipliers: readonly number[], level: number): number {
  const lower = multipliers[Math.floor(level) - 1];
  if (lower === undefined || level < 1 || (level * 2) % 1 !== 0) {
    throw new RangeError(`No CP multiplier for level ${level}`);
  }
  if (Number.isInteger(level)) return lower;
  const upper = multipliers[Math.floor(level)];
  if (upper === undefined) throw new RangeError(`No CP multiplier for level ${level}`);
  return Math.sqrt((lower * lower + upper * upper) / 2);
}

/** Combat power of a Pokémon with these base stats and IVs at the given CP multiplier. */
export function combatPower(stats: PokemonEntry['stats'], ivs: Ivs, multiplier: number): number {
  const cp =
    ((stats.attack + ivs.attack) *
      Math.sqrt(stats.defense + ivs.defense) *
      Math.sqrt(stats.stamina + ivs.stamina) *
      multiplier *
      multiplier) /
    10;
  return Math.max(10, Math.floor(cp));
}

export interface RaidCatchCp {
  min: number;
  max: number;
  minBoosted: number;
  maxBoosted: number;
}

/** The CP range of a Pokémon caught from a raid, without and with a weather boost. */
export function raidCatchCp(
  stats: PokemonEntry['stats'],
  multipliers: readonly number[],
): RaidCatchCp {
  const normal = cpMultiplierAt(multipliers, RAID_CATCH_LEVEL);
  const boosted = cpMultiplierAt(multipliers, RAID_BOOSTED_LEVEL);
  return {
    min: combatPower(stats, RAID_FLOOR, normal),
    max: combatPower(stats, PERFECT, normal),
    minBoosted: combatPower(stats, RAID_FLOOR, boosted),
    maxBoosted: combatPower(stats, PERFECT, boosted),
  };
}

/** The CP shown on a raid boss, which depends on the stamina the raid level gives it. */
export function raidBossCp(stats: PokemonEntry['stats'], bossStamina: number): number {
  return Math.floor(
    ((stats.attack + 15) * Math.sqrt(stats.defense + 15) * Math.sqrt(bossStamina)) / 10,
  );
}
```

`src/domain/pogo/catalogue.ts`:

```ts
import { cpMultiplierAt, raidCatchCp, type RaidCatchCp } from './cp.js';
import type { GameData, Move, PokemonEntry } from './game-master.js';
import {
  POKEMON_TYPES,
  WEATHER_CONDITIONS,
  type PokemonType,
  type TempEvolution,
  type Weather,
} from './types.js';

export interface Weakness {
  type: PokemonType;
  multiplier: number;
}

/** Read-only lookups over the parsed game data. */
export class PokemonCatalogue {
  private readonly keys = new Map<string, PokemonEntry>();
  private readonly dexes = new Map<number, PokemonEntry[]>();
  private readonly moves = new Map<string, Move>();

  constructor(private readonly data: GameData) {
    for (const entry of data.pokemon) {
      this.keys.set(entry.key, entry);
      this.dexes.set(entry.dex, [...(this.dexes.get(entry.dex) ?? []), entry]);
    }
    for (const move of data.moves) this.moves.set(move.id, move);
  }

  get all(): readonly PokemonEntry[] {
    return this.data.pokemon;
  }

  /** By catalogue key, e.g. `rattata_alola`. Case-insensitive. */
  byKey(key: string): PokemonEntry | undefined {
    return this.keys.get(key.toLowerCase());
  }

  /** Every entry of a species: the species itself, its forms and its megas. */
  byDex(dex: number): readonly PokemonEntry[] {
    return this.dexes.get(dex) ?? [];
  }

  /** The species entry for a Pokédex number. */
  species(dex: number): PokemonEntry | undefined {
    return this.byDex(dex).find((entry) => entry.kind === 'species');
  }

  /** By game-master ids: the species, one of its forms, or one of its temporary evolutions. */
  byGameMasterId(
    pokemonId: string,
    form: string | null = null,
    tempEvolution: TempEvolution | null = null,
  ): PokemonEntry | undefined {
    const id = tempEvolution ? `${pokemonId}_${tempEvolution}` : (form ?? pokemonId);
    const entry = this.byKey(id);
    return entry?.pokemonId === pokemonId ? entry : undefined;
  }

  move(id: string): Move | undefined {
    return this.moves.get(id);
  }

  /** Damage multiplier of an attacking type against a Pokémon with these types. */
  effectiveness(attacker: PokemonType, defenders: readonly PokemonType[]): number {
    return defenders.reduce(
      (multiplier, defender) => multiplier * this.data.typeChart[attacker][defender],
      1,
    );
  }

  /** Attacking types that do extra damage, strongest first; ties keep the usual type order. */
  weaknesses(entry: PokemonEntry): Weakness[] {
    return POKEMON_TYPES.map((type) => ({
      type,
      multiplier: this.effectiveness(type, entry.types),
    }))
      .filter((weakness) => weakness.multiplier > 1)
      .sort((a, b) => b.multiplier - a.multiplier);
  }

  /** Weather that boosts at least one of the Pokémon's types. */
  boostedIn(entry: PokemonEntry): Weather[] {
    return WEATHER_CONDITIONS.filter((weather) =>
      this.data.weatherBoosts[weather].some((type) => entry.types.includes(type)),
    );
  }

  /** CP multiplier for a level, including half levels. */
  cpMultiplier(level: number): number {
    return cpMultiplierAt(this.data.cpMultipliers, level);
  }

  raidCatchCp(entry: PokemonEntry): RaidCatchCp {
    return raidCatchCp(entry.stats, this.data.cpMultipliers);
  }
}
```

In `test/support/game-data.ts`, add this import after the `node:path` import:

```ts
import { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
```

and add at the end of the file:

```ts

export function catalogueFixture(): PokemonCatalogue {
  return new PokemonCatalogue(gameDataFixture());
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/domain/pogo/cp.test.ts src/domain/pogo/catalogue.test.ts`
Expected: PASS, 20 tests in 2 files.

- [ ] **Step 5: Check and commit**

Run: `npx prettier --write src/domain/pogo test/support/game-data.ts && npm run check`

```bash
git add src/domain/pogo test/support/game-data.ts
git commit -m "Add the Pokémon catalogue and CP maths" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Legacy names, nicknames and the Pokemon table

Three things tie the new catalogue to what the legacy bot left behind:
- **Names.** The legacy data and the `Pokemon.name` column use names that are almost always the catalogue key. Fifteen are not (`nidoran♀`, `mr. mime`, `deoxys_normal`, …).
- **Curated nicknames.** About 150 Pokémon have search nicknames in `data/pokemon.json` (`ttar`, `alo`, `mega`). They move once into a TypeScript module.
- **Moderator nicknames.** `Pokemon.nickname` holds nicknames moderators added, as text joined with `", "`. The new bot reads and writes that column and nothing else in the table (`tier`, `exclusive`, `mega`, `elite` and `shiny` are stale; spec 6.7).

The parity test is the spec's "parity test against the legacy pokemon.json": every Pokémon the legacy bot knew must be in the catalogue, with the same Pokebattler name, except for a short list written into the test.

**Files:**
- Create: `src/domain/pogo/legacy-names.ts`, `src/domain/pogo/legacy-names.test.ts`, `scripts/game-data/make-nicknames.ts`, `src/domain/pogo/nicknames.ts` (generated once), `src/domain/pogo/nicknames.test.ts`, `src/db/repositories/pokemon-repository.ts`, `src/db/repositories/pokemon-repository.db.test.ts`

**Interfaces:**
- Consumes: `PokemonCatalogue`, `catalogueFixture()`, `POKEBATTLER_EXCEPTIONS`, `inTransaction(db, fn)` from `src/db/transaction.ts`, `startMigratedDatabase()` from `test/support/migrated-db.ts`.
- Produces: `LEGACY_NAME_ALIASES`; `keyForLegacyName(name: string): string`; `legacyNameForKey(key: string): string`; `CURATED_NICKNAMES: Readonly<Record<string, readonly string[]>>`; `class PokemonRepository` with `nicknames(): Promise<Map<string, string[]>>`, `addNickname(key: string, nickname: string): Promise<string[]>`, `removeNickname(key: string, nickname: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing tests for names and parity**

`src/domain/pogo/legacy-names.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { LEGACY_NAME_ALIASES, keyForLegacyName, legacyNameForKey } from './legacy-names.js';
import { POKEBATTLER_EXCEPTIONS } from './pokebattler.js';

interface LegacyPokemon {
  name?: string;
  pbName?: string;
  number?: number;
}

const legacy = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../../data/pokemon.json'), 'utf8'),
) as LegacyPokemon[];
const catalogue = catalogueFixture();

/** In the legacy data but not in the game master, so the new bot cannot know them. */
const NOT_IN_GAME_MASTER = ['basculegion', 'sliggoo_hisuian', 'goodra_hisuian'];
/**
 * Where the legacy Pokebattler name was wrong and the derived name is used instead: Torracat and
 * Incineroar were both listed as LITTEN, and the White-Striped Basculin entry was typed by hand
 * under a form id the game master never had.
 */
const LEGACY_POKEBATTLER_ERRORS: Record<string, string> = {
  torracat: 'TORRACAT',
  incineroar: 'INCINEROAR',
  basculin_white_striped: 'BASCULIN_WHITE_STRIPED_FORM',
};

describe('legacy names', () => {
  it('maps hand-typed legacy names to catalogue keys', () => {
    expect(keyForLegacyName('nidoran♀')).toBe('nidoran_female');
    expect(keyForLegacyName('mr. mime')).toBe('mr_mime');
    expect(keyForLegacyName('OINKOLOGNE_FEMALE')).toBe('oinkologne_female');
    expect(keyForLegacyName('deoxys_normal')).toBe('deoxys');
    expect(keyForLegacyName(' Venusaur ')).toBe('venusaur');
  });

  it('maps back to the name the legacy bot uses', () => {
    expect(legacyNameForKey('nidoran_female')).toBe('nidoran♀');
    expect(legacyNameForKey('mr_mime')).toBe('mr. mime');
    expect(legacyNameForKey('deoxys')).toBe('deoxys');
    expect(legacyNameForKey('venusaur')).toBe('venusaur');
  });

  it('points every alias at a real catalogue entry', () => {
    for (const [legacyName, key] of Object.entries(LEGACY_NAME_ALIASES)) {
      expect(catalogue.byKey(key), legacyName).toBeDefined();
    }
  });
});

describe('parity with the legacy data/pokemon.json', () => {
  const real = legacy.filter(
    (entry): entry is LegacyPokemon & { name: string } =>
      typeof entry.name === 'string' &&
      entry.number === undefined &&
      !['mega', 'elite'].includes(entry.name),
  );

  it('knows every Pokémon the legacy bot knew', () => {
    const unknown = real
      .map((entry) => entry.name)
      .filter((name) => catalogue.byKey(keyForLegacyName(name)) === undefined);
    expect(unknown.sort()).toEqual([...NOT_IN_GAME_MASTER].sort());
  });

  it('derives the same Pokebattler name, apart from three legacy errors', () => {
    const different: Record<string, string> = {};
    for (const entry of real) {
      const pokemon = catalogue.byKey(keyForLegacyName(entry.name));
      if (!pokemon || entry.pbName === undefined) continue;
      // The legacy data lists Enamorus twice, once under each of its two names.
      if (pokemon.pokebattlerId !== entry.pbName && entry.pbName !== pokemon.pokemonId) {
        different[pokemon.key] = pokemon.pokebattlerId;
      }
    }
    expect(different).toEqual(LEGACY_POKEBATTLER_ERRORS);
  });

  it('needs every Pokebattler exception it lists', () => {
    for (const key of Object.keys(POKEBATTLER_EXCEPTIONS)) {
      expect(catalogue.byKey(key), key).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/domain/pogo/legacy-names.test.ts`
Expected: FAIL, cannot resolve `./legacy-names.js`.

- [ ] **Step 3: Implement the name mapping**

`src/domain/pogo/legacy-names.ts`:

```ts
/**
 * Names in the legacy bot's data (data/pokemon.json and the `Pokemon.name` column) that are not
 * the catalogue key. Most were typed by hand and never matched the game master, so those
 * Pokémon had no stats in the legacy bot.
 */
export const LEGACY_NAME_ALIASES: Readonly<Record<string, string>> = {
  'nidoran♀': 'nidoran_female',
  'nidoran♂': 'nidoran_male',
  'mr. mime': 'mr_mime',
  'mr. mime_galarian': 'mr_mime_galarian',
  'mime jr.': 'mime_jr',
  'mr. rime': 'mr_rime',
  castform_rainy_form: 'castform_rainy',
  castform_snowy_form: 'castform_snowy',
  castform_sunny_form: 'castform_sunny',
  basculin_white_stripe: 'basculin_white_striped',
  // The legacy data listed the normal form of these species separately.
  deoxys_normal: 'deoxys',
  obstagoon_normal: 'obstagoon',
  perrserker_normal: 'perrserker',
  runerigus_normal: 'runerigus',
  oinkologne_normal: 'oinkologne',
};

const LEGACY_NAMES_BY_KEY = new Map(
  Object.entries(LEGACY_NAME_ALIASES).map(([legacy, key]) => [key, legacy]),
);

/** The catalogue key for a name used by the legacy bot. */
export function keyForLegacyName(name: string): string {
  const lower = name.trim().toLowerCase();
  return LEGACY_NAME_ALIASES[lower] ?? lower;
}

/**
 * The name the legacy bot uses for a catalogue key, for rows both bots read. Species the
 * legacy data listed under two names keep the plain one (`deoxys`, not `deoxys_normal`).
 */
export function legacyNameForKey(key: string): string {
  const legacy = LEGACY_NAMES_BY_KEY.get(key);
  return legacy && !legacy.endsWith('_normal') ? legacy : key;
}
```

Run: `npx vitest run src/domain/pogo/legacy-names.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 4: Write the failing nickname test**

`src/domain/pogo/nicknames.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { CURATED_NICKNAMES } from './nicknames.js';

describe('curated nicknames', () => {
  const catalogue = catalogueFixture();

  it('carries over the nicknames of the legacy data', () => {
    expect(Object.keys(CURATED_NICKNAMES).length).toBeGreaterThanOrEqual(140);
    expect(CURATED_NICKNAMES['tyranitar']).toEqual(['ttar']);
    expect(CURATED_NICKNAMES['ho_oh']).toEqual(['ho-oh', 'hooh', 'hoho', 'santa']);
    expect(CURATED_NICKNAMES['nidoran_female']).toEqual(['female']);
    expect(CURATED_NICKNAMES['rattata_alola']).toEqual(['alo']);
    expect(CURATED_NICKNAMES['unown_a']).toEqual(['a']);
  });

  it('is keyed by catalogue keys only', () => {
    for (const key of Object.keys(CURATED_NICKNAMES)) {
      expect(catalogue.byKey(key), key).toBeDefined();
    }
  });

  it('holds clean, lower-case, non-empty names without duplicates', () => {
    for (const [key, names] of Object.entries(CURATED_NICKNAMES)) {
      expect(names.length, key).toBeGreaterThan(0);
      expect(new Set(names).size, key).toBe(names.length);
      for (const name of names) {
        expect(name, key).toBe(name.trim().toLowerCase());
        expect(name, key).not.toBe('');
      }
    }
  });
});
```

Run: `npx vitest run src/domain/pogo/nicknames.test.ts`
Expected: FAIL, cannot resolve `./nicknames.js`.

- [ ] **Step 5: Generate the nickname module**

`scripts/game-data/make-nicknames.ts`:

```ts
/**
 * One-off: copies the search nicknames out of the legacy data/pokemon.json into
 * src/domain/pogo/nicknames.ts, keyed by catalogue key. Run it once, format the result with
 * Prettier and maintain the module by hand from then on; data/pokemon.json is retired.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
import type { GameData } from '../../src/domain/pogo/game-master.js';
import { keyForLegacyName } from '../../src/domain/pogo/legacy-names.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const legacy = JSON.parse(readFileSync(path.join(repoRoot, 'data/pokemon.json'), 'utf8')) as Array<{
  name?: string;
  nickname?: string[];
}>;
const catalogue = new PokemonCatalogue(
  JSON.parse(readFileSync(path.join(repoRoot, 'test/fixtures/game-data.json'), 'utf8')) as GameData,
);

const nicknames: Record<string, string[]> = {};
const skipped: string[] = [];
for (const entry of legacy) {
  if (!entry.nickname?.length) continue;
  const pokemon = entry.name ? catalogue.byKey(keyForLegacyName(entry.name)) : undefined;
  if (!pokemon) {
    skipped.push(entry.name ?? '(unnamed)');
    continue;
  }
  const clean = entry.nickname.map((nickname) => nickname.trim().toLowerCase()).filter(Boolean);
  nicknames[pokemon.key] = [...new Set([...(nicknames[pokemon.key] ?? []), ...clean])];
}

const lines = Object.entries(nicknames)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, names]) => `  ${JSON.stringify(key)}: ${JSON.stringify(names)},`);
writeFileSync(
  path.join(repoRoot, 'src/domain/pogo/nicknames.ts'),
  `/**
 * Extra names people search Pokémon by, keyed by catalogue key. Copied once from the legacy
 * data/pokemon.json (scripts/game-data/make-nicknames.ts); maintained here by hand since.
 * Nicknames added by moderators live in the Pokemon table (PokemonRepository).
 */
export const CURATED_NICKNAMES: Readonly<Record<string, readonly string[]>> = {
${lines.join('\n')}
};
`,
);
process.stdout.write(
  `Wrote ${lines.length} entries. Skipped (not Pokémon): ${skipped.join(', ')}\n`,
);
```

Run: `npx tsx scripts/game-data/make-nicknames.ts && npx prettier --write src/domain/pogo/nicknames.ts`
Expected: `Wrote 149 entries. Skipped (not Pokémon): perfect, zero, (unnamed), (unnamed)`. The four skipped entries are notification targets and egg placeholders, not Pokémon.

Run: `npx vitest run src/domain/pogo/nicknames.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Write the failing repository test**

`src/db/repositories/pokemon-repository.db.test.ts`:

```ts
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { PokemonRepository } from './pokemon-repository.js';

describe('PokemonRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let pokemon: PokemonRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    pokemon = new PokemonRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Pokemon').execute();
  });

  it('has no nicknames in an empty table', async () => {
    expect(await pokemon.nicknames()).toEqual(new Map());
  });

  it('reads nicknames the legacy bot stored, keyed by catalogue key', async () => {
    await db
      .insertInto('Pokemon')
      .values([
        { name: 'tyranitar', nickname: 'ttar, Pupitar Dad' },
        { name: 'mr. mime', nickname: 'mime' },
        { name: 'venusaur', tier: 4 },
        { name: 'ex', nickname: '' },
      ])
      .execute();
    expect(await pokemon.nicknames()).toEqual(
      new Map([
        ['tyranitar', ['ttar', 'pupitar dad']],
        ['mr_mime', ['mime']],
      ]),
    );
  });

  it('adds a nickname, creating the row under the name the legacy bot uses', async () => {
    expect(await pokemon.addNickname('nidoran_female', ' Nido ')).toEqual(['nido']);
    const row = await db
      .selectFrom('Pokemon')
      .select(['name', 'nickname'])
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ name: 'nidoran♀', nickname: 'nido' });
    expect(await pokemon.nicknames()).toEqual(new Map([['nidoran_female', ['nido']]]));
  });

  it('appends to existing nicknames in the legacy format and ignores repeats', async () => {
    await db
      .insertInto('Pokemon')
      .values({ name: 'tyranitar', nickname: 'ttar', tier: 5 })
      .execute();
    expect(await pokemon.addNickname('tyranitar', 'godzilla')).toEqual(['ttar', 'godzilla']);
    expect(await pokemon.addNickname('tyranitar', 'TTAR')).toEqual(['ttar', 'godzilla']);
    const row = await db
      .selectFrom('Pokemon')
      .select(['nickname', 'tier'])
      .where('name', '=', 'tyranitar')
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ nickname: 'ttar, godzilla', tier: 5 });
  });

  it('refuses an empty nickname or one that would break the stored format', async () => {
    await expect(pokemon.addNickname('tyranitar', '   ')).rejects.toThrow(RangeError);
    await expect(pokemon.addNickname('tyranitar', 'a, b')).rejects.toThrow(RangeError);
    expect(await db.selectFrom('Pokemon').selectAll().execute()).toHaveLength(0);
  });

  it('removes a nickname and keeps the row', async () => {
    await pokemon.addNickname('tyranitar', 'ttar');
    await pokemon.addNickname('tyranitar', 'godzilla');
    expect(await pokemon.removeNickname('tyranitar', 'TTAR')).toBe(true);
    expect(await pokemon.removeNickname('tyranitar', 'ttar')).toBe(false);
    expect(await pokemon.removeNickname('venusaur', 'anything')).toBe(false);
    expect(await pokemon.nicknames()).toEqual(new Map([['tyranitar', ['godzilla']]]));
    expect(await pokemon.removeNickname('tyranitar', 'godzilla')).toBe(true);
    expect(await pokemon.nicknames()).toEqual(new Map());
    expect(await db.selectFrom('Pokemon').selectAll().execute()).toHaveLength(1);
  });

  it('merges rows that map to the same catalogue key', async () => {
    await db
      .insertInto('Pokemon')
      .values([
        { name: 'deoxys', nickname: 'dna' },
        { name: 'deoxys_normal', nickname: 'dna, alien' },
      ])
      .execute();
    expect(await pokemon.nicknames()).toEqual(new Map([['deoxys', ['dna', 'alien']]]));
  });
});
```

Run: `npx vitest run src/db/repositories/pokemon-repository.db.test.ts`
Expected: FAIL, cannot resolve `./pokemon-repository.js`.

- [ ] **Step 7: Implement the repository**

`src/db/repositories/pokemon-repository.ts`:

```ts
import type { Kysely } from 'kysely';
import { keyForLegacyName, legacyNameForKey } from '../../domain/pogo/legacy-names.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/** The legacy bot stores nicknames as one string joined with ", ". */
const SEPARATOR = ', ';

function parseNicknames(stored: string | null): string[] {
  if (!stored) return [];
  return stored
    .split(',')
    .map((nickname) => nickname.trim().toLowerCase())
    .filter((nickname) => nickname !== '');
}

function clean(nickname: string): string {
  const value = nickname.trim().toLowerCase();
  if (value === '') throw new RangeError('A nickname cannot be empty');
  if (value.includes(',')) throw new RangeError('A nickname cannot contain a comma');
  return value;
}

/**
 * The legacy Pokemon table. Only `nickname` is used: nicknames moderators added for searching.
 * The tier, exclusive, mega, elite and shiny columns are stale and are neither read nor written.
 */
export class PokemonRepository {
  constructor(private readonly db: Kysely<DB>) {}

  /** Moderator-added nicknames by catalogue key. */
  async nicknames(): Promise<Map<string, string[]>> {
    const rows = await this.db
      .selectFrom('Pokemon')
      .select(['name', 'nickname'])
      .where('name', 'is not', null)
      .orderBy('id')
      .execute();
    const byKey = new Map<string, string[]>();
    for (const row of rows) {
      const nicknames = parseNicknames(row.nickname);
      if (row.name === null || nicknames.length === 0) continue;
      const key = keyForLegacyName(row.name);
      byKey.set(key, [...new Set([...(byKey.get(key) ?? []), ...nicknames])]);
    }
    return byKey;
  }

  /**
   * Adds a nickname and returns the Pokémon's nicknames afterwards. A missing row is created
   * under the name the legacy bot uses, with the column defaults; as in the legacy bot, that
   * row makes the legacy bot treat the Pokémon as not being a raid boss until it is told
   * otherwise.
   */
  async addNickname(key: string, nickname: string): Promise<string[]> {
    const added = clean(nickname);
    const name = legacyNameForKey(key);
    return inTransaction(this.db, async (trx) => {
      const row = await trx
        .selectFrom('Pokemon')
        .select(['id', 'nickname'])
        .where('name', '=', name)
        .executeTakeFirst();
      if (!row) {
        await trx.insertInto('Pokemon').values({ name, nickname: added }).execute();
        return [added];
      }
      const nicknames = parseNicknames(row.nickname);
      if (nicknames.includes(added)) return nicknames;
      nicknames.push(added);
      await trx
        .updateTable('Pokemon')
        .set({ nickname: nicknames.join(SEPARATOR) })
        .where('id', '=', row.id)
        .execute();
      return nicknames;
    });
  }

  /** Returns false when the Pokémon did not have that nickname. */
  async removeNickname(key: string, nickname: string): Promise<boolean> {
    const removed = nickname.trim().toLowerCase();
    const name = legacyNameForKey(key);
    return inTransaction(this.db, async (trx) => {
      const row = await trx
        .selectFrom('Pokemon')
        .select(['id', 'nickname'])
        .where('name', '=', name)
        .executeTakeFirst();
      const nicknames = parseNicknames(row?.nickname ?? null);
      if (!row || !nicknames.includes(removed)) return false;
      await trx
        .updateTable('Pokemon')
        .set({ nickname: nicknames.filter((n) => n !== removed).join(SEPARATOR) })
        .where('id', '=', row.id)
        .execute();
      return true;
    });
  }
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run src/db/repositories/pokemon-repository.db.test.ts`
Expected: PASS, 7 tests.

If inserting `nidoran♀` or reading it back fails, the connection character set is not `utf8mb4`; check `src/db/kysely.ts` rather than changing the test.

- [ ] **Step 9: Check and commit**

Run: `npx prettier --write src/domain/pogo scripts/game-data src/db/repositories/pokemon-repository.ts src/db/repositories/pokemon-repository.db.test.ts && npm run check`

```bash
git add src/domain/pogo scripts/game-data/make-nicknames.ts src/db/repositories/pokemon-repository.ts src/db/repositories/pokemon-repository.db.test.ts
git commit -m "Map legacy Pokémon names, carry over nicknames, add PokemonRepository" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Raid tiers and the notification codec

The legacy bot used bare integers: tier 4 meant mega, tier 6 mega legendary, elite raids were stored as tier 5, and a notification row held a Pokédex number or a negated tier. This task names those things.

`PokemonNotification.pokemon` in the live database (9,600 rows) holds, per the legacy code (`app/notify.js:32`): a Pokédex number; `-1`, `-3`, `-5` (tiers; `-5` also covered elite raids), `-4` (mega), `-6` (mega legendary); `-6` ("perfect", always with type `spawn`) and `-8` ("zero", type `spawn`). The new values for elite, EX and shadow tiers are below `-8`, so the legacy bot ignores them.

**Files:**
- Create: `src/domain/pogo/raid-tier.ts`, `src/domain/pogo/raid-tier.test.ts`, `src/domain/pogo/notification-target.ts`, `src/domain/pogo/notification-target.test.ts`

**Interfaces:**
- Produces: `RAID_LEVELS`, `type RaidLevel = 'T1' | 'T3' | 'T5' | 'Mega' | 'MegaLegendary' | 'Elite' | 'EX'`, `interface RaidTier { level: RaidLevel; shadow: boolean }`, `SHADOW_RAID_LEVELS`, `isRaidLevel(value)`, `raidTier(level, shadow = false): RaidTier | undefined`, `raidTierLabel(tier)`, `bossStamina(tier)`, `raidDurationKind(tier): 'standard' | 'exclusive' | 'elite'` (the `RaidKind` of `src/domain/time/party-time.ts`), `sameRaidTier(a, b)`; `type NotificationTarget`, `type NotificationScope = 'raid' | 'spawn' | 'both'`, `interface StoredNotification { pokemon: number; type: NotificationScope }`, `encodeNotification(target, scope): StoredNotification`, `decodeNotification(stored): NotificationTarget | undefined`.

- [ ] **Step 1: Write the failing tests**

`src/domain/pogo/raid-tier.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  RAID_LEVELS,
  bossStamina,
  isRaidLevel,
  raidDurationKind,
  raidTier,
  raidTierLabel,
  sameRaidTier,
} from './raid-tier.js';

describe('raid tiers', () => {
  it('names every level', () => {
    expect(RAID_LEVELS).toEqual(['T1', 'T3', 'T5', 'Mega', 'MegaLegendary', 'Elite', 'EX']);
    expect(isRaidLevel('T5')).toBe(true);
    expect(isRaidLevel('T2')).toBe(false);
  });

  it('allows shadow only for T1, T3 and T5', () => {
    expect(raidTier('T5', true)).toEqual({ level: 'T5', shadow: true });
    expect(raidTier('T1')).toEqual({ level: 'T1', shadow: false });
    expect(raidTier('Mega', true)).toBeUndefined();
    expect(raidTier('EX', true)).toBeUndefined();
  });

  it('labels tiers for people', () => {
    expect(raidTierLabel({ level: 'T5', shadow: false })).toBe('T5');
    expect(raidTierLabel({ level: 'T3', shadow: true })).toBe('Shadow T3');
    expect(raidTierLabel({ level: 'MegaLegendary', shadow: false })).toBe('Mega Legendary');
  });

  it('knows the boss stamina of each level', () => {
    expect(RAID_LEVELS.map((level) => bossStamina({ level, shadow: false }))).toEqual([
      600, 3600, 15000, 9000, 22500, 20000, 15000,
    ]);
    expect(bossStamina({ level: 'T5', shadow: true })).toBe(15000);
  });

  it('knows which durations apply', () => {
    expect(raidDurationKind({ level: 'T5', shadow: true })).toBe('standard');
    expect(raidDurationKind({ level: 'Mega', shadow: false })).toBe('standard');
    expect(raidDurationKind({ level: 'Elite', shadow: false })).toBe('elite');
    expect(raidDurationKind({ level: 'EX', shadow: false })).toBe('exclusive');
  });

  it('compares tiers by level and shadow', () => {
    expect(sameRaidTier({ level: 'T5', shadow: false }, { level: 'T5', shadow: false })).toBe(true);
    expect(sameRaidTier({ level: 'T5', shadow: false }, { level: 'T5', shadow: true })).toBe(false);
  });
});
```

`src/domain/pogo/notification-target.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  decodeNotification,
  encodeNotification,
  type NotificationTarget,
} from './notification-target.js';
import { RAID_LEVELS, SHADOW_RAID_LEVELS, type RaidLevel } from './raid-tier.js';

const tier = (level: RaidLevel, shadow = false): NotificationTarget => ({
  kind: 'tier',
  tier: { level, shadow },
});

describe('notification codec: legacy rows', () => {
  it('reads a positive number as a Pokédex number, whatever the scope', () => {
    expect(decodeNotification({ pokemon: 150, type: 'both' })).toEqual({
      kind: 'pokemon',
      dex: 150,
    });
    expect(decodeNotification({ pokemon: 201, type: 'spawn' })).toEqual({
      kind: 'pokemon',
      dex: 201,
    });
  });

  it('reads the legacy tier numbers', () => {
    expect(decodeNotification({ pokemon: -1, type: 'raid' })).toEqual(tier('T1'));
    expect(decodeNotification({ pokemon: -3, type: 'both' })).toEqual(tier('T3'));
    expect(decodeNotification({ pokemon: -5, type: 'raid' })).toEqual(tier('T5'));
    expect(decodeNotification({ pokemon: -4, type: 'raid' })).toEqual(tier('Mega'));
  });

  it('tells the two meanings of -6 apart by the scope', () => {
    expect(decodeNotification({ pokemon: -6, type: 'spawn' })).toEqual({
      kind: 'iv',
      iv: 'perfect',
    });
    expect(decodeNotification({ pokemon: -6, type: 'raid' })).toEqual(tier('MegaLegendary'));
    expect(decodeNotification({ pokemon: -6, type: 'both' })).toEqual(tier('MegaLegendary'));
  });

  it('reads -8 as the zero-IV target', () => {
    expect(decodeNotification({ pokemon: -8, type: 'spawn' })).toEqual({ kind: 'iv', iv: 'zero' });
  });

  it('returns undefined for values it does not know', () => {
    expect(decodeNotification({ pokemon: 0, type: 'both' })).toBeUndefined();
    expect(decodeNotification({ pokemon: -2, type: 'raid' })).toBeUndefined();
    expect(decodeNotification({ pokemon: -7, type: 'raid' })).toBeUndefined();
    expect(decodeNotification({ pokemon: -8, type: 'raid' })).toBeUndefined();
    expect(decodeNotification({ pokemon: -5, type: 'spawn' })).toBeUndefined();
    expect(decodeNotification({ pokemon: 1.5, type: 'both' })).toBeUndefined();
  });
});

describe('notification codec: writing', () => {
  it('stores a species as its Pokédex number with the scope asked for', () => {
    expect(encodeNotification({ kind: 'pokemon', dex: 150 }, 'raid')).toEqual({
      pokemon: 150,
      type: 'raid',
    });
    expect(() => encodeNotification({ kind: 'pokemon', dex: 0 }, 'both')).toThrow(RangeError);
    expect(() => encodeNotification({ kind: 'pokemon', dex: -6 }, 'both')).toThrow(RangeError);
  });

  it('keeps the legacy numbers for the legacy tiers', () => {
    expect(encodeNotification(tier('T1'), 'raid').pokemon).toBe(-1);
    expect(encodeNotification(tier('T3'), 'raid').pokemon).toBe(-3);
    expect(encodeNotification(tier('T5'), 'raid').pokemon).toBe(-5);
    expect(encodeNotification(tier('Mega'), 'raid').pokemon).toBe(-4);
    expect(encodeNotification(tier('MegaLegendary'), 'raid').pokemon).toBe(-6);
  });

  it('always stores IV targets as spawn and never stores a tier as spawn', () => {
    expect(encodeNotification({ kind: 'iv', iv: 'perfect' }, 'both')).toEqual({
      pokemon: -6,
      type: 'spawn',
    });
    expect(encodeNotification({ kind: 'iv', iv: 'zero' }, 'raid')).toEqual({
      pokemon: -8,
      type: 'spawn',
    });
    expect(encodeNotification(tier('MegaLegendary'), 'spawn')).toEqual({
      pokemon: -6,
      type: 'raid',
    });
    expect(encodeNotification(tier('T5'), 'both')).toEqual({ pokemon: -5, type: 'both' });
  });

  it('gives the new tiers numbers outside the legacy range', () => {
    const fresh = [tier('Elite'), tier('EX'), tier('T1', true), tier('T3', true), tier('T5', true)];
    for (const target of fresh) {
      expect(encodeNotification(target, 'raid').pokemon).toBeLessThan(-8);
    }
  });

  it('refuses a shadow tier that does not exist', () => {
    expect(() => encodeNotification(tier('Mega', true), 'raid')).toThrow(RangeError);
  });

  it('round-trips every target with a distinct stored value', () => {
    const targets: NotificationTarget[] = [
      { kind: 'pokemon', dex: 1 },
      { kind: 'pokemon', dex: 1025 },
      { kind: 'iv', iv: 'perfect' },
      { kind: 'iv', iv: 'zero' },
      ...RAID_LEVELS.map((level) => tier(level)),
      ...SHADOW_RAID_LEVELS.map((level) => tier(level, true)),
    ];
    const seen = new Set<string>();
    for (const target of targets) {
      const stored = encodeNotification(target, 'both');
      expect(decodeNotification(stored)).toEqual(target);
      seen.add(`${stored.pokemon}/${stored.type}`);
    }
    expect(seen.size).toBe(targets.length);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/pogo/raid-tier.test.ts src/domain/pogo/notification-target.test.ts`
Expected: FAIL, cannot resolve `./raid-tier.js` and `./notification-target.js`.

- [ ] **Step 3: Implement**

`src/domain/pogo/raid-tier.ts`:

```ts
/** The kinds of raid. Shadow raids are a flag on top of T1, T3 and T5. */
export const RAID_LEVELS = ['T1', 'T3', 'T5', 'Mega', 'MegaLegendary', 'Elite', 'EX'] as const;
export type RaidLevel = (typeof RAID_LEVELS)[number];

export interface RaidTier {
  level: RaidLevel;
  shadow: boolean;
}

/** Levels that also exist as shadow raids. */
export const SHADOW_RAID_LEVELS: readonly RaidLevel[] = ['T1', 'T3', 'T5'];

const LABELS: Readonly<Record<RaidLevel, string>> = {
  T1: 'T1',
  T3: 'T3',
  T5: 'T5',
  Mega: 'Mega',
  MegaLegendary: 'Mega Legendary',
  Elite: 'Elite',
  EX: 'EX',
};

/** Stamina the game gives a boss of each level, which sets the CP shown on the boss. */
const BOSS_STAMINA: Readonly<Record<RaidLevel, number>> = {
  T1: 600,
  T3: 3600,
  T5: 15000,
  Mega: 9000,
  MegaLegendary: 22500,
  Elite: 20000,
  EX: 15000,
};

/** Which incubation and hatched durations apply (see `RaidKind` in domain/time). */
const DURATION_KIND: Readonly<Record<RaidLevel, 'standard' | 'exclusive' | 'elite'>> = {
  T1: 'standard',
  T3: 'standard',
  T5: 'standard',
  Mega: 'standard',
  MegaLegendary: 'standard',
  Elite: 'elite',
  EX: 'exclusive',
};

export function isRaidLevel(value: string): value is RaidLevel {
  return (RAID_LEVELS as readonly string[]).includes(value);
}

/** A tier, or undefined when the level has no shadow raids and `shadow` was asked for. */
export function raidTier(level: RaidLevel, shadow = false): RaidTier | undefined {
  if (shadow && !SHADOW_RAID_LEVELS.includes(level)) return undefined;
  return { level, shadow };
}

/** `T5`, `Shadow T5`, `Mega Legendary`. */
export function raidTierLabel(tier: RaidTier): string {
  return `${tier.shadow ? 'Shadow ' : ''}${LABELS[tier.level]}`;
}

export function bossStamina(tier: RaidTier): number {
  return BOSS_STAMINA[tier.level];
}

export function raidDurationKind(tier: RaidTier): 'standard' | 'exclusive' | 'elite' {
  return DURATION_KIND[tier.level];
}

export function sameRaidTier(a: RaidTier, b: RaidTier): boolean {
  return a.level === b.level && a.shadow === b.shadow;
}
```

`src/domain/pogo/notification-target.ts`:

```ts
import { raidTier, type RaidLevel, type RaidTier } from './raid-tier.js';

/** What a member asked to be notified about. */
export type NotificationTarget =
  /** Every form of a species, in raids or as a spawn. */
  | { kind: 'pokemon'; dex: number }
  /** Any raid of a tier, including eggs. */
  | { kind: 'tier'; tier: RaidTier }
  /** Reports of a wild Pokémon with perfect or zero IVs. */
  | { kind: 'iv'; iv: 'perfect' | 'zero' };

/** The `PokemonNotification.type` column. */
export type NotificationScope = 'raid' | 'spawn' | 'both';

export interface StoredNotification {
  /** The `PokemonNotification.pokemon` column. */
  pokemon: number;
  type: NotificationScope;
}

/**
 * Integers in `PokemonNotification.pokemon`.
 *
 * The legacy bot stores a Pokédex number for a species and a negative number otherwise: the
 * negated legacy tier (-1, -3, -5; -4 mega; -6 mega legendary), -6 for "perfect" and -8 for
 * "zero". -6 therefore means two things, told apart by the type column: the IV targets are
 * always stored as `spawn`, tiers never are.
 *
 * Elite, EX and shadow tiers had no legacy number (elite shared -5 with tier 5). They get the
 * values below, outside the legacy range, which the legacy bot never matches and so ignores.
 */
const TIER_CODES: ReadonlyArray<readonly [number, RaidLevel, boolean]> = [
  [-1, 'T1', false],
  [-3, 'T3', false],
  [-5, 'T5', false],
  [-4, 'Mega', false],
  [-6, 'MegaLegendary', false],
  [-20, 'Elite', false],
  [-21, 'EX', false],
  [-31, 'T1', true],
  [-33, 'T3', true],
  [-35, 'T5', true],
];
const PERFECT_CODE = -6;
const ZERO_CODE = -8;

/**
 * The row values for a target. The scope is corrected where the encoding depends on it: IV
 * targets are always `spawn`, and a tier is never `spawn`.
 */
export function encodeNotification(
  target: NotificationTarget,
  scope: NotificationScope,
): StoredNotification {
  if (target.kind === 'pokemon') {
    if (!Number.isInteger(target.dex) || target.dex < 1) {
      throw new RangeError(`Not a Pokédex number: ${target.dex}`);
    }
    return { pokemon: target.dex, type: scope };
  }
  if (target.kind === 'iv') {
    return { pokemon: target.iv === 'perfect' ? PERFECT_CODE : ZERO_CODE, type: 'spawn' };
  }
  const code = TIER_CODES.find(
    ([, level, shadow]) => level === target.tier.level && shadow === target.tier.shadow,
  );
  if (!code) {
    throw new RangeError(
      `No notification code for ${target.tier.shadow ? 'shadow ' : ''}${target.tier.level}`,
    );
  }
  return { pokemon: code[0], type: scope === 'spawn' ? 'raid' : scope };
}

/** The target a stored row means; undefined for a value this bot does not know. */
export function decodeNotification(stored: StoredNotification): NotificationTarget | undefined {
  const { pokemon, type } = stored;
  if (!Number.isInteger(pokemon) || pokemon === 0) return undefined;
  if (pokemon > 0) return { kind: 'pokemon', dex: pokemon };
  if (type === 'spawn') {
    if (pokemon === PERFECT_CODE) return { kind: 'iv', iv: 'perfect' };
    if (pokemon === ZERO_CODE) return { kind: 'iv', iv: 'zero' };
    return undefined;
  }
  const code = TIER_CODES.find(([value]) => value === pokemon);
  const tier = code ? raidTier(code[1], code[2]) : undefined;
  return tier ? { kind: 'tier', tier } : undefined;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/domain/pogo/raid-tier.test.ts src/domain/pogo/notification-target.test.ts`
Expected: PASS, 17 tests in 2 files.

- [ ] **Step 5: Check and commit**

Run: `npx prettier --write src/domain/pogo && npm run check`

```bash
git add src/domain/pogo
git commit -m "Add raid tiers and the notification-target codec" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: GameDataService and wiring

**Files:**
- Create: `src/services/game-data-service.ts`, `src/services/game-data-service.test.ts`
- Modify: `src/config/settings.ts`, `data/settings.json`, `test/fixtures/settings.json`, `src/app-context.ts`, `test/support/test-context.ts`, `src/app.ts`, `CLAUDE.md`, `docs/superpowers/plans/phase-0-follow-ups.md`

**Interfaces:**
- Consumes: `parseGameMaster`, `parseTextFile`, `PokemonCatalogue`, `Logger` from `src/log.ts`, `createTestLogger()`, `readGameMasterSample()`, `readEnglishSample()`, `catalogueFixture()`.
- Produces: `type FetchText = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>`; `interface GameDataOptions { gameMasterUrl; textUrl; cachePath; maxAgeMs; fetch: FetchText; log: Logger; now?: () => number }`; `interface GameDataProvider { readonly catalogue: PokemonCatalogue }`; `class GameDataService implements GameDataProvider` with `catalogue` (throws before load), `fetchedAt: number`, `load(): Promise<void>`, `refresh(): Promise<boolean>`; `settings.gameData: { gameMasterUrl: string; textUrl: string; refreshHours: number }`; `AppContext.gameData: GameDataProvider`.

- [ ] **Step 1: Write the failing test**

`src/services/game-data-service.test.ts`:

```ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readEnglishSample, readGameMasterSample } from '../../test/support/game-data.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { GameDataService, type FetchText } from './game-data-service.js';

const GAME_MASTER_URL = 'https://example.test/latest.json';
const TEXT_URL = 'https://example.test/English.txt';
const HOUR = 3_600_000;

const gameMaster = JSON.stringify(readGameMasterSample());
const english = readEnglishSample();

function ok(body: string) {
  return { ok: true, status: 200, text: () => Promise.resolve(body) };
}

describe('GameDataService', () => {
  let dir: string;
  let cachePath: string;
  let now: number;
  let requests: string[];
  let respond: FetchText;

  function service() {
    const { log, entries } = createTestLogger();
    const fetch: FetchText = (url) => {
      requests.push(url);
      return respond(url);
    };
    const gameData = new GameDataService({
      gameMasterUrl: GAME_MASTER_URL,
      textUrl: TEXT_URL,
      cachePath,
      maxAgeMs: 24 * HOUR,
      fetch,
      log,
      now: () => now,
    });
    return { gameData, entries };
  }

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pine-game-data-'));
    cachePath = path.join(dir, 'nested', 'gamemaster.json');
    now = Date.UTC(2026, 9, 10, 12);
    requests = [];
    respond = (url) => Promise.resolve(ok(url === GAME_MASTER_URL ? gameMaster : english));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('has no catalogue before it is loaded', () => {
    expect(() => service().gameData.catalogue).toThrow(/not been loaded/);
  });

  it('downloads, parses and saves the data on first start', async () => {
    const { gameData } = service();
    await gameData.load();
    expect(gameData.catalogue.byKey('venusaur')?.name).toBe('Venusaur');
    expect(gameData.fetchedAt).toBe(now);
    expect(requests.sort()).toEqual([TEXT_URL, GAME_MASTER_URL].sort());
    const saved = JSON.parse(await readFile(cachePath, 'utf8')) as { fetchedAt: number };
    expect(saved.fetchedAt).toBe(now);
  });

  it('starts from a fresh saved copy without downloading', async () => {
    await service().gameData.load();
    requests = [];
    now += 23 * HOUR;
    const { gameData } = service();
    await gameData.load();
    expect(requests).toEqual([]);
    expect(gameData.catalogue.byKey('mewtwo_a')?.name).toBe('Armored Mewtwo');
  });

  it('downloads again once the saved copy is too old', async () => {
    await service().gameData.load();
    requests = [];
    now += 25 * HOUR;
    const { gameData } = service();
    await gameData.load();
    expect(requests).toHaveLength(2);
    expect(gameData.fetchedAt).toBe(now);
  });

  it('starts from an out-of-date copy when the download fails, and says so', async () => {
    await service().gameData.load();
    const firstFetch = now;
    now += 48 * HOUR;
    respond = () => Promise.reject(new Error('getaddrinfo ENOTFOUND'));
    const { gameData, entries } = service();
    await gameData.load();
    expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
    expect(gameData.fetchedAt).toBe(firstFetch);
    expect(entries.some((e) => e.level === 50 && e.msg === 'could not refresh the game data')).toBe(
      true,
    );
    expect(entries.some((e) => e.level === 40 && String(e.msg).includes('out of date'))).toBe(true);
  });

  it('fails to start only when there is no download and no saved copy', async () => {
    respond = () => Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('') });
    await expect(service().gameData.load()).rejects.toThrow(/no copy/);
  });

  it('keeps the data in use when a refresh returns rubbish', async () => {
    const { gameData } = service();
    await gameData.load();
    const before = gameData.catalogue;
    const savedBefore = await readFile(cachePath, 'utf8');
    for (const body of ['<html>rate limited</html>', '[]', '{"message":"Not Found"}']) {
      respond = (url) => Promise.resolve(ok(url === GAME_MASTER_URL ? body : english));
      expect(await gameData.refresh()).toBe(false);
    }
    expect(gameData.catalogue).toBe(before);
    expect(await readFile(cachePath, 'utf8')).toBe(savedBefore);
  });

  it('switches to newer data on refresh', async () => {
    const { gameData } = service();
    await gameData.load();
    const before = gameData.catalogue;
    now += HOUR;
    expect(await gameData.refresh()).toBe(true);
    expect(gameData.catalogue).not.toBe(before);
    expect(gameData.fetchedAt).toBe(now);
  });

  it('ignores a saved copy it cannot read or that has another version', async () => {
    await service().gameData.load();
    for (const content of ['not json', JSON.stringify({ version: 0, fetchedAt: now, data: {} })]) {
      await writeFile(cachePath, content);
      requests = [];
      const { gameData } = service();
      await gameData.load();
      expect(requests).toHaveLength(2);
      expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
    }
  });

  it('still works when the copy cannot be saved', async () => {
    cachePath = path.join(dir, 'file.txt', 'gamemaster.json');
    await writeFile(path.join(dir, 'file.txt'), 'a file where a directory is needed');
    const { gameData, entries } = service();
    await gameData.load();
    expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
    expect(entries.some((e) => e.msg === 'could not save the game data')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/services/game-data-service.test.ts`
Expected: FAIL, cannot resolve `./game-data-service.js`.

- [ ] **Step 3: Implement the service**

`src/services/game-data-service.ts`:

```ts
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import { parseGameMaster, type GameData } from '../domain/pogo/game-master.js';
import { parseTextFile } from '../domain/pogo/text.js';
import type { Logger } from '../log.js';

/** Bump when the shape of `GameData` changes, so older cache files are ignored. */
const CACHE_VERSION = 1;

interface CacheFile {
  version: number;
  fetchedAt: number;
  data: GameData;
}

/** The part of `fetch` this service needs. */
export type FetchText = (
  url: string,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface GameDataOptions {
  gameMasterUrl: string;
  textUrl: string;
  /** Where the parsed data is kept between runs, e.g. `var/gamemaster.json`. */
  cachePath: string;
  /** A cache older than this is refreshed when the bot starts. */
  maxAgeMs: number;
  fetch: FetchText;
  log: Logger;
  now?: () => number;
}

/** What handlers need: the current catalogue. */
export interface GameDataProvider {
  readonly catalogue: PokemonCatalogue;
}

/**
 * Downloads the game master and English text file, parses them and keeps the result on disk,
 * so the bot still starts when the download fails. Nothing happens until `load` is called.
 */
export class GameDataService implements GameDataProvider {
  private current: PokemonCatalogue | undefined;
  private loadedAt = 0;
  private readonly now: () => number;

  constructor(private readonly options: GameDataOptions) {
    this.now = options.now ?? Date.now;
  }

  /** The catalogue in use. Throws before the first successful `load`. */
  get catalogue(): PokemonCatalogue {
    if (!this.current) throw new Error('Game data has not been loaded yet');
    return this.current;
  }

  /** When the data in use was downloaded (epoch ms); 0 before `load`. */
  get fetchedAt(): number {
    return this.loadedAt;
  }

  /**
   * Makes a catalogue available: from the cache when it is fresh, otherwise from a new
   * download, falling back to a stale cache. Throws only when there is neither.
   */
  async load(): Promise<void> {
    const cached = await this.readCache();
    if (cached && this.now() - cached.fetchedAt < this.options.maxAgeMs) {
      this.use(cached);
      return;
    }
    if (await this.refresh()) return;
    if (!cached) {
      throw new Error(
        `Could not download the game data and there is no copy at ${this.options.cachePath}`,
      );
    }
    this.options.log.warn(
      { fetchedAt: new Date(cached.fetchedAt).toISOString() },
      'using the saved game data, which is out of date',
    );
    this.use(cached);
  }

  /**
   * Downloads and parses the latest data and, if it is valid, switches to it and saves it.
   * Returns false, keeping whatever was in use, when the download or the data is bad.
   */
  async refresh(): Promise<boolean> {
    let cache: CacheFile;
    try {
      const [gameMaster, text] = await Promise.all([
        this.download(this.options.gameMasterUrl),
        this.download(this.options.textUrl),
      ]);
      const data = parseGameMaster(JSON.parse(gameMaster) as unknown, parseTextFile(text));
      cache = { version: CACHE_VERSION, fetchedAt: this.now(), data };
    } catch (err) {
      this.options.log.error({ err }, 'could not refresh the game data');
      return false;
    }
    this.use(cache);
    this.options.log.info(
      { pokemon: cache.data.pokemon.length, moves: cache.data.moves.length },
      'game data refreshed',
    );
    await this.writeCache(cache);
    return true;
  }

  private use(cache: CacheFile): void {
    this.current = new PokemonCatalogue(cache.data);
    this.loadedAt = cache.fetchedAt;
  }

  private async download(url: string): Promise<string> {
    const response = await this.options.fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return response.text();
  }

  private async readCache(): Promise<CacheFile | undefined> {
    try {
      const cache = JSON.parse(
        await readFile(this.options.cachePath, 'utf8'),
      ) as Partial<CacheFile>;
      if (
        cache.version !== CACHE_VERSION ||
        typeof cache.fetchedAt !== 'number' ||
        !Array.isArray(cache.data?.pokemon) ||
        cache.data.pokemon.length === 0
      ) {
        return undefined;
      }
      return cache as CacheFile;
    } catch {
      return undefined;
    }
  }

  /** A failed save is logged, not thrown: the data in memory is still good. */
  private async writeCache(cache: CacheFile): Promise<void> {
    const temporary = `${this.options.cachePath}.tmp`;
    try {
      await mkdir(path.dirname(this.options.cachePath), { recursive: true });
      await writeFile(temporary, JSON.stringify(cache));
      await rename(temporary, this.options.cachePath);
    } catch (err) {
      this.options.log.warn({ err, path: this.options.cachePath }, 'could not save the game data');
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/services/game-data-service.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Add the settings**

In `src/config/settings.ts`, add this property to `settingsSchema`, directly after the `autoAssignRole: z.boolean(),` line:

```ts
  gameData: z.strictObject({
    gameMasterUrl: z.url(),
    textUrl: z.url(),
    refreshHours: z.number().int().positive(),
  }),
```

In both `data/settings.json` and `test/fixtures/settings.json`, add a comma after the `"autoAssignRole": false` line and this block after it, before the closing brace:

```json
  "gameData": {
    "gameMasterUrl": "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json",
    "textUrl": "https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/English.txt",
    "refreshHours": 24
  }
```

(`data/settings.json` is configuration for the new bot as well as the legacy one; adding a key does not affect the legacy bot, which ignores keys it does not know.)

Run: `npx vitest run src/config`
Expected: PASS. If a settings test enumerates keys or builds a settings object by hand, add the `gameData` block there too.

- [ ] **Step 6: Put the catalogue in the app context**

In `src/app-context.ts`, add the import (keep imports sorted as they are):

```ts
import type { GameDataProvider } from './services/game-data-service.js';
```

and add to `AppContext`, after the `commands` line:

```ts
  /** Pokémon, moves and type data from the game master. */
  readonly gameData: GameDataProvider;
```

In `test/support/test-context.ts`, add the import:

```ts
import { catalogueFixture } from './game-data.js';
```

and add to the `ctx` object, after `commands: [],`:

```ts
    gameData: { catalogue: catalogueFixture() },
```

- [ ] **Step 7: Load the game data when the bot starts**

In `src/app.ts`:

1. Add the import (with the other `./services`/local imports, keeping them sorted):

```ts
import { GameDataService } from './services/game-data-service.js';
```

2. Add this constant above `export interface StartOptions`:

```ts
/** Parsed game data is kept here between runs, so the bot can start while offline. */
const GAME_DATA_CACHE = 'var/gamemaster.json';
const HOUR_MS = 3_600_000;
```

3. Replace the block

```ts
  try {
    await runMigrations(db, log);
  } catch (err) {
    await db.destroy();
    throw err;
  }
```

with

```ts
  const refreshMs = config.settings.gameData.refreshHours * HOUR_MS;
  const gameData = new GameDataService({
    gameMasterUrl: config.settings.gameData.gameMasterUrl,
    textUrl: config.settings.gameData.textUrl,
    cachePath: GAME_DATA_CACHE,
    maxAgeMs: refreshMs,
    fetch: (url) => fetch(url),
    log,
  });
  try {
    await runMigrations(db, log);
    await gameData.load();
  } catch (err) {
    await db.destroy();
    throw err;
  }
  // refresh() never rejects; the timer must not keep the process alive on its own.
  const gameDataTimer = setInterval(() => void gameData.refresh(), refreshMs);
  gameDataTimer.unref();
```

4. Change the context line to include the service:

```ts
  const ctx: AppContext = { config, log, db, commands, gameData, features: requested };
```

5. In the `createShutdown([...])` list, add this as the first step, before the `discord` step:

```ts
      {
        name: 'game data refresh',
        timeoutMs: 1_000,
        run: () => {
          clearInterval(gameDataTimer);
          return Promise.resolve();
        },
      },
```

Run: `npm run typecheck`
Expected: no errors. If another file builds an `AppContext` by hand, give it `gameData` the same way `test-context.ts` does.

- [ ] **Step 8: Update the project documents**

In `CLAUDE.md`, add these lines to the end of the `## Conventions` list:

```markdown
- Everything about Pokémon comes from the game master through `ctx.gameData.catalogue` (`src/domain/pogo/`). The new bot never reads `data/pokemon.json`, `types.json` or `weather.json`; they stay only for the legacy bot and the parity test.
- A Pokémon is identified by its catalogue key (`rattata_alola`, `charizard_mega_x`). Legacy names are translated with `keyForLegacyName` / `legacyNameForKey`.
- Raid tiers are `RaidTier` values (`src/domain/pogo/raid-tier.ts`), never bare numbers. `PokemonNotification.pokemon` is read and written only through the codec in `notification-target.ts`.
- Tests never use the network. Game data in tests comes from the fixtures built by `scripts/game-data/make-fixtures.ts` (`catalogueFixture()`, `gameDataFixture()`).
```

In the same file, add a row to the "Where things are" table, after the "New TypeScript bot" row:

```markdown
| Raw game master and text file for rebuilding fixtures (git-ignored) | `var/game-data-source/` |
```

and in the `**Status:**` paragraph replace `Phase 1 continues with 1B (game data and raid bosses) and 1C (search, image cache, static maps).` with `Phase 1B-1 (game data catalogue) is complete too. Phase 1 continues with 1B-2 (raid boss feed and tables) and 1C (search, image cache, static maps).`

In `docs/superpowers/plans/phase-0-follow-ups.md`, append:

```markdown

## From Phase 1B-1 (game data catalogue)

**Phase 1B-2 (raid bosses)**
- Map a feed boss to the catalogue with `byGameMasterId`: plain when `form` equals `id`; `<ID>_MEGA`, `_MEGA_X`, `_MEGA_Y`, `_PRIMAL` are temporary evolutions; otherwise a form; and fall back to the species when the form is unknown. The feed can name a costume in `form` that the game master does not have yet (`PIKACHU_GLASS_HELMET_2026` on 2026-10-10).
- Feed level keys seen: `mega`, `lvl5`, `lvl3`, `lvl1`, `shadow_lvl5`, `shadow_lvl3`, `shadow_lvl1`; `ultra_beast` is documented. Others (`ex`, `lvl4`, `lvl6`, primal, elite) are unverified: log unknown keys once and skip them.
- A sample of the feed is in `var/game-data-source/raidboss.json`.

**Phase 1C (search)**
- Search names for a Pokémon are its display name, its key, `CURATED_NICKNAMES` and `PokemonRepository.nicknames()`.
- The legacy search also matched the boss CP (`raidBossCp`) and bare tier digits; the notification targets had nicknames too (`hundo` for perfect; `none`, `useless` for zero; `ex`, `exclusive` for EX).
- Two pairs of Zygarde forms share a display name ("Zygarde (50% Forme)", "Zygarde (10% Forme)"); search results must still be told apart, for example by key.

**Phase 4 (notifications)**
- The legacy value `-5` covered both tier 5 and elite raids. The codec reads it as tier 5; members who want elite raids need the new elite target.
- The legacy bot matched a notification's Pokédex number against every form of the species; keep that.

**Phase 6 (utilities)**
- `pokebattlerId` reproduces the legacy names apart from three legacy errors, but neither was checked against Pokebattler itself. Verify a few forms against the live API when `/counters` is ported.
- `/rank` needs CP at half levels: `cpMultiplierAt` supports them.

**Phase 8 (cutover)**
- Delete `data/pokemon.json`, `data/types.json`, `data/weather.json`, the parity test that reads `pokemon.json`, and `scripts/game-data/make-nicknames.ts` together with the legacy tree.
- Basculegion and the Hisuian Sliggoo and Goodra were in the legacy data but are not in the game master; nothing to migrate, but mention it in the release notes.
```

- [ ] **Step 9: Check and commit**

Run: `npx prettier --write src/services src/config/settings.ts src/app-context.ts src/app.ts test/support/test-context.ts && npm run check && npm run build`
Expected: green.

```bash
git add src/services src/config/settings.ts src/app-context.ts src/app.ts test/support/test-context.ts data/settings.json test/fixtures/settings.json CLAUDE.md docs/superpowers/plans/phase-0-follow-ups.md
git commit -m "Load game data at start with an on-disk fallback" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Not in this plan

- The raid boss feed, the `RaidBoss` and `RaidBossOverride` tables, sync, overrides and auto-set (spec 6.7): Phase 1B-2.
- Searching Pokémon and moves by name: Phase 1C.
- Any command or reply that shows this data (`/boss`, `/counters`, `/rank`, `/want`): Phases 2, 4 and 6.
- `/admin boss sync` triggering `GameDataService.refresh()`: Phase 5.
- Pokémon icons (`POKEMON_IMAGE_BASE`): Phase 1C with the image cache.
