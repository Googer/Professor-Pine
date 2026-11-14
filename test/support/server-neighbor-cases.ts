import { beforeEach, describe, expect, it } from 'vitest';
import type { ServerNeighborStorage } from '../../src/db/repositories/server-neighbor-repository.js';
import { neighborPair, type NeighborRow } from '../../src/domain/servers/neighbors.js';

/** Two servers that become neighbors, and a third that is neither's neighbor. */
export const NEIGHBOR_ASH = '412345678901234501';
export const NEIGHBOR_BROCK = '412345678901234502';
export const NEIGHBOR_MISTY = '412345678901234503';
export const NEIGHBOR_NOW = Date.parse('2026-11-14T15:00:00Z');

/** A request of Ash's to Brock, unanswered. */
export function neighborRow(overrides: Partial<NeighborRow> = {}): NeighborRow {
  return {
    ...neighborPair(NEIGHBOR_ASH, NEIGHBOR_BROCK),
    askedBy: NEIGHBOR_ASH,
    askedAt: NEIGHBOR_NOW - 60_000,
    acceptedAt: null,
    declinedAt: null,
    toldAt: null,
    withdrawnAt: null,
    ...overrides,
  };
}

/**
 * What every `ServerNeighborStorage` does (`ServerNeighborRepository`, `MemoryServerNeighbors`):
 * `fresh` gives an empty one.
 */
export function serverNeighborCases(fresh: () => Promise<ServerNeighborStorage>): void {
  describe('ServerNeighborStorage', () => {
    let store: ServerNeighborStorage;
    beforeEach(async () => {
      store = await fresh();
    });

    it('keeps no pair until one is written', async () => {
      expect(await store.all()).toEqual([]);
    });

    it('keeps one row per pair, the last written', async () => {
      await store.put(neighborRow());
      const misty = { ...neighborRow(), ...neighborPair(NEIGHBOR_MISTY, NEIGHBOR_ASH) };
      await store.put(misty);
      const accepted = neighborRow({ acceptedAt: NEIGHBOR_NOW });
      await store.put(accepted);
      expect(await store.all()).toEqual([accepted, misty]);
    });

    it('keeps when the other was told and when a request was taken back (review R2)', async () => {
      const withdrawn = neighborRow({
        toldAt: NEIGHBOR_NOW - 30_000,
        withdrawnAt: NEIGHBOR_NOW - 10_000,
      });
      await store.put(withdrawn);
      expect(await store.all()).toEqual([withdrawn]);
    });

    it('deletes the pairs named alone', async () => {
      const misty = {
        ...neighborRow({ declinedAt: NEIGHBOR_NOW }),
        ...neighborPair(NEIGHBOR_BROCK, NEIGHBOR_MISTY),
        askedBy: NEIGHBOR_MISTY,
      };
      await store.put(neighborRow());
      await store.put(misty);
      await store.remove([neighborPair(NEIGHBOR_ASH, NEIGHBOR_BROCK)]);
      expect(await store.all()).toEqual([misty]);
    });
  });
}
