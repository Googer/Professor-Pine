import { expect, it } from 'vitest';
import type { PineStopStorage } from '../../src/db/repositories/pine-stop-repository.js';
import type { NewPineStop } from '../../src/domain/stops/pine-stop.js';

export const STOP_SERVER = '100000000000000021';
export const OTHER_STOP_SERVER = '100000000000000022';
export const STAFF = '200000000000000051';
export const STOP_ADDED_AT = Date.UTC(2026, 9, 21, 15);

/** A sponsored stop added by staff to `STOP_SERVER`. */
export function newPineStop(overrides: Partial<NewPineStop> = {}): NewPineStop {
  return {
    serverId: STOP_SERVER,
    name: 'Coffee Corner (sponsored)',
    lat: 40.4412,
    lon: -79.9961,
    address: '12 Market Street',
    createdBy: STAFF,
    createdAt: STOP_ADDED_AT,
    ...overrides,
  };
}

/**
 * What the stops of Pine's own do, run against the repository and its twin in memory alike.
 * `made` gives a fresh, empty store.
 */
export function pineStopCases(made: () => Promise<PineStopStorage>): void {
  it('adds stops, each with an id, and reads them all back', async () => {
    const store = await made();
    const one = await store.add(newPineStop());
    const two = await store.add(newPineStop({ serverId: OTHER_STOP_SERVER, address: null }));
    expect(one).toEqual({
      ...newPineStop(),
      id: one.id,
      updatedBy: STAFF,
      updatedAt: STOP_ADDED_AT,
    });
    expect(two.id).not.toBe(one.id);
    expect(await store.all()).toEqual([one, two]);
  });

  it('changes a stop of its own server only', async () => {
    const store = await made();
    const one = await store.add(newPineStop());
    expect(await store.update(one.id, OTHER_STOP_SERVER, { name: 'Elsewhere' }, STAFF, 1)).toBe(
      undefined,
    );
    const changed = await store.update(
      one.id,
      STOP_SERVER,
      { name: 'Coffee Corner', address: null },
      '200000000000000052',
      STOP_ADDED_AT + 60_000,
    );
    expect(changed).toEqual({
      ...one,
      name: 'Coffee Corner',
      address: null,
      updatedBy: '200000000000000052',
      updatedAt: STOP_ADDED_AT + 60_000,
    });
    expect(await store.all()).toEqual([changed]);
  });

  it('removes a stop of its own server only, once', async () => {
    const store = await made();
    const one = await store.add(newPineStop());
    expect(await store.remove(one.id, OTHER_STOP_SERVER)).toBeUndefined();
    expect(await store.remove(one.id, STOP_SERVER)).toEqual(one);
    expect(await store.remove(one.id, STOP_SERVER)).toBeUndefined();
    expect(await store.all()).toEqual([]);
  });
}
