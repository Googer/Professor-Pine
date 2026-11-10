import { CURATED_NICKNAMES } from '../../src/domain/pogo/nicknames.js';
import { PokemonSearch, mergeNicknames } from '../../src/domain/pogo/pokemon-search.js';
import { GymLookup } from '../../src/domain/search/gym-lookup.js';
import type { Gym } from '../../src/db/repositories/gym-repository.js';
import type { Region } from '../../src/db/repositories/region-repository.js';
import type { GymProvider } from '../../src/services/gym-directory.js';
import type { RegionProvider } from '../../src/services/region-directory.js';
import type { PokemonFinder } from '../../src/services/pokemon-search-service.js';
import type { MapProvider } from '../../src/services/static-maps.js';
import { loadSettings } from '../../src/config/settings.js';
import type { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
import type { PokemonEntry } from '../../src/domain/pogo/game-master.js';
import type { GameDataProvider } from '../../src/services/game-data-service.js';
import { catalogueFixture } from './game-data.js';
import { testGyms, testRegions } from './gyms.js';
import { TEST_SETTINGS_PATH } from './test-settings.js';

/**
 * The invented gyms and regions, searchable, with the words the test settings ignore; `extra`
 * gyms beside them for a test that needs more.
 */
export function gymsFixture(extra: readonly Gym[] = []): GymProvider {
  const { blacklistWords } = loadSettings(TEST_SETTINGS_PATH);
  return new GymLookup([...testGyms(), ...extra], testRegions(), blacklistWords);
}

/**
 * The Pokémon search over a game-data provider (default: the fixture) with the curated
 * nicknames. The index is built on first use, and again when the provider's catalogue changes.
 */
export function pokemonFixture(
  gameData: GameDataProvider = { catalogue: catalogueFixture() },
): PokemonFinder {
  let built: { catalogue: PokemonCatalogue; search: PokemonSearch } | undefined;
  const current = (): PokemonSearch => {
    const catalogue = gameData.catalogue;
    if (built?.catalogue !== catalogue) {
      built = {
        catalogue,
        search: new PokemonSearch(catalogue, mergeNicknames(catalogue, CURATED_NICKNAMES)),
      };
    }
    return built.search;
  };
  return {
    search: (text, options) => current().search(text, options),
    find: (text, options) => current().find(text, options),
    exact: (text): PokemonEntry | undefined => current().exact(text),
  };
}

/** Maps as they are without a Google API key: none. */
export function mapsFixture(): MapProvider {
  return {
    enabled: false,
    gym: () => Promise.resolve(undefined),
    region: () => Promise.resolve(undefined),
    place: () => Promise.resolve(undefined),
    clear: () => Promise.resolve(0),
  };
}

/**
 * The invented regions: West and East with their forums, and one without outline or forum; or
 * the regions given (`boardedRegions`: West and East with their boards).
 */
export function regionsFixture(regions: readonly Region[] = testRegions()): RegionProvider {
  return {
    byId: (id) => regions.find((region) => region.id === id),
    byChannel: (channelId) => regions.find((region) => region.channelId === channelId),
    byForum: (forumId) => regions.find((region) => region.forumChannelId === forumId),
    all: () => regions,
  };
}
