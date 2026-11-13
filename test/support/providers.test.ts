import { describe, expect, it } from 'vitest';
import { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
import { gameDataFixture } from './game-data.js';
import { OTHER_GUILD_ROW, TEST_GUILD_ROW, WEST_CHANNEL } from './gyms.js';
import { createTestContext } from './test-context.js';

describe('the test context', () => {
  it("finds the invented gyms, the test server's (plan 19B-2)", () => {
    const { ctx } = createTestContext();
    const gyms = ctx.gyms.of(TEST_GUILD_ROW);
    expect(gyms.search(WEST_CHANNEL, 'library').map((hit) => hit.gym.id)).toEqual([1]);
    expect(gyms.isRegion(WEST_CHANNEL)).toBe(true);
    expect(ctx.gyms.of(OTHER_GUILD_ROW).search(WEST_CHANNEL, 'library')).toEqual([]);
  });

  it('finds Pokémon of the game-data fixture', () => {
    const { ctx } = createTestContext();
    expect(ctx.pokemon.search('ttar')[0]?.key).toBe('tyranitar');
    expect(ctx.pokemon.search('giratina')[0]).toBe(ctx.gameData.catalogue.byKey('giratina'));
  });

  it('searches the catalogue of the game data it was given', () => {
    const data = gameDataFixture();
    const catalogue = new PokemonCatalogue({
      ...data,
      pokemon: data.pokemon.map((entry) =>
        entry.key === 'mewtwo' ? { ...entry, name: 'Renamed Clone' } : entry,
      ),
    });
    const { ctx } = createTestContext({ gameData: { catalogue } });
    expect(ctx.pokemon.search('renamed clone')[0]).toBe(catalogue.byKey('mewtwo'));
    expect(ctx.pokemon.exact('renamed clone')).toBe(catalogue.byKey('mewtwo'));
  });

  it('has no maps', async () => {
    const { ctx } = createTestContext();
    expect(ctx.maps.enabled).toBe(false);
    expect(await ctx.maps.gym({ id: 1, lat: 40, lon: -80 })).toBeUndefined();
  });
});
