import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { GuildStore } from '../db/repositories/guild-repository.js';
import { syncGuilds } from './guild-sync.js';

describe('syncGuilds', () => {
  it('records every server in one call of the store, which writes them in chunks (19D fix round 1, F3)', async () => {
    const { log, entries } = createTestLogger();
    const calls: (readonly string[])[] = [];
    const store: GuildStore = {
      ensure: () => Promise.reject(new Error('one at a time')),
      ensureAll: (ids) => {
        calls.push(ids);
        return Promise.resolve();
      },
    };
    await syncGuilds(store, ['a', 'b', 'c'], log);
    expect(calls).toEqual([['a', 'b', 'c']]);
    expect(entries).toEqual([]);
  });

  it('logs a failure with how many servers it was about, and never rejects', async () => {
    const { log, entries } = createTestLogger();
    const store: GuildStore = {
      ensure: () => Promise.resolve(1),
      ensureAll: () => Promise.reject(new Error('db down')),
    };
    await syncGuilds(store, ['a', 'b'], log);
    expect(entries).toEqual([
      expect.objectContaining({ level: 50, msg: 'could not record the servers', guilds: 2 }),
    ]);
  });

  it('asks nothing for no servers', async () => {
    const { log } = createTestLogger();
    const calls: (readonly string[])[] = [];
    const store: GuildStore = {
      ensure: () => Promise.resolve(1),
      ensureAll: (ids) => {
        calls.push(ids);
        return Promise.resolve();
      },
    };
    await syncGuilds(store, [], log);
    expect(calls).toEqual([]);
  });
});
