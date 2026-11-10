import { expect, it } from 'vitest';
import type { GymLookups } from '../../src/services/gym-lookups.js';

/**
 * What the line of gyms that wait for Google does, run against the repository and its twin in
 * memory alike. `made` gives a fresh, empty line whose gyms 1 to 4 exist.
 */
export function gymLookupCases(made: () => Promise<GymLookups>): void {
  it('gives the gym that waited longest, the lower id first among those queued at once', async () => {
    const lookups = await made();
    expect(await lookups.next()).toBeUndefined();
    await lookups.add(
      [
        { gymId: 3, address: true, rank: 0 },
        { gymId: 2, address: false, rank: 0 },
      ],
      1_000,
    );
    await lookups.add([{ gymId: 1, address: false, rank: 0 }], 2_000);
    expect(await lookups.next()).toEqual({ gymId: 2, address: false });
    expect(await lookups.count()).toBe(3);
    await lookups.remove(2);
    expect(await lookups.next()).toEqual({ gymId: 3, address: true });
    await lookups.remove(3);
    expect(await lookups.next()).toEqual({ gymId: 1, address: false });
  });

  it('gives the gym of the best-ranked region first, whenever it was queued', async () => {
    const lookups = await made();
    await lookups.add([{ gymId: 1, address: false, rank: -1 }], 1_000);
    await lookups.add([{ gymId: 2, address: false, rank: 0.25 }], 2_000);
    await lookups.add([{ gymId: 3, address: false, rank: 1 }], 3_000);
    await lookups.add([{ gymId: 4, address: false, rank: 0.25 }], 1_500);
    expect((await lookups.list()).map((gym) => gym.gymId)).toEqual([3, 4, 2, 1]);
    expect(await lookups.next()).toEqual({ gymId: 3, address: false });
    // The ranks are worked out anew: the gym in no region now has a busy one.
    await lookups.setRanks(
      new Map([
        [1, 2],
        [9, 5],
      ]),
    );
    expect(await lookups.next()).toEqual({ gymId: 1, address: false });
    expect((await lookups.list())[0]).toEqual({
      gymId: 1,
      address: false,
      rank: 2,
      queuedAt: 1_000,
    });
    expect(await lookups.count()).toBe(4);
  });

  it('gives the gym that waited longest of those that wait for their places alone, when asked', async () => {
    const lookups = await made();
    await lookups.add([{ gymId: 1, address: true, rank: 0 }], 1_000);
    expect(await lookups.next({ placesOnly: true })).toBeUndefined();
    await lookups.add([{ gymId: 3, address: false, rank: 0 }], 2_000);
    await lookups.add([{ gymId: 2, address: false, rank: 0 }], 3_000);
    expect(await lookups.next({ placesOnly: true })).toEqual({ gymId: 3, address: false });
    expect(await lookups.next()).toEqual({ gymId: 1, address: true });
  });

  it('passes over the gyms set aside', async () => {
    const lookups = await made();
    await lookups.add([{ gymId: 1, address: false, rank: 1 }], 1_000);
    await lookups.add([{ gymId: 2, address: true, rank: 0 }], 2_000);
    await lookups.add([{ gymId: 3, address: false, rank: 0 }], 3_000);
    expect(await lookups.next({ except: new Set([1]) })).toEqual({ gymId: 2, address: true });
    expect(await lookups.next({ placesOnly: true, except: new Set([1]) })).toEqual({
      gymId: 3,
      address: false,
    });
    expect(await lookups.next({ except: new Set([1, 2, 3]) })).toBeUndefined();
    expect(await lookups.next({ except: new Set() })).toEqual({ gymId: 1, address: false });
    expect(await lookups.count()).toBe(3);
  });

  it('notes the gyms Google answered about, until forgotten', async () => {
    const lookups = await made();
    expect(await lookups.asked()).toEqual(new Set());
    await lookups.markAsked(2, 1_000);
    await lookups.markAsked(3, 1_000);
    await lookups.markAsked(2, 2_000);
    expect(await lookups.asked()).toEqual(new Set([2, 3]));
    await lookups.forgetAsked(2);
    await lookups.forgetAsked(4);
    expect(await lookups.asked()).toEqual(new Set([3]));
    // Apart from the line.
    expect(await lookups.count()).toBe(0);
  });

  it('keeps the place of a gym queued again, and its address when either asks for it', async () => {
    const lookups = await made();
    await lookups.add([{ gymId: 4, address: false, rank: 0 }], 1_000);
    await lookups.add([{ gymId: 1, address: false, rank: 0 }], 2_000);
    await lookups.add([{ gymId: 4, address: true, rank: 0 }], 3_000);
    expect(await lookups.next()).toEqual({ gymId: 4, address: true });
    await lookups.add([{ gymId: 4, address: false, rank: 0 }], 4_000);
    expect(await lookups.next()).toEqual({ gymId: 4, address: true });
    await lookups.setAddress(4, false);
    expect(await lookups.next()).toEqual({ gymId: 4, address: false });
    expect(await lookups.count()).toBe(2);
  });
}
