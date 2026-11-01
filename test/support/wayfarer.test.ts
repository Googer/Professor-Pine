import { describe, expect, it } from 'vitest';
import type { UnreadableWayfarerRow } from '../../src/db/repositories/wayfarer-repository.js';
import { MemoryWayfarer } from './wayfarer.js';
import { CANDIDATE, wayfarerStorageCases } from './wayfarer-cases.js';

function memorySetup() {
  const unreadable: UnreadableWayfarerRow[] = [];
  const store = new MemoryWayfarer((row) => unreadable.push(row));
  return {
    store,
    unreadable,
    home: 1,
    away: 2,
    gyms: [11, 12, 13] as const,
    spoilReview(id: number, columns: { kind?: string; candidates?: unknown }) {
      const row = store.reviews.find((review) => review.id === id);
      if (row) Object.assign(row, columns);
      return Promise.resolve();
    },
    spoilImport(id: number, counts: unknown) {
      const row = store.imports.find((stored) => stored.id === id);
      if (row) row.counts = counts;
      return Promise.resolve();
    },
  };
}

describe('MemoryWayfarer', () => {
  wayfarerStorageCases(() => Promise.resolve(memorySetup()));

  it('drops the record and the items of a gym that is deleted, as the foreign keys do', async () => {
    const { store, home } = memorySetup();
    await store.seen([11, 12], 1);
    await store.saveReviews(
      home,
      null,
      [
        { gymId: 11, kind: 'match', candidates: [CANDIDATE] },
        { gymId: 12, kind: 'unknown', candidates: [] },
      ],
      1,
    );
    store.removeGym(11);
    expect([...(await store.records([11, 12])).keys()]).toEqual([12]);
    expect((await store.openReviews(home)).map((item) => item.gymId)).toEqual([12]);
  });

  it('rejects every call while failing', async () => {
    const { store } = memorySetup();
    store.failing = new Error('down');
    await expect(store.nextReview(1)).rejects.toThrow('down');
  });
});
