import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
import type { GameData } from '../../src/domain/pogo/game-master.js';
import { PokemonIcons } from '../../src/domain/pogo/pokemon-icons.js';

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

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** A whole game master, parsed. Shared between tests, so it is deep-frozen. */
export function gameDataFixture(): GameData {
  snapshot ??= deepFreeze(
    JSON.parse(readFileSync(path.join(fixtures, 'game-data.json'), 'utf8')) as GameData,
  );
  return snapshot;
}

let catalogue: PokemonCatalogue | undefined;

/**
 * The catalogue of the whole fixture, shared between tests (it is read-only). One instance
 * matters: the raid bosses' name index (`feedLookupOf`) is built once per catalogue, and
 * building it for every call was most of the unit suite's time.
 */
export function catalogueFixture(): PokemonCatalogue {
  catalogue ??= new PokemonCatalogue(gameDataFixture());
  return catalogue;
}

let icons: PokemonIcons | undefined;

/**
 * The game's icon files that exist, as the listing of 2026-10-12 named them (the fixture
 * pokemon-icons.json; see scripts/game-data/make-fixtures.ts). Shared between tests.
 */
export function iconsFixture(): PokemonIcons {
  icons ??= new PokemonIcons(
    JSON.parse(readFileSync(path.join(fixtures, 'pokemon-icons.json'), 'utf8')) as string[],
  );
  return icons;
}
