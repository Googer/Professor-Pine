import { describe, expect, it } from 'vitest';
import {
  at,
  MINUTE,
  PARTY_NOW,
  partyStoreWith,
  TEST_PIN,
  TEST_SPOT,
  testMax,
} from '../../test/support/parties.js';
import { endParty, type MaxSpot } from '../domain/party/party.js';

const ID = (n: number): string => `00000000-0000-4000-8000-00000000010${String(n)}`;

/** Another power spot of the region. */
const OTHER_SPOT: MaxSpot = { ...TEST_SPOT, id: 'beef0000beef0000beef0000beef0000.16' };

/** A pin about 30 m from `TEST_PIN`, and one about 300 m away. */
const NEAR_PIN: MaxSpot = { ...TEST_PIN, lat: 40.00227 };
const FAR_PIN: MaxSpot = { ...TEST_PIN, lat: 40.0047 };

describe('PartyStore: one max battle per spot (plan 8X-3)', () => {
  it('finds the max battle at a Power Spot while its end has not come', async () => {
    const battle = testMax({ id: ID(1), endTime: at('2026-10-13T14:30') });
    const { store } = await partyStoreWith([battle]);
    expect(store.maxAt(1, TEST_SPOT, PARTY_NOW)).toBe(battle);
    expect(store.maxAt(1, OTHER_SPOT, PARTY_NOW)).toBeUndefined();
    // Its end has come: it stands in nobody's way, though its post is still open.
    expect(store.maxAt(1, TEST_SPOT, at('2026-10-13T14:30'))).toBeUndefined();
  });

  it('takes a pin for the spot of an active pin within 50 metres, not one farther', async () => {
    const battle = testMax({ id: ID(1), spot: TEST_PIN });
    const { store } = await partyStoreWith([battle]);
    expect(store.maxAt(1, NEAR_PIN, PARTY_NOW)).toBe(battle);
    expect(store.maxAt(1, FAR_PIN, PARTY_NOW)).toBeUndefined();
    expect(store.maxAt(1, TEST_SPOT, PARTY_NOW)).toBeUndefined();
  });

  it('stores a reported max battle unless its spot has one, and then hands that one back', async () => {
    const { store, storage } = await partyStoreWith();
    const first = testMax({ id: ID(1) });
    await expect(store.addMaxUnlessTaken(first, PARTY_NOW)).resolves.toEqual({
      added: true,
      party: first,
    });
    const second = testMax({ id: ID(2), boss: { key: 'sneasel' }, now: PARTY_NOW + MINUTE });
    await expect(store.addMaxUnlessTaken(second, PARTY_NOW + MINUTE)).resolves.toEqual({
      added: false,
      existing: first,
    });
    expect([...storage.rows.keys()]).toEqual([ID(1)]);
  });

  // Final review F4: a member blocked from meetups at a pin may join the battle there, no more.
  it('stores nothing at a free spot when it may not add, and still hands back the battle there', async () => {
    const { store, storage } = await partyStoreWith();
    const first = testMax({ id: ID(1), spot: TEST_PIN });
    await expect(store.addMaxUnlessTaken(first, PARTY_NOW, { mayAdd: false })).resolves.toEqual({
      added: false,
      existing: undefined,
    });
    expect(storage.rows.size).toBe(0);
    await store.addMaxUnlessTaken(first, PARTY_NOW);
    const second = testMax({ id: ID(2), spot: NEAR_PIN });
    await expect(store.addMaxUnlessTaken(second, PARTY_NOW, { mayAdd: false })).resolves.toEqual({
      added: false,
      existing: first,
    });
  });

  it('lets two reports of one spot at once store one battle: the check and the write are one step', async () => {
    const { store } = await partyStoreWith();
    const outcomes = await Promise.all([
      store.addMaxUnlessTaken(testMax({ id: ID(1) }), PARTY_NOW),
      store.addMaxUnlessTaken(testMax({ id: ID(2) }), PARTY_NOW),
      store.addMaxUnlessTaken(testMax({ id: ID(3), spot: NEAR_PIN }), PARTY_NOW),
      store.addMaxUnlessTaken(testMax({ id: ID(4), spot: TEST_PIN }), PARTY_NOW),
    ]);
    expect(outcomes.map((outcome) => outcome.added)).toEqual([true, false, true, false]);
    expect(store.active().map((party) => party.id)).toEqual([ID(1), ID(3)]);
  });

  // Review A, X3-B-6: a Wayfarer id is the same in every server that has the spot.
  it('lets a battle at the spot stand in the way of its own server only', async () => {
    const elsewhere = testMax({ id: ID(1), guildId: 2 });
    const { store } = await partyStoreWith([elsewhere]);
    expect(store.maxAt(1, TEST_SPOT, PARTY_NOW)).toBeUndefined();
    expect(store.maxAt(2, TEST_SPOT, PARTY_NOW)).toBe(elsewhere);
    const here = testMax({ id: ID(2) });
    await expect(store.addMaxUnlessTaken(here, PARTY_NOW)).resolves.toEqual({
      added: true,
      party: here,
    });
  });

  it('stores a new battle at a spot whose battle has ended, and finds an ended one nowhere', async () => {
    const over = endParty(testMax({ id: ID(1) }));
    const { store } = await partyStoreWith([over]);
    const fresh = testMax({ id: ID(2) });
    await expect(store.addMaxUnlessTaken(fresh, PARTY_NOW)).resolves.toEqual({
      added: true,
      party: fresh,
    });
  });

  it('waits for a spot held by another change in whenIdle', async () => {
    const { store } = await partyStoreWith();
    let release!: () => void;
    const held = store.withSpotLock(TEST_SPOT, () => new Promise<void>((r) => (release = r)));
    let idle = false;
    const waiting = store.whenIdle().then(() => (idle = true));
    await Promise.resolve();
    expect(idle).toBe(false);
    release();
    await held;
    await waiting;
    expect(idle).toBe(true);
  });
});
