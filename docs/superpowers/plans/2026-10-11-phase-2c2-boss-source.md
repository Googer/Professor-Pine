# Phase 2C-2: Raid Bosses from ScrapedDuck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The raid boss list comes from ScrapedDuck's `raids.json` (Leek Duck's raid boss page as data) instead of pokemon-go-api's `raidboss.json`, which is dropped: it only repackages Leek Duck and the game master, the two sources Pine already reads itself (Matt, 2026-10-11).

**Architecture:** Only the reader changes. `parseRaidBossFeed` keeps its result (`ParsedFeed` with `FeedBoss` rows and unknown levels), so the table, the repository, the overrides, `effectiveBosses`, `RaidBossService` and everything that uses `ctx.raidBosses` stay as they are. What ScrapedDuck does not give (game-master ids) the parser works out from the picture's file name and, failing that, from the display name, through two small look-ups passed in by its caller.

**Tech Stack:** TypeScript 6.0, zod 4, Vitest. No new dependencies, no database change.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md` section 6.7 (raid boss list; this plan changes its "Feed" paragraph). Hand-off: `docs/superpowers/plans/phase-0-follow-ups.md`, "From Phase 2C", the bullet "The raid boss list comes from ScrapedDuck's `raids.json` alone".

**This plan was not prototyped.** Unlike the earlier plans it states requirements, not code: the implementer writes the code test-first and the reviewer judges it against this text. The feed as downloaded on 2026-10-11 is in the git-ignored `var/game-data-source/scrapedduck-raids-2026-10-11.json` (14 bosses: the same raids as the old fixture).

## What the feed looks like

An array; each entry is one boss:

```json
{
  "name": "Shadow Landorus (Incarnate)",
  "tier": "5-Star Raids",
  "canBeShiny": true,
  "types": [{ "name": "ground", "image": "…" }, { "name": "flying", "image": "…" }],
  "combatPower": { "normal": { "min": 1984, "max": 2050 }, "boosted": { "min": 2480, "max": 2563 } },
  "boostedWeather": [{ "name": "sunny", "image": "…" }, { "name": "windy", "image": "…" }],
  "image": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm645.fINCARNATE.icon.png"
}
```

- `tier` is the text of the heading on Leek Duck's page, as written there. Seen so far: `1-Star Raids`, `3-Star Raids`, `5-Star Raids`, `Mega Raids`. The headings for the rarer kinds have not been seen (mega legendary, super mega, elite, primal, EX, and whether shadow raids ever get headings of their own).
- A shadow raid is listed under the ordinary heading with `Shadow ` in front of the name.
- `image` is the address of the boss's picture. Its file name follows the game's asset naming: `pm<dex>.icon.png`, `pm<dex>.f<FORM>.icon.png` (`pm645.fINCARNATE`, `pm9.fMEGA`, `pm25.fGLASS_HELMET_2026`), possibly with more dot-separated parts (`.c<COSTUME>`, `.s` for shiny, `.g2`). Older pictures on Leek Duck use another scheme (`pokemon_icon_645_11.png`), which says nothing usable.
- `types`, `combatPower` and `boostedWeather` are not read: Pine computes them from the game master.

## Decisions

1. **Identity from the picture, then from the name.** The Pokédex number in the file name gives the species (`speciesId(dex)`, the game-master species id such as `LANDORUS`); a form part gives the form id `<SPECIES>_<FORM>` (`LANDORUS_INCARNATE`, `BLASTOISE_MEGA`, `PIKACHU_GLASS_HELMET_2026`), which is exactly what the old feed had in `form`, so `resolveBoss` and the aliases keep working. When the file name does not follow the scheme, or its number is unknown, the display name is looked up (`findByName(name)`, an exact-name search of the catalogue, without the `Shadow ` prefix): a hit gives the entry's species and form ids. When neither works the boss is still kept, under an id made from its name (upper case, non-alphanumerics to `_`, at most 64 characters, starting with a letter), so it is listed by the feed's name without stats, as a boss newer than the game master always was.
2. **Shadow** is read from the name prefix `Shadow ` (any case) and the prefix is removed from the name. If a heading ever says shadow itself (`Shadow 5-Star Raids`, `5-Star Shadow Raids`), that counts too. A level that has no shadow raids (see `raidTier`) with a shadow name is reported as an unknown level and its boss left out.
3. **Tier labels** are matched without regard to case, extra spaces or a trailing `Raids`/`Raid`: `1-Star`, `3-Star`, `5-Star` (also `Tier 1` and so on) are T1, T3, T5; `Mega` is Mega; `Mega Legendary` and `Legendary Mega` are MegaLegendary; `Primal` is MegaLegendary; `Super Mega` is SuperMega; `Elite` is Elite; `EX` is EX; `Ultra Beast` is T5. Any other label is reported in `unknownLevels` (bounded in number and length as today) and its bosses are left out, so a new heading shows up in the log instead of silently losing or misfiling bosses.
4. **A costume the game master does not know** (`Astronaut Pikachu`, form `PIKACHU_GLASS_HELMET_2026`) must still be Pikachu with Pikachu's stats. `resolveBoss` today accepts an unknown form only when the feed calls the boss exactly by the species' name; ScrapedDuck's names carry the costume. So the parser hands `resolveBoss` what it needs: for a form the catalogue does not have, a boss whose picture names a known species resolves to that species unless the form part is one of the game's form-changing kinds that the catalogue would know (`MEGA`, `MEGA_X`, `MEGA_Y`, `PRIMAL`): a new mega must stay unresolved, a new costume must not. Implement this where it is cleanest (a flag on `FeedBoss` such as `costume: true`, or the parser dropping an unknown non-mega form): the requirement is the behaviour, and the old rule's safety ("nobody is shown the stats of the wrong Pokémon") must hold for megas and for forms with stats of their own.
5. **The name stored** for a boss is the feed's name without the `Shadow ` prefix, cleaned as today (control and format characters, white space, at most 100 characters). It is shown only when the catalogue has no entry.
6. **The picture address** goes through the check that exists (`imageAddress`): `cdn.leekduck.com` addresses pass it.
7. **Validation:** the document must be an array with at least one entry that has a string `name` and a string `tier`; an entry that is not an object or lacks either is skipped; at most 200 entries per label; a feed from which no boss can be read is refused (the last good list stays), as today.
8. **Settings:** `settings.raidBosses.url` becomes `https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.min.json` in `data/settings.json` and `test/fixtures/settings.json`. Nothing else in the settings changes.
9. **Stored rows:** bosses stored from the old feed are simply replaced at the first sync (rows whose ids no longer appear become inactive, as with any change of the list). No migration.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS or the legacy `data/*.json` files other than `data/settings.json`, never read `.env`.
- `src/domain/` stays pure: the parser gets its look-ups as function parameters; it does not import the catalogue's service.
- Tests never use the network. The fixture is a file in `test/fixtures/`.
- TDD: for every behaviour, the test first, seen failing, then the code. `npm run check` green before each commit; database tests touched by a task are run for that file only (Docker is running).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; stage by explicit path; never stage `.idea/`, `var/`, `.env`.

## Review Focus

1. A heading Pine has never seen (`Elite Raids`, `Mega Legendary Raids`, `Shadow Raids`, an empty string, a very long string): its bosses are left out and the label is reported; nothing else of the feed is lost.
2. A picture address that does not follow the scheme, has an unknown number, or is missing: the name look-up decides; a boss found by neither is still listed by name.
3. Names: `Shadow Landorus (Incarnate)` against the catalogue's `Landorus (Incarnate Forme)`; `Mega Charizard X`; a costume name; `Shadow` in other cases; a name that is only `Shadow`.
4. A new mega the game master does not know (`pm999.fMEGA`, or a known species with `fMEGA` when the catalogue has no mega for it) must not get the base species' stats; a new costume must.
5. The same Pokémon listed twice (a costume beside the plain one; a boss under two headings) keeps today's merging and shiny rules.

---

### Task 1: The reader

**Files:** modify `src/domain/pogo/raid-boss-feed.ts` and `raid-boss-feed.test.ts`; `src/domain/pogo/raid-bosses.ts` and its test where decision 4 needs it; replace `test/fixtures/raid-boss-feed.json` by a copy of `var/game-data-source/scrapedduck-raids-2026-10-11.json` (keep every field of the 14 entries; it is small); `test/support/raid-bosses.ts` (`readRaidBossFeed`, `raidBossesFixture` and whatever passes the look-ups).

**Interfaces:**
- Produces: `parseRaidBossFeed(raw: unknown, lookup: FeedLookup): ParsedFeed`, where `FeedLookup` is `{ speciesId(dex: number): string | undefined; findByName(name: string): { pokemonId: string; form: string | null } | undefined }`; a helper `feedLookup(catalogue: PokemonCatalogue): FeedLookup` (in `src/domain/pogo/`, next to the catalogue, so the service and the tests build it the same way). `FeedBoss` and `ParsedFeed` keep their shape (plus what decision 4 needs).
- The fixture's 14 bosses must come out as the same bosses as before: the same catalogue keys, tiers, shadow flags and shiny flags as the tests of `raidBossesFixture()` users expect today (`pikachu` T1, the four shadow T1 bosses, `gothitelle`, `starmie`, `umbreon` T3, three shadow T3 bosses, `yveltal` T5, `landorus_incarnate` shadow T5, `blastoise_mega` Mega), each with its Leek Duck picture.

- [ ] **Step 1:** Rewrite `raid-boss-feed.test.ts` for the new format: the downloaded fixture (every boss, tier, shadow, shiny, ids, picture), the decisions above one by one, and Review Focus 1 to 5. Keep the existing tests whose subject is unchanged (name cleaning, pictures, limits, duplicates) by giving them input in the new shape. See them fail.
- [ ] **Step 2:** Implement. Remove what only the old format needed (`FEED_LEVELS` keyed by `lvl1`…, the `currentList` schema).
- [ ] **Step 3:** Make every other test that used the old fixture or the old parser signature pass (`raid-bosses.test.ts`, test support, the renderer and command tests that rely on `raidBossesFixture()`): their expectations about WHICH bosses exist must not need changing; picture addresses in expectations change host.
- [ ] **Step 4:** `npm run check`; commit `Raid bosses: read ScrapedDuck's raid list`.

### Task 2: The service, the settings and the check script

**Files:** `src/services/raid-boss-service.ts` and its test (the service builds the look-up from the catalogue in use at the moment of a sync and passes it to the parser; its tests' hand-made feeds take the new shape); `data/settings.json`, `test/fixtures/settings.json` (decision 8); `scripts/raid-bosses/check-feed.ts` (prints the list Pine makes of the live feed: unchanged in purpose; it must also print every unknown label and every boss that was found only by name or not at all); `src/config/settings.ts` (the comment on `raidBosses.url`).

- [ ] **Step 1:** Tests first where behaviour is new: a sync whose catalogue lacks a species still lists that boss by name; the unknown-label warning is logged once per label; a response in the OLD format (an object with `currentList`) is rejected as not the feed and the list in use stays.
- [ ] **Step 2:** Implement; adapt the rest of the service's tests mechanically (they build feeds with a helper: change the helper).
- [ ] **Step 3:** `npm run check`; commit `Raid bosses: the feed is ScrapedDuck's; pokemon-go-api is dropped`.
- [ ] **Step 4 (controller, not the implementer):** `npm run raid-bosses:check` against the live feed (a network read, no Discord) and compare with the expected 14 bosses.

### Task 3: Documents

**Files:** the spec's section 6.7 (replace the "Feed" bullets by the new source and add an "As built (Phase 2C-2)" line), `CLAUDE.md` (the bullet on raid bosses names the feed; the status line), `docs/superpowers/plans/phase-0-follow-ups.md` (remove the bullet this plan carries out from "From Phase 2C"; add "From Phase 2C-2": the rarer headings not yet seen, and anything the review parked), `docs/superpowers/gantt.html`.

- [ ] Done by the controller after the whole-branch review.

## After the last task

1. Whole-branch review (Opus, high effort) of the two code commits; one fix wave if it finds something.
2. `npm run test:db` once; `npm run raid-bosses:check` once.
3. Task 3, memory, the ledger.

## As built (2026-10-11)

Commits `9f92503` and `60815cb` (Tasks 1 and 2), then `c18ad81`, `0eb693e` and `e8a4d1b` from the reviews. Decision 1 and decision 4 above were replaced by one rule (`matchBoss`): a boss gets a catalogue entry only when the picture's file name and the display name do not contradict each other; a picture without a form defers to a name the catalogue knows; a costume is accepted only with a year in its form part and the species' name in the boss's name; under a mega heading only a mega or primal form is accepted; otherwise the boss is unresolved, and it keeps the picture's ids when the picture names a known species, so that nothing changes for it when the game master learns the form. `raid-boss-sweep.test.ts` checks every catalogue entry through the parser and through `resolveBoss`. Open items: "From Phase 2C-2" in `phase-0-follow-ups.md`.
