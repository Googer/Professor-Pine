# Phase 1C: Search, Image Cache and Static Maps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the bot find what a member means from what they type (a gym, a Pokémon, a move, a status word), and give it map pictures of gyms and regions as files, so that the commands of Phase 2 onwards only have to ask.

**Architecture:** Pure modules do the finding: `src/domain/search/` (text folding, a matcher for short lists, the gym index and the region-aware gym lookup), `src/domain/pogo/pokemon-search.ts` and `move-search.ts`, and `src/domain/geo/` (which gyms lie in which region, address text, static-map requests). Three small services connect them to the outside: `GymDirectory` (all gyms in memory, read from the database), `PokemonSearchService` (rebuilds itself when the game data is refreshed) and `StaticMaps` on top of `ImageCache` (downloads a picture once, keeps it on disk). Handlers see them as `ctx.gyms`, `ctx.pokemon` and `ctx.maps`.

**Tech Stack:** TypeScript 6.0, MiniSearch 7 (gyms and Pokémon), fastest-levenshtein (short lists), native `fetch`, Kysely on MySQL 8, Vitest (unit, and Testcontainers for the one `*.db.test.ts`).

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: the Phase 1 row of section 9 (search, image cache, static maps), section 4.3 (what `/raid` will ask of the gym search), 6.3 (Static Maps through `ImageCache`) and 6.8 (dependencies). This is the last of the four Phase 1 plans (1A, 1B-1, 1B-2 are done). Hand-offs from earlier phases: `docs/superpowers/plans/phase-0-follow-ups.md`, the three "Phase 1C" blocks.

**Every code block in this plan was run before the plan was written**, on a throwaway branch: 750 unit tests and 97 database tests pass, lint and typecheck are clean. If something does not pass as written, suspect a transcription slip before suspecting the design.

## Decisions made in this plan

1. **The searches are lenient, and are not copies of the legacy ones** (Matt, 2026-10-10: with autocomplete the member picks from what is close, so matching the old behaviour exactly is not a goal, and being more forgiving is better). The legacy bot tried the name first, then more fields, and only words spelt almost exactly. The new gym search is one query over all fields: every word must match somewhere, a word may be the beginning of a longer one or misspelt, and a match in the name or nickname counts most.
2. **How it was checked.** The new gym search was run next to the legacy lunr search on a scratch copy of the 3,213 production gyms with 18,087 searches made from the gyms' own names (aggregates only; no production row is in the repository). Searching by full name, the gym meant came first in 3,008 of the 3,090 cases where it came first in the legacy search, and was in the top five in all but seven of them. With one letter missing or two letters swapped, the new search found the gym in every one of the 2,661 cases where the legacy search found nothing. With the last word half typed (what autocomplete sees) the legacy search found the gym in 10% of cases, the new one in all. The new search never failed to return the gym meant. The field weights in `gym-index.ts` come from this run.
3. **Gyms that have every word come before guesses.** Only when no gym has all the words typed are gyms with some of them returned, marked `allWords: false`. Phase 2 decides what to do with a guess (offer a choice, never act on it silently).
4. **Scope of a gym search** (spec 4.3): from a region channel, the region's gyms first, then gyms just outside it; from any other channel, all gyms. "Just outside" is the legacy rule: inside the outline enlarged by half around its middle. A gym further away is not found from a region channel.
5. **Which gyms lie in which region is worked out in memory**, not with one SQL query per region. On the scratch copy the result is identical to MySQL's `ST_Contains` (2,803 gym-in-region pairs, 411 gyms in no region) and to the turf library the legacy bot used for the enlarged outlines (2,883 neighbour pairs). So no geometry dependency is added in this phase; a database test pins the agreement with MySQL.
6. **All gyms are held in memory** (about 3,200 gyms: index built in 0.7 s, 45 MB; a search takes 4 ms at the median and under 50 ms at worst). One gym is re-read after an edit (`refreshGym`); everything is re-read after regions change (`load`). The legacy bot's per-region indexes and reindex queue are not ported.
7. **Pokémon search.** The species comes before its forms and megas among equal fits, so `giratina` gives the Altered Forme (there is no plain Giratina entry since Phase 1B-2). The short words members use (`alo`, `galar`, `hisu`, `mega`) need no special handling: they are beginnings of words in the names. A nickname shared by many Pokémon (`mega`, `kanto`) is a search word; only a text that means exactly one entry jumps to the front. The 185 forms that differ from their species in looks only (Vivillon patterns, Unown letters) are left out unless the text names the form.
8. **Statuses, privacy words and moves use a small strict matcher**, not the index: the lists are short, and a wrong guess there acts ("done" must not be read as "none"). Anything but the exact word needs at least three letters; misspellings are corrected from five letters on.
9. **Tiers, boss CP and "shadow" are not Pokémon search terms.** The legacy search also matched a bare tier digit and the CP shown on a boss, because one text field had to carry everything. In the new bot the `boss` option of `/raid` lists bosses and eggs from the boss list (spec 4.3), which already knows tiers and shadow. Recorded for Phase 2.
10. **Pictures are named by what they show.** `ImageCache` keeps `var/images/<folder>/<id>.<hash>.png`, where the hash is of the request without the API key. A gym that moves or a region whose outline changes gets a new picture by itself and the old file is deleted, so the legacy bot's "delete the cached image after an edit" calls are not needed. The Google API key is never logged and never part of a file name.
11. **Two dependencies are added, two fewer than the spec lists for this area.** `minisearch` and `fastest-levenshtein` are added. `@mapbox/polyline` is replaced by a 20-line encoder checked against the example in Google's documentation, and `@turf/turf` is not needed yet (item 5); Phase 5 (KML import) and Phase 6 (`/find-region`) add it when they need real geometry.
12. **Not built here:** Pokémon icons. The public icon files are not named regularly enough to derive (a rule from the game-master ids finds 84% of them; 170 entries, among them Unown and Spinda, have no file under any derivable name). The raid boss feed carries an icon address for every current boss, which is where Phase 2 should take them from. Also not here: geocoding and Places (Phase 5), Nominatim and maps of arbitrary shapes for `/find-region` (Phase 6), OCR names (Phase 7).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit or delete legacy JS or the legacy `data/*.json` files.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` is pure: no imports from `discord.js`, `kysely`, `node:fs`, the network or `src/services/`. The domain modules of this plan do not import from `src/db/` either: they state what they need of a gym or region as small interfaces (`SearchableGym`, `LocatedGym`, `RegionOutline`) that the repository types satisfy.
- **Tests never use the network and never use production data.** Gyms and regions in tests are the invented ones of `test/support/gyms.ts`; game data is `catalogueFixture()` / `gameDataFixture()`.
- A Pokémon's identity is its **catalogue key**. Search results are `PokemonEntry` objects of the catalogue in use; keep `entry.key`, never the text typed.
- The Google API key (`GOOGLE_API_KEY`) appears only in the address of a download. It is never logged, never part of a file name, and never in anything sent to Discord.
- No database changes in this plan.
- Whole files in this plan are exact: create them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (re-run lint after formatting). Task 6 also runs its `*.db.test.ts` file (needs Docker).
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/` or `var/`.

## Review Focus

1. A member types a name the way people type: no accents, no apostrophe, a letter missing, two letters swapped, the last word unfinished, extra words such as "gym" or "the". The gym or Pokémon meant must still come first or near the top. Tests: Task 4, "finds a gym by one word, part of a word, or a misspelt word" and "ignores the configured words and common words in what is typed"; Task 2, "ignores case, accents, punctuation and custom-emoji wrapping" and "accepts the beginning of a word and small misspellings".
2. Two gyms share a name (two Starbucks), or the gym meant lies just across the region border. The search must prefer the gym of the member's own region, still find the neighbour, and never return a gym from the far side of the map. Tests: Task 4, "adds the gyms just across the border, after the region’s own", "does not find gyms further away" and "prefers a gym across the border that has every word to a guess at home".
3. A short or mistyped word must not act as another one: "done" as "none", "no" as "none", "mega" as one particular mega. Tests: Task 1, "does not guess from one or two letters" and "does not correct words of fewer than five letters"; Task 2, "treats a nickname shared by many as a word, not as one Pokémon".
4. Google is down, slow, answers with an error page, or answers with its "over quota" picture; or there is no API key at all. The message must still go out, without a map; nothing broken may be cached, and the key must not reach the log. Tests: Task 5, "answers undefined and saves nothing after …" (six cases), "gives up on a download that takes too long", "never logs the address, not even when the failure quotes it", "refuses the picture Google sends with a warning, and does not log the key", "has no maps without a key".
5. Data changes while the bot runs: a gym is renamed, moved to another region or deleted; a region is redrawn; the game data is refreshed; a nickname is added. Searches must follow without a restart, and a failed re-read must leave the old state in use. Tests: Task 6, "re-reads one gym that changed", "takes up new regions on the next load", "keeps serving the old state when a later load fails", "follows the game data when it is refreshed", "follows a gym that is edited, moved and deleted" (against MySQL).

---

## File Structure

```
src/domain/search/
  text.ts            create: foldText, searchTokens, searchText, allowedTypos, MATCH_WEIGHTS, STOP_WORDS
  word-match.ts      create: matchNamed, for short lists
  gym-index.ts       create: GymIndex (MiniSearch over gyms)
  gym-lookup.ts      create: GymLookup (index + regions: local, neighbouring, anywhere)
src/domain/party/
  status-words.ts    create: parseStatusWord, parsePrivacyWord
src/domain/pogo/
  move-search.ts     create: findMoves, parseMoveset
  pokemon-search.ts  create: PokemonSearch, mergeNicknames
  catalogue.ts       modify: aliasesOf
src/domain/geo/
  geodata.ts             create: addressText (what the search reads of GymMeta.geodata)
  region-membership.ts   create: ringContains, enlargeRing, gymsByRegion
  polyline.ts            create: encodePolyline
  static-map.ts          create: staticMapQuery, gymMap, regionMap
src/services/
  image-cache.ts             create: ImageCache
  static-maps.ts             create: StaticMaps, MapProvider
  gym-directory.ts           create: GymDirectory, GymProvider
  pokemon-search-service.ts  create: PokemonSearchService, PokemonFinder
src/app-context.ts   modify: gyms, pokemon, maps
src/app.ts           modify: build and load them
test/support/
  gyms.ts            create: testGyms, testRegions and their channel ids
  providers.ts       create: gymsFixture, pokemonFixture, mapsFixture
  test-context.ts    modify: use them
(+ a test file beside each module)
```

Each task below ends green and commits. Tasks 1 to 5 are independent of the services; Task 6 connects everything.

---

### Task 1: Search text, short-list matching, status words and moves

**Files:**
- Modify: `package.json`, `package-lock.json` (two dependencies)
- Create: `src/domain/search/text.ts`, `src/domain/search/text.test.ts`
- Create: `src/domain/search/word-match.ts`, `src/domain/search/word-match.test.ts`
- Create: `src/domain/party/status-words.ts`, `src/domain/party/status-words.test.ts`
- Create: `src/domain/pogo/move-search.ts`, `src/domain/pogo/move-search.test.ts`

**Interfaces:**
- Consumes: `PartyStatus`, `RaidPrivacy` (`src/domain/party/status.ts`); `PokemonCatalogue.move(id)`, `PokemonEntry`, `Move` (`src/domain/pogo/`).
- Produces:
  - `foldText(text): string`; `searchTokens(text): string[]`; `searchText(text): string`; `allowedTypos(term): number`; `MATCH_WEIGHTS: { prefix: 0.5, fuzzy: 0.3 }`; `STOP_WORDS: ReadonlySet<string>`.
  - `interface Named<T> { value: T; names: readonly string[] }`; `matchNamed<T>(candidates: readonly Named<T>[], text: string): T[]`.
  - `parseStatusWord(text): PartyStatus | undefined`; `parsePrivacyWord(text): RaidPrivacy | undefined`.
  - `findMoves(moves: readonly Move[], text): Move[]`; `interface Moveset { fast: Move | undefined; charged: Move | undefined; unknown: string[] }`; `parseMoveset(catalogue, entry, text): Moveset`.

- [ ] **Step 1: Install the two search libraries**

```bash
npm install minisearch@7.2.0 fastest-levenshtein@1.0.16
```

Expected: `package.json` gains `"fastest-levenshtein": "^1.0.16"` and `"minisearch": "^7.2.0"` under `dependencies`; nothing else in it changes. Both ship their own types. (`minisearch` is first used in Task 2.)

- [ ] **Step 2: Write the failing tests**

Create `src/domain/search/text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STOP_WORDS, allowedTypos, foldText, searchText, searchTokens } from './text.js';

describe('foldText', () => {
  it('lower-cases and removes accents', () => {
    expect(foldText('Flabébé')).toBe('flabebe');
    expect(foldText('CAFÉ Élan')).toBe('cafe elan');
    expect(foldText('Señor Niño')).toBe('senor nino');
  });

  it('writes letters that have no accent to remove as plain letters', () => {
    expect(foldText('Straße')).toBe('strasse');
    expect(foldText('Łódź Æther Øre')).toBe('lodz aether ore');
  });
});

describe('searchTokens', () => {
  it('splits at everything that is not a letter or a digit', () => {
    expect(searchTokens('Mr. Mime')).toEqual(['mr', 'mime']);
    expect(searchTokens('Ho-Oh')).toEqual(['ho', 'oh']);
    expect(searchTokens('rattata_alola')).toEqual(['rattata', 'alola']);
    expect(searchTokens('  Fire   Station No. 4 ')).toEqual(['fire', 'station', 'no', '4']);
    expect(searchTokens('Smith/Jones (Park)')).toEqual(['smith', 'jones', 'park']);
  });

  it('drops apostrophes instead of splitting at them', () => {
    expect(searchTokens("St. Mary's")).toEqual(['st', 'marys']);
    expect(searchTokens('Farfetch’d')).toEqual(['farfetchd']);
    expect(searchTokens("O'Hara")).toEqual(['ohara']);
  });

  it('reads a custom emoji as its name', () => {
    expect(searchTokens('<:mewtwo:123456789012345678>')).toEqual(['mewtwo']);
    expect(searchTokens('mega <a:charizard:1> y')).toEqual(['mega', 'charizard', 'y']);
  });

  it('reads the signs of the two Nidoran as words', () => {
    expect(searchTokens('Nidoran♀')).toEqual(['nidoran', 'female']);
    expect(searchTokens('Nidoran♂')).toEqual(['nidoran', 'male']);
  });

  it('keeps letters of other alphabets', () => {
    expect(searchTokens('Ναός 東京 Tower')).toEqual(['ναος', '東京', 'tower']);
  });

  it('gives nothing for text without letters or digits', () => {
    expect(searchTokens('')).toEqual([]);
    expect(searchTokens(' !?… ')).toEqual([]);
  });
});

describe('searchText', () => {
  it('joins the words with single spaces', () => {
    expect(searchText('  Mr.   MIME ')).toBe('mr mime');
    expect(searchText('!')).toBe('');
  });
});

describe('allowedTypos', () => {
  it('allows none up to three letters, one up to five, two beyond', () => {
    expect(['', 'a', 'mew', 'onix', 'absol', 'mewtwo', 'tyranitar'].map(allowedTypos)).toEqual([
      0, 0, 0, 1, 1, 2, 2,
    ]);
  });
});

describe('STOP_WORDS', () => {
  it('holds common words in folded form', () => {
    expect(STOP_WORDS.has('the')).toBe(true);
    expect(STOP_WORDS.has('of')).toBe(true);
    expect(STOP_WORDS.has('park')).toBe(false);
    expect(STOP_WORDS.size).toBe(118);
    for (const word of STOP_WORDS) expect(searchTokens(word)).toEqual([word]);
  });
});
```

Create `src/domain/search/word-match.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchNamed, type Named } from './word-match.js';

const MOVES: Named<string>[] = [
  { value: 'cannon', names: ['Hydro Cannon'] },
  { value: 'pump', names: ['Hydro Pump'] },
  { value: 'gun', names: ['Water Gun'] },
  { value: 'ball', names: ['Shadow Ball', 'sball'] },
  { value: 'hydro', names: ['Hydro'] },
];

describe('matchNamed', () => {
  it('puts the exact name first, whatever the case, spaces or punctuation', () => {
    expect(matchNamed(MOVES, 'hydro pump')).toEqual(['pump']);
    expect(matchNamed(MOVES, 'HydroPump')).toEqual(['pump']);
    expect(matchNamed(MOVES, ' hydro-pump! ')).toEqual(['pump']);
    expect(matchNamed(MOVES, 'hydro')).toEqual(['hydro', 'cannon', 'pump']);
  });

  it('finds a thing by any of its names', () => {
    expect(matchNamed(MOVES, 'sball')).toEqual(['ball']);
    expect(matchNamed(MOVES, 'shadow ball')).toEqual(['ball']);
  });

  it('accepts the beginning of a name, and beginnings of its words', () => {
    expect(matchNamed(MOVES, 'hydro c')).toEqual(['cannon', 'hydro']);
    expect(matchNamed(MOVES, 'wat')).toEqual(['gun']);
    expect(matchNamed(MOVES, 'can hyd')).toEqual(['cannon']);
    expect(matchNamed(MOVES, 'gun')).toEqual(['gun']);
  });

  it('accepts small misspellings, after everything that fits better', () => {
    expect(matchNamed(MOVES, 'hydro canon')).toEqual(['cannon']);
    expect(matchNamed(MOVES, 'shadwo ball')).toEqual(['ball']);
    expect(matchNamed(MOVES, 'watr gun')).toEqual(['gun']);
    expect(matchNamed(MOVES, 'hidro')).toEqual(['hydro', 'cannon', 'pump']);
  });

  it('does not guess from one or two letters', () => {
    expect(matchNamed(MOVES, 'hy')).toEqual([]);
    expect(matchNamed(MOVES, 'w')).toEqual([]);
    expect(matchNamed([{ value: 1, names: ['no'] }], 'no')).toEqual([1]);
  });

  it('does not correct words of fewer than five letters', () => {
    const words: Named<string>[] = [{ value: 'none', names: ['none'] }];
    expect(matchNamed(words, 'done')).toEqual([]);
    expect(matchNamed(words, 'nonee')).toEqual(['none']);
  });

  it('gives nothing for text that fits no name, or no text', () => {
    expect(matchNamed(MOVES, 'thunderbolt')).toEqual([]);
    expect(matchNamed(MOVES, '')).toEqual([]);
    expect(matchNamed(MOVES, '?!')).toEqual([]);
    expect(matchNamed([], 'hydro')).toEqual([]);
  });

  it('keeps the order of the list among equal fits and returns each value once', () => {
    const twice: Named<string>[] = [
      { value: 'b', names: ['Rock Slide'] },
      { value: 'a', names: ['Rock Tomb'] },
      { value: 'b', names: ['Rock Blast'] },
    ];
    expect(matchNamed(twice, 'rock')).toEqual(['b', 'a']);
  });
});
```

Create `src/domain/party/status-words.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PartyStatus, RaidPrivacy } from './status.js';
import { parsePrivacyWord, parseStatusWord } from './status-words.js';

describe('parseStatusWord', () => {
  it.each([
    ['maybe', PartyStatus.Interested],
    ['interested', PartyStatus.Interested],
    ['interest', PartyStatus.Interested],
    ['hmm', PartyStatus.Interested],
    ['on', PartyStatus.Interested],
    ['join', PartyStatus.Coming],
    ['attend', PartyStatus.Coming],
    ['omw', PartyStatus.Coming],
    ['coming', PartyStatus.Coming],
    ['going', PartyStatus.Coming],
    ['leave', PartyStatus.NotInterested],
    ['part', PartyStatus.NotInterested],
    ['not-interested', PartyStatus.NotInterested],
    ['not interested', PartyStatus.NotInterested],
    ['uninterested', PartyStatus.NotInterested],
    ['meh', PartyStatus.NotInterested],
    ['bye', PartyStatus.NotInterested],
    ['none', PartyStatus.NotInterested],
    ['off', PartyStatus.NotInterested],
  ])('reads %s', (word, status) => {
    expect(parseStatusWord(word)).toBe(status);
    expect(parseStatusWord(` ${word.toUpperCase()} `)).toBe(status);
  });

  it('forgives a misspelling and an unfinished word', () => {
    expect(parseStatusWord('intrested')).toBe(PartyStatus.Interested);
    expect(parseStatusWord('comming')).toBe(PartyStatus.Coming);
    expect(parseStatusWord('int')).toBe(PartyStatus.Interested);
  });

  it('does not guess from one or two letters, or from other words', () => {
    for (const word of ['', 'o', 'in', 'un', 'no', 'xyz', 'present', 'here', 'done']) {
      expect(parseStatusWord(word), word).toBeUndefined();
    }
  });
});

describe('parsePrivacyWord', () => {
  it.each([
    ['hidden', RaidPrivacy.Anonymous],
    ['invisible', RaidPrivacy.Anonymous],
    ['anonymous', RaidPrivacy.Anonymous],
    ['private', RaidPrivacy.Anonymous],
    ['yes', RaidPrivacy.Anonymous],
    ['unhidden', RaidPrivacy.Visible],
    ['shown', RaidPrivacy.Visible],
    ['visible', RaidPrivacy.Visible],
    ['nonanonymous', RaidPrivacy.Visible],
    ['public', RaidPrivacy.Visible],
    ['no', RaidPrivacy.Visible],
  ])('reads %s', (word, privacy) => {
    expect(parsePrivacyWord(word)).toBe(privacy);
  });

  it('forgives an unfinished word and refuses other words', () => {
    expect(parsePrivacyWord('anon')).toBe(RaidPrivacy.Anonymous);
    expect(parsePrivacyWord('pub')).toBe(RaidPrivacy.Visible);
    for (const word of ['', 'y', 'n', 'maybe']) expect(parsePrivacyWord(word)).toBeUndefined();
  });
});
```

Create `src/domain/pogo/move-search.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import type { Move, PokemonEntry } from './game-master.js';
import { findMoves, parseMoveset } from './move-search.js';

const catalogue = catalogueFixture();

function entry(key: string): PokemonEntry {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(`The fixture has no ${key}`);
  return found;
}

/** Machamp: Bullet Punch, Counter, Karate Chop (elite); Heavy Slam, Dynamic Punch, Close Combat, … */
const machamp = entry('machamp');
const machampMoves = [
  ...machamp.fastMoves,
  ...machamp.eliteFastMoves,
  ...machamp.chargedMoves,
  ...machamp.eliteChargedMoves,
]
  .map((id) => catalogue.move(id))
  .filter((move): move is Move => move !== undefined);

const ids = (moves: readonly Move[]) => moves.map((move) => move.id);

describe('findMoves', () => {
  it('finds a move by its name, with or without the space', () => {
    expect(ids(findMoves(machampMoves, 'dynamic punch'))).toEqual(['DYNAMIC_PUNCH']);
    expect(ids(findMoves(machampMoves, 'DynamicPunch'))).toEqual(['DYNAMIC_PUNCH']);
    expect(ids(findMoves(machampMoves, 'counter'))).toEqual(['COUNTER_FAST']);
  });

  it('finds a move by the beginning of its name or of its words', () => {
    expect(ids(findMoves(machampMoves, 'dyn'))).toEqual(['DYNAMIC_PUNCH']);
    expect(ids(findMoves(machampMoves, 'close'))).toEqual(['CLOSE_COMBAT']);
    expect(ids(findMoves(machampMoves, 'punch'))).toEqual(['BULLET_PUNCH_FAST', 'DYNAMIC_PUNCH']);
  });

  it('forgives a misspelling', () => {
    expect(ids(findMoves(machampMoves, 'dinamic punch'))).toEqual(['DYNAMIC_PUNCH']);
    expect(ids(findMoves(machampMoves, 'conter'))).toEqual(['COUNTER_FAST']);
  });

  it('gives nothing for a move that is not in the list', () => {
    expect(findMoves(machampMoves, 'hydro pump')).toEqual([]);
    expect(findMoves(machampMoves, '')).toEqual([]);
  });
});

describe('parseMoveset', () => {
  it('reads a fast and a charged move in either order', () => {
    for (const text of [
      'counter / dynamic punch',
      'Dynamic Punch/Counter',
      'counter, dynamic punch',
      'dynamicpunch / count',
    ]) {
      const moveset = parseMoveset(catalogue, machamp, text);
      expect([moveset.fast?.id, moveset.charged?.id, moveset.unknown], text).toEqual([
        'COUNTER_FAST',
        'DYNAMIC_PUNCH',
        [],
      ]);
    }
  });

  it('reads a single move', () => {
    const fast = parseMoveset(catalogue, machamp, 'counter');
    expect([fast.fast?.id, fast.charged, fast.unknown]).toEqual(['COUNTER_FAST', undefined, []]);
    const charged = parseMoveset(catalogue, machamp, 'close combat');
    expect([charged.fast, charged.charged?.id]).toEqual([undefined, 'CLOSE_COMBAT']);
  });

  it('accepts elite moves', () => {
    expect(machamp.eliteFastMoves).toContain('KARATE_CHOP_FAST');
    expect(parseMoveset(catalogue, machamp, 'karate chop').fast?.id).toBe('KARATE_CHOP_FAST');
  });

  it('reports what is not a move of the Pokémon', () => {
    const moveset = parseMoveset(catalogue, machamp, 'counter / hydro pump');
    expect([moveset.fast?.id, moveset.charged, moveset.unknown]).toEqual([
      'COUNTER_FAST',
      undefined,
      ['hydro pump'],
    ]);
    expect(parseMoveset(catalogue, machamp, 'xyzzy').unknown).toEqual(['xyzzy']);
  });

  it('lets the last of two moves of one kind count', () => {
    const moveset = parseMoveset(catalogue, machamp, 'cross chop / dynamic punch');
    expect([moveset.fast, moveset.charged?.id, moveset.unknown]).toEqual([
      undefined,
      'DYNAMIC_PUNCH',
      [],
    ]);
  });

  it('reads nothing from empty text', () => {
    for (const text of ['', ' / ', ',,']) {
      expect(parseMoveset(catalogue, machamp, text)).toEqual({
        fast: undefined,
        charged: undefined,
        unknown: [],
      });
    }
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run --project unit src/domain/search src/domain/party/status-words.test.ts src/domain/pogo/move-search.test.ts`
Expected: FAIL, the four test files cannot import their modules.

- [ ] **Step 4: Write the modules**

Create `src/domain/search/text.ts`. The stop words are the legacy bot's list (`app/search.js`), all 118 of them:

```ts
/** Letters the Unicode decomposition leaves alone, with the plain letters people type instead. */
const PLAIN_LETTERS: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  þ: 'th',
};

/** Lower case, without accents: `Flabébé` becomes `flabebe`. */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[ßæœøđðłþ]/g, (letter) => PLAIN_LETTERS[letter] ?? letter);
}

/**
 * The words of a text as they are indexed and searched: folded, apostrophes dropped (`O'Hara`
 * is `ohara`, `Farfetch'd` is `farfetchd`), split at everything that is not a letter or a digit.
 * A custom emoji (`<:mewtwo:123>`) counts as its name, and the signs in `Nidoran♀` and `Nidoran♂`
 * as the words female and male.
 */
export function searchTokens(text: string): string[] {
  return foldText(text.replace(/<a?:(\w+):\d+>/g, ' $1 '))
    .replace(/♀/g, ' female ')
    .replace(/♂/g, ' male ')
    .replace(/['’‘`]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token !== '');
}

/** The folded text in one piece, words separated by single spaces. */
export function searchText(text: string): string {
  return searchTokens(text).join(' ');
}

/**
 * How many letters of a word may be wrong and still match: none up to three letters, one up to
 * five, two beyond. Two letters typed in the wrong order count as two.
 */
export function allowedTypos(term: string): number {
  if (term.length <= 3) return 0;
  return term.length <= 5 ? 1 : 2;
}

/**
 * How much a word counts when it is only the beginning of the word found, or a misspelling of
 * it, against 1 for the word itself. A beginning counts more: it is what a member who is still
 * typing has.
 */
export const MATCH_WEIGHTS = { prefix: 0.5, fuzzy: 0.3 } as const;

/** Words too common to search by: the legacy bot's list. */
export const STOP_WORDS: ReadonlySet<string> = new Set(
  (
    'a able about across after all almost also am among an and any are as at be been but by can ' +
    'cannot could dear did do does either else ever every for from get got had has have he her ' +
    'hers him his how however i if in into is it its just least let like likely may me might ' +
    'most must my neither no nor not of off often on only or other our own rather said say says ' +
    'she should since so some than that the their them then there these they this tis to too ' +
    'twas us wants was we were what when where which while who whom why will with would yet ' +
    'you your'
  ).split(' '),
);
```

Create `src/domain/search/word-match.ts`:

```ts
import { distance } from 'fastest-levenshtein';
import { searchTokens } from './text.js';

/** One thing that can be found, with every name it answers to. */
export interface Named<T> {
  value: T;
  names: readonly string[];
}

/**
 * Wrong letters allowed: none in fewer than five letters, one up to seven, two beyond. Stricter
 * than the big searches, because here a wrong guess acts ("done" must not be read as "none").
 */
function allowedTypos(text: string): number {
  if (text.length < 5) return 0;
  return text.length < 8 ? 1 : 2;
}

/** How well a typed text fits one name; 0 means not at all. */
function fit(typed: readonly string[], name: readonly string[]): number {
  const typedJoined = typed.join('');
  const nameJoined = name.join('');
  if (typedJoined === nameJoined) return 100;
  // One or two letters are too little to guess from ("no" is not "none").
  if (typedJoined.length < 3) return 0;
  if (nameJoined.startsWith(typedJoined)) return 80;
  // Every typed word begins a word of the name ("hydro can" for Hydro Cannon).
  if (typed.every((word) => name.some((part) => part.startsWith(word)))) return 60;
  const edits = distance(typedJoined, nameJoined);
  if (edits <= allowedTypos(typedJoined)) return 40 - edits;
  // Every typed word is a word of the name, give or take a letter.
  const close = typed.every((word) =>
    name.some((part) => distance(word, part) <= allowedTypos(word)),
  );
  return close ? 20 : 0;
}

/**
 * Finds things in a short list (a boss's moves, the status words) by what a member typed: the
 * exact name first, then names that begin with the text, names whose words begin with the typed
 * words, and near misspellings. Anything but the exact name needs at least three letters.
 * Spaces, case, accents and punctuation do not matter. Best fit first; equal fits keep the order
 * of the list. Each value is returned once.
 */
export function matchNamed<T>(candidates: readonly Named<T>[], text: string): T[] {
  const typed = searchTokens(text);
  if (typed.length === 0) return [];
  const scored: { value: T; score: number; order: number }[] = [];
  candidates.forEach((candidate, order) => {
    const score = Math.max(0, ...candidate.names.map((name) => fit(typed, searchTokens(name))));
    if (score > 0) scored.push({ value: candidate.value, score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return [...new Set(scored.map((entry) => entry.value))];
}
```

Create `src/domain/party/status-words.ts`. The words are the legacy bot's (`app/status.js`, `app/privacy.js`):

```ts
import { matchNamed, type Named } from '../search/word-match.js';
import { PartyStatus, RaidPrivacy } from './status.js';

/** What members call the statuses they can set for themselves (the legacy bot's words). */
const STATUS_WORDS: readonly Named<PartyStatus>[] = [
  {
    value: PartyStatus.NotInterested,
    names: ['leave', 'part', 'not-interested', 'uninterested', 'meh', 'bye', 'none', 'off'],
  },
  {
    value: PartyStatus.Interested,
    names: ['maybe', 'interested', 'interest', 'hmm', 'on'],
  },
  {
    value: PartyStatus.Coming,
    names: ['join', 'attend', 'omw', 'coming', 'going'],
  },
];

const PRIVACY_WORDS: readonly Named<RaidPrivacy>[] = [
  {
    value: RaidPrivacy.Anonymous,
    names: ['hidden', 'invisible', 'anonymous', 'private', 'yes'],
  },
  {
    value: RaidPrivacy.Visible,
    names: ['unhidden', 'shown', 'visible', 'nonanonymous', 'public', 'no'],
  },
];

/** The status a word means ("maybe", "omw", "leave"); undefined when it means none. */
export function parseStatusWord(text: string): PartyStatus | undefined {
  return matchNamed(STATUS_WORDS, text)[0];
}

/** Whether a word asks for anonymous ("hidden", "yes") or named ("public", "no") raid reports. */
export function parsePrivacyWord(text: string): RaidPrivacy | undefined {
  return matchNamed(PRIVACY_WORDS, text)[0];
}
```

Create `src/domain/pogo/move-search.ts`:

```ts
import { matchNamed } from '../search/word-match.js';
import type { PokemonCatalogue } from './catalogue.js';
import type { Move, PokemonEntry } from './game-master.js';

/** Moves by what a member typed ("hydro can", "hydrocannon", "shadow bal"), best fit first. */
export function findMoves(moves: readonly Move[], text: string): Move[] {
  return matchNamed(
    moves.map((move) => ({ value: move, names: [move.name, move.id.replace(/_FAST$/, '')] })),
    text,
  );
}

export interface Moveset {
  fast: Move | undefined;
  charged: Move | undefined;
  /** Parts of the text that are no move of this Pokémon. */
  unknown: string[];
}

function movesOf(catalogue: PokemonCatalogue, ids: readonly string[]): Move[] {
  return ids.map((id) => catalogue.move(id)).filter((move): move is Move => move !== undefined);
}

/**
 * Reads a moveset as members write it: one or two moves separated by `/` or `,`, in either
 * order ("counter / dynamic punch", "dpunch"). Only moves the Pokémon can have are accepted,
 * elite moves included. When a second move of the same kind is named, the last one counts.
 */
export function parseMoveset(
  catalogue: PokemonCatalogue,
  entry: PokemonEntry,
  text: string,
): Moveset {
  const fastMoves = movesOf(catalogue, [...entry.fastMoves, ...entry.eliteFastMoves]);
  const chargedMoves = movesOf(catalogue, [...entry.chargedMoves, ...entry.eliteChargedMoves]);
  const moveset: Moveset = { fast: undefined, charged: undefined, unknown: [] };
  for (const part of text.split(/[/,]/).map((piece) => piece.trim())) {
    if (part === '') continue;
    const move = findMoves([...fastMoves, ...chargedMoves], part)[0];
    if (!move) moveset.unknown.push(part);
    else if (move.fast) moveset.fast = move;
    else moveset.charged = move;
  }
  return moveset;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --project unit src/domain/search src/domain/party/status-words.test.ts src/domain/pogo/move-search.test.ts`
Expected: PASS, 62 tests in 4 files.

- [ ] **Step 6: Format, check, commit**

```bash
npx prettier --write package.json src/domain/search src/domain/party/status-words.ts src/domain/party/status-words.test.ts src/domain/pogo/move-search.ts src/domain/pogo/move-search.test.ts
npm run check
git add package.json package-lock.json src/domain/search/text.ts src/domain/search/text.test.ts src/domain/search/word-match.ts src/domain/search/word-match.test.ts src/domain/party/status-words.ts src/domain/party/status-words.test.ts src/domain/pogo/move-search.ts src/domain/pogo/move-search.test.ts
git commit -m "Search text, short-list matching, status words and moves" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pokémon search

**Files:**
- Modify: `src/domain/pogo/catalogue.ts`, `src/domain/pogo/catalogue.test.ts`
- Create: `src/domain/pogo/pokemon-search.ts`, `src/domain/pogo/pokemon-search.test.ts`

**Interfaces:**
- Consumes: `searchText`, `searchTokens`, `allowedTypos`, `MATCH_WEIGHTS` (Task 1); `PokemonCatalogue` (`all`, `byKey`, `species`); `CURATED_NICKNAMES` (`src/domain/pogo/nicknames.ts`).
- Produces:
  - `PokemonCatalogue.aliasesOf(key: string): string[]`.
  - `interface PokemonSearchOptions { limit?: number; filter?: (entry: PokemonEntry) => boolean }`.
  - `class PokemonSearch { constructor(catalogue: PokemonCatalogue, nicknames?: ReadonlyMap<string, readonly string[]>); search(text: string, options?: PokemonSearchOptions): PokemonEntry[] }`.
  - `mergeNicknames(catalogue, ...sources): Map<string, string[]>`, where a source is a `ReadonlyMap<string, readonly string[]>` or a `Readonly<Record<string, readonly string[]>>`.

- [ ] **Step 1: Write the failing tests**

In `src/domain/pogo/catalogue.test.ts`, add a block before the "types and weather" block:

```diff
--- a/src/domain/pogo/catalogue.test.ts
+++ b/src/domain/pogo/catalogue.test.ts
@@ -198,6 +198,18 @@ describe('PokemonCatalogue: what a raid gives you (values from Bulbapedia, "Raid
   });
 });
 
+describe('PokemonCatalogue: aliases', () => {
+  it('lists the other ids that stand for an entry', () => {
+    expect(catalogue.aliasesOf('giratina_altered')).toEqual(['giratina']);
+    expect(catalogue.aliasesOf('pikachu')).toContain('pikachu_copy_2019');
+    expect(catalogue.aliasesOf('giratina_origin')).toEqual([]);
+    expect(catalogue.aliasesOf('no_such_pokemon')).toEqual([]);
+    for (const alias of catalogue.aliasesOf('pikachu')) {
+      expect(catalogue.byKey(alias)?.key, alias).toBe('pikachu');
+    }
+  });
+});
+
 describe('PokemonCatalogue: types and weather', () => {
   it('multiplies effectiveness over both types', () => {
     expect(catalogue.effectiveness('ice', ['dragon', 'flying'])).toBeCloseTo(2.56, 10);
```

Create `src/domain/pogo/pokemon-search.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { CURATED_NICKNAMES } from './nicknames.js';
import { PokemonSearch, mergeNicknames } from './pokemon-search.js';

const catalogue = catalogueFixture();
const search = new PokemonSearch(catalogue, mergeNicknames(catalogue, CURATED_NICKNAMES));

const keys = (text: string, limit?: number) =>
  search.search(text, { limit }).map((entry) => entry.key);
const first = (text: string) => search.search(text)[0]?.key;

describe('PokemonSearch: names', () => {
  it('finds every Pokémon first by its own name and by its key', () => {
    // Unown's "!" and "?" have no letters in their names; their keys still find them.
    const unnameable = new Set(['unown_exclamation_point', 'unown_question_mark']);
    for (const entry of catalogue.all) {
      expect(first(entry.key), entry.key).toBe(entry.key);
      if (!unnameable.has(entry.key)) expect(first(entry.name), entry.name).toBe(entry.key);
    }
  });

  it('ignores case, accents, punctuation and custom-emoji wrapping', () => {
    expect(first('FLABÉBÉ')).toBe('flabebe');
    expect(first('flabebe')).toBe('flabebe');
    expect(first("farfetch'd")).toBe('farfetchd');
    expect(first('mr mime')).toBe('mr_mime');
    expect(first('Mr. Mime')).toBe('mr_mime');
    expect(first('ho-oh')).toBe('ho_oh');
    expect(first('<:mewtwo:123456789012345678>')).toBe('mewtwo');
    expect(first('RATTATA_ALOLA')).toBe('rattata_alola');
  });

  it('puts the species before its forms and megas', () => {
    expect(keys('charizard')).toEqual(['charizard', 'charizard_mega_x', 'charizard_mega_y']);
    expect(keys('rattata')).toEqual(['rattata', 'rattata_alola']);
    expect(keys('weezing')).toEqual(['weezing', 'weezing_galarian']);
    expect(keys('mew', 2)).toEqual(['mew', 'mewtwo']);
  });

  it('finds a species known by its default form under the bare species name', () => {
    expect(keys('giratina')).toEqual(['giratina_altered', 'giratina_origin']);
    expect(keys('landorus')).toEqual(['landorus_incarnate', 'landorus_therian']);
    expect(first('zacian')).toBe('zacian_hero');
    expect(first('wormadam')).toBe('wormadam_plant');
  });

  it('narrows down with more words', () => {
    expect(keys('giratina origin')).toEqual(['giratina_origin']);
    expect(keys('mega charizard')).toEqual(['charizard_mega_x', 'charizard_mega_y']);
    expect(keys('mega charizard y')).toEqual(['charizard_mega_y']);
    expect(keys('black kyurem')).toEqual(['kyurem_black']);
    expect(keys('primal kyogre')).toEqual(['kyogre_primal']);
    expect(keys('deoxys attack')).toEqual(['deoxys_attack']);
    expect(keys('nidoran female', 1)).toEqual(['nidoran_female']);
    expect(keys('nidoran male', 1)).toEqual(['nidoran_male']);
  });

  it('accepts the beginning of a word and small misspellings', () => {
    expect(first('gira')).toBe('girafarig');
    expect(keys('gira')).toContain('giratina_altered');
    expect(keys('lando', 2)).toEqual(['landorus_incarnate', 'landorus_therian']);
    expect(keys('lando t')).toEqual(['landorus_therian']);
    expect(first('tyrannitar')).toBe('tyranitar');
    expect(first('mewtoo')).toBe('mewtwo');
    expect(first('pikchu')).toBe('pikachu');
  });

  it('finds regional forms by the short words members use', () => {
    expect(keys('alo rattata')).toEqual(['rattata_alola']);
    expect(keys('alolan rat')).toEqual(['rattata_alola', 'raticate_alola']);
    expect(keys('galar weezing')).toEqual(['weezing_galarian']);
    expect(first('hisu arcanine')).toBe('arcanine_hisuian');
    expect(first('paldea tauros')).toMatch(/^tauros_paldea/);
    expect(keys('kanto rattata')).toEqual(['rattata']);
  });

  it('finds a Pokémon by its Pokédex number', () => {
    expect(keys('150', 1)).toEqual(['mewtwo']);
    expect(first('#25')).toBe('pikachu');
  });

  it('gives nothing for no words and for words no Pokémon has', () => {
    expect(keys('')).toEqual([]);
    expect(keys('?!')).toEqual([]);
    expect(keys('qqqqqq')).toEqual([]);
    expect(keys('mega qqqqqq')).toEqual([]);
  });
});

describe('PokemonSearch: nicknames and other ids', () => {
  it('finds a Pokémon by a nickname of its own', () => {
    expect(first('ttar')).toBe('tyranitar');
    expect(first('hooh')).toBe('ho_oh');
    expect(first('alowak')).toBe('marowak_alola');
    expect(keys('exegg', 2)).toEqual(['exeggutor', 'exeggutor_alola']);
  });

  it('treats a nickname shared by many as a word, not as one Pokémon', () => {
    const found = keys('mega');
    const megas = catalogue.all.filter((entry) => entry.tempEvolution?.startsWith('MEGA'));
    for (const mega of megas) expect(found, mega.key).toContain(mega.key);
    expect(found.slice(0, 3)).toEqual(['abomasnow_mega', 'absol_mega', 'aerodactyl_mega']);
    expect(found.slice(0, 40).every((key) => catalogue.byKey(key)?.kind === 'mega')).toBe(true);
    // A word that merely begins the same comes along, after them.
    expect(found).toContain('meganium');
  });

  it('finds an entry by a game-master id that stands for it', () => {
    expect(first('giratina')).toBe('giratina_altered');
    expect(first('pikachu_copy_2019')).toBe('pikachu');
    expect(first('PIKACHU COPY 2019')).toBe('pikachu');
  });

  it('uses the nicknames it was given', () => {
    const own = new PokemonSearch(
      catalogue,
      mergeNicknames(catalogue, { giratina: ['tina'], dratini: ['noodle'] }),
    );
    expect(own.search('tina')[0]?.key).toBe('giratina_altered');
    expect(own.search('noodle')[0]?.key).toBe('dratini');
    expect(own.search('ttar').map((entry) => entry.key)).not.toContain('tyranitar');
  });
});

describe('PokemonSearch: forms that differ in looks only', () => {
  it('leaves them out unless the text names the form', () => {
    expect(keys('vivillon')).toEqual(['vivillon']);
    expect(keys('vivillon marine')).toEqual(['vivillon_marine']);
    expect(keys('unown')).toEqual(['unown']);
    expect(keys('unown f')).toEqual(['unown_f']);
    expect(keys('spinda')).toEqual(['spinda']);
    expect(keys('marine').slice(0, 3)).toEqual([
      'scatterbug_marine',
      'spewpa_marine',
      'vivillon_marine',
    ]);
  });

  it('keeps forms that battle differently', () => {
    expect(keys('deoxys')).toEqual(['deoxys', 'deoxys_attack', 'deoxys_defense', 'deoxys_speed']);
    expect(keys('wormadam')).toEqual(['wormadam_plant', 'wormadam_sandy', 'wormadam_trash']);
  });
});

describe('PokemonSearch: options', () => {
  it('limits the results', () => {
    expect(keys('mega', 5)).toHaveLength(5);
    expect(keys('charizard', 1)).toEqual(['charizard']);
  });

  it('filters before limiting', () => {
    const megas = search.search('charizard', {
      filter: (entry) => entry.kind === 'mega',
      limit: 1,
    });
    expect(megas.map((entry) => entry.key)).toEqual(['charizard_mega_x']);
    expect(search.search('charizard', { filter: () => false })).toEqual([]);
  });
});

describe('mergeNicknames', () => {
  it('merges the sources under the entry each key means', () => {
    const merged = mergeNicknames(
      catalogue,
      { giratina_altered: ['altered'], tyranitar: ['ttar'] },
      new Map([
        ['giratina', ['tina', 'altered']],
        ['TYRANITAR', ['godzilla']],
      ]),
    );
    expect(merged.get('giratina_altered')).toEqual(['altered', 'tina']);
    expect(merged.get('tyranitar')).toEqual(['ttar', 'godzilla']);
    expect(merged.has('giratina')).toBe(false);
  });

  it('leaves out keys the catalogue does not know', () => {
    const merged = mergeNicknames(
      catalogue,
      new Map([
        ['ex', ['exclusive']],
        ['perfect', ['hundo']],
      ]),
    );
    expect(merged.size).toBe(0);
  });

  it('places every curated nickname', () => {
    const merged = mergeNicknames(catalogue, CURATED_NICKNAMES);
    expect(merged.size).toBe(Object.keys(CURATED_NICKNAMES).length);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --project unit src/domain/pogo/catalogue.test.ts src/domain/pogo/pokemon-search.test.ts`
Expected: FAIL: `catalogue.aliasesOf is not a function`, and `pokemon-search.test.ts` cannot import its module.

- [ ] **Step 3: Add `aliasesOf` to the catalogue**

```diff
--- a/src/domain/pogo/catalogue.ts
+++ b/src/domain/pogo/catalogue.ts
@@ -56,6 +56,14 @@ export class PokemonCatalogue {
     return this.keys.get(lower) ?? this.keys.get(this.aliases.get(lower) ?? lower);
   }
 
+  /**
+   * Other ids that stand for the entry with this key: the bare id of a species known by its
+   * default form, costumes and appearance-only forms, in lower case.
+   */
+  aliasesOf(key: string): string[] {
+    return [...this.aliases].filter(([, target]) => target === key).map(([alias]) => alias);
+  }
+
   /** Every entry of a species: the species itself, its forms and its megas. */
   byDex(dex: number): readonly PokemonEntry[] {
     return this.dexes.get(dex) ?? [];
```

- [ ] **Step 4: Write the search**

Create `src/domain/pogo/pokemon-search.ts`:

```ts
import MiniSearch from 'minisearch';
import { MATCH_WEIGHTS, allowedTypos, searchText, searchTokens } from '../search/text.js';
import type { PokemonCatalogue } from './catalogue.js';
import type { PokemonEntry } from './game-master.js';

export interface PokemonSearchOptions {
  /** At most this many results. Default: all. */
  limit?: number;
  /** Consider only these entries (raid bosses, Pokémon with a mega, …). */
  filter?: (entry: PokemonEntry) => boolean;
}

interface PokemonDocument {
  id: string;
  name: string;
  nicknames: string;
  key: string;
  dex: string;
}

const KIND_ORDER: Readonly<Record<PokemonEntry['kind'], number>> = {
  species: 0,
  regional: 1,
  form: 2,
  mega: 3,
};

function sameBattler(a: PokemonEntry, b: PokemonEntry): boolean {
  const facts = (entry: PokemonEntry) =>
    JSON.stringify([
      entry.stats,
      entry.types,
      entry.fastMoves,
      entry.chargedMoves,
      entry.eliteFastMoves,
      entry.eliteChargedMoves,
    ]);
  return facts(a) === facts(b);
}

/**
 * The nicknames of several sources (the curated list, the moderators' from the database) put
 * together under the key of the catalogue entry each one means. Keys the catalogue does not know
 * (the legacy table also holds `ex`, `perfect`, `zero`) are left out; an alias such as `giratina`
 * lands on its entry.
 */
export function mergeNicknames(
  catalogue: PokemonCatalogue,
  ...sources: (
    ReadonlyMap<string, readonly string[]> | Readonly<Record<string, readonly string[]>>
  )[]
): Map<string, string[]> {
  const merged = new Map<string, string[]>();
  for (const source of sources) {
    const pairs = source instanceof Map ? [...source] : Object.entries(source);
    for (const [key, nicknames] of pairs as [string, readonly string[]][]) {
      const entry = catalogue.byKey(key);
      if (!entry) continue;
      merged.set(entry.key, [...new Set([...(merged.get(entry.key) ?? []), ...nicknames])]);
    }
  }
  return merged;
}

/**
 * Finds Pokémon by what members type: the name ("giratina origin", "alolan rattata", "mega
 * charizard y"), the catalogue key, a game-master id that stands for an entry, a nickname
 * ("ttar") or the Pokédex number. Every word must match; a word may be the beginning of a longer one ("alo", "galar",
 * "hisu") or slightly misspelt.
 *
 * The best fit comes first. Among equal fits the species comes before its regional forms, other
 * forms and megas, so "giratina" gives the Altered Forme and "charizard" the plain one. A form
 * that differs from its species in looks only (Vivillon's patterns, Unown's letters) is left
 * out unless the text names it: "vivillon" gives one result, "vivillon marine" the pattern.
 *
 * Built for one catalogue; build a new one when the game data or the nicknames change.
 */
export class PokemonSearch {
  private readonly index: MiniSearch<PokemonDocument>;
  private readonly exact = new Map<string, PokemonEntry | null>();
  /** For a looks-only form: the words that tell it from its species. */
  private readonly formWords = new Map<string, Set<string>>();

  constructor(
    private readonly catalogue: PokemonCatalogue,
    nicknames: ReadonlyMap<string, readonly string[]> = new Map(),
  ) {
    this.index = new MiniSearch<PokemonDocument>({
      fields: ['name', 'nicknames', 'key', 'dex'],
      tokenize: searchTokens,
    });
    for (const entry of catalogue.all) {
      const nicks = nicknames.get(entry.key) ?? [];
      const ids = [entry.key, ...catalogue.aliasesOf(entry.key)];
      this.index.add({
        id: entry.key,
        name: entry.name,
        nicknames: nicks.join(' '),
        key: ids.join(' '),
        dex: String(entry.dex),
      });
      for (const text of [entry.name, ...ids, ...nicks]) this.remember(text, entry);
      const species = catalogue.species(entry.dex);
      if (entry.kind === 'form' && species && species !== entry && sameBattler(entry, species)) {
        const shared = new Set(searchTokens(`${species.name} ${species.key}`));
        const own = searchTokens(`${entry.name} ${entry.key} ${nicks.join(' ')}`);
        this.formWords.set(entry.key, new Set(own.filter((word) => !shared.has(word))));
      }
    }
  }

  /** A text that means exactly one entry finds it at once; one shared by several does not. */
  private remember(text: string, entry: PokemonEntry): void {
    const folded = searchText(text);
    if (folded === '') return;
    const known = this.exact.get(folded);
    if (known === undefined) this.exact.set(folded, entry);
    else if (known !== entry) this.exact.set(folded, null);
  }

  search(text: string, options: PokemonSearchOptions = {}): PokemonEntry[] {
    const { filter, limit } = options;
    const exact = this.exact.get(searchText(text)) ?? undefined;
    const ranked = this.index
      .search(text, {
        combineWith: 'AND',
        boost: { name: 3, nicknames: 3 },
        prefix: true,
        fuzzy: allowedTypos,
        weights: { ...MATCH_WEIGHTS },
      })
      .filter((result) => {
        const formWords = this.formWords.get(result.id as string);
        return !formWords || result.terms.some((term) => formWords.has(term));
      })
      .map((result) => ({ entry: this.catalogue.byKey(result.id as string), score: result.score }))
      .filter((hit): hit is { entry: PokemonEntry; score: number } => hit.entry !== undefined)
      .sort(
        (a, b) =>
          b.score - a.score ||
          KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] ||
          a.entry.key.localeCompare(b.entry.key),
      )
      .map((hit) => hit.entry);
    const found = exact ? [exact, ...ranked.filter((entry) => entry !== exact)] : ranked;
    const allowed = filter ? found.filter(filter) : found;
    return limit === undefined ? allowed : allowed.slice(0, limit);
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --project unit src/domain/pogo/catalogue.test.ts src/domain/pogo/pokemon-search.test.ts`
Expected: PASS. The first test of `pokemon-search.test.ts` searches for every one of the 1,431 entries twice and takes a few seconds.

- [ ] **Step 6: Format, check, commit**

```bash
npx prettier --write src/domain/pogo/catalogue.ts src/domain/pogo/catalogue.test.ts src/domain/pogo/pokemon-search.ts src/domain/pogo/pokemon-search.test.ts
npm run check
git add src/domain/pogo/catalogue.ts src/domain/pogo/catalogue.test.ts src/domain/pogo/pokemon-search.ts src/domain/pogo/pokemon-search.test.ts
git commit -m "Pokémon search: names, nicknames, forms and misspellings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Address text, gyms by region, and the gym fixtures

**Files:**
- Create: `test/support/gyms.ts`
- Create: `src/domain/geo/geodata.ts`, `src/domain/geo/geodata.test.ts`
- Create: `src/domain/geo/region-membership.ts`, `src/domain/geo/region-membership.test.ts`

**Interfaces:**
- Consumes: `LatLon` (`src/domain/geo/lat-lon.ts`); the types `Gym` and `Region` of the repositories (test support only).
- Produces:
  - `test/support/gyms.ts`: `WEST_CHANNEL`, `EAST_CHANNEL`, `UNBOUNDED_CHANNEL` (snowflake strings); `testRegions(): Region[]`; `testGyms(): Gym[]` (twelve invented gyms, ids 1 to 12).
  - `ADDRESS_PARTS` and `addressText(geodata: string | null): string`.
  - `NEIGHBOUR_SCALE = 1.5`; `ringContains(ring: readonly LatLon[], point: LatLon): boolean`; `enlargeRing(ring: readonly LatLon[], factor?: number): LatLon[]`; `interface RegionGyms { local: Set<number>; neighbouring: Set<number> }`; `gymsByRegion(regions: readonly { channelId: string; bounds: readonly LatLon[] | null }[], gyms: readonly { id: number; lat: number; lon: number }[]): Map<string, RegionGyms>`.

- [ ] **Step 1: Write the fixtures**

Create `test/support/gyms.ts`. The town and its gyms are invented; do not replace them with real places:

```ts
import type { Gym } from '../../src/db/repositories/gym-repository.js';
import type { Region } from '../../src/db/repositories/region-repository.js';
import type { LatLon } from '../../src/domain/geo/lat-lon.js';

/** Channel ids of the invented regions: two squares side by side, and one without an outline. */
export const WEST_CHANNEL = '100000000000000001';
export const EAST_CHANNEL = '100000000000000002';
export const UNBOUNDED_CHANNEL = '100000000000000003';

function square(south: number, west: number, north: number, east: number): LatLon[] {
  return [
    { lat: south, lon: west },
    { lat: north, lon: west },
    { lat: north, lon: east },
    { lat: south, lon: east },
    { lat: south, lon: west },
  ];
}

/**
 * West covers longitudes -80.10 to -80.00, East -80.00 to -79.90, both latitudes 40.00 to 40.10.
 * Enlarged by half, each reaches 0.025 degrees into the other.
 */
export function testRegions(): Region[] {
  return [
    {
      id: 1,
      guildId: 1,
      channelId: WEST_CHANNEL,
      description: null,
      bounds: square(40.0, -80.1, 40.1, -80.0),
    },
    {
      id: 2,
      guildId: 1,
      channelId: EAST_CHANNEL,
      description: null,
      bounds: square(40.0, -80.0, 40.1, -79.9),
    },
    { id: 3, guildId: 1, channelId: UNBOUNDED_CHANNEL, description: null, bounds: null },
  ];
}

function geodata(route: string, extra: Record<string, string> = {}): string {
  return JSON.stringify({
    addressComponents: {
      street_number: '12',
      route,
      locality: 'Pinewood',
      administrative_area_level_1: 'Pennsylvania',
      country: 'United States',
      postal_code: '15999',
      ...extra,
    },
  });
}

function gym(id: number, name: string, lat: number, lon: number, more: Partial<Gym> = {}): Gym {
  return {
    id,
    pogoId: null,
    name,
    lat,
    lon,
    nickname: null,
    description: null,
    keywords: [],
    notice: null,
    taggedEx: false,
    confirmedEx: false,
    imageUrl: null,
    sponsor: null,
    geodata: null,
    places: null,
    nearestGym: null,
    ...more,
  };
}

/**
 * Invented gyms of an invented town. Ids 1 to 6 and 11, 12 lie in West, 7 to 9 in East, 10 in
 * no region. Gym 4 is close enough to the border to be a neighbour for East, gym 7 for West.
 */
export function testGyms(): Gym[] {
  return [
    gym(1, 'Pinewood Public Library', 40.05, -80.05, {
      nickname: 'The Stacks',
      description: 'Mural of readers beside the front doors',
      geodata: geodata('Maple Avenue', { neighborhood: 'Old Town' }),
      places: 'Corner Bakery, Maple Dental',
    }),
    gym(2, 'Old Stone Fountain', 40.06, -80.06, {
      keywords: ['plaza', 'square'],
      geodata: geodata('Market Street'),
      places: 'Riverside Plaza, Cafe Luna',
    }),
    gym(3, "St. Mary's Church", 40.07, -80.07, { geodata: geodata('Church Lane') }),
    gym(4, 'Veterans Memorial Bridge', 40.05, -80.01, { geodata: geodata('River Road') }),
    gym(5, 'Starbucks', 40.02, -80.08, {
      geodata: geodata('Maple Avenue'),
      description: 'Sponsored gym',
    }),
    gym(6, 'Maple Leaf Mosaic', 40.03, -80.03, { geodata: geodata('Birch Street') }),
    gym(7, 'Harbor Lighthouse Mural', 40.05, -79.99, { geodata: geodata('Harbor Street') }),
    gym(8, 'Café Élan Fresco', 40.05, -79.92, { geodata: geodata('Harbor Street') }),
    gym(9, 'Starbucks', 40.08, -79.95, { geodata: geodata('Harbor Street') }),
    gym(10, 'Lakeview Trailhead', 40.5, -80.05, { geodata: 'not json' }),
    gym(11, 'Riverside Park Gazebo', 40.09, -80.09, {
      notice: 'Park closes at dusk',
      geodata: geodata('River Road'),
    }),
    gym(12, 'Pinewood Post Office Gym', 40.04, -80.04, { geodata: geodata('Market Street') }),
  ];
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/domain/geo/geodata.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ADDRESS_PARTS, addressText } from './geodata.js';

describe('addressText', () => {
  it('joins the parts that tell one gym from another, in a fixed order', () => {
    const geodata = JSON.stringify({
      addressComponents: {
        street_number: '4400',
        route: 'Forbes Avenue',
        neighborhood: 'Oakland',
        locality: 'Pittsburgh',
        administrative_area_level_1: 'Pennsylvania',
        country: 'United States',
        postal_code: '15213',
        point_of_interest: 'Carnegie Library',
      },
    });
    expect(addressText(geodata)).toBe('Forbes Avenue Oakland Pittsburgh 15213 Carnegie Library');
  });

  it('knows twelve parts', () => {
    expect(ADDRESS_PARTS).toHaveLength(12);
  });

  it('accepts a part that is a list', () => {
    const geodata = JSON.stringify({ addressComponents: { route: ['Main Street', 'Route 8'] } });
    expect(addressText(geodata)).toBe('Main Street Route 8');
  });

  it('skips parts that are not text', () => {
    const geodata = JSON.stringify({
      addressComponents: {
        route: 5,
        locality: null,
        premise: { name: 'x' },
        neighborhood: 'Shadyside',
      },
    });
    expect(addressText(geodata)).toBe('Shadyside');
  });

  it.each([
    ['nothing stored', null],
    ['an empty string', ''],
    ['text that is not JSON', 'not json'],
    ['a JSON string', '"route"'],
    ['a JSON list', '[1, 2]'],
    ['an object without address parts', '{"lat": 1}'],
    ['address parts that are not an object', '{"addressComponents": "Forbes Avenue"}'],
    ['address parts that are null', '{"addressComponents": null}'],
  ])('gives an empty text for %s', (_what, geodata) => {
    expect(addressText(geodata)).toBe('');
  });
});
```

Create `src/domain/geo/region-membership.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  EAST_CHANNEL,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  testGyms,
  testRegions,
} from '../../../test/support/gyms.js';
import type { LatLon } from './lat-lon.js';
import { NEIGHBOUR_SCALE, enlargeRing, gymsByRegion, ringContains } from './region-membership.js';

const square: LatLon[] = [
  { lat: 40, lon: -80 },
  { lat: 41, lon: -80 },
  { lat: 41, lon: -79 },
  { lat: 40, lon: -79 },
  { lat: 40, lon: -80 },
];

/** An L: the square without its north-east quarter. */
const ell: LatLon[] = [
  { lat: 40, lon: -80 },
  { lat: 41, lon: -80 },
  { lat: 41, lon: -79.5 },
  { lat: 40.5, lon: -79.5 },
  { lat: 40.5, lon: -79 },
  { lat: 40, lon: -79 },
  { lat: 40, lon: -80 },
];

describe('ringContains', () => {
  it('tells inside from outside', () => {
    expect(ringContains(square, { lat: 40.5, lon: -79.5 })).toBe(true);
    expect(ringContains(square, { lat: 40.999, lon: -79.001 })).toBe(true);
    expect(ringContains(square, { lat: 41.001, lon: -79.5 })).toBe(false);
    expect(ringContains(square, { lat: 40.5, lon: -80.001 })).toBe(false);
    expect(ringContains(square, { lat: -40.5, lon: 79.5 })).toBe(false);
  });

  it('handles an outline with a dent', () => {
    expect(ringContains(ell, { lat: 40.25, lon: -79.25 })).toBe(true);
    expect(ringContains(ell, { lat: 40.75, lon: -79.75 })).toBe(true);
    expect(ringContains(ell, { lat: 40.75, lon: -79.25 })).toBe(false);
  });

  it('gives the same answer whichever way round the outline runs', () => {
    const reversed = [...ell].reverse();
    for (const point of [
      { lat: 40.25, lon: -79.25 },
      { lat: 40.75, lon: -79.25 },
    ]) {
      expect(ringContains(reversed, point)).toBe(ringContains(ell, point));
    }
  });

  it('accepts an outline that is not closed, and contains nothing without corners', () => {
    expect(ringContains(square.slice(0, -1), { lat: 40.5, lon: -79.5 })).toBe(true);
    expect(ringContains([], { lat: 40.5, lon: -79.5 })).toBe(false);
  });
});

describe('enlargeRing', () => {
  it('blows the outline up around the middle of its corners', () => {
    expect(NEIGHBOUR_SCALE).toBe(1.5);
    expect(enlargeRing(square)).toEqual([
      { lat: 39.75, lon: -80.25 },
      { lat: 41.25, lon: -80.25 },
      { lat: 41.25, lon: -78.75 },
      { lat: 39.75, lon: -78.75 },
      { lat: 39.75, lon: -80.25 },
    ]);
  });

  it('takes another factor, and leaves the outline alone at 1', () => {
    expect(enlargeRing(square, 1)).toEqual(square);
    expect(enlargeRing(square, 2)[0]).toEqual({ lat: 39.5, lon: -80.5 });
  });

  it('does not count the closing corner twice', () => {
    const open = square.slice(0, -1);
    expect(enlargeRing(open)).toEqual(enlargeRing(square).slice(0, -1));
  });

  it('gives nothing for nothing', () => {
    expect(enlargeRing([])).toEqual([]);
  });
});

describe('gymsByRegion', () => {
  const byRegion = gymsByRegion(testRegions(), testGyms());
  const sorted = (ids: Set<number> | undefined) => [...(ids ?? [])].sort((a, b) => a - b);

  it('sorts gyms into the regions that contain them', () => {
    expect(sorted(byRegion.get(WEST_CHANNEL)?.local)).toEqual([1, 2, 3, 4, 5, 6, 11, 12]);
    expect(sorted(byRegion.get(EAST_CHANNEL)?.local)).toEqual([7, 8, 9]);
  });

  it('lists the gyms just outside a region as its neighbours', () => {
    expect(sorted(byRegion.get(WEST_CHANNEL)?.neighbouring)).toEqual([7]);
    expect(sorted(byRegion.get(EAST_CHANNEL)?.neighbouring)).toEqual([4]);
  });

  it('gives a region without an outline no gyms', () => {
    expect(byRegion.get(UNBOUNDED_CHANNEL)).toEqual({ local: new Set(), neighbouring: new Set() });
  });

  it('leaves a gym outside every region in none', () => {
    for (const membership of byRegion.values()) {
      expect(membership.local.has(10)).toBe(false);
      expect(membership.neighbouring.has(10)).toBe(false);
    }
  });

  it('puts a gym inside two overlapping regions in both', () => {
    const overlapping = [
      { channelId: 'a', bounds: square },
      { channelId: 'b', bounds: square },
    ];
    const result = gymsByRegion(overlapping, [{ id: 1, lat: 40.5, lon: -79.5 }]);
    expect(result.get('a')?.local.has(1)).toBe(true);
    expect(result.get('b')?.local.has(1)).toBe(true);
  });

  it('has an entry for every region, even without gyms', () => {
    expect([...gymsByRegion(testRegions(), []).keys()]).toEqual([
      WEST_CHANNEL,
      EAST_CHANNEL,
      UNBOUNDED_CHANNEL,
    ]);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run --project unit src/domain/geo/geodata.test.ts src/domain/geo/region-membership.test.ts`
Expected: FAIL, the two test files cannot import their modules.

- [ ] **Step 4: Write the modules**

Create `src/domain/geo/geodata.ts`. Every one of the 3,213 production rows has the shape `{"addressComponents": {…}}` with text values; the function is tolerant of anything else because the legacy code wrote the column in more than one place:

```ts
/**
 * The address parts the gym search looks at, as the legacy bot chose them from Google's
 * geocoding result. Other parts (country, county, street number) say nothing about one gym.
 */
export const ADDRESS_PARTS = [
  'intersection',
  'route',
  'neighborhood',
  'colloquial_area',
  'locality',
  'premise',
  'natural_feature',
  'postal_code',
  'bus_station',
  'establishment',
  'point_of_interest',
  'transit_station',
] as const;

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  return '';
}

/**
 * The searchable address words of a gym's stored geocoding result (`GymMeta.geodata`, a JSON
 * string holding `{ addressComponents: { route: 'Forbes Avenue', … } }`). Text that is missing,
 * is not JSON or has another shape gives an empty string: such a gym is found by its name only.
 */
export function addressText(geodata: string | null): string {
  if (!geodata) return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(geodata);
  } catch {
    return '';
  }
  if (typeof parsed !== 'object' || parsed === null) return '';
  const components = (parsed as { addressComponents?: unknown }).addressComponents;
  if (typeof components !== 'object' || components === null) return '';
  const parts = components as Record<string, unknown>;
  return ADDRESS_PARTS.map((part) => textOf(parts[part]))
    .filter((text) => text !== '')
    .join(' ');
}
```

Create `src/domain/geo/region-membership.ts`:

```ts
import type { LatLon } from './lat-lon.js';

/** How far a region reaches into its neighbours when looking for gyms: the legacy bot's factor. */
export const NEIGHBOUR_SCALE = 1.5;

/**
 * Whether the point lies inside the closed outline. Latitude and longitude are treated as flat
 * coordinates, as MySQL does for the regions' polygons. A point exactly on the outline may be
 * counted either way.
 */
export function ringContains(ring: readonly LatLon[], point: LatLon): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const crosses = a.lon > point.lon !== b.lon > point.lon;
    if (crosses && point.lat < ((b.lat - a.lat) * (point.lon - a.lon)) / (b.lon - a.lon) + a.lat) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * The outline blown up around its middle (the mean of its corners), so that it also covers the
 * edge of the neighbouring regions. The east-west stretch is not corrected for latitude; at the
 * size of a region the difference from a true scaling is a few metres.
 */
export function enlargeRing(ring: readonly LatLon[], factor = NEIGHBOUR_SCALE): LatLon[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = first && last && first.lat === last.lat && first.lon === last.lon;
  const corners = closed ? ring.slice(0, -1) : ring;
  if (corners.length === 0) return [];
  const lat = corners.reduce((sum, corner) => sum + corner.lat, 0) / corners.length;
  const lon = corners.reduce((sum, corner) => sum + corner.lon, 0) / corners.length;
  return ring.map((corner) => ({
    lat: lat + (corner.lat - lat) * factor,
    lon: lon + (corner.lon - lon) * factor,
  }));
}

/** The gyms of one region. */
export interface RegionGyms {
  /** Gyms inside the region. */
  local: Set<number>;
  /** Gyms outside it but inside the enlarged outline: the near edge of the neighbours. */
  neighbouring: Set<number>;
}

/**
 * Sorts gyms into regions, by channel id. A region without an outline has no gyms. A gym may be
 * local to several regions when their outlines overlap.
 */
export function gymsByRegion(
  regions: readonly { channelId: string; bounds: readonly LatLon[] | null }[],
  gyms: readonly { id: number; lat: number; lon: number }[],
): Map<string, RegionGyms> {
  const result = new Map<string, RegionGyms>();
  for (const region of regions) {
    const membership: RegionGyms = { local: new Set(), neighbouring: new Set() };
    result.set(region.channelId, membership);
    if (!region.bounds) continue;
    const enlarged = enlargeRing(region.bounds);
    for (const gym of gyms) {
      if (ringContains(region.bounds, gym)) membership.local.add(gym.id);
      else if (ringContains(enlarged, gym)) membership.neighbouring.add(gym.id);
    }
  }
  return result;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --project unit src/domain/geo/geodata.test.ts src/domain/geo/region-membership.test.ts`
Expected: PASS, 26 tests in 2 files.

- [ ] **Step 6: Format, check, commit**

```bash
npx prettier --write test/support/gyms.ts src/domain/geo/geodata.ts src/domain/geo/geodata.test.ts src/domain/geo/region-membership.ts src/domain/geo/region-membership.test.ts
npm run check
git add test/support/gyms.ts src/domain/geo/geodata.ts src/domain/geo/geodata.test.ts src/domain/geo/region-membership.ts src/domain/geo/region-membership.test.ts
git commit -m "Address text of a gym, gyms by region, and invented gyms for tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Gym search

**Files:**
- Create: `src/domain/search/gym-index.ts`, `src/domain/search/gym-index.test.ts`
- Create: `src/domain/search/gym-lookup.ts`, `src/domain/search/gym-lookup.test.ts`

**Interfaces:**
- Consumes: `searchTokens`, `STOP_WORDS`, `MATCH_WEIGHTS` (Task 1); `addressText`, `gymsByRegion`, `RegionGyms` (Task 3); `testGyms`, `testRegions` and the channel ids (Task 3).
- Produces:
  - `interface SearchableGym { id: number; name: string; nickname: string | null; description: string | null; keywords: readonly string[]; geodata: string | null; places: string | null }`.
  - `interface GymMatch<G> { gym: G; score: number; allWords: boolean }`; `interface GymSearchOptions { within?: ReadonlySet<number>; nameOnly?: boolean; words?: 'all' | 'any' | 'best'; limit?: number }`.
  - `class GymIndex<G extends SearchableGym> { constructor(gyms: Iterable<G>, ignoredWords?: Iterable<string>); size; get(id); all(); put(gym); remove(id): boolean; search(text, options?): GymMatch<G>[] }`.
  - `interface LocatedGym extends SearchableGym { lat: number; lon: number }`; `interface RegionOutline { channelId: string; bounds: readonly LatLon[] | null }`; `type GymPlace = 'local' | 'neighbouring' | 'anywhere'`; `interface GymHit<G> { gym: G; place: GymPlace; score: number; allWords: boolean }`; `interface GymLookupOptions { nameOnly?: boolean; limit?: number }`.
  - `class GymLookup<G extends LocatedGym> { constructor(gyms: Iterable<G>, regions: readonly RegionOutline[], ignoredWords?: Iterable<string>); size; get(id); isRegion(channelId): boolean; regionsOf(gymId): string[]; put(gym); remove(id): boolean; search(channelId: string | null, text: string, options?: GymLookupOptions): GymHit<G>[] }`.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/search/gym-index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { testGyms } from '../../../test/support/gyms.js';
import { GymIndex, type GymSearchOptions } from './gym-index.js';

const IGNORED = ['ex', 'raid', 'gym', 'sponsored'];
const index = new GymIndex(testGyms(), IGNORED);

const ids = (text: string, options?: GymSearchOptions) =>
  index.search(text, options).map((match) => match.gym.id);

describe('GymIndex: what is found', () => {
  it('finds a gym by its name, in any case and without accents or punctuation', () => {
    expect(ids('Pinewood Public Library')).toEqual([1]);
    expect(ids('pinewood public library')).toEqual([1]);
    expect(ids('st marys church')).toEqual([3]);
    expect(ids("St. Mary's")).toEqual([3]);
    expect(ids('cafe elan')).toEqual([8]);
    expect(ids('CAFÉ ÉLAN')).toEqual([8]);
  });

  it('finds a gym by one word, part of a word, or a misspelt word', () => {
    expect(ids('lighthouse')).toEqual([7]);
    expect(ids('lib')).toEqual([1]);
    expect(ids('Pinewood Public Libr')).toEqual([1]);
    expect(ids('libary')).toEqual([1]);
    expect(ids('lighthuose')).toEqual([7]);
    expect(ids('mapel')).toEqual(ids('maple'));
  });

  it('takes a single letter as a whole word only', () => {
    expect(ids('l')).toEqual([]);
    expect(ids('li')).toEqual([1, 7]);
    expect(ids('4')).toEqual([4]);
  });

  it('finds a gym by nickname, description, keyword, address, nearby place and number', () => {
    expect(ids('the stacks')).toEqual([1]);
    expect(ids('readers')).toEqual([1]);
    expect(ids('plaza')).toEqual([2]);
    expect(ids('church lane')).toEqual([3]);
    expect(ids('old town')).toEqual([1]);
    expect(ids('luna')).toEqual([2]);
    expect(ids('10')).toEqual([10]);
  });

  it('wants every word, each in any field', () => {
    expect(ids('starbucks')).toEqual([5, 9]);
    expect(ids('starbucks harbor')).toEqual([9]);
    expect(ids('starbucks maple')).toEqual([5]);
    expect(ids('fountain plaza')).toEqual([2]);
  });

  it('gives guesses, marked as such, only when no gym has every word', () => {
    const guesses = index.search('library zzz');
    expect(guesses.map((match) => [match.gym.id, match.allWords])).toEqual([[1, false]]);
    expect(index.search('library').map((match) => match.allWords)).toEqual([true]);
    expect(ids('library zzz', { words: 'all' })).toEqual([]);
    expect(ids('starbucks harbor', { words: 'any' })).toEqual(expect.arrayContaining([5, 7, 8, 9]));
    expect(ids('zzz')).toEqual([]);
  });

  it('does not search the notice', () => {
    expect(ids('dusk')).toEqual([]);
  });
});

describe('GymIndex: ignored words', () => {
  it('ignores the configured words and common words in what is typed', () => {
    expect(ids('the library gym')).toEqual([1]);
    expect(ids('post office gym')).toEqual([12]);
    expect(ids('raid at the library')).toEqual([1]);
  });

  it('gives nothing when only ignored words are typed', () => {
    for (const text of ['gym', 'raid', 'the', 'the gym', '', '?!']) {
      expect(ids(text), text).toEqual([]);
    }
  });

  it('ignores them in the gyms too', () => {
    // Gym 5 is described as "Sponsored gym".
    expect(ids('sponsored')).toEqual([]);
    expect(new GymIndex(testGyms()).search('sponsored').map((match) => match.gym.id)).toEqual([5]);
  });
});

describe('GymIndex: order', () => {
  it('puts a match in the name before one in the description', () => {
    expect(ids('mural')).toEqual([7, 1]);
  });

  it('puts a match in the name before one in the address', () => {
    // Gym 6 is the Maple Leaf Mosaic; gyms 1 and 5 are on Maple Avenue.
    expect(ids('maple')).toEqual([6, 1, 5]);
  });

  it('puts the exact word before a longer word and a misspelling', () => {
    const gyms = [
      { ...testGyms()[0]!, id: 1, name: 'Parkway Diner', nickname: null, description: null },
      { ...testGyms()[0]!, id: 2, name: 'Park Diner', nickname: null, description: null },
      { ...testGyms()[0]!, id: 3, name: 'Perk Diner', nickname: null, description: null },
    ].map((gym) => ({ ...gym, geodata: null, places: null }));
    const diners = new GymIndex(gyms);
    expect(diners.search('park').map((match) => match.gym.id)).toEqual([2, 1, 3]);
  });

  it('breaks ties by the lower id', () => {
    expect(ids('starbucks')).toEqual([5, 9]);
    expect(index.search('starbucks')[0]?.score).toBeGreaterThan(0);
  });
});

describe('GymIndex: options', () => {
  it('looks only at the gyms it is told to', () => {
    expect(ids('starbucks', { within: new Set([9, 8]) })).toEqual([9]);
    expect(ids('starbucks', { within: new Set() })).toEqual([]);
  });

  it('looks only at names and keywords when asked', () => {
    expect(ids('mural', { nameOnly: true })).toEqual([7]);
    expect(ids('plaza', { nameOnly: true })).toEqual([2]);
    expect(ids('luna', { nameOnly: true })).toEqual([]);
    expect(ids('the stacks', { nameOnly: true })).toEqual([]);
  });

  it('limits the matches', () => {
    expect(ids('pinewood', { limit: 2 })).toHaveLength(2);
    expect(ids('starbucks', { limit: 1 })).toEqual([5]);
  });
});

describe('GymIndex: changes', () => {
  it('adds, replaces and removes gyms', () => {
    const own = new GymIndex(testGyms(), IGNORED);
    const library = own.get(1);
    if (!library) throw new Error('The fixture has no gym 1');
    expect(own.size).toBe(12);

    own.put({ ...library, name: 'Pinewood Reading Room' });
    expect(own.size).toBe(12);
    expect(own.search('reading room').map((match) => match.gym.id)).toEqual([1]);
    expect(own.search('public library')).toEqual([]);
    expect(own.get(1)?.name).toBe('Pinewood Reading Room');

    own.put({ ...library, id: 99, name: 'Clock Tower' });
    expect(own.size).toBe(13);
    expect(own.search('clock').map((match) => match.gym.id)).toEqual([99]);

    expect(own.remove(99)).toBe(true);
    expect(own.remove(99)).toBe(false);
    expect(own.search('clock')).toEqual([]);
    expect(own.get(99)).toBeUndefined();
    expect(own.all().map((gym) => gym.id)).toHaveLength(12);
  });

  it('starts empty and answers nothing', () => {
    const empty = new GymIndex([]);
    expect(empty.size).toBe(0);
    expect(empty.search('library')).toEqual([]);
  });
});
```

Create `src/domain/search/gym-lookup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  EAST_CHANNEL,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  testGyms,
  testRegions,
} from '../../../test/support/gyms.js';
import { GymLookup, type GymLookupOptions } from './gym-lookup.js';

const IGNORED = ['ex', 'raid', 'gym', 'sponsored'];
const lookup = new GymLookup(testGyms(), testRegions(), IGNORED);

/** Hits as `<gym id><first letter of the place>`, with `?` for a guess: `5l`, `7n`, `1a?`. */
const hits = (channelId: string | null, text: string, options?: GymLookupOptions) =>
  lookup
    .search(channelId, text, options)
    .map((hit) => `${hit.gym.id}${hit.place[0] ?? ''}${hit.allWords ? '' : '?'}`);

describe('GymLookup: regions', () => {
  it('knows which channels are regions', () => {
    expect(lookup.isRegion(WEST_CHANNEL)).toBe(true);
    expect(lookup.isRegion(EAST_CHANNEL)).toBe(true);
    expect(lookup.isRegion(UNBOUNDED_CHANNEL)).toBe(false);
    expect(lookup.isRegion('999')).toBe(false);
  });

  it('knows the regions a gym lies in', () => {
    expect(lookup.regionsOf(1)).toEqual([WEST_CHANNEL]);
    expect(lookup.regionsOf(7)).toEqual([EAST_CHANNEL]);
    expect(lookup.regionsOf(10)).toEqual([]);
    expect(lookup.regionsOf(12345)).toEqual([]);
  });

  it('gives gyms by id', () => {
    expect(lookup.get(8)?.name).toBe('Café Élan Fresco');
    expect(lookup.get(12345)).toBeUndefined();
    expect(lookup.size).toBe(12);
  });
});

describe('GymLookup: searching from a region channel', () => {
  it('finds the gyms of the region', () => {
    expect(hits(WEST_CHANNEL, 'library')).toEqual(['1l']);
    expect(hits(WEST_CHANNEL, 'starbucks')).toEqual(['5l']);
    expect(hits(EAST_CHANNEL, 'starbucks')).toEqual(['9l']);
  });

  it('adds the gyms just across the border, after the region’s own', () => {
    expect(hits(WEST_CHANNEL, 'mural')).toEqual(['1l', '7n']);
    expect(hits(WEST_CHANNEL, 'lighthouse')).toEqual(['7n']);
    expect(hits(EAST_CHANNEL, 'bridge')).toEqual(['4n']);
    expect(hits(WEST_CHANNEL, 'bridge')).toEqual(['4l']);
  });

  it('does not find gyms further away', () => {
    expect(hits(EAST_CHANNEL, 'library')).toEqual([]);
    expect(hits(WEST_CHANNEL, 'fresco')).toEqual([]);
    expect(hits(WEST_CHANNEL, 'trailhead')).toEqual([]);
  });

  it('prefers a gym across the border that has every word to a guess at home', () => {
    // West has a Starbucks but nothing on Harbor Street; the lighthouse is on it, across the border.
    expect(hits(WEST_CHANNEL, 'harbor lighthouse')).toEqual(['7n']);
    expect(hits(WEST_CHANNEL, 'starbucks harbor')).toEqual(['5l?', '7n?']);
  });
});

describe('GymLookup: searching from elsewhere', () => {
  it('looks at all gyms without a channel', () => {
    expect(hits(null, 'starbucks')).toEqual(['5a', '9a']);
    expect(hits(null, 'trailhead')).toEqual(['10a']);
    expect(hits(null, 'mural')).toEqual(['7a', '1a']);
  });

  it('looks at all gyms from a channel that is not a region with an outline', () => {
    expect(hits(UNBOUNDED_CHANNEL, 'library')).toEqual(['1a']);
    expect(hits('999', 'library')).toEqual(['1a']);
  });

  it('marks guesses', () => {
    expect(hits(null, 'library zzz')).toEqual(['1a?']);
    expect(hits(null, 'zzz')).toEqual([]);
    expect(hits(null, '')).toEqual([]);
  });
});

describe('GymLookup: options', () => {
  it('passes on name-only searching', () => {
    expect(hits(WEST_CHANNEL, 'mural', { nameOnly: true })).toEqual(['7n']);
    expect(hits(null, 'luna', { nameOnly: true })).toEqual([]);
  });

  it('limits the hits over both places together', () => {
    expect(hits(WEST_CHANNEL, 'mural', { limit: 1 })).toEqual(['1l']);
    expect(hits(WEST_CHANNEL, 'pinewood', { limit: 3 })).toHaveLength(3);
  });
});

describe('GymLookup: changes', () => {
  it('sorts a new gym into its regions', () => {
    const own = new GymLookup(testGyms(), testRegions(), IGNORED);
    const template = testGyms()[0];
    if (!template) throw new Error('The fixture is empty');
    own.put({ ...template, id: 50, name: 'Clock Tower', lat: 40.05, lon: -79.95 });
    expect(own.regionsOf(50)).toEqual([EAST_CHANNEL]);
    expect(own.search(EAST_CHANNEL, 'clock').map((hit) => hit.place)).toEqual(['local']);
    expect(own.search(WEST_CHANNEL, 'clock')).toEqual([]);
  });

  it('moves a gym that changed place', () => {
    const own = new GymLookup(testGyms(), testRegions(), IGNORED);
    const library = own.get(1);
    if (!library) throw new Error('The fixture has no gym 1');
    own.put({ ...library, lon: -79.99 });
    expect(own.regionsOf(1)).toEqual([EAST_CHANNEL]);
    expect(own.search(WEST_CHANNEL, 'library').map((hit) => hit.place)).toEqual(['neighbouring']);
    own.put({ ...library, lat: 45 });
    expect(own.regionsOf(1)).toEqual([]);
    expect(own.search(WEST_CHANNEL, 'library')).toEqual([]);
    expect(own.search(null, 'library')).toHaveLength(1);
  });

  it('forgets a removed gym', () => {
    const own = new GymLookup(testGyms(), testRegions(), IGNORED);
    expect(own.remove(7)).toBe(true);
    expect(own.remove(7)).toBe(false);
    expect(own.get(7)).toBeUndefined();
    expect(own.regionsOf(7)).toEqual([]);
    expect(own.search(WEST_CHANNEL, 'lighthouse')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --project unit src/domain/search/gym-index.test.ts src/domain/search/gym-lookup.test.ts`
Expected: FAIL, the two test files cannot import their modules.

- [ ] **Step 3: Write the index**

Create `src/domain/search/gym-index.ts`. The field weights were tuned on the production gyms (see "Decisions", item 2); do not change them without measuring again:

```ts
import MiniSearch from 'minisearch';
import { addressText } from '../geo/geodata.js';
import { MATCH_WEIGHTS, STOP_WORDS, searchTokens } from './text.js';

/** What the search needs to know of a gym (`Gym` of the gym repository has all of it). */
export interface SearchableGym {
  id: number;
  name: string;
  nickname: string | null;
  description: string | null;
  keywords: readonly string[];
  /** Stored geocoding result, a JSON string (see `addressText`). */
  geodata: string | null;
  /** Names of places near the gym. */
  places: string | null;
}

export interface GymMatch<G> {
  gym: G;
  /** Higher is better; comparable only within one search. */
  score: number;
  /** False when the gym has only some of the words typed. */
  allWords: boolean;
}

export interface GymSearchOptions {
  /** Look only at these gyms (a region's). Default: all. */
  within?: ReadonlySet<number>;
  /** Look only at names and keywords: for text read from a screenshot. */
  nameOnly?: boolean;
  /**
   * `all`: every word must match. `any`: one is enough. `best` (the default): every word, and
   * only when no gym has them all, any.
   */
  words?: 'all' | 'any' | 'best';
  /** At most this many matches. Default: all. */
  limit?: number;
}

interface GymDocument {
  id: number;
  name: string;
  nickname: string;
  description: string;
  keywords: string;
  address: string;
  places: string;
  number: string;
}

type Field = Exclude<keyof GymDocument, 'id'>;

const FIELDS: readonly Field[] = [
  'name',
  'nickname',
  'description',
  'keywords',
  'address',
  'places',
  'number',
];
const NAME_FIELDS: readonly Field[] = ['name', 'keywords'];

/**
 * How much a match in each field counts. Tuned on the production gyms of 2026-10 so that a gym
 * searched by its own name comes first: the texts of nearby places repeat the names of other
 * gyms, so they count least.
 */
const FIELD_WEIGHTS: Readonly<Partial<Record<Field, number>>> = {
  name: 8,
  nickname: 8,
  keywords: 3,
  description: 2,
  places: 0.5,
};

/**
 * Gym names are everyday words, so the search forgives more than `allowedTypos`: two wrong
 * letters from five letters on, which covers two letters typed in the wrong order ("mapel").
 */
function typos(term: string): number {
  if (term.length <= 3) return 0;
  return term.length === 4 ? 1 : 2;
}

function toDocument(gym: SearchableGym): GymDocument {
  return {
    id: gym.id,
    name: gym.name,
    nickname: gym.nickname ?? '',
    description: gym.description ?? '',
    keywords: gym.keywords.join(' '),
    address: addressText(gym.geodata),
    places: gym.places ?? '',
    number: String(gym.id),
  };
}

/**
 * Finds gyms by what members type. It is lenient on purpose: a word of two letters or more may
 * be the beginning of a longer one, a longer word may be slightly misspelt, and it may match the name, nickname, description, keywords,
 * address, nearby places or the gym's number. Matches in the name and nickname count most, exact
 * words more than beginnings and misspellings, so the best fit comes first and the member picks.
 * Every word must match something; only when no gym has them all, gyms with some of them are
 * returned (see `GymSearchOptions.words`). Words in `ignoredWords` (settings.blacklistWords: "gym", "raid", …) and common
 * English words are ignored, both in the gyms' texts and in what is typed.
 */
export class GymIndex<G extends SearchableGym> {
  private readonly index: MiniSearch<GymDocument>;
  private readonly gyms = new Map<number, G>();

  constructor(gyms: Iterable<G>, ignoredWords: Iterable<string> = []) {
    const ignored = new Set([...STOP_WORDS, ...[...ignoredWords].flatMap(searchTokens)]);
    this.index = new MiniSearch<GymDocument>({
      fields: [...FIELDS],
      tokenize: searchTokens,
      processTerm: (term) => (ignored.has(term) ? null : term),
    });
    for (const gym of gyms) this.put(gym);
  }

  get size(): number {
    return this.gyms.size;
  }

  get(id: number): G | undefined {
    return this.gyms.get(id);
  }

  all(): G[] {
    return [...this.gyms.values()];
  }

  /** Adds a gym, or replaces the one with the same id. */
  put(gym: G): void {
    const document = toDocument(gym);
    if (this.gyms.has(gym.id)) this.index.replace(document);
    else this.index.add(document);
    this.gyms.set(gym.id, gym);
  }

  /** Returns false when there was no such gym. */
  remove(id: number): boolean {
    if (!this.gyms.delete(id)) return false;
    this.index.discard(id);
    return true;
  }

  /** Best match first; ties go to the lower id. Empty when no word is left to search by. */
  search(text: string, options: GymSearchOptions = {}): GymMatch<G>[] {
    const { within, limit, words = 'best' } = options;
    const attempts: readonly ('AND' | 'OR')[] =
      words === 'best' ? ['AND', 'OR'] : [words === 'all' ? 'AND' : 'OR'];
    for (const combineWith of attempts) {
      const found = this.index
        .search(text, {
          fields: [...(options.nameOnly ? NAME_FIELDS : FIELDS)],
          combineWith,
          boost: { ...FIELD_WEIGHTS },
          // A single letter begins too many words to mean anything, and is slow to look up.
          prefix: (term) => term.length > 1,
          fuzzy: typos,
          weights: { ...MATCH_WEIGHTS },
          filter: within ? (result) => within.has(result.id as number) : undefined,
        })
        .sort((a, b) => b.score - a.score || (a.id as number) - (b.id as number));
      if (found.length === 0) continue;
      const matches: GymMatch<G>[] = [];
      for (const result of limit === undefined ? found : found.slice(0, limit)) {
        const gym = this.gyms.get(result.id as number);
        if (gym) matches.push({ gym, score: result.score, allWords: combineWith === 'AND' });
      }
      return matches;
    }
    return [];
  }
}
```

- [ ] **Step 4: Write the lookup**

Create `src/domain/search/gym-lookup.ts`:

```ts
import type { LatLon } from '../geo/lat-lon.js';
import { gymsByRegion, type RegionGyms } from '../geo/region-membership.js';
import { GymIndex, type SearchableGym } from './gym-index.js';

/** What the lookup needs to know of a gym (`Gym` of the gym repository has all of it). */
export interface LocatedGym extends SearchableGym {
  lat: number;
  lon: number;
}

/** What the lookup needs to know of a region (`Region` of the region repository has it). */
export interface RegionOutline {
  channelId: string;
  bounds: readonly LatLon[] | null;
}

/** Where a found gym lies, seen from the channel the search was made in. */
export type GymPlace = 'local' | 'neighbouring' | 'anywhere';

export interface GymHit<G> {
  gym: G;
  place: GymPlace;
  /** Higher is better; comparable only among hits of one place of one search. */
  score: number;
  /** False when the gym has only some of the words typed: a guess, not a match. */
  allWords: boolean;
}

export interface GymLookupOptions {
  /** Look only at names and keywords: for text read from a screenshot. */
  nameOnly?: boolean;
  /** At most this many hits. Default: all. */
  limit?: number;
}

/**
 * The gyms, indexed for searching and sorted into regions.
 *
 * A search from a region channel gives that region's gyms first, then gyms just outside it (the
 * near edge of its neighbours, see `gymsByRegion`); a gym further away is not found from there.
 * A search from any other channel, or from none, looks at all gyms. Gyms that have every word
 * typed come before any gym that has only some, wherever they lie; the guesses are given only
 * when there is no real match.
 */
export class GymLookup<G extends LocatedGym> {
  private readonly index: GymIndex<G>;
  private readonly byRegion: Map<string, RegionGyms>;

  constructor(
    gyms: Iterable<G>,
    private readonly regions: readonly RegionOutline[],
    ignoredWords: Iterable<string> = [],
  ) {
    this.index = new GymIndex(gyms, ignoredWords);
    this.byRegion = gymsByRegion(regions, this.index.all());
  }

  get size(): number {
    return this.index.size;
  }

  get(id: number): G | undefined {
    return this.index.get(id);
  }

  /** Whether the channel is a region with an outline. */
  isRegion(channelId: string): boolean {
    return this.regions.some((region) => region.channelId === channelId && region.bounds !== null);
  }

  /** Channel ids of the regions the gym lies in; empty when it lies in none. */
  regionsOf(gymId: number): string[] {
    return [...this.byRegion]
      .filter(([, membership]) => membership.local.has(gymId))
      .map(([channelId]) => channelId);
  }

  /** Adds a gym or replaces the one with the same id, and sorts it into the regions. */
  put(gym: G): void {
    this.forget(gym.id);
    this.index.put(gym);
    for (const [channelId, membership] of gymsByRegion(this.regions, [gym])) {
      const known = this.byRegion.get(channelId);
      if (membership.local.has(gym.id)) known?.local.add(gym.id);
      if (membership.neighbouring.has(gym.id)) known?.neighbouring.add(gym.id);
    }
  }

  /** Returns false when there was no such gym. */
  remove(id: number): boolean {
    this.forget(id);
    return this.index.remove(id);
  }

  private forget(id: number): void {
    for (const membership of this.byRegion.values()) {
      membership.local.delete(id);
      membership.neighbouring.delete(id);
    }
  }

  search(channelId: string | null, text: string, options: GymLookupOptions = {}): GymHit<G>[] {
    const { nameOnly, limit } = options;
    const membership =
      channelId !== null && this.isRegion(channelId) ? this.byRegion.get(channelId) : undefined;
    const places: [GymPlace, ReadonlySet<number> | undefined][] = membership
      ? [
          ['local', membership.local],
          ['neighbouring', membership.neighbouring],
        ]
      : [['anywhere', undefined]];
    for (const words of ['all', 'any'] as const) {
      const hits = places.flatMap(([place, within]) =>
        this.index
          .search(text, { nameOnly, within, words })
          .map(({ gym, score, allWords }) => ({ gym, place, score, allWords })),
      );
      if (hits.length > 0) return limit === undefined ? hits : hits.slice(0, limit);
    }
    return [];
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --project unit src/domain/search`
Expected: PASS, all files of the folder (the two of Task 1 and the two new ones).

- [ ] **Step 6: Format, check, commit**

```bash
npx prettier --write src/domain/search
npm run check
git add src/domain/search/gym-index.ts src/domain/search/gym-index.test.ts src/domain/search/gym-lookup.ts src/domain/search/gym-lookup.test.ts
git commit -m "Gym search: a lenient index, and a lookup that knows the regions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Image cache and static maps

**Files:**
- Create: `src/domain/geo/polyline.ts`, `src/domain/geo/static-map.ts`, `src/domain/geo/static-map.test.ts`
- Create: `src/services/image-cache.ts`, `src/services/image-cache.test.ts`
- Create: `src/services/static-maps.ts`, `src/services/static-maps.test.ts`

**Interfaces:**
- Consumes: `LatLon`; `failureReason` (`src/services/failure-reason.ts`); `Logger` (`src/log.ts`); `createTestLogger` (`test/support/test-logger.ts`); `testRegions`, `WEST_CHANNEL` (Task 3).
- Produces:
  - `encodePolyline(points: readonly LatLon[]): string`.
  - `STATIC_MAP_ENDPOINT`; `interface MapPath { points: readonly LatLon[]; fill?: boolean }`; `interface StaticMap { markers?: readonly LatLon[]; paths?: readonly MapPath[]; zoom?: number }`; `staticMapQuery(map: StaticMap): string`; `gymMap(gym: LatLon): StaticMap`; `regionMap(bounds: readonly LatLon[]): StaticMap`.
  - `interface ImageResponse { ok: boolean; status: number; headers: { get(name: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> }`; `type FetchImage = (url: string, init: { signal: AbortSignal }) => Promise<ImageResponse>`; `interface ImageCacheOptions { dir: string; fetch: FetchImage; log: Logger; timeoutMs?: number; maxBytes?: number }`; `interface ImageRequest { folder: string; id: string; variant: string; url: string; refuse?: (response: ImageResponse) => string | undefined }`.
  - `class ImageCache { constructor(options: ImageCacheOptions); get(request: ImageRequest): Promise<string | undefined>; clear(folder?: string): Promise<number> }`.
  - `interface MapProvider { readonly enabled: boolean; gym(gym: { id: number; lat: number; lon: number }): Promise<string | undefined>; region(region: { id: number; bounds: readonly LatLon[] | null }): Promise<string | undefined> }`; `class StaticMaps implements MapProvider { constructor(apiKey: string | undefined, cache: ImageCache) }`.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/geo/static-map.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { encodePolyline } from './polyline.js';
import { STATIC_MAP_ENDPOINT, gymMap, regionMap, staticMapQuery } from './static-map.js';

const square = [
  { lat: 40, lon: -80.1 },
  { lat: 40.1, lon: -80.1 },
  { lat: 40.1, lon: -80 },
  { lat: 40, lon: -80 },
  { lat: 40, lon: -80.1 },
];

describe('encodePolyline', () => {
  it('encodes the example of Google’s documentation', () => {
    expect(
      encodePolyline([
        { lat: 38.5, lon: -120.2 },
        { lat: 40.7, lon: -120.95 },
        { lat: 43.252, lon: -126.453 },
      ]),
    ).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('encodes a single point, the origin and nothing', () => {
    expect(encodePolyline([{ lat: 38.5, lon: -120.2 }])).toBe('_p~iF~ps|U');
    expect(encodePolyline([{ lat: 0, lon: 0 }])).toBe('??');
    expect(encodePolyline([])).toBe('');
  });

  it('rounds to five decimal places', () => {
    expect(encodePolyline([{ lat: 38.500004, lon: -120.200004 }])).toBe('_p~iF~ps|U');
  });
});

describe('staticMapQuery', () => {
  const params = (query: string) => new URLSearchParams(query);

  it('asks for a 640×320 picture at double resolution', () => {
    const query = params(staticMapQuery({}));
    expect(Object.fromEntries(query)).toEqual({ size: '640x320', scale: '2', format: 'png' });
  });

  it('describes a gym as a small red pin at street level', () => {
    const query = params(staticMapQuery(gymMap({ lat: 40.05, lon: -80.05 })));
    expect(query.get('zoom')).toBe('15');
    expect(query.get('markers')).toBe('size:small|color:red|40.05,-80.05');
    expect(query.has('path')).toBe(false);
  });

  it('describes a region as a shaded outline and lets Google fit the map', () => {
    const query = params(staticMapQuery(regionMap(square)));
    expect(query.get('path')).toBe(
      `fillcolor:0xAA000033|color:red|weight:2|enc:${encodePolyline(square)}`,
    );
    expect(query.has('zoom')).toBe(false);
    expect(query.has('markers')).toBe(false);
  });

  it('draws several paths and pins, a line without shading', () => {
    const query = params(
      staticMapQuery({
        markers: [
          { lat: 1, lon: 2 },
          { lat: 3, lon: 4 },
        ],
        paths: [{ points: square }, { points: square, fill: true }],
      }),
    );
    expect(query.get('markers')).toBe('size:small|color:red|1,2|3,4');
    expect(query.getAll('path')).toEqual([
      `color:red|weight:2|enc:${encodePolyline(square)}`,
      `fillcolor:0xAA000033|color:red|weight:2|enc:${encodePolyline(square)}`,
    ]);
  });

  it('is the same text for the same map, and holds no key', () => {
    expect(staticMapQuery(gymMap({ lat: 40.05, lon: -80.05 }))).toBe(
      staticMapQuery(gymMap({ lat: 40.05, lon: -80.05 })),
    );
    expect(staticMapQuery(gymMap({ lat: 40.05, lon: -80.05 }))).not.toBe(
      staticMapQuery(gymMap({ lat: 40.06, lon: -80.05 })),
    );
    expect(staticMapQuery(regionMap(square))).not.toContain('key=');
  });

  it('stays within the length Google accepts for the largest outline in production', () => {
    // 74 corners is the largest region of the production data of 2026-10; the limit is 16,384.
    const outline = Array.from({ length: 74 }, (_, i) => ({
      lat: 40 + Math.sin(i) * 0.3,
      lon: -80 + Math.cos(i) * 0.3,
    }));
    expect(`${STATIC_MAP_ENDPOINT}?${staticMapQuery(regionMap(outline))}`.length).toBeLessThan(
      2000,
    );
  });
});
```

Create `src/services/image-cache.test.ts`. It writes into a temporary folder and never downloads anything:

```ts
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import {
  ImageCache,
  type FetchImage,
  type ImageRequest,
  type ImageResponse,
} from './image-cache.js';

const SECRET_URL = 'https://maps.example/staticmap?size=1&key=SECRET-KEY';

function response(
  body: Uint8Array | string = 'png-bytes',
  init: { status?: number; headers?: Record<string, string> } = {},
): ImageResponse {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  const headers: Record<string, string> = { 'content-type': 'image/png', ...init.headers };
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    arrayBuffer: () =>
      Promise.resolve(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      ),
  };
}

let dir: string;
let calls: string[];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'pine-images-'));
  calls = [];
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function cacheWith(answer: FetchImage, options: { timeoutMs?: number; maxBytes?: number } = {}) {
  const { log, entries } = createTestLogger();
  const fetch: FetchImage = (url, init) => {
    calls.push(url);
    return answer(url, init);
  };
  return { cache: new ImageCache({ dir, fetch, log, ...options }), entries };
}

const request = (more: Partial<ImageRequest> = {}): ImageRequest => ({
  folder: 'gyms',
  id: '12',
  variant: 'zoom=15&markers=1,2',
  url: SECRET_URL,
  ...more,
});

describe('ImageCache.get', () => {
  it('downloads a picture once and serves it from disk afterwards', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response('first')));
    const file = await cache.get(request());
    expect(file).toBeDefined();
    expect(path.dirname(file ?? '')).toBe(path.resolve(dir, 'gyms'));
    expect(path.basename(file ?? '')).toMatch(/^12\.[0-9a-f]{12}\.png$/);
    expect(await readFile(file ?? '', 'utf8')).toBe('first');
    expect(await cache.get(request())).toBe(file);
    expect(calls).toHaveLength(1);
  });

  it('serves a picture saved by an earlier run', async () => {
    const first = cacheWith(() => Promise.resolve(response()));
    const file = await first.cache.get(request());
    const second = cacheWith(() => Promise.reject(new Error('must not download')));
    expect(await second.cache.get(request())).toBe(file);
  });

  it('shares one download between requests made at the same time', async () => {
    let release: (value: ImageResponse) => void = () => undefined;
    const { cache } = cacheWith(
      () =>
        new Promise<ImageResponse>((resolve) => {
          release = resolve;
        }),
    );
    const both = Promise.all([cache.get(request()), cache.get(request())]);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    release(response());
    const [a, b] = await both;
    expect(a).toBeDefined();
    expect(a).toBe(b);
    expect(calls).toHaveLength(1);
  });

  it('downloads a new variant and deletes the old one, leaving other pictures alone', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response()));
    const other = await cache.get(request({ id: '120' }));
    const old = await cache.get(request());
    const moved = await cache.get(request({ variant: 'zoom=15&markers=3,4' }));
    expect(moved).not.toBe(old);
    expect((await readdir(path.join(dir, 'gyms'))).sort()).toEqual(
      [path.basename(other ?? ''), path.basename(moved ?? '')].sort(),
    );
  });

  it('keeps pictures of different folders apart', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response()));
    const gym = await cache.get(request());
    const region = await cache.get(request({ folder: 'regions' }));
    expect(path.dirname(region ?? '')).toBe(path.resolve(dir, 'regions'));
    expect(gym).not.toBe(region);
    expect(calls).toHaveLength(2);
  });

  it('replaces an empty file left by a crash', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response('good')));
    const file = (await cache.get(request())) ?? '';
    await writeFile(file, '');
    expect(await cache.get(request())).toBe(file);
    expect(await readFile(file, 'utf8')).toBe('good');
    expect(calls).toHaveLength(2);
  });

  it.each([
    ['a failed request', () => Promise.reject(new TypeError('fetch failed')), /fetch failed/],
    ['an error status', () => Promise.resolve(response('', { status: 403 })), /answered 403/],
    [
      'something that is not a picture',
      () => Promise.resolve(response('<html>', { headers: { 'content-type': 'text/html' } })),
      /text\/html, not a picture/,
    ],
    ['an empty picture', () => Promise.resolve(response('')), /empty/],
    [
      'a picture announced as too large',
      () => Promise.resolve(response('x', { headers: { 'content-length': '999999' } })),
      /too large/,
    ],
    [
      'a picture that turns out too large',
      () => Promise.resolve(response('x'.repeat(2000))),
      /too large/,
    ],
  ] as [string, FetchImage, RegExp][])(
    'answers undefined and saves nothing after %s',
    async (_what, answer, reason) => {
      const { cache, entries } = cacheWith(answer, { maxBytes: 1000 });
      expect(await cache.get(request())).toBeUndefined();
      expect(await readdir(dir)).toEqual([]);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ level: 40, folder: 'gyms', id: '12' });
      expect(String(entries[0]?.reason)).toMatch(reason);
    },
  );

  it('tries again after a failure', async () => {
    let attempt = 0;
    const { cache } = cacheWith(() =>
      ++attempt === 1 ? Promise.reject(new Error('down')) : Promise.resolve(response()),
    );
    expect(await cache.get(request())).toBeUndefined();
    expect(await cache.get(request())).toBeDefined();
  });

  it('gives up on a download that takes too long', async () => {
    const { cache, entries } = cacheWith(
      (_url, init) =>
        new Promise<ImageResponse>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      { timeoutMs: 20 },
    );
    expect(await cache.get(request())).toBeUndefined();
    expect(String(entries[0]?.reason)).toBe('timed out after 20 ms');
  });

  it('lets the caller refuse a response', async () => {
    const { cache, entries } = cacheWith(() =>
      Promise.resolve(response('error picture', { headers: { 'x-warning': 'over quota' } })),
    );
    const refuse = (answer: ImageResponse) => answer.headers.get('x-warning') ?? undefined;
    expect(await cache.get(request({ refuse }))).toBeUndefined();
    expect(entries[0]?.reason).toBe('over quota');
    expect(await readdir(dir)).toEqual([]);
  });

  it('never logs the address, not even when the failure quotes it', async () => {
    const { cache, entries } = cacheWith(() =>
      Promise.reject(new Error(`request to ${SECRET_URL} failed`)),
    );
    expect(await cache.get(request())).toBeUndefined();
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toContain('SECRET-KEY');
    expect(entries[0]?.reason).toBe('request to (address) failed');
  });

  it('keeps the variant out of the file name', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response()));
    const file = await cache.get(request({ variant: '../../etc/passwd?key=abc' }));
    expect(path.dirname(file ?? '')).toBe(path.resolve(dir, 'gyms'));
    expect(path.basename(file ?? '')).toMatch(/^12\.[0-9a-f]{12}\.png$/);
  });

  it.each([
    ['folder', { folder: '../gyms' }],
    ['folder', { folder: 'Gyms' }],
    ['folder', { folder: '' }],
    ['id', { id: '../12' }],
    ['id', { id: '1/2' }],
    ['id', { id: '12.png' }],
    ['id', { id: '' }],
  ] as [string, Partial<ImageRequest>][])(
    'refuses a %s that is not a plain name',
    (_what, more) => {
      const { cache } = cacheWith(() => Promise.resolve(response()));
      expect(() => cache.get(request(more))).toThrow(RangeError);
      expect(calls).toEqual([]);
    },
  );
});

describe('ImageCache.clear', () => {
  it('deletes the pictures of one folder or of all', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response()));
    await cache.get(request());
    await cache.get(request({ id: '13' }));
    await cache.get(request({ folder: 'regions' }));
    await writeFile(path.join(dir, 'gyms', 'notes.txt'), 'kept');

    expect(await cache.clear('gyms')).toBe(2);
    expect(await readdir(path.join(dir, 'gyms'))).toEqual(['notes.txt']);
    expect(await readdir(path.join(dir, 'regions'))).toHaveLength(1);

    expect(await cache.clear()).toBe(1);
    expect(await readdir(path.join(dir, 'regions'))).toEqual([]);
    expect(await cache.clear()).toBe(0);
  });

  it('answers 0 when nothing was ever cached, and refuses a folder that is not a plain name', async () => {
    const { log } = createTestLogger();
    const cache = new ImageCache({
      dir: path.join(dir, 'missing'),
      fetch: () => Promise.reject(new Error('unused')),
      log,
    });
    expect(await cache.clear()).toBe(0);
    expect(await cache.clear('gyms')).toBe(0);
    await expect(cache.clear('../gyms')).rejects.toThrow(RangeError);
  });

  it('downloads again after clearing', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response()));
    await cache.get(request());
    await cache.clear();
    expect(await cache.get(request())).toBeDefined();
    expect(calls).toHaveLength(2);
  });
});
```

Create `src/services/static-maps.test.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WEST_CHANNEL, testRegions } from '../../test/support/gyms.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { ImageCache, type ImageResponse } from './image-cache.js';
import { StaticMaps } from './static-maps.js';

let dir: string;
let urls: string[];
let headers: Record<string, string>;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'pine-maps-'));
  urls = [];
  headers = { 'content-type': 'image/png' };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function maps(apiKey: string | undefined) {
  const { log, entries } = createTestLogger();
  const cache = new ImageCache({
    dir,
    log,
    fetch: (url) => {
      urls.push(url);
      const answer: ImageResponse = {
        ok: true,
        status: 200,
        headers: { get: (name) => headers[name.toLowerCase()] ?? null },
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode('png').buffer),
      };
      return Promise.resolve(answer);
    },
  });
  return { maps: new StaticMaps(apiKey, cache), entries };
}

const west = () => {
  const region = testRegions().find((candidate) => candidate.channelId === WEST_CHANNEL);
  if (!region) throw new Error('The fixture has no west region');
  return region;
};

describe('StaticMaps', () => {
  it('downloads the map of a gym with the key and keeps it', async () => {
    const { maps: service } = maps('test key/1');
    expect(service.enabled).toBe(true);
    const file = await service.gym({ id: 12, lat: 40.05, lon: -80.05 });
    expect(path.dirname(file ?? '')).toBe(path.resolve(dir, 'gyms'));
    expect(path.basename(file ?? '')).toMatch(/^12\.[0-9a-f]{12}\.png$/);
    expect(urls).toHaveLength(1);
    const url = new URL(urls[0] ?? '');
    expect(url.origin + url.pathname).toBe('https://maps.googleapis.com/maps/api/staticmap');
    expect(url.searchParams.get('key')).toBe('test key/1');
    expect(url.searchParams.get('markers')).toBe('size:small|color:red|40.05,-80.05');

    expect(await service.gym({ id: 12, lat: 40.05, lon: -80.05 })).toBe(file);
    expect(urls).toHaveLength(1);
  });

  it('downloads a new map when the gym has moved', async () => {
    const { maps: service } = maps('k');
    const before = await service.gym({ id: 12, lat: 40.05, lon: -80.05 });
    const after = await service.gym({ id: 12, lat: 40.06, lon: -80.05 });
    expect(after).not.toBe(before);
    expect(urls).toHaveLength(2);
  });

  it('downloads the map of a region and keeps it under the region’s id', async () => {
    const { maps: service } = maps('k');
    const file = await service.region(west());
    expect(path.dirname(file ?? '')).toBe(path.resolve(dir, 'regions'));
    expect(path.basename(file ?? '')).toMatch(/^1\.[0-9a-f]{12}\.png$/);
    expect(new URL(urls[0] ?? '').searchParams.get('path')).toMatch(/^fillcolor:0xAA000033\|/);
  });

  it('has no map for a region without an outline', async () => {
    const { maps: service } = maps('k');
    expect(await service.region({ id: 3, bounds: null })).toBeUndefined();
    expect(urls).toEqual([]);
  });

  it.each([[undefined], ['']])('has no maps without a key (%j)', async (apiKey) => {
    const { maps: service } = maps(apiKey);
    expect(service.enabled).toBe(false);
    expect(await service.gym({ id: 12, lat: 40.05, lon: -80.05 })).toBeUndefined();
    expect(await service.region(west())).toBeUndefined();
    expect(urls).toEqual([]);
  });

  it('refuses the picture Google sends with a warning, and does not log the key', async () => {
    headers['x-staticmap-api-warning'] = 'Error geocoding: quota exceeded';
    const { maps: service, entries } = maps('SECRET-KEY');
    expect(await service.gym({ id: 12, lat: 40.05, lon: -80.05 })).toBeUndefined();
    expect(entries[0]?.reason).toBe('Google Static Maps warned: Error geocoding: quota exceeded');
    expect(JSON.stringify(entries)).not.toContain('SECRET-KEY');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --project unit src/domain/geo/static-map.test.ts src/services/image-cache.test.ts src/services/static-maps.test.ts`
Expected: FAIL, the three test files cannot import their modules.

- [ ] **Step 3: Write the map request**

Create `src/domain/geo/polyline.ts`:

```ts
import type { LatLon } from './lat-lon.js';

function encodeNumber(value: number): string {
  let bits = value < 0 ? ~(value << 1) : value << 1;
  let encoded = '';
  while (bits >= 0x20) {
    encoded += String.fromCharCode((0x20 | (bits & 0x1f)) + 63);
    bits >>= 5;
  }
  return encoded + String.fromCharCode(bits + 63);
}

/**
 * Google's encoded polyline format (five decimal places): a compact text for a line of points,
 * used for the outlines on static maps.
 */
export function encodePolyline(points: readonly LatLon[]): string {
  let encoded = '';
  let previousLat = 0;
  let previousLon = 0;
  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lon = Math.round(point.lon * 1e5);
    encoded += encodeNumber(lat - previousLat) + encodeNumber(lon - previousLon);
    previousLat = lat;
    previousLon = lon;
  }
  return encoded;
}
```

Create `src/domain/geo/static-map.ts`. Size, pin and outline style are the legacy bot's (`app/region.js`):

```ts
import type { LatLon } from './lat-lon.js';
import { encodePolyline } from './polyline.js';

export const STATIC_MAP_ENDPOINT = 'https://maps.googleapis.com/maps/api/staticmap';

/** A line or outline drawn on the map in red; `fill` shades the inside of a closed outline. */
export interface MapPath {
  points: readonly LatLon[];
  fill?: boolean;
}

export interface StaticMap {
  /** Small red pins. */
  markers?: readonly LatLon[];
  paths?: readonly MapPath[];
  /** Needed when the map shows only pins; with a path Google fits the map to it. */
  zoom?: number;
}

/**
 * The query of a Google Static Maps request for a 640×320 picture at double resolution, without
 * the API key. It doubles as the picture's identity: the same query is the same picture.
 */
export function staticMapQuery(map: StaticMap): string {
  const params = new URLSearchParams({ size: '640x320', scale: '2', format: 'png' });
  if (map.zoom !== undefined) params.set('zoom', String(map.zoom));
  if (map.markers && map.markers.length > 0) {
    const pins = map.markers.map((pin) => `${pin.lat},${pin.lon}`).join('|');
    params.append('markers', `size:small|color:red|${pins}`);
  }
  for (const path of map.paths ?? []) {
    const style = path.fill ? 'fillcolor:0xAA000033|color:red|weight:2' : 'color:red|weight:2';
    params.append('path', `${style}|enc:${encodePolyline(path.points)}`);
  }
  return params.toString();
}

/** The map of one gym: a pin at street level. */
export function gymMap(gym: LatLon): StaticMap {
  return { markers: [{ lat: gym.lat, lon: gym.lon }], zoom: 15 };
}

/** The map of a region: its outline, shaded. */
export function regionMap(bounds: readonly LatLon[]): StaticMap {
  return { paths: [{ points: bounds, fill: true }] };
}
```

- [ ] **Step 4: Write the image cache**

Create `src/services/image-cache.ts`:

```ts
import { createHash } from 'node:crypto';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../log.js';
import { failureReason } from './failure-reason.js';

/** The part of a `fetch` response the cache needs. */
export interface ImageResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FetchImage = (url: string, init: { signal: AbortSignal }) => Promise<ImageResponse>;

export interface ImageCacheOptions {
  /** Where the pictures are kept, e.g. `var/images`. */
  dir: string;
  fetch: FetchImage;
  log: Logger;
  /** How long one download may take. Default 10 seconds. */
  timeoutMs?: number;
  /** A larger download is refused. Default 5 MB. */
  maxBytes?: number;
}

export interface ImageRequest {
  /** Sub-folder: lower-case letters, digits and hyphens (`gyms`, `regions`). */
  folder: string;
  /** What the picture is of: letters, digits, hyphens and underscores (a gym or region id). */
  id: string;
  /**
   * Anything that changes when the picture should: a new variant is downloaded again and
   * replaces the old file. Must not hold secrets; it is hashed into the file name.
   */
  variant: string;
  /** Where to download it. May hold a secret (an API key): it is never logged. */
  url: string;
  /** A reason to refuse an otherwise good response, or undefined to accept it. */
  refuse?: (response: ImageResponse) => string | undefined;
}

const FOLDER = /^[a-z0-9-]+$/;
const ID = /^[A-Za-z0-9_-]+$/;

let temporaryCounter = 0;

/**
 * Downloads pictures once and keeps them on disk, so they can be attached to messages as files.
 * A picture that cannot be had is never an error for the caller: `get` answers undefined and the
 * message goes out without it.
 */
export class ImageCache {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly inFlight = new Map<string, Promise<string | undefined>>();

  constructor(private readonly options: ImageCacheOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  }

  /**
   * The path of the picture, downloading it first when this variant is not on disk yet. Requests
   * for the same picture made at the same time share one download. Throws RangeError for a
   * folder or id that is not a plain name.
   */
  get(request: ImageRequest): Promise<string | undefined> {
    if (!FOLDER.test(request.folder)) throw new RangeError(`Bad image folder: ${request.folder}`);
    if (!ID.test(request.id)) throw new RangeError(`Bad image id: ${request.id}`);
    const hash = createHash('sha256').update(request.variant).digest('hex').slice(0, 12);
    const file = path.resolve(this.options.dir, request.folder, `${request.id}.${hash}.png`);
    let pending = this.inFlight.get(file);
    if (!pending) {
      pending = this.provide(file, request).finally(() => this.inFlight.delete(file));
      this.inFlight.set(file, pending);
    }
    return pending;
  }

  /** Deletes the pictures of one folder, or all of them. Returns how many were deleted. */
  async clear(folder?: string): Promise<number> {
    if (folder !== undefined && !FOLDER.test(folder)) {
      throw new RangeError(`Bad image folder: ${folder}`);
    }
    const folders = folder === undefined ? await this.list(this.options.dir) : [folder];
    let deleted = 0;
    for (const name of folders) {
      if (!FOLDER.test(name)) continue;
      const dir = path.resolve(this.options.dir, name);
      for (const file of await this.list(dir)) {
        if (!file.endsWith('.png')) continue;
        await rm(path.join(dir, file), { force: true });
        deleted += 1;
      }
    }
    return deleted;
  }

  private async list(dir: string): Promise<string[]> {
    try {
      return await readdir(dir);
    } catch {
      return [];
    }
  }

  private async provide(file: string, request: ImageRequest): Promise<string | undefined> {
    const what = { folder: request.folder, id: request.id };
    try {
      if ((await stat(file)).size > 0) return file;
    } catch {
      // Not on disk yet.
    }
    const signal = AbortSignal.timeout(this.timeoutMs);
    let bytes: Buffer;
    try {
      bytes = await this.download(request, signal);
    } catch (err) {
      // Only the reason is logged, and never the address, which may hold a key.
      const reason = signal.aborted
        ? `timed out after ${this.timeoutMs} ms`
        : failureReason(err).replaceAll(request.url, '(address)');
      this.options.log.warn({ ...what, reason }, 'could not download a picture');
      return undefined;
    }
    const temporary = `${file}.${process.pid}.${++temporaryCounter}.tmp`;
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(temporary, bytes);
      await rename(temporary, file);
    } catch (err) {
      await rm(temporary, { force: true }).catch(() => undefined);
      this.options.log.warn({ ...what, reason: failureReason(err) }, 'could not save a picture');
      return undefined;
    }
    await this.removeOlderVariants(file, request.id);
    return file;
  }

  private async download(request: ImageRequest, signal: AbortSignal): Promise<Buffer> {
    const response = await this.options.fetch(request.url, { signal });
    if (!response.ok) throw new Error(`the server answered ${response.status}`);
    const type = response.headers.get('content-type') ?? '';
    if (!type.toLowerCase().startsWith('image/')) {
      throw new Error(`the server sent ${type === '' ? 'no content type' : type}, not a picture`);
    }
    const refused = request.refuse?.(response);
    if (refused !== undefined) throw new Error(refused);
    const length = Number(response.headers.get('content-length') ?? '0');
    if (length > this.maxBytes) throw new Error(`the picture is too large (${length} bytes)`);
    const body = await response.arrayBuffer();
    if (body.byteLength === 0) throw new Error('the picture is empty');
    if (body.byteLength > this.maxBytes) {
      throw new Error(`the picture is too large (${body.byteLength} bytes)`);
    }
    return Buffer.from(body);
  }

  /** Other variants of the same picture are out of date once a new one is saved. */
  private async removeOlderVariants(file: string, id: string): Promise<void> {
    const dir = path.dirname(file);
    const keep = path.basename(file);
    for (const name of await this.list(dir)) {
      if (name !== keep && name.startsWith(`${id}.`) && name.endsWith('.png')) {
        await rm(path.join(dir, name), { force: true }).catch(() => undefined);
      }
    }
  }
}
```

- [ ] **Step 5: Write the static maps service**

Create `src/services/static-maps.ts`:

```ts
import type { LatLon } from '../domain/geo/lat-lon.js';
import {
  STATIC_MAP_ENDPOINT,
  gymMap,
  regionMap,
  staticMapQuery,
  type StaticMap,
} from '../domain/geo/static-map.js';
import type { ImageCache, ImageResponse } from './image-cache.js';

/** What handlers need: map pictures as files to attach. */
export interface MapProvider {
  /** False when no Google API key is configured: every map is then undefined. */
  readonly enabled: boolean;
  /** Path of a picture of the gym's surroundings; undefined when it cannot be had. */
  gym(gym: { id: number; lat: number; lon: number }): Promise<string | undefined>;
  /** Path of a picture of the region's outline; undefined when it cannot be had. */
  region(region: { id: number; bounds: readonly LatLon[] | null }): Promise<string | undefined>;
}

/** Google answers a request it cannot fulfil (quota, bad key) with a picture of an error. */
function refuseWarning(response: ImageResponse): string | undefined {
  const warning = response.headers.get('x-staticmap-api-warning');
  return warning === null ? undefined : `Google Static Maps warned: ${warning}`;
}

/**
 * Map pictures from Google Static Maps, downloaded through the image cache so that the API key
 * never appears in anything sent to Discord. A gym's picture is replaced when the gym moves, a
 * region's when its outline changes.
 */
export class StaticMaps implements MapProvider {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly cache: ImageCache,
  ) {}

  get enabled(): boolean {
    return this.apiKey !== undefined && this.apiKey !== '';
  }

  gym(gym: { id: number; lat: number; lon: number }): Promise<string | undefined> {
    return this.picture('gyms', gym.id, gymMap(gym));
  }

  region(region: { id: number; bounds: readonly LatLon[] | null }): Promise<string | undefined> {
    if (!region.bounds) return Promise.resolve(undefined);
    return this.picture('regions', region.id, regionMap(region.bounds));
  }

  private picture(folder: string, id: number, map: StaticMap): Promise<string | undefined> {
    if (!this.enabled) return Promise.resolve(undefined);
    const query = staticMapQuery(map);
    return this.cache.get({
      folder,
      id: String(id),
      variant: query,
      url: `${STATIC_MAP_ENDPOINT}?${query}&key=${encodeURIComponent(this.apiKey ?? '')}`,
      refuse: refuseWarning,
    });
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --project unit src/domain/geo/static-map.test.ts src/services/image-cache.test.ts src/services/static-maps.test.ts`
Expected: PASS, 43 tests in 3 files.

- [ ] **Step 7: Format, check, commit**

```bash
npx prettier --write src/domain/geo/polyline.ts src/domain/geo/static-map.ts src/domain/geo/static-map.test.ts src/services/image-cache.ts src/services/image-cache.test.ts src/services/static-maps.ts src/services/static-maps.test.ts
npm run check
git add src/domain/geo/polyline.ts src/domain/geo/static-map.ts src/domain/geo/static-map.test.ts src/services/image-cache.ts src/services/image-cache.test.ts src/services/static-maps.ts src/services/static-maps.test.ts
git commit -m "Image cache, and map pictures of gyms and regions through it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The services and the wiring

**Files:**
- Create: `src/services/gym-directory.ts`, `src/services/gym-directory.test.ts`, `src/services/gym-directory.db.test.ts`
- Create: `src/services/pokemon-search-service.ts`, `src/services/pokemon-search-service.test.ts`
- Create: `test/support/providers.ts`, `test/support/providers.test.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: `GymLookup`, `GymHit`, `GymLookupOptions` (Task 4); `PokemonSearch`, `mergeNicknames`, `PokemonSearchOptions` (Task 2); `ImageCache`, `StaticMaps`, `MapProvider` (Task 5); `GymRepository` (`listAll`, `get`), `RegionRepository` (`listAll`), `PokemonRepository` (`nicknames`); `GameDataProvider` (`catalogue`).
- Produces:
  - `interface GymSource { listAll(): Promise<Gym[]>; get(id: number): Promise<Gym | undefined> }`; `interface RegionSource { listAll(): Promise<Region[]> }`.
  - `interface GymProvider { get(id: number): Gym | undefined; isRegion(channelId: string): boolean; regionsOf(gymId: number): string[]; search(channelId: string | null, text: string, options?: GymLookupOptions): GymHit<Gym>[] }`.
  - `class GymDirectory implements GymProvider { constructor(options: { gyms: GymSource; regions: RegionSource; ignoredWords: readonly string[]; log: Logger }); load(): Promise<void>; refreshGym(id: number): Promise<Gym | undefined>; size }`.
  - `interface NicknameSource { nicknames(): Promise<Map<string, string[]>> }`; `interface PokemonFinder { search(text: string, options?: PokemonSearchOptions): PokemonEntry[] }`; `class PokemonSearchService implements PokemonFinder { constructor(gameData: GameDataProvider, source: NicknameSource); reloadNicknames(): Promise<void> }`.
  - `AppContext.gyms: GymProvider`, `AppContext.pokemon: PokemonFinder`, `AppContext.maps: MapProvider`.
  - `test/support/providers.ts`: `gymsFixture(): GymProvider`, `pokemonFixture(): PokemonFinder`, `mapsFixture(): MapProvider`.

- [ ] **Step 1: Write the failing tests**

Create `src/services/gym-directory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EAST_CHANNEL, WEST_CHANNEL, testGyms, testRegions } from '../../test/support/gyms.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import { GymDirectory } from './gym-directory.js';

/** Gyms and regions in memory, with counters and a switch to make reading fail. */
function sources() {
  const state = {
    gyms: testGyms(),
    regions: testRegions(),
    listed: 0,
    fetched: [] as number[],
    failing: false,
  };
  const fail = () => Promise.reject(new Error('database is down'));
  return {
    state,
    gyms: {
      listAll: (): Promise<Gym[]> => {
        state.listed += 1;
        return state.failing ? fail() : Promise.resolve(state.gyms.map((gym) => ({ ...gym })));
      },
      get: (id: number): Promise<Gym | undefined> => {
        state.fetched.push(id);
        return state.failing ? fail() : Promise.resolve(state.gyms.find((gym) => gym.id === id));
      },
    },
    regions: {
      listAll: (): Promise<Region[]> =>
        state.failing ? fail() : Promise.resolve(state.regions.map((region) => ({ ...region }))),
    },
  };
}

function directory() {
  const source = sources();
  const { log, entries } = createTestLogger();
  const service = new GymDirectory({
    gyms: source.gyms,
    regions: source.regions,
    ignoredWords: ['gym', 'raid'],
    log,
  });
  return { service, state: source.state, entries };
}

const ids = (service: GymDirectory, channelId: string | null, text: string) =>
  service.search(channelId, text).map((hit) => hit.gym.id);

describe('GymDirectory', () => {
  it('answers nothing before it has loaded', () => {
    const { service } = directory();
    expect(() => service.get(1)).toThrow('Gyms have not been loaded yet');
    expect(() => service.search(null, 'library')).toThrow('Gyms have not been loaded yet');
    expect(() => service.isRegion(WEST_CHANNEL)).toThrow('Gyms have not been loaded yet');
  });

  it('loads every gym and region with one read each and says so', async () => {
    const { service, state, entries } = directory();
    await service.load();
    expect(state.listed).toBe(1);
    expect(service.size).toBe(12);
    expect(service.get(1)?.name).toBe('Pinewood Public Library');
    expect(service.isRegion(WEST_CHANNEL)).toBe(true);
    expect(service.regionsOf(7)).toEqual([EAST_CHANNEL]);
    expect(ids(service, WEST_CHANNEL, 'mural')).toEqual([1, 7]);
    expect(ids(service, null, 'the library gym')).toEqual([1]);
    expect(entries.at(-1)).toMatchObject({ msg: 'gyms indexed', gyms: 12, regions: 3 });
  });

  it('fails to load when the database fails, and loads later', async () => {
    const { service, state } = directory();
    state.failing = true;
    await expect(service.load()).rejects.toThrow('database is down');
    expect(() => service.get(1)).toThrow('Gyms have not been loaded yet');
    state.failing = false;
    await service.load();
    expect(service.size).toBe(12);
  });

  it('keeps serving the old state when a later load fails', async () => {
    const { service, state } = directory();
    await service.load();
    state.failing = true;
    await expect(service.load()).rejects.toThrow('database is down');
    expect(ids(service, null, 'library')).toEqual([1]);
  });

  it('takes up new regions on the next load', async () => {
    const { service, state } = directory();
    await service.load();
    expect(ids(service, WEST_CHANNEL, 'trailhead')).toEqual([]);
    state.regions = state.regions.filter((region) => region.channelId !== WEST_CHANNEL);
    await service.load();
    expect(service.isRegion(WEST_CHANNEL)).toBe(false);
    // No longer a region: the whole directory is searched.
    expect(ids(service, WEST_CHANNEL, 'trailhead')).toEqual([10]);
  });

  it('re-reads one gym that changed', async () => {
    const { service, state } = directory();
    await service.load();
    state.gyms = state.gyms.map((gym) =>
      gym.id === 1 ? { ...gym, name: 'Pinewood Reading Room', lon: -79.95 } : gym,
    );
    expect((await service.refreshGym(1))?.name).toBe('Pinewood Reading Room');
    expect(state.fetched).toEqual([1]);
    expect(state.listed).toBe(1);
    expect(ids(service, EAST_CHANNEL, 'reading room')).toEqual([1]);
    expect(ids(service, WEST_CHANNEL, 'public library')).toEqual([]);
    expect(service.regionsOf(1)).toEqual([EAST_CHANNEL]);
  });

  it('takes up a new gym and forgets a deleted one', async () => {
    const { service, state } = directory();
    await service.load();
    const template = state.gyms[0];
    if (!template) throw new Error('The fixture is empty');
    state.gyms.push({ ...template, id: 50, name: 'Clock Tower' });
    expect((await service.refreshGym(50))?.id).toBe(50);
    expect(ids(service, WEST_CHANNEL, 'clock')).toEqual([50]);

    state.gyms = state.gyms.filter((gym) => gym.id !== 50);
    expect(await service.refreshGym(50)).toBeUndefined();
    expect(service.get(50)).toBeUndefined();
    expect(ids(service, null, 'clock')).toEqual([]);
    expect(await service.refreshGym(12345)).toBeUndefined();
  });

  it('keeps the gym as it was when re-reading it fails', async () => {
    const { service, state } = directory();
    await service.load();
    state.failing = true;
    await expect(service.refreshGym(1)).rejects.toThrow('database is down');
    expect(service.get(1)?.name).toBe('Pinewood Public Library');
    state.failing = false;
    expect((await service.refreshGym(1))?.id).toBe(1);
  });

  it('applies changes in the order they were asked for', async () => {
    const { service, state } = directory();
    await service.load();
    state.gyms = state.gyms.map((gym) => (gym.id === 1 ? { ...gym, name: 'Reading Room' } : gym));
    const refreshed = service.refreshGym(1);
    const reloaded = service.load();
    await Promise.all([refreshed, reloaded]);
    expect(service.get(1)?.name).toBe('Reading Room');
    expect(state.listed).toBe(2);
  });

  it('refuses to re-read a gym before the first load', async () => {
    const { service } = directory();
    await expect(service.refreshGym(1)).rejects.toThrow('Gyms have not been loaded yet');
  });
});
```

Create `src/services/pokemon-search-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gameDataFixture } from '../../test/support/game-data.js';
import { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import { PokemonSearchService } from './pokemon-search-service.js';

function service(stored: Record<string, string[]> = {}) {
  const state = { stored, reads: 0, failing: false };
  const gameData = { catalogue: new PokemonCatalogue(gameDataFixture()) };
  const search = new PokemonSearchService(gameData, {
    nicknames: () => {
      state.reads += 1;
      return state.failing
        ? Promise.reject(new Error('database is down'))
        : Promise.resolve(new Map(Object.entries(state.stored)));
    },
  });
  return { search, gameData, state };
}

const first = (search: PokemonSearchService, text: string) => search.search(text)[0]?.key;

describe('PokemonSearchService', () => {
  it('knows names and the curated nicknames before the database was read', () => {
    const { search, state } = service({ dratini: ['danger noodle'] });
    expect(first(search, 'giratina origin')).toBe('giratina_origin');
    expect(first(search, 'ttar')).toBe('tyranitar');
    expect(first(search, 'danger noodle')).toBeUndefined();
    expect(state.reads).toBe(0);
  });

  it('adds the moderators’ nicknames once they are read', async () => {
    const { search } = service({
      dratini: ['danger noodle'],
      giratina: ['tina'],
      ex: ['exclusive'],
    });
    await search.reloadNicknames();
    expect(first(search, 'danger noodle')).toBe('dratini');
    expect(first(search, 'tina')).toBe('giratina_altered');
    expect(first(search, 'noodle')).toBe('dratini');
    expect(first(search, 'ttar')).toBe('tyranitar');
  });

  it('takes up added and removed nicknames on the next read', async () => {
    const { search, state } = service({ dratini: ['danger noodle'] });
    await search.reloadNicknames();
    state.stored = { magikarp: ['splashy'] };
    expect(first(search, 'splashy')).toBeUndefined();
    await search.reloadNicknames();
    expect(first(search, 'splashy')).toBe('magikarp');
    expect(first(search, 'danger noodle')).toBeUndefined();
  });

  it('keeps the nicknames it has when reading fails', async () => {
    const { search, state } = service({ dratini: ['danger noodle'] });
    await search.reloadNicknames();
    state.failing = true;
    await expect(search.reloadNicknames()).rejects.toThrow('database is down');
    expect(first(search, 'danger noodle')).toBe('dratini');
  });

  it('passes the options on', () => {
    const { search } = service();
    expect(search.search('charizard', { limit: 1 }).map((entry) => entry.key)).toEqual([
      'charizard',
    ]);
    expect(search.search('charizard', { filter: (entry) => entry.kind === 'mega' })).toHaveLength(
      2,
    );
  });

  it('follows the game data when it is refreshed', async () => {
    const { search, gameData } = service({ dratini: ['danger noodle'] });
    await search.reloadNicknames();
    expect(first(search, 'mewtwo')).toBe('mewtwo');
    const data = gameDataFixture();
    gameData.catalogue = new PokemonCatalogue({
      ...data,
      pokemon: data.pokemon.map((entry) =>
        entry.key === 'mewtwo' ? { ...entry, name: 'Renamed Clone' } : entry,
      ),
    });
    expect(first(search, 'renamed clone')).toBe('mewtwo');
    // Results are entries of the catalogue in use, and the nicknames are still known.
    expect(search.search('renamed clone')[0]).toBe(gameData.catalogue.byKey('mewtwo'));
    expect(first(search, 'danger noodle')).toBe('dratini');
  });

  it('builds its index once per catalogue', () => {
    const { search, gameData } = service();
    const before = search.search('mewtwo')[0];
    expect(search.search('mewtwo')[0]).toBe(before);
    expect(before).toBe(gameData.catalogue.byKey('mewtwo'));
  });
});
```

Create `src/services/gym-directory.db.test.ts` (needs Docker):

```ts
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EAST_CHANNEL,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  testGyms,
  testRegions,
} from '../../test/support/gyms.js';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { GuildRepository } from '../db/repositories/guild-repository.js';
import { GymRepository } from '../db/repositories/gym-repository.js';
import { PokemonRepository } from '../db/repositories/pokemon-repository.js';
import { RegionRepository } from '../db/repositories/region-repository.js';
import type { DB } from '../db/types.js';
import { GymDirectory } from './gym-directory.js';
import { PokemonSearchService } from './pokemon-search-service.js';
import { catalogueFixture } from '../../test/support/game-data.js';

describe('GymDirectory and PokemonSearchService against MySQL', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let gyms: GymRepository;
  let regions: RegionRepository;
  let directory: GymDirectory;
  /** Fixture gym id to the id the database gave it. */
  const stored = new Map<number, number>();

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    gyms = new GymRepository(db);
    regions = new RegionRepository(db);
    const guildId = await new GuildRepository(db).ensure('412345678901234567');
    for (const region of testRegions()) {
      if (region.bounds) await regions.saveBounds(guildId, region.channelId, region.bounds);
    }
    await db.insertInto('Region').values({ guildId, channelId: UNBOUNDED_CHANNEL }).execute();
    for (const gym of testGyms()) {
      const created = await gyms.create(gym);
      await gyms.update(created.id, {
        keywords: gym.keywords,
        notice: gym.notice,
        geodata: gym.geodata,
        places: gym.places,
      });
      stored.set(gym.id, created.id);
    }
    directory = new GymDirectory({
      gyms,
      regions,
      ignoredWords: ['gym', 'raid'],
      log: createTestLogger().log,
    });
    await directory.load();
  });
  afterAll(async () => {
    await stop();
  });

  const id = (fixtureId: number) => stored.get(fixtureId) ?? -1;
  const ids = (channelId: string | null, text: string) =>
    directory.search(channelId, text).map((hit) => hit.gym.id);

  it('sorts gyms into regions exactly as the database does', async () => {
    for (const channelId of [WEST_CHANNEL, EAST_CHANNEL, UNBOUNDED_CHANNEL]) {
      const inDatabase = (await gyms.listInRegion(channelId)).map((gym) => gym.id);
      const inDirectory = (await gyms.listAll())
        .filter((gym) => directory.regionsOf(gym.id).includes(channelId))
        .map((gym) => gym.id);
      expect(inDirectory, channelId).toEqual(inDatabase);
    }
    expect((await gyms.listInRegion(WEST_CHANNEL)).length).toBe(8);
    expect(directory.isRegion(UNBOUNDED_CHANNEL)).toBe(false);
  });

  it('searches stored gyms by decoded text, address and places', () => {
    expect(ids(WEST_CHANNEL, "st mary's")).toEqual([id(3)]);
    expect(ids(null, 'cafe elan')).toEqual([id(8)]);
    expect(ids(WEST_CHANNEL, 'church lane')).toEqual([id(3)]);
    expect(ids(WEST_CHANNEL, 'luna')).toEqual([id(2)]);
    expect(ids(WEST_CHANNEL, 'plaza')).toEqual([id(2)]);
    expect(ids(WEST_CHANNEL, 'mural')).toEqual([id(1), id(7)]);
    expect(directory.get(id(8))?.name).toBe('Café Élan Fresco');
  });

  it('follows a gym that is edited, moved and deleted', async () => {
    const created = await gyms.create({ name: 'Clock Tower', lat: 40.05, lon: -80.05 });
    expect(ids(WEST_CHANNEL, 'clock')).toEqual([]);
    await directory.refreshGym(created.id);
    expect(ids(WEST_CHANNEL, 'clock')).toEqual([created.id]);

    await gyms.update(created.id, { nickname: 'Big Ben', lon: -79.95 });
    await directory.refreshGym(created.id);
    expect(ids(EAST_CHANNEL, 'big ben')).toEqual([created.id]);
    expect(ids(WEST_CHANNEL, 'big ben')).toEqual([]);

    await gyms.delete(created.id);
    expect(await directory.refreshGym(created.id)).toBeUndefined();
    expect(ids(null, 'clock')).toEqual([]);
  });

  it('finds Pokémon by nicknames stored in the legacy table', async () => {
    const pokemon = new PokemonRepository(db);
    const search = new PokemonSearchService({ catalogue: catalogueFixture() }, pokemon);
    await pokemon.addNickname('dratini', 'Danger Noodle');
    await pokemon.addNickname('giratina_altered', 'tina');
    await db.insertInto('Pokemon').values({ name: 'ex', nickname: 'exclusive' }).execute();
    await search.reloadNicknames();
    expect(search.search('danger noodle')[0]?.key).toBe('dratini');
    expect(search.search('tina')[0]?.key).toBe('giratina_altered');
    expect(search.search('exclusive')).toEqual([]);

    await pokemon.removeNickname('dratini', 'danger noodle');
    await search.reloadNicknames();
    expect(search.search('danger noodle')).toEqual([]);
  });
});
```

Create `test/support/providers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WEST_CHANNEL } from './gyms.js';
import { createTestContext } from './test-context.js';

describe('the test context', () => {
  it('finds the invented gyms', () => {
    const { ctx } = createTestContext();
    expect(ctx.gyms.search(WEST_CHANNEL, 'library').map((hit) => hit.gym.id)).toEqual([1]);
    expect(ctx.gyms.isRegion(WEST_CHANNEL)).toBe(true);
  });

  it('finds Pokémon of the game-data fixture', () => {
    const { ctx } = createTestContext();
    expect(ctx.pokemon.search('ttar')[0]?.key).toBe('tyranitar');
    expect(ctx.pokemon.search('giratina')[0]).toBe(ctx.gameData.catalogue.byKey('giratina'));
  });

  it('has no maps', async () => {
    const { ctx } = createTestContext();
    expect(ctx.maps.enabled).toBe(false);
    expect(await ctx.maps.gym({ id: 1, lat: 40, lon: -80 })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the unit tests to see them fail**

Run: `npx vitest run --project unit src/services/gym-directory.test.ts src/services/pokemon-search-service.test.ts test/support/providers.test.ts`
Expected: FAIL, the test files cannot import their modules.

- [ ] **Step 3: Write the gym directory**

Create `src/services/gym-directory.ts`:

```ts
import type { Gym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import { GymLookup, type GymHit, type GymLookupOptions } from '../domain/search/gym-lookup.js';
import type { Logger } from '../log.js';

/** The part of `GymRepository` the directory reads. */
export interface GymSource {
  listAll(): Promise<Gym[]>;
  get(id: number): Promise<Gym | undefined>;
}

/** The part of `RegionRepository` the directory reads. */
export interface RegionSource {
  listAll(): Promise<Region[]>;
}

/** What handlers need: the gyms, and finding them by what members type. See `GymLookup`. */
export interface GymProvider {
  /** The gym with this id, or undefined. */
  get(id: number): Gym | undefined;
  /** Whether the channel is a region with an outline. */
  isRegion(channelId: string): boolean;
  /** Channel ids of the regions the gym lies in; empty when it lies in none. */
  regionsOf(gymId: number): string[];
  /**
   * Gyms matching the text, best first. In a region channel: the region's own gyms, then
   * matching gyms just outside it. In any other channel, or with null: all gyms.
   */
  search(channelId: string | null, text: string, options?: GymLookupOptions): GymHit<Gym>[];
}

export interface GymDirectoryOptions {
  gyms: GymSource;
  regions: RegionSource;
  /** Words ignored in gym texts and searches (settings.blacklistWords). */
  ignoredWords: readonly string[];
  log: Logger;
}

/**
 * All gyms in memory, read from the database. `load` reads everything (two queries); after a gym
 * was added, changed or deleted call `refreshGym`, and after regions changed call `load` again.
 * Reads never wait: they use the last complete state.
 */
export class GymDirectory implements GymProvider {
  private lookup: GymLookup<Gym> | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: GymDirectoryOptions) {}

  private get current(): GymLookup<Gym> {
    if (!this.lookup) throw new Error('Gyms have not been loaded yet');
    return this.lookup;
  }

  /** Changes are applied one after the other, in the order they were asked for. */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Reads every gym and region and builds the index anew. The old state serves until then. */
  load(): Promise<void> {
    return this.enqueue(async () => {
      const [gyms, regions] = await Promise.all([
        this.options.gyms.listAll(),
        this.options.regions.listAll(),
      ]);
      const started = performance.now();
      this.lookup = new GymLookup(gyms, regions, this.options.ignoredWords);
      this.options.log.info(
        { gyms: gyms.length, regions: regions.length, ms: Math.round(performance.now() - started) },
        'gyms indexed',
      );
    });
  }

  /**
   * Re-reads one gym after it was added, changed or deleted. Returns the gym as it is now, or
   * undefined when it no longer exists.
   */
  refreshGym(id: number): Promise<Gym | undefined> {
    return this.enqueue(async () => {
      const lookup = this.current;
      const gym = await this.options.gyms.get(id);
      if (gym) lookup.put(gym);
      else lookup.remove(id);
      return gym;
    });
  }

  get size(): number {
    return this.current.size;
  }

  get(id: number): Gym | undefined {
    return this.current.get(id);
  }

  isRegion(channelId: string): boolean {
    return this.current.isRegion(channelId);
  }

  regionsOf(gymId: number): string[] {
    return this.current.regionsOf(gymId);
  }

  search(channelId: string | null, text: string, options?: GymLookupOptions): GymHit<Gym>[] {
    return this.current.search(channelId, text, options);
  }
}
```

- [ ] **Step 4: Write the Pokémon search service**

Create `src/services/pokemon-search-service.ts`. `GameDataProvider` has no change signal; the service notices a refresh because `gameData.catalogue` is then another object:

```ts
import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import type { PokemonEntry } from '../domain/pogo/game-master.js';
import { CURATED_NICKNAMES } from '../domain/pogo/nicknames.js';
import {
  PokemonSearch,
  mergeNicknames,
  type PokemonSearchOptions,
} from '../domain/pogo/pokemon-search.js';
import type { GameDataProvider } from './game-data-service.js';

/** The part of `PokemonRepository` the search reads. */
export interface NicknameSource {
  nicknames(): Promise<Map<string, string[]>>;
}

/** What handlers need: Pokémon by what members type. */
export interface PokemonFinder {
  /** Best fit first; see `PokemonSearch`. */
  search(text: string, options?: PokemonSearchOptions): PokemonEntry[];
}

/**
 * The Pokémon search over the game data in use and the nicknames (the curated list and the
 * moderators' from the database). The index is rebuilt by itself when the game data was
 * refreshed; call `reloadNicknames` after a nickname was added or removed.
 */
export class PokemonSearchService implements PokemonFinder {
  private stored = new Map<string, string[]>();
  private built: { catalogue: PokemonCatalogue; search: PokemonSearch } | undefined;

  constructor(
    private readonly gameData: GameDataProvider,
    private readonly source: NicknameSource,
  ) {}

  /** Reads the moderators' nicknames. Until this has run, only the curated ones are known. */
  async reloadNicknames(): Promise<void> {
    this.stored = await this.source.nicknames();
    this.built = undefined;
  }

  search(text: string, options?: PokemonSearchOptions): PokemonEntry[] {
    return this.current().search(text, options);
  }

  private current(): PokemonSearch {
    const catalogue = this.gameData.catalogue;
    if (this.built?.catalogue !== catalogue) {
      const nicknames = mergeNicknames(catalogue, CURATED_NICKNAMES, this.stored);
      this.built = { catalogue, search: new PokemonSearch(catalogue, nicknames) };
    }
    return this.built.search;
  }
}
```

- [ ] **Step 5: Add the three services to the context**

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -5,7 +5,10 @@ import type { CommandModule } from './discord/command.js';
 import type { IntentFlags } from './discord/intents.js';
 import type { Logger } from './log.js';
 import type { GameDataProvider } from './services/game-data-service.js';
+import type { GymProvider } from './services/gym-directory.js';
+import type { PokemonFinder } from './services/pokemon-search-service.js';
 import type { RaidBossProvider } from './services/raid-boss-service.js';
+import type { MapProvider } from './services/static-maps.js';
 
 /** Everything a handler may use. Later phases add services here. */
 export interface AppContext {
@@ -17,6 +20,12 @@ export interface AppContext {
   readonly gameData: GameDataProvider;
   /** The raid bosses in effect: the feed's list with the moderators' overrides. */
   readonly raidBosses: RaidBossProvider;
+  /** The gyms, and finding them by what members type. */
+  readonly gyms: GymProvider;
+  /** Pokémon by what members type: names, nicknames, forms. */
+  readonly pokemon: PokemonFinder;
+  /** Map pictures of gyms and regions, as files to attach. */
+  readonly maps: MapProvider;
   /** Privileged-intent features actually granted at login (may be fewer than configured). */
   features: IntentFlags;
 }
```

- [ ] **Step 6: Give tests their fixtures**

Create `test/support/providers.ts`:

```ts
import { CURATED_NICKNAMES } from '../../src/domain/pogo/nicknames.js';
import { PokemonSearch, mergeNicknames } from '../../src/domain/pogo/pokemon-search.js';
import { GymLookup } from '../../src/domain/search/gym-lookup.js';
import type { GymProvider } from '../../src/services/gym-directory.js';
import type { PokemonFinder } from '../../src/services/pokemon-search-service.js';
import type { MapProvider } from '../../src/services/static-maps.js';
import { catalogueFixture } from './game-data.js';
import { testGyms, testRegions } from './gyms.js';

/** The invented gyms and regions, searchable, with the words the test settings ignore. */
export function gymsFixture(): GymProvider {
  return new GymLookup(testGyms(), testRegions(), ['ex', 'raid', 'gym', 'sponsored']);
}

/** The Pokémon search over the game-data fixture with the curated nicknames. */
export function pokemonFixture(): PokemonFinder {
  const catalogue = catalogueFixture();
  return new PokemonSearch(catalogue, mergeNicknames(catalogue, CURATED_NICKNAMES));
}

/** Maps as they are without a Google API key: none. */
export function mapsFixture(): MapProvider {
  return {
    enabled: false,
    gym: () => Promise.resolve(undefined),
    region: () => Promise.resolve(undefined),
  };
}
```

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -5,6 +5,7 @@ import { loadEnv } from '../../src/config/env.js';
 import { loadSettings } from '../../src/config/settings.js';
 import type { DB } from '../../src/db/types.js';
 import { catalogueFixture } from './game-data.js';
+import { gymsFixture, mapsFixture, pokemonFixture } from './providers.js';
 import { raidBossesFixture } from './raid-bosses.js';
 import { createTestLogger } from './test-logger.js';
 import { TEST_ENV } from './test-env.js';
@@ -22,6 +23,9 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     commands: [],
     gameData: { catalogue: catalogueFixture() },
     raidBosses: raidBossesFixture(),
+    gyms: gymsFixture(),
+    pokemon: pokemonFixture(),
+    maps: mapsFixture(),
     features: { ocrPassive: false, autoAssignRole: false },
     ...overrides,
   };
```

- [ ] **Step 7: Build and load them when the bot starts**

Gyms and nicknames are read after the migrations and before the login, so a database that cannot be read stops the start, as it does for the raid bosses. Nothing here contacts the network: maps are downloaded only when a handler asks for one.

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -6,7 +6,10 @@ import { dbConfigFrom } from './db/db-config.js';
 import { createDb } from './db/kysely.js';
 import { runMigrations } from './db/migrator.js';
 import { GuildRepository } from './db/repositories/guild-repository.js';
+import { GymRepository } from './db/repositories/gym-repository.js';
+import { PokemonRepository } from './db/repositories/pokemon-repository.js';
 import { RaidBossRepository } from './db/repositories/raid-boss-repository.js';
+import { RegionRepository } from './db/repositories/region-repository.js';
 import type { DB } from './db/types.js';
 import { createClient, loginWithFallback } from './discord/client.js';
 import { attachGatewayHandlers } from './discord/gateway-events.js';
@@ -14,11 +17,17 @@ import { syncGuilds } from './discord/guild-sync.js';
 import { InteractionRouter } from './discord/router.js';
 import { createLogger, type Logger } from './log.js';
 import { GameDataService } from './services/game-data-service.js';
+import { GymDirectory } from './services/gym-directory.js';
+import { ImageCache } from './services/image-cache.js';
+import { PokemonSearchService } from './services/pokemon-search-service.js';
 import { RaidBossService } from './services/raid-boss-service.js';
+import { StaticMaps } from './services/static-maps.js';
 import { createShutdown } from './shutdown.js';
 
 /** Parsed game data is kept here between runs, so the bot can start while offline. */
 const GAME_DATA_CACHE = 'var/game-data-cache.json';
+/** Downloaded map pictures are kept here; deleting the folder only costs new downloads. */
+const IMAGE_CACHE = 'var/images';
 const MINUTE_MS = 60_000;
 const HOUR_MS = 60 * MINUTE_MS;
 
@@ -55,11 +64,24 @@ export async function startApp(
     fetch: (url, init) => fetch(url, init),
     log,
   });
+  const gyms = new GymDirectory({
+    gyms: new GymRepository(db),
+    regions: new RegionRepository(db),
+    ignoredWords: config.settings.blacklistWords,
+    log,
+  });
+  const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db));
+  const maps = new StaticMaps(
+    config.env.GOOGLE_API_KEY,
+    new ImageCache({ dir: IMAGE_CACHE, fetch: (url, init) => fetch(url, init), log }),
+  );
   try {
     await runMigrations(db, log);
     await gameData.load();
     // Reads the list of the last run from the database; the feed is read after the login.
     await raidBosses.load();
+    await gyms.load();
+    await pokemon.reloadNicknames();
   } catch (err) {
     await db.destroy();
     throw err;
@@ -70,7 +92,18 @@ export async function startApp(
     ocrPassive: config.settings.ocr.passive,
     autoAssignRole: config.settings.autoAssignRole,
   };
-  const ctx: AppContext = { config, log, db, commands, gameData, raidBosses, features: requested };
+  const ctx: AppContext = {
+    config,
+    log,
+    db,
+    commands,
+    gameData,
+    raidBosses,
+    gyms,
+    pokemon,
+    maps,
+    features: requested,
+  };
   const router = new InteractionRouter(ctx, commands, []);
   const guilds = new GuildRepository(db);
 
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run --project unit src/services test/support/providers.test.ts`
Expected: PASS.

Run (needs Docker): `npx vitest run --project db src/services/gym-directory.db.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 9: Format, check, commit**

```bash
npx prettier --write src/services/gym-directory.ts src/services/gym-directory.test.ts src/services/gym-directory.db.test.ts src/services/pokemon-search-service.ts src/services/pokemon-search-service.test.ts test/support/providers.ts test/support/providers.test.ts test/support/test-context.ts src/app-context.ts src/app.ts
npm run check
git add src/services/gym-directory.ts src/services/gym-directory.test.ts src/services/gym-directory.db.test.ts src/services/pokemon-search-service.ts src/services/pokemon-search-service.test.ts test/support/providers.ts test/support/providers.test.ts test/support/test-context.ts src/app-context.ts src/app.ts
git commit -m "Gym directory and Pokémon search as services; ctx.gyms, ctx.pokemon, ctx.maps" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected at the end: `npm run check` reports 750 unit tests passing.

---

## After the last task (controller)

1. Run `npm run check` and `npm run test:db` on the branch; both must be green.
2. Whole-branch review on Opus at high effort, over the range from the commit before Task 1 to HEAD.
3. Update `CLAUDE.md` (status line: Phase 1 complete, next Phase 2; convention lines for `ctx.gyms`, `ctx.pokemon`, `ctx.maps` and the test fixtures), the "From Phase 1C" section of `docs/superpowers/plans/phase-0-follow-ups.md`, a short "As built (Phase 1C)" note in the spec (sections 4.3 and 6.8), the Gantt chart and memory. Then stop and ask Matt to compact.

## Not in this plan

Each of these goes into the follow-ups file when the phase ends.

- **Phase 2 (raids on forums).** The `gym` and `boss` autocomplete handlers and the free-text fallback of spec 4.3, on `ctx.gyms.search(channelId, text, { limit: 25 })` and `ctx.pokemon.search`. A hit with `allWords: false` is a guess: offer it, never act on it. `place: 'neighbouring'` is the "gym lies in an adjacent region" case that asks for confirmation; `ctx.gyms.regionsOf(gym.id)` gives the region channels. Tiers, eggs, shadow and boss CP come from the boss list, not from the Pokémon search. Pokémon icons: take the address from the raid boss feed (`assets.image`, `assets.shinyImage`; not parsed yet). Attach a map with `new AttachmentBuilder(path)` from `ctx.maps.gym(gym)`; it may be undefined.
- **Phase 4 (notifications).** The legacy words for notification targets (`hundo` for perfect; `none`, `useless` for zero; `ex`, `exclusive`) if `/want` takes free text.
- **Phase 5 (admin).** Call `gyms.refreshGym(id)` after every gym edit, `gyms.load()` after a region import, and `pokemon.reloadNicknames()` after a nickname change; these need the services themselves, not the `ctx` interfaces. `/admin clear-image-cache` on `ImageCache.clear()`. Geocoding and Places (what fills `geodata` and `places`): keep writing `{"addressComponents": {…}}`.
- **Phase 6 (utilities).** `/find-region`: maps of arbitrary shapes are `staticMapQuery({ paths, markers })`, downloaded without caching; real geometry (intersections) needs turf.
- **Phase 7 (OCR).** `nameOnly` searching is there; the bare species name on the raid screen is found by the Pokémon search.
- **Left as they are:** searches look at the gyms of all guilds (the legacy behaviour; production has one guild); the gym notice is not searched; Unown's "!" and "?" forms are found by key or nickname only, since their names have no letters.
