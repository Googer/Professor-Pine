import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import type { AppContext } from '../../app-context.js';
import { chosenPokemon } from './boss-input.js';

const BERLIN = 'Europe/Berlin';

/** The admin lists of a feed whose boss `BRANDNEWMON` only Berlin's rotations in force list. */
function ctxWithBerlinBoss(): AppContext {
  const brandnew = { pokemonId: 'BRANDNEWMON', form: null, name: 'Brandnewmon' };
  return {
    gameData: { catalogue: catalogueFixture() },
    raidBossAdmin: {
      feedBosses: (zone?: string) => (zone === BERLIN ? [brandnew] : []),
      overrides: () => [],
    },
    maxBossAdmin: { feedBosses: () => [], overrides: () => [] },
  } as unknown as AppContext;
}

describe('chosenPokemon (fix round 1, L6)', () => {
  it('finds a boss the list offered by its ids in the feed as the server sees it', () => {
    const ctx = ctxWithBerlinBoss();
    expect(chosenPokemon(ctx, 'ids:BRANDNEWMON', BERLIN).label).toBe('Brandnewmon');
    expect(() => chosenPokemon(ctx, 'ids:BRANDNEWMON', 'America/New_York')).toThrow(
      'That boss is no longer in the feed. Pick again from the list.',
    );
  });
});
