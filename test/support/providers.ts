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
import type { GymLink } from '../../src/domain/gyms/gym-server.js';
import { ServerGyms } from '../../src/services/server-gyms.js';
import { testGyms, testLinks, testRegions } from './gyms.js';
import { TEST_SETTINGS_PATH } from './test-settings.js';

/**
 * The invented gyms and regions, searchable, with the words the test settings ignore; `extra`
 * gyms beside them for a test that needs more.
 */
export function gymsFixture(
  extra: readonly Gym[] = [],
  options: { links?: readonly GymLink[]; regions?: readonly Region[] } = {},
): TestGyms {
  return gymsOf([...testGyms(), ...extra], options);
}

/**
 * These gyms, searchable, with the words the test settings ignore, each the test server's
 * unless `links` say otherwise, in the invented regions unless `regions` are given.
 */
export function gymsOf(
  gyms: readonly Gym[],
  options: { links?: readonly GymLink[]; regions?: readonly Region[] } = {},
): TestGyms {
  const { blacklistWords } = loadSettings(TEST_SETTINGS_PATH);
  const regions = options.regions ?? testRegions();
  const everything = new GymLookup(gyms, regions, blacklistWords);
  const servers = new ServerGyms(
    gyms,
    options.links ?? testLinks(gyms),
    regions,
    () => blacklistWords,
  );
  return {
    get: (id) => everything.get(id),
    isRegion: (channelId) => everything.isRegion(channelId),
    regionsOf: (gymId) => everything.regionsOf(gymId),
    inRegion: (channelId) => everything.inRegion(channelId),
    search: (channelId, text, searchOptions) => everything.search(channelId, text, searchOptions),
    of: (guildId) => servers.of(guildId),
    stored: (id) => servers.stored(id),
    serversOf: (gymId) => servers.serversOf(gymId),
    remove: (id) => {
      const known = everything.remove(id);
      servers.remove(id);
      return known;
    },
  };
}

/** The gyms of a test, which a test may take a gym out of as a deletion does (`remove`). */
export interface TestGyms extends GymProvider {
  /** Takes the gym out of every view at once. False when there was none. */
  remove(id: number): boolean;
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
