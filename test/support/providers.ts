import { CURATED_NICKNAMES } from '../../src/domain/pogo/nicknames.js';
import { PokemonSearch, mergeNicknames } from '../../src/domain/pogo/pokemon-search.js';
import type { Gym } from '../../src/db/repositories/gym-repository.js';
import type { Region } from '../../src/db/repositories/region-repository.js';
import type { GymProvider, GymView } from '../../src/services/gym-directory.js';
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
import { FAKE_GUILD_ID } from './fake-interactions.js';
import {
  OTHER_GUILD_ID,
  OTHER_GUILD_ROW,
  TEST_GUILD_ROW,
  testGyms,
  testLinks,
  testRegions,
  wideRegion,
} from './gyms.js';
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
  const servers = new ServerGyms(
    gyms,
    options.links ?? testLinks(gyms),
    regions,
    () => blacklistWords,
  );
  return {
    of: (guildId) => servers.of(guildId),
    stored: (id) => servers.stored(id),
    serversOf: (gymId) => servers.serversOf(gymId),
    get size() {
      return servers.size;
    },
    remove: (id) => servers.remove(id),
    unlink: (id, guildId) => servers.unlink(id, guildId),
  };
}

/**
 * Two servers whose regions overlap (plan 19B-2): the test server with West and East, and the
 * second server (`OTHER_GUILD_ROW`) with Wide over both (`wideRegion`). Gym 2, Old Stone
 * Fountain in West, is the second server's alone; every other invented gym the test server's.
 * From the test server, gym 2 lies in its region West and must be neither offered, accepted nor
 * named; from the second (an interaction of `OTHER_GUILD_ID` in `WIDE_CHANNEL`), gym 2 is there
 * and gym 1 is not. Pass `regions` (the invented ones with Wide) to whatever reads the regions,
 * and `guilds` (each server's row by its snowflake) to the context, for the second server's
 * interactions.
 */
export function twoServerGyms(): {
  gyms: TestGyms;
  regions: Region[];
  guilds: { idFor(snowflake: string): Promise<number | undefined> };
} {
  const regions = [...testRegions(), wideRegion()];
  const links = [
    ...testLinks().filter((link) => link.gymId !== THEIR_GYM),
    { gymId: THEIR_GYM, guildId: OTHER_GUILD_ROW },
  ];
  const rows = new Map([
    [FAKE_GUILD_ID, TEST_GUILD_ROW],
    [OTHER_GUILD_ID, OTHER_GUILD_ROW],
  ]);
  return {
    gyms: gymsFixture([], { links, regions }),
    regions,
    guilds: { idFor: (snowflake) => Promise.resolve(rows.get(snowflake)) },
  };
}

/** The gym of `twoServerGyms` that is the second server's alone: Old Stone Fountain, in West. */
export const THEIR_GYM = 2;

/** A server's view of the gyms with some of its reads replaced (a test's fake of them). */
export function viewWith(base: GymView, overrides: Partial<GymView> = {}): GymView {
  return {
    get: overrides.get ?? ((id) => base.get(id)),
    all: overrides.all ?? (() => base.all()),
    isRegion: overrides.isRegion ?? ((channelId) => base.isRegion(channelId)),
    regionsOf: overrides.regionsOf ?? ((gymId) => base.regionsOf(gymId)),
    inRegion: overrides.inRegion ?? ((channelId) => base.inRegion(channelId)),
    search:
      overrides.search ?? ((channelId, text, options) => base.search(channelId, text, options)),
  };
}

/**
 * A test's fake of the gyms (its own `get` and `regionsOf`) as the gyms of the test server
 * (plan 19B-2): the test server's view reads through the fake, every other server has none, and
 * a stored reference is read by the fake's `get`.
 */
export function asTestServerGyms(fake: {
  get(id: number): object | undefined;
  regionsOf(gymId: number): string[];
  readonly size?: number;
}): {
  get(id: number): Gym | undefined;
  regionsOf(gymId: number): string[];
  readonly size?: number;
} & Pick<GymProvider, 'of' | 'stored' | 'serversOf'> {
  const base = gymsFixture();
  return Object.assign(fake as typeof fake & { get(id: number): Gym | undefined }, {
    of: (guildId: number | undefined) =>
      guildId === TEST_GUILD_ROW
        ? viewWith(base.of(guildId), {
            // A fake whose gyms carry only what posts read stands for whole gyms.
            get: (id: number) => fake.get(id) as Gym | undefined,
            regionsOf: (gymId: number) => fake.regionsOf(gymId),
          })
        : base.of(undefined),
    stored: (id: number) => fake.get(id) as Gym | undefined,
    serversOf: (gymId: number) => (fake.get(gymId) ? [TEST_GUILD_ROW] : []),
  });
}

/**
 * Gyms that lie in other regions than their places say (a gym on the border of West and East):
 * `lying` gives the region channels of those gyms, for the test server's view (plan 19B-2).
 * Every other gym lies where it is.
 */
export function gymsLyingIn(
  lying: Readonly<Record<number, readonly string[]>>,
  base: GymProvider = gymsFixture(),
): GymProvider {
  const regionsOf = (fallback: (gymId: number) => string[]) => (gymId: number) =>
    lying[gymId] === undefined ? fallback(gymId) : [...lying[gymId]];
  return Object.assign(Object.create(base) as GymProvider, {
    of: (guildId: number | undefined) => {
      const view = base.of(guildId);
      return guildId === TEST_GUILD_ROW
        ? viewWith(view, { regionsOf: regionsOf((gymId) => view.regionsOf(gymId)) })
        : view;
    },
  });
}

/**
 * The regions of `base` with the one of this channel given an outline (West's square): a region
 * channel to `regionChannelOf` (`src/discord/guards.ts`), whatever else it lacks, as a region
 * without a forum yet.
 */
export function withOutline<R extends RegionProvider>(base: R, channelId: string): R {
  return Object.assign(Object.create(base) as R, {
    byChannel: (id: string) => {
      const region = base.byChannel(id);
      return region && id === channelId
        ? { ...region, bounds: testRegions()[0]?.bounds ?? null }
        : region;
    },
  });
}

/**
 * The gyms of a test, which a test may take a gym out of as a deletion does (`remove`); `size`,
 * how many gyms of every server there are (`GymDirectory.size`).
 */
export interface TestGyms extends GymProvider {
  readonly size: number;
  /** Takes the gym out of every view at once. False when there was none. */
  remove(id: number): boolean;
  /** Takes the gym out of one server's gyms at once, as a deletion of a shared gym does. */
  unlink(id: number, guildId: number): boolean;
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
