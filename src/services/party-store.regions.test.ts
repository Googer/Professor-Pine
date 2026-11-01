import { describe, expect, it } from 'vitest';
import { PARTY_NOW, partyStoreWith, testMeetup, testRaid } from '../../test/support/parties.js';
import { RegionClosedError } from './party-store.js';

const ID = (n: number): string => `00000000-0000-4000-8000-00000000000${String(n)}`;

describe('PartyStore: a region that is closed to new parties', () => {
  it('refuses a new party of a closed region, before anything is written', async () => {
    const { store, storage } = await partyStoreWith();
    await store.closeRegion(1);
    await expect(store.add(testRaid({ id: ID(1), regionId: 1 }))).rejects.toThrow(
      RegionClosedError,
    );
    await expect(
      store.addRaidUnlessTaken(testRaid({ id: ID(2), regionId: 1 }), PARTY_NOW),
    ).rejects.toThrow(RegionClosedError);
    expect(storage.writes).toEqual([]);
    expect(store.active()).toEqual([]);
    // Another region is as open as ever.
    await expect(store.add(testMeetup({ id: ID(3), regionId: 2 }))).resolves.toBeDefined();
  });

  it('lets what was under way finish before it says that the region is closed', async () => {
    const { store } = await partyStoreWith();
    const order: string[] = [];
    const first = store.add(testRaid({ id: ID(1), regionId: 1 })).then(() => order.push('added'));
    const closing = store.closeRegion(1).then(() => order.push('closed'));
    // Asked for after the closing: refused, although the first is still on its way.
    const late = store.add(testRaid({ id: ID(2), regionId: 1, gymId: 2 }));
    await expect(late).rejects.toThrow(RegionClosedError);
    await Promise.all([first, closing]);
    expect(order).toEqual(['added', 'closed']);
    // What the closer finds now is all there will ever be.
    expect(store.inRegion(1).map((party) => party.id)).toEqual([ID(1)]);
  });

  it('does not wait for a party that could not be stored', async () => {
    const { store, storage } = await partyStoreWith();
    storage.failing = new Error('connection lost');
    const failed = store.add(testRaid({ id: ID(1), regionId: 1 }));
    await store.closeRegion(1);
    await expect(failed).rejects.toThrow('connection lost');
    expect(store.inRegion(1)).toEqual([]);
  });

  it('closes at once when nothing is under way, and opens again', async () => {
    const { store } = await partyStoreWith();
    await store.closeRegion(7);
    store.reopenRegion(7);
    await expect(store.add(testRaid({ id: ID(1), regionId: 7 }))).resolves.toBeDefined();
  });

  it('still changes and ends the parties of a closed region', async () => {
    const { store } = await partyStoreWith([testRaid({ id: ID(1), regionId: 1 })]);
    await store.closeRegion(1);
    const ended = await store.update(ID(1), (party) => ({
      party: { ...party, status: 'ended' as const },
    }));
    expect(ended?.written).toBe(true);
    expect(store.inRegion(1)).toEqual([]);
  });
});
