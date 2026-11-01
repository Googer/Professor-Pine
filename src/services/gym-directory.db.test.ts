import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
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
