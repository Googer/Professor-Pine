import { MAX_OPS } from '../../src/domain/pogo/max-bosses.js';
import type { MaxTier } from '../../src/domain/pogo/max-tier.js';
import type { FetchFeed } from '../../src/services/boss-feed-service.js';
import { MaxBossService } from '../../src/services/max-boss-service.js';
import { catalogueFixture } from './game-data.js';
import { MAX_FEED_READ_AT, MAX_ZONE, readPokebattlerFeed } from './max-bosses.js';
import { feedReply, MemoryBossStore } from './raid-bosses.js';
import { createTestLogger } from './test-logger.js';

/** `MemoryBossStore` of the max bosses. */
export class MemoryMaxBossStore extends MemoryBossStore<MaxTier> {
  constructor(ids?: { next: number }) {
    super(MAX_OPS, ids);
  }
}

/**
 * A real `MaxBossService` over `MemoryMaxBossStore`, nothing stored yet, its clock at the
 * download of the Pokebattler fixture (`MAX_FEED_READ_AT`, `state.now`). The feed is not
 * downloaded: `state.respond` answers the requests of `sync()` (by default the recorded feed);
 * `restarted()` gives a loaded service over the same store, as after a restart.
 */
export async function maxBossServiceWith(options: { ids?: { next: number } } = {}) {
  const store = new MemoryMaxBossStore(options.ids);
  const { log, entries } = createTestLogger();
  const state = {
    now: MAX_FEED_READ_AT,
    requests: 0,
    respond: (() =>
      Promise.resolve(feedReply(200, JSON.stringify(readPokebattlerFeed())))) as FetchFeed,
  };
  const make = async () => {
    const service = new MaxBossService({
      url: 'https://example.test/raids',
      refreshMs: 360 * 60_000,
      staleAfterMs: 48 * 60 * 60_000,
      zone: MAX_ZONE,
      store,
      gameData: { catalogue: catalogueFixture() },
      fetch: (url, init) => {
        state.requests += 1;
        return state.respond(url, init);
      },
      log,
      now: () => state.now,
    });
    await service.load();
    return service;
  };
  const service = await make();
  return { service, store, state, logged: entries, restarted: make };
}
