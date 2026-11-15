import { describe, expect, it } from 'vitest';
import { NO_REGION_RANK } from '../domain/geo/google-line.js';
import { GoogleRanks } from './google-ranks.js';

const REGIONS = [
  { id: 1, guildId: 10, channelId: 'north' },
  { id: 2, guildId: 10, channelId: 'south' },
  { id: 3, guildId: 20, channelId: 'other' },
  { id: 4, guildId: null, channelId: 'nobody' },
];
/** The servers the bot is in. */
const SERVERS = ['412345678901234567', '412345678901234568'];

describe('GoogleRanks', () => {
  it('ranks a place by its best region, from the raids of the bot’s servers since 90 days before the moment', async () => {
    const asked: [number, readonly string[]][] = [];
    const now = 100 * 86_400_000;
    const ranks = new GoogleRanks({
      regions: { all: () => REGIONS },
      // Gym 7 lies in North and South, which are server 10's, and is server 20's too, where
      // it lies in no region.
      gymRegions: (guildId, id) =>
        guildId !== 10 ? [] : id === 7 ? ['north', 'south'] : id === 8 ? ['south'] : [],
      // Each server's copy by that server's regions.
      wayspotRegions: (guildId, id) =>
        id === 'aa.16' ? ['nobody'] : id === 'bb.16' && guildId === 20 ? ['other'] : [],
      servers: () => Promise.resolve(SERVERS),
      activity: {
        raidsByRegion: (since, servers) => {
          asked.push([since, servers]);
          return Promise.resolve(
            new Map([
              [1, 10],
              [2, 5],
              [3, 1],
            ]),
          );
        },
      },
      now: () => now,
    });
    // Before the first reading every region ranks the same.
    expect(ranks.ofGym(10, 8)).toBe(1);
    await ranks.refresh();
    // Of the servers the bot is in only (plan 8Z-2, audit X3): the read goes by server.
    expect(asked).toEqual([[10 * 86_400_000, SERVERS]]);
    expect(ranks.ofGym(10, 7)).toBe(1);
    expect(ranks.ofGym(20, 7)).toBe(NO_REGION_RANK);
    expect(ranks.ofGym(10, 8)).toBe(0.5);
    expect(ranks.ofGym(10, 9)).toBe(NO_REGION_RANK);
    expect(ranks.ofWayspot(20, 'bb.16')).toBe(1);
    // Server 10's copy of it lies in no region of server 10's: it does not wait for Google.
    expect(ranks.ofWayspot(10, 'bb.16')).toBeUndefined();
    // A Wayspot in no region of its server is not ranked either.
    expect(ranks.ofWayspot(10, 'aa.16')).toBeUndefined();
    expect(ranks.ofWayspot(10, 'cc.16')).toBeUndefined();
  });

  it('keeps the ranks it had when the history or the servers cannot be read', async () => {
    let failing = false;
    let lost = false;
    const ranks = new GoogleRanks({
      regions: { all: () => REGIONS },
      gymRegions: () => ['south'],
      wayspotRegions: () => [],
      servers: () => (lost ? Promise.reject(new Error('no servers')) : Promise.resolve(SERVERS)),
      activity: {
        raidsByRegion: () =>
          failing
            ? Promise.reject(new Error('no database'))
            : Promise.resolve(
                new Map([
                  [1, 4],
                  [2, 1],
                ]),
              ),
      },
    });
    await ranks.refresh();
    failing = true;
    await expect(ranks.refresh()).rejects.toThrow('no database');
    expect(ranks.ofGym(10, 1)).toBe(0.25);
    failing = false;
    lost = true;
    await expect(ranks.refresh()).rejects.toThrow('no servers');
    expect(ranks.ofGym(10, 1)).toBe(0.25);
  });

  it('ranks a new list of regions at once by the raids last read, without reading them again', async () => {
    let regions: { id: number; guildId: number | null; channelId: string }[] = REGIONS;
    let reads = 0;
    const ranks = new GoogleRanks({
      regions: { all: () => regions },
      gymRegions: () => ['east'],
      wayspotRegions: () => ['east'],
      servers: () => Promise.resolve(SERVERS),
      activity: {
        raidsByRegion: () => {
          reads++;
          return Promise.resolve(
            new Map([
              [1, 10],
              [5, 5],
            ]),
          );
        },
      },
    });
    await ranks.refresh();
    // No region has the channel yet.
    expect(ranks.ofGym(10, 1)).toBe(NO_REGION_RANK);
    expect(ranks.ofWayspot(10, 'aa.16')).toBeUndefined();
    // A region saved (a new list, as a load gives): ranked against its server's busiest at once.
    regions = [...REGIONS, { id: 5, guildId: 10, channelId: 'east' }];
    expect(ranks.ofGym(10, 1)).toBe(0.5);
    expect(ranks.ofWayspot(10, 'aa.16')).toBe(0.5);
    expect(reads).toBe(1);
  });
});
