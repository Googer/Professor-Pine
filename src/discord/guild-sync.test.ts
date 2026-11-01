import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { GuildStore } from '../db/repositories/guild-repository.js';
import { syncGuilds } from './guild-sync.js';

describe('syncGuilds', () => {
  it('ensures every guild and logs failures without stopping', async () => {
    const { log, entries } = createTestLogger();
    const ensured: string[] = [];
    const store: GuildStore = {
      ensure: (id) =>
        id === 'bad' ? Promise.reject(new Error('db down')) : Promise.resolve(ensured.push(id)),
      remove: () => Promise.resolve(),
    };
    await syncGuilds(store, ['a', 'bad', 'b'], log);
    expect(ensured).toEqual(['a', 'b']);
    expect(entries.some((e) => e.msg === 'could not record guild' && e.guild === 'bad')).toBe(true);
  });
});
