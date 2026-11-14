import { describe, expect, it } from 'vitest';
import { NEIGHBOR_GYMS, neighborGymsWith } from '../../test/support/neighbor-gyms.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import { NeighborMatches } from './neighbor-matches.js';

/** The directory's reads, counted: the gyms of each server read for the matches. */
function counted(directory: Awaited<ReturnType<typeof neighborGymsWith>>['directory']) {
  const reads = new Map<number, number>();
  return {
    reads,
    gyms: {
      gymsOf: (guildId: number): Iterable<Gym> => {
        reads.set(guildId, (reads.get(guildId) ?? 0) + 1);
        return directory.gymsOf(guildId);
      },
      generationOf: (guildId: number) => directory.generationOf(guildId),
      regionsIn: (guildId: number, gymId: number) => directory.regionsIn(guildId, gymId),
    },
  };
}

describe('NeighborMatches (plan 19E)', () => {
  it('finds the same gym in a neighbor’s gyms, both ways, inside both servers’ regions', async () => {
    const made = await neighborGymsWith();
    const { ours, theirs, third } = made.rows;
    const matches = new NeighborMatches({ gyms: made.directory });
    expect(matches.sameGym(ours, 1, theirs)).toBe(NEIGHBOR_GYMS.library);
    expect(matches.sameGym(theirs, NEIGHBOR_GYMS.library, ours)).toBe(1);
    expect(matches.sameGym(ours, 2, theirs)).toBe(NEIGHBOR_GYMS.fountain);
    // One row both servers have is the same gym.
    expect(matches.sameGym(ours, 4, theirs)).toBe(4);
    // Another name at the same place, and a place outside the regions, are none.
    expect(matches.sameGym(ours, 7, theirs)).toBeUndefined();
    expect(matches.sameGym(ours, 10, theirs)).toBeUndefined();
    // The third server's library, for a pair of its own.
    expect(matches.sameGym(ours, 1, third)).toBe(201);
    expect(matches.sameGym(theirs, NEIGHBOR_GYMS.library, third)).toBe(201);
    expect(matches.matchedGyms(ours, theirs)).toEqual(
      new Map([
        [1, NEIGHBOR_GYMS.library],
        [2, NEIGHBOR_GYMS.fountain],
        [4, 4],
      ]),
    );
  });

  it('reads two servers’ gyms once per pair, and again only when either’s gyms change', async () => {
    const made = await neighborGymsWith();
    const { ours, theirs, third } = made.rows;
    const source = counted(made.directory);
    const matches = new NeighborMatches({ gyms: source.gyms });
    matches.sameGym(ours, 1, theirs);
    matches.sameGym(theirs, NEIGHBOR_GYMS.fountain, ours);
    matches.sameGym(ours, 2, theirs);
    expect(matches.rebuilt).toBe(1);
    expect(source.reads).toEqual(
      new Map([
        [ours, 1],
        [theirs, 1],
      ]),
    );
    // A change of the third server's gyms rebuilds nothing of the pair.
    made.gyms.link(201, third);
    await made.directory.refreshGym(201);
    matches.sameGym(ours, 1, theirs);
    expect(matches.rebuilt).toBe(1);
    // A gym of the neighbor's renamed: built anew, and the library is another gym now.
    await made.gyms.update(NEIGHBOR_GYMS.library, { name: 'Branch Library' });
    await made.directory.refreshGym(NEIGHBOR_GYMS.library);
    expect(matches.sameGym(ours, 1, theirs)).toBeUndefined();
    expect(matches.rebuilt).toBe(2);
    // A removal too: the shared row leaves the second server.
    made.directory.unlink(4, theirs);
    expect(matches.sameGym(ours, 4, theirs)).toBeUndefined();
    expect(matches.rebuilt).toBe(3);
  });

  it('reads a server’s gyms once per change of them, for all its pairs (review R9)', async () => {
    const made = await neighborGymsWith();
    const { ours, theirs, third } = made.rows;
    const source = counted(made.directory);
    const matches = new NeighborMatches({ gyms: source.gyms });
    matches.sameGym(ours, 1, theirs);
    matches.sameGym(ours, 1, third);
    matches.sameGym(theirs, NEIGHBOR_GYMS.library, third);
    expect(source.reads).toEqual(
      new Map([
        [ours, 1],
        [theirs, 1],
        [third, 1],
      ]),
    );
    // The neighbor's gyms change: its list is read again, once, and ours not.
    await made.gyms.update(NEIGHBOR_GYMS.library, { name: 'Branch Library' });
    await made.directory.refreshGym(NEIGHBOR_GYMS.library);
    matches.sameGym(ours, 1, theirs);
    matches.sameGym(theirs, NEIGHBOR_GYMS.library, third);
    expect(source.reads.get(theirs)).toBe(2);
    expect(source.reads.get(ours)).toBe(1);
  });

  it('keeps a pair’s matches through another server’s region edit (review R9)', async () => {
    const made = await neighborGymsWith();
    const { ours, theirs } = made.rows;
    const matches = new NeighborMatches({ gyms: made.directory });
    matches.sameGym(ours, 1, theirs);
    expect(matches.rebuilt).toBe(1);
    // The third server's region moves: the directory reads every region again.
    made.regions.rows = made.regions.rows.map((region) =>
      region.guildId === made.rows.third
        ? { ...region, bounds: [...(region.bounds ?? [])].reverse() }
        : region,
    );
    await made.directory.load();
    expect(matches.sameGym(ours, 1, theirs)).toBe(NEIGHBOR_GYMS.library);
    expect(matches.rebuilt).toBe(1);
  });

  it('says which gyms of a pair gained or lost a match since it last said (review R9)', async () => {
    const made = await neighborGymsWith();
    const { ours, theirs } = made.rows;
    const matches = new NeighborMatches({ gyms: made.directory });
    // A render builds the pair first: what is said after is against what it showed.
    matches.sameGym(ours, 1, theirs);
    expect(matches.changesOf(ours, theirs)).toEqual(
      new Map([
        [ours, []],
        [theirs, []],
      ]),
    );
    // The neighbor's harbor takes the Wayfarer id ours has: both gain a match.
    await made.gyms.update(7, { pogoId: 'harbor.16' });
    await made.gyms.update(NEIGHBOR_GYMS.harbor, { pogoId: 'harbor.16' });
    await made.directory.refreshGyms([7, NEIGHBOR_GYMS.harbor]);
    // A render asks first: the change is still said after it.
    expect(matches.sameGym(ours, 7, theirs)).toBe(NEIGHBOR_GYMS.harbor);
    expect(matches.changesOf(theirs, ours)).toEqual(
      new Map([
        [ours, [7]],
        [theirs, [NEIGHBOR_GYMS.harbor]],
      ]),
    );
    expect(matches.changesOf(ours, theirs)).toEqual(
      new Map([
        [ours, []],
        [theirs, []],
      ]),
    );
  });

  it('says every matched gym of a pair it first builds itself, as after a start (review RR3)', async () => {
    const made = await neighborGymsWith();
    const { ours, theirs } = made.rows;
    const matches = new NeighborMatches({ gyms: made.directory });
    // The first change after a start: no render built the pair since, and the posts were drawn
    // before it, so every gym of both with a match is said, once.
    await made.gyms.update(7, { pogoId: 'harbor.16' });
    await made.gyms.update(NEIGHBOR_GYMS.harbor, { pogoId: 'harbor.16' });
    await made.directory.refreshGyms([7, NEIGHBOR_GYMS.harbor]);
    expect(matches.changesOf(ours, theirs)).toEqual(
      new Map([
        [ours, [1, 2, 4, 7]],
        [theirs, [4, NEIGHBOR_GYMS.library, NEIGHBOR_GYMS.fountain, NEIGHBOR_GYMS.harbor]],
      ]),
    );
    expect(matches.changesOf(theirs, ours)).toEqual(
      new Map([
        [ours, []],
        [theirs, []],
      ]),
    );
  });

  it('lets go of a deleted server’s pairs and gyms, and of no other’s (plan 19C-3)', async () => {
    const made = await neighborGymsWith();
    const { ours, theirs, third } = made.rows;
    const source = counted(made.directory);
    const matches = new NeighborMatches({ gyms: source.gyms });
    matches.sameGym(ours, 1, theirs);
    matches.sameGym(ours, 1, third);
    expect(matches.rebuilt).toBe(2);
    matches.forgetRow(theirs);
    // The other pair is kept as it was; the deleted server's is built anew if ever asked.
    matches.sameGym(ours, 1, third);
    expect(matches.rebuilt).toBe(2);
    matches.sameGym(ours, 1, theirs);
    expect(matches.rebuilt).toBe(3);
    expect(source.reads.get(theirs)).toBe(2);
    expect(source.reads.get(ours)).toBe(1);
  });

  it('finds a Power Spot in both servers’ kept Wayspots and regions by its Wayfarer id', () => {
    const kept = new Map([
      [1, new Set(['spot.16', 'outside.16'])],
      [2, new Set(['spot.16', 'outside.16'])],
      [3, new Set<string>()],
    ]);
    const matches = new NeighborMatches({
      gyms: { gymsOf: () => [], generationOf: () => '0', regionsIn: () => [] },
      spots: {
        regionsIn: (guildId, id) =>
          kept.get(guildId)?.has(id) === true && id !== 'outside.16' ? ['region'] : [],
      },
    });
    expect(matches.sameSpot(1, 'spot.16', 2)).toBe(true);
    expect(matches.sameSpot(2, 'spot.16', 1)).toBe(true);
    expect(matches.sameSpot(1, 'spot.16', 3)).toBe(false);
    expect(matches.sameSpot(1, 'outside.16', 2)).toBe(false);
  });
});
