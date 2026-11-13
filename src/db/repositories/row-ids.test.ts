import { describe, expect, it } from 'vitest';
import { RowIds } from './row-ids.js';

describe('RowIds', () => {
  it('remembers the rows it saw, a server both ways', () => {
    const ids = new RowIds();
    expect(ids.guild('g1')).toBeUndefined();
    expect(ids.user('u1')).toBeUndefined();
    ids.sawGuild('g1', 7);
    ids.sawUser('u1', 42);
    expect(ids.guild('g1')).toBe(7);
    expect(ids.guildSnowflake(7)).toBe('g1');
    expect(ids.user('u1')).toBe(42);
    expect(ids.guild('g2')).toBeUndefined();
    expect(ids.guildSnowflake(8)).toBeUndefined();
  });

  it('forgets a server both ways, and a member', () => {
    const ids = new RowIds();
    ids.sawGuild('g1', 7);
    ids.sawUser('u1', 42);
    ids.forgetGuild('g1');
    ids.forgetUser('u1');
    expect(ids.guild('g1')).toBeUndefined();
    expect(ids.guildSnowflake(7)).toBeUndefined();
    expect(ids.user('u1')).toBeUndefined();
    // Forgetting what was never seen is nothing.
    ids.forgetGuild('g9');
    ids.forgetUser('u9');
  });

  it('drops the old id of a server that is seen with a new one, without being told to forget', () => {
    const ids = new RowIds();
    ids.sawGuild('g1', 7);
    // Deleted and made again behind the process (the legacy bot left and rejoined).
    ids.sawGuild('g1', 8);
    expect(ids.guild('g1')).toBe(8);
    expect(ids.guildSnowflake(8)).toBe('g1');
    expect(ids.guildSnowflake(7)).toBeUndefined();
    // Seen again with the same id: nothing is dropped.
    ids.sawGuild('g1', 8);
    expect(ids.guildSnowflake(8)).toBe('g1');
  });

  it('takes the newer id of a server whose row was made again', () => {
    const ids = new RowIds();
    ids.sawGuild('g1', 7);
    ids.forgetGuild('g1');
    ids.sawGuild('g1', 8);
    expect(ids.guild('g1')).toBe(8);
    expect(ids.guildSnowflake(8)).toBe('g1');
    expect(ids.guildSnowflake(7)).toBeUndefined();
  });

  it('holds a bounded number of members: the one seen longest ago goes first', () => {
    const ids = new RowIds();
    for (let n = 0; n <= 20_000; n++) ids.sawUser(`u${String(n)}`, n);
    expect(ids.user('u0')).toBeUndefined();
    expect(ids.user('u1')).toBe(1);
    expect(ids.user('u20000')).toBe(20_000);
  });

  it('knows the server of every row it saw, beyond what it remembers (fix round 1, K1)', () => {
    const ids = new RowIds();
    for (let n = 0; n <= 1_000; n++) ids.sawGuild(`g${String(n)}`, n);
    // The memory of a thousand servers dropped the first; the server of its row stays known.
    expect(ids.guildSnowflake(0)).toBeUndefined();
    expect(ids.serverOfRow(0)).toBe('g0');
    expect(ids.serverOfRow(1_000)).toBe('g1000');
    // Forgetting a server (its row deleted, or no longer sure) leaves its row's server known:
    // a row id is never another server's.
    ids.forgetGuild('g1000');
    expect(ids.serverOfRow(1_000)).toBe('g1000');
    // A row known without being seen: what the start reads of the table.
    ids.knowGuildRow('g2000', 2_000);
    expect(ids.serverOfRow(2_000)).toBe('g2000');
    expect(ids.guild('g2000')).toBeUndefined();
    expect(ids.serverOfRow(2_001)).toBeUndefined();
  });

  it('remembers nothing when it is the one a repository has by default', () => {
    RowIds.none.sawGuild('g1', 7);
    RowIds.none.sawUser('u1', 42);
    expect(RowIds.none.guild('g1')).toBeUndefined();
    expect(RowIds.none.guildSnowflake(7)).toBeUndefined();
    expect(RowIds.none.serverOfRow(7)).toBeUndefined();
    expect(RowIds.none.user('u1')).toBeUndefined();
  });
});
